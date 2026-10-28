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
  // decorations stand on yard spots (YSPOTS, sz = w×h in px); `brings` = the visitor it attracts; merchant-only ones come from 떠돌이 상인
  var DECOS = [
    { id: 'flowers',   name: '꽃밭',   cost: 400,  brings: 'butterfly', sz: [32, 16] },
    { id: 'mailbox',   name: '우체통', cost: 1200, brings: 'mailman', sz: [11, 18] },
    { id: 'bench',     name: '벤치',   cost: 1000, brings: 'cat', sz: [24, 12] },
    { id: 'birdhouse', name: '새집',   cost: 1500, brings: 'sparrows', sz: [10, 26] },
    { id: 'tree',      name: '나무',   cost: 2000, brings: 'squirrel', sz: [28, 56] },
    { id: 'fence',     name: '울타리', cost: 800, sz: [74, 12] },
    { id: 'laundry',   name: '빨랫줄', cost: 1000, sz: [46, 24] },
    { id: 'jars',      name: '장독대', cost: 3000, brings: 'raccoon', sz: [24, 18] },
    { id: 'stones',    name: '돌탑',   cost: 4000, sz: [18, 30] },
    { id: 'windmill',  name: '풍차',   cost: 12000, sz: [24, 50] },
    { id: 'lanterns',  name: '연등',   cost: 5000, merchant: true, sz: [44, 14] },
    { id: 'chime',     name: '풍경',   cost: 6000, merchant: true, brings: 'fireflies', sz: [7, 12], hang: true }
  ];
  // furniture stands on room spots (RSPOTS); bigger houses open more of them; hang = only its own wall spot
  var FURN = [
    { id: 'bed',      name: '침대',   cost: 600,  house: 0, sz: [46, 30] },
    { id: 'rug',      name: '러그',   cost: 400,  house: 0, sz: [60, 26] },
    { id: 'lamp',     name: '램프',   cost: 500,  house: 0, sz: [9, 30] },
    { id: 'table',    name: '탁자',   cost: 1500,  house: 1, sz: [32, 16] },
    { id: 'chair',    name: '의자',   cost: 1000,  house: 1, sz: [12, 20] },
    { id: 'plant',    name: '화분',   cost: 900,  house: 1, sz: [12, 22] },
    { id: 'shelf',    name: '책장',   cost: 3000,  house: 2, sz: [20, 40] },
    { id: 'stove',    name: '난로',   cost: 4000,  house: 2, sz: [24, 40] },
    { id: 'clock',    name: '벽시계', cost: 2500,  house: 2, sz: [13, 13], hang: true },
    { id: 'wardrobe', name: '옷장',   cost: 6000, house: 3, sz: [22, 42] },
    { id: 'radio',    name: '라디오', cost: 4500,  house: 3, sz: [14, 11] },
    { id: 'piano',    name: '피아노', cost: 15000, house: 3, sz: [54, 30] }
  ];
  function byId(list, id) { for (var k = 0; k < list.length; k++) if (list[k].id === id) return list[k]; return null; }

  function newYard() {
    return { house: 0, deco: {}, furn: {}, place: { deco: {}, furn: {} }, pots: [],
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
  // decoration slots count what stands in the yard; stored ones (보관함) don't use a slot
  function decoCount(s) { return s.yard ? Object.keys(s.yard.place.deco).length : 0; }
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
    return { ok: true, stored: !placeItem(s, 'deco', id).ok };
  }
  function buyFurn(s, id) {
    var f = byId(FURN, id), y = yardOf(s);
    if (!f) return { ok: false, why: 'none' };
    if (y.furn[id]) return { ok: false, why: 'owned' };
    if (houseTier(s) < f.house) return { ok: false, why: 'house' };
    if (s.coins < f.cost) return { ok: false, why: 'coins' };
    s.coins -= f.cost; y.furn[id] = true;
    return { ok: true, stored: !placeItem(s, 'furn', id).ok };
  }

  // ---------- placement: owned things stand on a spot (s.yard.place[kind][id] = spot index) or wait in the 보관함 ----------
  // A spot is [x, y, w, h]; an item stands bottom-centred on it. def = the item whose fixed place it was before things
  // could move, so old saves keep every item exactly where it was. house = the room tier that opens the spot.
  var PW = 180, PH = 200;   // the canvas (ui/core.js W, H)
  var YSPOTS = [
    { r: [16, 12, 24, 50], def: 'windmill' }, { r: [150, 14, 28, 56], def: 'tree' }, { r: [42, 38, 10, 26], def: 'birdhouse' },
    { r: [44, 76, 11, 18], def: 'mailbox' }, { r: [4, 88, 32, 16], def: 'flowers' }, { r: [68, 90, 44, 14], def: 'lanterns' },
    { r: [126, 98, 24, 12], def: 'bench' }, { r: [152, 94, 24, 18], def: 'jars' }, { r: [106, 118, 46, 24], def: 'laundry' },
    { r: [158, 146, 18, 30], def: 'stones' }, { r: [104, 184, 74, 12], def: 'fence' },
    { r: null, def: 'chime' },                                   // under the eave: ui/yard.js works it out from the house
    { r: [2, 60, 14, 26] }, { r: [154, 116, 24, 28] }, { r: [104, 168, 46, 14] }
  ];
  var RSPOTS = [
    { r: [6, 92, 46, 30], def: 'bed', house: 0 }, { r: [56, 124, 60, 26], def: 'rug', house: 0 }, { r: [54, 54, 9, 30], def: 'lamp', house: 0 },
    { r: [64, 58, 18, 26], house: 0 },
    { r: [66, 102, 32, 16], def: 'table', house: 1 }, { r: [100, 100, 12, 20], def: 'chair', house: 1 }, { r: [104, 62, 12, 22], def: 'plant', house: 1 },
    { r: [6, 150, 46, 30], house: 1 },
    { r: [6, 44, 20, 40], def: 'shelf', house: 2 }, { r: [150, 44, 24, 40], def: 'stove', house: 2 }, { r: [80, 8, 13, 13], def: 'clock', house: 2 },
    { r: [56, 154, 56, 28], house: 2 },
    { r: [28, 42, 22, 42], def: 'wardrobe', house: 3 }, { r: [8, 128, 14, 11], def: 'radio', house: 3 }, { r: [118, 156, 54, 30], def: 'piano', house: 3 }
  ];
  // what a moved item may never cover: house (every tier), pots, gift, pen, the corner buttons, trophies, the merchant's cart
  var YARD_BLOCK = [[52, 14, 76, 73], [126, 70, 46, 18], [96, 82, 14, 10], [3, 113, 100, 84], [0, 0, 16, 34], [156, 0, 24, 18],
    [132, 28, 14, 38], [147, 148, 12, 30], [100, 136, 52, 30]];
  var ROOM_BLOCK = [[118, 90, 58, 58], [76, 184, 28, 16], [24, 6, 50, 26], [84, 18, 36, 42], [116, 4, 38, 22], [0, 0, 16, 34], [156, 0, 24, 18]];
  function spotsOf(kind) { return kind === 'deco' ? YSPOTS : RSPOTS; }
  function itemsOf(kind) { return kind === 'deco' ? DECOS : FURN; }
  function spotOpen(s, kind, k) { var p = spotsOf(kind)[k]; return !!p && (kind === 'deco' || houseTier(s) >= p.house); }
  function defSpot(kind, id) { var l = spotsOf(kind); for (var k = 0; k < l.length; k++) if (l[k].def === id) return k; return -1; }
  // where the item is drawn when it stands on spot k (null for the eave)
  function itemRect(kind, id, k) {
    var p = spotsOf(kind)[k], it = byId(itemsOf(kind), id);
    if (!p || !p.r || !it) return null;
    return [p.r[0] + Math.round((p.r[2] - it.sz[0]) / 2), p.r[1] + p.r[3] - it.sz[1], it.sz[0], it.sz[1]];
  }
  function overlaps(a, b) { return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3]; }
  function placeOf(s, kind) { return yardOf(s).place[kind]; }
  function spotOf(s, kind, id) { var k = s.yard && s.yard.place[kind][id]; return k === undefined ? -1 : k; }
  function isPlaced(s, kind, id) { return spotOf(s, kind, id) >= 0; }
  function occupant(s, kind, k) { var pl = placeOf(s, kind); for (var id in pl) if (pl[id] === k) return id; return null; }
  // id may stand on k next to `others` ({ id: spot }): hanging things only on their own spot, the rest clear of
  // the blocked areas (their own old spot is always fine) and of each other
  function fitsAt(kind, id, k, others) {
    var p = spotsOf(kind)[k], it = byId(itemsOf(kind), id);
    if (!p || !it || (it.hang || !p.r) && p.def !== id) return false;
    var r = itemRect(kind, id, k);
    if (!r) return true;
    if (p.def !== id) {
      if (r[0] < 0 || r[1] < 0 || r[0] + r[2] > PW || r[1] + r[3] > PH) return false;
      if ((kind === 'deco' ? YARD_BLOCK : ROOM_BLOCK).some(function (b) { return overlaps(r, b); })) return false;
    }
    for (var o in others) { var q = itemRect(kind, o, others[o]); if (q && overlaps(r, q)) return false; }
    return true;
  }
  // can id go to spot k? a stored item needs an empty spot (and a free slot for decorations); a placed one swaps with whoever is there
  function canPlace(s, kind, id, k) {
    var pl = placeOf(s, kind), from = spotOf(s, kind, id), occ = occupant(s, kind, k);
    if (!yardOf(s)[kind][id] || !spotOpen(s, kind, k) || from === k) return false;
    if (from < 0 && (occ || (kind === 'deco' && decoCount(s) >= decoSlots(s)))) return false;
    var others = {};
    for (var o in pl) if (o !== id && o !== occ) others[o] = pl[o];
    if (!fitsAt(kind, id, k, others)) return false;
    if (!occ) return true;
    others[id] = k;
    return fitsAt(kind, occ, from, others);
  }
  function moveTargets(s, kind, id) {
    var out = [];
    for (var k = 0; k < spotsOf(kind).length; k++) if (canPlace(s, kind, id, k)) out.push(k);
    return out;
  }
  // 옮기기: a placed item to spot k; whatever stood there takes its old spot
  function moveItem(s, kind, id, k) {
    if (!isPlaced(s, kind, id)) return { ok: false, why: 'stored' };
    if (!canPlace(s, kind, id, k)) return { ok: false, why: 'blocked' };
    var pl = placeOf(s, kind), from = pl[id], occ = occupant(s, kind, k);
    pl[id] = k;
    if (occ) pl[occ] = from;
    return { ok: true, swapped: occ };
  }
  // 넣어 두기: into the 보관함 (frees its spot and, for decorations, its slot)
  function storeItem(s, kind, id) {
    if (!isPlaced(s, kind, id)) return { ok: false, why: 'stored' };
    delete placeOf(s, kind)[id];
    return { ok: true };
  }
  // 놓기: a stored item onto spot k, or (no k) its old spot if it fits, else the first spot that does
  function placeItem(s, kind, id, k) {
    if (!yardOf(s)[kind][id]) return { ok: false, why: 'none' };
    if (isPlaced(s, kind, id)) return { ok: false, why: 'placed' };
    if (kind === 'deco' && decoCount(s) >= decoSlots(s)) return { ok: false, why: 'slots' };
    var order = k !== undefined ? [k] : [defSpot(kind, id)].concat(spotsOf(kind).map(function (p, j) { return j; }));
    for (var j = 0; j < order.length; j++) if (order[j] >= 0 && canPlace(s, kind, id, order[j])) { placeOf(s, kind)[id] = order[j]; return { ok: true, spot: order[j] }; }
    return { ok: false, why: 'room' };
  }
  function storedList(s, kind) {
    return itemsOf(kind).filter(function (it) { return s.yard && s.yard[kind][it.id] && !isPlaced(s, kind, it.id); }).map(function (it) { return it.id; });
  }
  // an empty spot that still sells its own old item: the '+' you can tap twice to buy it there
  function spotBuyable(s, kind, k) {
    var p = spotsOf(kind)[k], it = p && p.def && byId(itemsOf(kind), p.def);
    if (!it || yardOf(s)[kind][it.id] || it.merchant || !spotOpen(s, kind, k) || occupant(s, kind, k)) return false;
    if (kind === 'deco' && decoCount(s) >= decoSlots(s)) return false;
    return fitsAt(kind, it.id, k, placeOf(s, kind));
  }
  function decoPlaced(s, id) { return isPlaced(s, 'deco', id); }
  function furnPlaced(s, id) { return isPlaced(s, 'furn', id); }

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
    // owned things are never dropped. Saves from before 옮기기 have no place: everything stands on its old fixed spot
    // (decorations past the slot count go to the 보관함). Otherwise a bad or doubled spot also means 보관함.
    var oldSave = !obj(q.place);
    ['deco', 'furn'].forEach(function (kind) {
      var qp = !oldSave && obj(q.place[kind]) ? q.place[kind] : {};
      if (obj(q[kind])) itemsOf(kind).forEach(function (it) {
        if (q[kind][it.id] !== true) return;
        y[kind][it.id] = true;
        var k = oldSave ? defSpot(kind, it.id) : qp[it.id], p = spotsOf(kind)[k];
        if (!num(k) || !p || occupant(s, kind, k) || (it.hang || !p.r) && p.def !== it.id) return;
        if (kind === 'deco' && decoCount(s) >= decoSlots(s)) return;
        y.place[kind][it.id] = k;
      });
    });
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
    YSPOTS: YSPOTS, RSPOTS: RSPOTS, spotOpen: spotOpen, itemRect: itemRect, spotOf: spotOf, isPlaced: isPlaced, occupant: occupant,
    canPlace: canPlace, spotBuyable: spotBuyable, moveTargets: moveTargets, moveItem: moveItem, storeItem: storeItem, placeItem: placeItem, storedList: storedList,
    decoPlaced: decoPlaced, furnPlaced: furnPlaced,
    potCount: potCount, potGet: potGet, freePot: freePot, readyPot: readyPot,
    animalCost: animalCost, buyAnimal: buyAnimal, animalTick: animalTick, productsWaiting: productsWaiting, collectAnimals: collectAnimals,
    decodeYard: decodeYard
  });
