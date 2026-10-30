// farm-fish/test/camp.test.js — 캠핑 (lane A): set, fire, grill, fireside guests, tent sleep + morning gift, equipment, stamps, save
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = require('../build.js').build();
vm.runInThisContext(html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1], { filename: 'logic.js' });
const L = globalThis.Logic;
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const DAY = 86400e3, MIN = 60e3, TZ = 0;
const T0 = 20100 * DAY + 3 * 3600e3;
// the first minute at or after t in game phase ph
const at = (ph, t = T0) => { let m = Math.ceil(t / MIN) * MIN; while (L.gameClock(m, TZ).phase !== ph) m += MIN; return m; };
const env = (t, weather = 'clear') => ({ phase: L.gameClock(t, TZ).phase, season: L.gameClock(t, TZ).season, weather });
const farm = () => {
  const s = L.newState(0, seq(0.5));
  s.rep = L.CMP_REP; s.coins = L.CMP_PRICE + 1e6;
  assert.ok(L.unlockForest(s, 0).ok);
  return s;
};
const camp = (...eq) => {
  const s = farm();
  assert.deepEqual(L.cmpBuy(s), { ok: true });
  s.coins = 1e7;
  for (const e of eq) assert.deepEqual(L.cmpBuyEq(s, e), { ok: true });
  return s;
};
const give = (s, id, n) => { for (let k = 0; k < n; k++) s.bag.push({ id, v: L.itemInfo(id).price }); };
const lit = (s, t) => { give(s, 'pinecone', 1); assert.equal(L.cmpLight(s, 'forest', t, TZ).ok, true); };

test('unlock: ★12, an open 숲 and the coins buy the 캠핑 세트; no s.camp before', () => {
  assert.equal(L.CMP_REP, 12); assert.equal(L.CMP_PRICE, 8000);
  const s = L.newState(0, seq(0.5));
  s.rep = 50; s.coins = 1e6;
  assert.equal(s.camp, undefined);
  assert.deepEqual(L.cmpBuy(s), { ok: false, why: 'forest' });
  assert.ok(L.unlockForest(s, 0).ok);
  s.rep = L.CMP_REP - 1;
  assert.deepEqual(L.cmpBuy(s), { ok: false, why: 'rep' });
  s.rep = L.CMP_REP; s.coins = L.CMP_PRICE - 1;
  assert.deepEqual(L.cmpBuy(s), { ok: false, why: 'coins' });
  s.coins = L.CMP_PRICE;
  assert.deepEqual(L.cmpBuy(s), { ok: true });
  assert.equal(s.coins, 0);
  assert.equal(s.camp.tent, 1);
  assert.deepEqual(s.camp.g, [null, null]);
  assert.deepEqual(L.cmpBuy(s), { ok: false, why: 'owned' });
  assert.ok(L.cmpSiteOk(s, 'forest'));
  assert.ok(!L.cmpSiteOk(s, 'nowhere'));
  assert.deepEqual(L.CMP_SITES.map((x) => [x.id, x.view]), [['forest', 'cmpforest'], ['valley', 'cmpvalley'], ['sea', 'cmpsea']]);
});

test('the fire: only in the evening or at night, costs a 솔방울 (basket, else 창고), burns until the 아침', () => {
  const s = camp(), day = at('day'), eve = at('evening');
  give(s, 'pinecone', 1);
  assert.deepEqual(L.cmpLight(s, 'forest', day, TZ), { ok: false, why: 'phase' });
  assert.equal(L.bagCount(s, 'pinecone'), 1);
  const r = L.cmpLight(s, 'forest', eve, TZ);
  assert.equal(r.ok, true);
  assert.equal(L.bagCount(s, 'pinecone'), 0);
  const morning = L.nextPhase(eve, TZ, 'morning').at;
  assert.equal(r.until, morning);
  assert.ok(L.cmpFireOn(s, 'forest', eve + MIN) && L.cmpFireOn(s, 'forest', morning - 1));
  assert.ok(!L.cmpFireOn(s, 'forest', morning), 'out when the 아침 comes');
  assert.deepEqual(L.cmpLight(s, 'forest', eve + MIN, TZ), { ok: false, why: 'lit' });
  // the next night: no fuel, then one from the 창고
  const n2 = at('night', morning);
  assert.deepEqual(L.cmpLight(s, 'forest', n2, TZ), { ok: false, why: 'fuel' });
  s.shed = [{ id: 'pinecone', v: 10 }];
  assert.equal(L.cmpLight(s, 'forest', n2, TZ).ok, true);
  assert.equal(s.shed, undefined, 'the 창고 one was used');
  // a clock set back far: the fire is out and can be lit again
  assert.ok(!L.cmpFireOn(s, 'forest', n2 - 2 * 3600e3));
  // the UI's phase (FF.phase) is honoured, but a fire never lasts past CMP_FIRE_MAX
  give(s, 'pinecone', 1);
  const q = L.cmpLight(s, 'forest', day + DAY, TZ, 'night');
  assert.equal(q.ok, true);
  assert.ok(q.until - (day + DAY) <= L.CMP_FIRE_MAX);
  // no camp: no fire
  assert.deepEqual(L.cmpLight(farm(), 'forest', eve, TZ), { ok: false, why: 'camp' });
});

test('camp recipes: 8, separate from the pot, worth inputs × 1.3 (less than any pot dish of the same inputs), 1–3 minutes', () => {
  assert.equal(L.CMP_RECIPES.length, 8);
  assert.ok(L.CMP_RECIPES.filter((r) => r.hidden).length >= 2);
  const pot = new Set(L.RECIPES.map((r) => r.id));
  for (const r of L.CMP_RECIPES) {
    assert.ok(!pot.has(r.id), r.id + ' is not a pot recipe');
    assert.ok(r.time >= 60e3 && r.time <= 180e3, r.id);
    const plain = r.need.reduce((v, id) => v + L.itemInfo(id).price, 0);
    assert.equal(L.cmpSell(r), Math.round(plain * 1.3));
    const it = L.itemInfo(r.id);
    assert.equal(it.kind, 'camp'); assert.equal(it.price, L.cmpSell(r));
    const key = r.need.slice().sort().join();
    for (const p of L.RECIPES) if (p.need.slice().sort().join() === key) assert.ok(p.sell > L.cmpSell(r), r.id + ' < ' + p.id);
  }
  assert.equal(L.mktStock('cmpotato'), 'dish');
  assert.equal(L.itemInfo('cmburnt').kind, 'camp');
  assert.ok(L.itemInfo('cmburnt').price < Math.min(...L.CMP_RECIPES.map(L.cmpSell)));
});

