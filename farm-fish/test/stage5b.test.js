// farm-fish/test/stage5b.test.js — stage 5B: 낚시 잡동사니·보물 상자·병 편지, 계절 축제, 선택 미니게임 (자물쇠·불 조절)
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
// small deterministic rng
const lcg = (seed) => { let x = seed >>> 0; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; };
const plot = () => ({ crop: null, progress: 0, t: 0, yieldMul: 1, weed: false, crow: null, fert: false, last: null });
const HOUR = 3600e3, DAY = 86400e3, WEEK = 7 * DAY, KST = 540;

// a save as the build before stage 5B wrote it: stage-4 fields, no junk / fest
function preSave() {
  const s = L.newState(0, seq(0.5));
  s.coins = 7777; s.rep = 30;
  s.bag = [{ id: 'crucian', v: 30 }, { id: 'jam', v: 480 }];
  s.dex.fish.crucian = { n: 4, best: 28.5 }; s.dex.crops.radish = 9; s.dex.dish.jam = 2;
  L.yardOf(s); s.yard.house = 2; s.yard.deco.flowers = true; s.yard.place.deco.flowers = 4; s.yard.deco.bench = true; s.yard.place.deco.bench = 6;
  s.born = 1e12; L.befriend(s, { id: 'radish', n: 3, reward: 90, rep: 1 });
  return s;
}

test('junk: only common bites can turn into junk, at JUNK_CHANCE; never a rare, legend, festival or egg fish', () => {
  assert.equal(L.rollJunk({ id: 'carp', size: 50 }, seq(0)), null);
  assert.equal(L.rollJunk({ id: 'tuna', size: 100 }, seq(0)), null);
  assert.equal(L.rollJunk({ id: 'blossomcarp', size: 20 }, seq(0)), null);
  assert.equal(L.rollJunk({ id: 'minnow', size: 10 }, seq(0.5)), null);            // 0.5 ≥ chance
  assert.ok(L.JUNK.some((j) => j.id === L.rollJunk({ id: 'minnow', size: 10 }, seq(0, 0.5))));
  const rng = lcg(7), N = 40000, by = {};
  let n = 0;
  for (let k = 0; k < N; k++) { const id = L.rollJunk({ id: 'crucian', size: 20 }, rng); if (id) { n++; by[id] = (by[id] || 0) + 1; } }
  assert.ok(Math.abs(n / N - L.JUNK_CHANCE) < 0.01, String(n / N));
  const tot = L.JUNK.reduce((a, j) => a + j.w, 0);
  L.JUNK.forEach((j) => assert.ok(Math.abs(by[j.id] / n - j.w / tot) < 0.02, j.id));
  assert.ok(by.chest < by.letter && by.letter < by.can);
});

test('junk never enters the 도감, fish milestones, basket or tank; the line is idle again', () => {
  const s = L.newState(0, seq(0.5));
  s.fish = { phase: 'reel', x: 1, y: 1, roll: { id: 'minnow', size: 9 } };
  const before = { dex: JSON.stringify(s.dex), bag: s.bag.length, fish: L.fishDexCount(s), all: L.dexCount(s) };
  ['boot', 'can', 'bottle', 'key', 'letter', 'chest'].forEach((id) => L.landJunk(s, id, seq(0.3)));
  assert.equal(JSON.stringify(s.dex), before.dex);
  assert.equal(s.bag.length, before.bag); assert.equal(L.fishDexCount(s), before.fish); assert.equal(L.dexCount(s), before.all);
  assert.deepEqual(L.checkMilestones(s), []);
  assert.deepEqual(s.fish, { phase: 'idle' });
  L.JUNK.forEach((j) => { assert.equal(L.fishById(j.id), null); assert.equal(L.itemInfo(j.id), null); });
  assert.equal(L.junkCount(s, 'boot'), 1); assert.equal(s.junk.box, 1); assert.equal(s.junk.letters.length, 1);
  // 고물 sells for coins and empties the pile
  const c = s.coins, v = L.scrapValue(s);
  assert.equal(v, 15 + 10 + 20 + 60);
  assert.equal(L.sellScrap(s), v); assert.equal(s.coins, c + v); assert.equal(L.scrapValue(s), 0);
});

