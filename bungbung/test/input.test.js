const assert = require('assert');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let fail = 0;
// node bungbung/test/input.test.js — 페달 깊이 모델과 터치 포인터 처리(가짜 DOM)
const C = require('../car.js');
const I = require('../input.js');
const D2R = Math.PI / 180, DT = 1 / 60;

// ── 가짜 DOM: input.create가 쓰는 만큼만 ──
function fakeEl(rect, data = {}) {
  const h = {}, cls = new Set();
  return {
    dataset: data, h, cls,
    addEventListener: (t, f) => { (h[t] = h[t] || []).push(f); },
    fire(t, e) { (h[t] || []).forEach(f => f(Object.assign({ preventDefault() {} }, e))); },
    getBoundingClientRect: () => rect,
    setPointerCapture() {},
    classList: { add: c => cls.add(c), remove: c => cls.delete(c) },
  };
}
function setup() {
  global.window = { addEventListener() {} };
  global.document = { body: { classList: { add() {} } } };
  const rect = (x, y, w, hgt) => ({ left: x, top: y, width: w, height: hgt, right: x + w, bottom: y + hgt });
  const els = {
    wheel: fakeEl(rect(0, 200, 150, 150), { pp: 'wheel' }),
    brake: fakeEl(rect(600, 200, 90, 150), { pp: 'brake' }),
    gas: fakeEl(rect(700, 200, 70, 150), { pp: 'gas' }),
  };
  const gears = ['P', 'R', 'N', 'D'].map(g => fakeEl(rect(500, 200, 56, 48), { gear: g }));
  const root = {
    querySelector: s => els[/"(\w+)"/.exec(s)[1]],
    querySelectorAll: s => (s === '[data-gear]' ? gears : []),
  };
  return { inp: I.create(root), els, gear: g => gears.find(b => b.dataset.gear === g) };
}
const frames = (inp, n) => { let o; for (let i = 0; i < n; i++) o = I.read(inp, 0, DT); return o; };

test('depthStep: 엑셀 약 1.2초, 브레이크 약 0.6초에 끝까지, 떼면 약 0.15초에 0', () => {
  let g = 0, b = 0;
  for (let i = 0; i < 37; i++) { g = I.depthStep(g, 1, 'gas', DT); b = I.depthStep(b, 1, 'brake', DT); }
  assert(Math.abs(g - 0.5) < 0.03 && b === 1, 'g=' + g + ' b=' + b);
  for (let i = 0; i < 36; i++) g = I.depthStep(g, 1, 'gas', DT);
  assert.strictEqual(g, 1);
  for (let i = 0; i < 9; i++) g = I.depthStep(g, null, 'gas', DT);
  assert.strictEqual(g, 0);
  assert(I.depthStep(0, 1, 'brake', DT, true) >= 0.4, '터치 브레이크는 첫 프레임부터 0.4 이상 물린다');
  assert(I.depthStep(0, 1, 'brake', DT) < 0.05, '키보드 브레이크는 서서히');
  assert.strictEqual(I.depthStep(0, 1, 'gas', DT) < 0.02, true, '엑셀은 서서히');
  assert.strictEqual(I.depthStep(0.8, 0.3, 'gas', 1), 0.3, '목표가 얕아지면 목표에서 멈춤');
});

test('핸들: pointerup이 유실된 grab이 있어도 새 pointerdown이 인계받아 조향된다', () => {
  const { inp, els } = setup();
  els.wheel.fire('pointerdown', { pointerId: 1, clientX: 75, clientY: 210 }); // pointerup 없이 방치
  els.wheel.fire('pointerdown', { pointerId: 2, clientX: 75, clientY: 210 });
  els.wheel.fire('pointermove', { pointerId: 2, clientX: 29, clientY: 229 });
  els.wheel.fire('pointermove', { pointerId: 2, clientX: 10, clientY: 275 }); // 위 → 왼쪽: 반시계 90°(45°씩)
  assert.strictEqual(inp.grab.id, 2);
  assert(inp.steerAbs > 0, 'steerAbs=' + inp.steerAbs);
  els.wheel.fire('lostpointercapture', { pointerId: 2 });
  assert.strictEqual(inp.grab, null);
});

