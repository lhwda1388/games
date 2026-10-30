  // ---------- 가공 공방: a workshop in the 마당 whose machines turn one basket item × up to 5 into dearer goods ----------
  // Not the cooking pot: hours long, one ingredient id per machine. Each unit remembers its own value (the basket's
  // { id, v }): what comes out is worth v plus min(v, CFT_VCAP) × (the machine's mul − 1). Worked out lazily from real time (the game may be closed):
  // a machine is done once now ≥ t + time, and stays done (d) after that. A clock set back finishes nothing early;
  // a start more than the machine's own time ahead was a wrong clock and restarts now. Taking out empties the machine, so a
  // batch never comes out twice.
  // s.craft = { m: [{ k } | { k, id, v: [input values], t: start ms, d?: 1 }], dx: { output id: units made } }
  // is made when the workshop is built. Numbers: tools/BALANCE.md 「가공 공방」, 「가공 공방 조정」.
  var CFT_REP = 10, CFT_PRICE = 15000;
  var CFT_CAP = 5;                    // units of one input id per machine
  var CFT_VCAP = 1000;                // only this much of one input's value is multiplied (a legend adds no more than a 1,000 fish)
  var CFT_MAX = 3;                    // machines of one kind
  var CFT_MORE = [1, 1.5, 2];         // price × this for the 1st, 2nd, 3rd of a kind
  // ref = the input whose price sets the output's plain price (orders, 도감); mul stays under what cooking pays for the
  // same inputs (fruit and milk dishes ×1.33–1.68, fish dishes ×1.54–2.9), so the pot still wins item for item
  var CFT_M = [
    { k: 'jar', name: '장독', out: 'cjam', outName: '과일청', price: 4000, time: 3 * 3600e3, mul: 1.4, ref: 'apple', what: '과수원 과일' },
    { k: 'rack', name: '건조대', out: 'cdry', outName: '건어물', price: 6000, time: 4 * 3600e3, mul: 1.7, ref: 'crucian', what: '민물고기' },
    { k: 'salt', name: '소금 항아리', out: 'cjeot', outName: '젓갈', price: 10000, time: 8 * 3600e3, mul: 1.7, ref: 'goby', what: '바닷물고기·갯벌 해산물' },
    { k: 'cheese', name: '치즈 통', out: 'ccheese', outName: '치즈', price: 3000, time: 6 * 3600e3, mul: 1.4, ref: 'milk', what: '우유' }
  ];
  var CFT_BERRY = ['berry', 'raspberry', 'mulberry'];   // 딸기류 go to the pot (딸기잼); a 장독 batch saved before that still loads

  function cftDef(k) { for (var j = 0; j < CFT_M.length; j++) if (CFT_M[j].k === k) return CFT_M[j]; return null; }
  function cftByOut(id) { if (!CFT_M) return null; for (var j = 0; j < CFT_M.length; j++) if (CFT_M[j].out === id) return CFT_M[j]; return null; }
  // a crafted good → { k, name, price } (price = what the ref input comes out at), else null
  function cftItem(id) {
    var d = cftByOut(id);
    if (!d) return null;
    var r = itemInfo(d.ref);
    return { k: d.k, name: d.outName, price: cftValue(r ? r.price : 100, d.k) };
  }
  // one input worth v out of machine kind k
  function cftValue(v, k) { return Math.round(v + Math.min(v, CFT_VCAP) * (cftDef(k).mul - 1)); }
  // can machine kind k take item id?
  function cftAccepts(k, id) {
    var it = itemInfo(id);
    if (!it || it.kind === 'craft') return false;
    if (k === 'jar') return it.kind === 'fruit';
    if (k === 'rack') return it.kind === 'fish' && mktStock(id) === 'fresh';
    if (k === 'salt') return it.kind === 'fish' ? mktStock(id) === 'sea' : it.kind === 'flat';
    if (k === 'cheese') return id === 'milk';
    return false;
  }
  // every item id machine kind k takes
  function cftInputs(k) {
    var ids = FISH.map(function (f) { return f.id; }).concat(TREES.map(function (t) { return t.id; }), FLAT.map(function (f) { return f.id; }), ['milk']);
    return ids.filter(function (id) { return cftAccepts(k, id); });
  }
  function cftCount(s, k) { var n = 0; if (s.craft) s.craft.m.forEach(function (m) { if (m.k === k) n++; }); return n; }
  // owns a machine of kind k and can get something to put in it
  function cftCanMake(s, k) {
    return cftCount(s, k) > 0 && cftInputs(k).some(function (id) { return obtainable(s, id); });
  }
  // crafted goods on the order board, once their machine stands (weight 1: now and then)
  function cftOrders(s, out) {
    if (!s.craft) return;
    CFT_M.forEach(function (d) { if (cftCanMake(s, d.k)) out.push({ id: d.out, w: 1 }); });
  }
  function cftBuild(s) {
    if (s.craft) return { ok: false, why: 'built' };
    if (s.rep < CFT_REP) return { ok: false, why: 'rep' };
    if (s.coins < CFT_PRICE) return { ok: false, why: 'coins' };
    s.coins -= CFT_PRICE;
    s.craft = { m: [], dx: {} };
    return { ok: true };
  }
  // the next machine of kind k, or 0 when there are CFT_MAX already
  function cftCost(s, k) {
    var d = cftDef(k), n = cftCount(s, k);
    return d && n < CFT_MAX ? Math.round(d.price * CFT_MORE[n]) : 0;
  }
  function cftBuy(s, k) {
    if (!s.craft) return { ok: false, why: 'craft' };
    if (!cftDef(k)) return { ok: false, why: 'kind' };
    var c = cftCost(s, k);
    if (!c) return { ok: false, why: 'max' };
    if (s.coins < c) return { ok: false, why: 'coins' };
    s.coins -= c; s.craft.m.push({ k: k });
    return { ok: true };
  }
  // brings every machine up to now; returns how many are done
  function cftSettle(s, now) {
    if (!s.craft) return 0;
    var n = 0;
    s.craft.m.forEach(function (m) {
      if (!m.id) return;
      if (m.t > now + cftDef(m.k).time) m.t = now;        // a clock once set ahead, now put right: start again
      if (!m.d && now >= m.t + cftDef(m.k).time) m.d = 1;
      if (m.d) n++;
    });
    return n;
  }
  // ms until machine m is done (never more than its whole time, even with a clock set back)
  function cftLeft(m, now) {
    if (!m.id || m.d) return 0;
    var tm = cftDef(m.k).time;
    return Math.max(0, Math.min(tm, m.t + tm - now));
  }
  // up to n of id from the basket into empty machine i, dearest first; 지키기 ones too (the player's choice). Returns how many went in.
  function cftPut(s, i, id, n, now) {
    var m = s.craft && s.craft.m[i];
    if (!m || m.id || !cftAccepts(m.k, id)) return 0;
    var v = [];
    while (v.length < Math.min(n, CFT_CAP)) {
      var j = -1;
      s.bag.forEach(function (e, x) { if (e.id === id && (j < 0 || e.v > s.bag[j].v)) j = x; });
      if (j < 0) break;
      v.push(s.bag.splice(j, 1)[0].v);
    }
    if (v.length) s.craft.m[i] = { k: m.k, id: id, v: v, t: now };
    return v.length;
  }
  // machine i's goods into the basket while there is room; the rest stays in the machine. Returns how many came out.
  function cftTake(s, i, now) {
    cftSettle(s, now);
    var m = s.craft && s.craft.m[i];
    if (!m || !m.id || !m.d) return 0;
    var d = cftDef(m.k), n = 0;
    while (m.v.length && s.bag.length < bagCap(s)) {
      s.bag.push({ id: d.out, v: cftValue(m.v.pop(), m.k) }); n++;
    }
    if (n) s.craft.dx[d.out] = (s.craft.dx[d.out] || 0) + n;
    if (!m.v.length) s.craft.m[i] = { k: m.k };
    return n;
  }
  // every done machine → { n: taken, left: still inside done machines }
  function cftTakeAll(s, now) {
    var out = { n: 0, left: 0 };
    if (!s.craft) return out;
    s.craft.m.forEach(function (m, i) { out.n += cftTake(s, i, now); });
    s.craft.m.forEach(function (m) { if (m.d) out.left += m.v.length; });
    return out;
  }
  function cftDexCount(s) { var n = 0; CFT_M.forEach(function (d) { if (s.craft && s.craft.dx[d.out]) n++; }); return n; }
  // a bad field loses only that field: a broken batch empties its machine, never the workshop or the machine
  function decodeCraft(o, s) {
    var q = o.craft;
    function ok(x) { return typeof x === 'number' && isFinite(x) && x >= 0; }
    if (!q || typeof q !== 'object') return;
    var m = [], cnt = {}, dx = {};
    (Array.isArray(q.m) ? q.m : []).forEach(function (e) {
      if (!e || typeof e !== 'object' || !cftDef(e.k) || (cnt[e.k] || 0) >= CFT_MAX) return;
      cnt[e.k] = (cnt[e.k] || 0) + 1;
      var v = Array.isArray(e.v) ? e.v.filter(ok).slice(0, CFT_CAP).map(Math.round) : [];
      if (typeof e.id !== 'string' || !(cftAccepts(e.k, e.id) || (e.k === 'jar' && CFT_BERRY.indexOf(e.id) >= 0)) || !v.length) { m.push({ k: e.k }); return; }
      var x = { k: e.k, id: e.id, v: v, t: ok(e.t) ? e.t : ok(o.savedAt) ? o.savedAt : 0 };
      if (e.d === 1) x.d = 1;
      m.push(x);
    });
    if (q.dx && typeof q.dx === 'object') CFT_M.forEach(function (d) { if (ok(q.dx[d.out])) dx[d.out] = Math.floor(q.dx[d.out]); });
    s.craft = { m: m, dx: dx };
  }

  expose({
    CFT_REP: CFT_REP, CFT_PRICE: CFT_PRICE, CFT_CAP: CFT_CAP, CFT_VCAP: CFT_VCAP, CFT_MAX: CFT_MAX, CFT_MORE: CFT_MORE,
    CFT_M: CFT_M, cftDef: cftDef, cftByOut: cftByOut, cftItem: cftItem, cftValue: cftValue,
    cftAccepts: cftAccepts, cftInputs: cftInputs, cftCount: cftCount, cftCanMake: cftCanMake, cftBuild: cftBuild,
    cftCost: cftCost, cftBuy: cftBuy, cftSettle: cftSettle, cftLeft: cftLeft, cftPut: cftPut, cftTake: cftTake,
    cftTakeAll: cftTakeAll, cftDexCount: cftDexCount, decodeCraft: decodeCraft
  });
