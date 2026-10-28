// test/yard.test.js — stage 3: 마당, 집, 동물, 꾸미기, 방문객, 이스터에그
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

function loadLogic() {
  const html = require('../build.js').build();
  const m = html.match(/<script id="logic">([\s\S]*?)<\/script>/);
  vm.runInThisContext(m[1], { filename: 'logic.js' });
  return globalThis.Logic;
}
const L = loadLogic();
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
// small seeded PRNG (mulberry32) for determinism checks
const mulberry = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const MIN = 60e3;
const rich = () => { const s = L.newState(0, seq(0.5)); s.coins = 1e6; s.rep = 100; L.yardOf(s); return s; };

test('v1 save loads as a tent with no animals; newState is untouched by stage 3', () => {
  const v1 = { v: 1, coins: 500, sel: 'radish', plots: Array.from({ length: 6 }, () => ({ crop: null, progress: 0, t: 0, yieldMul: 1, weed: false, crow: null, fert: false, last: null })),
    seeds: { gold: 0 }, up: { rod: 1 }, items: { fert: 0 }, ms: {}, nextEventAt: 0, fish: { phase: 'idle' }, dex: { crops: {}, fish: {} }, savedAt: 0 };
  const s = L.decode(JSON.stringify(v1));
  assert.ok(s);
  assert.equal(s.yard, undefined);
  assert.equal(L.houseTier(s), 0);
  assert.equal(L.houseInfo(s).name, '천막');
  assert.equal(L.obtainable(s, 'milk'), false);
  assert.equal(L.bagCap(s), 12);
  assert.equal(L.potCount(s), 1);
  L.yardOf(s);
  assert.deepEqual(s.animals, { hen: 0, duck: 0, cow: 0 });
  assert.equal(L.decode(L.encode(s)).yard.house, 0);
  assert.equal('yard' in L.newState(0, seq(0.5)), false);
});

test('pre-stage-3 v2 save (basket, orders, pot) loads unchanged and round-trips', () => {
  const s = L.newState(0, seq(0.5));
  s.coins = 777; s.rep = 3; s.bag = [{ id: 'radish', v: 30 }, { id: 'egg', v: 50 }];
  s.pot = { id: 'jam', until: 5e5 };
  const back = L.decode(L.encode(s));
  assert.deepEqual(back, s);
  assert.equal(back.yard, undefined);
});

test('stage-3 state round-trips through encode/decode; junk is dropped, not fatal', () => {
  const s = rich();
  L.upgradeHouse(s); L.upgradeHouse(s);
  L.buyAnimal(s, 'hen', 0); L.buyAnimal(s, 'cow', 0);
  L.buyDeco(s, 'mailbox'); L.buyFurn(s, 'bed');
  L.spawnVisitor(s, L.visitorById('merchant'), 0, seq(0.3), 1);
  L.spawnVisitor(s, L.visitorById('mailman'), 0, seq(0.3), 1);
  L.findEgg(s, 'midnight', 5);
  for (let k = 0; k < 18; k++) L.bagAdd(s, 'radish', 30);       // more than the base 12: kept by the 기와집's +8
  const back = L.decode(L.encode(s));
  assert.deepEqual(back, s);
  assert.equal(back.bag.length, 18);
  const j = JSON.parse(L.encode(s));
  j.yard.house = 99; j.yard.deco.unicorn = true; j.yard.vis.push({ id: 'dragon', at: 0, until: 1, x: 0, n: 0 }); j.animals.hen = 50;
  const b2 = L.decode(JSON.stringify(j));
  assert.equal(b2.yard.house, 3);
  assert.equal(b2.yard.deco.unicorn, undefined);
  assert.equal(b2.yard.vis.length, 2);
  assert.equal(b2.animals.hen, 3);
});

