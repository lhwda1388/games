  // ---------- 사진기 (stage 7): album slots, which moments are on screen now, taking a shot (s.cam, made when bought) ----------
  // shotsNow(ctx) is pure: the UI describes what is on screen and gets back the album slots it could fill.
  // ctx = { scene, phase, season, weather, festival, vis: [visitor ids on screen], landed: fish id just caught,
  //         petNap, snowman, low (low tide), dug: flat find just dug, glowmoss, meteor, lighthouse, fossilDone }
  var CAMERA_COST = 1500;
  var SHOTS = [
    // visitors (ids match logic/visitors.js)
    { id: 'cat',          name: '고양이',        hint: '마당에 놀러 온 손님' },
    { id: 'raccoon',      name: '너구리',        hint: '장난꾸러기 마당 손님' },
    { id: 'squirrel',     name: '다람쥐',        hint: '나무가 있으면 찾아온다' },
    { id: 'sparrows',     name: '참새 떼',       hint: '새집 근처 · 낮에' },
    { id: 'butterfly',    name: '나비',          hint: '꽃밭 위 낮 손님' },
    { id: 'mailman',      name: '우편배달부',    hint: '우체통이 있으면 들른다' },
    { id: 'merchant',     name: '떠돌이 상인',   hint: '10분만 머무는 손님' },
    { id: 'fireflies',    name: '반딧불',        hint: '밤 마당 하늘' },
    { id: 'shootingstar', name: '별똥별',        hint: '밤하늘을 가로지르는 순간' },
    { id: 'rainbow',      name: '무지개',        hint: '비가 그친 직후 마당 하늘' },
    { id: 'duckfam',      name: '오리 가족',     hint: '연못을 줄지어 건너는' },
    { id: 'turtle',       name: '거북이',        hint: '연못가 느림보' },
    { id: 'frog',         name: '개구리',        hint: '연못가에서 개굴' },
    // festivals
    { id: 'fest_spring',  name: '벚꽃 축제',     hint: '봄 축제 · 꽃잎이 흩날릴 때' },
    { id: 'fest_summer',  name: '불꽃놀이',      hint: '여름 축제 · 해가 지면' },
    { id: 'fest_autumn',  name: '보름달',        hint: '가을 축제 밤 · 마당 하늘' },
    { id: 'fest_winter',  name: '눈사람 축제',   hint: '겨울 축제 · 마당에서' },
    // moments
    { id: 'legend',       name: '전설의 손맛',   hint: '전설 물고기를 낚은 바로 그때' },
    { id: 'petnap',       name: '낮잠',          hint: '친한 반려동물이 꾸벅꾸벅' },
    { id: 'snowman',      name: '눈사람',        hint: '마당에 눈사람이 서 있으면' },
    { id: 'lowtide',      name: '썰물 갯벌',     hint: '물이 빠진 갯벌' },
    { id: 'pearl',        name: '진주',          hint: '갯벌에서 진주를 캔 순간' },
    // scenery
    { id: 'snowfarm',     name: '눈 내리는 밭',  hint: '눈 오는 날 밭과 연못' },
    { id: 'rainpond',     name: '빗속 연못',     hint: '비 오는 날 연못' },
    { id: 'fogforest',    name: '안개 숲',       hint: '안개 낀 날 숲' },
    { id: 'mossglow',     name: '빛나는 이끼',   hint: '밤 숲 · 이끼가 은은히' },
    { id: 'orchardbloom', name: '꽃 핀 과수원',  hint: '봄 과수원' },
    { id: 'sunsetflat',   name: '저녁 갯벌',     hint: '해 질 녘 썰물' },
    { id: 'villagenight', name: '마을의 밤',     hint: '밤 마을 거리' },
    // stage 7 lanes ② ③ (cave, stars, island) fill these in
    { id: 'meteor',       name: '유성우',        hint: '별이 쏟아지는 밤' },
    { id: 'lighthouse',   name: '등대 불빛',     hint: '다시 켜진 섬 등대 · 밤에' },
    { id: 'cave',         name: '동굴 속',       hint: '숲 안쪽 어두운 동굴' },
    { id: 'fossil',       name: '화석 완성',     hint: '화석 조각을 다 모은 순간' }
  ];
  var SHOT_BY = {};
  SHOTS.forEach(function (p) { SHOT_BY[p.id] = p; });
  var FEST_SHOT = {
    spring: function (c) { return c.scene === 'farm' || c.scene === 'yard' || c.scene === 'orchard'; },
    summer: function (c) { return (c.scene === 'farm' || c.scene === 'yard') && (c.phase === 'evening' || c.phase === 'night'); },
    autumn: function (c) { return c.scene === 'yard' && c.phase === 'night'; },
    winter: function (c) { return c.scene === 'yard'; }
  };

  function shotById(id) { return SHOT_BY.hasOwnProperty(id) ? SHOT_BY[id] : null; }
  function shotsNow(c) {
    var out = [], sc = c.scene;
    function add(id) { if (out.indexOf(id) < 0) out.push(id); }
    (c.vis || []).forEach(function (id) { if (shotById(id)) add(id); });
    if (c.festival && FEST_SHOT[c.festival] && FEST_SHOT[c.festival](c)) add('fest_' + c.festival);
    var f = c.landed && fishById(c.landed);
    if (f && f.rarity === '전설') add('legend');
    if (c.petNap) add('petnap');
    if (c.snowman && sc === 'yard') add('snowman');
    if (sc === 'flat' && c.low) { add('lowtide'); if (c.phase === 'evening') add('sunsetflat'); }
    if (c.dug === 'pearl') add('pearl');
    if (sc === 'farm' && c.weather === 'snow') add('snowfarm');
    if (sc === 'farm' && c.weather === 'rain') add('rainpond');
    if (sc === 'forest' && c.weather === 'fog') add('fogforest');
    if (sc === 'forest' && c.glowmoss) add('mossglow');
    if (sc === 'orchard' && c.season === 'spring') add('orchardbloom');
    if (sc === 'village' && c.phase === 'night') add('villagenight');
    if (c.meteor) add('meteor');
    if (c.lighthouse) add('lighthouse');
    if (sc === 'cave') add('cave');
    if (c.fossilDone) add('fossil');
    rideShots(c, add);   // stage 9 ③: 열기구 sky slots
    return out;
  }
  function camOk(s) { return !!(s.cam && s.cam.own); }
  function buyCamera(s) {
    if (camOk(s)) return { ok: false, why: 'owned' };
    if (s.coins < CAMERA_COST) return { ok: false, why: 'coins' };
    s.coins -= CAMERA_COST; s.cam = { own: true, album: {} };
    return { ok: true };
  }
  // one picture per slot: the first time it goes in the album (with when), again = nothing new
  function takeShot(s, id, now) {
    if (!camOk(s) || !shotById(id)) return null;
    if (s.cam.album[id]) return { first: false };
    s.cam.album[id] = now;
    return { first: true };
  }
  function albumCount(s) { return s.cam ? Object.keys(s.cam.album).length : 0; }

  function decodeCamera(o, s) {
    var q = o.cam;
    if (!q || typeof q !== 'object' || q.own !== true) return;
    var c = s.cam = { own: true, album: {} };
    if (q.album && typeof q.album === 'object') SHOTS.forEach(function (p) {
      var t = q.album[p.id];
      if (typeof t === 'number' && isFinite(t) && t > 0) c.album[p.id] = t;
    });
  }

  expose({
    SHOTS: SHOTS, CAMERA_COST: CAMERA_COST, shotById: shotById, shotsNow: shotsNow, camOk: camOk, buyCamera: buyCamera,
    takeShot: takeShot, albumCount: albumCount, decodeCamera: decodeCamera
  });
