// farm-fish/test/train.test.js — 기차 여행: routes open in order, 개통비, the day ticket (clock set back), 계곡 fish/picks/기념품, save
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = require('../build.js').build();
vm.runInThisContext(html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1], { filename: 'logic.js' });
const L = globalThis.Logic;
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const DAY = 86400e3, T0 = 20100 * DAY + 3600e3;   // 1 a.m. on local day 20100 (tz 0)
const fresh = (rep, coins) => { const s = L.newState(0, seq(0.5)); s.rep = rep; s.coins = coins; return s; };
const opened = () => { const s = fresh(L.TRN_REP.valley, L.TRN_OPEN.valley); assert.deepEqual(L.trnOpen(s, 'valley', T0), { ok: true }); return s; };

test('spec numbers: 개통비 and 기차표 per route, ★ to open', () => {
  assert.deepEqual(L.TRN_OPEN, { valley: 5000, onsen: 20000, snow: 50000 });
  assert.deepEqual(L.TRN_FARE, { valley: 500, onsen: 1000, snow: 2000 });
  assert.deepEqual(L.TRN_REP, { valley: 8, onsen: 20 });
  assert.deepEqual(L.TRN_ROUTES.map((r) => r.id), ['valley', 'onsen', 'snow']);
  assert.deepEqual(L.TRN_ROUTES.map((r) => r.from), ['village', 'village', 'port']);
});

test('open conditions: ★8 → 계곡; ★20 + 계곡 → 온천; 포구 기차역 + 온천 → 설원; coins paid once', () => {
  const s = fresh(7, 1e6);
  assert.equal(s.train, undefined, 'no s.train before the first 개통');
  assert.deepEqual(L.trnOpen(s, 'valley', T0), { ok: false, why: 'rep' });
  assert.equal(s.train, undefined);
  s.rep = 8; s.coins = L.TRN_OPEN.valley - 1;
  assert.deepEqual(L.trnOpen(s, 'valley', T0), { ok: false, why: 'coins' });
  s.coins = L.TRN_OPEN.valley;
  assert.deepEqual(L.trnOpen(s, 'valley', T0), { ok: true });
  assert.equal(s.coins, 0);
  assert.equal(L.trnStatus(s, 'valley'), 'owned');
  assert.deepEqual(L.trnOpen(s, 'valley', T0), { ok: false, why: 'owned' });
  assert.ok(L.spotUnlocked(s, 'valley'), 'the 계곡 fishing spot comes with the route');
  assert.equal(L.spotStatus(s, 'valley'), 'owned');
  // 온천: ★20 and the 계곡
  s.coins = 1e6;
  const t = fresh(19, 1e6);
  assert.equal(L.trnStatus(t, 'onsen'), 'rep');
  t.rep = 20;
  assert.equal(L.trnStatus(t, 'onsen'), 'after');
  assert.equal(L.trnStatus(s, 'onsen'), 'rep');
  s.rep = 20;
  assert.deepEqual(L.trnOpen(s, 'onsen', T0), { ok: true });
  assert.equal(s.coins, 1e6 - L.TRN_OPEN.onsen);
  // 설원: the 포구 기차역 repaired, and the 온천
  assert.equal(L.trnStatus(s, 'snow'), 'station');
  s.port = { got: {}, done: { station: true } };
  assert.equal(L.trnStatus(s, 'snow'), 'ok');
  const u = fresh(99, 1e6); u.port = { got: {}, done: { station: true } };
  assert.equal(L.trnStatus(u, 'snow'), 'after');
  assert.deepEqual(L.trnOpen(s, 'snow', T0), { ok: true });
  assert.equal(s.coins, 1e6 - L.TRN_OPEN.onsen - L.TRN_OPEN.snow);
  assert.equal(L.trnStatus(s, 'nope'), 'none');
});

test('the 계곡 spot is never sold at the signpost', () => {
  const s = fresh(999, 1e9);
  assert.equal(L.spotStatus(s, 'valley'), 'rep');
  assert.equal(L.buySpot(s, 'valley'), false);
  assert.equal(L.setSpot(s, 'valley'), false);
});

