// farm-fish/test/stage10a.test.js — stage 10 lane ①: 박 영감 낚시 대회, 한 해 결산 카드, 농장 간판
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
const DAY = 86400e3, WEEK = 7 * DAY, MON0 = 4 * DAY, H = 3600e3;
const W0 = MON0 + 100 * 4 * WEEK + H;      // a Monday 01:00 UTC at the start of a game year (spring)
const friend = (s) => { s.res = s.res || { f: {}, lv: {}, rec: {}, unread: [] }; s.res.f.fisher = 5; s.res.lv.fisher = L.CONTEST_FRIEND; return s; };
const roll = (id, frac) => { const f = L.fishById(id); return { id, size: Math.round((f.min + (f.max - f.min) * frac) * 10) / 10 }; };

// ---------- 낚시 대회 ----------
test('contest: opens with 박 영감 friendship; week key is the real (local) week', () => {
  const s = fresh();
  assert.equal(L.contestOk(s), false);
  assert.equal(L.contestTick(s, W0, 0), null);
  assert.equal(s.cont, undefined, 'nothing saved while closed');
  friend(s);
  assert.equal(L.contestOk(s), true);
  assert.equal(L.contestWeek(W0, 0), L.contestWeek(W0 + 6 * DAY + 22 * H, 0));
  assert.equal(L.contestWeek(W0, 0) + 1, L.contestWeek(W0 + WEEK, 0));
  // a timezone shifts where the week starts
  assert.equal(L.contestWeek(W0 - 2 * H, 0) + 1, L.contestWeek(W0 - 2 * H, 180));
});

test('contest mark: deterministic from the week, a little higher for a stronger player, capped', () => {
  for (let wk = 100; wk < 140; wk++) {
    const a = L.contestMark(wk, 0), b = L.contestMark(wk, 0), c = L.contestMark(wk, 4);
    assert.deepEqual(a, b);
    assert.ok(L.fishById(a.fish), a.fish);
    assert.ok(a.f >= L.CONTEST_BASE && a.f <= L.CONTEST_MAX, String(a.f));
    assert.ok(c.f > a.f || c.f === L.CONTEST_MAX);
    const f = L.fishById(a.fish);
    assert.ok(a.size >= f.min && a.size <= f.max);
  }
  const marks = new Set(); for (let wk = 0; wk < 20; wk++) marks.add(L.contestMark(wk, 1).f);
  assert.ok(marks.size > 5, 'varies by week');
  const s = fresh(); assert.equal(L.contestLevel(s), 0);
  s.up.rod = 3; s.spotOk = { river: true, sea: true }; assert.equal(L.contestLevel(s), 4);
});

test('contest: best catch of the week\'s fish by size fraction; win → trophy deco + coins, once per week', () => {
  const s = friend(fresh());
  L.contestTick(s, W0, 0);
  const wk = s.cont.wk, mark = L.contestMark(wk, s.cont.lv, false, false), fish = mark.fish;
  assert.equal(L.contestState(s, W0, 0).best, null);
  // other species don't count, however big
  assert.equal(L.contestCatch(s, roll('minnow', 1), W0 + H, 0), null);
  assert.equal(s.cont.best, null);
  // a small catch, then a big one: the fraction counts, not the cm
  let r = L.contestCatch(s, roll(fish, 0.1), W0 + H, 0);
  assert.equal(r.best, true); assert.equal(r.ahead, false);
  r = L.contestCatch(s, roll(fish, 0.05), W0 + 2 * H, 0);
  assert.equal(r.best, false);
  r = L.contestCatch(s, roll(fish, 1), W0 + 3 * H, 0);
  assert.equal(r.best, true); assert.equal(r.ahead, true);
  assert.equal(L.contestState(s, W0 + 3 * H, 0).best.id, fish);
  const coins = s.coins;
  const news = L.contestTick(s, W0 + WEEK + H, 0);
  assert.equal(news.win, true);
  assert.equal(news.tier, 1 - mark.f >= L.CONTEST_MARGIN.gold ? 'gold' : 1 - mark.f >= L.CONTEST_MARGIN.silver ? 'silver' : 'bronze');
  assert.equal(news.trophy, L.trophyId(wk, news.tier));
  assert.ok(L.decoById(news.trophy), 'trophy is a decoration');
  assert.equal(s.yard.deco[news.trophy], true);
  assert.equal(s.coins, coins + news.coins);
  assert.equal(s.cont.won[wk], news.tier);
  assert.equal(s.cont.wk, wk + 1);
  assert.equal(s.cont.best, null);
  // the news waits until shown, then is gone
  assert.deepEqual(L.contestNews(s), news);
  assert.equal(L.contestNews(s), null);
  // ticking again in the new week does nothing
  assert.equal(L.contestTick(s, W0 + WEEK + 2 * H, 0), null);
});

