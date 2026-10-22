const assert = require('assert');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let fail = 0;
// node bungbung/test/traffic-highway.test.js
const R = require('../roads.js');
require('../roads-highway.js');
const T = require('../traffic.js');
const K = require('../collision.js');
const DT = 1 / 30;

const box = c => ({ x: c.x, y: c.y, l: c.l, w: c.w, a: c.th });
// 충돌 없음 + 같은 차로(차선 변경 중이면 양쪽 차로) 차 쌍 최소 간격
function checkFrame(sim, where) {
  const cs = T.cars(sim);
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const a = cs[i], b = cs[j];
    if (Math.abs(a.x - b.x) > 6 || Math.abs(a.y - b.y) > 6) continue;
    assert(!K.overlap(box(a), box(b)), `${where}: 차 ${a.id}·${b.id} 충돌`);
  }
  let minGap = Infinity;
  const byLane = {};
  for (const c of sim.list) {
    (byLane[c.laneId] = byLane[c.laneId] || []).push([c.s, c]);
    if (c.from) (byLane[c.from] = byLane[c.from] || []).push([R.mapS(sim.net, c.laneId, c.from, c.s), c]);
  }
  for (const k in byLane) {
    const l = byLane[k].sort((p, q) => p[0] - q[0]);
    for (let i = 1; i < l.length; i++) minGap = Math.min(minGap, l[i][0] - l[i - 1][0] - (l[i][1].l + l[i - 1][1].l) / 2);
  }
  return minGap;
}
function rampNet() {
  const net = R.newNet();
  const m = R.highway(net, { id: 'm', x: 0, y: 0, a: 0, length: 2000, lanes: 2 });
  const r = R.onRamp(net, { id: 'on', main: m, at: 600 });
  return { net, m, r };
}
function playerOn(net, laneId, s, v) {
  const p = R.pointAt(net.lanes[laneId], s);
  return { x: p.x, y: p.y, th: p.a, v, laneId, s, offset: 0 };
}

test('DENS.highway 값', () => {
  assert.deepStrictEqual(T.DENS.highway, { head: [3, 5], gap: [60, 110], f: [0.85, 1.1], T: 1.5 });
});

test('편도 2차로 + onRamp 300초: 합류 또는 끝 전 정지, 간격 > 1m, 가속차로 끝 통과 없음', () => {
  const { net, r } = rampNet(), A = r.accelId, La = R.laneLength(net.lanes[A]);
  const sim = T.create(net, { seed: 3, density: 'highway' });
  let minGap = Infinity;
  const onAcc = new Set(), merged = new Set(), last = new Map();
  for (let i = 0; i < 300 * 30; i++) {
    T.step(sim, DT, i * DT, null);
    if (i % 3 === 0) minGap = Math.min(minGap, checkFrame(sim, 't=' + (i * DT).toFixed(1)));
    const now = new Map();
    for (const c of sim.list) {
      now.set(c.id, c.laneId);
      if (c.laneId === A) { onAcc.add(c.id); assert(c.s + c.l / 2 <= La + 1e-6, `차 ${c.id} 가속차로 끝 통과`); }
      if (c.from === A) merged.add(c.id);
    }
    for (const [id, lane] of last) assert(now.has(id) || lane !== A, `차 ${id}가 가속차로 끝에서 사라짐`);
    last.clear(); for (const [k, v] of now) last.set(k, v);
  }
  assert(minGap > 1, '최소 간격 ' + minGap.toFixed(2));
  for (const id of onAcc) assert(merged.has(id) || last.get(id) === A, `가속차로 차 ${id}: 합류도 대기도 아님`);
  assert(merged.size >= 5, '합류 ' + merged.size);
  // 남아 있는 가속차로 차는 끝 전에서 기다린다
  for (const c of sim.list) if (c.laneId === A && c.s > La - 40) assert(c.s + c.l / 2 < La - 15, '대기 위치');
});

