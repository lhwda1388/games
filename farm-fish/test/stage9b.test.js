// farm-fish/test/stage9b.test.js — stage 9 ②: 당나귀 (친밀도, 먹이, 이름, 짐 싣기), 깊은 숲·산꼭대기 (채집물, 곤충, 별자리)
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
const env = (season, phase, weather) => ({ season: season || 'spring', phase: phase || 'day', weather: weather || 'clear', wet: weather === 'rain' });

function rich() {
  const s = L.newState(0, seq(0.5));
  s.rep = Math.max(L.DONKEY_REP, L.FOREST_REP); s.coins = 1e6;
  return s;
}
function withDonkey(lv) {
  const s = rich();
  assert.equal(L.unlockForest(s, 0).ok, true);
  assert.equal(L.buyDonkey(s, '', 0).ok, true);
  if (lv) s.donkey.f = L.DONKEY_LV[lv - 1];
  return s;
}

test('buying: needs ★ and coins, only one, default name, name cleaned and capped', () => {
  const s = L.newState(0, seq(0.5));
  assert.equal(L.donkeyStatus(s), 'rep');
  s.rep = L.DONKEY_REP;
  assert.equal(L.donkeyStatus(s), 'coins');
  s.coins = L.DONKEY_COST;
  assert.equal(L.donkeyStatus(s), 'ok');
  const r = L.buyDonkey(s, '<b>당근당근당근이</b>', 5);
  assert.equal(r.ok, true);
  assert.equal(s.coins, 0);
  assert.equal(s.donkey.name.length <= L.PET_NAME_MAX, true);
  assert.ok(!/[<>]/.test(s.donkey.name));
  assert.equal(L.buyDonkey(s, '', 5).ok, false);
  assert.equal(L.donkeyStatus(s), 'have');
  const t = rich(); L.buyDonkey(t, '   ', 0);
  assert.equal(t.donkey.name, L.DONKEY_DEF);
  assert.equal(L.renameDonkey(t, '###'), null);
  assert.equal(L.renameDonkey(t, '바람'), '바람');
  assert.equal(t.donkey.name, '바람');
});

test('petting raises 친밀도 a few times a real day; level ups are reported', () => {
  const s = withDonkey(0);
  let gain = 0;
  for (let k = 0; k < L.DONKEY_PETS_DAY + 3; k++) gain += L.donkeyPet(s, 1000, 0).gain;
  assert.equal(gain, L.DONKEY_PETS_DAY);
  assert.equal(L.donkeyPet(s, 2000, 0).gain, 0);
  assert.equal(L.donkeyPet(s, DAY + 10, 0).gain, 1, 'next local day');
  s.donkey.f = L.DONKEY_LV[0] - 1; s.donkey.pn = 0;
  const r = L.donkeyPet(s, DAY + 20, 0);
  assert.equal(r.up, 1); assert.equal(L.donkeyLevel(s), 1);
  assert.equal(L.donkeyPet(L.newState(0, seq(0.5)), 0, 0), null);
});

test('feeding takes one food from the basket (cheapest of the first kind it likes), daily cap, no food = nothing lost', () => {
  const s = withDonkey(0);
  assert.equal(L.donkeyFeed(s, 1000, 0).why, 'food');
  L.bagAdd(s, 'radish', 30); L.bagAdd(s, 'radish', 20); L.bagAdd(s, 'minnow', 5);
  const f0 = s.donkey.f;
  const r = L.donkeyFeed(s, 1000, 0);
  assert.equal(r.ok, true); assert.equal(r.id, 'radish');
  assert.equal(s.donkey.f, f0 + L.DONKEY_FEED_F);
  assert.equal(L.bagCount(s, 'radish'), 1);
  assert.equal(s.bag.find((e) => e.id === 'radish').v, 30, 'cheapest went first');
  for (let k = 0; k < 10; k++) L.bagAdd(s, 'potato', 60);
  let fed = 1;
  while (L.donkeyFeed(s, 1000, 0).ok) fed++;
  assert.equal(fed, L.DONKEY_FEEDS_DAY);
  const n = s.bag.length;
  assert.equal(L.donkeyFeed(s, 1000, 0).why, 'full');
  assert.equal(s.bag.length, n, 'a full day takes nothing');
  assert.equal(L.donkeyFeed(s, DAY + 1000, 0).ok, true);
  for (const id of L.DONKEY_FOOD) assert.ok(L.itemInfo(id), id);
});

