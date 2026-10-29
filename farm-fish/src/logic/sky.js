  // ---------- 별 관측 (stage 7): the 망원경 in the 마당, constellations to join at game night, 유성우 nights ----------
  // s.sky = { own, seen: { id: first time }, wish: hour key of the last 유성우 wish, n: constellations joined }.
  // A constellation is points on a 0..100 chart and a path: tap the stars in that order (null = lift the pen).
  var SCOPE_COST = 5000, STAR_FIRST = 300, STAR_AGAIN = 40, STAR_DECOYS = 6, STAR_SEP = 14;
  var METEOR_P = 0.125;   // share of game days whose night is a 유성우 night (about three a real day)
  var STARS = [
    { id: 'bigdipper',  name: '북두칠성',     season: 'spring', pts: [[10, 30], [25, 25], [38, 32], [50, 38], [55, 55], [75, 58], [78, 40]], path: [0, 1, 2, 3, 4, 5, 6, 3], hint: '봄 · 국자 모양 일곱 별' },
    { id: 'leo',        name: '사자자리',     season: 'spring', pts: [[25, 20], [18, 32], [24, 45], [38, 50], [70, 42], [85, 58], [62, 62]], path: [0, 1, 2, 3, 4, 5, 6, 3], hint: '봄 · 물음표를 뒤집은 갈기' },
    { id: 'bootes',     name: '목동자리',     season: 'spring', pts: [[50, 10], [38, 30], [62, 30], [40, 58], [58, 58], [50, 85]], path: [0, 1, 3, 5, 4, 2, 0], hint: '봄 · 하늘에 뜬 연 모양' },
    { id: 'virgo',      name: '처녀자리',     season: 'spring', pts: [[15, 30], [35, 35], [50, 50], [70, 45], [85, 60], [50, 75]], path: [0, 1, 2, 5, null, 2, 3, 4], hint: '봄 · 이삭을 든 긴 Y자' },
    { id: 'cygnus',     name: '백조자리',     season: 'summer', pts: [[50, 10], [50, 35], [50, 60], [50, 88], [20, 40], [80, 30]], path: [0, 1, 2, 3, null, 4, 1, 5], hint: '여름 · 은하수 위의 커다란 십자' },
    { id: 'lyra',       name: '거문고자리',   season: 'summer', pts: [[30, 15], [45, 35], [35, 55], [60, 62], [70, 42]], path: [0, 1, 2, 3, 4, 1], hint: '여름 · 직녀별과 작은 평행사변형' },
    { id: 'aquila',     name: '독수리자리',   season: 'summer', pts: [[12, 28], [36, 38], [50, 48], [64, 58], [88, 68], [46, 18], [54, 80]], path: [0, 1, 2, 3, 4, null, 5, 2, 6], hint: '여름 · 견우별이 날개를 편다' },
    { id: 'scorpius',   name: '전갈자리',     season: 'summer', pts: [[15, 15], [28, 25], [34, 42], [40, 60], [52, 78], [72, 82], [82, 68]], path: [0, 1, 2, 3, 4, 5, 6], hint: '여름 · 낮게 휘어진 꼬리' },
    { id: 'cassiopeia', name: '카시오페이아', season: 'autumn', pts: [[10, 30], [28, 60], [48, 40], [68, 65], [88, 35]], path: [0, 1, 2, 3, 4], hint: '가을 · 하늘의 W' },
    { id: 'pegasus',    name: '페가수스',     season: 'autumn', pts: [[20, 30], [70, 30], [70, 75], [20, 75], [90, 15]], path: [4, 1, 0, 3, 2, 1], hint: '가을 · 커다란 네모' },
    { id: 'andromeda',  name: '안드로메다',   season: 'autumn', pts: [[10, 72], [32, 60], [55, 48], [80, 35], [50, 25], [62, 72]], path: [0, 1, 2, 3, null, 4, 2, 5], hint: '가을 · 네모 옆으로 뻗은 두 줄' },
    { id: 'pisces',     name: '물고기자리',   season: 'autumn', pts: [[10, 20], [25, 40], [45, 62], [60, 80], [75, 60], [90, 45], [80, 32]], path: [0, 1, 2, 3, 4, 5, 6], hint: '가을 · 끈으로 이은 두 물고기' },
    { id: 'orion',      name: '오리온자리',   season: 'winter', pts: [[25, 15], [72, 18], [36, 49], [50, 53], [64, 57], [22, 85], [75, 82]], path: [0, 2, 3, 4, 1, null, 2, 5, null, 4, 6], hint: '겨울 · 세 별 허리띠의 사냥꾼' },
    { id: 'gemini',     name: '쌍둥이자리',   season: 'winter', pts: [[25, 15], [55, 10], [28, 45], [58, 42], [30, 80], [62, 78]], path: [0, 2, 4, null, 1, 3, 5, null, 0, 1], hint: '겨울 · 나란히 선 두 줄' },
    { id: 'taurus',     name: '황소자리',     season: 'winter', pts: [[50, 62], [40, 48], [30, 36], [10, 20], [60, 48], [70, 36], [90, 22]], path: [3, 2, 1, 0, 4, 5, 6], hint: '겨울 · V자 얼굴과 긴 뿔' },
    { id: 'canismajor', name: '큰개자리',     season: 'winter', pts: [[40, 15], [45, 35], [30, 50], [55, 55], [70, 85], [25, 82]], path: [0, 1, 2, 5, null, 1, 3, 4], hint: '겨울 · 가장 밝은 별을 문 개' },
    { id: 'ursaminor',  name: '작은곰자리',   pts: [[80, 15], [65, 25], [52, 38], [40, 52], [25, 48], [22, 68], [40, 72]], path: [0, 1, 2, 3, 4, 5, 6, 3], hint: '언제나 · 북극성에 매달린 작은 국자' }
  ];
  var STAR_BY = {};
  STARS.forEach(function (c) { STAR_BY[c.id] = c; });
  // 유성우 wishes: a rare seed, one of these decorations (never twice), or coins
  var WISH_DECOS = ['meteorite', 'skyglobe'];
  [
    { id: 'meteorite', name: '별똥별 돌', cost: 0, merchant: true, from: 'sky', sz: [14, 10] },
    { id: 'skyglobe',  name: '천구의',    cost: 0, merchant: true, from: 'sky', sz: [12, 20] }
  ].forEach(function (d) { DECOS.push(d); });

  function starById(id) { return STAR_BY.hasOwnProperty(id) ? STAR_BY[id] : null; }
  function skyOk(s) { return !!(s.sky && s.sky.own); }
  function skyOf(s) { if (!s.sky) s.sky = { own: false, seen: {}, wish: null, n: 0 }; return s.sky; }
  function buyScope(s) {
    if (skyOk(s)) return { ok: false, why: 'owned' };
    if (s.coins < SCOPE_COST) return { ok: false, why: 'coins' };
    s.coins -= SCOPE_COST; skyOf(s).own = true;
    return { ok: true };
  }
  // the telescope works at game night; phase = the UI's override (FF.phase), else the shared clock
  function skyOpen(s, now, tzMin, phase) { return skyOk(s) && (phase || gameClock(now, tzMin).phase) === 'night'; }
  // tonight's constellation: one of this season's (or the all-year one), unseen ones first
  // peak = seen from the 산꼭대기 (stage 9): the summit-only ones join, unseen ones still first
  function starFor(s, season, rng, peak) {
    var list = STARS.filter(function (c) { return (!c.season || c.season === season) && (!c.peak || peak); });
    var fresh = list.filter(function (c) { return !(s.sky && s.sky.seen[c.id]); });
    if (peak && fresh.some(function (c) { return c.peak; })) fresh = fresh.filter(function (c) { return c.peak; });   // the summit's own first
    var from = fresh.length ? fresh : list;
    return from[Math.min(from.length - 1, Math.floor(rng() * from.length))].id;
  }

  // ---------- the puzzle: real stars + decoys, shuffled; taps = the star indexes in order, join[j] = line from tap j-1 ----------
  function starGame(id, rng) {
    var c = starById(id), stars = c.pts.map(function (p) { return { x: p[0], y: p[1], real: true }; });
    for (var tries = 0, n = 0; n < STAR_DECOYS && tries < 400; tries++) {
      var x = 6 + Math.round(rng() * 88), y = 6 + Math.round(rng() * 88);
      if (stars.every(function (st) { return Math.hypot(st.x - x, st.y - y) >= STAR_SEP; })) { stars.push({ x: x, y: y, real: false }); n++; }
    }
    var idx = stars.map(function (st, k) { return k; });
    for (var k = idx.length - 1; k > 0; k--) { var j = Math.floor(rng() * (k + 1)), t = idx[k]; idx[k] = idx[j]; idx[j] = t; }
    var at = [];   // old index → new
    idx.forEach(function (old, nw) { at[old] = nw; });
    var g = { id: id, stars: idx.map(function (old) { return { x: stars[old].x, y: stars[old].y }; }), taps: [], join: [], step: 0, wrong: 0, done: false };
    var lift = true;
    c.path.forEach(function (p) {
      if (p === null) { lift = true; return; }
      g.taps.push(at[p]); g.join.push(!lift); lift = false;
    });
    return g;
  }
  // 'ok' (the next star, or the one just lit again), 'wrong' (nothing lost), 'done' (the last one, or already done)
  function starTap(g, k) {
    if (g.done) return 'done';
    if (k === g.taps[g.step]) {
      g.step++; g.wrong = 0;
      if (g.step >= g.taps.length) { g.done = true; return 'done'; }
      return 'ok';
    }
    if (g.step > 0 && k === g.taps[g.step - 1]) return 'ok';
    g.wrong++;
    return 'wrong';
  }
  // the star nearest (x, y) on the 0..100 chart within r, or -1
  function starAt(g, x, y, r) {
    var best = -1, bd = r;
    g.stars.forEach(function (st, k) { var d = Math.hypot(st.x - x, st.y - y); if (d <= bd) { bd = d; best = k; } });
    return best;
  }
  // a joined constellation goes in the record; the first time pays more
  function seeStar(s, id, now) {
    if (!skyOk(s) || !starById(id)) return null;
    var sk = s.sky, first = !sk.seen[id];
    if (first) sk.seen[id] = now;
    sk.n = Math.min(1e9, (sk.n || 0) + 1);
    var coins = first ? STAR_FIRST : STAR_AGAIN;
    s.coins += coins;
    return { first: first, coins: coins };
  }
  function skyDexCount(s) { return s.sky ? Object.keys(s.sky.seen).length : 0; }

  // ---------- 유성우: the night of some game days, the same for everyone (like the weather) ----------
  function meteorDay(d) {
    var h = Math.imul(d ^ 0x2c9277b5, 0x5bd1e995); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2d); h ^= h >>> 15;
    return (h >>> 0) / 4294967296 < METEOR_P;
  }
  function meteorNight(now, tzMin) {
    var c = gameClock(now, tzMin);
    return c.phase === 'night' && meteorDay(c.day);
  }
  // the 유성우 night on now, or the next one: { start, end } in real ms
  function nextMeteor(now, tzMin) {
    var off = (tzMin || 0) * 60e3, d = gameClock(now, tzMin).day;
    for (var k = 0; k < 2000; k++, d++) {
      if (!meteorDay(d)) continue;
      // game day d's night ends where local + that day's rotation reaches the next whole hour
      for (var r = 0; r < 4; r++) {
        var end = (d + 1) * HOUR_MS - r * 15 * 60e3 - off;
        if (gameClock(end - 1, tzMin).day === d && gameMin(end - 1, tzMin) >= 59) break;
      }
      if (r < 4 && now < end) return { start: end - 15 * 60e3, end: end };
    }
    return null;
  }
  // one wish per 유성우 night (tzMin given: only while one is on). Returns the reward or null.
  // tonight's wish already made (meteor taps then fall through to the stars)
  function wishUsed(s, now) { return !!s.sky && s.sky.wish === Math.floor(now / HOUR_MS); }
  function meteorWish(s, now, rng, tzMin) {   // (visitors.js has its own wish)
    if (tzMin !== undefined && !meteorNight(now, tzMin)) return null;
    var sk = skyOf(s), key = Math.floor(now / HOUR_MS);
    if (sk.wish === key) return null;
    sk.wish = key;
    var r = rng();
    if (r < 0.3) {
      var free = WISH_DECOS.filter(function (id) { return !(s.yard && s.yard.deco[id]); });
      if (free.length) { var id = free[Math.min(free.length - 1, Math.floor(rng() * free.length))]; return { kind: 'deco', id: id, stored: grantDeco(s, id).stored }; }
    } else if (r < 0.6) {
      s.seeds.gold++; s.dex.goldSeed = true;
      return { kind: 'seed', n: 1 };
    }
    var c = Math.round((200 + rng() * 400) / 10) * 10;
    s.coins += c;
    return { kind: 'coins', coins: c };
  }

  // ---------- save ----------
  function decodeSky(o, s) {
    var q = o.sky;
    if (!q || typeof q !== 'object' || Array.isArray(q)) return;
    var num = function (x) { return typeof x === 'number' && isFinite(x); };
    var k = { own: q.own === true, seen: {}, wish: num(q.wish) ? Math.floor(q.wish) : null, n: num(q.n) && q.n > 0 ? Math.min(1e9, Math.floor(q.n)) : 0 };
    if (q.seen && typeof q.seen === 'object') STARS.forEach(function (c) { if (num(q.seen[c.id])) k.seen[c.id] = q.seen[c.id]; });
    s.sky = k;
  }
  // stage 7 lane ② save block: 동굴, 별 관측 (both optional)
  function decodeStage7B(o, s) { decodeCave(o, s); decodeSky(o, s); }

  expose({
    SCOPE_COST: SCOPE_COST, STARS: STARS, WISH_DECOS: WISH_DECOS, starById: starById, skyOk: skyOk, buyScope: buyScope, skyOpen: skyOpen,
    starFor: starFor, starGame: starGame, starTap: starTap, starAt: starAt, seeStar: seeStar, skyDexCount: skyDexCount,
    meteorNight: meteorNight, nextMeteor: nextMeteor, wish: meteorWish, meteorWish: meteorWish, wishUsed: wishUsed, decodeSky: decodeSky, decodeStage7B: decodeStage7B
  });
