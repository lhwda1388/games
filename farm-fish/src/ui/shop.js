  // ---------- 상점 ----------
  function pct(x) { return Math.round(x * 100) + '%'; }
  var SHOP = {
    rod:   { what: '줄이 덜 팽팽해진다', eff: function (t) { return t ? '장력 −' + pct(1 - L.UPG.rod.tgain[t]) : '기본 낚싯대'; } },
    bait:  { what: '입질이 빨라지고 귀한 물고기가 잘 문다',
             eff: function (t) { return t ? '대기 −' + pct(1 - L.UPG.bait.wait[t]) + ' · 희귀 ×' + L.UPG.bait.rare[t] : '맨 바늘'; } },
    field: { what: '밭이 늘어난다', eff: function (t) { return L.UPG.field.plots[t] + '칸'; } },
    scare: { what: '까마귀를 저절로 쫓는다', eff: function (t) { return t ? '쫓을 확률 ' + pct(L.UPG.scare.chance[t]) : '없음'; } },
    basket: { what: '더 많이 담아 둔다', eff: function (t) { return L.UPG.basket.cap[t] + '칸'; } }
  };
  function shopIcon(id) {
    var c = document.createElement('canvas'); c.width = 16; c.height = 16;
    var saved = ctx; ctx = c.getContext('2d');
    if (id === 'rod') { for (var k = 0; k < 12; k++) px(2 + k, 14 - k, 1, 1, 4); px(3, 10, 3, 3, 4); px(4, 11, 1, 1, 0); px(14, 2, 1, 9, 3); px(13, 11, 3, 2, 4); }
    else if (id === 'bait') { spr(SP.can, 5, 8); px(7, 4, 1, 4, 3); px(8, 3, 2, 1, 3); px(10, 4, 1, 2, 3); }
    else if (id === 'field') { px(1, 4, 14, 10, 4); px(2, 5, 12, 8, 1); for (var x = 3; x < 13; x++) { if (x % 3) { px(x, 8, 1, 1, 2); px(x, 11, 1, 1, 2); } } spr(SP.sprout, 6, 3); }
    else if (id === 'scare') spr(SP.scarecrow, 3, 0);
    else if (id === 'fert') spr(SP.sack, 4, 4);
    else if (id === 'basket') spr(SP.basket, 3, 5);
    else if (L.CROPS[id]) { ctx = saved; var ic = iconCanvas(id); c.getContext('2d').drawImage(ic, 2, 2); return c; }
    ctx = saved;
    return c;
  }
  function renderShop() {
    shopEl.innerHTML = '';
    var h = document.createElement('h2'); h.textContent = '상점';
    var wallet = document.createElement('span'); wallet.className = 'wallet';
    var coin = document.createElement('span'); coin.className = 'coin';
    wallet.appendChild(coin); wallet.appendChild(document.createTextNode(S.coins.toLocaleString('ko-KR')));
    var close = document.createElement('button'); close.type = 'button'; close.textContent = '닫기';
    close.addEventListener('click', function () { shopEl.hidden = true; });
    h.appendChild(wallet); h.appendChild(close); shopEl.appendChild(h);
    var h3 = document.createElement('h3'); h3.textContent = '도구'; shopEl.appendChild(h3);
    L.UPG_IDS.forEach(function (id) {
      var u = L.UPG[id], t = L.tier(S, id), cost = L.upgradeCost(S, id);
      var pips = '<span class="pips">' + u.costs.map(function (c, k) { return '<i' + (k < t ? ' class="on"' : '') + '></i>'; }).join('') + '</span>';
      row(id, u.name + pips, SHOP[id].what + ' · ' + (cost === null ? SHOP[id].eff(t) : SHOP[id].eff(t) + ' → ' + SHOP[id].eff(t + 1)), cost);
    });
    h3 = document.createElement('h3'); h3.textContent = '소모품'; shopEl.appendChild(h3);
    row('fert', '비료 <span class="pips">보유 ' + S.items.fert + '</span>', '한 칸의 작물이 두 배로 자란다 · 1회용', L.upgradeCost(S, 'fert'));
    var locked = L.SEEDS.filter(function (id) { return L.seedCost(S, id) !== null; });
    if (locked.length) {
      h3 = document.createElement('h3'); h3.textContent = '새 씨앗'; shopEl.appendChild(h3);
      locked.forEach(function (id) {
        var c = L.CROPS[id];
        row(id, c.name, '★' + L.SEED_UNLOCK[id].rep + '이 되면 저절로 · ' + (c.grow / 60e3) + '분 · ' + c.sell + '코인', L.seedCost(S, id));
      });
    }
    renderYardShop();   // stage 3: 집 · 동물 · 마당 꾸미기 · 가구
    renderPetShop();    // stage 5A: 반려동물
    function row(id, nameHtml, sub, cost) {
      var r = document.createElement('div'); r.className = 'up';
      var n = document.createElement('div'); n.className = 'n'; n.innerHTML = nameHtml;
      var sm = document.createElement('small'); sm.textContent = sub; n.appendChild(sm);
      var b = document.createElement('button'); b.type = 'button';
      if (cost === null) { b.textContent = '최대'; b.disabled = true; b.className = 'max'; }
      else {
        b.textContent = cost.toLocaleString('ko-KR');
        b.setAttribute('aria-label', '사기 ' + cost + '코인');
        if (S.coins < cost) b.classList.add('poor');
        b.addEventListener('click', function () { buyItem(id, b); });
      }
      r.appendChild(shopIcon(id)); r.appendChild(n); r.appendChild(b); shopEl.appendChild(r);
    }
  }
  function buyItem(id, btn) {
    if (L.CROPS[id]) {
      if (!L.buySeed(S, id)) { toast('코인이 부족해요'); btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake'); return; }
      S.sel = id; trayPage = Math.floor(L.SEEDS.filter(function (x) { return L.seedUnlocked(S, x); }).indexOf(id) / PAGE);
      toast(L.CROPS[id].name + ' 씨앗 · 빈 밭에 심어 보세요');
      refresh(); renderShop(); return;
    }
    if (!L.buy(S, id)) {
      toast('코인이 부족해요');
      btn.classList.remove('shake'); void btn.offsetWidth; btn.classList.add('shake');
      return;
    }
    if (id === 'fert') { S.sel = 'fert'; toast('비료 · 자라는 밭을 눌러 뿌리기'); }
    else if (id === 'field') toast('밭이 ' + S.plots.length + '칸이 됐다');
    else if (id === 'basket') toast('바구니가 ' + L.bagCap(S) + '칸이 됐다');
    else toast(L.UPG[id].name + ' ' + L.tier(S, id) + '단계');
    refresh(); renderShop();
  }
  shopBtn.addEventListener('click', function () { dexEl.hidden = true; bagEl.hidden = true; renderShop(); shopEl.hidden = false; });

