// 붕붕이 — 횡단보도 보행자(교통 시뮬레이션 일부). 보행 신호 시작에 생성, 가끔 늦게 출발, 차가 가까우면 기다린다.
// ped = { id, cw, from(0|1 출발 끝), u(0→1), speed, delay, state: 'wait'|'walk', forced(신호 무시: 스크립트·테스트) }
const PP_PEDS = (function ppPeds() {
  const R = typeof PP_ROADS !== 'undefined' ? PP_ROADS : require('./roads.js');
  const K = typeof PP_COL !== 'undefined' ? PP_COL : require('./collision.js');
  const MAX = 24;

  const cwOf = (sim, id) => sim.net.crosswalks.find(c => c.id === id);
  function add(sim, cwId, o = {}) {
    const cw = cwOf(sim, cwId);
    if (!cw || sim.peds.length >= MAX) return null;
    const p = { id: sim.pid++, cw: cwId, from: o.from || 0, u: 0, speed: o.speed || 1.3, delay: o.delay || 0, state: 'wait', forced: !!o.forced,
      len: Math.hypot(cw.pts[1][0] - cw.pts[0][0], cw.pts[1][1] - cw.pts[0][1]) };
    sim.peds.push(p);
    return p;
  }
  function pos(sim, p) {
    const cw = cwOf(sim, p.cw), a = cw.pts[p.from], b = cw.pts[1 - p.from];
    return { x: a[0] + (b[0] - a[0]) * p.u, y: a[1] + (b[1] - a[1]) * p.u, th: Math.atan2(b[1] - a[1], b[0] - a[0]), cw };
  }
  function boxes(sim, cars) {
    const out = cars.map(c => ({ x: c.x, y: c.y, l: c.l, w: c.w, a: c.th, v: c.v }));
    const pl = sim.player;
    if (pl && pl.x != null) out.push({ x: pl.x, y: pl.y, l: 4.6, w: 1.9, a: pl.th, v: Math.abs(pl.v || 0) });
    return out;
  }
  // 출발 전: 횡단보도 위·바로 앞의 차, 3초 안에 닿을 차가 없어야 한다
  function clear(cw, bs) {
    const [a, b] = cw.pts, dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
    for (const c of bs) {
      const t = Math.max(0, Math.min(1, ((c.x - a[0]) * dx + (c.y - a[1]) * dy) / L2));
      const qx = a[0] + dx * t - c.x, qy = a[1] + dy * t - c.y, d = Math.hypot(qx, qy);
      if (d < cw.width / 2 + c.l / 2 + 1) return false;
      const toward = Math.cos(c.a) * qx + Math.sin(c.a) * qy > 0;
      if (toward && (d - cw.width / 2 - c.l / 2) / Math.max(c.v, 0.1) < 3) return false;
    }
    return true;
  }

  function update(sim, t, dt, rnd, cars) {
    const net = sim.net;
    if (sim.dens) for (const cw of net.crosswalks) {
      if (!cw.signal) continue;
      const w = R.walkState(net, t, cw.signal, cw.id);
      if (w && !sim.walkPrev[cw.id]) {
        const [n0, n1] = sim.dens.peds, n = n0 + Math.floor(rnd(sim) * (n1 - n0 + 1));
        for (let i = 0; i < n; i++) {
          const late = rnd(sim) < 0.2;
          add(sim, cw.id, { from: rnd(sim) < 0.5 ? 0 : 1, delay: late ? 2 + 2 * rnd(sim) : rnd(sim), speed: 1.1 + 0.4 * rnd(sim) });
        }
      }
      sim.walkPrev[cw.id] = w;
    }
    const bs = boxes(sim, cars);
    for (const p of sim.peds) {
      if (p.state !== 'wait') continue;
      if ((p.delay -= dt) > 0) continue;
      const cw = cwOf(sim, p.cw);
      if (!p.forced && cw.signal) { // 보행 신호가 끝나기 전(황색 포함)에 다 건널 수 없으면 다음 신호를 기다리지 않고 포기
        const sig = R.signalById(net, cw.signal), ph = R.phaseAt(sig, t);
        if (!ph.phase.walk.includes(cw.id) || ph.remain + 3 < p.len / p.speed + 1) { p.done = true; continue; }
      }
      if (clear(cw, bs)) p.state = 'walk';
    }
    sim.peds = sim.peds.filter(p => !p.done);
    sim.busy = {};
    for (const p of sim.peds) if (p.state === 'walk') sim.busy[p.cw] = true;
  }
  function move(sim, dt, cars) {
    const bs = boxes(sim, cars);
    for (const p of sim.peds) {
      if (p.state !== 'walk') continue;
      const u0 = p.u;
      p.u = Math.min(1, p.u + p.speed * dt / p.len);
      const q = pos(sim, p);
      if (bs.some(b => K.pointDist(b, q.x, q.y) < 0.7)) { p.u = u0; continue; }
      if (p.u >= 1) p.done = true;
    }
    sim.peds = sim.peds.filter(p => !p.done);
  }
  const list = sim => sim.peds.map(p => { const q = pos(sim, p); return { id: p.id, x: q.x, y: q.y, th: q.th, walking: p.state === 'walk' }; });
  return { add, update, move, list };
})();
if (typeof module !== 'undefined') module.exports = PP_PEDS;
