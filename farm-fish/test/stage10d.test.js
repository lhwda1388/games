// test/stage10d.test.js — stage 10 lane ④: 날씨 장난감, 계절 도감 챌린지
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = require('../build.js').build();
vm.runInThisContext(html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1], { filename: 'logic.js' });
const L = globalThis.Logic;
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const fresh = () => L.newState(0, seq(0.5));
const WEEK = 7 * 86400e3, MON0 = 4 * 86400e3, H = 3600e3, DAY = 86400e3;
const SPRING = MON0 + 100 * 4 * WEEK + H;               // a spring Monday, 01:00 UTC
const at = (se, year) => SPRING + L.SEASONS.indexOf(se) * WEEK + (year || 0) * 4 * WEEK;

// a farm where everything with a season can be reached
function rich() {
  const s = fresh();
  s.coins = 1e7; s.rep = 200;
  assert.ok(L.buySpot(s, 'river')); assert.ok(L.buySpot(s, 'sea'));
  assert.ok(L.unlockForest(s, 0).ok);
  assert.ok(L.unlockOrchard(s).ok);
  assert.ok(L.buyNet(s).ok !== false);
  assert.ok(L.buyScope(s).ok !== false);
  return s;
}
const count = (s, g) => ({
  fish: () => (s.dex.fish[g.k === 'fish' && g.id] ? s.dex.fish[g.id].n : 0),
  crop: () => s.dex.crops[g.id] || 0,
  forage: () => (s.forest && s.forest.dex[g.id]) || 0,
  bug: () => (s.bugs && s.bugs.dex[g.id]) || 0,
  flat: () => (s.flat && s.flat.dex[g.id]) || 0,
  star: () => (s.sky && s.sky.seen[g.id] ? 1 : 0)
})[g.k]();
// record one more of a goal the way the game does
function record(s, g, t) {
  if (g.k === 'fish') { const d = s.dex.fish[g.id] || { n: 0, best: 0 }; s.dex.fish[g.id] = { n: d.n + 1, best: d.best || 10 }; }
  else if (g.k === 'crop') s.dex.crops[g.id] = (s.dex.crops[g.id] || 0) + 1;
  else if (g.k === 'forage') s.forest.dex[g.id] = (s.forest.dex[g.id] || 0) + 1;
  else if (g.k === 'bug') s.bugs.dex[g.id] = (s.bugs.dex[g.id] || 0) + 1;
  else if (g.k === 'flat') { s.flat = s.flat || { spots: [], dex: {} }; s.flat.dex[g.id] = (s.flat.dex[g.id] || 0) + 1; }
  else if (g.k === 'star') L.seeStar(s, g.id, t);
}
const seasonsOf = (x) => (Array.isArray(x.season) ? x.season : x.season ? [x.season] : []);

// ---------- 날씨 장난감 ----------
test('toys: each toy belongs to its weather/season', () => {
  assert.equal(L.toyOn('splash', { season: 'summer', weather: 'rain' }), true);
  assert.equal(L.toyOn('splash', { season: 'summer', weather: 'clear' }), false);
  assert.equal(L.toyOn('step', { season: 'winter', weather: 'snow' }), true);
  assert.equal(L.toyOn('step', { season: 'winter', weather: 'clear' }), false);
  assert.equal(L.toyOn('leaves', { season: 'autumn', weather: 'clear' }), true);
  assert.equal(L.toyOn('leaves', { season: 'spring', weather: 'clear' }), false);
  assert.equal(L.toyOn('nope', { season: 'autumn', weather: 'rain' }), false);
  assert.ok(L.TOY_PILE_REGROW > 0 && L.TOY_DAY_CAP >= 1 && L.TOY_DAY_CAP <= 10);
});

test('toys: just playing changes nothing; a lucky play gives a little', () => {
  const s = fresh(), c0 = s.coins;
  const r = L.toyPlay(s, 'splash', SPRING, 0, seq(0.99), false);
  assert.equal(r.reward, null);
  assert.equal(s.toy, undefined, 'no save field until something is given');
  assert.equal(s.coins, c0);
  const w = L.toyPlay(s, 'splash', SPRING, 0, seq(0, 0.5), false);
  assert.ok(w.reward.coins >= L.TOY_COINS[0] && w.reward.coins <= L.TOY_COINS[1]);
  assert.equal(s.coins, c0 + w.reward.coins);
});

