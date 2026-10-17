// 3b 연출의 순수 함수(변이 단계·공명 이웃) — 그리기 없이 node 에서
const test = require('node:test');
const assert = require('node:assert');
const X = require('../fx3b.js');

test('변이 단계: 마이셀 유닛만, 처치 3·8 문턱, e.mut 우선', () => {
  const sw = kills => ({ def: { race: 'swarm' }, kills });
  assert.deepStrictEqual([0, 2, 3, 7, 8, 20].map(k => X.mutStage(sw(k), {})), [0, 0, 1, 1, 2, 2]);
  const D = { races: { swarm: { mutation: { at: [1, 2] } } } };
  assert.strictEqual(X.mutStage(sw(1), D), 1);
  assert.strictEqual(X.mutStage({ def: { race: 'legion' }, kills: 9 }, {}), 0);
  assert.strictEqual(X.mutStage({ def: { race: 'swarm' }, isB: true, kills: 9 }, {}), 0);
  assert.strictEqual(X.mutStage({ def: { race: 'swarm' }, mut: 2 }, {}), 2);
});

test('공명: 같은 주인·종류만, 반경 안 이웃 수(최대 cap), 선은 n ≥ 2 끼리 중복 없이', () => {
  const u = (id, x, y, type = 'oathblade', owner = 0) => ({ id, owner, type, x, y });
  const list = [u(1, 0, 0), u(2, 50, 0), u(3, 0, 50), u(4, 500, 0), u(5, 10, 10, 'arcwalker'), u(6, 20, 20, 'oathblade', 1)];
  const { n, links } = X.resonance(list, 128, 4);
  assert.deepStrictEqual([1, 2, 3].map(i => n.get(i)), [2, 2, 2]);
  assert.strictEqual(n.has(4), false); assert.strictEqual(n.has(5), false); assert.strictEqual(n.has(6), false);
  assert.strictEqual(links.length, 3);
  assert.strictEqual(new Set(links.map(l => l.join('|'))).size, 3);
  const many = Array.from({ length: 7 }, (_, i) => u(10 + i, i * 5, 0));
  assert(Math.max(...X.resonance(many, 128, 4).n.values()) === 4);
  const pair = X.resonance([u(1, 0, 0), u(2, 10, 0)], 128, 4);
  assert.strictEqual(pair.links.length, 0);                                     // n = 1 은 선 없음
});
