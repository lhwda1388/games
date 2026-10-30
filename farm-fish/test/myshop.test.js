// farm-fish/test/myshop.test.js — 내 가게: build, 진열대, lazy customers by real time, price, 꾸미기·등급, save
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
const MIN = 60e3;
const town = (c) => { const s = L.newState(0, seq(0.5)); s.rep = L.VILLAGE_REP; s.coins = c; return s; };
const built = (c) => { const s = town(L.MYS_PRICE + c); assert.deepEqual(L.mysBuild(s, T0), { ok: true }); return s; };
const fill = (s, id, n, v) => { for (let k = 0; k < n; k++) s.bag.push({ id, v }); };
const units = (s) => L.mysUnits(s.mys);

test('building: needs the 마을 and the coins; no s.mys before', () => {
  const s = town(L.MYS_PRICE - 1);
  assert.equal(s.mys, undefined);
  assert.deepEqual(L.mysBuild(s, T0), { ok: false, why: 'coins' });
  s.rep = 0;
  s.coins = L.MYS_PRICE;
  assert.deepEqual(L.mysBuild(s, T0), { ok: false, why: 'village' });
  s.rep = L.VILLAGE_REP;
  assert.deepEqual(L.mysBuild(s, T0), { ok: true });
  assert.equal(s.coins, 0);
  assert.equal(s.mys.sl, L.MYS_SLOTS0);
  assert.equal(s.mys.it.length, L.MYS_SLOTS0);
  assert.deepEqual(L.mysBuild(s, T0), { ok: false, why: 'built' });
  assert.equal(L.MYS_PRICE, 25000);
});

test('진열대 expands one slot at a time with rising cost up to the cap', () => {
  const s = built(0);
  assert.deepEqual(L.mysAddSlot(s, T0, 0), { ok: false, why: 'coins' });
  let paid = 0, last = 0;
  while (L.mysSlotCost(s)) {
    const c = L.mysSlotCost(s);
    assert.ok(c > last, 'escalating'); last = c;
    s.coins = c; paid += c;
    assert.deepEqual(L.mysAddSlot(s, T0, 0), { ok: true });
    assert.equal(s.coins, 0);
  }
  assert.equal(s.mys.sl, L.MYS_SLOTS_MAX);
  assert.equal(s.mys.it.length, L.MYS_SLOTS_MAX);
  assert.equal(paid, L.MYS_SLOT_COST.reduce((a, b) => a + b, 0));
  s.coins = 1e6;
  assert.deepEqual(L.mysAddSlot(s, T0, 0), { ok: false, why: 'max' });
});

test('put and take: dearest first, stacks of MYS_STACK (10) per slot, 지키기 allowed, 창고 too, basket room on take', () => {
  const s = built(0);
  s.bag = [{ id: 'radish', v: 10 }, { id: 'radish', v: 30 }, { id: 'radish', v: 20 }];
  s.keep = { radish: true };
  assert.equal(L.mysPut(s, 'radish', 2, 'bag', T0, 0), 2);
  assert.deepEqual(s.mys.it[0], { id: 'radish', v: [30, 20] });
  assert.deepEqual(s.bag, [{ id: 'radish', v: 10 }]);
  fill(s, 'radish', 20, 5);
  assert.equal(L.mysPut(s, 'radish', 21, 'bag', T0, 0), 21);   // 23 over three slots of 10
  assert.deepEqual(s.mys.it.map((e) => e && e.v.length), [10, 10, 3]);
  fill(s, 'potato', 1, 7);
  assert.equal(L.mysPut(s, 'potato', 1, 'bag', T0, 0), 0, 'no free slot for a new item');
  assert.equal(L.mysPut(s, 'nope', 1, 'bag', T0, 0), 0);
  s.shed = [{ id: 'potato', v: 9 }];
  s.mys.it[2] = null;
  assert.equal(L.mysPut(s, 'potato', 1, 'shed', T0, 0), 1);
  assert.equal(s.shed, undefined, 'empty 창고 goes away');
  assert.deepEqual(s.mys.it[2], { id: 'potato', v: [9] });
  // take back: as many as the basket holds
  s.bag = []; while (s.bag.length < L.bagCap(s) - 2) s.bag.push({ id: 'radish', v: 1 });
  assert.equal(L.mysTake(s, 0, T0, 0), 2);
  assert.equal(s.mys.it[0].v.length, 8);
  s.bag.length = 0;
  assert.equal(L.mysTake(s, 0, T0, 0), 8);
  assert.equal(s.mys.it[0], null);
  assert.equal(L.mysTake(s, 0, T0, 0), 0);
});

