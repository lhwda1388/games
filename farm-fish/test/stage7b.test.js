// farm-fish/test/stage7b.test.js — stage 7 lane ②: 동굴 (곡괭이, 기력, 광석·보석, 화석) + 별 관측 (망원경, 별자리, 유성우)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = require('../build.js').build();
vm.runInThisContext(html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1], { filename: 'logic.js' });
const L = globalThis.Logic;
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const HOUR = 3600e3, MIN = 60e3;
const env = (season, phase) => ({ season, phase: phase || 'day', weather: 'clear' });

function caveState(now) {
  const s = L.newState(0, seq(0.5));
  s.rep = L.CAVE_REP; s.coins = 1e6;
  assert.equal(L.buyPick(s, now || 0, seq(0.9)).ok, true);
  return s;
}
function scopeState() {
  const s = L.newState(0, seq(0.5));
  s.coins = 1e6;
  assert.equal(L.buyScope(s).ok, true);
  return s;
}

test('content counts, kinds and ids that clash with no other item', () => {
  const ores = L.ORES.filter((o) => o.kind === 'ore'), gems = L.ORES.filter((o) => o.kind === 'gem');
  assert.ok(ores.length >= 6 && gems.length >= 6, 'ores and gems');
  assert.ok(L.FOSSILS.length >= 6);
  assert.ok(L.STARS.length >= 16);
  for (const se of L.SEASONS) assert.ok(L.STARS.filter((c) => c.season === se).length >= 4, 'constellations in ' + se);
  const ids = new Set();
  const other = (id) => L.CROPS[id] || L.FISH.some((f) => f.id === id) || L.PRODUCTS[id] || L.forageById(id) || L.RECIPES.some((r) => r.id === id) ||
    L.treeById(id) || L.honeyById(id);
  for (const x of [...L.ORES, ...L.FOSSILS, ...L.STARS]) {
    assert.ok(!ids.has(x.id), 'dup ' + x.id); ids.add(x.id);
    assert.ok(!other(x.id), 'clash ' + x.id);
    assert.ok(x.name && x.hint, x.id);
  }
  L.ORES.forEach((o) => { assert.ok(o.price > 0); assert.equal(L.itemInfo(o.id).kind, o.kind); });
  L.FOSSILS.forEach((f) => { assert.ok(f.parts >= 3 && f.parts <= 5, f.id); assert.equal(L.itemInfo(f.id), null); });
  assert.equal(L.itemInfo('fossilbit').kind, 'fossil');
  // constellations: points far enough apart to tap in a small window, a path over real points
  L.STARS.forEach((c) => {
    for (let a = 0; a < c.pts.length; a++) for (let b = a + 1; b < c.pts.length; b++) {
      assert.ok(Math.hypot(c.pts[a][0] - c.pts[b][0], c.pts[a][1] - c.pts[b][1]) >= 12, c.id + ' ' + a + '-' + b);
    }
    c.pts.forEach((p) => assert.ok(p[0] >= 0 && p[0] <= 100 && p[1] >= 0 && p[1] <= 100));
    const used = new Set(c.path.filter((k) => k !== null));
    assert.equal(used.size, c.pts.length, c.id + ' path uses every star');
    assert.ok(c.path[0] !== null && c.path[c.path.length - 1] !== null);
  });
});

test('pickaxe: ★8 and coins, then the 동굴 opens', () => {
  const s = L.newState(0, seq(0.5));
  s.coins = 1e6;
  assert.equal(L.caveOk(s), false);
  assert.equal(L.buyPick(s, 0, seq(0.5)).why, 'rep');
  s.rep = L.CAVE_REP; s.coins = L.PICK_COST - 1;
  assert.equal(L.buyPick(s, 0, seq(0.5)).why, 'coins');
  s.coins = L.PICK_COST + 10;
  assert.equal(L.buyPick(s, 0, seq(0.5)).ok, true);
  assert.equal(s.coins, 10);
  assert.equal(L.caveOk(s), true);
  assert.equal(L.buyPick(s, 0, seq(0.5)).why, 'owned');
  assert.equal(s.cave.wall.length, L.CAVE_COLS * L.CAVE_ROWS);
  assert.ok(s.cave.wall.every((c) => c === 1 || c === 2));
});

