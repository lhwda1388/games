  // ---------- 소문과 보물 지도 (stage 8 ③) ----------
  // Map pieces drop now and then from fishing junk, cave rock and island drift. They live in s.tmap (never the basket),
  // so nothing can sell or lose them. A complete map shows a real scene with an X; hold that spot there to dig.
  // Some maps also need a time/weather/tide, drawn on the map (moon = night). Wrong spot or wrong time: a hint, nothing lost.
  // 소문: short clue lines heard from residents, bottle letters and visitors, kept in s.rumor (소문 수첩, 기록 tab).
  // Both fields are optional and made lazily; older saves simply have none.
  var TMAP_DROP = { junk: 0.2, cave: 0.02, drift: 0.025 };   // chance of a piece per landed junk / broken cell / picked drift
  var DIG_R = 14, DIG_NEAR = 36;                            // px from the X that counts as the spot / as "warm"
  // x, y = canvas spot (180×200) of the X; land = the landmark it sits by (used in hints, never numbers)
  // cond: phase = 'morning'|'evening'|'night', weather = list, tide = 'low'
  var TMAPS = [
    { id: 'dock',  name: '부두 지도',     scene: 'farm',    x: 44,  y: 158, n: 3, land: '낚시 부두 아래 풀밭',
      reward: { gold: 2, coins: 300 } },
    { id: 'pen',   name: '우리 지도',     scene: 'yard',    x: 44,  y: 184, n: 3, land: '마당 우리의 물통 옆', cond: { phase: 'morning' },
      reward: { coins: 900 } },
    { id: 'log',   name: '쓰러진 나무 지도', scene: 'forest', x: 163, y: 130, n: 4, land: '숲의 쓰러진 통나무 밑', cond: { weather: ['rain', 'snow'] },
      reward: { deco: 'sundial', coins: 200 } },
    { id: 'sign',  name: '팻말 지도',     scene: 'orchard', x: 150, y: 72,  n: 3, land: '과수원 팻말 아래', cond: { phase: 'evening' },
      reward: { gold: 3 } },
    { id: 'rock',  name: '갯바위 지도',   scene: 'flat',    x: 152, y: 152, n: 4, land: '갯벌 오른쪽 아래 바위 옆', cond: { tide: 'low' },
      reward: { coins: 1500 } },
    { id: 'palm',  name: '야자수 지도',   scene: 'island',  x: 156, y: 178, n: 4, land: '섬 야자수 오른쪽 모래', cond: { phase: 'night' },
      reward: { deco: 'oldchest', coins: 500 } },
    { id: 'well',  name: '우물 지도',     scene: 'village', x: 76,  y: 176, n: 3, land: '마을 우물 오른쪽', cond: { weather: ['fog'] },
      reward: { gold: 1, coins: 1000 } }
  ];
  var TMAP_SCENE_NAME = { farm: '밭·연못', yard: '마당', forest: '숲', orchard: '과수원', flat: '갯벌', island: '섬', village: '마을' };
  [
    { id: 'sundial',  name: '해시계',       cost: 0, merchant: true, from: 'map', sz: [14, 14] },
    { id: 'oldchest', name: '빈 보물 상자', cost: 0, merchant: true, from: 'map', sz: [16, 12] }
  ].forEach(function (d) { DECOS.push(d); });

  function tmapById(id) { for (var k = 0; k < TMAPS.length; k++) if (TMAPS[k].id === id) return TMAPS[k]; return null; }
  function tmapOf(s) { if (!s.tmap) s.tmap = { p: {}, dug: {} }; return s.tmap; }
  function tmapPieces(s, id) { return (s.tmap && s.tmap.p[id]) || []; }
  function tmapComplete(s, id) { var m = tmapById(id); return !!m && tmapPieces(s, id).length >= m.n; }
  function tmapDug(s, id) { return !!(s.tmap && s.tmap.dug[id]); }
  // the scene the map shows can be visited now (a piece of a map you can't reach yet never drops)
  function tmapSceneOk(s, scene) {
    if (scene === 'farm' || scene === 'yard') return true;
    if (scene === 'forest') return forestOk(s);
    if (scene === 'orchard') return orchardOk(s);
    if (scene === 'flat') return flatOk(s);
    if (scene === 'island') return isleOk(s);
    if (scene === 'village') return villageOk(s);
    return false;
  }
  // src = 'junk' | 'cave' | 'drift'; → { id, piece, have, n, complete } or null
  function tmapDrop(s, src, rng) {
    var p = TMAP_DROP[src];
    if (!p || rng() >= p) return null;
    var open = TMAPS.filter(function (m) { return !tmapComplete(s, m.id) && tmapSceneOk(s, m.scene); });
    if (!open.length) return null;
    var m = open[Math.floor(rng() * open.length) % open.length], have = tmapPieces(s, m.id), miss = [];
    for (var k = 0; k < m.n; k++) if (have.indexOf(k) < 0) miss.push(k);
    var piece = miss[Math.floor(rng() * miss.length) % miss.length], t = tmapOf(s);
    t.p[m.id] = have.concat([piece]).sort(function (a, b) { return a - b; });
    return { id: m.id, piece: piece, have: t.p[m.id].length, n: m.n, complete: t.p[m.id].length >= m.n };
  }
  // complete maps not dug yet whose X is in this scene
  function tmapReady(s, scene) { return TMAPS.filter(function (m) { return m.scene === scene && tmapComplete(s, m.id) && !tmapDug(s, m.id); }); }
  function tmapCondOk(m, env) {
    var c = m.cond;
    if (!c) return true;
    env = env || {};
    if (c.phase && env.phase !== c.phase) return false;
    if (c.weather && c.weather.indexOf(env.weather) < 0) return false;
    if (c.tide === 'low' && !env.low) return false;
    return true;
  }
  function grantTreasure(s, m) {
    var r = m.reward, out = { coins: r.coins || 0 };
    if (r.gold) { s.seeds.gold += r.gold; s.dex.goldSeed = true; out.gold = r.gold; }
    if (r.deco) {
      var g = grantDeco(s, r.deco);
      if (g.ok) { out.deco = r.deco; out.stored = g.stored; } else out.coins += 1000;   // already had it: coins instead
    }
    s.coins += out.coins;
    return out;
  }
  // a long press at (x, y) in `scene`. env = { phase, weather, low }.
  // → { ok: true, id, reward } | { ok: false, why: 'none' | 'far' | 'near' | 'cond', id }
  function tmapDig(s, scene, x, y, env) {
    var ready = tmapReady(s, scene);
    if (!ready.length) return { ok: false, why: 'none' };
    var best = null, bd = 1e9;
    ready.forEach(function (m) { var d = Math.hypot(x - m.x, y - m.y); if (d < bd) { bd = d; best = m; } });
    if (bd > DIG_R) return { ok: false, why: bd > DIG_NEAR ? 'far' : 'near', id: best.id };
    if (!tmapCondOk(best, env)) return { ok: false, why: 'cond', id: best.id };
    tmapOf(s).dug[best.id] = true;
    return { ok: true, id: best.id, reward: grantTreasure(s, best) };
  }
  function tmapDugCount(s) { return s.tmap ? TMAPS.filter(function (m) { return s.tmap.dug[m.id]; }).length : 0; }
  // the hint a wrong press gives (pictures only: landmark words, never numbers)
  function tmapHint(m, why) {
    var c = m.cond || {};
    if (why === 'near') return '흙이 조금 부드럽다… 바로 옆인 것 같다';
    if (why === 'cond') return c.phase === 'night' ? '자리는 맞는 것 같다 · 지도 귀퉁이에 달이 그려져 있다'
      : c.phase === 'morning' ? '자리는 맞는 것 같다 · 지도에 떠오르는 해가 그려져 있다'
      : c.phase === 'evening' ? '자리는 맞는 것 같다 · 지도에 지는 해가 그려져 있다'
      : c.tide ? '자리는 맞는 것 같다 · 물이 빠져야 팔 수 있겠다'
      : c.weather && c.weather[0] === 'fog' ? '자리는 맞는 것 같다 · 지도가 안개처럼 흐릿하게 그려져 있다'
      : '자리는 맞는 것 같다 · 지도에 빗줄기가 그려져 있다';
    return '여기는 아닌 것 같다 · 지도를 다시 보자 · X는 ' + m.land + ' 쪽';
  }

  // ---------- 소문 ----------
  // src: 'res' (마을 주민 대화, who = resident id), 'letter' (병 편지), 'visitor' (who = visitor id)
  // about: 'fish' 전설 물고기 · 'forage' 숨은 채집물 · 'egg' 비밀 · 'map' 보물 지도
  var RUMORS = [
    { id: 'r_sturgeon', src: 'res', who: 'fisher', about: 'fish', text: '짙은 안개 낀 날, 강 바닥에 갑옷 두른 놈이 지나간다더군.' },
    { id: 'r_sword',    src: 'res', who: 'fisher', about: 'fish', text: '황새치는 한낮에만 먼바다로 나온다네. 해 질 무렵엔 소용없어.' },
    { id: 'r_tuna',     src: 'res', who: 'chef', about: 'fish', text: '금요일 저녁 퇴근 무렵엔 연못에 참치가 든대요! 진짜래요!' },
    { id: 'r_dock',     src: 'res', who: 'chef', about: 'map', text: '옛날 어부가 낚시 부두 밑에 뭘 묻었다는 얘기, 들어 봤어요?' },
    { id: 'r_koi',      src: 'res', who: 'grandma', about: 'fish', text: '황금 수박을 한 번 길러 내면 연못에 금빛 잉어가 온단다.' },
    { id: 'r_songi',    src: 'res', who: 'grandma', about: 'forage', text: '가을비 그친 뒤 소나무 숲에 가 봐. 송이가 숨어 있지.' },
    { id: 'r_scare',    src: 'res', who: 'kid', about: 'egg', text: '허수아비 열 번 연달아 치면 춤춘다! 쉬면 안 돼!' },
    { id: 'r_beetle',   src: 'res', who: 'kid', about: 'forage', text: '맑은 여름 낮 숲에 무지개 색 벌레가 있대. 비단벌레!' },
    { id: 'r_glow',     src: 'res', who: 'teacher', about: 'forage', text: '밤의 숲에는 은은하게 빛나는 이끼가 자란대요. 겨울만 빼고요.' },
    { id: 'r_mapcond',  src: 'res', who: 'teacher', about: 'map', text: '보물 지도에 달이 그려져 있으면 밤에, 빗줄기면 궂은 날에 파는 거래요.' },
    { id: 'r_ginseng',  src: 'res', who: 'painter', about: 'forage', text: '숲 깊은 데서 산삼을 봤소. 봄부터 가을까지, 정말 가끔이오.' },
    { id: 'r_well',     src: 'res', who: 'painter', about: 'map', text: '안개 낀 날 우물가를 그리면 땅이 뭔가 숨긴 것 같아 보이오.' },
    { id: 'r_ray',      src: 'letter', about: 'fish', text: '할머니 말로는 안개 낀 바다에 날개 달린 커다란 그림자가 지나간대요.' },
    { id: 'r_amber',    src: 'letter', about: 'forage', text: '안개 낀 날 섬 바닷가에는 고래가 남긴 보물이 밀려온대요.' },
    { id: 'r_pieces',   src: 'letter', about: 'map', text: '찢어진 지도 조각이 가끔 병이나 고물에 섞여 떠다닌대요. 바위 속, 섬 바닷가에도요.' },
    { id: 'r_palm',     src: 'letter', about: 'map', text: '섬 야자수 곁에 달밤에만 반짝이는 모래가 있대요.' },
    { id: 'r_wish',     src: 'letter', about: 'egg', text: '한 밤에 소원을 세 번 빌어 보세요. 별똥별도 반딧불도 돼요.' },
    { id: 'r_midnight', src: 'visitor', who: 'mailman', about: 'egg', text: '우편배달부: 진짜 밤 12시에 마당을 열어 두면 손님이 온대요.' },
    { id: 'r_dotdom',   src: 'visitor', who: 'fireflies', about: 'fish', text: '반딧불이 섬 쪽으로 흘러간다… 깊은 밤 섬 앞바다에 아주 큰 물고기가 산다는 듯이.' },
    { id: 'r_sleep',    src: 'visitor', who: 'cat', about: 'egg', text: '고양이가 하품을 하며 집 쪽을 본다. 밤엔 침대에 누워 볼까?' },
    { id: 'r_dig',      src: 'visitor', who: 'raccoon', about: 'map', text: '너구리가 땅을 꾹 누르고 파는 시늉을 한다. 지도 X 자리는 꾹 눌러 파는 건가?' },
    { id: 'r_clover',   src: 'visitor', who: 'squirrel', about: 'forage', text: '다람쥐가 봄 숲 세잎클로버 사이를 뒤진다. 네잎이 숨어 있나 보다.' },
    { id: 'r_merch',    src: 'visitor', who: 'merchant', about: 'map', text: '상인: 지도 조각요? 낚시 고물, 동굴 바위, 섬 표류물에서 가끔 나와요.' },
    { id: 'r_frog',     src: 'visitor', who: 'frog', about: 'map', text: '개구리가 해 뜰 무렵 마당 우리 쪽으로 폴짝. 물통 옆이 수상하다.' }
  ];
  var RUMOR_CHANCE = { res: 0.5, letter: 0.6, visitor: 1 };
  var RUMOR_ABOUT = { fish: '전설 물고기', forage: '숨은 채집물', egg: '비밀', map: '보물 지도' };
  function rumorById(id) { for (var k = 0; k < RUMORS.length; k++) if (RUMORS[k].id === id) return RUMORS[k]; return null; }
  function rumorHeard(s, id) { return !!(s.rumor && s.rumor.got.indexOf(id) >= 0); }
  function rumorCount(s) { return s.rumor ? s.rumor.got.length : 0; }
  // the next unheard line this source (and who) has, in table order; null when none or the roll misses
  function rumorHear(s, src, who, rng) {
    var pool = RUMORS.filter(function (r) { return r.src === src && (!r.who || r.who === who) && !rumorHeard(s, r.id); });
    if (!pool.length || rng() >= (RUMOR_CHANCE[src] || 0)) return null;
    if (!s.rumor) s.rumor = { got: [] };
    s.rumor.got.push(pool[0].id);
    return pool[0];
  }

  // ---------- save ----------
  function decodeTreasure(o, s) {
    var q = o.tmap;
    if (q && typeof q === 'object' && !Array.isArray(q)) {
      var t = { p: {}, dug: {} };
      if (q.p && typeof q.p === 'object') TMAPS.forEach(function (m) {
        var a = q.p[m.id];
        if (!Array.isArray(a)) return;
        var got = [];
        a.forEach(function (k) { if (typeof k === 'number' && k === Math.floor(k) && k >= 0 && k < m.n && got.indexOf(k) < 0) got.push(k); });
        if (got.length) t.p[m.id] = got.sort(function (x, y) { return x - y; });
      });
      if (q.dug && typeof q.dug === 'object') TMAPS.forEach(function (m) { if (q.dug[m.id] === true) t.dug[m.id] = true; });
      s.tmap = t;
    }
    var r = o.rumor;
    if (r && typeof r === 'object' && Array.isArray(r.got)) {
      var got = [];
      r.got.forEach(function (id) { if (typeof id === 'string' && rumorById(id) && got.indexOf(id) < 0) got.push(id); });
      s.rumor = { got: got };
    }
  }

  expose({
    TMAPS: TMAPS, TMAP_DROP: TMAP_DROP, TMAP_SCENE_NAME: TMAP_SCENE_NAME, DIG_R: DIG_R, RUMORS: RUMORS, RUMOR_CHANCE: RUMOR_CHANCE, RUMOR_ABOUT: RUMOR_ABOUT,
    tmapById: tmapById, tmapOf: tmapOf, tmapPieces: tmapPieces, tmapComplete: tmapComplete, tmapDug: tmapDug, tmapSceneOk: tmapSceneOk,
    tmapDrop: tmapDrop, tmapReady: tmapReady, tmapCondOk: tmapCondOk, tmapDig: tmapDig, tmapDugCount: tmapDugCount, tmapHint: tmapHint,
    rumorById: rumorById, rumorHeard: rumorHeard, rumorCount: rumorCount, rumorHear: rumorHear, decodeTreasure: decodeTreasure
  });
