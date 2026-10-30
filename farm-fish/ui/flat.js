  // ---------- 갯벌 (stage 7): tide scene, dig spots + 도전, flat find art, tide tag, 도감/달력 rows, FF.flat hooks ----------
  // spots: [centre x, ground y] on the mud. What is in a spot comes from logic/flat.js (rolled when first looked at).
  var FLSPOTS = [[24, 84], [72, 78], [130, 86], [40, 130], [98, 122], [150, 134]];
  var FLTRAPS = [[58, 162], [122, 164]];   // 통발 spots near the sand: set at high tide, hauled at low tide
  var tideForce = null;   // FF.tide('low' | 'high') for testing: { low, next, key }
  function flatShown() { return L.flatOk(S); }
  function tideNow(t) {
    if (tideForce && t < tideForce.next) return tideForce;
    tideForce = null;
    return L.tideAt(t, TZ);
  }
  function flatList(t) { var td = tideNow(t); return td.low ? L.flatSpots(S, t, TZ, td) : []; }
  function flatAttention() { var t = now(); return L.flatOk(S) && tideNow(t).low && (flatList(t).length > 0 || L.trapsReady(S, t) > 0); }

  // ---------- pre-rendered flat: sky band, far sea, mud with ripples, rocks, sand strip, tide pole ----------
  var bgFlat = document.createElement('canvas'); bgFlat.width = W; bgFlat.height = H;
  (function paintFlat() {
    var saved = ctx; ctx = bgFlat.getContext('2d');
    px(0, 26, W, 22, 1);
    for (var k = 0; k < 40; k++) px(Math.floor(hash(k * 13 + 1) * W), 28 + Math.floor(hash(k * 7 + 5) * 18), 3 + (k % 3), 1, k % 2 ? 2 : 0);
    px(0, 48, W, 128, 2);
    // mud ripples and wet streaks
    for (var y = 52; y < 176; y += 5) for (var x = (y * 7) % 11; x < W; x += 11) { px(x, y, 4, 1, 3); if ((x + y) % 3 === 0) px(x + 5, y + 2, 3, 1, 1); }
    for (k = 0; k < 90; k++) px(Math.floor(hash(k * 17 + 3) * W), 50 + Math.floor(hash(k * 23 + 9) * 124), 1, 1, k % 3 ? 3 : 4);
    // shoreline foam
    for (x = 0; x < W; x += 3) px(x, 48 + (x % 6 ? 0 : 1), 2, 1, 0);
    // rocks at the edges
    [[2, 104, 14], [166, 70, 12], [160, 160, 16]].forEach(function (r) { px(r[0], r[1], r[2], 6, 4); px(r[0] + 2, r[1] - 2, r[2] - 4, 2, 4); px(r[0] + 3, r[1] - 1, 3, 1, 3); });
    // sand strip at the bottom
    px(0, 176, W, 24, 1);
    for (k = 0; k < 60; k++) px(Math.floor(hash(k * 29 + 7) * W), 178 + Math.floor(hash(k * 31 + 2) * 20), 1, 1, k % 4 ? 2 : 0);
    px(0, 176, W, 1, 3);
    ctx = saved;
  })();
  // the tide pole by the sand: stripes show how deep the water is
  function drawTidePole(low) {
    var x = 172, top = 120;
    px(x, top, 3, 58, 4);
    for (var j = 0; j < 6; j++) px(x - 2, top + 4 + j * 9, 2, 1, 4);
    px(x - 3, top - 2, 9, 2, 4);
    if (!low) px(x + 3, top + 6, 3, 1, 0);
  }

  // ---------- flat find art: drawn at (x = centre, y = ground), about 10×8 ----------
  var FL_KIND = { clam: 'shell', surfclam: 'shell', cockle: 'shell', hardclam: 'shell', rockoyster: 'oyster', penshell: 'fan', razor: 'razor',
    mudcrab: 'crab', fiddler: 'crab', shorecrab: 'crab', bluecrab: 'crab', gatgaje: 'shrimp', lugworm: 'worm', spoonworm: 'worm', whelk: 'snail', turban: 'snail',
    nakji: 'soft', seacuke: 'soft', starfish: 'star', urchin: 'urchin', mudskipper: 'fish', pearl: 'pearl' };
  var FL_FILL = { bluecrab: 1, clam: 1, surfclam: 0, cockle: 2, hardclam: 0, mudcrab: 3, fiddler: 2, shorecrab: 4, lugworm: 3, spoonworm: 2, whelk: 3, turban: 2, nakji: 3, seacuke: 4 };
  var FL_ART = {
    shell: function (x, y, c, id) {
      px(x - 3, y - 6, 7, 1, 4); px(x - 4, y - 5, 9, 4, 4); px(x - 3, y - 5, 7, 3, c);
      for (var k = -2; k <= 2; k += 2) px(x + k, y - 4, 1, 2, id === 'cockle' ? 4 : 3);
      px(x - 2, y - 1, 5, 1, 4);
    },
    oyster: function (x, y) { px(x - 4, y - 5, 8, 4, 4); px(x - 3, y - 4, 6, 2, 1); px(x - 5, y - 3, 2, 2, 3); px(x + 3, y - 6, 2, 2, 3); px(x - 1, y - 4, 2, 1, 0); },
    fan: function (x, y) { for (var j = 0; j < 7; j++) { var w = 1 + j; px(x - Math.floor(w / 2), y - 8 + j, w, 1, j % 2 ? 4 : 3); } px(x - 4, y - 1, 9, 1, 4); },
    razor: function (x, y) { px(x - 6, y - 3, 12, 2, 4); px(x - 5, y - 3, 10, 1, 1); px(x + 5, y - 4, 2, 1, 3); },
    crab: function (x, y, c, id) {
      px(x - 3, y - 4, 7, 3, 4); px(x - 2, y - 4, 5, 2, c);
      px(x - 2, y - 6, 1, 2, 4); px(x + 2, y - 6, 1, 2, 4);
      px(x - 5, y - 5, 2, 2, 4);
      if (id === 'fiddler') { px(x + 4, y - 7, 3, 3, 4); px(x + 5, y - 6, 1, 1, 0); } else px(x + 4, y - 5, 2, 2, 4);
      px(x - 4, y - 1, 1, 1, 4); px(x - 2, y - 1, 1, 1, 4); px(x + 2, y - 1, 1, 1, 4); px(x + 4, y - 1, 1, 1, 4);
    },
    worm: function (x, y, c) { for (var k = 0; k < 10; k++) px(x - 5 + k, y - 3 + Math.round(Math.sin(k * 1.2) * 1.5), 1, 2, c); px(x + 4, y - 4, 1, 1, 4); },
    snail: function (x, y, c) { px(x - 3, y - 4, 6, 3, 4); px(x - 2, y - 6, 4, 2, 4); px(x - 1, y - 8, 2, 2, 4); px(x - 2, y - 4, 4, 2, c); px(x - 1, y - 6, 2, 1, c); px(x + 3, y - 2, 2, 1, 3); },
    soft: function (x, y, c, id) {
      if (id === 'seacuke') { px(x - 5, y - 4, 10, 3, 4); px(x - 4, y - 5, 8, 1, 4); for (var j = -4; j < 5; j += 2) px(x + j, y - 6, 1, 1, 3); return; }
      px(x - 2, y - 9, 5, 4, 4); px(x - 1, y - 8, 3, 2, c); px(x - 1, y - 7, 1, 1, 0); px(x + 1, y - 7, 1, 1, 0);
      for (var k = -3; k <= 3; k += 2) { px(x + k, y - 5, 1, 3, 4); px(x + k + (k < 0 ? -1 : 1), y - 2, 1, 1, 4); }
    },
    shrimp: function (x, y) { for (var k = 0; k < 5; k++) px(x - 5 + k * 2, y - 4 + (k === 0 ? 1 : 0), 2, 3, k % 2 ? 4 : 3); px(x + 4, y - 6, 1, 3, 4); px(x + 5, y - 6, 2, 1, 4); px(x - 6, y - 2, 2, 1, 4); },
    star: function (x, y) { px(x, y - 8, 1, 7, 4); px(x - 4, y - 5, 9, 1, 4); px(x - 3, y - 2, 2, 1, 4); px(x + 2, y - 2, 2, 1, 4); px(x - 1, y - 5, 3, 2, 3); },
    urchin: function (x, y) { px(x - 3, y - 6, 7, 5, 4); for (var k = 0; k < 8; k++) { var a = k * Math.PI / 4; px(x + Math.round(Math.cos(a) * 5), y - 4 + Math.round(Math.sin(a) * 4), 1, 1, 4); } px(x - 1, y - 5, 1, 1, 2); },
    fish: function (x, y) { px(x - 4, y - 4, 7, 3, 3); px(x - 5, y - 3, 1, 1, 3); px(x + 3, y - 5, 2, 2, 4); px(x + 4, y - 5, 1, 1, 0); px(x - 1, y - 5, 2, 1, 4); px(x - 3, y - 1, 2, 1, 4); },
    pearl: function (x, y) { px(x - 4, y - 3, 9, 2, 4); px(x - 3, y - 3, 7, 1, 1); px(x - 2, y - 7, 4, 4, 4); px(x - 1, y - 6, 2, 2, 0); px(x - 1, y - 6, 1, 1, 1); }
  };
  function drawFlatFind(id, x, y) {
    var k = FL_KIND[id];
    if (k) FL_ART[k](x, y, FL_FILL[id] !== undefined ? FL_FILL[id] : 1, id);
  }
  function flatIcon(id, unknown) {
    var c = document.createElement('canvas'); c.width = 14; c.height = 14;
    var saved = ctx; ctx = c.getContext('2d');
    try { drawFlatFind(id, 7, 12); } finally { ctx = saved; }
    if (unknown) { var g = c.getContext('2d'); g.globalCompositeOperation = 'source-in'; g.fillStyle = G[2]; g.fillRect(0, 0, W, H); }
    return c;
  }
  // new dishes in the 바구니/도감
  DISH_TOP.jogaetang = ['.020020.', '2000000002'];
  DISH_TOP.pajeon = ['.333333.', '3323332333'];
  DISH_TOP.nakjibok = ['.434434.', '3343443433'];

  // ---------- 갯벌 scene ----------
  function drawFlat(tt) {
    var t = now(), e = curEnv(t), night = e.phase === 'night', td = tideNow(t);
    ctx.drawImage(bgFlat, 0, 0);
    drawSky(tt, e.phase);
    if (td.low) {
      flatList(t).forEach(function (p) {
        var sp = FLSPOTS[p.k], f = L.flatById(p.id), x = sp[0], y = sp[1];
        var shake = chal && chal.kind === 'flat' && chal.k === p.k ? Math.round(Math.sin(tt * 30)) : 0;
        px(x - 6 + shake, y - 3, 13, 5, 1); px(x - 5 + shake, y - 4, 11, 1, 1); px(x - 5 + shake, y + 2, 11, 1, 1);   // wet ring
        px(x - 3 + shake, y - 1, 7, 2, 4); px(x - 2 + shake, y - 2, 5, 1, 3);
        // bubbles rising from the hole; crabs peek out now and then
        var ph = (tt * 0.9 + p.k * 0.37) % 1;
        px(x - 1 + Math.round(Math.sin(tt * 3 + p.k)), y - 3 - Math.round(ph * 7), 1, 1, 0);
        if (ph > 0.5) px(x + 2, y - 3 - Math.round((ph - 0.5) * 8), 1, 1, 0);
        if (FL_KIND[p.id] === 'crab' && (tt + p.k) % 4 < 1) { px(x - 2, y - 4, 1, 2, 4); px(x + 2, y - 4, 1, 2, 4); }
        if (f.rarity === '희귀' || f.rarity === '전설') sparkle(x + 6, y - 8, tt + p.k * 0.4);
      });
      // a thin strip of sea far out, lapping
      for (var x = 0; x < W; x += 6) px((x + Math.floor(tt * 4)) % W, 47, 3, 1, 0);
    } else {
      // high tide: water over the mud up to the sand, waves rolling in
      px(0, 40, W, 136, 1);
      for (var y = 44; y < 174; y += 6) for (var x2 = 0; x2 < W; x2 += 14) {
        var xx = (x2 + Math.floor(tt * 6) + y * 3) % (W + 14) - 7;
        px(xx, y + Math.round(Math.sin(tt * 2 + y) * 1), 6, 1, (y / 6) % 2 ? 2 : 0);
      }
      for (var k = 0; k < W; k += 4) px(k, 174 + (Math.floor(tt * 3 + k / 4) % 2), 3, 1, 0);
    }
    drawTraps(tt, td.low);
    drawTidePole(td.low);
    drawYardWeather(tt, e.weather);
    if (night || e.phase === 'evening') { ctx.globalAlpha = night ? 0.34 : 0.12; px(0, 0, W, H, 4); ctx.globalAlpha = 1; }
    if (night) drawStars(tt);
  }
  function drawTraps(tt, low) {
    var traps = S.flat ? S.flat.traps : [null, null], t = now();
    FLTRAPS.forEach(function (sp, k) {
      var p = traps[k], x = sp[0], y = sp[1];
      if (!low) {
        if (p) { var b = Math.round(Math.sin(tt * 2 + k)); px(x, y - 8 + b, 1, 8 - b, 3); px(x - 2, y - 11 + b, 5, 3, 4); px(x - 1, y - 10 + b, 3, 1, 0); }
        else if (Math.floor(tt * 1.5 + k) % 2) { px(x - 4, y - 2, 3, 1, 3); px(x + 2, y - 2, 3, 1, 3); px(x, y - 5, 1, 2, 3); px(x, y, 1, 2, 3); }
        return;
      }
      if (!p) return;
      px(x - 6, y - 7, 13, 7, 4); px(x - 5, y - 6, 11, 5, 2);
      for (var j = -3; j <= 3; j += 3) px(x + j, y - 6, 1, 5, 4);
      var n = L.trapCount(p, t);
      for (var m = 0; m < n; m++) px(x - 4 + m * 3, y - 3, 2, 2, 0);
      if (n) sparkle(x + 8, y - 9, tt + k);
    });
  }
  function tapTrap(x, y, t, td) {
    for (var k = 0; k < FLTRAPS.length; k++) {
      var sp = FLTRAPS[k], p = S.flat ? S.flat.traps[k] : null;
      if (!hit([sp[0] - 9, sp[1] - 13, 18, 16], x, y, 2)) continue;
      if (!td.low) {
        if (p) { toast('통발 · 썰물이 되면 걷어요 · 지금 ' + L.trapCount(p, t) + '마리쯤 (최대 ' + L.TRAP_CAP + ')', 2400); return true; }
        if (!L.setTrap(S, k, t, TZ, td).ok) return true;
        burst(sp[0], sp[1] - 6, 8, 0, 40);
        toast('통발을 놓았다 · 물이 빠지면 걷으러 와요', 2400); refresh();
        return true;
      }
      if (!p) return false;
      if (bagStop()) return true;
      var r = L.pullTrap(S, k, t, Math.random, TZ, td);
      if (!r) return true;
      if (!r.got.length) { toast('통발이 아직 비었다 · 밀물이 한 번 더 지나면', 2200); return true; }
      burst(sp[0], sp[1] - 6, 12, 3, 50);
      floatText('+' + r.got.length, sp[0], sp[1] - 16);
      toast('통발을 걷었다 · ' + r.got.map(function (id) { return L.flatById(id).name; }).join(', ') + (r.sold ? ' · 꽉 차서 바로 팔았다 +' + r.sold : ''), 3000);
      refresh();
      return true;
    }
    return false;
  }
  function tapFlat(x, y) {
    var t = now(), td = tideNow(t);
    if (tapTrap(x, y, t, td)) return;
    if (!td.low) { toast('밀물 · 다음 썰물까지 ' + fmtLeft(Math.max(0, td.next - t)) + ' · 모래 가 표시에 통발을 놓을 수 있어요', 2800); return; }
    var list = flatList(t);
    for (var j = 0; j < list.length; j++) {
      var sp = FLSPOTS[list[j].k];
      if (!hit([sp[0] - 8, sp[1] - 12, 16, 15], x, y, 2)) continue;
      if (bagStop()) return;
      chal = { kind: 'flat', k: list[j].k, x: sp[0], y: sp[1] - 12, g: L.flatGame(list[j].id, performance.now(), Math.random), hinted: false };
      return;
    }
    toast(list.length ? '거품이 이는 구멍을 누르면 캐기 · 꾹 누르면 도전 (표시 칸에서 떼면 두 배)' : '다 캤다 · 조금 뒤 다시 구멍이 생긴다 · 썰물 ' + fmtLeft(Math.max(0, td.next - t)) + ' 남음', 2600);
  }
  // called by chFinish (ui/forest.js) when a 갯벌 dig ends
  var flatLastDug = null;
  function finishFlat(c, res) {
    var won = res === 'win', r = L.digFlat(S, c.k, now(), Math.random, won);
    if (!r) { toast('물이 들어와 구멍이 잠겼다', 2000); return; }
    var f = L.flatById(r.id);
    flatLastDug = { id: r.id, at: performance.now() };
    burst(c.x, c.y + 8, won ? 16 : 8, won ? 4 : 3, won ? 70 : 40);
    floatText((won ? '★' : '+') + f.name + (r.n > 1 ? '×' + r.n : ''), c.x, c.y - 6);
    var tail = r.sold ? ' · 바구니가 꽉 차 바로 팔았다 +' + r.sold : r.first ? ' · 갯벌 도감 등록!' : ' · 바구니에';
    if (won) toast('도전 성공! ' + f.name + (r.n > 1 ? ' 두 개' : ' 하나 · 이번엔 덤이 없었다') + tail, 2600);
    else toast((res === 'miss' ? '아깝다 · ' : '') + f.name + (f.rarity !== '흔함' ? ' (' + f.rarity + ')' : '') + tail, 2200);
    refresh();
  }

  // ---------- tide tag (bottom bar while on the 갯벌) and tick ----------
  var tideTag = document.createElement('div');
  tideTag.id = 'tideTag'; tideTag.hidden = true;
  var tideTagB = document.createElement('b'), tideTagS = document.createElement('span');
  tideTag.appendChild(tideTagB); tideTag.appendChild(tideTagS);
  app.appendChild(tideTag);
  var flatWasLow = null, flatNewSeen = {};
  function tickFlatUI(t) {
    if (chal && chal.kind === 'flat' && view !== 'flat') chal = null;
    var on = view === 'flat';
    tideTag.hidden = !on;
    if (!L.flatOk(S)) return;
    var td = tideNow(t), left = fmtLeft(Math.max(0, td.next - t));
    var turned = flatWasLow !== null && flatWasLow !== td.low;
    flatWasLow = td.low;
    // low tide starting anywhere else: one calm line (the 이동 menu dot stays on while there is something to dig)
    if (!on) { if (turned && td.low && booted && !reel) toast('썰물이 시작됐어요 · 이동 → 갯벌', 3000); return; }
    var nt = S.flat ? S.flat.traps.filter(Boolean).length : 0;
    tideTagB.textContent = td.low ? '썰물 · 물이 빠졌다' + (L.trapsReady(S, t) ? ' · 통발 걷기' : '') : '밀물 · 통발 ' + nt + ' / ' + L.TRAP_N;
    tideTagS.textContent = td.low ? '물 들어오기까지 ' + left : '다음 썰물까지 ' + left;
    if (turned) toast(td.low ? '썰물 · 갯벌이 드러났다 · 거품 이는 구멍을 캐 보자' : '밀물 · 물이 들어온다 · 통발을 놓아 두자', 2600);
    if (!td.low) return;
    // 첫 만남: one calm line per low tide when something not dug yet hides here
    var list = flatList(t), key = 'k' + td.key;
    if (!flatNewSeen[key] && list.some(function (p) { return !(S.flat && S.flat.dex[p.id]); }) && !toastEl.classList.contains('on')) {
      flatNewSeen = {}; flatNewSeen[key] = true;
      toast('처음 보는 게 숨어 있는 것 같다… 반짝이는 구멍도 살펴보자', 3000);
    }
  }

  // ---------- 도감 갯벌 section, 달력 rows ----------
  function flatCond(f) {
    if (f.trap) return '통발에만';
    var out = [];
    if (f.season) out.push(f.season.map(function (x) { return L.SEASON_NAME[x]; }).join('·'));
    if (f.phase) out.push(f.phase.map(function (x) { return L.PHASE_NAME[x]; }).join('·') + ' 썰물');
    return out.length ? out.join(' · ') : '썰물 때 언제나';
  }
  function renderFlatDex(row) {
    var h3 = document.createElement('h3'); h3.textContent = '갯벌';
    var b = document.createElement('b'); b.textContent = L.flatDexCount(S) + ' / ' + L.FLAT.length; h3.appendChild(b);
    dexEl.appendChild(h3);
    if (!L.flatOk(S)) { var p = document.createElement('p'); p.className = 'note'; p.textContent = '바다 낚시터를 열면 썰물 때 갯벌에 갈 수 있어요'; dexEl.appendChild(p); }
    L.FLAT.forEach(function (f) {
      var n = S.flat ? S.flat.dex[f.id] || 0 : 0, ic = flatIcon(f.id, !n); ic.className = 'sq';
      row(ic, n ? (f.rarity === '희귀' || f.rarity === '전설' ? '★ ' : '') + f.name : '???',
        n ? f.rarity + ' · ' + flatCond(f) + ' · ' + f.price + '코인' : f.hint, n ? n + '개' : '', !n);
    });
  }
  function renderFlatNow() {
    var t = now(), td = tideNow(t), e = curEnv(t);
    var h3 = document.createElement('h3'); h3.textContent = '갯벌';
    var hb = document.createElement('b'); hb.textContent = !L.flatOk(S) ? '바다를 열면' : td.low ? '지금 썰물' : '밀물'; h3.appendChild(hb);
    calEl.appendChild(h3);
    var at = new Date(td.next), hm = at.getHours() + ':' + String(at.getMinutes()).padStart(2, '0');
    note(td.low ? '썰물 · ' + fmtLeft(Math.max(0, td.next - t)) + ' 뒤 물이 들어와요 (' + hm + ')' : '다음 썰물 · ' + fmtLeft(Math.max(0, td.next - t)) + ' 뒤 (' + hm + ') · 한 시간에 두 번, 15분씩');
    if (S.flat && S.flat.traps.some(Boolean)) note('통발 · 지금 ' + L.trapsReady(S, t) + '마리쯤 · 썰물에 걷어요');
    else if (L.flatOk(S)) note('밀물 때 갯벌 모래 가에 통발을 놓으면 썰물에 걷을 수 있어요');
    L.FLAT.filter(function (f) { return f.phase && L.flatWeight(f, e) > 0; }).forEach(function (f) {
      var got = S.flat && S.flat.dex[f.id];
      var r = document.createElement('div'); r.className = 'dx' + (got ? '' : ' unk');
      var ic = flatIcon(f.id, !got); ic.className = 'sq';
      var n = document.createElement('div'); n.className = 'n'; n.textContent = got ? f.name : '???';
      var s3 = document.createElement('small'); s3.textContent = got ? flatCond(f) : f.hint; n.appendChild(s3);
      var v = document.createElement('div'); v.className = 'v'; v.textContent = f.rarity;
      r.appendChild(ic); r.appendChild(n); r.appendChild(v); calEl.appendChild(r);
    });
  }

  // ---------- console hooks ----------
  function addFlatHooks(FF) {
    FF.flat = function () { if (!L.flatOk(S)) { S.spotOk = S.spotOk || {}; S.spotOk.sea = true; } goScene('flat'); refresh(); return tideNow(now()); };
    // FF.tide('low') drains the flat for a low tide now, FF.tide('high') floods it for 5; FF.tide() back to the clock
    var forced = 0;
    FF.tide = function (w) {
      if (w === 'low') tideForce = { low: true, next: now() + L.TIDE_LEN, key: -1 - (forced++) };   // 15 minutes
      else if (w === 'high') tideForce = { low: false, next: now() + 300e3 };
      else tideForce = null;
      return tideNow(now());
    };
    // FF.trap() sets both traps full (as if left a long time)
    FF.trap = function () {
      if (!L.flatOk(S)) FF.flat();
      var high = { low: false, next: now() + 1000 };
      for (var k = 0; k < L.TRAP_N; k++) { L.setTrap(S, k, now(), TZ, high); S.flat.traps[k].at = now() - L.TRAP_CAP * L.TRAP_EVERY; }
      refresh(); return L.trapsReady(S, now());
    };
    // FF.flatFind(id) puts id in every open spot; FF.flatFind('all') fills the 갯벌 도감
    FF.flatFind = function (id) {
      if (!L.flatOk(S)) FF.flat();
      if (id === 'all') { flatList(now()); L.FLAT.forEach(function (f) { S.flat.dex[f.id] = (S.flat.dex[f.id] || 0) + 1; }); refresh(); return L.flatDexCount(S); }
      var list = flatList(now());
      if (L.flatById(id)) list.forEach(function (p) { S.flat.spots[p.k].id = id; });
      return flatList(now());
    };
  }
