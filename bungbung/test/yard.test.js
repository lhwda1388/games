const assert = require('assert');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let fail = 0;
// node bungbung/test/yard.test.js
const L = require('../lessons.js');
const Y = require('../yard.js');
const C = require('../car.js');
const K = require('../collision.js');
const M = require('../maps.js');
const E = require('../exam.js');
const PI = Math.PI, DT = 1 / 60, KMH = 1 / 3.6;
const idle = { throttle: 0, brake: 0, steerRate: 0 };
const les = L.byId('yard'), map = les.map, G = Y.G;

// 시험 한 판: 차는 출발 자세·P, 상태 st, 프레임 함수 f(입력 덮어쓰기)
function exam() {
  const car = C.create(M.startPose(map, C.SELTOS)); car.gear = les.gear; car.vMax = les.vMax;
  const st = L.create(les);
  const io = { blink: 0, hazard: false };
  const f = (o = {}) => L.update(st, Object.assign({ car, ctl: idle, dt: DT, d: null, hit: false, blink: io.blink, hazard: io.hazard, view: 'driver' }, o));
  return { car, st, io, f };
}
// 차체 중심 (cx,cy), 방향 th로 옮긴다
const put = (car, cx, cy, th, v = 0, gear = 'D') => Object.assign(car, C.poseFromCenter(cx, cy, th), { v, gear });
// n초 동안 같은 상태로 프레임 반복, null이 아닌 이벤트 모음
function run(f, sec, o) { const out = []; for (let i = 0; i < Math.round(sec / DT); i++) { const e = f(o); if (e) out.push(e); } return out; }
const types = evs => evs.map(e => e.type);
// i단계(0부터)로 건너뛰기: 시험 상태는 그대로, 단계만 바꾸고 enter 실행
function jump(x, i) { x.st.i = i; x.st.snap = null; }

test('코스 등록: byId, 주차 엔진, P 출발, 30km/h, 시험 모드 80점, 10단계, 메뉴용 레슨 목록엔 없음', () => {
  assert.strictEqual(les, Y.course);
  assert.strictEqual(les.kind, 'parking'); assert.strictEqual(les.gear, 'P');
  assert.strictEqual(les.vMax, 30 / 3.6); assert.deepStrictEqual(les.exam, { pass: 80 });
  assert.strictEqual(les.steps.length, 10);
  assert.deepStrictEqual(les.steps.map(s => s.name), ['출발', '차로 준수', '경사로', '좌회전', '직각주차', '신호교차로', '우회전', '가속', '돌발', '종료']);
  for (const s of les.steps) { assert.strictEqual(typeof s.text, 'string'); assert.strictEqual(typeof s.keys, 'string'); assert.strictEqual(typeof s.done, 'function'); assert(s.goal, s.name + ' goal'); }
  assert(!L.list.includes(les));
  assert.strictEqual(map.goal, L.NOGOAL);
});

test('맵: 시작 자세가 연석과 안 겹치고, 경사로 위 높이 > 0, 목표 구역이 맵 안', () => {
  const car = C.create(M.startPose(map, C.SELTOS));
  assert.strictEqual(K.hit(C.bodyBox(car), map.obstacles), -1);
  assert(M.heightAt(map, 38.5, 0) > 0.5, '오르막 정지 구역');
  assert.strictEqual(M.heightAt(map, 46, 0), Y.RAMP.z, '꼭대기');
  assert(M.heightAt(map, 56, 0) > 0, '내리막');
  assert.strictEqual(M.heightAt(map, 10, 0), 0);
  assert(Math.abs(Y.RAMP.z / (Y.RAMP.up1 - Y.RAMP.up0) - 0.1) < 1e-9, '오르막 10%');
  const b = map.bounds;
  for (const k in G) { const g = G[k]; assert(g.x - g.l / 2 >= b.x0 && g.x + g.l / 2 <= b.x1 && g.y - g.w / 2 >= b.y0 && g.y + g.w / 2 <= b.y1, k); }
  for (const o of map.obstacles) assert(o.kind === 'curb' || o.kind === 'light', o.kind);
});

