// farm-fish/test/spots.test.js — stage 2: fishing spots, time of day, weather, new fish, new milestones
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

function loadLogic() {
  const html = require('../build.js').build();
  const m = html.match(/<script id="logic">([\s\S]*?)<\/script>/);
  if (!m) throw new Error('logic block not found');
  vm.runInThisContext(m[1], { filename: 'logic.js' });
  return globalThis.Logic;
}
const L = loadLogic();
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const MIN = 60e3;

test('spots: 강 needs ★5 + 1000, 바다 ★40 + 30000; ★ is kept, coins are paid once', () => {
  const s = L.newState(0, seq(0.5));
  s.coins = 10000;
  assert.equal(L.curSpot(s), 'pond');
  assert.equal(L.spotStatus(s, 'river'), 'rep');
  assert.equal(L.buySpot(s, 'river'), false);
  assert.equal(L.setSpot(s, 'river'), false);
  s.rep = 5; s.coins = 999;
  assert.equal(L.spotStatus(s, 'river'), 'coins');
  s.coins = 1000;
  assert.equal(L.buySpot(s, 'river'), true);
  assert.equal(s.coins, 0); assert.equal(s.rep, 5);
  assert.equal(L.spotStatus(s, 'river'), 'owned');
  assert.equal(L.buySpot(s, 'river'), false);
  s.coins = 31000;
  assert.equal(L.spotStatus(s, 'sea'), 'rep');
  s.rep = 40;
  assert.equal(L.buySpot(s, 'sea'), true);
  assert.equal(s.coins, 1000);
  // switching takes the line in, but never while a fish is on
  L.cast(s, 0, seq(0), 100, 150);
  assert.equal(L.setSpot(s, 'sea'), true);
  assert.equal(s.fish.phase, 'idle');
  assert.equal(L.curSpot(s), 'sea');
  s.fish = { phase: 'bite', x: 1, y: 1, biteAt: 0, biteEnd: 9, roll: { id: 'mackerel', size: 30 } };
  assert.equal(L.setSpot(s, 'pond'), false);
});

test('fish table: 30 species + 12 seasonal, original 7 unchanged, 강·바다 each 9–12 year-round', () => {
  // stage 7's 섬 fish (spot 'island') are counted in stage7c.test.js
  assert.equal(L.FISH.filter((f) => !f.egg && !f.fest && !['island', 'offshore', 'ocean', 'valley', 'onsen', 'snow'].includes(f.spot)).length, 42);   // + stage 3's 시계 물고기 (egg); stage 4 adds 12 seasonal; stage 5B festival fish (fest) apart
  assert.deepEqual(L.FISH.slice(0, 7).map((f) => f.id), ['minnow', 'crucian', 'catfish', 'carp', 'lunch', 'tuna', 'koi']);
  assert.ok(L.FISH.slice(0, 7).every((f) => !f.spot && !f.phase && !f.weather && !f.season));
  const by = (sp) => L.FISH.filter((f) => f.spot === sp && (!f.season || f.id === 'snakehead'));
  assert.ok(by('river').length >= 9 && by('river').length <= 12);
  assert.ok(by('sea').length >= 9 && by('sea').length <= 12);
  assert.equal(new Set(L.FISH.filter((f) => !f.egg && !f.fest && !['island', 'offshore', 'ocean', 'valley', 'onsen', 'snow'].includes(f.spot)).map((f) => f.id)).size, 42);
  assert.ok(L.FISH.filter((f) => f.weather === 'rain').length >= 3);
  assert.ok(L.FISH.filter((f) => f.weather === 'fog').length >= 2);
  assert.ok(L.FISH.filter((f) => f.weather === 'snow').length >= 2);
  assert.ok(L.FISH.filter((f) => f.phase).length >= 4);
  assert.ok(L.FISH.filter((f) => f.spot && f.rarity === '전설').every((f) => f.power >= 2));
  // every new fish has a hint for the 도감/달력 ??? row
  assert.ok(L.FISH.filter((f) => f.spot).every((f) => typeof f.hint === 'string' && f.hint.length > 0));
});

