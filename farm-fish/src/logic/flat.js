  // ---------- 갯벌 (stage 7): tides on the game clock, dig spots at low tide, flat finds and dishes (s.flat, made on first look) ----------
  // Two low tides per game day (1 real hour), TIDE_LEN each (about half the time), TIDE_GAP apart. They start a little later
  // each game day (the offset cycles through 15 minutes), so over a few days a low tide falls in every time of day, night too.
  // High tide has its own job: 통발 (traps) set then fill over real time and are hauled at the next low tide.
  // Spots exist only at low tide. What sits in a spot is rolled when it is first looked at (seeded by tide and spot,
  // under that moment's season/time/weather) and stays until dug or until the tide comes in (spot.until).
  var TIDE_LEN = 900e3, TIDE_GAP = 1800e3, TIDE_STEP = 7, TIDE_CYCLE = 15;
  var FLAT_W = { '흔함': 30, '드묾': 12, '희귀': 3, '전설': 0.6 };
  var FLAT = [
    { id: 'clam',       name: '바지락',   rarity: '흔함', price: 30,  hint: '갯벌 어디서나 · 숨구멍 두 개' },
    { id: 'lugworm',    name: '갯지렁이', rarity: '흔함', price: 12,  hint: '구불구불 모래 똥 아래' },
    { id: 'whelk',      name: '갯고둥',   rarity: '흔함', price: 18,  hint: '물웅덩이 바위틈에 다닥다닥' },
    { id: 'starfish',   name: '불가사리', rarity: '흔함', price: 15,  hint: '물이 빠진 자리에 별 하나' },
    { id: 'surfclam',   name: '동죽',     rarity: '흔함', price: 35,  season: ['spring', 'summer'], hint: '봄여름 · 동글동글 하얀 조개' },
    { id: 'cockle',     name: '꼬막',     rarity: '흔함', price: 40,  season: ['autumn', 'winter'], hint: '찬 바람 불 때 · 골이 진 껍데기' },
    { id: 'rockoyster', name: '굴',       rarity: '흔함', price: 45,  season: ['autumn', 'winter'], hint: '겨울 바위에 붙은 바다의 우유' },
    { id: 'mudcrab',    name: '칠게',     rarity: '흔함', price: 28,  season: ['summer', 'autumn'], hint: '여름가을 · 구멍으로 쏙' },
    { id: 'fiddler',    name: '농게',     rarity: '드묾', price: 70,  season: ['summer'], phase: ['morning', 'day'], hint: '여름 낮 · 한쪽 집게만 커다란' },
    { id: 'razor',      name: '맛조개',   rarity: '드묾', price: 90,  season: ['spring'], hint: '봄 · 구멍에 소금을 톡 뿌리면' },
    { id: 'hardclam',   name: '백합',     rarity: '드묾', price: 110, hint: '매끈한 무늬 · 조개의 여왕' },
    { id: 'turban',     name: '소라',     rarity: '드묾', price: 95,  hint: '바위 사이 뿔 달린 껍데기' },
    { id: 'nakji',      name: '낙지',     rarity: '드묾', price: 150, phase: ['evening', 'night'], hint: '해 질 녘부터 · 펄 속 숨은 다리' },
    { id: 'shorecrab',  name: '방게',     rarity: '드묾', price: 80,  phase: ['night'], hint: '밤 갯벌을 옆으로 옆으로' },
    { id: 'mudskipper', name: '짱뚱어',   rarity: '드묾', price: 85,  season: ['summer'], phase: ['day'], hint: '여름 한낮 · 펄 위를 통통 뛰는 물고기' },
    { id: 'urchin',     name: '성게',     rarity: '드묾', price: 130, season: ['summer', 'winter'], hint: '바위틈 밤송이 · 여름과 겨울에' },
    { id: 'spoonworm',  name: '개불',     rarity: '드묾', price: 120, season: ['winter'], hint: '겨울 · 펄 깊이 U자 굴' },
    { id: 'seacuke',    name: '해삼',     rarity: '희귀', price: 320, season: ['winter', 'spring'], phase: ['evening', 'night'], hint: '차가운 밤 · 바위 그늘에 오이 하나' },
    { id: 'penshell',   name: '키조개',   rarity: '희귀', price: 380, season: ['winter', 'spring'], hint: '겨울봄 · 펄에 꽂힌 커다란 부채' },
    { id: 'pearl',      name: '진주',     rarity: '희귀', price: 900, hint: '아주 가끔 · 조개 속 동그란 빛' },
    // 통발 only (never dug)
    { id: 'bluecrab',   name: '꽃게',     rarity: '드묾', price: 140, trap: true, hint: '밀물 때 놓은 통발에만 · 파란 집게' },
    { id: 'gatgaje',    name: '갯가재',   rarity: '드묾', price: 120, trap: true, hint: '밀물 때 놓은 통발에 · 사마귀 닮은 앞발' }
  ];
  var FLAT_BY = {};
  FLAT.forEach(function (f) { FLAT_BY[f.id] = f; });
  var FLAT_RECIPES = [
    { id: 'jogaetang', name: '조개탕',   need: ['clam', 'clam', 'radish'], time: 300e3, sell: 260 },
    { id: 'pajeon',    name: '해물파전', need: ['nakji', 'clam', 'egg'],   time: 420e3, sell: 520 },
    { id: 'nakjibok',  name: '낙지볶음', need: ['nakji', 'nakji', 'pepper'], time: 480e3, sell: 760 }
  ];
  FLAT_RECIPES.forEach(function (r) { RECIPES.push(r); });
  // 박 영감 and 꼬마 도윤 post 갯벌 orders
  RESIDENTS.forEach(function (r) { if (r.id === 'fisher' || r.id === 'kid') r.kinds.push('flat'); });

  var FLAT_N = 6, FLAT_REGROW = 180e3;
  // 통발: set at high tide, one catch every TRAP_EVERY (real time, offline too) up to TRAP_CAP, hauled at low tide
  var TRAP_N = 2, TRAP_EVERY = 360e3, TRAP_CAP = 3;
  var TRAP_POOL = [{ id: 'whelk', w: 30 }, { id: 'mudcrab', w: 24 }, { id: 'turban', w: 10 }, { id: 'bluecrab', w: 9 }, { id: 'gatgaje', w: 9 }];

  function flatById(id) { return FLAT_BY.hasOwnProperty(id) ? FLAT_BY[id] : null; }
  function flatOk(s) { return spotUnlocked(s, 'sea'); }
  function flatOf(s) {
    if (!s.flat) s.flat = newFlat();
    return s.flat;
  }
  function newFlat() {
    var spots = [];
    for (var k = 0; k < FLAT_N; k++) spots.push({ id: null, at: 0, until: 0 });
    return { spots: spots, dex: {}, n: 0, traps: [null, null] };
  }

  // ---------- tides ----------
  // { low, next: when it turns (ms), key: which low tide (low only) }
  function tideAt(now, tzMin) {
    var sh = (tzMin || 0) * 60e3, t = now + sh;
    var day = Math.floor(t / HOUR_MS), d0 = day * HOUR_MS;
    function off(d) { return ((((d * TIDE_STEP) % TIDE_CYCLE) + TIDE_CYCLE) % TIDE_CYCLE) * 60e3; }
    var a = d0 + off(day), b = a + TIDE_GAP;
    if (t >= a && t < a + TIDE_LEN) return { low: true, next: a + TIDE_LEN - sh, key: day * 2 };
    if (t >= b && t < b + TIDE_LEN) return { low: true, next: b + TIDE_LEN - sh, key: day * 2 + 1 };
    return { low: false, next: (t < a ? a : t < b ? b : d0 + HOUR_MS + off(day + 1)) - sh };
  }

  // ---------- finds ----------
  function flatConditional(f) { return !!(f.season || f.phase); }
  // 0 = not now. s optional: a conditional find not dug yet gets the 첫 만남 보정 (FIRST_MUL, as for fish and finds)
  function flatWeight(f, env, s) {
    if (f.trap) return 0;
    if (f.season && f.season.indexOf(env.season) < 0) return 0;
    if (f.phase && f.phase.indexOf(env.phase) < 0) return 0;
    var w = FLAT_W[f.rarity];
    if (s && s.flat && flatConditional(f) && !s.flat.dex[f.id]) w *= FIRST_MUL;
    return w;
  }
  function flatPool(env, s) {
    var out = [];
    FLAT.forEach(function (f) { var w = flatWeight(f, env, s); if (w > 0) out.push({ id: f.id, w: w }); });
    return out;
  }
  // a small seeded rng so a spot's find depends only on (tide, spot, refill time)
  function seeded(str) {
    var h = strHash(str);
    return function () { h = (h + 0x6d2b79f5) | 0; var x = Math.imul(h ^ (h >>> 15), 1 | h); x ^= x + Math.imul(x ^ (x >>> 7), 61 | x); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
  }
  // the spots that can be dug now: [{ k, id }] (empty at high tide or before the sea opens). Fills ready spots.
  // td (optional) = a tide to use instead of the clock's (FF testing)
  function flatSpots(s, now, tzMin, td) {
    if (!flatOk(s)) return [];
    td = td || tideAt(now, tzMin);
    if (!td.low) return [];
    var f = flatOf(s), out = [], env = null;
    f.spots.forEach(function (p, k) {
      if (p.id && now < p.until) { out.push({ k: k, id: p.id }); return; }
      if (!p.id && p.tide === td.key && now < p.at) return;   // dug this tide, still filling in
      if (!env) { var c = gameClock(now, tzMin); env = { season: c.season, phase: c.phase, weather: weatherAt(now, tzMin) }; }
      var id = pick(flatPool(env, s), seeded('flat:' + td.key + ':' + k + ':' + Math.floor(now / 1000))).id;
      f.spots[k] = { id: id, at: now, until: td.next, tide: td.key };
      out.push({ k: k, id: id });
    });
    return out;
  }
  // dig spot k. won = the optional 도전 succeeded: two (rare ones: a 50% chance of a second). null at high tide / empty.
  function digFlat(s, k, now, rng, won) {
    var p = s.flat && s.flat.spots[k];
    if (!p || !p.id || now >= p.until) return null;
    var f = flatById(p.id), n = 1;
    if (won) n = f.rarity === '희귀' || f.rarity === '전설' ? (rng() < 0.5 ? 2 : 1) : 2;
    var first = !s.flat.dex[f.id], sold = 0;
    for (var j = 0; j < n; j++) sold += bagAdd(s, f.id, f.price);
    s.flat.dex[f.id] = Math.min(1e6, (s.flat.dex[f.id] || 0) + n);
    s.flat.n = Math.min(1e9, s.flat.n + n);
    s.flat.spots[k] = { id: null, at: now + FLAT_REGROW, until: 0, tide: p.tide };
    return { id: f.id, n: n, sold: sold, won: !!won, first: first };
  }
  // ---------- 통발 ----------
  // { ok } | { ok: false, why: 'locked' | 'tide' (low now) | 'set' (already there) }
  function setTrap(s, k, now, tzMin, td) {
    if (!flatOk(s)) return { ok: false, why: 'locked' };
    if ((td || tideAt(now, tzMin)).low) return { ok: false, why: 'tide' };
    var f = flatOf(s);
    if (k < 0 || k >= TRAP_N) return { ok: false, why: 'set' };
    if (f.traps[k]) return { ok: false, why: 'set' };
    f.traps[k] = { at: now };
    return { ok: true };
  }
  function trapCount(p, now) { return p ? Math.max(0, Math.min(TRAP_CAP, Math.floor((now - p.at) / TRAP_EVERY))) : 0; }
  // haul trap k at low tide: { got: [ids], sold }. Empty = it stays set. null at high tide or with no trap there.
  function pullTrap(s, k, now, rng, tzMin, td) {
    var p = s.flat && s.flat.traps[k];
    if (!p || !(td || tideAt(now, tzMin)).low) return null;
    var n = trapCount(p, now), got = [], sold = 0;
    if (!n) return { got: got, sold: 0 };
    for (var j = 0; j < n; j++) {
      var pool = TRAP_POOL.map(function (e) { return { id: e.id, w: e.w * (flatById(e.id).trap && !s.flat.dex[e.id] ? FIRST_MUL : 1) }; });
      var f = flatById(pick(pool, rng).id);
      sold += bagAdd(s, f.id, f.price);
      s.flat.dex[f.id] = Math.min(1e6, (s.flat.dex[f.id] || 0) + 1);
      s.flat.n = Math.min(1e9, s.flat.n + 1);
      got.push(f.id);
    }
    s.flat.traps[k] = null;
    return { got: got, sold: sold };
  }
  function trapsReady(s, now) { var n = 0; if (s.flat) s.flat.traps.forEach(function (p) { n += trapCount(p, now); }); return n; }

  // 도전: the shared hold-and-release gauge (호미 깊이)
  function flatGame(id, press, rng) {
    var f = flatById(id), r = f ? f.rarity : '흔함';
    return chNew(press, CH_ZONE[r], CH_PERIOD[r], rng);
  }
  function flatDexCount(s) { return s.flat ? Object.keys(s.flat.dex).length : 0; }
  // common, any-season finds already dug can be asked for on the order board
  function flatOrders(s, out) {
    if (!s.flat || !flatOk(s)) return;
    FLAT.forEach(function (f) { if (f.rarity === '흔함' && !f.season && s.flat.dex[f.id]) out.push({ id: f.id, w: 1 }); });
  }

  // ---------- save: called by decode() (absent in older saves) ----------
  function decodeFlat(o, s) {
    var q = o.flat;
    if (!q || typeof q !== 'object' || Array.isArray(q)) return;
    var num = function (x) { return typeof x === 'number' && isFinite(x); };
    var f = newFlat();
    if (Array.isArray(q.spots)) for (var k = 0; k < FLAT_N; k++) {
      var p = q.spots[k];
      if (!p || typeof p !== 'object') continue;
      f.spots[k] = { id: flatById(p.id) ? p.id : null, at: num(p.at) ? p.at : 0, until: num(p.until) ? p.until : 0 };
      if (num(p.tide)) f.spots[k].tide = p.tide;
    }
    if (q.dex && typeof q.dex === 'object') FLAT.forEach(function (g) { if (num(q.dex[g.id]) && q.dex[g.id] > 0) f.dex[g.id] = Math.min(1e6, Math.floor(q.dex[g.id])); });
    if (num(q.n) && q.n > 0) f.n = Math.min(1e9, Math.floor(q.n));
    if (Array.isArray(q.traps)) for (k = 0; k < TRAP_N; k++) { var tp = q.traps[k]; if (tp && typeof tp === 'object' && num(tp.at)) f.traps[k] = { at: tp.at }; }
    s.flat = f;
  }

  expose({
    FLAT: FLAT, FLAT_W: FLAT_W, FLAT_RECIPES: FLAT_RECIPES, FLAT_N: FLAT_N, FLAT_REGROW: FLAT_REGROW, TIDE_LEN: TIDE_LEN, TRAP_N: TRAP_N, TRAP_EVERY: TRAP_EVERY, TRAP_CAP: TRAP_CAP, TRAP_POOL: TRAP_POOL, FIRST_MUL: FIRST_MUL,
    flatById: flatById, flatOk: flatOk, tideAt: tideAt, flatConditional: flatConditional, flatWeight: flatWeight, flatPool: flatPool,
    flatSpots: flatSpots, digFlat: digFlat, flatGame: flatGame, setTrap: setTrap, trapCount: trapCount, pullTrap: pullTrap, trapsReady: trapsReady, flatDexCount: flatDexCount, flatOrders: flatOrders, decodeFlat: decodeFlat
  });