// 각 단계 목표 자세: 차체가 연석에 안 닿는다
const POSES = {
  start: [4, 0, 0], straight: [24, 0, 0], hill: [38.5, 0, 0], rampEnd: [67, 0, 0], left: [80, 12, PI / 2],
  slot: [Y.SLOT.x, Y.SLOT.y, PI], bayExit: [80, 42, PI / 2], stopArea: [80, Y.STOP_Y - 3, PI / 2], xingExit: [80, 61.5, PI / 2],
  right: [92, 70, 0], acc: [111, 70, 0], accEnd: [128.5, 70, 0], emg: [147, 70, 0], end: [172, 70, 0],
};
test('맵: 단계 목표 자세가 연석·신호등과 안 겹침', () => {
  for (const [k, [x, y, th]] of Object.entries(POSES)) {
    const c = C.create(C.poseFromCenter(x, y, th)), i = K.hit(C.bodyBox(c), map.obstacles);
    assert.strictEqual(i, -1, k + ' 장애물 ' + JSON.stringify(map.obstacles[i]));
  }
  const c = C.create(C.poseFromCenter(Y.SLOT.x, Y.SLOT.y, PI));
  assert(K.inside(C.bodyBox(c), Y.SLOT), '칸 안');
  assert(Y.SLOT.w >= 2.5 && Y.SLOT.w <= 2.8, '칸 폭');
});

// 운전 흉내: 차로 가운데로 크리핑(5km/h)하다 trig에서 핸들을 lock까지(키보드 속도로) 꺾고,
// 방향이 거의 맞으면 나가는 차로 가운데로 맞추며 직진. 연석에 닿으면 실패.
// left: 1구간 → 2구간(x=80 북쪽), right: 2구간 → 3구간(y=70 동쪽)
function corner(left, trig, lock) {
  const car = left ? C.create(C.poseFromCenter(60, 0, 0)) : C.create(C.poseFromCenter(80, 60, PI / 2));
  car.gear = 'D'; car.vMax = les.vMax;
  const dir = left ? 1 : -1, target = car.th + dir * PI / 2;
  let phase = 0;
  for (let i = 0; i < 60 * 40; i++) {
    const b = C.bodyBox(car), err = Math.atan2(Math.sin(target - car.th), Math.cos(target - car.th));
    if (phase === 0 && (left ? b.x : b.y) >= trig) phase = 1;
    if (phase === 1 && Math.abs(err) < 0.3) phase = 2;
    const ctl = { throttle: 0, brake: 0, steerRate: 0, hold: true };
    if (phase === 1) ctl.steerRate = Math.abs(car.wheel) < lock ? dir : 0;
    if (phase === 2) {
      const lat = left ? car.x - 80 : 70 - car.y; // 왼쪽으로 가야 할 거리
      const want = Math.max(-450, Math.min(450, (err * 2 + lat * 0.6) * 750));
      ctl.steerRate = Math.abs(want - car.wheel) < 10 ? 0 : Math.sign(want - car.wheel);
    }
    C.step(car, ctl, DT);
    if (K.hit(C.bodyBox(car), map.obstacles) >= 0) return false;
    const c = C.bodyBox(car);
    if (left ? c.y >= 16 : c.x >= 96) return true;
  }
  return false;
}
const range = (a, b) => { const r = []; for (let t = a; t <= b + 1e-9; t += 0.5) r.push(t); return r; };
test('좌회전 코너: 핸들 끝까지 꺾으면 꺾는 시점 2m 폭, 3/4만 꺾으면 1.5m 폭에서 한 번에 돈다', () => {
  for (const t of range(76.5, 78.5)) assert(corner(true, t, 450), '끝까지 ' + t);
  for (const t of range(75.5, 77)) assert(corner(true, t, 330), '3/4 ' + t);
  assert(!corner(true, 72, 450), '너무 일찍 꺾으면 안쪽 연석');
});
test('우회전 코너: 좌회전과 같은 여유(거울상)', () => {
  for (const t of range(66.5, 68.5)) assert(corner(false, t, 450), '끝까지 ' + t);
  for (const t of range(65.5, 67)) assert(corner(false, t, 330), '3/4 ' + t);
  assert(!corner(false, 62, 450), '너무 일찍 꺾으면 안쪽 연석');
});

