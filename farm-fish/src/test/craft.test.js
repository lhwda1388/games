// farm-fish/test/craft.test.js — 가공 공방: build, machines, put, lazy batches by real time, take out, values, save
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = require('../build.js').build();
vm.runInThisContext(html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1], { filename: 'logic.js' });
const L = globalThis.Logic;
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const DAY = 86400e3, HOUR = 3600e3, T0 = 20100 * DAY + HOUR;
const farm = (c) => { const s = L.newState(0, seq(0.5)); s.rep = L.CFT_REP; s.coins = c; return s; };
const built = (...kinds) => {
  const s = farm(L.CFT_PRICE + 1e6);
  assert.deepEqual(L.cftBuild(s), { ok: true });
  for (const k of kinds) assert.deepEqual(L.cftBuy(s, k), { ok: true });
  return s;
};
const fill = (s, id, n, v) => { for (let k = 0; k < n; k++) s.bag.push({ id, v: typeof v === 'function' ? v(k) : v }); };
const TIME = (k) => L.cftDef(k).time;

test('building: needs ★ and the coins; no s.craft before', () => {
  const s = farm(L.CFT_PRICE - 1);
  assert.equal(s.craft, undefined);
  assert.deepEqual(L.cftBuild(s), { ok: false, why: 'coins' });
  s.coins = L.CFT_PRICE; s.rep = L.CFT_REP - 1;
  assert.deepEqual(L.cftBuild(s), { ok: false, why: 'rep' });
  s.rep = L.CFT_REP;
  assert.deepEqual(L.cftBuild(s), { ok: true });
  assert.equal(s.coins, 0);
  assert.deepEqual(s.craft, { m: [], dx: {} });
  assert.deepEqual(L.cftBuild(s), { ok: false, why: 'built' });
  assert.equal(L.CFT_REP, 10);
  assert.equal(L.CFT_PRICE, 15000);
});

test('machines: four kinds, up to 3 each, the 2nd ×1.5 and the 3rd ×2', () => {
  assert.deepEqual(L.CFT_M.map((d) => [d.k, d.price, d.time / HOUR]), [['jar', 4000, 3], ['rack', 6000, 4], ['salt', 10000, 8], ['cheese', 3000, 6]]);
  const s = farm(1e6);
  assert.deepEqual(L.cftBuy(s, 'jar'), { ok: false, why: 'craft' });
  L.cftBuild(s);
  const c0 = s.coins;
  assert.deepEqual([0, 1, 2].map(() => { const c = L.cftCost(s, 'jar'); L.cftBuy(s, 'jar'); return c; }), [4000, 6000, 8000]);
  assert.equal(c0 - s.coins, 18000);
  assert.equal(L.cftCost(s, 'jar'), 0);
  assert.deepEqual(L.cftBuy(s, 'jar'), { ok: false, why: 'max' });
  assert.deepEqual(L.cftBuy(s, 'nope'), { ok: false, why: 'kind' });
  assert.equal(L.cftCount(s, 'jar'), 3);
  s.coins = 9999;
  assert.deepEqual(L.cftBuy(s, 'salt'), { ok: false, why: 'coins' });
  assert.deepEqual(s.craft.m, [{ k: 'jar' }, { k: 'jar' }, { k: 'jar' }]);
});

