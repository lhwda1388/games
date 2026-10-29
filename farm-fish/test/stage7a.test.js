// farm-fish/test/stage7a.test.js — stage 7 lane ①: 갯벌 (tides, digging) + 사진기 (album)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = require('../build.js').build();
vm.runInThisContext(html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1], { filename: 'logic.js' });
const L = globalThis.Logic;
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const MIN = 60e3, HOUR = 3600e3, DAY = 86400e3;
const T0 = 100 * DAY;   // a game-day start (UTC, tz 0)

function seaState() {
  const s = L.newState(0, seq(0.5));
  s.spotOk = { river: true, sea: true };
  return s;
}
// first moment at or after t when the tide is low (tz 0)
function nextLow(t) { const d = L.tideAt(t, 0); return d.low ? t : d.next; }

test('content: 15+ flat finds with 진주, unique ids, items, recipes; 30+ album slots with the lane ②③ ids', () => {
  assert.ok(L.FLAT.length >= 15);
  assert.ok(L.flatById('pearl'));
  const other = (id) => L.CROPS[id] || L.FISH.some((f) => f.id === id) || L.PRODUCTS[id] || L.forageById(id) ||
    L.treeById(id) || L.honeyById(id) || L.bugById(id) || L.RECIPES.some((r) => r.id === id);
  const ids = new Set();
  for (const f of L.FLAT) {
    assert.ok(!ids.has(f.id), 'dup ' + f.id); ids.add(f.id);
    assert.ok(!other(f.id), 'clash ' + f.id);
    assert.ok(f.name && f.hint && f.price > 0 && L.FLAT_W[f.rarity], f.id);
    assert.equal(L.itemInfo(f.id).kind, 'flat');
    assert.equal(L.flatById(f.id), f);
  }
  assert.equal(L.flatById('nope'), null);
  assert.ok(L.FLAT_RECIPES.length >= 2);
  L.FLAT_RECIPES.forEach((r) => {
    assert.ok(L.recipeById(r.id), r.id);
    assert.ok(r.need.every((x) => L.itemInfo(x)));
    assert.ok(r.sell > r.need.reduce((a, x) => a + L.itemInfo(x).price, 0), r.id);
  });
  assert.ok(L.SHOTS.length >= 30);
  const shots = new Set();
  L.SHOTS.forEach((p) => { assert.ok(!shots.has(p.id), 'dup ' + p.id); shots.add(p.id); assert.ok(p.name && p.hint, p.id); });
  ['meteor', 'lighthouse', 'cave', 'fossil', 'rainbow', 'lowtide', 'legend'].forEach((id) => assert.ok(shots.has(id), id));
  L.VISITORS.forEach((v) => assert.ok(shots.has(v.id), 'visitor shot ' + v.id));
  assert.ok(L.CAMERA_COST > 0);
});

test('tides: two lows per game day, each about 15 minutes (about half the time); next is the next change', () => {
  for (let d = 0; d < 30; d++) {
    const d0 = T0 + d * HOUR;
    let lowMin = 0, starts = 0, prev = L.tideAt(d0 - MIN, 0).low;
    for (let m = 0; m < 60; m++) {
      const low = L.tideAt(d0 + m * MIN + 1000, 0).low;
      if (low) lowMin++;
      if (low && !prev) starts++;
      prev = low;
    }
    assert.equal(starts + (L.tideAt(d0 - MIN, 0).low && L.tideAt(d0 + 1000, 0).low ? 1 : 0), 2, 'day ' + d);
    assert.ok(lowMin >= 28 && lowMin <= 32, 'day ' + d + ' low ' + lowMin);
  }
  // next: the moment the tide turns
  for (let t = T0; t < T0 + 3 * HOUR; t += 7 * MIN) {
    const a = L.tideAt(t, 0);
    assert.ok(a.next > t);
    assert.equal(L.tideAt(a.next, 0).low, !a.low, 'turns at next');
    assert.equal(L.tideAt(a.next - 1, 0).low, a.low, 'holds until next');
  }
  // low tides move through the day: over a few days some fall in the game night
  let night = false;
  for (let t = T0; t < T0 + 40 * HOUR; t += 2 * MIN) if (L.tideAt(t, 0).low && L.gameClock(t, 0).phase === 'night') night = true;
  assert.ok(night, 'a low tide at night');
  // the timezone shifts it like the game clock
  assert.equal(L.tideAt(T0 + 30 * MIN, 60).low, L.tideAt(T0 + 30 * MIN + HOUR, 0).low);
});

