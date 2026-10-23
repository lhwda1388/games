const test = require('node:test');
const assert = require('node:assert');
const IN = require('../engine/input.js');

test('조이스틱: 데드존 안은 0, 반경을 넘으면 길이 1, 절반이면 0.5', () => {
  assert.deepStrictEqual(IN.stickVector(5, 0), { mx: 0, my: 0 });
  const far = IN.stickVector(0, 200);
  assert.ok(Math.abs(far.my - 1) < 1e-9 && far.mx === 0);
  const half = IN.stickVector(30, 0);
  assert.ok(Math.abs(half.mx - 0.5) < 1e-9);
});

test('키보드: 대각은 길이 1, 위는 -y', () => {
  const v = IN.keyVector(new Set(['KeyW', 'KeyD']));
  assert.ok(Math.abs(Math.hypot(v.mx, v.my) - 1) < 1e-9);
  assert.ok(v.my < 0 && v.mx > 0);
  assert.deepStrictEqual(IN.keyVector(new Set()), { mx: 0, my: 0 });
  assert.deepStrictEqual(IN.keyVector(new Set(['ArrowLeft'])), { mx: -1, my: 0 });
});