test('house tiers: coins + ★ gate, perks add basket slots, pots, decoration spots', () => {
  const s = L.newState(0, seq(0.5));
  s.coins = 2000; s.rep = 5;
  assert.deepEqual(L.upgradeHouse(s), { ok: false, why: 'rep' });
  s.rep = 6;
  assert.equal(L.upgradeHouse(s).ok, true);
  assert.equal(s.coins, 0);
  assert.equal(L.houseInfo(s).name, '오두막');
  assert.equal(L.bagCap(s), 16);
  assert.equal(L.decoSlots(s), 6);
  assert.deepEqual(L.upgradeHouse(s), { ok: false, why: 'rep' });
  s.rep = 100; s.coins = 1e6;
  L.upgradeHouse(s); L.upgradeHouse(s);
  assert.equal(L.houseInfo(s).name, '2층집');
  assert.equal(L.potCount(s), 3);
  assert.equal(L.bagCap(s), 24);
  assert.deepEqual(L.upgradeHouse(s), { ok: false, why: 'max' });
});

test('extra pots: a 기와집 cooks two dishes at once, and each comes out on its own', () => {
  const s = rich();
  s.seedOk = { potato: true, pepper: true };
  ['radish', 'radish', 'pepper', 'radish', 'radish', 'pepper'].forEach((id) => L.bagAdd(s, id, 1));
  assert.equal(L.cook(s, 'saengchae', 0), true);
  assert.equal(L.cook(s, 'saengchae', 0), false);       // tent: one pot
  L.upgradeHouse(s); L.upgradeHouse(s);
  assert.equal(L.cook(s, 'saengchae', 10e3), true);
  assert.equal(s.yard.pots[0].id, 'saengchae');
  const ms = L.recipeById('saengchae').time;
  assert.equal(L.potReady(s, ms), true);
  assert.equal(L.takeDish(s, ms).id, 'saengchae');
  assert.equal(s.pot, null);
  assert.equal(L.potReady(s, ms), false);
  assert.equal(L.takeDish(s, ms + 10e3).id, 'saengchae');
  assert.equal(s.yard.pots[0], null);
  assert.equal(s.dex.dish.saengchae, 2);
});

test('animals: hen every 20 min, cow 60, duck 40; offline catch-up stops at 4 per head', () => {
  const s = rich();
  assert.deepEqual(L.buyAnimal(s, 'cow', 0), { ok: false, why: 'house' });
  assert.equal(L.buyAnimal(s, 'hen', 0).ok, true);
  assert.equal(L.obtainable(s, 'egg'), true);
  s.seedOk.potato = true;
  assert.equal(L.obtainable(s, 'jeon'), true);           // 감자전 needs 달걀: makeable now (with potato)
  L.animalTick(s, 19 * MIN);
  assert.equal(L.productsWaiting(s), 0);
  L.animalTick(s, 41 * MIN);
  assert.equal(s.yard.prod.hen.n, 2);
  // away for a day: capped at 4, and the clock waits at the cap
  const back = L.decode(L.encode(s));
  L.animalTick(back, 24 * 60 * MIN);
  assert.equal(back.yard.prod.hen.n, 4);
  const got = L.collectAnimals(back, 24 * 60 * MIN, seq(0.5));
  assert.deepEqual(got.items, ['egg', 'egg', 'egg', 'egg']);
  assert.equal(L.bagCount(back, 'egg'), 4);
  assert.equal(back.yard.prod.hen.n, 0);
  L.animalTick(back, 24 * 60 * MIN + 20 * MIN);
  assert.equal(back.yard.prod.hen.n, 1);
  // a second hen doubles output; cow and duck on their own timers
  L.upgradeHouse(s);
  L.buyAnimal(s, 'hen', 41 * MIN); L.buyAnimal(s, 'cow', 41 * MIN); L.buyAnimal(s, 'duck', 41 * MIN);
  L.animalTick(s, 101 * MIN);
  assert.equal(s.yard.prod.cow.n, 1);
  assert.equal(s.yard.prod.duck.n, 1);
  assert.equal(L.obtainable(s, 'cornsoup'), L.seedUnlocked(s, 'corn') && L.seedUnlocked(s, 'potato'));
  assert.equal(L.obtainable(s, 'milk'), true);
  const c = L.collectAnimals(s, 101 * MIN, seq(0.1));    // 0.1 < 0.3 → feather
  assert.ok(c.items.includes('milk') && c.items.includes('feather'));
});

