// farm-fish/test/stage9c.test.js — stage 9 lane ③: 자전거 배달, 열기구, 겨울 썰매
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
const WEEK = 7 * 86400e3, MON0 = 4 * 86400e3, H = 3600e3;
const SPRING = MON0 + 100 * 4 * WEEK + H;               // a spring Monday, 01:00 UTC
const WINTER = SPRING + 3 * WEEK;                        // the winter week after it
const WFEST = WINTER + 2 * 86400e3 + 12 * H;             // its Wednesday noon: 눈사람 축제
// one perfect jump per obstacle, and a hop for every flower
const bikeTapsFor = (lay) => lay.map((e) => e.t - (e.kind === 'flower' ? 0.2 : L.BIKE_JUMP / 2));
// switch lanes just before each obstacle in the current lane, toward each flake
function sledTapsFor(lay) {
  const taps = []; let lane = 0;
  for (const e of lay) {
    const want = e.kind === 'flake' ? e.lane : 1 - e.lane;
    if (e.kind !== 'flake' && lane !== e.lane) continue;
    if (lane !== want) { taps.push(e.t - 0.3); lane = want; }
  }
  return taps;
}

// ---------- 자전거 ----------
test('bike: bought in the shop once; cost from the constant', () => {
  const s = fresh();
  assert.equal(L.bikeOk(s), false);
  s.coins = L.BIKE_COST - 1;
  assert.deepEqual(L.buyBike(s), { ok: false, why: 'coins' });
  s.coins = L.BIKE_COST;
  assert.deepEqual(L.buyBike(s), { ok: true });
  assert.equal(s.coins, 0); assert.ok(L.bikeOk(s));
  assert.deepEqual(L.buyBike(s), { ok: false, why: 'owned' });
});

test('bike layout: deterministic from rng, fits the ≤10s ride, gaps you can make', () => {
  assert.ok(L.BIKE_TIME <= 10);
  const a = L.bikeLayout(seq(0.1, 0.7, 0.4, 0.9, 0.2)), b = L.bikeLayout(seq(0.1, 0.7, 0.4, 0.9, 0.2));
  assert.deepEqual(a, b);
  for (let k = 0; k < 30; k++) {
    const lay = L.bikeLayout(seq(k / 30, (k * 7 % 30) / 30, 0.5));
    assert.ok(lay.length >= 4, 'something to do');
    lay.forEach((e, i) => {
      assert.ok(['bump', 'cat', 'flower'].includes(e.kind));
      assert.ok(e.t > 1 && e.t < L.BIKE_TIME - 0.3);
      if (i) assert.ok(e.t - lay[i - 1].t >= L.BIKE_GAP - 1e-9, 'gap');
    });
    assert.ok(lay.some((e) => e.kind !== 'flower'), 'at least one thing to hop');
  }
  for (const se of L.SEASONS) assert.ok(L.BIKE_ROAD[se] && L.BIKE_ROAD[se].bump && L.BIKE_ROAD[se].flower, se);
});

test('bike judging: no taps = crash at the first obstacle; good taps = clean + flowers', () => {
  const lay = L.bikeLayout(seq(0.3, 0.6, 0.1, 0.8));
  const first = lay.find((e) => e.kind !== 'flower');
  const none = L.bikeRun(lay, []);
  assert.equal(none.crash, true); assert.ok(Math.abs(none.at - first.t) < 0.2);
  assert.equal(none.flowers, 0);
  const good = L.bikeRun(lay, bikeTapsFor(lay));
  assert.equal(good.crash, false);
  assert.equal(good.flowers, lay.filter((e) => e.kind === 'flower').length);
  assert.equal(good.done, true);
  // judging so far: nothing is decided before it happens
  const part = L.bikeRun(lay, [], first.t - 0.5);
  assert.equal(part.crash, false); assert.equal(part.done, false);
  // a tap while in the air is not a second jump
  assert.deepEqual(L.bikeJumps([1, 1.1, 1.2, 3]), [1, 3]);
  assert.ok(L.bikeAir([1], 1 + L.BIKE_JUMP / 2)); assert.ok(!L.bikeAir([1], 1 + L.BIKE_JUMP + 0.01));
  // jumping way too early lands on it
  const one = [{ t: 3, kind: 'cat' }];
  assert.equal(L.bikeRun(one, [3 - L.BIKE_JUMP - 0.3]).crash, true);
  assert.equal(L.bikeRun(one, [3 - L.BIKE_JUMP / 2]).crash, false);
});

