// 붕붕이 — 자동 운전 봇(테스트용). 실제 루프(PP_DRIVE.create/controls/step)로 미션을 끝까지 달린다.
// 내비 경로를 따라 차선 변경(깜빡이 1.5초 전·미러 확인), 목표 속도 = 제한 × 0.95(램프·톨게이트·정체 반영), 앞차 2초 간격,
// 느린 앞차 추월 후 복귀, 정체 구간 비상등, 톨게이트 단말기 규칙. 시내: 신호 정지선(황색 딜레마 판정), 보호·비보호 좌회전, 우회전 일시정지,
// 횡단보도 보행자 대기, 회전 깜빡이. 빗길(weather 'rain'): 시간 간격 2.6초, 브레이크 페달을 grip만큼 더 밟는다. 차로 감소: 합류 차로 250m 전부터 왼쪽으로.
// 시험(mission.exam): 출발 전 왼쪽·도착 120m 전 오른쪽 깜빡이, 급제동 없이. 조향은 순수 추종(전방 주시 max(8, v·1.2)m).
// drive(mission, { maxT, dt }) → PP_DSCORE.result + { t, d }
const D = require('../drive.js'), C = require('../car.js'), R = require('../roads.js'), N = require('../nav.js'), S = require('../drive-score.js'), T = require('../traffic.js');

const PL = C.SELTOS.length;
const CRUISE = 0.95, TOLL_V = 25 / 3.6, JAM_V = 60 / 3.6; // 목표 속도 비율, 톨게이트 차로 속도, 정체 구간 속도
const HEADWAY = 2, HEADWAY_RAIN = 2.6, DROP_LOOK = 250, A_ACC = 2, B_COMF = 2.5, A_BR = 1.5, A_BR_TOLL = 2.2; // 앞차 시간 간격(s), IDM 가속·감속, 제한 감속(m/s²)
const BLINK_LEAD = 1.5, MIRROR_EVERY = 1; // 깜빡이 켠 뒤 차선 변경까지(s), 미러 다시 보기 간격(s)
const LEAD = 1500, TOLL_LEAD = 700; // 경로 차선 변경을 시작하는 안내 지점까지 거리(m), 톨게이트 부스 차로로 옮기는 거리(m)
const OVT_DV = 12 / 3.6, OVT_RANGE = 70, OVT_STOP = 220, OVT_CLEAR = 1500; // 추월: 앞차가 이만큼 느리고 이 거리(선 차는 OVT_STOP) 안이면, 다음 안내까지 이만큼 남았을 때만
const PASS_LANE = 1.0; // 1차로(추월 중) 목표 속도 = 제한 × 이 값 — 15초 안에 추월을 끝낸다
const ACC_STOP = 35, B_STOP = 3.5;
const HARD = 5.2, B_SIG = 3, B_SIG_MAX = 5, YEL_STOP = 3.0; // 시험 최대 감속(급제동 5.5 아래), 신호 정지 감속(m/s²), 최대(급제동 5.5 아래), 황색에 멈출 수 있는 감속 기준(drive-score couldStop)
const GAP_T = 6, TURN_BLINK = 40, START_BLINK = 1.6, ARRIVE_BLINK = 120; // 비보호 좌회전 마주 오는 차 간격(s), 회전 깜빡이 거리(m), 시험 출발 전 왼쪽 깜빡이(s), 도착 전 오른쪽 깜빡이(m)
const TURN_V = { right: 15 / 3.6, left: 22 / 3.6, uturn: 12 / 3.6 }; // 교차로 회전 속도
const UTURN_LD = 5; // 유턴 연결 차로 전방 주시(m): 8m면 열쇠 구멍 모양 끝을 질러 바깥 차로에서 벗어난다
const EASE = 0.8; // 옆 차로가 막혀 차선을 못 바꿀 때 그 흐름 대비 목표 속도(뒤로 빠져 빈틈을 만든다) // 합류 못 하면 가속차로 끝 이 거리 앞에 선다(m), 정지선·가속차로 끝 정지 감속(m/s²): 늦게 밟아 합류 속도를 지킨다

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isMain = ln => !!ln && ln.kind === 'normal' && ln.minSpeed != null;

