  // ---------- 게임장 (마을 장터 옆): 코인을 걸고 하는 작은 게임 4종 ----------
  // The bet is paid up front. A skill game won pays bet × ARC_MUL[난이도]; lost, the bet is gone. 슬롯머신 is luck only.
  // Prize plays are capped per real (local) day like the 날씨 장난감; after that a game is just for fun (no bet, no prize).
  // s.arcade = { d: local day number, n: prize plays started that day } is made on the first bet; older saves have none.
  // Round times are the UI's real milliseconds since the round began (performance.now), so ?speed never changes the feel.
  // Everything here is a tuning knob: keep the numbers in these tables.
  var ARC_BETS = [100, 300, 500, 1000];                  // small on purpose: a skilled hand wins 어려움 often (tools/BALANCE.md)
  var ARC_DAY_CAP = 10;                                    // prize plays per real day
  var ARC_DIFFS = ['easy', 'normal', 'hard'];
  var ARC_DIFF_NAME = { easy: '쉬움', normal: '보통', hard: '어려움' };
  var ARC_MUL = { easy: 1.5, normal: 2, hard: 3 };         // skill game won → bet × this
  var ARC_GAMES = [
    { id: 'mole', name: '두더지 잡기' }, { id: 'match', name: '짝 맞추기' },
    { id: 'throw', name: '공 던지기' }, { id: 'slot', name: '슬롯머신', luck: true }
  ];
  // 두더지 잡기: ARC_MOLE_HOLES holes for ARC_MOLE_TIME ms. up = ms a mole stays up, gap = ms between pops (±30%),
  // need = moles to reach, hog = share of pops that are 고슴도치 (tapping one takes ARC_HOG_COST off)
  var ARC_MOLE_TIME = 30e3, ARC_MOLE_HOLES = 9, ARC_HOG_COST = 2;
  var ARC_MOLE = {
    easy:   { up: 740, gap: 600, need: 41, hog: 0 },
    normal: { up: 560, gap: 480, need: 42, hog: 0.1 },
    hard:   { up: 500, gap: 440, need: 44, hog: 0.15 }
  };
  // 짝 맞추기: pairs of cards, tries = pairs of cards you may turn (a perfect memory wins hard ~9 times in 10, a real one far less)
  var ARC_MATCH = { easy: { pairs: 6, tries: 11 }, normal: { pairs: 8, tries: 14 }, hard: { pairs: 10, tries: 16 } };
  var ARC_CARDS = ['radish', 'berry', 'melon', 'potato', 'pepper', 'corn', 'crucian', 'eel', 'squid', 'octopus'];
  // 공 던지기: ARC_BALLS balls at a target sliding across ARC_LANE (px on the 120-wide board) and back.
  // w = target width, period = ms for one sweep there and back (each ball picks one in the range), flight = ms the ball
  // takes to reach the target line (aim ahead!), need = hits to win. A hit = ball centre within w/2 + ARC_BALL_R of it.
  var ARC_BALLS = 5, ARC_LANE = [10, 110], ARC_AIM = 60, ARC_BALL_R = 2;
  var ARC_THROW = {
    easy:   { w: 14, period: [1900, 2300], flight: 400, need: 4 },
    normal: { w: 10, period: [1300, 1600], flight: 450, need: 4 },
    hard:   { w: 7,  period: [1000, 1300], flight: 500, need: 4 }
  };
  // 슬롯머신: reel symbols and weights (each reel the same). 777 ×20, three alike ×5, two alike ×1.5.
  // These weights return about 0.91 of the bet on average (test/arcade.test.js works it out exactly).
  var ARC_SLOT = [
    { id: 'seven', w: 2 }, { id: 'radish', w: 8 }, { id: 'berry', w: 6 },
    { id: 'crucian', w: 5 }, { id: 'melon', w: 4 }, { id: 'octopus', w: 3 }
  ];
  var ARC_SLOT_PAY = { seven: 20, three: 5, two: 1.5 };

  function arcGame(id) { for (var k = 0; k < ARC_GAMES.length; k++) if (ARC_GAMES[k].id === id) return ARC_GAMES[k]; return null; }
  // same local day number as the 날씨 장난감 (toys.js); only a later day resets it, so a clock set back can't.
  // A stored day more than 1 day ahead was counted under a wrong clock: it counts as a fresh day.
  function arcFresh(q, d) { return !q || d > q.d || q.d - d > 1; }
  function arcLeft(s, now, tzMin) {
    var q = s.arcade;
    return arcFresh(q, toyDay(now, tzMin)) ? ARC_DAY_CAP : Math.max(0, ARC_DAY_CAP - q.n);
  }
  // → { ok, play } or { ok: false, why }. bet 0 = 그냥 놀기, only once today's prize plays are used up.
  // play = { game, diff, bet, mul } is handed back to arcPay when the round ends.
  function arcStart(s, game, diff, bet, now, tzMin) {
    if (!villageOk(s)) return { ok: false, why: 'village' };
    var g = arcGame(game);
    if (!g) return { ok: false, why: 'game' };
    if (!g.luck && !ARC_MUL.hasOwnProperty(diff)) return { ok: false, why: 'diff' };
    var left = arcLeft(s, now, tzMin);
    if (bet === 0) return left > 0 ? { ok: false, why: 'bet' } : { ok: true, play: { game: game, diff: g.luck ? null : diff, bet: 0, mul: 0 } };
    if (ARC_BETS.indexOf(bet) < 0) return { ok: false, why: 'bet' };
    if (left <= 0) return { ok: false, why: 'cap' };
    if (s.coins < bet) return { ok: false, why: 'coins' };
    var d = toyDay(now, tzMin);
    if (arcFresh(s.arcade, d)) s.arcade = { d: d, n: 0 };
    s.arcade.n++;
    s.coins -= bet;
    return { ok: true, play: { game: game, diff: g.luck ? null : diff, bet: bet, mul: g.luck ? 0 : ARC_MUL[diff] } };
  }
  // win: true/false for a skill game, the slotMul number for 슬롯. → coins paid (0 for a loss or a fun play; once per play)
  function arcPay(s, play, win) {
    if (!play || !play.bet || play.paid) return 0;
    play.paid = true;
    var mul = typeof win === 'number' ? win : win ? play.mul : 0;
    var c = Math.round(play.bet * mul);
    s.coins += c;
    return c;
  }

  // ---------- 두더지 잡기 ----------
  function moleLayout(diff, rng) {
    var c = ARC_MOLE[diff], pops = [], t = 500;
    while (t + c.up <= ARC_MOLE_TIME) {
      var free = [];
      for (var h = 0; h < ARC_MOLE_HOLES; h++) if (!pops.some(function (p) { return p.hole === h && p.t + c.up > t; })) free.push(h);
      pops.push({ t: Math.round(t), hole: free[Math.floor(rng() * free.length)], hog: rng() < c.hog });
      t += c.gap * (0.7 + rng() * 0.6);
    }
    return { up: c.up, need: c.need, pops: pops, hit: {}, score: 0 };
  }
  // the pops up at ms t that nobody has hit yet (index into g.pops)
  function moleUp(g, t) {
    var out = [];
    g.pops.forEach(function (p, k) { if (!g.hit[k] && t >= p.t && t < p.t + g.up) out.push(k); });
    return out;
  }
  // a tap on `hole` at ms t → 'mole' | 'hog' | null (nothing up there)
  function moleTap(g, t, hole) {
    var up = moleUp(g, t);
    for (var j = 0; j < up.length; j++) {
      var p = g.pops[up[j]];
      if (p.hole !== hole) continue;
      g.hit[up[j]] = true;
      if (p.hog) { g.score = Math.max(0, g.score - ARC_HOG_COST); return 'hog'; }
      g.score++;
      return 'mole';
    }
    return null;
  }
  function moleOver(g, t) { return t >= ARC_MOLE_TIME; }

  // ---------- 짝 맞추기 ----------
  function matchDeal(diff, rng) {
    var c = ARC_MATCH[diff], cards = [];
    ARC_CARDS.slice(0, c.pairs).forEach(function (id) { cards.push(id, id); });
    for (var k = cards.length - 1; k > 0; k--) { var j = Math.floor(rng() * (k + 1)), x = cards[k]; cards[k] = cards[j]; cards[j] = x; }
    return { cards: cards, open: [], gone: {}, tries: c.tries, used: 0 };
  }
  function matchLeft(g) { return g.cards.length / 2 - Object.keys(g.gone).length / 2; }
  function matchWon(g) { return matchLeft(g) === 0; }
  function matchOver(g) { return matchWon(g) || g.used >= g.tries; }
  // turn card k → 'first' | 'pair' | 'miss' | null (not now). After 'miss' both stay open until matchHide.
  function matchFlip(g, k) {
    if (k < 0 || k >= g.cards.length || g.gone[k] || g.open.length >= 2 || g.open.indexOf(k) >= 0 || matchOver(g)) return null;
    g.open.push(k);
    if (g.open.length === 1) return 'first';
    g.used++;
    var a = g.open[0];
    if (g.cards[a] === g.cards[k]) { g.gone[a] = g.gone[k] = true; g.open = []; return 'pair'; }
    return 'miss';
  }
  function matchHide(g) { g.open = []; }

  // ---------- 공 던지기 ----------
  function throwSetup(diff, rng) {
    var c = ARC_THROW[diff], balls = [];
    for (var k = 0; k < ARC_BALLS; k++) balls.push({ period: Math.round(c.period[0] + rng() * (c.period[1] - c.period[0])), phase: rng() });
    return { w: c.w, flight: c.flight, need: c.need, balls: balls, shots: [] };
  }
  // target centre x, u ms after ball i came up
  function throwX(g, i, u) {
    var b = g.balls[Math.min(i, g.balls.length - 1)], f = ((u / b.period + b.phase) % 1 + 1) % 1;
    return ARC_LANE[0] + (ARC_LANE[1] - ARC_LANE[0]) * (f < 0.5 ? f * 2 : 2 - f * 2);
  }
  // throw the next ball u ms after it came up → hit? (null when all balls are gone)
  function throwShot(g, u) {
    var i = g.shots.length;
    if (i >= g.balls.length) return null;
    var x = throwX(g, i, u + g.flight), hit = Math.abs(x - ARC_AIM) <= g.w / 2 + ARC_BALL_R;
    g.shots.push({ u: u, x: x, hit: hit });
    return hit;
  }
  function throwHits(g) { return g.shots.filter(function (s) { return s.hit; }).length; }

  // ---------- 슬롯머신 ----------
  function slotSpin(rng) {
    var tot = ARC_SLOT.reduce(function (a, x) { return a + x.w; }, 0), out = [];
    for (var r = 0; r < 3; r++) {
      var v = rng() * tot, k = 0;
      while (k < ARC_SLOT.length - 1 && v >= ARC_SLOT[k].w) { v -= ARC_SLOT[k].w; k++; }
      out.push(ARC_SLOT[k].id);
    }
    return out;
  }
  function slotMul(r) {
    if (r[0] === r[1] && r[1] === r[2]) return r[0] === 'seven' ? ARC_SLOT_PAY.seven : ARC_SLOT_PAY.three;
    return r[0] === r[1] || r[1] === r[2] || r[0] === r[2] ? ARC_SLOT_PAY.two : 0;
  }

  function decodeArcade(o, s) {
    var q = o.arcade;
    if (!q || typeof q !== 'object' || typeof q.d !== 'number' || !isFinite(q.d) || typeof q.n !== 'number' || !isFinite(q.n) || q.n < 0) return;
    s.arcade = { d: Math.floor(q.d), n: Math.min(ARC_DAY_CAP, Math.floor(q.n)) };
  }

  expose({
    ARC_BETS: ARC_BETS, ARC_DAY_CAP: ARC_DAY_CAP, ARC_DIFFS: ARC_DIFFS, ARC_DIFF_NAME: ARC_DIFF_NAME, ARC_MUL: ARC_MUL, ARC_GAMES: ARC_GAMES,
    ARC_MOLE_TIME: ARC_MOLE_TIME, ARC_MOLE_HOLES: ARC_MOLE_HOLES, ARC_HOG_COST: ARC_HOG_COST, ARC_MOLE: ARC_MOLE,
    ARC_MATCH: ARC_MATCH, ARC_CARDS: ARC_CARDS, ARC_BALLS: ARC_BALLS, ARC_LANE: ARC_LANE, ARC_AIM: ARC_AIM, ARC_BALL_R: ARC_BALL_R,
    ARC_THROW: ARC_THROW, ARC_SLOT: ARC_SLOT, ARC_SLOT_PAY: ARC_SLOT_PAY,
    arcGame: arcGame, arcLeft: arcLeft, arcStart: arcStart, arcPay: arcPay,
    moleLayout: moleLayout, moleUp: moleUp, moleTap: moleTap, moleOver: moleOver,
    matchDeal: matchDeal, matchLeft: matchLeft, matchWon: matchWon, matchOver: matchOver, matchFlip: matchFlip, matchHide: matchHide,
    throwSetup: throwSetup, throwX: throwX, throwShot: throwShot, throwHits: throwHits,
    slotSpin: slotSpin, slotMul: slotMul, decodeArcade: decodeArcade
  });
