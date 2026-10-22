const assert = require('assert');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let fail = 0;
// node bungbung/test/exam.test.js
const E = require('../exam.js');
const S = require('../drive-score.js');
const T = S.TEXT, DT = 1 / 30;
// 가짜 주행 상태: exam.update가 읽는 것만
const fake = () => ({ t: 0, car: { v: 0 }, blink: 0, score: { done: false, failReason: null } });
function run(ex, d, frames, f) { for (let i = 0; i < frames; i++) { d.t += DT; if (f) f(d, i); E.update(ex, d, [], DT); } }

test('채점표: 코드별 점수와 실격', () => {
  assert.strictEqual(E.rule({ code: 'blink', text: T.blink }), 5);
  assert.strictEqual(E.rule({ code: 'mirror', text: T.mirror }), 5);
  assert.strictEqual(E.rule({ code: 'solid', text: T.solid }), 7);
  assert.strictEqual(E.rule({ code: 'solid', text: T.bus }), 7);
  assert.strictEqual(E.rule({ code: 'signal', text: T.yellow }), 5);
  assert.strictEqual(E.rule({ code: 'signal', text: T.red }), 'dq');
  assert.strictEqual(E.rule({ code: 'signal', text: T.left }), 'dq');
  assert.strictEqual(E.rule({ code: 'stop', text: T.stop }), 10);
  assert.strictEqual(E.rule({ code: 'stop', text: T.ped }), 'dq');
  assert.strictEqual(E.rule({ code: 'unprotected', text: T.unprotected }), 'dq');
  assert.strictEqual(E.rule({ code: 'speed', text: T.speed(50) }), 10);
  assert.strictEqual(E.rule({ code: 'gap', text: T.gap }), 5);
  assert.strictEqual(E.rule({ code: 'cutin', text: T.cutin }), 7);
  assert.strictEqual(E.rule({ code: 'route', text: T.route }), 5);
  assert.strictEqual(E.rule({ code: 'whatever', text: '?' }), 5);
});

test('출발 깜빡이: 움직이기 전 3초 안에 좌측이면 감점 없음, 아니면 −5', () => {
  let ex = E.create(), d = fake();
  run(ex, d, 30, d => { d.blink = -1; });
  d.blink = 0; d.car.v = 2; run(ex, d, 1);
  assert.strictEqual(ex.score, 100);
  ex = E.create(); d = fake();
  run(ex, d, 30); d.car.v = 2; run(ex, d, 1);
  assert.strictEqual(ex.score, 95);
  assert.match(ex.items[0].text, /출발/);
  assert.strictEqual(ex.items[0].code, 'start');
});

test('급제동: 20km/h 이상에서 5.5m/s² 초과, 5초에 한 번 −3', () => {
  const ex = E.create(), d = fake();
  run(ex, d, 30, d => { d.blink = -1; });
  d.car.v = 15; run(ex, d, 1);
  let v = 15; run(ex, d, 20, d => { v -= 8 * DT; d.car.v = v; }); // 8m/s² 감속
  assert.strictEqual(ex.items.filter(i => /급제동/.test(i.text)).length, 1);
  assert.deepStrictEqual(ex.items.map(i => i.code), ['hardBrake']);
  assert.strictEqual(ex.score, 97);
});

test('70점 미만이 되는 순간 중단, 실격은 즉시', () => {
  let ex = E.create(), d = fake();
  d.blink = -1; run(ex, d, 1);
  for (let i = 0; i < 3; i++) E.update(ex, d, [{ code: 'speed', text: T.speed(50) }], DT);
  assert.strictEqual(ex.score, 70); assert.strictEqual(ex.end, null);
  E.update(ex, d, [{ code: 'blink', text: T.blink }], DT);
  assert.strictEqual(ex.score, 65); assert.match(ex.end, /70점/);
  const before = ex.items.length;
  E.update(ex, d, [{ code: 'gap', text: T.gap }], DT);
  assert.strictEqual(ex.items.length, before, '끝난 뒤에는 더 채점하지 않음');
  ex = E.create(); d = fake();
  E.update(ex, d, [{ code: 'signal', text: T.red }], DT);
  assert.match(ex.end, /^실격/); assert.strictEqual(ex.items[0].pts, null); assert.strictEqual(ex.items[0].code, 'signal');
  ex = E.create(); d = fake(); d.score.failReason = '다른 차와 충돌했어요';
  E.update(ex, d, [], DT);
  assert.strictEqual(ex.end, '실격 — 다른 차와 충돌했어요');
});

