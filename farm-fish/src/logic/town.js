  // ---------- stage 10 ③: 주민들의 하루 (places by game time) + 새 주민 이사 (s.town) ----------
  // A resident who is away from home is out at a place on the 마을 street (the old six keep their stage-6B hours).
  // Three new residents move in after big goals; they take orders, letters, gifts and visits like the old six.
  // s.town = { mv: { id: 1 unread arrival letter | 2 read }, met: { day, ids: { id: true } } }, made lazily.
  var TOWN_MEET_PTS = 1;        // 친밀도 for the first street meeting with someone each real day
  var TOWN_MUSEUM_PART = 0.75;  // 박물관 this full brings 나리
  // spots are the top-left of a 9×9 face on the 180×200 street; a second person at the same place stands 11 px right
  var TOWN_PLACES = {
    pavilion: { name: '정자',         x: 4,   y: 95 },
    garden:   { name: '텃밭',         x: 36,  y: 95 },
    school:   { name: '분교 마당',    x: 64,  y: 95 },
    dock:     { name: '나루터 길',    x: 146, y: 95 },
    well:     { name: '우물가',       x: 56,  y: 183 },
    hill:     { name: '언덕',         x: 54,  y: 182 },   // just right of the 마을 언덕 box (ride.js HILL) so its tap stays free
    market:   { name: '장터 가는 길', x: 86,  y: 182 },
    museum:   { name: '박물관 앞',    x: 108, y: 184 }
  };
  // phase → place, for the phases a resident is away (must match VIL[id].away)
  var TOWN_PLAN = {
    grandma: { evening: 'pavilion' }, fisher: { morning: 'dock' }, chef: { night: 'market' },
    kid: { day: 'school' }, teacher: { day: 'school' }, painter: { day: 'hill' },
    archaeo: { day: 'museum', evening: 'well' }, seagirl: { morning: 'dock', day: 'school' }, botanist: { morning: 'garden', evening: 'hill' }
  };
  var TOWN_LINES = {
    grandma: { pavilion: ['정자 바람이 좋아. 경로당 할멈들이랑 수다 떠는 게 낙이지.', '저녁엔 여기 앉아서 노을 보는 거야. 자기도 앉아 봐요.', '오늘 누구네 손주가 왔는지 다 여기서 듣는다니까.'] },
    fisher: { dock: ['…새벽 물안개 속에 찌를 보는 맛이 있지.', '나루터 물이 오늘은 맑군. 붕어가 잘 보일 게야.', '…아침부터 무슨 일인가. 조용히 하게, 고기 도망가.'] },
    chef: { market: ['새벽 장 보러 가요! 좋은 배추는 일찍 동나거든요.', '장바구니가 무거워도 국물 생각하면 힘이 나요!', '밤길 조심하세요! 저는 이 길 눈 감고도 다녀요.'] },
    kid: { school: ['쉬는 시간이다! 공기놀이 할래요?', '선생님이 오늘 받아쓰기 백 점 줬어요! 진짜예요!', '학교 마당에 개미굴 있어요. 비밀이에요.'] },
    teacher: { school: ['아이들이 운동장에서 노는 소리, 참 좋지요?', '오늘은 바깥 수업이에요. 꽃 이름 배우는 날.', '종 치기 전에 잠깐 바람 쐬러 나왔어요.'] },
    painter: { hill: ['언덕에서 보면 마을이 한 장의 그림이오.', '구름 그림자가 지나가는 걸 그리는 중이오. 쉿.', '저기 자네 농장도 보이오. 작고 아름답군.'] },
    archaeo: { museum: ['박물관 유리장 속 암모나이트, 몇 번을 봐도 설레요.', '전시 설명을 고쳐 쓰는 중이에요. 화석은 정확해야 하거든요.', '관람객이 “이게 뭐예요?” 물어 주는 게 제일 좋아요.'],
      well: ['우물 돌벽 좀 보세요. 이 돌, 꽤 오래된 거예요.', '저녁 우물가는 조용해서 생각하기 좋아요.', '우물 바닥 모래에 작은 조개 화석이 섞였을지도요.'] },
    seagirl: { dock: ['할아버지 등대 불빛, 여기서도 보여요!', '나루터 배 구경 중이에요. 언젠가 내 배를 탈 거예요.', '아침 바다 냄새가 여기까지 와요. 킁킁.'],
      school: ['도윤이랑 같은 반 됐어요! 근데 도윤이 맨날 장난쳐요.', '선생님이 바다 그림 잘 그린다고 했어요!', '섬엔 학교가 없었거든요. 여기 너무 좋아요.'] },
    botanist: { garden: ['텃밭 가장자리에 냉이가 숨어 있어요. 보이세요?', '아침 이슬 맺힌 잎을 관찰하는 중이에요.', '흙 냄새가 좋은 걸 보니 올해 농사는 잘될 거예요.'],
      hill: ['언덕에는 들꽃이 서른 종도 넘게 자라요. 세어 봤거든요.', '해 질 녘엔 달맞이꽃이 피는 걸 기다려요.', '바람에 실려 온 씨앗이 어디서 왔을까 생각해요.'] }
  };

  // ---------- the three new residents ----------
  RES_EXTRA.push(
    { id: 'archaeo',  name: '한 박사',        who: '고고학자 · 화석 이야기만 나오면 밤을 샌다', kinds: ['ore', 'gem'] },
    { id: 'seagirl',  name: '등대 손녀 바다', who: '등대지기 손녀 · 바다 냄새 나는 씩씩한 아이', kinds: ['isle', 'flat'] },
    { id: 'botanist', name: '식물학자 나리',  who: '들꽃 연구가 · 박물관 소문을 듣고 왔다', kinds: ['forage', 'fruit', 'honey'] }
  );
  var TOWN_ARRIVE = {
    archaeo: { goal: 'fossil', letter: '화석을 전부 맞췄다는 소식을 듣고 짐을 쌌어요! 윗길 가운데 작은 집에 연구실을 차렸어요. 동굴 이야기 들려주세요. — 한 박사' },
    seagirl: { goal: 'lighthouse', letter: '할아버지 등대에 불이 켜졌다고 엄마가 마을로 이사 가도 된대요! 분교 다녀요. 놀러 와요! — 바다' },
    botanist: { goal: 'museum', letter: '박물관이 4분의 3이나 찼다니, 이런 마을이면 연구할 게 많겠어요. 윗길 첫 집에 들꽃 표본을 풀었어요. — 나리' }
  };
  var HWAJEON = { id: 'hwajeon', name: '진달래 화전', need: ['azalea', 'azalea', 'potato'], time: 300e3, sell: 380, gift: 'botanist' };
  GIFT_RECIPES.push(HWAJEON); RECIPES.push(HWAJEON);
  RES_STORY.archaeo = {
    letters: ['광석 잘 받았어요! 이 결정 구조 좀 보세요. 아, 회색이라 잘 안 보이죠? 그래도요!',
      '동굴 깊은 곳 반짝이는 칸을 꾹 눌러 깨면 보석이 잘 나온대요. 제 연구 노트에 적혀 있어요.',
      '해시계를 하나 만들었어요. 옛날 사람들은 그림자로 시간을 쟀답니다. 마당에 세워 두세요.',
      '제 연구실에서 키우던 자수정 정원이에요. 돌도 자란다는 거, 믿어지세요?'],
    gifts: [null, null, { type: 'deco', id: 'sundial' }, { type: 'deco', id: 'geode' }] };
  RES_STORY.seagirl = {
    letters: ['조개 고마워요! 할아버지한테 편지로 자랑했어요.',
      '할아버지가 그러는데, 등대 불이 켜진 밤엔 섬 바다에 큰 물고기가 더 잘 온대요!',
      '바닷가에서 주운 병으로 등불을 만들었어요. 할아버지 등대처럼 반짝여요!',
      '옛날 배에 달려 있던 닻이에요. 할아버지가 친한 사람한테 주래요. 그게 당신이에요!'],
    gifts: [null, null, { type: 'deco', id: 'bottlelamp' }, { type: 'deco', id: 'anchor' }] };
  RES_STORY.botanist = {
    letters: ['보내 주신 것들로 표본을 만들었어요. 잎맥이 아주 선명해요.',
      '숲은 비가 그친 다음 날 가 보세요. 숨어 있던 것들이 고개를 내밀어요.',
      '봄에 진달래가 피면 화전을 부쳐 보세요. 진달래 둘에 감자 하나면 돼요.',
      '마당에 꽃밭을 꾸며 드릴게요. 나비가 오고 벌이 오면 꿀도 달라져요.'],
    gifts: [null, null, { type: 'recipe', id: 'hwajeon' }, { type: 'deco', id: 'flowers' }] };
  VIL.archaeo = { home: '윗길 연구실', away: ['day', 'evening'], note: '박물관과 우물가에서 조사 중이에요 · 아침·밤엔 집에',
    likes: ['quartz', 'amethyst', 'garnet', 'silver', 'walnut'], dislikes: ['lugworm', 'jam'],
    errands: ['coal', 'copper', 'iron', 'quartz', 'rock'],
    sayLike: '오! 이 광택! 표본 상자 맨 앞에 둘게요!', sayOk: '고마워요. 기록해 둘게요.', sayNo: '꿈틀거리는 건 연구 분야가 아니라서요… 마음만요.',
    hint: '옛 기록에 이런 말이 있어요. ',
    talk: [['안녕하세요, 고고학자 한이에요. 화석 맞춘 분 맞죠?', '돌 하나에도 몇만 년 이야기가 들어 있어요.'],
      ['동굴 벽의 줄무늬는 옛날 물이 흐른 자국이에요.', '박물관 화석실이 이 마을 보물이에요.'],
      ['오 화백님이 제 화석을 그려 주셨어요. 뼈에 표정이 있대요.', '도윤이가 매일 “공룡 어딨어요?” 물어요.'],
      ['바다 아이가 섬에서 주운 돌을 가져왔는데, 진짜 화석이었어요!', '나리 씨랑 나뭇잎 화석 이야기하면 밤이 새요.'],
      ['당신 덕에 이 마을이 제 두 번째 발굴지예요.', '제 연구 노트 첫 장에 당신 이름을 적었어요.']] };
  VIL.seagirl = { home: '파도 무늬 집', away: ['morning', 'day'], note: '나루터 갔다가 분교 가요 · 저녁에 와요',
    likes: ['shell', 'conch', 'glassfloat', 'sanddollar', 'berry', 'melon'], dislikes: ['ssuk', 'shiitake'],
    errands: ['shell', 'driftwood', 'clam', 'whelk', 'mackerel'],
    sayLike: '와아! 이거 섬에서도 귀한 거예요! 고마워요!', sayOk: '고마워요! 할아버지한테 자랑해야지.', sayNo: '으, 이건 써요… 그래도 고마워요.',
    hint: '할아버지가 그러는데요, ',
    talk: [['안녕하세요! 저 등대지기 손녀 바다예요!', '마을은 바다 냄새가 조금밖에 안 나요.'],
      ['도윤이가 피라미 잡는 법 알려 줬어요. 근데 제가 더 잘 잡아요.', '하늘 선생님 수업 재밌어요.'],
      ['박 영감님이 할아버지랑 옛날 친구래요!', '순자 할머니가 목도리 떠 주신대요.'],
      ['저 커서 등대지기 할 거예요. 아니면 선장!', '민지 언니네 국밥에 굴 넣으면 맛있대요.'],
      ['우리 이제 진짜 친구예요! 섬 비밀 장소 알려 줄게요.', '할아버지가 당신 얘기만 하면 웃어요.']] };
  VIL.botanist = { home: '들꽃 집', away: ['morning', 'evening'], note: '아침엔 텃밭, 저녁엔 언덕에 관찰 나갔어요',
    likes: ['azalea', 'hydrangea', 'eveprimrose', 'acacia', 'wildhoney', 'omija'], dislikes: ['squid', 'rock'],
    errands: ['naengi', 'dallae', 'gosari', 'acorn', 'wildhoney'],
    sayLike: '어머, 이 꽃! 표본으로 꼭 남길게요.', sayOk: '고마워요. 잘 말려 둘게요.', sayNo: '이건… 연구실 냄새가 좀 날 것 같아요. 마음만요.',
    hint: '들꽃 공책에 이런 게 적혀 있어요. ',
    talk: [['처음 뵙겠어요. 들꽃을 연구하는 나리예요.', '이 마을 길가에도 이름 모를 풀이 가득해요.'],
      ['진달래는 봄에, 달맞이꽃은 여름 저녁에 펴요.', '박물관 덕에 이 마을을 알게 됐어요.'],
      ['순자 할머니 텃밭 냉이가 제일 실해요.', '하늘 선생님 반 아이들이랑 꽃 이름 공부를 해요.'],
      ['한 박사님 나뭇잎 화석, 지금 숲 잎이랑 거의 같아요!', '벌이 어느 꽃에 앉느냐로 꿀맛이 달라져요.'],
      ['당신 마당 꽃밭은 제 연구의 보물이에요.', '언젠가 이 마을 들꽃 도감을 같이 만들어요.']] };
  // rumors the new residents tell over a chat (logic/treasure.js RUMORS)
  RUMORS.push(
    { id: 'r_glint', src: 'res', who: 'archaeo', about: 'map', text: '동굴 바위에서도 가끔 찢어진 지도 조각이 나와요. 옛 광부가 숨겼나 봐요.' },
    { id: 'r_lightfish', src: 'res', who: 'seagirl', about: 'fish', text: '깊은 밤 섬 앞바다에 돗돔이 산대요. 할아버지가 등대에서 봤대요!' },
    { id: 'r_primrose', src: 'res', who: 'botanist', about: 'forage', text: '달맞이꽃은 여름 저녁에만 숲에서 피어요. 낮엔 꼭 오므리고 있어요.' }
  );

  // ---------- 이사 ----------
  var TOWN_GOAL = {
    fossil: function (s) { return fossilCount(s) >= FOSSILS.length; },
    lighthouse: function (s) { return !!(s.isle && s.isle.lit); },
    museum: function (s) { var t = museumTotal(s); return t.m > 0 && t.n >= Math.ceil(t.m * TOWN_MUSEUM_PART); }
  };
  function townOf(s) { if (!s.town) s.town = { mv: {}, met: { day: -1, ids: {} } }; return s.town; }
  // goals reached → move in (once each); returns who arrived just now. Needs the 마을 open.
  function townArrive(s) {
    if (!villageOk(s)) return [];
    var out = [];
    RES_EXTRA.forEach(function (r) {
      if (resMoved(s, r.id) || !TOWN_GOAL[TOWN_ARRIVE[r.id].goal](s)) return;
      townOf(s).mv[r.id] = 1;
      out.push(r.id);
    });
    return out;
  }
  function townUnread(s) { return s.town ? Object.keys(s.town.mv).filter(function (id) { return s.town.mv[id] === 1; }) : []; }
  function townRead(s, id) { if (!s.town || s.town.mv[id] !== 1) return false; s.town.mv[id] = 2; return true; }
  // the old six always live here; the others once moved in
  function resHere(s, id) { return VIL_IDS.indexOf(id) >= 0 || resMoved(s, id); }

  // ---------- 주민들의 하루 ----------
  // the street place a resident is at now, or null when home
  function residentPlace(id, now, tzMin) {
    if (!VIL[id] || !residentAway(id, now, tzMin)) return null;
    return TOWN_PLAN[id][gameClock(now, tzMin).phase] || null;
  }
  // everyone out on the street now → [{ id, place, x, y }] (two at one place stand side by side)
  function townOut(s, now, tzMin) {
    var out = [], n = {};
    VIL_IDS.concat(RES_EXTRA.map(function (r) { return r.id; })).forEach(function (id) {
      if (!resHere(s, id)) return;
      var pl = residentPlace(id, now, tzMin);
      if (!pl) return;
      var k = n[pl] = (n[pl] || 0) + 1, p = TOWN_PLACES[pl];
      out.push({ id: id, place: pl, x: p.x + (k - 1) * 11, y: p.y });
    });
    return out;
  }
  function townLine(id, place, day) { var ls = TOWN_LINES[id][place]; return ls[strHash('town:' + id + ':' + place + ':' + day) % ls.length]; }
  // tapping someone out on the street: their line for that place; 친밀도 once per resident per real day
  function townMeet(s, id, now, tzMin) {
    if (!villageOk(s)) return { ok: false, why: 'closed' };
    if (!VIL[id] || !resHere(s, id)) return { ok: false, why: 'who' };
    var pl = residentPlace(id, now, tzMin);
    if (!pl) return { ok: false, why: 'home' };
    var day = petDay(now, tzMin), text = townLine(id, pl, day), t = townOf(s);
    if (t.met.day !== day) t.met = { day: day, ids: {} };
    if (t.met.ids[id]) return { ok: true, again: true, place: pl, text: text, pts: 0, ups: [] };
    t.met.ids[id] = true;
    return { ok: true, again: false, place: pl, text: text, pts: TOWN_MEET_PTS, ups: befriendPts(s, id, TOWN_MEET_PTS) };
  }

  // ---------- save: called by decode() ----------
  function decodeTown(o, s) {
    var q = o.town;
    if (!q || typeof q !== 'object') return;
    var t = { mv: {}, met: { day: -1, ids: {} } };
    RES_EXTRA.forEach(function (r) { if (q.mv && (q.mv[r.id] === 1 || q.mv[r.id] === 2)) t.mv[r.id] = q.mv[r.id]; });
    if (q.met && typeof q.met === 'object' && typeof q.met.day === 'number' && isFinite(q.met.day)) {
      t.met.day = Math.floor(q.met.day);
      if (q.met.ids && typeof q.met.ids === 'object') Object.keys(VIL).forEach(function (id) { if (q.met.ids[id] === true) t.met.ids[id] = true; });
    }
    s.town = t;
  }

  expose({
    TOWN_MEET_PTS: TOWN_MEET_PTS, TOWN_MUSEUM_PART: TOWN_MUSEUM_PART, TOWN_PLACES: TOWN_PLACES, TOWN_PLAN: TOWN_PLAN, TOWN_LINES: TOWN_LINES,
    TOWN_ARRIVE: TOWN_ARRIVE, townArrive: townArrive, townUnread: townUnread, townRead: townRead, resHere: resHere,
    residentPlace: residentPlace, townOut: townOut, townMeet: townMeet, decodeTown: decodeTown
  });