// 가속차로 180초(시드 1–5, 빗길·마른 길): 끝 통과·충돌 없음, 최장 정지 한도, 본선 AI 감속 -4.5m/s² 아래 없음.
// 대기 합류 차 뒤 본선 AI는 capB로 WAIT_B(4m/s²)까지만 줄이고, 안전 간격이 깨져 상한을 일찍 버리는 프레임도 0
// (측정: 빗길 최장 정지 28.2초, 마른 길 52.9초 — 마른 길은 본선이 빨라 정지 거리 기준 간격이 더 길다)
for (const [weather, maxWait] of [['rain', 30], ['dry', 70]]) test(`${weather === 'rain' ? '빗길' : '마른 길'} 가속차로 180초(시드 1–5): ${maxWait}초 넘게 서 있는 AI·본선 급제동·끝 통과·충돌 없음`, () => {
  for (let seed = 1; seed <= 5; seed++) {
    const { net, r } = rampNet(), A = r.accelId, La = R.laneLength(net.lanes[A]);
    const sim = T.create(net, { seed, density: 'highway', weather: weather === 'rain' ? 'rain' : undefined }), stop = {}, merged = new Set();
    let maxStop = 0, hard = 0, minA = 0, capDrop = 0;
    for (let i = 0; i < 180 * 30; i++) {
      const t = i * DT, had = new Set(sim.list.filter(c => c.capB && c.capB.until > t).map(c => c.id));
      T.step(sim, DT, t, null);
      if (i % 3 === 0) checkFrame(sim, `${weather} seed ${seed} t=${t.toFixed(1)}`);
      for (const c of sim.list) {
        if (c.from === A) merged.add(c.id);
        if (c.laneId !== A) {
          if (c.a < -4.5) hard++;
          minA = Math.min(minA, c.a);
          if (had.has(c.id) && !c.capB) capDrop++;
          continue;
        }
        assert(c.s + c.l / 2 <= La + 1e-6, `${weather} seed ${seed}: 차 ${c.id} 가속차로 끝 통과`);
        if (c.v < 0.5) { stop[c.id] = stop[c.id] == null ? t : stop[c.id]; maxStop = Math.max(maxStop, t - stop[c.id]); } else stop[c.id] = null;
      }
    }
    assert(maxStop < maxWait, `${weather} seed ${seed}: 가속차로에서 ${maxStop.toFixed(1)}초 대기`);
    assert(merged.size >= 5, `${weather} seed ${seed}: 합류 ${merged.size}`);
    assert.strictEqual(hard, 0, `${weather} seed ${seed}: 본선 AI 급제동 ${hard}프레임(최소 ${minA.toFixed(2)})`);
    assert.strictEqual(capDrop, 0, `${weather} seed ${seed}: 감속 상한을 안전 때문에 버림 ${capDrop}번`);
  }
});
test('양보: 같은 시드 같은 결과, 플레이어가 가속차로 옆이면 양보 1회 이상(여러 시드)', () => {
  const run = seed => {
    const { net, r } = rampNet();
    const sim = T.create(net, { seed, density: 'highway' });
    const p = playerOn(net, r.accelId, 150, 0);
    for (let i = 0; i < 60 * 30; i++) T.step(sim, DT, i * DT, p);
    return { yields: sim.hw.yields, cars: JSON.stringify(T.cars(sim)) };
  };
  const a = run(5), b = run(5);
  assert.strictEqual(a.cars, b.cars);
  assert.strictEqual(a.yields, b.yields);
  let total = a.yields;
  for (const seed of [6, 7, 8]) total += run(seed).yields;
  assert(total >= 1, '양보 ' + total);
});

