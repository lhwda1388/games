// farm-fish/test/market.test.js — 장터 시세: seeded daily walk, bounds, slippage, basket selling only, save
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
const fresh = () => { const s = L.newState(0, seq(0.5)); s.noSell = true; return s; };
// a day where 작물 is above ×1 (found, not assumed, so the walk constants can change)
const upDay = (id) => { for (let d = 20000; ; d++) if (L.mktPrice(id, d) >= 1.3) return d; };

test('same day → same board; days and timezones are local days', () => {
  const t = 20123 * DAY + 5e6;
  assert.deepEqual(L.mktBoard({}, t, 540), L.mktBoard({}, t, 540));
  assert.equal(L.mktDay(t, 0), 20123);
  assert.equal(L.mktDay(20123 * DAY - 60e3, 0), 20122);
  assert.equal(L.mktDay(20123 * DAY - 60e3, 60), 20123, 'an hour east is already the next day');
  const b = L.mktBoard({}, t, 0);
  assert.equal(b.length, L.MKT.length);
  for (const q of b) {
    assert.equal(q.hist.length, L.MKT_HIST);
    assert.equal(q.m, L.mktPrice(q.id, 20123));
    assert.equal(q.prev, L.mktPrice(q.id, 20122));
    assert.equal(q.hist[0], L.mktPrice(q.id, 20123 - L.MKT_HIST + 1));
  }
  assert.equal(L.mktPrice('nope', 20123), 1);
});

test('prices stay in ×MKT_MIN..×MKT_MAX, centre near ×1, and walk (today is close to yesterday)', () => {
  let lo = 9, hi = 0, step = 0, jump = 0, n = 0, sum = 0;
  for (let d = 19000; d < 21000; d++) for (const q of L.MKT) {
    const m = L.mktPrice(q.id, d), y = L.mktPrice(q.id, d - 1), far = L.mktPrice(q.id, d - 30);
    lo = Math.min(lo, m); hi = Math.max(hi, m);
    assert.equal(Math.round(m * 100) / 100, m, 'two decimals');
    step += Math.abs(m - y); jump += Math.abs(m - far); sum += Math.log(m); n++;
  }
  assert.ok(lo >= L.MKT_MIN && hi <= L.MKT_MAX, lo + '..' + hi);
  assert.ok(lo < 0.65 && hi > 1.6, 'the range gets used');
  assert.ok(Math.abs(sum / n) < 0.05, 'no drift');
  assert.ok(step < jump * 0.6, 'day to day moves are smaller than a month apart: trends, not noise');
});

test('items map to 종목; unknown kinds stay ×1', () => {
  assert.equal(L.mktStock('radish'), 'crop');
  assert.equal(L.mktStock('crucian'), 'fresh');
  assert.equal(L.mktStock('dace'), 'fresh');
  assert.equal(L.mktStock('mackerel'), 'sea');
  assert.equal(L.mktStock('maeuntang'), 'dish');
  assert.equal(L.mktStock('coal'), 'mine');
  assert.equal(L.mktStock('milk'), 'farm');
  assert.equal(L.mktStock('acorn'), 'wild');
  assert.equal(L.mktStock('nope'), null);
});

test('basket selling uses today\'s price; without a time it is the plain value', () => {
  const d = upDay('crop'), t = d * DAY + 1e6, m = L.mktPrice('crop', d);
  const s = fresh();
  L.bagAdd(s, 'radish', 100); L.bagAdd(s, 'radish', 50); L.bagAdd(s, 'radish', 30);
  const c0 = s.coins;
  assert.equal(L.mktValue(s, s.bag, t, 0), Math.round(100 * m) + Math.round(50 * m) + Math.round(30 * m));
  assert.equal(L.sellOne(s, 'radish', t, 0), Math.round(30 * m), 'cheapest one');
  assert.equal(L.sellId(s, 'radish', t, 0), Math.round(100 * m) + Math.round(50 * m));
  assert.equal(s.coins, c0 + Math.round(30 * m) + Math.round(100 * m) + Math.round(50 * m));
  assert.deepEqual(s.mkt, { d: d, n: { crop: 3 } });
  L.bagAdd(s, 'radish', 100);
  assert.equal(L.sellAll(s), 100, 'old callers: no market');
  // kept items stay; sellAll counts what it sold
  L.bagAdd(s, 'radish', 100); L.bagAdd(s, 'mackerel', 60); s.keep = { mackerel: true };
  assert.equal(L.sellAll(s, t, 0), Math.round(100 * m));
  assert.deepEqual(s.bag.map((e) => e.id), ['mackerel']);
  assert.equal(s.mkt.n.crop, 4);
});

