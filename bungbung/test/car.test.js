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
    C.step(c, { ...idle, hold: true }, 1 / 120); // 핸들을 잡고 있음(복원 없음)
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

// 회귀: 엑셀이 크리핑 힘을 대체해서, 터치 페달을 살짝(0.2~0.5) 누르면 크리핑보다 약하고
// 8도 오르막에서는 D인데도 뒤로 밀렸다(모바일 "엑셀 동작 안 함, D인데 후진").
test('D에서 엑셀을 살짝만 밟아도 오르막에서 앞으로 간다', () => {
  for (const thr of [0.2, 0.5]) {
    const c = C.create({ x: 0, y: 0, th: 0 });
    C.setGear(c, 'D');
    for (let i = 0; i < 120; i++) C.step(c, { steerRate: 0, throttle: thr, brake: 0 }, 1 / 60, 8 * D2R);
    assert(c.v > 0 && c.x > 0, 'thr=' + thr + ' v=' + c.v + ' x=' + c.x);
  }
});

test('평지에서 엑셀을 살짝 밟으면 크리핑만 할 때보다 빨라진다', () => {
  const idleCar = C.create({ x: 0, y: 0, th: 0 }), gasCar = C.create({ x: 0, y: 0, th: 0 });
  C.setGear(idleCar, 'D'); C.setGear(gasCar, 'D');
  for (let i = 0; i < 30; i++) { C.step(idleCar, idle, 1 / 60); C.step(gasCar, { steerRate: 0, throttle: 0.2, brake: 0 }, 1 / 60); }
  assert(gasCar.v > idleCar.v, 'gas=' + gasCar.v + ' idle=' + idleCar.v);
});

test('R에서 엑셀을 살짝 밟으면 내리막 방향과 무관하게 뒤로 간다', () => {
  const c = C.create({ x: 0, y: 0, th: 0 });
  C.setGear(c, 'R');
  for (let i = 0; i < 120; i++) C.step(c, { steerRate: 0, throttle: 0.2, brake: 0 }, 1 / 60, -8 * D2R);
  assert(c.v < 0, 'v=' + c.v);
});

test('천천히 구르는 중에도 브레이크를 밟고 있으면 기어 변경 허용', () => {
  const c = C.create({ x: 0, y: 0, th: 0 });
  C.setGear(c, 'R');
  c.v = -0.4;
  assert.strictEqual(C.setGear(c, 'D'), false, '브레이크 없이 굴러가는 중엔 거부');
  assert.strictEqual(C.setGear(c, 'D', true), true, '브레이크 밟고 느리면 허용');
  assert.strictEqual(c.gear, 'D');
  assert.strictEqual(c.v, 0);
  c.v = 2;
  assert.strictEqual(C.setGear(c, 'R', true), false, '빠르면 브레이크를 밟아도 거부');
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
test('조향 복원: 정지 땐 유지, 100km/h 손 뗌 0.3초 안에 0(넘지 않음), 잡고 있으면(hold) 유지, 저속 주차 영향 미미', () => {
  const rest = (v, w, sec, ctl = idle) => { const c = C.create({ x: 0, y: 0, th: 0 }); c.gear = 'D'; c.v = v; c.vMax = 40; c.wheel = w; for (let i = 0; i < Math.round(sec * 60); i++) { c.v = v; C.step(c, ctl, 1 / 60); } return c.wheel; };
  assert.strictEqual(rest(0, 200, 1), 200);
  const w = rest(100 / 3.6, 30, 0.3); assert(w === 0, 'w=' + w);
  assert.strictEqual(rest(100 / 3.6, 30, 1), 0);
  assert.strictEqual(rest(100 / 3.6, -30, 1), 0);
  assert.strictEqual(rest(100 / 3.6, 30, 1, { steerRate: 0, hold: true }), 30);
  assert.strictEqual(rest(100 / 3.6, 30, 1, { steerRate: 0, steerAbs: 30 }), 30);
  assert.strictEqual(rest(5 / 3.6, 100, 1), 100, '10km/h 이하(주차·크리핑)는 복원 없음');
  assert(Math.abs(C.steerGain(0) - 1) < 1e-12);
  const g = C.steerGain(100 / 3.6); assert(g > 0.25 && g < 0.35, 'g=' + g);
});
test('빗길 grip 0.7: 같은 브레이크에 감속 0.7배, 정지 거리 약 1/0.7배', () => {
  const stopDist = grip => {
    const c = C.create({ x: 0, y: 0, th: 0 }); C.setGear(c, 'D'); c.vMax = 60 / 3.6; c.v = 50 / 3.6;
    if (grip != null) c.grip = grip;
    for (let i = 0; i < 6000 && c.v > 0; i++) C.step(c, { steerRate: 0, throttle: 0, brake: 1 }, 1 / 120);
    return c.x;
  };
  const dry = stopDist(null), wet = stopDist(0.7);
  // 감속 = 6·grip + 구름 0.15 → 비율 (6 + 0.15) / (4.2 + 0.15)
  assert(Math.abs(wet / dry - 6.15 / 4.35) < 0.02, `dry ${dry.toFixed(2)} wet ${wet.toFixed(2)}`);
  assert.strictEqual(stopDist(1), dry, 'grip 1 = 기본');
  assert.strictEqual(C.WET_GRIP, 0.7);
});
for (const [name, fn] of tests) {
  try { fn(); console.log('ok  ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n  ' + e.message); }
}
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('all ' + tests.length + ' passed');
