// farm-fish/test/firstmeet.test.js — 첫 만남 보정, 점심 붕어·퇴근 참치 pool share, forage boost
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const html = require('../build.js').build();
vm.runInThisContext(html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1], { filename: 'logic.js' });
const L = globalThis.Logic;
const E = (phase, weather, season, festival) => ({ phase, weather: weather || 'clear', season: season || 'autumn', festival: festival || null });
const WED = (h, m) => new Date(2026, 9, 28, h, m || 0);   // local time, like inWindow
const FRI = (h, m) => new Date(2026, 9, 30, h, m || 0);

function st(spot, opts) {
  opts = opts || {};
  const s = L.newState(0, () => 0.5);
  s.spotOk = { river: true, sea: true }; s.spot = spot;
  s.up = s.up || {}; s.up.bait = opts.bait || 0;
  if (opts.caught) L.FISH.forEach((f) => { s.dex.fish[f.id] = { n: 1, best: 1 }; });
  if (opts.ms) s.ms = Object.assign({}, s.ms, opts.ms);
  return s;
}
// exact share of fish id in the pool at d/env for s
function share(id, d, s, env) {
  const pool = L.availableFish(d, s, env), w = L.fishWeights(pool, s);
  const tot = w.reduce((a, b) => a + b, 0), k = pool.findIndex((f) => f.id === id);
  return k < 0 ? 0 : w[k] / tot;
}
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' ' + a.toFixed(3) + ' vs ' + b);