function nextOf(d, id) {
  const net = d.net, ln = net.lanes[id];
  if (!ln.next.length) return null;
  if (ln.next.length === 1) return ln.next[0];
  const tolls = ln.next.filter(n => net.lanes[n].kind === 'toll');
  if (tolls.length) {
    const want = d.mission.hipass ? 'hipass' : 'normal', ok = tolls.filter(n => net.lanes[n].toll === want);
    return (d.route && ok.find(n => d.route.lanes.includes(n))) || ok[0] || tolls[0];
  }
  return (d.route && ln.next.find(n => d.route.lanes.includes(n))) || ln.next[0];
}
// 차로 laneId의 s에서 경로를 따라 ds 앞 지점
function pointAhead(d, laneId, s, ds) {
  let id = laneId, ln = d.net.lanes[id];
  while (s + ds > R.laneLength(ln)) {
    const nx = nextOf(d, id);
    if (!nx) break;
    ds -= R.laneLength(ln) - s; s = 0; id = nx; ln = d.net.lanes[id];
  }
  const L = R.laneLength(ln), p = R.pointAt(ln, Math.min(s + ds, L)), over = Math.max(0, s + ds - L);
  return { x: p.x + Math.cos(p.a) * over, y: p.y + Math.sin(p.a) * over };
}
// 경로를 따라 앞에 있는 가장 가까운 차(앞뒤 범퍼 간격 m, 속도)
function leader(d, cars, laneId, s, maxD = 250) {
  let base = -s, id = laneId, best = null;
  const me = d.player;
  for (let k = 0; id && base < maxD && k < 4; k++) {
    const ln = d.net.lanes[id];
    for (const o of cars) {
      if (Math.abs(o.x - me.x) > maxD + 20 || Math.abs(o.y - me.y) > maxD + 20) continue;
      const p = R.projectLane(ln, o.x, o.y), ds = base + p.s;
      if (p.dist > ln.width / 2 + 0.6 || ds <= 0.5) continue;
      const g = ds - (o.l + PL) / 2;
      if (!best || g < best.gap) best = { gap: g, v: o.v, car: o };
    }
    base += R.laneLength(ln); id = nextOf(d, id);
  }
  return best && best.gap < maxD ? best : null;
}
// 옆 차로 to의 앞·뒤 차(내 위치를 그 차로 s로 옮겨서)
function around(d, cars, from, to, s) {
  const ln = d.net.lanes[to], sT = R.mapS(d.net, from, to, s);
  let lead = null, foll = null;
  for (const o of cars) {
    if (Math.abs(o.x - d.player.x) > 260 || Math.abs(o.y - d.player.y) > 260) continue;
    const p = R.projectLane(ln, o.x, o.y);
    if (p.dist > ln.width / 2 + 0.6) continue;
    const ds = p.s - sT, g = Math.abs(ds) - (o.l + PL) / 2;
    if (ds > 0) { if (!lead || g < lead.gap) lead = { gap: g, v: o.v }; }
    else if (!foll || g < foll.gap) foll = { gap: g, v: o.v };
  }
  return { lead, foll };
}
function safeChange(d, cars, from, to, s, v) {
  const { lead, foll } = around(d, cars, from, to, s);
  if (lead && (lead.gap < Math.max(3, 1.1 * v + 2 - Math.max(0, lead.v - v) * 2) || lead.gap < 0)) return false;
  if (foll && foll.gap < 1.1 * foll.v + 2.5 + Math.max(0, foll.v - v) * 2.5) return false; // 바뀌는 순간 뒤차 1초(끼어들기 감점) + 여유
  return true;
}

// 경로에서 내 차로 단계(같은 차로가 두 번 있으면 s가 든 쪽)
function stepIndex(route, laneId, s) {
  const st = route.steps;
  let i = st.findIndex(x => x.laneId === laneId && s >= x.s0 - 1 && s <= x.s1 + 1);
  if (i < 0) i = st.findIndex(x => x.laneId === laneId);
  return i;
}
const chain = (net, id) => {
  let x = id;
  while (net.lanes[x].left) x = net.lanes[x].left;
  const out = [];
  for (; x; x = net.lanes[x].right) out.push(x);
  return out;
};

