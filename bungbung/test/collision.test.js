const assert = require('assert');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let fail = 0;
// node bungbung/test/collision.test.js
const K = require('../collision.js');
const B = (x, y, l, w, a = 0) => ({ x, y, l, w, a });

test('겹침·분리·딱 닿음', () => {
  assert(K.overlap(B(0, 0, 2, 2), B(1.5, 0, 2, 2)));
  assert(!K.overlap(B(0, 0, 2, 2), B(3, 0, 2, 2)));
  assert(!K.overlap(B(0, 0, 2, 2), B(2, 0, 2, 2)), '모서리 접촉은 충돌 아님');
});

test('회전된 박스: 축정렬로는 겹치지만 실제로는 떨어짐', () => {
  // 45도 돌린 정사각형(대각 반경 1.414)과 x=2.3의 박스: AABB는 겹치지만 실제 분리
  assert(!K.overlap(B(0, 0, 2, 2, Math.PI / 4), B(2.3, 2.3, 2, 2)));
  assert(K.overlap(B(0, 0, 2, 2, Math.PI / 4), B(1.6, 0, 2, 2)));
});

test('점-박스 거리', () => {
  assert.strictEqual(K.pointDist(B(0, 0, 2, 2), 0, 0), 0);
  assert(Math.abs(K.pointDist(B(0, 0, 2, 2), 3, 0) - 2) < 1e-9);
  assert(Math.abs(K.pointDist(B(0, 0, 2, 2), 4, 5) - 5) < 1e-9);
  assert(Math.abs(K.pointDist(B(0, 0, 2, 2, Math.PI / 2), 0, 3) - 2) < 1e-9);
});

test('inside: 안쪽 박스의 네 모서리가 모두 바깥 박스 안', () => {
  assert(K.inside(B(0, 0, 4, 1.8), B(0, 0, 5, 2.3)));
  assert(!K.inside(B(0.4, 0, 4.39, 1.8), B(0, 0, 5, 2.3)));
  assert(!K.inside(B(0, 0, 4, 1.8, 0.3), B(0, 0, 4.2, 2.0)));
});

test('hit과 nearest', () => {
  const obs = [B(10, 0, 1, 1), B(0, 3, 1, 1)];
  assert.strictEqual(K.hit(B(0, 0, 2, 2), obs), -1);
  assert.strictEqual(K.hit(B(0, 2, 2, 2), obs), 1);
  assert(Math.abs(K.nearest([[0, 0], [0, 1]], obs) - 1.5) < 1e-9);
});
for (const [name, fn] of tests) {
  try { fn(); console.log('ok  ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n  ' + e.message); }
}
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('all ' + tests.length + ' passed');