test('animal products overflow a full basket by selling, never lost', () => {
  const s = rich();
  L.buyAnimal(s, 'hen', 0);
  while (s.bag.length < L.bagCap(s)) L.bagAdd(s, 'radish', 30);
  const coins = s.coins;
  L.animalTick(s, 40 * MIN);
  const r = L.collectAnimals(s, 40 * MIN, seq(0.5));
  assert.equal(r.items.length, 2);
  assert.equal(r.sold, 100);
  assert.equal(s.coins, coins + 100);
});

test('decorations: fixed slots by house tier; merchant-only ones need the merchant', () => {
  const s = rich();
  ['flowers', 'mailbox', 'bench', 'birdhouse'].forEach((id) => assert.equal(L.buyDeco(s, id).ok, true));
  assert.deepEqual(L.buyDeco(s, 'tree'), { ok: false, why: 'slots' });
  L.upgradeHouse(s);
  assert.equal(L.buyDeco(s, 'tree').ok, true);
  assert.deepEqual(L.buyDeco(s, 'tree'), { ok: false, why: 'owned' });
  assert.deepEqual(L.buyDeco(s, 'lanterns'), { ok: false, why: 'merchant' });
  assert.equal(L.buyDeco(s, 'lanterns', true, 900).ok, true);
  assert.deepEqual(L.buyFurn(s, 'piano'), { ok: false, why: 'house' });
  assert.equal(L.buyFurn(s, 'table').ok, true);
});

test('visitor rolls are deterministic with a seeded rng and respect decorations, time and weather', () => {
  const run = (seed) => {
    const s = rich(); L.buyDeco(s, 'mailbox'); L.buyDeco(s, 'tree');
    const rng = mulberry(seed), log = [];
    for (let t = 0; t < 6 * 3600e3; t += 20e3) L.tickVisitors(s, t, rng, 0, 1).forEach((e) => log.push(t + ':' + e.type + ':' + e.id));
    return { log, s };
  };
  const a = run(42), b = run(42);
  assert.deepEqual(a.log, b.log);
  assert.notDeepEqual(a.log, run(7).log);
  assert.ok(a.log.length > 20);
  const ids = new Set(a.log.map((x) => x.split(':')[2]));
  ['cat', 'mailman', 'squirrel'].forEach((id) => assert.ok(ids.has(id), id));
  assert.ok(!ids.has('sparrows') && !ids.has('butterfly'));     // no birdhouse, no flowers
  assert.ok(a.s.yard.mail.length > 0);
  // night-only and rainbow gating
  const s = rich();
  let night = 0; while (L.gameClock(night, 0).phase !== 'night') night += MIN;
  assert.ok(L.rollVisitor(s, night, seq(0.99), 0) !== null);
  for (let k = 0; k < 50; k++) {
    const d = L.rollVisitor(s, night, mulberry(k), 0);
    assert.ok(!['sparrows', 'mailman', 'merchant', 'duckfam', 'butterfly'].includes(d.id));
  }
  let day = 20 * MIN; while (L.gameClock(day, 0).phase !== 'day') day += MIN;
  for (let k = 0; k < 50; k++) assert.ok(!['fireflies', 'shootingstar'].includes(L.rollVisitor(s, day, mulberry(k), 0).id));
  let rb = 0; while (!(L.rainJustStopped(rb, 0) && L.gameClock(rb, 0).phase !== 'night')) rb += 40 * MIN;
  const seen = new Set(); for (let k = 0; k < 40; k++) seen.add(L.rollVisitor(s, rb, mulberry(k), 0).id);
  assert.ok(seen.has('rainbow'));
});