test('inputs come from the game data: fruit/berries, fresh fish, sea fish + 갯벌, milk', () => {
  const flat = L.FLAT[0].id;
  assert.ok(L.cftAccepts('jar', 'apple') && !L.cftAccepts('jar', 'berry') && !L.cftAccepts('jar', 'raspberry'), '딸기류는 요리(딸기잼)로');
  assert.ok(!L.cftAccepts('jar', 'crucian') && !L.cftAccepts('jar', 'milk') && !L.cftAccepts('jar', 'radish'));
  assert.ok(L.cftAccepts('rack', 'crucian') && !L.cftAccepts('rack', 'goby'));
  assert.ok(L.cftAccepts('salt', 'goby') && L.cftAccepts('salt', flat) && !L.cftAccepts('salt', 'crucian'));
  assert.ok(L.cftAccepts('cheese', 'milk') && !L.cftAccepts('cheese', 'egg'));
  for (const d of L.CFT_M) {
    const ins = L.cftInputs(d.k);
    assert.ok(ins.length > 0, d.k);
    for (const id of ins) assert.notEqual(L.itemInfo(id).kind, 'craft');
    assert.ok(!L.cftAccepts(d.k, d.out), 'no crafting crafted goods');
  }
  for (const id of L.cftInputs('rack')) assert.equal(L.mktStock(id), 'fresh', id);
  for (const id of L.cftInputs('salt')) assert.ok(L.mktStock(id) === 'sea' || L.itemInfo(id).kind === 'flat', id);
});

test('put: one id into an empty machine, dearest first, at most 5', () => {
  const s = built('rack', 'rack');
  fill(s, 'crucian', 7, (k) => 10 * (k + 1));
  fill(s, 'goby', 1, 70);
  assert.equal(L.cftPut(s, 0, 'goby', 1, T0), 0, 'wrong machine');
  assert.equal(L.cftPut(s, 5, 'crucian', 1, T0), 0, 'no such machine');
  assert.equal(L.cftPut(s, 0, 'crucian', 9, T0), 5);
  assert.deepEqual(s.craft.m[0], { k: 'rack', id: 'crucian', v: [70, 60, 50, 40, 30], t: T0 });
  assert.equal(L.cftPut(s, 0, 'crucian', 1, T0), 0, 'busy');
  assert.equal(L.cftPut(s, 1, 'crucian', 1, T0), 1);
  assert.equal(L.bagCount(s, 'crucian'), 1);
  assert.equal(s.bag.find((e) => e.id === 'crucian').v, 10, 'the cheapest stays');
  assert.equal(L.cftPut(s, 1, 'crucian', 1, T0), 0);
});

test('a batch is done after its time, worked out lazily; take-out empties the machine', () => {
  const s = built('jar');
  fill(s, 'apple', 3, 220);
  L.cftPut(s, 0, 'apple', 3, T0);
  assert.equal(L.cftSettle(s, T0 + TIME('jar') - 1), 0);
  assert.equal(L.cftLeft(s.craft.m[0], T0 + TIME('jar') - 60e3), 60e3);
  assert.equal(L.cftTake(s, 0, T0 + TIME('jar') - 1), 0, 'not yet');
  assert.equal(L.cftSettle(s, T0 + TIME('jar')), 1);
  assert.equal(L.cftLeft(s.craft.m[0], T0 + TIME('jar')), 0);
  assert.equal(L.cftTake(s, 0, T0 + 5 * DAY), 3, 'closed for days: still there');
  assert.deepEqual(s.craft.m[0], { k: 'jar' });
  assert.deepEqual(s.bag, [0, 1, 2].map(() => ({ id: 'cjam', v: Math.round(220 * 1.4) })));
  assert.equal(s.craft.dx.cjam, 3);
  assert.equal(L.cftTake(s, 0, T0 + 6 * DAY), 0, 'never twice');
});

test('a clock set back finishes nothing early; a finished batch stays finished and comes out once', () => {
  const s = built('cheese');
  fill(s, 'milk', 2, 80);
  L.cftPut(s, 0, 'milk', 2, T0);
  assert.equal(L.cftSettle(s, T0 - 3 * HOUR), 0);
  assert.equal(L.cftLeft(s.craft.m[0], T0 - 3 * HOUR), TIME('cheese'), 'never more than the whole time');
  assert.equal(L.cftSettle(s, T0 + TIME('cheese') - 1), 0);
  assert.equal(L.cftSettle(s, T0 + TIME('cheese')), 1);
  assert.equal(L.cftSettle(s, T0 - DAY), 1, 'set back after it was done: still done');
  assert.equal(L.cftTake(s, 0, T0 - DAY), 2);
  assert.equal(L.cftTake(s, 0, T0 + DAY), 0);
  assert.equal(L.bagCount(s, 'ccheese'), 2);
});

