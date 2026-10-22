const assert = require('assert');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let fail = 0;
// node bungbung/test/progress.test.js
const P = require('../progress.js');
const DS = require('../drive-score.js');
const Y = require('../yard.js');
const T = DS.TEXT, F = DS.FAIL;
const DAY = 86400000;
const at0 = new Date(2026, 9, 22, 12, 0, 0).getTime(); // 지역 시각 정오
const e = (id, kind, marks = [], ok = true, at = at0) => ({ at, id, kind, ok, time: 30, marks });
const cat = P.catalog();

test('record: 끝에 붙이고 새 배열, 300판 넘으면 오래된 것부터 버림', () => {
  const h0 = [];
  const h1 = P.record(h0, e('apt-pillar', 'parking'));
  assert.strictEqual(h0.length, 0, '원본은 그대로');
  assert.strictEqual(h1.length, 1);
  let h = [];
  for (let i = 0; i < 305; i++) h = P.record(h, Object.assign(e('apt-pillar', 'parking'), { time: i }));
  assert.strictEqual(h.length, 300);
  assert.strictEqual(h[0].time, 5);
  assert.strictEqual(h[299].time, 304, '최신이 마지막');
  assert.strictEqual(P.record([1, 2, 3], 4, 2).join(), '3,4');
  assert.strictEqual(P.record(null, e('x', 'city')).length, 1);
});

test('marksOf parking: 접촉 1회마다 contact, 전환 par 초과면 switches 1개, 방지턱은 bump', () => {
  const map = { par: 2 };
  assert.deepStrictEqual(P.marksOf('parking', { contacts: 0, switches: 2 }, map), []);
  assert.deepStrictEqual(P.marksOf('parking', { contacts: 2, switches: 3 }, map), ['contact', 'contact', 'switches']);
  assert.deepStrictEqual(P.marksOf('parking', { contacts: 3, switches: 0, bumps: 1 }, map), ['contact', 'contact', 'bump']);
  assert.deepStrictEqual(P.marksOf('parking', { contacts: 1, switches: 9 }, null).slice(0, 1), ['contact'], 'par 없으면 기본 2');
});

test('marksOf city/highway: 감점 코드 그대로, 실패면 fail:<키>', () => {
  const res = { passed: false, penalties: [{ code: 'blink', text: T.blink, t: 1 }, { code: 'gap', text: T.gap, t: 2 }, { code: 'blink', text: T.blink, t: 3 }], failReason: F.car };
  assert.deepStrictEqual(P.marksOf('city', res), ['blink', 'gap', 'blink', 'fail:car']);
  assert.deepStrictEqual(P.marksOf('highway', { passed: true, penalties: [{ code: 'passLane', text: T.passLane, t: 1 }] }), ['passLane']);
  assert.deepStrictEqual(P.marksOf('highway', { passed: false, penalties: [], failReason: F.missedExit }), ['fail:missedExit']);
  assert.deepStrictEqual(P.marksOf('city', { passed: false, penalties: [], failReason: '알 수 없는 이유' }), ['fail:other']);
});

