// 붕붕이 — 도로 네트워크: 형식·기하 유틸·신호. DOM 없음. 단위 m·s·rad, x 동·y 북.
// 한국은 우측통행: 차로 진행 방향 기준 중앙선은 왼쪽, 1차로가 중앙선에 가장 가깝다.
// offset 부호: 진행 방향 왼쪽이 +. 저작 도우미(straightRoad·junction4 등)는 roads-build.js가 여기에 붙인다.
const PP_ROADS = (function ppRoads() {
  const PI = Math.PI;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

  // lanes: id → lane, lines: 그리기용 차선, marks: 노면 표시, stops: 교차로 진입 차로 정지선,
  // crosswalks: 횡단보도(보행자 경로와 가로지르는 차로 구간), changes: 차선 변경 가능 구간
  const newNet = () => ({ lanes: {}, lines: [], marks: [], signals: [], signs: [], areas: [], changes: [], stops: [], crosswalks: [] });

  function addLane(net, lane) {
    const cum = [0], p = lane.pts;
    for (let i = 1; i < p.length; i++) cum.push(cum[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
    lane.cum = cum;
    net.lanes[lane.id] = lane;
    return lane;
  }
  const laneLength = lane => lane.cum[lane.cum.length - 1];

  function segAt(lane, s) {
    const c = lane.cum;
    let lo = 0, hi = c.length - 2;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c[m] <= s) lo = m; else hi = m - 1; }
    return lo;
  }
  function pointAt(lane, s) {
    const c = lane.cum, p = lane.pts;
    s = clamp(s, 0, c[c.length - 1]);
    const i = segAt(lane, s), L = c[i + 1] - c[i], t = L > 0 ? (s - c[i]) / L : 0;
    const [x0, y0] = p[i], [x1, y1] = p[i + 1];
    return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, a: Math.atan2(y1 - y0, x1 - x0) };
  }

  function projectLane(lane, x, y) {
    const p = lane.pts, c = lane.cum;
    let best = null;
    for (let i = 0; i < p.length - 1; i++) {
      const [x0, y0] = p[i], dx = p[i + 1][0] - x0, dy = p[i + 1][1] - y0, L2 = dx * dx + dy * dy;
      if (L2 === 0) continue;
      const t = clamp(((x - x0) * dx + (y - y0) * dy) / L2, 0, 1);
      const px = x0 + dx * t, py = y0 + dy * t, d = Math.hypot(x - px, y - py);
      if (!best || d < best.dist - 1e-12) {
        const L = Math.sqrt(L2);
        best = { s: c[i] + L * t, offset: (dx * (y - y0) - dy * (x - x0)) / L, heading: Math.atan2(dy, dx), dist: d };
      }
    }
    return best;
  }
  const inside = (lane, r) => r && r.dist <= lane.width / 2 + 0.3;
  // hint(차로 id)가 있으면 그 차로 → 다음·옆 차로 순으로 우선(교차로 안 겹친 연결 차로 구분용)
  function project(net, x, y, hint) {
    const L = net.lanes;
    if (hint && L[hint]) {
      const h = L[hint], r = projectLane(h, x, y);
      if (inside(h, r)) return Object.assign({ laneId: hint }, r);
      let best = null;
      for (const id of [...h.next, h.left, h.right]) {
        if (!id || !L[id]) continue;
        const q = projectLane(L[id], x, y);
        if (inside(L[id], q) && (!best || q.dist < best.dist)) best = Object.assign({ laneId: id }, q);
      }
      if (best) return best;
    }
    let best = null;
    for (const id in L) {
      const q = projectLane(L[id], x, y);
      if (q && (!best || q.dist < best.dist - 1e-9)) best = Object.assign({ laneId: id }, q);
    }
    return best;
  }

  const chCache = new WeakMap();
  function canChange(net, from, to, s) {
    let idx = chCache.get(net);
    if (!idx || idx.n !== net.changes.length) {
      idx = { n: net.changes.length, m: {} };
      for (const c of net.changes) (idx.m[c.from + '|' + c.to] = idx.m[c.from + '|' + c.to] || []).push(c);
      chCache.set(net, idx);
    }
    const list = idx.m[from + '|' + to];
    if (!list) return false;
    for (const c of list) if (s >= c.s0 && s <= c.s1) return c.allowed;
    return false;
  }

  // 신호: phases = [{ dur, state: {laneId: 'G'|'Y'|'R'|'LG'}, walk: [crosswalkId] }], 시각 t에 offset을 더해 주기로 감는다
  const signalById = (net, id) => net.signals.find(s => s.id === id);
  function phaseAt(sig, t) {
    let tt = ((t + (sig.offset || 0)) % sig.cycle + sig.cycle) % sig.cycle;
    for (let i = 0; i < sig.phases.length; i++) {
      if (tt < sig.phases[i].dur) return { index: i, phase: sig.phases[i], remain: sig.phases[i].dur - tt };
      tt -= sig.phases[i].dur;
    }
    const i = sig.phases.length - 1;
    return { index: i, phase: sig.phases[i], remain: 0 };
  }
  function signalState(net, t, signalId, laneId) {
    const sig = signalById(net, signalId);
    return (sig && phaseAt(sig, t).phase.state[laneId]) || 'R';
  }
  function walkState(net, t, signalId, cwId) {
    const sig = signalById(net, signalId);
    return !!sig && phaseAt(sig, t).phase.walk.includes(cwId);
  }
  // 신호 상태에서 그 회전이 가능한가: 'protected'(우선) | 'permissive'(양보·우회전은 일시정지 후) | null(불가)
  function movement(state, turn, unprotected) {
    if (turn === 'right') return state === 'G' || state === 'LG' ? 'protected' : 'permissive';
    if (turn === 'left' || turn === 'uturn') return state === 'LG' ? 'protected' : state === 'G' && unprotected ? 'permissive' : null;
    return state === 'G' ? 'protected' : null;
  }
  const stopOf = (net, laneId) => net.stops.find(s => s.laneId === laneId) || null;

  // 진입점(p0,a0) → 진출점(p1,a1) 연결선. 90° 회전은 직선+원호, 그 밖은 3차 베지어.
  function connectorPts(p0, a0, p1, a1) {
    const c = Math.cos(a0), s = Math.sin(a0), dx = p1.x - p0.x, dy = p1.y - p0.y;
    const u = c * dx + s * dy, v = -s * dx + c * dy, d = wrap(a1 - a0);
    const W = (lu, lv) => [p0.x + c * lu - s * lv, p0.y + s * lu + c * lv];
    const out = [[p0.x, p0.y]];
    if (Math.abs(Math.abs(d) - PI / 2) < 0.05 && u > 0.5 && v * d > 0.5) {
      const sg = Math.sign(d), r = Math.min(u, Math.abs(v)), u0 = u - r, n = Math.max(6, Math.ceil(r * PI / 2 / 0.6));
      for (let i = u0 > 0.01 ? 0 : 1; i <= n; i++) {
        const f = i / n * PI / 2;
        out.push(W(u0 + r * Math.sin(f), sg * r * (1 - Math.cos(f))));
      }
      if (Math.abs(v) - r > 0.01) out.push([p1.x, p1.y]);
      return out;
    }
    if (Math.abs(d) < 0.02 && Math.abs(v) < 0.02) { out.push([p1.x, p1.y]); return out; }
    const D = Math.hypot(dx, dy), k = Math.max(D * 0.4, Math.abs(d) > 2.5 ? Math.abs(v) * 2 / 3 + 1 : 0);
    const c1 = [p0.x + c * k, p0.y + s * k], c2 = [p1.x - Math.cos(a1) * k, p1.y - Math.sin(a1) * k];
    const n = Math.max(6, Math.ceil((D + k) / 1.0));
    for (let i = 1; i <= n; i++) {
      const t = i / n, m = 1 - t, b0 = m * m * m, b1 = 3 * m * m * t, b2 = 3 * m * t * t, b3 = t * t * t;
      out.push([b0 * p0.x + b1 * c1[0] + b2 * c2[0] + b3 * p1.x, b0 * p0.y + b1 * c1[1] + b2 * c2[1] + b3 * p1.y]);
    }
    return out;
  }

  // 같은 방향 옆 차로의 대응 위치(곡선은 길이 비례)
  const mapS = (net, from, to, s) => s * laneLength(net.lanes[to]) / laneLength(net.lanes[from]);

  return { PI, clamp, wrap, newNet, addLane, laneLength, pointAt, projectLane, project, canChange, mapS,
    signalById, phaseAt, signalState, walkState, movement, stopOf, connectorPts };
})();
if (typeof module !== 'undefined') module.exports = PP_ROADS;
if (typeof module !== 'undefined' && typeof PP_RBUILD === 'undefined') require('./roads-build.js');
