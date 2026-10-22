const assert = require('assert');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let fail = 0;
// node bungbung/test/maps.test.js
const C = require('../car.js');
const K = require('../collision.js');
const S = require('../scoring.js');
const M = require('../maps.js');
const PI = Math.PI, D2R = PI / 180;
const carAtCenter = (cx, cy, th) => C.create(C.poseFromCenter(cx, cy, th));
// 목표를 만족하는 이상적인 자세
function idealCar(g) {
  if (g.type === 'beside') {
    const s = C.SELTOS, side = g.side === 'fuel' ? s.fuelSide : g.side;
    const n = [-Math.sin(g.a), Math.cos(g.a)], sgn = side === 'left' ? -1 : 1;
    const gap = (g.gapMin + g.gapMax) / 2 + s.width / 2;
    const anchorX = g.anchor === 'fuel' ? s.fuelX : s.driver.x;
    // 기준점이 (x,y)에 오도록: 뒷축 = 선 위 점 - 방향*anchorX + n*sgn*gap
    const c = C.create({
      x: g.x - Math.cos(g.a) * anchorX + n[0] * sgn * gap,
      y: g.y - Math.sin(g.a) * anchorX + n[1] * sgn * gap, th: g.a,
    });
    return c;
  }
  const th = g.type === 'slot' ? (g.face === 'out' ? g.a + PI : g.a) : (g.th ?? g.a);
  const c = carAtCenter(g.x, g.y, th);
  c.gear = 'P';
  return c;
}

test('18개, 묶음별 개수, id 중복 없음', () => {
  assert.strictEqual(M.list.length, 18);
  const count = {};
  for (const m of M.list) count[m.group] = (count[m.group] || 0) + 1;
  assert.deepStrictEqual(count, { apt: 6, mall: 3, street: 6, special: 3 });
  assert.strictEqual(new Set(M.list.map(m => m.id)).size, 18);
  assert.strictEqual(M.byId('apt-pillar').name.length > 0, true);
});

for (const m of M.list) {
  test(m.id + ': 시작 자세가 장애물과 겹치지 않음', () => {
    const c = C.create(M.startPose(m, C.SELTOS));
    assert.strictEqual(K.hit(C.bodyBox(c), m.obstacles), -1, '장애물 #' + K.hit(C.bodyBox(c), m.obstacles));
  });
  for (const key of ['goal', 'via']) {
    if (!m[key]) continue;
    test(m.id + ': ' + key + '를 만족하는 자세가 존재하고 장애물과 안 겹침', () => {
      const c = idealCar(m[key]);
      const i = K.hit(C.bodyBox(c), m.obstacles);
      assert.strictEqual(i, -1, '장애물 #' + i + ' ' + JSON.stringify(m.obstacles[i]));
      const r = S.evalGoal(m[key], c);
      assert(r.ok, JSON.stringify(r));
    });
  }
  test(m.id + ': 시작 자세에서 이미 목표 달성 상태가 아님', () => {
    const c = C.create(M.startPose(m, C.SELTOS));
    c.gear = 'P';
    assert(!S.evalGoal(m.goal, c).ok || m.via);
  });
}

test('startPose: 뒷축 형식은 그대로, 차체 중심 형식은 차종 오프셋만큼 뒤로', () => {
  assert.deepStrictEqual(M.startPose(M.byId('apt-pillar'), C.SELTOS), { x: -8, y: 2.75, th: 0 });
  const p = M.startPose(M.byId('apt-exit'), C.SELTOS);
  assert(Math.abs(p.x - 0.1) < 1e-9 && Math.abs(p.y - (8 - 1.335)) < 1e-9 && p.th === PI / 2);
  const small = Object.assign({}, C.SELTOS, { length: 3.6, wheelbase: 2.4, rearOverhang: 0.6 });
  const q = M.startPose(M.byId('apt-exit'), small);
  assert(Math.abs(q.y - (8 - C.centerOffset(small))) < 1e-9);
  const b = C.bodyBox(C.create(q, small));
  assert(Math.abs(b.x - 0.1) < 1e-9 && Math.abs(b.y - 8) < 1e-9);
});

// 회귀(모바일 플레이 테스트): 시작하자마자 똑바로 후진만 해도 기둥에 닿아 접촉이 올라갔다
test('apt-exit: 시작 자세에서 똑바로 3m 후진해도 아무것도 닿지 않는다', () => {
  const m = M.byId('apt-exit'), p = M.startPose(m, C.SELTOS);
  for (let d = 0.05; d <= 3; d += 0.05) {
    const q = { x: p.x - Math.cos(p.th) * d, y: p.y - Math.sin(p.th) * d, th: p.th };
    assert.strictEqual(K.hit(C.bodyBox(C.create(q)), m.obstacles), -1, 'd=' + d.toFixed(2));
  }
});