test('a start far in the future was a wrong clock: it starts again from now', () => {
  const s = built('salt');
  fill(s, 'goby', 1, 70);
  L.cftPut(s, 0, 'goby', 1, T0 + 30 * DAY);           // put in while the clock read a month ahead
  assert.equal(L.cftSettle(s, T0), 0);
  assert.equal(s.craft.m[0].t, T0);
  assert.equal(L.cftSettle(s, T0 + TIME('salt') - 1), 0);
  assert.equal(L.cftSettle(s, T0 + TIME('salt')), 1);
  // a little ahead (up to the machine's own time) is a real wait, not reset
  const s2 = built('salt');
  fill(s2, 'goby', 1, 70);
  L.cftPut(s2, 0, 'goby', 1, T0 + TIME('salt'));
  L.cftSettle(s2, T0);
  assert.equal(s2.craft.m[0].t, T0 + TIME('salt'));
  // just past the machine's own time ahead (not a whole day): starts again from now, so the countdown never sits still for long
  const s3 = built('jar');
  fill(s3, 'apple', 1, 200);
  L.cftPut(s3, 0, 'apple', 1, T0 + TIME('jar') + 1);
  L.cftSettle(s3, T0);
  assert.equal(s3.craft.m[0].t, T0);
  assert.equal(L.cftLeft(s3.craft.m[0], T0), TIME('jar'));
});

test('take-out with a full basket: as many as fit, the rest waits in the machine', () => {
  const s = built('jar', 'jar');
  fill(s, 'apple', 5, (k) => 200 + k);
  L.cftPut(s, 0, 'apple', 5, T0);
  fill(s, 'radish', L.bagCap(s) - s.bag.length - 2, 30);
  assert.equal(L.cftTake(s, 0, T0 + TIME('jar')), 2);
  assert.equal(s.bag.length, L.bagCap(s));
  assert.equal(s.craft.m[0].v.length, 3);
  assert.equal(s.craft.m[0].d, 1);
  assert.equal(L.cftTake(s, 0, T0 + TIME('jar')), 0);
  assert.deepEqual(L.cftTakeAll(s, T0 + TIME('jar')), { n: 0, left: 3 });
  s.bag = s.bag.filter((e) => e.id !== 'radish');
  assert.deepEqual(L.cftTakeAll(s, T0 + TIME('jar')), { n: 3, left: 0 });
  assert.deepEqual(s.craft.m[0], { k: 'jar' });
  assert.deepEqual(s.bag.map((e) => e.v).sort(), [200, 201, 202, 203, 204].map((v) => Math.round(v * 1.4)).sort());
  assert.equal(s.craft.dx.cjam, 5);
  assert.ok(s.bag.length <= L.bagCap(s));
});

test('multiplier per machine, and only the first CFT_VCAP of an input is multiplied', () => {
  assert.deepEqual(L.CFT_M.map((d) => [d.k, d.mul]), [['jar', 1.4], ['rack', 1.7], ['salt', 1.7], ['cheese', 1.4]]);
  assert.equal(L.CFT_VCAP, 1000);
  assert.equal(L.cftValue(500, 'salt'), 850);
  assert.equal(L.cftValue(1000, 'salt'), 1700);
  assert.equal(L.cftValue(3500, 'salt'), 4200, 'a legend adds no more than a 1,000 fish');
  // cooking stays ahead for the same inputs: every machine's mul is under the pot's for its fruit / milk / fish dish
  [['jar', 'jam'], ['jar', 'gotgam'], ['cheese', 'cornsoup'], ['rack', 'maeuntang'], ['salt', 'nakjibok']].forEach(([k, r]) => {
    const rc = L.recipeById(r), c = rc.need.reduce((a, x) => a + L.itemInfo(x).price, 0);
    assert.ok(L.cftDef(k).mul < rc.sell / c, k + ' vs ' + r);
  });
  const s = built('salt');
  fill(s, 'oarfish', 1, 3500);
  L.cftPut(s, 0, 'oarfish', 1, T0);
  L.cftTake(s, 0, T0 + TIME('salt'));
  assert.deepEqual(s.bag, [{ id: 'cjeot', v: 4200 }]);
});

