const assert = require('assert');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let fail = 0;
// node bungbung/test/missions.test.js
const R = require('../roads.js');
const N = require('../nav.js');
const T = require('../traffic.js');
const K = require('../collision.js');
const M = require('../missions.js');
const MH = require('../missions-highway.js');
const ME = require('../missions-exam.js');
const BOT = require('./bot.js');
const E = require('../exam.js');
const IDS = ['city-lane', 'city-bus', 'city-cutin', 'city-leftlane', 'city-signal', 'city-unprotected', 'city-rightstop', 'city-uturn', 'city-school', 'city-night', 'city-rain', 'city-merge'];
const HW = ['hw-merge', 'hw-exit', 'hw-jc', 'hw-toll', 'hw-pass', 'hw-jam', 'hw-rest', 'hw-rain'];
const CITY = M.list.filter(m => m.group === 'city');
const nets = {};
const netOf = m => (nets[m.id] = nets[m.id] || m.build());

test('시내 12 + 고속도로 8 + 시험 2, id 중복 없음, 필수 필드', () => {
  assert.deepStrictEqual(CITY.map(m => m.id).sort(), IDS.slice().sort());
  assert.deepStrictEqual(MH.list.map(m => m.id), HW);
  assert.strictEqual(M.list.length, 22);
  assert.strictEqual(new Set(M.list.map(m => m.id)).size, 22);
  for (const m of M.list) assert.strictEqual(m.weather, ['city-rain', 'hw-rain'].includes(m.id) ? 'rain' : undefined, m.id + ' weather');
  for (const m of CITY) {
    for (const k of ['id', 'name', 'tip', 'build', 'start', 'goal', 'density', 'limit', 'scripts', 'vMax', 'timeOfDay']) assert(m[k] !== undefined, `${m.id}.${k}`);
    assert.strictEqual(m.vMax, 60 / 3.6);
    assert.strictEqual(m.timeOfDay, m.id === 'city-night' ? 'night' : 'day');
    assert(['easy', 'normal', 'rush'].includes(m.density));
    assert(/[가-힣]/.test(m.name) && /[가-힣]/.test(m.tip));
    assert.strictEqual(M.byId(m.id), m);
  }
});

test('build()는 결정론(두 번 호출 결과 같은 JSON)', () => {
  for (const m of M.list) assert.strictEqual(JSON.stringify(m.build()), JSON.stringify(m.build()), m.id);
  assert.strictEqual(MH.list.find(m => m.id === 'hw-toll').hipass, T.mulberry32({ s: M.byId('hw-toll').seed }) % 2 === 0, '하이패스 = 시드');
});

test('시작 위치가 차로 위, 목적지까지 경로 존재, 1~3분 거리', () => {
  for (const m of CITY) {
    const net = netOf(m), ln = net.lanes[m.start.laneId];
    assert(ln && ln.kind === 'normal', m.id + ' start lane');
    assert(m.start.s > 5 && m.start.s < R.laneLength(ln) - 5, m.id + ' start s');
    assert(net.lanes[m.goal.laneId] && m.goal.s <= R.laneLength(net.lanes[m.goal.laneId]), m.id + ' goal');
    const r = N.route(net, m.start.laneId, m.start.s, m.goal.laneId, m.goal.s);
    assert(r, m.id + ' 경로 없음');
    const t50 = r.length / (m.limit / 3.6);
    assert(t50 > 35 && t50 < 120, `${m.id}: 경로 ${r.length.toFixed(0)}m = 제한속도로 ${t50.toFixed(0)}초`);
    for (const id of Object.keys(net.lanes)) {
      const w = net.lanes[id].width;
      assert(w >= 3.0 && w <= 3.5, `${m.id}: 차로 폭 ${w}`);
    }
    // 신호 교차로에는 횡단보도
    for (const s of net.signals) assert(net.crosswalks.some(c => c.junction === s.junction), m.id + ' 횡단보도');
  }
});

