// 부적난무 — 요괴 변이. 정규 챕터의 판마다 하나가 시드로 정해진다(입문 제외). 시작 알림과 결과 화면에 보인다.
const BJ_MUTATIONS = {
  split_fire: { name: '갈라지는 도깨비불', desc: '도깨비불이 꺼지면 작은 불이 하나 튀어나온다', target: 'dokkaebi_fire', split: { enemy: 'dokkaebi_fire_small', count: 1 } },
  swift_ghosts: { name: '날랜 귀신', desc: '귀신들이 30% 빠르다', ghosts: true, speedMul: 1.3 },
  thick_hide: { name: '두꺼운 가죽', desc: '꼬마 도깨비의 체력 +60%', target: 'little_dokkaebi', hpMul: 1.6 },
  bold_horde: { name: '대담한 무리', desc: '요괴가 20% 더 몰려온다', spawnMul: 1.2 },
};
if (typeof module !== 'undefined') module.exports = BJ_MUTATIONS;
