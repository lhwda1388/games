  // ---------- 계절 축제 (stage 5B): small header chip, festival sheet, sky effects, festival/junk decoration art,
  // the 달력 축제 rows, and the 불 조절 도전 entry for the pot ----------
  var festOverride;   // FF.festival: undefined = follow the clock, null = none, 'spring'… = that festival now
  function festNow(t) {
    if (festOverride === undefined) return L.festivalAt(t, TZ);
    if (!festOverride) return null;
    var w = L.festWeek(t, TZ);
    return { id: festOverride, start: w.start, end: t + 8 * 3600e3 };   // a test window around now
  }
  function festId(t) { var w = festNow(t); return w ? w.id : null; }

  // header chip: [icon] 축제 · stays tiny and grey; a dot while the 축제 선물 waits
  var festChip = document.createElement('button');
  festChip.type = 'button'; festChip.id = 'festChip'; festChip.hidden = true;
  var festIcon = document.createElement('canvas'); festIcon.width = 7; festIcon.height = 7;
  var festLabel = document.createElement('span');
  var festDot = document.createElement('i'); festDot.className = 'dot';
  festChip.appendChild(festIcon); festChip.appendChild(festLabel); festChip.appendChild(festDot);
  coinsEl.after(festChip);
  festChip.addEventListener('click', function () { openFest(); });
  var FEST_IC = {
    spring: ['.44.44.', '4000004', '.40004.', '..404..', '.40004.', '4000004', '.44.44.'],
    summer: ['4..4..4', '.4.4.4.', '..404..', '4440444', '..404..', '.4.4.4.', '4..4..4'],
    autumn: ['..444..', '.40004.', '4000044', '4000444', '4000044', '.40004.', '..444..'],
    winter: ['..444..', '..404..', '..444..', '.44444.', '4400044', '4000004', '.44444.']
  };
  var festKey = '';
  function tickFest(t) {
    var w = festNow(t), id = w ? w.id : null;
    L.festTick(S, t, TZ, festOverride === undefined ? undefined : id);
    var key = id ? id + (L.festClaimable(S, w) ? '!' : '') : '';
    festChip.hidden = !id;
    if (key !== festKey) {
      if (id && booted && !festKey) toast(L.FESTIVALS[id].name + ' 날이에요 · 위의 축제 표시를 눌러 봐요', 3600);
      festKey = key;
      if (id) {
        var c2 = festIcon.getContext('2d'); c2.clearRect(0, 0, 7, 7); spr(FEST_IC[id], 0, 0, false, c2);
        festLabel.textContent = '';   // icon only: the header has no room for a word next to 6+ digit coins
        festChip.title = L.FESTIVALS[id].name;
        festChip.setAttribute('aria-label', L.FESTIVALS[id].name + ' 열기');
      }
      festDot.hidden = !(id && L.festClaimable(S, w));
    }
    festChip.disabled = !!reel;
    if (sheetKind === 'fest' && !sheetEl.hidden && Math.floor(t / 1000 / SPEED) % 30 === 0) renderFest();
  }

  // ---------- festival sheet ----------
  function openFest() {
    if (reel) return;
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true;
    sheetKind = 'fest'; sheetEl.hidden = false;
    renderFest();
  }
  function fmtWhen(start) {
    var d = new Date(start), days = ['일', '월', '화', '수', '목', '금', '토'];
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일(' + days[d.getDay()] + ') ' + L.FEST_FROM + '–' + L.FEST_TO + '시';
  }
  function renderFest() {
    var t = now(), w = festNow(t);
    if (!w) { sheetHead('계절 축제'); festSchedule(t); return; }
    var f = L.FESTIVALS[w.id];
    sheetHead(f.name);
    var say = document.createElement('p'); say.className = 'say';
    say.textContent = f.desc + ' · ' + fmtReal(w.end - t) + ' 남음';
    sheetEl.appendChild(say);
    var h = document.createElement('h3'); h.textContent = '축제 선물'; sheetEl.appendChild(h);
    var owned = S.yard.deco[f.deco], can = L.festClaimable(S, w);
    var row = sheetRow(decoIcon(f.deco), L.decoById(f.deco).name,
      owned ? (can ? '이미 있어요 · 대신 ' + L.FEST_GIFT_COINS + '코인' : '오늘 선물은 받았어요') : '이 축제에서만 받는 장식' + (f.recipe ? ' · 송편 레시피도' : ''), can ? '' : 'idle');
    var b = document.createElement('button'); b.type = 'button';
    b.textContent = can ? (w.id === 'winter' && !owned ? '만들기' : '받기') : '받음'; b.disabled = !can;
    b.addEventListener('click', function () {
      var r = L.festClaim(S, festNow(now()));
      if (!r) return;
      var msg = r.deco ? josa(L.decoById(r.deco).name, '이', '가') + ' 생겼다 · ' + (r.stored ? '보관함에' : '마당에 놓았다') : '축제 선물 +' + r.coins;
      toast(msg + (r.recipe ? ' · 송편 레시피를 배웠다' : ''), 3200);
      refresh(); renderFest(); festKey = '';
    });
    row.appendChild(b);
    if (w.id === 'winter' && owned) {
      var r2 = sheetRow(decoIcon('snowman'), '눈사람 꾸미기', snowWear(), '');
      var b2 = document.createElement('button'); b2.type = 'button'; b2.textContent = '꾸미기';
      b2.addEventListener('click', function () { L.snowmanStyle(S); refresh(); renderFest(); });
      r2.appendChild(b2);
    }
    var fish = L.fishById(f.fish), got = S.dex.fish[fish.id];
    h = document.createElement('h3'); h.textContent = '축제 물고기'; sheetEl.appendChild(h);
    var fc = fishCanvas(fish.id, !got); fc.style.width = '32px'; fc.style.height = '16px';
    sheetRow(fc, got ? fish.name : '???', fish.hint + (got ? ' · 도감에 있어요' : ''), got ? '' : 'idle');
    var p = document.createElement('p'); p.className = 'note';
    p.textContent = '축제 날엔 주문 게시판에 축제 주문(코인 ×' + L.FEST_ORDER_MULT + ', ★+1)이 자주 올라와요';
    sheetEl.appendChild(p);
    festSchedule(t);
  }
  function snowWear() {
    var n = (S.fest && S.fest.snow) || 0;
    return n ? L.SNOW_STYLES.slice(0, n).join(' · ') : '아직 맨몸 · 눌러서 하나씩';
  }
  // the four festivals, soonest first, with when they come next
  function festSchedule(t) {
    var h = document.createElement('h3'); h.textContent = '축제 날짜';
    var hb = document.createElement('b'); hb.textContent = '계절마다 수요일'; h.appendChild(hb); sheetEl.appendChild(h);
    festRows(t, sheetRow);
  }
  function festRows(t, rowFn) {
    var cur = festId(t);
    L.SEASONS.map(function (id) { return { id: id, w: L.festivalNextOf(id, t, TZ) }; })
      .sort(function (a, b) { return a.w.start - b.w.start; })
      .forEach(function (e) {
        var on = e.id === cur || (festOverride === undefined && t >= e.w.start && t < e.w.end), ic = document.createElement('canvas'); ic.width = 7; ic.height = 7;
        spr(FEST_IC[e.id], 0, 0, false, ic.getContext('2d'));
        rowFn(ic, L.FESTIVALS[e.id].name + (on ? ' · 지금!' : ''), on ? fmtReal(festNow(t).end - t) + ' 남음' : fmtWhen(e.w.start) + ' · ' + fmtReal(e.w.start - t) + ' 뒤', on ? '' : 'idle');
      });
  }
  // 달력 (오늘 tab): current / next festival with its countdown
  function renderFestCal() {
    var t = now(), w = festNow(t), nx = w || L.nextFestival(t, TZ);
    var h3 = document.createElement('h3'); h3.textContent = '계절 축제';
    var b = document.createElement('b'); b.textContent = w ? '지금 축제 중' : '다음 축제'; h3.appendChild(b); calEl.appendChild(h3);
    var r = document.createElement('div'); r.className = 'up festRow';
    var ic = document.createElement('canvas'); ic.width = 7; ic.height = 7; spr(FEST_IC[nx.id], 0, 0, false, ic.getContext('2d'));
    var n = document.createElement('div'); n.className = 'n'; n.textContent = L.FESTIVALS[nx.id].name;
    var sm = document.createElement('small');
    sm.textContent = w ? fmtReal(w.end - t) + ' 남음 · ' + L.FESTIVALS[nx.id].desc : fmtWhen(nx.start) + ' · ' + fmtReal(nx.start - t) + ' 뒤';
    n.appendChild(sm); r.appendChild(ic); r.appendChild(n);
    var go = document.createElement('button'); go.type = 'button'; go.textContent = w ? '가 보기' : '날짜';
    go.addEventListener('click', function () { calEl.hidden = true; openFest(); });
    r.appendChild(go);
    calEl.appendChild(r);
  }

  // ---------- sky effects ----------
  function festPetals(tt) {
    for (var k = 0; k < 16; k++) {
      var y = (hash(k * 5 + 11) * (H + 10) + tt * 12 * (0.7 + hash(k + 3) * 0.6)) % (H + 10) - 5;
      var x = (hash(k * 13 + 2) * W + tt * 7 + Math.sin(tt * 1.3 + k) * 6) % W;
      var flip = Math.floor(tt * 2.5 + k) % 2;
      px(x, y, flip ? 2 : 1, flip ? 1 : 2, 0); px(x + 1, y + 1, 1, 1, 2);
    }
  }
  // grayscale fireworks: a burst every ~1.4 s at a fixed-looking random spot, a ring of sparks that falls and fades
  function festFireworks(tt, top, span) {
    var period = 1.4;
    for (var n = 0; n < 2; n++) {
      var slot = Math.floor(tt / period) - n, age = tt - slot * period;
      if (age > 1.6) continue;
      var cx = 20 + hash(slot * 7 + 1) * (W - 40), cy = top + hash(slot * 3 + 5) * span, r = 3 + age * 13;
      ctx.globalAlpha = Math.max(0, 1 - age / 1.6);
      if (age < 0.25) px(cx, cy + (0.25 - age) * 60, 1, 3, 0);
      for (var k = 0; k < 12; k++) {
        var a = k / 12 * Math.PI * 2 + slot;
        px(cx + Math.cos(a) * r, cy + Math.sin(a) * r + age * age * 6, 1, 1, k % 3 ? 0 : 1);
        if (age > 0.3) px(cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6 + age * age * 4, 1, 1, 2);
      }
      ctx.globalAlpha = 1;
    }
  }
  function disk(cx, cy, r, c) {
    for (var dy = -r; dy <= r; dy++) { var hw = Math.round(Math.sqrt(r * r - dy * dy)); px(cx - hw, cy + dy, hw * 2 + 1, 1, c); }
  }
  function festMoon(x, y) { disk(x, y, 8, 1); disk(x, y, 7, 0); px(x - 3, y - 2, 2, 2, 1); px(x + 2, y + 2, 3, 2, 1); px(x - 1, y + 4, 2, 1, 1); }
  function drawFestival(tt) {
    var t = now(), id = festId(t);
    if (!id) return;
    var ph = curEnv(t).phase, dark = ph === 'night' || ph === 'evening';
    if (id === 'spring') festPetals(tt);
    else if (id === 'summer' && dark) festFireworks(tt, view === 'yard' ? 4 : 8, view === 'yard' ? 16 : 40);
    else if (id === 'autumn' && ph === 'night') {
      if (view === 'yard') festMoon(150, 12);
      else if (view === 'farm' && scene === 'pond') {
        // the full moon is behind you: its reflection wobbles on the pond
        for (var k = 0; k < 5; k++) { var w = 10 - k * 2 + Math.round(Math.sin(tt * 2 + k)); px(POND.cx + 18 - w / 2, POND.cy - 18 + k * 2, w, 1, 0); }
      }
    } else if (id === 'winter' && view !== 'house') {
      for (var j = 0; j < 10; j++) { var sx = (hash(j * 17) * W + Math.sin(tt * 0.7 + j) * 4 + W) % W, sy = (hash(j * 29 + 3) * H + tt * 9) % H; px(sx, sy, 1, 1, 0); }
    }
  }

  // ---------- decoration art: recycled (잡동사니), treasure, festival ----------
  DRAW_DECO.canchime = function (x, y, tt) {
    px(x + 1, y, 1, 22, 4); px(x + 1, y, 11, 1, 4); px(x, y + 21, 4, 1, 4);
    for (var k = 0; k < 3; k++) {
      var sx = x + 5 + k * 3, len = 4 + k * 2, sw = Math.round(Math.sin(tt * 2 + k) * 0.6);
      px(sx, y + 1, 1, len, 3); px(sx - 1 + sw, y + 1 + len, 3, 4, 4); px(sx + sw, y + 2 + len, 1, 2, 2);
    }
  };
  DRAW_DECO.bootpot = function (x, y, tt) {
    px(x + 2, y + 7, 6, 11, 4); px(x + 2, y + 14, 10, 4, 4); px(x + 3, y + 8, 4, 9, 3); px(x + 3, y + 15, 8, 2, 3);
    var sw = Math.floor(tt * 1.2) % 4 === 0 ? 1 : 0;
    px(x + 4, y + 2, 1, 6, 3); px(x + 6, y + 3, 1, 5, 3);
    px(x + 3 + sw, y, 3, 3, 4); px(x + 4 + sw, y + 1, 1, 1, 0); px(x + 6, y + 2, 3, 2, 2);
  };
  DRAW_DECO.bottlelamp = function (x, y, tt, night) {
    px(x + 3, y + 9, 2, 9, 4); px(x + 1, y + 17, 6, 1, 4);
    px(x + 3, y, 2, 2, 4); px(x + 1, y + 2, 6, 7, 4);
    var glow = night ? (Math.floor(tt * 3) % 4 ? 0 : 1) : 2;
    px(x + 2, y + 3, 4, 5, glow); px(x + 3, y + 4, 1, 2, night ? 1 : 0);
  };
  DRAW_DECO.anchor = function (x, y) {
    px(x + 6, y, 4, 1, 4); px(x + 5, y + 1, 1, 2, 4); px(x + 10, y + 1, 1, 2, 4); px(x + 6, y + 3, 4, 1, 4);
    px(x + 7, y + 3, 2, 15, 4); px(x + 3, y + 6, 10, 2, 4);
    px(x + 1, y + 13, 2, 4, 4); px(x + 13, y + 13, 2, 4, 4); px(x + 2, y + 17, 12, 2, 4);
    px(x, y + 12, 3, 1, 4); px(x + 13, y + 12, 3, 1, 4); px(x + 8, y + 5, 1, 10, 2);
  };
  DRAW_DECO.shipwheel = function (x, y, tt) {
    var cx = x + 9, cy = y + 8, a0 = tt * 0.3;
    px(x + 8, y + 15, 2, 5, 4); px(x + 5, y + 19, 8, 1, 4);
    for (var k = 0; k < 8; k++) {
      var a = a0 + k * Math.PI / 4;
      for (var r = 1; r < 9; r++) px(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1, 1, r > 6 ? 4 : 3);
    }
    for (var j = 0; j < 28; j++) { var b = j / 28 * Math.PI * 2; px(cx + Math.cos(b) * 6, cy + Math.sin(b) * 6, 1, 1, 4); }
    px(cx - 1, cy - 1, 3, 3, 4);
  };
  DRAW_DECO.sakura = function (x, y, tt) {
    px(x + 11, y + 22, 4, 18, 4); px(x + 12, y + 23, 1, 17, 3); px(x + 8, y + 26, 4, 1, 4); px(x + 15, y + 24, 4, 1, 4);
    for (var k = 0; k < 70; k++) {
      var a = hash(k * 7 + 3) * Math.PI * 2, r = Math.sqrt(hash(k * 5 + 1)) * 12;
      px(x + 13 + Math.cos(a) * r, y + 13 + Math.sin(a) * r * 0.85, 2, 2, k % 5 === 0 ? 3 : k % 3 ? 1 : 0);
    }
    for (k = 0; k < 3; k++) { var fy = (tt * 8 + k * 13) % 22, fx = x + 4 + k * 8 + Math.sin(tt * 2 + k) * 2; px(fx, y + 18 + fy, 1, 1, 1); }
  };
  DRAW_DECO.firelamp = function (x, y, tt, night) {
    px(x + 4, y + 8, 2, 14, 4); px(x + 2, y + 21, 6, 1, 4);
    px(x + 1, y + 1, 8, 8, 4); px(x + 3, y, 4, 1, 4);
    var fl = Math.floor(tt * 6) % 3;
    px(x + 2, y + 2, 6, 6, night ? 0 : 1); px(x + 4, y + 3 + (fl === 1 ? 1 : 0), 2, 3, night ? 1 : 2);
    if (night && fl === 0) { px(x, y - 2, 1, 1, 0); px(x + 9, y - 1, 1, 1, 0); }
  };
  DRAW_DECO.moonrabbit = function (x, y) {
    px(x, y + 14, 14, 4, 4); px(x + 1, y + 15, 12, 2, 2);
    px(x + 3, y + 7, 8, 7, 4); px(x + 4, y + 8, 6, 5, 1);
    px(x + 7, y + 4, 5, 5, 4); px(x + 8, y + 5, 3, 3, 1); px(x + 10, y + 6, 1, 1, 4);
    px(x + 8, y, 1, 5, 4); px(x + 10, y + 1, 1, 4, 4);
    px(x + 1, y + 11, 3, 3, 4); px(x + 2, y + 12, 1, 1, 0);
  };
  DRAW_DECO.snowman = function (x, y) {
    var cx = x + 8, wear = (S.fest && S.fest.snow) || 0;
    disk(cx, y + 17, 6, 4); disk(cx, y + 17, 5, 0);
    disk(cx, y + 8, 4, 4); disk(cx, y + 8, 3, 0);
    px(cx - 2, y + 7, 1, 1, 4); px(cx + 1, y + 7, 1, 1, 4); px(cx, y + 15, 1, 1, 4); px(cx, y + 18, 1, 1, 4);
    if (wear >= 1) { px(cx - 3, y + 3, 7, 1, 4); px(cx - 2, y, 5, 3, 4); px(cx - 1, y + 1, 3, 1, 3); }
    if (wear >= 2) { px(cx - 4, y + 11, 9, 2, 3); px(cx + 2, y + 13, 2, 3, 3); }
    if (wear >= 3) { px(cx - 11, y + 13, 5, 1, 4); px(cx - 12, y + 11, 1, 2, 4); px(cx + 6, y + 13, 5, 1, 4); px(cx + 11, y + 11, 1, 2, 4); }
    if (wear >= 4) px(cx + 1, y + 9, 3, 1, 2);
  };

  // ---------- 불 조절 도전: the cook tab's extra button when a dish is ready ----------
  function heatButton(row) {
    row.appendChild(act('도전', function () { startHeat(); }, { label: '불 조절 도전 · 성공하면 값 ×' + L.HEAT_BONUS }));
  }
  function startHeat() {
    if (!L.potReady(S, now())) return;
    openMini('heat', L.newHeat(Math.random), '불 조절 도전', '탭해서 불 지피기 · 눈금 칸에 3초 머물면 성공');
  }
  function finishHeat(ok) {
    var d = L.takeDish(S, now(), ok ? L.HEAT_BONUS : 1);
    if (!d) return;
    var nm = L.itemInfo(d.id).name;
    toast((ok ? '불 조절 성공 · ' + nm + ' 값 ×' + L.HEAT_BONUS : nm + ' 완성 · 바구니에 담았다') + (d.first ? ' · 도감에 기록' : ''), 3000);
    refresh();
  }

  // console hooks for testing (attached by boot.js)
  function addFestHooks(FF) {
    // FF.festival('autumn') = pretend that festival is on now; FF.festival(null) = none; FF.festival() = follow the clock
    FF.festival = function (id) {
      festOverride = arguments.length ? (id || null) : undefined;
      festKey = ''; tickFest(now()); if (!calEl.hidden) renderCal();
      return festNow(now());
    };
    FF.fest = openFest;
    FF.heat = function () { if (!L.potReady(S, now())) { S.pot = { id: 'jam', until: now() }; } startHeat(); return mini; };
  }