test('levels open 깊은 숲, then 짐 싣기 (+basket slots), then 산꼭대기; all need the 숲', () => {
  const s = withDonkey(0);
  const cap0 = L.bagCap(s);
  assert.ok(!L.rideOk(s, 'deep') && !L.rideOk(s, 'peak'));
  s.donkey.f = L.DONKEY_LV[L.DEEP_LV - 1];
  assert.ok(L.rideOk(s, 'deep')); assert.ok(!L.rideOk(s, 'peak'));
  s.donkey.f = L.DONKEY_LV[L.LOAD_LV - 1];
  assert.equal(L.bagCap(s), cap0 + L.DONKEY_BAG);
  assert.ok(L.DONKEY_BAG > 0 && L.DONKEY_BAG <= 4, 'small');
  s.donkey.f = L.DONKEY_LV[L.PEAK_LV - 1];
  assert.ok(L.rideOk(s, 'peak'));
  assert.equal(L.rideOk(s, 'nope'), false);
  const t = rich(); L.buyDonkey(t, '', 0); t.donkey.f = 1e4;
  assert.ok(!L.rideOk(t, 'deep'), 'no 숲 path yet');
  assert.equal(L.DONKEY_ACTS.length, L.DONKEY_LV.length + 1);
});

test('8+ new finds that grow only in 깊은 숲 / 산꼭대기, never in the plain 숲; every season and time has some', () => {
  const deep = L.FORAGE.filter((f) => f.place === 'deep'), peak = L.FORAGE.filter((f) => f.place === 'peak');
  assert.ok(deep.length + peak.length >= 8, 'count');
  assert.ok(deep.length >= 4 && peak.length >= 4);
  for (const f of [...deep, ...peak]) {
    assert.ok(f.name && f.hint && f.price > 0 && L.FORAGE_CATS[f.cat] && L.CH_ZONE[f.rarity], f.id);
    assert.equal(L.itemInfo(f.id).kind, 'forage');
  }
  assert.ok([...deep, ...peak].some((f) => f.season) && [...deep, ...peak].some((f) => f.phase) && [...deep, ...peak].some((f) => f.wet), 'season/time/weather conditions');
  for (const se of L.SEASONS) for (const ph of ['morning', 'day', 'evening', 'night']) {
    const e = env(se, ph);
    assert.ok(!L.foragePool(e).some((x) => L.forageById(x.id).place), 'plain 숲 ' + se + ph);
    for (const pl of ['deep', 'peak']) {
      const pool = L.foragePool(Object.assign({ place: pl }, e));
      assert.ok(pool.length >= 1, pl + ' ' + se + ' ' + ph);
      assert.ok(pool.every((x) => L.forageById(x.id).place === pl));
    }
  }
});

