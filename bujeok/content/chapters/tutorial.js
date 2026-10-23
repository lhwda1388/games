// 부적난무 — 입문 「서낭당 앞」. 6분 생존 후 최종 보스. guided: 레벨업 n번째 선택지 안내(첫 합체 2:00~2:30 보장, 스펙 4절).
// 기믹(징후 → 대응 → 보상): 서낭당이 흔들린다 → 20초 안에 근처 요괴 8마리 → 회복 구슬.
const BJ_CH_TUTORIAL = {
  id: 'tutorial', tutorial: true, name: '서낭당 앞', duration: 360, mods: { enemyDmg: 0.4, regen: 0.5 },
  waves: [
    { from: 0, to: 90, every: 1.0, enemy: 'dokkaebi_fire', count: 2 },
    { from: 30, to: 200, every: 2.2, enemy: 'japgwi', count: 3 },
    { from: 200, to: 360, every: 2.2, enemy: 'mongdal', count: 4 }, // 잡귀 자리를 몽달귀가 이어받는다(체력 총량 같게)
    { from: 90, to: 360, every: 1.75, enemy: 'little_dokkaebi', count: 2 },
    { from: 120, to: 360, every: 2.7, enemy: 'stone_dokkaebi', count: 1 }, // 원거리 입문(2챕터 탄막 예습)
    { from: 150, to: 360, every: 0.9, enemy: 'dokkaebi_fire', count: 3 },
    { from: 240, to: 360, every: 6, enemy: 'little_dokkaebi', count: 1, elite: true },
  ],
  bosses: [{ at: 180, enemy: 'one_eye' }, { at: 360, enemy: 'one_eye_elder', final: true }],
  props: [{ kind: 'shrine', glyph: '祠', x: 0, y: -220, flank: 'jangseung' }], // flank: 소품 양옆에 세우는 장식 그림(w:prop:<flank>, 판정 없음)
  guided: [
    ['new:red_bean', 'up:bell', 'new:fire_talisman'],
    ['up:red_bean', 'up:bell', 'new:fire_talisman'],
    ['up:red_bean', 'up:bell', 'new:whirlwind'],
    ['up:red_bean', 'up:bell', 'new:fire_talisman'],
    ['up:red_bean', 'up:bell', 'new:whirlwind'],
  ],
  hooks: {
    onTick(api, hs) {
      if (hs.next == null) hs.next = 40;
      if (!hs.active && api.t >= hs.next) {
        hs.active = true; hs.need = 8; hs.until = api.t + 20; hs.next = api.t + 60;
        api.setProp(0, 'active');
        api.notify('서낭당이 흔들린다 — 근처 요괴를 물리쳐라');
      }
      if (hs.active && api.t >= hs.until) { hs.active = false; api.setProp(0, 'idle'); }
    },
    onEnemyDeath(api, hs, e) {
      if (!hs.active) return;
      const p = api.prop(0);
      if (Math.hypot(e.x - p.x, e.y - p.y) > 200) return;
      if (--hs.need > 0) return;
      hs.active = false;
      api.setProp(0, 'idle');
      api.dropHeal(p.x, p.y + 30, 30);
      api.notify('서낭당이 고요해졌다 — 회복 구슬');
    },
  },
};
if (typeof module !== 'undefined') module.exports = BJ_CH_TUTORIAL;
