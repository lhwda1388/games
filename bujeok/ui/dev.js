// 부적난무 — 개발 패널(?dev=1). 시간 이동, 빌드 강제, 보스 소환, 무적, 부하 시험, 스냅샷, 로그 내보내기, 피해 기여도.
const BJ_DEV = (function bjDev() {
  function attach(o) {
    const C = o.content, root = document.getElementById('dev');
    root.hidden = false;
    root.innerHTML = `<details${innerWidth < 600 ? '' : ' open'}><summary>개발</summary>
      <div class="dev-row"><button type="button" data-a="boss">다음 보스로</button><button type="button" data-a="spawnBoss">보스 소환</button><button type="button" data-a="inv">무적: 끔</button></div>
      <div class="dev-row"><select data-k="tal" aria-label="부적">${Object.keys(C.talismans).map(id => `<option value="${id}">${C.talismans[id].name}</option>`).join('')}</select>
        <input data-k="lv" type="number" min="1" max="5" value="3" aria-label="레벨"><button type="button" data-a="give">부적 지정</button></div>
      <div class="dev-row"><button type="button" data-a="stress">적 400</button><button type="button" data-a="snapSave">스냅샷 저장</button><button type="button" data-a="snapLoad">스냅샷 불러오기</button><button type="button" data-a="log">로그 내보내기</button></div>
      <pre class="dev-stats"></pre></details>`;
    const q = s => root.querySelector(s);
    const ACT = {
      boss(s) { const b = C.chapters[s.chapterId].bosses.find((x, i) => !s.bossDone[i]); if (b) s.t = Math.max(s.t, b.at - 1); },
      spawnBoss(s) { const e = BJ_ENT.spawnEnemy(s, C, C.chapters[s.chapterId].bosses[0].enemy, s.player.x, s.player.y - 300); e.boss = 1; },
      inv(s, btn) { o.flags.invincible = !o.flags.invincible; btn.textContent = '무적: ' + (o.flags.invincible ? '켬' : '끔'); },
      give(s) {
        const id = q('[data-k=tal]').value, max = C.talismans[id].levels.length;
        const lv = Math.max(1, Math.min(max, +q('[data-k=lv]').value || 1));
        const slot = s.slots.find(x => x.id === id);
        if (slot) slot.lv = lv; else s.slots.push({ id, lv, cd: 0 });
        BJ_SKILLS.pickTarget(s, C);
        BJ_SKILLS.nextChoice(s, C);
      },
      stress(s) {
        for (let i = 0; i < 400; i++) {
          const a = i / 400 * Math.PI * 2, d = 200 + (i % 5) * 60;
          BJ_ENT.spawnEnemy(s, C, 'little_dokkaebi', s.player.x + Math.cos(a) * d, s.player.y + Math.sin(a) * d);
        }
      },
      snapSave(s) { o.store.setItem('bujeok.devSnap', JSON.stringify(s, BJ_SAVE.dropFx)); },
      snapLoad() {
        const raw = o.store.getItem('bujeok.devSnap');
        if (!raw) return;
        const s = JSON.parse(raw);
        s.fx = BJ_ENT.freshFx();
        o.set(s);
      },
      log() {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(o.log.items)], { type: 'application/json' }));
        a.download = 'bujeok-log.json';
        a.click();
        URL.revokeObjectURL(a.href);
      },
    };
    root.onclick = ev => {
      const btn = ev.target.closest('[data-a]'), s = o.get();
      if (!btn || (!s && btn.dataset.a !== 'snapLoad' && btn.dataset.a !== 'log')) return;
      ACT[btn.dataset.a](s, btn);
    };
    setInterval(() => {
      const s = o.get();
      if (!s) { q('.dev-stats').textContent = ''; return; }
      const top = Object.entries(s.stats.damageBy).sort((a, b) => b[1] - a[1]).slice(0, 6)
        .map(([k, v]) => `${(C.talismans[k] || { name: k }).name} ${Math.round(v)}`).join('\n');
      q('.dev-stats').textContent = `seed ${s.seed}  t ${s.t.toFixed(1)}\n적 ${s.enemies.length}  투사체 ${s.shots.length}  장판 ${s.zones.length}  구슬 ${s.gems.length}\n프레임 ${o.perf.frameMs.toFixed(1)}ms  저장 ${o.perf.saveMs.toFixed(1)}ms\n— 피해 기여 —\n${top}`;
    }, 500);
  }
  return { attach };
})();
