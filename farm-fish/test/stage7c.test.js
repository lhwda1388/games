// test/stage7c.test.js — stage 7 lane ③: 섬 (낡은 배 수리, 섬 낚시터, 표류물, 야자수, 등대 이야기)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = require('../build.js').build();
vm.runInThisContext(html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1], { filename: 'logic.js' });
const L = globalThis.Logic;
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const DAY = 86400e3;
const E = (phase, weather, season) => ({ phase: phase || 'day', weather: weather || 'clear', season: season || 'autumn' });
const give = (s, id, n) => { for (let k = 0; k < (n || 1); k++) L.bagAdd(s, id, L.itemInfo(id).price); };

// a player with the 바다 open and enough coins and 고물 for the boat
function seaState() {
  const s = L.newState(0, seq(0.5));
  s.rep = 40; s.coins = 99999; L.buySpot(s, 'sea');
  s.coins = L.BOAT_FIX.coins + 500;
  const j = L.junkOf(s); j.n.can = 4; j.n.boot = 3; j.n.key = 2;
  return s;
}
function isleState() { const s = seaState(); assert.equal(L.fixBoat(s).ok, true); return s; }

test('낡은 배: needs the 바다, coins and 고물; paid once, keys kept when other junk is enough', () => {
  const s = L.newState(0, seq(0.5));
  assert.equal(L.isleOk(s), false);
  assert.deepEqual(L.fixBoat(s), { ok: false, why: 'sea' });
  const t = seaState();
  assert.equal(L.boatStatus(t), 'ok');
  t.coins = L.BOAT_FIX.coins - 1;
  assert.deepEqual(L.fixBoat(t), { ok: false, why: 'coins' });
  t.coins = L.BOAT_FIX.coins + 500;
  L.junkOf(t).n.can = 0; L.junkOf(t).n.boot = 0; L.junkOf(t).n.key = L.BOAT_FIX.junk - 1;
  assert.equal(L.scrapCount(t), L.BOAT_FIX.junk - 1);
  assert.deepEqual(L.fixBoat(t), { ok: false, why: 'junk' });
  assert.equal(L.isleOk(t), false);
  const u = seaState(), before = L.scrapCount(u);
  assert.ok(L.BOAT_FIX.junk >= 4 && L.BOAT_FIX.coins > 0);
  assert.deepEqual(L.fixBoat(u), { ok: true });
  assert.equal(u.coins, 500);
  assert.equal(L.scrapCount(u), before - L.BOAT_FIX.junk);
  assert.equal(L.junkCount(u, 'key'), 2, 'keys are used last');
  assert.equal(L.isleOk(u), true);
  assert.equal(L.boatStatus(u), 'owned');
  assert.deepEqual(L.fixBoat(u), { ok: false, why: 'owned' });
  // the old 연못 나룻배 milestone is a different thing and stays untouched
  assert.equal(u.ms.boat, undefined);
});

test('섬 낚시터: locked before the boat, then a spot of its own (not one you buy at the signpost)', () => {
  assert.ok(L.SPOTS.island && !L.SPOT_IDS.includes('island'));
  const s = seaState();
  assert.equal(L.spotUnlocked(s, 'island'), false);
  assert.equal(L.setSpot(s, 'island'), false);
  assert.equal(L.buySpot(s, 'island'), false);
  L.fixBoat(s);
  assert.equal(L.spotUnlocked(s, 'island'), true);
  assert.equal(L.setSpot(s, 'island'), true);
  assert.equal(L.curSpot(s), 'island');
});

