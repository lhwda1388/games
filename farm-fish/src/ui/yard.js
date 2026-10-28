  // ---------- 마당 scene: house, pots, animals, decorations; scene switch farm ↔ 마당 ↔ 집 안 ----------
  var view = 'farm';
  // 이/가 · 을/를 by the last syllable's final consonant (고양이 → 가, 꽃밭 → 이)
  function josa(w, a, b) { var c = w.charCodeAt(w.length - 1) - 0xAC00; return w + (c >= 0 && c < 11172 && c % 28 ? a : b); }
  var YTZ = -new Date().getTimezoneOffset();
  L.yardOf(S);
  // stage 2's curEnv: the shared clock, or FF.weather / FF.phase overrides while testing
  function yPhase() { return curEnv(now()).phase; }
  function yWeather() { return curEnv(now()).weather; }

  // layout: every decoration has one fixed spot [x, y, w, h]
  var DSPOT = {
    windmill: [16, 12, 24, 50], tree: [150, 14, 28, 56], birdhouse: [42, 38, 10, 26], mailbox: [44, 76, 11, 18],
    flowers: [4, 88, 32, 16], lanterns: [68, 90, 44, 14], bench: [126, 98, 24, 12], jars: [152, 94, 24, 18],
    laundry: [106, 118, 46, 24], stones: [158, 146, 18, 30], fence: [104, 184, 74, 12], chime: [0, 0, 7, 12]
  };
  var PEN = { x: 4, y: 116, w: 98, h: 80 };
  var HOUSE_BOX = [[66, 46, 48, 40], [62, 38, 56, 48], [56, 36, 68, 50], [60, 20, 60, 66]];
  var GIFT_AT = { x: 98, y: 88 };
  function houseBox() { var b = HOUSE_BOX[L.houseTier(S)]; return { x: b[0], y: b[1], w: b[2], h: b[3] }; }
  function chimeSpot() { var b = houseBox(); return [b.x + b.w - 3, L.houseTier(S) === 3 ? b.y + 14 : b.y + 12, 7, 12]; }
  function spot(id) { return id === 'chime' ? chimeSpot() : DSPOT[id]; }
  function potRect(k) { return { x: 128 + k * 14, y: 72, w: 13, h: 12 }; }
  function hit(r, x, y, pad) { pad = pad || 0; return x >= r[0] - pad && x < r[0] + r[2] + pad && y >= r[1] - pad && y < r[1] + r[3] + pad; }

  // ---------- pre-rendered yard ground ----------
  var bgYard = document.createElement('canvas'); bgYard.width = W; bgYard.height = H;
  (function paintYard() {
    var saved = ctx; ctx = bgYard.getContext('2d');
    for (var y = 0; y < 26; y++) for (var x = 0; x < W; x++) if ((x * 3 + y * 7) % 23 === 0 && y < 20) px(x, y, 1, 1, 1);
    // far hills on the horizon
    for (x = 0; x < W; x++) { var hh = Math.round(3 + Math.sin(x / 17) * 2 + Math.sin(x / 7 + 1) * 1); px(x, 26 - hh, 1, hh, (x + hh) % 3 ? 1 : 2); }
    px(0, 26, W, 1, 3);
    for (var k = 0; k < 220; k++) {
      var gx = Math.floor(hash(k * 7 + 3) * W), gy = 28 + Math.floor(hash(k * 13 + 1) * (H - 28));
      var c = hash(k * 3 + 2) < 0.7 ? 1 : 2; px(gx, gy, 1, 1, c); if (hash(k + 7) < 0.4) px(gx + 1, gy - 1, 1, 1, c);
    }
    // stepping-stone path from the door down to the pen gate and out
    for (var p = 0; p < 7; p++) { var py = 90 + p * 6, pxx = 88 + Math.round(Math.sin(p) * 3); px(pxx, py, 5, 3, 2); px(pxx + 1, py, 3, 1, 1); }
    // pen: a rail fence on posts, straw dots, a little water trough for ducks
    for (x = PEN.x; x < PEN.x + PEN.w; x++) { px(x, PEN.y, 1, 1, 3); px(x, PEN.y + PEN.h - 1, 1, 1, 3); if (x % 2) { px(x, PEN.y + 3, 1, 1, 2); } }
    for (y = PEN.y; y < PEN.y + PEN.h; y++) { px(PEN.x, y, 1, 1, 3); px(PEN.x + PEN.w - 1, y, 1, 1, 3); }
    for (x = PEN.x; x <= PEN.x + PEN.w; x += 12) { px(Math.min(x, PEN.x + PEN.w - 2), PEN.y - 3, 2, 7, 4); px(Math.min(x, PEN.x + PEN.w - 2), PEN.y + PEN.h - 4, 2, 6, 4); }
    for (k = 0; k < 40; k++) px(PEN.x + 3 + Math.floor(hash(k * 5 + 9) * (PEN.w - 6)), PEN.y + 6 + Math.floor(hash(k * 11 + 4) * (PEN.h - 10)), 2, 1, 2);
    px(10, 178, 26, 12, 4); px(11, 179, 24, 10, 1); for (x = 12; x < 34; x += 3) px(x, 182 + (x % 2), 2, 1, 2);
    px(26, 120, 18, 1, 4); px(26, 121, 1, 4, 4); px(43, 121, 1, 4, 4); px(28, 119, 14, 1, 3);       // little sign over the gate
    ctx = saved;
  })();

  // ---------- house exterior ----------
  function windowsOf(t) {
    var b = HOUSE_BOX[t];
    if (t === 0) return [];
    if (t === 1) return [[b[0] + 8, b[1] + 28, 8, 7]];
    if (t === 2) return [[b[0] + 8, b[1] + 30, 12, 9], [b[0] + b[2] - 20, b[1] + 30, 12, 9]];
    return [[b[0] + 8, b[1] + 22, 10, 8], [b[0] + b[2] - 18, b[1] + 22, 10, 8], [b[0] + 8, b[1] + 46, 10, 8], [b[0] + b[2] - 18, b[1] + 46, 10, 8]];
  }
  function drawWindow(r, lit) {
    px(r[0] - 1, r[1] - 1, r[2] + 2, r[3] + 2, 4);
    px(r[0], r[1], r[2], r[3], lit ? 0 : 2);
    if (lit) px(r[0] + 1, r[1] + 1, r[2] - 2, r[3] - 2, 1);
    px(r[0] + Math.floor(r[2] / 2), r[1], 1, r[3], 4); px(r[0], r[1] + Math.floor(r[3] / 2), r[2], 1, 4);
    if (lit) for (var k = 1; k < 3; k++) { px(r[0] - 1 - k, r[1] + r[3] + k, r[2] + 2 + k * 2, 1, 1); }
  }
  function drawHouse(tt, night, snow) {
    var t = L.houseTier(S), b = houseBox(), x = b.x, y = b.y, w = b.w, cx = x + w / 2, k;
    if (t === 0) {
      // canvas tent: triangle with a dark door flap and a pole
      for (k = 0; k < 40; k++) { var half = Math.round(k * 0.6); px(cx - half, y + k, half * 2, 1, 4); if (half > 1) px(cx - half + 1, y + k, half * 2 - 2, 1, (k % 6 === 0) ? 2 : 1); }
      for (k = 14; k < 40; k++) { var hw = Math.round((k - 14) * 0.35); px(cx - hw, y + k, hw * 2 + 1, 1, 4); }
      px(cx, y - 4, 1, 5, 4); px(cx + 1, y - 4, 3, 2, 3);
      if (snow) for (k = 2; k < 12; k++) px(cx - Math.round(k * 0.6), y + k - 1, 2, 1, 0), px(cx + Math.round(k * 0.6) - 2, y + k - 1, 2, 1, 0);
      return;
    }
    if (t === 1) {
      // 오두막: plank walls, dark gable roof, chimney
      px(x + 2, y + 18, w - 4, 30, 4); px(x + 3, y + 19, w - 6, 28, 1);
      for (k = y + 22; k < y + 47; k += 4) px(x + 3, k, w - 6, 1, 2);
      for (k = 0; k < 20; k++) { var rh = Math.round(k * 1.5); px(cx - rh, y + k, rh * 2, 1, 4); if (k > 1 && k % 3 === 0) px(cx - rh + 2, y + k, rh * 2 - 4, 1, 3); }
      px(x + w - 16, y + 2, 5, 10, 4); px(x + w - 15, y + 3, 3, 2, 3);
      if (Math.floor(tt * 1.5) % 3 !== 2) { px(x + w - 14, y - 2 - (Math.floor(tt * 3) % 3), 2, 1, 2); }
      px(cx - 4, y + 32, 9, 16, 4); px(cx - 3, y + 33, 7, 15, 3); px(cx + 2, y + 40, 1, 1, 0);
      if (snow) for (k = 0; k < 20; k += 2) { px(cx - Math.round(k * 1.5), y + k - 1, 3, 1, 0); px(cx + Math.round(k * 1.5) - 3, y + k - 1, 3, 1, 0); }
    } else if (t === 2) {
      // 기와집: pale walls between dark pillars, curved tiled roof with upturned eaves
      px(x + 4, y + 22, w - 8, 28, 4); px(x + 5, y + 23, w - 10, 27, 0);
      [x + 5, x + 22, x + w - 23, x + w - 6].forEach(function (pxl) { px(pxl, y + 23, 2, 27, 3); });
      px(x + 2, y + 48, w - 4, 2, 4);
      for (k = 0; k < 14; k++) { var ww = Math.round(18 + k * 2.6); px(cx - ww, y + 6 + k, ww * 2, 1, k % 3 === 2 ? 3 : 4); }
      px(x - 2, y + 16, 6, 2, 4); px(x - 3, y + 15, 2, 1, 4); px(x + w - 4, y + 16, 6, 2, 4); px(x + w + 1, y + 15, 2, 1, 4);
      px(cx - 16, y + 4, 32, 3, 4); px(cx - 18, y + 3, 3, 1, 4); px(cx + 15, y + 3, 3, 1, 4);
      for (k = x + 4; k < x + w - 4; k += 3) px(k, y + 19, 1, 1, 2);
      px(cx - 5, y + 30, 11, 20, 4); px(cx - 4, y + 31, 9, 19, 2); px(cx, y + 31, 1, 19, 4);
      for (k = y + 34; k < y + 50; k += 4) px(cx - 4, k, 9, 1, 3);
      if (snow) { px(cx - 16, y + 3, 32, 1, 0); for (k = 0; k < 6; k++) px(cx - 20 - k * 3, y + 7 + k, 4, 1, 0), px(cx + 17 + k * 3, y + 7 + k, 4, 1, 0); }
    } else {
      // 2층집: two floors, a balcony rail, gable roof, chimney with smoke
      px(x + 2, y + 16, w - 4, 50, 4); px(x + 3, y + 17, w - 6, 49, 1);
      px(x + 3, y + 40, w - 6, 2, 4); for (k = x + 4; k < x + w - 4; k += 3) px(k, y + 36, 1, 4, 3); px(x + 3, y + 35, w - 6, 1, 4);
      for (k = y + 18; k < y + 66; k += 5) px(x + 3, k, w - 6, 1, 2);
      for (k = 0; k < 16; k++) { var r2 = Math.round(k * 2.1); px(cx - r2, y + k, r2 * 2, 1, 4); if (k % 3 === 1) px(cx - r2 + 2, y + k, Math.max(0, r2 * 2 - 4), 1, 3); }
      px(x + w - 14, y - 2, 6, 10, 4); px(x + w - 13, y - 1, 4, 2, 3);
      if (Math.floor(tt * 1.5) % 3 !== 2) px(x + w - 12, y - 6 - (Math.floor(tt * 3) % 3), 2, 1, 2);
      px(cx - 5, y + 48, 11, 18, 4); px(cx - 4, y + 49, 9, 17, 3); px(cx + 2, y + 57, 1, 1, 0);
      if (snow) for (k = 0; k < 16; k += 2) { px(cx - Math.round(k * 2.1), y + k - 1, 4, 1, 0); px(cx + Math.round(k * 2.1) - 4, y + k - 1, 4, 1, 0); }
    }
    windowsOf(t).forEach(function (r) { drawWindow(r, false); });
  }

  // ---------- decorations ----------
  var DRAW_DECO = {
    windmill: function (x, y, tt) {
      px(x + 9, y + 18, 6, 32, 4); px(x + 10, y + 19, 4, 31, 1); px(x + 7, y + 48, 10, 2, 4); px(x + 11, y + 40, 2, 6, 4);
      var a = tt * (millSpin > 0 ? 6 : 1.2), hx = x + 12, hy = y + 16;
      for (var b = 0; b < 4; b++) {
        var an = a + b * Math.PI / 2;
        for (var r = 2; r < 12; r++) { px(hx + Math.cos(an) * r, hy + Math.sin(an) * r, 1, 1, 4); if (r > 4) px(hx + Math.cos(an + 0.18) * r, hy + Math.sin(an + 0.18) * r, 1, 1, 2); }
      }
      px(hx - 1, hy - 1, 3, 3, 4);
    },
    tree: function (x, y, tt) {
      px(x + 12, y + 30, 5, 26, 4); px(x + 13, y + 31, 2, 25, 3);
      for (var k = 0; k < 60; k++) {
        var a = hash(k * 7 + 1) * Math.PI * 2, r = Math.sqrt(hash(k * 3 + 5)) * 13;
        px(x + 14 + Math.cos(a) * r, y + 18 + Math.sin(a) * r * 0.9, 3, 2, k % 4 === 0 ? 2 : 4);
      }
      for (k = 0; k < 10; k++) px(x + 6 + hash(k * 9) * 16, y + 9 + hash(k * 4) * 18, 1, 1, 1);
    },
    birdhouse: function (x, y) {
      px(x + 4, y + 10, 2, 16, 4);
      px(x, y + 4, 10, 8, 4); px(x + 1, y + 5, 8, 6, 1); px(x + 4, y + 7, 2, 2, 4);
      px(x - 1, y + 3, 12, 1, 4); px(x + 1, y + 2, 8, 1, 4); px(x + 3, y + 1, 4, 1, 4); px(x + 6, y + 10, 3, 1, 4);
    },
    mailbox: function (x, y) {
      px(x + 4, y + 8, 2, 10, 4);
      px(x, y + 1, 10, 8, 4); px(x + 1, y + 2, 8, 6, 0); px(x + 1, y, 8, 1, 4);
      var unread = S.yard.mail.some(function (m) { return !m.read; });
      if (unread) { px(x + 9, y - 3, 1, 6, 4); px(x + 10, y - 3, 3, 2, 3); px(x + 2, y + 3, 6, 3, 2); }
      else px(x + 9, y + 3, 3, 1, 4);
    },
    flowers: function (x, y, tt) {
      px(x, y + 12, 32, 4, 3);
      for (var k = 0; k < 9; k++) {
        var fx = x + 2 + k * 3.4, fy = y + 4 + (k % 3) * 3, sw = Math.floor(tt * 1.3 + k) % 4 === 0 ? 1 : 0;
        px(fx, fy + 3, 1, 12 - fy + y, 3);
        px(fx - 1 + sw, fy, 3, 1, k % 2 ? 4 : 2); px(fx + sw, fy - 1, 1, 3, k % 2 ? 4 : 2); px(fx + sw, fy, 1, 1, 0);
      }
    },
    lanterns: function (x, y, tt, night) {
      px(x, y, 2, 14, 4); px(x + 42, y, 2, 14, 4);
      for (var k = 0; k < 40; k++) px(x + 2 + k, y + 1 + Math.round(Math.sin(k / 40 * Math.PI) * 3), 1, 1, 3);
      for (k = 0; k < 4; k++) {
        var lx = x + 7 + k * 10, ly = y + 3 + Math.round(Math.sin((lx - x) / 44 * Math.PI) * 3);
        px(lx, ly, 5, 6, 4); px(lx + 1, ly + 1, 3, 4, night ? 0 : 2); px(lx + 2, ly + 6, 1, 2, 4);
      }
    },
    bench: function (x, y) {
      px(x, y, 24, 2, 4); px(x + 1, y + 3, 22, 2, 4); px(x + 2, y + 1, 20, 1, 1);
      px(x + 2, y + 5, 2, 6, 4); px(x + 20, y + 5, 2, 6, 4); px(x + 1, y - 4, 22, 1, 4); px(x + 3, y - 3, 1, 3, 4); px(x + 20, y - 3, 1, 3, 4);
    },
    jars: function (x, y) {
      px(x, y + 14, 24, 3, 3);
      [[x + 1, y + 4, 9], [x + 11, y + 2, 11], [x + 6, y + 8, 7]].forEach(function (j) {
        var jx = j[0], jy = j[1], w = j[2];
        px(jx + 1, jy, w - 2, 1, 4); px(jx, jy + 1, w, 12 - (jy - y), 4); px(jx + 1, jy + 2, w - 2, 10 - (jy - y), 3);
        px(jx + 2, jy + 3, 1, 3, 2); px(jx + 1, jy - 1, w - 2, 1, 4);
      });
    },
    laundry: function (x, y, tt) {
      px(x, y, 2, 24, 4); px(x + 44, y, 2, 24, 4);
      for (var k = 2; k < 44; k++) px(x + k, y + 2 + Math.round(Math.sin(k / 44 * Math.PI) * 2), 1, 1, 3);
      var sw = Math.round(Math.sin(tt * 2));
      px(x + 8 + sw, y + 4, 9, 10, 4); px(x + 9 + sw, y + 5, 7, 8, 0); px(x + 11 + sw, y + 5, 3, 2, 2);
      px(x + 22, y + 5, 5, 8, 4); px(x + 23, y + 6, 3, 6, 1);
      px(x + 30 - sw, y + 4, 8, 6, 4); px(x + 31 - sw, y + 5, 6, 4, 2);
    },
    stones: function (x, y) {
      [[x + 1, y + 23, 16, 6], [x + 3, y + 17, 12, 6], [x + 4, y + 12, 10, 5], [x + 6, y + 7, 7, 5], [x + 7, y + 3, 5, 4], [x + 8, y, 3, 3]].forEach(function (r, k) {
        px(r[0], r[1], r[2], r[3], 4); px(r[0] + 1, r[1] + 1, r[2] - 2, r[3] - 2, k % 2 ? 2 : 1);
      });
    },
    fence: function (x, y) {
      px(x, y + 4, 74, 1, 4); px(x, y + 8, 74, 1, 4);
      for (var k = 0; k < 74; k += 5) { px(x + k, y + 1, 3, 11, 4); px(x + k + 1, y + 2, 1, 9, 0); px(x + k + 1, y, 1, 1, 4); }
    },
    chime: function (x, y, tt) {
      var sw = Math.round(Math.sin(tt * 2.2) * (chimeRing > 0 ? 2 : 1));
      px(x + 3, y, 1, 3, 4); px(x + 1, y + 3, 5, 4, 4); px(x + 2, y + 4, 3, 2, 2);
      px(x + 3 + sw, y + 7, 1, 3, 3); px(x + 2 + sw, y + 10, 3, 2, 4);
    }
  };
  var millSpin = 0, chimeRing = 0;
  function drawSlot(r) {
    // an empty spot you can fill: a faint dashed square with a + in the middle
    for (var k = 0; k < r[2]; k += 3) { px(r[0] + k, r[1] + r[3] - 1, 1, 1, 2); }
    var cx = r[0] + Math.floor(r[2] / 2), cy = r[1] + r[3] - 5;
    px(cx - 1, cy, 3, 1, 2); px(cx, cy - 1, 1, 3, 2);
  }

  // ---------- animals ----------
  function hen(x, y, flip, peck) {
    spr(peck ? ['........', '........', '..3.....', '.4444444', '40000004', '.4000004', '..44444.', '...4.4..']
             : ['.3......', '404.....', '4004....', '.4044444', '.4000004', '.4000004', '..44444.', '...4.4..'], x, y, flip);
  }
  function cow(x, y, tt, flip) {
    var hx = flip ? x - 4 : x + 13;
    px(x, y, 14, 8, 4); px(x + 1, y + 1, 12, 6, 0);
    px(x + 3, y + 1, 3, 3, 4); px(x + 8, y + 3, 4, 2, 4); px(x + 2, y + 5, 2, 2, 3);
    px(x + 1, y + 8, 2, 4, 4); px(x + 11, y + 8, 2, 4, 4); px(x + 4, y + 8, 1, 3, 4); px(x + 9, y + 8, 1, 3, 4);
    var nod = Math.floor(tt * 0.7) % 4 === 0 ? 2 : 0;
    px(hx, y - 2 + nod, 5, 6, 4); px(hx + 1, y - 1 + nod, 3, 4, 0); px(hx + (flip ? 1 : 3), y + nod, 1, 1, 4);
    px(hx, y - 3 + nod, 1, 1, 3); px(hx + 4, y - 3 + nod, 1, 1, 3); px(hx + 1, y + 3 + nod, 3, 1, 2);
    px(flip ? x + 14 : x - 1, y + 1 + (Math.floor(tt * 2) % 2), 1, 4, 4);
  }
  var DUCK = ['....44..', '...4004.', '...40443', '4..4004.', '44440004', '.4000004', '..44444.'];
  var DUCKLING = ['.44..', '4044.', '.4003', '.444.'];
  function duck(x, y, flip, small) { spr(small ? DUCKLING : DUCK, x, y, flip); }
  function drawAnimals(tt) {
    var a = S.animals, p = S.yard.prod, k;
    for (k = 0; k < a.hen; k++) {
      var hx = 16 + k * 18 + Math.round(Math.sin(tt * 0.5 + k * 2) * 7), hy = 150 + k * 5;
      hen(hx, hy, Math.cos(tt * 0.5 + k * 2) < 0, Math.floor(tt * 1.7 + k) % 5 === 0);
    }
    for (k = 0; k < a.cow; k++) cow(56 + k * 22 - (k ? 0 : 6), 128 + k * 6, tt + k, k === 1);
    for (k = 0; k < a.duck; k++) duck(14 + k * 11 + Math.round(Math.sin(tt * 0.8 + k) * 3), 174 + k, Math.sin(tt * 0.8 + k) < 0);
    // what's waiting on the ground: eggs by the hens, a milk can by the cow, duck eggs/feathers by the trough
    for (k = 0; k < Math.min(p.hen.n, 8); k++) { var ex = 14 + (k % 4) * 6, ey = 166 + Math.floor(k / 4) * 4; px(ex, ey, 3, 3, 4); px(ex + 1, ey + 1, 1, 1, 0); }
    for (k = 0; k < Math.min(p.cow.n, 8); k++) { var mx = 72 + (k % 4) * 5, my = 172 + Math.floor(k / 4) * 10; px(mx, my, 3, 7, 4); px(mx + 1, my + 2, 1, 4, 0); px(mx, my - 1, 3, 1, 3); }
    for (k = 0; k < Math.min(p.duck.n, 8); k++) { var dx = 40 + (k % 4) * 5, dy = 182 + Math.floor(k / 4) * 5; px(dx, dy, 3, 4, 4); px(dx + 1, dy + 1, 1, 2, 1); }
    if (L.productsWaiting(S)) sparkle(PEN.x + PEN.w - 8, PEN.y + 8, tt);
    if (!a.hen && !a.cow && !a.duck) { px(40, 150, 24, 12, 4); px(41, 151, 22, 10, 0); px(44, 154, 4, 4, 3); px(50, 155, 10, 1, 3); px(50, 157, 8, 1, 3); px(51, 162, 2, 6, 4); }
  }

  // ---------- draw: the whole 마당 ----------
  function drawYardPots(tt) {
    var t = now();
    for (var k = 0; k < L.potCount(S); k++) {
      var r = potRect(k), p = L.potGet(S, k);
      spr(SP.pot, r.x, r.y + 2);
      if (!p) continue;
      if (t >= p.until) sparkle(r.x + 11, r.y, tt + k * 0.3);
      else for (var w = 0; w < 2; w++) { var ph = (tt * 0.9 + w * 0.5 + k * 0.2) % 1; px(r.x + 4 + w * 4, r.y + 1 - Math.round(ph * 7), 1, 1, 2); }
    }
  }
  function drawYard(tt, dt) {
    var ph = yPhase(), night = ph === 'night', wx = yWeather();
    millSpin = Math.max(0, millSpin - dt); chimeRing = Math.max(0, chimeRing - dt);
    ctx.drawImage(bgYard, 0, 0);
    drawSky(tt, ph);
    drawSeasonGround('yard');
    L.DECOS.forEach(function (d) {
      var r = spot(d.id);
      if (S.yard.deco[d.id]) DRAW_DECO[d.id](r[0], r[1], tt, night);
      else if (!d.merchant && L.decoCount(S) < L.decoSlots(S) && d.id !== 'chime') drawSlot(r);
    });
    drawHouse(tt, night, wx === 'snow' || seasonNow() === 'winter');
    drawTrophyDecor(tt);
    if (S.yard.deco.chime) { var cs = chimeSpot(); DRAW_DECO.chime(cs[0], cs[1], tt); }
    drawYardPots(tt);
    if (S.yard.gifts.length) {
      var g = GIFT_AT; px(g.x, g.y, 8, 6, 4); px(g.x + 1, g.y + 1, 6, 4, 0); px(g.x + 3, g.y, 2, 6, 3); px(g.x + 1, g.y - 2, 2, 2, 4); px(g.x + 5, g.y - 2, 2, 2, 4);
      sparkle(g.x + 9, g.y - 2, tt);
    }
    drawAnimals(tt);
    drawVisitors(tt, dt, 'yard');
    drawYardWeather(tt, wx);
    if (night || ph === 'evening') { ctx.globalAlpha = night ? 0.32 : 0.12; px(0, 0, W, H, 4); ctx.globalAlpha = 1; }
    if (night) {
      windowsOf(L.houseTier(S)).forEach(function (r) { drawWindow(r, true); });
      if (L.houseTier(S) === 0) { var b = houseBox(); for (var k = 26; k < 40; k++) { var hw = Math.round((k - 14) * 0.35) - 1; if (hw > 0) px(b.x + 24 - hw, b.y + k, hw * 2 + 1, 1, k % 3 ? 1 : 0); } }
      if (S.yard.deco.lanterns) { var lr = DSPOT.lanterns; DRAW_DECO.lanterns(lr[0], lr[1], tt, true); }
      drawStars(tt);
    }
    drawVisitors(tt, dt, 'sky');
  }
  function drawSky(tt, ph) {
    if (ph === 'night') { px(0, 0, W, 20, 3); for (var y = 20; y < 26; y++) for (var x = (y % 2); x < W; x += 2) px(x, y, 1, 1, 3); }
    else if (ph === 'evening') { for (y = 0; y < 14; y++) for (x = (y % 2); x < W; x += 2) px(x, y, 1, 1, 1); }
  }
  function drawStars(tt) {
    for (var k = 0; k < 18; k++) {
      var sx = Math.floor(hash(k * 19 + 2) * W), sy = Math.floor(hash(k * 7 + 3) * 18);
      if ((Math.floor(tt * 1.5) + k) % 7) px(sx, sy, 1, 1, 0);
    }
  }
  function drawYardWeather(tt, wx) {
    var k;
    if (wx === 'rain') for (k = 0; k < 36; k++) { var rx = (hash(k * 3) * W + tt * 40) % W, ry = (hash(k * 5 + 1) * H + tt * 160) % H; px(rx, ry, 1, 3, 3); }
    else if (wx === 'snow') {
      for (k = 0; k < 40; k++) { var sx = (hash(k * 3) * W + Math.sin(tt + k) * 6) % W, sy = (hash(k * 5 + 1) * H + tt * 14) % H; px(sx, sy, 1, 1, 0); if (k % 3 === 0) px(sx + 1, sy, 1, 1, 0); }
      for (k = 0; k < 80; k++) px(Math.floor(hash(k * 11 + 1) * W), 28 + Math.floor(hash(k * 13 + 7) * (H - 28)), 2, 1, 0);
    } else if (wx === 'fog') { ctx.globalAlpha = 0.28; for (k = 0; k < H; k += 2) px(0, k, W, 1, 0); ctx.globalAlpha = 1; }
  }

  // ---------- taps in the 마당 ----------
  var pendingBuy = null;
  // two taps buy: the first names the thing and price, a second tap within 3 s buys it
  function confirmBuy(key, label, price, doBuy) {
    var t = performance.now();
    if (pendingBuy && pendingBuy.key === key && t < pendingBuy.until) { pendingBuy = null; doBuy(); return; }
    pendingBuy = { key: key, until: t + 3000 };
    toast(label + ' · ' + price.toLocaleString('ko-KR') + '코인 · 한 번 더 누르면 산다', 3000);
  }
  var WHY = { coins: '코인이 부족해요', rep: '신뢰도 ★이 부족해요', slots: '장식 자리가 꽉 찼어요 · 집을 키우면 늘어요', house: '집을 더 키워야 해요',
    max: '이미 최고 단계', owned: '이미 있어요', merchant: '떠돌이 상인이 가끔 가져와요', gone: '이미 팔렸어요' };
  function tapYard(x, y) {
    var t = now(), k;
    if (tapVisitorAt(x, y, 'sky') || tapVisitorAt(x, y, 'yard')) return;
    if (S.yard.gifts.length && Math.abs(x - GIFT_AT.x - 4) < 8 && Math.abs(y - GIFT_AT.y - 2) < 8) {
      var g = L.collectGifts(S); floatText('+' + g.c, GIFT_AT.x, GIFT_AT.y - 6); burst(GIFT_AT.x + 4, GIFT_AT.y, 8, 0, 40);
      toast('고양이가 두고 간 선물 · +' + g.c + (g.f ? ' · 비료 ' + g.f : ''), 2800); refresh(); return;
    }
    for (k = 0; k < L.potCount(S); k++) {
      var pr = potRect(k);
      if (hit([pr.x, pr.y, pr.w, pr.h], x, y, 2)) { tapPot(); return; }
    }
    var b = houseBox();
    if (hit([b.x, b.y, b.w, b.h], x, y)) { goScene('house'); return; }
    if (hit([PEN.x, PEN.y, PEN.w, PEN.h], x, y)) { tapPen(); return; }
    for (k = 0; k < L.DECOS.length; k++) {
      var d = L.DECOS[k], r = spot(d.id);
      if (!hit(r, x, y, 2)) continue;
      if (S.yard.deco[d.id]) { tapDeco(d); return; }
      if (d.merchant || d.id === 'chime') continue;
      if (L.decoCount(S) >= L.decoSlots(S)) continue;
      confirmBuy('d:' + d.id, d.name, d.cost, function () {
        var res = L.buyDeco(S, d.id);
        if (!res.ok) { toast(WHY[res.why] || '살 수 없어요'); return; }
        burst(r[0] + r[2] / 2, r[1] + r[3] / 2, 10, 0, 50);
        josa(toast(d.name, '을', '를') + ' 놓았다' + (d.brings ? ' · ' + josa(L.visitorById(d.brings).name, '이', '가') + ' 찾아올지도' : ''), 3000); refresh();
      });
      return;
    }
    toast('마당 · 집을 누르면 안으로 · 빈 자리(+)를 누르면 꾸미기', 2400);
  }
  function tapPen() {
    var t = now();
    if (!S.animals.hen && !S.animals.cow && !S.animals.duck) { toast('상점 · 마당에서 닭을 들일 수 있어요', 2600); return; }
    if (!L.productsWaiting(S)) {
      var soon = null;
      L.ANIMAL_IDS.forEach(function (id) { if (S.animals[id]) { var left = S.yard.prod[id].t + L.ANIMALS[id].every - t; if (soon === null || left < soon) soon = left; } });
      toast('아직 줍을 게 없어요 · ' + fmtLeft(Math.max(0, soon)) + ' 뒤', 2400); return;
    }
    var r = L.collectAnimals(S, t, Math.random), n = {};
    r.items.forEach(function (id) { n[id] = (n[id] || 0) + 1; });
    burst(PEN.x + PEN.w / 2, PEN.y + PEN.h / 2, 12, 0, 60);
    floatText(r.sold ? '+' + r.sold : '+' + r.items.length, PEN.x + PEN.w / 2, PEN.y + 20);
    toast(Object.keys(n).map(function (id) { return L.itemInfo(id).name + '×' + n[id]; }).join(' · ') + (r.sold ? ' · 넘친 건 팔았다 +' + r.sold : ' · 바구니에'), 3000);
    refresh();
  }
  function tapDeco(d) {
    if (d.id === 'mailbox') { openSheet('mail'); return; }
    if (d.id === 'windmill') { millSpin = 3; toast('풍차가 빙글빙글'); return; }
    if (d.id === 'chime') { chimeRing = 2; toast('딸랑…'); return; }
    if (d.id === 'bench') { toast('벤치 · 고양이가 좋아하는 자리'); return; }
    var r = spot(d.id); burst(r[0] + r[2] / 2, r[1] + 4, 4, 2, 30);
    toast(d.name + (d.brings ? ' · ' + josa(L.visitorById(d.brings).name, '이', '가') + ' 좋아한대요' : ''));
  }

  // ---------- scene switch ----------
  var sceneBtn = document.createElement('button');
  sceneBtn.type = 'button'; sceneBtn.id = 'sceneBtn';
  app.appendChild(sceneBtn);
  function goScene(sc) {
    if (reel) return;
    view = sc; pendingBuy = null;
    if (!resultEl.hidden) hideResult();
    trayEl.style.visibility = sc === 'farm' ? '' : 'hidden';
    cv.setAttribute('aria-label', sc === 'farm' ? '농장과 연못' : sc === 'yard' ? '마당' : '집 안');
    renderSceneBtn();
  }
  var sceneKey = '';
  function renderSceneBtn() {
    var other = view === 'farm' ? yardAttention() > 0 || S.yard.vis.some(function (v) { return L.visitorById(v.id).slot !== 'pond'; })
                                 : S.yard.vis.some(function (v) { return L.visitorById(v.id).slot === 'pond'; });
    var bite = view !== 'farm' && S.fish.phase === 'bite';
    var key = view + other + !!reel + bite;
    if (key === sceneKey) return;
    sceneKey = key;
    sceneBtn.innerHTML = '';
    sceneBtn.disabled = !!reel;
    sceneBtn.classList.toggle('bite', bite);
    if (bite) { sceneBtn.textContent = '찌!'; sceneBtn.setAttribute('aria-label', '입질! 연못으로 가서 챔질'); return; }
    var label = view === 'farm' ? '마당' : view === 'yard' ? '밭' : '마당';
    sceneBtn.setAttribute('aria-label', view === 'farm' ? '마당으로' : view === 'yard' ? '밭과 연못으로' : '마당으로 나가기');
    sceneBtn.appendChild(document.createTextNode(label));
    if (other) { var d = document.createElement('i'); d.className = 'dot'; sceneBtn.appendChild(d); }
  }
  sceneBtn.addEventListener('click', function () {
    if (view !== 'farm' && S.fish.phase === 'bite') { goScene('farm'); doStrike(); renderSceneBtn(); return; }
    goScene(view === 'yard' ? 'farm' : 'yard');
  });

  // ---------- hooks used by loop.js / input.js ----------
  // draws 마당 or 집 안 instead of the farm; returns false on the farm so the normal frame runs
  function drawScene(tt, dt) {
    if (view === 'yard') { drawYard(tt, dt); return true; }
    if (view === 'house') { drawRoom(tt, dt); return true; }
    return false;
  }
  // first look at every tap: the 마당/집 take all of theirs; on the farm only visitors and the scarecrow
  function tapScene(x, y) {
    if (view === 'yard') { tapYard(x, y); return true; }
    if (view === 'house') { tapRoom(x, y); return true; }
    if (S.fish.phase === 'bite') return false;
    if (tapVisitorAt(x, y, 'pond')) return true;
    var st = L.tier(S, 'scare');
    if (st && ((x >= 2 && x < 15 && y >= 36 && y < 54) || (st >= 3 && x >= 168 && y >= 36 && y < 54))) {
      var r = L.tapScarecrow(S, now(), SPEED);
      scareWob = r.egg ? 3 : 0.35;
      if (r.egg) { burst(9, 42, 16, 0, 70); eggFound(r.egg); }
      else if (r.n >= 5) toast('허수아비가 들썩인다… ' + r.n, 1200);
      return true;
    }
    return false;
  }
  function yardAttention() {
    var y = S.yard, n = 0;
    if (L.productsWaiting(S)) n++;
    if (y.gifts.length) n++;
    if (y.mail.some(function (m) { return !m.read; })) n++;
    return n;
  }
  function eggFound(e) {
    setTimeout(function () { toast('★ 비밀 발견 · ' + e.name + (e.reward ? ' · +' + e.reward : '') + ' · 도감 기록', 4500); }, 600);
    save();
  }
  var visToastAt = 0, clockForce = false;
  function tickYard(t) {
    if (reel && view !== 'farm') goScene('farm');
    // a bite at real hh:00 is the clock fish
    var f = S.fish;
    if (f.phase === 'bite' && f.roll && f.roll.id !== 'clockfish' && !f.clockChecked) {
      f.clockChecked = true;
      var cr = L.clockRoll(clockForce ? new Date(2026, 0, 1, 12, 0) : new Date(f.biteAt), Math.random);
      clockForce = false;
      if (cr) { f.roll = cr; toast('째깍째깍… 연못이 이상하다!', 2400); }
    }
    if (f.phase === 'bite' && view !== 'farm' && !f.yardWarned) { f.yardWarned = true; toast('찌가 쑥! · 오른쪽 위 찌! 를 눌러 챔질', 2600); }
    L.animalTick(S, t);
    L.tickVisitors(S, t, Math.random, YTZ, SPEED).forEach(function (e) {
      var d = L.visitorById(e.id), here = (d.slot === 'pond') === (view === 'farm');
      if (e.type === 'arrive' && booted && performance.now() > visToastAt) {
        visToastAt = performance.now() + 4000;
        toast((here ? '' : d.slot === 'pond' ? '연못에 ' : '마당에 ') + (e.id === 'mailman' ? d.name + ' · 편지가 왔어요' : e.id === 'merchant' ? d.name + ' · 10분만 머문대요' : josa(d.name, '이', '가') + ' 왔다'), 2800);
      }
      if (e.type === 'leave' && e.gift && booted) toast('고양이가 문 앞에 선물을 두고 갔다', 2600);
      if (e.id === 'merchant' && e.type === 'leave' && sheetKind === 'merchant') closeSheet();
    });
    L.checkEggs(S, t, new Date()).forEach(eggFound);
    renderSceneBtn();
  }

  // stage-2 도감 rewards show up in the 마당: 어부의 깃발 (물고기 20종), 등대 모형 (물고기 30종)
  function drawTrophyDecor(tt) {
    if (S.ms.fish20) {
      var fx = 134, fy = 30, wave = Math.floor(tt * 3) % 3;
      px(fx, fy, 1, 34, 4); px(fx - 1, fy + 33, 3, 2, 4);
      for (var k = 0; k < 10; k++) px(fx + 1 + k, fy + 1 + (k + wave) % 3 - 1, 1, 7, k % 4 < 2 ? 4 : 0);
      px(fx + 3, fy + 3, 4, 2, 2);
    }
    if (S.ms.fish30) {
      var lx = 149, ly = 150;
      px(lx + 2, ly, 4, 3, 4); px(lx + 3, ly + 1, 2, 1, Math.floor(tt * 2) % 2 ? 0 : 1);
      px(lx + 1, ly + 3, 6, 1, 4);
      for (var j = 4; j < 26; j++) { var w = 4 + Math.floor((j - 4) / 8) * 2, x0 = lx + 4 - w / 2; px(x0, ly + j, w, 1, 4); if (w > 2) px(x0 + 1, ly + j, w - 2, 1, Math.floor((j - 4) / 4) % 2 ? 4 : 0); }
      if (yPhase() === 'night') { ctx.globalAlpha = 0.4; px(lx - 6, ly, 6, 3, 0); px(lx + 8, ly, 6, 3, 0); ctx.globalAlpha = 1; }
    }
  }

  // ---------- console hooks (FF.visitor, FF.house, FF.animals, …) ----------
  function addYardHooks(FF) {
    FF.scene = function (sc) { goScene(sc || 'yard'); return view; };
    FF.visitor = function (id) {
      var d = L.visitorById(id);
      if (!d) return L.VISITORS.map(function (v) { return v.id; });
      S.yard.vis = S.yard.vis.filter(function (v) { return L.visitorById(v.id).slot !== d.slot; });
      var v = L.spawnVisitor(S, d, now(), Math.random, SPEED);
      goScene(d.slot === 'pond' ? 'farm' : 'yard'); refresh(); return v;
    };
    FF.house = function (t) { S.yard.house = Math.max(0, Math.min(3, t | 0)); refresh(); return L.houseInfo(S).name; };
    FF.animals = function (n) {
      L.ANIMAL_IDS.forEach(function (id) { S.animals[id] = Math.min(L.ANIMALS[id].costs.length, n === undefined ? 1 : n); S.yard.prod[id].t = now(); });
      refresh(); return S.animals;
    };
    FF.produce = function () { L.ANIMAL_IDS.forEach(function (id) { S.yard.prod[id].n = S.animals[id] * L.ANIMAL_CAP; }); };
    FF.decos = function (all) { L.DECOS.forEach(function (d, k) { if (all || k < L.decoSlots(S)) S.yard.deco[d.id] = true; }); refresh(); };
    FF.furn = function () { L.FURN.forEach(function (f) { S.yard.furn[f.id] = true; }); refresh(); };
    FF.egg = function (id) { var e = L.findEgg(S, id, now()); if (e) eggFound(e); return e; };
    FF.eggsReset = function () { S.yard.eggs = {}; save(); };
    FF.clockBite = function () { if (S.fish.phase === 'wait') { clockForce = true; S.fish.biteAt = now(); } };
    FF.mail = function () { L.spawnVisitor(S, L.visitorById('mailman'), now(), Math.random, SPEED); refresh(); return S.yard.mail; };
  }
