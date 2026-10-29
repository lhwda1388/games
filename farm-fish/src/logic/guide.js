  // ---------- 놀거리 수첩: one line per place/activity, open or locked from the real state (s.guide, optional) ----------
  // s.guide = { seen: { id: true }, tip: { scene: true } } is made on first use; older saves simply have none.
  // Lock hints are built from the same constants the game checks, so they never drift from the real numbers.
  function won(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '코인'; }
  var GUIDE = [
    { id: 'farm', name: '밭', how: '아래 씨앗을 고르고 빈 밭을 누르면 심기 · 다 자라면 눌러 수확 · 까마귀·잡초도 눌러 해결', lock: '' },
    { id: 'pond', name: '연못 낚시', how: '물을 누르면 던지기 · 찌가 쑥 잠기면 눌러 챔질 · 누르고 있으면 감기, 장력이 높으면 떼기', lock: '' },
    { id: 'bag', name: '바구니·주문', how: '바구니 버튼 · 주문을 납품하면 코인과 신뢰도 ★ · 싫은 주문은 ×로 버리기', lock: '' },
    { id: 'cook', name: '요리', how: '바구니의 냄비 탭에서 재료로 요리 · 다 되면 냄비를 눌러 꺼내기', lock: '' },
    { id: 'shop', name: '상점', how: '낚싯대·미끼·밭 확장·허수아비·바구니 · 동물·장식·도구도 여기서', lock: '' },
    { id: 'seasons', name: '계절·날씨·달력', how: '시계 버튼을 누르면 달력 · 현실 1시간이 게임 하루, 1주가 한 계절 · 비가 오면 작물이 빨리 자란다', lock: '' },
    { id: 'daily', name: '오늘의 할 일', how: '달력에 매일 할 일 세 개 · 다 하면 보상 · 못 해도 손해 없음', lock: '' },
    { id: 'river', name: '강 낚시', how: '밭 옆 표지판에서 낚시터 바꾸기 · 강에만 사는 물고기', lock: '★' + SPOTS.river.rep + ' · 표지판에서 ' + won(SPOTS.river.cost) },
    { id: 'sea', name: '바다 낚시', how: '표지판에서 바다로 · 큰 물고기가 많다 · 시간·날씨 따라 다른 물고기', lock: '★' + SPOTS.sea.rep + ' · 표지판에서 ' + won(SPOTS.sea.cost) },
    { id: 'yard', name: '마당 꾸미기', how: '이동 메뉴로 가는 곳 · 빈 자리(+)를 누르면 꾸미기 · 장식을 누르면 옮기기', lock: '' },
    { id: 'animals', name: '동물', how: '상점 마당 칸에서 닭·오리·젖소 · 마당에 쌓인 알·우유를 눌러 줍기', lock: '' },
    { id: 'house', name: '집 안', how: '마당에서 집을 누르면 안으로 · 가구 놓기 · 상점에서 집을 키우면 바구니·냄비가 늘어난다', lock: '' },
    { id: 'aquarium', name: '수족관', how: '집 안 수조를 누르고 바구니 물고기를 넣기 · 수조 물고기는 팔리지 않는다', lock: '' },
    { id: 'visitors', name: '손님·편지', how: '장식을 놓으면 손님이 찾아온다 · 눌러 보면 선물 · 우체통을 놓으면 편지', lock: '' },
    { id: 'residents', name: '단골 주민', how: '주문을 납품하면 그 주민과 친밀도 · 단계마다 편지와 선물 · 바구니의 주민 탭', lock: '' },
    { id: 'junk', name: '잡동사니·병 편지', how: '낚시하다 가끔 고물·병 편지·보물 상자 · 고물로 장식 만들기 · 상자는 자물쇠 도전', lock: '' },
    { id: 'festival', name: '계절 축제', how: '계절마다 수요일 ' + FEST_FROM + '~' + FEST_TO + '시 · 축제 표시를 누르면 선물·축제 물고기', lock: '' },
    { id: 'challenge', name: '도전 (꾹 누르기)', how: '수확·채집·갯벌·동굴에서 꾹 누르면 게이지 · 표시 칸에서 떼면 덤 · 놓쳐도 그대로', lock: '' },
    { id: 'secrets', name: '비밀', how: '숨은 비밀이 있다 · 도감 기록 탭의 힌트를 따라가 보기', lock: '' },
    { id: 'friend', name: '친구 기록', how: '도감 친구 탭 · 내 기록 코드를 복사해 친구 기록과 나란히', lock: '' },
    { id: 'pip', name: '작게 띄우기·숨기기', how: '작게 버튼이나 P 키로 작은 창 · Esc는 업무 화면으로 숨기', lock: '' },
    { id: 'forest', name: '숲', how: '돋아난 것을 눌러 채집 · 꾹 누르면 도전 · 철마다 다른 것이 돋는다', lock: '★' + FOREST_REP + ' · 숲 표지판에서 ' + won(FOREST_COST) },
    { id: 'pet', name: '반려동물', how: '쓰다듬으면 친밀도 · 하루 몇 번 선물 · 숲에서 킁킁 찾아 준다', lock: '상점 입양 · 강아지 ' + won(PET_KINDS.dog.cost) + ' · 고양이는 ' + PET_CAT_VISITS + '번 놀러 오면' },
    { id: 'orchard', name: '과수원', how: '빈 자리를 눌러 묘목 심기 · 다 자란 나무는 제철마다 열매', lock: '★' + ORCHARD_REP + ' · 과수원 팻말에서 ' + won(ORCHARD_COST) },
    { id: 'bees', name: '양봉', how: '벌통에 꿀이 차면 눌러 거두기 · 주변 꽃에 따라 꿀이 달라진다', lock: '과수원에 벌통 · ' + won(HIVE_COSTS[0]) },
    { id: 'bugs', name: '곤충 채집', how: '밭·마당·숲에 날아온 곤충이 앉아 날개를 접었을 때 눌러 잡기', lock: '상점 잠자리채 · ' + won(NET_COST) },
    { id: 'village', name: '마을', how: '집을 누르면 들어가기 · 하루 한 번 대화와 선물 · 가끔 심부름', lock: '★' + VILLAGE_REP + ' · 또는 주민 한 명과 친밀도 1' },
    { id: 'story', name: '심부름 이야기', how: '마을의 「지금 할 일」을 따라 주민 사이 물건 전하기 · 끝나면 보상', lock: '마을이 열리면' },
    { id: 'camera', name: '사진기', how: '사진기 버튼이 반짝이면 눌러 찰칵 · 도감 앨범에 모으기', lock: '상점 · ' + won(CAMERA_COST) },
    { id: 'flat', name: '갯벌', how: '썰물 때 구멍을 눌러 캐기 · 꾹 누르면 호미 도전', lock: '바다 낚시터를 열면' },
    { id: 'trap', name: '통발', how: '밀물 때 갯벌 모래 가 표시에 통발 놓기 · 다음 썰물에 걷기', lock: '바다 낚시터를 열면' },
    { id: 'cave', name: '동굴', how: '바위를 눌러 깨기 (기력 하나) · 꾹 눌러 금 간 데서 떼면 한 칸 더 · 화석 조각 모으기', lock: '★' + CAVE_REP + ' · 상점 곡괭이 ' + won(PICK_COST) },
    { id: 'stars', name: '별 관측', how: '밤에 마당 망원경을 누르고 별을 순서대로 이어 별자리', lock: '상점 망원경 · ' + won(SCOPE_COST) },
    { id: 'meteor', name: '유성우', how: '달력의 유성우 밤에 떨어지는 유성을 눌러 소원', lock: '망원경이 있으면' },
    { id: 'island', name: '섬', how: '바닷가를 눌러 표류물 줍기 · 야자 열매 · 섬 부두에서 낚시', lock: '바다 선착장 낡은 배 수리 · ' + won(BOAT_FIX.coins) + ' + 고물 ' + BOAT_FIX.junk + '개' },
    { id: 'lighthouse', name: '등대', how: '등대지기에게 재료를 모아 가져가 꺼진 등대 고치기', lock: '섬에 가면' },
    { id: 'temper', name: '물고기 성격', how: '물고기마다 싸우는 법이 다르다 · 점프형은 튀기 직전 떼기 · 버팀형은 짧게 끊어 당기기 · 질주형은 방향 바꿀 때 감기 · 한 번 낚으면 도감에 성격', lock: '' },
    { id: 'boss', name: '전설 보스전', how: '전설 물고기는 2~3단계로 싸운다 · 화면 테두리가 번쩍이고 「N단계!」가 뜨면 싸우는 법이 바뀐다 · 놓쳐도 잃는 건 그 한 마리', lock: '' },
    { id: 'records', name: '월척 기록·어탁', how: '같은 물고기를 더 크게 낚으면 신기록! · 큰 기록 넷은 집 안 벽 어탁에 걸린다 · 친구 기록 코드에도 들어간다', lock: '' },
    { id: 'museum', name: '박물관', how: '마을 박물관에서 물고기·곤충·화석·광물·별자리·바다 것을 하나씩 기증해 전시실 채우기', lock: '곡괭이·망원경·섬 배 중 하나 + 마을이 열리면' },
    // stage 8 ①
    { id: 'boom', name: '입질 폭풍·대풍년', how: '현실 하루 몇 번, ' + (BOOM_MIN / 60e3) + '~' + ((BOOM_MIN + BOOM_SPAN) / 60e3) + '분 · 폭풍은 그 낚시터 귀한 물고기 ×' + BOOM_RARE_MUL + '·입질 빨리, 대풍년은 밭·과수원·숲 수확 덤 · 위 표시와 이동 메뉴 점 · 놓쳐도 손해 없음', lock: '' },
    { id: 'today', name: '오늘의 날', how: '현실 하루마다 ' + DAYS.length + '가지 중 하나 (큰 물고기·장날·고양이 잔치…) · 그날 첫 접속에 카드 · 달력 맨 위에서 다시 보기', lock: '' },
    { id: 'diary', name: '자리 비운 사이 일기', how: (DIARY_AWAY / 60e3) + '분 넘게 비웠다 오면 그동안 생긴 일 카드 · 눌러 닫기 · 도감 기록 탭에 최근 ' + DIARY_KEEP + '개', lock: '' },
    // stage 8 ③
    { id: 'rumor', name: '소문 수첩', how: '마을 주민 대화·병 편지·손님에게서 가끔 소문 · 들은 소문은 도감 기록 탭에 모인다', lock: '' },
    // stage 9 ②
    { id: 'donkey', name: '당나귀', how: '마당 우리의 당나귀를 눌러 쓰다듬기 (하루 ' + DONKEY_PETS_DAY + '번) · 「먹이」로 바구니의 무·감자·사과 주기 (하루 ' + DONKEY_FEEDS_DAY + '번) · 친밀도 ' + DEEP_LV + ' 깊은 숲, ' + LOAD_LV + ' 짐 싣기 바구니 +' + DONKEY_BAG + '칸, ' + PEAK_LV + ' 산꼭대기', lock: '★' + DONKEY_REP + ' · 상점 ' + won(DONKEY_COST) },
    { id: 'deep', name: '깊은 숲', how: '이동 메뉴에서 당나귀 타고 · 돋아난 것을 눌러 채집, 꾹 누르면 도전 · 여기서만 나는 채집물·곤충', lock: '당나귀 친밀도 ' + DEEP_LV + ' · 숲이 열려 있으면' },
    { id: 'peak', name: '산꼭대기', how: '바위 틈 채집 · 밤에 망원경 바위를 누르면 여기서만 보이는 별자리 ' + STARS.filter(function (c) { return c.peak; }).length + '개 · 산 곤충', lock: '당나귀 친밀도 ' + PEAK_LV + ' · 숲이 열려 있으면' },
    { id: 'tmap', name: '보물 지도', how: '낚시 고물·동굴 바위·섬 표류물에서 가끔 지도 조각 · 다 모으면 그려진 곳을 꾹 눌러 파기 · 달·해·비가 그려져 있으면 그때만', lock: '' },
    // stage 9 ①
    { id: 'ship', name: '배 업그레이드', how: '섬에 묶인 배를 누르면 배 창 (돛배부터는 바다·먼바다의 배도) · 코인과 동굴 광석·섬 표류물로 ' + SHIP_TIERS.map(function (t) { return t.name; }).join(' → ') + ' · 배 창에서 갈 곳 고르기', lock: '섬 배를 고치면' },
    { id: 'offshore', name: '먼바다 끌낚시', how: '배가 달리며 끄는 낚시 · 큰 물고기만 ' + OFFSHORE_FISH.length + '종 · 전설 청새치는 3단계 보스전 · 배를 누르면 돌아가기', lock: SHIP_TIERS[1].name + ' · ' + won(SHIP_TIERS[1].coins) + ' + ' + shipNeedText(SHIP_TIERS[1]) },
    { id: 'ocean', name: '난바다 끌낚시', how: '먼바다보다 더 멀리 · 큰 물고기 ' + OCEAN_FISH.length + '종 · 전설 산갈치는 깊은 밤에', lock: SHIP_TIERS[2].name + ' · ' + won(SHIP_TIERS[2].coins) + ' + ' + shipNeedText(SHIP_TIERS[2]) },
    { id: 'farisle', name: '먼 섬', how: '모래톱을 눌러 표류물 줍기 (' + FAR_N + '자리) · 섬에 없는 것 ' + FAR_DRIFT.length + '종 · 배를 누르면 배 창', lock: SHIP_TIERS[2].name + '가 있으면' },
    // stage 9 ③
    { id: 'bike', name: '자전거 배달', how: '주문 납품 옆 「자전거로」 · ' + BIKE_TIME + '초 길을 탭 한 번으로 웅덩이·고양이 넘고 꽃 줍기 · 무사히 가면 팁 +' + Math.round(BIKE_TIP * 100) + '~' + Math.round(BIKE_TIP_MAX * 100) + '% · 넘어져도 납품은 그대로', lock: '상점 자전거 · ' + won(BIKE_COST) },
    { id: 'balloon', name: '열기구', how: '현실 하루 몇 번 ' + (BALLOON_LEN / 60e3) + '분씩 마을 언덕에 열기구 (놓치면 하나는 언덕에서 기다림) · 새·구름이 가운데 틀에 오면 탭해 하늘 도감에 · 처음 본 것마다 ' + won(SIGHT_COINS), lock: '★' + VILLAGE_REP + ' 마을 언덕 · 한 번 ' + won(BALLOON_FARE) },
    { id: 'sled', name: '겨울 썰매', how: '게임 겨울에 마을 언덕 · 탭하면 옆 줄로 · 바위·나무 피하고 눈꽃 줍기 · 기록 갱신 ' + won(SLED_RECORD_COINS) + ' · 눈사람 축제 날은 ×' + SLED_FEST_MUL + ' + 축제 선물', lock: '★' + VILLAGE_REP + ' 마을 언덕 · 게임 겨울에만' },
    // stage 10 ④
    { id: 'wxtoy', name: '날씨 장난감', how: '밭·마당·숲의 빈 땅에서 · 비 오면 웅덩이를 눌러 첨벙 · 눈 오면 누른 자리에 발자국 · 가을엔 낙엽 더미를 눌러 흩뜨리기 (' + Math.round(TOY_PILE_REGROW / 60e3 * 10) / 10 + '분 뒤 다시 쌓임) · 가끔 도토리·동전, 하루 ' + TOY_DAY_CAP + '번까지', lock: '' },
    { id: 'quest', name: '계절 챌린지', how: '계절마다 「이번 계절에 꼭 볼 것 ' + QUEST_N + '개」 카드 · 달력에서 진행 확인 · 다 채우면 그 계절 장식 하나 (이미 있으면 ' + won(QUEST_COINS) + ') · 놓친 계절은 다음 해에 다시', lock: '' },
    // stage 10 ②
    { id: 'garden', name: '꽃 교배', how: '마당 꽃밭을 누르고 「꽃밭」 · 빈 자리에 꽃씨 심기 (' + won(FLOWER_SEED_COST) + ') · ' + (FLOWER_GROW / 3600e3) + '시간이면 핀다 · 이웃한 꽃끼리 가끔 섞여 줄무늬·점박이·겹꽃·테두리… 모두 ' + FLOWERS.length + '종 · 무늬 꽃이 피면 무늬꽃꿀', lock: '마당 꽃밭 장식 · ' + won(byId(DECOS, 'flowers').cost) },
    { id: 'brood', name: '동물 새끼', how: '알·우유를 거둘수록 친밀도 · ' + BABY_CARE + '이 차면 가끔 병아리·새끼오리·송아지 (한 마리당 ' + BABY_PER_HEAD + ') · 새끼를 눌러 이름 짓기 · ' + (BABY_GROW / 86400e3) + '일이면 자라 산물을 낸다', lock: '상점 마당 칸에서 닭·오리·젖소' },
    { id: 'scaredress', name: '허수아비 꾸미기', how: '상점 「허수아비 꾸미기」에서 모자·옷·소품 ' + SCARE_ITEMS.length + '가지 · ' + SCARE_ITEMS.filter(function (x) { return x.fest; }).length + '가지는 축제 날에만 받는다 · 쫓는 힘은 그대로', lock: '상점 허수아비 · ' + won(UPG.scare.costs[0]) },
    // stage 10 ①
    { id: 'contest', name: '박 영감 낚시 대회', how: '현실 일주일마다 · 그 주에 낚은 가장 큰 물고기(종마다 크기 %)로 박 영감 기록과 겨루기 · 이기면 트로피 장식(금·은·동, 주마다 모양이 다름) + 최대 ' + won(CONTEST_COINS.gold) + ', 지면 박 영감 편지 + ' + won(CONTEST_TRY_COINS) + ' · 달력·박 영감 대화에서 진행 확인', lock: '박 영감 친밀도 ' + CONTEST_FRIEND },
    { id: 'yearcard', name: '한 해 결산 카드', how: '게임 1년(4계절 = 현실 4주)이 끝나면 그해 카드: 낚은 수·제일 큰 물고기·많이 만든 요리·새로 연 곳·박물관 · 도감 기록 탭에서 지난 카드 ' + YEAR_KEEP + '장과 「지금까지」 · PNG 저장', lock: '' },
    { id: 'farmsign', name: '농장 간판', how: '밭 아래 울타리의 간판을 누르면 농장 이름(' + FARM_NAME_MAX + '자)과 간판 모양 ' + SIGNS.length + '가지 · 결산 카드·친구 기록 코드에 나온다', lock: '' },
    // stage 10 ③
    { id: 'townday', name: '주민들의 하루', how: '주민은 시간대마다 마을 길(' + ['pavilion', 'garden', 'school', 'dock', 'hill'].map(function (k) { return TOWN_PLACES[k].name; }).join('·') + '…)에 나와 있다 · 길에서 누르면 그 자리 이야기, 하루 한 번 친밀도 +' + TOWN_MEET_PTS + ' · 창이 밝으면 집에 있다', lock: '★' + VILLAGE_REP + ' 마을이 열리면' },
    { id: 'newres', name: '새 주민', how: '큰 목표를 이루면 마을에 새 주민 ' + RES_EXTRA.length + '명이 이사 온다 · 이사 편지는 바구니 › 주민 · 새 집을 눌러 방문, 주문·편지·선물도 똑같이', lock: '화석 ' + FOSSILS.length + '종 완성 · 섬 등대 점등 · 박물관 ' + Math.round(TOWN_MUSEUM_PART * 100) + '% 채우기' }
  ];
  // '유목 4 · 낡은 밧줄 3 · 철광석 3'
  function shipNeedText(t) { return t.need.map(function (q) { return itemInfo(q[0]).name + ' ' + q[1]; }).join(' · '); }
  // id → is it usable now (the same checks the scenes and the 이동 menu use)
  var GUIDE_OPEN = {
    river: function (s) { return spotUnlocked(s, 'river'); },
    sea: function (s) { return spotUnlocked(s, 'sea'); },
    forest: forestOk, pet: function (s) { return !!s.pet; }, orchard: orchardOk,
    bees: function (s) { return hiveCount(s) > 0; }, bugs: netOk, village: villageOk, story: villageOk,
    camera: camOk, flat: flatOk, trap: flatOk, cave: caveOk, stars: skyOk, meteor: skyOk,
    island: isleOk, lighthouse: isleOk, museum: function (s) { return museumOk(s) && villageOk(s); },
    donkey: function (s) { return !!s.donkey; }, deep: function (s) { return rideOk(s, 'deep'); }, peak: function (s) { return rideOk(s, 'peak'); },   // stage 9 ②
    ship: isleOk, offshore: function (s) { return spotUnlocked(s, 'offshore'); }, ocean: function (s) { return spotUnlocked(s, 'ocean'); }, farisle: farOk,   // stage 9 ①
    bike: bikeOk, balloon: villageOk, sled: villageOk,   // stage 9 ③
    garden: gardenOk, brood: function (s) { return !!s.animals && ANIMAL_IDS.some(function (id) { return s.animals[id] > 0; }); }, scaredress: function (s) { return tier(s, 'scare') > 0; },   // stage 10 ②
    contest: contestOk,   // stage 10 ①
    townday: villageOk, newres: function (s) { return RES_EXTRA.some(function (r) { return resMoved(s, r.id); }); }   // stage 10 ③
  };
  // first visit to a scene → the entry whose how-line is shown once ('farm' is where the game starts: no tip)
  var GUIDE_SCENE = { yard: 'yard', house: 'house', forest: 'forest', orchard: 'orchard', village: 'village',
    flat: 'flat', cave: 'cave', stars: 'stars', island: 'island', deep: 'deep', peak: 'peak' };
  GUIDE_SCENE.farisle = 'farisle';   // stage 9 ①

  function guideById(id) { for (var k = 0; k < GUIDE.length; k++) if (GUIDE[k].id === id) return GUIDE[k]; return null; }
  function guideOpen(s, id) {
    if (!guideById(id)) return false;
    var f = GUIDE_OPEN[id];
    return f ? !!f(s) : true;
  }
  function guideOf(s) { if (!s.guide) s.guide = { seen: {}, tip: {} }; return s.guide; }
  function guideNew(s) {
    var seen = (s.guide && s.guide.seen) || {};
    return GUIDE.filter(function (g) { return !seen[g.id] && guideOpen(s, g.id); }).map(function (g) { return g.id; });
  }
  function guideSee(s, ids) {
    var ok = (ids || []).filter(function (id) { return !!guideById(id); });
    if (!ok.length) return;
    var g = guideOf(s);
    ok.forEach(function (id) { g.seen[id] = true; });
  }
  // → the entry to toast on the first visit to `scene`, else null (marks it shown)
  function guideTip(s, scene) {
    var id = GUIDE_SCENE.hasOwnProperty(scene) ? GUIDE_SCENE[scene] : null;
    if (!id || (s.guide && s.guide.tip[scene])) return null;
    guideOf(s).tip[scene] = true;
    return guideById(id);
  }
  function decodeGuide(o, s) {
    var q = o.guide;
    if (!q || typeof q !== 'object') return;
    var g = { seen: {}, tip: {} };
    if (q.seen && typeof q.seen === 'object') GUIDE.forEach(function (e) { if (q.seen[e.id] === true) g.seen[e.id] = true; });
    if (q.tip && typeof q.tip === 'object') Object.keys(GUIDE_SCENE).forEach(function (sc) { if (q.tip[sc] === true) g.tip[sc] = true; });
    s.guide = g;
  }

  expose({
    GUIDE: GUIDE, GUIDE_SCENE: GUIDE_SCENE, guideById: guideById, guideOpen: guideOpen, guideNew: guideNew,
    guideSee: guideSee, guideTip: guideTip, decodeGuide: decodeGuide
  });
