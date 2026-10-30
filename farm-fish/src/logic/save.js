  // ---------- state shape, load fix-ups, save encode/decode (all save compatibility lives here) ----------
  function newState(now, rng) {
    var plots = [];
    for (var i = 0; i < N; i++) plots.push(emptyPlot());
    var orders = [];
    for (var k = 0; k < ORDER_SLOTS; k++) orders.push({ o: null, at: 0 });
    return { v: 2, coins: 60, sel: 'radish', plots: plots, seeds: { gold: 0 },
      up: { rod: 0, bait: 0, field: 0, scare: 0, basket: 0 }, items: { fert: 0 }, ms: {},
      nextEventAt: now + 45e3 + rng() * 60e3, fish: { phase: 'idle' },
      dex: { crops: {}, fish: {}, goldSeed: false, dish: {} }, savedAt: now,
      bag: [], orders: orders, rep: 0, seedOk: {}, pot: null };
  }
  function resume(s, now, rng) {
    if (s.nextEventAt < now || s.nextEventAt > now + EVENT_MIN + EVENT_SPAN) s.nextEventAt = now + 30e3 + rng() * 60e3;
    if (s.fish.phase === 'reel') s.fish = { phase: 'idle' };
  }

  function encode(s) { return JSON.stringify(s); }
  function num(x) { return typeof x === 'number' && isFinite(x); }
  function decode(str) {
    try {
      if (typeof str !== 'string' || str.length > 200000) return null;
      var o = JSON.parse(str);
      if (!o || typeof o !== 'object' || (o.v !== 1 && o.v !== 2) || !num(o.coins) || o.coins < 0) return null;
      if (!Array.isArray(o.plots) || o.plots.length < N || o.plots.length > N_MAX) return null;
      var s = newState(0, function () { return 0; });
      s.coins = Math.floor(o.coins);
      if (o.up && typeof o.up === 'object') {
        UPG_IDS.forEach(function (k) { if (num(o.up[k])) s.up[k] = Math.max(0, Math.min(UPG[k].costs.length, Math.floor(o.up[k]))); });
      }
      // saves from before the shop have 6 plots; a longer list implies the field tier that holds it
      while (plotCount(s) < o.plots.length) s.up.field++;
      while (s.plots.length < plotCount(s)) s.plots.push(emptyPlot());
      if (SEEDS.indexOf(o.sel) >= 0 || o.sel === 'gold' || o.sel === 'fert') s.sel = o.sel;
      for (var i = 0; i < o.plots.length; i++) {
        var q = o.plots[i], p = s.plots[i];
        if (!q || typeof q !== 'object') return null;
        if (q.crop !== null && !CROPS[q.crop]) return null;
        if (q.crop) {
          if (!num(q.progress) || !num(q.t) || !num(q.yieldMul)) return null;
          p.crop = q.crop;
          p.progress = Math.max(0, Math.min(CROPS[q.crop].grow, q.progress));
          p.t = q.t;
          p.yieldMul = Math.max(0, Math.min(1, q.yieldMul));
          p.weed = q.weed === true;
          p.fert = q.fert === true;
          p.crow = q.crow && num(q.crow.until) ? { until: q.crow.until } : null;
        }
        if (q.last && CROPS[q.last.crop] && num(q.last.t)) p.last = { crop: q.last.crop, t: q.last.t };
      }
      if (o.seeds && num(o.seeds.gold) && o.seeds.gold >= 0) s.seeds.gold = Math.floor(o.seeds.gold);
      if (o.items && num(o.items.fert) && o.items.fert >= 0) s.items.fert = Math.floor(o.items.fert);
      if (o.ms && typeof o.ms === 'object') MILESTONES.forEach(function (m) { if (o.ms[m.id] === true) s.ms[m.id] = true; });
      if (num(o.nextEventAt)) s.nextEventAt = o.nextEventAt;
      if (num(o.savedAt)) s.savedAt = o.savedAt;
      var f = o.fish;
      if (f && f.phase === 'wait' && num(f.biteAt) && num(f.x) && num(f.y)) {
        s.fish = { phase: 'wait', x: f.x, y: f.y, biteAt: f.biteAt, nibAt: num(f.nibAt) ? f.nibAt : f.biteAt, nibEnd: 0 };
      } else if (f && f.phase === 'bite' && num(f.biteAt) && num(f.biteEnd) && num(f.x) && num(f.y) &&
               f.roll && fishById(f.roll.id) && num(f.roll.size)) {
        s.fish = { phase: 'bite', x: f.x, y: f.y, biteAt: f.biteAt, biteEnd: f.biteEnd, roll: { id: f.roll.id, size: f.roll.size } };
      }
      if (o.dex && typeof o.dex === 'object') {
        if (o.dex.crops && typeof o.dex.crops === 'object') {
          Object.keys(CROPS).forEach(function (k) { if (num(o.dex.crops[k]) && o.dex.crops[k] > 0) s.dex.crops[k] = Math.floor(o.dex.crops[k]); });
        }
        if (o.dex.fish && typeof o.dex.fish === 'object') {
          FISH.forEach(function (fd) {
            var e = o.dex.fish[fd.id];
            if (e && num(e.n) && num(e.best) && e.n > 0) s.dex.fish[fd.id] = { n: Math.floor(e.n), best: e.best };
          });
        }
        s.dex.goldSeed = o.dex.goldSeed === true;
        if (o.dex.dish && typeof o.dex.dish === 'object') {
          RECIPES.forEach(function (r) { if (num(o.dex.dish[r.id]) && o.dex.dish[r.id] > 0) s.dex.dish[r.id] = Math.floor(o.dex.dish[r.id]); });
        }
      }
      // stage 2: fishing spots (fields absent before stage 2 → 연못 only)
      if (o.spotOk && typeof o.spotOk === 'object') SPOT_IDS.forEach(function (k) { if (k !== 'pond' && o.spotOk[k] === true) { s.spotOk = s.spotOk || {}; s.spotOk[k] = true; } });
      if (typeof o.spot === 'string' && spotUnlocked(s, o.spot)) s.spot = o.spot;
      // v2 fields; a v1 save simply keeps the defaults from newState
      if (num(o.rep) && o.rep >= 0) s.rep = Math.floor(o.rep);
      if (o.seedOk && typeof o.seedOk === 'object') Object.keys(SEED_UNLOCK).forEach(function (k) { if (o.seedOk[k] === true) s.seedOk[k] = true; });
      if (Array.isArray(o.bag)) o.bag.forEach(function (e) {
        if (e && itemInfo(e.id) && num(e.v) && e.v >= 0 && s.bag.length < bagCap(s) + BAG_OVER) s.bag.push({ id: e.id, v: Math.round(e.v) });
      });
      if (o.noSell === true) s.noSell = true;
      if (o.keep && typeof o.keep === 'object') Object.keys(o.keep).forEach(function (k) { if (o.keep[k] === true && itemInfo(k)) { s.keep = s.keep || {}; s.keep[k] = true; } });
      if (Array.isArray(o.orders)) for (var k = 0; k < ORDER_SLOTS; k++) {
        var q = o.orders[k];
        if (!q || typeof q !== 'object') continue;
        var oo = q.o;
        if (oo && itemInfo(oo.id) && num(oo.n) && oo.n > 0 && num(oo.reward) && num(oo.rep)) {
          s.orders[k] = { o: { id: oo.id, n: Math.floor(oo.n), reward: Math.round(oo.reward), rep: Math.floor(oo.rep) }, at: 0 };
          if (oo.special === true) s.orders[k].o.special = true;
          if (typeof oo.by === 'string' && residentById(oo.by)) s.orders[k].o.by = oo.by;   // stage 10
          if (typeof oo.fest === 'string' && FESTIVALS[oo.fest]) s.orders[k].o.fest = oo.fest;   // stage 5B
        } else if (num(q.at)) s.orders[k] = { o: null, at: q.at };
      }
      if (o.pot && recipeById(o.pot.id) && num(o.pot.until)) s.pot = { id: o.pot.id, until: o.pot.until };
      decodeDonkey(o, s);  // stage 9 ②: s.donkey (당나귀, 깊은 숲·산꼭대기 자리; optional)
      decodeYard(o, s);   // stage 3: s.yard, s.animals (optional; absent in older saves)
      decodeStage4(o, s); // stage 4: s.born, s.nick, s.res, s.tank, s.daily (optional; needs the house tier above)
      decodeStage5A(o, s); // stage 5A: s.forest, s.pet (optional)
      decodeJunk(o, s);   // stage 5B: s.junk (잡동사니, 병 편지, 보물 상자; optional)
      decodeFest(o, s);   // stage 5B: s.fest (축제 선물, 송편, 눈사람; optional)
      decodeStage6A(o, s); // stage 6A: s.orchard, s.bees, s.bugs (optional)
      decodeVillage(o, s); // stage 6B: s.vil (마을 대화·선물·심부름·이야기; optional)
      decodeStage10B(o, s); // stage 10 ②: s.garden (꽃밭), s.brood (새끼), s.scare (허수아비 옷; optional)
      decodeTown(o, s);    // stage 10 ③: s.town (새 주민 이사, 길에서 만난 날; optional)
      decodeFlat(o, s); decodeCamera(o, s);   // stage 7 ①: s.flat (갯벌), s.cam (사진기; optional)
      decodeStage7B(o, s); // stage 7 동굴·별: s.cave, s.sky (optional)
      decodeIsland(o, s);  // stage 7: s.isle (섬: 배, 표류물, 야자수, 등대; optional) + the 섬 spot
      decodeMuseum(o, s);  // stage 7: s.museum (박물관 기증; optional)
      decodeStage8A(o, s); // stage 8 ①: s.day (오늘의 날), s.diary (일기; optional)
      decodeTreasure(o, s); // stage 8 ③: s.tmap (보물 지도 조각·판 곳), s.rumor (소문 수첩; optional)
      decodeShip(o, s);    // stage 9 ①: s.ship (돛배·통통배, 먼 섬; optional) + the 먼바다·난바다 spots
      decodeRide(o, s);    // stage 9 ③: s.bike (자전거), s.sled (썰매 기록), s.bal (열기구·하늘 도감; optional)
      decodeToys(o, s); decodeQuest(o, s);   // stage 10 ④: s.toy (장난감 보상 횟수), s.quest (계절 챌린지; optional)
      decodeStage10A(o, s); // stage 10 ①: s.cont (낚시 대회), s.yr (결산 카드), s.farm (농장 간판; optional; after decodeYard)
      decodePort(o, s);    // stage 11 ①: s.port got/done (옛 포구 꾸러미·복구; optional)
      decodeAuction(o, s); // stage 11 ②: s.port.auc (어판장 경매), s.trader (기차 상인; optional; after decodePort)
      decodeDive(o, s);    // stage 12 ③: s.dive (잠수: 밝힌 방, 해저 도감, 장비, 항해일지, 상자; optional)
      decodeMarket(o, s);  // 장터 시세: s.mkt (today's units sold per 종목; optional)
      decodeBank(o, s);    // 은행: s.bank (balance, last interest day; optional)
      decodeArcade(o, s);  // 게임장: s.arcade (오늘 상금 게임 횟수; optional)
      decodeGuide(o, s);   // 놀거리 수첩: s.guide (seen entries, scene tips; optional)
      // last: the basket again, now that every block that adds slots (house, 당나귀…) is known
      if (Array.isArray(o.bag)) {
        s.bag = [];
        o.bag.forEach(function (e) { if (e && itemInfo(e.id) && num(e.v) && e.v >= 0 && s.bag.length < bagCap(s) + BAG_OVER) s.bag.push({ id: e.id, v: Math.round(e.v) }); });
      }
      return s;
    } catch (e) { return null; }
  }

  expose({ newState: newState, resume: resume, encode: encode, decode: decode });
