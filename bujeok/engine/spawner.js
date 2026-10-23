// 부적난무 — 챕터 웨이브 시간표와 보스. 소환 위치는 화면 밖 고리(rules.spawn.ringMin~ringMax).
const BJ_SPAWNER = (function bjSpawner() {
  const RNG = typeof BJ_RNG !== 'undefined' ? BJ_RNG : require('./rng.js');
  const ENT = typeof BJ_ENT !== 'undefined' ? BJ_ENT : require('./entities.js');

  function ringPos(state, content) {
    const s = content.rules.spawn, a = RNG.range(state.rng, 0, Math.PI * 2), d = RNG.range(state.rng, s.ringMin, s.ringMax);
    return { x: state.player.x + Math.cos(a) * d, y: state.player.y + Math.sin(a) * d };
  }

  function tick(state, content, dt) {
    const ch = content.chapters[state.chapterId], t = state.t;
    ch.waves.forEach((w, i) => {
      if (t < w.from || t >= w.to) return;
      state.waveAcc[i] = (state.waveAcc[i] || 0) + dt;
      while (state.waveAcc[i] >= w.every) {
        state.waveAcc[i] -= w.every;
        const mu = ENT.mutation(content, state);
        let cnt = w.count;
        if (mu && mu.spawnMul) { const x = w.count * mu.spawnMul; cnt = Math.floor(x) + (RNG.next(state.rng) < x - Math.floor(x) ? 1 : 0); }
        const em = w.elite ? ENT.curse(state, 'eliteMul') : 1;
        if (em !== 1) { const x = cnt * em; cnt = Math.floor(x) + (RNG.next(state.rng) < x - Math.floor(x) ? 1 : 0); }
        for (let n = 0; n < cnt; n++) { const q = ringPos(state, content); ENT.spawnEnemy(state, content, w.enemy, q.x, q.y, { elite: w.elite }); }
      }
    });
    ch.bosses.forEach((b, i) => {
      if (state.bossDone[i] || t < b.at) return;
      state.bossDone[i] = true;
      const q = ringPos(state, content), e = ENT.spawnEnemy(state, content, b.enemy, q.x, q.y);
      e.boss = 1;
      e.bornT = t;
      if (b.final) e.final = 1; else e.leaveAt = t + content.rules.bossLeave;
      state.fx.notices.push(content.enemies[b.enemy].name + ' 출현');
      state.fx.events.push({ type: 'boss', id: b.enemy, t });
    });
    // 중간 보스를 제때 못 잡으면 보상 없이 퇴장 — 다음 보스와 무한히 겹치지 않게(스펙 4절)
    for (const e of state.enemies) {
      if (!e.leaveAt || e.dead || t < e.leaveAt) continue;
      e.dead = 1; e.left = 1;
      state.fx.notices.push('물러남 — ' + content.enemies[e.id].name);
    }
  }

  return { ringPos, tick };
})();
if (typeof module !== 'undefined') module.exports = BJ_SPAWNER;
