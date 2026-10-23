const test = require('node:test');
const assert = require('node:assert');
const C = require('../content/index.js');
const META = require('../engine/meta.js');
const SAVE = require('../engine/save.js');

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } }; };
const fresh = () => SAVE.loadMeta(mem());

test('새 meta는 새 필드를 갖고, 옛 meta도 채워 읽는다', () => {
  const m = fresh();
  assert.deepStrictEqual([m.village, m.stats, m.killed, m.obtained, m.titles, m.lastHero], [{}, { runs: 0, eliteKills: 0, bossKills: 0, ghostKills: 0, fusions: 0 }, {}, {}, [], 'yeonhwa']);
  const s = mem();
  s.setItem('bujeok.meta', JSON.stringify({ schemaVersion: 1, contentVersion: 1, data: { coins: 3, discovered: {}, grantedRuns: [], tutorialDone: true, cleared: { tutorial: true } } }));
  const old = SAVE.loadMeta(s);
  assert.deepStrictEqual(old.stats, { runs: 0, eliteKills: 0, bossKills: 0, ghostKills: 0, fusions: 0 });
  assert.strictEqual(old.coins, 3);
});

test('시설 강화: 비용 차감, 최대 단계, 엽전 부족', () => {
  const m = fresh();
  m.coins = 1000;
  assert.strictEqual(META.cost(C, m, 'smithy'), C.village.smithy.levels[0].cost);
  assert.ok(META.upgrade(C, m, 'smithy'));
  assert.strictEqual(m.village.smithy, 1);
  assert.strictEqual(m.coins, 1000 - C.village.smithy.levels[0].cost);
  META.upgrade(C, m, 'smithy'); META.upgrade(C, m, 'smithy');
  assert.strictEqual(META.cost(C, m, 'smithy'), null);
  assert.strictEqual(META.upgrade(C, m, 'smithy'), false);
  m.coins = 0;
  assert.strictEqual(META.upgrade(C, m, 'school'), false);
});

test('효과 합산: 시설별 최종 단계 효과를 합친다', () => {
  const m = fresh();
  m.village = { smithy: 2, shrine: 3, apothecary: 1 };
  const p = META.perks(C, m);
  assert.strictEqual(p.maxHpMul, C.village.smithy.levels[1].perk.maxHpMul);
  assert.strictEqual(p.revive, 1);
  assert.strictEqual(p.startPick, 2);
  assert.strictEqual(p.coinMul, 1);
});

test('영웅 해금: 챕터 클리어, 정예 누적 처치', () => {
  const m = fresh();
  assert.ok(META.heroUnlocked(C, m, 'yeonhwa'));
  assert.ok(!META.heroUnlocked(C, m, 'jeonwoochi'));
  assert.ok(META.heroLockReason(C, m, 'jeonwoochi').includes('도깨비 고개'));
  m.cleared.dokkaebi_pass = true;
  assert.ok(META.heroUnlocked(C, m, 'jeonwoochi'));
  assert.ok(META.heroLockReason(C, m, 'beomi').includes('50'));
  m.stats.eliteKills = 50;
  assert.ok(META.heroUnlocked(C, m, 'beomi'));
});

test('결과 기록: 처치·부적·정예·판 수, 새 칭호와 새 영웅 알림', () => {
  const m = fresh();
  const res = { win: true, chapterId: 'dokkaebi_pass', heroId: 'yeonhwa', killed: ['dokkaebi_fire', 'egg_ghost'], obtained: ['bell', 'red_bean'], fusions: ['boundary_ward'], eliteKills: 50, curses: [] };
  m.cleared.dokkaebi_pass = true;
  m.discovered.boundary_ward = true;
  const out = META.record(C, m, res);
  assert.deepStrictEqual(Object.keys(m.killed).sort(), ['dokkaebi_fire', 'egg_ghost']);
  assert.ok(m.obtained.bell && m.obtained.red_bean);
  assert.strictEqual(m.stats.runs, 1);
  assert.strictEqual(m.stats.eliteKills, 50);
  assert.strictEqual(m.lastHero, 'yeonhwa');
  assert.deepStrictEqual(out.newHeroes.sort(), ['beomi', 'jeonwoochi']);
});

test('이미 클리어한 챕터를 다시 이겨도 새 영웅으로 알리지 않는다(grant 전 cleared를 넘길 때)', () => {
  const m = fresh();
  m.cleared.dokkaebi_pass = true;
  const res = { win: true, chapterId: 'dokkaebi_pass', heroId: 'yeonhwa', killed: [], obtained: [], fusions: [], eliteKills: 0, curses: [] };
  assert.deepStrictEqual(META.record(C, m, res, { ...m.cleared }).newHeroes, []);
  const m2 = fresh();
  const before = { ...m2.cleared };
  m2.cleared.dokkaebi_pass = true;
  assert.deepStrictEqual(META.record(C, m2, res, before).newHeroes, ['jeonwoochi']);
});

test('도감 수집률과 칭호(임계값을 넘는 순간 한 번만)', () => {
  const m = fresh();
  const all = META.codex(C, m);
  assert.strictEqual(all.found, 0);
  assert.ok(!all.enemies.some(e => e.id === 'fox_clone'));
  for (const e of all.enemies) m.killed[e.id] = true;
  for (const t of all.talismans) m.obtained[t.id] = true;
  const out = META.record(C, m, { win: false, chapterId: 'tutorial', heroId: 'yeonhwa', killed: [], obtained: [], fusions: [], eliteKills: 0, curses: [] });
  const pct = META.codex(C, m).pct;
  assert.ok(pct >= 0.5 && pct < 1);
  assert.ok(out.newTitles.includes('풋내기 퇴마사') && out.newTitles.includes('부적 수집가'));
  assert.deepStrictEqual(META.record(C, m, { win: false, chapterId: 'tutorial', heroId: 'yeonhwa', killed: [], obtained: [], fusions: [], eliteKills: 0, curses: [] }).newTitles, []);
});

test('저주는 클리어한 정규 챕터에서만', () => {
  const m = fresh();
  assert.ok(!META.cursesAllowed(C, m, 'dokkaebi_pass'));
  m.cleared.dokkaebi_pass = true; m.cleared.tutorial = true;
  assert.ok(META.cursesAllowed(C, m, 'dokkaebi_pass'));
  assert.ok(!META.cursesAllowed(C, m, 'tutorial'));
});

test('시설 단계가 목록보다 크면 마지막 단계로 잡는다', () => {
  const META = require('../engine/meta.js');
  const p = META.perks(C, { village: { smithy: 99 } });
  assert.strictEqual(p.maxHpMul, C.village.smithy.levels[2].perk.maxHpMul);
});
