const test = require('node:test');
const assert = require('node:assert');
const C = require('../content/index.js');
const SIM = require('../engine/sim.js');
const SAVE = require('../engine/save.js');

const mem = () => { const m = new Map(); return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } }; };
const run = () => SIM.create(C, { seed: 3, heroId: 'yeonhwa', chapterId: 'tutorial', runId: 'r1' });

test('meta 기본값과 저장·읽기', () => {
  const s = mem();
  assert.deepStrictEqual(SAVE.loadMeta(s), { coins: 0, discovered: {}, grantedRuns: [], tutorialDone: false, cleared: {}, village: {}, stats: { runs: 0, eliteKills: 0, bossKills: 0, ghostKills: 0, fusions: 0 }, killed: {}, obtained: {}, titles: [], lastHero: 'yeonhwa', lastCurses: {}, settings: { muted: false } });
  assert.ok(SAVE.write(s, 'meta', { coins: 5, discovered: {}, grantedRuns: [], tutorialDone: true }, 1));
  assert.strictEqual(SAVE.loadMeta(s).coins, 5);
});

test('본 키가 깨지면 lastGood, 둘 다 깨지면 기본값 + 키 삭제', () => {
  const s = mem();
  SAVE.write(s, 'meta', { coins: 1, discovered: {}, grantedRuns: [], tutorialDone: false }, 1);
  SAVE.write(s, 'meta', { coins: 2, discovered: {}, grantedRuns: [], tutorialDone: false }, 1);
  s.setItem('bujeok.meta', '{broken');
  assert.strictEqual(SAVE.loadMeta(s).coins, 1);
  s.setItem('bujeok.meta.lastGood', 'nope');
  assert.strictEqual(SAVE.loadMeta(s).coins, 0);
  assert.strictEqual(s.getItem('bujeok.meta'), null);
});

test('진행 중 판이 깨져도 meta는 그대로', () => {
  const s = mem();
  SAVE.write(s, 'meta', { coins: 9, discovered: {}, grantedRuns: [], tutorialDone: true }, 1);
  s.setItem('bujeok.run', 'x');
  assert.strictEqual(SAVE.loadRun(s, 1), null);
  assert.strictEqual(SAVE.loadMeta(s).coins, 9);
});

test('판 스냅샷 저장·복원(fx 제외), 콘텐츠 버전이 다르면 폐기', () => {
  const s = mem(), st = run();
  st.fx.notices.push('x');
  assert.ok(SAVE.write(s, 'run', st, 1));
  const back = SAVE.loadRun(s, 1).state;
  assert.deepStrictEqual(back.slots, st.slots);
  assert.deepStrictEqual(back.fx, require('../engine/entities.js').freshFx());
  assert.deepStrictEqual(SAVE.loadRun(s, 2), { discarded: true });
  assert.strictEqual(s.getItem('bujeok.run'), null);
});

test('저장소가 예외를 던지면 false, 게임은 계속', () => {
  const s = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => {} };
  assert.strictEqual(SAVE.write(s, 'run', run(), 1), false);
});

test('같은 runId 보상은 한 번만, 합체 발견·입문 완료 기록', () => {
  const meta = SAVE.loadMeta(mem());
  const res = { runId: 'r1', chapterId: 'tutorial', tutorial: true, coins: 30, fusions: ['boundary_ward'] };
  assert.strictEqual(SAVE.grant(meta, res), true);
  assert.strictEqual(SAVE.grant(meta, res), false);
  assert.strictEqual(meta.coins, 30);
  assert.deepStrictEqual(meta.discovered, { boundary_ward: true });
  assert.strictEqual(meta.tutorialDone, true);
});

test('입문 완료는 챕터 플래그(res.tutorial)로 정한다, ID 이름이 아니라', () => {
  const m1 = SAVE.loadMeta(mem());
  SAVE.grant(m1, { runId: 'a', chapterId: 'tutorial', coins: 0, fusions: [] });
  assert.strictEqual(m1.tutorialDone, false);
  const m2 = SAVE.loadMeta(mem());
  SAVE.grant(m2, { runId: 'b', chapterId: 'other', tutorial: true, coins: 0, fusions: [] });
  assert.strictEqual(m2.tutorialDone, true);
});

test('최대 전투 상태 스냅샷도 200KB 미만', () => {
  const st = run();
  for (let i = 0; i < 400; i++) st.enemies.push({ uid: 1000 + i, id: 'little_dokkaebi', x: Math.random() * 1000 - 500, y: Math.random() * 1000 - 500, hp: 26.123456, maxHp: 26, ph: 'chase', pt: 1.2345678 });
  for (let i = 0; i < 300; i++) st.shots.push({ uid: 5000 + i, x: Math.random() * 500, y: Math.random() * 500, vx: 300.12345, vy: -120.98765, r: 16, dmg: 18, pierce: 99, ttl: 1.234567, owner: 'whirlwind', hit: [1001, 1002, 1003] });
  for (let i = 0; i < 60; i++) st.zones.push({ uid: 9000 + i, x: Math.random() * 500, y: Math.random() * 500, r: 26, ttl: 2.1234567, kind: 'damage', dps: 30, dmg: 0, blast: 0, owner: 'firewind_step' });
  const size = JSON.stringify(st, SAVE.dropFx).length;
  assert.ok(size < 200000, String(size));
});

test('옛 meta(cleared 없음)에서 입문을 마쳤으면 입문 클리어로 읽는다', () => {
  const s = mem();
  s.setItem('bujeok.meta', JSON.stringify({ schemaVersion: 1, contentVersion: 1, data: { coins: 3, discovered: {}, grantedRuns: [], tutorialDone: true } }));
  assert.deepStrictEqual(SAVE.loadMeta(s).cleared, { tutorial: true });
  const s2 = mem();
  s2.setItem('bujeok.meta', JSON.stringify({ schemaVersion: 1, contentVersion: 1, data: { coins: 3, discovered: {}, grantedRuns: [], tutorialDone: false } }));
  assert.deepStrictEqual(SAVE.loadMeta(s2).cleared, {});
  // 새 meta는 그대로(입문에서 져도 tutorialDone은 켜지므로 cleared를 추측하지 않는다)
  const s3 = mem();
  SAVE.write(s3, 'meta', { coins: 0, discovered: {}, grantedRuns: [], tutorialDone: true, cleared: {} }, 1);
  assert.deepStrictEqual(SAVE.loadMeta(s3).cleared, {});
});

test('승리한 챕터는 cleared에 기록, 옛 meta는 cleared를 채워 읽는다', () => {
  const s = mem();
  s.setItem('bujeok.meta', JSON.stringify({ schemaVersion: 1, contentVersion: 1, data: { coins: 3, discovered: {}, grantedRuns: [], tutorialDone: false } }));
  const meta = SAVE.loadMeta(s);
  assert.deepStrictEqual(meta.cleared, {});
  SAVE.grant(meta, { runId: 'w', chapterId: 'tutorial', tutorial: true, win: true, coins: 1, fusions: [] });
  SAVE.grant(meta, { runId: 'l', chapterId: 'dokkaebi_pass', win: false, coins: 1, fusions: [] });
  assert.deepStrictEqual(meta.cleared, { tutorial: true });
});
