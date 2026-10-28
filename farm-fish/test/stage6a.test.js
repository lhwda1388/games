// farm-fish/test/stage6a.test.js — stage 6A: 과수원, 양봉, 곤충 채집
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = require('../build.js').build();
vm.runInThisContext(html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1], { filename: 'logic.js' });
const L = globalThis.Logic;
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const DAY = 86400e3, WEEK = 7 * DAY, HOUR = 3600e3;
const env = (season, phase, weather) => ({ season, phase: phase || 'day', weather: weather || 'clear' });
// first local Monday 00:00 of a spring week (UTC): game seasons cycle spring → summer → autumn → winter by week
const MON0 = 4 * DAY;
const springAt = (n) => MON0 + 4 * WEEK * (n || 100);
const seasonStart = (se) => springAt() + L.SEASONS.indexOf(se) * WEEK;

function orchardState() {
  const s = L.newState(0, seq(0.5));
  s.rep = L.ORCHARD_REP; s.coins = 1e6;
  assert.equal(L.unlockOrchard(s).ok, true);
  return s;
}

test('content counts and unique ids that clash with no other item', () => {
  assert.ok(L.TREES.length >= 6 && L.HONEYS.length >= 8 && L.BUGS.length >= 20);
  const ids = new Set();
  const other = (id) => L.CROPS[id] || L.FISH.some((f) => f.id === id) || L.PRODUCTS[id] || L.forageById(id) || L.RECIPES.some((r) => r.id === id);
  for (const x of [...L.TREES, ...L.HONEYS, ...L.BUGS]) {
    assert.ok(!ids.has(x.id), 'dup ' + x.id); ids.add(x.id);
    assert.ok(!other(x.id), 'clash ' + x.id);
    assert.ok(x.name && x.hint && x.price > 0, x.id);
  }
  L.TREES.forEach((t) => { assert.equal(L.itemInfo(t.id).kind, 'fruit'); assert.ok(L.honeyById(t.honey)); });
  L.HONEYS.forEach((h) => assert.equal(L.itemInfo(h.id).kind, 'honey'));
  L.BUGS.forEach((b) => { assert.equal(L.itemInfo(b.id), null); assert.ok(L.BUG_W[b.rarity] && b.at.every((p) => L.BUG_PLACES[p])); });
  for (const se of L.SEASONS) assert.ok(L.TREES.some((t) => t.fruit === se), 'fruit in ' + se);
  // new recipes: real ingredients, dishes worth more than their parts
  L.ORCHARD_RECIPES.forEach((r) => { assert.ok(r.need.every((x) => L.itemInfo(x))); assert.ok(r.sell > r.need.reduce((a, x) => a + L.itemInfo(x).price, 0)); });
});

test('orchard: ★ + coins to open, sapling grows over real days, fruits only in season, never dies', () => {
  const s = L.newState(0, seq(0.5));
  s.coins = 1e6;
  assert.equal(L.unlockOrchard(s).why, 'rep');
  s.rep = L.ORCHARD_REP; s.coins = L.ORCHARD_COST - 1;
  assert.equal(L.unlockOrchard(s).why, 'coins');
  s.coins = 1e6;
  assert.equal(L.unlockOrchard(s).ok, true);
  const t0 = seasonStart('summer') - 3 * DAY;           // apple: blooms spring, fruits autumn, grows in 3 days
  assert.equal(L.plantTree(s, 0, 'apple', t0).ok, true);
  assert.equal(L.plantTree(s, 0, 'pear', t0).why, 'owned');
  assert.equal(L.treeStage(s.orchard.trees[0], t0), 0);
  assert.equal(L.treeStage(s.orchard.trees[0], t0 + 1.5 * DAY), 1);
  assert.equal(L.treeStage(s.orchard.trees[0], t0 + 3 * DAY), 2);
  // grown all summer: no apples
  L.orchardTick(s, seasonStart('autumn'), 0);
  assert.equal(s.orchard.trees[0].n, 0);
  // autumn: one fruit every FRUIT_EVERY, capped
  L.orchardTick(s, seasonStart('autumn') + L.FRUIT_EVERY * 2 + 1000, 0);
  assert.equal(s.orchard.trees[0].n, 2);
  const r = L.pickFruit(s, 0, seasonStart('autumn') + L.FRUIT_EVERY * 2 + 2000, 0);
  assert.deepEqual([r.id, r.n], ['apple', 2]);
  assert.equal(L.bagCount(s, 'apple'), 2);
  assert.equal(s.orchard.dex.apple, 2);
  assert.equal(L.pickFruit(s, 0, seasonStart('autumn') + L.FRUIT_EVERY * 2 + 3000, 0), null);
  // away for a month (offline): fills to the cap and waits, the tree is still there
  L.orchardTick(s, seasonStart('autumn') + 30 * DAY, 0);
  assert.equal(s.orchard.trees[0].n, L.TREE_CAP);
  assert.equal(s.orchard.trees[0].id, 'apple');
});

