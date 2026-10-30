// test/stage9a.test.js — stage 9 lane ①: 배 업그레이드 (나룻배 → 돛배 → 통통배), 먼바다·난바다 끌낚시, 먼 섬
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = require('../build.js').build();
vm.runInThisContext(html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1], { filename: 'logic.js' });
const L = globalThis.Logic;
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const E = (phase, weather, season) => ({ phase: phase || 'day', weather: weather || 'clear', season: season || 'autumn' });
const give = (s, id, n) => { for (let k = 0; k < (n || 1); k++) L.bagAdd(s, id, L.itemInfo(id).price); };

// a player with the 섬 boat fixed and a big basket
function isleState() {
  const s = L.newState(0, seq(0.5));
  s.rep = 40; s.coins = 99999; L.buySpot(s, 'sea');
  s.coins = L.BOAT_FIX.coins; L.junkOf(s).n.can = L.BOAT_FIX.junk;
  assert.equal(L.fixBoat(s).ok, true);
  s.noSell = true;   // nothing auto-sells while materials pile up
  return s;
}
// pay for the next tier and upgrade
function upgrade(s) {
  const t = L.shipNext(s);
  s.coins += t.coins;
  t.need.forEach(([id, n]) => give(s, id, n));
  return L.upgradeShip(s);
}

test('tiers: 나룻배 → 돛배 → 통통배, coins + real 동굴 ore / 섬 drift ids', () => {
  assert.deepEqual(L.SHIP_TIERS.map((t) => t.name), ['나룻배', '돛배', '통통배']);
  L.SHIP_TIERS.slice(1).forEach((t) => {
    assert.ok(t.coins > L.BOAT_FIX.coins, t.id + ' costs more than the repair');
    assert.ok(t.need.length >= 2, t.id);
    t.need.forEach(([id, n]) => {
      assert.ok(n > 0, id);
      assert.ok(L.oreById(id) || (L.driftById(id) && !L.driftById(id).special), id + ' is a real ore or drift id');
    });
    assert.ok(t.need.some(([id]) => L.oreById(id)) && t.need.some(([id]) => L.driftById(id)), t.id + ' mixes 동굴 and 섬');
  });
  assert.ok(L.SHIP_TIERS[2].coins > L.SHIP_TIERS[1].coins);
});

test('upgradeShip: needs the fixed boat, coins and every material; takes them once, tier by tier', () => {
  const s0 = L.newState(0, seq(0.5));
  assert.equal(L.shipTier(s0), -1);
  assert.equal(L.shipStatus(s0), 'boat');
  assert.deepEqual(L.upgradeShip(s0), { ok: false, why: 'boat' });
  const s = isleState();
  assert.equal(L.shipTier(s), 0);
  assert.equal(L.shipNext(s).name, '돛배');
  s.coins = 0;
  assert.equal(L.shipStatus(s), 'coins');
  s.coins = L.shipNext(s).coins;
  assert.equal(L.shipStatus(s), 'item');
  const need = L.shipNext(s).need;
  need.forEach(([id, n]) => give(s, id, n));
  give(s, need[0][0], 1);   // one spare stays
  assert.equal(L.shipStatus(s), 'ok');
  assert.ok(L.shipMissing(s).every((m) => m.have >= m.n));
  const r = L.upgradeShip(s);
  assert.equal(r.ok, true); assert.equal(r.tier, 1); assert.equal(r.spot, 'offshore');
  assert.equal(s.coins, 0);
  need.forEach(([id], k) => assert.equal(L.bagCount(s, id), k === 0 ? 1 : 0, id));
  assert.equal(L.shipTier(s), 1);
  assert.equal(L.spotUnlocked(s, 'offshore'), true);
  assert.equal(L.spotUnlocked(s, 'ocean'), false);
  assert.equal(L.farOk(s), false);
  // missing one material: nothing is taken
  const t2 = L.shipNext(s);
  s.coins = t2.coins;
  t2.need.slice(1).forEach(([id, n]) => give(s, id, n));
  const bag = s.bag.length;
  assert.deepEqual(L.upgradeShip(s), { ok: false, why: 'item' });
  assert.equal(s.bag.length, bag); assert.equal(s.coins, t2.coins);
  const r2 = upgrade(s);
  assert.equal(r2.ok, true); assert.equal(r2.spot, 'ocean');
  assert.equal(L.shipTier(s), 2);
  assert.equal(L.spotUnlocked(s, 'ocean'), true);
  assert.equal(L.farOk(s), true);
  assert.equal(L.shipStatus(s), 'max');
  assert.equal(L.shipNext(s), null);
  assert.deepEqual(L.upgradeShip(s), { ok: false, why: 'max' });
  assert.equal(s.ms.boat, undefined, 'the 연못 나룻배 milestone is a different thing');
});

