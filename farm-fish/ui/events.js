  // ---------- stage 8 ①: 입질 폭풍 / 대풍년 chip, 오늘의 날 card + 달력 row, 자리 비운 사이 일기 card + 기록 rows ----------
  var ETZ = -new Date().getTimezoneOffset();
  var BOOM_SCENE = { pond: 'farm', river: 'farm', sea: 'farm', farm: 'farm', orchard: 'orchard', forest: 'forest', island: 'island' };
  function boomNow(t) { return L.boomFor(S, t); }
  // curEnv (weather.js) adds these so fishing sees the storm and the day
  function boomEnv(e, t) { e.boom = boomNow(t); e.day = L.dayId(S); return e; }
  function boomBadge() { return boomNow(now()) ? 1 : 0; }
  function boomAttention(sc) { var b = BOOM_SCENE && boomNow(now()); return !!b && BOOM_SCENE[b.place] === sc; }   // BOOM_SCENE: undefined if asked before this file runs
  function boomWhat(b) {
    return b.kind === 'storm' ? '귀한 물고기 ×' + L.BOOM_RARE_MUL + ' · 입질이 빨라진다' : '거둘 때 덤이 붙는다';
  }

  // header chip: icon + minutes left, only while a boom is on for this player
  var boomChip = document.createElement('button');
  boomChip.type = 'button'; boomChip.id = 'boomChip'; boomChip.hidden = true;
  var boomIcon = document.createElement('canvas'); boomIcon.width = 7; boomIcon.height = 7;
  var boomLabel = document.createElement('span');
  boomChip.appendChild(boomIcon); boomChip.appendChild(boomLabel);
  coinsEl.after(boomChip);
  var BOOM_IC = {
    storm:   ['....44.', '...44..', '..44...', '.44444.', '...44..', '..44...', '.44....'],
    harvest: ['4.4.4.4', '.44444.', '..444..', '...4...', '..444..', '.4.4.4.', '4..4..4']
  };
  boomChip.addEventListener('click', function () {
    var b = boomNow(now());
    if (!b) return;
    toast(L.BOOM_NAME[b.kind] + ' · ' + L.BOOM_PLACE_NAME[b.place] + ' · ' + boomWhat(b) + ' · ' + fmtReal(b.end - now()) + ' 남음', 3600);
  });
  var boomKey = '';
  function tickBoom(t) {
    var b = boomNow(t), key = b ? b.kind + b.place + b.start : '';
    boomChip.hidden = !b;
    if (b) boomLabel.textContent = Math.max(1, Math.ceil((b.end - t) / SPEED / 60e3)) + '분';
    if (key === boomKey) return;
    boomKey = key;
    if (!b) return;
    var c2 = boomIcon.getContext('2d'); c2.clearRect(0, 0, 7, 7); spr(BOOM_IC[b.kind], 0, 0, false, c2);
    boomChip.title = L.BOOM_NAME[b.kind] + ' · ' + L.BOOM_PLACE_NAME[b.place];
    boomChip.setAttribute('aria-label', boomChip.title + ' 자세히');
    if (booted) toast(L.BOOM_NAME[b.kind] + '! ' + L.BOOM_PLACE_NAME[b.place] + '에서 ' + boomWhat(b) + ' · 몇 분만', 4200);
  }

  // ---------- one small card at a time: 일기, 오늘의 날 (tap to close) ----------
  var evCard = document.createElement('button');
  evCard.type = 'button'; evCard.id = 'evCard'; evCard.hidden = true;
  app.appendChild(evCard);
  var cardQ = [];
  function showCard(c, first) { if (first) cardQ.unshift(c); else cardQ.push(c); if (evCard.hidden) nextCard(); }
  function nextCard() {
    var c = cardQ.shift();
    evCard.hidden = !c;
    if (!c) return;
    evCard.innerHTML = '';
    var lt = document.createElement('span'); lt.className = 'lt'; lt.textContent = c.kicker; evCard.appendChild(lt);
    var h = document.createElement('b'); h.textContent = c.title; evCard.appendChild(h);
    c.lines.forEach(function (l) { var p = document.createElement('span'); p.className = 'ln'; p.textContent = l; evCard.appendChild(p); });
    var sm = document.createElement('small'); sm.textContent = '눌러서 닫기'; evCard.appendChild(sm);
    evCard.setAttribute('aria-label', c.title + ' · ' + c.lines.join(' ') + ' · 눌러서 닫기');
  }
  evCard.addEventListener('click', nextCard);

  function dayLines(s) {
    var d = L.dayById(L.dayId(s)), out = [d.desc + '.', d.how];
    if (d.id === 'market') out.push('오늘의 품목: ' + L.itemInfo(L.marketItem(s.day.key)).name);
    return out;
  }
  var bootDay = null;   // the first tick's day card waits until the 일기 (if any) is queued first
  function tickDayCard(t) {
    if (!L.ensureDay(S, todayKey(t))) return;
    var c = { kicker: '오늘의 날', title: L.dayById(L.dayId(S)).name, lines: dayLines(S) };
    if (booted) showCard(c); else bootDay = c;
  }

  // ---------- 자리 비운 사이 일기: compare the state before and after catch-up ----------
  function petName() { return S.pet ? S.pet.name : null; }
  function diaryFrom(a) {
    if (!a) return null;
    var t = now(), b = L.diarySnap(S, t, ETZ);
    var e = L.diaryMake(S, a.snap, b, { from: a.from, to: t, tzMin: ETZ, pet: petName(), petGift: b.petGift && !a.snap.petGift });
    if (e) { showCard({ kicker: '자리 비운 사이', title: '그동안의 일기', lines: e.lines }, true); save(); }
    return e;
  }
  function diaryBoot() { diaryFrom(awayA); awayA = null; if (bootDay) showCard(bootDay); bootDay = null; }   // boot.js, right after the first (catch-up) tick
  // a tab hidden for a long time catches up on its own throttled ticks: same before/after
  var hideA = null;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { hideA = pipWin ? null : { from: now(), snap: L.diarySnap(S, now(), ETZ) }; return; }
    var a = hideA; hideA = null;
    if (pipWin) return;   // played on in the small window: not away
    if (a && now() - a.from >= L.DIARY_AWAY) { tick(); diaryFrom(a); }
  });

  function tickEventsUI(t) { tickDayCard(t); tickBoom(t); }

  // ---------- 달력 (top) and 기록 ----------
  function renderDayCal() {
    var h3 = document.createElement('h3'); h3.textContent = '오늘의 날';
    var d = S.day ? L.dayById(L.dayId(S)) : null;
    var b = document.createElement('b'); b.textContent = d ? d.name : '—'; h3.appendChild(b); calEl.appendChild(h3);
    if (d) dayLines(S).forEach(note);
    var bm = boomNow(now());
    note(bm ? '지금 ' + L.BOOM_NAME[bm.kind] + ' · ' + L.BOOM_PLACE_NAME[bm.place] + ' · ' + fmtReal(bm.end - now()) + ' 남음'
      : '입질 폭풍·대풍년은 언젠가 온다 · 오면 위에 표시가 뜬다');
  }
  function renderDiary() {
    var list = S.diary || [];
    var h3 = document.createElement('h3'); h3.textContent = '자리 비운 사이 일기';
    var b = document.createElement('b'); b.textContent = list.length + ' / ' + L.DIARY_KEEP; h3.appendChild(b); dexEl.appendChild(h3);
    if (!list.length) { var q = document.createElement('p'); q.className = 'note'; q.textContent = (L.DIARY_AWAY / 60e3) + '분 넘게 비웠다 오면 그동안의 일이 적혀요'; dexEl.appendChild(q); }
    list.slice().reverse().forEach(function (e) {
      var d = new Date(e.t), box = document.createElement('div'); box.className = 'letter';
      var lt = document.createElement('div'); lt.className = 'lt'; lt.textContent = (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + d.getHours() + '시'; box.appendChild(lt);
      var tx = document.createElement('p'); tx.textContent = e.lines.join(' '); box.appendChild(tx);
      dexEl.appendChild(box);
    });
  }

  // ---------- FF test hooks ----------
  function addEventsHooks(FF) {
    // FF.boom('storm'|'harvest', place?, minutes?) forces one now; FF.boom(null) clears; FF.boom() = what is on
    FF.boom = function (kind, place, min) {
      if (kind === undefined) return boomNow(now());
      L.boomForce(kind ? { kind: kind, place: place, start: now(), end: now() + (min || 4) * 60e3 * SPEED } : null);
      tick(); return boomNow(now());
    };
    FF.boomNext = function () { var w = L.boomNext(now()); return w && { kind: w.kind, start: new Date(w.start).toString(), mins: (w.end - w.start) / 60e3 }; };
    // FF.day('market') overrides today's modifier (not saved); FF.day() = today's id
    FF.day = function (id) {
      if (id) { L.ensureDay(S, todayKey(now())); S.day.f = id; showCard({ kicker: '오늘의 날', title: L.dayById(L.dayId(S)).name, lines: dayLines(S) }); }
      return L.dayId(S);
    };
    // FF.diary(minutesAway): a card as if the last save was that long ago (lines from the state now)
    FF.diary = function (min) { return diaryFrom({ from: now() - (min || 120) * 60e3, snap: L.diarySnap(S, now(), ETZ) }); };
  }