test('toys: leaf piles give 도토리 into the basket (bagAdd), coins when the basket is blocked', () => {
  const s = fresh();
  const r = L.toyPlay(s, 'leaves', SPRING, 0, seq(0), false);
  assert.equal(r.reward.id, 'acorn');
  assert.deepEqual(s.bag.map((e) => e.id), ['acorn']);
  const c0 = s.coins, b = L.toyPlay(s, 'leaves', SPRING, 0, seq(0, 0.5), true);
  assert.equal(b.reward.id, undefined);
  assert.ok(b.reward.coins > 0);
  assert.equal(s.coins, c0 + b.reward.coins);
  assert.equal(s.bag.length, 1);
});

test('toys: a daily cap keeps it a toy, and it resets the next local day', () => {
  const s = fresh();
  let got = 0;
  for (let k = 0; k < 40; k++) if (L.toyPlay(s, 'step', SPRING + k * 1000, 0, seq(0, 0.5), false).reward) got++;
  assert.equal(got, L.TOY_DAY_CAP);
  assert.equal(L.toyLeft(s, SPRING, 0), 0);
  assert.ok(L.toyPlay(s, 'step', SPRING + DAY, 0, seq(0, 0.5), false).reward, 'new day');
  assert.equal(L.toyLeft(s, SPRING + DAY, 0), L.TOY_DAY_CAP - 1);
  // the day follows the player's clock (tzMin)
  const z = fresh();
  for (let k = 0; k < L.TOY_DAY_CAP; k++) L.toyPlay(z, 'step', SPRING, 0, seq(0, 0.5), false);
  assert.equal(L.toyLeft(z, SPRING, 0), 0);
  assert.equal(L.toyLeft(z, SPRING, 23 * 60), L.TOY_DAY_CAP, 'already tomorrow 23h east');
});

// ---------- 계절 도감 챌린지 ----------
test('quest: the week maps to the same season as the game clock', () => {
  for (const se of L.SEASONS) for (const y of [0, 1, 3]) {
    const t = at(se, y) + 3 * DAY;
    assert.equal(L.questSeason(L.questWeek(t, 0)), se);
    assert.equal(L.gameClock(t, 540).season, L.questSeason(L.questWeek(t, 540)));
  }
});

test('quest: five goals, deterministic, only from this season when enough are left', () => {
  for (const se of L.SEASONS) {
    const a = rich(), b = rich(), t = at(se);
    const qa = L.questEnsure(a, t, 0), qb = L.questEnsure(b, t + 2 * DAY, 0);
    assert.equal(qa.list.length, L.QUEST_N);
    assert.deepEqual(qa.list, qb.list, 'same week, same picks');
    const ids = new Set();
    for (const g of qa.list) {
      const it = L.questItem(g.k, g.id);
      assert.ok(it && it.name, g.k + ' ' + g.id);
      assert.deepEqual(seasonsOf(it.def), [se], se + ': only-this-season first (' + g.id + ')');
      assert.notEqual(it.def.rarity, '전설');
      assert.equal(g.b, 0, 'not recorded yet');
      assert.ok(!ids.has(g.k + g.id)); ids.add(g.k + g.id);
    }
    assert.ok(new Set(qa.list.map((g) => g.k)).size >= 2, 'a mix of kinds');
  }
  // another year's spring may pick differently, but stays valid
  const y = L.questEnsure(rich(), at('spring', 1), 0);
  assert.equal(y.list.length, L.QUEST_N);
});

