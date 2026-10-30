  // ---------- 배 업그레이드 (stage 9 ①): 배 sheet, 먼바다·난바다 끌낚시 water, 먼 섬 scene ----------
  // Fishing at 먼바다/난바다 is the farm view with spot 'offshore' / 'ocean' (like 강·바다·섬): the bay is open sea,
  // the waves and floating things slide past and the boat leaves a wake, so it reads as trolling from a moving boat.
  // The 배 sheet (갈 곳 + 다음 배) opens from the boat at the 섬, at the 바다 once it is a 돛배, and at sea.
  // view 'farisle' = the 먼 섬 beach. Logic lives in logic/ship.js.
  var SHIP_AT = { x: 154, y: 140 };                                   // the boat in the 먼바다 bay (hull baseline)
  var FAR_SAND = { cx: 92, cy: 152, rx: 62, ry: 34 };
  var FAR_SPOTS = [[66, 148], [94, 140], [120, 152]];                 // drift: [centre x, ground y]
  var FAR_SHIP = { x: 14, y: 176 };
  var ARCH = { x: 132, y: 112 };
  function isTrolling() { return scene === 'offshore' || scene === 'ocean'; }

  // ---------- art: the boats ----------
  // tier 1 = 돛배 (triangle sail), 2 = 통통배 (cabin + chimney puffing); x, y = hull top-left at the waterline
  function shipSprite(x, y, t, tt) {
    if (t < 1) { boatSprite(x, y, false, true); return; }
    var w = t > 1 ? 24 : 20;
    px(x, y + 3, w, 1, 4); px(x + 1, y + 4, w - 2, 2, 3); px(x + 2, y + 6, w - 4, 1, 4); px(x + 4, y + 4, w - 8, 1, 2);
    if (t === 1) {
      px(x + 9, y - 16, 1, 19, 4);                                         // mast
      for (var j = 0; j < 14; j++) {                                       // sail, filled by the wind
        var sw = Math.round(j * 0.62) + (j > 3 && j < 11 ? 1 : 0);
        px(x + 10, y - 15 + j, sw, 1, 0); px(x + 10 + sw, y - 15 + j, 1, 1, 4);
      }
      px(x + 10, y - 2, 9, 1, 4);                                          // boom
      px(x + 9, y - 18, 3, 2, 4);                                          // pennant
    } else {
      px(x + 4, y - 7, 10, 10, 4); px(x + 5, y - 6, 8, 9, 3);             // cabin
      px(x + 6, y - 4, 2, 2, 0); px(x + 10, y - 4, 2, 2, 0);              // windows
      px(x + 3, y - 8, 12, 1, 4);                                          // roof
      px(x + 16, y - 9, 3, 12, 4); px(x + 17, y - 8, 1, 10, 2);           // chimney
      var ph = (tt || 0) * 1.6;
      for (var k = 0; k < 3; k++) {                                        // 통통 puffs drifting back
        var q = (ph + k / 3) % 1, sx = x + 17 - q * 14, sy = y - 11 - q * 8, r = 1 + Math.round(q * 2);
        if (q < 0.9) { px(sx - r, sy - r, r * 2 + 1, r * 2 + 1, 2); px(sx - r + 1, sy - r + 1, r * 2 - 1, r * 2 - 1, 1); }
      }
    }
  }
  function shipIcon(t) {
    var c = document.createElement('canvas'); c.width = 26; c.height = 22;
    var saved = ctx; ctx = c.getContext('2d');
    try { shipSprite(1, t > 0 ? 14 : 10, t, 0); } finally { ctx = saved; }
    return c;
  }

  // ---------- art: new fish (shapes face left like SP.fish; FISH_FILL recolours '0') ----------
  FISH_SHAPE.marlin = ['......444......4', '.....40004....44', '4444040000000444', '....4000000004.4', '.....444444444.4'];
  FISH_SHAPE.oarfish = ['4.4.4.4.4.4.4.4.', '.444444444444444', '4040000000000004', '.444444444444444'];
  FISH_SHAPE.mako = ['.......4........', '......404......4', '..44440004444.44', '.40400000000044.', '4000000000000044', '.44444004444..44', '.......44......4'];
  FISH_SHAPE.monkfish = ['..4..........', '.4.4444....4', '4044000044.44', '4000000000444', '40000000004.44', '.444444444...4'];
  FISH_SHAPE.skate = FISH_SHAPE.ghostray;
  FISH_SHAPE.giantsquid = FISH_SHAPE.squid;
  FISH_FILL.bonito = function (i, j) { return j < 2 ? 3 : j === 2 && i % 3 === 0 ? 4 : 1; };
  FISH_FILL.spanish = function (i, j) { return (i + j) % 4 === 0 ? 3 : 1; };
  FISH_FILL.dolphinfish = function (i, j) { return j < 2 ? 3 : 2; };
  FISH_FILL.amberjack = function (i, j) { return j === 2 ? 4 : 1; };
  FISH_FILL.bluefin = function (i, j) { return j < 3 ? 3 : 1; };
  FISH_FILL.marlin = function (i, j) { return j < 2 ? 3 : (i % 4 === 0 ? 2 : 1); };
  FISH_FILL.wahoo = function (i, j) { return i % 3 === 0 ? 3 : 1; };
  FISH_FILL.yellowfin = function (i, j) { return j < 2 ? 3 : 2; };
  FISH_FILL.monkfish = function (i, j) { return (i + j) % 3 === 0 ? 4 : 3; };
  FISH_FILL.skate = function (i, j) { return (i + j) % 3 ? 3 : 2; };
  FISH_FILL.giantsquid = function (i, j) { return (i + j) % 3 === 0 ? 3 : 2; };
  FISH_FILL.mako = function (i, j) { return j < 4 ? 2 : 0; };
  FISH_FILL.oarfish = function () { return 1; };

  // ---------- art: 먼 섬 drift (x = centre, y = ground), shared with the basket icons through DR_ART ----------
  DR_ART.pumice = function (x, y) { px(x - 4, y - 4, 8, 1, 4); px(x - 5, y - 3, 10, 3, 4); px(x - 4, y, 8, 1, 4); px(x - 4, y - 3, 8, 3, 1); px(x - 2, y - 2, 1, 1, 3); px(x + 1, y - 3, 1, 1, 3); px(x + 3, y - 1, 1, 1, 3); };
  DR_ART.seabean = function (x, y) { px(x - 3, y - 5, 6, 1, 4); px(x - 4, y - 4, 8, 4, 4); px(x - 3, y, 6, 1, 4); px(x - 3, y - 4, 6, 3, 3); px(x - 2, y - 4, 2, 1, 2); px(x - 4, y - 2, 8, 1, 4); };
  DR_ART.nautilus = function (x, y) {
    px(x - 3, y - 8, 7, 1, 4); px(x - 4, y - 7, 9, 6, 4); px(x - 3, y - 1, 7, 1, 4); px(x - 3, y - 7, 7, 6, 0);
    px(x - 3, y - 6, 1, 4, 3); px(x - 1, y - 7, 1, 3, 3); px(x + 1, y - 7, 1, 2, 3);
    px(x + 1, y - 4, 3, 3, 4); px(x + 2, y - 3, 1, 1, 0);
  };
  DR_ART.whalebone = function (x, y) {
    for (var j = 0; j <= 12; j++) { var h = Math.round(Math.sin(j / 12 * Math.PI) * 6); px(x - 6 + j, y - 2 - h, 1, 2, 0); px(x - 6 + j, y - h, 1, 1, 4); }
    px(x - 8, y - 3, 3, 3, 4); px(x - 7, y - 2, 1, 1, 0); px(x + 6, y - 1, 3, 1, 4);
  };

  // ---------- farm view: 먼바다·난바다, the sea sliding past the boat ----------
  function drawShipWater(tt) {
    if (!isTrolling()) return;
    var deep = scene === 'ocean', sp = deep ? 20 : 13, k, x, y;
    // wave crests drift left: the boat is sailing right
    for (k = 0; k < (deep ? 34 : 26); k++) {
      y = 120 + Math.floor(hash(k * 7 + 3) * 82);
      x = (((hash(k * 13 + 1) * 240 - tt * sp * (0.6 + hash(k * 5 + 2) * 0.8)) % 240) + 240) % 240 - 30;
      if (inWet(x, y, 0.96) && inWet(x + 4, y, 0.96)) { px(x, y, 3, 1, k % 5 ? 3 : 0); if (deep && k % 3 === 0) px(x + 1, y - 1, 2, 1, 0); }
    }
    // something floating by now and then: a log (먼바다) or a whale's back (난바다)
    var fx = 200 - ((tt * sp * 0.8) % 320), fy = deep ? 178 : 168;
    if (inWet(fx, fy, 0.9)) {
      if (deep) { px(fx - 6, fy - 2, 12, 2, 4); px(fx - 4, fy - 3, 8, 1, 4); if (Math.floor(tt) % 6 === 0) { px(fx, fy - 8, 1, 5, 0); px(fx - 2, fy - 9, 5, 1, 0); } }
      else { px(fx - 5, fy - 1, 10, 2, 3); px(fx - 5, fy - 1, 10, 1, 4); px(fx + 2, fy - 3, 1, 2, 3); }
    }
    // gulls over the water (먼바다 only)
    if (!deep) for (k = 0; k < 2; k++) {
      var gx = 190 - ((tt * 9 + k * 70) % 220), gy = 118 + k * 9 + Math.round(Math.sin(tt * 2 + k) * 2), wing = Math.floor(tt * 4 + k) % 2;
      px(gx - 2, gy - wing, 2, 1, 4); px(gx, gy, 1, 1, 4); px(gx + 1, gy - wing, 2, 1, 4);
    }
    // the boat, bobbing, its wake trailing left
    var bob = Math.floor(tt * 1.6) % 2, t = Math.max(1, L.shipTier(S)), bx = SHIP_AT.x, by = SHIP_AT.y + bob;
    for (var w = 1; w < 9; w++) {
      var wy = by + 6, spread = Math.round(w * 0.6), ph = Math.floor(tt * 8 + w) % 2;
      px(bx - w * 2, wy - spread + ph, 1, 1, 0); px(bx - w * 2, wy + spread, 1, 1, 0);
    }
    shipSprite(bx, by, t, tt);
  }
  function tapShipWater(x, y) {
    if (view !== 'farm' || !isTrolling() || S.fish.phase !== 'idle') return false;
    if (!hit([SHIP_AT.x - 2, SHIP_AT.y - 18, 28, 26], x, y, 1)) return false;
    openShip(); return true;
  }

  // ---------- 먼 섬 scene ----------
  var bgFar = document.createElement('canvas'); bgFar.width = W; bgFar.height = H;
  (function paintFar() {
    var saved = ctx; ctx = bgFar.getContext('2d');
    for (var y = 27; y < H; y++) for (var x = 0; x < W; x++) {
      var a = (x - FAR_SAND.cx) / FAR_SAND.rx, b = (y - FAR_SAND.cy) / FAR_SAND.ry, d = a * a + b * b;
      if (d < 0.82) px(x, y, 1, 1, hash(x * 131 + y * 7) < 0.12 ? 2 : hash(x * 17 + y * 311) < 0.25 ? 1 : 0);   // sand bar
      else if (d < 0.92) px(x, y, 1, 1, (x + y) % 3 ? 0 : 2);                                                 // wet sand
      else if (d < 1) px(x, y, 1, 1, (x * 3 + y) % 4 ? 2 : 0);                                                // foam
      else px(x, y, 1, 1, (x + y) % 2 === 0 && y > 60 ? 2 : (x % 4 === 0 && y % 2 === 0) ? 2 : 1);          // deep sea all round
    }
    for (x = 0; x < W; x++) px(x, 26, 1, 1, 3);
    // the rock arch the island is known for
    var ax = ARCH.x, ay = ARCH.y;
    px(ax, ay + 8, 8, 34, 4); px(ax + 1, ay + 9, 6, 32, 3);
    px(ax + 26, ay + 12, 8, 30, 4); px(ax + 27, ay + 13, 6, 28, 3);
    for (var k = 0; k < 34; k++) { var h = Math.round(Math.sin(k / 33 * Math.PI) * 6); px(ax + k, ay + 6 - h, 1, 7, 4); px(ax + k, ay + 7 - h, 1, 4, 3); }
    px(ax - 2, ay + 41, 38, 1, 0);
    // two tufts of grass, the only green on the bar
    [[80, 158], [100, 164]].forEach(function (g) { px(g[0], g[1] - 3, 1, 3, 3); px(g[0] + 2, g[1] - 2, 1, 2, 3); px(g[0] - 2, g[1] - 2, 1, 2, 3); });
    ctx = saved;
  })();
  function drawFarIsle(tt) {
    var t = now(), e = curEnv(t), night = e.phase === 'night';
    ctx.drawImage(bgFar, 0, 0);
    drawSky(tt, e.phase);
    for (var k = 0; k < 36; k++) {   // waves breathing round the bar
      var an = k / 36 * Math.PI * 2, ph = (tt * 0.3 + k * 0.19) % 1, rr = 1.02 + ph * 0.1;
      var wx = FAR_SAND.cx + Math.cos(an) * FAR_SAND.rx * rr, wy = FAR_SAND.cy + Math.sin(an) * FAR_SAND.ry * rr;
      if (wy > 27 && ph < 0.6) px(wx, wy, 2, 1, 0);
    }
    shipSprite(FAR_SHIP.x, FAR_SHIP.y + (Math.floor(tt * 1.4) % 2), Math.max(1, L.shipTier(S)), tt);
    if (S.ship) FAR_SPOTS.forEach(function (sp, k) {
      var id = S.ship.drift[k] && S.ship.drift[k].id;
      px(sp[0] - 5, sp[1] + 1, 11, 1, 2);
      if (!id) return;
      drawDrift(id, sp[0], sp[1], tt);
      var d = L.farById(id);
      if (d && d.rarity !== '흔함') sparkle(sp[0] + 6, sp[1] - 9, tt + k * 0.4);
    });
    drawYardWeather(tt, e.weather);
    if (night || e.phase === 'evening') { ctx.globalAlpha = night ? 0.36 : 0.14; px(0, 0, W, H, 4); ctx.globalAlpha = 1; }
    if (night) drawStars(tt);
  }
  function tapFarIsle(x, y) {
    var t = now();
    if (hit([FAR_SHIP.x - 2, FAR_SHIP.y - 18, 28, 26], x, y, 2)) { openShip(); return; }
    for (var k = 0; k < FAR_SPOTS.length; k++) {
      var sp = FAR_SPOTS[k];
      if (!hit([sp[0] - 7, sp[1] - 10, 14, 13], x, y, 2)) continue;
      if (!S.ship.drift[k].id) { toast('파도가 다시 무언가 실어 오는 중 · ' + fmtLeft(Math.max(0, S.ship.drift[k].at - t)), 1800); return; }
      if (bagStop()) return;
      var r = L.pickFar(S, k, t, Math.random);
      if (!r) return;
      var d = L.farById(r.id);
      burst(sp[0], sp[1] - 4, d.rarity === '흔함' ? 6 : 12, 0, 50);
      floatText('+' + d.name, sp[0], sp[1] - 12);
      toast((r.first ? '★ 처음 · ' : '') + d.name + (d.rarity !== '흔함' ? ' (' + d.rarity + ')' : '') + (r.sold ? ' · 바구니가 꽉 차 바로 팔았다 +' + r.sold : ' · 바구니에'), 2400);
      refresh(); return;
    }
    var nx = L.farNextAt(S);
    toast('먼 섬 · 모래톱을 눌러 줍기 · 배를 누르면 배 창' + (nx !== null && !L.farSpots(S, t).some(Boolean) ? ' · 다음 표류물 ' + fmtLeft(Math.max(0, nx - t)) : ''), 2800);
  }

  // ---------- 배 sheet: where to go + the next boat ----------
  var SWHY = { boat: '섬 배를 먼저 고쳐야 해요', max: '가장 좋은 배예요', coins: '코인이 부족해요', item: '재료가 모자라요' };
  function openShip() {
    if (reel) return;
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true;
    sheetKind = 'ship'; sheetEl.hidden = false;
    renderShip();
  }
  function shipBtn(label, off, fn) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    if (off) b.classList.add('poor');
    b.addEventListener('click', fn);
    return b;
  }
  // where the player is now: a spot id on the farm view, or 'island' / 'farisle'
  function shipHere() { return view === 'farm' ? L.curSpot(S) : view; }
  function shipGo(kind, id) {
    if (kind === 'spot') {
      if (L.curSpot(S) !== id && !goSpot(id)) { toast('줄을 걷고 나서 옮길 수 있어요', 2000); return; }
      closeSheet(); goScene('farm');
      if (id === 'offshore' || id === 'ocean') toast(L.SPOTS[id].name + ' 끌낚시 · 물을 눌러 던지기 · 배를 누르면 배 창', 3000);
    } else { closeSheet(); goScene(id); }
  }
  function renderShip() {
    var tier = L.shipTier(S), keep = sheetEl.scrollTop, here = shipHere();
    sheetHead(tier >= 0 ? L.SHIP_TIERS[tier].name : '배');
    var say = document.createElement('p'); say.className = 'say';
    say.textContent = tier >= 2 ? '통통통… 기름 냄새 나는 통통배. 난바다 끝 먼 섬까지 간다.' : tier === 1 ? '바람을 가득 안는 돛배. 먼바다까지 나가 큰 물고기를 끈다.' : '삐걱이는 나룻배. 돛을 달면 더 멀리 나갈 수 있을 것 같다.';
    sheetEl.appendChild(say);
    var h3 = document.createElement('h3'); h3.textContent = '갈 곳'; sheetEl.appendChild(h3);
    [['spot', 'sea', '바다', 0, '바닷가 낚시터'], ['scene', 'island', '섬', 0, '표류물·야자수·등대'],
      ['spot', 'offshore', '먼바다', 1, '끌낚시 · 큰 물고기 ' + L.OFFSHORE_FISH.length + '종'],
      ['spot', 'ocean', '난바다', 2, '끌낚시 · 큰 물고기 ' + L.OCEAN_FISH.length + '종'],
      ['scene', 'farisle', '먼 섬', 2, '처음 보는 표류물 ' + L.FAR_DRIFT.length + '종']].forEach(function (d) {
      var ok = tier >= d[3], at = d[0] === 'scene' ? view === d[1] : view === 'farm' && here === d[1];
      var r = sheetRow(spotIcon(d[1] === 'island' || d[1] === 'farisle' ? 'sea' : d[1]), d[2], ok ? d[4] + (at ? ' · 지금 여기' : '') : L.SHIP_TIERS[d[3]].name + '가 있어야 해요', ok ? '' : 'idle');
      r.appendChild(shipBtn(at ? '여기' : ok ? '가기' : '잠김', !ok || at, function () { if (ok && !at) shipGo(d[0], d[1]); }));
    });
    var nx = L.shipNext(S);
    h3 = document.createElement('h3'); h3.textContent = '배 키우기';
    var hb = document.createElement('b'); hb.textContent = L.SHIP_TIERS.map(function (t) { return t.name; }).join(' → '); h3.appendChild(hb);
    sheetEl.appendChild(h3);
    if (!nx) {
      var p = document.createElement('p'); p.className = 'note'; p.textContent = '통통배가 다 됐다 · 먼바다, 난바다, 먼 섬 어디든';
      sheetEl.appendChild(p);
    } else {
      sheetRow(shipIcon(tier + 1), nx.name, nx.spot === 'offshore' ? '돛을 달면 먼바다가 열린다' : '엔진을 달면 난바다와 먼 섬이 열린다');
      sheetRow(shipIcon(tier), '코인', nx.coins.toLocaleString('ko-KR') + '코인 · 가진 것 ' + S.coins.toLocaleString('ko-KR'), S.coins >= nx.coins ? '' : 'idle');
      L.shipMissing(S).forEach(function (m) {
        sheetRow(itemIcon(m.id), L.itemInfo(m.id).name + ' ' + m.n + '개', '가진 것 ' + m.have + '/' + m.n + ' · ' + (L.oreById(m.id) ? '동굴에서' : '섬 바닷가에서'), m.have >= m.n ? '' : 'idle');
      });
      var st = L.shipStatus(S);
      var r = sheetRow(shipIcon(tier + 1), nx.name + '로 고치기', st === 'ok' ? '재료는 바구니에서 빠진다' : SWHY[st] || '', st === 'ok' ? '' : 'idle');
      r.appendChild(shipBtn('고치기', st !== 'ok', function () {
        var res = L.upgradeShip(S);
        if (!res.ok) { toast(SWHY[res.why] || '아직 못 고쳐요'); return; }
        toast('★ ' + L.SHIP_TIERS[res.tier].name + '가 됐다 · ' + (res.tier === 1 ? '먼바다가 열렸다' : '난바다와 먼 섬이 열렸다'), 3600);
        burst(90, 120, 20, 0, 70);
        refresh(); renderShip();
      }));
    }
    sheetEl.scrollTop = keep;
  }

  // ---------- tick: 먼 섬 drift while it is on screen; the sheet follows the boat ----------
  var shipKey = '';
  function tickShipUI(t) {
    if (sheetKind === 'ship' && view !== 'farm' && view !== 'island' && view !== 'farisle') closeSheet();
    if (view === 'farisle' && L.farOk(S)) {
      var before = S.ship.drift.map(function (p) { return p.id; });
      if (L.tickFar(S, t, curEnv(t), Math.random)) {
        save();
        var fresh = S.ship.drift.some(function (p, k) { var d = p.id && !before[k] && L.farById(p.id); return d && L.driftConditional(d) && !S.ship.dex[d.id]; });
        if (fresh) toast('먼 섬에 처음 보는 게 밀려왔다…', 3000);
      }
    }
    var key = L.shipTier(S) + ':' + S.bag.length + ':' + (S.coins >= ((L.shipNext(S) || {}).coins || 0)) + ':' + shipHere();
    if (sheetKind === 'ship' && !sheetEl.hidden && quiet() && key !== shipKey) renderShip();
    shipKey = key;
  }

  // ---------- 도감: 먼 섬 표류물 ----------
  function renderShipDex(row) {
    var list = L.FAR_DRIFT, n = L.farDexCount(S);
    dexHead('먼 섬 표류물', n, list.length, L.farOk(S) ? '통통배로 가는 먼 섬 모래톱' : '통통배가 있으면 먼 섬에 갈 수 있어요');
    list.forEach(function (d) {
      var c = S.ship ? S.ship.dex[d.id] || 0 : 0, ic = driftIcon(d.id); ic.className = 'sq';
      row(ic, c ? (d.rarity !== '흔함' ? '★ ' : '') + d.name : '???', c ? d.rarity + ' · ' + driftCond(d) + ' · ' + d.price + '코인' : d.hint, c ? c + '개' : '', !c);
    });
  }

  // ---------- console hooks ----------
  function addShipHooks(FF) {
    // FF.ship(t) makes the boat tier t (1 돛배, 2 통통배), paying with gifted coins and materials; then opens the sheet
    FF.ship = function (t) {
      if (!L.isleOk(S)) FF.isle();
      var want = typeof t === 'number' ? t : 2, keep = S.noSell;
      S.noSell = true;
      while (L.shipTier(S) < want && L.shipNext(S)) {
        var nx = L.shipNext(S);
        S.coins += nx.coins;
        nx.need.forEach(function (q) { for (var j = 0; j < q[1]; j++) L.bagAdd(S, q[0], L.itemInfo(q[0]).price); });
        L.upgradeShip(S);
      }
      S.noSell = keep;
      refresh(); openShip(); return L.shipTier(S);
    };
    // FF.far(id) washes up the 먼 섬 now (all spots id if given) and goes there
    FF.far = function (id) {
      if (!L.farOk(S)) FF.ship(2);
      S.ship.drift.forEach(function (p) { p.at = 0; p.id = id && L.farById(id) ? id : null; });
      L.tickFar(S, now(), curEnv(now()), Math.random);
      closeSheet(); goScene('farisle'); refresh();
      return S.ship.drift.map(function (p) { return p.id; });
    };
  }
