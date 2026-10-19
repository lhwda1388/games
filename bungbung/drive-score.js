// 붕붕이 — 주행 채점: 프레임마다 위반을 판정해 감점 이벤트를 돌려주고, 실패(충돌·역주행 5초·도로 이탈)와 도착을 기록한다.
// frame = { t, dt, car: { x, y, th, v, laneId, s(차체 중심), offset(왼쪽 +), dist(차로 중심선까지) },
//   blink(-1 왼쪽|0|1 오른쪽), mirrorL, mirrorR(마지막 확인 시각), collision: null|'car'|'ped'|'wall',
//   others: PP_TRAFFIC.cars(), peds: PP_TRAFFIC.peds(), rerouted: 이번 프레임에 재탐색했는가 }
const PP_DSCORE = (function ppDScore() {
  const R = typeof PP_ROADS !== 'undefined' ? PP_ROADS : require('./roads.js');
  const PL = 4.39; // 셀토스 길이
  const TEXT = {
    blink: '깜빡이를 켜지 않았어요 — 차선 변경·회전 1초 전에는 켜 두세요',
    mirror: '사이드미러를 보지 않았어요 — 차선을 바꾸기 3초 안에 확인하세요',
    solid: '실선에서 차선을 바꿨어요 — 실선 구간에서는 차선 변경 금지예요',
    bus: '버스전용차로 청색 실선을 넘었어요 — 점선 구간에서만 들어갈 수 있어요',
    red: '신호를 위반했어요 — 적색 신호에 정지선을 넘었어요',
    yellow: '황색 신호에 멈출 수 있었는데 지나갔어요',
    left: '좌회전 신호가 아닐 때 좌회전했어요',
    stop: '우회전 전에 일시정지하지 않았어요 — 전방 신호가 적색이면 정지선 앞에서 완전히 멈춰야 해요',
    ped: '횡단보도에 보행자가 있는데 지나갔어요',
    unprotected: '비보호 좌회전은 녹색 신호일 때만 할 수 있어요',
    speed: lim => `제한속도를 넘었어요 (제한 ${lim}km/h)`,
    gap: '앞차와 너무 가까워요 — 1초 이상 간격을 두세요',
    cutin: '뒤차와 너무 가깝게 끼어들었어요',
    route: '안내를 놓쳐 경로를 이탈했어요',
  };
  const FAIL = { car: '다른 차와 충돌했어요', ped: '보행자와 충돌했어요', wall: '구조물에 부딪혔어요', reverse: '역주행했어요', offroad: '도로를 벗어났어요' };

  function create(mission, net = mission.build()) {
    const cwByLane = {};
    for (const cw of net.crosswalks) for (const l of cw.lanes) (cwByLane[l.laneId] = cwByLane[l.laneId] || []).push({ cw, s0: l.s0, s1: l.s1 });
    return { mission, net, cwByLane, t: 0, penalties: [], done: false, failReason: null, prev: null, centerT: 0,
      blinks: [], appr: null, cross: null, cwDone: {}, overT: 0, overHit: false, gapT: 0, gapHit: false, revT: 0, offT: 0 };
  }

  function blinkOk(ds, dir, tStart) {
    return ds.blinks.some(b => b.dir === dir && b.from <= tStart - 1 + 1e-6 && (b.to === null || b.to >= tStart - 1e-6));
  }
  const pedOn = (cw, peds) => (peds || []).some(p => {
    if (p.walking === false) return false;
    const [a, b] = cw.pts, dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    const u = ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / L2;
    return u >= 0 && u <= 1 && Math.abs((p.y - a[1]) * dx - (p.x - a[0]) * dy) / Math.sqrt(L2) <= cw.width / 2 + 0.5;
  });
  // 같은 차로 위 다른 차: 앞차 간격(+) / 뒤차 간격(-)을 차로 s로
  function neighbors(lane, car, others) {
    let lead = null, foll = null;
    for (const o of others || []) {
      const p = R.projectLane(lane, o.x, o.y);
      if (p.dist > lane.width / 2) continue; // dist는 차로 끝 너머까지 포함(offset만 보면 연장선 위 차도 잡힌다)
      if (p.s > car.s) { const g = p.s - o.l / 2 - (car.s + PL / 2); if (g < 80 && (!lead || g < lead.gap)) lead = { gap: g, v: o.v }; }
      else { const g = car.s - PL / 2 - (p.s + o.l / 2); if (g < 40 && (!foll || g < foll.gap)) foll = { gap: g, v: o.v }; }
    }
    return { lead, foll };
  }
  const sameRoadDir = (net, a, b) => {
    for (const side of ['left', 'right']) for (let x = net.lanes[a][side]; x; x = net.lanes[x][side]) if (x === b) return true;
    return a === b;
  };

  function update(ds, f) {
    if (ds.done || ds.failReason) return [];
    const net = ds.net, out = [], car = f.car, lane = net.lanes[car.laneId], v = car.v, prev = ds.prev;
    const pen = (code, text) => { const e = { t: f.t, code, text: text || TEXT[code] }; ds.penalties.push(e); out.push(e); };
    const failWith = k => { ds.failReason = FAIL[k]; ds.t = f.t; };
    ds.t = f.t;
    const last = ds.blinks[ds.blinks.length - 1], curDir = last && last.to === null ? last.dir : 0;
    if (f.blink !== curDir) {
      if (last && last.to === null) last.to = f.t;
      if (f.blink) ds.blinks.push({ dir: f.blink, from: f.t, to: null });
    }
    if (f.collision) { failWith(f.collision); return out; }
    if (!lane) return out;
    const front = car.s + PL / 2;

    if (prev && prev.laneId !== car.laneId) {
      const P = net.lanes[prev.laneId];
      if (P && (P.left === car.laneId || P.right === car.laneId)) {
        const left = P.left === car.laneId, tStart = ds.centerT;
        if (!blinkOk(ds, left ? -1 : 1, tStart)) pen('blink');
        const m = left ? f.mirrorL : f.mirrorR;
        if (!(m >= tStart - 3 && m <= f.t)) pen('mirror');
        if (!R.canChange(net, prev.laneId, car.laneId, prev.s)) pen('solid', P.kind === 'bus' || lane.kind === 'bus' ? TEXT.bus : TEXT.solid);
        const { foll } = neighbors(lane, car, f.others);
        if (foll && foll.v > 1 && foll.gap / foll.v < 1) pen('cutin');
      } else if (lane.kind === 'connector' && lane.from === prev.laneId) {
        const turn = lane.turn;
        if ((turn === 'left' || turn === 'uturn' || turn === 'right') && !blinkOk(ds, turn === 'right' ? 1 : -1, f.t)) pen('blink');
        const c = ds.cross;
        if (c && c.laneId === prev.laneId) {
          const unp = R.signalById(net, c.signal).unprotected, dilemma = c.state === 'Y' && !c.couldStop;
          if (turn === 'right') { if ((c.state === 'R' || (c.state === 'Y' && c.couldStop)) && !(c.minV < 0.3 / 3.6)) pen('stop'); }
          else if (turn === 'straight') { if (c.state === 'R') pen('signal', TEXT.red); else if (c.state === 'Y' && c.couldStop) pen('signal', TEXT.yellow); }
          else if (c.state !== (unp ? 'G' : 'LG') && !dilemma) pen(unp ? 'unprotected' : 'signal', unp ? TEXT.unprotected : TEXT.left);
        }
        ds.cross = null;
      }
      ds.centerT = f.t;
    }
    if (Math.abs(car.offset) <= 0.4) ds.centerT = f.t;

    const st = R.stopOf(net, car.laneId);
    if (st && st.signal) {
      const state = R.signalState(net, f.t, st.signal, car.laneId);
      if (!ds.appr || ds.appr.laneId !== car.laneId) ds.appr = { laneId: car.laneId, minV: Infinity, couldStop: false, last: state, crossed: front >= st.s };
      const A = ds.appr;
      if (!A.crossed) {
        if (front >= st.s - 15 && front < st.s) A.minV = Math.min(A.minV, Math.abs(v));
        if (state === 'Y' && A.last !== 'Y') A.couldStop = v * v / (2 * Math.max(st.s - front, 0.1)) <= 3.0;
        if (front >= st.s) { A.crossed = true; ds.cross = { laneId: car.laneId, state, minV: A.minV, couldStop: A.couldStop, signal: st.signal }; }
      }
      A.last = state;
    }
    for (const x of ds.cwByLane[car.laneId] || []) {
      const key = x.cw.id + '|' + car.laneId, pf = prev && prev.laneId === car.laneId ? prev.front : -Infinity;
      if (!ds.cwDone[key] && pf < x.s0 && front >= x.s0 && front - PL < x.s1) { ds.cwDone[key] = true; if (pedOn(x.cw, f.peds)) pen('stop', TEXT.ped); }
    }

    if (v * 3.6 > lane.limit * 1.1) { ds.overT += f.dt; if (ds.overT >= 2 - 1e-6 && !ds.overHit) { ds.overHit = true; pen('speed', TEXT.speed(lane.limit)); } }
    else { ds.overT = 0; ds.overHit = false; }
    const { lead } = neighbors(lane, car, f.others);
    if (lead && v > 3 && lead.gap / v < 1) { ds.gapT += f.dt; if (ds.gapT >= 3 - 1e-6 && !ds.gapHit) { ds.gapHit = true; pen('gap'); } }
    else { ds.gapT = 0; ds.gapHit = false; }
    if (f.rerouted) pen('route');

    const hd = R.pointAt(lane, car.s).a;
    if (v > 1 && Math.abs(R.wrap(car.th - hd)) > 2.1) { ds.revT += f.dt; if (ds.revT >= 5 - 1e-6) failWith('reverse'); } else ds.revT = 0;
    const dist = car.dist != null ? car.dist : Math.abs(car.offset);
    if (dist > lane.width / 2 + (lane.kind === 'connector' ? 3.5 : 2.5)) { ds.offT += f.dt; if (ds.offT > 1) failWith('offroad'); } else ds.offT = 0;

    const g = ds.mission.goal;
    if (!ds.failReason && net.lanes[g.laneId] && sameRoadDir(net, g.laneId, car.laneId) && R.mapS(net, car.laneId, g.laneId, car.s) >= g.s - 2) ds.done = true;
    ds.prev = { laneId: car.laneId, s: car.s, front };
    return out;
  }

  function result(ds) {
    const r = { passed: ds.done && !ds.failReason, done: ds.done, penalties: ds.penalties.slice(), time: ds.t };
    if (ds.failReason) r.failReason = ds.failReason;
    return r;
  }
  // a가 b보다 좋은 기록인가: 통과 > 감점 수 적음 > 시간 짧음
  function better(a, b) {
    if (!b) return true;
    if (a.passed !== b.passed) return a.passed;
    if (a.penalties.length !== b.penalties.length) return a.penalties.length < b.penalties.length;
    return a.time < b.time;
  }
  return { TEXT, FAIL, create, update, result, better };
})();
if (typeof module !== 'undefined') module.exports = PP_DSCORE;
