  // ---------- 날씨 장난감 (stage 10 ④): puddle splash in rain, footprints in snow, autumn leaf piles ----------
  // Pure play: the UI draws the fun. Now and then a tiny reward, capped per real (local) day so it stays a toy.
  // s.toy = { d: local day number, n: rewards given that day } is made on the first reward; older saves have none.
  var TOY_DAY_CAP = 5;                                     // rewards per real day
  var TOY_CHANCE = { splash: 0.12, step: 0.04, leaves: 0.2 };
  var TOY_COINS = [3, 12];                                 // coins for one lucky play, inclusive
  var TOY_PILE_REGROW = 90e3;                              // a scattered leaf pile heaps up again (real ms)

  function toyOn(kind, env) {
    if (kind === 'splash') return env.weather === 'rain';
    if (kind === 'step') return env.weather === 'snow';
    if (kind === 'leaves') return env.season === 'autumn';
    return false;
  }
  function toyDay(now, tzMin) { return Math.floor((now + (tzMin || 0) * 60e3) / 86400e3); }
  function toyLeft(s, now, tzMin) {
    var q = s.toy;
    return !q || q.d !== toyDay(now, tzMin) ? TOY_DAY_CAP : Math.max(0, TOY_DAY_CAP - q.n);
  }
  // blocked = the basket is full with 자동 판매 off (bagStop): a 도토리 turns into coins instead of nagging
  function toyPlay(s, kind, now, tzMin, rng, blocked) {
    if (!TOY_CHANCE[kind] || toyLeft(s, now, tzMin) <= 0 || rng() >= TOY_CHANCE[kind]) return { reward: null };
    var d = toyDay(now, tzMin);
    if (!s.toy || s.toy.d !== d) s.toy = { d: d, n: 0 };
    s.toy.n++;
    if (kind === 'leaves' && !blocked) return { reward: { id: 'acorn', sold: bagAdd(s, 'acorn', forageById('acorn').price) } };
    var c = TOY_COINS[0] + Math.min(TOY_COINS[1] - TOY_COINS[0], Math.floor(rng() * (TOY_COINS[1] - TOY_COINS[0] + 1)));
    s.coins += c;
    return { reward: { coins: c } };
  }
  function decodeToys(o, s) {
    var q = o.toy;
    if (!q || typeof q !== 'object' || typeof q.d !== 'number' || !isFinite(q.d) || typeof q.n !== 'number' || !isFinite(q.n) || q.n < 0) return;
    s.toy = { d: Math.floor(q.d), n: Math.min(TOY_DAY_CAP, Math.floor(q.n)) };
  }

  expose({
    TOY_DAY_CAP: TOY_DAY_CAP, TOY_CHANCE: TOY_CHANCE, TOY_COINS: TOY_COINS, TOY_PILE_REGROW: TOY_PILE_REGROW,
    toyOn: toyOn, toyLeft: toyLeft, toyPlay: toyPlay, decodeToys: decodeToys
  });