test('fish pools follow spot, game-clock phase, weather and season', () => {
  const d = new Date(2026, 9, 27, 10, 0);            // not lunch, not friday
  const s = L.newState(0, seq(0.5));
  s.rep = 99; s.coins = 99999; L.buySpot(s, 'river'); L.buySpot(s, 'sea');
  const ids = (spot, env) => { s.spot = spot; return L.availableFish(d, s, env).map((f) => f.id).sort(); };
  const env = (phase, weather, season) => ({ phase, weather, season: season || 'autumn' });
  assert.deepEqual(ids('pond', env('day', 'clear')), ['bluegill', 'carp', 'catfish', 'crucian', 'minnow']);   // + 가을 블루길
  assert.deepEqual(ids('river', env('day', 'clear')), ['chub', 'dace', 'mandarin']);
  assert.ok(ids('river', env('morning', 'clear')).includes('trout'));
  assert.ok(ids('river', env('night', 'clear')).includes('eel'));
  assert.ok(!ids('river', env('night', 'clear')).includes('trout'));
  const rain = ids('river', env('day', 'rain'));
  assert.ok(rain.includes('loach') && rain.includes('salmon') && !rain.includes('snakehead'));
  assert.ok(ids('river', env('day', 'rain', 'summer')).includes('snakehead'));     // 장마
  assert.ok(ids('river', env('day', 'snow', 'winter')).includes('smelt'));
  assert.ok(ids('river', env('day', 'fog')).includes('sturgeon'));
  assert.ok(ids('sea', env('evening', 'clear')).includes('hairtail'));
  assert.ok(ids('sea', env('night', 'clear')).includes('hairtail'));
  assert.ok(ids('sea', env('day', 'clear')).includes('swordfish'));
  assert.ok(ids('sea', env('day', 'fog')).includes('ghostray'));
  assert.ok(ids('sea', env('day', 'snow', 'winter')).includes('cod'));
  // never empty, and pond fish never leak to other spots
  for (const sp of ['pond', 'river', 'sea']) for (const ph of ['morning', 'day', 'evening', 'night'])
    for (const w of ['clear', 'rain', 'fog', 'snow']) {
      const got = ids(sp, env(ph, w));
      assert.ok(got.length >= 2, sp + ph + w);
      assert.ok(got.every((id) => (L.fishById(id).spot || 'pond') === sp));
    }
  // a season-only fish never shows in the other seasons
  for (const se of ['spring', 'autumn', 'winter']) assert.ok(!ids('river', env('day', 'rain', se)).includes('snakehead'));
  // a locked spot falls back to the pond
  const t = L.newState(0, seq(0.5)); t.spot = 'sea';
  assert.equal(L.curSpot(t), 'pond');
  assert.ok(L.availableFish(d, t, env('day', 'clear')).every((f) => !f.spot));
  // rollFish uses the env passed through updateFishing
  s.spot = 'river';
  L.cast(s, 0, seq(0), 100, 150);
  assert.equal(L.updateFishing(s, s.fish.biteAt, seq(0.999, 0.5), 1, env('night', 'fog')), 'bite');
  assert.equal(L.fishById(s.fish.roll.id).spot, 'river');
  // fishEnv reads the shared clock and weather; an override replaces only the weather
  const e = L.fishEnv(Date.UTC(2026, 9, 26, 0, 50), 0, 'fog');
  assert.deepEqual([e.phase, e.weather], ['night', 'fog']);
});