test('스크립트 완주: 10항목을 목표 자세로 옮겨 가며 100점 합격', () => {
  const x = exam(), { car, st, io, f } = x;
  assert.strictEqual(f(), null, '시작 자리');
  io.blink = -1; run(f, 0.5);                                   // 1 왼쪽 깜빡이 켜고
  put(car, 4, 0, 0, 1); let e = f(); assert.strictEqual(e, null); // 움직이기 시작(감점 없음)
  put(car, 9, 0, 0, 2); assert.strictEqual(f().type, 'ok'); io.blink = 0;
  put(car, 24, 0, 0, 3); assert.strictEqual(f().type, 'ok');  // 2 직선 끝
  put(car, 38.5, 0, 0, 0); assert.deepStrictEqual(types(run(f, 1.1)), []); // 3 정지 구역 1초 정지
  put(car, 46, 0, 0, 2); assert.strictEqual(f(), null);
  put(car, 67, 0, 0, 2); assert.strictEqual(f().type, 'ok');
  io.blink = -1; run(f, 0.5); put(car, 71, 0, 0, 2); assert.strictEqual(f(), null); io.blink = 0; // 4 진입선 넘을 때 깜빡이
  put(car, 80, 12, PI / 2, 2); assert.strictEqual(f().type, 'ok');
  put(car, 80, 30, PI / 2, 0); f();                                        // 5 통로 진입
  put(car, Y.SLOT.x, Y.SLOT.y, PI, 0, 'R'); assert.deepStrictEqual(run(f, 2.1), []);
  assert(st.mem.parked, '주차 인정');
  put(car, 80, 42, PI / 2, 2); assert.strictEqual(f().type, 'ok');
  assert.strictEqual(st.light, 'R');                                       // 6 적색
  put(car, 80, Y.STOP_Y - 3, PI / 2, 0); run(f, 3.1);
  assert.strictEqual(st.light, 'G');
  put(car, 80, 61.5, PI / 2, 3); assert.strictEqual(f().type, 'ok');
  assert.strictEqual(st.light, null);
  io.blink = 1; put(car, 80, 65, PI / 2, 2); assert.strictEqual(f(), null); io.blink = 0; // 7
  put(car, 92, 70, 0, 2); assert.strictEqual(f().type, 'ok');
  put(car, 111, 70, 0, 22 * KMH); f(); put(car, 128.5, 70, 0, 22 * KMH); assert.strictEqual(f().type, 'ok'); // 8
  put(car, 148, 70, 0, 6); f(); assert(st.alarm != null, '돌발 경보');      // 9
  put(car, 148, 70, 0, 0); f(); io.hazard = true; run(f, 1); io.hazard = false;
  car.v = 1; assert.strictEqual(f().type, 'ok');
  assert.strictEqual(st.alarm, null);
  io.blink = 1; put(car, 172, 70, 0, 0); f(); run(f, 1); car.gear = 'P';  // 10
  e = f(); assert.strictEqual(e.type, 'finish'); assert(!e.items, '감점 없음');
  assert.strictEqual(f(), null, '끝난 뒤 null');
  const r = L.examResult(st);
  assert.deepStrictEqual(r, { score: 100, passed: true, dq: false, end: null, items: [] });
});

test('결과 모양이 PP_EXAM.result와 같고 PP_EXAM.better로 비교 가능', () => {
  const x = exam(); x.f();
  const r = L.examResult(x.st), b = E.result(E.create());
  assert.deepStrictEqual(Object.keys(r).sort(), Object.keys(b).sort());
  assert.strictEqual(r.passed, false, '안 끝났으면 불합격');
  assert.strictEqual(E.better(Object.assign({ time: 1 }, r), null), true);
});

test('출발: 깜빡이 없이 움직이면 -5, 같은 프레임에 이벤트로 알림', () => {
  const { car, st, f } = exam(); f();
  put(car, 4, 0, 0, 1);
  const e = f();
  assert.deepStrictEqual(e, { type: 'deduct', items: [{ t: st.t, pts: 5, text: Y.TEXT.startBlink, code: 'start' }] });
  assert.strictEqual(st.exam.score, 95);
  put(car, 9, 0, 0, 1); assert.strictEqual(f().type, 'ok');
});

test('출발: 3초보다 전에 켰다 끈 깜빡이는 인정 안 됨', () => {
  const { car, st, io, f } = exam(); io.blink = -1; f(); io.blink = 0; run(f, 3.2);
  put(car, 4, 0, 0, 1); assert.strictEqual(f().type, 'deduct'); assert.strictEqual(st.exam.score, 95);
});

