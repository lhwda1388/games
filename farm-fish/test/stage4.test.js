// test/stage4.test.js — stage 4: 계절, 단골 주민, 수족관, 오늘의 할 일, N년차, 친구 기록 비교
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

function loadLogic() {
  const html = require('../build.js').build();
  const m = html.match(/<script id="logic">([\s\S]*?)<\/script>/);
  vm.runInThisContext(m[1], { filename: 'logic.js' });
  return globalThis.Logic;
}
const L = loadLogic();
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const DAY = 86400e3;
const plot = () => ({ crop: null, progress: 0, t: 0, yieldMul: 1, weed: false, crow: null, fert: false, last: null });

// a save exactly as stage 3 wrote it: newState + yard fields, no stage-4 fields
function stage3Save() {
  const s = L.newState(0, seq(0.5));
  s.coins = 4321; s.rep = 14; s.seedOk.potato = true; s.seedOk.pepper = true;
  s.bag = [{ id: 'crucian', v: 30 }, { id: 'radish', v: 30 }, { id: 'egg', v: 50 }];
  s.dex.fish.crucian = { n: 4, best: 28.5 }; s.dex.crops.radish = 9; s.dex.dish.jam = 2;
  s.spotOk = { river: true }; s.spot = 'river';
  L.yardOf(s);
  s.yard.house = 2; s.animals.hen = 2; s.yard.deco.flowers = true; s.yard.furn.bed = true;
  s.yard.eggs.scarecrow = 1000; s.yard.mail.push({ k: 'g0', at: 5, c: 20, read: true });
  return s;
}

test('v1 save still loads; stage-4 fields stay absent until used', () => {
  const v1 = { v: 1, coins: 500, sel: 'radish', plots: Array.from({ length: 6 }, plot), seeds: { gold: 0 }, up: { rod: 1 },
    items: { fert: 0 }, ms: {}, nextEventAt: 0, fish: { phase: 'idle' }, dex: { crops: { radish: 3 }, fish: {} }, savedAt: 0 };
  const s = L.decode(JSON.stringify(v1));
  assert.ok(s);
  assert.equal(s.coins, 500); assert.equal(s.up.rod, 1); assert.equal(s.dex.crops.radish, 3);
  for (const k of ['born', 'nick', 'res', 'tank', 'daily']) assert.equal(k in s, false, k);
  assert.equal(L.farmYear(s, 123), 1);
  L.ensureBorn(s, 5000);
  assert.equal(s.born, 5000);
  assert.equal(L.decode(L.encode(s)).born, 5000);
});

test('pre-stage-4 save (stage 3 shape) loads intact and round-trips', () => {
  const before = stage3Save();
  const s = L.decode(L.encode(before));
  assert.ok(s);
  assert.equal(s.coins, 4321); assert.equal(s.rep, 14); assert.equal(s.spot, 'river');
  assert.deepEqual(s.bag, before.bag);
  assert.equal(s.yard.house, 2); assert.equal(s.animals.hen, 2);
  assert.equal(s.yard.deco.flowers, true); assert.equal(s.yard.furn.bed, true); assert.equal(s.yard.eggs.scarecrow, 1000);
  assert.deepEqual(s.dex, before.dex);
  for (const k of ['born', 'nick', 'res', 'tank', 'daily']) assert.equal(k in s, false, k);
  assert.deepEqual(L.decode(L.encode(s)), s);
  // its orders get a resident without any new save field
  L.refreshOrders(s, 0, seq(0.3, 0.6, 0.9));
  s.orders.forEach((q) => assert.ok(L.residentById(L.residentFor(q.o))));
});