test('contest: tiers from the margin, distinct trophy per week shape; owned → coins instead', () => {
  const tiers = new Set(), shapes = new Set();
  for (let wk = 0; wk < 8; wk++) for (const t of ['gold', 'silver', 'bronze']) { const id = L.trophyId(wk, t); tiers.add(id); shapes.add(id.split('_')[0]); }
  assert.ok(shapes.size >= 3, 'a few shapes');
  assert.equal(tiers.size, shapes.size * 3);
  assert.equal(L.contestTier(0.9, 0.9), 'bronze');
  assert.equal(L.contestTier(0.9 + L.CONTEST_MARGIN.silver, 0.9), 'silver');
  assert.equal(L.contestTier(0.5 + L.CONTEST_MARGIN.gold, 0.5), 'gold');
  assert.equal(L.contestTier(0.89, 0.9), null);
  // same shape + tier again some weeks later: no duplicate deco, extra coins
  const s = friend(fresh());
  L.contestTick(s, W0, 0);
  const wk = s.cont.wk, id0 = L.trophyId(wk, 'gold');
  L.yardOf(s).deco[id0] = true;
  s.cont.lv = 0;
  L.contestCatch(s, roll(L.contestMark(wk, 0, false, false).fish, 1), W0 + H, 0);
  const tier = L.contestTier(1, L.contestMark(wk, 0, false, false).f);
  if (tier === 'gold') {
    const n = L.contestTick(s, W0 + WEEK + H, 0);
    assert.equal(n.owned, true);
    assert.equal(n.coins, L.CONTEST_COINS.gold + L.CONTEST_DUP_COINS);
  }
});

test('contest: lose → a teasing letter (kept), small coins; no catch → no result', () => {
  const s = friend(fresh());
  L.contestTick(s, W0, 0);
  const wk = s.cont.wk;
  L.contestCatch(s, roll(L.contestMark(wk, s.cont.lv, false, false).fish, 0), W0 + H, 0);
  const c0 = s.coins, n = L.contestTick(s, W0 + WEEK + H, 0);
  assert.equal(n.win, false);
  assert.equal(n.coins, L.CONTEST_TRY_COINS);
  assert.equal(s.coins, c0 + L.CONTEST_TRY_COINS);
  assert.equal(typeof n.letter, 'string');
  assert.ok(n.letter.length > 10);
  assert.equal(s.cont.won[wk], undefined);
  assert.equal(s.cont.mail.length, 1);
  assert.equal(L.contestLetter(s.cont.mail[0]), n.letter);
  // a week with no catch: nothing
  L.contestNews(s);
  assert.equal(L.contestTick(s, W0 + 2 * WEEK + H, 0), null);
  assert.equal(s.cont.mail.length, 1);
});

