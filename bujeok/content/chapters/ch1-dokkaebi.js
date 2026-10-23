// 부적난무 — 1챕터 「도깨비 고개」. 10분 생존 후 최종 보스 두억시니. 입문을 클리어하면 열린다.
// 기믹(징후 → 대응 → 보상): 씨름판이 열린다(알림 + 금빛 원) → 원 안에서 6초 버틴다 → 혼백 구슬. 20초 안에 못 하면 그냥 닫힌다.
const BJ_CH_DOKKAEBI = {
  id: 'dokkaebi_pass', name: '도깨비 고개', unlock: 'tutorial', duration: 600, mods: { enemyDmg: 0.8, enemyHp: 0.85 },
  events: ['elite_raid', 'market', 'curse_altar'],
  mutations: ['split_fire', 'swift_ghosts', 'thick_hide', 'bold_horde'],
  // 씨름판이 열리는 구간(from초부터 every초마다, 최대 len초). 훅과 사건 스케줄러가 같이 읽는다 — 사건 장소와 겹치지 않게
  quietWindows: { from: 60, every: 75, len: 20 },
  waves: [
    { from: 0, to: 120, every: 1.15, enemy: 'dokkaebi_fire', count: 2 },
    // 합체 전 구간(~240초)은 기존 밀도 그대로(혼백 속도 유지). 외다리·빗자루는 첫 중간 보스(180초)를 넘긴 뒤 섞는다
    { from: 40, to: 240, every: 2.4, enemy: 'egg_ghost', count: 2 },
    { from: 240, to: 600, every: 3.1, enemy: 'egg_ghost', count: 2 },
    { from: 240, to: 600, every: 5.5, enemy: 'one_leg', count: 1 },
    { from: 90, to: 240, every: 1.6, enemy: 'little_dokkaebi', count: 2 },
    { from: 240, to: 600, every: 2.1, enemy: 'little_dokkaebi', count: 2 },
    { from: 240, to: 600, every: 7.5, enemy: 'broom_dokkaebi', count: 1 },
    { from: 200, to: 600, every: 1.05, enemy: 'dokkaebi_fire', count: 3 },
    { from: 300, to: 600, every: 6, enemy: 'stone_dokkaebi', count: 1 }, // 입문 정의 재사용
    { from: 300, to: 600, every: 1.2, enemy: 'egg_ghost', count: 3 },
    { from: 420, to: 600, every: 5, enemy: 'little_dokkaebi', count: 2, elite: true },
    { from: 150, to: 600, every: 180, enemy: 'honbul', count: 1 }, // 보물 요괴: 330·510초
  ],
  bosses: [{ at: 180, enemy: 'one_eye' }, { at: 360, enemy: 'club_dokkaebi' }, { at: 600, enemy: 'duoksini', final: true }],
  props: [{ kind: 'ring', x: 0, y: 0, r: 110 }],
  hooks: {
    onTick(api, hs, dt) {
      const q = BJ_CH_DOKKAEBI.quietWindows;
      if (hs.next == null) hs.next = q.from;
      if (!hs.active && api.t >= hs.next) {
        const a = api.rand() * Math.PI * 2, d = 250 + api.rand() * 150;
        hs.x = api.player.x + Math.cos(a) * d; hs.y = api.player.y + Math.sin(a) * d;
        hs.active = true; hs.in = 0; hs.until = api.t + q.len; hs.next += q.every; // 예정 시각 기준(틱 오차가 쌓이지 않게)
        api.moveProp(0, hs.x, hs.y);
        api.setProp(0, 'active', 0);
        api.notify('도깨비 씨름판이 열렸다 — 원 안에서 6초 버텨라');
      }
      if (!hs.active) return;
      if (Math.hypot(api.player.x - hs.x, api.player.y - hs.y) <= api.prop(0).r) hs.in += dt;
      if (hs.in >= 6) {
        hs.active = false;
        api.setProp(0, 'idle', 0);
        for (let i = 0; i < 6; i++) api.dropXp(hs.x + (i - 2.5) * 14, hs.y, 4);
        api.notify('씨름판 승리 — 혼백 구슬');
      } else if (api.t >= hs.until) {
        hs.active = false;
        api.setProp(0, 'idle', 0);
        api.notify('씨름판이 닫혔다');
      } else api.setProp(0, 'active', hs.in / 6);
    },
  },
};
if (typeof module !== 'undefined') module.exports = BJ_CH_DOKKAEBI;