test('rain makes crops grow 10% faster, consistently online or offline (snow does not)', () => {
  const B = L.WEATHER_MS;
  let rainB = -1, clearB = -1;
  for (let k = 1000; k < 3000 && (rainB < 0 || clearB < 0); k++) {
    const w = L.weatherAt(k * B, 0);
    if (w === 'rain' && rainB < 0) rainB = k;
    if (w === 'clear' && clearB < 0) clearB = k;
  }
  const grow = (b0, steps) => {
    const s = L.newState(0, seq(0.5));
    s.coins = 1000;
    L.plant(s, 0, 'melon', b0 * B);
    for (let i = 1; i <= steps; i++) L.advance(s, b0 * B + (20 * MIN) * i / steps, 0);
    return s.plots[0].progress;
  };
  assert.equal(grow(clearB, 1), 20 * MIN);
  assert.ok(Math.abs(grow(rainB, 1) - 20 * MIN * 1.1) < 1e-6);
  assert.ok(Math.abs(grow(rainB, 240) - 20 * MIN * 1.1) < 1);        // ticking every 5 s gives the same
  assert.equal(L.rainMs(rainB * B - 10e3, rainB * B + 10e3, 0), L.weatherAt((rainB - 1) * B, 0) === 'rain' ? 20e3 : 10e3);
  // snow blocks never count as rain
  let snow = 0;
  for (let k = 0; k < 4000 && !snow; k++) if (L.weatherAt(k * B, 0) === 'snow') { snow = 1; assert.equal(L.rainMs(k * B, (k + 1) * B, 0), 0); }
  assert.equal(snow, 1);
  // a long absence finishes the crop without walking every block
  const s = L.newState(0, seq(0.5)); s.coins = 1000; L.plant(s, 0, 'radish', 0);
  L.advance(s, 365 * 86400e3, 0);
  assert.equal(L.isReady(s.plots[0]), true);
});

test('new 도감 milestones at 20 and 30 fish species; boat still the original 11', () => {
  const s = L.newState(0, seq(0.5));
  const give = (n) => L.FISH.slice(0, n).forEach((f) => { s.dex.fish[f.id] = { n: 1, best: f.min }; });
  give(19);
  s.ms = { cat: true, lantern: true, koi: true, boat: true };
  assert.deepEqual(L.checkMilestones(s), []);
  give(20);
  assert.equal(L.fishDexCount(s), 20);
  assert.deepEqual(L.checkMilestones(s), ['fish20']);
  give(30);
  assert.deepEqual(L.checkMilestones(s), ['fish30']);
  assert.equal(L.DEX_TOTAL, 11);
  // 20 crops+fish is not 20 fish
  const t = L.newState(0, seq(0.5));
  Object.keys(L.CROPS).forEach((k) => { t.dex.crops[k] = 1; });
  L.FISH.slice(0, 11).forEach((f) => { t.dex.fish[f.id] = { n: 1, best: f.min }; });
  assert.ok(!L.checkMilestones(t).includes('fish20'));
  const back = L.decode(L.encode(s));
  assert.equal(back.ms.fish20, true); assert.equal(back.ms.fish30, true);
});

test('orders only ask for fish from bought spots; conditional fish once caught', () => {
  const rngs = (k) => seq((k * 0.6180339) % 1, (k * 0.4142) % 1, (k * 0.7320508) % 1, (k * 0.2360679) % 1);
  const s = L.newState(0, seq(0.5));
  // normal orders; specials may ask for any rarer fish of a bought spot (hard but well paid)
  const seen = () => { const out = new Set(); for (let k = 0; k < 600; k++) { const o = L.genOrder(s, rngs(k)); if (!o.special) out.add(o.id); } return out; };
  assert.ok([...seen()].every((id) => !(L.fishById(id) && L.fishById(id).spot)));
  for (let k = 0; k < 200; k++) { const o = L.genOrder(s, seq(0.01, (k * 0.37) % 1, 0.5, 0.5)); assert.ok(!L.fishById(o.id).spot, o.id); }
  assert.equal(L.obtainable(s, 'mackerel'), false);
  s.rep = 5; s.coins = 1000; L.buySpot(s, 'river');
  const r = seen();
  assert.ok(r.has('dace') && r.has('chub'));
  assert.ok(!r.has('loach') && !r.has('eel') && ![...r].some((id) => L.fishById(id) && L.fishById(id).spot === 'sea'));
  assert.equal(L.obtainable(s, 'eel'), true);
  s.dex.fish.eel = { n: 1, best: 50 };
  assert.ok(seen().has('eel'));
});

