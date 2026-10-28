  // ---------- 도전: the optional hold-and-release gauge (채집, 수확). Never costs anything: a miss is the plain reward. ----------
  // Press and hold: after CH_GRACE the gauge starts, swings 0 → 1 → 0 every `period` ms; release inside [lo, hi] to win.
  // Times are the UI's real milliseconds (performance.now), so ?speed never changes the feel. A quick tap (released
  // before the gauge starts) is the ordinary 1-tap action; holding past CH_LIMIT ends it as a plain pick.
  var CH_GRACE = 250, CH_LIMIT = 8000, CH_MIN_LO = 0.3;
  var CH_ZONE = { '흔함': 0.2, '드묾': 0.17, '희귀': 0.15, '전설': 0.1 };
  var CH_PERIOD = { '흔함': 1700, '드묾': 1500, '희귀': 1300, '전설': 1100 };

  // press = when the finger went down; the zone never starts below CH_MIN_LO, so an early let-go can't win by luck
  function chNew(press, width, period, rng) {
    width = Math.max(0.08, Math.min(0.4, width));
    var lo = CH_MIN_LO + rng() * (0.97 - CH_MIN_LO - width);
    return { t0: press + CH_GRACE, period: period, lo: lo, hi: lo + width, end: press + CH_GRACE + CH_LIMIT };
  }
  function chPos(g, t) {
    if (t <= g.t0) return 0;
    var u = ((t - g.t0) / g.period) % 1;
    return u < 0.5 ? u * 2 : 2 - u * 2;
  }
  // 'tap' = let go before the gauge began (plain action), 'win', 'miss' (plain action too)
  function chJudge(g, t) {
    if (t < g.t0) return 'tap';
    if (t > g.end) return 'miss';
    var p = chPos(g, t);
    return p >= g.lo && p <= g.hi ? 'win' : 'miss';
  }
  function chOver(g, t) { return t > g.end; }
  function forageGame(id, press, rng) {
    var f = forageById(id), r = f ? f.rarity : '흔함';
    return chNew(press, CH_ZONE[r], CH_PERIOD[r], rng);
  }
  // bigger, slower crops: narrower zone (무 ~0.33 … 호박 0.1)
  function harvestWidth(crop) {
    var g = CROPS[crop] ? CROPS[crop].grow : 60e3;
    return Math.max(0.1, Math.min(0.34, 0.34 - 0.04 * Math.log(Math.max(1, g / 60e3)) / Math.LN2));
  }
  function harvestGame(crop, press, rng) { return chNew(press, harvestWidth(crop), 1400, rng); }
  // 특상품: the crop harvest() just put in the basket is worth double (same item, same 도감 count).
  // If the basket was full and it was sold on the spot, the extra coins are paid instead.
  function premiumHarvest(s, hv) {
    if (!hv || !hv.coins) return 0;
    if (hv.sold) { s.coins += hv.coins; return hv.coins; }
    for (var k = s.bag.length - 1; k >= 0; k--) {
      var e = s.bag[k];
      if (e.id === hv.crop && e.v === hv.coins) { e.v = hv.coins * 2; return hv.coins; }
    }
    return 0;
  }

  expose({
    CH_GRACE: CH_GRACE, CH_LIMIT: CH_LIMIT, CH_ZONE: CH_ZONE, chNew: chNew, chPos: chPos, chJudge: chJudge, chOver: chOver,
    forageGame: forageGame, harvestGame: harvestGame, harvestWidth: harvestWidth, premiumHarvest: premiumHarvest
  });
