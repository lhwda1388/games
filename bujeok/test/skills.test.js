const test = require('node:test');
const assert = require('node:assert');
const C = require('../content/index.js');
const SK = require('../engine/skills.js');
const RNG = require('../engine/rng.js');

function mk(slots = [], extra = {}) {
  return Object.assign({
    t: 0, chapterId: 'none', heroId: 'yeonhwa', rng: RNG.create(5),
    slots: slots.map(([id, lv]) => ({ id, lv, cd: 0 })),
    consumed: {}, fused: {}, postponed: {}, target: null, sinceTarget: 0, levelOrdinal: 0, pendingLevels: 0,
    choice: null, discards: 2, rerolls: 1, player: { hp: 50, maxHp: 100 }, stats: { fusions: [] }, fx: { events: [] },
  }, extra);
}
const keys = opts => opts.map(SK.key).sort();

test('레시피 재료를 얻으면 목표 레시피가 정해진다', () => {
  const s = mk();
  SK.apply(s, C, { kind: 'new', id: 'bell' });
  assert.strictEqual(s.target, 'bell_bean');
});

test('후보: 보유 강화 + 미보유 신규. 합체 부적과 소비된 재료는 제외', () => {
  const s = mk([['bell', 1]], { consumed: { fire_talisman: true } });
  const ks = keys(SK.candidates(s, C));
  assert.strictEqual(ks.filter(k => k === 'up:bell').length, 1);
  const news = ks.filter(k => k.startsWith('new:')).map(k => k.slice(4));
  const expected = Object.keys(C.talismans).filter(id => !C.talismans[id].fusion && id !== 'bell' && id !== 'fire_talisman').sort();
  assert.deepStrictEqual(news.slice().sort(), expected);
  for (const id of news) {
    assert.ok(!C.talismans[id].fusion, `${id} is fusion`);
    assert.notStrictEqual(id, 'fire_talisman');
  }
  assert.ok(!ks.some(k => k.includes('fire_talisman')));
  for (const id of Object.keys(C.talismans).filter(id => C.talismans[id].fusion)) assert.ok(!ks.some(k => k.endsWith(':' + id)), id);
});

test('슬롯이 가득 차면 신규 없음, 후보가 없으면 정화수', () => {
  const full = mk([['bell', 1], ['red_bean', 1], ['fire_talisman', 1], ['whirlwind', 1], ['hwaryongpung', 1], ['boundary_ward', 1]]);
  assert.ok(SK.candidates(full, C).every(o => o.kind === 'up'));
  const maxed = mk([['bell', 5], ['red_bean', 5], ['fire_talisman', 5], ['whirlwind', 5], ['hwaryongpung', 3], ['boundary_ward', 3]]);
  assert.deepStrictEqual(SK.makeOptions(maxed, C, null), [{ kind: 'heal' }]);
  maxed.pendingLevels = 1;
  SK.offer(maxed, C);
  SK.choose(maxed, C, 0);
  assert.strictEqual(maxed.player.hp, 80);
});

test('도달 보정: 목표 관련 선택지가 연속 3번 안에 최소 한 번 나온다', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const s = mk([['bell', 1]], { rng: RNG.create(seed) });
    SK.apply(s, C, { kind: 'new', id: 'whirlwind' });
    s.target = 'bell_bean';
    const hits = [];
    for (let i = 0; i < 12; i++) {
      SK.offer(s, C);
      hits.push(s.choice.options.some(o => SK.related(s, C, o)));
      s.choice = null;
    }
    for (let i = 0; i + 3 <= hits.length; i++) assert.ok(hits.slice(i, i + 3).some(Boolean), `seed ${seed} at ${i}`);
  }
});

test('입문 안내 목록이 첫 선택지가 된다', () => {
  const s = mk([['bell', 1]], { chapterId: 'tutorial', target: 'bell_bean' });
  SK.offer(s, C);
  assert.deepStrictEqual(keys(s.choice.options), ['new:fire_talisman', 'new:red_bean', 'up:bell']);
  assert.strictEqual(s.levelOrdinal, 1);
});

