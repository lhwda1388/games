  // ---------- stage 10 ①: 낚시 대회 (cards, 달력 row, 박 영감 row, trophies), 한 해 결산 카드 (sheet + PNG), 농장 간판 ----------
  // Names typed by the player only ever reach the page through textContent and the canvas fillText.
  var CTZ = -new Date().getTimezoneOffset();
  var TIER_NAME = { gold: '금', silver: '은', bronze: '동' };

  // ----- ticks: settle the week / the year, then show what came of it -----
  function tickContestUI(t) {
    L.contestTick(S, t, CTZ);
    L.yearTick(S, t, CTZ);
    syncSignTx();
    if (!booted || reel) return;
    var n = L.contestNews(S);
    if (n) { showContestNews(n); save(); }
    var y = L.yearNews(S);
    if (y) {
      showCard({ kicker: '한 해 결산', title: '농장 ' + y.fy + '년차가 끝났어요', lines: [cardLines(y)[0], '도감 › 기록 탭에서 카드 보기 · PNG 저장'] });
      save();
    }
  }
  function fishText(b) { var f = L.fishById(b.id || b.fish); return (f ? f.name : '???') + ' ' + b.size.toFixed(1) + 'cm (' + L.contestPct(b.f) + ')'; }
  function showContestNews(n) {
    var lines = ['내 기록 ' + fishText(n.best), '박 영감 ' + fishText(n.mark)];
    if (n.win) {
      var d = L.decoById(n.trophy);
      lines.push(n.owned ? '같은 트로피가 이미 있어 코인으로 · +' + n.coins : d.name + ' · 마당' + (n.stored ? ' 보관함' : '') + '에 · +' + n.coins + '코인');
      showCard({ kicker: '박 영감 낚시 대회', title: TIER_NAME[n.tier] + ' 트로피! 박 영감을 이겼다', lines: lines });
    } else {
      showCard({ kicker: '박 영감의 편지', title: '이번 주는 박 영감 승', lines: [n.letter, '참가상 +' + n.coins + '코인'] });
    }
  }
  // after landFish (ui/pond.js): counts for the year card and the week's contest
  var contestAheadOnce = {};
  function contestAfterCatch(roll) {
    L.yearCatch(S, roll);
    var r = L.contestCatch(S, roll, now(), CTZ);
    if (!r || !r.best) return;
    var wk = S.cont.wk;
    if (r.ahead && !contestAheadOnce[wk]) {
      contestAheadOnce[wk] = true;
      setTimeout(function () { toast('낚시 대회 · 박 영감 기록(' + L.contestPct(r.mark.f) + ')을 넘었다! · 이번 주 ' + L.contestPct(r.f), 3600); }, 900);
    }
  }

  // ----- 달력 row (renderToday) -----
  function renderContestCal() {
    var st = L.contestState(S, now(), CTZ);
    if (!st) return;
    var h3 = document.createElement('h3'); h3.textContent = '박 영감 낚시 대회';
    var b = document.createElement('b'); b.textContent = fmtReal(st.left) + ' 남음 · 트로피 ' + st.won; h3.appendChild(b); calEl.appendChild(h3);
    var ahead = st.best && st.best.f >= st.mark.f;
    [[st.mark, '박 영감 기록'], [st.best, '내 이번 주 최고']].forEach(function (q) {
      var r = document.createElement('div'); r.className = 'dx' + (q[0] ? '' : ' unk');
      var ic = q[0] ? fishCanvas(q[0].id || q[0].fish) : fishCanvas('crucian', true); ic.className = 'sq';
      var nm = document.createElement('div'); nm.className = 'n'; nm.textContent = q[1];
      var sm = document.createElement('small'); sm.textContent = q[0] ? fishText(q[0]) : '아직 없음 · 이번 주에 낚은 물고기 중 크기 %가 제일 높은 것';
      nm.appendChild(sm);
      var v = document.createElement('div'); v.className = 'v'; v.textContent = q[0] ? L.contestPct(q[0].f) : '—';
      r.appendChild(ic); r.appendChild(nm); r.appendChild(v); calEl.appendChild(r);
    });
    note(st.best ? (ahead ? '지금은 앞서는 중 · 주말까지 지키면 트로피' : '조금 더 큰 녀석을 · 종마다 크기 % 기준') : '현실 일주일 대회 · 월요일에 결과 · 져도 잃는 건 없어요');
  }

  // ----- 박 영감 visit sheet row (renderVil) -----
  function contestVilRow() {
    if (!S.cont && !L.contestOk(S)) return;
    var r = sheetRow(faceCanvas('fisher'), '낚시 대회', '이번 주 기록 겨루기 · 물어보면 지금 형편을 알려 줘요');
    r.appendChild(vBtn('물어보기', false, function () {
      var line = L.contestTalk(S, now(), CTZ);
      if (line) vilSay = '박 영감: ' + line;
      renderVil();
    }, '박 영감에게 낚시 대회 묻기'));
  }

  // ----- 도감 기록 tab: trophies, letters, year cards -----
  function weekLabel(wk) {
    var d = new Date(4 * 86400e3 + wk * 7 * 86400e3 - CTZ * 60e3);
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 주';
  }
  function renderContestRec() {
    var h3, b;
    if (S.cont) {
      var won = Object.keys(S.cont.won).map(Number).sort(function (a, c) { return c - a; });
      h3 = document.createElement('h3'); h3.textContent = '박 영감 낚시 대회';
      b = document.createElement('b'); b.textContent = '트로피 ' + won.length + '개'; h3.appendChild(b); dexEl.appendChild(h3);
      if (!won.length) { var q = document.createElement('p'); q.className = 'note'; q.textContent = '그 주에 낚은 가장 큰 물고기(크기 %)가 박 영감 기록을 넘으면 트로피'; dexEl.appendChild(q); }
      won.slice(0, 12).forEach(function (wk) {
        var t = S.cont.won[wk], id = L.trophyId(wk, t);
        recRow(decoIconC(id), L.decoById(id).name, weekLabel(wk) + ' 우승', TIER_NAME[t]);
      });
      S.cont.mail.slice().reverse().forEach(function (m) {
        var box = document.createElement('div'); box.className = 'letter';
        var lt = document.createElement('div'); lt.className = 'lt'; lt.textContent = '박 영감 · ' + weekLabel(m.wk); box.appendChild(lt);
        var tx = document.createElement('p'); tx.textContent = L.contestLetter(m); box.appendChild(tx); dexEl.appendChild(box);
      });
    }
    h3 = document.createElement('h3'); h3.textContent = '한 해 결산 카드';
    var cards = S.yr ? S.yr.cards : [];
    b = document.createElement('b'); b.textContent = cards.length + '장'; h3.appendChild(b); dexEl.appendChild(h3);
    var row = document.createElement('div'); row.className = 'yearBtns';
    var pre = document.createElement('button'); pre.type = 'button'; pre.textContent = '지금까지';
    pre.addEventListener('click', function () { var c = L.yearPreview(S, now(), CTZ); if (c) openYearCard(c, true); });
    row.appendChild(pre);
    cards.slice().reverse().forEach(function (c) {
      var bt = document.createElement('button'); bt.type = 'button'; bt.textContent = c.fy + '년차';
      bt.addEventListener('click', function () { openYearCard(c, false); });
      row.appendChild(bt);
    });
    dexEl.appendChild(row);
    var p = document.createElement('p'); p.className = 'note';
    p.textContent = '게임 1년(현실 4주)이 끝날 때마다 한 장 · 최근 ' + L.YEAR_KEEP + '장까지';
    dexEl.appendChild(p);
  }
  function decoIconC(id) {
    var z = L.decoById(id).sz, c = document.createElement('canvas'); c.width = z[0] + 2; c.height = z[1] + 2;
    var saved = ctx; ctx = c.getContext('2d');
    try { DRAW_DECO[id](1, 1, 0, false); } finally { ctx = saved; }
    return c;
  }

  // ----- 결산 카드: text lines + a monochrome canvas (PNG via an <a download> the player clicks) -----
  function cardLines(c) {
    var out = ['낚은 물고기 ' + c.n + '마리' + (c.big ? ' · 제일 큰 ' + L.fishById(c.big.id).name + ' ' + c.big.size.toFixed(1) + 'cm' : '')];
    out.push(c.dish ? '많이 만든 요리 ' + L.itemInfo(c.dish.id).name + ' ' + c.dish.n + '번 (모두 ' + c.dn + '번)' : '요리 ' + c.dn + '번');
    var names = c.open.map(function (id) { return L.guideById(id).name; });
    out.push(names.length ? '새로 연 곳 ' + names.slice(0, 4).join(' · ') + (names.length > 4 ? ' 외 ' + (names.length - 4) : '') : '새로 연 곳 없음');
    out.push('박물관 ' + c.mus[0] + ' → ' + c.mus[1] + ' / ' + c.mus[2]);
    return out;
  }
  var CARD_W = 180, CARD_H = 240, CARD_K = 3;
  function drawYearCard(c, preview) {
    var cv2 = document.createElement('canvas'); cv2.width = CARD_W * CARD_K; cv2.height = CARD_H * CARD_K;
    var g = cv2.getContext('2d'), saved = ctx, font = getComputedStyle(document.documentElement).getPropertyValue('--font');
    g.imageSmoothingEnabled = false;
    g.scale(CARD_K, CARD_K);
    ctx = g;
    try {
      px(0, 0, CARD_W, CARD_H, 0);
      px(3, 3, CARD_W - 6, 2, 4); px(3, CARD_H - 5, CARD_W - 6, 2, 4); px(3, 3, 2, CARD_H - 6, 4); px(CARD_W - 5, 3, 2, CARD_H - 6, 4);
      px(7, 7, CARD_W - 14, 1, 2); px(7, CARD_H - 8, CARD_W - 14, 1, 2); px(7, 7, 1, CARD_H - 14, 2); px(CARD_W - 8, 7, 1, CARD_H - 14, 2);
      // the sign with the farm name
      drawSignArt(CARD_W / 2 - 40, 14, 80, 24, c.sign || 0);
      var txt = function (s, x, y, size, w, col, al) {
        g.fillStyle = G[col === undefined ? 4 : col]; g.font = (w || 400) + ' ' + size + 'px ' + font; g.textAlign = al || 'left'; g.textBaseline = 'middle';
        g.fillText(s, x, y, CARD_W - 24);
      };
      txt(c.name || '우리 농장', CARD_W / 2, 27, 10, 700, 4, 'center');
      txt('농장 ' + c.fy + '년차 ' + (preview ? '· 지금까지' : '결산'), CARD_W / 2, 56, 12, 700, 4, 'center');
      px(20, 66, CARD_W - 40, 1, 3);
      var y = 78, rows = [
        ['낚은 물고기', c.n + '마리', null],
        ['제일 큰 물고기', c.big ? L.fishById(c.big.id).name + ' ' + c.big.size.toFixed(1) + 'cm' : '—', c.big ? fishCanvas(c.big.id) : null],
        ['많이 만든 요리', c.dish ? L.itemInfo(c.dish.id).name + ' ×' + c.dish.n : '—', c.dish ? itemIcon(c.dish.id) : null],
        ['요리한 횟수', c.dn + '번', null],
        ['박물관', c.mus[0] + ' → ' + c.mus[1] + ' / ' + c.mus[2], null]
      ];
      rows.forEach(function (r) {
        txt(r[0], 16, y, 8, 400, 3);
        txt(r[1], CARD_W - 16, y + 11, 10, 700, 4, 'right');
        if (r[2]) g.drawImage(r[2], 16, y + 5, r[2].width, r[2].height);
        y += 24;
      });
      txt('새로 연 곳', 16, y, 8, 400, 3);
      var names = c.open.map(function (id) { return L.guideById(id).name; });
      var line = names.length ? names.slice(0, 6).join(' · ') + (names.length > 6 ? ' 외 ' + (names.length - 6) : '') : '—';
      // two short lines at most
      var cut = line.length > 20 ? line.lastIndexOf(' · ', 20) : -1;
      if (cut > 0) { txt(line.slice(0, cut), 16, y + 11, 9, 700); txt(line.slice(cut + 3), 16, y + 22, 9, 700); }
      else txt(line, 16, y + 11, 9, 700);
    } finally { ctx = saved; }
    return cv2;
  }
  function openYearCard(c, preview) {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true;
    sheetKind = 'year'; sheetEl.hidden = false;
    sheetHead(preview ? '올해 지금까지' : '농장 ' + c.fy + '년차 결산');
    var pic = drawYearCard(c, preview); pic.className = 'yearCard';
    pic.setAttribute('role', 'img'); pic.setAttribute('aria-label', cardLines(c).join(' · '));
    sheetEl.appendChild(pic);
    var a = document.createElement('a'); a.className = 'yearSave'; a.textContent = 'PNG로 저장';
    a.download = 'farm-' + c.fy + (preview ? '-now' : '') + '.png';
    a.href = pic.toDataURL('image/png');
    sheetEl.appendChild(a);
    var p = document.createElement('p'); p.className = 'note';
    p.textContent = preview ? '이번 해가 끝나면 이 카드가 기록에 남아요' : '지난 카드는 도감 › 기록 탭에';
    sheetEl.appendChild(p);
  }

  // ----- 농장 간판: canvas art on the farm (below the fence, left), the name as DOM text over it -----
  var SIGN_R = { x: 23, y: 102, w: 22, h: 10 };
  function drawSignArt(x, y, w, h, sign) {
    var id = (L.SIGNS[sign] || L.SIGNS[0]).id, k = Math.max(1, Math.round(h / 10));
    if (id === 'board') { px(x + 2 * k, y + h, k, 3 * k, 4); px(x + w - 3 * k, y + h, k, 3 * k, 4); px(x, y, w, h, 4); px(x + k, y + k, w - 2 * k, h - 2 * k, 0); }
    else if (id === 'arch') {
      px(x, y + 2 * k, k, h + k, 4); px(x + w - k, y + 2 * k, k, h + k, 4);
      px(x + 2 * k, y, w - 4 * k, k, 4); px(x + k, y + k, k, k, 4); px(x + w - 2 * k, y + k, k, k, 4);
      px(x + 2 * k, y + 2 * k, w - 4 * k, h - 2 * k, 4); px(x + 3 * k, y + 3 * k, w - 6 * k, h - 4 * k, 0);
    } else if (id === 'round') {
      px(x + w / 2 - k / 2, y + h, k, 3 * k, 4);
      px(x + 2 * k, y, w - 4 * k, h, 4); px(x, y + 2 * k, w, h - 4 * k, 4); px(x + k, y + k, w - 2 * k, h - 2 * k, 4);
      px(x + 2 * k, y + k, w - 4 * k, h - 2 * k, 1); px(x + k, y + 2 * k, w - 2 * k, h - 4 * k, 1);
    } else if (id === 'flag') {
      px(x, y - 2 * k, k, h + 5 * k, 4); px(x + k, y, w - k, h, 4); px(x + 2 * k, y + k, w - 3 * k, h - 2 * k, 0);
      px(x + w - 2 * k, y + h - k, 2 * k, k, 0);   // a notch at the tail
    } else {   // fish
      px(x + w / 2 - k / 2, y + h, k, 3 * k, 4);
      px(x + 2 * k, y, w - 7 * k, h, 4); px(x, y + 2 * k, 3 * k, h - 4 * k, 4);
      px(x + w - 5 * k, y + k, 2 * k, h - 2 * k, 4); px(x + w - 3 * k, y, 3 * k, h, 4);
      px(x + 3 * k, y + k, w - 9 * k, h - 2 * k, 0); px(x + 4 * k, y + 2 * k, k, k, 4);
    }
  }
  var signTx = document.createElement('div');
  signTx.id = 'farmSignTx'; signTx.hidden = true; signTx.setAttribute('aria-hidden', 'true');
  app.appendChild(signTx);
  var signKey = '';
  // the name tag follows the scene (other scenes draw themselves and never call drawFarmSign)
  function syncSignTx() {
    var nm = L.farmName(S), on = view === 'farm';
    var key = on + '|' + nm;
    if (key === signKey) return;
    signKey = key;
    signTx.hidden = !on;
    signTx.textContent = nm || '간판';
    signTx.className = nm ? '' : 'blank';
  }
  function drawFarmSign() {
    syncSignTx();
    drawSignArt(SIGN_R.x, SIGN_R.y, SIGN_R.w, SIGN_R.h, (S.farm && S.farm.sign) || 0);
  }
  function tapFarmSign(x, y) {
    if (x < SIGN_R.x - 1 || x > SIGN_R.x + SIGN_R.w + 1 || y < SIGN_R.y - 3 || y > SIGN_R.y + SIGN_R.h + 4) return false;
    openFarmSheet();
    return true;
  }
  var farmPick = 0;
  function openFarmSheet() {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true;
    sheetKind = 'farm'; sheetEl.hidden = false;
    farmPick = (S.farm && S.farm.sign) || 0;
    renderFarmSheet();
  }
  function renderFarmSheet() {
    sheetHead('농장 간판');
    var row = document.createElement('div'); row.className = 'shareRow';
    var f = document.createElement('input'); f.type = 'text'; f.className = 'field'; f.value = L.farmName(S);
    f.placeholder = '농장 이름 (' + L.FARM_NAME_MAX + '자)'; f.maxLength = L.FARM_NAME_MAX * 2;
    f.setAttribute('aria-label', '농장 이름'); f.spellcheck = false; f.autocomplete = 'off';
    row.appendChild(f); sheetEl.appendChild(row);
    var h3 = document.createElement('h3'); h3.textContent = '간판 모양'; sheetEl.appendChild(h3);
    var pick = document.createElement('div'); pick.className = 'signPick'; pick.setAttribute('role', 'group');
    L.SIGNS.forEach(function (sg, k) {
      var b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-pressed', String(k === farmPick));
      b.setAttribute('aria-label', sg.name);
      var c = document.createElement('canvas'); c.width = 30; c.height = 20;
      var saved = ctx; ctx = c.getContext('2d');
      try { drawSignArt(4, 4, 22, 10, k); } finally { ctx = saved; }
      var s2 = document.createElement('span'); s2.textContent = sg.name;
      b.appendChild(c); b.appendChild(s2);
      b.addEventListener('click', function () { farmPick = k; keep(); });
      pick.appendChild(b);
    });
    sheetEl.appendChild(pick);
    var p = document.createElement('p'); p.className = 'note';
    p.textContent = '밭 아래 간판에 걸려요 · 결산 카드와 친구 기록 코드에도 나와요 · 비워 두면 간판만';
    sheetEl.appendChild(p);
    function keep() { L.setFarm(S, f.value, farmPick); save(); signKey = ''; renderFarmSheet(); }
    f.addEventListener('change', function () { L.setFarm(S, f.value, farmPick); f.value = L.farmName(S); save(); signKey = ''; });
    f.addEventListener('keydown', function (e) { if (e.key === 'Enter') f.blur(); });
  }

  // ----- trophy decorations: 4 shapes × 금·은·동 -----
  var TROPHY_FILL = { g: [4, 0], s: [2, 0], b: [3, 1] };   // body, shine
  function drawTrophy(shape, t, x, y, tt) {
    var c = TROPHY_FILL[t], body = c[0];
    px(x + 2, y + 15, 8, 3, 4); px(x + 3, y + 14, 6, 1, 3);                  // plinth
    if (shape === 'trcup') {
      px(x + 5, y + 10, 2, 4, body); px(x + 4, y + 12, 4, 1, body);
      px(x + 2, y + 2, 8, 7, 4); px(x + 3, y + 3, 6, 5, body); px(x + 3, y + 9, 6, 1, 4);
      px(x, y + 3, 2, 1, 4); px(x, y + 3, 1, 4, 4); px(x + 10, y + 3, 2, 1, 4); px(x + 11, y + 3, 1, 4, 4);
      px(x + 4, y + 4, 1, 3, c[1]);
    } else if (shape === 'trshield') {
      px(x + 5, y + 12, 2, 2, 4);
      px(x + 1, y + 1, 10, 8, 4); px(x + 2, y + 9, 8, 2, 4); px(x + 4, y + 11, 4, 1, 4);
      px(x + 2, y + 2, 8, 7, body); px(x + 3, y + 9, 6, 1, body);
      px(x + 5, y + 3, 2, 5, c[1]); px(x + 3, y + 5, 6, 1, c[1]);
    } else if (shape === 'trfish') {
      px(x + 5, y + 10, 2, 4, 4);
      px(x + 1, y + 4, 8, 5, 4); px(x + 9, y + 3, 3, 2, 4); px(x + 9, y + 8, 3, 2, 4); px(x + 9, y + 5, 1, 3, 4);
      px(x + 2, y + 5, 6, 3, body); px(x + 3, y + 5, 1, 1, c[1] === 0 ? 0 : 4); px(x + 5, y + 6, 2, 1, c[1]);
    } else {
      px(x + 5, y + 9, 2, 5, 4);
      px(x + 2, y + 1, 8, 8, 4); px(x + 3, y + 2, 6, 6, body);
      px(x + 5, y + 3, 2, 4, c[1]); px(x + 4, y + 4, 4, 2, c[1]);
      px(x + 1, y + 7, 2, 2, 4); px(x + 9, y + 7, 2, 2, 4);
    }
    if (t === 'b') for (var k = 0; k < 4; k++) px(x + 3 + k * 2, y + 16, 1, 1, 2);   // 동: a dotted plinth
    if (t === 'g' && Math.floor((tt || 0) * 1.5) % 6 === 0) px(x + 10, y, 1, 1, 0);   // 금: a slow glint
  }
  L.TROPHY_SHAPES.forEach(function (sh) {
    ['g', 's', 'b'].forEach(function (t) {
      DRAW_DECO[sh.id + '_' + t] = function (x, y, tt) { drawTrophy(sh.id, t, x, y, tt); };
    });
  });

  // ---------- console hooks ----------
  function addContestHooks(FF) {
    // FF.contest() opens it; FF.contest(0.99) records a catch at that size %; FF.contest('end') ends the week now
    FF.contest = function (a) {
      if (!L.contestOk(S)) { S.res = S.res || { f: {}, lv: {}, rec: {}, unread: [] }; S.res.lv.fisher = Math.max(L.CONTEST_FRIEND, S.res.lv.fisher || 0); }
      L.contestTick(S, now(), CTZ);
      if (typeof a === 'number') { var f = L.fishById('crucian'); contestAfterCatch({ id: 'crucian', size: Math.round((f.min + (f.max - f.min) * a) * 10) / 10 }); }
      if (a === 'end') S.cont.wk--;
      save(); return L.contestState(S, now(), CTZ);
    };
    // FF.year() opens the 지금까지 card; FF.year('end') closes the current year now
    FF.year = function (a) {
      L.yearTick(S, now(), CTZ);
      if (a === 'end') { S.yr.y--; return null; }
      openYearCard(L.yearPreview(S, now(), CTZ), true); return S.yr;
    };
  }