test('ticket: one fare covers its local day, any number of trips; a new day needs a new one', () => {
  const s = opened();
  assert.deepEqual(L.trnBoard(s, 'valley', T0, 0), { ok: false, why: 'ticket' });
  assert.deepEqual(L.trnBuyTicket(s, 'valley', T0, 0), { ok: false, why: 'coins' });
  s.coins = 10000;
  assert.deepEqual(L.trnBuyTicket(s, 'valley', T0, 0), { ok: true });
  assert.equal(s.coins, 10000 - L.TRN_FARE.valley);
  for (let k = 0; k < 20; k++) assert.deepEqual(L.trnBoard(s, 'valley', T0 + k * 3600e3, 0), { ok: true });
  assert.deepEqual(L.trnBuyTicket(s, 'valley', T0 + 20 * 3600e3, 0), { ok: false, why: 'have' });
  assert.equal(s.coins, 10000 - L.TRN_FARE.valley, 'no second charge the same day');
  // midnight
  assert.deepEqual(L.trnBoard(s, 'valley', T0 + DAY, 0), { ok: false, why: 'ticket' });
  assert.deepEqual(L.trnBuyTicket(s, 'valley', T0 + DAY, 0), { ok: true });
  assert.equal(s.coins, 10000 - 2 * L.TRN_FARE.valley);
  // the local day follows the timezone: 1 a.m. UTC is still yesterday at UTC−2
  assert.equal(L.trnTicket(s, 'valley', T0 + DAY, -120), true);
  // tickets are per route
  assert.deepEqual(L.trnBuyTicket(s, 'onsen', T0, 0), { ok: false, why: 'open' });
  assert.deepEqual(L.trnBoard(s, 'onsen', T0, 0), { ok: false, why: 'open' });
});

test('clock set back: no free ticket and no second charge for the same day', () => {
  const s = opened(); s.coins = 10000;
  assert.deepEqual(L.trnBuyTicket(s, 'valley', T0 + DAY, 0), { ok: true });   // bought on day D
  const paid = s.coins;
  // set back a day: the day-D ticket still covers it, nothing to buy
  assert.equal(L.trnTicket(s, 'valley', T0, 0), true);
  assert.deepEqual(L.trnBuyTicket(s, 'valley', T0, 0), { ok: false, why: 'have' });
  // forward again to D: still that ticket, no charge
  assert.equal(L.trnTicket(s, 'valley', T0 + DAY, 0), true);
  assert.deepEqual(L.trnBuyTicket(s, 'valley', T0 + DAY, 0), { ok: false, why: 'have' });
  assert.equal(s.coins, paid);
  assert.equal(s.train.tk.valley, 20101, 'the ticket day never moves back');
  // a ticket bought under a clock far ahead does not ride free for days once the clock is put right
  const t = opened(); t.coins = 10000;
  assert.deepEqual(L.trnBuyTicket(t, 'valley', T0 + 30 * DAY, 0), { ok: true });
  assert.equal(L.trnTicket(t, 'valley', T0, 0), false);
  assert.deepEqual(L.trnBuyTicket(t, 'valley', T0, 0), { ok: true });
  assert.equal(t.train.tk.valley, 20100);
});

test('계곡 fish: 5 + legend 황쏘가리, spot valley, in the dex/museum, 민물고기 on the 시세판', () => {
  const ids = L.TRN_VALLEY_FISH.map((f) => f.id);
  assert.equal(ids.length, 6);
  assert.equal(L.TRN_VALLEY_FISH.filter((f) => f.rarity === '전설').length, 1);
  assert.equal(L.fishById('goldmandarin').name, '황쏘가리');
  for (const f of L.TRN_VALLEY_FISH) {
    assert.equal(f.spot, 'valley', f.id);
    assert.ok(f.hint && f.price > 0, f.id);
    assert.ok(L.FISH.includes(f), f.id);
    assert.ok(L.MUSEUM_ROOMS.fish.ids.includes(f.id), f.id);
    assert.equal(L.mktStock(f.id), 'fresh', f.id);
  }
  assert.equal(new Set(L.FISH.map((f) => f.id)).size, L.FISH.length, 'fish ids stay unique');
  assert.equal(new Set(L.FISH.map((f) => f.name)).size, L.FISH.length, 'fish names stay unique');
  // they bite only at the 계곡
  const s = opened(), d = new Date(2026, 9, 27, 10, 0), env = { phase: 'day', weather: 'fog', season: 'autumn' };
  assert.ok(!L.availableFish(d, s, env).some((f) => ids.includes(f.id)));
  assert.ok(L.setSpot(s, 'valley'));
  const here = L.availableFish(d, s, env).map((f) => f.id);
  assert.ok(here.length && here.every((id) => ids.includes(id)), here.join());
  assert.ok(here.includes('goldmandarin'), 'fog brings the legend');
});