test('marksOf exam: 항목 code 그대로(시험 전용 start·end·hardBrake 포함), 실격 사유', () => {
  const res = { score: 70, passed: false, dq: true, end: '실격 — ' + F.ped, items: ['start', 'speed', 'solid', 'hardBrake', 'gap', 'end'].map((code, t) => ({ t, pts: 5, text: '?', code })) };
  assert.deepStrictEqual(P.marksOf('exam', res), ['start', 'speed', 'solid', 'hardBrake', 'gap', 'end', 'fail:ped']);
  // 감점 항목 실격(적색 신호)은 항목에 이미 있으니 fail을 더하지 않는다
  const dq = { score: 100, passed: false, dq: true, end: '실격 — ' + T.red, items: [{ t: 1, pts: null, text: T.red, code: 'signal' }] };
  assert.deepStrictEqual(P.marksOf('exam', dq), ['signal']);
  assert.deepStrictEqual(P.marksOf('exam', { score: 65, passed: false, dq: false, end: '점수가 70점 아래로 내려가 시험이 중단됐어요', items: [] }), []);
});
test('marksOf exam: 실제 채점(exam.js) 항목 → 약점 코드, 문구가 바뀌어도 코드로 잡힌다', () => {
  const E = require('../exam.js'), DT = 1 / 30, ex = E.create(), d = { t: 0, car: { v: 0 }, blink: 0, score: { done: false, failReason: null } };
  const go = (n, f, evs = []) => { for (let i = 0; i < n; i++) { d.t += DT; if (f) f(); E.update(ex, d, i ? [] : evs, DT); } };
  go(30); d.car.v = 15; go(1); // 깜빡이 없이 출발
  let v = 15; go(10, () => { v -= 8 * DT; d.car.v = v; }); // 급제동
  d.car.v = 5; go(1, null, [{ code: 'speed', text: T.speed(50) }, { code: 'solid', text: T.bus }]);
  go(200); d.score.done = true; go(2); // 오른쪽 깜빡이 없이 도착
  const r = E.result(ex);
  for (const i of r.items) i.text = '바뀐 문구 ' + i.text;
  const marks = P.marksOf('exam', r);
  assert.deepStrictEqual(marks, ['start', 'hardBrake', 'speed', 'solid', 'end']);
  for (const c of marks) assert(P.MARKS[c], 'MARKS에 ' + c);
});
test('marksOf yard: 항목 code 그대로, yard.js가 내는 항목은 모두 MARKS에 있는 code를 단다', () => {
  const codes = ['curb', 'start', 'hill', 'hill', 'blinkCorner', 'blinkCorner', 'tpark', 'light', 'accel', 'alarm', 'alarm', 'end'];
  const items = codes.map((code, t) => ({ t, pts: 5, text: '?', code }));
  assert.deepStrictEqual(P.marksOf('yard', { score: 10, passed: false, dq: true, end: '실격', items }), codes);
  // yard.js CODES(TEXT 키 → 코드): 모든 사유에 코드가 있고, 그 코드는 MARKS에 있다. 항목은 item(key, pts)로만 만든다
  assert.deepStrictEqual(Object.keys(Y.CODES).sort(), Object.keys(Y.TEXT).sort());
  for (const [k, c] of Object.entries(Y.CODES)) assert(P.MARKS[c], 'MARKS에 없는 코드: ' + k + ' → ' + c);
  assert.deepStrictEqual(Y.item('slow', 10), { pts: 10, text: Y.TEXT.slow, code: 'accel' });
  assert.deepStrictEqual(Y.item('red'), { dq: true, text: Y.TEXT.red, code: 'light' });
  assert.deepStrictEqual(P.marksOf('yard', { items: Object.keys(Y.TEXT).map(k => Y.item(k, 5)) }), Object.keys(Y.TEXT).map(k => Y.CODES[k]));
});
test('marksOf exam·yard: code 없는 예전 결과는 문구로', () => {
  const res = { score: 70, passed: false, dq: true, end: '실격 — ' + F.ped, items: [
    { t: 1, pts: 5, text: '출발할 때 왼쪽 깜빡이를 켜지 않았어요' },
    { t: 2, pts: 10, text: T.speed(50) },
    { t: 3, pts: 7, text: T.bus },
    { t: 4, pts: 3, text: '급제동했어요 — 미리 천천히 줄이세요' },
    { t: 5, pts: 5, text: T.gapRain },
    { t: 6, pts: 5, text: '도착해 세울 때 오른쪽 깜빡이를 켜지 않았어요' },
  ] };
  assert.deepStrictEqual(P.marksOf('exam', res), ['start', 'speed', 'solid', 'hardBrake', 'gap', 'end', 'fail:ped']);
  const YT = Y.TEXT;
  const items = [YT.hit, YT.startBlink, YT.hillNoStop, YT.hillRoll, YT.leftBlink, YT.rightBlink, YT.parkTime, YT.red, YT.slow, YT.emgStop, YT.hazard, YT.endBlink, YT.hillTime]
    .map((text, i) => ({ t: i, pts: 5, text }));
  assert.deepStrictEqual(P.marksOf('yard', { score: 10, passed: false, dq: true, end: '실격', items }),
    ['curb', 'start', 'hill', 'hill', 'blinkCorner', 'blinkCorner', 'tpark', 'light', 'accel', 'alarm', 'alarm', 'end', 'hill']);
});
test('marksOf lesson: 되돌리기 횟수만큼 retry', () => {
  assert.deepStrictEqual(P.marksOf('lesson', { retries: 2 }), ['retry', 'retry']);
  assert.deepStrictEqual(P.marksOf('lesson', 0), []);
  assert.deepStrictEqual(P.marksOf('lesson', 1), ['retry']);
  assert.deepStrictEqual(P.marksOf('nope', {}), []);
});

