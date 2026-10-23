// 부적난무 — 2챕터 「여우 대숲」. 10분 생존 후 최종 보스 천년 구미호. 1챕터를 클리어하면 열린다.
// 기믹 1(징후 → 대응 → 보상): 분신 무리가 나타난다(알림) → 붉은 그림자가 있는 본체를 찾아 친다(맞으면 노출 표식) → 본체를 잡으면 무리가 사라지고 혼백 구슬.
//   열쇠: 여우불+복숭아 합체(두 갈래 모두)가 있으면 노출 시간 ×1.5(스펙 5.4).
// 기믹 2: 안개가 깔린다(2초 예고) → 시야가 좁아진다(위험 예고는 안개 위에 보인다) → 20초 뒤 걷힌다.
const BJ_CH_FOX = {
  id: 'fox_forest', name: '여우 대숲', unlock: 'dokkaebi_pass', duration: 600,
  mods: { enemyDmg: 0.7, enemyHp: 0.85 },
  events: ['elite_raid', 'market', 'curse_altar'],
  mutations: ['swift_ghosts', 'bold_horde'], // 도깨비불·꼬마 도깨비가 없으니 그 변이는 뺀다
  keys: { fox_peach: { reveal: 1.5 } },
  waves: [
    { from: 0, to: 120, every: 1.1, enemy: 'changgwi', count: 2 },
    { from: 30, to: 600, every: 2.6, enemy: 'geusundae', count: 1 },
    { from: 90, to: 600, every: 1.75, enemy: 'changgwi', count: 2 },
    { from: 90, to: 600, every: 4, enemy: 'yagwang', count: 1 },
    { from: 200, to: 600, every: 2.5, enemy: 'egg_ghost', count: 2 },
    { from: 200, to: 600, every: 6.7, enemy: 'orb_fox', count: 1 },
    { from: 300, to: 600, every: 1.75, enemy: 'geusundae', count: 2 },
    { from: 300, to: 600, every: 6.25, enemy: 'songaksi', count: 1 }, // 치유사: 먼저 잡아야 할 대상(자동 조준은 가장 가까운 적이라 회복량은 낮게 시작)
    { from: 420, to: 600, every: 5, enemy: 'changgwi', count: 2, elite: true },
    { from: 150, to: 600, every: 180, enemy: 'honbul', count: 1 }, // 보물 요괴: 330·510초
  ],
  bosses: [{ at: 180, enemy: 'jangsanbeom' }, { at: 360, enemy: 'fox_shaman' }, { at: 600, enemy: 'gumiho', final: true }],
  props: [],
  hooks: {
    onTick(api, hs) {
      if (hs.packAt == null) { hs.packAt = 50; hs.fogAt = 90; hs.pack = 0; }
      if (api.t >= hs.packAt) {
        hs.packAt = api.t + 45; hs.pack++;
        const a0 = api.rand() * Math.PI * 2;
        for (let i = 0; i < 6; i++) {
          const a = a0 + i * Math.PI / 3, x = api.player.x + Math.cos(a) * 300, y = api.player.y + Math.sin(a) * 300;
          if (i === 0) api.spawn('fox_true', x, y, { pack: hs.pack, tag: 'true' }); else api.spawn('fox_clone', x, y, { pack: hs.pack });
        }
        api.notify('구미호 분신이 나타났다 — 붉은 그림자가 본체');
      }
      if (!hs.fogWarned && api.t >= hs.fogAt - 2) { hs.fogWarned = true; api.notify('안개가 깔린다'); }
      if (api.t >= hs.fogAt) { hs.fogAt = api.t + 70; hs.fogWarned = false; api.addVisionModifier(0.2, 20); }
    },
    onEnemyDeath(api, hs, e) {
      if (e.tag !== 'true') return;
      const n = api.clearPack(e.pack);
      for (let i = 0; i < n + 1; i++) api.dropXp(e.x + (i - n / 2) * 12, e.y, 3);
      api.notify('본체를 잡았다 — 분신이 흩어진다');
    },
  },
};
if (typeof module !== 'undefined') module.exports = BJ_CH_FOX;
