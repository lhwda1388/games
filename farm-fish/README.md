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
| `ui/yard.js`, `ui/visitors.js`, `ui/house.js`, `ui/records.js`, `yard.css` | 마당 장면·장면 버튼, 방문객 그림·탭·상인/편지 창, 집 안·상점 마당 칸, 도감 기록 탭 |
| `logic/seasons.js`, `logic/residents.js`, `logic/aquarium.js`, `logic/daily.js`, `logic/share.js` | 계절 작물·물고기, 단골 주민(친밀도·편지·선물·선물 레시피), 수족관(`s.tank`), 오늘의 할 일(`s.daily`), 농장 N년차(`s.born`)·친구 기록 코드·4단계 세이브 블록 |
| `ui/seasons.js`, `ui/residents.js`, `ui/aquarium.js`, `ui/daily.js`, `ui/share.js`, `stage4.css` | 계절 그림·얼음낚시, 바구니 주민 탭, 집 안 수조, 달력 할 일, 도감 친구 탭 |
| `logic/forest.js`, `logic/challenge.js`, `logic/pets.js` | 숲 채집(채집물 표·다시 돋는 자리·숲 요리, `s.forest`), 도전 게이지 판정(채집·수확 특상품), 반려동물(`s.pet`)·5A 세이브 블록 |
| `ui/forest.js`, `ui/pets.js`, `forest.css` | 숲 장면·채집물 그림·도전 게이지, 도감 채집 칸, 달력 숲 항목, 반려동물 그림·쓰다듬기·선물·상점 입양·이름 짓기 |
| `ui/dex.js`, `ui/shop.js`, `ui/basket.js` | 도감·상점·바구니 패널 (바구니 모서리 그림 포함) |
| `logic/junk.js`, `logic/festivals.js`, `logic/heat.js` | 낚시 잡동사니·고물·재활용 장식·보물 상자(+자물쇠 도전)·병 편지(`s.junk`), 계절 축제 시간표·축제 물고기/장식/송편/주문(`s.fest`), 불 조절 도전 |
| `ui/junk.js`, `ui/festivals.js`, `festival.css` | 잡동사니 결과 카드·고물 상자 창·기록 탭 병 편지·도전 창, 축제 칩·축제 창·축제 하늘·새 장식 그림·달력 축제 줄·냄비 도전 버튼 |
| `ui/loop.js` | 제목 알림, 틱, 프레임, 루프, 창 맞춤 |
| `ui/pip.js` | 작게 띄우기(PiP) |
| `ui/boot.js` | 시작 순서, 콘솔용 `FF` (항상 마지막) |
