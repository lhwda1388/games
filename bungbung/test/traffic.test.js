const assert = require('assert');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let fail = 0;
// node bungbung/test/traffic.test.js
const R = require('../roads.js');
const T = require('../traffic.js');
const K = require('../collision.js');
const PI = Math.PI, DT = 1 / 30;

function box(c) { return { x: c.x, y: c.y, l: c.l, w: c.w, a: c.th }; }
// 모든 차 쌍(+플레이어) 충돌 검사, 같은 차로 쌍 최소 간격 반환
function checkFrame(sim, player, where) {
  const cs = T.cars(sim);
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const a = cs[i], b = cs[j];
    if (Math.abs(a.x - b.x) > 6 || Math.abs(a.y - b.y) > 6) continue;
    assert(!K.overlap(box(a), box(b)), `${where}: 차 ${a.id}·${b.id} 충돌`);
  }
  if (player) {
    const pb = { x: player.x, y: player.y, l: 4.39, w: 1.8, a: player.th };
    for (const c of cs) assert(!K.overlap(box(c), pb), `${where}: 차 ${c.id}가 플레이어와 충돌`);
  }
  let minGap = Infinity;
  const byLane = {};
  for (const c of sim.list) {
    (byLane[c.laneId] = byLane[c.laneId] || []).push([c.s, c]);
    if (c.from) (byLane[c.from] = byLane[c.from] || []).push([R.mapS(sim.net, c.laneId, c.from, c.s), c]);
  }
  for (const k in byLane) {
    const l = byLane[k].sort((p, q) => p[0] - q[0]);
    for (let i = 1; i < l.length; i++) minGap = Math.min(minGap, l[i][0] - l[i - 1][0] - (l[i][1].l + l[i - 1][1].l) / 2);
  }
  return minGap;
}

function crossNet(signal, opts = {}) {
  const net = R.newNet(), H = 12, len = opts.len || 160, roads = [];
  const turns = opts.turns || [['left'], ['straight'], ['straight', 'right']];
  for (let k = 0; k < 4; k++) {
    const d = k * PI / 2;
    roads.push(R.straightRoad(net, { id: 'a' + k, x: Math.cos(d) * (H + len), y: Math.sin(d) * (H + len), a: d + PI,
      length: len, lanesFwd: turns.length, lanesBack: turns.length, width: 3.2, limit: 50, solidEnd: 30 }));
  }
  const j = R.junction4(net, { id: 'J', x: 0, y: 0, arms: roads.map(road => ({ road, turns })), signal, crosswalks: true });
  return { net, roads, j, sig: net.signals[0] };
}
// 시그널이 lane에 대해 state를 dur초 이상 유지하는 시작 시각
function findTime(net, sig, laneId, state, from = 0) {
  for (let t = from; t < from + sig.cycle * 2; t += 0.1) if (R.signalState(net, t, sig.id, laneId) === state && R.signalState(net, t - 0.1, sig.id, laneId) !== state) return t;
  throw new Error('no ' + state);
}

test('직선 편도 3차로 보통 혼잡 1000초: 같은 차로 간격 > 1m, 충돌 없음, 차선 변경·통과 발생', () => {
  const net = R.newNet();
  R.straightRoad(net, { id: 'm', x: 0, y: 0, a: 0, length: 1200, lanesFwd: 3, lanesBack: 3, limit: 60 });
  const sim = T.create(net, { seed: 7, density: 'normal' });
  let minGap = Infinity, changes = 0, maxCars = 0;
  const seen = new Set(), wasFrom = new Map();
  for (let i = 0; i < 1000 * 30; i++) {
    T.step(sim, DT, i * DT, null);
    minGap = Math.min(minGap, checkFrame(sim, null, 't=' + (i * DT).toFixed(2)));
    for (const c of sim.list) {
      seen.add(c.id);
      if (c.from && !wasFrom.get(c.id)) changes++;
      wasFrom.set(c.id, !!c.from);
    }
    maxCars = Math.max(maxCars, sim.list.length);
  }
  assert(minGap > 1, 'minGap=' + minGap);
  assert(changes > 50, '차선 변경 ' + changes);
  assert(seen.size > 500, '통과 차량 ' + seen.size);
  assert(maxCars >= 20 && maxCars <= 200, 'maxCars=' + maxCars);
});

