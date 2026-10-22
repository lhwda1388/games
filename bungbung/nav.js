// 붕붕이 — 내비: 차로 그래프 최단 경로, 안내 지점·한국식 문구·단계(시내 300/100/30m, 고속도로 2km/1km/500m/잠시 후), 차로 안내, 이탈·재탐색, 단속 카메라, 정체.
// route = { lanes, steps: [{laneId, s0, s1, via}], length, from, goal, said } — guide가 said에 발화 기록을 남긴다(경로마다 새로).
const PP_NAV = (function ppNav() {
  const R = typeof PP_ROADS !== 'undefined' ? PP_ROADS : require('./roads.js');
  const { laneLength, canChange, mapS, projectLane, wrap } = R;
  const CHANGE_COST = 25, BUS_COST = 200, STAGES = [300, 100, 30], CAM_STAGES = [500, 300];
  const DROP_COST = 200; // 합류 차로(차로 감소, kind 'merge')로 들어가는 경로 비용: 끝나기 전에 옆 차로로 옮기는 경로를 고른다
  const HW_STAGES = [2000, 1000, 500, 150], JAM_STAGES = [1000, 300]; // 고속도로 마지막 단계(150m)는 "잠시 후"
  const SIGN_RANGE = 2100; // 안내 지점 앞 이 거리 안의 머리 위 표지판에서 이름을 읽는다(가장 먼 안내판 2km)
  const JAM_SAY = '전방 정체 구간입니다. 비상등을 켜고 감속하세요';
  const TURN_NAME = { left: '좌회전', right: '우회전', uturn: '유턴' };
  const REROUTE_SAY = '경로를 이탈하여 재탐색합니다';

  // from 차로 s에서 to 차로로 바꿀 수 있는 가장 이른 위치(from 차로 s), 없으면 null
  function changeAt(net, from, to, s) {
    let best = null;
    for (const c of net.changes) {
      if (c.from !== from || c.to !== to || !c.allowed || c.s1 <= s + 1) continue;
      const x = Math.max(s, c.s0) + 1;
      if (x < c.s1 && (best === null || x < best)) best = x;
    }
    return best;
  }

  function route(net, fromLane, fromS, toLane, toS) {
    if (!net.lanes[fromLane] || !net.lanes[toLane]) return null;
    const best = {}, prev = {}, open = [{ id: fromLane, s: fromS, cost: 0 }];
    best[fromLane] = { cost: 0, s: fromS };
    let goal = null;
    while (open.length) {
      let k = 0;
      for (let i = 1; i < open.length; i++) if (open[i].cost < open[k].cost) k = i;
      const cur = open.splice(k, 1)[0];
      if (goal && cur.cost >= goal.cost) break;
      if (best[cur.id].cost < cur.cost) continue;
      const ln = net.lanes[cur.id], L = laneLength(ln);
      if (cur.id === toLane && cur.s <= toS + 1e-6) {
        const c = cur.cost + toS - cur.s;
        if (!goal || c < goal.cost) goal = { cost: c };
      }
      const relax = (id, s, cost, p) => {
        if (best[id] && best[id].cost <= cost) return;
        best[id] = { cost, s }; prev[id] = p;
        open.push({ id, s, cost });
      };
      for (const n of ln.next) relax(n, 0, cur.cost + L - cur.s + (net.lanes[n].kind === 'merge' ? DROP_COST : 0), { id: cur.id, via: 'next', x: L });
      for (const side of ['left', 'right']) {
        const to = ln[side];
        if (!to) continue;
        const x = changeAt(net, cur.id, to, cur.s);
        if (x === null) continue;
        const pen = CHANGE_COST + (net.lanes[to].kind === 'bus' ? BUS_COST : 0);
        relax(to, mapS(net, cur.id, to, x), cur.cost + x - cur.s + pen, { id: cur.id, via: 'change', x });
      }
    }
    if (!goal) return null;
    const lanes = [toLane], exits = [toS];
    for (let id = toLane; prev[id]; id = prev[id].id) { lanes.unshift(prev[id].id); exits.unshift(prev[id].x); }
    const steps = lanes.map((id, i) => ({ laneId: id, s0: i === 0 ? fromS : best[id].s, s1: exits[i], via: i === 0 ? 'start' : prev[id].via }));
    const length = steps.reduce((a, st) => a + st.s1 - st.s0, 0);
    return { lanes, steps, length, from: { laneId: fromLane, s: fromS }, goal: { laneId: toLane, s: toS }, said: {} };
  }

  const chain = (net, id) => { // 같은 방향 차로들(1차로→바깥)
    let x = id;
    while (net.lanes[x].left) x = net.lanes[x].left;
    const out = [];
    for (; x; x = net.lanes[x].right) out.push(x);
    return out;
  };
  function cum(route) {
    if (!route._cum) { let d = 0; route._cum = route.steps.map(st => { const c = d; d += st.s1 - st.s0; return c; }); }
    return route._cum;
  }
  // 경로상 거리. 경로 차로가 아니면 같은 도로의 옆 차로로 대응시킨다(아직 차선을 안 바꾼 경우).
  function routePos(net, route, laneId, s) {
    const C = cum(route), st = route.steps;
    let i = st.findIndex(x => x.laneId === laneId && s >= x.s0 - 1 && s <= x.s1 + 1); // 경유 경로는 같은 차로를 두 번 지날 수 있다
    if (i < 0) i = st.findIndex(x => x.laneId === laneId);
    if (i >= 0) return C[i] + s - st[i].s0;
    if (!net.lanes[laneId]) return null;
    const sib = chain(net, laneId);
    let bi = -1, bd = Infinity;
    st.forEach((x, j) => {
      if (!sib.includes(x.laneId)) return;
      const ms = mapS(net, laneId, x.laneId, s), d = ms < x.s0 ? x.s0 - ms : ms > x.s1 ? ms - x.s1 : 0;
      if (d < bd) { bd = d; bi = j; }
    });
    if (bi < 0) return null;
    return C[bi] + mapS(net, laneId, st[bi].laneId, s) - st[bi].s0;
  }

  const isMain = ln => ln && ln.kind === 'normal' && ln.minSpeed != null;
  // 경로 위치 [at - SIGN_RANGE, at] 안에 선 머리 위 표지판(dir 일치) 중 안내 지점에 가장 가까운 것
  function signNear(net, route, at, dir) {
    const C = cum(route);
    let best = null;
    for (const sg of net.signs) {
      if (sg.kind !== 'overhead' || sg.dir !== dir) continue;
      route.steps.forEach((x, i) => {
        const ln = net.lanes[x.laneId];
        if (ln.kind === 'connector') return;
        const p = projectLane(ln, sg.x, sg.y), pos = C[i] + p.s - x.s0;
        if (p.dist > 15 || Math.abs(wrap(sg.a - p.heading)) > PI4 || p.s < x.s0 - 1 || p.s > x.s1 + 1) return;
        if (pos > at + 1 || pos < at - SIGN_RANGE) return;
        if (!best || pos > best.pos) best = { sg, pos };
      });
    }
    return best ? best.sg : null;
  }
  const bare = t => (t || '').replace(/\s+/g, '');
  // 고속도로 안내 지점: 감속차로 진입(출구·휴게소), 분기(다른 도로로 갈라지는 next), 톨게이트 진입
  function hwManeuver(net, route, i, at) {
    const st = route.steps, x = st[i], ln = net.lanes[x.laneId], prevId = st[i - 1].laneId;
    if (ln.kind === 'decel' && x.via === 'change') {
      const rest = st.slice(i + 1, i + 4).some(y => net.lanes[y.laneId].kind === 'rest');
      const lanes = chain(net, prevId).filter(id => isMain(net.lanes[id])), sg = signNear(net, route, at, 'right');
      return { kind: rest ? 'rest' : 'exit', at, laneHint: { count: lanes.length, ok: [lanes.indexOf(prevId)] }, name: sg ? bare(sg.text) || null : null };
    }
    if (x.via !== 'next') return null;
    if (ln.kind === 'toll' && net.lanes[prevId].kind !== 'toll') {
      const hip = [];
      chain(net, x.laneId).forEach((id, j) => { if (net.lanes[id].toll === 'hipass') hip.push(j); });
      return { kind: 'toll', at, laneHint: null, name: null, hipass: hip };
    }
    if (!isMain(ln) || !isMain(net.lanes[prevId])) return null;
    const lanes = chain(net, prevId).filter(id => isMain(net.lanes[id])), ok = [], other = [];
    lanes.forEach((id, j) => {
      const roads = net.lanes[id].next.filter(n => isMain(net.lanes[n])).map(n => net.lanes[n].road);
      if (roads.includes(ln.road)) ok.push(j); else if (roads.length) other.push(j);
    });
    if (!other.length) return null;
    const right = Math.min(...ok) > Math.min(...other), sg = signNear(net, route, at, right ? 'right' : 'straight');
    const dir = sg ? (sg.text || '').replace(/\s*방면$/, '').trim() : '';
    return { kind: right ? 'jc-right' : 'jc-left', at, laneHint: { count: lanes.length, ok }, name: (sg && sg.jc) || null, dir: dir || null };
  }

  function maneuvers(net, route) {
    if (route._man) return route._man;
    const C = cum(route), st = route.steps, man = [];
    const hw = st.map((x, i) => (i > 0 ? hwManeuver(net, route, i, C[i]) : null));
    st.forEach((x, i) => {
      const ln = net.lanes[x.laneId];
      if (hw[i]) man.push(hw[i]);
      else if (ln.kind === 'connector' && TURN_NAME[ln.turn] && i > 0) {
        const outRoad = st[i + 1] ? net.lanes[st[i + 1].laneId].road : null, lanes = chain(net, st[i - 1].laneId);
        const ok = [];
        lanes.forEach((id, j) => {
          if (net.lanes[id].next.some(c => net.lanes[c].turn === ln.turn && (!outRoad || net.lanes[net.lanes[c].next[0]].road === outRoad))) ok.push(j);
        });
        man.push({ kind: ln.turn, at: C[i], laneHint: { count: lanes.length, ok } });
      } else if (x.via === 'change') {
        const prevId = st[i - 1].laneId;
        const nextTurn = st.slice(i + 1).find(y => net.lanes[y.laneId].kind === 'connector');
        const covered = nextTurn && TURN_NAME[net.lanes[nextTurn.laneId].turn] && net.lanes[net.lanes[nextTurn.laneId].from].road === ln.road;
        const j = hw.findIndex((h, k) => k > i && h && h.kind !== 'toll');
        const hwCovered = j > 0 && net.lanes[prevId].kind !== 'accel' && chain(net, st[j - 1].laneId).includes(x.laneId);
        const kind = net.lanes[prevId].left === x.laneId ? 'lane-left' : 'lane-right';
        // 차로 감소: 안내 지점 = 그 차로가 끝나는 곳(경로가 일찍 옮겨도 "○○m 앞 차로가 줄어듭니다")
        if (net.lanes[prevId].next.some(n => net.lanes[n].kind === 'merge')) man.push({ kind, at: C[i - 1] + laneLength(net.lanes[prevId]) - st[i - 1].s0, laneHint: null, drop: prevId });
        else if (!covered && !hwCovered) man.push({ kind, at: C[i], laneHint: null });
      }
    });
    man.sort((a, b) => a.at - b.at); // 차로 감소 안내만 뒤로 밀린다(나머지는 이미 순서대로)
    man.push({ kind: 'arrive', at: route.length, laneHint: null });
    return (route._man = man);
  }
  function cameras(net, route) {
    if (route._cam) return route._cam;
    const C = cum(route), out = [];
    for (const sg of net.signs) {
      if (sg.kind !== 'camera') continue;
      let best = null;
      route.steps.forEach((x, i) => {
        const ln = net.lanes[x.laneId];
        if (ln.kind === 'connector') return;
        const p = projectLane(ln, sg.x, sg.y);
        if (p.dist > 15 || Math.abs(wrap(sg.a - p.heading)) > PI4 || p.s < x.s0 - 1 || p.s > x.s1 + 1) return;
        if (!best || p.dist < best.dist) best = { dist: p.dist, at: C[i] + p.s - x.s0 };
      });
      if (best) out.push({ at: best.at, limit: sg.limit || null });
    }
    return (route._cam = out.sort((a, b) => a.at - b.at));
  }
  const PI4 = Math.PI / 4;
  const round10 = d => Math.max(10, Math.round(d / 10) * 10);
  const laneText = h => h.ok.map(i => i + 1).join(', ') + '차로';

  function hwPhrase(m, stage, dist) {
    const r = round10(dist), D = (r >= 1000 ? Math.round(dist / 100) / 10 + 'km' : r + 'm') + ' 앞 ', soon = stage === 150;
    const RIGHT = stage <= 1000 ? '. 오른쪽 차로를 이용하세요' : '';
    switch (m.kind) {
      case 'arrive': return stage === 500 ? D + '목적지입니다' : null;
      case 'lane-left': case 'lane-right': {
        const side = m.kind === 'lane-left' ? '왼쪽' : '오른쪽';
        return soon ? `${side} 차로로 이동하세요` : `${D}${side} 차로로 이동하세요`;
      }
      case 'exit': return soon ? '잠시 후 출구입니다' : `${D}${m.name ? m.name + '에서 ' : ''}출구입니다${RIGHT}`;
      case 'rest': return soon ? '잠시 후 휴게소 입구입니다' : `${D}${m.name || '휴게소'} 입구입니다${RIGHT}`;
      case 'toll': return soon ? '잠시 후 톨게이트입니다'
        : `${D}톨게이트입니다` + (stage === 500 && m.hipass.length ? `. 하이패스 차량은 ${m.hipass.map(i => i + 1).join(', ')}차로를 이용하세요` : '');
      default: { // jc-left | jc-right
        const way = `${m.dir ? m.dir + ' 방면 ' : ''}${m.kind === 'jc-right' ? '오른쪽' : '왼쪽'} 방향입니다`;
        return soon ? `잠시 후 ${way}` : `${D}${m.name ? m.name + '에서 ' : ''}${way}`;
      }
    }
  }
  function phrase(m, stage, dist) {
    const D = round10(dist) + 'm 앞 ';
    if (m.kind === 'arrive') return stage === 100 ? D + '목적지입니다' : null;
    if (m.kind === 'lane-left' || m.kind === 'lane-right') {
      const side = m.kind === 'lane-left' ? '왼쪽' : '오른쪽', drop = m.drop ? '차로가 줄어듭니다. ' : '';
      return stage === 30 ? `${drop}${side} 차로로 이동하세요` : `${D}${drop}${side} 차로로 이동하세요`;
    }
    const name = TURN_NAME[m.kind];
    if (stage === 30) return `잠시 후 ${name}입니다`;
    const h = m.laneHint, sub = h && h.ok.length && h.ok.length < h.count;
    return stage === 100 && sub ? `${D}${name}, ${laneText(h)}를 이용하세요` : `${D}${name}입니다`;
  }
  // 단계 문턱을 처음 넘을 때 한 번만 말한다(여러 문턱을 한꺼번에 넘으면 가장 가까운 것만).
  function stageSay(route, key, stages, dist, make) {
    let b = null;
    for (const x of stages) if (dist <= x) b = x;
    const prev = route.said[key] != null ? route.said[key] : Infinity;
    if (b === null || b >= prev) return null;
    route.said[key] = b;
    return make(b);
  }

  const isHw = (net, route) => {
    if (route._hw == null) route._hw = route.lanes.some(id => net.lanes[id].minSpeed != null || net.lanes[id].kind === 'accel' || net.lanes[id].kind === 'decel');
    return route._hw;
  };
  // opts(선택, 미션 객체를 그대로 넘겨도 됨): { highway: 고속도로 단계 강제, jamAt: { laneId, s } 정체 안내 지점 }
  function guide(net, route, laneId, s, opts) {
    opts = opts || {};
    const ln = net.lanes[laneId], limit = ln ? ln.limit : null, hw = !!opts.highway || isHw(net, route);
    const pos = routePos(net, route, laneId, s);
    if (pos === null) return { next: null, say: null, limit, camera: null };
    const man = maneuvers(net, route);
    const mi = man.findIndex(m => m.kind === 'arrive' || m.at > pos - 0.5);
    const m = man[mi], dist = Math.max(0, m.at - pos);
    let say = null;
    if (m.kind === 'arrive' && dist <= 10) {
      if (!route.said.arrive) { route.said.arrive = 1; say = '목적지에 도착했습니다'; }
    } else if (m.drop && laneId !== m.drop) say = null; // 이미 옮겼으면 차로 감소 안내는 그만
    else say = hw ? stageSay(route, 'm' + mi, HW_STAGES, dist, b => hwPhrase(m, b, dist))
      : stageSay(route, 'm' + mi, STAGES, dist, b => phrase(m, b, dist));
    if (opts.jamAt && !say) {
      const jp = routePos(net, route, opts.jamAt.laneId, opts.jamAt.s);
      if (jp !== null && jp > pos) say = stageSay(route, 'jam', JAM_STAGES, jp - pos, () => JAM_SAY);
    }
    const cams = cameras(net, route), ci = cams.findIndex(c => c.at > pos), cam = ci >= 0 && cams[ci].at - pos <= 600 ? cams[ci] : null;
    if (cam && !say) {
      const cd = cam.at - pos, lim = cam.limit ? ` 제한속도 ${cam.limit}km입니다` : '';
      say = stageSay(route, 'c' + ci, CAM_STAGES, cd, b => (b === 500 ? `${round10(cd)}m 앞 과속 단속 카메라가 있습니다.` : '전방에 과속 단속 카메라가 있습니다.') + lim);
    }
    return { next: { kind: m.kind, dist, laneHint: m.laneHint, name: m.name || null }, say, limit, camera: cam ? { dist: cam.at - pos, limit: cam.limit } : null };
  }

  // 경로 차로가 아니고, 같은 도로의 경로 차로로 (허용 구간에서) 돌아갈 수도 없으면 이탈
  function offRoute(net, route, laneId, s = 0) {
    const mine = route.steps.filter(x => x.laneId === laneId); // 경유 경로는 같은 차로가 두 번: 그때만 구간까지 본다
    if (mine.length === 1 || mine.some(x => s >= x.s0 - 1 && s <= x.s1 + 1)) return false;
    if (!net.lanes[laneId]) return true;
    // 톨게이트: 부스·접근 차로는 단말기 종류로 고르므로 같은 광장의 어느 부스든 경로 위
    const plaza = route.steps.map(x => net.lanes[x.laneId]).find(l => l.kind === 'toll'), ln = net.lanes[laneId];
    const inPlaza = id => net.lanes[id].kind === 'toll' && net.lanes[id].road === plaza.road;
    if (plaza && (inPlaza(laneId) || ln.next.some(inPlaza))) return false;
    for (const side of ['left', 'right']) {
      let id = laneId, ps = s;
      for (let to = net.lanes[id][side]; to; to = net.lanes[id][side]) {
        const x = changeAt(net, id, to, ps);
        if (x === null) break;
        ps = mapS(net, id, to, x); id = to;
        const st = route.steps.find(y => y.laneId === id);
        if (st && ps <= st.s1) return false;
      }
    }
    return true;
  }
  // 경유지 via = { laneId, s }를 지나는 경로: 두 구간을 경유 차로 단계에서 하나로 잇는다
  function routeVia(net, fromLane, fromS, via, toLane, toS) {
    const a = route(net, fromLane, fromS, via.laneId, via.s), b = a && route(net, via.laneId, via.s, toLane, toS);
    if (!b) return null;
    const last = a.steps[a.steps.length - 1];
    const steps = a.steps.slice(0, -1).concat([Object.assign({}, b.steps[0], { s0: last.s0, via: last.via })], b.steps.slice(1));
    return { lanes: a.lanes.slice(0, -1).concat(b.lanes), steps, length: a.length + b.length, from: a.from, goal: b.goal, said: {} };
  }
  const reroute = (net, old, laneId, s) => route(net, laneId, s, old.goal.laneId, old.goal.s);

  return { REROUTE_SAY, route, routeVia, routePos, guide, offRoute, reroute, maneuvers };
})();
if (typeof module !== 'undefined') module.exports = PP_NAV;