test('flat: locked without the sea, nothing to dig at high tide, low tide digs go to the basket', () => {
  const s = L.newState(0, seq(0.5));
  const low = nextLow(T0);
  assert.equal(L.flatOk(s), false);
  assert.deepEqual(L.flatSpots(s, low, 0), []);
  assert.equal(s.flat, undefined);
  s.spotOk = { sea: true };
  assert.equal(L.flatOk(s), true);
  // high tide: no spots, no digging
  const high = L.tideAt(low, 0).next + MIN;
  assert.equal(L.tideAt(high, 0).low, false);
  assert.deepEqual(L.flatSpots(s, high, 0), []);
  assert.equal(L.digFlat(s, 0, high, seq(0.5), false), null);
  // low tide: every spot has something; the same tide shows the same things
  const spots = L.flatSpots(s, low, 0);
  assert.equal(spots.length, L.FLAT_N);
  assert.deepEqual(L.flatSpots(s, low + 1000, 0), spots);
  spots.forEach((p) => assert.ok(L.flatById(p.id)));
  const r = L.digFlat(s, spots[0].k, low + 2000, seq(0.5), false);
  assert.deepEqual([r.id, r.n, r.sold], [spots[0].id, 1, 0]);
  assert.equal(r.first, true);
  assert.equal(L.bagCount(s, r.id), 1);
  assert.equal(s.flat.dex[r.id], 1);
  assert.equal(L.digFlat(s, spots[0].k, low + 3000, seq(0.5), false), null, 'no double dig');
  assert.equal(L.flatSpots(s, low + 3000, 0).length, L.FLAT_N - 1);
  // the hole fills in again a while later, within the same low tide
  assert.equal(L.flatSpots(s, low + 2000 + L.FLAT_REGROW, 0).length, L.FLAT_N);
  // the tide comes in: what was left can't be dug
  const end = L.tideAt(low, 0).next;
  assert.equal(L.digFlat(s, spots[1].k, end, seq(0.5), false), null);
  assert.deepEqual(L.flatSpots(s, end, 0), []);
  // next low tide: fresh spots
  assert.equal(L.flatSpots(s, nextLow(end), 0).length, L.FLAT_N);
});

test('flat: a full basket sells on the spot (bagAdd rules), 도전 success doubles', () => {
  const s = seaState();
  const low = nextLow(T0);
  L.flatSpots(s, low, 0);
  s.flat.spots[0].id = 'clam'; s.flat.spots[1].id = 'clam';
  while (s.bag.length < L.bagCap(s)) L.bagAdd(s, 'radish', 30);
  const coins = s.coins;
  const r = L.digFlat(s, 0, low + 1000, seq(0.5), false);
  assert.equal(r.sold, L.flatById('clam').price);
  assert.equal(s.coins, coins + r.sold);
  assert.equal(s.flat.dex.clam, 1);
  s.bag = [];
  const w = L.digFlat(s, 1, low + 1000, seq(0.5), true);
  assert.deepEqual([w.id, w.n, w.won], ['clam', 2, true]);
  assert.equal(L.bagCount(s, 'clam'), 2);
  assert.equal(s.flat.dex.clam, 3);
  // the gauge is the shared 도전 one, narrower for rarer finds
  const g1 = L.flatGame('clam', 0, seq(0.5)), g2 = L.flatGame('pearl', 0, seq(0.5));
  assert.ok(g1.hi - g1.lo > g2.hi - g2.lo);
  assert.equal(L.chJudge(g1, 10), 'tap');
});