test('병 편지: 12 different letters before any repeat, then a few coins', () => {
  const s = L.newState(0, seq(0.5));
  const rng = lcg(3), got = [];
  for (let k = 0; k < L.BOTTLE_LETTERS.length; k++) { const o = L.landJunk(s, 'letter', rng); got.push(o.letter); assert.ok(!o.reread); }
  assert.equal(new Set(got).size, L.BOTTLE_LETTERS.length);
  assert.equal(L.BOTTLE_LETTERS.length, 12);
  assert.ok(L.BOTTLE_LETTERS.every((t) => typeof t === 'string' && t.length > 20));
  const c = s.coins, again = L.landJunk(s, 'letter', rng);
  assert.ok(again.reread); assert.equal(s.coins, c + L.LETTER_DUP_COINS); assert.equal(s.junk.letters.length, 12);
  // nextBottle only picks unfound ones, whatever the rng says
  const t = L.newState(0, seq(0.5)); L.junkOf(t).letters = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  assert.equal(L.nextBottle(t, seq(0)), 12); assert.equal(L.nextBottle(t, seq(0.999)), 12);
});

test('보물 상자: coins, gold seeds or a treasure decoration, never the same decoration twice', () => {
  const s = L.newState(0, seq(0.5));
  L.yardOf(s);
  L.junkOf(s).box = 10;
  assert.equal(L.openChest(L.newState(0, seq(0.5)), seq(0), 0), null);              // no box, nothing happens
  const a = L.openChest(s, seq(0, 0), 0);                                          // deco share
  const b = L.openChest(s, seq(0, 0), 0);
  assert.equal(a.kind, 'deco'); assert.equal(b.kind, 'deco'); assert.notEqual(a.id, b.id);
  assert.deepEqual(L.TREASURE_DECOS.slice().sort(), [a.id, b.id].sort());
  const c0 = s.coins, d = L.openChest(s, seq(0, 0.5), 0);                          // every one owned → coins
  assert.equal(d.kind, 'coins'); assert.equal(s.coins, c0 + d.coins); assert.ok(d.coins >= 300 && d.coins <= 700);
  const g = s.seeds.gold, e = L.openChest(s, seq(0.4), 0);
  assert.equal(e.kind, 'seed'); assert.equal(s.seeds.gold, g + 1);
  // 자물쇠 도전 success: twice the coins / two seeds
  const f = L.openChest(s, seq(0.9, 0.5), 1);
  assert.equal(f.kind, 'coins'); assert.equal(f.coins, 2 * d.coins);
  assert.equal(L.openChest(s, seq(0.6), 1).n, 2);
  assert.equal(s.junk.box, 4);                                     // 10 − 6 opened
  // treasure/junk/festival decorations are never sold in the shop and never "+" buyable spots
  L.DECOS.filter((x) => x.from).forEach((x) => assert.equal(L.buyDeco(L.newState(0, seq(0.5)), x.id).ok, false));
});

test('재활용: junk sets become decorations (once), two keys open a 보물 상자', () => {
  const s = L.newState(0, seq(0.5));
  L.yardOf(s);
  const j = L.junkOf(s);
  assert.equal(L.canRecycle(s, 'canchime'), 'need');
  j.n.can = 5; j.n.key = 2; j.n.bottle = 3;
  assert.equal(L.recycle(s, 'canchime').ok, true);
  assert.equal(s.yard.deco.canchime, true); assert.equal(j.n.can, 1);
  assert.equal(L.canRecycle(s, 'canchime'), 'owned');
  assert.equal(L.recycle(s, 'bottlelamp').ok, true); assert.equal(j.n.can, 0); assert.equal(j.n.bottle, 0);
  assert.deepEqual(L.recycle(s, 'chest'), { ok: true, box: true }); assert.equal(j.box, 1); assert.equal(j.n.key, 0);
  assert.equal(L.recycle(s, 'bootpot').ok, false);
});

