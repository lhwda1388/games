const assert = require('assert');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let fail = 0;
// node bungbung/test/render-road.test.js — render-road.js의 순수 함수(차 등 색·개수, 가로등 위치). THREE 없이 돈다.
const RR = require('../render-road.js');
const M = require('../missions.js'); require('../missions-exam.js');
const { K, NIGHT } = RR;

function lamps(cars, on, night) {
  const out = [];
  const n = RR.carLamps(cars, on, night, (i, c, end, side, hex) => out.push({ i, c, end, side, hex }));
  return { n, out };
}
const car = o => Object.assign({ x: 0, y: 0, th: 0, blink: 0, braking: false, hazard: false }, o);

test('carLamps: 차마다 4등, 번호는 0부터 빠짐없이(등 개수 = 4 × 차 수)', () => {
  const { n, out } = lamps([car(), car(), car()], true, false);
  assert.strictEqual(n, 12);
  assert.deepStrictEqual(out.map(e => e.i), [...Array(12).keys()]);
  assert.strictEqual(lamps([], true, false).n, 0);
});
test('낮: 평소 꺼짐, 브레이크는 뒤 두 등만 빨강', () => {
  assert(lamps([car()], true, false).out.every(e => e.hex === K.off));
  const { out } = lamps([car({ braking: true })], true, false);
  for (const e of out) assert.strictEqual(e.hex, e.end === -1 ? K.red : K.off);
});
test('깜빡이: 켜진 쪽 앞뒤만 노랑, 꺼진 박자에는 꺼짐 · 비상등은 네 등 모두', () => {
  for (const b of [-1, 1]) {
    const { out } = lamps([car({ blink: b })], true, false);
    for (const e of out) assert.strictEqual(e.hex, e.side === b ? K.yellow : K.off, `blink ${b} side ${e.side}`);
    assert(lamps([car({ blink: b })], false, false).out.every(e => e.hex === K.off));
  }
  assert(lamps([car({ hazard: true, braking: true })], true, false).out.every(e => e.hex === K.yellow));
});
test('밤: 앞 전조등·뒤 미등, 브레이크는 빨강, 깜빡이가 우선', () => {
  const { out } = lamps([car()], true, true);
  for (const e of out) assert.strictEqual(e.hex, e.end === 1 ? NIGHT.headlight : NIGHT.tail);
  for (const e of lamps([car({ braking: true, blink: 1 })], true, true).out)
    assert.strictEqual(e.hex, e.side === 1 ? K.yellow : e.end === -1 ? K.red : NIGHT.headlight);
});

// 다각형 안 여부와 변까지 최단 거리
function inPoly(pts, x, y) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function segDist(x, y, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0;
  return Math.hypot(x - ax - dx * t, y - ay - dy * t);
}
function polyDist(pts, x, y) {
  let d = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) d = Math.min(d, segDist(x, y, pts[j], pts[i]));
  return inPoly(pts, x, y) ? -d : d;
}

test('가로등: 모든 시내·시험 맵에서 노면(도로·교차로 면) 밖 0.5m 이상, 횡단보도(양끝 대기 공간 포함) 위가 아님', () => {
  const maps = M.list.filter(m => m.group === 'city' || m.group === 'exam');
  assert(maps.some(m => m.timeOfDay === 'night'), '야간 미션 포함');
  let total = 0;
  for (const m of maps) {
    const net = m.build(), pts = RR.lampPoints(net);
    assert(pts.length > 4, m.id + ' 가로등 수 ' + pts.length);
    total += pts.length;
    for (const p of pts) {
      const where = `${m.id} (${p.x.toFixed(1)}, ${p.y.toFixed(1)})`;
      for (const a of net.areas) assert(polyDist(a.pts, p.x, p.y) >= 0.5, `${where}: 노면 ${a.kind} ${a.id} 위/가까이`);
      for (const cw of net.crosswalks) { // 횡단보도 띠(폭 + 앞뒤 1m)를 길 밖으로 3m 더 늘인 구역
        const [[ax, ay], [bx, by]] = cw.pts, L = Math.hypot(bx - ax, by - ay), ux = (bx - ax) / L, uy = (by - ay) / L;
        const along = (p.x - ax) * ux + (p.y - ay) * uy, across = Math.abs(-(p.x - ax) * uy + (p.y - ay) * ux);
        assert(!(along > -3 && along < L + 3 && across < cw.width / 2 + 1), `${where}: 횡단보도 ${cw.id} 위`);
      }
    }
  }
  assert(total > 50);
});

test('빗줄기: 선분 n개(꼭짓점 2n), 상자 [-w/2,w/2]×[0,h] 안, 아래로 기운 짧은 선, 결정론', () => {
  const { RAIN } = RR, w = RAIN.box[0], h = RAIN.box[1];
  const a = RR.rainStreaks(RAIN.n, w, h, RAIN.len, 7), b = RR.rainStreaks(RAIN.n, w, h, RAIN.len, 7);
  assert.strictEqual(a.length, RAIN.n * 6);
  assert.deepStrictEqual(Array.from(a), Array.from(b));
  assert.notDeepStrictEqual(Array.from(RR.rainStreaks(RAIN.n, w, h, RAIN.len, 8)), Array.from(a));
  for (let i = 0; i < a.length; i += 6) {
    for (const k of [0, 3]) { assert(Math.abs(a[i + k]) <= w / 2 + 0.2 && Math.abs(a[i + k + 2]) <= w / 2 + 0.2); assert(a[i + k + 1] >= 0 && a[i + k + 1] <= h); }
    const dy = a[i + 4] - a[i + 1], L = Math.hypot(a[i + 3] - a[i], dy, a[i + 5] - a[i + 2]);
    assert(dy < 0 && Math.abs(L - RAIN.len) < 1e-4); // Float32
  }
});
test('비 설정: 하늘이 낮보다 어둡고 안개가 가깝다(시내·고속도로), 빛은 줄인다', () => {
  const { RAIN } = RR, lum = c => ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255);
  assert(lum(RAIN.sky) < lum(0xb7d2ea));
  assert(RAIN.fog[1] < 420 && RAIN.fogHw[1] < 580 && RAIN.fog[0] < RAIN.fog[1]);
  assert(RAIN.light.every(x => x > 0 && x < 1));
  assert(lum(RAIN.asphalt) < lum(K.asphalt));
});
for (const [name, fn] of tests) {
  try { fn(); console.log('ok  ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n  ' + e.message); }
}
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('all ' + tests.length + ' passed');