test('추월 복귀: 1차로 차량이 20초 안에 2차로로', () => {
  const net = R.newNet();
  R.highway(net, { id: 'm', x: 0, y: 0, a: 0, length: 2000, lanes: 2 });
  const sim = T.create(net, { seed: 2, density: 'none', spawn: [{ laneId: 'm:f1', s: 100, v: 25 }] });
  const c = sim.list[0];
  let back = -1;
  for (let i = 0; i < 20 * 30 && back < 0; i++) {
    T.step(sim, DT, i * DT, null);
    if (c.laneId === 'm:f2' && !c.from) back = i * DT;
  }
  assert(back >= 0 && back <= 20, '복귀 ' + back);
});

test('brake 스크립트: 1차로에서 서는 차는 hold 동안 추월 복귀(차선 변경)하지 않는다', () => {
  const net = R.newNet();
  R.highway(net, { id: 'm', x: 0, y: 0, a: 0, length: 2000, lanes: 2 });
  const sim = T.create(net, { seed: 2, density: 'none', scripts: [{ id: 'br', action: 'brake', spawn: { laneId: 'm:f1', s: 100, v: 25 }, v: 0, hold: 6 }] });
  const c = sim.scripts[0].car;
  T.trigger(sim, 'br');
  const until = c.slowUntil;
  let back = -1;
  for (let i = 0; i < 40 * 30 && back < 0; i++) {
    const t = i * DT;
    T.step(sim, DT, t, null);
    if (t < until) assert(c.laneId === 'm:f1' && !c.from && !c.want, '서는 동안 차선 변경 t=' + t.toFixed(2));
    else if (c.laneId === 'm:f2') back = t;
  }
  assert(back >= until, 'hold 뒤 복귀 ' + back);
});
test('brake 스크립트(빗길 hw-rain처럼 50km/h까지): 감속·hold 동안 추월 복귀·양보 감속으로 덮어쓰기 없음', () => {
  const { net, r } = rampNet(), A = r.accelId;
  const mS = R.mapS(net, A, 'm:f2', 150);
  for (const seed of [2, 4, 5]) for (const lane of ['m:f1', 'm:f2']) { // 시드 4·5: 2차로 차가 가속차로 옆 플레이어에게 양보하려는 경우
    const sim = T.create(net, { seed, density: 'none', weather: 'rain', scripts: [{ id: 'br', action: 'brake', spawn: { laneId: lane, s: mS - 60, v: 25 }, v: 50 / 3.6, hold: 4 }] });
    const c = sim.scripts[0].car, p = playerOn(net, A, 150, 0);
    T.trigger(sim, 'br');
    assert(c.braked > 0 && c.slowV === 50 / 3.6, lane + ': braked 표시');
    for (let i = 0; i * DT < c.braked; i++) {
      T.step(sim, DT, i * DT, p);
      assert(c.laneId === lane && !c.from && !c.want, `${lane}: 감속 중 차선 변경 t=${(i * DT).toFixed(2)}`);
      assert.strictEqual(c.slowV, 50 / 3.6, `${lane}: 양보 감속으로 덮어씀 t=${(i * DT).toFixed(2)}`);
    }
  }
});
test('톨게이트: 일반 차로 정지선 2초 정지, 하이패스 30km/h 이하', () => {
  let normals = 0, hipass = 0;
  for (const seed of [1, 2]) {
    const net = R.newNet();
    const m = R.highway(net, { id: 'm', x: 0, y: 0, a: 0, length: 900, lanes: 2 });
    const tp = R.tollPlaza(net, { id: 'tg', from: m });
    const booth = {};
    for (const b of tp.booths) booth[b.laneId] = b;
    const sim = T.create(net, { seed, density: 'highway' });
    const st = new Map(); // id → { lane, still, vmax, passed }
    let minGap = Infinity;
    for (let i = 0; i < 150 * 30; i++) {
      T.step(sim, DT, i * DT, null);
      if (i % 3 === 0) minGap = Math.min(minGap, checkFrame(sim, 'toll t=' + (i * DT).toFixed(1)));
      for (const c of sim.list) {
        const b = booth[c.laneId];
        if (!b) continue;
        let r = st.get(c.id);
        if (!r || r.lane !== c.laneId) st.set(c.id, r = { lane: c.laneId, toll: b.toll, still: 0, best: 0, vmax: 0, passed: false });
        const front = c.s + c.l / 2;
        if (b.toll === 'normal') {
          if (!r.passed && front > b.stopS + 0.5) { r.passed = true; assert(r.best >= 1.5, `차 ${c.id} 정지 ${r.best.toFixed(2)}초`); normals++; }
          if (b.stopS - front >= 0 && b.stopS - front <= 2 && c.v < 0.3) { r.still += DT; r.best = Math.max(r.best, r.still); } else r.still = 0;
        } else if (Math.abs(c.s - b.stopS) <= 20) {
          r.vmax = Math.max(r.vmax, c.v);
          assert(c.v * 3.6 <= 30, `하이패스 차 ${c.id} ${(c.v * 3.6).toFixed(1)}km/h`);
          if (!r.passed && c.s > b.stopS + 19) { r.passed = true; hipass++; }
        }
      }
    }
    assert(minGap > 1, '톨게이트 최소 간격 ' + minGap.toFixed(2));
  }
  assert(normals >= 3, '일반 통과 ' + normals);
  assert(hipass >= 3, '하이패스 통과 ' + hipass);
});

