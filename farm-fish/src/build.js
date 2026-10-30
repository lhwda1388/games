// farm-fish/build.js — joins src/ into the single self-contained index.html.
// Usage: node farm-fish/build.js   (no dependencies; same sources always give the same bytes)
// Files are pasted in the order listed. logic/ and ui/ files are fragments of one shared closure each
// (see src/page.html), so a file can use any name defined in an earlier one. New file = one new line.
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'src');

const STYLE = [
  'style.css',
  'calendar.css',       // stage 2: clock indicator and 달력 panel
  'yard.css',           // stage 3: scene button, merchant/letter sheet
  'stage4.css',         // stage 4: 주민 hearts, 할 일, 친구 code fields and comparison, 찌! button
  // stage 5A
  'forest.css',         // 숲·반려동물: name sheet input
  // stage 5B
  'festival.css',       // 축제 chip, 도전 overlay (자물쇠 / 불 조절)
  // stage 6A
  'stage6.css',         // 곤충 catch card buttons
  // stage 6B
  'village.css',        // 마을: 지금 할 일 bar, visit sheet gift rows
  // stage 7 ① 갯벌·사진기
  'flat.css',           // 갯벌 tide tag, 사진기 button and flash
  // stage 8 ① 변동성·일기
  'events.css',         // 입질 폭풍 chip, 오늘의 날 / 일기 card
  // stage 9 ③ 자전거·열기구·썰매
  'ride.css',           // ride overlay, 마을 언덕 menu, 「자전거로」 button
  // stage 10 ① 낚시 대회·결산 카드·간판
  'contest.css',        // 농장 간판 name tag, 간판 모양 picker, 결산 카드 sheet
  // 게임장
  'arcade.css'          // 게임장 overlay: board canvas, game rows, 난이도·내기 buttons
];

const BODY = [
  'body.html'
];

