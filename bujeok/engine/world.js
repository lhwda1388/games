// 부적난무 — 공간 해시. 매 틱 적 목록으로 다시 짓고(상태에 저장하지 않는다) 근처 후보만 빠르게 찾는다.
const BJ_WORLD = (function bjWorld() {
  const MAX_R = 48; // 가장 큰 개체 반경(보스 42 + 여유). near()가 겹침 후보를 놓치지 않게 반경에 더한다
  const key = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);
  const createHash = (cell = 64) => ({ cell, cells: new Map() });
  function build(h, list) {
    h.cells.clear();
    for (const e of list) {
      if (e.dead) continue;
      const k = key(Math.floor(e.x / h.cell), Math.floor(e.y / h.cell));
      const c = h.cells.get(k);
      if (c) c.push(e); else h.cells.set(k, [e]);
    }
  }
  // (x, y) 반경 r 안에 있을 수 있는 후보를 out에 담는다. 정확한 거리 판정은 호출자가 한다.
  function near(h, x, y, r, out = []) {
    out.length = 0;
    const c = h.cell, R = r + MAX_R;
    const x0 = Math.floor((x - R) / c), x1 = Math.floor((x + R) / c);
    const y0 = Math.floor((y - R) / c), y1 = Math.floor((y + R) / c);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const cell = h.cells.get(key(cx, cy));
      if (cell) for (const e of cell) if (!e.dead) out.push(e);
    }
    return out;
  }
  function nearest(h, x, y, maxR) {
    let best = null, bd = maxR * maxR;
    for (const e of near(h, x, y, maxR, [])) {
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }
  return { MAX_R, createHash, build, near, nearest };
})();
if (typeof module !== 'undefined') module.exports = BJ_WORLD;
