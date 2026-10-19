// 붕붕이 — 교통 차량 시뮬레이션: IDM 추종(플레이어 포함), 차선 변경, 신호·정지선, 교차로 충돌 구역 양보,
// 비보호·우회전 간격 수락, 스크립트(끼어들기·보행자). 보행자는 traffic-peds.js, 고속도로(합류·양보·톨게이트·jam/slow)는 traffic-highway.js. DOM 없음, 결정론(mulberry32).
// 차 위치 s = 차체 중심의 차로 s. 플레이어도 {x,y,th,v,laneId,s(차체 중심),offset}로 넘긴다.
const PP_TRAFFIC = (function ppTraffic() {
  const R = typeof PP_ROADS !== 'undefined' ? PP_ROADS : require('./roads.js');
  const P = typeof PP_PEDS !== 'undefined' ? PP_PEDS : require('./traffic-peds.js');
  const J = typeof PP_TJUNC !== 'undefined' ? PP_TJUNC : require('./traffic-junction.js');
  // 고속도로 훅: index.html이 아직 traffic-highway.js를 안 불러도 시내 교통은 그대로 돈다
  const H = typeof PP_THW !== 'undefined' ? PP_THW : typeof require !== 'undefined' ? require('./traffic-highway.js') : null;
  const { laneLength, pointAt, signalState, movement, canChange, mapS, clamp } = R;
  const CAR_L = 4.5, CAR_W = 1.8, PL_L = 4.39, PL_W = 1.8;
  const A_MAX = 1.5, B_COMF = 2.0, B_MAX = 8, S0 = 2, S0_STOP = 1.0, SQ_AB = Math.sqrt(A_MAX * B_COMF);
  const ZONE = CAR_W + 0.8; // 연결 차로 중심선이 이보다 가까우면 충돌 구역
  // head: 진입 차로당 생성 간격(s), gap: 시작 배치 간격(m), f: 목표 속도/제한속도, peds: 보행 신호마다 보행자 수
  const DENS = {
    easy: { head: [16, 28], gap: [90, 140], f: [0.85, 1.0], peds: [0, 1] },
    normal: { head: [10, 16], gap: [45, 75], f: [0.8, 1.0], peds: [1, 2] },
    rush: { head: [4.5, 7], gap: [20, 32], f: [0.6, 0.85], peds: [2, 4] },
    highway: { head: [3, 5], gap: [60, 110], f: [0.85, 1.1], T: 1.5 }, // T: 안전 시간 간격(s) 고정
  };
  const PLAYER = { id: 0, player: true, T: 1.2 };

  function mulberry32(r) {
    let t = (r.s = (r.s + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0);
  }
  const rnd = sim => mulberry32(sim.rng) / 4294967296;
  const range = (sim, ab) => ab[0] + (ab[1] - ab[0]) * rnd(sim);

  function create(net, o = {}) {
    const dens = o.density === 'none' ? null : DENS[o.density || 'normal'];
    const sim = { net, dens, rng: { s: (o.seed | 0) || 1 }, list: [], peds: [], nid: 1, pid: 1, seq: 0, t: 0, idx: {},
      player: null, scripts: [], spawnAt: {}, walkPrev: {}, busy: {}, stopOf: {}, cwOf: {}, vcap: {}, unprot: {} };
    const pred = {};
    for (const id in net.lanes) for (const n of net.lanes[id].next) pred[n] = true;
    sim.sources = Object.keys(net.lanes).filter(id => !pred[id] && (net.lanes[id].kind === 'normal' || net.lanes[id].kind === 'ramp'));
    for (const st of net.stops) sim.stopOf[st.laneId] = st;
    for (const cw of net.crosswalks) for (const l of cw.lanes) (sim.cwOf[l.laneId] = sim.cwOf[l.laneId] || []).push({ cw: cw.id, s0: l.s0, s1: l.s1 });
    for (const id in net.lanes) if (net.lanes[id].kind === 'connector') sim.vcap[id] = J.turnCap(net.lanes[id]);
    for (const s of net.signals) sim.unprot[s.id] = !!s.unprotected;
    const cd = J.conflicts(net, ZONE);
    sim.conf = cd.conf; sim.div = cd.div;
    sim.hw = H ? H.init(sim) : null;
    for (const sp of o.spawn || []) addCar(sim, sp.laneId, sp.s, sp.v || 0, { turn: sp.turn });
    for (const def of o.scripts || []) {
      const sc = { def, state: 'wait', car: null };
      if (def.action === 'cut-in' && def.spawn) {
        sc.car = addCar(sim, def.spawn.laneId, def.spawn.s, def.spawn.v || 0, { script: sc });
        sc.car.v0 = net.lanes[def.spawn.laneId].limit / 3.6 * 1.15;
      }
      else if (sim.hw) H.initScript(sim, sc, K);
      sim.scripts.push(sc);
    }
    if (dens) populate(sim, o.avoid || []);
    for (const src of sim.sources) sim.spawnAt[src] = dens ? range(sim, dens.head) * headMul(sim, src) * rnd(sim) : Infinity;
    return sim;
  }

  function addCar(sim, laneId, s, v, opt = {}) {
    const ln = sim.net.lanes[laneId], f = sim.dens ? sim.dens.f : [0.9, 1.0];
    const c = { id: sim.nid++, laneId, s, v, a: 0, l: CAR_L, w: CAR_W, v0: ln.limit / 3.6 * range(sim, f), T: 1.0 + 0.5 * rnd(sim),
      from: null, lat: 1, latDur: 2, blink: 0, blinkT: 0, want: null, path: [], commit: null, commitN: 0, stopped: false,
      yellowGo: false, turn: opt.turn || null, lcT: 1 + 3 * rnd(sim), script: opt.script || null, slowUntil: -1, slowV: 0 };
    if (sim.dens && sim.dens.T) c.T = sim.dens.T;
    if (sim.hw) H.initCar(sim, c, rnd);
    if (!c.turn && !c.script) c.turn = pickTurn(sim, c);
    ensurePath(sim, c);
    sim.list.push(c);
    return c;
  }
  const W_TURN = { straight: 7, right: 2, left: 1.5, uturn: 0 };
  // 이 차로가 교차로 진입 차로면 그 회전을 할 수 있는가(교차로가 아니면 항상 참)
  const offers = (sim, ln, turn) => !turn || !sim.stopOf[ln.id] || ln.next.some(id => sim.net.lanes[id].turn === turn);
  function sideFor(sim, ln, turn) {
    for (const side of ['left', 'right']) for (let x = ln[side]; x; x = sim.net.lanes[x][side]) if (offers(sim, sim.net.lanes[x], turn)) return side;
    return null;
  }
  // 다음 교차로에서 하고 싶은 회전(그 도로 차로들이 제공하는 회전 중 가중 무작위) — 그 회전 차로로 미리 옮겨 간다
  function pickTurn(sim, c) {
    const net = sim.net, set = [];
    let x = c.laneId;
    while (net.lanes[x].left) x = net.lanes[x].left;
    for (; x; x = net.lanes[x].right) if (sim.stopOf[x]) for (const id of net.lanes[x].next) { const t = net.lanes[id].turn; if (t && !set.includes(t)) set.push(t); }
    const w = set.map(t => W_TURN[t] || 0), sum = w.reduce((a, b) => a + b, 0);
    if (!sum) return null;
    let r = rnd(sim) * sum;
    for (let i = 0; i < set.length; i++) { r -= w[i]; if (r < 0) return set[i]; }
    return set[set.length - 1];
  }
  function choose(sim, c, ln) {
    if (ln.next.length === 1) return ln.next[0];
    const opts = ln.next.map(id => sim.net.lanes[id]);
    if (sim.hw) { const h = H.choose(sim, c, opts, rnd); if (h) return h; }
    if (c.turn) { const f = opts.find(x => x.turn === c.turn); if (f) return f.id; }
    const w = opts.map(x => W_TURN[x.turn] != null ? W_TURN[x.turn] : 1), sum = w.reduce((a, b) => a + b, 0);
    if (!sum) return opts[0].id;
    let r = rnd(sim) * sum;
    for (let i = 0; i < opts.length; i++) { r -= w[i]; if (r < 0) return opts[i].id; }
    return opts[opts.length - 1].id;
  }
  function ensurePath(sim, c) {
    while (c.path.length < 3) {
      const ln = sim.net.lanes[c.path.length ? c.path[c.path.length - 1] : c.laneId];
      if (!ln.next.length) break;
      c.path.push(choose(sim, c, ln));
    }
  }

  function populate(sim, avoid) {
    const net = sim.net;
    for (const id in net.lanes) {
      const ln = net.lanes[id];
      if (ln.kind !== 'normal') continue;
      const st = sim.stopOf[id], sMax = st ? st.s - CAR_L : laneLength(ln) - 8;
      for (let s = 8 + range(sim, sim.dens.gap) * rnd(sim); s < sMax; s += range(sim, sim.dens.gap)) {
        const p = pointAt(ln, s);
        if (avoid.some(a => Math.hypot(p.x - a.x, p.y - a.y) < a.r)) continue;
        if (sim.list.some(c => (c.laneId === id || c.from === id) && Math.abs(c.s - s) < 12)) continue;
        addCar(sim, id, s, 0);
      }
    }
    buildIdx(sim);
    for (const c of sim.list) {
      if (c.script) continue;
      const ld = leaderAhead(sim, c, c.laneId, c.s, 200, true), st = sim.stopOf[c.laneId];
      let g = ld ? ld.gap : 200;
      if (st) g = Math.min(g, st.s - c.s - c.l / 2);
      c.v = Math.min(c.v0 * 0.85, Math.sqrt(2 * 1.5 * Math.max(0, g - 4)));
      if (sim.hw) c.v = Math.min(c.v, H.v0(sim, c, c.v));
    }
  }

  // 차로별 [{car, s, v, l}] (차선 변경 중인 차는 양쪽 차로에, 플레이어는 걸친 차로까지)
  function buildIdx(sim) {
    const net = sim.net, idx = {};
    const put = (id, e) => (idx[id] = idx[id] || []).push(e);
    for (const c of sim.list) {
      put(c.laneId, { car: c, s: c.s, v: c.v, l: c.l });
      if (c.from) put(c.from, { car: c, s: mapS(net, c.laneId, c.from, c.s), v: c.v, l: c.l });
    }
    const p = sim.player;
    if (p && p.laneId && net.lanes[p.laneId]) {
      put(p.laneId, { car: PLAYER, s: p.s, v: p.v, l: PL_L });
      const ln = net.lanes[p.laneId], off = p.offset || 0, m = ln.width / 2 - PL_W / 2 - 0.1;
      const side = off > m ? ln.left : off < -m ? ln.right : null;
      if (side) put(side, { car: PLAYER, s: mapS(net, p.laneId, side, p.s), v: p.v, l: PL_L });
    }
    for (const k in idx) idx[k].sort((a, b) => a.s - b.s || a.car.id - b.car.id);
    sim.idx = idx;
  }
  function idxInsert(sim, laneId, e) {
    const l = sim.idx[laneId] = sim.idx[laneId] || [];
    let i = 0;
    while (i < l.length && l[i].s <= e.s) i++;
    l.splice(i, 0, e);
  }
  // 앞차: laneId에서 s 앞, follow면 차의 경로(path)를 따라 이어서
  function leaderAhead(sim, c, laneId, s, maxD, follow) {
    const net = sim.net;
    let base = -s, lane = laneId, k = -1;
    while (lane && base < maxD) {
      let best = null;
      for (const e of sim.idx[lane] || []) {
        if (e.car === c || (k === -1 && e.s <= s)) continue;
        best = e; break;
      }
      for (const dv of (follow && sim.div[lane]) || []) for (const e of sim.idx[dv.D] || []) {
        if (e.car === c || (k === -1 && e.s <= s) || e.s - e.l / 2 >= dv.s) continue;
        if (!best || e.s < best.s) best = e;
        break;
      }
      if (best) return { gap: base + best.s - (c.l + best.l) / 2, v: best.v, car: best.car };
      if (!follow) break;
      base += laneLength(net.lanes[lane]);
      k++;
      lane = c.path[k];
    }
    return null;
  }
  const idmTerm = (v, vl, gap, T, s0) => gap <= 0.05 ? -B_MAX
    : A_MAX * (1 - ((s0 + Math.max(0, v * T + v * (v - vl) / (2 * SQ_AB))) / gap) ** 2);

  function rankOf(sim, c, conn, t) {
    const st = sim.stopOf[conn.from];
    if (!st || !st.signal) return conn.turn === 'straight' ? 2 : 1;
    const state = signalState(sim.net, t, st.signal, conn.from), mv = movement(state, conn.turn, sim.unprot[st.signal]);
    return mv === 'protected' || state === 'Y' ? 2 : mv === 'permissive' ? 1 : 0;
  }
  const playerOn = (sim, D) => sim.player && sim.player.laneId === D;
  const uncleared = (B, D, d1) => B.laneId !== D || B.s - B.l / 2 < d1 + 0.3;
  function cwBusyOn(sim, laneId) { return (sim.cwOf[laneId] || []).some(x => sim.busy[x.cw]); }

  function canCommit(sim, c, C, rank, t) {
    const net = sim.net, out = C.next[0];
    if (cwBusyOn(sim, c.laneId) || cwBusyOn(sim, out)) return false;
    const ol = sim.idx[out];
    const free = ol && ol.length ? ol[0].s - ol[0].l / 2 : laneLength(net.lanes[out]);
    let pending = 0;
    for (const B of sim.list) {
      if (B === c) continue;
      const on = net.lanes[B.laneId];
      if ((on.kind === 'connector' && on.next[0] === out) || (B.commit && B.commit !== B.laneId && net.lanes[B.commit].next[0] === out)) pending++;
    }
    if (ol && ol.length && ol[0].v < 3 && free < (pending + 1) * (CAR_L + 2.5)) return false; // 꼬리물기 금지(나가는 차로가 막혔을 때만)
    const inL = laneLength(net.lanes[c.laneId]), front = c.s + c.l / 2;
    for (const cf of sim.conf[C.id]) {
      if (playerOn(sim, cf.D) && sim.player.s - PL_L / 2 < cf.d1 + 0.3) return false;
      const D = net.lanes[cf.D];
      const dA = inL - front + cf.c1 + c.l, tA = (-c.v + Math.sqrt(c.v * c.v + 2 * A_MAX * dA)) / A_MAX;
      for (const B of sim.list) {
        if (B === c) continue;
        if (B.laneId === cf.D || B.commit === cf.D) { if (uncleared(B, cf.D, cf.d1)) return false; continue; }
        if (B.laneId === D.from && B.path[0] === cf.D && rankOf(sim, B, D, t) > rank) {
          const tB = (laneLength(net.lanes[D.from]) - B.s - B.l / 2 + cf.d0) / Math.max(B.v, 1);
          if (tB < tA + 1.5) return false;
        }
      }
    }
    return true;
  }

  function tryCommit(sim, c, st, C, t) {
    const dStop = st.s - (c.s + c.l / 2);
    let rank, forced = false;
    if (st.signal) {
      const state = signalState(sim.net, t, st.signal, c.laneId), mv = movement(state, C.turn, sim.unprot[st.signal]);
      if (state === 'Y' && (c.yellowGo || dStop < 0 || c.v * c.v / (2 * Math.max(dStop, 0.01)) > 3.5)) { forced = true; rank = 2; }
      else if (mv === 'protected') rank = 2;
      else if (mv === 'permissive') {
        if (C.turn === 'right' && state !== 'G' && state !== 'LG' && !c.stopped) return;
        rank = 1;
      } else return;
    } else rank = C.turn === 'straight' ? 2 : 1;
    if (forced || canCommit(sim, c, C, rank, t)) { c.commit = C.id; c.commitN = ++sim.seq; c.yellowGo = forced; }
  }

  function spanAllowed(net, from, to, s, v) {
    const L = laneLength(net.lanes[from]), e = s + v * 3 + 6;
    if (e > L - 10) return false;
    for (let x = s; x <= e; x += 4) if (!canChange(net, from, to, x)) return false;
    return canChange(net, from, to, e);
  }
  function changeOk(sim, c, to, scripted) {
    const sT = mapS(sim.net, c.laneId, to, c.s);
    let lead = null, foll = null;
    for (const e of sim.idx[to] || []) { if (e.car === c) continue; if (e.s > sT) { lead = e; break; } foll = e; }
    if (lead) {
      const g = lead.s - sT - (c.l + lead.l) / 2;
      if (g < Math.max(4, 0.6 * c.v + 2) || idmTerm(c.v, lead.v, g, c.T, S0) < -2) return false;
    }
    if (foll) {
      if (foll.car.commit) return false; // 교차로 진입 허가를 받은 차 앞으로는 끼어들지 않는다
      const g = sT - foll.s - (c.l + foll.l) / 2;
      if (scripted ? g < 3 : g < Math.max(4, 0.8 * foll.v + 2) || idmTerm(foll.v, c.v, g, foll.car.T || 1.2, S0) < -2.5) return false;
    }
    return true;
  }
  function startChange(sim, c, to, dur) {
    c.from = c.laneId;
    c.s = mapS(sim.net, c.laneId, to, c.s);
    c.laneId = to; c.lat = 0; c.latDur = dur; c.want = null; c.path = [];
    ensurePath(sim, c);
    idxInsert(sim, to, { car: c, s: c.s, v: c.v, l: c.l });
  }

  function decide(sim, c, t, dt) {
    const net = sim.net, lane = net.lanes[c.laneId], L = laneLength(lane), sc = c.script;
    if (c.from) { c.lat += dt / c.latDur; if (c.lat >= 1) { c.from = null; c.lat = 1; c.blink = 0; } }
    const st = sim.stopOf[c.laneId], C = c.path[0] && net.lanes[c.path[0]];
    if (st && C && C.kind === 'connector') {
      // 진입 허가는 줄 맨 앞 차만: 앞에 허가 없는 차가 끼어들면 취소
      const pl = sim.player;
      const head = !(pl && pl.laneId === c.laneId && pl.s > c.s)
        && !sim.list.some(o => o !== c && (o.laneId === c.laneId || o.from === c.laneId) && o.s > c.s && !o.commit);
      if (!head) c.commit = null;
      else if (!c.commit) {
        const dStop = st.s - (c.s + c.l / 2);
        if (c.v < 0.1 && dStop < 3) c.stopped = true;
        if (dStop < c.v * c.v / (2 * B_COMF) + 10) tryCommit(sim, c, st, C, t);
      }
    }
    if (sc) return scriptDecide(sim, c, sc, t);
    if (c.from) return;
    if (sim.hw && H.decide(sim, c, t, dt, K)) return;
    if (c.want) {
      if (t - c.blinkT >= 2) {
        if (spanAllowed(net, c.laneId, c.want, c.s, c.v) && changeOk(sim, c, c.want, false)) startChange(sim, c, c.want, 1.5 + 1.5 * rnd(sim));
        else if (t - c.blinkT > 8) { c.want = null; c.blink = 0; }
      }
      return;
    }
    // 회전 깜빡이: 교차로 40m 전부터 회전 차로를 나갈 때까지
    const turnAhead = lane.kind === 'connector' ? lane.turn : C && C.kind === 'connector' && L - c.s < 40 ? C.turn : null;
    c.blink = turnAhead === 'left' || turnAhead === 'uturn' ? -1 : turnAhead === 'right' ? 1 : 0;
    // 원하는 회전을 못 하는 차로면 그쪽으로 차선 변경(버스전용차로도 점선 구간에서는 우회전 진입 가능)
    if (lane.kind !== 'connector' && st && !offers(sim, lane, c.turn)) {
      const side = sideFor(sim, lane, c.turn), to = side && lane[side];
      if ((c.lcT -= dt) > 0 || !to || c.s < 10 || c.commit) return;
      c.lcT = 0.5;
      if (spanAllowed(net, c.laneId, to, c.s, c.v) && changeOk(sim, c, to, false)) { c.want = to; c.blink = side === 'left' ? -1 : 1; c.blinkT = t; }
      return;
    }
    if ((c.lcT -= dt) > 0) return;
    c.lcT = 1.5 + 2 * rnd(sim);
    if (lane.kind !== 'normal' || c.s < 30 || c.commit || (st && st.s - c.s < 40)) return;
    const own = leaderAhead(sim, c, c.laneId, c.s, 150, true), og = own ? own.gap : 999;
    for (const to of [lane.left, lane.right]) {
      if (!to || net.lanes[to].kind !== 'normal') continue;
      const roll = rnd(sim);
      if (!offers(sim, net.lanes[to], c.turn)) continue;
      if (!spanAllowed(net, c.laneId, to, c.s, c.v)) continue;
      const ld = leaderAhead(sim, c, to, mapS(net, c.laneId, to, c.s), 150, false), g = ld ? ld.gap : 999;
      const want = (og < 50 && g > og + 20 && own.v < c.v0 * 0.85) || roll < 0.03;
      if (want && changeOk(sim, c, to, false)) { c.want = to; c.blink = to === lane.left ? -1 : 1; c.blinkT = t; return; }
    }
  }

  function scriptDecide(sim, c, sc, t) {
    const lane = sim.net.lanes[c.laneId], p = sim.player;
    const tgt = p && (lane.left === p.laneId || lane.right === p.laneId) ? p.laneId : null;
    if (sc.state === 'fire' && !c.from && tgt) { sc.state = 'blink'; c.blink = tgt === lane.left ? -1 : 1; c.blinkT = t; }
    else if (sc.state === 'blink') {
      if (t - c.blinkT >= (sc.def.blink || 1.2) && tgt && changeOk(sim, c, tgt, true)) { startChange(sim, c, tgt, sc.def.dur || 2.0); sc.state = 'move'; }
      else if (t - c.blinkT > 10) { sc.state = 'done'; c.blink = 0; }
    } else if (sc.state === 'move' && !c.from) {
      sc.state = 'done'; c.blink = 0; c.slowUntil = t + 3; c.slowV = Math.max(3, (p ? p.v : c.v) * 0.7);
      c.v0 = lane.limit / 3.6 * 0.95;
    }
  }

  // 앞쪽 가상 정지물(정지선·보행자 있는 횡단보도·우선권 있는 차의 충돌 구역)까지 앞범퍼 거리
  function obstacles(sim, c, t, out) {
    const net = sim.net, front = c.s + c.l / 2, lanes = [c.laneId].concat(c.path);
    let base = 0;
    for (let i = 0; i < lanes.length && base < 120; i++) {
      const id = lanes[i], ln = net.lanes[id], st = sim.stopOf[id], nx = lanes[i + 1] && net.lanes[lanes[i + 1]];
      const off = i === 0 ? -front : base - front; // 이 차로 s=0까지 앞범퍼 거리
      if (st && nx && nx.kind === 'connector') {
        if (i === 0) { if (!c.commit) out.push(Math.max(st.s - front, 0.01)); }
        else if (rankOf(sim, c, nx, t) === 0 || (nx.turn === 'right' && rankOf(sim, c, nx, t) < 2)) out.push(off + st.s);
      }
      for (const x of sim.cwOf[id] || []) if (sim.busy[x.cw] && !(i === 0 && front > x.s0)) out.push(off + x.s0 - 0.5);
      base = off + laneLength(ln) + front;
    }
    const C = net.lanes[c.laneId].kind === 'connector' ? c.laneId : c.commit;
    if (!C) return;
    const fC = C === c.laneId ? front : front - laneLength(net.lanes[c.laneId]);
    for (const cf of sim.conf[C] || []) {
      if (fC > cf.c0) continue;
      let block = playerOn(sim, cf.D) && sim.player.s - PL_L / 2 < cf.d1 + 0.3;
      for (const B of sim.list) {
        if (block) break;
        if (B !== c && (B.laneId === cf.D || B.commit === cf.D) && B.commitN < c.commitN && uncleared(B, cf.D, cf.d1)) block = true;
      }
      if (block) out.push(cf.c0 - fC - 0.5);
    }
  }

  const obs = [];
  function accel(sim, c, t) {
    const net = sim.net, lane = net.lanes[c.laneId];
    let v0 = Math.min(c.slowUntil > t ? Math.min(c.v0, c.slowV) : c.v0, lane.limit / 3.6 * (c.script ? 1.15 : Math.max(1.05, sim.dens ? sim.dens.f[1] : 0)));
    if (sim.hw) v0 = H.v0(sim, c, v0);
    if (sim.vcap[c.laneId]) v0 = Math.min(v0, sim.vcap[c.laneId]);
    let d = laneLength(lane) - c.s - c.l / 2;
    for (const id of c.path) {
      if (d > 120) break;
      if (sim.vcap[id]) v0 = Math.min(v0, Math.sqrt(sim.vcap[id] ** 2 + 2 * 1.2 * Math.max(0, d)));
      d += laneLength(net.lanes[id]);
    }
    let a = Math.max(A_MAX * (1 - (c.v / Math.max(v0, 0.1)) ** 4), -3);
    const sc = c.script, p = sim.player;
    if (sc && p && (sc.state === 'wait' || sc.state === 'fire' || sc.state === 'blink') && (lane.left === p.laneId || lane.right === p.laneId)) {
      const want = mapS(net, p.laneId, c.laneId, p.s) + PL_L / 2 + (sc.def.gap || 8) + c.l / 2;
      a = clamp(1.2 * (p.v + clamp(0.5 * (want - c.s), -5, 5) - c.v), -3, 2.5);
      a = Math.min(a, A_MAX * (1 - (c.v / Math.max(v0, 0.1)) ** 4) + 1);
    }
    const ld = leaderAhead(sim, c, c.laneId, c.s, 150, true);
    if (ld) a = Math.min(a, idmTerm(c.v, ld.v, ld.gap, c.T, S0));
    if (c.from) {
      const lf = leaderAhead(sim, c, c.from, mapS(net, c.laneId, c.from, c.s), 80, false);
      if (lf) a = Math.min(a, idmTerm(c.v, lf.v, lf.gap, c.T, S0));
    }
    obs.length = 0;
    obstacles(sim, c, t, obs);
    if (sim.hw) { H.obstacles(sim, c, obs); a = H.accel(sim, c, a, K); }
    for (const g of obs) a = Math.min(a, idmTerm(c.v, 0, g, c.T, S0_STOP));
    return clamp(a, -B_MAX, A_MAX * 1.6);
  }

  function advance(sim, c) {
    const net = sim.net;
    let lane = net.lanes[c.laneId];
    while (c.s > laneLength(lane)) {
      const nx = c.path.shift();
      if (!nx) { c.dead = true; return; }
      c.s -= laneLength(lane);
      const prev = lane.id;
      if (lane.kind === 'connector') c.commit = null;
      if (c.from) { c.from = null; c.lat = 1; }
      c.laneId = nx; lane = net.lanes[nx];
      c.stopped = false; c.yellowGo = false;
      if (lane.kind === 'connector') {
        if (c.commit !== nx) { c.commit = nx; c.commitN = ++sim.seq; }
        if (c.turn === lane.turn) c.turn = null;
      } else if (net.lanes[prev].kind === 'connector' && !c.script) { c.turn = pickTurn(sim, c); c.path = []; }
      ensurePath(sim, c);
    }
  }

  const headMul = (sim, src) => (sim.hw && sim.net.lanes[src].kind === 'ramp' ? H.RAMP_HEAD : 1);
  function spawn(sim, t) {
    const net = sim.net;
    for (const src of sim.sources) {
      if (t < sim.spawnAt[src]) continue;
      let first = null;
      for (const c of sim.list) if ((c.laneId === src || c.from === src) && (!first || c.s < first.s)) first = c;
      const p = sim.player;
      const pS = p && p.laneId === src ? p.s : Infinity;
      const v0 = net.lanes[src].limit / 3.6 * sim.dens.f[1];
      const lead = first && first.s < pS ? { s: first.s, v: first.v, l: first.l } : pS < Infinity ? { s: pS, v: p.v, l: PL_L } : null;
      let v = v0;
      if (lead) {
        const g = lead.s - lead.l / 2 - CAR_L;
        const need = vv => 4 + vv * 1.3 + Math.max(0, (vv * vv - lead.v * lead.v) / (2 * 3));
        if (g < need(v)) v = Math.min(v, lead.v);
        if (g < need(v)) { sim.spawnAt[src] = t + 0.5; continue; }
      }
      addCar(sim, src, CAR_L / 2, v);
      sim.spawnAt[src] = t + range(sim, sim.dens.head) * headMul(sim, src);
    }
  }

  function step(sim, dt, t, player) {
    sim.t = t; sim.player = player || null;
    const p = sim.player;
    for (const sc of sim.scripts) {
      const w = sc.def.when;
      if (sc.state === 'wait' && w && p && w.lanes.includes(p.laneId) && p.s >= w.s) fire(sim, sc);
    }
    P.update(sim, t, dt, rnd, cars(sim));
    buildIdx(sim);
    for (const c of sim.list) decide(sim, c, t, dt);
    for (const c of sim.list) c.a = accel(sim, c, t);
    for (const c of sim.list) { c.v = Math.max(0, c.v + c.a * dt); c.s += c.v * dt; advance(sim, c); }
    if (sim.list.some(c => c.dead)) sim.list = sim.list.filter(c => !c.dead);
    if (sim.dens) spawn(sim, t);
    P.move(sim, dt, cars(sim));
  }
  function fire(sim, sc) {
    if (sc.state !== 'wait') return;
    if (sc.def.action === 'peds') {
      for (let i = 0; i < (sc.def.count || 2); i++) P.add(sim, sc.def.crosswalk, { from: i % 2, delay: i * 0.8, speed: 1.2, forced: true });
      sc.state = 'done';
    } else if (!(sim.hw && H.fire(sim, sc, K))) sc.state = 'fire';
  }
  function trigger(sim, id) { const sc = sim.scripts.find(s => s.def.id === id); if (sc) fire(sim, sc); }

  function cars(sim) {
    const net = sim.net;
    return sim.list.map(c => {
      const ln = net.lanes[c.laneId], p = pointAt(ln, c.s);
      let x = p.x, y = p.y, th = p.a;
      if (c.from) {
        const sg = net.lanes[c.from] && ln.left === c.from ? 1 : -1, off = sg * ln.width * (1 - c.lat);
        x -= Math.sin(p.a) * off; y += Math.cos(p.a) * off;
        th -= sg * Math.atan2(ln.width / c.latDur, Math.max(c.v, 2));
      }
      return { id: c.id, x, y, th, v: c.v, blink: c.blink, braking: c.a < -0.3 || c.v < 0.3, l: c.l, w: c.w, hazard: !!c.hazard };
    });
  }
  // traffic-highway.js에 넘기는 내부 함수 묶음
  const K = { rnd, addCar, changeOk, spanAllowed, startChange, leaderAhead, idmTerm, S0 };
  const peds = sim => P.list(sim);
  const addPed = (sim, cwId, o) => P.add(sim, cwId, Object.assign({ forced: true }, o));

  return { CAR_L, CAR_W, DENS, mulberry32, create, step, cars, peds, trigger, addPed };
})();
if (typeof module !== 'undefined') module.exports = PP_TRAFFIC;
