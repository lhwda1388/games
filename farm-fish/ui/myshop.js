  // ---------- 내 가게 (마을 upper lane, right end): 빈 가게 터 sign → the shop; its sheet holds 진열대·금고·꾸미기·등급 ----------
  // Logic: logic/myshop.js. Sales are worked out lazily; opening the sheet empties the 금고 into the wallet.
  // The spot sits right of the upper lane, left of the 이동 button; the 식당's '!' mark may draw over its foot.
  var MYS_AT = [134, 1, 26, 25];
  var MYS_WHY = { coins: '코인이 모자라요', village: '마을이 열리면 지을 수 있어요', built: '이미 가게가 있어요', max: '더는 안 돼요',
    have: '이미 달았어요', shop: '가게를 먼저 지어요', deco: '없는 꾸미기예요' };
  // 12×12 marks for the sheet rows ('4' ink, '3' dark, '2' mid, '0' paper)
  var MYS_ICON = {
    shop: ['............', '.4444444444.', '.4040404044.', '.4444444444.', '..42222224..', '..40004334..', '..40004334..',
      '..44444334..', '..40000334..', '..44444444..', '............', '............'],
    slot: ['............', '............', '............', '............', '............', '.4444444444.',
      '.4........4.', '.4........4.', '.4444444444.', '..4......4..', '............', '............'],
    till: ['............', '..44444444..', '..40000004..', '..40044004..', '..40000004..', '.4444444444.', '.4222222224.',
      '.4224422224.', '.4222222224.', '.4444444444.', '............', '............'],
    up: ['............', '.....44.....', '....4224....', '...422224...', '..44422444..', '....4224....', '....4224....',
      '....4224....', '....4444....', '............', '............', '............'],
    sign: ['............', '.4444444444.', '.4000000004.', '.4044040404.', '.4000000004.', '.4444444444.', '...4....4...',
      '...4....4...', '............', '............', '............', '............'],
    pot: ['............', '....3..3....', '...333333...', '....3333....', '.....33.....', '...444444...', '...422224...',
      '....4224....', '....4444....', '............', '............', '............'],
    lamp: ['.....44.....', '.....44.....', '....4444....', '...400004...', '...400004...', '...444444...', '.....00.....',
      '....0..0....', '............', '............', '............', '............'],
    bell: ['.....44.....', '....4444....', '...422224...', '...422224...', '..44444444..', '.....4......', '.....3......',
      '....333.....', '....333.....', '............', '............', '............'],
    flag: ['...4........', '...4444444..', '...4000004..', '...4044004..', '...4444444..', '...4........', '...4........',
      '...4........', '...4........', '..444.......', '............', '............']
  };
  var mysPend = { at: -1e9, n: 0 };   // throttled 금고 peek for the coin mark on the building

  function mysIcon(id) {
    var c = document.createElement('canvas'); c.width = 12; c.height = 12;
    spr(MYS_ICON[id], 0, 0, false, c.getContext('2d'));
    return c;
  }
  function mysPeekN() {
    var t = performance.now();
    if (t - mysPend.at > 1000) { mysPend.at = t; mysPend.n = S.mys ? L.mysPeek(S, now(), TZ).n : 0; }
    return mysPend.n;
  }

  // ---------- on the street ----------
  function mysDraw(tt) {
    var x = MYS_AT[0], y = MYS_AT[1], q = S.mys, k;
    if (!q) {   // 빈 가게 터: two posts, a board with a coin and a price line
      px(x + 6, y + 14, 1, 11, 3); px(x + 19, y + 14, 1, 11, 3);
      px(x + 3, y + 8, 20, 8, 3); px(x + 4, y + 9, 18, 6, 0);
      px(x + 6, y + 10, 4, 4, 4); px(x + 7, y + 11, 2, 2, 2);
      px(x + 12, y + 10, 8, 1, 3); px(x + 12, y + 12, 6, 1, 3);
      px(x + 2, y + 24, 22, 1, 2);
      return;
    }
    var e = curEnv(now()), dark = e.phase === 'night' || e.phase === 'evening', blink = reduceMotion ? 0 : Math.floor(tt * 2) % 2;
    if (q.dec.sign) {   // 간판: board on the roof, one dot per 등급
      px(x + 5, y, 16, 6, 4); px(x + 6, y + 1, 14, 4, 0);
      for (k = 0; k <= q.lv; k++) px(x + 8 + k * 2, y + 2, 1, 2, 4);
    }
    if (q.dec.flag) { var fw = reduceMotion ? 0 : Math.floor(tt * 3) % 2; px(x + 24, y, 1, 7, 4); px(x + 20, y + fw, 4, 3, 4); px(x + 21, y + 1 + fw, 2, 1, 0); }
    px(x, y + 6, 26, 1, 4);                                                                        // awning
    for (k = 0; k < 26; k += 3) px(x + k, y + 7, Math.min(3, 26 - k), 4, (k / 3) % 2 ? 0 : 2);
    px(x, y + 10, 26, 1, 4);
    px(x + 1, y + 11, 24, 14, 4); px(x + 2, y + 11, 22, 13, 1);                                    // wall
    px(x + 3, y + 13, 12, 9, 4); px(x + 4, y + 14, 10, 7, 0);                                      // shop window = 진열대
    px(x + 4, y + 17, 10, 1, 2); px(x + 4, y + 20, 10, 1, 2);
    for (k = 0; k < q.sl; k++) if (q.it[k]) px(x + 5 + (k % 4) * 2, y + 15 + (k >= 4 ? 3 : 0), 1, 2, 4);
    px(x + 16, y + 14, 7, 11, 4); px(x + 17, y + 15, 5, 10, 3); px(x + 20, y + 20, 1, 1, 0);       // door
    px(x, y + 24, 26, 1, 4);                                                                       // step
    if (q.dec.lamp) { [1, 23].forEach(function (lx) { px(x + lx, y + 11, 1, 1, 4); px(x + lx - 1, y + 12, 3, 2, dark ? 0 : 2); }); }
    if (q.dec.pot) { [-4, 26].forEach(function (ox) { px(x + ox, y + 21, 3, 4, 4); px(x + ox + 1, y + 21, 1, 3, 2); px(x + ox, y + 18, 1, 2, 3); px(x + ox + 2, y + 17, 1, 3, 3); px(x + ox + 1, y + 16, 1, 2, 3); }); }   // pots either side
    if (q.dec.bell) { var sw = reduceMotion ? 0 : Math.round(Math.sin(tt * 2)); px(x + 15, y + 11, 1, 1, 4); px(x + 14 + sw, y + 12, 3, 2, 3); }
    if (mysPeekN() > 0) { px(x + 18, y + 16, 3, 1, 4); px(x + 17, y + 17, 5, 3, 4); px(x + 18, y + 20, 3, 1, 4); px(x + 18, y + 17, 3, 3, blink ? 0 : 2); px(x + 19, y + 18, 1, 1, 4); }   // a coin on the door: the 금고 has sales
  }
  // the shop sells while the game stays open too: settle once a minute so the 12-hour cap only cuts time away
  var mysTickAt = 0;
  function mysTick() {
    var t = performance.now();
    if (!S.mys || t - mysTickAt < 60e3) return;
    mysTickAt = t; L.mysSettle(S, now(), TZ);
  }
  function mysTap(x, y) {
    if (!hit(MYS_AT, x, y, 1)) return false;
    mysOpen();
    return true;
  }

  // ---------- the sheet ----------
  function mysOpen() {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true;
    sheetKind = 'myshop'; sheetEl.hidden = false;
    var got = L.mysCollect(S, now(), TZ);
    if (got.c) { toast('자리 비운 사이 ' + got.n + '개 팔림 · +' + got.c.toLocaleString('ko-KR') + '코인', 3200); refresh(); save(); }
    mysPend.at = -1e9;
    mysRender();
    if (got.c) fxCoinsDom(sheetEl.querySelector('.wallet'));
  }
  function mysWhy(res) { toast(MYS_WHY[res.why] || '안 돼요'); }
  function mysDone(text) { if (text) toast(text); mysPend.at = -1e9; refresh(); save(); mysRender(); }
  function mysBtn(r, text, fn, label, off) {
    var a = r.querySelector('.acts');
    if (!a) { a = document.createElement('div'); a.className = 'acts'; r.appendChild(a); }
    a.appendChild(act(text, fn, { cls: 'max b', label: label || text, off: off }));
  }
  function mysH3(text, sub) {
    var h3 = document.createElement('h3'); h3.textContent = text;
    var b = document.createElement('b'); b.textContent = sub; h3.appendChild(b); sheetEl.appendChild(h3);
  }
  function mysNote(text) { var p = document.createElement('p'); p.className = 'note'; p.textContent = text; sheetEl.appendChild(p); }
  function mysMin(ms) { return Math.round(ms / 60e3) + '분'; }
  function mysRender() {
    var q = S.mys, t = now(), d = L.mktDay(t, TZ), k;
    if (!q) {
      sheetHead('빈 가게 터');
      var say0 = document.createElement('p'); say0.className = 'say';
      say0.textContent = '팻말: 가게 자리 팝니다. 진열대에 물건을 올려 두면 손님이 와서 사 가요.';
      sheetEl.appendChild(say0);
      var r0 = sheetRow(mysIcon('shop'), '가게 짓기', L.MYS_PRICE.toLocaleString('ko-KR') + '코인 · 진열대 ' + L.MYS_SLOTS0 + '칸으로 시작');
      mysBtn(r0, L.MYS_PRICE.toLocaleString('ko-KR'), function () {
        var res = L.mysBuild(S, now());
        if (!res.ok) { mysWhy(res); return; }
        mysDone('내 가게를 열었다!');
      }, '가게 짓기 ' + L.MYS_PRICE + '코인', S.coins < L.MYS_PRICE || !L.villageOk(S));
      return;
    }
    var bonus = L.mysBonus(S);
    sheetHead('내 가게');
    var say = document.createElement('p'); say.className = 'say';
    say.textContent = L.mysUnits(q) ? '손님이 약 ' + mysMin(L.mysGap(S)) + '마다 한 명씩 와서 하나씩 사 가요.' : '진열대가 비었어요. 아래에서 물건을 올려 주세요.';
    sheetEl.appendChild(say);
    // 금고: sales since the sheet opened
    var pk = L.mysPeek(S, t, TZ);
    var rt = sheetRow(mysIcon('till'), '금고', pk.c ? pk.n + '개 팔림 · ' + pk.c.toLocaleString('ko-KR') + '코인' : '비었어요 · 열 때마다 지갑으로');
    mysBtn(rt, '받기', function () { var g = L.mysCollect(S, now(), TZ); if (g.c) fxCoinsDom(sheetEl.querySelector('.wallet')); mysDone(g.c ? '+' + g.c.toLocaleString('ko-KR') + '코인' : ''); }, '금고 받기', !pk.c);
    // 진열대
    var used = 0; q.it.forEach(function (e) { if (e) used++; });
    mysH3('진열대', used + ' / ' + q.sl + '칸 · 칸마다 ' + L.MYS_STACK + '개까지');
    q.it.forEach(function (e, i) {
      if (!e) { sheetRow(mysIcon('slot'), '빈 칸', '아래 바구니·창고에서 올리기', 'off'); return; }
      var name = L.itemInfo(e.id).name, each = L.mysUnitPrice(e.id, e.v[0], d, bonus);
      var r = sheetRow(itemIcon(e.id), name + ' ×' + e.v.length, '다음 하나 약 ' + each.toLocaleString('ko-KR') + '코인 · 오늘 시세 × 등급 ×' + bonus);
      mysBtn(r, '내리기', function () {
        var n = L.mysTake(S, i, now(), TZ);
        if (!n) { toast('바구니가 꽉 찼어요'); mysRender(); return; }
        mysDone(josa(name, '을', '를') + ' 바구니에 담았다');
      }, name + ' 내리기');
    });
    var sc = L.mysSlotCost(S);
    if (sc) {
      var rs = sheetRow(mysIcon('slot'), '진열대 늘리기', q.sl + '칸 → ' + (q.sl + 1) + '칸 · 최대 ' + L.MYS_SLOTS_MAX + '칸');
      mysBtn(rs, sc.toLocaleString('ko-KR'), function () { var res = L.mysAddSlot(S, now(), TZ); if (!res.ok) { mysWhy(res); return; } mysDone('진열대가 한 칸 늘었다'); }, '진열대 늘리기 ' + sc + '코인', S.coins < sc);
    }
    // what can go up: basket, then 창고
    [['bag', '바구니', S.bag], ['shed', '창고', L.shedList(S)]].forEach(function (src) {
      if (src[0] === 'shed' && !src[2].length) return;
      mysH3(src[1] + '에서 올리기', src[0] === 'bag' ? '비싼 것부터 올라가요' : '주문용으로 둔 것');
      if (!src[2].length) { mysNote('바구니가 비었어요'); return; }
      shedGroups(src[2]).forEach(function (g) {
        var name = L.itemInfo(g.id).name, kept = src[0] === 'bag' && S.keep && S.keep[g.id];
        var r = sheetRow(itemIcon(g.id), name + ' ×' + g.n, (kept ? '지키기 중 · ' : '') + '진열대에 ' + q.it.reduce(function (n, e) { return n + (e && e.id === g.id ? e.v.length : 0); }, 0) + '개');
        function up(n) {
          var m = L.mysPut(S, g.id, n, src[0], now(), TZ);
          if (!m) { toast('진열대에 자리가 없어요'); return; }
          mysDone(josa(name, '을', '를') + ' ' + m + '개 올렸다');
        }
        if (g.n > 1) mysBtn(r, '1개', function () { up(1); }, name + ' 1개 올리기');
        mysBtn(r, g.n > 1 ? '전부' : '올리기', function () { up(g.n); }, name + ' 전부 올리기');
      });
    });
    // 꾸미기
    mysH3('꾸미기', '손님이 더 자주 와요');
    L.MYS_DECO.forEach(function (x) {
      var have = !!q.dec[x.id];
      var r = sheetRow(mysIcon(x.id), x.name, have ? '달았어요 · 손님 간격 −' + Math.round(x.cut * 100) + '%' : '손님 간격 −' + Math.round(x.cut * 100) + '%');
      mysBtn(r, have ? '있음' : x.price.toLocaleString('ko-KR'), function () {
        var res = L.mysBuyDeco(S, x.id, now(), TZ);
        if (!res.ok) { mysWhy(res); return; }
        mysDone(josa(x.name, '을', '를') + ' 달았다');
      }, x.name + ' 사기', have || S.coins < x.price);
    });
    // 가게 등급
    var lc = L.mysLevelCost(S);
    mysH3('가게 등급', (q.lv + 1) + '등급 · 값 ×' + bonus);
    var rl = sheetRow(mysIcon('up'), lc ? (q.lv + 2) + '등급으로' : '최고 등급', lc ? '값 ×' + bonus + ' → ×' + L.MYS_BONUS[q.lv + 1] : '더 올릴 수 없어요');
    if (lc) mysBtn(rl, lc.toLocaleString('ko-KR'), function () { var res = L.mysLevelUp(S, now(), TZ); if (!res.ok) { mysWhy(res); return; } mysDone('가게 등급이 올랐다'); }, '가게 등급 올리기 ' + lc + '코인', S.coins < lc);
    mysNote('값 = 물건 값 × 그날 장터 시세 × 등급 보너스 (많이 팔아도 시세는 안 내려가요) · 게임을 꺼 둬도 ' +
      L.MYS_CATCHUP / 3600e3 + '시간치까지 손님이 와요 · 지키기 물건도 직접 올리면 팔려요 · 지금까지 ' + q.n + '개 팔았어요');
  }
  // console hooks: FF.myshop() opens the shop sheet → s.mys; FF.myshop('build') gives the coins and builds it
  function addMysHooks(FF) {
    FF.myshop = function (cmd) {
      if (cmd === 'build' && !S.mys) { S.coins += L.MYS_PRICE; L.mysBuild(S, now()); }
      mysOpen();
      return S.mys || null;
    };
  }