test('quest: things already recorded are skipped; locked places are not asked for', () => {
  const s = rich(), t = at('summer');
  const first = L.questEnsure(rich(), t, 0).list;
  first.forEach((g) => record(s, g, t));
  const q = L.questEnsure(s, t, 0);
  for (const g of q.list) assert.ok(!first.some((f) => f.k === g.k && f.id === g.id), 'recorded ones skipped: ' + g.id);
  // a fresh farm: no 숲/갯벌/망원경/잠자리채, so none of those
  const f = L.questEnsure(fresh(), at('autumn'), 0);
  for (const g of f.list) assert.ok(['fish', 'crop'].includes(g.k), g.k);
  for (const g of f.list) if (g.k === 'fish') assert.ok(!L.fishById(g.id).spot || L.fishById(g.id).spot === 'pond', g.id);
});

test('quest: falls back so the card always has five (multi-season, then "again", then basics)', () => {
  for (const se of L.SEASONS) {
    const s = fresh(), q = L.questEnsure(s, at(se), 0);
    assert.equal(q.list.length, L.QUEST_N, se);
    const keys = q.list.map((g) => g.k + g.id);
    assert.equal(new Set(keys).size, keys.length, 'no duplicates');
    q.list.forEach((g) => assert.equal(g.b, count(s, g)));
  }
  // everything this season already recorded → "again" goals with a base count
  const s = rich(), t = at('winter');
  const all = [];
  L.FISH.forEach((f) => { if (seasonsOf(f).includes('winter')) all.push({ k: 'fish', id: f.id }); });
  L.FLAT.forEach((f) => { if (seasonsOf(f).includes('winter')) all.push({ k: 'flat', id: f.id }); });
  L.FORAGE.forEach((f) => { if (seasonsOf(f).includes('winter')) all.push({ k: 'forage', id: f.id }); });
  L.BUGS.forEach((f) => { if (seasonsOf(f).includes('winter')) all.push({ k: 'bug', id: f.id }); });
  L.STARS.forEach((c) => { if (seasonsOf(c).includes('winter')) all.push({ k: 'star', id: c.id }); });
  L.SEASON_CROPS.forEach((c) => { if (c.season === 'winter') all.push({ k: 'crop', id: c.id }); });
  all.forEach((g) => record(s, g, t));
  const q = L.questEnsure(s, t, 0);
  assert.equal(q.list.length, L.QUEST_N);
  q.list.forEach((g) => assert.ok(g.b >= 1, 'again: ' + g.id));
});

test('quest: progress ticks off from real records; completing gives the season decoration once', () => {
  const s = rich(), t = at('spring');
  const q = L.questEnsure(s, t, 0);
  assert.equal(L.questProgress(s).n, 0);
  assert.equal(L.questClaim(s), null, 'not done yet');
  q.list.slice(0, 4).forEach((g) => record(s, g, t));
  const p = L.questProgress(s);
  assert.equal(p.n, 4); assert.equal(p.list.filter((g) => g.done).length, 4);
  assert.equal(L.questClaim(s), null);
  record(s, q.list[4], t);
  assert.equal(L.questProgress(s).n, L.QUEST_N);
  const r = L.questClaim(s);
  assert.equal(r.deco, L.QUEST_DECOS.spring);
  assert.ok(s.yard.deco[L.QUEST_DECOS.spring]);
  assert.equal(L.questClaim(s), null, 'claimed once per season');
  assert.ok(L.decoById(L.QUEST_DECOS.spring).merchant, 'not sold in the shop');
  // the four decorations are different
  assert.equal(new Set(L.SEASONS.map((se) => L.QUEST_DECOS[se])).size, 4);
});

test('quest: a new season gets a new card; a missed season comes back next year; no duplicate decoration', () => {
  const s = rich();
  L.questEnsure(s, at('spring'), 0);
  const sw = L.questEnsure(s, at('summer'), 0);
  assert.equal(L.questSeason(sw.w), 'summer');
  assert.equal(L.questCardDue(s), true);
  L.questCardSeen(s);
  assert.equal(L.questCardDue(s), false);
  // summer missed; next year's summer still gives the summer decoration
  const t2 = at('summer', 1), q2 = L.questEnsure(s, t2, 0);
  assert.equal(L.questCardDue(s), true);
  q2.list.forEach((g) => record(s, g, t2));
  assert.equal(L.questClaim(s).deco, L.QUEST_DECOS.summer);
  // the summer after that: coins instead of a second decoration
  const t3 = at('summer', 2), q3 = L.questEnsure(s, t3, 0);
  q3.list.forEach((g) => record(s, g, t3));
  const c0 = s.coins, r3 = L.questClaim(s);
  assert.equal(r3.deco, undefined);
  assert.equal(r3.coins, L.QUEST_COINS);
  assert.equal(s.coins, c0 + L.QUEST_COINS);
});