test('bike delivery: the order pays as always, a clean ride adds a tip, a crash never less', () => {
  const s = fresh();
  s.coins = L.BIKE_COST; L.buyBike(s);
  s.orders[0] = { o: { id: 'radish', n: 1, reward: 400, rep: 1 }, at: 0 };
  s.bag.push({ id: 'radish', v: 10 });
  const c0 = s.coins, r = L.deliver(s, 0, 1000, seq(0.5));
  assert.equal(s.coins, c0 + 400);
  const crash = L.bikeFinish(s, r.coins, { crash: true, flowers: 3 });
  assert.equal(crash.tip, 0); assert.equal(s.coins, c0 + 400, 'crash = plain delivery');
  const t1 = L.bikeFinish(s, 400, { crash: false, flowers: 0 });
  assert.equal(t1.tip, Math.round(400 * L.BIKE_TIP));
  const t2 = L.bikeFinish(s, 400, { crash: false, flowers: 99 });
  assert.equal(t2.tip, Math.round(400 * L.BIKE_TIP_MAX), 'tip is capped');
  assert.equal(s.coins, c0 + 400 + t1.tip + t2.tip);
  assert.equal(s.bike.runs, 3); assert.equal(s.bike.clean, 2); assert.equal(s.bike.best, 99);
  assert.ok(L.bikeTipFor(400, { crash: false, flowers: 1 }) > L.bikeTipFor(400, { crash: false, flowers: 0 }));
  assert.equal(L.bikeFinish(fresh(), 400, { crash: false, flowers: 0 }), null, 'no bike, no tip');
});

// ---------- 썰매 ----------
test('sled: only in game winter; village required', () => {
  assert.equal(L.sledSeason(SPRING, 0), false);
  assert.equal(L.sledSeason(WINTER, 0), true);
  const s = fresh();
  assert.equal(L.sledCan(s, WINTER, 0).why, 'village');
  s.rep = L.VILLAGE_REP;
  assert.equal(L.sledCan(s, SPRING, 0).why, 'season');
  assert.equal(L.sledCan(s, WINTER, 0).ok, true);
});

test('sled layout + judging: ≤20s, lanes, bumps cost time, flakes save it', () => {
  assert.ok(L.SLED_TIME <= 20 && L.SLED_MAX <= 20);
  const lay = L.sledLayout(seq(0.2, 0.8, 0.5, 0.35, 0.65), false);
  assert.deepEqual(lay, L.sledLayout(seq(0.2, 0.8, 0.5, 0.35, 0.65), false));
  const obs = lay.filter((e) => e.kind !== 'flake');
  assert.ok(obs.length >= 6);
  obs.forEach((e, i) => { assert.ok(e.lane === 0 || e.lane === 1); if (i) assert.ok(e.t - obs[i - 1].t >= L.SLED_GAP - 1e-9); });
  assert.ok(lay.every((e) => e.t > 0.8 && e.t < L.SLED_TIME));
  assert.ok(!lay.some((e) => e.kind === 'snowman'), 'snowmen only on festival day');
  assert.ok(L.sledLayout(seq(0.2, 0.8, 0.5), true).some((e) => e.kind === 'snowman'), 'festival course');
  assert.equal(L.sledLane([1, 2], 0.5), 0); assert.equal(L.sledLane([1, 2], 1.5), 1); assert.equal(L.sledLane([1, 2], 2.5), 0);
  const clean = L.sledRun(lay, sledTapsFor(lay));
  assert.equal(clean.bumps, 0); assert.ok(clean.flakes > 0);
  assert.ok(clean.time < L.SLED_TIME);
  const lazy = L.sledRun(lay, []);
  assert.ok(lazy.bumps > 0); assert.ok(lazy.time > clean.time);
  assert.ok(lazy.time <= L.SLED_MAX);
  assert.equal(L.sledRun(lay, [], 0.5).done, false);
});

