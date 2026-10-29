  // ---------- stage 8 ①: 입질 폭풍 / 대풍년, 오늘의 날, 자리 비운 사이 일기 ----------
  // Booms: the real clock is cut into BOOM_BLOCK blocks; a block may hold one 3–5 minute window (seeded by the block
  // number, so everyone sees the same schedule and tests can find them). Nothing is lost by missing one.
  var BOOM_BLOCK = 3 * 3600e3, BOOM_P = 0.9, BOOM_MIN = 3 * 60e3, BOOM_SPAN = 2 * 60e3;
  var BOOM_RARE_MUL = 4, BOOM_WAIT_MUL = 0.5, BOOM_FARM_EXTRA = 3, BOOM_FOREST_EXTRA = 3, BOOM_ORCHARD_MUL = 2;
  var BOOM_NAME = { storm: '입질 폭풍', harvest: '대풍년' };
  var BOOM_PLACES = { storm: ['pond', 'river', 'sea', 'island'], harvest: ['farm', 'orchard', 'forest'] };
  var BOOM_PLACE_NAME = { pond: '연못', river: '강', sea: '바다', island: '섬', farm: '밭', orchard: '과수원', forest: '숲' };

  function seedRng(a) {
    a = a | 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function boomInBlock(b) {
    var r = seedRng(Math.imul(b, 0x2545F491) ^ 0x51ab);
    if (r() >= BOOM_P) return null;
    var len = BOOM_MIN + Math.floor(r() * (BOOM_SPAN / 60e3 + 1)) * 60e3;
    var start = b * BOOM_BLOCK + Math.floor(r() * (BOOM_BLOCK - len) / 60e3) * 60e3;
    return { kind: r() < 0.5 ? 'storm' : 'harvest', pick: r(), start: start, end: start + len };
  }
  // the raw window on at now (place not chosen yet), or null
  function boomAt(now) {
    var w = boomInBlock(Math.floor(now / BOOM_BLOCK));
    return w && now >= w.start && now < w.end ? w : null;
  }
  // the window on now or the next one to start
  function boomNext(now) {
    for (var b = Math.floor(now / BOOM_BLOCK), k = 0; k < 32; k++, b++) {
      var w = boomInBlock(b);
      if (w && w.end > now) return w;
    }
    return null;
  }
  var boomForced = null;   // FF test hook: { kind, place?, start, end } or null
  function boomForce(w) { boomForced = w || null; }
  function boomPlaceOpen(s, p) {
    if (p === 'river' || p === 'sea') return spotUnlocked(s, p);
    if (p === 'island') return isleOk(s);
    if (p === 'orchard') return orchardOk(s);
    if (p === 'forest') return forestOk(s);
    return true;
  }
  // the boom this player gets now: its place is one of the places they have open
  function boomFor(s, now) {
    var w = boomForced && now >= boomForced.start && now < boomForced.end ? boomForced : boomAt(now);
    if (!w) return null;
    var list = BOOM_PLACES[w.kind].filter(function (p) { return boomPlaceOpen(s, p); });
    if (w.place && list.indexOf(w.place) >= 0) list = [w.place];
    if (!list.length) return null;
    return { kind: w.kind, place: list[Math.floor((w.pick || 0) * list.length) % list.length], start: w.start, end: w.end };
  }
  // fishing reads the boom from env (the UI puts boomFor there), so pure tests can pass one in
  function stormOn(s, env) { return !!(env && env.boom && env.boom.kind === 'storm' && env.boom.place === curSpot(s)); }
  // extra pieces a 대풍년 adds to a harvest of n at place
  function boomExtra(s, place, now, n) {
    var b = boomFor(s, now);
    if (!b || b.kind !== 'harvest' || b.place !== place) return 0;
    return place === 'orchard' ? Math.ceil((n || 1) * BOOM_ORCHARD_MUL) : place === 'forest' ? BOOM_FOREST_EXTRA : BOOM_FARM_EXTRA;
  }

  // ---------- 오늘의 날: one modifier per real day (local date key 'YYYY-MM-DD') ----------
  // Each run of DAYS.length days shows every modifier once, in a seeded order. Effects live where the rule lives
  // (fishing.js, spots.js, farm.js, basket.js, visitors.js, pets.js, forest.js, cave.js, ui/bugs.js) via dayIs().
  var DAY_BIG_POW = 0.5, DAY_BITE_MUL = 0.4, DAY_ORDER_MUL = 3, DAY_RARE_MUL = 4, DAY_GOLD_MUL = 2, DAY_VISIT_MUL = 0.5, DAY_BUG_MUL = 0.5;
  var DAYS = [
    { id: 'bigfish',  name: '큰 물고기의 날',   desc: '오늘은 물고기가 크게 자랐다',        how: '낚는 물고기 크기 ↑' },
    { id: 'bite',     name: '입질 좋은 날',     desc: '찌가 금방 들어간다',                how: '입질까지 기다림 ×' + DAY_BITE_MUL },
    { id: 'fogfish',  name: '안개 낚시의 날',   desc: '안개 물고기가 맑은 날에도 문다',     how: '안개에만 나오는 물고기가 날씨와 상관없이' },
    { id: 'rainfish', name: '빗소리의 날',      desc: '비 물고기가 비 없이도 문다',         how: '비에만 나오는 물고기가 날씨와 상관없이' },
    { id: 'cats',     name: '고양이 잔치',      desc: '손님이 평소보다 자주 온다',          how: '손님 오는 간격 ×' + DAY_VISIT_MUL },
    { id: 'market',   name: '장날',             desc: '오늘의 품목이 두 배 값',             how: '오늘의 품목을 거두거나 낚으면 값 ×2' },
    { id: 'orders',   name: '단골 손님의 날',   desc: '주문 보상이 넉넉하다',               how: '납품 코인 ×' + DAY_ORDER_MUL },
    { id: 'gold',     name: '황금 씨앗의 날',   desc: '딸기·수박 교배가 잘 된다',           how: '황금 씨앗 확률 ×' + DAY_GOLD_MUL },
    { id: 'forage',   name: '채집 운 좋은 날',  desc: '숲에 귀한 것이 잘 돋는다',           how: '숲 드문 것 이상 ×' + DAY_RARE_MUL },
    { id: 'gem',      name: '반짝이는 동굴의 날', desc: '바위 속 보석이 잘 보인다',         how: '동굴 보석 ×' + DAY_RARE_MUL },
    { id: 'pet',      name: '반려동물 신난 날', desc: '반려동물이 선물을 하나 더 물어 온다', how: '반려동물 선물 하루 +1' },
    { id: 'bugs',     name: '곤충 잔치',        desc: '곤충이 자주 날아든다',               how: '곤충 오는 간격 ×' + DAY_BUG_MUL }
  ];
  var MARKET = ['radish', 'berry', 'melon', 'minnow', 'crucian', 'catfish'];
  var DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  function dayNum(key) {
    var m = DAY_RE.exec(String(key));
    return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400e3) : 0;
  }
  function dayMod(key) {
    var d = dayNum(key), n = DAYS.length, c = Math.floor(d / n), r = seedRng(strHash('day:' + c)), o = [];
    for (var k = 0; k < n; k++) o.push(k);
    for (k = n - 1; k > 0; k--) { var j = Math.floor(r() * (k + 1)), t = o[k]; o[k] = o[j]; o[j] = t; }
    return DAYS[o[((d % n) + n) % n]];
  }
  function dayById(id) { for (var k = 0; k < DAYS.length; k++) if (DAYS[k].id === id) return DAYS[k]; return null; }
  // the modifier in effect for this save (s.day.f = FF test override), or null before the first day is set
  function dayId(s) { return s && s.day ? (s.day.f && dayById(s.day.f) ? s.day.f : dayMod(s.day.key).id) : null; }
  function dayIs(s, id) { return dayId(s) === id; }
  // a new key → true (the UI shows the day card once)
  function ensureDay(s, key) {
    if (s.day && s.day.key === key) return false;
    s.day = { key: key };
    return true;
  }
  function marketItem(key) { return MARKET[strHash('market:' + key) % MARKET.length]; }
  function marketMul(s, id) { return dayIs(s, 'market') && id === marketItem(s.day.key) ? 2 : 1; }

  // ---------- 자리 비운 사이 일기 ----------
  // The UI snaps the state before and after the offline catch-up (the first tick) and passes both here: the lines only
  // describe differences that catch-up really made, plus the shared sky over the time away.
  var DIARY_AWAY = 30 * 60e3, DIARY_KEEP = 7;
  function diarySnap(s, now, tzMin) {
    var met = 0;
    if (s.yard) Object.keys(s.yard.met).forEach(function (k) { met += s.yard.met[k]; });
    return {
      ready: s.plots.filter(isReady).length, prod: productsWaiting(s), fruit: fruitWaiting(s), honey: honeyWaiting(s),
      forage: forageReady(s), met: met, gifts: s.yard ? s.yard.gifts.length : 0, coins: s.coins,
      petGift: s.pet ? petGiftReady(s, now, tzMin) : false
    };
  }
  function jo(w, a, b) { var c = w.charCodeAt(w.length - 1) - 0xAC00; return w + (c >= 0 && c < 11172 && c % 28 ? a : b); }
  function awayText(ms) {
    var m = Math.floor(ms / 60e3), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
    return d ? d + '일' + (h ? ' ' + h + '시간' : '') : h ? h + '시간' + (mm ? ' ' + mm + '분' : '') : mm + '분';
  }
  // minutes of each weather between a and b (the last week at most)
  function skyMinutes(a, b, tzMin) {
    var out = { clear: 0, rain: 0, fog: 0, snow: 0 };
    a = Math.max(a, b - 7 * 86400e3);
    for (var k = Math.floor(a / WEATHER_MS); k * WEATHER_MS < b; k++) {
      var lo = Math.max(a, k * WEATHER_MS), hi = Math.min(b, (k + 1) * WEATHER_MS);
      if (hi > lo) out[weatherAt(k * WEATHER_MS, tzMin)] += (hi - lo) / 60e3;
    }
    return out;
  }
  function diaryLines(a, b, ctx) {
    var out = [awayText(ctx.to - ctx.from) + ' 동안 자리를 비웠다.'], more = [];
    var d = function (k) { return Math.max(0, (b[k] || 0) - (a[k] || 0)); };
    if (d('ready')) more.push('밭에서 작물 ' + d('ready') + '개가 다 자랐다.');
    if (d('prod')) more.push('동물들이 산물 ' + d('prod') + '개를 내놓았다.');
    if (d('fruit')) more.push('나무에 열매 ' + d('fruit') + '개가 익었다.');
    if (d('honey')) more.push('벌통에 꿀 ' + d('honey') + '병이 찼다.');
    if (d('forage')) more.push('숲에 채집물 ' + d('forage') + '개가 돋았다.');
    if (d('met')) more.push('손님 ' + d('met') + '명이 다녀갔다.');
    if (d('gifts')) more.push('문 앞에 선물 ' + d('gifts') + '개가 놓였다.');
    if (d('coins')) more.push('넘친 바구니에서 ' + d('coins') + '코인어치가 팔렸다.');
    if (ctx.pet && ctx.petGift) more.push(jo(ctx.pet, '이', '가') + ' 선물을 물어다 놓았다.');
    out = out.concat(more.slice(0, 3));
    var sky = skyMinutes(ctx.from, ctx.to, ctx.tzMin), wet = sky.rain >= sky.snow ? 'rain' : 'snow';
    if (sky[wet] >= 1) out.push((wet === 'rain' ? '비가 ' : '눈이 ') + Math.round(sky[wet]) + '분쯤 내렸다.');
    else if (sky.fog >= 1) out.push('안개가 끼었다가 걷혔다.');
    else out.push('하늘은 내내 맑았다.');
    if (out.length < 3) out.push('농장은 조용히 기다리고 있었다.');
    return out;
  }
  function diaryMake(s, a, b, ctx) {
    if (!(ctx.to - ctx.from >= DIARY_AWAY)) return null;
    var e = { t: ctx.to, lines: diaryLines(a, b, ctx) };
    s.diary = (s.diary || []).concat([e]).slice(-DIARY_KEEP);
    return e;
  }

  // ---------- save: called by decode() ----------
  function decodeStage8A(o, s) {
    if (o.day && typeof o.day === 'object' && DAY_RE.test(o.day.key)) s.day = { key: o.day.key };
    if (Array.isArray(o.diary)) {
      var l = o.diary.filter(function (e) {
        return e && typeof e.t === 'number' && isFinite(e.t) && Array.isArray(e.lines) && e.lines.length <= 8 &&
          e.lines.every(function (x) { return typeof x === 'string' && x.length <= 80; });
      }).slice(-DIARY_KEEP).map(function (e) { return { t: e.t, lines: e.lines.slice() }; });
      if (l.length) s.diary = l;
    }
  }

  expose({
    BOOM_BLOCK: BOOM_BLOCK, BOOM_MIN: BOOM_MIN, BOOM_SPAN: BOOM_SPAN, BOOM_RARE_MUL: BOOM_RARE_MUL, BOOM_WAIT_MUL: BOOM_WAIT_MUL,
    BOOM_FARM_EXTRA: BOOM_FARM_EXTRA, BOOM_FOREST_EXTRA: BOOM_FOREST_EXTRA, BOOM_ORCHARD_MUL: BOOM_ORCHARD_MUL,
    BOOM_NAME: BOOM_NAME, BOOM_PLACES: BOOM_PLACES, BOOM_PLACE_NAME: BOOM_PLACE_NAME,
    boomAt: boomAt, boomNext: boomNext, boomForce: boomForce, boomFor: boomFor, stormOn: stormOn, boomExtra: boomExtra,
    DAYS: DAYS, MARKET: MARKET, DAY_ORDER_MUL: DAY_ORDER_MUL, DAY_BUG_MUL: DAY_BUG_MUL,
    dayMod: dayMod, dayById: dayById, dayId: dayId, dayIs: dayIs, ensureDay: ensureDay, marketItem: marketItem, marketMul: marketMul,
    DIARY_AWAY: DIARY_AWAY, DIARY_KEEP: DIARY_KEEP, diarySnap: diarySnap, diaryLines: diaryLines, diaryMake: diaryMake,
    decodeStage8A: decodeStage8A
  });