test('flat: 첫 만남 보정 for conditional finds not dug yet; season/time conditions hold', () => {
  const s = seaState();
  s.flat = undefined;
  const cond = L.FLAT.find((f) => f.phase && L.flatConditional(f));
  const e = { season: (cond.season || ['spring'])[0], phase: cond.phase[0], weather: 'clear' };
  const before = L.flatWeight(cond, e, s);
  assert.ok(before > 0);
  L.flatSpots(s, nextLow(T0), 0);   // creates s.flat
  const fresh = L.flatWeight(cond, e, s);
  s.flat.dex[cond.id] = 1;
  assert.equal(fresh, L.flatWeight(cond, e, s) * L.FIRST_MUL);
  const wrong = ['morning', 'day', 'evening', 'night'].find((p) => cond.phase.indexOf(p) < 0);
  assert.equal(L.flatWeight(cond, { season: e.season, phase: wrong, weather: 'clear' }, s), 0);
  const seasonal = L.FLAT.find((f) => f.season && f.season.length < 4);
  const off = L.SEASONS.find((x) => seasonal.season.indexOf(x) < 0);
  assert.equal(L.flatWeight(seasonal, { season: off, phase: 'day', weather: 'clear' }, s), 0);
});

test('flat items: orders for common finds already dug, a resident posts them; recipes cook', () => {
  const s = seaState();
  L.flatSpots(s, nextLow(T0), 0);
  s.flat.dex.clam = 1;
  const pool = L.orderPool(s, false);
  assert.ok(pool.some((e) => e.id === 'clam'));
  assert.ok(!pool.some((e) => e.id === 'pearl'));
  assert.ok(L.residentFor({ id: 'clam', n: 3, reward: 300 }));
  assert.equal(L.obtainable(s, 'clam'), true);
  assert.equal(L.obtainable(L.newState(0, seq(0.5)), 'clam'), false);
  const r = L.FLAT_RECIPES[0];
  r.need.forEach((x) => L.bagAdd(s, x, L.itemInfo(x).price));
  assert.equal(L.cook(s, r.id, 0), true);
});

test('camera: buy once, shots fill the album once each', () => {
  const s = L.newState(0, seq(0.5));
  assert.equal(L.takeShot(s, 'rainbow', 5), null, 'no camera');
  s.coins = L.CAMERA_COST - 1;
  assert.equal(L.buyCamera(s).why, 'coins');
  s.coins = L.CAMERA_COST;
  assert.equal(L.buyCamera(s).ok, true);
  assert.equal(s.coins, 0);
  assert.equal(L.buyCamera(s).why, 'owned');
  assert.deepEqual(L.takeShot(s, 'rainbow', 5), { first: true });
  assert.deepEqual(L.takeShot(s, 'rainbow', 9), { first: false });
  assert.deepEqual(s.cam.album, { rainbow: 5 });
  assert.equal(L.takeShot(s, 'nope', 9), null);
  assert.equal(L.albumCount(s), 1);
});

