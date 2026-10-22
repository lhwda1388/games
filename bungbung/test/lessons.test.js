const assert = require('assert');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let fail = 0;
// node bungbung/test/lessons.test.js
const L = require('../lessons.js');
const C = require('../car.js');
const K = require('../collision.js');
const M = require('../maps.js');
const PI = Math.PI, DT = 1 / 60;
const idle = { throttle: 0, brake: 0, steerRate: 0 };

// 주차 레슨 한 프레임: main.js physicsStep처럼 움직이고, 벽·볼라드에 닿으면 되돌린 뒤 hit
function parkFrame(les, st, car, ctl) {
  const prev = { x: car.x, y: car.y, th: car.th };
  C.step(car, ctl, DT);
  const hit = K.hit(C.bodyBox(car), les.map.obstacles) >= 0;
  if (hit) { Object.assign(car, prev); car.v = 0; }
  return L.update(st, { car, ctl, dt: DT, d: null, hit });
}
function lessonCar(les) { const c = C.create(M.startPose(les.map, C.SELTOS)); c.gear = les.gear; return c; }

test('레슨 목록과 단계 형식', () => {
  assert.deepStrictEqual(L.list.map(l => l.id), ['lesson-controls', 'lesson-parking', 'lesson-city']);
  for (const les of L.list) for (const s of les.steps) {
    assert.strictEqual(typeof s.text, 'string', les.id);
    assert.strictEqual(typeof s.keys, 'string', les.id);
    assert.strictEqual(typeof s.done, 'function', les.id);
  }
});

test('조작 레슨: 스크립트 입력으로 9단계 완주', () => {
  const les = L.byId('lesson-controls'), car = lessonCar(les), st = L.create(les);
  const next = ctl => {
    for (let i = 0; i < 1200; i++) {
      const ev = parkFrame(les, st, car, ctl);
      if (ev) { assert.notStrictEqual(ev.type, 'retry', '단계 ' + (st.i + 1) + ' ' + JSON.stringify(ev)); return ev.type; }
    }
    assert.fail('단계 ' + (st.i + 1) + '이 20초 안에 안 끝남');
  };
  assert.strictEqual(next({ ...idle, brake: 1 }), 'ok');                 // 1 브레이크
  C.setGear(car, 'D', true); assert.strictEqual(next({ ...idle, brake: 1 }), 'ok'); // 2 D
  assert.strictEqual(next(idle), 'ok');                                   // 3 크리핑 3m
  assert.strictEqual(next({ ...idle, throttle: 0.5 }), 'ok');            // 4 10km/h
  assert.strictEqual(next({ ...idle, brake: 1 }), 'ok');                 // 5 정지
  assert.strictEqual(next({ ...idle, steerRate: 1 }), 'ok');             // 6 왼쪽 끝까지 90°
  assert.strictEqual(next({ ...idle, viewReq: true }), 'ok');            // 7 시점
  for (let i = 0; i < 150; i++) assert.strictEqual(parkFrame(les, st, car, idle), null); // D로 앞으로 3m+ 굴러간 뒤에도
  car.v = 0; C.setGear(car, 'R'); assert.strictEqual(next(idle), 'ok');  // 8 후진 3m(뒤로 간 거리만)
  car.v = 0; C.setGear(car, 'P'); assert.strictEqual(next({ ...idle, brake: 1 }), 'finish'); // 9 P
  assert(st.finished);
  assert.strictEqual(L.update(st, { car, ctl: idle, dt: DT, d: null, hit: false }), null);
});

test('조작 레슨 I2: 앞으로 3m 넘게 간 뒤 R로 바꿔도 후진 3m를 가야 통과', () => {
  const les = L.byId('lesson-controls'), car = lessonCar(les), st = L.create(les);
  st.i = 7; L.update(st, { car, ctl: idle, dt: DT, d: null, hit: false }); // 8단계 시작(스냅샷)
  C.setGear(car, 'D', true);
  for (let i = 0; i < 200; i++) assert.strictEqual(parkFrame(les, st, car, idle), null);
  assert(Math.hypot(car.x - st.snap.x, car.y - st.snap.y) > 3, '앞으로 3m 넘게 감');
  car.v = 0; C.setGear(car, 'R');
  let frames = 0, ev = null;
  while (!ev && frames < 1200) { ev = parkFrame(les, st, car, idle); frames++; }
  assert.strictEqual(ev && ev.type, 'ok'); assert(frames > 60, '바로 통과하지 않음: ' + frames);
});

