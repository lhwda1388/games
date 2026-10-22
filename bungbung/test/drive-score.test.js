const assert = require('assert');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let fail = 0;
// node bungbung/test/drive-score.test.js
const R = require('../roads.js');
const S = require('../drive-score.js');
const PI = Math.PI, DT = 0.1, PL = 4.39;

function straightNet() {
  const net = R.newNet();
  R.straightRoad(net, { id: 'r', x: 0, y: 0, a: 0, length: 600, lanesFwd: 3, lanesBack: 0, limit: 50, solidEnd: 150 });
  return net;
}
function crossNet(protectedLeft) {
  const net = R.newNet(), H = 12, len = 200, roads = [];
  const turns = protectedLeft ? [['left'], ['straight'], ['straight', 'right']] : [['left', 'straight'], ['straight', 'right']];
  for (let k = 0; k < 4; k++) {
    const d = k * PI / 2;
    roads.push(R.straightRoad(net, { id: 'a' + k, x: Math.cos(d) * (H + len), y: Math.sin(d) * (H + len), a: d + PI,
      length: len, lanesFwd: turns.length, lanesBack: turns.length, limit: 50, solidEnd: 30 }));
  }
  R.junction4(net, { id: 'J', x: 0, y: 0, arms: roads.map(road => ({ road, turns })), signal: { cycle: 90, protectedLeft }, crosswalks: true });
  return { net, roads, sig: net.signals[0] };
}
function findTime(net, sig, laneId, state) {
  for (let t = 0.1; t < sig.cycle * 2; t += 0.1) if (R.signalState(net, t, sig.id, laneId) === state && R.signalState(net, t - 0.1, sig.id, laneId) !== state) return t;
  throw new Error('no ' + state);
}
function frame(net, t, laneId, s, off, o = {}) {
  const p = R.pointAt(net.lanes[laneId], s);
  return Object.assign({ t, dt: DT, car: { x: p.x - Math.sin(p.a) * off, y: p.y + Math.cos(p.a) * off, th: p.a, v: 10, laneId, s, offset: off, dist: Math.abs(off) },
    blink: 0, mirrorL: -Infinity, mirrorR: -Infinity, collision: null, others: [], peds: [], rerouted: false }, o);
}
const codes = ev => ev.map(e => e.code);
function run(ds, frames) { let ev = []; for (const f of frames) ev = ev.concat(S.update(ds, f)); return ev; }

// r:f1 → r:f2 오른쪽 차선 변경. 5초까지 중앙, 5~6초 오른쪽으로 이동(5.25초에 중앙 이탈 = 변경 시작), 6초에 경계 통과.
function laneChange(o = {}) {
  const net = straightNet(), ds = S.create({ goal: { laneId: 'r:f3', s: 590 } }, net);
  const v = o.v || 10, s0 = o.s0 || 50, frames = [];
  const tStart = 5.25;
  for (let t = 0; t <= 7.001; t += DT) {
    const s = s0 + v * t;
    let laneId = 'r:f1', off = 0;
    if (t > 5 && t < 6) off = -1.6 * (t - 5);
    if (t >= 6) { laneId = 'r:f2'; off = 1.6 * Math.max(0, 1 - (t - 6)); }
    const f = frame(net, t, laneId, s, off, { blink: o.blinkLead != null && t >= tStart - o.blinkLead ? 1 : 0,
      mirrorR: o.mirrorLead != null && t >= tStart - o.mirrorLead ? tStart - o.mirrorLead : -Infinity });
    f.car.v = v;
    if (o.follower != null) {
      const fs = s - PL / 2 - o.follower - 2.25, p = R.pointAt(net.lanes['r:f2'], fs);
      f.others = [{ id: 1, x: p.x, y: p.y, th: p.a, v, l: 4.5, w: 1.8 }];
    }
    frames.push(f);
  }
  return codes(run(ds, frames));
}

