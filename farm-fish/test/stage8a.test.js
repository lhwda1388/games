// farm-fish/test/stage8a.test.js — stage 8 ①: 입질 폭풍 / 대풍년, 오늘의 날, 자리 비운 사이 일기
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
const DAY = 86400e3, T0 = Date.UTC(2026, 9, 26, 0, 0);   // a Monday

// ---------- 입질 폭풍 / 대풍년 ----------
function windows(from, days) {
  const out = [];
  let t = from;
  while (t < from + days * DAY) { const w = L.boomNext(t); if (!w || w.start >= from + days * DAY) break; out.push(w); t = w.end; }
  return out;
}

test('booms: a few a day, 3–5 minutes, deterministic, both kinds', () => {
  const ws = windows(T0, 28);
  const perDay = ws.length / 28;
  assert.ok(perDay >= 2 && perDay <= 8, 'per day ' + perDay);
  const kinds = new Set(ws.map((w) => w.kind));
  assert.deepEqual([...kinds].sort(), ['harvest', 'storm']);
  for (const w of ws) {
    const len = w.end - w.start;
    assert.ok(len >= 3 * 60e3 && len <= 5 * 60e3, 'length ' + len);
    assert.deepEqual(L.boomAt(w.start + 1000), L.boomAt(w.start + 1000), 'same time, same answer');
    assert.equal(L.boomAt(w.start + 1000).kind, w.kind);
    assert.equal(L.boomAt(w.end), null, 'over at end');
    assert.equal(L.boomAt(w.start - 1), null, 'not before start');
  }
  // seeded variety: start times are not on a fixed grid
  const mins = new Set(ws.map((w) => Math.floor((w.start % 3600e3) / 60e3)));
  assert.ok(mins.size > 10, 'starts vary');
});

test('boomFor picks only places the player has open', () => {
  const s = fresh();
  for (const w of windows(T0, 7)) {
    const b = L.boomFor(s, w.start + 1000);
    assert.ok(b, 'a fresh farm always has 연못 and 밭');
    assert.equal(b.place, w.kind === 'storm' ? 'pond' : 'farm');
  }
  s.rep = 999; s.coins = 1e7; L.buySpot(s, 'river'); L.buySpot(s, 'sea');
  const places = new Set(windows(T0, 14).filter((w) => w.kind === 'storm').map((w) => L.boomFor(s, w.start + 1000).place));
  assert.ok(places.has('river') && places.has('sea') && places.has('pond'), [...places].join());
  assert.ok(!places.has('island'), 'island closed');
});

test('입질 폭풍 raises rare+ odds and shortens the wait only at its spot', () => {
  const s = fresh();
  const pool = L.FISH.filter((f) => (f.spot || 'pond') === 'pond' && !f.window && !f.unlock && !f.fest && !f.egg);
  const storm = { boom: { kind: 'storm', place: 'pond', start: 0, end: 1e9 } };
  const elsewhere = { boom: { kind: 'storm', place: 'sea', start: 0, end: 1e9 } };
  const base = L.fishWeights(pool, s), up = L.fishWeights(pool, s, storm), other = L.fishWeights(pool, s, elsewhere);
  pool.forEach((f, k) => {
    if (f.rarity === '흔함') assert.equal(up[k], base[k], f.id);
    else assert.equal(up[k], base[k] * L.BOOM_RARE_MUL, f.id);
    assert.equal(other[k], base[k], 'other spot unchanged');
  });
  const w0 = L.waitMs(s, () => 0.5), w1 = L.waitMs(s, () => 0.5, storm);
  assert.equal(w1, Math.round(w0 * L.BOOM_WAIT_MUL));
  assert.ok(L.cast(s, 0, () => 0.5, 10, 10, storm));
  assert.equal(s.fish.biteAt, w1);
});

