const assert = require('assert');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let fail = 0;
// node bungbung/test/score-highway.test.js
const R = require('../roads.js');
require('../roads-highway.js');
const S = require('../drive-score.js');
const DT = 0.1, PL = 4.39, KMH = 1 / 3.6;

function mainNet(lanes = 2) {
  const net = R.newNet();
  const m = R.highway(net, { id: 'h', x: 0, y: 0, a: 0, length: 3000, lanes });
  return { net, m };
}
function frame(net, t, laneId, s, v, o = {}) {
  const p = R.pointAt(net.lanes[laneId], s);
  return Object.assign({ t, dt: DT, car: { x: p.x, y: p.y, th: p.a, v, laneId, s, offset: 0, dist: 0 },
    blink: 0, mirrorL: -Infinity, mirrorR: -Infinity, collision: null, others: [], peds: [], rerouted: false,
    hazard: false, leaderGap: null, toll: null }, o);
}
const mission = (o = {}) => Object.assign({ highway: true, goal: { laneId: 'h:f2', s: 2990 } }, o);
// fn(t) → { laneId, s, v, ...frame fields } 를 0..T초 동안 돌려 감점 코드 목록과 ds를 돌려준다.
function drive(net, ms, T, fn) {
  const ds = S.create(ms, net), codes = [];
  for (let t = 0; t <= T + 1e-9; t += DT) {
    const x = fn(t), f = frame(net, t, x.laneId, x.s, x.v, x);
    for (const e of S.update(ds, f)) codes.push(e.code);
  }
  return { codes, ds, result: S.result(ds) };
}

test('TEXT·FAIL 문구', () => {
  assert.strictEqual(S.TEXT.minSpeed, '최저속도보다 느려요 — 고속도로 본선은 50km/h 이상');
  assert.strictEqual(S.TEXT.shoulder, '갓길로 달렸어요 — 갓길은 긴급할 때만');
  assert.strictEqual(S.TEXT.passLane, '1차로에 계속 있었어요 — 1차로는 추월할 때만, 추월 후 오른쪽으로');
  assert.strictEqual(S.TEXT.mergeSlow, '너무 느리게 합류했어요 — 가속차로에서 본선 속도까지 올리세요');
  assert.strictEqual(S.TEXT.hazard, '정체 앞에서 비상등을 켜지 않았어요 — 뒤차에 급감속을 알리세요');
  assert.strictEqual(S.TEXT.tollStop, '정지선에서 멈추지 않았어요 — 일반 차로는 완전히 멈췄다 출발');
  assert.strictEqual(S.TEXT.hipassSpeed, '하이패스 차로에서 너무 빨라요 — 30km/h 이하');
  assert.strictEqual(S.TEXT.gapHw, '앞차와 너무 가까워요 — 100km/h면 100m 이상');
  for (const k of ['accelEnd', 'tollLane', 'missedExit']) assert(S.FAIL[k], k);
});

test('passLane: 1차로 14초 → 없음, 16초 → 감점', () => {
  const { net } = mainNet();
  const v = 90 * KMH;
  assert(!drive(net, mission(), 14, t => ({ laneId: 'h:f1', s: 50 + v * t, v })).codes.includes('passLane'));
  assert(drive(net, mission(), 16, t => ({ laneId: 'h:f1', s: 50 + v * t, v })).codes.includes('passLane'));
  assert(!drive(net, mission(), 30, t => ({ laneId: 'h:f2', s: 50 + v * t, v })).codes.includes('passLane'), '2차로');
});

test('passLane: 추월(앞차를 지나침) 후 19초 복귀 → 없음, 21초 → 감점', () => {
  const { net } = mainNet();
  const v = 100 * KMH, vo = 80 * KMH; // 30m 앞 2차로 차를 약 5.4초에 추월
  const run = back => drive(net, mission(), 40, t => {
    const s = 50 + v * t, os = 50 + 30 + vo * t, p = R.pointAt(net.lanes['h:f2'], os);
    const tp = 30 / (v - vo);
    return { laneId: t < tp + back ? 'h:f1' : 'h:f2', s, v, others: [{ id: 7, x: p.x, y: p.y, th: p.a, v: vo, l: 4.5, w: 1.8 }] };
  }).codes;
  assert(!run(19).includes('passLane'), run(19).join(','));
  assert(run(21).includes('passLane'));
});

test('mergeSlow: 합류 59km/h → 감점, 61km/h → 없음', () => {
  const { net, m } = mainNet();
  R.onRamp(net, { id: 'on', main: m, at: 500 });
  const run = kmh => drive(net, mission(), 6, t => {
    const s = 60 + kmh * KMH * t;
    return t < 3 ? { laneId: 'on:accel', s, v: kmh * KMH } : { laneId: 'h:f2', s: s + 500, v: kmh * KMH };
  }).codes;
  assert(run(59).includes('mergeSlow'));
  assert(!run(61).includes('mergeSlow'));
});

