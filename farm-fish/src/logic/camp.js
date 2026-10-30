  // ---------- 캠핑: 캠핑 세트, camp sites, 모닥불·석쇠 요리, 불가 손님, 텐트에서 자고 받는 아침 선물, 장비, 도장 수첩 (s.camp) ----------
  // s.camp is made when the 캠핑 세트 is bought (★CMP_REP, at the 숲 camp sign). Everything runs on real ms, worked out lazily:
  //  - the fire burns from evening/night until that game night ends (the next 아침), never longer than CMP_FIRE_MAX;
  //  - a grill slot is done at t + m and stays done (d); left more than CMP_BURN_MS after that without the 아이스박스 it burns (b);
  //    a start more than its own time ahead was a wrong clock and starts again now;
  //  - a night in the tent wakes at the next 아침 (w); then the gift waits at the tent and the night is stamped.
  //    Nights are capped at CMP_GIFT_DAY per real day, counted when you lie down. The count keeps the latest day ever seen (h)
  //    and that day's count (hn): it starts over only past h, so a clock set back and then put right never fills the day
  //    again; a day 2+ before h (a clock once set far ahead) is counted on its own, so nothing ever freezes (cmpBucket).
  //  - the 계곡 camp needs that day's ticket for everything there (fire, grill, sleep), not only to get in (cmpGoStatus).
  // s.camp = { tent: 1..3, eq: { id: true }, fire?: { s: site, u: ms }, g: [slot, slot] (slot = null | { r, t, m, d?, b? }),
  //            sleep?: { s: site, w: wake ms, se: season, wx: 'clear' | 'rain' | 'snow' }, gift: [item id], gd: { d, n, h?, hn? },
  //            tk: { d, ids: { who: true }, h?, hids? }, st: { 'site:season:wx': nights }, dx: { recipe id: n } }
  // Numbers: tools/BALANCE.md 「캠핑」.
  var CMP_REP = 12, CMP_PRICE = 8000;
  var CMP_MUL = 1.3;                    // a camp dish = its inputs' plain prices × this (the pot pays more for the same things)
  var CMP_TABLE_MUL = 0.7;              // 캠핑 테이블: grill time × this
  var CMP_BURN_MS = 5 * 60e3;           // done food left this long past done burns (unless 아이스박스)
  var CMP_FIRE_MAX = 45 * 60e3;         // a fire (or a night's sleep) never lasts longer than this, even at the midnight day shift
  var CMP_NIGHT_MAX = 35 * 60e3;
  var CMP_GIFT_DAY = 3;                 // nights with a morning gift per real day
  var CMP_GIFT_MAX = 30;                // gift items waiting at the tent at most
  var CMP_VISIT_MS = 3 * 60e3;          // one 불가 손님 roll per this window while the fire burns
  var CMP_VISIT_P = 0.4, CMP_CHAIR_P = 0.7;
  var CMP_TALK_PTS = 2;                 // 친밀도 for the first fireside talk with someone each real day
  var CMP_LANTERN_MUL = 0.5;            // 랜턴: the wait for the next night camp insect × this
  var CMP_SCOPE_MUL = 1.5;              // 망원경 받침: camp star rewards (already × CMP_STAR_MUL) × this again

  var CMP_TENTS = [
    { lv: 1, name: '1인 텐트', cost: 0 },
    { lv: 2, name: '가족 텐트', cost: 15000 },
    { lv: 3, name: '캠핑카', cost: 40000 }
  ];
  var CMP_EQ = [
    { id: 'lantern', name: '랜턴',       cost: 2500,  what: '밤 곤충이 더 자주 와요' },
    { id: 'chair',   name: '캠핑 의자',  cost: 2000,  what: '불가 손님이 더 자주 와요' },
    { id: 'grill',   name: '석쇠',       cost: 6000,  what: '구이를 두 개 같이' },
    { id: 'hammock', name: '해먹',       cost: 8000,  what: '아침 선물 하나 더' },
    { id: 'guitar',  name: '기타',       cost: 3000,  what: '불가 이야기가 늘어요' },
    { id: 'table',   name: '캠핑 테이블', cost: 4000, what: '구이 시간 ×' + CMP_TABLE_MUL },
    { id: 'icebox',  name: '아이스박스', cost: 5000,  what: '다 된 구이가 타지 않아요' },
    { id: 'scope',   name: '망원경 받침', cost: 10000, what: '캠프 별 보기 보상 한 번 더 ×' + CMP_SCOPE_MUL }
  ];
  // camp dishes: separate from the pot's RECIPES; price = inputs' plain prices × CMP_MUL (cmpSell)
  var CMP_RECIPES = [
    { id: 'cmpotato',  name: '감자 호일구이', need: ['potato', 'potato'],          time: 120e3 },
    { id: 'cmfish',    name: '생선 꼬치',     need: ['crucian', 'crucian'],        time: 90e3 },
    { id: 'cmcorn',    name: '옥수수 구이',   need: ['corn'],                      time: 150e3 },
    { id: 'cmmush',    name: '버섯 꼬치',     need: ['oyster', 'oyster'],          time: 90e3 },
    { id: 'cmramen',   name: '캠핑 라면',     need: ['egg', 'pepper', 'radish'],   time: 60e3 },
    { id: 'cmmallow',  name: '마시멜로 구이', need: ['egg', 'egg', 'berry'],       time: 60e3,  hidden: true },
    { id: 'cmchest',   name: '군밤',          need: ['chestnut', 'chestnut', 'chestnut'], time: 180e3, hidden: true },
    { id: 'cmcatfish', name: '메기 숯불구이', need: ['catfish', 'catfish'],        time: 150e3, hidden: true }
  ];
  // other camp items: 탄 음식 (left too long on the grill), 아침 이슬 (a morning gift)
  var CMP_ITEMS = [
    { id: 'cmburnt', name: '탄 음식', price: 5 },
    { id: 'cmdew',   name: '아침 이슬', price: 150 }
  ];
  // camp sites (lane B pushes 계곡, 바닷가 below). view = the UI scene; place = BUG_PLACES key for its night insects;
  // gifts = what a morning at the tent brings (any item id, w = weight); ok(s) = may camp there now
  var CMP_SITES = [
    { id: 'forest', name: '숲 캠핑장', view: 'cmpforest', place: 'cmpforest', ok: function (s) { return forestOk(s); },
      gifts: [{ id: 'cmdew', w: 40 }, { id: 'birdfeather', w: 20 }, { id: 'pinecone', w: 20 }, { id: 'oyster', w: 10 }, { id: 'shiitake', w: 8 }, { id: 'amberstone', w: 2 }] }
  ];
  // the 3 weather groups of the 도장 수첩
  var CMP_WX = { clear: 'clear', fog: 'clear', rain: 'rain', snow: 'snow' };
  var CMP_WX_NAME = { clear: '맑음', rain: '비', snow: '눈' };
  var CMP_TITLES = [{ n: 3, title: '초보 캠퍼' }, { n: 8, title: '숲의 야영객' }, { n: 16, title: '떠돌이 캠퍼' }, { n: 24, title: '캠핑의 달인' }];
  var CMP_DECO = 'cmpflag', CMP_DECO_AT = 5;   // the stamp-book decoration: 캠핑 깃발 at 5 stamps
  DECOS.push({ id: CMP_DECO, name: '캠핑 깃발', cost: 0, merchant: true, from: 'camp', sz: [12, 22] });

  // night insects at the camp sites (only there, only at night); in the 곤충 도감 and the 곤충실
  BUG_PLACES.cmpforest = '숲 캠핑장';
  var CMP_BUGS = [
    { id: 'latefly',  name: '늦반딧불이',   rarity: '드묾', price: 110, season: ['summer', 'autumn'], phase: ['night'], at: ['cmpforest'], hint: '숲 캠핑장 밤 · 늦여름부터 가을까지 크게 반짝' },
    { id: 'flatstag', name: '넓적사슴벌레', rarity: '희귀', price: 300, season: ['spring', 'summer', 'autumn'], phase: ['night'], at: ['cmpforest'], hint: '숲 캠핑장 밤 · 불빛 보고 날아오는 납작한 턱' }
  ];
  CMP_BUGS.forEach(function (b) { BUGS.push(b); BUG_BY[b.id] = b; MUSEUM_ROOMS.bug.ids.push(b.id); });

  // ---------- 레인 B: 계곡 캠핑 (기차 계곡 노선, 그날 계곡 표) · 바닷가 캠핑 (바다 낚시터) ----------
  // route = the train route whose ticket you need to be there (trnTicket); spot = the night-fishing spot by that camp, fished
  // on a trip-style screen showing the camp (ui/camp.js cmpPaintTrip). Its fish bite only in the evening and at night.
  CMP_ITEMS.push({ id: 'cmpebble', name: '매끈한 조약돌', price: 120 }, { id: 'cmrain', name: '빗소리 유리병', price: 400 }, { id: 'cmsnowman', name: '꼬마 눈사람', price: 400 });
  CMP_SITES.push(
    { id: 'valley', name: '계곡 캠핑', view: 'cmpvalley', place: 'cmpvalley', spot: 'cmpbrook', route: 'valley', ok: function (s) { return trnOk(s, 'valley'); },
      gifts: [{ id: 'cmdew', w: 35 }, { id: 'cmpebble', w: 20 }, { id: 'vnamul', w: 20 }, { id: 'pinecone', w: 12 }, { id: 'birdfeather', w: 10 }, { id: 'vsongi', w: 4 }] },
    { id: 'sea', name: '바닷가 캠핑', view: 'cmpsea', place: 'cmpsea', spot: 'cmpshore', ok: function (s) { return spotUnlocked(s, 'sea'); },
      gifts: [{ id: 'cmdew', w: 30 }, { id: 'starfish', w: 12 }, { id: 'sanddollar', w: 20 }, { id: 'whelk', w: 15 }, { id: 'turban', w: 15 }, { id: 'glassfloat', w: 8 }, { id: 'pearl', w: 1 }] }
  );
  // a rainy / snowy night adds this one to the morning gift (on top of the site's list)
  var CMP_WX_GIFT = { rain: 'cmrain', snow: 'cmsnowman' };
  // 별 보기 at a camp: constellations and 유성우 coins × CMP_STAR_MUL, × CMP_SCOPE_MUL more with the 망원경 받침
  var CMP_STAR_MUL = 1.5;
  SPOTS.cmpbrook = { id: 'cmpbrook', name: '계곡 캠핑 물가', rep: Infinity, cost: 0, fresh: true };
  SPOTS.cmpshore = { id: 'cmpshore', name: '바닷가 캠핑 물가', rep: Infinity, cost: 0 };
  var CMP_FISH = [
    { id: 'tunggari', name: '퉁가리',     rarity: '흔함', w: 40, min: 6,  max: 13, power: 1.0, price: 75,  spot: 'cmpbrook', phase: ['evening', 'night'], hint: '계곡 캠핑 밤 · 돌 밑에서 나와 가시로 쏜다' },
    { id: 'miyugi',   name: '미유기',     rarity: '드묾', w: 18, min: 15, max: 28, power: 1.3, price: 240, spot: 'cmpbrook', phase: ['evening', 'night'], hint: '계곡 캠핑 밤 · 산골 메기라 불린다' },
    { id: 'eolsari',  name: '얼룩동사리', rarity: '희귀', w: 8,  min: 10, max: 22, power: 1.5, price: 570, spot: 'cmpbrook', phase: ['night'], hint: '계곡 캠핑 한밤 · 바위 그늘에서 꼼짝 않고 기다린다' },
    { id: 'bollak',   name: '볼락',       rarity: '흔함', w: 40, min: 12, max: 25, power: 1.1, price: 90,  spot: 'cmpshore', phase: ['evening', 'night'], hint: '바닷가 캠핑 밤 · 불빛 아래 떼로 떠오른다' },
    { id: 'gamseong', name: '감성돔',     rarity: '드묾', w: 18, min: 25, max: 50, power: 1.5, price: 340, spot: 'cmpshore', phase: ['evening', 'night'], hint: '바닷가 캠핑 밤 · 갯바위 밑 조심스러운 입질' },
    { id: 'nongeo',   name: '농어',       rarity: '희귀', w: 8,  min: 40, max: 85, power: 1.8, price: 700, spot: 'cmpshore', phase: ['night'], hint: '바닷가 캠핑 한밤 · 파도 거품 속을 사냥한다' }
  ];
  CMP_FISH.forEach(function (f) { FISH.push(f); MUSEUM_ROOMS.fish.ids.push(f.id); });
  BUG_PLACES.cmpvalley = '계곡 캠핑'; BUG_PLACES.cmpsea = '바닷가 캠핑';
  var CMP_BUGS_B = [
    { id: 'caddisfly',  name: '날도래',     rarity: '흔함', price: 45,  phase: ['night'], at: ['cmpvalley'], hint: '계곡 캠핑 밤 · 철마다 · 물가 불빛에 모이는 나방 닮은 벌레' },
    { id: 'owlfly',     name: '뿔잠자리',   rarity: '드묾', price: 160, season: ['summer'], phase: ['evening', 'night'], at: ['cmpvalley'], hint: '계곡 캠핑 여름 저녁 · 더듬이 끝이 둥근 잠자리 닮은 벌레' },
    { id: 'sandbeetle', name: '모래거저리', rarity: '드묾', price: 130, season: ['spring', 'summer', 'autumn'], phase: ['night'], at: ['cmpsea'], hint: '바닷가 캠핑 밤 · 모래 위를 바삐 걷는 까만 딱정벌레' },
    { id: 'hawkmoth',   name: '줄박각시',   rarity: '희귀', price: 290, season: ['summer', 'autumn'], phase: ['evening', 'night'], at: ['cmpsea'], hint: '바닷가 캠핑 여름·가을 밤 · 갯메꽃 사이를 빠르게' }
  ];
  CMP_BUGS_B.forEach(function (b) { BUGS.push(b); BUG_BY[b.id] = b; MUSEUM_ROOMS.bug.ids.push(b.id); });

  // 불가 이야기: 2–3 lines per resident (and the pet); the 기타 adds one more each
  var CMP_LINES = {
    grandma: ['불 쬐니까 옛날 생각 나네. 우리 영감이랑 냇가에서 감자 구워 먹던 밤이 있었지.', '밤바람이 차. 담요 하나 더 덮고 자. 할미 말 들어.', '불씨는 꼭 꺼 두고 자야 한다. 숲이 다 우리 거야.'],
    fisher: ['…밤에는 물소리가 더 크게 들리지. 고기도 그걸 안다.', '불 앞에선 말이 줄어. 그게 좋아.', '내 젊을 적엔 텐트도 없이 배 위에서 잤어.'],
    chef: ['장사 끝나고 이렇게 앉아 있으니 살 것 같아요!', '라면은 불 앞에서 먹어야 제맛이죠. 국물에 연기 냄새가 배어야 해요.'],
    kid: ['우와, 별이 진짜 많아요! 저거 국자 모양 맞죠?', '마시멜로 꼭 노릇하게 구워야 돼요. 까맣게 태우면 안 돼요!', '엄마한테 여기서 자고 간다고 하면 혼나겠죠…?'],
    teacher: ['아이들한테 별자리 수업을 여기서 하면 좋겠네요.', '모닥불 소리 들으면 시험지 채점도 잊어요.'],
    painter: ['불빛은 그리기가 제일 어려워. 회색 다섯 가지로는 더더욱.', '이 밤을 그림 한 장에 담을 수 있으면 좋겠군.'],
    archaeo: ['옛날 사람들도 이렇게 불가에 모여 앉았을 거예요. 숯 자국이 유적에 남거든요.', '이 돌 좀 보세요. 아니, 그냥 돌이네요. 하하.'],
    seagirl: ['할아버지 등대 불이랑 모닥불이랑 누가 더 밝을까요?', '바닷가에서도 캠핑하면 파도 소리 들리겠죠?'],
    botanist: ['밤에만 피는 꽃이 있어요. 달맞이꽃이 지금쯤 벌어지고 있을 거예요.', '반딧불이 이끼를 보셨어요? 숲이 숨 쉬는 것 같아요.'],
    pet: ['(불 옆에 몸을 말고 눕는다)', '(타닥 소리에 귀가 쫑긋)', '(꼬리로 바닥을 톡톡 친다)']
  };
  var CMP_GUITAR_LINES = {
    grandma: ['기타 소리 좋다. 한 곡 더 쳐 봐. 할미가 장단 맞춰 줄게.'],
    fisher: ['…그 노래 안다. 흥.'],
    chef: ['노래 한 곡 하면 라면 한 그릇 공짜예요!'],
    kid: ['저도 기타 가르쳐 주세요! 한 줄만요!'],
    teacher: ['이 노래 분교 아이들이랑 같이 불러도 될까요?'],
    painter: ['음악이 있으니 불빛이 더 따뜻해 보이는군.'],
    archaeo: ['신석기 시대에도 악기가 있었다는 거 아세요? 뼈로 만든 피리요!'],
    seagirl: ['파도 소리랑 박자가 똑같아요!'],
    botanist: ['꽃들도 음악을 들으면 잘 자란대요. 정말인지는 모르겠지만요.'],
    pet: ['(기타 소리에 맞춰 꼬리가 흔들린다)']
  };

  function cmpSite(id) { for (var k = 0; k < CMP_SITES.length; k++) if (CMP_SITES[k].id === id) return CMP_SITES[k]; return null; }
  function cmpSiteOk(s, id) { var t = cmpSite(id); return !!(s.camp && t && t.ok(s)); }
  function cmpRecipe(id) { for (var k = 0; k < CMP_RECIPES.length; k++) if (CMP_RECIPES[k].id === id) return CMP_RECIPES[k]; return null; }
  function cmpEqDef(id) { for (var k = 0; k < CMP_EQ.length; k++) if (CMP_EQ[k].id === id) return CMP_EQ[k]; return null; }
  function cmpHas(s, id) { return !!(s.camp && s.camp.eq[id]); }
  function cmpSiteBySpot(spot) { for (var k = 0; k < CMP_SITES.length; k++) if (CMP_SITES[k].spot && CMP_SITES[k].spot === spot) return CMP_SITES[k]; return null; }
  // a per-day record q ({ d, h?, ... }) on day d: 'new' (past every day seen: start over), 'hi' (the latest day seen h or
  // the day before it: h's own count), 'own' (2+ days before h: a clock once set far ahead; d is counted on its own)
  function cmpHi(q) { return typeof q.h === 'number' && q.h > q.d ? q.h : q.d; }
  function cmpBucket(q, d) { if (!q) return 'new'; var h = cmpHi(q); return d > h ? 'new' : h - d <= 1 ? 'hi' : 'own'; }
  // nights slept on day d so far
  function cmpGiftUsed(q, d) {
    var b = cmpBucket(q, d);
    return b === 'new' ? 0 : b === 'hi' ? (cmpHi(q) === q.d ? q.n : q.hn || 0) : q.d === d ? q.n : 0;
  }
  // may the player go to site's camp now? 'camp' (no set) | 'open' (site not open) | 'ticket' (no ticket for its train route today) | 'ok'
  function cmpGoStatus(s, site, now, tzMin) {
    var t = cmpSite(site);
    if (!s.camp) return 'camp';
    if (!t || !t.ok(s)) return 'open';
    return t.route && !trnTicket(s, t.route, now, tzMin) ? 'ticket' : 'ok';
  }
  // the camps' night-fishing spots count as open while their camp is (s.spotOk, like the train routes' spots)
  function cmpSpotsSync(s) {
    CMP_SITES.forEach(function (t) { if (t.spot && s.camp && t.ok(s)) { s.spotOk = s.spotOk || {}; s.spotOk[t.spot] = true; } });
  }
  // may the player fish by site's camp now? only in the evening and at night (ph = the UI's phase) → { ok, spot } | { ok: false, why }
  function cmpFishOk(s, site, now, tzMin, ph) {
    var t = cmpSite(site);
    if (!t || !t.spot) return { ok: false, why: 'none' };
    var st = cmpGoStatus(s, site, now, tzMin);
    if (st !== 'ok') return { ok: false, why: st };
    if (!cmpDark(ph || gameClock(now, tzMin).phase)) return { ok: false, why: 'dark' };
    cmpSpotsSync(s);
    return { ok: true, spot: t.spot };
  }
  // star rewards × this; atCamp = joined or wished from a camp view
  function cmpStarMul(s, atCamp) { return atCamp && s.camp ? CMP_STAR_MUL * (cmpHas(s, 'scope') ? CMP_SCOPE_MUL : 1) : 1; }
  // the plain price of a camp dish
  function cmpSell(r) {
    var v = 0;
    r.need.forEach(function (id) { var it = itemInfo(id); v += it ? it.price : 0; });
    return Math.round(v * CMP_MUL);
  }
  // a camp item (dish or other) → { name, price }, else null (itemInfo's 'camp' kind)
  function cmpItem(id) {
    if (!CMP_RECIPES) return null;   // itemInfo before this file ran
    var r = cmpRecipe(id);
    if (r) return { name: r.name, price: cmpSell(r) };
    for (var k = 0; k < CMP_ITEMS.length; k++) if (CMP_ITEMS[k].id === id) return CMP_ITEMS[k];
    return null;
  }
  function cmpKnown(s, r) { return !r.hidden || !!(s.camp && s.camp.dx[r.id]); }
  function cmpObtainable(s, id) {
    if (!s.camp) return false;
    var r = cmpRecipe(id);
    return !r || (cmpKnown(s, r) && r.need.every(function (x) { return obtainable(s, x); }));
  }
  function cmpNew() { return { tent: 1, eq: {}, g: [null, null], gift: [], gd: { d: -1, n: 0 }, tk: { d: -1, ids: {} }, st: {}, dx: {} }; }
  // 'owned' | 'forest' (숲 not open) | 'rep' | 'coins' | 'ok'
  function cmpStatus(s) { return s.camp ? 'owned' : !forestOk(s) ? 'forest' : s.rep < CMP_REP ? 'rep' : s.coins < CMP_PRICE ? 'coins' : 'ok'; }
  function cmpBuy(s) {
    var st = cmpStatus(s);
    if (st !== 'ok') return { ok: false, why: st };
    s.coins -= CMP_PRICE;
    s.camp = cmpNew();
    return { ok: true };
  }
  function cmpTentNext(s) { return s.camp && s.camp.tent < CMP_TENTS.length ? CMP_TENTS[s.camp.tent] : null; }
  function cmpTentUp(s) {
    if (!s.camp) return { ok: false, why: 'camp' };
    var t = cmpTentNext(s);
    if (!t) return { ok: false, why: 'max' };
    if (s.coins < t.cost) return { ok: false, why: 'coins' };
    s.coins -= t.cost; s.camp.tent = t.lv;
    return { ok: true, lv: t.lv };
  }
  function cmpBuyEq(s, id) {
    var e = cmpEqDef(id);
    if (!s.camp) return { ok: false, why: 'camp' };
    if (!e) return { ok: false, why: 'none' };
    if (s.camp.eq[id]) return { ok: false, why: 'owned' };
    if (s.coins < e.cost) return { ok: false, why: 'coins' };
    s.coins -= e.cost; s.camp.eq[id] = true;
    return { ok: true };
  }

  // ---------- 모닥불 ----------
  function cmpDark(ph) { return ph === 'evening' || ph === 'night'; }
  // is the fire at site burning now? (a fire further ahead than CMP_FIRE_MAX was lit under a wrong clock: out)
  function cmpFireOn(s, site, now) {
    var f = s.camp && s.camp.fire;
    return !!f && f.s === site && now < f.u && f.u - now <= CMP_FIRE_MAX;
  }
  // a pinecone from the basket, else from the 창고
  function cmpFuel(s) { return bagCount(s, 'pinecone') + shedCount(s, 'pinecone'); }
  // ph = the phase now (the UI passes its own, so FF.phase works); burns until the next 아침
  function cmpLight(s, site, now, tzMin, ph) {
    var st = cmpGoStatus(s, site, now, tzMin);
    if (st !== 'ok') return { ok: false, why: st };
    if (!cmpDark(ph || gameClock(now, tzMin).phase)) return { ok: false, why: 'phase' };
    if (cmpFireOn(s, site, now)) return { ok: false, why: 'lit' };
    if (!cmpFuel(s)) return { ok: false, why: 'fuel' };
    if (!bagTake(s, 'pinecone', 1)) shedUse(s, 'pinecone', 1);
    var nx = nextPhase(now, tzMin, 'morning');
    s.camp.fire = { s: site, u: Math.min(nx ? nx.at : now + CMP_FIRE_MAX, now + CMP_FIRE_MAX) };
    return { ok: true, until: s.camp.fire.u };
  }

  // ---------- 석쇠 ----------
  function cmpSlots(s) { return cmpHas(s, 'grill') ? 2 : 1; }
  function cmpTime(s, r) { return Math.round(r.time * (cmpHas(s, 'table') ? CMP_TABLE_MUL : 1)); }
  // the inputs are in the basket (a hidden recipe can be cooked too: that is how it is found)
  function cmpCanCook(s, r) {
    var have = {};
    return r.need.every(function (id) { have[id] = (have[id] || 0) + 1; return bagCount(s, id) >= have[id]; });
  }
  // brings every slot up to now; returns how many hold done (or burnt) food
  function cmpSettleGrill(s, now) {
    if (!s.camp) return 0;
    var n = 0, ice = cmpHas(s, 'icebox');
    s.camp.g.forEach(function (g) {
      if (!g) return;
      if (g.t > now + g.m) g.t = now;                    // a clock once set ahead, now put right: start again
      if (!g.d && now >= g.t + g.m) g.d = 1;
      if (g.d && !g.b && !ice && now >= g.t + g.m + CMP_BURN_MS) g.b = 1;
      if (g.d) n++;
    });
    return n;
  }
  // ms until slot g is done (never more than its whole time)
  function cmpLeft(g, now) { return !g || g.d ? 0 : Math.max(0, Math.min(g.m, g.t + g.m - now)); }
  // ms until done food in slot g burns (0 = burnt or never with the 아이스박스)
  function cmpBurnIn(s, g, now) { return !g || !g.d || g.b || cmpHas(s, 'icebox') ? 0 : Math.max(0, g.t + g.m + CMP_BURN_MS - now); }
  // put recipe rid on grill slot i; needs the fire at site (and, at the 계곡, today's ticket) and the inputs in the basket
  function cmpCook(s, site, i, rid, now, tzMin) {
    var r = cmpRecipe(rid), st = cmpGoStatus(s, site, now, tzMin);
    if (!s.camp || !r) return { ok: false, why: 'none' };
    if (st !== 'ok') return { ok: false, why: st };
    if (!cmpFireOn(s, site, now)) return { ok: false, why: 'fire' };
    if (i < 0 || i >= cmpSlots(s)) return { ok: false, why: 'slot' };
    cmpSettleGrill(s, now);
    if (s.camp.g[i]) return { ok: false, why: 'busy' };
    if (!cmpCanCook(s, r)) return { ok: false, why: 'need' };
    r.need.forEach(function (id) { bagTake(s, id, 1); });
    s.camp.g[i] = { r: r.id, t: now, m: cmpTime(s, r) };
    return { ok: true, at: now + s.camp.g[i].m };
  }
  // slot i's food into the basket (burnt = 탄 음식) → { id, burnt, first, sold } | null
  function cmpTake(s, i, now) {
    cmpSettleGrill(s, now);
    var g = s.camp && s.camp.g[i];
    if (!g || !g.d) return null;
    var id = g.b ? 'cmburnt' : g.r, out = { id: id, burnt: !!g.b, first: false };
    if (!g.b) { out.first = !s.camp.dx[g.r]; s.camp.dx[g.r] = Math.min(1e6, (s.camp.dx[g.r] || 0) + 1); }
    out.sold = bagAdd(s, id, cmpItem(id).price);
    s.camp.g[i] = null;
    return out;
  }
  function cmpDexCount(s) { var n = 0; CMP_RECIPES.forEach(function (r) { if (s.camp && s.camp.dx[r.id]) n++; }); return n; }

  // ---------- 불가 손님 ----------
  function cmpHash(n) { n = Math.imul((n | 0) ^ 0x2c1b3c6d, 0x297a2d39); n ^= n >>> 15; n = Math.imul(n, 0x85ebca6b); n ^= n >>> 13; return (n >>> 0) / 4294967296; }
  // who may sit by the fire: residents living in the 마을 (once it is open), and the pet
  function cmpGuests(s) {
    var out = villageOk(s) ? VIL_IDS.concat(RES_EXTRA.map(function (r) { return r.id; })).filter(function (id) { return resHere(s, id) && CMP_LINES[id]; }) : [];
    if (s.pet) out.push('pet');
    return out;
  }
  // who sits by the fire at site now (fixed per CMP_VISIT_MS window), or null
  function cmpGuest(s, site, now) {
    if (!cmpFireOn(s, site, now)) return null;
    var w = Math.floor(now / CMP_VISIT_MS), who = cmpGuests(s);
    if (!who.length || cmpHash(w * 7 + 1) >= (cmpHas(s, 'chair') ? CMP_CHAIR_P : CMP_VISIT_P)) return null;
    return who[Math.floor(cmpHash(w * 13 + 5) * who.length)];
  }
  function cmpLinesOf(s, who) { return (CMP_LINES[who] || []).concat(cmpHas(s, 'guitar') ? CMP_GUITAR_LINES[who] || [] : []); }
  // tap the guest: a camp line; 친밀도 the first time each real day (the day record works as the gift count: cmpBucket)
  function cmpTalk(s, site, who, now, tzMin) {
    if (!who || cmpGuest(s, site, now) !== who) return { ok: false, why: 'gone' };
    var ls = cmpLinesOf(s, who), text = ls[Math.floor(cmpHash(Math.floor(now / 20e3) * 3 + 7) * ls.length)];
    var d = toyDay(now, tzMin), q = s.camp.tk, b = cmpBucket(q, d), h = cmpHi(q);
    if (b === 'new') q = s.camp.tk = { d: d, ids: {}, h: d, hids: {} };
    else if (b === 'own' && q.d !== d) q = s.camp.tk = { d: d, ids: {}, h: h, hids: h === q.d ? q.ids : q.hids || {} };
    var ids = b === 'hi' ? (h === q.d ? q.ids : (q.hids = q.hids || {})) : q.ids;
    if (ids[who]) return { ok: true, text: text, pts: 0, ups: [] };
    ids[who] = true;
    if (who === 'pet') { var before = petLevel(s); s.pet.f += CMP_TALK_PTS; return { ok: true, text: text, pts: CMP_TALK_PTS, ups: [], petUp: petLevel(s) > before ? petLevel(s) : 0 }; }
    return { ok: true, text: text, pts: CMP_TALK_PTS, ups: befriendPts(s, who, CMP_TALK_PTS) };
  }

  // ---------- 텐트에서 자기 ----------
  function cmpGiftLeft(s, now, tzMin) {
    var q = s.camp && s.camp.gd;
    return !q ? CMP_GIFT_DAY : Math.max(0, CMP_GIFT_DAY - cmpGiftUsed(q, toyDay(now, tzMin)));
  }
  function cmpGiftN(s) { return s.camp.tent + (cmpHas(s, 'hammock') ? 1 : 0); }
  // env = { phase, season, weather } (the UI's curEnv): only at night; the night counts against today's gifts now.
  // A morning that came first is settled and handed back as woke (the UI's cmpWoke), so its toast is never lost.
  function cmpSleep(s, site, now, tzMin, env) {
    var st = cmpGoStatus(s, site, now, tzMin);
    if (st !== 'ok') return { ok: false, why: st };
    var ev = cmpSettleSleep(s, now, tzMin);
    function out(o) { if (ev) o.woke = ev; return o; }
    if (s.camp.sleep) return out({ ok: false, why: 'asleep' });
    if (env.phase !== 'night') return out({ ok: false, why: 'phase' });
    if (!cmpGiftLeft(s, now, tzMin)) return out({ ok: false, why: 'cap' });
    var d = toyDay(now, tzMin), q = s.camp.gd, nx = nextPhase(now, tzMin, 'morning'), b = cmpBucket(q, d), c = cmpGiftUsed(q, d) + 1, h;
    if (b === 'new') s.camp.gd = { d: d, n: c, h: d, hn: c };
    else if (b === 'hi') { h = cmpHi(q); s.camp.gd = { d: q.d, n: h === q.d ? c : q.n, h: h, hn: c }; }
    else { h = cmpHi(q); s.camp.gd = { d: d, n: c, h: h, hn: h === q.d ? q.n : q.hn || 0 }; }
    var wx = CMP_WX[env.weather] || 'clear';
    if (cmpStampKeys(site).indexOf(site + ':' + env.season + ':' + wx) < 0) wx = 'clear';   // a weather that season never has: no stamp lost on reload
    s.camp.sleep = { s: site, w: Math.min(nx ? nx.at : now + CMP_NIGHT_MAX, now + CMP_NIGHT_MAX), se: env.season, wx: wx };
    return out({ ok: true, wake: s.camp.sleep.w });
  }
  // the morning came: roll the gift (fixed by the wake time), stamp the night → { items, lost, key, fresh, deco, title } | null
  // (items = what went onto the tent's pile; lost = how many did not fit, the pile holds CMP_GIFT_MAX)
  function cmpSettleSleep(s, now, tzMin) {
    var z = s.camp && s.camp.sleep;
    if (!z) return null;
    if (z.w - now > CMP_NIGHT_MAX) {                     // slept under a clock set ahead: wake at this night's real end instead
      var nx = nextPhase(now, tzMin, 'morning');
      z.w = Math.min(nx ? nx.at : now + CMP_NIGHT_MAX, now + CMP_NIGHT_MAX);
    }
    if (now < z.w) return null;
    delete s.camp.sleep;
    var site = cmpSite(z.s) || CMP_SITES[0], items = [], n = cmpGiftN(s);
    for (var k = 0; k < n; k++) {
      var tot = 0, r;
      site.gifts.forEach(function (g) { tot += g.w; });
      r = cmpHash(Math.floor(z.w / 1000) + k * 977) * tot;
      for (var j = 0; j < site.gifts.length; j++) { r -= site.gifts[j].w; if (r < 0 || j === site.gifts.length - 1) { items.push(site.gifts[j].id); break; } }
    }
    if (CMP_WX_GIFT[z.wx]) items.push(CMP_WX_GIFT[z.wx]);   // 비 → 빗소리 유리병, 눈 → 꼬마 눈사람
    var kept = items.filter(function (id) { return s.camp.gift.length < CMP_GIFT_MAX && !!s.camp.gift.push(id); });
    var key = site.id + ':' + z.se + ':' + z.wx, before = cmpStampN(s), out = { items: kept, lost: items.length - kept.length, key: key, fresh: !s.camp.st[key], deco: null, title: null };
    s.camp.st[key] = Math.min(1e6, (s.camp.st[key] || 0) + 1);
    var after = cmpStampN(s);
    if (before < CMP_DECO_AT && after >= CMP_DECO_AT && grantDeco(s, CMP_DECO).ok) out.deco = CMP_DECO;
    CMP_TITLES.forEach(function (t) { if (before < t.n && after >= t.n) out.title = t.title; });
    return out;
  }
  // gifts waiting at the tent into the basket → { ids, sold, woke? } (woke = a morning settled just now, for cmpWoke)
  function cmpTakeGift(s, now, tzMin) {
    var ev = cmpSettleSleep(s, now, tzMin);
    var out = { ids: [], sold: 0 };
    if (ev) out.woke = ev;
    if (!s.camp) return out;
    s.camp.gift.forEach(function (id) { var it = itemInfo(id); if (it) { out.sold += bagAdd(s, id, it.price); out.ids.push(id); } });
    s.camp.gift = [];
    return out;
  }

  // ---------- 도장 수첩 ----------
  function cmpStampN(s) { return s.camp ? Object.keys(s.camp.st).length : 0; }
  function cmpTitles(s) { var n = cmpStampN(s); return CMP_TITLES.filter(function (t) { return n >= t.n; }).map(function (t) { return t.title; }); }
  // every stamp a site can have: season × the weather groups that season has
  function cmpStampKeys(site) {
    var out = [];
    SEASONS.forEach(function (se) {
      ['clear', 'rain', 'snow'].forEach(function (g) {
        if (WEATHER_ODDS[se].some(function (w) { return CMP_WX[w[0]] === g; })) out.push(site + ':' + se + ':' + g);
      });
    });
    return out;
  }

  // ---------- save: a bad field loses only that field; the set, tent, equipment and stamps are kept ----------
  function decodeCamp(o, s) {
    var q = o.camp;
    function obj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
    function num(x) { return typeof x === 'number' && isFinite(x); }
    if (!obj(q)) return;
    var c = cmpNew();
    if (num(q.tent)) c.tent = Math.max(1, Math.min(CMP_TENTS.length, Math.floor(q.tent)));
    if (obj(q.eq)) CMP_EQ.forEach(function (e) { if (q.eq[e.id] === true) c.eq[e.id] = true; });
    if (obj(q.fire) && cmpSite(q.fire.s) && num(q.fire.u)) c.fire = { s: q.fire.s, u: q.fire.u };
    if (Array.isArray(q.g)) for (var k = 0; k < 2; k++) {
      var g = q.g[k];
      if (obj(g) && cmpRecipe(g.r) && num(g.t) && num(g.m) && g.m > 0 && g.m <= 3600e3) {
        c.g[k] = { r: g.r, t: g.t, m: g.m };
        if (g.d === 1) c.g[k].d = 1;
        if (g.b === 1 && g.d === 1) c.g[k].b = 1;
      }
    }
    if (obj(q.sleep) && cmpSite(q.sleep.s) && num(q.sleep.w) && SEASONS.indexOf(q.sleep.se) >= 0 && CMP_WX_NAME[q.sleep.wx])
      c.sleep = { s: q.sleep.s, w: q.sleep.w, se: q.sleep.se, wx: q.sleep.wx };
    if (Array.isArray(q.gift)) q.gift.forEach(function (id) { if (typeof id === 'string' && itemInfo(id) && c.gift.length < CMP_GIFT_MAX) c.gift.push(id); });
    function cnt(x) { return Math.max(0, Math.min(CMP_GIFT_DAY, Math.floor(x))); }
    function who(x) { var o = {}; if (obj(x)) Object.keys(CMP_LINES).forEach(function (id) { if (x[id] === true) o[id] = true; }); return o; }
    if (obj(q.gd) && num(q.gd.d) && num(q.gd.n)) {
      c.gd = { d: Math.floor(q.gd.d), n: cnt(q.gd.n) };
      if (num(q.gd.h)) { c.gd.h = Math.floor(q.gd.h); c.gd.hn = num(q.gd.hn) ? cnt(q.gd.hn) : CMP_GIFT_DAY; }   // a lost count = the day full
    }
    if (obj(q.tk) && num(q.tk.d)) {
      c.tk.d = Math.floor(q.tk.d);
      c.tk.ids = who(q.tk.ids);
      if (num(q.tk.h)) { c.tk.h = Math.floor(q.tk.h); c.tk.hids = who(q.tk.hids); }
    }
    if (obj(q.st)) CMP_SITES.forEach(function (t) { cmpStampKeys(t.id).forEach(function (key) { if (num(q.st[key]) && q.st[key] > 0) c.st[key] = Math.min(1e6, Math.floor(q.st[key])); }); });
    if (obj(q.dx)) CMP_RECIPES.forEach(function (r) { if (num(q.dx[r.id]) && q.dx[r.id] > 0) c.dx[r.id] = Math.min(1e6, Math.floor(q.dx[r.id])); });
    s.camp = c;
    cmpSpotsSync(s);   // after decodeTrain: the 계곡 site needs the route
  }

  expose({
    CMP_REP: CMP_REP, CMP_PRICE: CMP_PRICE, CMP_MUL: CMP_MUL, CMP_TABLE_MUL: CMP_TABLE_MUL, CMP_BURN_MS: CMP_BURN_MS, CMP_FIRE_MAX: CMP_FIRE_MAX,
    CMP_NIGHT_MAX: CMP_NIGHT_MAX, CMP_GIFT_DAY: CMP_GIFT_DAY, CMP_GIFT_MAX: CMP_GIFT_MAX, CMP_VISIT_MS: CMP_VISIT_MS, CMP_VISIT_P: CMP_VISIT_P,
    CMP_CHAIR_P: CMP_CHAIR_P, CMP_TALK_PTS: CMP_TALK_PTS, CMP_LANTERN_MUL: CMP_LANTERN_MUL, CMP_SCOPE_MUL: CMP_SCOPE_MUL,
    CMP_TENTS: CMP_TENTS, CMP_EQ: CMP_EQ, CMP_RECIPES: CMP_RECIPES, CMP_ITEMS: CMP_ITEMS, CMP_SITES: CMP_SITES, CMP_WX: CMP_WX, CMP_WX_NAME: CMP_WX_NAME,
    CMP_TITLES: CMP_TITLES, CMP_DECO: CMP_DECO, CMP_DECO_AT: CMP_DECO_AT, CMP_BUGS: CMP_BUGS, CMP_LINES: CMP_LINES, CMP_GUITAR_LINES: CMP_GUITAR_LINES,
    cmpSite: cmpSite, cmpSiteOk: cmpSiteOk, cmpRecipe: cmpRecipe, cmpEqDef: cmpEqDef, cmpHas: cmpHas, cmpSell: cmpSell, cmpItem: cmpItem,
    cmpKnown: cmpKnown, cmpObtainable: cmpObtainable, cmpStatus: cmpStatus, cmpBuy: cmpBuy, cmpTentNext: cmpTentNext, cmpTentUp: cmpTentUp,
    cmpBuyEq: cmpBuyEq, cmpDark: cmpDark, cmpFireOn: cmpFireOn, cmpFuel: cmpFuel, cmpLight: cmpLight, cmpSlots: cmpSlots, cmpTime: cmpTime,
    cmpCanCook: cmpCanCook, cmpSettleGrill: cmpSettleGrill, cmpLeft: cmpLeft, cmpBurnIn: cmpBurnIn, cmpCook: cmpCook, cmpTake: cmpTake,
    cmpDexCount: cmpDexCount, cmpGuests: cmpGuests, cmpGuest: cmpGuest, cmpLinesOf: cmpLinesOf, cmpTalk: cmpTalk, cmpGiftLeft: cmpGiftLeft,
    cmpGiftN: cmpGiftN, cmpSleep: cmpSleep, cmpSettleSleep: cmpSettleSleep, cmpTakeGift: cmpTakeGift, cmpStampN: cmpStampN, cmpTitles: cmpTitles,
    cmpStampKeys: cmpStampKeys, decodeCamp: decodeCamp, cmpBucket: cmpBucket,
    CMP_WX_GIFT: CMP_WX_GIFT, CMP_STAR_MUL: CMP_STAR_MUL, CMP_FISH: CMP_FISH, CMP_BUGS_B: CMP_BUGS_B, cmpSiteBySpot: cmpSiteBySpot,
    cmpGoStatus: cmpGoStatus, cmpSpotsSync: cmpSpotsSync, cmpFishOk: cmpFishOk, cmpStarMul: cmpStarMul
  });
