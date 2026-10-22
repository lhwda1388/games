const assert = require('assert');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let fail = 0;
// node bungbung/test/nav.test.js
const R = require('../roads.js');
const N = require('../nav.js');
const PI = Math.PI, H = 14;

// 사거리 J1(0,0)·J2(400,0)를 잇는 편도 3차로, J1 북쪽 팔은 순환로(북→동→남)로 J2 북쪽 팔과 이어진다.
function twoJ() {
  const net = R.newNet();
  const T3 = [['left'], ['straight'], ['straight', 'right']], T2 = [['left', 'straight'], ['straight', 'right']];
  const w = R.straightRoad(net, { id: 'w', x: -H - 800, y: 0, a: 0, length: 800, lanesFwd: 3, lanesBack: 3, solidEnd: 30 });
  const m = R.straightRoad(net, { id: 'm', x: H, y: 0, a: 0, length: 400 - 2 * H, lanesFwd: 3, lanesBack: 3, solidEnd: 30, solidStart: 10 });
  const e = R.straightRoad(net, { id: 'e', x: 400 + H, y: 0, a: 0, length: 300, lanesFwd: 3, lanesBack: 3 });
  const s1 = R.straightRoad(net, { id: 's1', x: 0, y: -H, a: -PI / 2, length: 300, lanesFwd: 2, lanesBack: 2 });
  const s2 = R.straightRoad(net, { id: 's2', x: 400, y: -H, a: -PI / 2, length: 300, lanesFwd: 2, lanesBack: 2 });
  const n1 = R.straightRoad(net, { id: 'n1', x: 0, y: H, a: PI / 2, length: 150, lanesFwd: 2, lanesBack: 2 });
  const c1 = R.curvedRoad(net, { id: 'c1', x: 0, y: H + 150, a: PI / 2, radius: 30, angle: -PI / 2, lanesFwd: 2, lanesBack: 2 });
  const top = R.straightRoad(net, { id: 'top', x: 30, y: H + 180, a: 0, length: 340, lanesFwd: 2, lanesBack: 2 });
  const c2 = R.curvedRoad(net, { id: 'c2', x: 370, y: H + 180, a: 0, radius: 30, angle: -PI / 2, lanesFwd: 2, lanesBack: 2 });
  const n2 = R.straightRoad(net, { id: 'n2', x: 400, y: H + 150, a: -PI / 2, length: 150, lanesFwd: 2, lanesBack: 2 });
  for (const [a, b] of [[n1, c1], [c1, top], [top, c2], [c2, n2]]) { R.connect(net, a.fwd, b.fwd); R.connect(net, b.back, a.back); }
  R.junction4(net, { id: 'J1', x: 0, y: 0, arms: [{ road: w, turns: T3 }, { road: m, turns: T3 }, { road: n1, turns: T2 }, { road: s1, turns: T2 }],
    signal: { cycle: 90, protectedLeft: true }, crosswalks: true });
  R.junction4(net, { id: 'J2', x: 400, y: 0, arms: [{ road: m, turns: T3 }, { road: e, turns: T3 }, { road: n2, turns: T2 }, { road: s2, turns: T2 }],
    signal: { cycle: 90, protectedLeft: true }, crosswalks: true });
  return { net, w, m, e, s1, s2, n1, n2 };
}
// 경로를 따라 s를 늘리며 guide를 호출, 발화 목록 수집. 차선 변경 지점에서는 route의 다음 차로로 넘어간다.
function ride(net, route, step = 1) {
  const said = [];
  for (const st of route.steps) {
    for (let s = st.s0; s <= st.s1; s += step) {
      const g = N.guide(net, route, st.laneId, s);
      if (g.say) said.push({ say: g.say, laneId: st.laneId, s, g });
    }
  }
  return said;
}