test('깜빡이: 0.5초 전 → 위반, 1.5초 전 → 비위반', () => {
  assert(laneChange({ blinkLead: 0.5, mirrorLead: 2 }).includes('blink'));
  assert(!laneChange({ blinkLead: 1.5, mirrorLead: 2 }).includes('blink'));
  assert(laneChange({ mirrorLead: 2 }).includes('blink'), '깜빡이 없음');
});
test('미러: 변경 시작 3초 안 확인 → 비위반, 5초 전 → 위반', () => {
  assert(!laneChange({ blinkLead: 1.5, mirrorLead: 2 }).includes('mirror'));
  assert(laneChange({ blinkLead: 1.5, mirrorLead: 5 }).includes('mirror'));
  assert(laneChange({ blinkLead: 1.5 }).includes('mirror'));
});
test('실선 차선 변경: 실선 구간 → 위반, 점선 → 비위반', () => {
  assert(!laneChange({ blinkLead: 1.5, mirrorLead: 2, s0: 100 }).includes('solid'));
  assert(laneChange({ blinkLead: 1.5, mirrorLead: 2, s0: 420 }).includes('solid'));
});
test('위험 끼어들기: 새 차로 뒤차 시간 간격 1초 미만 → 위반, 3초 → 비위반', () => {
  assert(laneChange({ blinkLead: 1.5, mirrorLead: 2, follower: 5 }).includes('cutin'));
  assert(!laneChange({ blinkLead: 1.5, mirrorLead: 2, follower: 30 }).includes('cutin'));
  assert.deepStrictEqual(laneChange({ blinkLead: 1.5, mirrorLead: 2, follower: 30 }), [], '깨끗한 차선 변경은 감점 없음');
});

// 교차로 접근: 진입 차로 s=st.s-60에서 정지선 통과, connector로 들어가 끝까지. stopAt이면 정지선 1m 앞에서 2초 정지.
function approach(net, lane, turn, tCross, o = {}) {
  const st = R.stopOf(net, lane), conn = net.lanes[lane].next.find(id => net.lanes[id].turn === turn), frames = [];
  const v = o.v || 8, blink = turn === 'left' ? -1 : turn === 'right' ? 1 : 0;
  const front0 = st.s - (o.dist0 != null ? o.dist0 : 60);
  let t = tCross - (st.s - front0) / v, s = front0 - PL / 2, laneId = lane, stopped = 0;
  if (o.stop) t -= 2.5;
  const ds = S.create({ goal: { laneId: net.lanes[conn].next[0], s: 150 } }, net);
  const L = R.laneLength(net.lanes[lane]);
  while (true) {
    let vv = v;
    if (o.stop && laneId === lane && s + PL / 2 >= st.s - 1 && stopped < 2) { vv = 0; stopped += DT; }
    const f = frame(net, t, laneId, s, 0, { blink, peds: o.peds || [] });
    f.car.v = vv;
    frames.push(f);
    s += vv * DT; t += DT;
    if (laneId === lane && s > L) { s -= L; laneId = conn; }
    else if (laneId === conn && s > R.laneLength(net.lanes[conn])) break;
  }
  return codes(run(ds, frames));
}

