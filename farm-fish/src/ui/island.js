  // ---------- 섬 (stage 7): the old boat on the 바다 beach, the 섬 scene, drift, palm, lighthouse + keeper ----------
  // view 'island' = the 섬 shore. Fishing at the 섬 is the farm view with spot 'island' (the pier takes you there),
  // like 강·바다. Logic lives in logic/island.js.
  var ISLE_SAND = { cx: 90, cy: 178, rx: 104, ry: 78 };                 // the island: sand inside this ellipse
  var DSPOTS = [[58, 116], [88, 110], [118, 114], [72, 132], [104, 130]];   // drift on the shore: [centre x, ground y]
  var LH = { x: 22, y: 64, w: 16, h: 86 };                                // lighthouse tower box
  var KEEPER = { x: 44, y: 134, w: 10, h: 16 };
  var PALM = { x: 138, y: 170 };                                         // trunk foot
  var PIER = [158, 80, 10, 42];                                          // planks out into the water (right)
  var MOOR = { x: 136, y: 84 };                                          // the boat tied at the pier
  // farm view: the old boat on the 바다 beach / the boat at the 섬 shore, the far lighthouse on the rock
  var WRECK = [94, 160, 24, 11], BOAT_SEA = { x: 118, y: 158 }, BOAT_ISLE = { x: 104, y: 158 }, FAR_LH = { x: 172, y: 182 };
  function inSand(x, y) { var a = (x - ISLE_SAND.cx) / ISLE_SAND.rx, b = (y - ISLE_SAND.cy) / ISLE_SAND.ry; return a * a + b * b < 1; }
  function isleNight(t) { return curEnv(t).phase === 'night'; }
  function isleLight(t) { return !!(S.isle && S.isle.lit) && isleNight(t); }

  // ---------- pre-rendered 섬: sea all around, a sandy island, a little grass, rocks ----------
  var bgIsle = document.createElement('canvas'); bgIsle.width = W; bgIsle.height = H;
  (function paintIsle() {
    var saved = ctx; ctx = bgIsle.getContext('2d');
    for (var y = 26; y < H; y++) for (var x = 0; x < W; x++) {
      var a = (x - ISLE_SAND.cx) / ISLE_SAND.rx, b = (y - ISLE_SAND.cy) / ISLE_SAND.ry, d = a * a + b * b;
      if (d < 0.86) px(x, y, 1, 1, hash(x * 131 + y * 7) < 0.14 ? 2 : hash(x * 17 + y * 311) < 0.3 ? 1 : 0);   // sand
      else if (d < 0.93) px(x, y, 1, 1, (x + y) % 3 ? 0 : 2);                                                 // wet sand
      else if (d < 1) px(x, y, 1, 1, (x * 3 + y) % 4 ? 2 : 0);                                                // foam
      else px(x, y, 1, 1, d > 1.6 && (x + y) % 2 === 0 ? 2 : (x % 4 === 0 && y % 2 === 0) ? 2 : 1);           // sea
    }
    // horizon
    for (x = 0; x < W; x++) px(x, 26, 1, 1, 3);
    // grass tufts inland
    for (var k = 0; k < 60; k++) {
      var gx = 10 + Math.floor(hash(k * 7 + 5) * 160), gy = 150 + Math.floor(hash(k * 13 + 2) * 48);
      if (inSand(gx, gy) && !(gx > LH.x - 4 && gx < LH.x + LH.w + 4)) { px(gx, gy - 2, 1, 3, 3); px(gx + 2, gy - 1, 1, 2, 3); }
    }
    // shore rocks
    [[20, 120], [160, 140], [34, 168]].forEach(function (r, n) {
      var w = n % 2 ? 6 : 8;
      px(r[0] - 1, r[1] - 3, w - 2, 1, 4); px(r[0] - 2, r[1] - 2, w, 3, 4); px(r[0] - 1, r[1] - 2, w - 3, 1, 1); px(r[0] - 3, r[1] + 1, w + 2, 1, 0);
    });
    // a far island on the horizon
    for (x = 120; x < 150; x++) { var hh = Math.round(3 - Math.abs(x - 135) / 6); if (hh > 0) px(x, 26 - hh, 1, hh, 3); }
    ctx = saved;
  })();

  // ---------- art ----------
  function drawLighthouse(tt, lit, night) {
    var x = LH.x, y = LH.y, k;
    // tapered tower with two dark bands
    for (k = 0; k < LH.h - 14; k++) {
      var hw = Math.round(5 + k * 0.05), cx = x + LH.w / 2, yy = y + 14 + k, band = (k > 18 && k < 26) || (k > 46 && k < 54);
      px(cx - hw - 1, yy, 1, 1, 4); px(cx + hw, yy, 1, 1, 4);
      px(cx - hw, yy, hw * 2, 1, band ? 4 : k % 9 === 0 ? 1 : 0);
    }
    px(x + 5, y + LH.h - 9, 6, 9, 4); px(x + 6, y + LH.h - 8, 4, 8, 3);       // door
    // gallery, lamp room, roof
    px(x - 1, y + 12, LH.w + 2, 2, 4);
    px(x + 3, y + 4, LH.w - 6, 8, 4);
    px(x + 4, y + 5, LH.w - 8, 6, lit ? (night && Math.floor(tt * 2) % 2 ? 0 : 1) : 2);
    if (!lit) { px(x + 5, y + 6, 2, 2, 3); px(x + 9, y + 8, 2, 1, 3); }        // broken pane
    for (k = 0; k < 4; k++) px(x + 8 - k, y + k, k * 2 + 1, 1, 4);
    px(x + 8, y - 2, 1, 2, 4);
  }
  // the beam: two dithered wedges sweeping round from the lamp
  function drawBeam(cx, cy, tt, len) {
    var a = tt * 0.9;
    ctx.globalAlpha = 0.75;
    for (var side = 0; side < 2; side++) {
      var an = a + side * Math.PI;
      for (var r = 4; r < len; r += 2) {
        var spread = 0.05 + r * 0.0012;
        for (var q = -1; q <= 1; q++) {
          var bx = cx + Math.cos(an + q * spread) * r, by = cy + Math.sin(an + q * spread) * r * 0.45;
          if ((Math.floor(r / 2) + q) % 2 === 0) px(bx, by, 1, 1, 0);
        }
      }
    }
    ctx.globalAlpha = 1;
    px(cx - 1, cy - 1, 3, 3, 0);
  }
  var KEEPER_SP = ['...444....', '..42224...', '..42224...', '...404....', '..44444...', '.4433344..', '.4333334.4',
    '.4333334.4', '.4333334.4', '..43334..4', '..43334..4', '..44444..4', '..40.04...', '..44.44...'];
  function drawKeeper(tt) {
    var bob = Math.floor(tt * 1.2) % 4 === 0 ? 1 : 0;
    spr(KEEPER_SP, KEEPER.x, KEEPER.y + 2 - bob, false);
    var st = L.lighthouseStep(S);
    if (st && Math.floor(tt * 2) % 2) { px(KEEPER.x + 4, KEEPER.y - 6, 2, 4, 4); px(KEEPER.x + 4, KEEPER.y - 1, 2, 1, 4); }   // "!" over her head
  }
  function drawPalm(tt, left) {
    var x = PALM.x, y = PALM.y, k, sw = Math.round(Math.sin(tt * 0.8) * 1);
    for (k = 0; k < 44; k++) { var tx = x - Math.round(Math.sin(k / 44 * 1.4) * 12); px(tx, y - k, 4, 1, k % 4 === 0 ? 4 : 3); }
    var top = { x: x - 12, y: y - 44 };
    [[-1, 0.15], [1, 0.1], [-1, 0.55], [1, 0.6], [0.2, -0.6]].forEach(function (f, n) {
      for (var j = 0; j < 14; j++) {
        var fx = top.x + 2 + f[0] * j * 1.1 + (n === 4 ? sw : 0), fy = top.y + j * f[1] * (f[0] ? 0.9 : 1) + (j * j) * 0.04 + (n < 2 ? sw * 0.3 : 0);
        px(fx, fy, 2, 1, 4); if (j % 2) px(fx, fy + 1, 1, 1, 3);
      }
    });
    for (k = 0; k < left; k++) { var cx = top.x - 2 + k * 5, cy = top.y + 6 + (k % 2); px(cx, cy, 4, 4, 4); px(cx + 1, cy + 1, 1, 1, 1); }
  }
  function boatSprite(x, y, broken, flag) {
    if (broken) {
      // pulled up on the sand, a broken mast, holes in the planks
      spr(['4.....................', '44.................4..', '4344444444444444444344', '4333332333333332333334',
        '.43311333333333113334.', '..433333333333333334..', '...4444444444444444...'], x, y + 2);
      px(x + 10, y - 3, 1, 5, 4); px(x + 11, y - 3, 3, 1, 4);         // snapped mast
      for (var k = 0; k < 26; k += 2) px(x - 2 + k, y + 8, 2, 1, k % 4 ? 2 : 1);   // sand drifted over the keel
      return;
    }
    px(x, y + 3, 20, 1, 4); px(x + 1, y + 4, 18, 2, 3); px(x + 2, y + 6, 16, 1, 4); px(x + 4, y + 4, 12, 1, 2);
    px(x + 9, y - 6, 1, 9, 4);
    if (flag) { px(x + 10, y - 6, 4, 3, 4); px(x + 10, y - 5, 3, 1, 1); }
  }
  // 섬 fish art (shapes face left like SP.fish; FISH_FILL recolours '0' cells)
  FISH_SHAPE.moray = ['...44444444444..', '.40400000000004.', '4000000000000044', '.44444444444444.'];
  FISH_SHAPE.sunfish = ['...444444..', '..40000004.', '.4040000004', '4000000000.4', '.400000004.4', '..40000004.', '...444444..'];
  FISH_SHAPE.dotdom = ['....444444....4', '..4400000044..44', '.40400000000444', '4000000000000044', '.4000000000044.4', '..44000000444...', '....44444444....'];
  FISH_SHAPE.blowfish = ['..44444...', '.4000004.4', '404000004444', '40000000444', '.4000004.4', '..44444...'];
  FISH_FILL.damsel = function (i, j) { return j < 2 ? 3 : 2; };
  FISH_FILL.mullet = function (i, j) { return j === 1 ? 2 : j > 3 ? 0 : 1; };
  FISH_FILL.blenny = function (i, j) { return (i + j) % 3 === 0 ? 3 : 1; };
  FISH_FILL.filefish = function (i, j) { return (i * 2 + j) % 4 === 0 ? 2 : 1; };
  FISH_FILL.tilefish = function (i, j) { return j === 2 ? 0 : 1; };
  FISH_FILL.halfbeak = function (i, j) { return j < 2 ? 2 : 0; };
  FISH_FILL.scorpion = function (i, j) { return (i + j * 3) % 4 === 0 ? 4 : 3; };
  FISH_FILL.flyingfish = function (i, j) { return j < 3 ? 3 : 1; };
  FISH_FILL.blowfish = function (i, j) { return (i + j) % 3 === 0 ? 3 : 1; };
  FISH_FILL.moray = function (i, j) { return (i * 3 + j) % 5 === 0 ? 1 : 3; };
  FISH_FILL.sunfish = function (i, j) { return j === 3 ? 1 : 2; };
  FISH_FILL.grouper = function (i, j) { return (i * 5 + j * 3) % 6 === 0 ? 4 : 2; };
  FISH_FILL.dotdom = function (i, j) { return j < 3 ? 3 : (i + j) % 4 === 0 ? 2 : 1; };

  // drift art: drawn at (x = centre, y = ground)
  var DR_ART = {
    shell: function (x, y) { px(x - 3, y - 4, 7, 1, 4); px(x - 4, y - 3, 9, 2, 4); px(x - 3, y - 1, 7, 1, 4); px(x - 2, y - 3, 1, 2, 1); px(x, y - 4, 1, 3, 1); px(x + 2, y - 3, 1, 2, 1); px(x - 1, y, 3, 1, 3); },
    driftwood: function (x, y) { px(x - 6, y - 2, 12, 2, 2); px(x - 6, y - 2, 12, 1, 4); px(x + 2, y - 4, 1, 2, 2); px(x + 3, y - 5, 2, 1, 2); px(x - 4, y - 1, 2, 1, 1); },
    rope: function (x, y) { ring(x, y - 3, 4, 2, 3); ring(x, y - 3, 2, 1, 4); px(x + 3, y - 1, 4, 1, 3); },
    sanddollar: function (x, y) { px(x - 2, y - 6, 5, 1, 4); px(x - 3, y - 5, 7, 4, 4); px(x - 2, y - 1, 5, 1, 4); px(x - 2, y - 5, 5, 4, 0); px(x, y - 5, 1, 1, 2); px(x - 2, y - 3, 1, 1, 2); px(x + 2, y - 3, 1, 1, 2); px(x - 1, y - 2, 1, 1, 2); px(x + 1, y - 2, 1, 1, 2); },
    conch: function (x, y) { for (var j = 0; j < 6; j++) px(x - 3 + j, y - 6 + j, 6 - j, 1, j % 2 ? 4 : 2); px(x - 4, y - 1, 8, 1, 4); px(x + 2, y - 3, 2, 1, 0); },
    glassfloat: function (x, y) { px(x - 2, y - 7, 5, 1, 4); px(x - 3, y - 6, 7, 5, 4); px(x - 2, y - 1, 5, 1, 4); px(x - 2, y - 6, 5, 5, 1); px(x - 1, y - 5, 1, 1, 0); px(x - 3, y - 4, 7, 1, 3); px(x, y - 6, 1, 5, 3); },
    seaglass: function (x, y) { px(x - 4, y - 2, 3, 2, 1); px(x - 4, y - 2, 1, 1, 0); px(x, y - 3, 2, 3, 2); px(x + 3, y - 2, 2, 2, 1); px(x - 3, y, 8, 1, 3); },
    dletter: function (x, y) { px(x - 4, y - 4, 7, 4, 4); px(x - 3, y - 3, 5, 2, 1); px(x - 2, y - 3, 3, 1, 0); px(x + 3, y - 3, 2, 2, 4); px(x + 5, y - 3, 1, 2, 2); },
    moonshell: function (x, y, tt) { DR_ART.shell(x, y); px(x - 2, y - 3, 5, 2, 0); if (Math.floor((tt || 0) * 2) % 2) { px(x + 4, y - 7, 1, 1, 0); px(x - 5, y - 6, 1, 1, 0); } },
    coral: function (x, y) { px(x, y - 8, 1, 8, 3); px(x - 3, y - 6, 1, 4, 3); px(x - 3, y - 3, 3, 1, 3); px(x + 3, y - 7, 1, 4, 3); px(x + 1, y - 4, 3, 1, 3); px(x - 1, y - 9, 1, 1, 3); px(x - 4, y, 9, 1, 4); },
    exoticseed: function (x, y, tt) { px(x - 2, y - 5, 5, 1, 4); px(x - 3, y - 4, 7, 3, 4); px(x - 2, y - 1, 5, 1, 4); px(x - 1, y - 4, 1, 2, 2); px(x, y - 7, 1, 2, 3); sparkle(x + 4, y - 7, tt || 0); },
    ambergris: function (x, y) { px(x - 4, y - 4, 8, 1, 3); px(x - 5, y - 3, 10, 3, 3); px(x - 4, y, 8, 1, 4); px(x - 2, y - 3, 2, 1, 2); px(x + 2, y - 2, 1, 1, 2); },
    coconut: function (x, y) { px(x - 2, y - 6, 5, 1, 4); px(x - 3, y - 5, 7, 4, 4); px(x - 2, y - 1, 5, 1, 4); px(x - 1, y - 5, 1, 1, 2); px(x + 1, y - 5, 1, 1, 2); px(x, y - 4, 1, 1, 2); }
  };
  function drawDrift(id, x, y, tt) { if (DR_ART[id]) DR_ART[id](x, y, tt); }
  function driftIcon(id) {
    var c = document.createElement('canvas'); c.width = 14; c.height = 14;
    var saved = ctx; ctx = c.getContext('2d');
    try { drawDrift(id, 7, 12, 0); } finally { ctx = saved; }
    return c;
  }
  // the lighthouse reward decoration (logic/island.js LIGHT_DECO)
  DRAW_DECO.buoylamp = function (x, y, tt, night) {
    px(x + 4, y + 8, 2, 12, 4); px(x + 2, y + 19, 6, 1, 4);
    px(x + 1, y + 1, 8, 7, 4); px(x + 2, y + 2, 6, 5, night ? 0 : 1); px(x + 2, y + 4, 6, 1, 3);
    px(x + 3, y, 4, 1, 4); px(x + 4, y + 3, 2, 2, night ? 1 : 0);
  };

  // ---------- 섬 scene ----------
  function drawIsle(tt, dt) {
    var t = now(), e = curEnv(t), night = e.phase === 'night', lit = !!(S.isle && S.isle.lit);
    ctx.drawImage(bgIsle, 0, 0);
    drawSky(tt, e.phase);
    // little waves rolling at the shore line
    for (var k = 0; k < 40; k++) {
      var an = Math.PI * (1.02 + k / 40 * 0.96), ph = (tt * 0.3 + k * 0.17) % 1, rr = 1.02 + ph * 0.12;
      var wx = ISLE_SAND.cx + Math.cos(an) * ISLE_SAND.rx * rr, wy = ISLE_SAND.cy + Math.sin(an) * ISLE_SAND.ry * rr;
      if (wy > 27 && ph < 0.6) px(wx, wy, 2, 1, 0);
    }
    // pier and the boat tied to it
    px(PIER[0], PIER[1], PIER[2], PIER[3], 4);
    for (var y = PIER[1] + 1; y < PIER[1] + PIER[3]; y += 3) px(PIER[0] + 1, y, PIER[2] - 2, 2, y % 2 ? 2 : 0);
    px(PIER[0] - 1, PIER[1] + 2, 2, 5, 4); px(PIER[0] + PIER[2] - 1, PIER[1] + 2, 2, 5, 4);
    px(PIER[0] + 3, PIER[1] - 6, 1, 6, 4); px(PIER[0] + 4, PIER[1] - 6, 5, 4, 4); px(PIER[0] + 5, PIER[1] - 5, 3, 2, 0);   // little 낚시 sign
    boatSprite(MOOR.x, MOOR.y + (Math.floor(tt * 1.4) % 2), false, true);
    drawPalm(tt, L.palmLeft(S, t, TZ));
    drawLighthouse(tt, lit, night);
    drawKeeper(tt);
    if (S.isle) DSPOTS.forEach(function (sp, k) {
      var id = S.isle.drift[k] && S.isle.drift[k].id;
      px(sp[0] - 5, sp[1] + 1, 11, 1, 2);
      if (id) {
        drawDrift(id, sp[0], sp[1], tt);
        var d = L.driftById(id);
        if (d.rarity === '희귀' || d.rarity === '전설') sparkle(sp[0] + 6, sp[1] - 9, tt + k * 0.4);
      }
    });
    drawYardWeather(tt, e.weather);
    if (night || e.phase === 'evening') { ctx.globalAlpha = night ? 0.36 : 0.14; px(0, 0, W, H, 4); ctx.globalAlpha = 1; }
    if (night) {
      drawStars(tt);
      if (lit) drawBeam(LH.x + 8, LH.y + 8, tt, 150);
      if (S.isle) DSPOTS.forEach(function (sp, k) { if (S.isle.drift[k].id === 'moonshell') DR_ART.moonshell(sp[0], sp[1], tt); });
    }
  }
  function tapIsle(x, y) {
    var t = now();
    if (hit([MOOR.x - 2, MOOR.y - 8, 24, 16], x, y, 2)) { openShip(); return; }   // stage 9 ①: 배 sheet (바다로, 먼바다, 배 키우기)
    if (hit(PIER, x, y, 3)) { boatBack('island'); return; }
    for (var k = 0; k < DSPOTS.length; k++) {
      var sp = DSPOTS[k];
      if (!hit([sp[0] - 7, sp[1] - 10, 14, 13], x, y, 2)) continue;
      if (!S.isle.drift[k].id) { toast('파도가 다시 무언가 실어 오는 중 · ' + fmtLeft(Math.max(0, S.isle.drift[k].at - t)), 1800); return; }
      if (bagStop()) return;
      pickDriftAt(k, sp);
      return;
    }
    if (Math.abs(x - (PALM.x - 10)) < 16 && y > PALM.y - 56 && y < PALM.y + 2) {
      if (bagStop()) return;
      var c = L.pickCoconut(S, t, TZ);
      if (!c) { toast('야자 열매는 오늘 다 땄다 · 내일 또 여문다', 2000); return; }
      burst(PALM.x - 10, PALM.y - 40, 8, 4, 40); floatText('+야자 열매', PALM.x - 20, PALM.y - 48);
      toast('야자 열매 · 오늘 ' + L.palmLeft(S, t, TZ) + '개 남음' + (c.sold ? ' · 바로 팔았다 +' + c.sold : ' · 바구니에'), 2200);
      refresh(); return;
    }
    if (hit([KEEPER.x - 2, KEEPER.y - 8, KEEPER.w + 4, KEEPER.h + 10], x, y, 2) || hit([LH.x, LH.y, LH.w, LH.h], x, y, 2)) { openIsle('isle'); return; }
    var nx = L.driftNextAt(S);
    toast('섬 · 바닷가를 누르면 줍기 · 야자수 · 등대지기 할머니 · 부두에서 낚시 · 배를 누르면 배 창 (바다로·배 키우기)' + (nx !== null && !L.driftSpots(S, t).some(Boolean) ? ' · 다음 표류물 ' + fmtLeft(Math.max(0, nx - t)) : ''), 3000);
  }
  function pickDriftAt(k, sp) {
    var r = L.pickDrift(S, k, now(), Math.random);
    if (!r) return;
    tmapAfter('drift'); if (L.driftById(r.id).special === 'letter') rumorAfter('letter');   // stage 8 ③
    var d = L.driftById(r.id);
    burst(sp[0], sp[1] - 4, d.rarity === '흔함' ? 6 : 12, 0, 50);
    floatText('+' + d.name, sp[0], sp[1] - 12);
    if (d.special === 'letter') toast(r.letter ? '병 편지 · ' + r.letter + '번째 편지' + (r.complete ? ' · 12통 완성!' : '') + ' · 도감 › 기록에서 읽기' : '병 편지 · 다 읽은 편지와 동전 +' + r.coins, 3200);
    else if (d.special === 'seed') toast('이국 씨앗 · 심으면 황금 수박이 된다 · 씨앗 ★ +1', 3000);
    else toast((r.first ? '★ 처음 · ' : '') + d.name + (d.rarity !== '흔함' ? ' (' + d.rarity + ')' : '') + (r.sold ? ' · 바구니가 꽉 차 바로 팔았다 +' + r.sold : ' · 바구니에'), 2400);
    refresh();
  }
  // 'sea' = take the boat back to the 바다 spot, 'island' = fish from the 섬 pier
  function boatBack(spot) {
    if (L.curSpot(S) !== spot && !goSpot(spot)) { toast('줄을 걷고 나서 옮길 수 있어요', 2000); return; }
    goScene('farm');
    if (spot === 'island') toast('섬 부두 · 물을 눌러 낚싯대를 던져요 · 배를 누르면 섬 바닷가로', 2800);
  }

  // ---------- farm view: the boat at the 바다 / 섬 shore, the 섬 palm, the lighthouse far out ----------
  function drawIsleWater(tt) {
    var t = now();
    if (scene !== 'sea' && scene !== 'island') return;
    if (scene === 'island') {
      // waves for the 섬 bay (the 바다 has its own in ui/spots.js)
      var sc = SCENES.island;
      for (var k = 0; k < 4; k++) {
        var ph = (tt * 0.12 + k / 4) % 1, r = sc.r * (0.62 + ph * 0.37);
        for (var a = Math.PI * 1.02; a < Math.PI * 1.5; a += 0.012) {
          if ((Math.floor(a * 60 + k * 7) % 5) > 2) continue;
          var x = sc.ox + Math.cos(a) * r, y = sc.oy + Math.sin(a) * r;
          if (x >= 0 && y >= 0 && x < W && y < H) px(x, y, 1, 1, ph > 0.85 ? 0 : 3);
        }
      }
      drawPalmSmall(138, 128, tt);   // a palm on the shore
      boatSprite(BOAT_ISLE.x, BOAT_ISLE.y + (Math.floor(tt * 1.4) % 2), false, true);
    } else if (!S.isle || !S.isle.boat) {
      boatSprite(WRECK[0], WRECK[1], true);
      if (L.boatStatus(S) === 'ok') sparkle(WRECK[0] + WRECK[2] + 2, WRECK[1] - 2, tt);
    } else boatSprite(BOAT_SEA.x, BOAT_SEA.y + (Math.floor(tt * 1.4) % 2), false, true);
    // the mended lighthouse on the far rock; its lamp turns at night
    if (S.isle && S.isle.lit) {
      var lx = FAR_LH.x, ly = FAR_LH.y;
      for (var j = 0; j < 13; j++) px(lx + (j < 4 ? 1 : 0), ly + j, j < 4 ? 3 : 5, 1, j > 5 && j < 8 ? 4 : j < 4 ? 4 : 0);
      px(lx - 2, ly + 13, 9, 2, 4); px(lx - 3, ly + 15, 11, 1, 0);   // its rock and foam
      if (isleNight(t)) { drawBeam(lx + 2, ly + 1, tt, 70); }
    }
  }
  function drawPalmSmall(x, y, tt) {
    var k, sw = Math.round(Math.sin(tt * 0.8));
    for (k = 0; k < 22; k++) px(x - Math.round(Math.sin(k / 22 * 1.3) * 6), y - k, 2, 1, k % 3 === 0 ? 4 : 3);
    var tx = x - 6, ty = y - 22;
    [[-1, 0.2], [1, 0.15], [-1, 0.6], [1, 0.65]].forEach(function (f) {
      for (var j = 0; j < 8; j++) px(tx + f[0] * j + sw * 0.3, ty + j * f[1] + j * j * 0.05, 1, 1, 4);
    });
    px(tx - 1, ty + 1, 2, 2, 4); px(tx + 1, ty + 2, 2, 2, 4);
  }
  function tapIsleWater(x, y) {
    if (view !== 'farm' || S.fish.phase !== 'idle') return false;
    if (scene === 'sea' && (!S.isle || !S.isle.boat)) {
      if (!hit(WRECK, x, y, 3)) return false;
      openIsle('boat'); return true;
    }
    var b = scene === 'island' ? BOAT_ISLE : scene === 'sea' ? BOAT_SEA : null;
    if (!b || !hit([b.x - 2, b.y - 8, 24, 16], x, y, 1)) return false;
    if (L.shipTier(S) >= 1) { openShip(); return true; }   // stage 9 ①: a 돛배 or better goes further: the 배 sheet
    goScene('island');
    toast(scene === 'island' ? '섬 바닷가로' : '배를 타고 섬으로', 1600);
    return true;
  }

  // ---------- sheets: 낡은 배 (repair), 등대지기 (lighthouse story) ----------
  var isleSay = '';
  var BWHY = { sea: '바다가 열려야 해요', coins: '코인이 부족해요', junk: '고물이 부족해요 · 낚시 잡동사니를 모아요', owned: '이미 고쳤어요',
    item: '바구니에 재료가 모자라요', boat: '배를 먼저 고쳐야 해요', done: '등대는 벌써 켜졌어요' };
  function openIsle(kind) {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true;
    sheetKind = kind; sheetEl.hidden = false; isleSay = '';
    renderIsleSheet();
  }
  function isleBtn(label, off, fn) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    if (off) b.classList.add('poor');
    b.addEventListener('click', fn);
    return b;
  }
  function renderIsleSheet() {
    if (sheetKind === 'boat') renderBoat(); else renderKeeper();
  }
  function boatIcon() {
    var c = document.createElement('canvas'); c.width = 22; c.height = 14;
    var saved = ctx; ctx = c.getContext('2d');
    try { boatSprite(1, 7, false, true); } finally { ctx = saved; }
    return c;
  }
  function renderBoat() {
    var st = L.boatStatus(S), F = L.BOAT_FIX;
    sheetHead('낡은 배');
    var say = document.createElement('p'); say.className = 'say';
    say.textContent = st === 'owned' ? '배가 물에 떠 있다. 누르면 섬으로 간다.' : '모래에 반쯤 묻힌 낡은 배. 구멍만 메우면 저 멀리 등대섬까지 갈 수 있을 것 같다.';
    sheetEl.appendChild(say);
    var h3 = document.createElement('h3'); h3.textContent = '고치는 데 드는 것'; sheetEl.appendChild(h3);
    sheetRow(boatIcon(), '코인', F.coins.toLocaleString('ko-KR') + '코인 · 가진 것 ' + S.coins.toLocaleString('ko-KR'), S.coins >= F.coins ? '' : 'idle');
    sheetRow(junkCanvas('can'), '고물 ' + F.junk + '개', '낚시 잡동사니(장화·깡통·유리병·열쇠) · 가진 것 ' + L.scrapCount(S) + '개 · 열쇠는 맨 나중에 쓴다', L.scrapCount(S) >= F.junk ? '' : 'idle');
    var r = sheetRow(boatIcon(), '배 고치기', st === 'ok' ? '고치면 이동 › 섬 · 섬 낚시터, 바닷가 표류물, 등대' : BWHY[st] || '', st === 'ok' ? '' : 'idle');
    r.appendChild(isleBtn(st === 'owned' ? '완료' : '고치기', st !== 'ok', function () {
      var res = L.fixBoat(S);
      if (!res.ok) { toast(BWHY[res.why] || '아직 못 고쳐요'); return; }
      burst(WRECK[0] + 12, WRECK[1] + 4, 20, 0, 70);
      toast('★ 배를 고쳤다 · 배를 누르거나 이동 › 섬', 3600);
      closeSheet(); refresh(); renderSceneBtn();
    }));
  }
  function renderKeeper() {
    var t = now(), cur = L.lighthouseStep(S), keep = sheetEl.scrollTop;
    sheetHead('등대지기 할머니');
    var say = document.createElement('p'); say.className = 'say';
    say.textContent = isleSay || (cur && cur.k === 0 ? '할머니: 어서 와요. 이 섬에 손님은 오랜만이네.' : L.keeperLine(S, t, TZ));
    sheetEl.appendChild(say);
    var h3 = document.createElement('h3'); h3.textContent = '꺼진 등대';
    var hb = document.createElement('b'); hb.textContent = cur ? (cur.k + 1) + ' / ' + cur.total + '단계' : '불 켜짐'; h3.appendChild(hb); sheetEl.appendChild(h3);
    if (cur) {
      var need = cur.step.need, have = need ? L.bagCount(S, need[0]) : 0;
      var r = sheetRow(need ? itemIcon(need[0]) : letterIcon(), cur.step.todo, need ? '가진 것 ' + have + '/' + need[1] + ' · ' + L.itemInfo(need[0]).name + ' · ' + isleWhere(need[0]) : '할머니 이야기를 들어 보자');
      r.appendChild(isleBtn(need ? '건네기' : '말 걸기', !!need && have < need[1], function () {
        var res = L.advanceLighthouse(S);
        if (!res.ok) { toast(BWHY[res.why] || '아직이에요'); return; }
        isleSay = res.say;
        if (res.done) {
          burst(LH.x + 8, LH.y + 8, 24, 0, 90);
          toast('★ 등대에 불이 켜졌다 · +' + res.reward.coins + '코인' + (res.reward.deco ? ' · 부표 등불 받음' + (res.reward.stored ? ' (보관함)' : '') : '') + ' · 밤이 되면 바다를 비춘다', 4200);
        } else toast('다음: ' + L.lighthouseStep(S).step.todo, 2600);
        refresh(); renderKeeper();
      }));
    } else {
      var p = document.createElement('p'); p.className = 'note';
      p.textContent = '밤이 되면 섬과 바다에 등대 불빛이 돈다';
      sheetEl.appendChild(p);
    }
    sheetEl.scrollTop = keep;
  }
  function isleWhere(id) { return id === 'coconut' ? '야자수에서' : '섬 바닷가에서'; }

  // ---------- tick: drift washes up while the 섬 is on screen; sheets close when leaving ----------
  var isleKey = '';
  function tickIsleUI(t) {
    if ((sheetKind === 'isle' && view !== 'island') || (sheetKind === 'boat' && view !== 'farm')) closeSheet();
    if (view !== 'island' || !L.isleOk(S)) return;
    var before = S.isle.drift.map(function (p) { return p.id; });
    if (L.tickIsle(S, t, curEnv(t), Math.random)) {
      save();
      var fresh = S.isle.drift.some(function (p, k) { var d = p.id && !before[k] && L.driftById(p.id); return d && L.driftConditional(d) && !S.isle.dex[d.id]; });
      if (fresh) toast('섬 바닷가에 처음 보는 게 밀려왔다…', 3000);
    }
    var key = sheetKind + (L.lighthouseStep(S) ? L.lighthouseStep(S).k : 'lit') + S.bag.length;
    if (sheetKind === 'isle' && !sheetEl.hidden && quiet() && key !== isleKey) renderKeeper();
    isleKey = key;
  }
  function isleAttention() {
    if (!L.isleOk(S)) return false;
    var t = now(), nx = L.driftNextAt(S), cur = L.lighthouseStep(S);
    if (L.driftSpots(S, t).some(Boolean) || (nx !== null && nx <= t) || L.palmLeft(S, t, TZ) > 0) return true;
    return !!cur && (!cur.step.need || L.bagCount(S, cur.step.need[0]) >= cur.step.need[1]);
  }

  // ---------- 도감 섬 section and 달력 entries ----------
  function driftCond(d) {
    var out = [];
    if (d.season) out.push(d.season.map(function (x) { return L.SEASON_NAME[x]; }).join('·'));
    if (d.phase) out.push(d.phase.map(function (x) { return L.PHASE_NAME[x]; }).join('·') + '에만');
    if (d.weather) out.push(L.WEATHER_NAME[d.weather] + ' 올 때');
    return out.length ? out.join(' · ') : '언제나';
  }
  function renderIsleDex(row) {
    var list = L.DRIFT.concat([L.COCONUT]);
    var n = list.filter(function (d) { return S.isle && S.isle.dex[d.id]; }).length;
    dexHead('섬 표류물', n, list.length, L.isleOk(S) ? '등대 ' + (S.isle.lit ? '불 켜짐' : (S.isle.lh + 1) + '/' + L.LIGHTHOUSE.length + '단계') : '바다 낚시터의 낡은 배를 고치면 섬에 갈 수 있어요');
    list.forEach(function (d) {
      var c = S.isle ? S.isle.dex[d.id] || 0 : 0, ic = driftIcon(d.id); ic.className = 'sq';
      var price = d.special === 'letter' ? '병 편지 이야기' : d.special === 'seed' ? '황금 수박 씨앗' : d.price + '코인';
      row(ic, c ? (d.rarity === '희귀' || d.rarity === '전설' ? '★ ' : '') + d.name : '???',
        c ? (d.rarity ? d.rarity + ' · ' + driftCond(d) : '야자수 · 하루 ' + L.PALM_N + '개') + ' · ' + price : d.hint, c ? c + '개' : '', !c);
    });
  }
  function renderIsleNow() {
    var e = curEnv(now());
    var list = L.DRIFT.filter(function (d) { return L.driftConditional(d) && L.driftWeight(d, e) > 0; });
    if (!list.length && !L.isleOk(S)) return;
    var h3 = document.createElement('h3'); h3.textContent = '섬에서 지금';
    var hb = document.createElement('b'); hb.textContent = L.isleOk(S) ? '등대 ' + (S.isle.lit ? '불 켜짐' : (S.isle.lh + 1) + '/' + L.LIGHTHOUSE.length + '단계') : '섬 잠김'; h3.appendChild(hb);
    calEl.appendChild(h3);
    list.forEach(function (d) {
      var got = S.isle && S.isle.dex[d.id];
      var r = document.createElement('div'); r.className = 'dx' + (got ? '' : ' unk');
      var ic = driftIcon(d.id); ic.className = 'sq'; if (!got) ic.style.opacity = '0.5';
      var n = document.createElement('div'); n.className = 'n'; n.textContent = got ? d.name : '???';
      var s3 = document.createElement('small'); s3.textContent = got ? d.rarity + ' · ' + driftCond(d) : d.hint; n.appendChild(s3);
      var v = document.createElement('div'); v.className = 'v'; v.textContent = d.rarity;
      r.appendChild(ic); r.appendChild(n); r.appendChild(v); calEl.appendChild(r);
    });
    if (L.isleOk(S)) note('야자 열매 오늘 ' + L.palmLeft(S, now(), TZ) + '개 남음' + (S.isle.lit ? ' · 밤마다 등대 불빛' : ''));
  }

  // 사진기 (lane ①) hook: once L.shotsNow exists, the camera's ctx learns whether the lit lighthouse is on screen
  function isleShotCtx(c) {
    if (typeof L.shotsNow !== 'function') return c;
    c.lighthouse = isleLight(now()) && (view === 'island' || (view === 'farm' && (scene === 'sea' || scene === 'island')));
    return c;
  }

  // ---------- console hooks ----------
  function addIsleHooks(FF) {
    // FF.isle() fixes the boat (opening the 바다 if needed) and goes to the 섬
    FF.isle = function () {
      if (!L.spotUnlocked(S, 'sea')) { S.spotOk = S.spotOk || {}; S.spotOk.sea = true; }
      if (!L.isleOk(S)) { S.coins += L.BOAT_FIX.coins; var j = L.junkOf(S); j.n.can = (j.n.can || 0) + L.BOAT_FIX.junk; L.fixBoat(S); }
      goScene('island'); refresh(); return S.isle;
    };
    FF.wreck = function () { delete S.isle; if (S.spotOk) delete S.spotOk.island; if (L.curSpot(S) === 'island' || S.spot === 'island') S.spot = 'sea'; setScene(); refresh(); };
    // FF.drift() washes every spot up now; FF.drift(id) puts that find on every spot; FF.drift('all') fills the 도감
    FF.drift = function (id) {
      if (!L.isleOk(S)) FF.isle();
      if (id === 'all') { L.DRIFT.concat([L.COCONUT]).forEach(function (d) { S.isle.dex[d.id] = (S.isle.dex[d.id] || 0) + 1; }); refresh(); return L.isleDexCount(S); }
      S.isle.drift.forEach(function (p) { p.at = 0; p.id = id && L.driftById(id) ? id : null; });
      L.tickIsle(S, now(), curEnv(now()), Math.random); refresh();
      return S.isle.drift.map(function (p) { return p.id; });
    };
    // FF.lighthouse(k) jumps the story to step k (k = steps → lit); FF.lighthouse() gives what the current step needs
    FF.lighthouse = function (k) {
      if (!L.isleOk(S)) FF.isle();
      if (typeof k === 'number') { S.isle.lh = Math.max(0, Math.min(L.LIGHTHOUSE.length, k)); S.isle.lit = S.isle.lh >= L.LIGHTHOUSE.length; refresh(); return S.isle.lh; }
      var cur = L.lighthouseStep(S);
      if (cur && cur.step.need) for (var j = 0; j < cur.step.need[1]; j++) L.bagAdd(S, cur.step.need[0], L.itemInfo(cur.step.need[0]).price);
      refresh(); return cur && cur.step.todo;
    };
    FF.palm = function () { if (S.isle) S.isle.palm = { day: -1, n: 0 }; refresh(); };
  }