test('경로: 우회전, 좌회전(좌회전 전용 1차로 경유), 경로 없음 null', () => {
  const { net, w } = twoJ();
  const r = N.route(net, 'w:f2', 20, 's1:f2', 100);
  assert(r, '우회전 경로');
  assert(r.lanes.includes('w:f3'), '3차로로 변경: ' + r.lanes.join(' '));
  assert(r.lanes.some(id => net.lanes[id].turn === 'right'));
  assert.strictEqual(r.lanes[0], 'w:f2');
  assert.strictEqual(r.lanes[r.lanes.length - 1], 's1:f2');
  const len = 800 - 20 + R.laneLength(net.lanes[r.lanes.find(id => net.lanes[id].turn === 'right')]) + 100;
  assert(Math.abs(r.length - len) < 1, r.length + ' vs ' + len);
  const l = N.route(net, 'w:f3', 20, 'n1:f1', 50);
  assert(l, '좌회전 경로');
  const lc = l.lanes.find(id => net.lanes[id].turn === 'left');
  assert.strictEqual(net.lanes[lc].from, 'w:f1', '좌회전 전용 1차로 경유');
  assert(l.lanes.indexOf('w:f2') < l.lanes.indexOf('w:f1'));
  assert.strictEqual(N.route(net, 'w:f2', 20, 's1:b1', 100), null, 's1에서 J1로 들어오는 차로는 갈 수 없음');
  assert(N.route(net, 'w:f2', 20, w.back[0], 100).lanes.includes('top:f2'), '반대 방향은 순환로로 돌아서');
  // 순환로를 지나 J2로
  const loop = N.route(net, 'n1:f1', 10, 's2:f1', 50);
  assert(loop && (loop.lanes.includes('top:f1') || loop.lanes.includes('top:f2')), '순환로 경로');
});

test('안내 문구: 300m 문턱 첫 통과에만, 좌회전 차로 안내, 잠시 후, 도착', () => {
  const { net } = twoJ();
  const r = N.route(net, 'w:f2', 0, 's1:f2', 100);
  const said = ride(net, r).map(x => x.say);
  assert.strictEqual(said.filter(x => x === '300m 앞 우회전입니다').length, 1, said.join(' / '));
  assert(said.includes('100m 앞 우회전, 3차로를 이용하세요'), said.join(' / '));
  assert(said.includes('잠시 후 우회전입니다'));
  assert.strictEqual(said[said.length - 1], '목적지에 도착했습니다');
  assert.strictEqual(new Set(said).size, said.length, '같은 문구 재발화 없음');
  // 같은 위치를 다시 불러도 재발화 없음
  assert.strictEqual(N.guide(net, r, 'w:f2', 510).say, null);
  const l = N.route(net, 'w:f3', 0, 'n1:f1', 50);
  const ls = ride(net, l).map(x => x.say);
  assert(ls.includes('300m 앞 좌회전입니다'), ls.join(' / '));
  assert(ls.includes('100m 앞 좌회전, 1차로를 이용하세요'), ls.join(' / '));
  const g = N.guide(net, l, 'w:f3', 400);
  assert.strictEqual(g.next.kind, 'left');
  assert(Math.abs(g.next.dist - 400) < 1, 'dist ' + g.next.dist);
  assert.strictEqual(g.limit, 50);
});

test('laneHint.ok는 회전 가능한 차로만', () => {
  const { net } = twoJ();
  const r = N.route(net, 'w:f1', 0, 's1:f1', 50);
  const g = N.guide(net, r, 'w:f1', 600);
  assert.strictEqual(g.next.kind, 'right');
  assert.deepStrictEqual(g.next.laneHint, { count: 3, ok: [2] });
  const l = N.route(net, 'w:f3', 0, 'n1:f2', 50);
  assert.deepStrictEqual(N.guide(net, l, l.lanes[0], 600).next.laneHint, { count: 3, ok: [0] });
  // J2에서 우회전: m 도로(직진은 안내 지점이 아님)
  const s = N.route(net, 'w:f2', 0, 's2:f1', 50);
  const gs = N.guide(net, s, 'w:f2', 10);
  assert.strictEqual(gs.next.kind, 'right');
  assert(gs.next.dist > 800 + 300, '첫 안내는 J2 우회전: ' + gs.next.dist);
});