test('the grill: needs the fire and the inputs, done after its time, burns when left too long', () => {
  const s = camp(), t = at('night');
  give(s, 'potato', 2);
  assert.deepEqual(L.cmpCook(s, 'forest', 0, 'cmpotato', t), { ok: false, why: 'fire' });
  lit(s, t);
  assert.deepEqual(L.cmpCook(s, 'forest', 1, 'cmpotato', t), { ok: false, why: 'slot' }, 'one slot without the 석쇠');
  assert.deepEqual(L.cmpCook(s, 'forest', 0, 'cmmallow', t), { ok: false, why: 'need' }, 'no inputs');
  const r = L.cmpCook(s, 'forest', 0, 'cmpotato', t);
  assert.equal(r.ok, true); assert.equal(r.at, t + 120e3);
  assert.equal(L.bagCount(s, 'potato'), 0);
  assert.deepEqual(L.cmpCook(s, 'forest', 0, 'cmpotato', t), { ok: false, why: 'busy' });
  assert.equal(L.cmpTake(s, 0, t + 119e3), null, 'not yet');
  assert.equal(L.cmpLeft(s.camp.g[0], t + 60e3), 60e3);
  assert.equal(L.cmpSettleGrill(s, t + 120e3), 1);
  assert.equal(L.cmpBurnIn(s, s.camp.g[0], t + 120e3), L.CMP_BURN_MS);
  const got = L.cmpTake(s, 0, t + 121e3);
  assert.deepEqual(got, { id: 'cmpotato', burnt: false, first: true, sold: 0 });
  assert.equal(L.bagCount(s, 'cmpotato'), 1);
  assert.equal(s.camp.dx.cmpotato, 1);
  assert.equal(s.camp.g[0], null);
  // left too long: 탄 음식, not in the 캠핑 도감
  give(s, 'crucian', 2);
  L.cmpCook(s, 'forest', 0, 'cmfish', t + 2 * MIN);
  const burnt = L.cmpTake(s, 0, t + 2 * MIN + 90e3 + L.CMP_BURN_MS);
  assert.equal(burnt.id, 'cmburnt'); assert.equal(burnt.burnt, true);
  assert.equal(s.camp.dx.cmfish, undefined);
  // the food keeps cooking after the fire went out (a game closed overnight)
  give(s, 'corn', 1);
  L.cmpCook(s, 'forest', 0, 'cmcorn', t + 3 * MIN);
  assert.equal(L.cmpTake(s, 0, t + 3 * MIN + 150e3 + 1000).id, 'cmcorn');
});

test('grill clock guards: a clock set back finishes nothing early; a start far ahead restarts now', () => {
  const s = camp(), t = at('night');
  lit(s, t); give(s, 'potato', 2);
  L.cmpCook(s, 'forest', 0, 'cmpotato', t);
  assert.equal(L.cmpSettleGrill(s, t - 3600e3), 0, 'clock set back: still cooking');
  assert.equal(L.cmpLeft(s.camp.g[0], t - 3600e3), 120e3, 'never more than its whole time');
  s.camp.g[0].t = t + 3600e3;                          // started under a clock an hour ahead
  L.cmpSettleGrill(s, t);
  assert.equal(s.camp.g[0].t, t);
  // once done it stays done, even if the clock goes back
  L.cmpSettleGrill(s, t + 130e3);
  assert.equal(s.camp.g[0].d, 1);
  assert.equal(L.cmpSettleGrill(s, t), 1);
  assert.equal(L.cmpTake(s, 0, t).id, 'cmpotato');
});

test('equipment: 8 kinds, one each; 석쇠 = 2 slots, 테이블 = shorter, 아이스박스 = never burns', () => {
  assert.deepEqual(L.CMP_EQ.map((e) => e.id), ['lantern', 'chair', 'grill', 'hammock', 'guitar', 'table', 'icebox', 'scope']);
  const s = camp();
  s.coins = 0;
  assert.deepEqual(L.cmpBuyEq(s, 'grill'), { ok: false, why: 'coins' });
  s.coins = 1e6;
  assert.deepEqual(L.cmpBuyEq(s, 'grill'), { ok: true });
  assert.deepEqual(L.cmpBuyEq(s, 'grill'), { ok: false, why: 'owned' });
  assert.deepEqual(L.cmpBuyEq(s, 'nope'), { ok: false, why: 'none' });
  assert.deepEqual(L.cmpBuyEq(farm(), 'grill'), { ok: false, why: 'camp' });
  assert.equal(L.cmpSlots(s), 2);
  L.cmpBuyEq(s, 'table');
  const t = at('night');
  lit(s, t); give(s, 'potato', 4);
  assert.equal(L.cmpCook(s, 'forest', 0, 'cmpotato', t).at, t + Math.round(120e3 * L.CMP_TABLE_MUL));
  assert.equal(L.cmpCook(s, 'forest', 1, 'cmpotato', t).ok, true);
  L.cmpBuyEq(s, 'icebox');
  assert.equal(L.cmpTake(s, 0, t + 10 * 3600e3).id, 'cmpotato', '아이스박스: still good hours later');
  assert.equal(L.cmpBurnIn(s, s.camp.g[1], t + 10 * 3600e3), 0);
  // tents
  assert.deepEqual(L.CMP_TENTS.map((x) => x.name), ['1인 텐트', '가족 텐트', '캠핑카']);
  s.coins = 0;
  assert.deepEqual(L.cmpTentUp(s), { ok: false, why: 'coins' });
  s.coins = 1e6;
  assert.deepEqual(L.cmpTentUp(s), { ok: true, lv: 2 });
  assert.deepEqual(L.cmpTentUp(s), { ok: true, lv: 3 });
  assert.deepEqual(L.cmpTentUp(s), { ok: false, why: 'max' });
  assert.equal(L.cmpGiftN(s), 3);
  L.cmpBuyEq(s, 'hammock');
  assert.equal(L.cmpGiftN(s), 4);
});

