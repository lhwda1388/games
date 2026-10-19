// 붕붕이 — 고속도로 저작 도우미: 본선(갓길·중앙분리대·가드레일), 진입·진출 램프, 분기(JC), 톨게이트, 휴게소.
// 만든 함수는 PP_ROADS에 붙는다(브라우저는 roads-build.js 다음에 이 파일을 로드).
// 고속도로 도로 객체는 한 방향(lanesBack 0). 위치 t = 도로 중심선(왼쪽 가장자리) 거리, s = 차로 거리.
const PP_RHW = (function ppRHw() {
  const R = typeof PP_ROADS !== 'undefined' ? PP_ROADS : require('./roads.js');
  const B = typeof PP_RBUILD !== 'undefined' ? PP_RBUILD : require('./roads-build.js');
  const { addLane, laneLength, pointAt, connectorPts } = R;
  const STEP = 2; // 곡선 샘플 간격(m)
  const RAMP_OFF = 30; // ponytail: 램프 끝이 가속·감속차로에서 옆으로 떨어진 거리(m). 램프가 얼마나 휘어 들어오는지.
  const ACC_IN = 30, ACC_OUT = 20, DEC_SOLID = 30; // 가속차로 합류 금지(시작·끝), 감속차로 끝 실선
  const GORE = 120; // ponytail: 분기 뒤 두 갈래가 갓길 폭 이상 벌어질 때까지(m) — 이 구간 가드레일·분리대를 뺀다
  const BR_R = 800; // 분기 갈래 곡선 반지름(m)
  const TOLL_OUT = 200, TOLL_LIMIT = 30; // 톨게이트 뒤 본선 길이, 톨게이트 차로 제한
  const ENTRY = 80, LOT = 120, LOT_W = 30, REST_LIMIT = 30; // 휴게소 진입로·통과 구역 길이, 주차 구역 폭, 제한
  const ON = { rampLength: 200, accelLength: 250, limit: 80 }, OFF = { decelLength: 250, rampLength: 250, limit: 60 };

  const sample = (M, t0, t1, off) => {
    const n = M.curved ? Math.max(1, Math.ceil((t1 - t0) / STEP)) : 1, pts = [];
    for (let i = 0; i <= n; i++) { const p = M.at(t0 + (t1 - t0) * i / n); pts.push([p.x - Math.sin(p.a) * off, p.y + Math.cos(p.a) * off]); }
    return pts;
  };
  const pt = (M, t, off) => sample(M, t, t, off)[0];
  const shift = (pts, d) => pts.map((p, i) => {
    const q = pts[Math.max(0, i - 1)], r = pts[Math.min(pts.length - 1, i + 1)], a = Math.atan2(r[1] - q[1], r[0] - q[0]);
    return [p[0] - Math.sin(a) * d, p[1] + Math.cos(a) * d];
  });
  const band = (pts, w) => shift(pts, w / 2).concat(shift(pts, -w / 2).reverse());
  const rampDx = len => Math.sqrt(Math.max(0, len * len - RAMP_OFF * RAMP_OFF));
  const xy = p => ({ x: p[0], y: p[1] });

  // 본선 가장자리 요소(오른쪽 실선·가드레일·중앙분리대·갓길 면). hw·part·t0·t1 태그로 램프·분기 구간을 잘라낼 수 있다.
  function part(net, M, name, t0, t1) {
    const nf = M.fwd.length, w = M.width, tag = { hw: M.id, part: name, t0, t1 };
    if (name === 'edge') net.lines.push(Object.assign({ type: 'white-solid', pts: sample(M, t0, t1, -nf * w) }, tag));
    if (name === 'rail') net.walls.push(Object.assign({ kind: 'rail', pts: sample(M, t0, t1, -(nf * w + M.shoulder)) }, tag));
    if (name === 'median') net.walls.push(Object.assign({ kind: 'median', pts: sample(M, t0, t1, 0) }, tag));
    if (name === 'shoulder') net.areas.push(Object.assign({ kind: 'road', id: M.shoulderId,
      pts: band(sample(M, t0, t1, -(nf * w + M.shoulder / 2)), M.shoulder) }, tag));
  }
  function cut(net, M, t0, t1, names) {
    t0 = Math.max(0, t0); t1 = Math.min(M.length, t1);
    if (t1 <= t0) return;
    for (const list of [net.lines, net.walls, net.areas]) for (let i = list.length - 1; i >= 0; i--) {
      const it = list[i];
      if (it.hw !== M.id || !names.includes(it.part) || it.t1 <= t0 || it.t0 >= t1) continue;
      list.splice(i, 1);
      if (it.t0 < t0) part(net, M, it.part, it.t0, t0);
      if (it.t1 > t1) part(net, M, it.part, t1, it.t1);
    }
    if (names.includes('shoulder')) {
      const sh = net.lanes[M.shoulderId], k = laneLength(sh) / M.length;
      (sh.gaps = sh.gaps || []).push({ s0: t0 * k, s1: t1 * k });
    }
  }
  const line = (net, type, pts) => net.lines.push({ type, pts });

  // 편도 n차로 + 갓길(가장 오른쪽 차로, 진입 금지) + 중앙분리대(왼쪽) + 가드레일(갓길 바깥)
  function highway(net, o) {
    o = Object.assign({ width: 3.6, limit: 100, minSpeed: 50, shoulder: 3.0 }, o);
    const ro = { id: o.id, x: o.x, y: o.y, a: o.a, length: o.length, lanesFwd: o.lanes, lanesBack: 0, width: o.width, limit: o.limit };
    const l0 = net.lines.length;
    const rd = o.curved ? B.curvedRoad(net, Object.assign(ro, o.curved)) : B.straightRoad(net, ro);
    net.lines.splice(l0, 1); // road()가 맨 먼저 그린 오른쪽 가장자리 실선 → 아래 part('edge')로 태그 붙여 다시 그린다
    const nf = o.lanes, w = o.width, sh = o.shoulder, shId = `${o.id}:sh`, last = rd.fwd[nf - 1];
    Object.assign(rd, { shoulderId: shId, shoulder: sh, limit: o.limit, minSpeed: o.minSpeed, curved: !!o.curved });
    for (const id of rd.fwd) net.lanes[id].minSpeed = o.minSpeed;
    addLane(net, { id: shId, pts: sample(rd, 0, rd.length, -(nf * w + sh / 2)), width: sh, next: [], left: last, right: null,
      limit: o.limit, minSpeed: o.minSpeed, kind: 'shoulder', road: o.id });
    net.lanes[last].right = shId;
    for (const [a, b] of [[last, shId], [shId, last]]) net.changes.push({ from: a, to: b, s0: 0, s1: laneLength(net.lanes[a]), allowed: false });
    for (const name of ['edge', 'rail', 'median', 'shoulder']) part(net, rd, name, 0, rd.length);
    const a30 = rd.at(30).a;
    [['limit', o.limit, 1], ['min-speed', o.minSpeed, 2.2]].forEach(([kind, limit, d]) => {
      const p = pt(rd, 30, -(nf * w + sh + d));
      net.signs.push({ kind, x: p[0], y: p[1], a: a30, limit, text: String(limit) });
    });
    if (o.gapCheck != null) ['0m', '50m', '100m'].forEach((label, i) => {
      const t = o.gapCheck + 50 * i, p = pt(rd, t, -nf * w / 2);
      net.marks.push({ kind: 'gap-check', label, x: p[0], y: p[1], a: rd.at(t).a, width: nf * w });
    });
    return rd;
  }

  // 본선 끝 차로 오른쪽에 붙는 평행 차로(가속·감속). along으로 본선 차로 s와 대응.
  function sideLane(net, M, id, kind, t0, t1, next) {
    const nf = M.fwd.length, w = M.width, ML = M.fwd[nf - 1], k = laneLength(net.lanes[ML]) / M.length;
    const ln = addLane(net, { id, pts: sample(M, t0, t1, -(nf * w + w / 2)), width: w, next, left: ML, right: null,
      limit: M.limit, kind, road: id.split(':')[0], along: { lane: ML, s0: t0 * k } });
    line(net, 'white-solid', sample(M, t0, t1, -(nf + 1) * w));
    net.walls.push({ kind: 'rail', pts: sample(M, t0, t1, -((nf + 1) * w + 0.5)) });
    net.areas.push({ kind: 'road', id, pts: band(ln.pts, w) });
    return ln;
  }
  function rampLane(net, id, pts, w, next, limit, road) {
    const ln = addLane(net, { id, pts, width: w, next, left: null, right: null, limit, kind: 'ramp', road });
    line(net, 'white-solid', shift(pts, w / 2)); line(net, 'white-solid', shift(pts, -w / 2));
    net.areas.push({ kind: 'road', id, pts: band(pts, w) });
    return ln;
  }

  // 진입: 램프 → 가속차로(본선 끝 차로 오른쪽, 시작 30m ~ 끝 20m 전에서만 합류) → 끝 막힘
  function onRamp(net, o) {
    o = Object.assign({}, ON, o);
    const M = o.main, nf = M.fwd.length, w = M.width, ML = M.fwd[nf - 1], at = o.at, L = o.accelLength, dx = rampDx(o.rampLength);
    const accelId = `${o.id}:accel`, rampId = `${o.id}:ramp`;
    const acc = sideLane(net, M, accelId, 'accel', at, at + L, []), La = laneLength(acc);
    const p1 = pointAt(acc, 0), t0 = at - dx;
    rampLane(net, rampId, connectorPts(xy(pt(M, t0, -(nf * w + w / 2) - RAMP_OFF)), M.at(t0).a, p1, p1.a), w, [accelId], o.limit, o.id);
    for (const [s0, s1, allowed] of [[0, ACC_IN, false], [ACC_IN, La - ACC_OUT, true], [La - ACC_OUT, La, false]])
      net.changes.push({ from: accelId, to: ML, s0, s1, allowed });
    cut(net, M, t0, at + L, ['rail', 'shoulder']);
    cut(net, M, at, at + L, ['edge']);
    line(net, 'white-solid', sample(M, at, at + ACC_IN, -nf * w));
    line(net, 'white-dashed', sample(M, at + ACC_IN, at + L - ACC_OUT, -nf * w));
    line(net, 'white-solid', sample(M, at + L - ACC_OUT, at + L, -nf * w));
    return { rampId, accelId };
  }

  // 진출: 본선 끝 차로 → 감속차로(끝 30m 실선) → 램프. 안내판 2km·1km·500m(본선 시작 전이면 생략).
  function offRamp(net, o) {
    o = Object.assign({}, OFF, o);
    const M = o.main, nf = M.fwd.length, w = M.width, ML = M.fwd[nf - 1], at = o.at, D = o.decelLength, dx = rampDx(o.rampLength);
    const decelId = `${o.id}:decel`, rampId = `${o.id}:ramp`, k = laneLength(net.lanes[ML]) / M.length;
    const dec = sideLane(net, M, decelId, 'decel', at, at + D, [rampId]);
    const p0 = pointAt(dec, laneLength(dec)), t1 = at + D + dx;
    rampLane(net, rampId, connectorPts(p0, p0.a, xy(pt(M, t1, -(nf * w + w / 2) - RAMP_OFF)), M.at(t1).a), w, [], o.limit, o.id);
    net.lanes[ML].right = decelId;
    net.changes.push({ from: ML, to: decelId, s0: at * k, s1: (at + D - DEC_SOLID) * k, allowed: true },
      { from: ML, to: decelId, s0: (at + D - DEC_SOLID) * k, s1: (at + D) * k, allowed: false });
    cut(net, M, at, t1, ['rail', 'shoulder']);
    cut(net, M, at, at + D, ['edge']);
    line(net, 'white-dashed', sample(M, at, at + D - DEC_SOLID, -nf * w));
    line(net, 'white-solid', sample(M, at + D - DEC_SOLID, at + D, -nf * w));
    for (const d of [2000, 1000, 500]) {
      const t = at - d;
      if (t < 0) continue;
      const p = pt(M, t, -nf * w / 2);
      net.signs.push({ kind: 'overhead', x: p[0], y: p[1], a: M.at(t).a, text: o.name + ' 나들목', dir: 'right', dist: d });
    }
    return { decelId, rampId };
  }

  // 분기: from 끝에서 왼쪽 keepLanes는 직진, 오른쪽 branchLanes는 오른쪽으로 휘어 나감. length = 두 갈래 길이.
  function split(net, o) {
    o = Object.assign({ solid: 300, guide: { keep: 'green', branch: 'pink' }, length: 600 }, o);
    const F = o.from, kL = o.keepLanes, bL = o.branchLanes, w = F.width, L = F.length, e = F.end;
    if (kL + bL !== F.fwd.length) throw new Error(`${o.id}: 차로 ${kL}+${bL} ≠ ${F.fwd.length}`);
    const base = { width: w, limit: F.limit, minSpeed: F.minSpeed, shoulder: F.shoulder, length: o.length };
    const n0 = net.signs.length;
    const keep = highway(net, Object.assign({ id: `${o.id}:keep`, x: e.x, y: e.y, a: e.a, lanes: kL }, base));
    net.signs.splice(n0); // 이어지는 본선의 제한 표지판은 분기 갈래 위에 서므로 뺀다
    const branch = highway(net, Object.assign({ id: `${o.id}:branch`, x: e.x + Math.sin(e.a) * kL * w, y: e.y - Math.cos(e.a) * kL * w,
      a: e.a, lanes: bL, curved: { radius: BR_R, angle: -o.length / BR_R } }, base));
    B.connect(net, F.fwd.slice(0, kL), keep.fwd);
    B.connect(net, F.fwd.slice(kL), branch.fwd);
    B.connect(net, F.shoulderId, branch.shoulderId);
    cut(net, keep, 0, GORE, ['rail', 'shoulder']);
    cut(net, branch, 0, GORE, ['median']);
    // 갈래 경계: 분기 전 solid m는 차선 변경 금지
    const a = F.fwd[kL - 1], b = F.fwd[kL], off = -kL * w;
    for (const [x, y] of [[a, b], [b, a]]) {
      const Lx = laneLength(net.lanes[x]), cs = (L - o.solid) * Lx / L;
      for (const c of net.changes) if (c.from === x && c.to === y) { if (c.s0 >= cs) c.allowed = false; else if (c.s1 > cs) c.s1 = cs; }
      net.changes.push({ from: x, to: y, s0: cs, s1: Lx, allowed: false });
    }
    const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.01, q0 = pt(F, 0, off), q1 = pt(F, L, off);
    const dashed = net.lines.find(l => l.type === 'white-dashed' && near(l.pts[0], q0) && near(l.pts[l.pts.length - 1], q1));
    if (dashed) dashed.pts = sample(F, 0, L - o.solid, off);
    line(net, 'white-solid', sample(F, L - o.solid, L, off));
    // 노면 색깔 유도선: 분기 1km 전부터 갈래 첫 100m까지
    const g0 = Math.max(0, L - 1000);
    line(net, 'guide-' + o.guide.branch, sample(F, g0, L, -(kL + 0.5) * w));
    line(net, 'guide-' + o.guide.branch, sample(branch, 0, 100, -0.5 * w));
    line(net, 'guide-' + o.guide.keep, sample(F, g0, L, -(kL - 0.5) * w));
    line(net, 'guide-' + o.guide.keep, sample(keep, 0, 100, -(kL - 0.5) * w));
    const ga = F.at(g0).a;
    [[o.names.keep, 'straight', -kL * w / 2], [o.names.branch, 'right', -(kL + bL / 2) * w]].forEach(([text, dir, so]) => {
      const p = pt(F, g0, so);
      const sg = { kind: 'overhead', x: p[0], y: p[1], a: ga, text, dir, dist: L - g0 };
      if (o.names.jc) sg.jc = o.names.jc; // 분기점 이름(내비 "○○분기점에서 …")
      net.signs.push(sg);
    });
    return { keep, branch };
  }

  // 톨게이트: from 끝에서 차로 n → lanes로 펼침 → 부스(하이패스는 파란 경계, 일반은 정지선) → 다시 n(out 본선)
  function tollPlaza(net, o) {
    o = Object.assign({ lanes: 6, hipass: [0, 1], length: 160 }, o);
    const F = o.from, n = F.fwd.length, w = F.width, e = F.end, a = e.a, c = Math.cos(a), s = Math.sin(a), N = o.lanes;
    const P = (u, off) => ({ x: e.x + c * u - s * off, y: e.y + s * u + c * off });
    const op = P(o.length, 0);
    const out = highway(net, { id: `${o.id}:out`, x: op.x, y: op.y, a, length: TOLL_OUT, lanes: n, width: w,
      limit: F.limit, minSpeed: F.minSpeed, shoulder: F.shoulder });
    const fan = o.length * 0.35, bl = o.length * 0.3, booths = [], blue = new Set();
    const ids = Array.from({ length: N }, (_, j) => `${o.id}:t${j + 1}`);
    const offOf = j => -n * w / 2 + ((N - 1) / 2 - j) * w, pick = j => N > 1 ? Math.round(j * (n - 1) / (N - 1)) : 0;
    ids.forEach((id, j) => {
      const ie = F.fwd[pick(j)], io = out.fwd[pick(j)], off = offOf(j);
      const p0 = pointAt(net.lanes[ie], laneLength(net.lanes[ie])), p3 = pointAt(net.lanes[io], 0);
      const c1 = connectorPts(p0, a, P(fan, off), a), c2 = connectorPts(P(fan + bl, off), a, p3, a);
      const toll = o.hipass.includes(j) ? 'hipass' : 'normal';
      const ln = addLane(net, { id, pts: c1.concat(c2), width: w, next: [io], left: ids[j - 1] || null, right: ids[j + 1] || null,
        limit: TOLL_LIMIT, kind: 'toll', toll, road: o.id });
      net.lanes[ie].next.push(id);
      const stopS = ln.cum[c1.length - 1] + bl / 2;
      ln.stopS = stopS; // 교통 AI가 미션 없이도 부스 위치를 안다
      if (toll === 'normal') {
        const sp = pointAt(ln, stopS), hx = -Math.sin(sp.a) * w / 2, hy = Math.cos(sp.a) * w / 2;
        line(net, 'stop', [[sp.x + hx, sp.y + hy], [sp.x - hx, sp.y - hy]]);
      } else for (const eo of [off + w / 2, off - w / 2]) {
        const key = eo.toFixed(3);
        if (blue.has(key)) continue;
        blue.add(key);
        const q0 = P(fan, eo), q1 = P(fan + bl, eo);
        line(net, 'blue-solid', [[q0.x, q0.y], [q1.x, q1.y]]);
      }
      booths.push({ laneId: id, toll, stopS });
    });
    const lo = offOf(0) + w / 2, ro = offOf(N - 1) - w / 2;
    net.areas.push({ kind: 'road', id: o.id, pts: [P(0, 0), P(fan, lo), P(fan + bl, lo), P(o.length, 0),
      P(o.length, -n * w), P(fan + bl, ro), P(fan, ro), P(0, -n * w)].map(p => [p.x, p.y]) });
    return { out, booths };
  }

  // 휴게소: offRamp → 30km/h 진입로 → 직선 통과 구역(옆에 주차 면) → onRamp로 같은 본선 복귀
  function restArea(net, o) {
    const M = o.main, nf = M.fwd.length, w = M.width, offR = -(nf * w + w / 2) - RAMP_OFF;
    const n0 = net.signs.length;
    const off = offRamp(net, { id: `${o.id}:off`, main: M, at: o.at, name: o.name });
    for (const sg of net.signs.slice(n0)) if (sg.kind === 'overhead') sg.text = o.name + ' 휴게소';
    const t0 = o.at + OFF.decelLength + rampDx(OFF.rampLength), t1 = t0 + ENTRY, t2 = t1 + LOT;
    const entryId = `${o.id}:entry`, lotId = `${o.id}:lot`;
    const entry = addLane(net, { id: entryId, pts: sample(M, t0, t1, offR), width: w, next: [], left: null, right: null,
      limit: REST_LIMIT, kind: 'ramp', road: o.id });
    addLane(net, { id: lotId, pts: sample(M, t1, t2, offR), width: w, next: [], left: null, right: null,
      limit: REST_LIMIT, kind: 'rest', road: o.id });
    net.areas.push({ kind: 'road', id: entryId, pts: band(entry.pts, w) });
    net.areas.push({ kind: 'road', id: lotId, pts: sample(M, t1, t2, offR + w / 2).concat(sample(M, t1, t2, offR - w / 2 - LOT_W).reverse()) });
    const on = onRamp(net, { id: `${o.id}:on`, main: M, at: t2 + rampDx(ON.rampLength) });
    B.connect(net, off.rampId, entryId);
    B.connect(net, entryId, lotId);
    B.connect(net, lotId, on.rampId);
    return { entryId, lotIds: [lotId], exitAccelId: on.accelId, off, on };
  }

  const api = { highway, onRamp, offRamp, split, tollPlaza, restArea };
  Object.assign(R, api);
  return api;
})();
if (typeof module !== 'undefined') module.exports = PP_RHW;