test('경로 이탈 → offRoute true, 재탐색은 현재 차로에서 시작', () => {
  const { net } = twoJ();
  const r = N.route(net, 'w:f2', 0, 's2:f1', 100); // J1 직진 → J2 우회전
  assert.strictEqual(N.offRoute(net, r, 'w:f1', 100), false, '같은 도로 다른 차로(아직 변경 가능)');
  const left = net.lanes['w:f1'].next[0]; // J1 좌회전 → 순환로
  assert.strictEqual(N.offRoute(net, r, left, 3), true);
  assert.strictEqual(N.offRoute(net, r, 'n1:f1', 20), true);
  const rr = N.reroute(net, r, 'n1:f1', 20);
  assert(rr, '재탐색 경로');
  assert.strictEqual(rr.lanes[0], 'n1:f1');
  assert.strictEqual(rr.lanes[rr.lanes.length - 1], 's2:f1');
  assert.strictEqual(N.offRoute(net, rr, 'n1:f1', 25), false);
  const g = N.guide(net, rr, 'n1:f1', 20);
  assert.strictEqual(g.next.kind, 'arrive', 'n2→s2는 직진이라 다음 안내는 도착');
  assert(Math.abs(g.next.dist - rr.length) < 1e-6);
  assert.strictEqual(N.REROUTE_SAY, '경로를 이탈하여 재탐색합니다');
});

test('단속 카메라 500m·300m 안내', () => {
  const { net } = twoJ();
  const p = R.pointAt(net.lanes['w:f3'], 700);
  net.signs.push({ kind: 'camera', x: p.x - Math.sin(p.a) * -3, y: p.y + Math.cos(p.a) * -3, a: p.a, limit: 50 });
  const q = R.pointAt(net.lanes['w:b3'], 300); // 반대 방향 카메라는 무시
  net.signs.push({ kind: 'camera', x: q.x, y: q.y, a: q.a, limit: 30 });
  const r = N.route(net, 'w:f2', 0, 's1:f2', 100);
  const said = ride(net, r);
  const c5 = said.find(x => x.say === '500m 앞 과속 단속 카메라가 있습니다. 제한속도 50km입니다');
  const c3 = said.find(x => x.say === '전방에 과속 단속 카메라가 있습니다. 제한속도 50km입니다');
  assert(c5 && c3, said.map(x => x.say).join(' / '));
  assert(Math.abs(c5.s - 200) <= 2 && Math.abs(c3.s - 400) <= 2, c5.s + ' ' + c3.s);
  assert(!said.some(x => x.say.includes('30km')));
  const g = N.guide(net, r, 'w:f2', 300);
  assert(g.camera && Math.abs(g.camera.dist - 400) < 2 && g.camera.limit === 50);
  assert.strictEqual(N.guide(net, r, 'w:f3', 720).camera, null, '지나간 카메라');
});

