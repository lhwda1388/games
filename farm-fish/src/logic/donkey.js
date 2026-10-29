  // ---------- 당나귀 (stage 9 ②): bought like a yard animal, petted and fed for 친밀도, rides to 깊은 숲 and 산꼭대기 ----------
  // s.donkey = { name, at, f, day, pn, fn, deep: [spot], peak: [spot] } (absent until bought; spots made on the first ride).
  // Real-day counters (tzMin = minutes east of UTC) reset at local midnight, as for the 반려동물.
  // 깊은 숲·산꼭대기 finds live in FORAGE with place 'deep' / 'peak' (forageWeight keeps them out of the plain 숲),
  // so the 도감, basket and recipes treat them like any forage. Their counts go in s.forest.dex (the 숲 must be open).
  var DONKEY_COST = 8000, DONKEY_REP = 12, DONKEY_DEF = '당근이';
  var DONKEY_LV = [6, 18, 36];                         // 친밀도 for levels 1..3
  var DEEP_LV = 1, LOAD_LV = 2, PEAK_LV = 3, DONKEY_BAG = 3;
  var DONKEY_ACTS = ['마당에서 풀 뜯기', '깊은 숲까지 태워 준다', '짐 싣기 · 바구니 +' + DONKEY_BAG + '칸', '산꼭대기까지 태워 준다'];
  var DONKEY_PETS_DAY = 2, DONKEY_FEEDS_DAY = 1, DONKEY_FEED_F = 2;
  var DONKEY_FOOD = ['radish', 'potato', 'corn', 'apple', 'pear', 'pumpkin'];   // what it eats, first kind found goes first
  var RIDE_N = { deep: 4, peak: 3 };
  var RIDE_PLACES = { deep: '깊은 숲', peak: '산꼭대기' };

  // finds: same shape as FORAGE (+ place). Every season/time has at least one (the plain ones).
  [
    { id: 'mossclump',   name: '이끼 덩이',   cat: 'misc',   rarity: '흔함', price: 30,  place: 'deep', hint: '깊은 숲 · 바위마다 폭신한 이끼' },
    { id: 'gomchwi',     name: '곰취',       cat: 'green',  rarity: '흔함', price: 70,  place: 'deep', season: ['spring', 'summer'], hint: '깊은 숲 봄여름 · 곰 발바닥만 한 잎' },
    { id: 'myeongi',     name: '산마늘',     cat: 'green',  rarity: '드묾', price: 150, place: 'deep', season: ['spring'], hint: '깊은 숲 이른 봄 · 마늘 향 나는 넓은 잎' },
    { id: 'flowermush',  name: '꽃송이버섯', cat: 'mush',   rarity: '드묾', price: 260, place: 'deep', season: ['summer', 'autumn'], hint: '깊은 숲 · 하얀 꽃다발 같은 버섯' },
    { id: 'bokryeong',   name: '복령',       cat: 'herb',   rarity: '드묾', price: 220, place: 'deep', wet: true, hint: '깊은 숲 · 비 온 뒤 소나무 뿌리 곁' },
    { id: 'eureum',      name: '으름',       cat: 'nut',    rarity: '드묾', price: 180, place: 'deep', season: ['autumn'], hint: '깊은 숲 가을 · 덩굴에 매달린 바나나' },
    { id: 'owlfeather',  name: '부엉이 깃털', cat: 'misc',  rarity: '흔함', price: 45,  place: 'deep', phase: ['evening', 'night'], hint: '깊은 숲 저녁 · 부엉부엉 우는 쪽에' },
    { id: 'cheonma',     name: '천마',       cat: 'rare',   rarity: '희귀', price: 1200, place: 'deep', phase: ['night'], hint: '깊은 숲 밤 · 잎 없는 신비한 뿌리' },
    { id: 'flatstone',   name: '납작 돌',     cat: 'misc',   rarity: '흔함', price: 15,  place: 'peak', hint: '산꼭대기 · 돌탑에 얹기 좋은 돌' },
    { id: 'bawisol',     name: '바위솔',     cat: 'herb',   rarity: '드묾', price: 160, place: 'peak', hint: '산꼭대기 · 바위 틈의 작은 솔방울 풀' },
    { id: 'gujeolcho',   name: '산구절초',   cat: 'flower', rarity: '흔함', price: 50,  place: 'peak', season: ['autumn'], hint: '산꼭대기 가을 · 바람에 흔들리는 흰 꽃' },
    { id: 'somdari',     name: '솜다리',     cat: 'flower', rarity: '희귀', price: 700, place: 'peak', season: ['summer'], hint: '산꼭대기 여름 · 솜털 덮인 별 모양 꽃' },
    { id: 'rime',        name: '상고대',     cat: 'misc',   rarity: '흔함', price: 35,  place: 'peak', season: ['winter'], phase: ['morning'], hint: '산꼭대기 겨울 아침 · 나뭇가지의 얼음꽃' },
    { id: 'clouddew',    name: '구름 이슬',   cat: 'misc',   rarity: '드묾', price: 140, place: 'peak', phase: ['morning'], hint: '산꼭대기 아침 · 구름이 놓고 간 이슬' },
    { id: 'stardust',    name: '별가루 돌',   cat: 'rare',   rarity: '희귀', price: 800, place: 'peak', phase: ['night'], hint: '산꼭대기 밤 · 별빛이 내려앉은 돌' }
  ].forEach(function (f) { FORAGE.push(f); FORAGE_BY[f.id] = f; });

  // insects only up here
  BUG_PLACES.deep = RIDE_PLACES.deep; BUG_PLACES.peak = RIDE_PLACES.peak;
  [
    { id: 'stickinsect', name: '대벌레',       rarity: '흔함', price: 30,  season: ['summer', 'autumn'], at: ['deep'], hint: '깊은 숲 · 나뭇가지인 척하는 녀석' },
    { id: 'mtswallow',   name: '산제비나비',   rarity: '드묾', price: 120, season: ['spring', 'summer'], phase: ['morning', 'day'], wx: 'dry', at: ['deep'], hint: '깊은 숲 봄여름 · 푸른빛 도는 큰 날개' },
    { id: 'giantstag',   name: '왕사슴벌레',   rarity: '희귀', price: 400, season: ['summer'], phase: ['evening', 'night'], at: ['deep'], hint: '깊은 숲 여름밤 · 숲에서 가장 큰 턱' },
    { id: 'giantlonghorn', name: '장수하늘소', rarity: '전설', price: 900, season: ['summer'], phase: ['day'], at: ['deep'], hint: '깊은 숲 여름 낮 · 아주아주 드물게' },
    { id: 'apollo',      name: '붉은점모시나비', rarity: '희귀', price: 500, season: ['spring', 'summer'], phase: ['day'], wx: 'clear', at: ['peak'], hint: '산꼭대기 · 맑은 날 하얀 날개에 붉은 점' },
    { id: 'alpinedrag',  name: '산잠자리',     rarity: '드묾', price: 90,  season: ['summer', 'autumn'], phase: ['day', 'evening'], at: ['peak'], hint: '산꼭대기 여름가을 · 바람 타고 맴돈다' },
    { id: 'rockhopper',  name: '팥중이',       rarity: '흔함', price: 25,  season: ['summer', 'autumn'], phase: ['morning', 'day'], at: ['peak'], hint: '산꼭대기 · 바위 위에서 톡 튀는 메뚜기' }
  ].forEach(function (b) { BUGS.push(b); BUG_BY[b.id] = b; });

  // constellations seen only from the summit (all year; starFor(..., peak) offers them)
  [
    { id: 'draco',    name: '용자리',         peak: true, pts: [[85, 15], [70, 25], [55, 20], [40, 32], [45, 50], [30, 65], [15, 70], [20, 85]], path: [0, 1, 2, 3, 4, 5, 6, 7], hint: '산꼭대기 · 북쪽 하늘을 휘감은 용' },
    { id: 'corona',   name: '북쪽왕관자리',   peak: true, pts: [[15, 40], [28, 58], [45, 66], [62, 64], [76, 54], [86, 38]], path: [0, 1, 2, 3, 4, 5], hint: '산꼭대기 · 반쯤 둥근 보석 왕관' },
    { id: 'pleiades', name: '좀생이별',       peak: true, pts: [[40, 30], [55, 26], [62, 40], [50, 48], [36, 46], [70, 58], [48, 64]], path: [0, 1, 2, 3, 4, 0, null, 3, 5, null, 3, 6], hint: '산꼭대기 · 오종종 모인 작은 별 무리' },
    { id: 'hercules', name: '헤르쿨레스자리', peak: true, pts: [[35, 35], [60, 32], [62, 55], [38, 58], [15, 15], [85, 12], [20, 85], [80, 88]], path: [4, 0, 1, 2, 3, 0, null, 1, 5, null, 3, 6, null, 2, 7], hint: '산꼭대기 · 가운데 네모와 뻗은 팔다리' }
  ].forEach(function (c) { STARS.push(c); STAR_BY[c.id] = c; });

  // ---------- the donkey ----------
  function donkeyLevel(s) {
    var f = s.donkey ? s.donkey.f : 0, lv = 0;
    while (lv < DONKEY_LV.length && f >= DONKEY_LV[lv]) lv++;
    return lv;
  }
  function donkeyStatus(s) { return s.donkey ? 'have' : s.rep < DONKEY_REP ? 'rep' : s.coins < DONKEY_COST ? 'coins' : 'ok'; }
  function buyDonkey(s, name, now) {
    var st = donkeyStatus(s);
    if (st !== 'ok') return { ok: false, why: st };
    s.coins -= DONKEY_COST;
    s.donkey = { name: cleanPetName(name) || DONKEY_DEF, at: now, f: 0, day: -1, pn: 0, fn: 0 };
    return { ok: true, name: s.donkey.name };
  }
  function renameDonkey(s, name) {
    var n = cleanPetName(name);
    if (!s.donkey || !n) return null;
    s.donkey.name = n; return n;
  }
  function donkeyRoll(d, now, tzMin) { var k = petDay(now, tzMin); if (d.day !== k) { d.day = k; d.pn = 0; d.fn = 0; } }
  function donkeyGain(s, n) {
    var before = donkeyLevel(s);
    s.donkey.f = Math.min(1e6, s.donkey.f + n);
    var lv = donkeyLevel(s);
    return { lv: lv, up: lv > before ? lv : 0 };
  }
  // 쓰다듬기: always welcome; 친밀도 only the first DONKEY_PETS_DAY times a day
  function donkeyPet(s, now, tzMin) {
    var d = s.donkey;
    if (!d) return null;
    donkeyRoll(d, now, tzMin);
    var gain = 0;
    if (d.pn < DONKEY_PETS_DAY) { d.pn++; gain = 1; }
    var r = donkeyGain(s, gain);
    return { gain: gain, lv: r.lv, up: r.up };
  }
  function donkeyFood(s) {
    for (var k = 0; k < DONKEY_FOOD.length; k++) if (bagCount(s, DONKEY_FOOD[k]) > 0) return DONKEY_FOOD[k];
    return null;
  }
  // 먹이: one food from the basket (bagTake: the cheapest of that kind), DONKEY_FEEDS_DAY a day; nothing taken when full/none
  function donkeyFeed(s, now, tzMin) {
    var d = s.donkey;
    if (!d) return null;
    donkeyRoll(d, now, tzMin);
    if (d.fn >= DONKEY_FEEDS_DAY) return { ok: false, why: 'full' };
    var id = donkeyFood(s);
    if (!id || !bagTake(s, id, 1)) return { ok: false, why: 'food' };
    d.fn++;
    var r = donkeyGain(s, DONKEY_FEED_F);
    return { ok: true, id: id, gain: DONKEY_FEED_F, lv: r.lv, up: r.up };
  }
  // 짐 싣기: basket.js bagCap adds this
  function donkeyBag(s) { return s.donkey && donkeyLevel(s) >= LOAD_LV ? DONKEY_BAG : 0; }

  // ---------- 깊은 숲 · 산꼭대기 ----------
  function rideLv(place) { return place === 'deep' ? DEEP_LV : place === 'peak' ? PEAK_LV : null; }
  function rideOk(s, place) { var lv = rideLv(place); return lv !== null && !!s.donkey && forestOk(s) && donkeyLevel(s) >= lv; }
  function rideSpots(s, place) {
    var d = s.donkey;
    if (!d[place]) { d[place] = []; for (var k = 0; k < RIDE_N[place]; k++) d[place].push({ at: 0, id: null }); }
    return d[place];
  }
  function rideEnv(env, place) { var e = {}; for (var k in env) e[k] = env[k]; e.place = place; return e; }
  // regrown spots get a find of that place under env; returns how many appeared
  function tickRide(s, place, now, env, rng) {
    if (!rideOk(s, place)) return 0;
    var e = rideEnv(env, place), n = 0;
    rideSpots(s, place).forEach(function (p) { if (!p.id && now >= p.at) { p.id = rollForage(e, rng, s); n++; } });
    return n;
  }
  function rideReady(s, place) { return s.donkey && s.donkey[place] ? s.donkey[place].filter(function (p) { return !!p.id; }).length : 0; }
  function rideNextAt(s, place) {
    var t = null;
    if (s.donkey && s.donkey[place]) s.donkey[place].forEach(function (p) { if (!p.id && (t === null || p.at < t)) t = p.at; });
    return t;
  }
  // pick spot k (won = optional 도전 succeeded, same rule as the 숲); null if nothing is there
  function pickRide(s, place, k, now, rng, won) {
    if (!rideOk(s, place)) return null;
    var p = rideSpots(s, place)[k];
    if (!p || !p.id) return null;
    var f = forageById(p.id), n = 1;
    if (won) n = f.rarity === '희귀' || f.rarity === '전설' ? (rng() < 0.5 ? 2 : 1) : 2;
    var sold = 0;
    for (var j = 0; j < n; j++) sold += bagAdd(s, f.id, f.price);
    forageNote(s, f.id, n);
    s.donkey[place][k] = { at: now + REGROW_MIN + rng() * REGROW_SPAN, id: null };
    return { id: f.id, n: n, sold: sold, won: !!won };
  }

  // ---------- save (absent in older saves) ----------
  function decodeDonkey(o, s) {
    var q = o.donkey;
    if (!q || typeof q !== 'object' || Array.isArray(q)) return;
    var num = function (x) { return typeof x === 'number' && isFinite(x); };
    var cnt = function (x, max) { return num(x) ? Math.max(0, Math.min(max, Math.floor(x))) : 0; };
    var d = { name: (typeof q.name === 'string' && cleanPetName(q.name)) || DONKEY_DEF, at: num(q.at) ? q.at : 0, f: cnt(q.f, 1e6),
      day: num(q.day) ? Math.floor(q.day) : -1, pn: cnt(q.pn, DONKEY_PETS_DAY), fn: cnt(q.fn, DONKEY_FEEDS_DAY) };
    ['deep', 'peak'].forEach(function (pl) {
      if (!Array.isArray(q[pl])) return;
      d[pl] = [];
      for (var k = 0; k < RIDE_N[pl]; k++) {
        var p = q[pl][k], f = p && typeof p === 'object' ? forageById(p.id) : null;
        d[pl].push({ at: p && num(p.at) ? p.at : 0, id: f && f.place === pl ? f.id : null });
      }
    });
    s.donkey = d;
  }

  expose({
    DONKEY_COST: DONKEY_COST, DONKEY_REP: DONKEY_REP, DONKEY_DEF: DONKEY_DEF, DONKEY_LV: DONKEY_LV, DONKEY_ACTS: DONKEY_ACTS,
    DEEP_LV: DEEP_LV, LOAD_LV: LOAD_LV, PEAK_LV: PEAK_LV, DONKEY_BAG: DONKEY_BAG, DONKEY_PETS_DAY: DONKEY_PETS_DAY,
    DONKEY_FEEDS_DAY: DONKEY_FEEDS_DAY, DONKEY_FEED_F: DONKEY_FEED_F, DONKEY_FOOD: DONKEY_FOOD, RIDE_N: RIDE_N, RIDE_PLACES: RIDE_PLACES,
    donkeyLevel: donkeyLevel, donkeyStatus: donkeyStatus, buyDonkey: buyDonkey, renameDonkey: renameDonkey, donkeyPet: donkeyPet,
    donkeyFood: donkeyFood, donkeyFeed: donkeyFeed, donkeyBag: donkeyBag, rideOk: rideOk, tickRide: tickRide, rideReady: rideReady,
    rideNextAt: rideNextAt, pickRide: pickRide, decodeDonkey: decodeDonkey
  });
