// 붕붕이 — 목표 판정(slot/zone/beside)과 시도 기록.
const PP_SCORE = (function ppScore() {
  const C = typeof PP_CAR !== 'undefined' ? PP_CAR : require('./car.js');
  const K = typeof PP_COL !== 'undefined' ? PP_COL : require('./collision.js');
  const PI = Math.PI;

  function angDiff(a, b) {
    let d = (a - b) % (2 * PI);
    if (d > PI) d -= 2 * PI;
    if (d < -PI) d += 2 * PI;
    return Math.abs(d);
  }
  function slotAngleErr(g, th) {
    if (g.face === 'in') return angDiff(th, g.a);
    if (g.face === 'out') return angDiff(th, g.a + PI);
    return Math.min(angDiff(th, g.a), angDiff(th, g.a + PI));
  }

  function beside(g, c) {
    const s = c.spec, side = g.side === 'fuel' ? s.fuelSide : g.side;
    const sy = (side === 'left' ? 1 : -1) * s.width / 2;
    const angleErr = Math.min(angDiff(c.th, g.a), angDiff(c.th, g.a + PI));
    const nx = -Math.sin(g.a), ny = Math.cos(g.a);
    const dist = ([x, y]) => Math.abs((x - g.x) * nx + (y - g.y) * ny);
    const edge = [C.toWorld(c, s.wheelbase + C.frontOverhang(s), sy), C.toWorld(c, -s.rearOverhang, sy)].map(dist);
    const b = C.bodyBox(c);
    const facing = Math.max(...edge) < dist([b.x, b.y]);
    const [ax, ay] = C.toWorld(c, g.anchor === 'fuel' ? s.fuelX : s.driver.x, sy);
    const along = Math.abs((ax - g.x) * Math.cos(g.a) + (ay - g.y) * Math.sin(g.a));
    const ok = Math.abs(c.v) < 0.05 && angleErr <= g.tolA && facing
      && Math.min(...edge) >= g.gapMin && Math.max(...edge) <= g.gapMax && along <= g.alongTol;
    return { ok, angleErr, gap: Math.min(...edge), along };
  }

  function evalGoal(g, c) {
    if (g.type === 'beside') return beside(g, c);
    const inside = K.inside(C.bodyBox(c), g);
    if (g.type === 'slot') {
      const angleErr = slotAngleErr(g, c.th);
      return { ok: inside && angleErr <= g.tolA && c.gear === 'P', angleErr, inside };
    }
    const angleErr = g.th == null ? 0 : angDiff(c.th, g.th);
    return { ok: inside && Math.abs(c.v) < 0.5 && angleErr <= (g.tolA ?? 0.35), angleErr, inside };
  }

  const createRun = map => ({ t: 0, contacts: 0, switches: 0, lastDir: 0, via: !map.via, done: false, touching: false });
  function tick(run, map, c, dt, touchingNow) {
    if (run.done) return run;
    run.t += dt;
    if (touchingNow && !run.touching) run.contacts++;
    run.touching = touchingNow;
    const dir = c.gear === 'D' ? 1 : c.gear === 'R' ? -1 : 0;
    if (dir && run.lastDir && dir !== run.lastDir) run.switches++;
    if (dir) run.lastDir = dir;
    if (!run.via) { if (evalGoal(map.via, c).ok) run.via = true; }
    else if (evalGoal(map.goal, c).ok) run.done = true;
    return run;
  }
  const result = (run, map) => ({
    contacts: run.contacts, switches: run.switches, time: run.t,
    grade: run.contacts === 0 && run.switches <= map.par ? '완벽' : '통과',
  });
  function better(a, b) {
    if (!b) return true;
    if (a.contacts !== b.contacts) return a.contacts < b.contacts;
    if (a.switches !== b.switches) return a.switches < b.switches;
    return a.time < b.time;
  }
  return { angDiff, evalGoal, createRun, tick, result, better };
})();
if (typeof module !== 'undefined') module.exports = PP_SCORE;
