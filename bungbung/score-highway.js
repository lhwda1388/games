// 붕붕이 — 고속도로 채점: 최저속도·갓길·1차로(지정차로)·합류 속도·정체 비상등·톨게이트, 실패(가속차로 끝·단말기 없이 하이패스 차로·출구 놓침).
// drive-score.update가 미션 highway일 때 부른다. 문구는 drive-score의 TEXT·FAIL에 있다(pen(code)·failWith(key)).
// f = drive-score 프레임 + hazard(비상등 bool), leaderGap({ gap, v }|null: 앞차 간격 m·속도 m/s), toll(부스|null). 새 필드는 없어도 된다.
const PP_HSCORE = (function ppHScore() {
  const R = typeof PP_ROADS !== 'undefined' ? PP_ROADS : require('./roads.js');
  const PL = 4.39; // 셀토스 길이
  const MIN_T = 5, PASS_T = 15, PASS_BACK = 20, MERGE_MIN = 60, HAZ_T = 5, HIPASS_MAX = 30, TOLL_STOP = 0.5;
  const JAM_ZONE = 300; // ponytail: 정체 지점(jamAt) 이 거리 앞부터 정체 구간 — 내비 "전방 정체 구간" 마지막 안내(300m)와 맞춤
  const JAM_PAST = 50; // 정체 지점을 이만큼 지나면 정체 구간 끝
  const SLOW_LEAD = 150; // ponytail: 앞차가 이 거리 안에서 최저속도보다 느리면 최저속도 감점 제외(밀려서 느린 것)
  const TOLL_APPROACH = 600; // ponytail: 톨게이트로 이어지는 차로 끝 이 거리 안은 1차로·최저속도 감점 제외 — 내비가 500m에서 하이패스 1·2차로를 안내하고, 부스 앞 감속이 여기서 시작
  const TOLL_ZONE = 6, HIPASS_ZONE = 20, STOP_V = 0.3 / 3.6; // 정지선 앞 정지 인정 구간(m), 하이패스 속도 확인 구간(부스 ±m), 정지 판정 속도

  const isMain = ln => !!ln && ln.kind === 'normal' && ln.minSpeed != null;
  // b가 a와 같은 도로·같은 방향 차로인가(옆 차로를 따라 걸어 본다)
  const sameDir = (net, a, b) => {
    if (a === b) return true;
    for (const side of ['left', 'right']) for (let x = net.lanes[a][side]; x; x = net.lanes[x][side]) if (x === b) return true;
    return false;
  };

  function create(mission, net) {
    return { mission, net, prev: null, armed: false, minT: 0, minHit: false, onSh: false,
      l1T: null, l1Hit: false, passT: null, rel: {}, jamT: null, hazDone: false, tolls: {} };
  }

  function update(hs, f, pen, failWith) {
    const net = hs.net, car = f.car, lane = net.lanes[car.laneId], v = car.v, kmh = v * 3.6, t = f.t, prev = hs.prev;
    if (!lane) return;
    const front = car.s + PL / 2;
    hs.prev = { laneId: car.laneId, front };

    if (f.rerouted) { failWith('missedExit'); return; }

    // 합류: 가속차로 → 본선(accel.left), 가속차로 끝 도달은 실패
    if (prev && prev.laneId !== car.laneId) {
      const P = net.lanes[prev.laneId];
      if (P && P.kind === 'accel' && P.left === car.laneId && kmh < MERGE_MIN) pen('mergeSlow');
    }
    if (lane.kind === 'accel' && front >= R.laneLength(lane) - 1) { failWith('accelEnd'); return; }

    // 정체 구간: jamAt 앞 JAM_ZONE ~ 뒤 JAM_PAST
    const J = hs.mission.jamAt;
    let inJam = false;
    if (J && net.lanes[J.laneId] && sameDir(net, J.laneId, car.laneId)) {
      const d = R.mapS(net, car.laneId, J.laneId, front);
      inJam = d >= J.s - JAM_ZONE && d <= J.s + JAM_PAST;
      if (inJam && hs.jamT === null) hs.jamT = t;
    }
    if (hs.jamT !== null && !hs.hazDone) {
      if (f.hazard) hs.hazDone = true;
      else if (t - hs.jamT > HAZ_T + 1e-6) { hs.hazDone = true; pen('hazard'); }
    }

    // 톨게이트 광장 바로 앞(부스 차로 고르기·감속): 1차로·최저속도 감점 제외
    const tollNear = lane.next.some(n => net.lanes[n].kind === 'toll') && R.laneLength(lane) - car.s <= TOLL_APPROACH;
    // 최저속도: 본선에서 한 번 최저속도에 오른 뒤(출발·톨게이트 뒤 가속 중 제외), 정체 구간·느린 앞차 제외, MIN_T초 지속
    if (lane.minSpeed == null) hs.armed = false;
    else if (isMain(lane) && kmh >= lane.minSpeed) hs.armed = true;
    const lg = f.leaderGap, slowLead = lg && lg.gap < SLOW_LEAD && lg.v * 3.6 < lane.minSpeed;
    if (isMain(lane) && hs.armed && kmh < lane.minSpeed && !inJam && !slowLead && !tollNear) {
      hs.minT += f.dt;
      if (hs.minT >= MIN_T - 1e-6 && !hs.minHit) { hs.minHit = true; pen('minSpeed'); }
    } else { hs.minT = 0; hs.minHit = false; }

    // 갓길: 진입할 때마다 한 번. 램프·분기로 갓길이 끊긴 구간(gaps, 가속·감속차로와 겹침)은 제외
    const onSh = lane.kind === 'shoulder' && !(lane.gaps || []).some(g => car.s >= g.s0 && car.s <= g.s1);
    if (onSh && !hs.onSh) pen('shoulder');
    hs.onSh = onSh;

    // 1차로: 추월(오른쪽 차로의 앞차가 뒤로 감) 없이 PASS_T초, 또는 마지막 추월 뒤 PASS_BACK초 넘게 머물면 감점
    const lane1 = isMain(lane) && !lane.left && isMain(net.lanes[lane.right]) && !tollNear;
    if (isMain(lane)) for (const o of f.others || []) {
      const p = R.projectLane(lane, o.x, o.y), rel = p.s - car.s;
      if (p.dist > 3 * lane.width || Math.abs(R.wrap(o.th - p.heading)) > Math.PI / 4 || Math.abs(rel) > 200) { delete hs.rel[o.id]; continue; }
      const was = hs.rel[o.id];
      if (lane1 && p.offset < -lane.width / 2 && was > 0 && rel <= 0) hs.passT = t;
      hs.rel[o.id] = rel;
    }
    if (lane1) {
      if (hs.l1T === null) hs.l1T = t;
      const passed = hs.passT !== null && hs.passT >= hs.l1T, ref = passed ? hs.passT : hs.l1T;
      if (t - ref >= (passed ? PASS_BACK : PASS_T) - 1e-6 && !hs.l1Hit) { hs.l1Hit = true; pen('passLane'); }
    } else { hs.l1T = null; hs.l1Hit = false; }

    // 톨게이트: 단말기 없이 하이패스 차로로 정지선 통과 = 실패(하이패스 차는 일반 차로도 됨), 일반은 정지선 앞 TOLL_STOP초 정지, 하이패스는 부스 ±HIPASS_ZONE에서 30km/h 이하
    const booth = f.toll && f.toll.laneId === car.laneId ? f.toll : lane.kind === 'toll' ? { laneId: car.laneId, toll: lane.toll, stopS: lane.stopS } : null;
    if (booth && booth.stopS != null) {
      const st = hs.tolls[car.laneId] = hs.tolls[car.laneId] || { stopT: 0, last: null, done: false, fast: false };
      const line = booth.stopS; // 정지선(차로 s)과 앞범퍼를 비교
      if (front >= line - TOLL_ZONE && front <= line + 0.5 && Math.abs(v) < STOP_V) st.stopT += f.dt;
      if (booth.toll === 'hipass' && Math.abs(front - line) <= HIPASS_ZONE && kmh > HIPASS_MAX && !st.fast) { st.fast = true; pen('hipassSpeed'); }
      if (!st.done && st.last !== null && st.last < line && front >= line) {
        st.done = true;
        if (booth.toll === 'hipass' && !hs.mission.hipass) { failWith('tollLane'); return; } // 하이패스 차는 일반 차로(카드)도 된다
        if (booth.toll === 'normal' && st.stopT < TOLL_STOP - 1e-6) pen('tollStop');
      }
      st.last = front;
    }
  }

  return { create, update };
})();
if (typeof module !== 'undefined') module.exports = PP_HSCORE;
