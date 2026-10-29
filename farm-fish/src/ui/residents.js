  // ---------- 단골 주민 tab (바구니 panel): faces, 친밀도 hearts, letters and gifts ----------
  // dish tops for the gift recipes (sprites.js reads DISH_TOP when it draws a dish)
  DISH_TOP.ssukjeon = ['.333333.', '3313331333'];
  DISH_TOP.kimchi = ['.343434.', '4343434343'];
  DISH_TOP.naengguk = ['.1.33.1.', '1131111311'];
  DISH_TOP.goguma = ['..4444..', '.43333334.'];

  // 9×9 faces: each has its own silhouette + one prop (grey bun, brimmed hat + beard, chef's toque, side cap, long hair, beret + moustache)
  var FACE = {
    grandma: ['...444...', '..42224..', '.4222224.', '.2400042.', '.2404042.', '..40004..', '..34443..', '.3333333.', '333333333'],
    fisher:  ['..44444..', '..44444..', '444444444', '..40004..', '..40404..', '.4000004.', '..40004..', '.3333333.', '333333333'],
    chef:    ['..44.44..', '.4004004.', '.4000004.', '..44444..', '..40404..', '..40004..', '...444...', '.4000004.', '.4004004.'],
    kid:     ['.........', '..3333...', '.33333444', '.40004...', '.40404...', '.40004...', '..444....', '.43334...', '.43334...'],
    teacher: ['..44444..', '.4444444.', '.4400044.', '.4404044.', '.4400044.', '.4.444.4.', '.4.222.4.', '..22222..', '.2222222.'],
    painter: ['.....4...', '.444444..', '44444444.', '..40004..', '..40404..', '..44444..', '...404...', '.3131313.', '313131313']
  };
  function faceCanvas(id) {
    var c = document.createElement('canvas'); c.width = 12; c.height = 12;
    spr(FACE[id], 2, 2, false, c.getContext('2d'));
    return c;
  }
  var resOpen = null;    // whose letters are unfolded
  function renderResidents() {
    var h3 = document.createElement('h3'); h3.textContent = '단골 주민';
    var b = document.createElement('b'); b.textContent = '납품할수록 친해져요'; h3.appendChild(b); bagEl.appendChild(h3);
    renderStoryLine(bagEl);   // stage 6B: 지금 할 일 (이어지는 심부름 이야기)
    L.RESIDENTS.concat(L.RES_EXTRA.filter(function (r) { return L.resMoved(S, r.id); })).forEach(function (d) {   // stage 10 ③: 새 주민 once moved in
      var lv = L.friendLevel(S, d.id), pts = L.friendPoints(S, d.id), next = L.FRIEND_LV[lv], arrive = L.TOWN_ARRIVE[d.id];
      var unread = (S.res ? S.res.unread.filter(function (k) { return k.split(':')[0] === d.id; }).length : 0) + (L.townUnread(S).indexOf(d.id) >= 0 ? 1 : 0);
      var r = upRow(faceCanvas(d.id), esc(d.name) + ' <span class="hearts" aria-label="친밀도 ' + lv + '단계">' +
        [0, 1, 2, 3].map(function (k) { return '<i class="' + (k < lv ? 'on' : '') + '"></i>'; }).join('') + '</span>',
        d.who + ' · ' + (next ? '다음 단계까지 ' + (next - pts) + '번' : '가장 친한 사이'), lv ? '' : 'idle');
      var btn = act(unread ? '편지 ' + unread : lv || arrive ? '편지' : '…', function () {
        resOpen = resOpen === d.id ? null : d.id;
        if (resOpen && (L.readResLetters(S, d.id) + (L.townRead(S, d.id) ? 1 : 0))) refresh();
        renderBag();
      }, { off: !lv && !arrive, label: d.name + ' 편지 보기', cls: unread ? 'new' : '' });
      r.appendChild(btn);
      if (resOpen !== d.id) return;
      for (var k = lv; k >= 1; k--) {
        var box = document.createElement('div'); box.className = 'letter';
        var top = document.createElement('div'); top.className = 'lt';
        var g = L.RES_STORY[d.id].gifts[k - 1];
        top.textContent = d.name + ' · ' + k + '단계' + (g ? ' · 선물: ' + giftName(g) : k === 4 ? ' · 동봉: 500코인' : '');
        var tx = document.createElement('p'); tx.textContent = L.resLetter(d.id, k);
        box.appendChild(top); box.appendChild(tx); bagEl.appendChild(box);
      }
      if (arrive) {   // stage 10 ③: the arrival letter comes first, shown last
        var ab = document.createElement('div'); ab.className = 'letter';
        var at = document.createElement('div'); at.className = 'lt'; at.textContent = d.name + ' · 이사 인사';
        var ap = document.createElement('p'); ap.textContent = arrive.letter;
        ab.appendChild(at); ab.appendChild(ap); bagEl.appendChild(ab);
      }
    });
    var p = document.createElement('p'); p.className = 'note';
    p.textContent = '주문마다 맡긴 주민이 있어요 · 친해지면 편지와 선물(레시피·가구·장식)이 와요 · 편지에 비밀 힌트도';
    bagEl.appendChild(p);
  }
  function giftName(g) {
    if (g.type === 'recipe') return L.recipeById(g.id).name + ' 레시피';
    if (g.type === 'furn') return L.furnById(g.id).name;
    return L.decoById(g.id).name;
  }