// 지금 바꾸고 싶은 차로 { to: 옆 차로 id, kind: 'route'|'overtake'|'return' } 또는 null
function wanted(d, cars, vCruise) {
  const net = d.net, me = d.player, ln = net.lanes[me.laneId], L = R.laneLength(ln), route = d.route;
  if (!route || !ln) return null;
  const tollType = d.mission.hipass ? 'hipass' : 'normal';
  const tollsOf = l => l.next.map(n => net.lanes[n]).filter(x => x.kind === 'toll');
  if (tollsOf(ln).length && L - me.s < TOLL_LEAD + 300) {
    if (L - me.s > TOLL_LEAD || tollsOf(ln).some(x => x.toll === tollType)) return null;
    for (const side of ['left', 'right']) for (let x = ln[side]; x; x = net.lanes[x][side])
      if (tollsOf(net.lanes[x]).some(t => t.toll === tollType)) return { to: ln[side], kind: 'route' };
    return null;
  }
  // 차로 감소: 경로를 따라 DROP_LOOK m 안에 합류 차로(곧 끝나는 차로)가 있거나 이미 그 안이면 왼쪽으로
  if (ln.left && net.lanes[ln.left].kind === 'normal') {
    let drop = ln.kind === 'merge';
    ahead(d, me.laneId, me.s, DROP_LOOK, id => { if (net.lanes[id].kind === 'merge') drop = true; });
    if (drop) return { to: ln.left, kind: 'route' };
  }
  const pos = N.routePos(net, route, me.laneId, me.s), man = N.maneuvers(net, route);
  const nextMan = man.find(m => m.at > pos + 0.5);
  const i = stepIndex(route, me.laneId, me.s);
  if (i >= 0) {
    const nx = route.steps[i + 1];
    if (nx && nx.via === 'change') {
      const tgt = net.lanes[nx.laneId], toLane1 = isMain(tgt) && !tgt.left; // 1차로로는 안내 지점 가까이에서만(1차로 감점)
      const near = !nextMan || nextMan.at - pos < (nextMan.kind === 'toll' ? TOLL_LEAD : LEAD);
      if (near || (!toLane1 && me.s >= route.steps[i].s1 - 1)) return { to: nx.laneId, kind: 'route' };
    }
    // 추월: 느린 앞차, 왼쪽이 본선, 다음 안내·도착까지 충분
    const ld = leader(d, cars, me.laneId, me.s, OVT_STOP), left = net.lanes[ln.left];
    const clear = !nextMan || (nextMan.kind === 'arrive' ? nextMan.at - pos > 800 : nextMan.at - pos > OVT_CLEAR);
    const lfree = left && (l2 => !l2 || l2.gap > 200 || l2.v >= vCruise)(around(d, cars, me.laneId, ln.left, me.s).lead); // 추월차로 앞도 비어야
    // 느린 차 줄(앞차 앞 80m 안에 또 느린 차)은 15초 안에 다 못 지나가므로 따라간다
    const ahead = ld && ld.car && ld.v >= 5 && leader(d, cars, me.laneId, me.s + ld.gap + PL + 1, 80);
    const alone = !ahead || ahead.v >= vCruise - OVT_DV;
    if (ld && ld.v < vCruise - OVT_DV && ld.gap < (ld.v < 5 ? OVT_STOP : OVT_RANGE) && isMain(ln) && isMain(left) && clear && ((lfree && alone) || ld.v < 5)) return { to: ln.left, kind: 'overtake' };
    return null;
  }
  // 경로 밖(추월 중): 경로 차로 쪽으로 복귀
  const sib = chain(net, me.laneId), target = route.steps.find(x => sib.includes(x.laneId));
  if (!target) return null;
  const to = sib.indexOf(target.laneId) > sib.indexOf(me.laneId) ? ln.right : ln.left;
  const back = to && leader(d, cars, to, R.mapS(net, me.laneId, to, me.s), OVT_STOP); // 아직 느린 차 옆·뒤면 복귀하지 않는다
  const own = leader(d, cars, me.laneId, me.s, OVT_RANGE), stuck = own && own.v < vCruise - OVT_DV; // 추월차로도 막히면 그냥 돌아간다
  if (back && back.v < vCruise - OVT_DV && !(stuck && back.v >= 5 && back.v > own.v + 1)) return null;
  return { to, kind: 'return' };
}

