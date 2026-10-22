const assert = require('assert');
const D = require('../drive.js'), C = require('../car.js'), M = require('../missions.js');
const ctl = { throttle: 0, brake: 0, steerRate: 0 };
const d = D.create(M.byId('city-lane'));
assert(Math.abs(d.player.offset) < 1e-6);
assert.strictEqual(d.car.vMax, 60 / 3.6);
D.controls(d, { blinkReq: -1, mirrorL: true });
assert.strictEqual(d.blink, -1); assert.strictEqual(d.mirrorL, 0);
d.car.wheel = 100; D.step(d, ctl, 1 / 60);
d.car.wheel = 0; D.step(d, ctl, 1 / 60);
assert.strictEqual(d.blink, 0);
const b = C.bodyBox(d.car);
assert.strictEqual(D.collision(b, [{ ...b, th: b.a }], [], []), 'car');
assert.strictEqual(D.collision(b, [], [{ x: b.x, y: b.y }], []), 'ped');
assert.strictEqual(D.collision(b, [], [], [b]), 'wall');
assert.strictEqual(D.collision(b, [], [{ x: b.x + 100, y: b.y }], []), null);
d.obstacles.push(b); D.step(d, ctl, 1 / 60);
assert(d.score.failReason); const t = d.t; D.step(d, ctl, 1 / 60); assert.strictEqual(d.t, t);
for (const m of M.list) {
  const run = D.create(m);
  for (let i = 0; i < 120; i++) D.step(run, ctl, 1 / 60);
  assert(!run.score.failReason, m.id);
  assert(run.route && run.guide, m.id);
}
console.log('all drive integration tests passed');
// 고속도로: 비상등 토글, 채점 프레임 hazard·leaderGap, 내비에 미션(정체 안내) 전달
{
  const R = require('../roads.js'); require('../roads-highway.js');
  const S = require('../drive-score.js');
  const hm = { id: 'hw-t', highway: true, seed: 1, density: 'none', limit: 100, vMax: 110 / 3.6,
    scripts: [{ id: 'lead', action: 'slow', spawn: { laneId: 'h:f2', s: 100, v: 10 }, v: 10 }],
    start: { laneId: 'h:f2', s: 40 }, goal: { laneId: 'h:f2', s: 2900 }, jamAt: { laneId: 'h:f2', s: 1000 },
    build() { const net = R.newNet(); R.highway(net, { id: 'h', x: 0, y: 0, a: 0, length: 3000, lanes: 2 }); return net; } };
  const hd = D.create(hm);
  assert.strictEqual(hd.hazard, false);
  D.controls(hd, { hazardReq: 1 }); assert.strictEqual(hd.hazard, true);
  D.controls(hd, { hazardReq: 0 }); assert.strictEqual(hd.hazard, true);
  let frame = null;
  const upd = S.update;
  S.update = (ds, f) => { frame = f; return upd(ds, f); };
  D.step(hd, ctl, 1 / 30);
  S.update = upd;
  assert.strictEqual(frame.hazard, true);
  assert(frame.leaderGap && Math.abs(frame.leaderGap.gap - (100 - 40 - (4.5 + 4.39) / 2)) < 0.5 && Math.abs(frame.leaderGap.v - 10) < 0.2, JSON.stringify(frame.leaderGap));
  // 정체 1km 앞 안내: 내비가 미션 jamAt을 본다(시작 s=40 → jamAt까지 약 960m)
  hd.route.said = {}; hd.speech.length = 0;
  D.step(hd, ctl, 1 / 30);
  assert(hd.speech.some(x => x.includes('정체')), hd.speech.join(' / '));
}
console.log('all highway drive tests passed');