test('시내 기초: 되돌리기는 경로를 다시 잡게 비우고, a 차로면 어디든 1단계 통과', () => {
  const les = L.byId('lesson-city'), d = D.create(les.mission), st = L.create(les);
  cityFrame(st, d); put(d, 'a:f2', 60);
  assert.strictEqual(cityFrame(st, d).type, 'ok');
  put(d, 'b:f1', 5);
  assert.strictEqual(cityFrame(st, d).type, 'retry');
  assert.strictEqual(d.route, null); assert.strictEqual(d.retryAt, null);
  D.step(d, idle, DT); assert(d.route, '다음 프레임에 경로 다시 잡힘');
});

test('접촉하면 retry, 차는 그 단계 시작 자리·정지로', () => {
  const les = L.byId('lesson-controls'), car = lessonCar(les), st = L.create(les);
  assert.strictEqual(L.update(st, { car, ctl: idle, dt: DT, d: null, hit: false }), null);
  const start = { x: car.x, y: car.y, th: car.th };
  car.x += 5; car.v = 2; car.wheel = 100;
  assert.deepStrictEqual(L.update(st, { car, ctl: idle, dt: DT, d: null, hit: true }), { type: 'retry', reason: '부딪혔어요' });
  assert.deepStrictEqual({ x: car.x, y: car.y, th: car.th }, start);
  assert.strictEqual(car.v, 0); assert.strictEqual(car.wheel, 0); assert.strictEqual(st.i, 0);
});

test('주차 기초: 시작 자세·단계 목표 자세가 벽·볼라드와 안 겹침, 목표 자세면 단계 통과', () => {
  const les = L.byId('lesson-parking'), car = lessonCar(les), st = L.create(les);
  assert.strictEqual(K.hit(C.bodyBox(car), les.map.obstacles), -1, '시작');
  assert.strictEqual(L.update(st, { car, ctl: idle, dt: DT, d: null, hit: false }), null, '시작 자리에서 바로 통과하면 안 됨');
  assert.strictEqual(les.steps.length, 5); assert.strictEqual(car.gear, 'P', '시작은 P');
  const gears = ['D', 'R', 'D', 'R', 'P'], faces = [0, 0, PI / 2, PI / 2, -PI / 2];
  les.steps.forEach((s, i) => {
    assert(s.goal, '단계 ' + (i + 1) + ' goal');
    const ideal = C.create(C.poseFromCenter(s.goal.x, s.goal.y, faces[i]));
    ideal.gear = gears[i];
    assert.strictEqual(K.hit(C.bodyBox(ideal), les.map.obstacles), -1, '단계 ' + (i + 1));
    Object.assign(car, { x: ideal.x, y: ideal.y, th: ideal.th, v: 0, gear: ideal.gear });
    const ev = L.update(st, { car, ctl: idle, dt: DT, d: null, hit: false });
    assert.strictEqual(ev && ev.type, i === 4 ? 'finish' : 'ok', '단계 ' + (i + 1));
  });
});

test('주차 기초: 뒤로 빼낸 뒤 단계는 칸 안이면 통과 안 하고, 완전히 나와 멈추면 통과', () => {
  const les = L.byId('lesson-parking'), car = lessonCar(les), st = L.create(les);
  const at = (y, v) => { Object.assign(car, C.poseFromCenter(0, y, PI / 2), { v, gear: 'R' }); return L.update(st, { car, ctl: idle, dt: DT, d: null, hit: false }); };
  st.i = 3; assert.strictEqual(L.step(st).text.includes('뒤로 빼낸'), true);
  assert.strictEqual(at(6, 0), null, '칸 안');
  assert.strictEqual(at(3, 0), null, '칸에 걸침');
  assert.strictEqual(at(-1, 1), null, '나왔지만 움직임');
  assert.strictEqual(at(-12, 0), null, '입구 앞(초록)을 벗어나 멀리');
  Object.assign(car, C.poseFromCenter(0, -1, PI / 2), { v: 0, gear: 'D' });
  assert.strictEqual(L.update(st, { car, ctl: idle, dt: DT, d: null, hit: false }), null, 'R이 아님');
  assert.strictEqual(at(-1, 0).type, 'ok'); assert.strictEqual(st.i, 4);
});