test('contest species: pond/river fish until the sea opens, then sea fish; gold is in reach most weeks', () => {
  const lo = new Set(), hi = new Set();
  let goldOk = 0;
  for (let wk = 100; wk < 200; wk++) {
    const a = L.contestMark(wk, 0), b = L.contestMark(wk, 4, true);
    assert.ok(L.CONTEST_FISH.includes(a.fish) && L.fishById(a.fish).spot !== 'sea', a.fish);
    assert.equal(L.fishById(b.fish).spot, 'sea', b.fish);
    assert.ok(L.CONTEST_SEA_FISH.includes(b.fish));
    lo.add(a.fish); hi.add(b.fish);
    assert.ok(b.f <= L.CONTEST_MAX && b.f >= L.CONTEST_BASE);
    if (L.contestTier(1, b.f) === 'gold') goldOk++;
    // a near-max fish at least beats him
    assert.ok(L.contestTier(1, b.f));
  }
  assert.ok(lo.size >= 4 && hi.size >= 3, 'species vary by week');
  assert.ok(goldOk >= 30 && goldOk <= 90, 'gold needs a big one, and some weeks only silver: ' + goldOk);
  // the player's state picks the pool
  const s = friend(fresh());
  s.spotOk = { river: true, sea: true };
  L.contestTick(s, W0, 0);
  const st = L.contestState(s, W0, 0);
  assert.equal(st.mark.fish, L.contestMark(s.cont.wk, s.cont.lv, true).fish);
  assert.equal(L.fishById(st.mark.fish).spot, 'sea');
});

test('contest pool: a pond-only player only gets pond fish (the river is shut)', () => {
  for (let wk = 100; wk < 200; wk++) {
    const f = L.fishById(L.contestMark(wk, 0, false, false).fish);
    assert.ok(!f.spot || f.spot === 'pond', f.id);
  }
  const s = friend(fresh());
  L.contestTick(s, W0, 0);
  assert.equal(s.cont.river, false);
  assert.ok(!L.fishById(L.contestState(s, W0, 0).mark.fish).spot);
});

test('contest: a spot opening mid-week keeps that week\'s species and lead; next week uses it', () => {
  const s = friend(fresh());
  L.contestTick(s, W0, 0);
  const mk = L.contestState(s, W0, 0).mark;
  L.contestCatch(s, roll(mk.fish, 1), W0 + H, 0);
  s.spotOk = { river: true, sea: true };
  const st = L.contestState(s, W0 + 2 * H, 0);
  assert.equal(st.mark.fish, mk.fish);
  assert.equal(st.mark.f, mk.f);
  assert.ok(st.best && st.best.f === 1);
  const n = L.contestTick(s, W0 + WEEK + H, 0);
  assert.equal(n.win, true, 'the lead still wins');
  assert.equal(s.cont.sea, true);
  assert.equal(L.fishById(L.contestState(s, W0 + WEEK + H, 0).mark.fish).spot, 'sea');
  // the snapshot survives a save; an older save without it reads the live flags
  assert.equal(L.decode(L.encode(s)).cont.sea, true);
  delete s.cont.sea; delete s.cont.river;
  const back = L.decode(L.encode(s));
  assert.equal(back.cont.sea, undefined);
  assert.equal(L.contestState(back, W0 + WEEK + H, 0).mark.fish, L.contestMark(s.cont.wk, s.cont.lv, true).fish);
});

test('contest: an older save\'s best of another species only takes part (참가상), settled weeks stay', () => {
  const s = friend(fresh());
  L.contestTick(s, W0, 0);
  const wk = s.cont.wk, fish = L.contestMark(wk, s.cont.lv, false, false).fish, other = fish === 'crucian' ? 'catfish' : 'crucian';
  s.cont.won[wk - 1] = 'gold';
  s.cont.best = { id: other, size: L.fishById(other).max, f: 1 };     // saved before the species rule
  assert.equal(L.contestState(s, W0, 0).best, null);
  const n = L.contestTick(s, W0 + WEEK + H, 0);
  assert.equal(n.win, false);
  assert.equal(n.coins, L.CONTEST_TRY_COINS);
  assert.equal(s.cont.won[wk - 1], 'gold');
  assert.equal(s.cont.won[wk], undefined);
});

test('contest talk and calendar text use the numbers', () => {
  const s = friend(fresh());
  L.contestTick(s, W0, 0);
  const st = L.contestState(s, W0, 0);
  assert.ok(st.left > 6 * DAY && st.left <= WEEK);
  assert.match(L.contestTalk(s, W0, 0), /박 영감|내 기록|자네/);
  assert.match(L.contestTalk(s, W0, 0), new RegExp(L.fishById(st.mark.fish).name + ' 대회'));
  L.contestCatch(s, roll(st.mark.fish, 1), W0 + H, 0);
  assert.equal(typeof L.contestTalk(s, W0 + H, 0), 'string');
});