test('특산물: spots ready at 개통, pick → basket, regrow by real time, 종목 숲·갯벌', () => {
  const s = opened();
  assert.equal(s.train.pick.valley.length, L.TRN_PICK_N.valley);
  assert.deepEqual(L.trnPicksNow(s, 'valley', T0), ['vnamul', 'vnamul', 'vnamul']);
  assert.equal(L.trnPick(s, 'valley', 0, T0, seq(0.99)), null, 'no ticket today: no picking');
  s.coins = L.TRN_FARE.valley; assert.deepEqual(L.trnBuyTicket(s, 'valley', T0, 0), { ok: true });
  const r = L.trnPick(s, 'valley', 0, T0, seq(0.99));
  assert.deepEqual(r, { id: 'vnamul', first: true, sold: 0 });
  assert.deepEqual(s.bag, [{ id: 'vnamul', v: L.trnItem('vnamul').price }]);
  assert.equal(L.trnPick(s, 'valley', 0, T0, seq(0.5)), null, 'no double pick');
  assert.equal(L.trnPicksNow(s, 'valley', T0)[0], null);
  const at = L.trnPickNext(s, 'valley', T0);
  assert.ok(at >= T0 + L.TRN_REGROW_MIN && at <= T0 + L.TRN_REGROW_MIN + L.TRN_REGROW_SPAN);
  assert.equal(L.trnPicksNow(s, 'valley', at)[0], 'vsongi', 'rng 0.99 rolled the rare one');
  assert.equal(L.trnPick(s, 'valley', 0, at, seq(0)).first, true);
  assert.equal(L.trnPick(s, 'valley', 1, T0, seq(0)).first, false);
  for (const id of ['vnamul', 'vsongi']) {
    assert.equal(L.itemInfo(id).kind, 'trn');
    assert.equal(L.mktStock(id), 'wild');
    assert.equal(L.obtainable(s, id), true);
    assert.equal(L.obtainable(fresh(0, 0), id), false);
  }
  assert.equal(L.trnPick(fresh(99, 0), 'valley', 0, T0, seq(0)), null, 'not before 개통');
});

test('기념품: one each, needs the route, placed in the yard or kept', () => {
  const s = opened();
  const w = L.TRN_SOUVENIRS.filter((x) => x.route === 'valley');
  assert.ok(w.length >= 2 && w.length <= 3);
  assert.deepEqual(L.trnBuySouvenir(fresh(99, 1e6), w[0].id, T0, 0), { ok: false, why: 'open' });
  s.coins = 1e6;
  assert.deepEqual(L.trnBuySouvenir(s, w[0].id, T0, 0), { ok: false, why: 'ticket' }, 'the shop is only reached on a ticket');
  assert.deepEqual(L.trnBuyTicket(s, 'valley', T0, 0), { ok: true });
  s.coins = 0;
  assert.deepEqual(L.trnBuySouvenir(s, w[0].id, T0, 0), { ok: false, why: 'coins' });
  s.coins = 1e6;
  for (const x of w) {
    assert.ok(L.decoById(x.id), x.id);
    const r = L.trnBuySouvenir(s, x.id, T0, 0);
    assert.equal(r.ok, true, x.id);
    assert.equal(s.yard.deco[x.id], true);
    assert.deepEqual(L.trnBuySouvenir(s, x.id, T0, 0), { ok: false, why: 'owned' });
  }
  assert.equal(s.coins, 1e6 - w.reduce((a, x) => a + x.cost, 0));
  assert.deepEqual(L.trnBuySouvenir(s, w[0].id, T0 + DAY, 0), { ok: false, why: 'owned' });
  assert.equal(L.buyDeco(s, w[0].id, true).why, 'owned');
  const t = opened(); t.coins = 1e6;
  assert.equal(L.buyDeco(t, w[0].id).why, 'merchant', 'not sold in the 상점');
  assert.deepEqual(L.trnBuySouvenir(s, 'nope', T0, 0), { ok: false, why: 'none' });
});

