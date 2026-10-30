// test/stage5a.test.js — stage 5A: 숲 채집, 도전 gauge (채집·수확), 반려동물
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const html = require('../build.js').build();
vm.runInThisContext(html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1], { filename: 'logic.js' });
const L = globalThis.Logic;
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const DAY = 86400e3;
const env = (season, phase, weather, wet) => ({ season, phase: phase || 'day', weather: weather || 'clear', wet: !!wet });
const plot = () => ({ crop: null, progress: 0, t: 0, yieldMul: 1, weed: false, crow: null, fert: false, last: null });

function forestState() {
  const s = L.newState(0, seq(0.5));
  s.rep = 3; s.coins = 600;
  assert.equal(L.unlockForest(s, 1000).ok, true);
  return s;
}

test('30+ forage types, unique ids that clash with nothing else, every category and season covered', () => {
  assert.ok(L.FORAGE.length >= 30, 'count ' + L.FORAGE.length);
  const ids = new Set();
  for (const f of L.FORAGE) {
    assert.ok(!ids.has(f.id), 'dup ' + f.id); ids.add(f.id);
    assert.ok(!L.CROPS[f.id] && !L.FISH.some((x) => x.id === f.id) && !L.PRODUCTS[f.id], 'clash ' + f.id);
    assert.equal(L.RECIPES.filter((r) => r.id === f.id).length, 0, 'clash recipe ' + f.id);
    assert.ok(f.name && f.hint && f.price > 0 && L.FORAGE_CATS[f.cat] && L.CH_ZONE[f.rarity], f.id);
    assert.equal(L.itemInfo(f.id).kind, 'forage');
  }
  for (const c of Object.keys(L.FORAGE_CATS)) assert.ok(L.FORAGE.some((f) => f.cat === c), c);
  for (const se of L.SEASONS) for (const ph of ['morning', 'day', 'evening', 'night'])
    assert.ok(L.foragePool(env(se, ph)).length >= 3, se + ' ' + ph);
});

test('season, time of day and weather decide what grows', () => {
  const ids = (e) => L.foragePool(e).map((x) => x.id);
  assert.ok(ids(env('spring')).includes('gosari'));
  assert.ok(!ids(env('autumn')).includes('gosari'));
  assert.ok(ids(env('summer')).includes('raspberry'));
  assert.ok(ids(env('autumn')).includes('chestnut') && ids(env('autumn')).includes('acorn') && ids(env('autumn')).includes('songi'));
  assert.ok(ids(env('winter')).includes('pinecone') && ids(env('winter')).includes('mistletoe'));
  assert.ok(!ids(env('summer', 'day')).includes('glowmoss'));
  assert.ok(ids(env('summer', 'night')).includes('glowmoss'));
  assert.ok(!ids(env('summer', 'day', 'clear', false)).includes('woodear'));
  assert.ok(ids(env('summer', 'day', 'rain', true)).includes('woodear'));
  // after rain, mushrooms weigh more
  const w = (e, id) => L.forageWeight(L.forageById(id), e);
  assert.equal(w(env('autumn', 'day', 'rain', true), 'songi'), 3 * w(env('autumn'), 'songi'));
  assert.equal(w(env('winter'), 'pinecone'), 2 * w(env('summer'), 'pinecone'));
});

test('forest unlock: ★3 + 500 coins', () => {
  const s = L.newState(0, seq(0.5));
  s.coins = 9999;
  assert.equal(L.forestStatus(s), 'rep');
  assert.equal(L.unlockForest(s, 0).ok, false);
  s.rep = 3; s.coins = 499;
  assert.equal(L.unlockForest(s, 0).why, 'coins');
  s.coins = 500;
  assert.equal(L.unlockForest(s, 0).ok, true);
  assert.equal(s.coins, 0);
  assert.equal(L.forestStatus(s), 'owned');
  assert.equal(L.unlockForest(s, 0).ok, false);
});

