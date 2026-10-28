  // ---------- 마당: house tiers, animals, decorations, furniture, extra pots ----------
  // Everything stage 3 saves lives in s.yard (plus s.animals, which basket.js reads for PRODUCTS).
  // Both are created lazily by yardOf(), so older saves and newState() stay exactly as they were.
  PRODUCTS.duckegg = { id: 'duckegg', name: '오리알', price: 70, from: 'duck' };
  PRODUCTS.feather = { id: 'feather', name: '깃털',   price: 40, from: 'duck' };

  // house: coins + ★ needed (★ is not spent). Each tier adds basket slots, pots and decoration spots.
  var HOUSE = [
    { id: 'tent',  name: '천막',   cost: 0,     rep: 0,  bag: 0,  pots: 1, deco: 4 },
    { id: 'hut',   name: '오두막', cost: 2000,  rep: 6,  bag: 4,  pots: 1, deco: 6 },
    { id: 'giwa',  name: '기와집', cost: 25000, rep: 25, bag: 8,  pots: 2, deco: 9 },
    { id: 'two',   name: '2층집',  cost: 80000, rep: 55, bag: 12, pots: 3, deco: 12 }
  ];
  // animals: one product per head per period; up to CAP per head waits on the ground (offline too)
  var ANIMALS = {
    hen:  { id: 'hen',  name: '닭',   every: 20 * 60e3, costs: [300, 1000, 2000], house: 0, makes: '달걀' },
    duck: { id: 'duck', name: '오리', every: 40 * 60e3, costs: [3000, 5000],     house: 1, makes: '오리알·깃털' },
    cow:  { id: 'cow',  name: '젖소', every: 60 * 60e3, costs: [6000, 10000],   house: 1, makes: '우유' }
  };
  var ANIMAL_IDS = ['hen', 'duck', 'cow'];
  var ANIMAL_CAP = 4, FEATHER_CHANCE = 0.3;
  // decorations sit on fixed spots in the yard; `brings` = the visitor it attracts; merchant-only ones come from 떠돌이 상인
  var DECOS = [
    { id: 'flowers',   name: '꽃밭',   cost: 400,  brings: 'butterfly' },
    { id: 'mailbox',   name: '우체통', cost: 1200, brings: 'mailman' },
    { id: 'bench',     name: '벤치',   cost: 1000, brings: 'cat' },
    { id: 'birdhouse', name: '새집',   cost: 1500, brings: 'sparrows' },
    { id: 'tree',      name: '나무',   cost: 2000, brings: 'squirrel' },
    { id: 'fence',     name: '울타리', cost: 800 },
    { id: 'laundry',   name: '빨랫줄', cost: 1000 },
    { id: 'jars',      name: '장독대', cost: 3000, brings: 'raccoon' },
    { id: 'stones',    name: '돌탑',   cost: 4000 },
    { id: 'windmill',  name: '풍차',   cost: 12000 },
    { id: 'lanterns',  name: '연등',   cost: 5000, merchant: true },
    { id: 'chime',     name: '풍경',   cost: 6000, merchant: true, brings: 'fireflies' }
  ];
  // furniture: fixed slots in the room; bigger houses open more of them
  var FURN = [
    { id: 'bed',      name: '침대',   cost: 600,  house: 0 },
    { id: 'rug',      name: '러그',   cost: 400,  house: 0 },
    { id: 'lamp',     name: '램프',   cost: 500,  house: 0 },
    { id: 'table',    name: '탁자',   cost: 1500,  house: 1 },
    { id: 'chair',    name: '의자',   cost: 1000,  house: 1 },
    { id: 'plant',    name: '화분',   cost: 900,  house: 1 },
    { id: 'shelf',    name: '책장',   cost: 3000,  house: 2 },
    { id: 'stove',    name: '난로',   cost: 4000,  house: 2 },
    { id: 'clock',    name: '벽시계', cost: 2500,  house: 2 },
    { id: 'wardrobe', name: '옷장',   cost: 6000, house: 3 },
    { id: 'radio',    name: '라디오', cost: 4500,  house: 3 },
    { id: 'piano',    name: '피아노', cost: 15000, house: 3 }
  ];
  function byId(list, id) { for (var k = 0; k < list.length; k++) if (list[k].id === id) return list[k]; return null; }

  function newYard() {
    return { house: 0, deco: {}, furn: {}, pots: [],
      prod: { hen: { n: 0, t: 0 }, duck: { n: 0, t: 0 }, cow: { n: 0, t: 0 } },
      vis: [], nextVisitAt: 0, met: {}, gifts: [], mail: [], letterNext: 0, eggs: {},
      eg: { scare: 0, scareAt: 0, wishDay: -1, wishes: 0 } };
  }
  function yardOf(s) {
    if (!s.animals) s.animals = { hen: 0, duck: 0, cow: 0 };
    if (!s.yard) s.yard = newYard();
    return s.yard;
  }
  function houseTier(s) { return (s.yard && s.yard.house) || 0; }
  function houseInfo(s) { return HOUSE[houseTier(s)]; }
  function houseBag(s) { return HOUSE[houseTier(s)].bag; }
  function decoSlots(s) { return HOUSE[houseTier(s)].deco; }
  function decoCount(s) { return s.yard ? Object.keys(s.yard.deco).length : 0; }
  // next tier's price, or null at the top
  function houseNext(s) { return HOUSE[houseTier(s) + 1] || null; }
  function upgradeHouse(s) {
    var n = houseNext(s);
    if (!n) return { ok: false, why: 'max' };
    if (s.rep < n.rep) return { ok: false, why: 'rep' };
    if (s.coins < n.cost) return { ok: false, why: 'coins' };
    s.coins -= n.cost; yardOf(s).house++;
    return { ok: true, tier: s.yard.house };
  }

  // ---------- pots: the stage-1 pot is s.pot (index 0); a bigger house adds s.yard.pots[0..] ----------
  function potCount(s) { return HOUSE[houseTier(s)].pots; }
  function potGet(s, k) { return k === 0 ? s.pot : (s.yard && s.yard.pots[k - 1]) || null; }
  function potSet(s, k, v) { if (k === 0) s.pot = v; else yardOf(s).pots[k - 1] = v; }
  function freePot(s) { for (var k = 0; k < potCount(s); k++) if (!potGet(s, k)) return k; return -1; }
  function readyPot(s, now) { for (var k = 0; k < potCount(s); k++) { var p = potGet(s, k); if (p && now >= p.until) return k; } return -1; }

  // ---------- animals ----------
  function animalCost(s, id) {
    var a = ANIMALS[id], have = (s.animals && s.animals[id]) || 0;
    return a && have < a.costs.length ? a.costs[have] : null;
  }
  function buyAnimal(s, id, now) {
    var a = ANIMALS[id], c = animalCost(s, id);
    if (c === null) return { ok: false, why: 'max' };
    if (houseTier(s) < a.house) return { ok: false, why: 'house' };
    if (s.coins < c) return { ok: false, why: 'coins' };
    animalTick(s, now);
    s.coins -= c;
    if (!s.animals[id]) s.yard.prod[id] = { n: 0, t: now };
    s.animals[id]++;
    return { ok: true };
  }
  // time-based: catches up after being away; stops piling up at CAP per head (the clock waits too)
  function animalTick(s, now) {
    var y = yardOf(s), made = 0;
    ANIMAL_IDS.forEach(function (id) {
      var heads = s.animals[id], p = y.prod[id], a = ANIMALS[id], cap = heads * ANIMAL_CAP;
      if (!heads) return;
      if (p.n >= cap) { p.t = now; return; }
      var k = Math.floor((now - p.t) / a.every);
      if (k <= 0) return;
      var before = p.n;
      p.n = Math.min(cap, p.n + k * heads);
      p.t = p.n >= cap ? now : p.t + k * a.every;
      made += p.n - before;
    });
    return made;
  }
  function productsWaiting(s) {
    if (!s.yard) return 0;
    var n = 0; ANIMAL_IDS.forEach(function (id) { n += s.yard.prod[id].n; }); return n;
  }
  // tap the pen: everything waiting goes to the basket (overflow is sold by bagAdd)
  function collectAnimals(s, now, rng) {
    animalTick(s, now);
    var got = [], sold = 0;
    ANIMAL_IDS.forEach(function (id) {
      var p = s.yard.prod[id];
      for (; p.n > 0; p.n--) {
        var pid = id === 'hen' ? 'egg' : id === 'cow' ? 'milk' : rng() < FEATHER_CHANCE ? 'feather' : 'duckegg';
        sold += bagAdd(s, pid, PRODUCTS[pid].price);
        got.push(pid);
      }
    });
    dailyBump(s, 'animal', null, got.length);
    return { items: got, sold: sold };
  }

  // ---------- decorations & furniture ----------
  function decoBuyable(s, id) {
    var d = byId(DECOS, id), y = yardOf(s);
    if (!d) return 'none';
    if (y.deco[id]) return 'owned';
    if (decoCount(s) >= decoSlots(s)) return 'slots';
    if (s.coins < d.cost) return 'coins';
    return 'ok';
  }
  // merchant=true lets 떠돌이 상인 sell the merchant-only ones
  function buyDeco(s, id, merchant, price) {
    var d = byId(DECOS, id), why = decoBuyable(s, id);
    if (why === 'ok' && d.merchant && !merchant) why = 'merchant';
    if (why === 'ok' && price !== undefined && s.coins < price) why = 'coins';
    if (why !== 'ok') return { ok: false, why: why };
    s.coins -= price !== undefined ? price : d.cost;
    s.yard.deco[id] = true;
    return { ok: true };
  }
  function buyFurn(s, id) {
    var f = byId(FURN, id), y = yardOf(s);
    if (!f) return { ok: false, why: 'none' };
    if (y.furn[id]) return { ok: false, why: 'owned' };
    if (houseTier(s) < f.house) return { ok: false, why: 'house' };
    if (s.coins < f.cost) return { ok: false, why: 'coins' };
    s.coins -= f.cost; y.furn[id] = true;
    return { ok: true };
  }

  // ---------- save: called by decode() just before it returns ----------
  function decodeYard(o, s) {
    var num = function (x) { return typeof x === 'number' && isFinite(x); };
    var obj = function (x) { return !!x && typeof x === 'object' && !Array.isArray(x); };
    var cnt = function (x, max) { return num(x) ? Math.max(0, Math.min(max, Math.floor(x))) : 0; };
    if (obj(o.animals)) {
      s.animals = {};
      ANIMAL_IDS.forEach(function (id) { s.animals[id] = cnt(o.animals[id], ANIMALS[id].costs.length); });
    }
    if (!obj(o.yard)) return;
    var q = o.yard, y = s.yard = newYard();
    if (!s.animals) s.animals = { hen: 0, duck: 0, cow: 0 };
    y.house = cnt(q.house, HOUSE.length - 1);
    if (obj(q.deco)) DECOS.forEach(function (d) { if (q.deco[d.id] === true && decoCount(s) < decoSlots(s)) y.deco[d.id] = true; });
    if (obj(q.furn)) FURN.forEach(function (f) { if (q.furn[f.id] === true) y.furn[f.id] = true; });
    if (obj(q.prod)) ANIMAL_IDS.forEach(function (id) {
      var p = q.prod[id];
      if (obj(p) && num(p.t)) y.prod[id] = { n: cnt(p.n, s.animals[id] * ANIMAL_CAP), t: p.t };
    });
    if (Array.isArray(q.pots)) for (var k = 0; k < potCount(s) - 1; k++) {
      var pt = q.pots[k];
      y.pots.push(obj(pt) && recipeById(pt.id) && num(pt.until) ? { id: pt.id, until: pt.until } : null);
    }
    while (y.pots.length && y.pots[y.pots.length - 1] === null) y.pots.pop();
    if (Array.isArray(q.vis)) q.vis.forEach(function (v) { var d = obj(v) && decodeVisit(v); if (d) y.vis.push(d); });
    if (num(q.nextVisitAt)) y.nextVisitAt = q.nextVisitAt;
    if (obj(q.met)) VISITORS.forEach(function (d) { if (num(q.met[d.id]) && q.met[d.id] > 0) y.met[d.id] = Math.floor(q.met[d.id]); });
    if (Array.isArray(q.gifts)) q.gifts.slice(0, GIFT_MAX).forEach(function (g) {
      if (obj(g) && num(g.c) && num(g.f)) y.gifts.push({ c: cnt(g.c, 1e6), f: cnt(g.f, 99) });
    });
    if (Array.isArray(q.mail)) q.mail.slice(-MAIL_MAX).forEach(function (m) {
      if (obj(m) && letterText(m.k) && num(m.at) && num(m.c)) y.mail.push({ k: m.k, at: m.at, c: cnt(m.c, 1e6), read: m.read === true });
    });
    y.letterNext = cnt(q.letterNext, 1e9);
    if (obj(q.eggs)) EGGS.forEach(function (e) { if (num(q.eggs[e.id])) y.eggs[e.id] = q.eggs[e.id]; });
    if (obj(q.eg)) {
      y.eg.scare = cnt(q.eg.scare, 99);
      if (num(q.eg.scareAt)) y.eg.scareAt = q.eg.scareAt;
      if (num(q.eg.wishDay)) y.eg.wishDay = Math.floor(q.eg.wishDay);
      y.eg.wishes = cnt(q.eg.wishes, 99);
    }
    // the basket was refilled before the house tier was known: redo it with the house's extra slots
    if (Array.isArray(o.bag)) {
      s.bag = [];
      o.bag.forEach(function (e) {
        if (e && itemInfo(e.id) && num(e.v) && e.v >= 0 && s.bag.length < bagCap(s)) s.bag.push({ id: e.id, v: Math.round(e.v) });
      });
    }
  }

  expose({
    HOUSE: HOUSE, ANIMALS: ANIMALS, ANIMAL_IDS: ANIMAL_IDS, ANIMAL_CAP: ANIMAL_CAP, DECOS: DECOS, FURN: FURN,
    yardOf: yardOf, houseTier: houseTier, houseInfo: houseInfo, houseBag: houseBag, houseNext: houseNext, upgradeHouse: upgradeHouse,
    decoSlots: decoSlots, decoCount: decoCount, decoBuyable: decoBuyable, buyDeco: buyDeco, buyFurn: buyFurn,
    decoById: function (id) { return byId(DECOS, id); }, furnById: function (id) { return byId(FURN, id); },
    potCount: potCount, potGet: potGet, freePot: freePot, readyPot: readyPot,
    animalCost: animalCost, buyAnimal: buyAnimal, animalTick: animalTick, productsWaiting: productsWaiting, collectAnimals: collectAnimals,
    decodeYard: decodeYard
  });