test('높이: 나선 경사로와 경사 골목', () => {
  const sp = M.byId('apt-ramp');
  assert(Math.abs(M.heightAt(sp, 10, 0) + 1) < 1e-9);
  assert.strictEqual(M.heightAt(sp, 25, 6), -2);
  assert.strictEqual(M.heightAt(sp, -7, 12), -4);
  assert.strictEqual(M.heightAt(sp, -7, 0), 0);
  const sl = M.byId('street-slope');
  const grade = Math.atan((M.heightAt(sl, 10, 3) - M.heightAt(sl, 0, 3)) / 10) / D2R;
  assert(Math.abs(grade - 8) < 0.3, 'grade=' + grade);
});
// 실제 게임(main.js physicsStep)과 같은 방식: 뒷축·앞축 높이로 pitch를 구하고, 막히면 되돌린다
function simulate(m, c, ctl, secs) {
  const dt = 1 / 60;
  for (let t = 0; t < secs; t += dt) {
    const f = C.toWorld(c, c.spec.wheelbase, 0);
    const prev = { x: c.x, y: c.y, th: c.th };
    C.step(c, ctl, dt, Math.atan2(M.heightAt(m, f[0], f[1]) - M.heightAt(m, c.x, c.y), c.spec.wheelbase));
    const i = K.hit(C.bodyBox(c), m.obstacles);
    if (i >= 0) { Object.assign(c, prev); c.v = 0; return { hit: m.obstacles[i], t }; }
  }
  return { hit: null };
}
test('높이: 언덕 출발 15% 오르막, 경사 후진 주차 6~8% 내리막(칸 쪽이 낮음), 방지턱 0→0.1→0', () => {
  const h = M.byId('street-hill-start'), p = M.startPose(h, C.SELTOS);
  const g = (M.heightAt(h, p.x + 5, p.y) - M.heightAt(h, p.x, p.y)) / 5;
  assert(Math.abs(g - 0.15) < 1e-9, 'hill grade=' + g);
  assert(M.heightAt(h, h.goal.x, h.goal.y) > M.heightAt(h, p.x, p.y) + 2, '목표는 오르막 끝(위)');
  const r = M.byId('street-slope-reverse'), gl = r.goal;
  const gr = (M.heightAt(r, gl.x, 3) - M.heightAt(r, gl.x, gl.y)) / (gl.y - 3);
  assert(gr >= 0.06 && gr <= 0.08, 'slope grade=' + gr);
  const b = M.byId('apt-bump');
  assert.strictEqual(b.bumps.length, 3);
  for (const z of b.bumps) {
    assert(Math.abs(M.heightAt(b, z.x, z.y) - 0.1) < 1e-9, '꼭대기 0.1m');
    for (const s of [-1, 1]) {
      const ex = z.x + s * Math.cos(z.a) * (z.l / 2 + 0.05), ey = z.y + s * Math.sin(z.a) * (z.l / 2 + 0.05);
      assert(Math.abs(M.heightAt(b, ex, ey)) < 1e-9, '양끝 0');
    }
  }
});
test('street-hill-start: D에서 브레이크를 떼면 뒤로 밀려 뒤차에 닿고, 끝까지 밟으면 버틴다', () => {
  const m = M.byId('street-hill-start'), p = M.startPose(m, C.SELTOS);
  const rolled = C.create(p); rolled.gear = 'D';
  const r = simulate(m, rolled, { throttle: 0, brake: 0, steerRate: 0 }, 15);
  assert(r.hit && r.hit.kind === 'car', '뒤차에 닿아야 함: ' + JSON.stringify(r));
  const held = C.create(p); held.gear = 'D';
  assert.strictEqual(simulate(m, held, { throttle: 0, brake: 1, steerRate: 0 }, 10).hit, null);
  assert(Math.hypot(held.x - p.x, held.y - p.y) < 1e-6 && held.v === 0, '제자리');
  const go = C.create(p); go.gear = 'D';
  simulate(m, go, { throttle: 0.5, brake: 0, steerRate: 0 }, 1);
  assert(go.x > p.x, '엑셀을 밟으면 올라간다');
});
test('apt-bump: 방지턱 3개를 지나야 주차칸에 닿는다(시작 → 칸 사이에 모두 있음)', () => {
  const m = M.byId('apt-bump'), p = M.startPose(m, C.SELTOS);
  for (const z of m.bumps) assert(z.x > p.x + 3 && z.x < m.goal.x - 3, JSON.stringify(z));
});
for (const [name, fn] of tests) {
  try { fn(); console.log('ok  ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n  ' + e.message); }
}
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('all ' + tests.length + ' passed');
