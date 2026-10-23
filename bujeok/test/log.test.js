const test = require('node:test');
const assert = require('node:assert');
const L = require('../engine/log.js');

test('로그는 최근 2000건만 남긴다', () => {
  const log = L.create();
  for (let i = 0; i < 2100; i++) L.push(log, { i });
  assert.strictEqual(log.items.length, 2000);
  assert.strictEqual(log.items[0].i, 100);
});
