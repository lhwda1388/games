const test = require('node:test');
const assert = require('node:assert');
const C = require('../content/index.js');
const SIM = require('../engine/sim.js');
const HOOKS = require('../engine/hooks.js');
const ENT = require('../engine/entities.js');

const mk = () => { const s = SIM.create(C, { seed: 6, heroId: 'yeonhwa', chapterId: 'fox_forest', runId: 'f' }); s.events = []; s.mutation = null; return s; };

test('2챕터 등록: 1챕터를 클리어해야 열림, 보스, 열쇠, 준비 중 목록에서 빠짐', () => {
  const ch = C.chapters.fox_forest;
  assert.strictEqual(ch.unlock, 'dokkaebi_pass');
  assert.deepStrictEqual(ch.bosses.map(b => [b.at, b.enemy, !!b.final]), [[180, 'jangsanbeom', false], [360, 'fox_shaman', false], [600, 'gumiho', true]]);
  assert.ok(ch.keys.fox_peach.reveal > 1);
  assert.ok(!C.upcoming.some(u => u.name === '여우 대숲'));
  assert.deepStrictEqual(C.validate(C), []);
});

test('분신 무리: 50초에 분신 5 + 본체 1, 본체만 피해를 받는다', () => {
  const s = mk();
  s.t = 50; HOOKS.call(s, C, 'onTick', 1 / 60);
  const pack = s.enemies.filter(e => e.pack != null);
  assert.strictEqual(pack.filter(e => e.id === 'fox_clone').length, 5);
  assert.strictEqual(pack.filter(e => e.tag === 'true').length, 1);
  assert.ok(C.enemies.fox_clone.immune && !C.enemies.fox_true.immune);
  assert.ok(s.fx.notices.some(n => n.includes('붉은 그림자')));
});

test('본체를 처치하면 그 무리가 사라지고 혼백 구슬', () => {
  const s = mk();
  s.t = 50; HOOKS.call(s, C, 'onTick', 1 / 60);
  const t = s.enemies.find(e => e.tag === 'true');
  HOOKS.call(s, C, 'onEnemyDeath', HOOKS.view(t));
  assert.ok(s.enemies.filter(e => e.pack === t.pack && e.id === 'fox_clone').every(e => e.dead && e.left));
  assert.ok(s.gems.some(g => g.xp > 0));
});

test('안개: 88초 예고, 90초부터 20초 동안 시야가 줄었다가 돌아온다', () => {
  const s = mk();
  s.t = 88; HOOKS.call(s, C, 'onTick', 1 / 60);
  assert.ok(s.fx.notices.some(n => n.includes('안개')));
  s.t = 90; HOOKS.call(s, C, 'onTick', 1 / 60);
  assert.ok(ENT.visionRadius(C, s) < C.rules.vision.base * 0.5);
  s.t = 111; s.vision = s.vision.filter(v => v.until > s.t);
  assert.strictEqual(ENT.visionRadius(C, s), C.rules.vision.base);
});

test('2챕터 30초 자동 진행이 오류 없이 돈다', () => {
  const s = mk();
  const SK = require('../engine/skills.js');
  for (let i = 0; i < 1800; i++) {
    if (s.choice) { if (s.choice.kind === 'levelup') SK.choose(s, C, 0); else if (s.choice.kind === 'fusion') SK.fuse(s, C, 0); else SK.leaveMarket(s, C); continue; }
    SIM.step(s, C, { mx: Math.cos(i / 90), my: Math.sin(i / 90) }, 1 / 60);
  }
  assert.ok(s.stats.kills > 0);
});