test('customers: one unit per gap, coins into the 금고, none before the first gap', () => {
  const s = built(0), gap = L.mysGap(s);
  assert.equal(gap, L.MYS_GAP);
  fill(s, 'radish', 5, 10);
  L.mysPut(s, 'radish', 5, 'bag', T0, 0);
  assert.equal(L.mysSettle(s, T0 + gap - 1, 0), 0);
  assert.deepEqual(L.mysPeek(s, T0 + 3 * gap, 0).n, 3);
  assert.equal(units(s), 5, 'peek changes nothing');
  assert.equal(L.mysSettle(s, T0 + 3 * gap + 5, 0), 3);
  assert.equal(units(s), 2);
  const got = L.mysCollect(s, T0 + 3 * gap + 5, 0);
  assert.equal(got.n, 3);
  assert.equal(s.coins, got.c);
  assert.equal(s.mys.till, 0); assert.equal(s.mys.tn, 0); assert.equal(s.mys.n, 3);
  // runs out: the rest sell, then nothing more
  assert.equal(L.mysSettle(s, T0 + 100 * gap, 0), 2);
  assert.equal(units(s), 0);
  assert.equal(L.mysSettle(s, T0 + 200 * gap, 0), 0);
});

test('empty shelves: customers who came while empty are gone; the wait starts when something goes up', () => {
  const s = built(0), gap = L.mysGap(s);
  fill(s, 'radish', 3, 10);
  L.mysPut(s, 'radish', 3, 'bag', T0 + 10 * gap, 0);
  assert.equal(L.mysSettle(s, T0 + 10 * gap + gap - 1, 0), 0);
  assert.equal(L.mysSettle(s, T0 + 11 * gap, 0), 1);
});

test('catch-up cap: away longer than MYS_CATCHUP sells only MYS_CATCHUP worth', () => {
  const s = built(0);
  s.coins = 1e6; while (L.mysSlotCost(s)) L.mysAddSlot(s, T0, 0);
  fill(s, 'radish', L.MYS_SLOTS_MAX * L.MYS_STACK, 10);
  L.mysPut(s, 'radish', 999, 'bag', T0, 0);
  const cap = Math.floor(L.MYS_CATCHUP / L.mysGap(s));
  assert.ok(cap < L.MYS_SLOTS_MAX * L.MYS_STACK, 'the shelves outlast the catch-up');
  assert.equal(L.mysSettle(s, T0 + 10 * DAY, 0), cap);
});

test('clock set back: no sales for backward time, the same time never sells twice', () => {
  const s = built(0), gap = L.mysGap(s);
  fill(s, 'radish', 10, 10);
  L.mysPut(s, 'radish', 10, 'bag', T0, 0);
  assert.equal(L.mysSettle(s, T0 + 2 * gap, 0), 2);
  assert.equal(L.mysSettle(s, T0 - 6 * 3600e3, 0), 0, 'backward (within a day: a real clock slip, not a wrong clock)');
  assert.equal(L.mysSettle(s, T0 + gap, 0), 0, 'still behind');
  assert.equal(L.mysSettle(s, T0 + 2 * gap, 0), 0, 'already paid for');
  assert.equal(L.mysSettle(s, T0 + 3 * gap, 0), 1);
  assert.equal(s.mys.n, 3);
});

test('price = value × that sale day 장터 시세 × 등급 bonus, no slippage, s.mkt untouched', () => {
  const s = built(0), gap = L.mysGap(s);
  const k = L.mktStock('radish');
  fill(s, 'radish', 5, 100);
  L.mysPut(s, 'radish', 5, 'bag', T0, 0);
  L.mysSettle(s, T0 + 5 * gap, 0);
  const d = L.mktDay(T0 + gap, 0);
  assert.equal(L.mysUnitPrice('radish', 100, d, 1.2), Math.round(100 * L.mktPrice(k, d) * 1.2));
  assert.equal(s.mys.till, 5 * Math.round(100 * L.mktPrice(k, d) * L.MYS_BONUS[0]));
  assert.equal(s.mkt, undefined);
  assert.deepEqual(L.MYS_BONUS, [1.2, 1.25, 1.3, 1.4, 1.5]);   // tools/BALANCE.md 내 가게: top ×1.5, not ×1.8
  assert.deepEqual(L.MYS_LV_COST, [0, 20000, 45000, 90000, 160000]);
  // a sale that falls on the next day uses that day's price
  const s2 = built(0);
  fill(s2, 'radish', 1, 100);
  const late = (20101 * DAY) - gap / 2;   // the first customer comes after midnight
  L.mysPut(s2, 'radish', 1, 'bag', late, 0);
  L.mysSettle(s2, late + gap, 0);
  assert.equal(s2.mys.till, Math.round(100 * L.mktPrice(k, 20101) * L.MYS_BONUS[0]));
});

