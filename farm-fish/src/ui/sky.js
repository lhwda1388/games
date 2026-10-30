  // ---------- 별 관측: the 망원경 in the 마당, the 별 잇기 view, 유성우 + wishes, 도감 별자리, 달력 유성우 ----------
  // Logic in logic/sky.js. The puzzle is its own view ('stars') on the main canvas, so it works in the PiP window:
  // tap the stars in order, starting at the blinking one; the little chart top right shows the shape.
  var SCOPE = [22, 62, 20, 26];             // the telescope in the 마당 (beside the windmill spot)
  var starHome = 'yard';                    // where the 별 잇기 view returns to (stage 9: 'peak' from the summit)
  var starG = null, starForce = false, meteorForce = false, meteorHeads = [];
  function chartX(u) { return 14 + u * 1.26; }
  function chartY(v) { return 44 + v * 1.4; }
  function skyNight() { return curEnv(now()).phase === 'night'; }
  function meteorOn() { return L.skyOk(S) && (meteorForce || (skyNight() && L.meteorNight(now(), TZ))); }
  function lineDots(x0, y0, x1, y1, c, gap) {
    var n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (var k = 0; k <= n; k += gap || 1) px(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n, 1, 1, c);
  }

  // ---------- telescope in the 마당 ----------
  function drawScope(tt) {
    if (!L.skyOk(S)) return;
    var x = SCOPE[0], y = SCOPE[1];
    lineDots(x + 10, y + 12, x + 3, y + 25, 4); lineDots(x + 10, y + 12, x + 17, y + 25, 4); px(x + 10, y + 12, 1, 13, 4);
    px(x + 8, y + 10, 5, 3, 4);
    for (var k = 0; k < 14; k++) px(x + 2 + k, y + 13 - k * 0.7, 3, 3, k < 2 ? 4 : 3);
    px(x + 15, y + 2, 4, 4, 4); px(x + 16, y + 3, 2, 2, 1);
    if (L.skyOpen(S, now(), TZ, curEnv(now()).phase)) sparkle(x + 19, y, tt);
  }
  // yard taps: a meteor first, then the telescope
  function tapSkyYard(x, y) {
    if (tapMeteor(x, y)) return true;
    if (!L.skyOk(S) || !hit(SCOPE, x, y, 3)) return false;
    openStars(false);
    return true;
  }
  // home = the view to come back to (캠핑: the camp view; rewards there × L.cmpStarMul)
  function openStars(force, peak, home) {
    var t = now(), e = curEnv(t);
    if (!force && !L.skyOpen(S, t, TZ, e.phase)) {
      var nn = L.nextPhase(t, TZ, 'night');
      toast('망원경 · 별은 밤에만 보여요' + (nn ? ' · 밤까지 ' + fmtLeft(nn.at - t) : ''), 2400);
      return;
    }
    starForce = !!force;
    starG = L.starGame(L.starFor(S, e.season, Math.random, !!peak), Math.random);
    starHome = home || (peak ? 'peak' : 'yard');
    goScene('stars');
    var c = L.starById(starG.id), seen = S.sky.seen[c.id];
    toast((seen ? c.name : '처음 보는 별자리') + ' · 깜빡이는 별부터 순서대로 · 오른쪽 위 그림을 따라', 3200);
  }

  // ---------- 별 잇기 view ----------
  function drawStarView(tt) {
    px(0, 0, W, H, 4);
    for (var k = 0; k < (starHome === 'peak' ? 170 : 90); k++) {   // more stars from the summit
      var sx = Math.floor(hash(k * 23 + 7) * W), sy = Math.floor(hash(k * 29 + 1) * H);
      if ((Math.floor(tt * 0.8) + k) % 9) px(sx, sy, 1, 1, k % 3 ? 3 : 2);
    }
    drawMeteors(tt, 10, 90);
    if (!starG) return;
    var g = starG, c = L.starById(g.id), lit = g.taps.slice(0, g.step);
    // the chart: the shape to copy
    var bx = 146, by = 22, bw = 32;
    px(bx - 1, by - 1, bw + 2, bw + 2, 2); px(bx, by, bw, bw, 4);
    var lift = true, prev = null;
    c.path.forEach(function (p) {
      if (p === null) { lift = true; return; }
      var q = [bx + 2 + c.pts[p][0] * 0.28, by + 2 + c.pts[p][1] * 0.28];
      if (!lift && prev) lineDots(prev[0], prev[1], q[0], q[1], 2);
      px(q[0], q[1], 1, 1, 0);
      prev = q; lift = false;
    });
    // lines already joined
    for (var j = 1; j < g.step; j++) {
      if (!g.join[j]) continue;
      var a = g.stars[g.taps[j - 1]], b = g.stars[g.taps[j]];
      lineDots(chartX(a.x), chartY(a.y), chartX(b.x), chartY(b.y), g.done ? 0 : 2, g.done ? 1 : 2);
    }
    // the stars (decoys look the same); the next one blinks at the start or after two misses
    var cue = !g.done && (g.step === 0 || g.wrong >= 2) ? g.taps[g.step] : -1;
    g.stars.forEach(function (st, k) {
      var x = Math.round(chartX(st.x)), y = Math.round(chartY(st.y)), on = lit.indexOf(k) >= 0;
      if (on) { px(x - 2, y, 5, 1, 0); px(x, y - 2, 1, 5, 0); px(x - 1, y - 1, 3, 3, 0); }
      else { px(x - 1, y, 3, 1, 1); px(x, y - 1, 1, 3, 1); px(x, y, 1, 1, 0); }
      if (k === cue && Math.floor(tt * 3) % 2) { px(x - 4, y - 4, 9, 1, 2); px(x - 4, y + 4, 9, 1, 2); px(x - 4, y - 4, 1, 9, 2); px(x + 4, y - 4, 1, 9, 2); }
    });
    if (g.done) sparkle(chartX(g.stars[g.taps[g.taps.length - 1]].x) + 6, chartY(g.stars[g.taps[g.taps.length - 1]].y) - 6, tt);
  }
  function tapStarView(x, y) {
    if (tapMeteor(x, y)) return;
    var g = starG;
    if (!g || g.done) { starG = null; goScene(starHome); return; }
    var k = L.starAt(g, (x - 14) / 1.26, (y - 44) / 1.4, 9);
    if (k < 0) return;
    var r = L.starTap(g, k), st = g.stars[k];
    if (r === 'wrong') { toast(g.wrong >= 2 ? '깜빡이는 별을 눌러 봐요' : '음… 그 별이 아닌 것 같다', 1400); return; }
    burst(chartX(st.x), chartY(st.y), r === 'done' ? 18 : 4, 0, r === 'done' ? 70 : 24);
    if (r !== 'done') return;
    var mul = L.cmpStarMul(S, cmpIsView(starHome)), c = L.starById(g.id), rec = L.seeStar(S, g.id, now(), mul);
    toast('★ ' + c.name + (rec && rec.first ? ' · 처음 찾았다! 도감에 기록' : ' · 또 만났다') + (rec ? ' · +' + rec.coins + (mul > 1 ? ' (캠프 ×' + mul + ')' : '') : '') + ' · 누르면 ' + (starHome === 'peak' ? '산꼭대기로' : cmpIsView(starHome) ? '캠핑장으로' : '마당으로'), 4000);
    refresh();
  }

  // ---------- 유성우: streaks in the night sky (마당 and the 별 잇기 view); tapping one makes the night's wish ----------
  function drawMeteors(tt, top, span) {
    meteorHeads = [];
    if (!meteorOn()) return;
    var period = 1.3;
    for (var n = 0; n < 2; n++) {
      var slot = Math.floor(tt / period) - n, age = tt - slot * period;
      if (age > 0.9) continue;
      var x0 = 60 + hash(slot * 5 + 1) * 116, y0 = top + hash(slot * 3 + 2) * span;
      var hx = x0 - age * 80, hy = y0 + age * 40;
      for (var k = 1; k < 10; k++) px(hx + k * 2, hy - k, 1, 1, k < 3 ? 0 : k < 6 ? 1 : 2);
      px(hx - 1, hy - 1, 3, 3, 0);
      meteorHeads.push({ x: hx, y: hy });
    }
  }
  function tapMeteor(x, y) {
    if (!meteorOn() || L.wishUsed(S, now())) return false;
    for (var k = 0; k < meteorHeads.length; k++) {
      var m = meteorHeads[k];
      if (Math.abs(m.x - x) < 14 && Math.abs(m.y - y) < 12) { doWish(m); return true; }
    }
    return false;
  }
  function doWish(m) {
    var r = L.meteorWish(S, now(), Math.random, meteorForce ? undefined : TZ, L.cmpStarMul(S, cmpIsView(view) || (view === 'stars' && cmpIsView(starHome))));   // 캠핑: coin wishes × camp stars
    burst(m.x, m.y, 10, 0, 50);
    if (!r) { toast('반짝… 오늘 밤 소원은 벌써 빌었다', 1800); return; }
    var what = r.kind === 'deco' ? '장식 「' + L.decoById(r.id).name + '」' + (r.stored ? ' · 보관함에' : ' · 마당에 놓았다')
      : r.kind === 'seed' ? '황금 수박 씨앗 하나' : '+' + r.coins + '코인';
    toast('★ 유성에 소원을 빌었다 · ' + what, 3600);
    refresh();
  }
  // the 마당 sky on a 유성우 night (drawn over the night tint)
  function drawSkyYard(tt) { drawMeteors(tt, 2, 30); }

  // ---------- 마당 decorations from wishes ----------
  DRAW_DECO.meteorite = function (x, y, tt) {
    px(x + 2, y + 3, 10, 6, 3); px(x + 1, y + 5, 12, 4, 3); px(x + 3, y + 2, 7, 1, 3); px(x, y + 9, 14, 1, 4);
    px(x + 4, y + 4, 2, 2, 4); px(x + 8, y + 6, 2, 1, 4); px(x + 9, y + 3, 1, 1, 2);
    if (Math.floor((tt || 0) * 1.5) % 3 === 0) px(x + 6, y + 3, 1, 1, 0);
  };
  DRAW_DECO.skyglobe = function (x, y) {
    px(x + 5, y + 14, 2, 4, 4); px(x + 2, y + 18, 8, 2, 4);
    px(x + 2, y + 2, 8, 10, 1); px(x + 3, y + 1, 6, 1, 1); px(x + 3, y + 12, 6, 1, 1);
    px(x + 1, y + 6, 10, 1, 4); px(x + 6, y + 1, 1, 12, 4);
    px(x + 4, y + 3, 1, 1, 0); px(x + 8, y + 9, 1, 1, 0); px(x + 3, y + 9, 1, 1, 3);
  };

  // ---------- 도감 별자리 ----------
  function starIcon(id, dim) {
    var c = document.createElement('canvas'); c.width = 14; c.height = 14;
    var saved = ctx; ctx = c.getContext('2d');
    try {
      var s = L.starById(id), lift = true, prev = null;
      px(0, 0, 14, 14, 4);
      s.path.forEach(function (p) {
        if (p === null) { lift = true; return; }
        var q = [1 + s.pts[p][0] * 0.12, 1 + s.pts[p][1] * 0.12];
        if (!lift && prev && !dim) lineDots(prev[0], prev[1], q[0], q[1], 2);
        prev = q; lift = false;
      });
      s.pts.forEach(function (p) { px(1 + p[0] * 0.12, 1 + p[1] * 0.12, 1, 1, 0); });
    } finally { ctx = saved; }
    return c;
  }
  function renderSkyDex(row) {
    dexHead('별자리', L.skyDexCount(S), L.STARS.length, L.skyOk(S) ? '밤에 마당의 망원경을 눌러요 · 계절마다 다른 별자리' : '상점에서 망원경을 사면 밤하늘의 별을 이을 수 있어요');
    L.STARS.forEach(function (c) {
      var t = S.sky && S.sky.seen[c.id], ic = starIcon(c.id, !t); ic.className = 'sq';
      row(ic, t ? c.name : '???', t ? (c.season ? L.SEASON_NAME[c.season] + ' 밤하늘' : '언제나') + ' · 별 ' + c.pts.length + '개' : c.hint, t ? '관측' : '', !t);
    });
  }

  // ---------- 상점: 망원경 ----------
  function renderSkyShop() {
    var h3 = document.createElement('h3'); h3.textContent = '별 관측'; shopEl.appendChild(h3);
    var own = L.skyOk(S);
    shopRow(starIcon('ursaminor'), '망원경', own ? '마당에 있어요 · 밤에 누르면 별자리 잇기 · 유성우 밤엔 소원' : '마당에 놓는다 · 게임 밤에 별자리를 잇고, 가끔 유성우',
      own ? '있음' : L.SCOPE_COST.toLocaleString('ko-KR'),
      function () {
        var res = L.buyScope(S);
        if (res.ok) { toast('망원경을 마당에 놓았다 · 밤이 되면 눌러 보자', 3000); refresh(); renderShop(); }
        return res;
      }, { max: own, poor: !own && S.coins < L.SCOPE_COST, aria: '망원경 사기 ' + L.SCOPE_COST + '코인' });
  }

  // ---------- 달력: 유성우, cave gems only now ----------
  function renderStage7BCal() {
    var t = now(), w = L.nextMeteor(t, TZ);
    if (L.skyOk(S) && w) {
      var h3 = document.createElement('h3'); h3.textContent = '유성우';
      var b = document.createElement('b'); var on = meteorOn(); b.textContent = on ? '지금!' : '다음 밤'; h3.appendChild(b); calEl.appendChild(h3);
      var d = new Date(w.start);
      note(on ? '지금 유성우 · 마당 하늘의 유성을 눌러 소원을 빌어요 (밤에 한 번)'
        : d.getHours() + '시 ' + String(d.getMinutes()).padStart(2, '0') + '분부터 15분 · ' + fmtReal(w.start - t) + ' 뒤 · 마당에서 유성을 눌러 소원');
    }
    if (!L.caveOk(S)) return;
    var e = curEnv(t), list = L.ORES.filter(function (o) { return L.oreConditional(o) && L.oreWeight(o, e, null, false) > 0; });
    if (!list.length) return;
    var h = document.createElement('h3'); h.textContent = '동굴에서 지금';
    var hb = document.createElement('b'); var en = L.caveEnergy(S, t); hb.textContent = '기력 ' + en.n + '/' + en.max; h.appendChild(hb); calEl.appendChild(h);
    list.forEach(function (o) {
      var got = S.cave.dex[o.id];
      var r = document.createElement('div'); r.className = 'dx' + (got ? '' : ' unk');
      var ic = caveIcon(o.id); ic.className = 'sq'; if (!got) ic.style.opacity = '0.5';
      var n = document.createElement('div'); n.className = 'n'; n.textContent = got ? o.name : '???';
      var s3 = document.createElement('small'); s3.textContent = got ? o.rarity + ' · ' + oreCond(o) : o.hint; n.appendChild(s3);
      var v = document.createElement('div'); v.className = 'v'; v.textContent = o.rarity;
      r.appendChild(ic); r.appendChild(n); r.appendChild(v); calEl.appendChild(r);
    });
  }

  // ---------- one entry point each for the shared panels and the loop ----------
  function renderStage7BShop() { renderCaveShop(); renderSkyShop(); }
  function renderStage7BDex(row) { renderCaveDex(row); renderSkyDex(row); }
  function tickStage7B(t) {
    tickCaveUI();
    if (view === 'stars' && starG && !starG.done && !starForce && curEnv(t).phase !== 'night') {
      starG = null; goScene(starHome); toast('날이 밝았다 · 별이 숨었다 · 다음 밤에 또', 2600);
    }
  }
  // 사진기 (lane ①) ctx: meteor, scene 'cave', fossilDone. Used once a camera exists (typeof L.shotsNow === 'function').
  function stage7BShotCtx(c) {
    if (typeof L.shotsNow !== 'function') return c;
    caveShotCtx(c);
    if (meteorOn()) c.meteor = true;
    return c;
  }

  // ---------- console hooks ----------
  function addStage7BHooks(FF) {
    addCaveHooks(FF);
    FF.sky = function () { if (!L.skyOk(S)) { S.coins += L.SCOPE_COST; L.buyScope(S); } goScene('yard'); refresh(); return S.sky; };
    // FF.stars(id) opens the 별 잇기 view now, night or not; FF.stars('all') fills the 별자리 도감
    FF.stars = function (id) {
      if (!L.skyOk(S)) FF.sky();
      if (id === 'all') { L.STARS.forEach(function (c) { L.seeStar(S, c.id, now()); }); refresh(); return L.skyDexCount(S); }
      openStars(true, id === 'peak' || (L.starById(id) && L.starById(id).peak));
      if (id && L.starById(id)) starG = L.starGame(id, Math.random);
      return starG && starG.taps.map(function (k) { var s = starG.stars[k]; return { x: Math.round(chartX(s.x)), y: Math.round(chartY(s.y)) }; });
    };
    // FF.meteor(true) shows a 유성우 now (any time), FF.meteor(false) back to the clock; FF.meteor('again') allows a new wish
    FF.meteor = function (on) {
      if (on === 'again') { if (S.sky) S.sky.wish = null; return true; }
      meteorForce = on !== false; if (meteorForce && !L.skyOk(S)) FF.sky();
      return L.nextMeteor(now(), TZ);
    };
    FF.shotCtx = function () { return caveShotCtx({ meteor: meteorOn() }); };
  }
