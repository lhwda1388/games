const test = require('node:test');
const assert = require('node:assert');
const RNG = require('../engine/rng.js');

test('같은 시드는 같은 수열', () => {
  const a = RNG.create(42), b = RNG.create(42);
  for (let i = 0; i < 100; i++) assert.strictEqual(RNG.next(a), RNG.next(b));
});

test('상태를 JSON으로 옮겨도 이어서 같은 수열', () => {
  const a = RNG.create(7);
  for (let i = 0; i < 10; i++) RNG.next(a);
  const b = JSON.parse(JSON.stringify(a));
  for (let i = 0; i < 50; i++) assert.strictEqual(RNG.next(a), RNG.next(b));
});

test('int·range·sample 범위', () => {
  const r = RNG.create(1);
  for (let i = 0; i < 1000; i++) {
    const n = RNG.int(r, 6);
    assert.ok(Number.isInteger(n) && n >= 0 && n < 6);
    const x = RNG.range(r, 2, 5);
    assert.ok(x >= 2 && x < 5);
  }
  assert.strictEqual(new Set(RNG.sample(r, [1, 2, 3, 4, 5], 3)).size, 3);
  assert.deepStrictEqual(RNG.sample(r, [1, 2], 0), []);
  assert.deepStrictEqual(RNG.sample(r, [1, 2], -1), []);
  assert.strictEqual(RNG.sample(r, [1, 2], 5).length, 2);
});
