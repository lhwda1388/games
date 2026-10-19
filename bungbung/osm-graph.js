// 붕붕이 — 실제 지도: Overpass JSON → 투영 도로 그래프(구간·교차로 군집·신호·건물). DOM·네트워크 없음.
// 단위 m, x 동·y 북. 좌표는 영역 중심 (lat0, lon0) 기준 등장방형 근사.
const PP_OSMG = (function ppOsmg() {
  const DEG = Math.PI / 180, KX = 111320, KY = 110540;
  // ponytail: 도로 폭 이웃 교차로가 서로 겹치지 않을 한계. 크면 인접 교차로가 하나로 뭉치고 작으면 한 사거리가 둘로 쪼개진다.
  const MERGE_R = 15;
  const LOOP_MAX = 60;  // 한 군집을 되돌아오는 구간은 이보다 짧을 때만 군집 내부 연결로 보고 버림
  const MAX_WAYS = 20000, MAX_BLDG = 30000;
  const ROAD = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street', 'service'];
  // 등급: [편도 차로, 제한속도 km/h, 중앙선]
  const BASE = { motorway: [3, 60, 'yellow-double'], trunk: [3, 60, 'yellow-double'], primary: [3, 60, 'yellow-double'], secondary: [2, 50, 'yellow-double'],
    tertiary: [1, 50, 'yellow-solid'], unclassified: [1, 30, 'none'], residential: [1, 30, 'none'], living_street: [1, 30, 'none'], service: [1, 20, 'none'] };
  const NARROW = { residential: 1, service: 1, living_street: 1 };
  const tooBig = () => Object.assign(new Error('too-big'), { code: 'too-big' });

  function project(lat0, lon0) {
    const kx = Math.cos(lat0 * DEG) * KX;
    return { fwd: (lat, lon) => [(lon - lon0) * kx, (lat - lat0) * KY], inv: (x, y) => [lat0 + y / KY, lon0 + x / kx] };
  }

  const TURN = { left: 'left', slight_left: 'left', sharp_left: 'left', right: 'right', slight_right: 'right', sharp_right: 'right', reverse: 'uturn' };
  // 'left|through;right' → [['left'],['straight','right']]. 빈칸·모르는 값은 straight
  const parseTurns = v => v.split('|').map(l => l.split(';').map(t => TURN[t.trim()] || 'straight'));
  const int = v => { const n = parseInt(v, 10); return n > 0 ? n : 0; };

  // 태그 → 도로 속성. 버릴 way면 null
  function roadProps(tags) {
    const t = tags || {};
    const hw = t.highway || '';
    const link = hw.endsWith('_link'), main = link ? hw.slice(0, -5) : hw;
    if (!ROAD.includes(main) || t.area === 'yes' || t.access === 'private' || t.access === 'no') return null;
    const [est, lim, med] = BASE[main];
    const rev = t.oneway === '-1';
    const oneway = link || rev || t.oneway === 'yes' || t.oneway === 'true' || t.oneway === '1';
    const total = int(t.lanes), lf = int(t['lanes:forward']), lb = int(t['lanes:backward']);
    let fwd, back = 0;
    if (oneway) fwd = lf || total || (link ? 1 : est);
    else {
      fwd = lf || (total ? (lb ? total - lb : Math.ceil(total / 2)) : est);
      back = lb || (total ? (lf ? total - lf : Math.floor(total / 2)) : est);
      fwd = Math.max(1, fwd); back = Math.max(1, back);
    }
    let limit = lim;
    const ms = parseFloat(t.maxspeed);
    if (ms > 0) limit = Math.round(/mph/.test(t.maxspeed) ? ms * 1.609 : ms);
    if (t['maxspeed:conditional'] || t.hazard === 'school_zone') limit = 30;
    const p = { cls: hw, fwd, back, limit, width: NARROW[main] ? 3.0 : 3.2, median: oneway ? 'none' : med, oneway };
    if (rev) p.rev = true;
    const tf = oneway ? (t['turn:lanes:forward'] || t['turn:lanes']) : t['turn:lanes:forward'], tb = oneway ? null : t['turn:lanes:backward'];
    if (tf || tb) p.turns = { fwd: tf ? parseTurns(tf) : null, back: tb ? parseTurns(tb) : null };
    return p;
  }

  const layerOf = t => t.layer !== undefined && !isNaN(parseInt(t.layer, 10)) ? parseInt(t.layer, 10) : t.bridge && t.bridge !== 'no' ? 1 : t.tunnel && t.tunnel !== 'no' ? -1 : 0;
  const plen = pts => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; };
  function inPoly(x, y, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++)
      if ((poly[i][1] > y) !== (poly[j][1] > y) && x < (poly[j][0] - poly[i][0]) * (y - poly[i][1]) / (poly[j][1] - poly[i][1]) + poly[i][0]) c = !c;
    return c;
  }

  function build(osm) {
    const els = (osm && osm.elements) || [];
    const raw = new Map(), ways = [];
    let la0 = Infinity, la1 = -Infinity, lo0 = Infinity, lo1 = -Infinity, nb = 0;
    for (const e of els) {
      if (e.type === 'node') {
        raw.set(e.id, e);
        la0 = Math.min(la0, e.lat); la1 = Math.max(la1, e.lat); lo0 = Math.min(lo0, e.lon); lo1 = Math.max(lo1, e.lon);
      } else if (e.type === 'way') { ways.push(e); if (e.tags && e.tags.building) nb++; }
    }
    if (nb > MAX_BLDG) throw tooBig();
    const proj = raw.size ? project((la0 + la1) / 2, (lo0 + lo1) / 2) : project(0, 0);
    const xy = id => { const n = raw.get(id); return n && proj.fwd(n.lat, n.lon); };
    const closed = w => w.nodes.length >= 4 && w.nodes[0] === w.nodes[w.nodes.length - 1] && w.nodes.every(id => raw.has(id));
    // sigCrossings: 신호 횡단보도(crossing=traffic_signals·crossing:signals=yes). 한국 OSM은 신호 교차로를 대개 이것으로만 표시(각 팔 정지선 횡단보도)
    const nodes = {}, signals = [], crossings = [], sigCrossings = [], pois = [];
    for (const n of raw.values()) {
      const t = n.tags;
      if (!t) continue;
      if (t.highway === 'traffic_signals') signals.push(xy(n.id));
      else if (t.highway === 'crossing') {
        crossings.push(xy(n.id));
        if (t.crossing === 'traffic_signals' || t['crossing:signals'] === 'yes') sigCrossings.push(xy(n.id));
      }
      if (t.name && (t.shop || t.amenity)) pois.push({ p: xy(n.id), name: t.name });
    }

    // 차도 way (nodes 누락·1점 이하는 버림, oneway=-1은 뒤집어 rev 제거)
    const roads = [];
    for (const w of ways) {
      const props0 = roadProps(w.tags);
      if (!props0 || w.nodes.length < 2 || !w.nodes.every(id => raw.has(id))) continue;
      const { rev, ...props } = props0;
      roads.push({ wayId: w.id, ns: rev ? w.nodes.slice().reverse() : w.nodes.slice(), props, layer: layerOf(w.tags), sig: JSON.stringify(props) });
    }
    if (roads.length > MAX_WAYS) throw tooBig();

    // 교차로 노드 = 같은 layer에서 팔(끝점 1, 통과 2)이 3개 이상 만나는 노드
    const deg = new Map(), K = (l, id) => l + '|' + id;
    for (const r of roads) r.ns.forEach((id, i) => { const k = K(r.layer, id); deg.set(k, (deg.get(k) || 0) + (i === 0 || i === r.ns.length - 1 ? 1 : 2)); });
    const isJ = (l, id) => deg.get(K(l, id)) >= 3;

    // 교차로 노드 군집 (격자 + union-find, id는 첫 등장 순서)
    const jids = [], jset = new Set();
    for (const r of roads) for (const id of r.ns) if (isJ(r.layer, id) && !jset.has(id)) { jset.add(id); jids.push(id); }
    const par = new Map(jids.map(id => [id, id]));
    const find = a => { while (par.get(a) !== a) { par.set(a, par.get(par.get(a))); a = par.get(a); } return a; };
    const grid = new Map(), cell = (x, y) => Math.floor(x / MERGE_R) + ',' + Math.floor(y / MERGE_R);
    for (const id of jids) {
      const [x, y] = xy(id), cx = Math.floor(x / MERGE_R), cy = Math.floor(y / MERGE_R);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++)
        for (const o of grid.get((cx + i) + ',' + (cy + j)) || []) {
          const [ox, oy] = xy(o);
          if (Math.hypot(x - ox, y - oy) <= MERGE_R) { const a = find(id), b = find(o); if (a !== b) par.set(Math.max(a, b), Math.min(a, b)); }
        }
      const c = cell(x, y); (grid.get(c) || grid.set(c, []).get(c)).push(id);
    }
    const cl = new Map(), junctions = [], cid = new Map();
    for (const id of jids) {
      const root = find(id);
      if (!cl.has(root)) { const j = { id: 'j' + (junctions.length + 1), x: 0, y: 0, nodes: [], segs: [] }; cl.set(root, j); junctions.push(j); }
      const j = cl.get(root); j.nodes.push(id); cid.set(id, j.id);
    }
    for (const j of junctions) {
      for (const id of j.nodes) { const p = xy(id); j.x += p[0] / j.nodes.length; j.y += p[1] / j.nodes.length; }
    }

    // 교차로 노드에서 way를 자른 조각
    let ord = 0;
    const pieces = [];
    for (const r of roads) {
      let s = 0;
      for (let i = 1; i < r.ns.length; i++)
        if (i === r.ns.length - 1 || isJ(r.layer, r.ns[i])) { pieces.push({ wayId: r.wayId, ns: r.ns.slice(s, i + 1), props: r.props, layer: r.layer, sig: r.sig, ord: ord++ }); s = i; }
    }
    // 2갈래 노드(같은 layer·같은 태그, 일방이면 방향도 이어짐)에서 이어 붙임
    const ends = new Map();
    const addEnd = (p, id) => { const k = K(p.layer, id); (ends.get(k) || ends.set(k, []).get(k)).push(p); };
    for (const p of pieces) { addEnd(p, p.ns[0]); addEnd(p, p.ns[p.ns.length - 1]); }
    const flip = p => Object.assign({}, p, { ns: p.ns.slice().reverse() });
    const orient = (p, n, wantEnd) => { // n이 끝(wantEnd)·시작에 오도록. 일방은 뒤집지 못함
      const at = wantEnd ? p.ns[p.ns.length - 1] : p.ns[0];
      return at === n ? p : !p.props.oneway && (wantEnd ? p.ns[0] : p.ns[p.ns.length - 1]) === n ? flip(p) : null;
    };
    for (const k of [...ends.keys()]) {
      const l = ends.get(k), n = +k.split('|')[1];
      if (l.length !== 2 || l[0] === l[1] || l[0].dead || l[1].dead || l[0].sig !== l[1].sig || l[0].layer !== l[1].layer || isJ(l[0].layer, n)) continue;
      let x, y;
      for (const [p, q] of [[l[0], l[1]], [l[1], l[0]]]) { x = orient(p, n, true); y = x && orient(q, n, false); if (y) break; }
      if (!y) continue;
      const r = { wayId: x.ord < y.ord ? x.wayId : y.wayId, ns: x.ns.concat(y.ns.slice(1)), props: x.props, layer: x.layer, sig: x.sig, ord: Math.min(x.ord, y.ord) };
      const [p, q] = l; p.dead = q.dead = true;
      for (const id of [r.ns[0], r.ns[r.ns.length - 1]]) { const kk = K(r.layer, id); ends.set(kk, (ends.get(kk) || []).filter(o => o !== p && o !== q)); ends.get(kk).push(r); }
      pieces.push(r);
    }

    const segs = [], jById = new Map(junctions.map(j => [j.id, j]));
    const jEnd = (l, id) => isJ(l, id) ? cid.get(id) : id;
    for (const p of pieces.filter(q => !q.dead).sort((u, v) => u.ord - v.ord)) {
      const a = jEnd(p.layer, p.ns[0]), b = jEnd(p.layer, p.ns[p.ns.length - 1]);
      const pts = p.ns.map(id => xy(id));
      if (a === b && typeof a === 'string' && plen(pts) < LOOP_MAX) continue;  // 군집 내부를 잇는 짧은 구간
      const s = { id: 's' + (segs.length + 1), wayId: p.wayId, a, b, pts, props: p.props, layer: p.layer };
      segs.push(s);
      for (const e of a === b ? [a] : [a, b]) if (typeof e === 'string') jById.get(e).segs.push(s.id);
      for (const id of p.ns) nodes[id] = xy(id);
    }

    const buildings = [], lots = [];
    for (const w of ways) {
      const t = w.tags || {};
      if (!(t.building || t.amenity === 'parking') || !closed(w)) continue;
      const pts = w.nodes.slice(0, -1).map(xy);
      if (t.amenity === 'parking' && !t.building) { lots.push({ pts, name: t.name || '' }); continue; }
      const lv = parseFloat(t['building:levels']);
      const h = lv > 0 ? Math.min(150, lv * 3) : 9;
      let name = t.name || '';
      if (!name) for (const o of pois) if (inPoly(o.p[0], o.p[1], pts)) { name = o.name; break; }
      buildings.push({ pts, h, name });
    }
    return { proj, nodes, segs, junctions, signals, crossings, sigCrossings, buildings, lots };
  }

  return { project, roadProps, build, MERGE_R };
})();
if (typeof module !== 'undefined') module.exports = PP_OSMG;
