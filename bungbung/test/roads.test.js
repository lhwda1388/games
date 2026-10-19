const assert = require('assert');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let fail = 0;
// node bungbung/test/roads.test.js
const C = require('../car.js');
const R = require('../roads.js');
const PI = Math.PI;
const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, (msg || '') + ` ${a} vs ${b} (±${tol})`);
const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

// 사거리: 팔 도로는 바깥 끝에서 교차로 쪽으로 진행(fwd = 진입 차로)
function crossNet(opts = {}) {
  const net = R.newNet(), H = 12, len = 120, roads = [];
  const turns = opts.turns || [['left'], ['straight'], ['straight', 'right']];
  for (let k = 0; k < 4; k++) {
    const d = k * PI / 2;
    roads.push(R.straightRoad(net, { id: 'a' + k, x: Math.cos(d) * (H + len), y: Math.sin(d) * (H + len), a: d + PI,
      length: len, lanesFwd: 3, lanesBack: 3, width: 3.2, limit: 50, solidEnd: 30 }));
  }
  const j = R.junction4(net, { id: 'J', x: 0, y: 0, a: 0, arms: roads.map(road => ({ road, turns })),
    signal: opts.signal === undefined ? { cycle: 90, protectedLeft: true } : opts.signal, crosswalks: true });
  return { net, roads, j };
}

test('vMax: 상태별 최고 속도, 기본은 20km/h 유지', () => {
  const run = vMax => {
    const c = C.create({ x: 0, y: 0, th: 0 });
    if (vMax != null) c.vMax = vMax;
    C.setGear(c, 'D');
    for (let i = 0; i < 30 * 60; i++) C.step(c, { throttle: 1 }, 1 / 60);
    return c.v;
  };
  const v = run(60 / 3.6);
  assert(v <= 60 / 3.6 + 1e-9, 'v=' + v);
  assert(v > 20 / 3.6, '20km/h를 넘어야 함: ' + v);
  assert(run(null) <= 20 / 3.6 + 1e-9);
});

test('직선 편도 3차로: 차로 수·간격·1차로가 중앙선 쪽(진행 방향 왼쪽)·길이', () => {
  const net = R.newNet();
  const r = R.straightRoad(net, { id: 'm', x: 10, y: -5, a: 0.3, length: 200, lanesFwd: 3, lanesBack: 3, width: 3.25, limit: 50 });
  assert.strictEqual(r.fwd.length, 3);
  assert.strictEqual(r.back.length, 3);
  const P = r.fwd.map(id => R.pointAt(net.lanes[id], 50));
  near(dist(P[0], P[1]), 3.25, 1e-6, '1-2 간격');
  near(dist(P[1], P[2]), 3.25, 1e-6, '2-3 간격');
  const center = r.at(50); // 중앙선 위 점
  // 중앙선은 각 차로의 왼쪽(+), 1차로가 가장 가까움
  near(R.project(net, center.x, center.y, r.fwd[0]).offset, 3.25 / 2, 1e-6, '1차로 기준 중앙선 오프셋');
  const dC = r.fwd.map(id => dist(R.pointAt(net.lanes[id], 50), center));
  assert(dC[0] < dC[1] && dC[1] < dC[2], '1차로가 중앙선에 가장 가까움');
  near(R.laneLength(net.lanes[r.fwd[0]]), 200, 1e-6);
  near(R.laneLength(net.lanes[r.back[2]]), 200, 1e-6);
  // 반대 방향 1차로도 중앙선이 진행 방향 왼쪽
  const b1 = net.lanes[r.back[0]];
  const pb = R.pointAt(b1, 150);
  const cb = r.at(50);
  const lb = { x: pb.x - Math.sin(pb.a) * 3.25 / 2, y: pb.y + Math.cos(pb.a) * 3.25 / 2 }; // b1 왼쪽 반 차로
  near(dist(lb, cb), 0, 1e-6, '반대 방향 1차로 왼쪽이 중앙선');
  assert.strictEqual(net.lanes[r.fwd[0]].left, null);
  assert.strictEqual(net.lanes[r.fwd[0]].right, r.fwd[1]);
  assert.strictEqual(net.lanes[r.fwd[2]].left, r.fwd[1]);
  assert(net.lines.some(l => l.type === 'yellow-double'));
});