test('신호 위반: 적색 직진 → 위반, 녹색 → 비위반', () => {
  const { net, roads, sig } = crossNet(true);
  const lane = roads[0].fwd[1];
  assert(approach(net, lane, 'straight', findTime(net, sig, lane, 'R') + 5).includes('signal'));
  assert.deepStrictEqual(approach(net, lane, 'straight', findTime(net, sig, lane, 'G') + 5), []);
});
test('황색 딜레마: 멈출 수 있었는데 통과 → 위반, 정지 불가 거리 → 비위반', () => {
  const { net, roads, sig } = crossNet(true);
  const lane = roads[0].fwd[1], ty = findTime(net, sig, lane, 'Y');
  assert(approach(net, lane, 'straight', ty + 2.5, { v: 10 }).includes('signal'), '황색 시작 시 25m 앞, 10m/s');
  assert(!approach(net, lane, 'straight', ty + 0.5, { v: 14 }).includes('signal'), '황색 시작 시 7m 앞, 14m/s');
});
test('보호 좌회전: LG에서 → 비위반, 녹색 원형에서 → 신호 위반', () => {
  const { net, roads, sig } = crossNet(true);
  const lane = roads[0].fwd[0];
  assert.deepStrictEqual(approach(net, lane, 'left', findTime(net, sig, lane, 'LG') + 3), []);
  const tg = findTime(net, sig, roads[0].fwd[1], 'G') + 5; // 직진 녹색일 때 좌회전 차로는 적색
  assert(approach(net, lane, 'left', tg).includes('signal'));
});
test('비보호 좌회전: 녹색 원형 → 비위반, 적색 → 비보호 위반', () => {
  const { net, roads, sig } = crossNet(false);
  const lane = roads[0].fwd[0];
  assert.deepStrictEqual(approach(net, lane, 'left', findTime(net, sig, lane, 'G') + 5), []);
  const ev = approach(net, lane, 'left', findTime(net, sig, lane, 'R') + 5);
  assert(ev.includes('unprotected'), ev.join());
});
test('우회전 일시정지: 적색에서 정지선 앞 완전 정지 → 비위반, 안 멈춤 → 위반', () => {
  const { net, roads, sig } = crossNet(true);
  const lane = roads[0].fwd[2], tr = findTime(net, sig, lane, 'R') + 10;
  assert.deepStrictEqual(approach(net, lane, 'right', tr, { stop: true, v: 5 }), []);
  assert(approach(net, lane, 'right', tr, { v: 5 }).includes('stop'));
});
test('횡단보도 보행자: 내 차로 몫에 있는데 통과 → 위반, 없거나 반대편 차도 쪽이면 비위반', () => {
  const { net, roads, sig } = crossNet(true);
  const lane = roads[0].fwd[1], tg = findTime(net, sig, lane, 'G') + 5;
  const cw = net.crosswalks.find(c => c.arm === 0), x = cw.lanes.find(l => l.laneId === lane);
  const [a, b] = cw.pts, L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const at = u => ({ id: 1, x: a[0] + (b[0] - a[0]) * u / L, y: a[1] + (b[1] - a[1]) * u / L, th: 0, walking: true });
  const c = R.pointAt(net.lanes[lane], (x.s0 + x.s1) / 2), mine = ((c.x - a[0]) * (b[0] - a[0]) + (c.y - a[1]) * (b[1] - a[1])) / L;
  assert(approach(net, lane, 'straight', tg, { peds: [at(mine)] }).includes('stop'));
  assert(approach(net, lane, 'straight', tg, { peds: [at(mine + net.lanes[lane].width / 2 + 0.9)] }).includes('stop')); // 차로 끝 +1m 안
  assert.deepStrictEqual(approach(net, lane, 'straight', tg, { peds: [at(L - 1)] }), []); // 반대편 차도 끝
  assert.deepStrictEqual(approach(net, lane, 'straight', tg, { peds: [] }), []);
});

