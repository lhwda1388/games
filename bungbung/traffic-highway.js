// 붕붕이 — 고속도로 교통 훅: 가속차로 합류·대기, 본선 양보, 1차로 복귀, 톨게이트(하이패스/일반),
// 스크립트 jam·slow. traffic.js가 고속도로 차로(가속·톨·갓길·최저속도)가 있는 망에서만 부른다.
// K = traffic.js 내부 함수 묶음 { rnd, addCar, changeOk, spanAllowed, startChange, leaderAhead, idmTerm, S0 }.
const PP_THW = (function ppTHw() {
  const R = typeof PP_ROADS !== 'undefined' ? PP_ROADS : require('./roads.js');
  const { laneLength, canChange, mapS } = R;
  const VMAX = 110 / 3.6; // 차 최고 속도
  const HW_GAP = 1.5; // 합류 때 본선 앞뒤 차와의 최소 시간 간격(s)
  const ACC_STOP = 22; // ponytail: 합류 못 한 차가 앞범퍼를 세우는 가속차로 끝까지 거리(m) — 합류 허용 구간(끝 20m 전까지) 안에 서도록
  const ACC_BRAKE = 30; // 대기 감속 시작: 정지 거리 + 이 거리(m) 안에 들어오면
  const WAIT_V = 3, WAIT_B = 4; // 가속차로에서 (거의) 선 차(WAIT_V m/s 아래): 본선 뒤 AI가 WAIT_B m/s²로 줄여 맞출 수 있는 간격이면 합류(뒤차 IDM 기준은 선 차에겐 130m+라 몇 분씩 못 낀다)
  const WAIT_PL = 60, WAIT_CAP_T = 1; // 그 뒤차 뒤 이 거리(m) 안에 플레이어가 있으면 대기 기준을 안 씀 / 뒤차 감속 상한 유지: WAIT_B로 설 시간 + 이 여유(s)
  const YIELD_R = 50, YIELD_P = 0.5, YIELD_SLOW = 0.7, YIELD_T = 4; // 양보: 옆 거리(m), 확률, 감속 비율, 감속 시간(s)
  const KEEP_T = 1, KEEP_GAP = 50; // 1차로 복귀 검사 주기(s), 오른쪽 차로 앞차가 이보다 멀거나 빠르면 복귀
  const HIPASS_P = 0.7; // ponytail: AI 차량 하이패스 단말기 비율 — 실제(약 85%)보다 낮춰 일반 부스 정지도 자주 보이게
  const HIPASS_V = 27 / 3.6; // 톨게이트 차로 속도 상한(30km/h 이하 통과)
  const TOLL_LOOK = 1000, TOLL_WAIT = 2, TOLL_NEAR = 3; // 부스 차로 찾기 시작 거리(m), 일반 정지 시간(s), 정지로 치는 정지선 앞 거리(m)
  const ZIP = 40, DIV = 30; // 톨게이트 모임: 합류점까지 남은 거리 차가 이 안이면 앞차로 / 펼침: 갈래 시작 이 거리 안 차는 앞차로
  const JAM_DEC = 4; // jam 감속(m/s²)
  const RAMP_HEAD = 3; // ponytail: 램프 생성 간격 배수 — 본선 차로와 같은 간격이면 합류 용량을 넘어 램프가 늘 막힌다
  const TOLL_DEC = 1.2; // 톨게이트 앞 감속 목표(m/s²)
  const TOLL_EASE = 0.85; // ponytail: 부스 차로로 못 옮길 때 옆 차로 흐름 대비 목표 속도 — 낮출수록 빨리 끼지만 뒤차가 밀린다

  // 고속도로 망이면 전처리 묶음, 아니면 null(2a 동작 그대로)
  function init(sim) {
    const net = sim.net, L = net.lanes;
    const hw = Object.keys(L).some(id => L[id].minSpeed != null || ['accel', 'toll', 'shoulder'].includes(L[id].kind));
    if (!hw) return null;
    const acc = {}, into = {}, sib = {};
    for (const id in L) {
      const ln = L[id];
      if (ln.kind === 'accel') (acc[ln.left] = acc[ln.left] || []).push(id);
      if (ln.kind === 'toll') { (into[ln.next[0]] = into[ln.next[0]] || []).push(id); sim.vcap[id] = HIPASS_V; }
      const ts = ln.next.filter(n => L[n].kind === 'toll');
      if (ts.length > 1) for (const n of ts) sib[n] = { pred: id, others: ts.filter(x => x !== n) };
    }
    return { acc, into, sib, yields: 0 };
  }

  function initCar(sim, c, rnd) {
    Object.assign(c, { toll: rnd(sim) < HIPASS_P ? 'hipass' : 'normal', tollWait: 0, tollDone: null,
      ySeen: {}, yieldUntil: -1, keepT: KEEP_T, jam: false, hazard: false, vFix: null });
  }

  // 톨게이트 직전 차로에서 갈래 고르기: 내 단말기 종류 부스 중 무작위
  function choose(sim, c, opts, rnd) {
    const ok = opts.filter(x => x.kind === 'toll' && x.toll === c.toll);
    return ok.length ? ok[Math.floor(rnd(sim) * ok.length)].id : null;
  }

  const tollNext = (net, ln) => ln.next.map(id => net.lanes[id]).filter(x => x.kind === 'toll');
  function sideWith(net, ln, toll) {
    for (const side of ['left', 'right'])
      for (let x = ln[side]; x && net.lanes[x].kind === 'normal'; x = net.lanes[x][side])
        if (tollNext(net, net.lanes[x]).some(t => t.toll === toll)) return side;
    return null;
  }
  function want(c, to, side, t) { c.want = to; c.blink = side === 'left' ? -1 : 1; c.blinkT = t; }

  // 본선 차로 ML 이웃 위치(sT)의 앞·뒤 차(플레이어 포함)
  function around(sim, c, ML, sT) {
    let lead = null, foll = null;
    for (const e of sim.idx[ML] || []) { if (e.car === c) continue; if (e.s > sT) { lead = e; break; } foll = e; }
    return { lead, foll };
  }

  // 가속차로: 깜빡이 켜고 본선 끝 차로 앞뒤 시간 간격을 보고 합류
  function merge(sim, c, t, lane, K) {
    const net = sim.net, ML = lane.left, L = laneLength(lane);
    if (c.blink !== -1) { c.blink = -1; c.blinkT = t; }
    if (t - c.blinkT < 1) return;
    if (!canChange(net, lane.id, ML, c.s) || !canChange(net, lane.id, ML, Math.min(c.s + c.v, L))) return;
    const sT = mapS(net, lane.id, ML, c.s), { lead, foll } = around(sim, c, ML, sT);
    if (lead && lead.s - sT - (c.l + lead.l) / 2 < HW_GAP * c.v) return;
    // 플레이어 앞으로, 또 플레이어가 그 뒤차 WAIT_PL m 안 뒤에 있으면 늘 보통 기준(뒤차가 줄이면 플레이어 앞도 갑자기 선다)
    const waiting = c.v < WAIT_V && foll && !foll.car.player && !foll.car.from // 차선 바꾸는 중인 뒤차는 옛 차로 앞차도 보므로 보통 기준
      && !(sim.idx[ML] || []).some(e => e.car.player && e.s < foll.s && foll.s - e.s < WAIT_PL);
    if (foll && sT - foll.s - (c.l + foll.l) / 2 < (waiting ? foll.v * foll.v / (2 * WAIT_B) + K.S0 : HW_GAP * foll.v)) return;
    if (!K.changeOk(sim, c, ML, { skipFollIdm: waiting })) return; // waiting: 뒤차 IDM 검사 대신 위 정지 거리 기준
    K.startChange(sim, c, ML, 1.5 + K.rnd(sim));
    if (waiting) foll.car.capB = { until: t + foll.v / WAIT_B + WAIT_CAP_T, b: WAIT_B, id: c.id }; // 뒤차는 WAIT_B까지만 줄인다(traffic.js accel), WAIT_B로 설 시간 + 여유
  }

  // 본선 끝 차로: 옆 가속차로에 합류 차(플레이어 포함)가 50m 안이면 시드 확률로 왼쪽 이동 또는 감속
  function yieldTo(sim, c, t, lane, K) {
    const net = sim.net;
    if (c.braked > t) return false; // brake 스크립트 중인 차는 양보 감속으로 덮어쓰지 않는다
    for (const A of sim.hw.acc[lane.id] || []) for (const e of sim.idx[A] || []) {
      if (e.car === c || (!e.car.player && e.car.laneId !== A)) continue;
      if (c.ySeen[A] || Math.abs(mapS(net, A, lane.id, e.s) - c.s) > YIELD_R) continue;
      c.ySeen[A] = true; // 가속차로 하나 지날 때 한 번만 판단(대기 줄 차마다 굴리면 본선이 계속 선다)
      if (K.rnd(sim) >= YIELD_P) continue;
      sim.hw.yields++;
      c.yieldUntil = t + 10;
      const L = lane.left;
      if (L && net.lanes[L].kind === 'normal' && K.spanAllowed(net, lane.id, L, c.s, c.v) && K.changeOk(sim, c, L)) { want(c, L, 'left', t); return true; }
      c.slowUntil = t + YIELD_T; c.slowV = c.v * YIELD_SLOW;
    }
    return false;
  }

  // decide 훅: true면 traffic.js의 나머지 판단(임의 차선 변경)을 건너뛴다
  function decide(sim, c, t, dt, K) {
    const net = sim.net, lane = net.lanes[c.laneId], L = laneLength(lane);
    if (lane.kind === 'toll') {
      const front = c.s + c.l / 2;
      if (lane.toll === 'normal' && lane.stopS != null && c.tollDone !== lane.id) {
        const d = lane.stopS - front;
        if (d >= -0.5 && d < TOLL_NEAR && c.v < 0.3) { if ((c.tollWait += dt) >= TOLL_WAIT) c.tollDone = lane.id; }
        else c.tollWait = 0;
      }
      return true;
    }
    if (c.jam) { c.want = null; return true; }
    if (lane.kind === 'accel') { merge(sim, c, t, lane, K); return true; }
    if (c.want) return false;
    const tn = tollNext(net, lane);
    if (tn.length && L - c.s < TOLL_LOOK) {
      if (!tn.some(x => x.toll === c.toll) && (c.keepT -= dt) <= 0) {
        c.keepT = 0.5;
        const side = sideWith(net, lane, c.toll), to = side && lane[side];
        if (to && K.spanAllowed(net, lane.id, to, c.s, c.v) && K.changeOk(sim, c, to)) want(c, to, side, t);
        else if (to) { // 옆 차로 흐름과 나란히 달리면 간격이 안 생긴다 → 그 흐름보다 살짝 늦게 달려 뒤로 끼어든다
          const sT = mapS(net, lane.id, to, c.s), { lead, foll } = around(sim, c, to, sT);
          const near = !lead ? foll : !foll ? lead : lead.s - sT < sT - foll.s ? lead : foll;
          c.slowUntil = t + 1; c.slowV = TOLL_EASE * (near ? near.v : c.v0);
        }
      }
      return true;
    }
    if (c.vFix != null) return true;
    if (yieldTo(sim, c, t, lane, K)) return true;
    const right = lane.right && net.lanes[lane.right];
    if (!lane.left && lane.minSpeed != null && right && right.kind === 'normal' && t >= c.yieldUntil) {
      if ((c.keepT -= dt) > 0) return false;
      c.keepT = KEEP_T;
      if (!K.spanAllowed(net, lane.id, right.id, c.s, c.v) || !K.changeOk(sim, c, right.id)) return false;
      const ld = K.leaderAhead(sim, c, right.id, mapS(net, lane.id, right.id, c.s), 150, false);
      if (!ld || ld.gap > KEEP_GAP || ld.v >= c.v * 0.95) { want(c, right.id, 'right', t); return true; }
    }
    return false;
  }

  // 목표 속도: slow 고정, 최고 속도, 톨게이트 차로 앞 감속(traffic.js 회전 상한 앞보기 120m로는 고속에서 모자람)
  function v0(sim, c, v) {
    v = Math.min(c.vFix != null ? c.vFix : v, VMAX);
    const net = sim.net;
    let d = laneLength(net.lanes[c.laneId]) - c.s - c.l / 2;
    for (const id of c.path) {
      if (d > 400) break;
      if (net.lanes[id].kind === 'toll') { v = Math.min(v, Math.sqrt(HIPASS_V * HIPASS_V + 2 * TOLL_DEC * Math.max(0, d))); break; }
      d += laneLength(net.lanes[id]);
    }
    return v;
  }

  // 가상 정지물: 가속차로 끝 대기, 일반 부스 정지선
  function obstacles(sim, c, out) {
    const net = sim.net, lane = net.lanes[c.laneId], front = c.s + c.l / 2;
    if (lane.kind === 'accel') {
      const g = laneLength(lane) - ACC_STOP - front;
      if (g < c.v * c.v / (2 * 2) + ACC_BRAKE) out.push(Math.max(g, 0.01));
    }
    let d = -front;
    for (const id of [c.laneId].concat(c.path)) {
      const ln = net.lanes[id];
      if (d > 150) break;
      if (ln.kind === 'toll' && ln.toll === 'normal' && ln.stopS != null && c.tollDone !== id && d + ln.stopS > -0.5) out.push(Math.max(d + ln.stopS, 0.01));
      d += laneLength(ln);
    }
  }

  // 가속도 훅: jam 정지, 톨게이트 펼침·모임 구간에서 옆 갈래 차를 앞차로
  function accel(sim, c, a, K) {
    if (c.jam) return Math.min(a, c.v > 0 ? -JAM_DEC : 0);
    const net = sim.net, lane = net.lanes[c.laneId], L = laneLength(lane), hw = sim.hw;
    const lead = (gap, v) => { a = Math.min(a, K.idmTerm(c.v, v, gap, c.T, K.S0)); };
    if (lane.kind === 'toll') {
      const rem = L - c.s;
      for (const sb of hw.into[lane.next[0]] || []) {
        if (sb === lane.id) continue;
        const Lb = laneLength(net.lanes[sb]);
        for (const e of sim.idx[sb] || []) {
          const rb = Lb - e.s;
          if ((rb < rem || (rb === rem && e.car.id < c.id)) && rem - rb < ZIP) lead(rem - rb - (c.l + e.l) / 2, e.v);
        }
      }
    }
    const here = hw.sib[c.laneId], nx = c.path[0] && hw.sib[c.path[0]];
    const sb = here && c.s < DIV ? here : nx && nx.pred === c.laneId ? nx : null;
    if (sb) {
      const base = here === sb ? -c.s : L - c.s;
      for (const o of sb.others) for (const e of sim.idx[o] || []) {
        if (e.s - e.l / 2 >= DIV || base + e.s <= 0) continue;
        lead(base + e.s - (c.l + e.l) / 2, e.v);
      }
    }
    return a;
  }

  // 스크립트: 생성 때(slow), 발동 때(jam·slow). 처리했으면 true.
  function initScript(sim, sc, K) {
    const def = sc.def;
    if (def.action !== 'slow') return false;
    if (def.spawn) sc.car = K.addCar(sim, def.spawn.laneId, def.spawn.s, def.spawn.v != null ? def.spawn.v : def.v);
    fire(sim, sc, K);
    return true;
  }
  function fire(sim, sc, K) {
    const def = sc.def;
    if (def.action === 'slow') {
      const c = sc.car || sim.list.find(x => x.id === def.carId);
      if (c) { c.vFix = def.v; sc.car = c; }
      sc.state = 'done';
      return true;
    }
    if (def.action !== 'jam') return false;
    const at = def.at, n = def.cars || 1;
    const sel = sim.list.filter(c => c.laneId === at.laneId && c.s >= at.s).sort((p, q) => p.s - q.s).slice(0, n);
    if (!sel.length) sel.push(K.addCar(sim, at.laneId, at.s, 0));
    for (const c of sel) { c.jam = true; c.want = null; c.blink = 0; c.vFix = 0; }
    sel[sel.length - 1].hazard = true;
    sc.state = 'done';
    return true;
  }

  return { RAMP_HEAD, init, initCar, choose, decide, v0, obstacles, accel, initScript, fire };
})();
if (typeof module !== 'undefined') module.exports = PP_THW;