test('stage-4 fields round-trip; junk in them is dropped, not fatal', () => {
  const s = stage3Save();
  s.born = 1e12; s.nick = '밭주인';
  L.befriend(s, { id: 'radish', n: 3, reward: 90, rep: 1 });
  s.tank = [{ id: 'crucian', v: 30 }];
  L.ensureDaily(s, '2026-10-28');
  const back = L.decode(L.encode(s));
  assert.equal(back.born, 1e12); assert.equal(back.nick, '밭주인');
  assert.deepEqual(back.res, s.res); assert.deepEqual(back.tank, s.tank); assert.deepEqual(back.daily, s.daily);
  const o = JSON.parse(L.encode(s));
  o.nick = '<img src=x onerror=alert(1)>'; o.res = { f: { grandma: 'x', nobody: 5 }, lv: { kid: 99 }, rec: { kimchi: 1, ssukjeon: true }, unread: ['kid:2', '<b>', 5] };
  o.tank = [{ id: 'radish', v: 1 }, { id: 'nope', v: 1 }, { id: 'carp', v: 100 }, { id: 'carp', v: 101 }, { id: 'carp', v: 102 }, { id: 'carp', v: 103 }, { id: 'carp', v: 104 }, { id: 'carp', v: 105 }];
  o.daily = { key: '2026-10-28', goals: [{ t: 'crop', x: 'nope', n: 3, p: 0 }, { t: 'fish', n: 3, p: 9 }, { t: 'evil', n: 1, p: 0 }], paid: 'yes' };
  const j = L.decode(JSON.stringify(o));
  assert.ok(j);
  assert.equal(j.nick, 'img srcx');                              // only letters/digits/space survive, 8 max
  assert.deepEqual(j.res, { f: {}, lv: { kid: 4 }, rec: { ssukjeon: true }, unread: ['kid:2'] });
  assert.equal(j.tank.length, L.tankCap(j));                    // 기와집 = 5, non-fish and unknown ids dropped
  assert.ok(j.tank.every((e) => e.id === 'carp'));
  assert.deepEqual(j.daily, { key: '2026-10-28', goals: [{ t: 'fish', n: 3, p: 3 }], paid: false });
});

test('seasonal crops: one per season, plantable only in season, keep growing after it turns', () => {
  const by = {};
  L.SEASON_CROPS.forEach((c) => { by[c.season] = (by[c.season] || 0) + 1; });
  assert.deepEqual(by, { spring: 1, summer: 1, autumn: 1, winter: 1 });
  const s = L.newState(0, seq(0.5));
  s.coins = 9999;
  assert.equal(L.seedUnlocked(s, 'ssuk'), true);
  assert.equal(L.plant(s, 0, 'ssuk', 0, 'summer'), false);
  assert.equal(s.coins, 9999);
  assert.equal(L.plant(s, 0, 'ssuk', 0, 'spring'), true);
  assert.equal(L.plant(s, 1, 'cabbage', 0, 'spring'), false);
  assert.equal(L.plant(s, 1, 'cabbage', 0, 'winter'), true);
  assert.equal(L.plant(s, 2, 'radish', 0, 'winter'), true);       // year-round crops ignore the season
  // without a season given, the game clock decides
  const springNow = [...Array(28)].map((_, d) => d * DAY).find((t) => L.gameClock(t, 0).season === 'spring');
  assert.equal(L.plant(s, 3, 'ssuk', springNow), true);
  // planted in spring, harvested whenever: growth doesn't look at the season
  L.advance(s, L.CROPS.ssuk.grow + 1);
  assert.ok(L.isReady(s.plots[0]));
  assert.ok(L.harvest(s, 0, L.CROPS.ssuk.grow + 1, seq(0.9)));
  // seasonal crops never go on the order board
  for (let k = 0; k < 300; k++) assert.ok(!L.seasonalItem(L.genOrder(s, seq((k * 0.618) % 1, (k * 0.414) % 1, 0.3, 0.7)).id));
});

test('seasonal fish: 2–3 per season across spots, only in their season, with hints', () => {
  const sf = L.FISH.filter((f) => f.season && f.id !== 'snakehead' && !['island', 'offshore', 'ocean'].includes(f.spot));   // stage 7 섬 fish: stage7c.test.js
  for (const se of L.SEASONS) {
    const n = sf.filter((f) => f.season === se).length;
    assert.ok(n >= 2 && n <= 3, se + n);
  }
  assert.ok(sf.every((f) => f.hint));
  const s = L.newState(0, seq(0.5));
  s.rep = 99; s.coins = 1e5; L.buySpot(s, 'river'); L.buySpot(s, 'sea');
  const d = new Date(2026, 9, 27, 10, 0);
  const ids = (spot, season) => { s.spot = spot; return L.availableFish(d, s, { phase: 'day', weather: 'clear', season }).map((f) => f.id); };
  assert.ok(ids('pond', 'winter').includes('sleeper'));              // 얼음낚시
  assert.ok(!ids('pond', 'summer').includes('sleeper'));
  assert.ok(ids('pond', 'spring').includes('bitterling'));
  assert.ok(ids('river', 'winter').includes('lenok'));
  assert.ok(ids('sea', 'autumn').includes('gizzard'));
});