// 정지선을 넘어(front = st.s + over) 서 있다가 tGo에 출발. 반환: 감점 이벤트 전체(코드·문구)
function overshoot(net, lane, turn, tStop, tGo, over, o = {}) {
  const st = R.stopOf(net, lane), conn = net.lanes[lane].next.find(id => net.lanes[id].turn === turn), frames = [];
  const v = o.v || 6, blink = turn === 'left' ? -1 : turn === 'right' ? 1 : 0, L = R.laneLength(net.lanes[lane]);
  const ds = S.create({ goal: { laneId: net.lanes[conn].next[0], s: 150 } }, net);
  let s = st.s + over - PL / 2 - v * 6, t = tStop - 6, laneId = lane;
  while (true) {
    const stopped = t >= tStop && t < tGo, vv = stopped ? 0 : v;
    if (t >= tStop - DT / 2 && stopped && laneId === lane) s = st.s + over - PL / 2;
    const f = frame(net, t, laneId, s, 0, { blink });
    f.car.v = vv; frames.push(f);
    s += vv * DT; t += DT;
    if (laneId === lane && s > L) { s -= L; laneId = conn; }
    else if (laneId === conn && s > R.laneLength(net.lanes[conn])) break;
  }
  return run(ds, frames);
}
test('정지선 살짝 넘어 정지 → 녹색 출발: 정지선 위반 1건, 신호 위반 아님 / 적색에 천천히 통과: 신호 위반', () => {
  const { net, roads, sig } = crossNet(true);
  const lane = roads[0].fwd[1], tg = findTime(net, sig, lane, 'G');
  let ev = overshoot(net, lane, 'straight', tg - 10, tg + 1, 0.4);
  assert.deepStrictEqual(codes(ev), ['stopline'], codes(ev).join());
  assert.strictEqual(ev[0].text, S.TEXT.stopline);
  const tr = findTime(net, sig, lane, 'R');
  ev = overshoot(net, lane, 'straight', tr + 5, tr + 10, 0.4); // 적색에 넘어 섰다가 적색에 다시 출발
  assert.deepStrictEqual(codes(ev).sort(), ['signal', 'stopline']);
  ev = overshoot(net, lane, 'straight', tr + 5, tr + 5, 0.4, { v: 1.5 }); // 멈추지 않고 천천히 통과
  assert.deepStrictEqual(codes(ev), ['signal']);
  assert.strictEqual(ev[0].text, S.TEXT.red);
});
test('정지선 살짝 넘어 정지: 보호 좌회전은 LG에 출발하면 신호 위반 아님, 우회전 완전 정지는 일시정지 위반 아님', () => {
  const { net, roads, sig } = crossNet(true);
  const left = roads[0].fwd[0], tl = findTime(net, sig, left, 'LG');
  assert.deepStrictEqual(codes(overshoot(net, left, 'left', tl - 10, tl + 1, 0.4)), ['stopline']);
  const right = roads[0].fwd[2], tr = findTime(net, sig, right, 'R');
  assert.deepStrictEqual(codes(overshoot(net, right, 'right', tr + 5, tr + 8, 0.4)), ['stopline']);
  const u = crossNet(false), ul = u.roads[0].fwd[0], tu = findTime(u.net, u.sig, ul, 'G');
  assert.deepStrictEqual(codes(overshoot(u.net, ul, 'left', tu - 10, tu + 1, 0.4)), ['stopline'], '비보호: 녹색에 출발');
});
test('우회전: 정지선 앞에서 완전히 선 뒤 횡단보도 앞까지 다가가 서는 건 정지선 위반 아님', () => {
  const { net, roads, sig } = crossNet(true);
  const lane = roads[0].fwd[2], st = R.stopOf(net, lane), conn = net.lanes[lane].next.find(id => net.lanes[id].turn === 'right');
  const tr = findTime(net, sig, lane, 'R') + 5, ds = S.create({ goal: { laneId: net.lanes[conn].next[0], s: 150 } }, net), L = R.laneLength(net.lanes[lane]);
  // 정지선 1m 앞 정지 2초 → 1.5m 전진(정지선 0.5m 넘음) 정지 3초 → 우회전
  const plan = [[st.s - 1, 2], [st.s + 0.5, 3]];
  let s = st.s - 1 - PL / 2 - 30, t = tr - 6, laneId = lane, k = 0, wait = 0;
  const frames = [];
  while (true) {
    let vv = 5;
    if (k < plan.length && laneId === lane && s + PL / 2 >= plan[k][0]) { vv = 0; s = plan[k][0] - PL / 2; if ((wait += DT) >= plan[k][1]) { k++; wait = 0; } }
    const f = frame(net, t, laneId, s, 0, { blink: 1 }); f.car.v = vv; frames.push(f);
    s += vv * DT; t += DT;
    if (laneId === lane && s > L) { s -= L; laneId = conn; }
    else if (laneId === conn && s > R.laneLength(net.lanes[conn])) break;
  }
  assert.deepStrictEqual(codes(run(ds, frames)), []);
});

