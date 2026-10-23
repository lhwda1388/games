const test = require('node:test');
const assert = require('node:assert');
const L = require('../engine/loop.js');

test('한 프레임 = 한 틱, 틱에는 DT를 넘긴다', () => {
  let n = 0;
  const acc = L.advance(0, 1 / 60, dt => { n++; assert.strictEqual(dt, L.DT); });
  assert.strictEqual(n, 1);
  assert.ok(acc < 1e-9);
});

test('짧은 프레임은 누적된다', () => {
  let n = 0;
  let acc = L.advance(0, 0.5 / 60, () => n++);
  assert.strictEqual(n, 0);
  acc = L.advance(acc, 0.5 / 60, () => n++);
  assert.strictEqual(n, 1);
});

test('긴 멈춤은 5틱까지만, 남은 시간은 버린다', () => {
  let n = 0;
  const acc = L.advance(0, 1, () => n++);
  assert.strictEqual(n, 5);
  assert.strictEqual(acc, 0);
});