test('경로 이탈 3회째 중단', () => {
  const ex = E.create(), d = fake();
  for (let i = 0; i < 3; i++) E.update(ex, d, [{ code: 'route', text: T.route }], DT);
  assert.strictEqual(ex.score, 85); assert.match(ex.end, /세 번/);
  assert.deepStrictEqual(ex.items.map(i => i.code), ['route', 'route', 'route'], '주행 감점 코드는 그대로');
});

test('도착: 5초 안에 우측 깜빡이면 합격, 아니면 −5', () => {
  let ex = E.create(), d = fake();
  d.blink = -1; run(ex, d, 1); d.car.v = 5; run(ex, d, 1);
  d.blink = 1; run(ex, d, 30); d.blink = 0; d.score.done = true; run(ex, d, 1);
  assert.deepStrictEqual(E.result(ex), { score: 100, passed: true, dq: false, end: null, items: [] });
  ex = E.create(); d = fake();
  d.blink = -1; run(ex, d, 1); d.blink = 0; d.car.v = 5; run(ex, d, 200); d.score.done = true; run(ex, d, 2);
  const r = E.result(ex);
  assert.strictEqual(r.score, 95); assert.strictEqual(r.passed, true); assert.strictEqual(r.items.length, 1); assert.strictEqual(r.items[0].code, 'end');
});

test('better: 합격 > 실격 아님 > 점수 > 시간', () => {
  assert(E.better({ passed: true, score: 70, time: 99 }, { passed: false, score: 95, time: 10 }));
  assert(E.better({ passed: false, dq: false, score: 60, time: 99 }, { passed: false, dq: true, score: 100, time: 10 }), '실격 100점보다 불합격 60점');
  assert(!E.better({ passed: false, dq: true, score: 100, time: 10 }, { passed: false, score: 60, time: 99 }), '예전 기록(dq 없음)은 실격 아님');
  assert(E.better({ passed: false, dq: true, score: 100, time: 10 }, { passed: false, dq: true, score: 95, time: 5 }));
  assert(E.better({ passed: true, score: 90, time: 99 }, { passed: true, score: 85, time: 10 }));
  assert(E.better({ passed: true, score: 90, time: 50 }, { passed: true, score: 90, time: 60 }));
  assert(!E.better({ passed: true, score: 90, time: 60 }, { passed: true, score: 90, time: 50 }));
  assert(E.better({ passed: false, score: 0, time: 1 }, null));
});

test('도착 감점으로 70점 아래: 도착했지만 불합격(중단 문구 아님)', () => {
  const ex = E.create(), d = fake();
  d.blink = -1; run(ex, d, 1); d.blink = 0; d.car.v = 5; run(ex, d, 1);
  for (let i = 0; i < 2; i++) E.update(ex, d, [{ code: 'speed', text: T.speed(50) }], DT);
  E.update(ex, d, [{ code: 'blink', text: T.blink }], DT);
  assert.strictEqual(ex.score, 75);
  run(ex, d, 200); d.score.done = true; run(ex, d, 1); // 오른쪽 깜빡이 없이 도착 → −5
  const r = E.result(ex);
  assert.strictEqual(ex.finished, true); assert.strictEqual(r.score, 70); assert.strictEqual(r.passed, true);
  const ex2 = E.create(), d2 = fake();
  d2.blink = -1; run(ex2, d2, 1); d2.blink = 0; d2.car.v = 5; run(ex2, d2, 1);
  for (let i = 0; i < 2; i++) E.update(ex2, d2, [{ code: 'speed', text: T.speed(50) }], DT);
  E.update(ex2, d2, [{ code: 'blink', text: T.blink }, { code: 'gap', text: T.gap }], DT);
  assert.strictEqual(ex2.score, 70);
  run(ex2, d2, 200); d2.score.done = true; run(ex2, d2, 1);
  const r2 = E.result(ex2);
  assert.strictEqual(ex2.finished, true); assert.strictEqual(r2.score, 65);
  assert.strictEqual(r2.passed, false); assert.strictEqual(r2.dq, false);
  assert.strictEqual(r2.end, '도착했지만 점수가 70점 아래예요');
});

test('급제동: 5초 안 재감속은 한 번만, 5초 뒤엔 다시', () => {
  const ex = E.create(), d = fake();
  d.blink = -1; run(ex, d, 1); d.blink = 0;
  const brake = () => { d.car.v = 15; run(ex, d, 1); let v = 15; run(ex, d, 10, d => { v -= 8 * DT; d.car.v = v; }); };
  brake(); run(ex, d, 30); brake(); // 약 1.7초 뒤 다시 급제동
  assert.strictEqual(ex.items.filter(i => /급제동/.test(i.text)).length, 1);
  run(ex, d, 150); brake(); // 5초 넘게 지나서
  assert.strictEqual(ex.items.filter(i => /급제동/.test(i.text)).length, 2);
});