test('미션별 핵심 요소', () => {
  const net = id => netOf(M.byId(id));
  const route = id => { const m = M.byId(id); return N.route(net(id), m.start.laneId, m.start.s, m.goal.laneId, m.goal.s); };
  // city-lane: 3차로 + 교차로 앞 실선 구간, 우회전 경로는 1차로에서 3차로까지 두 번 변경
  {
    const n = net('city-lane'), m = M.byId('city-lane'), ln = n.lanes[m.start.laneId];
    assert(ln.left === null && ln.right && n.lanes[ln.right].right, '시작은 편도 3차로의 1차로');
    const L = R.laneLength(ln);
    assert(!R.canChange(n, ln.right, n.lanes[ln.right].right, L - 10) && R.canChange(n, ln.right, n.lanes[ln.right].right, L / 2), '교차로 앞 실선');
    const r = route('city-lane');
    assert.strictEqual(r.steps.filter(s => s.via === 'change').length, 2);
    assert(r.lanes.some(id => n.lanes[id].turn === 'right'));
    assert(N.guide(n, r, m.start.laneId, m.start.s).next.kind === 'right');
  }
  // city-bus: 청색 실선 + 점선 구간, 경로는 점선 구간에서 버스전용차로로 들어가 우회전
  {
    const n = net('city-bus'), types = new Set(n.lines.map(l => l.type));
    assert(types.has('blue-solid') && types.has('blue-dashed'));
    const bus = Object.values(n.lanes).find(l => l.kind === 'bus');
    assert(bus && n.signs.some(s => s.kind === 'bus-lane') && n.marks.some(k => k.text === '버스전용'));
    const r = route('city-bus'), i = r.lanes.indexOf(bus.id);
    assert(i > 0 && R.canChange(n, r.lanes[i - 1], bus.id, r.steps[i].s0) && !R.canChange(n, r.lanes[i - 1], bus.id, r.steps[i].s0 - 150));
    assert.strictEqual(n.lanes[r.lanes[i + 1]].turn, 'right');
  }
  // city-unprotected: 비보호 표지, 녹색 원형만 있는 신호, 좌회전 경로
  {
    const n = net('city-unprotected');
    assert(n.signs.some(s => s.kind === 'unprotected-left'));
    const r = route('city-unprotected'), lc = n.lanes[r.lanes.find(id => n.lanes[id].turn === 'left')];
    const sig = n.signals.find(s => s.stops.some(x => x.laneId === lc.from));
    assert(sig.unprotected && sig.heads === 'three');
    assert(sig.phases.every(p => Object.values(p.state).every(v => v !== 'LG')));
    assert(sig.phases.some(p => p.state[lc.from] === 'G'));
  }
  // city-rightstop: 우회전 경로, 횡단보도, 미션 시작 직후 진입 차로가 적색, 보행자 스크립트 대상 존재
  {
    const n = net('city-rightstop'), m = M.byId('city-rightstop'), r = route('city-rightstop');
    const rc = n.lanes[r.lanes.find(id => n.lanes[id].turn === 'right')], st = R.stopOf(n, rc.from);
    assert(n.crosswalks.some(c => c.lanes.some(l => l.laneId === rc.from)), '진입 차로 앞 횡단보도');
    assert(n.signals.find(s => s.id === st.signal).phases.some(p => p.state[rc.from] === 'R'));
    for (let t = 0; t <= 40; t += 1) assert.strictEqual(R.signalState(n, t, st.signal, rc.from), 'R', '접근하는 동안 적색 t=' + t);
    const ps = m.scripts.find(s => s.action === 'peds');
    assert(ps && n.crosswalks.some(c => c.id === ps.crosswalk));
  }
  // city-leftlane: 좌회전 전용 차로와 LG phase, 100m 앞 좌회전 1차로 안내
  {
    const n = net('city-leftlane'), m = M.byId('city-leftlane'), r = route('city-leftlane');
    const lc = n.lanes[r.lanes.find(id => n.lanes[id].turn === 'left')], inl = n.lanes[lc.from];
    assert(inl.next.every(id => n.lanes[id].turn === 'left'), '좌회전 전용');
    assert(n.signals.some(s => s.phases.some(p => p.state[inl.id] === 'LG')));
    const said = [];
    for (const st of r.steps) for (let s = st.s0; s <= st.s1; s += 1) { const g = N.guide(n, r, st.laneId, s); if (g.say) said.push(g.say); }
    assert(said.includes('100m 앞 좌회전, 1차로를 이용하세요'), said.join(' / '));
    assert.notStrictEqual(m.start.laneId, inl.id, '1차로가 아닌 곳에서 출발');
  }
  // city-signal: 신호 3개, 경로가 세 교차로를 지남, 두 번째 교차로는 접근 중 황색
  {
    const n = net('city-signal'), r = route('city-signal');
    assert.strictEqual(n.signals.length, 3);
    const crossed = n.signals.filter(s => r.lanes.some(id => s.stops.some(x => x.laneId === id)));
    assert.strictEqual(crossed.length, 3);
    const s2 = crossed[1], in2 = r.lanes.find(id => s2.stops.some(x => x.laneId === id));
    let sawY = false;
    for (let t = 25; t <= 45; t += 0.5) if (R.signalState(n, t, s2.id, in2) === 'Y') sawY = true;
    assert(sawY, '두 번째 교차로 25~45초 사이 황색');
    assert.strictEqual(R.signalState(n, 10, crossed[0].id, r.lanes.find(id => crossed[0].stops.some(x => x.laneId === id))), 'G', '첫 교차로는 녹색으로 시작');
  }
  // city-cutin: cut-in 스크립트, 대상 차로가 존재하고 플레이어 차로와 이웃
  {
    const n = net('city-cutin'), m = M.byId('city-cutin'), sc = m.scripts.find(s => s.action === 'cut-in');
    assert(sc && n.lanes[sc.spawn.laneId]);
    const sl = n.lanes[sc.spawn.laneId];
    assert(sl.left === m.start.laneId || sl.right === m.start.laneId);
    assert(sc.when.lanes.includes(m.start.laneId) && sc.when.lanes.every(id => n.lanes[id]));
  }
});

