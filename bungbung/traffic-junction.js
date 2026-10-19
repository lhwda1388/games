// 붕붕이 — 교통용 교차로 기하 전처리: 연결 차로 쌍의 충돌 구역·갈라짐 구간, 회전 속도 상한.
const PP_TJUNC = (function ppTJunc() {
  const R = typeof PP_ROADS !== 'undefined' ? PP_ROADS : require('./roads.js');
  const { laneLength, pointAt, clamp } = R;

  // conf: 연결 차로 쌍의 충돌 구역 [c0,c1](자기 s)·[d0,d1](상대 s). div: 같은 진입 차로에서 갈라지는 쌍이 아직 붙어 있는 구간.
  function conflicts(net, ZONE) {
    const byJ = {}, conf = {}, div = {};
    for (const id in net.lanes) {
      const ln = net.lanes[id];
      if (ln.kind !== 'connector') continue;
      const L = laneLength(ln), pts = [];
      for (let s = 0; s < L; s += 1) pts.push([s, pointAt(ln, s)]);
      pts.push([L, pointAt(ln, L)]);
      (byJ[ln.road] = byJ[ln.road] || []).push({ ln, pts });
      conf[id] = []; div[id] = [];
    }
    for (const k in byJ) {
      const g = byJ[k];
      for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
        const A = g[i], B = g[j];
        if (A.ln.from === B.ln.from) { // 같은 차로에서 갈라지는 쌍: 중심선이 ZONE 이상 벌어질 때까지는 같은 차로처럼 앞차 취급
          let sa = 0, sb = 0;
          for (const [s1, pa] of A.pts) for (const [s2, pb] of B.pts) if (Math.hypot(pa.x - pb.x, pa.y - pb.y) < ZONE) { sa = Math.max(sa, s1); sb = Math.max(sb, s2); }
          div[A.ln.id].push({ D: B.ln.id, s: sb });
          div[B.ln.id].push({ D: A.ln.id, s: sa });
          continue;
        }
        let c0 = Infinity, c1 = -Infinity, d0 = Infinity, d1 = -Infinity;
        for (const [sa, pa] of A.pts) for (const [sb, pb] of B.pts) {
          if (Math.abs(pa.x - pb.x) > ZONE || Math.abs(pa.y - pb.y) > ZONE || Math.hypot(pa.x - pb.x, pa.y - pb.y) >= ZONE) continue;
          c0 = Math.min(c0, sa); c1 = Math.max(c1, sa); d0 = Math.min(d0, sb); d1 = Math.max(d1, sb);
        }
        if (c0 === Infinity) continue;
        conf[A.ln.id].push({ D: B.ln.id, c0, c1, d0, d1 });
        conf[B.ln.id].push({ D: A.ln.id, c0: d0, c1: d1, d0: c0, d1: c1 });
      }
    }
    return { conf, div };
  }
  // 연결 차로 곡률 → 회전 속도 상한(횡가속 2.5m/s²)
  function turnCap(ln) {
    const L = laneLength(ln);
    let rmin = Infinity;
    for (let s = 2; s + 2 <= L; s += 1) {
      const a = pointAt(ln, s - 2), b = pointAt(ln, s), c = pointAt(ln, s + 2);
      const ab = Math.hypot(b.x - a.x, b.y - a.y), bc = Math.hypot(c.x - b.x, c.y - b.y), ca = Math.hypot(a.x - c.x, a.y - c.y);
      const area2 = Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
      if (area2 > 1e-6) rmin = Math.min(rmin, ab * bc * ca / (2 * area2));
    }
    return clamp(Math.sqrt(2.5 * rmin), 3, ln.limit / 3.6);
  }

  return { conflicts, turnCap };
})();
if (typeof module !== 'undefined') module.exports = PP_TJUNC;
