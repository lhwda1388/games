  // ---------- 농장 N년차 + 친구 기록 비교 code, and the stage-4 save block ----------
  var YEAR_MS = 28 * 86400e3;              // 1 game year = 4 seasons = 4 real weeks
  // s.born is set the first time this version sees a save (or at the start of a new game)
  function ensureBorn(s, now) { if (typeof s.born !== 'number' || !isFinite(s.born) || s.born > now) s.born = now; return s.born; }
  function farmYear(s, now) { return 1 + Math.floor(Math.max(0, now - (typeof s.born === 'number' ? s.born : now)) / YEAR_MS); }

  // nickname: typed by the player, optional. Only Hangul, latin letters, digits, space and a few marks; 8 chars max.
  var NICK_MAX = 8;
  function cleanNick(str) {
    var out = String(str === undefined || str === null ? '' : str).split('').filter(function (ch) {
      return /^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9 .~!?_]$/.test(ch);
    }).join('');
    return out.replace(/\s+/g, ' ').trim().slice(0, NICK_MAX).trim();
  }

  // what the code carries: nothing else (no times, no paths, no ids beyond the game's own fish ids)
  function shareStats(s, now) {
    var big = null, cooked = 0;
    FISH.forEach(function (f) { var d = s.dex.fish[f.id]; if (d && (!big || d.best > big.size)) big = { id: f.id, size: d.best }; });
    Object.keys(s.dex.dish).forEach(function (k) { cooked += s.dex.dish[k]; });
    return { nick: cleanNick(s.nick), year: farmYear(s, now), fish: big,
      fdex: fishDexCount(s), cdex: Object.keys(s.dex.crops).length, ddex: Object.keys(s.dex.dish).length,
      rep: s.rep || 0, cooked: cooked, eggs: eggCount(s), house: houseTier(s) };
  }
  // FF1-<nick>-<year>-<fish>-<size×10>-<fish dex>-<crop dex>-<dish dex>-<rep>-<cooked>-<secrets>-<house>-<check>
  // numbers in base 36; nick = each UTF-16 unit as 4 base-36 digits; check = 4 base-36 digits of a hash of the rest
  var SHARE_TAG = 'FF1';
  var SHARE_MAX = { year: 9999, size: 99999, fdex: 999, cdex: 999, ddex: 999, rep: 9999999, cooked: 9999999, eggs: 99, house: 9 };
  function b36(n) { return Math.max(0, Math.floor(n)).toString(36); }
  function shareCheck(body) { return ('0000' + (strHash(body) % 1679616).toString(36)).slice(-4); }
  function encodeShare(st) {
    var nick = cleanNick(st.nick).split('').map(function (ch) { return ('0000' + ch.charCodeAt(0).toString(36)).slice(-4); }).join('');
    var f = [nick, b36(st.year), st.fish ? st.fish.id : '', b36(st.fish ? Math.round(st.fish.size * 10) : 0),
      b36(st.fdex), b36(st.cdex), b36(st.ddex), b36(st.rep), b36(st.cooked), b36(st.eggs), b36(st.house)];
    var body = SHARE_TAG + '-' + f.join('-');
    return body + '-' + shareCheck(body);
  }
  // anything pasted: returns the stats or null. Never throws, never returns markup (nick is re-cleaned).
  function decodeShare(code) {
    try {
      if (typeof code !== 'string' || code.length > 400) return null;
      var c = code.replace(/\s+/g, '');
      var p = c.split('-');
      if (p.length !== 13 || p[0].toUpperCase() !== SHARE_TAG) return null;
      p[0] = SHARE_TAG;
      for (var k = 1; k < 13; k++) p[k] = p[k].toLowerCase();
      if (shareCheck(p.slice(0, 12).join('-')) !== p[12]) return null;
      var nickRaw = p[1], fishId = p[3];
      if (!/^[0-9a-z]*$/.test(nickRaw) || nickRaw.length % 4 || nickRaw.length > NICK_MAX * 4) return null;
      if (!/^[a-z]{0,20}$/.test(fishId)) return null;
      var nick = '';
      for (k = 0; k < nickRaw.length; k += 4) nick += String.fromCharCode(parseInt(nickRaw.slice(k, k + 4), 36));
      var keys = ['year', 'size', 'fdex', 'cdex', 'ddex', 'rep', 'cooked', 'eggs', 'house'], v = {};
      for (k = 0; k < keys.length; k++) {
        var raw = p[k + (k === 0 ? 2 : 3)];
        if (!/^[0-9a-z]{1,6}$/.test(raw)) return null;
        var n = parseInt(raw, 36);
        if (!(n >= 0 && n <= SHARE_MAX[keys[k]])) return null;
        v[keys[k]] = n;
      }
      if (v.year < 1) return null;
      return { nick: cleanNick(nick), year: v.year, fish: fishId ? { id: fishId, size: v.size / 10 } : null,
        fdex: v.fdex, cdex: v.cdex, ddex: v.ddex, rep: v.rep, cooked: v.cooked, eggs: v.eggs, house: v.house };
    } catch (e) { return null; }
  }

  // ---------- save: called by decode() after decodeYard (the house tier caps the tank) ----------
  function decodeStage4(o, s) {
    var num = function (x) { return typeof x === 'number' && isFinite(x); };
    var obj = function (x) { return !!x && typeof x === 'object' && !Array.isArray(x); };
    if (num(o.born) && o.born > 0) s.born = o.born;
    if (typeof o.nick === 'string') { var nk = cleanNick(o.nick); if (nk) s.nick = nk; }
    if (obj(o.res)) {
      var r = { f: {}, lv: {}, rec: {}, unread: [] };
      RESIDENTS.forEach(function (d) {
        if (obj(o.res.f) && num(o.res.f[d.id]) && o.res.f[d.id] > 0) r.f[d.id] = Math.min(1e6, Math.floor(o.res.f[d.id]));
        if (obj(o.res.lv) && num(o.res.lv[d.id]) && o.res.lv[d.id] > 0) r.lv[d.id] = Math.min(FRIEND_LV.length, Math.floor(o.res.lv[d.id]));
      });
      if (obj(o.res.rec)) GIFT_RECIPES.forEach(function (g) { if (o.res.rec[g.id] === true) r.rec[g.id] = true; });
      if (Array.isArray(o.res.unread)) o.res.unread.slice(0, 40).forEach(function (k) {
        if (typeof k !== 'string') return;
        var q = k.split(':');
        if (residentById(q[0]) && +q[1] >= 1 && +q[1] <= FRIEND_LV.length && r.unread.indexOf(k) < 0) r.unread.push(q[0] + ':' + (+q[1]));
      });
      s.res = r;
    }
    if (Array.isArray(o.tank)) {
      var tank = [];
      o.tank.forEach(function (e) {
        if (obj(e) && fishById(e.id) && num(e.v) && e.v >= 0 && tank.length < tankCap(s)) tank.push({ id: e.id, v: Math.round(e.v) });
      });
      if (tank.length) s.tank = tank;
    }
    if (obj(o.daily) && typeof o.daily.key === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.daily.key) && Array.isArray(o.daily.goals)) {
      var goals = [];
      o.daily.goals.slice(0, 3).forEach(function (g) {
        if (!obj(g) || !DAILY_TYPES[g.t] || !num(g.n) || g.n < 1 || !num(g.p)) return;
        if ((g.t === 'crop' && !CROPS[g.x]) || (g.t === 'spot' && !SPOTS[g.x])) return;
        var q = { t: g.t, n: Math.min(99, Math.floor(g.n)), p: Math.max(0, Math.min(99, Math.floor(g.p))) };
        if (g.t === 'crop' || g.t === 'spot') q.x = g.x;
        q.p = Math.min(q.p, q.n);
        goals.push(q);
      });
      if (goals.length) s.daily = { key: o.daily.key, goals: goals, paid: o.daily.paid === true };
    }
  }

  expose({
    YEAR_MS: YEAR_MS, NICK_MAX: NICK_MAX, ensureBorn: ensureBorn, farmYear: farmYear, cleanNick: cleanNick,
    shareStats: shareStats, encodeShare: encodeShare, decodeShare: decodeShare, decodeStage4: decodeStage4
  });