test('먼바다·난바다: own spots, not on the signpost; big fish only, 8+ new fish with 1–2 legend bosses', () => {
  for (const sp of ['offshore', 'ocean']) {
    assert.ok(L.SPOTS[sp] && !L.SPOT_IDS.includes(sp), sp);
    assert.equal(L.buySpot(isleState(), sp), false, sp + ' is never bought');
  }
  const fish = L.SHIP_FISH.map((id) => L.fishById(id));
  assert.ok(fish.length >= 8);
  assert.equal(new Set(L.FISH.map((f) => f.id)).size, L.FISH.length, 'unique fish ids');
  fish.forEach((f) => {
    assert.ok(['offshore', 'ocean'].includes(f.spot), f.id);
    assert.ok(f.min >= 40 && f.power >= 1.4, f.id + ' is a big fish');
    assert.ok(f.hint && f.price > 0, f.id);
  });
  assert.ok(L.OFFSHORE_FISH.length >= 4 && L.OCEAN_FISH.length >= 4);
  const legends = fish.filter((f) => f.rarity === '전설');
  assert.ok(legends.length >= 1 && legends.length <= 2);
  legends.forEach((f) => { assert.ok(L.isBoss(f.id), f.id); assert.ok(L.temperOf(f.id).length >= 3, f.id + ' 3단계'); });
  assert.ok(fish.some((f) => f.season) && fish.some((f) => f.weather) && fish.some((f) => f.phase), 'season/weather/time conditions');
  // every non-common fish fights in its own way (not just 순한)
  fish.filter((f) => f.rarity !== '흔함').forEach((f) => assert.ok(!L.temperOf(f.id).every((ph) => ph.length === 1 && ph[0] === 'burst'), f.id));
});

test('끌낚시 pool: only that spot\'s fish, conditions hold, first-meet boost applies', () => {
  const s = isleState();
  upgrade(s); upgrade(s);
  const d = new Date(2026, 9, 29, 10, 0);
  for (const sp of ['offshore', 'ocean']) {
    assert.equal(L.setSpot(s, sp), true);
    const list = sp === 'offshore' ? L.OFFSHORE_FISH : L.OCEAN_FISH;
    for (const ph of ['morning', 'day', 'evening', 'night']) for (const wx of ['clear', 'rain', 'fog', 'snow']) for (const se of ['spring', 'summer', 'autumn', 'winter']) {
      const pool = L.availableFish(d, s, E(ph, wx, se));
      assert.ok(pool.length >= 1, sp + ' never empty');
      pool.forEach((f) => { assert.ok(list.includes(f.id), f.id); assert.ok(L.fishEnvOk(f, E(ph, wx, se))); });
    }
    const cond = L.fishById(list.find((id) => L.isConditional(L.fishById(id))));
    assert.equal(L.firstMeet(s, cond), true);
    s.dex.fish[cond.id] = { n: 1, best: cond.min };
    assert.equal(L.firstMeet(s, cond), false);
  }
  // other spots never get them
  assert.equal(L.setSpot(s, 'sea'), true);
  for (const ph of ['morning', 'day', 'evening', 'night']) assert.ok(!L.availableFish(d, s, E(ph)).some((f) => L.SHIP_FISH.includes(f.id)));
  // rollFish lands a real fish of the spot
  L.setSpot(s, 'ocean');
  const r = L.rollFish(d, seq(0.3, 0.7), s, E('night', 'clear', 'winter'));
  assert.ok(L.OCEAN_FISH.includes(r.id));
});

test('a legend boss can be reeled in, and landing it fills 도감 and the basket', () => {
  const s = isleState();
  upgrade(s);
  L.setSpot(s, 'offshore');
  const leg = L.OFFSHORE_FISH.concat(L.OCEAN_FISH).map((id) => L.fishById(id)).find((f) => f.rarity === '전설');
  const reel = L.newReel({ id: leg.id, size: leg.min }, 3);
  assert.equal(reel.phases.length, L.temperOf(leg.id).length);
  assert.ok(reel.tmax > L.REEL_MAX, 'bosses get extra time');
  s.fish = { phase: 'reel' };
  const out = L.landFish(s, { id: leg.id, size: leg.min + 1 });
  assert.equal(out.first, true);
  assert.equal(s.dex.fish[leg.id].n, 1);
  assert.equal(L.bagCount(s, leg.id), 1);
});