test('accelEnd: 가속차로 끝 도달 → 실패', () => {
  const { net, m } = mainNet();
  const { accelId } = R.onRamp(net, { id: 'on', main: m, at: 500 });
  const L = R.laneLength(net.lanes[accelId]);
  const r = drive(net, mission(), 10, t => ({ laneId: accelId, s: Math.min(L - 2, L - 40 + 5 * t), v: 5 })).result;
  assert.strictEqual(r.failReason, S.FAIL.accelEnd);
  const ok = drive(net, mission(), 5, t => ({ laneId: accelId, s: 100 + 5 * t, v: 5 })).result;
  assert(!ok.failReason);
});

test('hazard: 정체 진입 후 비상등 4초 → 없음, 6초 → 감점, 시내·jamAt 없으면 없음', () => {
  const { net } = mainNet();
  const jam = { laneId: 'h:f1', s: 1500 };
  const v = 20; // 1000m에서 출발, 정체 구간(1200m~) 진입 10초
  const run = (on, ms = mission({ jamAt: jam })) => drive(net, ms, 20, t => ({ laneId: 'h:f2', s: 1000 + v * t - PL / 2, v, hazard: t >= 10 + on })).codes;
  assert(!run(4).includes('hazard'), run(4).join(','));
  assert(run(6).includes('hazard'));
  assert(!run(6, mission()).includes('hazard'), 'jamAt 없음');
});

test('minSpeed: 본선 40km/h 6초 → 감점, 4초 → 없음, 정체 구간·앞차 느림은 제외', () => {
  const { net } = mainNet();
  const run = (T, o = {}, ms = mission()) => drive(net, ms, T + 1, t => ({ laneId: 'h:f2', s: 100 + 15 * t, v: t < 1 ? 60 * KMH : 40 * KMH, ...o })).codes;
  assert(run(6).includes('minSpeed'));
  assert(!run(4).includes('minSpeed'));
  assert(!run(8, { leaderGap: { gap: 30, v: 35 * KMH } }).includes('minSpeed'), '앞차가 느림');
  assert(!run(8, {}, mission({ jamAt: { laneId: 'h:f2', s: 300 } })).includes('minSpeed'), '정체 구간');
  // 아직 최저속도에 오른 적 없음(출발·톨게이트 뒤 가속 중)
  assert(!drive(net, mission(), 8, t => ({ laneId: 'h:f2', s: 100 + 5 * t, v: 30 * KMH })).codes.includes('minSpeed'));
});

test('shoulder: 갓길 진입 → 감점, 본선·갓길 빈 구간(가속차로 겹침) → 없음', () => {
  const { net, m } = mainNet();
  R.onRamp(net, { id: 'on', main: m, at: 1000 });
  const v = 25;
  assert(drive(net, mission(), 3, t => ({ laneId: 'h:sh', s: 300 + v * t, v })).codes.includes('shoulder'));
  assert(!drive(net, mission(), 3, t => ({ laneId: 'h:f2', s: 300 + v * t, v })).codes.includes('shoulder'));
  const sh = net.lanes['h:sh'], g = sh.gaps[0];
  assert(!drive(net, mission(), 3, t => ({ laneId: 'h:sh', s: g.s0 + 20 + v * t, v })).codes.includes('shoulder'), '빈 구간');
});

function tollNet() {
  const net = R.newNet();
  const h = R.highway(net, { id: 'h', x: 0, y: 0, a: 0, length: 500, lanes: 2 });
  const tp = R.tollPlaza(net, { id: 'T', from: h });
  return { net, tp, normal: tp.booths.find(b => b.toll === 'normal'), hipass: tp.booths.find(b => b.toll === 'hipass') };
}
const tm = (o = {}) => mission(Object.assign({ goal: { laneId: 'T:out:f1', s: 190 } }, o));

test('tollStop: 일반 부스 정지 0.6초 → 없음, 미정지 → 감점', () => {
  const { net, normal } = tollNet();
  const stopAt = normal.stopS - 1 - PL / 2; // 앞범퍼가 정지선 1m 전
  const run = hold => drive(net, tm({ hipass: false }), 20, t => {
    const s0 = stopAt - 30;
    if (t < 6) return { laneId: normal.laneId, s: s0 + 5 * t, v: 5 };
    if (t < 6 + hold) return { laneId: normal.laneId, s: stopAt, v: 0 };
    return { laneId: normal.laneId, s: stopAt + 4 * (t - 6 - hold), v: 4, toll: normal };
  });
  const a = run(0.6);
  assert(!a.codes.includes('tollStop'), a.codes.join(','));
  assert(!a.result.failReason);
  const b = drive(net, tm({ hipass: false }), 15, t => ({ laneId: normal.laneId, s: stopAt - 30 + 5 * t, v: 5 }));
  assert(b.codes.includes('tollStop'));
});

test('hipassSpeed: 하이패스 차로 35km/h → 감점, 25km/h → 없음', () => {
  const { net, hipass } = tollNet();
  const run = kmh => drive(net, tm({ hipass: true }), 10, t => ({ laneId: hipass.laneId, s: hipass.stopS - 30 + kmh * KMH * t, v: kmh * KMH }));
  assert(run(35).codes.includes('hipassSpeed'));
  const ok = run(25);
  assert(!ok.codes.includes('hipassSpeed'));
  assert(!ok.result.failReason);
});

