  // ---------- stage 9 ③: 자전거 배달, 열기구, 겨울 썰매 ----------
  // Three short one-button minigames. Each is judged here from a layout (made from rng) and a list of tap times
  // (seconds since the ride began), so the UI only records taps. Nothing can be lost: a crash or a slow run
  // still gives the plain result. State is optional and made lazily: s.bike, s.sled, s.bal.

  // ---------- 자전거 배달 ----------
  // An order is delivered as always first; then the ride. A clean ride adds a tip on top, flowers make it bigger.
  var BIKE_COST = 3000, BIKE_TIME = 8, BIKE_JUMP = 0.7, BIKE_HIT = 0.12, BIKE_GAP = 0.95;
  var BIKE_TIP = 0.04, BIKE_FLOWER_TIP = 0.02, BIKE_TIP_MAX = 0.1;
  // the road looks different each game season (what you hop over, what you pick)
  var BIKE_ROAD = {
    spring: { name: '벚꽃 길',   bump: '웅덩이',    flower: '벚꽃' },
    summer: { name: '장마 길',   bump: '물웅덩이',  flower: '해바라기' },
    autumn: { name: '단풍 길',   bump: '낙엽 더미', flower: '코스모스' },
    winter: { name: '눈길',      bump: '눈 더미',   flower: '동백꽃' }
  };
  function r2(x) { return Math.round(x * 100) / 100; }
  function bikeOk(s) { return !!(s.bike && s.bike.own); }
  function buyBike(s) {
    if (bikeOk(s)) return { ok: false, why: 'owned' };
    if (s.coins < BIKE_COST) return { ok: false, why: 'coins' };
    s.coins -= BIKE_COST; s.bike = { own: true, runs: 0, clean: 0, best: 0 };
    return { ok: true };
  }
  // [{ t, kind: 'bump' | 'cat' | 'flower' }]: bump/cat sit on the road (hop over), flowers hang in the air (hop into)
  function bikeLayout(rng) {
    var out = [], t = 1.4;
    while (t < BIKE_TIME - 0.6) {
      var r = rng();
      out.push({ t: r2(t), kind: r < 0.4 ? 'bump' : r < 0.65 ? 'cat' : 'flower' });
      t += BIKE_GAP + rng() * 0.6;
    }
    if (!out.some(function (e) { return e.kind !== 'flower'; })) out[0].kind = 'bump';
    return out;
  }
  // taps → jump starts: a tap while still in the air is not a second jump
  function bikeJumps(taps) {
    var out = [];
    (taps || []).slice().sort(function (a, b) { return a - b; }).forEach(function (t) {
      if (t >= 0 && (!out.length || t >= out[out.length - 1] + BIKE_JUMP)) out.push(t);
    });
    return out;
  }
  function bikeAir(taps, t) { return bikeJumps(taps).some(function (j) { return t >= j && t < j + BIKE_JUMP; }); }
  // judging so far (upTo seconds; default the whole ride): an obstacle needs the rider in the air all through its
  // hit window; a crash ends the ride. → { crash, at, flowers, cleared, done }
  function bikeRun(lay, taps, upTo) {
    if (upTo === undefined) upTo = BIKE_TIME;
    var jumps = bikeJumps((taps || []).filter(function (t) { return t <= upTo; }));
    var out = { crash: false, at: null, flowers: 0, cleared: 0, done: false };
    for (var k = 0; k < lay.length; k++) {
      var e = lay[k];
      if (e.kind === 'flower') {
        if (e.t > upTo) break;
        if (jumps.some(function (j) { return e.t >= j && e.t < j + BIKE_JUMP; })) out.flowers++;
        continue;
      }
      if (e.t + BIKE_HIT > upTo) break;
      if (jumps.some(function (j) { return j <= e.t - BIKE_HIT && j + BIKE_JUMP >= e.t + BIKE_HIT; })) out.cleared++;
      else { out.crash = true; out.at = e.t; break; }
    }
    out.done = out.crash || upTo >= BIKE_TIME;
    return out;
  }
  function bikeTipFor(reward, run) {
    if (!run || run.crash) return 0;
    return Math.round(reward * Math.min(BIKE_TIP_MAX, BIKE_TIP + BIKE_FLOWER_TIP * (run.flowers || 0)));
  }
  // after deliver(): pay = what the order paid. → { tip } (0 on a crash), null without a bike
  function bikeFinish(s, pay, run) {
    if (!bikeOk(s)) return null;
    var b = s.bike, tip = bikeTipFor(pay, run);
    s.coins += tip; b.runs++;
    if (!run.crash) { b.clean++; b.best = Math.max(b.best, run.flowers || 0); }
    return { tip: tip };
  }

  // ---------- 겨울 썰매 (마을 언덕, game winter only) ----------
  // Two lanes; a tap switches lane. Rocks and trees bump you (time added), 눈꽃 in the other lane save time.
  // On the 눈사람 축제 day the course has snowmen, records pay double and the first run that day wins a prize.
  var SLED_TIME = 14, SLED_GAP = 0.8, SLED_BUMP = 1.5, SLED_FLAKE = 0.4, SLED_MAX = 20;
  var SLED_RECORD_COINS = 200, SLED_FEST_MUL = 2, SLED_FEST_COINS = 500;
  function sledSeason(now, tzMin) { return gameClock(now, tzMin).season === 'winter'; }
  function sledCan(s, now, tzMin) {
    if (!villageOk(s)) return { ok: false, why: 'village' };
    if (!sledSeason(now, tzMin)) return { ok: false, why: 'season' };
    return { ok: true };
  }
  // [{ t, lane: 0|1, kind: 'rock' | 'tree' | 'snowman' | 'flake' }]; one obstacle per moment, so there is always a way
  function sledLayout(rng, fest) {
    var out = [], t = 1.2;
    while (t < SLED_TIME - 0.5) {
      var lane = rng() < 0.5 ? 0 : 1, kind = fest && rng() < 0.35 ? 'snowman' : rng() < 0.5 ? 'rock' : 'tree';
      out.push({ t: r2(t), lane: lane, kind: kind });
      if (rng() < 0.4) out.push({ t: r2(t), lane: 1 - lane, kind: 'flake' });
      t += SLED_GAP + rng() * 0.5;
    }
    return out;
  }
  function sledLane(taps, t) { return (taps || []).filter(function (x) { return x <= t; }).length % 2; }
  // → { bumps, flakes, time (seconds, one decimal), done }
  function sledRun(lay, taps, upTo) {
    if (upTo === undefined) upTo = SLED_TIME;
    var out = { bumps: 0, flakes: 0, time: 0, done: upTo >= SLED_TIME };
    lay.forEach(function (e) {
      if (e.t > upTo || sledLane(taps, e.t) !== e.lane) return;
      if (e.kind === 'flake') out.flakes++; else out.bumps++;
    });
    out.time = Math.min(SLED_MAX, Math.round((SLED_TIME + out.bumps * SLED_BUMP - out.flakes * SLED_FLAKE) * 10) / 10);
    return out;
  }
  function sledOf(s) { if (!s.sled) s.sled = { best: 0, runs: 0, fest: 0 }; return s.sled; }
  function sledBest(s) { return s.sled && s.sled.best ? s.sled.best / 10 : null; }
  // run = sledRun result; fw = the festival window on now (festivalAt) or null. best is kept in tenths of a second.
  function sledFinish(s, run, now, fw) {
    var st = sledOf(s), t10 = Math.round(run.time * 10), fest = !!(fw && fw.id === 'winter');
    var out = { time: t10 / 10, best: !st.best || t10 < st.best, coins: 0, fest: false };
    st.runs++;
    if (out.best) { st.best = t10; out.coins += SLED_RECORD_COINS * (fest ? SLED_FEST_MUL : 1); }
    if (fest && st.fest !== fw.start) { st.fest = fw.start; out.fest = true; out.coins += SLED_FEST_COINS; }
    s.coins += out.coins;
    return out;
  }

  // ---------- 열기구 (마을 언덕, a few windows a real day) ----------
  // Real time is cut into BALLOON_BLOCK blocks; most blocks hold one BALLOON_LEN window (seeded by the block,
  // like the boom windows). One ride per window for a small fare. The ride drifts over the farm; birds and
  // cloud shapes float through the frame in the middle: tap while one is in it to note it in the 하늘 도감.
  var BALLOON_BLOCK = 3 * 3600e3, BALLOON_P = 0.9, BALLOON_LEN = 20 * 60e3, BALLOON_FARE = 200;
  var BAL_TIME = 16, BAL_N = 5, BAL_GAP = 2.2, BAL_WIN = 0.45, BAL_REST = 1.5, SIGHT_COINS = 60, SIGHT_ALL_COINS = 2000;
  var DAYLIGHT = ['morning', 'day', 'evening'];
  // w = weight; season/phase/weather = when it can be seen (absent = any)
  var SIGHTS = [
    { id: 'sparrow',  kind: 'bird',  name: '참새 떼',     w: 10, phase: DAYLIGHT, hint: '낮이면 언제든 · 짹짹' },
    { id: 'magpie',   kind: 'bird',  name: '까치',        w: 8,  phase: DAYLIGHT, hint: '반가운 손님이 온다는 새' },
    { id: 'gull',     kind: 'bird',  name: '갈매기',      w: 8,  hint: '바다 쪽 하늘 · 밤에도 끼룩' },
    { id: 'swallow',  kind: 'bird',  name: '제비',        w: 7,  season: ['spring', 'summer', 'autumn'], phase: DAYLIGHT, hint: '봄부터 가을까지 낮게 난다' },
    { id: 'heron',    kind: 'bird',  name: '백로',        w: 6,  season: ['spring', 'summer', 'autumn'], phase: DAYLIGHT, hint: '봄부터 가을까지 논 위를 하얗게' },
    { id: 'geese',    kind: 'bird',  name: '기러기 떼',   w: 7,  season: ['autumn', 'winter', 'spring'], hint: '가을부터 이른 봄까지 · 시옷 모양으로' },
    { id: 'eagle',    kind: 'bird',  name: '수리',        w: 3,  phase: DAYLIGHT, hint: '아주 가끔 높이 맴돈다' },
    { id: 'owl',      kind: 'bird',  name: '부엉이',      w: 6,  phase: ['night'], hint: '밤하늘에만' },
    { id: 'whale',    kind: 'cloud', name: '고래 구름',   w: 5,  phase: DAYLIGHT, hint: '맑은 날 커다란 구름' },
    { id: 'rabbit',   kind: 'cloud', name: '토끼 구름',   w: 7,  phase: DAYLIGHT, hint: '귀가 긴 구름' },
    { id: 'fishc',    kind: 'cloud', name: '물고기 구름', w: 7,  phase: DAYLIGHT, hint: '연못을 닮고 싶은 구름' },
    { id: 'sheep',    kind: 'cloud', name: '양떼구름',    w: 7,  season: ['spring', 'autumn'], phase: DAYLIGHT, hint: '봄·가을 하늘 몽글몽글' },
    { id: 'heart',    kind: 'cloud', name: '하트 구름',   w: 3,  phase: DAYLIGHT, hint: '아주 가끔 · 행운' },
    { id: 'dragon',   kind: 'cloud', name: '용 구름',     w: 3,  phase: DAYLIGHT, weather: ['clear'], hint: '맑은 날 · 정말 드물게' },
    { id: 'rainbow',  kind: 'cloud', name: '구름 위 무지개', w: 6, weather: ['rain'], phase: DAYLIGHT, hint: '비 오는 날 구름 위에서' },
    { id: 'snowc',    kind: 'cloud', name: '눈송이 구름', w: 6,  season: ['autumn', 'winter'], hint: '늦가을·겨울 하늘 · 눈송이 모양' },
    { id: 'kite',     kind: 'cloud', name: '마을 아이의 연', w: 5, phase: ['day'], weather: ['clear'], hint: '맑은 낮 · 마을 쪽에서 올라온다' },
    { id: 'moonhalo', kind: 'cloud', name: '달무리',      w: 6,  phase: ['night'], hint: '밤 · 달 둘레에 동그랗게' }
  ];
  var SIGHT_BY = {};
  SIGHTS.forEach(function (x) { SIGHT_BY[x.id] = x; });
  function sightById(id) { return SIGHT_BY.hasOwnProperty(id) ? SIGHT_BY[id] : null; }
  function sightOk(d, env) {
    env = env || {};
    if (d.season && d.season.indexOf(env.season) < 0) return false;
    if (d.phase && d.phase.indexOf(env.phase) < 0) return false;
    if (d.weather && d.weather.indexOf(env.weather) < 0) return false;
    return true;
  }
  function balloonInBlock(b) {
    var r = seedRng(Math.imul(b, 0x1b873593) ^ 0xba11);
    if (r() >= BALLOON_P) return null;
    var start = b * BALLOON_BLOCK + Math.floor(r() * (BALLOON_BLOCK - BALLOON_LEN) / 60e3) * 60e3;
    return { start: start, end: start + BALLOON_LEN };
  }
  function balloonAt(now) {
    var w = balloonInBlock(Math.floor(now / BALLOON_BLOCK));
    return w && now >= w.start && now < w.end ? w : null;
  }
  function balloonNext(now) {
    for (var b = Math.floor(now / BALLOON_BLOCK), k = 0; k < 32; k++, b++) {
      var w = balloonInBlock(b);
      if (w && w.end > now) return w;
    }
    return null;
  }
  // the balloon you can ride now: the one up, or else the last one that came while you were away — it waits
  // tethered on the hill until ridden (only one waits: missing several still leaves just one)
  function balloonFor(s, now) {
    var w = balloonAt(now);
    if (w) return w;
    for (var b = Math.floor(now / BALLOON_BLOCK), k = 0; k < 8; k++, b--) {
      var p = balloonInBlock(b);
      if (p && p.end <= now) return s.bal && s.bal.last >= p.start ? null : p;
    }
    return null;
  }
  function balOf(s) { if (!s.bal) s.bal = { rides: 0, last: 0, seen: {}, all: false }; return s.bal; }
  function balloonCan(s, now) {
    if (!villageOk(s)) return { ok: false, why: 'village' };
    var w = balloonFor(s, now);
    if (!w) return { ok: false, why: 'closed' };
    if (s.bal && s.bal.last === w.start) return { ok: false, why: 'rode' };
    if (s.coins < BALLOON_FARE) return { ok: false, why: 'coins' };
    return { ok: true, w: w };
  }
  function balloonStart(s, now) {
    var c = balloonCan(s, now);
    if (!c.ok) return c;
    var b = balOf(s);
    s.coins -= BALLOON_FARE; b.rides++; b.last = c.w.start;
    return { ok: true, w: c.w };
  }
  // up to BAL_N different sights this sky has now, each crossing the middle frame at time t
  function balloonLayout(env, rng) {
    var pool = SIGHTS.filter(function (d) { return sightOk(d, env); }), out = [];
    for (var i = 0; i < BAL_N && pool.length; i++) {
      var sum = 0; pool.forEach(function (d) { sum += d.w; });
      var r = rng() * sum, k = 0;
      while (k < pool.length - 1 && r >= pool[k].w) { r -= pool[k].w; k++; }
      out.push({ t: r2(2 + i * (BAL_GAP + 0.4) + rng() * 0.4), id: pool[k].id });
      pool.splice(k, 1);
    }
    return out;
  }
  // sights with a tap while they were in the frame
  // a tap catches the sight in the frame; taps closer than BAL_REST to the last counted one are ignored
  // (sights are ≥ BAL_GAP apart, so one tap per sight always works, but tapping nonstop misses some)
  function balloonJudge(lay, taps) {
    var last = -1e9, ok = (taps || []).slice().sort(function (a, b) { return a - b; }).filter(function (t) { if (t - last < BAL_REST) return false; last = t; return true; });
    return lay.filter(function (e) { return ok.some(function (t) { return Math.abs(t - e.t) <= BAL_WIN; }); })
      .map(function (e) { return e.id; });
  }
  function sightCount(s) { return s.bal ? Object.keys(s.bal.seen).length : 0; }
  // → { first: [new ids], coins, all: true the one time every sight is in }
  function balloonFinish(s, ids) {
    var b = balOf(s), out = { first: [], coins: 0, all: false };
    (ids || []).forEach(function (id) {
      if (!sightById(id)) return;
      if (!b.seen[id]) { out.first.push(id); out.coins += SIGHT_COINS; }
      b.seen[id] = (b.seen[id] || 0) + 1;
    });
    if (!b.all && sightCount(s) >= SIGHTS.length) { b.all = true; out.all = true; out.coins += SIGHT_ALL_COINS; }
    s.coins += out.coins;
    return out;
  }
  // 사진기 slots only the sky has (shotsNow calls rideShots)
  var BAL_SHOTS = ['balloon', 'skywhale', 'geese'];
  [
    { id: 'balloon',  name: '하늘에서 본 농장', hint: '마을 언덕 열기구를 타고' },
    { id: 'skywhale', name: '고래 구름',        hint: '열기구에서 · 맑은 날 커다란 구름' },
    { id: 'geese',    name: '기러기 떼',        hint: '열기구에서 · 가을부터 이른 봄 하늘' }
  ].forEach(function (p) { SHOTS.push(p); SHOT_BY[p.id] = p; });
  function rideShots(c, add) {
    if (c.scene === 'balloon') add('balloon');
    if (c.sight === 'whale') add('skywhale');
    if (c.sight === 'geese') add('geese');
  }

  // ---------- save ----------
  function decodeRide(o, s) {
    function int(x) { return typeof x === 'number' && isFinite(x) && x >= 0 ? Math.floor(x) : 0; }
    var q = o.bike;
    if (q && typeof q === 'object' && q.own === true) s.bike = { own: true, runs: int(q.runs), clean: int(q.clean), best: int(q.best) };
    q = o.sled;
    if (q && typeof q === 'object' && !Array.isArray(q)) s.sled = { best: int(q.best), runs: int(q.runs), fest: int(q.fest) };
    q = o.bal;
    if (q && typeof q === 'object' && !Array.isArray(q)) {
      var b = { rides: int(q.rides), last: int(q.last), seen: {}, all: q.all === true };
      if (q.seen && typeof q.seen === 'object') SIGHTS.forEach(function (d) { var n = int(q.seen[d.id]); if (n) b.seen[d.id] = n; });
      s.bal = b;
    }
  }

  expose({
    BIKE_COST: BIKE_COST, BIKE_TIME: BIKE_TIME, BIKE_JUMP: BIKE_JUMP, BIKE_HIT: BIKE_HIT, BIKE_GAP: BIKE_GAP,
    BIKE_TIP: BIKE_TIP, BIKE_FLOWER_TIP: BIKE_FLOWER_TIP, BIKE_TIP_MAX: BIKE_TIP_MAX, BIKE_ROAD: BIKE_ROAD,
    bikeOk: bikeOk, buyBike: buyBike, bikeLayout: bikeLayout, bikeJumps: bikeJumps, bikeAir: bikeAir, bikeRun: bikeRun,
    bikeTipFor: bikeTipFor, bikeFinish: bikeFinish,
    SLED_TIME: SLED_TIME, SLED_GAP: SLED_GAP, SLED_BUMP: SLED_BUMP, SLED_FLAKE: SLED_FLAKE, SLED_MAX: SLED_MAX,
    SLED_RECORD_COINS: SLED_RECORD_COINS, SLED_FEST_MUL: SLED_FEST_MUL, SLED_FEST_COINS: SLED_FEST_COINS,
    sledSeason: sledSeason, sledCan: sledCan, sledLayout: sledLayout, sledLane: sledLane, sledRun: sledRun,
    sledBest: sledBest, sledFinish: sledFinish,
    BALLOON_LEN: BALLOON_LEN, BALLOON_FARE: BALLOON_FARE, BAL_TIME: BAL_TIME, BAL_GAP: BAL_GAP, BAL_WIN: BAL_WIN,
    SIGHTS: SIGHTS, SIGHT_COINS: SIGHT_COINS, SIGHT_ALL_COINS: SIGHT_ALL_COINS, BAL_SHOTS: BAL_SHOTS,
    sightById: sightById, sightOk: sightOk, balloonAt: balloonAt, balloonFor: balloonFor, balloonNext: balloonNext, balloonCan: balloonCan,
    balloonStart: balloonStart, balloonLayout: balloonLayout, balloonJudge: balloonJudge, balloonFinish: balloonFinish,
    sightCount: sightCount, decodeRide: decodeRide
  });