test('energy: full when bought, one per cell, refills over real time (offline too), capped', () => {
  const t0 = 1000 * HOUR, s = caveState(t0);
  assert.deepEqual(L.caveEnergy(s, t0), { n: L.CAVE_EMAX, max: L.CAVE_EMAX, next: null });
  assert.ok(L.mineCell(s, 0, t0, seq(0.5), false));
  assert.ok(L.mineCell(s, 1, t0, seq(0.5), false));
  let e = L.caveEnergy(s, t0);
  assert.equal(e.n, L.CAVE_EMAX - 2);
  assert.equal(e.next, t0 + L.CAVE_EVERY);
  e = L.caveEnergy(s, t0 + L.CAVE_EVERY + 1);
  assert.equal(e.n, L.CAVE_EMAX - 1);
  assert.equal(e.next, t0 + 2 * L.CAVE_EVERY);
  // a long time away: full again, never past max
  assert.equal(L.caveEnergy(s, t0 + 100 * L.CAVE_EVERY).n, L.CAVE_EMAX);
  // a clock that went backwards never takes energy away
  assert.equal(L.caveEnergy(s, t0 - HOUR).n, L.CAVE_EMAX - 2);
  // spend it all: the next cell waits
  const s2 = caveState(t0);
  for (let k = 0; k < L.CAVE_EMAX; k++) assert.ok(L.mineCell(s2, k, t0, seq(0.5), false), 'cell ' + k);
  assert.equal(L.caveEnergy(s2, t0).n, 0);
  assert.equal(L.mineCell(s2, L.CAVE_EMAX, t0, seq(0.5), false), null);
  assert.ok(L.mineCell(s2, L.CAVE_EMAX, t0 + L.CAVE_EVERY, seq(0.5), false));
});

test('mining: closed before the pickaxe, a broken cell gives nothing twice, finds go to the basket', () => {
  const s0 = L.newState(0, seq(0.5));
  assert.equal(L.mineCell(s0, 0, 0, seq(0.5), false), null);
  const s = caveState(0);
  const r = L.mineCell(s, 3, 0, seq(0.5), false);
  assert.ok(r && L.oreById(r.id));
  assert.ok(r.kind === 'ore' || r.kind === 'gem');
  assert.equal(s.cave.wall[3], 0);
  assert.equal(L.mineCell(s, 3, 0, seq(0.5), false), null);
  assert.equal(s.bag.length, 1);
  assert.equal(s.bag[0].id, r.id);
  assert.equal(s.cave.dex[r.id], 1);
  assert.equal(L.caveDexCount(s), 1);
  // a full basket sells it on the spot (bagAdd rule)
  while (s.bag.length < L.bagCap(s)) L.bagAdd(s, 'radish', 30);
  const c0 = s.coins, r2 = L.mineCell(s, 4, 0, seq(0.5), false);
  assert.equal(r2.sold, L.oreById(r2.id).price);
  assert.equal(s.coins, c0 + r2.sold);
});

test('도전 success breaks one more cell for free; the cleared wall comes back', () => {
  const s = caveState(0);
  const r = L.mineCell(s, 0, 0, seq(0.5), true);
  assert.ok(r.more, 'a second cell');
  assert.equal(s.cave.wall[0], 0);
  assert.equal(s.cave.wall[1], 0);               // the one beside it
  assert.equal(L.caveEnergy(s, 0).n, L.CAVE_EMAX - 1);
  // clear the whole wall: a fresh one stands, one level deeper
  const s2 = caveState(0);
  s2.cave.wall = s2.cave.wall.map((c, k) => (k === 5 ? 1 : 0));
  assert.ok(L.mineCell(s2, 5, 0, seq(0.5), false));
  assert.ok(s2.cave.wall.every((c) => c === 1 || c === 2));
  assert.equal(s2.cave.lv, 1);
  // 도전 never costs anything: a game is a gauge like the others
  const g = L.caveGame(1000, seq(0.5));
  assert.equal(L.chJudge(g, 1000 + 10), 'tap');
});