test('sleep: only at night; the morning gift waits at the tent even when the game was closed, and the night is stamped', () => {
  const s = camp(), day = at('day'), t = at('night');
  assert.deepEqual(L.cmpSleep(s, 'forest', day, TZ, env(day)), { ok: false, why: 'phase' });
  const r = L.cmpSleep(s, 'forest', t, TZ, env(t));
  const morning = L.nextPhase(t, TZ, 'morning').at;
  assert.deepEqual(r, { ok: true, wake: morning });
  assert.deepEqual(L.cmpSleep(s, 'forest', t + MIN, TZ, env(t)), { ok: false, why: 'asleep' });
  assert.equal(L.cmpSettleSleep(s, morning - 1, TZ), null);
  const g = L.cmpSettleSleep(s, morning + 5 * 3600e3, TZ);   // came back hours later
  assert.equal(g.items.length, 1, '1인 텐트: one thing');
  assert.ok(L.CMP_SITES[0].gifts.some((x) => x.id === g.items[0]));
  const key = 'forest:' + env(t).season + ':clear';
  assert.equal(g.key, key); assert.equal(g.fresh, true);
  assert.equal(s.camp.st[key], 1);
  assert.deepEqual(s.camp.gift, g.items);
  assert.equal(s.camp.sleep, undefined);
  assert.equal(L.cmpSettleSleep(s, morning + 6 * 3600e3, TZ), null, 'one gift per night');
  const got = L.cmpTakeGift(s, morning + 6 * 3600e3, TZ);
  assert.deepEqual(got.ids, g.items);
  assert.equal(L.bagCount(s, g.items[0]), 1);
  assert.deepEqual(s.camp.gift, []);
  // the gift is fixed by the wake time: the same night gives the same things
  const s2 = camp();
  L.cmpSleep(s2, 'forest', t, TZ, env(t));
  assert.deepEqual(L.cmpSettleSleep(s2, morning, TZ).items, g.items);
  // fog stamps as 맑음, rain as 비
  const s3 = camp();
  L.cmpSleep(s3, 'forest', t, TZ, env(t, 'rain'));
  assert.equal(L.cmpSettleSleep(s3, morning, TZ).key, 'forest:' + env(t).season + ':rain');
  assert.equal(L.CMP_WX.fog, 'clear');
});

test('gift count: 1 + (tent − 1) + 해먹', () => {
  const s = camp('hammock'), t = at('night');
  L.cmpTentUp(s);
  L.cmpSleep(s, 'forest', t, TZ, env(t));
  assert.equal(L.cmpSettleSleep(s, t + 3600e3, TZ).items.length, 3);
});

test('at most 3 nights a real day; the count resets only when the day moves forward (clock set back or far ahead)', () => {
  const s = camp();
  let t = at('night', 20100 * DAY + 60e3);
  const day0 = Math.floor(t / DAY);
  for (let k = 0; k < 3; k++) {
    assert.equal(L.cmpSleep(s, 'forest', t, TZ, env(t)).ok, true, 'night ' + k);
    L.cmpSettleSleep(s, s.camp.sleep.w, TZ);
    t = at('night', t + 20 * MIN);
    assert.equal(Math.floor(t / DAY), day0);
  }
  assert.equal(L.cmpGiftLeft(s, t, TZ), 0);
  assert.deepEqual(L.cmpSleep(s, 'forest', t, TZ, env(t)), { ok: false, why: 'cap' });
  // clock set back a few hours (same or previous day): still no 4th gift
  const back = at('night', t - 6 * 3600e3);
  assert.deepEqual(L.cmpSleep(s, 'forest', back, TZ, env(back)), { ok: false, why: 'cap' });
  const yday = at('night', (day0 - 1) * DAY + 3600e3);
  assert.deepEqual(L.cmpSleep(s, 'forest', yday, TZ, env(yday)), { ok: false, why: 'cap' }, 'the day before does not reset the count');
  // the next day: fresh
  const next = at('night', (day0 + 1) * DAY);
  assert.equal(L.cmpGiftLeft(s, next, TZ), 3);
  assert.equal(L.cmpSleep(s, 'forest', next, TZ, env(next)).ok, true);
  // a count stored far ahead (a wrong clock) counts as fresh
  const s2 = camp();
  s2.camp.gd = { d: day0 + 30, n: 3 };
  assert.equal(L.cmpGiftLeft(s2, t, TZ), 3);
  // slept under a clock set ahead, then put back: wakes at this night's end, one gift
  const s3 = camp(), n3 = at('night');
  s3.camp.sleep = { s: 'forest', w: n3 + 5 * DAY, se: 'spring', wx: 'clear' };
  assert.equal(L.cmpSettleSleep(s3, n3, TZ), null);
  assert.ok(s3.camp.sleep.w - n3 <= L.CMP_NIGHT_MAX);
  assert.equal(L.cmpSettleSleep(s3, n3 + L.CMP_NIGHT_MAX, TZ).items.length, 1);
  assert.equal(L.cmpSettleSleep(s3, n3 + DAY, TZ), null);
});

test('stamps: site × season × 맑음/비/눈; counts give titles and the 캠핑 깃발', () => {
  const keys = L.cmpStampKeys('forest');
  assert.equal(keys.length, 8, 'winter snows instead of raining');
  assert.ok(keys.includes('forest:winter:snow') && !keys.includes('forest:winter:rain') && keys.includes('forest:summer:rain'));
  const s = camp();
  assert.deepEqual(L.cmpTitles(s), []);
  const seasons = ['spring', 'summer', 'autumn', 'winter'];
  let t = at('night'), out = [];
  for (let k = 0; k < 6; k++) {
    s.camp.gd = { d: -1, n: 0 };
    const se = seasons[k % 4], wx = k < 4 ? 'clear' : se === 'winter' ? 'snow' : 'rain';
    L.cmpSleep(s, 'forest', t, TZ, { phase: 'night', season: se, weather: wx });
    out.push(L.cmpSettleSleep(s, s.camp.sleep.w, TZ));
    t = at('night', t + 20 * MIN);
  }
  assert.equal(L.cmpStampN(s), 6);
  assert.equal(out[2].title, '초보 캠퍼');
  assert.equal(out[4].deco, L.CMP_DECO);
  assert.ok(s.yard.deco[L.CMP_DECO]);
  assert.deepEqual(L.cmpTitles(s), ['초보 캠퍼']);
  // a night already stamped adds to its count, not a new stamp
  s.camp.gd = { d: -1, n: 0 };
  L.cmpSleep(s, 'forest', t, TZ, { phase: 'night', season: 'spring', weather: 'fog' });
  const again = L.cmpSettleSleep(s, s.camp.sleep.w, TZ);
  assert.equal(again.fresh, false); assert.equal(s.camp.st['forest:spring:clear'], 2);
  assert.equal(L.cmpStampN(s), 6);
});

