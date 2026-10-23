const test = require('node:test');
const assert = require('node:assert');
const C = require('../content/index.js');
const SIM = require('../engine/sim.js');
const ENT = require('../engine/entities.js');

test('맞으면 hits에 uid, 처치하면 kills, 플레이어가 맞으면 hurts가 기록된다', () => {
  const s = SIM.create(C, { seed: 3, heroId: 'yeonhwa', chapterId: 'tutorial', runId: 'j' });
  const e = ENT.spawnEnemy(s, C, 'japgwi', 0, -60);
  ENT.hurt(s, e, 1, 'bell');
  assert.strictEqual(s.fx.hits.at(-1).uid, e.uid);
  ENT.hitPlayer(s, C, 1, 'japgwi');
  assert.strictEqual(s.fx.hurts.length, 1);
  ENT.hurt(s, e, 999, 'bell');
  SIM.step(s, C, { x: 0, y: 0 }, 1 / 60);
  assert.ok(s.fx.kills.some(k => k.id === 'japgwi'));
});

test('fx 기록은 RNG를 쓰지 않는다', () => {
  const a = SIM.create(C, { seed: 9, heroId: 'yeonhwa', chapterId: 'tutorial', runId: 'a' });
  const b = SIM.create(C, { seed: 9, heroId: 'yeonhwa', chapterId: 'tutorial', runId: 'a' });
  for (let i = 0; i < 600; i++) { SIM.step(a, C, { x: 0, y: 0 }, 1 / 60); SIM.step(b, C, { x: 0, y: 0 }, 1 / 60); b.fx.kills.length = 0; b.fx.hurts.length = 0; b.fx.hits.length = 0; }
  assert.deepStrictEqual(a.rng, b.rng);
});

test('rules.juice 값이 있다', () => {
  for (const k of ['flash', 'squash', 'shards', 'killShards', 'maxShards', 'soul', 'hitstop', 'shake', 'shakeTime', 'hurtEdge']) assert.strictEqual(typeof C.rules.juice[k], 'number', k);
});