test('festival windows: the Wednesday 10–18 local of each season week, deterministic per time zone', () => {
  // 2026-10-28 is a Wednesday
  const at = (h, m, tz) => Date.UTC(2026, 9, 28, h, m) - tz * 60e3;    // local wall clock h:m in tz
  for (const tz of [KST, 0, -300]) {
    assert.equal(L.festivalAt(at(9, 59, tz), tz), null);
    const w = L.festivalAt(at(10, 0, tz), tz);
    assert.ok(w); assert.equal(w.start, at(10, 0, tz)); assert.equal(w.end, at(18, 0, tz));
    assert.equal(w.id, L.gameClock(at(12, 0, tz), tz).season);
    assert.ok(L.festivalAt(at(17, 59, tz), tz));
    assert.equal(L.festivalAt(at(18, 0, tz), tz), null);
    assert.equal(L.festivalAt(at(12, 0, tz) - DAY, tz), null);          // Tuesday
    assert.equal(L.festivalAt(at(12, 0, tz) + DAY, tz), null);          // Thursday
    assert.equal(L.festivalId(at(12, 0, tz), tz), w.id);
    assert.deepEqual(L.festivalAt(at(12, 0, tz), tz), L.festivalAt(at(13, 0, tz), tz));
  }
  // KST: the window is 01:00–09:00 UTC
  assert.equal(L.festivalAt(Date.UTC(2026, 9, 28, 1, 0), KST).start, Date.UTC(2026, 9, 28, 1, 0));
  // four weeks hold all four festivals once; a missed one comes back 4 weeks later
  const t0 = at(19, 0, KST), ids = [];
  let w = L.nextFestival(t0, KST);
  assert.equal(w.start, at(10, 0, KST) + WEEK);
  for (let k = 0; k < 4; k++) { ids.push(w.id); w = L.nextFestival(w.end, KST); }
  assert.deepEqual(ids.slice().sort(), ['autumn', 'spring', 'summer', 'winter']);
  L.SEASONS.forEach((id) => {
    const a = L.festivalNextOf(id, t0, KST), b = L.festivalNextOf(id, a.end, KST);
    assert.equal(a.id, id); assert.equal(b.start - a.start, 4 * WEEK);
    assert.equal(L.gameClock(a.start, KST).season, id);
  });
  // while one is on, nextFestival is that one
  assert.equal(L.nextFestival(at(12, 0, KST), KST).start, at(10, 0, KST));
});

test('festival fish bite only during their festival and never come up as orders', () => {
  const s = L.newState(0, seq(0.5));
  const d = new Date(Date.UTC(2026, 9, 28, 3, 0));
  const ids = (env) => L.availableFish(d, s, env).map((f) => f.id);
  const env = { phase: 'night', weather: 'clear', season: 'autumn' };
  assert.ok(!ids(env).includes('moonfish'));
  assert.ok(ids({ ...env, festival: 'autumn' }).includes('moonfish'));
  assert.ok(!ids({ ...env, festival: 'spring' }).includes('moonfish'));
  assert.ok(!ids({ ...env, phase: 'day', festival: 'autumn' }).includes('moonfish'));    // 달빛 잉어: night only
  assert.ok(ids({ ...env, phase: 'day', festival: 'spring' }).includes('blossomcarp'));
  // fishEnv works the festival out from the clock
  assert.equal(L.fishEnv(Date.UTC(2026, 9, 28, 3, 0), KST).festival, L.festivalId(Date.UTC(2026, 9, 28, 3, 0), KST));
  assert.equal(L.fishEnv(Date.UTC(2026, 9, 27, 3, 0), KST).festival, null);
  // caught festival fish stay off the board, even while the festival is on
  const fest = L.FISH.filter((f) => f.fest);
  assert.equal(fest.length, 4);
  fest.forEach((f) => { s.dex.fish[f.id] = { n: 1, best: 10 }; });
  s.rep = 99; L.festOf(s).on = 'spring';
  const seen = new Set();
  for (let k = 0; k < 1500; k++) seen.add(L.genOrder(s, seq((k * 0.618) % 1, (k * 0.414) % 1, 0.3, 0.7)).id);
  fest.forEach((f) => assert.ok(!seen.has(f.id), f.id));
});

