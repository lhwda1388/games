// 붕붕이 — 고속도로 주행 미션 7개. PP_MISSIONS.list에 group 'highway'로 붙는다(브라우저는 missions.js 다음에 로드).
// 차로 폭 3.6m, 본선 제한 100km/h·최저 50km/h, 도로는 모두 동쪽(a=0)으로 진행. 지명은 가상.
const PP_MISSIONS_HW = (function ppMissionsHw() {
  const R = typeof PP_ROADS !== 'undefined' ? PP_ROADS : require('./roads.js');
  if (typeof PP_RHW === 'undefined' && typeof require === 'function') require('./roads-highway.js');
  const M = typeof PP_MISSIONS !== 'undefined' ? PP_MISSIONS : require('./missions.js');
  const T = typeof PP_TRAFFIC !== 'undefined' ? PP_TRAFFIC : require('./traffic.js');
  const LIM = 100, VMAX = 110 / 3.6, SLOW = 80 / 3.6;
  const main = (net, lanes, length, o = {}) => R.highway(net, Object.assign({ id: 'm', x: 0, y: 0, a: 0, length, lanes, limit: LIM }, o));

  const list = [];
  const add = m => {
    const x = Object.assign({ group: 'highway', highway: true, limit: LIM, vMax: VMAX, timeOfDay: 'day', scripts: [], density: 'highway' }, m);
    list.push(x); M.list.push(x);
    return x;
  };

  add({ id: 'hw-merge', name: '본선 합류', seed: 801,
    tip: '램프에서 가속차로로 들어가면 본선 속도까지 올리세요. 왼쪽 깜빡이를 켜고 미러로 본선 간격을 본 뒤 60km/h 이상으로 합류해요. 가속차로 끝까지 가면 실패예요.',
    start: { laneId: 'on:ramp', s: 30 }, goal: { laneId: 'm:f2', s: 3300 },
    build() {
      const net = R.newNet(), m = main(net, 2, 4000);
      R.onRamp(net, { id: 'on', main: m, at: 600 });
      return net;
    } });

  add({ id: 'hw-exit', name: '출구 진출', seed: 802,
    tip: '"서울나들목에서 출구" 안내가 2km·1km·500m 앞에서 나와요. 미리 오른쪽 3차로로 옮기고, 감속차로에 들어간 뒤에 속도를 줄이세요. 출구를 놓치면 실패예요.',
    start: { laneId: 'm:f2', s: 300 }, goal: { laneId: 'ic:ramp', s: 200 },
    build() {
      const net = R.newNet(), m = main(net, 3, 4200);
      R.offRamp(net, { id: 'ic', main: m, at: 3300, name: '서울' });
      return net;
    } });

  add({ id: 'hw-jc', name: 'JC 분기', seed: 803,
    tip: '대전 방면은 대전분기점에서 오른쪽이에요. 녹색 표지판과 분홍색 유도선을 따라 3차로로 옮기세요. 분기 직전 300m 실선 구간에서는 차선을 바꾸면 안 돼요.',
    start: { laneId: 'm:f2', s: 300 }, goal: { laneId: 'jc:branch:f1', s: 600 },
    build() {
      const net = R.newNet(), m = main(net, 3, 3000);
      R.split(net, { id: 'jc', from: m, keepLanes: 2, branchLanes: 1, length: 700,
        names: { keep: '부산 방면', branch: '대전 방면', jc: '대전분기점' } });
      return net;
    } });

  // 하이패스 단말기 유무는 시드로 정한다(같은 시드면 늘 같음)
  const tollSeed = 804;
  add({ id: 'hw-toll', name: '톨게이트', seed: tollSeed, hipass: T.mulberry32({ s: tollSeed }) % 2 === 0,
    tip: '하이패스 단말기가 있으면 파란 하이패스 차로를 30km/h 이하로 지나가세요. 없으면 일반 차로 정지선에서 완전히 멈췄다가 출발해요. 단말기 없이 하이패스 차로로 가면 실패예요.',
    start: { laneId: 'm:f2', s: 40 }, goal: { laneId: 'tg:out:f2', s: 150 },
    build() {
      const net = R.newNet(), m = main(net, 2, 3000);
      R.tollPlaza(net, { id: 'tg', from: m });
      return net;
    } });

  add({ id: 'hw-pass', name: '추월차로', seed: 11, // 시드: 봇 기준 주행에 추월·복귀가 한 번 들어가도록 고름
    tip: '1차로는 추월할 때만 써요. 느린 차를 만나면 미러·깜빡이로 1차로에 나가 추월하고, 추월 뒤 20초 안에 2차로로 돌아오세요.',
    start: { laneId: 'm:f2', s: 40 }, goal: { laneId: 'm:f2', s: 3500 },
    scripts: [{ id: 'slow1', action: 'slow', spawn: { laneId: 'm:f2', s: 200, v: SLOW }, v: SLOW },
      { id: 'slow2', action: 'slow', spawn: { laneId: 'm:f2', s: 520, v: SLOW }, v: SLOW }],
    build() { const net = R.newNet(); main(net, 2, 3800); return net; } });

  const jamAt = { laneId: 'm:f2', s: 1500 };
  add({ id: 'hw-jam', name: '정체·사고', seed: 806, jamAt,
    tip: '"전방 정체 구간" 안내가 나오면 비상등을 켜고 속도를 줄이세요. 노면의 0m·50m·100m 표시로 앞차와 거리를 확인하고, 막힌 차로는 미러를 보고 옆 차로로 비켜 가세요.',
    start: { laneId: 'm:f2', s: 40 }, goal: { laneId: 'm:f2', s: 2900 },
    scripts: [{ id: 'jam', action: 'jam', at: jamAt, cars: 3, when: { lanes: ['m:f1', 'm:f2'], s: 40 } }],
    build() { const net = R.newNet(); main(net, 2, 3200, { gapCheck: 600 }); return net; } });

  add({ id: 'hw-rest', name: '휴게소', seed: 807,
    tip: '행담도휴게소 안내를 보고 감속차로로 나가세요. 진입로와 주차 구역은 30km/h 이하예요. 다시 본선으로 나갈 때는 합류처럼 가속차로에서 속도를 올리세요.',
    start: { laneId: 'm:f2', s: 40 }, goal: { laneId: 'm:f2', s: 3300 }, via: { laneId: 'ra:lot', s: 60 }, // 경유지: 휴게소 통과 구역
    build() {
      const net = R.newNet(), m = main(net, 2, 4000);
      R.restArea(net, { id: 'ra', main: m, at: 1200, name: '행담도' });
      return net;
    } });

  return { list };
})();
if (typeof module !== 'undefined') module.exports = PP_MISSIONS_HW;
