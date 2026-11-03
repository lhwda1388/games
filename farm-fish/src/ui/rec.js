  // ---------- 소리 도감: auto/tap recording, the ♪ chip, 도감 소리 tab, 상점 녹음기, 박물관 별관 소리실, 축음기, FF.rec ----------
  // Every second the screen is described as a plain ctx and L.recNow says which sounds could be recorded here now.
  // Auto: a sound whose conditions held REC_DWELL in a row goes in at ★1 (sound on or off; this is the logic tick, not audio).
  // Tap: when the 환경음 plays one of those sounds, a ♪ chip shows at the left edge for a moment; tapping records ★2 / ★3.
  // Nothing here runs, and no s.rec is made, until a 녹음기 is bought.
  // per second, the new one-shots (ui/sound.js AMB_EV) while their sound's conditions hold; the old ones keep their own rates
  var REC_RATE = { cuckoo: 0.08, woodpk: 0.05, oriole: 0.08, gull: 0.12, bigcicada: 0.06, bellbug: 0.3, toad: 0.15, kingfish: 0.05, scops: 0.05,
    trickle: 0.3, fall: 0.1, bubble: 0.2, surf: 0.15, whale: 0.03, whistle: 0.04, boom: 0.2, windbell: 0.08, crunch: 0.15, mist: 0.04 };
  var REC_DWELL = 20e3, REC_NOTE_MS = 2200;
  var REC_WHY = { owned: '이미 있어요', rep: '신뢰도 ★' + L.REC_REP + '부터 살 수 있어요', coins: '코인이 모자라요',
    closed: '녹음기와 박물관이 둘 다 있어야 해요', got: '이미 전시 중이에요', need: '아직 녹음하지 않은 소리예요', room: '없는 소리예요' };
  var recLast = [], recLastAt = 0, recSince = {}, recNoteId = null, recNoteTimer = 0, recGramAt = 0;
  var recNote = document.createElement('button');
  recNote.type = 'button'; recNote.id = 'recNote'; recNote.hidden = true; recNote.textContent = '♪';
  app.appendChild(recNote);

  // a 12×12 mark: a note (got) or its faint outline (not yet)
  function recIcon(got) {
    var c = document.createElement('canvas'); c.width = 12; c.height = 12;
    spr(got ? ['......44....', '......444...', '......4.44..', '......4..4..', '......4.....', '......4.....', '......4.....', '...4444.....', '..44444.....', '..44444.....', '...444......', '............']
            : ['......22....', '......2.2...', '......2..2..', '......2.....', '......2.....', '......2.....', '......2.....', '...2222.....', '..2....2....', '..2....2....', '...2222.....', '............'], 0, 0, false, c.getContext('2d'));
    return c;
  }
  function recStars(q) { return '★★★'.slice(0, q) + '☆☆☆'.slice(0, 3 - q); }

  // what is around now, as the pure ctx L.recNow reads (the 모닥불 check is the one the 환경음 uses)
  function recCtx(t) {
    var e = curEnv(t), v = view;
    var site = cmpIsView(v) ? cmpSiteNow() : v === 'farm' && SCENES[scene].camp;
    return { now: t, view: v, spot: v === 'farm' ? scene : '', phase: e.phase, season: e.season, weather: e.weather, festival: e.festival,
      fire: !!(site && S.camp && L.cmpFireOn(S, site, t)), chime: v === 'yard' && L.decoPlaced(S, 'chime') };
  }
  function recTick(t) {
    if (!L.recOk(S)) { if (!recNote.hidden) recNoteHide(); return; }
    var p = performance.now();
    if (p - recLastAt < 1000) return;
    var dt = recLastAt ? Math.min(p - recLastAt, 5e3) : 0, since = {};
    recLastAt = p;
    recLast = L.recNow(recCtx(t));
    recLast.forEach(function (id) {
      since[id] = (recSince[id] || 0) + dt;
      if (since[id] >= REC_DWELL && !L.recQ(S, id)) recGot(id, L.recTake(S, id, 'auto'));
    });
    recSince = since;
    recGramTick(p);
  }
  function recGot(id, r) {
    if (!r || !r.ok) return;
    var d = L.recById(id), cnt = ' · 소리 ' + L.recCount(S) + ' / ' + L.REC_SOUNDS.length;
    toast(r.q === 1 ? '녹음기 · 「' + d.name + '」 저절로 녹음 ★1' + cnt : (r.up ? '더 맑게 녹음 · 「' : '녹음 · 「') + d.name + '」 ' + recStars(r.q) + cnt, 3000);
    r.ms.forEach(function (m, k) {
      setTimeout(function () {
        toast('★ 소리 ' + m.n + '개 · 칭호 「' + m.title + '」 · +' + m.coins + '코인' + (m.deco ? ' · 축음기' + (m.stored ? ' (보관함)' : ' (마당)') : ''), 4200);
      }, 3200 + k * 4400);
    });
    refresh();
  }

  // ---------- ♪ chip: only when the 환경음 actually plays a sound that can be recorded here ----------
  // called by ambTick (ui/sound.js) for each one-shot it books; adds nothing to the 환경음
  function recHeard(ev) {
    if (!ambOn || !L.recOk(S) || reel) return;
    var id = recLast.filter(function (x) { return L.recById(x).ev === ev && L.recQ(S, x) < 3; })[0];
    if (id) recNoteShow(id);
  }
  // the new one-shots, while a 녹음기 is owned and their sound's conditions hold (환경음 on only)
  function recAmbAdd(w) {
    if (!ambOn || !L.recOk(S)) return;
    recLast.forEach(function (id) { var e = L.recById(id).ev; if (REC_RATE[e] && !w.ev[e]) w.ev[e] = REC_RATE[e]; });
  }
  function recNoteShow(id) {
    recNoteId = id; recNote.hidden = false;
    recNote.setAttribute('aria-label', '녹음하기 · ' + L.recById(id).name);
    clearTimeout(recNoteTimer); recNoteTimer = setTimeout(recNoteHide, REC_NOTE_MS);
  }
  function recNoteHide() { clearTimeout(recNoteTimer); recNoteId = null; recNote.hidden = true; }
  recNote.addEventListener('click', function () {
    var id = recNoteId;
    recNoteHide();
    if (!id || !L.recOk(S)) return;
    var r = L.recTake(S, id, 'tap');
    if (r.ok) recGot(id, r); else toast('「' + L.recById(id).name + '」 이미 가장 맑게 ★★★', 2000);
  });

  // ---------- replay: one shot of the sound (the 도감 ▶, the 축음기) ----------
  function recPlay(id, quiet) {
    if (!quiet) sndWake();
    if (!sndOn || !sndCtx || sndCtx.state !== 'running') { if (!quiet) toast('소리가 꺼져 있어요 · ⚙ 설정에서 켜기', 2000); return; }
    try { AMB_EV[L.recById(id).ev](sndCtx.currentTime + 0.05, ambOn && sndAmb ? sndAmb : sndSfx); } catch (e) { /* a browser without some node type: stay quiet */ }
  }
  // the 축음기 in the 마당 plays one recorded sound every half minute or so
  function recGramTick(p) {
    if (view !== 'yard' || !ambOn || !sndAmb || !L.decoPlaced(S, L.REC_DECO)) { recGramAt = 0; return; }
    if (!recGramAt) { recGramAt = p + 8e3; return; }
    if (p < recGramAt) return;
    recGramAt = p + 25e3 + Math.random() * 20e3;
    var ids = Object.keys(S.rec.has);
    if (ids.length) recPlay(ids[Math.floor(Math.random() * ids.length)], true);
  }

  // ---------- 도감 소리 tab (ui/records.js adds the tab once a 녹음기 is owned) ----------
  function recDex() {
    var h3 = document.createElement('h3'); h3.textContent = '소리';
    var b = document.createElement('b'); b.textContent = L.recCount(S) + ' / ' + L.REC_SOUNDS.length; h3.appendChild(b); dexEl.appendChild(h3);
    var p = document.createElement('p'); p.className = 'note';
    p.textContent = '조건이 맞는 곳에 잠시 머물면 저절로 ★1 · ♪ 녹음은 환경음이 켜져 있어야 떠요(★2, 또 누르면 ★3)';
    dexEl.appendChild(p);
    var grp = '';
    L.REC_SOUNDS.forEach(function (d) {
      if (d.grp !== grp) {   // a heading per group (새·벌레·물가…), foldable like every 도감 section, with its own count
        grp = d.grp;
        var inG = L.REC_SOUNDS.filter(function (x) { return x.grp === grp; }), g = document.createElement('h3'), gb = document.createElement('b');
        g.textContent = '소리 · ' + grp; gb.textContent = inG.filter(function (x) { return L.recQ(S, x.id); }).length + ' / ' + inG.length;
        g.appendChild(gb); dexEl.appendChild(g);
      }
      var q = L.recQ(S, d.id), r = document.createElement('div'); r.className = 'dx' + (q ? '' : ' unk');
      var ic = recIcon(!!q); ic.className = 'sq';
      var n = document.createElement('div'); n.className = 'n'; n.textContent = q ? d.name : d.legend ? '??? (전설)' : '???';
      var sm = document.createElement('small'); sm.textContent = d.hint; n.appendChild(sm);
      var v = document.createElement('div'); v.className = 'v'; v.textContent = q ? recStars(q) : '';
      r.appendChild(ic); r.appendChild(n); r.appendChild(v);
      if (q) {
        var pl = document.createElement('button'); pl.type = 'button'; pl.className = 'recPlay'; pl.textContent = '▶';
        pl.setAttribute('aria-label', d.name + ' 다시 듣기');
        pl.addEventListener('click', function () { recPlay(d.id); });
        r.appendChild(pl);
      }
      dexEl.appendChild(r);
    });
    h3 = document.createElement('h3'); h3.textContent = '모은 만큼 생기는 것'; dexEl.appendChild(h3);
    L.REC_MS.forEach(function (m) {
      var done = !!S.rec.got[m.id], r = document.createElement('div'); r.className = 'ms' + (done ? ' done' : '');
      var bx = document.createElement('span'); bx.className = 'box';
      var n = document.createElement('div'); n.className = 'n'; n.textContent = '칭호 「' + m.title + '」';
      var sm = document.createElement('small'); sm.textContent = m.coins.toLocaleString('ko-KR') + '코인' + (m.deco ? ' · 마당 장식 축음기(모은 소리가 가끔 흘러나와요)' : ''); n.appendChild(sm);
      var v = document.createElement('div'); v.className = 'v'; v.textContent = m.n === L.REC_SOUNDS.length ? '전부' : m.n + '개';
      r.appendChild(bx); r.appendChild(n); r.appendChild(v); dexEl.appendChild(r);
    });
  }

  // ---------- 상점: 녹음기 ----------
  function recShop() {
    var h3 = document.createElement('h3'); h3.textContent = '녹음'; shopEl.appendChild(h3);
    var own = L.recOk(S), why = L.recBuyWhy(S), r = document.createElement('div'); r.className = 'up';
    var n = document.createElement('div'); n.className = 'n'; n.textContent = '녹음기';
    var sm = document.createElement('small');
    sm.textContent = own ? '도감 소리 탭 · ' + L.recCount(S) + ' / ' + L.REC_SOUNDS.length : '새·벌레·물소리 ' + L.REC_SOUNDS.length + '가지를 모은다 · 소리를 꺼 둬도 저절로 녹음';
    n.appendChild(sm);
    var bt = document.createElement('button'); bt.type = 'button';
    if (own) { bt.textContent = '있음'; bt.disabled = true; bt.className = 'max'; }
    else if (why === 'rep') { bt.textContent = '★' + L.REC_REP; bt.disabled = true; bt.className = 'max'; }
    else {
      bt.textContent = L.REC_COST.toLocaleString('ko-KR'); bt.setAttribute('aria-label', '녹음기 사기 ' + L.REC_COST + '코인');
      if (S.coins < L.REC_COST) bt.classList.add('poor');
      bt.addEventListener('click', function () {
        var res = L.recBuy(S);
        if (!res.ok) { toast(REC_WHY[res.why] || '살 수 없어요'); bt.classList.remove('shake'); void bt.offsetWidth; bt.classList.add('shake'); return; }
        toast('녹음기 · 조건 맞는 곳에 머물면 저절로, ♪가 뜨면 눌러서 · 도감 소리 탭', 3400); recLastAt = 0; refresh(); renderShop();
      });
    }
    r.appendChild(recIcon(true)); r.appendChild(n); r.appendChild(bt); shopEl.appendChild(r);
  }

  // ---------- 박물관 별관 소리실: its own section under the six rooms (their numbers never include it) ----------
  function recAnnex() {
    if (!L.recAnnexOk(S)) return;
    var c = L.recAnnexCount(S), can = L.recAnnexCan(S);
    var h3 = document.createElement('h3'); h3.textContent = '별관 · 소리실';
    var b = document.createElement('b'); b.textContent = c.n + ' / ' + c.m; h3.appendChild(b); sheetEl.appendChild(h3);
    can.forEach(function (id) {
      var d = L.recById(id), it = sheetRow(recIcon(true), d.name, '녹음 ' + recStars(L.recQ(S, id)) + ' · 녹음은 도감에 그대로', 'gift');
      it.appendChild(vBtn('기증', false, function () { recDoDonate(id); }, d.name + ' 기증하기'));
    });
    var titles = L.recTitles(S), p = document.createElement('p'); p.className = 'note';
    p.textContent = (c.n >= c.m ? '소리실이 가득 찼어요' : (can.length ? '' : '지금 기증할 녹음이 없어요 · ') + '다 채우면 칭호 「' + L.REC_ANNEX.title + '」 · ' + L.REC_ANNEX.coins + '코인') +
      ' · 별관은 전시실 수에 들지 않아요' + (titles.length ? ' · 소리 칭호: ' + titles.join(' · ') : '');
    sheetEl.appendChild(p);
  }
  function recDoDonate(id) {
    var res = L.recDonate(S, id), d = L.recById(id);
    if (!res.ok) { toast(REC_WHY[res.why] || '아직이에요'); renderMuseum(); return; }
    if (res.reward) toast('★ 별관 소리실 완성 · 칭호 「' + res.reward.title + '」 · +' + res.reward.coins + '코인', 4200);
    else { var c = L.recAnnexCount(S); toast('「' + d.name + '」 녹음을 기증했다 · 소리실 ' + c.n + '/' + c.m, 2200); }
    refresh(); renderMuseum();
  }

  // ---------- 마당: 축음기 (all sounds recorded) ----------
  DRAW_DECO.gramophone = function (x, y, tt) {
    px(x + 1, y + 12, 12, 6, 4); px(x + 2, y + 13, 10, 3, 3); px(x + 2, y + 11, 10, 1, 2);   // box, turntable
    px(x + 4, y + 9, 2, 2, 4); px(x + 5, y + 6, 2, 3, 4);                                     // tone arm, neck
    px(x + 6, y + 4, 3, 2, 4); px(x + 7, y + 2, 5, 2, 4); px(x + 8, y, 6, 2, 4);               // horn widening up and right
    px(x + 9, y + 1, 4, 1, 1); px(x + 8, y + 3, 3, 1, 2);
    if (Math.floor((tt || 0) * 2) % 6 === 0) px(x + 12, y - 2, 1, 1, 3);                       // a note now and then
  };

  // ---------- console hooks ----------
  function addRecHooks(FF) {
    // FF.rec() gives the 녹음기; FF.rec('all') records every sound ★1 (milestones paid); FF.recNow() = what could be recorded here
    FF.rec = function (all) {
      if (!L.recOk(S)) { S.rep = Math.max(S.rep, L.REC_REP); S.coins += L.REC_COST; L.recBuy(S); }
      if (all === 'all') L.REC_SOUNDS.forEach(function (d) { recGot(d.id, L.recTake(S, d.id, 'auto')); });
      recLastAt = 0; refresh(); return L.recCount(S);
    };
    FF.recNow = function () { return L.recNow(recCtx(now())); };
    FF.recNote = function (id) { if (L.recOk(S) && L.recById(id)) recNoteShow(id); return recNoteId; };
  }
