// 부적난무 — 화면 문구(순수 함수). 카드에는 짝과 두 갈래의 작동 방식·약점을 투자 전에 공개한다(스펙 5.2).
// 카드의 icon은 그림 ID(i:부적 h:영웅 w:그 밖)다. 그림이 없으면 화면은 glyph 글자로 대신 그린다.
const BJ_TEXT = (function bjText() {
  const SK = typeof BJ_SKILLS !== 'undefined' ? BJ_SKILLS : require('../engine/skills.js');
  const META = typeof BJ_META !== 'undefined' ? BJ_META : require('../engine/meta.js');
  const mmss = t => { const s = Math.floor(t); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

  // 부품별 값(lv.parts)은 펼쳐서 읽는다: 공통 값 → 앞 부품 순으로 우선(도화결계는 결계 초당 피해를 보인다)
  function statLine(level) {
    const { parts = [], ...shared } = level, lv = Object.assign({}, ...[...parts].reverse(), shared), out = [];
    if (lv.dmg) out.push('피해 ' + lv.dmg);
    if (lv.dps) out.push('초당 ' + lv.dps);
    if (lv.cd) out.push('주기 ' + lv.cd + '초');
    if (lv.count) out.push(lv.count + '발');
    if (lv.r) out.push('반경 ' + lv.r);
    if (lv.ttl) out.push('지속 ' + lv.ttl + '초');
    return out.join(' · ');
  }

  function pairs(content, id) {
    return Object.values(content.recipes).filter(r => r.a === id || r.b === id).map(r => ({
      partner: content.talismans[r.a === id ? r.b : r.a].name,
      branches: r.branches.map(b => ({ how: content.talismans[b].how, weak: content.talismans[b].weak })),
    }));
  }

  function option(content, state, o) {
    if (o.kind === 'heal') return { title: '정화수', glyph: '水', icon: 'w:heal', level: '', how: '체력 +' + content.rules.healOption, weak: '', stats: '', pairs: [], related: false };
    const t = content.talismans[o.id], s = state.slots.find(x => x.id === o.id);
    const level = o.kind === 'new' ? '새 부적' : `Lv ${s.lv} → ${s.lv + 1}`;
    const stats = o.kind === 'new' ? statLine(t.levels[0]) : `${statLine(t.levels[s.lv - 1])} → ${statLine(t.levels[s.lv])}`;
    return { title: t.name, glyph: t.glyph, icon: 'i:' + o.id, level, how: t.how, weak: t.weak, stats, pairs: pairs(content, o.id), related: SK.related(state, content, o) };
  }

  // 합체 창: 발견한 갈래만 이름·글자를 보여 준다. 작동 방식·약점·수치는 항상 보인다.
  function fusion(content, meta, recipeId) {
    const r = content.recipes[recipeId];
    return {
      a: content.talismans[r.a].name, b: content.talismans[r.b].name,
      branches: r.branches.map(id => {
        const t = content.talismans[id], known = !!meta.discovered[id];
        return { id, name: known ? t.name : '???', glyph: known ? t.glyph : '?', icon: 'i:' + id, known, how: t.how, weak: t.weak, stats: statLine(t.levels[0]) };
      }),
    };
  }

  function nextGoal(res) {
    if (!res.fusions.length) return '다음 판: 짝이 맞는 부적 두 장을 3레벨까지 키워 합체해 보세요';
    if (!res.win) return '다음 판: 같은 짝의 다른 갈래를 골라 보세요';
    return '다음 판: 새로운 짝을 찾아 합체해 보세요';
  }

  // 챕터 선택 카드. unlock 챕터를 클리어해야 열린다. devAll이면 전부 연다(?dev=1)
  function chapterCards(content, meta, devAll = false) {
    const cleared = meta.cleared || {};
    const cards = content.chapterOrder.map(id => {
      const ch = content.chapters[id], unlocked = devAll || !ch.unlock || !!cleared[ch.unlock];
      return { id, name: ch.name, unlocked, cleared: !!cleared[id], reason: unlocked ? '' : `「${content.chapters[ch.unlock].name}」 클리어 시 열려요`, upcoming: false };
    });
    return cards.concat((content.upcoming || []).map(u => ({ name: u.name, unlocked: false, cleared: false, reason: '준비 중 · ' + u.note, upcoming: true })));
  }

  function heroCards(content, meta) {
    return Object.entries(content.heroes).map(([id, h]) => ({
      id, name: h.name, glyph: h.glyph, icon: 'h:' + id, desc: h.desc, start: content.talismans[h.start].name,
      unlocked: META.heroUnlocked(content, meta, id), reason: META.heroLockReason(content, meta, id), selected: id === (meta.lastHero || 'yeonhwa'),
    }));
  }
  function curseCards(content, meta, chapterId) {
    const last = ((meta.lastCurses || {})[chapterId]) || [];
    return Object.entries(content.curses).map(([id, c]) => ({ id, name: c.name, desc: c.desc, reaction: !!c.reaction, checked: last.includes(id) }));
  }
  function villageCards(content, meta) {
    return Object.entries(content.village).map(([id, f]) => {
      const lv = (meta.village || {})[id] || 0, cost = lv < f.levels.length ? f.levels[lv].cost : null;
      return { id, name: f.name, glyph: f.glyph, desc: f.desc, lv, max: f.levels.length, nextDesc: cost == null ? '최고 단계' : f.levels[lv].desc, cost, affordable: cost != null && meta.coins >= cost };
    });
  }

  return { mmss, statLine, pairs, option, fusion, nextGoal, chapterCards, heroCards, curseCards, villageCards };
})();
if (typeof module !== 'undefined') module.exports = BJ_TEXT;