test('offline fruit counts only the in-season part of the time away', () => {
  const s = orchardState();
  const t0 = seasonStart('spring') - 10 * DAY;
  L.plantTree(s, 1, 'maesil', t0);                       // fruits in spring, grown after 1 day
  // last look 1 hour before spring ends, next look a week later: only that hour counts
  s.orchard.trees[1].t = seasonStart('summer') - HOUR;
  L.orchardTick(s, seasonStart('summer') + 6 * DAY, 0);
  assert.equal(s.orchard.trees[1].n, 0);
  assert.equal(s.orchard.trees[1].acc, HOUR);
  assert.equal(L.seasonMs(seasonStart('spring') - DAY, seasonStart('summer') + DAY, 'spring', 0), WEEK);
});

test('honey type follows the flowers around the hive', () => {
  const s = orchardState(), now = seasonStart('spring');
  const ids = (se, t) => L.honeySources(s, se, t || now).map((x) => x.id).sort();
  assert.deepEqual(ids('spring'), ['wildhoney']);
  // crop flowers: radish in spring → 유채꿀; summer squash flowers → 호박꽃꿀
  s.plots[0].crop = 'radish';
  assert.ok(ids('spring').includes('rapehoney'));
  assert.ok(!ids('summer').includes('rapehoney'));
  s.plots[1].crop = 'melon';
  assert.ok(ids('summer').includes('pumpkinhoney'));
  // yard flower bed (not in winter)
  L.yardOf(s).deco.flowers = true; L.placeItem(s, 'deco', 'flowers');
  assert.ok(ids('spring').includes('flowerbed') && !ids('winter').includes('flowerbed'));
  // forest flowers by season
  s.forest = { spots: [], dex: {}, n: 0 };
  assert.ok(ids('spring').includes('acacia') && ids('summer').includes('chestnuthoney') && ids('autumn').includes('asterhoney') && ids('winter').includes('camelliahoney'));
  // orchard blossoms only from grown trees in their bloom season
  L.plantTree(s, 0, 'apple', now - 10 * DAY);
  L.plantTree(s, 1, 'yuja', now);
  assert.ok(ids('spring').includes('appleblossom'));
  assert.ok(!ids('summer').includes('citrus'));
  assert.ok(ids('summer', now + 5 * DAY).includes('citrus'));
});

test('hives: bought in order, fill by time (offline), winter is slower, honey rolled by season of each jar', () => {
  const s = orchardState(), t0 = seasonStart('winter') - L.HIVE_EVERY - 1000;
  s.forest = { spots: [], dex: {}, n: 0 };
  assert.equal(L.hiveCost(s), L.HIVE_COSTS[0]);
  assert.equal(L.buyHive(s, t0).ok, true);
  // first jar fills at the end of autumn; the next one is made in winter, and winter jars take twice as long
  const last = () => s.bees.hives[0].jar[s.bees.hives[0].jar.length - 1];
  const rng = seq(0.99);                                  // the last source: the forest one for that season
  L.hiveTick(s, t0 + L.HIVE_EVERY - 1, 0, rng);
  assert.equal(s.bees.hives[0].jar.length, 0);
  L.hiveTick(s, t0 + L.HIVE_EVERY, 0, rng);
  assert.equal(s.bees.hives[0].jar.length, 1);
  assert.equal(last(), 'asterhoney');
  L.hiveTick(s, t0 + L.HIVE_EVERY * 2, 0, rng);
  assert.equal(s.bees.hives[0].jar.length, 2);
  assert.equal(last(), 'camelliahoney');
  L.hiveTick(s, t0 + L.HIVE_EVERY * 3, 0, rng);
  assert.equal(s.bees.hives[0].jar.length, 2);
  L.hiveTick(s, t0 + L.HIVE_EVERY * 4, 0, rng);
  assert.equal(s.bees.hives[0].jar.length, 3);
  // a month away: full, no more
  L.hiveTick(s, t0 + 30 * DAY, 0, rng);
  assert.equal(L.honeyWaiting(s), L.HIVE_CAP);
  const c = L.collectHoney(s, 0, t0 + 30 * DAY, 0, rng);
  assert.equal(c.items.length, L.HIVE_CAP);
  assert.ok(c.first.includes('asterhoney'));
  assert.equal(L.honeyDexCount(s), new Set(c.items).size);
  assert.equal(L.honeyWaiting(s), 0);
  L.buyHive(s, 0); L.buyHive(s, 0);
  assert.equal(L.buyHive(s, 0).why, 'max');
  // 잡화꿀 joins the order pool once collected
  s.bees.dex.wildhoney = 1;
  assert.ok(L.orderPool(s, false).some((e) => e.id === 'wildhoney'));
  assert.ok(!L.orderPool(s, false).some((e) => L.treeById(e.id)));
});

