// build.js — joins src/ into the single self-contained index.html.
// Usage: node build.js   (no dependencies; same sources always give the same bytes)
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
  'festival.css'        // 축제 chip, 도전 overlay (자물쇠 / 불 조절)
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
  'logic/dex.js',       // 도감 counts and milestones (reads CROPS and FISH at load: keep after them)
  'logic/save.js'       // newState, resume, encode/decode: all save compatibility
];

const UI = [
  'ui/core.js',         // speed, clock, save load/store, DOM refs
  'ui/sprites.js',      // pixel helpers and sprite tables
  'ui/background.js',   // layout constants and the pre-rendered background
  'ui/hud.js',          // runtime UI state, toast, floating text, particles
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
  'ui/records.js',      // 도감 기록 tab: secrets with hints, visitors met, letters
  // stage 4
  'ui/residents.js',    // 주민 tab in the 바구니 panel, gift-recipe dish art
  'ui/aquarium.js',     // 수족관 in the house + its sheet
  'ui/daily.js',        // 오늘의 할 일 + 농장 N년차 in the 달력, daily tick
  'ui/share.js',        // 도감 친구 tab: my record code, friend comparison
  // stage 5A
  'ui/forest.js',       // 숲 scene, forage art, 도전 gauge overlay (채집·수확), 도감 채집 section, 달력 entries
  'ui/pets.js',         // 반려동물: art, follow/idle per scene, petting, gifts, adoption + name sheet
  // stage 5B
  'ui/junk.js',         // 잡동사니 catch card, 고물 상자 sheet, 병 편지 in 기록, 도전 overlay (자물쇠 / 불 조절)
  'ui/festivals.js',    // 축제 chip + sheet, festival sky, new decoration art, 달력 축제 rows, pot 도전 button
  'ui/loop.js',         // title badge, logic tick, frame, rAF loop, fit
  'ui/pip.js',          // Document Picture-in-Picture
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