test('접촉은 되돌리지 않고 -10씩, 80점 아래로 내려가면 중단(finish 한 번, 이후 null)', () => {
  const { car, st, io, f } = exam(); io.blink = -1; f();
  put(car, 12, 0, 0, 1);
  const pos = { x: car.x, y: car.y };
  assert.deepStrictEqual(f({ hit: true }).items.map(i => i.pts), [10]);
  assert.deepStrictEqual({ x: car.x, y: car.y }, pos, '되돌리지 않음');
  assert.strictEqual(st.i, 1, '1단계 통과(같은 프레임) 뒤');
  f({ hit: true }); assert.strictEqual(st.exam.score, 80); assert.strictEqual(st.exam.end, null);
  const e = f({ hit: true });
  assert.strictEqual(e.type, 'finish'); assert.strictEqual(e.items[0].text, Y.TEXT.hit);
  assert.strictEqual(st.exam.end, '점수가 80점 아래로 내려가 시험이 중단됐어요');
  assert.strictEqual(f({ hit: true }), null);
  const r = L.examResult(st);
  assert.strictEqual(r.score, 70); assert.strictEqual(r.passed, false); assert.strictEqual(r.dq, false);
  assert.strictEqual(r.items.filter(i => i.text === Y.TEXT.hit).length, 3);
});

test('통과와 감점이 같은 프레임이면 ok에 items', () => {
  const x = exam(); x.io.blink = -1; x.f(); put(x.car, 9, 0, 0, 2);
  const e = x.f({ hit: true });
  assert.strictEqual(e.type, 'ok'); assert.strictEqual(e.items[0].pts, 10);
});

function atStep(i) { const x = exam(); x.f(); jump(x, i); return x; }

test('경사로: 정지 없이 정지 구역 통과 -10, 그래도 경사로 끝에서 통과', () => {
  const { car, st, f } = atStep(2);
  put(car, 30, 0, 0, 3); assert.strictEqual(f(), null);
  put(car, 38.5, 0, 0, 3); assert.strictEqual(f(), null);
  put(car, 43, 0, 0, 3); assert.deepStrictEqual(f().items.map(i => i.text), [Y.TEXT.hillNoStop]);
  put(car, 46, 0, 0, 3); assert.strictEqual(f(), null, '한 번만');
  put(car, 67, 0, 0, 3); assert.strictEqual(f().type, 'ok'); assert.strictEqual(st.exam.score, 90);
});

test('경사로: 정지 1초 뒤 1m 넘게 밀리면 실격', () => {
  const { car, st, f } = atStep(2);
  put(car, 38.5, 0, 0, 0); run(f, 1.1);
  put(car, 37.6, 0, 0, -0.5); assert.strictEqual(f(), null, '0.9m는 괜찮음');
  put(car, 37.4, 0, 0, -0.5); const e = f();
  assert.strictEqual(e.type, 'finish');
  assert.strictEqual(st.exam.dq, true); assert.strictEqual(st.exam.end, '실격 — ' + Y.TEXT.hillRoll);
  assert.deepStrictEqual(e.items, [{ t: st.t, pts: null, text: Y.TEXT.hillRoll, code: 'hill' }]);
  const r = L.examResult(st); assert.strictEqual(r.dq, true); assert.strictEqual(r.passed, false);
});

test('경사로: 1초 안 된 정지는 정지가 아님, 정지 구역 진입 30초 안에 못 넘으면 실격', () => {
  const { car, st, f } = atStep(2);
  put(car, 38.5, 0, 0, 0); assert.deepStrictEqual(run(f, 0.9), []);
  assert(!st.mem.stop);
  const evs = run(f, 29.5);
  assert.deepStrictEqual(types(evs), ['finish']);
  assert.strictEqual(st.exam.end, '실격 — ' + Y.TEXT.hillTime);
});

test('경사로: 실제 물리로 오르막 정지 구역에서 브레이크를 떼면 D 크리핑으로 버틴다(밀림 실격 없음)', () => {
  const { car, st, f } = atStep(2);
  put(car, 38.5, 0, 0, 0);
  const step = ctl => { const fr = C.toWorld(car, car.spec.wheelbase, 0); const zr = M.heightAt(map, car.x, car.y), zf = M.heightAt(map, fr[0], fr[1]); C.step(car, ctl, DT, Math.atan2(zf - zr, car.spec.wheelbase)); return f({ ctl }); };
  for (let i = 0; i < 70; i++) assert.strictEqual(step({ ...idle, brake: 1 }), null);
  assert(st.mem.stop, '정지 인정');
  let e = null; for (let i = 0; i < 60 * 20 && !(e && e.type !== 'deduct'); i++) e = step({ ...idle, throttle: 0.3 });
  assert.strictEqual(e && e.type, 'ok'); assert.strictEqual(st.exam.score, 100);
});

