  // ---------- 섬 (stage 7): 낡은 배, 섬 낚시터, 표류물, 야자수, 등대 이야기 (s.isle, made when the boat is fixed) ----------
  // The old boat on the 바다 beach is fixed once with coins + 고물 (s.junk scrap). Then the 섬 has its own fishing spot
  // ('island': opened by the boat, never bought at the signpost), a beach where drift washes up again by real time,
  // a palm with a few coconuts per real day, and the 등대지기 whose dark lighthouse is mended step by step.
  // Not the 연못 나룻배 (the 'boat' milestone): that one is a decoration and stays as it is.
  SPOTS.island = { id: 'island', name: '섬', rep: Infinity, cost: 0 };   // spotStatus never says 'ok': only the boat opens it
  var BOAT_FIX = { coins: 20000, junk: 5 };
  var BOAT_JUNK_ORDER = ['can', 'boot', 'bottle', 'key'];             // cheapest scrap first, keys (자물쇠) last

  // 섬 물고기: the usual cast/reel/land flow, spot 'island'
  var ISLE_FISH_DEFS = [
    { id: 'damsel',     name: '자리돔',   rarity: '흔함', w: 40, min: 8,   max: 15,  power: 0.9, price: 70,   spot: 'island', hint: '섬 바위 사이에 떼로 · 작고 통통하다' },
    { id: 'mullet',     name: '숭어',     rarity: '흔함', w: 32, min: 25,  max: 60,  power: 1.2, price: 90,   spot: 'island', hint: '수면 위로 펄쩍 뛰어오른다' },
    { id: 'blenny',     name: '베도라치', rarity: '흔함', w: 30, min: 10,  max: 25,  power: 0.9, price: 60,   spot: 'island', hint: '갯바위 틈에 사는 길쭉한 물고기' },
    { id: 'filefish',   name: '쥐치',     rarity: '드묾', w: 18, min: 15,  max: 30,  power: 1.2, price: 220,  spot: 'island', hint: '입을 오물오물 · 미끼만 쏙 빼 먹는다' },
    { id: 'tilefish',   name: '옥돔',     rarity: '드묾', w: 16, min: 25,  max: 45,  power: 1.4, price: 320,  spot: 'island', phase: ['morning'], hint: '섬 아침 물때 · 모래 바닥 굴에서' },
    { id: 'halfbeak',   name: '학공치',   rarity: '드묾', w: 18, min: 20,  max: 35,  power: 1.1, price: 240,  spot: 'island', phase: ['day'], hint: '한낮 수면 가까이 · 아래턱이 길다' },
    { id: 'scorpion',   name: '쏨뱅이',   rarity: '드묾', w: 18, min: 15,  max: 30,  power: 1.3, price: 260,  spot: 'island', weather: 'rain', hint: '비 오는 날 갯바위 밑에서 · 가시 조심' },
    { id: 'flyingfish', name: '날치',     rarity: '드묾', w: 20, min: 20,  max: 35,  power: 1.3, price: 300,  spot: 'island', season: 'summer', hint: '여름 섬 바다 · 지느러미로 날아오른다' },
    { id: 'blowfish',   name: '복어',     rarity: '드묾', w: 18, min: 15,  max: 35,  power: 1.2, price: 340,  spot: 'island', season: 'winter', hint: '겨울 섬 바다 · 놀라면 빵빵해진다' },
    { id: 'moray',      name: '곰치',     rarity: '희귀', w: 8,  min: 50,  max: 120, power: 1.8, price: 640,  spot: 'island', phase: ['night'], hint: '밤이면 바위 구멍에서 고개를 내민다' },
    { id: 'sunfish',    name: '개복치',   rarity: '희귀', w: 6,  min: 80,  max: 180, power: 1.9, price: 900,  spot: 'island', weather: 'clear', phase: ['day'], hint: '맑은 한낮 · 수면에 누워 볕을 쬔다' },
    { id: 'grouper',    name: '다금바리', rarity: '희귀', w: 7,  min: 40,  max: 90,  power: 1.9, price: 1100, spot: 'island', hint: '섬 깊은 바위굴의 귀한 손님 · 좋은 미끼가 필요하다' },
    { id: 'dotdom',     name: '돗돔',     rarity: '전설', w: 3,  min: 100, max: 200, power: 2.4, price: 3200, spot: 'island', phase: ['night'], hint: '깊은 밤 섬 앞바다 · 전설의 심해어 · 장력을 잘 다뤄야' }
  ];
  ISLE_FISH_DEFS.forEach(function (f) { FISH.push(f); });
  var ISLE_FISH = ISLE_FISH_DEFS.map(function (f) { return f.id; });
  // 섬 finds and coconuts on the order board: 박 영감 and 민지 사장 post them (residentFor needs someone for every kind)
  RESIDENTS.forEach(function (r) { if (r.id === 'fisher' || r.id === 'chef') r.kinds.push('isle'); });

  // 표류물: rolled when a washed-up spot is first looked at (like the 숲), under that moment's season/time/weather.
  // special 'letter' = the next 병 편지 of the series (s.junk.letters), 'seed' = one 황금 수박 씨앗; the rest go to the basket.
  var DRIFT_W = { '흔함': 30, '드묾': 12, '희귀': 3, '전설': 0.6 };
  var DRIFT = [
    { id: 'shell',      name: '조개껍데기', rarity: '흔함', price: 15,  hint: '모래사장 어디에나 · 귀에 대면 파도 소리' },
    { id: 'driftwood',  name: '유목',       rarity: '흔함', price: 20,  hint: '바다를 건너온 하얗게 바랜 나무' },
    { id: 'rope',       name: '낡은 밧줄',  rarity: '흔함', price: 12,  hint: '어느 배에서 풀려 온 밧줄' },
    { id: 'sanddollar', name: '모래 동전', rarity: '흔함', price: 30,  phase: ['morning', 'day'], hint: '낮 물때 · 젖은 모래 위의 하얀 동전' },
    { id: 'conch',      name: '소라 껍데기', rarity: '드묾', price: 60, hint: '뱅글뱅글 · 먼바다에서 굴러 왔다' },
    { id: 'glassfloat', name: '유리 부표',  rarity: '드묾', price: 90,  hint: '옛 어선이 쓰던 둥근 유리 공' },
    { id: 'seaglass',   name: '바다 유리',  rarity: '드묾', price: 80,  weather: 'rain', hint: '비 오는 날 · 파도에 닳아 동글동글한 유리' },
    { id: 'dletter',    name: '병 편지',    rarity: '드묾', special: 'letter', hint: '코르크로 막힌 병 · 등대섬에서 띄운 걸까' },
    { id: 'moonshell',  name: '달빛 조개',  rarity: '희귀', price: 320, phase: ['night'], hint: '밤 물가에서만 은은하게 빛난다' },
    { id: 'coral',      name: '산호 조각',  rarity: '희귀', price: 260, season: ['summer'], hint: '여름 · 따뜻한 물살에 떠밀려 온 가지' },
    { id: 'exoticseed', name: '이국 씨앗',  rarity: '희귀', special: 'seed', hint: '먼 나라에서 온 씨앗 · 심으면 황금빛이 돈다는데' },
    { id: 'ambergris',  name: '용연향',     rarity: '전설', price: 2000, weather: 'fog', hint: '안개 낀 날 · 고래가 남긴 바다의 보물' }
  ];
  var DRIFT_BY = {};
  DRIFT.forEach(function (d) { DRIFT_BY[d.id] = d; });
  var COCONUT = { id: 'coconut', name: '야자 열매', price: 45, hint: '섬 야자수 · 하루에 몇 개씩 여문다' };
  var DRIFT_N = 5, DRIFT_MIN = 240e3, DRIFT_SPAN = 240e3, PALM_N = 3;

  // 등대 이야기: the keeper asks for what the beach and the palm give; one step per visit, no deadline
  var LIGHTHOUSE = [
    { todo: '등대지기 할머니에게 말 걸기',
      say: '할머니: 손님이 다 오네. 저 등대, 태풍에 불이 꺼진 지 오래유. 해솔이가 방학에 오기 전에 다시 켜고 싶은데… 계단 판자부터 갈아야 해. 바닷가 유목 좀 모아 줄래요?' },
    { need: ['driftwood', 3], todo: '할머니에게 유목 3개 가져다주기',
      say: '할머니: 백스물세 칸, 이제 안 삐걱거리겠네. 다음은 깨진 등대 유리야. 바닷가 유리 부표면 꼭 맞을 텐데.' },
    { need: ['glassfloat', 2], todo: '할머니에게 유리 부표 2개 가져다주기',
      say: '할머니: 반짝반짝하네! 이제 등잔 기름이 있어야 해. 야자 열매를 짜면 고소한 기름이 나와요.' },
    { need: ['coconut', 3], todo: '할머니에게 야자 열매 3개 가져다주기',
      say: '할머니: 기름 냄새 좋다. 마지막으로 심지를 감고 등을 매달 밧줄만 있으면 돼요.' },
    { need: ['rope', 2], todo: '할머니에게 낡은 밧줄 2개 가져다주기',
      say: '할머니: 자, 불 켜 볼까… 봐요, 바다가 다 보이지? 이제 밤배들이 길을 안 잃겠어. 고마워요. 해솔이한테 편지 써야겠네.' }
  ];
  var LIGHT_DECO = 'buoylamp', LIGHT_COINS = 5000;
  DECOS.push({ id: LIGHT_DECO, name: '부표 등불', cost: 0, merchant: true, from: 'isle', sz: [10, 20] });
  var KEEPER_LINES = [
    '할머니: 밤바다에 불빛 하나 있으면 마음이 놓여요.',
    '할머니: 해솔이 편지가 왔어요. 계단 백스물세 칸, 방학에 또 오른대.',
    '할머니: 돗돔이라는 큰 물고기가 있대요. 깊은 밤에 등대 불빛 아래로 온다나.',
    '할머니: 안개 낀 날엔 바닷가를 잘 봐요. 가끔 귀한 게 밀려와.',
    '할머니: 병 편지는 버리지 말아요. 누군가는 꼭 읽거든.'
  ];
  var KEEPER_WAIT = [
    '할머니: 등대가 꺼져서 밤엔 섬이 캄캄해요.',
    '할머니: 천천히 해요. 바다는 어디 안 가니까.'
  ];

  function isleOf(s) {
    if (!s.isle) {
      var drift = [];
      for (var k = 0; k < DRIFT_N; k++) drift.push({ at: 0, id: null });
      s.isle = { boat: false, drift: drift, palm: { day: -1, n: 0 }, lh: 0, lit: false, dex: {} };
    }
    return s.isle;
  }
  function isleOk(s) { return !!(s && s.isle && s.isle.boat) && spotUnlocked(s, 'sea'); }
  function scrapCount(s) { var n = 0; SCRAP_IDS.forEach(function (id) { n += junkCount(s, id); }); return n; }
  // 'owned' | 'sea' (바다 not open yet) | 'coins' | 'junk' | 'ok'
  function boatStatus(s) {
    if (s.isle && s.isle.boat) return 'owned';
    if (!spotUnlocked(s, 'sea')) return 'sea';
    if (s.coins < BOAT_FIX.coins) return 'coins';
    return scrapCount(s) < BOAT_FIX.junk ? 'junk' : 'ok';
  }
  function fixBoat(s) {
    var st = boatStatus(s);
    if (st !== 'ok') return { ok: false, why: st };
    s.coins -= BOAT_FIX.coins;
    var left = BOAT_FIX.junk, j = junkOf(s);
    BOAT_JUNK_ORDER.forEach(function (id) {
      var n = Math.min(left, j.n[id] || 0);
      if (!n) return;
      left -= n;
      if ((j.n[id] -= n) <= 0) delete j.n[id];   // no zero counts (a reload drops them anyway)
    });
    isleOf(s).boat = true;
    s.spotOk = s.spotOk || {};
    s.spotOk.island = true;
    return { ok: true };
  }

  // ---------- 표류물 ----------
  function driftById(id) { return DRIFT_BY.hasOwnProperty(id) ? DRIFT_BY[id] : null; }
  function driftConditional(d) { return !!(d.season || d.phase || d.weather); }
  // 0 = can't wash up under env. s optional: an uncaught conditional find gets the 첫 만남 보정 (FIRST_MUL, as for fish)
  function driftWeight(d, env, s) {
    if (d.season && d.season.indexOf(env.season) < 0) return 0;
    if (d.phase && d.phase.indexOf(env.phase) < 0) return 0;
    if (d.weather && d.weather !== env.weather) return 0;
    var w = DRIFT_W[d.rarity];
    if (s && s.isle && driftConditional(d) && !s.isle.dex[d.id]) w *= FIRST_MUL;
    return w;
  }
  function rollDrift(env, rng, s) {
    var pool = [];
    DRIFT.forEach(function (d) { var w = driftWeight(d, env, s); if (w > 0) pool.push({ id: d.id, w: w }); });
    return pick(pool, rng).id;
  }
  // washed-up spots that are due get their find; returns how many appeared
  function tickIsle(s, now, env, rng) {
    if (!isleOk(s)) return 0;
    var n = 0;
    s.isle.drift.forEach(function (p) { if (!p.id && now >= p.at) { p.id = rollDrift(env, rng, s); n++; } });
    return n;
  }
  // what lies on each beach spot now (null = washed clean, waiting)
  function driftSpots(s, now) { return s.isle ? s.isle.drift.map(function (p) { return p.id && now >= p.at ? p.id : null; }) : []; }
  function driftNextAt(s) {
    var t = null;
    if (s.isle) s.isle.drift.forEach(function (p) { if (!p.id && (t === null || p.at < t)) t = p.at; });
    return t;
  }
  function isleNote(s, id) { s.isle.dex[id] = Math.min(1e6, (s.isle.dex[id] || 0) + 1); }
  function pickDrift(s, k, now, rng) {
    var p = isleOk(s) && s.isle.drift[k];
    if (!p || !p.id || now < p.at) return null;
    var d = driftById(p.id), out = { id: d.id };
    if (d.special === 'letter') {
      var j = junkOf(s), n = nextBottle(s, rng);
      j.seen.letter = true;
      if (n) { j.letters.push(n); out.letter = n; out.complete = j.letters.length === BOTTLE_LETTERS.length; }
      else { s.coins += LETTER_DUP_COINS; out.coins = LETTER_DUP_COINS; }
    } else if (d.special === 'seed') {
      s.seeds.gold++; s.dex.goldSeed = true; out.seed = 1;
    } else out.sold = bagAdd(s, d.id, d.price);
    out.first = !s.isle.dex[d.id];
    isleNote(s, d.id);
    s.isle.drift[k] = { at: now + DRIFT_MIN + rng() * DRIFT_SPAN, id: null };
    return out;
  }

  // ---------- 야자수: PALM_N coconuts per real (local) day ----------
  function palmLeft(s, now, tzMin) {
    if (!isleOk(s)) return 0;
    var p = s.isle.palm;
    return p.day === petDay(now, tzMin) ? Math.max(0, PALM_N - p.n) : PALM_N;
  }
  function pickCoconut(s, now, tzMin) {
    if (palmLeft(s, now, tzMin) <= 0) return null;
    var p = s.isle.palm, d = petDay(now, tzMin);
    if (p.day !== d) { p.day = d; p.n = 0; }
    p.n++;
    isleNote(s, COCONUT.id);
    return { sold: bagAdd(s, COCONUT.id, COCONUT.price) };
  }

  // basket items of the 섬 (drift that isn't a letter/seed, and coconuts)
  function isleItem(id) {
    if (id === COCONUT.id) return COCONUT;
    var d = driftById(id);
    return d && !d.special ? d : null;
  }
  // common finds already picked can be asked for on the order board (conditional ones stay off, like seasonal fish)
  function isleOrders(s, out) {
    if (!isleOk(s)) return;
    DRIFT.forEach(function (d) { if (!d.special && !driftConditional(d) && (d.rarity === '흔함' || d.rarity === '드묾') && s.isle.dex[d.id]) out.push({ id: d.id, w: 1 }); });
    if (s.isle.dex[COCONUT.id]) out.push({ id: COCONUT.id, w: 1 });
  }
  function isleDexCount(s) { var n = 0; if (s.isle) DRIFT.forEach(function (d) { if (s.isle.dex[d.id]) n++; }); return n; }

  // ---------- 등대 이야기 ----------
  // the step waiting now → { k, step, total } | null (no boat yet, or the light is already on)
  function lighthouseStep(s) {
    if (!isleOk(s) || s.isle.lit) return null;
    return { k: s.isle.lh, step: LIGHTHOUSE[s.isle.lh], total: LIGHTHOUSE.length };
  }
  function advanceLighthouse(s) {
    if (!isleOk(s)) return { ok: false, why: 'boat' };
    var cur = lighthouseStep(s);
    if (!cur) return { ok: false, why: 'done' };
    var need = cur.step.need;
    if (need && !bagTake(s, need[0], need[1])) return { ok: false, why: 'item' };
    var out = { ok: true, say: cur.step.say, done: false };
    s.isle.lh++;
    if (s.isle.lh >= LIGHTHOUSE.length) {
      s.isle.lit = true; out.done = true;
      var g = grantDeco(s, LIGHT_DECO);
      out.reward = { coins: LIGHT_COINS, deco: g.ok ? LIGHT_DECO : null, stored: !!g.stored };
      if (!g.ok) out.reward.coins += 1000;   // already owned somehow: coins instead
      s.coins += out.reward.coins;
    }
    return out;
  }
  // the keeper's line for this game hour (changes as the story goes)
  function keeperLine(s, now, tzMin) {
    var lines = s.isle && s.isle.lit ? KEEPER_LINES : KEEPER_WAIT;
    return lines[Math.abs(gameClock(now, tzMin).day) % lines.length];
  }
  // the lighthouse shines over the 섬 and the 바다 at game night once it is mended
  function lighthouseOn(s, now, tzMin) { return !!(s.isle && s.isle.lit) && gameClock(now, tzMin).phase === 'night'; }

  // ---------- save: called by decode() at the end (absent in older saves) ----------
  function decodeIsland(o, s) {
    var q = o.isle;
    if (!q || typeof q !== 'object' || Array.isArray(q) || q.boat !== true || !spotUnlocked(s, 'sea')) return;
    var num = function (x) { return typeof x === 'number' && isFinite(x); };
    var isle = isleOf(s);
    isle.boat = true;
    if (Array.isArray(q.drift)) for (var k = 0; k < DRIFT_N; k++) {
      var p = q.drift[k];
      if (p && typeof p === 'object') isle.drift[k] = { at: num(p.at) ? p.at : 0, id: driftById(p.id) ? p.id : null };
    }
    if (q.palm && typeof q.palm === 'object' && num(q.palm.day)) {
      isle.palm = { day: Math.floor(q.palm.day), n: num(q.palm.n) ? Math.max(0, Math.min(PALM_N, Math.floor(q.palm.n))) : 0 };
    }
    if (num(q.lh) && q.lh >= 0 && q.lh <= LIGHTHOUSE.length) isle.lh = Math.floor(q.lh);
    isle.lit = isle.lh >= LIGHTHOUSE.length;
    if (q.dex && typeof q.dex === 'object') DRIFT.concat([COCONUT]).forEach(function (d) {
      if (num(q.dex[d.id]) && q.dex[d.id] > 0) isle.dex[d.id] = Math.min(1e6, Math.floor(q.dex[d.id]));
    });
    s.spotOk = s.spotOk || {};
    s.spotOk.island = true;
    if (o.spot === 'island') s.spot = 'island';
  }

  expose({
    BOAT_FIX: BOAT_FIX, ISLE_FISH: ISLE_FISH, DRIFT: DRIFT, COCONUT: COCONUT, DRIFT_N: DRIFT_N, DRIFT_MIN: DRIFT_MIN, DRIFT_SPAN: DRIFT_SPAN,
    PALM_N: PALM_N, LIGHTHOUSE: LIGHTHOUSE, LIGHT_DECO: LIGHT_DECO, LIGHT_COINS: LIGHT_COINS,
    isleOf: isleOf, isleOk: isleOk, scrapCount: scrapCount, boatStatus: boatStatus, fixBoat: fixBoat,
    driftById: driftById, driftConditional: driftConditional, driftWeight: driftWeight, rollDrift: rollDrift, tickIsle: tickIsle,
    driftSpots: driftSpots, driftNextAt: driftNextAt, pickDrift: pickDrift, palmLeft: palmLeft, pickCoconut: pickCoconut,
    isleItem: isleItem, isleOrders: isleOrders, isleDexCount: isleDexCount,
    lighthouseStep: lighthouseStep, advanceLighthouse: advanceLighthouse, keeperLine: keeperLine, lighthouseOn: lighthouseOn,
    decodeIsland: decodeIsland
  });
