  // ---------- 달력 panel: today (season, day bar, weather, "only now") and 낚시터 ----------
  var calEl = $('cal'), calTab = 'today', calSig = '';
  var PHASE_SPAN = [['morning', 0, 15], ['day', 15, 35], ['evening', 35, 45], ['night', 45, 60]];
  function openCal(tab) {
    if (reel) return;
    if (tab) calTab = tab;
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true;
    renderCal(); calEl.hidden = false;
  }
  [dexBtn, shopBtn, bagBtn].forEach(function (b) { b.addEventListener('click', function () { calEl.hidden = true; }); });

  // real time left, shown in real minutes (so ?speed runs read the same as a normal day)
  function fmtReal(ms) {
    var m = Math.max(0, Math.round(ms / SPEED / 60e3));
    if (m >= 60 * 24) return Math.floor(m / 1440) + '일 ' + Math.floor((m % 1440) / 60) + '시간';
    if (m >= 60) return Math.floor(m / 60) + '시간 ' + (m % 60) + '분';
    return m < 1 ? '곧' : m + '분';
  }
  function calSignature() {
    var t = now(), e = curEnv(t);
    return [calTab, e.season, e.phase, e.weather, Math.round(((t + TZ * 60e3) % 3600e3) / SPEED / 30e3), S.coins, S.rep,
      L.curSpot(S), Object.keys(S.dex.fish).length, Object.keys(S.spotOk || {}).join(), dailySig()].join('|');
  }
  function renderCalIfChanged() { if (calSignature() !== calSig) renderCal(); }

  function renderCal() {
    calSig = calSignature();
    var keep = calEl.scrollTop;
    calEl.innerHTML = '';
    var h = document.createElement('h2'); h.textContent = calTab === 'spot' ? '낚시터' : '달력';
    var close = document.createElement('button'); close.type = 'button'; close.textContent = '닫기';
    close.addEventListener('click', function () { calEl.hidden = true; });
    h.appendChild(close); calEl.appendChild(h);
    var tabs = document.createElement('div'); tabs.className = 'tabs'; tabs.setAttribute('role', 'group');
    [['today', '오늘'], ['spot', '낚시터 · ' + L.SPOTS[L.curSpot(S)].name]].forEach(function (tb) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = tb[1];
      b.setAttribute('aria-pressed', String(calTab === tb[0]));
      b.addEventListener('click', function () { calTab = tb[0]; renderCal(); });
      tabs.appendChild(b);
    });
    calEl.appendChild(tabs);
    if (calTab === 'spot') renderSpots(); else renderToday();
    calEl.scrollTop = keep;
  }

  function renderToday() {
    var t = now(), e = curEnv(t), c = L.gameClock(t, TZ);
    var nextSeason = L.SEASONS[(L.SEASONS.indexOf(c.season) + 1) % 4];
    // season + month
    var top = document.createElement('div'); top.className = 'calTop';
    top.appendChild(iconCanvas7(e.season, 3));
    var big = document.createElement('div'); big.className = 'big';
    big.textContent = L.SEASON_NAME[e.season] + ' · ' + c.month + '월';
    var sm = document.createElement('small');
    sm.textContent = L.SEASON_NAME[nextSeason] + '까지 ' + fmtReal(L.seasonLeftMs(t, TZ)) + ' · 계절은 현실 1주';
    big.appendChild(sm); top.appendChild(big); calEl.appendChild(top);
    renderDaily();     // stage 4: 오늘의 할 일 + 농장 N년차

    // today's day bar: 아침 15 · 낮 20 · 저녁 10 · 밤 15 (real minutes in each real hour)
    var h3 = document.createElement('h3'); h3.textContent = '오늘 하루';
    var hb = document.createElement('b'); hb.textContent = '하루 = 현실 1시간'; h3.appendChild(hb); calEl.appendChild(h3);
    var m = (((t + TZ * 60e3) % 3600e3) + 3600e3) % 3600e3 / 60e3;
    var bar = document.createElement('div'); bar.className = 'daybar';
    PHASE_SPAN.forEach(function (p) {
      var seg = document.createElement('div'); seg.className = 'seg ' + p[0] + (p[0] === c.phase ? ' on' : '');
      seg.style.flex = String(p[2] - p[1]);
      seg.appendChild(iconCanvas7(p[0], 2));
      var nm = document.createElement('span'); nm.textContent = L.PHASE_NAME[p[0]]; seg.appendChild(nm);
      bar.appendChild(seg);
    });
    var mark = document.createElement('i'); mark.className = 'mark'; mark.style.left = (m / 60 * 100).toFixed(2) + '%';
    bar.appendChild(mark);
    calEl.appendChild(bar);
    var cur = PHASE_SPAN.filter(function (p) { return p[0] === c.phase; })[0];
    var nxt = PHASE_SPAN[(PHASE_SPAN.indexOf(cur) + 1) % 4][0];
    note('지금 ' + L.PHASE_NAME[c.phase] + (phaseOverride ? ' (시험: ' + L.PHASE_NAME[e.phase] + ')' : '') +
      ' · ' + L.PHASE_NAME[nxt] + '까지 ' + fmtReal((cur[2] - m) * 60e3 * SPEED));

    // weather now → next block
    h3 = document.createElement('h3'); h3.textContent = '날씨';
    hb = document.createElement('b'); hb.textContent = '40분마다 바뀜'; h3.appendChild(hb); calEl.appendChild(h3);
    var blockEnd = (Math.floor(t / L.WEATHER_MS) + 1) * L.WEATHER_MS, next = L.weatherAt(blockEnd, TZ);
    var wx = document.createElement('div'); wx.className = 'wxrow';
    [[e.weather, '지금'], [next, fmtReal(blockEnd - t) + ' 뒤']].forEach(function (w, n) {
      if (n) { var ar = document.createElement('span'); ar.className = 'arrow'; ar.textContent = '→'; wx.appendChild(ar); }
      var cell = document.createElement('div'); cell.className = 'wx' + (n ? '' : ' now');
      cell.appendChild(iconCanvas7(w[0], 3));
      var tx = document.createElement('div'); tx.textContent = L.WEATHER_NAME[w[0]];
      var s2 = document.createElement('small'); s2.textContent = w[1]; tx.appendChild(s2);
      cell.appendChild(tx); wx.appendChild(cell);
    });
    calEl.appendChild(wx);
    if (e.weather === 'rain') note('비 오는 동안 밭 작물이 10% 빨리 자란다');
    else if (c.season === 'summer') note('여름은 장마철 · 비가 자주 온다');
    else if (c.season === 'winter') note('겨울엔 비 대신 눈이 온다');

    // things that only show up under this hour/weather/season
    h3 = document.createElement('h3'); h3.textContent = '지금만 만날 수 있는 것'; calEl.appendChild(h3);
    var d = new Date(t);
    L.seasonCrops(e.season).forEach(function (id) {
      var c = L.CROPS[id], got = S.dex.crops[id];
      var r = document.createElement('div'); r.className = 'dx' + (got ? '' : ' unk');
      var ic = iconCanvas(id); ic.className = 'sq'; if (!got) ic.style.opacity = '0.5';
      var n = document.createElement('div'); n.className = 'n'; n.textContent = c.name + ' 씨앗';
      var s3 = document.createElement('small'); s3.textContent = L.SEASON_NAME[c.season] + '에만 심을 수 있다 · ' + c.hint; n.appendChild(s3);
      var v = document.createElement('div'); v.className = 'v'; v.textContent = got ? got + '개' : c.cost + '코인';
      r.appendChild(ic); r.appendChild(n); r.appendChild(v); calEl.appendChild(r);
    });
    var now1 = L.FISH.filter(function (f) { return (L.isConditional(f) && L.fishEnvOk(f, e)) || (f.window && L.inWindow(f, d)); });
    if (!now1.length) note('지금은 늘 있는 물고기뿐 · 아침·밤이나 비·안개 오는 날 다시 와 봐요');
    now1.forEach(function (f) {
      var got = S.dex.fish[f.id], sp = f.spot || 'pond';
      var r = document.createElement('div'); r.className = 'dx' + (got ? '' : ' unk');
      var ic = fishCanvas(f.id, !got); if (!got) ic.style.opacity = '0.35';
      var n = document.createElement('div'); n.className = 'n'; n.textContent = got ? f.name : '???';
      var s3 = document.createElement('small');
      s3.textContent = got ? L.SPOTS[sp].name + ' · ' + fishCond(f) + ' · ' + got.n + '마리' : fishHint(f);
      n.appendChild(s3);
      var v = document.createElement('div'); v.className = 'v';
      v.textContent = L.spotUnlocked(S, sp) ? (sp === L.curSpot(S) ? '여기' : L.SPOTS[sp].name) : '잠김';
      r.appendChild(ic); r.appendChild(n); r.appendChild(v); calEl.appendChild(r);
    });
  }
  function note(text) { var p = document.createElement('p'); p.className = 'note'; p.textContent = text; calEl.appendChild(p); }

  function spotIcon(id) {
    var c = document.createElement('canvas'); c.width = 12; c.height = 12;
    var saved = ctx; ctx = c.getContext('2d');
    px(0, 0, 12, 12, 4); px(1, 1, 10, 10, 0);
    if (id === 'pond') { px(2, 5, 8, 5, 1); px(3, 4, 6, 1, 1); px(3, 10, 6, 1, 1); px(4, 6, 2, 1, 2); px(7, 8, 2, 1, 2); }
    else if (id === 'river') { for (var k = 0; k < 10; k++) px(1 + k, 3 + Math.round(k * 0.5), 3, 4, 1); px(3, 6, 2, 1, 2); px(7, 8, 2, 1, 2); }
    else { px(1, 6, 10, 5, 1); px(2, 6, 2, 1, 2); px(6, 7, 3, 1, 2); px(1, 5, 10, 1, 3); px(8, 2, 2, 2, 3); }
    ctx = saved;
    return c;
  }
  function renderSpots() {
    var here = L.curSpot(S);
    L.SPOT_IDS.forEach(function (id) {
      var sp = L.SPOTS[id], st = L.spotStatus(S, id);
      var r = document.createElement('div'); r.className = 'up' + (id === here ? ' sp' : '');
      r.appendChild(spotIcon(id));
      var n = document.createElement('div'); n.className = 'n';
      n.textContent = sp.name;
      var sm = document.createElement('small');
      var count = '물고기 ' + spotCaught(id) + '/' + spotCount(id);
      sm.textContent = st === 'owned' ? count + (id === here ? ' · 지금 여기' : '')
        : st === 'rep' ? '신뢰도 ★' + sp.rep + ' + ' + sp.cost.toLocaleString('ko-KR') + '코인 · 지금 ★' + S.rep + ' · 주문을 납품하면 ★이 쌓여요'
        : '★ 충분 · ' + sp.cost.toLocaleString('ko-KR') + '코인으로 길을 연다';
      n.appendChild(sm); r.appendChild(n);
      var b = document.createElement('button'); b.type = 'button';
      if (st === 'owned') {
        b.textContent = id === here ? '여기' : '가기'; b.className = 'max'; b.disabled = id === here;
        b.addEventListener('click', function () { if (goSpot(id)) calEl.hidden = true; });
      } else if (st === 'rep') { b.textContent = '★' + sp.rep; b.disabled = true; }
      else {
        b.textContent = sp.cost.toLocaleString('ko-KR');
        if (st === 'coins') b.className = 'poor';
        b.addEventListener('click', function () {
          if (!L.buySpot(S, id)) { b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); toast('코인이 부족해요'); return; }
          goSpot(id); calEl.hidden = true;
          toast('★ ' + sp.name + (id === 'sea' ? '가' : '이') + ' 열렸다 · ' + spotCount(id) + '종이 산다', 3200);
        });
      }
      r.appendChild(b); calEl.appendChild(r);
    });
    note('낚시터마다 사는 물고기가 달라요. 줄이 물속에 있으면 옮길 때 걷어요. 신뢰도는 쓰지 않아요.');
  }