test('좌회전: 진입선 넘을 때 깜빡이 없으면 -5(3초 전 깜빡이는 인정)', () => {
  const { car, st, io, f } = atStep(3);
  put(car, 68, 0, 0, 2); f();
  io.blink = -1; f(); io.blink = 0; run(f, 2.5);
  put(car, 71, 0, 0, 2); assert.strictEqual(f(), null, '2.5초 전에 켬(자동 꺼짐) → 인정');
  const y = atStep(3); put(y.car, 71, 0, 0, 2);
  assert.deepStrictEqual(y.f().items.map(i => i.text), [Y.TEXT.leftBlink]);
  put(y.car, 80, 12, PI / 2, 2); assert.strictEqual(y.f().type, 'ok');
  assert.strictEqual(st.exam.score, 100); assert.strictEqual(y.st.exam.score, 95);
});

test('직각주차: 칸 각도 10° 넘게 틀어지면 인정 안 함, 2초 정지해야 인정, 주차 없이 지나가면 통과 안 함', () => {
  const { car, st, f } = atStep(4);
  put(car, 80, 30, PI / 2, 1); f();
  put(car, 80, 42, PI / 2, 1); assert.strictEqual(f(), null, '주차 안 하고 출구');
  put(car, Y.SLOT.x, Y.SLOT.y, PI - 12 * PI / 180, 0, 'R');
  const bad = K.inside(C.bodyBox(car), Y.SLOT);
  run(f, 2.5); assert(!st.mem.parked, '12° 비뚤어짐(칸 안=' + bad + ')');
  put(car, Y.SLOT.x, Y.SLOT.y, PI - 5 * PI / 180, 0, 'R'); run(f, 1.5); assert(!st.mem.parked, '1.5초');
  run(f, 0.6); assert(st.mem.parked);
  put(car, 80, 42, PI / 2, 1); assert.strictEqual(f().type, 'ok');
});

// 실제 물리로 직각주차: 통로 서쪽(x=78)으로 칸을 지나 yp에서 멈추고, R로 바꿔 오른쪽으로 lock만큼 꺾어 후진,
// 서쪽을 보면 핸들을 풀며 칸 안으로 곧게, 2초 정지, D로 오른쪽 끝까지 꺾어 나와 북쪽 차로로. 연석에 한 번도 안 닿고 감점 없이 통과.
function parkRun(yp, lock) {
  const { car, st, f } = atStep(4);
  put(car, 78, 22.5, PI / 2, 0);
  let phase = 0, touching = false, ev = null, ctl = idle;
  for (let i = 0; i < 60 * 90 && !ev; i++) {
    const b = C.bodyBox(car), want = (th, k) => { const err = Math.atan2(Math.sin(th - car.th), Math.cos(th - car.th)); return Math.max(-450, Math.min(450, k(err) * 750)); };
    ctl = { throttle: 0, brake: 0, steerRate: 0, hold: true };
    const toward = w => { ctl.steerRate = Math.abs(w - car.wheel) < 10 ? 0 : Math.sign(w - car.wheel); };
    if (phase === 0) { if (b.y >= yp) { ctl.brake = 1; if (car.v === 0) { C.setGear(car, 'R'); phase = 1; } } }
    else if (phase === 1) { toward(-lock); if (Math.abs(Math.atan2(Math.sin(PI - car.th), Math.cos(PI - car.th))) < 0.05) phase = 2; }
    else if (phase === 2) { toward(want(PI, e => -e * 2 + (car.y - Y.SLOT.y) * 0.6)); if (b.x >= Y.SLOT.x - 0.1) phase = 3; }
    else if (phase === 3) { ctl.brake = 1; if (st.mem.parked) { C.setGear(car, 'D', true); phase = 4; } }
    else if (phase === 4) { toward(b.x > 80.5 ? 0 : -450); if (car.th < PI * 0.6) phase = 5; }
    else if (phase === 5) toward(want(PI / 2, e => e * 2 + (car.x - 80) * 0.6));
    const fr = { x: car.x, y: car.y, th: car.th };
    C.step(car, ctl, DT);
    const hitNow = K.hit(C.bodyBox(car), map.obstacles) >= 0;
    if (hitNow) { Object.assign(car, fr); car.v = 0; }
    ev = f({ ctl, hit: hitNow && !touching });
    touching = hitNow;
    if (hitNow) return 'hit phase ' + phase;
  }
  return ev ? ev.type + (ev.items ? JSON.stringify(ev.items) : '') : 'timeout';
}
test('직각주차: 실제 물리로 후진해 넣고 나와 감점 없이 통과(멈춘 자리·꺾는 양이 달라도)', () => {
  for (const [yp, lock] of [[31, 450], [31.5, 400], [32.5, 350], [33.25, 300]]) assert.strictEqual(parkRun(yp, lock), 'ok', yp + ' ' + lock);
});

