  // ---------- 낚시터: fish art for 강·바다, moving water, the signpost, switching spots ----------
  // shapes face left like SP.fish; '0' cells are recoloured by FISH_FILL when listed there
  var FISH_SHAPE = {
    eel:       ['..444444444444..', '.404000000000044', '.40000000000004.', '..444444444444..'],
    hairtail:  ['..44444444444444', '.40400000000004.', '4000000000000044', '.444444444444444'],
    loach:     ['4.44444444....', '.4040000004444', '4.44444444....'],
    smelt:     ['..44444...4', '.4040004.44', '.40000004444', '..44444...4'],
    flounder:  ['...444444..4', '..40000004.44', '.4040000004444', '.4000000004444', '..40000004.44', '...444444..4'],
    squid:     ['......44444.', '4.4.4400000444', '444440400000004', '4.4.4400000444', '......44444.'],
    octopus:   ['..44444..', '.4000004.', '4040040004', '400000004', '.4000004.', '4.4.4.4.4', '.4.4.4.4.'],
    ghostray:  ['.....44.......', '...4400044.....', '.44000000044444', '4000040000004..', '.44000000044...', '...4400044.....', '.....44.......'],
    swordfish: ['......4444...4', '4444440004..44', '.....40400004444', '......400004.44', '.......4444...4'],
    sturgeon:  ['...44444444....4', '..4000000004..44', '.404000000004444', '4000000000000044', '.444444444444.44', '...............4']
  };
  var FISH_FILL = {
    dace:      function (i, j) { return j === 3 ? 3 : 0; },
    chub:      function (i, j) { return j < 2 ? 2 : 0; },
    trout:     function (i, j) { return (i * 3 + j * 5) % 7 === 0 ? 3 : 0; },
    bass:      function (i, j) { return j < 3 ? 3 : 0; },
    mandarin:  function (i, j) { return (i + j * 2) % 4 === 0 ? 4 : (i + j) % 3 === 0 ? 2 : 0; },
    salmon:    function (i, j) { return j < 2 ? 2 : (i + j) % 5 === 0 ? 3 : 0; },
    snakehead: function (i, j) { return (i % 4 < 2) !== (j % 4 < 2) ? 3 : 0; },
    sturgeon:  function (i, j) { return j === 1 && i % 3 === 0 ? 4 : 2; },
    eel:       function (i, j) { return j === 1 ? 3 : 2; },
    loach:     function (i, j) { return i % 3 === 0 ? 3 : 1; },
    smelt:     function (i, j) { return j === 2 ? 1 : 0; },
    mackerel:  function (i, j) { return j < 3 && (i + j) % 3 === 0 ? 4 : j < 3 ? 2 : 0; },
    horse:     function (i, j) { return j === 4 ? 3 : 0; },
    flounder:  function (i, j) { return (i * 2 + j) % 5 === 0 ? 3 : 2; },
    rockfish:  function (i, j) { return (i + j) % 4 === 0 ? 4 : 3; },
    squid:     function (i, j) { return (i + j) % 3 === 0 ? 2 : 1; },
    hairtail:  function () { return 1; },
    cod:       function (i, j) { return (i * 5 + j * 3) % 6 === 0 ? 3 : 1; },
    snapper:   function (i, j) { return (i * 7 + j * 3) % 5 === 0 ? 0 : 1; },
    octopus:   function (i, j) { return (i + j) % 4 === 0 ? 3 : 2; },
    yellowtail: function (i, j) { return j === 3 ? 4 : j < 3 ? 2 : 0; },
    ghostray:  function (i, j) { return (i + j) % 2 ? 3 : 2; },
    swordfish: function (i, j) { return j < 2 ? 3 : 1; }
  };

  // 강: streaks carried along the bend; 바다: wave lines rolling onto the sand
  function drawCurrent(tt) {
    var sc = SCENES.river;
    for (var k = 0; k < 22; k++) {
      var r = sc.mid - sc.half * 0.85 + hash(k * 7 + 3) * sc.half * 1.7;
      var th = Math.PI + ((hash(k * 13 + 1) + tt * 2.2 / r) % 1) * Math.PI * 0.62 - 0.06;
      for (var q = 0; q < 4; q++) {
        var a = th - q * 0.012;
        px(sc.ox + Math.cos(a) * r, sc.oy + Math.sin(a) * r, 1, 1, q < 2 ? 0 : 2);
      }
    }
  }
  function drawWaves(tt) {
    var sc = SCENES.sea;
    for (var k = 0; k < 4; k++) {
      var ph = (tt * 0.12 + k / 4) % 1, r = sc.r * (0.62 + ph * 0.37);
      for (var a = Math.PI * 1.02; a < Math.PI * 1.5; a += 0.012) {
        if ((Math.floor(a * 60 + k * 7) % 5) > 2) continue;          // dashed crest
        var x = sc.ox + Math.cos(a) * r, y = sc.oy + Math.sin(a) * r;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        px(x, y, 1, 1, ph > 0.85 ? 0 : 3);
      }
    }
    // foam along the beach breathes in and out
    var fr = sc.r * (0.985 + Math.sin(tt * 1.1) * 0.012);
    for (var b = Math.PI * 1.02; b < Math.PI * 1.5; b += 0.008) {
      if (Math.floor(b * 140) % 3 === 0) continue;
      px(sc.ox + Math.cos(b) * fr, sc.oy + Math.sin(b) * fr, 1, 1, 0);
    }
    // a buoy far out
    var by = 186 + (Math.floor(tt * 1.5) % 2);
    px(168, by - 5, 1, 3, 4); px(166, by - 2, 5, 3, 4); px(167, by - 1, 3, 1, 0); px(165, by + 1, 7, 1, 0);
  }

  // signpost right of the farm path: tap → 낚시터. A dot blinks while a new spot can be opened.
  var spotNew = false;
  function drawSignpost(tt) {
    px(160, 104, 1, 15, 4);
    px(151, 104, 18, 7, 4); px(152, 105, 16, 5, 0);
    px(169, 106, 1, 3, 4); px(170, 107, 1, 1, 4);                    // arrow tip
    // tiny wave mark: this sign is about water
    px(154, 107, 2, 1, 3); px(156, 106, 2, 1, 3); px(158, 107, 2, 1, 3); px(160, 106, 2, 1, 3); px(162, 107, 2, 1, 3); px(164, 106, 2, 1, 3);
    if (spotNew && Math.floor(tt * 2) % 2 === 0) { px(167, 100, 4, 4, 4); px(168, 101, 2, 2, 0); }
  }
  function spotName(id) { return L.SPOTS[id].name; }
  function goSpot(id) {
    if (reel || !L.setSpot(S, id)) return false;
    castAnim = null; scareFx = null; swimmers = []; nextSwim = 1;
    setScene();
    toast(spotName(id) + '에 왔다 · ' + spotCount(id) + '종이 산다', 2600);
    refresh();
    return true;
  }
  function spotCount(id) { return L.FISH.filter(function (f) { return (f.spot || 'pond') === id; }).length; }
  function spotCaught(id) { return L.FISH.filter(function (f) { return (f.spot || 'pond') === id && S.dex.fish[f.id]; }).length; }

  // short condition label: '강 · 밤', '바다 · 비', '연못 · 12시~13시'
  var COND_WORD = { rain: '비 올 때', fog: '안개 낄 때', snow: '눈 올 때' };
  function fishCond(f) {
    var out = [];
    if (f.season) out.push(L.SEASON_NAME[f.season]);
    if (f.phase) out.push(f.phase.map(function (p) { return L.PHASE_NAME[p]; }).join('·'));
    if (f.weather) out.push(COND_WORD[f.weather]);
    if (f.window === 'lunch') out.push('12시~13시');
    if (f.window === 'friday') out.push('금요일 17시 이후');
    return out.join(' ');
  }
  // 도감/달력 hint for a fish not caught yet
  function fishHint(f) {
    var sp = f.spot || 'pond', where = spotName(sp) + (L.spotUnlocked(S, sp) ? '' : '(잠김)');
    if (f.egg) return f.hint;
    if (f.unlock) return S.ms[f.unlock] ? '연못 어딘가에' : '황금 수박을 거두면…';
    var c = fishCond(f);
    return where + (c ? ' · ' + c : '') + (f.hint ? ' · ' + f.hint : ' · ' + f.rarity);
  }

  // ---------- 새 손님 알림: one calm toast when a short condition opens something not caught yet where the player is ----------
  // Keyed by place + cause; a key is forgotten once its condition ends, so each window speaks at most once
  // (in memory only: a reload may say it again). Season-only fish/finds stay quiet: a season lasts a week.
  var noticeSeen = {}, noticeNext = 5000, noticeQuiet = 0;   // first look after the boot messages
  var NOTICE_PHASE = { morning: '아침이에요', day: '한낮이에요', evening: '저녁이에요', night: '밤이 됐어요' };
  var NOTICE_WX = { rain: '비가 와요', fog: '안개가 꼈어요', snow: '눈이 와요' };
  // the short condition behind a fish/find right now: { k, say } or null
  function noticeCause(f, e) {
    if (f.window === 'lunch') return { k: 'lunch', say: '점심시간' };
    if (f.window === 'friday') return { k: 'friday', say: '금요일 저녁' };
    if (f.fest) return { k: 'fest', say: L.FESTIVALS[f.fest] ? L.FESTIVALS[f.fest].name : '축제날' };
    if (f.weather) return { k: 'wx:' + f.weather, say: NOTICE_WX[f.weather] };
    if (f.wet) return { k: 'wet', say: '비 온 숲이 촉촉해요' };
    if (f.phase) return { k: 'ph:' + e.phase, say: NOTICE_PHASE[e.phase] };
    return null;
  }
  function tickNotice(t) {
    var p = performance.now();
    if (p < noticeNext) return;
    noticeNext = p + 2000;
    if (reel || boss) return;
    var d = new Date(t), e = curEnv(t), live = {}, say = null, sayKey = null;
    var here = view === 'farm' ? L.curSpot(S) : view === 'forest' && L.forestOk(S) ? 'forest' : null;
    L.FISH.forEach(function (f) {
      if (f.unlock || f.egg || !L.fishOpen(S, f) || !L.inWindow(f, d) || !L.fishEnvOk(f, e)) return;
      var c = noticeCause(f, e), sp = f.spot || 'pond';
      if (!c) return;
      var key = sp + '|' + c.k;
      live[key] = true;
      if (noticeSeen[key] || say) return;
      if (f.id === 'lunch' && view === 'farm') { sayKey = key; say = '점심시간 · 연못에 점심 붕어가 나왔어요'; return; }
      if (here !== sp || S.dex.fish[f.id]) return;
      sayKey = key;
      say = c.say + ' · ' + spotName(sp) + (f.window === 'friday' ? '에 커다란 그림자가…' : '에 낯선 물고기가…');
    });
    if (L.forestOk(S)) {
      var fe = fEnv(t);
      L.FORAGE.forEach(function (f) {
        if (!L.forageConditional(f) || L.forageWeight(f, fe) <= 0) return;
        var c = noticeCause(f, fe);
        if (!c) return;
        var key = 'forest|' + c.k;
        live[key] = true;
        if (noticeSeen[key] || say || here !== 'forest' || S.forest.dex[f.id]) return;
        sayKey = key;
        say = c.say + ' · 숲에 처음 보는 게…';
      });
    }
    Object.keys(noticeSeen).forEach(function (k) { if (!live[k]) delete noticeSeen[k]; });
    // never on top of another message: wait out a busy moment, at most one notice per 10 s
    if (!say || toastEl.classList.contains('on') || p < noticeQuiet) return;   // busy: try again next check
    noticeSeen[sayKey] = true; noticeQuiet = p + 10e3;
    toast(say, 3500);
  }
