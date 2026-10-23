const test = require('node:test');
const assert = require('node:assert');
const ENT = require('../engine/entities.js');

const content = {
  rules: { limits: { enemies: 2 }, elite: { hp: 3, r: 1.3, dmg: 1.5, xp: 3 }, enrage: { speedMul: 1.2, dmgMul: 1.5 }, player: { invuln: 0.5 } },
  enemies: { a: { hp: 10, r: 10, dmg: 5, speed: 50 }, boss: { hp: 100, r: 30, dmg: 9, speed: 40, boss: true } },
  chapters: { easy: { mods: { enemyHp: 2, enemyDmg: 0.5 } } },
};
const mk = (chapterId) => ({ chapterId, nextUid: 1, enemies: [], stats: { damageBy: {} }, fx: ENT.freshFx(), player: { hp: 100, invuln: 0 } });

test('적 생성: uid 증가, 개수 상한, 보스는 상한 무시', () => {
  const s = mk();
  assert.strictEqual(ENT.spawnEnemy(s, content, 'a', 0, 0).uid, 1);
  assert.strictEqual(ENT.spawnEnemy(s, content, 'a', 1, 0).uid, 2);
  assert.strictEqual(ENT.spawnEnemy(s, content, 'a', 2, 0), null);
  assert.ok(ENT.spawnEnemy(s, content, 'boss', 3, 0));
});

test('정예 배율은 rules.elite에서', () => {
  const e = ENT.spawnEnemy(mk(), content, 'a', 0, 0, { elite: true });
  assert.strictEqual(e.hp, 30);
  assert.strictEqual(ENT.radius(content, e), 13);
  assert.strictEqual(ENT.damage(content, e), 7.5);
});

test('챕터 보정: 체력 배수, 플레이어가 받는 피해 배수', () => {
  const s = mk('easy');
  assert.strictEqual(ENT.spawnEnemy(s, content, 'a', 0, 0).hp, 20);
  assert.strictEqual(ENT.hitPlayer(s, content, 10, 'a'), true);
  assert.strictEqual(s.player.hp, 95);
  assert.strictEqual(ENT.hitPlayer(s, content, 10, 'a'), false); // 무적 시간
  assert.strictEqual(s.lastHit, 'a');
});

test('피해: 준 피해를 돌려주고, 기여도는 남은 체력까지만', () => {
  const s = mk();
  const e = ENT.spawnEnemy(s, content, 'a', 0, 0);
  assert.strictEqual(ENT.hurt(s, e, 0.5, 'bell'), 0.5);
  assert.strictEqual(s.fx.hits.length, 0);
  assert.strictEqual(ENT.hurt(s, e, 50, 'bell'), 9.5);
  assert.strictEqual(e.dead, 1);
  assert.strictEqual(ENT.hurt(s, e, 50, 'bell'), 0);
});

test('폭주 단계와 느려짐이 속도·피해에 곱해진다', () => {
  const e = { id: 'boss', rage: 2 };
  assert.ok(Math.abs(ENT.speed(content, e) - 40 * 1.44) < 1e-9);
  assert.ok(Math.abs(ENT.damage(content, e) - 9 * 2.25) < 1e-9);
  const f = { id: 'a' };
  ENT.applySlow(f, { mul: 0.5, t: 1 });
  ENT.applySlow(f, { mul: 0.7, t: 2 });
  assert.strictEqual(f.slowMul, 0.5);
  assert.strictEqual(f.slowT, 2);
  assert.strictEqual(ENT.speed(content, f), 25);
});
