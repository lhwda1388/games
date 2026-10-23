const test = require('node:test');
const assert = require('node:assert');
const C = require('../content/index.js');
const SIM = require('../engine/sim.js');
const ENT = require('../engine/entities.js');
const PAT = require('../engine/patterns.js');

const E = {
  ...C.enemies,
  t_split: { name: 's', glyph: 's', color: 0xffffff, hp: 10, speed: 40, r: 12, dmg: 1, xp: 1, split: { enemy: 't_bit', count: 2 } },
  t_bit: { name: 'b', glyph: 'b', color: 0xffffff, hp: 3, speed: 90, r: 8, dmg: 1, xp: 0, codex: false },
  t_hop: { name: 'h', glyph: 'h', color: 0xffffff, hp: 20, speed: 40, r: 10, dmg: 1, xp: 1, pattern: { kind: 'hop', every: 1.2, speed: 400, dur: 0.3 } },
  t_flee: { name: 'f', glyph: 'f', color: 0xffffff, hp: 30, speed: 90, r: 10, dmg: 0, xp: 0, life: 12, pattern: { kind: 'flee', minR: 180, maxR: 260 }, drop: { coin: 5 } },
};
const C2 = { ...C, enemies: E };
const mk = () => { const s = SIM.create(C2, { seed: 4, heroId: 'yeonhwa', chapterId: 'tutorial', runId: 'e' }); s.slots = []; return s; };
const safe = C.rules.spawn.safeRadius;

test('적 split: 죽으면 분열체 count마리, 안전 반경 밖', () => {
  for (const x0 of [400, 30]) {
    const s = mk(), e = ENT.spawnEnemy(s, C2, 't_split', x0, 0);
    e.dead = 1;
    SIM.step(s, C2, {}, 1 / 60);
    const bits = s.enemies.filter(q => q.id === 't_bit');
    assert.strictEqual(bits.length, 2, `x0=${x0}`);
    for (const b of bits) assert.ok(Math.hypot(b.x - s.player.x, b.y - s.player.y) >= safe - 1e-6, `x0=${x0}`);
  }
});

test('적 split: 수명 만료(퇴장)로 사라지면 분열하지 않는다', () => {
  const s = mk(), e = ENT.spawnEnemy(s, C2, 't_split', 400, 0);
  e.dead = 1; e.left = 1;
  SIM.step(s, C2, {}, 1 / 60);
  assert.strictEqual(s.enemies.filter(q => q.id === 't_bit').length, 0);
});

test('hop: every초 동안 평소 속도 → dur초 동안 speed로 도약, warn 단계 없음', () => {
  const s = mk(), e = { uid: 7, id: 't_hop', x: 0, y: -300 }, dt = 1 / 60;
  let sawWarn = false;
  for (let i = 0; i < 72; i++) { PAT.move(s, C2, e, dt); sawWarn = sawWarn || e.ph === 'warn'; }
  assert.ok(Math.abs(e.y - (-300 + 40 * 1.2)) < 1, `${e.y}`);
  const y0 = e.y;
  for (let i = 0; i < 18; i++) { PAT.move(s, C2, e, dt); sawWarn = sawWarn || e.ph === 'warn'; }
  assert.ok(Math.abs((e.y - y0) - 400 * 0.3) < 400 * dt * 1.5, `${e.y - y0}`);
  assert.strictEqual(sawWarn, false);
});

test('flee: 가까우면 달아나고, 멀면 다가와서 [minR, maxR] 띠 안에 머문다', () => {
  const s = mk(), near = { uid: 8, id: 't_flee', x: 100, y: 0 };
  PAT.move(s, C2, near, 0.5);
  assert.ok(Math.abs(near.x - 145) < 1e-9 && Math.abs(near.y) < 1e-9, `${near.x},${near.y}`);
  const far = { uid: 9, id: 't_flee', x: 640, y: 0 };
  for (let i = 0; i < 600; i++) PAT.move(s, C2, far, 1 / 60);
  const d = Math.hypot(far.x, far.y);
  assert.ok(d >= 180 - 1e-6 && d <= 260 + 2, `${d}`);
});

