  // ---------- 소문과 보물 지도 (stage 8 ③): map pictures, piece/rumor toasts, 꾹 눌러 파기, 기록 tab, FF hooks ----------
  // A map is a 90×100 crop of the real scene background around the X (1:1 pixels), plus the landmarks that are drawn
  // live in that scene, a condition sign in the corner (moon, sun, rain, fog, low tide) and hatched gaps for missing pieces.
  var MAP_W = 90, MAP_H = 100, DIG_HOLD = 700;
  function tmapBg(sc) { return { farm: bg, yard: bgYard, forest: bgForest, orchard: bgOrchard, flat: bgFlat, island: bgIsle, village: bgVillage }[sc]; }
  function tmapCrop(m) { return [Math.max(0, Math.min(W - MAP_W, m.x - MAP_W / 2)), Math.max(0, Math.min(H - MAP_H, m.y - MAP_H / 2))]; }
  // piece k of n: 3 = vertical strips, 4 = quarters
  function pieceRect(n, k) {
    if (n === 4) return [(k % 2) * MAP_W / 2, Math.floor(k / 2) * MAP_H / 2, MAP_W / 2, MAP_H / 2];
    var w = MAP_W / n; return [Math.round(k * w), 0, Math.round((k + 1) * w) - Math.round(k * w), MAP_H];
  }
  // live landmarks that are not in the pre-rendered backgrounds (o = crop origin)
  function tmapLand(m, o) {
    var x, y, k;
    if (m.scene === 'island') {            // the palm
      x = PALM.x - o[0]; y = PALM.y - o[1];
      for (k = 0; k < 34; k++) px(x - Math.round(k * k / 90), y - k, 3, 1, 4);
      var tx = x - 13, ty = y - 34;
      [[-1, 0], [1, 0], [-1, 1], [1, 1]].forEach(function (d) { for (var j = 0; j < 11; j++) px(tx + d[0] * j, ty + (d[1] ? Math.round(j * j / 14) : -Math.round(j / 3)) , 2, 1, 3); });
      px(tx - 1, ty, 4, 3, 4);
    } else if (m.scene === 'flat') {       // the tide pole
      x = 172 - o[0]; y = 120 - o[1];
      px(x, y, 3, 58, 4); for (k = 0; k < 6; k++) px(x - 2, y + 4 + k * 9, 2, 1, 4); px(x - 3, y - 2, 9, 2, 4);
    } else if (m.scene === 'village') {    // the two houses below the lane
      houseBody(4 - o[0], 118 - o[1], 1, 3); houseBody(64 - o[0], 118 - o[1], 1, 3);
    }
  }
  // the condition sign, top right corner of the map
  function tmapCond(m) {
    var c = m.cond, x = MAP_W - 17, y = 3, k;
    if (!c) return;
    px(x - 1, y - 1, 16, 14, 4); px(x, y, 14, 12, 0);
    if (c.phase === 'night') {   // crescent: a disc minus the same disc nudged right
      for (var j = 0; j < 10; j++) for (k = 0; k < 10; k++) {
        var dx = k - 4.5, dy = j - 4.5;
        if (dx * dx + dy * dy < 20 && (dx - 2.5) * (dx - 2.5) + (dy + 1) * (dy + 1) >= 16) px(x + 2 + k, y + 1 + j, 1, 1, 4);
      }
    }
    else if (c.phase === 'morning' || c.phase === 'evening') {
      px(x + 1, y + 8, 12, 1, 4); px(x + 4, y + 5, 6, 3, 4); px(x + 5, y + 4, 4, 1, 4);
      if (c.phase === 'morning') { px(x + 6, y + 1, 2, 2, 3); px(x + 2, y + 3, 1, 1, 3); px(x + 11, y + 3, 1, 1, 3); }
      else { px(x + 3, y + 10, 8, 1, 2); px(x + 5, y + 11, 4, 1, 2); }
    } else if (c.weather && c.weather[0] === 'fog') { for (k = 0; k < 3; k++) for (var q = (k % 2) * 2; q < 12; q += 4) px(x + 1 + q, y + 2 + k * 3, 3, 1, 3); }
    else if (c.weather) { for (k = 0; k < 4; k++) { px(x + 2 + k * 3, y + 2 + (k % 2) * 3, 1, 3, 4); } px(x + 10, y + 8, 3, 1, 3); px(x + 11, y + 7, 1, 3, 3); }
    else if (c.tide) { for (q = 0; q < 12; q += 4) { px(x + 1 + q, y + 9, 2, 1, 3); px(x + 3 + q, y + 8, 2, 1, 3); } px(x + 6, y + 1, 2, 5, 4); px(x + 4, y + 5, 6, 1, 4); px(x + 5, y + 6, 4, 1, 4); px(x + 6, y + 7, 2, 1, 4); }
  }
  function tmapCanvas(m) {
    var c = document.createElement('canvas'); c.width = MAP_W; c.height = MAP_H;
    var g = c.getContext('2d'), o = tmapCrop(m), have = L.tmapPieces(S, m.id), saved = ctx;
    g.imageSmoothingEnabled = false;
    ctx = g;
    try {
      px(0, 0, MAP_W, MAP_H, 0);
      g.drawImage(tmapBg(m.scene), o[0], o[1], MAP_W, MAP_H, 0, 0, MAP_W, MAP_H);
      tmapLand(m, o);
      // the X, with a light outline so it reads on any ground
      var x = m.x - o[0], y = m.y - o[1], k;
      for (k = -3; k <= 3; k++) { px(x + k - 1, y + k - 1, 3, 3, 0); px(x + k - 1, y - k - 1, 3, 3, 0); }
      for (k = -3; k <= 3; k++) { px(x + k, y + k, 2, 2, 4); px(x + k, y - k, 2, 2, 4); }
      tmapCond(m);
      // pieces not found yet: blank, hatched paper
      for (k = 0; k < m.n; k++) if (have.indexOf(k) < 0) {
        var r = pieceRect(m.n, k);
        px(r[0], r[1], r[2], r[3], 1);
        for (var d = 0; d < r[2] + r[3]; d += 5) for (var j = 0; j < r[3]; j++) { var hx = r[0] + d - j; if (hx >= r[0] && hx < r[0] + r[2]) px(hx, r[1] + j, 1, 1, 2); }
      }
      // torn paper edge
      for (k = 0; k < MAP_W; k++) { px(k, 0, 1, 1 + (hash(k * 7 + 1) < 0.3 ? 1 : 0), 3); px(k, MAP_H - 1 - (hash(k * 5 + 2) < 0.3 ? 1 : 0), 1, 2, 3); }
      for (k = 0; k < MAP_H; k++) { px(0, k, 1 + (hash(k * 3 + 4) < 0.3 ? 1 : 0), 1, 3); px(MAP_W - 1 - (hash(k * 11 + 6) < 0.3 ? 1 : 0), k, 2, 1, 3); }
    } finally { ctx = saved; }
    return c;
  }

  // ---------- drops and rumors: called right after the thing that found them (their own toast goes first) ----------
  function tmapAfter(src) {
    var r = L.tmapDrop(S, src, Math.random);
    if (!r) return null;
    var m = L.tmapById(r.id);
    save();
    setTimeout(function () {
      toast(r.complete ? '★ 보물 지도 완성! · ' + m.name + ' · 그려진 곳을 꾹 눌러 파 보자 · 도감 › 기록'
        : '보물 지도 조각! · ' + m.name + ' ' + r.have + '/' + r.n + ' · 도감 › 기록', 4200);
    }, 2800);
    return r;
  }
  // quiet = the caller shows the line itself (마을 대화); otherwise a toast a moment later
  function rumorAfter(src, who, quiet) {
    var r = L.rumorHear(S, src, who || null, Math.random);
    if (!r) return null;
    save();
    setTimeout(function () { toast(quiet ? '소문을 들었다 · 도감 › 기록 › 소문 수첩' : '소문 · ' + r.text, quiet ? 2600 : 4800); }, quiet ? 2400 : 3300);
    return r;
  }

  // ---------- 꾹 눌러 파기: a long press in a scene that has a finished, undug map ----------
  var dig = null;
  // first look at every press (tapScene); never takes the tap, the scene still gets it
  function digPress(x, y) {
    dig = L.tmapReady(S, view).length && !reel ? { x: x, y: y, t0: performance.now(), view: view } : null;
  }
  function drawDig() {
    if (!dig) return;
    if (!holdPointer || view !== dig.view || chal || reel || pick || !sheetEl.hidden || (view === 'farm' && S.fish.phase !== 'idle')) { dig = null; return; }
    var d = dig, t = performance.now() - d.t0;
    if (t >= DIG_HOLD) { dig = null; doDig(d.x, d.y); return; }
    if (t < 200) return;
    var n = Math.ceil((t - 200) / (DIG_HOLD - 200) * 8);
    for (var k = 0; k < 8; k++) {
      var a = k / 8 * Math.PI * 2 - Math.PI / 2;
      px(Math.round(d.x + Math.cos(a) * 7) - 1, Math.round(d.y + Math.sin(a) * 7) - 1, 2, 2, k < n ? 4 : 2);
    }
  }
  function doDig(x, y) {
    var t = now(), e = curEnv(t);
    var r = L.tmapDig(S, view, x, y, { phase: e.phase, weather: e.weather, low: view === 'flat' && !!tideNow(t).low });
    if (r.why === 'none' || r.why === 'far') return;   // an ordinary long press elsewhere: say nothing
    if (!r.ok) { burst(x, y, 4, 2, 25); toast(L.tmapHint(L.tmapById(r.id), r.why), 3000); return; }
    var m = L.tmapById(r.id), w = r.reward, parts = [];
    if (w.gold) parts.push('황금 씨앗 ' + w.gold + '개');
    if (w.deco) parts.push(L.decoById(w.deco).name + (w.stored ? ' · 보관함에' : ' · 마당에'));
    if (w.coins) parts.push('+' + w.coins + '코인');
    burst(x, y, 22, 0, 80); floatText('보물!', x, y - 12);
    toast('★ 보물을 찾았다! · ' + m.name + ' · ' + parts.join(' · '), 4800);
    refresh();
  }

  // ---------- 도감 기록: 보물 지도 + 소문 수첩 ----------
  function trNote(text) { var p = document.createElement('p'); p.className = 'note'; p.textContent = text; dexEl.appendChild(p); }
  function trHead(text, count) {
    var h3 = document.createElement('h3'); h3.textContent = text;
    var b = document.createElement('b'); b.textContent = count; h3.appendChild(b); dexEl.appendChild(h3);
  }
  function rumorFrom(r) {
    if (r.src === 'letter') return '병 편지';
    if (r.src === 'res') { var d = L.residentById(r.who); return d ? d.name : '주민'; }
    var v = L.visitorById(r.who); return v ? v.name : '손님';
  }
  function renderTreasure() {
    trHead('보물 지도', L.tmapDugCount(S) + ' / ' + L.TMAPS.length);
    var shown = 0;
    L.TMAPS.forEach(function (m) {
      var have = L.tmapPieces(S, m.id).length;
      if (!have) return;
      shown++;
      var box = document.createElement('div'); box.className = 'letter';
      var lt = document.createElement('div'); lt.className = 'lt';
      lt.textContent = m.name + ' · ' + (L.tmapDug(S, m.id) ? '파냈다' : have >= m.n ? '완성 · 그려진 곳을 꾹 눌러 파기' : '조각 ' + have + ' / ' + m.n);
      var c = tmapCanvas(m);
      c.style.cssText = 'display:block;width:180px;max-width:100%;height:auto;image-rendering:pixelated;margin:2px auto';
      c.setAttribute('role', 'img'); c.setAttribute('aria-label', m.name + ' 그림');
      box.appendChild(lt); box.appendChild(c); dexEl.appendChild(box);
    });
    if (shown < L.TMAPS.length) trNote((shown ? '아직 못 본 지도 ' + (L.TMAPS.length - shown) + '장 · ' : '') + '낚시 고물·동굴 바위·섬 표류물에서 가끔 지도 조각이 나와요');
    if (shown) trNote('지도에 달·해·빗줄기·안개·물 빠짐 표시가 있으면 그때만 파져요 · 틀린 곳을 파도 잃는 건 없어요');
    trHead('소문 수첩', L.rumorCount(S) + ' / ' + L.RUMORS.length);
    if (!L.rumorCount(S)) { trNote('마을 주민 대화·병 편지·손님에게서 가끔 소문을 들어요'); return; }
    Object.keys(L.RUMOR_ABOUT).forEach(function (a) {
      var got = S.rumor.got.map(L.rumorById).filter(function (r) { return r && r.about === a; });
      if (!got.length) return;
      var box = document.createElement('div'); box.className = 'letter';
      var lt = document.createElement('div'); lt.className = 'lt'; lt.textContent = L.RUMOR_ABOUT[a] + ' · ' + got.length;
      box.appendChild(lt);
      got.forEach(function (r) { var p = document.createElement('p'); p.textContent = r.text + ' (' + rumorFrom(r) + ')'; box.appendChild(p); });
      dexEl.appendChild(box);
    });
  }

  // ---------- console hooks: FF.tmap(id), FF.tmapReset(), FF.rumor(n), FF.dig(id) ----------
  function addTreasureHooks(FF) {
    FF.tmap = function (id) {
      (id ? [L.tmapById(id)] : L.TMAPS).forEach(function (m) {
        if (!m) return;
        var t = L.tmapOf(S); t.p[m.id] = [];
        for (var k = 0; k < m.n; k++) t.p[m.id].push(k);
      });
      refresh(); return S.tmap;
    };
    FF.tmapReset = function () { delete S.tmap; save(); };
    FF.rumor = function (n) {
      var out = [];
      for (n = n || 1; n > 0; n--) {
        var left = L.RUMORS.filter(function (r) { return !L.rumorHeard(S, r.id); });
        if (!left.length) break;
        var r = L.rumorHear(S, left[0].src, left[0].who || null, function () { return 0; });
        if (r) out.push(r.text);
      }
      save(); return out;
    };
    // digs the map's X now (goes to its scene; the time/weather rule still applies)
    FF.dig = function (id) { var m = L.tmapById(id); if (!m) return null; goScene(m.scene); doDig(m.x, m.y); return L.tmapDug(S, id); };
  }

  // ---------- 마당 decorations dug up from maps ----------
  DRAW_DECO.sundial = function (x, y) {
    px(x + 4, y + 8, 6, 6, 4); px(x + 5, y + 9, 4, 4, 2);
    px(x + 1, y + 5, 12, 3, 4); px(x + 2, y + 6, 10, 1, 0);
    px(x + 6, y, 2, 6, 4); px(x + 3, y + 6, 1, 1, 3); px(x + 10, y + 6, 1, 1, 3);
  };
  DRAW_DECO.oldchest = function (x, y) {
    px(x + 1, y, 14, 4, 4); px(x + 2, y + 1, 12, 2, 3);
    px(x, y + 4, 16, 8, 4); px(x + 1, y + 5, 14, 6, 3); px(x + 7, y + 5, 2, 3, 0); px(x + 1, y + 8, 14, 1, 4);
  };