test('sled records: a new best pays, a slower run pays nothing, festival doubles + one prize', () => {
  const s = fresh();
  const a = L.sledFinish(s, { time: 12.3 }, SPRING, null);
  assert.equal(a.best, true); assert.equal(a.coins, L.SLED_RECORD_COINS);
  assert.equal(L.sledBest(s), 12.3);
  const c0 = s.coins, b = L.sledFinish(s, { time: 13 }, SPRING, null);
  assert.equal(b.best, false); assert.equal(b.coins, 0); assert.equal(s.coins, c0);
  const fw = L.festivalAt(WFEST, 0);
  assert.equal(fw.id, 'winter');
  const c = L.sledFinish(s, { time: 13 }, WFEST, fw);
  assert.equal(c.fest, true); assert.equal(c.coins, L.SLED_FEST_COINS, 'festival prize once that day');
  const d = L.sledFinish(s, { time: 11 }, WFEST, fw);
  assert.equal(d.fest, false); assert.equal(d.best, true); assert.equal(d.coins, L.SLED_RECORD_COINS * L.SLED_FEST_MUL);
  assert.equal(s.sled.runs, 4);
});

// ---------- 열기구 ----------
test('balloon windows: a few a real day, deterministic, next window found', () => {
  let n = 0;
  for (let t = SPRING; t < SPRING + 86400e3; t += 60e3) { const w = L.balloonAt(t); if (w && w.start === t) n++; }
  assert.ok(n >= 3 && n <= 8, 'windows a day: ' + n);
  const w = L.balloonNext(SPRING);
  assert.ok(w.end > SPRING);
  assert.deepEqual(L.balloonAt(w.start), w);
  assert.deepEqual(L.balloonAt(w.end - 1), w);
  assert.notDeepEqual(L.balloonAt(w.start - 1), w);
  assert.ok(w.end - w.start === L.BALLOON_LEN);
});

test('balloon ride: village + window + fare, once per window', () => {
  const s = fresh(), w = L.balloonNext(SPRING), t = w.start + 1000;
  assert.equal(L.balloonCan(s, t).why, 'village');
  s.rep = L.VILLAGE_REP; s.coins = L.BALLOON_FARE - 1;
  assert.equal(L.balloonCan(s, t).why, 'coins');
  s.coins = L.BALLOON_FARE + 5;
  let off = w.end; while (L.balloonAt(off)) off += 60e3;
  assert.equal(L.balloonCan(s, off).ok, true, 'a missed balloon waits on the hill');
  assert.equal(L.balloonStart(s, t).ok, true);
  assert.equal(s.coins, 5);
  assert.equal(L.balloonCan(s, t + 1000).why, 'rode');
  assert.equal(L.balloonStart(s, t + 1000).ok, false);
});

