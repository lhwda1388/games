// 네뷸라 워 — 수치 테이블 (2단계 풀 로스터). 시간은 tick(20/s), 속도는 px/tick, 사거리는 px, 시야는 타일.
// 체력·보호막·공격력·비용은 자체 기준(채집 1회 10에 맞춘 규모). 사거리는 px(타일 = 32px), 속도는 0.25 단위.
// weapon: { dmg, type, range, cooldown, air?(공중 공격), ground?(기본 true), splash?, bounce?, suicide?, upgrade?: categoryId, perLevel?(단계당 +dmg, 기본은 업그레이드 dmgPerLevel) }
// 두 무기면 weapon = 지상, weapon2 = 공중. summoned = 마법 소환 전용(생산 불가; 허스크·스폰링·시커), morphFrom/mergeFrom = 변태·합체로만 얻음. spellOnly = 2단계엔 공격 없음.
// ── 맵 바위 생성 도우미 ── 결과는 항상 정수 사각형 [tx,ty,w,h] 목록. 맵 크기 W×H(기본 128×128), 180도 점대칭 (x,y)→(W-1-x,H-1-y).
// symRocks: 한쪽 절반의 사각형 목록에 180도 거울 사본을 덧붙인다.
const symRocks = (list, W = 128, H = 128) => list.concat(list.map(([x, y, w, h]) => [W - x - w, H - y - h, w, h]));
// quadRocks: 4인 맵용 — 원본 + x거울 + y거울 + 둘 다(가로·세로 거울 대칭).
const quadRocks = (list, W = 128, H = 128) => [0, 1, 2, 3].flatMap(f => list.map(([x, y, w, h]) => [f & 1 ? W - x - w : x, f & 2 ? H - y - h : y, w, h]));
// rocksFrom: 타일 술어 pred(x,y)가 참인 타일(또는 그 점대칭 타일)을 행 단위 가로 줄 사각형으로 만든다. quad면 네 거울 중 하나라도 참.
const rocksFrom = (pred, W = 128, H = 128, quad = false) => {
  const out = [], q = (x, y) => pred(x, y) || pred(W - 1 - x, H - 1 - y) || (quad && (pred(W - 1 - x, y) || pred(x, H - 1 - y)));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!q(x, y)) continue;
      let w = 1;
      while (x + w < W && q(x + w, y)) w++;
      out.push([x, y, w, 1]); x += w;
    }
  return out;
};
// quad: 확장 사이트 하나를 네 거울 묶음(flip 0·3·1·2, 시작 순서와 같음)으로.
const quad = e => [0, 3, 1, 2].map(flip => ({ ...e, flip }));
// gridRocks: 31×31 칸 문자 격자('#' 바위, '.' 길)를 사각형으로. 칸 하나는 4타일, 둘레 2타일은 바위 테두리. 128×128 전용.
const gridRocks = rows => {
  const out = [[0, 0, 128, 2], [0, 126, 128, 2], [0, 2, 2, 124], [126, 2, 2, 124]];
  rows.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      if (row[c] !== '#') continue;
      let w = 1;
      while (row[c + w] === '#') w++;
      out.push([2 + 4 * c, 2 + 4 * r, 4 * w, 4]); c += w;
    }
  });
  return out;
};
const NW_DATA = {
  DMG_MULT: { // [type][size] 퍼센트
    normal:     { small: 100, medium: 100, large: 100 },
    concussive: { small: 100, medium: 60,  large: 30 },
    explosive:  { small: 60,  medium: 80,  large: 100 },
  },
  races: {
    legion:  { name: '리벳',   worker: 'engineer', base: 'hq',      start: ['engineer', 'engineer', 'engineer', 'engineer'] },
    swarm:   { name: '마이셀',     worker: 'drudge',   base: 'nest',    start: ['drudge', 'drudge', 'drudge', 'drudge', 'bloater'],
               mutation: { at: [3, 8], armor: [1, 2], regen2: 2 }, killLarva: 1 }, // 변이 누적(처치 3/8 → 방어 +1/+2, 2단계 회복 ×2) · 적 유닛 처치 시 가까운 균핵 유충 +1
    elysian: { name: '코러스', worker: 'shaper',   base: 'sanctum', start: ['shaper', 'shaper', 'shaper', 'shaper'],
               resonance: { r: 4, cap: 4, per: 2 } }, // 공명 재생: 반경 4타일 같은 종류 n(최대 4) → 20틱마다 결정막 +floor(n/2)(전투 중에도)
  },
  categories: {
    legion_infantry_weapons: { name: '보병 무기',     race: 'legion' },
    legion_infantry_armor:   { name: '보병 장갑',     race: 'legion' },
    legion_vehicle_weapons:  { name: '차량 무기',     race: 'legion' },
    legion_vehicle_plating:  { name: '차량 장갑',     race: 'legion' },
    legion_ship_weapons:     { name: '함선 무기',     race: 'legion' },
    legion_ship_plating:     { name: '함선 장갑',     race: 'legion' },
    swarm_melee:             { name: '근접 공격',     race: 'swarm' },
    swarm_missile:           { name: '원거리 공격',   race: 'swarm' },
    swarm_carapace:          { name: '지상 갑피',     race: 'swarm' },
    swarm_flyer_attacks:     { name: '비행 공격',     race: 'swarm' },
    swarm_flyer_carapace:    { name: '비행 갑피',     race: 'swarm' },
    elysian_ground_weapons:  { name: '지상 무기',     race: 'elysian' },
    elysian_ground_armor:    { name: '지상 갑옷',     race: 'elysian' },
    elysian_air_weapons:     { name: '공중 무기',     race: 'elysian' },
    elysian_air_armor:       { name: '공중 장갑',     race: 'elysian' },
  },
  units: {
    // ── 레기온 ──
    engineer:  { name: '리베터',   race: 'legion',  hp: 75,  armor: 0, size: 'small', speed: 3.5, radius: 8,  sight: 7, worker: true, armorUpgrade: 'legion_infantry_armor',
                 weapon: { dmg: 6, type: 'normal', range: 10, cooldown: 15 }, cost: { crystal: 65 }, supply: 1, time: 260 },
    trooper:   { name: '데커',     race: 'legion',  hp: 50,  armor: 0, size: 'small', speed: 3,   radius: 8,  sight: 7, armorUpgrade: 'legion_infantry_armor',
                 weapon: { dmg: 8, type: 'normal', range: 128, cooldown: 15, air: true, upgrade: 'legion_infantry_weapons' }, cost: { crystal: 70 }, supply: 1, time: 300, requires: ['garrison'] },
    scorcher:  { name: '스코처',     race: 'legion',  hp: 65,  armor: 1, size: 'small', speed: 3,   radius: 8,  sight: 7, armorUpgrade: 'legion_infantry_armor',
                 weapon: { dmg: 20, type: 'concussive', range: 32, cooldown: 22, splash: 20, upgrade: 'legion_infantry_weapons', perLevel: 3 },
                 cost: { crystal: 65, nebula: 30 }, supply: 1, time: 240, requires: ['drillhall'] },
    corpsman:  { name: '메딕',   race: 'legion',  hp: 75,  armor: 1, size: 'small', speed: 3,   radius: 8,  sight: 9, armorUpgrade: 'legion_infantry_armor', spellOnly: true,
                 energy: { max: 200, start: 50 }, abilities: ['heal', 'smoke'],
                 cost: { crystal: 65, nebula: 30 }, supply: 1, time: 300, requires: ['drillhall'] },
    shade:     { name: '스포터',     race: 'legion',  hp: 55,  armor: 0, size: 'small', speed: 3,   radius: 8,  sight: 9, armorUpgrade: 'legion_infantry_armor',
                 weapon: { dmg: 13, type: 'concussive', range: 224, cooldown: 22, air: true, upgrade: 'legion_infantry_weapons' },
                 energy: { max: 200, start: 50 }, abilities: ['optcloak', 'mark', 'discharge'],
                 cost: { crystal: 30, nebula: 95 }, supply: 1, time: 500, requires: ['drillhall', 'intel'] },
    hound:     { name: '스키드',     race: 'legion',  hp: 100,  armor: 0, size: 'medium', speed: 4.75, radius: 11, sight: 8, armorUpgrade: 'legion_vehicle_plating',
                 weapon: { dmg: 25, type: 'concussive', range: 160, cooldown: 30, upgrade: 'legion_vehicle_weapons', perLevel: 3 },
                 abilities: ['seeker'], // 마나 없음 — 비용 0·쿨다운 400
                 cost: { crystal: 95 }, supply: 2, time: 300 },
    bastion:   { name: '앵커',     race: 'legion',  hp: 190, armor: 1, size: 'large', speed: 3,   radius: 15, sight: 10, armorUpgrade: 'legion_vehicle_plating',
                 weapon: { dmg: 38, type: 'explosive', range: 224, cooldown: 37, upgrade: 'legion_vehicle_weapons', perLevel: 4 },
                 modes: { siege: { time: 60, auto: true, weapon: { dmg: 80, type: 'explosive', range: 384, cooldown: 75, splash: 40, upgrade: 'legion_vehicle_weapons', perLevel: 6 } } },
                 cost: { crystal: 190, nebula: 125 }, supply: 2, time: 500, requires: ['garage'] },
    strider:   { name: '갠트리', race: 'legion',  hp: 135, armor: 1, size: 'large', speed: 3.5, radius: 14, sight: 8, armorUpgrade: 'legion_vehicle_plating',
                 weapon:  { dmg: 15, type: 'normal',    range: 160, cooldown: 22, upgrade: 'legion_vehicle_weapons' },
                 weapon2: { dmg: 25, type: 'explosive', range: 160, cooldown: 22, air: true, ground: false, upgrade: 'legion_vehicle_weapons', perLevel: 5 },
                 cost: { crystal: 125, nebula: 65 }, supply: 2, time: 400, requires: ['arsenal'] },
    phantom:   { name: '버저',       race: 'legion',  hp: 150, armor: 0, size: 'large', speed: 5,   radius: 16, sight: 7, air: true, armorUpgrade: 'legion_ship_plating',
                 weapon:  { dmg: 10,  type: 'normal',    range: 160, cooldown: 30, upgrade: 'legion_ship_weapons' },
                 weapon2: { dmg: 25, type: 'explosive', range: 160, cooldown: 22, air: true, ground: false, upgrade: 'legion_ship_weapons', perLevel: 3 },
                 cost: { crystal: 190, nebula: 125 }, supply: 2, time: 600 },
    ferry:     { name: '카고',       race: 'legion',  hp: 190, armor: 1, size: 'large', speed: 4,   radius: 18, sight: 8, air: true, armorUpgrade: 'legion_ship_plating', spellOnly: true, transport: 8,
                 cost: { crystal: 125, nebula: 125 }, supply: 2, time: 500, requires: ['tower'] },
    surveyor:  { name: '터그',   race: 'legion',  hp: 250, armor: 1, size: 'large', speed: 3.75, radius: 20, sight: 10, air: true, armorUpgrade: 'legion_ship_plating', spellOnly: true, detector: true,
                 energy: { max: 200, start: 50 }, abilities: ['cleanse', 'tow'],
                 cost: { crystal: 125, nebula: 280 }, supply: 2, time: 800, requires: ['tower', 'labs'] },
    lancer:    { name: '하푼',       race: 'legion',  hp: 250, armor: 2, size: 'large', speed: 5,   radius: 18, sight: 8, air: true, armorUpgrade: 'legion_ship_plating',
                 weapon: { dmg: 60, type: 'explosive', range: 192, cooldown: 64, air: true, ground: false, splash: 32, upgrade: 'legion_ship_weapons', perLevel: 10 },
                 cost: { crystal: 315, nebula: 155 }, supply: 3, time: 500, requires: ['tower', 'arsenal'] },
    dreadnought: { name: '레비아탄', race: 'legion', hp: 625, armor: 3, size: 'large', speed: 2.5, radius: 24, sight: 11, air: true, armorUpgrade: 'legion_ship_plating',
                 energy: { max: 200, start: 50 }, abilities: ['repairdrones'],
                 weapon:  { dmg: 31, type: 'normal', range: 192, cooldown: 30, upgrade: 'legion_ship_weapons', perLevel: 4 },
                 weapon2: { dmg: 31, type: 'normal', range: 192, cooldown: 30, air: true, ground: false, upgrade: 'legion_ship_weapons', perLevel: 4 },
                 cost: { crystal: 500, nebula: 375 }, supply: 6, time: 1340, requires: ['tower', 'gravlab'] },
    seeker:    { name: '시커', race: 'legion',  hp: 20,  armor: 0, size: 'small', speed: 6,   radius: 4,  sight: 5, summoned: true,
                 weapon: { dmg: 40, type: 'normal', range: 4, cooldown: 1, splash: 16, suicide: true },
                 cost: { crystal: 0 }, supply: 0, time: 20 },

    // ── 스웜 ── (생산은 nest/grandnest/apexnest 유충)
    drudge:    { name: '드러지',     race: 'swarm',   hp: 50,  armor: 0, size: 'small', speed: 3.5, radius: 8,  sight: 7, worker: true, armorUpgrade: 'swarm_carapace', modes: { burrow: { time: 10, requires: 'swarm_burrow', cloak: true } },
                 weapon: { dmg: 6, type: 'normal', range: 10, cooldown: 22 }, cost: { crystal: 65 }, supply: 1, time: 260 },
    bloater:   { name: '블로터',     race: 'swarm',   hp: 250, armor: 0, size: 'large', speed: 1,   radius: 14, sight: 9, air: true, armorUpgrade: 'swarm_flyer_carapace', detector: true, detectReq: 'swarm_bloater_detect', transport: 8, transportReq: 'swarm_bloater_transport',
                 cost: { crystal: 125 }, supply: 0, provides: 8, time: 500 },
    skitter:   { name: '스키터',     race: 'swarm',   hp: 45,  armor: 0, size: 'small', speed: 4.5, radius: 7,  sight: 5, count: 2, armorUpgrade: 'swarm_carapace', modes: { burrow: { time: 10, requires: 'swarm_burrow', cloak: true } },
                 weapon: { dmg: 6, type: 'normal', range: 10, cooldown: 8, upgrade: 'swarm_melee' }, cost: { crystal: 65 }, supply: 0.5, time: 300, requires: ['vat'] },
    spinewyrm: { name: '스파인웜',   race: 'swarm',   hp: 100,  armor: 0, size: 'medium', speed: 2.75, radius: 10, sight: 6, armorUpgrade: 'swarm_carapace', modes: { burrow: { time: 10, requires: 'swarm_burrow', cloak: true } },
                 weapon: { dmg: 13, type: 'explosive', range: 128, cooldown: 15, air: true, upgrade: 'swarm_missile' },
                 cost: { crystal: 95, nebula: 30 }, supply: 1, time: 280, requires: ['wyrmpit'] },
    trencher:  { name: '트렌처',     race: 'swarm',   hp: 155, armor: 1, size: 'large', speed: 4.5, radius: 14, sight: 8, armorUpgrade: 'swarm_carapace', morphFrom: 'spinewyrm',
                 modes: { burrow: { time: 10, cloak: true, weapon: { dmg: 25, type: 'normal', range: 192, cooldown: 37, splash: 20, upgrade: 'swarm_missile', perLevel: 3 } } },
                 cost: { crystal: 65, nebula: 125 }, supply: 2, time: 400, requires: ['wyrmpit'] },
    wingsting: { name: '윙스팅',     race: 'swarm',   hp: 150, armor: 0, size: 'small', speed: 5,   radius: 12, sight: 7, air: true, armorUpgrade: 'swarm_flyer_carapace',
                 weapon: { dmg: 11, type: 'normal', range: 96, cooldown: 30, air: true, bounce: 2, upgrade: 'swarm_flyer_attacks' },
                 cost: { crystal: 125, nebula: 125 }, supply: 2, time: 400, requires: ['roost'] },
    siegemaw:  { name: '시즈모',     race: 'swarm',   hp: 190, armor: 2, size: 'large', speed: 2,   radius: 18, sight: 11, air: true, armorUpgrade: 'swarm_flyer_carapace', morphFrom: 'wingsting',
                 weapon: { dmg: 25, type: 'normal', range: 256, cooldown: 30, upgrade: 'swarm_flyer_attacks', perLevel: 3 },
                 cost: { crystal: 65, nebula: 125 }, supply: 2, time: 400, requires: ['greatroost'] },
    acidwing:  { name: '애시드윙',   race: 'swarm',   hp: 315, armor: 2, size: 'large', speed: 3.75, radius: 18, sight: 10, air: true, armorUpgrade: 'swarm_flyer_carapace', morphFrom: 'wingsting',
                 weapon: { dmg: 31, type: 'explosive', range: 192, cooldown: 100, air: true, ground: false, upgrade: 'swarm_flyer_attacks', perLevel: 3 },
                 cost: { crystal: 190, nebula: 65 }, supply: 2, time: 400, requires: ['greatroost'] },
    burster:   { name: '버스터',     race: 'swarm',   hp: 30,  armor: 0, size: 'small', speed: 5,   radius: 6,  sight: 5, air: true, count: 2, armorUpgrade: 'swarm_flyer_carapace',
                 weapon: { dmg: 138, type: 'normal', range: 4, cooldown: 1, air: true, ground: false, suicide: true },
                 cost: { crystal: 30, nebula: 95 }, supply: 0.5, time: 300, requires: ['roost'] },
    matron:    { name: '매트런',     race: 'swarm',   hp: 150, armor: 0, size: 'medium', speed: 5,  radius: 14, sight: 10, air: true, armorUpgrade: 'swarm_flyer_carapace', spellOnly: true,
                 energy: { max: 200, start: 50 }, abilities: ['spores', 'mat'],
                 cost: { crystal: 125, nebula: 125 }, supply: 2, time: 500, requires: ['matronden'] },
    husk:      { name: '허스크',     race: 'swarm',   hp: 75,  armor: 0, size: 'small', speed: 4.5, radius: 8,  sight: 5, armorUpgrade: 'swarm_carapace', summoned: true,
                 weapon: { dmg: 625, type: 'explosive', range: 4, cooldown: 1, splash: 48, suicide: true },
                 cost: { crystal: 0 }, supply: 1, time: 400 },
    blighter:  { name: '블라이터',   race: 'swarm',   hp: 100,  armor: 1, size: 'medium', speed: 3,  radius: 11, sight: 10, armorUpgrade: 'swarm_carapace', spellOnly: true, modes: { burrow: { time: 10, requires: 'swarm_burrow', cloak: true } },
                 energy: { max: 200, start: 50 }, abilities: ['rot', 'sprout'],
                 cost: { crystal: 65, nebula: 190 }, supply: 2, time: 500, requires: ['blightmound'] },
    behemoth:  { name: '베히모스',   race: 'swarm',   hp: 500, armor: 1, size: 'large', speed: 3.75, radius: 18, sight: 7, armorUpgrade: 'swarm_carapace',
                 weapon: { dmg: 25, type: 'normal', range: 16, cooldown: 15, splash: 20, upgrade: 'swarm_melee', perLevel: 4 },
                 cost: { crystal: 250, nebula: 250 }, supply: 4, time: 600, requires: ['behemothcave'] },
    spawnling: { name: '스폰링',     race: 'swarm',   hp: 40,  armor: 0, size: 'small', speed: 4.5, radius: 7,  sight: 5, armorUpgrade: 'swarm_carapace', summoned: true,
                 weapon: { dmg: 5, type: 'normal', range: 10, cooldown: 15, upgrade: 'swarm_melee' },
                 cost: { crystal: 0 }, supply: 0, time: 20 },

    // ── 엘리시안 ──
    shaper:    { name: '튜너',     race: 'elysian', hp: 25,  shield: 25, armor: 0, size: 'small', speed: 3.5, radius: 8, sight: 8, worker: true, armorUpgrade: 'elysian_ground_armor',
                 weapon: { dmg: 6, type: 'normal', range: 10, cooldown: 22 }, cost: { crystal: 65 }, supply: 1, time: 260 },
    oathblade: { name: '오스블레이드', race: 'elysian', hp: 125, shield: 90, armor: 1, size: 'small', speed: 3, radius: 9, sight: 7, armorUpgrade: 'elysian_ground_armor',
                 weapon: { dmg: 20, type: 'normal', range: 14, cooldown: 22, upgrade: 'elysian_ground_weapons', perLevel: 3 }, cost: { crystal: 110 }, supply: 2, time: 600, requires: ['portal'] },
    arcwalker: { name: '아크워커',   race: 'elysian', hp: 125, shield: 100, armor: 1, size: 'large', speed: 4, radius: 14, sight: 8, armorUpgrade: 'elysian_ground_armor',
                 weapon: { dmg: 28, type: 'explosive', range: 128, cooldown: 30, air: true, upgrade: 'elysian_ground_weapons', perLevel: 3 },
                 cost: { crystal: 155, nebula: 65 }, supply: 2, time: 420, requires: ['synapse'] },
    sage:      { name: '캔터',     race: 'elysian', hp: 50,  shield: 50, armor: 0, size: 'small', speed: 2.5, radius: 8, sight: 7, armorUpgrade: 'elysian_ground_armor', spellOnly: true,
                 energy: { max: 200, start: 50 }, abilities: ['mindstorm', 'amplify'],
                 cost: { crystal: 65, nebula: 190 }, supply: 2, time: 500, requires: ['sagelibrary'] },
    umbra:     { name: '뮤트',     race: 'elysian', hp: 100,  shield: 50, armor: 1, size: 'small', speed: 3.75, radius: 9, sight: 7, armorUpgrade: 'elysian_ground_armor', cloaked: true,
                 weapon: { dmg: 50, type: 'normal', range: 14, cooldown: 30, upgrade: 'elysian_ground_weapons', perLevel: 4 },
                 cost: { crystal: 155, nebula: 125 }, supply: 2, time: 500, requires: ['sagelibrary'] },
    ascendant: { name: '하모닉',   race: 'elysian', hp: 15,  shield: 440, armor: 0, size: 'large', speed: 3.75, radius: 16, sight: 8, armorUpgrade: 'elysian_ground_armor', mergeFrom: 'sage',
                 weapon: { dmg: 38, type: 'normal', range: 64, cooldown: 20, air: true, splash: 20, upgrade: 'elysian_ground_weapons', perLevel: 4 },
                 cost: { crystal: 0 }, supply: 4, time: 200 },
    voidascendant: { name: '디스코드', race: 'elysian', hp: 30, shield: 250, armor: 1, size: 'large', speed: 3.75, radius: 16, sight: 10, armorUpgrade: 'elysian_ground_armor', mergeFrom: 'umbra',
                 energy: { max: 200, start: 50 }, abilities: ['stasis', 'crystallize'],
                 cost: { crystal: 0 }, supply: 4, time: 200 },
    crucible:  { name: '크루시블',   race: 'elysian', hp: 125, shield: 100, armor: 0, size: 'large', speed: 1.25, radius: 16, sight: 10, armorUpgrade: 'elysian_ground_armor',
                 launcher: { child: 'shard', max: 5, build: 70, cost: { crystal: 20 }, range: 256 },
                 cost: { crystal: 250, nebula: 125 }, supply: 4, time: 700, requires: ['assemblybay'] },
    shard:     { name: '샤드',     race: 'elysian', hp: 25,  armor: 0, size: 'small', speed: 6, radius: 4, sight: 5,
                 weapon: { dmg: 125, type: 'normal', range: 4, cooldown: 1, splash: 48, suicide: true },
                 cost: { crystal: 20 }, supply: 0, time: 70 },
    skiff:     { name: '스키프',     race: 'elysian', hp: 100,  shield: 75, armor: 1, size: 'large', speed: 3.25, radius: 18, sight: 8, air: true, armorUpgrade: 'elysian_air_armor', spellOnly: true, transport: 8,
                 cost: { crystal: 250 }, supply: 2, time: 600 },
    watcher:   { name: '리스너',       race: 'elysian', hp: 50,  shield: 25, armor: 0, size: 'small', speed: 2.5, radius: 8, sight: 9, air: true, armorUpgrade: 'elysian_air_armor', spellOnly: true, cloaked: true, detector: true,
                 energy: { max: 200, start: 50 }, abilities: ['echo'],
                 cost: { crystal: 30, nebula: 95 }, supply: 1, time: 400, requires: ['lookout'] },
    sentinel:  { name: '센티넬',     race: 'elysian', hp: 190, shield: 125, armor: 0, size: 'large', speed: 3.75, radius: 16, sight: 8, air: true, armorUpgrade: 'elysian_air_armor',
                 weapon:  { dmg: 20,  type: 'normal',    range: 128, cooldown: 30, upgrade: 'elysian_air_weapons' },
                 weapon2: { dmg: 35, type: 'explosive', range: 128, cooldown: 22, air: true, ground: false, upgrade: 'elysian_air_weapons', perLevel: 3 },
                 cost: { crystal: 290, nebula: 130 }, supply: 3, time: 640 },
    skimmer:   { name: '스키머',     race: 'elysian', hp: 125, shield: 100, armor: 1, size: 'medium', speed: 5, radius: 14, sight: 9, air: true, armorUpgrade: 'elysian_air_armor',
                 weapon: { dmg: 6, type: 'explosive', range: 160, cooldown: 8, air: true, ground: false, splash: 16, upgrade: 'elysian_air_weapons' },
                 weapon2: { dmg: 5, type: 'normal', range: 128, cooldown: 22, upgrade: 'elysian_air_weapons' }, // 약한 대지 사격(함대 끝내기용)
                 energy: { max: 200, start: 50 }, abilities: ['probe'],
                 cost: { crystal: 190, nebula: 125 }, supply: 2, time: 400 },
    ark:       { name: '앤섬',       race: 'elysian', hp: 375, shield: 190, armor: 4, size: 'large', speed: 2.5, radius: 24, sight: 11, air: true, armorUpgrade: 'elysian_air_armor',
                 launcher: { child: 'spark', max: 8, build: 200, cost: { crystal: 30 }, range: 256 },
                 cost: { crystal: 440, nebula: 315 }, supply: 6, time: 1400, requires: ['fleetspire'] },
    spark:     { name: '스파크',     race: 'elysian', hp: 50,  shield: 50, armor: 0, size: 'small', speed: 10, radius: 5, sight: 6, air: true, armorUpgrade: 'elysian_air_armor',
                 weapon: { dmg: 8, type: 'normal', range: 128, cooldown: 22, air: true, upgrade: 'elysian_air_weapons' },
                 cost: { crystal: 30 }, supply: 0, time: 200 },
    warden:    { name: '컨덕터',       race: 'elysian', hp: 250, shield: 190, armor: 1, size: 'large', speed: 3.75, radius: 20, sight: 9, air: true, armorUpgrade: 'elysian_air_armor', spellOnly: true,
                 energy: { max: 200, start: 50 }, abilities: ['prism', 'chorus'],
                 cost: { crystal: 125, nebula: 440 }, supply: 4, time: 1600, requires: ['wardencourt'] },
  },
  buildings: {
    // ── 중립 ──
    vent:      { name: '가스 분출구', neutral: true, hp: 1, armor: 0, w: 2, h: 2, sight: 0, amount: 6250 },

    // ── 레기온 ── (addonOf = 부속, lift = 띄우기)
    hq:        { name: '도크', race: 'legion',  hp: 1875, armor: 1, w: 4, h: 3, sight: 10, cost: { crystal: 500 }, time: 1500, provides: 10, dropoff: true, trains: ['engineer'], lift: true },
    uplink:    { name: '중계 안테나', race: 'legion', hp: 625, armor: 1, w: 2, h: 2, sight: 8, cost: { crystal: 65, nebula: 65 }, time: 600, addonOf: 'hq', requires: ['drillhall'],
                 energy: { max: 200, start: 50 }, abilities: ['scan'] },
    silo:      { name: '투하 크레인', race: 'legion', hp: 750, armor: 1, w: 2, h: 2, sight: 8, cost: { crystal: 125, nebula: 125 }, time: 600, addonOf: 'hq', requires: ['intel'],
                 energy: { max: 200, start: 50 }, abilities: ['junkdrop'] },
    depot:     { name: '야적장', race: 'legion',  hp: 625,  armor: 1, w: 3, h: 2, sight: 8,  cost: { crystal: 125 }, time: 600,  provides: 8 },
    pump:      { name: '가스 펌프', race: 'legion', hp: 940, armor: 1, w: 2, h: 2, sight: 8, cost: { crystal: 125 }, time: 600, onVent: true },
    garrison:  { name: '선원 막사',   race: 'legion',  hp: 1250, armor: 1, w: 4, h: 3, sight: 8,  cost: { crystal: 190 }, time: 1200, trains: ['trooper', 'scorcher', 'corpsman', 'shade'], requires: ['hq'], lift: true },
    workshop:  { name: '선반소', race: 'legion', hp: 1065, armor: 1, w: 4, h: 3, sight: 8, cost: { crystal: 155 }, time: 900, requires: ['hq'], lift: true,
                 researches: ['legion_infantry_weapons', 'legion_infantry_armor'] },
    drillhall: { name: '정비 학교', race: 'legion',  hp: 750,  armor: 1, w: 3, h: 2, sight: 8,  cost: { crystal: 190 }, time: 1200, requires: ['garrison'], researches: ['legion_trooper_range', 'legion_smoke'] },
    pillbox:   { name: '컨테이너 진지', race: 'legion',  hp: 440,  armor: 1, w: 3, h: 2, sight: 9,  cost: { crystal: 125 }, time: 450, requires: ['garrison'],
                 weapon: { dmg: 15, type: 'normal', range: 160, cooldown: 15, air: true } },
    flak:      { name: '대공 기관포', race: 'legion', hp: 250, armor: 0, w: 2, h: 2, sight: 11, cost: { crystal: 95 }, time: 450, requires: ['workshop'], detector: true,
                 weapon: { dmg: 25, type: 'explosive', range: 224, cooldown: 15, air: true, ground: false } },
    motorpool: { name: '조립장', race: 'legion', hp: 1565, armor: 1, w: 4, h: 3, sight: 8, cost: { crystal: 250, nebula: 125 }, time: 1200, requires: ['garrison'], lift: true,
                 trains: ['hound', 'bastion', 'strider'] },
    garage:    { name: '개조 거치대', race: 'legion',  hp: 940,  armor: 1, w: 2, h: 2, sight: 8,  cost: { crystal: 65, nebula: 65 }, time: 600, addonOf: 'motorpool',
                 researches: ['legion_hound_speed', 'legion_strider_range', 'legion_hound_drones'] },
    arsenal:   { name: '제련소', race: 'legion',  hp: 940,  armor: 1, w: 3, h: 2, sight: 8,  cost: { crystal: 125, nebula: 65 }, time: 1200, requires: ['motorpool'],
                 researches: ['legion_vehicle_weapons', 'legion_vehicle_plating', 'legion_ship_weapons', 'legion_ship_plating'] },
    airfield:  { name: '발진 갑판', race: 'legion',  hp: 1625, armor: 1, w: 4, h: 3, sight: 8,  cost: { crystal: 190, nebula: 125 }, time: 1050, requires: ['motorpool'], lift: true,
                 trains: ['phantom', 'ferry', 'surveyor', 'lancer', 'dreadnought'] },
    tower:     { name: '신호탑', race: 'legion',  hp: 625,  armor: 1, w: 2, h: 2, sight: 8,  cost: { crystal: 65, nebula: 65 }, time: 600, addonOf: 'airfield' },
    labs:      { name: '해체 연구소', race: 'legion', hp: 1065, armor: 1, w: 4, h: 3, sight: 8, cost: { crystal: 125, nebula: 190 }, time: 900, requires: ['airfield'], lift: true, researches: ['legion_tow'] },
    intel:     { name: '위장 공방', race: 'legion',  hp: 940,  armor: 1, w: 2, h: 2, sight: 8,  cost: { crystal: 65, nebula: 65 }, time: 600, addonOf: 'labs', researches: ['legion_optcloak', 'legion_discharge'] },
    gravlab:   { name: '용골 작업장', race: 'legion', hp: 750, armor: 1, w: 2, h: 2, sight: 8, cost: { crystal: 65, nebula: 65 }, time: 600, addonOf: 'labs', researches: ['legion_repairdrones'] },

    // ── 스웜 ── (morphFrom = 같은 자리 변태, cost/time은 변태 비용)
    nest:      { name: '균핵', race: 'swarm',   hp: 1565, armor: 1, w: 4, h: 3, sight: 10, cost: { crystal: 375 }, time: 1800, provides: 1, dropoff: true, larva: true, creep: 9, researches: ['swarm_burrow'],
                 trains: ['drudge', 'bloater', 'skitter', 'spinewyrm', 'wingsting', 'burster', 'matron', 'blighter', 'behemoth'] },
    grandnest: { name: '대균핵', race: 'swarm',   hp: 2250, armor: 1, w: 4, h: 3, sight: 10, cost: { crystal: 190, nebula: 125 }, time: 1500, provides: 1, dropoff: true, larva: true, creep: 10,
                 morphFrom: 'nest', requires: ['vat'], researches: ['swarm_bloater_speed', 'swarm_bloater_transport', 'swarm_bloater_detect'],
                 trains: ['drudge', 'bloater', 'skitter', 'spinewyrm', 'wingsting', 'burster', 'matron', 'blighter', 'behemoth'] },
    apexnest:  { name: '고균핵', race: 'swarm',   hp: 3125, armor: 1, w: 4, h: 3, sight: 10, cost: { crystal: 250, nebula: 190 }, time: 1800, provides: 1, dropoff: true, larva: true, creep: 11,
                 morphFrom: 'grandnest', requires: ['matronden'],
                 trains: ['drudge', 'bloater', 'skitter', 'spinewyrm', 'wingsting', 'burster', 'matron', 'blighter', 'behemoth'] },
    siphon:    { name: '가스 뿌리', race: 'swarm',   hp: 940,  armor: 1, w: 2, h: 2, sight: 8,  cost: { crystal: 65 }, time: 600, onVent: true },
    vat:       { name: '포자밭', race: 'swarm',   hp: 940,  armor: 1, w: 3, h: 2, sight: 8,  cost: { crystal: 250 }, time: 1200, creep: 3, requires: ['nest'], researches: ['swarm_skitter_speed'] },
    mutapit:   { name: '변이 굴', race: 'swarm', hp: 940, armor: 1, w: 3, h: 2, sight: 8,  cost: { crystal: 95 }, time: 600, creep: 3, requires: ['nest'],
                 researches: ['swarm_melee', 'swarm_missile', 'swarm_carapace'] },
    tendril:   { name: '균사 기둥', race: 'swarm', hp: 500, armor: 0, w: 2, h: 2, sight: 8,  cost: { crystal: 95 }, time: 300, creep: 5, requires: ['nest'] },
    spineroot: { name: '가시 균사', race: 'swarm', hp: 375, armor: 2, w: 2, h: 2, sight: 10, cost: { crystal: 65 }, time: 300, creep: 5, morphFrom: 'tendril', requires: ['vat'],
                 weapon: { dmg: 50, type: 'explosive', range: 224, cooldown: 32 } },
    puffer:    { name: '포자 분사구', race: 'swarm',  hp: 500,  armor: 0, w: 2, h: 2, sight: 10, cost: { crystal: 65 }, time: 300, creep: 5, morphFrom: 'tendril', requires: ['mutapit'], detector: true,
                 weapon: { dmg: 19, type: 'normal', range: 224, cooldown: 15, air: true, ground: false } },
    wyrmpit:   { name: '스파인웜 굴', race: 'swarm', hp: 1065, armor: 1, w: 3, h: 2, sight: 8,  cost: { crystal: 125, nebula: 65 }, time: 600, creep: 3, requires: ['vat'],
                 researches: ['swarm_spinewyrm_range'] },
    roost:     { name: '비행 둥지', race: 'swarm',   hp: 750,  armor: 1, w: 2, h: 2, sight: 8,  cost: { crystal: 250, nebula: 190 }, time: 1800, creep: 3, requires: ['grandnest'],
                 researches: ['swarm_flyer_attacks', 'swarm_flyer_carapace'] },
    greatroost: { name: '대둥지', race: 'swarm', hp: 1250, armor: 1, w: 2, h: 2, sight: 8, cost: { crystal: 125, nebula: 190 }, time: 1800, creep: 3, morphFrom: 'roost', requires: ['apexnest'] },
    matronden: { name: '매트런 둥지', race: 'swarm', hp: 1065, armor: 1, w: 3, h: 2, sight: 8,  cost: { crystal: 190, nebula: 125 }, time: 900, creep: 3, requires: ['grandnest'], researches: ['swarm_mat'] },
    blightmound: { name: '부패 둔덕', race: 'swarm', hp: 1065, armor: 1, w: 4, h: 2, sight: 8, cost: { crystal: 125, nebula: 125 }, time: 900, creep: 3, requires: ['apexnest'], researches: ['swarm_rot'] },
    behemothcave: { name: '베히모스 굴', race: 'swarm', hp: 750, armor: 1, w: 3, h: 2, sight: 8, cost: { crystal: 190, nebula: 250 }, time: 1200, creep: 3, requires: ['apexnest'] },

    // ── 엘리시안 ──
    sanctum:   { name: '공명핵',   race: 'elysian', hp: 1250, shield: 1250, armor: 1, w: 4, h: 3, sight: 10, cost: { crystal: 500 }, time: 1800, provides: 9, dropoff: true, trains: ['shaper'], power: 3, link: 14, width: 2 },
    resonator: { name: '조율 기둥', race: 'elysian', hp: 375,  shield: 375,  armor: 0, w: 2, h: 2, sight: 8,  cost: { crystal: 125 }, time: 600,  provides: 8, power: 3, link: 14, width: 2 },
    distiller: { name: '가스 공진기', race: 'elysian', hp: 565,  shield: 565,  armor: 1, w: 2, h: 2, sight: 8,  cost: { crystal: 125 }, time: 600, onVent: true },
    portal:    { name: '공명 관문',   race: 'elysian', hp: 625,  shield: 625,  armor: 1, w: 4, h: 3, sight: 8,  cost: { crystal: 190 }, time: 1200, trains: ['oathblade', 'arcwalker', 'sage', 'umbra'], requires: ['sanctum'] },
    anvil:     { name: '연마소', race: 'elysian', hp: 690,  shield: 690,  armor: 1, w: 3, h: 2, sight: 8,  cost: { crystal: 190 }, time: 600, requires: ['sanctum'],
                 researches: ['elysian_ground_weapons', 'elysian_ground_armor', 'elysian_shields'] },
    wardspire: { name: '고음 첨탑', race: 'elysian', hp: 125, shield: 125, armor: 0, w: 2, h: 2, sight: 11, cost: { crystal: 190 }, time: 750, requires: ['anvil'], detector: true,
                 weapon: { dmg: 25, type: 'normal', range: 224, cooldown: 22, air: true } },
    synapse:   { name: '화음 회로', race: 'elysian', hp: 625, shield: 625, armor: 1, w: 3, h: 2, sight: 8, cost: { crystal: 250 }, time: 900, requires: ['portal'],
                 researches: ['elysian_air_weapons', 'elysian_air_armor', 'elysian_arcwalker_range'] },
    constructbay: { name: '결정 주조소', race: 'elysian', hp: 625, shield: 625, armor: 1, w: 3, h: 2, sight: 8, cost: { crystal: 250, nebula: 250 }, time: 1200, requires: ['synapse'],
                 trains: ['crucible', 'skiff', 'watcher'] },
    assemblybay: { name: '주조 부속', race: 'elysian', hp: 565, shield: 565, armor: 1, w: 3, h: 2, sight: 8, cost: { crystal: 190, nebula: 125 }, time: 450, requires: ['constructbay'] },
    lookout:   { name: '청음소', race: 'elysian', hp: 315,  shield: 315,  armor: 1, w: 3, h: 2, sight: 8,  cost: { crystal: 65, nebula: 125 }, time: 450, requires: ['constructbay'],
                 researches: ['elysian_watcher_sight', 'elysian_echo'] },
    skygate:   { name: '하늘 관문', race: 'elysian', hp: 750,  shield: 750,  armor: 1, w: 4, h: 3, sight: 8,  cost: { crystal: 190, nebula: 190 }, time: 1050, requires: ['synapse'],
                 trains: ['sentinel', 'skimmer', 'ark', 'warden'] },
    fleetspire: { name: '성가 첨탑', race: 'elysian', hp: 625, shield: 625, armor: 1, w: 3, h: 2, sight: 8, cost: { crystal: 250, nebula: 200 }, time: 900, requires: ['skygate'] },
    citadel:   { name: '음계 성채',   race: 'elysian', hp: 565,  shield: 565,  armor: 1, w: 3, h: 2, sight: 8,  cost: { crystal: 190, nebula: 125 }, time: 900, requires: ['synapse'],
                 researches: ['elysian_oathblade_speed'] },
    sagelibrary: { name: '캔터 회당', race: 'elysian', hp: 625, shield: 625, armor: 1, w: 3, h: 2, sight: 8, cost: { crystal: 190, nebula: 250 }, time: 900, requires: ['citadel'], researches: ['elysian_mindstorm'] },
    wardencourt: { name: '지휘대', race: 'elysian', hp: 625, shield: 625, armor: 1, w: 3, h: 2, sight: 8, cost: { crystal: 250, nebula: 190 }, time: 900, requires: ['sagelibrary', 'skygate'], researches: ['elysian_prism'] },
  },
  // 능력(마법). target: unit|point|self|auto, range px(0 = 무제한), cooldown 틱, requires = 연구 id, autocast = 자동 시전 가능(기본 켜짐),
  // repeat = 대상이 계속 필요하면 명령 유지, toggle = 다시 시전하면 끄기(무료), filter = unit 대상 조건(ally-bio|ally|enemy|any, 기본 any), needVis = 지점이 팀 시야 안일 때만.
  // effect.kind: instant{heal,dmg,energy,cleanse,burnEnergy,drainEnergy,share?{r(타일),race?}} status{flag,left(-1 무기한),drain(FP/틱)} area_dot{r,dmg(총합),left,delay} summon{unit,count,life}
  //   aura{flag,r,left,drain} reveal{r(타일),left,detect} zone{r,left,ally?{heal,shield,flag,mech},enemy?{dmg,energy,shield,flag},all?{flag}}
  //   drainEnergy = 대상 마나 전부 빼앗기(피해 없음), share = 그 마나를 시전자 반경 r타일 안 같은 팀 마나 유닛(race 제한, 시전자 포함)에 id 순 균등 분배(나머지는 작은 id부터, 최대치 초과분 소멸)
  //   zone.ally.mech = 기계 유닛(리벳 차량·함선)에만 적용
  // 3b 목록 = 정체성 설계 §5(고철 관련 효과는 사용자 결정으로 제외).
  abilities: {
    // ── 리벳 ──
    heal:      { name: '치료', race: 'legion', cost: 1, target: 'unit', range: 32, cooldown: 2, autocast: true, repeat: true, filter: 'ally-bio',
                 effect: { kind: 'instant', heal: 3 } },
    smoke:     { name: '연막 구역', race: 'legion', cost: 75, target: 'point', range: 224, requires: 'legion_smoke',
                 effect: { kind: 'zone', r: 48, left: 160, ally: { flag: 'cloaked' } } },
    optcloak:  { name: '반사 망토', race: 'legion', cost: 25, target: 'self', range: 0, requires: 'legion_optcloak', toggle: true,
                 effect: { kind: 'status', flag: 'cloaked', left: -1, drain: 24 } },
    mark:      { name: '표식', race: 'legion', cost: 50, target: 'unit', range: 288, filter: 'enemy',
                 effect: { kind: 'status', flag: 'marked', left: 240 } },
    discharge: { name: '방전탄', race: 'legion', cost: 100, target: 'point', range: 256, requires: 'legion_discharge',
                 effect: { kind: 'zone', r: 48, left: 1, enemy: { energy: 100, shield: 100 } } },
    seeker:    { name: '시커', race: 'legion', cost: 0, target: 'self', range: 0, cooldown: 400, requires: 'legion_hound_drones',
                 effect: { kind: 'summon', unit: 'seeker', count: 2, life: 200 } },
    cleanse:   { name: '정화', race: 'legion', cost: 50, target: 'unit', range: 288, filter: 'ally',
                 effect: { kind: 'instant', cleanse: true } },
    tow:       { name: '견인 빔', race: 'legion', cost: 75, target: 'unit', range: 256, filter: 'enemy', requires: 'legion_tow',
                 effect: { kind: 'status', flag: 'rooted', left: 120 } },
    scan:      { name: '드론 정찰', race: 'legion', cost: 50, target: 'point', range: 0,
                 effect: { kind: 'reveal', r: 7, left: 400, detect: true } },
    junkdrop:  { name: '고철 낙하', race: 'legion', cost: 100, target: 'point', range: 0, needVis: true, // 80틱 뒤 낙하, 유닛만(건물 무피해)
                 effect: { kind: 'area_dot', r: 56, dmg: 200, left: 1, delay: 80 } },
    repairdrones: { name: '수리 드론 방출', race: 'legion', cost: 100, target: 'point', range: 256, cooldown: 100, requires: 'legion_repairdrones', // 8초 동안 기계·함선 150 수리
                 effect: { kind: 'zone', r: 128, left: 160, ally: { heal: 150, mech: true } } },
    // ── 마이셀 ──
    spores:    { name: '포자 산포', race: 'swarm', cost: 100, target: 'point', range: 224,
                 effect: { kind: 'summon', unit: 'spawnling', count: 3, life: 300 } },
    mat:       { name: '균사 장판', race: 'swarm', cost: 75, target: 'point', range: 256, requires: 'swarm_mat',
                 effect: { kind: 'zone', r: 56, left: 240, ally: { heal: 40 }, enemy: { flag: 'slowed' } } },
    rot:       { name: '부패 포자', race: 'swarm', cost: 100, target: 'point', range: 288, requires: 'swarm_rot',
                 effect: { kind: 'zone', r: 40, left: 200, enemy: { dmg: 100 } } },
    sprout:    { name: '기생 발아', race: 'swarm', cost: 75, target: 'point', range: 160,
                 effect: { kind: 'summon', unit: 'husk', count: 1, life: 400 } },
    // ── 코러스 ──
    mindstorm: { name: '공명 파쇄', race: 'elysian', cost: 75, target: 'point', range: 288, requires: 'elysian_mindstorm',
                 effect: { kind: 'area_dot', r: 48, dmg: 140, left: 64 } },
    amplify:   { name: '공명 증폭', race: 'elysian', cost: 75, target: 'self', range: 0,
                 effect: { kind: 'aura', flag: 'hasted', r: 64, left: 160 } },
    stasis:    { name: '결정 봉인', race: 'elysian', cost: 100, target: 'point', range: 288,
                 effect: { kind: 'zone', r: 48, left: 200, all: { flag: 'stasis' } } },
    crystallize: { name: '결정화', race: 'elysian', cost: 50, target: 'unit', range: 256, filter: 'enemy',
                 effect: { kind: 'status', flag: 'disarmed', left: 120 } },
    probe:     { name: '광자 탐침', race: 'elysian', cost: 50, target: 'point', range: 320,
                 effect: { kind: 'reveal', r: 6, left: 300, detect: true } },
    prism:     { name: '프리즘 장막', race: 'elysian', cost: 25, target: 'self', range: 0, requires: 'elysian_prism', toggle: true,
                 effect: { kind: 'aura', flag: 'cloaked', r: 80, left: -1, drain: 12 } },
    chorus:    { name: '대합창', race: 'elysian', cost: 100, target: 'point', range: 224,
                 effect: { kind: 'zone', r: 64, left: 100, ally: { shield: 120 } } },
    echo:      { name: '음파 역류', race: 'elysian', cost: 50, target: 'unit', range: 288, filter: 'enemy', requires: 'elysian_echo',
                 effect: { kind: 'instant', drainEnergy: true, share: { r: 6, race: 'elysian' } } },
  },
  // 업그레이드. levels 3 = 공격/방어(카테고리), 1 = 유닛 전용. requires[i] = i+1단계에 필요한 건물.
  // (스웜 grandnest 요구는 apexnest로도 충족되어야 함 — 변태 계보는 Task 3에서 처리.)
  // 맵: 크기 w×h(생략 시 128). rocks [tx,ty,w,h], starts[1]은 starts[0]의 180도 점대칭(본진 4×3 기준: tx' = W-4-tx, ty' = H-3-ty). players = 최대 인원(생략 시 starts.length).
  // 2인 맵도 시작 후보 4곳(players: 2) — 무작위 두 자리라 상대 위치는 정찰해야 안다. 2인 맵은 거울 대칭을 강제하지 않는다(약간의 불공정 허용).
  // 4인 맵 starts 순서 고정: [좌상(flip 0), 우하(flip 3), 우상(flip 1), 좌하(flip 2)] — 0·1번은 2인 자리와 같다. 확장은 flip 0·3·1·2 네 개 묶음으로만(공정성).
  // 사이트(시작·확장)마다 크리스탈 8 + 분출구 1이 자동 생성된다. 시작 1·2는 같은 사이트 배치의 거울,
  // expansion.mirror=true면 (tx,ty) 배치의 거울. flip(0 없음·1 x거울·2 y거울·3 둘 다)으로 일반화: starts[i].flip 기본 i?3:0, expansions[j].flip 기본 mirror?3:0.
  maps: {
    crossing: { name: '교차로', desc: '중앙 확장이 있는 기본 맵', players: 2,
      rocks: [[56, 28, 3, 4], [69, 96, 3, 4], [60, 40, 4, 4], [64, 84, 4, 4], [30, 60, 3, 5], [95, 63, 3, 5]], // 180° 점대칭(쌍마다 W-x-w, H-y-h)
      starts: [{ tx: 10, ty: 10 }, { tx: 114, ty: 115 }, { tx: 114, ty: 10, flip: 1 }, { tx: 10, ty: 115, flip: 2 }],
      expansions: [{ tx: 62, ty: 62 }] },
    narrows: { name: '좁은 길', desc: '중앙 바위 벽의 통로 3곳으로만 교전', players: 2,
      rocks: [[60, 0, 8, 24], [60, 30, 8, 31], [60, 67, 8, 31], [60, 104, 8, 24]],
      starts: [{ tx: 10, ty: 10 }, { tx: 114, ty: 115 }, { tx: 114, ty: 10, flip: 1 }, { tx: 10, ty: 115, flip: 2 }],
      expansions: [] },
    expanse: { name: '넓은 들', desc: '4인 — 바위가 적고 확장 8곳, 넓게 트인 교전', players: 4,
      // 본진마다 옆 앞마당(38,12)과 중앙 쪽 확장(46,46). 바위는 작은 덩어리 셋의 네 거울.
      rocks: quadRocks([[56, 36, 4, 4], [30, 58, 4, 4], [24, 40, 4, 3]]),
      starts: [{ tx: 10, ty: 10 }, { tx: 114, ty: 115 }, { tx: 114, ty: 10, flip: 1 }, { tx: 10, ty: 115, flip: 2 }],
      expansions: quad({ tx: 38, ty: 12 }).concat(quad({ tx: 46, ty: 46 })) },
    // ── 추가 맵 6종 ── 바위는 대체로 180도 점대칭(시작 후보 4곳). 본진 (10,10) 기준 사이트는 x 4~13, y 4~14 (자동 생성).
    gate: { name: '좁은 관문', desc: '본진 앞 3칸 관문 하나 — 막기 쉬운 수비형', players: 2,
      // 본진 구역(0~25, 0~26)을 두꺼운 벽이 감싸고 동쪽 벽에 폭 3의 관문(y 18~20). 확장은 관문 바깥.
      // 본진 성벽은 네 모서리 모두(quadRocks), 들판 바위는 기존 점대칭 그대로.
      rocks: quadRocks([[26, 0, 4, 18], [26, 21, 4, 10], [0, 27, 26, 4]]).concat(symRocks([
        [56, 56, 6, 6], [40, 70, 4, 10], [76, 34, 8, 4], [50, 100, 10, 3], [20, 48, 3, 12]])),
      starts: [{ tx: 10, ty: 10 }, { tx: 114, ty: 115 }, { tx: 114, ty: 10, flip: 1 }, { tx: 10, ty: 115, flip: 2 }],
      expansions: [{ tx: 42, ty: 16 }, { tx: 42, ty: 16, mirror: true }] },
    isles: { name: '섬 대륙', desc: '바위로 갈라진 5개 구역, 좁은 대각 통로로만 이어진다 — 공중 유리', players: 2,
      // u=x+y, v=x-y. 대각 벽 2줄(u 74~81 / 대칭)이 본진 구역과 중앙대를 가르고, 중앙대는 v=±24~31 벽으로
      // 좌우 섬(TR·BL)과 갈린다. 통로는 벽마다 한 곳(폭 약 5)이며 본진 → 중앙 → 본진 경로에 둘이 놓인다.
      rocks: rocksFrom((x, y) => {
        const u = x + y, v = x - y;
        if (u >= 74 && u <= 81 && Math.abs(v) > 3) return true;
        return v >= 24 && v <= 31 && u >= 82 && u <= 172 && Math.abs(u - 127) > 3;
      }),
      starts: [{ tx: 10, ty: 10 }, { tx: 114, ty: 115 }, { tx: 114, ty: 10, flip: 1 }, { tx: 10, ty: 115, flip: 2 }],
      expansions: [{ tx: 10, ty: 38 }, { tx: 10, ty: 38, mirror: true }, { tx: 58, ty: 58 }, { tx: 58, ty: 58, mirror: true },
        { tx: 100, ty: 30 }, { tx: 100, ty: 30, mirror: true }] },
    maze: { name: '미로', desc: '갈림길과 우회로가 얽힌 바위 벽 — 기습 경로 많음', players: 2,
      // 방(4×4 타일)·벽 칸이 번갈아 놓인 31×31 격자. 점대칭이며, 네 모서리 본진 구역(4×4칸)은 비어 있다.
      rocks: gridRocks([
        '.....#.............#...........',
        '.....#######.#.###.#####.#.....',
        '...........#.#...#.#.....#.....',
        '....######.#.###.#.#.######....',
        '...#.....#.#...#.....#...#.....',
        '.#.#####.#.#####.#####.#.#.....',
        '.#.....#.#.#.....#.....#...#.#.',
        '.#####.#.#.#.#####.#.#######.#.',
        '.#.......#...#.....#.#.....#.#.',
        '.###.#########.###.###.###.#.#.',
        '...#.#.......#...#...#.#.#...#.',
        '.#.###.#####.###.###.#.#.#.#.#.',
        '.#...#.....#...#...#.#.#.#...#.',
        '.###.#.#######.#.###.#.#.#####.',
        '.#.....#.....#...#...#.#...#...',
        '.#.#.#.#.###.#.#.#.###.#.#.#.#.',
        '...#...#.#...#...#.....#.....#.',
        '.#####.#.#.###.#.#######.#.###.',
        '.#...#.#.#.#...#...#.....#...#.',
        '.#.#.#.#.#.###.###.#####.###.#.',
        '.#...#.#.#...#...#.......#.#...',
        '.#.#.###.###.###.#########.###.',
        '.#.#.....#.#.....#...#.......#.',
        '.#.#######.#.#####.#.#.#.#####.',
        '.#.#...#.....#.....#.#.#.....#.',
        '.....#.#.#####.#####.#.#####.#.',
        '.....#...#.....#...#.#.....#...',
        '....######.#.#.###.#.######....',
        '.....#.....#.#...#.#...........',
        '.....#.#####.###.#.#######.....',
        '...........#.............#.....',
      ]),
      starts: [{ tx: 10, ty: 10 }, { tx: 114, ty: 115 }, { tx: 114, ty: 10, flip: 1 }, { tx: 10, ty: 115, flip: 2 }],
      expansions: [] },
    ring: { name: '원형 경기장', desc: '4인 — 가운데 큰 바위 섬, 바깥 고리 길을 따라 확장 8곳', players: 4,
      // 원(반지름 22)은 원래 네 거울 대칭. 확장은 원 위·아래(50,30)와 좌·우(30,50) 묶음.
      rocks: rocksFrom((x, y) => (2 * x - 127) * (2 * x - 127) + (2 * y - 127) * (2 * y - 127) <= 44 * 44),
      starts: [{ tx: 10, ty: 10 }, { tx: 114, ty: 115 }, { tx: 114, ty: 10, flip: 1 }, { tx: 10, ty: 115, flip: 2 }],
      expansions: quad({ tx: 50, ty: 30 }).concat(quad({ tx: 30, ty: 50 })) },
    diagonal: { name: '대각선 대치', desc: '모서리 끝 본진, 지그재그로 먼 길 — 확장 6곳(빈 시작 자리 포함)', players: 2,
      // 대각 벽(u=x+y 일정)이 길을 막고 통로가 번갈아 양 끝에 있어, 본진 사이를 지그재그로 건너야 한다.
      rocks: rocksFrom((x, y) => {
        const u = x + y, v = x - y;
        if (u >= 46 && u <= 51) return v < 36 || v > 46;                         // 1번 벽: 통로는 오른쪽 위 끝
        if (u >= 84 && u <= 89) return v > -36 || v < -46;                       // 2번 벽: 통로는 왼쪽 아래 끝
        if (u >= 124 && u <= 130) return Math.abs(v) < 60 || (Math.abs(v) > 76 && Math.abs(v) <= 96); // 중앙 벽: 통로는 양 끝, 모서리 끝은 열림
        if (x >= 104 && x <= 107 && y <= 18) return true;                        // 우상 모서리 본진 주머니 벽(대칭: 좌하) — 주머니는 맞은편 반쪽에 붙는다
        return false;
      }),
      starts: [{ tx: 7, ty: 7 }, { tx: 117, ty: 118 }, { tx: 117, ty: 7, flip: 1 }, { tx: 7, ty: 118, flip: 2 }],
      expansions: [{ tx: 18, ty: 22 }, { tx: 18, ty: 22, mirror: true },
        { tx: 40, ty: 38 }, { tx: 40, ty: 38, mirror: true }] },
    bonanza: { name: '부자 중앙', desc: '4인 — 정중앙 부자 사이트(크리스탈 2배) 4곳 쟁탈전', players: 4,
      // 중앙 사이트 네 개(원본 + 세 거울)가 맞붙어 중앙을 둘러싼 크리스탈 32개·분출구 4개의 고리를 이룬다. 앞마당은 (12,42) 묶음.
      rocks: quadRocks([[40, 40, 6, 6], [30, 61, 3, 6], [61, 30, 6, 3]]),
      starts: [{ tx: 10, ty: 10 }, { tx: 114, ty: 115 }, { tx: 114, ty: 10, flip: 1 }, { tx: 10, ty: 115, flip: 2 }],
      expansions: quad({ tx: 58, ty: 58, rich: true }).concat(quad({ tx: 12, ty: 42 })) },
    fortress: { name: '네 요새', desc: '4인 160 — 입구 둘인 성벽 본진, 정중앙 부자 사이트', players: 4, w: 160, h: 160,
      // 본진 구역(0~29)을 두께 4 성벽이 감싸고 동쪽(y 14~19)·남쪽(x 14~19)에 폭 6 입구. 입구 밖마다 앞마당,
      // 중앙은 부자 사이트 네 개의 고리. 들판 바위는 중앙 접근로를 네 대각 길로 가른다.
      rocks: quadRocks([[30, 0, 4, 14], [30, 20, 4, 14], [0, 30, 14, 4], [20, 30, 10, 4],
        [56, 40, 6, 6], [40, 56, 6, 6], [76, 50, 8, 4], [50, 76, 4, 8]], 160, 160),
      starts: [{ tx: 10, ty: 10 }, { tx: 146, ty: 147 }, { tx: 146, ty: 10, flip: 1 }, { tx: 10, ty: 147, flip: 2 }],
      expansions: quad({ tx: 48, ty: 10 }).concat(quad({ tx: 10, ty: 48 }), quad({ tx: 74, ty: 74, rich: true })) },
  },
  upgrades: {
    // ── 레기온 ── 2·3단계는 연구 단지(labs) 필요
    legion_infantry_weapons: { name: '보병 무기', race: 'legion', at: 'workshop', levels: 3,
      cost: [{ crystal: 125, nebula: 125 }, { crystal: 220, nebula: 220 }, { crystal: 315, nebula: 315 }], time: [4000, 4480, 4960],
      requires: [[], ['labs'], ['labs']], effect: { category: 'legion_infantry_weapons', dmgPerLevel: 1 } },
    legion_infantry_armor:   { name: '보병 장갑', race: 'legion', at: 'workshop', levels: 3,
      cost: [{ crystal: 125, nebula: 125 }, { crystal: 220, nebula: 220 }, { crystal: 315, nebula: 315 }], time: [4000, 4480, 4960],
      requires: [[], ['labs'], ['labs']], effect: { category: 'legion_infantry_armor', armorPerLevel: 1 } },
    legion_vehicle_weapons:  { name: '차량 무기', race: 'legion', at: 'arsenal', levels: 3,
      cost: [{ crystal: 125, nebula: 125 }, { crystal: 220, nebula: 220 }, { crystal: 315, nebula: 315 }], time: [4000, 4480, 4960],
      requires: [[], ['labs'], ['labs']], effect: { category: 'legion_vehicle_weapons', dmgPerLevel: 1 } },
    legion_vehicle_plating:  { name: '차량 장갑', race: 'legion', at: 'arsenal', levels: 3,
      cost: [{ crystal: 125, nebula: 125 }, { crystal: 220, nebula: 220 }, { crystal: 315, nebula: 315 }], time: [4000, 4480, 4960],
      requires: [[], ['labs'], ['labs']], effect: { category: 'legion_vehicle_plating', armorPerLevel: 1 } },
    legion_ship_weapons:     { name: '함선 무기', race: 'legion', at: 'arsenal', levels: 3,
      cost: [{ crystal: 125, nebula: 125 }, { crystal: 190, nebula: 190 }, { crystal: 250, nebula: 250 }], time: [4000, 4480, 4960],
      requires: [[], ['labs'], ['labs']], effect: { category: 'legion_ship_weapons', dmgPerLevel: 1 } },
    legion_ship_plating:     { name: '함선 장갑', race: 'legion', at: 'arsenal', levels: 3,
      cost: [{ crystal: 190, nebula: 190 }, { crystal: 280, nebula: 280 }, { crystal: 375, nebula: 375 }], time: [4000, 4480, 4960],
      requires: [[], ['labs'], ['labs']], effect: { category: 'legion_ship_plating', armorPerLevel: 1 } },
    legion_trooper_range:    { name: '강화 탄두', race: 'legion', at: 'drillhall', levels: 1, cost: [{ crystal: 190, nebula: 190 }], time: [1500],
      effect: { unit: 'trooper', stat: 'range', add: 32 } },
    legion_hound_speed:      { name: '이온 추진기', race: 'legion', at: 'garage', levels: 1, cost: [{ crystal: 125, nebula: 125 }], time: [1500],
      effect: { unit: 'hound', stat: 'speed', add: 2.5 } },
    legion_strider_range:    { name: '대공 사거리 증폭', race: 'legion', at: 'garage', levels: 1, cost: [{ crystal: 125, nebula: 125 }], time: [2000],
      requires: [['arsenal']], effect: { unit: 'strider', stat: 'range', add: 96, weapon: 'weapon2' } },
    legion_optcloak:         { name: '반사 망토', race: 'legion', at: 'intel', levels: 1, cost: [{ crystal: 125, nebula: 125 }], time: [1600],
      effect: { unlock: 'optcloak' } },
    legion_smoke:            { name: '연막 구역', race: 'legion', at: 'drillhall', levels: 1, cost: [{ crystal: 125, nebula: 125 }], time: [1500], effect: { unlock: 'smoke' } },
    legion_discharge:        { name: '방전탄', race: 'legion', at: 'intel', levels: 1, cost: [{ crystal: 190, nebula: 190 }], time: [1800], effect: { unlock: 'discharge' } },
    legion_hound_drones:     { name: '시커 드론', race: 'legion', at: 'garage', levels: 1, cost: [{ crystal: 125, nebula: 125 }], time: [1500], effect: { unlock: 'seeker' } },
    legion_tow:              { name: '견인 빔', race: 'legion', at: 'labs', levels: 1, cost: [{ crystal: 125, nebula: 125 }], time: [1500], effect: { unlock: 'tow' } },
    legion_repairdrones:     { name: '수리 드론 방출', race: 'legion', at: 'gravlab', levels: 1, cost: [{ crystal: 150, nebula: 150 }], time: [1800], effect: { unlock: 'repairdrones' } },

    // ── 스웜 ── 2단계 grandnest, 3단계 apexnest
    swarm_melee:             { name: '근접 공격', race: 'swarm', at: 'mutapit', levels: 3,
      cost: [{ crystal: 125, nebula: 125 }, { crystal: 190, nebula: 190 }, { crystal: 250, nebula: 250 }], time: [4000, 4480, 4960],
      requires: [[], ['grandnest'], ['apexnest']], effect: { category: 'swarm_melee', dmgPerLevel: 1 } },
    swarm_missile:           { name: '원거리 공격', race: 'swarm', at: 'mutapit', levels: 3,
      cost: [{ crystal: 125, nebula: 125 }, { crystal: 190, nebula: 190 }, { crystal: 250, nebula: 250 }], time: [4000, 4480, 4960],
      requires: [[], ['grandnest'], ['apexnest']], effect: { category: 'swarm_missile', dmgPerLevel: 1 } },
    swarm_carapace:          { name: '지상 갑피', race: 'swarm', at: 'mutapit', levels: 3,
      cost: [{ crystal: 190, nebula: 190 }, { crystal: 280, nebula: 280 }, { crystal: 375, nebula: 375 }], time: [4000, 4480, 4960],
      requires: [[], ['grandnest'], ['apexnest']], effect: { category: 'swarm_carapace', armorPerLevel: 1 } },
    swarm_flyer_attacks:     { name: '비행 공격', race: 'swarm', at: 'roost', levels: 3,
      cost: [{ crystal: 125, nebula: 125 }, { crystal: 220, nebula: 220 }, { crystal: 315, nebula: 315 }], time: [4000, 4480, 4960],
      requires: [[], ['grandnest'], ['apexnest']], effect: { category: 'swarm_flyer_attacks', dmgPerLevel: 1 } },
    swarm_flyer_carapace:    { name: '비행 갑피', race: 'swarm', at: 'roost', levels: 3,
      cost: [{ crystal: 190, nebula: 190 }, { crystal: 280, nebula: 280 }, { crystal: 375, nebula: 375 }], time: [4000, 4480, 4960],
      requires: [[], ['grandnest'], ['apexnest']], effect: { category: 'swarm_flyer_carapace', armorPerLevel: 1 } },
    swarm_skitter_speed:     { name: '신속 변이', race: 'swarm', at: 'vat', levels: 1, cost: [{ crystal: 125, nebula: 125 }], time: [1500],
      effect: { unit: 'skitter', stat: 'speed', add: 2.25 } },
    swarm_spinewyrm_range:   { name: '가시 홈', race: 'swarm', at: 'wyrmpit', levels: 1, cost: [{ crystal: 190, nebula: 190 }], time: [1500],
      effect: { unit: 'spinewyrm', stat: 'range', add: 32 } },
    swarm_bloater_speed:     { name: '기낭 팽창', race: 'swarm', at: 'grandnest', levels: 1, cost: [{ crystal: 190, nebula: 190 }], time: [2000],
      effect: { unit: 'bloater', stat: 'speed', add: 2 } },
    swarm_burrow:            { name: '휴면', race: 'swarm', at: 'nest', levels: 1, cost: [{ crystal: 125, nebula: 125 }], time: [1200],
      effect: { unlock: 'burrow' } },
    swarm_bloater_transport: { name: '수송낭', race: 'swarm', at: 'grandnest', levels: 1, cost: [{ crystal: 250, nebula: 250 }], time: [2400],
      effect: { unlock: 'transport' } },
    swarm_bloater_detect:    { name: '감각 촉수', race: 'swarm', at: 'grandnest', levels: 1, cost: [{ crystal: 190, nebula: 190 }], time: [2000],
      effect: { unlock: 'detect' } },
    swarm_mat:               { name: '균사 장판', race: 'swarm', at: 'matronden', levels: 1, cost: [{ crystal: 125, nebula: 125 }], time: [1500], effect: { unlock: 'mat' } },
    swarm_rot:               { name: '부패 포자', race: 'swarm', at: 'blightmound', levels: 1, cost: [{ crystal: 190, nebula: 190 }], time: [1800], effect: { unlock: 'rot' } },

    // ── 엘리시안 ── 지상 2·3단계 현자 서고, 공중 2·3단계 함대 첨탑
    elysian_ground_weapons:  { name: '지상 무기', race: 'elysian', at: 'anvil', levels: 3,
      cost: [{ crystal: 125, nebula: 125 }, { crystal: 190, nebula: 190 }, { crystal: 250, nebula: 250 }], time: [4000, 4480, 4960],
      requires: [[], ['sagelibrary'], ['sagelibrary']], effect: { category: 'elysian_ground_weapons', dmgPerLevel: 1 } },
    elysian_ground_armor:    { name: '지상 갑옷', race: 'elysian', at: 'anvil', levels: 3,
      cost: [{ crystal: 125, nebula: 125 }, { crystal: 220, nebula: 220 }, { crystal: 315, nebula: 315 }], time: [4000, 4480, 4960],
      requires: [[], ['sagelibrary'], ['sagelibrary']], effect: { category: 'elysian_ground_armor', armorPerLevel: 1 } },
    elysian_shields:         { name: '결정막', race: 'elysian', at: 'anvil', levels: 3,
      cost: [{ crystal: 190, nebula: 190 }, { crystal: 280, nebula: 280 }, { crystal: 375, nebula: 375 }], time: [4000, 4480, 4960],
      requires: [[], ['sagelibrary'], ['sagelibrary']], effect: { shieldPerLevel: 1 } },
    elysian_air_weapons:     { name: '공중 무기', race: 'elysian', at: 'synapse', levels: 3,
      cost: [{ crystal: 125, nebula: 125 }, { crystal: 220, nebula: 220 }, { crystal: 315, nebula: 315 }], time: [4000, 4480, 4960],
      requires: [[], ['fleetspire'], ['fleetspire']], effect: { category: 'elysian_air_weapons', dmgPerLevel: 1 } },
    elysian_air_armor:       { name: '공중 장갑', race: 'elysian', at: 'synapse', levels: 3,
      cost: [{ crystal: 190, nebula: 190 }, { crystal: 280, nebula: 280 }, { crystal: 375, nebula: 375 }], time: [4000, 4480, 4960],
      requires: [[], ['fleetspire'], ['fleetspire']], effect: { category: 'elysian_air_armor', armorPerLevel: 1 } },
    elysian_oathblade_speed: { name: '도약 장치', race: 'elysian', at: 'citadel', levels: 1, cost: [{ crystal: 190, nebula: 190 }], time: [2000],
      effect: { unit: 'oathblade', stat: 'speed', add: 1.5 } },
    elysian_arcwalker_range: { name: '특이점 충전', race: 'elysian', at: 'synapse', levels: 1, cost: [{ crystal: 190, nebula: 190 }], time: [2500],
      effect: { unit: 'arcwalker', stat: 'range', add: 64 } },
    elysian_watcher_sight:   { name: '감지 배열', race: 'elysian', at: 'lookout', levels: 1, cost: [{ crystal: 190, nebula: 190 }], time: [2000],
      effect: { unit: 'watcher', stat: 'sight', add: 2 } },
    elysian_mindstorm:       { name: '공명 파쇄', race: 'elysian', at: 'sagelibrary', levels: 1, cost: [{ crystal: 250, nebula: 250 }], time: [1800],
      effect: { unlock: 'mindstorm' } },
    elysian_prism:           { name: '프리즘 장막', race: 'elysian', at: 'wardencourt', levels: 1, cost: [{ crystal: 190, nebula: 190 }], time: [1800], effect: { unlock: 'prism' } },
    elysian_echo:            { name: '음파 역류', race: 'elysian', at: 'lookout', levels: 1, cost: [{ crystal: 125, nebula: 125 }], time: [1500], effect: { unlock: 'echo' } },
  },
};
for (const k in NW_DATA.units) NW_DATA.units[k].id = k;
for (const k in NW_DATA.buildings) Object.assign(NW_DATA.buildings[k], { id: k, size: 'large' });
for (const k in NW_DATA.upgrades) NW_DATA.upgrades[k].id = k;
for (const k in NW_DATA.abilities) NW_DATA.abilities[k].id = k;
if (typeof module !== 'undefined') module.exports = NW_DATA;
