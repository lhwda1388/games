  // ---------- shop upgrades: tiers, prices, buying ----------
  // Shop. costs[t] is the price of going from tier t to t+1; effect arrays are indexed by current tier.
  var UPG = {
    rod:   { name: '낚싯대',  costs: [150, 1500, 8000],  tgain: [2.2, 1.3, 1, 0.6] },
    bait:  { name: '미끼',    costs: [120, 1200, 6000],  wait: [1, 0.75, 0.6, 0.45], rare: [1, 1.5, 2, 2.6] },
    field: { name: '밭 확장', costs: [500, 6000],       plots: [6, 8, 9] },
    scare: { name: '허수아비', costs: [200, 2000, 7000], chance: [0, 0.35, 0.6, 0.85] },
    basket: { name: '바구니', costs: [600, 5000],     cap: [12, 20, 30] }
  };
  var UPG_IDS = ['rod', 'bait', 'field', 'scare', 'basket'];
  function tier(s, id) { return (s.up && s.up[id]) || 0; }
  function plotCount(s) { return UPG.field.plots[tier(s, 'field')]; }
  function upgradeCost(s, id) {
    if (id === 'fert') return FERT_COST;
    var u = UPG[id]; if (!u) return null;
    var t = tier(s, id);
    return t < u.costs.length ? u.costs[t] : null;
  }
  function buy(s, id) {
    var c = upgradeCost(s, id);
    if (c === null || s.coins < c) return false;
    s.coins -= c;
    if (id === 'fert') { s.items.fert++; return true; }
    s.up[id] = tier(s, id) + 1;
    if (id === 'field') while (s.plots.length < plotCount(s)) s.plots.push(emptyPlot());
    return true;
  }

  expose({
    UPG: UPG, UPG_IDS: UPG_IDS, tier: tier, plotCount: plotCount, upgradeCost: upgradeCost, buy: buy
  });
