  // ---------- 과수원 + 양봉 (stage 6A): fruit trees (s.orchard), beehives and honey (s.bees) ----------
  // A sapling becomes a tree over real days and never dies. A grown tree fruits only in its fruit season (game clock,
  // 1 season = 1 real week): ripe fruit hangs on it up to TREE_CAP (offline too) and waits for as long as you like.
  // Hives fill up by real time; each jar's honey is rolled from the flowers around at the moment it was made.
  var TREES = [
    { id: 'maesil',    name: '매실',   cost: 600,  grow: 1 * 86400e3, bloom: 'winter', fruit: 'spring', price: 70,  honey: 'maehwa',   hint: '늦겨울 매화 · 봄에 푸른 열매' },
    { id: 'apricot',   name: '살구',   cost: 900,  grow: 2 * 86400e3, bloom: 'winter', fruit: 'spring', price: 110, honey: 'maehwa',   hint: '이른 꽃 · 봄 끝에 노랗게' },
    { id: 'cherry',    name: '앵두',   cost: 700,  grow: 1 * 86400e3, bloom: 'spring', fruit: 'summer', price: 80,  honey: 'peachblossom', hint: '봄꽃 지고 여름에 빨간 알' },
    { id: 'peach',     name: '복숭아', cost: 1500, grow: 2 * 86400e3, bloom: 'spring', fruit: 'summer', price: 180, honey: 'peachblossom', hint: '분홍 꽃 · 한여름 단물' },
    { id: 'plum',      name: '자두',   cost: 1200, grow: 2 * 86400e3, bloom: 'spring', fruit: 'summer', price: 150, honey: 'peachblossom', hint: '여름 · 시큼달큼' },
    { id: 'apple',     name: '사과',   cost: 2000, grow: 3 * 86400e3, bloom: 'spring', fruit: 'autumn', price: 220, honey: 'appleblossom', hint: '봄에 흰 꽃 · 가을에 빨갛게' },
    { id: 'pear',      name: '배',     cost: 2400, grow: 3 * 86400e3, bloom: 'spring', fruit: 'autumn', price: 260, honey: 'appleblossom', hint: '가을 · 크고 시원한 열매' },
    { id: 'persimmon', name: '감',     cost: 1800, grow: 3 * 86400e3, bloom: 'summer', fruit: 'autumn', price: 200, honey: 'persimmonhoney', hint: '초여름 감꽃 · 가을 까치밥' },
    { id: 'tangerine', name: '귤',     cost: 3000, grow: 4 * 86400e3, bloom: 'summer', fruit: 'winter', price: 240, honey: 'citrus',  hint: '여름 꽃향 · 겨울에 주황빛' },
    { id: 'yuja',      name: '유자',   cost: 3600, grow: 4 * 86400e3, bloom: 'summer', fruit: 'winter', price: 300, honey: 'citrus',  hint: '겨울 · 향이 집 안 가득' }
  ];
  var TREE_BY = {};
  TREES.forEach(function (t) { TREE_BY[t.id] = t; });
  var ORCHARD_N = 10, ORCHARD_REP = 6, ORCHARD_COST = 1200, TREE_CAP = 4, FRUIT_EVERY = 3 * 3600e3;

  // honey: what the bees found around them. src = where the flowers are; the ??? hint says where to look
  var HONEYS = [
    { id: 'wildhoney',      name: '잡화꿀',     price: 120, src: 'any',     hint: '아무 꽃이나 · 벌통만 있으면' },
    { id: 'flowerbed',      name: '꽃밭꿀',     price: 170, src: 'yard',    hint: '마당 꽃밭이 피어 있을 때 (겨울 빼고)' },
    { id: 'rapehoney',      name: '유채꿀',     price: 190, src: 'field',   hint: '봄 · 밭에 무나 배추가 자랄 때' },
    { id: 'pumpkinhoney',   name: '호박꽃꿀',   price: 210, src: 'field',   hint: '여름 · 밭에 호박·오이·수박 꽃' },
    { id: 'acacia',         name: '아카시아꿀', price: 250, src: 'forest',  hint: '봄 숲의 하얀 꽃송이' },
    { id: 'chestnuthoney',  name: '밤꿀',       price: 290, src: 'forest',  hint: '여름 숲 · 밤꽃 냄새' },
    { id: 'asterhoney',     name: '들국화꿀',   price: 230, src: 'forest',  hint: '가을 숲길의 작은 국화' },
    { id: 'camelliahoney',  name: '동백꿀',     price: 330, src: 'forest',  hint: '겨울 숲 · 눈 속의 붉은 꽃' },
    { id: 'maehwa',         name: '매화꿀',     price: 340, src: 'orchard', hint: '겨울 과수원 · 매실·살구 꽃' },
    { id: 'peachblossom',   name: '복숭아꽃꿀', price: 300, src: 'orchard', hint: '봄 과수원 · 앵두·복숭아·자두 꽃' },
    { id: 'appleblossom',   name: '사과꽃꿀',   price: 320, src: 'orchard', hint: '봄 과수원 · 사과·배 꽃' },
    { id: 'persimmonhoney', name: '감꽃꿀',     price: 310, src: 'orchard', hint: '여름 과수원 · 감꽃' },
    { id: 'citrus',         name: '귤꽃꿀',     price: 360, src: 'orchard', hint: '여름 과수원 · 귤·유자 꽃' }
  ];
  var HONEY_BY = {};
  HONEYS.forEach(function (h) { HONEY_BY[h.id] = h; });
  var FOREST_HONEY = { spring: 'acacia', summer: 'chestnuthoney', autumn: 'asterhoney', winter: 'camelliahoney' };
  var FIELD_HONEY = { spring: ['rapehoney', ['radish', 'cabbage']], summer: ['pumpkinhoney', ['pumpkin', 'cucumber', 'melon']] };
  var HIVE_COSTS = [1500, 3000, 6000], HIVE_EVERY = 3 * 3600e3, HIVE_CAP = 3;

  // a few dishes from fruit and honey (ordinary recipes)
  var ORCHARD_RECIPES = [
    { id: 'applepie',    name: '사과파이',   need: ['apple', 'apple', 'egg'],          time: 600e3, sell: 720 },
    { id: 'gotgam',      name: '곶감',       need: ['persimmon', 'persimmon', 'persimmon'], time: 900e3, sell: 860 },
    { id: 'yujacha',     name: '유자차',     need: ['yuja', 'wildhoney'],             time: 300e3, sell: 560 },
    { id: 'maesilcheong', name: '매실청',    need: ['maesil', 'maesil', 'wildhoney'], time: 600e3, sell: 380 },
    { id: 'fruitpunch',  name: '과일화채',   need: ['peach', 'plum', 'milk'],         time: 420e3, sell: 560 },
    { id: 'honeycake',   name: '꿀카스텔라', need: ['wildhoney', 'egg', 'milk'],      time: 480e3, sell: 420 }
  ];
  ORCHARD_RECIPES.forEach(function (r) { RECIPES.push(r); });
  // the kid collects fruit, the chef cooks with honey: their orders get a resident
  RESIDENTS.forEach(function (r) { if (r.id === 'kid') r.kinds.push('fruit'); if (r.id === 'chef') r.kinds.push('honey'); });

  function treeById(id) { return TREE_BY.hasOwnProperty(id) ? TREE_BY[id] : null; }
  function honeyById(id) { return HONEY_BY.hasOwnProperty(id) ? HONEY_BY[id] : null; }
  function seasonAt(t, tz) { return gameClock(t, tz).season; }
  // real ms in [a, b) that fall in `season` (seasons turn on local Mondays)
  function seasonMs(a, b, season, tz) {
    var off = (tz || 0) * 60e3, tot = 0, t = a;
    while (t < b) {
      var wk = Math.floor((t + off - MON0) / WEEK_MS), end = Math.min(b, (wk + 1) * WEEK_MS + MON0 - off);
      if (SEASONS[((wk % 4) + 4) % 4] === season) tot += end - t;
      t = end;
    }
    return tot;
  }

  // ---------- orchard ----------
  function orchardOk(s) { return !!s.orchard; }
  function orchardStatus(s) { return s.orchard ? 'owned' : s.rep < ORCHARD_REP ? 'rep' : s.coins < ORCHARD_COST ? 'coins' : 'ok'; }
  function newOrchard() { var t = []; for (var k = 0; k < ORCHARD_N; k++) t.push(null); return { trees: t, dex: {} }; }
  function unlockOrchard(s) {
    var st = orchardStatus(s);
    if (st !== 'ok') return { ok: false, why: st };
    s.coins -= ORCHARD_COST; s.orchard = newOrchard();
    return { ok: true };
  }
  // 0 묘목, 1 어린 나무, 2 다 큰 나무
  function treeStage(p, now) {
    var d = treeById(p.id), f = (now - p.at) / d.grow;
    return f >= 1 ? 2 : f >= 0.4 ? 1 : 0;
  }
  function treeGrown(p, now) { return treeStage(p, now) === 2; }
  function plantTree(s, k, id, now) {
    var d = treeById(id);
    if (!s.orchard || !d || k < 0 || k >= ORCHARD_N) return { ok: false, why: 'none' };
    if (s.orchard.trees[k]) return { ok: false, why: 'owned' };
    if (s.coins < d.cost) return { ok: false, why: 'coins' };
    s.coins -= d.cost;
    s.orchard.trees[k] = { id: id, at: now, t: now, acc: 0, n: 0 };
    return { ok: true };
  }
  // ripe fruit by in-season time since the last look (only once grown); stops at TREE_CAP, the clock waits too
  function orchardTick(s, now, tz) {
    if (!s.orchard) return 0;
    var made = 0;
    s.orchard.trees.forEach(function (p) {
      if (!p) return;
      var d = treeById(p.id), from = Math.max(p.t, p.at + d.grow);
      if (p.n >= TREE_CAP || now <= from) { p.t = Math.max(p.t, now); if (p.n >= TREE_CAP) p.acc = 0; return; }
      from = Math.max(from, now - 5 * WEEK_MS);       // far enough back to fill any tree
      p.acc += seasonMs(from, now, d.fruit, tz);
      p.t = now;
      while (p.acc >= FRUIT_EVERY && p.n < TREE_CAP) { p.acc -= FRUIT_EVERY; p.n++; made++; }
      if (p.n >= TREE_CAP) p.acc = 0;
    });
    return made;
  }
  function fruitWaiting(s) { var n = 0; if (s.orchard) s.orchard.trees.forEach(function (p) { if (p) n += p.n; }); return n; }
  // tap a tree: its ripe fruit into the basket (overflow is sold by bagAdd)
  function pickFruit(s, k, now, tz) {
    orchardTick(s, now, tz);
    var p = s.orchard && s.orchard.trees[k];
    if (!p || !p.n) return null;
    var d = treeById(p.id), n = p.n, sold = 0;
    for (var j = 0; j < n; j++) sold += bagAdd(s, d.id, d.price);
    p.n = 0;
    s.orchard.dex[d.id] = Math.min(1e6, (s.orchard.dex[d.id] || 0) + n);
    return { id: d.id, n: n, sold: sold };
  }
  // 옮겨 심기: pull a tree up to free its spot (a second tree of a kind would otherwise block that kind for good).
  // Ripe fruit goes to the basket first and the sapling's price comes back, so nothing is lost but the growing time.
  function uprootTree(s, k, now, tz) {
    var p = s.orchard && s.orchard.trees[k];
    if (!p) return null;
    var d = treeById(p.id), fruit = pickFruit(s, k, now, tz);
    s.orchard.trees[k] = null;
    s.coins += d.cost;
    return { id: d.id, coins: d.cost, fruit: fruit };
  }
  function fruitDexCount(s) { return s.orchard ? Object.keys(s.orchard.dex).length : 0; }

  // ---------- bees ----------
  function hiveCount(s) { return s.bees ? s.bees.hives.length : 0; }
  function hiveCost(s) { var n = hiveCount(s); return n < HIVE_COSTS.length ? HIVE_COSTS[n] : null; }
  function buyHive(s, now) {
    var c = hiveCost(s);
    if (!s.orchard) return { ok: false, why: 'orchard' };
    if (c === null) return { ok: false, why: 'max' };
    if (s.coins < c) return { ok: false, why: 'coins' };
    s.coins -= c;
    if (!s.bees) s.bees = { hives: [], dex: {} };
    s.bees.hives.push({ t: now, jar: [] });
    return { ok: true };
  }
  // the flowers around in `season`: [{ id, w }] (잡화꿀 always). now = to know which trees are grown
  function honeySources(s, season, now) {
    var w = { wildhoney: 1 };
    var add = function (id, x) { w[id] = Math.min(4, (w[id] || 0) + x); };
    if (season !== 'winter' && s.yard && s.yard.place && s.yard.place.deco.flowers !== undefined) add('flowerbed', 2);
    var fh = FIELD_HONEY[season];
    if (fh && s.plots) s.plots.forEach(function (p) { if (p.crop && fh[1].indexOf(p.crop) >= 0) add(fh[0], 1); });
    if (s.forest) add(FOREST_HONEY[season], 2);
    if (s.orchard) s.orchard.trees.forEach(function (p) {
      if (p && treeGrown(p, now) && treeById(p.id).bloom === season) add(treeById(p.id).honey, 1.5);
    });
    return Object.keys(w).map(function (id) { return { id: id, w: w[id] }; });
  }
  function hiveEvery(season) { return season === 'winter' ? HIVE_EVERY * 2 : HIVE_EVERY; }
  // time-based (offline too): each jar is rolled under the season of the moment it filled
  function hiveTick(s, now, tz, rng) {
    if (!s.bees) return 0;
    var made = 0;
    s.bees.hives.forEach(function (h) {
      if (h.jar.length >= HIVE_CAP) { h.t = now; return; }
      for (var next = h.t + hiveEvery(seasonAt(h.t, tz)); next <= now && h.jar.length < HIVE_CAP; next = h.t + hiveEvery(seasonAt(h.t, tz))) {
        h.jar.push(pick(honeySources(s, seasonAt(next, tz), next), rng).id);
        h.t = next; made++;
      }
      if (h.jar.length >= HIVE_CAP) h.t = now;
    });
    return made;
  }
  function honeyWaiting(s) { var n = 0; if (s.bees) s.bees.hives.forEach(function (h) { n += h.jar.length; }); return n; }
  function collectHoney(s, k, now, tz, rng) {
    hiveTick(s, now, tz, rng);
    var h = s.bees && s.bees.hives[k];
    if (!h || !h.jar.length) return null;
    var got = h.jar.slice(), sold = 0, first = [];
    got.forEach(function (id) {
      if (!s.bees.dex[id]) first.push(id);
      s.bees.dex[id] = Math.min(1e6, (s.bees.dex[id] || 0) + 1);
      sold += bagAdd(s, id, HONEY_BY[id].price);
    });
    h.jar = [];
    return { items: got, sold: sold, first: first };
  }
  function honeyDexCount(s) { return s.bees ? Object.keys(s.bees.dex).length : 0; }
  // orders: 잡화꿀 once collected (fruit stays off the board: it is seasonal, orders have no deadline)
  function orchardOrders(s, out) {
    if (s.bees && s.bees.dex.wildhoney && s.bees.hives.length) out.push({ id: 'wildhoney', w: 1 });
  }

  // ---------- save: called by decodeStage6A at the end of decode() ----------
  function decodeOrchard(o, s) {
    var num = function (x) { return typeof x === 'number' && isFinite(x); };
    var obj = function (x) { return !!x && typeof x === 'object' && !Array.isArray(x); };
    var cnt = function (x, max) { return num(x) ? Math.max(0, Math.min(max, Math.floor(x))) : 0; };
    var q = o.orchard;
    if (obj(q)) {
      var r = s.orchard = newOrchard();
      if (Array.isArray(q.trees)) for (var k = 0; k < ORCHARD_N; k++) {
        var p = q.trees[k];
        if (obj(p) && treeById(p.id) && num(p.at)) r.trees[k] = { id: p.id, at: p.at, t: num(p.t) ? p.t : p.at, acc: num(p.acc) ? Math.max(0, p.acc) : 0, n: cnt(p.n, TREE_CAP) };
      }
      if (obj(q.dex)) TREES.forEach(function (t) { if (num(q.dex[t.id]) && q.dex[t.id] > 0) r.dex[t.id] = cnt(q.dex[t.id], 1e6); });
    }
    var b = o.bees;
    if (obj(b) && Array.isArray(b.hives)) {
      var e = s.bees = { hives: [], dex: {} };
      b.hives.slice(0, HIVE_COSTS.length).forEach(function (h) {
        if (!obj(h) || !num(h.t)) return;
        e.hives.push({ t: h.t, jar: Array.isArray(h.jar) ? h.jar.filter(function (id) { return !!honeyById(id); }).slice(0, HIVE_CAP) : [] });
      });
      if (obj(b.dex)) HONEYS.forEach(function (h) { if (num(b.dex[h.id]) && b.dex[h.id] > 0) e.dex[h.id] = cnt(b.dex[h.id], 1e6); });
    }
  }

  expose({
    TREES: TREES, HONEYS: HONEYS, ORCHARD_RECIPES: ORCHARD_RECIPES, ORCHARD_N: ORCHARD_N, ORCHARD_REP: ORCHARD_REP, ORCHARD_COST: ORCHARD_COST,
    TREE_CAP: TREE_CAP, FRUIT_EVERY: FRUIT_EVERY, HIVE_COSTS: HIVE_COSTS, HIVE_EVERY: HIVE_EVERY, HIVE_CAP: HIVE_CAP,
    treeById: treeById, honeyById: honeyById, seasonMs: seasonMs, orchardOk: orchardOk, orchardStatus: orchardStatus, unlockOrchard: unlockOrchard,
    treeStage: treeStage, treeGrown: treeGrown, plantTree: plantTree, orchardTick: orchardTick, fruitWaiting: fruitWaiting, pickFruit: pickFruit, uprootTree: uprootTree,
    fruitDexCount: fruitDexCount, hiveCount: hiveCount, hiveCost: hiveCost, buyHive: buyHive, honeySources: honeySources, hiveTick: hiveTick,
    honeyWaiting: honeyWaiting, collectHoney: collectHoney, honeyDexCount: honeyDexCount, orchardOrders: orchardOrders, decodeOrchard: decodeOrchard
  });
