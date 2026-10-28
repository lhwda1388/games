  // ---------- 곤충 채집 (stage 6A): insects in 밭·마당·숲·과수원, the net, 표본 상자 (s.bugs, made when the net is bought) ----------
  // An insect flies in, lands a few times, then leaves. Tap it while it sits still to catch it; a tap while it flies
  // just startles it away (nothing is lost). Caught: 놓아주기 (a few coins) or 표본 상자 (one of each kind, a house decoration).
  // env = { season, phase, weather }. wx: 'dry' = not rain/snow, 'clear', or an exact weather.
  var BUG_W = { '흔함': 30, '드묾': 12, '희귀': 4, '전설': 1 };
  // how long it sits (ms, ×0.8–1.2): about 0.9–1.6 s, rarer ones a little shorter; still a light timing tap in a tiny PiP
  var BUG_STOP = { '흔함': 1350, '드묾': 1250, '희귀': 1150, '전설': 1050 };
  var BUG_HIT = 18;   // tap radius (logical px) around a sitting insect; a flying one only takes taps right on it
  var BUG_PLACES = { farm: '밭', yard: '마당', forest: '숲', orchard: '과수원' };
  var BUGS = [
    { id: 'cabbagewhite',  name: '배추흰나비', rarity: '흔함', price: 15,  season: ['spring', 'summer'], phase: ['morning', 'day'], wx: 'dry', at: ['farm', 'yard'], hint: '봄여름 낮 · 배추밭 위를 팔랑' },
    { id: 'sulphur',       name: '노랑나비',   rarity: '흔함', price: 15,  season: ['spring'], phase: ['day'], wx: 'dry', at: ['farm', 'yard', 'orchard'], hint: '봄볕 아래 노란 날개' },
    { id: 'swallowtail',   name: '호랑나비',   rarity: '드묾', price: 60,  season: ['spring', 'summer'], phase: ['day'], wx: 'dry', at: ['yard', 'orchard'], hint: '꽃 많은 곳 · 커다란 줄무늬 날개' },
    { id: 'honeybee',      name: '꿀벌',       rarity: '흔함', price: 12,  season: ['spring', 'summer', 'autumn'], phase: ['morning', 'day'], wx: 'dry', at: ['orchard', 'yard'], hint: '꽃 곁에서 윙윙 · 과수원에 많다' },
    { id: 'ladybug',       name: '무당벌레',   rarity: '흔함', price: 18,  season: ['spring', 'summer'], phase: ['morning', 'day'], at: ['farm', 'orchard'], hint: '진딧물 사냥꾼 · 점 일곱 개' },
    { id: 'ant',           name: '개미',       rarity: '흔함', price: 5,   season: ['spring', 'summer', 'autumn'], phase: ['day'], at: ['farm', 'yard', 'forest'], hint: '줄지어 가는 부지런한 일꾼' },
    { id: 'mayfly',        name: '하루살이',   rarity: '드묾', price: 40,  season: ['spring'], phase: ['morning'], wx: 'fog', at: ['farm'], hint: '봄 · 안개 낀 아침 물가' },
    { id: 'dragonfly',     name: '밀잠자리',   rarity: '흔함', price: 15,  season: ['summer'], phase: ['day'], wx: 'dry', at: ['farm'], hint: '여름 연못가 · 꼬리가 푸르스름' },
    { id: 'emperor',       name: '왕잠자리',   rarity: '드묾', price: 70,  season: ['summer'], phase: ['day', 'evening'], wx: 'dry', at: ['farm'], hint: '여름 연못 위를 크게 도는 녀석' },
    { id: 'damselfly',     name: '실잠자리',   rarity: '드묾', price: 50,  season: ['summer'], phase: ['morning'], at: ['farm'], hint: '여름 아침 · 물풀 끝에 가느다랗게' },
    { id: 'redragonfly',   name: '고추잠자리', rarity: '흔함', price: 20,  season: ['autumn'], phase: ['day', 'evening'], wx: 'dry', at: ['farm', 'yard', 'orchard'], hint: '가을 하늘 · 빨간 꼬리' },
    { id: 'cicada',        name: '참매미',     rarity: '흔함', price: 20,  season: ['summer'], phase: ['day'], wx: 'dry', at: ['forest', 'yard', 'orchard'], hint: '맴맴 · 한여름 낮 나무에' },
    { id: 'eveningcicada', name: '쓰르라미',   rarity: '드묾', price: 60,  season: ['summer'], phase: ['evening'], at: ['forest'], hint: '여름 저녁 숲 · 쓰름쓰름' },
    { id: 'grasshopper',   name: '방아깨비',   rarity: '흔함', price: 15,  season: ['summer', 'autumn'], phase: ['day'], wx: 'dry', at: ['farm', 'yard'], hint: '풀밭에서 끄덕끄덕 방아 찧기' },
    { id: 'katydid',       name: '여치',       rarity: '흔함', price: 18,  season: ['summer', 'autumn'], phase: ['day', 'evening'], at: ['farm', 'forest'], hint: '풀숲에서 찌르르' },
    { id: 'cricket',       name: '귀뚜라미',   rarity: '흔함', price: 18,  season: ['autumn'], phase: ['evening', 'night'], at: ['yard', 'farm'], hint: '가을밤 마당 · 귀뚤귀뚤' },
    { id: 'mantis',        name: '사마귀',     rarity: '드묾', price: 60,  season: ['autumn'], phase: ['day'], at: ['orchard', 'farm'], hint: '가을 과수원 · 앞발을 모은 사냥꾼' },
    { id: 'firefly',       name: '반딧불이',   rarity: '드묾', price: 80,  season: ['summer'], phase: ['night'], wx: 'dry', at: ['forest', 'yard'], hint: '여름밤 · 맑은 날 숲가에 반짝' },
    { id: 'stagbeetle',    name: '사슴벌레',   rarity: '희귀', price: 220, season: ['summer'], phase: ['night'], at: ['forest'], hint: '여름밤 참나무 수액 · 커다란 턱' },
    { id: 'rhinobeetle',   name: '장수풍뎅이', rarity: '희귀', price: 260, season: ['summer'], phase: ['evening', 'night'], at: ['forest', 'orchard'], hint: '여름밤 · 뿔 달린 힘센 장수' },
    { id: 'chafer',        name: '풍뎅이',     rarity: '흔함', price: 20,  season: ['summer'], phase: ['evening'], at: ['orchard', 'yard'], hint: '여름 저녁 과수원 · 반들반들' },
    { id: 'longhorn',      name: '하늘소',     rarity: '드묾', price: 90,  season: ['summer'], phase: ['day'], at: ['forest'], hint: '여름 숲 · 몸보다 긴 더듬이' },
    { id: 'jewelbeetle',   name: '비단벌레',   rarity: '전설', price: 600, season: ['summer'], phase: ['day'], wx: 'clear', at: ['forest'], hint: '맑은 여름 숲 · 무지갯빛 등 (아주 드물게)' },
    { id: 'divingbeetle',  name: '물방개',     rarity: '드묾', price: 70,  season: ['spring', 'summer'], wx: 'rain', at: ['farm'], hint: '비 오는 날 연못가로 기어 나온다' },
    { id: 'moth',          name: '나방',       rarity: '흔함', price: 10,  season: ['spring', 'summer', 'autumn'], phase: ['night'], at: ['yard'], hint: '밤 마당 · 불빛 곁에 모인다' },
    { id: 'wintermoth',    name: '겨울자나방', rarity: '드묾', price: 50,  season: ['winter'], phase: ['evening', 'night'], at: ['yard', 'orchard'], hint: '겨울밤에만 나는 나방' },
    { id: 'springtail',    name: '톡토기',     rarity: '흔함', price: 15,  season: ['winter'], wx: 'snow', at: ['forest', 'yard', 'farm'], hint: '눈 오는 날 · 눈 위에서 톡톡' },
    { id: 'stonefly',      name: '강도래',     rarity: '드묾', price: 45,  season: ['winter'], phase: ['morning', 'day'], at: ['forest'], hint: '겨울 개울가 · 추운 날에 나온다' }
  ];
  var BUG_BY = {};
  BUGS.forEach(function (b) { BUG_BY[b.id] = b; });
  var NET_COST = 600, BUG_GRACE = 90, BUG_STOPS = 5, BUGBOX_SPOT = 3;   // the free wall spot beside the lamp
  // the 표본 상자 is house furniture (given free with the first specimen, or bought)
  FURN.push({ id: 'bugbox', name: '표본 상자', cost: 800, house: 0, sz: [20, 14] });

  function bugById(id) { return BUG_BY.hasOwnProperty(id) ? BUG_BY[id] : null; }
  function bugWxOk(b, w) { return !b.wx || (b.wx === 'dry' ? w !== 'rain' && w !== 'snow' : b.wx === w); }
  // conditional = only at some time of day or weather (seasons alone count too, as for fish)
  function bugConditional(b) { return !!(b.season || b.phase || b.wx); }
  // 0 = not here now. s optional: an uncaught conditional insect gets the 첫 만남 보정 (FIRST_MUL, as for fish and finds)
  function bugWeight(b, place, env, s) {
    if (b.at.indexOf(place) < 0) return 0;
    if (b.season && b.season.indexOf(env.season) < 0) return 0;
    if (b.phase && b.phase.indexOf(env.phase) < 0) return 0;
    if (!bugWxOk(b, env.weather)) return 0;
    var w = BUG_W[b.rarity];
    if (s && s.bugs && bugConditional(b) && !s.bugs.dex[b.id]) w *= FIRST_MUL;
    return w;
  }
  function bugPool(place, env, s) {
    var out = [];
    BUGS.forEach(function (b) { var w = bugWeight(b, place, env, s); if (w > 0) out.push({ id: b.id, w: w }); });
    return out;
  }
  function rollBug(place, env, rng, s) { var p = bugPool(place, env, s); return p.length ? pick(p, rng).id : null; }

  // ---------- flight: lands BUG_STOPS times, flies in between, then out. t in the UI's real ms ----------
  function bugFlight(id, start, rng) {
    var b = bugById(id), stay = BUG_STOP[b.rarity], t = start, stops = [];
    var from = { x: rng() < 0.5 ? -8 : 188, y: 40 + rng() * 120 };
    for (var k = 0; k < BUG_STOPS; k++) {
      t += 900 + rng() * 900;
      var d = stay * (0.8 + rng() * 0.4);
      stops.push({ x: Math.round(18 + rng() * 144), y: Math.round(46 + rng() * 132), t0: Math.round(t), t1: Math.round(t + d) });
      t += d;
    }
    return { id: id, from: from, to: { x: from.x < 0 ? 188 : -8, y: 30 + rng() * 60 }, stops: stops, end: Math.round(t + 1200) };
  }
  // where it is at t: { x, y, sit } (null before it comes or after it left); between stops it flies in a bobbing line
  function bugPos(fl, t) {
    if (t < fl.stops[0].t0 - 1800 || t > fl.end) return null;
    var prev = { x: fl.from.x, y: fl.from.y, t1: fl.stops[0].t0 - 1800 };
    for (var k = 0; k <= fl.stops.length; k++) {
      var s = k < fl.stops.length ? fl.stops[k] : { x: fl.to.x, y: fl.to.y, t0: fl.end, t1: fl.end };
      if (t < s.t0) {
        var u = Math.max(0, Math.min(1, (t - prev.t1) / Math.max(1, s.t0 - prev.t1)));
        return { x: prev.x + (s.x - prev.x) * u, y: prev.y + (s.y - prev.y) * u - Math.sin(u * Math.PI) * 10, sit: false };
      }
      if (t <= s.t1) return { x: s.x, y: s.y, sit: true };
      prev = s;
    }
    return null;
  }
  // 'catch' while it sits (a little grace after it lifts), else 'miss'
  function bugJudge(fl, t) {
    for (var k = 0; k < fl.stops.length; k++) if (t >= fl.stops[k].t0 && t <= fl.stops[k].t1 + BUG_GRACE) return 'catch';
    return 'miss';
  }

  // ---------- net, catch, release, specimen box ----------
  function netOk(s) { return !!s.bugs; }
  function buyNet(s) {
    if (s.bugs) return { ok: false, why: 'owned' };
    if (s.coins < NET_COST) return { ok: false, why: 'coins' };
    s.coins -= NET_COST; s.bugs = { dex: {}, box: {}, n: 0, rel: 0 };
    return { ok: true };
  }
  function catchBug(s, id) {
    if (!s.bugs || !bugById(id)) return null;
    var first = !s.bugs.dex[id];
    s.bugs.dex[id] = Math.min(1e6, (s.bugs.dex[id] || 0) + 1);
    s.bugs.n = Math.min(1e9, s.bugs.n + 1);
    return { id: id, first: first, boxed: !!s.bugs.box[id] };
  }
  function releaseBug(s, id) {
    var b = bugById(id);
    if (!s.bugs || !b) return 0;
    s.coins += b.price; s.bugs.rel = Math.min(1e9, s.bugs.rel + 1);
    return b.price;
  }
  // one of each kind; the first specimen brings the box into the house (or its 보관함 when there's no room)
  function keepBug(s, id) {
    if (!s.bugs || !bugById(id) || s.bugs.box[id]) return { ok: false, why: 'owned' };
    s.bugs.box[id] = true;
    var y = yardOf(s), gift = !y.furn.bugbox;
    if (gift) { y.furn.bugbox = true; if (!placeItem(s, 'furn', 'bugbox', BUGBOX_SPOT).ok) placeItem(s, 'furn', 'bugbox'); }
    return { ok: true, gift: gift };
  }
  function bugDexCount(s) { return s.bugs ? Object.keys(s.bugs.dex).length : 0; }
  function boxList(s) { return s.bugs ? BUGS.filter(function (b) { return s.bugs.box[b.id]; }).map(function (b) { return b.id; }) : []; }

  // ---------- save ----------
  function decodeBugs(o, s) {
    var q = o.bugs;
    if (!q || typeof q !== 'object' || Array.isArray(q)) return;
    var num = function (x) { return typeof x === 'number' && isFinite(x); };
    var b = s.bugs = { dex: {}, box: {}, n: 0, rel: 0 };
    BUGS.forEach(function (d) {
      if (q.dex && num(q.dex[d.id]) && q.dex[d.id] > 0) b.dex[d.id] = Math.min(1e6, Math.floor(q.dex[d.id]));
      if (q.box && q.box[d.id] === true) b.box[d.id] = true;
    });
    if (num(q.n) && q.n > 0) b.n = Math.min(1e9, Math.floor(q.n));
    if (num(q.rel) && q.rel > 0) b.rel = Math.min(1e9, Math.floor(q.rel));
  }
  // stage 6A save block: 과수원, 양봉, 곤충 (all optional)
  function decodeStage6A(o, s) { decodeOrchard(o, s); decodeBugs(o, s); }

  expose({
    BUGS: BUGS, BUG_W: BUG_W, BUG_STOP: BUG_STOP, BUG_PLACES: BUG_PLACES, NET_COST: NET_COST, BUG_GRACE: BUG_GRACE, BUG_HIT: BUG_HIT,
    bugById: bugById, bugConditional: bugConditional, bugWeight: bugWeight, bugPool: bugPool, rollBug: rollBug,
    bugFlight: bugFlight, bugPos: bugPos, bugJudge: bugJudge, netOk: netOk, buyNet: buyNet, catchBug: catchBug,
    releaseBug: releaseBug, keepBug: keepBug, bugDexCount: bugDexCount, boxList: boxList, decodeBugs: decodeBugs, decodeStage6A: decodeStage6A
  });
