  // ---------- 마을 음악회: 악기 6종, 마당 연주 (하루 보상 3번), 광장 음악회 (현실 하루 한 번, 게임 저녁·밤), 축제 날 특별 공연 ----------
  // s.band = { ins: { id: true }, mute: { id: true }, play: { d, n }, show: day, best: 0–3, gold: true, song: true }
  // is made only when the first instrument arrives; a save without one never gets it. No dice rolled anywhere here:
  // the 오카리나 find is a hash of the player's birth time and the junk count (rolled AFTER the junk/chest is decided,
  // never instead of it), resident instruments come when their 친밀도 is already high enough and the player visits them in the 마을 (residents.js untouched).
  // Every judge/score function is pure; the UI hands in its own clock (audio or performance.now) and the phase.
  var BND_INS = [
    { id: 'ocarina',   name: '오카리나', lane: 'oca', from: 'find',    hint: '낚시 잡동사니·보물 상자에서 아주 가끔', adds: '멜로디를 한 옥타브 위에서' },
    { id: 'drum',      name: '작은 북',  lane: 'drm', from: 'kid',     hint: '꼬마 도윤 친밀도 3단계 · 마을에서',       adds: '북 한 겹 (밤엔 아주 약하게)' },
    { id: 'harmonica', name: '하모니카', lane: 'hrm', from: 'fisher',  hint: '박 영감 친밀도 3단계 · 마을에서',         adds: '화음을 길게' },
    { id: 'xylo',      name: '실로폰',   lane: 'xyl', from: 'teacher', hint: '하늘 선생님 친밀도 3단계 · 마을에서',     adds: '반짝이는 아르페지오' },
    { id: 'accordion', name: '아코디언', lane: 'acc', from: 'grandma', hint: '순자 할머니 친밀도 3단계 · 마을에서',     adds: '베이스 아래 저음' },
    { id: 'uke',       name: '우쿨렐레', lane: 'uke', from: 'trader',  hint: '기차 떠돌이 상인 (포구 기차역 복구 후)', adds: '리듬 반주' }
  ];
  var BND_BY = {};
  BND_INS.forEach(function (d) { BND_BY[d.id] = d; });
  var BND_FRIEND = 3;                       // 친밀도 level at which a resident brings their instrument
  var BND_UKE_COST = 12000;                 // 우쿨렐레 at the 떠돌이 상인 (outside his 3-a-day list: that list stays as it was)
  var BND_FIND = { junk: 40, chest: 6 };    // 오카리나: 1 in n junk catches / opened chests (same for a given save)
  var BND_PLAY_MIN = 1, BND_SHOW_MIN = 2;   // instruments to 연주 / to stand on the 광장 stage
  var BND_PLAY_CAP = 3;                     // 연주 rewards per real day
  var BND_WIN = { perfect: 80, good: 160 }; // ms either side of the note
  var BND_GRADE = [0.45, 0.7, 0.88];        // score share for 동 · 은 · 금
  var BND_GRADE_NAME = ['', '동', '은', '금'];
  var BND_PLAY_PAY = [40, 150, 300, 500];   // 연주 coins by grade (none · 동 · 은 · 금)
  var BND_SHOW_PAY = [200, 800, 1500, 3000];// 음악회 coins by grade; ×BND_FEST_MUL on a 계절 축제 day
  var BND_FEST_MUL = 2;
  var BND_TITLE = '마을 악단';
  var BND_FANS = ['grandma', 'fisher', 'kid', 'teacher', 'chef'];   // the audience; 연주 cheers one of them a day in turn

  function bndById(id) { return BND_BY.hasOwnProperty(id) ? BND_BY[id] : null; }
  function bndHas(s, id) { return !!(s.band && s.band.ins[id]); }
  function bndCount(s) { return s.band ? BND_INS.filter(function (d) { return s.band.ins[d.id]; }).length : 0; }
  function bndOk(s) { return bndCount(s) >= BND_PLAY_MIN; }
  function bndLive(s, id) { return bndHas(s, id) && !s.band.mute[id]; }
  function bndOf(s) { if (!s.band) s.band = { ins: {}, mute: {}, play: null, show: null, best: 0 }; return s.band; }
  // → { ok, first } ; the first instrument makes s.band
  function bndGive(s, id) {
    if (!bndById(id)) return { ok: false, why: 'none' };
    if (bndHas(s, id)) return { ok: false, why: 'owned' };
    var first = !s.band;
    bndOf(s).ins[id] = true;
    return { ok: true, first: first };
  }
  function bndMute(s, id, off) {
    if (!bndHas(s, id)) return false;
    if (off) s.band.mute[id] = true; else delete s.band.mute[id];
    return true;
  }
  // resident instruments due now (친밀도 already high enough); nothing is written
  function bndDue(s) {
    return BND_INS.filter(function (d) { return residentById(d.from) && !bndHas(s, d.id) && friendLevel(s, d.from) >= BND_FRIEND; }).map(function (d) { return d.id; });
  }
  // called by the UI tick only while the player is in the 마을 (who = the resident whose home they are in, else everyone):
  // hands over every due instrument → [ids] (no s.band unless one is due)
  function bndTakeDue(s, who) {
    var ids = bndDue(s).filter(function (id) { return !who || BND_BY[id].from === who; });
    ids.forEach(function (id) { bndGive(s, id); });
    return ids;
  }
  // 오카리나: after a junk catch (src 'junk') or an opened chest ('chest') has already been handed out.
  // A hash of this save's birth time and the junk counters: no dice, the junk/chest result is never changed.
  function bndFind(s, src) {
    if (bndHas(s, 'ocarina') || !s.junk || !BND_FIND[src]) return null;
    var key = 'bnd:' + (s.born || 0) + ':' + src + ':' + s.junk.total + ':' + (src === 'chest' ? s.junk.box : '');
    if (strHash(key) % BND_FIND[src] !== 0) return null;
    bndGive(s, 'ocarina');
    return 'ocarina';
  }
  function bndUkeWhy(s) { return bndHas(s, 'uke') ? 'owned' : !traderOpen(s) ? 'closed' : s.coins < BND_UKE_COST ? 'coins' : 'ok'; }
  function bndBuyUke(s) {
    var why = bndUkeWhy(s);
    if (why !== 'ok') return { ok: false, why: why };
    s.coins -= BND_UKE_COST; bndGive(s, 'uke');
    return { ok: true };
  }

  // ---------- the chart: melody notes → lanes, judging, grade ----------
  // mel = [{ t: seconds, m: midi }] in time order → [{ t, m, lane }]; higher notes sit further right
  function bndChart(mel, lanes) {
    var ps = [];
    mel.forEach(function (n) { if (ps.indexOf(n.m) < 0) ps.push(n.m); });
    ps.sort(function (a, b) { return a - b; });
    return mel.map(function (n) {
      var k = ps.length > 1 ? Math.min(lanes - 1, Math.floor(ps.indexOf(n.m) * lanes / ps.length)) : 0;
      return { t: n.t, m: n.m, lane: k };
    });
  }
  // |off| ms from the note → 'perfect' | 'good' | null (too far: the tap counts for nothing)
  function bndJudge(off) { var a = Math.abs(off); return a <= BND_WIN.perfect ? 'perfect' : a <= BND_WIN.good ? 'good' : null; }
  // hits = { perfect, good } out of n notes → share 0–1 (a perfect is worth 2, a good 1)
  function bndScore(hits, n) { return n ? Math.min(1, ((hits.perfect || 0) * 2 + (hits.good || 0)) / (2 * n)) : 0; }
  function bndGrade(share) { var g = 0; BND_GRADE.forEach(function (x, k) { if (share >= x) g = k + 1; }); return g; }
  // lanes: 연주 is always 4; the 음악회 gets one more per instrument past two (2 → 4, 3 → 5, 4+ → 6)
  function bndShowLanes(s) { return Math.min(6, Math.max(4, bndCount(s) + 2)); }

  // ---------- 마당 연주: any number of plays, rewards BND_PLAY_CAP times a real day ----------
  function bndPlayLeft(s, now, tzMin) {
    var q = s.band && s.band.play, d = toyDay(now, tzMin);
    return !q || q.d !== d ? BND_PLAY_CAP : Math.max(0, BND_PLAY_CAP - q.n);
  }
  // a finished 연주 → { coins, who, ups, grade, left } (coins 0 once today's rewards are used)
  function bndPlayPay(s, share, now, tzMin) {
    if (!bndOk(s)) return { ok: false, why: 'ins' };
    var g = bndGrade(share), d = toyDay(now, tzMin), left = bndPlayLeft(s, now, tzMin), out = { ok: true, grade: g, coins: 0, who: null, ups: [] };
    if (left <= 0) { out.left = 0; return out; }
    s.band.play = { d: d, n: BND_PLAY_CAP - left + 1 };
    out.coins = BND_PLAY_PAY[g]; s.coins += out.coins;
    if (g >= 1) { out.who = BND_FANS[(((d + s.band.play.n) % BND_FANS.length) + BND_FANS.length) % BND_FANS.length]; out.ups = befriendPts(s, out.who, 1); }
    out.left = left - 1;
    return out;
  }

  // ---------- 광장 음악회: once a real day, game evening or night; a 계절 축제 day (Wednesday) is a special show ----------
  // the festival id when today (local) is a 계절 축제 day, else null
  function bndFestDay(now, tzMin) {
    var w = festWeek(now, tzMin);
    return toyDay(w.start, tzMin) === toyDay(now, tzMin) ? w.id : null;
  }
  // 'ok' | 'ins' (fewer than BND_SHOW_MIN) | 'time' (not evening/night) | 'done' (today's show is over)
  function bndShowWhy(s, now, tzMin, phase) {
    if (bndCount(s) < BND_SHOW_MIN) return 'ins';
    if (phase !== 'evening' && phase !== 'night') return 'time';
    if (s.band.show === toyDay(now, tzMin)) return 'done';
    return 'ok';
  }
  // a finished show → { coins, grade, fest, title, song, ups: [{ who, ups }] }; quitting before the end pays nothing and keeps the day
  function bndShowPay(s, share, now, tzMin, phase) {
    var why = bndShowWhy(s, now, tzMin, phase);
    if (why !== 'ok') return { ok: false, why: why };
    var b = s.band, g = bndGrade(share), fest = bndFestDay(now, tzMin), mul = fest ? BND_FEST_MUL : 1;
    var out = { ok: true, grade: g, fest: fest, coins: BND_SHOW_PAY[g] * mul, title: false, song: false, ups: [] };
    b.show = toyDay(now, tzMin);
    if (g > (b.best || 0)) b.best = g;
    s.coins += out.coins;
    if (g >= 1) BND_FANS.forEach(function (who) { out.ups.push({ who: who, ups: befriendPts(s, who, mul) }); });
    if (g >= 3 && !b.gold) { b.gold = true; out.title = true; }
    // the concert song: the first 금, or a 은 on a festival day (the special show's chance)
    if (!b.song && (g >= 3 || (fest && g >= 2))) { b.song = true; out.song = true; }
    return out;
  }
  function bndTitles(s) { return s.band && s.band.gold ? [BND_TITLE] : []; }
  // the unlocked song plays as the music of a festival day's night
  function bndSongNow(s, now, tzMin, phase) { return !!(s.band && s.band.song && phase === 'night' && bndFestDay(now, tzMin)); }

  // ---------- save: called by decode() (absent in older saves); one broken field never loses an instrument ----------
  function decodeBand(o, s) {
    var q = o.band;
    function obj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
    function int(x) { return typeof x === 'number' && isFinite(x) ? Math.floor(x) : null; }
    if (!obj(q) || !obj(q.ins)) return;
    var b = { ins: {}, mute: {}, play: null, show: null, best: 0 };
    BND_INS.forEach(function (d) { if (q.ins[d.id] === true) b.ins[d.id] = true; });
    if (!Object.keys(b.ins).length) return;
    if (obj(q.mute)) BND_INS.forEach(function (d) { if (q.mute[d.id] === true && b.ins[d.id]) b.mute[d.id] = true; });
    if (obj(q.play) && int(q.play.d) !== null && int(q.play.n) !== null && q.play.n >= 0) b.play = { d: int(q.play.d), n: Math.min(BND_PLAY_CAP, int(q.play.n)) };
    if (int(q.show) !== null) b.show = int(q.show);
    if (int(q.best) !== null) b.best = Math.max(0, Math.min(3, int(q.best)));
    if (q.gold === true) b.gold = true;
    if (q.song === true) b.song = true;
    s.band = b;
  }

  expose({
    BND_INS: BND_INS, BND_FRIEND: BND_FRIEND, BND_UKE_COST: BND_UKE_COST, BND_FIND: BND_FIND, BND_PLAY_MIN: BND_PLAY_MIN, BND_SHOW_MIN: BND_SHOW_MIN,
    BND_PLAY_CAP: BND_PLAY_CAP, BND_WIN: BND_WIN, BND_GRADE: BND_GRADE, BND_GRADE_NAME: BND_GRADE_NAME, BND_PLAY_PAY: BND_PLAY_PAY,
    BND_SHOW_PAY: BND_SHOW_PAY, BND_FEST_MUL: BND_FEST_MUL, BND_TITLE: BND_TITLE, BND_FANS: BND_FANS,
    bndById: bndById, bndHas: bndHas, bndCount: bndCount, bndOk: bndOk, bndLive: bndLive, bndGive: bndGive, bndMute: bndMute,
    bndDue: bndDue, bndTakeDue: bndTakeDue, bndFind: bndFind, bndUkeWhy: bndUkeWhy, bndBuyUke: bndBuyUke,
    bndChart: bndChart, bndJudge: bndJudge, bndScore: bndScore, bndGrade: bndGrade, bndShowLanes: bndShowLanes,
    bndPlayLeft: bndPlayLeft, bndPlayPay: bndPlayPay, bndFestDay: bndFestDay, bndShowWhy: bndShowWhy, bndShowPay: bndShowPay,
    bndTitles: bndTitles, bndSongNow: bndSongNow, decodeBand: decodeBand
  });