test('fossils: parts come in rarely, a full set completes it once, a doubled part is a sellable 화석 조각', () => {
  const s = caveState(0);
  const f = L.FOSSILS[0];
  // rng 0 → fossil roll, first fossil, part index from the third number
  const parts = [];
  for (let k = 0; k < f.parts; k++) {
    s.cave.e = L.CAVE_EMAX;
    const r = L.mineCell(s, k, 0, seq(0, 0, (k + 0.5) / f.parts), false);
    assert.equal(r.kind, 'part'); assert.equal(r.fossil, f.id);
    parts.push(r);
  }
  assert.equal(parts[f.parts - 1].done, true);
  assert.ok(parts[f.parts - 1].reward > 0);
  assert.ok(parts.slice(0, -1).every((r) => !r.done));
  assert.equal(s.cave.done[f.id], true);
  assert.equal(L.fossilCount(s), 1);
  assert.equal(s.bag.length, 0);                 // new parts are kept, not put in the basket
  // the same part again: into the basket as a 화석 조각
  s.cave.e = L.CAVE_EMAX;
  const d = L.mineCell(s, 10, 0, seq(0, 0, 0), false);
  assert.equal(d.kind, 'part'); assert.equal(d.dup, true); assert.ok(!d.done);
  assert.equal(s.bag.length, 1); assert.equal(s.bag[0].id, 'fossilbit');
  assert.ok(s.bag[0].v > 0);
  // fossils are rare: a plain roll is an ore or gem
  assert.notEqual(L.mineCell(s, 11, 0, seq(0.5), false).kind, 'part');
});

test('cave gems: night / winter ones only then, an unfound conditional one gets the 첫 만남 보정', () => {
  const moon = L.oreById('moonstone');
  assert.ok(moon && moon.phase);
  const s = caveState(0);
  assert.equal(L.oreWeight(moon, env('spring', 'day'), s, false), 0);
  const w0 = L.oreWeight(moon, env('spring', 'night'), s, false);
  assert.ok(w0 > 0);
  s.cave.dex.moonstone = 1;
  assert.ok(L.oreWeight(moon, env('spring', 'night'), s, false) < w0);
  // glinting cells favour gems
  const am = L.oreById('amethyst');
  assert.ok(L.oreWeight(am, env('spring'), s, true) > L.oreWeight(am, env('spring'), s, false));
  // without env only the always-there ones come out
  assert.ok(L.orePool(null, s, false).every((e) => !L.oreById(e.id).phase && !L.oreById(e.id).season));
});

test('crafting: ores into a 마당 decoration', () => {
  const s = caveState(0);
  const c = L.CAVE_CRAFT[0];
  assert.equal(L.craftDeco(s, c.id).why, 'need');
  Object.keys(c.need).forEach((id) => { for (let k = 0; k < c.need[id]; k++) L.bagAdd(s, id, 1); });
  const r = L.craftDeco(s, c.id);
  assert.equal(r.ok, true);
  assert.equal(s.yard.deco[c.id], true);
  assert.equal(s.bag.length, 0);
  assert.equal(L.craftDeco(s, c.id).why, 'owned');
  assert.ok(L.decoById(c.id));
});