test('spots regrow by time (offline too), pick once, no double reward', () => {
  const s = forestState(), e = env('autumn');
  assert.equal(L.tickForest(s, 1000, e, seq(0.1)), L.FOREST_N);
  assert.equal(L.tickForest(s, 1000, e, seq(0.1)), 0);
  const id = s.forest.spots[0].id;
  const r = L.pickForage(s, 0, 2000, seq(0), false);
  assert.equal(r.id, id); assert.equal(r.n, 1);
  assert.equal(s.bag.length, 1); assert.equal(s.bag[0].id, id);
  assert.equal(s.forest.dex[id], 1);
  assert.equal(L.pickForage(s, 0, 2000, seq(0), false), null, 'second pick of the same spot');
  assert.equal(s.bag.length, 1);
  const at = s.forest.spots[0].at;
  assert.equal(at, 2000 + L.REGROW_MIN);
  assert.equal(L.tickForest(s, at - 1, e, seq(0.1)), 0);
  // away for a day: comes back grown, and survives a save round-trip
  const back = L.decode(L.encode(s));
  assert.equal(L.tickForest(back, at + DAY, env('winter'), seq(0.1)), 1);
  assert.ok(back.forest.spots[0].id);
  assert.ok(L.foragePool(env('winter')).some((x) => x.id === back.forest.spots[0].id));
});

test('도전 win: two of a common find, rare ones a 50% bonus chance; a miss is the plain pick', () => {
  const s = forestState();
  s.forest.spots[0].id = 'acorn'; s.forest.spots[1].id = 'songi'; s.forest.spots[2].id = 'songi'; s.forest.spots[3].id = 'acorn';
  assert.equal(L.pickForage(s, 0, 0, seq(0), true).n, 2);
  assert.equal(L.pickForage(s, 1, 0, seq(0.2), true).n, 2);
  assert.equal(L.pickForage(s, 2, 0, seq(0.9), true).n, 1);
  assert.equal(L.pickForage(s, 3, 0, seq(0), false).n, 1);
  assert.equal(s.forest.dex.acorn, 3); assert.equal(s.forest.dex.songi, 3);
  // full basket: overflow sells, nothing lost
  const t = forestState();
  while (t.bag.length < L.bagCap(t)) L.bagAdd(t, 'radish', 30);
  t.forest.spots[0].id = 'chestnut';
  const c0 = t.coins, r = L.pickForage(t, 0, 0, seq(0), true);
  assert.equal(r.sold, 90); assert.equal(t.coins, c0 + 90);
});

test('도전 gauge judging: quick tap, zone, timeout; rarer = narrower', () => {
  const g = L.chNew(1000, 0.2, 1000, seq(0));
  assert.equal(g.t0, 1000 + L.CH_GRACE);
  assert.ok(g.lo >= 0.3 && Math.abs(g.hi - g.lo - 0.2) < 1e-9);
  assert.equal(L.chJudge(g, 1100), 'tap');
  assert.equal(L.chPos(g, g.t0), 0);
  assert.equal(L.chPos(g, g.t0 + 250), 0.5);
  assert.equal(L.chPos(g, g.t0 + 500), 1);
  assert.equal(L.chPos(g, g.t0 + 750), 0.5);
  // g.lo = 0.3, g.hi = 0.5: rising through 0.4 at +200 ms wins, 0.2 at +100 ms misses
  assert.equal(L.chJudge(g, g.t0 + 200), 'win');
  assert.equal(L.chJudge(g, g.t0 + 100), 'miss');
  assert.equal(L.chJudge(g, g.t0 + 1200), 'win');            // second swing
  assert.equal(L.chJudge(g, g.end + 1), 'miss');
  assert.ok(L.chOver(g, g.end + 1));
  const w = (id) => { const q = L.forageGame(id, 0, seq(0.5)); return q.hi - q.lo; };
  assert.ok(w('acorn') > w('shiitake') && w('shiitake') > w('songi') && w('songi') > w('ginseng'));
  assert.ok(L.harvestWidth('radish') > L.harvestWidth('melon'));
  assert.ok(L.harvestWidth('melon') >= L.harvestWidth('pumpkin'));
  assert.ok(L.harvestWidth('pumpkin') >= 0.1);
  const h = L.harvestGame('radish', 0, seq(0.99));
  assert.ok(h.hi <= 0.97 + 1e-9);
});

test('특상품: the harvested crop doubles in value, no new 도감 entry; overflow pays the extra', () => {
  const s = L.newState(0, seq(0.5));
  s.plots[0] = { ...plot(), crop: 'radish', progress: L.CROPS.radish.grow, t: 0 };
  L.bagAdd(s, 'radish', L.CROPS.radish.sell);
  const hv = L.harvest(s, 0, 0, seq(0.9));
  assert.equal(L.premiumHarvest(s, hv), hv.coins);
  assert.deepEqual(s.bag.map((e) => e.v), [L.CROPS.radish.sell, hv.coins * 2]);
  assert.equal(s.dex.crops.radish, 1);
  assert.equal(L.premiumHarvest(s, null), 0);
  const t = L.newState(0, seq(0.5));
  while (t.bag.length < L.bagCap(t)) L.bagAdd(t, 'potato', 1);
  t.plots[0] = { ...plot(), crop: 'radish', progress: L.CROPS.radish.grow, t: 0 };
  const c0 = t.coins, hv2 = L.harvest(t, 0, 0, seq(0.9));
  L.premiumHarvest(t, hv2);
  assert.equal(t.coins, c0 + hv2.coins * 2);
  // the doubled value survives a save
  assert.equal(L.decode(L.encode(s)).bag[1].v, hv.coins * 2);
});