// ---- 고속도로(2b) ----
require('../roads-highway.js');
const sayAll = (net, r, o) => {
  const out = [];
  for (const st of r.steps) for (let s = st.s0; s <= st.s1; s += 1) { const g = N.guide(net, r, st.laneId, s, o); if (g.say) out.push({ say: g.say, s, g }); }
  return out;
};
test('고속도로 출구: 2km·1km·500m·잠시 후 각 한 번, 나들목 이름, 차선 변경 안내 생략', () => {
  const net = R.newNet();
  const m = R.highway(net, { id: 'm', x: 0, y: 0, a: 0, length: 3000, lanes: 3 });
  const off = R.offRamp(net, { id: 'x', main: m, at: 2500, name: '서울' });
  const r = N.route(net, 'm:f1', 0, off.rampId, 100);
  assert(r && r.lanes.includes('x:decel'), '출구 경로');
  const said = sayAll(net, r).map(x => x.say);
  for (const t of ['2km 앞 서울나들목에서 출구입니다', '1km 앞 서울나들목에서 출구입니다. 오른쪽 차로를 이용하세요',
    '500m 앞 서울나들목에서 출구입니다. 오른쪽 차로를 이용하세요', '잠시 후 출구입니다'])
    assert.strictEqual(said.filter(x => x === t).length, 1, t + ' :: ' + said.join(' / '));
  assert(!said.some(x => x.includes('차로로 이동하세요')), said.join(' / '));
  assert.strictEqual(new Set(said).size, said.length);
  const g = N.guide(net, r, 'm:f2', 600);
  assert.strictEqual(g.next.kind, 'exit');
  assert.strictEqual(g.next.name, '서울나들목');
  assert.deepStrictEqual(g.next.laneHint, { count: 3, ok: [2] });
  assert(Math.abs(g.next.dist - 1900) < 3, 'dist ' + g.next.dist);
  // 2km 문턱은 처음 넘을 때만
  const s2 = sayAll(net, r).find(x => x.say.startsWith('2km'));
  assert.strictEqual(s2, undefined, '같은 route 재주행 시 재발화 없음');
});
test('고속도로 분기: 분기점·방면·방향, 이름 없으면 생략', () => {
  const net = R.newNet();
  const a = R.highway(net, { id: 'a', x: 0, y: 0, a: 0, length: 2500, lanes: 3 });
  const sp = R.split(net, { id: 'J', from: a, keepLanes: 2, branchLanes: 1, names: { keep: '부산', branch: '대전 방면', jc: '대전분기점' } });
  const r = N.route(net, 'a:f1', 0, sp.branch.fwd[0], 300);
  const said = sayAll(net, r).map(x => x.say);
  assert(said.includes('2km 앞 대전분기점에서 대전 방면 오른쪽 방향입니다'), said.join(' / '));
  assert(said.includes('잠시 후 대전 방면 오른쪽 방향입니다'), said.join(' / '));
  assert(!said.some(x => x.includes('차로로 이동하세요')), said.join(' / '));
  assert.strictEqual(N.guide(net, r, 'a:f1', 100).next.kind, 'jc-right');
  assert.deepStrictEqual(N.guide(net, r, 'a:f1', 100).next.laneHint, { count: 3, ok: [2] });
  const k = N.route(net, 'a:f3', 0, sp.keep.fwd[0], 300);
  const ks = sayAll(net, k).map(x => x.say);
  assert(ks.includes('1km 앞 대전분기점에서 부산 방면 왼쪽 방향입니다'), ks.join(' / '));
  assert.strictEqual(N.guide(net, k, 'a:f1', 2000).next.kind, 'jc-left');
  // 이름 없는 분기
  const net2 = R.newNet();
  const b = R.highway(net2, { id: 'b', x: 0, y: 0, a: 0, length: 2500, lanes: 3 });
  const sp2 = R.split(net2, { id: 'K', from: b, keepLanes: 2, branchLanes: 1, names: { keep: '부산', branch: '대전' } });
  for (const sg of net2.signs) if (sg.kind === 'overhead') sg.text = '';
  const r2 = N.route(net2, 'b:f3', 0, sp2.branch.fwd[0], 300);
  const s2 = sayAll(net2, r2).map(x => x.say);
  assert(s2.includes('1km 앞 오른쪽 방향입니다'), s2.join(' / '));
});
test('톨게이트 안내: 500m에서 하이패스 차로 안내', () => {
  const net = R.newNet();
  const h = R.highway(net, { id: 'h', x: 0, y: 0, a: 0, length: 2500, lanes: 2 });
  const tp = R.tollPlaza(net, { id: 'T', from: h });
  const r = N.route(net, 'h:f1', 0, tp.out.fwd[0], 100);
  const said = sayAll(net, r).map(x => x.say);
  assert.strictEqual(said.filter(x => x === '500m 앞 톨게이트입니다. 하이패스 차량은 1, 2차로를 이용하세요').length, 1, said.join(' / '));
  assert(said.includes('2km 앞 톨게이트입니다'), said.join(' / '));
  assert(said.includes('잠시 후 톨게이트입니다'), said.join(' / '));
  assert.strictEqual(N.guide(net, r, 'h:f1', 10).next.kind, 'toll');
});
test('정체 안내: 미션 jamAt 1km·300m 전, 옵션 없으면 없음', () => {
  const net = R.newNet();
  R.highway(net, { id: 'j', x: 0, y: 0, a: 0, length: 3000, lanes: 2 });
  const JAM = '전방 정체 구간입니다. 비상등을 켜고 감속하세요';
  const r = N.route(net, 'j:f2', 0, 'j:f2', 2900);
  const said = sayAll(net, r, { highway: true, jamAt: { laneId: 'j:f1', s: 1500 } });
  const j = said.filter(x => x.say === JAM);
  assert.strictEqual(j.length, 2, said.map(x => x.say).join(' / '));
  assert(Math.abs(j[0].s - 500) <= 2 && Math.abs(j[1].s - 1200) <= 2, j.map(x => x.s).join(' '));
  assert(said.some(x => x.say === '500m 앞 목적지입니다'), said.map(x => x.say).join(' / '));
  const r2 = N.route(net, 'j:f2', 0, 'j:f2', 2900);
  assert(!sayAll(net, r2).some(x => x.say === JAM));
});
test('시내 경로는 opts가 있어도 시내 문구 그대로', () => {
  const { net } = twoJ();
  const r = N.route(net, 'w:f2', 0, 's1:f2', 100);
  const said = sayAll(net, r, {}).map(x => x.say);
  assert(said.includes('300m 앞 우회전입니다') && said.includes('100m 앞 우회전, 3차로를 이용하세요') && said.includes('잠시 후 우회전입니다'), said.join(' / '));
  assert(!said.some(x => x.includes('km')));
});
test('톨게이트: 경로와 다른 부스·접근 차로는 경로 이탈 아님(부스는 단말기로 고른다)', () => {
  const net = R.newNet();
  const h = R.highway(net, { id: 'h', x: 0, y: 0, a: 0, length: 2000, lanes: 2 });
  const tp = R.tollPlaza(net, { id: 'T', from: h });
  const r = N.route(net, 'h:f2', 100, 'T:out:f2', 150);
  const on = r.lanes.find(id => net.lanes[id].kind === 'toll');
  const other = tp.booths.map(b => b.laneId).find(id => id !== on && net.lanes['h:f1'].next.includes(id));
  assert.strictEqual(N.offRoute(net, r, 'h:f1', 1999.8), false, '접근 차로 끝');
  assert.strictEqual(N.offRoute(net, r, other, 20), false, '다른 부스');
  assert(N.guide(net, r, other, 20).next, '다른 부스에서도 안내');
  assert.strictEqual(N.offRoute(net, r, 'T:out:f1', 20), false, '다른 출구 차로');
});