// ---------- 한 해 결산 카드 ----------
test('year card: built when the game year ends, from what happened that year', () => {
  const s = fresh();
  s.born = W0;
  assert.equal(L.yearTick(s, W0, 0), null);
  assert.equal(s.yr.y, L.gameYear(W0, 0));
  assert.equal(L.gameYear(W0 + 4 * WEEK - H - 1, 0), s.yr.y);
  assert.equal(L.gameYear(W0 + 4 * WEEK - H, 0), s.yr.y + 1);
  L.yearCatch(s, roll('crucian', 0.5));
  L.yearCatch(s, roll('carp', 0.9));
  L.yearCatch(s, roll('minnow', 1));
  s.dex.dish.maeuntang = 2; s.dex.dish.saengchae = 5;
  s.spotOk = { river: true };
  const pre = L.yearPreview(s, W0 + WEEK, 0);
  assert.equal(pre.n, 3);
  assert.equal(pre.big.id, 'carp');
  assert.ok(pre.open.indexOf('river') >= 0);
  assert.equal(s.yr.cards.length, 0, 'preview saves nothing');
  const card = L.yearTick(s, W0 + 4 * WEEK + H, 0);
  assert.equal(card.n, 3);
  assert.equal(card.dish.id, 'saengchae'); assert.equal(card.dish.n, 5);
  assert.equal(card.fy, 1, 'the farm year that just ended');
  assert.deepEqual(s.yr.cards[0], card);
  assert.equal(s.yr.n, 0);
  assert.deepEqual(L.yearNews(s), card);
  assert.equal(L.yearNews(s), null);
  assert.equal(L.yearTick(s, W0 + 4 * WEEK + 2 * H, 0), null);
  // only the last few cards are kept
  for (let k = 2; k < L.YEAR_KEEP + 4; k++) L.yearTick(s, W0 + k * 4 * WEEK + H, 0);
  assert.equal(s.yr.cards.length, L.YEAR_KEEP);
});

// ---------- 농장 간판 ----------
test('farm name + sign shape: cleaned, length-limited, optional', () => {
  const s = fresh();
  assert.equal(L.farmName(s), '');
  assert.ok(L.SIGNS.length >= 4);
  assert.deepEqual(L.setFarm(s, '  <b>햇살</b> 농장 ', 2), { ok: true, name: 'b햇살b 농장' });
  assert.equal(s.farm.sign, 2);
  assert.equal(L.setFarm(s, 'x'.repeat(40), 1).name.length, L.FARM_NAME_MAX);
  assert.equal(L.setFarm(s, 'ok', 99).ok, false);
  L.setFarm(s, '', 0);
  assert.equal(s.farm.name, undefined);
  assert.equal(L.farmName(s), '');
});

test('friend code carries the farm name; old stage-4 and stage-8 codes still decode', () => {
  const s = fresh();
  s.born = 0; s.nick = '박농부'; s.dex.fish.crucian = { n: 3, best: 21.5 }; s.rep = 7;
  const plain = L.encodeShare(L.shareStats(s, 40 * DAY));
  assert.equal(plain, 'FF1-115h0z2l11fk-2-crucian-5z-1-0-0-7-0-0-0-vf9n', 'no farm name → same code as before');
  L.setFarm(s, '햇살 농장', 3);
  const st = L.shareStats(s, 40 * DAY);
  assert.deepEqual(st.farm, { name: '햇살 농장', sign: 3 });
  const code = L.encodeShare(st);
  assert.deepEqual(L.decodeShare(code), st);
  s.dex.fish.carp = { n: 1, best: 55.2 }; s.dex.fish.minnow = { n: 2, best: 8.1 };
  const st2 = L.shareStats(s, 40 * DAY), code2 = L.encodeShare(st2);
  assert.deepEqual(L.decodeShare(code2), st2);
  for (let k = 4; k < code2.length; k++) {
    if (code2[k] === '-' || code2[k] === '.') continue;
    assert.equal(L.decodeShare(code2.slice(0, k) + (code2[k] === '1' ? '2' : '1') + code2.slice(k + 1)), null);
  }
  // fixed strings from the stage-9 build
  const old4 = L.decodeShare('FF1-115h0z2l11fk-2-crucian-5z-1-0-0-7-0-0-0-vf9n');
  assert.equal(old4.nick, '박농부'); assert.equal(old4.farm, undefined);
  const old8 = L.decodeShare('FF1-115h0z2l11fk-2-carp-fc-3-0-0-7-0-0-0-crucian.5z.minnow.29-onba');
  assert.equal(old8.recs.length, 2); assert.equal(old8.farm, undefined);
  // a forged farm part can't carry markup or a bad shape
  const forge = (part) => { const b = 'FF1--1-crucian-1-1-0-0-0-0-0-0-' + part; return b + '-' + ('0000' + (L.strHash(b) % 1679616).toString(36)).slice(-4); };
  const lt = '<'.charCodeAt(0).toString(36).padStart(4, '0'), a = 'a'.charCodeAt(0).toString(36).padStart(4, '0');
  assert.equal(L.decodeShare(forge('n0' + lt + a + lt)).farm.name, 'a');
  assert.equal(L.decodeShare(forge('nz' + a)), null);
  assert.equal(L.decodeShare(forge('n0')), null);
});

