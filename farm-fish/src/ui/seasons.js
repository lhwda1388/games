  // ---------- 계절 on screen: seasonal crop and fish art, ground touches, the frozen pond (얼음낚시) ----------
  // Season = the game clock's (curEnv, so FF.season overrides it). Five grey tokens only.
  function seasonNow() { return curEnv(now()).season; }
  function seedInSeason(id) { return L.cropSeasonOk(id, seasonNow()); }

  // fish art: shapes face left like SP.fish; '0' cells are recoloured by FISH_FILL
  FISH_SHAPE.webfoot = FISH_SHAPE.octopus;
  FISH_SHAPE.conger = FISH_SHAPE.eel;
  FISH_SHAPE.killifish = ['.....', '.444.4', '40400444', '.444.4'];
  FISH_SHAPE.goby = ['..4444....', '.400004.44', '40400000444', '4000000044.', '.444444.44'];
  FISH_SHAPE.sleeper = ['..44444...4', '.4000004.44', '404000000444', '.4000004.44', '..44444...4'];
  FISH_FILL.bitterling = function (i, j) { return j === 3 && i > 3 ? 3 : (i + j) % 4 === 0 ? 1 : 0; };
  FISH_FILL.shad = function (i, j) { return j < 2 ? 2 : 0; };
  FISH_FILL.webfoot = function (i, j) { return (i * 3 + j) % 5 === 0 ? 3 : 1; };
  FISH_FILL.killifish = function () { return 1; };
  FISH_FILL.sweetfish = function (i, j) { return j === 2 && i > 4 ? 1 : j < 2 ? 2 : 0; };
  FISH_FILL.conger = function (i, j) { return j === 1 && i % 2 ? 1 : 3; };
  FISH_FILL.bluegill = function (i, j) { return i % 3 === 0 ? 3 : 2; };
  FISH_FILL.goby = function (i, j) { return (i * 5 + j * 3) % 4 === 0 ? 3 : 2; };
  FISH_FILL.gizzard = function (i, j) { return j < 2 ? 3 : (i + j * 2) % 5 === 0 ? 2 : 0; };
  FISH_FILL.sleeper = function (i, j) { return (i + j) % 3 === 0 ? 4 : 3; };
  FISH_FILL.lenok = function (i, j) { return (i * 2 + j * 3) % 6 === 0 ? 4 : j < 3 ? 2 : 0; };
  FISH_FILL.sandfish = function (i, j) { return j < 3 ? 2 : 1; };

  // ---------- seasonal crops: tray icon and the plot's growth stages 2–4 ----------
  // a function, not a var: tray.js draws seed icons before this file has run
  function seasonSprites() { return seasonSprites.t || (seasonSprites.t = {
    ssuk2: ['.3.3.', '34343', '.343.', '..4..'],
    ssuk3: ['3.3.3.3', '.34343.', '3433343', '.34443.', '...4...'],
    ssuk4: ['.1.3.1.', '3131313', '.34343.', '3133313', '.31413.', '..343..', '...4...'],
    cuc3:  ['..3.3....', '.343.3.3.', '3.4.343..', '..4..4...', '..4......'],
    cuc4:  ['..3.3....', '.343.3.3.', '3.4.343..', '.44.4.44.', '4234.4324', '4334.4334', '4324.4234', '.44...44.'],
    sweet3: ['3.3...3.3', '.34.3.43.', '..34343..', '...444...'],
    sweet4: ['3.3...3.3', '.34.3.43.', '..34343..', '.4444444.', '423333324', '.4333334.', '..44444..'],
    cab3:  ['..333..', '.32223.', '3211123', '.32223.', '..333..'],
    cab4:  ['..3333...', '.3222233.', '322111223', '321101123', '322111223', '.3222223.', '..33333..']
  }); }
  // st 2..4 at plot column centre cx, ground line baseY (farm.js draws stages 0–1)
  function drawSeasonCrop(id, st, cx, baseY, sway, bob) {
    var SC = seasonSprites();
    if (id === 'ssuk') spr(st === 2 ? SC.ssuk2 : st === 3 ? SC.ssuk3 : SC.ssuk4, cx - (st === 2 ? 2 : 3) + sway, baseY - (st === 2 ? 4 : st === 3 ? 5 : 7) - (st === 4 ? bob : 0));
    else if (id === 'cucumber') {
      if (st === 2) spr(SP.bush2, cx - 3 + sway, baseY - 4);
      else spr(st === 3 ? SC.cuc3 : SC.cuc4, cx - 4 + sway, baseY - (st === 3 ? 5 : 8) - (st === 4 ? bob : 0));
    } else if (id === 'sweetpotato') {
      if (st === 2) spr(SP.bush2, cx - 3 + sway, baseY - 4);
      else spr(st === 3 ? SC.sweet3 : SC.sweet4, cx - 4 + sway, baseY - (st === 3 ? 4 : 6) - (st === 4 ? bob : 0));
    } else if (id === 'cabbage') {
      if (st === 2) spr(SP.bush2, cx - 3 + sway, baseY - 4);
      else spr(st === 3 ? SC.cab3 : SC.cab4, cx - (st === 3 ? 3 : 4), baseY - (st === 3 ? 5 : 7) - (st === 4 ? bob : 0));
    }
  }
  // 12×12 tray/dex icon (draws into the current ctx)
  function drawSeasonIcon(id) {
    var SC = seasonSprites();
    if (id === 'ssuk') spr(SC.ssuk4, 2, 3);
    else if (id === 'cucumber') spr(SC.cuc4, 1, 2);
    else if (id === 'sweetpotato') spr(SC.sweet4, 1, 3);
    else if (id === 'cabbage') spr(SC.cab4, 1, 3);
  }

  // ---------- ground touches, pre-rendered per season and scene ----------
  var seasonLayer = document.createElement('canvas'); seasonLayer.width = W; seasonLayer.height = H;
  var seasonKey = '';
  function onPlot(x, y) {
    for (var i = 0; i < L.N_MAX; i++) { var r = plotRect(i); if (x > r.x - 3 && x < r.x + r.w + 3 && y > r.y - 3 && y < r.y + r.h + 6) return true; }
    return false;
  }
  function paintSeasonLayer(se, where) {
    var c2 = seasonLayer.getContext('2d'), saved = ctx;
    c2.clearRect(0, 0, W, H); ctx = c2;
    var free = function (x, y) {
      if (where === 'yard') return y > 30;
      return !inWet(x, y, 1.3) && !onPlot(x, y) && !(x < 66 && y > 100 && y < 170);   // keep the dock/basket corner clear
    };
    var k, x, y, j, n, used = [];
    // keep picks spread out so a few marks read as a pattern, not a smudge
    var apart = function (ax, ay, d) {
      for (var u = 0; u < used.length; u++) if (Math.abs(used[u][0] - ax) < d && Math.abs(used[u][1] - ay) < d * 0.7) return false;
      used.push([ax, ay]); return true;
    };
    if (se === 'spring') {
      // little flower clumps: dark heart, mid petals, a stem and a leaf — reads on paper at PiP size
      var flower = function (fx, fy, big) {
        px(fx + 1, fy + 3, 1, big ? 4 : 3, 3); px(fx + 2, fy + 5, 1, 1, 3); px(fx + 3, fy + 4, 1, 1, 3);
        px(fx + 1, fy, 2, 1, 3); px(fx, fy + 1, 1, 2, 3); px(fx + 3, fy + 1, 1, 2, 3); px(fx + 1, fy + 3, 2, 1, 3);
        px(fx + 1, fy + 1, 2, 2, big ? 1 : 0); if (big) px(fx + 1, fy + 1, 1, 1, 4);
      };
      for (k = 0, n = 0; k < 600 && n < 16; k++) {
        x = 4 + Math.floor(hash(k * 37 + 11) * (W - 10)); y = 4 + Math.floor(hash(k * 53 + 7) * (H - 10));
        if (!free(x - 3, y - 1) || !free(x + 5, y + 5) || !apart(x, y, 14)) continue;
        n++; flower(x, y, k % 2); if (k % 3) flower(x + 5, y + 2, 0); if (k % 4 === 0) flower(x - 4, y + 3, 1);
      }
    } else if (se === 'summer') {
      // thick tall grass clumps, dark at the root
      for (k = 0, n = 0; k < 600 && n < 18; k++) {
        x = 4 + Math.floor(hash(k * 41 + 5) * (W - 8)); y = 8 + Math.floor(hash(k * 29 + 3) * (H - 12));
        if (!free(x - 3, y) || !free(x + 3, y - 6) || !apart(x, y, 12)) continue;
        n++;
        px(x, y - 6, 1, 6, 3); px(x - 2, y - 4, 1, 4, 3); px(x + 2, y - 5, 1, 5, 3); px(x - 1, y - 3, 1, 3, 3); px(x + 1, y - 2, 1, 2, 3);
        px(x - 2, y, 5, 1, 4); px(x - 3, y - 5, 1, 1, 3); px(x + 3, y - 6, 1, 1, 3);
      }
      // lily pads on the 연못
      if (where === 'farm' && scene === 'pond') for (k = 0; k < 7; k++) {
        var an = k * 0.9 + 0.4, rr = 0.72 + (k % 3) * 0.06;
        x = Math.round(POND.cx + Math.cos(an) * POND.rx * rr); y = Math.round(POND.cy + Math.sin(an) * POND.ry * rr);
        if (x < 70) continue;
        px(x - 2, y - 1, 5, 3, 3); px(x - 3, y, 7, 1, 3); px(x - 1, y, 3, 1, 2); px(x + 1, y - 1, 1, 2, 2);
        if (k % 3 === 0) { px(x - 1, y - 2, 2, 1, 0); px(x - 1, y - 3, 1, 1, 0); px(x - 1, y - 2, 1, 1, 1); }
      }
    } else if (se === 'autumn') {
      // fallen leaves (3-px shapes with a stalk), drifted into piles along the fence and edges
      var leaf = function (lx, ly, c, turn) {
        if (turn) { px(lx + 1, ly, 2, 1, c); px(lx, ly + 1, 4, 1, c); px(lx + 1, ly + 2, 2, 1, c); px(lx + 1, ly + 1, 2, 1, c === 3 ? 2 : 3); px(lx + 4, ly + 2, 1, 1, 4); }
        else { px(lx + 1, ly, 1, 1, c); px(lx, ly + 1, 3, 2, c); px(lx + 1, ly + 1, 1, 2, c === 3 ? 2 : 3); px(lx + 1, ly + 3, 1, 1, 4); }
      };
      for (k = 0, n = 0; k < 600 && n < 24; k++) {
        x = 2 + Math.floor(hash(k * 43 + 9) * (W - 6)); y = 4 + Math.floor(hash(k * 31 + 17) * (H - 8));
        if (!free(x, y) || !free(x + 4, y + 3) || !apart(x, y, 9)) continue;
        n++;
        leaf(x, y, k % 3 === 0 ? 2 : 3, k % 2);
      }
      var piles = where === 'yard' ? [[20, 190], [150, 192], [96, 66]] : [[12, 104], [70, 104], [140, 104], [100, 192]];
      piles.forEach(function (pp, n) {
        for (j = 0; j < 7; j++) {
          x = pp[0] + Math.round((hash(n * 17 + j * 5) - 0.5) * 12); y = pp[1] + Math.round((hash(n * 23 + j * 3) - 0.5) * 4);
          if (free(x, y) && y < H - 3) leaf(x, y, j % 3 ? 3 : 2, (j + n) % 2);
        }
      });
    } else {
      // winter: the ground dims a shade so white snow can show; drifts are white mounds with a grey shadow underneath
      var src = (where === 'yard' ? bgYard : bg).getContext('2d').getImageData(0, 0, W, H).data, paper = src[0];
      for (k = 4; k < src.length; k += 4) if (src[k + 3] && src[k] > paper) paper = src[k];
      c2.globalAlpha = 0.55; c2.fillStyle = G[1];
      for (y = where === 'yard' ? 31 : 0; y < H; y++) for (x = 0; x < W; x++) {
        var x0 = x;
        while (x < W && (src[(y * W + x) * 4] >= paper - 4 || !src[(y * W + x) * 4 + 3]) && !(where === 'farm' && inWet(x, y, 1.02))) x++;
        if (x > x0) c2.fillRect(x0, y, x - x0, 1);
      }
      c2.globalAlpha = 1;
      for (k = 0, n = 0; k < 600 && n < 12; k++) {
        x = 4 + Math.floor(hash(k * 47 + 13) * (W - 16)); y = 8 + Math.floor(hash(k * 23 + 19) * (H - 12));
        if (!free(x, y - 2) || !free(x + 12, y + 2) || !apart(x, y, 16)) continue;
        n++;
        var wd = 8 + (k % 3) * 2;
        px(x + 3, y - 2, wd - 6, 1, 0); px(x + 1, y - 1, wd - 2, 1, 0); px(x, y, wd, 1, 0);
        px(x + 1, y + 1, wd - 2, 1, 2); px(x, y, 1, 1, 1); px(x + wd - 1, y, 1, 1, 1);
      }
      if (where === 'farm') for (x = 6; x < 176; x += 10) { px(x - 1, FENCE_Y - 5, 4, 2, 0); px(x, FENCE_Y - 6, 2, 1, 0); px(x - 2, FENCE_Y - 4, 1, 1, 2); px(x + 3, FENCE_Y - 4, 1, 1, 2); }
    }
    ctx = saved;
  }
  function drawSeasonGround(where) {
    var se = seasonNow(), key = se + where + (where === 'farm' ? scene : '');
    if (key !== seasonKey) { seasonKey = key; paintSeasonLayer(se, where); }
    ctx.drawImage(seasonLayer, 0, 0);
  }

  // ---------- 얼음낚시: in winter the 연못 freezes; a hole opens where the line goes in ----------
  var iceCv = null;
  function paintIce() {
    iceCv = document.createElement('canvas'); iceCv.width = W; iceCv.height = H;
    var c2 = iceCv.getContext('2d'), saved = ctx; ctx = c2;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      var a = (x - POND.cx) / POND.rx, b = (y - POND.cy) / POND.ry, d = a * a + b * b;
      if (d >= 0.97) continue;
      var c = (x * 2 + y * 5) % 17 === 0 ? 1 : (x - y * 3 + 400) % 23 < 2 ? 1 : 0;
      if (d > 0.85) c = 1;
      px(x, y, 1, 1, c);
    }
    // a few cracks
    [[POND.cx - 30, POND.cy - 8, 1], [POND.cx + 12, POND.cy + 10, -1], [POND.cx + 30, POND.cy - 16, 1]].forEach(function (cr) {
      var x0 = cr[0], y0 = cr[1];
      for (var k = 0; k < 14; k++) { px(x0 + k, y0 + Math.round(Math.sin(k * 0.9) * 2) * cr[2], 1, 1, 2); if (k === 6) for (var j = 1; j < 5; j++) px(x0 + k + j, y0 - j * cr[2], 1, 1, 2); }
    });
    ctx = saved;
  }
  function frozen() { return scene === 'pond' && seasonNow() === 'winter'; }
  function drawIce(tt) {
    if (!frozen()) return;
    if (!iceCv) paintIce();
    ctx.globalAlpha = 0.9; ctx.drawImage(iceCv, 0, 0); ctx.globalAlpha = 1;
    // the hole: where the bobber sits, or a ready-cut one near the dock
    var f = S.fish, hx = POND.cx - 20, hy = POND.cy - 4;
    if (reel && reelVis) { hx = reelVis.x; hy = reelVis.y; }
    else if (f.phase === 'wait' || f.phase === 'bite') { hx = f.x; hy = f.y + 1; }
    hx = Math.round(hx); hy = Math.round(hy);
    px(hx - 5, hy - 2, 11, 5, 4); px(hx - 6, hy - 1, 13, 3, 4);
    px(hx - 4, hy - 1, 9, 3, 3); px(hx - 5, hy, 11, 1, 3);
    px(hx - 3 + (Math.floor(tt * 2) % 3), hy, 2, 1, 2);
    px(hx - 7, hy + 3, 3, 1, 1); px(hx + 5, hy - 3, 3, 1, 1);           // chipped ice around the edge
  }
