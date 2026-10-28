  // ---------- 수족관: fish moved out of the basket swim in a tank in the house (s.tank, created lazily) ----------
  // Tank fish are never sold (sellAll/sellId only touch s.bag). Taking one out needs a free basket slot.
  var TANK_CAP = [2, 3, 5, 8];            // by house tier: 천막 · 오두막 · 기와집 · 2층집
  function tankCap(s) { return TANK_CAP[houseTier(s)]; }
  function tankList(s) { return s.tank || []; }
  // bag index k → tank; only fish, only while there is room
  function tankPut(s, k) {
    var e = s.bag[k];
    if (!e || itemInfo(e.id).kind !== 'fish' || tankList(s).length >= tankCap(s)) return false;
    s.bag.splice(k, 1);
    if (!s.tank) s.tank = [];
    s.tank.push({ id: e.id, v: e.v });
    return true;
  }
  // tank index k → basket (refused when the basket is full: nothing is sold or lost)
  function tankTake(s, k) {
    var e = tankList(s)[k];
    if (!e || s.bag.length >= bagCap(s)) return false;
    s.tank.splice(k, 1);
    s.bag.push({ id: e.id, v: e.v });
    return true;
  }

  expose({ TANK_CAP: TANK_CAP, tankCap: tankCap, tankList: tankList, tankPut: tankPut, tankTake: tankTake });