test('one visitor per slot; a long absence brings one visitor, not a crowd', () => {
  const s = rich();
  s.yard.nextVisitAt = 1;
  const ev = L.tickVisitors(s, 100 * 3600e3, seq(0.5), 0, 1);
  assert.equal(ev.filter((e) => e.type === 'arrive').length, 1);
  for (let t = 0; t < 30; t++) L.tickVisitors(s, 100 * 3600e3 + t * 5 * MIN, mulberry(t), 0, 1);
  const slots = s.yard.vis.map((v) => L.visitorById(v.id).slot);
  assert.equal(new Set(slots).size, slots.length);
});

test('visitors never take anything: every tap leaves the basket at least as full and coins never drop', () => {
  for (const d of L.VISITORS) {
    const s = rich();
    ['crucian', 'radish', 'egg', 'maeuntang'].forEach((id) => L.bagAdd(s, id, L.itemInfo(id).price));
    const bag = JSON.stringify(s.bag), coins = s.coins, fert = s.items.fert;
    L.spawnVisitor(s, d, 0, seq(0.4), 1);
    for (let k = 0; k < 6; k++) L.tapVisitor(s, d.id, k, seq(0.4), 0);
    L.tickVisitors(s, 3600e3, seq(0.4), 0, 1);
    assert.ok(s.bag.length >= 4, d.id);
    assert.equal(JSON.stringify(s.bag.slice(0, 4)), bag, d.id);
    assert.ok(s.coins >= coins, d.id);
    assert.ok(s.items.fert >= fert, d.id);
  }
});

test('cat: tap gives a gift and stays; untapped it leaves the gift on the step', () => {
  const s = rich(); L.bagAdd(s, 'crucian', 28);
  L.spawnVisitor(s, L.visitorById('cat'), 0, seq(0.5), 1);
  const c0 = s.coins, r = L.tapVisitor(s, 'cat', 1, seq(0.5), 0);
  assert.ok(r.coins >= 20 && s.coins === c0 + r.coins && r.stays);
  const s2 = rich();
  L.spawnVisitor(s2, L.visitorById('cat'), 0, seq(0.5), 1);
  const ev = L.tickVisitors(s2, 3600e3, seq(0.5), 0, 1);
  assert.ok(ev[0].type === 'leave' && ev[0].gift.c > 0);
  assert.equal(s2.yard.gifts.length, 1);
  const c1 = s2.coins, g = L.collectGifts(s2);
  assert.equal(s2.coins, c1 + g.c);
  assert.equal(s2.yard.gifts.length, 0);
});

test('merchant stays 10 min and sells rare seeds and merchant-only decorations', () => {
  const s = rich();
  const v = L.spawnVisitor(s, L.visitorById('merchant'), 0, seq(0.1, 0.5, 0.9), 1);
  assert.equal(v.until, 600e3);
  assert.equal(v.wares.length, 3);
  const k = v.wares.findIndex((w) => w.id === 'gold');
  if (k >= 0) {
    const gold = s.seeds.gold;
    assert.equal(L.merchantBuy(s, k).ok, true);
    assert.equal(s.seeds.gold, gold + 1);
    assert.deepEqual(L.merchantBuy(s, k), { ok: false, why: 'gone' });
  }
  const w2 = { id: 'lanterns', cost: 900, sold: false };
  v.wares = [w2];
  assert.equal(L.merchantBuy(s, 0).ok, true);
  assert.equal(s.yard.deco.lanterns, true);
  assert.equal(L.tapVisitor(s, 'merchant', 1, seq(0.5), 0).sheet, 'merchant');
  assert.equal(s.yard.vis.length, 1);
});

