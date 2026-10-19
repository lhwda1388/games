const assert = require('assert');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let fail = 0;
// node bungbung/test/scoring.test.js
const C = require('../car.js');
const S = require('../scoring.js');
const PI = Math.PI, D2R = PI / 180;
// 차체 중심이 (cx,cy)이고 방향 th인 차
function carAt(cx, cy, th, gear = 'P') {
  const o = C.centerOffset(C.SELTOS);
  const c = C.create({ x: cx - Math.cos(th) * o, y: cy - Math.sin(th) * o, th });
  c.gear = gear;
  return c;
}
const slot = { type: 'slot', x: 0, y: 8, l: 5, w: 2.3, a: PI / 2, face: 'out', tolA: 8 * D2R };

test('slot: 후진 주차 완료', () => {
  assert(S.evalGoal(slot, carAt(0, 8, -PI / 2)).ok);
});
test('slot: 방향이 반대면 실패, any면 성공', () => {
  assert(!S.evalGoal(slot, carAt(0, 8, PI / 2)).ok);
  assert(S.evalGoal(Object.assign({}, slot, { face: 'any' }), carAt(0, 8, PI / 2)).ok);
});
test('slot: 기어가 P가 아니거나 칸을 벗어나면 실패', () => {
  assert(!S.evalGoal(slot, carAt(0, 8, -PI / 2, 'D')).ok);
  assert(!S.evalGoal(slot, carAt(0.4, 8, -PI / 2)).ok);
  assert(!S.evalGoal(slot, carAt(0, 8, -PI / 2 + 10 * D2R)).ok);
});
test('zone: 방향 조건', () => {
  const z = { type: 'zone', x: -14, y: 0, l: 8, w: 6.5, a: 0, th: PI, tolA: 20 * D2R };
  assert(S.evalGoal(z, carAt(-14, 0, PI, 'D')).ok);
  assert(!S.evalGoal(z, carAt(-14, 0, 0, 'D')).ok);
});
test('beside: 정산기에 운전석 쪽 붙이기', () => {
  const g = { type: 'beside', x: -0.5, y: 3.0, a: 0, side: 'left', gapMin: 0.15, gapMax: 0.5, alongTol: 0.6, anchor: 'driver', tolA: 6 * D2R };
  // 차 왼쪽 면 y = cy + 0.9 → 간격 0.3이면 cy = 1.8. 운전석 x = 뒷축 + 1.25 = -0.5 → 뒷축 -1.75 → 중심 -0.415
  const c = carAt(-1.75 + 1.335, 1.8, 0, 'D');
  assert(S.evalGoal(g, c).ok, JSON.stringify(S.evalGoal(g, c)));
  assert(!S.evalGoal(g, carAt(-1.75 + 1.335, 1.3, 0, 'D')).ok, '너무 멂');
  assert(!S.evalGoal(g, carAt(1.5, 1.8, 0, 'D')).ok, '정산기를 지나침');
  const moving = carAt(-0.415, 1.8, 0, 'D'); moving.v = 1;
  assert(!S.evalGoal(g, moving).ok, '움직이는 중');
});
test('beside: 반대 방향에서 fuel 쪽 판정', () => {
  const g = { type: 'beside', x: 0, y: 3.0, a: 0, side: 'fuel', gapMin: 0.3, gapMax: 0.9, alongTol: 0.8, anchor: 'fuel', tolA: 8 * D2R };
  // 주유구 왼쪽, 섬이 +y → 방향 0으로 들어와야 함. 주유구 x = 뒷축 + 0.15 = 0 → 뒷축 -0.15
  assert(S.evalGoal(g, carAt(-0.15 + 1.335, 3.0 - 0.5 - 0.9, 0)).ok);
  // 반대 방향(π)이면 왼쪽 면이 -y를 향해서 실패
  assert(!S.evalGoal(g, carAt(0.15 - 1.335, 3.0 - 0.5 - 0.9, PI)).ok);
});
test('run: 접촉은 닿기 시작할 때만, D↔R 전환 집계, via 후 goal', () => {
  const map = { par: 1, via: { type: 'zone', x: 0, y: 0, l: 30, w: 30, a: 0 }, goal: slot };
  const run = S.createRun(map);
  const c = carAt(50, 50, 0, 'D');
  S.tick(run, map, c, 0.1, true); S.tick(run, map, c, 0.1, true); S.tick(run, map, c, 0.1, false); S.tick(run, map, c, 0.1, true);
  assert.strictEqual(run.contacts, 2);
  c.gear = 'R'; S.tick(run, map, c, 0.1, false);
  c.gear = 'P'; S.tick(run, map, c, 0.1, false);
  c.gear = 'D'; S.tick(run, map, c, 0.1, false);
  assert.strictEqual(run.switches, 2);
  const parked = carAt(0, 8, -PI / 2);
  S.tick(run, map, parked, 0.1, false);
  assert(run.via && !run.done || run.done, 'via 통과');
  S.tick(run, map, parked, 0.1, false);
  assert(run.done);
  const r = S.result(run, map);
  assert.strictEqual(r.grade, '통과');
  assert(Math.abs(r.time - 0.9) < 1e-9);
});
test('better: 접촉 → 전환 → 시간 순', () => {
  assert(S.better({ contacts: 0, switches: 5, time: 99 }, { contacts: 1, switches: 0, time: 1 }));
  assert(S.better({ contacts: 1, switches: 1, time: 50 }, { contacts: 1, switches: 2, time: 10 }));
  assert(!S.better({ contacts: 1, switches: 1, time: 50 }, { contacts: 1, switches: 1, time: 10 }));
  assert(S.better({ contacts: 3, switches: 3, time: 3 }, null));
});
for (const [name, fn] of tests) {
  try { fn(); console.log('ok  ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n  ' + e.message); }
}
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('all ' + tests.length + ' passed');