test('C2 미션: 빗길 시내·빗길 고속도로·차로 감소', () => {
  const routeOf = m => N.route(netOf(m), m.start.laneId, m.start.s, m.goal.laneId, m.goal.s);
  { // city-rain: 제한 40(20% 감속), 미끄러운 도로·제한 40 표지, 신호 2개 지남, 앞차 급제동 스크립트, 교통 옵션에 날씨
    const m = M.byId('city-rain'), n = netOf(m), r = routeOf(m);
    assert.strictEqual(m.limit, 40);
    for (const id of r.lanes) assert.strictEqual(n.lanes[id].limit, 40, id);
    assert(n.signs.some(s => s.kind === 'slippery') && n.signs.some(s => s.kind === 'limit' && s.limit === 40));
    assert(n.signals.filter(s => r.lanes.some(id => s.stops.some(x => x.laneId === id))).length >= 2);
    const b = m.scripts.find(s => s.action === 'brake');
    assert(b && b.spawn.laneId === m.start.laneId && b.spawn.s > m.start.s && b.when.lanes.includes(m.start.laneId) && b.near > 0);
    assert.strictEqual(M.trafficOpts(m, n).weather, 'rain');
    assert.strictEqual(M.trafficOpts(M.byId('city-lane'), netOf(M.byId('city-lane'))).weather, undefined);
  }
  { // hw-rain: 제한 80 본선, 미끄러운 도로·제한 80 표지, 급제동 스크립트
    const m = M.byId('hw-rain'), n = netOf(m), r = routeOf(m);
    assert.strictEqual(m.group, 'highway'); assert.strictEqual(m.limit, 80);
    for (const id of r.lanes) assert.strictEqual(n.lanes[id].limit, 80, id);
    assert(n.signs.some(s => s.kind === 'slippery') && n.signs.some(s => s.kind === 'limit' && s.limit === 80));
    assert(m.scripts.some(s => s.action === 'brake' && s.v > 0 && s.v < 80 / 3.6));
  }
  { // city-merge: 2 → 1차로, 바깥 차로에서 출발, 경로는 합류 차로를 피해 끝나기 전에 왼쪽으로, 안내는 차로가 끝나는 곳 기준
    const m = M.byId('city-merge'), n = netOf(m), r = routeOf(m), st = n.lanes[m.start.laneId];
    const ml = Object.values(n.lanes).find(l => l.kind === 'merge');
    assert(ml && st.next.includes(ml.id), '출발 차로가 합류 차로로 이어짐');
    assert(!r.lanes.includes(ml.id), '경로는 합류 차로로 가지 않는다');
    assert.strictEqual(r.steps[1].via, 'change'); assert.strictEqual(r.steps[1].laneId, st.left);
    const drop = N.maneuvers(n, r).find(x => x.drop);
    assert(drop && drop.kind === 'lane-left');
    const said = [];
    for (let s = m.start.s; s < R.laneLength(st); s += 1) { const g = N.guide(n, r, st.id, s); if (g.say) said.push(g.say); }
    assert(said.includes('300m 앞 차로가 줄어듭니다. 왼쪽 차로로 이동하세요'), said.join(' / '));
    assert(said.includes('차로가 줄어듭니다. 왼쪽 차로로 이동하세요'), said.join(' / '));
    const r2 = routeOf(m); // 이미 왼쪽으로 옮겼으면 차로 감소 안내는 하지 않는다
    for (let s = 100; s < R.laneLength(st); s += 1) assert.strictEqual(N.guide(n, r2, st.left, s).say, null, 's=' + s);
    assert(n.signs.filter(s => s.kind === 'lane-end').length >= 2 && n.marks.some(k => k.arrow === 'merge-left') && n.marks.some(k => k.kind === 'drum'));
  }
});

test('city-merge 교통 120초: AI가 합류 차로 끝을 넘거나 사라지지 않고, 지퍼식으로 합류', () => {
  const m = M.byId('city-merge'), net = netOf(m), sim = T.create(net, M.trafficOpts(m, net));
  const ml = Object.values(net.lanes).find(l => l.kind === 'merge'), merged = new Set();
  let lost = 0;
  for (let i = 0; i < 120 * 30; i++) {
    const on = sim.list.filter(c => c.laneId === ml.id);
    T.step(sim, 1 / 30, i / 30, null);
    for (const c of on) if (!sim.list.includes(c)) lost++;
    for (const c of sim.list) {
      if (c.laneId === ml.id) assert(c.s + c.l / 2 <= ml.endS, `차 ${c.id} 끝 넘음`);
      if (c.from === ml.id) merged.add(c.id);
    }
  }
  assert.strictEqual(lost, 0);
  assert(merged.size >= 2, '합류한 차 ' + merged.size);
});

