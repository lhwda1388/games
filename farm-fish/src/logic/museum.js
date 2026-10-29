  // ---------- 박물관 (stage 7): six rooms in the 마을 filled one donation at a time (s.museum, made on the first one) ----------
  // Opens with the 곡괭이, the 망원경 or the fixed 섬 boat. A basket room takes one item (the cheapest, bagTake);
  // the record rooms (곤충, 화석, 별자리) only check the record. Records and 도감 are never touched.
  // s.museum = { got: { room: { id: true } }, done: { room: true } }; done = the room's reward was paid (once).
  // from: 'bag' = basket item, or the record it reads
  var MUSEUM_ROOM_IDS = ['fish', 'bug', 'fossil', 'mineral', 'star', 'sea'];
  var MUSEUM_ROOMS = {
    fish:    { id: 'fish',    name: '물고기실', from: 'bag',    coins: 15000, title: '물고기 박사', deco: 'bronzefish', ids: FISH.map(function (f) { return f.id; }) },
    bug:     { id: 'bug',     name: '곤충실',   from: 'bugs',   coins: 8000, title: '곤충 박사',   deco: 'beetlestat', ids: BUGS.map(function (b) { return b.id; }) },
    fossil:  { id: 'fossil',  name: '화석실',   from: 'fossil', coins: 8000, title: '화석 박사',   deco: 'dinobones',  ids: FOSSILS.map(function (f) { return f.id; }) },
    mineral: { id: 'mineral', name: '광물실',   from: 'bag',    coins: 8000, title: '광물 박사',   deco: 'crystalcol', ids: ORES.filter(function (o) { return o.id !== 'rock'; }).map(function (o) { return o.id; }) },
    star:    { id: 'star',    name: '별자리실', from: 'sky',    coins: 8000, title: '별지기',      deco: 'orrery',     ids: STARS.map(function (c) { return c.id; }) },
    sea:     { id: 'sea',     name: '바다실',   from: 'bag',    coins: 8000, title: '바다 수집가', deco: 'pearlshell',
      ids: ['pearl'].concat(DRIFT.filter(function (d) { return !d.special; }).map(function (d) { return d.id; })) }
  };
  var MUSEUM_ALL = { coins: 30000, title: '명예 관장' };
  [
    { id: 'bronzefish', name: '청동 물고기', cost: 0, merchant: true, from: 'museum', sz: [16, 16] },
    { id: 'beetlestat', name: '풍뎅이 조각', cost: 0, merchant: true, from: 'museum', sz: [14, 12] },
    { id: 'dinobones',  name: '공룡 뼈 모형', cost: 0, merchant: true, from: 'museum', sz: [24, 20] },
    { id: 'crystalcol', name: '수정 기둥',   cost: 0, merchant: true, from: 'museum', sz: [10, 20] },
    { id: 'orrery',     name: '천체 모형',   cost: 0, merchant: true, from: 'museum', sz: [14, 20] },
    { id: 'pearlshell', name: '진주 조개',   cost: 0, merchant: true, from: 'museum', sz: [14, 10] }
  ].forEach(function (d) { DECOS.push(d); });
  var CURATOR = {
    none: ['관장: 어서 오세요! 아직 텅 빈 박물관이에요. 무엇이든 하나 기증해 주시겠어요?', '관장: 진열장이 다 비었지요? 첫 전시품을 기다리고 있어요.'],
    few:  ['관장: 첫 전시품이 들어왔어요! 진열장이 반짝이네요.', '관장: 마을 아이들이 벌써 구경하러 왔어요.'],
    some: ['관장: 제법 박물관다워졌어요. 학생들이 견학을 온대요.', '관장: 비어 있는 칸이 아직 많아요. 천천히 채워 봐요.'],
    many: ['관장: 이 정도면 도시 박물관 부럽지 않아요!', '관장: 손님들이 전시실마다 한참씩 머물다 가요.'],
    room: ['관장: 전시실 하나가 다 찼어요! 이름표를 새로 달았답니다.', '관장: 완성된 전시실 앞은 늘 사람이 많아요.'],
    all:  ['관장: 모든 전시실이 가득해요. 당신이 이 박물관을 만들었어요.', '관장: 명예 관장님, 오늘도 둘러보러 오셨군요!']
  };

  function museumOk(s) { return caveOk(s) || skyOk(s) || isleOk(s); }
  function museumOf(s) { if (!s.museum) s.museum = { got: {}, done: {} }; return s.museum; }
  function museumGot(s, room, id) { return !!(s.museum && s.museum.got[room] && s.museum.got[room][id]); }
  // the thing in hand: a basket item, or the record
  function museumHas(s, room, id) {
    var r = MUSEUM_ROOMS[room];
    if (r.from === 'bag') return bagCount(s, id) > 0;
    if (r.from === 'bugs') return !!(s.bugs && s.bugs.dex[id]);
    if (r.from === 'fossil') return !!(s.cave && s.cave.done[id]);
    return !!(s.sky && s.sky.seen[id]);
  }
  function donateWhy(s, room, id) {
    var r = MUSEUM_ROOMS.hasOwnProperty(room) ? MUSEUM_ROOMS[room] : null;
    if (!museumOk(s)) return 'closed';
    if (!r || r.ids.indexOf(id) < 0) return 'room';
    if (museumGot(s, room, id)) return 'got';
    return museumHas(s, room, id) ? 'ok' : 'need';
  }
  function canDonate(s, room, id) { return donateWhy(s, room, id) === 'ok'; }
  // what the donate sheet lists for a room, in room order
  function donatable(s, room) { return MUSEUM_ROOMS[room] ? MUSEUM_ROOMS[room].ids.filter(function (id) { return canDonate(s, room, id); }) : []; }
  function museumCount(s, room) {
    var r = MUSEUM_ROOMS[room], n = 0;
    r.ids.forEach(function (id) { if (museumGot(s, room, id)) n++; });
    return { n: n, m: r.ids.length };
  }
  function museumTotal(s) {
    var n = 0, m = 0;
    MUSEUM_ROOM_IDS.forEach(function (r) { var c = museumCount(s, r); n += c.n; m += c.m; });
    return { n: n, m: m };
  }
  function museumAllDone(s) { return MUSEUM_ROOM_IDS.every(function (r) { return !!(s.museum && s.museum.done[r]); }); }
  // → { ok, why? , roomDone, reward?: { coins, title, deco, stored }, allDone?: { coins, title } }
  function donate(s, room, id) {
    var why = donateWhy(s, room, id);
    if (why !== 'ok') return { ok: false, why: why };
    var r = MUSEUM_ROOMS[room];
    if (r.from === 'bag' && !bagTake(s, id, 1)) return { ok: false, why: 'need' };
    var m = museumOf(s);
    (m.got[room] || (m.got[room] = {}))[id] = true;
    var c = museumCount(s, room), out = { ok: true, roomDone: c.n >= c.m };
    if (out.roomDone && !m.done[room]) {
      m.done[room] = true;
      var g = grantDeco(s, r.deco);
      out.reward = { coins: r.coins + (g.ok ? 0 : 500), title: r.title, deco: g.ok ? r.deco : null, stored: !!g.stored };
      s.coins += out.reward.coins;
      if (museumAllDone(s)) { out.allDone = { coins: MUSEUM_ALL.coins, title: MUSEUM_ALL.title }; s.coins += MUSEUM_ALL.coins; }
    }
    return out;
  }
  function museumTitles(s) {
    var out = MUSEUM_ROOM_IDS.filter(function (r) { return !!(s.museum && s.museum.done[r]); }).map(function (r) { return MUSEUM_ROOMS[r].title; });
    if (museumAllDone(s)) out.push(MUSEUM_ALL.title);
    return out;
  }
  // the curator's line for k (the UI passes the game day): changes with progress
  function curatorLine(s, k) {
    var t = museumTotal(s), doneN = museumTitles(s).length, f = t.n / t.m;
    var key = museumAllDone(s) ? 'all' : doneN ? 'room' : !t.n ? 'none' : f < 0.15 ? 'few' : f < 0.5 ? 'some' : 'many';
    var lines = CURATOR[key];
    return lines[Math.abs(Math.floor(k || 0)) % lines.length];
  }

  // ---------- save: called by decode() at the end (absent in older saves) ----------
  function decodeMuseum(o, s) {
    var q = o.museum;
    if (!q || typeof q !== 'object' || Array.isArray(q)) return;
    var m = { got: {}, done: {} };
    MUSEUM_ROOM_IDS.forEach(function (r) {
      var g = q.got && typeof q.got === 'object' && q.got[r];
      if (g && typeof g === 'object') MUSEUM_ROOMS[r].ids.forEach(function (id) { if (g[id] === true) (m.got[r] || (m.got[r] = {}))[id] = true; });
      if (q.done && q.done[r] === true) m.done[r] = true;
    });
    s.museum = m;
  }

  expose({
    MUSEUM_ROOM_IDS: MUSEUM_ROOM_IDS, MUSEUM_ROOMS: MUSEUM_ROOMS, MUSEUM_ALL: MUSEUM_ALL,
    museumOk: museumOk, museumGot: museumGot, canDonate: canDonate, donatable: donatable, donate: donate,
    museumCount: museumCount, museumTotal: museumTotal, museumAllDone: museumAllDone, museumTitles: museumTitles,
    curatorLine: curatorLine, decodeMuseum: decodeMuseum
  });