test('forest recipes cook from forage; seasonal forage stays off the order board, common finds can be ordered', () => {
  const s = forestState();
  ['oyster', 'shiitake'].forEach((id) => L.bagAdd(s, id, 1)); L.bagAdd(s, 'radish', 1);
  assert.ok(L.canCook(s, 'mushhotpot'));
  assert.ok(L.cook(s, 'mushhotpot', 0));
  assert.equal(s.bag.length, 0);
  assert.ok(L.seasonalItem('acorn') && L.seasonalItem('dotorimuk') && !L.seasonalItem('pebble'));
  assert.ok(!L.orderPool(s, false).some((e) => e.id === 'pebble'), 'not found yet');
  s.forest.dex.pebble = 1; s.forest.dex.acorn = 1;
  const pool = L.orderPool(s, false).map((e) => e.id);
  assert.ok(pool.includes('pebble') && !pool.includes('acorn'));
  const o = L.genOrder({ ...s, orders: [] }, seq(0.5, 0.999, 0.5, 0.5));
  assert.ok(L.itemInfo(o.id));
  assert.ok(L.residentFor({ id: 'pebble', n: 3, reward: 50 }));
  assert.ok(L.obtainable(s, 'pebble'));
  assert.ok(!L.obtainable(L.newState(0, seq(0.5)), 'pebble'));
});

test('pet adoption: cat needs the 고양이 친구 secret or 5 visits, dog costs coins; one pet; name cleaned', () => {
  const s = L.newState(0, seq(0.5));
  L.yardOf(s);
  assert.equal(L.adoptStatus(s, 'cat'), 'locked');
  s.yard.met.cat = 5;
  assert.equal(L.adoptStatus(s, 'cat'), 'ok');
  s.yard.met.cat = 1; s.yard.eggs.catpet = 99;
  assert.equal(L.adoptStatus(s, 'cat'), 'ok');
  assert.equal(L.adoptStatus(s, 'dog'), 'coins');
  const r = L.adoptPet(s, 'cat', '<b>나비야</b>야옹이', 10);
  assert.equal(r.ok, true);
  assert.equal(s.pet.name, 'b나비야b야');
  assert.equal(s.pet.name.length <= L.PET_NAME_MAX, true);
  assert.equal(L.adoptStatus(s, 'dog'), 'have');
  assert.equal(L.cleanPetName('<script>'), 'script');
  assert.equal(L.cleanPetName('   '), '');
  assert.equal(L.renamePet(s, '   '), null);
  assert.equal(L.renamePet(s, '  콩 이 '), '콩 이');
  const d = L.newState(0, seq(0.5)); d.coins = 3000;
  assert.equal(L.adoptPet(d, 'dog', '', 0).name, '바둑이');
  assert.equal(d.coins, 0);
});

test('petting: hearts always, 친밀도 capped per real day; levels', () => {
  const s = L.newState(0, seq(0.5)); s.coins = 5000;
  L.adoptPet(s, 'dog', '콩', 0);
  for (let k = 0; k < L.PET_PETS_DAY; k++) assert.equal(L.petPet(s, 1000, 540).gain, 1);
  assert.equal(L.petLevel(s), 1);
  assert.equal(L.petPet(s, 2000, 540).gain, 0);
  assert.equal(s.pet.f, L.PET_PETS_DAY);
  assert.equal(L.petPet(s, DAY + 1000, 540).gain, 1, 'next day');
  s.pet.f = 69; assert.equal(L.petLevel(s), 3);
  s.pet.f = 70; assert.equal(L.petLevel(s), 4);
});

