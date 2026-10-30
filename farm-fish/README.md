# farm-fish

친구에게 주는 건 `index.html` 한 파일. 고칠 때는 `src/`를 고치고 다시 합친다.

```sh
node farm-fish/build.js                 # src/ → index.html (같은 소스면 항상 같은 결과)
node --test farm-fish/test/*.test.js    # 빌드 없이 src/에서 바로 테스트, index.html이 낡았으면 실패
```

`src/`의 파일 순서는 `build.js`의 목록이 정한다. 새 파일은 목록에 한 줄 추가. `logic/`·`ui/` 파일은 각각 하나의 클로저 조각이라 앞 파일의 이름을 그대로 쓴다. 로직 파일은 공개할 이름을 파일 끝 `expose({...})`에 적는다.

| 파일 | 맡는 것 |
|---|---|
| `page.html` | 페이지 뼈대, 스크립트 감싸기 |
| `style.css`, `body.html` | 스타일, 마크업 |
| `logic/shop.js` | 상점 업그레이드 단계·가격 |
| `logic/farm.js` | 작물·씨앗·밭·까마귀/잡초·교배 |
| `logic/fishing.js` | 물고기 표, 입질, 릴 미니게임 |
| `logic/spots.js` | 낚시터(강·바다) 해금, 시간대·날씨·계절 조건, 비 성장 보너스 |
| `logic/basket.js` | 아이템, 바구니, 주문 게시판, 요리 |
| `logic/yard.js`, `logic/visitors.js`, `logic/eggs.js` | 집 단계·동물·장식·가구(놓인 자리 `s.yard.place`, 없으면 보관함)·추가 냄비(`s.yard`, `s.animals`), 방문객·편지·떠돌이 상인, 이스터에그·시계 물고기 |
| `logic/dex.js` | 도감 수, 마일스톤 |
| `logic/save.js` | 새 상태, encode/decode, 옛 세이브 호환 (세이브 관련은 여기만) |
| `ui/core.js` | 속도·시계, 저장/불러오기, DOM 참조 |
| `ui/sprites.js` | 픽셀 도우미, 스프라이트 |
| `ui/background.js` | 배치 좌표, 미리 그린 배경 |
| `ui/hud.js` | 화면 상태, 토스트, 떠오르는 글자, 파티클 |
| `ui/tray.js` | 씨앗 트레이 |
| `ui/input.js` | 포인터·키, 탭 분배, 보스키 |
| `ui/farm.js` | 밭 탭·틱·그리기 |
| `ui/pond.js` | 낚시 흐름, 연못 탭·틱·그리기, 마일스톤 장식 |
| `ui/spots.js`, `ui/weather.js`, `ui/calendar.js`, `calendar.css` | 강·바다 그림·표지판·조건부 물고기·채집물 알림, 날씨·밤 효과와 구석 표시, 달력 패널 |
| `ui/yard.js`, `ui/visitors.js`, `ui/house.js`, `ui/records.js`, `yard.css` | 마당 장면·장면 버튼(이동 목록), 방문객 그림·탭·상인/편지 창, 집 안·상점 마당 칸, 도감 기록 탭 |
| `logic/seasons.js`, `logic/residents.js`, `logic/aquarium.js`, `logic/daily.js`, `logic/share.js` | 계절 작물·물고기, 단골 주민(친밀도·편지·선물·선물 레시피), 수족관(`s.tank`), 오늘의 할 일(`s.daily`), 농장 N년차(`s.born`)·친구 기록 코드·4단계 세이브 블록 |
| `ui/seasons.js`, `ui/residents.js`, `ui/aquarium.js`, `ui/daily.js`, `ui/share.js`, `stage4.css` | 계절 그림·얼음낚시, 바구니 주민 탭, 집 안 수조, 달력 할 일, 도감 친구 탭 |
| `logic/forest.js`, `logic/challenge.js`, `logic/pets.js` | 숲 채집(채집물 표·다시 돋는 자리·숲 요리, `s.forest`), 도전 게이지 판정(채집·수확 특상품), 반려동물(`s.pet`)·5A 세이브 블록 |
| `ui/forest.js`, `ui/pets.js`, `forest.css` | 숲 장면·채집물 그림·도전 게이지, 도감 채집 칸, 달력 숲 항목, 반려동물 그림·쓰다듬기·선물·상점 입양·이름 짓기 |
| `ui/dex.js`, `ui/shop.js`, `ui/basket.js` | 도감·상점·바구니 패널 (바구니 모서리 그림 포함) |
| `logic/junk.js`, `logic/festivals.js`, `logic/heat.js` | 낚시 잡동사니·고물·재활용 장식·보물 상자(+자물쇠 도전)·병 편지(`s.junk`), 계절 축제 시간표·축제 물고기/장식/송편/주문(`s.fest`), 불 조절 도전 |
| `ui/junk.js`, `ui/festivals.js`, `festival.css` | 잡동사니 결과 카드·고물 상자 창·기록 탭 병 편지·도전 창, 축제 칩·축제 창·축제 하늘·새 장식 그림·달력 축제 줄·냄비 도전 버튼 |
| `logic/cave.js`, `logic/sky.js`, `ui/cave.js`, `ui/sky.js` | 7단계 동굴(곡괭이·기력·광석/보석·화석·광석 장식, `s.cave`)·별 관측(망원경·별자리 잇기 `stars` 장면·유성우 소원, `s.sky`)·7B 세이브 블록 |
| `logic/island.js`, `ui/island.js` | 섬(7단계): 바다의 낡은 배 수리(코인+고물), 섬 낚시터(`spot: 'island'`, 표지판에서 사지 않음), 표류물·야자 열매, 등대지기·등대 이야기(`s.isle`), 섬 장면·배/등대 창·도감/달력 섬 칸 |
| `logic/guide.js`, `ui/guide.js` | 놀거리 수첩: `GUIDE` 표(장소·활동 한 줄, 실제 해금 조건), 새 표시(`s.guide.seen`), 첫 방문 팁(`s.guide.tip`), 도감 첫 탭 「놀거리」, `FF.guide` |
| `logic/temper.js`, `ui/temper.js` | 8단계 손맛: 물고기 성격(`TEMPER`: 순한·점프·버팀·질주, 전설은 2~3단계 보스전, `newReel`/`reelStep`이 사용), 월척 신기록·어탁(`topRecords`, 집 안 벽 2×2), 릴 신호 문구·보스 단계 신호, `FF.temper`/`FF.records`/`FF.hookFish` |
| `logic/events.js`, `ui/events.js`, `events.css` | 8단계 ①: 입질 폭풍·대풍년 시간표(`boomFor`, 낚시 `env.boom`·수확 덤), 오늘의 날 12종(`s.day`, `dayIs`), 자리 비운 사이 일기(`s.diary`, 첫 틱 전후 비교), 위 표시·카드·달력 줄·기록 칸, `FF.boom/day/diary` |
| `logic/treasure.js`, `ui/treasure.js` | 8단계 ③ 소문과 보물 지도: 지도 조각(고물·동굴·표류물에서 드물게, `s.tmap`, 바구니 밖), 완성 지도 그림(실제 장면 + X + 달·해·비·안개·썰물 표시), 그 자리 꾹 눌러 파기(틀려도 힌트만), 소문 줄(주민 대화·병 편지·손님, `s.rumor`), 도감 기록 탭 보물 지도·소문 수첩, `FF.tmap/rumor/dig` |
| `logic/fx.js`, `ui/fx.js` | 8단계 ④ 이펙트: 순수 타이밍(이징·카운트업·상한·묵은 효과 버리기·연속 수확), 챔질 히트스톱(그림만 멈춤)·물보라, 고장력 낚싯대 떨림, 바구니로 날아가는 물고기, 희귀 흔들림·실루엣 공개, 전설 어둠→빛줄기, 수확 튀어오름·흙·특상품 반짝·×2 ×3, 지갑으로 날아가는 동전·카운트업, 해금·신기록·도감 도장, `prefers-reduced-motion` 한곳 |
| `logic/toys.js`, `logic/quest.js`, `ui/toys.js`, `ui/quest.js` | 10단계 ④: 날씨 장난감(비 웅덩이 첨벙·눈 발자국·가을 낙엽 더미, 밭·마당·숲 빈 땅에서만, 가끔 도토리·동전 하루 `TOY_DAY_CAP`번, `s.toy`), 계절 도감 챌린지(계절=현실 1주마다 「꼭 볼 것 5개」를 주 키로 골라 고정, 실제 도감 기록으로 체크, 다 채우면 계절 장식 4종 하나씩·이후 코인, `s.quest`), 계절 시작 카드·달력 줄, `FF.toy`/`FF.quest` |
| `logic/contest.js`, `ui/contest.js`, `contest.css` | 10단계 ①: 박 영감 낚시 대회(현실 주, 그 주 최고 크기 % vs 박 영감 기록(주 키 + 낚싯대·바다 수준), 금·은·동 트로피 장식 4모양, 진 주는 편지, `s.cont`), 한 해 결산 카드(게임 1년 = 현실 4주, 캔버스 그림 + PNG 저장, 기록 탭, `s.yr`), 농장 간판(이름·모양, 밭 아래 울타리, 친구 코드 `n…` 칸, `s.farm`), 달력 줄·박 영감 줄, `FF.contest/year` |
| `logic/town.js`, `ui/town.js` | 10단계 ③ 주민들의 하루·새 주민: 주민이 집에 없는 시간대엔 마을 길 자리(`TOWN_PLACES`: 정자·텃밭·분교 마당·나루터 길·우물가·언덕·장터 가는 길·박물관 앞)에 서 있고 누르면 그 자리 대사(하루 한 번 친밀도 +1, `townMeet`), 큰 목표(화석 완성·등대 점등·박물관 절반)로 새 주민 3명 이사(`RES_EXTRA`, `s.town`: 이사 편지·만난 날), 윗길 새 집·방·얼굴, `FF.town` |
| `logic/port.js`, `ui/port.js` | 11단계 ① 옛 포구: 마을 바닷가 끝 「끊긴 다리」 표지 → `port` 장면, 다리→조선소→어판장→기차역을 꾸러미(바구니 `bagTake`·고물 `s.junk`·기록 확인)와 코인으로 차례로 복구(`s.port` got/done), 포구지기 할머니 대사·다음 건물 힌트, 고친 건물마다 배경 인물, 칭호 「포구를 되살린 사람」, 부두 → 바다 낚시터, `PORT_AT` 배치(레인 ②③의 `drawPortExtra_*`/`tapPortExtra_*`가 읽음), `FF.port` |
| `logic/auction.js`, `ui/auction.js` | 11단계 ②: 어판장 경매(현실 주마다 도감 강·바다·섬 물고기 3종, 바구니의 제일 큰 것 ×1.5~×3, 종마다 주 1회, 결과는 우체통 편지 `a:` 키, `s.port.auc`), 기차 떠돌이 상인(현실 하루 3개 중 하나, 황금 씨앗·포구 장식 5종, `s.trader`), 포구 장면 위 `drawPortExtra_auction`/`tapPortExtra_auction`, 달력 경매 줄, `FF.auction` |
| `logic/market.js`, `ui/market.js` | 장터 시세: 종목(작물·민물고기·바닷고기·숲·갯벌·과일·꿀·산물·요리·광물)마다 현실 하루 값 ×0.5~×2(날 번호로 정해지는 걷기, 저장 없음), 바구니 팔기에만(주문·경매·자동 판매 제외), 한 종목 하루 많이 팔면 ×1까지 내려감(`s.mkt`), 바구니 탭 시세판(▲▼·7일 그림), `FF.market` |
| `logic/bank.js`, `ui/bank.js` | 은행: 바구니 탭 은행 버튼, 맡기기/찾기, 현실 하루(자정)마다 이자 2%(버림, 복리), 통장 최대 300,000코인(이자도 거기서 멈춤), 비운 날이 길어도 이자는 7일치까지(`BANK_*` 상수), 날을 되돌려도 두 번 안 줌(`s.bank` c/d/i, 첫 입금 때 생김), `FF.bank` |
| `logic/arcade.js`, `ui/arcade.js`, `arcade.css` | 게임장: 마을 아래 장터 가는 길 옆 건물(`ARC_AT`) → 게임장 창(게임 고르기 → 난이도·내기 → 120×120 판), 두더지 잡기·짝 맞추기·공 던지기(쉬움 ×1.5·보통 ×2·어려움 ×3)·슬롯머신(777 ×20·셋 ×5·둘 ×1.5, 기대 환급 약 0.91), 건 코인은 먼저 내고 이기면 배수로, 상금 게임은 현실 하루 `ARC_DAY_CAP`판(`s.arcade`) 그 뒤엔 그냥 놀기, 시간은 실제 ms, 숫자는 `logic/arcade.js` 맨 위 표, `FF.arcade` |
| `logic/myshop.js`, `ui/myshop.js` | 내 가게: 마을 윗길 오른쪽 빈 가게 터 → `MYS_PRICE`로 짓기(`s.mys`, 지을 때 생김), 진열대 3~8칸(칸마다 `MYS_STACK`개, 늘릴수록 비싸짐)에 바구니·창고 물건 올리기/내리기(지키기 물건도 직접 올리면 됨), 손님은 현실 시간으로 늦게 계산(`MYS_GAP`마다 하나, 비운 동안은 `MYS_CATCHUP`까지, 시계를 되돌려도 다시 안 팔림), 값 = 물건 값 × 그날 시세(`mktPrice`, 미끄럼 없음·`s.mkt` 안 건드림) × 등급 보너스(`MYS_BONUS`), 판 코인은 금고 → 가게를 열면 지갑으로, 꾸미기 5종(손님 간격 단축, 건물에 그려짐)·등급 올리기, 숫자는 `logic/myshop.js` 맨 위, `FF.myshop` |
| `logic/train.js`, `ui/train.js` | 기차 여행: 마을 길 가운데 간이역(`TRN_AT`) → 노선 창(잠김 이유·개통비·기차표·타기), 노선 셋(계곡 ★8 / 온천 ★20+계곡 / 설원 포구 기차역+온천, 설원은 고친 포구 기차역 건물에서), 개통비 한 번 + 현실 하루 기차표(`toyDay`, 산 날은 몇 번이든, 날이 앞으로 갈 때만 새 표, 시계를 되돌려도 같은 날 두 번 안 받음, `s.train` ok/tk/pick/dex는 첫 개통 때 생김), 창밖 풍경 약 2초(탭하거나 「내리기」로 건너뛰기), 목적지에서는 이동 버튼이 「역으로」, 산골 계곡(`trnvalley`): 물고기 6종(`spot: 'valley'`, 표지판에서 사지 않음, 시세 민물고기, 박물관 물고기실), 다시 돋는 특산물 3자리(산나물·송이버섯, 시세 숲·갯벌), 기념품 가게(마당 장식 3종, 하나씩), 계곡물을 누르면 밭 화면의 계곡 낚시 → 물가 팻말로 돌아가기, 온천 마을(`trnonsen`): 온천 호수 물고기 6종(`spot: 'onsen'`), 온천 달걀·유자, 기념품 2종, 온천장을 누르면 하루 한 번 온천욕(1시간 어디서든 입질 대기 ×0.7, `s.train.bath`, 시계를 되돌려도 같은 날 두 번 안 됨, 위에 ♨ 남은 분 표시), 설원 고개(`trnsnow`, 고친 포구 기차역에서): 얼음 호수 얼음낚시 6종(`spot: 'snow'`, 연못 얼음 그림), 얼음 결정·눈꽃, 기념품 2종, 창밖 풍경은 노선마다(계곡 산·온천 김·설원 눈), 숫자는 `logic/train.js` 맨 위, `FF.train('onsen' | 'snow' | 'bath')`, `FF.train('pick', route)` |
| `logic/craft.js`, `ui/craft.js` | 가공 공방: 마당 등 아래 돌길 오른쪽(`CFT_AT`, 장식은 못 옮겨 옴 `YARD_BLOCK`)에 ★10이면 공방 터 → `CFT_PRICE`로 짓기(`s.craft` m/dx, 지을 때 생김), 기계 넷(장독: 과수원 과일 → 과일청 3시간(딸기류는 요리 딸기잼으로) / 건조대: 민물고기 → 건어물 4시간 / 소금 항아리: 바닷물고기·갯벌 → 젓갈 8시간 / 치즈 통: 우유 → 치즈 6시간, 같은 기계 3대까지 값 ×1·×1.5·×2), 빈 기계에 바구니의 같은 재료 `CFT_CAP`개까지(비싼 것부터), 현실 시간으로 늦게 계산(꺼 둬도 익음, 시계를 되돌려도 일찍·두 번 안 나옴, 하루 넘게 앞선 시작은 지금부터 다시), 다 되면 공방 위 반짝임·이동 버튼 점, 꺼내면 바구니에 들어가는 만큼(남은 건 기계에서 기다림), 가공품 하나 값 = 넣은 하나 값 + min(값, `CFT_VCAP`) × (기계 `mul` − 1)(과일·우유 ×1.4, 물고기 ×1.7, `{id, v}` 그대로라 팔기·시세(요리)·창고·지키기·내 가게 모두 그 값), 기계가 있고 재료를 얻을 수 있으면 주민 주문에 가끔, 도감 가공품 칸, 숫자는 `logic/craft.js` 맨 위, `FF.craft('build' | 'buy', k | 'put', i, id, n | 'done' | 'take')` |
| `logic/camp.js`, `ui/camp.js` | 캠핑: 숲 오른쪽 아래 캠핑장 팻말(`CMP_SIGN`, 숲이 열리고 ★12) → 캠핑 세트 `CMP_PRICE`(`s.camp`, 살 때 생김) → 캠프 장면(`cmpforest`, 이동 버튼 「숲으로」), 캠핑지 표 `CMP_SITES`(곳마다 view·밤 곤충 자리·아침 선물 목록: 숲 · 계곡 캠핑 `cmpvalley`(산골 계곡 장면의 팻말 `CMP_SIGNS.valley`, 그날 계곡 기차표 `cmpGoStatus`, 버튼 「계곡으로」) · 바닷가 캠핑 `cmpsea`(바다 낚시터일 때 밭 화면 물가의 팻말 `CMP_SIGNS.sea`, 버튼 「바다로」)), 모닥불(저녁·밤에 솔방울 1개, 다음 아침까지, `s.camp.fire`), 석쇠(캠핑 요리 8가지 `CMP_RECIPES`, 냄비 `RECIPES`와 따로, 값 = 재료 × `CMP_MUL`, 1~3분, 현실 시간으로 늦게 계산, 오래 두면 탄 음식, 아이템 종류 `'camp'`·시세 요리), 불가 손님(불이 타는 동안 3분마다 주민·반려동물, 누르면 캠핑 대사 + 하루 한 번 친밀도), 텐트에서 자기(밤에만, 다음 아침이 오면 꺼 둬도 텐트 앞에 선물, 현실 하루 `CMP_GIFT_DAY`번, 날이 앞으로 갈 때만 다시 셈), 텐트 3단계·장비 8가지(캠프에 그려짐), 도장 수첩(캠핑지 × 계절 × 맑음·비·눈, 칭호 `cmpTitles`·캠핑 깃발 장식), 숲 캠핑장 밤 곤충 2종(`BUG_PLACES.cmpforest`), 계곡·바닷가 밤 곤충 2종씩(`CMP_BUGS_B`), 밤 낚시(계곡·바닷가 캠프의 물을 누르면 저녁·밤에만, 낚시터 `cmpbrook`·`cmpshore`, 물고기 `CMP_FISH` 3종씩; 화면은 기차 여행 물가처럼 `SCENES[spot].trip` + `.camp`라 밭이 아니라 그 캠프(텐트·모닥불·계곡 개울과 소 / 모래밭과 밤바다)를 그림 `cmpPaintTrip`·`cmpDrawTrip`, 물가 팻말·이동 버튼은 캠핑장으로, 아침이 오면 `cmpTripTick`이 줄을 걷고 캠핑장으로), 비·눈 오는 밤 선물(`CMP_WX_GIFT`: 빗소리 유리병·꼬마 눈사람), 별 보기 연결(캠프 밤하늘·망원경 받침·시트에서 별 잇기, 별자리·유성우 동전 × `cmpStarMul` = `CMP_STAR_MUL`, 받침이면 × `CMP_SCOPE_MUL` 더), 도감 캠핑 요리 칸, 숫자는 `logic/camp.js` 맨 위, `FF.camp()`·`FF.camp('fire' \| 'cook', rid \| 'done' \| 'sleep', wx \| 'morning' \| 'gear' \| 'sheet' \| 'stamps' \| 'valley' \| 'sea' \| 'fish')` (화면에 있는 캠프에 적용) |
| `ui/loop.js` | 제목 알림, 틱, 프레임, 루프, 창 맞춤 |
| `ui/pip.js` | 작게 띄우기(PiP) |
| `ui/boot.js` | 시작 순서, 콘솔용 `FF` (항상 마지막) |