test('대풍년 gives extra at its place; nothing is ever taken away', () => {
  const s = fresh(), w = windows(T0, 7).find((x) => x.kind === 'harvest'), t = w.start + 1000;
  assert.equal(L.boomFor(s, t).place, 'farm');
  s.plots[0].crop = 'radish'; s.plots[0].progress = L.CROPS.radish.grow; s.plots[0].t = t;
  const n0 = s.bag.length, r = L.harvest(s, 0, t, () => 0.99);
  assert.equal(r.boom, L.BOOM_FARM_EXTRA);
  assert.equal(s.bag.length - n0, 1 + L.BOOM_FARM_EXTRA);
  // outside any boom: plain harvest
  const quiet = (() => { for (let x = T0; ; x += 60e3) if (!L.boomAt(x)) return x; })();
  s.plots[1].crop = 'radish'; s.plots[1].progress = L.CROPS.radish.grow; s.plots[1].t = quiet;
  const n1 = s.bag.length, r2 = L.harvest(s, 1, quiet, () => 0.99);
  assert.ok(!r2.boom); assert.equal(s.bag.length - n1, 1);
  assert.equal(L.boomExtra(s, 'farm', quiet, 4), 0);
  assert.equal(L.boomExtra(s, 'orchard', t, 4), 0, 'not the boom place');
});

test('boomForce (test hook) overrides the schedule and expires', () => {
  const s = fresh();
  L.boomForce({ kind: 'harvest', place: 'farm', start: 0, end: 1000 });
  assert.equal(L.boomFor(s, 500).kind, 'harvest');
  assert.equal(L.boomExtra(s, 'farm', 500, 4), L.BOOM_FARM_EXTRA);
  assert.equal(L.boomFor(s, 2000) && L.boomFor(s, 2000).start, L.boomAt(2000) ? L.boomAt(2000).start : null);
  L.boomForce(null);
});

// ---------- 오늘의 날 ----------
const key = (t) => new Date(t).toISOString().slice(0, 10);

test('오늘의 날: 10+ modifiers, the same each time for a date key, every one shows up', () => {
  assert.ok(L.DAYS.length >= 10);
  const ids = new Set(L.DAYS.map((d) => d.id));
  assert.equal(ids.size, L.DAYS.length);
  L.DAYS.forEach((d) => assert.ok(d.name && d.desc, d.id));
  assert.equal(L.dayMod('2026-10-29').id, L.dayMod('2026-10-29').id);
  const seen = new Set();
  for (let k = 0; k < 60; k++) seen.add(L.dayMod(key(T0 + k * DAY)).id);
  assert.equal(seen.size, L.DAYS.length, 'all appear within two months');
  assert.ok(L.dayMod('nonsense'), 'bad keys still give a day');
});

test('ensureDay: true once per new key (card shows once), dayIs follows the key', () => {
  const s = fresh();
  assert.equal(s.day, undefined);
  assert.equal(L.ensureDay(s, '2026-10-29'), true);
  assert.equal(L.ensureDay(s, '2026-10-29'), false);
  assert.equal(L.dayId(s), L.dayMod('2026-10-29').id);
  assert.ok(L.dayIs(s, L.dayId(s)));
  assert.equal(L.ensureDay(s, '2026-10-30'), true);
  assert.equal(L.dayId(fresh()), null);
});

function withDay(id) { const s = fresh(); L.ensureDay(s, '2026-10-29'); s.day.f = id; return s; }

