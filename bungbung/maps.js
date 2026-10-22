// 붕붕이 — 주차 맵 데이터. 치수는 한국 주차장 기준(일반 칸 2.3×5.0m). 박스 = {x,y,l,w,a}.
const PP_MAPS = (function ppMaps() {
  const C = typeof PP_CAR !== 'undefined' ? PP_CAR : require('./car.js');
  const PI = Math.PI, D2R = PI / 180;
  const CAR_L = 4.6, CAR_W = 1.85;  // 주차된 차

  const box = (x, y, l, w, a = 0, kind = 'wall', o = {}) => Object.assign({ x, y, l, w, a, kind }, o);
  function seg(x1, y1, x2, y2, t = 0.3, kind = 'wall', o) {
    return box((x1 + x2) / 2, (y1 + y2) / 2, Math.hypot(x2 - x1, y2 - y1) + t, t, Math.atan2(y2 - y1, x2 - x1), kind, o);
  }
  const poly = (pts, t, kind, o) => pts.slice(1).map((p, i) => seg(pts[i][0], pts[i][1], p[0], p[1], t, kind, o));
  const car = (x, y, a, o) => box(x, y, CAR_L, CAR_W, a, 'car', o);
  const pillar = (x, y, s = 0.6, kind = 'pillar') => box(x, y, s, s, 0, kind);
  // 한 줄 주차칸. (x,y) = 첫 칸 중심, a = 앞으로 들어가는 방향, row = 칸이 늘어서는 방향
  function slotRow({ x, y, a, n, w = 2.3, l = 5.0, row = 0 }) {
    const step = w / Math.abs(Math.sin(a - row)), rx = Math.cos(row), ry = Math.sin(row), fx = Math.cos(a), fy = Math.sin(a);
    const slots = [], lines = [];
    for (let i = 0; i < n; i++) slots.push({ x: x + rx * step * i, y: y + ry * step * i, l, w, a });
    for (let i = 0; i <= n; i++) {
      const cx = x + rx * step * (i - 0.5), cy = y + ry * step * (i - 0.5);
      lines.push([cx - fx * l / 2, cy - fy * l / 2, cx + fx * l / 2, cy + fy * l / 2]);
    }
    return { slots, lines };
  }
  const parkRow = (row, skip = []) => row.slots.filter((_, i) => !skip.includes(i)).map(s => car(s.x, s.y, s.a));
  const slotGoal = (s, face, tolDeg = 8) => Object.assign({ type: 'slot', face, tolA: tolDeg * D2R }, s);
  const zone = (x, y, l, w, o = {}) => Object.assign({ type: 'zone', x, y, l, w, a: 0 }, o);

  // 지하주차장 공통: 통로 y∈[0,aisle], 칸 줄 y∈[aisle, aisle+5], 칸 9개(x=-9.2..9.2), 기둥은 칸 앞선에 3칸마다
  function garage(aisle) {
    const row = slotRow({ x: -9.2, y: aisle + 2.5, a: PI / 2, n: 9 });
    const back = aisle + 5.15;
    const obstacles = [
      seg(-12, -0.15, 12, -0.15), seg(-12, back, 12, back), seg(-12, -0.15, -12, back), seg(12, -0.15, 12, back),
      pillar(-8.05, aisle), pillar(-1.15, aisle), pillar(5.75, aisle),
    ];
    return { row, obstacles, bounds: { x0: -12, y0: -0.3, x1: 12, y1: back + 0.2 } };
  }

  const list = [];
  const add = m => list.push(Object.assign({ env: 'indoor', lines: [], floors: [], ramps: [], par: 2 }, m));

  // ── 아파트·빌라 ──
  {
    const g = garage(5.5);
    add({ id: 'apt-pillar', group: 'apt', name: '지하주차장 기둥 사이 후진 주차', tip: '기둥이 칸 앞 모서리에 튀어나와 있어요. 기둥을 지난 뒤 핸들을 꺾으세요.',
      start: { x: -8, y: 2.75, th: 0 }, obstacles: g.obstacles.concat(parkRow(g.row, [4])), lines: g.row.lines,
      goal: slotGoal(g.row.slots[4], 'out'), par: 3, bounds: g.bounds });
  }
  {
    const g = garage(5.5);
    add({ id: 'apt-exit', group: 'apt', name: '좁은 칸에서 빼기', tip: '전면 주차된 차를 후진으로 빼요. 앞 모서리가 옆 차를 스치지 않게 천천히.',
      start: { cx: 0.1, cy: 8, th: PI / 2 } /* 왼쪽 기둥(x≤-0.85)을 5cm 비켜 똑바로 후진 가능 */, obstacles: g.obstacles.concat(parkRow(g.row, [4])), lines: g.row.lines,
      goal: zone(8.5, 2.75, 6, 5.5), par: 2, bounds: g.bounds });
  }
  {
    const row = slotRow({ x: -4.6, y: 7.0, a: PI / 2, n: 5 });
    add({ id: 'apt-piloti', group: 'apt', name: '빌라 필로티 주차', tip: '통로가 4.5m뿐이에요. 칸을 지나쳐서 크게 돌기보다 미리 바깥쪽에 붙어 들어가세요.',
      env: 'outdoor', start: { x: -12, y: 2.25, th: 0 },
      obstacles: [
        seg(-15, -0.15, 15, -0.15), seg(-15, -0.15, -15, 4.65), seg(15, -0.15, 15, 4.65),
        seg(-15, 4.65, -5.9, 4.65), seg(5.9, 4.65, 15, 4.65),
        seg(-5.9, 4.5, -5.9, 9.65), seg(5.9, 4.5, 5.9, 9.65), seg(-5.9, 9.65, 5.9, 9.65),
        pillar(-3.45, 4.5, 0.5), pillar(1.15, 4.5, 0.5), pillar(3.45, 9.25, 0.5),
        box(-4.6, 8.5, 2.0, 0.8, PI / 2, 'bike'),
      ].concat(parkRow(row, [0, 1, 4])),
      lines: row.lines, goal: slotGoal(row.slots[1], 'any'), par: 3, bounds: { x0: -15, y0: -0.3, x1: 15, y1: 9.8 } });
  }
  {
    const g = garage(6.0);
    add({ id: 'apt-double', group: 'apt', name: '이중주차 옆으로 빠져나가기', tip: '앞을 막은 두 차 사이 3m 틈으로 나가요. 틈을 빠져나온 뒤 꺾어야 뒷바퀴가 안 걸려요.',
      start: { cx: 0, cy: 8.5, th: -PI / 2 }, obstacles: g.obstacles.concat(parkRow(g.row, [4]), [car(-3.8, 4.7, 0), car(3.8, 4.7, 0)]),
      lines: g.row.lines, goal: zone(9.5, 2.0, 5, 4.0), par: 2, bounds: g.bounds });
  }
  {
    const Z = { z: -4, h: 6.5 };
    add({ id: 'apt-ramp', group: 'apt', name: '나선형 경사로 내려갔다 올라오기', tip: '내리막은 브레이크로 속도를 조절하고, 오르막에서는 브레이크를 떼면 밀려요.',
      start: { x: -9, y: 0, th: 0 },
      obstacles: [
        seg(-14, -6, 0, -6, 0.3, 'wall', Z), seg(-14, -6, -14, 18, 0.3, 'wall', Z), seg(-14, 6.25, 0, 6.25, 0.5, 'wall', Z), seg(-14, 18, 0, 18, 0.3, 'wall', Z),
        seg(0, -6, 0, -1.8, 0.3, 'wall', Z), seg(0, 1.8, 0, 6.25, 0.3, 'wall', Z), seg(0, 6.25, 0, 10.2, 0.3, 'wall', Z), seg(0, 13.8, 0, 18, 0.3, 'wall', Z),
        seg(0, -1.8, 20, -1.8, 0.3, 'wall', Z), seg(0, 1.8, 20, 1.8, 0.3, 'wall', Z), seg(0, 10.2, 20, 10.2, 0.3, 'wall', Z), seg(0, 13.8, 20, 13.8, 0.3, 'wall', Z),
        box(10, 6, 20, 7.8, 0, 'wall', Z),
        seg(20, -1.8, 30, -1.8, 0.3, 'wall', Z), seg(30, -1.8, 30, 13.8, 0.3, 'wall', Z), seg(20, 13.8, 30, 13.8, 0.3, 'wall', Z),
        box(21.75, 6, 3.5, 7, 0, 'wall', Z),
      ],
      floors: [{ x: -7, y: 0, l: 14, w: 12, a: 0, z: 0 }, { x: 25, y: 6, l: 10, w: 15.6, a: 0, z: -2 }, { x: -7, y: 12.25, l: 14, w: 11.5, a: 0, z: -4 }],
      ramps: [{ x: 10, y: 0, l: 20, w: 3.6, a: 0, z0: 0, z1: -2 }, { x: 10, y: 12, l: 20, w: 3.6, a: 0, z0: -4, z1: -2 }],
      via: zone(-7, 12, 8, 7), goal: zone(-7, 0, 8, 7), par: 4, bounds: { x0: -14, y0: -6, x1: 30, y1: 18 } });
  }
  {
    // 단지 도로 y∈[0,6.5], 방지턱 3개(폭 3.6m·높이 0.1m = 짧은 ramp 쌍 + 꼭대기), 끝에 지상 주차칸
    const row = slotRow({ x: 6.15, y: 9.0, a: PI / 2, n: 6 });
    const bx = [-18, -9, 0];
    add({ id: 'apt-bump', group: 'apt', name: '단지 과속방지턱 지나 주차', tip: '방지턱을 10km/h 넘게 넘으면 접촉으로 쳐요. 방지턱 앞에서 브레이크로 속도를 줄이세요.',
      env: 'outdoor', start: { x: -26, y: 1.6, th: 0 },
      obstacles: [
        seg(-30, -0.15, 20, -0.15, 0.3, 'curb', { h: 0.15 }), seg(-30, 6.65, 4.7, 6.65, 0.3, 'curb', { h: 0.15 }),
        seg(-30, -0.15, -30, 6.65), seg(4.7, 6.65, 4.7, 11.65), seg(4.7, 11.65, 20, 11.65), seg(20, -0.15, 20, 11.65),
      ].concat(parkRow(row, [3])),
      // 오르막 1.6m + 평평한 꼭대기 0.4m(floor, 경계 부동소수 틈 없게 살짝 겹침) + 내리막 1.6m
      ramps: bx.flatMap(x => [{ x: x - 1.0, y: 3.25, l: 1.6, w: 6.5, a: 0, z0: 0, z1: 0.1, bump: true }, { x: x + 1.0, y: 3.25, l: 1.6, w: 6.5, a: 0, z0: 0.1, z1: 0, bump: true }]),
      floors: bx.map(x => ({ x, y: 3.25, l: 0.42, w: 6.5, a: 0, z: 0.1 })),
      bumps: bx.map(x => ({ x, y: 3.25, l: 3.6, w: 6.5, a: 0 })),
      lines: row.lines, goal: slotGoal(row.slots[3], 'in'), par: 2, bounds: { x0: -30, y0: -0.3, x1: 20, y1: 11.8 } });
  }

  // ── 상가·마트·공영 ──
  {
    const lower = slotRow({ x: -12.65, y: -2.5, a: -PI / 2, n: 12 });
    const upper = slotRow({ x: -12.65, y: 8, a: PI / 2, n: 12 });
    add({ id: 'mall-mart', group: 'mall', name: '마트 주차장', tip: '양쪽에 차가 빽빽해요. 들어갈 칸 반대편으로 붙었다가 꺾으면 여유가 생겨요.',
      env: 'outdoor', start: { x: -12, y: 2.75, th: 0 },
      obstacles: [seg(-14.5, -5.15, 14.5, -5.15), seg(-14.5, 10.65, 14.5, 10.65), seg(-14.5, -5.15, -14.5, 10.65), seg(14.5, -5.15, 14.5, 10.65),
        box(-5.75, -1.5, 3, 1.2, PI / 2, 'cart')].concat(parkRow(lower, [3, 9]), parkRow(upper, [7])),
      lines: lower.lines.concat(upper.lines), goal: slotGoal(upper.slots[7], 'any'), par: 2, bounds: { x0: -14.5, y0: -5.3, x1: 14.5, y1: 10.8 } });
  }
  {
    const row = slotRow({ x: -9.3, y: 6.74, a: 60 * D2R, n: 8 });
    add({ id: 'mall-angle', group: 'mall', name: '공영주차장 사선 주차', tip: '일방통행이에요. 사선 칸은 칸 입구를 지나기 직전에 꺾기 시작하면 돼요.',
      env: 'outdoor', start: { x: -11.5, y: 2, th: 0 },
      obstacles: [seg(-13, -0.15, 13, -0.15), seg(-13, 9.65, 13, 9.65), seg(-13, -0.15, -13, 9.65), seg(13, -0.15, 13, 9.65)].concat(parkRow(row, [4])),
      lines: row.lines, goal: slotGoal(row.slots[4], 'in'), par: 2, bounds: { x0: -13, y0: -0.3, x1: 13, y1: 9.8 } });
  }
  add({ id: 'mall-kiosk', group: 'mall', name: '출구 정산기에 붙이기', tip: '운전석 창문이 정산기 바로 옆에 오게, 차 왼쪽을 30cm 안쪽으로 붙이세요.',
    start: { x: -17, y: 4.5, th: 0 },
    obstacles: [seg(-20, -0.15, 10, -0.15, 0.3, 'curb', { h: 0.15 }), seg(-20, 8.15, -6, 8.15), seg(-6, 8.15, -6, 4.2), seg(-20, -0.15, -20, 8.15),
      box(0, 3.6, 12, 1.2, 0, 'curb', { h: 0.15 }), box(-0.5, 3.35, 0.5, 0.5, 0, 'kiosk', { h: 1.4 }), box(3, 1.5, 0.1, 3, 0, 'bar', { h: 0.1, z: 0.9 })],
    goal: { type: 'beside', x: -0.5, y: 3.0, a: 0, side: 'left', gapMin: 0.15, gapMax: 0.5, alongTol: 0.6, anchor: 'driver', tolA: 6 * D2R },
    par: 1, bounds: { x0: -20, y0: -0.3, x1: 10, y1: 8.3 } });

  // ── 골목·노상 ──
  const parallel = (id, name, tip, ramps) => add({ id, group: 'street', name, tip, env: 'outdoor', start: { x: -14, y: 3.6, th: 0 },
    obstacles: [box(0, -0.15, 40, 0.3, 0, 'curb', { h: 0.15 }), seg(-20, 7.65, 20, 7.65), seg(-20, -0.3, -20, 7.65), seg(20, -0.3, 20, 7.65),
      car(-11, 1, 0), car(-5.3, 1, 0), car(5.3, 1, 0), car(-6, 6.5, PI), car(2, 6.5, PI)],
    goal: slotGoal({ x: 0, y: 1.1, l: 6.0, w: 2.2, a: 0 }, 'in'), ramps, par: 3, bounds: { x0: -20, y0: -0.3, x1: 20, y1: 7.8 } });
  parallel('street-parallel', '골목 평행 주차', '앞차와 나란히 선 뒤, 뒷바퀴가 앞차 뒤 범퍼를 지날 때 핸들을 끝까지 꺾어요.', []);
  add({ id: 'street-corner', group: 'street', name: '좁은 골목 직각 회전', tip: '골목 폭이 3m예요. 모퉁이 전에 바깥쪽에 붙고, 한 번에 안 되면 후진해서 다시 꺾어도 돼요.',
    env: 'outdoor', start: { x: -16, y: 0, th: 0 },
    obstacles: [
      ...poly([[-20, -1.65], [20.15, -1.65], [20.15, 15.0], [21.65, 16.35], [35, 16.35]], 0.3, 'wall', { h: 2 }),
      ...poly([[-20, 1.65], [14.8, 1.65], [16.35, 3.2], [16.35, 19.65], [35, 19.65]], 0.3, 'wall', { h: 2 }),
      seg(-20, -1.65, -20, 1.65, 0.3, 'wall', { h: 2 }), seg(35, 16.35, 35, 19.65, 0.3, 'wall', { h: 2 }),
      pillar(10, 1.3, 0.35, 'pole'), pillar(19.7, 8, 0.35, 'pole'),
    ],
    goal: zone(30, 18, 6, 3.0), par: 4, bounds: { x0: -20, y0: -1.8, x1: 35, y1: 19.8 } });
  add({ id: 'street-uturn', group: 'street', name: '막다른 길에서 차 돌리기', tip: '3점 회전: 오른쪽에 붙어 왼쪽 끝까지 꺾고 전진 → 반대로 꺾고 후진 → 다시 전진.',
    env: 'outdoor', start: { x: -16, y: -1.6, th: 0 },
    obstacles: [seg(-25, -3.4, 0, -3.4), seg(-25, 3.4, 0, 3.4), seg(0, -3.4, 0, 3.4), seg(-25, -3.4, -25, 3.4)],
    goal: zone(-14, 0, 8, 6.5, { th: PI, tolA: 20 * D2R }), par: 2, bounds: { x0: -25, y0: -3.5, x1: 0.2, y1: 3.5 } });
  parallel('street-slope', '경사진 골목 평행 주차', '8도 오르막이에요. 후진할 때 브레이크를 떼면 뒤로 밀려 내려가니 브레이크로 속도를 조절하세요.',
    [{ x: 0, y: 3.5, l: 40, w: 12, a: 0, z0: -2.81, z1: 2.81 }]);
  {
    // 15% 오르막(x∈[-10,20]) 중간 정지선에서 출발. 뒤 1m에 주차된 차. 15%: 셀토스 크리핑(1.2m/s²)으로는 못 버텨 D에서도 밀린다.
    const curb = y => poly([[-20, y], [-10, y], [20, y], [35, y]], 0.3, 'curb', { h: 0.15 }); // 경사 꺾이는 곳마다 끊어 바닥을 따라가게
    add({ id: 'street-hill-start', group: 'street', name: '언덕길 정지선에서 출발', tip: '15% 오르막이에요. 브레이크를 떼면 뒤로 밀려 뒤차에 닿아요. 브레이크에서 엑셀로 빠르게 옮기세요.',
      env: 'outdoor', start: { x: -2, y: -1.6, th: 0 },
      obstacles: [...curb(-3.4), ...curb(3.4), seg(-20, -3.4, -20, 3.4), seg(35, -3.4, 35, 3.4), car(-6.16, -1.6, 0), car(10, 1.6, PI)],
      ramps: [{ x: 5, y: 0, l: 30, w: 7, a: 0, z0: 0, z1: 4.5 }], floors: [{ x: 27.5, y: 0, l: 15, w: 7, a: 0, z: 4.5 }],
      lines: [[1.9, -3.25, 1.9, 0]], goal: zone(28, -1.6, 8, 3.2), par: 1, bounds: { x0: -20, y0: -3.6, x1: 35, y1: 3.6 } });
  }
  {
    // 칸 쪽(+y)으로 7% 내리막. 후진하면 중력이 차를 칸 안으로 끈다
    const row = slotRow({ x: -9.2, y: 8.5, a: PI / 2, n: 9 });
    // 선 하나는 중간 높이로 평평하게 그려지므로 1m씩 끊어 경사를 따라가게
    const lines = row.lines.flatMap(([x1, y1, x2, y2]) => [0, 1, 2, 3, 4].map(i => [x1 + (x2 - x1) * i / 5, y1 + (y2 - y1) * i / 5, x1 + (x2 - x1) * (i + 1) / 5, y1 + (y2 - y1) * (i + 1) / 5]));
    add({ id: 'street-slope-reverse', group: 'street', name: '내리막 칸에 후진 주차', tip: '칸 쪽이 7% 내리막이라 후진하면 저절로 빨라져요. 브레이크로 속도를 누르며 들어가세요.',
      env: 'outdoor', start: { x: -8, y: 3, th: 0 },
      obstacles: [seg(-12, -0.15, 12, -0.15), seg(-12, 11.15, 12, 11.15), seg(-12, -0.15, -12, 11.15), seg(12, -0.15, 12, 11.15)].concat(parkRow(row, [4])),
      ramps: [{ x: 0, y: 5.5, l: 12, w: 26, a: PI / 2, z0: 0.42, z1: -0.42 }],
      lines, goal: slotGoal(row.slots[4], 'out'), par: 3, bounds: { x0: -12, y0: -0.3, x1: 12, y1: 11.3 } });
  }

  // ── 특수 상황 ──
  add({ id: 'special-tower', group: 'special', name: '기계식 주차 진입', tip: '팔레트 폭이 2.0m로 양쪽 여유가 10cm예요. 입구 전에 차를 똑바로 맞추고 들어가세요.',
    start: { x: -11, y: -3, th: 0 },
    obstacles: [seg(-14, -6, 0, -6), seg(-14, 6, 0, 6), seg(-14, -6, -14, 6), seg(0, -6, 0, -1.45), seg(0, 1.45, 0, 6),
      seg(0, -1.45, 6, -1.45), seg(0, 1.45, 6, 1.45), seg(6, -1.45, 6, 1.45),
      box(2.8, -1.05, 5.2, 0.1, 0, 'rail', { h: 0.12 }), box(2.8, 1.05, 5.2, 0.1, 0, 'rail', { h: 0.12 }), box(5.6, 0, 0.15, 1.6, 0, 'stop', { h: 0.12 })],
    goal: slotGoal({ x: 2.8, y: 0, l: 5.2, w: 2.0, a: 0 }, 'in', 3), par: 2, bounds: { x0: -14, y0: -6, x1: 6, y1: 6 } });
  add({ id: 'special-drivethru', group: 'special', name: '드라이브스루', tip: '건물 모퉁이를 돌 때 넓게 돌고, 주문창 앞에서는 차 왼쪽을 붙이세요.',
    env: 'outdoor', start: { x: -18, y: 1.5, th: 0 },
    obstacles: [box(-5, 9, 20, 12, 0, 'building', { h: 4 }),
      ...poly([[-20, -0.15], [3.5, -0.15], [7.5, 0.9], [10.25, 3.7], [10.25, 6.5], [8.35, 8.0], [8.35, 17]], 0.3, 'curb', { h: 0.15 }),
      seg(-20, -0.15, -20, 3), seg(5, 17, 8.35, 17)],
    goal: { type: 'beside', x: 5, y: 9, a: PI / 2, side: 'left', gapMin: 0.2, gapMax: 0.6, alongTol: 0.5, anchor: 'driver', tolA: 8 * D2R },
    par: 1, bounds: { x0: -20, y0: -0.3, x1: 10.5, y1: 17.2 } });
  add({ id: 'special-fuel', group: 'special', name: '주유소', tip: '주유구가 있는 쪽을 주유기에 맞추세요. 셀토스 주유구 방향은 설정의 차량 사양을 따릅니다.',
    env: 'outdoor', start: { x: -15, y: -3, th: 0 },
    obstacles: [seg(-20, -7, 20, -7), seg(-20, 10, 20, 10), seg(-20, -7, -20, 10), seg(20, -7, 20, 10),
      box(0, 3.6, 6, 1.2, 0, 'curb', { h: 0.2 }), box(0, 3.6, 0.9, 0.6, 0, 'pump', { h: 1.8 }), pillar(-4, 3.6, 0.5), pillar(4, 3.6, 0.5)],
    goal: { type: 'beside', x: 0, y: 3.0, a: 0, side: 'fuel', gapMin: 0.3, gapMax: 0.9, alongTol: 0.8, anchor: 'fuel', tolA: 8 * D2R },
    par: 1, bounds: { x0: -20, y0: -7, x1: 20, y1: 10 } });

  function inBox(b, x, y) {
    const dx = x - b.x, dy = y - b.y, c = Math.cos(b.a), s = Math.sin(b.a);
    const u = c * dx + s * dy, v = -s * dx + c * dy;
    return Math.abs(u) <= b.l / 2 && Math.abs(v) <= b.w / 2 ? u : null;
  }
  function heightAt(map, x, y) {
    for (const r of map.ramps) { const u = inBox(r, x, y); if (u != null) return r.z0 + (r.z1 - r.z0) * (u + r.l / 2) / r.l; }
    for (const f of map.floors) if (inBox(f, x, y) != null) return f.z;
    return 0;
  }

  // 시작 자세: {x,y,th}(뒷축) 또는 {cx,cy,th}(차체 중심) → 해당 차종의 뒷축 자세
  function startPose(map, spec) {
    const s = map.start;
    return s.cx != null ? C.poseFromCenter(s.cx, s.cy, s.th, spec) : { x: s.x, y: s.y, th: s.th };
  }

  const GROUPS = [{ id: 'apt', name: '아파트·빌라' }, { id: 'mall', name: '상가·마트·공영' }, { id: 'street', name: '골목·노상' }, { id: 'special', name: '특수 상황' }];
  const byId = id => list.find(m => m.id === id);
  return { GROUPS, list, byId, heightAt, startPose };
})();
if (typeof module !== 'undefined') module.exports = PP_MAPS;
