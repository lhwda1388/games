// tools/balance-sim.js — headless 2-week economy simulation (not part of the build).
// Usage: node tools/balance-sim.js [seeds=5] [days=14] [--nomini]
// --nomini: nobody tries the optional 도전 minigames (to measure what they add)
// Loads the pure logic block exactly like test/logic.test.js and plays three player archetypes over
// 14 real days with the real game clock, weather, seasons, crows/weeds, orders, cooking, animals and reel minigame,
// plus stage 6: orchard, hives, insects (fixed catch rate per hand) and the 마을 (talk, gifts, errands, stories),
// plus stage 7: 갯벌 (dig at low tide, 통발 at high tide), 동굴 (energy, ores, gems, fossil parts, crafts), 별 관측
// (one constellation per night look, 유성우 wishes), 섬 (boat fix, island fish, drift, coconuts, 등대) and the 박물관.
// Idler and 하루 3번 sessions start a few minutes later each day (jit), so their looks fall in every game phase;
// 같은 시각 (fixed) is 하루 3번 at :00 of 9·13·18시 every day, to see what a strict routine misses.
// Stage 8: 오늘의 날 (ensureDay each look), 입질 폭풍 / 대풍년 (the player goes to a storm's spot; a storm or 입질 좋은 날
// shortens the wait, so the same look fits more casts), fish personalities (already inside newReel/reelStep),
// 보물 지도 pieces (junk / cave cell / drift) dug as soon as the map's time rule holds, and 소문 (talk, letters, visitors).
// --noev: no booms and no 오늘의 날 (to measure what they add); --noboom / --noday: just one of them;
// --day=<id>: every day is that 오늘의 날 (its effect at the real 1-in-12 frequency is a twelfth of the gain).
// A boom that starts while the tab is open draws the player in (same chance as reacting to a crow): one extra look.
// Stage 9: 배 업그레이드 (돛배·통통배 bought once coins + materials are in; the materials are kept from then on), 먼바다·난바다
// fish (picked like any spot), 먼 섬 drift; 당나귀 (bought, petted and fed every look up to the daily caps; 깊은 숲·산꼭대기
// picked every look once the level allows, their insects join the bug places, the night star is looked for from the summit);
// 자전거 배달 (a tap policy plays bikeLayout: aim + reaction noise; tried as often as other 도전), 열기구 (a look that falls in
// a window rides; each sight is tapped with a fixed chance per hand), 겨울 썰매 (one run on the first winter look of a day).
// Stage 10: 박 영감 낚시 대회 (every landed fish goes to contestCatch, the week is settled on the first look of the next one),
// 꽃밭 교배 (gardenPolicy: keep the pairs whose children are still missing, pull the rest, keep empty slots for buds),
// 동물 새끼 (broodTick each look; grown kids' share of the animal products is measured), 날씨 장난감 (a few taps per look
// while one is on), 계절 챌린지 (questEnsure/questClaim each look) and 주민들의 하루 + 새 주민 (townMeet everyone out on the
// street, new residents join the village round once moved in).
// 박물관 collector: once the museum is open, a look goes where an insect still missing can show up right now (a 챌린지
// bug still comes first); --nobughunt keeps the old random place. The report lists each room's missing ids (id×runs).
// Stage 11: 옛 포구 (every look puts whatever the current building's bundles can take; items for its open bag slots, the
// cook bundle's dishes and their parts, and one of each 잡동사니 slot are kept, not sold; the building itself is a PLAN
// entry), 어판장 경매 (the biggest one of each of the week's 3 species is kept and sold once it is ≥ ×2.6 or the week
// has under 3 days left), 떠돌이 상인 (a decoration not owned yet when coins ≥ 3× its price, else the 황금 수박 씨앗
// when it costs less than the 2,400 melon). Stage 12: 잠수 one dive per look once the 조선소 is fixed (see diveChores).
'use strict';
process.env.TZ = 'Asia/Seoul';
const vm = require('node:vm');
const html = require('../build.js').build();
const NOEV = process.argv.includes('--noev'), NOBOOM = NOEV || process.argv.includes('--noboom'), NODAY = NOEV || process.argv.includes('--noday');
const FORCE_DAY = (process.argv.find((a) => a.startsWith('--day=')) || '').slice(6) || null;
let logicSrc = html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1];
if (NOBOOM) { const a = logicSrc; logicSrc = a.replace(/BOOM_P = [\d.]+/, 'BOOM_P = 0'); if (a === logicSrc) throw new Error('BOOM_P not found'); }
// --set=NAME=value (repeatable): try another number for a `var NAME = …` in the logic block
process.argv.filter((a) => a.startsWith('--set=')).forEach((a) => {
  const [k, v] = a.slice(6).split('='), b = logicSrc; logicSrc = b.replace(new RegExp('\\b' + k + ' = [^,;]+'), k + ' = ' + v); if (b === logicSrc) throw new Error(k + ' not found');
});
vm.runInThisContext(logicSrc, { filename: 'logic.js' });
const L = globalThis.Logic;

const TZ = 540, MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
// --weeks=N: start N weeks later (week 1 is summer; --weeks=3 starts in spring), to see a season-gated goal fall elsewhere
const START = new Date(2026, 10, 2 + 7 * +((process.argv.find((a) => a.startsWith('--weeks=')) || '=0').split('=')[1]), 0, 0).getTime();   // Monday 2026-11-02 00:00 KST
const ARGS = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DAYS = +(ARGS[1] || 14);
const NOMINI = process.argv.includes('--nomini');
const BUGHUNT_OFF = process.argv.includes('--nobughunt') || !!process.env.NOBUGHUNT;   // pick bug places at random, as before

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
  average: { delay: [0.2, 0.7], hi: 0.8, lo: 0.45, hook: 0.85, bug: 0.6, mini: { try: 0.5, z30: 0.7, z10: 0.35, heat: 0.6, pick: 0.5 } },
  skilled: { delay: [0.1, 0.35], hi: 0.85, lo: 0.35, hook: 0.95, bug: 0.8, mini: { try: 1, z30: 0.85, z10: 0.5, heat: 0.8, pick: 0.75 } }
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
  idler: { name: '구석 방치', skill: 'average', react: 0.15, jit: [13, 30], plan: [{ days: WEEKDAY, s: [[9, 18, 30, 3]] }] },
  active: { name: '열심', skill: 'skilled', react: 0.5, plan: [
    { days: WEEKDAY, s: [[9, 18, 10, 4], [20, 20.5, 10, 6], [22, 22.5, 10, 6]] },
    { days: [0, 6], s: [[10, 10.5, 10, 6], [15, 15.5, 10, 6], [21, 21.5, 10, 6]] }] },
  lazy: { name: '하루 3번', skill: 'average', react: 0.3, jit: [23, 60], plan: [{ days: ALL, s: [[8.5, 8.67, 10, 5], [12.5, 12.67, 10, 5], [21, 21.17, 10, 5]] }] },
  // 하루 3번 but always on the hour, never later (no jit): what a strict routine sees of the game day
  fixed: { name: '같은 시각', skill: 'average', react: 0.3, plan: [{ days: ALL, s: [[9, 9.17, 10, 5], [13, 13.17, 10, 5], [18, 18.17, 10, 5]] }] }
};

