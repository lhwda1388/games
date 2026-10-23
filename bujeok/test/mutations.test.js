const test = require('node:test');
const assert = require('node:assert');
const C = require('../content/index.js');
const SIM = require('../engine/sim.js');
const ENT = require('../engine/entities.js');
const SP = require('../engine/spawner.js');

const mk = (mutation, chapterId = 'dokkaebi_pass') => { const s = SIM.create(C, { seed: 5, heroId: 'yeonhwa', chapterId, runId: 'm' }); s.mutation = mutation; s.slots = []; return s; };

test('입문은 변이가 없고, 정규 챕터는 시드로 하나를 고르고 시작 알림을 낸다', () => {
  assert.strictEqual(SIM.create(C, { seed: 1, heroId: 'yeonhwa', chapterId: 'tutorial', runId: 'x' }).mutation, null);
  const s = SIM.create(C, { seed: 1, heroId: 'yeonhwa', chapterId: 'dokkaebi_pass', runId: 'x' });
  assert.ok(C.mutations[s.mutation]);
  assert.ok(s.fx.notices.some(n => n.includes(C.mutations[s.mutation].name)));
});

test('대상 적 체력·속도 배수, 귀신 전체 대상', () => {
  const s = mk('thick_hide');
  const e = ENT.spawnEnemy(s, C, 'little_dokkaebi', 400, 0);
  assert.ok(Math.abs(e.hp - C.enemies.little_dokkaebi.hp * C.chapters.dokkaebi_pass.mods.enemyHp * 1.6) < 1e-9);
  const g = mk('swift_ghosts');
  const ghost = ENT.spawnEnemy(g, C, 'egg_ghost', 400, 0), normal = ENT.spawnEnemy(g, C, 'little_dokkaebi', 400, 50);
  assert.strictEqual(ghost.spdMul, 1.3);
  assert.strictEqual(normal.spdMul, undefined);
  assert.ok(Math.abs(ENT.speed(C, ghost) - C.enemies.egg_ghost.speed * 1.3) < 1e-9);
});

test('갈라짐: 대상이 죽으면 작은 적 count마리', () => {
  const s = mk('split_fire');
  const e = ENT.spawnEnemy(s, C, 'dokkaebi_fire', 400, 0);
  ENT.hurt(s, e, 1e9, 'x');
  SIM.step(s, C, {}, 1 / 60);
  assert.strictEqual(s.enemies.filter(x => x.id === C.mutations.split_fire.split.enemy).length, C.mutations.split_fire.split.count);
});

test('대담한 무리: 웨이브 소환 수에 배수(소수점은 확률)', () => {
  const s = mk('bold_horde'), base = mk(null);
  for (const st of [s, base]) for (let i = 1; i <= 60; i++) { st.t = i; SP.tick(st, C, 1); }
  assert.ok(s.enemies.length > base.enemies.length);
});

test('결과에 변이 이름', () => {
  const s = mk('thick_hide');
  assert.strictEqual(SIM.result(s, C).mutation, C.mutations.thick_hide.name);
});

test('챕터별 변이: 고른 변이의 대상은 그 챕터에 나오는 적이다(2챕터에 도깨비불 변이 없음)', () => {
  const present = ch => new Set([...ch.waves.map(w => w.enemy), ...ch.bosses.map(b => b.enemy)]);
  for (const chId of ['dokkaebi_pass', 'fox_forest']) {
    const ch = C.chapters[chId], seen = new Set();
    for (let seed = 1; seed <= 60; seed++) {
      const s = SIM.create(C, { seed, heroId: 'yeonhwa', chapterId: chId, runId: 'x' }), mu = C.mutations[s.mutation];
      seen.add(s.mutation);
      if (mu.target) assert.ok(present(ch).has(mu.target), `${chId}: ${s.mutation}`);
      if (mu.ghosts) assert.ok([...present(ch)].some(id => C.enemies[id].ghost), `${chId}: ${s.mutation}`);
    }
    assert.ok(seen.size >= 2, chId);
  }
  assert.ok(!C.chapters.fox_forest.mutations.includes('split_fire'));
});

test('챕터 mutations 목록 검사: 없는 변이, 챕터에 없는 대상을 잡는다', () => {
  const bad = { ...C, chapters: { ...C.chapters, fox_forest: { ...C.chapters.fox_forest, mutations: ['nope', 'split_fire'] } } };
  const err = C.validate(bad).join('\n');
  assert.match(err, /nope/);
  assert.match(err, /split_fire/);
});

test('갈라진 작은 적도 플레이어 안전 반경 밖에 나온다', () => {
  const s = mk('split_fire');
  const e = ENT.spawnEnemy(s, C, 'dokkaebi_fire', 30, 0);
  ENT.hurt(s, e, 1e9, 'x');
  SIM.step(s, C, {}, 1 / 60);
  const small = s.enemies.filter(x => x.id === C.mutations.split_fire.split.enemy);
  assert.strictEqual(small.length, C.mutations.split_fire.split.count);
  for (const x of small) assert.ok(Math.hypot(x.x - s.player.x, x.y - s.player.y) >= C.rules.spawn.safeRadius - 5, `${x.x},${x.y}`);
});