test('jam: 트리거 후 15초 안에 지정 차량 전부 정지, 사고 차 hazard', () => {
  const net = R.newNet();
  R.highway(net, { id: 'm', x: 0, y: 0, a: 0, length: 3000, lanes: 2 });
  const spawn = [500, 530, 560, 590].map(s => ({ laneId: 'm:f2', s, v: 25 }));
  const sim = T.create(net, { seed: 4, density: 'none', spawn,
    scripts: [{ id: 'j', action: 'jam', at: { laneId: 'm:f2', s: 520 }, cars: 2 }] });
  for (let i = 0; i < 60; i++) T.step(sim, DT, i * DT, null);
  T.trigger(sim, 'j');
  const t0 = 60 * DT;
  const jam = sim.list.filter(c => c.jam);
  assert.strictEqual(jam.length, 2);
  let stopAt = -1;
  for (let i = 60; i < 60 + 40 * 30; i++) {
    T.step(sim, DT, i * DT, null);
    if (stopAt < 0 && jam.every(c => c.v < 0.05)) stopAt = i * DT - t0;
    if (stopAt >= 0) for (const c of jam) assert(c.v < 0.05, '정지 유지');
  }
  assert(stopAt >= 0 && stopAt <= 15, '정지까지 ' + stopAt);
  const cs = T.cars(sim), front = jam.reduce((a, b) => (b.s > a.s ? b : a));
  assert.strictEqual(cs.find(c => c.id === front.id).hazard, true);
  assert.strictEqual(cs.filter(c => c.hazard).length, 1);
  assert(cs.every(c => typeof c.hazard === 'boolean'));
});

test('slow: 스폰 차량 목표 속도 고정', () => {
  const net = R.newNet();
  R.highway(net, { id: 'm', x: 0, y: 0, a: 0, length: 3000, lanes: 2, limit: 110 });
  const sim = T.create(net, { seed: 1, density: 'none', scripts: [{ id: 's', action: 'slow', spawn: { laneId: 'm:f2', s: 50, v: 20 }, v: 80 / 3.6 }] });
  const c = sim.list[0];
  for (let i = 0; i < 40 * 30; i++) T.step(sim, DT, i * DT, null);
  assert(Math.abs(c.v - 80 / 3.6) < 0.3, '속도 ' + c.v * 3.6);
});

for (const [name, fn] of tests) {
  try { fn(); console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + e.message); }
}
console.log(fail ? `${fail}/${tests.length} failed` : `all ${tests.length} passed`);
process.exit(fail ? 1 : 0);
