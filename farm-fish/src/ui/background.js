  // ---------- layout ----------
  var PX0 = 18, PY0 = 5, PW = 44, PH = 26, GAPX = 6, GAPY = 5, FENCE_Y = 100;
  function plotRect(i) { return { x: PX0 + (i % 3) * (PW + GAPX), y: PY0 + Math.floor(i / 3) * (PH + GAPY), w: PW, h: PH }; }
  // POND is the castable ellipse (bobber, reel, swimmers); the visible water can be larger (wetD).
  // 연못 = that ellipse; 강 = a curved band from the right edge to the bottom; 바다 = a bay in the bottom-right.
  var POND = { cx: 116, cy: 148, rx: 58, ry: 38 };
  var SCENES = {
    pond:  { cx: 116, cy: 148, rx: 58, ry: 38 },
    river: { cx: 145, cy: 170, rx: 34, ry: 20, ox: 210, oy: 228, mid: 87, half: 35 },
    sea:   { cx: 152, cy: 178, rx: 34, ry: 22, ox: 240, oy: 250, r: 150 }
  };
  var scene = 'pond';
  var ROD_BASE = { x: 57, y: 133 }, ROD_TIP = { x: 74, y: 117 };
  function inPond(x, y, k) { var a = (x - POND.cx) / POND.rx, b = (y - POND.cy) / POND.ry; return a * a + b * b < (k || 1); }
  // visible water: < 1 is water, a little above 1 is the shore
  function wetD(x, y) {
    var sc = SCENES[scene];
    if (scene === 'river') return Math.abs(Math.hypot(x - sc.ox, y - sc.oy) - sc.mid) / sc.half;
    if (scene === 'sea') return Math.hypot(x - sc.ox, y - sc.oy) / sc.r;
    var a = (x - POND.cx) / POND.rx, b = (y - POND.cy) / POND.ry; return a * a + b * b;
  }
  function inWet(x, y, k) { return wetD(x, y) < (k || 1); }
  // switch the water to the current spot and repaint the static background
  function setScene() {
    scene = L.curSpot(S);
    var sc = SCENES[scene];
    POND.cx = sc.cx; POND.cy = sc.cy; POND.rx = sc.rx; POND.ry = sc.ry;
    bg.getContext('2d').clearRect(0, 0, W, H);
    paintBg();
  }

  // ---------- static background, pre-rendered ----------
  var bg = document.createElement('canvas'); bg.width = W; bg.height = H;
  function paintBg() {
    var b = bg.getContext('2d');
    var save = ctx; ctx = b;
    // no full-scene fill: the canvas stays transparent so --bg shows through
    for (var k = 0; k < 260; k++) {           // grass ticks
      var x = Math.floor(hash(k * 7 + 1) * W), y = Math.floor(hash(k * 13 + 5) * H);
      if (inWet(x, y, scene === 'pond' ? 1.25 : 1.15)) continue;
      var c = hash(k * 3 + 9) < 0.7 ? 1 : 2;
      px(x, y, 1, 1, c); if (hash(k + 99) < 0.4) px(x + 1, y - 1, 1, 1, c);
    }
    for (k = 0; k < 14; k++) {                // tiny flowers
      var fx = Math.floor(hash(k * 31 + 3) * (W - 4)) + 2, fy = Math.floor(hash(k * 17 + 2) * (H - 4)) + 2;
      if (inWet(fx, fy, scene === 'pond' ? 1.4 : 1.2) || (fy < FENCE_Y + 2 && fx > 12 && fx < 168)) continue;
      px(fx, fy - 1, 1, 1, 2); px(fx - 1, fy, 1, 1, 2); px(fx + 1, fy, 1, 1, 2); px(fx, fy + 1, 1, 1, 2); px(fx, fy, 1, 1, 0);
    }
    // fence between farm and pond
    for (x = 4; x < 176; x++) { px(x, FENCE_Y, 1, 1, 3); if (x % 2) px(x, FENCE_Y + 3, 1, 1, 2); }
    for (x = 6; x < 176; x += 10) { px(x, FENCE_Y - 3, 2, 9, 4); px(x, FENCE_Y - 3, 2, 1, 3); }
    if (scene !== 'pond') paintOpenWater();
    // pond: shore dither, water, deep center
    else for (var y = 0; y < H; y++) for (x = 0; x < W; x++) {
      var a = (x - POND.cx) / (POND.rx + 4), bb = (y - POND.cy) / (POND.ry + 4), d = a * a + bb * bb;
      var a2 = (x - POND.cx) / POND.rx, b2 = (y - POND.cy) / POND.ry, d2 = a2 * a2 + b2 * b2;
      if (d2 < 1) {
        var deep = d2 < 0.35;
        var c2 = deep ? (((x + y) % 2 === 0) ? 2 : 1) : ((x % 4 === 0 && y % 2 === 0) ? 2 : 1);
        px(x, y, 1, 1, c2);
        if (d2 > 0.9) px(x, y, 1, 1, 2);
      } else if (d < 1) {
        px(x, y, 1, 1, (x + y * 3) % 5 === 0 ? 2 : 0);
      }
    }
    // pond outline, lily pads and reeds (연못 only)
    for (var t = 0; t < 720 && scene === 'pond'; t++) {
      var an = t / 720 * Math.PI * 2;
      px(POND.cx + Math.cos(an) * POND.rx, POND.cy + Math.sin(an) * POND.ry, 1, 1, 4);
    }
    // lily pads
    if (scene === 'pond') [[150, 132], [96, 172], [158, 160]].forEach(function (l, n) {
      var lx = l[0], ly = l[1];
      px(lx - 3, ly, 7, 1, 4); px(lx - 4, ly + 1, 9, 2, 4); px(lx - 3, ly + 3, 7, 1, 4);
      px(lx - 3, ly + 1, 7, 2, 0); px(lx, ly + 1, 1, 1, 4); px(lx + 1, ly + 1, 2, 1, 4);
      if (n === 0) { px(lx - 1, ly - 2, 1, 1, 4); px(lx + 1, ly - 2, 1, 1, 4); px(lx, ly - 3, 1, 2, 4); px(lx, ly - 1, 1, 1, 0); }
    });
    // reeds at right shore
    if (scene === 'pond') [[170, 128], [173, 132], [167, 133]].forEach(function (r) {
      px(r[0], r[1], 1, 10, 4); px(r[0], r[1] - 3, 1, 3, 4); px(r[0] - 1, r[1] - 2, 3, 2, 3);
    });
    // dock
    px(24, 134, 40, 9, 4);
    for (x = 25; x < 63; x++) px(x, 135, 1, 7, (x % 5 === 0) ? 3 : 0);
    for (x = 25; x < 63; x += 1) if ((x * 7) % 11 === 0) px(x, 138, 1, 1, 2);
    px(30, 143, 3, 6, 4); px(56, 143, 3, 6, 4);
    // little sign
    px(4, 106, 1, 12, 4); px(0, 106, 14, 8, 4); px(1, 107, 12, 6, 0);
    px(3, 109, 2, 2, 3); px(6, 109, 2, 2, 3); px(9, 109, 2, 2, 3);
    ctx = save;
  }
  // 강·바다: per-pixel water from wetD, with a drawn bank line and a shore of pebbles (강) or sand (바다)
  function paintOpenWater() {
    var sea = scene === 'sea';
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var d = wetD(x, y), c;
      if (d < 1) {
        var deep = sea ? d < 0.72 : d < 0.38;
        c = deep ? (((x + y) % 2 === 0) ? 2 : 1) : ((x % 4 === 0 && y % 2 === 0) ? 2 : 1);
        if (!sea && !deep && (x * 3 + y * 7) % 23 === 0) c = 2;          // current texture
        if (d > (sea ? 0.96 : 0.9)) c = 2;
        if (d > (sea ? 0.99 : 0.96)) c = 4;
        px(x, y, 1, 1, c);
      } else if (d < (sea ? 1.1 : 1.14)) {
        if (sea) c = hash(x * 131 + y * 7) < 0.18 ? 2 : hash(x * 17 + y * 311) < 0.35 ? 1 : 0;   // sand
        else c = (x + y * 3) % 5 === 0 ? 2 : (x * 7 + y) % 13 === 0 ? 3 : 0;                    // pebbles
        px(x, y, 1, 1, c);
      }
    }
    var rocks = sea ? [[118, 196], [170, 132], [104, 186]] : [[120, 150], [176, 118], [98, 194], [160, 190]];
    rocks.forEach(function (r, n) {
      var w = n % 2 ? 5 : 7;
      px(r[0] - 1, r[1] - 3, w - 2, 1, 4); px(r[0] - 2, r[1] - 2, w, 3, 4); px(r[0] - 1, r[1] - 2, w - 3, 1, 1); px(r[0] - 1, r[1] - 1, 2, 1, 2);
      px(r[0] - 3, r[1] + 1, w + 2, 1, 0);                              // foam where water meets stone
    });
  }
  setScene();