test('save: round trip, a bad field loses only that field, the 계곡 spot is not kept', () => {
  const s = opened(); s.coins = 1e4;
  L.trnBuyTicket(s, 'valley', T0, 0);
  L.trnPick(s, 'valley', 1, T0, seq(0.99));
  assert.ok(L.setSpot(s, 'valley'));
  const again = L.decode(L.encode(s));
  assert.deepEqual(again.train, s.train);
  assert.equal(L.curSpot(again), 'pond', 'a reload starts at the 연못: no free 계곡 without a ticket');
  assert.equal(again.fish.phase, 'idle');
  assert.ok(L.spotUnlocked(again, 'valley'));
  assert.equal(L.trnTicket(again, 'valley', T0, 0), true);
  const raw = JSON.parse(L.encode(s));
  const bad = (train) => L.decode(JSON.stringify(Object.assign({}, raw, { train })));
  // broken pieces: each loses only itself
  let d = bad(Object.assign({}, raw.train, { tk: 'x', pick: 5, dex: [1] }));
  assert.deepEqual(d.train.ok, { valley: true });
  assert.deepEqual(d.train.tk, {});
  assert.equal(d.train.pick.valley.length, L.TRN_PICK_N.valley);
  assert.ok(L.spotUnlocked(d, 'valley'));
  d = bad(Object.assign({}, raw.train, { pick: { valley: [null, { at: 'x', id: 'pearl' }, { at: 5, id: 'vsongi' }] } }));
  assert.equal(d.train.pick.valley[2].at, 5);
  assert.equal(d.train.pick.valley[2].id, 'vsongi');
  assert.equal(d.train.pick.valley[1].id, 'vnamul');
  assert.equal(typeof d.train.pick.valley[1].at, 'number');
  d = bad(Object.assign({}, raw.train, { ok: { valley: 'yes', onsen: true, nope: true }, tk: { valley: 1.5e400, onsen: 20100.7 } }));
  assert.deepEqual(d.train.ok, { onsen: true });
  assert.deepEqual(d.train.tk, { onsen: 20100 });
  assert.equal(L.curSpot(d), 'pond', 'the 계곡 spot is not kept without its route');
  for (const junk of [null, 5, 'x', [1, 2]]) {
    const e = bad(junk);
    assert.ok(e, String(junk));
    assert.equal(e.train, undefined);
  }
  // decode is stable
  const twice = L.decode(L.encode(d));
  assert.deepEqual(twice.train, d.train);
});

test('every released save loads without a 기차 여행 block', () => {
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    if (JSON.parse(raw).train) continue;   // released after the train shipped: saves.test.js keeps it
    const s = L.decode(raw);
    assert.ok(s, f);
    assert.equal(s.train, undefined, f);
    assert.equal(L.trnOk(s, 'valley'), false, f);
    assert.equal(L.trnTicket(s, 'valley', T0, 0), false, f);
    assert.deepEqual(L.trnPicksNow(s, 'valley', T0), [], f);
    assert.equal(L.spotUnlocked(s, 'valley'), false, f);
  }
});

test('놀거리 수첩 has one 기차 여행 line with the real numbers', () => {
  const g = L.GUIDE.filter((x) => x.id === 'train');
  assert.equal(g.length, 1);
  assert.match(g[0].lock, new RegExp('★' + L.TRN_REP.valley));
  assert.match(g[0].lock, /5,000코인/);
  assert.equal(L.guideOpen(fresh(0, 0), 'train'), false);
  assert.equal(L.guideOpen(fresh(L.TRN_REP.valley, 0), 'train'), true);
  assert.match(g[0].how, /온천욕/);
  assert.match(g[0].how, /설원/);
});

// ---------- 레인 B: 온천 마을, 설원 고개, 온천욕 ----------
const allOpen = () => {
  const s = fresh(99, 1e6); s.port = { got: {}, done: { station: true } };
  for (const id of ['valley', 'onsen', 'snow']) assert.deepEqual(L.trnOpen(s, id, T0), { ok: true }, id);
  return s;
};
const ticketed = () => {
  const s = allOpen();
  for (const id of ['valley', 'onsen', 'snow']) assert.deepEqual(L.trnBuyTicket(s, id, T0, 0), { ok: true }, id);
  return s;
};

