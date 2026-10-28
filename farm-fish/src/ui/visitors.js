  // ---------- visitors: where they stand, how they look, what a tap does; merchant & letter sheet ----------
  function visitById(id) { var out = null; S.yard.vis.forEach(function (v) { if (v.id === id) out = v; }); return out; }
  function visitProgress(v) { return Math.max(0, Math.min(1, (now() - v.at) / Math.max(1, v.until - v.at))); }
  // position (and tap radius) of a visitor in its scene
  function visitorPos(v, tt) {
    var d = S.yard.deco;
    switch (v.id) {
      case 'cat': return d.bench ? { x: 131, y: 89, r: 10 } : { x: 74, y: 80, r: 10 };
      case 'raccoon': return d.jars ? { x: 140, y: 106, r: 10 } : { x: 122, y: 164, r: 10 };
      case 'squirrel': return { x: 160, y: 52 + (Math.floor(tt * 2) % 6 === 0 ? -2 : 0), r: 9 };
      case 'sparrows': return { x: 60, y: 102, r: 14 };
      case 'butterfly': return { x: 20 + Math.sin(tt * 0.9) * 11, y: 82 + Math.cos(tt * 1.3) * 5, r: 10 };
      case 'mailman': return { x: 58, y: 76, r: 10 };
      case 'merchant': return { x: 116, y: 148, r: 18 };
      case 'fireflies': return { x: 60 + 50 * (0.5 + 0.5 * Math.sin(tt * 0.13 + v.x * 6)), y: 64 + 24 * Math.sin(tt * 0.17 + v.x * 3), r: 22 };
      case 'shootingstar': var sx = ((tt * 0.35 + v.x) % 1) * 230 - 25; return { x: sx, y: 3 + v.x * 8 + sx * 0.07, r: 14, sky: true };
      case 'rainbow': return { x: 90, y: 14, r: 14, sky: true };
      case 'duckfam':
        var p = visitProgress(v), dir = v.x < 0.5 ? 1 : -1;
        return { x: POND.cx + dir * (-46 + 92 * p), y: POND.cy - 16 + Math.round(v.x * 14), r: 12, dir: dir };
      case 'turtle': return { x: 158, y: 157, r: 9 };
      case 'frog': return { x: 96, y: 168 - (Math.floor(tt * 0.8 + v.x * 5) % 6 === 0 ? 3 : 0), r: 9 };
    }
    return { x: -99, y: -99, r: 0 };
  }
  function tapVisitorAt(x, y, slot) {
    if (slot === 'pond' && L.curSpot(S) !== 'pond') return false;
    for (var k = 0; k < S.yard.vis.length; k++) {
      var v = S.yard.vis[k], d = L.visitorById(v.id);
      if (d.slot !== slot) continue;
      var p = visitorPos(v, performance.now() / 1000);
      var near = p.sky ? y < 30 : Math.hypot(x - p.x, y - p.y) < p.r;
      if (!near) continue;
      var res = L.tapVisitor(S, v.id, now(), Math.random, YTZ);
      if (!res) return false;
      if (res.coins) floatText('+' + res.coins, Math.max(10, Math.min(170, p.x)), Math.max(8, p.y - 10));
      burst(Math.max(4, Math.min(176, p.x)), Math.max(4, p.y), res.coins ? 8 : 4, 0, 40);
      if (res.id === 'merchant') merchantLine = res.text;
      else if (res.text) toast(res.text, 3200);
      if (res.egg) eggFound(res.egg);
      if (res.sheet) openSheet(res.sheet);
      refresh();
      return true;
    }
    return false;
  }

  // ---------- sprites ----------
  var RACCOON = ['.4......4.', '.44....44.', '..444444..', '.44000044.', '4400440044', '.40044004.', '..400004..', '.4444444..', '443333344.', '.4333334.4', '.4333334.4', '.44...44.4'];
  var SQUIRREL = ['...44', '..433', '.4334', '4333.', '4334.', '.444.'];
  var SQ_HEAD = ['.44.', '4304', '4334', '.44.'];
  function halo(rows, x, y, flip) {
    for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) if (ox || oy) spr(rows.map(function (r) { return r.replace(/[0-4]/g, '0'); }), x + ox, y + oy, flip);
    spr(rows, x, y, flip);
  }
  function drawCatVisit(v, p, tt) {
    var blink = Math.floor(tt * 10) % 37 === 0, flick = Math.floor(tt * 0.8) % 3 === 0;
    spr(blink ? SP.catBlink : SP.cat, p.x - 4, p.y - 4, true);
    if (flick) px(p.x + 5, p.y - 1, 1, 1, 4);
    if (!v.n) {
      // thought bubble with a fish: the cat is looking at what you caught
      var bx = p.x - 7, by = p.y - 30;
      px(bx, by, 13, 9, 4); px(bx + 1, by + 1, 11, 7, 0);
      px(bx + 3, by + 4, 5, 2, 4); px(bx + 8, by + 3, 1, 1, 4); px(bx + 8, by + 6, 1, 1, 4);
      px(bx + 6, by + 9, 2, 1, 4); px(bx + 7, by + 10, 1, 2, 4);
    } else if (Math.floor(tt * 2) % 2 === 0) { px(p.x - 2, p.y - 10, 1, 2, 4); px(p.x, p.y - 11, 1, 2, 4); px(p.x - 3, p.y - 9, 5, 1, 4); }
  }
  function drawPerson(x, y, tt, hat) {
    var bob = Math.floor(tt * 2) % 2;
    spr(SP.farmer, x - 5, y - 13 + bob);
    if (hat) { px(x - 4, y - 14 + bob, 8, 2, 4); px(x - 6, y - 12 + bob, 3, 1, 4); }
  }
  var DRAW_VIS = {
    cat: drawCatVisit,
    raccoon: function (v, p, tt) {
      var hop = Math.floor(tt * 3) % 4 === 0 ? 1 : 0;
      halo(RACCOON, p.x - 5, p.y - 8 - hop, Math.sin(tt * 0.7) < 0);
      for (var k = 0; k < 4; k++) px(p.x + 6 + k, p.y + 1 - (k % 2), 1, 1, k % 2 ? 4 : 2);
    },
    squirrel: function (v, p, tt) { spr(SQUIRREL, p.x - 1, p.y - 4); spr(SQ_HEAD, p.x - 4, p.y - 6); px(p.x - 3, p.y - 5, 1, 1, 0); },
    sparrows: function (v, p, tt) {
      for (var k = 0; k < 4; k++) {
        var hop = Math.floor(tt * 4 + k * 1.7) % 3 === 0 ? 2 : 0, bx = p.x - 12 + k * 7 + Math.round(Math.sin(tt * 0.6 + k) * 2), by = p.y - hop + (k % 2) * 2;
        px(bx, by, 4, 3, 4); px(bx + 1, by + 1, 2, 1, 2); px(bx + 3, by - 1, 2, 2, 4); px(bx + 5, by, 1, 1, 3); px(bx - 1, by, 1, 1, 4);
      }
    },
    butterfly: function (v, p, tt) {
      var f = Math.floor(tt * 8) % 2;
      px(p.x, p.y, 1, 3, 4);
      if (f) { px(p.x - 3, p.y - 1, 3, 3, 4); px(p.x + 1, p.y - 1, 3, 3, 4); px(p.x - 2, p.y, 1, 1, 0); px(p.x + 2, p.y, 1, 1, 0); }
      else { px(p.x - 1, p.y - 2, 1, 4, 4); px(p.x + 1, p.y - 2, 1, 4, 4); }
    },
    mailman: function (v, p, tt) {
      drawPerson(p.x, p.y, tt, true);
      px(p.x + 3, p.y - 6, 5, 5, 4); px(p.x + 4, p.y - 5, 3, 3, 2);
      if (Math.floor(tt * 2) % 2) { px(p.x - 9, p.y - 12, 7, 5, 4); px(p.x - 8, p.y - 11, 5, 3, 0); px(p.x - 8, p.y - 11, 5, 1, 2); }
    },
    merchant: function (v, p, tt) {
      // cart with a striped awning, the merchant beside it with a big pack
      var x = p.x - 14, y = p.y - 10;
      px(x, y + 8, 30, 12, 4); px(x + 1, y + 9, 28, 10, 1);
      for (var k = 0; k < 30; k += 4) { px(x + k, y, 2, 6, 4); px(x + k + 2, y, 2, 6, 0); }
      px(x - 1, y + 6, 32, 2, 4); px(x, y + 2, 1, 6, 4); px(x + 29, y + 2, 1, 6, 4);
      px(x + 4, y + 11, 4, 4, 3); px(x + 11, y + 12, 5, 3, 0); px(x + 12, y + 11, 3, 1, 4); px(x + 20, y + 11, 6, 5, 2);
      px(x + 4, y + 20, 6, 6, 4); px(x + 5, y + 21, 4, 4, 0); px(x + 6, y + 22, 2, 2, 4);
      px(x + 20, y + 20, 6, 6, 4); px(x + 21, y + 21, 4, 4, 0); px(x + 22, y + 22, 2, 2, 4);
      drawPerson(x + 40, y + 24, tt, true);
      px(x + 41, y + 8, 7, 9, 4); px(x + 42, y + 9, 5, 7, 2);
      var left = Math.ceil((v.until - now()) / SPEED / 60e3);
      for (k = 0; k < Math.min(10, left); k++) px(x + 1 + k * 3, y - 3, 2, 1, 4);
    },
    fireflies: function (v, p, tt) {
      for (var k = 0; k < 7; k++) {
        var on = (Math.floor(tt * 2.3 + k * 1.3) % 3) !== 0;
        var fx = p.x + Math.sin(tt * 0.9 + k * 2.1) * 16, fy = p.y + Math.cos(tt * 0.7 + k * 1.7) * 12;
        if (on) { ctx.globalAlpha = 0.35; px(fx - 1, fy - 1, 3, 3, 0); ctx.globalAlpha = 1; px(fx, fy, 1, 1, 0); }
      }
    },
    shootingstar: function (v, p, tt) {
      for (var k = 0; k < 10; k++) px(p.x - k * 2, p.y - k * 0.14, 2, 1, k < 3 ? 0 : k < 7 ? 1 : 2);
      px(p.x, p.y - 1, 1, 3, 0); px(p.x - 1, p.y, 3, 1, 0);
    },
    rainbow: function (v, p, tt) {
      // grayscale stripes: ink, paper, mid, paper, dark
      var bands = [4, 0, 2, 1, 3, 0];
      for (var a = 0; a <= 180; a += 0.6) {
        var an = Math.PI - a / 180 * Math.PI;
        for (var b = 0; b < bands.length; b++) {
          var r = 70 - b * 2.2, x = 90 + Math.cos(an) * r, y = 30 - Math.sin(an) * r * 0.36;
          if (y < 26) px(x, y, 1, 1, bands[b]);
        }
      }
    },
    duckfam: function (v, p, tt) {
      var flip = p.dir < 0;
      for (var k = 3; k >= 1; k--) duck(p.x - p.dir * (6 + k * 7), p.y + 2 + (Math.floor(tt * 3 + k) % 2), flip, true);
      duck(p.x - 4, p.y - 3 + (Math.floor(tt * 2) % 2), flip, false);
      for (k = 0; k < 4; k++) px(p.x - p.dir * (4 + k * 7), p.y + 6, 3, 1, 0);
    },
    turtle: function (v, p, tt) {
      var peek = Math.floor(tt * 0.6) % 4 !== 0;
      px(p.x - 5, p.y - 3, 10, 6, 4); px(p.x - 4, p.y - 2, 8, 4, 3); px(p.x - 2, p.y - 2, 1, 4, 2); px(p.x + 1, p.y - 2, 1, 4, 2);
      if (peek) { px(p.x - 8, p.y - 2, 3, 3, 4); px(p.x - 7, p.y - 1, 1, 1, 0); }
      px(p.x - 5, p.y + 3, 2, 1, 4); px(p.x + 3, p.y + 3, 2, 1, 4);
    },
    frog: function (v, p, tt) {
      px(p.x - 4, p.y - 2, 8, 4, 4); px(p.x - 3, p.y - 1, 6, 2, 3); px(p.x - 4, p.y - 4, 3, 3, 4); px(p.x + 1, p.y - 4, 3, 3, 4);
      px(p.x - 3, p.y - 3, 1, 1, 0); px(p.x + 2, p.y - 3, 1, 1, 0); px(p.x - 5, p.y + 1, 2, 1, 4); px(p.x + 3, p.y + 1, 2, 1, 4);
      if (Math.floor(tt * 1.5) % 5 === 0) { px(p.x - 2, p.y + 1, 4, 2, 1); }
    }
  };
  // one call per scene layer: 'pond' from the farm frame, 'yard' and 'sky' from the 마당
  function drawVisitors(tt, dt, slot) {
    if (slot === 'pond' && L.curSpot(S) !== 'pond') return;
    S.yard.vis.forEach(function (v) {
      if (L.visitorById(v.id).slot !== slot) return;
      DRAW_VIS[v.id](v, visitorPos(v, tt), tt);
    });
  }

  // ---------- sheet: merchant wares, letters ----------
  var sheetEl = document.createElement('section');
  sheetEl.className = 'overlay'; sheetEl.id = 'ysheet'; sheetEl.hidden = true;
  app.appendChild(sheetEl);
  var sheetKind = null;
  function closeSheet() { sheetEl.hidden = true; sheetKind = null; }
  [dexBtn, shopBtn, bagBtn].forEach(function (b) { b.addEventListener('click', closeSheet); });
  function sheetHead(title) {
    sheetEl.innerHTML = '';
    var h = document.createElement('h2'); h.textContent = title;
    var wallet = document.createElement('span'); wallet.className = 'wallet';
    var coin = document.createElement('span'); coin.className = 'coin';
    wallet.appendChild(coin); wallet.appendChild(document.createTextNode(S.coins.toLocaleString('ko-KR')));
    var close = document.createElement('button'); close.type = 'button'; close.textContent = '닫기';
    close.addEventListener('click', closeSheet);
    h.appendChild(wallet); h.appendChild(close); sheetEl.appendChild(h);
  }
  function sheetRow(icon, name, sub, cls) {
    var r = document.createElement('div'); r.className = 'up' + (cls ? ' ' + cls : '');
    var n = document.createElement('div'); n.className = 'n'; n.textContent = name;
    var sm = document.createElement('small'); sm.textContent = sub; n.appendChild(sm);
    r.appendChild(icon); r.appendChild(n); sheetEl.appendChild(r);
    return r;
  }
  function openSheet(kind) {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true;
    sheetKind = kind; sheetEl.hidden = false;
    if (kind === 'merchant') renderMerchant(); else if (kind === 'tank') renderTank(); else renderMail();
  }
  var merchantLine = '';
  function renderMerchant() {
    var v = visitById('merchant');
    if (!v) { closeSheet(); return; }
    sheetHead('떠돌이 상인');
    var line = document.createElement('p'); line.className = 'say';
    line.textContent = merchantLine || '상인: 좋은 물건 있어요. 천천히 보세요.';
    sheetEl.appendChild(line);
    var h3 = document.createElement('h3'); h3.textContent = '오늘의 물건';
    var b = document.createElement('b'); b.textContent = fmtLeft(Math.max(0, v.until - now())) + ' 뒤 떠남'; h3.appendChild(b); sheetEl.appendChild(h3);
    v.wares.forEach(function (w, k) {
      var def = L.wareById(w.id), name = w.id === 'seed' ? L.CROPS[w.seed].name + ' 씨앗' : def.name;
      var sub = w.id === 'gold' ? '심으면 황금 수박 · 교배 없이' : w.id === 'fert3' ? '비료 세 포대 묶음' : w.id === 'seed' ? '상점보다 싸게 · 바로 심을 수 있다'
        : '상인만 파는 장식' + (L.decoById(w.id).brings ? ' · ' + josa(L.visitorById(L.decoById(w.id).brings).name, '이', '가') + ' 좋아함' : '');
      var icon = w.id === 'seed' ? iconCanvas(w.seed) : w.id === 'gold' ? iconCanvas('gold') : w.id === 'fert3' ? iconCanvas('fert') : decoIcon(w.id);
      var r = sheetRow(icon, name, sub, w.sold ? 'idle' : '');
      var btn = document.createElement('button'); btn.type = 'button';
      if (w.sold) { btn.textContent = '팔림'; btn.disabled = true; btn.className = 'max'; }
      else {
        btn.textContent = w.cost.toLocaleString('ko-KR'); btn.setAttribute('aria-label', name + ' 사기 ' + w.cost + '코인');
        if (S.coins < w.cost) btn.classList.add('poor');
        btn.addEventListener('click', function () {
          var res = L.merchantBuy(S, k);
          if (!res.ok) { toast(WHY[res.why] || '살 수 없어요'); btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake'); return; }
          toast(res.name + ' 샀다 · 상인: 고마워요!', 2600); refresh(); renderMerchant();
        });
      }
      r.appendChild(btn);
    });
  }
  function renderMail() {
    sheetHead('우체통');
    var mail = S.yard.mail;
    if (!mail.length) {
      var p = document.createElement('p'); p.className = 'note'; p.textContent = '아직 편지가 없어요 · 우편배달부가 낮에 들러요'; sheetEl.appendChild(p); return;
    }
    for (var i = mail.length - 1; i >= 0; i--) (function (i) {
      var m = mail[i], box = document.createElement('div'); box.className = 'letter' + (m.read ? '' : ' new');
      var top = document.createElement('div'); top.className = 'lt';
      top.textContent = m.read ? '편지' : '새 편지 · 동전이 들어 있다';
      box.appendChild(top);
      if (m.read) { var tx = document.createElement('p'); tx.textContent = L.letterText(m.k); box.appendChild(tx); }
      else {
        var b = document.createElement('button'); b.type = 'button'; b.textContent = '열기 · +' + m.c;
        b.addEventListener('click', function () { var r = L.readMail(S, i); if (r.coins) floatText('+' + r.coins, 90, 60); refresh(); renderMail(); });
        box.appendChild(b);
      }
      sheetEl.appendChild(box);
    })(i);
  }