test('직각주차: 통로 진입 뒤 2분 넘으면 -10 한 번', () => {
  const { car, st, f } = atStep(4);
  put(car, 80, 30, PI / 2, 0);
  const evs = run(f, 121);
  assert.deepStrictEqual(evs.map(e => e.items.map(i => i.text)), [[Y.TEXT.parkTime]]);
  assert.strictEqual(st.exam.score, 90);
});

test('신호: 들어오면 적색, 적색에 정지선 넘으면 실격', () => {
  const { car, st, f } = atStep(5);
  put(car, 80, 42, PI / 2, 2); f(); assert.strictEqual(st.light, 'R');
  put(car, 80, Y.STOP_Y - 2.5, PI / 2, 2); assert.strictEqual(f(), null, '앞범퍼 정지선 직전');
  put(car, 80, Y.STOP_Y - 1.5, PI / 2, 2); const e = f();
  assert.strictEqual(e.type, 'finish'); assert.strictEqual(st.exam.end, '실격 — ' + Y.TEXT.red);
});

test('신호: 정지선에서 10m 넘게 떨어져 멈추면 녹색 안 됨, 3초 정지해야 녹색', () => {
  const { car, st, f } = atStep(5); f();
  put(car, 80, Y.STOP_Y - 14, PI / 2, 0); run(f, 4); assert.strictEqual(st.light, 'R');
  put(car, 80, Y.STOP_Y - 5, PI / 2, 0); run(f, 2.9); assert.strictEqual(st.light, 'R');
  run(f, 0.2); assert.strictEqual(st.light, 'G');
  put(car, 80, 54, PI / 2, 3); assert.strictEqual(f(), null, '녹색엔 넘어도 됨');
  put(car, 80, 61.5, PI / 2, 3); assert.strictEqual(f().type, 'ok');
});

test('우회전: 진입선에서 오른쪽 깜빡이 없으면 -5(왼쪽은 인정 안 됨)', () => {
  const { car, st, io, f } = atStep(6); f();
  io.blink = -1; put(car, 80, 65, PI / 2, 2);
  assert.deepStrictEqual(f().items.map(i => i.text), [Y.TEXT.rightBlink]);
  assert.strictEqual(st.exam.score, 95);
});

test('가속: 구간에서 20km/h 못 넘으면 구간 끝에서 -10, 넘으면 감점 없음', () => {
  const a = atStep(7);
  put(a.car, 111, 70, 0, 15 * KMH); a.f(); put(a.car, 128.5, 70, 0, 15 * KMH);
  const e = a.f(); assert.strictEqual(e.type, 'ok'); assert.deepStrictEqual(e.items.map(i => i.text), [Y.TEXT.slow]);
  const b = atStep(7);
  put(b.car, 111, 70, 0, 21 * KMH); b.f(); put(b.car, 128.5, 70, 0, 15 * KMH);
  assert.deepStrictEqual(b.f(), { type: 'ok' });
});

test('가속: 실제 물리로 30km/h까지만 오른다', () => {
  const { car } = exam(); put(car, 100, 70, 0, 0);
  for (let i = 0; i < 60 * 8; i++) C.step(car, { ...idle, throttle: 1 }, DT);
  assert(Math.abs(car.v - 30 * KMH) < 1e-9);
});

