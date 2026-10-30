  // ---------- items, basket, order board, cooking ----------
  // Animal products (stage 3 adds the animals; s.animals[from] > 0 makes a product obtainable).
  var PRODUCTS = {
    milk: { id: 'milk', name: '우유', price: 80, from: 'cow' },
    egg:  { id: 'egg',  name: '달걀', price: 50, from: 'hen' }
  };
  // Cooking: one pot, 2–3 ingredients (repeats allowed), time in ms. hidden recipes show as ??? until cooked.
  var RECIPES = [
    { id: 'saengchae', name: '무생채',     need: ['radish', 'radish', 'pepper'],   time: 180e3,  sell: 260 },
    { id: 'friedfish', name: '피라미튀김', need: ['minnow', 'minnow', 'potato'],   time: 240e3, sell: 150 },
    { id: 'maeuntang', name: '매운탕',     need: ['crucian', 'pepper', 'radish'],  time: 360e3, sell: 300 },
    { id: 'jam',       name: '딸기잼',     need: ['berry', 'berry'],               time: 300e3, sell: 480 },
    { id: 'jjim',      name: '메기찜',     need: ['catfish', 'tomato', 'pepper'],  time: 480e3, sell: 600 },
    { id: 'hobakjuk',  name: '호박죽',     need: ['pumpkin', 'corn'],              time: 900e3, sell: 1900 },
    { id: 'cornsoup',  name: '옥수수 수프', need: ['corn', 'potato', 'milk'],      time: 480e3, sell: 650 },
    { id: 'hwachae',   name: '수박화채',   need: ['melon', 'milk'],                time: 600e3, sell: 880 },
    { id: 'jeon',      name: '감자전',     need: ['potato', 'potato', 'egg'],      time: 300e3, sell: 280 },
    { id: 'goldbing',  name: '황금 빙수',  need: ['gold', 'berry', 'berry'],       time: 900e3, sell: 4200, hidden: true }
  ];
  var ORDER_SLOTS = 3, REFILL_MIN = 1200e3, REFILL_SPAN = 1200e3, SKIP_MIN = 60e3, SKIP_SPAN = 60e3;
  var SPECIAL_CHANCE = 0.12;
  var BAG_OVER = 40;   // how far over the cap a save may hold (자동 판매 끔 lets the pen/hive squeeze in)

  function recipeById(id) { for (var k = 0; k < RECIPES.length; k++) if (RECIPES[k].id === id) return RECIPES[k]; return null; }
  function itemInfo(id) {
    if (CROPS[id]) return { id: id, kind: 'crop', name: CROPS[id].name, price: CROPS[id].sell };
    var cv = caveItem(id); if (cv) return cv;   // stage 7: ores, gems, 화석 조각
    var f = fishById(id); if (f) return { id: id, kind: 'fish', name: f.name, price: f.price };
    var r = recipeById(id); if (r) return { id: id, kind: 'dish', name: r.name, price: r.sell };
    var il = isleItem(id); if (il) return { id: id, kind: 'isle', name: il.name, price: il.price };   // stage 7 섬
    var fr = farItem(id); if (fr) return { id: id, kind: 'isle', name: fr.name, price: fr.price };   // stage 9 ① 먼 섬
    if (PRODUCTS[id]) return { id: id, kind: 'product', name: PRODUCTS[id].name, price: PRODUCTS[id].price };
    var g = forageById(id); if (g) return { id: id, kind: 'forage', name: g.name, price: g.price };   // stage 5A
    var tr = treeById(id); if (tr) return { id: id, kind: 'fruit', name: tr.name, price: tr.price };   // stage 6A
    var hn = honeyById(id); if (hn) return { id: id, kind: 'honey', name: hn.name, price: hn.price };   // stage 6A
    var fl = flatById(id); if (fl) return { id: id, kind: 'flat', name: fl.name, price: fl.price };   // stage 7 갯벌
    var dv = diveItem(id); if (dv) return { id: id, kind: 'dive', name: dv.name, price: dv.price };   // stage 12 ③ 잠수
    var tn = trnItem(id); if (tn) return { id: id, kind: 'trn', name: tn.name, price: tn.price };   // 기차 여행 특산물
    var cf = cftItem(id); if (cf) return { id: id, kind: 'craft', name: cf.name, price: cf.price };   // 가공 공방 (each unit keeps its own v)
    var cm = cmpItem(id); if (cm) return { id: id, kind: 'camp', name: cm.name, price: cm.price };   // 캠핑 요리·아침 이슬·탄 음식
    return null;
  }
  // can the player get this item at all right now (some time of day counts)?
  function obtainable(s, id) {
    if (CROPS[id]) return id !== 'gold' ? seedUnlocked(s, id) : s.seeds.gold > 0 || !!s.dex.crops.gold;
    var f = fishById(id); if (f) return fishOpen(s, f);
    if (caveItem(id)) return caveOk(s);   // stage 7
    if (PRODUCTS[id]) return !!(s.animals && s.animals[PRODUCTS[id].from] > 0);
    var r = recipeById(id); if (r) return recipeKnown(s, r) && r.need.every(function (x) { return obtainable(s, x); });
    if (isleItem(id)) return isleOk(s);   // stage 7 섬
    if (farItem(id)) return farOk(s);     // stage 9 ① 먼 섬
    if (forageById(id)) return forestOk(s);
    if (treeById(id)) return !!(s.orchard && s.orchard.trees.some(function (p) { return p && p.id === id; }));   // stage 6A
    if (honeyById(id)) return !!(s.bees && s.bees.hives.length && (id === 'wildhoney' || s.bees.dex[id]));   // stage 6A
    if (flatById(id)) return flatOk(s);   // stage 7 갯벌
    if (diveItem(id)) return diveOk(s);   // stage 12 ③ 잠수
    if (trnItem(id)) return trnOk(s, trnItem(id).route);   // 기차 여행
    if (cftByOut(id)) return cftCanMake(s, cftByOut(id).k);   // 가공 공방
    if (cmpItem(id)) return cmpObtainable(s, id);   // 캠핑
    return false;
  }

  // ---------- basket ----------
  function bagCap(s) { return UPG.basket.cap[tier(s, 'basket')] + houseBag(s) + donkeyBag(s); }   // stage 9: 당나귀 짐 싣기
  // into the basket if there's room, otherwise sold on the spot; returns coins earned by overflow.
  // s.keep[id] (지키기): a kept item pushes out the cheapest unkept one instead (or squeezes in if all are kept).
  // s.noSell (자동 판매 끔): nothing is sold; the UI stops new catches/harvests while full (bagBlocked),
  // and what still comes in (pen, hive, pet gifts) squeezes in over the cap.
  function bagAdd(s, id, value) {
    if (s.bag.length < bagCap(s) || s.noSell) { s.bag.push({ id: id, v: value }); return 0; }
    if (!(s.keep && s.keep[id])) { s.coins += value; return value; }
    var k = -1;
    s.bag.forEach(function (e, j) { if (!s.keep[e.id] && (k < 0 || e.v < s.bag[k].v)) k = j; });
    var v = k < 0 ? 0 : s.bag.splice(k, 1)[0].v;
    s.bag.push({ id: id, v: value }); s.coins += v; return v;
  }
  function bagBlocked(s) { return !!s.noSell && s.bag.length >= bagCap(s); }
  function bagCount(s, id) { var n = 0; s.bag.forEach(function (e) { if (e.id === id) n++; }); return n; }
  // removes n of id, cheapest first (big fish stay for selling)
  function bagTake(s, id, n) {
    var idx = [];
    s.bag.forEach(function (e, k) { if (e.id === id) idx.push(k); });
    if (idx.length < n) return false;
    idx.sort(function (a, b) { return s.bag[a].v - s.bag[b].v; });
    var drop = idx.slice(0, n).sort(function (a, b) { return b - a; });
    drop.forEach(function (k) { s.bag.splice(k, 1); });
    return true;
  }
  // kept (지키기) items stay in the basket. With now/tzMin the 장터 시세 prices apply (market.js); orders don't come here.
  function sellAll(s, now, tzMin) {
    var out = [];
    s.bag = s.bag.filter(function (e) { if (s.keep && s.keep[e.id]) return true; out.push(e); return false; });
    var t = mktRun(s, out, now, tzMin, true);
    s.coins += t; return t;
  }
  // one of id, the cheapest (as bagTake)
  function sellOne(s, id, now, tzMin) {
    var k = -1;
    s.bag.forEach(function (e, j) { if (e.id === id && (k < 0 || e.v < s.bag[k].v)) k = j; });
    if (k < 0) return 0;
    var v = mktRun(s, s.bag.splice(k, 1), now, tzMin, true); s.coins += v; return v;
  }
  function sellId(s, id, now, tzMin) {
    var out = [];
    s.bag = s.bag.filter(function (e) { if (e.id !== id) return true; out.push(e); return false; });
    var t = mktRun(s, out, now, tzMin, true);
    s.coins += t; return t;
  }

  // ---------- order board ----------
  function pick(list, rng) {
    var tot = 0, k; for (k = 0; k < list.length; k++) tot += list[k].w;
    var r = rng() * tot;
    for (k = 0; k < list.length; k++) { r -= list[k].w; if (r < 0) return list[k]; }
    return list[list.length - 1];
  }
  // a fish whose weather the season never has (빙어: snow = winter only, rain fish in winter) stays off the board then
  function weatherInSeason(f, season) { return !season || !f.weather || WEATHER_ODDS[season].some(function (w) { return w[0] === f.weather; }); }
  function orderPool(s, special, season) {
    var out = [];
    if (special) {
      // harder: a rarer pond fish, or two of a dish already cooked
      FISH.forEach(function (f) { if (f.rarity !== '흔함' && !f.season && !f.fest && fishOpen(s, f) && weatherInSeason(f, season)) out.push({ id: f.id, w: f.window || f.unlock || isConditional(f) ? 1 : 2 }); });
      RECIPES.forEach(function (r) { if (s.dex.dish[r.id] && obtainable(s, r.id) && !seasonalItem(r.id)) out.push({ id: r.id, w: 2 }); });
      return out;
    }
    SEEDS.forEach(function (id) { if (seedUnlocked(s, id) && !seasonalItem(id)) out.push({ id: id, w: 3 }); });
    // seasonal fish (and 장마 가물치) stay off like seasonal crops: an order outlives the season it was posted in
    FISH.forEach(function (f) { if (!f.window && !f.unlock && !f.season && !f.fest && fishOpen(s, f) && weatherInSeason(f, season) && (isConditional(f) ? s.dex.fish[f.id] : f.rarity === '흔함' || s.dex.fish[f.id])) out.push({ id: f.id, w: 2 }); });
    RECIPES.forEach(function (r) { if (s.dex.dish[r.id] && !r.hidden && obtainable(s, r.id) && !seasonalItem(r.id)) out.push({ id: r.id, w: 2 }); });
    caveOrders(s, out);     // stage 7: common ores
    forageOrders(s, out);   // stage 5A: common 숲 finds
    isleOrders(s, out);     // stage 7: 섬 finds and coconuts
    farOrders(s, out);      // stage 9 ①: 먼 섬 finds
    orchardOrders(s, out);  // stage 6A: 잡화꿀
    flatOrders(s, out);     // stage 7: common 갯벌 finds
    cftOrders(s, out);      // 가공 공방: a crafted good once its machine stands
    festPool(s, out);   // stage 5B: festival items while a festival is on
    return out;
  }
  function between(rng, a, b) { return a + Math.floor(rng() * (b - a + 1)); }
  function genOrder(s, rng, season) {
    var special = rng() < SPECIAL_CHANCE;
    var pool = orderPool(s, special, season);
    if (special && !pool.length) { special = false; pool = orderPool(s, false, season); }
    var taken = s.orders.map(function (q) { return q.o && q.o.id; });
    var fresh = pool.filter(function (e) { return taken.indexOf(e.id) < 0; });
    var it = itemInfo(pick(fresh.length ? fresh : pool, rng).id), n;
    if (special) n = it.kind === 'dish' ? 2 : between(rng, 1, 2);
    else if (it.kind === 'crop') { var g = CROPS[it.id].grow; n = g <= 300e3 ? between(rng, 3, 6) : g <= 1200e3 ? between(rng, 2, 4) : between(rng, 1, 2); }
    else if (it.kind === 'fish') n = it.price < 50 ? between(rng, 2, 4) : between(rng, 1, 2);
    else if (it.kind === 'forage') n = between(rng, 2, 4);
    else if (it.kind === 'flat') n = between(rng, 2, 4);   // stage 7 갯벌
    else n = 1;
    var mult = special ? 3 + rng() : 1.5 + rng();
    var o = { id: it.id, n: n, reward: Math.round(it.price * n * mult), rep: special ? 3 : it.kind === 'dish' ? 2 : 1 };
    if (special) o.special = true;
    o = festMark(s, o);
    if (!special) o.by = residentFor(o, s);   // who posted it stays fixed (stage 10 new residents)
    return o;   // stage 5B: festival orders pay more
  }
  // fills every empty slot whose wait is over; time-based so it catches up after being away
  function refreshOrders(s, now, rng, tzMin) {
    var n = 0, season = gameClock(now, tzMin).season;
    s.orders.forEach(function (q) { if (!q.o && now >= q.at) { q.o = genOrder(s, rng, season); n++; } });
    return n;
  }
  // what an order can use: the basket and the 창고 together
  function haveCount(s, id) { return bagCount(s, id) + shedCount(s, id); }
  function canDeliver(s, k) { var q = s.orders[k]; return !!(q && q.o && haveCount(s, q.o.id) >= q.o.n); }
  function deliver(s, k, now, rng) {
    if (!canDeliver(s, k)) return null;
    var o = s.orders[k].o, b = Math.min(bagCount(s, o.id), o.n);
    bagTake(s, o.id, b); shedUse(s, o.id, o.n - b);   // basket first, the rest from the 창고
    var pay = dayIs(s, 'orders') ? Math.round(o.reward * DAY_ORDER_MUL) : o.reward;   // stage 8: 단골 손님의 날
    s.coins += pay; s.rep += o.rep;
    s.orders[k] = { o: null, at: now + REFILL_MIN + rng() * REFILL_SPAN };
    dailyBump(s, 'order');
    return { coins: pay, rep: o.rep, special: !!o.special, unlocked: checkUnlocks(s), friend: befriend(s, o) };
  }
  // no penalty: drop any order any time, a new one comes in 1–2 min
  function discard(s, k, now, rng) {
    var q = s.orders[k];
    if (!q || !q.o) return false;
    s.orders[k] = { o: null, at: now + SKIP_MIN + rng() * SKIP_SPAN };
    return true;
  }

  // ---------- cooking ----------
  function canCook(s, id) {
    var r = recipeById(id);
    if (!r || freePot(s) < 0 || !recipeKnown(s, r)) return false;
    var need = {};
    r.need.forEach(function (x) { need[x] = (need[x] || 0) + 1; });
    return Object.keys(need).every(function (x) { return bagCount(s, x) >= need[x]; });
  }
  function cook(s, id, now) {
    if (!canCook(s, id)) return false;
    var r = recipeById(id);
    r.need.forEach(function (x) { bagTake(s, x, 1); });
    potSet(s, freePot(s), { id: id, until: now + r.time });
    return true;
  }
  function potReady(s, now) { return readyPot(s, now) >= 0; }
  // mult (stage 5B 불 조절 도전): the dish is worth that much more; omitted = the plain dish
  function takeDish(s, now, mult) {
    var k = readyPot(s, now);
    if (k < 0) return null;
    var r = recipeById(potGet(s, k).id), first = !s.dex.dish[r.id];
    s.dex.dish[r.id] = (s.dex.dish[r.id] || 0) + 1;
    dailyBump(s, 'cook');
    potSet(s, k, null);
    return { id: r.id, first: first, sold: bagAdd(s, r.id, Math.round(r.sell * (mult || 1))) };
  }

  expose({
    PRODUCTS: PRODUCTS, RECIPES: RECIPES, ORDER_SLOTS: ORDER_SLOTS, REFILL_MIN: REFILL_MIN, REFILL_SPAN: REFILL_SPAN,
    SKIP_MIN: SKIP_MIN, SKIP_SPAN: SKIP_SPAN, SPECIAL_CHANCE: SPECIAL_CHANCE,
    recipeById: recipeById, itemInfo: itemInfo, obtainable: obtainable,
    BAG_OVER: BAG_OVER, bagCap: bagCap, bagAdd: bagAdd, bagBlocked: bagBlocked, sellOne: sellOne, bagCount: bagCount, haveCount: haveCount, bagTake: bagTake, sellAll: sellAll, sellId: sellId,
    weatherInSeason: weatherInSeason, orderPool: orderPool, genOrder: genOrder, refreshOrders: refreshOrders, canDeliver: canDeliver, deliver: deliver,
    discard: discard, canCook: canCook, cook: cook, potReady: potReady, takeDish: takeDish
  });