test('shotsNow: pure moments from the scene, visitors, weather and events', () => {
  assert.deepEqual(L.shotsNow({}), []);
  const has = (ctx, id) => L.shotsNow(ctx).indexOf(id) >= 0;
  assert.ok(has({ scene: 'yard', vis: ['rainbow', 'cat'] }, 'rainbow'));
  assert.ok(has({ scene: 'yard', vis: ['rainbow', 'cat'] }, 'cat'));
  assert.ok(has({ scene: 'farm', vis: ['frog'] }, 'frog'));
  assert.ok(!has({ scene: 'farm', vis: [] }, 'frog'));
  assert.ok(has({ scene: 'flat', low: true }, 'lowtide'));
  assert.ok(!has({ scene: 'flat', low: false }, 'lowtide'));
  assert.ok(has({ scene: 'farm', landed: 'swordfish' }, 'legend'));
  assert.ok(!has({ scene: 'farm', landed: 'minnow' }, 'legend'));
  assert.ok(has({ scene: 'farm', weather: 'snow' }, 'snowfarm'));
  assert.ok(has({ scene: 'yard', petNap: true }, 'petnap'));
  assert.ok(has({ scene: 'yard', festival: 'winter' }, 'fest_winter'));
  // lane ② / ③ moments, ready for when they arrive
  assert.ok(has({ scene: 'yard', meteor: true }, 'meteor'));
  assert.ok(has({ scene: 'cave' }, 'cave'));
  assert.ok(has({ scene: 'cave', fossilDone: true }, 'fossil'));
  assert.ok(has({ scene: 'island', lighthouse: true }, 'lighthouse'));
  // every slot can actually happen from some ctx
  const ctxs = [
    { scene: 'yard', vis: L.VISITORS.map((v) => v.id) }, { scene: 'farm', vis: L.VISITORS.map((v) => v.id) },
    { scene: 'flat', low: true, phase: 'evening', dug: 'pearl' }, { scene: 'farm', landed: 'swordfish', weather: 'rain' },
    { scene: 'farm', weather: 'snow' }, { scene: 'forest', weather: 'fog', glowmoss: true }, { scene: 'orchard', season: 'spring' },
    { scene: 'village', phase: 'night' }, { scene: 'yard', petNap: true, snowman: true, meteor: true, lighthouse: true },
    { scene: 'cave', fossilDone: true }, { scene: 'yard', festival: 'spring' }, { scene: 'yard', festival: 'summer', phase: 'night' },
    { scene: 'yard', festival: 'autumn', phase: 'night' }, { scene: 'yard', festival: 'winter' },
    { scene: 'balloon', sight: 'whale' }, { scene: 'balloon', sight: 'geese' }   // stage 9 ③
  ];
  const seen = new Set();
  ctxs.forEach((c) => L.shotsNow(c).forEach((id) => seen.add(id)));
  L.SHOTS.forEach((p) => assert.ok(seen.has(p.id), 'reachable ' + p.id));
});

test('save: s.flat and s.cam survive encode/decode; junk is dropped; old saves get neither', () => {
  const s = seaState();
  const low = nextLow(T0);
  const spots = L.flatSpots(s, low, 0);
  L.digFlat(s, spots[0].k, low + 1000, seq(0.5), false);
  s.flat.dex.pearl = 2;
  s.coins = L.CAMERA_COST; L.buyCamera(s);
  L.takeShot(s, 'rainbow', 123); L.takeShot(s, 'meteor', 456);
  const back = L.decode(L.encode(s));
  assert.deepEqual(back.flat, s.flat);
  assert.deepEqual(back.cam, s.cam);
  assert.equal(L.flatSpots(back, low + 1500, 0).length, L.FLAT_N - 1);
  // junk in the save is dropped, not trusted
  const o = JSON.parse(L.encode(s));
  o.flat.dex.nope = 3; o.flat.dex.clam = -1; o.flat.spots[1] = { id: 'nope', at: 'x' }; o.cam.album.nope = 1; o.cam.album.cat = 'x';
  const j = L.decode(JSON.stringify(o));
  assert.equal(j.flat.dex.nope, undefined);
  assert.equal(j.flat.dex.clam, undefined);
  assert.equal(j.flat.spots[1].id, null);
  assert.deepEqual(j.cam.album, { rainbow: 123, meteor: 456 });
  // a camera never bought: no album
  const o2 = JSON.parse(L.encode(s)); o2.cam = { own: false, album: { rainbow: 1 } };
  assert.equal(L.decode(JSON.stringify(o2)).cam, undefined);
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    if (/"(flat|cam|cave|sky|isle|museum|guide)":/.test(fs.readFileSync(path.join(dir, f), 'utf8'))) continue;   // saved by stage 7+
    const old = L.decode(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.ok(old, f);
    assert.equal(old.flat, undefined, f);
    assert.equal(old.cam, undefined, f);
  }
});