test('telescope: night only; constellation taps in order, wrong taps are free, done once', () => {
  const s0 = L.newState(0, seq(0.5));
  assert.equal(L.skyOpen(s0, 0, 0, 'night'), false);
  s0.coins = L.SCOPE_COST - 1;
  assert.equal(L.buyScope(s0).why, 'coins');
  const s = scopeState();
  assert.equal(L.buyScope(s).why, 'owned');
  // game clock: minute 50 of the hour is night, minute 20 is day
  assert.equal(L.skyOpen(s, 50 * MIN, 0), true);
  assert.equal(L.skyOpen(s, 20 * MIN, 0), false);
  assert.equal(L.skyOpen(s, 20 * MIN, 0, 'night'), true);   // the UI's phase override
  const c = L.STARS[0];
  const g = L.starGame(c.id, seq(0.37, 0.71, 0.13, 0.92, 0.55));
  assert.equal(g.stars.length > c.pts.length, true, 'some decoy stars');
  for (let a = 0; a < g.stars.length; a++) for (let b = a + 1; b < g.stars.length; b++) {
    assert.ok(Math.hypot(g.stars[a].x - g.stars[b].x, g.stars[a].y - g.stars[b].y) >= 12, 'stars apart');
  }
  const decoy = g.stars.findIndex((st, k) => g.taps.indexOf(k) < 0);
  assert.ok(decoy >= 0);
  assert.equal(L.starTap(g, decoy), 'wrong');
  for (let k = 0; k < g.taps.length - 1; k++) {
    assert.equal(L.starTap(g, g.taps[k]), 'ok');
    assert.equal(L.starTap(g, g.taps[k]), 'ok');   // tapping the lit star again is harmless
  }
  assert.equal(L.starTap(g, decoy), 'wrong');
  assert.equal(L.starTap(g, g.taps[g.taps.length - 1]), 'done');
  assert.equal(L.starTap(g, decoy), 'done');
  // tap by position: the nearest star within reach
  const st = g.stars[g.taps[0]];
  assert.equal(L.starAt(g, st.x + 3, st.y - 2, 8), g.taps[0]);
  assert.equal(L.starAt(g, -50, -50, 8), -1);
  // record: first time pays more
  const a = L.seeStar(s, c.id, 123), b = L.seeStar(s, c.id, 456);
  assert.equal(a.first, true); assert.equal(b.first, false);
  assert.ok(a.coins > b.coins);
  assert.equal(s.sky.seen[c.id], 123);
  assert.equal(L.skyDexCount(s), 1);
  // tonight's pick prefers unseen ones of the season
  assert.equal(c.season, 'spring');
  for (let k = 0; k < 20; k++) {
    const id = L.starFor(s, 'spring', () => k / 20);
    const st2 = L.starById(id);
    assert.ok(!st2.season || st2.season === 'spring');
    assert.notEqual(id, c.id);
  }
});

test('meteor nights: deterministic, only at night, a few a day; one wish per meteor night', () => {
  const day0 = 2000 * HOUR;
  let n = 0;
  for (let h = 0; h < 48; h++) {
    const t = day0 + h * HOUR;
    assert.equal(L.meteorNight(t + 10 * MIN, 0), false, 'never by day');
    const on = L.meteorNight(t + 50 * MIN, 0);
    assert.equal(on, L.meteorNight(t + 50 * MIN, 0));
    assert.equal(on, L.meteorNight(t + 46 * MIN, 0));
    if (on) n++;
  }
  assert.ok(n >= 2 && n <= 16, 'a few a day: ' + n);
  // the next one: a 15-minute night window, meteorNight inside it
  const w = L.nextMeteor(day0, 0);
  assert.ok(w.start >= day0 && w.end - w.start === 15 * MIN);
  assert.equal(L.meteorNight(w.start, 0), true);
  assert.equal(L.meteorNight(w.end - 1, 0), true);
  assert.equal(L.meteorNight(w.start - 1, 0), false);
  assert.deepEqual(L.nextMeteor(w.start + MIN, 0), w);
  // a different time zone shifts the window with it
  const w9 = L.nextMeteor(day0, 540);
  assert.equal(L.meteorNight(w9.start, 540), true);
  // wish: only on a meteor night (when tz given), once per night
  const s = scopeState();
  assert.equal(L.wish(s, w.start - 30 * MIN, seq(0.5), 0), null);
  const c0 = s.coins, r = L.wish(s, w.start + MIN, seq(0.99, 0.5), 0);
  assert.ok(r && r.kind === 'coins' && s.coins === c0 + r.coins);
  assert.equal(L.wish(s, w.start + 2 * MIN, seq(0.99), 0), null);
  const w2 = L.nextMeteor(w.end, 0);
  const d = L.wish(s, w2.start, seq(0.1, 0), 0);
  assert.equal(d.kind, 'deco'); assert.ok(L.WISH_DECOS.indexOf(d.id) >= 0); assert.equal(s.yard.deco[d.id], true);
  const w3 = L.nextMeteor(w2.end, 0), g0 = s.seeds.gold;
  const sd = L.wish(s, w3.start, seq(0.45), 0);
  assert.equal(sd.kind, 'seed'); assert.equal(s.seeds.gold, g0 + 1);
});

