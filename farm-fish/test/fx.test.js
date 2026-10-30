// test/fx.test.js — stage 8 ④ 이펙트: pure timing helpers (easing, count-up, caps, stale drop, streaks)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const html = require('../build.js').build();
vm.runInThisContext(html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1], { filename: 'logic.js' });
const L = globalThis.Logic;

test('fxEase: clamped, 0 → 0, 1 → 1, rising', () => {
  assert.equal(L.fxEase(-1), 0); assert.equal(L.fxEase(0), 0);
  assert.equal(L.fxEase(1), 1); assert.equal(L.fxEase(5), 1);
  let prev = -1;
  for (let k = 0; k <= 20; k++) { const v = L.fxEase(k / 20); assert.ok(v >= prev); prev = v; }
});

test('fxCount: rolls from → to, lands exactly, no motion when dur is 0', () => {
  assert.equal(L.fxCount(100, 200, 0, 400), 100);
  assert.equal(L.fxCount(100, 200, 400, 400), 200);
  assert.equal(L.fxCount(100, 200, 9999, 400), 200);
  assert.equal(L.fxCount(100, 200, 50, 0), 200);
  const mid = L.fxCount(100, 200, 200, 400);
  assert.ok(mid > 150 && mid < 200 && Number.isInteger(mid), 'ease-out mid ' + mid);
});

test('fxRoom: never past the cap', () => {
  assert.equal(L.fxRoom(0, 10, L.FX_PARTICLES), 10);
  assert.equal(L.fxRoom(L.FX_PARTICLES - 3, 10, L.FX_PARTICLES), 3);
  assert.equal(L.fxRoom(L.FX_PARTICLES + 5, 10, L.FX_PARTICLES), 0);
});

test('fxPush + fxPrune: capped list, stale and clock-jump effects drop', () => {
  const list = [];
  for (let k = 0; k < L.FX_LIVE + 5; k++) L.fxPush(list, { t0: k, dur: 100, id: k }, L.FX_LIVE);
  assert.equal(list.length, L.FX_LIVE);
  assert.equal(list[0].id, 5, 'oldest dropped first');
  L.fxPrune(list, 60);
  assert.ok(list.every((e) => e.t0 <= 60 && 60 - e.t0 < 100));
  L.fxPrune(list, 10000);                   // tab woke up much later: everything is stale
  assert.equal(list.length, 0);
  const back = [{ t0: 5000, dur: 300 }, { t0: 100, dur: 300, delay: true }];
  L.fxPrune(back, 200);                     // clock far behind an effect: dropped; a short delay ahead is kept
  assert.deepEqual(back.map((e) => e.t0), [100]);
  assert.equal(L.fxStale({ t0: 300, dur: 100 }, 0), false, 'delayed start under 1 s is not stale');
});

test('fxCombo: quick harvests count up, a pause starts over', () => {
  let c = L.fxCombo(null, 1000, L.FX_COMBO_MS);
  assert.equal(c.n, 1);
  c = L.fxCombo(c, 1500, L.FX_COMBO_MS); assert.equal(c.n, 2);
  c = L.fxCombo(c, 2500, L.FX_COMBO_MS); assert.equal(c.n, 3);
  c = L.fxCombo(c, 2500 + L.FX_COMBO_MS + 1, L.FX_COMBO_MS); assert.equal(c.n, 1);
  assert.equal(L.fxCombo({ t: 5000, n: 4 }, 100, L.FX_COMBO_MS).n, 1, 'clock went back');
});

test('fxTier: 희귀 → 1, 전설 → 2, the rest 0', () => {
  assert.equal(L.fxTier(L.fishById('minnow')), 0);
  assert.equal(L.fxTier(L.fishById('carp')), 1);
  assert.equal(L.fxTier(L.fishById('koi')), 2);
  assert.equal(L.fxTier(null), 0);
  assert.equal(L.FX_HITSTOP_MS >= 60 && L.FX_HITSTOP_MS <= 80, true);
});