test('mailman delivers letters with egg hints; reading pays once', () => {
  const s = rich(); L.buyDeco(s, 'mailbox');
  L.spawnVisitor(s, L.visitorById('mailman'), 0, seq(0.5), 1);
  L.spawnVisitor(s, L.visitorById('mailman'), 1, seq(0.5), 1);
  assert.equal(s.yard.mail.length, 2);
  assert.ok(s.yard.mail.some((m) => m.k.startsWith('e:')));
  const c0 = s.coins, r = L.readMail(s, 0);
  assert.ok(r.text.length > 10 && s.coins === c0 + r.coins && r.coins > 0);
  assert.equal(L.readMail(s, 0).coins, 0);
});

test('easter eggs trigger once each: scarecrow, clock fish, 999 radish, midnight, wishes, sleep, ducks, cat', () => {
  const s = rich();
  const real = (h, m) => new Date(2026, 9, 28, h, m, 30);
  // scarecrow: a pause resets the count
  for (let k = 0; k < 9; k++) L.tapScarecrow(s, k * 1000, 1);
  assert.equal(L.tapScarecrow(s, 20e3, 1).n, 1);
  let r; for (let k = 1; k <= 9; k++) r = L.tapScarecrow(s, 20e3 + k * 500, 1);
  assert.equal(r.egg.id, 'scarecrow');
  // clock fish only at hh:00
  assert.equal(L.clockRoll(real(14, 59), seq(0.5)), null);
  const roll = L.clockRoll(real(15, 0), seq(0.5));
  assert.equal(roll.id, 'clockfish');
  assert.equal(L.newReel(roll, 0).power > 0, true);
  L.landFish(s, roll);
  assert.deepEqual(L.checkEggs(s, 1, real(15, 1)).map((e) => e.id), ['clockfish']);
  assert.equal(L.availableFish(real(15, 0), s).some((f) => f.id === 'clockfish'), false);
  assert.equal(L.obtainable(s, 'clockfish'), false);
  // midnight (real clock) and 999 radishes
  assert.deepEqual(L.checkEggs(s, 2, real(23, 59)), []);
  assert.deepEqual(L.checkEggs(s, 2, real(0, 4)).map((e) => e.id), ['midnight']);
  s.dex.crops.radish = 999;
  const c0 = s.coins;
  assert.deepEqual(L.checkEggs(s, 3, real(12, 0)).map((e) => e.id), ['radish999']);
  assert.equal(s.coins, c0 + 2000);
  assert.deepEqual(L.checkEggs(s, 4, real(0, 1)), []);
  // three wishes in one game night
  let night = 0; while (L.gameClock(night, 0).phase !== 'night') night += MIN;
  for (let k = 0; k < 3; k++) { L.spawnVisitor(s, L.visitorById('fireflies'), night, seq(0.5), 1); r = L.tapVisitor(s, 'fireflies', night + k, seq(0.5), 0); }
  assert.equal(r.egg.id, 'wish3');
  // sleep only at night
  assert.equal(L.tapBed(s, night - 20 * MIN, 0).egg, null);
  assert.equal(L.tapBed(s, night, 0).egg.id, 'sleep');
  // ducks: three greetings; cat: five pets
  L.spawnVisitor(s, L.visitorById('duckfam'), 0, seq(0.5), 1);
  for (let k = 0; k < 3; k++) r = L.tapVisitor(s, 'duckfam', k, seq(0.5), 0);
  assert.equal(r.egg.id, 'duckparade');
  L.spawnVisitor(s, L.visitorById('cat'), 0, seq(0.5), 1);
  for (let k = 0; k < 5; k++) r = L.tapVisitor(s, 'cat', k, seq(0.5), 0);
  assert.equal(r.egg.id, 'catpet');
  assert.equal(L.eggCount(s), L.EGGS.length);
  assert.ok(L.EGGS.length >= 6 && L.EGGS.every((e) => e.hint && e.letter && e.cat && e.merch));
});