test('먼 섬: opens with the 통통배; drift washes up by real time with conditions and first-meet', () => {
  assert.ok(L.FAR_DRIFT.length >= 3 && L.FAR_DRIFT.length <= 5);
  L.FAR_DRIFT.forEach((d) => {
    assert.ok(!L.driftById(d.id), d.id + ' is new (not the 섬 beach)');
    assert.ok(!(L.CROPS[d.id] || L.fishById(d.id) || L.flatById(d.id) || L.forageById(d.id) || L.oreById(d.id) || L.caveItem(d.id) || L.treeById(d.id) || L.honeyById(d.id) || L.recipeById(d.id)), 'clash ' + d.id);
    assert.equal(L.itemInfo(d.id).kind, 'isle');
    assert.equal(L.itemInfo(d.id).price, d.price);
  });
  const s = isleState();
  assert.equal(L.farOk(s), false);
  assert.equal(L.tickFar(s, 0, E(), seq(0.1)), 0);
  assert.equal(L.pickFar(s, 0, 0, seq(0.5)), null);
  upgrade(s); upgrade(s);
  assert.equal(L.farOk(s), true);
  assert.equal(L.farSpots(s, 0).length, L.FAR_N);
  assert.equal(L.tickFar(s, 1000, E(), seq(0.1)), L.FAR_N);
  const id = L.farSpots(s, 1000)[0];
  assert.ok(L.farById(id));
  const r = L.pickFar(s, 0, 1000, seq(0.5));
  assert.equal(r.id, id); assert.equal(r.first, true);
  assert.equal(L.bagCount(s, id), 1);
  assert.equal(s.ship.dex[id], 1);
  assert.equal(L.farSpots(s, 1000)[0], null, 'washed clean');
  const at = L.farNextAt(s);
  assert.ok(at >= 1000 + L.FAR_MIN && at <= 1000 + L.FAR_MIN + L.FAR_SPAN);
  assert.equal(L.pickFar(s, 0, 2000, seq(0.5)), null);
  // conditions: a conditional find never washes up out of its condition, gets the boost in it while unseen
  const cond = L.FAR_DRIFT.find((d) => d.phase || d.weather || d.season);
  assert.ok(cond, 'at least one conditional find');
  const inEnv = E(cond.phase ? cond.phase[0] : 'day', cond.weather || 'clear', cond.season ? cond.season[0] : 'autumn');
  const offEnv = E(cond.phase ? (cond.phase[0] === 'night' ? 'day' : 'night') : 'day', cond.weather ? (cond.weather === 'fog' ? 'rain' : 'fog') : 'clear', cond.season ? (cond.season[0] === 'winter' ? 'summer' : 'winter') : 'autumn');
  assert.equal(L.farWeight(cond, offEnv, s), 0);
  const w0 = L.farWeight(cond, inEnv, s);
  s.ship.dex[cond.id] = 1;
  assert.ok(w0 > L.farWeight(cond, inEnv, s), 'first-meet boost');
});

test('orders: new fish and 먼 섬 finds have a resident who posts them; 먼 섬 finds join the pool once picked', () => {
  L.SHIP_FISH.concat(L.FAR_DRIFT.map((d) => d.id)).forEach((id) => {
    const it = L.itemInfo(id);
    const c = L.RESIDENTS.filter((r) => !r.special && r.kinds.indexOf(it.kind) >= 0);
    assert.ok(c.length > 0, id + ' (' + it.kind + ') never falls back');
    assert.doesNotThrow(() => L.residentFor({ id: id, n: 1, reward: 10, rep: 1 }));
  });
  const s = isleState();
  upgrade(s); upgrade(s);
  const common = L.FAR_DRIFT.find((d) => !(d.phase || d.weather || d.season) && d.rarity === '흔함');
  const pool = () => L.orderPool(s, false).map((e) => e.id);
  assert.ok(!pool().includes(common.id));
  s.ship.dex[common.id] = 1;
  assert.ok(pool().includes(common.id));
  // a common 먼바다 fish is asked for (like any unconditional fish at an open spot)
  const big = L.OFFSHORE_FISH.map((id) => L.fishById(id)).find((f) => f.rarity === '흔함' && !L.isConditional(f));
  assert.ok(pool().includes(big.id));
  assert.equal(L.obtainable(s, common.id), true);
  assert.equal(L.obtainable(isleState(), common.id), false);
});

