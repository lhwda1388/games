// test/stage11b.test.js — stage 11 lane ②: 어판장 경매, 떠돌이 상인 (기차)
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
const WEEK = 7 * 86400e3, MON0 = 4 * 86400e3, DAY = 86400e3, H = 3600e3;
const T = MON0 + 2900 * WEEK + 10 * H;   // a Monday in 2025, 10:00 UTC

const POOL_SPOTS = ['river', 'sea', 'island'];
const inPool = (f) => POOL_SPOTS.includes(f.spot) && f.rarity !== '전설' && !f.fest;
// a farm with every river/sea/island fish in the 도감 (plus a legend and a pond fish that must never show up)
function market(built) {
  const s = fresh();
  s.coins = 1e7;
  for (const f of L.FISH) if (inPool(f) || f.id === 'sturgeon' || f.id === 'carp') s.dex.fish[f.id] = { n: 1, best: f.max };
  s.port = { got: {}, done: built === false ? {} : { bridge: true, shipyard: true, market: true } };
  return s;
}
const fishV = (id, frac) => { const f = L.fishById(id); return Math.round(f.price * (0.7 + 0.6 * frac)); };

// ---------- 어판장 경매 ----------
test('auction: closed until the 어판장 is rebuilt', () => {
  const s = market(false);
  assert.equal(L.aucOpen(s), false);
  assert.equal(L.aucOpen(fresh()), false);
  assert.deepEqual(L.aucFish(s, T, 0), []);
  assert.deepEqual(L.aucSell(s, 'mackerel', T, 0), { ok: false, why: 'closed' });
  s.port.done.market = true;
  assert.equal(L.aucOpen(s), true);
  assert.equal(L.AUC_N, 3);
});

test('auction: the week key gives the same 3 species, only 도감 river/sea/island fish, no legends or festival fish', () => {
  const a = market(), b = market();
  const ids = L.aucFish(a, T, 0);
  assert.equal(ids.length, L.AUC_N);
  assert.equal(new Set(ids).size, L.AUC_N);
  assert.deepEqual(L.aucFish(b, T + 3 * DAY, 0), ids, 'same week → same pick');
  assert.deepEqual(a.port.auc.ids, ids, 'kept in s.port.auc');
  assert.equal(a.port.auc.wk, L.aucWeek(T, 0));
  // over many weeks: never a legend, a pond fish, a festival fish
  const seen = new Set();
  for (let w = 0; w < 60; w++) for (const id of L.aucFish(a, T + w * WEEK, 0)) {
    const f = L.fishById(id);
    assert.ok(inPool(f), id);
    seen.add(id);
  }
  assert.ok(seen.size > 6, 'the pick moves around');
  // only fish already in the 도감
  const c = market();
  c.dex.fish = { mackerel: { n: 1, best: 30 }, dace: { n: 1, best: 10 }, filefish: { n: 1, best: 20 }, flounder: { n: 1, best: 40 }, tuna: { n: 1, best: 100 } };
  for (let w = 0; w < 10; w++) for (const id of L.aucFish(c, T + w * WEEK, 0)) assert.ok(c.dex.fish[id] && id !== 'tuna', id);
});

test('auction: a new week picks again and clears what was sold', () => {
  const s = market();
  const ids = L.aucFish(s, T, 0);
  s.bag.push({ id: ids[0], v: fishV(ids[0], 1) });
  assert.ok(L.aucSell(s, ids[0], T, 0).ok);
  let moved = false;
  for (let w = 1; w < 6 && !moved; w++) {
    const nx = L.aucFish(s, T + w * WEEK, 0);
    assert.deepEqual(s.port.auc.sold, {});
    if (nx.join() !== ids.join()) moved = true;
  }
  assert.ok(moved);
});

test('auction: aucMul runs 1.5 (smallest) .. 3 (biggest) from the basket value', () => {
  assert.equal(L.aucMul('mackerel', fishV('mackerel', 0)), 1.5);
  assert.equal(L.aucMul('mackerel', fishV('mackerel', 1)), 3);
  const mid = L.aucMul('mackerel', fishV('mackerel', 0.5));
  assert.ok(mid > 2.2 && mid < 2.3, String(mid));
  assert.equal(L.aucMul('mackerel', 1), 1.5, 'clamped low');
  assert.equal(L.aucMul('mackerel', 1e6), 3, 'clamped high (장날 values)');
});

