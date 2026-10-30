  // ---------- 장터 시세판 (opened from the 바구니 tab): today's price per 종목, ▲▼ vs yesterday, last days in pixels ----------
  // 16×8 sparkline: one point every 2px, scaled to these days' own low..high (like a stock ticker),
  // dotted ×1 line when it is in range, today's point as a 2×2 dot
  function mktSpark(hist) {
    var c = document.createElement('canvas'); c.width = 16; c.height = 8; c.className = 'wide';
    var g = c.getContext('2d'), lo = Math.min.apply(null, hist), hi = Math.max.apply(null, hist);
    if (hi - lo < 0.12) { var mid = (hi + lo) / 2; lo = mid - 0.06; hi = mid + 0.06; }
    function y(m) { return Math.round((1 - (m - lo) / (hi - lo)) * 6); }
    g.fillStyle = G[2];
    if (lo <= 1 && hi >= 1) for (var x = 0; x < 16; x += 2) g.fillRect(x, y(1), 1, 1);
    g.fillStyle = G[4];
    var px0 = -1, py0 = -1;
    hist.forEach(function (m, i) {
      var px1 = 1 + i * 2, py1 = y(m);
      if (px0 >= 0) {   // join to the last point: half the climb on each column
        var mid = Math.round((py0 + py1) / 2);
        g.fillRect(px0 + 1, Math.min(py0, mid), 1, Math.abs(mid - py0) + 1);
        g.fillRect(px1, Math.min(mid, py1), 1, Math.abs(py1 - mid) + 1);
      }
      g.fillRect(px1, py1, 1, 1);
      px0 = px1; py0 = py1;
    });
    g.fillRect(px0 - 1, py0, 2, 2);
    return c;
  }
  function mktArrow(m, prev) { return m > prev ? '▲' : m < prev ? '▼' : '–'; }
  function openMarket() {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true;
    sheetKind = 'market'; sheetEl.hidden = false;
    renderMarket();
  }
  function renderMarket() {
    sheetHead('장터 시세');
    var say = document.createElement('p'); say.className = 'say';
    say.textContent = '장터 아저씨: 오늘 값은 이래요. 값은 매일 자정에 바뀌고, 오르면 며칠 오르기도 해요.';
    sheetEl.appendChild(say);
    var h3 = document.createElement('h3'); h3.textContent = '오늘의 시세';
    var b = document.createElement('b'); b.textContent = '최근 ' + L.MKT_HIST + '일'; h3.appendChild(b); sheetEl.appendChild(h3);
    L.mktBoard(S, now(), TZ).forEach(function (q) {
      var sub = '어제 ×' + q.prev.toFixed(2) + (q.sold ? ' · 오늘 ' + q.sold + '개 팔았어요' : '') +
        (q.now < q.m ? ' · 많이 팔아 지금 ×' + q.now.toFixed(2) : '');
      var r = sheetRow(mktSpark(q.hist), q.name, sub, q.now < q.m ? 'idle' : '');
      var v = document.createElement('span'); v.className = 'mktv';
      v.textContent = mktArrow(q.m, q.prev) + ' ×' + q.now.toFixed(2);
      v.setAttribute('aria-label', q.name + ' 오늘 ' + q.now.toFixed(2) + '배, 어제보다 ' + (q.m > q.prev ? '올랐어요' : q.m < q.prev ? '내렸어요' : '같아요'));
      r.appendChild(v);
    });
    var p = document.createElement('p'); p.className = 'note';
    p.textContent = '바구니에서 팔 때만 이 값 · 쌀 땐 창고에 넣어 두고 비싼 날 꺼내 팔기 · 한 종목을 하루 ' + L.MKT_FREE +
      '개 넘게 팔면 하나마다 ' + Math.round(L.MKT_SLIP * 100) + '%씩 내려가요 (×1 아래로는 안 내려감) · 주문·경매·자동 판매 값은 그대로';
    sheetEl.appendChild(p);
  }
  // console hooks: FF.market() → today's board
  function addMarketHooks(FF) {
    FF.market = function () { openMarket(); return L.mktBoard(S, now(), TZ).map(function (q) { return q.name + ' ×' + q.now + ' (' + q.hist.join(' ') + ')'; }); };
  }
