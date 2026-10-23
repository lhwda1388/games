// 부적난무 — 영구 기록(판 밖 성장). 시설 강화·효과 합산·영웅 해금·도감 수집률·결과 기록. 순수 함수 — 저장은 save.js가 한다.
const BJ_META = (function bjMeta() {
  const PERKS0 = () => ({ maxHpMul: 1, coinMul: 1, choiceBonus: 0, rerolls: 0, discards: 0, revive: 0, startPick: 0 });

  function perks(content, meta) {
    const p = PERKS0();
    for (const [id, f] of Object.entries(content.village)) {
      const lv = (meta.village || {})[id] || 0;
      if (lv > 0) Object.assign(p, f.levels[Math.min(lv, f.levels.length) - 1].perk);
    }
    return p;
  }

  function cost(content, meta, id) {
    const lv = meta.village[id] || 0, f = content.village[id];
    return lv < f.levels.length ? f.levels[lv].cost : null;
  }

  function upgrade(content, meta, id) {
    const c = cost(content, meta, id);
    if (c == null || meta.coins < c) return false;
    meta.coins -= c;
    meta.village[id] = (meta.village[id] || 0) + 1;
    return true;
  }

  function heroUnlocked(content, meta, id) {
    const u = content.heroes[id].unlock;
    if (!u) return true;
    if (u.cleared) return !!meta.cleared[u.cleared];
    if (u.eliteKills) return meta.stats.eliteKills >= u.eliteKills;
    if (u.stat) return (meta.stats[u.stat] || 0) >= u.n;
    return false;
  }

  function heroLockReason(content, meta, id) {
    const h = content.heroes[id], u = h.unlock;
    if (!u || heroUnlocked(content, meta, id)) return '';
    if (u.cleared) return `「${content.chapters[u.cleared].name}」 클리어 시 열려요`;
    if (u.eliteKills) return `정예 요괴 ${u.eliteKills}마리 처치 (${meta.stats.eliteKills}/${u.eliteKills})`;
    if (u.stat) return `${h.lockText} (${Math.min(meta.stats[u.stat] || 0, u.n)}/${u.n})`;
    return '';
  }

  function codex(content, meta) {
    const enemies = Object.entries(content.enemies).filter(([, d]) => d.codex !== false).map(([id, d]) => ({ id, name: d.name, glyph: d.glyph, found: !!meta.killed[id] }));
    const talismans = Object.entries(content.talismans).filter(([, t]) => !t.fusion).map(([id, t]) => ({ id, name: t.name, glyph: t.glyph, how: t.how, found: !!meta.obtained[id] }));
    const fusions = Object.entries(content.talismans).filter(([, t]) => t.fusion).map(([id, t]) => ({ id, name: t.name, glyph: t.glyph, how: t.how, found: !!meta.discovered[id] }));
    const list = [...enemies, ...talismans, ...fusions], found = list.filter(x => x.found).length;
    return { enemies, talismans, fusions, found, total: list.length, pct: list.length ? found / list.length : 0 };
  }

  // 결과를 영구 기록에 반영한다. SAVE.grant(같은 runId 한 번)가 true일 때만 부른다. 새로 얻은 칭호·새로 열린 영웅을 돌려준다
  // 승리한 챕터는 이번 판으로 클리어된 것으로 본다 — grant가 cleared를 먼저 썼더라도 '이번에 열린 영웅'을 정확히 알리도록,
  // 해금 판정의 '이전' 상태는 그 챕터를 뺀 cleared로 계산한다
  function record(content, meta, res, before) {
    const saved = meta.cleared[res.chapterId];
    if (before) meta.cleared = { ...before }; // 호출 쪽이 grant 전 상태를 주면 그대로 '이전'으로 쓴다 — 이미 클리어한 챕터를 다시 이겨도 새 영웅으로 알리지 않게
    else if (res.win) delete meta.cleared[res.chapterId];
    const elitesBefore = meta.stats.eliteKills;
    const heroesBefore = Object.keys(content.heroes).filter(id => heroUnlocked(content, meta, id));
    if (res.win || saved) meta.cleared[res.chapterId] = true;
    meta.stats.eliteKills = elitesBefore;
    for (const id of res.killed || []) meta.killed[id] = true;
    for (const id of res.obtained || []) meta.obtained[id] = true;
    meta.stats.runs++;
    meta.stats.eliteKills += res.eliteKills || 0;
    meta.stats.bossKills = (meta.stats.bossKills || 0) + (res.bossKills || 0);
    meta.stats.ghostKills = (meta.stats.ghostKills || 0) + (res.ghostKills || 0);
    meta.stats.fusions = (meta.stats.fusions || 0) + (res.fusions || []).length;
    if (res.heroId) meta.lastHero = res.heroId;
    if (res.curses) meta.lastCurses[res.chapterId] = res.curses.slice();
    const pct = codex(content, meta).pct, newTitles = [];
    for (const r of content.codex.rewards) if (pct >= r.at - 1e-9 && !meta.titles.includes(r.title)) { meta.titles.push(r.title); newTitles.push(r.title); }
    const newHeroes = Object.keys(content.heroes).filter(id => heroUnlocked(content, meta, id) && !heroesBefore.includes(id));
    return { newTitles, newHeroes };
  }

  function cursesAllowed(content, meta, chapterId) {
    return !content.chapters[chapterId].tutorial && !!meta.cleared[chapterId];
  }

  return { perks, cost, upgrade, heroUnlocked, heroLockReason, codex, record, cursesAllowed };
})();
if (typeof module !== 'undefined') module.exports = BJ_META;