test('crafted goods keep their own value: sell, 시세, 창고, 지키기, 내 가게', () => {
  for (const d of L.CFT_M) {
    const it = L.itemInfo(d.out);
    assert.equal(it.kind, 'craft');
    assert.equal(it.name, d.outName);
    assert.equal(it.price, Math.round(L.itemInfo(d.ref).price * d.mul));
    assert.equal(L.mktStock(d.out), 'dish');
  }
  assert.equal(L.cftValue(333, 'jar'), 466);
  const s = built('jar');
  const dd = L.mktDay(T0, 0), m = L.mktPrice('dish', dd);
  s.bag.push({ id: 'cjam', v: 500 }, { id: 'cjam', v: 900 });
  assert.equal(L.mktValue(s, [{ id: 'cjam', v: 500 }], T0, 0), Math.round(500 * m));
  assert.equal(L.sellOne(s, 'cjam', T0, 0), Math.round(500 * m), 'the cheaper one goes first');
  assert.equal(L.shedPut(s, 'cjam', 1), 1);
  assert.deepEqual(s.shed, [{ id: 'cjam', v: 900 }]);
  assert.equal(L.shedTake(s, 'cjam', 1), 1);
  assert.deepEqual(s.bag, [{ id: 'cjam', v: 900 }]);
  s.keep = { cjam: true };
  assert.equal(L.sellAll(s, T0, 0), 0);
  assert.equal(s.bag.length, 1, '지키기 stays');
  // 내 가게
  s.rep = Math.max(s.rep, L.VILLAGE_REP); s.coins += L.MYS_PRICE;
  assert.deepEqual(L.mysBuild(s, T0), { ok: true });
  assert.equal(L.mysPut(s, 'cjam', 1, 'bag', T0, 0), 1);
  assert.deepEqual(s.mys.it[0], { id: 'cjam', v: [900] });
  assert.equal(L.mysUnitPrice('cjam', 900, dd, 1), Math.round(900 * m));
  L.mysSettle(s, T0 + L.mysGap(s), 0);
  assert.equal(s.mys.till, L.mysUnitPrice('cjam', 900, L.mktDay(T0 + L.mysGap(s), 0), L.mysBonus(s)));
});

test('orders ask for crafted goods only once the machine stands and its input can be had', () => {
  const s = farm(1e6);
  s.animals = s.animals || {};
  const ids = (st) => L.orderPool(st, false, 'spring').map((e) => e.id);
  assert.ok(!ids(s).some((id) => L.cftByOut(id)));
  assert.equal(L.obtainable(s, 'cjam'), false);
  L.cftBuild(s);
  assert.ok(!ids(s).some((id) => L.cftByOut(id)), 'a workshop alone asks for nothing');
  L.cftBuy(s, 'rack'); L.cftBuy(s, 'cheese');
  assert.ok(ids(s).includes('cdry'));
  assert.equal(L.obtainable(s, 'cdry'), true);
  assert.equal(L.obtainable(s, 'ccheese'), !!(s.animals && s.animals.cow > 0));
  assert.equal(ids(s).includes('ccheese'), L.obtainable(s, 'ccheese'), 'cheese only with a cow');
  assert.ok(!ids(s).includes('cjam'));
  // a posted crafted-good order can be filled and paid
  let seen = 0;
  for (let k = 0; k < 200; k++) {
    const o = L.genOrder(s, seq(0.5, k / 200, 0.3), 'spring');
    if (o.id !== 'cdry') continue;
    seen++;
    assert.equal(o.n, 1);
    assert.ok(o.reward >= L.itemInfo('cdry').price);
  }
  assert.ok(seen > 0, 'a 건어물 order turns up');
});

