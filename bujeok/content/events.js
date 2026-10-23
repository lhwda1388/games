// 부적난무 — 돌발 사건. 판마다 챕터의 events 목록에서 2~3개가 시드로 정해진다(engine/events.js).
// 사건 코드는 챕터 훅과 같은 api만 쓴다. es는 그 사건의 기억(판 스냅샷에 저장). es.done = true면 끝.
const BJ_EVENT_DEFS = {
  elite_raid: {
    name: '정예 습격',
    onStart(api, es) {
      api.notify('정예 습격 — 강한 요괴 무리가 몰려온다');
      const id = api.waveEnemy();
      const n = api.eliteCount(4);
      for (let i = 0; i < n; i++) {
        const a = api.rand() * Math.PI * 2;
        api.spawn(id, api.player.x + Math.cos(a) * 520, api.player.y + Math.sin(a) * 520, { elite: true });
      }
      es.done = true;
    },
  },
  market: {
    name: '도깨비 장터', site: { glyph: '市', color: 0xffd36b }, // site: 장소 그림(글자·색)
    onStart(api, es) {
      const a = api.rand() * Math.PI * 2;
      es.site = api.addSite('market', api.player.x + Math.cos(a) * 260, api.player.y + Math.sin(a) * 260, 60, 25);
      es.in = 0;
      api.notify('도깨비 장터가 섰다 — 1초 머물면 엽전으로 부적을 산다');
    },
    // 장소는 첫 구매 때 거둬진다(engine/skills.js buy). 못 사고 떠나면 남는다 — 밖으로 나갔다가 다시 1초 머물면 또 열린다
    onTick(api, es, dt) {
      if (!api.site(es.site)) { es.done = true; return; }
      const inside = api.insideSite(es.site);
      if (es.wait) { if (inside) return; es.wait = false; }
      es.in = inside ? es.in + dt : 0;
      api.setSiteProgress(es.site, Math.min(1, es.in));
      if (es.in >= 1 && api.openMarket(es.site)) { es.in = 0; es.wait = true; api.setSiteProgress(es.site, 0); }
    },
  },
  curse_altar: {
    name: '저주 제단', site: { glyph: '壇', color: 0xb48cff },
    onStart(api, es) {
      const a = api.rand() * Math.PI * 2;
      es.site = api.addSite('altar', api.player.x + Math.cos(a) * 260, api.player.y + Math.sin(a) * 260, 55, 25);
      es.in = 0;
      api.notify('저주 제단 — 1.5초 머물면 요괴가 세지는 대신 레벨 2와 엽전 10');
    },
    onTick(api, es, dt) {
      if (!api.site(es.site)) { es.done = true; return; }
      es.in = api.insideSite(es.site) ? es.in + dt : 0;
      api.setSiteProgress(es.site, Math.min(1, es.in / 1.5));
      if (es.in < 1.5) return;
      api.addRunMod('enemyDmg', 1.3);
      api.queueLevelUp(); api.queueLevelUp();
      api.addPurse(10);
      api.notify('저주를 받았다 — 요괴의 피해 +30%');
      api.removeSite(es.site);
      es.done = true;
    },
  },
};
if (typeof module !== 'undefined') module.exports = BJ_EVENT_DEFS;