test('weak: 최근 30판만, 판당 빈도 순, 최대 3개, 이름·요령', () => {
  let h = [];
  for (let i = 0; i < 10; i++) h = P.record(h, e('city-lane', 'city', ['speed', 'speed', 'speed']));
  for (let i = 0; i < 30; i++) h = P.record(h, e('city-lane', 'city', i < 6 ? ['blink'] : i < 10 ? ['gap'] : []));
  const w = P.weak(h);
  assert.deepStrictEqual(w.map(x => x.code), ['blink', 'gap'], '30판 밖의 speed는 빠짐');
  assert.strictEqual(w[0].count, 6);
  assert.strictEqual(w[0].perRun, 6 / 30);
  assert.strictEqual(w[0].name, P.MARKS.blink.name);
  assert.strictEqual(w[0].tip, P.MARKS.blink.tip);
  assert.strictEqual(P.weak(h, 40)[0].code, 'speed');
  assert.deepStrictEqual(P.weak([]), []);
});

test('weak: runs = 그 실수가 나온 판 수(한 판에 여러 번이어도 1), 판 수를 넘지 않는다', () => {
  const h = [e('city-lane', 'city', ['blink', 'blink', 'blink']), e('city-lane', 'city', ['blink', 'gap']), e('city-lane', 'city', []), e('lesson-city', 'lesson', ['retry', 'retry'])];
  const w = P.weak(h), b = w.find(x => x.code === 'blink');
  assert.strictEqual(b.count, 4); assert.strictEqual(b.runs, 2);
  assert.strictEqual(w.find(x => x.code === 'gap').runs, 1);
  assert.strictEqual(w.find(x => x.code === 'retry').runs, 1);
  for (const x of w) assert(x.runs <= h.length);
});
test('weak: 최대 3개, 레슨 retry 가중치 0.5, 동률은 최근에 받은 것 → 코드 순', () => {
  let h = [e('lesson-controls', 'lesson', ['retry', 'retry', 'retry', 'retry'])];
  h = P.record(h, e('city-lane', 'city', ['mirror', 'mirror', 'blink']));
  h = P.record(h, e('city-lane', 'city', ['solid', 'blink', 'speed']));
  const w = P.weak(h);
  assert.strictEqual(w.length, 3);
  assert.strictEqual(w[0].code, 'blink');
  assert.strictEqual(w[0].count, 2);
  // retry 4×0.5 = 2, mirror 2: mirror가 더 최근
  assert.deepStrictEqual(w.slice(1).map(x => [x.code, x.count]), [['mirror', 2], ['retry', 2]]);
  // 같은 판 같은 수 → 코드 순
  const w2 = P.weak([e('city-lane', 'city', ['speed', 'gap'])]);
  assert.deepStrictEqual(w2.map(x => x.code), ['gap', 'speed']);
  assert.deepStrictEqual(P.weak([e('city-lane', 'city', ['speed', 'gap'])]), w2, '결정적');
});

test('catalog: 실제 목록에서 분류별 id', () => {
  assert.deepStrictEqual(cat.lesson, ['lesson-controls', 'lesson-parking', 'lesson-city']);
  assert.deepStrictEqual(cat.exam, ['exam-a', 'exam-b', 'yard']);
  assert.strictEqual(cat.parking[0], require('../maps.js').list[0].id);
  assert.strictEqual(cat.parking.length, require('../maps.js').list.length);
  assert(cat.city.includes('city-lane') && cat.city.includes('city-uturn'));
  assert(cat.highway.includes('hw-merge') && !cat.highway.includes('city-lane'));
});

