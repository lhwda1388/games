  // ---------- 도감 ----------
  function renderDex() {
    dexEl.innerHTML = '';
    var h = document.createElement('h2'); h.textContent = '도감';
    var close = document.createElement('button'); close.type = 'button'; close.textContent = '닫기';
    close.addEventListener('click', function () { dexEl.hidden = true; });
    h.appendChild(close); dexEl.appendChild(h);
    var h3 = document.createElement('h3'); h3.textContent = '모은 만큼 생기는 것';
    var cnt = document.createElement('b'); cnt.textContent = L.dexCount(S) + ' / ' + L.DEX_ALL + '종'; h3.appendChild(cnt);
    dexEl.appendChild(h3);
    L.MILESTONES.forEach(function (m) {
      var done = !!S.ms[m.id];
      var r = document.createElement('div'); r.className = 'ms' + (done ? ' done' : '');
      var bx = document.createElement('span'); bx.className = 'box';
      var n = document.createElement('div'); n.className = 'n'; n.textContent = done ? m.name : '???';
      var sm = document.createElement('small'); sm.textContent = done ? m.desc : '아직 비밀'; n.appendChild(sm);
      var v = document.createElement('div'); v.className = 'v';
      v.textContent = m.crop ? '황금 수박 수확' : m.fish ? '물고기 ' + m.fish + '종' : m.need === 'all' ? '처음 ' + L.DEX_TOTAL + '종 전부' : '도감 ' + m.need + '종';
      r.appendChild(bx); r.appendChild(n); r.appendChild(v); dexEl.appendChild(r);
    });
    h3 = document.createElement('h3'); h3.textContent = '작물'; dexEl.appendChild(h3);
    L.SEEDS.concat(['gold']).forEach(function (id) {
      var c = L.CROPS[id], n = S.dex.crops[id] || 0;
      var known = n > 0 || (id === 'gold' && S.dex.goldSeed);
      var ic = iconCanvas(id); ic.className = 'sq';
      row(ic, known ? (c.rare ? '★ ' : '') + c.name : '???',
        known ? (c.rare ? '교배로만 얻는 씨앗 · ' + c.sell + '코인' : (c.season ? L.SEASON_NAME[c.season] + ' 작물 · ' : '') + '성장 ' + (c.grow / 60e3) + '분 · ' + c.sell + '코인')
              : (id === 'gold' ? '딸기와 수박을 나란히 수확하면…' : c.season ? L.SEASON_NAME[c.season] + '에만 심는다 · ' + c.hint : L.seedUnlocked(S, id) ? '아직 수확 안 함' : '신뢰도 ★' + L.SEED_UNLOCK[id].rep + '에 씨앗'),
        n ? n + '개' : '', !known);
    });
    h3 = document.createElement('h3'); h3.textContent = '물고기'; dexEl.appendChild(h3);
    L.FISH.forEach(function (f) {
      var d = S.dex.fish[f.id];
      var hint = f.window === 'lunch' ? '12시~13시에만' : f.window === 'friday' ? '금요일 17시 이후에만' : fishHint(f);
      row(fishCanvas(f.id, !d), d ? (f.window === 'friday' ? '★ ' : '') + f.name : '???',
        d ? (f.spot ? L.SPOTS[f.spot].name + ' · ' : '') + f.rarity + ' · ' + d.n + '마리' : hint, d ? '최고 ' + d.best.toFixed(1) + 'cm' : '', !d);
    });
    h3 = document.createElement('h3'); h3.textContent = '요리';
    var dc = document.createElement('b'); dc.textContent = Object.keys(S.dex.dish).length + ' / ' + L.RECIPES.length; h3.appendChild(dc);
    dexEl.appendChild(h3);
    L.RECIPES.forEach(function (r) {
      var n = S.dex.dish[r.id] || 0, ic = dishCanvas(r.id); ic.className = 'sq';
      row(ic, n ? r.name : '???', n ? r.sell + '코인 · ' + Math.round(r.time / 60e3) + '분' : r.hidden ? '귀한 재료가 모이면…' : r.gift && !L.recipeKnown(S, r) ? L.residentById(r.gift).name + '의 선물 레시피' : '아직 안 만듦', n ? n + '번' : '', !n);
    });
    function row(icon, name, sub, val, unk) {
      var r = document.createElement('div'); r.className = 'dx' + (unk ? ' unk' : '');
      var n = document.createElement('div'); n.className = 'n'; n.textContent = name;
      var sm = document.createElement('small'); sm.textContent = sub; n.appendChild(sm);
      var v = document.createElement('div'); v.className = 'v'; v.textContent = val;
      if (unk) icon.style.opacity = '0.35';
      r.appendChild(icon); r.appendChild(n); r.appendChild(v); dexEl.appendChild(r);
    }
  }
  function renderSettings() {
    if (!pipOK) return;
    var h3 = document.createElement('h3'); h3.textContent = '설정'; dexEl.appendChild(h3);
    var lb = document.createElement('label'); lb.className = 'setRow';
    var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = autoPip();
    cb.addEventListener('change', function () { setAutoPip(cb.checked); });
    var tx = document.createElement('span'); tx.textContent = '열면 바로 작게 띄우기';
    var sm = document.createElement('small'); sm.textContent = '첫 클릭에 작은 창으로 · P 키로 언제든 켜고 끄기'; tx.appendChild(sm);
    lb.appendChild(cb); lb.appendChild(tx); dexEl.appendChild(lb);
  }
  dexBtn.addEventListener('click', function () { shopEl.hidden = true; bagEl.hidden = true; renderDex(); renderSettings(); dexEl.hidden = false; });

  var MS_TOAST = { cat: '도감 5종 · 고양이가 선착장에 놀러 왔다', lantern: '도감 8종 · 연못가에 석등이 켜졌다',
    koi: '황금 수박 · 연못에 금빛 잉어가 산다는 소문', boat: '도감 완성 · 연못에 작은 배가 생겼다',
    fish20: '물고기 20종 · 장식 「어부의 깃발」을 받았다', fish30: '물고기 30종 · 장식 「등대 모형」을 받았다' };
  function milestones() {
    var got = L.checkMilestones(S);
    if (got.length) setTimeout(function () { toast('★ ' + MS_TOAST[got[got.length - 1]], 4000); }, 1400);
  }

