  // ---------- 가공 공방 (마당, right of the stepping stones under the lanterns): 공방 터 sign → the workshop; its sheet holds the machines ----------
  // Logic: logic/craft.js. Batches are worked out lazily; the building sparkles while something is done.
  // CFT_AT is also in logic/yard.js YARD_BLOCK, so a moved decoration never stands on it.
  var CFT_AT = [103, 104, 19, 14];
  var CFT_WHY = { coins: '코인이 모자라요', rep: '신뢰도 ★이 부족해요', built: '이미 공방이 있어요', max: '같은 기계는 ' + L.CFT_MAX + '대까지예요',
    craft: '공방을 먼저 지어요', kind: '없는 기계예요' };
  // 12×12 marks ('4' ink, '3' dark, '2' mid, '0' paper)
  var CFT_ICON = {
    shop: ['............', '.....44.....', '...443344...', '.4433333344.', '444444444444', '.4222222224.', '.4444224004.',
      '.4..4224004.', '.4..4224444.', '.4..4224..4.', '.4444444444.', '............'],
    jar: ['............', '....4444....', '...422224...', '..44444444..', '.4222222224.', '.4233222224.', '.4233222224.',
      '.4222222224.', '..42222224..', '...444444...', '............', '............'],
    rack: ['............', '444444444444', '.4..3...3.4.', '.4.333.3334.', '.4.303.3034.', '.4.333.3334.', '.4.333.3334.',
      '.4..3...3.4.', '.4.3.3.3.34.', '.4........4.', '.4........4.', '44........44'],
    salt: ['............', '...000000...', '..40000004..', '..44444444..', '.4333333334.', '.4333333334.', '.4300000034.',
      '.4333333334.', '.4333333334.', '..43333334..', '...444444...', '............'],
    cheese: ['............', '..44444444..', '.4222222224.', '.4444444444.', '.4222222224.', '.4222222224.', '.4444444444.',
      '.4222222224.', '.4222222224.', '.4444444444.', '..44444444..', '............'],
    cjam: ['............', '...444444...', '..42222224..', '...444444...', '...400004...', '..43333334..', '..43333334..',
      '..43333334..', '..43333334..', '...444444...', '............', '............'],
    cdry: ['............', '............', '............', '..........4.', '..4444444.44', '.422222224.4', '420232323244',
      '.422222224.4', '..4444444.44', '..........4.', '............', '............'],
    cjeot: ['............', '............', '...444444...', '..43333334..', '..44444444..', '.4000000004.', '.4022220204.',
      '.4000000004.', '.4000000004.', '..44444444..', '............', '............'],
    ccheese: ['............', '............', '.........44.', '......44004.', '...44000004.', '.4400200004.', '.4000002004.',
      '.4020000004.', '.4000000204.', '.4444444444.', '............', '............']
  };
  var cftReadyAt = { at: -1e9, n: 0 };   // throttled count of done machines for the sparkle and the 이동 dot
  var cftPick = -1;                      // the empty machine whose 넣기 list is open

  function cftIcon(id) {
    var c = document.createElement('canvas'); c.width = 12; c.height = 12;
    spr(CFT_ICON[id] || CFT_ICON.shop, 0, 0, false, c.getContext('2d'));
    return c;
  }
  function cftShown() { return !!S.craft || S.rep >= L.CFT_REP; }
  function cftReadyN() {
    var t = performance.now();
    if (t - cftReadyAt.at > 1000) { cftReadyAt.at = t; cftReadyAt.n = L.cftSettle(S, now()); }
    return cftReadyAt.n;
  }
  function cftBusy() { return !!S.craft && S.craft.m.some(function (m) { return m.id && !m.d; }); }

  // ---------- in the 마당 ----------
  function cftDraw(tt) {
    if (!cftShown()) return;
    var x = CFT_AT[0], y = CFT_AT[1];
    if (!S.craft) {   // 공방 터: a board on two posts with a hammer mark
      px(x + 1, y + 13, 17, 1, 2);
      px(x + 5, y + 7, 1, 7, 3); px(x + 13, y + 7, 1, 7, 3);
      px(x + 3, y + 2, 13, 6, 3); px(x + 4, y + 3, 11, 4, 0);
      px(x + 5, y + 4, 4, 2, 4); px(x + 7, y + 6, 1, 1, 4);
      px(x + 10, y + 4, 4, 1, 3); px(x + 10, y + 6, 3, 1, 3);
      return;
    }
    px(x + 14, y - 1, 2, 4, 4);                                                   // stovepipe
    px(x + 2, y + 1, 15, 1, 4); px(x + 1, y + 2, 17, 2, 3); px(x, y + 4, 19, 1, 4);   // roof
    px(x + 1, y + 5, 17, 9, 4); px(x + 2, y + 5, 15, 8, 1);                       // wall
    px(x + 3, y + 7, 6, 7, 4); px(x + 4, y + 8, 4, 6, 2);                         // open door
    px(x + 5, y + 11, 2, 2, 3);                                                   // a crock inside
    px(x + 11, y + 7, 5, 4, 4); px(x + 12, y + 8, 3, 2, 0);                       // window
    px(x, y + 13, 19, 1, 4);
    if (cftBusy() && !reduceMotion) for (var w = 0; w < 2; w++) { var ph = (tt * 0.6 + w * 0.5) % 1; px(x + 14 + w, y - 2 - Math.round(ph * 6), 1, 1, 2); }
    if (cftReadyN() > 0) sparkle(x + 18, y + 1, tt);
  }
  function cftTap(x, y) {
    if (!cftShown() || !hit(CFT_AT, x, y, 1)) return false;
    cftOpen();
    return true;
  }

  // ---------- the sheet ----------
  function cftOpen() {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true;
    sheetKind = 'craft'; sheetEl.hidden = false; cftPick = -1;
    cftRedraw = now(); cftRender();
  }
  function cftDone(text) { if (text) toast(text); cftReadyAt.at = -1e9; refresh(); save(); cftRender(); }
  function cftTime(ms) { var m = Math.ceil(ms / 60e3); return m >= 60 ? Math.floor(m / 60) + '시간' + (m % 60 ? ' ' + (m % 60) + '분' : '') : m + '분'; }
  function cftWon(n) { return n.toLocaleString('ko-KR'); }
  function cftRender() {
    var q = S.craft, t = now();
    if (!q) {
      sheetHead('공방 터');
      var say0 = document.createElement('p'); say0.className = 'say';
      say0.textContent = '팻말: 공방 지을 자리. 장독·건조대에 재료를 몇 시간 묵혀 두면 값이 올라요.';
      sheetEl.appendChild(say0);
      var r0 = sheetRow(cftIcon('shop'), '공방 짓기', cftWon(L.CFT_PRICE) + '코인 · ★' + L.CFT_REP + '부터 · 기계는 지은 뒤에 따로');
      mysBtn(r0, cftWon(L.CFT_PRICE), function () {
        var res = L.cftBuild(S);
        if (!res.ok) { toast(CFT_WHY[res.why] || '안 돼요'); return; }
        cftDone('가공 공방을 지었다!');
      }, '공방 짓기 ' + L.CFT_PRICE + '코인', S.coins < L.CFT_PRICE || S.rep < L.CFT_REP);
      return;
    }
    var ready = L.cftSettle(S, t);
    sheetHead('가공 공방');
    var say = document.createElement('p'); say.className = 'say';
    say.textContent = !q.m.length ? '아직 기계가 없어요. 아래에서 하나 들여 보세요.' : ready ? '다 된 것이 있어요. 꺼내면 바구니로 가요.' : '같은 재료를 ' + L.CFT_CAP + '개까지 넣으면 하나하나 값이 올라요.';
    sheetEl.appendChild(say);
    if (ready > 1) {
      var ra = sheetRow(cftIcon('shop'), '다 된 것 모두', '기계 ' + ready + '대 · 바구니 ' + S.bag.length + ' / ' + L.bagCap(S));
      mysBtn(ra, '모두 꺼내기', function () {
        var g = L.cftTakeAll(S, now());
        if (!g.n) { if (g.left) toast('바구니가 꽉 찼어요'); cftRender(); return; }   // nothing left: a stale button, just redraw
        cftDone(g.n + '개 꺼냈다' + (g.left ? ' · ' + g.left + '개는 기계에 남았어요' : ''));
      }, '다 된 것 모두 꺼내기');
    }
    // the machines, in the order bought
    if (q.m.length) mysH3('기계', q.m.length + '대');
    q.m.forEach(function (m, i) {
      var d = L.cftDef(m.k), r;
      if (!m.id) {
        r = sheetRow(cftIcon(m.k), d.name, '비었어요 · ' + d.what + ' 같은 것 ' + L.CFT_CAP + '개까지', 'off');
        mysBtn(r, cftPick === i ? '닫기' : '넣기', function () { cftPick = cftPick === i ? -1 : i; cftRender(); }, d.name + '에 넣기');
        if (cftPick === i) cftPutList(i, d);
        return;
      }
      var name = L.itemInfo(m.id).name;
      if (m.d) {
        r = sheetRow(cftIcon(d.out), d.name + ' · ' + d.outName + ' ×' + m.v.length, josa(name, '으로', '로') + ' 만들었어요 · 하나 약 ' + cftWon(L.cftValue(m.v[m.v.length - 1], m.k)) + '코인');
        mysBtn(r, '꺼내기', function () {
          var n = L.cftTake(S, i, now());
          var mi = S.craft.m[i];
          if (!n) { if (mi && mi.id && mi.d) toast('바구니가 꽉 찼어요'); cftRender(); return; }   // already empty: a stale button, just redraw
          cftDone(josa(d.outName, '을', '를') + ' ' + n + '개 바구니에 담았다');
        }, d.name + ' ' + d.outName + ' 꺼내기');
        return;
      }
      sheetRow(cftIcon(m.k), d.name + ' · ' + name + ' ×' + m.v.length, josa(d.outName, '이', '가') + ' 되는 중 · ' + cftTime(L.cftLeft(m, t)) + ' 남음');
    });
    // buying machines
    mysH3('기계 들이기', '같은 기계 ' + L.CFT_MAX + '대까지');
    L.CFT_M.forEach(function (d) {
      var c = L.cftCost(S, d.k), n = L.cftCount(S, d.k);
      var r = sheetRow(cftIcon(d.k), d.name + (n ? ' (' + n + '대)' : ''), d.what + ' → ' + d.outName + ' · ' + d.time / 3600e3 + '시간 · 값 ×' + d.mul);
      mysBtn(r, c ? cftWon(c) : '다 있음', function () {
        var res = L.cftBuy(S, d.k);
        if (!res.ok) { toast(CFT_WHY[res.why] || '안 돼요'); return; }
        cftDone(josa(d.name, '을', '를') + ' 들였다');
      }, d.name + ' 사기', !c || S.coins < c);
    });
    mysNote('나오는 하나의 값 = 넣은 그 하나의 값 × 기계 배수(넣은 값 ' + cftWon(L.CFT_VCAP) + '까지만 늘어나요) · 게임을 꺼 둬도 익어요 · 바구니가 차면 남은 건 기계에서 기다려요 · 2·3번째 기계는 값 ×' + L.CFT_MORE[1] + ', ×' + L.CFT_MORE[2]);
  }
  // tick: the open sheet follows the clock (countdowns, batches coming done); it closes when the 마당 is left
  var cftRedraw = 0;
  function tickCraftUI(t) {
    if (sheetKind !== 'craft' || sheetEl.hidden) return;
    if (view !== 'yard') { closeSheet(); return; }
    if (quiet() && t - cftRedraw > 10e3) { cftRedraw = t; cftRender(); }
  }
  // what the basket has for machine i (dearest go in first)
  function cftPutList(i, d) {
    var gs = shedGroups(S.bag).filter(function (g) { return L.cftAccepts(d.k, g.id); });
    if (!gs.length) { mysNote('바구니에 넣을 ' + josa(d.what, '이', '가') + ' 없어요'); return; }
    gs.forEach(function (g) {
      var name = L.itemInfo(g.id).name, most = Math.min(g.n, L.CFT_CAP);
      var r = sheetRow(itemIcon(g.id), name + ' ×' + g.n, (S.keep && S.keep[g.id] ? '지키기 중 · ' : '') + d.outName + ' ' + d.time / 3600e3 + '시간');
      function go(n) {
        var k = L.cftPut(S, i, g.id, n, now());
        if (!k) { toast('넣을 수 없어요'); return; }
        cftPick = -1;
        cftDone(d.name + '에 ' + josa(name, '을', '를') + ' ' + k + '개 넣었다');
      }
      if (most > 1) mysBtn(r, '1개', function () { go(1); }, name + ' 1개 넣기');
      mysBtn(r, most + '개', function () { go(most); }, name + ' ' + most + '개 넣기');
    });
  }
  // 도감: one row per crafted good
  function renderCraftDex(row) {
    var h3 = document.createElement('h3'); h3.textContent = '가공품';
    var b = document.createElement('b'); b.textContent = L.cftDexCount(S) + ' / ' + L.CFT_M.length; h3.appendChild(b);
    dexEl.appendChild(h3);
    if (!S.craft) { var p = document.createElement('p'); p.className = 'note'; p.textContent = '★' + L.CFT_REP + '에 마당 공방 터에서 공방을 지으면 만들 수 있어요'; dexEl.appendChild(p); }
    L.CFT_M.forEach(function (d) {
      var n = S.craft ? S.craft.dx[d.out] || 0 : 0, ic = cftIcon(d.out); ic.className = 'sq';
      row(ic, n ? d.outName : '???', n ? d.name + ' · ' + d.what + ' · 값은 넣은 것 ×' + d.mul : d.name + '에서 ' + d.time / 3600e3 + '시간', n ? n + '개' : '', !n);
    });
  }
  // console hooks: FF.craft() opens the sheet → s.craft; FF.craft('build') gives ★/coins and builds;
  // FF.craft('buy', k) gives the coins and buys; FF.craft('put', i, id, n) gives the items and puts them in;
  // FF.craft('done') makes every batch done now; FF.craft('take') takes everything out
  function addCftHooks(FF) {
    FF.craft = function (cmd, a, b, c) {
      var t = now();
      if (cmd === 'build' && !S.craft) { S.rep = Math.max(S.rep, L.CFT_REP); S.coins += L.CFT_PRICE; L.cftBuild(S); }
      if (cmd === 'buy' && S.craft) { S.coins += L.cftCost(S, a); L.cftBuy(S, a); }
      if (cmd === 'put' && S.craft) { for (var k = 0; k < (c || 1); k++) S.bag.push({ id: b, v: L.itemInfo(b).price }); L.cftPut(S, a, b, c || 1, t); }
      if (cmd === 'done' && S.craft) S.craft.m.forEach(function (m) { if (m.id) m.t = t - L.cftDef(m.k).time; });
      if (cmd === 'take') L.cftTakeAll(S, t);
      cftReadyAt.at = -1e9; refresh(); save();
      cftOpen();
      return S.craft || null;
    };
  }
