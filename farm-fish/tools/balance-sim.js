// tools/balance-sim.js — headless 2-week economy simulation (not part of the build).
// Usage: node tools/balance-sim.js [seeds=5] [--reel]
// Loads the pure logic block exactly like test/logic.test.js and plays three player archetypes over
// 14 real days with the real game clock, weather, seasons, crows/weeds, orders, cooking, animals and reel minigame.
'use strict';
process.env.TZ = 'Asia/Seoul';
const vm = require('node:vm');
const html = require('../build.js').build();
vm.runInThisContext(html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1], { filename: 'logic.js' });
const L = globalThis.Logic;

const TZ = 540, MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
const START = new Date(2026, 10, 2, 0, 0).getTime();      // Monday 2026-11-02 00:00 KST
const DAYS = 14;

function mulberry(a) {
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const dateKey = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

// ---------- reel minigame with a human-ish holding policy ----------
// delay = reaction time to a telegraphed burst (and to it ending); hi/lo = tension hysteresis
const SKILL = {
  average: { delay: [0.2, 0.7], hi: 0.8, lo: 0.45, hook: 0.85 },
  skilled: { delay: [0.1, 0.35], hi: 0.85, lo: 0.35, hook: 0.95 }
};
function reelFish(roll, rodTier, skill, rng) {
  const r = L.newReel(roll, rodTier), dt = 0.05;
  let hold = true, dStart = -1, dEnd = -1, delay = 0.3;
  const pickDelay = () => skill.delay[0] + rng() * (skill.delay[1] - skill.delay[0]);
  for (;;) {
    const danger = r.warn > 0 || r.burst > 0;
    if (danger && dStart < 0) { dStart = r.t; delay = pickDelay(); dEnd = -1; }
    if (!danger && dStart >= 0) { dStart = -1; dEnd = r.t; delay = pickDelay(); }
    let want = hold;
    if (hold && r.tension >= skill.hi) want = false;
    if (dStart >= 0 && r.t - dStart >= delay) want = false;
    if (!hold && dStart < 0 && (dEnd < 0 || r.t - dEnd >= delay) && r.tension <= skill.lo) want = true;
    hold = want;
    const res = L.reelStep(r, dt, hold, rng);
    if (res) return res === 'caught';
  }
}

// ---------- archetypes ----------
// sessions: [openFrom h, openTo h, checkEvery min, casts per check]; days: which weekdays (0=Sun)
const WEEKDAY = [1, 2, 3, 4, 5], ALL = [0, 1, 2, 3, 4, 5, 6];
const ARCH = {
  idler: { name: '구석 방치', skill: 'average', react: 0.15, plan: [{ days: WEEKDAY, s: [[9, 18, 30, 3]] }] },
  active: { name: '열심', skill: 'skilled', react: 0.5, plan: [
    { days: WEEKDAY, s: [[9, 18, 10, 4], [20, 20.5, 10, 6], [22, 22.5, 10, 6]] },
    { days: [0, 6], s: [[10, 10.5, 10, 6], [15, 15.5, 10, 6], [21, 21.5, 10, 6]] }] },
  lazy: { name: '하루 3번', skill: 'average', react: 0.3, plan: [{ days: ALL, s: [[8.5, 8.67, 10, 5], [12.5, 12.67, 10, 5], [21, 21.17, 10, 5]] }] }
};

// purchase priority: the first ungated item not owned is saved for; gated ones (★/house) are skipped for now
const PLAN = [
  ['up', 'rod'], ['seed', 'potato'], ['up', 'scare'], ['animal', 'hen'], ['up', 'field'], ['spot', 'river'],
  ['up', 'bait'], ['seed', 'pepper'], ['house'], ['up', 'basket'], ['deco', 'flowers'], ['deco', 'mailbox'], ['animal', 'hen'],
  ['up', 'rod'], ['up', 'scare'], ['animal', 'cow'], ['seed', 'tomato'], ['animal', 'duck'], ['furn', 'bed'], ['up', 'field'],
  ['up', 'bait'], ['seed', 'corn'], ['house'], ['deco', 'bench'], ['deco', 'tree'], ['spot', 'sea'], ['up', 'rod'],
  ['up', 'basket'], ['up', 'scare'], ['up', 'bait'], ['animal', 'hen'], ['animal', 'cow'], ['animal', 'duck'],
  ['seed', 'pumpkin'], ['house'],
  ...L.DECOS.filter((d) => !d.merchant).map((d) => ['deco', d.id]), ...L.FURN.map((f) => ['furn', f.id])
];
function owned(s, p) {
  switch (p[0]) {
    case 'up': return false;        // handled by counting below
    case 'seed': return L.seedUnlocked(s, p[1]);
    case 'spot': return L.spotUnlocked(s, p[1]);
    case 'deco': return !!(s.yard && s.yard.deco[p[1]]);
    case 'furn': return !!(s.yard && s.yard.furn[p[1]]);
  }
  return false;
}
function buyNext(s, now, log) {
  const seen = {};
  for (const p of PLAN) {
    const key = p.join(':'); seen[key] = (seen[key] || 0) + 1;
    let cost, gated = false, done = false, label = key + (seen[key] > 1 ? '#' + seen[key] : '');
    if (p[0] === 'up') { if (L.tier(s, p[1]) >= seen[key]) continue; cost = L.upgradeCost(s, p[1]); if (cost === null) continue; }
    else if (p[0] === 'animal') { if ((s.animals[p[1]] || 0) >= seen[key]) continue; cost = L.animalCost(s, p[1]); if (cost === null) continue; gated = L.houseTier(s) < L.ANIMALS[p[1]].house; }
    else if (p[0] === 'house') { if (L.houseTier(s) >= seen[key]) continue; const n = L.houseNext(s); if (!n) continue; cost = n.cost; gated = s.rep < n.rep; label = 'house:' + n.id; }
    else if (owned(s, p)) continue;
    else if (p[0] === 'seed') cost = L.seedCost(s, p[1]);
    else if (p[0] === 'spot') { cost = L.SPOTS[p[1]].cost; gated = s.rep < L.SPOTS[p[1]].rep; }
    else if (p[0] === 'deco') { cost = L.decoById(p[1]).cost; gated = L.decoCount(s) >= L.decoSlots(s); }
    else if (p[0] === 'furn') { cost = L.furnById(p[1]).cost; gated = L.houseTier(s) < L.furnById(p[1]).house; }
    if (gated) continue;
    if (s.coins - cost < 80) return;                 // save up for it, keep a little seed money
    if (p[0] === 'up') done = L.buy(s, p[1]);
    else if (p[0] === 'animal') done = L.buyAnimal(s, p[1], now).ok;
    else if (p[0] === 'house') done = L.upgradeHouse(s).ok;
    else if (p[0] === 'seed') done = L.buySeed(s, p[1]);
    else if (p[0] === 'spot') done = L.buySpot(s, p[1]);
    else if (p[0] === 'deco') done = L.buyDeco(s, p[1]).ok;
    else if (p[0] === 'furn') done = L.buyFurn(s, p[1]).ok;
    if (!done) return;
    log(label);
    return buyNext(s, now, log);
  }
}

// ---------- one simulated run ----------
function run(archId, seed) {
  const A = ARCH[archId], skill = SKILL[A.skill], rng = mulberry(seed * 7919 + archId.length);
  const s = L.newState(START, rng);
  L.yardOf(s); s.born = START;
  const out = { events: {}, daily: [], spent: 0, fishTry: {}, fishOk: {}, earn: { raw: 0, order: 0, dish: 0, other: 0 }, orders: 0, dishes: 0, dailyPaid: 0 };
  const tAt = (t) => (t - START) / DAY;
  const log = (what, t) => { if (!(what in out.events)) out.events[what] = tAt(t); };
  const orderAge = {};
  let interval = 30 * MIN;

  function env(t) { return L.fishEnv(t, TZ); }
  function season(t) { return L.gameClock(t, TZ).season; }
  function keepSet() {
    const keep = {};
    s.orders.forEach((q) => { if (q.o) keep[q.o.id] = Math.max(keep[q.o.id] || 0, q.o.n); });
    const r = targetDish();
    if (r) r.need.forEach((x) => { keep[x] = (keep[x] || 0) + 1; });
    return keep;
  }
  function sellExtra() {
    const keep = keepSet(), have = {};
    s.bag = s.bag.filter((e) => {
      have[e.id] = (have[e.id] || 0) + 1;
      if (have[e.id] <= (keep[e.id] || 0)) return true;
      s.coins += e.v; out.earn[L.itemInfo(e.id).kind === 'dish' ? 'dish' : 'raw'] += e.v; return false;
    });
  }
  // the one dish this player is working toward: best profit over selling the parts, all parts obtainable now
  function targetDish() {
    return L.RECIPES.filter((r) => !r.hidden && L.obtainable(s, r.id) && r.need.every((x) => !L.CROPS[x] || L.cropSeasonOk(x, season(s._t))))
      .sort((a, b) => (b.sell - b.need.reduce((t, x) => t + L.itemInfo(x).price, 0)) - (a.sell - a.need.reduce((t, x) => t + L.itemInfo(x).price, 0)))[0];
  }
  function cropNeeds() {
    const need = {}, have = {};
    s.bag.forEach((e) => { have[e.id] = (have[e.id] || 0) + 1; });
    s.plots.forEach((p) => { if (p.crop) have[p.crop] = (have[p.crop] || 0) + 1; });
    s.orders.forEach((q) => { if (q.o && L.CROPS[q.o.id]) need[q.o.id] = (need[q.o.id] || 0) + q.o.n; });
    // the best known dish's crops (one batch)
    const best = targetDish();
    if (best) best.need.forEach((x) => { if (L.CROPS[x]) need[x] = (need[x] || 0) + 1; });
    const out2 = [];
    Object.keys(need).forEach((id) => { for (let k = (have[id] || 0); k < need[id]; k++) out2.push(id); });
    return out2;
  }
  function plantAll(t, lastOfDay) {
    const se = season(t), wish = cropNeeds();
    const ok = (id) => L.seedUnlocked(s, id) && L.cropSeasonOk(id, se) && s.coins >= L.CROPS[id].cost;
    const score = (id) => { const c = L.CROPS[id]; return lastOfDay ? c.sell - c.cost : (c.sell - c.cost) / (Math.ceil(c.grow / interval) * interval); };
    const bestPlain = () => L.SEEDS.filter(ok).sort((a, b) => score(b) - score(a))[0];
    s.plots.forEach((p, i) => {
      if (p.crop) return;
      let id = null;
      if (s.seeds.gold > 0) id = 'gold';
      else if (i < 2 && !s.dex.goldSeed && archId !== 'lazy' && ok(i === 0 ? 'berry' : 'melon')) id = i === 0 ? 'berry' : 'melon';
      else { const k = wish.findIndex(ok); if (k >= 0) id = wish.splice(k, 1)[0]; else id = bestPlain(); }
      if (id) L.plant(s, i, id, t, se);
    });
  }
  function fishSpot(t) {
    const d = new Date(t), e = env(t), spots = L.SPOT_IDS.filter((id) => L.spotUnlocked(s, id));
    const want = {}; s.orders.forEach((q) => { if (q.o && L.fishById(q.o.id)) want[q.o.id] = 1; });
    let best = null, bestV = -1;
    spots.forEach((sp) => {
      s.spot = sp;
      const pool = L.availableFish(d, s, e);
      let v = 0, w = 0;
      const rare = L.UPG.bait.rare[L.tier(s, 'bait')];
      pool.forEach((f) => { const ww = f.w * (f.rarity === '흔함' ? 1 : rare); w += ww; v += ww * f.price * (want[f.id] ? 3 : 1) * (s.dex.fish[f.id] || archId !== 'active' ? 1 : 2); });
      v = w ? v / w : 0;
      if (v > bestV) { bestV = v; best = sp; }
    });
    s.spot = best || 'pond';
  }
  function goFish(t, casts) {
    fishSpot(t);
    for (let c = 0; c < casts; c++) {
      if (rng() > skill.hook) continue;
      const roll = L.rollFish(new Date(t), rng, s, env(t));
      const f = L.fishById(roll.id);
      out.fishTry[f.rarity] = (out.fishTry[f.rarity] || 0) + 1;
      if (!reelFish(roll, L.tier(s, 'rod'), skill, rng)) continue;
      out.fishOk[f.rarity] = (out.fishOk[f.rarity] || 0) + 1;
      const r = L.landFish(s, roll); out.earn.raw += r.sold;
      if (f.rarity === '전설') log('legend:' + f.id, t);
    }
  }
  function checkIn(t, casts, lastOfDay) {
    s._t = t;
    L.ensureDaily(s, dateKey(t));
    L.advance(s, t, TZ);
    s.plots.forEach((p, i) => { if (p.crow) L.shoo(s, i, t); if (p.weed) L.pullWeed(s, i, t); });
    L.refreshOrders(s, t, rng);
    while (L.potReady(s, t)) { const r = L.takeDish(s, t); out.dishes++; if (r.sold) out.earn.dish += r.sold; }
    if (L.productsWaiting(s) || s.animals.hen + s.animals.duck + s.animals.cow) { const r = L.collectAnimals(s, t, rng); out.earn.raw += r.sold; }
    for (let i = 0; i < s.plots.length; i++) { const r = L.harvest(s, i, t, rng); if (r) { out.earn.raw += r.sold; if (r.gold) log('goldSeed', t); } }
    // visitors: tap whoever is around, read mail
    L.tickVisitors(s, t, rng, TZ, 1).forEach(() => {});
    s.yard.vis.slice().forEach((v) => { if (v.id !== 'merchant') { const c0 = s.coins; L.tapVisitor(s, v.id, t, rng, TZ); out.earn.other += s.coins - c0; } });
    { const c0 = s.coins; L.collectGifts(s); s.yard.mail.forEach((m, i) => L.readMail(s, i)); out.earn.other += s.coins - c0; }
    goFish(t, casts);
    // cook the best dish we can (keeping order items), before delivering so dish orders can use it later
    deliverAll(t);
    for (let k = 0; k < 3; k++) {
      const r = L.RECIPES.filter((x) => L.canCook(s, x.id) && !s.orders.some((q) => q.o && x.need.includes(q.o.id) && L.bagCount(s, q.o.id) <= q.o.n)).sort((a, b) => b.sell - a.sell)[0];
      if (!r || !L.cook(s, r.id, t)) break;
    }
    // discard orders that have been hanging for long and can't be filled right now
    s.orders.forEach((q, k) => {
      if (!q.o) return;
      const key = k + ':' + q.o.id + ':' + q.o.n;
      if (!(key in orderAge)) orderAge[key] = t;
      const it = L.itemInfo(q.o.id), now = L.fishById(q.o.id) ? (() => { const sp = s.spot; const ok = L.SPOT_IDS.some((id) => { if (!L.spotUnlocked(s, id)) return false; s.spot = id; return L.availableFish(new Date(t), s, env(t)).some((f) => f.id === q.o.id); }); s.spot = sp; return ok; })() : L.obtainable(s, q.o.id);
      if (t - orderAge[key] > 6 * HOUR || (t - orderAge[key] > 3 * HOUR && (!now || it.kind === 'dish'))) { L.discard(s, k, t, rng); delete orderAge[key]; }
    });
    sellExtra();
    if (L.dailyDone(s) && !s.daily.paid) { const r = L.claimDaily(s); out.earn.other += r.coins; out.dailyPaid++; }
    const c0 = s.coins;
    buyNext(s, t, (w) => log(w, t));
    plantAll(t, lastOfDay);
    out.spent += c0 - s.coins;
    L.checkMilestones(s);
    [5, 12, 20, 25].forEach((r) => { if (s.rep >= r) log('rep' + r, t); });
  }
  function deliverAll(t) {
    for (let k = 0; k < s.orders.length; k++) {
      const r = L.deliver(s, k, t, rng);
      if (r) { out.orders++; out.earn.order += r.coins; r.friend.ups.forEach((u) => { out.earn.other += u.coins + (u.gift ? u.gift.coins : 0); }); }
    }
  }
  function between(a, b) {   // tab open: crows and weeds keep coming; the player reacts to some of them
    while (s.nextEventAt <= b) {
      const t = Math.max(a, s.nextEventAt);
      L.advance(s, t, TZ);
      const ev = L.spawnEvent(s, t, rng, 1);
      if (ev && ev.type !== 'scared' && rng() < A.react) {
        const t2 = t + 30e3; L.advance(s, t2, TZ);
        if (ev.type === 'crow') L.shoo(s, ev.i, t2); else L.pullWeed(s, ev.i, t2);
      }
    }
    L.advance(s, b, TZ);
  }

  for (let day = 0; day < DAYS; day++) {
    const d0 = START + day * DAY, wd = new Date(d0).getDay();
    const sessions = [];
    A.plan.forEach((p) => { if (p.days.includes(wd)) p.s.forEach((x) => sessions.push(x)); });
    sessions.forEach((ss, si) => {
      const [h0, h1, every, casts] = ss;
      interval = every * MIN;
      let t = d0 + h0 * HOUR;
      const end = d0 + h1 * HOUR;
      L.resume(s, t, rng);
      while (t <= end) {
        checkIn(t, casts, si === sessions.length - 1 && t + every * MIN > end);
        const nx = t + every * MIN;
        if (nx <= end) between(t, nx);
        t = nx;
      }
    });
    out.daily.push({ coins: s.coins, rep: s.rep, house: L.houseTier(s), dex: dexPct(s), earned: s.coins + out.spent });
  }
  out.final = s;
  return out;
}
const DEX_FISH = L.FISH.filter((f) => !f.egg);
const DEX_N = Object.keys(L.CROPS).length + DEX_FISH.length + L.RECIPES.length;
function dexPct(s) {
  const n = Object.keys(s.dex.crops).length + DEX_FISH.filter((f) => s.dex.fish[f.id]).length + Object.keys(s.dex.dish).length;
  return Math.round(n / DEX_N * 100);
}

// ---------- report ----------
const median = (xs) => { const v = xs.filter((x) => x !== undefined).sort((a, b) => a - b); if (v.length * 2 <= xs.length) return undefined; return v[Math.floor(xs.length / 2)] ; };
const fmtDay = (x) => x === undefined ? '—' : (x < 1 ? '1일차 ' + Math.round(x * 24) + '시' : (Math.floor(x) + 1) + '일차');
const KEYS = ['up:rod', 'up:scare', 'animal:hen', 'up:field', 'rep5', 'spot:river', 'up:bait', 'house:hut', 'up:basket',
  'up:rod#2', 'animal:cow', 'house:giwa', 'rep20', 'spot:sea', 'up:rod#3', 'seed:pumpkin', 'house:two', 'deco:windmill', 'furn:piano', 'goldSeed', 'legend:sturgeon', 'legend:tuna'];

function reelTable() {
  const rng = mulberry(42), rows = [];
  ['sturgeon', 'tuna', 'swordfish', 'ghostray', 'koi', 'salmon', 'carp', 'catfish', 'crucian'].forEach((id) => {
    const f = L.fishById(id), row = [f.name + ' (' + f.rarity + ', 힘 ' + f.power + ')'];
    for (const sk of ['average', 'skilled']) for (let rt = 0; rt <= 3; rt += 3) {
      let ok = 0; const N = 2000;
      for (let k = 0; k < N; k++) ok += reelFish({ id, size: f.min + (f.max - f.min) * Math.pow(rng(), 1.6) }, rt, SKILL[sk], rng) ? 1 : 0;
      row.push(Math.round(ok / N * 100) + '%');
    }
    rows.push(row);
  });
  console.log('\n릴 성공률 (보통 손 낚싯대0 / 보통 손 낚싯대3 / 능숙 낚싯대0 / 능숙 낚싯대3)');
  rows.forEach((r) => console.log('  ' + r.join(' | ')));
}

if (require.main === module) {
  const seeds = +(process.argv[2] || 5);
  reelTable();
  for (const id of Object.keys(ARCH)) {
    const runs = []; for (let k = 1; k <= seeds; k++) runs.push(run(id, k));
    console.log('\n== ' + ARCH[id].name + ' (' + id + ') · ' + seeds + '판 중앙값 ==');
    console.log('  해금: ' + KEYS.map((k) => k + ' ' + fmtDay(median(runs.map((r) => r.events[k])))).join(' · '));
    const D = [0, 1, 2, 4, 6, 9, 13];
    console.log('  일차   ' + D.map((d) => String(d + 1).padStart(9)).join(''));
    for (const f of ['earned', 'coins', 'rep', 'house', 'dex']) console.log('  ' + f.padEnd(6) + D.map((d) => String(median(runs.map((r) => r.daily[d][f]))).padStart(9)).join(''));
    const r0 = runs[0], s = r0.final;
    const e = r0.earn, tot = e.raw + e.order + e.dish + e.other;
    console.log('  수입 비중(1판): 그냥 팔기 ' + Math.round(e.raw / tot * 100) + '% · 주문 ' + Math.round(e.order / tot * 100) + '% · 요리 ' + Math.round(e.dish / tot * 100) + '% · 기타 ' + Math.round(e.other / tot * 100) + '%  | 주문 ' + r0.orders + '건 · 요리 ' + r0.dishes + '번 · 할 일 보상 ' + r0.dailyPaid + '/14');
    console.log('  주민 친밀도(1판): ' + L.RESIDENTS.map((x) => x.id + ' ' + L.friendLevel(s, x.id)).join(' · '));
    console.log('  도감(1판): 작물 ' + Object.keys(s.dex.crops).length + '/' + Object.keys(L.CROPS).length + ' · 물고기 ' + DEX_FISH.filter((f) => s.dex.fish[f.id]).length + '/' + DEX_FISH.length + ' · 요리 ' + Object.keys(s.dex.dish).length + '/' + L.RECIPES.length + ' · 업그레이드 ' + JSON.stringify(s.up));
    console.log('  낚시 성공(1판): ' + Object.keys(r0.fishTry).map((k) => k + ' ' + (r0.fishOk[k] || 0) + '/' + r0.fishTry[k]).join(' · '));
  }
}
module.exports = { run, reelFish, SKILL, L };