test('fireside guests: only while the fire burns; the chair brings them more; one 친밀도 gain per person a real day', () => {
  const s = camp(), t = at('night');
  s.rep = Math.max(s.rep, L.VILLAGE_REP);
  L.adoptPet(s, 'dog', '', 0);
  assert.ok(L.cmpGuests(s).includes('pet') && L.cmpGuests(s).includes('grandma'));
  const span = 400;
  assert.equal(L.cmpGuest(s, 'forest', t), null, 'no fire');
  s.camp.fire = { s: 'forest', u: t + 2 * L.CMP_FIRE_MAX };
  assert.equal(L.cmpGuest(s, 'forest', t), null, 'a fire further ahead than CMP_FIRE_MAX is out');
  const plain = camp();
  Object.assign(plain, { rep: s.rep, pet: s.pet });
  // the share of windows with a guest, a fresh fire in each
  const rate = (q) => { let n = 0; for (let k = 0; k < span; k++) { const m = t + k * L.CMP_VISIT_MS; q.camp.fire = { s: 'forest', u: m + MIN }; if (L.cmpGuest(q, 'forest', m)) n++; } return n / span; };
  const p0 = rate(plain);
  L.cmpBuyEq(plain, 'chair');
  const p1 = rate(plain);
  assert.ok(Math.abs(p0 - L.CMP_VISIT_P) < 0.1, 'about ' + L.CMP_VISIT_P + ': ' + p0);
  assert.ok(p1 > p0 + 0.15, 'chair: ' + p1);
  // talk: find a window with a guest
  let m = t, who = null;
  for (let k = 0; k < 50 && !who; k++) { m = t + k * L.CMP_VISIT_MS; s.camp.fire = { s: 'forest', u: m + MIN }; who = L.cmpGuest(s, 'forest', m); }
  assert.ok(who);
  assert.deepEqual(L.cmpTalk(s, 'forest', who === 'pet' ? 'grandma' : 'pet', m, TZ), { ok: false, why: 'gone' });
  const f0 = who === 'pet' ? s.pet.f : L.friendPoints(s, who);
  const r = L.cmpTalk(s, 'forest', who, m, TZ);
  assert.equal(r.ok, true); assert.equal(r.pts, L.CMP_TALK_PTS);
  assert.ok(L.cmpLinesOf(s, who).includes(r.text));
  assert.equal((who === 'pet' ? s.pet.f : L.friendPoints(s, who)) - f0, L.CMP_TALK_PTS);
  assert.equal(L.cmpTalk(s, 'forest', who, m + 1000, TZ).pts, 0, 'once a day');
  s.camp.tk.d += 1;   // a talk stored a day ahead (clock set back since): still counts, no second gain
  assert.equal(L.cmpTalk(s, 'forest', who, m + 2000, TZ).pts, 0);
  s.camp.tk.d -= 2;   // yesterday's: fresh again
  assert.equal(L.cmpTalk(s, 'forest', who, m + 3000, TZ).pts, L.CMP_TALK_PTS);
  // lines: 2–3 each, the 기타 adds more
  for (const id of Object.keys(L.CMP_LINES)) assert.ok(L.CMP_LINES[id].length >= 2 && L.CMP_LINES[id].length <= 3, id);
  const n0 = L.cmpLinesOf(s, 'grandma').length;
  L.cmpBuyEq(s, 'guitar');
  assert.ok(L.cmpLinesOf(s, 'grandma').length > n0);
  // no 마을 and no pet: nobody comes
  const lone = camp();
  lone.rep = 1;
  assert.deepEqual(L.cmpGuests(lone), []);
});

test('night camp insects: two, only at the forest camp at night, in the 곤충 도감 and 곤충실', () => {
  assert.deepEqual(L.CMP_BUGS.map((b) => b.id), ['latefly', 'flatstag']);
  const names = L.BUGS.map((b) => b.name);
  assert.equal(new Set(names).size, names.length, 'no name clashes');
  for (const b of L.CMP_BUGS) {
    assert.ok(L.bugById(b.id));
    assert.ok(L.MUSEUM_ROOMS.bug.ids.includes(b.id));
    assert.equal(L.bugWeight(b, 'forest', { season: 'summer', phase: 'night', weather: 'clear' }), 0);
    assert.equal(L.bugWeight(b, 'cmpforest', { season: 'summer', phase: 'day', weather: 'clear' }), 0);
    assert.ok(L.bugWeight(b, 'cmpforest', { season: 'summer', phase: 'night', weather: 'clear' }) > 0);
  }
  assert.deepEqual(L.bugPool('cmpforest', { season: 'autumn', phase: 'night', weather: 'clear' }).map((e) => e.id), ['latefly', 'flatstag']);
  assert.deepEqual(L.bugPool('cmpforest', { season: 'autumn', phase: 'day', weather: 'clear' }), []);
  const s = camp();
  assert.ok(L.buyNet(s).ok);
  assert.equal(L.catchBug(s, 'latefly').first, true);
  assert.ok(L.CMP_LANTERN_MUL < 1);
});