test('save: s.craft round-trips; a bad field loses only that field', () => {
  const s = built('jar', 'rack');
  fill(s, 'apple', 2, 220);
  L.cftPut(s, 0, 'apple', 2, T0);
  s.craft.dx.cdry = 4;
  const back = L.decode(L.encode(s));
  assert.deepEqual(back.craft, s.craft);
  const raw = JSON.parse(L.encode(s));
  raw.savedAt = T0;
  raw.craft = {
    m: [
      { k: 'jar', id: 'apple', v: [100, 'x', -1, 200.4, 1, 1, 1, 1], t: T0, d: 1 },
      { k: 'nope' }, 'junk', null,
      { k: 'rack', id: 'goby', v: [50], t: T0 },          // not a 건조대 input: the machine stays, empty
      { k: 'salt', id: 'goby', v: [50], t: 'bad' },       // bad start: the save time
      { k: 'cheese', id: 'milk', v: 'bad', t: T0 },
      { k: 'jar' }, { k: 'jar' }, { k: 'jar' }            // a 4th 장독 is one too many
    ],
    dx: { cjam: 3, cdry: 'x', nope: 5 }
  };
  const o = L.decode(JSON.stringify(raw));
  assert.deepEqual(o.craft.m, [
    { k: 'jar', id: 'apple', v: [100, 200, 1, 1, 1], t: T0, d: 1 },
    { k: 'rack' },
    { k: 'salt', id: 'goby', v: [50], t: T0 },
    { k: 'cheese' },
    { k: 'jar' }, { k: 'jar' }
  ]);
  assert.deepEqual(o.craft.dx, { cjam: 3 });
  raw.craft = { m: 'bad', dx: null };
  assert.deepEqual(L.decode(JSON.stringify(raw)).craft, { m: [], dx: {} }, 'the workshop is never lost');
  raw.craft = 'garbage';
  assert.equal(L.decode(JSON.stringify(raw)).craft, undefined);
  // crafted goods in the basket, 창고 and 지키기 survive a save
  const s2 = built('jar');
  s2.bag.push({ id: 'cjam', v: 777 }); s2.shed = [{ id: 'cdry', v: 321 }]; s2.keep = { cjeot: true };
  const b2 = L.decode(L.encode(s2));
  assert.deepEqual(b2.bag, [{ id: 'cjam', v: 777 }]);
  assert.deepEqual(b2.shed, [{ id: 'cdry', v: 321 }]);
  assert.deepEqual(b2.keep, { cjeot: true });
});

test('older saves load with no workshop', () => {
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    if (JSON.parse(raw).craft) continue;   // released after the workshop shipped: saves.test.js keeps it
    const s = L.decode(raw);
    assert.ok(s, f);
    assert.equal(s.craft, undefined, f);
    assert.equal(L.cftSettle(s, T0), 0);
    assert.deepEqual(L.cftTakeAll(s, T0), { n: 0, left: 0 });
    assert.ok(!L.orderPool(s, false, 'spring').some((e) => L.cftByOut(e.id)), f);
  }
});

test('놀거리 수첩: one 가공 공방 line, open at ★' + 10, () => {
  const g = L.GUIDE.filter((x) => x.id === 'craft');
  assert.equal(g.length, 1);
  assert.match(g[0].lock, new RegExp('★' + L.CFT_REP));
  const s = L.newState(0, seq(0.5));
  assert.equal(L.guideOpen(s, 'craft'), false);
  s.rep = L.CFT_REP;
  assert.equal(L.guideOpen(s, 'craft'), true);
});

test('a 장독 batch of 딸기류 saved before they moved to the pot still loads and comes out', () => {
  const raw = JSON.parse(L.encode(L.newState(T0, () => 0.5)));
  raw.craft = { m: [{ k: 'jar', id: 'berry', v: [160, 160], t: T0 }], dx: {} };
  const o = L.decode(JSON.stringify(raw));
  assert.deepEqual(o.craft.m[0], { k: 'jar', id: 'berry', v: [160, 160], t: T0 });
  assert.equal(L.cftPut(o, 0, 'berry', 1, T0), 0, 'but no new ones go in');
});