test('적색 신호: 정지선 뒤 2m 이내 정지, 정지선 넘지 않음, 녹색에 출발', () => {
  const { net, roads, sig } = crossNet({ cycle: 90, protectedLeft: true });
  const lane = roads[0].fwd[1], st = R.stopOf(net, lane);
  const t0 = findTime(net, sig, lane, 'R');
  const sim = T.create(net, { seed: 1, density: 'none', spawn: [{ laneId: lane, s: st.s - 90, v: 13 }] });
  const car = sim.list[0];
  let t = t0, maxFront = -Infinity, stoppedFront = null;
  while (R.signalState(net, t, sig.id, lane) !== 'G') {
    T.step(sim, DT, t, null); t += DT;
    maxFront = Math.max(maxFront, car.s + car.l / 2);
    if (car.v < 0.01) stoppedFront = car.s + car.l / 2;
  }
  assert(stoppedFront !== null, '정지하지 않음');
  assert(maxFront <= st.s + 1e-6, '정지선 넘음: ' + (maxFront - st.s));
  assert(st.s - stoppedFront <= 2, '정지선과 거리 ' + (st.s - stoppedFront));
  for (let i = 0; i < 30 * 8; i++) { T.step(sim, DT, t, null); t += DT; }
  assert(car.laneId !== lane || car.s + car.l / 2 > st.s + 5, '녹색에 출발하지 않음');
});

test('금지 구간(canChange false)에서는 차선 변경을 시작하지 않음', () => {
  const net = R.newNet();
  R.straightRoad(net, { id: 'm', x: 0, y: 0, a: 0, length: 900, lanesFwd: 3, lanesBack: 0, limit: 60, solidEnd: 350, solidStart: 150 });
  const sim = T.create(net, { seed: 3, density: 'rush' });
  const was = new Map();
  let starts = 0;
  for (let i = 0; i < 300 * 30; i++) {
    const before = new Map(sim.list.map(c => [c.id, { laneId: c.laneId, s: c.s, from: c.from }]));
    T.step(sim, DT, i * DT, null);
    for (const c of sim.list) {
      if (c.from && !was.get(c.id)) {
        starts++;
        const b = before.get(c.id);
        assert(R.canChange(net, c.from, c.laneId, b.s), `금지 구간 변경: ${c.from}→${c.laneId} s=${b.s.toFixed(1)}`);
      }
      was.set(c.id, !!c.from);
    }
  }
  assert(starts > 10, 'starts=' + starts);
});

test('같은 시드 → 같은 궤적, 다른 시드 → 다름', () => {
  const run = seed => {
    const { net } = crossNet({ cycle: 80, protectedLeft: true });
    const sim = T.create(net, { seed, density: 'normal' });
    for (let i = 0; i < 100 * 30; i++) T.step(sim, DT, i * DT, null);
    return JSON.stringify(T.cars(sim)) + JSON.stringify(T.peds(sim));
  };
  const a = run(11), b = run(11), c = run(12);
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, c);
});

test('플레이어를 앞차로 인식해 뒤에서 감속·정지', () => {
  const net = R.newNet();
  const r = R.straightRoad(net, { id: 'm', x: 0, y: 0, a: 0, length: 600, lanesFwd: 2, lanesBack: 0, limit: 50, solidEnd: 600 });
  const lane = net.lanes[r.fwd[1]], pp = R.pointAt(lane, 300);
  const player = { x: pp.x, y: pp.y, th: 0, v: 0, laneId: r.fwd[1], s: 300, offset: 0 };
  const sim = T.create(net, { seed: 2, density: 'none', spawn: [{ laneId: r.fwd[1], s: 100, v: 13.9 }] });
  const car = sim.list[0];
  let minGap = Infinity, braked = false;
  for (let i = 0; i < 40 * 30; i++) {
    T.step(sim, DT, i * DT, player);
    minGap = Math.min(minGap, 300 - 4.39 / 2 - (car.s + car.l / 2));
    if (car.a < -1) braked = true;
    checkFrame(sim, player, 'player');
  }
  assert(braked, '감속 없음');
  assert(car.v < 0.05, 'v=' + car.v);
  assert(minGap > 1, 'minGap=' + minGap);
  assert.strictEqual(car.laneId, r.fwd[1]);
});

