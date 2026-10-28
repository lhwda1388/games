  // ---------- game clock + weather on screen: sky effects, night tint, the corner indicator ----------
  var TZ = -new Date().getTimezoneOffset();
  // test overrides (FF.weather / FF.phase / FF.season / FF.fx); null = follow the shared clock
  var wxOverride = null, phaseOverride = null, seasonOverride = null, fxOverride = null;
  function curEnv(t) {
    var e = L.fishEnv(t, TZ, wxOverride);
    if (phaseOverride) e.phase = phaseOverride;
    if (seasonOverride) e.season = seasonOverride;
    if (festOverride !== undefined) e.festival = festOverride;   // stage 5B: FF.festival
    return e;
  }
  // extra sky: 'petals' (spring, the block after rain) or 'leaves' (autumn, clear)
  function skyFx(t, e) {
    if (fxOverride) return fxOverride;
    if (e.season === 'spring' && !wxOverride && L.rainJustStopped(t, TZ)) return 'petals';
    if (e.season === 'autumn' && e.weather === 'clear') return 'leaves';
    return null;
  }

  function veil(c, a) { ctx.globalAlpha = a; ctx.fillStyle = G[c]; ctx.fillRect(-4, -4, W + 8, H + 8); ctx.globalAlpha = 1; }
  function drawWeather(tt, dt) {
    var t = now(), e = curEnv(t), k, x, y;
    if (e.weather === 'snow') {
      veil(3, 0.1);                       // a dimmer day so white flakes read on paper
      var depth = 1 + Math.min(1, ((t % L.WEATHER_MS) / L.WEATHER_MS) * 2);
      for (var i = 0; i < S.plots.length; i++) {
        var r = plotRect(i);
        px(r.x, r.y - 1, r.w, depth, 0); px(r.x, r.y - 1 + depth, r.w, 1, 2);
      }
      for (x = 6; x < 176; x += 10) px(x - 1, FENCE_Y - 4, 4, 1, 0);
      for (k = 0; k < 46; k++) {
        var sp = 0.6 + hash(k * 5 + 2) * 0.8;
        y = (hash(k * 3 + 1) * (H + 10) + tt * 13 * sp) % (H + 10) - 5;
        x = (hash(k * 7 + 4) * W + Math.sin(tt * 0.9 + k) * 4 + W) % W;
        px(x, y, 2, 2, 0); px(x + 2, y + 1, 1, 1, 2); px(x, y + 2, 2, 1, 2);
      }
    } else if (e.season === 'winter' && view === 'farm') {
      // winter without snowfall: the snow that's already settled stays on the plot edges
      for (var j = 0; j < S.plots.length; j++) { var pr = plotRect(j); px(pr.x + 1, pr.y - 1, pr.w - 2, 1, 0); px(pr.x + 1, pr.y, pr.w - 2, 1, 2); }
    }
    if (e.weather === 'rain') {
      veil(3, 0.07);
      ctx.globalAlpha = 0.6;
      for (k = 0; k < 70; k++) {
        y = (hash(k * 3 + 1) * (H + 12) + tt * 150 * (0.8 + hash(k) * 0.4)) % (H + 12) - 6;
        x = ((hash(k * 7 + 4) * W - y * 0.3) % W + W) % W;
        px(x, y, 1, 2, 3); px(x - 1, y + 2, 1, 2, 3);
      }
      ctx.globalAlpha = 1;
      for (k = 0; k < 6; k++) {          // drops landing on the water
        var slot = Math.floor(tt * 3 + k * 0.37), age = (tt * 3 + k * 0.37) % 1;
        x = POND.cx + (hash(slot * 31 + k) - 0.5) * POND.rx * 2.4; y = POND.cy + (hash(slot * 17 + k) - 0.5) * POND.ry * 2.4;
        if (inWet(x, y, 0.9)) ring(x, y, 1 + age * 3, 0.5 + age * 1.2, 0);
      }
    } else if (e.weather === 'fog') {
      veil(0, 0.3);
      ctx.globalAlpha = 0.45;
      for (k = 0; k < 5; k++) {
        y = 18 + k * 40 + Math.sin(tt * 0.25 + k) * 6;
        x = ((tt * (3 + k) + k * 53) % (W + 90)) - 90;
        for (var b = 0; b < 3; b++) px(x + b * 6, y + b, 80 - b * 12, 7 - b * 2, 0);
      }
      ctx.globalAlpha = 1;
    }
    var fx = skyFx(t, e);
    if (fx === 'petals') {
      for (k = 0; k < 22; k++) {
        y = (hash(k * 9 + 3) * (H + 10) + tt * 16 * (0.7 + hash(k) * 0.6)) % (H + 10) - 5;
        x = (hash(k * 11 + 6) * W + tt * 9 + Math.sin(tt * 1.7 + k) * 5) % W;
        var flip = Math.floor(tt * 3 + k) % 2;
        px(x, y, flip ? 2 : 1, flip ? 1 : 2, 1); px(x + 1, y + 1, 1, 1, 2);
      }
    } else if (fx === 'leaves') {
      for (k = 0; k < 9; k++) {
        var lx = (hash(k * 13 + 1) * W + tt * (26 + hash(k * 3) * 22)) % (W + 20) - 10;
        var ly = hash(k * 19 + 7) * (H - 20) + 10 + Math.sin(tt * 2.2 + k) * 6;
        var fr = Math.floor(tt * 5 + k) % 3;
        if (fr === 0) { px(lx, ly, 3, 1, 3); px(lx + 1, ly + 1, 2, 1, 2); }
        else if (fr === 1) { px(lx, ly, 2, 2, 3); px(lx + 2, ly + 1, 1, 1, 2); }
        else { px(lx + 1, ly - 1, 1, 3, 3); px(lx, ly, 1, 1, 2); }
      }
    }
    if (e.phase === 'night') veil(4, 0.2);
    else if (e.phase === 'evening') veil(4, 0.08);
  }

  // ---------- corner indicator: season · phase · weather as three stacked 7×7 icons ----------
  var IC = {
    spring:  ['.44.44.', '4004004', '4044404', '.44044.', '4044404', '4004004', '.44.44.'],
    summer:  ['.......', '4444444', '4030304', '4000004', '.43334.', '..444..', '.......'],
    autumn:  ['....44.', '...4004', '..40404', '.404004', '.40404.', '4.444..', '4......'],
    winter:  ['..444..', '.40404.', '..444..', '.40004.', '4000004', '4000004', '.44444.'],
    morning: ['...4...', '4..4..4', '..444..', '.40004.', '4400044', '.......', '4444444'],
    day:     ['...4...', '.4.4.4.', '..444..', '4440444', '..444..', '.4.4.4.', '...4...'],
    evening: ['.......', '.......', '..444..', '.40004.', '4444444', '.......', '.4.4.4.'],
    night:   ['...44..', '..44...', '.444...', '.444...', '.444...', '..44...', '...44..'],
    clear:   ['...4...', '...4...', '..404..', '4400044', '..404..', '...4...', '...4...'],
    rain:    ['.444...', '4000444', '4000004', '.44444.', '4.4.4..', '.4.4.4.', '4.4.4..'],
    fog:     ['.......', '4444.44', '.......', '44.4444', '.......', '4444.44', '.......'],
    snow:    ['...4...', '4.444.4', '.4.4.4.', '4444444', '.4.4.4.', '4.444.4', '...4...']
  };
  function iconCanvas7(id, scale) {
    var c = document.createElement('canvas'); c.width = 7; c.height = 7;
    spr(IC[id], 0, 0, false, c.getContext('2d'));
    if (scale) { c.style.width = (7 * scale) + 'px'; c.style.height = (7 * scale) + 'px'; }
    return c;
  }
  var clockBtn = $('clockBtn'), clockKey = '';
  var clockCv = document.createElement('canvas'); clockCv.width = 7; clockCv.height = 25;
  clockBtn.appendChild(clockCv);
  function envLabel(e) { return L.SEASON_NAME[e.season] + ' · ' + L.PHASE_NAME[e.phase] + ' · ' + L.WEATHER_NAME[e.weather]; }
  function renderClock(e) {
    var key = e.season + e.phase + e.weather;
    if (key === clockKey) return;
    clockKey = key;
    var c2 = clockCv.getContext('2d');
    c2.clearRect(0, 0, 7, 25);
    spr(IC[e.season], 0, 0, false, c2); spr(IC[e.phase], 0, 9, false, c2); spr(IC[e.weather], 0, 18, false, c2);
    clockBtn.setAttribute('aria-label', envLabel(e) + ' · 달력 열기');
    clockBtn.title = envLabel(e);
  }
  clockBtn.addEventListener('click', function () { openCal('today'); });

  // gentle notes when the sky or the hour turns; a dot on the signpost when a new spot can be opened
  var lastEnv = null, spotNewSeen = false;
  var WX_TOAST = { rain: '비가 온다 · 작물이 10% 빨리 자란다', snow: '눈이 온다 · 눈 오는 날만 무는 물고기가 있다',
    fog: '안개가 꼈다 · 물속 그림자가 수상하다' };
  function tickSky() {
    var t = now(), e = curEnv(t);
    renderClock(e);
    clockBtn.disabled = !!reel;
    if (lastEnv && booted && !reel) {
      if (e.weather !== lastEnv.weather) {
        if (WX_TOAST[e.weather]) toast(WX_TOAST[e.weather], 3200);
        else if (lastEnv.weather === 'rain') toast(e.season === 'spring' ? '비가 그쳤다 · 꽃잎이 날린다' : '비가 그쳤다', 2800);
      } else if (e.phase !== lastEnv.phase && e.phase === 'night') toast('밤이 됐다 · 밤에만 나오는 물고기가 있다', 3000);
    }
    lastEnv = e;
    spotNew = L.SPOT_IDS.some(function (id) { return L.spotStatus(S, id) === 'ok'; });
    // the note belongs to the pond side: in the 마당/집 it waits until the player is back by the water
    if (!(spotNew && !spotNewSeen && booted && view !== 'farm')) {
      if (spotNew && !spotNewSeen && booted) toast('새 낚시터를 열 수 있다 · 오른쪽 표지판을 눌러요', 3600);
      spotNewSeen = spotNew;
    }
    if (!calEl.hidden) renderCalIfChanged();
  }
  setInterval(tickSky, 500);

  // console hooks for testing (attached by boot.js)
  function addSkyHooks(FF) {
    FF.spot = function (id) { if (id !== 'pond') { S.spotOk = S.spotOk || {}; S.spotOk[id] = true; } return goSpot(id); };
    FF.weather = function (w) { wxOverride = w || null; clockKey = ''; tickSky(); return curEnv(now()); };
    FF.phase = function (p) { phaseOverride = p || null; clockKey = ''; tickSky(); return curEnv(now()); };
    FF.season = function (s) { seasonOverride = s || null; clockKey = ''; tickSky(); return curEnv(now()); };
    FF.fx = function (name) { fxOverride = name || null; };
    FF.env = function () { return curEnv(now()); };
    FF.openCal = openCal;
  }