test('day effects plug into the real rules (never a penalty)', () => {
  // 큰 물고기의 날: same rng → bigger fish
  const d = new Date(T0), env = L.fishEnv(T0, 0, 'clear');
  const a = L.rollFish(d, seq(0.1, 0.3), fresh(), env), b = L.rollFish(d, seq(0.1, 0.3), withDay('bigfish'), env);
  assert.equal(a.id, b.id); assert.ok(b.size > a.size);
  // 입질 좋은 날
  assert.ok(L.waitMs(withDay('bite'), () => 0.5) < L.waitMs(fresh(), () => 0.5));
  // 안개 낚시의 날 / 빗소리의 날: fog / rain fish in any weather
  const fogFish = L.FISH.find((f) => f.weather === 'fog' && !f.phase && !f.season);
  const rainFish = L.FISH.find((f) => f.weather === 'rain' && !f.phase && !f.season);
  assert.equal(L.fishEnvOk(fogFish, env), false);
  assert.equal(L.fishEnvOk(fogFish, Object.assign({}, env, { day: 'fogfish' })), true);
  assert.equal(L.fishEnvOk(rainFish, Object.assign({}, env, { day: 'rainfish' })), true);
  assert.equal(L.fishEnvOk(rainFish, Object.assign({}, env, { day: 'fogfish' })), false);
  // 단골 손님의 날: orders pay more
  const pay = (s) => { s.bag = []; L.bagAdd(s, 'radish', 10); s.orders[0] = { o: { id: 'radish', n: 1, reward: 100, rep: 1 }, at: 0 }; return L.deliver(s, 0, 0, () => 0.5).coins; };
  assert.equal(pay(fresh()), 100);
  assert.equal(pay(withDay('orders')), Math.round(100 * L.DAY_ORDER_MUL));
  // 장날: the day's item is worth double when harvested / landed
  const m = withDay('market'), item = L.marketItem(m.day.key);
  assert.ok(L.itemInfo(item), item);
  assert.equal(L.marketMul(m, item), 2); assert.equal(L.marketMul(m, 'nosuch'), 1); assert.equal(L.marketMul(fresh(), item), 1);
  // 반려동물 신난 날
  const p = withDay('pet'); L.adoptPet(p, 'dog', '', 0);
  const q = fresh(); L.adoptPet(q, 'dog', '', 0);
  assert.equal(L.petGiftCap(p), L.petGiftCap(q) + 1);
  // 채집 운 좋은 날: rare forage weighs more, common the same
  const rare = L.FORAGE.find((f) => f.rarity !== '흔함' && !f.season && !f.phase && !f.wet);
  const com = L.FORAGE.find((f) => f.rarity === '흔함' && !f.season && !f.phase && !f.wet);
  const fe = { season: 'spring', phase: 'day', wet: false };
  assert.ok(L.forageWeight(rare, fe, withDay('forage')) > L.forageWeight(rare, fe, fresh()));
  assert.equal(L.forageWeight(com, fe, withDay('forage')), L.forageWeight(com, fe, fresh()));
  // every modifier has a hook somewhere: the table names it
  L.DAYS.forEach((dd) => assert.ok(dd.how, dd.id));
});

test('오늘의 날 save: key kept, test override dropped, junk ignored', () => {
  const s = fresh(); L.ensureDay(s, '2026-10-29'); s.day.f = 'pet';
  const d = L.decode(L.encode(s));
  assert.deepEqual(d.day, { key: '2026-10-29' });
  const bad = JSON.parse(L.encode(fresh())); bad.day = { key: 'drop table' };
  assert.equal(L.decode(JSON.stringify(bad)).day, undefined);
});

// ---------- 자리 비운 사이 일기 ----------
test('diary: nothing under 30 minutes away', () => {
  const s = fresh(), a = L.diarySnap(s, 0, 0);
  assert.equal(L.diaryMake(s, a, a, { from: 0, to: 29 * 60e3, tzMin: 0 }), null);
  assert.equal(s.diary, undefined);
});

test('diary: 3–5 short lines from what catch-up actually changed', () => {
  const s = fresh(), from = T0, to = T0 + 3 * 3600e3 + 20 * 60e3;
  s.plots[0].crop = 'radish'; s.plots[0].progress = 0; s.plots[0].t = from;
  s.plots[1].crop = 'radish'; s.plots[1].progress = 0; s.plots[1].t = from;
  const a = L.diarySnap(s, from, 0);
  L.advance(s, to, 0);   // the same catch-up the first tick runs
  const b = L.diarySnap(s, to, 0);
  assert.equal(b.ready - a.ready, 2);
  const e = L.diaryMake(s, a, b, { from: from, to: to, tzMin: 0 });
  assert.ok(e.lines.length >= 3 && e.lines.length <= 5, e.lines.join('/'));
  assert.match(e.lines[0], /3시간 20분/);
  assert.ok(e.lines.some((l) => /작물 2개/.test(l)), e.lines.join('/'));
  e.lines.forEach((l) => assert.ok(l.length <= 40, l));
  assert.equal(s.diary.length, 1);
});

