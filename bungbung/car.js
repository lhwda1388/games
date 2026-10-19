// 붕붕이 — 차량 사양과 운동 모델. DOM·three.js 없음. 단위 m·s·rad, 기준점 = 뒷축 중앙.
const PP_CAR = (function ppCar() {
  const G = 9.81;
  // 더뉴 셀토스 근사치. ponytail: 실측 제원이 다르면 이 객체만 고친다.
  const SELTOS = {
    name: '더뉴 셀토스', length: 4.39, width: 1.80, wheelbase: 2.63, rearOverhang: 0.86, track: 1.58,
    turnRadius: 5.3, wheelLock: 450,
    driver: { x: 1.25, y: 0.37, z: 1.2 },
    fuelSide: 'left', fuelX: 0.15, // ponytail: 주유구 좌우·위치는 실차 확인 필요
  };
  const P = { steerRate: 540, creep: 5 / 3.6, creepAcc: 1.2, maxAcc: 2.5, brakeDec: 6, roll: 0.15, vMax: 20 / 3.6 };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // 바깥 앞바퀴가 반경 turnRadius 원을 그리는 자전거 모델 앞바퀴각
  function maxWheelAngle(s) {
    const r = Math.sqrt(s.turnRadius ** 2 - s.wheelbase ** 2) - s.track / 2;
    return Math.atan(s.wheelbase / r);
  }
  const frontOverhang = s => s.length - s.wheelbase - s.rearOverhang;
  const centerOffset = s => (s.wheelbase + frontOverhang(s) - s.rearOverhang) / 2;
  const delta = c => c.wheel / c.spec.wheelLock * c.dMax;

  // 차체 중심 자세 → 뒷축 자세 (차종마다 오프셋이 다름)
  function poseFromCenter(cx, cy, th, spec = SELTOS) {
    const off = centerOffset(spec);
    return { x: cx - Math.cos(th) * off, y: cy - Math.sin(th) * off, th };
  }
  function create(pose, spec = SELTOS) {
    return { spec, dMax: maxWheelAngle(spec), x: pose.x, y: pose.y, th: pose.th, z: 0, pitch: 0, v: 0, wheel: 0, gear: 'P' };
  }
  function setGear(c, g) {
    if (!['P', 'R', 'N', 'D'].includes(g) || Math.abs(c.v) > 0.05) return false;
    c.gear = g; c.v = 0;
    return true;
  }

  // 원호 정확 적분 (오일러 누적 오차 없음)
  function advance(p, ds, d, L) {
    if (Math.abs(d) < 1e-9) { p.x += ds * Math.cos(p.th); p.y += ds * Math.sin(p.th); return; }
    const R = L / Math.tan(d), th1 = p.th + ds / R;
    p.x += R * (Math.sin(th1) - Math.sin(p.th));
    p.y += R * (Math.cos(p.th) - Math.cos(th1));
    p.th = th1;
  }

  // pitch > 0 = 차 앞쪽이 오르막
  function step(c, ctl, dt, pitch = 0) {
    const lock = c.spec.wheelLock;
    c.wheel = ctl.steerAbs != null ? clamp(ctl.steerAbs, -lock, lock)
      : clamp(c.wheel + (ctl.steerRate || 0) * P.steerRate * dt, -lock, lock);
    c.pitch = pitch;
    if (c.gear === 'P') { c.v = 0; return; }
    const dir = c.gear === 'D' ? 1 : c.gear === 'R' ? -1 : 0;
    const thr = ctl.throttle || 0, brk = ctl.brake || 0;
    let a = -G * Math.sin(pitch);
    if (dir && thr > 0) a += dir * P.maxAcc * thr;
    else if (dir && brk === 0 && dir * c.v < P.creep) a += dir * P.creepAcc;
    let v = c.v + a * dt;
    const dec = (P.brakeDec * brk + P.roll) * dt;
    v = Math.abs(v) <= dec ? 0 : v - Math.sign(v) * dec;
    const vm = c.vMax ?? P.vMax; // 상태별 최고 속도(주행 미션), 후진은 기본값 이하
    c.v = clamp(v, -Math.min(vm, P.vMax), vm);
    advance(c, c.v * dt, delta(c), c.spec.wheelbase);
  }

  function toWorld(c, lx, ly) {
    const co = Math.cos(c.th), si = Math.sin(c.th);
    return [c.x + co * lx - si * ly, c.y + si * lx + co * ly];
  }
  function bodyBox(c) {
    const s = c.spec, [x, y] = toWorld(c, centerOffset(s), 0);
    return { x, y, l: s.length, w: s.width, a: c.th };
  }
  function corners(c) { // 앞왼, 앞오, 뒤오, 뒤왼
    const s = c.spec, f = s.wheelbase + frontOverhang(s), r = -s.rearOverhang, h = s.width / 2;
    return [toWorld(c, f, h), toWorld(c, f, -h), toWorld(c, r, -h), toWorld(c, r, h)];
  }
  function sensorPoints(c) {
    const s = c.spec, f = s.wheelbase + frontOverhang(s), r = -s.rearOverhang, h = s.width / 2, m = s.wheelbase / 2;
    return {
      front: [toWorld(c, f, h), toWorld(c, f, 0), toWorld(c, f, -h)],
      rear: [toWorld(c, r, h), toWorld(c, r, 0), toWorld(c, r, -h)],
      left: [toWorld(c, m, h)],
      right: [toWorld(c, m, -h)],
    };
  }
  function turnCenter(c) {
    const d = delta(c);
    if (Math.abs(d) < 1e-6) return null;
    return toWorld(c, 0, c.spec.wheelbase / Math.tan(d));
  }
  // 현재 핸들각을 유지하고 dir(+1 전진, -1 후진)으로 dist만큼 갈 때의 자세 n개
  function predict(c, dist, dir, n = 24) {
    const p = { x: c.x, y: c.y, th: c.th }, d = delta(c), out = [];
    for (let i = 0; i < n; i++) { advance(p, dir * dist / n, d, c.spec.wheelbase); out.push({ x: p.x, y: p.y, th: p.th }); }
    return out;
  }

  return { SELTOS, P, G, poseFromCenter, create, setGear, step, delta, maxWheelAngle, frontOverhang, centerOffset, toWorld, bodyBox, corners, sensorPoints, turnCenter, predict };
})();
if (typeof module !== 'undefined') module.exports = PP_CAR;
