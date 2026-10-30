  // ---------- 과수원 scene (stage 6A): fruit trees in two rows, beehives along the top, sapling sheet ----------
  // trees: [centre x, ground y]; hives: [left x, bottom y]
  var OTREES = [[20, 112], [55, 108], [90, 112], [125, 108], [160, 112], [20, 176], [55, 172], [90, 176], [125, 172], [160, 176]];
  var OHIVES = [[26, 58], [50, 58], [74, 58]];
  var OGATE = { x: 76, y: 116, w: 28, h: 26 };
  function orchardShown() { return L.orchardOk(S) || S.rep >= L.ORCHARD_REP; }
  function orchardAttention() { return L.orchardOk(S) && (L.fruitWaiting(S) > 0 || L.honeyWaiting(S) > 0); }
  // days/hours for slow things (tree growth); ?speed shortens them like every other timer
  function fmtLong(ms) {
    var m = Math.ceil(ms / 60e3 / SPEED), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
    return d ? d + '일 ' + h + '시간' : h ? h + '시간 ' + (m % 60) + '분' : (m % 60) + '분';
  }

  // ---------- pre-rendered orchard ground ----------
  var bgOrchard = document.createElement('canvas'); bgOrchard.width = W; bgOrchard.height = H;
  (function paintOrchard() {
    var saved = ctx; ctx = bgOrchard.getContext('2d');
    for (var x = 0; x < W; x++) { var hh = Math.round(3 + Math.sin(x / 13 + 2) * 2 + Math.sin(x / 5) * 1); px(x, 26 - hh, 1, hh, (x + hh) % 3 ? 1 : 2); }
    px(0, 26, W, 1, 3);
    for (var k = 0; k < 260; k++) {
      var gx = Math.floor(hash(k * 7 + 11) * W), gy = 28 + Math.floor(hash(k * 17 + 3) * (H - 28));
      px(gx, gy, 1, 1, hash(k * 5 + 1) < 0.7 ? 1 : 2);
    }
    // mown rows between the trees and a low stone wall behind the hives
    [116, 180].forEach(function (y) { for (var x2 = 4; x2 < W - 4; x2 += 3) px(x2, y, 2, 1, 2); });
    for (var x3 = 4; x3 < 100; x3 += 7) { px(x3, 61, 6, 3, 2); px(x3, 61, 6, 1, 1); px(x3 + 6, 61, 1, 3, 3); }
    // little sign by the gate post
    px(132, 46, 22, 9, 4); px(133, 47, 20, 7, 0); px(142, 55, 2, 8, 4);
    for (var j = 0; j < 3; j++) px(136 + j * 5, 49 + (j % 2), 3, 2, 3);
    ctx = saved;
  })();

  // ---------- trees ----------
  // fruit look: [colour, outline]
  var FRUIT_C = { maesil: [2, 3], apricot: [1, 3], cherry: [4, 4], peach: [1, 3], plum: [3, 4], apple: [4, 4], pear: [0, 3], persimmon: [3, 4], tangerine: [2, 4], yuja: [1, 4] };
  var FRUIT_AT = [[-6, -20], [4, -24], [-2, -14], [7, -16]];
  function fruitDot(x, y, id) { var c = FRUIT_C[id] || [3, 4]; px(x - 2, y - 1, 5, 4, 4); px(x - 1, y - 2, 3, 6, 4); px(x - 1, y, 3, 2, c[0] === 4 ? 3 : c[0]); px(x - 1, y - 1, 1, 1, 0); px(x, y - 3, 1, 1, 4); }
  function drawTree(p, x, y, tt, season) {
    var d = L.treeById(p.id), st = L.treeStage(p, now());
    px(x - 6, y + 1, 13, 1, 2);
    if (st === 0) {
      px(x, y - 8, 1, 8, 4); px(x - 2, y - 7, 2, 1, 3); px(x + 1, y - 5, 2, 1, 3); px(x - 1, y - 9, 3, 1, 3);
      px(x - 3, y - 1, 7, 1, 4); px(x - 2, y, 5, 1, 3);   // a stake and a tie
      return;
    }
    var big = st === 2, tw = big ? 3 : 2, th = big ? 12 : 9, rx = big ? 11 : 7, ry = big ? 10 : 7, cy = y - th - ry + 2;
    px(x - Math.floor(tw / 2), y - th, tw, th, 4);
    var bare = season === 'winter' && d.fruit !== 'winter' && d.bloom !== 'winter';
    if (bare) {
      for (var b = 0; b < 4; b++) { var bx = x + (b % 2 ? 1 : -1) * (2 + b * 2); px(Math.min(x, bx), y - th - 2 - b * 3, Math.abs(bx - x) + 1, 1, 4); px(bx, y - th - 4 - b * 3, 1, 3, 4); }
      px(x - rx + 3, cy - 1, rx * 2 - 6, 1, 0);   // snow on the twigs
      return;
    }
    for (var r = -ry; r <= ry; r++) {
      var hw = Math.round(rx * Math.sqrt(1 - (r * r) / (ry * ry)));
      px(x - hw, cy + r, hw * 2 + 1, 1, Math.abs(r) >= ry - 1 ? 4 : 2); px(x - hw, cy + r, 1, 1, 4); px(x + hw, cy + r, 1, 1, 4);
    }
    for (var k = 0; k < 6; k++) px(x - rx + 2 + Math.floor(hash(p.id.length * 7 + k * 13) * (rx * 2 - 3)), cy - ry + 3 + Math.floor(hash(k * 29 + x) * (ry * 2 - 4)), 2, 1, 3);
    if (big && d.bloom === season) for (k = 0; k < 7; k++) {
      var fx = x - rx + 2 + Math.floor(hash(k * 41 + x) * (rx * 2 - 3)), fy = cy - ry + 2 + Math.floor(hash(k * 17 + y) * (ry * 2 - 3));
      px(fx, fy, 2, 2, 0); if ((Math.floor(tt) + k) % 5 === 0) px(fx + 1, fy + 1, 1, 1, 1);
    }
    for (k = 0; k < Math.min(p.n, FRUIT_AT.length); k++) fruitDot(x + FRUIT_AT[k][0], cy + ry + FRUIT_AT[k][1] + 10, d.id);
    if (p.n) sparkle(x + rx, cy - ry + 2, tt + x * 0.01);
  }
  function drawPlotMark(x, y) { px(x - 4, y, 9, 1, 3); px(x - 3, y - 1, 7, 1, 2); px(x, y - 4, 1, 3, 2); px(x - 1, y - 3, 3, 1, 2); }

  // ---------- hives ----------
  function drawHive(k, x, y, tt, night) {
    var h = S.bees && S.bees.hives[k];
    if (!h) {
      if (k === L.hiveCount(S)) { for (var j = 0; j < 16; j += 2) { px(x + j, y - 14, 1, 1, 3); px(x + j + 1, y, 1, 1, 3); } px(x, y - 13, 1, 13, 3); px(x + 15, y - 13, 1, 13, 3); px(x + 7, y - 9, 2, 6, 3); px(x + 5, y - 7, 6, 2, 3); }
      return;
    }
    px(x, y, 16, 1, 4); px(x + 1, y - 2, 2, 2, 4); px(x + 13, y - 2, 2, 2, 4);
    px(x, y - 16, 16, 3, 4); px(x + 1, y - 17, 14, 1, 4);
    px(x + 1, y - 13, 14, 11, 4); px(x + 2, y - 12, 12, 9, 1);
    px(x + 2, y - 9, 12, 1, 3); px(x + 2, y - 6, 12, 1, 3);
    px(x + 6, y - 4, 4, 2, 4);
    if (h.jar.length) { px(x + 12, y - 22, 4, 4, 4); px(x + 13, y - 21, 2, 2, 1); if (h.jar.length > 1) px(x + 7, y - 21, 4, 3, 4); sparkle(x + 17, y - 18, tt + k); }
    if (!night) for (var b = 0; b < 2; b++) { var a = tt * 2.3 + b * 3 + k; px(x + 8 + Math.round(Math.cos(a) * 9), y - 10 + Math.round(Math.sin(a * 1.7) * 6), 1, 1, 4); }
  }

  // ---------- scene ----------
  function drawOrchard(tt, dt) {
    var e = curEnv(now()), night = e.phase === 'night';
    ctx.drawImage(bgOrchard, 0, 0);
    drawSky(tt, e.phase);
    if (!L.orchardOk(S)) drawOrchardGate(tt);
    else {
      OHIVES.forEach(function (h, k) { drawHive(k, h[0], h[1], tt, night); });
      OTREES.forEach(function (sp, k) {
        var p = S.orchard.trees[k];
        if (p) drawTree(p, sp[0], sp[1], tt, e.season); else drawPlotMark(sp[0], sp[1]);
      });
    }
    drawYardWeather(tt, e.weather);
    if (e.weather === 'snow' || e.season === 'winter') for (var k = 0; k < 40; k++) px(Math.floor(hash(k * 23 + 9) * W), 30 + Math.floor(hash(k * 31 + 2) * (H - 30)), 2, 1, 0);
    if (night || e.phase === 'evening') { ctx.globalAlpha = night ? 0.34 : 0.12; px(0, 0, W, H, 4); ctx.globalAlpha = 1; }
    if (night) drawStars(tt);
  }
  function drawOrchardGate(tt) {
    for (var x = 0; x < W; x += 6) px(x, 132 + (x % 12 ? 1 : 0), 4, 1, 4);
    var g = OGATE;
    px(g.x + 13, g.y + 8, 2, 18, 4);
    px(g.x, g.y, g.w, 10, 4); px(g.x + 1, g.y + 1, g.w - 2, 8, 0);
    fruitDot(g.x + 7, g.y + 5, 'apple'); fruitDot(g.x + 14, g.y + 5, 'pear'); fruitDot(g.x + 21, g.y + 5, 'persimmon');
    sparkle(g.x + g.w + 3, g.y - 1, tt);
  }
  function tapOrchard(x, y) {
    var t = now();
    if (!L.orchardOk(S)) {
      if (!hit([OGATE.x - 6, OGATE.y - 6, OGATE.w + 12, OGATE.h + 12], x, y)) { toast('과수원 자리 · 팻말을 눌러 보자', 2000); return; }
      var st = L.orchardStatus(S);
      if (st === 'rep') { toast('신뢰도 ★' + L.ORCHARD_REP + '이 되면 열 수 있어요', 2400); return; }
      if (st === 'coins') { toast('과수원 일구기 · ' + L.ORCHARD_COST + '코인 필요해요', 2400); return; }
      confirmBuy('orchard', '과수원 일구기', L.ORCHARD_COST, function () {
        var r = L.unlockOrchard(S);
        if (!r.ok) { toast(WHY[r.why] || '열 수 없어요'); return; }
        burst(OGATE.x + 14, OGATE.y + 6, 16, 0, 70);
        toast('★ 과수원이 생겼다 · 빈 자리를 눌러 묘목 심기', 3600); refresh();
      });
      return;
    }
    for (var k = 0; k < OHIVES.length; k++) {
      var hv = OHIVES[k];
      if (!hit([hv[0] - 2, hv[1] - 24, 22, 27], x, y)) continue;
      tapHive(k); return;
    }
    for (k = 0; k < OTREES.length; k++) {
      var sp = OTREES[k];
      if (!hit([sp[0] - 13, sp[1] - 36, 26, 39], x, y)) continue;
      var p = S.orchard.trees[k];
      if (!p) { openSaplings(k); return; }
      if (p.n && bagStop()) return;
      var d = L.treeById(p.id), r2 = L.pickFruit(S, k, t, TZ);
      if (r2) {
        burst(sp[0], sp[1] - 18, 10, 0, 50);
        floatText('+' + d.name + (r2.n > 1 ? '×' + r2.n : ''), sp[0], sp[1] - 30);
        toast(d.name + ' ' + r2.n + '개 · ' + (r2.sold ? '바구니가 꽉 차 바로 팔았다 +' + r2.sold : '바구니에'), 2200);
        refresh(); return;
      }
      openTree(k); return;
    }
    toast(L.fruitWaiting(S) || L.honeyWaiting(S) ? '반짝이는 나무와 벌통을 눌러 거두기' : '빈 자리는 묘목 · 위쪽 점선은 벌통 자리', 2400);
  }
  function tapHive(k) {
    var h = S.bees && S.bees.hives[k];
    if (!h) {
      if (k !== L.hiveCount(S)) return;
      var c = L.hiveCost(S);
      if (S.coins < c) { toast('벌통 · ' + c.toLocaleString('ko-KR') + '코인 필요해요', 2200); return; }
      confirmBuy('hive' + k, '벌통', c, function () {
        var r = L.buyHive(S, now());
        if (!r.ok) { toast(WHY[r.why] || '살 수 없어요'); return; }
        toast('벌통을 놓았다 · 주변 꽃에 따라 꿀이 달라져요', 3000); refresh();
      });
      return;
    }
    if (S.bees.hives[k] && S.bees.hives[k].jar.length && bagStop()) return;
    var got = L.collectHoney(S, k, now(), TZ, Math.random);
    if (!got) {
      var se = curEnv(now()).season, fl = L.honeySources(S, se, now()).filter(function (x) { return x.id !== 'wildhoney'; });
      toast('꿀 모으는 중 · 지금 꽃: ' + (fl.length ? fl.map(function (x) { return L.honeyById(x.id).name.replace('꿀', ''); }).join('·') : '들꽃뿐'), 2600);
      return;
    }
    var hv = OHIVES[k], names = {};
    got.items.forEach(function (id) { names[id] = (names[id] || 0) + 1; });
    burst(hv[0] + 8, hv[1] - 14, 10, 4, 40);
    floatText('+꿀 ' + got.items.length, hv[0] + 8, hv[1] - 26);
    toast((got.first.length ? '★ 새 꿀 · ' : '') + Object.keys(names).map(function (id) { return L.honeyById(id).name + (names[id] > 1 ? '×' + names[id] : ''); }).join(', ') +
      (got.sold ? ' · 바로 팔았다 +' + got.sold : ''), 2800);
    refresh();
  }

  // ---------- sapling sheet (reuses the 마당 sheet frame) ----------
  var saplingAt = -1;
  function openSaplings(k) {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true;
    saplingAt = k; sheetKind = 'sapling'; sheetEl.hidden = false;
    renderSaplings(); sheetEl.scrollTop = 0;
  }
  function renderSaplings() {
    sheetHead('묘목 심기');
    var p = document.createElement('p'); p.className = 'note';
    p.textContent = '며칠 지나면 나무가 되고, 제철마다 열매가 열려요 · 나무는 죽지 않아요';
    sheetEl.appendChild(p);
    L.TREES.forEach(function (d) {
      var se = L.SEASON_NAME, r = sheetRow(fruitIcon(d.id), d.name + ' 묘목', se[d.bloom] + ' 꽃 · ' + se[d.fruit] + ' 열매 · 다 크는 데 ' + Math.round(d.grow / 86400e3) + '일 · 열매 ' + d.price + '코인');
      var b = document.createElement('button'); b.type = 'button';
      b.textContent = d.cost.toLocaleString('ko-KR'); b.setAttribute('aria-label', d.name + ' 묘목 심기 ' + d.cost + '코인');
      if (S.coins < d.cost) b.classList.add('poor');
      b.addEventListener('click', function () {
        var res = L.plantTree(S, saplingAt, d.id, now());
        if (!res.ok) { toast(WHY[res.why] || '심을 수 없어요'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
        closeSheet();
        var sp = OTREES[saplingAt]; burst(sp[0], sp[1] - 4, 8, 3, 30);
        toast(d.name + ' 묘목을 심었다 · ' + fmtLong(d.grow) + ' 뒤 나무가 돼요', 2800); refresh();
      });
      r.appendChild(b);
    });
  }

  // ---------- tree sheet: how it is doing + 옮겨 심기 (pull it up, sapling price back) ----------
  function treeNote(p, t) {
    var d = L.treeById(p.id), stg = L.treeStage(p, t), se = L.SEASON_NAME;
    if (stg < 2) return (stg ? '어린 나무' : '묘목') + ' · 다 크기까지 ' + fmtLong(p.at + d.grow - t);
    if (curEnv(t).season !== d.fruit) return '열매는 ' + se[d.fruit] + '에 · 꽃은 ' + se[d.bloom] + '에';
    return '익는 중 · 다음 열매까지 ' + fmtLeft(Math.max(0, L.FRUIT_EVERY - p.acc));
  }
  function openTree(k) {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true;
    saplingAt = k; sheetKind = 'tree'; sheetEl.hidden = false;
    renderTree(); sheetEl.scrollTop = 0;
  }
  function renderTree() {
    var p = S.orchard && S.orchard.trees[saplingAt];
    if (!p) { closeSheet(); return; }
    var d = L.treeById(p.id);
    sheetHead(d.name + ' 나무');
    var note = document.createElement('p'); note.className = 'note'; note.textContent = treeNote(p, now());
    sheetEl.appendChild(note);
    var r = sheetRow(fruitIcon(d.id), '옮겨 심기', '나무를 뽑고 묘목값 ' + d.cost.toLocaleString('ko-KR') + '코인을 돌려받아요 · 빈 자리에 다른 나무를 심을 수 있어요');
    var b = document.createElement('button'); b.type = 'button';
    b.textContent = '뽑기'; b.setAttribute('aria-label', d.name + ' 나무 뽑기 · ' + d.cost + '코인 돌려받기');
    b.addEventListener('click', function () {
      var res = L.uprootTree(S, saplingAt, now(), TZ);
      closeSheet();
      if (!res) return;
      var sp = OTREES[saplingAt]; burst(sp[0], sp[1] - 4, 8, 3, 30);
      toast(d.name + ' 나무를 뽑았다 · +' + res.coins.toLocaleString('ko-KR') + (res.fruit ? ' · 열매 ' + res.fruit.n + '개는 바구니에' : '') + ' · 빈 자리를 눌러 새로 심기', 3000);
      refresh();
    });
    r.appendChild(b);
  }

  // ---------- icons (dex, basket, sheet) ----------
  function fruitIcon(id) {
    var c = document.createElement('canvas'); c.width = 14; c.height = 14;
    var saved = ctx; ctx = c.getContext('2d');
    try {
      var f = FRUIT_C[id] || [3, 4];
      px(4, 4, 7, 8, f[1]); px(3, 6, 9, 4, f[1]); px(5, 5, 5, 6, f[0]); px(4, 7, 7, 2, f[0]); px(5, 5, 1, 1, 0);
      px(7, 1, 1, 3, 4); px(8, 2, 3, 1, 3); px(9, 1, 2, 1, 3);
      if (id === 'cherry') { ctx.clearRect(0, 0, 14, 14); px(2, 8, 4, 4, 4); px(8, 8, 4, 4, 4); px(3, 9, 1, 1, 0); px(9, 9, 1, 1, 0); px(4, 3, 1, 5, 3); px(9, 3, 1, 5, 3); px(5, 2, 4, 1, 3); }
    } finally { ctx = saved; }
    return c;
  }
  function honeyIcon(id) {
    var c = document.createElement('canvas'); c.width = 14; c.height = 14;
    var saved = ctx; ctx = c.getContext('2d');
    try {
      var h = 0; for (var k = 0; k < id.length; k++) h = (h * 31 + id.charCodeAt(k)) | 0;
      var shade = [1, 2, 3][Math.abs(h) % 3];
      px(4, 1, 6, 2, 4); px(3, 3, 8, 10, 4); px(4, 4, 6, 8, 0);
      px(4, 6, 6, 6, shade); px(5, 7, 1, 3, 0);
      px(5, 9, 4, 2, 4); px(6, 9, 2, 1, 0);   // label
    } finally { ctx = saved; }
    return c;
  }

  // ---------- tick ----------
  var orchardNext = 0;
  function tickOrchardUI(t) {
    if ((sheetKind === 'sapling' || sheetKind === 'tree') && view !== 'orchard') closeSheet();
    if (performance.now() < orchardNext) return;
    orchardNext = performance.now() + 2000;
    var a = L.orchardTick(S, t, TZ), b = L.hiveTick(S, t, TZ, Math.random);
    if (a || b) save();
  }
