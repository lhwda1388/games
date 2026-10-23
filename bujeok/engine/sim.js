// 부적난무 — 한 판의 시뮬레이션. 상태는 순수 JSON 데이터라 그대로 스냅샷이 된다(공간 해시는 매 틱 다시 짓는다).
// 한 틱: 이동 → 소환·보스·훅 → 부적(behaviors 순서) → 적 이동·접촉 → 사망 처리 → 혼백 구슬 → 패배 판정.
const BJ_SIM = (function bjSim() {
  const RNG = typeof BJ_RNG !== 'undefined' ? BJ_RNG : require('./rng.js');
  const W = typeof BJ_WORLD !== 'undefined' ? BJ_WORLD : require('./world.js');
  const ENT = typeof BJ_ENT !== 'undefined' ? BJ_ENT : require('./entities.js');
  const BEH = typeof BJ_BEHAVIORS !== 'undefined' ? BJ_BEHAVIORS : require('./behaviors.js');
  const SK = typeof BJ_SKILLS !== 'undefined' ? BJ_SKILLS : require('./skills.js');
  const PAT = typeof BJ_PATTERNS !== 'undefined' ? BJ_PATTERNS : require('./patterns.js');
  const HOOKS = typeof BJ_HOOKS !== 'undefined' ? BJ_HOOKS : require('./hooks.js');
  const EVT = typeof BJ_EVENTS !== 'undefined' ? BJ_EVENTS : require('./events.js');
  const SPAWN = typeof BJ_SPAWNER !== 'undefined' ? BJ_SPAWNER : require('./spawner.js');
  const hash = W.createHash(64);

  function xpNeed(rules, level) {
    const c = rules.xpCurve;
    return level <= c.length ? c[level - 1] : c[c.length - 1] + rules.xpCurveStep * (level - c.length);
  }

  function create(content, { seed, heroId, chapterId, runId, perks, curses }) {
    const r = content.rules, hero = content.heroes[heroId] || content.heroes[Object.keys(content.heroes)[0]], ch = content.chapters[chapterId];
    const P = { maxHpMul: 1, coinMul: 1, choiceBonus: 0, rerolls: 0, discards: 0, revive: 0, startPick: 0, ...(perks || {}) };
    P.revive = Math.min(r.revive.max, (P.revive || 0) + (hero.revive || 0)); // 영웅 부활을 무당집 부활에 더하고 상한으로 자른다
    const maxHp = r.player.hp * (hero.hpMul || 1) * P.maxHpMul;
    const state = {
      runId, seed, heroId: content.heroes[heroId] ? heroId : Object.keys(content.heroes)[0], chapterId, contentVersion: content.version, rng: RNG.create(seed), nextUid: 1, t: 0,
      player: { x: 0, y: 0, dirX: 0, dirY: -1, moved: 0, stillT: 0, hp: maxHp, maxHp, invuln: 0, xp: 0, level: 1 },
      slots: [], consumed: {}, fused: {}, postponed: {}, target: null, sinceTarget: 0, levelOrdinal: 0, pendingLevels: 0, choice: null,
      discards: r.discards + P.discards, rerolls: (hero.rerolls || 0) + P.rerolls,
      perks: P, curses: (curses || []).filter(id => content.curses[id]), curseFx: {}, revived: false, revives: 0,
      vision: [], events: [], eventState: {}, sites: [], nextSite: 1, purse: 0, purseAcc: 0, runMods: {}, mutation: null,
      enemies: [], shots: [], zones: [], gems: [], eshots: [],
      waveAcc: [], bossDone: [], props: (ch.props || []).map(() => ({ state: 'idle' })), hookState: {}, minute: 0, lastHit: null,
      stats: { kills: 0, eliteKills: 0, bossKills: 0, ghostKills: 0, damageBy: {}, fusions: [], killedIds: {}, obtained: {} }, over: null,
      fx: ENT.freshFx(),
    };
    for (const id of state.curses) {
      const cu = content.curses[id];
      for (const k of ['enemyHp', 'enemyDmg']) if (cu[k]) state.runMods[k] = (state.runMods[k] || 1) * cu[k];
      for (const k of ['warnMul', 'healMul', 'eliteMul']) if (cu[k]) state.curseFx[k] = (state.curseFx[k] || 1) * cu[k];
    }
    SK.apply(state, content, { kind: 'new', id: hero.start });
    state.events = EVT.plan(state, content);
    // 챕터 mutations 목록(없으면 전체). 입문은 RNG를 쓰지 않는다
    const muts = !content.mutations || ch.mutations === false ? [] : Array.isArray(ch.mutations) ? ch.mutations : Object.keys(content.mutations);
    if (!ch.tutorial && muts.length) {
      state.mutation = RNG.pick(state.rng, muts);
      const mu = content.mutations[state.mutation];
      state.fx.notices.push(`변이 — ${mu.name}: ${mu.desc}`);
    }
    if (P.startPick > 0) {
      const pool = Object.keys(content.talismans).filter(id => !content.talismans[id].fusion && id !== hero.start).map(id => ({ kind: 'new', id }));
      state.choice = { kind: 'start', options: P.startPick >= pool.length ? pool : RNG.sample(state.rng, pool, P.startPick) };
    }
    return state;
  }

  function step(state, content, input, dt) {
    if (state.over || state.choice) return;
    const r = content.rules, p = state.player, hero = content.heroes[state.heroId], fx = state.fx;
    // 화면이 소비하지 않는 환경(테스트·봇)에서도 일시 데이터가 끝없이 쌓이지 않게
    if (fx.events.length > 500) fx.events.splice(0, 250);
    if (fx.rings.length > 300) fx.rings.splice(0, 150);
    if (fx.notices.length > 50) fx.notices.splice(0, 25);
    for (const k of ['bolts', 'arcs']) if (fx[k].length > 300) fx[k].splice(0, 150);
    state.t += dt;

    // 1. 이동(입력 길이는 최대 1). +0은 -0을 없앤다 — atan2(-0, x)가 저장·복원 뒤 결정성을 깨지 않게
    let mx = input.mx || 0, my = input.my || 0;
    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
    const ox = p.x, oy = p.y;
    const speed = r.player.speed * BEH.speedMul(content, state) * (hero.speedMul || 1);
    p.x += mx * speed * dt; p.y += my * speed * dt;
    p.moved = Math.hypot(p.x - ox, p.y - oy);
    if (m > 0.1) { const k = Math.hypot(mx, my); p.dirX = mx / k + 0; p.dirY = my / k + 0; }
    if (p.invuln > 0) p.invuln -= dt;
    p.stillT = p.moved > 0.01 ? 0 : (p.stillT || 0) + dt;
    const M = ENT.mods(content, state);
    // 판 엽전 수입: 소수는 purseAcc에 모아 정수 엽전으로 옮긴다(장터에서 쓸 수 있는 돈)
    if (r.purse && r.purse.perSec && !content.chapters[state.chapterId].tutorial) {
      state.purseAcc = (state.purseAcc || 0) + r.purse.perSec * dt;
      if (state.purseAcc >= 1 - 1e-9) { const n = Math.floor(state.purseAcc + 1e-9); state.purse += n; state.purseAcc = Math.max(0, state.purseAcc - n); }
    }
    if (M.regen && p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + M.regen * dt);

    state.vision = state.vision.filter(v => v.until > state.t);
    // 2. 소환·보스·챕터 훅
    SPAWN.tick(state, content, dt);
    HOOKS.call(state, content, 'onTick', dt);
    EVT.tick(state, content, dt);
    const minute = Math.floor(state.t / 60);
    if (minute > state.minute) { state.minute = minute; HOOKS.call(state, content, 'onMinute', minute); }

    // 3. 부적
    W.build(hash, state.enemies);
    const ctx = { state, content, hash, cdMul: hero.cdMul || 1, eliteMul: hero.eliteDmgMul || 1, bossMul: hero.bossDmgMul || 1, ghostMul: hero.ghostDmgMul || 1, areaMul: hero.areaMul || 1 };
    for (const s of state.slots) BEH.tickSlot(ctx, s, dt);
    BEH.updateShots(ctx, dt);
    BEH.updateZones(ctx, dt);

    // 4. 적 이동, 느려짐 시간, 최종 보스 폭주, 접촉 피해
    const rage = content.rules.enrage;
    for (const e of state.enemies) {
      if (e.dead) continue;
      if (e.slowT > 0) e.slowT -= dt;
      if (e.markT > 0) e.markT -= dt;
      const life = content.enemies[e.id].life;
      if (life) { e.age = (e.age || 0) + dt; if (e.age >= life) { e.dead = 1; e.left = 1; continue; } }
      if (e.final) {
        const k = state.t - e.bornT - rage.after, lv = k >= 0 ? 1 + Math.floor(k / rage.every) : 0;
        if (lv > (e.rage || 0)) {
          if (!e.rage) state.fx.notices.push('폭주 — ' + content.enemies[e.id].name);
          e.rage = lv;
        }
      }
      const ox = e.x, oy = e.y;
      PAT.move(state, content, e, dt);
      const rr = ENT.radius(content, e) + r.player.r, cd = ENT.damage(content, e); // 피해 0인 적(보물 요괴)은 닿아도 무적·lastHit을 만들지 않는다
      if (cd > 0 && segDist2(ox, oy, e.x, e.y, p.x, p.y) < rr * rr && ENT.hitPlayer(state, content, cd, e.id)) {
        HOOKS.call(state, content, 'onPlayerHit', HOOKS.view(e));
      }
    }

    // 4-1. 적 투사체: 이동, 수명, 플레이어 적중
    for (const q of state.eshots) {
      const ox = q.x, oy = q.y;
      q.x += q.vx * dt; q.y += q.vy * dt; q.ttl -= dt;
      const rr = q.r + r.player.r;
      if (q.ttl > 0 && segDist2(ox, oy, q.x, q.y, p.x, p.y) < rr * rr && ENT.hitPlayer(state, content, q.dmg, q.src)) q.ttl = 0;
    }
    state.eshots = state.eshots.filter(q => q.ttl > 0);

    // 5. 사망 처리
    for (const e of state.enemies) if (e.dead && !e.done) die(state, content, e);
    state.enemies = state.enemies.filter(e => !e.dead);

    // 6. 혼백 구슬
    gems(state, content, dt);

    if (p.hp <= 0 && !state.over) {
      const pk = state.perks || {};
      if ((state.revives || 0) < (pk.revive || 0)) {
        const rv = r.revive;
        state.revives = (state.revives || 0) + 1;
        state.revived = true;
        p.hp = p.maxHp * rv.hpFrac; p.invuln = rv.invuln;
        for (const e of state.enemies) if (!e.dead && !e.boss && Math.hypot(e.x - p.x, e.y - p.y) <= rv.clearR) { e.dead = 1; e.left = 1; }
        state.enemies = state.enemies.filter(e => !e.dead);
        state.fx.notices.push(`부활 — 남은 부활 ${pk.revive - state.revives}번`);
      } else state.over = { win: false, cause: state.lastHit };
    }
  }

  // 이번 틱 이동 구간(ax,ay→bx,by)과 점(px,py)의 최소 거리² — 빠른 돌진이 한 틱에 플레이어를 건너뛰어도 접촉으로 친다
  function segDist2(ax, ay, bx, by, px, py) {
    const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy;
    const t = L ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L)) : 0;
    return (ax + vx * t - px) ** 2 + (ay + vy * t - py) ** 2;
  }

  function die(state, content, e) {
    e.done = 1;
    if (e.left) return;
    if (state.fx.kills && state.fx.kills.length < 300) state.fx.kills.push({ x: e.x, y: e.y, id: e.id, elite: !!e.elite, boss: !!e.boss });
    const def = content.enemies[e.id];
    state.stats.kills++;
    state.stats.killedIds[e.id] = 1;
    if (e.elite) state.stats.eliteKills++;
    if (def.boss) state.stats.bossKills = (state.stats.bossKills || 0) + 1;
    if (def.ghost) state.stats.ghostKills = (state.stats.ghostKills || 0) + 1;
    if (def.xp) {
      const g = { x: e.x, y: e.y, xp: def.xp * (e.elite ? content.rules.elite.xp : 1) };
      if (e.pullGem) g.pulled = 1;
      state.gems.push(g);
    }
    if (e.elite) state.gems.push({ x: e.x, y: e.y, xp: 0, coin: content.rules.elite.coin });
    if (def.drop && def.drop.coin) state.gems.push({ x: e.x, y: e.y, xp: 0, coin: def.drop.coin });
    const mu = ENT.mutation(content, state);
    if (mu && mu.split && e.id === mu.target) splitInto(state, content, e, mu.split); // 변이 분열(기존과 같은 RNG 순서)
    if (def.split) splitInto(state, content, e, def.split);
    HOOKS.call(state, content, 'onEnemyDeath', HOOKS.view(e));
    if (e.boss) {
      state.fx.events.push({ type: 'boss_kill', id: e.id, t: state.t });
      HOOKS.call(state, content, 'onBossDefeated', HOOKS.view(e));
    }
    if (e.final) state.over = { win: true };
  }

  // 분열: count마리를 16px 둘레 무작위 방향에 낳는다. 안전 반경 밖으로 밀어낸다(스펙 8절)
  function splitInto(state, content, e, sp) {
    for (let i = 0; i < sp.count; i++) {
      const a = RNG.range(state.rng, 0, Math.PI * 2);
      const q = ENT.safePos(state, content, e.x + Math.cos(a) * 16, e.y + Math.sin(a) * 16);
      ENT.spawnEnemy(state, content, sp.enemy, q.x, q.y);
    }
  }

  function gems(state, content, dt) {
    const r = content.rules, p = state.player, pick = r.player.r + r.gem.pickR;
    // 상한을 넘으면 가장 오래된 구슬의 혼백을 다음 구슬에 합친다(회복 구슬은 뒤로 미룬다)
    for (let n = state.gems.length; state.gems.length > r.limits.gems && n > 0; n--) { // 한 바퀴만 돈다(혼백 구슬이 없으면 멈춤)
      const g = state.gems.shift();
      if (g.heal || g.coin) { state.gems.push(g); continue; }
      const t = state.gems.find(x => !x.heal && !x.coin); // 혼백은 회복 구슬이 아니라 다음 혼백 구슬에 합친다
      if (t) t.xp += g.xp; else state.gems.push(g);
    }
    for (const g of state.gems) {
      const dx = p.x - g.x, dy = p.y - g.y, d = Math.hypot(dx, dy);
      if (d < pick) {
        g.got = 1;
        if (g.heal) p.hp = Math.min(p.maxHp, p.hp + g.heal * ENT.curse(state, 'healMul'));
        else if (g.coin) state.purse += g.coin;
        else gainXp(state, content, g.xp);
        continue;
      }
      if (d < r.player.magnet * (content.heroes[state.heroId].magnetMul || 1) || g.pulled) {
        g.pulled = 1;
        const s = Math.min(r.gem.pullSpeed * dt, d);
        g.x += dx / d * s; g.y += dy / d * s;
      }
    }
    state.gems = state.gems.filter(g => !g.got);
  }

  function gainXp(state, content, xp) {
    const p = state.player;
    p.xp += xp;
    while (p.xp >= xpNeed(content.rules, p.level)) {
      p.xp -= xpNeed(content.rules, p.level);
      p.level++;
      SK.queueLevelUp(state, content);
    }
  }

  function result(state, content) {
    const c = content.rules.coins, win = !!(state.over && state.over.win);
    const base = Math.floor(state.t / 10) * c.perTenSec + Math.floor(state.stats.kills / 10) * c.perTenKills + (win ? c.clear : 0) + (state.purse || 0);
    const nCurse = (state.curses || []).length, pk = state.perks || {};
    const coins = Math.round(base * (1 + content.rules.curses.coinBonus * nCurse) * (pk.coinMul || 1));
    const cause = state.over && state.over.cause ? content.enemies[state.over.cause].name : null;
    return { runId: state.runId, heroId: state.heroId, curses: (state.curses || []).slice(), killed: Object.keys(state.stats.killedIds || {}), obtained: Object.keys(state.stats.obtained || {}), eliteKills: state.stats.eliteKills, bossKills: state.stats.bossKills || 0, ghostKills: state.stats.ghostKills || 0, chapterId: state.chapterId, tutorial: !!content.chapters[state.chapterId].tutorial, win, t: state.t, kills: state.stats.kills, coins, fusions: state.stats.fusions.slice(), cause, mutation: state.mutation ? content.mutations[state.mutation].name : null, damageBy: { ...state.stats.damageBy } };
  }

  return { xpNeed, create, step, result };
})();
if (typeof module !== 'undefined') module.exports = BJ_SIM;
