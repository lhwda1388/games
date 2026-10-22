const assert = require('assert');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let fail = 0;
// node bungbung/test/roads-highway.test.js
const R = require('../roads.js');
require('../roads-highway.js');
const N = require('../nav.js');
const near = (a, b, tol, msg) => assert(Math.abs(a - b) <= tol, (msg || '') + ` ${a} vs ${b} (±${tol})`);
const end = (net, id) => { const l = net.lanes[id]; return R.pointAt(l, R.laneLength(l)); };
const hw = (net, o) => R.highway(net, Object.assign({ id: 'm', x: 0, y: 0, a: 0, length: 3000, lanes: 3 }, o));

test('newNet: walls 배열', () => {
  assert.deepStrictEqual(R.newNet().walls, []);
});

test('highway 3차로: 폭 3.6, 1차로가 중앙분리대 쪽, 갓길, minSpeed, 벽·표지판', () => {
  const net = R.newNet(), m = hw(net, {});
  assert.deepStrictEqual(m.fwd, ['m:f1', 'm:f2', 'm:f3']);
  for (const id of m.fwd) {
    assert.strictEqual(net.lanes[id].width, 3.6);
    assert.strictEqual(net.lanes[id].minSpeed, 50);
    assert.strictEqual(net.lanes[id].limit, 100);
  }
  const sh = net.lanes[m.shoulderId];
  assert.strictEqual(sh.kind, 'shoulder');
  assert.strictEqual(sh.width, 3.0);
  assert.strictEqual(sh.minSpeed, 50);
  assert.strictEqual(net.lanes['m:f3'].right, m.shoulderId);
  assert(!R.canChange(net, 'm:f3', m.shoulderId, 500), '갓길 진입 금지');
  assert(R.canChange(net, 'm:f2', 'm:f3', 500));
  // a=0이면 왼쪽 = +y. 1차로가 중앙분리대(y=0)에 가장 가깝고 갓길이 가장 바깥
  const med = net.walls.find(w => w.kind === 'median'), rail = net.walls.find(w => w.kind === 'rail');
  assert(med && rail);
  near(med.pts[0][1], 0, 1e-9);
  near(R.pointAt(net.lanes['m:f1'], 10).y, -1.8, 1e-9);
  near(R.pointAt(net.lanes['m:f3'], 10).y, -9.0, 1e-9);
  near(R.pointAt(sh, 10).y, -12.3, 1e-9);
  near(rail.pts[0][1], -13.8, 1e-9);
  const lim = net.signs.find(s => s.kind === 'limit'), min = net.signs.find(s => s.kind === 'min-speed');
  assert(lim && min);
  assert.strictEqual(lim.limit, 100); assert.strictEqual(min.limit, 50);
  near(lim.x, 30, 1e-9);
});

test('highway: 곡선과 gapCheck 노면표시 3개(50m 간격)', () => {
  const net = R.newNet(), m = hw(net, { lanes: 2, curved: { radius: 1000, angle: 0.3 }, gapCheck: 400 });
  near(m.length, 300, 1e-9);
  const g = net.marks.filter(k => k.kind === 'gap-check');
  assert.deepStrictEqual(g.map(k => k.label), ['0m', '50m', '100m']);
  near(Math.hypot(g[1].x - g[0].x, g[1].y - g[0].y), 50, 0.5);
});

test('onRamp: 램프 끝 = 가속차로 시작, 합류 허용 구간, 끝 막힘', () => {
  const net = R.newNet(), m = hw(net, { lanes: 2 });
  const r = R.onRamp(net, { id: 'on', main: m, at: 500 });
  const ramp = net.lanes[r.rampId], acc = net.lanes[r.accelId];
  const pe = end(net, r.rampId), ps = R.pointAt(acc, 0);
  assert(Math.hypot(pe.x - ps.x, pe.y - ps.y) <= 0.05);
  assert.deepStrictEqual(ramp.next, [r.accelId]);
  assert.strictEqual(ramp.limit, 80);
  assert.strictEqual(acc.kind, 'accel');
  assert.strictEqual(acc.left, 'm:f2');
  assert.strictEqual(net.lanes['m:f2'].left, 'm:f1');
  assert.deepStrictEqual(acc.next, []);
  const L = R.laneLength(acc);
  near(L, 250, 1e-6);
  near(ps.x, 500, 1e-9);
  assert(!R.canChange(net, r.accelId, 'm:f2', 10));
  assert(R.canChange(net, r.accelId, 'm:f2', 31));
  assert(R.canChange(net, r.accelId, 'm:f2', L - 21));
  assert(!R.canChange(net, r.accelId, 'm:f2', L - 10));
  // 옆 차로 위치 대응: 가속차로 s → 본선 s
  near(R.mapS(net, r.accelId, 'm:f2', 100), 600, 1e-9);
  near(R.mapS(net, 'm:f2', r.accelId, 600), 100, 1e-9);
  // 램프에서 본선 끝까지 경로
  const rt = N.route(net, r.rampId, 0, 'm:f1', 2900);
  assert(rt && rt.lanes.includes(r.accelId));
  // 가드레일이 램프 구간에서 끊긴다
  const rails = net.walls.filter(w => w.kind === 'rail' && w.hw === 'm');
  assert(rails.length >= 2);
  assert(!rails.some(w => w.t0 < 600 && w.t1 > 600), '가속차로 옆 본선 가드레일 없음');
});