test('seasonal fish caught once (incl. 장마 가물치) never come back as a normal order out of season', () => {
  const s = L.newState(0, seq(0.5));
  s.rep = 99; s.coins = 1e5; L.buySpot(s, 'river'); L.buySpot(s, 'sea');
  const seasonal = L.FISH.filter((f) => f.season).map((f) => f.id);
  assert.ok(seasonal.includes('snakehead'));
  seasonal.forEach((id) => { s.dex.fish[id] = { n: 1, best: 10 }; });
  s.dex.fish.eel = { n: 1, best: 50 };                          // a caught conditional, non-seasonal fish still comes up
  const seen = new Set();
  for (let k = 0; k < 2000; k++) { const o = L.genOrder(s, seq((k * 0.618) % 1, (k * 0.414) % 1, 0.3, 0.7)); seen.add(o.id); }
  seasonal.forEach((id) => assert.ok(!seen.has(id), id));
  assert.ok(seen.has('eel'));
});

test('residents: every order has one; 친밀도 thresholds send letters and gifts once', () => {
  assert.ok(L.RESIDENTS.length >= 5 && L.RESIDENTS.length <= 6);
  const s = L.newState(0, seq(0.5));
  for (let k = 0; k < 200; k++) {
    const o = L.genOrder(s, seq((k * 0.618) % 1, (k * 0.414) % 1, 0.3, 0.7));
    assert.equal(L.residentFor(o), L.residentFor(Object.assign({}, o)));   // deterministic
    const it = L.itemInfo(o.id);
    assert.ok(L.residentById(L.residentFor(o)).kinds.includes(it.kind) || o.special);
  }
  assert.equal(L.residentFor({ id: 'carp', n: 1, reward: 900, rep: 3, special: true }), 'painter');
  // grandma likes crops: find a crop order she posts and deliver it again and again
  let o = null;
  for (let n = 1; n < 40 && !o; n++) { const c = { id: 'radish', n: n, reward: 30 * n * 2, rep: 1 }; if (L.residentFor(c) === 'grandma') o = c; }
  assert.ok(o);
  const coins0 = s.coins, levels = [];
  for (let k = 1; k <= L.FRIEND_LV[3] + 5; k++) {
    const r = L.befriend(s, o);
    assert.equal(r.who, 'grandma');
    r.ups.forEach((u) => levels.push([k, u.lv]));
  }
  assert.deepEqual(levels, L.FRIEND_LV.map((n, i) => [n, i + 1]));
  assert.equal(L.friendLevel(s, 'grandma'), 4);
  assert.deepEqual(s.res.unread, ['grandma:1', 'grandma:2', 'grandma:3', 'grandma:4']);
  assert.equal(s.res.rec.ssukjeon, true);                         // level 3: a recipe
  assert.equal(s.yard.furn.plant, true);                          // level 4: furniture
  assert.equal(s.coins, coins0 + 1500);
  assert.ok(L.resLetter('grandma', 2).includes('허수아비'));       // egg hint mixed in
  assert.equal(L.readResLetters(s, 'grandma'), 4);
  assert.deepEqual(s.res.unread, []);
  // a gift already owned turns into coins instead
  const t = L.newState(0, seq(0.5)); L.yardOf(t); t.yard.furn.radio = true;
  let fo = null;
  for (let n = 1; n < 60 && !fo; n++) { const c = { id: 'crucian', n: n, reward: 28 * n * 2, rep: 1 }; if (L.residentFor(c) === 'fisher') fo = c; }
  const c0 = t.coins;
  for (let k = 0; k < L.FRIEND_LV[2]; k++) L.befriend(t, fo);
  assert.equal(t.coins, c0 + L.furnById('radio').cost);
  // special orders count triple
  const u = L.newState(0, seq(0.5)), sp = { id: 'carp', n: 1, reward: 900, rep: 3, special: true };
  assert.equal(L.befriend(u, sp).pts, 3);
  assert.equal(L.befriend(u, sp).ups.length, 1);
});