test('save: s.cave and s.sky survive a round trip, junk is cleaned', () => {
  const s = caveState(5000);
  L.mineCell(s, 0, 5000, seq(0.5), false);
  L.mineCell(s, 1, 5000, seq(0, 0, 0), false);
  s.cave.done.trilobite = true;
  s.coins += L.SCOPE_COST; L.buyScope(s);
  L.seeStar(s, 'orion', 777);
  s.sky.wish = 42;
  const o = L.decode(L.encode(s));
  assert.deepEqual(o.cave, s.cave);
  assert.deepEqual(o.sky, s.sky);
  // bad data does not load and does not crash
  const raw = JSON.parse(L.encode(s));
  raw.cave.wall = [9, 'x', 1]; raw.cave.e = -5; raw.cave.parts = { nope: [true], ammonite: 'x' }; raw.cave.done = { nope: true }; raw.cave.dex = { nope: 3, coal: -1 };
  raw.sky.seen = { nope: 1, orion: 'x', cygnus: 5 }; raw.sky.own = 'yes';
  const b = L.decode(JSON.stringify(raw));
  assert.ok(b);
  assert.equal(b.cave.wall.length, L.CAVE_COLS * L.CAVE_ROWS);
  assert.ok(b.cave.wall.every((c) => c === 0 || c === 1 || c === 2));
  assert.ok(b.cave.e >= 0);
  assert.deepEqual(Object.keys(b.cave.parts), []);
  assert.deepEqual(b.cave.done, {});
  assert.deepEqual(b.cave.dex, {});
  assert.deepEqual(b.sky.seen, { cygnus: 5 });
  assert.equal(b.sky.own, false);
});

test('v1 save and every released fixture still load; none of them has 동굴 or 망원경', () => {
  const v1 = JSON.stringify({ v: 1, coins: 120, sel: 'radish', plots: Array.from({ length: 6 }, () => ({ crop: null, progress: 0, t: 0, yieldMul: 1, weed: false, crow: null })),
    seeds: { gold: 0 }, ms: {}, nextEventAt: 0, fish: { phase: 'idle' }, dex: { crops: { radish: 3 }, fish: {}, goldSeed: false }, savedAt: 0 });
  const s = L.decode(v1);
  assert.ok(s); assert.equal(s.cave, undefined); assert.equal(s.sky, undefined);
  assert.equal(L.caveOk(s), false); assert.equal(L.skyOk(s), false);
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    if (/"(flat|cam|cave|sky|isle|museum|guide)":/.test(fs.readFileSync(path.join(dir, f), 'utf8'))) continue;   // saved by stage 7+
    const o = L.decode(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.ok(o, f); assert.equal(o.cave, undefined, f); assert.equal(o.sky, undefined, f);
  }
});
