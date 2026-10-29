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
| `ui/loop.js` | 제목 알림, 틱, 프레임, 루프, 창 맞춤 |
| `ui/pip.js` | 작게 띄우기(PiP) |
| `ui/boot.js` | 시작 순서, 콘솔용 `FF` (항상 마지막) |