test('routeVia: 경유지(휴게소)를 지나는 경로, 단계가 이어지고 길이 = 두 구간 합', () => {
  const net = R.newNet();
  const m = R.highway(net, { id: 'm', x: 0, y: 0, a: 0, length: 4000, lanes: 2 });
  R.restArea(net, { id: 'ra', main: m, at: 1200, name: '행담도' });
  const direct = N.route(net, 'm:f2', 40, 'm:f2', 3300);
  assert(!direct.lanes.includes('ra:lot'), '최단 경로는 본선');
  const r = N.routeVia(net, 'm:f2', 40, { laneId: 'ra:lot', s: 60 }, 'm:f2', 3300);
  assert(r.lanes.includes('ra:lot') && r.lanes.includes('ra:off:decel') && r.lanes.includes('ra:on:accel'), r.lanes.join('>'));
  assert.strictEqual(new Set(r.lanes).size, r.lanes.length - 1, 'm:f2만 두 번(처음·끝)');
  for (let i = 1; i < r.steps.length; i++) assert(r.steps[i].s1 >= r.steps[i].s0);
  assert(Math.abs(r.length - r.steps.reduce((a, x) => a + x.s1 - x.s0, 0)) < 1e-6);
  const said = [];
  for (const st of r.steps) for (let s = st.s0; s <= st.s1; s += 5) { const g = N.guide(net, r, st.laneId, s); if (g.say) said.push(g.say); }
  assert(said.some(x => x.includes('행담도휴게소 입구')), said.join(' / '));
  // 휴게소를 지나쳐 본선에 그대로 있으면 이탈(본선 차로가 경로에 두 번 있어도)
  assert.strictEqual(N.offRoute(net, r, 'm:f2', 600), false, '감속차로 전');
  assert.strictEqual(N.offRoute(net, r, 'm:f2', 1700), true, '휴게소 지나침');
  assert.strictEqual(N.offRoute(net, r, 'm:f2', 2800), false, '재합류 뒤');
});

for (const [name, fn] of tests) {
  try { fn(); console.log('ok  ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n  ' + e.message); }
}
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('all ' + tests.length + ' passed');