test('auction: selling takes the biggest of that species, pays v × mul, once a week per species', () => {
  const s = market(), ids = L.aucFish(s, T, 0), id = ids[0];
  assert.deepEqual(L.aucSell(s, id, T, 0), { ok: false, why: 'need' });
  const small = fishV(id, 0.1), big = fishV(id, 0.9);
  s.bag.push({ id: id, v: small }, { id: 'radish', v: 30 }, { id: id, v: big });
  const c0 = s.coins, r = L.aucSell(s, id, T, 0);
  assert.equal(r.ok, true);
  assert.equal(r.mul, L.aucMul(id, big));
  assert.equal(r.coins, Math.round(big * r.mul));
  assert.equal(s.coins, c0 + r.coins);
  assert.deepEqual(s.bag.map((e) => e.v), [small, 30], 'the big one went, the small one stays');
  assert.deepEqual(L.aucSell(s, id, T, 0), { ok: false, why: 'sold' });
  // not this week's species
  const other = L.FISH.find((f) => inPool(f) && !ids.includes(f.id)).id;
  s.bag.push({ id: other, v: 100 });
  assert.deepEqual(L.aucSell(s, other, T, 0), { ok: false, why: 'week' });
});

test('auction: the result comes as a one-line letter in the mailbox', () => {
  const s = market(), id = L.aucFish(s, T, 0)[1];
  s.bag.push({ id: id, v: fishV(id, 1) });
  const r = L.aucSell(s, id, T, 0);
  const m = s.yard.mail[s.yard.mail.length - 1];
  const txt = L.letterText(m.k);
  assert.ok(txt.includes(L.fishById(id).name), txt);
  assert.ok(txt.replace(/,/g, '').includes(String(r.coins)), txt);
  assert.equal(m.c, 0, 'no extra coins in the letter');
  // survives a save round trip
  const k = L.decode(L.encode(s));
  assert.equal(L.letterText(k.yard.mail[k.yard.mail.length - 1].k), txt);
  assert.equal(L.letterText('a:nope:12'), null);
});

test('auction: a 장날 (×2) value counts as at most a max-size fish; a full mailbox drops a read letter, not unread coins', () => {
  const s = market(), id = L.aucFish(s, T, 0)[0], f = L.fishById(id);
  s.bag.push({ id: id, v: fishV(id, 0) * 2 });   // smallest fish on 장날
  const r = L.aucSell(s, id, T, 0);
  assert.equal(r.mul, 3);
  assert.equal(r.coins, Math.round(f.price * 1.3 * 3), 'never more than the biggest normal fish');
  const t = market(), id2 = L.aucFish(t, T, 0)[1];
  const y = L.yardOf(t);
  y.mail = [{ k: 'x', at: 0, c: 500, read: false }];
  for (let k = 0; k < 100; k++) y.mail.push({ k: 'r' + k, at: 0, c: 0, read: true });   // well over the cap
  t.bag.push({ id: id2, v: fishV(id2, 1) });
  L.aucSell(t, id2, T, 0);
  assert.equal(y.mail.length, 101, 'one in, one out');
  assert.equal(y.mail[0].c, 500, 'the unread letter with coins is kept');
});

// ---------- 떠돌이 상인 (기차) ----------
test('trader: locked until the 기차역 is rebuilt', () => {
  const s = market();
  assert.equal(L.traderOpen(s), false);
  assert.deepEqual(L.traderToday(s, T, 0), []);
  assert.deepEqual(L.traderPick(s, 'gold', T, 0), { ok: false, why: 'closed' });
  s.port.done.station = true;
  assert.equal(L.traderOpen(s), true);
});

test('trader: three wares a real day, the same all day, one pick a day', () => {
  const s = market(); s.port.done.station = true;
  const today = L.traderToday(s, T, 0);
  assert.equal(today.length, 3);
  assert.equal(new Set(today).size, 3);
  for (const id of today) assert.ok(L.TRADER_STOCK.some((w) => w.id === id), id);
  assert.deepEqual(L.traderToday(s, T + 5 * H, 0), today);
  let other = false;
  for (let d = 1; d < 8; d++) if (L.traderToday(s, T + d * DAY, 0).join() !== today.join()) other = true;
  assert.ok(other, 'another day, other wares');
  const notToday = L.TRADER_STOCK.find((w) => !today.includes(w.id)).id;
  assert.deepEqual(L.traderPick(s, notToday, T, 0), { ok: false, why: 'day' });
  const c0 = s.coins, w = L.TRADER_STOCK.find((x) => x.id === today[0]);
  assert.equal(L.traderPick(s, today[0], T, 0).ok, true);
  assert.equal(s.coins, c0 - w.cost);
  assert.deepEqual(s.trader, { day: Math.floor(T / DAY), picked: today[0] });
  assert.deepEqual(L.traderToday(s, T + H, 0), today, 'the list stays put after a pick');
  assert.deepEqual(L.traderPick(s, today[1], T + H, 0), { ok: false, why: 'picked' });
  // next day: again
  const t2 = T + DAY, nx = L.traderToday(s, t2, 0);
  s.coins = 0;
  assert.deepEqual(L.traderPick(s, nx[0], t2, 0), { ok: false, why: 'coins' });
  s.coins = 1e6;
  assert.equal(L.traderPick(s, nx[0], t2, 0).ok, true);
});