// purchase priority: the first ungated item not owned is saved for; gated ones (★/house) are skipped for now
const PLAN = [
  ['up', 'rod'], ['seed', 'potato'], ['up', 'scare'], ['animal', 'hen'], ['up', 'field'], ['spot', 'river'], ['forest'], ['net'],
  ['up', 'bait'], ['seed', 'pepper'], ['house'], ['up', 'basket'], ['deco', 'flowers'], ['pet', 'dog'], ['orchard'], ['tree'], ['tree'], ['hive'], ['deco', 'mailbox'], ['animal', 'hen'], ['scope'], ['camera'], ['donkey'], ['bike'],
  ['up', 'rod'], ['up', 'scare'], ['animal', 'cow'], ['seed', 'tomato'], ['animal', 'duck'], ['furn', 'bed'], ['up', 'field'],
  ['tree'], ['tree'], ['hive'], ['up', 'bait'], ['seed', 'corn'], ['house'], ['tree'], ['tree'], ['deco', 'bench'], ['deco', 'tree'], ['spot', 'sea'], ['pick'], ['boat'], ['up', 'rod'],
  ['up', 'basket'], ['up', 'scare'], ['up', 'bait'], ['animal', 'hen'], ['animal', 'cow'], ['animal', 'duck'],
  // 옛 포구: each building is saved for only once its bundles are full (else skipped like a gated item).
  // 다리 before the 배 (cheap, and its bundles are the slow part); 조선소·어판장·기차역 after the 통통배, which earns
  // (먼바다·난바다 fish) where the 포구 only pays its small bundle coins; the 어판장 waits for winter fruit anyway.
  ['seed', 'pumpkin'], ['tree'], ['tree'], ['hive'], ['tree'], ['tree'], ['port'], ['house'], ['ship'], ['ship'], ['port'], ['port'], ['port'],
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
    case 'net': return L.netOk(s);
    case 'orchard': return L.orchardOk(s);
    case 'scope': return L.skyOk(s);
    case 'camera': return L.camOk(s);
    case 'pick': return L.caveOk(s);
    case 'boat': return L.isleOk(s);
    case 'donkey': return !!s.donkey;
    case 'bike': return L.bikeOk(s);
  }
  return false;
}
function buyNext(s, now, log) {
  const seen = {};
  for (const p of PLAN) {
    const key = p.join(':'); seen[key] = (seen[key] || 0) + 1;
    let cost, gated = false, done = false, label = key + (seen[key] > 1 ? '#' + seen[key] : '');
    let tree = null;
    if (p[0] === 'tree') {
      if (!s.orchard) continue;
      const planted = s.orchard.trees.filter((x) => x).map((x) => x.id);
      if (planted.length >= seen[key]) continue;
      tree = L.TREES.filter((d) => !planted.includes(d.id)).sort((a, b) => a.cost - b.cost)[0];
      if (!tree) continue; cost = tree.cost;
    } else if (p[0] === 'hive') { if (!s.orchard || L.hiveCount(s) >= seen[key]) continue; cost = L.hiveCost(s); if (cost === null) continue; }
    else if (p[0] === 'up') { if (L.tier(s, p[1]) >= seen[key]) continue; cost = L.upgradeCost(s, p[1]); if (cost === null) continue; }
    else if (p[0] === 'animal') { if ((s.animals[p[1]] || 0) >= seen[key]) continue; cost = L.animalCost(s, p[1]); if (cost === null) continue; gated = L.houseTier(s) < L.ANIMALS[p[1]].house; }
    else if (p[0] === 'ship') { if (L.shipTier(s) < 0 || L.shipTier(s) >= seen[key]) continue; const nx = L.shipNext(s); if (!nx) continue; cost = nx.coins; gated = L.shipStatus(s) === 'item'; label = 'ship:' + nx.id; }
    else if (p[0] === 'port') {
      const b = L.portNext(s); if (!b || !L.portShown(s) || L.PORT_BLDGS.indexOf(b) !== seen[key] - 1) continue;
      cost = b.coins; gated = !b.bundles.every((u) => L.portBundleDone(s, u.id)); label = 'port:' + b.id;
    }
    else if (p[0] === 'house') { if (L.houseTier(s) >= seen[key]) continue; const n = L.houseNext(s); if (!n) continue; cost = n.cost; gated = s.rep < n.rep; label = 'house:' + n.id; }
    else if (owned(s, p)) continue;
    else if (p[0] === 'seed') cost = L.seedCost(s, p[1]);
    else if (p[0] === 'spot') { cost = L.SPOTS[p[1]].cost; gated = s.rep < L.SPOTS[p[1]].rep; }
    else if (p[0] === 'deco') { cost = L.decoById(p[1]).cost; gated = L.decoCount(s) >= L.decoSlots(s); }
    else if (p[0] === 'furn') { cost = L.furnById(p[1]).cost; gated = L.houseTier(s) < L.furnById(p[1]).house; }
    else if (p[0] === 'forest') { cost = L.FOREST_COST; gated = s.rep < L.FOREST_REP; }
    else if (p[0] === 'pet') cost = L.PET_KINDS[p[1]].cost;
    else if (p[0] === 'net') cost = L.NET_COST;
    else if (p[0] === 'orchard') { cost = L.ORCHARD_COST; gated = s.rep < L.ORCHARD_REP; }
    else if (p[0] === 'scope') cost = L.SCOPE_COST;
    else if (p[0] === 'camera') cost = L.CAMERA_COST;
    else if (p[0] === 'pick') { cost = L.PICK_COST; gated = s.rep < L.CAVE_REP; }
    else if (p[0] === 'donkey') { cost = L.DONKEY_COST; gated = s.rep < L.DONKEY_REP; }
    else if (p[0] === 'bike') cost = L.BIKE_COST;
    else if (p[0] === 'boat') { cost = L.BOAT_FIX.coins; const st = L.boatStatus(s); gated = st === 'sea' || st === 'junk'; }
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
    else if (p[0] === 'net') done = L.buyNet(s).ok;
    else if (p[0] === 'orchard') done = L.unlockOrchard(s).ok;
    else if (p[0] === 'scope') done = L.buyScope(s).ok;
    else if (p[0] === 'camera') done = L.buyCamera(s).ok;
    else if (p[0] === 'pick') done = L.buyPick(s, now, s._rng).ok;
    else if (p[0] === 'boat') done = L.fixBoat(s).ok;
    else if (p[0] === 'ship') done = L.upgradeShip(s).ok;
    else if (p[0] === 'port') done = L.portBuild(s).ok;
    else if (p[0] === 'donkey') done = L.buyDonkey(s, '', now).ok;
    else if (p[0] === 'bike') done = L.buyBike(s).ok;
    else if (p[0] === 'hive') { done = L.buyHive(s, now).ok; label = 'hive' + seen[key]; }
    else if (p[0] === 'tree') { done = L.plantTree(s, s.orchard.trees.indexOf(null), tree.id, now).ok; label = 'tree' + seen[key]; }
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
  L.yardOf(s); s.born = START; s._rng = rng;
  const out = { events: {}, daily: [], spent: 0, fishTry: {}, fishOk: {}, earn: { raw: 0, order: 0, dish: 0, other: 0, forage: 0, pet: 0, junk: 0, fest: 0, mini: 0, orchard: 0, honey: 0, bug: 0, village: 0, flat: 0, cave: 0, sky: 0, isle: 0, islefish: 0, museum: 0, treasure: 0, shipfish: 0, far: 0, donkey: 0, bike: 0, ride: 0, contest: 0, toy: 0, quest: 0, port: 0, auction: 0, dive: 0 },
    portLooks: 0, aucN: 0, aucMul: 0, aucBase: 0, traderSpent: 0, traderN: 0, dives: 0, diveRooms: 0, diveSecs: 0, diveAt: {},
    bikeTry: 0, bikeClean: 0, bikeFlowers: 0, balRides: 0, sledRuns: 0, dkFed: 0, rides: 0, farN: 0,
    pieces: { junk: 0, cave: 0, drift: 0 }, rumorBy: {}, castMul: 0, castN: 0, boomLooks: 0, boomCalls: 0,
    bugTry: 0, bugOk: 0, vilPts: 0, cells: 0, digs: 0, trapN: 0, drift: 0, stars: 0, wishes: 0,
    orders: 0, dishes: 0, dailyPaid: 0, casts: 0, junk: {}, picks: 0, petGifts: 0, chests: 0,
    miniBy: { harvest: 0, forage: 0, heat: 0, pick: 0 }, castsEarly: 0, junkEarly: 0,
    contest: [], quests: [], animalV: 0, kidV: 0, toyTaps: 0, toyWins: 0, meets: 0, flowerSpent: 0, flowerPulls: 0, crosses: 0 };
  // new basket entries since n0 get a source tag (sold later under that source); overflow coins go to it now
  const tagNew = (n0, c0, src) => { for (let k = n0; k < s.bag.length; k++) s.bag[k].src = src; out.earn[src] += s.coins - c0; };
  const tAt = (t) => (t - START) / DAY;
  const log = (what, t) => { if (!(what in out.events)) out.events[what] = tAt(t); };
  const orderAge = {};
  let interval = 30 * MIN;

  // stage 8: the boom this player gets now and today's modifier ride along in env, like the UI's curEnv
  function env(t) { const e = L.fishEnv(t, TZ); e.boom = L.boomFor(s, t); e.day = L.dayId(s); return e; }
  function season(t) { return L.gameClock(t, TZ).season; }
  // what the 마을 asks for now: the story step's item and open errands → [[id, n]]
  function vilWants() {
    const w = [], st = L.storyNow(s);
    if (st && st.step.need) w.push(st.step.need);
    if (s.vil) Object.values(s.vil.err).forEach((e) => w.push([e.id, e.n]));
    return w;
  }
  function keepSet() {
    const keep = {};
    s.orders.forEach((q) => { if (q.o) keep[q.o.id] = Math.max(keep[q.o.id] || 0, q.o.n); });
    const r = targetDish();
    if (r) r.need.forEach((x) => { keep[x] = (keep[x] || 0) + 1; });
    vilWants().forEach(([id, n]) => { keep[id] = (keep[id] || 0) + n; });
    const lh = L.lighthouseStep(s); if (lh && lh.step.need) keep[lh.step.need[0]] = (keep[lh.step.need[0]] || 0) + lh.step.need[1];
    if (L.museumOk(s)) ['fish', 'mineral', 'sea'].forEach((r) => L.MUSEUM_ROOMS[r].ids.forEach((id) => { if (!L.museumGot(s, r, id)) keep[id] = (keep[id] || 0) + 1; }));
    L.CAVE_CRAFT.forEach((c) => { if (L.caveOk(s) && !(s.yard && s.yard.deco[c.id])) Object.keys(c.need).forEach((x) => { keep[x] = (keep[x] || 0) + c.need[x]; }); });
    const nx = L.shipNext(s); if (nx) nx.need.forEach(([id, n]) => { keep[id] = (keep[id] || 0) + n; });   // 배 materials
    if (s.donkey && s.donkey.fn < L.DONKEY_FEEDS_DAY) keep.potato = (keep.potato || 0) + 1;                 // one 먹이 on hand
    portWants().forEach((id) => { keep[id] = (keep[id] || 0) + 1; });                                     // 포구 bag slots
    portDishes().forEach((r) => r.need.forEach((x) => { keep[x] = (keep[x] || 0) + 1; }));               // and the dishes' parts
    aucWants().forEach((id) => { keep[id] = Math.max(keep[id] || 0, 1); });                               // 경매: the best one
    if (L.diveOk(s)) Object.keys(L.DIVE_GEAR).forEach((g) => { if (!(s.dive && s.dive.gear[g])) L.DIVE_GEAR[g].need.forEach(([id, n]) => { keep[id] = (keep[id] || 0) + n; }); });
    return keep;
  }
  // ---------- stage 11/12 helpers ----------
  // bag items the current 포구 building still wants (one each), the dishes of its cook bundle not in hand
  function portOpenSlots(kind) {
    const b = L.portShown(s) && L.portNext(s); if (!b) return [];
    const out2 = [];
    b.bundles.forEach((u) => { if (u.kind === kind) L.portSlots(u).forEach((id) => { if (!L.portGot(s, u.id, id)) out2.push(id); }); });
    return out2;
  }
  function portWants() { return portOpenSlots('bag'); }
  function portDishes() { return portWants().filter((id) => L.recipeById(id) && !L.bagCount(s, id)).map((id) => L.recipeById(id)).filter((r) => L.obtainable(s, r.id)); }
  function aucWants() { if (!L.aucOpen(s) || !s._t) return []; const a = s.port.auc && s.port.auc.wk === L.aucWeek(s._t, TZ) ? s.port.auc : null; return L.aucFish(s, s._t, TZ).filter((id) => !(a && a.sold[id])); }
  function sellExtra() {
    const keep = keepSet(), have = {}, aw = aucWants();
    aw.forEach((id) => { const k = L.aucBest(s, id); if (k > 0) s.bag.unshift(s.bag.splice(k, 1)[0]); });   // the kept one is the biggest
    s.bag = s.bag.filter((e) => {
      have[e.id] = (have[e.id] || 0) + 1;
      if (have[e.id] <= (keep[e.id] || 0)) return true;
      const kind = L.itemInfo(e.id).kind, extra = e.mini || 0;
      s.coins += e.v; out.earn[e.src || (kind === 'dish' ? 'dish' : kind === 'forage' ? 'forage' : kind === 'fruit' ? 'orchard' : kind === 'honey' ? 'honey' : kind === 'flat' ? 'flat' : kind === 'isle' ? 'isle' : kind === 'ore' || kind === 'gem' || kind === 'fossil' ? 'cave' : kind === 'dive' ? 'dive' : 'raw')] += e.v - extra; out.earn.mini += extra;
      if (extra) out.miniBy[kind === 'dish' ? 'heat' : kind === 'forage' ? 'forage' : 'harvest'] += extra; return false;
    });
  }
  // the one dish this player is working toward: best profit over selling the parts, all parts obtainable now
  // 계절 챌린지 goals of a kind not done yet
  function questTodo(k) { return s.quest ? L.questProgress(s).list.filter((g) => g.k === k && !g.done).map((g) => g.id) : []; }
  function targetDish() {
    return L.RECIPES.filter((r) => !r.hidden && L.obtainable(s, r.id) && r.need.every((x) => !L.CROPS[x] || L.cropSeasonOk(x, season(s._t))))
      .sort((a, b) => (b.sell - b.need.reduce((t, x) => t + L.itemInfo(x).price, 0)) - (a.sell - a.need.reduce((t, x) => t + L.itemInfo(x).price, 0)))[0];
  }
  function cropNeeds() {
    const need = {}, have = {};
    s.bag.forEach((e) => { have[e.id] = (have[e.id] || 0) + 1; });
    s.plots.forEach((p) => { if (p.crop) have[p.crop] = (have[p.crop] || 0) + 1; });
    s.orders.forEach((q) => { if (q.o && L.CROPS[q.o.id]) need[q.o.id] = (need[q.o.id] || 0) + q.o.n; });
    vilWants().forEach(([id, n]) => { if (L.CROPS[id]) need[id] = (need[id] || 0) + n; });
    questTodo('crop').forEach((id) => { if (L.cropSeasonOk(id, season(s._t))) need[id] = (need[id] || 0) + 1; });   // 계절 챌린지
    // the best known dish's crops (one batch)
    const best = targetDish();
    if (best) best.need.forEach((x) => { if (L.CROPS[x]) need[x] = (need[x] || 0) + 1; });
    portWants().forEach((id) => { if (L.CROPS[id] && L.cropSeasonOk(id, season(s._t))) need[id] = (need[id] || 0) + 1; });   // 포구 밭 꾸러미
    portDishes().forEach((r) => r.need.forEach((x) => { if (L.CROPS[x] && L.cropSeasonOk(x, season(s._t))) need[x] = (need[x] || 0) + 1; }));
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
      else if (i < 2 && !s.dex.goldSeed && archId !== 'lazy' && archId !== 'fixed' && ok(i === 0 ? 'berry' : 'melon')) id = i === 0 ? 'berry' : 'melon';
      else { const k = wish.findIndex(ok); if (k >= 0) id = wish.splice(k, 1)[0]; else id = bestPlain(); }
      if (id) L.plant(s, i, id, t, se);
    });
  }
  function fishSpot(t) {
    const d = new Date(t), e = env(t), spots = L.SPOT_IDS.filter((id) => L.spotUnlocked(s, id)).concat(L.isleOk(s) ? ['island'] : [], ['offshore', 'ocean'].filter((id) => L.spotUnlocked(s, id)));
    const want = {}; s.orders.forEach((q) => { if (q.o && L.fishById(q.o.id)) want[q.o.id] = 1; });
    vilWants().forEach(([id, n]) => { if (L.fishById(id) && L.bagCount(s, id) < n) want[id] = 1; });
    questTodo('fish').forEach((id) => { want[id] = 1; });
    aucWants().forEach((id) => { if (!L.bagCount(s, id)) want[id] = 1; });   // 경매 species not in hand count ×3, like an order
    // 포구: a bundle fish not in hand that bites somewhere right now → go there (the bundle shows which and the 도감 hint where)
    const pw = portWants().concat(...portDishes().map((r) => r.need)).filter((id, k, a) => L.fishById(id) && L.bagCount(s, id) < a.filter((x) => x === id).length);
    for (const sp of spots) { s.spot = sp; if (L.availableFish(d, s, e).some((f) => pw.includes(f.id))) { out.portLooks++; return; } }
    let best = null, bestV = -1;
    if (e.boom && e.boom.kind === 'storm' && spots.includes(e.boom.place)) { s.spot = e.boom.place; out.boomLooks++; return; }   // the chip says where
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
  // the same look fits more casts when the wait is shorter (입질 폭풍 here, 입질 좋은 날): wait + ~20 s for reel and recast
  function castsFor(t, casts) {
    const e = env(t), half = () => 0.5, base = (20e3 + 0.5 * 70e3) * L.UPG.bait.wait[L.tier(s, 'bait')];
    if (!L.cast(s, t, half, 0, 0, e)) return casts;
    const w = s.fish.biteAt - t; L.reelIn(s);
    const m = (base + 20e3) / (w + 20e3), x = casts * m;
    out.castMul += m; out.castN++;
    return Math.floor(x) + (rng() < x - Math.floor(x) ? 1 : 0);
  }
  function goFish(t, casts) {
    fishSpot(t);
    casts = castsFor(t, casts);
    for (let c = 0; c < casts; c++) {
      out.casts++; if (t < START + 3 * DAY) out.castsEarly++;
      if (rng() > skill.hook) continue;
      // 시계 물고기: a look at real hh:00 sometimes has its first bite land on the hour
      const roll = (c === 0 && new Date(t).getMinutes() === 0 && rng() < 0.3 && L.clockRoll(new Date(t), rng)) || L.rollFish(new Date(t), rng, s, env(t));
      const f = L.fishById(roll.id);
      const jk = L.rollJunk(roll, rng);
      if (jk) {
        const c0 = s.coins, r = L.landJunk(s, jk, rng);
        out.earn.junk += s.coins - c0; out.junk[jk] = (out.junk[jk] || 0) + 1; if (t < START + 3 * DAY) out.junkEarly++;
        mapPiece('junk', t); if (jk === 'letter') rumor('letter', null, t);
        if (r.letter && !r.reread) [3, 6, 9, 12].forEach((n) => { if (L.lettersFound(s) >= n) log('letters' + n, t); });
        continue;
      }
      out.fishTry[f.rarity] = (out.fishTry[f.rarity] || 0) + 1;
      if (!reelFish(roll, L.tier(s, 'rod'), skill, rng)) continue;
      out.fishOk[f.rarity] = (out.fishOk[f.rarity] || 0) + 1;
      const n0 = s.bag.length, r = L.landFish(s, roll);
      const src = f.fest ? 'fest' : f.spot === 'island' ? 'islefish' : f.spot === 'offshore' || f.spot === 'ocean' ? 'shipfish' : null;
      if (src) { out.earn[src] += r.sold; if (s.bag.length > n0) s.bag[n0].src = src; } else out.earn.raw += r.sold;
      if (f.rarity === '전설') log('legend:' + f.id, t);
      L.contestCatch(s, roll, t, TZ);
    }
  }
  function checkIn(t, casts, lastOfDay) {
    s._t = t;
    L.ensureDaily(s, dateKey(t));
    if (!NODAY) { L.ensureDay(s, dateKey(t)); if (FORCE_DAY) s.day.f = FORCE_DAY; }
    L.advance(s, t, TZ);
    contestChores(t);
    s.plots.forEach((p, i) => { if (p.crow) L.shoo(s, i, t); if (p.weed) L.pullWeed(s, i, t); });
    festChores(t);
    L.refreshOrders(s, t, rng);
    while (L.potReady(s, t)) {
      const mult = tryMini() && rng() < M.heat ? L.HEAT_BONUS : 1, n0 = s.bag.length, r = L.takeDish(s, t, mult);
      const extra = Math.round(L.itemInfo(r.id).price * mult) - L.itemInfo(r.id).price;
      out.dishes++;
      if (r.sold) { out.earn.dish += r.sold - extra; out.earn.mini += extra; out.miniBy.heat += extra; } else if (s.bag.length > n0) s.bag[n0].mini = extra;
    }
    if (L.productsWaiting(s) || s.animals.hen + s.animals.duck + s.animals.cow) {
      const kidPart = {}; L.ANIMAL_IDS.forEach((id) => { const k = L.broodHeads(s, id, t), h = s.animals[id] + k; kidPart[id] = h ? k / h : 0; });
      const r = L.collectAnimals(s, t, rng); out.earn.raw += r.sold;
      r.items.forEach((pid) => { const v = L.itemInfo(pid).price, kind = pid === 'egg' ? 'hen' : pid === 'milk' ? 'cow' : 'duck'; out.animalV += v; out.kidV += v * kidPart[kind]; });
    }
    broodChores(t);
    if (portWants().length) sellExtra();   // room for a 포구 crop or fruit (the eggs since last time fill the basket)
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
    orchardChores(t);
    bugChores(t); if (L.dayIs(s, 'bugs')) bugChores(t);   // 곤충 잔치: they come twice as often
    flatChores(t);
    caveChores(t);
    skyChores(t);
    isleChores(t);
    farChores(t);
    donkeyChores(t);
    rideChores(t);
    gardenChores(t);
    toyChores(t);
    townChores(t);
    digMaps(t);
    // visitors: tap whoever is around, read mail
    L.tickVisitors(s, t, rng, TZ, 1).forEach(() => {});
    s.yard.vis.slice().forEach((v) => {
      if (v.id !== 'merchant') { const c0 = s.coins; if (L.tapVisitor(s, v.id, t, rng, TZ)) rumor('visitor', v.id, t); out.earn.other += s.coins - c0; }
      else rumor('visitor', 'merchant', t);          // the 상인 is tapped too (its shop opens), so its line is heard
    });
    { const c0 = s.coins; L.collectGifts(s); s.yard.mail.forEach((m, i) => L.readMail(s, i)); out.earn.other += s.coins - c0; }
    goFish(t, casts);
    museumChores(t);
    junkChores();
    // cook the best dish we can (keeping order items), before delivering so dish orders can use it later
    deliverAll(t);
    villageChores(t);
    portDishes().forEach((r) => { if (L.canCook(s, r.id)) L.cook(s, r.id, t); });   // 포구 요리 꾸러미 first
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
    portChores(t);
    auctionChores(t);
    traderChores(t);
    diveChores(t);
    sellExtra();
    if (L.dailyDone(s) && !s.daily.paid) { const r = L.claimDaily(s); out.earn.other += r.coins; out.dailyPaid++; }
    questChores(t);
    const c0 = s.coins;
    buyNext(s, t, (w) => log(w, t));
    plantAll(t, lastOfDay);
    out.spent += c0 - s.coins;
    L.checkMilestones(s);
    [5, 8, 12, 20, 25, 40].forEach((r) => { if (s.rep >= r) log('rep' + r, t); });
    let all = [9, 9, 9, 9, 9];
    L.RESIDENTS.forEach((x) => { const lv = L.friendLevel(s, x.id); for (let k = 1; k <= lv; k++) log('lv' + k + 'any', t); all = all.map((a, k) => Math.min(a, lv >= k ? 1 : 0)); });
    for (let k = 1; k <= 4; k++) if (all[k]) log('lv' + k + 'all', t);
    if (L.fruitDexCount(s) >= L.TREES.length) log('fruitAll', t);
    if (L.honeyDexCount(s) >= L.HONEYS.length / 2) log('honeyHalf', t);
    if (L.bugDexCount(s) >= L.BUGS.length / 2) log('bugHalf', t);
    if (L.STORIES.every((x) => L.storyDone(s, x.id))) log('storiesAll', t);
  }
  function orchardChores(t) {
    if (!s.orchard) return;
    L.orchardTick(s, t, TZ); L.hiveTick(s, t, TZ, rng);
    s.orchard.trees.forEach((p, k) => { if (p && p.n) { const n0 = s.bag.length, c0 = s.coins; L.pickFruit(s, k, t, TZ); tagNew(n0, c0, 'orchard'); } });
    if (s.bees) s.bees.hives.forEach((h, k) => { if (h.jar.length) { const n0 = s.bag.length, c0 = s.coins; L.collectHoney(s, k, t, TZ, rng); tagNew(n0, c0, 'honey'); } });
  }
  // one insect shows up per look; the player tries for it (skill.bug = how often the tap lands while it sits)
  function bugChores(t) {
    if (!L.netOk(s)) return;
    const places = ['farm', 'yard'].concat(L.forestOk(s) ? ['forest'] : [], L.orchardOk(s) ? ['orchard'] : [], ['deep', 'peak'].filter((p) => L.rideOk(s, p)));
    const qb = questTodo('bug'), qp = places.filter((p) => qb.some((id) => L.BUGS.some((b) => b.id === id && (b.at || []).includes(p))));
    // a museum collector (박물관 open) looks where a bug it still lacks can show up right now
    const e = env(t), mp = L.museumOk(s) && !BUGHUNT_OFF ? places.filter((p) => L.bugPool(p, e, s).some((x) => !(s.bugs && s.bugs.dex[x.id]))) : [];
    const pl = qp.length ? qp : mp.length ? mp : places;   // a 챌린지 bug still to see: look where it lives
    const id = L.rollBug(pl[Math.floor(rng() * pl.length)], e, rng, s);
    if (!id) return;
    out.bugTry++;
    if (rng() > skill.bug) return;
    out.bugOk++;
    const c = L.catchBug(s, id);
    if (c.first && !c.boxed) L.keepBug(s, id); else out.earn.bug += L.releaseBug(s, id);
  }
  // 마을: talk to everyone home, give each a liked item (else the cheapest spare one), do errands and story steps
  function villageChores(t) {
    if (!L.villageOk(s)) return;
    const addUps = (ups) => (ups || []).forEach((u) => { out.earn.village += u.coins + (u.gift ? u.gift.coins : 0); });
    for (const id of L.VIL_IDS.concat(L.RES_EXTRA.map((r) => r.id).filter((id) => L.resMoved(s, id)))) {
      if (L.residentAway(id, t, TZ)) continue;
      const f0 = L.friendPoints(s, id);
      for (let k = 0; k < 6; k++) {
        const cur = L.storyNow(s);
        if (!cur || cur.step.at !== id || (cur.step.need && L.bagCount(s, cur.step.need[0]) < cur.step.need[1])) break;
        const c0 = s.coins, r = L.storyStep(s, id, t, TZ); if (!r.ok) break;
        out.earn.village += s.coins - c0 - (r.ups || []).reduce((a, u) => a + u.coins + (u.gift ? u.gift.coins : 0), 0); addUps(r.ups);
        if (r.done) log('story:' + r.story, t);
      }
      if (L.canTalk(s, id, t, TZ)) { const r = L.vilTalk(s, id, t, TZ); addUps(r.ups); if (r.ok) rumor('res', id, t); }
      const e = L.errandFor(s, id, t, TZ);
      if (e && L.bagCount(s, e.id) >= e.n) { const r = L.errandDone(s, id, t, TZ); if (r.ok) { out.earn.village += r.coins; addUps(r.ups); } }
      if (L.canGift(s, id, t, TZ) && s.bag.length) {
        const keep = keepSet(), spare = s.bag.filter((x) => L.bagCount(s, x.id) > (keep[x.id] || 0));
        const like = spare.find((x) => L.giftKind(id, x.id) === 'like');
        const cheap = spare.filter((x) => L.giftKind(id, x.id) === 'ok').sort((a, b) => a.v - b.v)[0];
        const g = like || (cheap && cheap.v <= 150 ? cheap : null);
        if (g) addUps(L.vilGift(s, id, g.id, t, TZ).ups);
      }
      out.vilPts += L.friendPoints(s, id) - f0;
    }
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
    const keyOpen = L.portShown(s) && !L.portDone(s, 'shipyard') && !L.portGot(s, 'junk', 'key');   // 포구 잡동사니 꾸러미 wants one 열쇠
    L.RECYCLE.forEach((r) => { while (L.canRecycle(s, r.id) === 'ok' && !(r.id === 'chest' && keyOpen && L.junkCount(s, 'key') < 3)) { L.recycle(s, r.id); if (r.id !== 'chest') log('recycle:' + r.id, t0()); } });
    while (s.junk.box > 0) {
      const tier = tryMini() && rng() < M.pick ? 1 : 0, c0 = s.coins, r = L.openChest(s, rng, tier);
      out.chests++;
      const got = s.coins - c0, extra = tier ? (r.kind === 'deco' ? got : got / 2) : 0;
      out.earn.junk += got - extra; out.earn.mini += extra; out.miniBy.pick += extra;
      if (r.kind === 'deco') log('treasure:' + r.id, t0());
    }
    if (!L.isleOk(s)) return;           // scrap is kept for the 섬 boat until it is fixed
    L.SCRAP_IDS.forEach((id) => {
      if (id === 'key' || (!L.portDone(s, 'shipyard') && ['boot', 'can', 'bottle'].includes(id) && !L.portGot(s, 'junk', id))) return;   // 포구 잡동사니 꾸러미
      if (L.RECYCLE.every((r) => !r.need[id] || (s.yard && s.yard.deco[r.id]))) out.earn.junk += L.sellScrap(s, id);
    });
  }
  const t0 = () => s._t;
  // ---------- stage 8 ③: 보물 지도 and 소문 ----------
  function mapPiece(src, t) {
    const r = L.tmapDrop(s, src, rng);
    if (!r) return;
    out.pieces[src]++; log('piece1', t);
    if (r.complete) { log('mapDone1', t); if (L.TMAPS.every((m) => L.tmapComplete(s, m.id))) log('mapsDone', t); }
  }
  // every finished map is dug at the first look where its time/weather/tide rule holds (the player goes there)
  function digMaps(t) {
    const e = clockEnv(t);
    L.TMAPS.forEach((m) => {
      if (!L.tmapComplete(s, m.id) || L.tmapDug(s, m.id)) return;
      const env8 = { phase: e.phase, weather: e.weather, low: m.scene === 'flat' && L.flatOk(s) && !!L.tideAt(t, TZ).low };
      if (!L.tmapCondOk(m, env8)) return;
      const c0 = s.coins, r = L.tmapDig(s, m.scene, m.x, m.y, env8);
      if (!r.ok) return;
      out.earn.treasure += s.coins - c0;              // gold seeds pay later as 황금 수박 (그냥 팔기)
      log('map:' + m.id, t); log('dug1', t);
      if (L.tmapDugCount(s) >= L.TMAPS.length) log('mapsAll', t);
    });
  }
  function rumor(src, who, t) {
    const r = L.rumorHear(s, src, who, rng);
    if (!r) return;
    out.rumorBy[r.id] = tAt(t);
    if (L.RUMORS.filter((x) => x.src === src).every((x) => L.rumorHeard(s, x.id))) log('rumor:' + src, t);
    if (L.rumorCount(s) >= L.RUMORS.length) log('rumorAll', t);
    if (L.rumorCount(s) * 2 >= L.RUMORS.length) log('rumorHalf', t);
  }
  // ---------- stage 7 ----------
  function clockEnv(t) { const c = L.gameClock(t, TZ); return { season: c.season, phase: c.phase, weather: L.weatherAt(t, TZ) }; }
  // 갯벌: at low tide dig every spot (도전 like the 숲) and haul the traps; at high tide set them
  function flatChores(t) {
    if (!L.flatOk(s)) return;
    const td = L.tideAt(t, TZ);
    sellExtra();                         // keep room in the basket, so a first find (for the 박물관) is not sold on the spot
    if (!td.low) { for (let k = 0; k < L.TRAP_N; k++) L.setTrap(s, k, t, TZ, td); return; }
    L.flatSpots(s, t, TZ, td).forEach(({ k, id }) => {
      const f = L.flatById(id), won = tryMini() && rng() < zoneWin(M, L.CH_ZONE[f.rarity]);
      const n0 = s.bag.length, c0 = s.coins, r = L.digFlat(s, k, t, rng, won);
      if (!r) return;
      out.digs++;
      if (r.n > 1) { const x = f.price * (r.n - 1); out.earn.mini += x; out.miniBy.forage += x; out.earn.flat -= x; }
      tagNew(n0, c0, 'flat');
    });
    for (let k = 0; k < L.TRAP_N; k++) { const n0 = s.bag.length, c0 = s.coins, r = L.pullTrap(s, k, t, rng, TZ, td); if (r) { out.trapN += r.got.length; tagNew(n0, c0, 'flat'); } }
    if (L.flatDexCount(s) >= L.FLAT.length) log('flatAll', t);
  }
  // 동굴: spend all the energy, glinting cells first; craft the ore decorations
  function caveChores(t) {
    if (!L.caveOk(s)) return;
    const e = clockEnv(t);
    sellExtra();
    while (L.caveEnergy(s, t).n >= 1) {
      let k = s.cave.wall.indexOf(2); if (k < 0) k = s.cave.wall.indexOf(1);
      const won = tryMini() && rng() < zoneWin(M, 0.18);
      const n0 = s.bag.length, c0 = s.coins, r = L.mineCell(s, k, t, rng, won, e);
      if (!r) break;
      mapPiece('cave', t);
      out.cells += r.more ? 2 : 1;
      tagNew(n0, c0, 'cave');
      if (r.done || (r.more && r.more.done)) { if (L.fossilCount(s) >= L.FOSSILS.length) log('fossilAll', t); }
    }
    L.CAVE_CRAFT.forEach((c) => { if (L.canCraft(s, c.id) === 'ok') { L.craftDeco(s, c.id); log('craft:' + c.id, t); } });
    if (L.fossilCount(s) >= 1) log('fossil1', t);
    if (L.fossilCount(s) >= L.FOSSILS.length / 2) log('fossilHalf', t);
  }
  // 별: one constellation per look at game night; the 유성우 wish when one is on
  function skyChores(t) {
    if (!L.skyOk(s)) return;
    const c0 = s.coins, e = clockEnv(t);
    if (e.phase === 'night') { L.seeStar(s, L.starFor(s, e.season, rng, L.rideOk(s, 'peak')), t); out.stars++; }
    if (L.meteorNight(t, TZ) && L.meteorWish(s, t, rng, TZ)) out.wishes++;
    out.earn.sky += s.coins - c0;
    if (L.skyDexCount(s) >= L.STARS.length) log('starsAll', t);
  }
  // 섬: pick up the drift and coconuts, mend the lighthouse
  function isleChores(t) {
    if (!L.isleOk(s)) return;
    sellExtra();                         // make room first so the coconuts and drift are not sold on the spot
    while (L.palmLeft(s, t, TZ) > 0) { const n0 = s.bag.length, c0 = s.coins; L.pickCoconut(s, t, TZ); tagNew(n0, c0, 'isle'); }
    L.tickIsle(s, t, clockEnv(t), rng);
    L.driftSpots(s, t).forEach((id, k) => {
      if (!id) return;
      const n0 = s.bag.length, c0 = s.coins, r = L.pickDrift(s, k, t, rng);
      if (!r) return;
      out.drift++; tagNew(n0, c0, 'isle');
      mapPiece('drift', t); if (L.driftById(r.id).special === 'letter') rumor('letter', null, t);
      if (r.letter) [3, 6, 9, 12].forEach((n) => { if (L.lettersFound(s) >= n) log('letters' + n, t); });
    });
    for (let k = 0; k < 6; k++) {
      const st = L.lighthouseStep(s);
      if (!st || (st.step.need && L.bagCount(s, st.step.need[0]) < st.step.need[1])) break;
      const c0 = s.coins, r = L.advanceLighthouse(s); if (!r.ok) break;
      out.earn.isle += s.coins - c0; if (r.done) log('lit', t);
    }
  }
  // 박물관: give everything it can take as soon as it is in hand
  function museumChores(t) {
    if (!L.museumOk(s)) return;
    log('museumOpen', t);
    const c0 = s.coins;
    L.MUSEUM_ROOM_IDS.forEach((room) => { L.donatable(s, room).forEach((id) => { const r = L.donate(s, room, id); if (r.roomDone && r.reward) log('museum:' + room, t); if (r.allDone) log('museumAll', t); }); });
    out.earn.museum += s.coins - c0;
    const m = L.museumTotal(s);
    if (m.n * 2 >= m.m) log('museumHalf', t);
  }
  // ---------- stage 11: 옛 포구·경매·상인 ----------
  // put whatever the current building can take now (bag slots take the cheapest one, record slots are just checked)
  function portChores(t) {
    if (!L.portShown(s)) return;
    log('portOpen', t);
    const b = L.portNext(s); if (!b) return;
    b.bundles.forEach((u) => L.portSlots(u).forEach((id) => {
      if (L.portWhy(s, u.id, id) !== 'ok') return;
      const c0 = s.coins, r = u.kind === 'rec' ? L.portCheck(s, u.id) : L.portPut(s, u.id, id);
      if (r.ok) { out.earn.port += s.coins - c0; log('slot:' + id, t); }
    }));
    if (b.bundles.every((u) => L.portBundleDone(s, u.id))) log('bundles:' + b.id, t);
  }
  // 경매: the best one of each species is kept; it goes once it fetches ≥ ×2.6, or from Friday on (under 3 days left)
  function auctionChores(t) {
    if (!L.aucOpen(s)) return;
    const late = L.aucLeft(t, TZ) < 3 * DAY;
    aucWants().forEach((id) => {
      const k = L.aucBest(s, id); if (k < 0) return;
      const v = s.bag[k].v; if (L.aucMul(id, v) < 2.6 && !late) return;
      const r = L.aucSell(s, id, t, TZ);
      if (r.ok) { out.earn.auction += r.coins; out.aucN++; out.aucMul += r.mul; out.aucBase += v; log('auc1', t); }
    });
  }
  // 떠돌이 상인: a decoration not owned yet once coins ≥ 3× its price, else the gold seed if it pays (or gold was never had)
  function traderChores(t) {
    if (!L.traderOpen(s) || L.traderPicked(s, t, TZ)) return;
    for (const id of L.traderToday(s, t, TZ).sort((a, b) => (a === 'gold') - (b === 'gold'))) {
      const w = L.traderById(id);
      if (id === 'gold' ? s.dex.goldSeed && w.cost >= L.CROPS.gold.sell : s.coins < 3 * w.cost) continue;
      if (L.traderPick(s, id, t, TZ).ok) { out.traderSpent += w.cost; out.traderN++; out.spent += w.cost; break; }
    }
  }
  // ---------- stage 12: 잠수 ----------
  // One dive per look, always from r0 like the UI. Crossing a room costs DIVE_ROOM_S s (the UI swims 38 px/s, a room is
  // 180×200), each thing taken DIVE_THING_S s (a detour down to the floor). Oxygen drains 1/s; in a room with a bubble
  // spot the diver tops up when under half (+2 s). The dive ends when the oxygen runs out in a passage, or after DIVE_LEN s
  // (the player's patience; the spec says 1–3 min). Route: the nearest room not seen yet among the rooms the gear lets in
  // (BFS); with none left, the nearest room with something new or a gear material still short, else the nearest room with
  // anything to pick this dive. Gear is bought as soon as the coins (+80) and materials are in.
  const DIVE_ROOM_S = 6, DIVE_THING_S = 3, DIVE_LEN = { average: 120, skilled: 150 }[A.skill];
  function diveChores(t) {
    if (!L.diveOk(s)) return;
    log('diveOpen', t);
    Object.keys(L.DIVE_GEAR).forEach((g) => { const c = L.DIVE_GEAR[g].coins; if (s.coins - c >= 80 && L.diveBuy(s, g).ok) { out.spent += c; log('gear:' + g, t); } });
    const max = L.diveO2Max(s), taken = {};
    let o2 = max, time = 0, room = 'r0';
    const d = () => s.dive;
    const worth = (rid, k) => {
      if (taken[rid + ':' + k]) return false;
      const th = L.diveRoom(rid).things[k];
      if (th.id === 'key') return !d().gear.key;
      if (th.id === 'log') return !d().log[th.n];
      if (th.id === 'box') return !d().box[th.box];
      return L.diveDexById(th.id).kind === 'pick' || !d().got[th.id];
    };
    const short = {};   // gear materials still missing
    Object.keys(L.DIVE_GEAR).forEach((g) => { if (!d() || !d().gear[g]) L.DIVE_GEAR[g].need.forEach(([id, n]) => { short[id] = (short[id] || 0) + n; }); });
    const needed = (rid, k) => { const th = L.diveRoom(rid).things[k], x = L.diveDexById(th.id); return worth(rid, k) && (!x || x.kind === 'see' || L.bagCount(s, th.id) < (short[th.id] || 0)); };
    const refill = (rid) => { if (L.diveRoom(rid).bubbles.length && o2 < max / 2) { time += 2; o2 = max; } };
    const takeAll = (rid) => L.diveRoom(rid).things.forEach((th, k) => {
      if (o2 <= DIVE_THING_S || !worth(rid, k)) return;
      o2 -= DIVE_THING_S; time += DIVE_THING_S; taken[rid + ':' + k] = true;
      const n0 = s.bag.length, c0 = s.coins; L.diveTake(s, rid, k, rng); tagNew(n0, c0, 'dive');
    });
    L.diveEnter(s, room); out.dives++;
    refill(room); takeAll(room); refill(room);
    while (time < DIVE_LEN) {
      const prev = { [room]: null }, q = [room];
      let goal = null, want = null, alt = null;
      while (q.length) {
        const r = q.shift();
        Object.values(L.diveRoom(r).exits).forEach((n) => {
          if (n in prev || !L.diveCanEnter(s, n).ok) return;
          prev[n] = r; q.push(n);
          if (!goal && !d().seen[n]) goal = n;
          if (!want && L.diveRoom(n).things.some((x, k) => needed(n, k))) want = n;
          if (!alt && L.diveRoom(n).things.some((x, k) => worth(n, k))) alt = n;
        });
      }
      const to = goal || want || alt;
      if (!to) break;
      let next = to; while (prev[next] !== room) next = prev[next];
      o2 -= DIVE_ROOM_S; time += DIVE_ROOM_S;
      if (o2 <= 0) break;                                // out of air in the passage: up to the surface, nothing lost
      L.diveEnter(s, next); room = next; out.diveRooms++;
      refill(room); takeAll(room); refill(room);
    }
    out.diveSecs += time;
    const at = (k) => { log(k, t); if (!(k in out.diveAt)) out.diveAt[k] = out.dives; };   // which dive it came on
    if (d().gear.tank) at('gear:tank');
    if (d().gear.light) at('gear:light');
    if (d().gear.key) at('diveKey');
    [12, 24].forEach((n) => { if (L.diveSeenCount(s) >= n) at('diveMap' + n); });
    if (L.diveLogDone(s)) at('diveLog');
    if (L.diveDexCount(s) >= L.DIVE_DEX.length) at('diveDex');
  }
  // ---------- stage 9 ----------
  // 먼 섬: pick every drift spot (통통배)
  function farChores(t) {
    if (!L.farOk(s)) return;
    sellExtra();
    L.tickFar(s, t, clockEnv(t), rng);
    L.farSpots(s, t).forEach((id, k) => {
      if (!id) return;
      const n0 = s.bag.length, c0 = s.coins, r = L.pickFar(s, k, t, rng);
      if (r) { out.farN++; tagNew(n0, c0, 'far'); }
    });
    if (L.farDexCount(s) >= L.FAR_DRIFT.length) log('farAll', t);
  }
  // 당나귀: pet and feed up to the daily caps, then ride to every place the level allows and pick it clean
  function donkeyChores(t) {
    if (!s.donkey) return;
    for (let k = 0; k < 4; k++) L.donkeyPet(s, t, TZ);
    for (let k = 0; k < 4; k++) {
      const f = L.donkeyFood(s); if (f && portWants().includes(f) && L.bagCount(s, f) <= 1) break;   // it would eat a 포구 item: wait
      const r = L.donkeyFeed(s, t, TZ); if (!r || !r.ok) break; out.dkFed++;
    }
    for (let lv = 1; lv <= L.donkeyLevel(s); lv++) log('dk' + lv, t);
    const e = env(t); e.wet = e.weather === 'rain' || L.rainJustStopped(t, TZ);
    ['deep', 'peak'].forEach((pl) => {
      if (!L.rideOk(s, pl)) return;
      sellExtra();
      L.tickRide(s, pl, t, e, rng);
      s.donkey[pl].forEach((p, k) => {
        if (!p.id) return;
        const f = L.forageById(p.id), won = tryMini() && rng() < zoneWin(M, L.CH_ZONE[f.rarity]);
        const n0 = s.bag.length, c0 = s.coins, r = L.pickRide(s, pl, k, t, rng, won);
        if (!r) return;
        out.rides++;
        if (r.n > 1) { const x = f.price * (r.n - 1); out.earn.mini += x; out.miniBy.forage += x; out.earn.donkey -= x; }
        tagNew(n0, c0, 'donkey');
      });
    });
    const mine = L.FORAGE.filter((f) => f.place === 'deep' || f.place === 'peak');
    if (mine.every((f) => s.forest && s.forest.dex[f.id])) log('rideForageAll', t);
  }
  // 자전거: aim each jump a little before the obstacle (or into a flower when it does not get in the way), with reaction noise
  const BIKE_HAND = { average: { sd: 0.13, lapse: 0.04 }, skilled: { sd: 0.08, lapse: 0.01 } }[A.skill];
  const gauss = () => { let u = 0; for (let k = 0; k < 6; k++) u += rng(); return (u - 3) * Math.SQRT2; };
  function bikeRide() {
    const lay = L.bikeLayout(rng), taps = [];
    let air = -9;
    lay.forEach((e, k) => {
      const aim = e.kind === 'flower' ? e.t - 0.3 : e.t - 0.35;
      if (aim < air + L.BIKE_JUMP) return;                       // already in the air
      if (e.kind === 'flower') {                                   // skip a flower that would block the next jump
        const nx = lay.slice(k + 1).find((x) => x.kind !== 'flower');
        if (nx && nx.t - 0.35 < aim + L.BIKE_JUMP + 0.1) return;
      } else if (rng() < BIKE_HAND.lapse) return;
      const t = Math.max(0, aim + gauss() * BIKE_HAND.sd);
      taps.push(t); air = t;
    });
    return L.bikeRun(lay, taps);
  }
  // 열기구 (a look inside a window rides) and 겨울 썰매 (first winter look of a day)
  const SKY_HAND = { average: 0.75, skilled: 0.92 }[A.skill], SLED_MISS = { average: 0.2, skilled: 0.08 }[A.skill];
  let sledDay = -1;
  function rideChores(t) {
    if (!L.villageOk(s)) return;
    const c0 = s.coins;
    if (L.balloonCan(s, t).ok) {
      L.balloonStart(s, t); out.balRides++;
      const lay = L.balloonLayout(clockEnv(t), rng), seen = lay.filter(() => rng() < SKY_HAND).map((e) => e.id);
      const r = L.balloonFinish(s, seen);
      if (r.all) log('skyAll', t);
      [6, 12].forEach((n) => { if (L.sightCount(s) >= n) log('sky' + n, t); });
    }
    const dk = Math.floor(tAt(t));
    if (L.sledCan(s, t, TZ).ok && sledDay !== dk) {
      sledDay = dk; out.sledRuns++;
      const fw = L.festivalAt(t, TZ), lay = L.sledLayout(rng, !!(fw && fw.id === 'winter'));
      const run = { bumps: 0, flakes: 0 };
      lay.forEach((e) => { if (e.kind === 'flake') { if (rng() < 0.5) run.flakes++; } else if (rng() < SLED_MISS) run.bumps++; });
      run.time = Math.min(L.SLED_MAX, Math.round((L.SLED_TIME + run.bumps * L.SLED_BUMP - run.flakes * L.SLED_FLAKE) * 10) / 10);
      L.sledFinish(s, run, t, fw);
    }
    out.earn.ride += s.coins - c0;
  }
  // ---------- stage 10 ----------
  // 낚시 대회: the week is settled on the first look of the next week (catches go in from goFish)
  function contestChores(t) {
    const c0 = s.coins; L.contestTick(s, t, TZ); out.earn.contest += s.coins - c0;
    const n = L.contestNews(s);
    if (n) { out.contest.push({ wk: n.wk, tier: n.tier || null, f: n.best.f, mark: n.mark.f, lv: s.cont.lv }); if (n.tier) log('contestWin', t); if (n.tier === 'gold') log('contestGold', t); }
    if (L.contestOk(s)) log('contestOpen', t);
  }
  // 꽃밭: the children a pair can have (crossChild with forced rolls) → [id, p]
  const kidMemo = {};
  function kidsOf(a, b) {
    const key = a + '|' + b; if (kidMemo[key]) return kidMemo[key];
    const m = {};
    [0.25, 0.75].forEach((r1) => [0.1, 0.6].forEach((r2) => { const q = [r1, r2]; let i = 0; const id = L.crossChild(a, b, () => q[i++]); m[id] = (m[id] || 0) + 0.25; }));
    return (kidMemo[key] = Object.entries(m));
  }
  const PAT_RANK = { plain: 0, stripe: 1, dot: 1, rim: 2, double: 2, night: 3 };
  // how good a pair is: chance of a new flower, plus a little for a patterned child that can still lead somewhere new
  function pairValue(a, b) {
    const g = s.garden, miss = (id) => !g.dex[id];
    const higher = (pat) => L.FLOWERS.some((f) => miss(f.id) && PAT_RANK[f.pat] > PAT_RANK[pat]);
    return kidsOf(a, b).reduce((v, [id, p]) => { const f = L.flowerById(id); return v + p * (miss(id) ? 1 : f.pat !== 'plain' && higher(f.pat) ? 0.15 : 0); }, 0);
  }
  // keep ≥2 empty slots for buds; pull what makes nothing new; plant a seed where it pairs well
  function gardenChores(t) {
    if (!L.gardenOk(s)) return;
    const g = L.gardenOf(s);
    const born = L.gardenTick(s, t, rng); out.crosses += born.length;
    if (L.flowerDexCount(s) >= L.FLOWERS.length) { log('flower24', t); log('flowerNight', t); return; }   // all found: the bed is left as it is
    const bed = g.bed, N = L.GARDEN_N;
    const used = () => bed.map((p, k) => p ? k : -1).filter((k) => k >= 0);
    const empties = () => bed.filter((p) => !p).length;
    const score = (k) => {
      let v = 0;
      L.gardenNeighbors(k).forEach((m) => { if (bed[m]) v = Math.max(v, pairValue(bed[k].id, bed[m].id)); });
      used().forEach((j) => { if (j !== k) v = Math.max(v, 0.5 * pairValue(bed[k].id, bed[j].id)); });
      L.FLOWER_SHAPES.forEach((sh) => { v = Math.max(v, 0.5 * pairValue(bed[k].id, sh.id + '_plain')); });
      if (bed.some((p, j) => p && j !== k && p.id === bed[k].id)) v *= 0.5;     // a twin is the first to go
      return v;
    };
    // 1. first visit: one of each shape in the middle 2×2
    if (!used().length) { [1, 2, 5, 6].forEach((k, i) => { if (L.plantFlower(s, k, L.FLOWER_SHAPES[i].id, t).ok) out.flowerSpent += L.FLOWER_SEED_COST; }); return; }
    // 2. pull what makes nothing new
    used().forEach((k) => { if (bed[k] && score(k) < 0.02) { L.pullFlower(s, k); out.flowerPulls++; } });
    // 3. plant a seed where it pairs well with a neighbour (a shape not seen yet counts as new by itself),
    //    keeping two slots free for buds; with no free slot to spare, one weak flower may make way (once a look)
    const plantVal = (k) => {
      let best = null, bv = 0;
      L.FLOWER_SHAPES.forEach((sh) => {
        let v = 0; L.gardenNeighbors(k).forEach((m) => { if (bed[m]) v = Math.max(v, pairValue(sh.id + '_plain', bed[m].id)); });
        if (!g.dex[sh.id + '_plain']) v += 1;
        if (v > bv) { bv = v; best = sh.id; }
      });
      return [best, bv];
    };
    const plant = (k, sh) => { if (L.plantFlower(s, k, sh, t).ok) out.flowerSpent += L.FLOWER_SEED_COST; };
    for (let k = 0; k < N && empties() > 2; k++) { if (bed[k]) continue; const [sh, v] = plantVal(k); if (sh && v >= 0.2) plant(k, sh); }
    if (empties() <= 2) {
      let pick = null;
      for (let k = 0; k < N; k++) { if (bed[k]) continue; const [sh, v] = plantVal(k); if (sh && v >= 0.2 && (!pick || v > pick[2])) pick = [k, sh, v]; }
      const weak = pick && used().filter((j) => !L.gardenNeighbors(pick[0]).includes(j) && L.flowerBloom(bed[j], t)).sort((a, b) => score(a) - score(b))[0];
      if (weak !== undefined && weak !== null && score(weak) < pick[2] * 0.5) { L.pullFlower(s, weak); out.flowerPulls++; plant(pick[0], pick[1]); }
    }
    // 4. make room for buds: the weakest go
    while (empties() < 2) { const k = used().sort((a, b) => score(a) - score(b))[0]; L.pullFlower(s, k); out.flowerPulls++; }
    const n = L.flowerDexCount(s);
    [8, 12, 16, 20, 24].forEach((x) => { if (n >= x) log('flower' + x, t); });
    if (L.FLOWERS.filter((f) => f.pat === 'night').every((f) => g.dex[f.id])) log('flowerNight', t);
  }
  function broodChores(t) {
    L.ANIMAL_IDS.forEach((id) => { if (s.animals[id]) log('have:' + id, t); });
    L.broodTick(s, t, rng).forEach((kid) => { log('baby:' + kid.kind, t); log('baby1', t); });
    if (s.brood) L.ANIMAL_IDS.forEach((id) => { if (L.broodHeads(s, id, t)) log('grown:' + id, t); });
  }
  // 날씨 장난감: casual hands play now and then (a few taps), keen ones every look
  const TOY_TAPS = { average: 3, skilled: 6 }[A.skill];
  function toyChores(t) {
    const e = clockEnv(t);
    ['splash', 'step', 'leaves'].forEach((kind) => {
      if (!L.toyOn(kind, e) || NOMINI || rng() >= M.try) return;
      for (let k = 0; k < TOY_TAPS; k++) {
        out.toyTaps++;
        const c0 = s.coins, n0 = s.bag.length, r = L.toyPlay(s, kind, t, TZ, rng, false).reward;
        if (!r) continue;
        out.toyWins++; tagNew(n0, c0, 'toy');
      }
    });
  }
  // 계절 챌린지: card per week; the result of the old card is kept when a new week starts
  function questChores(t) {
    const w = L.questWeek(t, TZ);
    if (s.quest && s.quest.w !== w) { const p = L.questProgress(s); out.quests.push({ w: s.quest.w, n: p.n, ok: s.quest.ok, miss: p.list.filter((g) => !g.done).map((g) => g.k + ':' + g.id) }); }
    L.questEnsure(s, t, TZ);
    const c0 = s.coins, r = L.questClaim(s);
    if (r) { out.earn.quest += s.coins - c0; log('quest1', t); }
  }
  // 주민들의 하루: greet everyone out on the street; new residents move in when their goal is met
  function townChores(t) {
    if (!L.villageOk(s)) return;
    L.townArrive(s).forEach((id) => log('move:' + id, t));
    L.VIL_IDS.concat(L.RES_EXTRA.map((r) => r.id)).forEach((id) => {
      if (!L.resHere(s, id) || !L.residentPlace(id, t, TZ)) return;
      const r = L.townMeet(s, id, t, TZ);
      if (r.ok && !r.again) { out.meets++; r.ups.forEach((u) => { out.earn.village += u.coins + (u.gift ? u.gift.coins : 0); }); }
    });
  }
  function deliverAll(t) {
    for (let k = 0; k < s.orders.length; k++) {
      const o = s.orders[k] && s.orders[k].o, r = L.deliver(s, k, t, rng);
      if (r && L.bikeOk(s) && tryMini()) { const run = bikeRide(); out.bikeTry++; if (!run.crash) { out.bikeClean++; out.bikeFlowers += run.flowers; } out.earn.bike += L.bikeFinish(s, r.coins, run).tip; }
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
    const jit = A.jit ? ((day * A.jit[0]) % A.jit[1]) * MIN : 0;
    sessions.forEach((ss, si) => {
      const [h0, h1, every, casts] = ss;
      interval = every * MIN;
      let t = d0 + h0 * HOUR + jit;
      const end = d0 + h1 * HOUR + jit;
      L.resume(s, t, rng);
      while (t <= end) {
        checkIn(t, casts, si === sessions.length - 1 && t + every * MIN > end);
        const nx = t + every * MIN;
        if (nx <= end) {
          // a boom starting before the next look: the title/chip may bring the player in a minute later
          const w = L.boomNext(t + 1), tb = w && w.start + MIN;
          if (w && tb > t && tb < nx && L.boomFor(s, tb) && rng() < A.react) { between(t, tb); checkIn(tb, casts, false); out.boomCalls++; between(tb, nx); }
          else between(t, nx);
        }
        t = nx;
      }
    });
    if (L.festivalAt(d0 + 12 * HOUR, TZ)) (out.festDays = out.festDays || []).push(day);
    out.daily.push({ fest: out.earn.fest, letters: L.lettersFound(s), forage: L.forageDexCount(s), coins: s.coins, rep: s.rep, house: L.houseTier(s), dex: dexPct(s), earned: s.coins + out.spent,
      museum: L.museumTotal(s).n, fossil: L.fossilCount(s), stars: L.skyDexCount(s) });
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
  'forest', 'pet:dog', 'net', 'orchard', 'tree10', 'hive3', 'fruitAll', 'honeyHalf', 'bugHalf', 'lv1any', 'lv2any', 'lv4any', 'lv2all', 'lv4all', 'story:scarf', 'storiesAll', 'pet:cat', 'fest:spring', 'fest:summer', 'fest:autumn', 'fest:winter', 'forageHalf', 'ginseng', 'letters3', 'letters6', 'letters12', 'recycle:canchime', 'treasure:anchor',
  'rep8', 'rep40', 'scope', 'camera', 'pick', 'boat', 'museumOpen', 'lit', 'fossil1', 'fossilHalf', 'fossilAll', 'starsAll', 'flatAll', 'craft:orelamp', 'craft:geode',
  'museum:fish', 'museum:bug', 'museum:fossil', 'museum:mineral', 'museum:star', 'museum:sea', 'museumHalf', 'museumAll',
  'ship:sail', 'ship:motor', 'legend:marlin', 'legend:oarfish', 'farAll', 'donkey', 'dk1', 'dk2', 'dk3', 'rideForageAll', 'bike', 'sky6', 'sky12', 'skyAll',
  'piece1', 'mapDone1', 'dug1', ...L.TMAPS.map((m) => 'map:' + m.id), 'mapsDone', 'mapsAll', 'rumorHalf', 'rumor:res', 'rumor:letter', 'rumor:visitor', 'rumorAll',
  'contestOpen', 'contestWin', 'contestGold', 'flower8', 'flower12', 'flower16', 'flower20', 'flower24', 'flowerNight', 'have:hen', 'baby:hen', 'have:duck', 'baby:duck', 'have:cow', 'baby:cow', 'baby1',
  'quest1', 'move:archaeo', 'move:seagirl', 'move:botanist',
  'portOpen', 'bundles:bridge', 'port:bridge', 'bundles:shipyard', 'port:shipyard', 'bundles:market', 'port:market', 'bundles:station', 'port:station', 'auc1',
  'diveOpen', 'diveKey', 'gear:tank', 'gear:light', 'diveMap12', 'diveMap24', 'diveLog', 'diveDex'];
const SRC = [['raw', '그냥 팔기'], ['order', '주문'], ['dish', '요리'], ['other', '기타'], ['forage', '숲'], ['pet', '반려'], ['junk', '잡동사니'], ['fest', '축제'], ['mini', '도전 덤'], ['orchard', '과일'], ['honey', '꿀'], ['bug', '곤충'], ['village', '마을'], ['flat', '갯벌'], ['cave', '동굴'], ['sky', '별'], ['islefish', '섬 물고기'], ['isle', '섬 줍기'], ['museum', '박물관'], ['treasure', '보물'], ['shipfish', '먼바다 물고기'], ['far', '먼 섬'], ['donkey', '깊은 숲·산꼭대기'], ['bike', '자전거 팁'], ['ride', '열기구·썰매'], ['contest', '낚시 대회'], ['toy', '날씨 장난감'], ['quest', '계절 챌린지'], ['port', '포구 꾸러미'], ['auction', '경매'], ['dive', '잠수']];

function reelTable() {
  const rng = mulberry(42), rows = [];
  L.FISH.filter((f) => f.rarity === '전설').map((f) => f.id).concat(['salmon', 'yellowtail', 'carp', 'catfish', 'crucian']).forEach((id) => {
    const f = L.fishById(id), row = [f.name + ' (' + f.rarity + ', 힘 ' + f.power + ', ' + L.temperName(id) + ')'];
    for (const sk of ['average', 'skilled']) for (let rt = 0; rt <= 3; rt++) {
      let ok = 0; const N = 3000;
      for (let k = 0; k < N; k++) ok += reelFish({ id, size: f.min + (f.max - f.min) * Math.pow(rng(), 1.6) }, rt, SKILL[sk], rng) ? 1 : 0;
      row.push(Math.round(ok / N * 100) + '%');
    }
    rows.push(row);
  });
  console.log('\n릴 성공률 (보통 손 낚싯대 0·1·2·3단 | 능숙 0·1·2·3단)');
  rows.forEach((r) => console.log('  ' + r.join(' | ')));
}

if (require.main === module) {
  const seeds = +(ARGS[0] || 5);
  if (!process.argv.includes('--noreel')) reelTable();
  for (const id of Object.keys(ARCH)) {
    const runs = []; for (let k = 1; k <= seeds; k++) runs.push(run(id, k));
    console.log('\n== ' + ARCH[id].name + ' (' + id + ') · ' + seeds + '판 중앙값 ==');
    console.log('  해금: ' + KEYS.map((k) => k + ' ' + fmtDay(median(runs.map((r) => r.events[k])))).join(' · '));
    const D = [0, 1, 2, 4, 6, 9, 13, 20, 27, 34].filter((d) => d < DAYS);
    console.log('  일차   ' + D.map((d) => String(d + 1).padStart(9)).join(''));
    for (const f of ['earned', 'coins', 'rep', 'house', 'dex', 'forage', 'letters', 'museum', 'fossil', 'stars']) console.log('  ' + f.padEnd(6) + D.map((d) => String(median(runs.map((r) => r.daily[d][f]))).padStart(9)).join(''));
    const r0 = runs[0], s = r0.final;
    const sum = {}; SRC.forEach(([k]) => { sum[k] = runs.reduce((a, r) => a + r.earn[k], 0); });
    const tot = SRC.reduce((a, [k]) => a + sum[k], 0);
    console.log('  수입 비중(' + seeds + '판 합): ' + SRC.map(([k, n]) => n + ' ' + (sum[k] / tot * 100).toFixed(1) + '%').join(' · ') + '  | 도전 덤 = 도전 없이 번 돈의 +' + (sum.mini / (tot - sum.mini) * 100).toFixed(1) + '%');
    const casts = runs.reduce((a, r) => a + r.casts, 0), junkN = runs.reduce((a, r) => a + Object.values(r.junk).reduce((x, y) => x + y, 0), 0);
    console.log('  잡동사니: ' + (casts / Math.max(1, junkN)).toFixed(1) + '번 던질 때 하나 · 판당 ' + Math.round(junkN / seeds) + '개 (편지 ' + Math.round(runs.reduce((a, r) => a + (r.junk.letter || 0), 0) / seeds) + ' · 상자 ' + Math.round(runs.reduce((a, r) => a + r.chests, 0) / seeds) + ') · 하루 ' + Math.round(casts / seeds / DAYS) + '번 던짐 | 숲 줍기 하루 ' + Math.round(runs.reduce((a, r) => a + r.picks, 0) / seeds / DAYS) + '번 · 반려 선물 하루 ' + (runs.reduce((a, r) => a + r.petGifts, 0) / seeds / DAYS).toFixed(1) + '개');
    const mb = {}; runs.forEach((r) => Object.keys(r.miniBy).forEach((k) => { mb[k] = (mb[k] || 0) + r.miniBy[k]; }));
    console.log('  도전 덤 나눔: ' + Object.keys(mb).map((k) => k + ' ' + (mb[k] / (tot - sum.mini) * 100).toFixed(1) + '%').join(' · ') + ' | 처음 3일 잡동사니 ' + (runs.reduce((a, r) => a + r.castsEarly, 0) / Math.max(1, runs.reduce((a, r) => a + r.junkEarly, 0))).toFixed(1) + '번에 하나');
    const dayE = (r, d) => r.daily[d].earned - (d ? r.daily[d - 1].earned : 0);
    const fd = runs.map((r) => (r.festDays || []).map((d) => (r.daily[d].fest - (d ? r.daily[d - 1].fest : 0)) / (dayE(r, d) || 1)));
    console.log('  축제 날 그날 수입 중 축제 몫: ' + fd.map((x) => x.map((v) => Math.round(v * 100) + '%').join('/')).join(' · '));
    console.log('  주문 ' + r0.orders + '건 · 요리 ' + r0.dishes + '번 · 할 일 보상 ' + r0.dailyPaid + '/' + DAYS + ' (1판)');
    console.log('  곤충 잡기 ' + runs.reduce((a, r) => a + r.bugOk, 0) + '/' + runs.reduce((a, r) => a + r.bugTry, 0) + ' · 마을 친밀도 하루 주민당 ' + (runs.reduce((a, r) => a + r.vilPts, 0) / seeds / DAYS / 6).toFixed(2) + '점 · 과일 도감 ' + L.fruitDexCount(s) + '/' + L.TREES.length + ' · 꿀 ' + L.honeyDexCount(s) + '/' + L.HONEYS.length + ' · 곤충 ' + L.bugDexCount(s) + '/' + L.BUGS.length + ' (1판)');
    console.log('  주민 친밀도(1판): ' + L.RESIDENTS.map((x) => x.id + ' ' + L.friendLevel(s, x.id)).join(' · '));
    console.log('  도감(1판): 작물 ' + Object.keys(s.dex.crops).length + '/' + Object.keys(L.CROPS).length + ' · 물고기 ' + DEX_FISH.filter((f) => s.dex.fish[f.id]).length + '/' + DEX_FISH.length + ' · 요리 ' + Object.keys(s.dex.dish).length + '/' + L.RECIPES.length + ' · 채집 ' + L.forageDexCount(s) + '/' + L.FORAGE.length + ' · 편지 ' + L.lettersFound(s) + '/12 · 업그레이드 ' + JSON.stringify(s.up));
    console.log('  7단계(판 평균, 하루): 갯벌 캐기 ' + (runs.reduce((a, r) => a + r.digs, 0) / seeds / DAYS).toFixed(1) + ' · 통발 ' + (runs.reduce((a, r) => a + r.trapN, 0) / seeds / DAYS).toFixed(1) + ' · 동굴 칸 ' + (runs.reduce((a, r) => a + r.cells, 0) / seeds / DAYS).toFixed(1) + ' · 표류물 ' + (runs.reduce((a, r) => a + r.drift, 0) / seeds / DAYS).toFixed(1) + ' · 별 ' + (runs.reduce((a, r) => a + r.stars, 0) / seeds / DAYS).toFixed(1) + ' · 소원 ' + (runs.reduce((a, r) => a + r.wishes, 0) / seeds / DAYS).toFixed(2));
    console.log('  박물관(1판): ' + L.MUSEUM_ROOM_IDS.map((k) => { const c = L.museumCount(s, k); return k + ' ' + c.n + '/' + c.m; }).join(' · ') + ' · 갯벌 도감 ' + L.flatDexCount(s) + '/' + L.FLAT.length + ' · 섬 ' + L.isleDexCount(s) + '/' + L.DRIFT.length);
    // which ids each museum room still lacks at the end, over all runs (id×runs missing it); '·' when every run has it
    console.log('  박물관 빠진 것(' + seeds + '판): ' + ['bug', 'fish'].map((room) => { const miss = {}; runs.forEach((r) => L.MUSEUM_ROOMS[room].ids.forEach((id) => { if (!L.museumGot(r.final, room, id)) miss[id] = (miss[id] || 0) + 1; }));
      return room + ' ' + (Object.entries(miss).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + '×' + n).join(' ') || '·'); }).join(' | '));
    const mean = (f) => Math.round(runs.reduce((a, r) => a + f(r), 0) / seeds);
    const wk = [0, 1, 2, 3, 4].filter((w) => w * 7 + 6 < DAYS).map((w) => mean((r) => r.daily[w * 7 + 6].earned - (w ? r.daily[w * 7 - 1].earned : 0)));
    console.log('  8단계' + (NOBOOM || NODAY || FORCE_DAY ? '(' + process.argv.filter((a) => /^--(no|day)/.test(a)).join(' ') + ')' : '') + ': 주당 번 돈(판 평균) ' + wk.join(' / ') + ' · ' + DAYS + '일 번 돈 평균 ' + mean((r) => r.daily[DAYS - 1].earned) +
      ' · 던지기 배수 평균 ×' + (runs.reduce((a, r) => a + r.castMul, 0) / Math.max(1, runs.reduce((a, r) => a + r.castN, 0))).toFixed(3) + ' · 폭풍 낚시 ' + (runs.reduce((a, r) => a + r.boomLooks, 0) / seeds).toFixed(1) + '번/판 · 이벤트 보고 들어옴 ' + (runs.reduce((a, r) => a + r.boomCalls, 0) / seeds).toFixed(1) + '번/판');
    console.log('  지도 조각(판 평균): 고물 ' + (runs.reduce((a, r) => a + r.pieces.junk, 0) / seeds).toFixed(1) + ' · 동굴 ' + (runs.reduce((a, r) => a + r.pieces.cave, 0) / seeds).toFixed(1) + ' · 표류물 ' + (runs.reduce((a, r) => a + r.pieces.drift, 0) / seeds).toFixed(1) +
      ' | 지도 전부 ' + runs.filter((r) => 'mapsAll' in r.events).length + '/' + seeds + '판 · 소문 전부 ' + runs.filter((r) => 'rumorAll' in r.events).length + '/' + seeds + '판 · 늦게 들은 소문(판 중앙값 일차): ' + L.RUMORS.map((x) => [x.id, median(runs.map((r) => r.rumorBy[x.id]))]).sort((a, b) => (b[1] === undefined ? 1e9 : b[1]) - (a[1] === undefined ? 1e9 : a[1])).slice(0, 6).map(([id, d]) => id + ' ' + fmtDay(d)).join(' · '));
    const sm = (f) => runs.reduce((a, r) => a + f(r), 0);
    console.log('  9단계: 자전거 ' + sm((r) => r.bikeClean) + '/' + sm((r) => r.bikeTry) + ' 무사(꽃 평균 ' + (sm((r) => r.bikeFlowers) / Math.max(1, sm((r) => r.bikeClean))).toFixed(2) + ') · 팁 = 주문 수입의 +' + (sum.bike / Math.max(1, sum.order) * 100).toFixed(1) + '% · 열기구 ' + (sm((r) => r.balRides) / seeds).toFixed(1) + '번/판 · 썰매 ' + (sm((r) => r.sledRuns) / seeds).toFixed(1) + '번/판 · 당나귀 먹이 ' + (sm((r) => r.dkFed) / seeds).toFixed(0) + '번/판 · 탈것 줍기 하루 ' + (sm((r) => r.rides) / seeds / DAYS).toFixed(1) + ' · 먼 섬 하루 ' + (sm((r) => r.farN) / seeds / DAYS).toFixed(1) + ' | 하늘 도감(1판) ' + L.sightCount(s) + '/' + L.SIGHTS.length);
    // ---------- stage 10 ----------
    const cs = [].concat(...runs.map((r) => r.contest)), tierN = (t) => cs.filter((c) => c.tier === t).length;
    const wkTot = (w) => mean((r) => r.daily[Math.min(DAYS, w * 7 + 7) - 1].earned - (w ? r.daily[w * 7 - 1].earned : 0));
    const nW = Math.floor(DAYS / 7), weekly = mean((r) => r.daily[nW * 7 - 1].earned) / nW;
    console.log('  10단계 대회: ' + cs.length + '주 참가 · 이김 ' + Math.round((cs.length - tierN(null)) / Math.max(1, cs.length) * 100) + '% (금 ' + tierN('gold') + ' · 은 ' + tierN('silver') + ' · 동 ' + tierN('bronze') + ' · 짐 ' + tierN(null) + ')' +
      ' · 내 최고 25·50·75% ' + [0.25, 0.5, 0.75].map((q) => { const v = cs.map((c) => c.f).sort((a, b) => a - b); return (v[Math.floor(q * v.length)] || 0).toFixed(3); }).join('·') + ' · 박 영감 중앙값 ' + (median(cs.map((c) => c.mark)) || 0).toFixed(3) + ' · 주차별 이김: ' +
      [...new Set(cs.map((c) => c.wk))].sort().map((w) => { const x = cs.filter((c) => c.wk === w); return x.filter((c) => c.tier).length + '/' + x.length; }).join(' '));
    const qs = [].concat(...runs.map((r) => r.quests)), missK = {};
    qs.filter((q) => !q.ok).forEach((q) => q.miss.forEach((m) => { const k = m.split(':')[0]; missK[k] = (missK[k] || 0) + 1; }));
    const missId = {}; qs.filter((q) => !q.ok).forEach((q) => q.miss.forEach((m) => { missId[m] = (missId[m] || 0) + 1; }));
    console.log('  10단계 챌린지: ' + qs.filter((q) => q.ok).length + '/' + qs.length + '주 완성 · 주차별 ' + [...new Set(qs.map((q) => q.w))].sort().map((w) => { const x = qs.filter((q) => q.w === w); return x.filter((q) => q.ok).length + '/' + x.length; }).join(' ') +
      ' · 못 채운 칸 종류 ' + JSON.stringify(missK) + ' · 자주 못 채운 것 ' + Object.entries(missId).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => k + '×' + n).join(' '));
    console.log('  10단계 꽃: 교배 ' + (sm((r) => r.crosses) / seeds).toFixed(0) + '번/판 · 뽑기 ' + (sm((r) => r.flowerPulls) / seeds).toFixed(0) + ' · 꽃씨 ' + (sm((r) => r.flowerSpent) / seeds).toFixed(0) + '코인/판 · 꽃 도감(판들) ' + runs.map((r) => L.flowerDexCount(r.final)).join(' ') +
      ' | 새끼: 동물 산물 중 새끼 몫 ' + (sm((r) => r.kidV) / Math.max(1, sm((r) => r.animalV)) * 100).toFixed(1) + '% · 동물 산물 = 전체 수입의 ' + (sm((r) => r.animalV) / tot * 100).toFixed(1) + '% · 새끼 몫 = 전체의 ' + (sm((r) => r.kidV) / tot * 100).toFixed(2) + '% · 새끼 수(판 평균) ' + (sm((r) => r.final.brood ? r.final.brood.kids.length : 0) / seeds).toFixed(1));
    console.log('  10단계 돈: 대회 ' + Math.round(sum.contest / seeds) + ' · 장난감 ' + Math.round(sum.toy / seeds) + ' (' + sm((r) => r.toyWins) + '/' + sm((r) => r.toyTaps) + ') · 챌린지 ' + Math.round(sum.quest / seeds) + ' 코인/판 = 합쳐 수입의 ' + ((sum.contest + sum.toy + sum.quest) / tot * 100).toFixed(2) + '% · 주 평균 수입 ' + weekly +
      ' · 주별 수입 ' + [0, 1, 2, 3, 4, 5, 6, 7].filter((w) => w < nW).map(wkTot).join(' / ') + ' · 길에서 만남 하루 ' + (sm((r) => r.meets) / seeds / DAYS).toFixed(1));
    // ---------- stage 11·12 ----------
    const md = (k) => fmtDay(median(runs.map((r) => r.events[k])));
    const gap = (a, b) => { const v = median(runs.map((r) => (a in r.events && b in r.events ? r.events[b] - r.events[a] : undefined))); return v === undefined ? '—' : v.toFixed(1) + '일'; };
    console.log('  11·12단계: 다리 ' + md('port:bridge') + ' · 조선소 ' + md('port:shipyard') + ' · 어판장 ' + md('port:market') + ' · 기차역 ' + md('port:station') + ' (다리→기차역 ' + gap('port:bridge', 'port:station') + ', 다 한 판 ' + runs.filter((r) => 'port:station' in r.events).length + '/' + seeds + ')' +
      ' · 돛배 ' + md('ship:sail') + ' · 통통배 ' + md('ship:motor') + ' | 잠수: 첫 ' + md('diveOpen') + ' · 열쇠 ' + md('diveKey') + ' · 12방 ' + md('diveMap12') + ' · 산소통 ' + md('gear:tank') + ' · 손전등 ' + md('gear:light') + ' · 24방 ' + md('diveMap24') + ' · 일지 ' + md('diveLog') + ' · 해저 도감 ' + md('diveDex') +
      ' (24방까지 ' + gap('diveOpen', 'diveMap24') + ', 다 한 판 ' + runs.filter((r) => 'diveMap24' in r.events).length + '/' + seeds + ') · 몇 번째 잠수에(중앙값): ' +
      ['diveKey', 'gear:tank', 'gear:light', 'diveMap24', 'diveLog', 'diveDex'].map((k) => k + ' ' + (median(runs.map((r) => r.diveAt[k])) || '—')).join(' · '));
    console.log('  11·12단계 돈: 포구 꾸러미 ' + Math.round(sum.port / seeds) + ' · 경매 ' + Math.round(sum.auction / seeds) + ' (' + (sm((r) => r.aucN) / seeds).toFixed(1) + '번/판, 평균 ×' + (sm((r) => r.aucMul) / Math.max(1, sm((r) => r.aucN))).toFixed(2) + ', 그냥 팔았으면 ' + Math.round(sm((r) => r.aucBase) / seeds) + ')' +
      ' · 잠수 ' + Math.round(sum.dive / seeds) + ' (' + (sm((r) => r.dives) / seeds).toFixed(0) + '번/판, 평균 ' + (sm((r) => r.diveSecs) / Math.max(1, sm((r) => r.dives))).toFixed(0) + '초·' + (sm((r) => r.diveRooms) / Math.max(1, sm((r) => r.dives))).toFixed(1) + '방) · 상인 ' + (sm((r) => r.traderN) / seeds).toFixed(1) + '번 ' + Math.round(sm((r) => r.traderSpent) / seeds) + '코인/판 · 코인/판 = 포구 꾸러미·경매·잠수 몫 ' +
      ['port', 'auction', 'dive'].map((k) => (sum[k] / tot * 100).toFixed(1) + '%').join('·') + ' (그냥 팔기 ' + (sum.raw / tot * 100).toFixed(1) + '%)');
    console.log('  낚시 성공(1판): ' + Object.keys(r0.fishTry).map((k) => k + ' ' + (r0.fishOk[k] || 0) + '/' + r0.fishTry[k]).join(' · '));
  }
}
module.exports = { run, reelFish, SKILL, L };
