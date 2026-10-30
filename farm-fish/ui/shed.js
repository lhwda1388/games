  // ---------- 창고: put basket items aside for orders (opened from the 바구니 panel), one row per kind ----------
  function shedGroups(list) {
    var g = {}, order = [];
    list.forEach(function (e) { if (!g[e.id]) { g[e.id] = 0; order.push(e.id); } g[e.id]++; });
    return order.map(function (id) { return { id: id, n: g[id] }; });
  }
  function shedActs(r, n, verb, go) {
    var a = document.createElement('div'); a.className = 'acts';
    if (n > 1) a.appendChild(act('1개', function () { go(1); }, { cls: 'max b', label: '1개 ' + verb }));
    a.appendChild(act(n > 1 ? '전부' : verb, function () { go(n); }, { cls: 'max b', label: '전부 ' + verb }));
    r.appendChild(a);
  }
  function renderShed() {
    sheetHead('창고');
    var list = L.shedList(S), cap = L.shedCap(S);
    var h3 = document.createElement('h3'); h3.textContent = '창고 안';
    var b = document.createElement('b'); b.textContent = list.length + ' / ' + cap + '칸'; h3.appendChild(b); sheetEl.appendChild(h3);
    if (!list.length) { var p = document.createElement('p'); p.className = 'note'; p.textContent = '비어 있어요 · 주문에 쓸 것을 넣어 두면 팔리지 않아요'; sheetEl.appendChild(p); }
    shedGroups(list).forEach(function (g) {
      var name = L.itemInfo(g.id).name;
      shedActs(sheetRow(itemIcon(g.id), name + ' ×' + g.n, '주문 납품에 바로 쓰여요'), g.n, '꺼내기', function (n) {
        if (!L.shedTake(S, g.id, n)) { toast('바구니가 꽉 찼어요'); return; }
        toast(josa(name, '을', '를') + ' 바구니에 담았다'); refresh(); renderShed();
      });
    });
    h3 = document.createElement('h3'); h3.textContent = '바구니';
    b = document.createElement('b'); b.textContent = '집이 클수록 창고가 커져요'; h3.appendChild(b); sheetEl.appendChild(h3);
    if (!S.bag.length) { var q = document.createElement('p'); q.className = 'note'; q.textContent = '바구니가 비었어요'; sheetEl.appendChild(q); }
    shedGroups(S.bag).forEach(function (g) {
      var name = L.itemInfo(g.id).name;
      shedActs(sheetRow(itemIcon(g.id), name + ' ×' + g.n, '창고에 ' + L.shedCount(S, g.id) + '개'), g.n, '넣기', function (n) {
        if (!L.shedPut(S, g.id, n)) { toast('창고가 꽉 찼어요 · 집을 키우면 커져요'); return; }
        toast(josa(name, '을', '를') + ' 창고에 넣었다'); refresh(); renderShed();
      });
    });
  }
