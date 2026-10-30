  // ---------- 게임장 (마을 아래, 장터 가는 길 옆): the building, one overlay for 고르기·내기 and the round ----------
  // Logic: logic/arcade.js. The overlay (#arcade) shows the game list, then 난이도·내기, then a 120×120 board.
  // Round time = performance.now() since the round began, minus time behind the boss key, so ?speed never changes it.
  var ARC_AT = [98, 166, 28, 32];   // between the path down and the 박물관 (the tree that stood here is gone)
  var AW = 120, AH = 120;
  var ARC_TZ = -new Date().getTimezoneOffset();
  var ARC_WHY = { village: '마을이 열리면 문을 열어요', cap: '오늘 상금 게임은 다 했어요 · 그냥 놀기만 돼요', coins: '코인이 부족해요',
    bet: '걸 수 없는 금액이에요', game: '없는 게임이에요', diff: '난이도를 골라 주세요' };
  var ARC_HOW = { mole: '채소 도둑 두더지를 눌러 잡기', match: '두 장씩 뒤집어 같은 그림 맞추기', throw: '움직이는 과녁에 공 던지기 (탭)', slot: '탭 한 번 · 운에 맡기기' };
  var arcEl = document.createElement('section');
  arcEl.className = 'overlay'; arcEl.id = 'arcade'; arcEl.hidden = true; arcEl.setAttribute('aria-label', '게임장');
  app.appendChild(arcEl);
  var arcHead = document.createElement('h2'), arcTitle = document.createElement('span'), arcWallet = document.createElement('span');
  var arcCv = document.createElement('canvas'), arcTip = document.createElement('p'), arcMenu = document.createElement('div'), arcActs = document.createElement('div');
  arcWallet.className = 'wallet'; arcHead.appendChild(arcTitle); arcHead.appendChild(arcWallet);
  arcCv.width = AW; arcCv.height = AH; arcTip.className = 'tip'; arcMenu.className = 'menu'; arcActs.className = 'acts';
  [arcHead, arcCv, arcTip, arcMenu, arcActs].forEach(function (el) { arcEl.appendChild(el); });
  var arc = null;   // { kind: 'menu' | 'pick' | 'round', game, diff, bet, play, g, t0, paused, bossAt, done, … }
  var arcIcons = {};
  function arcOn() { return !!arc && arc.kind === 'round' && !arc.done; }
  function arcT() { return performance.now() - arc.t0 - arc.paused; }

  // ---------- the building on the 마을 street ----------
  function drawArcade(tt) {
    var x = ARC_AT[0], y = ARC_AT[1], blink = reduceMotion ? 0 : Math.floor(tt * 2) % 2;
    px(x + 3, y, 22, 6, 4); px(x + 4, y + 1, 20, 4, 0);                                     // sign board
    for (var s = 0; s < 3; s++) { px(x + 7 + s * 5, y + 2, 3, 1, 4); px(x + 9 + s * 5, y + 3, 1, 1, 4); px(x + 8 + s * 5, y + 4, 1, 1, 4); }   // 777
    for (var b = 0; b < 6; b++) px(x + 4 + b * 4, y - 1, 1, 1, (b + blink) % 2 ? 4 : 2);  // bulbs along the top
    px(x + 13, y + 6, 1, 2, 4); px(x + 6, y + 6, 1, 2, 4); px(x + 21, y + 6, 1, 2, 4);
    px(x, y + 7, 28, 6, 4);                                                                 // striped awning
    for (var k = 0; k < 7; k++) px(x + k * 4 + (k ? 0 : 1), y + 8, k && k < 6 ? 4 : 3, 4, k % 2 ? 0 : 2);
    px(x + 1, y + 13, 26, 16, 4); px(x + 2, y + 13, 24, 15, 1);                            // wall
    px(x + 10, y + 17, 8, 11, 4); px(x + 11, y + 18, 6, 10, 3); px(x + 15, y + 23, 1, 1, 0);   // door
    px(x + 3, y + 16, 6, 7, 4); px(x + 4, y + 17, 4, 5, blink ? 2 : 0); px(x + 5, y + 18, 2, 2, 4);   // window: a ball on a claw
    px(x + 19, y + 16, 6, 7, 4); px(x + 20, y + 17, 4, 5, blink ? 0 : 2); px(x + 21, y + 19, 2, 1, 4); px(x + 21, y + 21, 2, 1, 4);   // window: a slot face
    px(x, y + 29, 28, 2, 4); px(x + 2, y + 31, 24, 1, 3);                                  // step
  }
  function tapArcade(x, y) {
    if (!hit(ARC_AT, x, y, 1)) return false;
    openArcade();
    return true;
  }

  // ---------- overlay screens ----------
  function arcButton(text, fn, cls, label) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = text;
    if (cls) b.className = cls;
    if (label) b.setAttribute('aria-label', label);
    b.addEventListener('click', fn);
    return b;
  }
  function arcHeader(title) {
    arcTitle.textContent = title;
    arcWallet.textContent = S.coins.toLocaleString('ko-KR') + '코인';
  }
  function arcShow(round) {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true; sheetEl.hidden = true;
    arcEl.hidden = false;
    arcCv.hidden = !round; arcMenu.hidden = !!round;
  }
  function closeArcade() {
    if (arcOn()) arcEnd(null);   // closing mid-round = giving up
    arc = null; arcEl.hidden = true;
  }
  function leftText() {
    var n = L.arcLeft(S, now(), ARC_TZ);
    return n > 0 ? '오늘 상금 게임 ' + n + '/' + L.ARC_DAY_CAP + '판 남음' : '오늘 상금 게임은 끝 · 내일까지는 그냥 놀기만';
  }
  function openArcade() {
    arc = { kind: 'menu' };
    arcHeader('게임장');
    arcTip.textContent = leftText();
    arcMenu.innerHTML = ''; arcActs.innerHTML = '';
    L.ARC_GAMES.forEach(function (gm) {
      var r = document.createElement('div'); r.className = 'up';
      var n = document.createElement('div'); n.className = 'n'; n.textContent = gm.name;
      var sm = document.createElement('small');
      sm.textContent = ARC_HOW[gm.id] + ' · ' + (gm.luck ? '777 ×' + L.ARC_SLOT_PAY.seven + ' · 셋 ×' + L.ARC_SLOT_PAY.three + ' · 둘 ×' + L.ARC_SLOT_PAY.two
        : L.ARC_DIFFS.map(function (d) { return L.ARC_DIFF_NAME[d] + ' ×' + L.ARC_MUL[d]; }).join(' · '));
      n.appendChild(sm);
      r.appendChild(gameIcon(gm.id)); r.appendChild(n);
      r.appendChild(arcButton('고르기', function () { arcOpenPick(gm.id, arc && arc.diff); }, 'max', gm.name + ' 고르기'));
      arcMenu.appendChild(r);
    });
    arcActs.appendChild(arcButton('닫기', closeArcade));
    arcShow(false);
  }
  function ruleText(game, diff) {
    if (game === 'slot') return '777 ×' + L.ARC_SLOT_PAY.seven + ' · 셋 같으면 ×' + L.ARC_SLOT_PAY.three + ' · 둘 같으면 ×' + L.ARC_SLOT_PAY.two + ' · 나머지는 꽝';
    if (game === 'mole') { var m = L.ARC_MOLE[diff]; return (L.ARC_MOLE_TIME / 1000) + '초 안에 두더지 ' + m.need + '마리' + (m.hog ? ' · 고슴도치를 누르면 −' + L.ARC_HOG_COST : ''); }
    if (game === 'match') { var c = L.ARC_MATCH[diff]; return c.pairs + '쌍을 ' + c.tries + '번 안에 다 맞추기'; }
    var t = L.ARC_THROW[diff];
    return '공 ' + L.ARC_BALLS + '개 중 ' + t.need + '개 맞히기 · 공이 날아가는 동안 과녁도 움직여요';
  }
  // 난이도 + 내기 for one game
  function arcOpenPick(game, diff) {
    var gm = L.arcGame(game);
    diff = gm.luck ? null : diff || 'normal';
    arc = { kind: 'pick', game: game, diff: diff };
    arcHeader(gm.name);
    var left = L.arcLeft(S, now(), ARC_TZ);
    arcTip.textContent = ruleText(game, diff);
    arcMenu.innerHTML = ''; arcActs.innerHTML = '';
    if (!gm.luck) {
      var h = document.createElement('h3'); h.textContent = '난이도'; arcMenu.appendChild(h);
      var dr = document.createElement('div'); dr.className = 'pick'; dr.setAttribute('role', 'group'); dr.setAttribute('aria-label', '난이도');
      L.ARC_DIFFS.forEach(function (d) {
        var b = arcButton(L.ARC_DIFF_NAME[d] + ' ×' + L.ARC_MUL[d], function () { arcOpenPick(game, d); }, d === diff ? 'on' : '');
        b.setAttribute('aria-pressed', d === diff ? 'true' : 'false');
        dr.appendChild(b);
      });
      arcMenu.appendChild(dr);
    }
    var h2 = document.createElement('h3'); h2.textContent = '걸기';
    var hb = document.createElement('b'); hb.textContent = leftText(); h2.appendChild(hb);
    arcMenu.appendChild(h2);
    var br = document.createElement('div'); br.className = 'pick'; br.setAttribute('role', 'group'); br.setAttribute('aria-label', '걸 코인');
    L.ARC_BETS.forEach(function (bet) {
      var b = arcButton(bet.toLocaleString('ko-KR'), function () { startRound(game, diff, bet); }, '', bet + '코인 걸고 시작');
      if (left <= 0 || S.coins < bet) b.disabled = true;
      br.appendChild(b);
    });
    arcMenu.appendChild(br);
    var p = document.createElement('p'); p.className = 'note';
    if (left > 0) p.textContent = gm.luck ? '건 코인은 먼저 내요 · 맞으면 건 코인 × 배수를 받아요'
      : '건 코인은 먼저 내요 · 이기면 ' + (diff ? '×' + L.ARC_MUL[diff] : '배수') + '로 돌려받고, 지면 잃어요 · 그만두면 진 거예요';
    else {
      p.textContent = '상금 게임은 내일 다시 · 지금은 걸지 않고 그냥 놀 수 있어요';
      arcMenu.appendChild(p);
      p = null;
      arcMenu.appendChild(arcButton('그냥 놀기', function () { startRound(game, diff, 0); }, 'go'));
    }
    if (p) arcMenu.appendChild(p);
    arcActs.appendChild(arcButton('다른 게임', openArcade));
    arcActs.appendChild(arcButton('닫기', closeArcade));
    arcShow(false);
  }

  // ---------- a round ----------
  function startRound(game, diff, bet) {
    var r = L.arcStart(S, game, diff, bet, now(), ARC_TZ);
    if (!r.ok) { toast(ARC_WHY[r.why] || '지금은 못 해요', 2400); if (arc && arc.kind === 'pick') arcOpenPick(game, diff); return; }
    refresh();   // the bet is paid now: save it
    var g = game === 'mole' ? L.moleLayout(diff, Math.random) : game === 'match' ? L.matchDeal(diff, Math.random)
      : game === 'throw' ? L.throwSetup(diff, Math.random) : null;
    arc = { kind: 'round', game: game, diff: diff, bet: bet, play: r.play, g: g, t0: performance.now(), paused: 0, bossAt: 0,
      done: false, fx: [], hideAt: 0, endAt: 0, ballAt: 0, fly: null, reels: null, spinAt: 0, tipKey: '' };
    arcHeader(L.arcGame(game).name + (diff ? ' · ' + L.ARC_DIFF_NAME[diff] : ''));
    arcActs.innerHTML = '';
    arcActs.appendChild(arcButton(bet ? '그만하기 (건 코인은 잃어요)' : '그만하기', function () { if (arcOn()) arcEnd(null); }));
    arcShow(true);
    tickArcade(0);
  }
  // win: true/false (skill), the slot multiplier, or null = gave up
  function arcEnd(win) {
    var a = arc, pay = win === null ? 0 : L.arcPay(S, a.play, win), msg;
    a.done = true;
    var ok = typeof win === 'number' ? win > 0 : !!win;
    if (win === null) msg = a.bet ? '그만했다 · ' + a.bet.toLocaleString('ko-KR') + '코인은 게임장 몫' : '그만했다';
    else if (a.game === 'slot') msg = ok ? '×' + win + '!' + (a.bet ? ' · +' + pay.toLocaleString('ko-KR') : '') : '꽝' + (a.bet ? ' · ' + a.bet.toLocaleString('ko-KR') + '코인을 잃었다' : '');
    else msg = ok ? '이겼다!' + (a.bet ? ' · +' + pay.toLocaleString('ko-KR') : ' (그냥 놀기)') : '아쉽다' + (a.bet ? ' · ' + a.bet.toLocaleString('ko-KR') + '코인을 잃었다' : '');
    arcTip.textContent = msg;
    arcHeader(arcTitle.textContent);
    if (pay) { fxCoinsDom(arcWallet); fxStamp(arcTip); }
    refresh();
    if (!arc || arc !== a || arcEl.hidden) return;
    arcActs.innerHTML = '';
    arcActs.appendChild(arcButton('한 판 더', function () {
      var bet = a.bet && L.arcLeft(S, now(), ARC_TZ) > 0 ? a.bet : 0;
      if (a.bet && !bet) { toast(ARC_WHY.cap, 2400); arcOpenPick(a.game, a.diff); return; }
      if (!a.bet && L.arcLeft(S, now(), ARC_TZ) > 0) { arcOpenPick(a.game, a.diff); return; }   // a new day began: prize plays again
      startRound(a.game, a.diff, bet);
    }, 'go'));
    arcActs.appendChild(arcButton('다른 게임', openArcade));
    arcActs.appendChild(arcButton('닫기', closeArcade));
    drawBoard();
  }
  // board coordinates from a pointer
  arcCv.addEventListener('pointerdown', function (e) {
    if (!arcOn() || boss) return;
    e.preventDefault();
    var r = arcCv.getBoundingClientRect();
    arcTap((e.clientX - r.left) * AW / r.width, (e.clientY - r.top) * AH / r.height);
  });
  // Space: throw / spin (the games without a place to aim)
  function arcKey() { if (arcOn() && !boss && (arc.game === 'throw' || arc.game === 'slot')) arcTap(AW / 2, AH / 2); }

  var MOLE_HX = [22, 60, 98], MOLE_HY = [44, 74, 104];
  function holeAt(h) { return [MOLE_HX[h % 3], MOLE_HY[Math.floor(h / 3)]]; }
  function cardBox(k) {
    var n = arc.g.cards.length, cols = n > 16 ? 5 : 4, rows = n / cols, cw = 20, ch = 24, gap = 3;
    var x0 = Math.round((AW - cols * cw - (cols - 1) * gap) / 2), y0 = Math.round((AH - rows * ch - (rows - 1) * gap) / 2) + 4;
    return [x0 + (k % cols) * (cw + gap), y0 + Math.floor(k / cols) * (ch + gap), cw, ch];
  }
  function arcTap(x, y) {
    var a = arc, g = a.g, t = arcT();
    if (a.game === 'mole') {
      for (var h = 0; h < L.ARC_MOLE_HOLES; h++) {
        var p = holeAt(h);
        if (Math.abs(x - p[0]) > 17 || y < p[1] - 24 || y > p[1] + 5) continue;
        var r = L.moleTap(g, t, h);
        if (r) a.fx.push({ k: r, x: p[0], y: p[1] - 12, t: t });
        return;
      }
    } else if (a.game === 'match') {
      if (a.hideAt) return;
      for (var k = 0; k < g.cards.length; k++) {
        if (!hit(cardBox(k), x, y, 1)) continue;
        var f = L.matchFlip(g, k);
        if (f === 'miss') a.hideAt = t + 700;
        if (f === 'pair' && L.matchOver(g)) a.endAt = t + 400;
        return;
      }
    } else if (a.game === 'throw') {
      if (a.fly || a.endAt || t < a.ballAt) return;
      var hitIt = L.throwShot(g, t - a.ballAt);
      if (hitIt !== null) a.fly = { t: t, hit: hitIt };
    } else if (!a.reels) {
      a.reels = L.slotSpin(Math.random); a.spinAt = t;
    }
  }

  // ---------- tick (frame loop) ----------
  var SLOT_STOP = [700, 1100, 1500];
  function tickArcade(dt) {
    if (!arcOn()) return;
    if (boss) { if (!arc.bossAt) arc.bossAt = performance.now(); return; }
    if (arc.bossAt) { arc.paused += performance.now() - arc.bossAt; arc.bossAt = 0; }
    var a = arc, g = a.g, t = arcT(), tip;
    if (a.game === 'mole') {
      if (L.moleOver(g, t)) { arcEnd(g.score >= g.need); return; }
      tip = '잡은 두더지 ' + g.score + ' / ' + g.need + ' · ' + Math.ceil((L.ARC_MOLE_TIME - t) / 1000) + '초';
    } else if (a.game === 'match') {
      if (a.hideAt && t >= a.hideAt) { L.matchHide(g); a.hideAt = 0; if (L.matchOver(g)) a.endAt = t; }
      if (a.endAt && t >= a.endAt) { arcEnd(L.matchWon(g)); return; }
      tip = '맞춘 짝 ' + (g.cards.length / 2 - L.matchLeft(g)) + ' / ' + g.cards.length / 2 + ' · 남은 기회 ' + (g.tries - g.used);
    } else if (a.game === 'throw') {
      if (a.fly && t >= a.fly.t + g.flight) {
        a.fx.push({ k: a.fly.hit ? 'hit' : 'miss', x: L.ARC_AIM, y: 26, t: t });
        a.fly = null;
        if (g.shots.length >= g.balls.length) a.endAt = t + 600; else a.ballAt = t + 400;
      }
      if (a.endAt && t >= a.endAt) { arcEnd(L.throwHits(g) >= g.need); return; }
      tip = '맞힌 공 ' + L.throwHits(g) + ' / ' + g.need + ' · 남은 공 ' + (g.balls.length - g.shots.length) + ' · 탭 = 던지기';
    } else {
      if (a.reels && t >= a.spinAt + SLOT_STOP[2] + 300) { arcEnd(L.slotMul(a.reels)); return; }
      tip = a.reels ? '돌아가는 중…' : '탭해서 돌리기' + (a.bet ? ' · ' + a.bet.toLocaleString('ko-KR') + '코인' : '');
    }
    if (tip !== a.tipKey) { a.tipKey = tip; arcTip.textContent = tip; }
    drawBoard();
  }

  // ---------- drawing ----------
  var MOLE_SPR = ['...44444...', '..4333334..', '.444444444.', '.440444044.', '.433343334.', '.433444334.', '..4333334..', '.443333344.', '4.4333334.4'];
  var HOG_SPR = ['..4.4.4.4..', '.444444444.', '44444444444', '.442222244.', '4420222024.', '.422242224.', '..4222224..', '...44444...'];
  var SEVEN_SPR = ['4444444', '4444444', '.....44', '....44.', '...44..', '...44..', '..44...', '..44...'];
  // a sprite at 2×, only its top `n` rows (a mole coming out of the hole)
  function big(rows, x, y, n) {
    for (var j = 0; j < Math.min(n, rows.length); j++) for (var i = 0; i < rows[j].length; i++) if (rows[j][i] !== '.') px(x + i * 2, y + j * 2, 2, 2, +rows[j][i]);
  }
  function iconFor(id) { return arcIcons[id] || (arcIcons[id] = itemIcon(id)); }
  function arcIcon(id, cx, cy, sc) {
    if (id === 'seven') { big(SEVEN_SPR, cx - 7, cy - 8, 99); return; }
    var c = iconFor(id);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(c, Math.round(cx - c.width * sc / 2), Math.round(cy - c.height * sc / 2), c.width * sc, c.height * sc);
  }
  function drawBoard() {
    if (!arc || arc.kind !== 'round') return;
    var saved = ctx; ctx = arcCv.getContext('2d');
    try {
      px(0, 0, AW, AH, 0);
      var t = arc.done ? arc.lastT || 0 : arcT();
      if (!arc.done) arc.lastT = t;
      if (arc.game === 'mole') drawMole(t); else if (arc.game === 'match') drawMatch(); else if (arc.game === 'throw') drawThrow(t); else drawSlotGame(t);
      arc.fx = arc.fx.filter(function (f) { return t - f.t < 400; });
      arc.fx.forEach(function (f) {
        var u = (t - f.t) / 400, yy = f.y - (reduceMotion ? 0 : u * 6);
        if (f.k === 'mole' || f.k === 'hit') { px(f.x - 1, yy - 4, 2, 8, 4); px(f.x - 4, yy - 1, 8, 2, 4); px(f.x - 3, yy - 3, 1, 1, 4); px(f.x + 2, yy + 2, 1, 1, 4); }   // bonk star
        else { px(f.x - 4, yy, 8, 2, 4); if (f.k === 'hog') { px(f.x + 6, yy - 3, 2, 8, 4); px(f.x + 9, yy - 3, 2, 8, 4); } }                                      // − (hog: −2 drawn as − ‖)
      });
    } finally { ctx = saved; }
  }
  function drawMole(t) {
    var g = arc.g, left = Math.max(0, 1 - t / L.ARC_MOLE_TIME), up = {};
    px(0, 0, Math.round(AW * left), 3, 4);                                               // time left
    L.moleUp(g, t).forEach(function (k) { up[g.pops[k].hole] = k; });
    for (var h = 0; h < L.ARC_MOLE_HOLES; h++) {
      var p = holeAt(h), k = up[h];
      px(p[0] - 13, p[1] - 2, 26, 6, 4); px(p[0] - 11, p[1] - 3, 22, 1, 4);              // the hole
      if (k !== undefined) {
        var pop = g.pops[k], age = t - pop.t, rem = g.up - age, rows = pop.hog ? HOG_SPR : MOLE_SPR;
        var n = reduceMotion ? rows.length : Math.max(1, Math.min(rows.length, Math.ceil(rows.length * Math.min(age, rem) / 90)));
        big(rows, p[0] - 11, p[1] - n * 2 + 2, n);
      }
      px(p[0] - 14, p[1] + 3, 28, 2, 2); px(p[0] - 12, p[1] + 5, 24, 1, 3);              // front lip of earth
    }
  }
  function drawMatch() {
    var g = arc.g;
    g.cards.forEach(function (id, k) {
      var b = cardBox(k), x = b[0], y = b[1], open = g.open.indexOf(k) >= 0;
      if (g.gone[k]) { px(x, y, b[2], 1, 2); px(x, y + b[3] - 1, b[2], 1, 2); px(x, y, 1, b[3], 2); px(x + b[2] - 1, y, 1, b[3], 2); drawIconFaded(id, x + b[2] / 2, y + b[3] / 2); return; }
      px(x, y, b[2], b[3], 4);
      if (open || arc.done) { px(x + 1, y + 1, b[2] - 2, b[3] - 2, 0); arcIcon(id, x + b[2] / 2, y + b[3] / 2, 1); }
      else {
        px(x + 1, y + 1, b[2] - 2, b[3] - 2, 3);
        for (var j = 0; j < 4; j++) px(x + 4 + (j % 2) * 8, y + 5 + Math.floor(j / 2) * 10, 4, 4, 2);   // card back pattern
      }
    });
  }
  function drawIconFaded(id, cx, cy) { ctx.globalAlpha = 0.25; arcIcon(id, cx, cy, 1); ctx.globalAlpha = 1; }
  var TY = 26, THROW_Y = 104;
  function drawThrow(t) {
    var g = arc.g, i = Math.min(g.shots.length - (arc.fly ? 1 : 0), g.balls.length - 1);
    // shots so far: filled = hit, cross = miss, open = to come
    for (var s = 0; s < g.balls.length; s++) {
      var sx = 6 + s * 9, sh = g.shots[s], landed = sh && !(arc.fly && s === g.shots.length - 1);
      if (!landed) { px(sx, 4, 6, 6, 4); px(sx + 1, 5, 4, 4, 0); }
      else if (sh.hit) px(sx, 4, 6, 6, 4);
      else { for (var q = 0; q < 6; q++) { px(sx + q, 4 + q, 1, 1, 4); px(sx + 5 - q, 4 + q, 1, 1, 4); } }
    }
    px(L.ARC_LANE[0] - 4, TY + 5, L.ARC_LANE[1] - L.ARC_LANE[0] + 8, 1, 2);             // the rail the target slides on
    var u = arc.fly ? t - arc.ballAt : Math.max(0, t - arc.ballAt);
    var tx = L.throwX(g, i, u), hw = g.w / 2;
    px(tx - hw, TY - 4, g.w, 8, 4); px(tx - hw + 1, TY - 3, g.w - 2, 6, 0); px(tx - 1, TY - 3, 2, 6, 4);   // target board, bull line
    for (var y = TY + 10; y < THROW_Y - 8; y += 6) px(L.ARC_AIM, y, 1, 2, 1);           // where the ball goes
    px(L.ARC_AIM - 4, THROW_Y + 4, 8, 10, 3); px(L.ARC_AIM - 2, THROW_Y, 4, 4, 4);       // thrower
    if (arc.fly) {
      var f = Math.min(1, (t - arc.fly.t) / g.flight), by = THROW_Y - 2 - (THROW_Y - 2 - TY) * f;
      px(L.ARC_AIM - 2, by - 2, 4, 4, 4);
    } else if (!arc.endAt && t >= arc.ballAt && !arc.done) px(L.ARC_AIM - 2, THROW_Y - 4, 4, 4, 4);   // ball in hand
  }
  function drawSlotGame(t) {
    px(6, 30, 108, 50, 4); px(8, 32, 104, 46, 1);                                         // the machine face
    for (var r = 0; r < 3; r++) {
      var x = 12 + r * 34, spinning = arc.reels && t < arc.spinAt + SLOT_STOP[r];
      px(x, 36, 28, 38, 4); px(x + 1, 37, 26, 36, 0);
      var id = arc.reels ? arc.reels[r] : L.ARC_SLOT[(r * 2 + 1) % L.ARC_SLOT.length].id;
      if (spinning && !reduceMotion) {
        var k = Math.floor((t - arc.spinAt) / 70 + r * 2) % L.ARC_SLOT.length, off = ((t - arc.spinAt) / 70 % 1) * 12;
        ctx.save(); ctx.beginPath(); ctx.rect(x + 1, 37, 26, 36); ctx.clip();
        arcIcon(L.ARC_SLOT[k].id, x + 14, 55 - 12 + off, 2); arcIcon(L.ARC_SLOT[(k + 1) % L.ARC_SLOT.length].id, x + 14, 55 + 12 + off, 2);
        ctx.restore();
      } else if (spinning) { px(x + 8, 54, 12, 2, 2); }
      else arcIcon(id, x + 14, 55, 2);
    }
    px(116, 40, 2, 20, 4); px(114, 36, 6, 5, arc.reels ? 2 : 4);                          // lever
    px(20, 86, 80, 10, 4); px(21, 87, 78, 8, 0);
    var mul = arc.done && arc.reels ? L.slotMul(arc.reels) : 0;
    for (var b = 0; b < 8; b++) px(24 + b * 10, 90, 6, 2, mul ? 4 : 2);                  // win lights: lit on a win
  }
  // little canvas icons for the game rows
  function gameIcon(id) {
    return iconOf(function () {
      if (id === 'mole') { px(1, 11, 14, 3, 4); spr(MOLE_SPR.slice(0, 6), 2, 5); }
      else if (id === 'match') { px(1, 2, 7, 10, 4); px(2, 3, 5, 8, 3); px(8, 4, 7, 10, 4); px(9, 5, 5, 8, 0); px(10, 8, 3, 2, 4); }
      else if (id === 'throw') { px(3, 2, 10, 4, 4); px(4, 3, 8, 2, 0); px(7, 3, 2, 2, 4); px(7, 11, 3, 3, 4); px(8, 7, 1, 3, 2); }
      else spr(SEVEN_SPR, 4, 4);
    }, 16, 16);
  }

  // ---------- console hooks ----------
  function addArcadeHooks(FF) {
    // FF.arcade() opens it; FF.arcade(game, diff, bet) starts a round (bet 0 = 그냥 놀기 once the day's prize plays are used)
    FF.arcade = function (game, diff, bet) {
      if (!L.villageOk(S)) S.rep = Math.max(S.rep, L.VILLAGE_REP);
      if (!game) { openArcade(); return L.arcLeft(S, now(), ARC_TZ); }
      startRound(game, diff || null, bet === undefined ? L.ARC_BETS[0] : bet);
      return FF.arcadeState();
    };
    FF.arcadeState = function () {
      return arc && { kind: arc.kind, game: arc.game, diff: arc.diff, bet: arc.bet, done: arc.done, t: arc.kind === 'round' ? Math.round(arc.done ? arc.lastT : arcT()) : 0,
        g: arc.g, reels: arc.reels, ballAt: arc.ballAt, fly: !!arc.fly, left: L.arcLeft(S, now(), ARC_TZ), coins: S.coins };
    };
    FF.arcadeTap = function (x, y) { if (arcOn()) arcTap(x, y); return FF.arcadeState(); };
  }