// ---------- save ----------
test('s.cont / s.yr / s.farm round-trip; junk is dropped', () => {
  const s = friend(fresh());
  L.contestTick(s, W0, 0);
  L.contestCatch(s, roll(L.contestMark(s.cont.wk, s.cont.lv, false, false).fish, 0.4), W0 + H, 0);
  L.yearTick(s, W0, 0); L.yearCatch(s, roll('crucian', 0.4));
  L.contestTick(s, W0 + WEEK + H, 0);
  L.yearTick(s, W0 + 4 * WEEK + H, 0);
  L.setFarm(s, '달빛', 1);
  const back = L.decode(L.encode(s));
  assert.deepEqual(back.cont, s.cont);
  assert.deepEqual(back.yr, s.yr);
  assert.deepEqual(back.farm, s.farm);
  const o = JSON.parse(L.encode(s));
  o.cont = { wk: 'x', lv: 99, best: { id: 'nope', size: 1, f: 3 }, won: { 5: 'diamond', 6: 'gold' }, mail: [{ wk: 1, k: 999 }, 'x'] };
  o.yr = { y: 3, n: -5, cards: [{ y: 1, n: 'a' }, null], d0: 'x' };
  o.farm = { name: '<script>', sign: 77 };
  const j = L.decode(JSON.stringify(o));
  assert.ok(j);
  assert.equal(j.cont, undefined);
  assert.equal(j.yr.n, 0); assert.equal(j.yr.cards.length, 0);
  assert.deepEqual(j.farm, { name: 'script', sign: 0 });
});

test('old fixtures load unchanged without s.cont / s.yr / s.farm', () => {
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    if (/"(cont|yr|farm)":/.test(raw)) continue;   // saved by stage 10 ①+
    const s = L.decode(raw);
    assert.ok(s, f);
    assert.equal(s.cont, undefined, f); assert.equal(s.yr, undefined, f); assert.equal(s.farm, undefined, f);
    const again = L.decode(L.encode(s));
    assert.deepEqual(JSON.parse(L.encode(again)), JSON.parse(L.encode(s)), f);
  }
});

// ---------- 놀거리 수첩 ----------
test('GUIDE has 낚시 대회, 결산 카드, 농장 간판 with numbers from the constants', () => {
  const s = fresh();
  for (const id of ['contest', 'yearcard', 'farmsign']) assert.ok(L.guideById(id), id);
  assert.equal(L.guideOpen(s, 'contest'), false);
  assert.match(L.guideById('contest').lock, new RegExp('친밀도 ' + L.CONTEST_FRIEND));
  assert.equal(L.guideOpen(s, 'yearcard'), true);
  assert.equal(L.guideOpen(s, 'farmsign'), true);
  assert.match(L.guideById('farmsign').how, new RegExp(String(L.FARM_NAME_MAX)));
  assert.match(L.guideById('farmsign').how, new RegExp(String(L.SIGNS.length)));
  friend(s);
  assert.equal(L.guideOpen(s, 'contest'), true);
});
