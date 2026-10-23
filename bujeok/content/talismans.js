// 부적난무 — 부적. 부적 = 오행 + 동작 부품 + 레벨별 수치. how·weak는 카드에 처음부터 공개된다(스펙 5.2).
// 기본 12장 + 합체 12종(레시피 6쌍 × 2갈래).
const BJ_TALISMANS = {
  fire_talisman: {
    name: '화염부', element: 'fire', motif: 'fire', glyph: '火', color: 0xff7a3d, role: '근거리 단일',
    how: '가장 가까운 적에게 불덩이를 쏜다', weak: '한 번에 한 마리',
    parts: [{ kind: 'projectile', target: 'nearest', speed: 420, r: 7, ttl: 1.4, pierce: 0, spread: 0.18 }],
    levels: [{ cd: 1.0, dmg: 14, count: 1 }, { cd: 0.9, dmg: 16, count: 1 }, { cd: 0.85, dmg: 18, count: 2 }, { cd: 0.8, dmg: 21, count: 2 }, { cd: 0.7, dmg: 25, count: 3 }],
  },
  whirlwind: {
    name: '회오리부', element: 'wood', motif: 'wind', glyph: '風', color: 0x8fe3b0, role: '전방 라인',
    how: '바라보는 방향으로 적을 꿰뚫는 회오리', weak: '옆과 뒤가 빈다',
    parts: [{ kind: 'projectile', target: 'facing', speed: 300, r: 16, ttl: 1.6, pierce: 99 }],
    levels: [{ cd: 1.6, dmg: 10, count: 1 }, { cd: 1.5, dmg: 12, count: 1 }, { cd: 1.4, dmg: 13, count: 2, spread: 0.35 }, { cd: 1.3, dmg: 15, count: 2, spread: 0.35 }, { cd: 1.2, dmg: 18, count: 3, spread: 0.35 }],
  },
  bell: {
    name: '방울', element: 'metal', motif: 'bell', glyph: '鈴', color: 0xf2d36b, role: '자기 주변 정리',
    how: '주기적으로 원형 충격파를 내고 적을 밀어낸다', weak: '사거리가 짧다',
    parts: [{ kind: 'shockwave', r: 90, knock: 60 }],
    levels: [{ cd: 2.2, dmg: 12 }, { cd: 2.0, dmg: 14 }, { cd: 1.9, dmg: 16, r: 105 }, { cd: 1.8, dmg: 19, r: 110 }, { cd: 1.6, dmg: 23, r: 120 }],
  },
  red_bean: {
    name: '팥 주머니', element: 'earth', motif: 'bean', glyph: '豆', color: 0x9b6b4a, role: '공간 통제',
    how: '발밑에 팥을 뿌려 요괴가 들어오지 못하는 구역을 만든다', weak: '피해를 주지 않는다',
    parts: [{ kind: 'zone', at: 'player', zone: 'block', r: 60, ttl: 3 }],
    levels: [{ cd: 5 }, { cd: 4.6, ttl: 3.5 }, { cd: 4.2, r: 70 }, { cd: 3.8, ttl: 4 }, { cd: 3.4, r: 80 }],
  },
  fox_fire: {
    name: '여우불', element: 'fire', motif: 'fire', glyph: '狐', color: 0xff9b54, role: '근접 방어',
    how: '몸 주위를 도는 불꽃이 닿는 적을 태운다', weak: '궤도 밖으로는 닿지 않는다',
    parts: [{ kind: 'orbit', count: 3, R: 62, w: 3.2, r: 12 }],
    levels: [{ dps: 18 }, { dps: 22 }, { dps: 24, count: 4 }, { dps: 28, count: 4 }, { dps: 32, count: 5 }],
  },
  thunder_talisman: {
    name: '뇌전부', element: 'fire', motif: 'thunder', glyph: '雷', color: 0xa6b8ff, role: '광역 난사',
    how: '사거리 안의 무작위 적에게 낙뢰를 떨어뜨린다', weak: '노리는 적을 고를 수 없다',
    parts: [{ kind: 'strike', range: 420, r: 30, count: 1 }],
    levels: [{ cd: 1.6, dmg: 30 }, { cd: 1.5, dmg: 34 }, { cd: 1.4, dmg: 38, count: 2 }, { cd: 1.3, dmg: 42, count: 2 }, { cd: 1.2, dmg: 48, count: 3 }],
  },
  chain_lightning: {
    name: '연쇄뢰', element: 'fire', motif: 'thunder', glyph: '鏈', color: 0x8fa8ff, role: '밀집 처리',
    how: '가까운 적에서 적으로 번개가 튄다', weak: '적이 흩어져 있으면 튀지 못한다',
    parts: [{ kind: 'chain', range: 360, jumpR: 120, jumps: 2 }],
    levels: [{ cd: 1.4, dmg: 16 }, { cd: 1.3, dmg: 18, jumps: 3 }, { cd: 1.2, dmg: 20, jumps: 3 }, { cd: 1.1, dmg: 22, jumps: 4 }, { cd: 1.0, dmg: 25, jumps: 5 }],
  },
  wind_step: {
    name: '바람결', element: 'wood', motif: 'wind', glyph: '步', color: 0xb6f0d0, role: '기동',
    how: '발이 빨라지고, 가까이 붙는 적을 바람으로 밀어낸다', weak: '피해를 주지 않는다',
    parts: [{ kind: 'aura', r: 70, push: 160, speedMul: 1.1 }],
    levels: [{ dps: 0 }, { dps: 0, speedMul: 1.13 }, { dps: 0, speedMul: 1.16, r: 80 }, { dps: 0, speedMul: 1.2, r: 85 }, { dps: 0, speedMul: 1.25, r: 90 }],
  },
  frost_talisman: {
    name: '빙결부', element: 'water', motif: 'frost', glyph: '冰', color: 0xa8e6ff, role: '감속 제어',
    how: '가까운 적 쪽으로 냉기를 부채꼴로 뿜어 느리게 한다', weak: '피해가 약하다',
    parts: [{ kind: 'cone', r: 160, arc: 1.0, slow: { mul: 0.5, t: 1.5 } }],
    levels: [{ cd: 1.8, dmg: 10 }, { cd: 1.7, dmg: 12 }, { cd: 1.6, dmg: 14, arc: 1.2 }, { cd: 1.5, dmg: 16, arc: 1.3 }, { cd: 1.4, dmg: 19, arc: 1.5 }],
  },
  water_splash: {
    name: '물보라', element: 'water', motif: 'water', glyph: '水', color: 0x5fb7e8, role: '지역 지속',
    how: '발밑에 물장판을 깔아 지나가는 적을 깎는다', weak: '장판을 떠나면 효과가 없다',
    parts: [{ kind: 'zone', at: 'player', zone: 'damage', r: 70, ttl: 3 }],
    levels: [{ cd: 3, dps: 14 }, { cd: 2.8, dps: 17 }, { cd: 2.6, dps: 20, r: 80 }, { cd: 2.4, dps: 23, r: 85 }, { cd: 2.2, dps: 27, r: 90 }],
  },
  spirit_sword: {
    name: '신검부', element: 'metal', motif: 'sword', glyph: '劍', color: 0xd8dde6, role: '원거리 단일',
    how: '비행검이 가까운 적을 쫓아가 찌른다', weak: '한 번에 많이 잡지 못한다',
    parts: [{ kind: 'projectile', target: 'nearest', speed: 360, r: 8, ttl: 2.5, pierce: 1, homing: 4 }],
    levels: [{ cd: 1.2, dmg: 20, count: 1 }, { cd: 1.1, dmg: 23, count: 1 }, { cd: 1.0, dmg: 26, count: 2, spread: 0.5 }, { cd: 0.95, dmg: 29, count: 2, spread: 0.5 }, { cd: 0.9, dmg: 33, count: 3, spread: 0.5 }],
  },
  peach_branch: {
    name: '복숭아나무 가지', element: 'wood', motif: 'peach', glyph: '桃', color: 0xffa6c9, role: '생존',
    how: '주변 귀신에게 큰 피해를 주고 체력을 천천히 채운다', weak: '귀신이 아닌 요괴에게는 약하다',
    parts: [{ kind: 'aura', r: 90, push: 0, ghostMul: 3 }],
    levels: [{ dps: 4, heal: 0.8 }, { dps: 5, heal: 1.0 }, { dps: 6, heal: 1.2, r: 100 }, { dps: 7, heal: 1.4, r: 105 }, { dps: 8, heal: 1.6, r: 110 }],
  },
  // ── 합체 부적(레시피로만 얻는다) ──
  hwaryongpung: {
    fusion: true, name: '화룡풍', element: 'fire', motif: 'fire', glyph: '龍', color: 0xff5a1f,
    how: '바라보는 방향으로 불꽃 회오리 세 줄기를 집중한다', weak: '등 뒤가 빈다',
    parts: [{ kind: 'projectile', target: 'facing', speed: 340, r: 22, ttl: 1.8, pierce: 99, spread: 0.22 }],
    levels: [{ cd: 1.1, dmg: 30, count: 3 }, { cd: 1.0, dmg: 36, count: 3 }, { cd: 0.9, dmg: 44, count: 4 }],
  },
  firewind_step: {
    fusion: true, name: '불바람 걸음', element: 'fire', motif: 'wind', glyph: '焰', color: 0xff9e3d,
    how: '실제로 움직인 거리만큼 불길을 남긴다 — 적을 불길 위로 끌고 다닌다', weak: '새로 나타난 적을 바로 잡지 못한다',
    parts: [{ kind: 'trail', step: 36, r: 26, ttl: 2.5, max: 24 }],
    levels: [{ dps: 30 }, { dps: 38, ttl: 3 }, { dps: 48, ttl: 3.5, r: 30 }],
  },
  boundary_ward: {
    fusion: true, name: '경계 결계', element: 'metal', motif: 'bell', glyph: '界', color: 0xf7e7a1,
    how: '몸 주변에 결계를 둘러 요괴를 원 밖으로 밀어낸다', weak: '결계 밖의 적은 잡지 못한다',
    parts: [{ kind: 'aura', r: 110, push: 260, bossMul: 3 }],
    levels: [{ dps: 24 }, { dps: 30, r: 125 }, { dps: 38, r: 140 }],
  },
  bean_bell_trap: {
    fusion: true, name: '팥방울 덫', element: 'earth', motif: 'bean', glyph: '罠', color: 0xe0564a,
    how: '밟으면 터지는 팥방울을 주변에 깐다', weak: '설치형이라 빨리 움직이면 뒤처진다',
    parts: [{ kind: 'zone', at: 'around', zone: 'mine', r: 22, blast: 80, ttl: 12, count: 3, spread: 140 }],
    levels: [{ cd: 2.0, dmg: 40 }, { cd: 1.8, dmg: 50, count: 4 }, { cd: 1.6, dmg: 62, count: 5 }],
  },
  storm_array: {
    fusion: true, name: '뇌우진', element: 'water', motif: 'thunder', glyph: '陣', color: 0x7fb2ff,
    how: '물장판을 깔고, 그 위의 적에게 번개가 연달아 떨어진다', weak: '장판 밖의 적은 번개를 맞지 않는다',
    parts: [{ kind: 'zone', at: 'player', zone: 'damage', r: 95, ttl: 4 }, { kind: 'strike', range: 420, r: 40, count: 3, inOwnZones: true }],
    levels: [{ cd: 1.4, parts: [{ dps: 10 }, { dmg: 45 }] }, { cd: 1.3, parts: [{ dps: 12 }, { dmg: 54 }] }, { cd: 1.2, parts: [{ dps: 14 }, { dmg: 64, count: 4 }] }],
  },
  lightning_rain: {
    fusion: true, name: '번개 비', element: 'fire', motif: 'thunder', glyph: '霆', color: 0xc3cbff,
    how: '넓은 범위에 낙뢰를 흩뿌리고 맞은 적을 느리게 한다', weak: '한 대 한 대가 약하다',
    parts: [{ kind: 'strike', range: 340, r: 34, slow: { mul: 0.6, t: 1 } }],
    levels: [{ cd: 1.2, dmg: 22, count: 6 }, { cd: 1.1, dmg: 26, count: 7 }, { cd: 1.0, dmg: 30, count: 8 }],
  },
  thunder_sword: {
    fusion: true, name: '뇌신검', element: 'metal', motif: 'sword', glyph: '神', color: 0xe6ecff,
    how: '번개를 두른 비행검이 적을 쫓고, 맞힐 때마다 번개가 튄다', weak: '적이 드문드문하면 번개가 튈 곳이 없다',
    parts: [{ kind: 'projectile', target: 'nearest', speed: 380, r: 10, ttl: 2.5, pierce: 1, homing: 5, chainOnHit: { jumps: 2, jumpR: 140, dmgMul: 0.6 } }],
    levels: [{ cd: 1.3, dmg: 32, count: 1 }, { cd: 1.2, dmg: 36, count: 1 }, { cd: 1.1, dmg: 42, count: 2, spread: 0.5 }],
  },
  sword_rain: {
    fusion: true, name: '검우', element: 'metal', motif: 'sword', glyph: '雨', color: 0xc0c8d4,
    how: '예고 뒤 검이 쏟아져 넓은 땅을 쓸어버린다', weak: '떨어지기까지 0.6초가 걸린다',
    parts: [{ kind: 'strike', range: 420, r: 46, delay: 0.6 }],
    levels: [{ cd: 1.8, dmg: 60, count: 5 }, { cd: 1.7, dmg: 70, count: 6 }, { cd: 1.6, dmg: 82, count: 7 }],
  },
  peach_foxfire: {
    fusion: true, name: '도화귀화', element: 'fire', motif: 'peach', glyph: '花', color: 0xff8fb5,
    how: '복사꽃 불이 몸 주위를 돌며, 맞힌 만큼 체력을 되찾는다', weak: '궤도 밖으로는 닿지 않는다',
    parts: [{ kind: 'orbit', count: 4, R: 72, w: 3.4, r: 14, lifesteal: 0.04, ghostMul: 2, bossMul: 3 }],
    levels: [{ dps: 34 }, { dps: 42, count: 5 }, { dps: 52, count: 6 }],
  },
  peach_ward: {
    fusion: true, name: '도화결계', element: 'wood', motif: 'peach', glyph: '結', color: 0xf3e6ff,
    how: '복사꽃 넷이 몸 주위를 돌고, 멈춰 서 있으면 결계가 펼쳐져 귀신을 녹이고 체력을 채운다', weak: '움직이는 동안에는 결계가 꺼진다',
    parts: [{ kind: 'aura', r: 150, push: 0, stillOnly: true, ghostMul: 3 }, { kind: 'orbit', count: 4, R: 80, w: 3.2, r: 14, ghostMul: 2, bossMul: 2, lifesteal: 0.03 }],
    // parts[0] = 결계(멈춰 있을 때), parts[1] = 복사꽃 궤도(늘, 약하게)
    levels: [{ heal: 2.5, parts: [{ dps: 40 }, { dps: 18 }] }, { heal: 3, parts: [{ dps: 50 }, { dps: 22 }] }, { heal: 4, parts: [{ dps: 62 }, { dps: 26 }] }],
  },
  blizzard_step: {
    fusion: true, name: '눈보라 걸음', element: 'water', motif: 'frost', glyph: '雪', color: 0xe0f4ff,
    how: '지나간 길이 얼어붙어 적을 느리게 하고 깎는다. 발도 빨라진다', weak: '눈길 밖의 적은 그대로 달려든다',
    parts: [{ kind: 'trail', step: 34, r: 28, ttl: 2.5, max: 24, slow: { mul: 0.6, t: 1.2 }, bossMul: 2 }, { kind: 'aura', r: 0, push: 0, speedMul: 1.2 }],
    levels: [{ parts: [{ dps: 14 }] }, { parts: [{ dps: 18, ttl: 3 }] }, { parts: [{ dps: 23, ttl: 3.5 }] }],
  },
  north_wind: {
    fusion: true, name: '삭풍', element: 'water', motif: 'wind', glyph: '朔', color: 0x9fd8ff,
    how: '주기적으로 찬바람을 터뜨려 적을 날려 보내고 얼린다', weak: '보스는 밀려나지 않는다',
    parts: [{ kind: 'shockwave', r: 140, knock: 90, slow: { mul: 0.5, t: 2 } }],
    levels: [{ cd: 2.2, dmg: 24 }, { cd: 2.0, dmg: 30 }, { cd: 1.8, dmg: 37, r: 155 }],
  },
};
if (typeof module !== 'undefined') module.exports = BJ_TALISMANS;