test('sky sights: 10+ birds and cloud shapes; layout from env + rng; taps in the frame see them', () => {
  assert.ok(L.SIGHTS.length >= 10);
  assert.equal(new Set(L.SIGHTS.map((x) => x.id)).size, L.SIGHTS.length);
  assert.ok(L.SIGHTS.some((x) => x.kind === 'bird') && L.SIGHTS.some((x) => x.kind === 'cloud'));
  for (const x of L.SIGHTS) assert.ok(x.name && x.hint, x.id);
  assert.ok(L.BAL_TIME <= 20);
  const env = { season: 'autumn', phase: 'day', weather: 'clear' };
  const lay = L.balloonLayout(env, seq(0.1, 0.5, 0.9, 0.3));
  assert.deepEqual(lay, L.balloonLayout(env, seq(0.1, 0.5, 0.9, 0.3)));
  assert.ok(lay.length >= 4);
  lay.forEach((e, i) => {
    const d = L.sightById(e.id);
    assert.ok(L.sightOk(d, env), e.id);
    if (i) assert.ok(e.t - lay[i - 1].t >= L.BAL_GAP - 1e-9);
    assert.ok(e.t > 0 && e.t < L.BAL_TIME);
  });
  assert.equal(new Set(lay.map((e) => e.id)).size, lay.length, 'no repeats in one ride');
  // night: only what is out at night
  const night = L.balloonLayout({ season: 'summer', phase: 'night', weather: 'clear' }, seq(0.4, 0.2));
  night.forEach((e) => assert.ok(L.sightOk(L.sightById(e.id), { season: 'summer', phase: 'night', weather: 'clear' })));
  assert.ok(L.SIGHTS.some((x) => !L.sightOk(x, env)), 'some need a season/time/weather');
  assert.deepEqual(L.balloonJudge(lay, []), []);
  assert.deepEqual(L.balloonJudge(lay, lay.map((e) => e.t + 0.1)), lay.map((e) => e.id));
  assert.deepEqual(L.balloonJudge(lay, [lay[0].t + L.BAL_WIN + 0.3]), [], 'too late');
});

test('balloon finish: new sights pay once, all of them a big prize, 도감 counts', () => {
  const s = fresh();
  const a = L.balloonFinish(s, ['whale', 'sparrow']);
  assert.deepEqual(a.first, ['whale', 'sparrow']); assert.equal(a.coins, 2 * L.SIGHT_COINS);
  const b = L.balloonFinish(s, ['whale']);
  assert.deepEqual(b.first, []); assert.equal(b.coins, 0);
  assert.equal(s.bal.seen.whale, 2);
  assert.equal(L.sightCount(s), 2);
  const c = L.balloonFinish(s, L.SIGHTS.map((x) => x.id).concat(['nope']));
  assert.equal(c.all, true);
  assert.equal(c.coins, (L.SIGHTS.length - 2) * L.SIGHT_COINS + L.SIGHT_ALL_COINS);
  assert.equal(L.balloonFinish(s, L.SIGHTS.map((x) => x.id)).all, false, 'prize once');
});

test('camera: 2–3 balloon album slots that shotsNow returns in the sky', () => {
  for (const id of L.BAL_SHOTS) assert.ok(L.shotById(id), id);
  assert.ok(L.BAL_SHOTS.length >= 2 && L.BAL_SHOTS.length <= 3);
  assert.ok(L.shotsNow({ scene: 'balloon', vis: [] }).includes('balloon'));
  assert.ok(L.shotsNow({ scene: 'balloon', vis: [], sight: 'whale' }).includes('skywhale'));
  assert.ok(L.shotsNow({ scene: 'balloon', vis: [], sight: 'geese' }).includes('geese'));
  assert.ok(!L.shotsNow({ scene: 'farm', vis: [] }).includes('balloon'));
});

test('GUIDE has 자전거, 열기구, 썰매 with lock lines from the constants', () => {
  const s = fresh();
  for (const id of ['bike', 'balloon', 'sled']) {
    const g = L.guideById(id);
    assert.ok(g && g.how && g.lock, id);
    assert.equal(L.guideOpen(s, id), false, id);
  }
  assert.match(L.guideById('bike').lock, new RegExp(L.BIKE_COST.toLocaleString('en-US')));
  assert.match(L.guideById('balloon').lock, new RegExp('★' + L.VILLAGE_REP));
  s.coins = L.BIKE_COST; L.buyBike(s); s.rep = L.VILLAGE_REP;
  for (const id of ['bike', 'balloon', 'sled']) assert.equal(L.guideOpen(s, id), true, id);
});