test('MARKS: 모든 코드에 이름·요령, missions는 카탈로그에 있는 id', () => {
  const all = new Set([].concat(cat.lesson, cat.parking, cat.city, cat.highway, cat.exam));
  for (const [code, m] of Object.entries(P.MARKS)) {
    assert(m.name && m.tip, code + ' 이름·요령');
    assert(Array.isArray(m.missions), code);
    for (const id of m.missions) assert(all.has(id), code + ' → 없는 id ' + id);
  }
  for (const c of ['blink', 'mirror', 'solid', 'stopline', 'signal', 'stop', 'speed', 'gap', 'cutin', 'route', 'contact', 'switches', 'bump', 'curb', 'hill', 'tpark', 'blinkCorner', 'accel', 'alarm', 'light', 'start', 'end', 'hardBrake', 'retry'])
    assert(P.MARKS[c], c);
  for (const k of Object.keys(F)) assert(P.MARKS['fail:' + k], 'fail:' + k);
  for (const k of ['minSpeed', 'shoulder', 'passLane', 'mergeSlow', 'hazard', 'tollStop', 'hipassSpeed', 'unprotected']) assert(P.MARKS[k], k);
  assert(P.MARKS.blink.missions.includes('city-uturn'));
  assert(P.MARKS.bump.missions.includes('apt-bump'));
  assert(P.MARKS.hill.missions.includes('street-hill-start'));
  // C2 미션: 빗길은 간격·급제동, 차로 감소는 합류 실패
  for (const c of ['gap', 'hardBrake']) assert(P.MARKS[c].missions.includes('city-rain') && P.MARKS[c].missions.includes('hw-rain'), c);
  assert.deepStrictEqual(P.MARKS['fail:laneEnd'].missions, ['city-merge'], '차로 감소 실패는 city-merge에서만');
  // 실패 코드가 생기는 미션 짝 확인(그 미션에만 있는 실패)
  assert.deepStrictEqual(P.MARKS['fail:accelEnd'].missions, ['hw-merge']);
  assert.deepStrictEqual(P.MARKS['fail:tollLane'].missions, ['hw-toll']);
  assert(P.MARKS['fail:missedExit'].missions.every(id => ['hw-exit', 'hw-jc'].includes(id)));
  assert.deepStrictEqual(P.MARKS.gap.missions, ['city-cutin', 'city-rain', 'hw-rain', 'hw-jam', 'hw-pass']);
});

test('progressOf: 분류별 한 번이라도 통과한 수 / 전체', () => {
  const h = [e('lesson-controls', 'lesson'), e('lesson-controls', 'lesson'), e('lesson-parking', 'lesson', [], false),
    e(cat.parking[0], 'parking'), e('city-lane', 'city', [], false), e('city-lane', 'city'), e('city-bus', 'city'),
    e('yard', 'yard'), e('exam-a', 'exam', [], false), e('not-in-catalog', 'city')];
  const p = P.progressOf(h, cat);
  assert.deepStrictEqual(p.lesson, { done: 1, total: 3 });
  assert.deepStrictEqual(p.parking, { done: 1, total: cat.parking.length });
  assert.deepStrictEqual(p.city, { done: 2, total: cat.city.length });
  assert.deepStrictEqual(p.highway, { done: 0, total: cat.highway.length });
  assert.deepStrictEqual(p.exam, { done: 1, total: 3 });
  assert.deepStrictEqual(P.progressOf([], cat).exam, { done: 0, total: 3 });
});

test('days: 최근 7일(오늘 마지막) 날짜별 판 수, 지역 날짜 경계', () => {
  const now = new Date(2026, 9, 22, 9, 30).getTime();
  const midnight = new Date(2026, 9, 22, 0, 0).getTime();
  const h = [
    e('a', 'city', [], true, midnight),          // 오늘 0시 정각
    e('a', 'city', [], true, midnight - 1),      // 어제 23:59:59.999
    e('a', 'city', [], true, midnight + 3600e3), // 오늘
    e('a', 'city', [], true, new Date(2026, 9, 16, 23, 0).getTime()), // 6일 전
    e('a', 'city', [], true, new Date(2026, 9, 15, 23, 0).getTime()), // 7일 전 → 빠짐
    e('a', 'city', [], true, now + DAY),         // 미래 → 빠짐
  ];
  assert.deepStrictEqual(P.days(h, now), [1, 0, 0, 0, 0, 1, 2]);
  assert.deepStrictEqual(P.days([], now), [0, 0, 0, 0, 0, 0, 0]);
});

