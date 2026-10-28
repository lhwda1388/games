// farm-fish/test/logic.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

// built in memory from src/, so tests never need `node farm-fish/build.js` first
function loadLogic() {
  const html = require('../build.js').build();
  const m = html.match(/<script id="logic">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('logic block not found');
  vm.runInThisContext(m[1], { filename: 'logic.js' });
  return globalThis.Logic;
}
const L = loadLogic();
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const MIN = 60e3;

test('growth timing, including offline catch-up', () => {
  const s = L.newState(0, seq(0.5));
  assert.equal(L.plant(s, 0, 'radish', 0), true);
  assert.equal(s.coins, 50);
  L.advance(s, 1 * MIN);
  assert.equal(L.isReady(s.plots[0]), false);
  assert.equal(L.stage(s.plots[0]), 2);
  // simulate a save/reload while closed for an hour
  const back = L.decode(L.encode(s));
  L.advance(back, 61 * MIN);
  assert.equal(L.isReady(back.plots[0]), true);
  assert.equal(L.harvest(back, 0, 61 * MIN, seq(0.9)).coins, 30);
});

test('weed pauses growth until pulled', () => {
  const s = L.newState(0, seq(0.5));
  L.plant(s, 1, 'radish', 0);
  L.advance(s, 30e3);
  s.plots[1].weed = true;
  L.advance(s, 10 * MIN);
  assert.equal(s.plots[1].progress, 30e3);
  assert.equal(L.pullWeed(s, 1, 10 * MIN), true);
  L.advance(s, 10 * MIN + 90e3);
  assert.equal(L.isReady(s.plots[1]), true);
});

test('spawnEvent picks a growing plot; crow ignored for 60s eats 30%', () => {
  const s = L.newState(0, seq(0.5));
  L.plant(s, 2, 'berry', 0);
  s.nextEventAt = 1000;
  assert.equal(L.spawnEvent(s, 500, seq(0)), null);
  const ev = L.spawnEvent(s, 1000, seq(0, 0, 0.1)); // interval, plot pick, crow
  assert.deepEqual(ev, { type: 'crow', i: 2 });
  const evs = L.advance(s, 1000 + L.CROW_MS);
  assert.deepEqual(evs, [{ type: 'crowAte', i: 2 }]);
  L.advance(s, 20 * MIN);
  assert.equal(L.harvest(s, 2, 20 * MIN, seq(0.9)).coins, Math.round(160 * 0.7));
});

test('crow shooed in time costs nothing', () => {
  const s = L.newState(0, seq(0.5));
  L.plant(s, 0, 'radish', 0);
  s.plots[0].crow = { until: 50e3 };
  assert.equal(L.shoo(s, 0, 49e3), true);
  L.advance(s, 3 * MIN);
  assert.equal(L.harvest(s, 0, 3 * MIN, seq(0.9)).coins, 30);
});

test('crossbreed: adjacent strawberry + watermelon roll with fixed rng', () => {
  const mk = () => {
    const s = L.newState(0, seq(0.5));
    s.coins = 1000;
    L.plant(s, 0, 'berry', 0);
    L.plant(s, 1, 'melon', 0);
    L.plant(s, 5, 'berry', 0);       // not adjacent to plot 1
    L.advance(s, 76 * MIN);
    return s;
  };
  let s = mk();
  assert.equal(L.harvest(s, 0, 76 * MIN, seq(0.05)).gold, true);
  assert.equal(s.seeds.gold, 1);
  assert.equal(s.dex.goldSeed, true);
  s = mk();
  assert.equal(L.harvest(s, 0, 76 * MIN, seq(0.5)).gold, false);
  // second half of the pair: melon harvested after its adjacent berry also rolls
  assert.equal(L.harvest(s, 1, 77 * MIN, seq(0.01)).gold, true);
  // plot 5 has no adjacent melon left → no roll even with rng 0
  s = mk();
  L.harvest(s, 1, 76 * MIN, seq(0.99));
  const far = L.newState(0, seq(0.5));
  far.coins = 1000; L.plant(far, 5, 'berry', 0); L.advance(far, 76 * MIN);
  assert.equal(L.harvest(far, 5, 76 * MIN, seq(0)).gold, false);
  // golden seed plants for free and sells big
  assert.equal(L.plant(s, 1, 'gold', 85 * MIN), false);
  s.seeds.gold = 1;
  assert.equal(L.plant(s, 1, 'gold', 85 * MIN), true);
  L.advance(s, 161 * MIN);
  assert.equal(L.harvest(s, 1, 161 * MIN, seq(0.9)).coins, L.CROPS.gold.sell);
});

// stage 4 adds seasonal pond fish; these older checks are about time windows and weights, so they pin
// the game season out (env without a season = no seasonal fish)
const noSeason = (d) => { const e = L.fishEnv(d.getTime(), -d.getTimezoneOffset()); delete e.season; return e; };

test('fish time-window gating', () => {
  const ids = (d) => L.availableFish(d, undefined, noSeason(d)).map((f) => f.id);
  const tue10 = new Date(2026, 9, 27, 10, 0);
  const tue12 = new Date(2026, 9, 27, 12, 30);
  const fri17 = new Date(2026, 9, 30, 17, 5);
  const fri12 = new Date(2026, 9, 30, 12, 0);
  assert.ok(!ids(tue10).includes('lunch') && !ids(tue10).includes('tuna'));
  assert.ok(ids(tue12).includes('lunch') && !ids(tue12).includes('tuna'));
  assert.ok(ids(fri17).includes('tuna') && !ids(fri17).includes('lunch'));
  assert.ok(ids(fri12).includes('lunch') && !ids(fri12).includes('tuna'));
  // rng at the top of the weight range lands on the last available species
  assert.equal(L.rollFish(fri17, seq(0.999, 0.5), undefined, noSeason(fri17)).id, 'tuna');
  assert.notEqual(L.rollFish(tue10, seq(0.999, 0.5), undefined, noSeason(tue10)).id, 'tuna');
});

test('bite window, hook, and reel outcomes', () => {
  const s = L.newState(0, seq(0.5));
  L.cast(s, 0, seq(0), 100, 150);
  assert.equal(s.fish.biteAt, 20e3);
  assert.equal(L.updateFishing(s, 19e3, seq(0.1)), null);
  assert.equal(L.updateFishing(s, 20e3, seq(0.1, 0.1)), 'bite');
  assert.equal(L.updateFishing(s, 20e3 + L.BITE_MS + 1, seq(0.1)), 'missed');
  assert.equal(s.fish.phase, 'idle');
  L.cast(s, 0, seq(0), 100, 150);
  L.updateFishing(s, 20e3, seq(0.1, 0.1));
  const roll = L.hook(s, 21e3);
  assert.ok(roll && L.fishById(roll.id));
  // holding forever with a pulling fish snaps the line
  const r = L.newReel({ id: 'carp', size: 60 });
  let res = null;
  for (let k = 0; k < 600 && !res; k++) res = L.reelStep(r, 1 / 60, true, seq(0.5));
  assert.equal(res, 'snap');
  // never holding lets it escape
  const r2 = L.newReel({ id: 'minnow', size: 8 });
  res = null;
  for (let k = 0; k < 900 && !res; k++) res = L.reelStep(r2, 1 / 60, false, seq(0.5));
  assert.equal(res, 'escaped');
});

test('save decode rejects garbage without throwing', () => {
  for (const g of [undefined, null, 42, '', '{', 'null', '[]', '{"v":2}', '{"v":1,"coins":"x"}',
    '{"v":1,"coins":5,"plots":[1,2]}', JSON.stringify({ v: 1, coins: 5, plots: Array(6).fill({ crop: 'banana' }) })]) {
    assert.equal(L.decode(g), null);
  }
  const s = L.newState(5, seq(0.5));
  s.coins = 777;
  assert.equal(L.decode(L.encode(s)).coins, 777);
});

test('shop: tiered costs, coin check, max tier, fertilizer consumable', () => {
  const s = L.newState(0, seq(0.5));
  s.coins = 100;
  assert.equal(L.upgradeCost(s, 'bait'), 120);
  assert.equal(L.buy(s, 'bait'), false);           // too poor: nothing changes
  assert.equal(s.coins, 100);
  s.coins = 10000;
  assert.equal(L.buy(s, 'bait'), true);
  assert.equal(s.up.bait, 1);
  assert.equal(s.coins, 10000 - 120);
  assert.equal(L.upgradeCost(s, 'bait'), 1200);
  L.buy(s, 'bait'); L.buy(s, 'bait');
  assert.equal(L.upgradeCost(s, 'bait'), null);
  assert.equal(L.buy(s, 'bait'), false);
  assert.equal(L.buy(s, 'nonsense'), false);
  assert.equal(L.buy(s, 'fert'), true);
  assert.equal(s.items.fert, 1);
  // first upgrade affordable from a short session; top tiers are a multi-day aim
  const firsts = L.UPG_IDS.map((k) => L.UPG[k].costs[0]);
  assert.ok(Math.min(...firsts) <= 150);
  const total = L.UPG_IDS.reduce((a, k) => a + L.UPG[k].costs.reduce((x, y) => x + y, 0), 0);
  assert.ok(total >= 8000);
});

test('rod upgrade slows tension gain; bait shortens waits and favours rare fish', () => {
  const holdTime = (rodTier) => {
    const r = L.newReel({ id: 'carp', size: 60 }, rodTier);
    let k = 0;
    while (!L.reelStep(r, 1 / 60, true, seq(0.5)) && k < 6000) k++;
    return { k, res: r.result };
  };
  const t0 = holdTime(0), t3 = holdTime(3);
  assert.equal(t0.res, 'snap');
  assert.ok(t3.k > t0.k * 1.3, `rod 3 should hold much longer (${t3.k} vs ${t0.k})`);

  const s = L.newState(0, seq(0.5));
  L.cast(s, 0, seq(0), 100, 150);
  assert.equal(s.fish.biteAt, 20e3);
  const b = L.newState(0, seq(0.5));
  b.up.bait = 3;
  L.cast(b, 0, seq(0), 100, 150);
  assert.equal(b.fish.biteAt, Math.round(20e3 * L.UPG.bait.wait[3]));
  // same rng value lands on a rarer species with better bait
  const tue10 = new Date(2026, 9, 27, 10, 0);
  assert.equal(L.rollFish(tue10, seq(0.7, 0.5), undefined, noSeason(tue10)).id, 'crucian');
  assert.equal(L.rollFish(tue10, seq(0.7, 0.5), b, noSeason(tue10)).id, 'catfish');
});

test('field expansion: 6 → 8 → 9 plots, neighbours respect missing plots', () => {
  const s = L.newState(0, seq(0.5));
  s.coins = 10000;
  assert.equal(s.plots.length, 6);
  L.buy(s, 'field');
  assert.equal(s.plots.length, 8);
  assert.deepEqual(L.neighbors(7, 8).sort(), [4, 6]);
  assert.deepEqual(L.neighbors(5, 8).sort(), [2, 4]);   // plot 8 not bought yet
  L.buy(s, 'field');
  assert.equal(s.plots.length, 9);
  assert.equal(L.buy(s, 'field'), false);
  assert.equal(L.plant(s, 8, 'radish', 0), true);
  const back = L.decode(L.encode(s));
  assert.equal(back.plots.length, 9);
  assert.equal(back.plots[8].crop, 'radish');
  assert.equal(back.up.field, 2);
});

test('old 6-plot save without shop fields still loads and migrates', () => {
  const old = {
    v: 1, coins: 345, sel: 'berry', seeds: { gold: 1 }, nextEventAt: 9e5, savedAt: 8e5,
    plots: Array.from({ length: 6 }, (_, i) => i === 2
      ? { crop: 'berry', progress: 1000, t: 5, yieldMul: 1, weed: false, crow: null, last: null }
      : { crop: null, progress: 0, t: 0, yieldMul: 1, weed: false, crow: null, last: null }),
    fish: { phase: 'wait', x: 100, y: 150, biteAt: 9e5 },
    dex: { crops: { radish: 3 }, fish: { minnow: { n: 2, best: 9.1 } }, goldSeed: true }
  };
  const s = L.decode(JSON.stringify(old));
  assert.ok(s);
  assert.equal(s.coins, 345);
  assert.equal(s.plots.length, 6);
  assert.deepEqual(s.up, { rod: 0, bait: 0, field: 0, scare: 0, basket: 0 });
  assert.equal(s.items.fert, 0);
  assert.equal(s.plots[2].crop, 'berry');
  assert.equal(s.fish.phase, 'wait');
  assert.equal(s.fish.nibAt, 9e5);
  // a save with field tier 1 but only 6 stored plots gets padded
  const s2 = L.decode(JSON.stringify(Object.assign({}, old, { up: { field: 1 } })));
  assert.equal(s2.plots.length, 8);
  // a longer plot list implies the tier that holds it
  const s3 = L.decode(JSON.stringify(Object.assign({}, old, { plots: old.plots.concat([old.plots[0], old.plots[0], old.plots[0]]) })));
  assert.equal(s3.plots.length, 9);
  assert.equal(s3.up.field, 2);
  assert.equal(L.decode(JSON.stringify(Object.assign({}, old, { plots: Array(10).fill(old.plots[0]) }))), null);
});

test('scarecrow: crow roll can be scared off with fixed rng', () => {
  const mk = (scare) => {
    const s = L.newState(0, seq(0.5));
    s.up.scare = scare;
    L.plant(s, 0, 'radish', 0);
    s.nextEventAt = 0;
    return s;
  };
  // rng: interval, plot pick, crow-vs-weed, scare roll
  let s = mk(0);
  assert.deepEqual(L.spawnEvent(s, 1, seq(0, 0, 0.1, 0.1)), { type: 'crow', i: 0 });
  s = mk(1);
  assert.deepEqual(L.spawnEvent(s, 1, seq(0, 0, 0.1, 0.3)), { type: 'scared', i: 0 });
  assert.equal(s.plots[0].crow, null);
  s = mk(1);
  assert.deepEqual(L.spawnEvent(s, 1, seq(0, 0, 0.1, 0.4)), { type: 'crow', i: 0 });
  s = mk(3);
  assert.deepEqual(L.spawnEvent(s, 1, seq(0, 0, 0.1, 0.8)), { type: 'scared', i: 0 });
  // weeds are not the scarecrow's business
  s = mk(3);
  assert.deepEqual(L.spawnEvent(s, 1, seq(0, 0, 0.9)), { type: 'weed', i: 0 });
});

test('fertilizer doubles growth on one plot', () => {
  const s = L.newState(0, seq(0.5));
  s.coins = 1000;
  L.plant(s, 0, 'berry', 0); L.plant(s, 1, 'berry', 0);
  assert.equal(L.fertilize(s, 0, 0), false);        // none owned
  L.buy(s, 'fert');
  assert.equal(L.fertilize(s, 2, 0), false);        // empty plot
  assert.equal(L.fertilize(s, 0, 0), true);
  assert.equal(s.items.fert, 0);
  L.advance(s, 5 * MIN);
  assert.equal(L.isReady(s.plots[0]), true);
  assert.equal(L.isReady(s.plots[1]), false);
  assert.equal(L.harvest(s, 0, 5 * MIN, seq(0.9)).coins, 160);
  assert.equal(s.plots[0].fert, false);
});

test('decoy nibble: striking early scares the fish and restarts the wait', () => {
  const s = L.newState(0, seq(0.5));
  L.cast(s, 0, seq(0), 100, 150);              // bite at 20 s, first nibble at 5 s
  assert.equal(s.fish.nibAt, 5e3);
  assert.equal(L.updateFishing(s, 4e3, seq(0)), null);
  assert.equal(L.updateFishing(s, 5e3, seq(0)), 'nibble');
  assert.equal(s.fish.nibEnd, 5e3 + L.NIBBLE_MS);
  const r = L.strike(s, 5.2e3, seq(0.5));
  assert.deepEqual(r, { type: 'scared', nibble: true });
  assert.equal(s.fish.phase, 'wait');
  assert.equal(s.fish.biteAt, 5.2e3 + 20e3 + 0.5 * 70e3);   // a whole new wait
  assert.equal(L.updateFishing(s, 20e3, seq(0)), null);       // old bite time passes quietly
  // striking with no nibble on is still too early
  assert.deepEqual(L.strike(s, 21e3, seq(0)), { type: 'scared', nibble: false });
  // waiting for the real bite then striking hooks
  L.updateFishing(s, s.fish.biteAt, seq(0.1, 0.1));
  assert.equal(s.fish.phase, 'bite');
  const h = L.strike(s, s.fish.biteAt + 100, seq(0));
  assert.equal(h.type, 'hook');
  assert.ok(L.fishById(h.roll.id));
  assert.equal(s.fish.phase, 'reel');
  // a stale nibble (e.g. after being away) is skipped, not reported
  const t = L.newState(0, seq(0.5));
  L.cast(t, 0, seq(0), 100, 150);
  assert.equal(L.updateFishing(t, 12e3, seq(0)), null);
  assert.ok(t.fish.nibAt > 12e3);
});

test('도감 milestones unlock once; golden melon brings the koi', () => {
  const s = L.newState(0, seq(0.5));
  assert.deepEqual(L.checkMilestones(s), []);
  s.dex.crops = { radish: 1, berry: 1 };
  s.dex.fish = { minnow: { n: 1, best: 8 }, crucian: { n: 1, best: 20 }, catfish: { n: 1, best: 40 } };
  assert.equal(L.dexCount(s), 5);
  assert.deepEqual(L.checkMilestones(s), ['cat']);
  assert.deepEqual(L.checkMilestones(s), []);
  const tue10 = new Date(2026, 9, 27, 10, 0);
  assert.ok(!L.availableFish(tue10, s, noSeason(tue10)).some((f) => f.id === 'koi'));
  s.dex.crops.gold = 1;
  assert.deepEqual(L.checkMilestones(s), ['koi']);
  assert.ok(L.availableFish(tue10, s, noSeason(tue10)).some((f) => f.id === 'koi'));
  assert.equal(L.rollFish(tue10, seq(0.999, 0.5), s, noSeason(tue10)).id, 'koi');
  s.dex.crops.melon = 1;
  s.dex.fish.carp = { n: 1, best: 50 };
  assert.deepEqual(L.checkMilestones(s), ['lantern']);
  s.dex.fish.lunch = { n: 1, best: 20 }; s.dex.fish.tuna = { n: 1, best: 100 }; s.dex.fish.koi = { n: 1, best: 60 };
  assert.equal(L.dexCount(s), L.DEX_TOTAL);
  assert.deepEqual(L.checkMilestones(s), ['boat']);
  const back = L.decode(L.encode(s));
  assert.deepEqual(back.ms, { cat: true, koi: true, lantern: true, boat: true });
});

// ---------- stage 1: save v2, basket, orders, crops, cooking ----------

test('v1 save from the old format survives decode with every value intact', () => {
  // exactly what the old newState/encode wrote: v:1, no basket/orders/rep fields
  const emptyP = () => ({ crop: null, progress: 0, t: 0, yieldMul: 1, weed: false, crow: null, fert: false, last: null });
  const plots = Array.from({ length: 8 }, emptyP);
  plots[0] = { crop: 'melon', progress: 600e3, t: 7e5, yieldMul: 0.7, weed: false, crow: null, fert: true, last: null };
  plots[3] = { crop: 'radish', progress: 30e3, t: 7e5, yieldMul: 1, weed: true, crow: { until: 8e5 }, fert: false, last: null };
  plots[5].last = { crop: 'berry', t: 6e5 };
  const v1 = {
    v: 1, coins: 12345, sel: 'berry', plots, seeds: { gold: 2 },
    up: { rod: 2, bait: 1, field: 1, scare: 3 }, items: { fert: 4 }, ms: { cat: true, lantern: true, koi: true },
    nextEventAt: 9e5, fish: { phase: 'idle' },
    dex: { crops: { radish: 40, berry: 9, melon: 3, gold: 1 },
      fish: { minnow: { n: 12, best: 13.2 }, crucian: { n: 7, best: 30.1 }, catfish: { n: 2, best: 55 }, koi: { n: 1, best: 77.7 } },
      goldSeed: true },
    savedAt: 8.5e5
  };
  const s = L.decode(JSON.stringify(v1));
  assert.ok(s);
  assert.equal(s.coins, 12345);
  assert.equal(s.sel, 'berry');
  assert.deepEqual(s.up, { rod: 2, bait: 1, field: 1, scare: 3, basket: 0 });
  assert.deepEqual(s.items, { fert: 4 });
  assert.deepEqual(s.ms, { cat: true, lantern: true, koi: true });
  assert.deepEqual(s.seeds, { gold: 2 });
  assert.equal(s.nextEventAt, 9e5);
  assert.equal(s.savedAt, 8.5e5);
  assert.equal(s.plots.length, 8);
  assert.deepEqual(s.plots, plots);
  assert.deepEqual(s.dex.crops, v1.dex.crops);
  assert.deepEqual(s.dex.fish, v1.dex.fish);
  assert.equal(s.dex.goldSeed, true);
  // new fields get defaults
  assert.equal(s.v, 2);
  assert.deepEqual(s.bag, []);
  assert.equal(s.rep, 0);
  assert.deepEqual(s.seedOk, {});
  assert.equal(s.pot, null);
  assert.deepEqual(s.dex.dish, {});
  assert.equal(s.orders.length, L.ORDER_SLOTS);
  // decode → encode → decode is stable
  assert.deepEqual(L.decode(L.encode(s)), s);
  // boat still needs the original 11, not the larger 도감
  assert.equal(L.DEX_TOTAL, 11);
  assert.ok(L.DEX_ALL > L.DEX_TOTAL);
});

test('v2 round-trip keeps basket, orders, pot, rep, unlocked seeds, dishes', () => {
  const s = L.newState(0, seq(0.5));
  s.coins = 999; s.rep = 7; s.seedOk = { potato: true, pepper: true };
  s.bag = [{ id: 'radish', v: 30 }, { id: 'crucian', v: 31 }, { id: 'maeuntang', v: 300 }];
  s.orders[0] = { o: { id: 'radish', n: 4, reward: 222, rep: 1 }, at: 0 };
  s.orders[1] = { o: { id: 'carp', n: 1, reward: 600, rep: 3, special: true }, at: 0 };
  s.orders[2] = { o: null, at: 123456 };
  s.pot = { id: 'jam', until: 5e5 };
  s.dex.dish = { maeuntang: 2 };
  const back = L.decode(L.encode(s));
  assert.deepEqual(back, s);
  // junk entries are dropped, not fatal
  const j = JSON.parse(L.encode(s));
  j.bag.push({ id: 'banana', v: 3 }); j.orders[0].o.id = 'banana'; j.pot.id = 'nope';
  const b2 = L.decode(JSON.stringify(j));
  assert.equal(b2.bag.length, 3);
  assert.equal(b2.orders[0].o, null);
  assert.equal(b2.pot, null);
});

test('boat milestone stays pinned to the original 11 entries', () => {
  const s = L.newState(0, seq(0.5));
  // 11 entries but some are new crops: not the boat
  s.dex.crops = { radish: 1, berry: 1, melon: 1, potato: 1, pepper: 1, tomato: 1 };
  s.dex.fish = { minnow: { n: 1, best: 8 }, crucian: { n: 1, best: 20 }, catfish: { n: 1, best: 40 }, carp: { n: 1, best: 50 }, lunch: { n: 1, best: 20 } };
  assert.equal(L.dexCount(s), 11);
  assert.ok(!L.checkMilestones(s).includes('boat'));
  s.dex.crops.gold = 1; s.dex.fish.tuna = { n: 1, best: 100 }; s.dex.fish.koi = { n: 1, best: 60 };
  assert.ok(L.checkMilestones(s).includes('boat'));
});

test('harvest and catch go to the basket; overflow sells at once', () => {
  const s = L.newState(0, seq(0.5));
  s.coins = 1000;
  for (let i = 0; i < 6; i++) L.plant(s, i, 'radish', 0);
  const before = s.coins;
  L.advance(s, 3 * MIN);
  const h = L.harvest(s, 0, 3 * MIN, seq(0.9));
  assert.equal(h.sold, 0);
  assert.equal(s.coins, before);
  assert.deepEqual(s.bag, [{ id: 'radish', v: 30 }]);
  // fill to capacity, then the next item is sold on the spot
  while (s.bag.length < L.bagCap(s)) L.bagAdd(s, 'minnow', 10);
  const out = L.landFish(s, { id: 'crucian', size: 23 });
  assert.equal(out.sold, out.coins);
  assert.equal(s.coins, before + out.coins);
  assert.equal(s.bag.length, 12);
  // sell all empties the basket
  const total = L.sellAll(s);
  assert.equal(total, 30 + 11 * 10);
  assert.equal(s.bag.length, 0);
  // bigger basket from the shop: 12 → 20 → 30
  s.coins = 10000;
  assert.equal(L.buy(s, 'basket'), true); assert.equal(L.bagCap(s), 20);
  assert.equal(L.buy(s, 'basket'), true); assert.equal(L.bagCap(s), 30);
  assert.equal(L.buy(s, 'basket'), false);
});

test('order delivery pays 1.5–2.5× market plus ★, slot refills 20–40 min later', () => {
  const s = L.newState(0, seq(0.5));
  assert.equal(L.refreshOrders(s, 0, seq(0.5)), 3);
  assert.ok(s.orders.every((q) => q.o));
  s.orders[0].o = { id: 'radish', n: 3, reward: L.CROPS.radish.sell * 3 * 2, rep: 1 };
  assert.equal(L.deliver(s, 0, 1000, seq(0)), null);           // empty basket
  L.bagAdd(s, 'radish', 30); L.bagAdd(s, 'radish', 30); L.bagAdd(s, 'radish', 30); L.bagAdd(s, 'potato', 60);
  const coins = s.coins;
  const r = L.deliver(s, 0, 1000, seq(0.5));
  assert.equal(r.coins, 180);
  assert.equal(s.coins, coins + 180);
  assert.equal(s.rep, 1);
  assert.deepEqual(s.bag, [{ id: 'potato', v: 60 }]);
  assert.deepEqual(r.unlocked, ['potato']);                    // ★1 opens potato seeds
  assert.equal(s.orders[0].o, null);
  assert.equal(s.orders[0].at, 1000 + L.REFILL_MIN + 0.5 * L.REFILL_SPAN);
  assert.equal(L.refreshOrders(s, 1000 + 19 * MIN, seq(0.5)), 0);
  assert.equal(L.refreshOrders(s, 1000 + 30 * MIN, seq(0.5)), 1);   // also works after being away
  // generated rewards sit between 1.5× and 2.5× market for normal orders
  for (let k = 0; k < 200; k++) {
    const o = L.genOrder(s, seq((k * 0.137) % 1, (k * 0.311) % 1, (k * 0.71) % 1, (k * 0.53) % 1));
    const m = o.reward / (L.itemInfo(o.id).price * o.n);
    if (o.special) assert.ok(m >= 2.99 && m <= 4.01, `special ${m}`);
    else assert.ok(m >= 1.49 && m <= 2.51, `normal ${m}`);
  }
});

test('discard has no penalty: a new order comes in 1–2 min', () => {
  const s = L.newState(0, seq(0.5));
  L.refreshOrders(s, 0, seq(0.5));
  assert.equal(L.discard(s, 1, 5000, seq(0.25)), true);
  assert.equal(s.orders[1].o, null);
  assert.equal(s.orders[1].at, 5000 + L.SKIP_MIN + 0.25 * L.SKIP_SPAN);
  assert.ok(L.SKIP_MIN === MIN && L.SKIP_MIN + L.SKIP_SPAN === 2 * MIN);
  assert.equal(L.discard(s, 1, 5001, seq(0)), false);            // nothing to drop
  assert.equal(L.refreshOrders(s, 5000 + 59e3, seq(0.5)), 0);
  assert.equal(L.refreshOrders(s, 5000 + 2 * MIN, seq(0.5)), 1);
  // discard again right away is fine: no cooldown
  assert.equal(L.discard(s, 1, 5000 + 2 * MIN, seq(0)), true);
  assert.equal(s.coins, 60);
  assert.equal(s.rep, 0);
});

test('orders only ask for unlocked things; special orders are rarer and bigger', () => {
  const rngs = (k) => seq((k * 0.6180339) % 1, (k * 0.4142) % 1, (k * 0.7320508) % 1, (k * 0.2360679) % 1);
  const s = L.newState(0, seq(0.5));
  const seen = new Set();
  for (let k = 0; k < 400; k++) { const o = L.genOrder(s, rngs(k)); if (!o.special) seen.add(o.id); }
  assert.deepEqual([...seen].sort(), ['berry', 'crucian', 'melon', 'minnow', 'radish']);
  // specials on a fresh save are rarer pond fish (no dish cooked yet), never koi without the milestone
  for (let k = 0; k < 400; k++) {
    const o = L.genOrder(s, seq(0.01, (k * 0.37) % 1, 0.5, 0.5));
    assert.equal(o.special, true);
    assert.equal(o.rep, 3);
    assert.ok(['catfish', 'carp', 'lunch', 'tuna'].includes(o.id), o.id);
  }
  // unlock potato, catch a catfish, cook stew: they join the pool
  s.seedOk.potato = true; s.dex.fish.catfish = { n: 1, best: 40 }; s.dex.dish.maeuntang = 1;
  s.seedOk.pepper = true;
  for (let k = 0; k < 600; k++) { const o = L.genOrder(s, rngs(k)); if (!o.special) seen.add(o.id); }
  for (const id of ['potato', 'catfish', 'maeuntang', 'pepper']) assert.ok(seen.has(id), id);
  for (const id of seen) assert.ok(!['tomato', 'corn', 'pumpkin', 'gold', 'koi', 'tuna', 'lunch', 'carp', 'jam'].includes(id), id);
  // two dishes as a special
  const sp = L.genOrder(s, seq(0.01, 0.999, 0.5, 0.5));
  assert.equal(sp.special, true);
  assert.equal(sp.id, 'maeuntang');
  assert.equal(sp.n, 2);
});

test('recipe consumes ingredients and produces a dish after its cook time', () => {
  const s = L.newState(0, seq(0.5));
  assert.equal(L.canCook(s, 'maeuntang'), false);
  L.bagAdd(s, 'crucian', 25); L.bagAdd(s, 'crucian', 40); L.bagAdd(s, 'pepper', 110); L.bagAdd(s, 'radish', 30); L.bagAdd(s, 'berry', 160);
  assert.equal(L.cook(s, 'maeuntang', 1000), true);
  assert.deepEqual(s.bag, [{ id: 'crucian', v: 40 }, { id: 'berry', v: 160 }]);   // the cheaper crucian went in
  assert.equal(L.cook(s, 'jam', 1000), false);                  // pot busy (and only one berry)
  const cookMs = L.recipeById('maeuntang').time;
  assert.equal(L.takeDish(s, 1000 + cookMs - 1e3), null);
  const d = L.takeDish(s, 1000 + cookMs);
  assert.deepEqual(d, { id: 'maeuntang', first: true, sold: 0 });
  assert.equal(s.pot, null);
  assert.equal(L.bagCount(s, 'maeuntang'), 1);
  assert.equal(s.dex.dish.maeuntang, 1);
  // at least 5 recipes need nothing but crops and pond fish; milk/egg ones wait for animals
  const all = { rep: 99, seedOk: { potato: true, pepper: true, tomato: true, corn: true, pumpkin: true }, seeds: { gold: 1 }, ms: { koi: true }, dex: { crops: {} } };
  const ok = L.RECIPES.filter((r) => L.obtainable(all, r.id));
  assert.ok(ok.length >= 5);
  for (const id of ['cornsoup', 'hwachae', 'jeon']) assert.equal(L.obtainable(all, id), false);
  assert.equal(L.obtainable(Object.assign({ animals: { cow: 1, hen: 1 } }, all), 'jeon'), true);
  assert.ok(L.RECIPES.length >= 8);
  assert.ok(L.RECIPES.every((r) => r.need.length >= 2 && r.need.length <= 3 && r.time >= 60e3 && r.time <= 900e3));
  // dishes sell above the sum of their parts
  for (const r of L.RECIPES) assert.ok(r.sell > r.need.reduce((a, x) => a + L.itemInfo(x).price, 0), r.id);
});

test('new crops: locked until ★ or bought, then grow on their own timers', () => {
  const s = L.newState(0, seq(0.5));
  s.coins = 5000;
  assert.equal(L.plant(s, 0, 'tomato', 0), false);
  assert.equal(L.seedCost(s, 'tomato'), 1500);
  assert.equal(L.buySeed(s, 'tomato'), true);
  assert.equal(L.seedCost(s, 'tomato'), null);
  assert.equal(L.buySeed(s, 'tomato'), false);
  assert.equal(L.plant(s, 0, 'tomato', 0), true);
  s.rep = 24;
  assert.deepEqual(L.checkUnlocks(s), ['potato', 'pepper', 'corn', 'pumpkin']);
  assert.equal(L.plant(s, 1, 'pumpkin', 0), true);
  assert.equal(L.plant(s, 2, 'potato', 0), true);
  L.advance(s, 5 * MIN);
  assert.equal(L.isReady(s.plots[2]), true);
  assert.equal(L.isReady(s.plots[0]), false);
  L.advance(s, 20 * MIN);
  assert.equal(L.isReady(s.plots[0]), true);
  assert.equal(L.stage(s.plots[1]), 1);
  L.advance(s, 180 * MIN);
  assert.equal(L.harvest(s, 1, 180 * MIN, seq(0.9)).coins, 1000);
  const grows = L.SEEDS.map((id) => L.CROPS[id].grow);
  assert.ok(Math.min(...grows) <= 3 * MIN && Math.max(...grows) === 180 * MIN);
  assert.ok(L.SEEDS.length >= 8);
});

test('game clock: 1 day = 1 real hour, 1 season = 1 real week, weather per 40-min block', () => {
  const mon = Date.UTC(2026, 9, 26);                       // Monday 2026-10-26 00:00 UTC
  assert.equal(L.gameClock(mon, 0).phase, 'morning');
  assert.equal(L.gameClock(mon + 20 * 60e3, 0).phase, 'day');
  assert.equal(L.gameClock(mon + 40 * 60e3, 0).phase, 'evening');
  assert.equal(L.gameClock(mon + 50 * 60e3, 0).phase, 'night');
  assert.equal(L.gameClock(mon + 3600e3, 0).phase, 'morning');
  const s0 = L.gameClock(mon, 0).season, i = L.SEASONS.indexOf(s0);
  assert.equal(L.gameClock(mon + 6.9 * 86400e3, 0).season, s0);
  assert.equal(L.gameClock(mon + 7 * 86400e3, 0).season, L.SEASONS[(i + 1) % 4]);
  // KST: local Monday 00:00 = Sunday 15:00 UTC
  assert.equal(L.gameClock(mon - 9 * 3600e3, 540).season, s0);
  assert.equal(L.gameClock(mon - 9 * 3600e3 - 1, 540).season, L.SEASONS[(i + 3) % 4]);
  // months: 3 per season, looping 1..12
  const months = [];
  for (let d = 0; d < 28; d++) months.push(L.gameClock(mon + d * 86400e3 + 3600e3, 0).month);
  assert.deepEqual([...new Set(months)].length, 12);
  assert.ok(months.every(m => m >= 1 && m <= 12));
  assert.equal(L.gameClock(mon, 0).year, undefined);
  const seen = {};
  for (let k = 0; k < 2000; k++) {
    const t = mon + k * L.WEATHER_MS;
    assert.equal(L.weatherAt(t, 0), L.weatherAt(t + L.WEATHER_MS - 1, 0));
    const w = L.weatherAt(t, 0), se = L.gameClock(t, 0).season;
    if (se === 'winter') assert.notEqual(w, 'rain'); else assert.notEqual(w, 'snow');
    seen[w] = (seen[w] || 0) + 1;
  }
assert.ok(seen.clear > 800 && seen.rain > 300 && seen.fog > 150 && seen.snow > 80, JSON.stringify(seen));
});
