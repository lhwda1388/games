  // ---------- 소리 도감: 녹음기, sounds with conditions, quality ★1–3, milestones, 박물관 별관 소리실 (s.rec, made when bought) ----------
  // recNow(ctx) is pure: the UI describes where/when it is and gets back the sounds that could be recorded right now.
  // ctx = { now, view, spot (fishing spot when view is 'farm'), phase, season, weather, festival, fire, chime }
  // Recording: 'auto' (conditions held a while: ★1, sound on or off) or 'tap' (the ♪ chip while it plays: ★2, then ★3).
  // s.rec = { tool: true, has: { id: q 1–3 }, got: { m5…: true, annex: true }, mus: { id: true } }. No dice rolled anywhere here.
  // The 별관 소리실 is NOT one of the six museum rooms: museumTotal/museumAllDone/curatorLine/명예 관장 never read s.rec.
  var REC_COST = 3000, REC_REP = 5, REC_DECO = 'gramophone';
  // when: alternatives (any one matching is enough); in each, every listed field must match.
  // phase/season/weather like fish defs; where = any one place tag (recPlace); fest = festival id; fire / chime = ctx flags.
  // ev = the ambient one-shot (ui/sound.js AMB_EV) that plays it; rare = only in 1 of that many game minutes
  var REC_SOUNDS = [
    { id: 'sparrow',   name: '참새',         grp: '새',   ev: 'bird',      hint: '아침·낮 · 마당·밭·마을 · 비·눈 없는 날', when: [{ phase: ['morning', 'day'], season: ['spring', 'summer', 'autumn'], weather: ['clear', 'fog'], where: ['yard', 'farm', 'village', 'orchard'] }] },
    { id: 'cuckoo',    name: '뻐꾸기',       grp: '새',   ev: 'cuckoo',    hint: '봄·여름 아침·낮 · 숲', when: [{ phase: ['morning', 'day'], season: ['spring', 'summer'], weather: ['clear', 'fog'], where: ['forest'] }] },
    { id: 'woodpk',    name: '딱따구리',     grp: '새',   ev: 'woodpk',    hint: '낮 · 숲 · 겨울 빼고', when: [{ phase: ['day'], season: ['spring', 'summer', 'autumn'], weather: ['clear', 'fog'], where: ['forest'] }] },
    { id: 'oriole',    name: '꾀꼬리',       grp: '새',   ev: 'oriole',    hint: '여름 맑은 아침 · 과수원·숲', when: [{ phase: ['morning'], season: ['summer'], weather: ['clear'], where: ['orchard', 'forest'] }] },
    { id: 'gull',      name: '갈매기',       grp: '새',   ev: 'gull',      hint: '아침·낮 · 바다', when: [{ phase: ['morning', 'day'], weather: ['clear', 'fog', 'rain'], where: ['sea'] }] },
    { id: 'cicada',    name: '매미',         grp: '벌레', ev: 'cicada',    hint: '여름 낮 · 비 없는 날', when: [{ phase: ['day'], season: ['summer'], weather: ['clear', 'fog'], where: ['yard', 'farm', 'village', 'orchard', 'forest'] }] },
    { id: 'bigcicada', name: '말매미',       grp: '벌레', ev: 'bigcicada', hint: '여름 맑은 낮 · 마을·과수원 나무', when: [{ phase: ['day'], season: ['summer'], weather: ['clear'], where: ['village', 'orchard'] }] },
    { id: 'cricket',   name: '귀뚜라미',     grp: '벌레', ev: 'cricket',   hint: '여름·가을 저녁·밤', when: [{ phase: ['evening', 'night'], season: ['summer', 'autumn'], where: ['yard', 'farm', 'village', 'orchard', 'forest'] }] },
    { id: 'bellbug',   name: '방울벌레',     grp: '벌레', ev: 'bellbug',   hint: '가을 밤 · 숲·마당', when: [{ phase: ['night'], season: ['autumn'], weather: ['clear', 'fog'], where: ['forest', 'yard'] }] },
    { id: 'frog',      name: '개구리',       grp: '물가', ev: 'frog',      hint: '봄·여름 밤 · 물가', when: [{ phase: ['night'], season: ['spring', 'summer'], where: ['water'] }] },
    { id: 'toad',      name: '맹꽁이',       grp: '물가', ev: 'toad',      hint: '여름 비 오는 저녁·밤 · 물가', when: [{ phase: ['evening', 'night'], season: ['summer'], weather: ['rain'], where: ['water', 'farm'] }] },
    { id: 'kingfish',  name: '물총새 첨벙',  grp: '물가', ev: 'kingfish',  hint: '맑은 아침·낮 · 강·계곡', when: [{ phase: ['morning', 'day'], season: ['spring', 'summer', 'autumn'], weather: ['clear'], where: ['brook', 'valley'] }] },
    { id: 'owl',       name: '부엉이',       grp: '밤',   ev: 'owl',       hint: '맑은 밤', when: [{ phase: ['night'], weather: ['clear'], where: ['yard', 'farm', 'village', 'orchard', 'forest'] }] },
    { id: 'scops',     name: '소쩍새',       grp: '밤',   ev: 'scops',     hint: '봄·여름 밤 · 깊은 숲', when: [{ phase: ['night'], season: ['spring', 'summer'], weather: ['clear', 'fog'], where: ['deep'] }] },
    { id: 'brook',     name: '시냇물',       grp: '물',   ev: 'trickle',   hint: '강·계곡 캠핑장 물가', when: [{ where: ['brook'] }] },
    { id: 'fall',      name: '폭포',         grp: '물',   ev: 'fall',      hint: '기차 타고 산골 계곡', when: [{ where: ['valley'] }] },
    { id: 'bubble',    name: '온천 보글',    grp: '물',   ev: 'bubble',    hint: '기차 타고 온천 마을', when: [{ where: ['onsen'] }] },
    { id: 'surf',      name: '파도',         grp: '물',   ev: 'surf',      hint: '바다·섬·갯벌', when: [{ where: ['sea'] }] },
    { id: 'rain',      name: '빗소리',       grp: '물',   ev: 'drop',      hint: '비 오는 날 밖에서', when: [{ weather: ['rain'], where: ['out'] }] },
    { id: 'whale',     name: '고래 노래',    grp: '먼 곳', ev: 'whale',    hint: '먼바다·난바다·먼 섬·잠수', when: [{ where: ['far'] }] },
    { id: 'whistle',   name: '기차 기적',    grp: '먼 곳', ev: 'whistle',  hint: '기차 안에서', when: [{ where: ['train'] }] },
    { id: 'campfire',  name: '모닥불',       grp: '먼 곳', ev: 'crackle',  hint: '캠핑장 모닥불 곁', when: [{ fire: true }] },
    { id: 'firework',  name: '불꽃놀이 펑',  grp: '축제', ev: 'boom',      hint: '여름 축제 저녁·밤', when: [{ phase: ['evening', 'night'], fest: 'summer', where: ['out'] }] },
    { id: 'windbell',  name: '풍경 소리',    grp: '축제', ev: 'windbell',  hint: '마당에 풍경을 달거나 · 바람 부는 곳', when: [{ where: ['yard'], chime: true }, { where: ['wind'] }] },
    { id: 'snowstep',  name: '눈 밟는 소리', grp: '축제', ev: 'crunch',    hint: '눈 오는 날 밖에서 · 설원', when: [{ weather: ['snow'], where: ['out'] }, { where: ['snowfield'] }] },
    { id: 'mistsong',  name: '새벽 물안개 노래', grp: '전설', ev: 'mist', legend: true, rare: 4, hint: '안개 낀 이른 아침 · 계곡 물가 · 아주 드물게', when: [{ phase: ['morning'], weather: ['fog'], where: ['valley', 'brook'] }] }
  ];
  var REC_BY = {};
  REC_SOUNDS.forEach(function (d) { REC_BY[d.id] = d; });
  // n = sounds recorded (any ★); the last one is every sound
  var REC_MS = [
    { id: 'm5',   n: 5,  coins: 500,   title: '소리 줍는 아이' },
    { id: 'm10',  n: 10, coins: 1500,  title: '귀 밝은 농부' },
    { id: 'm15',  n: 15, coins: 3000,  title: '숲의 녹음사' },
    { id: 'm20',  n: 20, coins: 5000,  title: '소리 수집가' },
    { id: 'mall', n: REC_SOUNDS.length, coins: 10000, title: '소리 박사', deco: REC_DECO }
  ];
  var REC_ANNEX = { coins: 8000, title: '소리실 지기' };
  DECOS.push({ id: REC_DECO, name: '축음기', cost: 0, merchant: true, from: 'rec', sz: [14, 18] });

  function recById(id) { return REC_BY.hasOwnProperty(id) ? REC_BY[id] : null; }
  function recOk(s) { return !!(s.rec && s.rec.tool); }
  function recBuyWhy(s) { return recOk(s) ? 'owned' : s.rep < REC_REP ? 'rep' : s.coins < REC_COST ? 'coins' : 'ok'; }
  function recBuy(s) {
    var why = recBuyWhy(s);
    if (why !== 'ok') return { ok: false, why: why };
    s.coins -= REC_COST; s.rec = { tool: true, has: {}, got: {}, mus: {} };
    return { ok: true };
  }
  // the place tags of a view (and of the fishing spot on the 'farm' view)
  var REC_SPOT = { pond: ['farm', 'water'], river: ['farm', 'water', 'brook'], sea: ['sea'], island: ['sea'], offshore: ['sea', 'far'], ocean: ['sea', 'far'],
    valley: ['valley', 'water'], onsen: ['onsen', 'water'], snow: ['snowfield', 'wind'], cmpbrook: ['brook', 'water', 'forest'], cmpshore: ['sea'] };
  var REC_VIEW = { yard: ['yard'], forest: ['forest'], deep: ['forest', 'deep'], orchard: ['orchard'], village: ['village'], flat: ['sea'],
    island: ['sea'], farisle: ['sea', 'far'], port: ['sea'], peak: ['wind'], trnvalley: ['valley', 'water'], trnonsen: ['onsen'],
    trnsnow: ['snowfield', 'wind'], cmpforest: ['forest'], trnride: ['train'], dive: ['far'] };
  var REC_INDOOR = { house: true, home: true, museum: true, cave: true, stars: true, trnride: true, dive: true };
  function recPlace(view, spot) {
    var t = view === 'farm' ? (REC_SPOT[spot] || REC_SPOT.pond) : REC_VIEW[view] || [];
    return REC_INDOOR[view] ? t.slice() : t.concat(['out']);
  }
  // 1 in n game minutes, the same for every player (hash of the minute, like weatherAt)
  function recRareOk(now, n) {
    var h = Math.imul(Math.floor((now || 0) / 60e3) ^ 0x2f6b9a1d, 0x45d9f3b); h ^= h >>> 16;
    return (h >>> 0) % n === 0;
  }
  function recMatch(d, c) {
    var tags = recPlace(c.view, c.spot);
    var hit = d.when.some(function (w) {
      return (!w.phase || w.phase.indexOf(c.phase) >= 0) && (!w.season || w.season.indexOf(c.season) >= 0) &&
        (!w.weather || w.weather.indexOf(c.weather) >= 0) && (!w.fest || w.fest === c.festival) &&
        (!w.fire || !!c.fire) && (!w.chime || !!c.chime) &&
        (!w.where || w.where.some(function (p) { return tags.indexOf(p) >= 0; }));
    });
    return hit && (!d.rare || recRareOk(c.now, d.rare));
  }
  function recNow(c) { return REC_SOUNDS.filter(function (d) { return recMatch(d, c); }).map(function (d) { return d.id; }); }
  function recCount(s) { return s.rec ? Object.keys(s.rec.has).length : 0; }
  function recQ(s, id) { return (s.rec && s.rec.has[id]) || 0; }
  // the milestones just reached: coins paid, the last one gives the 축음기
  function recMilestones(s) {
    var n = recCount(s), out = [];
    REC_MS.forEach(function (m) {
      if (n < m.n || s.rec.got[m.id]) return;
      s.rec.got[m.id] = true; s.coins += m.coins;
      var r = { id: m.id, n: m.n, coins: m.coins, title: m.title };
      if (m.deco) { var g = grantDeco(s, m.deco); r.deco = g.ok ? m.deco : null; r.stored = !!g.stored; }
      out.push(r);
    });
    return out;
  }
  // how: 'auto' → ★1 only into an empty slot; 'tap' → ★2, or ★3 when it is ★2 already
  // → { ok, why?, q, first, up, ms: [milestones reached] }
  function recTake(s, id, how) {
    if (!recOk(s)) return { ok: false, why: 'tool' };
    if (!recById(id)) return { ok: false, why: 'none' };
    var cur = recQ(s, id), q = how === 'tap' ? (cur >= 2 ? 3 : 2) : 1;
    if (q <= cur) return { ok: false, why: cur >= 3 ? 'max' : 'got', q: cur };
    s.rec.has[id] = q;
    return { ok: true, q: q, first: !cur, up: !!cur, ms: cur ? [] : recMilestones(s) };
  }
  function recTitles(s) {
    var out = REC_MS.filter(function (m) { return !!(s.rec && s.rec.got[m.id]); }).map(function (m) { return m.title; });
    if (s.rec && s.rec.got.annex) out.push(REC_ANNEX.title);
    return out;
  }

  // ---------- 박물관 별관 소리실: one recording per sound (the recording stays in the 도감) ----------
  function recAnnexOk(s) { return recOk(s) && museumOk(s); }
  function recAnnexCount(s) { return { n: s.rec ? Object.keys(s.rec.mus).length : 0, m: REC_SOUNDS.length }; }
  function recAnnexCan(s) {
    if (!recAnnexOk(s)) return [];
    return REC_SOUNDS.filter(function (d) { return s.rec.has[d.id] && !s.rec.mus[d.id]; }).map(function (d) { return d.id; });
  }
  // → { ok, why?, done?, reward?: { coins, title } }
  function recDonate(s, id) {
    if (!recAnnexOk(s)) return { ok: false, why: 'closed' };
    if (!recById(id)) return { ok: false, why: 'room' };
    if (s.rec.mus[id]) return { ok: false, why: 'got' };
    if (!s.rec.has[id]) return { ok: false, why: 'need' };
    s.rec.mus[id] = true;
    var c = recAnnexCount(s), out = { ok: true, done: c.n >= c.m };
    if (out.done && !s.rec.got.annex) { s.rec.got.annex = true; s.coins += REC_ANNEX.coins; out.reward = { coins: REC_ANNEX.coins, title: REC_ANNEX.title }; }
    return out;
  }

  // ---------- save: called by decode() (absent in older saves); one broken field never loses the others ----------
  function decodeRec(o, s) {
    var q = o.rec;
    function obj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
    if (!obj(q) || q.tool !== true) return;
    var r = { tool: true, has: {}, got: {}, mus: {} };
    if (obj(q.has)) REC_SOUNDS.forEach(function (d) { var v = q.has[d.id]; if (v === 1 || v === 2 || v === 3) r.has[d.id] = v; });
    if (obj(q.got)) REC_MS.map(function (m) { return m.id; }).concat(['annex']).forEach(function (k) { if (q.got[k] === true) r.got[k] = true; });
    if (obj(q.mus)) REC_SOUNDS.forEach(function (d) { if (q.mus[d.id] === true && r.has[d.id]) r.mus[d.id] = true; });
    s.rec = r;
  }

  expose({
    REC_COST: REC_COST, REC_REP: REC_REP, REC_DECO: REC_DECO, REC_SOUNDS: REC_SOUNDS, REC_MS: REC_MS, REC_ANNEX: REC_ANNEX,
    recById: recById, recOk: recOk, recBuyWhy: recBuyWhy, recBuy: recBuy, recPlace: recPlace, recMatch: recMatch, recNow: recNow,
    recCount: recCount, recQ: recQ, recTake: recTake, recTitles: recTitles,
    recAnnexOk: recAnnexOk, recAnnexCount: recAnnexCount, recAnnexCan: recAnnexCan, recDonate: recDonate, decodeRec: decodeRec
  });
