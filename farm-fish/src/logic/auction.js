  // ---------- stage 11 ②: 어판장 경매 (real week), 떠돌이 상인 by train (real day) ----------
  // Buildings are read straight from s.port.done (lane ①). s.port.auc and s.trader are optional and made on first use.

  // ----- 어판장 경매: 3 species a week; the biggest of one from the basket sells at ×1.5..×3 by its size -----
  var AUC_N = 3, AUC_MIN = 1.5, AUC_MAX = 3;
  var AUC_SPOTS = ['river', 'sea', 'island'];
  function aucOpen(s) { return !!(s.port && s.port.done && s.port.done.market); }
  function aucWeek(now, tzMin) { return contestWeek(now, tzMin); }
  function aucLeft(now, tzMin) { return contestLeft(now, tzMin); }
  // 도감 fish of 강·바다·섬, no legends, no festival fish
  function aucPool(s) {
    return FISH.filter(function (f) { return AUC_SPOTS.indexOf(f.spot) >= 0 && f.rarity !== '전설' && !f.fest && !!s.dex.fish[f.id]; })
      .map(function (f) { return f.id; });
  }
  function aucPick(pool, wk) {
    var r = seedRng(strHash('auction:' + wk)), p = pool.slice(), out = [];
    while (out.length < AUC_N && p.length) out.push(p.splice(Math.floor(r() * p.length) % p.length, 1)[0]);
    return out;
  }
  // the week's sale, fixed once the week starts
  function aucOf(s, now, tzMin) {
    if (!aucOpen(s)) return null;
    var wk = aucWeek(now, tzMin);
    if (!s.port.auc || s.port.auc.wk !== wk) s.port.auc = { wk: wk, ids: aucPick(aucPool(s), wk), sold: {} };
    return s.port.auc;
  }
  function aucFish(s, now, tzMin) { var a = aucOf(s, now, tzMin); return a ? a.ids.slice() : []; }
  // basket entries are { id, v }: landFish made v = price × (0.7 + 0.6 × size) (× 장날), so the size comes back from v
  function aucMul(fishId, v) {
    var f = fishById(fishId);
    if (!f) return AUC_MIN;
    var fr = Math.max(0, Math.min(1, (Math.min(v, f.price * 1.3) / f.price - 0.7) / 0.6));   // 장날 ×2 capped off
    return Math.round((AUC_MIN + (AUC_MAX - AUC_MIN) * fr) * 100) / 100;
  }
  // index of the most valuable one of id in the basket, else -1
  function aucBest(s, id) {
    var k = -1;
    s.bag.forEach(function (e, j) { if (e.id === id && (k < 0 || e.v > s.bag[k].v)) k = j; });
    return k;
  }
  function aucSell(s, fishId, now, tzMin) {
    var a = aucOf(s, now, tzMin);
    if (!a) return { ok: false, why: 'closed' };
    if (a.ids.indexOf(fishId) < 0) return { ok: false, why: 'week' };
    if (a.sold[fishId]) return { ok: false, why: 'sold' };
    var k = aucBest(s, fishId);
    if (k < 0) return { ok: false, why: 'need' };
    var v = s.bag.splice(k, 1)[0].v, mul = aucMul(fishId, v), f = fishById(fishId), coins = Math.round(Math.min(v, f.price * 1.3) * mul);
    s.coins += coins;
    a.sold[fishId] = true;
    var y = yardOf(s);
    y.mail.push({ k: 'a:' + fishId + ':' + coins, at: now, c: 0, read: true });
    if (y.mail.length > MAIL_MAX) { var old = y.mail.findIndex(function (m) { return m.read; }); y.mail.splice(old < 0 ? 0 : old, 1); }   // keep unread letters (coins)
    return { ok: true, coins: coins, mul: mul };
  }
  // 'a:<fish>:<coins>' → the result letter (letterText reads it)
  function aucLetter(k) {
    var m = /^a:([a-z0-9]+):(\d{1,9})$/.exec(k), f = m && fishById(m[1]);
    if (!f) return null;
    var c = f.name.charCodeAt(f.name.length - 1) - 0xAC00, ga = c >= 0 && c < 11172 && c % 28 ? '이' : '가';
    return '어판장 소식: 이번 주 경매에서 ' + f.name + ga + ' ' + m[2].replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '코인에 팔렸어요.';
  }

  // ----- 떠돌이 상인: comes by train once a real day, 3 wares, one pick a day -----
  var TRADER_N = 3, TRADER_DAY_MS = 86400e3;
  var TRADER_DECOS = [
    { id: 'pbuoy',  name: '부표',       cost: 20000, sz: [10, 18] },
    { id: 'pcrate', name: '생선 상자',  cost: 15000, sz: [20, 12] },
    { id: 'pnet',   name: '그물 걸이',  cost: 25000, sz: [24, 18] },
    { id: 'plamp',  name: '항구 가로등', cost: 30000, sz: [8, 30] },
    { id: 'ptrain', name: '기차 모형',  cost: 40000, sz: [26, 14] }
  ];
  TRADER_DECOS.forEach(function (d) { DECOS.push({ id: d.id, name: d.name, cost: d.cost, merchant: true, from: 'port', sz: d.sz }); });
  var TRADER_STOCK = [{ id: 'gold', name: '황금 수박 씨앗', cost: 2000 }].concat(TRADER_DECOS.map(function (d) {
    return { id: d.id, name: d.name, cost: d.cost, deco: true };
  }));
  function traderById(id) { for (var k = 0; k < TRADER_STOCK.length; k++) if (TRADER_STOCK[k].id === id) return TRADER_STOCK[k]; return null; }
  function traderOpen(s) { return !!(s.port && s.port.done && s.port.done.station); }
  function traderDay(now, tzMin) { return Math.floor((now + (tzMin || 0) * 60e3) / TRADER_DAY_MS); }
  // owned decorations stay home, except today's pick (so the list doesn't change after picking)
  function traderToday(s, now, tzMin) {
    if (!traderOpen(s)) return [];
    var day = traderDay(now, tzMin), mine = s.trader && s.trader.day === day ? s.trader.picked : null;
    var pool = TRADER_STOCK.filter(function (w) { return !w.deco || w.id === mine || !(s.yard && s.yard.deco[w.id]); });
    var r = seedRng(strHash('trader:' + day)), out = [];
    while (out.length < TRADER_N && pool.length) out.push(pool.splice(Math.floor(r() * pool.length) % pool.length, 1)[0].id);
    return out;
  }
  function traderPicked(s, now, tzMin) { return s.trader && s.trader.day === traderDay(now, tzMin) ? s.trader.picked : null; }
  function traderPick(s, id, now, tzMin) {
    if (!traderOpen(s)) return { ok: false, why: 'closed' };
    if (traderToday(s, now, tzMin).indexOf(id) < 0) return { ok: false, why: 'day' };
    if (traderPicked(s, now, tzMin)) return { ok: false, why: 'picked' };
    var w = traderById(id);
    if (s.coins < w.cost) return { ok: false, why: 'coins' };
    s.coins -= w.cost;
    var out = { ok: true, name: w.name };
    if (id === 'gold') { s.seeds.gold++; s.dex.goldSeed = true; }
    else out.stored = !!grantDeco(s, id).stored;
    s.trader = { day: traderDay(now, tzMin), picked: id };
    return out;
  }

  function decodeAuction(o, s) {
    var num = function (x) { return typeof x === 'number' && isFinite(x); };
    var obj = function (x) { return !!x && typeof x === 'object' && !Array.isArray(x); };
    var q = obj(o.port) ? o.port.auc : null;
    if (obj(q) && num(q.wk)) {
      var a = { wk: Math.floor(q.wk), ids: [], sold: {} };
      if (Array.isArray(q.ids)) q.ids.forEach(function (id) { if (typeof id === 'string' && fishById(id) && a.ids.indexOf(id) < 0 && a.ids.length < AUC_N) a.ids.push(id); });
      if (obj(q.sold)) a.ids.forEach(function (id) { if (q.sold[id] === true) a.sold[id] = true; });
      if (!s.port) s.port = { got: {}, done: {} };
      s.port.auc = a;
    }
    var t = o.trader;
    if (obj(t) && num(t.day)) s.trader = { day: Math.floor(t.day), picked: typeof t.picked === 'string' && traderById(t.picked) ? t.picked : null };
  }

  expose({
    AUC_N: AUC_N, AUC_MIN: AUC_MIN, AUC_MAX: AUC_MAX, aucOpen: aucOpen, aucWeek: aucWeek, aucLeft: aucLeft, aucFish: aucFish, aucMul: aucMul,
    aucBest: aucBest, aucSell: aucSell, aucLetter: aucLetter,
    TRADER_N: TRADER_N, TRADER_STOCK: TRADER_STOCK, traderById: traderById, traderOpen: traderOpen, traderDay: traderDay,
    traderToday: traderToday, traderPicked: traderPicked, traderPick: traderPick, decodeAuction: decodeAuction
  });
