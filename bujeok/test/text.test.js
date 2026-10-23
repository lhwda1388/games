const test = require('node:test');
const assert = require('node:assert');
const C = require('../content/index.js');
const SIM = require('../engine/sim.js');
const T = require('../ui/text.js');

const st = () => SIM.create(C, { seed: 1, heroId: 'yeonhwa', chapterId: 'tutorial', runId: 'x' });

test('시간 표시 mm:ss', () => {
  assert.strictEqual(T.mmss(0), '00:00');
  assert.strictEqual(T.mmss(125.9), '02:05');
});

test('신규 카드: 짝과 두 갈래의 작동 방식·약점을 투자 전에 공개', () => {
  const s = st();
  const c = T.option(C, s, { kind: 'new', id: 'red_bean' });
  assert.strictEqual(c.title, '팥 주머니');
  assert.strictEqual(c.level, '새 부적');
  assert.strictEqual(c.pairs.length, 1);
  assert.strictEqual(c.pairs[0].partner, '방울');
  assert.deepStrictEqual(c.pairs[0].branches.map(b => b.how), [C.talismans.boundary_ward.how, C.talismans.bean_bell_trap.how]);
  assert.strictEqual(c.related, true);
});

test('강화 카드: 레벨 변화와 수치 변화', () => {
  const c = T.option(C, st(), { kind: 'up', id: 'bell' });
  assert.strictEqual(c.level, 'Lv 1 → 2');
  assert.strictEqual(c.stats, '피해 12 · 주기 2.2초 → 피해 14 · 주기 2초');
});

test('정화수 카드', () => {
  assert.strictEqual(T.option(C, st(), { kind: 'heal' }).how, '체력 +30');
});

test('합체 창: 발견 전 이름은 ???, 작동 방식·약점·수치는 항상 보인다', () => {
  const f = T.fusion(C, { discovered: { boundary_ward: true } }, 'bell_bean');
  assert.strictEqual(f.a, '방울');
  assert.deepStrictEqual(f.branches.map(b => b.name), ['경계 결계', '???']);
  assert.strictEqual(f.branches[1].how, C.talismans.bean_bell_trap.how);
  assert.ok(f.branches[1].stats.includes('피해 40'));
});

test('다음 도전 목표 한 줄', () => {
  assert.ok(T.nextGoal({ fusions: [], win: false }).includes('합체'));
  assert.ok(T.nextGoal({ fusions: ['x'], win: false }).includes('다른 갈래'));
  assert.ok(T.nextGoal({ fusions: ['x'], win: true }).includes('새로운 짝'));
});

test('챕터 카드: 입문은 열림, 1챕터는 입문 클리어 뒤 열림, 준비 중 챕터는 잠김', () => {
  const locked = T.chapterCards(C, { cleared: {} });
  assert.deepStrictEqual(locked.filter(c => !c.upcoming).map(c => [c.id, c.unlocked]), [['tutorial', true], ['dokkaebi_pass', false], ['fox_forest', false]]);
  assert.ok(locked.find(c => c.id === 'dokkaebi_pass').reason.includes('서낭당 앞'));
  assert.ok(locked.some(c => c.upcoming && c.name === '물귀신 나루' && !c.unlocked));
  const open = T.chapterCards(C, { cleared: { tutorial: true } });
  assert.strictEqual(open.find(c => c.id === 'dokkaebi_pass').unlocked, true);
  assert.strictEqual(open.find(c => c.id === 'tutorial').cleared, true);
  assert.strictEqual(T.chapterCards(C, { cleared: {} }, true).find(c => c.id === 'dokkaebi_pass').unlocked, true);
});

test('수치 줄: 부품별 레벨 값(parts)도 보여 준다 — 공통 값, 그다음 앞 부품이 우선', () => {
  assert.strictEqual(T.statLine({ heal: 2, parts: [{ dps: 40 }, { dps: 18 }] }), '초당 40');
  assert.strictEqual(T.statLine({ cd: 1.4, parts: [{ dps: 10 }, { dmg: 45 }] }), '피해 45 · 초당 10 · 주기 1.4초');
});

test('영웅 카드: 잠금 이유, 마지막 영웅 선택 표시', () => {
  const SAVE = require('../engine/save.js');
  const meta = SAVE.loadMeta({ getItem: () => null, setItem() {}, removeItem() {} });
  const cards = T.heroCards(C, meta);
  assert.deepStrictEqual(cards.map(c => [c.id, c.unlocked]), [['yeonhwa', true], ['jeonwoochi', false], ['beomi', false], ['bari', false], ['gangrim', false], ['hong', false], ['cheoyong', false], ['parkssi', false]]);
  assert.ok(cards[0].selected);
  assert.ok(cards[1].reason.includes('도깨비 고개'));
  assert.strictEqual(cards[2].start, C.talismans.fire_talisman.name);
});

test('저주 카드: 지난 선택 기억, 반응 난이도 표기', () => {
  const meta = { lastCurses: { dokkaebi_pass: ['hard_skin'] } };
  const cards = T.curseCards(C, meta, 'dokkaebi_pass');
  assert.strictEqual(cards.length, Object.keys(C.curses).length);
  assert.ok(cards.find(c => c.id === 'hard_skin').checked);
  assert.ok(cards.find(c => c.id === 'hasty_omen').reaction);
});

test('주막거리 카드: 단계·다음 효과·비용·살 수 있는지', () => {
  const meta = { coins: 60, village: { smithy: 3 } };
  const cards = T.villageCards(C, meta);
  const smithy = cards.find(c => c.id === 'smithy'), school = cards.find(c => c.id === 'school');
  assert.strictEqual(smithy.cost, null);
  assert.strictEqual(smithy.lv, 3);
  assert.strictEqual(school.cost, C.village.school.levels[0].cost);
  assert.strictEqual(school.affordable, true);
  assert.strictEqual(school.nextDesc, C.village.school.levels[0].desc);
});
