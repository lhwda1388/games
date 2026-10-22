// 붕붕이 — 도로주행시험식 코스 2개(가상). PP_MISSIONS.list에 group 'exam', exam: true로 붙는다(브라우저는 missions-highway.js 다음에 로드).
// 차로 폭 3.2m, 제한 50km/h, 어린이보호구역 30km/h. 교차로 간격 330m, 남북 팔 편도 2차로 130m, 모든 교차로 신호 + 횡단보도.
const PP_MISSIONS_EXAM = (function ppMissionsExam() {
  const R = typeof PP_ROADS !== 'undefined' ? PP_ROADS : require('./roads.js');
  const M = typeof PP_MISSIONS !== 'undefined' ? PP_MISSIONS : require('./missions.js');
  const W = 3.2, LIM = 50, SCHOOL = 30, VMAX = 60 / 3.6, GAP = 330;
  const H = M.half(2);
  const T2 = [['left', 'straight'], ['straight', 'right']];
  const T2S = [['straight'], ['straight', 'right']];
  const road = (net, o) => R.straightRoad(net, Object.assign({ lanesFwd: 2, lanesBack: 2, width: W, limit: LIM }, o));

  const list = [];
  const add = m => {
    const x = Object.assign({ group: 'exam', exam: true, limit: LIM, vMax: VMAX, timeOfDay: 'day', scripts: [], density: 'easy' }, m);
    list.push(x); M.list.push(x);
    return x;
  };

  // A코스: 동쪽 직진 w → J1 → l1(어린이보호구역 30) → J2 → l2 → J3 보호 좌회전 → 북쪽 팔 2차로 도착
  add({ id: 'exam-a', name: 'A코스', seed: 901,
    tip: '출발 전 왼쪽 깜빡이, 어린이보호구역 30km/h, 차로 변경 후 보호 좌회전, 도착하면 오른쪽 깜빡이를 켜고 세우세요. 브레이크는 짧게 나눠 밟으세요(꾹 누르면 급제동). 실제 시험과 다를 수 있어요.',
    start: { laneId: 'w:f2', s: 30 }, goal: { laneId: 'J3n:b2', s: 120 },
    build() {
      const net = R.newNet();
      const roads = [road(net, { id: 'w', x: -H - 300, y: 0, a: 0, length: 300, solidEnd: 30 }),
        road(net, { id: 'l1', x: H, y: 0, a: 0, length: GAP - 2 * H, limit: SCHOOL, solidEnd: 30, solidStart: 15 }),
        road(net, { id: 'l2', x: GAP + H, y: 0, a: 0, length: GAP - 2 * H, solidEnd: 30, solidStart: 15 }),
        road(net, { id: 'x', x: 2 * GAP + H, y: 0, a: 0, length: 150, solidStart: 15 })];
      // 도착 예상: 제한속도로 J1 ≈ 22초, J2 ≈ 60초(30km/h 구간), J3 ≈ 90초 / 신호 지키는 테스트 봇 J1 36·J2 80·J3 정지선 약 116초(앞차·보행자 대기 포함).
      // 직진 녹색 24초(주기 70)가 둘 다 덮게, J3 좌회전 녹색(13초, 주기 90)은 봇 도착 무렵 — 빨리 온 사람은 잠시 기다린다
      const plan = [['G', 18], ['G', 58], ['LG', 106]];
      for (let k = 0; k < 3; k++) {
        const cx = k * GAP, id = 'J' + (k + 1), last = k === 2;
        const nn = M.arm(net, id + 'n', cx, 0, 90, H, 130, 2, 2), ss = M.arm(net, id + 's', cx, 0, 270, H, 130, 2, 2);
        R.junction4(net, { id, x: cx, y: 0, arms: [{ road: roads[k], turns: last ? [['left'], ['straight', 'right']] : T2S },
          { road: roads[k + 1], turns: T2S }, { road: nn, turns: T2 }, { road: ss, turns: T2 }],
          signal: { cycle: last ? 90 : 70, protectedLeft: true }, crosswalks: true });
        const inLane = roads[k].fwd[plan[k][0] === 'LG' ? 0 : 1];
        M.align(net, id + ':sig', inLane, plan[k][0], plan[k][1]);
      }
      M.sign(net, 'w:f2', 20, 'limit', { limit: LIM, text: String(LIM) });
      M.sign(net, 'l1:f2', 8, 'school', { text: '어린이 보호구역' });
      M.sign(net, 'l1:f2', 16, 'limit', { limit: SCHOOL, text: String(SCHOOL) });
      M.sign(net, 'l2:f2', 10, 'limit', { limit: LIM, text: String(LIM) });
      return net;
    } });

  // B코스: 동쪽 w → J1 비보호 좌회전 → 북쪽 n1 → J2 우회전(전방 적색, 보행자) → 동쪽 팔 2차로 도착
  add({ id: 'exam-b', name: 'B코스', seed: 902,
    tip: '비보호 좌회전은 녹색에 마주 오는 차가 없을 때. 2차로로 옮긴 뒤, 전방 적색이면 우회전 전에 완전히 멈추고 보행자가 다 건너면 출발하세요. 브레이크는 짧게 나눠 밟으세요(꾹 누르면 급제동). 실제 시험과 다를 수 있어요.',
    start: { laneId: 'w:f1', s: 30 }, goal: { laneId: 'J2e:b2', s: 120 },
    closed: ['n1:f1', 'n1:f2'], // 북행 n1에는 AI 차를 넣지 않는다 — J2 적색 우회전 일시정지·보행자 장면을 앞차가 가리지 않게
    scripts: [{ id: 'peds', action: 'peds', crosswalk: 'J2:cw0', count: 3, when: { lanes: ['n1:f1', 'n1:f2'], s: 200 } }],
    build() {
      const net = R.newNet();
      const w = road(net, { id: 'w', x: -H - 300, y: 0, a: 0, length: 300, solidEnd: 30 });
      const n1 = road(net, { id: 'n1', x: 0, y: H, a: Math.PI / 2, length: GAP - 2 * H, solidEnd: 30, solidStart: 15 });
      R.junction4(net, { id: 'J1', x: 0, y: 0, arms: [{ road: w, turns: T2 }, { road: M.arm(net, 'J1e', 0, 0, 0, H, 200, 2, 2), turns: T2 },
        { road: n1, turns: T2 }, { road: M.arm(net, 'J1s', 0, 0, 270, H, 130, 2, 2), turns: T2 }],
        signal: { cycle: 70, protectedLeft: false }, crosswalks: true });
      R.junction4(net, { id: 'J2', x: 0, y: GAP, arms: [{ road: n1, turns: T2 }, { road: M.arm(net, 'J2n', 0, GAP, 90, H, 130, 2, 2), turns: T2 },
        { road: M.arm(net, 'J2e', 0, GAP, 0, H, 130, 2, 2), turns: T2 }, { road: M.arm(net, 'J2w', 0, GAP, 180, H, 130, 2, 2), turns: T2 }],
        signal: { cycle: 110, protectedLeft: true }, crosswalks: true });
      // J1: 도착(약 22초) 무렵 녹색 원형. J2: 동서 직진 녹색(= 북행 적색, n1 쪽 보행 신호)이 도착(약 50초) 전에 켜져 있다
      M.align(net, 'J1:sig', 'w:f1', 'G', 18);
      M.align(net, 'J2:sig', 'J2e:f1', 'G', 40);
      M.sign(net, 'w:f2', 20, 'limit', { limit: LIM, text: String(LIM) });
      return net;
    } });

  return { list };
})();
if (typeof module !== 'undefined') module.exports = PP_MISSIONS_EXAM;
