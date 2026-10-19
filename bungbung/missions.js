// 붕붕이 — 시내 주행 미션 7개. 치수는 한국 도시부 기준: 차로 폭 3.2m, 제한속도 50km/h, 신호 교차로마다 횡단보도.
// 교차로 팔 길이 H = 교차 도로 한쪽 폭 + 8m(모서리 회전 반경 확보). 팔 도로는 바깥 끝에서 교차로를 향해 진행(fwd = 진입).
const PP_MISSIONS = (function ppMissions() {
  const R = typeof PP_ROADS !== 'undefined' ? PP_ROADS : require('./roads.js');
  const PI = Math.PI, D = PI / 180, W = 3.2, LIM = 50, VMAX = 60 / 3.6;
  const T3 = [['left'], ['straight'], ['straight', 'right']];
  const T2 = [['left', 'straight'], ['straight', 'right']];
  const T2S = [['straight'], ['straight', 'right']];
  const half = lanes => lanes * W + 8;

  function arm(net, id, cx, cy, deg, H, len, inN, outN, o = {}) {
    const d = deg * D;
    return R.straightRoad(net, Object.assign({ id, x: cx + Math.cos(d) * (H + len), y: cy + Math.sin(d) * (H + len), a: d + PI,
      length: len, lanesFwd: inN, lanesBack: outN, width: W, limit: LIM }, o));
  }
  // 차로 오른쪽 길가 표지
  function sign(net, laneId, s, kind, o = {}) {
    const ln = net.lanes[laneId], p = R.pointAt(ln, s);
    let off = ln.width / 2 + 1.5;
    for (let x = ln.right; x; x = net.lanes[x].right) off += net.lanes[x].width;
    net.signs.push(Object.assign({ kind, x: p.x + Math.sin(p.a) * off, y: p.y - Math.cos(p.a) * off, a: p.a }, o));
  }
  // at초에 laneId 신호가 state로 바뀌도록 신호 offset을 맞춘다
  function align(net, sigId, laneId, state, at) {
    const sig = R.signalById(net, sigId);
    sig.offset = 0;
    for (let t = 0; t < sig.cycle; t += 0.5) {
      if (R.signalState(net, t, sigId, laneId) === state && R.signalState(net, t - 0.5, sigId, laneId) !== state) {
        sig.offset = ((t - at) % sig.cycle + sig.cycle) % sig.cycle;
        return;
      }
    }
    throw new Error(`${sigId}: ${laneId}에 ${state} 없음`);
  }
  // 동서 간선(main, 편도 n차로)이 서쪽에서 교차로 J(0,0)로 들어오고, 동·북·남 팔이 붙은 사거리
  function arterial(net, o) {
    const n = o.lanes, Hwe = half(o.crossLanes || 2), Hns = half(n), cl = o.crossLanes || 2;
    const main = R.straightRoad(net, Object.assign({ id: 'main', x: -Hwe - o.len, y: 0, a: 0, length: o.len, lanesFwd: n, lanesBack: n,
      width: W, limit: LIM, solidEnd: 40 }, o.mainOpts || {}));
    const e = arm(net, 'e', 0, 0, 0, Hwe, o.eLen || 250, n, n, { solidEnd: 40 });
    const nn = arm(net, 'n', 0, 0, 90, Hns, 200, cl, cl, { solidEnd: 30 });
    const s = arm(net, 's', 0, 0, 270, Hns, 200, cl, cl, { solidEnd: 30 });
    const tw = o.turns || (n === 3 ? T3 : T2), tc = cl === 3 ? T3 : T2;
    const j = R.junction4(net, { id: 'J', x: 0, y: 0, arms: [{ road: main, turns: tw }, { road: e, turns: tw }, { road: nn, turns: tc }, { road: s, turns: tc }],
      signal: o.signal, crosswalks: true });
    sign(net, 'main:f1', 30, 'limit', { limit: LIM, text: String(LIM) });
    return { main, e, n: nn, s, j };
  }

  const list = [];
  const add = m => list.push(Object.assign({ limit: LIM, vMax: VMAX, timeOfDay: 'day', scripts: [], density: 'normal' }, m));

  add({ id: 'city-lane', name: '차선 변경', seed: 101,
    tip: '"300m 앞 우회전" 안내가 나오면 미러를 보고 깜빡이를 켠 뒤 한 차로씩 3차로로 옮기세요. 교차로 앞 실선 구간 전에 끝내야 해요.',
    start: { laneId: 'main:f1', s: 40 }, goal: { laneId: 's:b2', s: 120 },
    build() {
      const net = R.newNet();
      arterial(net, { lanes: 3, len: 800, signal: { cycle: 100, protectedLeft: true } });
      align(net, 'J:sig', 'main:f2', 'G', 48); // 도착(약 60초) 무렵 직진 녹색이라 3차로 줄이 빠진다
      sign(net, 'main:f3', 560, 'camera', { limit: LIM, text: '단속' });
      return net;
    } });

  add({ id: 'city-bus', name: '버스전용차로 피하기', seed: 202,
    tip: '오른쪽 끝 3차로는 버스전용차로예요. 청색 실선 구간에서는 들어가면 안 되고, 교차로 앞 청색 점선 구간에서만 들어가 우회전하세요.',
    start: { laneId: 'main:f2', s: 40 }, goal: { laneId: 's:b2', s: 120 },
    build() {
      const net = R.newNet();
      arterial(net, { lanes: 3, len: 700, signal: { cycle: 100, protectedLeft: true },
        mainOpts: { bus: { side: 'right', s0: 0, s1: 700, dashedFrom: 600 } } });
      for (const s of [60, 360]) sign(net, 'main:f3', s, 'bus-lane', { text: '버스전용 07:00~21:00' });
      align(net, 'J:sig', 'main:f2', 'G', 42);
      return net;
    } });

  add({ id: 'city-cutin', name: '끼어드는 차 대응', seed: 303, density: 'easy',
    tip: '2차로를 유지하세요. 옆 차로 차가 깜빡이를 켜면 속도를 줄여 끼워 주고, 앞차와 1초 이상 간격을 다시 벌리세요.',
    start: { laneId: 'main:f2', s: 40 }, goal: { laneId: 'e:b2', s: 150 },
    scripts: [{ id: 'cutin', action: 'cut-in', spawn: { laneId: 'main:f1', s: 20, v: 0 },
      when: { lanes: ['main:f1', 'main:f2', 'main:f3'], s: 320 }, gap: 9 }],
    build() {
      const net = R.newNet();
      arterial(net, { lanes: 3, len: 750, signal: { cycle: 100, protectedLeft: true }, eLen: 260 });
      align(net, 'J:sig', 'main:f2', 'G', 55); // 끼어들기 대응 후 교차로는 대체로 녹색
      return net;
    } });

  add({ id: 'city-leftlane', name: '교차로 차로 미리 타기', seed: 404, density: 'easy',
    tip: '좌회전은 1차로(좌회전 전용)에서만 할 수 있어요. 미리 1차로로 옮기고, 좌회전 화살표 신호가 켜질 때까지 정지선 앞에서 기다리세요.',
    start: { laneId: 'main:f3', s: 40 }, goal: { laneId: 'n:b1', s: 120 },
    build() {
      const net = R.newNet();
      arterial(net, { lanes: 3, len: 700, signal: { cycle: 100, protectedLeft: true } });
      align(net, 'J:sig', 'main:f1', 'LG', 68); // 도착(약 55초) 후 잠시 좌회전 신호를 기다린다
      return net;
    } });

  add({ id: 'city-signal', name: '신호 지키기', seed: 505,
    tip: '교차로 세 개를 직진해요. 황색으로 바뀌었을 때 정지선 앞에서 멈출 수 있으면 멈추고, 너무 가까우면 그대로 지나가세요.',
    start: { laneId: 'w:f2', s: 40 }, goal: { laneId: 'x:f2', s: 120 },
    build() {
      const net = R.newNet(), H = half(2), gap = 260;
      const roads = [R.straightRoad(net, { id: 'w', x: -H - 260, y: 0, a: 0, length: 260, lanesFwd: 2, lanesBack: 2, width: W, limit: LIM, solidEnd: 30 })];
      for (let k = 1; k <= 2; k++) roads.push(R.straightRoad(net, { id: 'l' + k, x: (k - 1) * gap + H, y: 0, a: 0, length: gap - 2 * H,
        lanesFwd: 2, lanesBack: 2, width: W, limit: LIM, solidEnd: 30, solidStart: 15 }));
      roads.push(R.straightRoad(net, { id: 'x', x: 2 * gap + H, y: 0, a: 0, length: 220, lanesFwd: 2, lanesBack: 2, width: W, limit: LIM, solidStart: 15 }));
      // 첫 교차로는 출발 후 녹색, 두 번째는 도착 무렵 황색, 세 번째는 정지 후 출발하면 녹색 무렵
      const plan = [['G', 0], ['Y', 33], ['G', 100]];
      for (let k = 0; k < 3; k++) {
        const cx = k * gap, id = 'J' + (k + 1);
        const nn = arm(net, id + 'n', cx, 0, 90, H, 130, 2, 2), ss = arm(net, id + 's', cx, 0, 270, H, 130, 2, 2);
        R.junction4(net, { id, x: cx, y: 0, arms: [{ road: roads[k], turns: T2S }, { road: roads[k + 1], turns: T2S },
          { road: nn, turns: T2 }, { road: ss, turns: T2 }], signal: { cycle: 70, protectedLeft: true }, crosswalks: true });
        const inLane = roads[k].fwd[1];
        align(net, id + ':sig', inLane, plan[k][0], plan[k][1]);
      }
      sign(net, 'w:f2', 20, 'limit', { limit: LIM, text: String(LIM) });
      return net;
    } });

  add({ id: 'city-unprotected', name: '비보호 좌회전', seed: 606, density: 'easy',
    tip: '"비보호" 표지가 있는 곳은 녹색 원형 신호일 때 마주 오는 차가 없을 때만 좌회전할 수 있어요. 간격이 충분할 때 한 번에 도세요.',
    start: { laneId: 'main:f1', s: 40 }, goal: { laneId: 'n:b1', s: 120 },
    build() {
      const net = R.newNet();
      arterial(net, { lanes: 2, len: 420, signal: { cycle: 70, protectedLeft: false }, eLen: 350 });
      align(net, 'J:sig', 'main:f1', 'G', 20);
      return net;
    } });

  add({ id: 'city-rightstop', name: '우회전 일시정지', seed: 707,
    tip: '전방 신호가 적색이면 우회전 전에 정지선 앞에서 완전히 멈추세요. 횡단보도에 사람이 있으면 다 건널 때까지 기다린 뒤 천천히 도세요.',
    start: { laneId: 'main:f3', s: 250 }, goal: { laneId: 's:b2', s: 150 },
    scripts: [{ id: 'peds', action: 'peds', crosswalk: 'J:cw0', count: 3, when: { lanes: ['main:f1', 'main:f2', 'main:f3'], s: 450 } }],
    build() {
      const net = R.newNet();
      arterial(net, { lanes: 3, len: 600, signal: { cycle: 110, protectedLeft: true } });
      align(net, 'J:sig', 'n:f1', 'G', 0); // 남북 직진 녹색 = 동서 적색, 서쪽 횡단보도 보행 신호
      return net;
    } });

  // 교통 생성 옵션: 플레이어 시작 지점 주변 40m에는 처음에 차를 두지 않는다
  function trafficOpts(m, net) {
    const p = R.pointAt(net.lanes[m.start.laneId], m.start.s);
    return { seed: m.seed, density: m.density, scripts: m.scripts, avoid: [{ x: p.x, y: p.y, r: 40 }] };
  }
  const byId = id => list.find(m => m.id === id);
  return { list, byId, trafficOpts };
})();
if (typeof module !== 'undefined') module.exports = PP_MISSIONS;
