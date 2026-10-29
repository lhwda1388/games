  // ---------- 배 업그레이드 (stage 9 ①): 나룻배 → 돛배 → 통통배, 먼바다·난바다 끌낚시, 먼 섬 (s.ship, made on the first upgrade) ----------
  // The repaired 섬 boat (s.isle.boat) is the 나룻배. Each tier costs coins + 동굴 ores + 섬 drift (basket items, bagTake).
  // 돛배 opens the 먼바다 spot, 통통배 the 난바다 spot and the 먼 섬 (a small beach with its own drift).
  // Spots are opened by the boat like the 섬 (rep Infinity: never bought at the signpost). After temper.js and museum.js:
  // the bosses go into TEMPER and the new fish into the museum fish room here.
  // s.ship = { t: 1 | 2, drift: [{ at, id }], dex: { id: n } }
  SPOTS.offshore = { id: 'offshore', name: '먼바다', rep: Infinity, cost: 0 };
  SPOTS.ocean = { id: 'ocean', name: '난바다', rep: Infinity, cost: 0 };
  var SHIP_TIERS = [
    { id: 'raft', name: '나룻배' },
    { id: 'sail', name: '돛배', coins: 900000, need: [['driftwood', 4], ['rope', 3], ['iron', 3]], spot: 'offshore' },
    { id: 'motor', name: '통통배', coins: 1600000, need: [['iron', 6], ['copper', 6], ['coal', 8], ['glassfloat', 2]], spot: 'ocean' }
  ];

  // 끌낚시 fish: big ones only, the usual cast/reel/land flow at spot 'offshore' / 'ocean'
  var SHIP_FISH_DEFS = [
    // 먼바다 (돛배)
    { id: 'bonito',     name: '가다랑어',   rarity: '흔함', w: 40,  min: 40,  max: 80,  power: 1.5,  price: 170,  spot: 'offshore', hint: '먼바다를 떼 지어 달린다 · 배를 따라온다' },
    { id: 'spanish',    name: '삼치',       rarity: '흔함', w: 32,  min: 50,  max: 100, power: 1.5,  price: 180,  spot: 'offshore', hint: '이빨이 날카로운 길쭉한 은빛 물고기' },
    { id: 'dolphinfish', name: '만새기',    rarity: '드묾', w: 18,  min: 60,  max: 120, power: 1.7,  price: 400,  spot: 'offshore', season: 'summer', hint: '여름 먼바다 · 떠다니는 나무 그늘 밑에' },
    { id: 'amberjack',  name: '부시리',     rarity: '드묾', w: 16,  min: 70,  max: 130, power: 1.8,  price: 440,  spot: 'offshore', phase: ['morning'], hint: '아침 물때 · 방어보다 날렵하다' },
    { id: 'bluefin',    name: '참다랑어',   rarity: '희귀', w: 7,   min: 120, max: 250, power: 2.0,  price: 900, spot: 'offshore', weather: 'clear', hint: '맑은 날 먼바다 · 바다의 검은 다이아몬드' },
    { id: 'marlin',     name: '청새치',     rarity: '전설', w: 2.5, min: 180, max: 350, power: 2.35, price: 2800, spot: 'offshore', phase: ['morning', 'day'], weather: 'clear', hint: '맑은 날 해가 떠 있을 때 · 창 같은 주둥이의 먼바다 왕 · 3단계로 싸운다' },
    // 난바다 (통통배)
    { id: 'wahoo',      name: '꼬치삼치',   rarity: '흔함', w: 40,  min: 80,  max: 150, power: 1.6,  price: 230,  spot: 'ocean', hint: '난바다의 총알 · 줄을 풀며 내달린다' },
    { id: 'yellowfin',  name: '황다랑어',   rarity: '흔함', w: 30,  min: 70,  max: 140, power: 1.7,  price: 250,  spot: 'ocean', hint: '긴 지느러미 · 통통배 뒤를 쫓아온다' },
    { id: 'monkfish',   name: '아귀',       rarity: '드묾', w: 18,  min: 50,  max: 100, power: 1.6,  price: 320,  spot: 'ocean', phase: ['night'], hint: '깊은 밤 바닥에서 · 머리에 낚싯대를 달았다' },
    { id: 'skate',      name: '홍어',       rarity: '드묾', w: 18,  min: 60,  max: 120, power: 1.7,  price: 380,  spot: 'ocean', season: 'winter', hint: '겨울 난바다 · 넓적하게 바닥에 붙는다' },
    { id: 'giantsquid', name: '대왕오징어', rarity: '희귀', w: 8,   min: 150, max: 400, power: 2.0,  price: 950, spot: 'ocean', weather: 'rain', hint: '비 오는 날 깊은 데서 올라온다 · 다리가 끝도 없다' },
    { id: 'mako',       name: '청상아리',   rarity: '희귀', w: 7,   min: 150, max: 300, power: 2.1,  price: 1100, spot: 'ocean', phase: ['evening'], hint: '해 질 녘 · 수면 위로 솟구치는 상어' },
    { id: 'oarfish',    name: '산갈치',     rarity: '전설', w: 2.5, min: 300, max: 600, power: 2.45, price: 3500, spot: 'ocean', phase: ['night'], hint: '깊은 밤 난바다 · 은빛 띠 같은 전설의 심해어 · 3단계로 싸운다' }
  ];
  SHIP_FISH_DEFS.forEach(function (f) { FISH.push(f); MUSEUM_ROOMS.fish.ids.push(f.id); });
  var OFFSHORE_FISH = SHIP_FISH_DEFS.filter(function (f) { return f.spot === 'offshore'; }).map(function (f) { return f.id; });
  var OCEAN_FISH = SHIP_FISH_DEFS.filter(function (f) { return f.spot === 'ocean'; }).map(function (f) { return f.id; });
  var SHIP_FISH = OFFSHORE_FISH.concat(OCEAN_FISH);
  // how they fight (logic/temper.js): commons have one way, rare ones mix, the two legends are 3-phase bosses
  TEMPER.bonito = [R]; TEMPER.spanish = [J]; TEMPER.wahoo = [R]; TEMPER.yellowfin = [D];
  TEMPER.dolphinfish = [['jump', 'run']]; TEMPER.amberjack = [['run', 'sound']]; TEMPER.monkfish = [['sound', 'burst']]; TEMPER.skate = [['sound', 'run']];
  TEMPER.bluefin = [['run', 'sound']]; TEMPER.giantsquid = [['sound', 'jump']]; TEMPER.mako = [['jump', 'run']];
  TEMPER.marlin = [J, R, ['jump', 'run']];
  TEMPER.oarfish = [D, ['run', 'sound'], ['sound', 'jump']];

  // 먼 섬 표류물: like the 섬 beach (DRIFT_W rarity weights, first-meet boost), fewer spots, its own finds
  var FAR_DRIFT = [
    { id: 'pumice',    name: '속돌',          rarity: '흔함', price: 40,  hint: '물에 둥둥 뜨는 구멍 숭숭 돌' },
    { id: 'seabean',   name: '바다콩',        rarity: '흔함', price: 50,  hint: '먼 나라 덩굴에서 떨어져 바다를 건너온 단단한 콩' },
    { id: 'nautilus',  name: '앵무조개 껍데기', rarity: '드묾', price: 260, phase: ['night'], hint: '밤 물가 · 방이 여러 개인 소용돌이 껍데기' },
    { id: 'whalebone', name: '고래 뼈',       rarity: '희귀', price: 900, weather: 'fog', hint: '안개 낀 날 · 먼 섬에 밀려온 커다란 뼈' }
  ];
  var FAR_BY = {};
  FAR_DRIFT.forEach(function (d) { FAR_BY[d.id] = d; });
  var FAR_N = 3, FAR_MIN = 300e3, FAR_SPAN = 300e3;

  function shipTier(s) { return isleOk(s) ? (s.ship ? s.ship.t : 0) : -1; }
  function shipNext(s) { var t = shipTier(s); return t >= 0 && t < SHIP_TIERS.length - 1 ? SHIP_TIERS[t + 1] : null; }
  // the next tier's materials: [{ id, n, have }]
  function shipMissing(s) {
    var nx = shipNext(s);
    return nx ? nx.need.map(function (q) { return { id: q[0], n: q[1], have: bagCount(s, q[0]) }; }) : [];
  }
  // 'boat' (섬 boat not fixed) | 'max' | 'coins' | 'item' | 'ok'
  function shipStatus(s) {
    var nx = shipNext(s);
    if (shipTier(s) < 0) return 'boat';
    if (!nx) return 'max';
    if (s.coins < nx.coins) return 'coins';
    return shipMissing(s).every(function (m) { return m.have >= m.n; }) ? 'ok' : 'item';
  }
  function shipOpen(s, t) {
    s.spotOk = s.spotOk || {};
    for (var k = 1; k <= t; k++) s.spotOk[SHIP_TIERS[k].spot] = true;
  }
  function upgradeShip(s) {
    var st = shipStatus(s);
    if (st !== 'ok') return { ok: false, why: st };
    var nx = shipNext(s);
    s.coins -= nx.coins;
    nx.need.forEach(function (q) { bagTake(s, q[0], q[1]); });
    if (!s.ship) {
      var drift = [];
      for (var k = 0; k < FAR_N; k++) drift.push({ at: 0, id: null });
      s.ship = { t: 0, drift: drift, dex: {} };
    }
    s.ship.t++;
    shipOpen(s, s.ship.t);
    return { ok: true, tier: s.ship.t, spot: nx.spot };
  }

  // ---------- 먼 섬 ----------
  function farOk(s) { return shipTier(s) >= 2; }
  function farById(id) { return FAR_BY.hasOwnProperty(id) ? FAR_BY[id] : null; }
  function farWeight(d, env, s) {
    if (d.season && d.season.indexOf(env.season) < 0) return 0;
    if (d.phase && d.phase.indexOf(env.phase) < 0) return 0;
    if (d.weather && d.weather !== env.weather) return 0;
    var w = DRIFT_W[d.rarity];
    if (s && s.ship && driftConditional(d) && !s.ship.dex[d.id]) w *= FIRST_MUL;
    return w;
  }
  function tickFar(s, now, env, rng) {
    if (!farOk(s)) return 0;
    var n = 0;
    s.ship.drift.forEach(function (p) {
      if (p.id || now < p.at) return;
      var pool = [];
      FAR_DRIFT.forEach(function (d) { var w = farWeight(d, env, s); if (w > 0) pool.push({ id: d.id, w: w }); });
      p.id = pick(pool, rng).id; n++;
    });
    return n;
  }
  function farSpots(s, now) { return s.ship ? s.ship.drift.map(function (p) { return p.id && now >= p.at ? p.id : null; }) : []; }
  function farNextAt(s) {
    var t = null;
    if (s.ship) s.ship.drift.forEach(function (p) { if (!p.id && (t === null || p.at < t)) t = p.at; });
    return t;
  }
  function pickFar(s, k, now, rng) {
    var p = farOk(s) && s.ship.drift[k];
    if (!p || !p.id || now < p.at) return null;
    var d = farById(p.id), out = { id: d.id, first: !s.ship.dex[d.id] };
    out.sold = bagAdd(s, d.id, d.price);
    s.ship.dex[d.id] = Math.min(1e6, (s.ship.dex[d.id] || 0) + 1);
    s.ship.drift[k] = { at: now + FAR_MIN + rng() * FAR_SPAN, id: null };
    return out;
  }
  function farItem(id) { return farById(id); }
  // picked common finds go on the order board (posted by whoever asks for 섬 things)
  function farOrders(s, out) {
    if (!farOk(s)) return;
    FAR_DRIFT.forEach(function (d) { if (!driftConditional(d) && d.rarity === '흔함' && s.ship.dex[d.id]) out.push({ id: d.id, w: 1 }); });
  }
  function farDexCount(s) { var n = 0; if (s.ship) FAR_DRIFT.forEach(function (d) { if (s.ship.dex[d.id]) n++; }); return n; }

  // ---------- save: called by decode() after decodeIsland (absent in older saves) ----------
  function decodeShip(o, s) {
    var q = o.ship;
    if (!q || typeof q !== 'object' || Array.isArray(q) || !isleOk(s)) return;
    if (q.t !== 1 && q.t !== 2) return;
    var num = function (x) { return typeof x === 'number' && isFinite(x); };
    var drift = [];
    for (var k = 0; k < FAR_N; k++) {
      var p = Array.isArray(q.drift) ? q.drift[k] : null;
      drift.push(p && typeof p === 'object' ? { at: num(p.at) ? p.at : 0, id: farById(p.id) ? p.id : null } : { at: 0, id: null });
    }
    var dex = {};
    if (q.dex && typeof q.dex === 'object') FAR_DRIFT.forEach(function (d) {
      if (num(q.dex[d.id]) && q.dex[d.id] > 0) dex[d.id] = Math.min(1e6, Math.floor(q.dex[d.id]));
    });
    s.ship = { t: q.t, drift: drift, dex: dex };
    shipOpen(s, q.t);
    if (typeof o.spot === 'string' && SHIP_TIERS.some(function (t) { return t.spot === o.spot; }) && spotUnlocked(s, o.spot)) s.spot = o.spot;
  }

  expose({
    SHIP_TIERS: SHIP_TIERS, SHIP_FISH: SHIP_FISH, OFFSHORE_FISH: OFFSHORE_FISH, OCEAN_FISH: OCEAN_FISH,
    FAR_DRIFT: FAR_DRIFT, FAR_N: FAR_N, FAR_MIN: FAR_MIN, FAR_SPAN: FAR_SPAN,
    shipTier: shipTier, shipNext: shipNext, shipMissing: shipMissing, shipStatus: shipStatus, upgradeShip: upgradeShip,
    farOk: farOk, farById: farById, farWeight: farWeight, tickFar: tickFar, farSpots: farSpots, farNextAt: farNextAt,
    pickFar: pickFar, farItem: farItem, farOrders: farOrders, farDexCount: farDexCount, decodeShip: decodeShip
  });
