// 붕붕이 — 회전 사각형 충돌(SAT)과 거리. 박스 = {x,y,l,w,a}, l은 a 방향 길이.
const PP_COL = (function ppCol() {
  function corners(b) {
    const c = Math.cos(b.a), s = Math.sin(b.a), hl = b.l / 2, hw = b.w / 2;
    return [[hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw]].map(([u, v]) => [b.x + c * u - s * v, b.y + s * u + c * v]);
  }
  function project(pts, ax, ay) {
    let lo = Infinity, hi = -Infinity;
    for (const [x, y] of pts) { const p = x * ax + y * ay; if (p < lo) lo = p; if (p > hi) hi = p; }
    return [lo, hi];
  }
  function overlap(A, B) {
    const pa = corners(A), pb = corners(B);
    for (const a of [A.a, A.a + Math.PI / 2, B.a, B.a + Math.PI / 2]) {
      const ax = Math.cos(a), ay = Math.sin(a);
      const [a0, a1] = project(pa, ax, ay), [b0, b1] = project(pb, ax, ay);
      if (a1 <= b0 + 1e-9 || b1 <= a0 + 1e-9) return false;
    }
    return true;
  }
  function toLocal(b, px, py) {
    const dx = px - b.x, dy = py - b.y, c = Math.cos(b.a), s = Math.sin(b.a);
    return [c * dx + s * dy, -s * dx + c * dy];
  }
  function pointDist(b, px, py) {
    const [u, v] = toLocal(b, px, py);
    return Math.hypot(Math.max(Math.abs(u) - b.l / 2, 0), Math.max(Math.abs(v) - b.w / 2, 0));
  }
  function contains(b, px, py) {
    const [u, v] = toLocal(b, px, py);
    return Math.abs(u) <= b.l / 2 + 1e-9 && Math.abs(v) <= b.w / 2 + 1e-9;
  }
  const inside = (inner, outer) => corners(inner).every(([x, y]) => contains(outer, x, y));
  function hit(box, obstacles) {
    for (let i = 0; i < obstacles.length; i++) if (overlap(box, obstacles[i])) return i;
    return -1;
  }
  function nearest(points, obstacles) {
    let m = Infinity;
    for (const [x, y] of points) for (const o of obstacles) m = Math.min(m, pointDist(o, x, y));
    return m;
  }
  return { corners, overlap, toLocal, pointDist, contains, inside, hit, nearest };
})();
if (typeof module !== 'undefined') module.exports = PP_COL;