test('온천·설원 fish: 5 + one legend each, own spot, unique names, dex/museum, 민물고기, bite only there', () => {
  for (const [sp, list] of [['onsen', L.TRN_ONSEN_FISH], ['snow', L.TRN_SNOW_FISH]]) {
    assert.equal(list.length, 6, sp);
    assert.equal(list.filter((f) => f.rarity === '전설').length, 1, sp);
    for (const f of list) {
      assert.equal(f.spot, sp, f.id);
      assert.ok(f.hint && f.price > 0, f.id);
      assert.ok(L.FISH.includes(f), f.id);
      assert.ok(L.MUSEUM_ROOMS.fish.ids.includes(f.id), f.id);
      assert.equal(L.mktStock(f.id), 'fresh', f.id);
    }
    assert.equal(L.SPOTS[sp].rep, Infinity, sp + ' is never sold at the signpost');
    assert.equal(L.buySpot(fresh(999, 1e9), sp), false);
  }
  assert.equal(new Set(L.FISH.map((f) => f.id)).size, L.FISH.length);
  assert.equal(new Set(L.FISH.map((f) => f.name)).size, L.FISH.length);
  assert.ok(L.TRN_SNOW_FISH.some((f) => f.name === '곤들매기'));
  // obtainable: each one bites at its own spot under its own conditions, never at the 연못
  const s = allOpen();
  const env = (f) => ({ phase: f.phase ? f.phase[0] : 'day', weather: f.weather || 'clear', season: f.season || 'winter' });
  for (const f of L.TRN_ONSEN_FISH.concat(L.TRN_SNOW_FISH)) {
    const d = new Date(2026, 0, 5, 10);
    assert.ok(!L.availableFish(d, fresh(0, 0), env(f)).some((x) => x.id === f.id), f.id + ' not at the 연못');
    assert.ok(L.setSpot(s, f.spot), f.spot);
    const here = L.availableFish(d, s, env(f)).map((x) => x.id);
    assert.ok(here.includes(f.id), f.id + ' ' + here.join());
    assert.ok(here.every((id) => L.fishById(id).spot === f.spot), here.join());
  }
});

test('온천·설원 특산물 and 기념품: spots at 개통, pick → basket, one 기념품 each', () => {
  const s = ticketed();
  const names = L.TRN_PICKS.map((p) => p.name);
  assert.equal(new Set(names).size, names.length);
  assert.notEqual(L.itemInfo('tangerine').name, '유자');
  for (const [r, ids] of [['onsen', ['onegg', 'oyuja']], ['snow', ['sice', 'sflake']]]) {
    assert.deepEqual(L.TRN_PICKS.filter((p) => p.route === r).map((p) => p.id), ids);
    assert.equal(s.train.pick[r].length, L.TRN_PICK_N[r]);
    assert.deepEqual(L.trnPicksNow(s, r, T0), [ids[0], ids[0], ids[0]]);
    const got = L.trnPick(s, r, 0, T0, seq(0.99));
    assert.equal(got.id, ids[0]);
    assert.equal(L.trnPicksNow(s, r, L.trnPickNext(s, r, T0))[0], ids[1], 'rng 0.99 rolled the rare one');
    for (const id of ids) {
      assert.equal(L.itemInfo(id).kind, 'trn');
      assert.equal(L.mktStock(id), 'wild');
      assert.equal(L.obtainable(s, id), true);
      assert.equal(L.obtainable(opened(), id), false, id + ' needs its route');
    }
    const w = L.TRN_SOUVENIRS.filter((x) => x.route === r);
    assert.ok(w.length >= 2 && w.length <= 3, r);
    for (const x of w) {
      assert.ok(L.decoById(x.id), x.id);
      assert.deepEqual(L.trnBuySouvenir(opened(), x.id, T0, 0), { ok: false, why: 'open' });
      assert.deepEqual(L.trnBuySouvenir(allOpen(), x.id, T0, 0), { ok: false, why: 'ticket' });
      assert.equal(L.trnBuySouvenir(s, x.id, T0, 0).ok, true, x.id);
      assert.deepEqual(L.trnBuySouvenir(s, x.id, T0, 0), { ok: false, why: 'owned' });
    }
  }
});