test('곡선 도로: 차로 길이 ≈ 반경×각도(±1%)', () => {
  const net = R.newNet();
  const r = R.curvedRoad(net, { id: 'c', x: 0, y: 0, a: 0, radius: 200, angle: PI / 2, lanesFwd: 2, lanesBack: 1, width: 3.2 });
  const L1 = R.laneLength(net.lanes[r.fwd[0]]);
  near(L1 / (200 * PI / 2), 1, 0.01, '1차로 ≈ R×θ');
  // 차로별 정확한 반경(좌회전 곡선이면 오른쪽 차로가 바깥)
  [[r.fwd[0], 201.6], [r.fwd[1], 204.8], [r.back[0], 198.4]].forEach(([id, rad]) => {
    near(R.laneLength(net.lanes[id]) / (rad * PI / 2), 1, 0.01, id);
  });
  near(dist(r.end, { x: 200, y: 200 }), 0, 1e-6, '끝점');
  near(r.end.a, PI / 2, 1e-9);
});

test('project: 차로 중심 offset≈0, 왼쪽 1m = +1, s 정확도 ±0.05m (직선·곡선)', () => {
  const net = R.newNet();
  const s1 = R.straightRoad(net, { id: 's', x: 0, y: 0, a: 0.7, length: 150, lanesFwd: 2, lanesBack: 0 });
  const c1 = R.curvedRoad(net, { id: 'k', x: 500, y: 500, a: 0, radius: 60, angle: -PI / 2, lanesFwd: 1, lanesBack: 0 });
  for (const [id, s] of [[s1.fwd[0], 37.3], [s1.fwd[1], 120], [c1.fwd[0], 40]]) {
    const ln = net.lanes[id], p = R.pointAt(ln, s);
    const a = R.project(net, p.x, p.y, id);
    assert.strictEqual(a.laneId, id);
    near(a.offset, 0, 1e-3, 'center offset');
    near(a.s, s, 0.05, 's');
    const lx = p.x - Math.sin(p.a), ly = p.y + Math.cos(p.a);
    const b = R.project(net, lx, ly, id);
    assert.strictEqual(b.laneId, id);
    near(b.offset, 1, 0.02, 'left 1m');
    near(b.s, s, 0.05, 's left');
    near(b.heading, p.a, 0.03, 'heading');
  }
  // 힌트 없이도 가장 가까운 차로
  const p = R.pointAt(net.lanes[s1.fwd[1]], 80);
  assert.strictEqual(R.project(net, p.x, p.y).laneId, s1.fwd[1]);
});