test('every dig find can really be dug: 20+ real minutes a real day of low tide under its conditions, in each of its seasons', () => {
  const env = (t) => { const c = L.gameClock(t, 0); return { season: c.season, phase: c.phase, weather: 'clear' }; };
  for (const f of L.FLAT.filter((x) => !x.trap)) {
    for (const se of f.season || L.SEASONS) {
      // the middle day of that season's week (seasons turn on Monday 00:00 local)
      const wk = 4 * DAY + (100 * 4 + L.SEASONS.indexOf(se)) * 7 * DAY, d0 = wk + 3 * DAY;
      let mins = 0;
      for (let t = d0; t < d0 + DAY; t += MIN) {
        const e = env(t);
        if (e.season === se && L.tideAt(t, 0).low && L.flatWeight(f, e) > 0) mins++;
      }
      assert.ok(mins >= 20, f.id + ' in ' + se + ': ' + mins + ' min');
    }
  }
});

test('통발: set at high tide, fills over real time (capped, offline too), hauled at low tide into the basket', () => {
  const s = seaState();
  const low = nextLow(T0), high = L.tideAt(low, 0).next + MIN;
  assert.equal(L.TRAP_N >= 1, true);
  assert.equal(L.setTrap(s, 0, low, 0).why, 'tide', 'not at low tide');
  assert.equal(L.setTrap(L.newState(0, seq(0.5)), 0, high, 0).why, 'locked');
  assert.equal(L.setTrap(s, 0, high, 0).ok, true);
  assert.equal(L.setTrap(s, 0, high, 0).why, 'set');
  assert.equal(L.trapCount(s.flat.traps[0], high), 0);
  assert.equal(L.trapCount(s.flat.traps[0], high + L.TRAP_EVERY), 1);
  assert.equal(L.trapCount(s.flat.traps[0], high + 100 * L.TRAP_EVERY), L.TRAP_CAP);
  assert.equal(L.pullTrap(s, 0, high + 1000, seq(0.1), 0), null, 'no hauling at high tide');
  const back = L.decode(L.encode(s));
  assert.deepEqual(back.flat.traps, s.flat.traps);
  // a week away, then a low tide: a full trap
  const later = nextLow(high + 7 * DAY);
  const r = L.pullTrap(s, 0, later, seq(0.1), 0);
  assert.equal(r.got.length, L.TRAP_CAP);
  r.got.forEach((id) => { assert.ok(L.flatById(id)); assert.ok(L.TRAP_POOL.some((p) => p.id === id)); });
  assert.equal(s.bag.length, L.TRAP_CAP);
  assert.equal(s.flat.traps[0], null);
  assert.equal(L.pullTrap(s, 0, later, seq(0.1), 0), null);
  // trap-only finds exist and never come from digging
  const only = L.FLAT.filter((f) => f.trap);
  assert.ok(only.length >= 1);
  only.forEach((f) => assert.equal(L.flatPool({ season: 'summer', phase: 'day', weather: 'clear' }).some((p) => p.id === f.id), false));
  only.forEach((f) => assert.ok(L.TRAP_POOL.some((p) => p.id === f.id)));
  // an empty trap stays set; a full basket sells on the spot
  const h2 = L.tideAt(later, 0).next + 1000;
  assert.equal(L.setTrap(s, 1, h2, 0).ok, true);
  const early = L.pullTrap(s, 1, h2 + 2000 + (L.tideAt(h2, 0).next - h2), seq(0.1), 0);
  if (L.trapCount(s.flat.traps[1] || { at: h2 }, L.tideAt(h2, 0).next) === 0) { assert.deepEqual(early.got, []); assert.ok(s.flat.traps[1]); }
  const t2 = L.newState(0, seq(0.5)); t2.spotOk = { sea: true };
  L.setTrap(t2, 0, high, 0);
  while (t2.bag.length < L.bagCap(t2)) L.bagAdd(t2, 'radish', 30);
  const r2 = L.pullTrap(t2, 0, nextLow(high + DAY), seq(0.1), 0);
  assert.ok(r2.sold > 0);
});
