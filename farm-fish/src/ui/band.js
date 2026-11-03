  // ---------- 마을 음악회: 악기 arrivals, the ♪ chip (마당 연주 / 광장 무대), the rhythm overlay, ⚙ 악기 rows, 상인 우쿨렐레, FF.band ----------
  // Logic: logic/band.js. Nothing here runs, and no s.band is made, until the first instrument arrives.
  // The round clock is the AudioContext's when sound and music are on (the backing tune is booked on it, so taps and music
  // stay together); otherwise performance.now, and the game plays the same in silence.
  var BND_TZ = -new Date().getTimezoneOffset();
  var BND_LEAD = 2, BND_FALL = 1.6, BND_PLAY_STEPS = 64;   // seconds before the first note, seconds a note falls, 연주 = 8 bars
  var BND_W = 120, BND_H = 160, BND_HIT = 136;              // board pixels; notes are judged at the BND_HIT line
  var BND_KEYS = { 4: ['KeyD', 'KeyF', 'KeyJ', 'KeyK'], 5: ['KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK'], 6: ['KeyS', 'KeyD', 'KeyF', 'KeyJ', 'KeyK', 'KeyL'] };
  var BND_WHY = { ins: '악기가 ' + L.BND_SHOW_MIN + '개 있으면 무대에 설 수 있어요', time: '음악회는 저녁·밤에 열려요', done: '오늘 음악회는 끝났어요 · 내일 저녁에 또 열려요',
    closed: '포구 기차역을 고치면 상인이 와요', coins: '코인이 모자라요', owned: '이미 있어요' };
  var BND_FROM = { kid: '꼬마 도윤', fisher: '박 영감', teacher: '하늘 선생님', grandma: '순자 할머니' };
  var BND_SHORT = { kid: '도윤', fisher: '박 영감', teacher: '선생님', grandma: '할머니' };   // several at once, one toast line
  var BND_ICON = {
    ocarina:   ['............', '............', '...44444....', '.442222244..', '42242242224.', '422222222224', '.4222222224.', '..44444444..', '............', '............', '............', '............'],
    drum:      ['.4........4.', '..4......4..', '...4....4...', '..44444444..', '.4000000004.', '.4444444444.', '.4242424244.', '.4424242424.', '.4242424244.', '.4444444444.', '............', '............'],
    harmonica: ['............', '............', '............', '444444444444', '400000000004', '404040404044', '400000000004', '444444444444', '.3333333333.', '............', '............', '............'],
    xylo:      ['4444444444..', '............', '.44444444...', '............', '..444444....', '............', '...4444.....', '......3.....', '.....3......', '....3.......', '...44.......', '............'],
    accordion: ['............', '444444444444', '420404040424', '420404040424', '420404040424', '420404040424', '444444444444', '............', '............', '............', '............', '............'],
    uke:       ['..........44', '.........44.', '........4...', '.......4....', '......4.....', '..444.4.....', '.42224......', '4220224.....', '4202224.....', '4222224.....', '.42224......', '..444.......']
  };
  var bnd = null;   // { kind: 'menu' | 'round' | 'done', mode: 'play' | 'show', … }
  var bndLastAt = 0;

  var bndChip = document.createElement('button');
  bndChip.type = 'button'; bndChip.id = 'bndChip'; bndChip.hidden = true;
  app.appendChild(bndChip);
  var bndEl = document.createElement('section');
  bndEl.className = 'overlay'; bndEl.id = 'band'; bndEl.hidden = true; bndEl.setAttribute('aria-label', '연주');
  app.appendChild(bndEl);
  var bndHead = document.createElement('h2'), bndTitle = document.createElement('span'), bndWallet = document.createElement('span');
  var bndCv = document.createElement('canvas'), bndTip = document.createElement('p'), bndPads = document.createElement('div');
  var bndMenu = document.createElement('div'), bndActs = document.createElement('div');
  bndWallet.className = 'wallet'; bndHead.appendChild(bndTitle); bndHead.appendChild(bndWallet);
  bndCv.width = BND_W; bndCv.height = BND_H; bndTip.className = 'tip'; bndTip.setAttribute('aria-live', 'polite');
  bndPads.className = 'pads'; bndMenu.className = 'menu'; bndActs.className = 'acts';
  [bndHead, bndCv, bndPads, bndTip, bndMenu, bndActs].forEach(function (el) { bndEl.appendChild(el); });

  function bndOn() { return !!bnd && bnd.kind === 'round'; }
  function bndIcon(id) {
    var c = document.createElement('canvas'); c.width = 12; c.height = 12;
    spr(BND_ICON[id], 0, 0, false, c.getContext('2d'));
    return c;
  }
  function bndButton(text, fn, cls, label) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = text;
    if (cls) b.className = cls;
    if (label) b.setAttribute('aria-label', label);
    b.addEventListener('click', fn);
    return b;
  }
  function bndPhase() { return curEnv(now()).phase; }

  // ---------- the tick: resident instruments (handed over in person, in the 마을), the chip ----------
  // the resident whose instruments can be handed over now: '' = everyone (on the 마을 street), an id = inside their home, null = not here
  function bndHere() { return view === 'village' ? '' : view === 'home' ? vilCur : null; }
  function bndTick(t) {
    if (!L.bndOk(S) && !(bndHere() !== null && L.bndDue(S).length)) { if (!bndChip.hidden) bndChip.hidden = true; return; }
    var p = performance.now();
    if (p - bndLastAt < 1000) return;
    bndLastAt = p;
    var who = bndHere(), ids = who === null ? [] : L.bndTakeDue(S, who);
    if (ids.length) {   // one toast line in their own voice, however many come at once (the toast is one line: the head comes first)
      var ds = ids.map(L.bndById), names = ds.map(function (d) { return d.name; });
      sfx('bandGet');
      toast(ds.length === 1 ? BND_FROM[ds[0].from] + ': 이 ' + names[0] + ' 받아요 · 마당 ♪ 연주'
        : ds.map(function (d) { return BND_SHORT[d.from]; }).join('·') + ': ' + (ds.length === 2 ? '이 ' + names.join('·') + ' 받아요' : '악기 ' + ds.length + '개 받아요 · ' + names.join('·')), 4200);
      refresh();
    }
    bndChipShow(t);
  }
  function bndChipShow(t) {
    var why = L.bndShowWhy(S, t, BND_TZ, bndPhase());
    var mode = view === 'yard' && L.bndOk(S) ? 'play' : view === 'village' && why === 'ok' ? 'show' : '';
    bndChip.hidden = !mode || !bndEl.hidden;
    if (!mode) return;
    bndChip.dataset.mode = mode;
    bndChip.textContent = mode === 'play' ? '♪ 연주' : '♪ 무대';
    bndChip.classList.toggle('on', mode === 'show');
    bndChip.setAttribute('aria-label', mode === 'play' ? '연주하기 · 오늘 보상 ' + L.bndPlayLeft(S, t, BND_TZ) + '번 남음' : '광장 음악회 · 지금 열림');
  }
  bndChip.addEventListener('click', function () {
    if (!L.bndOk(S)) return;
    if (bndChip.dataset.mode === 'play') { bndOpen('play'); return; }
    var why = L.bndShowWhy(S, now(), BND_TZ, bndPhase());
    if (why === 'ok') bndOpen('show'); else toast(BND_WHY[why], 2400);
  });

  // ---------- 오카리나: called right after a junk catch / an opened chest (their own result is already given) ----------
  function bndAfterJunk(src) {
    var id = L.bndFind(S, src);
    if (!id) return;
    setTimeout(function () { sfx('bandFind'); toast('잡동사니 틈에 오카리나가! · 배경음악에 ' + L.bndById(id).adds + ' · 마당 ♪ 연주', 4200); }, 1600);
    refresh();
  }

  // ---------- overlay: menu ----------
  function bndShow(round) {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true; sheetEl.hidden = true;
    bndEl.hidden = false; bndChip.hidden = true;
    bndPads.hidden = !round;
    bndMenu.hidden = !!round;
    bndWallet.textContent = S.coins.toLocaleString('ko-KR') + '코인';
  }
  function bndOpen(mode) {
    var show = mode === 'show', fest = L.bndFestDay(now(), BND_TZ);
    bnd = { kind: 'menu', mode: mode, lanes: show ? L.bndShowLanes(S) : 4, phase: bndPhase() };
    bndTitle.textContent = show ? (fest ? '축제 특별 공연' : '마을 음악회') : '연주';
    bndEl.setAttribute('aria-label', bndTitle.textContent);
    bndShow(false);
    var left = L.bndPlayLeft(S, now(), BND_TZ);
    bndTip.textContent = show ? (fest ? L.FESTIVALS[fest].name + ' 날 · 보상 ×' + L.BND_FEST_MUL + ' · 은부터 음악회 곡' : '오늘 한 번 · 주민들이 보러 왔어요')
      : left ? '오늘 보상 ' + left + ' / ' + L.BND_PLAY_CAP + '번 남음' : '오늘 보상은 끝 · 그냥 연주는 얼마든지';
    bndMenu.innerHTML = ''; bndActs.innerHTML = '';
    bndDrawStage();
    var h3 = document.createElement('h3'); h3.textContent = '악기';
    var b = document.createElement('b'); b.textContent = L.bndCount(S) + ' / ' + L.BND_INS.length; h3.appendChild(b); bndMenu.appendChild(h3);
    L.BND_INS.forEach(function (d) {
      var has = L.bndHas(S, d.id), r = document.createElement('div'); r.className = 'up' + (has ? '' : ' idle');
      var n = document.createElement('div'); n.className = 'n'; n.textContent = has ? d.name : '???';
      var sm = document.createElement('small'); sm.textContent = has ? d.adds : d.hint; n.appendChild(sm);
      r.appendChild(has ? bndIcon(d.id) : document.createElement('span')); r.appendChild(n);
      if (has) {
        var on = !S.band.mute[d.id], bt = bndButton(on ? '켬' : '끔', function () {
          L.bndMute(S, d.id, !S.band.mute[d.id]);
          var now2 = !S.band.mute[d.id]; bt.textContent = now2 ? '켬' : '끔'; bt.setAttribute('aria-pressed', String(now2)); bt.classList.toggle('on', now2);
          refresh();
        }, on ? 'on' : '', d.name + ' 배경음악에 켜기');
        bt.setAttribute('aria-pressed', String(on));
        r.appendChild(bt);
      }
      bndMenu.appendChild(r);
    });
    var note = document.createElement('p'); note.className = 'note';
    note.textContent = '음표가 선에 닿을 때 그 줄을 탭 · 키보드 ' + BND_KEYS[bnd.lanes].map(function (k) { return k.slice(3); }).join(' ') +
      (show ? ' · 동·은·금 · 첫 금에 칭호 「' + L.BND_TITLE + '」' + (L.bndTitles(S).length ? ' (받음)' : '') : '') + ' · 소리를 꺼도 할 수 있어요';
    bndMenu.appendChild(note);
    bndMenu.appendChild(bndButton(show ? '무대에 서기' : '연주 시작', bndStart, 'go'));
    bndActs.appendChild(bndButton('닫기', bndClose));
  }
  function bndClose() {
    if (bnd && bnd.back) { var g = bnd.back.g; try { g.gain.setTargetAtTime(0, sndCtx.currentTime, 0.05); } catch (e) { /* context gone */ } setTimeout(function () { g.disconnect(); }, 600); }
    bnd = null; bndEl.hidden = true; bndLastAt = 0;
  }

  // ---------- the round ----------
  // the melody of steps [0, n) of a track, timed with its swing → { mel: [{ t, m, hz, len }], dur }
  function bndMel(tr, n) {
    var t = 0, mel = [];
    for (var i = 0; i < n; i++) {
      (tr.steps[i] || []).forEach(function (ev) { if (ev[0] === 'lead') mel.push({ t: t, m: Math.round(69 + 12 * Math.log(ev[1] / 440) / Math.LN2), hz: ev[1], len: ev[2] }); });
      t += tr.eighth * (i % 2 ? 1 - tr.swing : 1 + tr.swing);
    }
    return { mel: mel, dur: t };
  }
  function bndStart() {
    var show = bnd.mode === 'show';
    if (show && L.bndShowWhy(S, now(), BND_TZ, bnd.phase) !== 'ok') { toast(BND_WHY[L.bndShowWhy(S, now(), BND_TZ, bnd.phase)], 2400); bndOpen('show'); return; }
    var name = show && S.band.song ? 'band' : bnd.phase, tr = musBuild(MUS[name]);
    var n = show ? tr.n : Math.min(BND_PLAY_STEPS, tr.n), m = bndMel(tr, n);
    var chart = L.bndChart(m.mel, bnd.lanes);
    chart.forEach(function (c, k) { c.hz = m.mel[k].hz; c.len = m.mel[k].len * tr.eighth; c.hit = null; });
    bnd.kind = 'round'; bnd.tr = tr; bnd.n = n; bnd.chart = chart; bnd.hits = { perfect: 0, good: 0, miss: 0 }; bnd.flash = [];
    bnd.end = chart.length ? chart[chart.length - 1].t + 1.2 : 1; bnd.combo = 0; bnd.cheer = 0;
    bnd.audio = !!(sndOn && musOn && sndCtx && sndCtx.state === 'running' && sndMus);
    if (bnd.audio) {
      bnd.t0 = sndCtx.currentTime + BND_LEAD;
      var g = sndCtx.createGain(); g.connect(sndMus);
      var back = Object.create(tr); back.steps = tr.steps.map(function (st) { return (st || []).filter(function (ev) { return ev[0] !== 'lead'; }); });
      bnd.back = { tr: back, g: g, step: 0, at: bnd.t0 };
    } else bnd.p0 = performance.now() + BND_LEAD * 1000;
    bnd.last = -BND_LEAD;
    bndShow(true);
    bndPads.innerHTML = '';
    for (var k = 0; k < bnd.lanes; k++) (function (lane) {
      var b = bndButton(BND_KEYS[bnd.lanes][lane].slice(3), function () {}, '', (lane + 1) + '번 줄');
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); bndTap(lane); });
      bndPads.appendChild(b);
    })(k);
    bndPads.style.setProperty('--n', bnd.lanes);
    bndTip.textContent = bnd.audio ? '음악에 맞춰 · 선에 닿을 때 탭' : '소리 없이 · 선에 닿을 때 탭';
    bndActs.innerHTML = ''; bndActs.appendChild(bndButton('그만', function () { bndClose(); }));
  }
  // seconds since the first note's time (negative in the lead-in)
  function bndT() {
    if (bnd.audio && (!sndOn || !sndCtx || sndCtx.state !== 'running')) {   // muted mid-round: carry on from here on the page clock
      bnd.audio = false; bnd.p0 = performance.now() - bnd.last * 1000;
      if (bnd.back) { bnd.back.g.disconnect(); bnd.back = null; }
    }
    bnd.last = bnd.audio ? sndCtx.currentTime - bnd.t0 : (performance.now() - bnd.p0) / 1000;
    return bnd.last;
  }
  function bndTap(lane) {
    if (!bndOn()) return;
    var gt = bndT(), best = null, off = 1e9;
    bnd.chart.forEach(function (c) {
      if (c.hit || c.lane !== lane) return;
      var o = (gt - c.t) * 1000;
      if (Math.abs(o) < Math.abs(off)) { off = o; best = c; }
    });
    var j = best && L.bndJudge(off);
    if (!j) { sfx('bandMiss'); bnd.flash.push({ lane: lane, at: gt, bad: true }); bndTip.textContent = '조금 이르게 · 음표가 선에 닿을 때'; return; }
    if (j === 'perfect') haptTap(12);   // 진동: a tick on an exact hit only. ponytail: bndTap runs in pointerdown/keydown (timing stays there); iOS tick from pointerdown needs a real-device check
    best.hit = j; bnd.hits[j]++; bnd.combo++; bnd.cheer = gt;
    bnd.flash.push({ lane: lane, at: gt });
    bndTip.textContent = (j === 'perfect' ? '딱!' : '좋아요') + (bnd.combo > 2 ? ' · ' + bnd.combo + '연속' : '');
    if (bnd.audio) try { MUS_INST[bnd.tr.lead[0]](bnd.back.g, best.hz, sndCtx.currentTime, best.len * 0.95, bnd.tr.lead[1]); } catch (e) { /* stay quiet */ }
  }
  // called every frame by loop.js frame() (whichever window hosts the game, so a round keeps going when PiP opens or closes)
  function bndFrame() {
    if (!bndOn()) return;
    var gt = bndT();
    if (bnd.back) {   // book the backing up to a quarter second ahead on the audio clock
      var ln = bnd.back, stop = sndCtx.currentTime + 0.25;
      while (ln.step < bnd.n && ln.at < stop) {
        if (ln.at >= sndCtx.currentTime - 0.02) musStep(ln, ln.at);
        ln.at += ln.tr.eighth * (ln.step % 2 ? 1 - ln.tr.swing : 1 + ln.tr.swing); ln.step++;
      }
    }
    bnd.chart.forEach(function (c) {
      if (!c.hit && (gt - c.t) * 1000 > L.BND_WIN.good) { c.hit = 'miss'; bnd.hits.miss++; bnd.combo = 0; }
    });
    bndDraw(gt);
    if (gt >= bnd.end) bndEnd();
  }
  function bndEnd() {
    var share = L.bndScore(bnd.hits, bnd.chart.length), show = bnd.mode === 'show', g, res;
    if (show) res = L.bndShowPay(S, share, now(), BND_TZ, bnd.phase);
    else res = L.bndPlayPay(S, share, now(), BND_TZ);
    g = res.ok ? res.grade : L.bndGrade(share);
    if (bnd.back) { var bg = bnd.back.g; setTimeout(function () { bg.disconnect(); }, 3000); bnd.back = null; }
    bnd.kind = 'done';
    sfx(show ? 'bandCheer' : 'bandEnd');
    bndShow(false);
    bndMenu.innerHTML = ''; bndActs.innerHTML = '';
    bndDrawStage(g);
    bndTip.textContent = (g ? L.BND_GRADE_NAME[g] + ' · ' : '') + Math.round(share * 100) + '점 · 딱 ' + bnd.hits.perfect + ' · 좋아요 ' + bnd.hits.good + ' · 놓침 ' + bnd.hits.miss;
    var lines = [];
    if (!res.ok) lines.push(BND_WHY[res.why] || '보상 없이 끝났어요');
    else if (show) {
      lines.push('+' + res.coins.toLocaleString('ko-KR') + '코인' + (res.fest ? ' (축제 ×' + L.BND_FEST_MUL + ')' : ''));
      if (res.grade) lines.push('관객 모두 친밀도 +' + (res.fest ? L.BND_FEST_MUL : 1));
      if (res.title) lines.push('칭호 「' + L.BND_TITLE + '」');
      if (res.song) lines.push('음악회 곡 해금 · 축제 날 밤에 흘러요');
    } else {
      lines.push(res.coins ? '+' + res.coins + '코인 · 오늘 보상 ' + res.left + '번 남음' : '오늘 보상은 끝 · 그냥 연주');
      if (res.who) lines.push(L.residentById(res.who).name + ' 친밀도 +1');
    }
    lines.forEach(function (x) { var p = document.createElement('p'); p.className = 'note'; p.textContent = x; bndMenu.appendChild(p); });
    if (res.ok && res.title) setTimeout(function () { toast('★ 칭호 「' + L.BND_TITLE + '」 · 음악회 금', 4200); }, 600);
    // 친밀도 level-ups said the way every other path says them (after the 칭호 toast when there is one)
    var ups = !res.ok ? [] : show ? [].concat.apply([], res.ups.map(function (u) { return u.ups; })) : res.ups;
    if (ups.length) setTimeout(function () { upsToast(ups, lines[1]); }, res.title ? 4900 : 0);
    if (!show) bndMenu.appendChild(bndButton('한 번 더', function () { bndOpen('play'); }, 'go'));
    bndActs.appendChild(bndButton('닫기', bndClose));
    bndWallet.textContent = S.coins.toLocaleString('ko-KR') + '코인';
    refresh();
  }

  // ---------- drawing (the board canvas: lanes, notes, the hit line, the audience) ----------
  function bndDraw(gt) {
    var c2 = bndCv.getContext('2d'), saved = ctx; ctx = c2;
    try {
      var n = bnd.lanes, lw = BND_W / n, show = bnd.mode === 'show';
      px(0, 0, BND_W, BND_H, 0);
      px(0, 0, Math.round(BND_W * Math.max(0, Math.min(1, gt / bnd.end))), 2, 3);   // how far along
      for (var k = 1; k < n; k++) px(Math.round(k * lw), 2, 1, BND_HIT, 1);
      bnd.flash = bnd.flash.filter(function (f) { return gt - f.at < 0.14; });
      bnd.flash.forEach(function (f) { px(Math.round(f.lane * lw) + 1, reduceMotion ? BND_HIT - 10 : 2, Math.round(lw) - 1, reduceMotion ? 10 : BND_HIT - 2, f.bad ? 1 : 2); });
      px(0, BND_HIT, BND_W, 2, 4);
      bnd.chart.forEach(function (c) {
        if (c.hit && c.hit !== 'miss') return;
        var y = BND_HIT - (c.t - gt) / BND_FALL * BND_HIT;
        if (y < -6 || y > BND_HIT + 10) return;
        var x = Math.round(c.lane * lw) + 2, w = Math.round(lw) - 4;
        if (c.hit === 'miss') { px(x, y - 2, w, 4, 2); return; }
        px(x, y - 3, w, 6, 4); px(x + 1, y - 2, w - 2, 4, 0); px(x + 2, y - 1, w - 4, 2, 3);
      });
      if (show) bndAudience(gt);
      else px(0, BND_HIT + 2, BND_W, BND_H - BND_HIT - 2, 1);
    } finally { ctx = saved; }
  }
  // residents in a row under the stage; a good note lifts them a pixel (not with reduced motion)
  function bndAudience(gt, still) {
    px(0, BND_HIT + 2, BND_W, BND_H - BND_HIT - 2, 1);
    L.BND_FANS.forEach(function (id, k) {
      var hop = !still && !reduceMotion && gt - bnd.cheer < 0.15 && (k + Math.floor(gt * 8)) % 2 ? 1 : 0;
      spr(FACE[id], 8 + k * 23, BND_H - 12 - hop);
    });
  }
  // the menu / result picture: the stage with every owned instrument on it, the audience below, the grade on a ribbon
  function bndDrawStage(grade) {
    var c2 = bndCv.getContext('2d'), saved = ctx; ctx = c2;
    try {
      px(0, 0, BND_W, BND_H, 0);
      px(6, 20, 108, 4, 4); for (var k = 0; k < 9; k++) px(8 + k * 12, 24, 6, 5, k % 2 ? 2 : 3);   // bunting
      px(4, 92, 112, 4, 4); px(6, 96, 108, 28, 3); px(6, 96, 108, 1, 4);                            // the stage
      L.BND_INS.forEach(function (d, k) {
        var x = 10 + (k % 3) * 36, y = 52 + Math.floor(k / 3) * 26;
        if (L.bndHas(S, d.id)) spr(BND_ICON[d.id], x + 6, y);
        else { px(x + 6, y + 10, 12, 2, 1); }
      });
      if (grade) {
        px(30, 4, 60, 12, 4); px(31, 5, 58, 10, 0);
        for (var g = 0; g < 3; g++) px(42 + g * 13, 7, 9, 6, g < grade ? 4 : 1);   // ■■■ = 금, ■■□ = 은, ■□□ = 동
      }
      if (bnd && bnd.mode === 'show') bndAudience(0, true);
      else px(0, BND_HIT + 2, BND_W, BND_H - BND_HIT - 2, 1);
    } finally { ctx = saved; }
  }

  // ---------- keys (input.js asks first): Esc closes, the lane letters tap, nothing reaches the pond behind ----------
  function bndKey(e) {
    if (!bnd || bndEl.hidden) return false;
    if (e.key === 'Escape') { e.preventDefault(); bndClose(); return true; }
    if (bndOn()) {
      var lane = BND_KEYS[bnd.lanes].indexOf(e.code);
      if (lane >= 0) { e.preventDefault(); if (!e.repeat) bndTap(lane); return true; }
    }
    if (e.code === 'Space') { e.preventDefault(); return true; }
    return false;
  }
  bndCv.addEventListener('pointerdown', function (e) {
    if (!bndOn()) return;
    e.preventDefault();
    var r = bndCv.getBoundingClientRect();
    bndTap(Math.max(0, Math.min(bnd.lanes - 1, Math.floor((e.clientX - r.left) / r.width * bnd.lanes))));
  });

  // ---------- music: the concert song on a festival night, silence under a round that books its own backing ----------
  // called by musTick with the phase; with no s.band it hands the phase straight back
  function bndTrack(p) {
    if (!S.band) return p;
    if (bndOn() && bnd.audio) return '';
    return L.bndSongNow(S, now(), BND_TZ, p) ? 'band' : p;
  }
  // 마을 음악회 곡 (first 금, or a 은 on a festival day): G major, 100 bpm, a light village march; 전자 피아노 lead, plucked arp
  MUS.band = {
    bpm: 100, swing: 0.06, lead: ['epiano', 0.05], voice: { arp: 'pluck' }, bassV: 0.075, arpV: 0.014, form: 'ABAC',
    bass: 'r . 5 . r . 5 .', arp: '. 3 . 5 . 3 . o', drum: 'k . h . s . h h',
    A: { ch: 'G Em C D', mel: 'D5 . G5 . B5 - A5 G5 | E5 - G5 . B4 . E5 . | C5 . E5 G5 E5 - C5 . | D5 - F#5 . A5 - - .' },
    B: { ch: 'C D Bm Em', mel: 'E5 . G5 . C6 - B5 A5 | F#5 - A5 . D5 . F#5 . | B4 . D5 F#5 B5 - A5 . | G5 - - - E5 - . .' },
    C: { ch: 'C D G G', mel: 'E5 . G5 . A5 - G5 E5 | F#5 - A5 . D6 - C6 . | B5 . A5 G5 D5 - B4 . | G5 - - - - - . .' }
  };

  // ---------- ⚙ 설정: one row per instrument owned (renderSet) ----------
  function bndSettings() {
    if (!L.bndOk(S)) return;
    var h3 = document.createElement('h3'); h3.textContent = '악기'; setEl.appendChild(h3);
    L.BND_INS.forEach(function (d) {
      if (!L.bndHas(S, d.id)) return;
      var lb = document.createElement('label'); lb.className = 'setRow';
      var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !S.band.mute[d.id];
      cb.addEventListener('change', function () { L.bndMute(S, d.id, !cb.checked); refresh(); });
      var tx = document.createElement('span'); tx.textContent = d.name;
      var sm = document.createElement('small'); sm.textContent = '배경음악에 ' + d.adds; tx.appendChild(sm);
      lb.appendChild(cb); lb.appendChild(tx); setEl.appendChild(lb);
    });
  }

  // ---------- 상점: what each instrument is and where it comes from (only once one is owned) ----------
  function bndShop() {
    if (!L.bndOk(S)) return;
    var h3 = document.createElement('h3'); h3.textContent = '악기';
    var b = document.createElement('b'); b.textContent = L.bndCount(S) + ' / ' + L.BND_INS.length; h3.appendChild(b); shopEl.appendChild(h3);
    L.BND_INS.forEach(function (d) {
      var has = L.bndHas(S, d.id), r = document.createElement('div'); r.className = 'up';
      var n = document.createElement('div'); n.className = 'n'; n.textContent = has ? d.name : '???';
      var sm = document.createElement('small'); sm.textContent = has ? '배경음악에 ' + d.adds + ' · ⚙ 설정에서 끄기' : d.hint; n.appendChild(sm);
      var bt = document.createElement('button'); bt.type = 'button'; bt.disabled = true; bt.className = 'max'; bt.textContent = has ? '있음' : '—';
      r.appendChild(has ? bndIcon(d.id) : document.createElement('span')); r.appendChild(n); r.appendChild(bt); shopEl.appendChild(r);
    });
  }

  // ---------- 떠돌이 상인: 우쿨렐레, apart from his 하루 하나 list (renderTrader) ----------
  function bndTrader() {
    var h3 = document.createElement('h3'); h3.textContent = '악기';
    var hb = document.createElement('b'); hb.textContent = '따로'; h3.appendChild(hb); sheetEl.appendChild(h3);
    var has = L.bndHas(S, 'uke'), r = sheetRow(bndIcon('uke'), '우쿨렐레', '배경음악에 리듬 반주 · 하루 하나와 따로', has ? 'idle' : '');
    var bt = document.createElement('button'); bt.type = 'button';
    if (has) { bt.textContent = '있음'; bt.disabled = true; bt.className = 'max'; }
    else {
      bt.textContent = L.BND_UKE_COST.toLocaleString('ko-KR'); bt.setAttribute('aria-label', '우쿨렐레 사기 ' + L.BND_UKE_COST + '코인');
      if (S.coins < L.BND_UKE_COST) bt.classList.add('poor');
      bt.addEventListener('click', function () {
        var res = L.bndBuyUke(S);
        if (!res.ok) { toast(BND_WHY[res.why] || '살 수 없어요'); bt.classList.remove('shake'); void bt.offsetWidth; bt.classList.add('shake'); return; }
        sfx('bandBuy'); toast('우쿨렐레 · 상인: 줄은 갓 갈았어요! · 마당 ♪ 연주', 3000); bndLastAt = 0; refresh(); renderTrader();
      });
    }
    r.appendChild(bt);
  }

  // ---------- console hooks ----------
  function addBandHooks(FF) {
    // FF.band('drum') / FF.band('all') gives instruments; FF.band() = s.band
    FF.band = function (id) {
      (id === 'all' ? L.BND_INS.map(function (d) { return d.id; }) : id ? [id] : []).forEach(function (k) { L.bndGive(S, k); });
      bndLastAt = 0; refresh(); return S.band;
    };
    FF.bandPlay = function () { if (L.bndOk(S)) bndOpen('play'); return bnd && bnd.mode; };
    FF.bandShow = function () { var why = L.bndShowWhy(S, now(), BND_TZ, bndPhase()); if (why === 'ok') bndOpen('show'); return why; };
    FF.bandStart = function () { if (bnd && bnd.kind === 'menu') bndStart(); return bnd && { kind: bnd.kind, lanes: bnd.lanes, notes: bnd.chart && bnd.chart.length, audio: bnd.audio }; };
    FF.bandTap = function (lane) { bndTap(lane); return bnd && bnd.hits; };
    // plays the next note on time (a perfect hand) → hits so far
    FF.bandAuto = function () {
      if (!bndOn()) return null;
      var gt = bndT(), c = bnd.chart.filter(function (x) { return !x.hit && Math.abs(gt - x.t) * 1000 <= L.BND_WIN.perfect; })[0];
      if (c) bndTap(c.lane);
      return bnd.hits;
    };
    FF.bandState = function () { return bnd && { kind: bnd.kind, mode: bnd.mode, lanes: bnd.lanes, audio: bnd.audio, t: bnd.last, hits: bnd.hits, end: bnd.end }; };
  }
