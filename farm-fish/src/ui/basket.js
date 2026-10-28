  // ---------- 바구니 · 주문 · 냄비 ----------
  var bagTab = 'order', bagSig = '';
  function openBag(tab) {
    if (tab) bagTab = tab;
    dexEl.hidden = true; shopEl.hidden = true;
    renderBag(); bagEl.hidden = false;
  }
  function deliverable() { var n = 0; for (var k = 0; k < S.orders.length; k++) if (L.canDeliver(S, k)) n++; return n; }
  function fmtGame(ms) { return fmtLeft(Math.max(0, ms)); }
  function needText(r) {
    var c = {}, order = [];
    r.need.forEach(function (x) { if (!c[x]) order.push(x); c[x] = (c[x] || 0) + 1; });
    return order.map(function (x) { return L.itemInfo(x).name + (c[x] > 1 ? '×' + c[x] : ''); }).join(' + ');
  }
  var bagBtnKey = '';
  function renderBagBtn() {
    var ping = !!(deliverable() || L.potReady(S, now()) || (S.res && S.res.unread.length)), key = S.bag.length + '/' + L.bagCap(S) + ping;
    if (key === bagBtnKey) return;
    bagBtnKey = key;
    bagBtn.innerHTML = '';
    var c = document.createElement('canvas'); c.width = 10; c.height = 8;
    spr(SP.basket, 0, 0, false, c.getContext('2d'));
    var t = document.createElement('span'); t.textContent = S.bag.length + '/' + L.bagCap(S);
    bagBtn.appendChild(c); bagBtn.appendChild(t);
    if (ping) { var d = document.createElement('i'); d.className = 'dot'; bagBtn.appendChild(d); }
  }
  bagBtn.addEventListener('click', function () { openBag(deliverable() ? 'order' : L.potReady(S, now()) ? 'cook' : null); });
  function bagSignature() {
    var t = now();
    return [bagTab, S.coins, S.bag.length, S.rep, L.readyPot(S, t), S.res ? S.res.unread.length : 0, S.pot ? S.pot.id + (L.potReady(S, t) ? '!' : Math.ceil((S.pot.until - t) / SPEED / 1000)) : '',
      S.orders.map(function (q) { return q.o ? q.o.id + q.o.n : Math.ceil((q.at - t) / SPEED / 1000); }).join()].join('|');
  }
  function renderBag() {
    bagSig = bagSignature();
    var keep = bagEl.scrollTop;
    bagEl.innerHTML = '';
    var h = document.createElement('h2'); h.textContent = '바구니';
    var wallet = document.createElement('span'); wallet.className = 'wallet';
    var coin = document.createElement('span'); coin.className = 'coin';
    wallet.appendChild(coin); wallet.appendChild(document.createTextNode(S.coins.toLocaleString('ko-KR')));
    var close = document.createElement('button'); close.type = 'button'; close.textContent = '닫기';
    close.addEventListener('click', function () { bagEl.hidden = true; });
    h.appendChild(wallet); h.appendChild(close); bagEl.appendChild(h);
    var tabs = document.createElement('div'); tabs.className = 'tabs'; tabs.setAttribute('role', 'group');
    var dn = deliverable(), ready = L.potReady(S, now());
    [['order', '주문' + (dn ? ' ' + dn : '')], ['bag', '바구니 ' + S.bag.length + '/' + L.bagCap(S)], ['cook', '냄비' + (ready ? ' 완성' : S.pot ? ' …' : '')],
      ['res', '주민' + (S.res && S.res.unread.length ? ' ✉' : '')]].forEach(function (tb) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = tb[1];
      b.setAttribute('aria-pressed', String(bagTab === tb[0]));
      b.addEventListener('click', function () { bagTab = tb[0]; renderBag(); });
      tabs.appendChild(b);
    });
    bagEl.appendChild(tabs);
    if (bagTab === 'order') renderOrders(); else if (bagTab === 'bag') renderBasket(); else if (bagTab === 'res') renderResidents(); else renderCook();
    bagEl.scrollTop = keep;
  }
  function upRow(icon, nameHtml, sub, cls) {
    var r = document.createElement('div'); r.className = 'up' + (cls ? ' ' + cls : '');
    var n = document.createElement('div'); n.className = 'n'; n.innerHTML = nameHtml;
    var sm = document.createElement('small'); sm.textContent = sub; n.appendChild(sm);
    r.appendChild(icon); r.appendChild(n); bagEl.appendChild(r);
    return r;
  }
  function act(text, onClick, opts) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = text;
    if (opts && opts.cls) b.className = opts.cls;
    if (opts && opts.label) b.setAttribute('aria-label', opts.label);
    if (opts && opts.off) b.disabled = true;
    b.addEventListener('click', function () { onClick(b); });
    return b;
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function renderOrders() {
    var h3 = document.createElement('h3'); h3.textContent = '주문 게시판';
    var b = document.createElement('b'); b.textContent = '신뢰도 ★' + S.rep; h3.appendChild(b); bagEl.appendChild(h3);
    S.orders.forEach(function (q, k) {
      if (!q.o) {
        var ph = document.createElement('canvas'); ph.width = 12; ph.height = 12;
        spr(['444444444444', '4..........4', '4.44444444.4', '4..........4', '4.444444...4', '4..........4', '4.4444444..4', '4..........4', '444444444444'], 0, 1, false, ph.getContext('2d'));
        ph.style.opacity = '0.35';
        upRow(ph, '새 주문 준비 중', '곧 붙어요 · ' + fmtGame(q.at - now()) + ' 뒤', 'idle');
        return;
      }
      var o = q.o, it = L.itemInfo(o.id), have = L.bagCount(S, o.id);
      var r = upRow(itemIcon(o.id), esc(it.name) + ' ×' + o.n + (o.special ? '<span class="tagx">특별</span>' : ''),
        L.residentById(L.residentFor(o)).name + ' · 바구니 ' + Math.min(have, o.n) + '/' + o.n + ' · ★+' + o.rep, o.special ? 'sp' : '');
      var a = document.createElement('div'); a.className = 'acts';
      a.appendChild(act(o.reward.toLocaleString('ko-KR'), function () { doDeliver(k); }, { off: have < o.n, label: '납품 ' + o.reward + '코인' }));
      a.appendChild(act('×', function () { L.discard(S, k, now(), Math.random); toast('주문을 내려놨다 · 곧 새 주문'); refresh(); renderBag(); }, { cls: 'x', label: '이 주문 버리기' }));
      r.appendChild(a);
    });
    var next = L.SEEDS.filter(function (id) { return L.SEED_UNLOCK[id] && !L.seedUnlocked(S, id); })[0];
    var note = document.createElement('p'); note.className = 'note';
    note.textContent = '숫자 버튼 = 납품하고 받는 코인 · × = 다른 주문으로' + (next ? ' · ★' + L.SEED_UNLOCK[next].rep + '에 ' + L.CROPS[next].name + ' 씨앗' : '');
    bagEl.appendChild(note);
  }
  function doDeliver(k) {
    var r = L.deliver(S, k, now(), Math.random);
    if (!r) return;
    floatText('+' + r.coins, 90, 100);
    var msg = (r.special ? '특별 주문 완료! ' : '납품 완료 · ') + '+' + r.coins + ' · ★+' + r.rep;
    if (r.unlocked.length) msg = '★' + S.rep + ' · ' + r.unlocked.map(function (id) { return L.CROPS[id].name; }).join('·') + ' 씨앗이 생겼다';
    var fr = r.friend, up = fr.ups[fr.ups.length - 1];
    if (up) msg = L.residentById(fr.who).name + ' 친밀도 ' + up.lv + '단계 · 편지가 왔다' + (up.gift ? ' · 선물도!' : '');
    toast(msg, 3200);
    refresh(); renderBag();
  }
  function renderBasket() {
    var cap = L.bagCap(S);
    var h3 = document.createElement('h3'); h3.textContent = '담은 것';
    var b = document.createElement('b'); b.textContent = S.bag.length + ' / ' + cap + '칸'; h3.appendChild(b); bagEl.appendChild(h3);
    var grid = document.createElement('div'); grid.className = 'slots';
    for (var k = 0; k < cap; k++) {
      var c = document.createElement('div'); c.className = 'slot' + (k < S.bag.length ? '' : ' e');
      if (k < S.bag.length) c.appendChild(itemIcon(S.bag[k].id));
      grid.appendChild(c);
    }
    bagEl.appendChild(grid);
    var groups = {}, order = [], total = 0;
    S.bag.forEach(function (e) { if (!groups[e.id]) { groups[e.id] = { n: 0, v: 0 }; order.push(e.id); } groups[e.id].n++; groups[e.id].v += e.v; total += e.v; });
    order.forEach(function (id) {
      var g = groups[id], r = upRow(itemIcon(id), esc(L.itemInfo(id).name) + ' ×' + g.n, '팔면 ' + g.v.toLocaleString('ko-KR') + '코인');
      r.appendChild(act('팔기', function () { var v = L.sellId(S, id); toast(L.itemInfo(id).name + ' 팔았다 · +' + v); refresh(); renderBag(); }));
    });
    if (!S.bag.length) { var p = document.createElement('p'); p.className = 'note'; p.textContent = '수확하고 낚은 것이 여기 담겨요 · 꽉 차면 저절로 팔려요'; bagEl.appendChild(p); }
    var all = act('다 팔기 · ' + total.toLocaleString('ko-KR'), function () { var v = L.sellAll(S); toast('다 팔았다 · +' + v); refresh(); renderBag(); }, { cls: 'sellAll', off: !S.bag.length });
    bagEl.appendChild(all);
  }
  // order sign, basket and pot at the left edge of the pond side
  function tapCorner(x, y) {
    if (x < 22 && y >= 102 && y < 120) { openBag('order'); return true; }
    if (x < 22 && y >= 120 && y < 136) { openBag('bag'); return true; }
    if (x < 22 && y >= 142 && y < 166) { tapPot(); return true; }
    return false;
  }
  function tapPot() {
    var d = L.takeDish(S, now());
    if (!d) { openBag('cook'); return; }
    var nm = L.itemInfo(d.id).name;
    burst(12, 150, 8, 0, 40);
    floatText(d.sold ? '+' + d.sold : '+' + nm, 12, 140);
    toast(d.first ? '★ 새 요리 · ' + nm + ' · 도감에 기록' : nm + ' 완성 · 바구니에 담았다', 3000);
    refresh();
    if (!bagEl.hidden) renderBag();
  }
  function renderCook() {
    var h3 = document.createElement('h3'); h3.textContent = '냄비'; bagEl.appendChild(h3);
    var t = now();
    if (S.pot) {
      var r = L.recipeById(S.pot.id), ready = t >= S.pot.until;
      var row = upRow(dishCanvas(r.id), esc(r.name), ready ? '다 됐어요' : fmtGame(S.pot.until - t) + ' 남음');
      if (!ready) {
        var bar = document.createElement('div'); bar.className = 'potbar';
        var fill = document.createElement('i'); fill.style.width = Math.round((1 - (S.pot.until - t) / r.time) * 100) + '%';
        bar.appendChild(fill); row.querySelector('.n').appendChild(bar);
      } else { row.appendChild(act('꺼내기', tapPot)); heatButton(row); }   // stage 5B: optional 불 조절 도전
    } else {
      var p = document.createElement('p'); p.className = 'note'; p.textContent = '비어 있어요 · 바구니 재료로 요리하면 더 비싸게 팔려요'; bagEl.appendChild(p);
    }
    renderExtraPots();   // stage 3: pots a bigger house adds
    h3 = document.createElement('h3'); h3.textContent = '레시피';
    var b = document.createElement('b'); b.textContent = Object.keys(S.dex.dish).length + ' / ' + L.RECIPES.length; h3.appendChild(b);
    bagEl.appendChild(h3);
    L.RECIPES.forEach(function (r) {
      var known = !!S.dex.dish[r.id], can = L.obtainable(S, r.id);
      if (r.gift && !L.recipeKnown(S, r)) {
        var ig = dishCanvas('?'); ig.style.opacity = '0.35';
        upRow(ig, '???', L.residentById(r.gift).name + '와 친해지면 알려 준대요', 'idle');
        return;
      }
      if (r.festival && !L.recipeKnown(S, r)) {   // stage 5B: 송편 is learned at its festival
        var iz = dishCanvas('?'); iz.style.opacity = '0.35';
        upRow(iz, '???', L.FESTIVALS[r.festival].name + ' 날 배울 수 있대요', 'idle');
        return;
      }
      if (r.hidden && !known) {
        var ic = dishCanvas('?'); ic.style.opacity = '0.35';
        upRow(ic, '???', '아주 귀한 재료로 만든대요', 'idle');
        return;
      }
      if (!can) {
        var ic2 = dishCanvas(r.id); ic2.style.opacity = '0.35';
        var miss = r.need.filter(function (x) { return !L.obtainable(S, x); });
        var why = miss.some(function (x) { return L.PRODUCTS[x]; }) ? '동물을 키우면 만들 수 있어요' : '씨앗을 더 모으면…';
        upRow(ic2, esc(r.name), needText(r) + ' · ' + why, 'idle');
        return;
      }
      var row = upRow(dishCanvas(r.id), esc(r.name) + (known ? '' : '<span class="tagx">새</span>'),
        needText(r) + ' · ' + Math.round(r.time / 60e3) + '분 · ' + r.sell + '코인');
      row.appendChild(act('요리', function (btn) {
        if (!L.cook(S, r.id, now())) {
          toast(L.freePot(S) < 0 ? '냄비가 비면 할 수 있어요' : '바구니에 재료가 모자라요');
          btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake');
          return;
        }
        toast(r.name + ' 끓이는 중 · ' + fmtGame(r.time));
        refresh(); renderBag();
      }, { cls: L.canCook(S, r.id) ? '' : 'poor' }));
    });
  }

  function drawBasketCorner(tt) {
    // order sign (painted in bg) gets a blinking tag when something can be delivered
    if (deliverable() && Math.floor(tt * 2) % 2 === 0) { px(15, 100, 5, 7, 4); px(16, 101, 3, 5, 0); px(17, 102, 1, 2, 4); px(17, 105, 1, 1, 4); }
    else if (S.orders.some(function (q) { return q.o; })) { px(16, 103, 3, 1, 4); px(17, 102, 1, 1, 4); }
    // basket: a few dots of produce show how full it is
    spr(SP.basket, 5, 125);
    var fillN = Math.ceil(S.bag.length / L.bagCap(S) * 6);
    for (var k = 0; k < fillN; k++) px(7 + k, 127 - (k % 2), 1, 1, k % 2 ? 3 : 4);
    if (S.bag.length >= L.bagCap(S)) px(9, 123, 2, 2, 4);
    // pot: embers and steam while cooking, sparkle when done
    spr(SP.pot, 4, 150);
    if (S.pot) {
      var t = now();
      if (L.potReady(S, t)) sparkle(17, 148, tt);
      else {
        px(7 + (Math.floor(tt * 5) % 3), 158, 1, 1, 3); px(11 - (Math.floor(tt * 4) % 3), 158, 1, 1, 4);
        for (var w = 0; w < 3; w++) { var ph = (tt * 0.9 + w * 0.33) % 1; px(7 + w * 3 + Math.round(Math.sin(ph * 6 + w) * 1), 149 - Math.round(ph * 8), 1, 1, 2); }
      }
    }
  }

  var potWas = false;
  function tickBasket(t) {
    if (L.refreshOrders(S, t, Math.random)) { if (booted && bagEl.hidden) toast('주문 게시판에 새 주문', 2200); save(); }
    var pr2 = L.potReady(S, t);
    if (pr2 && !potWas && booted) toast('요리 완성 · 냄비를 눌러 꺼내기', 2600);
    potWas = pr2;
    if (!bagEl.hidden && bagSignature() !== bagSig) renderBag();
    renderBagBtn();
  }
