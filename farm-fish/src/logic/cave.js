  // ---------- 동굴 (stage 7): rock wall cells broken with the 곡괭이, energy that refills by real time, ores, gems, fossils ----------
  // s.cave is made when the pickaxe is bought. wall[k]: 0 = broken, 1 = plain rock, 2 = a glinting cell (gems and fossils
  // come out more). What a cell holds is rolled when it breaks, under the clock of that moment (env), so night gems are real.
  // Energy: e points at time t, +1 every CAVE_EVERY (offline too), capped at CAVE_EMAX. Breaking a cell costs one.
  var CAVE_REP = 45, PICK_COST = 15000, CAVE_EMAX = 20, CAVE_EVERY = 360e3, CAVE_COLS = 6, CAVE_ROWS = 4;
  var GLINT_P = 0.15, FOSSIL_P = [0.06, 0.16];   // fossil part chance: plain cell, glinting cell
  var ORE_W = { '흔함': 30, '드묾': 10, '희귀': 2.5, '전설': 0.5 };
  var ORES = [
    { id: 'rock',       name: '돌',         kind: 'ore', rarity: '흔함', price: 4,    w: 1.4, hint: '어디를 깨도 나오는 돌덩이' },
    { id: 'coal',       name: '석탄',       kind: 'ore', rarity: '흔함', price: 12,   hint: '까만 줄무늬 바위 속에' },
    { id: 'copper',     name: '구리 광석',  kind: 'ore', rarity: '흔함', price: 25,   hint: '푸르스름한 녹이 슨 돌' },
    { id: 'iron',       name: '철광석',     kind: 'ore', rarity: '드묾', price: 45,   hint: '묵직하고 붉은 기가 도는 돌' },
    { id: 'silver',     name: '은광석',     kind: 'ore', rarity: '드묾', price: 110,  hint: '깨진 면이 하얗게 번쩍인다' },
    { id: 'goldore',    name: '금광석',     kind: 'ore', rarity: '희귀', price: 280,  hint: '노란 알갱이가 박힌 돌 · 깊은 곳에' },
    { id: 'quartz',     name: '석영',       kind: 'gem', rarity: '드묾', price: 70,   hint: '맑은 육각 기둥 · 반짝이는 칸에서 잘 나온다' },
    { id: 'amethyst',   name: '자수정',     kind: 'gem', rarity: '드묾', price: 140,  hint: '돌 속에 숨은 작은 보랏빛 동굴' },
    { id: 'icecrystal', name: '얼음 수정',  kind: 'gem', rarity: '드묾', price: 180,  season: ['winter'], hint: '겨울 동굴 · 차가운 벽에서만' },
    { id: 'garnet',     name: '석류석',     kind: 'gem', rarity: '희귀', price: 220,  hint: '석류알처럼 동글동글한 보석' },
    { id: 'jade',       name: '옥',         kind: 'gem', rarity: '희귀', price: 260,  hint: '매끈하고 서늘한 초록 돌' },
    { id: 'aquamarine', name: '아쿠아마린', kind: 'gem', rarity: '희귀', price: 320,  hint: '바닷물 빛을 닮은 보석' },
    { id: 'sunstone',   name: '일장석',     kind: 'gem', rarity: '희귀', price: 340,  season: ['summer'], phase: ['morning', 'day'], hint: '여름 낮 · 햇살이 드는 틈에서' },
    { id: 'moonstone',  name: '월장석',     kind: 'gem', rarity: '희귀', price: 360,  phase: ['night'], hint: '밤에만 은은히 빛나는 돌' },
    { id: 'ruby',       name: '루비',       kind: 'gem', rarity: '전설', price: 900,  hint: '아주 깊은 곳의 붉은 불씨' },
    { id: 'diamond',    name: '다이아몬드', kind: 'gem', rarity: '전설', price: 1500, hint: '가장 단단한 돌 · 정말 드물게' }
  ];
  var ORE_BY = {};
  ORES.forEach(function (o) { ORE_BY[o.id] = o; });
  // a fossil is parts pieces; w = how often it is the one a fossil roll picks; price = what a doubled part sells for
  var FOSSILS = [
    { id: 'ammonite',   name: '암모나이트',   parts: 3, w: 3,   price: 120, hint: '돌돌 말린 소용돌이 껍데기' },
    { id: 'trilobite',  name: '삼엽충',       parts: 3, w: 3,   price: 120, hint: '세 갈래로 나뉜 오래된 벌레' },
    { id: 'leaffossil', name: '나뭇잎 화석',  parts: 3, w: 3,   price: 100, hint: '돌에 찍힌 아주 옛날 잎맥' },
    { id: 'fishfossil', name: '물고기 화석',  parts: 4, w: 2,   price: 160, hint: '돌 속을 헤엄치는 뼈 물고기' },
    { id: 'dinoegg',    name: '공룡 알',      parts: 3, w: 1.5, price: 250, hint: '둥글고 커다란 돌… 알일까?' },
    { id: 'mammoth',    name: '매머드 엄니',  parts: 4, w: 1.5, price: 220, hint: '휘어진 커다란 이빨 조각' },
    { id: 'dinoskull',  name: '공룡 머리뼈',  parts: 5, w: 1.5, price: 300, hint: '이빨 달린 커다란 머리 · 조각이 많다' },
    { id: 'pterosaur',  name: '익룡 날개',    parts: 5, w: 1.5, price: 320, hint: '하늘을 날던 긴 날개뼈' }
  ];
  var FOSSIL_BY = {};
  FOSSILS.forEach(function (f) { FOSSIL_BY[f.id] = f; });
  var FOSSIL_BIT = { id: 'fossilbit', name: '화석 조각', price: 150 };
  // ores into decorations (merchant:true keeps them out of the 마당 shop list)
  var CAVE_CRAFT = [
    { id: 'orelamp', name: '광산 등불',   need: { iron: 2, coal: 3 } },
    { id: 'geode',   name: '자수정 정원', need: { amethyst: 2, quartz: 2 } }
  ];
  [
    { id: 'orelamp', name: '광산 등불',   cost: 0, merchant: true, from: 'cave', sz: [10, 20] },
    { id: 'geode',   name: '자수정 정원', cost: 0, merchant: true, from: 'cave', sz: [16, 12] }
  ].forEach(function (d) { DECOS.push(d); });
  // the teacher collects stones, the kid shiny ones: ore orders get a resident
  RESIDENTS.forEach(function (r) { if (r.id === 'teacher' || r.id === 'kid') r.kinds.push('ore', 'gem'); });

  function oreById(id) { return ORE_BY.hasOwnProperty(id) ? ORE_BY[id] : null; }
  function fossilById(id) { return FOSSIL_BY.hasOwnProperty(id) ? FOSSIL_BY[id] : null; }
  // basket item info for cave things (logic/basket.js itemInfo asks here)
  function caveItem(id) {
    var o = oreById(id);
    if (o) return { id: id, kind: o.kind, name: o.name, price: o.price };
    if (id === FOSSIL_BIT.id) return { id: id, kind: 'fossil', name: FOSSIL_BIT.name, price: FOSSIL_BIT.price };
    return null;
  }
  function oreConditional(o) { return !!(o.season || o.phase); }
  // 0 = not here now (env null = only the always-there ones). glint = a glinting cell: gems ×4, plain rock less.
  // An unfound conditional gem gets the 첫 만남 보정 (FIRST_MUL), as fish and forest finds do.
  function oreWeight(o, env, s, glint) {
    if (oreConditional(o) && !env) return 0;
    if (o.season && o.season.indexOf(env.season) < 0) return 0;
    if (o.phase && o.phase.indexOf(env.phase) < 0) return 0;
    var w = ORE_W[o.rarity] * (o.w || 1);
    if (glint) w *= o.kind === 'gem' ? 4 : o.rarity === '흔함' ? 0.4 : 1;
    if (s && s.cave && oreConditional(o) && !s.cave.dex[o.id]) w *= FIRST_MUL;
    if (o.kind === 'gem' && dayIs(s, 'gem')) w *= DAY_RARE_MUL;   // stage 8: 반짝이는 동굴의 날
    return w;
  }
  function orePool(env, s, glint) {
    var out = [];
    ORES.forEach(function (o) { var w = oreWeight(o, env, s, glint); if (w > 0) out.push({ id: o.id, w: w }); });
    return out;
  }

  // ---------- pickaxe, energy ----------
  function caveOk(s) { return !!(s.cave && s.cave.own); }
  function caveStatus(s) { return caveOk(s) ? 'owned' : s.rep < CAVE_REP ? 'rep' : s.coins < PICK_COST ? 'coins' : 'ok'; }
  function newWall(rng) {
    var w = [];
    for (var k = 0; k < CAVE_COLS * CAVE_ROWS; k++) w.push(rng() < GLINT_P ? 2 : 1);
    return w;
  }
  function buyPick(s, now, rng) {
    var st = caveStatus(s);
    if (st !== 'ok') return { ok: false, why: st };
    s.coins -= PICK_COST;
    s.cave = { own: true, e: CAVE_EMAX, t: now, wall: newWall(rng), parts: {}, done: {}, dex: {}, lv: 0, n: 0 };
    return { ok: true };
  }
  function caveEnergy(s, now) {
    var c = s.cave;
    if (!c || c.e >= CAVE_EMAX) return { n: CAVE_EMAX, max: CAVE_EMAX, next: null };
    var k = Math.max(0, Math.floor((now - c.t) / CAVE_EVERY)), n = Math.min(CAVE_EMAX, c.e + k);
    return { n: n, max: CAVE_EMAX, next: n >= CAVE_EMAX ? null : c.t + (k + 1) * CAVE_EVERY };
  }
  // fold the refilled points into e/t (a full bar restarts its clock when it is first spent)
  function settleEnergy(c, now) {
    if (c.e >= CAVE_EMAX) { c.e = CAVE_EMAX; c.t = now; return; }
    var k = Math.max(0, Math.floor((now - c.t) / CAVE_EVERY));
    if (c.e + k >= CAVE_EMAX) { c.e = CAVE_EMAX; c.t = now; }
    else { c.e += k; c.t += k * CAVE_EVERY; }
  }

  // ---------- breaking cells ----------
  function cellNear(c, k) {
    var col = k % CAVE_COLS, row = Math.floor(k / CAVE_COLS), out = [];
    if (col < CAVE_COLS - 1) out.push(k + 1);
    if (col > 0) out.push(k - 1);
    if (row < CAVE_ROWS - 1) out.push(k + CAVE_COLS);
    if (row > 0) out.push(k - CAVE_COLS);
    for (var j = 0; j < out.length; j++) if (c.wall[out[j]]) return out[j];
    return -1;
  }
  // what one cell gives; the cell is already marked broken
  function breakCell(s, glint, rng, env) {
    var c = s.cave;
    c.n = Math.min(1e9, c.n + 1);
    if (rng() < FOSSIL_P[glint ? 1 : 0]) {
      var f = fossilById(pick(FOSSILS.map(function (x) { return { id: x.id, w: x.w }; }), rng).id);
      var part = Math.min(f.parts - 1, Math.floor(rng() * f.parts));
      var got = c.parts[f.id] || (c.parts[f.id] = []);
      while (got.length < f.parts) got.push(false);
      if (c.done[f.id] || got[part]) {
        return { id: f.id, kind: 'part', fossil: f.id, part: part, dup: true, sold: bagAdd(s, FOSSIL_BIT.id, f.price) };
      }
      got[part] = true;
      var out = { id: f.id, kind: 'part', fossil: f.id, part: part, have: got.filter(Boolean).length, sold: 0 };
      if (out.have >= f.parts) {
        c.done[f.id] = true;
        out.done = true; out.reward = f.price * f.parts * 2;
        s.coins += out.reward;
      }
      return out;
    }
    var o = oreById(pick(orePool(env, s, glint), rng).id);
    c.dex[o.id] = Math.min(1e6, (c.dex[o.id] || 0) + 1);
    return { id: o.id, kind: o.kind, sold: bagAdd(s, o.id, o.price) };
  }
  // break cell k (one energy). won = the optional 도전 succeeded: the cell beside it breaks too, for free.
  // env = { season, phase } of now (the UI passes it; without it no night/season gem comes out).
  // null: no pickaxe, no such cell, already broken, or no energy left. A cleared wall is replaced by a new one.
  function mineCell(s, k, now, rng, won, env) {
    var c = s.cave;
    if (!caveOk(s) || !(k >= 0 && k < c.wall.length) || !c.wall[k]) return null;
    settleEnergy(c, now);
    if (c.e < 1) return null;
    if (c.e >= CAVE_EMAX) c.t = now;
    c.e--;
    var glint = c.wall[k] === 2;
    c.wall[k] = 0;
    var r = breakCell(s, glint, rng, env);
    if (won) {
      var j = cellNear(c, k);
      if (j >= 0) { var g2 = c.wall[j] === 2; c.wall[j] = 0; r.more = breakCell(s, g2, rng, env); r.more.k = j; }
    }
    if (c.wall.every(function (x) { return !x; })) { c.wall = newWall(rng); c.lv = Math.min(1e6, c.lv + 1); r.fresh = true; }
    return r;
  }
  // the 도전: hold on a cell, let go in the crack (logic/challenge.js gauge)
  function caveGame(press, rng) { return chNew(press, 0.18, 1500, rng); }

  function fossilCount(s) { return s.cave ? Object.keys(s.cave.done).length : 0; }
  function caveDexCount(s) { return s.cave ? Object.keys(s.cave.dex).length : 0; }
  // common ores already found can be asked for on the order board
  function caveOrders(s, out) {
    if (!caveOk(s)) return;
    ['coal', 'copper', 'iron'].forEach(function (id) { if (s.cave.dex[id]) out.push({ id: id, w: 1 }); });
  }
  function craftById(id) { for (var k = 0; k < CAVE_CRAFT.length; k++) if (CAVE_CRAFT[k].id === id) return CAVE_CRAFT[k]; return null; }
  function canCraft(s, id) {
    var c = craftById(id);
    if (!c) return 'none';
    if (s.yard && s.yard.deco[id]) return 'owned';
    return Object.keys(c.need).every(function (x) { return bagCount(s, x) >= c.need[x]; }) ? 'ok' : 'need';
  }
  function craftDeco(s, id) {
    var why = canCraft(s, id);
    if (why !== 'ok') return { ok: false, why: why };
    var c = craftById(id);
    Object.keys(c.need).forEach(function (x) { bagTake(s, x, c.need[x]); });
    return { ok: true, stored: grantDeco(s, id).stored };
  }

  // ---------- save ----------
  function decodeCave(o, s) {
    var q = o.cave;
    if (!q || typeof q !== 'object' || Array.isArray(q)) return;
    var num = function (x) { return typeof x === 'number' && isFinite(x); };
    var n = CAVE_COLS * CAVE_ROWS, c = { own: q.own === true, e: CAVE_EMAX, t: 0, wall: [], parts: {}, done: {}, dex: {}, lv: 0, n: 0 };
    if (num(q.e)) c.e = Math.max(0, Math.min(CAVE_EMAX, Math.floor(q.e)));
    if (num(q.t)) c.t = q.t;
    for (var k = 0; k < n; k++) { var w = Array.isArray(q.wall) ? q.wall[k] : 1; c.wall.push(w === 0 || w === 2 ? w : 1); }
    if (c.wall.every(function (x) { return !x; })) c.wall = c.wall.map(function () { return 1; });
    FOSSILS.forEach(function (f) {
      var p = q.parts && q.parts[f.id];
      if (Array.isArray(p)) { c.parts[f.id] = []; for (var j = 0; j < f.parts; j++) c.parts[f.id].push(p[j] === true); }
      if (q.done && q.done[f.id] === true) c.done[f.id] = true;
    });
    if (q.dex && typeof q.dex === 'object') ORES.forEach(function (x) { if (num(q.dex[x.id]) && q.dex[x.id] > 0) c.dex[x.id] = Math.min(1e6, Math.floor(q.dex[x.id])); });
    if (num(q.lv) && q.lv > 0) c.lv = Math.min(1e6, Math.floor(q.lv));
    if (num(q.n) && q.n > 0) c.n = Math.min(1e9, Math.floor(q.n));
    s.cave = c;
  }

  expose({
    CAVE_REP: CAVE_REP, PICK_COST: PICK_COST, CAVE_EMAX: CAVE_EMAX, CAVE_EVERY: CAVE_EVERY, CAVE_COLS: CAVE_COLS, CAVE_ROWS: CAVE_ROWS,
    ORES: ORES, FOSSILS: FOSSILS, CAVE_CRAFT: CAVE_CRAFT, oreById: oreById, fossilById: fossilById, caveItem: caveItem,
    oreConditional: oreConditional, oreWeight: oreWeight, orePool: orePool, caveOk: caveOk, caveStatus: caveStatus, buyPick: buyPick,
    caveEnergy: caveEnergy, mineCell: mineCell, caveGame: caveGame, fossilCount: fossilCount, caveDexCount: caveDexCount,
    caveOrders: caveOrders, canCraft: canCraft, craftDeco: craftDeco, decodeCave: decodeCave
  });