test('터치 페달: 누르고 있으면 깊어지고 유지, 떼면 0으로', () => {
  const { inp, els } = setup();
  els.gas.fire('pointerdown', { pointerId: 5, clientX: 735, clientY: 330 });
  const a = frames(inp, 30).throttle, b = frames(inp, 60).throttle;
  assert(a > 0.3 && a < 0.6 && b === 1, 'a=' + a + ' b=' + b);
  assert(els.gas.cls.has('is-pressed'));
  els.gas.fire('pointerup', { pointerId: 5 });
  assert.strictEqual(frames(inp, 12).throttle, 0);
  assert(!els.gas.cls.has('is-pressed'));
});

test('터치 페달: 누른 채 아래로 밀면 얕은 깊이에서 멈춘다(위로 밀면 다시 깊게)', () => {
  const { inp, els } = setup();
  els.gas.fire('pointerdown', { pointerId: 1, clientX: 735, clientY: 280 });
  frames(inp, 36); // 약 0.5
  els.gas.fire('pointermove', { pointerId: 1, clientX: 735, clientY: 292 }); // 슬라이드 시작
  els.gas.fire('pointermove', { pointerId: 1, clientX: 735, clientY: 322 }); // 30px 아래 → 0.25 얕게
  const held = frames(inp, 120).throttle;
  assert(Math.abs(held - 0.25) < 0.03, 'held=' + held);
  els.gas.fire('pointermove', { pointerId: 1, clientX: 735, clientY: 232 }); // 위로 → 깊게
  assert.strictEqual(frames(inp, 120).throttle, 1);
});

test('핸들을 잡은 채 다른 손가락으로 엑셀: 서로 간섭 없음', () => {
  const { inp, els } = setup();
  els.wheel.fire('pointerdown', { pointerId: 1, clientX: 75, clientY: 210 });
  els.gas.fire('pointerdown', { pointerId: 2, clientX: 735, clientY: 330 });
  els.wheel.fire('pointermove', { pointerId: 1, clientX: 121, clientY: 229 });
  els.wheel.fire('pointermove', { pointerId: 1, clientX: 140, clientY: 275 }); // 위 → 오른쪽: 시계 90°(45°씩)
  els.gas.fire('pointermove', { pointerId: 1, clientX: 740, clientY: 300 }); // 핸들 손가락 이벤트는 페달에 영향 없음
  const o = frames(inp, 90);
  assert.strictEqual(o.throttle, 1);
  assert(o.steerAbs < -80, 'steerAbs=' + o.steerAbs);
  els.wheel.fire('pointercancel', { pointerId: 1 });
  assert.strictEqual(frames(inp, 1).throttle, 1, '핸들 손가락 취소가 엑셀을 떼지 않음');
});

test('브레이크를 누른 채 기어 탭(pointerdown만 와도) → 기어 요청', () => {
  const { inp, els, gear } = setup();
  els.brake.fire('pointerdown', { pointerId: 1, clientX: 645, clientY: 300 });
  gear('D').fire('pointerdown', { pointerId: 2, clientX: 520, clientY: 220 });
  const o = I.read(inp, 0, DT);
  assert.strictEqual(o.gearReq, 'D');
  assert(o.brake > 0);
  assert.strictEqual(I.read(inp, 0, DT).gearReq, null, '한 번 읽으면 비워짐');
});

