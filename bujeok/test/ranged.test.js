const test = require('node:test');
const assert = require('node:assert');
const C = require('../content/index.js');
const SIM = require('../engine/sim.js');
const PAT = require('../engine/patterns.js');
const ENT = require('../engine/entities.js');

const EN = { ...C.enemies, t_archer: { name: '궁수', glyph: '弓', color: 0xffffff, hp: 50, speed: 40, r: 12, dmg: 5, xp: 1, pattern: { kind: 'ranged', range: 200, every: 1, warn: 0.5, speed: 300, r: 8, dmg: 10, count: 3, spread: 0.2 } } };
const CH = { id: 'rt', name: '시험', duration: 9999, waves: [], bosses: [{ at: 9999, enemy: 'one_eye_elder', final: true }], props: [] };
const C2 = { ...C, enemies: EN, chapters: { ...C.chapters, rt: CH } };
const mk = () => { const s = SIM.create(C2, { seed: 2, heroId: 'yeonhwa', chapterId: 'rt', runId: 'r' }); s.slots = []; return s; };
const DT = 1 / 60;

test('ranged: 멀면 다가가고 가까우면 물러난다', () => {
  const s = mk();
  const far = { uid: 1, id: 't_archer', x: 500, y: 0 }, near = { uid: 2, id: 't_archer', x: 50, y: 0 };
  PAT.move(s, C2, far, DT); PAT.move(s, C2, near, DT);
  assert.ok(far.x < 500);
  assert.ok(near.x > 50);
});

test('ranged: every초마다 조준(예고) → warn초 뒤 count발 발사', () => {
  const s = mk();
  const e = { uid: 3, id: 't_archer', x: 180, y: 0 };
  let n = 0;
  while (e.ph !== 'aim' && n++ < 200) PAT.move(s, C2, e, DT);
  assert.ok(e.ax < 0);
  assert.strictEqual(s.eshots.length, 0);
  for (let i = 0; i < 0.5 * 60 + 1; i++) PAT.move(s, C2, e, DT);
  assert.strictEqual(s.eshots.length, 3);
  assert.ok(s.eshots.every(q => q.vx < 0 && q.src === 't_archer'));
});

test('적 투사체가 플레이어에 닿으면 피해, 무적 중엔 통과, 수명이 다하면 사라진다', () => {
  const s = mk();
  s.eshots.push({ x: 30, y: 0, vx: -600, vy: 0, r: 8, dmg: 10, ttl: 1, src: 't_archer' });
  SIM.step(s, C2, {}, DT);
  assert.strictEqual(s.player.hp, 90);
  assert.strictEqual(s.eshots.length, 0);
  assert.strictEqual(s.lastHit, 't_archer');
  s.eshots.push({ x: 9999, y: 0, vx: 0, vy: 0, r: 8, dmg: 10, ttl: 0.01, src: 't_archer' });
  SIM.step(s, C2, {}, DT);
  assert.strictEqual(s.eshots.length, 0);
});
