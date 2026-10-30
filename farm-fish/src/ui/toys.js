  // ---------- stage 10 ④ 날씨 장난감: puddles (rain), footprints (snow), leaf piles (autumn) on empty ground ----------
  // Only taps that nothing else wanted reach tapToy (end of the 밭 / 마당 / 숲 tap chains), so toys never steal a tap.
  var TOY_SCENES = { farm: true, yard: true, forest: true };
  var toySpotCache = {}, toyPiles = {}, toySteps = [], toyFx = [], toyLast = null;
  // ground a toy may sit on, per scene: [x, y, w, h] boxes it must keep clear of
  // 마당 things that are not on a YSPOT: house (every tier), pots, gift, pen, merchant cart, trophies, corner buttons, 공방
  var YARD_TOY_BLOCK = [[52, 14, 76, 73], [126, 70, 46, 18], [96, 82, 14, 10], [3, 113, 100, 84], [100, 136, 52, 30],
    [132, 28, 14, 38], [147, 148, 12, 30], [0, 0, 16, 34], [156, 0, 24, 18], [103, 104, 19, 14]];   // last: 가공 공방 (ui/craft.js CFT_AT, defined later in the bundle)
  function toyBlocks(sc) {
    if (sc === 'yard') return L.YSPOTS.filter(function (p) { return p.r; }).map(function (p) { return p.r; }).concat(YARD_TOY_BLOCK);
    if (sc === 'forest') return FSPOTS.map(function (p) { return [p[0] - 12, p[1] - 16, 24, 22]; }).concat([[GATE.x - 8, GATE.y - 8, GATE.w + 16, GATE.h + 16]]);
    // 밭·연못 side: everything above the fence, the basket corner, the signpost, the farmer + pet
    return [[0, 0, W, FENCE_Y + 6], [0, 98, 26, 72], [144, 96, 36, 28], [20, 110, 54, 46]];
  }
  function toyFree(sc, x, y) {
    if (sc === 'farm' && inWet(x, y, 1.35)) return false;
    var b = toyBlocks(sc);
    for (var k = 0; k < b.length; k++) if (hit(b[k], x, y, 9)) return false;
    return y > (sc === 'forest' ? 72 : 30) && y < H - 6 && x > 8 && x < W - 8;   // 숲: below the tree line
  }
  // three spread-out spots per scene (and per 낚시터: the water changes), from a fixed scan
  function toySpots(sc) {
    var key = sc + (sc === 'farm' ? L.curSpot(S) : '');
    if (toySpotCache[key]) return toySpotCache[key];
    var cand = [], out = [];
    for (var y = 36; y < H - 6; y += 6) for (var x = 12; x < W - 10; x += 6) if (toyFree(sc, x, y)) cand.push([x, y]);
    cand.sort(function (a, b) { return hash(a[0] * 7 + a[1] * 131) - hash(b[0] * 7 + b[1] * 131); });
    cand.forEach(function (c) {
      if (out.length < 3 && out.every(function (o) { return Math.hypot(o[0] - c[0], o[1] - c[1]) > 40; })) out.push(c);
    });
    toySpotCache[key] = out;
    return out;
  }
  function toyKind(e) { return L.toyOn('splash', e) ? 'splash' : L.toyOn('step', e) ? 'step' : L.toyOn('leaves', e) ? 'leaves' : null; }
  function pileUp(key, t) { return !toyPiles[key] || t - toyPiles[key] >= L.TOY_PILE_REGROW; }

  // → true when the tap played with a toy (so the scene's "nothing here" tip stays quiet)
  function tapToy(x, y) {
    if (!TOY_SCENES[view] || reel || chal || miniOn() || rideOn()) return false;
    var t = now(), e = curEnv(t), kind = toyKind(e);
    if (!kind) return false;
    var spot = null;
    if (kind !== 'step') {
      toySpots(view).forEach(function (p, k) {
        if (!spot && Math.abs(x - p[0]) < 11 && Math.abs(y - p[1]) < 7 && (kind === 'splash' || pileUp(view + k, t))) spot = { x: p[0], y: p[1], k: k };
      });
      if (!spot) return false;
    } else if (!toyFree(view, x, y)) return false;
    var pt = performance.now() / 1000;
    if (kind === 'splash') toyFx.push({ kind: 'splash', x: spot.x, y: spot.y, t0: pt });
    else if (kind === 'leaves') {
      toyPiles[view + spot.k] = t;
      toyFx.push({ kind: 'leaves', x: spot.x, y: spot.y, t0: pt });
      if (!reduceMotion) burst(spot.x, spot.y - 2, 10, 3, 70);
    } else toyWalk(x, y, pt);
    if (toyFx.length > 8) toyFx.shift();
    var r = L.toyPlay(S, kind, t, TZ, Math.random, L.bagBlocked(S)).reward;
    var fx = spot ? spot.x : x, fy = spot ? spot.y : y;
    if (r && r.id) { floatText(r.sold ? '+' + r.sold : '+도토리', fx, fy - 8); toast('낙엽 속에 도토리 하나' + (r.sold ? ' · 바구니가 꽉 차 팔았다 +' + r.sold : ' · 바구니에'), 2200); refresh(); }
    else if (r) { floatText('+' + r.coins, fx, fy - 8); refresh(); }
    return true;
  }
  // footprints walk from the last one to the tap (a few steps), left/right in turn
  function toyWalk(x, y, pt) {
    var from = toyLast && toyLast.view === view && pt - toyLast.t < 20 ? toyLast : null;
    var n = from ? Math.min(6, Math.max(1, Math.round(Math.hypot(x - from.x, y - from.y) / 7))) : 1;
    for (var k = 1; k <= n; k++) {
      var a = from ? k / n : 1;
      toySteps.push({ view: view, x: from ? from.x + (x - from.x) * a : x, y: from ? from.y + (y - from.y) * a : y, side: (toySteps.length % 2) ? 1 : -1, t: pt });
    }
    while (toySteps.length > 30) toySteps.shift();
    toyLast = { view: view, x: x, y: y, t: pt };
  }

  // drawn just under the weather overlay (drawWeather on the 밭, drawYardWeather in the 마당·숲)
  function drawToys(tt) {
    if (!TOY_SCENES[view]) return;
    var t = now(), e = curEnv(t), kind = toyKind(e);
    if (kind === 'splash') toySpots(view).forEach(function (p) {
      px(p[0] - 5, p[1] - 3, 10, 1, 3); px(p[0] - 7, p[1] - 2, 2, 1, 3); px(p[0] + 5, p[1] - 2, 2, 1, 3);   // dark rim on top
      px(p[0] - 7, p[1] - 1, 14, 3, 2); px(p[0] - 5, p[1] - 2, 10, 5, 2); px(p[0] - 4, p[1] - 1, 5, 1, 0); px(p[0] + 2, p[1] + 1, 3, 1, 1);
      if (!reduceMotion && Math.floor(tt * 2 + p[0]) % 3 === 0) px(p[0] + 2, p[1], 2, 1, 2);   // a drop lands
    });
    if (kind === 'leaves') toySpots(view).forEach(function (p, k) {
      if (!pileUp(view + k, t)) { px(p[0] - 9, p[1] + 1, 2, 1, 3); px(p[0] + 6, p[1], 2, 1, 2); px(p[0] - 2, p[1] + 2, 2, 1, 3); return; }
      // a mound of leaves: rows narrowing upward, dark leaf specks, a shadow line under it
      for (var row = 0; row < 5; row++) {
        var w = 16 - row * 3, x0 = p[0] - (w >> 1), y0 = p[1] - row;
        px(x0, y0, w, 1, 2);
        for (var j = 0; j < w; j += 2) if (hash(row * 17 + j + k * 5) < 0.55) px(x0 + j + (row % 2), y0, 1, 1, hash(row + j * 3) < 0.5 ? 3 : 4);
      }
      px(p[0] - 8, p[1] + 1, 16, 1, 3); px(p[0] + 7, p[1] - 1, 2, 1, 3); px(p[0] - 10, p[1], 2, 1, 2);
    });
    // footprints fade after 20 s (and melt when the snow stops)
    var pt = performance.now() / 1000;
    for (var k = toySteps.length - 1; k >= 0; k--) if (pt - toySteps[k].t > 20 || kind !== 'step') toySteps.splice(k, 1);
    toySteps.forEach(function (s) {
      if (s.view !== view) return;
      var x = Math.round(s.x + s.side * 2), y = Math.round(s.y);
      px(x, y, 2, 4, 2); px(x, y, 2, 1, 3); px(x + (s.side > 0 ? 1 : 0), y + 4, 1, 1, 2);   // one boot print, toe darker
    });
    for (var n = toyFx.length - 1; n >= 0; n--) {
      var f = toyFx[n], a = pt - f.t0;
      if (a > 0.6) { toyFx.splice(n, 1); continue; }
      if (f.kind === 'splash') {
        var r = reduceMotion ? 6 : 3 + a * 14;   // reduced motion: one still ring, no flying drops
        toyRing(f.x, f.y, r, r * 0.35);
        if (!reduceMotion) for (var d = 0; d < 4; d++) px(f.x + (d - 1.5) * 4, f.y - 3 - Math.sin(a * 5) * 6 + d % 2, 1, 2, 3);
      }
    }
  }
  function toyRing(x, y, rx, ry) {
    var n = Math.max(12, Math.round(rx * 4));
    for (var k = 0; k < n; k++) { var a = k / n * Math.PI * 2; px(x + Math.cos(a) * rx, y + Math.sin(a) * ry, 1, 1, 4); }
  }

  // console hooks: FF.toy() → today's rewards left and the spots here
  function addToyHooks(FF) {
    FF.toy = function () { return { kind: toyKind(curEnv(now())), left: L.toyLeft(S, now(), TZ), spots: TOY_SCENES[view] ? toySpots(view) : [], fx: toyFx.length, steps: toySteps.length, piles: Object.keys(toyPiles) }; };
  }