test('insects: pools by season, time, weather and place; every season has some', () => {
  const ids = (pl, e) => L.bugPool(pl, e).map((x) => x.id);
  assert.ok(ids('farm', env('summer')).includes('dragonfly'));
  assert.ok(!ids('forest', env('summer')).includes('dragonfly'));
  assert.ok(!ids('farm', env('summer', 'day', 'rain')).includes('dragonfly'));
  assert.ok(ids('farm', env('summer', 'day', 'rain')).includes('divingbeetle'));
  assert.ok(ids('forest', env('summer', 'night')).includes('stagbeetle'));
  assert.ok(!ids('forest', env('summer', 'day')).includes('stagbeetle'));
  assert.ok(ids('yard', env('autumn', 'night')).includes('cricket'));
  assert.ok(ids('forest', env('summer', 'day', 'clear')).includes('jewelbeetle'));
  assert.ok(!ids('forest', env('summer', 'day', 'fog')).includes('jewelbeetle'));
  assert.ok(ids('farm', env('spring', 'morning', 'fog')).includes('mayfly'));
  assert.ok(ids('yard', env('winter', 'day', 'snow')).includes('springtail'));
  for (const se of L.SEASONS) assert.ok(['farm', 'yard', 'forest', 'orchard'].some((p) => ids(p, env(se, 'day', se === 'winter' ? 'snow' : 'clear')).length), se);
  for (const p of Object.keys(L.BUG_PLACES)) assert.ok(L.BUGS.some((b) => b.at.includes(p)), p);
  assert.equal(L.rollBug('farm', env('winter', 'night', 'clear'), seq(0.5)), null);
});

test('first-meet boost for uncaught insects, gone once caught', () => {
  const s = L.newState(0, seq(0.5));
  s.coins = 1e4;
  const b = L.bugById('stagbeetle'), e = env('summer', 'night');
  assert.equal(L.bugWeight(b, 'forest', e, s), L.BUG_W['희귀']);   // no net yet: no boost
  assert.equal(L.buyNet(s).ok, true);
  assert.equal(L.buyNet(s).why, 'owned');
  assert.equal(L.bugWeight(b, 'forest', e, s), L.BUG_W['희귀'] * 2.5);
  L.catchBug(s, 'stagbeetle');
  assert.equal(L.bugWeight(b, 'forest', e, s), L.BUG_W['희귀']);
});

test('catch timing: only while it sits (plus a little grace); position follows the flight', () => {
  const fl = L.bugFlight('cabbagewhite', 1000, seq(0.3, 0.7, 0.1, 0.9, 0.5));
  assert.equal(fl.stops.length, 5);
  fl.stops.forEach((st, k) => {
    assert.equal(L.bugJudge(fl, st.t0), 'catch');
    assert.equal(L.bugJudge(fl, Math.round((st.t0 + st.t1) / 2)), 'catch');
    assert.equal(L.bugJudge(fl, st.t1 + L.BUG_GRACE), 'catch');
    assert.equal(L.bugJudge(fl, st.t0 - 50), 'miss');
    assert.equal(L.bugJudge(fl, st.t1 + L.BUG_GRACE + 50), 'miss');
    const p = L.bugPos(fl, st.t0 + 10);
    assert.deepEqual([p.x, p.y, p.sit], [st.x, st.y, true]);
    if (k) assert.equal(L.bugPos(fl, st.t0 - 200).sit, false);
    assert.ok(st.x >= 0 && st.x <= 180 && st.y >= 30 && st.y <= 190);
  });
  assert.equal(L.bugPos(fl, fl.end + 1), null);
  // rarer insects sit for less time
  const rare = L.bugFlight('jewelbeetle', 0, seq(0.5)), com = L.bugFlight('ant', 0, seq(0.5));
  assert.ok(rare.stops[0].t1 - rare.stops[0].t0 < com.stops[0].t1 - com.stops[0].t0);
});

