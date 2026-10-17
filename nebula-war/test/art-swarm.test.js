// 스웜 아트(art-swarm.js) 계약 테스트 — Task 3(스웜 건물)·Task 5(스웜 유닛)
const assert = require('assert');
const D = require('../data.js');
const A = require('../art.js');
require('../art-swarm.js');
let n = 0; const test = (name, fn) => { fn(); n++; console.log('ok', name); };

test('Task 5: 스웜 유닛 전부 8방향 새 정의', () => {
  for (const u of Object.values(D.units).filter(u => u.race === 'swarm')) {
    const d = A.SPR[u.id]; assert.strictEqual(d.px, 1, u.id); assert.strictEqual(d.dirs, 8, u.id);
    assert.strictEqual(d.frames.attack, 2, u.id); assert(d.frames.move >= 2 && d.frames.move <= 4, u.id);
  }
  for (const s of ['s', 'm', 'l']) assert(A.SPR['wreck@swarm-' + s]);
  assert(A.SPR['mound@burrow'] && A.SPR['cocoon@cocoon']);
});
test('크기: 옛 반해상도 ×2 이상(Task 9: 화면에서 옛 것보다 작아지지 않게 키움), 최대 2배', () => {
  const old = { drudge: [13, 12], bloater: [28, 23], skitter: [12, 9], spinewyrm: [22, 18], trencher: [26, 18], wingsting: [28, 22], siegemaw: [36, 24],
    acidwing: [34, 24], burster: [14, 14], matron: [30, 26], husk: [14, 13], blighter: [24, 22], behemoth: [46, 38], spawnling: [10, 8] };
  for (const id in old) { const d = A.SPR[id], [w, h] = old[id]; assert(d.w >= w * 2 - 4 && d.w <= w * 4 && d.h >= h * 2 - 4 && d.h <= h * 4, id + ' ' + d.w + 'x' + d.h); assert.strictEqual(d.ox, d.w / 2, id); }
});
test('Task 3(스웜): 모든 스웜 건물 새 정의, build 3단·work ≥ 2, 터 크기 + 위로 oy', () => {
  for (const b of Object.values(D.buildings).filter(b => b.race === 'swarm')) {
    const d = A.SPR[b.id]; assert.strictEqual(d.px, 1, b.id); assert.strictEqual(d.frames.build, 3, b.id); assert(d.frames.work >= 2, b.id);
    assert.strictEqual(d.w, b.w * 32, b.id); assert.strictEqual(d.h, b.h * 32 + d.oy, b.id); assert.strictEqual(d.ox, 0, b.id);
    assert(d.oy >= 8 && d.oy <= 24, b.id); assert(Array.isArray(d.glow) && Array.isArray(d.smoke), b.id);
  }
});
test('스웜 정의는 무작위를 쓰지 않는다(Math.random 금지)', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '../art-swarm.js'), 'utf8');
  assert(!/Math\.random/.test(src));
});
console.log(n, 'passed');