test('NOGOAL은 레슨 맵 밖', () => {
  for (const les of L.list.filter(l => l.kind === 'parking')) {
    assert.strictEqual(les.map.goal, L.NOGOAL);
    assert(L.NOGOAL.x > les.map.bounds.x1);
  }
});

const D = require('../drive.js');
const R = require('../roads.js');
// 시내 레슨: 차를 차로 위치로 옮기고 한 스텝 진행한 뒤 update
function put(d, laneId, s, v = 0) {
  const p = R.pointAt(d.net.lanes[laneId], s);
  Object.assign(d.car, C.poseFromCenter(p.x, p.y, p.a), { v, gear: 'D' });
}
function cityFrame(st, d) {
  D.step(d, idle, DT);
  return L.update(st, { car: d.car, ctl: idle, dt: DT, d, hit: !!d.score.failReason });
}

test('시내 기초: 경로가 있고 처음 60초 가까이 적색', () => {
  const d = D.create(L.byId('lesson-city').mission);
  assert(d.route, '경로');
  assert.strictEqual(R.signalState(d.net, 0, 'J1:sig', 'a:f1'), 'R');
  assert.strictEqual(R.signalState(d.net, 50, 'J1:sig', 'a:f1'), 'R');
});

test('시내 기초: 6단계를 순간 이동으로 통과', () => {
  const les = L.byId('lesson-city'), d = D.create(les.mission), st = L.create(les);
  const PL = C.SELTOS.length;
  assert.strictEqual(cityFrame(st, d), null);
  put(d, 'a:f1', 60); assert.strictEqual(cityFrame(st, d).type, 'ok');                  // 1 30m 진행
  const stop = R.stopOf(d.net, 'a:f1');
  put(d, 'a:f1', stop.s - 3 - PL / 2); assert.strictEqual(cityFrame(st, d).type, 'ok');  // 2 정지선 앞 정지
  assert.strictEqual(R.signalState(d.net, d.t + 2.5, 'J1:sig', 'a:f1'), 'G', '3단계 시작 2초 뒤 녹색');
  put(d, 'b:f1', 20); assert.strictEqual(cityFrame(st, d).type, 'ok');                  // 3 교차로 통과
  d.blink = 1; d.mirrorR = d.t; put(d, 'b:f2', 60); assert.strictEqual(cityFrame(st, d).type, 'ok'); // 4 차로 변경
  put(d, 'r:b1', 10); assert.strictEqual(cityFrame(st, d).type, 'ok');                  // 5 우회전
  put(d, 'r:b1', 49); assert.strictEqual(cityFrame(st, d).type, 'finish');              // 6 도착
});

test('시내 기초: 정지선을 넘으면 retry, 깜빡이 없이 차로 변경하면 retry', () => {
  const les = L.byId('lesson-city'), d = D.create(les.mission), st = L.create(les);
  cityFrame(st, d); put(d, 'a:f1', 60); cityFrame(st, d);
  const snap = { x: d.car.x, y: d.car.y };
  put(d, 'b:f1', 5);
  assert.deepStrictEqual(cityFrame(st, d), { type: 'retry', reason: '정지선을 넘었어요' });
  assert.deepStrictEqual({ x: d.car.x, y: d.car.y }, snap);
  const stop = R.stopOf(d.net, 'a:f1');
  put(d, 'a:f1', stop.s - 3 - C.SELTOS.length / 2); cityFrame(st, d);
  put(d, 'b:f1', 20); cityFrame(st, d);
  d.blink = 0; put(d, 'b:f2', 60);
  assert.deepStrictEqual(cityFrame(st, d), { type: 'retry', reason: '깜빡이를 켜고 미러를 먼저 보세요' });
  assert.strictEqual(d.blink, 0); assert.strictEqual(d.score.failReason, null);
});