test('island fish: 10+ with hints, season/weather/time conditions, one legend; only bite at the 섬', () => {
  const isl = L.ISLE_FISH.map((id) => L.fishById(id));
  assert.ok(isl.length >= 10);
  assert.ok(isl.every((f) => f && f.spot === 'island' && f.hint && f.price > 0));
  assert.equal(isl.filter((f) => f.rarity === '전설').length, 1);
  assert.ok(isl.filter((f) => f.rarity === '전설').every((f) => f.power >= 2));
  assert.ok(isl.some((f) => f.season) && isl.some((f) => f.weather) && isl.some((f) => f.phase));
  assert.equal(new Set(L.FISH.map((f) => f.id)).size, L.FISH.length, 'unique fish ids');
  const d = new Date(2026, 9, 27, 10, 0);
  const s = isleState();
  const ids = (spot, env) => { s.spot = spot; return L.availableFish(d, s, env).map((f) => f.id); };
  for (const sp of ['pond', 'river', 'sea']) assert.ok(!ids(sp, E()).some((id) => L.ISLE_FISH.includes(id)), sp);
  for (const ph of ['morning', 'day', 'evening', 'night']) for (const w of ['clear', 'rain', 'fog', 'snow']) for (const se of L.SEASONS) {
    const got = ids('island', E(ph, w, se));
    assert.ok(got.length >= 2, ph + w + se);
    assert.ok(got.every((id) => L.fishById(id).spot === 'island'));
  }
  // every island fish can be met under some condition, and conditional ones only then
  for (const f of isl) {
    const ok = [];
    for (const ph of ['morning', 'day', 'evening', 'night']) for (const w of ['clear', 'rain', 'fog', 'snow']) for (const se of L.SEASONS)
      if (ids('island', E(ph, w, se)).includes(f.id)) ok.push([ph, w, se]);
    assert.ok(ok.length > 0, f.id);
    if (f.phase) assert.ok(ok.every((c) => f.phase.includes(c[0])), f.id);
    if (f.weather) assert.ok(ok.every((c) => c[1] === f.weather), f.id);
    if (f.season) assert.ok(ok.every((c) => c[2] === f.season), f.id);
  }
  // a locked 섬 falls back to the pond; the normal cast → bite → land flow works at the 섬
  const t = seaState(); t.spot = 'island';
  assert.ok(L.availableFish(d, t, E()).every((f) => !f.spot));
  s.spot = 'island';
  L.cast(s, 0, seq(0), 100, 150);
  assert.equal(L.updateFishing(s, s.fish.biteAt, seq(0.3, 0.5), 1, E('night', 'clear', 'autumn')), 'bite');
  assert.equal(L.fishById(s.fish.roll.id).spot, 'island');
  const roll = L.hook(s, s.fish.biteAt);
  const out = L.landFish(s, roll);
  assert.ok(out.first && s.dex.fish[roll.id].n === 1);
  assert.equal(s.bag[s.bag.length - 1].id, roll.id);
  // 첫 만남 보정 applies to conditional island fish like any other
  const cond = isl.find((f) => f.phase && f.rarity !== '전설');
  assert.equal(L.firstMeet(s, cond), true);
});