function cruise(o) {
  const net = straightNet(), ds = S.create({ goal: { laneId: 'r:f2', s: 590 }, weather: o.weather }, net), ev = [];
  for (let t = 0; t <= o.secs; t += DT) {
    const s = 20 + o.v * t, f = frame(net, t, 'r:f2', s, 0, o.extra ? o.extra(t) : {});
    f.car.v = o.v;
    if (o.leader != null) { const p = R.pointAt(net.lanes['r:f2'], s + PL / 2 + o.leader + 2.25); f.others = [{ id: o.idAt ? o.idAt(t) : 1, x: p.x, y: p.y, th: 0, v: o.v, l: 4.5, w: 1.8 }]; }
    if (o.th != null) f.car.th = o.th;
    if (o.dist != null) f.car.dist = o.dist;
    ev.push(...S.update(ds, f));
  }
  return { ds, ev: codes(ev) };
}
test('과속: 제한 +10% 초과 2초 이상 → 위반, 54km/h → 비위반', () => {
  assert(cruise({ v: 60 / 3.6, secs: 2.5 }).ev.includes('speed'));
  assert(!cruise({ v: 60 / 3.6, secs: 1.5 }).ev.includes('speed'), '2초 미만');
  assert(!cruise({ v: 54 / 3.6, secs: 5 }).ev.includes('speed'));
  assert.strictEqual(cruise({ v: 60 / 3.6, secs: 6 }).ev.filter(c => c === 'speed').length, 1, '한 번 초과는 한 건');
});
test('차간거리: 1초 미만 3초 이상 → 위반, 1.5초 → 비위반', () => {
  assert(cruise({ v: 10, secs: 3.5, leader: 8 }).ev.includes('gap'));
  assert(!cruise({ v: 10, secs: 2.5, leader: 8 }).ev.includes('gap'), '3초 미만');
  assert(!cruise({ v: 10, secs: 5, leader: 15 }).ev.includes('gap'));
  // 차로 끝 너머 연장선 위의 차(다음 도로)는 앞차가 아님
  const net = straightNet(), ds = S.create({ goal: { laneId: 'r:f2', s: 599 } }, net), ev = [];
  for (let t = 0; t <= 4; t += DT) {
    const f = frame(net, t, 'r:f2', 560 + 2 * t, 0);
    f.car.v = 10; f.others = [{ id: 1, x: 600 + 12, y: -4.8, th: 0, v: 10, l: 4.5, w: 1.8 }];
    ev.push(...S.update(ds, f));
  }
  assert(!codes(ev).includes('gap'), '연장선 차를 앞차로 봄');
});
test('빗길 차간거리: 2초 미만 3초 이상 → 위반(빗길 문구), 맑음 1.5초는 비위반, 2.5초는 둘 다 비위반', () => {
  const rain = cruise({ v: 10, secs: 3.5, leader: 15, weather: 'rain' });
  assert(rain.ev.includes('gap'), '빗길 1.5초');
  assert.strictEqual(rain.ds.penalties.find(p => p.code === 'gap').text, S.TEXT.gapRain);
  assert(/2초/.test(S.TEXT.gapRain));
  assert(!cruise({ v: 10, secs: 3.5, leader: 15 }).ev.includes('gap'), '맑음 1.5초');
  assert(!cruise({ v: 10, secs: 5, leader: 25, weather: 'rain' }).ev.includes('gap'), '빗길 2.5초');
});
test('차간거리: 앞차가 바뀌면(끼어든 차) 간격 시간을 새로 센다', () => {
  assert(!cruise({ v: 10, secs: 4, leader: 8, idAt: t => (t < 2 ? 1 : 2) }).ev.includes('gap'), '2초 + 2초');
  assert(cruise({ v: 10, secs: 5.5, leader: 8, idAt: t => (t < 2 ? 1 : 2) }).ev.includes('gap'), '새 앞차로 3초');
});
test('합류 차로(kind merge): 앞범퍼가 endS에 닿으면 실패, 그 전은 통과 중', () => {
  const net = R.newNet();
  const from = R.straightRoad(net, { id: 'w', x: -300, y: 0, a: 0, length: 300, lanesFwd: 2, lanesBack: 1, limit: 50 });
  const to = R.straightRoad(net, { id: 'm', x: 0, y: 0, a: 0, length: 300, lanesFwd: 1, lanesBack: 1, limit: 50 });
  const drop = R.laneDrop(net, { id: 'd', from, to }), ml = net.lanes[drop.mergeId];
  const go = s => { const ds = S.create({ goal: { laneId: 'm:f1', s: 290 } }, net); for (let t = 0, x = s - 20; x <= s; t += DT, x += 1) S.update(ds, frame(net, t, ml.id, x, 0)); return S.result(ds); };
  assert.strictEqual(go(ml.endS - PL / 2 - 1).failReason, undefined);
  assert.strictEqual(go(ml.endS - PL / 2 + 0.5).failReason, S.FAIL.laneEnd);
  assert(/합류/.test(S.FAIL.laneEnd));
  // 합류 차로에 들어가며 재탐색돼도 경로 이탈 감점은 없다(끝까지 가면 laneEnd)
  const ds = S.create({ goal: { laneId: 'm:f1', s: 290 } }, net);
  const ev = run(ds, [frame(net, 0, 'w:f2', 290, 0), frame(net, DT, ml.id, 2, 0, { rerouted: true }), frame(net, 2 * DT, ml.id, 3, 0, { rerouted: true })]);
  assert.deepStrictEqual(codes(ev), []);
});
test('안내 놓침: 재탐색 → 감점', () => {
  assert(cruise({ v: 10, secs: 1, extra: t => ({ rerouted: t > 0.45 && t < 0.55 }) }).ev.includes('route'));
  assert(!cruise({ v: 10, secs: 1 }).ev.includes('route'));
});
test('실패: 충돌 즉시, 역주행 5초, 도로 이탈', () => {
  const c = cruise({ v: 10, secs: 2, extra: t => ({ collision: t > 1 ? 'car' : null }) });
  const r = S.result(c.ds);
  assert.strictEqual(r.passed, false);
  assert(/충돌/.test(r.failReason), r.failReason);
  assert(r.time < 1.2, '즉시 종료: ' + r.time);
  assert.strictEqual(S.result(cruise({ v: 5, secs: 4, th: PI }).ds).failReason, undefined, '4초는 아직');
  assert(/역주행/.test(S.result(cruise({ v: 5, secs: 5.5, th: PI }).ds).failReason));
  assert(/도로/.test(S.result(cruise({ v: 5, secs: 2, dist: 6 }).ds).failReason));
});
test('도착 → 통과, 결과·최고 기록 비교', () => {
  const net = straightNet(), ds = S.create({ goal: { laneId: 'r:f2', s: 300 } }, net);
  for (let t = 0; t <= 30; t += DT) { const f = frame(net, t, 'r:f2', 20 + 10 * t, 0); S.update(ds, f); }
  const r = S.result(ds);
  assert.strictEqual(r.passed, true);
  assert(Math.abs(r.time - 28) < 0.3, 'time ' + r.time);
  assert.deepStrictEqual(r.penalties, []);
  const p = (passed, n, time) => ({ passed, penalties: new Array(n).fill({}), time });
  assert(S.better(p(true, 0, 60), null));
  assert(S.better(p(true, 1, 90), p(true, 2, 40)));
  assert(!S.better(p(true, 1, 90), p(true, 1, 40)));
  assert(S.better(p(true, 3, 90), p(false, 0, 10)));
  const ev = laneChangeEvents();
  assert(ev.every(e => typeof e.t === 'number' && e.text.length > 5), '감점마다 시각과 설명');
});
function laneChangeEvents() {
  const net = straightNet(), ds = S.create({ goal: { laneId: 'r:f3', s: 590 } }, net);
  let ev = [];
  for (let t = 0; t <= 7; t += DT) {
    const laneId = t >= 6 ? 'r:f2' : 'r:f1', off = t > 5 && t < 6 ? -1.6 * (t - 5) : t >= 6 ? 1.6 * (1 - (t - 6)) : 0;
    ev = ev.concat(S.update(ds, frame(net, t, laneId, 420 + 10 * t, Math.max(-1.6, Math.min(1.6, off)))));
  }
  assert.deepStrictEqual(codes(ev).sort(), ['blink', 'mirror', 'solid']);
  return ev;
}
for (const [name, fn] of tests) {
  try { fn(); console.log('ok  ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n  ' + e.message); }
}
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('all ' + tests.length + ' passed');