// pure rules: no DOM, no Date.now(), no Math.random()
const LOGIC = [
  'logic/clock.js',     // game clock (1 day = 1 real hour, 1 season = 1 real week) and weather
  'logic/shop.js',      // upgrade tiers and prices (other files read UPG)
  'logic/farm.js',      // crops, seeds, plots, crows/weeds
  'logic/fishing.js',   // fish table, bite/nibble, reel minigame
  // stage 2: new pond-side logic files go here
  'logic/spots.js',     // 낚시터 강·바다, fish time/weather conditions, rain growth, season countdown
  'logic/seasons.js',   // stage 4: seasonal crops and fish (game-clock seasons)
  'logic/basket.js',    // items, basket, order board, cooking
  // stage 3: new yard/house/animal logic files go here
  'logic/yard.js',      // house tiers, animals, decorations, furniture, extra pots (s.yard, s.animals)
  'logic/visitors.js',  // visitors, letters, merchant
  'logic/eggs.js',      // hidden easter eggs, 시계 물고기
  // stage 4
  'logic/residents.js', // 단골 주민: who posts orders, 친밀도, letters, gifts, gift recipes
  'logic/aquarium.js',  // 수족관 in the house (s.tank)
  'logic/shed.js',      // 창고: basket items kept for orders (s.shed)
  'logic/market.js',    // 장터 시세: daily price per 종목 for basket selling, slippage (s.mkt)
  'logic/bank.js',      // 은행: deposit/withdraw, daily interest with a cap and a catch-up limit (s.bank)
  'logic/daily.js',     // 오늘의 할 일 (s.daily)
  'logic/share.js',     // 농장 N년차, 친구 기록 비교 code, stage-4 save block
  // stage 5A
  'logic/forest.js',    // 숲 채집: forage table, regrowing spots, forest recipes (s.forest)
  'logic/challenge.js', // 도전 gauge for 채집/수확 (pure judging), 특상품
  'logic/pets.js',      // 반려동물 (s.pet), stage-5A save block
  // stage 5B
  'logic/junk.js',      // 낚시 잡동사니, 보물 상자 (+ 자물쇠 도전), 병 편지 (s.junk)
  'logic/festivals.js', // 계절 축제 windows, festival fish/deco/송편/orders (s.fest)
  'logic/heat.js',      // 불 조절 도전 (optional cooking minigame)
  // stage 6A
  'logic/orchard.js',   // 과수원 trees and fruit (s.orchard), 양봉 hives and honey (s.bees), fruit/honey recipes
  'logic/bugs.js',      // 곤충 채집: insect table, flight + catch judging, net, 표본 상자 (s.bugs), stage-6A save block
  // stage 6B
  'logic/village.js',   // 마을: 주민 집 방문 (대화·선물·심부름), 이어지는 심부름 이야기 (s.vil)
  // stage 7 ① 갯벌·사진기
  'logic/flat.js',      // 갯벌: tides, dig spots, flat finds and dishes (s.flat)
  'logic/camera.js',    // 사진기: album slots, moments on screen now (s.cam)
  // stage 7 동굴·별
  'logic/cave.js',      // 동굴: pickaxe, energy, wall cells, ores/gems, fossils, ore crafting (s.cave)
  'logic/sky.js',       // 별 관측: telescope, constellations, 유성우 nights and wishes (s.sky), stage-7B save block
  // stage 7 섬
  'logic/island.js',    // 섬: 낡은 배 수리, 섬 물고기, 표류물, 야자수, 등대 이야기 (s.isle); before dex.js (adds FISH)
  // stage 9 ② 당나귀
  'logic/donkey.js',    // 당나귀 (s.donkey), 깊은 숲·산꼭대기 finds/insects/stars; before museum.js (it reads BUGS/STARS)
  // stage 7 박물관
  'logic/museum.js',    // 박물관: six rooms filled by donations, curator lines, room rewards (s.museum); after every table it shows
  // stage 8 ② 손맛
  'logic/temper.js',    // 물고기 성격 (reel patterns, boss phases), 월척 records, 어탁 top list
  // stage 8 ① 변동성·일기
  'logic/events.js',    // 입질 폭풍/대풍년 windows, 오늘의 날 modifiers (s.day), 자리 비운 사이 일기 (s.diary)
  // stage 8 ③ 소문·보물 지도
  'logic/treasure.js',  // 보물 지도 pieces/dig, 소문 lines (s.tmap, s.rumor); after junk/cave/island/village (uses their ok checks)
  // stage 9 ① 배·먼바다
  'logic/ship.js',      // 배 업그레이드 (s.ship): 돛배·통통배, 먼바다·난바다 fish + bosses, 먼 섬 drift; after temper/museum (fills TEMPER, fish room)
  // stage 9 ③ 자전거·열기구·썰매
  'logic/ride.js',      // 자전거 배달, 열기구 windows + 하늘 도감, 겨울 썰매: pure judging from tap times (s.bike, s.sled, s.bal)
  // stage 10 ④ 날씨 장난감·계절 챌린지
  'logic/toys.js',      // 날씨 장난감: splash / footprints / leaf piles, tiny capped rewards (s.toy)
  'logic/quest.js',     // 계절 도감 챌린지: 5 goals per game season, season decorations (s.quest); after every table it picks from
  // stage 10 ② 꽃 교배·새끼·허수아비
  'logic/garden.js',    // 꽃밭 교배 (s.garden), 동물 새끼 (s.brood), 허수아비 꾸미기 (s.scare); before guide.js
  // stage 10 ① 낚시 대회·결산 카드·간판
  'logic/contest.js',   // 박 영감 낚시 대회 (s.cont, trophy decos), 한 해 결산 카드 (s.yr), 농장 간판 (s.farm); before guide.js
  // stage 10 ③ 주민들의 하루·새 주민
  'logic/town.js',      // residents' street places by game time, 새 주민 이사 (s.town); after treasure/museum (adds RUMORS, reads museum)
  // stage 11 ① 옛 포구
  'logic/port.js',      // 옛 포구: bundles fill four buildings in order, granny lines (s.port got/done); after museum/sky/cave/junk
  // stage 11 ② 어판장 경매·떠돌이 상인
  'logic/auction.js',   // 어판장 경매 (s.port.auc), 기차 떠돌이 상인 (s.trader), port decos; before guide.js
  // stage 12 ③ 잠수 탐험
  'logic/divemap.js',   // 24-room dive map data (rooms, exits, gates, bubbles, things)
  'logic/dive.js',      // 잠수: gates, gear, 해저 도감, 항해일지, 난파선 상자 (s.dive); after divemap.js, before guide.js
  // 게임장
  'logic/arcade.js',    // 게임장: bets, daily prize cap, 두더지·짝 맞추기·공 던지기·슬롯 rules (s.arcade); after toys/village, before guide.js
  // 내 가게
  'logic/myshop.js',    // 내 가게: shelves, lazy customers by real time, decorations, 등급, 금고 (s.mys); after market/arcade, before guide.js
  // 기차 여행
  'logic/train.js',     // 기차 여행: routes, 개통비·하루 기차표, 산골 계곡 fish/picks/기념품 (s.train); after port/junk/yard, before guide.js and dex.js
  // 가공 공방
  'logic/craft.js',     // 가공 공방: machines, lazy real-time batches, crafted goods with per-unit values (s.craft); after train/orchard/flat, before guide.js
  // 캠핑
  'logic/camp.js',      // 캠핑: camp sites, 모닥불·석쇠, 불가 손님, 텐트 잠·아침 선물, 장비, 도장 수첩, camp night insects (s.camp); after bugs/museum/town/pets, before guide.js
  // stage 8 ④ 이펙트
  'logic/fx.js',        // pure effect timing: easing, count-up, caps, stale drop, streaks
  'logic/guide.js',     // 놀거리 수첩: GUIDE table, open/locked, 새 marks, scene tips (s.guide)
  'logic/dex.js',       // 도감 counts and milestones (reads CROPS and FISH at load: keep after them)
  'logic/save.js'       // newState, resume, encode/decode: all save compatibility
];

