// 부적난무 — 부적 동작 부품. 부적 데이터의 parts[].kind가 여기 함수 이름이다.
// 한 틱의 실행 순서: ① 쿨다운 부품(PERIODIC) 발동 → ② 지속 부품(CONTINUOUS) → ③ 투사체 이동·적중(updateShots) → ④ 장판 효과·만료(updateZones).
// 적 제거와 보상은 sim이 ④ 뒤에 한 번에 처리한다. 새 부품: PERIODIC 또는 CONTINUOUS에 함수 하나를 더하면 KINDS에 자동으로 들어간다.
// 모든 피해는 hit()을 거친다 — 부품 공통 필드 bossMul·ghostMul·slow·lifesteal이 여기서 한 번에 적용된다.
const BJ_BEHAVIORS = (function bjBehaviors() {
  const RNG = typeof BJ_RNG !== 'undefined' ? BJ_RNG : require('./rng.js');
  const W = typeof BJ_WORLD !== 'undefined' ? BJ_WORLD : require('./world.js');
  const ENT = typeof BJ_ENT !== 'undefined' ? BJ_ENT : require('./entities.js');
  const buf = [];
  const R = (content, e) => ENT.radius(content, e);
  const isBoss = (content, e) => !!ENT.def(content, e).boss;
  const colorOf = (content, owner) => (content.talismans[owner] || {}).color || 0xffffff;
  const AREA_KINDS = ['zone', 'trail', 'aura']; // 영웅 areaMul이 반지름을 키우는 부품 종류
  const EXTRA = ['bossMul', 'ghostMul', 'slow', 'lifesteal'];
  const extras = (st, keys = EXTRA) => { const o = {}; for (const k of keys) if (st[k] != null) o[k] = st[k]; return o; };
  const inRange = (e, x, y, r, content) => (e.x - x) ** 2 + (e.y - y) ** 2 <= (r + R(content, e)) ** 2;

  function hit(ctx, e, dmg, owner, st) {
    const { state, content } = ctx, d = ENT.def(content, e);
    if (d.immune) return 0;
    if (d.boss && st.bossMul) dmg *= st.bossMul;
    if (d.ghost && st.ghostMul) dmg *= st.ghostMul;
    if (e.elite && ctx.eliteMul) dmg *= ctx.eliteMul;
    if (d.boss && ctx.bossMul) dmg *= ctx.bossMul;   // 영웅 bossDmgMul
    if (d.ghost && ctx.ghostMul) dmg *= ctx.ghostMul; // 영웅 ghostDmgMul
    const dealt = ENT.hurt(state, e, dmg, owner);
    if (d.revealOnHit && dealt > 0) e.markT = Math.max(e.markT || 0, d.revealOnHit * ENT.keyMul(content, state, 'reveal'));
    if (st.slow && !e.dead) ENT.applySlow(e, st.slow);
    if (st.lifesteal && dealt > 0) { const p = state.player; p.hp = Math.min(p.maxHp, p.hp + dealt * st.lifesteal * ENT.curse(state, 'healMul')); }
    return dealt;
  }

  // 부품 값 = 부품 정의 ← 레벨 공통 값 ← 레벨의 parts[i](그 부품에만). areaMul(영웅)은 AREA_KINDS의 r·blast에 곱한다. 렌더도 이 함수로 그린다
  function partsOf(content, slot, areaMul = 1) {
    const t = content.talismans[slot.id], lv = t.levels[slot.lv - 1], { parts: own, ...shared } = lv;
    const parts = t.parts.map((p, i) => ({ ...p, ...shared, ...((own && own[i]) || {}) }));
    if (areaMul !== 1) for (const q of parts) if (AREA_KINDS.includes(q.kind)) { if (q.r) q.r *= areaMul; if (q.blast) q.blast *= areaMul; }
    return { lv, parts };
  }

  function addZone(state, content, z) {
    if (state.zones.length >= content.rules.limits.zones) return null;
    z.uid = ENT.uid(state);
    state.zones.push(z);
    return z;
  }

  function blast(ctx, x, y, r, dmg, owner, st) {
    const { state, content } = ctx;
    for (const e of W.near(ctx.hash, x, y, r, [])) if (inRange(e, x, y, r, content)) hit(ctx, e, dmg, owner, st);
    state.fx.rings.push({ x, y, r, color: colorOf(content, owner) });
  }

  // 번개 튀기기: from(이미 맞음)에서 jumps번, 매번 아직 안 맞은 가장 가까운 적으로
  function chainFrom(ctx, from, st, owner, hitList) {
    const { state, content } = ctx;
    let cur = from;
    for (let j = 0; j < st.jumps; j++) {
      let best = null, bd = st.jumpR * st.jumpR;
      for (const e of W.near(ctx.hash, cur.x, cur.y, st.jumpR, [])) {
        if (hitList.includes(e.uid)) continue;
        const d = (e.x - cur.x) ** 2 + (e.y - cur.y) ** 2;
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) break;
      hitList.push(best.uid);
      state.fx.bolts.push({ x1: cur.x, y1: cur.y, x2: best.x, y2: best.y, color: colorOf(content, owner) });
      state.fx.rings.push({ x: best.x, y: best.y, r: content.rules.chainFlashR, color: 0xffffff });
      hit(ctx, best, st.dmg * (st.dmgMul || 1), owner, st);
      cur = best;
    }
  }

  function fireProjectile(ctx, slot, st) {
    const { state, content } = ctx, p = state.player;
    if (state.shots.length >= content.rules.limits.shots) return false;
    let ang;
    if (st.target === 'nearest') {
      const e = W.nearest(ctx.hash, p.x, p.y, content.rules.targetRange);
      if (!e) return false;
      ang = Math.atan2(e.y - p.y, e.x - p.x);
    } else ang = Math.atan2(p.dirY, p.dirX);
    const n = st.count || 1, spread = st.spread || 0, more = extras(st, [...EXTRA, 'homing', 'chainOnHit']);
    for (let i = 0; i < n; i++) {
      const a = ang + (i - (n - 1) / 2) * spread;
      state.shots.push({ uid: ENT.uid(state), x: p.x, y: p.y, vx: Math.cos(a) * st.speed, vy: Math.sin(a) * st.speed, r: st.r, dmg: st.dmg, pierce: st.pierce || 0, ttl: st.ttl, owner: slot.id, hit: [], ...more });
    }
    return true;
  }

  function fireShockwave(ctx, slot, st) {
    const { state, content } = ctx, p = state.player;
    for (const e of W.near(ctx.hash, p.x, p.y, st.r, [])) {
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
      if (d > st.r + R(content, e)) continue;
      hit(ctx, e, st.dmg, slot.id, st);
      if (st.knock && !isBoss(content, e)) { e.x += dx / d * st.knock; e.y += dy / d * st.knock; }
    }
    state.fx.rings.push({ x: p.x, y: p.y, r: st.r, color: colorOf(content, slot.id) });
    return true;
  }

  function fireZone(ctx, slot, st) {
    const { state, content } = ctx, p = state.player;
    const n = st.at === 'around' ? st.count || 1 : 1;
    for (let i = 0; i < n; i++) {
      let x = p.x, y = p.y;
      if (st.at === 'around') {
        const a = RNG.range(state.rng, 0, Math.PI * 2), d = RNG.range(state.rng, 40, st.spread);
        x += Math.cos(a) * d; y += Math.sin(a) * d;
      }
      addZone(state, content, { x, y, r: st.r, ttl: st.ttl, kind: st.zone, dps: st.dps || 0, dmg: st.dmg || 0, blast: st.blast || 0, owner: slot.id, ...extras(st) });
    }
    return true;
  }

  function fireChain(ctx, slot, st) {
    const { state, content } = ctx, p = state.player;
    const e = W.nearest(ctx.hash, p.x, p.y, st.range);
    if (!e) return false;
    state.fx.bolts.push({ x1: p.x, y1: p.y, x2: e.x, y2: e.y, color: colorOf(content, slot.id) });
    hit(ctx, e, st.dmg, slot.id, st);
    chainFrom(ctx, e, st, slot.id, [e.uid]);
    return true;
  }

  // 낙뢰: 사거리 안(inOwnZones면 내 장판 안)의 적 count명을 무작위로. delay가 있으면 예고 장판을 깔고 그 시간 뒤에 터진다
  function fireStrike(ctx, slot, st) {
    const { state, content } = ctx, p = state.player;
    let pool = W.near(ctx.hash, p.x, p.y, st.range, []).filter(e => (e.x - p.x) ** 2 + (e.y - p.y) ** 2 <= st.range * st.range);
    if (st.inOwnZones) {
      const zs = state.zones.filter(z => z.owner === slot.id && z.kind !== 'delayed');
      pool = pool.filter(e => zs.some(z => (e.x - z.x) ** 2 + (e.y - z.y) ** 2 <= z.r * z.r));
    }
    if (!pool.length) return false;
    // 장판 상한(limits.zones)이 차서 예고 장판을 못 깔면 그 자리에서 바로 터진다 — 쿨다운만 쓰고 공격이 사라지지 않게
    for (const e of RNG.sample(state.rng, pool, st.count || 1)) {
      const z = st.delay && addZone(state, content, { x: e.x, y: e.y, r: st.r, ttl: st.delay, kind: 'delayed', dps: 0, dmg: st.dmg, blast: st.r, owner: slot.id, ...extras(st) });
      if (!z) blast(ctx, e.x, e.y, st.r, st.dmg, slot.id, st);
    }
    return true;
  }

  // 부채꼴: 가장 가까운 적 방향으로 반경 r, 각도 arc
  function fireCone(ctx, slot, st) {
    const { state, content } = ctx, p = state.player;
    const tgt = W.nearest(ctx.hash, p.x, p.y, st.r);
    if (!tgt) return false;
    const a0 = Math.atan2(tgt.y - p.y, tgt.x - p.x);
    for (const e of W.near(ctx.hash, p.x, p.y, st.r, [])) {
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy);
      if (d > st.r + R(content, e)) continue;
      let da = Math.abs(Math.atan2(dy, dx) - a0);
      if (da > Math.PI) da = 2 * Math.PI - da;
      if (da <= st.arc / 2 || d <= R(content, e)) hit(ctx, e, st.dmg, slot.id, st);
    }
    state.fx.arcs.push({ x: p.x, y: p.y, r: st.r, a0, arc: st.arc, color: colorOf(content, slot.id) });
    return true;
  }

  // 실제로 움직인 거리(player.moved)만 센다 — 제자리 입력이나 벽에 붙어 달리기로는 장판이 생기지 않는다
  function tickTrail(ctx, slot, st) {
    const { state, content } = ctx, p = state.player;
    slot.acc = (slot.acc || 0) + p.moved;
    while (slot.acc >= st.step) {
      slot.acc -= st.step;
      const mine = state.zones.filter(z => z.owner === slot.id);
      if (mine.length >= st.max) state.zones.splice(state.zones.indexOf(mine[0]), 1);
      addZone(state, content, { x: p.x, y: p.y, r: st.r, ttl: st.ttl, kind: 'damage', dps: st.dps, dmg: 0, blast: 0, owner: slot.id, ...extras(st) });
    }
  }

  function tickAura(ctx, slot, st, dt) {
    const { state, content } = ctx, p = state.player;
    if (st.stillOnly && (p.stillT || 0) < content.rules.stillDelay) return;
    if (st.heal) p.hp = Math.min(p.maxHp, p.hp + st.heal * dt * ENT.curse(state, 'healMul'));
    if (!st.r || (!st.dps && !st.push)) return;
    for (const e of W.near(ctx.hash, p.x, p.y, st.r, [])) {
      const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1, edge = st.r + R(content, e);
      if (d > edge) continue;
      // 지속 오라가 처치한 적의 구슬은 끌려오는 상태로 떨어진다 — 자석 밖(오라 가장자리)에서 죽여도 혼백을 잃지 않게
      if (st.dps && !e.dead) { hit(ctx, e, st.dps * dt, slot.id, st); if (e.dead) e.pullGem = 1; }
      if (st.push && !isBoss(content, e)) { const m = Math.min(st.push * dt, edge - d); e.x += dx / d * m; e.y += dy / d * m; }
    }
  }

  // 궤도 구슬 위치는 시간에서 계산한다(상태에 저장하지 않는다). 렌더도 이 함수를 쓴다
  function orbitPoints(state, st) {
    const p = state.player, out = [];
    for (let i = 0; i < st.count; i++) {
      const a = state.t * st.w + i * Math.PI * 2 / st.count;
      out.push({ x: p.x + Math.cos(a) * st.R, y: p.y + Math.sin(a) * st.R });
    }
    return out;
  }

  function tickOrbit(ctx, slot, st, dt) {
    const { content } = ctx;
    for (const o of orbitPoints(ctx.state, st)) {
      for (const e of W.near(ctx.hash, o.x, o.y, st.r, [])) if (inRange(e, o.x, o.y, st.r, content)) hit(ctx, e, st.dps * dt, slot.id, st);
    }
  }

  const PERIODIC = { projectile: fireProjectile, shockwave: fireShockwave, zone: fireZone, chain: fireChain, strike: fireStrike, cone: fireCone };
  const CONTINUOUS = { trail: tickTrail, aura: tickAura, orbit: tickOrbit };
  const KINDS = [...Object.keys(PERIODIC), ...Object.keys(CONTINUOUS)];

  // 쿨다운이 끝났는데 쏠 대상이 없으면 쿨다운을 0에 둔 채 다음 틱에 다시 시도한다
  function tickSlot(ctx, slot, dt) {
    const { lv, parts } = partsOf(ctx.content, slot, ctx.areaMul || 1);
    if (lv.cd != null) {
      slot.cd -= dt;
      if (slot.cd <= 0) {
        let fired = false;
        for (const st of parts) if (PERIODIC[st.kind]) fired = PERIODIC[st.kind](ctx, slot, st) || fired;
        slot.cd = fired ? lv.cd * (ctx.cdMul || 1) : 0;
      }
    }
    for (const st of parts) if (CONTINUOUS[st.kind]) CONTINUOUS[st.kind](ctx, slot, st, dt);
  }

  // 플레이어 이동 속도 배수: 보유 부적의 오라 speedMul을 곱한다(stillOnly 오라 제외)
  function speedMul(content, state) {
    let m = 1;
    for (const s of state.slots) for (const p of partsOf(content, s).parts) if (p.kind === 'aura' && !p.stillOnly) m *= p.speedMul || 1;
    return m;
  }

  function updateShots(ctx, dt) {
    const { state, content } = ctx;
    for (const s of state.shots) {
      if (s.homing) {
        const hr = content.rules.homingRange;
        let tgt = null, bd = hr * hr;
        for (const e of W.near(ctx.hash, s.x, s.y, hr, [])) {
          if (s.hit.includes(e.uid)) continue;
          const d = (e.x - s.x) ** 2 + (e.y - s.y) ** 2;
          if (d < bd) { bd = d; tgt = e; }
        }
        if (tgt) {
          const cur = Math.atan2(s.vy, s.vx), sp = Math.hypot(s.vx, s.vy);
          let da = Math.atan2(tgt.y - s.y, tgt.x - s.x) - cur;
          while (da > Math.PI) da -= 2 * Math.PI;
          while (da < -Math.PI) da += 2 * Math.PI;
          const a = cur + Math.max(-s.homing * dt, Math.min(s.homing * dt, da));
          s.vx = Math.cos(a) * sp; s.vy = Math.sin(a) * sp;
        }
      }
      s.x += s.vx * dt; s.y += s.vy * dt; s.ttl -= dt;
      if (s.ttl <= 0) continue;
      for (const e of W.near(ctx.hash, s.x, s.y, s.r, [])) {
        if (e.dead || s.hit.includes(e.uid) || !inRange(e, s.x, s.y, s.r, content)) continue;
        hit(ctx, e, s.dmg, s.owner, s);
        s.hit.push(e.uid);
        if (s.chainOnHit) chainFrom(ctx, e, { ...s, ...s.chainOnHit, dmg: s.dmg }, s.owner, s.hit);
        if (--s.pierce < 0) { s.ttl = 0; break; }
      }
    }
    state.shots = state.shots.filter(s => s.ttl > 0);
  }

  function updateZones(ctx, dt) {
    const { state, content } = ctx;
    for (const z of state.zones) {
      z.ttl -= dt;
      if (z.ttl <= 0) { if (z.kind === 'delayed') blast(ctx, z.x, z.y, z.blast, z.dmg, z.owner, z); continue; }
      if (z.kind === 'delayed') continue;
      const inside = W.near(ctx.hash, z.x, z.y, z.r, buf).filter(e => inRange(e, z.x, z.y, z.r, content));
      if (z.kind === 'damage') for (const e of inside) hit(ctx, e, z.dps * dt, z.owner, z);
      else if (z.kind === 'block') {
        for (const e of inside) {
          if (isBoss(content, e)) continue;
          const dx = e.x - z.x, dy = e.y - z.y, d = Math.hypot(dx, dy) || 1, edge = z.r + R(content, e);
          e.x = z.x + dx / d * edge; e.y = z.y + dy / d * edge;
        }
      } else if (z.kind === 'mine' && inside.length) {
        blast(ctx, z.x, z.y, z.blast, z.dmg, z.owner, z);
        z.ttl = 0;
      }
    }
    state.zones = state.zones.filter(z => z.ttl > 0);
  }

  return { KINDS, PERIODIC, CONTINUOUS, AREA_KINDS, partsOf, tickSlot, updateShots, updateZones, addZone, orbitPoints, speedMul };
})();
if (typeof module !== 'undefined') module.exports = BJ_BEHAVIORS;
