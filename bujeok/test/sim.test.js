const test = require('node:test');
const assert = require('node:assert');
const C = require('../content/index.js');
const SIM = require('../engine/sim.js');
const SK = require('../engine/skills.js');
const ENT = require('../engine/entities.js');

// 웨이브가 없는 빈 들판 — 개별 규칙만 확인한다
const C0 = { ...C, chapters: { ...C.chapters, empty: { id: 'empty', name: '빈 들판', duration: 9999, waves: [], bosses: [{ at: 9999, enemy: 'one_eye_elder', final: true }], props: [] } } };
const mk = (chapterId = 'empty') => SIM.create(chapterId === 'empty' ? C0 : C, { seed: 1, heroId: 'yeonhwa', chapterId, runId: 'r1' });
const DT = 1 / 60;

test('판 생성: 시작 부적 방울 1레벨, 목표 레시피, 체력', () => {
  const s = mk();
  assert.deepStrictEqual(s.slots.map(x => [x.id, x.lv]), [['bell', 1]]);
  assert.strictEqual(s.target, 'bell_bean');
  assert.strictEqual(s.player.hp, 100);
  assert.strictEqual(s.contentVersion, C.version);
});

test('이동: 속도×DT, 대각 입력은 길이 1로, 바라보는 방향 갱신', () => {
  const s = mk();
  SIM.step(s, C0, { mx: 1, my: 0 }, DT);
  assert.ok(Math.abs(s.player.x - 2.5) < 1e-9);
  assert.strictEqual(s.player.dirX, 1);
  SIM.step(s, C0, { mx: 1, my: 1 }, DT);
  assert.ok(Math.abs(s.player.moved - 2.5) < 1e-9);
});

test('접촉 피해와 무적 시간', () => {
  const s = mk();
  s.slots = [];
  ENT.spawnEnemy(s, C0, 'little_dokkaebi', 5, 0);
  SIM.step(s, C0, {}, DT);
  assert.strictEqual(s.player.hp, 91);
  SIM.step(s, C0, {}, DT);
  assert.strictEqual(s.player.hp, 91);
});

test('처치 → 구슬 → 줍기 → 경험치, 레벨업하면 선택 창이 열리고 시간이 멈춘다', () => {
  const s = mk();
  s.slots = [];
  const e = ENT.spawnEnemy(s, C0, 'japgwi', 300, 0);
  ENT.hurt(s, e, 999, 'test');
  SIM.step(s, C0, {}, DT);
  assert.strictEqual(s.enemies.length, 0);
  assert.strictEqual(s.stats.kills, 1);
  assert.deepStrictEqual(s.gems.map(g => [g.x, g.y, g.xp]), [[300, 0, 1]]);
  s.player.x = 295;
  SIM.step(s, C0, {}, DT);
  assert.strictEqual(s.player.xp, 1);
  s.gems.push({ x: s.player.x, y: 0, xp: 3 });
  SIM.step(s, C0, {}, DT);
  assert.strictEqual(s.player.level, 2);
  assert.strictEqual(s.choice.kind, 'levelup');
  const t = s.t;
  SIM.step(s, C0, { mx: 1 }, DT);
  assert.strictEqual(s.t, t);
});

test('체력 0 → 패배, 결과에 사망 원인 이름', () => {
  const s = mk();
  s.slots = [];
  s.player.hp = 5;
  ENT.spawnEnemy(s, C0, 'little_dokkaebi', 5, 0);
  SIM.step(s, C0, {}, DT);
  assert.deepStrictEqual(s.over, { win: false, cause: 'little_dokkaebi' });
  assert.strictEqual(SIM.result(s, C0).cause, '꼬마 도깨비');
});

test('최종 보스 처치 → 승리, 엽전 = 10초당 1 + 10처치당 1 + 클리어 50', () => {
  const s = mk();
  s.slots = [];
  s.t = 60;
  const e = ENT.spawnEnemy(s, C0, 'one_eye_elder', 400, 0);
  e.boss = 1; e.final = 1;
  ENT.hurt(s, e, 1e9, 'test');
  SIM.step(s, C0, {}, DT);
  assert.strictEqual(s.over.win, true);
  const r = SIM.result(s, C0);
  assert.strictEqual(r.coins, 6 + 0 + 50);
  assert.strictEqual(r.runId, 'r1');
});

