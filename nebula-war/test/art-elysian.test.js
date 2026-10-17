// 엘리시안 아트(art-elysian.js): Task 3 엘리시안 건물 · Task 6 엘리시안 유닛·잔해
const assert = require('assert');
const D = require('../data.js');
const A = require('../art.js');
require('../art-elysian.js');
let n = 0; const test = (name, fn) => { fn(); n++; console.log('ok', name); };

test('Task 3(엘리시안): 건물 전부 새 정의, build 3단·work ≥ 2, 크기 = 터 + 위로 oy', () => {
  for (const b of Object.values(D.buildings).filter(b => b.race === 'elysian')) {
    const d = A.SPR[b.id]; assert.strictEqual(d.px, 1, b.id);
    assert.strictEqual(d.frames.build, 3, b.id); assert(d.frames.work >= 2, b.id);
    assert.strictEqual(d.w, b.w * 32, b.id); assert.strictEqual(d.h, b.h * 32 + d.oy, b.id); assert.strictEqual(d.ox, 0, b.id);
    assert(Array.isArray(d.glow) && d.glow.length, b.id); assert(Array.isArray(d.smoke), b.id);
  }
});
test('Task 6: 엘리시안 유닛 전부 8방향 새 정의', () => {
  for (const u of Object.values(D.units).filter(u => u.race === 'elysian')) {
    const d = A.SPR[u.id]; assert.strictEqual(d.px, 1, u.id); assert.strictEqual(d.dirs, 8, u.id);
    assert.strictEqual(d.frames.attack, 2, u.id); assert(d.frames.move >= 2 && d.frames.move <= 4, u.id);
    assert.strictEqual(d.ox, d.w / 2, u.id);                 // blit 은 가로 중심 기준
  }
  for (const s of ['s', 'm', 'l']) assert(A.SPR['wreck@elysian-' + s]);
});
test('크기: 옛 반해상도 × 2 이상(화면에서 작아지지 않음), 8방향 회전·공격 자세 여유로 최대 2배', () => {
  const OLD = { shaper: [14, 13], oathblade: [16, 17], arcwalker: [30, 28], sage: [14, 19], umbra: [18, 18], ascendant: [28, 30], voidascendant: [28, 30],
    crucible: [36, 30], shard: [8, 8], skiff: [34, 16], watcher: [16, 16], sentinel: [36, 22], skimmer: [28, 14], ark: [68, 42], spark: [8, 7], warden: [30, 32] };
  for (const [id, [w, h]] of Object.entries(OLD)) { const d = A.SPR[id]; assert(d.w >= w * 2 - 4 && d.w <= w * 2 * 2, id + ' w'); assert(d.h >= h * 2 - 4 && d.h <= h * 2 * 2, id + ' h'); }
});
console.log(n, 'passed');