test('junction4: turns대로 connector 연결, next = 나가는 차로, 진입 차로마다 정지선, 시작점 0.05m 이내', () => {
  const { net, roads, j } = crossNet();
  const outOf = k => new Set(roads[k].back);
  const target = { left: 3, straight: 2, right: 1, uturn: 0 }; // 팔 k(교차로를 향해 진행)에서 회전별 도착 팔 (k+n)%4
  for (let k = 0; k < 4; k++) {
    roads[k].fwd.forEach((inId, idx) => {
      const lane = net.lanes[inId], turns = [['left'], ['straight'], ['straight', 'right']][idx];
      const conns = lane.next.map(id => net.lanes[id]);
      assert.deepStrictEqual(conns.map(c => c.turn).sort(), turns.slice().sort(), inId);
      for (const c of conns) {
        assert.strictEqual(c.kind, 'connector');
        assert.strictEqual(c.next.length, 1);
        assert(outOf((k + target[c.turn]) % 4).has(c.next[0]), `${c.id} → ${c.next[0]}`);
        const e = R.pointAt(lane, R.laneLength(lane)), s0 = R.pointAt(c, 0);
        assert(dist(e, s0) <= 0.05, 'connector start');
        const o = net.lanes[c.next[0]];
        assert(dist(R.pointAt(c, R.laneLength(c)), R.pointAt(o, 0)) <= 0.05, 'connector end');
      }
      const st = net.stops.filter(s => s.laneId === inId);
      assert.strictEqual(st.length, 1, 'stop ' + inId);
      assert(st[0].s < R.laneLength(lane) - 4, '정지선은 횡단보도 앞');
    });
  }
  // 좌회전 1차로 → 나가는 1차로, 우회전 → 바깥 차로
  const lc = net.lanes[net.lanes[roads[0].fwd[0]].next[0]];
  assert.strictEqual(lc.next[0], roads[3].back[0]);
  const rc = net.lanes[net.lanes[roads[0].fwd[2]].next.find(id => net.lanes[id].turn === 'right')];
  assert.strictEqual(rc.next[0], roads[1].back[2]);
  // 좌회전 원호: 진입 각도 → +90°
  near(R.pointAt(lc, R.laneLength(lc)).a - R.pointAt(lc, 0).a, PI / 2, 0.05);
  assert.strictEqual(j.crosswalks.length, 4);
  assert.strictEqual(net.crosswalks.length, 4);
  assert(net.lines.filter(l => l.type === 'stop').length === 4);
  assert(net.areas.some(a => a.kind === 'junction'));
  assert.throws(() => R.junction4(net, { id: 'bad', x: 0, y: 0, arms: roads.slice(0, 2).map(road => ({ road, turns: [['left'], ['straight'], ['right']] })) }));
});

test('junction3: 삼거리 연결', () => {
  const net = R.newNet(), H = 10;
  const w = R.straightRoad(net, { id: 'w', x: -H - 100, y: 0, a: 0, length: 100, lanesFwd: 2, lanesBack: 2 });
  const e = R.straightRoad(net, { id: 'e', x: H, y: 0, a: 0, length: 100, lanesFwd: 2, lanesBack: 2 }); // 교차로에서 시작
  const s = R.straightRoad(net, { id: 's', x: 0, y: -H - 80, a: PI / 2, length: 80, lanesFwd: 1, lanesBack: 1 });
  R.junction3(net, { id: 'T', x: 0, y: 0, arms: [
    { road: w, turns: [['straight'], ['straight', 'right']] },
    { road: e, turns: [['straight', 'left'], ['straight']] },
    { road: s, turns: [['left', 'right']] }], signal: { cycle: 60, protectedLeft: true }, crosswalks: false });
  const eIn = net.lanes['e:b1']; // e 도로는 교차로에서 출발하므로 진입 = back
  assert.deepStrictEqual(eIn.next.map(id => net.lanes[id].turn).sort(), ['left', 'straight']);
  assert.strictEqual(net.lanes[eIn.next.find(id => net.lanes[id].turn === 'left')].next[0], 's:b1');
  assert.deepStrictEqual(net.lanes['s:f1'].next.map(id => net.lanes[id].next[0]).sort(), ['e:f2', 'w:b1'].sort(), '우회전은 바깥 차로, 좌회전은 1차로로');
  assert.strictEqual(net.stops.filter(x => x.junction === 'T').length, 5);
});

test('canChange: 버스전용 청색 실선 false, 청색 점선 true, 교차로 앞 백색 실선 false', () => {
  const net = R.newNet();
  const r = R.straightRoad(net, { id: 'b', x: 0, y: 0, a: 0, length: 400, lanesFwd: 3, lanesBack: 2, solidEnd: 30,
    bus: { side: 'right', s0: 0, s1: 400, dashedFrom: 300 } });
  const [l1, l2, l3] = r.fwd;
  assert.strictEqual(net.lanes[l3].kind, 'bus');
  assert.strictEqual(R.canChange(net, l2, l3, 100), false, '청색 실선 진입');
  assert.strictEqual(R.canChange(net, l3, l2, 100), false, '청색 실선 이탈');
  assert.strictEqual(R.canChange(net, l2, l3, 320), true, '청색 점선');
  assert.strictEqual(R.canChange(net, l1, l2, 100), true, '백색 점선');
  assert.strictEqual(R.canChange(net, l1, l2, 385), false, '교차로 앞 백색 실선');
  assert.strictEqual(R.canChange(net, l2, l1, 385), false);
  assert.strictEqual(R.canChange(net, l1, l3, 100), false, '이웃 아님');
  assert.strictEqual(R.canChange(net, 'b:b1', 'b:b2', 385), false, '반대 방향도 자기 진행 끝(도로 시작점 쪽) 실선');
  assert.strictEqual(R.canChange(net, 'b:b1', 'b:b2', 200), true);
  const types = new Set(net.lines.map(l => l.type));
  for (const t of ['blue-solid', 'blue-dashed', 'white-solid', 'white-dashed', 'yellow-double']) assert(types.has(t), t);
});