test('save: s.camp round-trips; a bad field loses only that field', () => {
  const s = camp('grill', 'lantern'), t = at('night');
  L.cmpTentUp(s);
  lit(s, t); give(s, 'potato', 2);
  L.cmpCook(s, 'forest', 1, 'cmpotato', t);
  L.cmpSleep(s, 'forest', t, TZ, env(t));
  s.camp.st['forest:summer:rain'] = 2; s.camp.dx.cmcorn = 3; s.camp.gift = ['cmdew', 'pinecone'];
  s.bag.push({ id: 'cmcorn', v: 390 });
  const back = L.decode(L.encode(s));
  assert.deepEqual(back.camp, s.camp);
  assert.ok(back.bag.some((e) => e.id === 'cmcorn' && e.v === 390));
  const raw = JSON.parse(L.encode(s));
  raw.camp = {
    tent: 9, eq: { lantern: true, nope: true, chair: 'yes' }, fire: { s: 'mars', u: 5 },
    g: [{ r: 'cmpotato', t: 'x', m: 1000 }, { r: 'cmcorn', t: t, m: 90e3, d: 1, b: 1 }, { r: 'cmfish', t: t, m: 1 }],
    sleep: { s: 'forest', w: t, se: 'monsoon', wx: 'clear' }, gift: ['cmdew', 'nope', 7], gd: { d: 'x', n: 2 }, tk: { d: 5, ids: { grandma: true, zz: true } },
    st: { 'forest:summer:rain': 2, 'forest:winter:rain': 1, bad: 3, 'forest:spring:clear': 'x' }, dx: { cmcorn: 2, nope: 1 }
  };
  const o = L.decode(JSON.stringify(raw)).camp;
  assert.equal(o.tent, 3);
  assert.deepEqual(o.eq, { lantern: true });
  assert.equal(o.fire, undefined);
  assert.deepEqual(o.g, [null, { r: 'cmcorn', t: t, m: 90e3, d: 1, b: 1 }]);
  assert.equal(o.sleep, undefined);
  assert.deepEqual(o.gift, ['cmdew']);
  assert.deepEqual(o.gd, { d: -1, n: 0 });
  assert.deepEqual(o.tk, { d: 5, ids: { grandma: true } });
  assert.deepEqual(o.st, { 'forest:summer:rain': 2 });
  assert.deepEqual(o.dx, { cmcorn: 2 });
  raw.camp = { tent: 'x', eq: null, g: 'bad', st: [], dx: 7 };
  const b2 = L.decode(JSON.stringify(raw)).camp;
  assert.equal(b2.tent, 1); assert.deepEqual(b2.g, [null, null]); assert.deepEqual(b2.st, {});
  raw.camp = 'garbage';
  assert.equal(L.decode(JSON.stringify(raw)).camp, undefined);
});

test('older saves load with no camp', () => {
  const dir = path.join(__dirname, 'fixtures');
  const t = at('night');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    if (JSON.parse(raw).camp) continue;   // released after camping shipped: saves.test.js keeps it
    const s = L.decode(raw);
    assert.ok(s, f);
    assert.equal(s.camp, undefined, f);
    assert.equal(L.cmpFireOn(s, 'forest', t), false);
    assert.equal(L.cmpGuest(s, 'forest', t), null);
    assert.equal(L.cmpSettleSleep(s, t, TZ), null);
    assert.equal(L.cmpSettleGrill(s, t), 0);
    assert.deepEqual(L.cmpTitles(s), []);
  }
});

test('놀거리 수첩: one 캠핑 line, open at ★12 with the 숲', () => {
  const g = L.GUIDE.filter((x) => x.id === 'camp');
  assert.equal(g.length, 1);
  assert.match(g[0].lock, new RegExp('★' + L.CMP_REP));
  const s = L.newState(0, seq(0.5));
  s.rep = L.CMP_REP;
  assert.equal(L.guideOpen(s, 'camp'), false);
  s.coins = 1e6; L.unlockForest(s, 0);
  assert.equal(L.guideOpen(s, 'camp'), true);
});

test('a hidden camp recipe is found by grilling its inputs together', () => {
  const s = camp(), t = at('night'), r = L.cmpRecipe('cmmallow');
  assert.equal(L.cmpKnown(s, r), false);
  lit(s, t); give(s, 'egg', 2); give(s, 'berry', 1);
  assert.equal(L.cmpCook(s, 'forest', 0, 'cmmallow', t).ok, true);
  assert.equal(L.cmpKnown(s, r), false, 'still ??? while it cooks');
  assert.equal(L.cmpTake(s, 0, t + r.time).first, true);
  assert.equal(L.cmpKnown(s, r), true);
});

// ---------- lane B: 계곡·바닷가 camps, night fishing, more night insects, rain/snow gifts, the star link ----------
const valleyOpen = (s, t) => { s.rep = Math.max(s.rep, 50); s.coins += 1e6; assert.ok(L.trnOpen(s, 'valley', t).ok); };

test('lane B sites: 계곡 needs the 계곡 route and that day\'s ticket; 바닷가 needs the 바다 spot', () => {
  const t = at('night');
  const s0 = farm();
  assert.equal(L.cmpGoStatus(s0, 'valley', t, TZ), 'camp');
  const s = camp();
  assert.equal(L.cmpGoStatus(s, 'forest', t, TZ), 'ok');
  assert.equal(L.cmpGoStatus(s, 'valley', t, TZ), 'open');
  assert.equal(L.cmpGoStatus(s, 'sea', t, TZ), 'open');
  assert.equal(L.cmpGoStatus(s, 'nowhere', t, TZ), 'open');
  valleyOpen(s, t);
  assert.ok(L.cmpSiteOk(s, 'valley'));
  assert.equal(L.cmpGoStatus(s, 'valley', t, TZ), 'ticket');
  assert.ok(L.trnBuyTicket(s, 'valley', t, TZ).ok);
  assert.equal(L.cmpGoStatus(s, 'valley', t, TZ), 'ok');
  assert.equal(L.cmpGoStatus(s, 'valley', t + DAY, TZ), 'ticket', 'a new day needs a new ticket');
  s.spotOk = s.spotOk || {}; s.spotOk.sea = true;
  assert.equal(L.cmpGoStatus(s, 'sea', t, TZ), 'ok');
  assert.equal(L.cmpGoStatus(s, 'sea', t + 5 * DAY, TZ), 'ok', 'no ticket for the sea');
  // each new site has its own view, insect place, night-fishing spot and morning gifts (all real items)
  for (const id of ['valley', 'sea']) {
    const x = L.cmpSite(id);
    assert.ok(x.view && L.BUG_PLACES[x.place] && L.SPOTS[x.spot] && x.spot !== x.view);
    for (const g of x.gifts) assert.ok(L.itemInfo(g.id), g.id);
    assert.equal(L.cmpSiteBySpot(x.spot), x);
  }
  assert.equal(L.cmpSiteBySpot('pond'), null);
  // the 계곡 camp needs that day's ticket for everything there, not only to get in (a midnight inside ends it)
  give(s, 'pinecone', 1);
  assert.deepEqual(L.cmpLight(s, 'valley', at('night', t + DAY), TZ), { ok: false, why: 'ticket' });
});

