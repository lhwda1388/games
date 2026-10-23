const test = require('node:test');
const assert = require('node:assert');
const C = require('../content/index.js');
const SIM = require('../engine/sim.js');
const ENT = require('../engine/entities.js');
const SP = require('../engine/spawner.js');

const C0 = { ...C, chapters: { ...C.chapters, field: { id: 'field', name: '들판', duration: 9999, waves: [], bosses: [{ at: 10, enemy: 'one_eye_elder', final: true }], props: [], mods: { enemyDmg: 0.5, regen: 2 } } } };
const mk = () => { const s = SIM.create(C0, { seed: 1, heroId: 'yeonhwa', chapterId: 'field', runId: 'r' }); s.slots = []; return s; };
const DT = 1 / 60;

test('최종 보스는 등장 90초 뒤부터 30초마다 폭주 단계가 오르고, 처음 폭주할 때 알린다', () => {
  const s = mk();
  s.t = 10; SP.tick(s, C0, DT);
  const b = s.enemies.find(e => e.final);
  assert.strictEqual(b.bornT, 10);
  b.x = 5000; b.y = 5000;
  s.t = 99.9; SIM.step(s, C0, {}, DT);
  assert.ok(!b.rage);
  s.t = 100; SIM.step(s, C0, {}, DT);
  assert.strictEqual(b.rage, 1);
  assert.ok(s.fx.notices.some(n => n.includes('폭주')));
  assert.ok(s.fx.notices.every(n => !n.includes('(')), '알림에 이(가) 같은 조사 병기를 쓰지 않는다');
  s.t = 160; SIM.step(s, C0, {}, DT);
  assert.strictEqual(b.rage, 3);
});

test('챕터 보정: 접촉 피해 절반, 초당 회복', () => {
  const s = mk();
  ENT.spawnEnemy(s, C0, 'little_dokkaebi', 5, 0);
  SIM.step(s, C0, {}, DT);
  assert.ok(Math.abs(s.player.hp - (100 - 4.5)) < 0.1, String(s.player.hp));
  s.enemies = [];
  const hp = s.player.hp;
  for (let i = 0; i < 60; i++) SIM.step(s, C0, {}, DT);
  assert.ok(Math.abs(s.player.hp - (hp + 2)) < 0.05, String(s.player.hp));
});

test('느려짐은 시간이 지나면 풀린다', () => {
  const s = mk();
  const e = ENT.spawnEnemy(s, C0, 'japgwi', 400, 0);
  ENT.applySlow(e, { mul: 0.5, t: 0.5 });
  SIM.step(s, C0, {}, DT);
  const x1 = e.x;
  assert.ok(Math.abs((400 - x1) - 95 * 0.5 / 60) < 1e-6);
  for (let i = 0; i < 40; i++) SIM.step(s, C0, {}, DT);
  const x2 = e.x; SIM.step(s, C0, {}, DT);
  assert.ok(Math.abs((x2 - e.x) - 95 / 60) < 1e-6);
});

test('정지 시간: 움직이면 0, 서 있으면 쌓인다', () => {
  const s = mk();
  SIM.step(s, C0, { mx: 1 }, DT);
  assert.strictEqual(s.player.stillT, 0);
  for (let i = 0; i < 30; i++) SIM.step(s, C0, {}, DT);
  assert.ok(Math.abs(s.player.stillT - 0.5) < 1e-6);
});