test('gift recipes cook only after the resident teaches them; deliver() returns the friendship', () => {
  const s = L.newState(0, seq(0.5));
  ['ssuk', 'ssuk', 'potato'].forEach((id) => L.bagAdd(s, id, 50));
  assert.equal(L.canCook(s, 'ssukjeon'), false);
  assert.equal(L.obtainable(s, 'ssukjeon'), false);
  s.res = { f: {}, lv: {}, rec: { ssukjeon: true }, unread: [] };
  assert.equal(L.canCook(s, 'ssukjeon'), true);
  s.orders[0] = { o: { id: 'radish', n: 1, reward: 60, rep: 1 }, at: 0 };
  L.bagAdd(s, 'radish', 30);
  const r = L.deliver(s, 0, 0, seq(0.5));
  assert.equal(r.friend.who, L.residentFor({ id: 'radish', n: 1, reward: 60 }));
  assert.equal(L.friendPoints(s, r.friend.who), 1);
});

test('aquarium: fish move in and out, nothing is created, lost or sold', () => {
  const s = L.newState(0, seq(0.5));
  L.bagAdd(s, 'carp', 150); L.bagAdd(s, 'radish', 30); L.bagAdd(s, 'crucian', 25); L.bagAdd(s, 'minnow', 10);
  const all = () => s.bag.concat(L.tankList(s)).map((e) => e.id + e.v).sort();
  const before = all(), coins = s.coins;
  assert.equal(L.tankCap(s), 2);
  assert.equal(L.tankPut(s, 1), false);                            // a radish is not a fish
  assert.equal(L.tankPut(s, 0), true);
  assert.equal(L.tankPut(s, 1), true);                             // crucian (radish moved up to 0)
  assert.equal(L.tankPut(s, 1), false);                            // tank full (천막 = 2)
  assert.deepEqual(L.tankList(s).map((e) => e.id), ['carp', 'crucian']);
  assert.deepEqual(all(), before);
  assert.equal(L.sellAll(s), 40);                                  // tank fish are not sold
  assert.equal(L.tankList(s).length, 2);
  while (s.bag.length < L.bagCap(s)) L.bagAdd(s, 'radish', 30);
  assert.equal(L.tankTake(s, 0), false);                           // full basket: refused, nothing lost
  s.bag.pop();
  assert.equal(L.tankTake(s, 0), true);
  assert.equal(s.bag[s.bag.length - 1].id, 'carp');
  assert.equal(s.coins, coins + 40);
  L.yardOf(s).house = 3;
  assert.equal(L.tankCap(s), 8);
});

test('오늘의 할 일: 3 goals, same for the same date and state, only unlocked things, reward once', () => {
  const s = L.newState(0, seq(0.5));
  const a = L.dailyGoals('2026-10-28', s), b = L.dailyGoals('2026-10-28', JSON.parse(JSON.stringify(s)));
  assert.deepEqual(a, b);
  assert.equal(a.length, 3);
  const keys = new Set();
  for (let d = 1; d <= 28; d++) {
    const g = L.dailyGoals('2026-11-' + String(d).padStart(2, '0'), s);
    assert.equal(g.length, 3);
    assert.equal(new Set(g.map((x) => x.t)).size, 3);
    assert.ok(!(g.some((x) => x.t === 'harvest') && g.some((x) => x.t === 'crop')));
    for (const x of g) {
      assert.ok(!['spot', 'animal'].includes(x.t), x.t);            // fresh save: no river, no animals
      if (x.t === 'crop') assert.ok(L.seedUnlocked(s, x.x) && !L.CROPS[x.x].season);
      keys.add(JSON.stringify(g));
    }
  }
  assert.ok(keys.size > 10);
  // more unlocked → more kinds of goals appear over a month
  s.spotOk = { river: true }; L.yardOf(s); s.animals.hen = 1; s.seedOk.potato = true;
  const types = new Set();
  for (let d = 1; d <= 28; d++) L.dailyGoals('2026-12-' + String(d).padStart(2, '0'), s).forEach((x) => types.add(x.t));
  for (const t of ['spot', 'animal', 'cook']) assert.ok(types.has(t), t);
  assert.ok(L.dailyGoals('2026-12-01', s).every((x) => x.t !== 'spot' || x.x === 'river'));
  // progress from real events, reward once, a new day starts over
  const u = L.newState(0, seq(0.5));
  const day = L.ensureDaily(u, '2026-10-28');
  day.goals = [{ t: 'harvest', n: 1, p: 0 }, { t: 'fish', n: 1, p: 0 }, { t: 'order', n: 1, p: 0 }];
  assert.equal(L.claimDaily(u), null);
  u.plots[0] = Object.assign(plot(), { crop: 'radish', progress: L.CROPS.radish.grow, t: 0 });
  L.harvest(u, 0, 0, seq(0.9));
  L.landFish(u, { id: 'minnow', size: 10 });
  u.orders[0] = { o: { id: 'radish', n: 1, reward: 60, rep: 1 }, at: 0 };
  assert.equal(L.dailyDone(u), false);
  L.deliver(u, 0, 0, seq(0.5));
  assert.equal(L.dailyDone(u), true);
  const c0 = u.coins, f0 = u.items.fert;
  assert.deepEqual(L.claimDaily(u), { coins: 500, fert: 1 });
  assert.equal(u.coins, c0 + 500); assert.equal(u.items.fert, f0 + 1);
  assert.equal(L.claimDaily(u), null);
  assert.equal(L.ensureDaily(u, '2026-10-28'), day);
  assert.notEqual(L.ensureDaily(u, '2026-10-29').key, day.key);
  assert.equal(u.daily.paid, false);
});