test('온천욕: needs the 온천 and today\'s ticket, once per local day; a clock set back never gives a second', () => {
  const s = allOpen();
  assert.deepEqual(L.trnBath(opened(), T0, 0), { ok: false, why: 'open' });
  assert.deepEqual(L.trnBath(s, T0, 0), { ok: false, why: 'ticket' });
  assert.equal(s.train.bath, undefined, 'no bath field before the first bath');
  assert.deepEqual(L.trnBuyTicket(s, 'onsen', T0, 0), { ok: true });
  assert.equal(L.trnBath(s, T0, 0).ok, true);
  assert.deepEqual(s.train.bath, { d: 20100, until: T0 + L.TRN_BATH_MS });
  assert.deepEqual(L.trnBath(s, T0 + 5 * 3600e3, 0), { ok: false, why: 'bath' }, 'same day');
  // clock set back a day (the day ticket still covers it): still no second bath, nothing moves
  assert.deepEqual(L.trnBath(s, T0 - DAY, 0), { ok: false, why: 'bath' });
  assert.deepEqual(s.train.bath, { d: 20100, until: T0 + L.TRN_BATH_MS });
  // next day: a new ticket, then a new bath
  assert.deepEqual(L.trnBath(s, T0 + DAY, 0), { ok: false, why: 'ticket' });
  L.trnBuyTicket(s, 'onsen', T0 + DAY, 0);
  assert.equal(L.trnBath(s, T0 + DAY, 0).ok, true);
  assert.equal(s.train.bath.d, 20101);
  // and back again to day 20100: no bath that day either
  assert.deepEqual(L.trnBath(s, T0, 0), { ok: false, why: 'bath' });
});

test('온천욕 makes bites quicker only within its hour, at any spot', () => {
  const s = allOpen(); L.trnBuyTicket(s, 'onsen', T0, 0);
  const base = L.waitMs(s, () => 0.5, undefined, T0);
  assert.equal(L.trnBathMul(s, T0), 1);
  L.trnBath(s, T0, 0);
  const on = L.waitMs(s, () => 0.5, undefined, T0 + 10 * 60e3);
  assert.equal(L.TRN_BATH_MUL, 0.7);
  assert.equal(on, Math.round(base * L.TRN_BATH_MUL));
  assert.equal(L.trnBathLeft(s, T0 + 10 * 60e3), L.TRN_BATH_MS - 10 * 60e3);
  assert.equal(L.waitMs(s, () => 0.5, undefined, T0 + L.TRN_BATH_MS), base, 'over after the hour');
  assert.equal(L.waitMs(s, () => 0.5, undefined, T0 - 1), base, 'a clock set back does not stretch it');
  assert.equal(L.waitMs(s, () => 0.5), base, 'no time given: no bath');
  // cast and strike pass the time along, at the 연못 too
  assert.ok(L.setSpot(s, 'pond'));
  assert.ok(L.cast(s, T0 + 60e3, () => 0.5, 100, 150));
  assert.equal(s.fish.biteAt - (T0 + 60e3), on);
  const r = L.strike(s, T0 + 2 * 60e3, () => 0.5);
  assert.equal(r.type, 'scared');
  assert.equal(s.fish.biteAt - (T0 + 2 * 60e3), on);
});

test('save: the new routes and the bath round-trip; a bad bath loses only itself', () => {
  const s = ticketed(); L.trnBath(s, T0, 0);
  assert.ok(L.trnPick(s, 'snow', 2, T0, seq(0.99)));
  assert.ok(L.setSpot(s, 'snow'));
  const again = L.decode(L.encode(s));
  assert.deepEqual(again.train, s.train);
  assert.equal(L.curSpot(again), 'pond', 'the 설원 spot is not kept over a reload');
  assert.ok(L.spotUnlocked(again, 'onsen') && L.spotUnlocked(again, 'snow'));
  assert.equal(L.trnBathLeft(again, T0 + 60e3), L.TRN_BATH_MS - 60e3);
  const raw = JSON.parse(L.encode(s));
  const bad = (bath) => L.decode(JSON.stringify(Object.assign({}, raw, { train: Object.assign({}, raw.train, { bath }) }))).train;
  for (const junk of [null, 5, 'x', [1], { d: 'x', until: 5 }, { d: 1, until: Infinity }, { d: 20100 }]) {
    const t = bad(junk);
    assert.equal(t.bath, undefined, JSON.stringify(junk));
    assert.deepEqual(t.ok, { valley: true, onsen: true, snow: true });
  }
  assert.deepEqual(bad({ d: 20100.6, until: 7 }).bath, { d: 20100, until: 7 });
  // a lane-A save (온천 opened before its spot existed, no spotOk for it) gets the spots back
  const a = JSON.parse(L.encode(s)); delete a.spotOk; delete a.train.bath;
  const d = L.decode(JSON.stringify(a));
  assert.ok(L.spotUnlocked(d, 'onsen') && L.spotUnlocked(d, 'snow'));
  assert.equal(d.train.bath, undefined);
  assert.equal(L.trnBathMul(d, T0), 1);
});