test('ride spots: regrow, pick into the basket (bagAdd rules), 도전 win doubles, 첫 만남 보정', () => {
  const s = withDonkey(L.PEAK_LV);
  assert.equal(L.tickRide(s, 'deep', 0, env('spring', 'day'), seq(0.1)), L.RIDE_N.deep);
  assert.equal(L.rideReady(s, 'deep'), L.RIDE_N.deep);
  const id = s.donkey.deep[0].id;
  assert.equal(L.forageById(id).place, 'deep');
  const r = L.pickRide(s, 'deep', 0, 100, seq(0.5), false);
  assert.equal(r.id, id); assert.equal(r.n, 1);
  assert.equal(L.bagCount(s, id), 1);
  assert.equal(s.forest.dex[id], 1);
  assert.equal(L.pickRide(s, 'deep', 0, 100, seq(0.5), false), null, 'no double pick');
  assert.ok(L.rideNextAt(s, 'deep') > 100);
  // a common find + 도전 = two
  s.donkey.deep[1].id = 'mossclump';
  assert.equal(L.pickRide(s, 'deep', 1, 100, seq(0.5), true).n, 2);
  // full basket: overflow sells, as everywhere
  s.bag.length = 0; while (s.bag.length < L.bagCap(s)) L.bagAdd(s, 'radish', 30);
  const c0 = s.coins, r2 = L.pickRide(s, 'deep', 2, 100, seq(0.5), false);
  assert.ok(r2.sold > 0 && s.coins === c0 + r2.sold);
  // 첫 만남: an unpicked conditional find weighs more
  const f = L.FORAGE.find((x) => x.place === 'peak' && x.phase);
  const e = Object.assign({ place: 'peak' }, env(f.season ? f.season[0] : 'spring', f.phase[0]));
  const before = L.forageWeight(f, e, s);
  s.forest.dex[f.id] = 1;
  assert.ok(before > L.forageWeight(f, e, s));
  // not unlocked → nothing
  const t = withDonkey(0);
  assert.equal(L.tickRide(t, 'deep', 0, env(), seq(0.1)), 0);
  assert.equal(L.pickRide(t, 'deep', 0, 0, seq(0.5), false), null);
});

test('4+ insects live only in 깊은 숲 / 산꼭대기; places named', () => {
  assert.equal(L.BUG_PLACES.deep, '깊은 숲'); assert.equal(L.BUG_PLACES.peak, '산꼭대기');
  const only = L.BUGS.filter((b) => b.at.every((p) => p === 'deep' || p === 'peak'));
  assert.ok(only.length >= 4);
  assert.ok(only.some((b) => b.at.includes('deep')) && only.some((b) => b.at.includes('peak')));
  for (const b of only) {
    assert.equal(L.bugById(b.id), b);
    for (const p of ['farm', 'yard', 'forest', 'orchard']) assert.equal(L.bugWeight(b, p, env('summer', 'day')), 0);
  }
  assert.ok(L.rollBug('deep', env('summer', 'day'), seq(0.3)));
  assert.ok(L.rollBug('peak', env('summer', 'day'), seq(0.3)));
});

test('산꼭대기 constellations: 3+ extra, only offered at the summit; museum star and bug rooms include the new ones', () => {
  const peak = L.STARS.filter((c) => c.peak);
  assert.ok(peak.length >= 3);
  for (const c of peak) {
    assert.ok(c.path.every((p) => p === null || (p >= 0 && p < c.pts.length)), c.id);
    const g = L.starGame(c.id, seq(0.3, 0.7, 0.1, 0.9));
    let r; for (const k of g.taps) r = L.starTap(g, k);
    assert.equal(r, 'done', c.id);
  }
  const s = L.newState(0, seq(0.5));
  for (const se of L.SEASONS) for (let k = 0; k < 20; k++) assert.ok(!L.starById(L.starFor(s, se, () => k / 20)).peak, 'yard never shows a peak one');
  // at the summit an unseen peak constellation comes first
  const got = new Set();
  for (let k = 0; k < 20; k++) got.add(L.starFor(s, 'spring', () => k / 20, true));
  assert.ok([...got].some((id) => L.starById(id).peak));
  assert.deepEqual(L.MUSEUM_ROOMS.star.ids, L.STARS.map((c) => c.id));
  assert.deepEqual(L.MUSEUM_ROOMS.bug.ids, L.BUGS.map((b) => b.id));
  // the star room still completes with every star seen
  const m = L.newState(0, seq(0.5)); m.coins = 1e5; L.buyScope(m); m.rep = 50;
  L.STARS.forEach((c) => L.seeStar(m, c.id, 1));
  L.MUSEUM_ROOMS.star.ids.forEach((id) => assert.ok(L.canDonate(m, 'star', id), id));
});

