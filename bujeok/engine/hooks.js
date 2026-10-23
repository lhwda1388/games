// 부적난무 — 챕터 훅. 챕터 코드가 받는 유일한 창구는 api다. 전역 상태를 직접 바꾸지 않고 이 함수들로만 영향을 준다(스펙 9.1).
// 훅 자신의 기억은 hookState(순수 데이터, 판 스냅샷에 함께 저장됨)에 둔다.
const BJ_HOOKS = (function bjHooks() {
  const RNG = typeof BJ_RNG !== 'undefined' ? BJ_RNG : require('./rng.js');
  const ENT = typeof BJ_ENT !== 'undefined' ? BJ_ENT : require('./entities.js');
  const BEH = typeof BJ_BEHAVIORS !== 'undefined' ? BJ_BEHAVIORS : require('./behaviors.js');
  const SK = typeof BJ_SKILLS !== 'undefined' ? BJ_SKILLS : require('./skills.js');

  function api(state, content, owner) {
    const p = state.player, ch = content.chapters[state.chapterId];
    return {
      t: state.t,
      player: { x: p.x, y: p.y },
      rand: () => RNG.next(state.rng),
      addVisionModifier(mul, ttl) { state.vision.push({ mul, until: state.t + ttl, owner }); },
      mark(uid, ttl) { const e = state.enemies.find(x => x.uid === uid && !x.dead); if (e) e.markT = Math.max(e.markT || 0, ttl); },
      clearPack(pack) { let n = 0; for (const e of state.enemies) if (e.pack === pack && !e.dead) { e.dead = 1; e.left = 1; n++; } return n; },
      // 정예 수 배율(저주). 배율이 1이면 RNG를 쓰지 않는다
      eliteCount(n) { const m = ENT.curse(state, 'eliteMul'); if (m === 1) return n; const x = n * m; return Math.floor(x) + (RNG.next(state.rng) < x - Math.floor(x) ? 1 : 0); },
      hasFusion: recipe => !!state.fused[recipe],
      spawn(id, x, y, opts = {}) {
        if (state.enemies.filter(e => e.owner === owner && !e.dead).length >= content.rules.hookSpawnCap) return null;
        const q = ENT.safePos(state, content, x, y);
        const e = ENT.spawnEnemy(state, content, id, q.x, q.y, { ...opts, owner });
        return e ? e.uid : null; // 살아 있는 객체 대신 uid만 돌려준다
      },
      addZone(def, ttl) { return BEH.addZone(state, content, { kind: 'damage', dps: 0, dmg: 0, blast: 0, ...def, ttl, owner }); },
      dropHeal(x, y, amount) { state.gems.push({ x, y, xp: 0, heal: amount }); },
      dropXp(x, y, xp) { state.gems.push({ x, y, xp }); },
      prop: i => ({ ...ch.props[i], ...state.props[i] }),
      setProp(i, s, v = 0) { state.props[i].state = s; state.props[i].v = v; },
      moveProp(i, x, y) { state.props[i].x = x; state.props[i].y = y; },
      waveEnemy() {
        const w = ch.waves.find(x => state.t >= x.from && state.t < x.to) || ch.waves[0];
        return w.enemy;
      },
      addSite(kind, x, y, r, ttl) { const id = state.nextSite++; state.sites.push({ id, kind, x, y, r, until: state.t + ttl, owner, v: 0 }); return id; },
      site: id => { const s = state.sites.find(x => x.id === id && x.until > state.t); return s ? { ...s } : null; },
      insideSite(id) { const s = state.sites.find(x => x.id === id); return !!s && Math.hypot(p.x - s.x, p.y - s.y) <= s.r; },
      setSiteProgress(id, v) { const s = state.sites.find(x => x.id === id); if (s) s.v = v; },
      removeSite(id) { state.sites = state.sites.filter(x => x.id !== id); },
      openMarket: site => SK.openMarket(state, content, site),
      queueLevelUp() { SK.queueLevelUp(state, content); },
      addPurse(n) { state.purse += n; },
      addRunMod(k, mul) { state.runMods[k] = (state.runMods[k] || 1) * mul; },
      notify(msg) { state.fx.notices.push(msg); },
    };
  }

  // 훅에 넘기는 적 정보는 읽기 전용 복사본
  const view = e => ({ uid: e.uid, id: e.id, x: e.x, y: e.y, elite: !!e.elite, boss: !!e.boss, pack: e.pack, tag: e.tag });

  function call(state, content, name, ...args) {
    const ch = content.chapters[state.chapterId], fn = ch.hooks && ch.hooks[name];
    if (fn) fn(api(state, content, ch.id), state.hookState, ...args);
  }

  return { api, call, view };
})();
if (typeof module !== 'undefined') module.exports = BJ_HOOKS;
