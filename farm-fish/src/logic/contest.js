  // ---------- stage 10 ①: 박 영감 낚시 대회 (real week), 한 해 결산 카드 (game year), 농장 간판 ----------
  // s.cont, s.yr and s.farm are all optional and made on first use; older saves simply have none.

  // ----- 낚시 대회: the week's best catch (size fraction 0..1 of its species) against 박 영감's mark -----
  var CONTEST_FRIEND = 1;                     // 박 영감 친밀도 that opens it
  var CONTEST_BASE = 0.94, CONTEST_STEP = 0.01, CONTEST_JIT = 0.06, CONTEST_MAX = 0.997;
  var CONTEST_MARGIN = { gold: 0.01, silver: 0.004 };   // how far past his mark (else 동)
  var CONTEST_COINS = { gold: 10000, silver: 6000, bronze: 3000 };
  var CONTEST_DUP_COINS = 2000;               // that trophy is already in the yard
  var CONTEST_TRY_COINS = 500;                // took part and lost: 참가상
  var CONTEST_FISH = ['carp', 'catfish', 'crucian', 'trout', 'bass', 'eel', 'snapper', 'flounder'];
  var CONTEST_KEEP = 12;                      // letters kept in 기록
  var TROPHY_SHAPES = [
    { id: 'trcup', name: '우승컵' }, { id: 'trshield', name: '방패' }, { id: 'trfish', name: '물고기상' }, { id: 'trstar', name: '별 메달' }
  ];
  var TROPHY_TIERS = { gold: '금', silver: '은', bronze: '동' };
  TROPHY_SHAPES.forEach(function (sh) {
    Object.keys(TROPHY_TIERS).forEach(function (t) {
      DECOS.push({ id: sh.id + '_' + t.charAt(0), name: TROPHY_TIERS[t] + ' ' + sh.name, cost: 0, merchant: true, from: 'contest', sz: [12, 18] });
    });
  });
  var CONTEST_LETTERS = [
    '허허, 이번 주도 내가 이겼군. 자네 찌는 아직 졸고 있나 보이. 다음 주엔 좀 더 큰 놈을 데려와 보게.',
    '내 물고기 봤나? 자네 것 옆에 두니 꼭 어른과 아이 같더군. 실망 말게, 나도 처음엔 피라미만 낚았지.',
    '젊은이, 낚시는 기다림이야. 이번 주 자네는 조금 덜 기다렸어. 다음 주에 다시 겨뤄 보세. (참가상 동봉)',
    '박 영감 기록, 이번 주에도 무사함. …농담일세. 자네 손맛이 늘고 있는 게 보여. 그래도 아직 멀었지.',
    '이번 주 내 물고기 크기를 재 보니 자네 것보다 한 뼘은 크더군. 자로 잰 건 아니고 눈대중이네만.',
    '자네가 이기면 내 낚시 모자를 걸겠네. 아, 이번 주는 모자가 무사하구먼. 허허.'
  ];
  function contestOk(s) { return friendLevel(s, 'fisher') >= CONTEST_FRIEND; }
  // real local week, Monday start (same anchor as the game clock)
  function contestWeek(now, tzMin) { return Math.floor((now + (tzMin || 0) * 60e3 - MON0) / WEEK_MS); }
  function contestLeft(now, tzMin) { return MON0 + (contestWeek(now, tzMin) + 1) * WEEK_MS - (now + (tzMin || 0) * 60e3); }
  // 0..4: rod tier + 바다 open
  function contestLevel(s) { return Math.min(4, tier(s, 'rod') + (spotUnlocked(s, 'sea') ? 1 : 0)); }
  function contestMark(wk, lv) {
    var r = seedRng(strHash('contest:' + wk)), pool = CONTEST_FISH.filter(function (id) { return !!fishById(id); });
    var id = pool[Math.floor(r() * pool.length) % pool.length], f = fishById(id);
    var fr = Math.min(CONTEST_MAX, CONTEST_BASE + CONTEST_STEP * (lv || 0) + CONTEST_JIT * r());
    fr = Math.round(fr * 1000) / 1000;
    return { fish: id, size: Math.round((f.min + (f.max - f.min) * fr) * 10) / 10, f: fr };
  }
  function contestTier(f, mark) {
    if (f < mark) return null;
    var d = f - mark + 1e-9;
    return d >= CONTEST_MARGIN.gold ? 'gold' : d >= CONTEST_MARGIN.silver ? 'silver' : 'bronze';
  }
  function trophyId(wk, t) { return TROPHY_SHAPES[((wk % TROPHY_SHAPES.length) + TROPHY_SHAPES.length) % TROPHY_SHAPES.length].id + '_' + t.charAt(0); }
  function contestLetter(m) { return m && CONTEST_LETTERS[m.k] || null; }
  function newWeek(s, wk) { return { wk: wk, lv: contestLevel(s), best: null }; }
  function contestOf(s, wk) {
    if (!s.cont) s.cont = { wk: wk, lv: contestLevel(s), best: null, won: {}, mail: [], news: null };
    return s.cont;
  }
  // settles the last week once a new one starts → the result (also kept in s.cont.news until shown), else null
  function contestTick(s, now, tzMin) {
    if (!s.cont && !contestOk(s)) return null;
    var wk = contestWeek(now, tzMin), c = contestOf(s, wk);
    if (wk <= c.wk) return null;
    var out = null, mk = contestMark(c.wk, c.lv);
    if (c.best && !c.won[c.wk]) {
      var t = contestTier(c.best.f, mk.f);
      out = { wk: c.wk, win: !!t, best: c.best, mark: mk };
      if (t) {
        var id = trophyId(c.wk, t), g = grantDeco(s, id);
        out.tier = t; out.trophy = id; out.owned = !g.ok; out.stored = !!g.stored;
        out.coins = CONTEST_COINS[t] + (g.ok ? 0 : CONTEST_DUP_COINS);
        c.won[c.wk] = t;
      } else {
        var k = strHash('tease:' + c.wk) % CONTEST_LETTERS.length;
        out.coins = CONTEST_TRY_COINS; out.letter = CONTEST_LETTERS[k];
        c.mail.push({ wk: c.wk, k: k });
        if (c.mail.length > CONTEST_KEEP) c.mail.shift();
      }
      s.coins += out.coins;
      c.news = out;
    }
    var nw = newWeek(s, wk);
    c.wk = nw.wk; c.lv = nw.lv; c.best = null;
    return out;
  }
  function contestNews(s) { var n = s.cont && s.cont.news; if (!n) return null; s.cont.news = null; return n; }
  // after landFish → { best: new best this week?, ahead: at/over his mark?, f, mark } or null
  function contestCatch(s, roll, now, tzMin) {
    if (!contestOk(s) || !fishById(roll.id)) return null;
    contestTick(s, now, tzMin);
    var c = contestOf(s, contestWeek(now, tzMin)), f = Math.round(sizeFrac(roll) * 1000) / 1000, mk = contestMark(c.wk, c.lv);
    var better = !c.best || f > c.best.f;
    if (better) c.best = { id: roll.id, size: roll.size, f: f };
    return { best: better, ahead: c.best.f >= mk.f, f: f, mark: mk };
  }
  function contestState(s, now, tzMin) {
    if (!s.cont) return null;
    return { wk: s.cont.wk, mark: contestMark(s.cont.wk, s.cont.lv), best: s.cont.best, left: contestLeft(now, tzMin),
      won: Object.keys(s.cont.won).length };
  }
  // marks sit near the top of the size range, so one decimal (99.7%) keeps close weeks apart
  function contestPct(f) { return Math.round(f * 1000) / 10 + '%'; }
  // 박 영감's line about this week's contest
  function contestTalk(s, now, tzMin) {
    contestTick(s, now, tzMin);
    var st = contestState(s, now, tzMin);
    if (!st) return null;
    var mk = st.mark, mine = fishById(mk.fish).name + ' ' + mk.size.toFixed(1) + 'cm(크기 ' + contestPct(mk.f) + ')';
    if (!st.best) return '이번 주 내 기록은 ' + mine + '일세. 자네는 아직 한 마리도 안 보여 줬구먼.';
    var b = st.best, yours = fishById(b.id).name + ' ' + b.size.toFixed(1) + 'cm(' + contestPct(b.f) + ')';
    if (b.f >= mk.f) return '…자네 ' + yours + ', 내 ' + mine + '보다 낫군. 아직 주말이 남았네. 두고 보게.';
    return '내 기록 ' + mine + ', 자네는 ' + yours + '. 허허, 아직 멀었네.';
  }

  // ----- 한 해 결산 카드: one game year = 4 seasons = 4 real weeks (spring first) -----
  var YEAR_KEEP = 8;
  function gameYear(now, tzMin) { return Math.floor((now + (tzMin || 0) * 60e3 - MON0) / (4 * WEEK_MS)); }
  function museumN(s) { return s.museum ? museumTotal(s).n : 0; }
  function openIds(s) { return GUIDE.filter(function (g) { return guideOpen(s, g.id); }).map(function (g) { return g.id; }); }
  function yearStart(s, y) {
    var d0 = {};
    Object.keys(s.dex.dish).forEach(function (k) { d0[k] = s.dex.dish[k]; });
    return { y: y, n: 0, big: null, d0: d0, o0: openIds(s), m0: museumN(s) };
  }
  function yearOf(s, now, tzMin) {
    if (!s.yr) { s.yr = yearStart(s, gameYear(now, tzMin)); s.yr.cards = []; s.yr.news = null; }
    return s.yr;
  }
  function yearCard(s, yr, now, tzMin) {
    var dish = null, dn = 0;
    Object.keys(s.dex.dish).forEach(function (k) {
      var d = s.dex.dish[k] - (yr.d0[k] || 0);
      if (d > 0) { dn += d; if (!dish || d > dish.n) dish = { id: k, n: d }; }
    });
    var t = museumTotal(s);
    return { y: yr.y, fy: farmYear(s, now), n: yr.n, big: yr.big, dish: dish, dn: dn,
      open: openIds(s).filter(function (id) { return yr.o0.indexOf(id) < 0; }),
      mus: [yr.m0, museumN(s), t.m], name: farmName(s), sign: s.farm ? s.farm.sign : 0 };
  }
  // a game year ended → its card (kept in s.yr.cards, and s.yr.news until shown), else null
  function yearTick(s, now, tzMin) {
    var y = gameYear(now, tzMin), yr = yearOf(s, now, tzMin);
    if (y <= yr.y) return null;
    var card = yearCard(s, yr, now, tzMin), keep = { cards: yr.cards };
    card.fy = farmYear(s, MON0 + (yr.y + 1) * 4 * WEEK_MS - 1 - (tzMin || 0) * 60e3);
    keep.cards.push(card);
    while (keep.cards.length > YEAR_KEEP) keep.cards.shift();
    s.yr = yearStart(s, y); s.yr.cards = keep.cards; s.yr.news = card;
    return card;
  }
  function yearNews(s) { var n = s.yr && s.yr.news; if (!n) return null; s.yr.news = null; return n; }
  function yearCatch(s, roll) {
    if (!s.yr || !fishById(roll.id)) return;
    s.yr.n++;
    if (!s.yr.big || roll.size > s.yr.big.size) s.yr.big = { id: roll.id, size: roll.size };
  }
  // 「지금까지」: this year so far (changes nothing)
  function yearPreview(s, now, tzMin) { return s.yr ? yearCard(s, s.yr, now, tzMin) : null; }

  // ----- 농장 간판: a name the player types (textContent only) + a sign shape -----
  var FARM_NAME_MAX = 10;
  var SIGNS = [
    { id: 'board', name: '널빤지' }, { id: 'arch', name: '아치' }, { id: 'round', name: '둥근 판' },
    { id: 'flag', name: '깃발' }, { id: 'fish', name: '물고기' }
  ];
  function cleanFarmName(str) {
    var out = String(str === undefined || str === null ? '' : str).split('').filter(function (ch) {
      return /^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9 .~!?_]$/.test(ch);
    }).join('');
    return out.replace(/\s+/g, ' ').trim().slice(0, FARM_NAME_MAX).trim();
  }
  function farmName(s) { return (s.farm && s.farm.name) || ''; }
  function setFarm(s, name, sign) {
    if (!(sign >= 0 && sign < SIGNS.length) || sign !== Math.floor(sign)) return { ok: false, why: 'sign' };
    var n = cleanFarmName(name);
    s.farm = { sign: sign };
    if (n) s.farm.name = n;
    return { ok: true, name: n };
  }

  // ---------- save: called by decode() ----------
  function decodeStage10A(o, s) {
    var num = function (x) { return typeof x === 'number' && isFinite(x); };
    var obj = function (x) { return !!x && typeof x === 'object' && !Array.isArray(x); };
    var q = o.cont;
    if (obj(q) && num(q.wk) && num(q.lv)) {
      var c = { wk: Math.floor(q.wk), lv: Math.max(0, Math.min(4, Math.floor(q.lv))), best: null, won: {}, mail: [], news: null };
      var b = q.best;
      if (obj(b) && fishById(b.id) && num(b.size) && num(b.f) && b.f >= 0 && b.f <= 1) c.best = { id: b.id, size: b.size, f: b.f };
      if (obj(q.won)) Object.keys(q.won).forEach(function (k) { if (/^-?\d{1,7}$/.test(k) && TROPHY_TIERS[q.won[k]]) c.won[k] = q.won[k]; });
      if (Array.isArray(q.mail)) q.mail.slice(-CONTEST_KEEP).forEach(function (m) {
        if (obj(m) && num(m.wk) && num(m.k) && CONTEST_LETTERS[m.k]) c.mail.push({ wk: Math.floor(m.wk), k: m.k });
      });
      var n = q.news;
      if (obj(n) && num(n.wk) && num(n.coins) && obj(n.best) && fishById(n.best.id) && obj(n.mark) && fishById(n.mark.fish)) {
        var nn = { wk: Math.floor(n.wk), win: n.win === true, best: { id: n.best.id, size: +n.best.size || 0, f: +n.best.f || 0 },
          mark: { fish: n.mark.fish, size: +n.mark.size || 0, f: +n.mark.f || 0 }, coins: Math.max(0, Math.floor(n.coins)) };
        if (nn.win && TROPHY_TIERS[n.tier] && trophyOk(n.trophy)) { nn.tier = n.tier; nn.trophy = n.trophy; nn.owned = n.owned === true; nn.stored = n.stored === true; }
        else if (!nn.win && typeof n.letter === 'string' && CONTEST_LETTERS.indexOf(n.letter) >= 0) nn.letter = n.letter;
        if (nn.tier || nn.letter) c.news = nn;
      }
      s.cont = c;
    }
    var y = o.yr;
    if (obj(y) && num(y.y)) {
      var yr = { y: Math.floor(y.y), n: num(y.n) && y.n > 0 ? Math.min(1e7, Math.floor(y.n)) : 0, big: null, d0: {}, o0: [], m0: num(y.m0) && y.m0 > 0 ? Math.floor(y.m0) : 0 };
      if (obj(y.big) && fishById(y.big.id) && num(y.big.size)) yr.big = { id: y.big.id, size: y.big.size };
      if (obj(y.d0)) RECIPES.forEach(function (r) { if (num(y.d0[r.id]) && y.d0[r.id] > 0) yr.d0[r.id] = Math.floor(y.d0[r.id]); });
      if (Array.isArray(y.o0)) GUIDE.forEach(function (g) { if (y.o0.indexOf(g.id) >= 0) yr.o0.push(g.id); });
      yr.cards = [];
      if (Array.isArray(y.cards)) y.cards.slice(-YEAR_KEEP).forEach(function (cd) { var d = cleanCard(cd); if (d) yr.cards.push(d); });
      yr.news = cleanCard(y.news);
      s.yr = yr;
    }
    var f = o.farm;
    if (obj(f)) {
      s.farm = { sign: num(f.sign) && f.sign >= 0 && f.sign < SIGNS.length ? Math.floor(f.sign) : 0 };
      var nm = cleanFarmName(f.name);
      if (nm) s.farm.name = nm;
    }
    function cleanCard(cd) {
      if (!obj(cd) || !num(cd.y) || !num(cd.n) || !num(cd.fy) || !Array.isArray(cd.mus) || !Array.isArray(cd.open)) return null;
      var out = { y: Math.floor(cd.y), fy: Math.max(1, Math.floor(cd.fy)), n: Math.max(0, Math.floor(cd.n)), big: null, dish: null,
        dn: num(cd.dn) ? Math.max(0, Math.floor(cd.dn)) : 0, open: cd.open.filter(function (id) { return !!guideById(id); }),
        mus: [0, 1, 2].map(function (k) { return num(cd.mus[k]) ? Math.max(0, Math.floor(cd.mus[k])) : 0; }),
        name: cleanFarmName(cd.name), sign: num(cd.sign) && cd.sign >= 0 && cd.sign < SIGNS.length ? Math.floor(cd.sign) : 0 };
      if (obj(cd.big) && fishById(cd.big.id) && num(cd.big.size)) out.big = { id: cd.big.id, size: cd.big.size };
      if (obj(cd.dish) && recipeById(cd.dish.id) && num(cd.dish.n)) out.dish = { id: cd.dish.id, n: Math.max(0, Math.floor(cd.dish.n)) };
      return out;
    }
  }
  function trophyOk(id) { return typeof id === 'string' && /^tr[a-z]+_[gsb]$/.test(id) && DECOS.some(function (d) { return d.id === id; }); }

  expose({
    CONTEST_FRIEND: CONTEST_FRIEND, CONTEST_BASE: CONTEST_BASE, CONTEST_MAX: CONTEST_MAX, CONTEST_MARGIN: CONTEST_MARGIN,
    CONTEST_COINS: CONTEST_COINS, CONTEST_DUP_COINS: CONTEST_DUP_COINS, CONTEST_TRY_COINS: CONTEST_TRY_COINS,
    TROPHY_SHAPES: TROPHY_SHAPES, TROPHY_TIERS: TROPHY_TIERS,
    contestOk: contestOk, contestWeek: contestWeek, contestLevel: contestLevel, contestMark: contestMark, contestTier: contestTier,
    trophyId: trophyId, contestTick: contestTick, contestNews: contestNews, contestCatch: contestCatch, contestState: contestState,
    contestTalk: contestTalk, contestLetter: contestLetter, contestPct: contestPct,
    YEAR_KEEP: YEAR_KEEP, gameYear: gameYear, yearTick: yearTick, yearNews: yearNews, yearCatch: yearCatch, yearPreview: yearPreview,
    FARM_NAME_MAX: FARM_NAME_MAX, SIGNS: SIGNS, cleanFarmName: cleanFarmName, farmName: farmName, setFarm: setFarm,
    decodeStage10A: decodeStage10A
  });