test('museum fish room has every fish incl. the new ones, and still completes', () => {
  const R = L.MUSEUM_ROOMS;
  assert.deepEqual(R.fish.ids, L.FISH.map((f) => f.id));
  L.SHIP_FISH.forEach((id) => assert.ok(R.fish.ids.includes(id), id));
  const s = isleState();
  s.museum = { got: { fish: {} }, done: {} };
  R.fish.ids.forEach((id) => { if (!L.SHIP_FISH.includes(id)) s.museum.got.fish[id] = true; });
  L.SHIP_FISH.slice(0, -1).forEach((id) => { s.museum.got.fish[id] = true; });
  const last = L.SHIP_FISH[L.SHIP_FISH.length - 1];
  s.bag = []; give(s, last, 1);
  const before = s.coins;
  const r = L.donate(s, 'fish', last);
  assert.equal(r.ok, true); assert.equal(r.roomDone, true);
  assert.ok(s.coins >= before + R.fish.coins);
  assert.deepEqual(L.museumCount(s, 'fish'), { n: R.fish.ids.length, m: R.fish.ids.length });
});

test('놀거리 수첩: 배 업그레이드, 먼바다, 난바다, 먼 섬 lines with real numbers, open by tier', () => {
  const by = (id) => L.GUIDE.find((g) => g.id === id);
  for (const id of ['ship', 'offshore', 'ocean', 'farisle']) assert.ok(by(id), id);
  const won = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  assert.ok(by('offshore').lock.includes(won(L.SHIP_TIERS[1].coins)));
  assert.ok(by('ocean').lock.includes(won(L.SHIP_TIERS[2].coins)));
  assert.ok(by('farisle').lock.includes('통통배'));
  const s = isleState();
  assert.ok(L.guideOpen(s, 'ship'));
  assert.ok(!L.guideOpen(s, 'offshore') && !L.guideOpen(s, 'ocean') && !L.guideOpen(s, 'farisle'));
  upgrade(s);
  assert.ok(L.guideOpen(s, 'offshore') && !L.guideOpen(s, 'ocean'));
  upgrade(s);
  assert.ok(L.guideOpen(s, 'ocean') && L.guideOpen(s, 'farisle'));
  assert.ok(!L.guideOpen(L.newState(0, seq(0.5)), 'ship'));
  assert.equal(L.guideTip(s, 'farisle').id, 'farisle');
});

test('save: s.ship round-trips (tier, drift, dex, spot); bad values are dropped', () => {
  const s = isleState();
  upgrade(s); upgrade(s);
  L.tickFar(s, 1000, E(), seq(0.1));
  L.pickFar(s, 1, 1000, seq(0.5));
  L.setSpot(s, 'ocean');
  const back = L.decode(L.encode(s));
  assert.deepEqual(back.ship, s.ship);
  assert.equal(L.curSpot(back), 'ocean');
  assert.equal(L.spotUnlocked(back, 'offshore'), true);
  assert.deepEqual(JSON.parse(L.encode(L.decode(L.encode(back)))), JSON.parse(L.encode(back)));
  // tier 1 keeps 난바다 shut
  const o = JSON.parse(L.encode(s)); o.ship.t = 1; o.spot = 'ocean';
  const b1 = L.decode(JSON.stringify(o));
  assert.equal(L.shipTier(b1), 1); assert.equal(L.spotUnlocked(b1, 'ocean'), false); assert.notEqual(L.curSpot(b1), 'ocean');
  // garbage
  for (const bad of [5, 0, 'x', null, -1]) {
    const q = JSON.parse(L.encode(s)); q.ship.t = bad;
    const b = L.decode(JSON.stringify(q));
    assert.ok(b, String(bad));
    assert.equal(b.ship, undefined, String(bad));
    assert.equal(L.spotUnlocked(b, 'offshore'), false);
  }
  const q = JSON.parse(L.encode(s)); q.ship.drift = [{ at: 'x', id: 'nope' }]; q.ship.dex = { nope: 3, pumice: -1 };
  const b = L.decode(JSON.stringify(q));
  assert.equal(b.ship.t, 2);
  assert.equal(b.ship.drift.length, L.FAR_N);
  assert.deepEqual(b.ship.drift[0], { at: 0, id: null });
  assert.deepEqual(b.ship.dex, {});
  // no fixed boat: s.ship is ignored
  const nb = JSON.parse(L.encode(s)); delete nb.isle;
  const c = L.decode(JSON.stringify(nb));
  assert.equal(c.ship, undefined); assert.equal(L.spotUnlocked(c, 'ocean'), false);
});

test('older saves (every fixture) load unchanged without s.ship', () => {
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    if (/"ship":/.test(raw)) continue;   // saved by stage 9 ①+
    const s = L.decode(raw);
    assert.ok(s, f);
    assert.equal(s.ship, undefined, f);
    assert.equal(L.spotUnlocked(s, 'offshore'), false, f);
    assert.equal(L.spotUnlocked(s, 'ocean'), false, f);
    assert.ok(L.shipTier(s) <= 0, f);
    const again = L.decode(L.encode(s));
    assert.deepEqual(JSON.parse(L.encode(again)), JSON.parse(L.encode(s)), f);
  }
});
