// 부적난무 — 요괴. glyph는 임시 그림(한 글자). 보스 pattern은 engine/patterns.js의 종류.
const BJ_ENEMIES = {
  dokkaebi_fire_small: { name: '작은 도깨비불', glyph: '불', color: 0x9fd0ff, hp: 5, speed: 85, r: 8, dmg: 4, xp: 0 },
  dokkaebi_fire: { name: '도깨비불', glyph: '불', color: 0x6fb7ff, hp: 12, speed: 70, r: 11, dmg: 6, xp: 1 },
  little_dokkaebi: { name: '꼬마 도깨비', glyph: '깨', color: 0xd9844a, hp: 26, speed: 58, r: 14, dmg: 9, xp: 2 },
  japgwi: { name: '잡귀', glyph: '귀', color: 0xb9b2c8, hp: 8, speed: 95, r: 9, dmg: 4, xp: 1, ghost: true },
  mongdal: { name: '몽달귀', glyph: '몽', color: 0xc8d4e0, hp: 6, speed: 115, r: 8, dmg: 3, xp: 1, ghost: true },
  stone_dokkaebi: {
    name: '돌팔매 도깨비', glyph: '돌', color: 0xc07a48, hp: 20, speed: 50, r: 12, dmg: 4, xp: 2,
    pattern: { kind: 'ranged', range: 220, every: 3.5, warn: 0.7, speed: 220, r: 6, dmg: 4, count: 1 },
  },
  broom_dokkaebi: { name: '빗자루 도깨비', glyph: '비', color: 0xc8a050, hp: 45, speed: 45, r: 16, dmg: 8, xp: 3, split: { enemy: 'poker_dokkaebi', count: 2 } },
  poker_dokkaebi: { name: '부지깽이 도깨비', glyph: '부', color: 0x4a4038, hp: 8, speed: 90, r: 8, dmg: 4, xp: 0, codex: false },
  one_leg: { name: '외다리 도깨비', glyph: '외', color: 0x6a8a4a, hp: 22, speed: 40, r: 12, dmg: 6, xp: 2, pattern: { kind: 'hop', every: 1.2, speed: 400, dur: 0.3 } },
  one_eye: {
    name: '외눈 도깨비', glyph: '目', color: 0xc8553d, hp: 900, speed: 55, r: 34, dmg: 18, xp: 30, boss: true,
    pattern: { kind: 'charge', every: 4.5, warn: 1.2, speed: 520, dur: 0.55 },
  },
  one_eye_elder: {
    name: '외눈 도깨비 우두머리', glyph: '王', color: 0x9e2a2b, hp: 2600, speed: 90, r: 42, dmg: 24, xp: 0, boss: true,
    pattern: { kind: 'charge', every: 4, warn: 1.2, speed: 500, dur: 0.4 },
  },
  egg_ghost: { name: '달걀귀신', glyph: '알', color: 0xe9e4d8, hp: 18, speed: 85, r: 12, dmg: 7, xp: 1, ghost: true, pattern: { kind: 'zigzag', freq: 3, amp: 0.6 } },
  club_dokkaebi: {
    name: '도깨비 방망이꾼', glyph: '棒', color: 0xb5651d, hp: 1600, speed: 60, r: 36, dmg: 20, xp: 40, boss: true,
    pattern: { kind: 'slam', every: 3.5, warn: 1.1, r: 90, dmg: 28 },
  },
  duoksini: {
    name: '두억시니', glyph: '鬼', color: 0x5b2a86, hp: 3000, speed: 80, r: 44, dmg: 26, xp: 0, boss: true,
    pattern: { kind: 'charge', every: 4, warn: 1.2, speed: 620, dur: 0.6 },
    summon: { every: 8, enemy: 'little_dokkaebi', count: 4, max: 12 },
  },
  fox_clone: { name: '구미호 분신', glyph: '尾', color: 0xf0a050, hp: 1, speed: 65, r: 12, dmg: 6, xp: 0, immune: true, life: 18, codex: false },
  fox_true: { name: '구미호 본체', glyph: '尾', color: 0xf0a050, hp: 120, speed: 65, r: 12, dmg: 6, xp: 6, revealOnHit: 4, tell: 'shadow' },
  geusundae: { name: '그슨대', glyph: '影', color: 0x55506a, hp: 60, speed: 45, r: 18, dmg: 8, xp: 3, ghost: true },
  yagwang: { name: '야광귀', glyph: '광', color: 0x6a5aa8, hp: 16, speed: 75, r: 10, dmg: 5, xp: 1, ghost: true, pattern: { kind: 'charge', every: 3.5, warn: 0.6, speed: 380, dur: 0.3 } },
  orb_fox: {
    name: '구슬여우', glyph: '珠', color: 0xf0c8a0, hp: 24, speed: 60, r: 11, dmg: 6, xp: 2, ghost: true,
    pattern: { kind: 'ranged', range: 240, every: 3, warn: 0.5, speed: 240, r: 7, dmg: 6, count: 2, spread: 0.25 },
  },
  songaksi: { name: '손각시', glyph: '각', color: 0xe8f0e8, hp: 40, speed: 40, r: 13, dmg: 5, xp: 3, ghost: true, aura: { heal: 4, r: 120, ghostsOnly: true, color: 0xc8f0d0 } },
  honbul: { name: '혼불', glyph: '魂', color: 0xf0d870, hp: 30, speed: 90, r: 10, dmg: 0, xp: 0, life: 12, pattern: { kind: 'flee', minR: 180, maxR: 260 }, drop: { coin: 5 } },
  changgwi: { name: '창귀', glyph: '倀', color: 0xc9b87a, hp: 14, speed: 100, r: 10, dmg: 4, xp: 1, ghost: true, pattern: { kind: 'zigzag', freq: 5, amp: 0.4 } },
  jangsanbeom: {
    name: '장산범', glyph: '虎', color: 0xeeeeee, hp: 1400, speed: 70, r: 36, dmg: 16, xp: 40, boss: true,
    pattern: { kind: 'charge', every: 3, warn: 1.1, speed: 700, dur: 0.35 },
  },
  fox_shaman: {
    name: '여우 무당', glyph: '覡', color: 0xd06090, hp: 1500, speed: 55, r: 32, dmg: 16, xp: 40, boss: true,
    pattern: { kind: 'ranged', range: 260, every: 2.8, warn: 0.5, speed: 260, r: 9, dmg: 10, count: 5, spread: 0.35 },
    summon: { every: 10, enemy: 'changgwi', count: 3, max: 9 },
  },
  gumiho: {
    name: '천년 구미호', glyph: '九', color: 0xffb347, hp: 2000, speed: 85, r: 42, dmg: 26, xp: 0, boss: true,
    pattern: { kind: 'ranged', range: 185, every: 1.8, warn: 0.5, speed: 340, r: 10, dmg: 10, count: 7, spread: 0.3 },
    summon: { every: 9, enemy: 'fox_clone', count: 2, max: 4 },
  },
};
if (typeof module !== 'undefined') module.exports = BJ_ENEMIES;
