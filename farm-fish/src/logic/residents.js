  // ---------- 단골 주민: who posts each order, 친밀도, letters and gifts ----------
  // The resident of an order is worked out from the order itself (no rng, nothing extra saved), so old
  // saves' orders get a resident too. Friendship lives in s.res = { f, lv, rec, unread } (created lazily).
  var RESIDENTS = [
    { id: 'grandma', name: '순자 할머니', who: '옆집 할머니 · 다정하고 텃밭 채소를 좋아한다', kinds: ['crop', 'product'] },
    { id: 'fisher',  name: '박 영감',     who: '무뚝뚝한 낚시꾼 · 물고기라면 다 좋다', kinds: ['fish'] },
    { id: 'chef',    name: '민지 사장',   who: '국밥집 주인 · 늘 바쁘고 씩씩하다', kinds: ['dish', 'product'] },
    { id: 'kid',     name: '꼬마 도윤',   who: '장난꾸러기 · 작은 물고기와 과일을 모은다', kinds: ['fish', 'crop'] },
    { id: 'teacher', name: '하늘 선생님', who: '분교 선생님 · 차분하고 꼼꼼하다', kinds: ['crop', 'dish'] },
    { id: 'painter', name: '오 화백',     who: '떠돌이 화가 · 귀한 것만 보면 눈이 반짝', kinds: ['dish'], special: true }
  ];
  // points needed for 친밀도 levels 1..4; a delivery gives 1 (특별 주문 3)
  var FRIEND_LV = [3, 7, 12, 20];
  // gift recipes: cookable only once a resident has taught them
  var GIFT_RECIPES = [
    { id: 'ssukjeon', name: '쑥전',     need: ['ssuk', 'ssuk', 'potato'],          time: 300e3, sell: 420,  gift: 'grandma' },
    { id: 'kimchi',   name: '김치',     need: ['cabbage', 'pepper', 'radish'],     time: 900e3, sell: 1100, gift: 'chef' },
    { id: 'naengguk', name: '오이냉국', need: ['cucumber', 'cucumber', 'pepper'],  time: 240e3,  sell: 460,  gift: 'teacher' },
    { id: 'goguma',   name: '군고구마', need: ['sweetpotato', 'sweetpotato'],      time: 360e3, sell: 640,  gift: 'kid' }
  ];
  GIFT_RECIPES.forEach(function (r) { RECIPES.push(r); });
  // letters for levels 1..4; level 2 slips an easter-egg hint, levels 3 and 4 come with a gift
  var RES_STORY = {
    grandma: {
      letters: ['아이고, 무가 아주 실하네. 우리 영감 살아 있을 때도 이 밭에서 무를 키웠지. 자주 와 줘요.',
        '밭 허수아비 말이야, 우리 손주가 쉬지 않고 열 번 톡톡 두드렸더니 춤을 추더래. 한번 해 봐요.',
        '봄에 쑥이 나면 쑥전을 부쳐 먹어요. 쑥 두 줌에 감자 하나면 돼. 적어 뒀으니 꼭 해 먹어.',
        '이 화분은 우리 집 창가에 십 년 있던 거야. 이제 자기 집에서 더 잘 자랄 거야.'],
      gifts: [null, null, { type: 'recipe', id: 'ssukjeon' }, { type: 'furn', id: 'plant' }] },
    fisher: {
      letters: ['…고맙네. 물고기 다루는 손이 제법이야.',
        '젊었을 적엔 매시 정각, 00분에 찌를 봤지. 그때 무는 놈은 째깍 소리를 낸다네.',
        '이 라디오는 정각마다 시보를 울려. 낚시꾼한테는 그게 제일 좋은 시계지.',
        '돌을 하나씩 쌓으면서 큰 놈을 빌었지. 이제 자네 마당에서 빌어 주게.'],
      gifts: [null, null, { type: 'furn', id: 'radio' }, { type: 'deco', id: 'stones' }] },
    chef: {
      letters: ['사장님 덕에 오늘 국물 맛 끝내줬어요! 단골 해 주세요!',
        '무를 999개나 거둔 농부가 있었대요. 그 무가 인사를 했다나? 우리 가게 전설이에요.',
        '겨울 배추에 고추랑 무만 있으면 김치 담글 수 있어요. 비법 적어 드렸어요!',
        '가게에서 쓰던 난로예요. 새 걸로 바꿨거든요. 겨울에 따뜻하게 지내세요!'],
      gifts: [null, null, { type: 'recipe', id: 'kimchi' }, { type: 'furn', id: 'stove' }] },
    kid: {
      letters: ['우와 진짜 잡았어요?! 내 친구들한테 다 자랑할 거예요!',
        '비밀인데요, 오리 가족한테 세 번 인사하면 새끼들이 줄 맞춰 인사해요. 고양이는 다섯 번 쓰다듬어야 해요!',
        '아빠랑 새집 만들었어요! 마당에 달아 주세요. 참새가 올 거예요.',
        '고구마 두 개를 냄비에 넣으면 군고구마가 돼요. 엄마가 알려 줬어요. 같이 먹어요!'],
      gifts: [null, null, { type: 'deco', id: 'birdhouse' }, { type: 'recipe', id: 'goguma' }] },
    teacher: {
      letters: ['꼼꼼하게 챙겨 주셔서 고마워요. 아이들 급식이 한결 좋아졌어요.',
        '밤하늘에 별똥별이나 반딧불이 보이면 소원을 빌어 보세요. 하룻밤에 세 번이면 좋은 일이 생긴대요. 밤엔 침대에서 푹 자는 것도 잊지 마세요.',
        '여름엔 시원한 오이냉국이 최고예요. 오이 둘에 고추 하나. 아이들이 좋아해요.',
        '학교에서 안 쓰는 책장이에요. 좋아하는 책을 꽂아 두세요.'],
      gifts: [null, null, { type: 'recipe', id: 'naengguk' }, { type: 'furn', id: 'shelf' }] },
    painter: {
      letters: ['이 빛깔! 아니 회색이지만… 그래도 아름답소.',
        '진짜 시계로 밤 12시, 10분이 지나기 전에 마당에 앉아 있으면 부엉이가 날아온다오. 그림으로 그렸지.',
        '연등을 하나 그려 왔소. 아니, 진짜 연등이오. 마당에 걸어 두시오.',
        '이 벽시계는 늘 정각에 멈춰 있소. 이상하지? 정각엔 뭔가 일어나는 법이오.'],
      gifts: [null, null, { type: 'deco', id: 'lanterns' }, { type: 'furn', id: 'clock' }] }
  };
  var LV_GIFT_COINS = [0, 0, 0, 1500];   // level 4 also brings a little purse

  function strHash(str) {
    var h = 0x811c9dc5;
    for (var k = 0; k < str.length; k++) { h ^= str.charCodeAt(k); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function residentById(id) { for (var k = 0; k < RESIDENTS.length; k++) if (RESIDENTS[k].id === id) return RESIDENTS[k]; return null; }
  // who posted order o (deterministic from the order; special orders are 오 화백's)
  function residentFor(o) {
    if (o.special) return 'painter';
    var it = itemInfo(o.id), kind = it ? it.kind : 'crop';
    var c = RESIDENTS.filter(function (r) { return !r.special && r.kinds.indexOf(kind) >= 0; });
    return c[strHash(o.id + ':' + o.n + ':' + o.reward) % c.length].id;
  }
  function resOf(s) {
    if (!s.res) s.res = { f: {}, lv: {}, rec: {}, unread: [] };
    return s.res;
  }
  function recipeKnown(s, r) { return !r.gift || !!(s.res && s.res.rec[r.id]); }
  function friendLevel(s, id) { return (s.res && s.res.lv[id]) || 0; }
  function friendPoints(s, id) { return (s.res && s.res.f[id]) || 0; }
  // a gift that is already owned (or has no decoration spot free) turns into its price in coins
  function giveGift(s, g) {
    var y = yardOf(s), out = { type: g.type, id: g.id, coins: 0 };
    if (g.type === 'recipe') resOf(s).rec[g.id] = true;
    else if (g.type === 'furn') {
      if (y.furn[g.id]) out.coins = FURN.filter(function (f) { return f.id === g.id; })[0].cost;
      else y.furn[g.id] = true;
    } else {
      var d = DECOS.filter(function (x) { return x.id === g.id; })[0];
      if (y.deco[g.id] || decoCount(s) >= decoSlots(s)) out.coins = d.cost;
      else y.deco[g.id] = true;
    }
    s.coins += out.coins;
    return out;
  }
  // called by deliver(): adds 친밀도 and hands out every level reached → { who, pts, ups: [{ lv, gift, coins }] }
  function befriend(s, o) {
    var who = residentFor(o), r = resOf(s), pts = o.special ? 3 : 1, ups = [];
    r.f[who] = (r.f[who] || 0) + pts;
    while ((r.lv[who] || 0) < FRIEND_LV.length && r.f[who] >= FRIEND_LV[r.lv[who] || 0]) {
      var lv = r.lv[who] = (r.lv[who] || 0) + 1, g = RES_STORY[who].gifts[lv - 1], up = { lv: lv, gift: null, coins: LV_GIFT_COINS[lv - 1] };
      if (g) up.gift = giveGift(s, g);
      s.coins += up.coins;
      r.unread.push(who + ':' + lv);
      ups.push(up);
    }
    return { who: who, pts: pts, ups: ups };
  }
  function resLetter(id, lv) { var st = RES_STORY[id]; return st ? st.letters[lv - 1] || null : null; }
  function readResLetters(s, id) {
    var r = resOf(s), n = r.unread.length;
    r.unread = r.unread.filter(function (k) { return k.split(':')[0] !== id; });
    return n - r.unread.length;
  }

  expose({
    RESIDENTS: RESIDENTS, FRIEND_LV: FRIEND_LV, RES_STORY: RES_STORY, GIFT_RECIPES: GIFT_RECIPES,
    residentById: residentById, residentFor: residentFor, recipeKnown: recipeKnown, friendLevel: friendLevel, friendPoints: friendPoints,
    befriend: befriend, resLetter: resLetter, readResLetters: readResLetters, strHash: strHash
  });
