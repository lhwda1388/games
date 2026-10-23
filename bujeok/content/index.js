// 부적난무 — 콘텐츠 등록부. 챕터 추가: 파일 하나 + CHAPTERS에 한 줄 + index.html에 <script> 한 줄.
const BJ_CONTENT = (function bjContent() {
  const RULES = typeof BJ_RULES !== 'undefined' ? BJ_RULES : require('./rules.js');
  const TALISMANS = typeof BJ_TALISMANS !== 'undefined' ? BJ_TALISMANS : require('./talismans.js');
  const RECIPES = typeof BJ_RECIPES !== 'undefined' ? BJ_RECIPES : require('./recipes.js');
  const ENEMIES = typeof BJ_ENEMIES !== 'undefined' ? BJ_ENEMIES : require('./enemies.js');
  const HEROES = typeof BJ_HEROES !== 'undefined' ? BJ_HEROES : require('./heroes.js');
  const MUTATIONS = typeof BJ_MUTATIONS !== 'undefined' ? BJ_MUTATIONS : require('./mutations.js');
  const EVENTS = typeof BJ_EVENT_DEFS !== 'undefined' ? BJ_EVENT_DEFS : require('./events.js');
  const VILLAGE = typeof BJ_VILLAGE !== 'undefined' ? BJ_VILLAGE : require('./village.js');
  const CURSES = typeof BJ_CURSES !== 'undefined' ? BJ_CURSES : require('./curses.js');
  const CODEX = typeof BJ_CODEX !== 'undefined' ? BJ_CODEX : require('./codex.js');
  const SFX = typeof BJ_SFX !== 'undefined' ? BJ_SFX : require('./sfx.js');
  const MUSIC = typeof BJ_MUSIC !== 'undefined' ? BJ_MUSIC : require('./music.js');
  const CHAPTERS = [
    typeof BJ_CH_TUTORIAL !== 'undefined' ? BJ_CH_TUTORIAL : require('./chapters/tutorial.js'),
    typeof BJ_CH_DOKKAEBI !== 'undefined' ? BJ_CH_DOKKAEBI : require('./chapters/ch1-dokkaebi.js'),
    typeof BJ_CH_FOX !== 'undefined' ? BJ_CH_FOX : require('./chapters/ch2-fox.js'),
  ];
  // 준비 중 챕터 — 메뉴에 "준비 중"으로만 보인다. 진행해도 열리지 않는다(스펙 3절)
  const UPCOMING = [
    { name: '물귀신 나루', note: '늪과 나룻터' },
    { name: '저승 길목', note: '무너지는 삼도천 다리' },
  ];
  // 진행 중 판 스냅샷의 호환 기준. 수치나 ID를 바꾸면 올린다(다른 버전의 판은 이어하지 않는다, 스펙 9.2).
  const VERSION = 17;
  // ID를 바꿀 때 옛 ID → 새 ID. 저장·도감이 옛 ID를 가리켜도 따라간다.
  const renamed = {};

  function validate(c) {
    const err = [], T = c.talismans, E = c.enemies, R = c.rules;
    const has = (o, id, where) => { if (!o[id]) err.push(`${where}: 없는 ID ${id}`); return !!o[id]; };
    for (const [id, t] of Object.entries(T)) {
      const want = t.fusion ? R.fusionMaxLv : R.baseMaxLv;
      if (!Array.isArray(t.levels) || t.levels.length !== want) err.push(`talisman ${id}: 레벨 ${want}개 필요`);
      if (!t.parts || !t.parts.length) err.push(`talisman ${id}: 부품 없음`);
      for (const [i, lv] of (t.levels || []).entries()) if (lv.parts && (!Array.isArray(lv.parts) || lv.parts.length > (t.parts || []).length)) err.push(`talisman ${id}: 레벨 ${i + 1}의 parts가 부품 수보다 많음`);
      for (const k of ['name', 'glyph', 'how', 'weak', 'element']) if (!t[k]) err.push(`talisman ${id}: ${k} 없음`);
    }
    for (const [id, d] of Object.entries(E)) {
      if (d.split) {
        if (has(E, d.split.enemy, `enemy ${id} split`) && E[d.split.enemy].split) err.push(`enemy ${id}: 분열체 ${d.split.enemy}가 또 분열함(연쇄 금지)`);
        if (!(d.split.count > 0)) err.push(`enemy ${id}: split.count는 0보다 커야 함`);
      }
      if (d.drop && !(d.drop.coin > 0)) err.push(`enemy ${id}: drop.coin은 0보다 커야 함`);
      if (d.aura) {
        for (const k of Object.keys(d.aura)) if (!['heal', 'r', 'ghostsOnly', 'color'].includes(k)) err.push(`enemy ${id}: aura 모르는 키 ${k}`);
        if (!(d.aura.heal > 0)) err.push(`enemy ${id}: aura.heal은 0보다 커야 함`);
        if (!(d.aura.r > 0)) err.push(`enemy ${id}: aura.r은 0보다 커야 함`);
      }
    }
    for (const [id, m] of Object.entries(c.mutations || {})) {
      if (m.target) has(E, m.target, `mutation ${id}`);
      if (m.split) has(E, m.split.enemy, `mutation ${id} split`);
    }
    const usedBy = {};
    for (const [id, r] of Object.entries(c.recipes)) {
      for (const m of [r.a, r.b]) if (has(T, m, `recipe ${id}`) && T[m].fusion) err.push(`recipe ${id}: 재료 ${m}는 기본 부적이어야 함`);
      if (!Array.isArray(r.branches) || r.branches.length !== 2) err.push(`recipe ${id}: 갈래 2개 필요`);
      for (const b of r.branches || []) {
        if (!has(T, b, `recipe ${id}`)) continue;
        if (!T[b].fusion) err.push(`recipe ${id}: 갈래 ${b}는 fusion이어야 함`);
        if (usedBy[b]) err.push(`fusion ${b}: 레시피 두 곳(${usedBy[b]}, ${id})에서 씀`);
        usedBy[b] = id;
      }
    }
    for (const [id, t] of Object.entries(T)) if (t.fusion && !usedBy[id]) err.push(`fusion ${id}: 레시피 없음`);
    for (const [id, h] of Object.entries(c.heroes)) if (has(T, h.start, `hero ${id}`) && T[h.start].fusion) err.push(`hero ${id}: 시작 부적은 기본 부적이어야 함`);
    if (c.chapterOrder && c.chapterOrder.length !== Object.keys(c.chapters).length) err.push('chapter: ID 중복');
    for (const ch of Object.values(c.chapters)) {
      for (const w of ch.waves) has(E, w.enemy, `chapter ${ch.id}`);
      for (const b of ch.bosses) if (has(E, b.enemy, `chapter ${ch.id}`) && !E[b.enemy].boss) err.push(`chapter ${ch.id}: ${b.enemy}는 보스가 아님`);
      for (const id of ch.events || []) if (!c.events[id]) err.push(`chapter ${ch.id}: 없는 사건 ${id}`);
      // 변이 목록: 있는 변이여야 하고, 대상(target)·속성(ghosts)이 이 챕터의 적에 있어야 한다(효과 없는 변이 금지)
      const present = new Set([...ch.waves.map(w => w.enemy), ...ch.bosses.map(b => b.enemy)]);
      for (const id of Array.isArray(ch.mutations) ? ch.mutations : []) {
        const m = (c.mutations || {})[id];
        if (!m) { err.push(`chapter ${ch.id}: 없는 변이 ${id}`); continue; }
        if (m.target && !present.has(m.target)) err.push(`chapter ${ch.id}: 변이 ${id}의 대상 ${m.target}가 챕터에 없음`);
        if (m.ghosts && ![...present].some(e => E[e] && E[e].ghost)) err.push(`chapter ${ch.id}: 변이 ${id}의 귀신이 챕터에 없음`);
      }
      if (ch.quietWindows && !(ch.quietWindows.every > 0)) err.push(`chapter ${ch.id}: quietWindows.every는 0보다 커야 함`);
      if (ch.unlock && !c.chapters[ch.unlock]) err.push(`chapter ${ch.id}: unlock 없는 챕터 ${ch.unlock}`);
      if (ch.bosses.filter(b => b.final).length !== 1) err.push(`chapter ${ch.id}: 최종 보스 1개 필요`);
      for (const r of Object.keys(ch.keys || {})) has(c.recipes, r, `chapter ${ch.id} keys`);
      for (const g of ch.guided || []) for (const o of g) has(T, o.split(':')[1], `chapter ${ch.id} guided`);
    }
    const PERK_KEYS = ['maxHpMul', 'coinMul', 'choiceBonus', 'rerolls', 'discards', 'revive', 'startPick'];
    for (const [id, f] of Object.entries(c.village || {})) for (const lv of f.levels) for (const k of Object.keys(lv.perk)) if (!PERK_KEYS.includes(k)) err.push(`village ${id}: 모르는 효과 ${k}`);
    const HERO_KEYS = ['name', 'glyph', 'desc', 'start', 'cdMul', 'rerolls', 'fusionStartLv', 'hpMul', 'magnetMul', 'eliteDmgMul', 'bossDmgMul', 'ghostDmgMul', 'speedMul', 'revive', 'areaMul', 'blockDps', 'unlock', 'lockText'];
    const STAT_KEYS = ['runs', 'eliteKills', 'bossKills', 'ghostKills', 'fusions'];
    for (const [id, h] of Object.entries(c.heroes)) {
      for (const k of Object.keys(h)) if (!HERO_KEYS.includes(k)) err.push(`hero ${id}: 모르는 키 ${k}`);
      if (h.revive && R.revive && h.revive > R.revive.max) err.push(`hero ${id}: revive ${h.revive} > 상한 ${R.revive.max}`);
      const u = h.unlock;
      if (u && u.cleared && !c.chapters[u.cleared]) err.push(`hero ${id}: unlock 없는 챕터 ${u.cleared}`);
      if (u && u.stat) {
        if (!STAT_KEYS.includes(u.stat)) err.push(`hero ${id}: 모르는 통계 ${u.stat}`);
        if (!(u.n > 0)) err.push(`hero ${id}: unlock.n은 0보다 커야 함`);
        if (!h.lockText) err.push(`hero ${id}: unlock.stat에는 lockText가 필요함`);
      }
    }
    const CURSE_KEYS = ['name', 'desc', 'reaction', 'enemyHp', 'enemyDmg', 'warnMul', 'healMul', 'eliteMul'];
    for (const [id, cu] of Object.entries(c.curses || {})) for (const k of Object.keys(cu)) if (!CURSE_KEYS.includes(k)) err.push(`curse ${id}: 모르는 키 ${k}`);
    for (const start of Object.keys(c.renamed)) {
      let k = start, n = 0;
      while (c.renamed[k]) { k = c.renamed[k]; if (++n > 50) { err.push(`renamed 순환: ${start}`); break; } }
    }
    return err;
  }

  return {
    version: VERSION, rules: RULES, talismans: TALISMANS, recipes: RECIPES, enemies: ENEMIES, heroes: HEROES, events: EVENTS, mutations: MUTATIONS,
    village: VILLAGE, curses: CURSES, codex: CODEX, sfx: SFX, music: MUSIC,
    chapters: Object.fromEntries(CHAPTERS.map(ch => [ch.id, ch])), chapterOrder: CHAPTERS.map(ch => ch.id),
    renamed, validate, upcoming: UPCOMING,
  };
})();
if (typeof module !== 'undefined') module.exports = BJ_CONTENT;
