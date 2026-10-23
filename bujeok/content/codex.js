// 부적난무 — 도감 수집률 보상. 칭호만 준다(수치 보상 없음, 스펙 7.3). 수집률 = (등록한 요괴 + 얻은 부적 + 발견한 합체) / 전체.
const BJ_CODEX = {
  rewards: [
    { at: 0.25, title: '풋내기 퇴마사' },
    { at: 0.5, title: '부적 수집가' },
    { at: 0.75, title: '요괴 박사' },
    { at: 1, title: '부적난무의 주인' },
  ],
};
if (typeof module !== 'undefined') module.exports = BJ_CODEX;