test('every released save loads with the 온천·설원 closed and no bath', () => {
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const s = L.decode(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.ok(s, f);
    for (const id of ['onsen', 'snow']) {
      const ok = !!(s.train && s.train.ok[id]);
      assert.equal(L.spotUnlocked(s, id), ok, f + ' ' + id);
      if (!ok) assert.deepEqual(L.trnPicksNow(s, id, T0), [], f);
    }
    assert.equal(L.trnBathMul(s, T0), 1, f);
  }
});

test('a bath taken with the clock far ahead does not block the real day', () => {
  const s = ticketed();
  L.trnBuyTicket(s, 'onsen', T0 + 30 * DAY, 0);
  assert.equal(L.trnBath(s, T0 + 30 * DAY, 0).ok, true);
  assert.deepEqual(L.trnBath(s, T0 + 29 * DAY, 0), { ok: false, why: 'bath' }, 'one day back still counts');
  assert.deepEqual(L.trnBuyTicket(s, 'onsen', T0, 0), { ok: true }, 'the far-ahead ticket does not count either');
  assert.equal(L.trnBath(s, T0, 0).ok, true, 'clock corrected: today\'s bath is free to take');
  assert.equal(s.train.bath.d, 20100);
});

test('특산물 picked with the clock far ahead are ready once the clock is corrected (and over a reload)', () => {
  const s = ticketed(), late = T0 + 3 * DAY;
  L.trnBuyTicket(s, 'valley', late, 0);
  assert.ok(L.trnPick(s, 'valley', 0, late, seq(0)));
  assert.equal(L.trnPicksNow(s, 'valley', late)[0], null, 'regrowing at that clock');
  assert.equal(L.trnPicksNow(s, 'valley', T0)[0], 'vnamul', 'clock corrected: ready');
  assert.equal(L.trnPickNext(s, 'valley', T0), null);
  assert.deepEqual(L.trnBuyTicket(s, 'valley', T0, 0), { ok: true });
  assert.ok(L.trnPick(s, 'valley', 0, T0, seq(0)), 'and pickable with today\'s ticket');
  // a spot regrowing a normal time is not touched
  assert.equal(L.trnPicksNow(s, 'valley', T0)[0], null);
  // reload: a pick time far past savedAt is ready again; a normal one is kept
  s.train.pick.valley[1].at = late + L.TRN_REGROW_MIN;   // picked under the clock ahead
  s.savedAt = T0;
  const d = L.decode(L.encode(s));
  assert.equal(d.train.pick.valley[1].at, T0);
  assert.equal(d.train.pick.valley[0].at, s.train.pick.valley[0].at);
});

test('the route spots need that day\'s ticket: no picks or 기념품 without one, no spot kept over a reload', () => {
  const s = ticketed();
  const w = L.TRN_SOUVENIRS.find((x) => x.route === 'valley');
  assert.equal(L.trnPick(s, 'valley', 0, T0 + 2 * DAY, seq(0)), null, 'ticket ran out');
  assert.deepEqual(L.trnBuySouvenir(s, w.id, T0 + 2 * DAY, 0), { ok: false, why: 'ticket' });
  assert.ok(L.trnPick(s, 'valley', 0, T0 - DAY, seq(0)), 'a clock set back a day still rides on the ticket');
  for (const sp of ['valley', 'onsen', 'snow']) {
    assert.ok(L.setSpot(s, sp));
    assert.equal(L.curSpot(L.decode(L.encode(s))), 'pond', sp);
  }
  assert.ok(L.setSpot(s, 'pond'));
  s.spotOk = Object.assign({}, s.spotOk, { river: true });
  assert.ok(L.setSpot(s, 'river'));
  assert.equal(L.curSpot(L.decode(L.encode(s))), 'river', 'other spots still come back');
});
