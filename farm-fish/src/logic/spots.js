  // ---------- fishing spots, fish conditions, rain growth ----------
  // 연못 from the start; 강·바다 open with 신뢰도 (★, kept) plus a one-time coin payment.
  var SPOTS = {
    pond:  { id: 'pond',  name: '연못', rep: 0,  cost: 0 },
    river: { id: 'river', name: '강',   rep: 5,  cost: 1000 },
    sea:   { id: 'sea',   name: '바다', rep: 40, cost: 30000 }
  };
  var SPOT_IDS = ['pond', 'river', 'sea'];
  var RAIN_BONUS = 0.1;                       // crops grow 10% faster while it rains (not snow)

  function spotUnlocked(s, id) { return id === 'pond' || !!(SPOTS[id] && s && s.spotOk && s.spotOk[id]); }
  function curSpot(s) { return s && s.spot && spotUnlocked(s, s.spot) ? s.spot : 'pond'; }
  // 'ok' | 'owned' | 'rep' (not enough ★) | 'coins'
  function spotStatus(s, id) {
    if (spotUnlocked(s, id)) return 'owned';
    var sp = SPOTS[id];
    if (!sp || s.rep < sp.rep) return 'rep';
    return s.coins < sp.cost ? 'coins' : 'ok';
  }
  function buySpot(s, id) {
    if (spotStatus(s, id) !== 'ok') return false;
    s.coins -= SPOTS[id].cost;
    if (!s.spotOk) s.spotOk = {};
    s.spotOk[id] = true;
    return true;
  }
  // switching takes the line in; refused mid-bite/reel so a hooked fish is never lost to a menu
  function setSpot(s, id) {
    if (!spotUnlocked(s, id) || (s.fish && s.fish.phase !== 'idle' && s.fish.phase !== 'wait')) return false;
    s.spot = id;
    s.fish = { phase: 'idle' };
    return true;
  }
  // a fish is "open" when its spot is bought and its milestone (if any) is met; time/weather may still gate it
  function fishOpen(s, f) { return spotUnlocked(s, f.spot || 'pond') && (!f.unlock || !!(s.ms && s.ms[f.unlock])); }

  function fishEnv(now, tzMin, weather) {
    var c = gameClock(now, tzMin);
    return { phase: c.phase, season: c.season, weather: weather || weatherAt(now, tzMin), festival: festivalId(now, tzMin) };
  }
  function fishEnvOk(f, env) {
    return (!f.phase || f.phase.indexOf(env.phase) >= 0) && (!f.weather || f.weather === env.weather) && (!f.season || f.season === env.season) &&
      (!f.fest || f.fest === env.festival);   // stage 5B: festival-only fish
  }
  // fish that only bite under some game-clock/weather/season condition (the "지금만" list in the calendar)
  function isConditional(f) { return !!(f.phase || f.weather || f.season || f.fest); }

  // real ms of rain between a and b (snow does not count)
  function rainMs(a, b, tzMin) {
    var t = 0;
    for (var k = Math.floor(a / WEATHER_MS); k * WEATHER_MS < b; k++) {
      var lo = Math.max(a, k * WEATHER_MS), hi = Math.min(b, (k + 1) * WEATHER_MS);
      if (hi > lo && weatherAt(k * WEATHER_MS, tzMin) === 'rain') t += hi - lo;
    }
    return t;
  }
  // real ms until the next season starts (seasons turn on local Monday 00:00)
  function seasonLeftMs(now, tzMin) {
    var t = now + (tzMin || 0) * 60e3, wk = 7 * 86400e3, mon0 = 4 * 86400e3;
    return wk - ((((t - mon0) % wk) + wk) % wk);
  }

  expose({
    SPOTS: SPOTS, SPOT_IDS: SPOT_IDS, RAIN_BONUS: RAIN_BONUS,
    spotUnlocked: spotUnlocked, curSpot: curSpot, spotStatus: spotStatus, buySpot: buySpot, setSpot: setSpot, fishOpen: fishOpen,
    fishEnv: fishEnv, fishEnvOk: fishEnvOk, isConditional: isConditional, rainMs: rainMs, seasonLeftMs: seasonLeftMs
  });
