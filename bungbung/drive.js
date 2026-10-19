// 시내 주행 고정 시간 스텝. DOM 없이도 실제 루프·충돌·채점 통합을 검증한다.
const PP_DRIVE = (function ppDrive() {
  const C = typeof PP_CAR !== 'undefined' ? PP_CAR : require('./car.js');
  const R = typeof PP_ROADS !== 'undefined' ? PP_ROADS : require('./roads.js');
  const T = typeof PP_TRAFFIC !== 'undefined' ? PP_TRAFFIC : require('./traffic.js');
  const N = typeof PP_NAV !== 'undefined' ? PP_NAV : require('./nav.js');
  const S = typeof PP_DSCORE !== 'undefined' ? PP_DSCORE : require('./drive-score.js');
  const M = typeof PP_MISSIONS !== 'undefined' ? PP_MISSIONS : require('./missions.js');
  const COL = typeof PP_COL !== 'undefined' ? PP_COL : require('./collision.js');
  function locate(d) {
    const b = C.bodyBox(d.car), p = R.project(d.net, b.x, b.y, d.player && d.player.laneId);
    d.player = { ...p, x: b.x, y: b.y, th: d.car.th, v: d.car.v };
  }
  function create(mission, spec = C.SELTOS) {
    const net = mission.build(), p = R.pointAt(net.lanes[mission.start.laneId], mission.start.s);
    const car = C.create(C.poseFromCenter(p.x, p.y, p.a, spec), spec); car.vMax = mission.vMax;
    const d = { mission, net, car, t: 0, blink: 0, armed: false, mirrorL: -Infinity, mirrorR: -Infinity,
      focus: null, obstacles: [], score: S.create(mission, net), sim: T.create(net, M.trafficOpts(mission, net)), events: [], speech: [] };
    locate(d);
    d.route = N.route(net, d.player.laneId, d.player.s, mission.goal.laneId, mission.goal.s);
    d.guide = N.guide(net, d.route, d.player.laneId, d.player.s);
    return d;
  }
  function controls(d, ctl) {
    if (ctl.blinkReq) { d.blink = d.blink === ctl.blinkReq ? 0 : ctl.blinkReq; d.armed = false; }
    if (ctl.mirrorL) d.mirrorL = d.t;
    if (ctl.mirrorR) d.mirrorR = d.t;
    d.focus = ctl.mirrorL ? 'left' : ctl.mirrorR ? 'right' : null;
  }
  function collision(box, cars, peds, obstacles) {
    for (const c of cars) if (Math.hypot(c.x - box.x, c.y - box.y) < 8 && COL.overlap(box, { ...c, a: c.th })) return 'car';
    for (const p of peds) if (COL.pointDist(box, p.x, p.y) < 0.3) return 'ped';
    if (COL.hit(box, obstacles) >= 0) return 'wall';
    return null;
  }
  function step(d, ctl, dt) {
    if (d.score.done || d.score.failReason) return [];
    d.t += dt;
    C.step(d.car, ctl, dt); locate(d);
    if (d.blink && d.car.wheel * -d.blink > 90) d.armed = true;
    if (d.armed && Math.abs(d.car.wheel) < 15) { d.blink = 0; d.armed = false; }
    T.step(d.sim, dt, d.t, d.player);
    const others = T.cars(d.sim), peds = T.peds(d.sim);
    const hit = collision(C.bodyBox(d.car), others, peds, d.obstacles);
    let rerouted = false;
    if (d.route && N.offRoute(d.net, d.route, d.player.laneId, d.player.s)) {
      d.route = N.reroute(d.net, d.route, d.player.laneId, d.player.s); rerouted = true;
    }
    if (!d.route && (!d.retryAt || d.retryAt.laneId !== d.player.laneId || Math.abs(d.retryAt.s-d.player.s)>10)) {
      d.retryAt = { laneId:d.player.laneId, s:d.player.s };
      d.route = N.route(d.net,d.player.laneId,d.player.s,d.mission.goal.laneId,d.mission.goal.s);
    }
    d.guide = d.route ? N.guide(d.net, d.route, d.player.laneId, d.player.s) : null;
    const events = S.update(d.score, { t: d.t, dt, car: d.player, blink: d.blink,
      mirrorL: d.mirrorL, mirrorR: d.mirrorR, collision: hit, others, peds, rerouted });
    if (rerouted) d.speech.push(N.REROUTE_SAY);
    else if (d.guide && d.guide.say) d.speech.push(d.guide.say);
    d.events = events;
    if (d.score.done || d.score.failReason) d.car.v = 0;
    return events;
  }
  return { create, controls, step, collision };
})();
if (typeof module !== 'undefined') module.exports = PP_DRIVE;
