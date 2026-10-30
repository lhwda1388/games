  // ---------- 내 가게: a shop on the 마을 upper lane that sells what the player puts on its 진열대 ----------
  // Customers are worked out lazily from real time (the game may be closed): one every mysGap ms, each buys one unit.
  // Gaps missed while away count only for the last MYS_CATCHUP ms. s.mys.t only moves forward, so a clock set back
  // sells nothing and the same stretch of time never sells twice.
  // Price = item value × that sale day's 장터 시세 for its 종목 (market.js mktPrice) × the 가게 등급 bonus.
  // No slippage: customers are not the 장터 (s.mkt is never touched); the customer gap already caps how much sells.
  // Coins go to the 금고 (s.mys.till); the UI empties it into the wallet when the shop is opened.
  // s.mys = { sl: slots, it: [{ id, v: [values] } | null], lv: 등급 index, dec: { id: true }, t: ms settled up to,
  //   till: coins waiting, tn: units sold into the till, n: units sold ever } is made when the shop is built.
  // Every number here is a tuning knob; why each is what it is: tools/BALANCE.md 「내 가게 조정」.
  var MYS_PRICE = 25000;                                  // building the shop
  var MYS_SLOTS0 = 3, MYS_SLOTS_MAX = 8;
  var MYS_SLOT_COST = [4000, 7000, 11000, 16000, 22000];  // the 4th … 8th slot
  var MYS_STACK = 10;                                     // units of one item per slot
  var MYS_GAP = 15 * 60e3;                                // ms between customers before decorations
  var MYS_GAP_FLOOR = 0.5;                                // decorations never cut the gap below this share
  var MYS_CATCHUP = 12 * 3600e3;                          // most time away that still brings customers
  var MYS_BONUS = [1.2, 1.25, 1.3, 1.4, 1.5];             // price × this, by 가게 등급 (level 1 … 5)
  var MYS_LV_COST = [0, 20000, 45000, 90000, 160000];     // coins to reach that 등급
  var MYS_DECO = [                                        // cut = share taken off the customer gap
    { id: 'sign', name: '간판', price: 5000, cut: 0.1 },
    { id: 'pot', name: '화분', price: 3000, cut: 0.05 },
    { id: 'lamp', name: '조명', price: 8000, cut: 0.1 },
    { id: 'bell', name: '풍경', price: 4000, cut: 0.05 },
    { id: 'flag', name: '깃발', price: 6000, cut: 0.1 }
  ];

  function mysDeco(id) { for (var k = 0; k < MYS_DECO.length; k++) if (MYS_DECO[k].id === id) return MYS_DECO[k]; return null; }
  // ms between customers now
  function mysGap(s) {
    var cut = 0, d = s.mys ? s.mys.dec : {};
    MYS_DECO.forEach(function (x) { if (d[x.id]) cut += x.cut; });
    return Math.round(MYS_GAP * Math.max(MYS_GAP_FLOOR, 1 - cut));
  }
  function mysBonus(s) { return MYS_BONUS[s.mys ? s.mys.lv : 0]; }
  // one unit of id worth v, sold on local day d
  function mysUnitPrice(id, v, d, bonus) {
    var k = mktStock(id);
    return Math.round(v * (k ? mktPrice(k, d) : 1) * bonus);
  }
  var MYS_FUTURE = 86400e3;   // q.t further ahead than this is a clock that was wrong, not a real wait
  function mysUnits(q) { var n = 0; q.it.forEach(function (e) { if (e) n += e.v.length; }); return n; }
  // the slot the next customer buys from: round-robin over the filled slots, -1 when the shelves are empty
  function mysNext(q) {
    for (var j = 0; j < q.sl; j++) { var k = (q.n + j) % q.sl; if (q.it[k]) return k; }
    return -1;
  }
  // runs customers on q (a s.mys) up to now
  function mysRun(q, gap, bonus, now, tzMin) {
    if (q.t > now + MYS_FUTURE) { q.t = now; return; }    // a clock once set far ahead, now put right: open again, no sales for it
    if (!(now > q.t)) return;                             // same moment or a clock set back: nothing
    var t = Math.max(q.t, now - MYS_CATCHUP);
    while (t + gap <= now) {
      var k = mysNext(q);
      if (k < 0) { t = now; break; }                      // nobody waits at empty shelves
      t += gap;
      var e = q.it[k];
      q.till += mysUnitPrice(e.id, e.v.shift(), toyDay(t, tzMin), bonus);
      q.tn++; q.n++;
      if (!e.v.length) q.it[k] = null;
    }
    if (mysNext(q) < 0) t = now;
    q.t = t;
  }
  // brings sales up to now into the 금고; returns units sold just now
  function mysSettle(s, now, tzMin) {
    var q = s.mys;
    if (!q) return 0;
    var was = q.tn;
    mysRun(q, mysGap(s), mysBonus(s), now, tzMin);
    return q.tn - was;
  }
  // what the 금고 would hold now, nothing changed → { n, c }
  function mysPeek(s, now, tzMin) {
    if (!s.mys) return { n: 0, c: 0 };
    var q = JSON.parse(JSON.stringify(s.mys));
    mysRun(q, mysGap(s), mysBonus(s), now, tzMin);
    return { n: q.tn, c: q.till };
  }
  // empties the 금고 into the wallet → { n: units, c: coins }
  function mysCollect(s, now, tzMin) {
    if (!s.mys) return { n: 0, c: 0 };
    mysSettle(s, now, tzMin);
    var q = s.mys, got = { n: q.tn, c: q.till };
    s.coins += q.till; q.till = 0; q.tn = 0;
    return got;
  }
  function mysBuild(s, now) {
    if (s.mys) return { ok: false, why: 'built' };
    if (!villageOk(s)) return { ok: false, why: 'village' };
    if (s.coins < MYS_PRICE) return { ok: false, why: 'coins' };
    s.coins -= MYS_PRICE;
    var it = [];
    for (var k = 0; k < MYS_SLOTS0; k++) it.push(null);
    s.mys = { sl: MYS_SLOTS0, it: it, lv: 0, dec: {}, t: now, till: 0, tn: 0, n: 0 };
    return { ok: true };
  }
  // the next slot's price, or 0 when full
  function mysSlotCost(s) { return s.mys && s.mys.sl < MYS_SLOTS_MAX ? MYS_SLOT_COST[s.mys.sl - MYS_SLOTS0] : 0; }
  function mysAddSlot(s, now, tzMin) {
    if (!s.mys) return { ok: false, why: 'shop' };
    var c = mysSlotCost(s);
    if (!c) return { ok: false, why: 'max' };
    if (s.coins < c) return { ok: false, why: 'coins' };
    mysSettle(s, now, tzMin);
    s.coins -= c; s.mys.sl++; s.mys.it.push(null);
    return { ok: true };
  }
  function mysBuyDeco(s, id, now, tzMin) {
    var d = mysDeco(id);
    if (!s.mys) return { ok: false, why: 'shop' };
    if (!d) return { ok: false, why: 'deco' };
    if (s.mys.dec[id]) return { ok: false, why: 'have' };
    if (s.coins < d.price) return { ok: false, why: 'coins' };
    mysSettle(s, now, tzMin);                             // the old gap up to now, the new one after
    s.coins -= d.price; s.mys.dec[id] = true;
    return { ok: true };
  }
  // the next 등급's price, or 0 at the top
  function mysLevelCost(s) { return s.mys && s.mys.lv < MYS_BONUS.length - 1 ? MYS_LV_COST[s.mys.lv + 1] : 0; }
  function mysLevelUp(s, now, tzMin) {
    if (!s.mys) return { ok: false, why: 'shop' };
    var c = mysLevelCost(s);
    if (!c) return { ok: false, why: 'max' };
    if (s.coins < c) return { ok: false, why: 'coins' };
    mysSettle(s, now, tzMin);                             // sales so far at the old bonus
    s.coins -= c; s.mys.lv++;
    return { ok: true };
  }
  // up to n of id from the basket ('bag') or the 창고 ('shed') onto the shelves, dearest first; any item may go up,
  // 지키기 ones too (putting one there is the player's own choice). Returns how many moved.
  function mysPut(s, id, n, from, now, tzMin) {
    var q = s.mys;
    if (!q || !itemInfo(id)) return 0;
    var list = from === 'shed' ? shedList(s) : s.bag;
    mysSettle(s, now, tzMin);
    var empty = mysNext(q) < 0, moved = 0;
    while (moved < n) {
      var j = -1;
      list.forEach(function (e, i) { if (e.id === id && (j < 0 || e.v > list[j].v)) j = i; });
      if (j < 0) break;
      var k = -1;
      for (var a = 0; a < q.sl; a++) if (q.it[a] && q.it[a].id === id && q.it[a].v.length < MYS_STACK) { k = a; break; }
      if (k < 0) for (var b = 0; b < q.sl; b++) if (!q.it[b]) { k = b; q.it[b] = { id: id, v: [] }; break; }
      if (k < 0) break;
      q.it[k].v.push(list.splice(j, 1)[0].v); moved++;
    }
    if (from === 'shed' && s.shed && !s.shed.length) delete s.shed;
    if (moved && empty) q.t = Math.max(q.t, now);         // the wait for a customer starts now
    return moved;
  }
  // slot k back into the basket, as many as fit; returns how many came back
  function mysTake(s, k, now, tzMin) {
    var q = s.mys;
    if (!q || !q.it[k]) return 0;
    mysSettle(s, now, tzMin);
    var e = q.it[k], moved = 0;
    if (!e) return 0;
    while (e.v.length && s.bag.length < bagCap(s)) { s.bag.push({ id: e.id, v: e.v.pop() }); moved++; }
    if (!e.v.length) q.it[k] = null;
    return moved;
  }
  function decodeMyShop(o, s) {
    var q = o.mys;
    function ok(x) { return typeof x === 'number' && isFinite(x) && x >= 0; }
    if (!q || typeof q !== 'object') return;
    if (!Array.isArray(q.it)) q = Object.assign({}, q, { it: [] });   // a bad field loses that field, never the 25,000-coin shop
    var sl = ok(q.sl) ? Math.min(MYS_SLOTS_MAX, Math.max(MYS_SLOTS0, Math.floor(q.sl))) : MYS_SLOTS0, it = [], dec = {};
    for (var k = 0; k < sl; k++) {
      var e = q.it[k], v = e && typeof e === 'object' && itemInfo(e.id) && Array.isArray(e.v) ? e.v.filter(ok).slice(0, MYS_STACK).map(Math.round) : [];
      it.push(v.length ? { id: e.id, v: v } : null);
    }
    if (q.dec && typeof q.dec === 'object') MYS_DECO.forEach(function (d) { if (q.dec[d.id] === true) dec[d.id] = true; });
    s.mys = { sl: sl, it: it, lv: ok(q.lv) ? Math.min(MYS_BONUS.length - 1, Math.floor(q.lv)) : 0, dec: dec, t: ok(q.t) ? q.t : ok(o.savedAt) ? o.savedAt : 0,
      till: ok(q.till) ? Math.floor(q.till) : 0, tn: ok(q.tn) ? Math.floor(q.tn) : 0, n: ok(q.n) ? Math.floor(q.n) : 0 };
  }

  expose({
    MYS_PRICE: MYS_PRICE, MYS_SLOTS0: MYS_SLOTS0, MYS_SLOTS_MAX: MYS_SLOTS_MAX, MYS_SLOT_COST: MYS_SLOT_COST, MYS_STACK: MYS_STACK,
    MYS_GAP: MYS_GAP, MYS_GAP_FLOOR: MYS_GAP_FLOOR, MYS_CATCHUP: MYS_CATCHUP, MYS_BONUS: MYS_BONUS, MYS_LV_COST: MYS_LV_COST, MYS_DECO: MYS_DECO,
    mysGap: mysGap, mysBonus: mysBonus, mysUnitPrice: mysUnitPrice, mysUnits: mysUnits, mysSettle: mysSettle, mysPeek: mysPeek,
    mysCollect: mysCollect, mysBuild: mysBuild, mysSlotCost: mysSlotCost, mysAddSlot: mysAddSlot, mysBuyDeco: mysBuyDeco,
    mysLevelCost: mysLevelCost, mysLevelUp: mysLevelUp, mysPut: mysPut, mysTake: mysTake, decodeMyShop: decodeMyShop
  });
