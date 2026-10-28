// farm-fish/tools/balance-sim.js — headless 2-week economy simulation (not part of the build).
// Usage: node farm-fish/tools/balance-sim.js [seeds=5] [days=14] [--nomini]
// --nomini: nobody tries the optional 도전 minigames (to measure what they add)
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
const DAYS = +(process.argv[3] || 14);
const NOMINI = process.argv.includes('--nomini');

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
// mini = optional 도전 minigames: try = how often the player bothers; zone(w) = success rate for a gauge zone width
// (average: 70% at 0.30 → 35% at 0.10), heat = 불 조절, pick = 자물쇠
const SKILL = {
  average: { delay: [0.2, 0.7], hi: 0.8, lo: 0.45, hook: 0.85, mini: { try: 0.5, z30: 0.7, z10: 0.35, heat: 0.6, pick: 0.5 } },
  skilled: { delay: [0.1, 0.35], hi: 0.85, lo: 0.35, hook: 0.95, mini: { try: 1, z30: 0.85, z10: 0.5, heat: 0.8, pick: 0.75 } }
};
const zoneWin = (m, w) => m.z10 + (m.z30 - m.z10) * Math.max(0, Math.min(1.2, (w - 0.1) / 0.2));
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
  ['up', 'rod'], ['seed', 'potato'], ['up', 'scare'], ['animal', 'hen'], ['up', 'field'], ['spot', 'river'], ['forest'],
  ['up', 'bait'], ['seed', 'pepper'], ['house'], ['up', 'basket'], ['deco', 'flowers'], ['pet', 'dog'], ['deco', 'mailbox'], ['animal', 'hen'],
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
    case 'forest': return L.forestOk(s);
    case 'pet': return !!s.pet;
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
    else if (p[0] === 'forest') { cost = L.FOREST_COST; gated = s.rep < L.FOREST_REP; }
    else if (p[0] === 'pet') cost = L.PET_KINDS[p[1]].cost;
    if (gated) continue;
    if (s.coins - cost < 80) return;                 // save up for it, keep a little seed money
    if (p[0] === 'up') done = L.buy(s, p[1]);
    else if (p[0] === 'animal') done = L.buyAnimal(s, p[1], now).ok;
    else if (p[0] === 'house') done = L.upgradeHouse(s).ok;
    else if (p[0] === 'seed') done = L.buySeed(s, p[1]);
    else if (p[0] === 'spot') done = L.buySpot(s, p[1]);
    else if (p[0] === 'deco') done = L.buyDeco(s, p[1]).ok;
    else if (p[0] === 'furn') done = L.buyFurn(s, p[1]).ok;
    else if (p[0] === 'forest') done = L.unlockForest(s, now).ok;
    else if (p[0] === 'pet') done = L.adoptPet(s, p[1], '', now).ok;
    if (!done) return;
    log(label);
    return buyNext(s, now, log);
  }
}