// 점이 노면(도로·교차로 면) 안인가
const inPoly = (pts, x, y) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, yi] = pts[i], [xj, yj] = pts[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
const onSurface = (net, x, y) => net.areas.some(a => inPoly(a.pts, x, y));

test('C1 시내 미션: 유턴·어린이보호구역·야간', () => {
  const routeOf = m => N.route(netOf(m), m.start.laneId, m.start.s, m.goal.laneId, m.goal.s);
  { // city-uturn: 1차로 좌회전+유턴, 유턴은 LG에, 마주 오는 바깥 차로로, 노면 안, 돌 수 있는 반경
    const m = M.byId('city-uturn'), n = netOf(m), r = routeOf(m);
    const uc = n.lanes[r.lanes.find(id => n.lanes[id].turn === 'uturn')];
    assert(uc, '경로에 유턴 연결 차로');
    const inl = n.lanes[uc.from], out = n.lanes[uc.next[0]];
    assert.strictEqual(inl.left, null, '유턴은 1차로에서');
    assert(inl.next.some(id => n.lanes[id].turn === 'left'), '1차로 좌회전 겸용');
    assert.strictEqual(out.right, null, '마주 오는 방향 바깥 차로로');
    assert.strictEqual(out.road, inl.road, '왔던 도로로 돌아간다');
    const sig = n.signals.find(s => s.stops.some(x => x.laneId === inl.id));
    assert(sig && !sig.unprotected && sig.phases.some(p => p.state[inl.id] === 'LG'));
    assert.strictEqual(R.movement('LG', 'uturn', false), 'protected');
    assert.strictEqual(R.movement('G', 'uturn', false), null);
    const a0 = R.pointAt(n.lanes[m.start.laneId], m.start.s).a, a1 = R.pointAt(n.lanes[m.goal.laneId], m.goal.s).a;
    assert(Math.abs(R.wrap(a1 - a0 - Math.PI)) < 0.01, '목적지는 왔던 길 반대 방향');
    for (const [x, y] of uc.pts) assert(onSurface(n, x, y), `유턴 점 (${x.toFixed(1)},${y.toFixed(1)}) 노면 밖`);
    const P = uc.pts, e0 = R.pointAt(uc, 0), e1 = R.pointAt(uc, R.laneLength(uc));
    assert(Math.abs(R.wrap(e1.a - e0.a - Math.PI)) < 0.15, '180° 회전'); // 끝 선분은 원호 현이라 조금 기운다
    for (let i = 1; i < P.length - 1; i++) { // 세 점 외접원 반경 ≥ 5.3m(셀토스 최소 회전 반경)
      const [a, b, c] = [P[i - 1], P[i], P[i + 1]], A = Math.hypot(b[0] - c[0], b[1] - c[1]), B = Math.hypot(a[0] - c[0], a[1] - c[1]), Cc = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const area2 = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
      if (area2 > 1e-9) assert(A * B * Cc / (2 * area2) >= 5.3, '유턴 반경 ' + (A * B * Cc / (2 * area2)).toFixed(2));
    }
    assert(n.signs.some(s => s.kind === 'uturn'), '유턴 표지');
    assert(n.marks.some(k => k.kind === 'arrow' && k.laneId === inl.id && k.arrow.includes('uturn')), '노면 유턴 화살표');
  }
  { // city-school: 제한 30, 어린이보호구역 표지, 신호 없는 교차로 횡단보도·정지선, 경로 위 횡단보도에 보행자 스크립트
    const m = M.byId('city-school'), n = netOf(m), r = routeOf(m);
    assert.strictEqual(m.limit, 30);
    for (const id of r.lanes) assert.strictEqual(n.lanes[id].limit, 30, id);
    assert(n.signs.some(s => s.kind === 'school') && n.signs.some(s => s.kind === 'limit' && s.limit === 30));
    const ps = m.scripts.find(s => s.action === 'peds'), cw = n.crosswalks.find(c => c.id === ps.crosswalk);
    assert(ps && cw && ps.count === 3);
    assert.strictEqual(cw.signal, null, '신호 없는 횡단보도');
    assert(!n.signals.some(s => s.junction === cw.junction), '신호 없는 교차로');
    const lane = cw.lanes.find(l => r.lanes.includes(l.laneId));
    assert(lane, '경로가 횡단보도를 지난다');
    const st = R.stopOf(n, lane.laneId);
    assert(st && st.signal === null && st.s < lane.s0, '횡단보도 앞 정지 위치');
    const sp = R.pointAt(n.lanes[lane.laneId], st.s);
    assert(n.lines.some(l => l.type === 'stop' && l.pts.some(([x, y]) => Math.hypot(x - sp.x, y - sp.y) < n.lanes[lane.laneId].width)), '정지선');
    assert(ps.when.lanes.includes(lane.laneId) && ps.when.s < lane.s0);
  }
  { // city-night: 야간, 신호 2개 지남, 차로 변경, 보행자 스크립트 1회
    const m = M.byId('city-night'), n = netOf(m), r = routeOf(m);
    assert.strictEqual(m.timeOfDay, 'night');
    assert(n.signals.filter(s => r.lanes.some(id => s.stops.some(x => x.laneId === id))).length >= 2);
    assert(r.steps.some(s => s.via === 'change'), '차로 변경');
    const ps = m.scripts.filter(s => s.action === 'peds');
    assert.strictEqual(ps.length, 1);
    assert(n.crosswalks.find(c => c.id === ps[0].crosswalk).lanes.some(l => r.lanes.includes(l.laneId)));
  }
});

test('신호 없는 횡단보도: 보행자가 있을 때 지나가면 보행자 감점', () => {
  const DS = require('../drive-score.js'), m = M.byId('city-school'), n = netOf(m);
  const cw = n.crosswalks.find(c => c.id === m.scripts[0].crosswalk), cl = cw.lanes.find(l => n.lanes[l.laneId].kind === 'normal' && l.laneId === m.start.laneId);
  const ln = n.lanes[cl.laneId], PL = 4.39;
  const mid = R.pointAt(ln, (cl.s0 + cl.s1) / 2);
  const frame = (s, peds, t) => { const p = R.pointAt(ln, s); return { t, dt: 1 / 30, car: { x: p.x, y: p.y, th: p.a, v: 5, laneId: ln.id, s, offset: 0, dist: 0 }, blink: 0, collision: null, others: [], peds }; };
  for (const [peds, want] of [[[{ x: mid.x, y: mid.y, walking: true }], 1], [[], 0], [[{ x: mid.x, y: mid.y, walking: false }], 0]]) {
    const ds = DS.create(m, n);
    DS.update(ds, frame(cl.s0 - PL / 2 - 0.5, peds, 0));
    DS.update(ds, frame(cl.s0 - PL / 2 + 0.2, peds, 0.1));
    const got = ds.penalties.filter(p => p.code === 'stop' && p.text === DS.TEXT.ped).length;
    assert.strictEqual(got, want, JSON.stringify(peds));
  }
});

test('시험 코스 2개: 구조', () => {
  assert.deepStrictEqual(ME.list.map(m => m.id), ['exam-a', 'exam-b']);
  for (const m of ME.list) {
    assert.strictEqual(m.group, 'exam'); assert.strictEqual(m.exam, true);
    for (const k of ['id', 'name', 'tip', 'build', 'start', 'goal', 'density', 'limit', 'scripts', 'vMax', 'timeOfDay', 'seed']) assert(m[k] !== undefined, `${m.id}.${k}`);
    assert.strictEqual(m.density, 'easy'); assert.strictEqual(m.limit, 50); assert.strictEqual(m.vMax, 60 / 3.6);
    assert(/[가-힣]/.test(m.name) && /[가-힣]/.test(m.tip));
    assert.strictEqual(M.byId(m.id), m);
    const net = netOf(m), ln = net.lanes[m.start.laneId];
    assert(ln && ln.kind === 'normal', m.id + ' start lane');
    assert(m.start.s > 5 && m.start.s < R.laneLength(ln) - 5, m.id + ' start s');
    assert(net.lanes[m.goal.laneId] && m.goal.s <= R.laneLength(net.lanes[m.goal.laneId]), m.id + ' goal');
    const r = N.route(net, m.start.laneId, m.start.s, m.goal.laneId, m.goal.s);
    assert(r, m.id + ' 경로 없음');
    const t = r.length / (m.limit / 3.6);
    assert(t > 35 && t < 150, `${m.id}: 경로 ${r.length.toFixed(0)}m = ${t.toFixed(0)}초`);
    for (const s of net.signals) assert(net.crosswalks.some(c => c.junction === s.junction), m.id + ' 횡단보도');
  }
  { // exam-a: 어린이보호구역(30) + school 표지, J3 보호 좌회전
    const m = M.byId('exam-a'), n = netOf(m), r = N.route(n, m.start.laneId, m.start.s, m.goal.laneId, m.goal.s);
    const z = r.lanes.map(id => n.lanes[id]).find(l => l.limit === 30);
    assert(z, '경로에 30km/h 차로');
    assert(n.signs.some(s => s.kind === 'school'), 'school 표지');
    assert(n.signs.some(s => s.kind === 'limit' && s.limit === 30), '30 제한 표지');
    const lc = r.lanes.map(id => n.lanes[id]).find(l => l.turn === 'left');
    assert(lc && lc.road === 'J3', 'J3 좌회전');
    assert(n.lanes[lc.from].next.every(id => n.lanes[id].turn === 'left'), '좌회전 전용 1차로');
    assert(!R.signalById(n, 'J3:sig').unprotected);
  }
  { // exam-b: J1 비보호 좌회전, J2 우회전, 보행자 스크립트
    const m = M.byId('exam-b'), n = netOf(m), r = N.route(n, m.start.laneId, m.start.s, m.goal.laneId, m.goal.s);
    const ls = r.lanes.map(id => n.lanes[id]);
    const lc = ls.find(l => l.turn === 'left'), rc = ls.find(l => l.turn === 'right');
    assert(lc && lc.road === 'J1' && R.signalById(n, 'J1:sig').unprotected, 'J1 비보호 좌회전');
    assert(n.signs.some(s => s.kind === 'unprotected-left'));
    assert(rc && rc.road === 'J2', 'J2 우회전');
    const ps = m.scripts.find(s => s.action === 'peds');
    assert(ps && n.crosswalks.some(c => c.id === ps.crosswalk), 'peds crosswalk');
    assert(n.crosswalks.find(c => c.id === ps.crosswalk).lanes.some(l => l.laneId === rc.from), '우회전 진입 차로 앞 횡단보도');
    assert(ps.when.lanes.every(id => n.lanes[id]) && ps.when.lanes.includes(rc.from));
  }
});

test('교통 생성 직후 플레이어 시작 위치와 겹치는 차 없음, 스크립트 대상 존재', () => {
  for (const m of M.list) { // 시내·고속도로 모두
    const net = netOf(m), sim = T.create(net, M.trafficOpts(m, net));
    const p = R.pointAt(net.lanes[m.start.laneId], m.start.s);
    const me = { x: p.x, y: p.y, l: 4.39 + 8, w: 1.8 + 2, a: p.a }; // 앞뒤 4m·좌우 1m 여유
    for (const c of T.cars(sim)) assert(!K.overlap(me, { x: c.x, y: c.y, l: c.l, w: c.w, a: c.th }), `${m.id}: 차 ${c.id}가 시작 위치와 겹침`);
    assert(T.cars(sim).length > 3, m.id + ' 교통 없음');
    for (const sc of m.scripts) {
      if (sc.spawn) assert(net.lanes[sc.spawn.laneId], m.id + ' spawn');
      if (sc.crosswalk) assert(net.crosswalks.some(c => c.id === sc.crosswalk), m.id + ' crosswalk');
    }
  }
});

test('미션 도로에서 교통 90초: 차끼리 충돌 없음', () => {
  for (const m of CITY) {
    const net = netOf(m), sim = T.create(net, M.trafficOpts(m, net));
    for (let i = 0; i < 90 * 30; i++) {
      T.step(sim, 1 / 30, i / 30, null);
      const cs = T.cars(sim);
      for (let a = 0; a < cs.length; a++) for (let b = a + 1; b < cs.length; b++) {
        const A = cs[a], B = cs[b];
        if (Math.abs(A.x - B.x) > 6 || Math.abs(A.y - B.y) > 6) continue;
        assert(!K.overlap({ x: A.x, y: A.y, l: A.l, w: A.w, a: A.th }, { x: B.x, y: B.y, l: B.l, w: B.w, a: B.th }), `${m.id} t=${(i / 30).toFixed(1)} 충돌 ${A.id}·${B.id}`);
      }
    }
  }
});
test('고속도로: 필수 필드, 시작 위치가 차로 위, 경로 존재, 3~5km·1~3분', () => {
  for (const m of MH.list) {
    for (const k of ['id', 'name', 'tip', 'build', 'start', 'goal', 'scripts', 'seed']) assert(m[k] !== undefined, `${m.id}.${k}`);
    assert.strictEqual(m.group, 'highway'); assert.strictEqual(m.highway, true);
    assert.strictEqual(m.density, 'highway'); assert.strictEqual(m.limit, m.weather === 'rain' ? 80 : 100); assert.strictEqual(m.vMax, 110 / 3.6);
    assert(/[가-힣]/.test(m.name) && /[가-힣]/.test(m.tip));
    assert.strictEqual(M.byId(m.id), m);
    const net = netOf(m), ln = net.lanes[m.start.laneId];
    assert(ln && (ln.kind === 'normal' || ln.kind === 'ramp'), m.id + ' start lane');
    assert(m.start.s > 5 && m.start.s < R.laneLength(ln) - 5, m.id + ' start s');
    const p = R.pointAt(ln, m.start.s), q = R.project(net, p.x, p.y, m.start.laneId);
    assert(q.laneId === m.start.laneId && q.dist < 1e-6, m.id + ' 시작 점이 차로 중심');
    const r = m.via ? N.routeVia(net, m.start.laneId, m.start.s, m.via, m.goal.laneId, m.goal.s) : N.route(net, m.start.laneId, m.start.s, m.goal.laneId, m.goal.s);
    assert(r, m.id + ' 경로 없음');
    assert(r.length > 2800 && r.length < 5000, `${m.id}: ${r.length.toFixed(0)}m`);
    for (const id of r.lanes) { const w = net.lanes[id].width; assert(w === 3.6, `${m.id}: 차로 폭 ${w}`); }
  }
});

test('고속도로 미션별 핵심 요소', () => {
  const get = id => { const m = M.byId(id), net = netOf(m); return { m, net, r: m.via ? N.routeVia(net, m.start.laneId, m.start.s, m.via, m.goal.laneId, m.goal.s) : N.route(net, m.start.laneId, m.start.s, m.goal.laneId, m.goal.s) }; };
  { // hw-merge: 램프 → 가속차로(250m) → 2차로 본선
    const { net, r } = get('hw-merge'), acc = net.lanes[r.lanes[1]];
    assert.strictEqual(net.lanes[r.lanes[0]].kind, 'ramp');
    assert(acc.kind === 'accel' && Math.abs(R.laneLength(acc) - 250) < 1);
    assert.strictEqual(r.steps[2].via, 'change'); assert.strictEqual(r.lanes[2], acc.left);
    assert.strictEqual(net.lanes[acc.left].left, 'm:f1', '편도 2차로');
  }
  { // hw-exit: 3차로, 감속차로, 나들목 표지판 2km·1km·500m
    const { net, r } = get('hw-exit');
    assert(net.lanes['m:f3'] && !net.lanes['m:f4']);
    assert(r.lanes.some(id => net.lanes[id].kind === 'decel'));
    const ov = net.signs.filter(s => s.kind === 'overhead' && s.text === '서울 나들목').map(s => s.dist).sort((a, b) => a - b);
    assert.deepStrictEqual(ov, [500, 1000, 2000]);
    assert.strictEqual(N.maneuvers(net, r)[0].name, '서울나들목');
  }
  { // hw-jc: 분기 앞 300m 실선, 유도선 두 색, 분기점 이름
    const { net, r } = get('hw-jc'), L = R.laneLength(net.lanes['m:f2']);
    assert(!R.canChange(net, 'm:f2', 'm:f3', L - 100) && R.canChange(net, 'm:f2', 'm:f3', L - 400));
    const types = new Set(net.lines.map(l => l.type));
    assert(types.has('guide-pink') && types.has('guide-green'));
    assert(r.lanes.includes('jc:branch:f1'));
    const jc = N.maneuvers(net, r).find(x => x.kind === 'jc-right');
    assert(jc && jc.name === '대전분기점' && jc.dir === '대전');
  }
  { // hw-toll: 하이패스 2 + 일반 4 부스
    const { net } = get('hw-toll'), booths = Object.values(net.lanes).filter(l => l.kind === 'toll');
    assert.strictEqual(booths.length, 6);
    assert.strictEqual(booths.filter(l => l.toll === 'hipass').length, 2);
    assert.strictEqual(booths.filter(l => l.toll === 'normal').length, 4);
    assert.strictEqual(typeof M.byId('hw-toll').hipass, 'boolean');
  }
  { // hw-pass: slow 스크립트(80km/h), 3km 이상 직선 2차로
    const { m, net } = get('hw-pass'), sl = m.scripts.filter(x => x.action === 'slow');
    assert(sl.length >= 2 && sl.every(x => Math.abs(x.v - 80 / 3.6) < 1e-9 && net.lanes[x.spawn.laneId]));
    assert(R.laneLength(net.lanes['m:f2']) >= 3000 && !net.lanes['m:f3']);
  }
  { // hw-jam: jam 스크립트·jamAt 1.5km, 안전거리 노면표시
    const { m, net } = get('hw-jam'), j = m.scripts.find(x => x.action === 'jam');
    assert(j && m.jamAt && j.at.laneId === m.jamAt.laneId && j.at.s === m.jamAt.s && m.jamAt.s === 1500);
    assert.deepStrictEqual(net.marks.filter(k => k.kind === 'gap-check').map(k => k.label), ['0m', '50m', '100m']);
  }
  { // hw-rest: 경로가 감속차로 → 진입로 → 주차 구역 → 가속차로 → 본선
    const { net, r } = get('hw-rest'), kinds = r.lanes.map(id => net.lanes[id].kind);
    for (const k of ['decel', 'ramp', 'rest', 'accel']) assert(kinds.includes(k), k);
    assert(kinds.indexOf('rest') < kinds.indexOf('accel'));
    assert.strictEqual(r.lanes[r.lanes.length - 1], 'm:f2');
    assert(net.lanes['ra:entry'].limit === 30 && net.lanes['ra:lot'].limit === 30);
  }
});

// 봇: 실제 루프로 7개 미션을 감점 0으로 통과(톨게이트는 단말기 있음·없음 둘 다)
const runs = MH.list.flatMap(m => m.id === 'hw-toll' ? [m, Object.assign({}, m, { hipass: !m.hipass })] : [m]);
for (const m of runs) test(`봇: ${m.id}${m.id === 'hw-toll' ? (m.hipass ? ' (하이패스)' : ' (일반)') : ''} 감점 0 통과`, () => {
  const r = BOT.drive(m, { maxT: 400 });
  assert(r.passed, `${m.id}: ${r.failReason || '시간 초과'} t=${r.t.toFixed(1)} ${r.d.player.laneId}@${r.d.player.s.toFixed(0)}`);
  assert.deepStrictEqual(r.penalties.map(p => p.code + '@' + p.t.toFixed(1)), [], m.id);
  assert(r.time < 400);
  if (m.id === 'hw-toll') assert(Object.keys(r.d.score.hs.tolls).some(id => r.d.net.lanes[id].toll === (m.hipass ? 'hipass' : 'normal')), '단말기에 맞는 부스로 통과');
});
// 봇: 새 시내 미션 3개를 감점 0으로 통과. 어린이보호구역은 보행자가 다 건널 때까지 횡단보도 앞에 완전히 선다
for (const id of ['city-uturn', 'city-school', 'city-night']) test(`봇: ${id} 감점 0 통과`, () => {
  const DS = require('../drive-score.js'), upd = DS.update, m = M.byId(id);
  let waited = false, turned = false;
  DS.update = (ds, f) => {
    const ln = ds.net.lanes[f.car.laneId];
    if (f.peds.length && Math.abs(f.car.v) < 0.3 / 3.6 && (ds.cwByLane[f.car.laneId] || []).length) waited = true;
    if (ln && ln.turn === 'uturn') turned = true;
    return upd(ds, f);
  };
  let r;
  try { r = BOT.drive(m, { maxT: 300 }); } finally { DS.update = upd; }
  assert(r.passed, `${id}: ${r.failReason || '시간 초과'} t=${r.t.toFixed(1)} ${r.d.player.laneId}@${r.d.player.s.toFixed(0)}`);
  assert.deepStrictEqual(r.penalties.map(p => p.code + '@' + p.t.toFixed(1) + ' ' + p.text), [], id);
  if (id === 'city-school') assert(waited, '보행자 앞에서 정지');
  if (id === 'city-uturn') assert(turned, '유턴 연결 차로를 지남');
});
// 봇: C2 미션 3개 감점 0. 빗길은 앞차 급제동이 실제로 일어나고, 차로 감소는 합류 차로에 들어가기 전에 옮긴다
for (const id of ['city-rain', 'hw-rain', 'city-merge']) test(`봇: ${id} 감점 0 통과`, () => {
  const DS = require('../drive-score.js'), upd = DS.update, m = M.byId(id);
  let onMerge = false, wasLeft = false;
  const feedsMerge = (net, id) => net.lanes[id].next.some(n => net.lanes[n].kind === 'merge'); // 차로 감소로 끝나는 바깥 차로
  DS.update = (ds, f) => {
    const ln = ds.net.lanes[f.car.laneId];
    if (ln && ln.kind === 'merge') onMerge = true;
    if (ln && ln.right && !feedsMerge(ds.net, ln.id) && feedsMerge(ds.net, ln.right)) wasLeft = true; // 바깥 차로 바로 왼쪽 차로로 옮김
    return upd(ds, f);
  };
  let r;
  try { r = BOT.drive(m, { maxT: 400 }); } finally { DS.update = upd; }
  const sim = r.d.sim;
  assert(r.passed, `${id}: ${r.failReason || '시간 초과'} t=${r.t.toFixed(1)} ${r.d.player.laneId}@${r.d.player.s.toFixed(0)}`);
  assert.deepStrictEqual(r.penalties.map(p => p.code + '@' + p.t.toFixed(1) + ' ' + p.text), [], id);
  if (m.weather === 'rain') { assert.strictEqual(sim.scripts[0].state, 'done', '급제동 발동'); assert.strictEqual(r.d.car.grip, 0.7); }
  if (id === 'city-merge') { assert(!onMerge, '합류 차로에 들어감'); assert(wasLeft, '왼쪽 차로로 옮김'); }
});
test('맑은 날 미션은 car.grip을 건드리지 않는다(빗길만 0.7)', () => {
  const D = require('../drive.js'), C = require('../car.js');
  for (const m of M.list) {
    const d = D.create(m);
    if (m.weather === 'rain') assert.strictEqual(d.car.grip, C.WET_GRIP, m.id);
    else assert(d.car.grip === undefined || d.car.grip === 1, `${m.id} grip ${d.car.grip}`);
  }
});
test('city-merge: 합류 차로로 들어가도 경로 이탈(route) 감점·재탐색 음성 없음', () => {
  const D = require('../drive.js'), C = require('../car.js'), m = M.byId('city-merge'), d = D.create(m);
  const ml = Object.values(d.net.lanes).find(l => l.kind === 'merge'), outer = Object.keys(d.net.lanes).find(id => d.net.lanes[id].next.includes(ml.id));
  const L = R.laneLength(d.net.lanes[outer]), ev = [];
  for (const [id, s] of [[outer, L - 40], [outer, L - 20], [outer, L - 1], [ml.id, 3], [ml.id, 20], [ml.id, 40], [ml.id, 60]]) {
    const p = R.pointAt(d.net.lanes[id], s);
    Object.assign(d.car, C.poseFromCenter(p.x, p.y, p.a, d.car.spec)); d.car.v = 8; d.car.gear = 'D';
    ev.push(...D.step(d, { steerRate: 0, throttle: 0, brake: 0 }, 1 / 30));
    assert.strictEqual(d.player.laneId, id);
  }
  assert(!ev.some(e => e.code === 'route'), JSON.stringify(ev));
  assert(!d.speech.includes(N.REROUTE_SAY));
  assert.strictEqual(d.score.failReason, null);
});
test('봇: 시험 코스 합격, B코스 J2는 적색에 일시정지 후 우회전', () => {
  const DS = require('../drive-score.js'), upd = DS.update;
  for (const m of ME.list) {
    const crossings = [];
    DS.update = (ds, f) => { const c0 = ds.cross, out = upd(ds, f); if (ds.cross && ds.cross !== c0) crossings.push(ds.cross); return out; };
    let r;
    try { r = BOT.drive(m, { maxT: 400 }); } finally { DS.update = upd; }
    const ex = E.result(r.d.exam);
    const why = `${m.id}: ${JSON.stringify(ex.items.map(i => `${i.t.toFixed(1)} ${i.pts} ${i.text}`))} ${r.failReason || ''} end=${ex.end} t=${r.t.toFixed(1)}`;
    assert(ex.passed === true, why);
    assert(ex.score >= 90, why);
    assert.strictEqual(ex.end, null, why);
    if (m.id === 'exam-b') { // 북행 n1에 AI 차가 없어 플레이어가 적색에 정지선까지 와서 보행자를 기다린다
      const j2 = crossings.find(c => c.signal === 'J2:sig');
      assert(j2, 'J2 판정 없음');
      assert.strictEqual(j2.state, 'R', 'J2는 적색 우회전: ' + JSON.stringify(j2));
      assert(j2.minV < 0.3 / 3.6, '완전 정지 후 우회전: ' + JSON.stringify(j2));
      assert(!r.penalties.some(p => p.code === 'stop'), '일시정지·보행자 위반 없음 ' + why);
    }
  }
});
for (const [name, fn] of tests) {
  try { fn(); console.log('ok  ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n  ' + e.message); }
}
if (fail) { console.log(fail + ' failed'); process.exit(1); }
console.log('all ' + tests.length + ' passed');