test('drop: 죽으면 엽전 구슬, 수명으로 사라지면 없음', () => {
  const s = mk(), e = ENT.spawnEnemy(s, C2, 't_flee', 300, 0);
  e.dead = 1;
  SIM.step(s, C2, {}, 1 / 60);
  assert.ok(s.gems.some(g => g.coin === 5 && g.xp === 0));
  const s2 = mk(), e2 = ENT.spawnEnemy(s2, C2, 't_flee', 300, 0);
  e2.age = 12;
  SIM.step(s2, C2, {}, 1 / 60);
  assert.ok(!s2.gems.some(g => g.coin));
});

test('접촉 피해 0인 적은 닿아도 무적 시간·lastHit을 만들지 않는다', () => {
  const s = mk();
  ENT.spawnEnemy(s, C2, 't_flee', 5, 0);
  const hp = s.player.hp;
  SIM.step(s, C2, {}, 1 / 60);
  assert.strictEqual(s.player.hp, hp);
  assert.ok(!(s.player.invuln > 0));
  assert.strictEqual(s.lastHit, null);
});

test('모든 적 pattern.kind는 엔진 패턴에 있다', () => {
  for (const [id, d] of Object.entries(C.enemies)) if (d.pattern) assert.ok(PAT.KINDS[d.pattern.kind], `${id}: ${d.pattern.kind}`);
  assert.ok(PAT.KINDS.hop && PAT.KINDS.flee);
});

test('콘텐츠 검사: split 대상 없음, 연쇄 분열, 잘못된 개수·엽전', () => {
  const bad = { ...C, enemies: { ...C.enemies, t_bit: E.t_bit,
    a1: { ...E.t_split, split: { enemy: 'nope', count: 1 } },
    a2: { ...E.t_split, split: { enemy: 'a3', count: 1 } },
    a3: { ...E.t_split, split: { enemy: 't_bit', count: 1 } },
    a4: { ...E.t_split, split: { enemy: 't_bit', count: 0 } },
    a5: { ...E.t_bit, drop: { coin: 0 } },
  } };
  const errs = C.validate(bad);
  for (const k of ['a1', 'a2', 'a4', 'a5']) assert.ok(errs.some(e => e.includes('enemy ' + k)), k + ': ' + errs.join(' | '));
  assert.ok(!errs.some(e => e.includes('enemy a3')), errs.join(' | '));
  assert.deepStrictEqual(C.validate(C), []);
});

const ART = require('../art/index.js');

// 웨이브 체력 총량(챕터 mods·변이 제외). 기준값은 이 계획을 쓸 때(VERSION 13) 잰 값이다
const BASE_HP = { tutorial: 25749, dokkaebi_pass: 60995, fox_forest: 59132 };
function waveHp(ch) {
  const E = C.enemies, hpOf = id => E[id].hp + (E[id].split ? E[id].split.count * E[E[id].split.enemy].hp : 0);
  return ch.waves.reduce((a, w) => a + (w.to - w.from) / w.every * w.count * hpOf(w.enemy) * (w.elite ? C.rules.elite.hp : 1), 0);
}

test('웨이브 체력 총량: 챕터마다 기존 대비 ±3%', () => {
  for (const [id, base] of Object.entries(BASE_HP)) {
    const now = waveHp(C.chapters[id]);
    assert.ok(Math.abs(now / base - 1) <= 0.03, `${id}: ${Math.round(now)} vs ${base}`);
  }
});

test('입문·1챕터 새 요괴 5종(스펙 2절)', () => {
  const E = C.enemies;
  assert.deepStrictEqual([E.mongdal.hp, E.mongdal.speed, E.mongdal.r, E.mongdal.dmg, E.mongdal.xp, E.mongdal.ghost], [6, 115, 8, 3, 1, true]);
  assert.strictEqual(E.mongdal.pattern, undefined);
  assert.deepStrictEqual([E.stone_dokkaebi.hp, E.stone_dokkaebi.speed, E.stone_dokkaebi.xp], [20, 50, 2]);
  assert.strictEqual(E.stone_dokkaebi.pattern.kind, 'ranged');
  assert.deepStrictEqual([E.stone_dokkaebi.pattern.range, E.stone_dokkaebi.pattern.every, E.stone_dokkaebi.pattern.count, E.stone_dokkaebi.pattern.warn], [220, 3.5, 1, 0.7]);
  assert.deepStrictEqual(E.broom_dokkaebi.split, { enemy: 'poker_dokkaebi', count: 2 });
  assert.deepStrictEqual([E.broom_dokkaebi.hp, E.broom_dokkaebi.speed, E.broom_dokkaebi.xp], [45, 45, 3]);
  assert.deepStrictEqual([E.poker_dokkaebi.hp, E.poker_dokkaebi.xp, E.poker_dokkaebi.codex], [8, 0, false]);
  assert.deepStrictEqual(E.one_leg.pattern, { kind: 'hop', every: 1.2, speed: 400, dur: 0.3 });
});

