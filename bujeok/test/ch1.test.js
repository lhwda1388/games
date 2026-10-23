const test = require('node:test');
const assert = require('node:assert');
const C = require('../content/index.js');
const PAT = require('../engine/patterns.js');
const HOOKS = require('../engine/hooks.js');
const ENT = require('../engine/entities.js');
const RNG = require('../engine/rng.js');

function mk(extra = {}) {
  return Object.assign({
    t: 0, chapterId: 'dokkaebi_pass', rng: RNG.create(4), nextUid: 1, player: { x: 0, y: 0, hp: 100, maxHp: 100, invuln: 0 },
    enemies: [], waveAcc: [], bossDone: [], props: [{ state: 'idle' }], hookState: {}, gems: [], zones: [],
    stats: { damageBy: {} }, fx: ENT.freshFx(), lastHit: null,
  }, extra);
}

test('1챕터 등록: 입문을 클리어해야 열리고, 보스 3:00·6:00·10:00', () => {
  const ch = C.chapters.dokkaebi_pass;
  assert.strictEqual(ch.unlock, 'tutorial');
  assert.deepStrictEqual(ch.bosses.map(b => [b.at, b.enemy, !!b.final]), [[180, 'one_eye', false], [360, 'club_dokkaebi', false], [600, 'duoksini', true]]);
  assert.deepStrictEqual(C.validate(C), []);
});

test('unlock이 없는 챕터를 가리키면 검사에서 잡는다', () => {
  const bad = { ...C, chapters: { ...C.chapters, dokkaebi_pass: { ...C.chapters.dokkaebi_pass, unlock: 'nope' } } };
  assert.ok(C.validate(bad).some(e => e.includes('nope')));
});

test('내려찍기: 플레이어 자리에 원형 예고, 예고가 끝날 때 원 안이면 피해', () => {
  const s = mk();
  const e = { uid: 1, id: 'club_dokkaebi', x: 0, y: -300, hp: 1, maxHp: 1 };
  let n = 0;
  while (e.ph !== 'warn' && n++ < 600) PAT.move(s, C, e, 1 / 60);
  assert.strictEqual(e.wx, 0);
  assert.ok(e.wr > 0);
  for (let i = 0; i < 200 && e.ph === 'warn'; i++) PAT.move(s, C, e, 1 / 60);
  assert.ok(s.player.hp < 100);
  assert.strictEqual(s.lastHit, 'club_dokkaebi');

  const s2 = mk();
  const e2 = { uid: 2, id: 'club_dokkaebi', x: 0, y: -300, hp: 1, maxHp: 1 };
  n = 0;
  while (e2.ph !== 'warn' && n++ < 600) PAT.move(s2, C, e2, 1 / 60);
  s2.player.x = 500;
  for (let i = 0; i < 200 && e2.ph === 'warn'; i++) PAT.move(s2, C, e2, 1 / 60);
  assert.strictEqual(s2.player.hp, 100);
});

test('지그재그: 추격하면서 옆으로 흔들린다(같은 입력이면 같은 경로)', () => {
  const a = { uid: 3, id: 'egg_ghost', x: 0, y: -300 }, b = { uid: 3, id: 'egg_ghost', x: 0, y: -300 };
  const s = mk();
  for (let i = 0; i < 60; i++) { s.t = i / 60; PAT.move(s, C, a, 1 / 60); PAT.move(s, C, b, 1 / 60); }
  assert.ok(a.y > -300 && Math.abs(a.x) > 1);
  assert.deepStrictEqual([a.x, a.y], [b.x, b.y]);
});

test('소환: every초마다 count마리, 동시에 max까지만', () => {
  const s = mk();
  const boss = { uid: 50, id: 'duoksini', x: 0, y: -400, hp: 1, maxHp: 1 };
  s.enemies.push(boss);
  const sm = C.enemies.duoksini.summon;
  for (let i = 0; i < Math.ceil(sm.every * 60 * 10); i++) PAT.move(s, C, boss, 1 / 60);
  assert.strictEqual(s.enemies.filter(e => e.owner === 'u50').length, sm.max);
});

test('씨름판: 60초에 열리고, 원 안에서 6초 버티면 혼백 구슬', () => {
  const s = mk();
  s.t = 59; HOOKS.call(s, C, 'onTick', 1 / 60);
  assert.strictEqual(s.props[0].state, 'idle');
  s.t = 60; HOOKS.call(s, C, 'onTick', 1 / 60);
  assert.strictEqual(s.props[0].state, 'active');
  s.player.x = s.props[0].x; s.player.y = s.props[0].y;
  for (let i = 0; i < 6 * 60 + 2; i++) { s.t += 1 / 60; HOOKS.call(s, C, 'onTick', 1 / 60); }
  assert.strictEqual(s.props[0].state, 'idle');
  assert.ok(s.gems.filter(g => g.xp > 0).length >= 6);
});

