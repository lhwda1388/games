  // ---------- 수족관: the tank in the house's reserved spot (AQUA), and its sheet (put in / take out) ----------
  var tankArt = {};
  function tankFish(id) { return tankArt[id] || (tankArt[id] = fishCanvas(id)); }
  function drawTank(tt) {
    var x = AQUA[0], y = AQUA[1], w = AQUA[2], h = AQUA[3], list = L.tankList(S);
    // stand, glass, water line, gravel, a weed
    px(x + 3, y + h - 4, w - 6, 4, 4); px(x + 5, y + h - 3, 3, 3, 3); px(x + w - 8, y + h - 3, 3, 3, 3);
    px(x, y + 4, w, h - 8, 4); px(x + 1, y + 5, w - 2, h - 10, 1);
    px(x + 1, y + 8, w - 2, h - 13, 0);
    for (var k = x + 2; k < x + w - 2; k += 3) px(k, y + 8 + (Math.floor(tt * 2 + k) % 2), 2, 1, 1);
    for (k = x + 2; k < x + w - 2; k++) px(k, y + h - 7, 1, 2, (k * 7) % 5 === 0 ? 3 : 2);
    var sw = Math.round(Math.sin(tt * 1.3));
    px(x + 6 + sw, y + 16, 1, 4, 3); px(x + 7, y + 20, 1, 9, 3); px(x + 5 - sw, y + 22, 1, 4, 3);
    ctx.imageSmoothingEnabled = false;
    // swim lanes so a full tank never stacks: up to 4 rows, two fish share a row by keeping to its left/right half;
    // every other row sits further back (dimmer) and is drawn first
    var n = list.length, lanes = Math.min(4, n), top = y + 10, room = h - 26;
    [1, 0].forEach(function (back) {
      list.forEach(function (e, i) {
        var lane = i % 4, slot = Math.floor(i / 4), pair = n > 4 && lane < n - 4;
        if (lane % 2 !== back) return;
        var x0 = x + 2, span = w - 20;
        if (pair) { span = Math.floor((w - 4) / 2) - 16; x0 = x + 2 + slot * Math.floor((w - 4) / 2); }
        var ph = tt * (0.16 + (i % 3) * 0.05) + i * 2.4;
        var fx = x0 + (Math.sin(ph) * 0.5 + 0.5) * span;
        var fy = top + (lanes > 1 ? Math.round(lane * room / (lanes - 1)) : room / 2) + Math.sin(tt * 1.1 + i) * 1;
        var right = Math.cos(ph) > 0, img = tankFish(e.id);
        ctx.save();
        if (back) ctx.globalAlpha = 0.55;
        if (right) { ctx.translate(Math.round(fx) + 16, Math.round(fy)); ctx.scale(-1, 1); ctx.drawImage(img, 0, 0, 16, 8); }
        else ctx.drawImage(img, Math.round(fx), Math.round(fy), 16, 8);
        ctx.restore();
      });
    });
    if (!list.length) { px(x + w / 2 - 1, y + h / 2, 3, 1, 2); px(x + w / 2, y + h / 2 - 1, 1, 3, 2); }
    // bubbles
    for (k = 0; k < 3; k++) { var bp = (tt * 0.6 + k * 0.33) % 1; px(x + w - 8 - k * 3, y + h - 9 - Math.round(bp * (h - 18)), 1, 1, 2); }
    px(x, y + 4, w, 1, 4);
  }
  function renderTank() {
    sheetHead('수족관');
    var list = L.tankList(S), cap = L.tankCap(S);
    var h3 = document.createElement('h3'); h3.textContent = '수조 안';
    var b = document.createElement('b'); b.textContent = list.length + ' / ' + cap + '마리'; h3.appendChild(b); sheetEl.appendChild(h3);
    if (!list.length) { var p = document.createElement('p'); p.className = 'note'; p.textContent = '비어 있어요 · 바구니의 물고기를 넣으면 헤엄쳐요'; sheetEl.appendChild(p); }
    list.forEach(function (e, k) {
      var f = L.fishById(e.id), ic = fishCanvas(e.id); ic.className = 'wide';
      var r = sheetRow(ic, f.name, '수조에서 헤엄치는 중 · 팔리지 않아요');
      var btn = document.createElement('button'); btn.type = 'button'; btn.textContent = '꺼내기'; btn.className = 'max';
      btn.addEventListener('click', function () {
        if (!L.tankTake(S, k)) { toast('바구니가 꽉 찼어요'); return; }
        toast(josa(f.name, '을', '를') + ' 바구니에 담았다'); refresh(); renderTank();
      });
      r.appendChild(btn);
    });
    h3 = document.createElement('h3'); h3.textContent = '바구니의 물고기';
    b = document.createElement('b'); b.textContent = '집이 클수록 수조가 커져요'; h3.appendChild(b); sheetEl.appendChild(h3);
    var any = false;
    S.bag.forEach(function (e, k) {
      if (L.itemInfo(e.id).kind !== 'fish') return;
      any = true;
      var f = L.fishById(e.id), ic = fishCanvas(e.id); ic.className = 'wide';
      var r = sheetRow(ic, f.name, '팔면 ' + e.v + '코인');
      var btn = document.createElement('button'); btn.type = 'button'; btn.textContent = '넣기'; btn.className = 'max';
      btn.disabled = list.length >= cap;
      btn.addEventListener('click', function () {
        if (!L.tankPut(S, k)) { toast('수조가 꽉 찼어요 · 집을 키우면 커져요'); return; }
        toast(f.name + ' 풍덩 · 수조에서 헤엄친다'); refresh(); renderTank();
      });
      r.appendChild(btn);
    });
    if (!any) { var q = document.createElement('p'); q.className = 'note'; q.textContent = '바구니에 물고기가 없어요 · 낚아서 다시 와요'; sheetEl.appendChild(q); }
  }
