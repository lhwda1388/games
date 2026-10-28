  // ---------- 집 안: furniture on L.RSPOTS, 어탁, trophies, the aquarium spot (ui/aquarium.js); yard shop rows ----------
  function furnRect(id) { var k = L.spotOf(S, 'furn', id); return k < 0 ? null : L.itemRect('furn', id, k); }
  var AQUA = [118, 90, 58, 58], ETAKU = [24, 6, 50, 26], SHELF = [84, 30, 34, 3], WIN = [118, 6, 34, 18], DOOR = [78, 186, 24, 14];
  var DEX_CUPS = [5, 10, 20, 30];
  function dashRect(r, c) {
    for (var x = r[0]; x < r[0] + r[2]; x += 3) { px(x, r[1], 1, 1, c); px(x, r[1] + r[3] - 1, 1, 1, c); }
    for (var y = r[1]; y < r[1] + r[3]; y += 3) { px(r[0], y, 1, 1, c); px(r[0] + r[2] - 1, y, 1, 1, c); }
  }
  var DRAW_FURN = {
    shelf: function (x, y) {
      px(x, y, 20, 40, 4); px(x + 1, y + 1, 18, 38, 3);
      for (var k = 0; k < 3; k++) {
        px(x + 1, y + 12 + k * 13, 18, 1, 4);
        for (var b = 0; b < 7; b++) px(x + 2 + b * 2 + (b > 3 ? 1 : 0), y + 4 + k * 13 + (b % 3 === 0 ? 1 : 0), 1, 8 - (b % 3 === 0 ? 1 : 0), b % 2 ? 0 : 1);
      }
    },
    wardrobe: function (x, y) {
      px(x, y, 22, 42, 4); px(x + 1, y + 1, 20, 40, 2); px(x + 11, y + 1, 1, 40, 4);
      px(x + 9, y + 18, 1, 4, 0); px(x + 13, y + 18, 1, 4, 0); px(x + 3, y + 4, 6, 10, 1); px(x + 14, y + 4, 6, 10, 1);
    },
    lamp: function (x, y, tt, night) {
      px(x + 4, y + 9, 1, 19, 4); px(x + 1, y + 28, 7, 2, 4);
      px(x + 1, y, 7, 2, 4); px(x, y + 2, 9, 7, 4); px(x + 1, y + 3, 7, 5, night ? 0 : 1);
    },
    plant: function (x, y, tt) {
      px(x + 2, y + 14, 8, 8, 4); px(x + 3, y + 15, 6, 6, 3);
      var sw = Math.round(Math.sin(tt * 0.8));
      px(x + 5, y + 4, 2, 10, 4); px(x + sw, y + 2, 5, 3, 4); px(x + 7 - sw, y, 5, 3, 4); px(x + 1, y + 7, 4, 2, 4); px(x + 7, y + 8, 4, 2, 4);
    },
    stove: function (x, y, tt) {
      px(x + 9, y, 6, 14, 4); px(x + 10, y + 1, 4, 13, 3);
      px(x, y + 14, 24, 24, 4); px(x + 1, y + 15, 22, 22, 3); px(x + 5, y + 22, 14, 10, 4);
      var f = Math.floor(tt * 6) % 3;
      px(x + 7, y + 27 - f, 3, 4 + f, 0); px(x + 11, y + 26 + (f % 2), 3, 5 - (f % 2), 1); px(x + 15, y + 28 - (f === 2 ? 1 : 0), 2, 3, 0);
      px(x + 1, y + 38, 3, 2, 4); px(x + 20, y + 38, 3, 2, 4);
    },
    clock: function (x, y) {
      var d = new Date(), cx = x + 6, cy = y + 6;
      px(x + 2, y, 9, 13, 4); px(x, y + 2, 13, 9, 4); px(x + 1, y + 1, 11, 11, 4); px(x + 2, y + 2, 9, 9, 0); px(x + 1, y + 3, 11, 7, 0); px(x + 3, y + 1, 7, 11, 0);
      var ha = ((d.getHours() % 12) + d.getMinutes() / 60) / 12 * Math.PI * 2, ma = d.getMinutes() / 60 * Math.PI * 2;
      for (var r = 0; r < 3; r++) px(cx + Math.round(Math.sin(ha) * r), cy - Math.round(Math.cos(ha) * r), 1, 1, 4);
      for (r = 0; r < 5; r++) px(cx + Math.round(Math.sin(ma) * r), cy - Math.round(Math.cos(ma) * r), 1, 1, 3);
      px(cx, y + 2, 1, 1, 2);
    },
    bed: function (x, y) {
      px(x, y, 4, 28, 4); px(x + 42, y + 8, 4, 20, 4);
      px(x + 2, y + 12, 42, 12, 4); px(x + 3, y + 13, 40, 10, 0);
      px(x + 5, y + 8, 12, 6, 4); px(x + 6, y + 9, 10, 4, 1);
      px(x + 18, y + 12, 25, 10, 4); px(x + 19, y + 13, 23, 8, 2);
      for (var k = x + 20; k < x + 42; k += 4) px(k, y + 15, 2, 2, 1);
    },
    rug: function (x, y) {
      px(x, y, 60, 26, 4); px(x + 2, y + 2, 56, 22, 1);
      for (var k = 0; k < 5; k++) dashRect([x + 4 + k * 4, y + 4 + k * 2, 52 - k * 8, 18 - k * 4], k % 2 ? 2 : 3);
      for (k = 0; k < 60; k += 3) { px(x + k, y - 2, 1, 2, 3); px(x + k, y + 26, 1, 2, 3); }
    },
    table: function (x, y) {
      px(x, y, 32, 4, 4); px(x + 1, y + 1, 30, 2, 2); px(x + 2, y + 4, 3, 10, 4); px(x + 27, y + 4, 3, 10, 4);
      px(x + 12, y - 4, 7, 4, 4); px(x + 13, y - 3, 5, 3, 0); px(x + 18, y - 3, 2, 2, 4);
    },
    chair: function (x, y) {
      px(x + 9, y, 3, 20, 4); px(x, y + 9, 12, 3, 4); px(x + 1, y + 12, 2, 8, 4); px(x + 10, y + 1, 1, 8, 2);
    },
    radio: function (x, y, tt) {
      px(x, y + 2, 14, 9, 4); px(x + 1, y + 3, 6, 7, 2); px(x + 8, y + 4, 5, 2, 0); px(x + 9, y + 7, 3, 2, 1); px(x + 11, y - 2, 1, 4, 4);
      if (Math.floor(tt * 3) % 2) { px(x + 15, y, 1, 2, 3); px(x + 17, y - 2, 1, 2, 3); }
    },
    piano: function (x, y) {
      px(x, y, 54, 20, 4); px(x + 1, y + 1, 52, 8, 3); px(x + 2, y + 10, 50, 7, 0);
      for (var k = 0; k < 50; k += 4) { px(x + 2 + k, y + 10, 1, 7, 2); if (k % 12 !== 8) px(x + 4 + k, y + 10, 2, 4, 4); }
      px(x + 2, y + 20, 3, 10, 4); px(x + 49, y + 20, 3, 10, 4);
    }
  };
  // 어탁: the biggest fish ever caught, printed on paper
  var etakuCache = {};
  function biggestFish() {
    var best = null;
    L.FISH.forEach(function (f) { var d = S.dex.fish[f.id]; if (d && (!best || d.best > best.size)) best = { f: f, size: d.best }; });
    return best;
  }
  function drawRoom(tt, dt) {
    var t = L.houseTier(S), ph = yPhase(), night = ph === 'night', k;
    // walls by house tier
    var wallC = [1, 1, 0, 0][t];
    px(0, 0, W, 86, wallC);
    if (t === 0) for (k = 0; k < W; k += 15) px(k, 0, 1, 86, 2);
    else if (t === 1) for (k = 6; k < 86; k += 7) px(0, k, W, 1, 2);
    else if (t === 2) { for (k = 0; k < W; k += 12) px(k, 0, 1, 86, 1); for (k = 0; k < 86; k += 12) px(0, k, W, 1, 1); }
    else for (k = 0; k < 140; k++) px(Math.floor(hash(k * 3 + 1) * W), Math.floor(hash(k * 5 + 2) * 84), 1, 1, 1);
    px(0, 84, W, 3, 4);
    for (k = 87; k < H; k++) px(0, k, W, 1, (k - 87) % 8 === 0 ? 2 : (t === 0 ? 1 : 0));
    for (k = 0; k < 14; k++) px(Math.floor(hash(k * 7) * W), 90 + Math.floor(k * 8.3), 1, 7, 2);
    // window: the same sky as outside
    px(WIN[0] - 1, WIN[1] - 1, WIN[2] + 2, WIN[3] + 2, 4);
    px(WIN[0], WIN[1], WIN[2], WIN[3], night ? 3 : ph === 'evening' ? 1 : 0);
    if (night) for (k = 0; k < 6; k++) px(WIN[0] + 2 + Math.floor(hash(k * 5 + 3) * (WIN[2] - 4)), WIN[1] + 2 + Math.floor(hash(k * 9) * (WIN[3] - 4)), 1, 1, 0);
    var wx = yWeather();
    if (wx === 'rain') for (k = 0; k < 8; k++) px(WIN[0] + ((k * 5 + tt * 20) % WIN[2]), WIN[1] + ((k * 7 + tt * 40) % (WIN[3] - 2)), 1, 2, 2);
    if (wx === 'snow') for (k = 0; k < 8; k++) px(WIN[0] + ((k * 5 + Math.sin(tt + k) * 2 + 34) % WIN[2]), WIN[1] + ((k * 7 + tt * 6) % (WIN[3] - 1)), 1, 1, night ? 0 : 2);
    px(WIN[0] + WIN[2] / 2, WIN[1], 1, WIN[3], 4); px(WIN[0], WIN[1] + WIN[3] / 2, WIN[2], 1, 4);
    // 어탁 frame
    px(ETAKU[0], ETAKU[1], ETAKU[2], ETAKU[3], 4); px(ETAKU[0] + 2, ETAKU[1] + 2, ETAKU[2] - 4, ETAKU[3] - 4, 0);
    var big = biggestFish();
    if (big) {
      var c = etakuCache[big.f.id] || (etakuCache[big.f.id] = fishCanvas(big.f.id));
      ctx.imageSmoothingEnabled = false; ctx.drawImage(c, ETAKU[0] + 4, ETAKU[1] + 4, 42, 18);
      px(ETAKU[0] + 38, ETAKU[1] + 21, 8, 1, 3); px(ETAKU[0] + 42, ETAKU[1] + 19, 3, 3, 4);
    } else dashRect([ETAKU[0] + 6, ETAKU[1] + 6, ETAKU[2] - 12, ETAKU[3] - 12], 2);
    // trophy shelf: cups for 도감 counts, medals for found secrets
    px(SHELF[0], SHELF[1], SHELF[2], SHELF[3], 4);
    var dc = L.dexCount(S);
    DEX_CUPS.forEach(function (n, i) {
      var cx = SHELF[0] + 2 + i * 8, h = 4 + i, got = dc >= n;
      if (got) { px(cx, SHELF[1] - h - 1, 6, h - 1, 4); px(cx + 1, SHELF[1] - h, 4, h - 3, i === 3 ? 0 : 2); px(cx + 2, SHELF[1] - 2, 2, 2, 4); }
      else dashRect([cx, SHELF[1] - h - 1, 6, h + 1], 2);
    });
    L.EGGS.forEach(function (e, i) {
      var mx = SHELF[0] + 2 + (i % 4) * 8, my = 40 + Math.floor(i / 4) * 9, got = !!S.yard.eggs[e.id];
      px(mx + 2, my, 1, 3, got ? 3 : 2);
      if (got) { px(mx, my + 3, 5, 5, 4); px(mx + 1, my + 4, 3, 3, i % 2 ? 0 : 1); px(mx + 2, my + 5, 1, 1, 4); }
      else dashRect([mx, my + 3, 5, 5], 2);
    });
    drawTank(tt);   // stage 4: 수족관
    // furniture: what stands here, and a dashed + where an unbought piece would go
    L.RSPOTS.forEach(function (p, k) {
      if (!L.spotBuyable(S, 'furn', k)) return;
      var r = p.r; dashRect(r, 2); px(r[0] + r[2] / 2 - 1, r[1] + r[3] / 2, 3, 1, 2); px(r[0] + r[2] / 2, r[1] + r[3] / 2 - 1, 1, 3, 2);
    });
    standing('furn').forEach(function (e) { DRAW_FURN[e.id](e.r[0], e.r[1], tt, night); });
    // door mat back out
    px(DOOR[0], DOOR[1], DOOR[2], DOOR[3], 4); px(DOOR[0] + 1, DOOR[1] + 1, DOOR[2] - 2, DOOR[3] - 1, 2);
    px(DOOR[0] + 8, DOOR[1] + 4, 8, 1, 0); px(DOOR[0] + 9, DOOR[1] + 3, 1, 3, 0);
    if (night || ph === 'evening') {
      var lr = furnRect('lamp'), lit = !!lr || L.furnPlaced(S, 'stove');
      ctx.globalAlpha = night ? (lit ? 0.14 : 0.3) : 0.08; px(0, 0, W, H, 4); ctx.globalAlpha = 1;
      if (night && lr) DRAW_FURN.lamp(lr[0], lr[1], tt, true);
    }
    drawPick(tt);
  }
  function tapRoom(x, y) {
    var t = L.houseTier(S), k;
    if (tapPick(x, y)) return;
    if (hit(DOOR, x, y, 3)) { goScene('yard'); return; }
    if (hit(ETAKU, x, y)) {
      var b = biggestFish();
      toast(b ? '어탁 · ' + b.f.name + ' ' + b.size.toFixed(1) + 'cm · 지금까지 제일 큰 물고기' : '어탁 자리 · 큰 물고기를 낚으면 걸린다', 3000); return;
    }
    if (hit([SHELF[0], 18, SHELF[2], 46], x, y)) {
      toast('트로피 · 도감 ' + L.dexCount(S) + '종 (5·10·20·30) · 비밀 ' + L.eggCount(S) + '/' + L.EGGS.length + ' · 도감 기록 탭', 3200); return;
    }
    if (hit(WIN, x, y)) { toast(L.PHASE_NAME[yPhase()] + ' · ' + L.WEATHER_NAME[yWeather()], 1800); return; }
    var on = standing('furn').filter(function (e) { return hit(e.r, x, y, 1); }).pop();
    if (on) { tapFurn(L.furnById(on.id), on.r); return; }
    for (k = 0; k < L.RSPOTS.length; k++) {
      if (!L.spotBuyable(S, 'furn', k) || !hit(L.RSPOTS[k].r, x, y, 1)) continue;
      var f = L.furnById(L.RSPOTS[k].def), r = L.RSPOTS[k].r;
      confirmBuy('f:' + f.id, f.name, f.cost, function () {
        var res = L.buyFurn(S, f.id);
        if (!res.ok) { toast(WHY[res.why] || '살 수 없어요'); return; }
        burst(r[0] + r[2] / 2, r[1] + r[3] / 2, 10, 0, 50); toast(res.stored ? josa(f.name, '은', '는') + ' 보관함에 · 상점에서 놓기' : josa(f.name, '을', '를') + ' 들여놓았다'); refresh();
      });
      return;
    }
    if (hit(AQUA, x, y)) { openSheet('tank'); return; }
    var locked = L.FURN.filter(function (f) { return t < f.house; });
    toast(locked.length ? '집을 키우면 ' + locked.slice(0, 3).map(function (f) { return f.name; }).join('·') + ' 자리가 생겨요' : '점선 자리를 누르면 가구를 들여요 · 가구를 누르면 옮기기', 2600);
  }
  // the old one-tap reactions stay; the bed's line is long, so it keeps its toast and the bar says 잠자리
  function tapFurn(f, r) {
    if (f.id === 'bed') { var b = L.tapBed(S, now(), YTZ); toast(b.text, 2800); if (b.egg) eggFound(b.egg); refresh(); openPick('furn', f.id, '포근한 잠자리'); return; }
    if (f.id === 'clock') { var d = new Date(); openPick('furn', f.id, '지금 ' + d.getHours() + '시 ' + String(d.getMinutes()).padStart(2, '0') + '분 · 진짜 시계'); return; }
    if (f.id === 'radio') { toast('♪ 라디오: "정각을 알려 드립니다… 연못 근처 계신 분들은 낚싯대를…"', 3200); openPick('furn', f.id, '♪ 정각 안내 방송'); return; }
    if (f.id === 'piano') { burst(r[0] + 27, r[1] + 8, 6, 0, 40); openPick('furn', f.id, '도레미파솔~'); return; }
    openPick('furn', f.id, '집 안 가구');
  }

  // ---------- icons for shop rows ----------
  function drawIcon(w, h, draw) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var saved = ctx; ctx = c.getContext('2d');
    try { draw(); } finally { ctx = saved; }
    var s = Math.min(24 / w, 24 / h, 2);
    c.style.width = Math.round(w * s) + 'px'; c.style.height = Math.round(h * s) + 'px';
    return c;
  }
  function decoIcon(id) { var z = L.decoById(id).sz; return drawIcon(z[0], z[1], function () { DRAW_DECO[id](0, 0, 0, false); }); }
  function furnIcon(id) { var z = L.furnById(id).sz; return drawIcon(z[0] + 2, z[1] + 4, function () { DRAW_FURN[id](0, id === 'table' ? 4 : 2, 0, false); }); }
  function animalIcon(id) {
    return drawIcon(id === 'cow' ? 20 : 10, 14, function () { if (id === 'hen') hen(1, 4); else if (id === 'duck') duck(1, 5); else cow(1, 3, 0); });
  }
  function houseIcon(tier) {
    var b = HOUSE_BOX[tier], keep = S.yard.house;
    return drawIcon(b[2] + 8, b[3] + 10, function () {
      S.yard.house = tier;
      try { ctx.translate(4 - b[0], 8 - b[1]); drawHouse(0, false, false); } finally { S.yard.house = keep; ctx.setTransform(1, 0, 0, 1, 0, 0); }
    });
  }
  // product icons for the basket (egg, milk, duck egg, feather)
  var PRODUCT_ICON = {
    egg: ['....', '.44.', '4004', '4004', '4014', '.44.'],
    duckegg: ['.44.', '4004', '4204', '4004', '4024', '4004', '.44.'],
    milk: ['.44.', '.44.', '4004', '4004', '4334', '4004', '4444'],
    feather: ['....4', '...43', '..434', '.434.', '434..', '4....'],
    clockfish: null
  };
  function productIcon(id) {
    var rows = PRODUCT_ICON[id];
    if (!rows) return null;
    var c = document.createElement('canvas'); c.width = 12; c.height = 12;
    spr(rows, Math.floor((12 - rows[0].length) / 2), Math.floor((12 - rows.length) / 2), false, c.getContext('2d'));
    return c;
  }

  // ---------- 상점: 마당·집 section (renderShop calls this last) ----------
  function renderYardShop() {
    var h3 = document.createElement('h3'); h3.textContent = '집';
    var hb = document.createElement('b'); hb.textContent = L.houseInfo(S).name; h3.appendChild(hb); shopEl.appendChild(h3);
    var next = L.houseNext(S), cur = L.houseInfo(S);
    if (next) {
      var perks = [];
      if (next.bag > cur.bag) perks.push('바구니 +' + (next.bag - cur.bag));
      if (next.pots > cur.pots) perks.push('냄비 +' + (next.pots - cur.pots));
      if (next.deco > cur.deco) perks.push('장식 자리 ' + next.deco);
      var furn = L.FURN.filter(function (f) { return f.house === L.houseTier(S) + 1; }).map(function (f) { return f.name; });
      yRow(houseIcon(L.houseTier(S) + 1), next.name + ' 짓기', perks.join(' · ') + ' · 가구 ' + furn.join('·') + ' · ★' + next.rep + ' 필요',
        S.rep < next.rep ? '★' + next.rep : next.cost, S.rep < next.rep, function () {
          var r = L.upgradeHouse(S);
          if (!r.ok) return r.why;
          toast('★ ' + L.houseInfo(S).name + ' 완성 · 바구니 ' + L.bagCap(S) + '칸 · 냄비 ' + L.potCount(S) + '개', 3500);
        });
    } else yRow(houseIcon(3), cur.name, '가장 큰 집 · 바구니 +' + cur.bag + ' · 냄비 ' + cur.pots + '개 · 장식 ' + cur.deco + '자리', null);
    h3 = document.createElement('h3'); h3.textContent = '동물'; shopEl.appendChild(h3);
    L.ANIMAL_IDS.forEach(function (id) {
      var a = L.ANIMALS[id], c = L.animalCost(S, id), have = S.animals[id], locked = L.houseTier(S) < a.house;
      yRow(animalIcon(id), a.name + ' <span class="pips">' + have + '/' + a.costs.length + '</span>',
        a.makes + ' · ' + (a.every / 60e3) + '분마다 · 마당에 쌓이면 우리를 눌러 줍기' + (locked ? ' · ' + L.HOUSE[a.house].name + '부터' : ''),
        locked ? L.HOUSE[a.house].name : c, locked, function () {
          var r = L.buyAnimal(S, id, now());
          if (!r.ok) return r.why;
          josa(toast(a.name, '이', '가') + ' 마당에 왔다 · 마당 버튼', 3000);
        });
    });
    h3 = document.createElement('h3'); h3.textContent = '마당 꾸미기';
    var stored = L.storedList(S, 'deco').length;
    var db = document.createElement('b'); db.textContent = L.decoCount(S) + ' / ' + L.decoSlots(S) + '자리' + (stored ? ' · 보관 ' + stored : ''); h3.appendChild(db); shopEl.appendChild(h3);
    storedRows('deco');
    L.DECOS.forEach(function (d) {
      var own = !!S.yard.deco[d.id];
      if ((d.merchant && !own) || (own && !L.decoPlaced(S, d.id))) return;
      yRow(decoIcon(d.id), d.name, d.brings ? josa(L.visitorById(d.brings).name, '이', '가') + ' 찾아온다' : '보기 좋다', own ? null : d.cost, false, function () {
        var r = L.buyDeco(S, d.id);
        if (!r.ok) return r.why;
        toast(r.stored ? josa(d.name, '은', '는') + ' 보관함에 · 놓을 자리가 없어요' : josa(d.name, '을', '를') + ' 마당에 놓았다', 2400);
      }, own ? '마당에' : null);
    });
    var note = document.createElement('p'); note.className = 'note'; note.textContent = '마당·집 안에서 장식이나 가구를 누르면 옮기거나 넣어 둘 수 있어요 · 연등·풍경은 떠돌이 상인만 가져와요'; shopEl.appendChild(note);
    h3 = document.createElement('h3'); h3.textContent = '가구'; shopEl.appendChild(h3);
    storedRows('furn');
    L.FURN.forEach(function (f) {
      var own = !!S.yard.furn[f.id], locked = L.houseTier(S) < f.house;
      if (own && !L.furnPlaced(S, f.id)) return;
      yRow(furnIcon(f.id), f.name, locked ? L.HOUSE[f.house].name + '이 되면 들일 수 있다' : '집 안 빈 자리에 놓인다',
        own ? null : locked ? L.HOUSE[f.house].name : f.cost, locked, function () {
          var r = L.buyFurn(S, f.id);
          if (!r.ok) return r.why;
          toast(r.stored ? josa(f.name, '은', '는') + ' 보관함에 · 놓을 자리가 없어요' : josa(f.name, '을', '를') + ' 들여놓았다 · 집을 눌러 구경', 2600);
        }, own ? '집 안에' : null);
    });
  }
  // 보관함: owned things that aren't out, first in their section, each with [놓기]
  function storedRows(kind) {
    L.storedList(S, kind).forEach(function (id) {
      var def = kind === 'deco' ? L.decoById(id) : L.furnById(id);
      yRow(kind === 'deco' ? decoIcon(id) : furnIcon(id), def.name + ' <span class="pips">보관함</span>',
        kind === 'deco' ? '놓으면 빈 자리에 · 마당에서 눌러 옮기기' : '놓으면 빈 자리에 · 집 안에서 눌러 옮기기', { label: '놓기', aria: def.name + ' 놓기' }, false, function () {
          var r = L.placeItem(S, kind, id);
          if (!r.ok) return r.why;
          toast(josa(def.name, '을', '를') + (kind === 'deco' ? ' 마당에 놓았다' : ' 집 안에 놓았다') + ' · 눌러서 옮기기', 2400);
        });
    });
  }
  // cost: number = price button, string = disabled reason label, { label, aria } = action button, null = done (doneLabel or '최대')
  function yRow(icon, nameHtml, sub, cost, off, onBuy, doneLabel) {
    var r = document.createElement('div'); r.className = 'up';
    var n = document.createElement('div'); n.className = 'n'; n.innerHTML = nameHtml;
    var sm = document.createElement('small'); sm.textContent = sub; n.appendChild(sm);
    var b = document.createElement('button'); b.type = 'button';
    if (cost === null) { b.textContent = doneLabel || '최대'; b.disabled = true; b.className = 'max'; }
    else if (off) { b.textContent = cost; b.disabled = true; b.className = 'max'; }
    else if (typeof cost === 'object') {
      b.textContent = cost.label; b.setAttribute('aria-label', cost.aria);
      b.addEventListener('click', function () {
        var why = onBuy();
        if (why) { toast(WHY[why] || '놓을 수 없어요'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
        refresh(); renderShop();
      });
    } else {
      b.textContent = cost.toLocaleString('ko-KR');
      b.setAttribute('aria-label', '사기 ' + cost + '코인');
      if (S.coins < cost) b.classList.add('poor');
      b.addEventListener('click', function () {
        var why = onBuy();
        if (why) { toast(WHY[why] || '살 수 없어요'); b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); return; }
        refresh(); renderShop();
      });
    }
    r.appendChild(icon); r.appendChild(n); r.appendChild(b); shopEl.appendChild(r);
  }

  // ---------- 냄비 tab: the extra pots a bigger house brings (renderCook calls this) ----------
  function renderExtraPots() {
    var t = now();
    for (var k = 1; k < L.potCount(S); k++) {
      var p = L.potGet(S, k);
      if (!p) { upRow(dishCanvas('?'), '냄비 ' + (k + 1), '비어 있어요 · 요리하면 빈 냄비에 들어가요', 'idle'); continue; }
      var r = L.recipeById(p.id), ready = t >= p.until;
      var row = upRow(dishCanvas(r.id), '냄비 ' + (k + 1) + ' · ' + esc(r.name), ready ? '다 됐어요' : fmtGame(p.until - t) + ' 남음');
      if (ready) row.appendChild(act('꺼내기', tapPot));
    }
  }
