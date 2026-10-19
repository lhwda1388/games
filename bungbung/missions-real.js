// 붕붕이 — 실제 지도 미션: Overpass 응답(osm)을 한 번 변환해 기존 미션 모양 객체로 감싼다.
// make({ osm, from: [lat, lon], to: [lat, lon], seed }) → { mission, buildings, proj, failed } | { error: 'bad-coords'|'no-road'|'no-route'|'too-far'|'too-big' }
const PP_MREAL = (function ppMreal() {
  const R = typeof PP_ROADS !== 'undefined' ? PP_ROADS : require('./roads.js');
  const OC = typeof PP_OSMC !== 'undefined' ? PP_OSMC : require('./osm-convert.js');
  const N = typeof PP_NAV !== 'undefined' ? PP_NAV : require('./nav.js');
  const MAX_D = 3000; // 한 번 운행 직선거리 상한(m)
  // ponytail: 반대 방향 차로도 후보로 — 가장 가까운 차로 거리 + 차로 폭 + 1m 안. 1m = 좌표·중앙선 오차 여유
  const SNAP_SLACK = 1, MAX_CAND = 4; // 후보는 (도로·방향)마다 가장 가까운 차로 하나, 최대 4개 → 경로 계산 ≤ 16번
  // 도로 등급 → 교통 생성 배율: primary 이상 = 시내 미션 수준, secondary·tertiary = 절반, 나머지 = 1/4
  const BIG = /^(motorway|trunk|primary)(_link)?$/, MID = /^(secondary|tertiary)(_link)?$/;
  const trafficOf = cls => (BIG.test(cls) ? 1 : MID.test(cls) ? 0.5 : 0.25);

  function dist(a, b) { // 전역 투영과 같은 근사(m)
    const c = Math.cos((a[0] + b[0]) / 2 * Math.PI / 180);
    return Math.hypot((b[1] - a[1]) * c * 111320, (b[0] - a[0]) * 110540);
  }

  // 점 근처 정상 차로 후보(연결 차로 = 교차로 안은 제외). 같은 도로·방향의 여러 차로는 경로가 차로 변경으로 처리하므로 하나만
  function candidates(net, x, y) {
    const all = [];
    for (const id in net.lanes) {
      const l = net.lanes[id];
      if (l.kind !== 'normal') continue;
      const q = R.projectLane(l, x, y);
      if (q) all.push({ laneId: id, s: q.s, d: q.dist, w: l.width, fw: /:f\d+$/.test(id) });
    }
    if (!all.length) return [];
    all.sort((a, b) => a.d - b.d || b.fw - a.fw);
    const lim = all[0].d + all[0].w + SNAP_SLACK, seen = new Set(), out = [];
    for (const c of all) {
      if (c.d > lim || out.length >= MAX_CAND) break;
      const g = c.laneId.replace(/\d+$/, '');
      if (!seen.has(g)) { seen.add(g); out.push({ laneId: c.laneId, s: c.s }); }
    }
    return out;
  }
  const hasUturn = (net, rt) => rt.lanes.some(id => net.lanes[id].turn === 'uturn');
  // 출발×목적지 후보 중 유턴 연결 차로가 없는 가장 짧은 경로(없으면 유턴 포함 가장 짧은 경로)
  function bestPair(net, A, B) {
    let best = null;
    for (const a of A) for (const b of B) {
      const rt = N.route(net, a.laneId, a.s, b.laneId, b.s);
      if (!rt) continue;
      const u = hasUturn(net, rt);
      if (!best || u < best.u || (u === best.u && rt.length < best.len - 1e-6)) best = { start: a, goal: b, u, len: rt.length };
    }
    return best;
  }

  function make({ osm, from, to, seed = 1 }) {
    if (![from, to].every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))) return { error: 'bad-coords' };
    if (dist(from, to) > MAX_D) return { error: 'too-far' };
    let o;
    try { o = OC.convert(osm); } catch (e) { if (e.code === 'too-big') return { error: 'too-big' }; throw e; }
    const { net, graph, buildings, failed, proj } = o;
    const cls = new Map(graph.segs.map(g => [g.id, g.props.cls]));
    for (const id in net.lanes) { const ln = net.lanes[id]; if (cls.has(ln.road)) ln.traffic = trafficOf(cls.get(ln.road)); }
    const A = candidates(net, ...proj.fwd(from[0], from[1])), B = candidates(net, ...proj.fwd(to[0], to[1]));
    if (!A.length || !B.length) return { error: 'no-road' };
    const pair = bestPair(net, A, B);
    if (!pair) return { error: 'no-route' };
    const { start, goal } = pair;
    // net은 재시작에도 그대로 재사용(drive·교통·채점은 net을 바꾸지 않는다)
    const mission = { id: 'real', group: 'real', name: '실제 지도', build: () => net, start, goal, vMax: 80 / 3.6, density: 'normal', seed,
      trafficOpts: n => {
        const p = R.pointAt(n.lanes[start.laneId], start.s);
        return { seed, density: 'normal', avoid: [{ x: p.x, y: p.y, r: 40 }], ring: { r0: 200, r1: 300, drop: 350, x: p.x, y: p.y } };
      } };
    return { mission, buildings, proj, failed };
  }
  return { make, trafficOf };
})();
if (typeof module !== 'undefined') module.exports = PP_MREAL;