test('release pays a little, a specimen goes in the box once and brings the 표본 상자', () => {
  const s = L.newState(0, seq(0.5));
  s.coins = 600;
  assert.equal(L.catchBug(s, 'ant'), null);                // no net
  L.buyNet(s);
  assert.equal(s.coins, 0);
  assert.equal(L.catchBug(s, 'cicada').first, true);
  assert.equal(L.releaseBug(s, 'cicada'), L.bugById('cicada').price);
  assert.equal(s.coins, L.bugById('cicada').price);
  assert.equal(L.catchBug(s, 'cicada').first, false);
  const k = L.keepBug(s, 'cicada');
  assert.deepEqual([k.ok, k.gift], [true, true]);
  assert.equal(s.yard.furn.bugbox, true);
  assert.ok(L.furnPlaced(s, 'bugbox'));
  assert.equal(L.keepBug(s, 'cicada').ok, false);
  assert.equal(L.keepBug(s, 'ant').gift, false);
  assert.deepEqual(L.boxList(s), ['ant', 'cicada']);
  assert.equal(L.bugDexCount(s), 1);
});

test('save round-trip keeps orchard, hives and insects; junk is dropped; old saves load without them', () => {
  const s = orchardState(), t = seasonStart('autumn');
  L.plantTree(s, 3, 'persimmon', t - 5 * DAY);
  L.orchardTick(s, t + L.FRUIT_EVERY + 1, 0);
  s.orchard.dex.apple = 4;
  L.buyHive(s, t); s.bees.hives[0].jar = ['wildhoney', 'acacia']; s.bees.dex = { wildhoney: 3, citrus: 1 };
  L.buyNet(s); L.catchBug(s, 'mantis'); L.keepBug(s, 'mantis'); L.releaseBug(s, 'mantis');
  const back = L.decode(L.encode(s));
  assert.deepEqual(back.orchard, s.orchard);
  assert.deepEqual(back.bees, s.bees);
  assert.deepEqual(back.bugs, s.bugs);
  assert.equal(back.yard.furn.bugbox, true);
  assert.deepEqual(L.decode(L.encode(back)).orchard, back.orchard);
  // bad values are cleaned, not fatal
  const o = JSON.parse(L.encode(s));
  o.orchard.trees[0] = { id: 'banana', at: 1 }; o.orchard.trees[3].n = 99;
  o.bees.hives[0].jar = ['acacia', 'nope']; o.bugs.dex.nope = 5; o.bugs.box.nope = true;
  const d = L.decode(JSON.stringify(o));
  assert.equal(d.orchard.trees[0], null);
  assert.equal(d.orchard.trees[3].n, L.TREE_CAP);
  assert.deepEqual(d.bees.hives[0].jar, ['acacia']);
  assert.equal(d.bugs.dex.nope, undefined);
  // every released save still loads; ones from before stage 6A get none of the new fields
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8'), o = JSON.parse(raw), x = L.decode(raw);
    assert.ok(x, f);
    for (const k of ['orchard', 'bees', 'bugs']) if (o[k] === undefined) assert.equal(x[k], undefined, f + ': ' + k);
  }
  // a v1 save (stage 1 shape)
  const v1 = JSON.stringify({ v: 1, coins: 77, plots: Array.from({ length: 6 }, () => ({ crop: null })) });
  const one = L.decode(v1);
  assert.equal(one.coins, 77);
  assert.equal(one.orchard, undefined);
});

test('옮겨 심기: pulling a tree up frees the spot, gives the sapling price back and keeps its ripe fruit', () => {
  const s = orchardState(), t = seasonStart('autumn');
  L.plantTree(s, 0, 'apple', t - 5 * DAY);
  L.plantTree(s, 1, 'apple', t - 5 * DAY);            // a duplicate: the spot would be stuck without a way out
  L.orchardTick(s, t + L.FRUIT_EVERY + 1, 0);
  const c0 = s.coins, n0 = s.bag.length;
  const r = L.uprootTree(s, 1, t + L.FRUIT_EVERY + 2, 0);
  assert.deepEqual([r.id, r.coins, r.fruit.n], ['apple', L.treeById('apple').cost, 1]);
  assert.equal(s.coins, c0 + L.treeById('apple').cost);
  assert.equal(s.bag.length, n0 + 1);
  assert.equal(s.orchard.trees[1], null);
  assert.equal(L.uprootTree(s, 1, t, 0), null);
  assert.equal(L.plantTree(s, 1, 'pear', t).ok, true);  // the spot takes another kind
  // a sapling with nothing on it: just the price back
  const r2 = L.uprootTree(s, 1, t + 1, 0);
  assert.deepEqual([r2.coins, r2.fruit], [L.treeById('pear').cost, null]);
});

test('insects sit about 0.9–1.6 s and take taps in a generous radius', () => {
  assert.ok(L.BUG_HIT >= 16);
  for (const b of L.BUGS) {
    const fl = L.bugFlight(b.id, 0, Math.random);
    fl.stops.forEach((st) => { const d = st.t1 - st.t0; assert.ok(d >= 800 && d <= 1650, b.id + ' ' + d); });
  }
});
