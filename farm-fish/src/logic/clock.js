  // ---------- game clock ----------
  // 1 game day = 1 real hour (아침 15분 · 낮 20분 · 저녁 10분 · 밤 15분), 1 season = 1 real week (월요일 시작),
  // 1 month = a third of a season (~56 real hours). No years: the 12 months just loop.
  // The day slides 15 real minutes later each real (local) day, so the same wall-clock minute meets
  // all 4 phases every 4 days. At local midnight one game day is cut short or runs long (never skipped).
  // Real-time windows (점심 붕어, 금요일 참치, 자정 이스터에그) stay on the real clock via inWindow.
  // tzMin = minutes east of UTC (UI passes -new Date().getTimezoneOffset()).
  var HOUR_MS = 3600e3, WEEK_MS = 7 * 86400e3, MON0 = 4 * 86400e3;   // 1970-01-05 was a Monday
  var SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  var SEASON_NAME = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };
  var PHASE_NAME = { morning: '아침', day: '낮', evening: '저녁', night: '밤' };
  var SEASON_MONTH0 = { spring: 3, summer: 6, autumn: 9, winter: 12 };
  var DAY_MS = 86400e3, ROT_MS = 15 * 60e3;
  var WEATHER_MS = 40 * 60e3;
  var WEATHER_NAME = { clear: '맑음', rain: '비', fog: '안개', snow: '눈' };
  // Cumulative odds per season: summer is 장마, winter snows instead of raining.
  var WEATHER_ODDS = {
    spring: [['clear', 0.6], ['rain', 0.85], ['fog', 1]],
    summer: [['clear', 0.45], ['rain', 0.9], ['fog', 1]],
    autumn: [['clear', 0.7], ['rain', 0.85], ['fog', 1]],
    winter: [['clear', 0.5], ['snow', 0.85], ['fog', 1]]
  };

  // local time slid by today's rotation (0/15/30/45 minutes): game days are whole hours of this
  function gameT(now, tzMin) {
    var t = now + (tzMin || 0) * 60e3;
    return t + (((Math.floor(t / DAY_MS) % 4) + 4) % 4) * ROT_MS;
  }
  function gameMin(now, tzMin) { var g = gameT(now, tzMin); return (((g % HOUR_MS) + HOUR_MS) % HOUR_MS) / 60e3; }

  function gameClock(now, tzMin) {
    var t = now + (tzMin || 0) * 60e3, g = gameT(now, tzMin);
    var m = gameMin(now, tzMin);                                       // 0..60 real minutes into the game day
    var phase = m < 15 ? 'morning' : m < 35 ? 'day' : m < 45 ? 'evening' : 'night';
    var wk = (t - MON0) / WEEK_MS, week = Math.floor(wk);
    var season = SEASONS[((week % 4) + 4) % 4];
    return {
      phase: phase,
      hour: (6 + m * 0.4) % 24,                                       // display only: day starts at 6시
      day: Math.floor(g / HOUR_MS),
      season: season,
      month: (SEASON_MONTH0[season] + Math.min(2, Math.floor((wk - week) * 3)) - 1) % 12 + 1
    };
  }
  // Weather is fixed per 40-minute block, so every player sees the same sky at the same moment.
  function weatherAt(now, tzMin) {
    var b = Math.floor(now / WEATHER_MS), odds = WEATHER_ODDS[gameClock(b * WEATHER_MS, tzMin).season];
    var h = Math.imul(b ^ 0x5bd1e995, 0x27d4eb2d); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
    var r = (h >>> 0) / 4294967296;
    for (var i = 0; i < odds.length - 1; i++) if (r < odds[i][1]) return odds[i][0];
    return odds[odds.length - 1][0];
  }
  function rainJustStopped(now, tzMin) { return weatherAt(now, tzMin) !== 'rain' && weatherAt(now - WEATHER_MS, tzMin) === 'rain'; }
  // when the next phase (or the next start of phase `want`) begins → { phase, at } | null.
  // Scans whole minutes (phases change on them) because the day jumps at local midnight.
  function nextPhase(now, tzMin, want) {
    var m0 = Math.floor(now / 60e3), prev = gameClock(now, tzMin).phase;
    for (var k = 1; k <= 180; k++) {
      var at = (m0 + k) * 60e3, ph = gameClock(at, tzMin).phase;
      if (ph !== prev && (!want || ph === want)) return { phase: ph, at: at };
      prev = ph;
    }
    return null;
  }

  expose({
    SEASONS: SEASONS, SEASON_NAME: SEASON_NAME, PHASE_NAME: PHASE_NAME, WEATHER_NAME: WEATHER_NAME, WEATHER_MS: WEATHER_MS, WEATHER_ODDS: WEATHER_ODDS,
    gameClock: gameClock, gameMin: gameMin, weatherAt: weatherAt, rainJustStopped: rainJustStopped, nextPhase: nextPhase
  });
