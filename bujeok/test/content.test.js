const test = require('node:test');
const assert = require('node:assert');
const C = require('../content/index.js');

test('콘텐츠 무결성: 오류 없음', () => {
  assert.deepStrictEqual(C.validate(C), []);
});

test('없는 ID, 갈래 중복 사용을 잡는다', () => {
  const bad = { ...C, recipes: { ...C.recipes, x: { a: 'nope', b: 'bell', branches: ['hwaryongpung', 'nope2'] } } };
  const errs = C.validate(bad);
  assert.ok(errs.some(e => e.includes('nope')));
  assert.ok(errs.some(e => e.includes('hwaryongpung')));
});

test('레벨 개수가 규칙과 다르면 잡는다', () => {
  const bell = { ...C.talismans.bell, levels: C.talismans.bell.levels.slice(0, 4) };
  const errs = C.validate({ ...C, talismans: { ...C.talismans, bell } });
  assert.ok(errs.some(e => e.includes('bell')));
});

test('챕터가 없는 적·보스 아닌 보스를 쓰면 잡는다', () => {
  const ch = { ...C.chapters.tutorial, waves: [{ from: 0, to: 1, every: 1, enemy: 'ghost404', count: 1 }], bosses: [{ at: 1, enemy: 'japgwi', final: true }] };
  const errs = C.validate({ ...C, chapters: { tutorial: ch } });
  assert.ok(errs.some(e => e.includes('ghost404')));
  assert.ok(errs.some(e => e.includes('보스가 아님')));
});

test('renamed 순환을 잡는다', () => {
  const errs = C.validate({ ...C, renamed: { a: 'b', b: 'a' } });
  assert.ok(errs.some(e => e.includes('순환')));
});

test('모든 적 반경(정예 배율 포함)이 공간 해시 MAX_R보다 여유 있게 작다', () => {
  const W = require('../engine/world.js'), ENT = require('../engine/entities.js');
  for (const [id, d] of Object.entries(C.enemies)) {
    const r = d.r * (d.boss ? 1 : C.rules.elite.r);
    assert.ok(r <= W.MAX_R - 4, `${id}: 반경 ${r} > MAX_R(${W.MAX_R}) - 4`);
  }
});

test('부적 12장, 레시피 6쌍, 기본 부적은 정확히 한 레시피의 재료', () => {
  const base = Object.keys(C.talismans).filter(id => !C.talismans[id].fusion);
  assert.strictEqual(base.length, 12);
  assert.strictEqual(Object.keys(C.recipes).length, 6);
  for (const id of base) assert.strictEqual(Object.values(C.recipes).filter(r => r.a === id || r.b === id).length, 1, id);
});

test('부적 글자는 서로 겹치지 않는다', () => {
  const g = Object.values(C.talismans).map(t => t.glyph);
  assert.strictEqual(new Set(g).size, g.length);
});

test('레벨의 부품별 덮어쓰기(parts)가 부품 수보다 길면 잡는다', () => {
  const ward = C.talismans.peach_ward, lv = { ...ward.levels[0], parts: [{}, {}, { dps: 1 }] };
  const errs = C.validate({ ...C, talismans: { ...C.talismans, peach_ward: { ...ward, levels: [lv, ...ward.levels.slice(1)] } } });
  assert.ok(errs.some(e => e.includes('peach_ward')));
});

test('영웅 8명·시설 4개(각 3단계)·저주 5개·도감 보상 4개', () => {
  assert.deepStrictEqual(Object.keys(C.heroes), ['yeonhwa', 'jeonwoochi', 'beomi', 'bari', 'gangrim', 'hong', 'cheoyong', 'parkssi']);
  assert.deepStrictEqual(Object.keys(C.village), ['smithy', 'school', 'shrine', 'apothecary']);
  for (const f of Object.values(C.village)) assert.strictEqual(f.levels.length, 3);
  assert.strictEqual(Object.keys(C.curses).length, 5);
  assert.deepStrictEqual(C.codex.rewards.map(r => r.at), [0.25, 0.5, 0.75, 1]);
});

test('영구 강화 상한: 대장간 최대 체력 배수 ≤ 1.2', () => {
  const top = C.village.smithy.levels[2].perk.maxHpMul;
  assert.ok(top <= 1.2, String(top));
  // 대장간만 maxHpMul을 쓴다(무당집 부활은 상한 밖, 영웅 hpMul은 별도). 합산해도 1.2 이하
  let mul = 1;
  for (const [id, f] of Object.entries(C.village)) {
    const m = Math.max(1, ...f.levels.map(l => l.perk.maxHpMul || 1));
    if (id !== 'smithy') assert.ok(f.levels.every(l => l.perk.maxHpMul == null), id);
    mul *= m;
  }
  assert.ok(mul <= 1.2, String(mul));
});

test('검사기가 잘못된 해금·시설 효과를 잡는다', () => {
  const badHero = { ...C, heroes: { ...C.heroes, x: { name: 'x', start: 'bell', unlock: { cleared: 'nope' } } } };
  assert.ok(C.validate(badHero).some(e => e.includes('nope')));
  const badPerk = { ...C, village: { ...C.village, smithy: { ...C.village.smithy, levels: [{ cost: 1, desc: 'd', perk: { bogus: 1 } }, ...C.village.smithy.levels.slice(1)] } } };
  assert.ok(C.validate(badPerk).some(e => e.includes('bogus')));
});