test('레벨업과 합체 조건이 겹치면 남은 레벨업을 먼저, 그다음 합체 창', () => {
  const s = mk([['bell', 3], ['red_bean', 2]], { target: 'bell_bean' });
  SK.queueLevelUp(s, C);
  SK.queueLevelUp(s, C);
  assert.strictEqual(s.choice.kind, 'levelup');
  s.choice.options = [{ kind: 'up', id: 'red_bean' }];
  SK.choose(s, C, 0);
  assert.strictEqual(s.choice.kind, 'levelup');
  SK.choose(s, C, 0);
  assert.deepStrictEqual(s.choice, { kind: 'fusion', recipe: 'bell_bean' });
  assert.ok(s.fx.events.some(e => e.type === 'fusion_ready'));
});

test('합체: 재료 소비, 결과 1레벨이 a 자리에, 재등장 금지, 다음 목표', () => {
  const s = mk([['fire_talisman', 1], ['bell', 3], ['red_bean', 4]], { target: 'bell_bean' });
  s.choice = { kind: 'fusion', recipe: 'bell_bean' };
  SK.fuse(s, C, 1);
  assert.deepStrictEqual(s.slots.map(x => [x.id, x.lv]), [['fire_talisman', 1], ['bean_bell_trap', 1]]);
  assert.ok(s.consumed.bell && s.consumed.red_bean);
  assert.strictEqual(s.fused.bell_bean, 'bean_bell_trap');
  assert.deepStrictEqual(s.stats.fusions, ['bean_bell_trap']);
  assert.ok(!SK.candidates(s, C).some(o => o.id === 'bell' || o.id === 'red_bean'));
  assert.strictEqual(s.target, 'fire_wind');
  assert.strictEqual(s.choice, null);
});

test('보류하면 다시 열리지 않고, 배지로 다시 열 수 있다', () => {
  const s = mk([['bell', 3], ['red_bean', 3]]);
  s.choice = { kind: 'fusion', recipe: 'bell_bean' };
  SK.postpone(s, C);
  assert.strictEqual(s.choice, null);
  SK.nextChoice(s, C);
  assert.strictEqual(s.choice, null);
  SK.openFusion(s, C, 'bell_bean');
  assert.deepStrictEqual(s.choice, { kind: 'fusion', recipe: 'bell_bean' });
});

test('버리기: 레벨업 중에만, 횟수 차감, 선택지 다시 뽑기', () => {
  const s = mk([['bell', 1], ['red_bean', 1], ['fire_talisman', 1], ['whirlwind', 1], ['hwaryongpung', 1], ['boundary_ward', 1]]);
  SK.discard(s, C, 0);
  assert.strictEqual(s.slots.length, 6);
  s.pendingLevels = 1;
  SK.offer(s, C);
  SK.discard(s, C, 0);
  assert.strictEqual(s.slots.length, 5);
  assert.strictEqual(s.discards, 1);
  assert.ok(SK.candidates(s, C).some(o => o.kind === 'new' && o.id === 'bell'));
});

test('다시 뽑기: 횟수 차감, 0이면 아무 일 없음', () => {
  const s = mk([['bell', 1]]);
  s.pendingLevels = 1;
  SK.offer(s, C);
  SK.reroll(s, C);
  assert.strictEqual(s.rerolls, 0);
  const before = s.choice.options;
  SK.reroll(s, C);
  assert.strictEqual(s.choice.options, before);
});

test('부적을 버려 목표 레시피 재료가 둘 다 사라지면 목표를 다시 고른다', () => {
  const s = mk([['bell', 1], ['whirlwind', 1], ['red_bean', 1]], { target: 'bell_bean', choice: { kind: 'levelup', options: [] } });
  SK.discard(s, C, 2);
  assert.strictEqual(s.target, 'bell_bean');
  SK.discard(s, C, 0);
  assert.notStrictEqual(s.target, 'bell_bean');
});
