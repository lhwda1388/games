// 네뷸라 워 — 결정론 시뮬레이션 코어. DOM/시간/Math.random/삼각함수 금지.
const NW_SIM = (function nwSim() {
  const D = typeof NW_DATA !== 'undefined' ? NW_DATA : require('./data.js');
  const FP = 256, TILE = 32, TFP = TILE * FP, TICK_RATE = 20;

  function mulberry32(r) { // r = {s}
    let t = (r.s = (r.s + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0);
  }
  const isqrt = v => Math.floor(Math.sqrt(v)); // IEEE 정확, 결정론 허용

  // 업그레이드 색인(데이터 선언 순서 = 결정론 순서)
  const UP_IDS = Object.keys(D.upgrades);
  const CAT_UP = {}, SHIELD_UP = {};   // category → upgrade (공격/방어/보호막)
  const UNIT_UP = {};  // unit id → [upgrade] (유닛 전용 스탯)
  for (const id of UP_IDS) {
    const u = D.upgrades[id], ef = u.effect;
    if (ef.category) CAT_UP[ef.category] = u;
    if (ef.unit) (UNIT_UP[ef.unit] = UNIT_UP[ef.unit] || []).push(u);
    if (ef.shieldPerLevel) SHIELD_UP[u.race] = u;
  }
  const upLevel = (p, u) => (u && p.up[u.id]) || 0;
  const catLevel = (g, owner, cat) => owner >= 0 && cat ? upLevel(g.players[owner], CAT_UP[cat]) : 0;

  // 유닛 스탯 + 유닛 전용 업그레이드. key: speed|sight|range|cooldown, wk: 'weapon'|'weapon2'(range/cooldown 대상)
  // 현재 무기: 모드 중이면 그 모드의 무기('weapon'만), 아니면 기본 정의
  const weaponOf = (e, wk) => e.mode ? (wk === 'weapon' ? e.def.modes[e.mode].weapon : undefined) : e.def[wk];
  function stat(g, e, key, wk = 'weapon') {
    const isW = key === 'range' || key === 'cooldown';
    let v = isW ? weaponOf(e, wk)[key] : e.def[key];
    const ups = UNIT_UP[e.type];
    if (ups && e.owner >= 0) for (const u of ups) {
      const ef = u.effect;
      if (ef.stat === key && (!isW || (ef.weapon || 'weapon') === wk)) v += ef.add * upLevel(g.players[e.owner], u);
    }
    return v;
  }

  // ── 3a: 마나·상태 ──
  const ENERGY_REGEN = 8; // FP/틱 ≈ 0.625/초
  const STF = { cloaked: 1, rooted: 2, disarmed: 4, slowed: 8, detected: 16, marked: 32, hasted: 64, stasis: 128 }; // e.stf 비트(매 틱 g.fx에서 재계산)
  // marked: 받는 피해 +25% · hasted: 이동 ×1.5 · stasis: rooted+disarmed, 피해·대상 지정·범위 효과·시전 불가
  function energyMax(g, e) {
    let v = e.def.energy ? e.def.energy.max : 0;
    const ups = UNIT_UP[e.type];
    if (ups && e.owner >= 0) for (const u of ups) if (u.effect.stat === 'energy') v += u.effect.add * upLevel(g.players[e.owner], u);
    return v * FP;
  }
  const cloaked = e => !!(e.def.cloaked || (e.stf & STF.cloaked) || (e.mode && e.def.modes[e.mode].cloak));

  function checksum(g) {
    let h = 2166136261 >>> 0;
    const mix = v => { h = Math.imul(h ^ (v | 0), 16777619) >>> 0; };
    const mixStr = str => { mix(str.length); for (let i = 0; i < str.length; i++) mix(str.charCodeAt(i)); };
    mixStr(g.map.id); mix(g.map.w); mix(g.map.h); mix(g.tick); mix(g.rng.s); mix(g.nextId); mix(g.winner);
    for (const p of g.players) { mix(p.team); mix(p.slot); mix(p.color); mix(p.out ? 1 : 0); mix(p.crystal); mix(p.nebula); mix(p.supplyUsed2); mix(p.supplyMax2); for (const id of UP_IDS) mix(p.up[id] || 0); }
    for (const e of g.ents) {
      mix(e.id); mix(e.owner); mix(e.x); mix(e.y); mix(e.hp); mix(e.shield);
      mix(e.cd ?? 0); mix(e.carry ?? 0); mix(e.carryKind ?? 0); mix(e.harvester ?? 0); mix(e.buildLeft ?? 0); mix(e.amount ?? 0);
      mix(e.lastHit); mix(e.lastBy); mix(e.rally ? e.rally.x : 0); mix(e.rally ? e.rally.y : 0);
      mix(e.larva ?? 0); mix(e.larvaT ?? 0); mix(e.builder ?? 0); mix(e.queue ? e.queue.length : 0);
      mixStr(e.type); mix(e.addon ?? 0); mix(e.main ?? 0);
      mix(e.cd2 ?? 0); mix(e.hangar ?? 0); mix(e.lt ?? 0); mix(e.parent ?? 0);
      if (e.morph) { mixStr(e.morph.to); mix(e.morph.left); } else mix(0);
      if (e.queue) for (const q of e.queue) { mixStr(q.research || q.what); mix(q.left); }
      mix(e.tx ?? -1); mix(e.ty ?? -1); mix((e.lifted ? 1 : 0) | (e.unpowered ? 2 : 0));
      mix(e.energy); mix(e.ccd); mixStr(e.auto); mix(e.stf); mix(e.inside); mixStr(e.mode); mix(e.modeT); mixStr(e.modeTo); mix(e.life); mix(e.free ? 1 : 0); mix(e.still); mix(e.kills); mix(e.lastById);
      if (e.order) { // order 전 필드(키 삽입 순서는 생성 코드가 고정 → 결정론)
        mix(1);
        for (const k in e.order) { const v = e.order[k]; mixStr(k); if (typeof v === 'string') mixStr(v); else mix(v === true ? 1 : v === false ? 0 : (v ?? 0)); }
      } else mix(0);
    }
    mix(g.fx.length);
    for (const f of g.fx) { mix(f.id); mixStr(f.kind); mixStr(f.ab); mix(f.owner); mix(f.x); mix(f.y); mix(f.r); mix(f.left); mix(f.tgt); mix(f.drain); mix(f.delay); mix(f.src); }
    // fog는 위치의 순수 함수이며 매 틱 재계산되므로 해시하지 않는다(체크섬 비용 절감).
    for (let i = 0; i < g.map.creep.length; i++) mix(g.map.creep[i]);
    return h;
  }

  function makeMap(m) {
    const W = m.w ?? 128, H = m.h ?? 128, rock = new Uint8Array(W * H); // 맵 크기 생략 시 128×128
    for (const [x, y, w, h] of m.rocks)
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) rock[(y + j) * W + x + i] = 1;
    return { w: W, h: H, rock, occ: new Int32Array(W * H), creep: new Uint8Array(W * H),
      starts: m.starts.map((s, i) => ({ tx: s.tx, ty: s.ty, flip: s.flip ?? (i ? 3 : 0) })) }; // flip: 자리 방향(mapSites 와 같은 기본값)
  }

  // 자원 사이트 [기준 tx, ty, flip, rich(크리스탈 양 2배)]: 모든 시작(기준점은 starts[0], 빈 자리 포함) 다음에 확장 순서대로.
  // flip: 0 그대로, 1 가로(x) 거울, 2 세로(y) 거울, 3 둘 다(180°). 기본값: 시작 첫째 0·나머지 3, 확장은 mirror ? 3 : 0.
  function mapSites(m) {
    const s0 = m.starts[0];
    return [...m.starts.map((s, i) => [s0.tx, s0.ty, s.flip ?? (i ? 3 : 0), false]),
      ...m.expansions.map(e => [e.tx, e.ty, e.flip ?? (e.mirror ? 3 : 0), !!e.rich])];
  }

  // 사각형 (x, y, w, h)을 flip 변환한 좌상단 [x, y]. x 거울 W-x-w, y 거울 H-y-h.
  function placeRect(g, x, y, w, h, flip) {
    return [flip & 1 ? g.map.w - x - w : x, flip & 2 ? g.map.h - y - h : y];
  }

  function crystalTiles(g, sx, sy, flip) {
    const out = [];
    for (let i = 0; i < 4; i++) out.push([sx - 6, sy - 1 + i]);   // 좌측 세로열
    for (let i = 0; i < 4; i++) out.push([sx - 4 + 2 * i, sy - 6]); // 상단 가로열
    return out.map(([x, y]) => placeRect(g, x, y, 2, 1, flip));
  }

  // 분출구 사이트: 크리스탈 좌측 열 바로 아래(2×2). flip 변환은 placeRect(2×2). 시작지 자유 영역·통로와 겹치지 않음.
  const VENT_OFF = [-6, 3];

  function setOcc(g, e, id) {
    const w = e.def.w, h = e.def.h;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) g.map.occ[(e.ty + j) * g.map.w + e.tx + i] = id;
  }

  // 건물 풋프린트 안(중심 타일) 지상 유닛을 가장 가까운 빈 타일 중심으로 밀어낸다(occ 설정 후 호출)
  function pushOut(g, b) {
    for (const u of g.ents) {
      if (u.isB || u.isR || u.inside || airy(u) || inGas(u)) continue;
      const tx = Math.floor(u.x / TFP), ty = Math.floor(u.y / TFP);
      if (tx < b.tx || ty < b.ty || tx >= b.tx + b.def.w || ty >= b.ty + b.def.h) continue;
      const i = nearestOpen(g, tx, ty);
      if (i >= 0) { u.x = (i % g.map.w) * TFP + (TFP >> 1); u.y = Math.floor(i / g.map.w) * TFP + (TFP >> 1); }
    }
  }

  function recountSupply(g) {
    const max = g.players.map(() => 0);
    for (const e of g.ents) {
      if (e.owner < 0 || e.buildLeft > 0) continue;
      max[e.owner] += e.def.provides || 0;
    }
    g.players.forEach((pl, i) => { pl.supplyMax2 = Math.min(400, max[i] * 2); });
  }

  // ponytail: 전체 재계산, 점막 퍼짐 애니메이션은 렌더에서
  function recomputeCreep(g) {
    const cr = g.map.creep, W = g.map.w, H = g.map.h;
    cr.fill(0);
    for (const b of g.ents) {
      if (!b.isB || !b.def.creep || b.buildLeft > 0) continue;
      const r2 = 2 * b.def.creep, cx2 = 2 * b.tx + b.def.w, cy2 = 2 * b.ty + b.def.h;
      for (let ty = Math.max(0, b.ty - b.def.creep - 1); ty <= Math.min(H - 1, b.ty + b.def.h + b.def.creep); ty++)
        for (let tx = Math.max(0, b.tx - b.def.creep - 1); tx <= Math.min(W - 1, b.tx + b.def.w + b.def.creep); tx++) {
          const dx = 2 * tx + 1 - cx2, dy = 2 * ty + 1 - cy2; // 타일 중심, 2배 좌표
          if (dx * dx + dy * dy <= r2 * r2) cr[ty * W + tx] = 1;
        }
    }
  }

  // x,y: 유닛/크리스탈은 단위 좌표(중심), 건물은 좌상단 타일 (tx,ty).
  function spawn(g, owner, type, x, y, done = true, reserved = false) { // reserved: 생산 큐가 보급을 이미 차감함
    const isC = type === 'crystal', isV = type === 'vent', isR = isC || isV; // isR: 중립 자원(수정/분출구)
    const def = isC ? { id: 'crystal', hp: 1, w: 2, h: 1 } : (D.units[type] || D.buildings[type]);
    const isB = !isR && !!D.buildings[type];
    const e = { id: g.nextId++, owner, type, def, isB, x, y, px: x, py: y, hp: 0, shield: 0,
      hpMax: def.hp * FP, shieldMax: (def.shield || 0) * FP, order: null, path: null, cd: 0, carry: 0,
      buildLeft: 0, queue: [], rally: null, larva: 0, larvaT: 0, lastHit: -9999, lastBy: -1, isR, carryKind: 0, harvester: 0,
      addon: 0, main: 0, morph: null, cd2: 0, hangar: 0, lt: 0, parent: 0, // lt: 함재기 생산 남은 틱, parent: 함재기 부모 id
      // 3a: energy 마나(FP), ccd 시전 쿨다운, auto 자동 시전 능력 id, stf 상태 플래그(매 틱 g.fx에서 재계산), inside 탑승 수송선 id,
      // mode/modeT/modeTo 잠복·포격 모드(현재·전환 남은 틱·전환 목표), life 시간제한(소환, 0 = 없음)
      energy: def.energy ? def.energy.start * FP : 0, ccd: 0, auto: (def.abilities || []).find(a => D.abilities[a].autocast) || '',
      stf: 0, inside: 0, mode: '', modeT: 0, modeTo: '', life: 0, free: false, // free: 소환(보급 없음 → 사망 시 반환도 없음)
      still: 0, kills: 0, lastById: 0 }; // still: 자동 모드(정박) 정지 누적 틱, kills: 처치 수(마이셀 변이), lastById: 마지막 가해 엔티티 id(0 = 없음·마법)
    if (isB || isR) {
      e.tx = x; e.ty = y;
      e.x = x * TFP + (def.w * TFP >> 1); e.y = y * TFP + (def.h * TFP >> 1);
      e.px = e.x; e.py = e.y;
    }
    if (isR) { e.amount = isV ? def.amount : 1875; e.hpMax = 0; }
    if (isB && !done) { e.buildLeft = def.time; e.hp = Math.floor(e.hpMax / 10); }
    else { e.hp = e.hpMax; e.shield = e.shieldMax; }
    if (isB && def.larva && done) e.larva = 3;
    g.ents.push(e);
    if (isB || isR) setOcc(g, e, e.id);
    if (isB) pushOut(g, e);
    if (!isB && !isR && !reserved) g.players[owner].supplyUsed2 += Math.round((def.supply || 0) * 2);
    if (isB || def.provides) recountSupply(g);
    if (isB && done && def.creep) recomputeCreep(g);
    return e;
  }

  function createGame({ seed, races, players, map = 'crossing' }) {
    const md = D.maps[map], SITES = mapSites(md), mp = makeMap(md);
    if (!players) players = races.map((race, i) => ({ race, team: i, slot: i, color: i }));
    // 명단 검증(리플레이 파일이 들어오는 신뢰 경계): 인원 2~최대 인원(players, 생략 시 시작점 수), 종족 존재, slot 범위(시작점 수)·중복 없음
    if (!Array.isArray(players) || players.length < 2 || players.length > (md.players ?? md.starts.length) ||
      players.some(q => !q || typeof q.race !== 'string' || !Object.prototype.hasOwnProperty.call(D.races, q.race) || !Number.isInteger(q.slot) || q.slot < 0 || q.slot >= md.starts.length) ||
      new Set(players.map(q => q.slot)).size !== players.length) throw new Error('roster');
    const g = { tick: 0, rng: { s: seed | 0 }, nextId: 1,
      players: players.map(q => ({ race: q.race, team: q.team, slot: q.slot, color: q.color, out: false, crystal: 65, nebula: 0, supplyUsed2: 0, supplyMax2: 0, up: {} })),
      ents: [], map: mp, fog: [], det: [], winner: -1, fx: [] };
    const tf = new Map(); // 팀마다 안개 배열 하나, 팀원끼리 같은 객체(팀 시야 공유)
    for (const q of g.players) { if (!tf.has(q.team)) tf.set(q.team, new Uint8Array(mp.w * mp.h)); g.fog.push(tf.get(q.team)); }
    const td = new Map(); // 탐지 지도도 같은 방식(팀 공유)
    for (const q of g.players) { if (!td.has(q.team)) td.set(q.team, new Uint8Array(mp.w * mp.h)); g.det.push(td.get(q.team)); }
    g.map.id = map;
    for (const [sx, sy, flip, rich] of SITES)
      for (const [tx, ty] of crystalTiles(g, sx, sy, flip)) { const c = spawn(g, -1, 'crystal', tx, ty); if (rich) c.amount *= 2; }
    for (let p = 0; p < g.players.length; p++) {
      const race = D.races[g.players[p].race], st = g.map.starts[g.players[p].slot], b = spawn(g, p, race.base, st.tx, st.ty);
      race.start.forEach((u, i) => { // 시작 유닛: 본진 기준 (+1+2i, +6) 배치를 자리 flip 으로 뒤집는다(자리마다 같은 모양)
        const dx = 1 + (i % 4) * 2, dy = 6 + (i >> 2) * 2, x = st.flip & 1 ? st.tx + b.def.w - 1 - dx : st.tx + dx, y = st.flip & 2 ? st.ty + b.def.h - 1 - dy : st.ty + dy;
        spawn(g, p, u, x * TFP + (TFP >> 1), y * TFP + (TFP >> 1));
      });
    }
    for (const [sx, sy, flip] of SITES) { // 분출구는 마지막(기존 엔티티 id 유지)
      const vx = sx + VENT_OFF[0], vy = sy + VENT_OFF[1];
      spawn(g, -1, 'vent', ...placeRect(g, vx, vy, 2, 2, flip));
    }
    updateFog(g); // tick 0부터 시야가 보이도록
    return g;
  }

  function byId(g, id) {
    let lo = 0, hi = g.ents.length - 1; // ents는 id 오름차순
    while (lo <= hi) {
      const m = (lo + hi) >> 1, v = g.ents[m].id;
      if (v === id) return g.ents[m];
      if (v < id) lo = m + 1; else hi = m - 1;
    }
    return undefined;
  }

  function walkable(g, tx, ty) {
    const m = g.map;
    return tx >= 0 && ty >= 0 && tx < m.w && ty < m.h && !m.rock[ty * m.w + tx] && !m.occ[ty * m.w + tx];
  }

  // 목표가 막혀 있으면 가장 가까운(거리², 인덱스 작은 순) 열린 타일.
  function nearestOpen(g, gx, gy) {
    const W = g.map.w;
    if (walkable(g, gx, gy)) return gy * W + gx;
    let best = -1, bd = 0x7fffffff;
    for (let ty = 0; ty < g.map.h; ty++) for (let tx = 0; tx < W; tx++) {
      if (!walkable(g, tx, ty)) continue;
      const d = (tx - gx) * (tx - gx) + (ty - gy) * (ty - gy);
      if (d < bd) { bd = d; best = ty * W + tx; }
    }
    return best;
  }

  const NB = [[1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10], [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14]];

  // 길찾기 버퍼: 맵 크기별로 재사용. 세대 번호로 초기화 생략 — seen[i] === gen 이면 gs[i] 유효, done[i] === gen 이면 닫힘.
  let PF = null;
  // 타일 좌표 입력, 타일 인덱스(ty*w+tx) 배열 반환: 시작 제외, 목표 포함. 경로 없으면 [].
  function findPath(g, sx, sy, gx, gy) {
    const goal = nearestOpen(g, gx, gy);
    if (goal < 0) return [];
    const W = g.map.w, goalX = goal % W, goalY = (goal - goalX) / W, start = sy * W + sx;
    if (start === goal) return [];
    const N = W * g.map.h;
    if (!PF || PF.n !== N) PF = { n: N, gen: 0, gs: new Int32Array(N), hs: new Int32Array(N), from: new Int32Array(N), seen: new Int32Array(N), done: new Int32Array(N) };
    if (++PF.gen > 0x7ffffffe) { PF.gen = 1; PF.seen.fill(0); PF.done.fill(0); }
    const { gs, hs, from, seen, done, gen } = PF;
    const gAt = i => seen[i] === gen ? gs[i] : 0x7fffffff;
    const heap = []; // 항목 [f, h, idx]; 정렬: f → h → idx
    const less = (p, q) => p[0] !== q[0] ? p[0] < q[0] : p[1] !== q[1] ? p[1] < q[1] : p[2] < q[2];
    const push = it => {
      let i = heap.push(it) - 1;
      while (i > 0) { const par = (i - 1) >> 1; if (!less(heap[i], heap[par])) break; [heap[i], heap[par]] = [heap[par], heap[i]]; i = par; }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1; let m = i;
          if (l < heap.length && less(heap[l], heap[m])) m = l;
          if (r < heap.length && less(heap[r], heap[m])) m = r;
          if (m === i) break;
          [heap[i], heap[m]] = [heap[m], heap[i]]; i = m;
        }
      }
      return top;
    };
    const oct = (x, y) => { const dx = Math.abs(x - goalX), dy = Math.abs(y - goalY); return 10 * (dx + dy) - 6 * Math.min(dx, dy); };
    gs[start] = 0; seen[start] = gen; hs[start] = oct(sx, sy); push([hs[start], hs[start], start]);
    while (heap.length) {
      const cur = pop()[2];
      if (done[cur] === gen) continue;
      done[cur] = gen;
      if (cur === goal) break;
      const cx = cur % W, cy = (cur - cx) / W;
      for (const [dx, dy, c] of NB) {
        const nx = cx + dx, ny = cy + dy;
        if (!walkable(g, nx, ny)) continue;
        if (dx && dy && (!walkable(g, cx + dx, cy) || !walkable(g, cx, cy + dy))) continue; // 코너 끊기 금지
        const ni = ny * W + nx;
        if (done[ni] === gen) continue;
        const ng = gs[cur] + c;
        if (ng < gAt(ni)) {
          gs[ni] = ng; seen[ni] = gen; from[ni] = cur; hs[ni] = oct(nx, ny);
          push([ng + hs[ni], hs[ni], ni]);
        }
      }
    }
    if (done[goal] !== gen) return [];
    const out = [];
    for (let i = goal; i !== start; i = from[i]) out.push(i);
    return out.reverse();
  }

  function issueMove(g, e, x, y) {
    let tx = Math.floor(x / TFP), ty = Math.floor(y / TFP);
    e.order = { type: 'move', x, y };
    e.path = null;
    if (airy(e)) return;
    const path = findPath(g, Math.floor(e.x / TFP), Math.floor(e.y / TFP), tx, ty);
    if (path.length) {
      const last = path[path.length - 1];
      const W = g.map.w;
      if (last !== ty * W + tx) { // 목표가 막혀 있어 가장 가까운 열린 타일로 대체
        e.order.x = (last % W) * TFP + (TFP >> 1); e.order.y = Math.floor(last / W) * TFP + (TFP >> 1);
      }
      e.path = path;
    }
  }

  // 마이셀 변이: 처치 수 → 단계(0/1/2), 단계별 방어력 보너스
  const MUT = D.races.swarm.mutation;
  const mutStage = e => e.kills >= MUT.at[1] ? 2 : e.kills >= MUT.at[0] ? 1 : 0;
  const mutArmor = t => { const k = t.kills ? mutStage(t) : 0; return k ? MUT.armor[k - 1] : 0; };

  // 레벨: 공격 = weapon.perLevel(없으면 카테고리 dmgPerLevel)×단계, 방어 = armorPerLevel×단계, 보호막 = shieldPerLevel×단계(보호막 피해만 차감)
  // div: 스플래시(1/2/4)·튕김(3/9) 감쇄 — 업그레이드 포함 기본 데미지를 나눈 뒤 보호막·방어 적용
  function calcDamage(w, t, atkLevel = 0, armorLevel = 0, shieldLevel = 0, div = 1) {
    const cu = CAT_UP[w.upgrade], au = CAT_UP[t.def.armorUpgrade], su = SHIELD_UP[t.def.race];
    let d = Math.floor((w.dmg + atkLevel * (w.perLevel ?? (cu && cu.effect.dmgPerLevel) ?? 1)) * FP / div), s = 0;
    if (t.stf & STF.marked) d += d >> 2; // 표식: 받는 피해 +25%
    if (t.shield > 0) {
      d = Math.max(0, d - shieldLevel * ((su && su.effect.shieldPerLevel) || 1) * FP);
      s = Math.min(t.shield, d); d -= s; if (d === 0) return { shield: s, hp: 0 };
    }
    const armor = t.def.armor + armorLevel * ((au && au.effect.armorPerLevel) || 1) + mutArmor(t);
    d = Math.floor((d - armor * FP) * D.DMG_MULT[w.type][t.def.size] / 100);
    return { shield: s, hp: Math.max(128, d) };
  }

  // type이 id 이거나 변태 계보(morphFrom)로 id에 닿는가: apexnest → grandnest → nest
  function reaches(type, id) {
    for (let t = type; t; t = D.buildings[t] && D.buildings[t].morphFrom) if (t === id) return true;
    return false;
  }
  function hasTech(g, owner, id) {
    return g.ents.some(b => b.owner === owner && b.isB && !(b.buildLeft > 0) && reaches(b.type, id));
  }
  const hasAll = (g, owner, reqs) => (reqs || []).every(r => hasTech(g, owner, r));
  // 변태 중·부속 건설 중·띄운 상태면 생산·연구 불가
  function busyB(g, b) {
    if (b.morph || b.lifted) return true;
    const a = b.addon ? byId(g, b.addon) : null;
    return !!a && a.buildLeft > 0;
  }
  // 띄우기 불가 사유: ''|'tech'(띄울 수 없는 건물·미완성·이미 떠 있음)|'busy'(변태 중·부속 건설 중)
  function canLift(g, player, b) {
    if (!b || !b.isB || b.owner !== player || !b.def.lift || b.lifted || b.buildLeft > 0) return 'tech';
    return busyB(g, b) ? 'busy' : '';
  }
  const addonOf = (g, b) => { const a = b.addon ? byId(g, b.addon) : null; return a && a.main === b.id ? a : null; };

  // 자원 부족 사유: '' | 'crystal' | 'nebula' (crystal 먼저)
  function shortOf(p, cost) {
    if (p.crystal < (cost.crystal || 0)) return 'crystal';
    if (p.nebula < (cost.nebula || 0)) return 'nebula';
    return '';
  }
  function pay(p, cost) { p.crystal -= cost.crystal || 0; p.nebula -= cost.nebula || 0; }

  // 훈련 불가 사유: ''(가능) | 'tech' | 'busy' | 'queue' | 'larva' | 'crystal' | 'nebula' | 'supply'
  // pend(선택): 아직 sim이 처리하지 않은 같은 틱 명령분 {crystal, nebula, supply2, n(이 건물에 쌓인 train 수)} — UI 전용
  function canTrain(g, player, b, what, pend) {
    const u = D.units[what], p = g.players[player], q = pend || {}, n = q.n || 0;
    if (!b || !u || !b.isB || b.owner !== player || b.buildLeft > 0 || !(b.def.trains || []).includes(what)) return 'tech';
    if (!hasAll(g, player, u.requires)) return 'tech';
    if (busyB(g, b)) return 'busy';
    if (b.def.larva) { if (b.larva - n < 1) return 'larva'; }
    else if (b.queue.length + n >= 5) return 'queue';
    const sh = shortOf({ crystal: p.crystal - (q.crystal || 0), nebula: p.nebula - (q.nebula || 0) }, u.cost); if (sh) return sh;
    if (p.supplyUsed2 + (q.supply2 || 0) + Math.round((u.supply || 0) * 2) * (u.count || 1) > p.supplyMax2) return 'supply';
    return '';
  }

  // 배치 불가 사유: ''|'tech'|'blocked'|'creep'|'power'|'crystal'|'nebula'|'vent'. 유닛은 막지 않음(rock/occ만).
  function canPlace(g, player, what, tx, ty, workerId) { // workerId: 유닛은 occ가 아니므로 자기 위치는 자동 무시
    const def = D.buildings[what], p = g.players[player];
    if (!def || def.race !== p.race || def.addonOf || def.morphFrom) return 'tech'; // 부속·변태 건물은 일꾼이 못 짓는다
    if (!hasAll(g, player, def.requires)) return 'tech';
    let vent = null;
    if (def.onVent) { // 분출구 위에만: 좌상단 정렬, 분출구 풋프린트가 건물 안에 있고 아직 비어(occ=분출구) 있어야 함
      for (const v of g.ents) if (v.type === 'vent' && v.tx === tx && v.ty === ty && v.tx + v.def.w <= tx + def.w && v.ty + v.def.h <= ty + def.h) { vent = v; break; }
      if (!vent || g.map.occ[ty * g.map.w + tx] !== vent.id) return 'vent';
    }
    for (let j = 0; j < def.h; j++) for (let i = 0; i < def.w; i++) {
      if (vent && i < vent.def.w && j < vent.def.h) continue;
      if (!walkable(g, tx + i, ty + j)) return 'blocked';
    }
    if (p.race === 'swarm' && what !== 'nest' && !def.onVent) {
      for (let j = 0; j < def.h; j++) for (let i = 0; i < def.w; i++) if (g.map.creep[(ty + j) * g.map.w + tx + i] !== 1) return 'creep';
    }
    if (p.race === 'elysian' && !inPower(g, player, what, tx, ty)) return 'power';
    return shortOf(p, def.cost);
  }

  // 엘리시안 레이 라인(§6 E2): 기둥 = 완성된 자기 power 건물(공명핵·조율 기둥). 성소·조율 기둥·가스 건물 외에는
  // 풋프린트 중심이 ① 기둥 power 반경 안이거나 ② link 타일 이내 두 기둥을 잇는 선분에서 width 타일 이내여야 한다.
  // 좌표는 반타일(×2) 정수, 판정은 정수 내적·외적 제곱 비교(제곱근·실수 없음) → 결정론.
  // 점 P가 선분 AB에서 r 이내인가(모두 정수). 투영이 선분 밖이면 가까운 끝점 거리, 안이면 cross² ≤ r²·|AB|².
  function nearSeg(px, py, ax, ay, bx, by, r) {
    const dx = bx - ax, dy = by - ay, vx = px - ax, vy = py - ay, len2 = dx * dx + dy * dy, t = vx * dx + vy * dy;
    if (t <= 0 || len2 === 0) return vx * vx + vy * vy <= r * r;
    if (t >= len2) { const wx = px - bx, wy = py - by; return wx * wx + wy * wy <= r * r; }
    const cr = vx * dy - vy * dx;
    return cr * cr <= r * r * len2;
  }
  // powerNet(g, p) → { pylons: [{ id, x2, y2, r2, link2, w2 }], links: [[i, j, w2]] } — 플레이어 p의 기둥·연결선(읽기 전용).
  // 기둥은 호출마다 g.ents에서 다시 훑는다(틱 중간 사망·완공도 즉시 반영). 연결 쌍 계산만 기둥 id 목록이 같을 때 재사용:
  // 캐시는 g.ents의 순수 함수(파생값)라 상태·체크섬에 넣지 않는다(WeakMap: 직렬화·복제에도 안 섞임). 반환값은 고치지 말 것.
  const netCache = new WeakMap();
  function powerNet(g, player) {
    let per = netCache.get(g); if (!per) netCache.set(g, per = []);
    const ps = []; let sig = '';
    for (const b of g.ents) if (b.isB && b.owner === player && b.def.power && !(b.buildLeft > 0) && b.hp > 0) { ps.push(b); sig += b.id + ','; }
    const c = per[player];
    if (c && c.sig === sig) return c;
    const pylons = ps.map(b => ({ id: b.id, x2: 2 * b.tx + b.def.w, y2: 2 * b.ty + b.def.h, r2: 2 * b.def.power, link2: 2 * (b.def.link || 0), w2: 2 * (b.def.width || 0) }));
    const links = [];
    for (let i = 0; i < pylons.length; i++) for (let j = i + 1; j < pylons.length; j++) {
      const a = pylons[i], b = pylons[j], L = Math.min(a.link2, b.link2), dx = a.x2 - b.x2, dy = a.y2 - b.y2;
      if (L > 0 && dx * dx + dy * dy <= L * L) links.push([i, j, Math.min(a.w2, b.w2)]);
    }
    return (per[player] = { sig, pylons, links });
  }
  // 그 net 안에서 what을 (tx, ty)에 두면 전력이 닿는가(풋프린트 중심 기준). 성소·조율 기둥·가스 건물·비엘리시안은 항상 true.
  function inNet(net, what, tx, ty) {
    const def = D.buildings[what];
    if (def.race !== 'elysian' || what === 'sanctum' || what === 'resonator' || def.onVent) return true;
    const cx = 2 * tx + def.w, cy = 2 * ty + def.h, P = net.pylons;
    for (const p of P) { const dx = cx - p.x2, dy = cy - p.y2; if (dx * dx + dy * dy <= p.r2 * p.r2) return true; }
    for (const [i, j, w] of net.links) if (nearSeg(cx, cy, P[i].x2, P[i].y2, P[j].x2, P[j].y2, w)) return true;
    return false;
  }
  const inPower = (g, player, what, tx, ty) => inNet(powerNet(g, player), what, tx, ty);
  const powered = (g, b) => inPower(g, b.owner, b.type, b.tx, b.ty);
  // 매 틱 엘리시안 건물 unpowered 갱신(생산·연구·공격 정지, 진행도 유지). 기둥 스캔은 플레이어당 1회.
  function power(g) {
    const nets = [];
    for (const b of g.ents) if (b.isB && b.def.race === 'elysian') b.unpowered = !inNet(nets[b.owner] || (nets[b.owner] = powerNet(g, b.owner)), b.type, b.tx, b.ty);
  }

  // 부속 불가 사유: ''|'tech'|'addon'|'busy'|'blocked'|'crystal'|'nebula'. 위치 = 본체 오른쪽 아래.
  function addonSpot(b, def) { return [b.tx + b.def.w, b.ty + b.def.h - def.h]; }
  function canAddon(g, player, b, what) {
    const def = D.buildings[what], p = g.players[player];
    if (!b || !def || !b.isB || b.owner !== player || b.buildLeft > 0 || def.addonOf !== b.type || def.race !== p.race) return 'tech';
    if (!hasAll(g, player, def.requires)) return 'tech';
    if (addonOf(g, b)) return 'addon';
    if (b.morph || b.lifted || b.queue.length) return 'busy';
    const [tx, ty] = addonSpot(b, def);
    for (let j = 0; j < def.h; j++) for (let i = 0; i < def.w; i++) if (!walkable(g, tx + i, ty + j)) return 'blocked';
    return shortOf(p, def.cost);
  }

  // 변태 불가 사유: ''|'tech'|'busy'|'crystal'|'nebula'(+유닛은 'supply'). 건물은 같은 자리·크기, 진행 중에도 하위 건물로서 기능.
  const supplyDiff = (to, from) => Math.round((to.supply || 0) * 2) - Math.round((from.supply || 0) * 2);
  function canMorph(g, player, b, what) {
    if (b && !b.isB && !b.isR) { // 유닛 변태: 같은 id로 고치 상태를 거쳐 결과 유닛이 된다
      const u = D.units[what], p = g.players[player];
      if (!u || b.owner !== player || !(b.hp > 0) || u.morphFrom !== b.type || !hasAll(g, player, u.requires)) return 'tech';
      if (b.morph || b.inside || b.mode || b.modeT > 0 || (b.order && b.order.type === 'constructing')) return 'busy';
      const sh = shortOf(p, u.cost);
      if (sh) return sh;
      return p.supplyUsed2 + supplyDiff(u, b.def) > p.supplyMax2 ? 'supply' : '';
    }
    const def = D.buildings[what], p = g.players[player];
    if (!b || !def || !b.isB || b.owner !== player || b.buildLeft > 0 || def.morphFrom !== b.type) return 'tech';
    if (!hasAll(g, player, def.requires)) return 'tech';
    if (b.morph || b.queue.some(q => q.research)) return 'busy';
    return shortOf(p, def.cost);
  }

  // 연구 불가 사유: ''|'crystal'|'nebula'|'tech'|'max'|'busy'|'queue'. 다음 단계 = 현재 단계 + 1.
  function canResearch(g, player, b, id) {
    const u = D.upgrades[id], p = g.players[player];
    if (!b || !u || !b.isB || b.owner !== player || b.buildLeft > 0 || !reaches(b.type, u.at)) return 'tech';
    const lv = p.up[id] || 0;
    if (lv >= u.levels) return 'max';
    for (const e of g.ents) if (e.owner === player && e.isB && e.queue.some(q => q.research === id)) return 'busy';
    if (!hasAll(g, player, u.requires && u.requires[lv])) return 'tech';
    if (busyB(g, b)) return 'busy';
    if (b.def.larva ? b.queue.some(q => q.research) : b.queue.length >= 5) return 'queue'; // 유충 건물은 연구 1개씩
    return shortOf(p, u.cost[lv]);
  }

  function enqueue(g, player, b, what) {
    if (canTrain(g, player, b, what)) return;
    const u = D.units[what], p = g.players[player];
    pay(p, u.cost);
    p.supplyUsed2 += Math.round((u.supply || 0) * 2) * (u.count || 1);
    if (b.def.larva) { if (b.larva === 3) b.larvaT = 0; b.larva--; }
    b.queue.push({ what, left: u.time });
  }

  // 건물 아래쪽(풋프린트 바로 아랫줄부터 바깥쪽)의 첫 빈 걷기 타일 중심. 아래·왼쪽 기준은 주인 시작 자리 flip 으로 뒤집는다
  // (y 거울 자리는 위쪽 줄, x 거울 자리는 오른쪽부터) — 자리마다 같은 모양이라 시작 위치 유불리가 없다.
  function spawnPoint(g, b, air) {
    const f = g.map.starts[g.players[b.owner].slot].flip, up = f & 2, rl = f & 1, dy = (b.def.h * TFP >> 1) + (TFP >> 1);
    if (air) return [b.x, up ? b.y - dy : b.y + dy];
    for (let r = 0; r < 8; r++) {
      const ty = up ? b.ty - 1 - r : b.ty + b.def.h + r;
      for (let k = 0; k < b.def.w + 2 * r; k++) {
        const tx = rl ? b.tx + b.def.w - 1 + r - k : b.tx - r + k;
        if (walkable(g, tx, ty)) return [tx * TFP + (TFP >> 1), ty * TFP + (TFP >> 1)];
      }
    }
    return [b.x, up ? b.y - dy : b.y + dy];
  }

  function finishTrain(g, b, what) {
    const u = D.units[what];
    for (let k = 0; k < (u.count || 1); k++) {
      const [x, y] = spawnPoint(g, b, u.air);
      const e = spawn(g, b.owner, what, x, y, true, true);
      if (b.rally) issueMove(g, e, b.rally.x, b.rally.y);
    }
  }

  function production(g, events) {
    for (const b of g.ents) {
      if (!b.isB || b.buildLeft > 0 || b.lifted || b.unpowered) continue;
      if (b.def.larva && b.larva < 3 && ++b.larvaT >= 220) { b.larva++; b.larvaT = 0; }
      if (!b.queue.length) continue;
      const act = b.def.larva ? b.queue.slice() : [b.queue[0]]; // 스웜은 전부 병렬
      for (const q of act) q.left--;
      b.queue = b.queue.filter(q => {
        if (q.left > 0) return true;
        if (q.research) { const p = g.players[b.owner]; p.up[q.research] = (p.up[q.research] || 0) + 1; events.push({ t: 'research', id: b.id, what: q.research, level: p.up[q.research] }); }
        else finishTrain(g, b, q.what);
        return false;
      });
    }
  }

  function applyCommands(g, cmds, events) {
    for (const c of cmds) {
      if (!(Number.isInteger(c.player) && c.player >= 0 && c.player < g.players.length) || g.players[c.player].out) continue; // 범위 밖·탈락자 명령 무시
      if (c.type === 'train') {
        for (const id of c.ids || []) { const b = byId(g, id); if (b && b.owner === c.player) enqueue(g, c.player, b, c.what); }
        continue;
      }
      if (c.type === 'gather') {
        const res = byId(g, c.target);
        const gas = !!res && res.isB && res.def.onVent && res.owner === c.player && !(res.buildLeft > 0);
        if (!res || (res.type !== 'crystal' && !gas)) continue;
        const units = commandable(g, c).filter(e => !e.isB);
        const movers = [];
        for (const e of units) {
          if (e.def.worker) {
            e.order = { type: 'gather', res: res.id, kind: gas ? 1 : 0, phase: e.carry > 0 ? 'back' : 'to', t: 0, moving: false, issued: false, x: res.x, y: res.y };
            e.path = null;
          } else movers.push(e);
        }
        if (movers.length) applyCommands(g, [{ player: c.player, type: 'move', ids: movers.map(e => e.id), x: res.x, y: res.y }]);
        continue;
      }
      if (c.type === 'research') {
        for (const id of c.ids || []) {
          const b = byId(g, id), p = g.players[c.player];
          if (canResearch(g, c.player, b, c.what)) continue;
          const u = D.upgrades[c.what], lv = p.up[c.what] || 0;
          pay(p, u.cost[lv]);
          b.queue.push({ research: c.what, left: u.time[lv] });
        }
        continue;
      }
      if (c.type === 'morph') {
        for (const id of c.ids || []) {
          const b = byId(g, id);
          if (canMorph(g, c.player, b, c.what)) continue;
          const def = b.isB ? D.buildings[c.what] : D.units[c.what];
          pay(g.players[c.player], def.cost);
          if (!b.isB) { g.players[c.player].supplyUsed2 += supplyDiff(def, b.def); b.order = null; b.path = null; }
          b.morph = { to: c.what, left: def.time };
        }
        continue;
      }
      if (c.type === 'merge') { // 같은 타입 둘씩 짝지어 서로 다가간다(홀수 남는 기는 무시)
        const by = {};
        for (const e of commandable(g, c)) if (!e.isB && !e.morph && mergeTo(e.type)) (by[e.type] = by[e.type] || []).push(e);
        for (const t of Object.keys(by).sort()) {
          const l = by[t];
          for (let i = 0; i + 1 < l.length; i += 2) {
            l[i].order = { type: 'merge', with: l[i + 1].id, ax: -1, ay: -1, moving: false }; l[i].path = null;
            l[i + 1].order = { type: 'merge', with: l[i].id, ax: -1, ay: -1, moving: false }; l[i + 1].path = null;
          }
        }
        continue;
      }
      if (c.type === 'build') {
        const e = byId(g, (c.ids || [])[0]);
        if (e && e.isB) { // 레기온 부속: 본체가 직접 짓는다(일꾼 없음)
          if (canAddon(g, c.player, e, c.what)) continue;
          const def = D.buildings[c.what], [tx, ty] = addonSpot(e, def);
          pay(g.players[c.player], def.cost);
          const a = spawn(g, c.player, c.what, tx, ty, false);
          a.main = e.id; e.addon = a.id;
          continue;
        }
        if (!canCommand(e, c.player) || e.isB || !e.def.worker) continue; // 건설 중(완성까지)·탑승·잠복 등은 무시
        if (canPlace(g, c.player, c.what, c.tx, c.ty, e.id)) continue;
        e.order = { type: 'build', what: c.what, tx: c.tx, ty: c.ty, issued: false, moving: false };
        e.path = null;
        continue;
      }
      if (c.type === 'repair') { // 레기온 엔지니어: 미완성 건물 건설 재개 또는 완성 기계(건물·mech 유닛) 수리
        const t = byId(g, c.target);
        if (!canRepair(g, c.player, t)) continue;
        for (const e of commandable(g, c)) {
          if (e === t || !e.def.worker || e.def.race !== 'legion') continue;
          e.order = { type: 'repair', target: t.id, issued: false, moving: false, acc: 0, ax: -1, ay: -1 };
          e.path = null;
        }
        continue;
      }
      if (c.type === 'lift') {
        for (const id of c.ids || []) {
          const b = byId(g, id);
          if (canLift(g, c.player, b)) continue;
          setOcc(g, b, 0); b.lifted = true; b.order = null;
          const a = addonOf(g, b); if (a) a.main = 0; // 부속은 남는다(미부착)
          b.addon = 0;
        }
        continue;
      }
      if (c.type === 'land') {
        for (const id of c.ids || []) {
          const b = byId(g, id);
          if (!b || b.owner !== c.player || !b.lifted) continue;
          b.order = { type: 'land', tx: c.tx | 0, ty: c.ty | 0, gx: (c.tx | 0) * TFP + (b.def.w * TFP >> 1), gy: (c.ty | 0) * TFP + (b.def.h * TFP >> 1), moving: true };
          b.path = null;
        }
        continue;
      }
      if (c.type === 'burrow' || c.type === 'unburrow' || c.type === 'siege' || c.type === 'unsiege') {
        const m = c.type.replace(/^un/, ''), on = m === c.type;
        const es = [];
        for (const id of c.ids || []) { const e = byId(g, id); if (e && !es.includes(e) && canMode(g, c.player, e, c.type) === '') es.push(e); }
        es.sort((a, b) => a.id - b.id);
        for (const e of es) { e.order = null; e.path = null; e.modeT = e.def.modes[m].time; e.modeTo = on ? m : ''; }
        continue;
      }
      if (c.type === 'cast') { // 선택된 시전 가능 유닛·건물 전부(id 순)가 각자 시전
        const A = D.abilities[c.what];
        if (!A) continue;
        const t = A.target === 'unit' ? byId(g, c.target) : null;
        const es = [];
        for (const id of c.ids || []) { const e = byId(g, id); if (e && !es.includes(e) && canCast(g, c.player, e, c.what) === '') es.push(e); }
        es.sort((a, b) => a.id - b.id);
        for (const e of es) {
          if (A.target === 'self') { if (!(e.ccd > 0)) cast(g, e, c.what, A, null, null, events); continue; } // 자기 대상(위장 등)은 즉시 — 하던 명령(이동 등)을 끊지 않는다
          if (A.target === 'unit' && !castTarget(g, e, A, t)) continue;
          e.order = { type: 'cast', what: c.what, target: c.target | 0, x: c.x | 0, y: c.y | 0, auto: false, issued: false, moving: false, ax: -1, ay: -1, gx: 0, gy: 0 };
          e.path = null;
        }
        continue;
      }
      if (c.type === 'autocast') {
        const A = D.abilities[c.what];
        if (!A || !A.autocast) continue;
        for (const id of c.ids || []) { const e = byId(g, id); if (e && e.owner === c.player && (e.def.abilities || []).includes(c.what)) e.auto = c.on ? c.what : ''; }
        continue;
      }
      if (c.type === 'load') {
        const tg = byId(g, c.target), us = commandable(g, c).filter(e => !e.isB && !airy(e));
        if (tg && tg.owner === c.player && tg.def.transport) {
          for (const e of us) { e.order = { type: 'board', target: tg.id, ax: -1, ay: -1, moving: false }; e.path = null; }
        } else if (tg && tg.owner === c.player && !tg.isB && !airy(tg) && !tg.inside) {
          const e = commandable(g, c).find(x => canCarry(g, c.player, x));
          if (e) { e.order = { type: 'pickup', target: tg.id, ax: -1, ay: -1, moving: false }; e.path = null; }
        }
        continue;
      }
      if (c.type === 'unload') {
        for (const e of commandable(g, c)) {
          if (!e.def.transport) continue;
          if (c.unit !== undefined) { const u = byId(g, c.unit); if (u && u.inside === e.id) drop(g, e, u); continue; }
          e.order = { type: 'unload', x: c.x | 0, y: c.y | 0, ax: -1, ay: -1, moving: false };
          pathTo(g, e, e.order.x, e.order.y);
        }
        continue;
      }
      if (c.type === 'surrender') { if (g.winner === -1) eliminate(g, c.player, events); continue; } // 팀원이 남으면 게임 계속
      if (c.type === 'setRally') {
        for (const id of c.ids || []) { const b = byId(g, id); if (b && b.isB && b.owner === c.player) b.rally = { x: c.x, y: c.y }; }
        continue;
      }
      if (c.type === 'stop' || c.type === 'hold') {
        for (const e of commandable(g, c)) { e.order = c.type === 'hold' ? { type: 'hold' } : null; e.path = null; }
        continue;
      }
      if (c.type === 'attack') {
        const t = byId(g, c.target);
        if (!t) continue;
        for (const e of commandable(g, c)) {
          if (!validTarget(g, e, t)) continue;
          e.order = { type: 'attack', target: t.id, auto: false, ax: -1, ay: -1, moving: false, resume: false };
          e.path = null;
        }
        continue;
      }
      if (c.type === 'move' || c.type === 'attackMove' || c.type === 'patrol') {
        formation(g, c, (e, x, y) => {
          if (c.type !== 'move' && (fighter(e) || (c.type === 'attackMove' && autoCaster(e)))) { // 자동 시전 유닛의 공격 이동 = 가며 시전
            e.order = { type: c.type, x, y, ox: e.x, oy: e.y, tgt: 0, ax: -1, ay: -1, moving: false, resume: false };
            e.path = null;
            pathTo(g, e, x, y);
          } else if (c.type !== 'patrol') issueMove(g, e, x, y);
        });
      }
    }
  }

  const autoMode = e => !!e.mode && !!e.def.modes[e.mode].auto; // 자동 정박: 명령·이동 시 즉시 해제되는 모드
  const mergeTo = type => Object.values(D.units).find(u => u.mergeFrom === type);
  const autoCaster = e => (e.def.abilities || []).some(a => D.abilities[a].autocast);
  // 명령 가능: 내 것·유닛(또는 띄운 건물)·고치/함재기/탑승/잠복·포격/모드 전환/건설 중 아님. ui.js도 같은 판정을 쓴다.
  const canCommand = (e, p) => !!e && e.owner === p && (!e.isB || e.lifted) && !(e.morph && !e.isB) && !e.parent && !e.inside && !(e.mode && !autoMode(e)) && !(e.modeT > 0) && !(e.order && e.order.type === 'constructing');
  function commandable(g, c) {
    const units = [];
    for (const id of c.ids || []) {
      const e = byId(g, id);
      if (canCommand(e, c.player) && !units.includes(e)) units.push(e); // 중복 id 제거
    }
    return units.sort((a, b) => a.id - b.id);
  }

  function formation(g, c, fn) {
    const units = commandable(g, c);
    const n = units.length;
    let w = isqrt(n); if (w * w < n) w++;
    const half = w >> 1;
    units.forEach((e, k) => fn(e, c.x + ((k % w) - half) * 24 * FP, c.y + (Math.floor(k / w) - half) * 24 * FP));
  }

  // 현재 order를 유지한 채 경로만 갱신(gx,gy = 실제 이동 목표)
  function pathTo(g, e, x, y) {
    const o = e.order;
    issueMove(g, e, x, y);
    o.gx = e.order.x; o.gy = e.order.y; o.moving = true;
    e.order = o;
  }

  // 사각형(타일 풋프린트)까지의 가장자리 거리² 비교: 중심에서 가장 가까운 점까지 거리 ≤ 반지름+4px
  function atEdge(e, r) {
    const x0 = r.tx * TFP, x1 = (r.tx + r.w) * TFP, y0 = r.ty * TFP, y1 = (r.ty + r.h) * TFP;
    const dx = Math.max(x0 - e.x, 0, e.x - x1), dy = Math.max(y0 - e.y, 0, e.y - y1);
    const lim = (e.def.radius + 20) * FP; // 인접 타일 중심(대각 ≈ 22.6px)에서 성립
    return dx * dx + dy * dy <= lim * lim;
  }
  const rectOf = e => ({ tx: e.tx, ty: e.ty, w: e.def.w, h: e.def.h });

  // 사각형 접근: 가장자리 도착이면 true. 이동이 끝났는데 근접 판정 실패면 명령 취소. 아직이면 이동 발행.
  function reach(g, e, r) {
    if (atEdge(e, r)) return true;
    const o = e.order;
    if (o.issued && !o.moving) { e.order = null; e.path = null; }
    else if (!o.issued) gotoRect(g, e, r);
    return false;
  }

  // 풋프린트에 인접한 가장 가까운(거리², 타일 인덱스 순) 걷기 가능 타일로 이동 명령.
  function gotoRect(g, e, r) {
    const wx = Math.floor(e.x / TFP), wy = Math.floor(e.y / TFP), W = g.map.w;
    let best = -1, bd = 0x7fffffff;
    for (let ty = r.ty - 1; ty <= r.ty + r.h; ty++) for (let tx = r.tx - 1; tx <= r.tx + r.w; tx++) {
      if (tx >= r.tx && tx < r.tx + r.w && ty >= r.ty && ty < r.ty + r.h) continue;
      if (!walkable(g, tx, ty)) continue;
      const d = (tx - wx) * (tx - wx) + (ty - wy) * (ty - wy);
      if (d < bd || (d === bd && ty * W + tx < best)) { bd = d; best = ty * W + tx; }
    }
    const o = e.order;
    o.issued = true;
    if (best < 0) { o.moving = false; return; }
    issueMove(g, e, (best % W) * TFP + (TFP >> 1), Math.floor(best / W) * TFP + (TFP >> 1));
    o.gx = e.order.x; o.gy = e.order.y; o.moving = true;
    e.order = o;
  }

  function removeCrystal(g, c) {
    const i = g.ents.indexOf(c);
    if (i >= 0) g.ents.splice(i, 1);
    setOcc(g, c, 0);
  }

  // 반경 10타일 안 가장 가까운 크리스탈 (거리², id 순)
  function nearbyCrystal(g, x, y) {
    let best = null, bd = (10 * TFP) * (10 * TFP);
    for (const c of g.ents) {
      if (c.type !== 'crystal' || c.amount <= 0) continue;
      const dx = c.x - x, dy = c.y - y, d = dx * dx + dy * dy;
      if (d <= bd && (!best || d < bd)) { best = c; bd = d; }
    }
    return best;
  }

  // ponytail: 한 크리스탈에 여러 일꾼 동시 채굴 허용, 대기열은 밸런스 문제 생기면
  function gathering(g) {
    const gone = []; // 고갈 수정: 순회 후 제거(순회 중 splice는 다음 엔티티를 건너뛴다)
    for (const e of g.ents) {
      const o = e.order;
      if (!o || o.type !== 'gather' || (e.stf & STF.stasis)) continue; // 결정 봉인: 채집 정지
      if (o.phase === 'to') {
        let c = byId(g, o.res);
        if (o.kind === 1) { // 가스: 건물이 사라졌으면 중단. 안에는 1기만.
          if (!c) { e.order = null; e.path = null; continue; }
          if (reach(g, e, rectOf(c))) {
            const h = c.harvester ? byId(g, c.harvester) : null;
            if (h && h !== e && h.order && h.order.type === 'gather' && h.order.phase === 'mine' && h.order.res === c.id) {
              o.moving = false; e.path = null; // 대기(인접 유지)
              continue;
            }
            c.harvester = e.id; o.phase = 'mine'; o.t = 40; o.moving = false; e.path = null; e.x = c.x; e.y = c.y;
          }
          continue;
        }
        if (!c || c.amount <= 0) {
          c = nearbyCrystal(g, o.x, o.y);
          if (!c) { e.order = null; e.path = null; continue; }
          o.res = c.id; o.x = c.x; o.y = c.y; o.issued = false; o.moving = false;
        }
        if (reach(g, e, rectOf(c))) { o.phase = 'mine'; o.t = 60; o.moving = false; e.path = null; }
      } else if (o.phase === 'mine') {
        if (--o.t > 0) { if (o.kind === 1) { const c = byId(g, o.res); if (c) { e.x = c.x; e.y = c.y; } } continue; }
        const c = byId(g, o.res);
        if (o.kind === 1) {
          if (c) {
            if (c.harvester === e.id) c.harvester = 0;
            const v = g.ents.find(q => q.type === 'vent' && q.tx === c.tx && q.ty === c.ty);
            if (v && v.amount > 0) { e.carry = Math.min(10, v.amount); v.amount -= e.carry; } else e.carry = 2;
            e.carryKind = 1;
          }
        } else if (c && c.amount > 0) {
          e.carryKind = 0;
          e.carry = Math.min(10, c.amount); c.amount -= e.carry;
          if (c.amount <= 0) gone.push(c);
        }
        o.phase = 'back'; o.issued = false; o.moving = false;
      } else { // back
        let best = null, bd = 0x7fffffffffff;
        for (const b of g.ents) {
          if (!b.isB || b.owner !== e.owner || !b.def.dropoff || b.buildLeft > 0 || b.lifted) continue;
          const dx = b.x - e.x, dy = b.y - e.y, d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = b; }
        }
        if (!best) { e.order = null; e.path = null; continue; }
        if (o.drop !== best.id) { o.drop = best.id; o.issued = false; } // 더 가까운 반납 건물이 생기면 재경로
        if (reach(g, e, rectOf(best))) {
          if (e.carryKind === 1) g.players[e.owner].nebula += e.carry; else g.players[e.owner].crystal += e.carry;
          e.carry = 0;
          o.phase = 'to'; o.issued = false; o.moving = false; e.path = null;
        }
      }
    }
    for (const c of gone) removeCrystal(g, c);
  }

  function construction(g, events) {
    for (const e of g.ents.slice()) { // 스웜 드러지는 배치 시 제거되므로 스냅샷 순회
      const o = e.order;
      if (!o || o.type !== 'build' || (e.stf & STF.stasis)) continue; // 결정 봉인: 배치 정지
      const def = D.buildings[o.what], r = { tx: o.tx, ty: o.ty, w: def.w, h: def.h };
      if (!reach(g, e, r)) continue;
      if (canPlace(g, e.owner, o.what, o.tx, o.ty, e.id)) { e.order = null; e.path = null; continue; }
      const p = g.players[e.owner];
      pay(p, def.cost);
      const b = spawn(g, e.owner, o.what, o.tx, o.ty, false);
      e.path = null;
      if (p.race === 'legion') { b.builder = e.id; e.order = { type: 'constructing', b: b.id }; }
      else if (p.race === 'swarm') { g.ents.splice(g.ents.indexOf(e), 1); p.supplyUsed2 -= Math.round((e.def.supply || 0) * 2); }
      else e.order = null;
    }
    for (const b of g.ents) {
      if (!b.isB || !(b.buildLeft > 0)) continue;
      if (b.builder) { // 레기온: 엔지니어가 살아 있고 이 건물에 묶여 있을 때만 진행
        const w = byId(g, b.builder);
        if (!w || !w.order || w.order.type !== 'constructing' || w.order.b !== b.id || (w.stf & STF.stasis)) continue; // 결정 봉인 중 건설 정지
      }
      b.buildLeft--;
      const t = b.def.time;
      b.hp = b.hpMax - Math.floor((b.hpMax - Math.floor(b.hpMax / 10)) * b.buildLeft / t);
      if (b.shieldMax) b.shield = b.shieldMax - Math.floor((b.shieldMax - Math.floor(b.shieldMax / 10)) * b.buildLeft / t);
      if (b.buildLeft > 0) continue;
      b.hp = b.hpMax; b.shield = b.shieldMax;
      if (b.builder) { const w = byId(g, b.builder); if (w) { w.order = null; w.path = null; } b.builder = 0; }
      if (b.def.larva) { b.larva = 3; b.larvaT = 0; }
      recountSupply(g);
      if (b.def.creep) recomputeCreep(g);
      events.push({ t: 'done', id: b.id });
    }
    for (const b of g.ents) { // 변태(건물·유닛): 완성 시 type 교체, hp·보호막 비율 유지
      if (!b.morph || --b.morph.left > 0) continue;
      const def = b.isB ? D.buildings[b.morph.to] : D.units[b.morph.to], hpMax = def.hp * FP, shMax = (def.shield || 0) * FP;
      b.hp = Math.floor(b.hp * hpMax / b.hpMax);
      if (b.shieldMax) b.shield = Math.floor(b.shield * shMax / b.shieldMax);
      b.type = def.id; b.def = def; b.hpMax = hpMax; b.shieldMax = shMax; b.morph = null;
      if (b.isB) {
        recountSupply(g);
        if (def.creep) recomputeCreep(g);
      } else {
        b.energy = def.energy ? Math.min(b.energy, energyMax(g, b)) : 0;
        b.auto = (def.abilities || []).find(a => D.abilities[a].autocast) || '';
      }
      events.push({ t: 'done', id: b.id });
    }
  }

  // 기계 유닛(레기온 차량·함선) = 수리 대상
  const mech = d => d.race === 'legion' && !!d.armorUpgrade && d.armorUpgrade !== 'legion_infantry_armor';
  // 수리/건설 재개 대상인가: 자기 레기온 건물·기계 유닛. 미완성이면 일꾼이 지은 건물(builder 기록 있음 — 부속은 본체가 지으므로 제외),
  // 완성이면 체력이 깎였을 때. (이미 다른 일꾼이 짓는 중이면 repairing()이 도착 후 취소한다.)
  function canRepair(g, player, t) {
    if (!t || t.owner !== player || !(t.isB ? t.def.race === 'legion' : mech(t.def))) return false;
    return t.buildLeft > 0 ? !!t.builder : t.hp < t.hpMax;
  }

  // 레기온 수리/건설 재개: 도착 후 미완성이면 builder 교체(constructing), 완성이면 틱당 hpMax/time 회복,
  // 비용 = 회복량/hpMax × 비용/3 (누적 acc 기준 올림 차분 → 총액 = 올림, 재명령으로 공짜 수리 불가). 자원 부족이면 중단.
  function repairing(g) {
    for (const e of g.ents) {
      const o = e.order;
      if (!o || o.type !== 'repair' || (e.stf & STF.stasis)) continue; // 결정 봉인: 수리 정지
      const t = byId(g, o.target);
      if (!t || t.hp <= 0 || t.owner !== e.owner || (!(t.buildLeft > 0) && t.hp >= t.hpMax)) { e.order = null; e.path = null; continue; }
      if (t.isB && !t.lifted) { if (!reach(g, e, rectOf(t))) continue; }
      else {
        const l = (unitRadius(e) + unitRadius(t) + 4) * FP;
        if (dist2(e, t) > l * l) { chase(g, e, o, t); continue; }
      }
      o.moving = false; e.path = null;
      if (t.buildLeft > 0) {
        const w = t.builder ? byId(g, t.builder) : null;
        if (w && w !== e && w.order && w.order.type === 'constructing' && w.order.b === t.id) { e.order = null; continue; } // 이미 짓는 중
        t.builder = e.id; e.order = { type: 'constructing', b: t.id };
        continue;
      }
      const h = Math.min(t.hpMax - t.hp, Math.ceil(t.hpMax / t.def.time)), acc = o.acc + h, cost = {}, p = g.players[e.owner];
      for (const k of ['crystal', 'nebula']) { const v = t.def.cost[k] || 0; cost[k] = Math.ceil(acc * v / (3 * t.hpMax)) - Math.ceil(o.acc * v / (3 * t.hpMax)); }
      if (shortOf(p, cost)) { e.order = null; continue; }
      pay(p, cost); t.hp += h; o.acc = acc;
      if (t.hp >= t.hpMax) e.order = null;
    }
  }

  // 띄운 건물 착륙: 목표 지점 도착 후 canPlace 배치 규칙(풋프린트 전부 걷기 가능) 충족 시 착륙, 아니면 공중에 남고 명령 취소
  function landing(g) {
    for (const b of g.ents) {
      const o = b.order;
      if (!b.lifted || !o || o.type !== 'land' || o.moving) continue;
      b.order = null;
      let ok = true;
      for (let j = 0; j < b.def.h && ok; j++) for (let i = 0; i < b.def.w; i++) if (!walkable(g, o.tx + i, o.ty + j)) { ok = false; break; }
      if (!ok) continue;
      b.tx = o.tx; b.ty = o.ty; b.x = b.tx * TFP + (b.def.w * TFP >> 1); b.y = b.ty * TFP + (b.def.h * TFP >> 1);
      b.lifted = false;
      setOcc(g, b, b.id); pushOut(g, b);
    }
  }

  const LIFT_SPEED = 1; // 띄운 건물 이동 속도(px/틱)
  function movement(g) {
    for (const e of g.ents) {
      const o = e.order;
      if (e.inside || (e.mode && !autoMode(e)) || e.modeT > 0 || (e.morph && !e.isB)) continue;
      if (!o || (o.type !== 'move' && !(o.moving && o.type !== 'constructing' && o.type !== 'hold'))) continue;
      if (e.stf & STF.rooted) continue; // 이동 불가 상태
      if (e.mode) { e.mode = ''; e.still = 0; } // 자동 정박 해제(지연 없음) 후 같은 틱에 이동
      const gth = o.type !== 'move';
      let speed = e.isB ? LIFT_SPEED * FP : Math.trunc(stat(g, e, 'speed') * FP);
      if (e.stf & STF.hasted) speed += speed >> 1;
      if (e.stf & STF.slowed) speed >>= 1;
      let tx = gth ? o.gx : o.x, ty = gth ? o.gy : o.y, wp = false;
      if (e.path && e.path.length > 1) { // 마지막 웨이포인트는 명령 지점 그대로
        tx = (e.path[0] % g.map.w) * TFP + (TFP >> 1); ty = Math.floor(e.path[0] / g.map.w) * TFP + (TFP >> 1); wp = true;
      }
      const dx = tx - e.x, dy = ty - e.y;
      const dist = isqrt(dx * dx + dy * dy);
      if (wp && dist <= TFP >> 2) e.path.shift(); // 중간 웨이포인트는 가까이만 가면 통과(분리가 밀어내 같은 점에 몰린 부대가 못 떠나는 것 방지)
      else if (dist <= speed) {
        e.x = tx; e.y = ty;
        if (wp) e.path.shift();
        else if (gth) { o.moving = false; e.path = null; } else { e.order = null; e.path = null; }
      } else { e.x += Math.trunc(dx * speed / dist); e.y += Math.trunc(dy * speed / dist); }
      if (e.lifted) { // 띄운 건물: 타일 좌표를 가장 가까운 정렬 위치로 따라간다(시야·렌더용)
        e.tx = Math.max(0, Math.min(g.map.w - e.def.w, Math.floor((e.x - (e.def.w * TFP >> 1) + (TFP >> 1)) / TFP)));
        e.ty = Math.max(0, Math.min(g.map.h - e.def.h, Math.floor((e.y - (e.def.h * TFP >> 1) + (TFP >> 1)) / TFP)));
      }
    }
  }

  // ponytail: O(n²), 유닛 수백 넘으면 공간 해시
  // 채집·건설·수리 중인 일꾼은 서로 통과한다(같은 줄을 오가는 일꾼끼리 정면으로 밀어 교착되는 것 방지 —
  // 채집 줄 옆 분출구로 건설하러 가는 일꾼이 반납하러 오는 일꾼과 y가 같으면 x축으로만 밀려 영원히 멈췄다).
  const WORK = { gather: 1, build: 1, constructing: 1, repair: 1 };
  const ghost = e => !!e.order && !!e.def.worker && WORK[e.order.type] === 1;
  const inGas = e => !!e.order && e.order.type === 'gather' && e.order.kind === 1 && e.order.phase === 'mine'; // 가스 건물 안
  function separation(g) {
    const ents = g.ents;
    for (let i = 0; i < ents.length; i++) {
      const a = ents[i];
      if (a.isB || a.isR || a.inside || a.def.air || inGas(a)) continue;
      for (let j = i + 1; j < ents.length; j++) {
        const b = ents[j];
        if (b.isB || b.isR || b.inside || b.def.air || inGas(b)) continue;
        if (ghost(a) && ghost(b)) continue;
        const dx = b.x - a.x, dy = b.y - a.y, rs = (a.def.radius + b.def.radius) * FP;
        const d = isqrt(dx * dx + dy * dy);
        if (d >= rs) continue;
        // d=0(완전 겹침)이면 x축으로만 민다
        const push = (rs - d) >> 1;
        const mx = d === 0 ? push : Math.trunc(dx * push / d), my = d === 0 ? 0 : Math.trunc(dy * push / d);
        const ax = a.x - mx, ay = a.y - my, bx = b.x + mx, by = b.y + my;
        if (walkable(g, Math.floor(ax / TFP), Math.floor(ay / TFP))) { a.x = ax; a.y = ay; }
        if (walkable(g, Math.floor(bx / TFP), Math.floor(by / TFP))) { b.x = bx; b.y = by; }
      }
    }
  }

  const unitRadius = t => t.isB ? Math.min(t.def.w, t.def.h) * 16 : t.def.radius;
  // 무기 대상 플래그: ground 기본 true, air 기본 false
  const airy = e => !!(e.def.air || e.lifted); // 공중 판정: 공중 유닛 + 띄운 건물
  const canHit = (w, t) => !!w && (airy(t) ? !!w.air : w.ground !== false);
  const fighter = e => !!(weaponOf(e, 'weapon') || e.def.weapon2 || e.def.launcher);
  // 대상에 쓸 무기 키: 'weapon' 우선, 'weapon2', 함재기 부모는 자식 무기로 판정 'launcher'. 없으면 null.
  function pickW(e, t) {
    const L = e.def.launcher;
    if (L) return canHit(D.units[L.child].weapon, t) ? 'launcher' : null;
    return canHit(weaponOf(e, 'weapon'), t) ? 'weapon' : canHit(e.def.weapon2, t) ? 'weapon2' : null;
  }
  const isEnemy = (g, a, b) => a >= 0 && b >= 0 && a !== b && g.players[a].team !== g.players[b].team;
  const validTarget = (g, e, t) => !!t && t.hp > 0 && isEnemy(g, e.owner, t.owner) && !t.isR && !(t.stf & STF.stasis) && !hidden(g, e.owner, t) && !t.inside && !!pickW(e, t);
  const dist2 = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; };
  const rangeLim = (g, e, t, wk) => ((wk === 'launcher' ? e.def.launcher.range : stat(g, e, 'range', wk)) + unitRadius(e) + unitRadius(t)) * FP;
  const inRange = (g, e, t) => { const wk = pickW(e, t); if (!wk) return false; const l = rangeLim(g, e, t, wk); return dist2(e, t) <= l * l; };
  const inSight = (g, e, t) => { const l = stat(g, e, 'sight') * TFP; return dist2(e, t) <= l * l; };

  // 플레이어 p 시점에서 e가 보이는가. 건물은 발자국 타일 중 하나라도 2, 유닛은 중심 타일. 중립 수정은 항상 보임.
  const detected = (g, p, e) => !!(e.stf & STF.detected) || g.det[p][Math.floor(e.y / TFP) * g.map.w + Math.floor(e.x / TFP)] === 1;
  const hidden = (g, p, e) => e.owner >= 0 && p >= 0 && isEnemy(g, p, e.owner) && cloaked(e) && !detected(g, p, e);
  function visible(g, p, e) {
    if (e.owner < 0) return true;
    if (!e.isB && (e.inside || hidden(g, p, e))) return false;
    const f = g.fog[p], W = g.map.w;
    if (!e.isB) return f[Math.floor(e.y / TFP) * W + Math.floor(e.x / TFP)] === 2;
    for (let j = 0; j < e.def.h; j++) for (let i = 0; i < e.def.w; i++) if (f[(e.ty + j) * W + e.tx + i] === 2) return true;
    return false;
  }

  function updateFog(g) {
    const W = g.map.w, H = g.map.h;
    for (const f of new Set(g.fog)) for (let i = 0; i < f.length; i++) if (f[i] === 2) f[i] = 1;
    for (const e of g.ents) {
      if (e.owner < 0 || !e.def.sight || e.inside) continue;
      const f = g.fog[e.owner], r = stat(g, e, 'sight'), r2 = r * r;
      const cx = Math.floor(e.x / TFP), cy = Math.floor(e.y / TFP);
      for (let dy = -r; dy <= r; dy++) {
        const y = cy + dy; if (y < 0 || y >= H) continue;
        for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx; if (x < 0 || x >= W || dx * dx + dy * dy > r2) continue;
          f[y * W + x] = 2;
        }
      }
    }
    for (const fx of g.fx) { // 지점 일시 시야(위성 스캔)
      if (fx.kind !== 'reveal' || fx.delay > 0) continue;
      const f = g.fog[fx.owner], r = fx.r, r2 = r * r, cx = Math.floor(fx.x / TFP), cy = Math.floor(fx.y / TFP);
      for (let dy = -r; dy <= r; dy++) {
        const y = cy + dy; if (y < 0 || y >= H) continue;
        for (let dx = -r; dx <= r; dx++) {
          const x = cx + dx; if (x < 0 || x >= W || dx * dx + dy * dy > r2) continue;
          f[y * W + x] = 2;
        }
      }
    }
    for (const f of new Set(g.det)) f.fill(0);
    const mark = (f, x0, y0, r) => {
      const r2 = r * r;
      for (let dy = -r; dy <= r; dy++) {
        const y = y0 + dy; if (y < 0 || y >= H) continue;
        for (let dx = -r; dx <= r; dx++) {
          const x = x0 + dx; if (x < 0 || x >= W || dx * dx + dy * dy > r2) continue;
          f[y * W + x] = 1;
        }
      }
    };
    for (const e of g.ents) {
      if (e.owner < 0 || !e.def.detector || !(e.hp > 0) || e.inside) continue;
      if (e.isB && (e.buildLeft > 0 || e.unpowered)) continue;
      if (e.def.detectReq && !g.players[e.owner].up[e.def.detectReq]) continue;
      mark(g.det[e.owner], Math.floor(e.x / TFP), Math.floor(e.y / TFP), e.def.detector === true ? stat(g, e, 'sight') : e.def.detector);
    }
    for (const fx of g.fx) if (fx.kind === 'reveal' && !(fx.delay > 0) && D.abilities[fx.ab].effect.detect) mark(g.det[fx.owner], Math.floor(fx.x / TFP), Math.floor(fx.y / TFP), fx.r);
  }

  // 자동 대상 등급(낮을수록 우선): 0 대공 공격 유닛·방어 건물, 1 지상만 공격, 2 비공격 공중, 3 비공격 지상(일꾼 포함), 4 건물.
  // 공격 등급(0·1)은 t 가 공격자 e 를 때릴 수 있을 때만 — 못 때리면(지상 공격자 앞의 대공 전용 건물 등) 비공격 등급으로
  function tier(t, e) {
    if (fighter(t) && !t.def.worker && pickW(t, e)) {
      const L = t.def.launcher, w = L ? D.units[L.child].weapon : weaponOf(t, 'weapon');
      return (w && w.air) || (!L && t.def.weapon2 && t.def.weapon2.air) ? 0 : 1;
    }
    return t.isB ? 4 : airy(t) ? 2 : 3;
  }

  // 자동 대상: 등급(tier) → 거리² → id 순. near(t): 사거리(hold·건물)/시야/부모 사거리(함재기) 조건.
  // 판정 순서는 싼 것부터(전부 부작용 없는 판정이라 결과는 validTarget → near → visible 순과 같다)
  function acquire(g, e, near) {
    let best = null, bt = 5, bd = Infinity;
    for (const t of g.ents) {
      if (!(t.hp > 0) || t.isR || (t.stf & STF.stasis) || !isEnemy(g, e.owner, t.owner)) continue;
      if (!near(t)) continue;
      if (!pickW(e, t)) continue;
      if (!visible(g, e.owner, t)) continue;
      const k = tier(t, e);
      if (k > bt) continue;
      const d = dist2(e, t);
      if (k < bt || d < bd) { bt = k; bd = d; best = t; }
    }
    return best;
  }

  function chase(g, e, o, t) {
    const far = Math.abs(t.x - o.ax) >= 2 * TFP || Math.abs(t.y - o.ay) >= 2 * TFP;
    if (o.moving && !far) return;
    if (t.isB && !o.moving && o.ax === t.x && o.ay === t.y) { // 건물: 경로 끝에서 사거리 밖이면 중심으로 직진
      e.path = null; o.gx = t.x; o.gy = t.y; o.moving = true;
    } else pathTo(g, e, t.x, t.y);
    o.ax = t.x; o.ay = t.y;
  }

  // 적 판정(스플래시·튕김 대상): 중립 자원 제외, 그 무기 플래그로 공중/지상
  const foeFor = (g, e, w, o) => isEnemy(g, e.owner, o.owner) && !o.isR && !o.inside && o.hp > 0 && canHit(w, o);

  function hurt(g, e, w, t, div) {
    if (t.stf & STF.stasis) return; // 결정 봉인: 피해 면역
    const tp = g.players[t.owner];
    const dm = calcDamage(w, t, catLevel(g, e.owner, w.upgrade), catLevel(g, t.owner, t.def.armorUpgrade), upLevel(tp, SHIELD_UP[t.def.race]), div);
    t.shield -= dm.shield; t.hp -= dm.hp; t.lastHit = g.tick; t.lastBy = e.owner; t.lastById = e.id;
  }

  // 한 발: 주 대상 + 스플래시(반경 1/3 100%, 2/3 50%, 그 밖 25%) + 튕김(96px, 1/3·1/9) + 자폭
  function strike(g, e, w, t, events) {
    hurt(g, e, w, t, 1);
    events.push(w.splash ? { t: 'attack', a: e.id, b: t.id, splash: true } : { t: 'attack', a: e.id, b: t.id });
    if (w.splash) {
      const r2 = (w.splash * FP) * (w.splash * FP);
      for (const o of g.ents) {
        if (o === t || !foeFor(g, e, w, o)) continue;
        const d = dist2(o, t);
        if (d > r2) continue;
        hurt(g, e, w, o, 9 * d <= r2 ? 1 : 9 * d <= 4 * r2 ? 2 : 4);
      }
    }
    if (w.bounce) {
      const hit = [t.id], lim = (96 * FP) * (96 * FP);
      let prev = t, div = 1;
      for (let k = 0; k < w.bounce; k++) {
        let best = null, bd = Infinity;
        for (const o of g.ents) {
          if (hit.includes(o.id) || !foeFor(g, e, w, o)) continue;
          const d = dist2(o, prev);
          if (d <= lim && d < bd) { bd = d; best = o; }
        }
        if (!best) break;
        div *= 3;
        hurt(g, e, w, best, div);
        events.push({ t: 'attack', a: e.id, b: best.id });
        hit.push(best.id); prev = best;
      }
    }
    if (w.suicide) { e.hp = 0; e.lastBy = -1; } // 자폭 자신의 사망은 처치 아님
  }

  // 사거리 안이면 사격(무기별 쿨다운) 또는 함재기 사출(틱당 1기)
  function fire(g, e, wk, t, events) {
    if (wk === 'launcher') {
      if (e.hangar <= 0) return;
      e.hangar--;
      const c = spawn(g, e.owner, e.def.launcher.child, e.x, e.y, true, true);
      c.parent = e.id;
      c.order = { type: 'attack', target: t.id, auto: true, ax: -1, ay: -1, moving: false, resume: false };
      return;
    }
    const ck = wk === 'weapon2' ? 'cd2' : 'cd';
    if (e[ck] !== 0) return;
    strike(g, e, weaponOf(e, wk), t, events);
    e[ck] = stat(g, e, 'cooldown', wk);
  }

  function engage(g, e, o, t, ty, events) {
    const wk = pickW(e, t), l = rangeLim(g, e, t, wk);
    if (dist2(e, t) <= l * l) {
      if (ty !== 'hold') { o.moving = false; e.path = null; if (ty !== 'attack') o.resume = true; }
      fire(g, e, wk, t, events);
    } else if (ty !== 'hold') {
      if (ty !== 'attack') o.resume = true;
      chase(g, e, o, t);
    }
  }

  const CHILD_LINGER = 30;
  // 함재기 자식: 부모 사거리 안 대상만(부모 대상 우선), 없으면 귀환
  function childAI(g, e, events) {
    const p = byId(g, e.parent);
    if (!p) return;
    const ok = t => validTarget(g, e, t) && inRange(g, p, t);
    let o = e.order, t = o && o.type === 'attack' ? byId(g, o.target) : null;
    if (!ok(t)) {
      const po = p.order, pid = po ? (po.type === 'attack' ? po.target : po.tgt || 0) : 0, pt = pid ? byId(g, pid) : null;
      t = ok(pt) ? pt : acquire(g, e, ok);
    }
    if (t) {
      if (!o || o.type !== 'attack' || o.target !== t.id) { o = e.order = { type: 'attack', target: t.id, auto: true, ax: -1, ay: -1, moving: false, resume: false }; e.path = null; }
      engage(g, e, o, t, 'attack', events);
    } else { // 대상 없음: CHILD_LINGER 틱 제자리 대기(재교전 여지) 후 귀환
      if (!o || (o.type !== 'linger' && o.type !== 'return')) { o = e.order = { type: 'linger', wait: CHILD_LINGER }; e.path = null; }
      if (o.type === 'linger' && --o.wait > 0) return;
      if (o.type !== 'return') { o = e.order = { type: 'return', ax: -1, ay: -1, moving: false }; e.path = null; }
      chase(g, e, o, p);
    }
  }

  // 함재기 부모: hangar + 출격 중 < max 이면 비용을 내고 build 틱마다 1기 (보급 없음)
  function launchers(g) {
    for (const e of g.ents) {
      const L = e.def.launcher;
      if (!L || e.isB || (e.stf & STF.stasis)) continue; // 결정 봉인: 함재기 생산 정지
      if (e.lt > 0 && --e.lt === 0) e.hangar++;
      if (e.lt > 0) continue;
      let out = 0;
      for (const c of g.ents) if (c.parent === e.id) out++;
      const p = g.players[e.owner];
      if (e.hangar + out < L.max && !shortOf(p, L.cost)) { pay(p, L.cost); e.lt = L.build; }
    }
  }

  // 귀환한 자식 격납(ents에서 제거, 부모 hangar++)
  function docking(g) {
    const gone = [];
    for (const e of g.ents) {
      if (!e.parent || !e.order || e.order.type !== 'return' || e.hp <= 0) continue;
      const p = byId(g, e.parent);
      if (!p || p.hp <= 0) continue;
      const l = (unitRadius(p) + e.def.radius + 4) * FP;
      if (dist2(e, p) <= l * l) { p.hangar++; gone.push(e); }
    }
    if (gone.length) g.ents = g.ents.filter(e => !gone.includes(e));
  }

  function combat(g, events) {
    for (const e of g.ents) {
      if (e.isR || e.inside || !fighter(e)) continue;
      if (e.cd > 0) e.cd--;
      if (e.cd2 > 0) e.cd2--;
      if (e.modeT > 0 || (e.morph && !e.isB)) continue; // 모드 전환·유닛 변태(고치) 중엔 공격 불가
      if (e.stf & STF.disarmed) continue; // 공격 불가 상태
      if (e.isB || (e.mode && !autoMode(e))) { // 방어 건물·모드 중(잠복·포격): hold처럼 사거리 안 자동 사격, 이동 없음. 미완성·공명장 밖이면 정지.
        if (e.isB && (e.buildLeft > 0 || e.unpowered)) continue;
        const t = acquire(g, e, t => inRange(g, e, t));
        if (t) fire(g, e, pickW(e, t), t, events);
        continue;
      }
      if (e.parent) { childAI(g, e, events); continue; }
      let o = e.order, ty = o ? o.type : null, t = null;
      if (ty && ty !== 'attack' && ty !== 'attackMove' && ty !== 'patrol' && ty !== 'hold') continue;
      if (ty === 'attack') {
        t = byId(g, o.target);
        if (!validTarget(g, e, t) || (o.auto && !inSight(g, e, t))) { t = null; e.order = null; e.path = null; o = null; ty = null; }
      }
      if (!t && !e.def.worker) {
        const cur = o && o.tgt ? byId(g, o.tgt) : null;
        const sl = stat(g, e, 'sight') * TFP, sl2 = sl * sl; // inSight 와 같은 값, 후보마다 다시 구하지 않는다
        const near = ty === 'hold' || e.mode ? x => inRange(g, e, x) : x => dist2(e, x) <= sl2; // 정박 중: 사거리 안만(추격하지 않음)
        t = cur && validTarget(g, e, cur) && near(cur) ? cur : acquire(g, e, near);
        if (!ty && t) { o = e.order = { type: 'attack', target: t.id, auto: true, ax: -1, ay: -1, moving: false, resume: false }; ty = 'attack'; }
        else if (o && ty !== 'hold') o.tgt = t ? t.id : 0;
      }
      if (!t) {
        if (ty === 'attackMove' || ty === 'patrol') {
          if (o.resume) { o.resume = false; pathTo(g, e, o.x, o.y); }
          else if (!o.moving) {
            if (ty === 'attackMove') { e.order = null; e.path = null; }
            else { const nx = o.ox, ny = o.oy; o.ox = o.x; o.oy = o.y; o.x = nx; o.y = ny; pathTo(g, e, o.x, o.y); }
          }
        }
        continue;
      }
      engage(g, e, o, t, ty, events);
    }
  }

  // ── 3a: 수송 ──
  const SLOTS = { small: 1, medium: 2, large: 4 };
  const canCarry = (g, p, t) => !!t && t.owner === p && !!t.def.transport && (!t.def.transportReq || !!g.players[p].up[t.def.transportReq]);
  const cargo = (g, t) => g.ents.filter(e => e.inside === t.id);
  // 태울 수 있는가: ''|'tech'(수송선 아님·남의 것·공중/건물/탑승 중/고치·모드(자동 정박 제외)·결정 봉인 유닛)|'research'|'space'
  function canLoad(g, p, t, u) {
    if (!t || !u || t.owner !== p || u.owner !== p || !t.def.transport || t.inside || !(t.hp > 0) || !(u.hp > 0)) return 'tech';
    if (u === t || u.isB || u.isR || airy(u) || u.inside || u.morph || (u.mode && !autoMode(u)) || u.modeT > 0) return 'tech'; // 자동 정박은 태울 수 있다(load 가 해제)
    if ((u.stf | t.stf) & STF.stasis) return 'tech'; // 결정 봉인: 태우기·구출 불가
    if (t.def.transportReq && !g.players[p].up[t.def.transportReq]) return 'research';
    let used = 0;
    for (const c of cargo(g, t)) used += SLOTS[c.def.size];
    return used + SLOTS[u.def.size] > t.def.transport ? 'space' : '';
  }
  function load(g, t, u) { u.inside = t.id; u.order = null; u.path = null; u.x = t.x; u.y = t.y; u.mode = ''; u.still = 0; } // 자동 정박 해제
  function drop(g, t, u) {
    u.inside = 0; u.order = null; u.path = null;
    const i = nearestOpen(g, Math.floor(t.x / TFP), Math.floor(t.y / TFP));
    if (i >= 0) { u.x = (i % g.map.w) * TFP + (TFP >> 1); u.y = Math.floor(i / g.map.w) * TFP + (TFP >> 1); } else { u.x = t.x; u.y = t.y; }
    u.px = u.x; u.py = u.y;
  }
  function transports(g) {
    for (const e of g.ents) {
      const o = e.order;
      if (!o || e.inside) continue;
      if (o.type === 'unload') {
        if (o.moving) continue;
        for (const u of cargo(g, e)) drop(g, e, u);
        e.order = null; e.path = null;
      } else if (o.type === 'board' || o.type === 'pickup') {
        const t = byId(g, o.target), boarding = o.type === 'board', c = boarding ? t : e, u = boarding ? e : t;
        if (!t || !(t.hp > 0) || t.inside || !c || !u || !canCarry(g, e.owner, c) || t.owner !== e.owner) { e.order = null; e.path = null; continue; }
        const l = (e.def.radius + t.def.radius + 16) * FP;
        if (dist2(e, t) <= l * l) {
          if (canLoad(g, e.owner, c, u) === '') load(g, c, u);
          else { e.order = null; e.path = null; }
        } else if (!o.moving && o.ax >= 0 && Math.abs(t.x - o.ax) < 2 * TFP && Math.abs(t.y - o.ay) < 2 * TFP) { // 도착했는데 닿지 못함
          if (boarding && airy(c)) { if (!c.order) { c.order = { type: 'pickup', target: e.id, ax: -1, ay: -1, moving: false }; c.path = null; } } // 공중 수송선이 막힌 땅 위 → 수송선이 데리러 온다(탈 유닛은 기다림)
          else { e.order = null; e.path = null; }
        }
        else chase(g, e, o, t);
      }
    }
    for (const e of g.ents) if (e.inside) { const t = byId(g, e.inside); if (t) { e.x = t.x; e.y = t.y; } }
  }

  // ── 3a: 잠복·포격 모드 ──
  // 켜기('burrow'|'siege')·끄기('unburrow'|'unsiege') 가능 여부: ''|'tech'|'research'|'busy'
  function canMode(g, p, e, cmd) {
    const m = cmd.replace(/^un/, ''), on = m === cmd, d = e && e.def.modes && e.def.modes[m];
    if (!e || !d || d.auto || e.owner !== p || !(e.hp > 0) || e.isB || e.buildLeft > 0) return 'tech'; // auto 모드는 명령 없음
    if (on && d.requires && !g.players[p].up[d.requires]) return 'research';
    if (e.inside || e.morph || e.modeT > 0 || (on ? e.mode !== '' : e.mode !== m)) return 'busy';
    return '';
  }
  const AUTO_KEY = new Map(); // def → 자동 모드 키('' = 없음), def 당 한 번 계산
  const autoKey = def => { let k = AUTO_KEY.get(def); if (k === undefined) { k = Object.keys(def.modes).find(m => def.modes[m].auto) || ''; AUTO_KEY.set(def, k); } return k; };
  function modes(g) {
    for (const e of g.ents) {
      if (e.modeT > 0 && --e.modeT === 0) e.mode = e.modeTo;
      const md = e.def.modes;
      if (!md || e.isB || e.mode) continue;
      // 자동 정박: 이 틱에 움직이지 않았고 이동할 명령이 없으면 still 누적 → time틱이면 정박(무기 교체)
      const m = autoKey(e.def), d = m && md[m], o = e.order;
      if (!d) continue;
      const moving = !!o && (o.type === 'move' || o.moving);
      if (e.inside || e.morph || e.modeT > 0 || moving || e.x !== e.px || e.y !== e.py || (d.requires && !g.players[e.owner].up[d.requires])) { e.still = 0; continue; }
      if (++e.still >= d.time) { e.mode = m; e.still = 0; }
    }
  }

  // ── 3a: 합체 ── 작은 id 쪽이 판정: 닿으면 둘이 사라지고 중점에 결과 유닛이 고치 상태로 생긴다(사망 아님).
  function merging(g, events) {
    const gone = [], born = [];
    for (const e of g.ents) {
      const o = e.order;
      if (!o || o.type !== 'merge') continue;
      const t = byId(g, o.with), r = mergeTo(e.type);
      if (!t || t === e || !r || t.type !== e.type || !(t.hp > 0) || !(e.hp > 0) || t.inside || t.morph || t.mode || t.modeT > 0 || !t.order || t.order.type !== 'merge' || t.order.with !== e.id) { e.order = null; e.path = null; continue; }
      if (e.id > t.id || ((e.stf | t.stf) & STF.stasis)) continue; // 결정 봉인: 둘 다 대기
      const l = (e.def.radius + t.def.radius + 4) * FP;
      if (dist2(e, t) <= l * l) born.push([e, t, r]);
      else { chase(g, e, o, t); chase(g, t, t.order, e); }
    }
    for (const [a, b] of born) { gone.push(a, b); for (const x of [a, b]) if (!x.free) g.players[a.owner].supplyUsed2 -= Math.round((x.def.supply || 0) * 2); }
    if (gone.length) g.ents = g.ents.filter(e => !gone.includes(e));
    for (const [a, b, r] of born) {
      const n = spawn(g, a.owner, r.id, Math.floor((a.x + b.x) / 2), Math.floor((a.y + b.y) / 2));
      n.morph = { to: n.type, left: r.time };
      events.push({ t: 'merge', a: a.id, b: b.id, id: n.id });
    }
  }

  // ── 3a: 시전 ──
  const toggled = (g, e, what) => g.fx.some(f => f.ab === what && f.tgt === e.id);
  // 시전 불가 사유: ''|'tech'(남의 것·능력 없음)|'research'|'busy'(탑승·고치·잠복·포격·모드 전환 중)|'energy'. 켜진 토글 끄기는 마나 무관.
  function canCast(g, player, e, what) {
    const A = D.abilities[what];
    if (!e || !A || e.owner !== player || !(e.hp > 0) || e.buildLeft > 0 || !(e.def.abilities || []).includes(what)) return 'tech';
    if (A.requires && !g.players[player].up[A.requires]) return 'research';
    if (e.inside || e.morph || e.mode || e.modeT > 0) return 'busy'; // 잠복·포격 중 시전 불가
    if (A.toggle && toggled(g, e, what)) return ''; // 켜진 토글 끄기는 결정 봉인 중에도 가능(마나 소모를 멈출 수 있게)
    if (e.stf & STF.stasis) return 'busy'; // 결정 봉인 중 시전 불가
    return e.energy < A.cost * FP ? 'energy' : '';
  }
  // unit 대상 조건: 살아 있음·탑승 아님·결정 봉인 아님·filter(ally-bio = 같은 팀 지상 생체 유닛, 자신 제외 / ally = 같은 팀 비건물 유닛, 자신 포함 / enemy / any)
  function castTarget(g, e, A, t) {
    if (!t || !(t.hp > 0) || t.isR || t.inside || (t.stf & STF.stasis)) return false;
    const f = A.filter || 'any';
    if (f === 'enemy') return isEnemy(g, e.owner, t.owner) && !hidden(g, e.owner, t);
    if (f === 'ally') return t.owner >= 0 && !isEnemy(g, e.owner, t.owner) && !t.isB;
    if (f === 'ally-bio') return t.owner >= 0 && !isEnemy(g, e.owner, t.owner) && !t.isB && !airy(t) && !mech(t.def) && t !== e;
    return true;
  }
  const needs = (A, t) => !(A.effect.kind === 'instant' && A.effect.heal) || t.hp < t.hpMax; // 치료는 다친 대상만
  // delay: 지점 효과가 시작하기 전 남은 틱(그동안 적용 없음, left도 줄지 않음)
  const addFx = (g, kind, ab, owner, x, y, r, left, tgt, drain, delay = 0, src = 0) => g.fx.push({ id: g.nextId++, kind, ab, owner, x, y, r, left, tgt, drain, delay, src });
  // 마법 피해(방어력 무시): 결정 봉인 면역, 표식 +25%, 보호막 먼저
  function spellHit(g, u, d, by) {
    if (u.stf & STF.stasis) return;
    if (u.stf & STF.marked) d += d >> 2;
    const s = Math.min(u.shield, d); u.shield -= s; u.hp -= d - s; u.lastHit = g.tick; u.lastBy = by; u.lastById = 0; // 마법 처치는 변이 귀속 없음
  }
  // 플레이어 p 팀 시야(보임)에 지점이 있는가(needVis)
  const seen = (g, p, x, y) => { const tx = Math.floor(x / TFP), ty = Math.floor(y / TFP); return tx >= 0 && ty >= 0 && tx < g.map.w && ty < g.map.h && g.fog[p][ty * g.map.w + tx] === 2; };

  // 시전 순간: 마나 차감·쿨다운·효과 생성·이벤트. 켜진 토글이면 그 인스턴스만 제거(비용 없음).
  function cast(g, e, what, A, o, t, events) {
    const ef = A.effect, self = A.target === 'self', tid = t ? t.id : self ? e.id : 0;
    const x = t ? t.x : self ? e.x : o.x, y = t ? t.y : self ? e.y : o.y;
    if (A.toggle) { const i = g.fx.findIndex(f => f.ab === what && f.tgt === tid); if (i >= 0) { g.fx.splice(i, 1); return; } }
    e.energy -= A.cost * FP; e.ccd = A.cooldown || 0;
    const u = t || e;
    if (ef.kind === 'instant') {
      if (ef.heal) u.hp = Math.min(u.hpMax, u.hp + ef.heal * FP);
      if (ef.dmg) spellHit(g, u, ef.dmg * FP, e.owner);
      if (ef.energy && u.def.energy) u.energy = Math.max(0, Math.min(energyMax(g, u), u.energy + ef.energy * FP));
      if (ef.cleanse) g.fx = g.fx.filter(f => !(f.kind === 'status' && f.tgt === u.id && isEnemy(g, f.owner, u.owner))); // 적이 건 상태만 제거
      if (ef.burnEnergy && u.def.energy) { const d = u.energy; u.energy = 0; if (d > 0) spellHit(g, u, d, e.owner); } // 마나 1 = 피해 1
      if (ef.drainEnergy && u.def.energy) { // 피해 없이 마나를 빼앗아 시전자 주변 같은 팀 마나 유닛에 id 순 균등 분배(나머지는 작은 id부터, 최대치 초과분 소멸)
        const d = u.energy, sh = ef.share; u.energy = 0;
        if (sh && d > 0) {
          const r = sh.r * TFP, to = g.ents.filter(a => a !== u && a.def.energy && !a.isB && !a.inside && a.owner >= 0 && a.hp > 0 && !(a.stf & STF.stasis)
            && !isEnemy(g, e.owner, a.owner) && (!sh.race || a.def.race === sh.race) && dist2(a, e) <= r * r).sort((a, b) => a.id - b.id);
          const q = to.length ? Math.floor(d / to.length) : 0, rem = to.length ? d % to.length : 0;
          to.forEach((a, i) => { a.energy = Math.min(energyMax(g, a), a.energy + q + (i < rem ? 1 : 0)); });
        }
      }
    } else if (ef.kind === 'status') {
      const f = g.fx.find(f => f.kind === 'status' && f.ab === what && f.tgt === tid);
      if (f) f.left = ef.left; else addFx(g, 'status', what, e.owner, x, y, 0, ef.left, tid, ef.drain || 0, 0, e.id);
    } else if (ef.kind === 'area_dot' || ef.kind === 'zone') addFx(g, ef.kind, what, e.owner, x, y, ef.r * FP, ef.left, 0, 0, ef.delay || 0);
    else if (ef.kind === 'reveal') addFx(g, 'reveal', what, e.owner, x, y, ef.r, ef.left, 0, 0, ef.delay || 0);
    else if (ef.kind === 'aura') addFx(g, 'aura', what, e.owner, e.x, e.y, ef.r * FP, ef.left, e.id, ef.drain || 0);
    else if (ef.kind === 'summon') {
      let sx = x, sy = y;
      if (!D.units[ef.unit].air) { const i = nearestOpen(g, Math.floor(x / TFP), Math.floor(y / TFP)); if (i >= 0 && i !== Math.floor(y / TFP) * g.map.w + Math.floor(x / TFP)) { sx = (i % g.map.w) * TFP + (TFP >> 1); sy = Math.floor(i / g.map.w) * TFP + (TFP >> 1); } }
      for (let k = 0; k < ef.count; k++) { const u = spawn(g, e.owner, ef.unit, sx, sy, true, true); u.life = ef.life; u.free = true; } // 보급 없음
    }
    events.push({ t: 'cast', id: e.id, what, x, y, tgt: tid });
  }

  // id 순: 쿨다운 감소 → (명령 없음·위치 사수·공격 이동 + 자동 시전) 가장 가까운 대상 → cast 명령 처리(사거리까지 이동 후 시전)
  // 자동 시전 범위: 명령 없음·공격 이동 = 시야, 위치 사수 = 시전 사거리(움직이지 않음). 끝나면 원래 명령(rt·rx·ry)으로 돌아간다.
  function casting(g, events) {
    for (const e of g.ents) {
      if (e.ccd > 0) e.ccd--;
      if (e.morph && !e.isB) continue; // 고치는 시전 불가
      if (e.order && e.order.type === 'attackMove' && !e.order.moving && !fighter(e)) { e.order = null; e.path = null; } // 무기 없는 시전 유닛의 공격 이동 도착
      const o0 = e.order, rt = !o0 ? '' : o0.type === 'hold' || o0.type === 'attackMove' ? o0.type : null;
      if (rt !== null && e.auto && canCast(g, e.owner, e, e.auto) === '') {
        const A = D.abilities[e.auto], l = stat(g, e, 'sight') * TFP, l2 = l * l;
        let best = null, bd = Infinity;
        if (A.target === 'unit') for (const t of g.ents) {
          if (!castTarget(g, e, A, t) || !needs(A, t)) continue;
          const d = dist2(e, t);
          if (rt === 'hold') { const r = (A.range + unitRadius(e) + unitRadius(t)) * FP; if (d > r * r) continue; }
          if (d <= l2 && d < bd) { bd = d; best = t; }
        }
        if (best) e.order = { type: 'cast', what: e.auto, target: best.id, x: 0, y: 0, auto: true, issued: false, moving: false, ax: -1, ay: -1, gx: 0, gy: 0,
          rt, rx: rt === 'attackMove' ? o0.x : 0, ry: rt === 'attackMove' ? o0.y : 0 };
      }
      const o = e.order;
      if (!o || o.type !== 'cast') continue;
      const A = D.abilities[o.what], drop = () => {
        e.order = null; e.path = null;
        if (o.rt === 'hold') e.order = { type: 'hold' };
        else if (o.rt === 'attackMove') { e.order = { type: 'attackMove', x: o.rx, y: o.ry, ox: e.x, oy: e.y, tgt: 0, ax: -1, ay: -1, moving: false, resume: false }; pathTo(g, e, o.rx, o.ry); }
      };
      const t = A.target === 'unit' ? byId(g, o.target) : null;
      if (A.target === 'unit' && (!castTarget(g, e, A, t) || !needs(A, t))) { drop(); continue; }
      let ok = A.range === 0 || A.target === 'self';
      if (!ok) { const l = (A.range + unitRadius(e) + (t ? unitRadius(t) : 0)) * FP, dx = (t ? t.x : o.x) - e.x, dy = (t ? t.y : o.y) - e.y; ok = dx * dx + dy * dy <= l * l; }
      if (!ok) {
        if (e.isB || o.rt === 'hold') drop(); // 건물·위치 사수 자동 시전은 움직이지 않는다
        else if (t) chase(g, e, o, t);
        else if (!o.issued) { o.issued = true; pathTo(g, e, o.x, o.y); }
        else if (!o.moving) drop(); // 도착했는데도 사거리 밖
        continue;
      }
      o.moving = false; e.path = null;
      if (e.ccd > 0) continue;
      if (canCast(g, e.owner, e, o.what)) { drop(); continue; }
      if (A.needVis && A.target === 'point' && !seen(g, e.owner, o.x, o.y)) { drop(); continue; } // 지점이 팀 시야 밖
      cast(g, e, o.what, A, o, t, events);
      if (!(A.repeat && t && castTarget(g, e, A, t) && needs(A, t))) drop();
    }
  }

  // 지속 효과: ① 대상 따라가기(대상 소멸·사망·탑승이면 제거) ② stf 재계산 ③ 범위 지속 피해(같은 마법 비중첩)
  // ④ 마나 지속 소모 ⑤ 마나 재생 ⑥ 시간제한 유닛 ⑦ 남은 틱(-1 = 무기한)
  function effects(g) {
    g.fx = g.fx.filter(f => {
      if (!f.tgt) return true;
      const t = byId(g, f.tgt);
      if (!t || !(t.hp > 0) || t.inside) return false;
      f.x = t.x; f.y = t.y; return true;
    });
    for (const e of g.ents) e.stf = 0;
    // zone 쪽 플래그: all.flag | (적이면 enemy, 아니면 ally).flag
    const side = (ef, f, u) => isEnemy(g, f.owner, u.owner) ? ef.enemy : ef.ally;
    const zoneFl = (f, u) => { const ef = D.abilities[f.ab].effect, s = side(ef, f, u); return (STF[ef.all && ef.all.flag] || 0) | (STF[s && s.flag] || 0); };
    const inArea = (f, u) => !u.isB && !u.isR && !u.inside && u.owner >= 0 && dist2(u, f) <= f.r * f.r;
    // ① status 전부 + zone의 결정 봉인 먼저 ② aura·zone 나머지 플래그(결정 봉인 유닛은 범위 효과 면역) ③ 결정 봉인 = 이동·공격 불가
    for (const f of g.fx) {
      if (f.delay > 0) continue;
      if (f.kind === 'status') { const t = f.tgt && byId(g, f.tgt); if (t) t.stf |= STF[D.abilities[f.ab].effect.flag] || 0; }
      else if (f.kind === 'zone') for (const u of g.ents) if (inArea(f, u)) u.stf |= zoneFl(f, u) & STF.stasis;
    }
    for (const f of g.fx) {
      if (f.delay > 0) continue;
      if (f.kind === 'aura') {
        const fl = STF[D.abilities[f.ab].effect.flag] || 0;
        for (const u of g.ents) if (inArea(f, u) && !(u.stf & STF.stasis) && !isEnemy(g, f.owner, u.owner)) u.stf |= fl;
      } else if (f.kind === 'zone') for (const u of g.ents) if (inArea(f, u) && !(u.stf & STF.stasis)) u.stf |= zoneFl(f, u);
    }
    for (const e of g.ents) if (e.stf & STF.stasis) e.stf |= STF.rooted | STF.disarmed;
    const hit = new Set(); // 이번 틱 '능력|대상' — 같은 마법 범위 효과 중첩 금지
    for (const f of g.fx) {
      if ((f.kind !== 'area_dot' && f.kind !== 'zone') || f.delay > 0) continue;
      const ef = D.abilities[f.ab].effect, per = v => Math.floor(v * FP / ef.left), r2 = f.r * f.r;
      for (const u of g.ents) {
        if (u.isB || u.isR || u.inside || u.owner < 0 || !(u.hp > 0) || dist2(u, f) > r2 || (u.stf & STF.stasis)) continue;
        const k = f.ab + '|' + u.id;
        if (hit.has(k)) continue;
        hit.add(k);
        if (f.kind === 'area_dot') { spellHit(g, u, per(ef.dmg), f.owner); continue; } // 아군 포함 전원, 방어력 무시
        // zone: 총량을 left로 나눠 틱마다. 적 쪽 shield·energy는 깎고, 아군 쪽은 채운다
        const en = isEnemy(g, f.owner, u.owner), s = en ? ef.enemy : ef.ally;
        if (!s || (s.mech && !mech(u.def))) continue;
        if (s.dmg) spellHit(g, u, per(s.dmg), f.owner);
        if (s.heal) u.hp = Math.min(u.hpMax, u.hp + per(s.heal));
        if (s.shield) { if (en) { u.shield = Math.max(0, u.shield - per(s.shield)); u.lastHit = g.tick; u.lastBy = f.owner; u.lastById = 0; } else u.shield = Math.min(u.shieldMax || 0, u.shield + per(s.shield)); }
        if (s.energy && u.def.energy) u.energy = en ? Math.max(0, u.energy - per(s.energy)) : Math.min(energyMax(g, u), u.energy + per(s.energy));
      }
    }
    g.fx = g.fx.filter(f => {
      const t = f.drain && f.tgt ? byId(g, f.tgt) : null;
      if (!t) return true;
      if (t.energy < f.drain) return false;
      t.energy -= f.drain; return true;
    });
    for (const e of g.ents) if (e.def.energy && e.hp > 0 && !(e.buildLeft > 0)) e.energy = Math.min(energyMax(g, e), e.energy + ENERGY_REGEN);
    for (const e of g.ents) if (e.life > 0 && --e.life === 0) { e.hp = 0; e.lastBy = -1; }
    g.fx = g.fx.filter(f => f.delay > 0 ? (f.delay--, true) : !(f.left > 0 && --f.left === 0));
  }

  // 코러스 공명: 반경 r타일 안 같은 종류·같은 주인 유닛 수(자신 제외, cap까지). 버킷 = r타일 칸, 3×3 칸만 본다.
  const RES = D.races.elysian.resonance;
  function resBuckets(g) {
    const B = new Map(), cw = RES.r * TFP;
    for (const e of g.ents) {
      if (e.isB || e.inside || !(e.hp > 0) || e.owner < 0 || e.def.race !== 'elysian' || !e.shieldMax) continue;
      const k = Math.floor(e.x / cw) * 4096 + Math.floor(e.y / cw);
      const l = B.get(k); if (l) l.push(e); else B.set(k, [e]);
    }
    return B;
  }
  function resonance(B, e) {
    const cw = RES.r * TFP, r2 = cw * cw, cx = Math.floor(e.x / cw), cy = Math.floor(e.y / cw);
    let n = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const l = B.get((cx + dx) * 4096 + cy + dy);
      if (l) for (const o of l) if (o !== e && o.type === e.type && o.owner === e.owner && dist2(o, e) <= r2 && ++n >= RES.cap) return n;
    }
    return n;
  }
  function regen(g) {
    const res = g.tick % 20 === 0 ? resBuckets(g) : null;
    for (const e of g.ents) {
      if (e.owner < 0 || e.hp <= 0 || e.buildLeft > 0) continue;
      if (e.shieldMax && e.shield < e.shieldMax && g.tick % 20 === 0) {
        const n = res && !e.isB && !e.inside && e.def.race === 'elysian' ? resonance(res, e) : 0;
        const add = (g.tick - e.lastHit >= 100 ? 1 : 0) + Math.floor(n / RES.per); // 공명: 전투 중에도
        if (add) e.shield = Math.min(e.shieldMax, e.shield + add * FP);
      }
      if (e.def.race === 'swarm' && e.hp < e.hpMax && g.tick % 40 === 0) e.hp = Math.min(e.hpMax, e.hp + (!e.isB && mutStage(e) === 2 ? MUT.regen2 : 1) * FP);
      if (e.isB && e.def.race === 'legion' && e.hp * 3 <= e.hpMax && g.tick % 20 === 0) e.hp -= FP; // 화재(0 → deaths에서 파괴)
    }
  }

  function deaths(g, events) {
    for (const e of g.ents) if (e.owner >= 0 && g.players[e.owner].out) { e.hp = 0; e.lastBy = -1; } // 탈락자 엔티티는 어떤 경로로 생겨도 제거
    for (const e of g.ents) if (e.parent) { const p = byId(g, e.parent); if (!p || p.hp <= 0) e.hp = 0; } // 부모 사망 → 자식 사망
    for (const e of g.ents) if (e.inside) { const t = byId(g, e.inside); if (!t || t.hp <= 0) { e.hp = 0; e.lastBy = t ? t.lastBy : -1; e.lastById = t ? t.lastById : 0; } } // 수송선 사망 → 탑승 유닛 사망
    removeDead(g, events);
  }

  // hp <= 0 엔티티 제거 + 사망 이벤트(id 순). deaths·victory 공용. by = 다른 팀 가해자(같은 팀·없음 = -1)
  function removeDead(g, events) {
    const dead = g.ents.filter(e => e.owner >= 0 && e.hp <= 0);
    if (!dead.length) return;
    g.ents = g.ents.filter(e => e.owner < 0 || e.hp > 0);
    let creep = false, supply = false;
    for (const e of dead) {
      const p = g.players[e.owner];
      if (e.isB) {
        if (!e.lifted) setOcc(g, e, 0);
        if (e.def.onVent) for (const v of g.ents) if (v.type === 'vent' && v.tx === e.tx && v.ty === e.ty) setOcc(g, v, v.id); // 분출구 점유 복원
        for (const q of e.queue) { if (q.research) continue; const u = D.units[q.what]; p.supplyUsed2 -= Math.round((u.supply || 0) * 2) * (u.count || 1); }
        if (e.def.creep && e.buildLeft <= 0) creep = true;
        if (e.def.provides && e.buildLeft <= 0) supply = true;
        for (const w of g.ents) if (w.order && w.order.type === 'constructing' && w.order.b === e.id) { w.order = null; w.path = null; }
        if (e.main) { const m = byId(g, e.main); if (m && m.addon === e.id) m.addon = 0; }      // 부속 파괴 → 본체 해제
        if (e.addon) { const a = byId(g, e.addon); if (a && a.main === e.id) a.main = 0; }     // 본체 파괴 → 부속은 남음(미부착)
      } else {
        if (!e.free) p.supplyUsed2 -= Math.round((e.def.supply || 0) * 2);
        if (e.morph && e.morph.to !== e.type) p.supplyUsed2 -= supplyDiff(D.units[e.morph.to], e.def); // 고치 중 사망: 늘려 둔 보급 차이도 반환
        if (e.def.provides) supply = true;
      }
      events.push({ t: 'death', id: e.id, type: e.type, x: e.x, y: e.y, owner: e.owner, by: e.lastBy >= 0 && isEnemy(g, e.lastBy, e.owner) ? e.lastBy : -1 });
      if (!e.isB && !e.free && !e.parent && e.lastBy >= 0 && isEnemy(g, e.lastBy, e.owner) && g.players[e.lastBy].race === 'swarm') swarmKill(g, e); // 함재기 자식·소환 제외
    }
    if (creep) recomputeCreep(g);
    if (supply) recountSupply(g);
  }

  // 마이셀 처치(적 유닛, 소환·함재기 자식 제외): 가해 전투 유닛 kills+1(변이), 처치 지점에서 가장 가까운(거리², id 순) 빈자리 있는 완성 균핵에 유충 +1
  function swarmKill(g, e) {
    const k = e.lastById ? byId(g, e.lastById) : null;
    if (k && k.hp > 0 && !k.isB && !k.free && k.owner === e.lastBy && k.def.race === 'swarm' && fighter(k)) k.kills++; // 소환 가해자는 변이 없음
    let best = null, bd = Infinity;
    for (const b of g.ents) {
      if (!b.isB || b.owner !== e.lastBy || !b.def.larva || b.buildLeft > 0 || b.larva >= 3 || !(b.hp > 0)) continue;
      const d = dist2(b, e);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) { best.larva = Math.min(3, best.larva + D.races.swarm.killLarva); if (best.larva === 3) best.larvaT = 0; }
  }

  // 탈락: 그 플레이어 엔티티 전부 사망(처치 아님), 같은 틱 deaths/removeDead 가 폭발 연출까지 처리
  function eliminate(g, p, events) {
    g.players[p].out = true;
    for (const e of g.ents) if (e.owner === p) { e.hp = 0; e.lastBy = -1; }
    events.push({ t: 'player-out', p });
  }

  // 버팀 건물: 생산(trains·larva)·연구(researches)·다른 정의의 선행 조건(requires·morphFrom·addonOf)인 건물.
  // 나머지(보급·전력 depot·resonator, 가스 pump 등, 방어탑)는 유닛 없이 남아도 더는 아무것도 만들 수 없다.
  const PREREQ = new Set();
  for (const t of [D.units, D.buildings]) for (const d of Object.values(t)) {
    for (const r of d.requires || []) PREREQ.add(r);
    if (d.morphFrom) PREREQ.add(d.morphFrom);
    if (d.addonOf) PREREQ.add(d.addonOf);
  }
  const sustains = (type, d) => !!(d.trains || d.researches || d.larva || PREREQ.has(type));

  // 탈락: 건물 0, 또는 유닛(소환·함재기 제외) 0 이면서 버팀 건물 0. 남은 팀이 1 → 그 팀 승리, 0 → 무승부(-2)
  function victory(g, events) {
    if (g.winner !== -1) return;
    const nb = g.players.map(() => 0), live = g.players.map(() => 0);
    for (const e of g.ents) {
      if (e.owner < 0) continue;
      if (e.isB) nb[e.owner]++;
      if (e.isB ? sustains(e.type, e.def) : !e.free && !e.parent) live[e.owner]++;
    }
    let any = false;
    g.players.forEach((p, i) => { if (!p.out && (nb[i] === 0 || live[i] === 0)) { eliminate(g, i, events); any = true; } });
    if (any) removeDead(g, events);
    const alive = new Set();
    for (const p of g.players) if (!p.out) alive.add(p.team);
    if (alive.size === 1) g.winner = [...alive][0];
    else if (alive.size === 0) g.winner = -2;
  }

  function step(g, cmds) {
    const events = [];
    for (const e of g.ents) { e.px = e.x; e.py = e.y; }
    // 순서: applyCommands → power → production/construction → repairing → gathering → movement → transports → modes → merging → landing → separation → launchers → combat → casting → effects → docking → regen → deaths → fog → victory
    applyCommands(g, cmds, events);
    power(g);
    production(g, events);
    construction(g, events);
    repairing(g);
    gathering(g);
    movement(g);
    transports(g);
    modes(g);
    merging(g, events);
    landing(g);
    separation(g);
    launchers(g);
    combat(g, events);
    casting(g, events);
    effects(g);
    docking(g);
    regen(g);
    deaths(g, events);
    updateFog(g);
    victory(g, events);
    g.tick++;
    return events;
  }

  return { FP, TILE, TFP, TICK_RATE, D, ENERGY_REGEN, STF, energyMax, canCast, canCommand, cargo, canLoad, canMode, weaponOf, cloaked, isqrt, mulberry32, createGame, step, visible, isEnemy, checksum, hidden, detected, calcDamage, spawn, powered, powerNet, inNet, nearSeg, castTarget, canTrain, canRepair, canLift, canPlace, canAddon, canMorph, canResearch, hasTech, stat, recomputeCreep, byId, findPath, walkable, SRC: nwSim };
})();
if (typeof module !== 'undefined') module.exports = NW_SIM;