test('reviewSet: 최근 그 코드를 받은 관련 미션 → 안 해 본 관련 미션, 최대 3', () => {
  const rel = P.MARKS.blink.missions;
  assert(rel.length >= 3);
  const h = [e(rel[2], 'city', ['blink']), e(rel[0], 'city', []), e('city-signal', 'city', ['blink']), e(rel[1], 'city', ['blink'])];
  const r = P.reviewSet(h, 'blink', cat);
  assert.deepStrictEqual(r.slice(0, 2), [rel[1], rel[2]], '최근에 받은 관련 미션부터(관련 없는 city-signal 제외)');
  assert.strictEqual(r.length, 3);
  assert.notStrictEqual(r[2], rel[0], '해 봤지만 안 받은 것보다 안 해 본 것');
  assert(!h.some(x => x.id === r[2]));
  // 기록이 없으면 관련 미션 앞에서부터
  assert.deepStrictEqual(P.reviewSet([], 'blink', cat), rel.slice(0, 3));
  // 관련 미션이 없거나 모르는 코드
  assert.deepStrictEqual(P.reviewSet(h, 'fail:other', cat), []);
  assert.deepStrictEqual(P.reviewSet(h, 'zzz', cat), []);
  // 카탈로그에 없는 id는 고르지 않음
  assert.deepStrictEqual(P.reviewSet([], 'blink', { city: [rel[1]] }), [rel[1]]);
});

test('reviewSet: 모두 해 봤고 받은 적 없으면 나머지 관련 미션으로 채움', () => {
  const rel = P.MARKS.tpark.missions;
  const h = rel.map(id => e(id, id === 'yard' ? 'yard' : 'parking'));
  const r = P.reviewSet(h, 'tpark', cat);
  assert.strictEqual(r.length, Math.min(3, rel.length));
  assert(r.every(id => rel.includes(id)));
});

test('praise: 이번 판 코드 수가 같은 종류 최근 30판 평균보다 줄면 한 줄, 아니면 null', () => {
  let h = [];
  for (let i = 0; i < 5; i++) h = P.record(h, e('city-lane', 'city', i < 3 ? ['blink', 'blink'] : ['blink']));
  // 평균 blink (2*3+1*2)/5 = 1.6
  const now = e('city-lane', 'city', []);
  const s = P.praise(h, now);
  assert.match(s, /깜빡이/);
  assert.match(s, /1\.6 → 이번 0/);
  assert.strictEqual(P.praise(h, e('city-lane', 'city', ['blink', 'blink'])), null, '줄지 않음');
  // 기록에 이번 판이 이미 들어가 있어도 같은 결과
  assert.strictEqual(P.praise(P.record(h, now), now), s);
  // 기록 부족(3판 미만)·평균 0.5 미만이면 없음
  assert.strictEqual(P.praise(h.slice(0, 2), now), null);
  const rare = [e('a', 'city', ['gap']), e('a', 'city'), e('a', 'city'), e('a', 'city')];
  assert.strictEqual(P.praise(rare, now), null);
  // 다른 종류의 판은 평균에 안 들어감
  const park = [1, 2, 3].map(() => e('apt-pillar', 'parking', ['contact', 'contact']));
  assert.strictEqual(P.praise(park, now), null);
  assert.match(P.praise(park, e('apt-pillar', 'parking', ['contact'])), /접촉/);
  // 가장 많이 줄어든 코드 하나
  const two = [1, 2, 3].map(() => e('a', 'city', ['gap', 'speed', 'speed', 'speed']));
  assert.match(P.praise(two, e('a', 'city', ['gap'])), /과속|제한속도/);
});

