// 붕붕이 — 도로 저작 도우미: 직선·곡선 도로, 사거리·삼거리(연결 차로·정지선·횡단보도·신호), connect.
// 만든 함수는 PP_ROADS에 붙는다(브라우저는 roads.js 다음에 이 파일을 로드).
const PP_RBUILD = (function ppRBuild() {
  const R = typeof PP_ROADS !== 'undefined' ? PP_ROADS : require('./roads.js');
  const { PI, clamp, wrap, addLane, laneLength, pointAt, connectorPts, movement } = R;
  const CW_GAP = 1, CW_W = 4, STOP_GAP = 2, Y_DUR = 3; // 교차로 가장자리↔횡단보도, 횡단보도 폭, 횡단보도↔정지선, 황색
  const TURN_A = { left: PI / 2, straight: 0, right: -PI / 2, uturn: PI };
  const TURNS = ['left', 'straight', 'right', 'uturn'];
  const TURN_TOL = PI / 3; // ponytail: 팔 각도가 불규칙한 교차로(5갈래 등)도 60°까지 가장 가까운 팔로 연결, 넘으면 에러
  const TURN_TOL2 = 5 * PI / 12; // ponytail: 남은 회전만 75°까지(비스듬히 갈라지는 연결로). 90°면 직진 팔이 우회전으로 잡힌다

  // 꺾은선 기하: 누적 길이로 선형 보간. 꺾임점 a는 앞뒤 선분 방향 평균, 바깥쪽 오프셋은 부채꼴 점으로 2m 간격 유지.
  function polyGeom(pts) {
    const P = pts.filter((p, i) => !i || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-6), N = P.length;
    if (N < 2) throw new Error('pts: 서로 다른 점 2개 이상 필요');
    const S = [0], H = [];
    for (let i = 1; i < N; i++) {
      const dx = P[i][0] - P[i - 1][0], dy = P[i][1] - P[i - 1][1];
      S.push(S[i - 1] + Math.hypot(dx, dy)); H.push(Math.atan2(dy, dx));
    }
    const L = S[N - 1], E = 1e-9;
    const vh = i => { const x = Math.cos(H[i - 1]) + Math.cos(H[i]), y = Math.sin(H[i - 1]) + Math.sin(H[i]); return Math.hypot(x, y) < E ? H[i - 1] : Math.atan2(y, x); };
    const at = t => {
      t = clamp(t, 0, L);
      let k = 0; while (k < N - 2 && t > S[k + 1]) k++;
      const u = (t - S[k]) / (S[k + 1] - S[k]);
      const a = t - S[k] < E && k > 0 ? vh(k) : S[k + 1] - t < E && k + 1 < N - 1 ? vh(k + 1) : H[k];
      return { x: P[k][0] + (P[k + 1][0] - P[k][0]) * u, y: P[k][1] + (P[k + 1][1] - P[k][1]) * u, a };
    };
    const sample = (off, s0, s1) => {
      const br = [{ s: s0 }];
      for (let i = 1; i < N - 1; i++) if (S[i] > s0 + E && S[i] < s1 - E) br.push({ s: S[i], v: i });
      br.push({ s: s1 });
      const pts = [], put = (x, y, a) => pts.push([x - Math.sin(a) * off, y + Math.cos(a) * off]);
      br.forEach((b, j) => {
        if (j) { const n = Math.max(1, Math.ceil((b.s - br[j - 1].s) / 2)); for (let i = 1; i < n; i++) { const p = at(br[j - 1].s + (b.s - br[j - 1].s) * i / n); put(p.x, p.y, p.a); } }
        const d = b.v ? wrap(H[b.v] - H[b.v - 1]) : 0;
        if (b.v && off * d < 0) { // 바깥쪽 차로: 꺾임점 둘레 부채꼴
          const n = Math.ceil(Math.abs(off * d) / 2);
          for (let k = 0; k <= n; k++) put(P[b.v][0], P[b.v][1], H[b.v - 1] + d * k / n);
        } else { const p = at(b.s); put(p.x, p.y, p.a); }
      });
      return pts;
    };
    return { L, seg: () => 1, at, sample };
  }
  function geomOf(o, curved) {
    if (o.pts) return polyGeom(o.pts);
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
    if (g.sample) return g.sample(off, s0, s1);
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
    if (nb && o.median !== 'none') net.lines.push({ type: o.median, pts: samplePts(g, 0, 0, L) });
    net.lines.push({ type: 'white-solid', pts: samplePts(g, -nf * w, 0, L) });
    net.lines.push({ type: 'white-solid', pts: samplePts(g, nb * w, 0, L) });
    dividers(net, g, o, fwd, 'f');
    dividers(net, g, o, back, 'b');
    net.areas.push({ kind: 'road', id: o.id, pts: samplePts(g, nb * w, 0, L).concat(samplePts(g, -nf * w, 0, L).reverse()) });
    return { id: o.id, fwd, back, start: g.at(0), end: g.at(L), length: L, width: w, lanesFwd: nf, lanesBack: nb, at: g.at };
  }
  const straightRoad = (net, o) => road(net, o, false);
  const curvedRoad = (net, o) => road(net, o, true);
  const polyRoad = (net, o) => road(net, o, false); // o.pts 꺾은선

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
  // 유턴 연결선: 같은 반경 RU 원호 셋(오른쪽 α → 왼쪽 π+2α → 오른쪽 α)인 열쇠 구멍 모양. 차가 돌 수 있는 반경을 지키며
  // 옆으로 |v|(진입↔진출 차로 중심 간격)만큼 옮겨 간다. |v| ≥ 2·RU면 반원.
  const RU = 6; // ponytail: 셀토스 최소 회전 반경(5.3m) + 여유. 교차로 안쪽으로 약 2·RU 들어간다
  function uturnPts(pa, pb) {
    const c = Math.cos(pa.a), s = Math.sin(pa.a), dx = pb.x - pa.x, dy = pb.y - pa.y;
    const V = -s * dx + c * dy, sg = Math.sign(V) || 1, r = Math.max(RU, Math.abs(V) / 2);
    const al = Math.acos(Math.min(1, (Math.abs(V) / (2 * r) + 1) / 2));
    const W = (lu, lv) => [pa.x + c * lu - s * lv * sg, pa.y + s * lu + c * lv * sg];
    // 원호: 중심 (au,av), 시작 각 t0(중심에서 본 점의 방향), 회전 dt(+ = 왼쪽으로 돈다)
    const out = [], arc = (au, av, t0, dt) => {
      const n = Math.max(2, Math.ceil(Math.abs(dt) * r / 0.6));
      for (let i = 1; i <= n; i++) { const t = t0 + dt * i / n; out.push(W(au + r * Math.cos(t), av + r * Math.sin(t))); }
    };
    const cv = Math.abs(V) / 2;
    out.push(W(0, 0));
    if (al > 1e-6) arc(0, -r, PI / 2, -al);                   // 오른쪽으로 α
    arc(2 * r * Math.sin(al), cv, -PI / 2 - al, PI + 2 * al);    // 왼쪽으로 π+2α (중심 v = |V|/2)
    if (al > 1e-6) arc(0, Math.abs(V) + r, -PI / 2 + al, -al); // 오른쪽으로 α → 진출점
    out[out.length - 1] = [pb.x, pb.y];
    return out;
  }
  const arrowName = t => ['straight', 'left', 'right', 'uturn'].filter(x => t.includes(x)).join('-');

  // 회전별로 가장 가까운 각도의 팔(진출 차로 있는 팔만). 한 팔을 둘이 노리면 차이가 작은 회전이 갖고 나머지는 다음 후보.
  // TURN_TOL 안에서 못 정한 회전은 남은 팔 중 TURN_TOL2 안(비스듬히 갈라지는 연결로 등)으로.
  // arms: [{ h: 교차로로 들어오는 방향, outIds }], ts: 회전 목록 → { turn: arm }
  function pickArms(arms, X, ts) {
    const cand = [];
    for (const T of ts) for (const A of arms) if (A !== X && A.outIds.length) cand.push({ T, A, d: Math.abs(wrap(A.h + PI - wrap(X.h + TURN_A[T]))) });
    cand.sort((p, q) => p.d - q.d);
    const pick = {}, taken = new Set();
    for (const tol of [TURN_TOL, TURN_TOL2])
      for (const c of cand) if (c.d <= tol && !pick[c.T] && !taken.has(c.A)) { pick[c.T] = c.A; taken.add(c.A); }
    return pick;
  }

  // 교차로. arms: [{ road(straightRoad 결과), turns: 진입 차로별 회전 목록(1차로→바깥), to?: { 회전: 팔 번호 | [팔 번호…] } }]
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
    for (const X of arms) {
      // 회전마다 가장 가까운 각도의 팔
      const pick = pickArms(arms, X, TURNS.filter(T => T !== 'uturn' && X.inIds.some((_, j) => X.turns[j].includes(T))));
      for (const T of TURNS) {
      const Ls = X.inIds.filter((_, j) => X.turns[j].includes(T));
      if (!Ls.length) continue;
      const Ys = [].concat(T === 'uturn' ? pick.uturn || X : pick[T] || []);
      if (!Ys.length || Ys.some(Y => !Y.outIds.length)) throw new Error(`${id}: 팔 ${X.k}에서 ${T} 갈 곳 없음`);
      Ys.forEach((Y, n) => {  // 같은 회전의 두 번째 팔부터 연결 차로 id에 번호(left2…)
      const O = Y.outIds;
      Ls.forEach((inId, j) => {
        const oi = T === 'right' || T === 'uturn' ? O.length - 1 - Math.min(Ls.length - 1 - j, O.length - 1)
          : T === 'straight' ? clamp(O.length - Ls.length + j, 0, O.length - 1) : Math.min(j, O.length - 1);
        const a = net.lanes[inId], b = net.lanes[O[oi]];
        const pa = pointAt(a, laneLength(a)), pb = pointAt(b, 0), cid = `${id}:${inId}>${T}${n ? n + 1 : ''}`;
        addLane(net, { id: cid, pts: T === 'uturn' ? uturnPts(pa, pb) : connectorPts(pa, pa.a, pb, pb.a), width: a.width, next: [b.id], left: null, right: null,
          limit: a.limit, kind: 'connector', turn: T, road: id, from: inId, arm: X.k, toArm: Y.k });
        a.next.push(cid);
        conns.push(net.lanes[cid]);
      });
      });
      }
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
        if (ps > 5 && X.turns[j].length) { const p = pointAt(ln, ps); net.marks.push({ kind: 'arrow', arrow: arrowName(X.turns[j]), x: p.x, y: p.y, a: p.a, laneId: ln.id }); }
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
      // 마주 보는 팔 = TURN_TOL 안에서 가장 가까운 팔(비스듬한·5갈래 교차로도 직진 짝과 같은 기준)
      let Y = null, dY = TURN_TOL;
      for (const A of arms) {
        const d = Math.abs(wrap(A.h - X.h - PI));
        if (A !== X && !used.has(A) && A.inIds.length && d < dY) { Y = A; dY = d; }
      }
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

  // 차로 감소: from(직선, 편도 n차로) 끝에서 to(직선, 편도 n−1차로)가 시작. 안쪽 n−1 차로는 to로 바로 잇고, 바깥 차로는 to 바깥에
  // 나란히 붙는 합류 차로(kind 'merge', id:end, next 없음)로 잇는다. length − 15 m까지 폭 그대로, 그 뒤 taper m 동안 바깥 경계가 사선으로 줄어 없어진다.
  // endS(= length − wait + 4): 앞범퍼가 닿으면 실패(drive-score)·사선 드럼통 시작 근처. AI는 endS − 10에서 기다린다(traffic.js).
  const DRUM_OUT = 0.9; // 차로 안 ±0.7m(차로 반폭 − 차 반폭)까지 붙어 방향 ±0.05rad로 달려도 endS 전 드럼통에 안 닿는다(0.85부터)
  function laneDrop(net, o) {
    o = Object.assign({ length: 100, taper: 40, wait: 10 }, o);
    const F = o.from, T = o.to, n = F.lanesFwd, w = F.width, A = o.length, full = A - 15, tEnd = full + o.taper, endS = A - o.wait + 4;
    if (T.lanesFwd !== n - 1) throw new Error(`${o.id}: 차로 ${n} → ${T.lanesFwd}`);
    if (Math.hypot(F.end.x - T.start.x, F.end.y - T.start.y) > 1e-6) throw new Error(`${o.id}: from 끝이 to 시작과 다름`);
    if ((F.lanesBack || 0) !== (T.lanesBack || 0)) throw new Error(`${o.id}: 반대 방향 차로 ${F.lanesBack || 0} ≠ ${T.lanesBack || 0}`);
    const c = Math.cos(T.start.a), s = Math.sin(T.start.a);
    const P = (u, off) => [T.start.x + c * u - s * off, T.start.y + s * u + c * off];
    connect(net, F.fwd.slice(0, n - 1), T.fwd);
    if (T.lanesBack && F.lanesBack) connect(net, T.back, F.back);
    const id = `${o.id}:end`, left = T.fwd[n - 2], outer = F.fwd[n - 1];
    addLane(net, { id, pts: [P(0, -(n - 0.5) * w), P(A, -(n - 0.5) * w)], width: w, next: [], left, right: null,
      limit: F.limit != null ? F.limit : net.lanes[outer].limit, kind: 'merge', road: o.id, along: { lane: left, s0: 0 }, endS });
    net.lanes[outer].next.push(id);
    net.lanes[left].right = id;
    net.changes.push({ from: id, to: left, s0: 0, s1: endS, allowed: true }, { from: id, to: left, s0: endS, s1: A, allowed: false },
      { from: left, to: id, s0: 0, s1: laneLength(net.lanes[left]), allowed: false });
    net.areas.push({ kind: 'road', id, pts: [P(0, -(n - 1) * w), P(tEnd, -(n - 1) * w), P(full, -n * w), P(0, -n * w)] });
    // to의 바깥 실선은 사선이 닿는 곳부터, 합류 구간은 점선 + 사선 바깥 실선
    const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.01, e0 = P(0, -(n - 1) * w);
    const edge = net.lines.find(l => l.type === 'white-solid' && near(l.pts[0], e0) && l.pts.length === 2);
    if (edge) edge.pts[0] = P(tEnd, -(n - 1) * w);
    net.lines.push({ type: 'white-solid', pts: [P(0, -n * w), P(full, -n * w), P(tEnd, -(n - 1) * w)] });
    net.lines.push({ type: 'white-dashed', pts: [e0, P(endS, -(n - 1) * w)] });
    // 드럼통은 사선 실선보다 DRUM_OUT m 바깥: 합류 차로 안 차(가운데 ±0.7m)가 endS 전에는 닿지 않는다(그 앞은 laneEnd 실패가 먼저)
    for (let u = full; u <= tEnd + 1e-9; u += 5) { const [x, y] = P(u, -n * w + w * (u - full) / o.taper - DRUM_OUT); net.marks.push({ kind: 'drum', x, y }); }
    // 진로 변경 유도 화살표(바깥 차로 끝 60·30m 전, 합류 차로 20·50m), '우측 차로 없어짐' 경고 표지(끝 150m 전·합류 차로 시작)
    const Lo = laneLength(net.lanes[outer]);
    for (const [lid, at] of [[outer, Lo - 60], [outer, Lo - 30], [id, 20], [id, 50]]) {
      if (at < 0) continue;
      const p = pointAt(net.lanes[lid], at);
      net.marks.push({ kind: 'arrow', arrow: 'merge-left', x: p.x, y: p.y, a: p.a, laneId: lid });
    }
    for (const [lid, at] of [[outer, Lo - 150], [id, 5]]) {
      if (at < 0) continue;
      const p = pointAt(net.lanes[lid], at), off = w / 2 + 1.5;
      net.signs.push({ kind: 'lane-end', x: p.x + Math.sin(p.a) * off, y: p.y - Math.cos(p.a) * off, a: p.a, text: '우측 차로 없어짐' });
    }
    return { mergeId: id, endS };
  }

  const junction4 = (net, o) => { if (o.arms.length !== 4) throw new Error('junction4: 팔 4개 필요'); return junction(net, o); };
  const junction3 = (net, o) => { if (o.arms.length !== 3) throw new Error('junction3: 팔 3개 필요'); return junction(net, o); };

  const api = { CW_GAP, CW_W, STOP_GAP, TURN_TOL, pickArms, straightRoad, curvedRoad, polyRoad, connect, laneDrop, junction, junction4, junction3 };
  Object.assign(R, api);
  return api;
})();
if (typeof module !== 'undefined') module.exports = PP_RBUILD;