test('계곡 camp: fire, grill and sleep need that day\'s ticket; crossing midnight inside ends them', () => {
  const t = at('night'), s = camp();
  valleyOpen(s, t);
  give(s, 'pinecone', 2); give(s, 'potato', 2);
  assert.deepEqual(L.cmpLight(s, 'valley', t, TZ), { ok: false, why: 'ticket' });
  assert.deepEqual(L.cmpSleep(s, 'valley', t, TZ, env(t)), { ok: false, why: 'ticket' });
  assert.ok(L.trnBuyTicket(s, 'valley', t, TZ).ok);
  assert.equal(L.cmpLight(s, 'valley', t, TZ).ok, true);
  assert.equal(L.cmpCook(s, 'valley', 0, 'cmpotato', t, TZ).ok, true);
  // the next real day (the fire is still lit from last night's clock): no ticket, nothing works
  const t2 = at('night', (Math.floor(t / DAY) + 1) * DAY);
  s.camp.g[0] = null; s.camp.fire = { s: 'valley', u: t2 + MIN };
  give(s, 'potato', 2);
  assert.deepEqual(L.cmpCook(s, 'valley', 0, 'cmpotato', t2, TZ), { ok: false, why: 'ticket' });
  assert.deepEqual(L.cmpSleep(s, 'valley', t2, TZ, env(t2)), { ok: false, why: 'ticket' });
  delete s.camp.fire;
  assert.deepEqual(L.cmpLight(s, 'valley', t2, TZ), { ok: false, why: 'ticket' });
  assert.equal(L.cmpLight(s, 'forest', t2, TZ).ok, true, 'the 숲 needs no ticket');
});

test('night fishing: 3 new fish per camp, only in the evening and at night, only by that camp', () => {
  const ids = L.CMP_FISH.map((f) => f.id);
  assert.equal(ids.length, 6);
  assert.equal(L.CMP_FISH.filter((f) => f.spot === 'cmpbrook').length, 3);
  assert.equal(L.CMP_FISH.filter((f) => f.spot === 'cmpshore').length, 3);
  const names = L.FISH.map((f) => f.name), fids = L.FISH.map((f) => f.id);
  assert.equal(new Set(names).size, names.length, 'no fish name clashes');
  assert.equal(new Set(fids).size, fids.length, 'no fish id clashes');
  for (const f of L.CMP_FISH) {
    assert.ok(L.fishById(f.id) && L.MUSEUM_ROOMS.fish.ids.includes(f.id), f.id);
    assert.ok(f.phase.every((p) => p === 'evening' || p === 'night'), f.id);
  }
  // the 바닷가 fish are worth more than the 계곡 ones, rarity for rarity
  for (const r of ['흔함', '드묾', '희귀']) {
    const v = L.CMP_FISH.find((f) => f.spot === 'cmpbrook' && f.rarity === r), sea = L.CMP_FISH.find((f) => f.spot === 'cmpshore' && f.rarity === r);
    assert.ok(sea.price > v.price, r);
  }
  const s = camp(), night = at('night'), day = at('day'), eve = at('evening');
  valleyOpen(s, night); L.trnBuyTicket(s, 'valley', night, TZ);
  assert.deepEqual(L.cmpFishOk(s, 'forest', night, TZ), { ok: false, why: 'none' }, 'no water at the 숲 camp');
  assert.deepEqual(L.cmpFishOk(s, 'valley', day, TZ), { ok: false, why: 'dark' });
  assert.deepEqual(L.cmpFishOk(s, 'sea', night, TZ), { ok: false, why: 'open' });
  assert.ok(!L.spotUnlocked(s, 'cmpbrook'));
  assert.deepEqual(L.cmpFishOk(s, 'valley', night, TZ), { ok: true, spot: 'cmpbrook' });
  assert.ok(L.spotUnlocked(s, 'cmpbrook'));
  assert.deepEqual(L.cmpFishOk(s, 'valley', day, TZ, 'night'), { ok: true, spot: 'cmpbrook' }, 'the UI phase (FF.phase) is honoured');
  assert.ok(L.setSpot(s, 'cmpbrook'));
  const pool = (t, ph) => L.availableFish(new Date(t), s, { phase: ph, season: 'summer', weather: 'clear' }).map((f) => f.id);
  assert.deepEqual(pool(night, 'night'), ['tunggari', 'miyugi', 'eolsari']);
  assert.deepEqual(pool(eve, 'evening'), ['tunggari', 'miyugi']);
  assert.deepEqual(pool(day, 'day'), [], 'nothing bites by day');
  assert.deepEqual(pool(day, 'morning'), []);
  const roll = L.rollFish(new Date(night), seq(0.99, 0.5), s, { phase: 'night', season: 'summer', weather: 'clear' });
  assert.ok(['tunggari', 'miyugi', 'eolsari'].includes(roll.id));
  // not at home: the camp fish never bite at the 연못·바다
  s.spotOk.sea = true;
  for (const sp of ['pond', 'sea']) { assert.ok(L.setSpot(s, sp)); assert.ok(pool(night, 'night').every((id) => !ids.includes(id)), sp); }
  // the 바닷가 spot
  assert.deepEqual(L.cmpFishOk(s, 'sea', night, TZ), { ok: true, spot: 'cmpshore' });
  assert.ok(L.setSpot(s, 'cmpshore'));
  assert.deepEqual(pool(night, 'night'), ['bollak', 'gamseong', 'nongeo']);
  assert.equal(L.SPOTS.cmpbrook.fresh, true); assert.ok(!L.SPOTS.cmpshore.fresh);
});

test('night insects at the 계곡·바닷가 camps: 2 each, only there, only after dark, in the 곤충 도감 and 곤충실', () => {
  assert.deepEqual(L.CMP_BUGS_B.map((b) => [b.id, b.at[0]]), [['caddisfly', 'cmpvalley'], ['owlfly', 'cmpvalley'], ['sandbeetle', 'cmpsea'], ['hawkmoth', 'cmpsea']]);
  const names = L.BUGS.map((b) => b.name);
  assert.equal(new Set(names).size, names.length, 'no name clashes');
  for (const b of L.CMP_BUGS_B) {
    assert.ok(L.bugById(b.id) && L.MUSEUM_ROOMS.bug.ids.includes(b.id), b.id);
    assert.equal(L.bugWeight(b, b.at[0], { season: 'summer', phase: 'day', weather: 'clear' }), 0);
    assert.ok(L.bugWeight(b, b.at[0], { season: 'summer', phase: 'night', weather: 'clear' }) > 0);
    assert.equal(L.bugWeight(b, 'cmpforest', { season: 'summer', phase: 'night', weather: 'clear' }), 0);
  }
  assert.deepEqual(L.bugPool('cmpvalley', { season: 'winter', phase: 'night', weather: 'clear' }).map((e) => e.id), ['caddisfly'], 'a winter night still has one');
  assert.deepEqual(L.bugPool('cmpsea', { season: 'summer', phase: 'night', weather: 'clear' }).map((e) => e.id), ['sandbeetle', 'hawkmoth']);
});