test('signalState: 주기별 상태, 보호 좌회전 phase에서 좌회전 진입 차로만 LG', () => {
  const { net, roads, j } = crossNet();
  const sig = net.signals.find(s => s.id === j.signal);
  assert.strictEqual(sig.heads, 'four');
  near(sig.phases.reduce((a, p) => a + p.dur, 0), sig.cycle, 1e-9);
  assert.strictEqual(sig.stops.length, 12);
  const left0 = roads[0].fwd[0], str0 = roads[0].fwd[1], str1 = roads[1].fwd[1], left2 = roads[2].fwd[0];
  const seen = new Set();
  let sawLG = false, sawStraightG = false;
  for (let t = 0; t < sig.cycle; t += 0.25) {
    const st = id => R.signalState(net, t, sig.id, id);
    seen.add(st(str0));
    assert.strictEqual(st(str0), R.signalState(net, t + sig.cycle, sig.id, str0), '주기성');
    for (const id of Object.keys(net.lanes)) {
      if (!net.stops.some(s => s.laneId === id)) continue;
      if (st(id) === 'LG') assert(net.lanes[id].next.every(c => net.lanes[c].turn === 'left'), 'LG는 좌회전 차로만: ' + id);
    }
    if (st(left0) === 'LG') { sawLG = true; assert.strictEqual(st(left2), 'LG'); assert.strictEqual(st(str0), 'R'); assert.strictEqual(st(str1), 'R'); }
    if (st(str0) === 'G') { sawStraightG = true; assert.strictEqual(st(left0), 'R'); assert.strictEqual(st(str1), 'R', '교차 방향은 적색'); }
  }
  assert(sawLG && sawStraightG);
  assert.deepStrictEqual([...seen].sort(), ['G', 'R', 'Y']);
  // 황색은 녹색 다음
  let prev = null;
  for (let t = 0; t < sig.cycle * 2; t += 0.25) {
    const s = R.signalState(net, t, sig.id, str0);
    if (s === 'Y' && prev !== 'Y') assert.strictEqual(prev, 'G');
    prev = s;
  }
  // 비보호: 3색, LG 없음, 좌회전 차로도 녹색, 비보호 표지
  const u = crossNet({ signal: { cycle: 60, protectedLeft: false } });
  const us = u.net.signals[0];
  assert.strictEqual(us.heads, 'three');
  assert(us.phases.every(p => Object.values(p.state).every(v => v !== 'LG')));
  assert(us.phases.some(p => p.state[u.roads[0].fwd[0]] === 'G'));
  assert(u.net.signs.some(s => s.kind === 'unprotected-left'));
  assert.strictEqual(R.movement('G', 'left', true), 'permissive');
  assert.strictEqual(R.movement('G', 'left', false), null);
  assert.strictEqual(R.movement('LG', 'left', false), 'protected');
  assert.strictEqual(R.movement('R', 'right', false), 'permissive');
  // 보행 신호: 평행 직진 phase에만
  const cw0 = net.crosswalks.find(c => c.arm === 0).id;
  for (let t = 0; t < sig.cycle; t += 0.5) {
    if (R.walkState(net, t, sig.id, cw0)) assert.strictEqual(R.signalState(net, t, sig.id, str0), 'R');
  }
  assert(sig.phases.some(p => p.walk.includes(cw0)));
});
for (const [name, fn] of tests) {
  try { fn(); console.log('ok  ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n  ' + e.message); }
}
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('all ' + tests.length + ' passed');
