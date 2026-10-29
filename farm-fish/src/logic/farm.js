  // ---------- farm: crops, seeds, plots, crows/weeds, gold cross-breeding ----------
  var CROPS = {
    radish: { id: 'radish', name: '무',      grow: 120e3,  cost: 10,  sell: 30 },
    berry:  { id: 'berry',  name: '딸기',    grow: 600e3,  cost: 40,  sell: 160 },
    melon:  { id: 'melon',  name: '수박',    grow: 4500e3, cost: 150, sell: 520 },
    gold:   { id: 'gold',   name: '황금 수박', grow: 4500e3, cost: 0,   sell: 2400, rare: true },
    potato: { id: 'potato', name: '감자',    grow: 300e3,  cost: 18,  sell: 60 },
    pepper: { id: 'pepper', name: '고추',    grow: 480e3,  cost: 30,  sell: 110 },
    tomato: { id: 'tomato', name: '토마토',  grow: 1200e3,  cost: 50,  sell: 210 },
    corn:   { id: 'corn',   name: '옥수수',  grow: 2400e3, cost: 70,  sell: 300 },
    pumpkin:{ id: 'pumpkin', name: '호박',   grow: 10800e3, cost: 300, sell: 1000 }
  };
  var BASE_SEEDS = ['radish', 'berry', 'melon'];
  var SEEDS = ['radish', 'potato', 'pepper', 'berry', 'tomato', 'corn', 'melon', 'pumpkin'];
  // new seeds open by 신뢰도 (★) or by paying in the shop, whichever comes first
  var SEED_UNLOCK = {
    potato:  { rep: 1,  cost: 100 },
    pepper:  { rep: 3,  cost: 400 },
    tomato:  { rep: 8,  cost: 1500 },
    corn:    { rep: 14, cost: 3000 },
    pumpkin: { rep: 24, cost: 8000 }
  };
  var N = 6, N_MAX = 9, COLS = 3;
  var CROW_MS = 60e3, CROW_LOSS = 0.3;
  var EVENT_MIN = 100e3, EVENT_SPAN = 140e3;     // one crow/weed every 100–240 s while something grows
  var CROSS_CHANCE = 0.12, CROSS_WINDOW = 300e3;
  var FERT_MUL = 2, FERT_COST = 40;

  function emptyPlot() { return { crop: null, progress: 0, t: 0, yieldMul: 1, weed: false, crow: null, fert: false, last: null }; }
  function isReady(p) { return !!p.crop && p.progress >= CROPS[p.crop].grow; }
  function stage(p) {
    if (!p.crop) return -1;
    if (isReady(p)) return 4;
    var f = p.progress / CROPS[p.crop].grow;
    return f < 0.1 ? 0 : f < 0.4 ? 1 : f < 0.75 ? 2 : 3;
  }
  function timeLeft(p) { return p.crop ? Math.max(0, (CROPS[p.crop].grow - p.progress) / (p.fert ? FERT_MUL : 1)) : 0; }
  // tzMin only picks the season for the rain odds; callers without it (harvest, shoo…) move a few ms at most
  function advancePlot(p, now, tzMin) {
    if (!p.crop) return null;
    var ev = null, dt = Math.max(0, now - p.t);
    if (dt < CROPS[p.crop].grow) dt += RAIN_BONUS * rainMs(now - dt, now, tzMin);   // rain: +10%
    p.t = now;
    if (p.crow && now >= p.crow.until) {
      p.yieldMul = Math.round(p.yieldMul * (1 - CROW_LOSS) * 1000) / 1000;
      p.crow = null; ev = 'crowAte';
    }
    if (!p.weed) p.progress = Math.min(CROPS[p.crop].grow, p.progress + dt * (p.fert ? FERT_MUL : 1));
    return ev;
  }
  function advance(s, now, tzMin) {
    var out = [];
    for (var i = 0; i < s.plots.length; i++) {
      var ev = advancePlot(s.plots[i], now, tzMin);
      if (ev) out.push({ type: ev, i: i });
    }
    return out;
  }
  // actScale stretches player-reaction windows (crow, bite, nibble) so they stay real-time under ?speed.
  function spawnEvent(s, now, rng, actScale) {
    actScale = actScale || 1;
    if (now < s.nextEventAt) return null;
    var c = [];
    s.plots.forEach(function (p, i) { if (p.crop && !isReady(p) && !p.weed && !p.crow) c.push(i); });
    if (!c.length) { s.nextEventAt = now + 20e3; return null; }
    s.nextEventAt = now + EVENT_MIN + rng() * EVENT_SPAN;
    var i = c[Math.floor(rng() * c.length)];
    if (rng() < 0.5) {
      var sc = UPG.scare.chance[tier(s, 'scare')];
      if (sc > 0 && rng() < sc) return { type: 'scared', i: i };
      s.plots[i].crow = { until: now + CROW_MS * actScale };
      return { type: 'crow', i: i };
    }
    s.plots[i].weed = true;
    return { type: 'weed', i: i };
  }
  // season: the UI's game season (seasonal seeds only go in during their season)
  function plant(s, i, id, now, season) {
    var p = s.plots[i];
    if (!p || p.crop || !CROPS[id] || (id !== 'gold' && !seedUnlocked(s, id))) return false;
    if (CROPS[id].season && !cropSeasonOk(id, seasonOf(now, season))) return false;
    if (id === 'gold') { if (s.seeds.gold < 1) return false; s.seeds.gold--; }
    else { if (s.coins < CROPS[id].cost) return false; s.coins -= CROPS[id].cost; }
    p.crop = id; p.progress = 0; p.t = now; p.yieldMul = 1; p.weed = false; p.crow = null; p.fert = false;
    return true;
  }
  function fertilize(s, i, now) {
    var p = s.plots[i];
    if (!p || !p.crop || s.items.fert < 1) return false;
    advancePlot(p, now);
    if (isReady(p) || p.fert) return false;
    p.fert = true; s.items.fert--;
    return true;
  }
  function shoo(s, i, now) {
    var p = s.plots[i]; advancePlot(p, now);
    if (!p.crow) return false;
    p.crow = null; return true;
  }
  function pullWeed(s, i, now) {
    var p = s.plots[i]; advancePlot(p, now);
    if (!p.weed) return false;
    p.weed = false; return true;
  }
  function neighbors(i, n) {
    n = n || N;
    var r = Math.floor(i / COLS), c = i % COLS, out = [];
    if (c > 0) out.push(i - 1);
    if (c < COLS - 1 && i + 1 < n) out.push(i + 1);
    if (r > 0) out.push(i - COLS);
    if (i + COLS < n) out.push(i + COLS);
    return out;
  }
  function harvest(s, i, now, rng) {
    var p = s.plots[i]; advancePlot(p, now);
    if (!isReady(p)) return null;
    var crop = p.crop, coins = Math.round(CROPS[crop].sell * p.yieldMul * marketMul(s, crop)), lost = p.yieldMul < 1;
    var sold = bagAdd(s, crop, coins);
    var boom = boomExtra(s, 'farm', now, 1);   // stage 8: 대풍년
    for (var b = 0; b < boom; b++) sold += bagAdd(s, crop, coins);
    s.dex.crops[crop] = (s.dex.crops[crop] || 0) + 1;
    dailyBump(s, 'harvest'); dailyBump(s, 'crop', crop);
    var gold = false;
    var partner = crop === 'berry' ? 'melon' : crop === 'melon' ? 'berry' : null;
    if (partner && neighbors(i, s.plots.length).some(function (j) {
      var q = s.plots[j];
      return (q.crop === partner && isReady(q)) || (q.last && q.last.crop === partner && now - q.last.t <= CROSS_WINDOW);
    })) {
      if (rng() < CROSS_CHANCE * (dayIs(s, 'gold') ? DAY_GOLD_MUL : 1)) { s.seeds.gold++; s.dex.goldSeed = true; gold = true; }
    }
    var e = emptyPlot(); e.last = { crop: crop, t: now };
    s.plots[i] = e;
    var out = { crop: crop, coins: coins, sold: sold, gold: gold, lost: lost };
    if (boom) out.boom = boom;
    return out;
  }

  function seedUnlocked(s, id) { return BASE_SEEDS.indexOf(id) >= 0 || !!(CROPS[id] && CROPS[id].season) || !!(SEED_UNLOCK[id] && s.seedOk && s.seedOk[id]); }
  function seedCost(s, id) { return SEED_UNLOCK[id] && !seedUnlocked(s, id) ? SEED_UNLOCK[id].cost : null; }
  function buySeed(s, id) {
    var c = seedCost(s, id);
    if (c === null || s.coins < c) return false;
    s.coins -= c; s.seedOk[id] = true;
    return true;
  }
  // seeds whose ★ threshold is now met; returns the newly opened ids
  function checkUnlocks(s) {
    var out = [];
    SEEDS.forEach(function (id) { var u = SEED_UNLOCK[id]; if (u && !s.seedOk[id] && s.rep >= u.rep) { s.seedOk[id] = true; out.push(id); } });
    return out;
  }

  expose({
    CROPS: CROPS, SEEDS: SEEDS, BASE_SEEDS: BASE_SEEDS, SEED_UNLOCK: SEED_UNLOCK, N: N, N_MAX: N_MAX, COLS: COLS,
    CROW_MS: CROW_MS, CROW_LOSS: CROW_LOSS, CROSS_CHANCE: CROSS_CHANCE, FERT_MUL: FERT_MUL, FERT_COST: FERT_COST,
    isReady: isReady, stage: stage, timeLeft: timeLeft, advance: advance, spawnEvent: spawnEvent,
    plant: plant, fertilize: fertilize, shoo: shoo, pullWeed: pullWeed, neighbors: neighbors, harvest: harvest,
    seedUnlocked: seedUnlocked, seedCost: seedCost, buySeed: buySeed, checkUnlocks: checkUnlocks
  });