test('비보호 좌회전: 마주 오는 차 간격이 충분할 때만 진입, 충돌 없음', () => {
  const { net, roads, sig } = crossNet({ cycle: 80, protectedLeft: false }, { turns: [['left', 'straight'], ['straight', 'right']], len: 320 });
  const leftLane = roads[0].fwd[0], oppLane = roads[2].fwd[0], st = R.stopOf(net, leftLane);
  const t0 = findTime(net, sig, leftLane, 'G');
  // 좌회전 차는 정지선 근처, 마주 오는 직진 차 A는 곧 도착(간격 부족), B는 한참 뒤(간격 충분)
  const sim = T.create(net, { seed: 5, density: 'none', spawn: [
    { laneId: leftLane, s: st.s - 6, v: 0, turn: 'left' },
    { laneId: oppLane, s: st.s - 45, v: 13, turn: 'straight' },
    { laneId: oppLane, s: st.s - 220, v: 13, turn: 'straight' }] });
  const [L, A, B] = sim.list;
  const conn = net.lanes[leftLane].next.find(id => net.lanes[id].turn === 'left');
  let t = t0, enteredAt = null, aPassed = null, bAtEntry = null;
  for (let i = 0; i < 25 * 30; i++) {
    T.step(sim, DT, t, null); t += DT;
    checkFrame(sim, null, 'unprotected');
    if (aPassed === null && A.laneId !== oppLane && net.lanes[A.laneId].kind !== 'connector') aPassed = t;
    if (enteredAt === null && L.laneId === conn) {
      enteredAt = t;
      bAtEntry = roads[2].fwd.includes(B.laneId) ? st.s - B.s : -1; // B는 차선을 바꿀 수 있음
    }
  }
  assert(enteredAt !== null, '좌회전 진입 안 함');
  assert(aPassed !== null && enteredAt >= aPassed - 1.0, `A가 지나가기 전에 진입: enter ${enteredAt} A ${aPassed}`);
  assert(bAtEntry > 13 * 3, 'B와 간격 부족한데 진입: ' + bAtEntry);
});

test('우회전 AI: 횡단보도에 보행자가 있으면 정지, 지나간 뒤 출발', () => {
  const { net, roads, sig } = crossNet({ cycle: 90, protectedLeft: true });
  const lane = roads[0].fwd[2], st = R.stopOf(net, lane);
  const t0 = findTime(net, sig, lane, 'G');
  const rconn = net.lanes[net.lanes[lane].next.find(id => net.lanes[id].turn === 'right')];
  const outArm = rconn.toArm, cw = net.crosswalks.find(c => c.arm === outArm);
  const sim = T.create(net, { seed: 4, density: 'none', spawn: [{ laneId: lane, s: st.s - 60, v: 10, turn: 'right' }] });
  const car = sim.list[0];
  T.addPed(sim, cw.id, { from: 0, delay: 0, speed: 1.2 });
  let t = t0, enteredWhileBusy = false, pedGoneAt = null, enteredAt = null;
  for (let i = 0; i < 40 * 30; i++) {
    T.step(sim, DT, t, null); t += DT;
    const busy = T.peds(sim).length > 0;
    if (!busy && pedGoneAt === null) pedGoneAt = t;
    if (car.laneId === rconn.id && enteredAt === null) { enteredAt = t; if (busy) enteredWhileBusy = true; }
    const pb = T.peds(sim);
    for (const p of pb) assert(K.pointDist(box(T.cars(sim)[0]), p.x, p.y) > 0.3, '보행자와 충돌');
  }
  assert(!enteredWhileBusy, '보행자가 있는데 진입');
  assert(pedGoneAt !== null && enteredAt !== null && enteredAt >= pedGoneAt, `enter ${enteredAt} ped ${pedGoneAt}`);
});

test('cut-in 스크립트: 지정 위치에서 깜빡이 후 플레이어 차로로 이동', () => {
  const net = R.newNet();
  const r = R.straightRoad(net, { id: 'm', x: 0, y: 0, a: 0, length: 800, lanesFwd: 3, lanesBack: 0, limit: 50 });
  const pl = r.fwd[1];
  const sim = T.create(net, { seed: 9, density: 'none', scripts: [
    { id: 'cutin', spawn: { laneId: r.fwd[0], s: 40, v: 10 }, when: { lanes: [pl], s: 200 }, action: 'cut-in', gap: 8 }] });
  const car = sim.list[0];
  const player = { x: 0, y: 0, th: 0, v: 10, laneId: pl, s: 60, offset: 0 };
  let blinkAt = null, changeAt = null, firedS = null;
  for (let i = 0; i < 40 * 30; i++) {
    const p = R.pointAt(net.lanes[pl], player.s);
    player.x = p.x; player.y = p.y;
    T.step(sim, DT, i * DT, player);
    checkFrame(sim, player, 'cutin');
    const out = T.cars(sim)[0];
    if (blinkAt === null && out.blink === 1) { blinkAt = i * DT; firedS = player.s; }
    if (changeAt === null && car.from) changeAt = i * DT;
    player.s += player.v * DT;
  }
  assert(blinkAt !== null, '깜빡이 없음');
  assert(firedS >= 200 && firedS < 205, 'firedS=' + firedS);
  assert(changeAt !== null && changeAt - blinkAt >= 1.0, `깜빡이 후 변경: blink ${blinkAt} change ${changeAt}`);
  assert.strictEqual(car.laneId, pl);
  assert(!car.from);
  assert(car.s > player.s, '플레이어 앞으로');
});
for (const [name, fn] of tests) {
  try { fn(); console.log('ok  ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n  ' + e.message); }
}
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('all ' + tests.length + ' passed');