test('점심 붕어 is ~40% of the 연못 pool at 12:30, caught or not, whatever the season', () => {
  for (const season of ['spring', 'summer', 'autumn', 'winter']) {
    near(share('lunch', WED(12, 30), st('pond'), E('day', 'clear', season)), 0.4, 0.001, season);
    near(share('lunch', WED(12, 30), st('pond', { caught: true }), E('day', 'clear', season)), 0.4, 0.001, season + ' caught');
  }
  // the roll agrees with the weights
  const s = st('pond', { caught: true });
  let i = 0, n = 0; const r = () => ((i = (i * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let k = 0; k < 20000; k++) if (L.rollFish(WED(12, 30), r, s, E('day')).id === 'lunch') n++;
  near(n / 20000, 0.4, 0.02, 'rolled');
});

test('퇴근 참치 is ~20% on Friday 17:30; bait raises both but never past 55%', () => {
  near(share('tuna', FRI(17, 30), st('pond'), E('evening')), 0.2, 0.001);
  near(share('tuna', FRI(17, 30), st('pond', { caught: true }), E('evening')), 0.2, 0.001);
  const lunch3 = share('lunch', WED(12, 30), st('pond', { bait: 3 }), E('day'));
  const tuna3 = share('tuna', FRI(17, 30), st('pond', { bait: 3 }), E('evening'));
  assert.ok(lunch3 > 0.4 && lunch3 <= 0.55 + 1e-9, 'lunch bait3 ' + lunch3);
  assert.ok(tuna3 > 0.2 && tuna3 <= 0.55 + 1e-9, 'tuna bait3 ' + tuna3);
  assert.ok(share('lunch', WED(12, 30), st('pond', { bait: 1 }), E('day')) > 0.4);
});

test('outside their windows the lunch/friday fish are gone and nothing is boosted', () => {
  assert.equal(share('lunch', WED(13, 0), st('pond'), E('day')), 0);
  assert.equal(share('tuna', FRI(16, 59), st('pond'), E('evening')), 0);
  assert.equal(share('tuna', WED(17, 30), st('pond'), E('evening')), 0);
  // 강 at day, clear: no conditional fish open -> uncaught and caught pools weigh the same
  const a = L.fishWeights(L.availableFish(WED(10), st('river'), E('day', 'clear', 'autumn')), st('river'));
  const b = L.fishWeights(L.availableFish(WED(10), st('river', { caught: true }), E('day', 'clear', 'autumn')), st('river', { caught: true }));
  assert.deepEqual(a, b);
});

test('첫 만남 보정: an uncaught conditional fish weighs x2.5 (legend x3) while its condition holds, normal once caught', () => {
  const env = E('day', 'fog');
  const pool = L.availableFish(WED(10), st('river'), env);
  const un = L.fishWeights(pool, st('river')), got = L.fishWeights(pool, st('river', { caught: true }));
  const at = (id) => pool.findIndex((f) => f.id === id);
  assert.equal(un[at('bass')], got[at('bass')] * 2.5);
  assert.equal(un[at('sturgeon')], got[at('sturgeon')] * 3);
  assert.equal(un[at('dace')], got[at('dace')]);           // always-there fish: no boost
  assert.ok(share('sturgeon', WED(10), st('river'), env) > 2 * share('sturgeon', WED(10), st('river', { caught: true }), env));
  // caught just this one: back to normal for it, still boosted for the rest
  const s = st('river'); s.dex.fish.sturgeon = { n: 1, best: 90 };
  const one = L.fishWeights(pool, s);
  assert.equal(one[at('sturgeon')], got[at('sturgeon')]);
  assert.equal(one[at('bass')], got[at('bass')] * 2.5);
  // night sea fish
  const sea = L.availableFish(WED(10), st('sea'), E('night'));
  const su = L.fishWeights(sea, st('sea')), sg = L.fishWeights(sea, st('sea', { caught: true }));
  const k = sea.findIndex((f) => f.id === 'squid');
  assert.equal(su[k], sg[k] * 2.5);
});

test('unlock-only 금빛 잉어 and the egg 시계 물고기 are untouched', () => {
  const env = E('day');
  const un = st('pond', { ms: { koi: 1 } }), got = st('pond', { ms: { koi: 1 }, caught: true });
  const pool = L.availableFish(WED(10), un, env), k = pool.findIndex((f) => f.id === 'koi');
  assert.ok(k >= 0);
  assert.equal(L.fishWeights(pool, un)[k], L.fishWeights(pool, got)[k]);
  assert.equal(L.firstMeet(un, L.fishById('koi')), false);
  assert.equal(L.firstMeet(un, L.fishById('clockfish')), false);
  assert.ok(!L.availableFish(WED(12, 0), un, env).some((f) => f.id === 'clockfish'));
  assert.equal(L.firstMeet(un, L.fishById('lunch')), true);
  assert.equal(L.firstMeet(un, L.fishById('minnow')), false);
});

test('rollFish without s still works (no boost, share kept)', () => {
  near(share('lunch', WED(12, 30), undefined, E('day')), 0.4, 0.001);
  assert.ok(L.rollFish(WED(12, 30), () => 0.5, undefined, E('day')).id);
});

test('forage 첫 만남 보정: uncaught conditional finds x2.5 while in season/time, plain ones and outside conditions unchanged', () => {
  const s = L.newState(0, () => 0.5); s.rep = 3; s.coins = 600;
  assert.equal(L.unlockForest(s, 1000).ok, true);
  const env = { season: 'summer', phase: 'night', weather: 'clear', wet: false };
  const moss = L.forageById('glowmoss'), pebble = L.forageById('pebble'), amber = L.forageById('amberstone');
  assert.equal(L.forageWeight(moss, env, s), L.forageWeight(moss, env) * 2.5);
  assert.equal(L.forageWeight(pebble, env, s), L.forageWeight(pebble, env));
  assert.equal(L.forageWeight(amber, env, s), L.forageWeight(amber, env));
  assert.equal(L.forageWeight(moss, Object.assign({}, env, { phase: 'day' }), s), 0);
  s.forest.dex.glowmoss = 1;
  assert.equal(L.forageWeight(moss, env, s), L.forageWeight(moss, env));
  // the pool and the spot roll use it
  const pool = L.foragePool(env, s), plain = L.foragePool(env);
  assert.equal(pool.length, plain.length);
  s.forest.spots.forEach((p) => { p.id = null; p.at = 0; });
  assert.equal(L.tickForest(s, 1000, env, () => 0.5), L.FOREST_N);
});
