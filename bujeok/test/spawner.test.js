const test = require('node:test');
const assert = require('node:assert');
const C = require('../content/index.js');
const SP = require('../engine/spawner.js');
const PAT = require('../engine/patterns.js');
const HOOKS = require('../engine/hooks.js');
const RNG = require('../engine/rng.js');

function mk(extra = {}) {
  return Object.assign({
    t: 0, chapterId: 'tutorial', rng: RNG.create(9), nextUid: 1, player: { x: 0, y: 0 },
    enemies: [], waveAcc: [], bossDone: [], props: [{ state: 'idle' }], hookState: {}, gems: [], zones: [],
    stats: { damageBy: {} }, fx: { hits: [], rings: [], events: [], notices: [] },
  }, extra);
}

test('모든 적 패턴 종류가 구현돼 있다', () => {
  for (const e of Object.values(C.enemies)) if (e.pattern) assert.ok(PAT.KINDS[e.pattern.kind], e.pattern.kind);
});

test('웨이브: every마다 count마리, 화면 밖 고리(600~680)에서', () => {
  const s = mk();
  s.t = 0.5; SP.tick(s, C, 0.5);
  assert.strictEqual(s.enemies.length, 0);
  s.t = 1.0; SP.tick(s, C, 0.5);
  assert.strictEqual(s.enemies.length, 2);
  for (const e of s.enemies) { const d = Math.hypot(e.x, e.y); assert.ok(d >= 600 && d <= 680, String(d)); }
});

test('적 개수 상한을 넘지 않는다', () => {
  const C3 = { ...C, rules: { ...C.rules, limits: { ...C.rules.limits, enemies: 3 } } };
  const s = mk();
  for (let i = 1; i <= 20; i++) { s.t = i * 0.5; SP.tick(s, C3, 0.5); }
  assert.strictEqual(s.enemies.length, 3);
});

test('중간 보스는 45초 뒤 보상 없이 퇴장, 최종 보스는 퇴장하지 않는다', () => {
  const s = mk();
  s.t = 180; SP.tick(s, C, 1 / 60);
  const boss = s.enemies.find(e => e.boss);
  assert.strictEqual(boss.id, 'one_eye');
  assert.strictEqual(boss.leaveAt, 225);
  assert.ok(s.fx.notices.some(n => n.includes('외눈 도깨비')));
  s.t = 225; SP.tick(s, C, 1 / 60);
  assert.ok(boss.dead && boss.left);
  s.t = 360; SP.tick(s, C, 1 / 60);
  const fin = s.enemies.find(e => e.final);
  assert.strictEqual(fin.id, 'one_eye_elder');
  assert.strictEqual(fin.leaveAt, undefined);
});

test('돌진: 추격 → 예고(방향 고정) → 돌진, 엄지 영역(아래쪽)이면 예고가 길다', () => {
  const s = mk();
  const e = { uid: 1, id: 'one_eye', x: 0, y: -300, hp: 900, maxHp: 900 };
  for (let i = 0; i < 4.5 * 60 + 1; i++) PAT.move(s, C, e, 1 / 60);
  assert.strictEqual(e.ph, 'warn');
  assert.strictEqual(e.dy, 1);
  assert.strictEqual(e.warn, 1.2);
  assert.ok(Math.abs(e.len - 520 * 0.55) < 1e-9);
  for (let i = 0; i < 1.2 * 60 + 1; i++) PAT.move(s, C, e, 1 / 60);
  assert.strictEqual(e.ph, 'dash');

  const below = { uid: 2, id: 'one_eye', x: 0, y: 600, hp: 900, maxHp: 900 };
  for (let i = 0; i < 4.5 * 60 + 1; i++) PAT.move(s, C, below, 1 / 60);
  assert.ok(Math.abs(below.warn - 1.5) < 1e-9);
});

test('훅 api: 플레이어 가까이 소환하면 안전 반경 밖으로 밀고, 훅별 동시 소환 상한', () => {
  const s = mk();
  const api = HOOKS.api(s, C, 'tutorial');
  const uid = api.spawn('japgwi', 10, 0);
  assert.strictEqual(typeof uid, 'number');
  const e = s.enemies.find(x => x.uid === uid);
  assert.strictEqual(e.owner, 'tutorial');
  assert.ok(Math.abs(Math.hypot(e.x, e.y) - 220) < 1e-9);
  for (let i = 0; i < 80; i++) api.spawn('japgwi', 500, i);
  assert.strictEqual(s.enemies.filter(x => x.owner === 'tutorial').length, C.rules.hookSpawnCap);
});

test('입문 서낭당: 40초에 흔들림 → 근처 8마리 처치 → 회복 구슬', () => {
  const s = mk();
  s.t = 39; HOOKS.call(s, C, 'onTick', 1 / 60);
  assert.strictEqual(s.props[0].state, 'idle');
  s.t = 40; HOOKS.call(s, C, 'onTick', 1 / 60);
  assert.strictEqual(s.props[0].state, 'active');
  assert.strictEqual(s.fx.notices.length, 1);
  for (let i = 0; i < 8; i++) HOOKS.call(s, C, 'onEnemyDeath', { x: 0, y: -200 });
  assert.deepStrictEqual(s.gems, [{ x: 0, y: -190, xp: 0, heal: 30 }]);
  assert.strictEqual(s.props[0].state, 'idle');
});