test('축제 선물: only during a festival, once per festival day; deco first, coins after; 송편 learned in autumn', () => {
  const s = L.newState(0, seq(0.5));
  L.yardOf(s);
  const t = Date.UTC(2026, 9, 28, 3, 0), w = L.festivalAt(t, KST);
  assert.equal(L.festClaim(s, null), null);
  assert.equal(L.festClaim(s, L.festivalAt(t + DAY, KST)), null);      // Thursday: nothing
  const aut = L.festivalNextOf('autumn', t, KST);
  const r = L.recipeById('songpyeon');
  assert.equal(L.recipeKnown(s, r), false);
  assert.equal(L.obtainable(s, 'songpyeon'), false);
  const c1 = L.festClaim(s, aut);
  assert.equal(c1.deco, 'moonrabbit'); assert.equal(c1.recipe, 'songpyeon');
  assert.equal(s.yard.deco.moonrabbit, true); assert.equal(L.recipeKnown(s, r), true);
  assert.equal(L.festClaimable(s, aut), false); assert.equal(L.festClaim(s, aut), null);
  const next = L.festivalNextOf('autumn', aut.end, KST), c0 = s.coins;
  const c2 = L.festClaim(s, next);
  assert.equal(c2.deco, undefined); assert.equal(c2.coins, L.FEST_GIFT_COINS); assert.equal(s.coins, c0 + L.FEST_GIFT_COINS);
  assert.ok(w);
  // 눈사람 꾸미기 cycles through what it wears, bare again after the last
  assert.equal(L.snowmanStyle(s), -1);
  L.festClaim(s, L.festivalNextOf('winter', t, KST));
  const wears = [];
  for (let k = 0; k <= L.SNOW_STYLES.length; k++) wears.push(L.snowmanStyle(s));
  assert.deepEqual(wears, [1, 2, 3, 4, 0]);
  // festTick: set while on, cleared after; older saves get no s.fest until a festival starts
  const u = L.newState(0, seq(0.5));
  assert.equal(L.festTick(u, t + DAY, KST), null); assert.equal('fest' in u, false);
  assert.equal(L.festTick(u, t, KST), w.id); assert.equal(u.fest.on, w.id);
  assert.equal(L.festTick(u, t + DAY, KST), null); assert.equal(u.fest.on, null);
});

test('festival orders: themed items join the board and pay ×2 and ★+1 only while a festival is on', () => {
  const s = L.newState(0, seq(0.5));
  s.rep = 99; Object.keys(L.SEED_UNLOCK).forEach((k) => { s.seedOk[k] = true; });
  s.dex.dish.jeon = 1; s.dex.dish.saengchae = 1; s.animals = { hen: 1, duck: 0, cow: 0 }; L.yardOf(s);
  const ord = (k) => L.genOrder(s, seq((k * 0.618) % 1, (k * 0.414) % 1, 0.3, 0.7));
  for (let k = 0; k < 300; k++) assert.equal(ord(k).fest, undefined);
  L.festOf(s).on = 'spring';
  let fest = 0;
  for (let k = 0; k < 300; k++) {
    const o = ord(k);
    if (o.fest) { fest++; assert.equal(o.fest, 'spring'); assert.ok(L.FEST_ORDER.spring.includes(o.id)); }
  }
  assert.ok(fest > 60, String(fest));
  const plain = L.genOrder({ ...s, fest: undefined }, seq(0.5, 0.5, 0.3, 0.7)), marked = L.genOrder(s, seq(0.5, 0.5, 0.3, 0.7));
  assert.ok(plain && marked);
  // a festival order survives a save round-trip
  s.orders[0] = { o: { id: 'berry', n: 2, reward: 900, rep: 2, fest: 'spring' }, at: 0 };
  assert.equal(L.decode(L.encode(s)).orders[0].o.fest, 'spring');
});

test('자물쇠 도전: tap with the pin in the notch, one miss forgiven, 10 s limit', () => {
  const p = L.newPick(seq(0, 0, 0));
  const inNotch = (k) => { for (let t = 0; t < 10; t += 0.01) { const y = L.pinPos(p, k, t); if (y >= 0.45 && y <= 0.55) return t; } return -1; };
  const t0 = inNotch(0);
  assert.equal(L.pickTap(p, t0), 'hit');
  const t1 = inNotch(1); assert.equal(L.pickTap(p, Math.max(t1, t0)), L.pinPos(p, 1, Math.max(t1, t0)) >= 0.42 && L.pinPos(p, 1, Math.max(t1, t0)) <= 0.58 ? 'hit' : 'miss');
  const q = L.newPick(seq(0, 0, 0));
  assert.equal(L.pickTap(q, 0), 'miss');                           // pin at the bottom
  assert.equal(L.pickTap(q, 0), 'fail');
  const r = L.newPick(seq(0, 0, 0));
  assert.equal(L.pickTime(r, 5), null); assert.equal(L.pickTime(r, 10.1), 'fail');
  // a full clean run
  const z = L.newPick(seq(0.5, 0.5, 0.5));
  let t = 0, res = null;
  for (let k = 0; k < 3; k++) { for (; t < 10; t += 0.005) { const y = L.pinPos(z, z.pin, t); if (y >= 0.48 && y <= 0.52) break; } res = L.pickTap(z, t); }
  assert.equal(res, 'ok');
});

