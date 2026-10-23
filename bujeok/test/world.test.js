const test = require('node:test');
const assert = require('node:assert');
const W = require('../engine/world.js');

test('near는 반경 안 후보를 담고 먼 것은 뺀다(음수 좌표 포함)', () => {
  const h = W.createHash(64);
  const a = { x: 10, y: 10 }, b = { x: -30, y: 5 }, c = { x: 1000, y: 1000 };
  W.build(h, [a, b, c]);
  const out = W.near(h, 0, 0, 50);
  assert.ok(out.includes(a) && out.includes(b));
  assert.ok(!out.includes(c));
});

test('죽은 개체는 담지 않는다', () => {
  const h = W.createHash(64);
  const a = { x: 0, y: 0, dead: 1 };
  W.build(h, [a]);
  assert.deepStrictEqual(W.near(h, 0, 0, 50), []);
});

test('nearest는 가장 가까운 것, 범위 밖이면 null', () => {
  const h = W.createHash(64);
  const a = { x: 10, y: 10 }, b = { x: -30, y: 5 };
  W.build(h, [a, b]);
  assert.strictEqual(W.nearest(h, 0, 0, 100), a);
  assert.strictEqual(W.nearest(h, 500, 500, 100), null);
});
