// farm-fish/test/bank.test.js — 은행: deposit/withdraw, daily interest, cap, catch-up limit, save
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = require('../build.js').build();
vm.runInThisContext(html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1], { filename: 'logic.js' });
const L = globalThis.Logic;
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const DAY = 86400e3, D0 = 20100 * DAY + 3600e3;   // 1 a.m. on local day 20100 (tz 0)
const rich = (c) => { const s = L.newState(0, seq(0.5)); s.coins = c; return s; };

test('constants: 2%/day, 300,000 cap, 7 days of catch-up', () => {
  assert.equal(L.BANK_RATE, 0.02);
  assert.equal(L.BANK_CAP, 300000);
  assert.equal(L.BANK_CATCHUP, 7);
});

test('put in and take out move coins; no s.bank until the first deposit', () => {
  const s = rich(1000);
  assert.equal(s.bank, undefined);
  assert.equal(L.bankBal(s), 0);
  assert.deepEqual(L.bankTake(s, 10, D0, 0), { ok: false, why: 'bal' });
  assert.equal(s.bank, undefined);
  assert.deepEqual(L.bankPut(s, 0, D0, 0), { ok: false, why: 'n' });
  assert.deepEqual(L.bankPut(s, 1001, D0, 0), { ok: false, why: 'coins' });
  assert.deepEqual(L.bankPut(s, 600.9, D0, 0), { ok: true, n: 600 });
  assert.equal(s.coins, 400);
  assert.deepEqual(s.bank, { c: 600, d: 20100, i: 0 });
  assert.deepEqual(L.bankTake(s, 601, D0, 0), { ok: false, why: 'bal' }, 'cannot take more than the balance');
  assert.equal(s.coins, 400);
  assert.deepEqual(L.bankTake(s, 250, D0, 0), { ok: true, n: 250 });
  assert.equal(s.coins, 650); assert.equal(L.bankBal(s), 350);
  assert.deepEqual(L.bankTake(s, -5, D0, 0), { ok: false, why: 'n' });
});

test('interest: once per local midnight, floored, compounding; same day pays nothing', () => {
  const s = rich(10000);
  L.bankPut(s, 10000, D0, 0);
  assert.equal(L.bankSettle(s, D0 + 20 * 3600e3, 0), 0, 'still the same day');
  assert.equal(L.bankPeek(s, D0 + DAY, 0), 10200);
  assert.equal(L.bankSettle(s, D0 + DAY, 0), 200);
  assert.equal(L.bankSettle(s, D0 + DAY + 60e3, 0), 0, 'paid once a day');
  assert.equal(L.bankSettle(s, D0 + 3 * DAY, 0), 204 + 208);   // 10200 → 10404 → 10612
  assert.equal(L.bankBal(s), 10612);
  assert.equal(s.bank.i, 612);
  const t = rich(49); L.bankPut(t, 49, D0, 0);
  assert.equal(L.bankSettle(t, D0 + 5 * DAY, 0), 0, 'under 50 coins 2% floors to 0');
});

test('absence pays BANK_CATCHUP days at most', () => {
  const a = rich(10000), b = rich(10000);
  L.bankPut(a, 10000, D0, 0); L.bankPut(b, 10000, D0, 0);
  L.bankSettle(a, D0 + 7 * DAY, 0);
  L.bankSettle(b, D0 + 40 * DAY, 0);
  assert.equal(L.bankBal(b), L.bankBal(a));
  let c = 10000; for (let k = 0; k < 7; k++) c += Math.floor(c * 0.02);
  assert.equal(L.bankBal(a), c);
  assert.equal(b.bank.d, 20140, 'the missed days are gone, counting starts again today');
});

test('cap: deposits stop at BANK_CAP and interest stops there too', () => {
  const s = rich(2 * L.BANK_CAP);
  assert.deepEqual(L.bankPut(s, L.BANK_CAP + 1, D0, 0), { ok: false, why: 'cap' });
  assert.deepEqual(L.bankPut(s, L.BANK_CAP - 500, D0, 0), { ok: true, n: L.BANK_CAP - 500 });
  assert.deepEqual(L.bankPut(s, 501, D0, 0), { ok: false, why: 'cap' });
  assert.equal(L.bankSettle(s, D0 + DAY, 0), 500, '2% of interest, only 500 fits');
  assert.equal(L.bankBal(s), L.BANK_CAP);
  assert.equal(L.bankSettle(s, D0 + 3 * DAY, 0), 0);
  assert.deepEqual(L.bankPut(s, 1, D0 + 3 * DAY, 0), { ok: false, why: 'cap' });
  assert.equal(s.coins, 2 * L.BANK_CAP - (L.BANK_CAP - 500));
});

test('a clock set back pays nothing, and the same days do not pay twice', () => {
  const s = rich(10000);
  L.bankPut(s, 10000, D0 + 5 * DAY, 0);
  assert.equal(L.bankSettle(s, D0, 0), 0);
  assert.equal(s.bank.d, 20105);
  assert.equal(L.bankSettle(s, D0 + 5 * DAY, 0), 0);
  assert.equal(L.bankSettle(s, D0 + 6 * DAY, 0), 200);
});

test('timezone: the day turns at local midnight', () => {
  const s = rich(10000);
  L.bankPut(s, 10000, 20100 * DAY + 14 * 3600e3, 540);   // 23:00 in UTC+9
  assert.equal(L.bankSettle(s, 20100 * DAY + 15.5 * 3600e3, 540), 200, '00:30 next day there');
});

test('s.bank round-trips; junk is dropped; old saves load without it', () => {
  const s = rich(5000);
  L.bankPut(s, 3000, D0, 0); L.bankSettle(s, D0 + DAY, 0);
  assert.deepEqual(L.decode(L.encode(s)).bank, { c: 3060, d: 20101, i: 60 });
  const raw = JSON.parse(L.encode(s));
  raw.bank = { c: 1e9, d: 20101.5, i: 'x' };
  assert.deepEqual(L.decode(JSON.stringify(raw)).bank, { c: L.BANK_CAP, d: 20101, i: 0 });
  for (const bad of ['bad', { c: -1, d: 1 }, { c: 5 }, { c: 5, d: 'x' }]) {
    raw.bank = bad;
    const u = L.decode(JSON.stringify(raw));
    assert.ok(u); assert.equal(u.bank, undefined, JSON.stringify(bad));
  }
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    if (JSON.parse(raw).bank) continue;   // released after the bank shipped: saves.test.js keeps it
    const o = L.decode(raw);
    assert.ok(o, f);
    assert.equal(o.bank, undefined, f);
    assert.equal(L.bankSettle(o, D0, 0), 0, f);
    const c = o.coins;
    assert.equal(L.bankPut(o, Math.min(c, 10), D0, 0).ok, c > 0, f);
  }
});
