  // ---------- 잠수 탐험 (stage 12): gates, gear, 해저 도감, 항해일지, 난파선 상자 (s.dive) ----------
  // Opens once the 옛 포구 조선소 is rebuilt (lane ① field s.port.done.shipyard, read directly). Map data in logic/divemap.js.
  // s.dive = { seen: { roomId: true }, got: { id: true }, gear: { tank, light, key }, log: { n: true }, box: { id: true } },
  // made on the first dive. Oxygen runs in the UI on frame time (it stops while hidden); running out loses nothing.
  var DIVE_O2 = 60, DIVE_O2_TANK = 120, DIVE_SEE_COINS = 300;
  var DIVE_DEX = [
    // 얕은 여
    { id: 'wakame',      name: '미역',           zone: 'reef',  kind: 'pick', price: 10,  hint: '얕은 바위에 흔들리는 갈색 띠' },
    { id: 'coralbit',    name: '산호 조각',      zone: 'reef',  kind: 'pick', price: 20,  hint: '여 바닥에 부러진 흰 가지 · 산소통 재료' },
    { id: 'scallop',     name: '가리비',         zone: 'reef',  kind: 'pick', price: 25,  hint: '모래 위 부채 모양 껍데기' },
    { id: 'seagrape',    name: '바다포도',       zone: 'reef',  kind: 'pick', price: 35,  hint: '알알이 맺힌 초록 해초' },
    { id: 'seahorse',    name: '해마',           zone: 'reef',  kind: 'see',  hint: '꼬리를 해초에 감고 꼿꼿이' },
    { id: 'nudibranch',  name: '갯민숭달팽이',   zone: 'reef',  kind: 'see',  hint: '바위 위를 느릿느릿 · 뿔 두 개' },
    { id: 'reefschool',  name: '자리돔 떼',      zone: 'reef',  kind: 'see',  hint: '물 가운데 반짝이는 작은 무리' },
    // 난파선
    { id: 'scrap',       name: '쇠붙이',         zone: 'wreck', kind: 'pick', price: 15,  hint: '녹슨 배 조각 · 손전등 재료' },
    { id: 'mussel',      name: '홍합',           zone: 'wreck', kind: 'pick', price: 25,  hint: '뱃전에 다닥다닥 붙은 검은 조개' },
    { id: 'pearlclam',   name: '진주조개',       zone: 'wreck', kind: 'pick', price: 90,  hint: '난파선 바닥에 숨은 큰 조개' },
    { id: 'wreckeel',    name: '곰치',           zone: 'wreck', kind: 'see',  hint: '부서진 선창 구멍에서 고개만' },
    { id: 'seaturtle',   name: '바다거북',       zone: 'wreck', kind: 'see',  hint: '갑판 위를 천천히 지나가는 그림자' },
    { id: 'wreckcrab',   name: '난파선 게',      zone: 'wreck', kind: 'see',  hint: '상자 옆을 옆걸음으로' },
    // 심해 동굴
    { id: 'glowshell',   name: '빛조개',         zone: 'deep',  kind: 'pick', price: 70,  hint: '어둠 속에 은은히 빛나는 껍데기' },
    { id: 'blackcoral',  name: '검은 산호',      zone: 'deep',  kind: 'pick', price: 110, hint: '깊은 벽에 자라는 검은 가지' },
    { id: 'anglerfish',  name: '초롱아귀',       zone: 'deep',  kind: 'see',  hint: '머리 위 작은 등불 하나' },
    { id: 'gulper',      name: '풍선장어',       zone: 'deep',  kind: 'see',  hint: '입만 커다란 긴 물고기' },
    { id: 'glowsquid',   name: '반딧불오징어',   zone: 'deep',  kind: 'see',  hint: '점점이 깜빡이는 작은 오징어' },
    { id: 'lanternfish', name: '샛비늘치',       zone: 'deep',  kind: 'see',  hint: '옆구리에 빛 점이 줄지어' },
    { id: 'deepjelly',   name: '심해 해파리',    zone: 'deep',  kind: 'see',  hint: '어둠 속을 둥실 떠도는 우산' }
  ];
  var DIVE_DEX_BY = {};
  DIVE_DEX.forEach(function (d) { DIVE_DEX_BY[d.id] = d; });
  var DIVE_ROOM_BY = {};
  DIVE_ROOMS.forEach(function (r) { DIVE_ROOM_BY[r.id] = r; });
  var DIVE_GEAR = {
    tank:  { name: '큰 산소통', coins: 100000, need: [['coralbit', 8], ['iron', 3]] },
    light: { name: '손전등',    coins: 200000, need: [['scrap', 10], ['copper', 3]] }
  };
  var DIVE_BOXES = [
    { id: 'bxhold',  coins: 4000 },
    { id: 'bxcabin', deco: 'wreckwheel' },
    { id: 'bxdeep',  coins: 12000 }
  ];
  [
    { id: 'wreckwheel', name: '난파선 조타륜',   cost: 0, merchant: true, from: 'dive', sz: [14, 18] },
    { id: 'seamap',     name: '해저 지도 액자', cost: 0, merchant: true, from: 'dive', sz: [16, 14] }
  ].forEach(function (d) { DECOS.push(d); });
  // 옛 포구가 버려진 이야기 (포구지기 할머니 이야기와 이어진다)
  var DIVE_LOG = [
    '1 · 포구에 배가 가득하던 해. 어판장은 새벽마다 시끌벅적, 기차는 생선을 싣고 도시로 갔다.',
    '2 · 가을 끝, 큰 폭풍. 등대 불이 꺼지고 다리가 끊겼다. 배들이 서로 부딪혀 가라앉았다.',
    '3 · 마지막 배 「순풍호」. 남은 사람들을 태우고 나가다 여 바깥에서 멈췄다. 이 일지는 그 배의 것.',
    '4 · 폭풍 뒤 기차가 끊겼다. 생선을 실어 갈 길이 없으니 사람들도 하나둘 떠났다.',
    '5 · 포구지기만 남았다. "언젠가 누가 다리를 다시 놓으면, 이 포구도 숨을 쉬겠지."'
  ];

  function diveRoom(id) { return DIVE_ROOM_BY.hasOwnProperty(id) ? DIVE_ROOM_BY[id] : null; }
  function diveDexById(id) { return DIVE_DEX_BY.hasOwnProperty(id) ? DIVE_DEX_BY[id] : null; }
  // basket item info for pickable things (logic/basket.js itemInfo asks here)
  function diveItem(id) { var d = diveDexById(id); return d && d.kind === 'pick' ? d : null; }
  function diveOk(s) { return !!(s.port && s.port.done && s.port.done.shipyard); }
  function diveOf(s) {
    if (!s.dive) s.dive = { seen: {}, got: {}, gear: { tank: false, light: false, key: false }, log: {}, box: {} };
    return s.dive;
  }
  function diveGear(s, g) { return !!(s.dive && s.dive.gear[g]); }
  function diveO2Max(s) { return diveGear(s, 'tank') ? DIVE_O2_TANK : DIVE_O2; }
  function diveCanEnter(s, roomId) {
    var r = diveRoom(roomId);
    if (!diveOk(s)) return { ok: false, why: 'closed' };
    if (!r) return { ok: false, why: 'room' };
    if (r.gate === 'key' && !diveGear(s, 'key')) return { ok: false, why: 'key' };
    if ((r.zone === 'deep' || r.gate === 'light') && !diveGear(s, 'light')) return { ok: false, why: 'light' };
    if (r.gate === 'tank' && !diveGear(s, 'tank')) return { ok: false, why: 'tank' };
    return { ok: true };
  }
  function diveSeenCount(s) { return s.dive ? Object.keys(s.dive.seen).length : 0; }
  // → { first, map?, stored? } or null if the room is shut. The 24th room seen gives the 해저 지도 액자 (once: seen never shrinks).
  function diveEnter(s, roomId) {
    if (!diveCanEnter(s, roomId).ok) return null;
    var d = diveOf(s), first = !d.seen[roomId];
    d.seen[roomId] = true;
    var out = { first: first };
    if (first && diveSeenCount(s) === DIVE_ROOMS.length) { out.map = true; out.stored = !!grantDeco(s, 'seamap').stored; }
    return out;
  }
  // take / look at thing k of a room. pick → basket (sold if full), see → 도감 (+coins the first time),
  // key/log/box once. null when it can't be taken (no dive yet, no such thing, already had).
  function diveTake(s, roomId, k, rng) {
    var r = diveRoom(roomId);
    if (!r || !diveOk(s) || !(k >= 0 && k < r.things.length)) return null;
    var t = r.things[k], d = diveOf(s);
    if (t.id === 'key') { if (d.gear.key) return null; d.gear.key = true; return { id: 'key', kind: 'key' }; }
    if (t.id === 'log') { if (d.log[t.n]) return null; d.log[t.n] = true; return { id: 'log', kind: 'log', n: t.n, done: diveLogDone(s) }; }
    if (t.id === 'box') {
      if (d.box[t.box]) return null;
      d.box[t.box] = true;
      var b = byId(DIVE_BOXES, t.box), res = { id: t.box, kind: 'box' };
      if (b.coins) { s.coins += b.coins; res.coins = b.coins; }
      if (b.deco) { var g = grantDeco(s, b.deco); res.deco = b.deco; res.stored = !!g.stored; if (!g.ok) { s.coins += 3000; res.coins = 3000; } }
      return res;
    }
    var x = diveDexById(t.id);
    if (!x) return null;
    var first = !d.got[x.id];
    d.got[x.id] = true;
    if (x.kind === 'see') {
      var seen = { id: x.id, kind: 'see', first: first };
      if (first) { s.coins += DIVE_SEE_COINS; seen.coins = DIVE_SEE_COINS; }
      return seen;
    }
    var v = Math.round(x.price * (0.8 + 0.4 * rng()));
    return { id: x.id, kind: 'pick', first: first, sold: bagAdd(s, x.id, v) };
  }
  // 조선소: 큰 산소통 / 손전등 for coins + materials (cheapest of each taken)
  function diveBuy(s, gear) {
    var g = DIVE_GEAR.hasOwnProperty(gear) ? DIVE_GEAR[gear] : null;
    if (!diveOk(s)) return { ok: false, why: 'closed' };
    if (!g) return { ok: false, why: 'gear' };
    if (diveGear(s, gear)) return { ok: false, why: 'got' };
    if (s.coins < g.coins) return { ok: false, why: 'coins' };
    if (!g.need.every(function (q) { return bagCount(s, q[0]) >= q[1]; })) return { ok: false, why: 'need' };
    s.coins -= g.coins;
    g.need.forEach(function (q) { bagTake(s, q[0], q[1]); });
    diveOf(s).gear[gear] = true;
    return { ok: true };
  }
  function diveLogCount(s) { return s.dive ? Object.keys(s.dive.log).length : 0; }
  function diveLogDone(s) { return diveLogCount(s) >= DIVE_LOG.length; }
  function diveTitles(s) { return diveLogDone(s) ? ['바다 이야기꾼'] : []; }
  function diveDexCount(s) { var n = 0; if (s.dive) DIVE_DEX.forEach(function (d) { if (s.dive.got[d.id]) n++; }); return n; }

  // ---------- save ----------
  function decodeDive(o, s) {
    var q = o.dive;
    if (!q || typeof q !== 'object' || Array.isArray(q)) return;
    var d = { seen: {}, got: {}, gear: { tank: false, light: false, key: false }, log: {}, box: {} };
    if (q.seen && typeof q.seen === 'object') DIVE_ROOMS.forEach(function (r) { if (q.seen[r.id] === true) d.seen[r.id] = true; });
    if (q.got && typeof q.got === 'object') DIVE_DEX.forEach(function (x) { if (q.got[x.id] === true) d.got[x.id] = true; });
    if (q.gear && typeof q.gear === 'object') ['tank', 'light', 'key'].forEach(function (g) { d.gear[g] = q.gear[g] === true; });
    if (q.log && typeof q.log === 'object') for (var n = 1; n <= DIVE_LOG.length; n++) if (q.log[n] === true) d.log[n] = true;
    if (q.box && typeof q.box === 'object') DIVE_BOXES.forEach(function (b) { if (q.box[b.id] === true) d.box[b.id] = true; });
    s.dive = d;
  }

  expose({
    DIVE_O2: DIVE_O2, DIVE_O2_TANK: DIVE_O2_TANK, DIVE_SEE_COINS: DIVE_SEE_COINS, DIVE_DEX: DIVE_DEX, DIVE_GEAR: DIVE_GEAR,
    DIVE_BOXES: DIVE_BOXES, DIVE_LOG: DIVE_LOG, diveRoom: diveRoom, diveDexById: diveDexById, diveItem: diveItem, diveOk: diveOk,
    diveO2Max: diveO2Max, diveCanEnter: diveCanEnter, diveSeenCount: diveSeenCount, diveEnter: diveEnter, diveTake: diveTake,
    diveBuy: diveBuy, diveLogCount: diveLogCount, diveLogDone: diveLogDone, diveTitles: diveTitles, diveDexCount: diveDexCount,
    decodeDive: decodeDive
  });
