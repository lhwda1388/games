  // ---------- 단골 주민 tab (바구니 panel): faces, 친밀도 hearts, letters and gifts ----------
  // dish tops for the gift recipes (sprites.js reads DISH_TOP when it draws a dish)
  DISH_TOP.ssukjeon = ['.333333.', '3313331333'];
  DISH_TOP.kimchi = ['.343434.', '4343434343'];
  DISH_TOP.naengguk = ['.1.33.1.', '1131111311'];
  DISH_TOP.goguma = ['..4444..', '.43333334.'];

  // 9×9 faces: hair/hat shape tells them apart
  var FACE = {
    grandma: ['..444....', '.44444...', '4400044..', '.40404...', '.40004...', '..404....', '.33333...', '3333333..', '3333333..'],
    fisher:  ['.44444...', '4444444..', '.40004...', '.40404...', '.42224...', '..424....', '.33333...', '3333333..', '3333333..'],
    chef:    ['.40004...', '.44444...', '.40004...', '.40404...', '.40004...', '..404....', '.00000...', '0000000..', '0000000..'],
    kid:     ['.4.4.4...', '..444....', '.40004...', '.40404...', '.40004...', '..444....', '..333....', '.33333...', '.33333...'],
    teacher: ['..444....', '.4444444.', '.40004...', '.44044...', '.40004...', '..404....', '.22222...', '2222222..', '2222222..'],
    painter: ['444444...', '.4444....', '.40004...', '.40404...', '.40004...', '..444....', '.31313...', '3131313..', '3131313..']
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
    L.RESIDENTS.forEach(function (d) {
      var lv = L.friendLevel(S, d.id), pts = L.friendPoints(S, d.id), next = L.FRIEND_LV[lv];
      var unread = S.res ? S.res.unread.filter(function (k) { return k.split(':')[0] === d.id; }).length : 0;
      var r = upRow(faceCanvas(d.id), esc(d.name) + ' <span class="hearts" aria-label="친밀도 ' + lv + '단계">' +
        [0, 1, 2, 3].map(function (k) { return '<i class="' + (k < lv ? 'on' : '') + '"></i>'; }).join('') + '</span>',
        d.who + ' · ' + (next ? '다음 단계까지 ' + (next - pts) + '번' : '가장 친한 사이'), lv ? '' : 'idle');
      var btn = act(unread ? '편지 ' + unread : lv ? '편지' : '…', function () {
        resOpen = resOpen === d.id ? null : d.id;
        if (resOpen && L.readResLetters(S, d.id)) refresh();
        renderBag();
      }, { off: !lv, label: d.name + ' 편지 보기', cls: unread ? 'new' : '' });
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