const UI = [
  'ui/core.js',         // speed, clock, save load/store, DOM refs
  'ui/sprites.js',      // pixel helpers and sprite tables
  'ui/background.js',   // layout constants and the pre-rendered background
  'ui/hud.js',          // runtime UI state, toast, floating text, particles
  'ui/fx.js',           // stage 8 ④ 이펙트: hit-stop, splash, fly-to-basket, pops, coins, count-up, stamp, reduced motion
  'ui/tray.js',         // seed tray
  'ui/input.js',        // pointer/keys, tap dispatch, boss key
  'ui/farm.js',         // farm tap, tick and render
  'ui/pond.js',         // fishing flow, pond tap, tick and render, milestone decor
  // stage 2: new pond-side UI files go here
  'ui/spots.js',        // 낚시터: fish art, river/sea water motion, signpost, switching spots
  'ui/seasons.js',      // stage 4: seasonal crop/fish art, ground touches, frozen pond (얼음낚시)
  'ui/weather.js',      // sky effects, night tint, corner clock indicator, FF sky hooks
  'ui/calendar.js',     // 달력 panel (today / 낚시터)
  'ui/dex.js',          // 도감 panel, settings, milestone toasts
  'ui/shop.js',         // 상점 panel
  'ui/basket.js',       // 바구니·주문·냄비 panel and the basket corner on the map
  // stage 3: new yard/house/animal UI files go here
  'ui/yard.js',         // 마당 scene: house, pots, animals, decorations, scene switch, tick/draw/tap hooks
  'ui/visitors.js',     // visitor art, positions and taps; merchant/letter sheet
  'ui/house.js',        // 집 안: furniture, 어탁, trophies; 상점 마당·집 rows; extra pots in 냄비 tab
  'ui/guide.js',        // 도감 놀거리 tab, first-visit scene tips, FF.guide (before records.js: its dexBtn click runs first)
  'ui/records.js',      // 도감 기록 tab: secrets with hints, visitors met, letters
  // stage 4
  'ui/residents.js',    // 주민 tab in the 바구니 panel, gift-recipe dish art
  'ui/aquarium.js',     // 수족관 in the house + its sheet
  'ui/shed.js',         // 창고 sheet (from the 바구니 panel)
  'ui/market.js',       // 장터 시세판 sheet (from the 바구니 panel): ▲▼, sparkline
  'ui/bank.js',         // 은행 sheet (from the 바구니 panel)
  'ui/daily.js',        // 오늘의 할 일 + 농장 N년차 in the 달력, daily tick
  'ui/share.js',        // 도감 친구 tab: my record code, friend comparison
  // stage 5A
  'ui/forest.js',       // 숲 scene, forage art, 도전 gauge overlay (채집·수확), 도감 채집 section, 달력 entries
  'ui/pets.js',         // 반려동물: art, follow/idle per scene, petting, gifts, adoption + name sheet
  // stage 5B
  'ui/junk.js',         // 잡동사니 catch card, 고물 상자 sheet, 병 편지 in 기록, 도전 overlay (자물쇠 / 불 조절)
  'ui/festivals.js',    // 축제 chip + sheet, festival sky, new decoration art, 달력 축제 rows, pot 도전 button
  // stage 6A
  'ui/orchard.js',      // 과수원 scene: trees, fruit, beehives, sapling sheet, fruit/honey icons
  'ui/bugs.js',         // 곤충: flying insect + catch, catch card, 표본 상자 art, 도감/달력/상점 rows, FF.orchard/bees/bug
  // stage 6B
  'ui/village.js',     // 마을 street + resident rooms, visit sheet (대화·선물·심부름·이야기), 지금 할 일 bar
  // stage 7 ① 갯벌·사진기
  'ui/flat.js',         // 갯벌 scene, tides, dig + 도전, tide tag, 도감/달력 rows, FF.flat/tide/flatFind
  'ui/camera.js',       // 사진기 corner button, flash, 도감 앨범, 상점 row, FF.camera/shots
  // stage 7 동굴·별
  'ui/cave.js',         // 동굴 scene, wall/ore/gem art, 도전 hook, 도감 광물·화석, 상점 곡괭이·만들기, FF.cave
  'ui/sky.js',          // 망원경 in the 마당, 별 잇기 panel, 유성우 + wishes, 도감 별자리, 달력 유성우, FF.sky
  // stage 7 섬
  'ui/island.js',       // 섬 scene: old boat, drift, palm, lighthouse + keeper, boat/등대 sheets, 섬 fish art, 도감/달력 rows
  // stage 7 박물관
  'ui/museum.js',       // 박물관 building in the 마을, rooms with wall cases, curator, donate sheet, 도감 line, FF.museum
  // stage 8 ② 손맛
  'ui/temper.js',       // reel cues per 물고기 성격, boss phase signal, 어탁 wall row, FF.temper/records/hookFish
  // stage 8 ① 변동성·일기
  'ui/events.js',       // 입질 폭풍/대풍년 chip, 오늘의 날 card + 달력 row, 일기 card + 기록 rows, FF.boom/day/diary
  // stage 8 ③ 소문·보물 지도
  'ui/treasure.js',     // map pictures, piece/rumor toasts, 꾹 눌러 파기, 기록 보물 지도 + 소문 수첩, FF.tmap/rumor/dig
  // stage 9 ② 당나귀
  'ui/donkey.js',       // 당나귀 art, 마당 spot + sheet, 상점 row, 깊은 숲·산꼭대기 scenes, FF.donkey/ride
  // stage 9 ① 배·먼바다
  'ui/ship.js',         // 배 sheet (갈 곳 + 업그레이드), 먼바다·난바다 끌낚시 water, 먼 섬 scene, new fish/drift art, 도감 rows, FF.ship/far
  // stage 9 ③ 자전거·열기구·썰매
  'ui/ride.js',         // ride overlay (자전거·썰매·열기구), 마을 언덕, 납품 「자전거로」, 상점 자전거, 도감 하늘 도감, FF.ride
  // stage 10 ④ 날씨 장난감·계절 챌린지
  'ui/toys.js',         // puddles, footprints, leaf piles on empty ground (밭·마당·숲), FF.toy
  'ui/quest.js',        // season card at season start, 달력 챌린지 rows, reward decoration art, FF.quest
  // stage 10 ② 꽃 교배·새끼·허수아비
  'ui/garden.js',       // 꽃밭 sheet + bed art, 새끼 art/sheet, 허수아비 옷 sheet + art, 상점/도감 rows, FF.garden/baby/scare
  // stage 10 ① 낚시 대회·결산 카드·간판
  'ui/contest.js',      // 낚시 대회 cards/달력/박 영감 row/trophy art, 결산 카드 sheet + PNG, 농장 간판, FF.contest/year
  // stage 10 ③ 주민들의 하루·새 주민
  'ui/town.js',         // people out at street places, 새 주민 cottages + rooms + faces, arrival toast, FF.town
  // stage 11 ① 옛 포구
  'ui/port.js',         // 옛 포구 scene, 끊긴 다리 sign in the 마을, bundle sheet, granny, fix dust + name plate, FF.port
  // stage 11 ② 어판장 경매·떠돌이 상인
  'ui/auction.js',      // 경매 sign + sheet, train + 상인 sheet on the port scene, 달력 경매 row, port deco art, FF.auction
  // stage 12 ③ 잠수 탐험
  'ui/dive.js',         // dive scene: swim by tap, rooms, oxygen, take/see things, 포구 marker + 잠수 sheet, FF.dive
  'ui/divemap.js',      // minimap overlay, 해저 도감 rows, dive thing art and basket icons
  // 게임장
  'ui/arcade.js',       // 게임장 building on the 마을 street, game overlay (고르기·내기·4 games), FF.arcade
  // 내 가게
  'ui/myshop.js',       // 내 가게 building on the 마을 upper lane (빈 가게 터 sign first), shop sheet, FF.myshop
  // 기차 여행
  'ui/train.js',        // 마을 간이역 + station sheet, 포구 기차역 ride entry, ride scene, 산골 계곡 view, souvenir art, FF.train
  // 가공 공방
  'ui/craft.js',        // 공방 building in the 마당 (공방 터 sign first), machine sheet, goods icons, 도감 rows, FF.craft
  // 캠핑
  'ui/camp.js',         // 숲 캠핑장 sign, camp view (fire glow, grill, tent, gear, guests), camp/도장 수첩 sheets, food icons, 도감 rows, FF.camp
  'ui/loop.js',         // title badge, logic tick, frame, rAF loop, fit
  'ui/pip.js',          // Document Picture-in-Picture
  'ui/fold.js',         // 도감/상점 section headings fold and unfold
  'ui/boot.js'          // boot sequence and console hooks (keep last)
];

function join(list) {
  return list.map(function (f) { return fs.readFileSync(path.join(SRC, f), 'utf8'); }).join('');
}

function build() {
  const parts = { '/*@style*/\n': join(STYLE), '<!--@body-->\n': join(BODY), '/*@logic*/\n': join(LOGIC), '/*@ui*/\n': join(UI) };
  let html = fs.readFileSync(path.join(SRC, 'page.html'), 'utf8');
  Object.keys(parts).forEach(function (mark) {
    if (html.split(mark).length !== 2) throw new Error('page.html needs exactly one ' + mark.trim());
    html = html.split(mark).join(parts[mark]);   // split/join: no $-patterns from String.replace
  });
  return html;
}

module.exports = { build: build, STYLE: STYLE, BODY: BODY, LOGIC: LOGIC, UI: UI };

if (require.main === module) {
  const out = path.join(__dirname, 'index.html');
  fs.writeFileSync(out, build());
  console.log('wrote ' + path.relative(process.cwd(), out));
}
