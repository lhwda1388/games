  // ---------- 숲 채집: forage table, spots that regrow, forest recipes (s.forest, created when the 숲 opens) ----------
  // A spot regrows by real time (offline too). What grows on a ready spot is rolled the first time the 숲 is looked at
  // after it regrew, under the season / time of day / weather of that moment, and then stays put until it is picked.
  // env = { season, phase, weather, wet } (wet = raining now or the block right after rain: mushrooms come out).
  var FORAGE_CATS = { mush: '버섯', green: '산나물', nut: '열매', herb: '약초', flower: '꽃', misc: '잡화', rare: '희귀' };
  var FORAGE_W = { '흔함': 30, '드묾': 12, '희귀': 3, '전설': 0.6 };
  var FORAGE = [
    { id: 'oyster',      name: '느타리',     cat: 'mush',   rarity: '흔함', price: 40,  season: ['spring', 'autumn'], hint: '봄가을 · 쓰러진 나무 둥치에' },
    { id: 'shiitake',    name: '표고',       cat: 'mush',   rarity: '드묾', price: 120, season: ['spring', 'autumn'], hint: '참나무 그늘 · 비 온 뒤에 쑥쑥' },
    { id: 'coralmush',   name: '싸리버섯',   cat: 'mush',   rarity: '흔함', price: 50,  season: ['autumn'], hint: '가을 숲 바닥에 산호처럼' },
    { id: 'woodear',     name: '목이버섯',   cat: 'mush',   rarity: '흔함', price: 45,  season: ['summer'], wet: true, hint: '여름 · 비에 젖은 나무에만' },
    { id: 'chanterelle', name: '꾀꼬리버섯', cat: 'mush',   rarity: '드묾', price: 140, season: ['summer'], hint: '여름 숲 · 살구 냄새가 난다' },
    { id: 'reishi',      name: '영지',       cat: 'mush',   rarity: '희귀', price: 480, season: ['summer', 'autumn'], hint: '오래된 참나무 밑동 · 반들반들한 갓' },
    { id: 'songi',       name: '송이',       cat: 'mush',   rarity: '희귀', price: 900, season: ['autumn'], hint: '가을 소나무 숲 · 비 온 뒤에 귀하게' },
    { id: 'lionmane',    name: '노루궁뎅이', cat: 'mush',   rarity: '희귀', price: 520, season: ['autumn'], hint: '가을 · 나무 높은 곳의 하얀 털뭉치' },
    { id: 'gosari',      name: '고사리',     cat: 'green',  rarity: '흔함', price: 35,  season: ['spring'], hint: '봄 양지 비탈 · 주먹 쥔 새순' },
    { id: 'dureup',      name: '두릅',       cat: 'green',  rarity: '드묾', price: 130, season: ['spring'], hint: '봄 · 가시나무 끝의 새순' },
    { id: 'naengi',      name: '냉이',       cat: 'green',  rarity: '흔함', price: 25,  season: ['spring'], hint: '이른 봄 들판의 첫 향' },
    { id: 'dallae',      name: '달래',       cat: 'green',  rarity: '흔함', price: 30,  season: ['spring'], hint: '봄 둑길 · 작은 알뿌리' },
    { id: 'chwi',        name: '취나물',     cat: 'green',  rarity: '흔함', price: 35,  season: ['spring', 'summer'], hint: '봄여름 산그늘의 넓은 잎' },
    { id: 'wonchuri',    name: '원추리',     cat: 'green',  rarity: '드묾', price: 90,  season: ['summer'], hint: '여름 · 나리꽃 닮은 나물' },
    { id: 'raspberry',   name: '산딸기',     cat: 'nut',    rarity: '흔함', price: 40,  season: ['summer'], hint: '여름 덤불 · 가시 조심' },
    { id: 'mulberry',    name: '오디',       cat: 'nut',    rarity: '흔함', price: 35,  season: ['summer'], hint: '초여름 뽕나무 아래가 까매진다' },
    { id: 'wildgrape',   name: '머루',       cat: 'nut',    rarity: '드묾', price: 110, season: ['autumn'], hint: '가을 덩굴 · 작은 포도송이' },
    { id: 'kiwiberry',   name: '다래',       cat: 'nut',    rarity: '드묾', price: 120, season: ['autumn'], hint: '가을 덩굴의 작은 키위' },
    { id: 'acorn',       name: '도토리',     cat: 'nut',    rarity: '흔함', price: 20,  season: ['autumn'], hint: '가을 참나무 아래 · 다람쥐와 나눠요' },
    { id: 'chestnut',    name: '밤',         cat: 'nut',    rarity: '흔함', price: 45,  season: ['autumn'], hint: '가을 · 가시 송이가 벌어지면' },
    { id: 'pinenut',     name: '잣',         cat: 'nut',    rarity: '드묾', price: 150, season: ['autumn', 'winter'], hint: '높은 잣나무 · 솔방울 속에' },
    { id: 'walnut',      name: '호두',       cat: 'nut',    rarity: '드묾', price: 100, season: ['autumn'], hint: '가을 · 단단한 껍데기' },
    { id: 'plantain',    name: '질경이',     cat: 'herb',   rarity: '흔함', price: 20,  season: ['spring', 'summer', 'autumn'], hint: '길가 어디에나 · 밟혀도 산다' },
    { id: 'deodeok',     name: '더덕',       cat: 'herb',   rarity: '드묾', price: 160, season: ['spring', 'autumn'], hint: '산 향기가 진한 뿌리' },
    { id: 'doraji',      name: '도라지',     cat: 'herb',   rarity: '드묾', price: 120, season: ['summer'], hint: '여름 · 별 모양 꽃 아래 뿌리' },
    { id: 'kudzu',       name: '칡뿌리',     cat: 'herb',   rarity: '흔함', price: 40,  season: ['winter', 'spring'], hint: '겨울 · 땅속 깊이 뻗은 칡' },
    { id: 'omija',       name: '오미자',     cat: 'herb',   rarity: '드묾', price: 140, season: ['autumn'], hint: '가을 · 다섯 가지 맛이 나는 열매' },
    { id: 'azalea',      name: '진달래',     cat: 'flower', rarity: '흔함', price: 30,  season: ['spring'], hint: '봄 산등성이를 덮는 꽃' },
    { id: 'hydrangea',   name: '산수국',     cat: 'flower', rarity: '드묾', price: 100, season: ['summer'], hint: '여름 계곡 그늘' },
    { id: 'eveprimrose', name: '달맞이꽃',   cat: 'flower', rarity: '드묾', price: 90,  season: ['summer'], phase: ['evening', 'night'], hint: '여름 저녁 · 달을 보고 핀다' },
    { id: 'aster',       name: '들국화',     cat: 'flower', rarity: '흔함', price: 30,  season: ['autumn'], hint: '가을 들길의 작은 국화' },
    { id: 'camellia',    name: '동백꽃',     cat: 'flower', rarity: '드묾', price: 130, season: ['winter'], hint: '눈 속에 피는 꽃' },
    { id: 'pinecone',    name: '솔방울',     cat: 'misc',   rarity: '흔함', price: 10,  peak: 'winter', hint: '소나무 아래 · 겨울에 더 많이' },
    { id: 'pebble',      name: '조약돌',     cat: 'misc',   rarity: '흔함', price: 8,   hint: '개울가 동글동글 돌' },
    { id: 'birdfeather', name: '산새 깃털',  cat: 'misc',   rarity: '흔함', price: 25,  phase: ['morning', 'day'], hint: '아침 숲 · 산새가 떨구고 간' },
    { id: 'cicadashell', name: '매미 허물',  cat: 'misc',   rarity: '흔함', price: 15,  season: ['summer'], phase: ['morning', 'day'], hint: '여름 낮 · 나무껍질의 빈 껍질' },
    { id: 'mapleleaf',   name: '단풍잎',     cat: 'misc',   rarity: '흔함', price: 12,  season: ['autumn'], hint: '가을 · 가장 고운 잎 하나' },
    { id: 'mistletoe',   name: '겨우살이',   cat: 'misc',   rarity: '드묾', price: 110, season: ['winter'], hint: '겨울 · 높은 가지의 둥근 덩이' },
    { id: 'icicle',      name: '고드름',     cat: 'misc',   rarity: '흔함', price: 10,  season: ['winter'], phase: ['morning'], hint: '겨울 아침 · 바위 끝에 매달린' },
    { id: 'glowmoss',    name: '반딧불 이끼', cat: 'misc',  rarity: '드묾', price: 200, season: ['spring', 'summer', 'autumn'], phase: ['night'], hint: '밤에만 은은히 빛나는 이끼' },
    { id: 'ginseng',     name: '산삼',       cat: 'rare',   rarity: '전설', price: 2500, season: ['spring', 'summer', 'autumn'], hint: '깊은 숲 어딘가 · 심봤다!' },
    { id: 'clover4',     name: '네잎클로버', cat: 'rare',   rarity: '희귀', price: 400, season: ['spring', 'summer'], hint: '세잎 사이 어딘가에 하나' },
    { id: 'amberstone',  name: '호박석',     cat: 'rare',   rarity: '희귀', price: 600, hint: '오래된 송진이 굳은 돌 · 아무 때나 아주 가끔' }
  ];
  var FORAGE_BY = {};
  FORAGE.forEach(function (f) { FORAGE_BY[f.id] = f; });
  // forest dishes: ordinary recipes (no gift needed); the 송이 one stays ??? until cooked
  var FOREST_RECIPES = [
    { id: 'mushhotpot', name: '버섯전골',     need: ['oyster', 'shiitake', 'radish'], time: 420e3, sell: 560 },
    { id: 'bibimbap',   name: '산나물비빔밥', need: ['gosari', 'chwi', 'egg'],        time: 300e3, sell: 380 },
    { id: 'dotorimuk',  name: '도토리묵',     need: ['acorn', 'acorn', 'acorn'],      time: 600e3, sell: 320 },
    { id: 'bamjorim',   name: '밤조림',       need: ['chestnut', 'chestnut', 'berry'], time: 480e3, sell: 440 },
    { id: 'songigui',   name: '송이구이',     need: ['songi', 'songi'],               time: 600e3, sell: 2800, hidden: true }
  ];
  FOREST_RECIPES.forEach(function (r) { RECIPES.push(r); });
  // the grandma likes greens and herbs, the kid collects berries and pebbles: forage orders get a resident
  RESIDENTS.forEach(function (r) { if (r.id === 'grandma' || r.id === 'kid') r.kinds.push('forage'); });

  var FOREST_N = 7, FOREST_REP = 3, FOREST_COST = 500, REGROW_MIN = 300e3, REGROW_SPAN = 300e3;
  var WET_MUL = 3;

  function forageById(id) { return FORAGE_BY.hasOwnProperty(id) ? FORAGE_BY[id] : null; }
  function forageSeasonal(id) { var f = forageById(id); return !!(f && f.season); }
  // 0 = can't grow under env
  // s is optional: with it, a conditional find not picked yet gets the 첫 만남 보정 (FIRST_MUL, as for fish)
  function forageWeight(f, env, s) {
    if ((f.place || '') !== (env.place || '')) return 0;   // stage 9: 깊은 숲·산꼭대기 finds grow only there
    if (f.season && f.season.indexOf(env.season) < 0) return 0;
    if (f.phase && f.phase.indexOf(env.phase) < 0) return 0;
    if (f.wet && !env.wet) return 0;
    var w = FORAGE_W[f.rarity];
    if (f.cat === 'mush' && env.wet) w *= WET_MUL;
    if (f.peak === env.season) w *= 2;
    if (s && s.forest && forageConditional(f) && !s.forest.dex[f.id]) w *= FIRST_MUL;
    if (f.rarity !== '흔함' && dayIs(s, 'forage')) w *= DAY_RARE_MUL;   // stage 8: 채집 운 좋은 날
    return w;
  }
  function foragePool(env, s) {
    var out = [];
    FORAGE.forEach(function (f) { var w = forageWeight(f, env, s); if (w > 0) out.push({ id: f.id, w: w }); });
    return out;
  }
  // conditional = only under some season/time/weather (the 달력 "지금만" list)
  function forageConditional(f) { return !!(f.season || f.phase || f.wet); }
  function rollForage(env, rng, s) { return pick(foragePool(env, s), rng).id; }

  function forestOk(s) { return !!s.forest; }
  function forestStatus(s) { return s.forest ? 'owned' : s.rep < FOREST_REP ? 'rep' : s.coins < FOREST_COST ? 'coins' : 'ok'; }
  function newForest(now) {
    var spots = [];
    for (var k = 0; k < FOREST_N; k++) spots.push({ at: now, id: null });
    return { spots: spots, dex: {}, n: 0 };
  }
  function unlockForest(s, now) {
    var st = forestStatus(s);
    if (st !== 'ok') return { ok: false, why: st === 'owned' ? 'owned' : st };
    s.coins -= FOREST_COST; s.forest = newForest(now);
    return { ok: true };
  }
  // regrown spots get their item; returns how many appeared
  function tickForest(s, now, env, rng) {
    if (!s.forest) return 0;
    var n = 0;
    s.forest.spots.forEach(function (p) { if (!p.id && now >= p.at) { p.id = rollForage(env, rng, s); n++; } });
    return n;
  }
  function forageReady(s) { return s.forest ? s.forest.spots.filter(function (p) { return !!p.id; }).length : 0; }
  // the next regrow time among empty spots (null if all are full)
  function forestNextAt(s) {
    var t = null;
    if (s.forest) s.forest.spots.forEach(function (p) { if (!p.id && (t === null || p.at < t)) t = p.at; });
    return t;
  }
  function forageNote(s, id, n) { var d = s.forest.dex; d[id] = Math.min(1e6, (d[id] || 0) + n); s.forest.n = Math.min(1e9, s.forest.n + n); }
  // pick spot k. won = the optional 도전 succeeded: two of a common/uncommon find, or for rare ones a 50% chance of a second.
  // A failed or skipped 도전 is the plain pick. Returns null if nothing is there (no double pick).
  function pickForage(s, k, now, rng, won) {
    var p = s.forest && s.forest.spots[k];
    if (!p || !p.id) return null;
    var f = forageById(p.id), n = 1;
    if (won) n = f.rarity === '희귀' || f.rarity === '전설' ? (rng() < 0.5 ? 2 : 1) : 2;
    var boom = boomExtra(s, 'forest', now, n); n += boom;   // stage 8: 대풍년
    var sold = 0;
    for (var j = 0; j < n; j++) sold += bagAdd(s, f.id, f.price);
    forageNote(s, f.id, n);
    s.forest.spots[k] = { at: now + REGROW_MIN + rng() * REGROW_SPAN, id: null };
    return { id: f.id, n: n, sold: sold, won: !!won, boom: boom };
  }
  function forageDexCount(s) { return s.forest ? Object.keys(s.forest.dex).length : 0; }
  // common, any-season forage already found can be asked for on the order board
  function forageOrders(s, out) {
    if (!s.forest) return;
    FORAGE.forEach(function (f) { if (f.rarity === '흔함' && !f.season && s.forest.dex[f.id]) out.push({ id: f.id, w: 1 }); });
  }

  // ---------- save: called by decode() at the end (absent in older saves) ----------
  function decodeForest(o, s) {
    var q = o.forest;
    if (!q || typeof q !== 'object' || Array.isArray(q)) return;
    var num = function (x) { return typeof x === 'number' && isFinite(x); };
    var f = newForest(0);
    if (Array.isArray(q.spots)) for (var k = 0; k < FOREST_N; k++) {
      var p = q.spots[k];
      if (p && typeof p === 'object') f.spots[k] = { at: num(p.at) ? p.at : 0, id: forageById(p.id) ? p.id : null };
    }
    if (q.dex && typeof q.dex === 'object') FORAGE.forEach(function (g) { if (num(q.dex[g.id]) && q.dex[g.id] > 0) f.dex[g.id] = Math.min(1e6, Math.floor(q.dex[g.id])); });
    if (num(q.n) && q.n > 0) f.n = Math.min(1e9, Math.floor(q.n));
    s.forest = f;
  }

  expose({
    FORAGE: FORAGE, FORAGE_CATS: FORAGE_CATS, FOREST_RECIPES: FOREST_RECIPES, FOREST_N: FOREST_N, FOREST_REP: FOREST_REP, FOREST_COST: FOREST_COST,
    REGROW_MIN: REGROW_MIN, REGROW_SPAN: REGROW_SPAN,
    forageById: forageById, forageSeasonal: forageSeasonal, forageWeight: forageWeight, foragePool: foragePool, forageConditional: forageConditional,
    rollForage: rollForage, forestOk: forestOk, forestStatus: forestStatus, unlockForest: unlockForest, tickForest: tickForest,
    forageReady: forageReady, forestNextAt: forestNextAt, pickForage: pickForage, forageDexCount: forageDexCount, forageOrders: forageOrders,
    decodeForest: decodeForest
  });
