  // ---------- 창고: basket items put aside for orders (s.shed, created lazily) ----------
  // Never sold (sellAll/sellId and the 꽉 차면 자동 판매 only touch s.bag). Orders count the basket and the 창고 together.
  var SHED_CAP = [10, 20, 30, 50];        // by house tier: 천막 · 오두막 · 기와집 · 2층집
  function shedCap(s) { return SHED_CAP[houseTier(s)]; }
  function shedList(s) { return s.shed || []; }
  function shedCount(s, id) { var n = 0; shedList(s).forEach(function (e) { if (e.id === id) n++; }); return n; }
  // up to n of id, cheapest first, from one list to another while `room` allows; returns how many moved
  function shedMove(from, to, id, n, room) {
    var moved = 0;
    while (moved < n && room > 0) {
      var k = -1;
      from.forEach(function (e, j) { if (e.id === id && (k < 0 || e.v < from[k].v)) k = j; });
      if (k < 0) break;
      to.push(from.splice(k, 1)[0]); moved++; room--;
    }
    return moved;
  }
  function shedPut(s, id, n) {
    if (!s.shed) s.shed = [];
    var m = shedMove(s.bag, s.shed, id, n, shedCap(s) - s.shed.length);
    if (!s.shed.length) delete s.shed;
    return m;
  }
  // back into the basket (stops when the basket is full: nothing is sold or lost)
  function shedTake(s, id, n) {
    var m = shedMove(shedList(s), s.bag, id, n, bagCap(s) - s.bag.length);
    if (s.shed && !s.shed.length) delete s.shed;
    return m;
  }
  // used up by an order: n of id, cheapest first, no basket room needed
  function shedUse(s, id, n) {
    var m = shedMove(shedList(s), [], id, n, n);
    if (s.shed && !s.shed.length) delete s.shed;
    return m;
  }

  expose({ SHED_CAP: SHED_CAP, shedCap: shedCap, shedList: shedList, shedCount: shedCount, shedPut: shedPut, shedTake: shedTake });