test('표류물: 10+ kinds with hints; spots fill when looked at, pick → basket, wash up again by real time', () => {
  assert.ok(L.DRIFT.length >= 10);
  const ids = new Set();
  for (const d of L.DRIFT) {
    assert.ok(!ids.has(d.id)); ids.add(d.id);
    assert.ok(d.name && d.hint && d.rarity, d.id);
    assert.ok(!L.CROPS[d.id] && !L.fishById(d.id) && !L.forageById(d.id) && !L.recipeById(d.id), 'clash ' + d.id);
    if (!d.special) assert.equal(L.itemInfo(d.id).kind, 'isle');
  }
  assert.ok(L.DRIFT.some((d) => d.special === 'letter') && L.DRIFT.some((d) => d.special === 'seed'));
  assert.ok(['glassfloat', 'shell'].every((id) => ids.has(id)));
  assert.equal(L.itemInfo('coconut').kind, 'isle');
  const s = isleState();
  assert.deepEqual(L.driftSpots(s, 0), new Array(L.DRIFT_N).fill(null));   // nothing until looked at
  assert.equal(L.tickIsle(s, 1000, E(), seq(0.01)), L.DRIFT_N);
  const spots = L.driftSpots(s, 1000);
  assert.ok(spots.every((id) => !!L.driftById(id)));
  assert.equal(L.tickIsle(s, 2000, E(), seq(0.01)), 0, 'full spots stay as they are');
  // pick a plain (bag) find
  s.isle.drift[0].id = 'shell';
  const r = L.pickDrift(s, 0, 5000, seq(0));
  assert.deepEqual(r, { id: 'shell', sold: 0, first: true });
  assert.equal(L.bagCount(s, 'shell'), 1);
  assert.equal(s.isle.dex.shell, 1);
  assert.equal(L.pickDrift(s, 0, 5000, seq(0)), null, 'no double pick');
  assert.equal(L.driftSpots(s, 5000)[0], null);
  // washes up again only after DRIFT_MIN.. DRIFT_MIN + DRIFT_SPAN of real time (offline too)
  assert.equal(s.isle.drift[0].at, 5000 + L.DRIFT_MIN);
  assert.equal(L.tickIsle(s, 5000 + L.DRIFT_MIN - 1, E(), seq(0.01)), 0);
  assert.equal(L.tickIsle(s, 5000 + L.DRIFT_MIN, E(), seq(0.01)), 1);
  assert.ok(L.driftById(L.driftSpots(s, 5000 + L.DRIFT_MIN)[0]));
  // full basket: sold on the spot like everything else
  const f = isleState();
  while (f.bag.length < L.bagCap(f)) L.bagAdd(f, 'radish', 30);
  L.tickIsle(f, 0, E(), seq(0.5));
  f.isle.drift[1].id = 'glassfloat';
  const c0 = f.coins, r2 = L.pickDrift(f, 1, 10, seq(0.5));
  assert.equal(r2.sold, L.driftById('glassfloat').price);
  assert.equal(f.coins, c0 + r2.sold);
  // locked island: nothing
  const g = seaState();
  assert.equal(L.tickIsle(g, 0, E(), seq(0.5)), 0);
  assert.equal(L.pickDrift(g, 0, 0, seq(0.5)), null);
});

test('표류물 conditions + 첫 만남 보정; 병 편지 joins the bottle-letter series; 이국 씨앗 is a 황금 씨앗', () => {
  const cond = L.DRIFT.filter((d) => L.driftConditional(d));
  assert.ok(cond.length >= 3);
  const s = isleState();
  for (const d of cond) {
    const ok = [];
    for (const ph of ['morning', 'day', 'evening', 'night']) for (const w of ['clear', 'rain', 'fog', 'snow']) for (const se of L.SEASONS)
      if (L.driftWeight(d, E(ph, w, se)) > 0) ok.push(1);
    assert.ok(ok.length > 0 && ok.length < 64, d.id);
  }
  const d = cond[0];
  const env = [];
  for (const ph of ['morning', 'day', 'evening', 'night']) for (const w of ['clear', 'rain', 'fog', 'snow']) for (const se of L.SEASONS) env.push(E(ph, w, se));
  const on = env.find((e) => L.driftWeight(d, e) > 0);
  assert.ok(L.driftWeight(d, on, s) > L.driftWeight(d, on));
  s.isle.dex[d.id] = 1;
  assert.equal(L.driftWeight(d, on, s), L.driftWeight(d, on));
  // every env has something to wash up
  for (const e of env) assert.ok(L.DRIFT.filter((x) => L.driftWeight(x, e) > 0).length >= 4);
  // 병 편지: a new letter of the series (not a basket item); after all 12, a few coins
  const t = isleState();
  L.tickIsle(t, 0, E(), seq(0.5));
  t.isle.drift[2].id = 'dletter';
  const bag0 = t.bag.length, r = L.pickDrift(t, 2, 0, seq(0));
  assert.equal(r.id, 'dletter'); assert.equal(r.letter, 1);
  assert.deepEqual(t.junk.letters, [1]);
  assert.equal(t.bag.length, bag0);
  t.junk.letters = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  t.isle.drift[2] = { at: 0, id: 'dletter' };
  const c0 = t.coins, r2 = L.pickDrift(t, 2, 0, seq(0));
  assert.equal(r2.coins, L.LETTER_DUP_COINS); assert.equal(t.coins, c0 + L.LETTER_DUP_COINS);
  // 이국 씨앗 → one 황금 수박 씨앗
  t.isle.drift[3].id = 'exoticseed';
  const g0 = t.seeds.gold, r3 = L.pickDrift(t, 3, 0, seq(0));
  assert.equal(r3.seed, 1); assert.equal(t.seeds.gold, g0 + 1); assert.equal(t.dex.goldSeed, true);
});