test('diary: a quiet absence still gets 3 lines; numbers never invented', () => {
  const s = fresh(), a = L.diarySnap(s, T0, 0);
  const e = L.diaryMake(s, a, a, { from: T0, to: T0 + 40 * 60e3, tzMin: 0 });
  assert.equal(e.lines.length, 3);
  assert.ok(!e.lines.some((l) => /작물|산물|열매|꿀|손님/.test(l)), e.lines.join('/'));
});

test('diary: animals, visitors, coins and the pet show up when they changed', () => {
  const s = fresh(), a = L.diarySnap(s, T0, 0);
  const b = Object.assign({}, a, { prod: a.prod + 3, met: a.met + 1, coins: a.coins + 250, honey: a.honey + 2 });
  const e = L.diaryMake(s, a, b, { from: T0, to: T0 + 5 * 3600e3, tzMin: 0, pet: '바둑이', petGift: true });
  const all = e.lines.join('/');
  assert.ok(e.lines.length <= 5);
  assert.match(all, /산물 3개/);
  assert.ok(/손님 1|꿀 2병|250코인|바둑이/.test(all), all);
});

test('diary keeps the last 7 and survives a save round trip', () => {
  const s = fresh(), a = L.diarySnap(s, 0, 0);
  for (let k = 0; k < 9; k++) L.diaryMake(s, a, a, { from: k * DAY, to: k * DAY + 3600e3, tzMin: 0 });
  assert.equal(s.diary.length, L.DIARY_KEEP);
  assert.equal(s.diary[0].t, 2 * DAY + 3600e3);
  const d = L.decode(L.encode(s));
  assert.deepEqual(d.diary, s.diary);
  const bad = JSON.parse(L.encode(fresh())); bad.diary = [{ t: 1, lines: [5, '<b>'] }, 'x'];
  const dd = L.decode(JSON.stringify(bad));
  assert.ok(!dd.diary || dd.diary.every((e) => e.lines.every((l) => typeof l === 'string')));
});

// ---------- 놀거리 수첩 + old saves ----------
test('GUIDE has a line for each stage-8 ① feature, numbers from constants', () => {
  const by = (id) => L.GUIDE.find((g) => g.id === id);
  for (const id of ['boom', 'today', 'diary']) { assert.ok(by(id), id); assert.ok(L.guideOpen(fresh(), id), id + ' open from the start'); }
  assert.match(by('boom').how, new RegExp(String(L.BOOM_MIN / 60e3)));
  assert.match(by('today').how, new RegExp(String(L.DAYS.length)));
  assert.match(by('diary').how, new RegExp(String(L.DIARY_AWAY / 60e3)));
  assert.match(by('diary').how, new RegExp(String(L.DIARY_KEEP)));
});

test('older saves (every fixture) load unchanged without day/diary', () => {
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    const s = L.decode(raw);
    assert.ok(s, f);
    if (/"(day|diary)":/.test(raw)) continue;   // saved by stage 8+
    assert.equal(s.day, undefined, f); assert.equal(s.diary, undefined, f);
    assert.equal(L.dayId(s), null, f);
    const d = L.decode(L.encode(s));
    assert.equal(d.day, undefined, f); assert.equal(d.diary, undefined, f);
  }
});

test('a scare during an 입질 폭풍 keeps the faster bites', () => {
  const s = L.newState(0, () => 0.5), env = { boom: { kind: 'storm', place: L.curSpot(s) } };
  s.fish = { phase: 'wait', biteAt: 1e9, nibAt: 1e9, nibEnd: 0 };
  L.strike(s, 0, () => 0.5, env); const storm = s.fish.biteAt;
  s.fish = { phase: 'wait', biteAt: 1e9, nibAt: 1e9, nibEnd: 0 };
  L.strike(s, 0, () => 0.5); const calm = s.fish.biteAt;
  assert.equal(storm, Math.round(calm * L.BOOM_WAIT_MUL));
});