test('rain and snow nights: a 빗소리 유리병 or a 꼬마 눈사람 on top of the site\'s gifts; clear nights neither', () => {
  const t = at('night'), morning = L.nextPhase(t, TZ, 'morning').at;
  const night = (wx, site = 'forest') => {
    const s = camp();
    if (site === 'valley') { valleyOpen(s, t); assert.ok(L.trnBuyTicket(s, 'valley', t, TZ).ok); }
    if (site === 'sea') s.spotOk = { sea: true };
    assert.equal(L.cmpSleep(s, site, t, TZ, { ...env(t, wx), season: wx === 'snow' ? 'winter' : 'summer' }).ok, true);   // a weather that season has
    return L.cmpSettleSleep(s, morning, TZ);
  };
  const clear = night('clear'), rain = night('rain'), snow = night('snow');
  assert.ok(!clear.items.includes('cmrain') && !clear.items.includes('cmsnowman'));
  assert.deepEqual(rain.items, clear.items.concat('cmrain'), 'the same rolls, plus the rain gift');
  assert.deepEqual(snow.items, clear.items.concat('cmsnowman'));
  assert.ok(!night('fog').items.includes('cmrain'), 'fog is a clear night');
  assert.deepEqual(night('rain'), rain, 'fixed by the wake time');
  const sea = night('snow', 'sea');
  assert.equal(sea.key.split(':')[0], 'sea');
  assert.equal(sea.items[sea.items.length - 1], 'cmsnowman');
  assert.ok(sea.items.slice(0, -1).every((id) => L.cmpSite('sea').gifts.some((g) => g.id === id)));
  assert.equal(night('rain', 'valley').items.slice(-1)[0], 'cmrain');
  for (const id of ['cmrain', 'cmsnowman', 'cmpebble']) assert.equal(L.itemInfo(id).kind, 'camp', id);
  assert.ok(L.itemInfo('cmrain').price > L.itemInfo('cmdew').price);
});

test('star link: constellations and 유성우 coin wishes from a camp pay ×1.5, more with the 망원경 받침', () => {
  const s = camp(), n = at('night');
  assert.equal(L.cmpStarMul(s, false), 1);
  assert.equal(L.cmpStarMul(farm(), true), 1, 'no camp, no bonus');
  assert.equal(L.cmpStarMul(s, true), L.CMP_STAR_MUL);
  assert.equal(L.CMP_STAR_MUL, 1.5);
  s.coins = 0; s.sky = { own: true, seen: {}, wish: null, n: 0 };
  assert.deepEqual(L.seeStar(s, 'orion', n, L.cmpStarMul(s, true)), { first: true, coins: 450 });
  assert.deepEqual(L.seeStar(s, 'orion', n, L.cmpStarMul(s, true)), { first: false, coins: 60 });
  assert.deepEqual(L.seeStar(s, 'orion', n), { first: false, coins: 40 }, 'the 마당 pays as before');
  assert.equal(s.coins, 550);
  s.coins = 1e6; assert.ok(L.cmpBuyEq(s, 'scope').ok);
  assert.equal(L.cmpStarMul(s, true), L.CMP_STAR_MUL * L.CMP_SCOPE_MUL);
  assert.equal(L.seeStar(s, 'leo', n, L.cmpStarMul(s, true)).coins, 675);
  // a coin wish: 400 at home, × the camp's star bonus at the camp (the seed and decorations are not multiplied)
  const w = (mul) => { const q = camp(); q.coins = 0; q.sky = { own: true, seen: {}, wish: null, n: 0 }; return L.meteorWish(q, n, seq(0.9, 0.5), undefined, mul); };
  assert.deepEqual(w(), { kind: 'coins', coins: 400 });
  assert.deepEqual(w(1.5), { kind: 'coins', coins: 600 });
  const q = camp(); q.sky = { own: true, seen: {}, wish: null, n: 0 };
  assert.equal(L.meteorWish(q, n, seq(0.4), undefined, 9).kind, 'seed');
});

test('save: the lane B fields round-trip, the camps\' spots reopen, and a reload never starts on a camp\'s water', () => {
  const t = at('night'), s = camp('scope');
  valleyOpen(s, t); L.trnBuyTicket(s, 'valley', t, TZ);
  give(s, 'pinecone', 1); L.cmpLight(s, 'valley', t, TZ);
  const winter = { ...env(t, 'snow'), season: 'winter' };
  assert.equal(L.cmpSleep(s, 'sea', t, TZ, winter).ok, false, 'the 바닷가 is not open yet');
  s.spotOk.sea = true;
  assert.equal(L.cmpSleep(s, 'sea', t, TZ, winter).ok, true);
  s.camp.st['valley:summer:rain'] = 1; s.camp.st['sea:winter:snow'] = 2; s.camp.gift = ['cmrain', 'cmsnowman', 'cmpebble'];
  assert.ok(L.cmpFishOk(s, 'valley', t, TZ).ok); assert.ok(L.setSpot(s, 'cmpbrook'));
  s.bag.push({ id: 'cmrain', v: 280 });
  const back = L.decode(L.encode(s));
  assert.deepEqual(back.camp, s.camp);
  assert.deepEqual(back.camp.fire, { s: 'valley', u: s.camp.fire.u });
  assert.equal(back.camp.sleep.s, 'sea'); assert.equal(back.camp.sleep.wx, 'snow');
  assert.ok(L.spotUnlocked(back, 'cmpbrook') && L.spotUnlocked(back, 'cmpshore'), 'the camps\' spots are open again');
  assert.equal(L.curSpot(back), 'pond', 'a reload starts at home, not on the camp\'s water');
  assert.ok(back.bag.some((e) => e.id === 'cmrain'));
  // without the route and the 바다 (a hand-edited save) the stamps stay but the spots stay shut
  const raw = JSON.parse(L.encode(s)); delete raw.train; raw.spotOk = {};
  const o = L.decode(JSON.stringify(raw));
  assert.equal(o.camp.st['valley:summer:rain'], 1);
  assert.ok(!L.spotUnlocked(o, 'cmpbrook') && !L.spotUnlocked(o, 'cmpshore'));
  raw.camp.sleep = { s: 'moon', w: t, se: 'summer', wx: 'rain' }; raw.camp.fire = { s: 'sea', u: 'x' };
  const o2 = L.decode(JSON.stringify(raw));
  assert.equal(o2.camp.sleep, undefined); assert.equal(o2.camp.fire, undefined);
});

