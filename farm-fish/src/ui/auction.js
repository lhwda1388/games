  // ---------- stage 11 ②: 어판장 경매 (sign + sheet), 기차 떠돌이 상인 (train + sheet), 달력 row, port deco art ----------
  // Lane ① (port scene) calls drawPortExtra_auction(tt) / tapPortExtra_auction(x, y) when they exist.
  var AUC_TZ = -new Date().getTimezoneOffset();
  var AUC_SIGN = { x: 44, y: 90, w: 30, h: 22 };       // 어판장 앞 경매 표지 (post + board)
  var AUC_TRAIN_Y = 30, AUC_TRAIN_REST = 70, AUC_TRAIN_IN = 3;   // track row, parked x, seconds to pull in
  var AUC_SELLER = { x: 54, y: 28, w: 10, h: 16 };     // the 상인 by the parked train
  var aucTrainDay = null, aucTrainT0 = 0, aucTrainIn = false;
  var AUC_WHY = { closed: '어판장이 아직 문을 안 열었어요', week: '이번 주 경매 물고기가 아니에요', sold: '이번 주엔 이미 냈어요', need: '바구니에 그 물고기가 없어요',
    day: '오늘 물건이 아니에요', picked: '오늘은 이미 하나 골랐어요 · 내일 또 와요', coins: '코인이 모자라요' };

  // ----- port scene: sign, train, 상인 -----
  function drawPortExtra_auction(tt) {
    if (L.aucOpen(S)) drawAucSign(tt);
    if (L.traderOpen(S)) drawAucTrain(tt);
  }
  function drawAucSign(tt) {
    var r = AUC_SIGN, ids = L.aucFish(S, now(), AUC_TZ), sold = S.port.auc ? S.port.auc.sold : {};
    px(r.x + 4, r.y + r.h - 6, 2, 8, 4); px(r.x + r.w - 6, r.y + r.h - 6, 2, 8, 4);
    px(r.x, r.y, r.w, r.h - 4, 4); px(r.x + 1, r.y + 1, r.w - 2, r.h - 6, 0);
    px(r.x + 2, r.y + 2, r.w - 4, 1, 2);   // 경매 title rule
    ids.forEach(function (id, k) {
      var fx = r.x + 3 + k * 9, fy = r.y + 7, c = sold[id] ? 2 : 4;
      px(fx, fy + 1, 5, 3, c); px(fx + 5, fy, 2, 1, c); px(fx + 5, fy + 4, 2, 1, c); px(fx + 1, fy + 2, 1, 1, 0);
    });
    // a small hammer nods when something is still unsold
    if (ids.some(function (id) { return !sold[id]; }) && Math.floor(tt * 1.5) % 4 === 0) px(r.x + r.w - 4, r.y - 3, 3, 2, 3);
  }
  function aucTrainX(tt) {
    var day = L.traderDay(now(), AUC_TZ);
    if (aucTrainDay !== day) { aucTrainDay = day; aucTrainT0 = tt; }   // first port visit of the real day: it pulls in
    var k = Math.min(1, (tt - aucTrainT0) / AUC_TRAIN_IN), e = 1 - (1 - k) * (1 - k);
    aucTrainIn = k >= 1;
    return { x: Math.round(W + (AUC_TRAIN_REST - W) * e), in: aucTrainIn };
  }
  function drawAucTrain(tt) {
    var y = AUC_TRAIN_Y, t = aucTrainX(tt), x = t.x;
    px(0, y + 14, W, 1, 3); for (var k = 0; k < W; k += 6) px(k, y + 15, 3, 1, 2);   // track + sleepers
    // engine (front left) + two cars
    px(x, y + 2, 22, 11, 4); px(x + 2, y + 4, 6, 4, 1); px(x + 16, y - 3, 4, 6, 4); px(x - 2, y + 10, 3, 3, 4);
    [26, 52].forEach(function (o) {
      px(x + o, y + 3, 24, 10, 4); px(x + o + 1, y + 4, 22, 1, 2);
      for (var w = 0; w < 3; w++) px(x + o + 3 + w * 7, y + 6, 4, 3, S.port && aucNight() ? 1 : 0);
    });
    for (k = 0; k < 6; k++) px(x + 3 + k * 13, y + 13, 3, 2, 3);   // wheels
    if (!t.in) { var p = Math.floor(tt * 6) % 3; px(x + 17 - p, y - 6 - p * 2, 3, 2, 2); px(x + 19 + p, y - 10 - p, 2, 2, 1); return; }
    // the 상인: hat, coat, a pack; bobs while today's pick is still open
    var r = AUC_SELLER, b = !L.traderPicked(S, now(), AUC_TZ) && Math.floor(tt * 2) % 2 ? 1 : 0, sy = r.y - b;
    px(r.x + 1, sy, 8, 2, 4); px(r.x + 3, sy - 2, 4, 2, 4);
    px(r.x + 3, sy + 2, 4, 4, 1); px(r.x + 4, sy + 3, 1, 1, 4);
    px(r.x + 2, sy + 6, 6, 7, 3); px(r.x + 7, sy + 6, 3, 5, 4);
    px(r.x + 3, sy + 13, 2, 3, 4); px(r.x + 6, sy + 13, 2, 3, 4);
  }
  function aucNight() { return curEnv(now()).phase === 'night'; }
  function tapPortExtra_auction(x, y) {
    var r = AUC_SIGN;
    if (L.aucOpen(S) && x >= r.x - 2 && x <= r.x + r.w + 2 && y >= r.y && y <= r.y + r.h + 4) { openAuctionSheet(); return true; }
    r = AUC_SELLER;
    if (L.traderOpen(S) && aucTrainIn && x >= r.x - 3 && x <= r.x + r.w + 3 && y >= r.y - 5 && y <= r.y + r.h + 3) { openTraderSheet(); return true; }
    return false;
  }

  // ----- 경매 sheet -----
  function openAuctionSheet() {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true;
    sheetKind = 'auction'; sheetEl.hidden = false;
    renderAuction();
  }
  function renderAuction() {
    var ids = L.aucFish(S, now(), AUC_TZ);
    sheetHead('어판장 경매');
    var line = document.createElement('p'); line.className = 'say';
    line.textContent = '경매사: 이번 주 물건은 이 셋! 큰 놈일수록 값이 훨씬 뛰어요.';
    sheetEl.appendChild(line);
    var h3 = document.createElement('h3'); h3.textContent = '이번 주 경매';
    var b = document.createElement('b'); b.textContent = fmtReal(L.aucLeft(now(), AUC_TZ)) + ' 남음'; h3.appendChild(b); sheetEl.appendChild(h3);
    ids.forEach(function (id) {
      var f = L.fishById(id), sold = !!S.port.auc.sold[id], k = L.aucBest(S, id), v = k < 0 ? 0 : S.bag[k].v, mul = L.aucMul(id, v);
      var sub = sold ? '이번 주엔 팔았어요 · 다음 주에 또' : k < 0 ? '바구니에 없음 · 낚아 오면 낼 수 있어요'
        : '제일 큰 것 ' + v + ' × ' + mul + ' = ' + Math.round(v * mul).toLocaleString('ko-KR') + '코인';
      var ic = fishCanvas(id); ic.className = 'sq';
      var r = sheetRow(ic, f.name, sub, sold || k < 0 ? 'idle' : '');
      var btn = document.createElement('button'); btn.type = 'button';
      btn.textContent = sold ? '팔림' : '내기';
      btn.setAttribute('aria-label', f.name + ' 경매에 내기');
      if (sold || k < 0) { btn.disabled = true; btn.className = 'max'; }
      btn.addEventListener('click', function () {
        var res = L.aucSell(S, id, now(), AUC_TZ);
        if (!res.ok) { toast(AUC_WHY[res.why] || '낼 수 없어요'); return; }
        toast('경매 낙찰! ' + f.name + ' ×' + res.mul + ' · +' + res.coins.toLocaleString('ko-KR') + '코인 · 결과는 우체통에', 3200);
        floatText('+' + res.coins, AUC_SIGN.x, AUC_SIGN.y);
        refresh(); renderAuction();
      });
      r.appendChild(btn);
    });
    var p = document.createElement('p'); p.className = 'note';
    p.textContent = '바구니에서 그 물고기 중 제일 큰 것 하나를 내요 · 크기 따라 ×' + L.AUC_MIN + '~×' + L.AUC_MAX + ' · 종마다 한 주 한 번 · 월요일에 새 경매';
    sheetEl.appendChild(p);
  }

  // ----- 기차 상인 sheet -----
  function openTraderSheet() {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true;
    sheetKind = 'trader'; sheetEl.hidden = false;
    renderTrader();
  }
  function renderTrader() {
    var list = L.traderToday(S, now(), AUC_TZ), picked = L.traderPicked(S, now(), AUC_TZ);
    sheetHead('기차 떠돌이 상인');
    var line = document.createElement('p'); line.className = 'say';
    line.textContent = picked ? '상인: 좋은 걸 고르셨네요. 내일 기차로 또 올게요.' : '상인: 기차 타고 먼 데서 왔어요. 오늘은 하나만 골라 가세요.';
    sheetEl.appendChild(line);
    var h3 = document.createElement('h3'); h3.textContent = '오늘의 물건';
    var b = document.createElement('b'); b.textContent = '하루 하나'; h3.appendChild(b); sheetEl.appendChild(h3);
    list.forEach(function (id) {
      var w = L.traderById(id), mine = picked === id;
      var icon = id === 'gold' ? iconCanvas('gold') : decoIcon(id);
      var r = sheetRow(icon, w.name, id === 'gold' ? '심으면 황금 수박 · 교배 없이' : '포구에서 온 장식 · 상인만 가져와요', picked && !mine ? 'idle' : '');
      var btn = document.createElement('button'); btn.type = 'button';
      if (picked) { btn.textContent = mine ? '골랐음' : '내일'; btn.disabled = true; btn.className = 'max'; }
      else {
        btn.textContent = w.cost.toLocaleString('ko-KR'); btn.setAttribute('aria-label', w.name + ' 고르기 ' + w.cost + '코인');
        if (S.coins < w.cost) btn.classList.add('poor');
        btn.addEventListener('click', function () {
          var res = L.traderPick(S, id, now(), AUC_TZ);
          if (!res.ok) { toast(AUC_WHY[res.why] || '살 수 없어요'); btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake'); return; }
          toast(res.name + (id === 'gold' ? ' 샀다' : res.stored ? ' · 보관함에' : ' · 마당에 놓았다') + ' · 상인: 고마워요!', 2600);
          if (id === 'gold') renderTray();
          refresh(); renderTrader();
        });
      }
      r.appendChild(btn);
    });
  }

  // ----- 달력 row (renderToday) -----
  function renderAuctionCal() {
    if (!L.aucOpen(S)) return;
    var ids = L.aucFish(S, now(), AUC_TZ), sold = S.port.auc.sold;
    var h3 = document.createElement('h3'); h3.textContent = '이번 주 경매';
    var b = document.createElement('b'); b.textContent = fmtReal(L.aucLeft(now(), AUC_TZ)) + ' 남음'; h3.appendChild(b); calEl.appendChild(h3);
    note(ids.length ? ids.map(function (id) { return L.fishById(id).name + (sold[id] ? ' (팔림)' : ''); }).join(' · ') + ' · 포구 어판장 앞 표지에서'
      : '도감에 강·바다·섬 물고기가 생기면 다음 주부터 경매');
  }

  // ----- port decorations (상인만 가져옴) -----
  DRAW_DECO.pbuoy = function (x, y, tt) {
    var b = Math.floor((tt || 0) * 1.5) % 2;
    px(x + 4, y + b, 2, 4, 4); px(x + 3, y - 1 + b, 4, 1, 3);
    px(x + 1, y + 4 + b, 8, 4, 4); px(x + 1, y + 8 + b, 8, 3, 0); px(x + 1, y + 8 + b, 1, 3, 4); px(x + 8, y + 8 + b, 1, 3, 4);
    px(x, y + 11 + b, 10, 4, 4); px(x + 2, y + 15, 6, 3, 3);
  };
  DRAW_DECO.pcrate = function (x, y) {
    px(x, y + 4, 20, 8, 4); px(x + 1, y + 5, 18, 6, 1); px(x, y + 7, 20, 1, 4);
    px(x + 3, y + 1, 6, 3, 2); px(x + 9, y + 2, 2, 1, 2); px(x + 11, y + 2, 5, 2, 3); px(x + 16, y + 1, 1, 1, 3);
  };
  DRAW_DECO.pnet = function (x, y) {
    px(x + 1, y, 2, 18, 4); px(x + 21, y, 2, 18, 4); px(x + 1, y, 22, 2, 4);
    for (var k = 0; k < 5; k++) { px(x + 4 + k * 4, y + 2, 1, 11 - (k % 2) * 2, 2); }
    for (k = 0; k < 3; k++) px(x + 3, y + 5 + k * 3, 18, 1, 2);
    px(x + 9, y + 9, 5, 3, 4); px(x + 14, y + 10, 2, 1, 4);
  };
  DRAW_DECO.plamp = function (x, y, tt, night) {
    px(x + 3, y + 6, 2, 22, 4); px(x + 1, y + 27, 6, 3, 4);
    px(x + 1, y + 1, 6, 5, 4); px(x + 2, y + 2, 4, 3, night ? 0 : 2); px(x, y, 8, 1, 4);
    if (night) { px(x - 1, y + 7, 10, 1, 1); }
  };
  DRAW_DECO.ptrain = function (x, y, tt) {
    px(x, y + 12, 26, 2, 3);
    px(x + 1, y + 4, 11, 7, 4); px(x + 3, y + 5, 3, 3, 0); px(x + 8, y, 3, 4, 4);
    px(x + 13, y + 5, 12, 6, 4); px(x + 15, y + 6, 3, 2, 0); px(x + 20, y + 6, 3, 2, 0);
    px(x + 2, y + 11, 2, 2, 2); px(x + 8, y + 11, 2, 2, 2); px(x + 15, y + 11, 2, 2, 2); px(x + 21, y + 11, 2, 2, 2);
    if (Math.floor((tt || 0) * 2) % 3 === 0) px(x + 9, y - 2, 2, 1, 2);
  };

  // ---------- console hooks ----------
  function addAuctionHooks(FF) {
    // FF.auction.open() opens the 경매 window (rebuilding the 어판장 if needed); .trader() the 상인; .sell(id); .train() replays the arrival
    var port = function () { if (!S.port) S.port = { got: {}, done: {} }; return S.port; };
    FF.auction = {
      open: function () { port().done.market = true; openAuctionSheet(); save(); return S.port.auc; },
      trader: function () { port().done.station = true; openTraderSheet(); save(); return L.traderToday(S, now(), AUC_TZ); },
      sell: function (id) { var r = L.aucSell(S, id, now(), AUC_TZ); refresh(); return r; },
      train: function () { aucTrainDay = null; }
    };
  }