test('trader: the gold seed and port decorations land where they belong', () => {
  const s = market(); s.port.done.station = true;
  let gold = false, deco = false;
  for (let d = 0; d < 40 && !(gold && deco); d++) {
    const t = T + d * DAY;
    for (const id of L.traderToday(s, t, 0)) {
      const w = L.TRADER_STOCK.find((x) => x.id === id);
      if (id === 'gold' && !gold) { const g0 = s.seeds.gold; assert.ok(L.traderPick(s, id, t, 0).ok); assert.equal(s.seeds.gold, g0 + 1); assert.equal(s.dex.goldSeed, true); gold = true; break; }
      if (w.deco && !deco) { assert.ok(L.traderPick(s, id, t, 0).ok); assert.equal(s.yard.deco[id], true); deco = true; break; }
    }
  }
  assert.ok(gold && deco);
  // owned decorations are not offered again
  for (let d = 40; d < 80; d++) for (const id of L.traderToday(s, T + d * DAY, 0)) assert.ok(!(s.yard.deco[id]), id);
});

test('trader: 4–6 port decorations, each in DECOS exactly once, kept out of the shop', () => {
  const decos = L.TRADER_STOCK.filter((w) => w.deco);
  assert.ok(decos.length >= 4 && decos.length <= 6);
  assert.ok(L.TRADER_STOCK.some((w) => w.id === 'gold'));
  for (const w of decos) {
    const all = L.DECOS.filter((d) => d.id === w.id);
    assert.equal(all.length, 1, w.id);
    assert.equal(all[0].from, 'port');
    assert.equal(all[0].merchant, true);
    assert.ok(all[0].cost > 0 && Array.isArray(all[0].sz));
  }
});

// ---------- 놀거리 수첩 ----------
test('guide: auction and trader lines open with their buildings', () => {
  const s = market(false);
  assert.ok(L.guideById('auction') && L.guideById('trader'));
  assert.equal(L.guideOpen(s, 'auction'), false);
  assert.equal(L.guideOpen(s, 'trader'), false);
  assert.match(L.guideById('auction').lock, /어판장/);
  assert.match(L.guideById('trader').lock, /기차역/);
  s.port.done.market = true;
  assert.equal(L.guideOpen(s, 'auction'), true);
  s.port.done.station = true;
  assert.equal(L.guideOpen(s, 'trader'), true);
});

// ---------- save ----------
test('save: s.port.auc and s.trader round-trip; junk is dropped', () => {
  const s = market(); s.port.done.station = true;
  const ids = L.aucFish(s, T, 0);
  s.bag.push({ id: ids[2], v: fishV(ids[2], 0.5) });
  assert.ok(L.aucSell(s, ids[2], T, 0).ok);
  assert.ok(L.traderPick(s, L.traderToday(s, T, 0)[0], T, 0).ok);
  const k = L.decode(L.encode(s));
  assert.deepEqual(k.port.auc, s.port.auc);
  assert.deepEqual(k.trader, s.trader);
  const o = JSON.parse(L.encode(s));
  o.port.auc = { wk: 5.5, ids: ['mackerel', 'nope', 'mackerel', 'dace', 'flounder', 'chub'], sold: { mackerel: true, nope: true, dace: 'yes' } };
  o.trader = { day: 3, picked: 'rocket' };
  const j = L.decode(JSON.stringify(o));
  assert.deepEqual(j.port.auc, { wk: 5, ids: ['mackerel', 'dace', 'flounder'], sold: { mackerel: true } });
  assert.deepEqual(j.trader, { day: 3, picked: null });
});

test('save: putting auc into a save that already has s.port keeps got/done', () => {
  const s = fresh();
  s.port = { got: { forest: { acorn: true } }, done: { bridge: true } };
  L.decodeAuction({ port: { auc: { wk: 9, ids: ['mackerel'], sold: {} } } }, s);
  assert.deepEqual(s.port.got, { forest: { acorn: true } });
  assert.deepEqual(s.port.done, { bridge: true });
  assert.deepEqual(s.port.auc, { wk: 9, ids: ['mackerel'], sold: {} });
  // no s.port yet: made empty, then auc
  const t = fresh();
  L.decodeAuction({ port: { auc: { wk: 9, ids: ['mackerel'], sold: {} } } }, t);
  assert.deepEqual(t.port, { got: {}, done: {}, auc: { wk: 9, ids: ['mackerel'], sold: {} } });
  // nothing to read: nothing made
  const u = fresh();
  L.decodeAuction({}, u);
  assert.equal(u.port, undefined); assert.equal(u.trader, undefined);
});

test('save: old fixtures load without s.port / s.trader', () => {
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8'), x = L.decode(raw), j = JSON.parse(raw);
    assert.ok(x, f);
    if (j.port === undefined) assert.equal(x.port, undefined, f);
    if (j.trader === undefined) assert.equal(x.trader, undefined, f);
  }
});
