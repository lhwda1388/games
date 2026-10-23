const test = require('node:test');
const assert = require('node:assert');
const C = require('../content/index.js');
const SIM = require('../engine/sim.js');
const ENT = require('../engine/entities.js');
const HOOKS = require('../engine/hooks.js');
const B = require('../engine/behaviors.js');
const W = require('../engine/world.js');

const EN = {
  ...C.enemies,
  t_clone: { name: '분신', glyph: '尾', color: 0xffffff, hp: 1, speed: 10, r: 10, dmg: 1, xp: 0, immune: true, life: 2 },
  t_true: { name: '본체', glyph: '尾', color: 0xffffff, hp: 50, speed: 10, r: 10, dmg: 1, xp: 5, revealOnHit: 4, tell: 'shadow' },
};
const CH = { id: 'vt', name: '시험', duration: 9999, waves: [], bosses: [{ at: 9999, enemy: 'one_eye_elder', final: true }], props: [], keys: { fox_peach: { reveal: 1.5 } } };
const C2 = { ...C, enemies: EN, chapters: { ...C.chapters, vt: CH } };
const mk = () => { const s = SIM.create(C2, { seed: 1, heroId: 'yeonhwa', chapterId: 'vt', runId: 'v' }); s.slots = []; return s; };
const DT = 1 / 60;

test('시야: 보정이 없으면 base, 있으면 가장 작은 배수, 만료되면 사라진다', () => {
  const s = mk();
  assert.strictEqual(ENT.visionRadius(C2, s), C.rules.vision.base);
  const api = HOOKS.api(s, C2, 'vt');
  api.addVisionModifier(0.5, 1);
  api.addVisionModifier(0.2, 0.5);
  assert.strictEqual(ENT.visionRadius(C2, s), C.rules.vision.base * 0.2);
  for (let i = 0; i < 40; i++) SIM.step(s, C2, {}, DT);
  assert.strictEqual(ENT.visionRadius(C2, s), C.rules.vision.base * 0.5);
  for (let i = 0; i < 40; i++) SIM.step(s, C2, {}, DT);
  assert.deepStrictEqual(s.vision, []);
});

test('면역 적은 피해를 받지 않고, 수명이 다하면 보상 없이 사라진다', () => {
  const s = mk();
  const api = HOOKS.api(s, C2, 'vt');
  const uid = api.spawn('t_clone', 400, 0, { pack: 1 });
  const e = s.enemies.find(x => x.uid === uid);
  assert.strictEqual(e.pack, 1);
  const hash = W.createHash(64); W.build(hash, s.enemies);
  s.zones.push({ uid: 99, x: 400, y: 0, r: 50, ttl: 5, kind: 'damage', dps: 600, dmg: 0, blast: 0, owner: 'bell' });
  B.updateZones({ state: s, content: C2, hash }, DT);
  assert.strictEqual(e.hp, 1);
  for (let i = 0; i < 2 * 60 + 2; i++) SIM.step(s, C2, {}, DT);
  assert.strictEqual(s.enemies.some(x => x.uid === uid), false);
  assert.strictEqual(s.stats.kills, 0);
  assert.strictEqual(s.gems.length, 0);
});

test('맞으면 표식(revealOnHit), 열쇠 레시피로 합체했으면 배수', () => {
  const s = mk();
  const api = HOOKS.api(s, C2, 'vt');
  const tuid = api.spawn('t_true', 400, 0, { tag: 'true' });
  const e = s.enemies.find(x => x.uid === tuid);
  assert.strictEqual(HOOKS.view(e).tag, 'true');
  const hash = W.createHash(64); W.build(hash, s.enemies);
  s.zones.push({ uid: 98, x: 400, y: 0, r: 50, ttl: 5, kind: 'damage', dps: 6, dmg: 0, blast: 0, owner: 'bell' });
  B.updateZones({ state: s, content: C2, hash }, DT);
  assert.strictEqual(e.markT, 4);
  s.fused.fox_peach = 'peach_ward';
  e.markT = 0;
  B.updateZones({ state: s, content: C2, hash }, DT);
  assert.strictEqual(e.markT, 6);
  SIM.step(s, C2, {}, DT);
  assert.ok(e.markT < 6);
});

test('clearPack: 같은 무리를 보상 없이 지우고 수를 돌려준다', () => {
  const s = mk();
  const api = HOOKS.api(s, C2, 'vt');
  api.spawn('t_clone', 400, 0, { pack: 7 }); api.spawn('t_clone', 420, 0, { pack: 7 }); api.spawn('t_clone', 440, 0, { pack: 8 });
  assert.strictEqual(api.clearPack(7), 2);
  SIM.step(s, C2, {}, DT);
  assert.deepStrictEqual(s.enemies.map(e => e.pack), [8]);
  assert.strictEqual(s.stats.kills, 0);
});

test('mark·hasFusion', () => {
  const s = mk();
  const api = HOOKS.api(s, C2, 'vt');
  const uid = api.spawn('t_true', 400, 0);
  api.mark(uid, 3);
  assert.strictEqual(s.enemies.find(e => e.uid === uid).markT, 3);
  assert.strictEqual(api.hasFusion('fox_peach'), false);
});
