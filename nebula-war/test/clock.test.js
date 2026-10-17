// node nebula-war/test/clock.test.js
const assert = require('assert');
const C = require('../clock.js');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let fail = 0;

const make = (o = {}) => {
  let t = 0, n = 0;
  const clk = C.create(Object.assign({ step: 50, tick: () => n++, now: () => t }, o));
  return { clk, at: v => { t = v; return clk.pump(v); }, count: () => n };
};

test('누산: 쌓인 시간만큼만 틱, 나머지는 보간으로', () => {
  const { clk, at, count } = make();
  assert.strictEqual(at(30), 0); assert.ok(Math.abs(clk.alpha() - 0.6) < 1e-9);
  assert.strictEqual(at(120), 2); assert.strictEqual(count(), 2); assert.ok(Math.abs(clk.alpha() - 0.4) < 1e-9);
});
test('따라잡기 상한: 오래 멈춰도 cap 만큼만', () => {
  const { at, count } = make();
  at(10000); assert.strictEqual(count(), 5); // 250ms / 50ms
});
test('canTick false: 시간을 쌓지 않고 보간 유지, 다시 켜면 이어서', () => {
  let on = true;
  const { clk, at, count } = make({ canTick: () => on });
  at(70); assert.strictEqual(count(), 1);
  on = false; at(5000); assert.strictEqual(count(), 1); assert.ok(Math.abs(clk.alpha() - 0.4) < 1e-9);
  on = true; at(5040); assert.strictEqual(count(), 2);
});
test('canTick 은 매 틱 전에 다시 본다(종료 직후 멈춤)', () => {
  let n = 0;
  const clk = C.create({ step: 50, tick: () => n++, canTick: () => n < 2, now: () => 0 });
  clk.pump(250); assert.strictEqual(n, 2);
});
test('setStep(배속)·reset', () => {
  const { clk, at, count } = make();
  clk.setStep(25); at(100); assert.strictEqual(count(), 4);
  clk.reset(1000); assert.strictEqual(clk.alpha(), 0); at(1010); assert.strictEqual(count(), 4);
});
test('background: node 에선 setTimeout 대체로 pump, bgCap 적용, 끄면 멈춘다', async () => {
  let n = 0, t = 0;
  const clk = C.create({ step: 50, tick: () => n++, now: () => t });
  clk.background(true); assert.strictEqual(clk.bg, 'timeout');
  t = 800; await new Promise(r => setTimeout(r, 80));
  assert.strictEqual(n, 16); // bgCap 1000 ≥ 800 → 시간 손실 없음
  clk.background(false); assert.strictEqual(clk.bg, null);
  t = 2000; await new Promise(r => setTimeout(r, 80));
  assert.strictEqual(n, 16);
});
test('시각이 거꾸로 가도 last 가 후퇴하지 않는다(과속 방지)', () => {
  const { at, count } = make();
  at(100); assert.strictEqual(count(), 2);
  at(60); assert.strictEqual(count(), 2);
  at(120); assert.strictEqual(count(), 2); // 100 기준 +20 만 쌓임
  at(150); assert.strictEqual(count(), 3);
});
test('bgCap 은 타이머 pump 에만, 수동 pump 는 cap', async () => {
  let n = 0, t = 0;
  const clk = C.create({ step: 50, tick: () => n++, now: () => t });
  clk.background(true);
  clk.pump(10000); assert.strictEqual(n, 5); // 포그라운드 cap 250
  clk.background(false);
});
test('워커 비동기 실패 → setTimeout 으로 갈아탄다', async () => {
  const saved = { W: global.Worker };
  let inst, terminated = false;
  global.Worker = class { constructor() { inst = this; } postMessage() {} terminate() { terminated = true; } };
  try {
    let n = 0, t = 0;
    const clk = C.create({ step: 50, tick: () => n++, now: () => t });
    clk.background(true); assert.strictEqual(clk.bg, 'worker');
    inst.onerror(); assert.ok(terminated); assert.strictEqual(clk.bg, 'timeout');
    t = 200; await new Promise(r => setTimeout(r, 80)); assert.strictEqual(n, 4);
    clk.background(false);
  } finally { if (saved.W) global.Worker = saved.W; else delete global.Worker; }
});
test('tick 이 던지면 백그라운드 구동을 멈추고 한 번만 던진다', async () => {
  let n = 0, t = 0;
  const errs = [], onErr = e => errs.push(e);
  process.on('uncaughtException', onErr);
  const clk = C.create({ step: 50, tick: () => { n++; throw new Error('boom'); }, now: () => t });
  clk.background(true); t = 100;
  await new Promise(r => setTimeout(r, 120));
  process.off('uncaughtException', onErr);
  assert.strictEqual(errs.length, 1); assert.strictEqual(n, 1); assert.strictEqual(clk.bg, null);
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); console.log('ok  ', name); } catch (e) { fail++; console.log('FAIL', name, '\n', e); }
  }
  console.log(fail ? fail + ' failed' : 'all ' + tests.length + ' passed');
  process.exit(fail ? 1 : 0);
})();
