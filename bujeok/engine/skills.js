// 부적난무 — 레벨업 선택지와 합체(스펙 4·5절).
// 흐름: 혼백으로 레벨업 → queueLevelUp → 선택지(offer) → choose → 남은 레벨업이 없으면 준비된 합체 창(보류한 것 제외).
const BJ_SKILLS = (function bjSkills() {
  const RNG = typeof BJ_RNG !== 'undefined' ? BJ_RNG : require('./rng.js');
  const slotOf = (state, id) => state.slots.find(s => s.id === id);
  const maxLv = (content, id) => content.talismans[id].levels.length;
  const key = o => o.kind + ':' + (o.id || '');

  // 목표 레시피의 재료를 새로 얻거나, 합체 조건 레벨까지 올리는 선택지인가
  function related(state, content, o) {
    if (!state.target || o.kind === 'heal') return false;
    const r = content.recipes[state.target];
    if (o.id !== r.a && o.id !== r.b) return false;
    return o.kind === 'new' || slotOf(state, o.id).lv < content.rules.fusionReq;
  }

  function candidates(state, content) {
    const out = [];
    for (const s of state.slots) if (s.lv < maxLv(content, s.id)) out.push({ kind: 'up', id: s.id });
    if (state.slots.length < content.rules.slots) {
      for (const id of Object.keys(content.talismans)) {
        if (content.talismans[id].fusion || slotOf(state, id) || state.consumed[id]) continue;
        out.push({ kind: 'new', id });
      }
    }
    return out;
  }

  // 안내 목록(입문) → 무작위로 채우기 → 목표 관련이 연속 pityWindow번 빠지면 마지막 칸을 관련 선택지로(도달 보정)
  function makeOptions(state, content, guided) {
    const all = candidates(state, content);
    if (!all.length) return [{ kind: 'heal' }];
    const k = content.rules.choiceCount + ((state.perks && state.perks.choiceBonus) || 0), valid = new Set(all.map(key));
    let opts = (guided || []).map(g => { const [kind, id] = g.split(':'); return { kind, id }; }).filter(o => valid.has(key(o)));
    const rest = all.filter(o => !opts.some(x => key(x) === key(o)));
    opts = opts.concat(RNG.sample(state.rng, rest, k - opts.length)).slice(0, k);
    if (state.target && !opts.some(o => related(state, content, o)) && state.sinceTarget >= content.rules.pityWindow - 1) {
      const rel = all.filter(o => related(state, content, o));
      if (rel.length) opts[opts.length - 1] = RNG.pick(state.rng, rel);
    }
    return opts;
  }

  function offer(state, content) {
    const ch = content.chapters[state.chapterId];
    const guided = ch && ch.guided ? ch.guided[state.levelOrdinal] : null;
    const options = makeOptions(state, content, guided);
    state.levelOrdinal++;
    state.sinceTarget = options.some(o => related(state, content, o)) ? 0 : state.sinceTarget + 1;
    state.choice = { kind: 'levelup', options };
  }

  function readyFusions(state, content) {
    const req = content.rules.fusionReq;
    return Object.keys(content.recipes).filter(r => {
      const x = content.recipes[r], a = slotOf(state, x.a), b = slotOf(state, x.b);
      return !state.fused[r] && a && b && a.lv >= req && b.lv >= req;
    });
  }

  // 열린 선택이 없을 때 다음 선택을 연다: 남은 레벨업 → 보류하지 않은 합체
  function nextChoice(state, content) {
    if (state.choice) return;
    if (state.pendingLevels > 0) { offer(state, content); return; }
    const r = readyFusions(state, content).find(x => !state.postponed[x]);
    if (!r) return;
    state.choice = { kind: 'fusion', recipe: r };
    state.fx.events.push({ type: 'fusion_ready', recipe: r, t: state.t });
  }

  function queueLevelUp(state, content) { state.pendingLevels++; nextChoice(state, content); }

  // 목표 레시피: 아직 합체하지 않았고 재료를 하나라도 가진 첫 레시피(스펙 4절 "첫 재료를 얻은 레시피")
  function pickTarget(state, content) {
    if (state.target && !state.fused[state.target]) return;
    state.target = Object.keys(content.recipes).find(r => {
      const x = content.recipes[r];
      return !state.fused[r] && (slotOf(state, x.a) || slotOf(state, x.b));
    }) || null;
    state.sinceTarget = 0;
  }

  function apply(state, content, o) {
    if (o.kind === 'heal') { const p = state.player; p.hp = Math.min(p.maxHp, p.hp + content.rules.healOption * ((state.curseFx && state.curseFx.healMul) || 1)); return; }
    if (o.kind === 'up') slotOf(state, o.id).lv++;
    else state.slots.push({ id: o.id, lv: 1, cd: 0 });
    if (state.stats && state.stats.obtained) state.stats.obtained[o.id] = 1;
    pickTarget(state, content);
  }

  function choose(state, content, i) {
    const c = state.choice;
    if (!c || c.kind !== 'levelup' || !c.options[i]) return;
    apply(state, content, c.options[i]);
    state.fx.events.push({ type: 'pick', opt: key(c.options[i]), t: state.t });
    state.pendingLevels = Math.max(0, state.pendingLevels - 1);
    state.choice = null;
    nextChoice(state, content);
  }

  function chooseStart(state, content, i) {
    const c = state.choice;
    if (!c || c.kind !== 'start' || !c.options[i]) return;
    state.choice = null;
    apply(state, content, c.options[i]);
    state.fx.events.push({ type: 'start_pick', opt: key(c.options[i]), t: state.t });
    nextChoice(state, content);
  }

  function fuse(state, content, branch) {
    const c = state.choice;
    if (!c || c.kind !== 'fusion') return;
    const r = content.recipes[c.recipe], id = r.branches[branch];
    const hero = content.heroes[state.heroId];
    const ia = state.slots.findIndex(s => s.id === r.a);
    state.slots[ia] = { id, lv: Math.min(hero.fusionStartLv || 1, maxLv(content, id)), cd: 0 };
    state.slots = state.slots.filter(s => s.id !== r.b);
    state.consumed[r.a] = state.consumed[r.b] = true;
    state.fused[c.recipe] = id;
    delete state.postponed[c.recipe];
    state.stats.fusions.push(id);
    state.fx.events.push({ type: 'fusion', id, t: state.t });
    state.choice = null;
    pickTarget(state, content);
    nextChoice(state, content);
  }

  function postpone(state, content) {
    const c = state.choice;
    if (!c || c.kind !== 'fusion') return;
    state.postponed[c.recipe] = true;
    state.choice = null;
    nextChoice(state, content);
  }

  function openFusion(state, content, recipe) {
    if (state.choice || !readyFusions(state, content).includes(recipe)) return;
    state.choice = { kind: 'fusion', recipe };
  }

  function discard(state, content, slotIdx) {
    const c = state.choice;
    if (!c || c.kind !== 'levelup' || state.discards <= 0 || !state.slots[slotIdx]) return;
    state.slots.splice(slotIdx, 1);
    state.discards--;
    const r = content.recipes[state.target];
    if (r && !slotOf(state, r.a) && !slotOf(state, r.b)) state.target = null;
    pickTarget(state, content);
    c.options = makeOptions(state, content, null);
  }

  function reroll(state, content) {
    const c = state.choice;
    if (!c || c.kind !== 'levelup' || state.rerolls <= 0) return;
    state.rerolls--;
    c.options = makeOptions(state, content, null);
  }

  // 도깨비 장터: 지금 고를 수 있는 선택지 중 offers개를 가격과 함께. 사면 그 자리에서 적용, 떠나면 밀린 선택(레벨업·합체)을 연다
  function price(content, state, o) {
    const m = content.rules.market;
    return o.kind === 'new' ? m.newPrice : m.upBase + m.upPerLv * slotOf(state, o.id).lv;
  }
  // site: 이 장터를 연 장소 id. 첫 구매가 일어나면 그 장소를 거둔다(못 사고 떠나면 장소는 남아 다시 들를 수 있다)
  function openMarket(state, content, site) {
    if (state.choice) return false;
    const offers = RNG.sample(state.rng, candidates(state, content), content.rules.market.offers).map(o => ({ ...o, price: price(content, state, o) }));
    if (!offers.length) return false;
    state.choice = { kind: 'market', offers };
    if (site != null) state.choice.site = site;
    return true;
  }
  function buy(state, content, i) {
    const c = state.choice;
    if (!c || c.kind !== 'market' || !c.offers[i] || state.purse < c.offers[i].price) return;
    const o = c.offers[i];
    state.purse -= o.price;
    if (c.site != null) state.sites = state.sites.filter(x => x.id !== c.site);
    apply(state, content, o);
    state.fx.events.push({ type: 'buy', opt: key(o), t: state.t });
    const valid = new Set(candidates(state, content).map(key));
    c.offers = c.offers.filter((x, j) => j !== i && valid.has(key(x))).map(x => ({ ...x, price: price(content, state, x) }));
  }
  function leaveMarket(state, content) {
    const c = state.choice;
    if (!c || c.kind !== 'market') return;
    state.choice = null;
    nextChoice(state, content);
  }

  return { openMarket, buy, leaveMarket, key, related, candidates, makeOptions, offer, readyFusions, nextChoice, queueLevelUp, pickTarget, apply, choose, fuse, postpone, openFusion, discard, reroll, chooseStart };
})();
if (typeof module !== 'undefined') module.exports = BJ_SKILLS;
