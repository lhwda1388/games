// 붕붕이 — 도로 저작 도우미: 직선·곡선 도로, 사거리·삼거리(연결 차로·정지선·횡단보도·신호), connect.
// 만든 함수는 PP_ROADS에 붙는다(브라우저는 roads.js 다음에 이 파일을 로드).
const PP_RBUILD = (function ppRBuild() {
  const R = typeof PP_ROADS !== 'undefined' ? PP_ROADS : require('./roads.js');
  const { PI, clamp, wrap, addLane, laneLength, pointAt, connectorPts, movement } = R;
  const CW_GAP = 1, CW_W = 4, STOP_GAP = 2, Y_DUR = 3; // 교차로 가장자리↔횡단보도, 횡단보도 폭, 횡단보도↔정지선, 황색
  const TURN_A = { left: PI / 2, straight: 0, right: -PI / 2, uturn: PI };
  const TURNS = ['left', 'straight', 'right', 'uturn'];

  function geomOf(o, curved) {
    if (!curved) {
      const c = Math.cos(o.a), s = Math.sin(o.a);
      return { L: o.length, seg: () => 1, at: t => ({ x: o.x + c * t, y: o.y + s * t, a: o.a }) };
    }
    const sg = Math.sign(o.angle) || 1, Rr = o.radius, L = Rr * Math.abs(o.angle);
    const cx = o.x - Math.sin(o.a) * Rr * sg, cy = o.y + Math.cos(o.a) * Rr * sg;
    return { L, seg: len => Math.max(1, Math.ceil(len / 2)),
      at: t => { const th = o.a + sg * t / Rr; return { x: cx + Rr * sg * Math.sin(th), y: cy - Rr * sg * Math.cos(th), a: th }; } };
  }
  function samplePts(g, off, s0, s1) {
    const n = g.seg(s1 - s0), pts = [];
    for (let i = 0; i <= n; i++) {
      const p = g.at(s0 + (s1 - s0) * i / n);
      pts.push([p.x - Math.sin(p.a) * off, p.y + Math.cos(p.a) * off]);
    }
    return pts;
  }
  function overlay(list, s0, s1, type, L) {
    s0 = Math.max(0, s0); s1 = Math.min(L, s1);
    if (s1 <= s0) return list;
    const out = [];
    for (const it of list) {
      if (it.s1 <= s0 || it.s0 >= s1) { out.push(it); continue; }
      if (it.s0 < s0) out.push({ s0: it.s0, s1: s0, type: it.type });
      if (it.s1 > s1) out.push({ s0: s1, s1: it.s1, type: it.type });
    }
    out.push({ s0, s1, type });
    return out.sort((a, b) => a.s0 - b.s0);
  }

  // 같은 방향 차로 사이 구분선과 차선 변경 구간. ids는 1차로→바깥, s는 그 방향 진행 기준.
  function dividers(net, g, o, ids, dir) {
    const L = g.L;
    for (let i = 0; i < ids.length - 1; i++) {
      let iv = [{ s0: 0, s1: L, type: 'white-dashed' }];
      if (o.solidStart) iv = overlay(iv, 0, o.solidStart, 'white-solid', L);
      if (o.solidEnd) iv = overlay(iv, L - o.solidEnd, L, 'white-solid', L);
      const b = o.bus;
      if (b && dir === 'f' && i === ids.length - 2) {
        const df = b.dashedFrom != null ? b.dashedFrom : b.s1;
        iv = overlay(iv, b.s0, df, 'blue-solid', L);
        if (df < b.s1) iv = overlay(iv, df, b.s1, 'blue-dashed', L);
      }
      const off = (dir === 'f' ? -1 : 1) * (i + 1) * o.width;
      for (const it of iv) {
        const r0 = dir === 'f' ? it.s0 : L - it.s1, r1 = dir === 'f' ? it.s1 : L - it.s0;
        net.lines.push({ type: it.type, pts: samplePts(g, off, r0, r1) });
        for (const [a, c] of [[ids[i], ids[i + 1]], [ids[i + 1], ids[i]]]) {
          const k = laneLength(net.lanes[a]) / L;
          net.changes.push({ from: a, to: c, s0: it.s0 * k, s1: it.s1 * k, allowed: it.type.endsWith('dashed') });
        }
      }
    }
  }

  // 도로: (x,y,a) = 중앙선 시작점·방향. fwd 차로는 a 방향(중앙선 오른쪽), back은 반대 방향(중앙선 왼쪽).
  // 옵션: width(3.2), limit(km/h), median, solidEnd/solidStart(m, 각 방향의 끝·시작 부분 백색 실선), bus
  function road(net, o, curved) {
    o = Object.assign({ width: 3.2, lanesFwd: 1, lanesBack: 0, limit: 50, median: 'yellow-double', solidEnd: 0, solidStart: 0 }, o);
    const g = geomOf(o, curved), L = g.L, w = o.width, nf = o.lanesFwd, nb = o.lanesBack;
    const fwd = [], back = [];
    for (let i = 1; i <= nf; i++) fwd.push(`${o.id}:f${i}`);
    for (let i = 1; i <= nb; i++) back.push(`${o.id}:b${i}`);
    const make = (ids, dir) => ids.forEach((id, j) => {
      const pts = samplePts(g, (dir === 'f' ? -1 : 1) * (j + 0.5) * w, 0, L);
      if (dir === 'b') pts.reverse();
      const bus = dir === 'f' && o.bus && j === ids.length - 1;
      const lane = addLane(net, { id, pts, width: w, next: [], left: ids[j - 1] || null, right: ids[j + 1] || null,
        limit: o.limit, kind: bus ? 'bus' : 'normal', road: o.id });
      if (bus) {
        const k = laneLength(lane) / L;
        lane.bus = { s0: o.bus.s0 * k, s1: o.bus.s1 * k };
        const end = o.bus.dashedFrom != null ? o.bus.dashedFrom : o.bus.s1;
        for (let s = o.bus.s0 + 20; s < end - 10; s += 80) {
          const p = pointAt(lane, s * k);
          net.marks.push({ kind: 'text', text: '버스전용', x: p.x, y: p.y, a: p.a, laneId: id });
        }
      }
    });
    make(fwd, 'f'); make(back, 'b');
    if (nb) net.lines.push({ type: o.median, pts: samplePts(g, 0, 0, L) });
    net.lines.push({ type: 'white-solid', pts: samplePts(g, -nf * w, 0, L) });
    net.lines.push({ type: 'white-solid', pts: samplePts(g, nb * w, 0, L) });
    dividers(net, g, o, fwd, 'f');
    dividers(net, g, o, back, 'b');
    net.areas.push({ kind: 'road', id: o.id, pts: samplePts(g, nb * w, 0, L).concat(samplePts(g, -nf * w, 0, L).reverse()) });
    return { id: o.id, fwd, back, start: g.at(0), end: g.at(L), length: L, width: w, lanesFwd: nf, lanesBack: nb, at: g.at };
  }
  const straightRoad = (net, o) => road(net, o, false);
  const curvedRoad = (net, o) => road(net, o, true);

  // 차로 끝 → 차로 시작을 쌍으로 잇는다. 끝점이 0.05m 안이면 next만, 아니면 연결 차로를 만든다.
  function connect(net, fromIds, toIds) {
    fromIds = [].concat(fromIds); toIds = [].concat(toIds);
    const made = [];
    fromIds.forEach((fid, i) => {
      const a = net.lanes[fid], b = net.lanes[toIds[Math.min(i, toIds.length - 1)]];
      const pa = pointAt(a, laneLength(a)), pb = pointAt(b, 0);
      if (Math.hypot(pa.x - pb.x, pa.y - pb.y) <= 0.05) { a.next.push(b.id); return; }
      const id = `${fid}>${b.id}`;
      addLane(net, { id, pts: connectorPts(pa, pa.a, pb, pb.a), width: a.width, next: [b.id], left: null, right: null,
        limit: a.limit, kind: 'connector', turn: 'straight', road: a.road, from: fid });
      a.next.push(id); made.push(id);
    });
    return made;
  }

  function hull(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const q of p) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    for (const q of p.reverse()) { while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  const arrowName = t => ['straight', 'left', 'right', 'uturn'].filter(x => t.includes(x)).join('-');

  // 교차로. arms: [{ road(straightRoad 결과), turns: 진입 차로별 회전 목록(1차로→바깥) }]
  // 도로의 어느 끝이 교차로에 붙었는지는 (x,y)와의 거리로 판단 — 진입 차로 = 교차로로 향하는 쪽.
  // signal: { cycle, protectedLeft, offset? } | null, crosswalks: bool
  function junction(net, o) {
    const { id } = o, cx = o.x, cy = o.y;
    const far = p => Math.hypot(p.x - cx, p.y - cy);
    const arms = o.arms.map((arm, k) => {
      const r = arm.road, atEnd = far(r.end) < far(r.start);
      const inIds = atEnd ? r.fwd : r.back, outIds = atEnd ? r.back : r.fwd;
      const turns = (arm.turns || []).map(t => [].concat(t));
      if (turns.length !== inIds.length) throw new Error(`${id}: arm ${k} turns ${turns.length} ≠ 진입 차로 ${inIds.length}`);
      return { k, r, atEnd, inIds, outIds, turns, h: wrap(atEnd ? r.end.a : r.start.a + PI) };
    });
    const conns = [];
    for (const X of arms) for (const T of TURNS) {
      const Ls = X.inIds.filter((_, j) => X.turns[j].includes(T));
      if (!Ls.length) continue;
      const want = wrap(X.h + TURN_A[T]);
      const Y = T === 'uturn' ? X : arms.find(A => A !== X && Math.abs(wrap(A.h + PI - want)) < PI / 4);
      if (!Y || !Y.outIds.length) throw new Error(`${id}: 팔 ${X.k}에서 ${T} 갈 곳 없음`);
      const O = Y.outIds;
      Ls.forEach((inId, j) => {
        const oi = T === 'right' ? O.length - 1 - Math.min(Ls.length - 1 - j, O.length - 1)
          : T === 'straight' ? clamp(O.length - Ls.length + j, 0, O.length - 1) : Math.min(j, O.length - 1);
        const a = net.lanes[inId], b = net.lanes[O[oi]];
        const pa = pointAt(a, laneLength(a)), pb = pointAt(b, 0), cid = `${id}:${inId}>${T}`;
        addLane(net, { id: cid, pts: connectorPts(pa, pa.a, pb, pb.a), width: a.width, next: [b.id], left: null, right: null,
          limit: a.limit, kind: 'connector', turn: T, road: id, from: inId, arm: X.k, toArm: Y.k });
        a.next.push(cid);
        conns.push(net.lanes[cid]);
      });
    }

    const cw = !!o.crosswalks, sigId = o.signal ? id + ':sig' : null, stops = [], cwIds = [], corners = [];
    for (const X of arms) {
      const r = X.r, w = r.width, L = r.length, endS = X.atEnd ? L : 0;
      const e = r.at(endS), nx = -Math.sin(e.a), ny = Math.cos(e.a);
      corners.push([e.x - nx * r.lanesFwd * w, e.y - ny * r.lanesFwd * w], [e.x + nx * r.lanesBack * w, e.y + ny * r.lanesBack * w]);
      if (!X.inIds.length) continue;
      const lanes = X.inIds.map(i => net.lanes[i]);
      const sStop = laneLength(lanes[0]) - (cw ? CW_GAP + CW_W + STOP_GAP : 1);
      lanes.forEach((ln, j) => {
        const st = { laneId: ln.id, s: sStop * laneLength(ln) / laneLength(lanes[0]), junction: id, signal: sigId };
        net.stops.push(st); stops.push(st);
        const ps = st.s - 6;
        if (ps > 5) { const p = pointAt(ln, ps); net.marks.push({ kind: 'arrow', arrow: arrowName(X.turns[j]), x: p.x, y: p.y, a: p.a, laneId: ln.id }); }
      });
      const edge = (ln, side) => { const p = pointAt(ln, sStop); return [p.x - Math.sin(p.a) * side * ln.width / 2, p.y + Math.cos(p.a) * side * ln.width / 2]; };
      net.lines.push({ type: 'stop', pts: [edge(lanes[0], 1), edge(lanes[lanes.length - 1], -1)] });
    }
    if (cw) for (const X of arms) {
      const r = X.r, w = r.width, L = r.length, ref = X.atEnd ? L - CW_GAP - CW_W / 2 : CW_GAP + CW_W / 2;
      const p = r.at(ref), nx = -Math.sin(p.a), ny = Math.cos(p.a), a0 = -(r.lanesFwd * w + 1), a1 = r.lanesBack * w + 1;
      const cid = `${id}:cw${X.k}`, lanes = [];
      for (const lid of r.fwd) { const k = laneLength(net.lanes[lid]) / L; lanes.push({ laneId: lid, s0: (ref - CW_W / 2) * k, s1: (ref + CW_W / 2) * k }); }
      for (const lid of r.back) { const k = laneLength(net.lanes[lid]) / L; lanes.push({ laneId: lid, s0: (L - ref - CW_W / 2) * k, s1: (L - ref + CW_W / 2) * k }); }
      const pts = [[p.x + nx * a0, p.y + ny * a0], [p.x + nx * a1, p.y + ny * a1]];
      net.crosswalks.push({ id: cid, junction: id, arm: X.k, pts, width: CW_W, lanes, signal: sigId });
      net.lines.push({ type: 'crosswalk', pts, width: CW_W });
      cwIds.push(cid);
    }
    net.areas.push({ kind: 'junction', id, pts: hull(corners) });

    if (o.signal) {
      const unprot = !o.signal.protectedLeft;
      const phases = makePhases(net, id, arms, conns, o.signal, unprot);
      const posts = arms.filter(X => X.inIds.length).map(X => {
        const ls = X.inIds.map(i => net.lanes[i]), ends = ls.map(l => pointAt(l, laneLength(l)));
        const ex = ends.reduce((s, p) => s + p.x, 0) / ends.length, ey = ends.reduce((s, p) => s + p.y, 0) / ends.length;
        const hx = Math.cos(X.h), hy = Math.sin(X.h), along = (cx - ex) * hx + (cy - ey) * hy;
        return { x: ex + hx * 2 * along, y: ey + hy * 2 * along, a: wrap(X.h + PI), arm: X.k, lanes: X.inIds.slice() };
      });
      net.signals.push({ id: sigId, junction: id, x: cx, y: cy, heads: unprot ? 'three' : 'four', unprotected: unprot,
        cycle: phases.reduce((s, p) => s + p.dur, 0), offset: o.signal.offset || 0, phases,
        stops: stops.map(s => ({ laneId: s.laneId, s: s.s })), posts });
      if (unprot) for (const P of posts) {
        const X = arms[P.arm];
        if (X.turns.some(t => t.includes('left'))) net.signs.push({ kind: 'unprotected-left', x: P.x, y: P.y, a: P.a, text: '비보호' });
      }
    }
    return { id, connectors: conns.map(c => c.id), stops, signal: sigId, crosswalks: cwIds };
  }

  // 축(마주 보는 팔 쌍)마다 직진 phase(+보호 좌회전 phase), 각각 뒤에 황색. 보행 신호는 보호 이동과 겹치지 않는 횡단보도만.
  function makePhases(net, jid, arms, conns, sig, unprot) {
    const axes = [], used = new Set();
    for (const X of arms) {
      if (used.has(X) || !X.inIds.length) continue;
      const Y = arms.find(A => A !== X && !used.has(A) && A.inIds.length && Math.abs(wrap(A.h - X.h - PI)) < PI / 4);
      used.add(X); if (Y) used.add(Y);
      axes.push(Y ? [X, Y] : [X]);
    }
    const all = arms.flatMap(A => A.inIds.map((id, j) => ({ id, t: A.turns[j], A })));
    const hasLeft = t => t.includes('left') || t.includes('uturn');
    const greens = [];
    for (const ax of axes) {
      const pair = ax.length === 2, st = {};
      for (const l of all) {
        if (!ax.includes(l.A)) st[l.id] = 'R';
        else if (!pair && !unprot && hasLeft(l.t)) st[l.id] = 'LG';
        else if (l.t.includes('straight') || l.t.includes('right')) st[l.id] = 'G';
        else st[l.id] = unprot ? 'G' : 'R';
      }
      greens.push({ w: 2, state: st });
      if (pair && !unprot && all.some(l => ax.includes(l.A) && hasLeft(l.t))) {
        const sl = {};
        for (const l of all) sl[l.id] = ax.includes(l.A) && hasLeft(l.t) ? 'LG' : 'R';
        greens.push({ w: 1, state: sl });
      }
    }
    const cycle = sig.cycle || 90, gTot = cycle - Y_DUR * greens.length, sw = greens.reduce((s, g) => s + g.w, 0);
    if (gTot < 8 * greens.length) throw new Error(`신호 주기 ${cycle}s가 너무 짧음`);
    const cws = net.crosswalks.filter(c => c.junction === jid);
    const phases = [];
    for (const g of greens) {
      const walk = cws.filter(c => !conns.some(cn => (cn.arm === c.arm || cn.toArm === c.arm) && cn.turn !== 'right'
        && movement(g.state[cn.from], cn.turn, unprot) === 'protected')).map(c => c.id);
      phases.push({ dur: Math.round(gTot * g.w / sw), state: g.state, walk });
      const y = {};
      for (const k in g.state) y[k] = g.state[k] === 'R' ? 'R' : 'Y';
      phases.push({ dur: Y_DUR, state: y, walk: [] });
    }
    return phases;
  }

  const junction4 = (net, o) => { if (o.arms.length !== 4) throw new Error('junction4: 팔 4개 필요'); return junction(net, o); };
  const junction3 = (net, o) => { if (o.arms.length !== 3) throw new Error('junction3: 팔 3개 필요'); return junction(net, o); };

  const api = { CW_GAP, CW_W, STOP_GAP, straightRoad, curvedRoad, connect, junction4, junction3 };
  Object.assign(R, api);
  return api;
})();
if (typeof module !== 'undefined') module.exports = PP_RBUILD;