test('농장 N년차: 1 year per 4 real weeks from s.born', () => {
  const s = L.newState(0, seq(0.5));
  L.ensureBorn(s, 1000);
  assert.equal(L.farmYear(s, 1000), 1);
  assert.equal(L.farmYear(s, 1000 + 28 * DAY - 1), 1);
  assert.equal(L.farmYear(s, 1000 + 28 * DAY), 2);
  assert.equal(L.farmYear(s, 1000 + 3 * 28 * DAY + 5), 4);
  L.ensureBorn(s, 99999);
  assert.equal(s.born, 1000);                                      // never moved once set
});

test('친구 기록 code: short, round-trips, checksum catches typos, garbage never decodes', () => {
  const s = stage3Save();
  s.born = 0; s.nick = '낚시왕 kim';
  const st = L.shareStats(s, 60 * DAY);
  assert.deepEqual(st, { nick: '낚시왕 kim', year: 3, fish: { id: 'crucian', size: 28.5 }, fdex: 1, cdex: 1, ddex: 1, rep: 14, cooked: 2, eggs: 1, house: 2 });
  const code = L.encodeShare(st);
  assert.ok(code.startsWith('FF1-'));
  assert.ok(code.length < 90, code);
  assert.deepEqual(L.decodeShare(code), st);
  assert.deepEqual(L.decodeShare('  ' + code.slice(0, 20) + '\n' + code.slice(20) + ' '), st);   // pasted with breaks
  assert.deepEqual(L.decodeShare(code.toLowerCase()), st);
  // no fish yet, no nickname
  const empty = L.shareStats(L.newState(0, seq(0.5)), 0);
  assert.deepEqual(L.decodeShare(L.encodeShare(empty)), empty);
  // one changed character fails the checksum
  for (let k = 4; k < code.length; k++) {
    if (code[k] === '-') continue;
    const bad = code.slice(0, k) + (code[k] === '1' ? '2' : '1') + code.slice(k + 1);
    assert.equal(L.decodeShare(bad), null, bad);
  }
  for (const g of [undefined, null, 42, {}, '', 'FF1', 'FF1-', 'hello', 'FF2' + code.slice(3), code + '-x', '<script>alert(1)</script>',
    'FF1-' + 'z'.repeat(500), code.replace(/-/g, '_'), JSON.stringify(s)]) assert.equal(L.decodeShare(g), null, String(g));
  // a forged code with a valid checksum still can't smuggle markup or huge numbers
  const forge = (fields) => { const body = 'FF1-' + fields.join('-'); return body + '-' + ('0000' + (L.strHash(body) % 1679616).toString(36)).slice(-4); };
  const lt = '<'.charCodeAt(0).toString(36).padStart(4, '0'), a = 'a'.charCodeAt(0).toString(36).padStart(4, '0');
  const sneaky = L.decodeShare(forge([lt + a + lt, '1', '', '0', '0', '0', '0', '0', '0', '0', '0']));
  assert.equal(sneaky.nick, 'a');
  assert.equal(L.decodeShare(forge(['', '1', '', '0', '0', '0', '0', 'zzzzzz', '0', '0', '0'])), null);
  assert.equal(L.decodeShare(forge(['', '0', '', '0', '0', '0', '0', '0', '0', '0', '0'])), null);
  assert.equal(L.cleanNick('  가나다라마바사아자차 '), '가나다라마바사아');
  assert.equal(L.cleanNick('a<b>"c\'&d'), 'abcd');
});
