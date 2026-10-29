  // ---------- 마을: 주민 집 방문 (하루 한 번 대화·선물, 가끔 심부름), 이어지는 심부름 이야기 (s.vil) ----------
  // Friendship goes through befriendPts (logic/residents.js), so levels, letters and level gifts come exactly once.
  // "Today" is the real local day (petDay); who is home follows the game clock. s.vil is created lazily.
  var VILLAGE_REP = 5;
  var VIL_TALK_PTS = 1, VIL_GIFT_PTS = { like: 3, ok: 1, dislike: 0 }, VIL_ERRAND_PTS = 2, VIL_STEP_PTS = 1;
  // away: game-clock phases the resident is out (odd: only on odd game days); likes/dislikes are item ids
  var VIL = {
    grandma: { home: '장독 집', away: ['evening'], note: '경로당에 마실 갔어요 · 밤에 돌아와요',
      likes: ['ssuk', 'cabbage', 'sweetpotato', 'naengi', 'dallae', 'ssukjeon'], dislikes: ['squid', 'octopus'],
      errands: ['radish', 'potato', 'cabbage', 'ssuk', 'cucumber'],
      sayLike: '아이고, 내가 이걸 얼마나 좋아하는데! 고마워요.', sayOk: '어머, 잘 먹을게요.', sayNo: '이건 이가 시려서… 그래도 마음은 고마워요.',
      hint: '그러고 보니 우리 손주가 그러는데, ',
      talk: [['밭일은 할 만해요? 무리하지 말고 쉬엄쉬엄 해요.', '처음 보는 얼굴이네. 새로 온 농부구나?'],
        ['장독 뚜껑은 볕 좋은 날 열어 두는 거예요.', '뜨개질하다 보면 하루가 금방 가요.'],
        ['영감 살아 있을 땐 저 밭에서 무를 키웠지.', '도윤이 녀석, 오늘도 학교 끝나면 들르겠지.'],
        ['우리 집 된장은 삼 년 묵은 거야. 맛이 깊지.', '박 영감은 무뚝뚝해도 속은 따뜻해요.'],
        ['자기가 오면 우리 집이 환해져요.', '내 뜨개 솜씨는 다 자기한테 물려줄까 봐.']] },
    fisher: { home: '낚시 오두막', away: ['morning'], note: '새벽 낚시 나갔다 · 낮에 돌아온다',
      likes: ['mandarin', 'lenok', 'trout', 'sweetfish', 'eel', 'maeuntang'], dislikes: ['jam', 'hwachae'],
      errands: ['crucian', 'minnow', 'catfish', 'dace', 'loach'],
      sayLike: '…! 이런 놈을 어디서. 자네, 보는 눈이 있군.', sayOk: '…고맙네.', sayNo: '단 건 질색이야. …그래도 받아 두지.',
      hint: '…젊었을 적 들은 얘긴데, ',
      talk: [['…낚시꾼인가? 손을 보면 알지.', '…용건 없으면 가 보게.'],
        ['찌는 눈이 아니라 마음으로 보는 거야.', '비 오는 날엔 강이 좋아.'],
        ['저 어탁? 내 평생 제일 큰 잉어였지.', '민지네 매운탕은… 뭐, 먹을 만하지.'],
        ['도윤이 녀석, 낚싯대 쥐는 폼이 제법이야.', '할머니한테 신세를 많이 졌어.'],
        ['자네랑 같이 낚시 가는 날이 기다려지는군.', '이 오두막 열쇠, 자네는 언제든 들어와도 돼.']] },
    chef: { home: '국밥집', away: ['night'], note: '새벽 장 보러 갔어요 · 아침에 돌아와요',
      likes: ['pepper', 'cabbage', 'shiitake', 'songi', 'egg', 'mackerel'], dislikes: ['bluegill', 'pebble'],
      errands: ['pepper', 'radish', 'egg', 'tomato', 'corn'],
      sayLike: '와! 이걸로 오늘 특선 메뉴 만들어야겠다!', sayOk: '고마워요! 잘 쓸게요!', sayNo: '음… 이건 국에 넣기 좀 그렇네요. 그래도 고마워요!',
      hint: '손님들이 하는 얘기 들었는데요, ',
      talk: [['어서 오세요! 국밥 한 그릇 하실래요?', '바빠 바빠! 아, 손님이구나!'],
        ['국물은 새벽에 우려야 깊어요.', '배추가 좋아야 김치가 맛있죠.'],
        ['우리 가게 단골은 다 이 마을 사람이에요.', '박 영감님, 매운탕은 꼭 덜 맵게 달래요.'],
        ['언젠가 큰 식당 내는 게 꿈이에요. 아직은 여기가 좋지만!', '하늘 선생님 급식 메뉴 짜는 거 도와드려요.'],
        ['사장님 재료면 뭘 만들어도 맛있어요!', '우리 가게 비밀 레시피, 사장님한테만 알려 줄게요.']] },
    kid: { home: '파란 지붕 집', away: ['day'], note: '분교 수업 중 · 저녁에 집에 와요',
      likes: ['berry', 'melon', 'jam', 'goguma', 'cicadashell', 'killifish', 'hwachae'], dislikes: ['pepper', 'ssuk'],
      errands: ['berry', 'minnow', 'corn', 'tomato', 'melon'],
      sayLike: '우와아!! 진짜 나 주는 거예요?! 최고!', sayOk: '고마워요! 히히.', sayNo: '으… 이거 써요. 그래도 고마워요.',
      hint: '비밀인데요, ',
      talk: [['누구세요? 혹시 새로 온 농부 아저씨?', '나 피라미 잡을 줄 안다요!'],
        ['학교 끝나면 연못에 가요. 오리 가족 보러!', '선생님이 숙제 내 줬어요. 으으.'],
        ['할머니가 목도리 떠 주신대요.', '오 화백님이 내 그림 칭찬해 줬어요!'],
        ['나도 크면 박 영감님처럼 큰 물고기 잡을 거예요.', '민지 누나네 국밥은 세상에서 제일 맛있어요.'],
        ['우리 이제 진짜 친구예요! 비밀 기지 알려 줄게요.', '나중에 같이 바다 낚시 가요!']] },
    teacher: { home: '분교 관사', away: ['day'], note: '분교에서 수업 중이에요 · 저녁에 돌아와요',
      likes: ['cucumber', 'tomato', 'naengguk', 'aster', 'azalea', 'omija', 'corn'], dislikes: ['eel', 'catfish'],
      errands: ['cucumber', 'tomato', 'potato', 'corn', 'radish'],
      sayLike: '어머, 제가 이걸 좋아하는 걸 어떻게 아셨어요?', sayOk: '감사해요. 잘 쓸게요.', sayNo: '미끈한 건 조금 무서워서요… 마음만 받을게요.',
      hint: '아이들이 그러던데요, ',
      talk: [['안녕하세요. 분교 선생님이에요.', '책 좋아하세요? 빌려드릴 수 있어요.'],
        ['아이들이 농장 이야기를 자주 해요.', '저녁엔 조용히 책 읽는 게 좋아요.'],
        ['도윤이는 장난꾸러기지만 마음이 고와요.', '순자 할머니께 뜨개를 배우고 있어요.'],
        ['언젠가 아이들이랑 농장 견학 가도 될까요?', '오 화백님 그림을 교실에 걸었어요.'],
        ['당신 같은 이웃이 있어서 이 마을이 좋아요.', '제 책장에서 좋아하는 책 아무거나 가져가세요.']] },
    painter: { home: '화실', away: ['day'], odd: true, note: '스케치하러 나갔소 · 저녁에 돌아오오',
      likes: ['koi', 'carp', 'amberstone', 'camellia', 'mapleleaf', 'goldbing', 'moonfish'], dislikes: ['radish', 'minnow'],
      errands: ['carp', 'koi', 'mapleleaf', 'melon', 'pumpkin'],
      sayLike: '오오! 이 빛깔! 당장 그려야겠소!', sayOk: '음, 고맙소.', sayNo: '평범하오… 허나 평범함에도 아름다움이 있지. 받겠소.',
      hint: '그림 그리다 들은 이야기인데, ',
      talk: [['…누구시오? 그림 구경 왔소?', '빛이 좋은 날이군.'],
        ['회색에도 백 가지 회색이 있소.', '바다를 그리러 떠돌다 여기 눌러앉았지.'],
        ['도윤이 녀석, 붓 쥐는 손이 남다르오.', '박 영감 오두막 어탁, 그건 예술이오.'],
        ['이 마을 사람들 얼굴을 다 그려 두고 싶소.', '민지네 국밥은 그릴 수가 없지. 먹어야 하니까.'],
        ['자네 농장을 그린 그림이 내 최고작이 될 거요.', '이 화실에 자네 자리 하나 비워 두겠소.']] }
  };
  var VIL_IDS = ['grandma', 'fisher', 'chef', 'kid', 'teacher', 'painter'];

  // 이어지는 심부름 이야기: one at a time; step k happens at steps[k].at (need = basket items it takes)
  var STORIES = [
    { id: 'scarf', name: '뜨개 목도리', req: {}, reward: { type: 'deco', id: 'jars' }, coins: 600,
      letter: '도윤이가 목도리를 하고 학교에 갔대요. 그림은 내 방에 걸었어. 자기 덕분이야. — 순자',
      steps: [
        { at: 'grandma', todo: '순자 할머니 댁에 들르기', say: '할머니: 도윤이 녀석 목이 맨날 휑해서 목도리를 떴지. 좀 전해 줄래요?' },
        { at: 'kid', todo: '꼬마 도윤에게 뜨개 목도리 전하기', say: '도윤: 우와, 할머니가요?! 고맙다고 그림 그렸어요. 근데 오 화백님한테 먼저 보여 주고 싶어요!' },
        { at: 'painter', todo: '오 화백에게 도윤의 그림 보여 주기', say: '오 화백: 허허, 선이 살아 있소. 액자에 넣어 두었으니 할머니께 갖다 드리시오.' },
        { at: 'grandma', todo: '순자 할머니께 액자에 든 그림 전하기', say: '할머니: 아이고, 우리 도윤이가… 이건 고맙다고 주는 거야. 장독 하나 가져가요.' }] },
    { id: 'stew', name: '국밥집 새 메뉴', req: { chef: 1 }, reward: { type: 'furn', id: 'table' }, coins: 800,
      letter: '매운탕이 첫날부터 다 팔렸어요! 박 영감님은 “덜 맵게”만 열 번 말했고요. 고마워요! — 민지',
      steps: [
        { at: 'chef', todo: '민지 사장 가게에 들르기', say: '민지: 매운탕을 새 메뉴로 하려는데 박 영감님 손맛이 필요해요. 쪽지 좀 전해 주세요!' },
        { at: 'fisher', todo: '박 영감에게 민지 사장의 쪽지 전하기', say: '박 영감: …매운탕은 붕어가 반이야. 싱싱한 붕어 두 마리 가져오게.' },
        { at: 'fisher', need: ['crucian', 2], todo: '박 영감에게 붕어 2마리 가져다주기', say: '박 영감: 됐네. 양념 비율은 적어 줄 테니, 할머니한테 고춧가루 좀 얻어 가.' },
        { at: 'grandma', need: ['pepper', 1], todo: '순자 할머니께 고추 1개 가져가기', say: '할머니: 영감님이 웬일이래? 고추 줘 봐요, 곱게 빻아 줄게.' },
        { at: 'chef', todo: '민지 사장에게 양념과 비율 쪽지 전하기', say: '민지: 와, 이 비율! 영감님 진짜 츤데레라니까. 첫 그릇은 사장님 거예요!' }] },
    { id: 'picnic', name: '분교 소풍', req: { teacher: 1 }, reward: { type: 'deco', id: 'bench' }, coins: 700,
      letter: '소풍날 아이들이 감자전을 하나도 안 남겼어요. 사진 속 맨 앞이 도윤이에요. — 하늘',
      steps: [
        { at: 'teacher', todo: '하늘 선생님 댁에 들르기', say: '선생님: 아이들이랑 소풍을 가요. 도윤이한테 안내문 좀 전해 주시겠어요?' },
        { at: 'kid', todo: '꼬마 도윤에게 소풍 안내문 전하기', say: '도윤: 소풍이다!! 근데 도시락이 없으면 소풍이 아니래요. 민지 누나한테 물어봐 주세요!' },
        { at: 'chef', need: ['potato', 3], todo: '민지 사장에게 감자 3개 가져다주기', say: '민지: 감자전 도시락이면 자신 있죠! 지글지글~ 완성! 선생님께 갖다드려요.' },
        { at: 'teacher', todo: '하늘 선생님께 도시락 전하기', say: '선생님: 아이들이 정말 좋아하겠어요. 벤치 하나 드릴게요, 소풍 기념으로요.' }] },
    { id: 'rod', name: '낡은 낚싯대', req: { fisher: 2 }, reward: { type: 'deco', id: 'tree' }, coins: 900,
      letter: '…도윤이 녀석이 어제 붕어를 잡았네. 자기 손으로. 나무 한 그루 보내니 잘 키우게. — 박',
      steps: [
        { at: 'fisher', todo: '박 영감 오두막에 들르기', say: '박 영감: 이 낚싯대, 내 첫 낚싯대지. 이제 손이 떨려서… 도윤이 녀석한테 주게.' },
        { at: 'kid', todo: '꼬마 도윤에게 낡은 낚싯대 전하기', say: '도윤: 진짜요?! 첫 물고기는 영감님께 보여 드려야지! …근데 아직 못 잡았어요. 피라미 한 마리만 줘요!' },
        { at: 'kid', need: ['minnow', 1], todo: '꼬마 도윤에게 피라미 1마리 주기', say: '도윤: 히히, 오 화백님이 이걸 그려 주신대요! 갖다주세요!' },
        { at: 'painter', todo: '오 화백에게 도윤의 피라미 전하기', say: '오 화백: 첫 물고기는 어탁으로 남겨야지. 찍어 두었소. 영감님께 갖다 드리오.' },
        { at: 'fisher', todo: '박 영감에게 피라미 어탁 전하기', say: '박 영감: …허, 녀석. (한참 웃는다) 자네도 고맙네.' }] },
    { id: 'mural', name: '마을 그림', req: { painter: 1, grandma: 2 }, reward: { type: 'deco', id: 'chime' }, coins: 1500,
      letter: '마을 그림을 분교 벽에 걸었소. 다들 자기 얼굴을 찾느라 한참이었지. 자네 얼굴은 한가운데요. — 오',
      steps: [
        { at: 'painter', todo: '오 화백 화실에 들르기', say: '오 화백: 이 마을을 한 장에 담고 싶소. 다들 한마디씩 적어 달라 해 주겠소?' },
        { at: 'teacher', todo: '하늘 선생님께 화백의 부탁 전하기', say: '선생님: 아이들 글씨로 한 줄씩 받아 둘게요. 할머니께도 꼭 받아 가세요.' },
        { at: 'grandma', todo: '순자 할머니께 한마디 받기', say: '할머니: 나야 “다들 밥 잘 먹어라” 지 뭐. 호호.' },
        { at: 'chef', todo: '민지 사장에게 한마디 받기', say: '민지: “배고프면 우리 가게로!” 크게 써 주세요!' },
        { at: 'painter', need: ['berry', 2], todo: '오 화백에게 딸기 2개 가져다주기 (물감용)', say: '오 화백: 딸기 물감으로 마지막 한 점… 다 모였군. 마을 모두의 그림이오.' }] }
  ];

  function vilOf(s) {
    if (!s.vil) s.vil = { day: -1, talk: {}, gift: {}, ed: {}, err: {}, st: { cur: null, k: 0, done: {} } };
    return s.vil;
  }
  function vilDay(v, now, tzMin) { var d = petDay(now, tzMin); if (v.day !== d) { v.day = d; v.talk = {}; v.gift = {}; } return d; }
  function villageOk(s) { return s.rep >= VILLAGE_REP || RESIDENTS.some(function (r) { return friendLevel(s, r.id) >= 1; }); }
  // null when home, otherwise the note shown on the door
  function residentAway(id, now, tzMin) {
    var d = VIL[id], c = gameClock(now, tzMin);
    if (d.away.indexOf(c.phase) < 0 || (d.odd && c.day % 2 === 0)) return null;
    return d.note;
  }
  function giftKind(id, item) { var d = VIL[id]; return d.likes.indexOf(item) >= 0 ? 'like' : d.dislikes.indexOf(item) >= 0 ? 'dislike' : 'ok'; }

  // ---------- 대화: once per real day, line by 친밀도 level; some days an easy hint for a secret not found yet ----------
  function talkLine(s, id, day) {
    var d = VIL[id], h = strHash(id + ':' + day), lines = d.talk[Math.min(4, friendLevel(s, id))];
    var open = EGGS.filter(function (e) { return !(s.yard && s.yard.eggs[e.id]); });
    if (open.length && h % 3 === 0) return { text: d.hint + open[(h >>> 4) % open.length].hint, hint: true };
    return { text: lines[(h >>> 2) % lines.length], hint: false };
  }
  function canTalk(s, id, now, tzMin) { var v = vilOf(s); vilDay(v, now, tzMin); return !v.talk[id] && !residentAway(id, now, tzMin); }
  function vilTalk(s, id, now, tzMin) {
    if (!VIL[id] || !resHere(s, id)) return { ok: false, why: 'who' };   // stage 10 ③: new residents once moved in
    if (residentAway(id, now, tzMin)) return { ok: false, why: 'away' };
    var v = vilOf(s), day = vilDay(v, now, tzMin);
    if (v.talk[id]) return { ok: false, why: 'talked' };
    v.talk[id] = true;
    var line = talkLine(s, id, day);
    return { ok: true, text: line.text, hint: line.hint, pts: VIL_TALK_PTS, ups: befriendPts(s, id, VIL_TALK_PTS) };
  }

  // ---------- 선물: one basket item per resident per real day ----------
  function canGift(s, id, now, tzMin) { var v = vilOf(s); vilDay(v, now, tzMin); return !v.gift[id] && !residentAway(id, now, tzMin); }
  function vilGift(s, id, item, now, tzMin) {
    if (!VIL[id] || !resHere(s, id)) return { ok: false, why: 'who' };   // stage 10 ③: new residents once moved in
    if (residentAway(id, now, tzMin)) return { ok: false, why: 'away' };
    var v = vilOf(s); vilDay(v, now, tzMin);
    if (v.gift[id]) return { ok: false, why: 'gifted' };
    if (!itemInfo(item) || !bagTake(s, item, 1)) return { ok: false, why: 'item' };
    v.gift[id] = true;
    var k = giftKind(id, item), pts = VIL_GIFT_PTS[k], d = VIL[id];
    return { ok: true, kind: k, pts: pts, text: k === 'like' ? d.sayLike : k === 'dislike' ? d.sayNo : d.sayOk, ups: pts ? befriendPts(s, id, pts) : [] };
  }

  // ---------- 심부름: some days (about 1 in 3) a resident asks for a few of something; no deadline, can decline ----------
  function errandFor(s, id, now, tzMin) {
    var v = vilOf(s), day = vilDay(v, now, tzMin);
    if (v.err[id]) return v.err[id];
    if (v.ed[id] === day || strHash('err:' + id + ':' + day) % 3 !== 0) return null;
    var pool = VIL[id].errands.filter(function (x) { return obtainable(s, x); });
    if (!pool.length) return null;
    var item = pool[strHash('pick:' + id + ':' + day) % pool.length], price = itemInfo(item).price;
    v.err[id] = { id: item, n: price < 100 ? 3 : price < 400 ? 2 : 1 };
    return v.err[id];
  }
  function errandReward(e) { return Math.round(itemInfo(e.id).price * e.n * 1.8) + 50; }
  function errandDone(s, id, now, tzMin) {
    var v = vilOf(s), e = v.err[id];
    if (!e) return { ok: false, why: 'none' };
    if (residentAway(id, now, tzMin)) return { ok: false, why: 'away' };
    if (!bagTake(s, e.id, e.n)) return { ok: false, why: 'item' };
    var coins = errandReward(e);
    delete v.err[id]; v.ed[id] = vilDay(v, now, tzMin);
    s.coins += coins;
    return { ok: true, coins: coins, pts: VIL_ERRAND_PTS, ups: befriendPts(s, id, VIL_ERRAND_PTS) };
  }
  function errandDecline(s, id, now, tzMin) {
    var v = vilOf(s);
    if (!v.err[id]) return false;
    delete v.err[id]; v.ed[id] = vilDay(v, now, tzMin);
    return true;
  }

  // ---------- 이어지는 심부름 이야기 ----------
  function storyById(id) { for (var k = 0; k < STORIES.length; k++) if (STORIES[k].id === id) return STORIES[k]; return null; }
  function storyOpen(s, st) { return Object.keys(st.req).every(function (r) { return friendLevel(s, r) >= st.req[r]; }); }
  function storyDone(s, id) { return !!(s.vil && s.vil.st.done[id]); }
  // the story in progress (or the next one that is open) → { story, k, step } | null
  function storyNow(s) {
    if (!villageOk(s)) return null;
    var st = s.vil && s.vil.st;
    if (st && st.cur) { var c = storyById(st.cur); return { story: c, k: st.k, step: c.steps[st.k] }; }
    for (var k = 0; k < STORIES.length; k++) {
      var x = STORIES[k];
      if (!storyDone(s, x.id) && storyOpen(s, x)) return { story: x, k: 0, step: x.steps[0] };
    }
    return null;
  }
  // the next story still waiting on 친밀도 (for the "다음 이야기" hint)
  function storyLocked(s) {
    for (var k = 0; k < STORIES.length; k++) if (!storyDone(s, STORIES[k].id) && !storyOpen(s, STORIES[k])) return STORIES[k];
    return null;
  }
  function storyStep(s, id, now, tzMin) {
    var cur = storyNow(s);
    if (!cur || cur.step.at !== id) return { ok: false, why: 'here' };
    if (residentAway(id, now, tzMin)) return { ok: false, why: 'away' };
    var need = cur.step.need;
    if (need && !bagTake(s, need[0], need[1])) return { ok: false, why: 'item' };
    var st = vilOf(s).st, out = { ok: true, say: cur.step.say, story: cur.story.id, done: false, gift: null, coins: 0, ups: befriendPts(s, id, VIL_STEP_PTS) };
    st.cur = cur.story.id; st.k = cur.k + 1;
    if (st.k >= cur.story.steps.length) {
      st.done[cur.story.id] = true; st.cur = null; st.k = 0;
      out.done = true; out.gift = giveGift(s, cur.story.reward); out.coins = cur.story.coins;
      s.coins += cur.story.coins;
    }
    return out;
  }
  // is there anything to do at this resident's house right now? (marks on the 마을 map)
  function vilAttention(s, id, now, tzMin) {
    if (residentAway(id, now, tzMin)) return false;
    var cur = storyNow(s);
    return (cur && cur.step.at === id) || canTalk(s, id, now, tzMin) || !!errandFor(s, id, now, tzMin);
  }

  // ---------- save: called by decode() at the end ----------
  function decodeVillage(o, s) {
    var q = o.vil;
    if (!q || typeof q !== 'object') return;
    var num = function (x) { return typeof x === 'number' && isFinite(x); }, obj = function (x) { return x && typeof x === 'object'; };
    var v = { day: num(q.day) ? Math.floor(q.day) : -1, talk: {}, gift: {}, ed: {}, err: {}, st: { cur: null, k: 0, done: {} } };
    Object.keys(VIL).forEach(function (id) {   // stage 10 ③: VIL also holds the residents who moved in later
      if (obj(q.talk) && q.talk[id] === true) v.talk[id] = true;
      if (obj(q.gift) && q.gift[id] === true) v.gift[id] = true;
      if (obj(q.ed) && num(q.ed[id])) v.ed[id] = Math.floor(q.ed[id]);
      var e = obj(q.err) && q.err[id];
      if (obj(e) && itemInfo(e.id) && num(e.n) && e.n >= 1) v.err[id] = { id: e.id, n: Math.min(9, Math.floor(e.n)) };
    });
    if (obj(q.st)) {
      if (obj(q.st.done)) STORIES.forEach(function (x) { if (q.st.done[x.id] === true) v.st.done[x.id] = true; });
      var c = typeof q.st.cur === 'string' && storyById(q.st.cur);
      if (c && !v.st.done[c.id] && num(q.st.k) && q.st.k >= 0 && q.st.k < c.steps.length) { v.st.cur = c.id; v.st.k = Math.floor(q.st.k); }
    }
    s.vil = v;
  }

  expose({
    VILLAGE_REP: VILLAGE_REP, VIL: VIL, VIL_IDS: VIL_IDS, STORIES: STORIES, VIL_GIFT_PTS: VIL_GIFT_PTS, VIL_TALK_PTS: VIL_TALK_PTS, VIL_ERRAND_PTS: VIL_ERRAND_PTS,
    villageOk: villageOk, residentAway: residentAway, giftKind: giftKind, talkLine: talkLine, canTalk: canTalk, vilTalk: vilTalk,
    canGift: canGift, vilGift: vilGift, errandFor: errandFor, errandReward: errandReward, errandDone: errandDone, errandDecline: errandDecline,
    storyById: storyById, storyDone: storyDone, storyNow: storyNow, storyLocked: storyLocked, storyStep: storyStep,
    vilAttention: vilAttention, decodeVillage: decodeVillage
  });
