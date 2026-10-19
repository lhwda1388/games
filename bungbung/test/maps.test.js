const assert = require('assert');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let fail = 0;
// node bungbung/test/maps.test.js
const C = require('../car.js');
const K = require('../collision.js');
const S = require('../scoring.js');
const M = require('../maps.js');
const PI = Math.PI, D2R = PI / 180;
const carAtCenter = (cx, cy, th) => C.create(C.poseFromCenter(cx, cy, th));
// 목표를 만족하는 이상적인 자세
function idealCar(g) {
  if (g.type === 'beside') {
    const s = C.SELTOS, side = g.side === 'fuel' ? s.fuelSide : g.side;
    const n = [-Math.sin(g.a), Math.cos(g.a)], sgn = side === 'left' ? -1 : 1;
    const gap = (g.gapMin + g.gapMax) / 2 + s.width / 2;
    const anchorX = g.anchor === 'fuel' ? s.fuelX : s.driver.x;
    // 기준점이 (x,y)에 오도록: 뒷축 = 선 위 점 - 방향*anchorX + n*sgn*gap
    const c = C.create({
      x: g.x - Math.cos(g.a) * anchorX + n[0] * sgn * gap,
      y: g.y - Math.sin(g.a) * anchorX + n[1] * sgn * gap, th: g.a,
    });
    return c;
  }
  const th = g.type === 'slot' ? (g.face === 'out' ? g.a + PI : g.a) : (g.th ?? g.a);
  const c = carAtCenter(g.x, g.y, th);
  c.gear = 'P';
  return c;
}

test('15개, 묶음별 개수, id 중복 없음', () => {
  assert.strictEqual(M.list.length, 15);
  const count = {};
  for (const m of M.list) count[m.group] = (count[m.group] || 0) + 1;
  assert.deepStrictEqual(count, { apt: 5, mall: 3, street: 4, special: 3 });
  assert.strictEqual(new Set(M.list.map(m => m.id)).size, 15);
  assert.strictEqual(M.byId('apt-pillar').name.length > 0, true);
});

for (const m of M.list) {
  test(m.id + ': 시작 자세가 장애물과 겹치지 않음', () => {
    const c = C.create(M.startPose(m, C.SELTOS));
    assert.strictEqual(K.hit(C.bodyBox(c), m.obstacles), -1, '장애물 #' + K.hit(C.bodyBox(c), m.obstacles));
  });
  for (const key of ['goal', 'via']) {
    if (!m[key]) continue;
    test(m.id + ': ' + key + '를 만족하는 자세가 존재하고 장애물과 안 겹침', () => {
      const c = idealCar(m[key]);
      const i = K.hit(C.bodyBox(c), m.obstacles);
      assert.strictEqual(i, -1, '장애물 #' + i + ' ' + JSON.stringify(m.obstacles[i]));
      const r = S.evalGoal(m[key], c);
      assert(r.ok, JSON.stringify(r));
    });
  }
  test(m.id + ': 시작 자세에서 이미 목표 달성 상태가 아님', () => {
    const c = C.create(M.startPose(m, C.SELTOS));
    c.gear = 'P';
    assert(!S.evalGoal(m.goal, c).ok || m.via);
  });
}

test('startPose: 뒷축 형식은 그대로, 차체 중심 형식은 차종 오프셋만큼 뒤로', () => {
  assert.deepStrictEqual(M.startPose(M.byId('apt-pillar'), C.SELTOS), { x: -8, y: 2.75, th: 0 });
  const p = M.startPose(M.byId('apt-exit'), C.SELTOS);
  assert(Math.abs(p.x) < 1e-9 && Math.abs(p.y - (8 - 1.335)) < 1e-9 && p.th === PI / 2);
  const small = Object.assign({}, C.SELTOS, { length: 3.6, wheelbase: 2.4, rearOverhang: 0.6 });
  const q = M.startPose(M.byId('apt-exit'), small);
  assert(Math.abs(q.y - (8 - C.centerOffset(small))) < 1e-9);
  const b = C.bodyBox(C.create(q, small));
  assert(Math.abs(b.x) < 1e-9 && Math.abs(b.y - 8) < 1e-9);
});

test('높이: 나선 경사로와 경사 골목', () => {
  const sp = M.byId('apt-ramp');
  assert(Math.abs(M.heightAt(sp, 10, 0) + 1) < 1e-9);
  assert.strictEqual(M.heightAt(sp, 25, 6), -2);
  assert.strictEqual(M.heightAt(sp, -7, 12), -4);
  assert.strictEqual(M.heightAt(sp, -7, 0), 0);
  const sl = M.byId('street-slope');
  const grade = Math.atan((M.heightAt(sl, 10, 3) - M.heightAt(sl, 0, 3)) / 10) / D2R;
  assert(Math.abs(grade - 8) < 0.3, 'grade=' + grade);
});
for (const [name, fn] of tests) {
  try { fn(); console.log('ok  ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n  ' + e.message); }
}
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('all ' + tests.length + ' passed');