test('실격 뒤 같은 스텝의 다른 감점은 무시', () => {
  const ex = E.create(), d = fake();
  E.update(ex, d, [{ code: 'signal', text: T.red }, { code: 'speed', text: T.speed(50) }, { code: 'blink', text: T.blink }], DT);
  assert.strictEqual(ex.items.length, 1); assert.strictEqual(ex.score, 100);
  assert.strictEqual(E.result(ex).dq, true);
});

// 실제 drive.js 루프: 교통 없음, 시험 모드 city-signal. 첫 교차로 정지선 근처에 차를 놓고 적색에 맞춰 달린다.
function examDrive(frontOver, tGo) {
  const D = require('../drive.js'), M = require('../missions.js'), R = require('../roads.js'), C = require('../car.js');
  const base = M.byId('city-signal'), d = D.create(Object.assign({}, base, { exam: true, density: 'none' }));
  const st = d.net.stops.find(x => x.laneId === base.start.laneId), ln = d.net.lanes[st.laneId];
  let tr = 0; // J1 진입 차로가 적색이 되는 시각(적색 10초 지난 때)
  for (let t = 0.1; t < 200; t += 0.1) if (R.signalState(d.net, t, st.signal, st.laneId) === 'R' && R.signalState(d.net, t - 0.1, st.signal, st.laneId) !== 'R') { tr = t; break; }
  const p = R.pointAt(ln, st.s + frontOver - C.SELTOS.length / 2);
  Object.assign(d.car, C.poseFromCenter(p.x, p.y, p.a), { gear: 'D', v: 0 });
  d.t = tr + 5; d.exam.started = true; d.exam.leftT = d.t;
  const out = [];
  for (let i = 0; i < 6000 && !d.score.failReason && !d.score.done; i++) {
    const go = d.t >= tGo(tr, d);
    out.push(...D.step(d, { throttle: go ? 0.5 : 0, brake: go ? 0 : 1, steerRate: 0 }, DT));
    if (d.player.laneId !== st.laneId && d.net.lanes[d.player.laneId].kind !== 'connector') break; // 교차로 통과
  }
  return { d, codes: out.map(e => e.code) };
}
test('drive.js 시험: 적색에 정지선 넘어 달리면 실격 / 살짝 넘어 섰다가 녹색에 출발하면 정지선 −5만', () => {
  const R = require('../roads.js');
  let r = examDrive(-1, tr => tr + 5); // 정지선 1m 앞에서 적색인데 출발
  assert.match(r.d.score.failReason || '', /^실격/, JSON.stringify(r.codes));
  assert.strictEqual(r.d.score.failReason, '실격 — ' + T.red);
  r = examDrive(0.4, (tr, d) => R.signalState(d.net, d.t, d.net.stops.find(x => x.laneId === d.mission.start.laneId).signal, d.mission.start.laneId) === 'G' ? 0 : Infinity);
  assert.strictEqual(r.d.score.failReason, null, JSON.stringify(r.codes) + ' ' + r.d.score.failReason);
  assert.deepStrictEqual(r.codes, ['stopline']);
  assert.notStrictEqual(r.d.player.laneId, r.d.mission.start.laneId, '교차로를 지나감');
  assert.strictEqual(r.d.exam.score, 95); assert.strictEqual(r.d.exam.end, null);
  assert.strictEqual(E.rule({ code: 'stopline', text: T.stopline }), 5);
});

test('drive.js: 시험 미션이면 d.exam, 시험 종료는 failReason', () => {
  const D = require('../drive.js'), M = require('../missions.js');
  const base = M.byId('city-signal');
  const d = D.create(Object.assign({}, base, { exam: true }));
  assert(d.exam && d.exam.score === 100);
  assert.strictEqual(D.create(base).exam, null);
  d.exam.end = '실격 — 테스트'; D.step(d, { throttle: 0, brake: 0, steerRate: 0 }, DT);
  assert.strictEqual(d.score.failReason, '실격 — 테스트');
});

for (const [name, fn] of tests) {
  try { fn(); } catch (e) { fail++; console.error('FAIL', name, '\n ', e.message); }
}
if (fail) { console.error(fail + ' failed'); process.exit(1); }
console.log('all exam tests passed');
