// 부적난무 — 선택형 저주. 클리어한 챕터를 다시 할 때 출정 화면에서 최대 rules.curses.max개를 고른다. 하나당 결과 엽전 +25%.
// 규칙을 바꾸는 저주만 둔다(스펙 6절). reaction: 반응 속도 난이도(예고 단축)는 따로 표기한다.
const BJ_CURSES = {
  hard_skin: { name: '단단한 가죽', desc: '요괴 체력 +30%', enemyHp: 1.3 },
  sharp_claws: { name: '날카로운 발톱', desc: '요괴 피해 +30%', enemyDmg: 1.3 },
  hasty_omen: { name: '성급한 징조', desc: '위험 예고 시간 -25%', reaction: true, warnMul: 0.75 },
  dry_well: { name: '마른 우물', desc: '회복량 절반', healMul: 0.5 },
  elite_tide: { name: '정예의 물결', desc: '정예 무리 두 배', eliteMul: 2 },
};
if (typeof module !== 'undefined') module.exports = BJ_CURSES;