test('pet gifts: a few a day with a gap, never twice for one slot; the pet never takes anything', () => {
  const s = forestState(); s.coins = 5000;
  L.adoptPet(s, 'dog', '콩', 0);
  const coins = s.coins;
  assert.equal(L.takePetGift(s, 1000, 0, env('autumn'), seq(0.1)), null, 'not before the first gap');
  const t1 = L.PET_GIFT_GAP;
  const g1 = L.takePetGift(s, t1, 0, env('autumn'), seq(0.1));
  assert.ok(g1 && L.itemInfo(g1.id));
  assert.equal(L.takePetGift(s, t1, 0, env('autumn'), seq(0.1)), null, 'no double gift');
  assert.ok(L.takePetGift(s, t1 + L.PET_GIFT_GAP, 0, env('autumn'), seq(0.1)));
  assert.equal(L.takePetGift(s, t1 + 2 * L.PET_GIFT_GAP, 0, env('autumn'), seq(0.1)), null, 'daily cap at low 친밀도');
  assert.equal(s.bag.length, 2);
  assert.equal(s.coins, coins);
  const c = L.newState(0, seq(0.5)); L.yardOf(c); c.yard.met.cat = 9;
  L.adoptPet(c, 'cat', '', 0);
  const fish = L.takePetGift(c, L.PET_GIFT_GAP, 0, null, seq(0.1));
  assert.equal(L.itemInfo(fish.id).kind, 'fish');
});

test('pet finds in the 숲: needs 친밀도, capped per day, spaced', () => {
  const s = forestState(); s.coins = 5000;
  L.adoptPet(s, 'dog', '콩', 0);
  assert.equal(L.petFind(s, 0, 0, env('autumn'), seq(0.1)), null);
  s.pet.f = L.PET_LV[L.PET_FIND_LV - 1];
  const a = L.petFind(s, 0, 0, env('autumn'), seq(0.1));
  assert.ok(a && L.forageById(a.id));
  assert.equal(L.petFind(s, 1, 0, env('autumn'), seq(0.1)), null);
  let t = 0, n = 1;
  for (let k = 0; k < 10; k++) { t += L.PET_FIND_GAP; if (L.petFind(s, t, 0, env('autumn'), seq(0.1))) n++; }
  assert.equal(n, L.PET_FIND_DAY);
});

test('saves: 5A fields round-trip; garbage is dropped; older saves load without them', () => {
  const s = forestState(); s.coins = 5000;
  L.tickForest(s, 1000, env('spring'), seq(0.3));
  L.pickForage(s, 2, 1500, seq(0.5), false);
  L.yardOf(s); s.yard.eggs.catpet = 7;
  assert.equal(L.adoptPet(s, 'cat', '삼색이', 5).ok, true);
  s.pet.f = 17;
  const back = L.decode(L.encode(s));
  assert.deepEqual(back.forest, s.forest);
  assert.deepEqual(back.pet, s.pet);
  assert.deepEqual(L.decode(L.encode(back)).forest, back.forest);
  const bad = JSON.parse(L.encode(s));
  bad.forest.spots[0] = { at: 'x', id: 'nope' }; bad.forest.dex = { nope: 3, acorn: -1, gosari: 2 };
  bad.pet = { kind: 'dragon', name: 'x' };
  const b = L.decode(JSON.stringify(bad));
  assert.ok(b);
  assert.deepEqual(b.forest.spots[0], { at: 0, id: null });
  assert.deepEqual(b.forest.dex, { gosari: 2 });
  assert.equal('pet' in b, false);
  bad.pet = { kind: 'dog', name: '<img src=x onerror=1>', f: 1e12 };
  assert.equal(L.decode(JSON.stringify(bad)).pet.name, 'img sr');
  assert.equal(L.decode(JSON.stringify(bad)).pet.f, 1e6);
  // v1 save
  const v1 = { v: 1, coins: 500, sel: 'radish', plots: Array.from({ length: 6 }, plot), seeds: { gold: 0 }, up: { rod: 1 },
    items: { fert: 0 }, ms: {}, nextEventAt: 0, fish: { phase: 'idle' }, dex: { crops: { radish: 3 }, fish: {} }, savedAt: 0 };
  const o = L.decode(JSON.stringify(v1));
  assert.equal(o.coins, 500);
  assert.equal('forest' in o, false); assert.equal('pet' in o, false);
  // forage in the basket and forest dishes in the pot survive
  const t = forestState();
  L.bagAdd(t, 'songi', 900); t.pot = { id: 'songigui', until: 5 }; t.dex.dish.bibimbap = 2;
  const tb = L.decode(L.encode(t));
  assert.deepEqual(tb.bag, [{ id: 'songi', v: 900 }]);
  assert.deepEqual(tb.pot, { id: 'songigui', until: 5 });
  assert.equal(tb.dex.dish.bibimbap, 2);
});
