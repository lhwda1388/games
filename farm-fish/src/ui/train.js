  // ---------- 기차 여행: 마을 간이역 + 노선 sheet, 포구 기차역 설원행, 기차 타는 장면, 산골 계곡 view, 기념품 art, FF.train ----------
  // Logic: logic/train.js. view 'trnride' = the window of a moving train (TRN_RIDE_MS, tap to skip), views 'trnvalley' /
  // 'trnonsen' / 'trnsnow' = the destinations. Fishing there is the farm view with the route's spot (like the 섬 pier);
  // a sign by the water comes back.
  // The scene button reads 「역으로」 at a destination: the ride home ends at the station the line left from.
  var TRN_AT = [97, 87, 36, 21];      // 마을 lane, between the 분교 마당 people and the 나루터 signpost (top below the tree's crown)
  var TRN_TZ = -new Date().getTimezoneOffset();
  var TRN_VIEW = { valley: 'trnvalley', onsen: 'trnonsen', snow: 'trnsnow' };   // route → destination view; a route without one shows 「준비 중」
  var TRN_RIDE_MS = 2000;
  var TRN_WHY = { rep: '★이 모자라요', after: '앞 노선을 먼저 열어요', station: '포구 기차역을 먼저 고쳐요', coins: '코인이 모자라요',
    owned: '이미 열었어요', open: '노선을 먼저 열어요', have: '오늘 표가 이미 있어요', ticket: '오늘 기차표가 없어요',
    bath: '온천욕은 하루 한 번 · 내일 또 와요' };
  var TRN_ICON = ['............', '..444444....', '..400004....', '..400004.44.', '.4444444444.', '.4222222224.',
    '.4222222224.', '.4444444444.', '..44....44..', '.4..4..4..4.', '..44....44..', '............'];
  var TRN_WINDOW = [16, 40, 148, 96];
  var trnRide = null;          // { to: view, route, t0, back }
  var trnHome = 'village';     // where 「역으로」 goes (the snow line goes back to the 포구)
  var trnPrevSpot = null;      // the spot before fishing at the 계곡, put back on the way home
  var trnFrom = 'village';     // which station's sheet is open
  var trnLast = 'valley';      // the route last ridden: the ride home shows its scenery
  function trnIsView(v) { return v === 'trnride' || v === 'trnvalley' || v === 'trnonsen' || v === 'trnsnow'; }
  PLACE.trnback = ['역으로', '기차 타고 역으로 돌아가기'];
  PLACE.trnskip = ['내리기', '기차에서 바로 내리기'];

  function trnIcon12() {
    var c = document.createElement('canvas'); c.width = 12; c.height = 12;
    spr(TRN_ICON, 0, 0, false, c.getContext('2d'));
    return c;
  }
  function trnWon(n) { return n.toLocaleString('ko-KR') + '코인'; }

  // ---------- 특산물 art (x = centre, y = ground), shared with the basket icon ----------
  function trnPickArt(id, x, y) {
    if (id === 'onegg') {   // a steamed egg on a stone
      px(x - 4, y - 1, 9, 1, 3);
      px(x - 2, y - 7, 4, 1, 4); px(x - 3, y - 6, 1, 5, 4); px(x + 2, y - 6, 1, 5, 4); px(x - 2, y - 1, 4, 1, 4);
      px(x - 2, y - 6, 4, 5, 1); px(x - 1, y - 5, 1, 2, 0);
      px(x - 1, y - 10, 1, 2, 2); px(x, y - 12, 1, 2, 2);
      return;
    }
    if (id === 'oyuja') {   // a round 유자 with a leaf
      px(x - 2, y - 7, 5, 1, 4); px(x - 3, y - 6, 1, 5, 4); px(x + 3, y - 6, 1, 5, 4); px(x - 2, y - 1, 5, 1, 4);
      px(x - 2, y - 6, 5, 5, 1); px(x - 1, y - 5, 1, 1, 0); px(x + 1, y - 3, 1, 1, 2); px(x - 1, y - 2, 1, 1, 2);
      px(x, y - 9, 1, 2, 4); px(x + 1, y - 10, 3, 2, 3);
      return;
    }
    if (id === 'sice') {    // a clear crystal standing in the snow
      px(x, y - 9, 1, 1, 4); px(x - 1, y - 8, 3, 1, 4); px(x - 2, y - 7, 1, 6, 4); px(x + 2, y - 7, 1, 6, 4); px(x - 1, y - 1, 3, 1, 4);
      px(x - 1, y - 7, 3, 6, 1); px(x, y - 7, 1, 4, 0); px(x + 3, y - 4, 1, 3, 3); px(x - 3, y - 3, 1, 2, 3);
      return;
    }
    if (id === 'sflake') {  // six arms
      px(x, y - 11, 1, 11, 3); px(x - 4, y - 6, 9, 1, 3);
      for (var k = 1; k < 4; k++) { px(x - k, y - 6 - k, 1, 1, 3); px(x + k, y - 6 - k, 1, 1, 3); px(x - k, y - 6 + k, 1, 1, 3); px(x + k, y - 6 + k, 1, 1, 3); }
      px(x, y - 6, 1, 1, 0); px(x - 1, y - 11, 3, 1, 2); px(x - 1, y - 1, 3, 1, 2);
      return;
    }
    if (id === 'vsongi') {
      px(x - 1, y - 5, 3, 5, 0); px(x - 2, y - 5, 1, 5, 4); px(x + 2, y - 5, 1, 5, 4);
      px(x - 3, y - 8, 7, 3, 2); px(x - 2, y - 9, 5, 1, 4); px(x - 4, y - 6, 9, 1, 4); px(x - 3, y - 7, 1, 1, 4); px(x + 3, y - 7, 1, 1, 4);
      return;
    }
    px(x - 3, y - 4, 2, 4, 3); px(x - 1, y - 7, 2, 7, 3); px(x + 1, y - 5, 2, 5, 3); px(x + 3, y - 3, 1, 3, 3);
    px(x, y - 6, 1, 4, 4); px(x - 3, y - 1, 7, 1, 4);
  }
  function trnIcon(id) {
    var c = document.createElement('canvas'); c.width = 14; c.height = 14;
    var saved = ctx; ctx = c.getContext('2d');
    try { trnPickArt(id, 7, 13); } finally { ctx = saved; }
    return c;
  }

  // ---------- 기념품 art (yard decorations; x, y = top-left of sz) ----------
  DRAW_DECO.jangseung = function (x, y) {
    px(x + 1, y, 8, 3, 4); px(x + 2, y + 1, 6, 1, 3);                                   // hat
    px(x + 2, y + 3, 6, 19, 4); px(x + 3, y + 3, 4, 19, 1);                             // post
    px(x + 3, y + 5, 2, 1, 4); px(x + 6, y + 5, 2, 1, 4); px(x + 3, y + 6, 1, 1, 0); px(x + 6, y + 6, 1, 1, 0);   // brows, eyes
    px(x + 4, y + 8, 2, 1, 4); px(x + 3, y + 10, 4, 1, 4); px(x + 4, y + 10, 1, 1, 0);   // nose, grin
    for (var k = 0; k < 4; k++) px(x + 4, y + 13 + k * 2, 2, 1, 3);                     // carved letters
    px(x, y + 22, 10, 2, 3);
  };
  DRAW_DECO.sotdae = function (x, y, tt) {
    var b = Math.floor((tt || 0) * 0.8) % 4 === 0 ? 1 : 0;
    px(x + 4, y + 6, 1, 20, 4);
    px(x + 1, y + 3 - b, 6, 3, 4); px(x + 2, y + 4 - b, 4, 1, 1);                       // the wooden bird
    px(x + 6, y + 1 - b, 2, 2, 4); px(x + 8, y + 2 - b, 1, 1, 4); px(x, y + 2 - b, 2, 2, 4);
    px(x + 2, y + 26, 5, 2, 3);
  };
  DRAW_DECO.mulle = function (x, y, tt) {
    var cx = x + 9, cy = y + 10, a0 = (tt || 0) * 1.2, k;
    px(x + 13, y, 9, 2, 4); px(x + 14, y, 7, 1, 2);                                     // trough
    if (Math.floor((tt || 0) * 4) % 2) px(x + 14, y + 2, 1, 2, 1); else px(x + 15, y + 3, 1, 2, 1);
    for (k = 0; k < 24; k++) { var a = k / 24 * Math.PI * 2; px(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8, 1, 1, 4); }
    for (k = 0; k < 4; k++) {
      var s = a0 + k * Math.PI / 4;
      for (var r = 1; r < 8; r++) { px(cx + Math.cos(s) * r, cy + Math.sin(s) * r, 1, 1, 3); px(cx - Math.cos(s) * r, cy - Math.sin(s) * r, 1, 1, 3); }
    }
    px(cx - 1, cy - 1, 3, 3, 4);
    px(x, y + 18, 20, 2, 3);
  };

  DRAW_DECO.seokdeung = function (x, y, tt, night) {
    px(x + 1, y + 2, 10, 2, 4); px(x + 3, y, 6, 2, 4); px(x + 5, y - 1, 2, 1, 4);           // roof stone
    px(x + 2, y + 4, 8, 7, 4); px(x + 3, y + 5, 6, 5, 2);                                  // fire box
    px(x + 4, y + 6, 4, 3, night || Math.floor((tt || 0) * 3) % 4 ? 0 : 1);                // the light
    px(x + 3, y + 11, 6, 2, 4); px(x + 4, y + 13, 4, 6, 4); px(x + 5, y + 13, 2, 6, 3);    // post
    px(x + 1, y + 19, 10, 3, 4); px(x + 2, y + 19, 8, 1, 3);
  };
  DRAW_DECO.namutub = function (x, y, tt) {
    var k, w = Math.floor((tt || 0) * 1.5);
    px(x, y + 4, 22, 1, 4); px(x + 1, y + 5, 20, 8, 3); px(x + 1, y + 13, 20, 1, 4);       // rim, staves, bottom
    for (k = 3; k < 21; k += 3) px(x + k, y + 5, 1, 8, 4);
    px(x + 1, y + 7, 20, 1, 4); px(x + 1, y + 11, 20, 1, 4);                               // hoops
    px(x + 2, y + 5, 18, 1, 1);                                                             // hot water
    for (k = 0; k < 3; k++) { var sx = x + 5 + k * 6, sy = y + 2 - ((w + k) % 3); px(sx, sy, 1, 2, 1); px(sx + 1, sy - 2, 1, 2, 1); }   // steam
  };
  DRAW_DECO.igloo = function (x, y) {
    for (var j = 0; j < 14; j++) {                                                          // the dome, row by row
      var hw = Math.round(Math.sqrt(1 - Math.pow((13 - j) / 14, 2)) * 12);
      px(x + 12 - hw, y + j, hw * 2, 1, 0); px(x + 12 - hw, y + j, 1, 1, 3); px(x + 11 + hw, y + j, 1, 1, 3);
      if (j % 4 === 3) px(x + 12 - hw, y + j, hw * 2, 1, 2);                                // block courses
    }
    for (j = 0; j < 4; j++) px(x + 4 + j * 5 + (j % 2) * 2, y + 4 + j * 2, 1, 2, 2);
    px(x + 9, y + 8, 6, 6, 3); px(x + 10, y + 9, 4, 5, 4);                                 // door
    px(x, y + 14, 24, 2, 1);
  };
  DRAW_DECO.icebear = function (x, y) {
    px(x + 1, y + 4, 4, 4, 3); px(x + 2, y + 5, 2, 2, 1);                                   // head
    px(x + 1, y + 3, 1, 1, 3); px(x + 4, y + 3, 1, 1, 3); px(x, y + 6, 1, 1, 4);             // ears, nose
    px(x + 4, y + 6, 11, 6, 3); px(x + 5, y + 7, 9, 4, 1); px(x + 7, y + 7, 3, 1, 0);       // body
    px(x + 5, y + 12, 2, 4, 3); px(x + 12, y + 12, 2, 4, 3);                                // legs
    px(x + 1, y + 16, 15, 2, 2); px(x + 2, y + 16, 13, 1, 0);                               // the ice slab
  };

  // ---------- 마을 간이역 on the street ----------
  function trnDraw(tt) {
    var x = TRN_AT[0], y = TRN_AT[1], k, e = curEnv(now()), dark = e.phase === 'night' || e.phase === 'evening';
    var any = L.TRN_ROUTES.some(function (r) { return L.trnTicket(S, r.id, now(), TRN_TZ); });
    px(x, y + 18, 36, 1, 3); for (k = 0; k < 36; k += 4) px(x + k, y + 19, 2, 1, 2);        // rails + sleepers
    px(x, y + 14, 22, 3, 2); px(x, y + 14, 22, 1, 4);                                      // platform
    px(x + 5, y, 12, 3, 4); px(x + 6, y + 1, 10, 1, 0); px(x + 8, y + 1, 1, 1, 4); px(x + 12, y + 1, 2, 1, 4);   // name board
    px(x, y + 3, 22, 2, 4); px(x + 1, y + 3, 20, 1, 3);                                    // roof
    px(x + 2, y + 5, 1, 9, 4); px(x + 19, y + 5, 1, 9, 4);                                 // posts
    px(x + 6, y + 10, 10, 1, 3); px(x + 7, y + 11, 1, 3, 4); px(x + 14, y + 11, 1, 3, 4); // bench
    px(x + 30, y + 5, 1, 13, 4); px(x + 28, y + 3, 5, 3, 4);                               // signal post: lit while a ticket is good today
    px(x + 29, y + 4, 3, 1, any ? (dark || Math.floor(tt * 2) % 2 ? 0 : 1) : 3);
  }
  function trnTap(x, y) {
    if (!hit(TRN_AT, x, y, 1)) return false;
    trnOpenSheet('village');
    return true;
  }
  // 포구 기차역 (port.js): once repaired, the station building opens the 설원행 sheet
  function tapPortExtra_train(x, y) {
    if (!L.portDone(S, 'station') || !hit(PORT_AT.station, x, y, 1)) return false;
    trnOpenSheet('port');
    return true;
  }

  // ---------- the station sheet: every route of this station (and where the others leave from) ----------
  function trnOpenSheet(from) {
    if (reel) return;
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true;
    trnFrom = from; sheetKind = 'train'; sheetEl.hidden = false;
    trnRender();
  }
  function trnBtn(r, text, fn, label, off) {
    var a = r.querySelector('.acts');
    if (!a) { a = document.createElement('div'); a.className = 'acts'; r.appendChild(a); }
    a.appendChild(act(text, fn, { cls: 'max b', label: label || text, off: off }));
  }
  function trnRender() {
    var t = now(), keep = sheetEl.scrollTop;
    sheetHead(trnFrom === 'port' ? '포구 기차역' : '마을 간이역');
    var say = document.createElement('p'); say.className = 'say';
    say.textContent = trnFrom === 'port' ? '역무원: 고친 역에서 다시 기차가 떠나요. 고개 너머 설원까지 가요.' : '역무원: 어디로 가세요? 표 한 장이면 오늘 하루 몇 번이든 오가요.';
    sheetEl.appendChild(say);
    var h3 = document.createElement('h3'); h3.textContent = '노선';
    var hb = document.createElement('b'); hb.textContent = '표는 자정까지'; h3.appendChild(hb);
    sheetEl.appendChild(h3);
    L.TRN_ROUTES.forEach(function (r) {
      var here = r.from === trnFrom, st = L.trnStatus(S, r.id);
      if (!here && trnFrom === 'port') return;
      if (!here) {   // the 설원행 leaves from the 포구
        sheetRow(trnIcon12(), r.name, '포구 기차역에서 출발 · ' + (st === 'owned' ? '개통했어요' : st === 'station' ? '포구 기차역을 고치면' : TRN_WHY[st] || ''), 'idle');
        return;
      }
      var open = L.TRN_OPEN[r.id], fare = L.TRN_FARE[r.id], row;
      if (st === 'rep') { row = sheetRow(trnIcon12(), r.name, '★' + r.rep + '이 되면 열 수 있어요 · 지금 ★' + S.rep, 'idle'); trnBtn(row, '잠김', function () {}, r.name + ' 잠김', true); return; }
      if (st === 'after' || st === 'station') {
        row = sheetRow(trnIcon12(), r.name, st === 'after' ? L.trnRoute(r.after).name + ' 노선을 먼저 열어요' : '포구 기차역을 고치면 열려요', 'idle');
        trnBtn(row, '잠김', function () {}, r.name + ' 잠김', true); return;
      }
      if (st !== 'owned') {
        row = sheetRow(trnIcon12(), r.name, '개통비 ' + trnWon(open) + ' · 한 번만 · 그 뒤로는 기차표 ' + trnWon(fare));
        trnBtn(row, open.toLocaleString('ko-KR'), function () {
          var res = L.trnOpen(S, r.id, now());
          if (!res.ok) { toast(TRN_WHY[res.why] || '열 수 없어요'); return; }
          toast('★ ' + r.name + ' 노선 개통! · 기차표를 사서 타요', 3000); burst(TRN_AT[0] + 10, TRN_AT[1] + 8, 14, 0, 50);
          refresh(); trnRender();
        }, r.name + ' 개통 ' + open + '코인', S.coins < open);
        return;
      }
      var tk = L.trnTicket(S, r.id, t, TRN_TZ), ready = !!TRN_VIEW[r.id];
      row = sheetRow(trnIcon12(), r.name, tk ? '오늘 표 있음 · 오늘은 몇 번이든' : '기차표 ' + trnWon(fare) + ' · 오늘 하루');
      if (!tk) trnBtn(row, '표 ' + fare.toLocaleString('ko-KR'), function () {
        var res = L.trnBuyTicket(S, r.id, now(), TRN_TZ);
        if (!res.ok) { toast(TRN_WHY[res.why] || '살 수 없어요'); return; }
        toast(r.name + '행 기차표 · 오늘 하루 몇 번이든', 2400);
        refresh(); trnRender();
      }, r.name + ' 기차표 사기 ' + fare + '코인', S.coins < fare);
      trnBtn(row, ready ? '타기' : '준비 중', function () { trnGetOn(r.id); }, r.name + (ready ? ' 타기' : ' 준비 중'), !tk || !ready);
    });
    var p = document.createElement('p'); p.className = 'note';
    p.textContent = '개통은 한 번 · 기차표는 산 날(현실 날짜) 하루 동안 몇 번이든 · 날이 바뀌면 새 표 · 시계를 되돌려도 같은 날 표를 두 번 사지 않아요';
    sheetEl.appendChild(p);
    sheetEl.scrollTop = keep;
  }
  function trnGetOn(id) {
    var res = L.trnBoard(S, id, now(), TRN_TZ);
    if (!res.ok) { toast(TRN_WHY[res.why] || '탈 수 없어요'); return; }
    if (!TRN_VIEW[id]) { toast('준비 중이에요'); return; }
    trnHome = L.trnRoute(id).from; trnLast = id;
    trnStartRide(TRN_VIEW[id], id, false);
  }

  // ---------- the ride: scenery sliding past the window ----------
  function trnStartRide(to, route, back) {
    closeSheet();
    trnRide = { to: to, route: route, t0: performance.now(), back: back };
    goScene('trnride');
  }
  // off a route's spot: back to the spot before it (or the 연못), with goSpot's cleanup; a line in the water is lost
  function trnSpotBack() {
    if (!TRN_VIEW[L.curSpot(S)]) return;
    if (S.fish.phase === 'bite') S.fish = { phase: 'idle' };
    if (!L.setSpot(S, trnPrevSpot && L.spotUnlocked(S, trnPrevSpot) ? trnPrevSpot : 'pond')) return;
    castAnim = null; scareFx = null; swimmers = []; nextSwim = 1;
    setScene();
  }
  // goScene: leaving the farm view for anywhere but the spot's own destination puts the spot back
  function trnLeaveFarm(sc) { var sp = L.curSpot(S); if (TRN_VIEW[sp] && sc !== TRN_VIEW[sp]) trnSpotBack(); }
  function trnArrive() {
    var r = trnRide;
    trnRide = null;
    if (!r) { goScene(trnHome); return; }
    if (r.back) trnSpotBack();
    goScene(r.to);
    toast(r.back ? (r.to === 'port' ? '포구 기차역' : '마을 간이역') + '에 내렸다' : L.trnRoute(r.route).name + '에 도착 · 「역으로」 버튼으로 돌아가요', 2400);
    refresh();
  }
  // the scene button at a destination / on the train
  function trnGo(sc) {
    if (sc === 'trnskip' || view === 'trnride') { trnArrive(); return; }
    trnStartRide(trnHome, null, true);
  }
  function trnDests() { return view === 'trnride' ? ['trnskip'] : ['trnback']; }
  // the window: 계곡 = high ridges, 온천 = low hills with steam rising, 설원 = white ridges, snow fields, snowfall
  function trnDrawRide(tt) {
    var r = trnRide, el = r ? (performance.now() - r.t0) / 1000 : 9, w = TRN_WINDOW, off = el * 110, bob = reduceMotion ? 0 : Math.floor(el * 7) % 2, k, x;
    var kind = (r && r.route) || trnLast, hill = kind === 'onsen' ? 0.5 : 1, snowy = kind === 'snow';
    if (r && el * 1000 >= TRN_RIDE_MS) { trnArrive(); return; }
    px(0, 0, W, H, 3);
    for (k = 0; k < W; k += 6) px(k, 0, 3, H, 2);                                           // wall boards
    ctx.save(); ctx.beginPath(); ctx.rect(w[0], w[1] + bob, w[2], w[3]); ctx.clip();
    px(w[0], w[1], w[2], w[3] + 2, 0);
    for (x = 0; x < w[2]; x++) {                                                              // far ridge, slow
      var u = x + off * 0.15, h = Math.round((22 + Math.sin(u / 19) * 9 + Math.sin(u / 7) * 3) * hill);
      px(w[0] + x, w[1] + w[3] - 26 - h, 1, h + 26, (u | 0) % 3 ? 2 : 1);
      if (snowy) { px(w[0] + x, w[1] + w[3] - 26 - h, 1, 1, 3); px(w[0] + x, w[1] + w[3] - 25 - h, 1, 3 + ((u | 0) % 4 === 0 ? 1 : 0), 0); }   // white caps under a dark edge
    }
    if (kind === 'onsen') for (k = 0; k < 5; k++) {                                         // steam from the hot springs
      var sx = w[0] + ((k * 47 + 20 - off * 0.15) % 240 + 240) % 240 - 30, rise = (tt * 6 + k * 5) % 18;
      for (var q = 0; q < 4; q++) px(sx + Math.round(Math.sin(tt * 2 + q + k) * 2), w[1] + w[3] - 34 - q * 4 - rise, 3, 2, 0);
    }
    px(w[0], w[1] + w[3] - 18, w[2], 20, snowy ? 0 : 1);                                    // fields (snow on the 설원 line)
    for (k = 0; k < 14; k++) {                                                               // near trees, fast
      var tx = w[0] + ((hash(k * 7 + 1) * 300 - off * 1.1) % 300 + 300) % 300 - 20, ty = w[1] + w[3] - 10;
      px(tx, ty - 10, 6, 10, 4); px(tx + 1, ty - 14, 4, 4, 4); px(tx + 2, ty, 2, 4, 4);
      if (snowy) { px(tx + 1, ty - 14, 4, 1, 0); px(tx, ty - 10, 6, 1, 0); }
    }
    if (snowy && !reduceMotion) for (k = 0; k < 30; k++) px(w[0] + ((hash(k * 3) * w[2] - off * 0.6) % w[2] + w[2]) % w[2], w[1] + (hash(k * 5 + 1) * w[3] + el * 30) % w[3], 1, 1, 0);
    for (k = 0; k < 4; k++) {                                                                // poles and the wire between
      var pxx = w[0] + ((k * 60 - off * 1.6) % 240 + 240) % 240 - 30;
      px(pxx, w[1] + 8, 2, w[3], 4); px(pxx - 3, w[1] + 10, 8, 1, 4);
    }
    px(w[0], w[1] + 11, w[2], 1, 4);
    ctx.restore();
    px(w[0] - 3, w[1] - 3 + bob, w[2] + 6, 3, 4); px(w[0] - 3, w[1] + w[3] + bob, w[2] + 6, 4, 4);   // frame
    px(w[0] - 3, w[1] + bob, 3, w[3], 4); px(w[0] + w[2], w[1] + bob, 3, w[3], 4); px(w[0] + w[2] / 2 - 1, w[1] + bob, 2, w[3], 4);
    for (k = 0; k < 2; k++) { px(20 + k * 76, 150, 64, 30, 4); px(22 + k * 76, 152, 60, 26, 1); px(22 + k * 76, 158, 60, 1, 2); }   // seat backs
    var p = Math.min(1, el * 1000 / TRN_RIDE_MS);                                            // how far along
    px(30, 190, 120, 3, 4); px(31, 191, Math.round(118 * p), 1, 0);
  }

  // ---------- 산골 계곡 view ----------
  var TRN_SHOP = [8, 64, 40, 36];
  var TRN_VSTN = [4, 168, 48, 30];
  var TRN_VSPOTS = [[64, 128], [96, 100], [158, 150]];
  function trnStreamX(y) { return 150 - (y - 60) * 0.45 + Math.sin(y / 18) * 8; }
  function trnInStream(x, y, k) { return y >= 58 && Math.abs(x - trnStreamX(y)) < (k || 10); }
  function trnRidge(x) { return 44 + Math.round(Math.sin(x / 23) * 10 + Math.sin(x / 9 + 1) * 6); }
  var bgTrnValley = document.createElement('canvas'); bgTrnValley.width = W; bgTrnValley.height = H;
  (function paintValley() {
    var saved = ctx; ctx = bgTrnValley.getContext('2d');
    for (var y = 26; y < H; y++) for (var x = 0; x < W; x++) {
      var d = Math.abs(x - trnStreamX(y)), c;
      if (y < trnRidge(x)) c = (x + y) % 3 === 0 ? 3 : 2;                                           // mountains
      else if (y >= 58 && d < 10) c = d < 4 ? ((x + y) % 2 ? 2 : 1) : d > 8 ? 2 : ((x % 4 === 0 && y % 2 === 0) ? 2 : 1);   // stream
      else if (y >= 58 && d < 13) c = (x + y * 3) % 5 === 0 ? 2 : (x * 7 + y) % 13 === 0 ? 3 : 0;    // pebbles
      else c = hash(x * 131 + y * 7) < 0.05 ? 1 : 0;
      px(x, y, 1, 1, c);
    }
    for (x = 0; x < W; x++) px(x, 26, 1, 1, 3);
    [[20, 66], [40, 150], [170, 90], [150, 190], [176, 130], [12, 112], [120, 74]].forEach(function (t) {   // pines
      for (var j = 0; j < 12; j++) px(t[0] - Math.floor(j / 2), t[1] - 12 + j, 1 + Math.floor(j / 2) * 2, 1, j % 3 ? 3 : 4);
      px(t[0], t[1], 1, 3, 4);
    });
    [[118, 112], [104, 150], [86, 176]].forEach(function (r) {   // boulders in the stream
      var sx = Math.round(trnStreamX(r[1])) - 3;
      px(sx, r[1] - 3, 6, 1, 4); px(sx - 1, r[1] - 2, 8, 3, 4); px(sx, r[1] - 2, 5, 1, 1); px(sx - 2, r[1] + 1, 10, 1, 0);
    });
    trnPaintStop(2);
    ctx = saved;
  })();
  // 기념품 가게 (thatched roof, wall, window of goods, door, a board) and the platform you got off at; roof = its shade
  function trnPaintStop(roof) {
    var s = TRN_SHOP, k;
    for (k = 0; k < 12; k++) px(s[0] + 20 - (8 + k * 1.6), s[1] + k, 16 + k * 3.2, 1, k % 2 ? 3 : roof);
    px(s[0] + 1, s[1] + 12, 38, 22, 4); px(s[0] + 2, s[1] + 13, 36, 21, 1);
    px(s[0] + 5, s[1] + 16, 14, 9, 4); px(s[0] + 6, s[1] + 17, 12, 7, 0);
    px(s[0] + 8, s[1] + 19, 2, 5, 4); px(s[0] + 12, s[1] + 18, 1, 6, 3); px(s[0] + 15, s[1] + 21, 3, 3, 4);
    px(s[0] + 24, s[1] + 18, 9, 16, 4); px(s[0] + 25, s[1] + 19, 7, 15, 3); px(s[0] + 30, s[1] + 26, 1, 1, 0);
    px(s[0] + 10, s[1] - 1, 20, 5, 4); px(s[0] + 11, s[1], 18, 3, 0); px(s[0] + 13, s[1] + 1, 14, 1, 2);
    // the platform you got off at: slab, shelter, rails
    var p = TRN_VSTN;
    px(0, p[1] + 25, 64, 1, 3); for (k = 0; k < 64; k += 4) px(k, p[1] + 26, 2, 1, 2);
    px(p[0], p[1] + 18, p[2], 4, 2); px(p[0], p[1] + 18, p[2], 1, 4);
    px(p[0] + 4, p[1] + 2, 30, 3, 4); px(p[0] + 5, p[1] + 3, 28, 1, 3); px(p[0] + 6, p[1] + 5, 1, 13, 4); px(p[0] + 31, p[1] + 5, 1, 13, 4);
    px(p[0] + 10, p[1] - 3, 18, 5, 4); px(p[0] + 11, p[1] - 2, 16, 3, 0); px(p[0] + 13, p[1] - 1, 4, 1, 4); px(p[0] + 20, p[1] - 1, 5, 1, 4);
    px(p[0] + 38, p[1] + 6, 1, 12, 4); px(p[0] + 36, p[1] + 4, 5, 3, 4);
  }
  function trnDrawValley(tt) {
    var t = now(), e = curEnv(t), night = e.phase === 'night', k;
    ctx.drawImage(bgTrnValley, 0, 0);
    drawSky(tt, e.phase);
    var fx = Math.round(trnStreamX(58)), top = trnRidge(fx);                                    // the waterfall feeding the stream
    for (k = -5; k <= 5; k++) for (var y = top; y < 60; y++) if ((y + Math.floor(tt * 14) + k * 3) % 5 === 0) px(fx + k, y, 1, 2, 0); else if (k === -5 || k === 5) px(fx + k, y, 1, 1, 2);
    if (!reduceMotion) for (k = 0; k < 16; k++) {                                              // ripples running down
      var yy = 60 + ((hash(k * 7 + 3) * 140 + tt * 18) % 140), xx = trnStreamX(yy) + (hash(k * 5) - 0.5) * 10;
      px(xx, yy, 2, 1, 0);
    }
    var ps = L.trnPicksNow(S, 'valley', t);
    TRN_VSPOTS.forEach(function (sp, j) {
      px(sp[0] - 5, sp[1] + 1, 11, 1, 2);
      if (!ps[j]) { px(sp[0] - 1, sp[1] - 1, 1, 1, 3); px(sp[0] + 2, sp[1], 1, 1, 3); return; }
      trnPickArt(ps[j], sp[0], sp[1]);
      if (ps[j] === 'vsongi') sparkle(sp[0] + 6, sp[1] - 10, tt + j * 0.4);
    });
    drawYardWeather(tt, e.weather);
    if (night || e.phase === 'evening') { ctx.globalAlpha = night ? 0.36 : 0.14; px(0, 0, W, H, 4); ctx.globalAlpha = 1; }
    if (night) drawStars(tt);
  }
  function trnTapValley(x, y) {
    var t = now();
    if (hit(TRN_VSTN, x, y, 1)) { trnGo('trnback'); return; }
    if (hit(TRN_SHOP, x, y, 1)) { trnOpenShop('valley'); return; }
    if (trnTapPick('valley', TRN_VSPOTS, x, y, t)) return;
    if (trnInStream(x, y, 13)) { trnFish('valley'); return; }
    var nx = L.trnPickNext(S, 'valley', t);
    toast('산골 계곡 · 계곡물을 누르면 낚시 · 산나물·송이버섯 줍기 · 기념품 가게 · 승강장이나 「역으로」로 돌아가기' + (nx !== null && !L.trnPicksNow(S, 'valley', t).some(Boolean) ? ' · 다음 특산물 ' + fmtLeft(Math.max(0, nx - t)) : ''), 3000);
  }
  // a 특산물 spot under the tap? picks it (or says when it regrows) → true
  function trnTapPick(route, spots, x, y, t) {
    for (var k = 0; k < spots.length; k++) {
      var sp = spots[k];
      if (!hit([sp[0] - 7, sp[1] - 11, 14, 14], x, y, 2)) continue;
      var p = S.train.pick[route][k];
      if (!L.trnPicksNow(S, route, t)[k]) { toast('다시 돋는 중 · ' + fmtLeft(Math.max(0, p.at - t)), 1800); return true; }
      if (bagStop()) return true;
      var r = L.trnPick(S, route, k, t, Math.random, TRN_TZ);
      if (!r) return true;
      var it = L.trnItem(r.id), rare = it.w < 50;
      burst(sp[0], sp[1] - 4, rare ? 12 : 6, 0, 50);
      floatText('+' + it.name, sp[0], sp[1] - 12);
      toast((r.first ? '★ 처음 · ' : '') + it.name + (r.sold ? ' · 바구니가 꽉 차 바로 팔았다 +' + r.sold : ' · 바구니에'), 2200);
      refresh(); return true;
    }
    return false;
  }
  var TRN_FISH_SAY = { valley: '계곡 낚시 · 물을 눌러 던지기 · 물가 팻말을 누르면 계곡 마을로',
    onsen: '온천 호수 낚시 · 물을 눌러 던지기 · 물가 팻말을 누르면 온천 마을로',
    snow: '얼음낚시 · 얼음을 눌러 구멍에 던지기 · 물가 팻말을 누르면 설원 고개로' };
  function trnFish(route) {
    var was = L.curSpot(S);
    if (was !== route && !goSpot(route)) { toast('줄을 걷고 나서 옮길 수 있어요', 2000); return; }
    if (was !== route && !TRN_VIEW[was]) trnPrevSpot = was;
    goScene('farm');
    toast(TRN_FISH_SAY[route], 2800);
  }

  // ---------- farm view at a route's spot: 계곡 boulders / 온천 steam, and a sign back up to the destination ----------
  var TRN_FARM_SIGN = [118, 108, 16, 16];   // 계곡: below the fence posts, clear of the 강 bank
  var TRN_LAKE_SIGN = [20, 170, 16, 16];    // 온천·설원 (the 연못 shape): bottom-left shore, clear of the water and the rod
  function trnFarmSign() { return scene === 'valley' ? TRN_FARM_SIGN : TRN_LAKE_SIGN; }
  function drawTrnWater(tt) {
    if (!TRN_VIEW[scene]) return;
    if (scene === 'valley') [[150, 150], [124, 186], [176, 172]].forEach(function (r) {
      px(r[0] - 4, r[1] - 3, 8, 1, 4); px(r[0] - 5, r[1] - 2, 10, 3, 4); px(r[0] - 4, r[1] - 2, 6, 1, 1); px(r[0] - 6, r[1] + 1, 12, 1, reduceMotion || Math.floor(tt * 2) % 2 ? 0 : 2);
    });
    if (scene === 'onsen' && !reduceMotion) trnSteam(tt, [[POND.cx - 30, POND.cy + 4], [POND.cx + 20, POND.cy - 10], [POND.cx + 34, POND.cy + 16]], 14);
    var s = trnFarmSign();
    px(s[0] + 7, s[1] + 5, 1, 11, 4); px(s[0], s[1], 16, 7, 4); px(s[0] + 1, s[1] + 1, 14, 5, 0);
    for (var k = 0; k < 5; k++) px(s[0] + 3 + k * 2, s[1] + 4 - (k % 3), 2, 1, 3);           // a little ridge
    px(s[0] - 2, s[1] + 2, 2, 3, 4);                                                        // arrow back
  }
  function tapTrnWater(x, y) {
    if (view !== 'farm' || !TRN_VIEW[scene] || S.fish.phase !== 'idle' || !hit(trnFarmSign(), x, y, 2)) return false;
    var res = L.trnBoard(S, scene, now(), TRN_TZ);
    if (!res.ok) { toast(TRN_WHY[res.why] || '탈 수 없어요', 2000); trnSpotBack(); refresh(); return true; }
    goScene(TRN_VIEW[scene]);
    return true;
  }

  // ---------- 온천 마을 / 설원 고개 views: same stop (shop, platform) and 특산물 spots, a lake below; the 온천 has a bath house ----------
  var TRN_LAKE = { cx: 128, cy: 152, rx: 42, ry: 22 };
  var TRN_DSPOTS = [[62, 122], [74, 158], [118, 192]];
  var TRN_BATH = [98, 56, 56, 42], TRN_POOL = [100, 100, 52, 14];
  function trnLakeD(x, y) { var a = (x - TRN_LAKE.cx) / TRN_LAKE.rx, b = (y - TRN_LAKE.cy) / TRN_LAKE.ry; return a * a + b * b; }
  // steam: little puffs drifting up from each source (x, y), h px high
  function trnSteam(tt, at, h) {
    at.forEach(function (p, j) {
      for (var q = 0; q < 3; q++) {
        var rise = (tt * 5 + j * 4 + q * h / 3) % h;
        px(p[0] + Math.round(Math.sin(tt * 1.6 + q + j) * 2), p[1] - rise, 2, 1, 0);
      }
    });
  }
  function trnPaintDest(route) {
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var saved = ctx, snow = route === 'snow', k;
    ctx = c.getContext('2d');
    for (var y = 26; y < H; y++) for (var x = 0; x < W; x++) {
      var r = snow ? trnRidge(x) : 52 + Math.round(Math.sin(x / 31) * 6 + Math.sin(x / 11) * 2), d = trnLakeD(x, y), cc;
      if (y < r) cc = snow && y > r - 4 ? 0 : (x + y) % 3 === 0 ? 3 : 2;                          // ridges (white caps on the 설원)
      else if (d < 1) cc = snow ? (d > 0.9 ? 2 : (x * 2 + y * 5) % 17 === 0 ? 2 : 1) : (d > 0.9 ? 2 : d < 0.35 ? ((x + y) % 2 ? 2 : 1) : (x % 4 === 0 && y % 2 === 0 ? 2 : 1));
      else if (d < 1.2) cc = (x + y * 3) % 5 === 0 ? 2 : (x * 7 + y) % 13 === 0 ? 3 : 0;            // shore stones
      else cc = hash(x * 131 + y * 7) < 0.05 ? 1 : 0;
      px(x, y, 1, 1, cc);
    }
    for (x = 0; x < W; x++) px(x, 26, 1, 1, 3);
    [[20, 62], [44, 112], [172, 92], [164, 196], [14, 118], [90, 66]].forEach(function (t) {     // pines (snow on their tiers)
      for (var j = 0; j < 12; j++) px(t[0] - Math.floor(j / 2), t[1] - 12 + j, 1 + Math.floor(j / 2) * 2, 1, snow && j % 4 === 0 ? 0 : j % 3 ? 3 : 4);
      px(t[0], t[1], 1, 3, 4);
    });
    if (snow) {
      [[112, 150], [140, 158]].forEach(function (h) { px(h[0] - 3, h[1] - 1, 7, 3, 4); px(h[0] - 4, h[1], 9, 1, 4); px(h[0] - 2, h[1], 5, 1, 3); px(h[0] - 4, h[1] + 2, 9, 1, 2); });   // ice holes
      [[96, 144, 1], [150, 146, -1]].forEach(function (cr) { for (k = 0; k < 10; k++) px(cr[0] + k, cr[1] + Math.round(Math.sin(k) * 1.5) * cr[2], 1, 1, 2); });
    } else {
      var b = TRN_BATH, p = TRN_POOL;                                                         // bath house: tiled roof, wall, curtain door, ♨ board
      for (k = 0; k < 10; k++) px(b[0] + 8 - k, b[1] + k, b[2] - 16 + k * 2, 1, k % 3 === 2 ? 3 : 4);
      px(b[0] + 3, b[1] + 10, b[2] - 6, 22, 4); px(b[0] + 4, b[1] + 11, b[2] - 8, 21, 1);
      px(b[0] + 22, b[1] + 16, 12, 16, 4); px(b[0] + 23, b[1] + 17, 10, 5, 2);
      for (k = 0; k < 4; k++) px(b[0] + 23 + k * 3, b[1] + 22, 1, 10, 3);
      px(b[0] + 7, b[1] + 15, 10, 8, 4); px(b[0] + 8, b[1] + 16, 8, 6, 0); px(b[0] + 41, b[1] + 15, 8, 8, 4); px(b[0] + 42, b[1] + 16, 6, 6, 0);
      px(b[0] + 18, b[1] - 6, 20, 7, 4); px(b[0] + 19, b[1] - 5, 18, 5, 0);
      px(b[0] + 23, b[1] - 3, 10, 1, 4); px(b[0] + 23, b[1] - 2, 1, 1, 4); px(b[0] + 32, b[1] - 2, 1, 1, 4);   // the ♨ bowl
      for (k = 0; k < 3; k++) { px(b[0] + 25 + k * 3, b[1] - 5, 1, 1, 4); px(b[0] + 26 + k * 3, b[1] - 4, 1, 1, 4); }
      px(p[0], p[1], p[2], p[3], 3); px(p[0] + 2, p[1] + 2, p[2] - 4, p[3] - 4, 1);              // the outdoor pool: stones, water
      for (k = 0; k < p[2]; k += 5) px(p[0] + k, p[1], 3, 1, 4);
      px(p[0] + 4, p[1] + 4, 8, 1, 2); px(p[0] + 30, p[1] + 8, 10, 1, 2);
    }
    trnPaintStop(snow ? 0 : 2);
    ctx = saved;
    return c;
  }
  var bgTrnDest = {};
  function trnDrawDest(route, tt) {
    var t = now(), e = curEnv(t), night = e.phase === 'night', k;
    if (!bgTrnDest[route]) bgTrnDest[route] = trnPaintDest(route);
    ctx.drawImage(bgTrnDest[route], 0, 0);
    drawSky(tt, e.phase);
    var ps = L.trnPicksNow(S, route, t);
    TRN_DSPOTS.forEach(function (sp, j) {
      px(sp[0] - 5, sp[1] + 1, 11, 1, 2);
      if (!ps[j]) { px(sp[0] - 1, sp[1] - 1, 1, 1, 3); px(sp[0] + 2, sp[1], 1, 1, 3); return; }
      trnPickArt(ps[j], sp[0], sp[1]);
      if (L.trnItem(ps[j]).w < 50) sparkle(sp[0] + 6, sp[1] - 10, tt + j * 0.4);
    });
    if (route === 'onsen') {
      if (!reduceMotion) trnSteam(tt, [[TRN_POOL[0] + 10, TRN_POOL[1] + 2], [TRN_POOL[0] + 26, TRN_POOL[1] + 2], [TRN_POOL[0] + 42, TRN_POOL[1] + 2],
        [TRN_LAKE.cx - 20, TRN_LAKE.cy - 4], [TRN_LAKE.cx + 16, TRN_LAKE.cy + 6]], 16);
      if (L.trnBathLeft(S, t)) for (k = 0; k < 2; k++) sparkle(TRN_POOL[0] + 14 + k * 24, TRN_POOL[1] - 4, tt + k * 0.5);   // bathed: it glints
    }
    drawYardWeather(tt, route === 'snow' && e.weather === 'rain' ? 'snow' : e.weather);   // rain falls as snow up on the pass
    if (night || e.phase === 'evening') { ctx.globalAlpha = night ? 0.36 : 0.14; px(0, 0, W, H, 4); ctx.globalAlpha = 1; }
    if (night) drawStars(tt);
  }
  function trnTapDest(route, x, y) {
    var t = now();
    if (hit(TRN_VSTN, x, y, 1)) { trnGo('trnback'); return; }
    if (hit(TRN_SHOP, x, y, 1)) { trnOpenShop(route); return; }
    if (route === 'onsen' && (hit(TRN_BATH, x, y, 1) || hit(TRN_POOL, x, y, 1))) { trnTakeBath(); return; }
    if (trnTapPick(route, TRN_DSPOTS, x, y, t)) return;
    if (trnLakeD(x, y) < 1.15) { trnFish(route); return; }
    var nx = L.trnPickNext(S, route, t), names = L.TRN_PICKS.filter(function (p) { return p.route === route; }).map(function (p) { return p.name; }).join('·');
    toast(L.trnRoute(route).name + ' · ' + (route === 'snow' ? '얼음 호수를 누르면 얼음낚시' : '호수를 누르면 낚시 · 온천장을 누르면 하루 한 번 온천욕') + ' · ' + names + ' 줍기 · 기념품 가게 · 승강장이나 「역으로」로 돌아가기' +
      (nx !== null && !L.trnPicksNow(S, route, t).some(Boolean) ? ' · 다음 특산물 ' + fmtLeft(Math.max(0, nx - t)) : ''), 3000);
  }

  // ---------- 온천욕 and its header chip (minutes of quicker bites left) ----------
  function trnTakeBath() {
    var t = now(), res = L.trnBath(S, t, TRN_TZ), left = L.trnBathLeft(S, t);
    if (!res.ok) { toast((TRN_WHY[res.why] || '지금은 못 해요') + (left ? ' · 입질 빠르게 ' + Math.ceil(left / SPEED / 60e3) + '분 남음' : ''), 2400); return; }
    burst(TRN_POOL[0] + 26, TRN_POOL[1] + 4, 14, 0, 40);
    toast('♨ 온천욕 · 한 시간 동안 어디서 낚든 입질이 빨라져요', 3200);
    refresh();
  }
  var trnBathChip = document.createElement('button');
  trnBathChip.type = 'button'; trnBathChip.id = 'trnBathChip'; trnBathChip.hidden = true;
  trnBathChip.title = '온천욕 · 입질이 빨라진다'; trnBathChip.setAttribute('aria-label', '온천욕 남은 시간 자세히');
  var trnBathIcon = document.createElement('canvas'); trnBathIcon.width = 7; trnBathIcon.height = 7;
  spr(['.4.4.4.', '4.4.4..', '.4.4.4.', '.......', '4.....4', '4.....4', '.44444.'], 0, 0, false, trnBathIcon.getContext('2d'));
  var trnBathLabel = document.createElement('span');
  trnBathChip.appendChild(trnBathIcon); trnBathChip.appendChild(trnBathLabel);
  coinsEl.after(trnBathChip);
  trnBathChip.addEventListener('click', function () {
    var left = L.trnBathLeft(S, now());
    if (left) toast('♨ 온천욕 · 입질 대기 ×' + L.TRN_BATH_MUL + ' · ' + fmtReal(left) + ' 남음', 3000);
  });
  function trnTick(t) {
    var left = L.trnBathLeft(S, t);
    trnBathChip.hidden = !left;
    if (left) trnBathLabel.textContent = Math.max(1, Math.ceil(left / SPEED / 60e3)) + '분';
  }

  // ---------- 기념품 가게 sheet ----------
  var trnShopRoute = 'valley';
  function trnOpenShop(route) {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true;
    trnShopRoute = route; sheetKind = 'trnshop'; sheetEl.hidden = false;
    trnRenderShop();
  }
  function trnRenderShop() {
    sheetHead(L.trnRoute(trnShopRoute).name + ' 기념품 가게');
    var say = document.createElement('p'); say.className = 'say';
    say.textContent = '주인: 여기서만 파는 거예요. 마당에 두면 여행 생각이 날 거예요.';
    sheetEl.appendChild(say);
    L.TRN_SOUVENIRS.filter(function (w) { return w.route === trnShopRoute; }).forEach(function (w) {
      var have = !!(S.yard && S.yard.deco[w.id]);
      var r = sheetRow(decoIcon(w.id), w.name, have ? '샀어요 · 마당 꾸미기에서 옮기기' : '마당 장식 · 하나만 살 수 있어요', have ? 'idle' : '');
      trnBtn(r, have ? '있음' : w.cost.toLocaleString('ko-KR'), function () {
        var res = L.trnBuySouvenir(S, w.id, now(), TRN_TZ);
        if (!res.ok) { toast(TRN_WHY[res.why] || (res.why === 'owned' ? '이미 샀어요' : '살 수 없어요')); return; }
        toast(w.name + (res.stored ? ' · 보관함에' : ' · 마당에 놓았다'), 2400);
        refresh(); trnRenderShop();
      }, w.name + ' 사기 ' + w.cost + '코인', have || S.coins < w.cost);
    });
  }

  // ---------- views (yard.js drawScene/tapScene) ----------
  function trnDrawView(tt) { if (view === 'trnride') trnDrawRide(tt); else if (view === 'trnvalley') trnDrawValley(tt); else trnDrawDest(view === 'trnonsen' ? 'onsen' : 'snow', tt); }
  function trnTapView(x, y) { if (view === 'trnride') trnArrive(); else if (view === 'trnvalley') trnTapValley(x, y); else trnTapDest(view === 'trnonsen' ? 'onsen' : 'snow', x, y); }

  // ---------- console hooks ----------
  function addTrnHooks(FF) {
    function openRoute(id) {
      var r = L.trnRoute(id);
      if (!L.villageOk(S)) S.rep = Math.max(S.rep, L.VILLAGE_REP);
      if (!L.trnOk(S, id)) {
        if (r.rep) S.rep = Math.max(S.rep, r.rep);
        if (r.after) openRoute(r.after);
        if (r.station) { S.port = S.port || { got: {}, done: {} }; S.port.done.station = true; }
        S.coins += L.TRN_OPEN[id];
        L.trnOpen(S, id, now());
      }
      if (!L.trnTicket(S, id, now(), TRN_TZ)) { S.coins += L.TRN_FARE[id]; L.trnBuyTicket(S, id, now(), TRN_TZ); }   // today's ticket: picks and 기념품 need it
    }
    // FF.train() opens the 마을 간이역; FF.train('valley' | 'onsen' | 'snow') opens the route (and the ones before it),
    // buys today's ticket and rides; FF.train('pick', route = 'valley') makes every 특산물 spot ready and goes there;
    // FF.train('souvenir') gives the coins for every 기념품, buys them and shows the 마당; FF.train('bath') opens the 온천,
    // forgets today's 온천욕 and takes one → s.train
    FF.train = function (cmd, arg) {
      if (cmd === 'souvenir') {
        L.TRN_SOUVENIRS.forEach(function (w) { openRoute(w.route); if (!(S.yard && S.yard.deco[w.id])) { S.coins += w.cost; L.trnBuySouvenir(S, w.id, now(), TRN_TZ); } });
        closeSheet(); goScene('yard'); refresh();
      } else if (cmd === 'pick') {
        var to = TRN_VIEW[arg] ? arg : 'valley';
        openRoute(to);
        Object.keys(S.train.pick).forEach(function (id) { S.train.pick[id].forEach(function (p) { p.at = 0; }); });
        closeSheet(); goScene(TRN_VIEW[to]); refresh();
      } else if (cmd === 'bath') {
        openRoute('onsen');
        delete S.train.bath;
        closeSheet(); goScene('trnonsen'); trnTakeBath();
      } else if (L.trnRoute(cmd)) {
        openRoute(cmd);
        refresh();
        if (TRN_VIEW[cmd]) trnGetOn(cmd); else trnOpenSheet(L.trnRoute(cmd).from);
      } else {
        if (!L.villageOk(S)) S.rep = Math.max(S.rep, L.VILLAGE_REP);
        goScene('village'); trnOpenSheet('village');
      }
      return S.train || null;
    };
  }