// 경로를 따라 목표 속도(앞쪽 제한속도까지 A_BR로 줄이는 곡선)와 가상 정지물(톨게이트 정지선, 가속차로 끝)
function speedPlan(d, st, laneId, s) {
  const net = d.net, me = d.player;
  let id = laneId, dist = -s, vT = Infinity, stop = null;
  const front = PL / 2;
  for (let k = 0; id && dist < 700 && k < 6; k++) {
    const ln = net.lanes[id], L = R.laneLength(ln);
    const lane1 = isMain(ln) && !ln.left && isMain(net.lanes[ln.right]);
    let lim = ln.kind === 'toll' ? TOLL_V : (lane1 ? PASS_LANE : CRUISE) * ln.limit / 3.6;
    if (ln.kind === 'connector' && TURN_V[ln.turn]) lim = Math.min(lim, TURN_V[ln.turn]);
    const dd = Math.max(0, dist), a = ln.kind === 'toll' ? A_BR_TOLL : A_BR;
    vT = Math.min(vT, Math.sqrt(lim * lim + 2 * a * dd));
    if (ln.kind === 'toll' && ln.toll === 'normal' && !st.tollDone[id]) { const g = dist + ln.stopS - front; if (g > -1 && (!stop || g < stop)) stop = g; }
    if ((ln.kind === 'accel' || ln.kind === 'merge') && k === 0 && !(st.lc && st.lc.phase === 'move')) { const g = dist + (ln.kind === 'merge' ? ln.endS - 10 : L - ACC_STOP) - front; if (!stop || g < stop) stop = g; }
    dist += L; id = nextOf(d, id);
  }
  const J = d.mission.jamAt;
  if (J && net.lanes[J.laneId]) {
    const sib = chain(net, J.laneId);
    if (sib.includes(me.laneId)) {
      const js = R.mapS(net, me.laneId, J.laneId, me.s + PL / 2);
      if (js > J.s - 320 && js < J.s + 150) vT = Math.min(vT, JAM_V);
    }
  }
  return { vT, stop };
}
// 경로를 따라 앞 차로들: fn(laneId, base) — base = 내 s에서 그 차로 시작까지(m, 지금 차로는 -s)
function ahead(d, laneId, s, maxD, fn) {
  let id = laneId, base = -s;
  for (let k = 0; id && base < maxD && k < 4; k++) { fn(id, base); base += R.laneLength(d.net.lanes[id]); id = nextOf(d, id); }
}
const endA = ln => R.pointAt(ln, R.laneLength(ln)).a;
// 비보호 좌회전: 마주 오는 진입 차로(+그 직진·우회전 연결 차로)의 차가 교차로 중심까지 GAP_T초 안이면 false
function oncomingClear(d, cars, sp, laneId) {
  const net = d.net, sig = R.signalById(net, sp.signal), myA = endA(net.lanes[laneId]);
  const opp = net.stops.filter(x => x.junction === sp.junction && Math.abs(R.wrap(endA(net.lanes[x.laneId]) - myA - Math.PI)) < 0.5).map(x => x.laneId);
  const conns = Object.values(net.lanes).filter(l => l.kind === 'connector' && opp.includes(l.from) && l.turn !== 'left' && l.turn !== 'uturn');
  for (const o of cars) {
    if (Math.hypot(o.x - sig.x, o.y - sig.y) > 150) continue;
    for (const c of conns) { const p = R.projectLane(c, o.x, o.y); if (p.dist <= c.width / 2 + 1) return false; }
    for (const id of opp) {
      const ln = net.lanes[id], p = R.projectLane(ln, o.x, o.y);
      if (p.dist > ln.width / 2 + 0.6) continue;
      const dc = R.laneLength(ln) - p.s + Math.hypot(R.pointAt(ln, R.laneLength(ln)).x - sig.x, R.pointAt(ln, R.laneLength(ln)).y - sig.y);
      if (dc / Math.max(o.v, 1.5) < GAP_T) return false;
    }
  }
  return true;
}
// 횡단보도 내 차로 몫(± 여유) 위를 걷는 보행자
function pedNear(x, peds, extra) {
  const [a, b] = x.cw.pts, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  return peds.some(p => {
    if (p.walking === false) return false;
    const u = ((p.x - a[0]) * dx + (p.y - a[1]) * dy) / L;
    return Math.abs(u - x.at) <= x.half + extra && Math.abs((p.y - a[1]) * dx - (p.x - a[0]) * dy) / L <= x.cw.width / 2 + 1.5;
  });
}
// 신호 정지선·횡단보도 앞 정지 거리(앞범퍼에서, m) 또는 null. drive-score 판정과 같은 기준
function signalStop(d, st, cars, peds, laneId, s) {
  const net = d.net, t = d.t, v = d.car.v, front = PL / 2; // base가 이미 -s
  let stop = null;
  const take = g => { if (stop == null || g < stop) stop = g; };
  ahead(d, laneId, s, 120, (id, base) => {
    const sp = R.stopOf(net, id);
    if (sp && sp.signal) {
      const g = base + sp.s - front;
      if (g > 0) {
        const sig = R.signalById(net, sp.signal), state = R.signalState(net, t, sp.signal, id), ph = R.phaseAt(sig, t);
        const nx = net.lanes[nextOf(d, id)], turn = nx && nx.kind === 'connector' ? nx.turn : 'straight';
        if (state !== 'Y') delete st.yel[id];
        else if (!(id in st.yel)) st.yel[id] = v * v / (2 * Math.max(g, 0.1)) <= YEL_STOP + 0.2 ? 'stop' : 'go';
        if (g > 15) delete st.rstop[id]; else if (Math.abs(v) < 0.2 / 3.6) st.rstop[id] = true; // 우회전 일시정지(drive-score: 정지선 15m 안 0.3km/h 미만)
        let go;
        if (state === 'Y') go = st.yel[id] === 'go';
        else {
          const mv = R.movement(state, turn, sig.unprotected);
          if (mv === 'protected') go = true;
          else if (mv === 'permissive' && turn === 'right') go = !!st.rstop[id];
          else if (mv === 'permissive') go = ph.remain > 4 && oncomingClear(d, cars, sp, id);
          else go = false;
        }
        if (!go) take(g);
      }
    }
    for (const x of d.score.cwByLane[id] || []) {
      const g = base + x.s0 - front;
      if (g > 0 && g < 40 && pedNear(x, peds, 4)) take(g);
    }
  });
  return stop;
}
// 원하는 깜빡이: 차선 변경 > 시험 출발 > 회전 > 시험 도착
function wantBlink(d, st, pathLane, s) {
  const net = d.net, ln = net.lanes[pathLane], m = d.mission;
  if (st.lc) return st.lc.side;
  if (m.exam && !st.moved) return -1;
  if (ln.kind === 'connector' && (ln.turn === 'left' || ln.turn === 'uturn' || ln.turn === 'right') && s < R.laneLength(ln) - 3) return ln.turn === 'right' ? 1 : -1;
  const nx = net.lanes[nextOf(d, pathLane)];
  if (nx && nx.kind === 'connector' && nx.turn !== 'straight' && R.laneLength(ln) - s < Math.max(TURN_BLINK, d.car.v * 4)) return nx.turn === 'right' ? 1 : -1;
  const g = m.goal;
  if (m.exam && net.lanes[g.laneId] && chain(net, g.laneId).includes(pathLane) && g.s - R.mapS(net, pathLane, g.laneId, s) < ARRIVE_BLINK) return 1;
  return 0;
}