test('GUIDE: 당나귀 / 깊은 숲 / 산꼭대기 lines with real numbers, open with the real state, scene tips', () => {
  const by = (id) => L.GUIDE.find((g) => g.id === id);
  for (const id of ['donkey', 'deep', 'peak']) assert.ok(by(id), id);
  assert.match(by('donkey').lock, new RegExp('★' + L.DONKEY_REP));
  assert.match(by('donkey').lock, new RegExp(String(L.DONKEY_COST).replace(/\B(?=(\d{3})+(?!\d))/g, ',')));
  assert.match(by('deep').lock, new RegExp('친밀도 ' + L.DEEP_LV));
  assert.match(by('peak').lock, new RegExp('친밀도 ' + L.PEAK_LV));
  assert.match(by('donkey').how, new RegExp('\\+' + L.DONKEY_BAG + '칸'));
  const s = withDonkey(0);
  assert.ok(L.guideOpen(s, 'donkey') && !L.guideOpen(s, 'deep') && !L.guideOpen(s, 'peak'));
  s.donkey.f = 1e4;
  assert.ok(L.guideOpen(s, 'deep') && L.guideOpen(s, 'peak'));
  assert.ok(!L.guideOpen(L.newState(0, seq(0.5)), 'donkey'));
  assert.equal(L.guideTip(s, 'deep').id, 'deep');
  assert.equal(L.guideTip(s, 'peak').id, 'peak');
});

test('save: decode(encode(s)) keeps s.donkey; junk is cleaned; old fixtures load without it', () => {
  const s = withDonkey(L.PEAK_LV);
  L.renameDonkey(s, '구름');
  L.donkeyPet(s, 500, 0);
  L.tickRide(s, 'deep', 0, env(), seq(0.2)); L.tickRide(s, 'peak', 0, env(), seq(0.2));
  const o = L.decode(L.encode(s));
  assert.deepEqual(o.donkey, s.donkey);
  const bad = JSON.parse(L.encode(s));
  bad.donkey = { name: '<x>'.repeat(9), f: -5, pn: 99, deep: [{ at: 'x', id: 'nope' }, null], peak: 'zz', day: 'q' };
  const d = L.decode(JSON.stringify(bad)).donkey;
  assert.ok(d && d.f === 0 && d.pn <= L.DONKEY_PETS_DAY && !/[<>]/.test(d.name) && d.name.length > 0);
  assert.equal(d.deep[0].id, null); assert.equal(d.deep.length, L.RIDE_N.deep);
  assert.equal(L.decode(JSON.stringify(Object.assign(bad, { donkey: 7 }))).donkey, undefined);
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    if (/"donkey":/.test(raw)) continue;   // saved by stage 9+
    const x = L.decode(raw);
    assert.ok(x, f); assert.equal(x.donkey, undefined, f);
    assert.equal(L.rideOk(x, 'deep'), false, f);
  }
});

test('a loaded basket counts the donkey\'s extra slots (자동 판매 끔, full to the limit)', () => {
  const s = L.newState(0, () => 0);
  s.rep = 99; s.coins = 1e6; assert.ok(L.buyDonkey(s, '', 0).ok); s.donkey.f = 1e4; s.noSell = true;
  const cap = L.bagCap(s);
  while (s.bag.length < cap + L.BAG_OVER) L.bagAdd(s, 'radish', 30);
  assert.ok(L.BAG_OVER > 0 && s.bag.length === cap + L.BAG_OVER);
  assert.equal(L.decode(L.encode(s)).bag.length, s.bag.length);
});
