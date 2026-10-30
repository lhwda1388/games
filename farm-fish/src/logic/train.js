  // ---------- 기차 여행: 마을 간이역·포구 기차역 노선, 개통비와 하루 기차표, 산골 계곡 (s.train, made on the first 개통) ----------
  // A route is opened once (개통비). Riding needs that day's 기차표: one ticket covers its real (local) day, any number
  // of trips. A ticket bought on day d stays good while the clock reads d or up to TRN_FUTURE day earlier (a clock set back
  // never charges for the same day twice), and a new one is needed only when the day moves forward. A ticket more than TRN_FUTURE days
  // ahead was bought under a wrong clock: it no longer counts and a fresh one is sold for today.
  // s.train = { ok: { route: true }, tk: { route: local day }, pick: { route: [{ at, id }] }, dex: { item: n },
  //             bath?: { d: local day, until: ms } }  (bath: made by the first 온천욕)
  // tools/BALANCE.md 「기차 여행」 has the first values and 「기차 여행 조정」 says why they are what they are now.
  var TRN_REP = { valley: 8, onsen: 20 };                       // ★ to open
  var TRN_OPEN = { valley: 5000, onsen: 20000, snow: 50000 };   // 개통비, once
  var TRN_FARE = { valley: 500, onsen: 1000, snow: 2000 };      // 기차표, per real day
  var TRN_FUTURE = 1;                                           // days a ticket may lie ahead of the clock and still count
  // from = the station it leaves from; after = the route that must be open first; station = needs the 포구 기차역 repaired
  var TRN_ROUTES = [
    { id: 'valley', name: '산골 계곡', from: 'village', rep: TRN_REP.valley },
    { id: 'onsen', name: '온천 마을', from: 'village', rep: TRN_REP.onsen, after: 'valley' },
    { id: 'snow', name: '설원 고개', from: 'port', station: true, after: 'onsen' }
  ];

  // 산골 계곡 낚시터: opened by the route (rep Infinity: never bought at the signpost); fresh = 민물고기 on the 시세판
  SPOTS.valley = { id: 'valley', name: '산골 계곡', rep: Infinity, cost: 0, fresh: true };
  var TRN_VALLEY_FISH = [
    { id: 'beodeulchi', name: '버들치',   rarity: '흔함', w: 40, min: 6,  max: 15, power: 0.9, price: 70,   spot: 'valley', hint: '맑은 계곡 어디에나 · 떼로 몰려다닌다' },
    { id: 'kkeokji',    name: '꺽지',     rarity: '흔함', w: 30, min: 10, max: 22, power: 1.1, price: 120,  spot: 'valley', hint: '바위 밑에 숨었다가 덥석' },
    { id: 'eoreumchi',  name: '어름치',   rarity: '드묾', w: 18, min: 20, max: 40, power: 1.3, price: 380,  spot: 'valley', season: 'spring', hint: '봄 계곡 · 자갈로 알 탑을 쌓는다' },
    { id: 'dukjunggae', name: '둑중개',   rarity: '드묾', w: 18, min: 8,  max: 16, power: 1.0, price: 340,  spot: 'valley', phase: ['night'], hint: '밤이면 돌 틈에서 나온다 · 차가운 물만 좋아한다' },
    { id: 'molchi',     name: '금강모치', rarity: '희귀', w: 8,  min: 6,  max: 10, power: 1.4, price: 750,  spot: 'valley', phase: ['morning'], weather: 'clear', hint: '맑은 아침 · 계곡 가장 위 여울에' },
    { id: 'goldmandarin', name: '황쏘가리', rarity: '전설', w: 3, min: 30, max: 60, power: 2.15, price: 2400, spot: 'valley', weather: 'fog', hint: '안개 낀 계곡 깊은 소 · 금빛 비늘의 천연기념물' }
  ];
  // 온천 마을: a warm lake below the bath houses / 설원 고개: a frozen lake, fished through an ice hole
  SPOTS.onsen = { id: 'onsen', name: '온천 호수', rep: Infinity, cost: 0, fresh: true };
  SPOTS.snow = { id: 'snow', name: '설원 얼음 호수', rep: Infinity, cost: 0, fresh: true };
  var TRN_ONSEN_FISH = [
    { id: 'gaksi',      name: '각시붕어',   rarity: '흔함', w: 40, min: 4,  max: 8,  power: 0.8, price: 110,  spot: 'onsen', hint: '따뜻한 호수 어디에나 · 무지갯빛 혼인색' },
    { id: 'tteokbung',  name: '떡붕어',     rarity: '흔함', w: 30, min: 15, max: 35, power: 1.1, price: 160,  spot: 'onsen', hint: '김 오르는 물가 · 넉넉하게 큰다' },
    { id: 'dongjagae',  name: '동자개',     rarity: '드묾', w: 18, min: 12, max: 26, power: 1.2, price: 440,  spot: 'onsen', phase: ['evening', 'night'], hint: '해 지면 바닥에서 빠각빠각 운다' },
    { id: 'moraemuji',  name: '모래무지',   rarity: '드묾', w: 18, min: 10, max: 22, power: 1.0, price: 460,  spot: 'onsen', season: 'winter', hint: '겨울 · 따뜻한 모래 바닥에 숨는다' },
    { id: 'beodeulmae', name: '버들매치',   rarity: '희귀', w: 8,  min: 6,  max: 12, power: 1.3, price: 880,  spot: 'onsen', weather: 'rain', hint: '비 오는 날 · 온천물 흘러드는 어귀' },
    { id: 'mistcarp',   name: '물안개 잉어', rarity: '전설', w: 3, min: 50, max: 90, power: 2.0, price: 3200, spot: 'onsen', phase: ['morning'], weather: 'fog', hint: '안개 낀 아침 · 김과 안개 사이로 하얀 잉어가' }
  ];
  var TRN_SNOW_FISH = [
    { id: 'gondeul',     name: '곤들매기',   rarity: '흔함', w: 40, min: 12, max: 28, power: 1.1, price: 210,  spot: 'snow', hint: '얼음 밑 찬물 어디에나' },
    { id: 'stickleback', name: '가시고기',   rarity: '흔함', w: 30, min: 4,  max: 8,  power: 0.9, price: 180,  spot: 'snow', hint: '얼음 구멍 가까이 · 등가시를 세운다' },
    { id: 'rainbowtrout', name: '무지개송어', rarity: '드묾', w: 18, min: 25, max: 50, power: 1.5, price: 640, spot: 'snow', phase: ['morning'], hint: '아침 얼음 호수 · 옆구리에 분홍 띠' },
    { id: 'lamprey',     name: '칠성장어',   rarity: '드묾', w: 18, min: 30, max: 55, power: 1.4, price: 700,  spot: 'snow', phase: ['night'], hint: '밤 · 일곱 개 아가미 구멍' },
    { id: 'yeonjun',     name: '연준모치',   rarity: '희귀', w: 8,  min: 5,  max: 9,  power: 1.3, price: 1200, spot: 'snow', weather: 'snow', hint: '눈 오는 날 · 아주 차고 맑은 물에만' },
    { id: 'jachi',       name: '자치',       rarity: '전설', w: 3,  min: 70, max: 130, power: 2.0, price: 4200, spot: 'snow', phase: ['night'], weather: 'clear', hint: '맑은 밤 얼음 호수 · 커다란 연어과의 왕' }
  ];
  // 황쏘가리 gets a set 성격: the one temperOf() rolls from its id (버팀 → 질주) is far below the other legends at any 힘 ≥ 2
  TEMPER.goldmandarin = [D, ['run', 'jump']];
  TRN_VALLEY_FISH.concat(TRN_ONSEN_FISH, TRN_SNOW_FISH).forEach(function (f) { FISH.push(f); MUSEUM_ROOMS.fish.ids.push(f.id); });   // after museum.js: the fish room has every fish

  // 특산물: pick spots that regrow by real time (like the 숲); what grows next is rolled when a spot is picked
  var TRN_PICKS = [
    { id: 'vnamul', name: '산나물',   route: 'valley', w: 85, price: 70,  hint: '계곡 비탈 · 한 줌씩 다시 돋는다' },
    { id: 'vsongi', name: '송이버섯', route: 'valley', w: 15, price: 600, hint: '계곡 솔숲 · 가끔 귀하게' },
    { id: 'onegg',  name: '온천 달걀', route: 'onsen', w: 80, price: 120, hint: '온천 바위 틈 · 김에 익어 간다' },
    { id: 'oyuja',  name: '유자',     route: 'onsen', w: 20, price: 450, hint: '온천 마을 유자나무 · 가끔 노랗게' },
    { id: 'sice',   name: '얼음 결정', route: 'snow', w: 75, price: 160, hint: '설원 바위 · 밤새 다시 언다' },
    { id: 'sflake', name: '눈꽃',     route: 'snow', w: 25, price: 700, hint: '설원 가지 끝 · 녹기 전에' }
  ];
  var TRN_PICK_N = { valley: 3, onsen: 3, snow: 3 };                               // pick spots per route
  var TRN_REGROW_MIN = 20 * 60e3, TRN_REGROW_SPAN = 20 * 60e3;
  // 기념품: yard decorations, each bought once at that route's shop
  var TRN_SOUVENIRS = [
    { id: 'jangseung', name: '나무 장승', route: 'valley', cost: 8000,  sz: [10, 24] },
    { id: 'sotdae',    name: '솟대',     route: 'valley', cost: 6000,  sz: [9, 28] },
    { id: 'mulle',     name: '물레방아', route: 'valley', cost: 15000, sz: [22, 20] },
    { id: 'seokdeung', name: '돌 석등',   route: 'onsen', cost: 18000, sz: [12, 22] },
    { id: 'namutub',   name: '나무 욕조', route: 'onsen', cost: 30000, sz: [22, 14] },
    { id: 'igloo',     name: '이글루',    route: 'snow', cost: 45000, sz: [24, 16] },
    { id: 'icebear',   name: '얼음 곰',   route: 'snow', cost: 36000, sz: [16, 18] }
  ];
  // 온천욕: once per local day at the 온천 마을; for TRN_BATH_MS every bite wait (fishing.js waitMs) is × TRN_BATH_MUL
  var TRN_BATH_MS = 3600e3, TRN_BATH_MUL = 0.7;
  TRN_SOUVENIRS.forEach(function (d) { DECOS.push({ id: d.id, name: d.name, cost: d.cost, merchant: true, from: 'train', sz: d.sz }); });

  function trnRoute(id) { for (var k = 0; k < TRN_ROUTES.length; k++) if (TRN_ROUTES[k].id === id) return TRN_ROUTES[k]; return null; }
  function trnItem(id) { for (var k = 0; k < TRN_PICKS.length; k++) if (TRN_PICKS[k].id === id) return TRN_PICKS[k]; return null; }
  function trnSouvenir(id) { for (var k = 0; k < TRN_SOUVENIRS.length; k++) if (TRN_SOUVENIRS[k].id === id) return TRN_SOUVENIRS[k]; return null; }
  function trnOf(s) { if (!s.train) s.train = { ok: {}, tk: {}, pick: {}, dex: {} }; return s.train; }
  function trnOk(s, id) { return !!(s.train && s.train.ok[id]); }
  // 'owned' | 'rep' (★ short) | 'after' (the route before is not open) | 'station' (포구 기차역 not repaired) | 'coins' | 'ok'
  function trnStatus(s, id) {
    var r = trnRoute(id);
    if (!r) return 'none';
    if (trnOk(s, id)) return 'owned';
    if (r.rep && s.rep < r.rep) return 'rep';
    if (r.station && !portDone(s, 'station')) return 'station';
    if (r.after && !trnOk(s, r.after)) return 'after';
    return s.coins < TRN_OPEN[id] ? 'coins' : 'ok';
  }
  function trnPickSpots(s, id, now) {
    var t = trnOf(s), n = TRN_PICK_N[id] || 0, first = TRN_PICKS.filter(function (p) { return p.route === id; })[0];
    if (!n || !first || t.pick[id]) return;
    t.pick[id] = [];
    for (var k = 0; k < n; k++) t.pick[id].push({ at: now, id: first.id });
  }
  function trnOpen(s, id, now) {
    var st = trnStatus(s, id);
    if (st !== 'ok') return { ok: false, why: st };
    s.coins -= TRN_OPEN[id];
    trnOf(s).ok[id] = true;
    if (SPOTS[id]) { s.spotOk = s.spotOk || {}; s.spotOk[id] = true; }   // the route's own fishing spot
    trnPickSpots(s, id, now);
    return { ok: true };
  }
  // today's ticket for route id?
  function trnTicket(s, id, now, tzMin) {
    var d = toyDay(now, tzMin), t = s.train ? s.train.tk[id] : undefined;
    return typeof t === 'number' && d <= t && t - d <= TRN_FUTURE;
  }
  function trnBuyTicket(s, id, now, tzMin) {
    if (!trnRoute(id)) return { ok: false, why: 'none' };
    if (!trnOk(s, id)) return { ok: false, why: 'open' };
    if (trnTicket(s, id, now, tzMin)) return { ok: false, why: 'have' };
    if (s.coins < TRN_FARE[id]) return { ok: false, why: 'coins' };
    s.coins -= TRN_FARE[id];
    s.train.tk[id] = toyDay(now, tzMin);
    return { ok: true };
  }
  // may the player get on now? → { ok } | { ok: false, why: 'open' | 'ticket' }
  function trnBoard(s, id, now, tzMin) {
    if (!trnOk(s, id)) return { ok: false, why: 'open' };
    return trnTicket(s, id, now, tzMin) ? { ok: true } : { ok: false, why: 'ticket' };
  }

  // ---------- 특산물 ----------
  function trnRoll(id, rng) { return pick(TRN_PICKS.filter(function (p) { return p.route === id; }), rng).id; }
  // a spot regrowing further ahead than one full regrow was picked under a wrong (forward) clock: it counts as ready
  function trnGrown(p, now) { return now >= p.at || p.at - now > TRN_REGROW_MIN + TRN_REGROW_SPAN; }
  // what stands on each spot now (null = still regrowing)
  function trnPicksNow(s, id, now) {
    var ps = s.train && s.train.pick[id];
    return ps ? ps.map(function (p) { return p.id && trnGrown(p, now) ? p.id : null; }) : [];
  }
  function trnPickNext(s, id, now) {
    var t = null, ps = s.train && s.train.pick[id];
    if (ps) ps.forEach(function (p) { if (!trnGrown(p, now) && (t === null || p.at < t)) t = p.at; });
    return t;
  }
  // needs today's ticket for that route (you have to be there)
  function trnPick(s, id, k, now, rng, tzMin) {
    var p = trnOk(s, id) && trnTicket(s, id, now, tzMin) && s.train.pick[id] && s.train.pick[id][k];
    if (!p || !p.id || !trnGrown(p, now)) return null;
    var it = trnItem(p.id), d = s.train.dex, out = { id: it.id, first: !d[it.id] };
    out.sold = bagAdd(s, it.id, it.price);
    d[it.id] = Math.min(1e6, (d[it.id] || 0) + 1);
    s.train.pick[id][k] = { at: now + TRN_REGROW_MIN + rng() * TRN_REGROW_SPAN, id: trnRoll(id, rng) };
    return out;
  }

  // ---------- 온천욕: s.train.bath = { d: local day of the last bath, until: ms it wears off } ----------
  // A new bath needs a later day than the last one, so a clock set back never gives a second one the same day; a bath
  // more than TRN_FUTURE days ahead was taken under a wrong clock and blocks nothing.
  function trnBath(s, now, tzMin) {
    if (!trnOk(s, 'onsen')) return { ok: false, why: 'open' };
    if (!trnTicket(s, 'onsen', now, tzMin)) return { ok: false, why: 'ticket' };
    var d = toyDay(now, tzMin), b = s.train.bath;
    if (b && d <= b.d && b.d - d <= TRN_FUTURE) return { ok: false, why: 'bath' };
    s.train.bath = { d: d, until: now + TRN_BATH_MS };
    return { ok: true, until: s.train.bath.until };
  }
  // ms of quicker bites left (0 = off); a clock set back never stretches it past one hour
  function trnBathLeft(s, now) {
    var b = s && s.train && s.train.bath;
    if (!b || typeof now !== 'number' || now >= b.until || b.until - now > TRN_BATH_MS) return 0;
    return b.until - now;
  }
  function trnBathMul(s, now) { return trnBathLeft(s, now) > 0 ? TRN_BATH_MUL : 1; }

  // ---------- 기념품 ----------
  // sold at the route's own shop: needs today's ticket for that route
  function trnBuySouvenir(s, id, now, tzMin) {
    var w = trnSouvenir(id);
    if (!w) return { ok: false, why: 'none' };
    if (!trnOk(s, w.route)) return { ok: false, why: 'open' };
    if (s.yard && s.yard.deco[id]) return { ok: false, why: 'owned' };
    if (!trnTicket(s, w.route, now, tzMin)) return { ok: false, why: 'ticket' };
    if (s.coins < w.cost) return { ok: false, why: 'coins' };
    s.coins -= w.cost;
    return { ok: true, stored: !!grantDeco(s, id).stored };
  }

  // ---------- save: called by decode() (absent in older saves). A bad field loses that field, never the opened routes ----------
  function decodeTrain(o, s) {
    var q = o.train;
    function obj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
    function num(x) { return typeof x === 'number' && isFinite(x); }
    if (!obj(q)) return;
    var t = { ok: {}, tk: {}, pick: {}, dex: {} };
    if (obj(q.ok)) TRN_ROUTES.forEach(function (r) { if (q.ok[r.id] === true) t.ok[r.id] = true; });
    if (obj(q.tk)) TRN_ROUTES.forEach(function (r) { if (num(q.tk[r.id])) t.tk[r.id] = Math.floor(q.tk[r.id]); });
    if (obj(q.dex)) TRN_PICKS.forEach(function (p) { if (num(q.dex[p.id]) && q.dex[p.id] > 0) t.dex[p.id] = Math.min(1e6, Math.floor(q.dex[p.id])); });
    if (obj(q.bath) && num(q.bath.d) && num(q.bath.until)) t.bath = { d: Math.floor(q.bath.d), until: q.bath.until };
    s.train = t;
    Object.keys(t.ok).forEach(function (id) {
      var ps = obj(q.pick) && Array.isArray(q.pick[id]) ? q.pick[id] : null;
      var at0 = num(o.savedAt) ? o.savedAt : 0;
      trnPickSpots(s, id, at0);
      if (ps && t.pick[id]) t.pick[id].forEach(function (p, k) {
        var e = ps[k], it = e && obj(e) && trnItem(e.id);
        // regrowing further past the save than one full regrow: picked under a wrong clock, ready again
        var at = num(e && e.at) ? (at0 > 0 && e.at - at0 > TRN_REGROW_MIN + TRN_REGROW_SPAN ? at0 : e.at) : p.at;
        if (obj(e)) t.pick[id][k] = { at: at, id: it && it.route === id ? it.id : p.id };
      });
      if (SPOTS[id]) { s.spotOk = s.spotOk || {}; s.spotOk[id] = true; }
    });
    // a route's spot is only fished while there on that day's ticket: a reload starts back at the 연못
    if (trnRoute(s.spot)) { delete s.spot; s.fish = { phase: 'idle' }; }
  }

  expose({
    TRN_REP: TRN_REP, TRN_OPEN: TRN_OPEN, TRN_FARE: TRN_FARE, TRN_FUTURE: TRN_FUTURE, TRN_ROUTES: TRN_ROUTES,
    TRN_VALLEY_FISH: TRN_VALLEY_FISH, TRN_PICKS: TRN_PICKS, TRN_PICK_N: TRN_PICK_N, TRN_REGROW_MIN: TRN_REGROW_MIN, TRN_REGROW_SPAN: TRN_REGROW_SPAN,
    TRN_ONSEN_FISH: TRN_ONSEN_FISH, TRN_SNOW_FISH: TRN_SNOW_FISH, TRN_SOUVENIRS: TRN_SOUVENIRS, TRN_BATH_MS: TRN_BATH_MS, TRN_BATH_MUL: TRN_BATH_MUL,
    trnBath: trnBath, trnBathLeft: trnBathLeft, trnBathMul: trnBathMul,
    trnRoute: trnRoute, trnItem: trnItem, trnSouvenir: trnSouvenir, trnOf: trnOf, trnOk: trnOk, trnStatus: trnStatus, trnOpen: trnOpen,
    trnTicket: trnTicket, trnBuyTicket: trnBuyTicket, trnBoard: trnBoard,
    trnPicksNow: trnPicksNow, trnPickNext: trnPickNext, trnPick: trnPick, trnBuySouvenir: trnBuySouvenir, decodeTrain: decodeTrain
  });