test('웨이브: 입문에 몽달귀·돌팔매, 1챕터에 빗자루·외다리·돌팔매(300초부터)', () => {
  const ids = ch => new Set(C.chapters[ch].waves.map(w => w.enemy));
  for (const id of ['mongdal', 'stone_dokkaebi']) assert.ok(ids('tutorial').has(id), id);
  for (const id of ['broom_dokkaebi', 'one_leg', 'stone_dokkaebi']) assert.ok(ids('dokkaebi_pass').has(id), id);
  assert.ok(C.chapters.dokkaebi_pass.waves.filter(w => w.enemy === 'stone_dokkaebi').every(w => w.from >= 300));
});

test('새 요괴 그림: 크기(스펙 3절)', () => {
  const want = { mongdal: 16, stone_dokkaebi: 18, broom_dokkaebi: 24, poker_dokkaebi: 16, one_leg: 20 };
  for (const [id, w] of Object.entries(want)) {
    const s = ART.sprites['e:' + id];
    assert.ok(s, id);
    assert.strictEqual(s.frames[0][0].length, w, id);
  }
  assert.ok(ART.sprites['e:one_leg'].frames.length >= 2, '외다리: 웅크림·폄 2프레임');
});

const HEAL = { ...E, t_healer: { name: 'h', glyph: 'h', color: 0xffffff, hp: 40, speed: 40, r: 13, dmg: 5, xp: 3, ghost: true, aura: { heal: 4, r: 120, ghostsOnly: true } } };
const CH = { ...C, enemies: HEAL };

test('aura heal: 범위 안 다른 귀신만 회복(보스·정예·자신·범위 밖·귀신 아님 제외)', () => {
  const s = SIM.create(CH, { seed: 4, heroId: 'yeonhwa', chapterId: 'tutorial', runId: 'h' });
  const h = ENT.spawnEnemy(s, CH, 't_healer', 400, 0);
  const g = ENT.spawnEnemy(s, CH, 'japgwi', 450, 0), far = ENT.spawnEnemy(s, CH, 'japgwi', 600, 0);
  const nog = ENT.spawnEnemy(s, CH, 'little_dokkaebi', 420, 0), el = ENT.spawnEnemy(s, CH, 'japgwi', 430, 0, { elite: true });
  const boss = ENT.spawnEnemy(s, CH, 'one_eye', 410, 30);
  for (const x of [h, g, far, nog, el, boss]) x.hp = x.maxHp - 3;
  PAT.move(s, CH, h, 0.5);
  assert.ok(Math.abs(g.hp - (g.maxHp - 1)) < 1e-9, `${g.hp}`); // 4 × 0.5
  for (const [x, n] of [[h, 'self'], [far, 'far'], [nog, 'not ghost'], [el, 'elite'], [boss, 'boss']]) assert.strictEqual(x.hp, x.maxHp - 3, n);
});

test('aura heal: 겹친 치유사 둘 — 귀신은 틱마다 한 번만, 치유사끼리는 회복하지 않는다', () => {
  const s = SIM.create(CH, { seed: 4, heroId: 'yeonhwa', chapterId: 'tutorial', runId: 'h' });
  const h1 = ENT.spawnEnemy(s, CH, 't_healer', 400, 0), h2 = ENT.spawnEnemy(s, CH, 't_healer', 440, 0), g = ENT.spawnEnemy(s, CH, 'japgwi', 420, 0);
  g.hp = 1; g.maxHp = 100; h1.hp = h2.hp = 10;
  PAT.move(s, CH, h1, 0.5); PAT.move(s, CH, h2, 0.5); // 같은 틱(state.t 그대로)
  assert.ok(Math.abs(g.hp - 3) < 1e-9, `${g.hp}`); // 4 × 0.5 한 번
  assert.deepStrictEqual([h1.hp, h2.hp], [10, 10]);
  s.t += 0.5; // 다음 틱
  PAT.move(s, CH, h1, 0.5); PAT.move(s, CH, h2, 0.5);
  assert.ok(Math.abs(g.hp - 5) < 1e-9, `${g.hp}`);
});