test('orders skip fish whose weather the season never has (빙어 only in winter, rain fish not in winter); posted orders stay', () => {
  const rngs = (k) => seq((k * 0.6180339) % 1, (k * 0.4142) % 1, (k * 0.7320508) % 1, (k * 0.2360679) % 1);
  const s = L.newState(0, seq(0.5));
  s.spotOk = { river: true, sea: true };
  for (const id of ['smelt', 'loach', 'salmon', 'bass', 'cod', 'octopus']) s.dex.fish[id] = { n: 1, best: L.fishById(id).min };
  const seen = (season) => { const out = new Set(); for (let k = 0; k < 3000; k++) out.add(L.genOrder(s, rngs(k), season).id); return out; };
  const snow = ['smelt', 'cod'], rain = ['loach', 'salmon', 'octopus'];
  for (const season of L.SEASONS) {
    const r = seen(season);
    for (const id of snow) assert.equal(r.has(id), season === 'winter', season + ' ' + id);
    for (const id of rain) assert.equal(r.has(id), season !== 'winter', season + ' ' + id);
    assert.ok(r.has('bass'), season + ' bass');   // fog comes in every season
  }
  assert.equal(L.weatherInSeason(L.fishById('smelt'), 'summer'), false);
  assert.equal(L.weatherInSeason(L.fishById('smelt'), undefined), true);   // no season given: as before
  // refreshOrders reads the season from the clock; an order already on the board is left alone
  const at = (season) => { for (let t = 0; ; t += 86400e3) if (L.gameClock(t, 0).season === season) return t; };
  const summer = at('summer'), winter = at('winter');
  s.orders = [{ o: { id: 'smelt', n: 1, reward: 300, rep: 1 }, at: 0 }, { o: null, at: 0 }, { o: null, at: 0 }];
  const got = new Set();
  for (let k = 0; k < 1500; k++) { s.orders[1] = { o: null, at: 0 }; L.refreshOrders(s, summer, rngs(k), 0); got.add(s.orders[1].o.id); }
  assert.equal(s.orders[0].o.id, 'smelt');
  assert.ok(!got.has('smelt') && !got.has('cod') && got.has('loach'));
  got.clear();
  for (let k = 0; k < 1500; k++) { s.orders[1] = { o: null, at: 0 }; L.refreshOrders(s, winter, rngs(k), 0); got.add(s.orders[1].o.id); }
  assert.ok(got.has('cod') && !got.has('loach') && !got.has('salmon'));   // (빙어 is already on the board)
});

test('saves from v1 and from stage 1 (no spot fields) load with 연못 only; spots round-trip', () => {
  const v1 = { v: 1, coins: 50, sel: 'radish', plots: Array.from({ length: 6 }, () => ({ crop: null, progress: 0, t: 0, yieldMul: 1, weed: false, crow: null, fert: false, last: null })),
    seeds: { gold: 0 }, up: { rod: 0, bait: 0, field: 0, scare: 0 }, items: { fert: 0 }, ms: {}, nextEventAt: 0, fish: { phase: 'idle' },
    dex: { crops: {}, fish: {}, goldSeed: false }, savedAt: 0 };
  const stage1 = JSON.parse(L.encode(L.newState(0, seq(0.5))));
  for (const old of [v1, stage1]) {
    const s = L.decode(JSON.stringify(old));
    assert.ok(s);
    assert.equal(s.v, 2);
    assert.equal(L.curSpot(s), 'pond');
    assert.equal(L.spotUnlocked(s, 'river'), false);
    assert.deepEqual(L.decode(L.encode(s)), s);
  }
  const s = L.newState(0, seq(0.5));
  s.rep = 30; s.coins = 9999; L.buySpot(s, 'river'); L.setSpot(s, 'river');
  const back = L.decode(L.encode(s));
  assert.deepEqual(back, s);
  assert.equal(L.curSpot(back), 'river');
  // a tampered save cannot stand at a spot it never bought
  const j = JSON.parse(L.encode(s)); j.spot = 'sea'; j.spotOk.moon = true;
  const b2 = L.decode(JSON.stringify(j));
  assert.equal(L.curSpot(b2), 'pond');
  assert.deepEqual(b2.spotOk, { river: true });
  // the new species and their records survive a save
  s.dex.fish.swordfish = { n: 1, best: 200.5 };
  assert.deepEqual(L.decode(L.encode(s)).dex.fish.swordfish, { n: 1, best: 200.5 });
});
