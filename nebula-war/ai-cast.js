// 네뷸라 워 — AI 시전자 조작 모듈(NW_AI_CAST). sim 상태를 읽기만 한다(g 불변, g.rng 안 씀).
// 적 = v.foes(보이는 것)만 — 위치·종류·hp·결정막·모드·stf. 적의 energy·order·업그레이드는 읽지 않는다.
// 자기·팀원 엔티티와 g.fx 중 자기 팀이 걸었거나 자기 팀 유닛이 대상인 것만 읽는다.
//
//   context(ai, g, v) → ctx                             판단당 1회(버킷 생성)
//   buckets(units, cell = 8) → Map(key → units)         cell 타일 격자, 삽입 순서 = units 순서(id 오름차순)
//   pick.hurtAllies(ctx, c, A, minMissingHp)            → 대상 유닛 | null
//   pick.foeClump(ctx, c, A, r, minN, minValue)         → {x, y, n, value} | null  (반경 r(px) 안 적 비건물 유닛 가치 합 최대 지점)
//   pick.ownClump(ctx, c, A, r, pred, minN)             → {x, y, n} | null
//   pick.threat(ctx, c, A, pred)                        → 사거리 안 가치(비용) 최대 적 유닛
//   pick.enemyCaster(ctx, c, A)                         → 사거리 안 def.energy 있는 적 유닛(가치 순)
//   pick.debuffedAlly(ctx, c, A)                        → 적이 건 status fx 대상인 자기·팀원 유닛(가치 순)
//   pick.staticClump(ctx, c, A, r, minN)                → 두 판단 연속 정지(±8px) 또는 모드 중인 적 뭉침
//   pick.self / pick.unseen / pick.auto                 → 자신 / 안 보이는 적 사건 지점 / 자동 시전 켜기
//   friendlyOk(ctx, x, y, r, foeValue, ff = L.ff)       → 아군 피해 회피(0 없음, 1 아군 가치 × 3 < 적 가치, 2 반경 + 1타일 안 자기·팀원 비건물 유닛 0)
//   RULES = { [abilityId]: { pick, args?, when?: 'combat'|'always'|'unseen', lvl, ff?, key?, ok?(ctx, c, A, t) } }
//   castPlan(ai, g, v, busy) → cmds[]                   (시전자 id 순, 시전자당 1개, 판단당 ai.L.cast.max 개까지)
const NW_AI_CAST = (function nwAICast() {
  const S = typeof NW_SIM !== 'undefined' ? NW_SIM : require('./sim.js');
  const D = S.D, TFP = S.TFP, FP = S.FP, STF = S.STF;
  const C = {
    FIGHT_R: 16,  // 교전 판정: 시전자 이 반경(타일) 안에 보이는 적 유닛
    SLACK: 160,   // 지점·대상 선택: 사거리 + 이만큼(px)까지(시전자가 다가가 시전)
    STILL: 8,     // 정지 판정: 지난 판단 대비 이동량(px)
    UNSEEN: 120,  // 안 보이는 적 사건 인정 틱
    OFF_R: 20,    // 토글 끄기(어려움): 이 반경(타일) 안에 보이는 적이 없거나
    OFF_N: 3,     // 교전 아닌 판단이 이만큼 연속이면 끈다(켜기는 FIGHT_R — 경계에서 껐다 켰다 안 하게)
  };
  const d2 = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; };
  const valueOf = e => (e.def.cost ? (e.def.cost.crystal || 0) + (e.def.cost.nebula || 0) : 0);
  const radius = e => e.isB ? Math.min(e.def.w, e.def.h) * 16 : e.def.radius;
  const better = (a, b, ka, kb) => !b || ka > kb || (ka === kb && a.id < b.id); // 큰 값, 동률 id 작은 것

  // ---- 버킷 ----
  const keyOf = (cx, cy) => cy * 4096 + cx;
  function buckets(units, cell = 8) {
    const m = new Map(), sz = cell * TFP;
    for (const e of units) {
      const k = keyOf(Math.floor(e.x / sz), Math.floor(e.y / sz));
      let a = m.get(k);
      if (!a) m.set(k, a = []);
      a.push(e);
    }
    m.cell = sz;
    return m;
  }
  // (x, y) 반경 r(FP) 안 버킷 유닛(버킷 순회 순서 = 셀 행·열 순, 셀 안 id 순)
  function near(B, x, y, r, fn) {
    const sz = B.cell, r2 = r * r;
    for (let cy = Math.floor((y - r) / sz); cy <= Math.floor((y + r) / sz); cy++)
      for (let cx = Math.floor((x - r) / sz); cx <= Math.floor((x + r) / sz); cx++) {
        const a = B.get(keyOf(cx, cy));
        if (a) for (const e of a) { const dx = e.x - x, dy = e.y - y; if (dx * dx + dy * dy <= r2) fn(e); }
      }
  }

  // ---- 판단 문맥 ----
  function context(ai, g, v) {
    const unit = e => !e.isB && e.hp > 0 && !e.inside;
    const foes = v.foes.filter(unit), mine = [...v.own, ...v.allies].filter(unit).sort((a, b) => a.id - b.id);
    return { ai, g, v, p: ai.p, L: ai.L.cast, tick: g.tick, foes, mine, foeB: buckets(foes), mineB: buckets(mine), last: ai.st.lastFoePos || new Map() };
  }
  // 시전자 c 가 A 로 닿는 거리(FP, 대상 반경 tr 포함). range 0 = 무제한
  const reach = (c, A, tr = 0) => A.range ? (A.range + radius(c) + tr + C.SLACK) * FP : Infinity;
  const inReach = (c, A, t) => { const l = reach(c, A, radius(t)); return l === Infinity || d2(c, t) <= l * l; };
  const combat = (ctx, c, r = C.FIGHT_R) => { let f = false; near(ctx.foeB, c.x, c.y, r * TFP, () => { f = true; }); return f; };
  const targetable = e => !(e.stf & STF.stasis);

  // 뭉침: 후보 유닛마다 반경 r 안 무리의 가치 합 → 최대(동률 n, id). 지점 = 무리 무게중심
  function clump(ctx, c, A, B, cands, r, minN, minValue, inc) {
    const rr = r * FP;
    let best = null, bk = -1, bn = 0, bid = 0;
    for (const s of cands) {
      if (!inReach(c, A, s)) continue;
      let n = 0, val = 0, x = 0, y = 0;
      near(B, s.x, s.y, rr, e => { if (!inc(e)) return; n++; val += valueOf(e); x += e.x; y += e.y; });
      if (n < minN || val < minValue) continue;
      if (val > bk || (val === bk && (n > bn || (n === bn && s.id < bid)))) { bk = val; bn = n; bid = s.id; best = { x: Math.trunc(x / n), y: Math.trunc(y / n), n, value: val }; }
    }
    return best;
  }

  // ---- 선택기 ----
  const pick = {
    self: (ctx, c) => c,
    auto: (ctx, c, A) => (c.auto !== A.id ? c : null), // 자동 시전 능력이 꺼져 있으면 켠다
    unseen: ctx => { const st = ctx.ai.st; return st.unseen && ctx.tick - st.unseenAt <= C.UNSEEN ? { x: st.unseen.x, y: st.unseen.y } : null; },
    hurtAllies(ctx, c, A, minMissingHp = 1) {
      let best = null, bk = 0;
      for (const e of ctx.mine) {
        const miss = e.hpMax - e.hp;
        if (e === c || miss < minMissingHp * FP || !targetable(e) || !inReach(c, A, e)) continue;
        if (better(e, best, miss, bk)) { best = e; bk = miss; }
      }
      return best;
    },
    foeClump: (ctx, c, A, r, minN = 1, minValue = 0) => clump(ctx, c, A, ctx.foeB, ctx.foes, r, minN, minValue, targetable),
    ownClump(ctx, c, A, r, pred = () => true, minN = 1) {
      const p = clump(ctx, c, A, ctx.mineB, ctx.mine, r, minN, 0, pred);
      return p && { x: p.x, y: p.y, n: p.n };
    },
    threat(ctx, c, A, pred = () => true) {
      let best = null, bk = 0;
      for (const e of ctx.foes) if (targetable(e) && pred(e) && inReach(c, A, e) && better(e, best, valueOf(e), bk)) { best = e; bk = valueOf(e); }
      return best;
    },
    enemyCaster: (ctx, c, A) => pick.threat(ctx, c, A, e => !!e.def.energy),
    debuffedAlly(ctx, c, A) {
      const ids = new Set();
      for (const f of ctx.g.fx) if (f.kind === 'status' && f.tgt && S.isEnemy(ctx.g, ctx.p, f.owner)) ids.add(f.tgt);
      let best = null, bk = 0;
      for (const e of ctx.mine) if (ids.has(e.id) && targetable(e) && inReach(c, A, e) && better(e, best, valueOf(e), bk)) { best = e; bk = valueOf(e); }
      return best;
    },
    staticClump(ctx, c, A, r, minN = 1) {
      const still = new Set(), s2 = C.STILL * FP * C.STILL * FP;
      for (const e of ctx.foes) { const l = ctx.last.get(e.id); if (e.mode || (l && d2(l, e) <= s2)) still.add(e.id); }
      if (!still.size) return null;
      return clump(ctx, c, A, ctx.foeB, ctx.foes.filter(e => still.has(e.id)), r, minN, 0, e => still.has(e.id) && targetable(e));
    },
  };

  function friendlyOk(ctx, x, y, r, foeValue, ff = ctx.L.ff || 0) {
    if (!ff) return true;
    let n = 0, val = 0;
    near(ctx.mineB, x, y, (ff >= 2 ? r + 32 : r) * FP, e => { n++; val += valueOf(e); });
    return ff >= 2 ? n === 0 : val * 3 < foeValue;
  }

  // ---- 규칙 표(능력 id 키). lvl 9 = 꺼짐(종족 작업에서 채운다). 데이터에 없는 id 는 로드 시 무시 ----
  // ── legion ──
  // 규칙 보조(보이는 정보만): 탐지기 = 탐지 연구가 필요 없는 보이는 적 탐지기(건물 포함) 반경 10타일
  const detNear = (ctx, x, y) => ctx.v.foes.some(f => f.hp > 0 && f.def.detector && !f.def.detectReq && d2(f, { x, y }) <= (10 * TFP) * (10 * TFP));
  const seenTile = (ctx, t) => { const tx = Math.floor(t.x / TFP), ty = Math.floor(t.y / TFP), m = ctx.g.map; return tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && ctx.g.fog[ctx.p][ty * m.w + tx] === 2; };
  const mech = d => d.race === 'legion' && !!d.armorUpgrade && d.armorUpgrade !== 'legion_infantry_armor';
  const engaged = (ctx, e) => { const m = ctx.eng || (ctx.eng = new Map()); let r = m.get(e.id); if (r === undefined) m.set(e.id, r = combat(ctx, e)); return r; };
  Object.assign(pick, {
    smokeClump: (ctx, c, A) => pick.ownClump(ctx, c, A, 48, e => engaged(ctx, e), 4),
    // 표식: 어려움(synergy)은 자기 유닛들이 가장 많이 공격 중인 적(집중 사격 대상)에 건다.
    // 이미 표식이 붙었거나 자기 시전자가 거는 중(이번 판단 포함)인 적은 건너뛴다 — 같은 대상에 겹쳐 걸어 마나를 버리던 것
    markTarget(ctx, c, A) {
      const taken = ctx.marking || (ctx.marking = new Set(ctx.v.own.filter(e => e.order && e.order.type === 'cast' && e.order.what === 'mark').map(e => e.order.target)));
      const fresh = f => !(f.stf & STF.marked) && !taken.has(f.id);
      let best = null;
      if (ctx.L.synergy) {
        const cnt = new Map();
        for (const e of ctx.v.own) if (e.order && e.order.type === 'attack' && !e.isB) cnt.set(e.order.target, (cnt.get(e.order.target) || 0) + 1);
        let bk = 0;
        for (const f of ctx.foes) { const n = cnt.get(f.id) || 0; if (n && fresh(f) && targetable(f) && inReach(c, A, f) && better(f, best, n, bk)) { best = f; bk = n; } }
      }
      best = best || pick.threat(ctx, c, A, fresh);
      if (best) taken.add(best.id);
      return best;
    },
    // 방전탄: 결정막 합(+어려움은 적 시전 유닛당 100) 최대 뭉침, 보통 200 / 어려움 120 이상
    shieldClump(ctx, c, A, r) {
      const hard = ctx.L.lvl >= 3, need = hard ? 120 : 200, rr = r * FP;
      let best = null, bk = -1, bid = 0;
      for (const s of ctx.foes) {
        if (!targetable(s) || !inReach(c, A, s)) continue;
        let n = 0, sh = 0, cs = 0, x = 0, y = 0;
        near(ctx.foeB, s.x, s.y, rr, e => { if (!targetable(e)) return; n++; sh += Math.floor(e.shield / FP); if (e.def.energy) cs++; x += e.x; y += e.y; });
        const k = sh + (hard ? 100 * cs : 0);
        if (k >= need && (k > bk || (k === bk && s.id < bid))) { bk = k; bid = s.id; best = { x: Math.trunc(x / n), y: Math.trunc(y / n), n, value: k }; }
      }
      return best;
    },
    // 견인 빔: 사거리 밖으로 멀어지는 중(지난 판단 대비 시전자에게서 멀어짐)이거나 정박한 적. 정박 > 공중·대형 > 그 외, 가치 순
    towTarget(ctx, c, A) {
      let best = null, bk = -1;
      for (const e of ctx.foes) {
        if (!targetable(e) || !inReach(c, A, e)) continue;
        const l = ctx.last.get(e.id), away = !!(l && (e.x - l.x) * (e.x - c.x) + (e.y - l.y) * (e.y - c.y) > 0 && d2(l, e) > (C.STILL * FP) * (C.STILL * FP));
        if (!away && !e.mode && !(ctx.L.lvl >= 3 && (e.def.air || e.def.size === 'large') && valueOf(e) >= 200)) continue; // 어려움: 교전 중 사거리 안 고가 공중·대형도
        const k = ((e.mode ? 2 : e.def.air || e.def.size === 'large' ? 1 : 0) * 100000) + valueOf(e);
        if (better(e, best, k, bk)) { best = e; bk = k; }
      }
      return best;
    },
    // 드론 정찰: 안 보이는 적 사건 지점. 보통 이상은 적 본진을 못 찾았고 마나 150 이상이면 아직 안 본 시작 후보
    scanPoint(ctx, c) {
      const u = pick.unseen(ctx);
      if (u || ctx.L.lvl < 2 || c.energy < 150 * FP) return u;
      const st = ctx.ai.st;
      if (!st.sites) return null;
      // 적 본진을 알면(보통은 여기서 끝) 어려움만 아직 안 본 확장 자리 — 적 본진에서 가까운 순(적 확장 탐색)
      const found = !!st.enemyBase || [...ctx.v.known.values()].some(b => S.isEnemy(ctx.g, ctx.p, b.owner) && D.buildings[b.type].dropoff);
      if (found && ctx.L.lvl < 3) return null;
      const mine = [...ctx.v.own, ...ctx.v.allies].filter(b => b.isB && b.def.dropoff), ref = (found && st.enemyBase) || c;
      let best = null, bk = Infinity;
      for (const s of st.sites) {
        if ((!found && !s.start) || st.seen[s.tx + ',' + s.ty] !== undefined || mine.some(b => Math.abs(b.tx - s.tx) <= 6 && Math.abs(b.ty - s.ty) <= 6)) continue;
        const k = d2(ref, s);
        if (k < bk) { bk = k; best = { x: s.x, y: s.y }; }
      }
      return best;
    },
    junkClump: (ctx, c, A) => pick.staticClump(ctx, c, A, 56, ctx.L.lvl >= 3 ? 3 : 4),
    repairClump: (ctx, c, A) => pick.ownClump(ctx, c, A, 128, e => mech(e.def), 1),
  });
  const LEGION = {
    heal: { pick: 'auto', when: 'always', lvl: 2 },
    smoke: { pick: 'smokeClump', when: 'combat', lvl: 3, ok: (ctx, c, A, t) => !detNear(ctx, t.x, t.y) },
    optcloak: { pick: 'self', when: 'combat', lvl: 2, ok: (ctx, c) => !detNear(ctx, c.x, c.y) },
    mark: { pick: 'markTarget', when: 'combat', lvl: 2 },
    discharge: { pick: 'shieldClump', args: [48], when: 'combat', lvl: 2, key: true }, // key: 어려움은 망토·표식에 마나를 다 쓰지 않고 방전탄 몫(100)을 남긴다
    seeker: { pick: 'self', when: 'combat', lvl: 2, ok: (ctx, c) => ctx.foes.filter(f => !f.def.air && d2(f, c) <= (6 * TFP) * (6 * TFP)).length >= 2 },
    cleanse: { pick: 'debuffedAlly', when: 'always', lvl: 2, ok: (ctx, c, A, t) => valueOf(t) >= (ctx.L.lvl >= 3 ? 100 : 150) },
    tow: { pick: 'towTarget', when: 'combat', lvl: 2 },
    scan: { pick: 'scanPoint', when: 'always', lvl: 1 },
    // 지연 80틱: 아군 피해 검사에 더해, 그 지점(반경 + 1타일)으로 가는 중이거나 그 안의 적을 공격 중인 자기 유닛이 있으면 안 쓴다
    junkdrop: { pick: 'junkClump', when: 'always', lvl: 2, ff: true, key: true, ok: (ctx, c, A, t) => seenTile(ctx, t) && !ctx.v.own.some(e => {
      const o = e.order, r = (A.effect.r + 32) * FP;
      if (e.isB || !o) return false;
      const at = o.x !== undefined ? o : o.target ? ctx.foes.find(f => f.id === o.target) : null;
      return !!at && d2(at, t) <= r * r;
    }) },
    // spells2 수리 드론: 기계 아군 결손 hp 합 300 이상(반경 128 안)
    repairdrones: { pick: 'repairClump', when: 'combat', lvl: 2, ok(ctx, c, A, t) {
      let miss = 0;
      near(ctx.mineB, t.x, t.y, 128 * FP, e => { if (mech(e.def)) miss += Math.floor((e.hpMax - e.hp) / FP); });
      return miss >= 300;
    } },
  };
  // 선택기(마이셀): 전선 = 자기 부상 유닛 ≥ 3과 보이는 적 ≥ 2가 반경 r 안. 어려움(synergy)은 후퇴 중이면 지점을 가까운 자기 건물 쪽 3타일로 옮겨 추격을 늦춘다
  pick.mycelFront = (ctx, c, A, r) => {
    const rr = r * FP, hurt = ctx.mine.filter(e => e.hp < e.hpMax && inReach(c, A, e));
    let best = null, bk = -1;
    for (const s of hurt) {
      let n = 0, x = 0, y = 0, f = 0;
      near(ctx.mineB, s.x, s.y, rr, e => { if (e.hp < e.hpMax) { n++; x += e.x; y += e.y; } });
      near(ctx.foeB, s.x, s.y, rr, e => { if (targetable(e)) f++; });
      if (n >= 3 && f >= 2 && (n > bk || (n === bk && s.id < best.id))) { bk = n; best = { x: Math.trunc(x / n), y: Math.trunc(y / n), n, id: s.id }; }
    }
    if (best && ctx.L.synergy && ctx.ai.st.mode === 'retreat') {
      let home = null;
      for (const b of ctx.v.own) if (b.isB && (!home || d2(b, best) < d2(home, best))) home = b;
      if (home) {
        const dx = home.x - best.x, dy = home.y - best.y, len = Math.max(1, Math.floor(Math.sqrt(dx * dx + dy * dy))), k = Math.min(3 * TFP, len);
        best.x += Math.trunc(dx * k / len); best.y += Math.trunc(dy * k / len);
      }
    }
    return best;
  };
  // 정지한 뭉침이 있으면 그쪽(가중), 없으면 그냥 뭉침. 적 전용 효과라 아군 피해 검사 없음
  pick.rotClump = (ctx, c, A, r) => pick.staticClump(ctx, c, A, r, ctx.L.clump) || pick.foeClump(ctx, c, A, r, ctx.L.clump, 0);
  // ── swarm ──
  const SWARM = {
    spores: { pick: 'foeClump', args: [64, 1, 200], when: 'combat', lvl: 2 }, // Task 10: 적 가치 300 → 200
    mat: { pick: 'mycelFront', args: [56], when: 'combat', lvl: 2 },
    rot: { pick: 'rotClump', args: [40], when: 'combat', lvl: 2, key: true },
    // key: 부패 포자 몫을 남기느라 못 쓰던 것(마나 100 이상이면 25 남기고 시전). 부패 포자 연구 전이면 남길 몫이 없으니 75부터
    sprout: { pick: 'foeClump', args: [64, 1, 0], when: 'combat', lvl: 2, key: true, ok: (ctx, c) => c.energy >= 100 * FP || S.canCast(ctx.g, ctx.p, c, 'rot') === 'research' },
  };
  // ── elysian ──
  const armed = e => !!(e.def.weapon || e.def.weapon2) && !(e.stf & (STF.disarmed | STF.stasis));
  const mineNear = (ctx, t, r, fn) => near(ctx.mineB, t.x, t.y, r * FP, fn);
  // 대합창 뭉침은 보호막이 깎인 유닛만 센다 — 가득 찬 비싼 유닛(시전자 자신 등)이 중심을 끌고 가지 않게
  const hurtShield = e => e.shieldMax > 0 && e.shield < e.shieldMax;
  const chorusOk = (ctx, t) => { let d = 0; mineNear(ctx, t, 64, e => { if (e.shieldMax > 0) d += e.shieldMax - e.shield; }); return d >= 200 * FP; };
  const chorusSpot = (ctx, c) => { const t = c.energy >= D.abilities.chorus.cost * FP && S.canCast(ctx.g, ctx.p, c, 'chorus') === '' && pick.ownClump(ctx, c, D.abilities.chorus, 64, hurtShield); return !!t && chorusOk(ctx, t); };
  const ELYSIAN = {
    // 적 가치 400(어려움 300) 이상 뭉침. 아군 피해 회피는 난이도 ff
    mindstorm: { pick: 'foeClump', args: [48, 1, 300], when: 'combat', lvl: 2, ff: true, key: true,
      ok: (ctx, c, A, t) => t.value >= (ctx.L.lvl >= 3 ? 300 : 400) },
    // 공격·후퇴 중 자기 주변 64px 아군 4기 이상, 증폭이 이미 걸려 있지 않을 때(= 교전 개시·후퇴 시작).
    // key(Task 10): 어려움 마나 남기기에서 공명 파쇄와 같은 급 — 보조로 두면 파쇄 비용을 남기느라 거의 못 씀
    amplify: { pick: 'self', when: 'combat', lvl: 2, key: true,
      ok: (ctx, c) => { const m = ctx.ai.st.mode; let n = 0; if ((m !== 'attack' && m !== 'retreat') || toggledOn(ctx.g, c, 'amplify')) return false; mineNear(ctx, c, 64, e => { if (e !== c) n++; }); return n >= 4; } },
    // 아군이 반경 안(+1타일)에 하나라도 있으면 안 씀(ff 2 강제). 적 가치 600 이상 또는 후퇴 중 추격 적 뭉침
    stasis: { pick: 'foeClump', args: [48, 1, 0], when: 'combat', lvl: 2, ff: 2, key: true,
      ok: (ctx, c, A, t) => t.value >= 600 || (ctx.ai.st.mode === 'retreat' && t.n >= 2 && t.value >= 300) },
    crystallize: { pick: 'threat', args: [armed], when: 'combat', lvl: 2 },
    probe: { pick: 'unseen', when: 'unseen', lvl: 1 },
    // 교전 중 켠다(끄기는 castPlan 토글 규칙). 보이는 적 탐지기가 있으면 안 켠다
    // 켜진 동안 마나가 순감소(드레인 > 재생)라 공명 공진 몫(100)이 안 차 못 썼다 — 마나 100 이상에서만 켜고, 공진을 쓸 수 있는 판단이면 공진이 먼저
    prism: { pick: 'self', when: 'combat', lvl: 2, ok: (ctx, c) => c.energy >= 100 * FP && !detNear(ctx, c.x, c.y) && !chorusSpot(ctx, c) },
    // 반경 64px 아군 보호막 결손 합 200 이상(Task 10: 300 → 200, 함대 거울전에서 거의 안 쓰여서)
    chorus: { pick: 'ownClump', args: [64, hurtShield], when: 'combat', lvl: 2, ok: (ctx, c, A, t) => chorusOk(ctx, t) },
    // 대상 마나를 주변 6타일 아군 코러스 시전자에게 나눈다 — 마나가 모자란(70% 미만) 아군 시전자가 6타일 안에 있을 때.
    // 어려움(synergy)은 나눌 곳이 없어도 적 시전 유닛의 마나를 빼앗는다(리스너가 마나를 쌓아 두기만 하던 것)
    echo: { pick: 'enemyCaster', when: 'combat', lvl: 2,
      ok: (ctx, c) => { if (ctx.L.synergy) return true; let need = false; near(ctx.mineB, c.x, c.y, 6 * TFP, e => { if (e.def.energy && e.def.race === 'elysian' && e.energy * 10 < S.energyMax(ctx.g, e) * 7) need = true; }); return need; } },
  };
  const RULES = {};
  for (const blk of [LEGION, SWARM, ELYSIAN]) for (const id in blk) if (D.abilities[id]) RULES[id] = blk[id];

  // ---- 시전 계획 ----
  const toggledOn = (g, c, what) => g.fx.some(f => f.ab === what && f.tgt === c.id); // 자기 유닛 대상 fx
  // 결정적 마법(key) 비용 — 어려움(reserve)은 보조 마법을 쓸 때 이만큼 마나를 남긴다
  function keyCost(g, p, c) {
    let k = 0;
    for (const id of c.def.abilities) { const R = RULES[id]; if (R && R.key && S.canCast(g, p, c, id) !== 'research') k = Math.max(k, D.abilities[id].cost); }
    return k;
  }
  // 같은 마법이 이미 그 지점 근처에 걸려 있거나(자기 팀 fx) 자기 시전자가 그쪽으로 시전 중이면 겹쳐 쓰지 않는다
  function overlap(ctx, what, A, t, cmds) {
    const r = A.effect.kind === 'reveal' ? A.effect.r * TFP : (A.effect.r || 32) * FP, r2 = r * r; // 드러내기 반경은 타일 단위
    for (const f of ctx.g.fx) if (f.ab === what && !S.isEnemy(ctx.g, ctx.p, f.owner) && d2(f, t) <= r2) return true;
    for (const e of ctx.v.own) { const o = e.order; if (o && o.type === 'cast' && o.what === what && d2(o, t) <= r2) return true; }
    return cmds.some(c => c.what === what && c.x !== undefined && d2(c, t) <= r2);
  }
  function castPlan(ai, g, v, busy = new Set()) {
    const L = ai.L.cast, p = ai.p, out = [];
    const casters = v.own.filter(e => (e.def.abilities || []).length && e.hp > 0 && !(e.buildLeft > 0) && !e.inside && !busy.has(e.id)).sort((a, b) => a.id - b.id);
    if (!casters.length) return out;
    const ctx = context(ai, g, v);
    for (const c of casters) {
      if (out.length >= L.max) break;
      if (c.order && c.order.type === 'cast') continue;
      const fight = combat(ctx, c);
      for (const what of c.def.abilities) {
        const R = RULES[what], A = D.abilities[what];
        if (!R || R.lvl > L.lvl) continue;
        if (A.toggle && toggledOn(g, c, what)) { // 켜진 토글: 어려움은 교전이 끝나면 끈다(재시전 = 끄기). 반경 OFF_R 안 적 없음 또는 OFF_N 판단 연속 교전 아님
          if (L.toggles) {
            const tc = ai.st.togCalm || (ai.st.togCalm = new Map()), k = c.id + what, n = fight ? 0 : (tc.get(k) || 0) + 1;
            tc.set(k, n);
            if (n && (n >= C.OFF_N || !combat(ctx, c, C.OFF_R))) { tc.delete(k); out.push({ type: 'cast', ids: [c.id], what, player: p }); break; }
          }
          continue;
        }
        if (R.pick === 'auto') {
          if (A.autocast && c.auto !== what) { out.push({ type: 'autocast', ids: [c.id], what, on: true, player: p }); break; }
          continue;
        }
        if (c.ccd > 0 || S.canCast(g, p, c, what) !== '') continue;
        if (R.when === 'combat' && !fight) continue;
        if (R.when === 'unseen' && !pick.unseen(ctx)) continue;
        if (L.reserve && !R.key && c.energy < (A.cost + keyCost(g, p, c)) * FP) continue;
        const t = pick[R.pick](ctx, c, A, ...(R.args || []));
        if (!t || (R.ok && !R.ok(ctx, c, A, t))) continue;
        if (A.target === 'point') {
          if (R.ff && !friendlyOk(ctx, t.x, t.y, A.effect.r || 0, t.value || 0, R.ff === true ? undefined : R.ff)) continue;
          if (overlap(ctx, what, A, t, out)) continue;
          out.push({ type: 'cast', ids: [c.id], what, x: t.x, y: t.y, player: p });
        } else if (A.target === 'unit') out.push({ type: 'cast', ids: [c.id], what, target: t.id, player: p });
        else out.push({ type: 'cast', ids: [c.id], what, player: p });
        break;
      }
    }
    const last = new Map(); // 다음 판단의 정지 판정용(보이는 적 유닛 위치)
    for (const e of ctx.foes) last.set(e.id, { x: e.x, y: e.y });
    ai.st.lastFoePos = last;
    return out;
  }

  return { C, RULES, buckets, context, pick, friendlyOk, castPlan, _: { near, valueOf, combat }, SRC: nwAICast };
})();
if (typeof module !== 'undefined') module.exports = NW_AI_CAST;