test('돌발: 2초 안에 못 멈추면 -10, 비상등 안 켜고 출발하면 -5', () => {
  const { car, st, io, f } = atStep(8); f();
  put(car, 140, 70, 0, 5); assert.strictEqual(f(), null); assert.strictEqual(st.alarm, null);
  put(car, 147.5, 70, 0, 5); f(); assert.strictEqual(st.alarm, st.t);
  const evs = run(f, 2.1);
  assert.deepStrictEqual(evs.map(e => e.items.map(i => i.text)), [[Y.TEXT.emgStop]]);
  car.v = 0; f(); car.v = 1;
  const e = f(); assert.strictEqual(e.type, 'ok'); assert.deepStrictEqual(e.items.map(i => i.text), [Y.TEXT.hazard]);
  assert.strictEqual(st.exam.score, 85);
  assert.strictEqual(io.hazard, false);
});

test('돌발: 2초 안에 멈추고 비상등을 켰다 끄고 출발하면 감점 없음, 비상등 켠 채로는 통과 안 함', () => {
  const { car, st, io, f } = atStep(8); f();
  put(car, 147.5, 70, 0, 5); f();
  run(f, 1); car.v = 0; f(); io.hazard = true; f();
  car.v = 1; assert.strictEqual(f(), null, '비상등 켠 채 출발');
  io.hazard = false; assert.strictEqual(f().type, 'ok'); assert.strictEqual(st.exam.score, 100);
});

test('돌발: 멈추지 않고 구간을 지나치면 -10 -5', () => {
  const { car, st, f } = atStep(8); f();
  put(car, 147.5, 70, 0, 8); f();
  put(car, 162.5, 70, 0, 8); const e = f();
  assert.strictEqual(e.type, 'ok'); assert.deepStrictEqual(e.items.map(i => i.text), [Y.TEXT.emgStop, Y.TEXT.hazard]);
  assert.strictEqual(st.exam.score, 85);
});

test('종료: 오른쪽 깜빡이 없이 멈추고 P면 -5, 끝(합격 95점)', () => {
  const { car, st, f } = atStep(9);
  put(car, 172, 70, 0, 0); f(); run(f, 4); car.gear = 'P';
  const e = f(); assert.strictEqual(e.type, 'finish'); assert.deepStrictEqual(e.items.map(i => i.text), [Y.TEXT.endBlink]);
  const r = L.examResult(st);
  assert.deepStrictEqual(r, { score: 95, passed: true, dq: false, end: null, items: r.items });
});

test('종료: 구역 밖에서 P면 통과 안 함, 멈춘 뒤 2초 안에 깜빡이를 켜도 인정', () => {
  const { car, st, io, f } = atStep(9);
  put(car, 160, 70, 0, 0, 'P'); assert.strictEqual(f(), null);
  put(car, 172, 70, 0, 0); f(); run(f, 2); io.blink = 1; f(); car.gear = 'P';
  assert.deepStrictEqual(f(), { type: 'finish' });
  assert.strictEqual(L.examResult(st).passed, true);
});

test('종료: 멈추고 2초가 지난 뒤에야 깜빡이를 켜면 -5', () => {
  const { car, st, io, f } = atStep(9);
  put(car, 172, 70, 0, 0); f(); run(f, 3); io.blink = 1; f(); car.gear = 'P';
  const e = f(); assert.strictEqual(e.type, 'finish'); assert.deepStrictEqual(e.items.map(i => i.text), [Y.TEXT.endBlink]);
  assert.strictEqual(L.examResult(st).score, 95);
});

test('종료: 멈추기 전부터 켜 둔 깜빡이는 인정', () => {
  const { car, io, f } = atStep(9);
  io.blink = 1; put(car, 172, 70, 0, 0); f(); run(f, 4); car.gear = 'P';
  assert.deepStrictEqual(f(), { type: 'finish' });
});

test('기존 레슨은 시험 모드 아님: L.exam 없음, examResult 쓰지 않음', () => {
  for (const l of L.list) { const st = L.create(l); assert.strictEqual(st.exam, undefined); assert.strictEqual(l.exam, undefined); }
});

for (const [name, fn] of tests) {
  try { fn(); } catch (e) { fail++; console.error('FAIL', name, '\n ', e.message); }
}
if (fail) { console.error(fail + ' failed'); process.exit(1); }
console.log('all yard tests passed');