test('원형 핸들: 아래를 지나 ±180° 경계를 넘어도 연속, 중심 근처는 무시, 끝에서 멈춤', () => {
  const { inp, els } = setup();
  const mv = (x, y) => els.wheel.fire('pointermove', { pointerId: 1, clientX: x, clientY: y });
  els.wheel.fire('pointerdown', { pointerId: 1, clientX: 10, clientY: 275 }); // 왼쪽(±180°)
  mv(29, 321); mv(75, 340);                     // 왼쪽 → 아래: 반시계 90°
  assert(Math.abs(inp.steerAbs - 180) < 1, 'ccw=' + inp.steerAbs);
  mv(75, 280); mv(140, 275);                    // 중심 근처(데드존)를 지나 오른쪽으로 → 각도 기준만 갱신
  assert(Math.abs(inp.steerAbs - 180) < 1, 'dead=' + inp.steerAbs);
  for (const [x, y] of [[121, 229], [75, 210], [29, 229], [10, 275], [29, 321], [75, 340], [121, 321], [140, 275], [121, 229], [75, 210], [29, 229], [10, 275]]) mv(x, y); // 오른쪽에서 반시계 한 바퀴 반(45°씩)
  assert.strictEqual(inp.steerAbs, 450, '한쪽 끝에서 멈춤');
  mv(29, 229); mv(75, 210); mv(121, 229); mv(140, 275); // 시계 180° → 450 - 360
  assert(Math.abs(inp.steerAbs - 90) < 1e-9, 'back=' + inp.steerAbs);
});

test('원형 핸들: 한 이벤트에 60°보다 크게 튀면(중심을 가로지름) 무시하고 기준 각도만 갱신', () => {
  const { inp, els } = setup();
  const mv = (x, y) => els.wheel.fire('pointermove', { pointerId: 1, clientX: x, clientY: y });
  els.wheel.fire('pointerdown', { pointerId: 1, clientX: 140, clientY: 275 }); // 오른쪽(0°)
  mv(10, 275);                                  // 왼쪽으로 180° 튐
  assert.strictEqual(inp.steerAbs, 0, 'jump=' + inp.steerAbs);
  mv(29, 321);                                  // 왼쪽 → 아래: 반시계 45° → 90
  assert(Math.abs(inp.steerAbs - 90) < 1e-9, 'after=' + inp.steerAbs);
});

test('브레이크 즉시 물림은 터치 페달만: 키보드 ↓는 서서히', () => {
  const { inp, els } = setup();
  inp.down.add('ArrowDown');
  assert(I.read(inp, 0, DT).brake < 0.05, '키보드');
  inp.down.clear(); frames(inp, 30);
  els.brake.fire('pointerdown', { pointerId: 1, clientX: 645, clientY: 300 });
  assert(I.read(inp, 0, DT).brake >= 0.4, '터치');
});

// 회귀(사용자 보고, street-slope 8도): D에서 엑셀을 누르고 있어도 뒤로 밀렸다.
test('8도 오르막 D: 엑셀을 깊이 0부터 누르고 있으면 1.5초 안에 앞으로 간다', () => {
  const { inp, els } = setup();
  const c = C.create({ x: 0, y: 0, th: 0 });
  C.setGear(c, 'D');
  els.gas.fire('pointerdown', { pointerId: 1, clientX: 735, clientY: 340 }); // 페달 아래쪽을 눌러도 동일
  let minX = 0;
  for (let i = 0; i < 90; i++) { C.step(c, I.read(inp, 0, DT), DT, 8 * D2R); minX = Math.min(minX, c.x); }
  assert(minX > -0.05, '뒤로 밀린 거리 ' + minX);
  assert(c.v > 0.3 && c.x > 0.1, 'v=' + c.v + ' x=' + c.x);
});

test('8도 오르막: 정지 상태에서 브레이크를 잠깐 눌러도 바로 멈춰 있다', () => {
  const { inp, els } = setup();
  const c = C.create({ x: 0, y: 0, th: 0 });
  C.setGear(c, 'D');
  els.brake.fire('pointerdown', { pointerId: 1, clientX: 645, clientY: 300 });
  let minX = 0;
  for (let i = 0; i < 120; i++) { C.step(c, I.read(inp, 0, DT), DT, 8 * D2R); minX = Math.min(minX, c.x); }
  assert(minX > -0.02 && c.v === 0, 'minX=' + minX + ' v=' + c.v);
});