test('입문 30초 자동 진행: 적이 나오고 부적이 처치한다', () => {
  const s = mk('tutorial');
  for (let i = 0; i < 1800; i++) {
    if (s.choice) { if (s.choice.kind === 'levelup') SK.choose(s, C, 0); else SK.fuse(s, C, 0); continue; }
    SIM.step(s, C, { mx: Math.cos(i / 90), my: Math.sin(i / 90) }, DT);
  }
  assert.ok(s.stats.kills > 0);
  assert.ok(s.enemies.length > 0);
  assert.strictEqual(s.over, null);
});

test('결과에 챕터의 입문 플래그가 실린다', () => {
  assert.strictEqual(SIM.result(mk('tutorial'), C).tutorial, true);
  assert.strictEqual(!!SIM.result(mk(), C0).tutorial, false);
});

test('구슬 상한: 회복 구슬 앞에서 넘쳐도 혼백이 사라지지 않는다', () => {
  const s = mk();
  s.player.x = 5000;
  const n = C0.rules.limits.gems;
  s.gems = [{ x: 90, y: 0, xp: 1 }, { x: 0, y: 0, xp: 0, heal: 30 }];
  for (let i = 0; i < n - 1; i++) s.gems.push({ x: 100 + i, y: 0, xp: 1 });
  const total = () => s.gems.reduce((a, g) => a + (g.heal ? 0 : g.xp), 0);
  const before = total();
  SIM.step(s, C0, {}, DT);
  assert.strictEqual(s.gems.length, n);
  assert.strictEqual(total(), before);
  assert.ok(s.gems.some(g => g.heal));
});

test('훅은 살아 있는 적이 아니라 복사본을 받는다', () => {
  const seen = [];
  const ch = { ...C0.chapters.empty, hooks: { onEnemyDeath(api, hs, e) { seen.push(e); e.x = 12345; } } };
  const C1 = { ...C0, chapters: { empty: ch } };
  const s = SIM.create(C1, { seed: 1, heroId: 'yeonhwa', chapterId: 'empty', runId: 'r1' });
  s.slots = [];
  const e = ENT.spawnEnemy(s, C1, 'japgwi', 300, 0);
  ENT.hurt(s, e, 999, 'test');
  SIM.step(s, C1, {}, DT);
  assert.strictEqual(seen.length, 1);
  assert.notStrictEqual(seen[0], e);
  assert.deepStrictEqual(Object.keys(seen[0]).sort(), ['boss', 'elite', 'id', 'pack', 'tag', 'uid', 'x', 'y']);
  assert.strictEqual(e.x, 300);
});

test('지속 오라 부품이 처치한 적의 구슬은 처음부터 끌려온다(자석 밖 결계 가장자리에서도)', () => {
  const s = mk();
  s.slots = [{ id: 'boundary_ward', lv: 1, cd: 0 }];
  const e = ENT.spawnEnemy(s, C0, 'japgwi', 115, 0);
  e.hp = 0.1;
  SIM.step(s, C0, {}, DT);
  assert.strictEqual(s.stats.kills, 1);
  assert.ok(Math.abs(s.gems[0].x) > C0.rules.player.magnet, '자석 밖에서 떨어진 구슬');
  assert.strictEqual(s.gems[0].pulled, 1);
  for (let i = 0; i < 30 && !s.choice; i++) SIM.step(s, C0, {}, DT);
  assert.strictEqual(s.player.xp, 1);
});

test('빠른 적이 한 틱에 플레이어를 뚫고 지나가도 접촉 피해(이동 구간 판정)', () => {
  const s = mk();
  s.slots = [];
  s.enemies.push({ uid: 900, id: 'duoksini', x: -150, y: 0, hp: 1e6, maxHp: 1e6, ph: 'dash', pt: 0, dx: 1, dy: 0, dsp: 20000 });
  SIM.step(s, C0, { mx: 0, my: 0 }, DT);
  assert.ok(s.enemies[0].x > 150);
  assert.ok(s.player.hp < 100);
});
