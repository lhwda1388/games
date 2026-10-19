const assert = require('assert');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let fail = 0;
// node bungbung/test/car.test.js
const C = require('../car.js');
const D2R = Math.PI / 180;
const idle = { steerRate: 0, throttle: 0, brake: 0 };

test('최대 조향 시 바깥 앞바퀴 회전반경 = 5.3m', () => {
  const c = C.create({ x: 0, y: 0, th: 0 });
  assert(C.setGear(c, 'D'));
  c.wheel = 450;
  const tc = C.turnCenter(c);
  let maxErr = 0;
  for (let i = 0; i < 6000 && c.th < 2 * Math.PI; i++) {
    C.step(c, idle, 1 / 120);
    const [fx, fy] = C.toWorld(c, c.spec.wheelbase, -c.spec.track / 2);
    maxErr = Math.max(maxErr, Math.abs(Math.hypot(fx - tc[0], fy - tc[1]) - 5.3));
  }
  assert(c.th >= 2 * Math.PI, '한 바퀴를 못 돎: th=' + c.th);
  assert(maxErr < 0.05, 'maxErr=' + maxErr);
});

test('크리핑 속도가 약 5km/h로 수렴', () => {
  const c = C.create({ x: 0, y: 0, th: 0 });
  C.setGear(c, 'D');
  for (let i = 0; i < 600; i++) C.step(c, idle, 1 / 60);
  assert(Math.abs(c.v - 5 / 3.6) < 0.1, 'v=' + c.v);
  C.setGear(c, 'R'); // 움직이는 중이라 거부
  assert.strictEqual(c.gear, 'D');
});

test('R 크리핑은 뒤로', () => {
  const c = C.create({ x: 0, y: 0, th: 0 });
  C.setGear(c, 'R');
  for (let i = 0; i < 120; i++) C.step(c, idle, 1 / 60);
  assert(c.v < 0 && c.x < 0);
});

test('8도 오르막에서 브레이크를 떼면 뒤로 밀리고, 밟으면 정지 유지', () => {
  const c = C.create({ x: 0, y: 0, th: 0 });
  C.setGear(c, 'D');
  for (let i = 0; i < 60; i++) C.step(c, { steerRate: 0, throttle: 0, brake: 1 }, 1 / 60, 8 * D2R);
  assert.strictEqual(c.v, 0);
  for (let i = 0; i < 60; i++) C.step(c, idle, 1 / 60, 8 * D2R);
  assert(c.v < 0, 'v=' + c.v);
});

test('P에서는 움직이지 않음', () => {
  const c = C.create({ x: 0, y: 0, th: 0 });
  for (let i = 0; i < 60; i++) C.step(c, { steerRate: 0, throttle: 1, brake: 0 }, 1 / 60);
  assert.strictEqual(c.x, 0);
});

test('핸들은 ±450에서 멈추고 키를 떼도 그대로', () => {
  const c = C.create({ x: 0, y: 0, th: 0 });
  for (let i = 0; i < 120; i++) C.step(c, { steerRate: 1, throttle: 0, brake: 0 }, 1 / 60);
  assert.strictEqual(c.wheel, 450);
  C.step(c, idle, 1 / 60);
  assert.strictEqual(c.wheel, 450);
  C.step(c, { steerAbs: -999, throttle: 0, brake: 0 }, 1 / 60);
  assert.strictEqual(c.wheel, -450);
});

test('차체 박스 중심은 뒷축에서 1.335m 앞', () => {
  const c = C.create({ x: 0, y: 0, th: Math.PI / 2 });
  const b = C.bodyBox(c);
  assert(Math.abs(b.x) < 1e-9 && Math.abs(b.y - 1.335) < 1e-9);
  assert.strictEqual(b.l, 4.39);
});

test('poseFromCenter: 그 자세로 만든 차의 차체 중심이 주어진 점', () => {
  const p = C.poseFromCenter(3, -2, 0.7);
  assert(Math.abs(p.th - 0.7) < 1e-12);
  const b = C.bodyBox(C.create(p));
  assert(Math.abs(b.x - 3) < 1e-9 && Math.abs(b.y + 2) < 1e-9);
  const spec = Object.assign({}, C.SELTOS, { length: 4.8, wheelbase: 2.9, rearOverhang: 1.0 });
  const b2 = C.bodyBox(C.create(C.poseFromCenter(3, -2, 0.7, spec), spec));
  assert(Math.abs(b2.x - 3) < 1e-9 && Math.abs(b2.y + 2) < 1e-9);
});

test('predict는 현재 조향으로 dist만큼 이동한 자세를 돌려줌', () => {
  const c = C.create({ x: 0, y: 0, th: 0 });
  const p = C.predict(c, 5, -1, 10);
  assert.strictEqual(p.length, 10);
  assert(Math.abs(p[9].x + 5) < 1e-9 && Math.abs(p[9].y) < 1e-9);
});
for (const [name, fn] of tests) {
  try { fn(); console.log('ok  ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n  ' + e.message); }
}
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('all ' + tests.length + ' passed');
