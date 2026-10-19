// 붕붕이 — 실제 지도: 도로 그래프(PP_OSMG) → net. polyRoad·junction·connect만 호출. 실패 교차로는 연결 없이 막다른 길.
// 단위 m, x 동·y 북. 구간 id = 그래프 seg id('s1'…), 교차로 id = 그래프 junction id('j1'…).
const PP_OSMC = (function ppOsmc() {
  const R = typeof PP_ROADS !== 'undefined' ? PP_ROADS : require('./roads.js');
  const G = typeof PP_OSMG !== 'undefined' ? PP_OSMG : require('./osm-graph.js');
  const { PI, wrap } = R;
  const PAD = 8;      // 팔 길이 H = 가장 넓은 붙은 도로 반폭 + 8m (시내 미션과 같은 모서리 회전 여유)
  const MIN_LEN = 5;  // 잘린 뒤 이보다 짧은 교차로 사이 구간은 실패(합칠 수 없을 때), 교차로-끝 토막은 버림
  // ponytail: 잘린 뒤 MIN_LEN도 안 남는 구간으로 이어진 교차로들은 하나로 합친다(복선 간선의 4노드 사거리·엇갈린 사거리).
  // 합친 노드가 중심에서 이보다 멀면 합치지 않고 실패. 크면 연달은 골목 교차로가 한 덩어리로 뭉치고 작으면 간선 사거리가 실패한다.
  const JOIN_R = 35;
  // ponytail: 끝나는 일방 도로와 시작하는 반대 방향 일방 도로가 이 안이면 유턴으로 잇는다(복선 간선 두 차도 사이 거리). 크면 엉뚱한 길로 튄다
  const EDGE_UTURN = 50;
  const CONN_MAX = 70;  // 교차로 연결을 더 붙일 때 연결 차로 길이 상한(불변식 80m 아래로 여유)
  const LOOP_MAX = 60;  // osm-graph와 같은 값: 합친 교차로 안을 도는 이보다 짧은 구간은 내부 연결로 보고 버림
  const SIG_R = 30, CW_R = 15;
  const CYCLE = 70;   // 비보호 시내 미션(city-unprotected)과 같은 주기
  const TURNS = ['left', 'straight', 'right'];
  const TURN_A = { left: PI / 2, straight: 0, right: -PI / 2, uturn: PI };  // roads-build와 같은 회전 각

  const plen = pts => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; };
  // 꺾은선의 호 길이 [s0, s1] 부분
  function cut(pts, s0, s1) {
    const out = [], lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    let acc = 0;
    for (let i = 1; i < pts.length && acc < s1; i++) {
      const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]), a = acc;
      acc += L;
      if (!L || acc < s0) continue;
      if (!out.length) out.push(lerp(pts[i - 1], pts[i], (Math.max(s0, a) - a) / L));
      out.push(lerp(pts[i - 1], pts[i], (Math.min(s1, acc) - a) / L));
    }
    return out;
  }
  // 꺾은선이 중심 c에서 반지름 h를 처음 벗어나는 호 길이(못 벗어나면 전체 길이)
  function exitS(pts, c, h) {
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
      const fx = ax - c[0], fy = ay - c[1], q = fx * fx + fy * fy - h * h;
      if (q >= 0) return acc;
      if (L && Math.hypot(bx - c[0], by - c[1]) >= h) {
        const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy);
        return acc + (-B + Math.sqrt(B * B - 4 * A * q)) / (2 * A) * L;
      }
      acc += L;
    }
    return acc;
  }
  // 진입 차로 기본 회전: 1차로뿐이면 좌·직·우, 아니면 1차로 좌·직, 중간 직, 바깥 직·우
  const defTurns = n => n === 1 ? [TURNS.slice()] : Array.from({ length: n }, (_, i) => !i ? ['left', 'straight'] : i === n - 1 ? ['straight', 'right'] : ['straight']);
  const isJ = e => typeof e === 'string' && e[0] === 'j';
  const halfW = p => Math.max(p.props.fwd, p.props.back) * p.props.width;

  // junction이 throw하면 그 교차로가 만든 것만 되돌린다(연결 차로 id는 `${jid}:${inId}>${turn}…`)
  function tryJunction(net, o, inIds) {
    const n = {}, nx = inIds.map(id => [net.lanes[id], net.lanes[id].next.length]);
    for (const k in net) if (Array.isArray(net[k])) n[k] = net[k].length;
    try { R.junction(net, o); return true; } catch (e) {
      for (const k in n) net[k].length = n[k];
      for (const k in net.lanes) if (k.startsWith(o.id + ':')) delete net.lanes[k];
      for (const [l, len] of nx) l.next.length = len;
      return false;
    }
  }

  // 교차로별 H = 붙은 가장 넓은 도로 반폭 + PAD
  function hOf(segs) {
    const H = {};
    for (const p of segs) for (const e of [p.a, p.b]) if (isJ(e)) H[e] = Math.max(H[e] || 0, halfW(p) + PAD);
    return H;
  }
  // 구간 양 끝을 교차로 중심에서 H만큼 잘라낸 [s0, s1]
  function trim(p, jById, H) {
    const at = e => isJ(e) ? [jById.get(e).x, jById.get(e).y] : null, ca = at(p.a), cb = at(p.b);
    return [ca ? exitS(p.pts, ca, H[p.a]) : 0, plen(p.pts) - (cb ? exitS(p.pts.slice().reverse(), cb, H[p.b]) : 0)];
  }

  // 잘린 뒤 MIN_LEN도 안 남는 구간으로 이어진 교차로를 합친다(합친 노드가 중심에서 JOIN_R 안일 때만). 합쳐진 그래프 사본을 돌려준다
  function join(g) {
    const jById = new Map(g.junctions.map(j => [j.id, j])), H = hOf(g.segs), ord = new Map(g.junctions.map((j, i) => [j.id, i]));
    const par = new Map(g.junctions.map(j => [j.id, j.id])), mem = new Map(g.junctions.map(j => [j.id, j.nodes.slice()]));
    const find = a => { while (par.get(a) !== a) a = par.get(a); return a; };
    const cands = g.segs.filter(p => isJ(p.a) && isJ(p.b) && p.a !== p.b).map(p => { const [s0, s1] = trim(p, jById, H); return { p, room: s1 - s0 }; })
      .filter(c => c.room < MIN_LEN).sort((u, v) => plen(u.p.pts) - plen(v.p.pts));
    for (const { p } of cands) {
      const a = find(p.a), b = find(p.b);
      if (a === b) continue;
      const ns = mem.get(a).concat(mem.get(b)), xy = ns.map(id => g.nodes[id]).filter(Boolean);
      const cx = xy.reduce((t, q) => t + q[0], 0) / xy.length, cy = xy.reduce((t, q) => t + q[1], 0) / xy.length;
      if (xy.some(q => Math.hypot(q[0] - cx, q[1] - cy) > JOIN_R)) continue;
      const [r, o] = ord.get(a) < ord.get(b) ? [a, b] : [b, a];
      par.set(o, r); mem.set(r, ns);
    }
    const junctions = [], nj = new Map();
    for (const j of g.junctions) if (find(j.id) === j.id) {
      const ns = mem.get(j.id), xy = ns.length === j.nodes.length ? null : ns.map(id => g.nodes[id]).filter(Boolean);
      const q = xy ? { x: xy.reduce((t, p) => t + p[0], 0) / xy.length, y: xy.reduce((t, p) => t + p[1], 0) / xy.length } : { x: j.x, y: j.y };
      const J = Object.assign({}, j, q, { nodes: ns, segs: [] });
      junctions.push(J); nj.set(J.id, J);
    }
    const segs = [];
    for (const p of g.segs) {
      const a = isJ(p.a) ? find(p.a) : p.a, b = isJ(p.b) ? find(p.b) : p.b;
      if (a === b && isJ(a) && plen(p.pts) < LOOP_MAX) continue;  // 합친 교차로 안쪽 구간
      segs.push(a === p.a && b === p.b ? p : Object.assign({}, p, { a, b }));
    }
    // 잘리면 MIN_LEN도 안 남는 팔이 2갈래 노드로 다음 구간과 이어지면(태그만 다른 짧은 토막) 다음 구간에 붙여 한 팔로.
    // 붙인 구간은 다음 구간 자리에 두고(순서 유지), 여전히 짧으면 다시 본다
    const H2 = hOf(segs), at = new Map(), slot = new Map(segs.map((p, i) => [p, i]));
    for (const p of segs) for (const e of [p.a, p.b]) if (!isJ(e)) (at.get(e) || at.set(e, []).get(e)).push(p);
    const work = segs.filter(p => isJ(p.a) !== isJ(p.b));
    while (work.length) {
      const p = work.pop();
      if (!slot.has(p)) continue;
      const n = isJ(p.a) ? p.b : p.a, l = at.get(n), fwd = p.b === n;  // fwd: p가 교차로 → n
      if (!l || l.length !== 2) continue;
      const [s0, s1] = trim(p, nj, H2), q0 = l[0] === p ? l[1] : l[0];
      if (s1 - s0 >= MIN_LEN || q0 === p || q0.props.oneway !== p.props.oneway) continue;
      const q = q0[fwd ? 'a' : 'b'] === n ? q0 : !q0.props.oneway && flipSeg(q0), far = q && (fwd ? q.b : q.a);
      if (!q || far === (fwd ? p.a : p.b)) continue;
      const m = Object.assign({}, q, fwd ? { a: p.a, pts: p.pts.concat(q.pts.slice(1)) } : { b: p.b, pts: q.pts.concat(p.pts.slice(1)) });
      segs[slot.get(q0)] = m; segs[slot.get(p)] = null;
      slot.set(m, slot.get(q0)); slot.delete(p); slot.delete(q0); at.delete(n);
      if (!isJ(far)) { at.set(far, at.get(far).map(x => x === q0 ? m : x)); work.push(m); }
    }
    segs.splice(0, segs.length, ...segs.filter(Boolean));
    for (const q of segs) for (const e of q.a === q.b ? [q.a] : [q.a, q.b]) if (isJ(e)) nj.get(e).segs.push(q.id);
    return Object.assign({}, g, { junctions, segs });
  }
  // 양방향 구간 방향 뒤집기(차로 수·turn:lanes도 맞바꿈)
  function flipSeg(q) {
    const t = q.props.turns, props = Object.assign({}, q.props, { fwd: q.props.back, back: q.props.fwd });
    if (t) props.turns = { fwd: t.back, back: t.fwd };
    return Object.assign({}, q, { a: q.b, b: q.a, pts: q.pts.slice().reverse(), props });
  }

  // 구간 나누기: 같은 교차로로 돌아오는 고리는 반으로('m' 노드), 막다른 일방 도로 끝 옆을 지나는 반대 방향 일방 도로는
  // 그 옆 점에서('u' 노드) 나눠 유턴 연결 links를 만든다. 교차로 segs 목록도 다시 만든 그래프 사본을 돌려준다
  function split(g) {
    const ps = [], links = [];
    for (const s of g.segs) {
      if (s.a !== s.b || !isJ(s.a)) { ps.push(s); continue; }
      const L = plen(s.pts);
      ps.push(Object.assign({}, s, { b: 'm' + s.id, pts: cut(s.pts, 0, L / 2) }), Object.assign({}, s, { id: s.id + 'b', a: 'm' + s.id, pts: cut(s.pts, L / 2, L) }));
    }
    const H = hOf(ps), jById = new Map(g.junctions.map(j => [j.id, j])), deg = new Map();
    for (const p of ps) for (const e of [p.a, p.b]) if (!isJ(e)) deg.set(e, (deg.get(e) || 0) + 1);
    // 일방 도로가 끝나는 막다른 노드(주로 영역 밖으로 나가는 복선 간선의 한 차도) → EDGE_UTURN 안 반대 방향 일방 도로
    const box = new WeakMap(), boxOf = q => box.get(q) || box.set(q, q.pts.reduce((b, [x, y]) => [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)], [Infinity, Infinity, -Infinity, -Infinity])).get(q);
    for (const n of ps.filter(p => p.props.oneway && !isJ(p.b) && deg.get(p.b) === 1).map(p => p.b)) {
      const D = ps.find(p => p.b === n), P = D.pts[D.pts.length - 1], Q = D.pts[D.pts.length - 2], a = Math.atan2(P[1] - Q[1], P[0] - Q[0]);
      let best = null;
      for (const q of ps) {
        const b = boxOf(q);
        if (q === D || !q.props.oneway || q.layer !== D.layer || P[0] < b[0] - EDGE_UTURN || P[0] > b[2] + EDGE_UTURN || P[1] < b[1] - EDGE_UTURN || P[1] > b[3] + EDGE_UTURN) continue;
        const L = plen(q.pts), [s0, s1] = trim(q, jById, H);
        for (let i = 1, acc = 0; i < q.pts.length; i++) {
          const [ax, ay] = q.pts[i - 1], [bx, by] = q.pts[i], l = Math.hypot(bx - ax, by - ay);
          if (l && Math.abs(wrap(Math.atan2(by - ay, bx - ax) - a)) > 2 * PI / 3) {
            const t = Math.max(0, Math.min(1, ((P[0] - ax) * (bx - ax) + (P[1] - ay) * (by - ay)) / (l * l)));
            const d = Math.hypot(ax + (bx - ax) * t - P[0], ay + (by - ay) * t - P[1]);
            // 나눈 두 토막 모두 잘린 뒤 MIN_LEN 이상. 교차로 아닌 시작점 가까이면 시작점에 바로 잇는다(at = 0)
            let at = acc + t * l;
            if (at < s0 + MIN_LEN) at = s0 === 0 && at < MIN_LEN ? 0 : s0 + MIN_LEN;
            if (d <= EDGE_UTURN && at <= s1 - MIN_LEN && (!best || d < best.d)) best = { q, at, L, d };
          }
          acc += l;
        }
      }
      if (!best) continue;
      const { q, at, L } = best, u = 'u' + (links.length + 1);
      if (!at) { links.push([D.id, q.id]); continue; }  // 반대 차도가 바로 거기서 시작
      const q2 = Object.assign({}, q, { id: q.id + u, a: u, pts: cut(q.pts, at, L) });
      ps.splice(ps.indexOf(q), 1, Object.assign({}, q, { b: u, pts: cut(q.pts, 0, at) }), q2);
      links.push([D.id, q2.id]);
    }
    const junctions = g.junctions.map(j => Object.assign({}, j, { segs: ps.filter(p => p.a === j.id || p.b === j.id).map(p => p.id) }));
    return { graph: Object.assign({}, g, { junctions, segs: ps }), links };
  }

  function convert(osm) {
    const { graph, links } = split(join(G.build(osm))), net = R.newNet(), failed = [], ps = graph.segs;
    const H = hOf(ps), bad = new Set(), jById = new Map(graph.junctions.map(j => [j.id, j]));

    // 구간 → polyRoad (교차로 쪽 끝은 중심에서 H만큼 잘라냄)
    const built = [];
    for (const p of ps) {
      const [s0, s1] = trim(p, jById, H);
      if (s1 - s0 < MIN_LEN) {
        // 교차로와 교차로 아닌 노드 사이 짧은 토막(막다른 진입로·서비스 도로 끝, join에서 못 이어 붙인 것)은
        // 교차로를 실패시키지 않고 버린다. 교차로 사이 짧은 구간만 실패
        if (isJ(p.a) && isJ(p.b)) for (const e of [p.a, p.b]) bad.add(e);
        continue;
      }
      const q = p.props, r = R.polyRoad(net, { id: p.id, pts: cut(p.pts, s0, s1), width: q.width, lanesFwd: q.fwd, lanesBack: q.back, limit: q.limit, median: q.median });
      built.push({ p, r });
    }

    // 2갈래 끝(교차로 아님): 들어오는 차로 → 나가는 차로. 끝끼리 만나면 layer가 달라도 잇는다(터널·고가 입구)
    const ends = new Map();
    for (const B of built) for (const atEnd of [false, true]) {
      const e = atEnd ? B.p.b : B.p.a;
      if (isJ(e)) continue;
      (ends.get(e) || ends.set(e, []).get(e)).push({ r: B.r, atEnd });
    }
    const io = E => E.atEnd ? [E.r.fwd, E.r.back] : [E.r.back, E.r.fwd];
    for (const l of ends.values()) {
      if (l.length === 2) {
        const [[i0, o0], [i1, o1]] = [io(l[0]), io(l[1])];
        if (i0.length && o1.length) R.connect(net, i0, o1);
        if (i1.length && o0.length) R.connect(net, i1, o0);
      }
      // 갈 곳 없는 양방향 도로 끝(막다른 길·일방과 마주침)은 같은 도로 반대 방향으로 유턴
      for (const E of l) {
        const [i, o] = io(E);
        if (i.length && o.length && i.every(id => !net.lanes[id].next.length)) for (const id of R.connect(net, i, o)) net.lanes[id].turn = 'uturn';
      }
    }
    // 막다른 일방 도로 끝 → 옆 반대 방향 일방 도로 유턴(split의 links). 1차로끼리만(나머지 차로는 차로를 바꿔 유턴)
    const byId = new Map(built.map(B => [B.p.id, B.r]));
    for (const [f, t] of links) {
      const a = byId.get(f), b = byId.get(t);
      if (a && b && a.fwd.every(id => !net.lanes[id].next.length)) for (const id of R.connect(net, a.fwd[0], b.fwd[0])) net.lanes[id].turn = 'uturn';
    }

    // 교차로
    // 신호 횡단보도 → 가장 가까운 교차로 하나에만(옆 골목 교차로가 큰 사거리 횡단보도를 가로채지 않게). 교차로별 가장 가까운 거리
    const sigX = new Map();
    for (const q of graph.sigCrossings || []) {
      let best = null;
      for (const j of graph.junctions) { const d = Math.hypot(q[0] - j.x, q[1] - j.y); if (!best || d < best.d) best = { id: j.id, d }; }
      if (best && !(sigX.get(best.id) <= best.d)) sigX.set(best.id, best.d);
    }
    const byJ = new Map();
    for (const B of built) for (const e of new Set([B.p.a, B.p.b])) if (isJ(e)) (byJ.get(e) || byJ.set(e, []).get(e)).push(B);
    for (const j of graph.junctions) {
      const arms = (byJ.get(j.id) || []).map(B => {
        const r = B.r, atEnd = B.p.b === j.id, inIds = atEnd ? r.fwd : r.back;
        const given = B.p.props.turns && B.p.props.turns[atEnd ? 'fwd' : 'back'];
        const turns = (given && given.length === inIds.length ? given : defTurns(inIds.length)).map(t => t.slice());
        return { r, inIds, outIds: atEnd ? r.back : r.fwd, turns, tagged: !!given && given.length === inIds.length, h: wrap(atEnd ? r.end.a : r.start.a + PI) };
      });
      if (!arms.length) { if (bad.has(j.id)) failed.push(j.id); continue; }
      let ok = !bad.has(j.id);
      if (ok) {
        // 회전별 진출 팔 = junction과 같은 선택 규칙(pickArms). 팔이 많거나(합친 교차로) 각도가 불규칙해 못 가는 팔이 남으면
        // (1) X에서 못 가는 팔은 가장 가까운 좌·직·우에 더 붙이고(turn:lanes 있는 팔 제외. 일방→일방이 유턴 방향 30° 안이면
        //     복선 도로의 반대 차도라 유턴 금지대로 뺀다. 양방향 도로끼리 좁게 갈라진 팔은 급회전으로 잇는다)
        // (2) 그래도 아무도 못 가는 진출 팔은 각도가 가장 가까운 회전(유턴 포함)에 붙여 경로가 끊기지 않게 한다
        const picks = arms.map(X => {
          const pick = R.pickArms(arms, X, TURNS.filter(T => X.turns.some(t => t.includes(T))));
          if (X.outIds.length && X.turns.some(t => t.includes('uturn'))) pick.uturn = X;
          for (const T in pick) pick[T] = [pick[T]];
          return pick;
        });
        const has = (pk, A) => Object.values(pk).some(l => l.includes(A));
        const dOf = (X, A, T) => Math.abs(wrap(A.h + PI - wrap(X.h + TURN_A[T])));
        const add = (k, T, A) => {
          const X = arms[k], n = X.turns.length;
          if (!picks[k][T]) { picks[k][T] = []; X.turns.forEach((t, j) => { if (T === 'straight' || j === (T === 'right' ? n - 1 : 0)) t.push(T); }); }
          picks[k][T].push(A);
        };
        // 바깥 차로끼리 이은 연결 차로 길이(합친 큰 교차로의 먼 팔끼리는 너무 길어 더 붙이지 않음)
        const connLen = (X, A) => {
          const a = net.lanes[X.inIds[X.inIds.length - 1]], b = net.lanes[A.outIds[A.outIds.length - 1]], pa = R.pointAt(a, R.laneLength(a)), pb = R.pointAt(b, 0);
          return plen(R.connectorPts(pa, pa.a, pb, pb.a));
        };
        const nearest = (X, A, ts) => ts.reduce((p, T) => dOf(X, A, T) < dOf(X, A, p) ? T : p);
        arms.forEach((X, k) => {
          if (X.inIds.length && !X.tagged) for (const A of arms)
            if (A !== X && A.outIds.length && !has(picks[k], A) && !(dOf(X, A, 'uturn') < PI / 6 && !X.outIds.length && !A.inIds.length)
              && connLen(X, A) < CONN_MAX) add(k, nearest(X, A, TURNS), A);
        });
        for (const A of arms) {
          if (!A.outIds.length || picks.some(p => has(p, A))) continue;
          let best = null;
          arms.forEach((X, k) => {
            if (X === A || !X.inIds.length) return;
            const T = nearest(X, A, Object.keys(TURN_A));
            if (!best || dOf(X, A, T) < best.d) best = { k, T, d: dOf(X, A, T) };
          });
          if (best) add(best.k, best.T, A);
        }
        arms.forEach((X, k) => {
          X.turns = X.turns.map(t => t.filter(T => picks[k][T] || T === 'uturn' && X.outIds.length));
          // 회전이 다 걸러진 차로는 가장 가까운 차로의 회전을 같이 쓴다(일방 간선 옆 골목의 1차로 등)
          X.turns = X.turns.map((t, j) => t.length ? t : (X.turns.map((u, i) => [Math.abs(i - j), u]).filter(([, u]) => u.length).sort((p, q) => p[0] - q[0])[0] || [0, []])[1].slice());
          X.to = {};
          for (const T in picks[k]) X.to[T] = picks[k][T].map(A => arms.indexOf(A));
        });
        const near = (list, r) => list.some(q => Math.hypot(q[0] - j.x, q[1] - j.y) <= r);
        const signal = near(graph.signals, SIG_R) || sigX.get(j.id) <= H[j.id] + CW_R ? { cycle: CYCLE, protectedLeft: false } : null;
        // ponytail: crossing 노드는 교차로 단위로만 본다(한 팔에만 있어도 모든 팔에 횡단보도). 팔 단위 구분은 보행자 경로 필요할 때
        const crosswalks = !!signal || near(graph.crossings, H[j.id] + CW_R);
        ok = tryJunction(net, { id: j.id, x: j.x, y: j.y, arms: arms.map(X => ({ road: X.r, turns: X.turns, to: X.to })), signal, crosswalks },
          arms.flatMap(X => X.inIds));
      }
      if (!ok) { failed.push(j.id); console.warn('실제 지도: 교차로 실패', j.id, j.nodes.join(',')); }
    }
    return { net, graph, buildings: graph.buildings, failed, proj: graph.proj };
  }

  // 좌표 → 가장 가까운 일반 차로 위치. 같은 거리면 정방향(:f) 차로
  function snap(net, x, y) {
    let best = null;
    for (const id in net.lanes) {
      const l = net.lanes[id];
      if (l.kind !== 'normal') continue;
      const q = R.projectLane(l, x, y), fw = /:f\d+$/.test(id);
      if (q && (!best || q.dist < best.d - 1e-6 || (q.dist < best.d + 1e-6 && fw && !best.fw))) best = { laneId: id, s: q.s, d: q.dist, fw };
    }
    return best && { laneId: best.laneId, s: best.s };
  }

  return { convert, snap, CYCLE };
})();
if (typeof module !== 'undefined') module.exports = PP_OSMC;