test('aura heal: 최대 체력을 넘지 않는다', () => {
  const s = SIM.create(CH, { seed: 4, heroId: 'yeonhwa', chapterId: 'tutorial', runId: 'h' });
  const h = ENT.spawnEnemy(s, CH, 't_healer', 400, 0), g = ENT.spawnEnemy(s, CH, 'japgwi', 430, 0);
  g.hp = g.maxHp - 0.5;
  PAT.move(s, CH, h, 1);
  assert.strictEqual(g.hp, g.maxHp);
});

test('콘텐츠 검사: aura 모르는 키·잘못된 값', () => {
  const bad = { ...C, enemies: { ...C.enemies, b1: { ...HEAL.t_healer, aura: { heal: 4, r: 120, radius: 3 } }, b2: { ...HEAL.t_healer, aura: { heal: 0, r: 120 } }, b3: { ...HEAL.t_healer, aura: { heal: 4, r: -1 } } } };
  const errs = C.validate(bad);
  for (const k of ['b1', 'b2', 'b3']) assert.ok(errs.some(e => e.includes('enemy ' + k)), k + ': ' + errs.join(' | '));
});

test('2챕터 새 요괴 3종 + 혼불(스펙 2절)', () => {
  const E2 = C.enemies;
  assert.deepStrictEqual([E2.yagwang.hp, E2.yagwang.speed, E2.yagwang.ghost], [16, 75, true]);
  assert.deepStrictEqual(E2.yagwang.pattern, { kind: 'charge', every: 3.5, warn: 0.6, speed: 380, dur: 0.3 });
  assert.deepStrictEqual([E2.orb_fox.hp, E2.orb_fox.ghost, E2.orb_fox.pattern.kind, E2.orb_fox.pattern.count, E2.orb_fox.pattern.spread], [24, true, 'ranged', 2, 0.25]);
  assert.deepStrictEqual([E2.songaksi.hp, E2.songaksi.speed, E2.songaksi.ghost], [40, 40, true]);
  assert.deepStrictEqual([E2.songaksi.aura.heal, E2.songaksi.aura.r, E2.songaksi.aura.ghostsOnly], [4, 120, true]);
  assert.deepStrictEqual([E2.honbul.hp, E2.honbul.speed, E2.honbul.life, E2.honbul.dmg, E2.honbul.drop.coin, E2.honbul.pattern.kind], [30, 90, 12, 0, 5, 'flee']);
});

test('웨이브: 2챕터에 새 셋, 혼불은 1·2챕터에 판마다 2~3번', () => {
  const ids = new Set(C.chapters.fox_forest.waves.map(w => w.enemy));
  for (const id of ['yagwang', 'orb_fox', 'songaksi']) assert.ok(ids.has(id), id);
  for (const ch of ['dokkaebi_pass', 'fox_forest']) {
    const n = C.chapters[ch].waves.filter(w => w.enemy === 'honbul').reduce((a, w) => a + Math.floor((w.to - w.from) / w.every) * w.count, 0);
    assert.ok(n >= 2 && n <= 3, `${ch}: ${n}`);
  }
  assert.ok(!C.chapters.tutorial.waves.some(w => w.enemy === 'honbul'));
  for (const w of C.chapters.fox_forest.waves) if (w.enemy !== 'honbul') assert.ok(C.enemies[w.enemy].ghost, `2챕터 일반 요괴는 모두 귀신: ${w.enemy}`);
});

test('2챕터·혼불 그림: 크기, 혼불 3프레임', () => {
  const want = { yagwang: 18, orb_fox: 20, songaksi: 22, honbul: 16 };
  for (const [id, w] of Object.entries(want)) {
    const s = ART.sprites['e:' + id];
    assert.ok(s, id);
    assert.strictEqual(s.frames[0][0].length, w, id);
  }
  assert.strictEqual(ART.sprites['e:honbul'].frames.length, 3);
});