function idm(v, v0, lead, T = HEADWAY, s0 = 3) {
  let a = A_ACC * (1 - Math.pow(Math.max(v, 0) / Math.max(v0, 0.1), 4));
  if (lead) {
    const ss = s0 + Math.max(0, v * T + v * (v - lead.v) / (2 * Math.sqrt(A_ACC * B_COMF)));
    a = Math.min(a, A_ACC * (1 - Math.pow(ss / Math.max(lead.gap, 0.1), 2)));
  }
  return a;
}
function steer(d, laneId) {
  const c = d.car, ln = d.net.lanes[laneId], p = R.projectLane(ln, c.x, c.y);
  const Ld = ln.turn === 'uturn' ? UTURN_LD : Math.max(8, Math.abs(c.v) * 1.2), q = pointAhead(d, laneId, p.s, Ld);
  const dx = q.x - c.x, dy = q.y - c.y, co = Math.cos(c.th), si = Math.sin(c.th);
  const lx = co * dx + si * dy, ly = -si * dx + co * dy, k = 2 * ly / (lx * lx + ly * ly);
  const lock = c.spec.wheelLock;
  return clamp(Math.atan(c.spec.wheelbase * k) / c.dMax * lock, -lock, lock);
}

function decide(d, st, cars) {
  const net = d.net, me = d.player, ln = net.lanes[me.laneId], v = d.car.v, t = d.t;
  const ctl = { steerAbs: 0, throttle: 0, brake: 0, blinkReq: 0, mirrorL: false, mirrorR: false, hazardReq: 0, gearReq: null, hold: true };
  const vCruise = CRUISE * ln.limit / 3.6, grip = d.car.grip || 1, hwT = d.mission.weather === 'rain' ? HEADWAY_RAIN : HEADWAY;
  // 차선 변경 상태: null → blink(깜빡이·미러, 1.5초) → move(옆 차로로 조향) → 새 차로 중앙이면 끝
  const want = st.lc && st.lc.phase === 'move' ? st.lc : wanted(d, cars, vCruise);
  if (st.lc && st.lc.phase === 'blink' && (!want || want.to !== st.lc.to)) st.lc = null;
  if (!st.lc && want && R.canChange(net, me.laneId, want.to, me.s + v * BLINK_LEAD)) {
    st.lc = { to: want.to, kind: want.kind, side: ln.left === want.to ? -1 : 1, phase: 'blink', t0: t, mir: -Infinity };
  }
  const lc = st.lc;
  let pathLane = me.laneId;
  if (lc) {
    if (lc.phase === 'blink') {
      if (me.laneId !== lc.to && t - lc.t0 >= BLINK_LEAD && R.canChange(net, me.laneId, lc.to, me.s) && R.canChange(net, me.laneId, lc.to, me.s + Math.max(v * 1.5, 15))
        && safeChange(d, cars, me.laneId, lc.to, me.s, v)) { lc.phase = 'move'; lc.mir = -Infinity; }
    }
    if (lc.phase === 'move') pathLane = lc.to;
    if (t - lc.mir >= MIRROR_EVERY) { lc.mir = t; if (lc.side < 0) ctl.mirrorL = true; else ctl.mirrorR = true; }
    if (d.blink !== lc.side) ctl.blinkReq = lc.side;
    if (lc.phase === 'move' && me.laneId === lc.to && Math.abs(me.offset) < 0.5) st.lc = null;
  }
  const pathS = pathLane === me.laneId ? me.s : R.mapS(net, me.laneId, pathLane, me.s);
  if (!st.lc) { const wb = wantBlink(d, st, pathLane, pathS); if (wb !== d.blink) ctl.blinkReq = wb || d.blink; } // 같은 쪽을 다시 누르면 꺼진다
  // 속도
  const plan = speedPlan(d, st, pathLane, pathS);
  let v0 = plan.vT;
  const ld = leader(d, cars, me.laneId, me.s);
  let a = idm(v, v0, ld, hwT);
  if (lc && lc.phase === 'move') { const l2 = leader(d, cars, lc.to, R.mapS(net, me.laneId, lc.to, me.s)); if (l2) a = Math.min(a, idm(v, v0, l2, hwT)); }
  // 가속차로: 본선 빈틈에 맞춰 속도 조절. 그 밖의 차선 변경은 옆 차로 흐름보다 조금 늦게 달려 뒤쪽 빈틈으로
  if (ln.kind === 'accel' && lc && lc.phase === 'blink') {
    const { lead, foll } = around(d, cars, me.laneId, ln.left, me.s);
    if (lead && lead.gap < 1.1 * v + 3) a = Math.min(a, idm(v, Math.max(lead.v - 3, 17), null));
    else if (foll && foll.gap < 1.1 * foll.v + 4) a = Math.max(a, 1.5);
  } else if (lc && lc.kind !== 'overtake' && lc.phase === 'blink' && t - lc.t0 >= BLINK_LEAD && !safeChange(d, cars, me.laneId, lc.to, me.s, v)) {
    const { lead, foll } = around(d, cars, me.laneId, lc.to, me.s), near = foll && (!lead || foll.gap < lead.gap) ? foll : lead;
    const floor = ln.minSpeed != null && !(ld && ld.gap < 150 && ld.v * 3.6 < ln.minSpeed) ? (ln.minSpeed + 5) / 3.6 : 0; // 최저속도 감점 피하기
    if (near) a = Math.min(a, idm(v, Math.max(EASE * near.v, floor), ld, hwT));
  }
  if (plan.stop != null && plan.stop < v * v / (2 * B_STOP) + 10) a = Math.min(a, 3 * (Math.sqrt(2 * B_STOP * Math.max(0, plan.stop - 2)) - v)); // 정지선 2m 앞에 서는 속도 곡선
  const sg = signalStop(d, st, cars, T.peds(d.sim), pathLane, pathS);
  if (sg != null && sg < v * v / (2 * B_SIG) + 10) a = Math.min(a, Math.max(-B_SIG_MAX, 3 * (Math.sqrt(2 * B_SIG * Math.max(0, sg - 2)) - v))); // 정지선·횡단보도 2m 앞
  // 시험: 출발 전 왼쪽 깜빡이를 켜고 잠시 선다
  if (d.mission.exam && !st.moved) { if (d.blink === -1 && st.blinkT == null) st.blinkT = t; if (st.blinkT == null || t - st.blinkT < START_BLINK) a = Math.min(a, -1); }
  if (Math.abs(v) > 2) st.moved = true;
  // 일반 부스: 정지선 앞에서 1초 서면 통과
  if (ln.kind === 'toll' && ln.toll === 'normal' && !st.tollDone[ln.id]) {
    const g = ln.stopS - (me.s + PL / 2);
    if (v < 0.05 && g < 5.5 && g > -0.5) { st.tollT += d.dtStep; if (st.tollT >= 1) st.tollDone[ln.id] = true; } else st.tollT = 0;
  }
  a = clamp(a, d.mission.exam ? -HARD : -6, 3); // 시험: 급제동(5.5m/s²) 감점 아래로
  if (a >= 0) ctl.throttle = clamp((a + 0.15) / 3, 0, 1);
  else ctl.brake = clamp((-a - 0.15) / (6 * grip), 0, 1); // 빗길: 같은 감속에 페달을 더
  if (a < 0 && v < 1) ctl.brake = Math.max(ctl.brake, 0.5);
  ctl.steerAbs = steer(d, pathLane);
  // 비상등: 정체 지점 앞 320m ~ 지나서 400m
  const J = d.mission.jamAt;
  let haz = false;
  if (J && chain(net, J.laneId).includes(me.laneId)) {
    const js = R.mapS(net, me.laneId, J.laneId, me.s + PL / 2);
    haz = js > J.s - 320 && js < J.s + 400;
  }
  if (haz !== d.hazard) ctl.hazardReq = 1;
  return ctl;
}

function drive(mission, { maxT = 400, dt = 1 / 30 } = {}) {
  const d = D.create(mission);
  C.setGear(d.car, 'D');
  d.dtStep = dt;
  const st = { lc: null, tollDone: {}, tollT: 0, yel: {}, rstop: {}, moved: false, blinkT: null };
  while (d.t < maxT && !d.score.done && !d.score.failReason) {
    const ctl = decide(d, st, T.cars(d.sim));
    D.controls(d, ctl);
    D.step(d, ctl, dt);
  }
  return Object.assign(S.result(d.score), { t: d.t, d });
}

module.exports = { drive, around, safeChange };
