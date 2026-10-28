  // ---------- tray (seed shop) ----------
  var TRAY = L.SEEDS.concat(['gold', 'fert']);
  var trayBtns = {}, trayPage = 0, PAGE = 3;
  function iconCanvas(id, w, h) {
    var c = document.createElement('canvas'); c.width = w || 12; c.height = h || 12;
    var c2 = c.getContext('2d'), saved = ctx; ctx = c2;
    if (id === 'radish') spr(SP.radish4, 2, 1);
    else if (id === 'berry') spr(SP.berry4, 1, 0);
    else if (id === 'melon') melon(6, 11, 11, 8, false);
    else if (id === 'gold') { melon(6, 11, 11, 8, true); }
    else if (id === 'fert') spr(SP.sack, 2, 2);
    else if (id === 'potato') spr(SP.potato4, 1, 2);
    else if (id === 'pepper') spr(SP.pepper4, 2, 3);
    else if (id === 'tomato') { spr(SP.tomvine, 1, 1); spr(SP.tomato, 5, 6); spr(SP.tomato, 0, 7); }
    else if (id === 'corn') spr(SP.corn4, 2, 0);
    else if (id === 'pumpkin') pumpkin(6, 11, 11, 7);
    else if (L.CROPS[id] && L.CROPS[id].season) drawSeasonIcon(id);
    ctx = saved;
    return c;
  }
  function itemIcon(id) {
    var it = L.itemInfo(id), pi = productIcon(id);
    if (pi) return pi;
    if (it && it.kind === 'fish') { var f = fishCanvas(id); f.className = 'wide'; return f; }
    if (it && it.kind === 'dish') return dishCanvas(id);
    if (it && it.kind === 'crop') return iconCanvas(id);
    if (it && it.kind === 'forage') return forageIcon(id);   // stage 5A
    if (it && it.kind === 'fruit') return fruitIcon(id);     // stage 6A
    if (it && it.kind === 'honey') return honeyIcon(id);     // stage 6A
    var c = document.createElement('canvas'); c.width = 12; c.height = 12;
    spr(['..4444..', '.400004.', '40000004', '40000004', '40000004', '.444444.'], 2, 4, false, c.getContext('2d'));
    return c;
  }
  TRAY.forEach(function (id) {
    var b = document.createElement('button');
    b.type = 'button';
    b.appendChild(iconCanvas(id));
    // gold/fert are counters, not seeds for sale: icon + ×n keeps five buttons on one row
    var nm = document.createElement('span'); nm.textContent = id === 'gold' ? '★' : id === 'fert' ? '' : L.CROPS[id].name;
    if (id === 'gold' || id === 'fert') b.setAttribute('aria-label', id === 'gold' ? '황금 수박 씨앗' : '비료');
    var cost = document.createElement('span'); cost.className = 'cost';
    b.appendChild(nm); b.appendChild(cost);
    b.addEventListener('click', function () { S.sel = id; renderTray(); });
    trayEl.appendChild(b);
    trayBtns[id] = { b: b, cost: cost };
  });
  // more seeds than fit in a row: page through them three at a time
  var pageBtn = document.createElement('button');
  pageBtn.type = 'button'; pageBtn.textContent = '›'; pageBtn.setAttribute('aria-label', '다른 씨앗');
  pageBtn.style.flex = '0 0 auto';
  pageBtn.addEventListener('click', function () { trayPage++; renderTray(); });
  trayEl.insertBefore(pageBtn, trayBtns.gold.b);
  function renderTray() {
    var open = L.SEEDS.filter(function (id) { return L.seedUnlocked(S, id) && seedInSeason(id); });
    if (L.CROPS[S.sel] && !seedInSeason(S.sel)) S.sel = 'radish';     // the season turned under a seasonal seed
    var pages = Math.ceil(open.length / PAGE);
    trayPage = pages ? trayPage % pages : 0;
    pageBtn.hidden = pages < 2;
    pageBtn.textContent = '› ' + (trayPage + 1) + '/' + pages;
    TRAY.forEach(function (id) {
      var t = trayBtns[id];
      if (L.SEEDS.indexOf(id) >= 0) {
        var at = open.indexOf(id);
        t.b.hidden = at < 0 || Math.floor(at / PAGE) !== trayPage;
      }
      if (id === 'gold' || id === 'fert') {
        var have = id === 'gold' ? S.seeds.gold : S.items.fert;
        t.b.hidden = have < 1;
        t.cost.textContent = '×' + have;
        if (S.sel === id && have < 1) S.sel = 'radish';
      } else {
        t.cost.textContent = L.CROPS[id].cost;
        t.b.classList.toggle('poor', S.coins < L.CROPS[id].cost);
      }
      t.b.setAttribute('aria-pressed', String(S.sel === id));
    });
    // 6+ digits would push the header buttons off the edge: 123,456 → 12.3만, 1,234,567 → 123만
    coinsEl.textContent = S.coins < 100000 ? S.coins.toLocaleString('ko-KR')
      : S.coins < 1000000 ? (Math.floor(S.coins / 1000) / 10) + '만' : Math.floor(S.coins / 10000).toLocaleString('ko-KR') + '만';
    coinsEl.title = S.coins.toLocaleString('ko-KR');
  }

