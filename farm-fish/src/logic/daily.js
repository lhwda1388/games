  // ---------- 오늘의 할 일: three small goals per real calendar day, a reward for all three, no penalty ----------
  // key = the local date 'YYYY-MM-DD' (the UI passes it). Goals depend only on key + what is unlocked,
  // so the same day and progress always give the same list. s.daily = { key, goals: [{ t, x, n, p }], paid }.
  var DAILY_TYPES = {
    harvest: { text: function (g) { return '작물 ' + g.n + '개 거두기'; } },
    crop:    { text: function (g) { return CROPS[g.x].name + ' ' + g.n + '개 거두기'; } },
    fish:    { text: function (g) { return '물고기 ' + g.n + '마리 낚기'; } },
    spot:    { text: function (g) { return SPOTS[g.x].name + '에서 ' + g.n + '마리 낚기'; } },
    order:   { text: function (g) { return '주문 ' + g.n + '건 납품하기'; } },
    cook:    { text: function (g) { return '요리 ' + g.n + '번 꺼내기'; } },
    animal:  { text: function (g) { return '동물 생산품 ' + g.n + '개 줍기'; } }
  };
  function dayRng(key) {
    var a = strHash('daily:' + key);
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function dailyGoals(key, s) {
    var rng = dayRng(key), between = function (a, b) { return a + Math.floor(rng() * (b - a + 1)); };
    var seeds = SEEDS.filter(function (id) { return seedUnlocked(s, id) && !CROPS[id].season && CROPS[id].grow <= 900e3; });
    var spots = SPOT_IDS.filter(function (id) { return id !== 'pond' && spotUnlocked(s, id); });
    var cookable = RECIPES.some(function (r) { return !r.hidden && obtainable(s, r.id); });
    var heads = s.animals ? s.animals.hen + s.animals.duck + s.animals.cow : 0;
    // every candidate draws its numbers, so the rng stream doesn't depend on which ones are unlocked
    var c = [
      { t: 'harvest', n: between(5, 9), ok: true },
      { t: 'crop', x: seeds[Math.floor(rng() * seeds.length)], n: between(2, 4), ok: seeds.length > 0 },
      { t: 'fish', n: between(3, 5), ok: true },
      { t: 'spot', x: spots[Math.floor(rng() * spots.length)], n: between(2, 3), ok: spots.length > 0 },
      { t: 'order', n: between(1, 3), ok: true },
      { t: 'cook', n: between(1, 2), ok: cookable },
      { t: 'animal', n: between(3, 6), ok: heads > 0 }
    ].filter(function (g) { return g.ok; });
    for (var k = c.length - 1; k > 0; k--) { var j = Math.floor(rng() * (k + 1)), tmp = c[k]; c[k] = c[j]; c[j] = tmp; }
    // never both 'harvest' and 'crop' on one day: they would count the same tap twice
    var out = [];
    c.forEach(function (g) {
      if (out.length >= 3) return;
      if ((g.t === 'crop' && out.some(function (o) { return o.t === 'harvest'; })) || (g.t === 'harvest' && out.some(function (o) { return o.t === 'crop'; }))) return;
      var o = { t: g.t, n: g.n, p: 0 };
      if (g.x) o.x = g.x;
      out.push(o);
    });
    return out;
  }
  // a new day replaces yesterday's list (unfinished goals just go away)
  function ensureDaily(s, key) {
    if (!s.daily || s.daily.key !== key) s.daily = { key: key, goals: dailyGoals(key, s), paid: false };
    return s.daily;
  }
  // logic events call this: t = goal type, x = crop/spot id when it matters, n = how many (default 1)
  function dailyBump(s, t, x, n) {
    if (!s.daily || s.daily.paid) return;
    s.daily.goals.forEach(function (g) {
      if (g.t === t && (!g.x || g.x === x)) g.p = Math.min(g.n, g.p + (n === undefined ? 1 : n));
    });
  }
  function dailyDone(s) { return !!s.daily && s.daily.goals.length > 0 && s.daily.goals.every(function (g) { return g.p >= g.n; }); }
  function dailyReward(s) { return { coins: 500 + 500 * houseTier(s), fert: 1 }; }
  function claimDaily(s) {
    if (!dailyDone(s) || s.daily.paid) return null;
    var r = dailyReward(s);
    s.daily.paid = true; s.coins += r.coins; s.items.fert += r.fert;
    return r;
  }
  function dailyText(g) { return DAILY_TYPES[g.t].text(g); }

  expose({
    DAILY_TYPES: DAILY_TYPES, dailyGoals: dailyGoals, ensureDaily: ensureDaily, dailyBump: dailyBump, dailyDone: dailyDone,
    dailyReward: dailyReward, claimDaily: claimDaily, dailyText: dailyText
  });