test('야자수: a few coconuts per real day, into the basket', () => {
  const s = isleState();
  assert.equal(L.palmLeft(s, 0, 0), L.PALM_N);
  for (let k = 0; k < L.PALM_N; k++) assert.equal(L.pickCoconut(s, 1000, 0).sold, 0);
  assert.equal(L.bagCount(s, 'coconut'), L.PALM_N);
  assert.equal(L.palmLeft(s, 2000, 0), 0);
  assert.equal(L.pickCoconut(s, 2000, 0), null);
  assert.equal(L.palmLeft(s, DAY + 1000, 0), L.PALM_N, 'the next real day');
  assert.ok(L.pickCoconut(s, DAY + 1000, 0));
  assert.equal(s.isle.dex.coconut, L.PALM_N + 1);
  assert.equal(L.pickCoconut(seaState(), 0, 0), null);
});

test('섬 items reach the order board once found; never while the 섬 is closed', () => {
  const s = isleState();
  const pool = () => L.orderPool(s, false).map((e) => e.id);
  assert.ok(!pool().includes('shell'));
  s.isle.dex.shell = 1; s.isle.dex.coconut = 1;
  assert.ok(pool().includes('shell') && pool().includes('coconut'));
  assert.ok(L.obtainable(s, 'shell'));
  const t = seaState();
  assert.equal(L.obtainable(t, 'shell'), false);
  // island fish already caught come up like other spots' fish
  s.dex.fish[L.ISLE_FISH[0]] = { n: 1, best: 10 };
  const seen = new Set();
  for (let k = 0; k < 800; k++) seen.add(L.genOrder(s, seq((k * 0.618) % 1, (k * 0.414) % 1, 0.3, 0.7)).id);
  assert.ok(seen.has(L.ISLE_FISH[0]) || seen.has('shell'));
});

test('every kind of item that can be ordered has a resident to post it (섬 orders can be delivered)', () => {
  ['shell', 'coconut', 'clam', 'coal', 'iron'].forEach((id) => {
    assert.ok(L.residentById(L.residentFor({ id: id, n: 2, reward: 60 })), id);
  });
  const s = isleState();
  give(s, 'shell', 3);
  s.orders[0] = { o: { id: 'shell', n: 3, reward: 90, rep: 1 }, at: 0 };
  const r = L.deliver(s, 0, 1000, seq(0.5));
  assert.ok(r && r.coins === 90);
});

test('등대 이야기: 3–5 steps, materials taken from the basket, light + reward once at the end', () => {
  assert.ok(L.LIGHTHOUSE.length >= 3 && L.LIGHTHOUSE.length <= 5);
  for (const st of L.LIGHTHOUSE) {
    assert.ok(st.todo && st.say);
    if (st.need) assert.ok(L.itemInfo(st.need[0]) && st.need[1] >= 1, st.todo);
  }
  assert.ok(L.LIGHTHOUSE.filter((st) => st.need).length >= 3);
  const locked = seaState();
  assert.equal(L.lighthouseStep(locked), null);
  assert.deepEqual(L.advanceLighthouse(locked), { ok: false, why: 'boat' });
  const s = isleState();
  assert.equal(L.lighthouseStep(s).k, 0);
  let coins = s.coins;
  for (let k = 0; k < L.LIGHTHOUSE.length; k++) {
    const st = L.LIGHTHOUSE[k];
    assert.equal(L.lighthouseStep(s).k, k);
    if (st.need) {
      give(s, st.need[0], st.need[1] - 1);
      assert.deepEqual(L.advanceLighthouse(s), { ok: false, why: 'item' });
      assert.equal(L.bagCount(s, st.need[0]), st.need[1] - 1, 'nothing taken on a failed step');
      give(s, st.need[0], 1);
    }
    coins = s.coins;
    const r = L.advanceLighthouse(s);
    assert.equal(r.ok, true);
    assert.equal(r.say, st.say);
    if (st.need) assert.equal(L.bagCount(s, st.need[0]), 0);
    if (k < L.LIGHTHOUSE.length - 1) { assert.ok(!r.done); assert.equal(s.isle.lit, false); }
    else {
      assert.equal(r.done, true);
      assert.equal(s.isle.lit, true);
      assert.ok(r.reward.coins > 0);
      assert.equal(s.coins, coins + r.reward.coins);
      assert.equal(r.reward.deco, L.LIGHT_DECO);
      assert.equal(s.yard.deco[L.LIGHT_DECO], true);
    }
  }
  assert.equal(L.lighthouseStep(s), null);
  assert.deepEqual(L.advanceLighthouse(s), { ok: false, why: 'done' });
  assert.ok(L.keeperLine(s, 0, 0).length > 0);
  // night light: only after it is lit, and only at game night
  const night = 50 * 60e3, noon = 20 * 60e3;
  assert.equal(L.lighthouseOn(s, night, 0), true);
  assert.equal(L.lighthouseOn(s, noon, 0), false);
  assert.equal(L.lighthouseOn(isleState(), night, 0), false);
});

