// 붕붕이 — 장내기능시험식 코스 'yard'(비공식 근사, 실제 시험과 다를 수 있음). 레슨 단계 엔진의 시험 모드(exam)로 돈다. DOM 없음.
// 길: 출발(동쪽) → 직선 → 경사로 → 좌회전 코너(북쪽) → T자 주차 → 신호교차로 → 우회전 코너(동쪽) → 가속 → 돌발 → 종료.
// 차로 폭 3.5m(연석 중심 ±1.9, 두께 0.3). 코너는 안쪽을 둥글리고 바깥을 2.5m 넓혀 셀토스(회전반경 5.3m)가 핸들 끝까지 꺾어 한 번에 돈다.
const PP_YARD = (function ppYard() {
  const LS = typeof PP_LESSONS !== 'undefined' ? PP_LESSONS : require('./lessons.js');
  const C = typeof PP_CAR !== 'undefined' ? PP_CAR : require('./car.js');
  const K = typeof PP_COL !== 'undefined' ? PP_COL : require('./collision.js');
  const S = typeof PP_SCORE !== 'undefined' ? PP_SCORE : require('./scoring.js');
  const PI = Math.PI, D2R = PI / 180, KMH = 1 / 3.6;
  const B = 1.9, HW = 1.75; // 연석 중심 오프셋, 차로 반폭

  const curb = (x1, y1, x2, y2) => ({ x: (x1 + x2) / 2, y: (y1 + y2) / 2, l: Math.hypot(x2 - x1, y2 - y1) + 0.3, w: 0.3, a: Math.atan2(y2 - y1, x2 - x1), kind: 'curb', h: 0.15 });
  const poly = pts => pts.slice(1).map((p, i) => curb(pts[i][0], pts[i][1], p[0], p[1]));
  const arc = (cx, cy, r, a0, a1, n = 6) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });
  // 축 정렬 구역: 가운데 (x,y), 가로(x) sx, 세로(y) sy
  const zone = (x, y, sx, sy) => ({ type: 'zone', x, y, l: sx, w: sy, a: 0 });
  const across = (x, y, vertical) => vertical ? [x - HW, y, x + HW, y] : [x, y - HW, x, y + HW]; // 차로를 가로지르는 선

  // ── 좌표 ──
  const X1 = 80, Y1 = 0;            // 1구간(동쪽) y=0, 2구간(북쪽) x=80
  const Y3 = 70;                    // 3구간(동쪽) y=70
  const RAMP = { up0: 28, up1: 43, top1: 49, dn1: 64, z: 1.5 };   // 오르막 15m(10%), 꼭대기 6m, 내리막 15m
  const BAY = { x0: 74.75, x1: 81.75, y0: 18, y1: 38 };           // T자 주차 통로(폭 7m)
  const SLOT = { type: 'slot', x: 84.5, y: 26, l: 5.5, w: 2.8, a: 0, face: 'out', tolA: 10 * D2R }; // 후진으로 넣어 앞이 서쪽
  const STOP_Y = 50, XING = { y0: 50.5, y1: 57.5 };               // 신호 정지선, 교차로(가로 도로 폭 7m)
  const ACC = { x0: 96, x1: 126 }, EMG = { x0: 132, x1: 162, mid: 147 }, END_X = 178;

  const G = {
    start: zone(4, Y1, 6, 3.5),
    straight: zone(24, Y1, 6, 3.5),
    hill: zone(38.5, Y1, 7, 3.5),            // 오르막 정지 구역 x∈[35,42]
    rampEnd: zone(67, Y1, 6, 3.5),
    left: zone(X1, 12, 3.5, 6),
    bay: zone((BAY.x0 + 87.25) / 2, (BAY.y0 + BAY.y1) / 2, 87.25 - BAY.x0, BAY.y1 - BAY.y0),
    bayExit: zone(X1, 42, 3.5, 6),
    stopArea: zone(X1, STOP_Y - 5, 3.5, 10),  // 정지선 앞 10m
    xingExit: zone(X1, 61.5, 3.5, 5),
    right: zone(92, Y3, 6, 3.5),
    acc: zone((ACC.x0 + ACC.x1) / 2, Y3, ACC.x1 - ACC.x0, 3.5),
    accEnd: zone(ACC.x1 + 2.5, Y3, 5, 3.5),
    emg: zone(EMG.mid, Y3, EMG.x1 - EMG.x0, 3.5),
    end: zone(172, Y3, 7, 3.5),
  };
  const LEFT_LINE = 70, RIGHT_LINE = 64; // 코너 진입선(차체 중심 기준): 1구간 x, 2구간 y

  // ── 연석 ──
  // 코너(지역 좌표 u = 들어오는 방향, v = 도는 쪽, 들어오는 차로 중심 v=0, 나가는 차로 중심 u=U):
  // 안쪽 모서리는 반경 CI로 둥글게(풀 핸들 회전 중심과 거의 같은 중심), 바깥은 P만큼 넓힌 주머니(반경 CO 원호, 나가는 쪽 VP까지, 1.5m에 걸쳐 원래 폭으로)
  const CI = 3, CO = 4, P = 2.5, VP = 12;
  function cornerCurbs(U, toW) {
    const w = pts => pts.map(([u, v]) => toW(u, v));
    return [
      ...poly(w(arc(U - B - CI, B + CI, CI, -PI / 2, 0))),
      ...poly(w(arc(U + B + P - CO, -B + CO, CO, -PI / 2, 0).concat([[U + B + P, VP], [U + B, VP + 1.5]]))),
    ];
  }
  const obstacles = [];
  // 1구간: 경사로 경계에서 끊어 연석이 경사를 따라 기울게
  const cutsA = [0, RAMP.up0, RAMP.up1, RAMP.top1, RAMP.dn1];
  for (let i = 0; i < cutsA.length - 1; i++) obstacles.push(curb(cutsA[i], B, cutsA[i + 1], B), curb(cutsA[i], -B, cutsA[i + 1], -B));
  obstacles.push(curb(RAMP.dn1, B, X1 - B - CI, B), curb(RAMP.dn1, -B, X1 + B + P - CO, -B));
  obstacles.push(curb(-0.15, -B, -0.15, B)); // 출발 뒤 막음
  // 좌회전 코너(동→북): u = x, v = y
  obstacles.push(...cornerCurbs(X1, (u, v) => [u, v]));
  // 2구간 서쪽: T자 통로에서 바깥으로 넓힘, 교차로에서 끊김(가로 도로 막다른 6m)
  const WX = X1 - B, EX = X1 + B;
  obstacles.push(...poly([[WX, B + CI], [WX, BAY.y0], [BAY.x0 - 0.15, BAY.y0], [BAY.x0 - 0.15, BAY.y1], [WX, BAY.y1], [WX, XING.y0 - 0.15]]));
  obstacles.push(...poly([[WX, XING.y0 - 0.15], [WX - 6, XING.y0 - 0.15], [WX - 6, XING.y1 + 0.15], [WX, XING.y1 + 0.15], [WX, Y3 + B + P - CO]]));
  // 2구간 동쪽: 주차 칸(깊이 5.5, 폭 2.8, 입구에서 끊김)
  const SY0 = SLOT.y - SLOT.w / 2 - 0.15, SY1 = SLOT.y + SLOT.w / 2 + 0.15, SBACK = SLOT.x + SLOT.l / 2 + 0.15;
  const FL = 0.6; // 칸 입구 양쪽 모서리를 45°로 깎는다
  obstacles.push(...poly([[EX, VP + 1.5], [EX, SY0 - FL], [EX + FL, SY0], [SBACK, SY0], [SBACK, SY1], [EX + FL, SY1], [EX, SY1 + FL]]));
  obstacles.push(...poly([[EX, SY1 + FL], [EX, XING.y0 - 0.15], [EX + 6, XING.y0 - 0.15], [EX + 6, XING.y1 + 0.15], [EX, XING.y1 + 0.15], [EX, Y3 - B - CI]]));
  // 우회전 코너(북→동): 거울상으로 u = y, v = x - 80
  obstacles.push(...cornerCurbs(Y3, (u, v) => [X1 + v, u]));
  // 3구간
  obstacles.push(curb(X1 + B + CI, Y3 - B, END_X, Y3 - B), curb(X1 + VP + 1.5, Y3 + B, END_X, Y3 + B), curb(END_X + 0.15, Y3 - B, END_X + 0.15, Y3 + B));
  // 신호등 기둥(렌더는 kind 'light'로 그린다)
  const LIGHT = { x: EX + 0.6, y: STOP_Y - 0.6, l: 0.3, w: 0.3, a: 0, kind: 'light', h: 3 };
  obstacles.push(LIGHT);

  const lines = [
    across(7, Y1), across(G.straight.x + 3, Y1),                                  // 출발선, 직선 끝
    across(35, Y1), across(42, Y1), across(RAMP.dn1, Y1),                          // 경사로 정지 구역, 경사로 끝
    across(X1, STOP_Y, true),                                                     // 신호 정지선
    across(ACC.x0, Y3), across(ACC.x1, Y3), across(EMG.x0, Y3), across(EMG.x1, Y3), // 가속·돌발 구간
    [168.5, Y3 - HW, 175.5, Y3 - HW], [168.5, Y3 + HW, 175.5, Y3 + HW], across(168.5, Y3), across(175.5, Y3), // 종료 구역
  ];

  const map = {
    id: 'yard', name: '장내기능', tip: '', env: 'outdoor', start: { cx: 4, cy: Y1, th: 0 },
    obstacles, lines, goal: LS.NOGOAL, par: 0,
    floors: [{ x: (RAMP.up1 + RAMP.top1) / 2, y: Y1, l: RAMP.top1 - RAMP.up1, w: 5, a: 0, z: RAMP.z }],
    ramps: [{ x: (RAMP.up0 + RAMP.up1) / 2, y: Y1, l: RAMP.up1 - RAMP.up0, w: 5, a: 0, z0: 0, z1: RAMP.z },
      { x: (RAMP.top1 + RAMP.dn1) / 2, y: Y1, l: RAMP.dn1 - RAMP.top1, w: 5, a: 0, z0: RAMP.z, z1: 0 }],
    bounds: { x0: -2, y0: -4, x1: END_X + 2, y1: Y3 + 6 },
  };

  // ── 판정 도우미 ──
  const center = car => { const b = C.bodyBox(car); return [b.x, b.y]; };
  const at = (g, car) => K.contains(g, ...center(car));
  const stopped = car => Math.abs(car.v) < 0.05;
  const frontOf = car => C.toWorld(car, car.spec.wheelbase + C.frontOverhang(car.spec), 0);
  const blinked = (L, side, t) => (side < 0 ? L.sig.l : L.sig.r) >= t - 3; // 최근 3초 안에 켜져 있었나(회전 뒤 자동 꺼짐 고려)
  const once = (L, key, ev) => { if (L.mem[key]) return []; L.mem[key] = true; return [ev]; };
  const T = {
    hit: '연석(검지선)에 닿았어요',
    startBlink: '출발할 때 왼쪽 깜빡이를 켜지 않았어요',
    hillNoStop: '경사로 정지 구역에서 멈추지 않았어요',
    hillRoll: '경사로에서 뒤로 1m 넘게 밀렸어요',
    hillTime: '경사로를 30초 안에 넘지 못했어요',
    leftBlink: '좌회전 전에 왼쪽 깜빡이를 켜지 않았어요',
    parkTime: '직각주차를 2분 안에 마치지 못했어요',
    red: '빨간불에 정지선을 넘었어요',
    rightBlink: '우회전 전에 오른쪽 깜빡이를 켜지 않았어요',
    slow: '가속 구간에서 20km/h를 넘지 못했어요',
    emgStop: '돌발 경고 뒤 2초 안에 멈추지 못했어요',
    hazard: '돌발 정지 뒤 비상등을 켜지 않았어요',
    endBlink: '종료할 때 오른쪽 깜빡이를 켜지 않았어요',
  };
  // 판정 항목은 pts(또는 dq)·text·code — code는 약점 코드(progress.js MARKS). 항목은 모두 item(key, pts)로 만든다(pts 없으면 실격)
  // hit(연석)은 레슨 엔진(lessons.js)이 내지만 문구·코드는 같다
  const CODES = { hit: 'curb', startBlink: 'start', hillNoStop: 'hill', hillRoll: 'hill', hillTime: 'hill', leftBlink: 'blinkCorner', rightBlink: 'blinkCorner',
    parkTime: 'tpark', red: 'light', slow: 'accel', emgStop: 'alarm', hazard: 'alarm', endBlink: 'end' };
  const item = (key, pts) => Object.assign(pts == null ? { dq: true } : { pts }, { text: T[key], code: CODES[key] });
  // 코너: 진입선을 넘는 순간 깜빡이 확인
  const corner = (side, cross, key) => (s, L) => {
    const [cx, cy] = center(s.car);
    if (L.mem.crossed || !cross(cx, cy)) return [];
    L.mem.crossed = true;
    return blinked(L, side, L.t) ? [] : [item(key, 5)];
  };

  const steps = [
    { name: '출발', text: '왼쪽 깜빡이를 켜고 D로 바꿔 출발하세요', keys: 'Z 왼쪽 깜빡이 · ↓ 누른 채 D · ↑ 가속', touch: '#blink-left, [data-gear="D"]',
      goal: G.start,
      check: (s, L) => {
        if (L.mem.moved || Math.abs(s.car.v) <= 0.1) return [];
        L.mem.moved = true;
        return blinked(L, -1, L.t) ? [] : [item('startBlink', 5)];
      },
      done: s => !at(G.start, s.car) },
    { name: '차로 준수', text: '연석에 닿지 않게 직선 차로 끝까지 가세요', keys: '← → 핸들 · ↑ 가속', touch: '[data-pp="wheel"]',
      goal: G.straight, done: s => at(G.straight, s.car) },
    { name: '경사로', text: '오르막 초록 구역에 완전히 멈췄다가(1초), 밀리지 않게 출발해 경사로를 넘으세요', keys: '↓ 멈추기 · ↑ 출발', touch: '[data-pp="brake"], [data-pp="gas"]',
      goal: G.hill,
      check: (s, L) => {
        const m = L.mem, car = s.car, [cx] = center(car);
        if (m.inT == null && at(G.hill, car)) m.inT = L.t;
        if (m.inT == null) return [];
        if (!m.stop) {
          if (held(L, K.inside(C.bodyBox(car), G.hill) && stopped(car), 1, s.dt)) m.stop = { x: car.x, y: car.y, th: car.th };
          else if (cx > G.hill.x + G.hill.l / 2) return once(L, 'noStop', item('hillNoStop', 10));
        } else {
          const back = (car.x - m.stop.x) * Math.cos(m.stop.th) + (car.y - m.stop.y) * Math.sin(m.stop.th);
          if (back < -1) return [item('hillRoll')];
        }
        if (L.t - m.inT > 30 && !at(G.rampEnd, car)) return [item('hillTime')];
        return [];
      },
      done: s => at(G.rampEnd, s.car) },
    { name: '좌회전', text: '왼쪽 깜빡이를 켜고 코너를 좌회전하세요', keys: 'Z 왼쪽 깜빡이 · ← 핸들', touch: '#blink-left, [data-pp="wheel"]',
      goal: G.left, check: corner(-1, cx => cx >= LEFT_LINE, 'leftBlink'), done: s => at(G.left, s.car) },
    { name: '직각주차', text: '칸을 지나친 뒤 후진으로 넣고 2초 멈췄다가, 앞으로 나와 다음 차로로 가세요', keys: 'R 후진 · 핸들 · ↓ 멈추기 · D', touch: '[data-gear="R"], [data-gear="D"], [data-pp="wheel"]',
      goal: SLOT,
      check: (s, L) => {
        const m = L.mem, car = s.car;
        if (m.inT == null && at(G.bay, car)) m.inT = L.t;
        if (!m.parked && held(L, K.inside(C.bodyBox(car), SLOT) && S.angDiff(car.th, SLOT.a + PI) <= SLOT.tolA && stopped(car), 2, s.dt)) m.parked = true;
        if (m.inT != null && !m.parked && L.t - m.inT > 120) return once(L, 'late', item('parkTime', 10));
        return [];
      },
      done: (s, L) => !!L.mem.parked && at(G.bayExit, s.car) },
    { name: '신호교차로', text: '빨간불이에요. 정지선 앞에 멈췄다가 초록불에 교차로를 지나세요', keys: '↓ 멈추기 · ↑ 출발', touch: '[data-pp="brake"]',
      goal: G.stopArea,
      enter: (s, L) => { L.light = 'R'; },
      check: (s, L) => {
        if (L.light !== 'R') return [];
        const f = frontOf(s.car)[1];
        if (f > STOP_Y) return [item('red')];
        if (held(L, f >= STOP_Y - 10 && stopped(s.car), 3, s.dt)) L.light = 'G';
        return [];
      },
      done: (s, L) => L.light === 'G' && at(G.xingExit, s.car) },
    { name: '우회전', text: '오른쪽 깜빡이를 켜고 코너를 우회전하세요', keys: 'C 오른쪽 깜빡이 · → 핸들', touch: '#blink-right, [data-pp="wheel"]',
      goal: G.right, enter: (s, L) => { L.light = null; },
      check: corner(1, (cx, cy) => cy >= RIGHT_LINE, 'rightBlink'), done: s => at(G.right, s.car) },
    { name: '가속', text: '가속 구간에서 20km/h 넘게 속도를 올리세요', keys: '↑ 가속', touch: '[data-pp="gas"]',
      goal: G.acc,
      check: (s, L) => {
        const m = L.mem;
        if (at(G.acc, s.car)) m.vmax = Math.max(m.vmax || 0, s.car.v);
        if (at(G.accEnd, s.car) && (m.vmax || 0) < 20 * KMH - 1e-9) return once(L, 'slow', item('slow', 10));
        return [];
      },
      done: s => at(G.accEnd, s.car) },
    { name: '돌발', text: '"돌발!" 경고가 뜨면 바로 멈추고 비상등을 켜세요. 비상등을 끄고 다시 출발하세요', keys: '↓ 멈추기 · X 비상등 · ↑ 출발', touch: '[data-pp="brake"], [data-hazard]',
      goal: G.emg,
      check: (s, L) => {
        const m = L.mem, car = s.car, [cx] = center(car), out = [];
        if (L.alarm == null && cx >= EMG.mid) L.alarm = L.t;
        if (L.alarm == null) return out;
        if (!m.stop && stopped(car)) m.stop = true;
        if (m.stop && s.hazard) m.haz = true;
        if (!m.stop && (L.t - L.alarm > 2 || emgDone(s, L))) out.push(...once(L, 'late', item('emgStop', 10)));
        if (emgDone(s, L) && !m.haz) out.push(...once(L, 'noHaz', item('hazard', 5)));
        return out;
      },
      done: (s, L) => emgDone(s, L) },
    { name: '종료', text: '오른쪽 깜빡이를 켜고 종료 구역에 멈춘 뒤 P로 바꾸세요', keys: 'C 오른쪽 깜빡이 · ↓ 멈추기 · P', touch: '#blink-right, [data-gear="P"]',
      goal: G.end, enter: (s, L) => { L.alarm = null; },
      check: (s, L) => {
        const m = L.mem, car = s.car, inside = K.inside(C.bodyBox(car), G.end);
        const st = inside && stopped(car);
        if (st && !m.was) { m.stopT = L.t; m.rOk = false; }
        m.was = st;
        // 오른쪽 깜빡이: 멈추기 3초 전 ~ 멈춘 뒤 2초 안(+0.5초 여유)에 켜져 있었어야 인정(sig.r = 마지막으로 켜져 있던 시각이라 매 프레임 본다)
        if (m.stopT != null && L.sig.r >= m.stopT - 3 && L.sig.r <= m.stopT + 2.5) m.rOk = true;
        if (endDone(s) && !(m.stopT != null ? m.rOk : blinked(L, 1, L.t))) return once(L, 'blink', item('endBlink', 5));
        return [];
      },
      done: s => endDone(s) },
  ];
  // 돌발: 멈췄다가 비상등 끄고 출발했거나, 구간을 끝까지 지나쳤다
  function emgDone(s, L) {
    if (L.alarm == null) return false;
    const [cx] = center(s.car);
    return (L.mem.stop && !s.hazard && s.car.v > 0.3) || cx >= EMG.x1;
  }
  const endDone = s => s.car.gear === 'P' && K.inside(C.bodyBox(s.car), G.end);
  function held(L, cond, sec, dt) { L.acc = cond ? L.acc + dt : 0; return L.acc >= sec - 1e-9; }

  const course = LS.register({
    id: 'yard', name: '장내기능', kind: 'parking', gear: 'P', vMax: 30 / 3.6, exam: { pass: 80 },
    tip: '장내기능시험을 본뜬 코스예요(실제 시험과 다를 수 있어요). 100점에서 감점, 80점 아래면 중단돼요.',
    map, steps,
  });
  return { course, map, G, SLOT, TEXT: T, CODES, item, RAMP, STOP_Y, LEFT_LINE, RIGHT_LINE, EMG, ACC };
})();
if (typeof module !== 'undefined') module.exports = PP_YARD;
