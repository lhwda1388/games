  // ---------- 계절 도감 챌린지 (stage 10 ④): "이번 계절에 꼭 볼 것 5개" per game season (= one real week) ----------
  // The card is picked once per week (deterministic from the week and what the player can reach) and kept,
  // so goals tick off from real records (도감 counts) instead of vanishing. Goal = { k: kind, id, b: count at pick };
  // done when the count goes above b. Pick order, each by a week hash, at most QUEST_CAT_CAP of a kind per pass:
  //   1. only-this-season things not recorded yet  2. this-and-other-season things not recorded
  //   3. this-season things recorded already ("again")  4. everyday basics ("again": 무·붕어…)
  // Completing gives that season's decoration once (s.quest.got), later completions QUEST_COINS. A missed season
  // simply comes round again next game year. s.quest = { w, list, ok, card, got } is optional (older saves: none).
  var QUEST_N = 5, QUEST_CAT_CAP = 2, QUEST_COINS = 3000;
  var QUEST_DECOS = { spring: 'qazalea', summer: 'qsunflower', autumn: 'qmaple', winter: 'qsnowlamp' };
  [
    { id: 'qazalea',    name: '진달래 화분',   cost: 0, merchant: true, from: 'quest', sz: [12, 16] },
    { id: 'qsunflower', name: '해바라기',      cost: 0, merchant: true, from: 'quest', sz: [10, 24] },
    { id: 'qmaple',     name: '단풍 분재',     cost: 0, merchant: true, from: 'quest', sz: [14, 16] },
    { id: 'qsnowlamp',  name: '눈꽃 등',       cost: 0, merchant: true, from: 'quest', sz: [10, 20] }
  ].forEach(function (d) { DECOS.push(d); });
  var QUEST_KIND_NAME = { fish: '물고기', crop: '작물', forage: '채집', bug: '곤충', flat: '갯벌', star: '별자리' };

  function questWeek(now, tzMin) { return Math.floor((now + (tzMin || 0) * 60e3 - MON0) / WEEK_MS); }
  function questSeason(w) { return SEASONS[((w % 4) + 4) % 4]; }
  function qSeasons(x) { return Array.isArray(x.season) ? x.season : x.season ? [x.season] : []; }
  function qPlace(s, p) {
    if (p === 'farm' || p === 'yard') return true;
    if (p === 'forest') return forestOk(s);
    if (p === 'orchard') return orchardOk(s);
    if (p === 'deep' || p === 'peak') return rideOk(s, p);
    return false;
  }
  // kind → table, record count, and "can the player reach it now"
  var QK = {
    fish: { list: function () { return FISH; }, n: function (s, id) { return s.dex.fish[id] ? s.dex.fish[id].n : 0; },
      ok: function (s, f) { return fishOpen(s, f) && !f.fest && !f.egg && !f.window; }, def: fishById },
    crop: { list: function () { return SEASON_CROPS; }, n: function (s, id) { return s.dex.crops[id] || 0; },
      ok: function () { return true; }, def: function (id) { return CROPS[id] ? { id: id, name: CROPS[id].name, season: CROPS[id].season, hint: CROPS[id].hint || '', rarity: '흔함' } : null; } },
    forage: { list: function () { return FORAGE; }, n: function (s, id) { return (s.forest && s.forest.dex[id]) || 0; },
      ok: function (s, f) { return forestOk(s) && (!f.place || rideOk(s, f.place)); }, def: forageById },
    bug: { list: function () { return BUGS; }, n: function (s, id) { return (s.bugs && s.bugs.dex[id]) || 0; },
      ok: function (s, b) { return netOk(s) && (b.at || []).some(function (p) { return qPlace(s, p); }); }, def: function (id) { return BUG_BY.hasOwnProperty(id) ? BUG_BY[id] : null; } },
    flat: { list: function () { return FLAT; }, n: function (s, id) { return (s.flat && s.flat.dex[id]) || 0; },
      ok: function (s) { return flatOk(s); }, def: flatById },
    star: { list: function () { return STARS; }, n: function (s, id) { return s.sky && s.sky.seen[id] ? 1 : 0; },
      ok: function (s, c) { return skyOk(s) && !c.peak; }, def: starById }
  };
  var QK_IDS = ['fish', 'crop', 'forage', 'bug', 'flat', 'star'];

  function questItem(k, id) {
    var q = QK[k], d = q && q.def(id);
    if (!d) return null;
    return { name: d.name, hint: d.hint || '', kind: QUEST_KIND_NAME[k], def: d };
  }
  function qCount(s, g) { return QK[g.k].n(s, g.id); }
  function qHash(w, key) {
    var h = 2166136261 ^ w;
    for (var i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
    return h >>> 0;
  }
  function questPick(s, w) {
    var se = questSeason(w), tiers = [[], [], [], []];
    QK_IDS.forEach(function (k) {
      QK[k].list().forEach(function (x) {
        var ss = qSeasons(x);
        if (ss.indexOf(se) < 0 || x.rarity === '전설' || !QK[k].ok(s, x)) return;
        var n = QK[k].n(s, x.id);
        if (n && k === 'star') return;   // seen stars stay at 1: "한 번 더" could never tick off
        tiers[n ? 2 : ss.length === 1 ? 0 : 1].push({ k: k, id: x.id, b: n });
      });
    });
    // basics anyone can do: plain seeds, plain 연못 fish
    BASE_SEEDS.forEach(function (id) { tiers[3].push({ k: 'crop', id: id, b: s.dex.crops[id] || 0 }); });
    FISH.forEach(function (f) {
      if (!f.spot && f.rarity === '흔함' && !isConditional(f) && !f.window && !f.unlock && !f.egg) tiers[3].push({ k: 'fish', id: f.id, b: QK.fish.n(s, f.id) });
    });
    var out = [], used = {}, per = {};
    tiers.forEach(function (tier) {
      tier.sort(function (a, b) { return qHash(w, a.k + a.id) - qHash(w, b.k + b.id); });
      [true, false].forEach(function (capped) {
        tier.forEach(function (g) {
          if (out.length >= QUEST_N || used[g.k + ':' + g.id] || (capped && (per[g.k] || 0) >= QUEST_CAT_CAP)) return;
          used[g.k + ':' + g.id] = true; per[g.k] = (per[g.k] || 0) + 1; out.push(g);
        });
      });
    });
    return out;
  }
  // this week's card (made on first look in a new week). Returns s.quest.
  function questEnsure(s, now, tzMin) {
    var w = questWeek(now, tzMin), q = s.quest;
    if (q && q.w === w) return q;
    var got = q ? q.got : {};
    s.quest = { w: w, list: questPick(s, w), ok: false, card: null, got: got };
    return s.quest;
  }
  function questProgress(s) {
    var q = s.quest;
    if (!q) return { n: 0, list: [], season: null, ok: false };
    var list = q.list.map(function (g) {
      var it = questItem(g.k, g.id);
      return { k: g.k, id: g.id, again: g.b > 0, plain: !qSeasons(it.def).length, done: qCount(s, g) > g.b, name: it.name, hint: it.hint, kind: it.kind };
    });
    return { n: list.filter(function (g) { return g.done; }).length, list: list, season: questSeason(q.w), ok: q.ok };
  }
  // all done → the reward, once per card; null otherwise
  function questClaim(s) {
    var q = s.quest;
    if (!q || q.ok || questProgress(s).n < q.list.length || !q.list.length) return null;
    q.ok = true;
    var se = questSeason(q.w), id = QUEST_DECOS[se];
    if (!q.got[se] && !(s.yard && s.yard.deco[id])) {
      q.got[se] = true;
      return { season: se, deco: id, stored: grantDeco(s, id).stored };
    }
    q.got[se] = true;
    s.coins += QUEST_COINS;
    return { season: se, coins: QUEST_COINS };
  }
  function questCardDue(s) { return !!s.quest && s.quest.card !== s.quest.w; }
  function questCardSeen(s) { if (s.quest) s.quest.card = s.quest.w; }

  function decodeQuest(o, s) {
    var q = o.quest, num = function (x) { return typeof x === 'number' && isFinite(x); };
    if (!q || typeof q !== 'object' || !num(q.w) || !Array.isArray(q.list)) return;
    var list = [];
    q.list.forEach(function (g) {
      if (list.length >= QUEST_N || !g || !QK.hasOwnProperty(g.k) || typeof g.id !== 'string' || !questItem(g.k, g.id) || !num(g.b) || g.b < 0) return;
      list.push({ k: g.k, id: g.id, b: Math.floor(g.b) });
    });
    var got = {};
    if (q.got && typeof q.got === 'object') SEASONS.forEach(function (se) { if (q.got[se] === true) got[se] = true; });
    s.quest = { w: Math.floor(q.w), list: list, ok: q.ok === true, card: num(q.card) ? Math.floor(q.card) : null, got: got };
  }

  expose({
    QUEST_N: QUEST_N, QUEST_CAT_CAP: QUEST_CAT_CAP, QUEST_COINS: QUEST_COINS, QUEST_DECOS: QUEST_DECOS, QUEST_KIND_NAME: QUEST_KIND_NAME,
    questWeek: questWeek, questSeason: questSeason, questItem: questItem, questEnsure: questEnsure, questProgress: questProgress,
    questClaim: questClaim, questCardDue: questCardDue, questCardSeen: questCardSeen, decodeQuest: decodeQuest
  });
