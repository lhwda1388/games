  // ---------- 캠핑: 숲 캠핑장 sign, the camp view (cmpforest), fire + grill, fireside guests, tent, gear, sheets, FF.camp ----------
  // Logic: logic/camp.js. One view per camp site (CMP_SITES[k].view): 숲 (sign in the 숲, button 「숲으로」), 계곡 (sign in the
  // 산골 계곡 view, needs that day's ticket, button 「계곡으로」), 바닷가 (sign on the 바다 shore of the farm view, button 「바다로」).
  // Night fishing at the 계곡·바닷가 camps is the farm view with the camp's spot (SCENES[spot].camp): like a 기차 여행 물가 it shows
  // that camp (tent, fire, its own water), never the 밭; the 물가 팻말 and the scene button go back up to the camp.
  var CMP_SIGN = [158, 150, 18, 22];     // 숲: right of the bottom-right forage spot, below the fallen log, clear of the pet's path
  var CMP_TENT = [96, 74, 50, 38], CMP_FIRE = [62, 130, 32, 28], CMP_BOARD = [4, 168, 24, 26];
  var CMP_GUEST_AT = { res: [46, 156], pet: [106, 160] };
  var CMP_GIFT_AT = [114, 112, 14, 10];
  var CMP_EQ_AT = { lantern: [144, 74, 8, 40], chair: [36, 140, 20, 18], hammock: [6, 82, 44, 26], guitar: [22, 142, 8, 20],
    table: [116, 146, 26, 14], icebox: [146, 154, 16, 12], scope: [158, 92, 14, 28] };
  var CMP_WHY = { forest: '숲 길을 먼저 열어요', rep: '신뢰도 ★이 부족해요', coins: '코인이 모자라요', owned: '이미 있어요', camp: '캠핑 세트를 먼저 사요',
    phase: '저녁이나 밤에만 피울 수 있어요', lit: '불이 벌써 타고 있어요', fuel: '솔방울이 없어요 · 숲에서 주워 와요', fire: '모닥불을 먼저 피워요',
    slot: '석쇠가 한 칸뿐이에요', busy: '그 칸은 굽는 중이에요', need: '재료가 모자라요', max: '더 키울 수 없어요', none: '없는 거예요',
    asleep: '벌써 자고 있어요 · 아침에 일어나요', cap: '오늘은 텐트에서 ' + L.CMP_GIFT_DAY + '번 잤어요 · 내일 또 와요', gone: '벌써 갔어요',
    open: '아직 갈 수 없는 곳이에요', ticket: '오늘 계곡 기차표가 없어요 · 간이역에서 사요', dark: '밤 낚시는 저녁·밤에만 · 해가 지면 와요' };
  var CMP_SEASON_ORDER = ['spring', 'summer', 'autumn', 'winter'];
  PLACE.cmpout = ['숲으로', '숲으로 돌아가기'];
  PLACE.cmpvout = ['계곡으로', '산골 계곡으로 돌아가기'];
  PLACE.cmpsout = ['바다로', '바닷가 물가로 돌아가기'];
  PLACE.cmpforest = ['캠핑장', '숲 캠핑장으로']; PLACE.cmpvalley = ['캠핑장', '계곡 캠핑으로']; PLACE.cmpsea = ['캠핑장', '바닷가 캠핑으로'];   // 별 잇기 → back
  var CMP_OUT = { forest: 'cmpout', valley: 'cmpvout', sea: 'cmpsout' };
  function cmpOutKey(sc) { return sc === 'cmpout' || sc === 'cmpvout' || sc === 'cmpsout' || sc === 'cmpup'; }   // a camp scene-button key (yard.js placeAttention)
  // the other camp signs: 계곡 = in the 산골 계곡 view, left of the stream; 바닷가 = on the 바다 shore of the farm view, left of the old boat
  var CMP_SIGNS = { forest: CMP_SIGN, valley: [54, 144, 18, 22], sea: [70, 168, 18, 22] };
  BUG_VIEWS.cmpforest = true; BUG_VIEWS.cmpvalley = true; BUG_VIEWS.cmpsea = true;
  BUG_KIND.latefly = 'bee'; BUG_KIND.flatstag = 'beetle'; BUG_C.flatstag = [4, 3];
  BUG_KIND.caddisfly = 'fly'; BUG_C.caddisfly = [3, 2]; BUG_KIND.owlfly = 'drag'; BUG_KIND.sandbeetle = 'beetle'; BUG_C.sandbeetle = [4, 3];
  BUG_KIND.hawkmoth = 'fly'; BUG_C.hawkmoth = [4, 3];
  // the night-fishing spots (background.js wetD reads wet): 계곡 = a brook off the ridge into a deep bend pool;
  // 바닷가 = open sea along a curving sand beach
  SCENES.cmpbrook = { cx: 130, cy: 160, rx: 34, ry: 16, trip: true, camp: 'valley', wet: cmpBrookD };
  SCENES.cmpshore = { cx: 146, cy: 148, rx: 26, ry: 38, trip: true, camp: 'sea', wet: cmpSeaD };
  var cmpPrevSpot = null;      // the spot before night fishing, put back when leaving the camp's water
  var cmpPick = -1;            // the empty grill slot whose recipe list is open
  var cmpRedraw = 0, cmpSleepAt = 0;

  function cmpSiteNow() { for (var k = 0; k < L.CMP_SITES.length; k++) if (L.CMP_SITES[k].view === view) return L.CMP_SITES[k].id; return 'forest'; }
  function cmpIsView(v) { return L.CMP_SITES.some(function (t) { return t.view === v; }); }
  function cmpViewName(v) { for (var k = 0; k < L.CMP_SITES.length; k++) if (L.CMP_SITES[k].view === v) return L.CMP_SITES[k].name; return '캠핑장'; }
  // the camp view's scene button: back where that camp's sign stands
  function cmpDests() { return [CMP_OUT[cmpSiteNow()] || 'cmpout']; }
  // may the player still be at site's camp (the 계곡 ticket runs out at midnight)? If not: say why and put a camp's spot back
  function cmpGate(site) {
    var st = L.cmpGoStatus(S, site, now(), TZ);
    if (st === 'ok') return true;
    toast(CMP_WHY[st] || '갈 수 없어요', 2400);
    cmpSpotBack();
    return false;
  }
  // at a camp view: false (and home to the 밭, as trnUp) once its site may not be used any more
  function cmpStay() {
    if (cmpGate(cmpSiteNow())) return true;
    closeSheet(); goScene('farm'); refresh();
    return false;
  }
  // goScene: a camp button key or camp view → the view it goes to (null = not one); a camp whose ticket is gone → the 밭
  function cmpOutTo(sc) {
    if (sc === 'cmpout') return 'forest';
    if (sc === 'cmpvout') return cmpGate('valley') ? 'trnvalley' : 'farm';
    if (sc === 'cmpsout') {   // back down to the 바다 shore the sign stands on
      if (L.curSpot(S) !== 'sea' && L.spotUnlocked(S, 'sea') && L.setSpot(S, 'sea')) { castAnim = null; scareFx = null; swimmers = []; nextSwim = 1; setScene(); }
      return 'farm';
    }
    if (sc === 'cmpup') { var t = L.cmpSiteBySpot(L.curSpot(S)); return t && cmpGate(t.id) ? t.view : 'farm'; }
    for (var k = 0; k < L.CMP_SITES.length; k++) if (L.CMP_SITES[k].view === sc) return S.camp && !cmpGate(L.CMP_SITES[k].id) ? 'farm' : sc;   // 별 잇기 back, signs
    return null;
  }
  function cmpShown() { return L.forestOk(S) && (!!S.camp || S.rep >= L.CMP_REP); }
  function cmpWon(n) { return n.toLocaleString('ko-KR'); }
  function cmpMin(ms) { var m = Math.ceil(ms / SPEED / 60e3); return m >= 1 ? m + '분' : Math.ceil(ms / SPEED / 1e3) + '초'; }
  // the 숲 menu dot: a morning gift waits, or food is done on the grill
  function cmpAttention() { return !!S.camp && (S.camp.gift.length > 0 || L.cmpSettleGrill(S, now()) > 0); }
  // the 랜턴 brings night insects sooner (ui/bugs.js spawn wait)
  function cmpBugMul() { return cmpIsView(view) && L.cmpHas(S, 'lantern') ? L.CMP_LANTERN_MUL : 1; }

  // ---------- camp food art (x = centre, y = bottom), shared with the basket icon ----------
  function cmpFoodArt(id, x, y) {
    var k;
    if (id === 'cmpotato') { px(x - 4, y - 5, 8, 4, 1); px(x - 3, y - 6, 6, 1, 1); px(x - 3, y - 1, 6, 1, 2); px(x - 2, y - 5, 2, 1, 0); px(x + 1, y - 4, 2, 1, 0); px(x - 4, y - 3, 1, 1, 2); return; }
    if (id === 'cmfish' || id === 'cmcatfish') {
      var big = id === 'cmcatfish';
      px(x - 6, y - 3, 13, 1, 4);                                                                   // skewer
      px(x - 3, y - 5, big ? 8 : 6, 4, 3); px(x - 4, y - 4, 1, 2, 3); px(x + (big ? 5 : 3), y - 6, 2, 6, 4);   // body, tail
      px(x - 2, y - 4, 1, 1, 0); for (k = 0; k < (big ? 3 : 2); k++) px(x + k * 2, y - 5, 1, 4, 4);  // eye, grill marks
      if (big) { px(x - 5, y - 3, 1, 1, 4); px(x - 5, y - 6, 1, 1, 4); }                           // whiskers
      return;
    }
    if (id === 'cmcorn') { px(x - 5, y - 4, 10, 3, 2); for (k = 0; k < 5; k++) px(x - 4 + k * 2, y - 4 + (k % 2), 1, 1, k % 2 ? 4 : 1); px(x + 4, y - 5, 3, 1, 3); px(x + 4, y - 1, 3, 1, 3); return; }
    if (id === 'cmmush') { px(x - 6, y - 2, 13, 1, 4); for (k = 0; k < 3; k++) { px(x - 5 + k * 4, y - 5, 3, 2, 3); px(x - 4 + k * 4, y - 3, 1, 1, 1); } return; }
    if (id === 'cmramen') { px(x - 4, y - 5, 9, 1, 4); px(x - 4, y - 4, 9, 4, 3); px(x - 3, y - 6, 7, 1, 0); px(x - 2, y - 7, 1, 1, 0); px(x + 2, y - 7, 1, 1, 0); px(x - 6, y - 4, 2, 1, 4); px(x + 5, y - 4, 2, 1, 4); return; }
    if (id === 'cmmallow') { px(x - 6, y - 2, 9, 1, 3); px(x + 2, y - 6, 5, 5, 0); px(x + 2, y - 6, 5, 1, 2); px(x + 2, y - 2, 5, 1, 2); px(x + 6, y - 6, 1, 5, 2); return; }
    if (id === 'cmchest') { [[-4, 0], [1, 0], [-1, -3]].forEach(function (o) { px(x + o[0], y - 4 + o[1], 4, 3, 4); px(x + o[0] + 1, y - 5 + o[1], 2, 1, 4); px(x + o[0] + 1, y - 3 + o[1], 1, 1, 1); }); return; }
    if (id === 'cmburnt') { px(x - 4, y - 4, 8, 4, 4); px(x - 3, y - 5, 5, 1, 4); px(x - 1, y - 8, 1, 2, 2); px(x + 1, y - 10, 1, 2, 2); return; }
    if (id === 'cmdew') { px(x, y - 9, 1, 2, 3); px(x - 1, y - 7, 3, 2, 3); px(x - 2, y - 5, 5, 3, 3); px(x - 1, y - 2, 3, 1, 3); px(x - 1, y - 6, 3, 4, 1); px(x - 1, y - 5, 1, 1, 0); return; }
    if (id === 'cmpebble') { px(x - 3, y - 5, 6, 1, 4); px(x - 4, y - 4, 1, 3, 4); px(x + 3, y - 4, 1, 3, 4); px(x - 3, y - 1, 6, 1, 4); px(x - 3, y - 4, 6, 3, 2); px(x - 2, y - 4, 2, 1, 0); return; }
    if (id === 'cmrain') {   // a corked glass bottle with rain inside
      px(x - 3, y - 8, 6, 8, 4); px(x - 2, y - 7, 4, 6, 1); px(x - 1, y - 10, 2, 2, 4); px(x - 1, y - 11, 2, 1, 3);
      px(x - 1, y - 6, 1, 2, 3); px(x + 1, y - 4, 1, 2, 3); px(x - 2, y - 2, 4, 1, 2); return;
    }
    if (id === 'cmsnowman') {
      px(x - 3, y - 5, 7, 5, 4); px(x - 2, y - 4, 5, 3, 0); px(x - 2, y - 10, 5, 5, 4); px(x - 1, y - 9, 3, 3, 0);
      px(x, y - 8, 1, 1, 4); px(x - 3, y - 11, 7, 1, 3); px(x, y - 3, 1, 1, 4); return;
    }
    px(x - 3, y - 4, 6, 4, 3);
  }
  // icons and glyphs are painted once (cmpArts); each call hands back a copy, since a sheet row needs its own element
  var cmpArts = {};
  function cmpCopy(src) { var c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0); return c; }
  function cmpIcon(id) {
    var a = cmpArts['i' + id];
    if (!a) {
      a = cmpArts['i' + id] = document.createElement('canvas'); a.width = 14; a.height = 14;
      var saved = ctx; ctx = a.getContext('2d');
      try { cmpFoodArt(id, 7, 12); } finally { ctx = saved; }
    }
    return cmpCopy(a);
  }
  var cmpSils = {};
  function cmpSil(id) {
    if (cmpSils[id]) return cmpSils[id];
    var c = cmpIcon(id), g = c.getContext('2d');
    g.globalCompositeOperation = 'source-in'; g.fillStyle = G[4]; g.fillRect(0, 0, 14, 14);
    return (cmpSils[id] = c);
  }
  function cmpGlyph(rows) {
    var key = 'g' + rows.join(''), a = cmpArts[key];
    if (!a) { a = cmpArts[key] = document.createElement('canvas'); a.width = 12; a.height = 12; spr(rows, 0, 0, false, a.getContext('2d')); }
    return cmpCopy(a);
  }
  var CMP_GLYPH = {
    tent: ['............', '.....44.....', '....4224....', '...422224...', '..42220224..', '.4222002224.', '422220022224', '444444444444', '............', '............', '............', '............'],
    fire: ['............', '.....0......', '....010.....', '...01110....', '...01210.0..', '..0122210...', '..0122210...', '...01110....', '.4.3333.4...', '..44..44....', '.4......4...', '............'],
    book: ['............', '.4444444444.', '.4000040004.', '.4044040404.', '.4000040004.', '.4044040444.', '.4000040004.', '.4444444444.', '............', '............', '............', '............'],
    gear: ['.....44.....', '....4..4....', '....4444....', '...444444...', '...400004...', '...401104...', '...401104...', '...400004...', '...444444...', '....4444....', '............', '............']
  };

  // ---------- 숲: the 캠핑장 sign (a board with a tent mark); the 계곡 and 바닷가 ones are the same board ----------
  function cmpDrawSign(tt) { cmpDrawSignAt('forest', tt); }
  function cmpDrawSignAt(site, tt) {
    if (!cmpShown()) return;
    var x = CMP_SIGNS[site][0], y = CMP_SIGNS[site][1];
    px(x + 8, y + 9, 2, 13, 4); px(x + 4, y + 21, 10, 1, 2);
    px(x, y, 18, 10, 4); px(x + 1, y + 1, 16, 8, 0);
    px(x + 8, y + 2, 2, 1, 4); px(x + 6, y + 3, 6, 1, 4); px(x + 5, y + 4, 8, 1, 4); px(x + 4, y + 5, 10, 1, 4); px(x + 3, y + 6, 12, 1, 4); px(x + 8, y + 4, 2, 3, 0);
    if (!S.camp) sparkle(x + 19, y - 1, tt);
    else if (cmpAttention()) { px(x + 16, y - 2, 3, 3, 4); px(x + 17, y - 1, 1, 1, 0); }
  }
  function cmpTapSign(x, y) { return cmpTapSignAt('forest', x, y); }
  function cmpTapSignAt(site, x, y) {
    if (!cmpShown() || !hit(CMP_SIGNS[site], x, y, 2)) return false;
    if (!S.camp) { if (site === 'forest') cmpOpenBuy(); else toast(L.cmpSite(site).name + ' · 캠핑 세트는 숲 캠핑장 팻말에서 사요', 2600); return true; }
    var st = L.cmpGoStatus(S, site, now(), TZ);
    if (st !== 'ok') { toast(CMP_WHY[st] || '갈 수 없어요', 2400); return true; }
    goScene(L.cmpSite(site).view);
    return true;
  }
  // the 바닷가 sign on the farm view (spot 바다): pond.js drawDecor / yard.js tapScene
  function cmpSeaSignOn() { return view === 'farm' && scene === 'sea' && !reel; }
  function cmpDrawSeaSign(tt) { if (cmpSeaSignOn()) cmpDrawSignAt('sea', tt); }
  function cmpTapSeaSign(x, y) { return cmpSeaSignOn() && S.fish.phase === 'idle' && cmpTapSignAt('sea', x, y); }

  // ---------- the camp view ----------
  var bgCmps = {};
  function cmpTree(cx, by, h, c) {
    px(cx, by - 4, 2, 4, 4);
    for (var j = 0; j < h; j++) { var hw = Math.floor((j % Math.ceil(h / 3)) * 0.8 + Math.floor(j / Math.ceil(h / 3)) * 2) + 1; px(cx + 1 - hw, by - 4 - h + j, hw * 2, 1, c); }
  }
  // 계곡 camp: the stream's middle line; 바닷가 camp: where the sand starts (the sea is above it)
  function cmpValleyY(x) { return 56 + Math.round(Math.sin(x / 23) * 4 + Math.sin(x / 9) * 1.5); }
  function cmpShoreY(x) { return 60 + Math.round(Math.sin(x / 13) * 3 + Math.sin(x / 5 + 2)); }
  function cmpInWater(site, x, y) { return site === 'valley' ? y >= 40 && Math.abs(y - cmpValleyY(x)) < 11 : site === 'sea' && y >= 26 && y < cmpShoreY(x) + 3; }
  function cmpPaint(site) {
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var saved = ctx; ctx = c.getContext('2d');
    try {
      px(0, 0, W, H, 0);
      var k, t, x, y;
      if (site === 'valley') cmpPaintValley();
      else if (site === 'sea') cmpPaintSea();
      else {
        for (k = 0; k < 260; k++) px(Math.floor(hash(k * 7 + 5) * W), 70 + Math.floor(hash(k * 11 + 3) * (H - 70)), 1, 1, k % 4 ? 1 : 2);
        // a ring of pines around the clearing: back row, then two flanks
        for (t = 0; t < 12; t++) cmpTree(2 + t * 16 + Math.round(hash(t * 3 + 9) * 6), 50 + Math.round(hash(t * 5 + 2) * 6), 24 + Math.round(hash(t + 4) * 10), 3);
        for (t = 0; t < 6; t++) cmpTree(4 + t * 34 + Math.round(hash(t * 9 + 1) * 8), 70 + Math.round(hash(t * 13) * 4), 26 + Math.round(hash(t * 7 + 3) * 8), 4);
      }
      // the clearing: trodden ground in a soft oval, stones ringing the fire pit
      for (y = 118; y < 190; y++) for (x = 14; x < 168; x++) {
        var a = (x - 84) / 74, b = (y - 154) / 34;
        if (a * a + b * b < 1 && (x + y * 3) % 7 === 0) px(x, y, 1, 1, site === 'sea' ? 2 : 1);
      }
      for (k = 0; k < 12; k++) { var ang = k / 12 * Math.PI * 2; px(78 + Math.cos(ang) * 15 - 2, 151 + Math.sin(ang) * 6 - 1, 4, 3, 3); px(78 + Math.cos(ang) * 15 - 1, 151 + Math.sin(ang) * 6 - 2, 2, 1, 2); }
      // the two hammock trees (always there, the hammock hangs between them once bought); 바닷가 = leaning 해송
      px(8, 70, 4, 44, 4); px(9, 70, 1, 44, 3); px(46, 74, 4, 40, 4); px(47, 74, 1, 40, 3);
      if (site === 'sea') for (k = 0; k < 4; k++) { px(2 + k * 2, 62 + k * 2, 18 - k * 3, 2, k % 2 ? 4 : 3); px(38 + k * 3, 66 + k * 2, 18 - k * 3, 2, k % 2 ? 4 : 3); }
      else for (k = 0; k < 3; k++) { px(2 + k * 3, 64 - k * 3, 16 - k * 6, 3, 3); px(40 + k * 3, 68 - k * 3, 16 - k * 6, 3, 3); }
      // a path out to the 숲 at the bottom
      for (y = 190; y < H; y++) { px(70 + Math.round(Math.sin(y / 5) * 2), y, 1, 1, 2); px(90 + Math.round(Math.sin(y / 5) * 2), y, 1, 1, 2); }
      // the camp board (bottom-left): 장비·도장 수첩
      var bd = CMP_BOARD;
      px(bd[0] + 11, bd[1] + 12, 2, 14, 4); px(bd[0], bd[1], bd[2], 13, 4); px(bd[0] + 1, bd[1] + 1, bd[2] - 2, 11, 0);
      for (k = 0; k < 3; k++) px(bd[0] + 4, bd[1] + 3 + k * 3, 16 - k * 4, 1, 3);
    } finally { ctx = saved; }
    return c;
  }
  // 계곡 camp (ctx = its bg): ridges, pines on the far bank, the stream with stones, the near bank of pebbles
  function cmpPaintValley() {
    var x, y;
    for (y = 26; y < H; y++) for (x = 0; x < W; x++) {
      var r = 34 + Math.round(Math.sin(x / 23) * 5 + Math.sin(x / 9 + 1) * 3), d = Math.abs(y - cmpValleyY(x)), c;
      if (y < r) c = (x + y) % 3 === 0 ? 3 : 2;
      else if (d < 7) c = d > 5 ? 2 : d < 3 ? ((x + y) % 2 ? 2 : 1) : (x * 3 + y) % 7 === 0 ? 0 : 1;
      else if (d < 10) c = (x + y * 3) % 5 === 0 ? 2 : (x * 7 + y) % 13 === 0 ? 3 : 0;
      else c = y > 70 && hash(x * 131 + y * 7) < 0.06 ? 1 : 0;
      px(x, y, 1, 1, c);
    }
    for (x = 0; x < W; x++) px(x, 26, 1, 1, 3);
    [10, 30, 64, 92, 124, 152, 176].forEach(function (tx, j) { trnPine(tx, cmpValleyY(tx) - 9 - (j % 2) * 2, false); });   // the far bank
    [24, 74, 116, 160].forEach(function (rx) { trnRock(rx, cmpValleyY(rx) + 1); });                                      // stones in the stream
    trnPine(174, 148, false); trnPine(6, 140, false);
  }
  // 바닷가 camp: the sea up to the horizon, a far headland with a little light, the waterline and a wide sand beach with shells
  function cmpPaintSea() {
    var x, y, k;
    for (y = 26; y < H; y++) for (x = 0; x < W; x++) {
      var sh = cmpShoreY(x), c;
      if (x > 136 && y < 26 + Math.round((x - 136) * 0.22) && y < 34) c = (x + y) % 2 ? 4 : 3;   // headland
      else if (y < sh) c = y < 34 ? ((x + y) % 2 ? 2 : 1) : sh - y < 3 ? 1 : (x % 4 === 0 && y % 2 === 0) ? 2 : 1;
      else if (y < sh + 3) c = (x + y) % 3 ? 1 : 2;                                                // wet sand
      else c = hash(x * 131 + y * 7) < 0.14 ? 1 : hash(x * 17 + y * 311) < 0.03 ? 2 : 0;
      px(x, y, 1, 1, c);
    }
    for (x = 0; x < W; x++) px(x, 26, 1, 1, 3);
    px(170, 24, 2, 4, 4); px(169, 23, 4, 1, 3);                                                     // the far lighthouse
    for (k = 0; k < 9; k++) {                                                                      // shells and a starfish or two
      var sx = 16 + Math.floor(hash(k * 37 + 4) * 150), sy = 78 + Math.floor(hash(k * 19 + 8) * 110);
      if (k % 3) { px(sx, sy, 3, 2, 3); px(sx + 1, sy - 1, 1, 1, 3); } else { px(sx - 1, sy, 3, 1, 3); px(sx, sy - 1, 1, 3, 3); }
    }
    px(150, 186, 26, 3, 4); px(152, 185, 3, 1, 3); px(168, 184, 4, 2, 4);                          // driftwood
  }
  function cmpDrawTent(lv, tt, dark, ox, oy) {
    var x = ox === undefined ? CMP_TENT[0] : ox, y = oy === undefined ? CMP_TENT[1] : oy, k, glow = dark && S.camp && S.camp.sleep;
    if (lv >= 3) {   // 캠핑카: a little van with a pop-up roof and a lit window at night
      px(x + 2, y + 10, 46, 22, 4); px(x + 3, y + 11, 44, 20, 1); px(x + 3, y + 22, 44, 2, 3);
      px(x + 8, y + 4, 28, 7, 4); px(x + 9, y + 5, 26, 5, 2);
      px(x + 7, y + 13, 12, 7, 4); px(x + 8, y + 14, 10, 5, dark ? 0 : 2);
      px(x + 34, y + 13, 10, 7, 4); px(x + 35, y + 14, 8, 5, 2);
      px(x + 22, y + 13, 8, 17, 4); px(x + 23, y + 14, 6, 16, glow ? 0 : 3); px(x + 27, y + 21, 1, 2, 4);
      [8, 38].forEach(function (wx) { px(x + wx, y + 30, 7, 6, 4); px(x + wx + 2, y + 32, 3, 2, 2); });
      px(x, y + 36, 50, 1, 3);
      return;
    }
    var w = lv >= 2 ? 48 : 34, h = lv >= 2 ? 30 : 24, x0 = x + Math.round((50 - w) / 2), base = y + 36;
    for (k = 0; k < h; k++) {
      var hw = lv >= 2 ? Math.round(Math.sqrt(1 - Math.pow((h - k) / h, 2)) * w / 2) : Math.round(k / h * w / 2);
      px(x0 + w / 2 - hw, base - h + k, hw * 2, 1, k % 6 === 5 ? 3 : 2);
      px(x0 + w / 2 - hw, base - h + k, 1, 1, 4); px(x0 + w / 2 + hw - 1, base - h + k, 1, 1, 4);
    }
    var dw = lv >= 2 ? 14 : 10, dh = lv >= 2 ? 16 : 13;   // the door flap, open; warm inside while someone sleeps
    for (k = 0; k < dh; k++) { var ww = Math.round(k / dh * dw / 2) + 1; px(x + 25 - ww, base - dh + k, ww * 2, 1, glow ? 0 : 4); }
    px(x + 24, base - h - 3, 2, 3, 4); px(x + 26, base - h - 3, 4, 2, 3);                  // pole + pennant
    px(x0 - 4, base, w + 8, 1, 4); px(x0 - 3, base - 3, 1, 3, 3); px(x0 + w + 2, base - 3, 1, 3, 3);   // guy pegs
  }
  function cmpDrawEq(tt, dark) {
    var e = S.camp.eq, k;
    if (e.hammock) {
      var h = CMP_EQ_AT.hammock;
      for (k = 0; k < 36; k++) px(h[0] + 6 + k, h[1] + 14 + Math.round(Math.sin(k / 35 * Math.PI) * 7), 1, 2, k % 4 ? 2 : 3);
      px(h[0] + 6, h[1] + 12, 1, 3, 4); px(h[0] + 41, h[1] + 12, 1, 3, 4);
    }
    if (e.lantern) {
      var l = CMP_EQ_AT.lantern;
      px(l[0] + 3, l[1] + 8, 1, 32, 4); px(l[0] + 3, l[1] + 4, 4, 1, 4);
      px(l[0] + 5, l[1] + 5, 4, 1, 4); px(l[0] + 4, l[1] + 6, 6, 6, 4); px(l[0] + 5, l[1] + 7, 4, 4, dark ? 0 : 1);
    }
    if (e.scope) {
      var sc = CMP_EQ_AT.scope;
      px(sc[0] + 6, sc[1] + 10, 1, 18, 4); px(sc[0] + 2, sc[1] + 27, 1, 1, 4); px(sc[0] + 10, sc[1] + 27, 1, 1, 4);
      for (k = 0; k < 8; k++) { px(sc[0] + 6 - k / 2, sc[1] + 20 + k, 1, 1, 4); px(sc[0] + 6 + k / 2, sc[1] + 20 + k, 1, 1, 4); }
      px(sc[0] + 1, sc[1] + 6, 12, 4, 4); px(sc[0] + 2, sc[1] + 7, 10, 2, 2); px(sc[0], sc[1] + 4, 3, 7, 4);   // tube, aimed up-left
    }
    if (e.table) {
      var tb = CMP_EQ_AT.table;
      px(tb[0], tb[1], 26, 3, 4); px(tb[0] + 1, tb[1], 24, 1, 2); px(tb[0] + 2, tb[1] + 3, 2, 10, 4); px(tb[0] + 22, tb[1] + 3, 2, 10, 4);
      px(tb[0] + 6, tb[1] - 3, 4, 3, 3); px(tb[0] + 16, tb[1] - 4, 3, 4, 2);   // a mug and a bottle
    }
    if (e.icebox) {
      var ib = CMP_EQ_AT.icebox;
      px(ib[0], ib[1], 16, 12, 4); px(ib[0] + 1, ib[1] + 3, 14, 8, 1); px(ib[0] + 1, ib[1] + 1, 14, 1, 0); px(ib[0] + 5, ib[1] - 2, 6, 2, 4);
    }
    if (e.chair) {
      var ch = CMP_EQ_AT.chair;
      px(ch[0] + 2, ch[1], 16, 9, 4); px(ch[0] + 3, ch[1] + 1, 14, 7, 2); px(ch[0], ch[1] + 9, 20, 2, 4);
      px(ch[0] + 2, ch[1] + 11, 1, 7, 4); px(ch[0] + 17, ch[1] + 11, 1, 7, 4); px(ch[0] + 3, ch[1] + 14, 14, 1, 3);
    } else { px(30, 157, 26, 5, 3); px(30, 157, 26, 1, 4); px(30, 161, 26, 1, 4); px(54, 157, 2, 5, 4); }   // a log seat
    if (e.guitar) {
      var g = CMP_EQ_AT.guitar;
      px(g[0] + 3, g[1], 2, 9, 4); px(g[0] + 2, g[1], 4, 2, 4);
      px(g[0] + 1, g[1] + 9, 6, 5, 3); px(g[0], g[1] + 13, 8, 6, 3); px(g[0] + 3, g[1] + 14, 2, 2, 4); px(g[0] + 1, g[1] + 19, 6, 1, 4);
    }
  }
  function cmpDrawFire(tt, on, fx0, fy0) {
    var cx = fx0 || 78, by = fy0 || 155, k;
    px(cx - 9, by - 2, 18, 3, 4); px(cx - 7, by - 4, 3, 2, 4); px(cx + 4, by - 4, 3, 2, 4);   // logs
    for (k = -8; k < 9; k += 4) px(cx + k, by - 1, 2, 1, 3);
    if (!on) { px(cx - 4, by - 3, 8, 1, 2); if (!reduceMotion) for (k = 0; k < 2; k++) px(cx - 1 + k * 2, by - 6 - Math.floor((tt * 3 + k * 2) % 4), 1, 1, 2); return; }
    var f = reduceMotion ? 0 : tt * 9;
    for (k = 0; k < 7; k++) {                                                   // flame tongues, flickering heights
      var fx = cx - 6 + k * 2, fh = 6 + Math.round((Math.sin(f + k * 1.7) + 1) * 3) + (k === 3 ? 4 : k === 2 || k === 4 ? 2 : 0);
      px(fx, by - 3 - fh, 2, fh, 1); px(fx, by - 3 - Math.round(fh * 0.6), 2, Math.round(fh * 0.6), 0);
    }
    px(cx - 3, by - 6, 6, 3, 0);
    if (!reduceMotion) for (k = 0; k < 4; k++) { var u = (tt * 0.8 + k * 0.27) % 1; px(cx - 3 + Math.round(Math.sin(tt * 2 + k * 2) * 5) + k * 2, by - 18 - Math.round(u * 26), 1, 1, u < 0.5 ? 0 : 1); }   // sparks
  }
  function cmpDrawGrill(t) {
    var cx = 78, gy = 140, g = S.camp.g, n = Math.max(L.cmpSlots(S), g[1] ? 2 : 1);   // food in slot 2 always shows
    px(cx - 13, gy, 26, 1, 4); px(cx - 13, gy + 3, 26, 1, 4); for (var k = -12; k <= 12; k += 4) px(cx + k, gy, 1, 4, 4);
    px(cx - 14, gy, 1, 14, 4); px(cx + 13, gy, 1, 14, 4);
    for (var i = 0; i < n; i++) {
      var sl = g[i], sx = n > 1 ? cx - 6 + i * 12 : cx;
      if (!sl) continue;
      var fid = sl.b ? 'cmburnt' : sl.r, sil = cmpSil(fid);   // a dark rim first, so the food reads against the firelight
      [[-1, 0], [1, 0], [0, -1]].forEach(function (o) { ctx.drawImage(sil, sx - 7 + o[0], gy - 12 + o[1]); });
      cmpFoodArt(fid, sx, gy);
      if (sl.d && !sl.b) sparkle(sx + 5, gy - 9, t / 1000 + i);
      else if (!sl.d && !reduceMotion) px(sx + Math.round(Math.sin(t / 300 + i) * 2), gy - 9 - Math.floor((t / 200) % 4), 1, 1, 2);   // steam while it cooks
    }
  }
  function cmpDrawGuest(tt) {
    var who = L.cmpGuest(S, cmpSiteNow(), now());
    if (!who) return;
    if (who === 'pet') { var p = CMP_GUEST_AT.pet; px(p[0] - 5, p[1], 10, 1, 2); drawPetSprite(S.pet.kind, p[0], p[1], true, Math.floor(tt) % 9 < 6 ? 'sit' : 'sleep', tt); return; }
    var r = CMP_GUEST_AT.res, bob = !reduceMotion && Math.floor(tt * 1.2) % 5 === 0 ? 1 : 0;
    px(r[0] - 5, r[1] - 9, 10, 9, 3); px(r[0] - 4, r[1] - 8, 8, 7, 2);           // shoulders and a blanket
    px(r[0] - 5, r[1], 10, 1, 4);
    if (FACE[who]) spr(FACE[who], r[0] - 4, r[1] - 18 + bob);
    if (Math.floor(tt * 1.5) % 4 === 0) { px(r[0] + 6, r[1] - 22, 7, 5, 4); px(r[0] + 7, r[1] - 21, 5, 3, 0); px(r[0] + 6, r[1] - 17, 1, 1, 4); }   // a speech mark
  }
  function cmpDrawGift(tt) {
    if (!S.camp.gift.length) return;
    var g = CMP_GIFT_AT;
    px(g[0] + 1, g[1] + 3, 12, 7, 4); px(g[0] + 2, g[1] + 4, 10, 5, 1); px(g[0] + 6, g[1] + 3, 2, 7, 4); px(g[0] + 1, g[1] + 6, 12, 1, 4);
    px(g[0] + 4, g[1], 3, 3, 4); px(g[0] + 8, g[1], 3, 3, 4);
    sparkle(g[0] + 14, g[1] - 2, tt);
  }
  // firelight: lighter rings on the night tint, with a small flicker in their size
  function cmpGlow(cx, cy, r, tt, a) {
    var fl = reduceMotion ? 0 : Math.sin(tt * 7) * 1.5 + Math.sin(tt * 13) * 0.8;
    ctx.fillStyle = G[0];
    [1, 0.7, 0.42].forEach(function (k) {
      ctx.globalAlpha = a; ctx.beginPath(); ctx.ellipse(cx, cy, (r + fl) * k * 1.3, (r + fl) * k * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    });
    ctx.globalAlpha = 1;
  }
  function drawCamp(tt, dt) {
    var t = now(), e = curEnv(t), site = cmpSiteNow(), dark = L.cmpDark(e.phase), night = e.phase === 'night';
    if (!bgCmps[site]) bgCmps[site] = cmpPaint(site);
    ctx.drawImage(bgCmps[site], 0, 0);
    drawSky(tt, e.phase);
    cmpDrawWaterFx(site, tt);
    if (!S.camp) return;
    L.cmpSettleGrill(S, t);
    var on = L.cmpFireOn(S, site, t);
    cmpDrawEq(tt, dark);
    cmpDrawTent(S.camp.tent, tt, dark);
    cmpDrawGift(tt);
    cmpDrawFire(tt, on);
    if (on) cmpDrawGrill(performance.now());
    cmpDrawGuest(tt);
    drawYardWeather(tt, e.weather);
    if (dark) {
      ctx.globalAlpha = night ? 0.55 : 0.2; px(0, 0, W, H, 4); ctx.globalAlpha = 1;   // a bit darker than the 숲: the fire is the light here
      if (night) drawStars(tt);
      if (on) { cmpGlow(78, 150, 30, tt, night ? 0.09 : 0.05); cmpDrawFire(tt, true); cmpDrawGrill(performance.now()); }
      if (S.camp.eq.lantern) { var l = CMP_EQ_AT.lantern; cmpGlow(l[0] + 7, l[1] + 9, 9, 0, 0.07); px(l[0] + 5, l[1] + 7, 4, 4, 0); }
      if (S.camp.sleep) { var tx = CMP_TENT[0] + 25; for (var k = 0; k < 3; k++) if ((Math.floor(tt * 1.5) + k) % 3) px(tx + 10 + k * 4, CMP_TENT[1] - 2 - k * 4, 3, 1, 0); }   // z z z
      if (night && site === 'sea') cmpMoonPath(tt, 26, cmpShoreY(150) - 2);
      if (night) drawMeteors(tt, 2, 22);   // 유성우 over the camp (sky.js): tap one for the night's wish
    }
  }
  // the camp's water moving: 계곡 = flecks running down the stream; 바닷가 = the waterline breathing in and out
  function cmpDrawWaterFx(site, tt) {
    var mv = !reduceMotion, k, x;
    if (site === 'valley') for (k = 0; k < 22; k++) {
      x = (hash(k * 7 + 3) * W + (mv ? tt * 22 : 0)) % W;
      px(x, cmpValleyY(x) + Math.round((hash(k * 5) - 0.5) * 8), 2, 1, 0);
    } else if (site === 'sea') for (x = 0; x < W; x++) {
      var w = Math.round((Math.sin((mv ? tt * 1.3 : 0) + x / 29) + 1) * 1.5), sy = cmpShoreY(x);
      px(x, sy - 1 - w, 1, 1, 0);
      if ((x + (mv ? Math.floor(tt * 6) : 0)) % 9 < 4) px(x, sy - 6 - w, 1, 1, 0);
    }
  }
  // moonlight on the sea: a broken column of glints under the moon
  function cmpMoonPath(tt, y0, y1) {
    for (var y = y0 + 2; y < y1; y += 2) { var hw = 2 + Math.round((y - y0) / 6), j = Math.floor(tt * 2 + y) % 3; px(140 - hw + j * 2, y, hw, 1, 1); }
  }
  function tapCamp(x, y) {
    var t = now(), site = cmpSiteNow(), e = curEnv(t);
    if (!S.camp) { goScene('forest'); return; }
    if (tapMeteor(x, y)) return;   // 유성우: the night's wish (× camp stars)
    if (S.camp.gift.length && hit(CMP_GIFT_AT, x, y, 4)) { cmpTakeGifts(); return; }
    var who = L.cmpGuest(S, site, t);
    if (who && hit(who === 'pet' ? [CMP_GUEST_AT.pet[0] - 8, CMP_GUEST_AT.pet[1] - 12, 16, 14] : [CMP_GUEST_AT.res[0] - 7, CMP_GUEST_AT.res[1] - 20, 14, 21], x, y, 3)) { cmpTalkTo(who); return; }
    if (hit(CMP_FIRE, x, y, 2)) {
      if (!L.cmpFireOn(S, site, t) && L.cmpDark(e.phase)) { cmpLightFire(); return; }
      if (L.cmpFireOn(S, site, t)) {
        var done = S.camp.g.map(function (g, i) { return g && g.d ? i : -1; }).filter(function (i) { return i >= 0; });
        if (done.length) { if (bagStop()) return; done.forEach(function (i) { cmpTakeSlot(i, true); }); return; }
      }
      cmpOpen(); return;
    }
    if (hit(CMP_TENT, x, y, 2)) { if (e.phase === 'night' && !S.camp.sleep) cmpGoSleep(); else cmpOpen(); return; }
    if (hit(CMP_BOARD, x, y, 2)) { cmpOpen(); return; }
    for (var k = 0; k < L.CMP_EQ.length; k++) {
      var q = L.CMP_EQ[k], r = CMP_EQ_AT[q.id];
      if (r && S.camp.eq[q.id] && hit(r, x, y, 1)) { if (q.id === 'scope' && L.skyOk(S) && e.phase === 'night') { cmpStars(); return; } toast(q.name + ' · ' + q.what, 2000); return; }
    }
    if (y < 26 && e.phase === 'night' && L.skyOk(S)) { cmpStars(); return; }   // the night sky: 별 잇기
    var st = L.cmpSite(site);
    if (st.spot && cmpInWater(site, x, y)) { cmpFishFrom(site); return; }
    toast(st.name + ' · ' + (L.cmpDark(e.phase) ? '모닥불을 누르면 불 피우기·굽기 · 밤엔 텐트를 누르면 자요' + (st.spot ? ' · 물을 누르면 밤 낚시' : '') : '저녁이 오면 모닥불을 피울 수 있어요') +
      (L.skyOk(S) ? ' · 밤하늘을 누르면 별 잇기' : '') + ' · 팻말에서 장비·도장 수첩', 2800);
  }

  // ---------- actions ----------
  // 별 잇기 from the camp (needs the 망원경, night): rewards × L.cmpStarMul, the view returns here (ui/sky.js)
  function cmpStars() {
    if (!L.skyOk(S)) { toast('상점에서 망원경을 사면 캠프에서도 별을 이어요', 2400); return; }
    closeSheet();
    openStars(false, false, view);
  }
  // night fishing by this camp: the farm view at the camp's spot, drawn as the camp (cmpPaintTrip)
  function cmpFishFrom(site, ph) {
    var t = now(), r = L.cmpFishOk(S, site, t, TZ, ph || curEnv(t).phase);
    if (!r.ok) { toast(CMP_WHY[r.why] || '지금은 못 낚아요', 2400); return; }
    var was = L.curSpot(S);
    if (was !== r.spot && !goSpot(r.spot)) { toast('줄을 걷고 나서 옮길 수 있어요', 2000); return; }
    if (was !== r.spot && !L.cmpSiteBySpot(was)) cmpPrevSpot = was;
    closeSheet();
    goScene('farm');
    toast(L.cmpSite(site).name + ' 밤 낚시 · 물을 눌러 던지기 · 물가 팻말을 누르면 캠핑장으로', 2800);
  }
  // off a camp's spot: back to the spot before (or the 연못); a hooked bite is let go
  function cmpSpotBack() {
    if (!L.cmpSiteBySpot(L.curSpot(S))) return;
    if (S.fish.phase === 'bite') S.fish = { phase: 'idle' };
    if (!L.setSpot(S, cmpPrevSpot && L.spotUnlocked(S, cmpPrevSpot) && !L.cmpSiteBySpot(cmpPrevSpot) ? cmpPrevSpot : 'pond')) return;
    castAnim = null; scareFx = null; swimmers = []; nextSwim = 1;
    setScene();
  }
  // goScene: leaving the farm view from a camp's water always puts the spot back (the 밭 never shows the camp's water)
  function cmpLeaveFarm() { cmpSpotBack(); }
  // the morning came while night fishing: the line comes in and it is back up to the camp (before tickFishing, so no
  // bite is rolled from an empty daytime pool)
  // the 계곡 ticket ran out at midnight: the line comes in and it is home to the 밭 (cmpGate). Never while the catch card is open.
  function cmpTripTick(t) {
    if (view !== 'farm' || !SCENES[scene].camp || reel || S.fish.phase === 'bite' || !resultEl.hidden) return;
    var gone = L.cmpGoStatus(S, SCENES[scene].camp, t, TZ) !== 'ok';
    if (!gone && L.cmpDark(curEnv(t).phase)) return;
    if (S.fish.phase === 'wait') S.fish = { phase: 'idle' };
    if (!gone) toast('날이 밝았다 · 밤 낚시는 여기까지 · 캠핑장으로', 2600);
    goScene('cmpup');
    if (gone) refresh();
  }

  // ---------- 캠프 물가: the night-fishing screen (farm view, scene = the camp's spot) ----------
  function cmpBrookX(y) { return 172 - (y - 26) * 0.3 + Math.sin(y / 14) * 5; }
  function cmpBrookPool(x, y) { var a = (x - 130) / 46, b = (y - 162) / 26; return a * a + b * b; }
  function cmpBrookD(x, y) { var hw = 8 + Math.max(0, y - 26) * 0.05; return Math.min(y < 28 ? 99 : Math.abs(x - cmpBrookX(y)) / hw, cmpBrookPool(x, y)); }
  function cmpSeaX(y) { return 96 + Math.sin(y / 19) * 7 + Math.sin(y / 7) * 2 - (y - 26) * 0.05; }
  function cmpSeaD(x, y) { return 1 - (x - cmpSeaX(y)) / 70; }
  var CMP_TRIP_TENT = [6, 46], CMP_TRIP_FIRE = [34, 112];
  // the whole bg (ctx = bg, from background.js paintBg via trnPaintTrip): land, water, trees; tent and fire are drawn live
  function cmpPaintTrip(sc) {
    var site = SCENES[sc].camp, x, y;
    for (y = 26; y < H; y++) for (x = 0; x < W; x++) {
      var d = wetD(x, y), c;
      if (site === 'valley') {
        var r = 36 + Math.round(Math.sin(x / 23) * 5 + Math.sin(x / 9 + 1) * 3), pd = cmpBrookPool(x, y);
        if (y < r && d >= 1) c = (x + y) % 3 === 0 ? 3 : 2;                                                 // the ridge
        else if (d < 1) c = pd < 1 ? (pd < 0.35 ? ((x + y) % 2 ? 2 : 1) : pd > 0.8 ? 2 : (x % 4 === 0 && y % 2 === 0 ? 2 : 1)) : d > 0.75 ? 2 : (y * 2 + x) % 5 === 0 ? 0 : 1;
        else if (d < 1.3) c = (x + y * 3) % 5 === 0 ? 2 : (x * 7 + y) % 13 === 0 ? 3 : 0;                 // pebbles
        else c = hash(x * 131 + y * 7) < 0.05 ? 1 : 0;
      } else {
        if (d < 1) c = d > 0.95 ? 2 : d < 0.5 ? ((x + y) % 2 ? 2 : 1) : (x % 4 === 0 && y % 2 === 0) ? 2 : 1;   // the sea
        else if (d < 1.07) c = (x + y) % 3 ? 1 : 2;                                                       // wet sand
        else c = hash(x * 131 + y * 7) < 0.14 ? 1 : hash(x * 17 + y * 311) < 0.03 ? 2 : 0;                 // dry sand
      }
      px(x, y, 1, 1, c);
    }
    for (x = 0; x < W; x++) px(x, 26, 1, 1, 3);
    if (site === 'valley') {
      [[70, 60], [96, 50], [122, 62], [178, 100], [176, 142], [172, 200], [84, 200]].forEach(function (t) { trnPine(t[0], t[1], false); });
      [[110, 168], [150, 156], [cmpBrookX(80) - 2, 80], [cmpBrookX(110) + 2, 110]].forEach(function (p) { trnRock(p[0], p[1]); });
    } else {
      [[60, 92], [84, 160], [20, 150], [72, 196]].forEach(function (p, j) { if (j % 2) { px(p[0], p[1], 3, 2, 3); px(p[0] + 1, p[1] - 1, 1, 1, 3); } else { px(p[0] - 1, p[1], 3, 1, 3); px(p[0], p[1] - 1, 1, 3, 3); } });
      px(52, 190, 28, 6, 4); px(54, 191, 24, 4, 2); px(50, 188, 3, 3, 4); px(78, 188, 3, 3, 4); px(56, 192, 20, 1, 3);   // a rowboat pulled up the sand
    }
    var lx = CMP_TRIP_FIRE[0];
    px(lx - 22, CMP_TRIP_FIRE[1] + 4, 14, 4, 3); px(lx - 22, CMP_TRIP_FIRE[1] + 4, 14, 1, 4); px(lx - 9, CMP_TRIP_FIRE[1] + 4, 1, 4, 4);   // a log seat
    for (var k = 0; k < 10; k++) { var a = k / 10 * Math.PI * 2; px(lx + Math.cos(a) * 11 - 1, CMP_TRIP_FIRE[1] + Math.sin(a) * 4 - 1, 3, 2, 3); }   // fire ring
  }
  // live layer (pond.js drawWater → drawTrnWater): sky, moving water, the tent, the fire and its glow, the 물가 팻말
  function cmpDrawTrip(tt) {
    var site = SCENES[scene].camp, t = now(), e = curEnv(t), dark = L.cmpDark(e.phase), mv = !reduceMotion, k, y;
    drawSky(tt, e.phase);
    if (site === 'valley') {
      for (k = 0; k < 20; k++) {                                                             // rapids down the brook
        var yy = 30 + (hash(k * 7 + 3) * 170 + (mv ? tt * 26 : 0)) % 170, xx = cmpBrookX(yy) + (hash(k * 5) - 0.5) * 7;
        if (cmpBrookPool(xx, yy) < 1.05) continue;
        px(xx - 1, yy, 3, 1, 0); px(xx, yy + 1, 1, 1, 0);
      }
      for (k = 0; k < 2; k++) { var ph = ((mv ? tt * 0.4 : 0) + k * 0.5) % 1; ring(POND.cx + (k ? 16 : -16), POND.cy + (k ? 5 : -3), 2 + ph * 7, 1 + ph * 3, ph < 0.6 ? 1 : 2); }
    } else {
      for (y = 26; y < H; y++) {                                                             // the waterline and a second wave behind it
        var w = Math.round((Math.sin((mv ? tt * 1.3 : 0) + y / 23) + 1) * 1.5), sx = Math.round(cmpSeaX(y));
        px(sx + w, y, 1, 1, 0);
        if ((y + (mv ? Math.floor(tt * 6) : 0)) % 9 < 4) px(sx + 7 + w, y, 1, 1, 0);
      }
      if (e.phase === 'night') for (y = 30; y < 120; y += 3) { var j = Math.floor((mv ? tt * 2 : 0) + y) % 3; px(160 - 2 + j, y, 3 + (y % 2), 1, 0); }   // moonlight on the water
    }
    if (dark) { ctx.globalAlpha = e.phase === 'night' ? 0.42 : 0.16; px(0, 26, W, H - 26, 4); ctx.globalAlpha = 1; }   // the camp's own dark: the fire is the light
    if (S.camp) {
      var on = L.cmpFireOn(S, site, t), fx = CMP_TRIP_FIRE[0], fy = CMP_TRIP_FIRE[1];
      cmpDrawTent(S.camp.tent, tt, dark, CMP_TRIP_TENT[0], CMP_TRIP_TENT[1]);
      if (on && dark) cmpGlow(fx, fy - 4, 22, tt, 0.1);
      cmpDrawFire(tt, on, fx, fy);
    }
    var s = TRN_TRIP_SIGN, x = s[0], y1 = s[1], bob = mv && Math.floor(tt * 2) % 2 ? 1 : 0;      // the 물가 팻말: ↑ and a tent mark
    px(x + 11, y1 + 12, 2, 10, 4);
    px(x, y1, 24, 12, 4); px(x + 1, y1 + 1, 22, 10, 0); px(x, y1 + 12, 24, 1, 3);
    px(x + 5, y1 + 4 - bob, 2, 6, 4); px(x + 3, y1 + 5 - bob, 6, 1, 4); px(x + 4, y1 + 4 - bob, 4, 1, 4); px(x + 5, y1 + 3 - bob, 2, 1, 4);
    for (k = 0; k < 6; k++) px(x + 17 - k, y1 + 3 + k, 1 + k * 2, 1, 4);
    px(x + 16, y1 + 6, 2, 3, 0);
  }
  var CMP_TRIP_HIT = [0, 40, 60, 80];   // the tent and the fire: also back up
  function cmpTapTrip(x, y) {
    if (S.fish.phase !== 'idle' || !(hit(TRN_TRIP_SIGN, x, y, 2) || hit(CMP_TRIP_HIT, x, y, 0))) return false;
    goScene('cmpup');
    return true;
  }
  function cmpTripDests() {
    var t = L.cmpSiteBySpot(scene);
    PLACE.cmpup = [t ? '캠핑장' : '밭', (t ? t.name : '밭') + '으로 올라가기'];
    return ['cmpup'];
  }
  function cmpLightFire() {
    if (!cmpStay()) return;
    var t = now(), r = L.cmpLight(S, cmpSiteNow(), t, TZ, curEnv(t).phase);
    if (!r.ok) { toast(CMP_WHY[r.why] || '불을 못 피워요', 2200); return; }
    burst(78, 146, 14, 0, 50);
    toast('모닥불을 피웠다 · 아침까지 타요 · 불을 누르면 굽기', 2600);
    cmpDone();
  }
  function cmpTakeSlot(i, quick) {
    if (bagStop()) return;
    var r = L.cmpTake(S, i, now());
    if (!r) return;
    var it = L.itemInfo(r.id);
    floatText('+' + it.name, 78, 128);
    toast(r.burnt ? '앗, 다 타 버렸다 · 탄 음식' : (r.first ? '★ 처음 · ' : '') + it.name + (r.sold ? ' · 바구니가 꽉 차 바로 팔았다 +' + r.sold : ' · 바구니에'), 2200);
    if (!quick || r.first) burst(78, 136, r.burnt ? 4 : 10, r.burnt ? 3 : 0, 30);
    cmpDone();
  }
  function cmpTalkTo(who) {
    var r = L.cmpTalk(S, cmpSiteNow(), who, now(), TZ);
    if (!r.ok) { toast(CMP_WHY[r.why] || '', 1600); return; }
    var name = who === 'pet' ? S.pet.name : L.residentById(who).name;
    toast(name + ': ' + r.text + (r.pts ? ' · 친밀도 +' + r.pts : ''), 4200);
    if (r.pts) burst(who === 'pet' ? CMP_GUEST_AT.pet[0] : CMP_GUEST_AT.res[0], 140, 6, 0, 24);
    if (r.ups && r.ups.length) setTimeout(function () { toast('★ ' + name + ' 친밀도 ' + r.ups[r.ups.length - 1].lv + '단계 · 우체통에 편지', 3000); }, 4300);
    if (r.petUp) setTimeout(function () { toast('★ ' + S.pet.name + ' 친밀도 ' + r.petUp + '단계', 2600); }, 4300);
    refresh();
  }
  function cmpGoSleep() {
    if (!cmpStay()) return;
    var t = now(), r = L.cmpSleep(S, cmpSiteNow(), t, TZ, curEnv(t));
    if (r.woke) { cmpWoke(r.woke); if (!r.ok) { cmpDone(); return; } }   // the morning came first: its stamp toast wins
    if (!r.ok) { toast(CMP_WHY[r.why] || '지금은 못 자요', 2400); return; }
    if (!r.woke) toast('텐트에서 잠들었다… 아침이 오면(게임을 꺼 둬도) 텐트 앞에 선물 · 오늘 ' + L.cmpGiftLeft(S, t, TZ) + '번 더', 3200);
    cmpDone();
  }
  function cmpTakeGifts() {
    if (bagStop()) return;
    var r = L.cmpTakeGift(S, now(), TZ);
    if (r.woke) cmpWoke(r.woke);   // the morning came just now: its stamp toast first
    if (!r.ids.length) { if (r.woke) cmpDone(); return; }
    burst(CMP_GIFT_AT[0] + 7, CMP_GIFT_AT[1] + 4, 12, 0, 40);
    if (!r.woke) toast('아침 선물 · ' + r.ids.map(function (id) { return L.itemInfo(id).name; }).join(', ') + (r.sold ? ' · 바구니가 꽉 차 일부 팔았다 +' + r.sold : ' · 바구니에'), 3000);
    cmpDone();
  }
  // the morning came (maybe while the game was closed): say so once, with the stamp
  function cmpWoke(ev) {
    var site = L.cmpSite(ev.key.split(':')[0]), se = ev.key.split(':')[1], wx = ev.key.split(':')[2];
    var msg = '☀ ' + site.name + '의 아침 · 텐트 앞에 선물 ' + ev.items.length + '개' + (ev.lost ? ' (자리가 없어 일부 놓쳤어요)' : '') + ' · 도장 「' + L.SEASON_NAME[se] + '·' + L.CMP_WX_NAME[wx] + '」' + (ev.fresh ? ' 새로 쾅!' : '');
    toast(msg, 3600);
    if (ev.title) setTimeout(function () { toast('★ 칭호 「' + ev.title + '」', 3000); }, 3700);
    if (ev.deco) setTimeout(function () { toast('★ 도장 ' + L.CMP_DECO_AT + '개 · ' + L.decoById(ev.deco).name + ' (마당 꾸미기)', 3000); }, ev.title ? 6800 : 3700);
    save();
  }
  function cmpDone() { refresh(); save(); if (!sheetEl.hidden && (sheetKind === 'camp' || sheetKind === 'cmpstamp')) cmpRender(); }

  // ---------- sheets: 캠핑 세트 (from the 숲 sign), the camp sheet, the 도장 수첩 ----------
  function cmpOpenBuy() {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true;
    sheetKind = 'cmpbuy'; sheetEl.hidden = false;
    sheetHead('숲 캠핑장 팻말');
    var say = document.createElement('p'); say.className = 'say';
    say.textContent = '팻말: 숲 안쪽 빈터, 야영 가능. 모닥불은 저녁부터. 솔방울을 땔감으로 쓰세요.';
    sheetEl.appendChild(say);
    var st = L.cmpStatus(S);
    var r = sheetRow(cmpGlyph(CMP_GLYPH.tent), '캠핑 세트', '1인 텐트 · 모닥불 자리 · 석쇠 한 칸 · ★' + L.CMP_REP + '부터');
    mysBtn(r, cmpWon(L.CMP_PRICE), function () {
      var res = L.cmpBuy(S);
      if (!res.ok) { toast(CMP_WHY[res.why] || '안 돼요'); return; }
      toast('★ 캠핑 세트를 샀다 · 저녁이 오면 모닥불을 피워요', 3000);
      closeSheet(); refresh(); save();
      goScene(L.cmpSite('forest').view);
    }, '캠핑 세트 사기 ' + L.CMP_PRICE + '코인', st !== 'ok');
    mysNote(st === 'rep' ? '신뢰도 ★' + L.CMP_REP + '이 되면 살 수 있어요 · 지금 ★' + S.rep : '밤엔 텐트에서 자고 아침 선물을 받아요 · 장비와 텐트는 캠핑장에서 키워요');
  }
  function cmpOpen() {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true;
    sheetKind = 'camp'; sheetEl.hidden = false; cmpPick = -1;
    cmpRedraw = now(); cmpRender();
  }
  function cmpOpenStamps() { sheetKind = 'cmpstamp'; sheetEl.hidden = false; cmpRender(); }
  function cmpRender() { var keep = sheetEl.scrollTop; if (sheetKind === 'cmpstamp') cmpRenderStamps(); else cmpRenderCamp(); sheetEl.scrollTop = keep; }
  function cmpRenderCamp() {
    var t = now(), e = curEnv(t), site = L.cmpSite(cmpSiteNow()), c = S.camp, on = L.cmpFireOn(S, site.id, t), k;
    L.cmpSettleGrill(S, t);
    sheetHead(site.name);
    var say = document.createElement('p'); say.className = 'say';
    say.textContent = c.sleep ? '텐트에서 자는 중… 아침이 오면 선물이 있어요.' : on ? '타닥타닥. 석쇠에 뭘 올려 볼까요?' : L.cmpDark(e.phase) ? '어두워졌어요. 솔방울 하나면 밤새 불이 타요.' : '해가 지면 모닥불을 피울 수 있어요. 지금은 장비를 둘러봐요.';
    sheetEl.appendChild(say);
    // 모닥불
    mysH3('모닥불', on ? '아침까지 ' + cmpMin(c.fire.u - t) : '솔방울 ' + L.cmpFuel(S) + '개');
    var rf = sheetRow(cmpGlyph(CMP_GLYPH.fire), on ? '타는 중' : '꺼져 있음', on ? '불 곁에 가끔 손님이 와요 · 손님을 누르면 이야기' : '저녁·밤에 솔방울 1개(바구니, 없으면 창고) · 그 밤이 끝날 때까지', on ? '' : 'off');
    if (!on) mysBtn(rf, '불 피우기', cmpLightFire, '모닥불 피우기', !L.cmpDark(e.phase) || !L.cmpFuel(S));
    // 밤 낚시 (계곡·바닷가) and 별 보기 (with the 망원경)
    if (site.spot || L.skyOk(S)) mysH3('밤에', L.cmpDark(e.phase) ? '지금' : '저녁부터');
    if (site.spot) {
      var nf = L.CMP_FISH.filter(function (f) { return f.spot === site.spot; });
      var rn = sheetRow(cmpGlyph(CMP_GLYPH.fire), '밤 낚시', nf.map(function (f) { return S.dex.fish[f.id] ? f.name : '???'; }).join('·') + ' · 저녁·밤에만 물어요', L.cmpDark(e.phase) ? '' : 'off');
      mysBtn(rn, '낚시', function () { cmpFishFrom(site.id); }, site.name + ' 밤 낚시', !L.cmpDark(e.phase));
    }
    if (L.skyOk(S)) {
      var rst = sheetRow(cmpGlyph(CMP_GLYPH.book), '별 보기', '별자리 잇기·유성우 소원 보상 ×' + L.cmpStarMul(S, true) + (L.cmpHas(S, 'scope') ? ' (망원경 받침)' : ''), e.phase === 'night' ? '' : 'off');
      mysBtn(rst, '별 잇기', cmpStars, '캠프에서 별 잇기', e.phase !== 'night');
    }
    // 석쇠
    mysH3('석쇠', L.cmpSlots(S) + '칸' + (L.cmpHas(S, 'table') ? ' · 테이블 ×' + L.CMP_TABLE_MUL : ''));
    for (var i = 0; i < Math.max(L.cmpSlots(S), c.g[1] ? 2 : 1); i++) (function (i) {   // food in slot 2 is listed even without the 석쇠
      var g = c.g[i], r;
      if (!g) {
        r = sheetRow(cmpGlyph(CMP_GLYPH.gear), (i + 1) + '번 칸 · 비었어요', on ? '재료를 골라 올리기' : '모닥불을 피우면 구울 수 있어요', 'off');
        mysBtn(r, cmpPick === i ? '닫기' : '굽기', function () { cmpPick = cmpPick === i ? -1 : i; cmpRender(); }, (i + 1) + '번 칸에 굽기', !on);
        if (cmpPick === i && on) cmpRecipeList(i);
        return;
      }
      var it = L.itemInfo(g.b ? 'cmburnt' : g.r);
      if (g.d) {
        var bi = L.cmpBurnIn(S, g, t);
        r = sheetRow(cmpIcon(g.b ? 'cmburnt' : g.r), it.name + (g.b ? '' : ' · 다 됐어요'), g.b ? '너무 오래 뒀어요' : L.cmpHas(S, 'icebox') ? '아이스박스 덕에 안 타요' : bi ? cmpMin(bi) + ' 뒤엔 타요' : '');
        mysBtn(r, '꺼내기', function () { cmpTakeSlot(i); }, it.name + ' 꺼내기');
      } else sheetRow(cmpIcon(g.r), it.name + ' · 굽는 중', cmpMin(L.cmpLeft(g, t)) + ' 남음');
    })(i);
    // 텐트
    var tn = L.CMP_TENTS[c.tent - 1], nx = L.cmpTentNext(S), left = L.cmpGiftLeft(S, t, TZ);
    mysH3('텐트', tn.name);
    if (c.gift.length) { var rg = sheetRow(cmpGlyph(CMP_GLYPH.tent), '아침 선물 ' + c.gift.length + '개', c.gift.map(function (id) { return L.itemInfo(id).name; }).join(', ')); mysBtn(rg, '받기', cmpTakeGifts, '아침 선물 받기'); }
    var rs = sheetRow(cmpGlyph(CMP_GLYPH.tent), c.sleep ? '자는 중' : '텐트에서 자기', c.sleep ? '아침까지 ' + cmpMin(Math.max(0, c.sleep.w - t)) : '밤에만 · 아침 선물 ' + L.cmpGiftN(S) + '개 · 오늘 ' + left + '/' + L.CMP_GIFT_DAY + '번 남음');
    if (!c.sleep) mysBtn(rs, '자기', cmpGoSleep, '텐트에서 자기', e.phase !== 'night' || !left);
    if (nx) {
      var ru = sheetRow(cmpGlyph(CMP_GLYPH.tent), nx.name + '로 바꾸기', '아침 선물 하나 더');
      mysBtn(ru, cmpWon(nx.cost), function () {
        var res = L.cmpTentUp(S);
        if (!res.ok) { toast(CMP_WHY[res.why] || '안 돼요'); return; }
        toast('★ ' + nx.name + '!', 2400); burst(CMP_TENT[0] + 25, CMP_TENT[1] + 16, 16, 0, 50); cmpDone();
      }, nx.name + ' ' + nx.cost + '코인', S.coins < nx.cost);
    }
    // 장비
    mysH3('장비', L.CMP_EQ.filter(function (q) { return c.eq[q.id]; }).length + ' / ' + L.CMP_EQ.length);
    L.CMP_EQ.forEach(function (q) {
      var have = !!c.eq[q.id], r = sheetRow(cmpGlyph(CMP_GLYPH.gear), q.name, q.what, have ? 'idle' : '');
      mysBtn(r, have ? '있음' : cmpWon(q.cost), function () {
        var res = L.cmpBuyEq(S, q.id);
        if (!res.ok) { toast(CMP_WHY[res.why] || '안 돼요'); return; }
        toast(josa(q.name, '을', '를') + ' 들였다 · ' + q.what, 2400); cmpDone();
      }, q.name + ' 사기', have || S.coins < q.cost);
    });
    // 도장 수첩
    var n = L.cmpStampN(S), ti = L.cmpTitles(S);
    mysH3('도장 수첩', n + '개');
    var rb = sheetRow(cmpGlyph(CMP_GLYPH.book), '도장 수첩', (ti.length ? '칭호 「' + ti[ti.length - 1] + '」 · ' : '') + '잔 밤의 곳·계절·날씨마다 도장 하나');
    mysBtn(rb, '펼치기', cmpOpenStamps, '도장 수첩 펼치기');
    mysNote('캠핑 요리는 냄비 요리보다 값이 낮지만(재료 ×' + L.CMP_MUL + ') 1~3분이면 돼요 · 다 된 걸 ' + Math.round(L.CMP_BURN_MS / 60e3) + '분 넘게 두면 타요 · 아침 선물은 현실 하루 ' + L.CMP_GIFT_DAY + '번, 시계를 되돌렸다 다시 맞춰도 그날 몫은 다시 차지 않아요');
  }
  function cmpRecipeList(i) {
    L.CMP_RECIPES.forEach(function (rc) {
      var known = L.cmpKnown(S, rc), can = L.cmpCanCook(S, rc);
      var need = rc.need.map(function (id) { return L.itemInfo(id).name; }).join('·');
      var r = sheetRow(known ? cmpIcon(rc.id) : cmpGlyph(CMP_GLYPH.gear), known ? rc.name : '???', (known ? need + ' · ' + cmpMin(L.cmpTime(S, rc)) + ' · ' + L.cmpSell(rc) + '코인' : can ? need + ' · 바구니 재료로 처음 보는 조합' : '재료를 맞춰 구우면 알게 돼요'), can ? '' : 'off');
      mysBtn(r, '올리기', function () {
        if (!cmpStay()) return;
        var res = L.cmpCook(S, cmpSiteNow(), i, rc.id, now(), TZ);
        if (!res.ok) { toast(CMP_WHY[res.why] || '안 돼요'); return; }
        cmpPick = -1; toast((known ? josa(rc.name, '을', '를') + ' 올렸다' : '처음 보는 조합을 올렸다…') + ' · ' + cmpMin(res.at - now()), 2000); cmpDone();
      }, (known ? rc.name : '모르는 요리') + ' 굽기', !can);
    });
  }
  // a 12-px stamp: a ring, filled when stamped, with the weather mark
  function cmpStampIcon(wx, got) {
    var mk = { clear: ['..4..', '4.4.4', '.444.', '4.4.4', '..4..'], rain: ['.444.', '44444', '..4..', '..4..', '.44..'], snow: ['4.4.4', '.444.', '44444', '.444.', '4.4.4'] }[wx];
    var c = document.createElement('canvas'); c.width = 12; c.height = 12;
    var g = c.getContext('2d');
    spr(['...4444...', '..4....4..', '.4......4.', '4........4', '4........4', '4........4', '4........4', '.4......4.', '..4....4..', '...4444...'], 1, 1, false, g);
    if (got) { g.fillStyle = G[3]; g.fillRect(3, 3, 6, 6); g.fillRect(2, 4, 8, 4); g.fillRect(4, 2, 4, 8); }
    spr(got ? mk.map(function (row) { return row.replace(/4/g, '0'); }) : mk.map(function (row) { return row.replace(/4/g, '2'); }), 4, 4, false, g);
    return c;
  }
  function cmpRenderStamps() {
    var c = S.camp;
    sheetHead('도장 수첩');
    var back = document.createElement('p'); back.className = 'say';
    back.textContent = '잔 밤마다 그곳·그 계절·그 날씨의 도장. 맑음(안개 포함)·비·눈.';
    sheetEl.appendChild(back);
    L.CMP_SITES.forEach(function (site) {
      var keys = L.cmpStampKeys(site.id), got = keys.filter(function (k) { return c.st[k]; }).length;
      mysH3(site.name, got + ' / ' + keys.length);
      CMP_SEASON_ORDER.forEach(function (se) {
        var ks = keys.filter(function (k) { return k.split(':')[1] === se; });
        var r = sheetRow(cmpStampIcon(ks[0].split(':')[2], !!c.st[ks[0]]), L.SEASON_NAME[se], ks.map(function (k) { var wx = k.split(':')[2]; return L.CMP_WX_NAME[wx] + ' ' + (c.st[k] ? c.st[k] + '밤' : '—'); }).join(' · '));
        ks.slice(1).forEach(function (k) { var ic = cmpStampIcon(k.split(':')[2], !!c.st[k]); ic.style.marginLeft = '2px'; r.insertBefore(ic, r.children[1]); });
      });
    });
    mysH3('칭호', L.cmpStampN(S) + '개');
    L.CMP_TITLES.forEach(function (ti) { sheetRow(cmpGlyph(CMP_GLYPH.book), ti.title, '도장 ' + ti.n + '개', L.cmpStampN(S) >= ti.n ? '' : 'idle'); });
    sheetRow(decoIcon(L.CMP_DECO), L.decoById(L.CMP_DECO).name, '도장 ' + L.CMP_DECO_AT + '개 · 마당 장식', S.yard.deco[L.CMP_DECO] ? '' : 'idle');
    var r2 = sheetRow(cmpGlyph(CMP_GLYPH.tent), '캠핑장으로', '장비·석쇠·텐트');
    mysBtn(r2, '돌아가기', function () { sheetKind = 'camp'; cmpRender(); }, '캠핑장 시트로 돌아가기');
  }
  // 도감: camp dishes
  function renderCampDex(row) {
    var h3 = document.createElement('h3'); h3.textContent = '캠핑 요리';
    var b = document.createElement('b'); b.textContent = L.cmpDexCount(S) + ' / ' + L.CMP_RECIPES.length; h3.appendChild(b);
    dexEl.appendChild(h3);
    if (!S.camp) { var p = document.createElement('p'); p.className = 'note'; p.textContent = '★' + L.CMP_REP + '에 숲 캠핑장 팻말에서 캠핑 세트를 사면 구울 수 있어요'; dexEl.appendChild(p); return; }
    L.CMP_RECIPES.forEach(function (rc) {
      var n = S.camp.dx[rc.id] || 0, ic = cmpIcon(rc.id); ic.className = 'sq';
      row(ic, n ? rc.name : '???', n ? L.cmpSell(rc) + '코인 · ' + rc.need.map(function (id) { return L.itemInfo(id).name; }).join('·') : rc.hidden ? '모닥불에서 재료를 맞춰 보면…' : '아직 안 구움', n ? n + '번' : '', !n);
    });
  }

  // ---------- the 캠핑 깃발 (stamp-book decoration) ----------
  DRAW_DECO.cmpflag = function (x, y, tt) {
    var w = reduceMotion ? 0 : Math.floor((tt || 0) * 2) % 2;
    px(x + 1, y, 1, 22, 4); px(x, y + 20, 4, 2, 3);
    px(x + 2, y + 1, 9, 2, 4); px(x + 2, y + 3, 8 - w, 2, 3); px(x + 2, y + 5, 6 + w, 2, 4);   // the pennant, flapping
    px(x + 4, y + 3, 2, 1, 0); px(x + 3, y + 4, 4, 1, 0);                                  // a little tent on it
  };

  // ---------- tick: wake-up check, open sheets follow the clock, close when leaving ----------
  function tickCampUI(t) {
    if (S.camp && t - cmpSleepAt > 1000) {
      cmpSleepAt = t;
      var ev = L.cmpSettleSleep(S, t, TZ);
      if (ev) { cmpWoke(ev); if (!sheetEl.hidden && sheetKind === 'camp') cmpRender(); }
    }
    if (sheetEl.hidden || (sheetKind !== 'camp' && sheetKind !== 'cmpstamp' && sheetKind !== 'cmpbuy')) return;
    if (sheetKind === 'cmpbuy' ? view !== 'forest' : !cmpIsView(view)) { closeSheet(); return; }
    if (sheetKind !== 'cmpbuy' && quiet() && t - cmpRedraw > 2000) { cmpRedraw = t; cmpRender(); }
  }

  // ---------- console hooks ----------
  // FF.camp() opens the 숲 camp (gives ★/숲/coins and buys the set if needed) → s.camp; FF.camp('buy') only buys;
  // FF.camp('fire') lights the fire now (any time of day); FF.camp('cook', rid = 'cmpotato') gives the inputs and grills it in slot 0;
  // FF.camp('done') finishes every slot; FF.camp('sleep') lies down now (today's count forgotten if full); FF.camp('morning') wakes now;
  // FF.camp('gear') buys every piece of gear and the 캠핑카; FF.camp('sheet') / ('stamps') opens a sheet;
  // FF.camp('valley' | 'sea') opens that site (the 계곡 route + today's ticket / the 바다 spot) and goes there; FF.camp('fish') starts
  // night fishing at the camp on screen (any time of day); FF.camp('sleep', 'rain' | 'snow') sleeps under that weather.
  // Other commands act on the camp on screen (else the 숲).
  function addCmpHooks(FF) {
    function ensure() {
      if (!L.forestOk(S)) { S.rep = Math.max(S.rep, L.FOREST_REP); S.coins += L.FOREST_COST; L.unlockForest(S, now()); }
      if (!S.camp) { S.rep = Math.max(S.rep, L.CMP_REP); S.coins += L.CMP_PRICE; L.cmpBuy(S); }
    }
    FF.camp = function (cmd, a) {
      var t = now(), site = cmpIsView(view) ? cmpSiteNow() : SCENES[scene].camp && view === 'farm' ? SCENES[scene].camp : 'forest';
      ensure();
      if (cmd === 'valley') {
        if (!L.villageOk(S)) S.rep = Math.max(S.rep, L.VILLAGE_REP);
        if (!L.trnOk(S, 'valley')) { S.rep = Math.max(S.rep, L.TRN_REP.valley); S.coins += L.TRN_OPEN.valley; L.trnOpen(S, 'valley', t); }
        if (!L.trnTicket(S, 'valley', t, TZ)) { S.coins += L.TRN_FARE.valley; L.trnBuyTicket(S, 'valley', t, TZ); }
        site = 'valley';
      }
      if (cmd === 'sea') { S.spotOk = S.spotOk || {}; S.spotOk.sea = true; site = 'sea'; }
      if (cmd === 'fish') { if (view === 'farm' && SCENES[scene].camp) return S.camp; if (site === 'forest') site = 'valley'; if (!L.cmpSiteOk(S, site)) FF.camp(site); cmpFishFrom(site, 'night'); return S.camp; }
      if (cmd === 'fire' || cmd === 'cook') {
        if (!L.cmpFireOn(S, site, t)) { S.bag.push({ id: 'pinecone', v: 10 }); L.cmpLight(S, site, t, TZ, 'night'); }
      }
      if (cmd === 'cook') {
        var rc = L.cmpRecipe(a) || L.cmpRecipe('cmpotato');
        rc.need.forEach(function (id) { S.bag.push({ id: id, v: L.itemInfo(id).price }); });
        S.camp.g[0] = null;
        L.cmpCook(S, site, 0, rc.id, t, TZ);
      }
      if (cmd === 'done') S.camp.g.forEach(function (g) { if (g) g.t = t - g.m; });
      if (cmd === 'sleep') {
        if (!L.cmpGiftLeft(S, t, TZ)) S.camp.gd = { d: -1, n: 0 };
        delete S.camp.sleep;
        var e = curEnv(t); e.phase = 'night'; if (a) e.weather = a;
        L.cmpSleep(S, site, t, TZ, e);
      }
      if (cmd === 'morning' && S.camp.sleep) { S.camp.sleep.w = t; cmpSleepAt = 0; }
      if (cmd === 'gear') { L.CMP_EQ.forEach(function (q) { if (!S.camp.eq[q.id]) { S.coins += q.cost; L.cmpBuyEq(S, q.id); } }); while (L.cmpTentNext(S)) { S.coins += L.cmpTentNext(S).cost; L.cmpTentUp(S); } }
      refresh(); save();
      if (view !== L.cmpSite(site).view) goScene(L.cmpSite(site).view);
      if (cmd === 'sheet' || cmd === 'gear') cmpOpen();
      else if (cmd === 'stamps') { cmpOpen(); cmpOpenStamps(); }
      return S.camp;
    };
  }