test('불 조절 도전: steady taps keep the heat in the zone (×1.15 dish); doing nothing just gives the plain dish', () => {
  const g = L.newHeat(seq(0));
  let r = null;
  for (let t = 0; t < 10 && !r; t += 0.05) { if (g.h < (L.HEAT_ZONE[0] + L.HEAT_ZONE[1]) / 2 - 0.05) L.heatTap(g); r = L.heatStep(g, 0.05); }
  assert.equal(r, 'ok');
  const idle = L.newHeat(seq(0));
  let q = null;
  for (let t = 0; t < 10 && !q; t += 0.05) q = L.heatStep(idle, 0.05);
  assert.equal(q, 'fail');
  const spam = L.newHeat(seq(0));
  let x = null;
  for (let t = 0; t < 10 && !x; t += 0.05) { L.heatTap(spam); x = L.heatStep(spam, 0.05); }
  assert.equal(x, 'fail');                                         // overheated the whole time
  // takeDish: ×1.15 with the bonus, the plain price without
  const s = L.newState(0, seq(0.5));
  s.pot = { id: 'jam', until: 0 };
  L.takeDish(s, 1, L.HEAT_BONUS);
  assert.equal(s.bag[0].v, Math.round(L.recipeById('jam').sell * 1.15));
  s.pot = { id: 'jam', until: 0 };
  L.takeDish(s, 1);
  assert.equal(s.bag[1].v, L.recipeById('jam').sell);
});

test('saves: v1 and pre-5B saves load intact with no new fields; 5B fields round-trip; junk in them is dropped', () => {
  const v1 = { v: 1, coins: 500, sel: 'radish', plots: Array.from({ length: 6 }, plot), seeds: { gold: 0 }, up: { rod: 1 },
    items: { fert: 0 }, ms: {}, nextEventAt: 0, fish: { phase: 'idle' }, dex: { crops: { radish: 3 }, fish: {} }, savedAt: 0 };
  const a = L.decode(JSON.stringify(v1));
  assert.ok(a); assert.equal(a.coins, 500); assert.equal(a.up.rod, 1);
  assert.equal('junk' in a, false); assert.equal('fest' in a, false);
  const pre = preSave(), str = L.encode(pre), b = L.decode(str);
  assert.ok(b);
  assert.equal('junk' in b, false); assert.equal('fest' in b, false);
  assert.equal(b.coins, 7777); assert.deepEqual(b.bag, pre.bag); assert.deepEqual(b.dex, pre.dex);
  assert.deepEqual(b.yard.place.deco, { flowers: 4, bench: 6 }); assert.deepEqual(b.res, pre.res);
  assert.equal(L.encode(b), L.encode(L.decode(L.encode(b))));
  // with 5B fields
  const s = preSave();
  ['boot', 'can', 'can', 'key', 'letter', 'letter', 'chest'].forEach((id) => L.landJunk(s, id, lcg(5)));
  L.festClaim(s, L.festivalNextOf('autumn', 0, KST)); L.festClaim(s, L.festivalNextOf('winter', 0, KST)); L.snowmanStyle(s); L.festOf(s).on = 'winter';
  const back = L.decode(L.encode(s));
  assert.deepEqual(back.junk, s.junk);
  assert.deepEqual(back.fest.got, s.fest.got); assert.deepEqual(back.fest.rec, s.fest.rec); assert.equal(back.fest.snow, 1);
  assert.equal(back.fest.on, null);                                // re-worked out by the tick
  assert.equal(back.yard.deco.moonrabbit, true); assert.equal(back.yard.deco.snowman, true);
  // garbage in the new fields is dropped, never fatal
  const o = JSON.parse(L.encode(s));
  o.junk = { n: { boot: -3, can: 'x', bottle: 2.7, gold: 9 }, letters: [0, 3, 3, 13, 'x', 2.5, 12], box: 1e9, seen: { boot: true, evil: true }, total: -1 };
  o.fest = { got: { autumn: 'x', winter: 5, nope: 1 }, rec: { songpyeon: true, jam: true }, snow: 99, on: 'evil' };
  const j = L.decode(JSON.stringify(o));
  assert.ok(j);
  assert.deepEqual(j.junk, { n: { bottle: 2 }, letters: [3, 12], box: 999, seen: { boot: true }, total: 0 });
  assert.deepEqual(j.fest, { on: null, got: { winter: 5 }, rec: { songpyeon: true }, snow: 99 % (L.SNOW_STYLES.length + 1) });
  assert.equal(L.decode(JSON.stringify({ ...o, junk: 'x', fest: [1] })).coins, s.coins);
});