test('older saves still load with lane B: no camp spots, no camp fish in the dex', () => {
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const s = L.decode(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.ok(s, f);
    assert.ok(!L.spotUnlocked(s, 'cmpbrook') || s.camp, f);
    assert.ok(!L.cmpSiteBySpot(L.curSpot(s)), f);
    for (const fd of L.CMP_FISH) assert.equal(s.dex.fish[fd.id], undefined, f);
  }
});

test('cap: a clock set back 2+ days and then forward again never refills the day (gifts and fireside talks)', () => {
  const s = camp();
  let t = at('night', 20100 * DAY + 60e3);
  const day0 = Math.floor(t / DAY);
  for (let k = 0; k < 3; k++) {
    assert.equal(L.cmpSleep(s, 'forest', t, TZ, env(t)).ok, true);
    L.cmpSettleSleep(s, s.camp.sleep.w, TZ);
    t = at('night', t + 20 * MIN);
  }
  assert.equal(L.cmpGiftLeft(s, t, TZ), 0);
  // two days back: counted on its own (a clock once set far ahead must not freeze anything)
  const back = at('night', (day0 - 2) * DAY + 3600e3);
  assert.equal(L.cmpGiftLeft(s, back, TZ), 3);
  assert.equal(L.cmpSleep(s, 'forest', back, TZ, env(back)).ok, true);
  L.cmpSettleSleep(s, s.camp.sleep.w, TZ);
  // ... and forward to the real day again: still used up
  assert.equal(L.cmpGiftLeft(s, t, TZ), 0);
  assert.deepEqual(L.cmpSleep(s, 'forest', t, TZ, env(t)), { ok: false, why: 'cap' });
  // it survives a reload, and the next real day is fresh
  const re = L.decode(L.encode(s));
  assert.deepEqual(re.camp.gd, s.camp.gd);
  assert.equal(L.cmpGiftLeft(re, t, TZ), 0);
  const next = at('night', (day0 + 1) * DAY);
  assert.equal(L.cmpGiftLeft(re, next, TZ), 3);
  // a far-ahead count put right: each real day still gets its gifts
  const s2 = camp();
  s2.camp.gd = { d: day0 + 30, n: 3, h: day0 + 30, hn: 3 };
  assert.equal(L.cmpGiftLeft(s2, t, TZ), 3);
  assert.equal(L.cmpGiftLeft(s2, next, TZ), 3);
  // fireside talks: the same rule (the fire is set burning at each moment tried)
  const q = camp();
  q.rep = Math.max(q.rep, L.VILLAGE_REP);
  L.adoptPet(q, 'dog', '', 0);
  const petAt = (from) => {
    for (let w = 0; w < 400; w++) {
      const u = from + w * L.CMP_VISIT_MS;
      q.camp.fire = { s: 'forest', u: u + MIN };
      if (Math.floor(u / DAY) === Math.floor(from / DAY) && L.cmpGuest(q, 'forest', u) === 'pet') return u;
    }
    throw new Error('no pet by the fire');
  };
  const u0 = petAt(day0 * DAY + 60e3);
  assert.equal(L.cmpTalk(q, 'forest', 'pet', u0, TZ).pts, L.CMP_TALK_PTS);
  assert.equal(L.cmpTalk(q, 'forest', 'pet', petAt((day0 - 2) * DAY + 60e3), TZ).pts, L.CMP_TALK_PTS, 'two days back counts on its own');
  assert.equal(L.cmpTalk(q, 'forest', 'pet', petAt(u0 + 1), TZ).pts, 0, 'back on the real day: already talked');
  assert.deepEqual(L.decode(L.encode(q)).camp.tk, q.camp.tk);
  assert.equal(L.cmpTalk(q, 'forest', 'pet', petAt((day0 + 1) * DAY + 60e3), TZ).pts, L.CMP_TALK_PTS, 'the next real day is fresh');
});

test('wake: cmpSleep and cmpTakeGift hand back the morning they settled; a full pile reports only what fit', () => {
  const s = camp(), t = at('night'), wake = L.nextPhase(t, TZ, 'morning').at;
  assert.equal(L.cmpSleep(s, 'forest', t, TZ, env(t)).ok, true);
  const r = L.cmpTakeGift(s, wake + MIN, TZ);
  assert.ok(r.woke && r.woke.key.startsWith('forest:') && r.woke.items.length === 1 && r.woke.lost === 0);
  assert.deepEqual(r.ids, r.woke.items);
  assert.equal(L.cmpTakeGift(s, wake + 2 * MIN, TZ).woke, undefined);
  // a night ends just as the next one starts: the sleep call returns the wake event too
  const t2 = at('night', wake + MIN);
  s.camp.gd = { d: -1, n: 0 };
  assert.equal(L.cmpSleep(s, 'forest', t, TZ, env(t)).ok, true);
  const r2 = L.cmpSleep(s, 'forest', t2, TZ, env(t2));
  assert.equal(r2.ok, true); assert.ok(r2.woke && r2.woke.items.length === 1);
  // the pile is full: nothing more goes on it and the event says so (캠핑카 = 3 gifts, 1 place left)
  const p = camp(), t3 = at('night');
  p.coins = 1e7; L.cmpTentUp(p); L.cmpTentUp(p);
  p.camp.gift = Array(L.CMP_GIFT_MAX - 1).fill('cmdew');
  assert.equal(L.cmpSleep(p, 'forest', t3, TZ, env(t3)).ok, true);
  const ev = L.cmpSettleSleep(p, p.camp.sleep.w, TZ);
  assert.equal(ev.items.length, 1); assert.equal(ev.lost, 2);
  assert.equal(p.camp.gift.length, L.CMP_GIFT_MAX);
});

test('stamps: a weather that season never has sleeps as 맑음, so the stamp survives a reload', () => {
  const s = camp(), t = at('night');
  assert.equal(L.cmpSleep(s, 'forest', t, TZ, { phase: 'night', season: 'winter', weather: 'rain' }).ok, true);
  assert.equal(s.camp.sleep.wx, 'clear');
  const ev = L.cmpSettleSleep(s, s.camp.sleep.w, TZ);
  assert.equal(ev.key, 'forest:winter:clear');
  assert.ok(!ev.items.includes('cmrain'));
  assert.deepEqual(L.decode(L.encode(s)).camp.st, s.camp.st);
  assert.equal(L.decode(L.encode(s)).camp.st['forest:winter:clear'], 1);
});
