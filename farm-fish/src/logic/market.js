  // ---------- 장터 시세: a stock-like price per 종목, new every real (local) day ----------
  // Only the basket's own selling (팔기 · 1개 · 전부 · 다 팔기) uses it. Orders, 경매, 대회 and the 꽉 차면 자동 판매
  // keep their own prices. Same day + same timezone → same board for everyone (no rng, no save needed for the price).
  // The price walks: each day's level is a decaying sum of the last MKT_MEM daily nudges, so today is mostly
  // yesterday plus one new nudge (trends last a few days, then fade back toward ×1).
  // Slippage: past MKT_FREE units of one 종목 sold in a day, each more unit takes MKT_SLIP off, but never below
  // ×1 (or below the day's price when it is already under ×1). s.mkt = { d: local day, n: { 종목: sold } } is
  // made on the first market sale; older saves have none.
  var MKT_MIN = 0.5, MKT_MAX = 2;                 // price bounds (×)
  var MKT_MEM = 12, MKT_DECAY = 0.8, MKT_STEP = 0.25;   // walk memory (days), fade per day, size of one day's nudge
  var MKT_FREE = 25, MKT_SLIP = 0.03;             // units per 종목 per day at the full price, then −3% each
  var MKT_HIST = 7;                               // days on the 시세판 sparkline (today included)
  var MKT = [
    { id: 'crop', name: '작물' },
    { id: 'fresh', name: '민물고기' },
    { id: 'sea', name: '바닷고기' },
    { id: 'wild', name: '숲·갯벌' },
    { id: 'farm', name: '과일·꿀·산물' },
    { id: 'dish', name: '요리' },
    { id: 'mine', name: '광물' }
  ];
  var MKT_KIND = { crop: 'crop', isle: 'sea', dive: 'sea', forage: 'wild', flat: 'wild', fruit: 'farm', honey: 'farm', product: 'farm',
    dish: 'dish', ore: 'mine', gem: 'mine', fossil: 'mine', trn: 'wild', craft: 'dish', camp: 'dish' };

  function mktDay(now, tzMin) { return toyDay(now, tzMin); }
  // item id → 종목 id, or null (no 종목: always ×1)
  function mktStock(id) {
    var it = itemInfo(id);
    if (!it) return null;
    if (it.kind === 'fish') { var sp = fishById(id).spot; return !sp || sp === 'pond' || sp === 'river' || (SPOTS[sp] && SPOTS[sp].fresh) ? 'fresh' : 'sea'; }
    return MKT_KIND[it.kind] || null;
  }
  // one day's nudge for 종목 k: −1..1, a pure hash of (day, 종목)
  function mktNudge(d, k) {
    var h = Math.imul(d ^ 0x2f6b9d1, 0x9e3779b1) ^ Math.imul(k + 1, 0x85ebca6b);
    h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
    return (h >>> 0) / 2147483648 - 1;
  }
  // 종목 id → that day's price (two decimals)
  function mktPrice(id, d) {
    var k = -1, j, x = 0, w = 1;
    for (j = 0; j < MKT.length; j++) if (MKT[j].id === id) k = j;
    if (k < 0) return 1;
    for (j = 0; j < MKT_MEM; j++) { x += w * MKT_STEP * mktNudge(d - j, k); w *= MKT_DECAY; }
    return Math.round(Math.min(MKT_MAX, Math.max(MKT_MIN, Math.exp(x))) * 100) / 100;
  }
  // the price after n units of that 종목 were already sold today
  function mktEff(m, n) {
    if (n < MKT_FREE) return m;
    return Math.max(Math.min(m, 1), Math.round((m - MKT_SLIP * (n - MKT_FREE + 1)) * 100) / 100);
  }
  function mktSold(s, d) { return s.mkt && s.mkt.d === d ? s.mkt.n : {}; }
  // coins for selling `list` (basket entries) in order; commit = count the units into today's s.mkt.
  // Without a time (old callers, tests) it is the plain basket value.
  function mktRun(s, list, now, tzMin, commit) {
    var t = 0;
    if (typeof now !== 'number') { list.forEach(function (e) { t += e.v; }); return t; }
    var d = mktDay(now, tzMin), was = mktSold(s, d), n = {}, used = false;
    Object.keys(was).forEach(function (k) { n[k] = was[k]; });
    list.forEach(function (e) {
      var k = mktStock(e.id);
      if (!k) { t += e.v; return; }
      t += Math.round(e.v * mktEff(mktPrice(k, d), n[k] || 0));
      n[k] = (n[k] || 0) + 1; used = true;
    });
    if (commit && used) s.mkt = { d: d, n: n };
    return t;
  }
  // what selling `list` would give now (nothing changes)
  function mktValue(s, list, now, tzMin) { return mktRun(s, list, now, tzMin, false); }
  // the 시세판: per 종목 today's price, the price left after today's sales, yesterday, and the last MKT_HIST days
  function mktBoard(s, now, tzMin) {
    var d = mktDay(now, tzMin), sold = mktSold(s, d);
    return MKT.map(function (q) {
      var hist = [];
      for (var j = MKT_HIST - 1; j >= 0; j--) hist.push(mktPrice(q.id, d - j));
      var m = hist[hist.length - 1];
      return { id: q.id, name: q.name, m: m, prev: hist[hist.length - 2], now: mktEff(m, sold[q.id] || 0), sold: sold[q.id] || 0, hist: hist };
    });
  }
  function decodeMarket(o, s) {
    var q = o.mkt;
    if (!q || typeof q !== 'object' || typeof q.d !== 'number' || !isFinite(q.d) || !q.n || typeof q.n !== 'object') return;
    var n = {};
    MKT.forEach(function (m) { var v = q.n[m.id]; if (typeof v === 'number' && isFinite(v) && v > 0) n[m.id] = Math.min(1e4, Math.floor(v)); });
    s.mkt = { d: Math.floor(q.d), n: n };
  }

  expose({
    MKT: MKT, MKT_MIN: MKT_MIN, MKT_MAX: MKT_MAX, MKT_FREE: MKT_FREE, MKT_SLIP: MKT_SLIP, MKT_HIST: MKT_HIST,
    mktDay: mktDay, mktStock: mktStock, mktPrice: mktPrice, mktEff: mktEff, mktValue: mktValue, mktBoard: mktBoard, decodeMarket: decodeMarket
  });
