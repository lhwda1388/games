// 부적난무 — 영웅. unlock이 없으면 처음부터. unlock: `{ cleared }` | `{ eliteKills }` | `{ stat, n }`(+ `lockText`). 해금 조건은 engine/meta.js가 판정한다(스펙 7.1).
const BJ_HEROES = {
  yeonhwa: { name: '무녀 연화', glyph: '巫', desc: '레벨업 선택지 다시 뽑기 +1, 부적 쿨다운 -10%', start: 'bell', cdMul: 0.9, rerolls: 1, fusionStartLv: 1 },
  jeonwoochi: { name: '도사 전우치', glyph: '道', desc: '합체할 때 결과 부적이 2레벨로 시작, 최대 체력 +25%', start: 'spirit_sword', rerolls: 0, fusionStartLv: 2, hpMul: 1.25, unlock: { cleared: 'dokkaebi_pass' } },
  beomi: { name: '호랑이 사냥꾼 범이', glyph: '獵', desc: '최대 체력 +40%, 구슬 흡수 범위 +50%, 정예에게 피해 +30%', start: 'fire_talisman', rerolls: 0, fusionStartLv: 1, hpMul: 1.4, magnetMul: 1.5, eliteDmgMul: 1.3, unlock: { eliteKills: 50 } },
  bari: { name: '바리공주', glyph: '花', desc: '판마다 부활 +1(무당집과 합쳐 최대 2번)', start: 'peach_branch', rerolls: 0, fusionStartLv: 1, revive: 1, unlock: { cleared: 'fox_forest' } },
  gangrim: { name: '저승차사 강림도령', glyph: '差', desc: '보스에게 피해 +50%, 구슬 흡수 범위 +30%', start: 'chain_lightning', rerolls: 0, fusionStartLv: 1, bossDmgMul: 1.5, magnetMul: 1.3, unlock: { stat: 'bossKills', n: 20 }, lockText: '보스 20마리 처치' },
  hong: { name: '의적 홍길동', glyph: '洪', desc: '이동 속도 +15%, 부적 쿨다운 -10%, 최대 체력 +5%', start: 'whirlwind', rerolls: 0, fusionStartLv: 1, speedMul: 1.15, cdMul: 0.9, hpMul: 1.05, unlock: { stat: 'runs', n: 15 }, lockText: '판 15번 플레이' },
  cheoyong: { name: '춤추는 처용', glyph: '舞', desc: '귀신에게 피해 +35%, 레벨업 선택지 다시 뽑기 +1, 최대 체력 +35%', start: 'fox_fire', rerolls: 1, fusionStartLv: 1, ghostDmgMul: 1.35, hpMul: 1.35, unlock: { stat: 'ghostKills', n: 1000 }, lockText: '귀신 1000마리 처치' },
  parkssi: { name: '박씨부인', glyph: '朴', desc: '장판·오라 반지름 +20%, 최대 체력 +10%', start: 'red_bean', rerolls: 0, fusionStartLv: 1, areaMul: 1.2, hpMul: 1.1, unlock: { stat: 'fusions', n: 30 }, lockText: '합체 30번' },
};
if (typeof module !== 'undefined') module.exports = BJ_HEROES;