test('slippage: past MKT_FREE units a day the price slides, never under ×1 (or the day\'s own price)', () => {
  assert.equal(L.mktEff(1.6, 0), 1.6);
  assert.equal(L.mktEff(1.6, L.MKT_FREE - 1), 1.6);
  assert.equal(L.mktEff(1.6, L.MKT_FREE), Math.round((1.6 - L.MKT_SLIP) * 100) / 100);
  assert.equal(L.mktEff(1.6, L.MKT_FREE + 1000), 1, 'floor ×1');
  assert.equal(L.mktEff(0.7, L.MKT_FREE + 1000), 0.7, 'a cheap day does not get cheaper');
  const d = upDay('crop'), t = d * DAY + 1e6, m = L.mktPrice('crop', d);
  const s = fresh();
  for (let k = 0; k < L.MKT_FREE + 5; k++) L.bagAdd(s, 'radish', 100);
  const got = L.sellAll(s, t, 0);
  let want = 0;
  for (let k = 0; k < L.MKT_FREE + 5; k++) want += Math.round(100 * L.mktEff(m, k));
  assert.equal(got, want);
  assert.ok(got < (L.MKT_FREE + 5) * Math.round(100 * m));
  const b = L.mktBoard(s, t, 0).find((q) => q.id === 'crop');
  assert.equal(b.sold, L.MKT_FREE + 5);
  assert.equal(b.now, L.mktEff(m, L.MKT_FREE + 5));
  // other 종목 are untouched, and the next day starts fresh
  assert.equal(L.mktBoard(s, t, 0).find((q) => q.id === 'sea').sold, 0);
  assert.equal(L.mktBoard(s, t + DAY, 0).find((q) => q.id === 'crop').sold, 0);
  L.bagAdd(s, 'radish', 100);
  assert.equal(L.sellAll(s, t + DAY, 0), Math.round(100 * L.mktPrice('crop', d + 1)));
  assert.deepEqual(s.mkt, { d: d + 1, n: { crop: 1 } });
});

test('orders pay their own reward, whatever the market says', () => {
  const d = upDay('crop'), t = d * DAY + 1e6;
  const s = fresh();
  s.orders[0] = { o: { id: 'radish', n: 2, reward: 77, rep: 1 }, at: 0 };
  L.bagAdd(s, 'radish', 100); L.bagAdd(s, 'radish', 100);
  const c0 = s.coins, r = L.deliver(s, 0, t, seq(0.5));
  assert.equal(r.coins, 77);
  assert.equal(s.coins, c0 + 77);
  assert.equal(s.mkt, undefined, 'orders do not count as market sales');
});

test('s.mkt round-trips; junk is dropped; old saves load without it', () => {
  const s = fresh();
  s.mkt = { d: 20100, n: { crop: 3, sea: 2 } };
  assert.deepEqual(L.decode(L.encode(s)).mkt, { d: 20100, n: { crop: 3, sea: 2 } });
  const raw = JSON.parse(L.encode(s));
  raw.mkt = { d: 20100.7, n: { crop: 2.9, evil: 5, sea: -1, dish: 'x' } };
  assert.deepEqual(L.decode(JSON.stringify(raw)).mkt, { d: 20100, n: { crop: 2 } });
  raw.mkt = 'bad';
  const u = L.decode(JSON.stringify(raw));
  assert.ok(u); assert.equal(u.mkt, undefined);
  assert.equal(L.decode(L.encode(L.newState(0, seq(0.5)))).mkt, undefined);
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const o = L.decode(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.ok(o, f);
    assert.equal(o.mkt, undefined, f);
    assert.equal(L.mktBoard(o, 20100 * DAY, 0).length, L.MKT.length, f);
  }
});