test('브레이크를 누른 엄지가 아래로 미끄러져도 끝까지 밟혀 차가 선다', () => {
  const { inp, els } = setup();
  const c = C.create({ x: 0, y: 0, th: 0 }); C.setGear(c, 'D'); c.v = 30 / 3.6; c.vMax = 60 / 3.6;
  els.brake.fire('pointerdown', { pointerId: 1, clientX: 645, clientY: 300 });
  els.brake.fire('pointermove', { pointerId: 1, clientX: 645, clientY: 330 });
  for (let i = 0; i < 180; i++) C.step(c, I.read(inp, 0, DT), DT);
  assert.strictEqual(c.v, 0, 'v=' + c.v);
});

test('Q/E는 조향 없이 미러 확인, 방향지시등 요청은 한 번만 읽는다', () => {
  const { inp } = setup(); inp.down.add('KeyQ'); inp.blinkReq=-1;
  const a=I.read(inp,0,DT);assert.strictEqual(a.steerRate,0);assert(a.mirrorL);assert.strictEqual(a.blinkReq,-1);
  assert.strictEqual(I.read(inp,0,DT).blinkReq,0);
  inp.down.clear();inp.down.add('KeyE');assert(I.read(inp,0,DT).mirrorR);
});

test('속도별 감도: 키 조향·터치 드래그에 steerGain 곱함', () => {
  const { inp, els } = setup(); inp.down.add('ArrowLeft');
  assert.strictEqual(I.read(inp, 0, DT, 0).steerRate, 1);
  const g = C.steerGain(100 / 3.6), r = I.read(inp, 0, DT, 100 / 3.6).steerRate;
  assert(Math.abs(r - g) < 1e-9 && r > 0.25 && r < 0.35, 'r=' + r);
  inp.down.clear();
  const drag = v => { I.read(inp, 0, DT, v); els.wheel.fire('pointerdown', { pointerId: 1, clientX: 75, clientY: 210 }); els.wheel.fire('pointermove', { pointerId: 1, clientX: 29, clientY: 229 }); els.wheel.fire('pointermove', { pointerId: 1, clientX: 10, clientY: 275 }); const o = I.read(inp, 0, DT, v); els.wheel.fire('pointerup', { pointerId: 1 }); return o; };
  const a = drag(0), b = drag(100 / 3.6);
  assert.strictEqual(a.hold, true); assert(Math.abs(a.steerAbs - 180) < 1e-9);
  assert(b.steerAbs / a.steerAbs > 0.25 && b.steerAbs / a.steerAbs < 0.35, 'b=' + b.steerAbs);
  assert.strictEqual(I.read(inp, 0, DT, 0).hold, false);
});

test('비상등: X 키·[data-hazard] 탭 한 번에 hazardReq 1회', () => {
  const keys = {}, hz = fakeEl({}, {});
  global.window = { addEventListener: (t, f) => { keys[t] = f; } };
  global.document = { body: { classList: { add() {} } }, querySelectorAll: () => [] };
  const inp2 = I.create({ querySelector: () => null, querySelectorAll: s => (s === '[data-hazard]' ? [hz] : []) });
  keys.keydown({ code: 'KeyX', target: {}, preventDefault() {} });
  assert.strictEqual(I.read(inp2, 0, DT).hazardReq, 1);
  assert.strictEqual(I.read(inp2, 0, DT).hazardReq, 0);
  hz.fire('pointerdown', {}); assert.strictEqual(I.read(inp2, 0, DT).hazardReq, 1);
  hz.fire('click', { detail: 1 }); assert.strictEqual(I.read(inp2, 0, DT).hazardReq, 0);
  hz.fire('click', { detail: 0 }); inp2.hazardReq = 1; I.reset(inp2); assert.strictEqual(I.read(inp2, 0, DT).hazardReq, 0);
});

for (const [name, fn] of tests) {
  try { fn(); console.log('ok  ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n  ' + e.message); }
}
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('all ' + tests.length + ' passed');