test('save: s.bike, s.sled, s.bal round-trip; junk dropped; fresh has none', () => {
  const s = fresh();
  s.coins = L.BIKE_COST; L.buyBike(s);
  L.bikeFinish(s, 300, { crash: false, flowers: 2 });
  L.sledFinish(s, { time: 11.7 }, SPRING, null);
  s.rep = L.VILLAGE_REP; s.coins = 1000;
  const w = L.balloonNext(SPRING); L.balloonStart(s, w.start + 1);
  L.balloonFinish(s, ['whale', 'gull']);
  const t = L.decode(L.encode(s));
  assert.deepEqual(t.bike, s.bike); assert.deepEqual(t.sled, s.sled); assert.deepEqual(t.bal, s.bal);
  const raw = JSON.parse(L.encode(s));
  raw.bike = { own: true, runs: -3, clean: 'x', best: 2.5 };
  raw.sled = { best: 'fast', runs: 2, fest: 'no' };
  raw.bal = { rides: 1, last: 'x', seen: { whale: 3, nope: 2, gull: -1 }, all: 'yes' };
  const u = L.decode(JSON.stringify(raw));
  assert.deepEqual(u.bike, { own: true, runs: 0, clean: 0, best: 2 });
  assert.deepEqual(u.sled, { best: 0, runs: 2, fest: 0 });
  assert.deepEqual(u.bal, { rides: 1, last: 0, seen: { whale: 3 }, all: false });
  raw.bike = { own: false }; raw.sled = 5; raw.bal = [1];
  const v = L.decode(JSON.stringify(raw));
  assert.equal(v.bike, undefined); assert.equal(v.sled, undefined); assert.equal(v.bal, undefined);
  const f = L.decode(L.encode(fresh()));
  assert.equal(f.bike, undefined); assert.equal(f.sled, undefined); assert.equal(f.bal, undefined);
});

test('old fixtures load unchanged without s.bike / s.sled / s.bal', () => {
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    if (/"(bike|sled|bal)":/.test(raw)) continue;   // saved by stage 9 ③+
    const s = L.decode(raw);
    assert.ok(s, f);
    assert.equal(s.bike, undefined, f); assert.equal(s.sled, undefined, f); assert.equal(s.bal, undefined, f);
    const again = L.decode(L.encode(s));
    assert.deepEqual(JSON.parse(L.encode(again)), JSON.parse(L.encode(s)), f);
  }
});

test('balloon: one tap per sight catches all; tapping nonstop does not', () => {
  const lay = [{ t: 2, id: 'a' }, { t: 4.6, id: 'b' }, { t: 7.2, id: 'c' }, { t: 9.8, id: 'd' }, { t: 12.4, id: 'e' }];
  assert.deepEqual(L.balloonJudge(lay, lay.map(e => e.t + 0.2)), ['a', 'b', 'c', 'd', 'e']);
  const spam = []; for (let t = 0; t < 16; t += 0.3) spam.push(+t.toFixed(2));
  assert.ok(L.balloonJudge(lay, spam).length < lay.length);
});

test('a missed balloon waits on the hill until ridden (only one waits)', () => {
  const s = L.newState(0, () => 0); s.rep = 99; s.coins = 1e5;
  const w1 = L.balloonNext(0); assert.ok(w1);
  const later = L.balloonNext(w1.end); const t = later.start - 1;   // between two windows, after missing w1
  assert.equal(L.balloonAt(t), null);
  assert.deepEqual(L.balloonFor(s, t), w1);
  assert.ok(L.balloonStart(s, t).ok);
  assert.equal(L.balloonFor(s, t), null, 'ridden: nothing waits');
  assert.equal(L.balloonCan(s, t).ok, false);
  assert.deepEqual(L.balloonFor(s, later.start + 1), later, 'the next one comes as usual');
});
