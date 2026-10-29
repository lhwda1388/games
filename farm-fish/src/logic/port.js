  // ---------- 옛 포구 (stage 11 ①): four buildings fixed in order by filling bundles, then paying coins ----------
  // Opens with the 마을 + the 바다 낚시터 (a 「끊긴 다리」 sign at the end of the 마을 street). A 'bag' slot takes one basket item
  // (the cheapest, bagTake, like a 박물관 donation), a 'junk' slot one 고물 from s.junk, a 'rec' slot only checks a record.
  // s.port = { got: { bundleId: { itemId: true } }, done: { bldgId: true } }, made on the first put. s.port.auc belongs to lane ②.
  var PORT_BLDGS = [
    { id: 'bridge', name: '다리', coins: 50000, bundles: [
      { id: 'forest', name: '숲 꾸러미', kind: 'bag', ids: ['pinecone', 'acorn', 'chestnut', 'gosari'], coins: 2000 },
      { id: 'river', name: '강 꾸러미', kind: 'bag', ids: ['dace', 'loach', 'chub', 'trout'], coins: 2000 },
      { id: 'sea', name: '바다 꾸러미', kind: 'bag', ids: ['mackerel', 'horse', 'flounder', 'rockfish'], coins: 2000 }
    ] },
    { id: 'shipyard', name: '조선소', coins: 150000, bundles: [
      { id: 'drift', name: '표류물 꾸러미', kind: 'bag', ids: ['driftwood', 'rope', 'glassfloat', 'conch'], coins: 5000 },
      { id: 'ore', name: '광석 꾸러미', kind: 'bag', ids: ['copper', 'iron', 'coal', 'silver'], coins: 5000 },
      { id: 'junk', name: '잡동사니 꾸러미', kind: 'junk', ids: ['boot', 'can', 'bottle', 'key'], coins: 5000 }
    ] },
    { id: 'market', name: '어판장', coins: 300000, bundles: [
      { id: 'cook', name: '요리 꾸러미', kind: 'bag', ids: ['maeuntang', 'jjim', 'friedfish', 'jeon'], coins: 10000 },
      { id: 'field', name: '밭 꾸러미', kind: 'bag', ids: ['potato', 'pepper', 'corn', 'pumpkin'], coins: 10000 },
      { id: 'fruit', name: '과일 꾸러미', kind: 'bag', ids: ['apple', 'pear', 'persimmon', 'tangerine'], coins: 10000 },
      { id: 'bigfish', name: '큰 물고기 꾸러미', kind: 'bag', ids: ['snapper', 'yellowtail', 'salmon', 'mandarin'], coins: 10000 }
    ] },
    { id: 'station', name: '기차역', coins: 600000, bundles: [
      { id: 'museum', name: '박물관 칸', kind: 'rec', need: { rec: 'museum', n: 30 }, coins: 20000 },
      { id: 'stars', name: '별 칸', kind: 'rec', need: { rec: 'stars', n: 5 }, coins: 20000 },
      { id: 'fossils', name: '화석 칸', kind: 'rec', need: { rec: 'fossils', n: 3 }, coins: 20000 },
      { id: 'gems', name: '보석 꾸러미', kind: 'bag', ids: ['amethyst', 'jade', 'garnet', 'moonstone'], coins: 20000 }
    ] }
  ];
  var PORT_TITLE = '포구를 되살린 사람';
  var PORT_REC_NAME = { museum: '박물관 전시품', stars: '별자리', fossils: '화석' };
  var PORT_GRANNY = {
    start:    ['할머니: 이 다리 너머가 옛 포구야. 배도 사람도 다 떠났지.', '할머니: 다리부터 고쳐 주면 이 늙은이가 길을 안내하마.'],
    bridge:   ['할머니: 다리가 이어졌구나! 부두에 다시 발소리가 나네.', '할머니: 저 조선소에서 우리 영감이 배를 짓곤 했지.'],
    shipyard: ['할머니: 조선소에 망치 소리가 돌아왔어. 잠수복도 하나 남아 있더구나.', '할머니: 어판장에 생선 소리가 나면 좋겠는데.'],
    market:   ['할머니: 경매 종소리! 몇 해 만인지 모르겠다.', '할머니: 이제 기차역만 남았어. 기차가 끊기면서 다들 떠났거든.'],
    station:  ['할머니: 기차가 다시 서는구나. 네가 이 포구를 살렸어.', '할머니: 떠난 사람들도 하나둘 돌아오겠지. 고맙다.']
  };

  function portShown(s) { return villageOk(s) && spotUnlocked(s, 'sea'); }
  function portOf(s) { if (!s.port) s.port = { got: {}, done: {} }; return s.port; }
  function portDone(s, id) { return !!(s.port && s.port.done[id]); }
  function portNext(s) { for (var k = 0; k < PORT_BLDGS.length; k++) if (!portDone(s, PORT_BLDGS[k].id)) return PORT_BLDGS[k]; return null; }
  function portBundle(id) {
    for (var k = 0; k < PORT_BLDGS.length; k++) for (var j = 0; j < PORT_BLDGS[k].bundles.length; j++) if (PORT_BLDGS[k].bundles[j].id === id) return { b: PORT_BLDGS[k], u: PORT_BLDGS[k].bundles[j] };
    return null;
  }
  // a 'rec' bundle has one slot named after its record
  function portSlots(u) { return u.kind === 'rec' ? [u.need.rec] : u.ids; }
  function portGot(s, bundleId, itemId) { return !!(s.port && s.port.got[bundleId] && s.port.got[bundleId][itemId]); }
  function portCount(s, bundleId) {
    var u = portBundle(bundleId).u, sl = portSlots(u), n = 0;
    sl.forEach(function (id) { if (portGot(s, bundleId, id)) n++; });
    return { n: n, m: sl.length };
  }
  function portBundleDone(s, bundleId) { var c = portCount(s, bundleId); return c.n >= c.m; }
  function portRecNow(s, rec) { return rec === 'museum' ? museumTotal(s).n : rec === 'stars' ? skyDexCount(s) : fossilCount(s); }
  function portItemName(id) { var i = itemInfo(id); if (i) return i.name; var j = junkById(id); return j ? j.name : null; }
  // how many the player holds for a slot right now
  function portHave(s, bundleId, itemId) {
    var f = portBundle(bundleId);
    if (!f) return 0;
    if (f.u.kind === 'junk') return junkCount(s, itemId);
    if (f.u.kind === 'rec') return portRecNow(s, f.u.need.rec) >= f.u.need.n ? 1 : 0;
    return bagCount(s, itemId);
  }
  // 'ok' | 'closed' | 'bundle' | 'order' | 'got' | 'need'
  function portWhy(s, bundleId, itemId) {
    if (!portShown(s)) return 'closed';
    var f = portBundle(bundleId);
    if (!f || portSlots(f.u).indexOf(itemId) < 0) return 'bundle';
    var nx = portNext(s);
    if (!nx || nx.id !== f.b.id) return 'order';
    if (portGot(s, bundleId, itemId)) return 'got';
    return portHave(s, bundleId, itemId) > 0 ? 'ok' : 'need';
  }
  // marks the slot; pays the bundle's coins when it is the last one
  function portFill(s, u, itemId) {
    var p = portOf(s);
    (p.got[u.id] || (p.got[u.id] = {}))[itemId] = true;
    var out = { ok: true };
    if (portBundleDone(s, u.id)) { out.bundleDone = true; out.coins = u.coins; s.coins += u.coins; }
    return out;
  }
  function portPut(s, bundleId, itemId) {
    var f = portBundle(bundleId);
    if (f && f.u.kind === 'rec') return { ok: false, why: portShown(s) ? 'bundle' : 'closed' };
    var why = portWhy(s, bundleId, itemId);
    if (why !== 'ok') return { ok: false, why: why };
    if (f.u.kind === 'junk') { var j = junkOf(s); if ((j.n[itemId] -= 1) <= 0) delete j.n[itemId]; }
    else if (!bagTake(s, itemId, 1)) return { ok: false, why: 'need' };
    return portFill(s, f.u, itemId);
  }
  function portCheck(s, bundleId) {
    var f = portBundle(bundleId);
    if (!f || f.u.kind !== 'rec') return { ok: false, why: portShown(s) ? 'bundle' : 'closed' };
    var why = portWhy(s, bundleId, f.u.need.rec);
    if (why !== 'ok') return { ok: false, why: why };
    return portFill(s, f.u, f.u.need.rec);
  }
  // anything the current building can take right now? (the UI's attention mark)
  function portCan(s) {
    var b = portNext(s);
    if (!b || !portShown(s)) return false;
    return b.bundles.some(function (u) { return portSlots(u).some(function (id) { return portWhy(s, u.id, id) === 'ok'; }); }) ||
      (b.bundles.every(function (u) { return portBundleDone(s, u.id); }) && s.coins >= b.coins);
  }
  function portBuild(s) {
    if (!portShown(s)) return { ok: false, why: 'closed' };
    var b = portNext(s);
    if (!b) return { ok: false, why: 'done' };
    if (!b.bundles.every(function (u) { return portBundleDone(s, u.id); })) return { ok: false, why: 'bundles' };
    if (s.coins < b.coins) return { ok: false, why: 'coins' };
    s.coins -= b.coins;
    portOf(s).done[b.id] = true;
    return { ok: true, bldg: b };
  }
  // the building being fixed still needs this basket item (당나귀 leaves the last one alone)
  function portWants(s, id) {
    var b = portShown(s) && portNext(s);
    return !!b && b.bundles.some(function (u) { return u.kind === 'bag' && u.ids.indexOf(id) >= 0 && !portGot(s, u.id, id); });
  }
  function portTitles(s) { return portDone(s, 'station') ? [PORT_TITLE] : []; }
  // granny's line for where the port is now (the last fixed building, or 'start')
  function grannyLine(s, rng) {
    var key = 'start';
    PORT_BLDGS.forEach(function (b) { if (portDone(s, b.id)) key = b.id; });
    var lines = PORT_GRANNY[key];
    return lines[Math.floor(rng() * lines.length) % lines.length];
  }
  // one line: what the next building still needs
  function portHint(s) {
    var b = portNext(s);
    if (!b) return '포구가 다 살아났어요';
    var left = b.bundles.filter(function (u) { return !portBundleDone(s, u.id); }).map(function (u) {
      return u.kind === 'rec' ? PORT_REC_NAME[u.need.rec] + ' ' + u.need.n + '개' : u.name.replace(' 꾸러미', '');
    });
    return b.name + ' · ' + (left.length ? left.join('·') + ' 남음 · ' : '꾸러미 다 참 · ') + String(b.coins).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '코인';
  }

  // ---------- save: called by decode() (absent in older saves); got/done only, auc is lane ②'s ----------
  function decodePort(o, s) {
    var q = o.port;
    if (!q || typeof q !== 'object' || Array.isArray(q)) return;
    var p = { got: {}, done: {} };
    PORT_BLDGS.forEach(function (b) {
      if (q.done && q.done[b.id] === true) p.done[b.id] = true;
      b.bundles.forEach(function (u) {
        var g = q.got && typeof q.got === 'object' && q.got[u.id];
        if (g && typeof g === 'object') portSlots(u).forEach(function (id) { if (g[id] === true) (p.got[u.id] || (p.got[u.id] = {}))[id] = true; });
      });
    });
    s.port = p;
  }

  expose({
    PORT_BLDGS: PORT_BLDGS, PORT_GRANNY: PORT_GRANNY, PORT_TITLE: PORT_TITLE, PORT_REC_NAME: PORT_REC_NAME,
    portShown: portShown, portDone: portDone, portNext: portNext, portBundle: portBundle, portSlots: portSlots, portGot: portGot,
    portCount: portCount, portBundleDone: portBundleDone, portRecNow: portRecNow, portItemName: portItemName, portHave: portHave,
    portWhy: portWhy, portPut: portPut, portCheck: portCheck, portCan: portCan, portBuild: portBuild, portWants: portWants, portTitles: portTitles,
    grannyLine: grannyLine, portHint: portHint, decodePort: decodePort
  });