test('offRamp: 본선 시작 → 감속차로 → 램프 끝 경로, 안내판 2km·1km·500m', () => {
  const net = R.newNet(), m = hw(net, {});
  const r = R.offRamp(net, { id: 'off', main: m, at: 2200, name: '가온' });
  const dec = net.lanes[r.decelId];
  assert.strictEqual(dec.kind, 'decel');
  assert.strictEqual(net.lanes['m:f3'].right, r.decelId);
  assert.deepStrictEqual(dec.next, [r.rampId]);
  assert.strictEqual(net.lanes[r.rampId].limit, 60);
  const rt = N.route(net, 'm:f1', 0, r.rampId, R.laneLength(net.lanes[r.rampId]));
  assert(rt, '경로 있음');
  assert(rt.lanes.includes(r.decelId));
  assert(R.canChange(net, 'm:f3', r.decelId, 2300));
  assert(!R.canChange(net, 'm:f3', r.decelId, 2100));
  const ov = net.signs.filter(s => s.kind === 'overhead');
  assert.deepStrictEqual(ov.map(s => s.dist).sort((a, b) => a - b), [500, 1000, 2000]);
  for (const s of ov) { assert.strictEqual(s.text, '가온 나들목'); assert.strictEqual(s.dir, 'right'); }
  near(ov.find(s => s.dist === 2000).x, 200, 1e-9);
});

test('split: 분기 300m 전 실선, 두 갈래 경로, 유도선 두 색, 표지판 2개', () => {
  const net = R.newNet(), m = hw(net, { length: 2000 });
  const r = R.split(net, { id: 'jc', from: m, keepLanes: 2, branchLanes: 1, names: { keep: '서울', branch: '대전' } });
  assert.strictEqual(r.keep.fwd.length, 2);
  assert.strictEqual(r.branch.fwd.length, 1);
  assert(!R.canChange(net, 'm:f2', 'm:f3', 1800));
  assert(!R.canChange(net, 'm:f3', 'm:f2', 1800));
  assert(R.canChange(net, 'm:f2', 'm:f3', 1600));
  assert(R.canChange(net, 'm:f1', 'm:f2', 1900), '같은 갈래 안은 허용');
  const kEnd = r.keep.fwd[0], bEnd = r.branch.fwd[0];
  assert(N.route(net, 'm:f1', 0, kEnd, 100), 'keep 경로');
  assert(N.route(net, 'm:f1', 0, bEnd, 100), 'branch 경로');
  const types = new Set(net.lines.map(l => l.type));
  assert(types.has('guide-green') && types.has('guide-pink'));
  const pink = net.lines.find(l => l.type === 'guide-pink');
  near(pink.pts[0][0], 1000, 1e-9, '분기 1km 전부터');
  const ov = net.signs.filter(s => s.kind === 'overhead');
  assert.strictEqual(ov.length, 2);
  assert.deepStrictEqual(ov.map(s => s.text).sort(), ['대전', '서울']);
  assert.strictEqual(ov.find(s => s.text === '대전').dir, 'right');
});

test('tollPlaza: 부스 6개, 하이패스 2개, 연결, 일반 부스에만 정지선', () => {
  const net = R.newNet(), m = hw(net, { lanes: 2, length: 500 });
  const t = R.tollPlaza(net, { id: 'tg', from: m });
  assert.strictEqual(t.booths.length, 6);
  assert.deepStrictEqual(t.booths.filter(b => b.toll === 'hipass').map(b => b.laneId), ['tg:t1', 'tg:t2']);
  const nexts = m.fwd.flatMap(id => net.lanes[id].next);
  for (const b of t.booths) {
    const ln = net.lanes[b.laneId];
    assert.strictEqual(ln.kind, 'toll');
    assert.strictEqual(ln.toll, b.toll);
    assert(nexts.includes(b.laneId), '입구 연결 ' + b.laneId);
    assert.strictEqual(ln.next.length, 1);
    assert(t.out.fwd.includes(ln.next[0]), '출구 연결 ' + b.laneId);
    const s0 = R.pointAt(ln, 0), eIn = m.fwd.map(id => end(net, id)).some(p => Math.hypot(p.x - s0.x, p.y - s0.y) <= 0.05);
    const e = end(net, b.laneId), o = R.pointAt(net.lanes[ln.next[0]], 0);
    assert(eIn && Math.hypot(e.x - o.x, e.y - o.y) <= 0.05);
    assert(b.stopS > 0 && b.stopS < R.laneLength(ln));
    const sp = R.pointAt(ln, b.stopS);
    const hasStop = net.lines.some(l => l.type === 'stop' && Math.hypot((l.pts[0][0] + l.pts[1][0]) / 2 - sp.x, (l.pts[0][1] + l.pts[1][1]) / 2 - sp.y) < 0.1);
    assert.strictEqual(hasStop, b.toll === 'normal', '정지선 ' + b.laneId);
  }
  assert(net.lines.some(l => l.type === 'blue-solid'));
  assert(N.route(net, 'm:f1', 0, t.out.fwd[0], 100));
});

test('restArea: 본선 → 휴게소 → 본선 복귀', () => {
  const net = R.newNet(), m = hw(net, { lanes: 2, length: 3000 });
  const r = R.restArea(net, { id: 'ra', main: m, at: 800, name: '솔내' });
  assert.strictEqual(net.lanes[r.entryId].limit, 30);
  assert(r.lotIds.length >= 1);
  const rt = N.route(net, 'm:f1', 0, 'm:f1', 2950);
  const viaRest = N.route(net, 'm:f1', 0, r.lotIds[0], 10);
  assert(rt && viaRest);
  const back = N.route(net, r.lotIds[0], 10, 'm:f1', 2950);
  assert(back, '휴게소 → 본선 복귀');
  assert(back.lanes.includes(r.exitAccelId));
  assert(net.signs.some(s => s.kind === 'overhead' && s.text === '솔내 휴게소'));
});

for (const [name, fn] of tests) {
  try { fn(); console.log('ok  ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n  ' + e.message); }
}
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('all ' + tests.length + ' passed');