test('꾸미기 shorten the customer gap (never below the floor); 등급 raises the bonus; old sales keep the old rate', () => {
  const s = built(0);
  s.coins = 1e6;
  assert.deepEqual(L.mysBuyDeco(s, 'nope', T0, 0), { ok: false, why: 'deco' });
  let last = L.mysGap(s);
  L.MYS_DECO.forEach((d) => {
    assert.deepEqual(L.mysBuyDeco(s, d.id, T0, 0), { ok: true });
    const g = L.mysGap(s);
    assert.ok(g < last); last = g;
  });
  assert.ok(L.mysGap(s) >= L.MYS_GAP * L.MYS_GAP_FLOOR);
  assert.deepEqual(L.mysBuyDeco(s, 'sign', T0, 0), { ok: false, why: 'have' });
  const poor = built(0);
  assert.deepEqual(L.mysBuyDeco(poor, 'sign', T0, 0), { ok: false, why: 'coins' });
  assert.deepEqual(L.mysLevelUp(poor, T0, 0), { ok: false, why: 'coins' });
  // levels
  const before = L.mysBonus(s);
  fill(s, 'radish', 2, 100);
  L.mysPut(s, 'radish', 2, 'bag', T0, 0);
  const gap = L.mysGap(s);
  L.mysSettle(s, T0 + gap, 0);
  const till1 = s.mys.till;
  assert.deepEqual(L.mysLevelUp(s, T0 + gap, 0), { ok: true });
  assert.ok(L.mysBonus(s) > before);
  L.mysSettle(s, T0 + 2 * gap, 0);
  assert.equal(s.mys.till - till1, L.mysUnitPrice('radish', 100, L.mktDay(T0 + 2 * gap, 0), L.MYS_BONUS[1]));
  while (L.mysLevelCost(s)) assert.deepEqual(L.mysLevelUp(s, T0, 0), { ok: true });
  assert.equal(s.mys.lv, L.MYS_BONUS.length - 1);
  assert.deepEqual(L.mysLevelUp(s, T0, 0), { ok: false, why: 'max' });
});

test('save round-trip keeps the shop; junk is dropped; no block = no shop', () => {
  const s = built(0);
  s.coins = 1e5;
  L.mysAddSlot(s, T0, 0); L.mysBuyDeco(s, 'lamp', T0, 0); L.mysLevelUp(s, T0, 0);
  fill(s, 'radish', 3, 12);
  L.mysPut(s, 'radish', 3, 'bag', T0, 0);
  L.mysSettle(s, T0 + L.mysGap(s), 0);
  const back = L.decode(L.encode(s));
  assert.deepEqual(back.mys, s.mys);
  const o = JSON.parse(L.encode(s));
  o.mys = { sl: 99, it: [{ id: 'nope', v: [1] }, { id: 'radish', v: [5, 'x', -1, 7, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }, 'junk', null], lv: 42, dec: { lamp: true, gold: true, sign: 'yes' }, t: T0, till: -5, tn: 'a', n: 3.7 };
  const j = L.decode(JSON.stringify(o)).mys;
  assert.equal(j.sl, L.MYS_SLOTS_MAX);
  assert.equal(j.it.length, L.MYS_SLOTS_MAX);
  assert.equal(j.it[0], null);
  assert.deepEqual(j.it[1], { id: 'radish', v: [5, 7, 1, 1, 1, 1, 1, 1, 1, 1] });
  assert.equal(j.it[2], null);
  assert.equal(j.lv, L.MYS_BONUS.length - 1);
  assert.deepEqual(j.dec, { lamp: true });
  assert.equal(j.till, 0); assert.equal(j.tn, 0); assert.equal(j.n, 3);
  for (const bad of [null, 'x']) {
    o.mys = bad;
    assert.equal(L.decode(JSON.stringify(o)).mys, undefined, JSON.stringify(bad));
  }
  // one bad field loses that field, never the shop: a missing/bad t falls back to savedAt, a bad it to empty shelves
  o.savedAt = T0;
  for (const bad of [{ it: [] }, { t: T0 }, { t: -1, it: [] }, { t: null, it: 'x', lv: 2 }]) {
    o.mys = bad;
    const q = L.decode(JSON.stringify(o)).mys;
    assert.ok(q, JSON.stringify(bad));
    assert.equal(q.t, T0, JSON.stringify(bad));
    assert.equal(q.it.length, L.MYS_SLOTS0);
  }
});

test('clock once set far ahead, then put right: the shop opens again at now, selling nothing for the jump', () => {
  const s = built(0);
  fill(s, 'radish', 10, 12);
  L.mysPut(s, 'radish', 10, 'bag', T0, 0);
  L.mysSettle(s, T0 + 365 * DAY, 0);                  // clock a year ahead
  const sold = s.mys.tn;
  L.mysSettle(s, T0 + MIN, 0);                        // clock put right
  assert.equal(s.mys.tn, sold, 'no sales for the backward step');
  assert.equal(s.mys.t, T0 + MIN);
  fill(s, 'radish', 1, 12);
  L.mysPut(s, 'radish', 1, 'bag', T0 + MIN, 0);
  L.mysSettle(s, T0 + MIN + L.mysGap(s), 0);
  assert.equal(s.mys.tn, sold + 1, 'not frozen until real time catches the wrong clock: a customer after one gap');
});

test('every released save loads without a 내 가게 block', () => {
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    if (JSON.parse(raw).mys) continue;   // released after the shop shipped: saves.test.js keeps it
    const s = L.decode(raw);
    assert.ok(s, f);
    assert.equal(s.mys, undefined, f);
    assert.equal(L.mysSettle(s, T0, 0), 0);
    assert.deepEqual(L.mysPeek(s, T0, 0), { n: 0, c: 0 });
  }
});
