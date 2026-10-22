// 붕붕이 — 초보 튜토리얼 레슨(조작·주차 기초·시내 기초)과 단계 판정. DOM 없음.
// 레슨은 기존 주행 루프 위에서 돈다(주차 레슨 = start(map), 시내 레슨 = startDrive(mission)). 여기서는 매 프레임 "이 단계를 해냈나?"만 본다.
// 실패·감점 없음: 접촉하거나 단계 규칙(fail)을 어기면 차를 그 단계 시작 자리로 되돌린다.
// 시험 모드(lesson.exam = { pass }): 되돌리기 대신 감점·실격(단계 check)을 L.exam에 쌓고, pass 미만·실격이면 바로 끝낸다(장내기능 yard.js).
const PP_LESSONS = (function ppLessons() {
  const S = typeof PP_SCORE !== 'undefined' ? PP_SCORE : require('./scoring.js');
  const C = typeof PP_CAR !== 'undefined' ? PP_CAR : require('./car.js');
  const K = typeof PP_COL !== 'undefined' ? PP_COL : require('./collision.js');
  const R = typeof PP_ROADS !== 'undefined' ? PP_ROADS : require('./roads.js');
  const M = typeof PP_MISSIONS !== 'undefined' ? PP_MISSIONS : require('./missions.js');
  const DS = typeof PP_DSCORE !== 'undefined' ? PP_DSCORE : require('./drive-score.js');
  const PI = Math.PI, D2R = PI / 180, KMH = 1 / 3.6;

  const box = (x, y, l, w, a = 0, kind = 'wall', o = {}) => Object.assign({ x, y, l, w, a, kind }, o);
  const zone = (x, y, l, w) => ({ type: 'zone', x, y, l, w, a: 0 });
  // 레슨 맵의 map.goal: 주차 채점(tick)이 run.done을 켜지 않게 닿을 수 없는 곳. 단계 목표는 step.goal로 따로 판정·표시한다.
  const NOGOAL = zone(1e5, 1e5, 1, 1);
  const LOT = { x0: -30, y0: -30, x1: 30, y1: 30 }; // 60×60m 야외 공터
  const lotWalls = () => [box(0, LOT.y0, 60.3, 0.3), box(0, LOT.y1, 60.3, 0.3), box(LOT.x0, 0, 0.3, 60.3), box(LOT.x1, 0, 0.3, 60.3)];
  const lotMap = (id, name, o = {}) => Object.assign({ id, name, tip: '', env: 'outdoor', start: { x: -20, y: 0, th: 0 },
    obstacles: lotWalls(), lines: [], floors: [], ramps: [], goal: NOGOAL, par: 0, bounds: LOT }, o);

  const moved = (L, car) => Math.hypot(car.x - L.snap.x, car.y - L.snap.y);
  const turned = (L, car) => S.angDiff(car.th, L.snap.th);
  // cond가 sec초 이어지면 참(단계마다 0부터)
  function held(L, cond, sec, dt) { L.acc = cond ? L.acc + dt : 0; return L.acc >= sec - 1e-9; }

  // ── 레슨 1: 조작 ──
  const CONTROLS = {
    id: 'lesson-controls', name: '조작 익히기', kind: 'parking', gear: 'P',
    tip: '브레이크·기어·엑셀·핸들·시점을 하나씩 해 봐요. 부딪혀도 그 단계만 다시 하면 돼요.',
    map: lotMap('lesson-controls', '조작 익히기'),
    steps: [
      { text: '브레이크를 밟으세요', keys: '↓ 또는 S', touch: '[data-pp="brake"]',
        done: (s, L) => held(L, s.ctl.brake > 0.5, 0.5, s.dt) },
      { text: '브레이크를 밟은 채 D로 바꾸세요', keys: '↓ 누른 채 D', touch: '[data-pp="brake"], [data-gear="D"]',
        done: s => s.car.gear === 'D' },
      { text: '브레이크를 떼면 차가 천천히 굴러가요', keys: '아무것도 누르지 마세요', touch: null,
        done: (s, L) => s.ctl.brake === 0 && moved(L, s.car) >= 3 },
      { text: '엑셀을 살짝 밟아 10km/h까지 올리세요', keys: '↑ 또는 W', touch: '[data-pp="gas"]',
        done: s => s.car.v >= 10 * KMH },
      { text: '브레이크로 멈추세요', keys: '↓ 또는 S', touch: '[data-pp="brake"]',
        done: s => Math.abs(s.car.v) < 0.5 * KMH },
      { text: '핸들을 왼쪽 끝까지 돌린 채 천천히 가세요', keys: '← 를 길게', touch: '[data-pp="wheel"]',
        done: (s, L) => s.car.gear === 'D' && s.car.wheel >= 400 && turned(L, s.car) >= 90 * D2R },
      { text: '시점을 바꿔 보세요', keys: 'V', touch: '#btn-view', done: s => !!s.ctl.viewReq },
      { text: '멈춘 뒤 R로 바꾸고 3m 후진하세요', keys: '↓ 누른 채 R, 그다음 ↓ 떼기', touch: '[data-pp="brake"], [data-gear="R"]',
        done: (s, L) => { L.mem.rev = (L.mem.rev || 0) + Math.max(0, -s.car.v) * s.dt; return s.car.gear === 'R' && L.mem.rev >= 3; } },
      { text: '멈추고 P로 바꾸세요', keys: '↓ 누른 채 P', touch: '[data-pp="brake"], [data-gear="P"]',
        done: s => s.car.gear === 'P' },
    ],
  };

  // ── 레슨 2: 주차 기초 ── 칸은 일반(2.3×5.0)보다 넓게(키보드로 꺾는 시점이 ±0.5m쯤 어긋나도 들어가게), 안쪽 끝에 낮은 연석·양옆 볼라드
  const SLOT = { type: 'slot', x: 0, y: 6, l: 5.2, w: 2.8, a: PI / 2, tolA: 10 * D2R };
  const SLOT_IN = Object.assign({}, SLOT, { face: 'in' }), SLOT_OUT = Object.assign({}, SLOT, { face: 'out' });
  const SLOT_EXIT = Object.assign(zone(0, -1, 6, 3.2), { a: PI / 2 }); // 칸 입구 앞(남쪽): 똑바로 후진해 나오면 닿는 곳
  const PARKING = {
    id: 'lesson-parking', name: '주차 기초', kind: 'parking', gear: 'P',
    tip: '초록 영역까지 앞뒤로 가 보고, 넓은 칸에 앞으로·뒤로 넣어 봐요.',
    map: lotMap('lesson-parking', '주차 기초', {
      lines: [[-1.4, 3.4, -1.4, 8.6], [1.4, 3.4, 1.4, 8.6], [-1.4, 8.6, 1.4, 8.6]],
      obstacles: lotWalls().concat([box(0, 8.85, 2.8, 0.3, 0, 'curb', { h: 0.15 }), // 칸을 그대로 지나치면 닿는다
        box(-1.7, 8.9, 0.3, 0.3, 0, 'pole', { h: 1 }), box(1.7, 8.9, 0.3, 0.3, 0, 'pole', { h: 1 })]),
    }),
    steps: [
      { text: 'D로 바꾸고 앞의 초록 영역까지 가서 멈추세요', keys: '↓ 누른 채 D · ↑ 가속 · ↓ 멈추기', touch: '[data-pp="brake"], [data-gear="D"], [data-pp="gas"]',
        goal: zone(-8, 0, 7, 3.5), done: s => S.evalGoal(PARKING.steps[0].goal, s.car).ok },
      { text: 'R로 바꿔 뒤의 초록 영역까지 후진해서 멈추세요', keys: '↓ 누른 채 R · ↑ 가속 · ↓ 브레이크로 멈추기', touch: '[data-gear="R"], [data-pp="brake"]',
        goal: zone(-18, 0, 7, 3.5), done: s => S.evalGoal(PARKING.steps[1].goal, s.car).ok },
      { text: '왼쪽 초록 칸에 앞으로 넣고 멈추세요', keys: 'D · ← 핸들 · ↓ 브레이크 · V 시점(위에서 보면 쉬워요)', touch: '[data-gear="D"], [data-pp="wheel"]',
        goal: SLOT_IN, done: s => Math.abs(s.car.v) < 0.05 && S.evalGoal(SLOT_IN, Object.assign({}, s.car, { gear: 'P' })).ok },
      { text: 'R로 바꿔 칸에서 뒤로 빼낸 뒤 멈추세요', keys: '↓ 누른 채 R · ↓ 멈추기', touch: '[data-pp="brake"], [data-gear="R"]',
        goal: SLOT_EXIT, done: s => { const b = C.bodyBox(s.car); return s.car.gear === 'R' && Math.abs(s.car.v) < 0.05 && !K.overlap(b, SLOT) && K.overlap(b, SLOT_EXIT); } }, // 칸에서 완전히 나와 입구 앞(초록)에
      { text: '앞으로 빠져나갔다가 후진으로 다시 넣고 P로 바꾸세요', keys: 'D · R · 핸들 · P', touch: '[data-gear="D"], [data-gear="R"], [data-gear="P"]',
        goal: SLOT_OUT, done: s => S.evalGoal(SLOT_OUT, s.car).ok },
    ],
  };

  // ── 레슨 3: 시내 기초 ── 편도 2차로 a → 신호 교차로 J1 → b → 신호 없는 T자 J2(오른쪽 팔 r) → 목적지. 다른 차·보행자 없음.
  // J1 신호는 레슨이 조종: 시작부터 적색(약 60초), 정지선 앞에 멈추면 2초 뒤 녹색.
  const W = 3.2, LIM = 50, H = 2 * W + 8, LEN_A = 200, GAP = 220, ARM = 80;
  const laneOf = s => s.d.net.lanes[s.d.player.laneId];
  const front = d => d.player.s + d.car.spec.length / 2;
  // 깜빡이는 최근 3초 안에 켜져 있었으면 된다: 키보드로 핸들을 90° 넘게 꺾으면 차로를 다 옮기기 전에 깜빡이가 저절로 꺼진다(drive.js armed)
  const signalled = (d, L) => L.mem.blinkT >= d.t - 3 && d.mirrorR >= d.t - 3;
  const CITY = {
    id: 'lesson-city', name: '시내 기초', kind: 'city',
    tip: '신호 앞에서 멈추고, 깜빡이와 미러를 쓰고, 우회전해서 도착해요. 다른 차는 없어요.',
    mission: { id: 'lesson-city', name: '시내 기초', group: 'city', tip: '', seed: 1, density: 'none', scripts: [],
      limit: LIM, vMax: 60 / 3.6, timeOfDay: 'day', start: { laneId: 'a:f1', s: 20 }, goal: { laneId: 'r:b1', s: 50 },
      build() {
        const net = R.newNet();
        const road = (id, x, y, deg, length, nf, nb) => R.straightRoad(net, { id, x, y, a: deg * D2R, length, lanesFwd: nf, lanesBack: nb, width: W, limit: LIM });
        const a = road('a', -H - LEN_A, 0, 0, LEN_A, 2, 2), b = road('b', H, 0, 0, GAP - 2 * H, 2, 2), c = road('c', GAP + H, 0, 0, 100, 2, 2);
        const n = road('n', 0, H + ARM, -90, ARM, 1, 1), s = road('s', 0, -H - ARM, 90, ARM, 1, 1), r = road('r', GAP, -H - ARM, 90, ARM, 1, 1);
        const T2S = [['straight'], ['straight', 'right']], ALL = [['left', 'straight', 'right']];
        R.junction4(net, { id: 'J1', x: 0, y: 0, arms: [{ road: a, turns: T2S }, { road: b, turns: T2S }, { road: n, turns: ALL }, { road: s, turns: ALL }],
          signal: { cycle: 120, protectedLeft: false }, crosswalks: false });
        R.junction3(net, { id: 'J2', x: GAP, y: 0, arms: [{ road: b, turns: T2S }, { road: c, turns: [['left', 'straight'], ['straight']] }, { road: r, turns: [['left', 'right']] }],
          signal: null, crosswalks: false });
        M.align(net, 'J1:sig', 'a:f1', 'R', 0);
        return net;
      } },
    steps: [
      { text: '브레이크를 밟은 채 D로 바꾸고, 출발해서 차로를 따라 가세요', keys: '↓ 누른 채 D · ↑ 가속', touch: '[data-gear="D"], [data-pp="gas"]',
        done: (s, L) => s.d.player.laneId.startsWith('a:') && moved(L, s.car) >= 30 },
      { text: '빨간불이에요. 정지선 앞에 멈추세요', keys: '↓ 또는 S', touch: '[data-pp="brake"]',
        enter: s => M.align(s.d.net, 'J1:sig', 'a:f1', 'R', s.d.t),
        done: s => { const st = R.stopOf(s.d.net, s.d.player.laneId), f = front(s.d); return !!st && f >= st.s - 10 && f <= st.s && Math.abs(s.car.v) < 0.5 * KMH; },
        fail: s => !s.d.player.laneId.startsWith('a:') && '정지선을 넘었어요' },
      { text: '초록불이 되면 출발해서 교차로를 지나세요', keys: '↑ 또는 W', touch: '[data-pp="gas"]',
        enter: s => M.align(s.d.net, 'J1:sig', 'a:f1', 'G', s.d.t + 2),
        done: s => s.d.player.laneId.startsWith('b:'),
        fail: (s, L) => {
          const ln = laneOf(s);
          if (ln && ln.kind === 'connector' && L.mem.sig == null) L.mem.sig = R.signalState(s.d.net, s.d.t, 'J1:sig', 'a:f1');
          if (L.mem.sig === 'R') return '초록불을 기다렸다 출발하세요';
          return !!ln && ln.kind === 'connector' && ln.turn !== 'straight' && '교차로를 직진으로 지나세요';
        } },
      { text: '오른쪽 깜빡이를 켜고 오른쪽 미러를 본 뒤 2차로로 옮기세요', keys: 'C 깜빡이 · E 미러 · → 핸들', touch: '#blink-right, #mirror-right',
        // 1차로→2차로로 넘어가는 순간만 실패로 본다: a 2차로에서 곧장 b:f2로 들어왔으면 그 자리에서 깜빡이·미러만 하면 통과
        // (단계 시작 자리가 이미 b:f2라 되돌려도 다시 실패하는 무한 되돌리기를 막는다)
        enter: (s, L) => { L.mem.lane = s.d.player.laneId; },
        done: (s, L) => s.d.player.laneId === 'b:f2' && signalled(s.d, L),
        fail: (s, L) => {
          const id = s.d.player.laneId, prev = L.mem.lane;
          L.mem.lane = id;
          if (s.d.blink === 1) L.mem.blinkT = s.d.t;
          if (id === 'b:f2' && prev === 'b:f1' && !signalled(s.d, L)) return '깜빡이를 켜고 미러를 먼저 보세요';
          return !id.startsWith('b:') && '교차로 전에 2차로로 옮기세요';
        } },
      { text: '오른쪽 깜빡이를 켜고 다음 길에서 우회전하세요', keys: 'C 깜빡이 · → 핸들', touch: '#blink-right',
        done: s => s.d.player.laneId.startsWith('r:'),
        fail: (s, L) => {
          const ln = laneOf(s);
          if (ln && ln.kind === 'connector' && L.mem.blink == null) L.mem.blink = s.d.blink; // 돌기 시작한 순간만(회전 뒤 깜빡이는 저절로 꺼진다)
          if (L.mem.blink != null && L.mem.blink !== 1) return '돌기 전에 오른쪽 깜빡이를 켜세요';
          return s.d.player.laneId.startsWith('c:') && '우회전할 길을 지나쳤어요';
        } },
      { text: '목적지까지 가서 멈추세요', keys: '↓ 또는 S', touch: '[data-pp="brake"]', done: s => s.d.score.done },
    ],
  };

  const list = [CONTROLS, PARKING, CITY];
  const extra = []; // 레슨 메뉴에 안 나오는 단계 코스(시험): yard.js가 register
  const register = l => { extra.push(l); return l; };
  const byId = id => list.find(l => l.id === id) || extra.find(l => l.id === id);
  const step = L => L.lesson.steps[L.i];
  function create(lesson) {
    const L = { lesson, i: 0, acc: 0, mem: {}, snap: null, finished: false };
    // t: 시험 시계, sig: 깜빡이가 마지막으로 켜져 있던 시각(단계를 넘어 유지), light: 신호(렌더용), alarm: 돌발 경보 시각
    if (lesson.exam) Object.assign(L, { t: 0, sig: { l: -Infinity, r: -Infinity }, light: null, alarm: null,
      exam: { score: 100, items: [], end: null, finished: false, dq: false } });
    return L;
  }

  // 단계 시작: 차 자세 스냅샷(되돌리기 기준), 단계 메모 초기화, enter
  function begin(L, s) {
    L.snap = { x: s.car.x, y: s.car.y, th: s.car.th, wheel: s.car.wheel, gear: s.car.gear };
    L.acc = 0; L.mem = {};
    const st = step(L);
    if (st.enter) st.enter(s, L);
  }
  // 그 단계 시작 자리로, 핸들은 가운데로(키보드 핸들은 저속에서 안 풀려서 꺾인 채 되돌리면 다시 엉뚱한 데로 간다).
  // 시내는 채점을 새로 만들어 실패 상태를 지우고 깜빡이를 끈다.
  function restore(L, s) {
    Object.assign(s.car, L.snap, { v: 0, wheel: 0 });
    if (s.d) restoreCity(s.d);
    begin(L, s);
  }
  function restoreCity(d) { d.score = DS.create(d.mission, d.net); d.blink = 0; d.armed = false; d.hazard = false; d.route = null; d.retryAt = null; }

  // s = { car, ctl, dt, d, hit } → null | {type:'ok'} | {type:'finish'} | {type:'retry', reason}
  function update(L, s) {
    if (L.finished) return null;
    if (L.exam) return updateExam(L, s);
    if (!L.snap) begin(L, s);
    const st = step(L);
    const why = s.hit ? (s.d && s.d.score.failReason) || '부딪혔어요' : st.fail ? st.fail(s, L) : false;
    if (why) { restore(L, s); return { type: 'retry', reason: typeof why === 'string' ? why : null }; }
    if (!st.done(s, L)) return null;
    if (++L.i >= L.lesson.steps.length) { L.finished = true; return { type: 'finish' }; }
    begin(L, s);
    return { type: 'ok' };
  }

  // 시험 모드 한 프레임. s에 blink(-1|0|1)·hazard도 온다.
  // → null | {type:'deduct', items} | {type:'ok'[, items]} | {type:'finish'[, items]} (끝나면 finish 한 번, 이후 null)
  const HIT = '연석(검지선)에 닿았어요';
  function updateExam(L, s) {
    const ex = L.exam, pass = L.lesson.exam.pass;
    L.t += s.dt;
    if (s.blink === -1) L.sig.l = L.t;
    if (s.blink === 1) L.sig.r = L.t;
    if (!L.snap) begin(L, s);
    const st = step(L), n0 = ex.items.length;
    const evs = (s.hit ? [{ pts: 10, text: HIT, code: 'curb' }] : []).concat(st.check ? st.check(s, L) : []);
    for (const e of evs) {
      if (ex.end) break;
      if (e.dq) { ex.items.push({ t: L.t, pts: null, text: e.text, code: e.code }); ex.end = '실격 — ' + e.text; ex.dq = true; break; }
      ex.score -= e.pts; ex.items.push({ t: L.t, pts: e.pts, text: e.text, code: e.code });
      if (ex.score < pass) ex.end = '점수가 ' + pass + '점 아래로 내려가 시험이 중단됐어요';
    }
    const items = ex.items.slice(n0), tag = o => (items.length ? Object.assign(o, { items }) : o);
    if (ex.end) { L.finished = true; return tag({ type: 'finish' }); }
    if (!st.done(s, L)) return items.length ? { type: 'deduct', items } : null;
    if (++L.i >= L.lesson.steps.length) { ex.finished = L.finished = true; return tag({ type: 'finish' }); }
    begin(L, s);
    return tag({ type: 'ok' });
  }
  // PP_EXAM.result와 같은 모양
  function examResult(L) {
    const ex = L.exam;
    return { score: ex.score, passed: ex.finished && !ex.end && ex.score >= L.lesson.exam.pass, dq: ex.dq, end: ex.end, items: ex.items.slice() };
  }

  return { list, byId, register, step, create, update, examResult, NOGOAL };
})();
if (typeof module !== 'undefined') module.exports = PP_LESSONS;