test('씨름판: 시간 안에 못 버티면 그냥 닫힌다', () => {
  const s = mk();
  s.t = 60; HOOKS.call(s, C, 'onTick', 1 / 60);
  s.player.x = 99999;
  for (let i = 0; i < 21 * 60; i++) { s.t += 1 / 60; HOOKS.call(s, C, 'onTick', 1 / 60); }
  assert.strictEqual(s.props[0].state, 'idle');
  assert.strictEqual(s.gems.length, 0);
});

// 돌진 한 번을 끝까지: 예고 시작 때의 경고선 길이와 실제로 달린 거리
function dashOnce(s, e) {
  let n = 0;
  while (e.ph !== 'warn' && n++ < 2000) PAT.move(s, C, e, 1 / 60);
  const len = e.len;
  while (e.ph === 'warn' && n++ < 4000) PAT.move(s, C, e, 1 / 60);
  const x0 = e.x, y0 = e.y;
  while (e.ph === 'dash' && n++ < 6000) PAT.move(s, C, e, 1 / 60);
  return { len, ran: Math.hypot(e.x - x0, e.y - y0) };
}

test('돌진 경고선 길이 = 실제 돌진 거리(폭주 단계 포함)', () => {
  for (const rage of [0, 1, 2]) {
    const s = mk();
    const e = { uid: 7, id: 'duoksini', x: 0, y: -20000, hp: 1, maxHp: 1, rage };
    const { len, ran } = dashOnce(s, e);
    assert.ok(Math.abs(len - ran) / len < 0.04, `rage ${rage}: 선 ${len} / 실제 ${ran}`);
  }
});

test('돌진도 느려짐을 받는다(예고 때 걸린 느려짐으로 길이·속도를 함께 정한다)', () => {
  const s = mk(), s2 = mk();
  const a = { uid: 7, id: 'duoksini', x: 0, y: -400, hp: 1, maxHp: 1 };
  const b = { uid: 7, id: 'duoksini', x: 0, y: -400, hp: 1, maxHp: 1, slowT: 99, slowMul: 0.5 };
  const A = dashOnce(s, a), Bd = dashOnce(s2, b);
  assert.ok(Math.abs(Bd.len - A.len / 2) < 1e-6, `${Bd.len} vs ${A.len}`);
  assert.ok(Math.abs(Bd.ran - Bd.len) / Bd.len < 0.04);
});

test('지그재그: 실제 이동 속도는 정의한 speed를 넘지 않는다', () => {
  const s = mk(), e = { uid: 3, id: 'egg_ghost', x: 0, y: -300 };
  for (let i = 0; i < 120; i++) {
    s.t = i / 60;
    const x0 = e.x, y0 = e.y;
    PAT.move(s, C, e, 1 / 60);
    assert.ok(Math.abs(Math.hypot(e.x - x0, e.y - y0) - C.enemies.egg_ghost.speed / 60) < 1e-9);
  }
});

test('추격은 플레이어를 지나치지 않는다', () => {
  const e = { x: 0, y: -5 };
  PAT.chase(e, { x: 0, y: 0 }, 6000, 1 / 60);
  assert.deepStrictEqual([e.x, e.y], [0, 0]);
});

test('소환 졸개도 플레이어 안전 반경 밖에 나온다', () => {
  const s = mk();
  const boss = { uid: 50, id: 'duoksini', x: 10, y: 0, hp: 1, maxHp: 1, sm: 999 };
  s.enemies.push(boss);
  PAT.move(s, C, boss, 1 / 60);
  const kids = s.enemies.filter(e => e.owner === 'u50');
  assert.ok(kids.length > 0);
  for (const k of kids) assert.ok(Math.hypot(k.x, k.y) >= C.rules.spawn.safeRadius - 1e-9, `${k.x},${k.y}`);
});

test('소환 거리는 rules.summonOffset', () => {
  const s = mk();
  const c = { ...C, rules: { ...C.rules, summonOffset: 100 } };
  const boss = { uid: 50, id: 'duoksini', x: 0, y: -2000, hp: 1, maxHp: 1, sm: 999 };
  s.enemies.push(boss);
  PAT.move(s, c, boss, 1 / 60);
  for (const k of s.enemies.filter(e => e.owner === 'u50')) assert.ok(Math.abs(Math.hypot(k.x - boss.x, k.y - boss.y) - 100) < 1e-6);
});