// ---------- 놀거리 수첩 ----------
test('GUIDE has a line for both, with numbers from the constants', () => {
  const by = (id) => L.GUIDE.find((g) => g.id === id);
  assert.ok(by('wxtoy') && by('quest'));
  assert.match(by('wxtoy').how, new RegExp('하루 ' + L.TOY_DAY_CAP + '번'));
  assert.match(by('quest').how, new RegExp(String(L.QUEST_N) + '개'));
  assert.match(by('quest').how, new RegExp(L.QUEST_COINS.toLocaleString('en-US')));
  assert.equal(L.guideOpen(fresh(), 'wxtoy'), true);
  assert.equal(L.guideOpen(fresh(), 'quest'), true);
});

// ---------- save ----------
test('save: s.toy and s.quest round-trip; junk is dropped; old fixtures load without them', () => {
  const s = rich(), t = at('autumn');
  L.questEnsure(s, t, 0); L.questCardSeen(s);
  L.toyPlay(s, 'splash', t, 0, seq(0, 0.5), false);
  const d = L.decode(L.encode(s));
  assert.deepEqual(d.quest, s.quest);
  assert.deepEqual(d.toy, s.toy);
  const o = JSON.parse(L.encode(s));
  o.quest.list.push({ k: 'fish', id: 'nope', b: 0 }, { k: 'zzz', id: 'minnow', b: 0 });
  o.quest.got = { spring: true, nope: true }; o.quest.w = 'x';
  o.toy = { d: 'x', n: -4 };
  const j = L.decode(JSON.stringify(o));
  assert.equal(j.quest, undefined, 'a quest without a week is dropped');
  assert.equal(j.toy, undefined);
  o.quest.w = s.quest.w; o.toy = { d: 3, n: 99 };
  const k = L.decode(JSON.stringify(o));
  assert.equal(k.quest.list.length, L.QUEST_N);
  assert.deepEqual(k.quest.got, { spring: true });
  assert.equal(k.toy.n, L.TOY_DAY_CAP);
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8'), x = L.decode(raw), j2 = JSON.parse(raw);
    assert.ok(x, f);
    for (const key of ['toy', 'quest']) if (j2[key] === undefined) assert.equal(x[key], undefined, f + ': ' + key);
  }
});

test('season challenge never picks a constellation already seen (it could never be seen "again")', () => {
  const s = L.newState(0, () => 0); s.rep = 99; s.coins = 1e6;
  L.buyScope(s, 0); s.sky.seen = {}; L.STARS.forEach(c => { s.sky.seen[c.id] = 1; });
  for (let w = 0; w < 8; w++) {
    delete s.quest;
    const q = L.questEnsure(s, w * 7 * 86400e3 + 3600e3, 0);
    assert.ok(!q.list.some(g => g.k === 'star'), 'week ' + w);
  }
});

test('season challenge never picks something that needs one kind of weather; a card already saved stays', () => {
  for (let k = 0; k < 16; k++) {
    const se = L.SEASONS[k % 4], s = rich(), q = L.questEnsure(s, at(se, k >> 2), 0);
    q.list.forEach((g) => {
      const d = L.questItem(g.k, g.id).def;
      assert.ok(!d.weather && !d.wet && (!d.wx || d.wx === 'dry'), se + ' ' + g.k + ':' + g.id);
    });
  }
  const s = rich(), q = L.questEnsure(s, at('spring'), 0);
  q.list[0] = { k: 'bug', id: 'mayfly', b: 0 };
  assert.equal(L.questEnsure(s, at('spring') + DAY, 0).list[0].id, 'mayfly');
});
