  // ---------- 계절 축제 (stage 5B) ----------
  // One festival per game season. A season is one real week from local Monday 00:00 (clock.js), and the festival is
  // that week's Wednesday 10:00–18:00 local: inside office hours, the same for everyone in a time zone, and back
  // 4 weeks later if missed. Pure: now + tzMin (minutes east of UTC) in, nothing read from the machine.
  var FEST_DAY = 2, FEST_FROM = 10, FEST_TO = 18;       // Wednesday (Monday = 0), local hours
  var FEST_GIFT_COINS = 300;                             // a repeat visit's gift once the festival decoration is owned
  var FESTIVALS = {
    spring: { id: 'spring', name: '벚꽃 축제',     deco: 'sakura',     fish: 'blossomcarp', desc: '꽃잎이 흩날린다 · 벚꽃 붕어가 문다' },
    summer: { id: 'summer', name: '밤 불꽃놀이',   deco: 'firelamp',   fish: 'sparkfish',   desc: '게임 밤마다 불꽃이 터진다 · 불꽃 송사리' },
    autumn: { id: 'autumn', name: '보름달 달맞이', deco: 'moonrabbit', fish: 'moonfish',    desc: '밤하늘에 큰 보름달 · 송편을 배운다', recipe: 'songpyeon' },
    winter: { id: 'winter', name: '눈사람 만들기', deco: 'snowman',    fish: 'snowsmelt',   desc: '마당에 눈사람을 만들고 꾸민다 · 눈꽃 빙어' }
  };
  // festival-only fish: 연못 (always open), `fest` = only while that festival is on (fishEnvOk), never on the order board
  [
    { id: 'blossomcarp', name: '벚꽃 붕어',   rarity: '축제', w: 26, min: 15, max: 32, power: 1.1, price: 260, fest: 'spring', hint: '벚꽃 축제 날에만 연못에서' },
    { id: 'sparkfish',   name: '불꽃 송사리', rarity: '축제', w: 30, min: 4,  max: 9,  power: 0.9, price: 220, fest: 'summer', hint: '불꽃놀이 날 · 축제 내내 반짝인다' },
    { id: 'moonfish',    name: '달빛 잉어',   rarity: '축제', w: 22, min: 35, max: 80, power: 1.5, price: 420, fest: 'autumn', hint: '보름달 축제 날 · 축제 내내 떠오른다' },
    { id: 'snowsmelt',   name: '눈꽃 빙어',   rarity: '축제', w: 28, min: 8,  max: 16, power: 0.9, price: 240, fest: 'winter', hint: '눈사람 축제 날 얼음 밑에서' }
  ].forEach(function (f) { FISH.push(f); });
  [
    { id: 'sakura',     name: '벚나무',      cost: 0, merchant: true, from: 'fest', sz: [26, 40] },
    { id: 'firelamp',   name: '불꽃 등롱',   cost: 0, merchant: true, from: 'fest', sz: [10, 22] },
    { id: 'moonrabbit', name: '달토끼 석상', cost: 0, merchant: true, from: 'fest', sz: [14, 18] },
    { id: 'snowman',    name: '눈사람',      cost: 0, merchant: true, from: 'fest', sz: [16, 24] }
  ].forEach(function (d) { DECOS.push(d); });
  RECIPES.push({ id: 'songpyeon', name: '송편', need: ['potato', 'corn', 'berry'], time: 360e3, sell: 950, festival: 'autumn' });
  // festival orders: themed things you can get any time, so an order left over after the day can still be filled
  var FEST_ORDER = {
    spring: ['jeon', 'saengchae', 'berry'],
    summer: ['hwachae', 'melon', 'friedfish'],
    autumn: ['songpyeon', 'hobakjuk', 'pumpkin'],
    winter: ['maeuntang', 'corn', 'jjim']
  };
  var FEST_ORDER_W = 12, FEST_ORDER_MULT = 2;
  var SNOW_STYLES = ['양동이 모자', '목도리', '나뭇가지 팔', '당근 코'];

  // the festival window of the season-week that contains now: { id, start, end } in UTC ms
  function festWeek(now, tzMin) {
    var off = (tzMin || 0) * 60e3, t = now + off;
    var week = Math.floor((t - MON0) / WEEK_MS);
    var start = MON0 + week * WEEK_MS + FEST_DAY * 86400e3 + FEST_FROM * HOUR_MS - off;
    return { id: SEASONS[((week % 4) + 4) % 4], start: start, end: start + (FEST_TO - FEST_FROM) * HOUR_MS };
  }
  function festivalAt(now, tzMin) { var w = festWeek(now, tzMin); return now >= w.start && now < w.end ? w : null; }
  function festivalId(now, tzMin) { var w = festivalAt(now, tzMin); return w ? w.id : null; }
  // the one on now, or the next to come (this week's if it hasn't started, else next week's)
  function nextFestival(now, tzMin) {
    var w = festWeek(now, tzMin);
    if (now < w.end) return w;
    return festWeek(w.start + WEEK_MS, tzMin);
  }
  // when festival id comes next (it may be on right now)
  function festivalNextOf(id, now, tzMin) {
    var w = nextFestival(now, tzMin);
    for (var k = 0; k < 4 && w.id !== id; k++) w = festWeek(w.start + WEEK_MS, tzMin);
    return w;
  }

  function festOf(s) { if (!s.fest) s.fest = { on: null, got: {}, rec: {}, snow: 0 }; return s.fest; }
  // called by the UI tick: remembers which festival is on (orders read it); older saves get s.fest only once one starts
  function festTick(s, now, tzMin, override) {
    var id = override !== undefined ? override : festivalId(now, tzMin);
    if (!s.fest && !id) return null;
    festOf(s).on = id || null;
    return s.fest.on;
  }
  function festLearned(s, id) { return !!(s.fest && s.fest.rec[id]); }
  // 축제 선물: once per festival day. First time the festival's decoration (and 송편), later visits some coins.
  // w = the current window (festivalAt or an FF override). Outside a festival nothing is given.
  function festClaimable(s, w) { return !!w && !(s.fest && s.fest.got[w.id] === w.start); }
  function festClaim(s, w) {
    if (!festClaimable(s, w)) return null;
    var f = FESTIVALS[w.id], st = festOf(s), out = { id: w.id, coins: 0 };
    st.got[w.id] = w.start;
    if (f.recipe && !st.rec[f.recipe]) { st.rec[f.recipe] = true; out.recipe = f.recipe; }
    var g = grantDeco(s, f.deco);
    if (g.ok) { out.deco = f.deco; out.stored = g.stored; }
    else { s.coins += FEST_GIFT_COINS; out.coins = FEST_GIFT_COINS; }
    return out;
  }
  // 눈사람 꾸미기: each tap puts on the next thing (s.fest.snow = how many of SNOW_STYLES it wears), then back to bare
  function snowmanStyle(s) {
    if (!(s.yard && s.yard.deco.snowman)) return -1;
    var st = festOf(s); st.snow = (st.snow + 1) % (SNOW_STYLES.length + 1); return st.snow;
  }
  // order-board hooks (basket.js): festival items join the pool and pay more while a festival is on
  function festPool(s, out) {
    var on = s.fest && s.fest.on;
    if (!on) return;
    FEST_ORDER[on].forEach(function (id) {
      var r = recipeById(id);
      if ((r ? s.dex.dish[id] || r.festival : true) && obtainable(s, id) && !seasonalItem(id)) out.push({ id: id, w: FEST_ORDER_W });
    });
  }
  function festMark(s, o) {
    var on = s.fest && s.fest.on;
    if (!on || o.special || FEST_ORDER[on].indexOf(o.id) < 0) return o;
    o.fest = on; o.reward = Math.round(o.reward * FEST_ORDER_MULT); o.rep += 1;
    return o;
  }

  // ---------- save: called by decode() just before it returns ----------
  function decodeFest(o, s) {
    var q = o.fest;
    if (!q || typeof q !== 'object' || Array.isArray(q)) return;
    var st = festOf(s);
    if (q.got && typeof q.got === 'object') Object.keys(FESTIVALS).forEach(function (id) {
      if (typeof q.got[id] === 'number' && isFinite(q.got[id])) st.got[id] = q.got[id];
    });
    if (q.rec && typeof q.rec === 'object') RECIPES.forEach(function (r) { if (r.festival && q.rec[r.id] === true) st.rec[r.id] = true; });
    if (typeof q.snow === 'number' && isFinite(q.snow)) st.snow = Math.max(0, Math.floor(q.snow)) % (SNOW_STYLES.length + 1);
  }

  expose({
    FESTIVALS: FESTIVALS, FEST_DAY: FEST_DAY, FEST_FROM: FEST_FROM, FEST_TO: FEST_TO, FEST_GIFT_COINS: FEST_GIFT_COINS,
    FEST_ORDER: FEST_ORDER, FEST_ORDER_MULT: FEST_ORDER_MULT, SNOW_STYLES: SNOW_STYLES,
    festWeek: festWeek, festivalAt: festivalAt, festivalId: festivalId, nextFestival: nextFestival, festivalNextOf: festivalNextOf,
    festOf: festOf, festTick: festTick, festLearned: festLearned, festClaimable: festClaimable, festClaim: festClaim,
    snowmanStyle: snowmanStyle, festPool: festPool, festMark: festMark, decodeFest: decodeFest
  });
