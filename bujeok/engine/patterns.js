// 부적난무 — 적 이동. 패턴이 없으면 곧장 추격한다. 새 패턴은 KINDS에 함수 하나. 적 정의의 summon은 패턴과 상관없이 붙는다.
const BJ_PATTERNS = (function bjPatterns() {
  const RNG = typeof BJ_RNG !== 'undefined' ? BJ_RNG : require('./rng.js');
  const ENT = typeof BJ_ENT !== 'undefined' ? BJ_ENT : require('./entities.js');

  function chase(e, p, speed, dt) {
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy);
    if (d > 1) { const m = Math.min(speed * dt, d); e.x += dx / d * m; e.y += dy / d * m; } // 지나치지 않는다
  }

  // 돌진: 추격 → 예고(방향 고정, 경고선) → 돌진. 적이 플레이어보다 thumbZoneY 이상 아래(엄지가 가리는 영역)면 예고가 더 길다
  // 돌진 속도(dsp)는 예고를 시작할 때 폭주·느려짐까지 넣어 고정한다 — 경고선 길이(len)가 실제 돌진 거리와 같다
  function charge(state, content, e, pat, dt) {
    const p = state.player, r = content.rules;
    e.ph = e.ph || 'chase';
    e.pt = (e.pt || 0) + dt;
    if (e.ph === 'chase') {
      chase(e, p, ENT.speed(content, e), dt);
      if (e.pt < pat.every) return;
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      e.dx = dx / d; e.dy = dy / d;
      e.warn = (pat.warn + (e.y - p.y > r.thumbZoneY ? r.thumbWarnBonus : 0)) * ENT.curse(state, 'warnMul');
      e.dsp = pat.speed * ENT.moveMul(content, e);
      e.len = e.dsp * pat.dur;
      e.ph = 'warn'; e.pt = 0;
    } else if (e.ph === 'warn') {
      if (e.pt >= e.warn) { e.ph = 'dash'; e.pt = 0; }
    } else {
      e.x += e.dx * e.dsp * dt; e.y += e.dy * e.dsp * dt;
      if (e.pt >= pat.dur) { e.ph = 'chase'; e.pt = 0; }
    }
  }

  // 내려찍기: 추격 → 플레이어 자리에 원형 예고(wx, wy, wr) → 예고가 끝날 때 원 안이면 피해
  function slam(state, content, e, pat, dt) {
    const p = state.player, r = content.rules;
    e.ph = e.ph || 'chase';
    e.pt = (e.pt || 0) + dt;
    if (e.ph === 'chase') {
      chase(e, p, ENT.speed(content, e), dt);
      if (e.pt < pat.every) return;
      e.wx = p.x; e.wy = p.y; e.wr = pat.r; e.warn = pat.warn * ENT.curse(state, 'warnMul');
      e.ph = 'warn'; e.pt = 0;
    } else if (e.ph === 'warn') {
      if (e.pt < e.warn) return;
      if ((p.x - e.wx) ** 2 + (p.y - e.wy) ** 2 <= (e.wr + r.player.r) ** 2) ENT.hitPlayer(state, content, pat.dmg * r.enrage.dmgMul ** (e.rage || 0), e.id);
      state.fx.rings.push({ x: e.wx, y: e.wy, r: e.wr, color: 0xff5a4a });
      e.wr = 0; e.ph = 'chase'; e.pt = 0;
    }
  }

  // 지그재그: 추격 방향에 수직으로 sin 흔들림을 더한다(uid로 위상을 달리해 무리가 겹치지 않게). 합친 방향을 정규화해 속력은 speed 그대로
  function zigzag(state, content, e, pat, dt) {
    const p = state.player, dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy);
    if (d <= 1) return;
    const w = Math.sin(state.t * pat.freq + e.uid) * pat.amp, k = ENT.speed(content, e) * dt / Math.sqrt(1 + w * w);
    e.x += (dx / d - dy / d * w) * k;
    e.y += (dy / d + dx / d * w) * k;
  }

  // 원거리: range 근처를 유지(멀면 다가가고 holdIn 비율 안이면 물러남, rules.ranged) → every초마다 조준(예고, ax·ay) → warn초 뒤 count발
  function ranged(state, content, e, pat, dt) {
    const p = state.player, dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1, sp = ENT.speed(content, e);
    const R = { ...content.rules.ranged, ...pat };
    const want = d > pat.range ? 1 : d < pat.range * R.holdIn ? -1 : 0;
    e.x += dx / d * sp * want * dt; e.y += dy / d * sp * want * dt;
    e.ph = e.ph || 'move';
    e.pt = (e.pt || 0) + dt;
    if (e.ph === 'move') {
      if (e.pt < pat.every || d > pat.range * R.fireOut) return;
      e.ax = dx / d; e.ay = dy / d; e.ph = 'aim'; e.pt = 0;
    } else if (e.pt >= pat.warn * ENT.curse(state, 'warnMul')) {
      const n = pat.count || 1, a0 = Math.atan2(e.ay, e.ax);
      for (let i = 0; i < n && state.eshots.length < content.rules.limits.eshots; i++) {
        const a = a0 + (i - (n - 1) / 2) * (pat.spread || 0);
        state.eshots.push({ x: e.x, y: e.y, vx: Math.cos(a) * pat.speed, vy: Math.sin(a) * pat.speed, r: pat.r, dmg: pat.dmg * content.rules.enrage.dmgMul ** (e.rage || 0), ttl: R.ttl, src: e.id });
      }
      e.ph = 'move'; e.pt = 0;
    }
  }

  // 도약: every초 동안 평소 속도로 다가오다가 → 그 순간 방향을 고정하고 dur초 동안 speed로 뛴다.
  // 예고 없음(일반 요괴 전용 — 피해를 낮게 둔다). 단계 이름에 'warn'을 쓰지 않는다(봇 회피·예고선 렌더가 읽는다)
  function hop(state, content, e, pat, dt) {
    const p = state.player;
    e.ph = e.ph || 'rest';
    e.pt = (e.pt || 0) + dt;
    if (e.ph === 'rest') {
      chase(e, p, ENT.speed(content, e), dt);
      if (e.pt < pat.every) return;
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      e.dx = dx / d; e.dy = dy / d; e.dsp = pat.speed * ENT.moveMul(content, e);
      e.ph = 'hop'; e.pt = 0;
    } else {
      e.x += e.dx * e.dsp * dt; e.y += e.dy * e.dsp * dt;
      if (e.pt >= pat.dur) { e.ph = 'rest'; e.pt = 0; }
    }
  }

  // 달아나기(보물 요괴): maxR보다 멀면 다가오고, minR보다 가까우면 멀어지고, 그 사이면 원을 따라 돈다(방향은 uid 홀짝).
  // 화면 밖으로 사라지지 않고, 플레이어(더 빠름)가 쫓으면 잡힌다. 수명은 정의의 life
  function flee(state, content, e, pat, dt) {
    const p = state.player, dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1, k = ENT.speed(content, e) * dt;
    if (d > pat.maxR) { const m = Math.min(k, d - pat.maxR); e.x -= dx / d * m; e.y -= dy / d * m; return; }
    if (d < pat.minR) { e.x += dx / d * k; e.y += dy / d * k; return; }
    const s = e.uid % 2 ? 1 : -1;
    e.x += -dy / d * s * k; e.y += dx / d * s * k;
  }

  const KINDS = { charge, slam, zigzag, ranged, hop, flee };

  // 졸개 소환: every초마다 count마리, 이 적이 부른 졸개가 동시에 max를 넘지 않게. 플레이어 안전 반경 밖으로 밀어낸다
  function summon(state, content, e, sm, dt) {
    e.sm = (e.sm || 0) + dt;
    if (e.sm < sm.every) return;
    e.sm = 0;
    const owner = 'u' + e.uid, alive = state.enemies.filter(x => x.owner === owner && !x.dead).length;
    for (let i = 0; i < Math.min(sm.count, sm.max - alive); i++) {
      const a = RNG.range(state.rng, 0, Math.PI * 2);
      const off = content.rules.summonOffset, q = ENT.safePos(state, content, e.x + Math.cos(a) * off, e.y + Math.sin(a) * off);
      ENT.spawnEnemy(state, content, sm.enemy, q.x, q.y, { owner });
    }
  }

  // 치유 오라(적끼리 영향을 주는 첫 부품): 둘레 au.r 안의 다른 적을 초당 au.heal 회복. ghostsOnly면 귀신만.
  // 보스·정예·자신·죽은 적·오라를 가진 적(치유사끼리)은 회복하지 않고 maxHp를 넘지 않는다.
  // 오라가 겹쳐도 한 적은 틱마다 한 번만 회복한다(healT = 그 틱의 state.t). RNG를 쓰지 않는다
  function aura(state, content, e, au, dt) {
    const r2 = au.r * au.r;
    for (const x of state.enemies) {
      if (x === e || x.dead || x.elite || x.hp >= x.maxHp || x.healT === state.t) continue;
      const d = content.enemies[x.id];
      if (d.boss || d.aura || (au.ghostsOnly && !d.ghost)) continue;
      if ((x.x - e.x) ** 2 + (x.y - e.y) ** 2 > r2) continue;
      x.hp = Math.min(x.maxHp, x.hp + au.heal * dt);
      x.healT = state.t;
    }
  }

  function move(state, content, e, dt) {
    const def = content.enemies[e.id];
    if (def.pattern) KINDS[def.pattern.kind](state, content, e, def.pattern, dt);
    else chase(e, state.player, ENT.speed(content, e), dt);
    if (def.summon) summon(state, content, e, def.summon, dt);
    if (def.aura) aura(state, content, e, def.aura, dt);
  }

  return { KINDS, chase, move };
})();
if (typeof module !== 'undefined') module.exports = BJ_PATTERNS;
