// 부적난무 — 마을 「주막거리」. 단계 n의 perk는 그 시설의 누적 최종값이다(META.perks가 시설별로 합친다).
// 상한(스펙 7.2): 전투 수치는 대장간 최대 체력 +15%까지만. 나머지는 선택권·편의·엽전이다.
const BJ_VILLAGE = {
  smithy: { name: '대장간', glyph: '鍛', desc: '튼튼한 몸', levels: [
    { cost: 60, desc: '최대 체력 +5%', perk: { maxHpMul: 1.05 } },
    { cost: 140, desc: '최대 체력 +10%', perk: { maxHpMul: 1.1 } },
    { cost: 260, desc: '최대 체력 +15%', perk: { maxHpMul: 1.15 } },
  ] },
  school: { name: '서당', glyph: '書', desc: '배움과 셈', levels: [
    { cost: 50, desc: '결과 엽전 +10%', perk: { coinMul: 1.1 } },
    { cost: 120, desc: '결과 엽전 +20%', perk: { coinMul: 1.2 } },
    { cost: 300, desc: '레벨업 선택지 4장', perk: { coinMul: 1.2, choiceBonus: 1 } },
  ] },
  shrine: { name: '무당집', glyph: '神', desc: '굿과 가호', levels: [
    { cost: 80, desc: '다시 뽑기 +1', perk: { rerolls: 1 } },
    { cost: 160, desc: '부적 버리기 +1', perk: { rerolls: 1, discards: 1 } },
    { cost: 320, desc: '판마다 부활 1회', perk: { rerolls: 1, discards: 1, revive: 1 } },
  ] },
  apothecary: { name: '약방', glyph: '藥', desc: '시작 부적 선택권', levels: [
    { cost: 70, desc: '시작 부적 2장 중 고르기', perk: { startPick: 2 } },
    { cost: 150, desc: '시작 부적 3장 중 고르기', perk: { startPick: 3 } },
    { cost: 280, desc: '시작 부적을 전부에서 고르기', perk: { startPick: 12 } },
  ] },
};
if (typeof module !== 'undefined') module.exports = BJ_VILLAGE;