// ---------- one simulated run ----------
function run(archId, seed) {
  const A = ARCH[archId], skill = SKILL[A.skill], M = skill.mini, rng = mulberry(seed * 7919 + archId.length);
  const tryMini = () => !NOMINI && rng() < M.try;
  const s = L.newState(START, rng);
  L.yardOf(s); s.born = START;
  const out = { events: {}, daily: [], spent: 0, fishTry: {}, fishOk: {}, earn: { raw: 0, order: 0, dish: 0, other: 0, forage: 0, pet: 0, junk: 0, fest: 0, mini: 0 },
    orders: 0, dishes: 0, dailyPaid: 0, casts: 0, junk: {}, picks: 0, petGifts: 0, chests: 0,
    miniBy: { harvest: 0, forage: 0, heat: 0, pick: 0 }, castsEarly: 0, junkEarly: 0 };
  // new basket entries since n0 get a source tag (sold later under that source); overflow coins go to it now
  const tagNew = (n0, c0, src) => { for (let k = n0; k < s.bag.length; k++) s.bag[k].src = src; out.earn[src] += s.coins - c0; };
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
      const kind = L.itemInfo(e.id).kind, extra = e.mini || 0;
      s.coins += e.v; out.earn[e.src || (kind === 'dish' ? 'dish' : kind === 'forage' ? 'forage' : 'raw')] += e.v - extra; out.earn.mini += extra;
      if (extra) out.miniBy[kind === 'dish' ? 'heat' : kind === 'forage' ? 'forage' : 'harvest'] += extra; return false;
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
      pool.forEach((f) => { const ww = f.w * (f.rarity === '흔함' ? 1 : rare); w += ww; v += ww * f.price * (want[f.id] || f.fest ? 3 : 1) * (s.dex.fish[f.id] || archId !== 'active' ? 1 : 2); });
      v = w ? v / w : 0;
      if (v > bestV) { bestV = v; best = sp; }
    });
    s.spot = best || 'pond';
  }
  function goFish(t, casts) {
    fishSpot(t);
    for (let c = 0; c < casts; c++) {
      out.casts++; if (t < START + 3 * DAY) out.castsEarly++;
      if (rng() > skill.hook) continue;
      const roll = L.rollFish(new Date(t), rng, s, env(t));
      const f = L.fishById(roll.id);
      const jk = L.rollJunk(roll, rng);
      if (jk) {
        const c0 = s.coins, r = L.landJunk(s, jk, rng);
        out.earn.junk += s.coins - c0; out.junk[jk] = (out.junk[jk] || 0) + 1; if (t < START + 3 * DAY) out.junkEarly++;
        if (r.letter && !r.reread) [3, 6, 9, 12].forEach((n) => { if (L.lettersFound(s) >= n) log('letters' + n, t); });
        continue;
      }
      out.fishTry[f.rarity] = (out.fishTry[f.rarity] || 0) + 1;
      if (!reelFish(roll, L.tier(s, 'rod'), skill, rng)) continue;
      out.fishOk[f.rarity] = (out.fishOk[f.rarity] || 0) + 1;
      const n0 = s.bag.length, r = L.landFish(s, roll);
      if (f.fest) { out.earn.fest += r.sold; if (s.bag.length > n0) s.bag[n0].src = 'fest'; } else out.earn.raw += r.sold;
      if (f.rarity === '전설') log('legend:' + f.id, t);
    }
  }
  function checkIn(t, casts, lastOfDay) {
    s._t = t;
    L.ensureDaily(s, dateKey(t));
    L.advance(s, t, TZ);
    s.plots.forEach((p, i) => { if (p.crow) L.shoo(s, i, t); if (p.weed) L.pullWeed(s, i, t); });
    festChores(t);
    L.refreshOrders(s, t, rng);
    while (L.potReady(s, t)) {
      const mult = tryMini() && rng() < M.heat ? L.HEAT_BONUS : 1, n0 = s.bag.length, r = L.takeDish(s, t, mult);
      const extra = Math.round(L.itemInfo(r.id).price * mult) - L.itemInfo(r.id).price;
      out.dishes++;
      if (r.sold) { out.earn.dish += r.sold - extra; out.earn.mini += extra; out.miniBy.heat += extra; } else if (s.bag.length > n0) s.bag[n0].mini = extra;
    }
    if (L.productsWaiting(s) || s.animals.hen + s.animals.duck + s.animals.cow) { const r = L.collectAnimals(s, t, rng); out.earn.raw += r.sold; }
    for (let i = 0; i < s.plots.length; i++) {
      const r = L.harvest(s, i, t, rng);
      if (!r) continue;
      out.earn.raw += r.sold; if (r.gold) log('goldSeed', t);
      if (tryMini() && rng() < zoneWin(M, L.harvestWidth(r.crop))) {
        let k = -1; if (!r.sold) for (let j = s.bag.length - 1; j >= 0; j--) if (s.bag[j].id === r.crop && s.bag[j].v === r.coins) { k = j; break; }
        const extra = L.premiumHarvest(s, r);
        if (k >= 0) s.bag[k].mini = extra; else { out.earn.mini += extra; out.miniBy.harvest += extra; }
      }
    }
    forestVisit(t);
    petChores(t);
    // visitors: tap whoever is around, read mail
    L.tickVisitors(s, t, rng, TZ, 1).forEach(() => {});
    s.yard.vis.slice().forEach((v) => { if (v.id !== 'merchant') { const c0 = s.coins; L.tapVisitor(s, v.id, t, rng, TZ); out.earn.other += s.coins - c0; } });
    { const c0 = s.coins; L.collectGifts(s); s.yard.mail.forEach((m, i) => L.readMail(s, i)); out.earn.other += s.coins - c0; }
    goFish(t, casts);
    junkChores();
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
  function forestVisit(t) {
    if (!L.forestOk(s)) return;
    const e = env(t); e.wet = e.weather === 'rain' || L.rainJustStopped(t, TZ);
    L.tickForest(s, t, e, rng);
    s.forest.spots.forEach((p, k) => {
      if (!p.id) return;
      const f = L.forageById(p.id), won = tryMini() && rng() < zoneWin(M, L.CH_ZONE[f.rarity]);
      const n0 = s.bag.length, c0 = s.coins, r = L.pickForage(s, k, t, rng, won);
      out.picks++;
      if (r.n > 1) { if (s.bag.length - n0 === 2) { s.bag[n0 + 1].src = 'forage'; s.bag[n0 + 1].mini = s.bag[n0 + 1].v; s.bag[n0].src = 'forage'; } else { out.earn.mini += f.price; out.miniBy.forage += f.price; out.earn.forage += s.coins - c0 - f.price; } }
      else tagNew(n0, c0, 'forage');
      if (r.id === 'ginseng') log('ginseng', t);
    });
    if (s.pet) { const n0 = s.bag.length, c0 = s.coins; if (L.petFind(s, t, TZ, e, rng)) { tagNew(n0, c0, 'pet'); out.petGifts++; } }
    if (L.forageDexCount(s) >= L.FORAGE.length / 2) log('forageHalf', t);
  }
  function petChores(t) {
    if (!s.pet && L.adoptStatus(s, 'cat') === 'ok') { L.adoptPet(s, 'cat', '', t); log('pet:cat', t); }
    if (!s.pet) return;
    const e = L.forestOk(s) ? env(t) : null; if (e) e.wet = e.weather === 'rain' || L.rainJustStopped(t, TZ);
    const n0 = s.bag.length, c0 = s.coins;
    if (L.takePetGift(s, t, TZ, e, rng)) { tagNew(n0, c0, 'pet'); out.petGifts++; }
    L.petPet(s, t, TZ);
  }
  function festChores(t) {
    L.festTick(s, t, TZ);
    const w = L.festivalAt(t, TZ);
    if (w && L.festClaimable(s, w)) { const c0 = s.coins; L.festClaim(s, w); out.earn.fest += s.coins - c0; log('fest:' + w.id, t); }
  }
  // recycle what we can, open boxes (lock-pick sometimes), sell scrap nobody needs any more; keys are kept for boxes
  function junkChores() {
    if (!s.junk) return;
    L.RECYCLE.forEach((r) => { while (L.canRecycle(s, r.id) === 'ok') { L.recycle(s, r.id); if (r.id !== 'chest') log('recycle:' + r.id, t0()); } });
    while (s.junk.box > 0) {
      const tier = tryMini() && rng() < M.pick ? 1 : 0, c0 = s.coins, r = L.openChest(s, rng, tier);
      out.chests++;
      const got = s.coins - c0, extra = tier ? (r.kind === 'deco' ? got : got / 2) : 0;
      out.earn.junk += got - extra; out.earn.mini += extra; out.miniBy.pick += extra;
      if (r.kind === 'deco') log('treasure:' + r.id, t0());
    }
    L.SCRAP_IDS.forEach((id) => {
      if (id === 'key') return;
      if (L.RECYCLE.every((r) => !r.need[id] || (s.yard && s.yard.deco[r.id]))) out.earn.junk += L.sellScrap(s, id);
    });
  }
  const t0 = () => s._t;
  function deliverAll(t) {
    for (let k = 0; k < s.orders.length; k++) {
      const o = s.orders[k] && s.orders[k].o, r = L.deliver(s, k, t, rng);
      if (r) { out.orders++; const fx = o.fest ? r.coins - Math.round(r.coins / L.FEST_ORDER_MULT) : 0; out.earn.order += r.coins - fx; out.earn.fest += fx; r.friend.ups.forEach((u) => { out.earn.other += u.coins + (u.gift ? u.gift.coins : 0); }); }
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
    if (L.festivalAt(d0 + 12 * HOUR, TZ)) (out.festDays = out.festDays || []).push(day);
    out.daily.push({ fest: out.earn.fest, letters: L.lettersFound(s), forage: L.forageDexCount(s), coins: s.coins, rep: s.rep, house: L.houseTier(s), dex: dexPct(s), earned: s.coins + out.spent });
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
  'up:rod#2', 'animal:cow', 'house:giwa', 'rep20', 'spot:sea', 'up:rod#3', 'seed:pumpkin', 'house:two', 'deco:windmill', 'furn:piano', 'goldSeed', 'legend:sturgeon', 'legend:tuna',
  'forest', 'pet:dog', 'pet:cat', 'fest:spring', 'fest:summer', 'fest:autumn', 'fest:winter', 'forageHalf', 'ginseng', 'letters3', 'letters6', 'letters12', 'recycle:canchime', 'treasure:anchor'];
const SRC = [['raw', '그냥 팔기'], ['order', '주문'], ['dish', '요리'], ['other', '기타'], ['forage', '숲'], ['pet', '반려'], ['junk', '잡동사니'], ['fest', '축제'], ['mini', '도전 덤']];

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
    const D = [0, 1, 2, 4, 6, 9, 13, 20, 27, 34].filter((d) => d < DAYS);
    console.log('  일차   ' + D.map((d) => String(d + 1).padStart(9)).join(''));
    for (const f of ['earned', 'coins', 'rep', 'house', 'dex', 'forage', 'letters']) console.log('  ' + f.padEnd(6) + D.map((d) => String(median(runs.map((r) => r.daily[d][f]))).padStart(9)).join(''));
    const r0 = runs[0], s = r0.final;
    const sum = {}; SRC.forEach(([k]) => { sum[k] = runs.reduce((a, r) => a + r.earn[k], 0); });
    const tot = SRC.reduce((a, [k]) => a + sum[k], 0);
    console.log('  수입 비중(' + seeds + '판 합): ' + SRC.map(([k, n]) => n + ' ' + (sum[k] / tot * 100).toFixed(1) + '%').join(' · ') + '  | 도전 덤 = 도전 없이 번 돈의 +' + (sum.mini / (tot - sum.mini) * 100).toFixed(1) + '%');
    const casts = runs.reduce((a, r) => a + r.casts, 0), junkN = runs.reduce((a, r) => a + Object.values(r.junk).reduce((x, y) => x + y, 0), 0);
    console.log('  잡동사니: ' + (casts / Math.max(1, junkN)).toFixed(1) + '번 던질 때 하나 · 판당 ' + Math.round(junkN / seeds) + '개 (편지 ' + Math.round(runs.reduce((a, r) => a + (r.junk.letter || 0), 0) / seeds) + ' · 상자 ' + Math.round(runs.reduce((a, r) => a + r.chests, 0) / seeds) + ') · 하루 ' + Math.round(casts / seeds / DAYS) + '번 던짐 | 숲 줍기 하루 ' + Math.round(runs.reduce((a, r) => a + r.picks, 0) / seeds / DAYS) + '번 · 반려 선물 하루 ' + (runs.reduce((a, r) => a + r.petGifts, 0) / seeds / DAYS).toFixed(1) + '개');
    const mb = {}; runs.forEach((r) => Object.keys(r.miniBy).forEach((k) => { mb[k] = (mb[k] || 0) + r.miniBy[k]; }));
    console.log('  도전 덤 나눔: ' + Object.keys(mb).map((k) => k + ' ' + (mb[k] / (tot - sum.mini) * 100).toFixed(1) + '%').join(' · ') + ' | 처음 3일 잡동사니 ' + (runs.reduce((a, r) => a + r.castsEarly, 0) / Math.max(1, runs.reduce((a, r) => a + r.junkEarly, 0))).toFixed(1) + '번에 하나');
    const dayE = (r, d) => r.daily[d].earned - (d ? r.daily[d - 1].earned : 0);
    const fd = runs.map((r) => r.festDays.map((d) => (r.daily[d].fest - (d ? r.daily[d - 1].fest : 0)) / (dayE(r, d) || 1)));
    console.log('  축제 날 그날 수입 중 축제 몫: ' + fd.map((x) => x.map((v) => Math.round(v * 100) + '%').join('/')).join(' · '));
    console.log('  주문 ' + r0.orders + '건 · 요리 ' + r0.dishes + '번 · 할 일 보상 ' + r0.dailyPaid + '/' + DAYS + ' (1판)');
    console.log('  주민 친밀도(1판): ' + L.RESIDENTS.map((x) => x.id + ' ' + L.friendLevel(s, x.id)).join(' · '));
    console.log('  도감(1판): 작물 ' + Object.keys(s.dex.crops).length + '/' + Object.keys(L.CROPS).length + ' · 물고기 ' + DEX_FISH.filter((f) => s.dex.fish[f.id]).length + '/' + DEX_FISH.length + ' · 요리 ' + Object.keys(s.dex.dish).length + '/' + L.RECIPES.length + ' · 채집 ' + L.forageDexCount(s) + '/' + L.FORAGE.length + ' · 편지 ' + L.lettersFound(s) + '/12 · 업그레이드 ' + JSON.stringify(s.up));
    console.log('  낚시 성공(1판): ' + Object.keys(r0.fishTry).map((k) => k + ' ' + (r0.fishOk[k] || 0) + '/' + r0.fishTry[k]).join(' · '));
  }
}
module.exports = { run, reelFish, SKILL, L };