test('시내 기초: a 2차로에서 곧장 b:f2로 들어오면 무한 되돌리기 없이 깜빡이·미러로 통과', () => {
  const les = L.byId('lesson-city'), d = D.create(les.mission), st = L.create(les);
  cityFrame(st, d); put(d, 'a:f2', 60); cityFrame(st, d);
  const stop = R.stopOf(d.net, 'a:f2');
  put(d, 'a:f2', stop.s - 3 - C.SELTOS.length / 2); assert.strictEqual(cityFrame(st, d).type, 'ok');
  put(d, 'b:f2', 20); assert.strictEqual(cityFrame(st, d).type, 'ok'); // 3 통과, 4단계가 b:f2에서 시작
  for (let i = 0; i < 30; i++) assert.strictEqual(cityFrame(st, d), null, '깜빡이 전에는 그냥 대기(되돌리기 반복 없음)');
  d.blink = 1; d.mirrorR = d.t;
  assert.strictEqual(cityFrame(st, d).type, 'ok');
  assert.strictEqual(st.i, 4);
});

test('시내 기초: 차로 변경 중 깜빡이가 저절로 꺼져도(핸들 90° 넘게) 3초 안에 켰으면 통과', () => {
  const les = L.byId('lesson-city'), d = D.create(les.mission), st = L.create(les);
  cityFrame(st, d); put(d, 'a:f1', 60); cityFrame(st, d);
  const stop = R.stopOf(d.net, 'a:f1');
  put(d, 'a:f1', stop.s - 3 - C.SELTOS.length / 2); cityFrame(st, d);
  put(d, 'b:f1', 20); assert.strictEqual(cityFrame(st, d).type, 'ok');
  d.blink = 1; d.mirrorR = d.t; assert.strictEqual(cityFrame(st, d), null);
  d.blink = 0; put(d, 'b:f2', 30); // 저절로 꺼진 뒤 2차로 진입
  assert.strictEqual(cityFrame(st, d).type, 'ok');
});

test('되돌리기는 핸들을 가운데로', () => {
  const les = L.byId('lesson-city'), d = D.create(les.mission), st = L.create(les);
  d.car.wheel = 200; cityFrame(st, d); // 핸들 꺾인 채 1단계 시작(스냅샷)
  d.score.failReason = '테스트';
  L.update(st, { car: d.car, ctl: idle, dt: DT, d, hit: true });
  assert.strictEqual(d.car.wheel, 0);
});

test('주차 기초 M8: 칸을 그대로 지나치면 안쪽 연석에 닿아 되돌리기', () => {
  const les = L.byId('lesson-parking'), st = L.create(les), g = les.steps[2].goal;
  const car = C.create(C.poseFromCenter(g.x, g.y - 4, PI / 2)); car.gear = 'D'; car.v = 1; // 칸 앞에서 곧게 들어감
  st.i = 2; assert.strictEqual(L.update(st, { car, ctl: idle, dt: DT, d: null, hit: false }), null);
  let ev = null;
  for (let i = 0; i < 600 && !ev; i++) ev = parkFrame(les, st, car, { ...idle, throttle: 0.3 });
  assert.deepStrictEqual(ev, { type: 'retry', reason: '부딪혔어요' });
  assert(les.map.obstacles.some(o => o.kind === 'curb'), '연석');
});

test('시내 기초: 실패(충돌 등)는 retry로 바뀌고 채점이 새로 시작', () => {
  const les = L.byId('lesson-city'), d = D.create(les.mission), st = L.create(les);
  cityFrame(st, d);
  d.score.failReason = '테스트 실패';
  const ev = L.update(st, { car: d.car, ctl: idle, dt: DT, d, hit: true });
  assert.deepStrictEqual(ev, { type: 'retry', reason: '테스트 실패' });
  assert.strictEqual(d.score.failReason, null);
});

for (const [name, fn] of tests) {
  try { fn(); } catch (e) { fail++; console.error('FAIL', name, '\n ', e.message); }
}
if (fail) { console.error(fail + ' failed'); process.exit(1); }
console.log('all lessons tests passed');