test('save: s.isle round-trips (boat, drift, palm, lighthouse, dex, island spot); bad data is cleaned', () => {
  const s = isleState();
  L.tickIsle(s, 1000, E(), seq(0.2));
  L.pickDrift(s, 0, 2000, seq(0.3));
  L.pickCoconut(s, 3000, 0);
  give(s, 'driftwood', 3);
  L.advanceLighthouse(s); L.advanceLighthouse(s);
  L.setSpot(s, 'island');
  const b = L.decode(L.encode(s));
  assert.deepEqual(b.isle, s.isle);
  assert.equal(b.spot, 'island');
  assert.equal(L.spotUnlocked(b, 'island'), true);
  assert.deepEqual(L.decode(L.encode(b)).isle, b.isle);
  // tampered
  const j = JSON.parse(L.encode(s));
  j.isle.lh = 99; j.isle.drift[1] = { at: 'x', id: 'gold' }; j.isle.dex.nope = 5; j.isle.palm.n = -3; j.isle.lit = 'yes';
  const c = L.decode(JSON.stringify(j));
  assert.equal(c.isle.lh, 0);
  assert.equal(c.isle.drift[1].id, null);
  assert.equal(c.isle.dex.nope, undefined);
  assert.equal(c.isle.palm.n, 0);
  assert.equal(c.isle.lit, false);
  // an isle without a fixed boat, or a save that claims the 섬 spot without one, does not open anything
  const k = JSON.parse(L.encode(L.newState(0, seq(0.5))));
  k.spot = 'island'; k.spotOk = { island: true };
  const d = L.decode(JSON.stringify(k));
  assert.equal(d.spot, undefined); assert.equal(L.spotUnlocked(d, 'island'), false); assert.equal(d.isle, undefined);
});

test('older saves (every fixture) load without s.isle and with the 섬 closed', () => {
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    if (/"(flat|cam|cave|sky|isle|museum|guide)":/.test(fs.readFileSync(path.join(dir, f), 'utf8'))) continue;   // saved by stage 7+
    const s = L.decode(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.ok(s, f);
    assert.equal(s.isle, undefined, f);
    assert.equal(L.isleOk(s), false, f);
    assert.equal(L.spotUnlocked(s, 'island'), false, f);
    assert.equal(L.decode(L.encode(s)).isle, undefined, f);
  }
});

test('every order-pool item has a resident who posts it, and 섬 orders deliver without throwing', () => {
  const s = L.newState(0, () => 0);
  ['shell', 'driftwood', 'coconut', 'fossilbit', 'nosuchkind'].forEach(id => {
    assert.doesNotThrow(() => L.residentFor({ id: id, n: 1, reward: 10, rep: 1 }), id);
  });
  assert.ok(['fisher', 'chef'].indexOf(L.residentFor({ id: 'shell', n: 2, reward: 40, rep: 1 })) >= 0);
  L.bagAdd(s, 'shell', 20);
  s.orders[0] = { o: { id: 'shell', n: 1, reward: 31, rep: 1 }, at: 0 };
  let r; assert.doesNotThrow(() => { r = L.deliver(s, 0, 0, () => 0.5); });
  assert.ok(r && r.coins === 31);
});