test('tollLane: 하이패스 없음인데 하이패스 차로 → 실패, 있음인데 일반 차로 → 정지 규칙(실패 아님)', () => {
  const { net, hipass, normal } = tollNet();
  const r = drive(net, tm({ hipass: false }), 10, t => ({ laneId: hipass.laneId, s: hipass.stopS - 20 + 7 * t, v: 7 })).result;
  assert.strictEqual(r.failReason, S.FAIL.tollLane);
  const r2 = drive(net, tm({ hipass: true }), 10, t => ({ laneId: normal.laneId, s: normal.stopS - 20 + 7 * t, v: 7 }));
  assert(!r2.result.failReason, '하이패스 차도 일반 차로(카드 결제) 가능');
  assert(r2.codes.includes('tollStop'), '일반 차로 규칙: 정지 안 하면 감점');
});

test('tollLane: 하이패스 차가 일반 차로에서 정지선 앞 정지 후 통과 → 감점·실패 없음', () => {
  const { net, normal } = tollNet();
  const stopAt = normal.stopS - 1 - PL / 2;
  const a = drive(net, tm({ hipass: true }), 20, t => {
    if (t < 6) return { laneId: normal.laneId, s: stopAt - 30 + 5 * t, v: 5 };
    if (t < 7) return { laneId: normal.laneId, s: stopAt, v: 0 };
    return { laneId: normal.laneId, s: stopAt + 4 * (t - 7), v: 4 };
  });
  assert.deepStrictEqual(a.codes, []);
  assert(!a.result.failReason);
});

test('passLane: 톨게이트로 이어지는 1차로는 광장 앞 600m 안에서 제외(하이패스 차로 준비)', () => {
  const net = R.newNet();
  const h = R.highway(net, { id: 'h', x: 0, y: 0, a: 0, length: 3000, lanes: 2 });
  R.tollPlaza(net, { id: 'T', from: h });
  const ms = mission({ goal: { laneId: 'T:out:f1', s: 190 }, hipass: true });
  const v = 20;
  assert(!drive(net, ms, 25, t => ({ laneId: 'h:f1', s: 2995 - 500 + v * t > 2995 ? 2995 : 2995 - 500 + v * t, v })).codes.includes('passLane'), '광장 앞 500m');
  assert(drive(net, ms, 20, t => ({ laneId: 'h:f1', s: 1000 + v * t, v })).codes.includes('passLane'), '광장에서 먼 1차로는 그대로');
});

test('minSpeed: 톨게이트 광장 앞 600m 안 감속은 제외', () => {
  const net = R.newNet();
  const h = R.highway(net, { id: 'h', x: 0, y: 0, a: 0, length: 3000, lanes: 2 });
  R.tollPlaza(net, { id: 'T', from: h });
  const ms = mission({ goal: { laneId: 'T:out:f1', s: 190 } });
  const run = s0 => drive(net, ms, 12, t => t < 2 ? { laneId: 'h:f2', s: s0 + 25 * t, v: 25 } : { laneId: 'h:f2', s: s0 + 50 + 8 * (t - 2), v: 8 });
  assert(!run(2995 - 550).codes.includes('minSpeed'), '광장 앞');
  assert(run(1000).codes.includes('minSpeed'), '광장에서 먼 곳은 그대로');
});

test('missedExit: 고속도로에서 재탐색 → 실패, 시내 미션은 route 감점만', () => {
  const { net } = mainNet();
  const run = ms => drive(net, ms, 2, t => ({ laneId: 'h:f2', s: 100 + 25 * t, v: 25, rerouted: Math.abs(t - 1) < 1e-6 }));
  assert.strictEqual(run(mission()).result.failReason, S.FAIL.missedExit);
  const city = run({ goal: { laneId: 'h:f2', s: 2990 } });
  assert(!city.result.failReason && city.codes.includes('route'));
});

test('gap 문구: 고속도로는 속도 수치 문구, 시내는 기존', () => {
  const { net } = mainNet();
  const v = 25, run = ms => {
    const ds = S.create(ms, net), ev = [];
    for (let t = 0; t <= 4; t += DT) {
      const s = 100 + v * t, p = R.pointAt(net.lanes['h:f2'], s + 15);
      ev.push(...S.update(ds, frame(net, t, 'h:f2', s, v, { others: [{ id: 1, x: p.x, y: p.y, th: p.a, v, l: 4.5, w: 1.8 }] })));
    }
    return ev.find(e => e.code === 'gap');
  };
  assert.strictEqual(run(mission()).text, S.TEXT.gapHw);
  assert.strictEqual(run({ goal: { laneId: 'h:f2', s: 2990 } }).text, S.TEXT.gap);
});

for (const [name, fn] of tests) {
  try { fn(); console.log('ok  ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n  ' + e.message); }
}
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('all ' + tests.length + ' passed');