test('nextUp: 레슨 → 첫 주차 맵 → 시내 → 고속도로 → 시험 → 나머지 주차, 다 하면 null', () => {
  assert.strictEqual(P.nextUp([], cat), 'lesson-controls');
  let h = cat.lesson.map(id => e(id, 'lesson'));
  assert.strictEqual(P.nextUp(h, cat), cat.parking[0]);
  h = h.concat([e(cat.parking[0], 'parking'), e('city-lane', 'city', [], false)]);
  assert.strictEqual(P.nextUp(h, cat), cat.city[0], '통과 못 한 것은 아직 안 한 것');
  h = h.concat(cat.city.map(id => e(id, 'city')));
  assert.strictEqual(P.nextUp(h, cat), cat.highway[0]);
  h = h.concat(cat.highway.map(id => e(id, 'highway')));
  assert.strictEqual(P.nextUp(h, cat), 'exam-a');
  h = h.concat(cat.exam.map(id => e(id, 'exam')));
  assert.strictEqual(P.nextUp(h, cat), cat.parking[1]);
  h = h.concat(cat.parking.map(id => e(id, 'parking')));
  assert.strictEqual(P.nextUp(h, cat), null);
});

test('복습 묶음: 지금 미션 판만 세고, 다시 하기도 판 수에, [다음]은 판을 끝낸 뒤에만, 끝나면 요약', () => {
  let rv = P.reviewStart('blink', ['city-lane', 'city-uturn']);
  assert.deepStrictEqual(rv, { code: 'blink', ids: ['city-lane', 'city-uturn'], i: 0, runs: 0, n: 0, played: false });
  assert.strictEqual(P.reviewAdvance(rv), null, '아직 안 끝냄(played=false) → [다음]은 평소대로');
  assert.strictEqual(P.reviewAdvance(null), null);
  assert.strictEqual(P.reviewStep(rv, 'city-bus', ['blink']), rv, '다른 미션 판은 그대로(같은 객체)');
  assert.strictEqual(P.reviewStep(null, 'city-lane', ['blink']), null);
  const r0 = rv;
  rv = P.reviewStep(rv, 'city-lane', ['blink', 'mirror', 'blink']);
  assert.deepStrictEqual(r0, { code: 'blink', ids: ['city-lane', 'city-uturn'], i: 0, runs: 0, n: 0, played: false }, '입력은 그대로');
  assert.deepStrictEqual([rv.runs, rv.n, rv.played], [1, 2, true]);
  rv = P.reviewStep(rv, 'city-lane', ['blink']); // 결과 화면에서 다시 하기
  assert.deepStrictEqual([rv.i, rv.runs, rv.n], [0, 2, 3]);
  let st = P.reviewAdvance(rv);
  assert.strictEqual(st.launch, 'city-uturn');
  assert.strictEqual(st.summary, null);
  assert.deepStrictEqual([st.rv.i, st.rv.played, st.rv.runs, st.rv.n], [1, false, 2, 3]);
  assert.strictEqual(P.reviewAdvance(st.rv), null, '다음 미션을 끝내기 전');
  rv = P.reviewStep(st.rv, 'city-uturn', []);
  st = P.reviewAdvance(rv);
  assert.deepStrictEqual(st, { rv: null, launch: null, summary: { code: 'blink', runs: 3, n: 3 } });
});
test('seedHistory: 예전 최고 기록·레슨 완료 → id마다 통과 한 줄(seed), 통과 못 한 주행·시험 기록은 뺌', () => {
  const store = {
    'pp-lesson-done-lesson-controls': true,
    ['pp-best-' + cat.parking[0]]: { contacts: 1, switches: 2, time: 41.5 },
    'pp-drive-best-city-lane': { passed: true, penalties: [], time: 90 },
    'pp-drive-best-city-bus': { passed: false, penalties: [], time: 90 },
    'pp-drive-best-hw-merge': { passed: true, penalties: [], time: 120 },
    'pp-exam-best-exam-a': { score: 85, passed: true, time: 300 },
    'pp-exam-best-exam-b': { score: 60, passed: false, time: 300 },
    'pp-exam-best-yard': { score: 90, passed: true, time: 200 },
    'pp-drive-best-not-in-catalog': { passed: true, time: 1 },
  };
  const h = P.seedHistory(k => (k in store ? store[k] : null), cat, at0);
  assert.deepStrictEqual(h.map(x => [x.id, x.kind]), [['lesson-controls', 'lesson'], [cat.parking[0], 'parking'], ['city-lane', 'city'], ['hw-merge', 'highway'], ['exam-a', 'exam'], ['yard', 'yard']]);
  assert(h.every(x => x.ok && x.seed && x.at === at0 && x.marks.length === 0));
  assert.strictEqual(h[1].time, 41.5);
  assert.deepStrictEqual(P.seedHistory(() => null, cat, at0), []);
  // 진행률·다음 추천엔 반영
  const pr = P.progressOf(h, cat);
  assert.deepStrictEqual([pr.lesson.done, pr.parking.done, pr.city.done, pr.highway.done, pr.exam.done], [1, 1, 1, 1, 2]);
  assert.notStrictEqual(P.nextUp(h, cat), 'lesson-controls');
  // 약점·7일·칭찬엔 안 들어감
  assert.deepStrictEqual(P.days(h, at0), [0, 0, 0, 0, 0, 0, 0]);
  const real = [e('city-lane', 'city', ['blink']), e('city-bus', 'city', [])];
  assert.deepStrictEqual(P.weak(h.concat(real)), P.weak(real));
  const ps = [1, 2, 3].map(() => e('apt-pillar', 'parking', ['contact', 'contact']));
  const seeded = h.concat(ps), now = e('apt-pillar', 'parking', []);
  assert(P.praise(ps, now) && P.praise(seeded, now) === P.praise(ps, now), 'seed 빼고 칭찬');
  assert.strictEqual(P.praise(h.concat(ps.slice(0, 2)), now), null, 'seed는 칭찬 판 수(3판)에 안 셈');
});
test('record: 300판 상한은 실제 판만 세고 seed는 버리지 않음', () => {
  const seeds = [e('city-lane', 'city'), e('hw-merge', 'highway')].map(x => Object.assign(x, { seed: true }));
  let h = seeds;
  for (let i = 0; i < 305; i++) h = P.record(h, Object.assign(e('apt-pillar', 'parking'), { time: i }));
  assert.strictEqual(h.length, 302);
  assert.deepStrictEqual(h.slice(0, 2), seeds, 'seed는 앞에 그대로');
  assert.strictEqual(h[2].time, 5);
  assert.strictEqual(h[301].time, 304);
  assert.strictEqual(P.progressOf(h, cat).highway.done, 1);
});
test('withSeeds: 판 기록이 있어도 통과 줄 없는 id만 seed로 앞에 붙임(이미 통과한 id·통과 못 한 기록은 그대로)', () => {
  const store = { 'pp-drive-best-city-lane': { passed: true, time: 90 }, 'pp-drive-best-hw-merge': { passed: true, time: 120 }, ['pp-best-' + cat.parking[0]]: { time: 40 } };
  const get = k => (k in store ? store[k] : null);
  const played = [e('city-lane', 'city', ['blink']), e('hw-merge', 'highway', ['gap'], false)];
  const h = P.withSeeds(played, get, cat, at0);
  assert.deepStrictEqual(h.map(x => [x.id, !!x.seed]), [[cat.parking[0], true], ['hw-merge', true], ['city-lane', false], ['hw-merge', false]]);
  const pr = P.progressOf(h, cat);
  assert.deepStrictEqual([pr.city.done, pr.highway.done, pr.parking.done], [1, 1, 1]);
  assert.deepStrictEqual(P.weak(h), P.weak(played), 'seed는 약점에 안 들어감');
  assert.deepStrictEqual(P.withSeeds(null, get, cat, at0).length, 3, '기록 없음 = seedHistory');
  // 기록 지우기(main.js): seedHistory로 다시 채우면 진행률은 최고 기록대로, 실제 판·약점은 0
  const cleared = P.seedHistory(get, cat, at0);
  assert.deepStrictEqual(P.progressOf(cleared, cat), P.progressOf(h, cat));
  assert.deepStrictEqual(P.weak(cleared), []);
});
test('순수: 입력 기록을 바꾸지 않음', () => {
  const h = [e('city-lane', 'city', ['blink'])], snap = JSON.stringify(h);
  P.weak(h); P.progressOf(h, cat); P.days(h, at0); P.reviewSet(h, 'blink', cat); P.praise(h, h[0]); P.nextUp(h, cat); P.record(h, h[0]);
  assert.strictEqual(JSON.stringify(h), snap);
});

for (const [name, fn] of tests) {
  try { fn(); } catch (e) { fail++; console.error('FAIL', name, '\n ', e.message); }
}
if (fail) { console.error(fail + ' failed'); process.exit(1); }
console.log('all progress tests passed');
