// 고속도로 정적 구조물: 중앙분리대·가드레일, 문형 안내판, 톨게이트, 휴게소 건물, 차간거리 확인 노면표시, 가로수.
// 구조물 상자는 300m 칸별로 병합해 three의 frustum culling에 맡긴다. render-road.js 다음에 로드.
// Hallmark · pre-emit critique: P4 H4 E4 S4 R4 V4 · 기존 붕붕이 도로 색 계승, 안내판은 한국 고속도로 녹색 판 + 흰 글자.
const PP_RHWR = (function ppHighwayRender() {
  const K = { concrete: 0xbdbab2, rail: 0xc7cdd2, post: 0x8a9399, gantry: 0x9aa3ab, sign: 0x1f7a4a, white: 0xf2f0ea,
    hipass: 0x2f6db5, roof: 0xe8e6df, fascia: 0x2f7d55, booth: 0xdad6cc, island: 0xf2c230, building: 0xc9b9a0,
    glass: 0x425869, tree: 0x4f7a43, trunk: 0x736450 };
  const CHUNK = 300; // 정적 메시 조각 크기(m)
  // ponytail: 고속도로만 시야 600m. 안개는 먼 끝을 하늘색으로 덮어 잘림이 안 보이게(시작·끝 함께 조정).
  const FAR = 600, FOG = [220, 580];
  const CAR_RADIUS = 400; // 교통 차량을 그리는 반경(시내 180m)
  const GANTRY_Z = 5.5, PANEL_H = 2.2; // 안내판 아래 끝 높이(문형 구조 5.5m), 판 높이
  const TREE_STEP = 30; // ponytail: 가로수 간격(m). fps가 모자라면 늘린다.
  let tmpl = null; // 비색인 단위 상자(병합 원본)

  function load(r, net, road) {
    const H = PP_RENDER.assets, res = road.res, g = road.g, R = PP_ROADS;
    r.camDriver.far = FAR; r.camDriver.updateProjectionMatrix();
    r.scene.fog = new THREE.Fog(H.COL.sky, FOG[0], FOG[1]);
    road.carRadius = CAR_RADIUS;
    if (!tmpl) tmpl = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
    const chunks = new Map(), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), yAxis = new THREE.Vector3(0, 1, 0);
    const P = tmpl.attributes.position.array, Nm = tmpl.attributes.normal.array;
    // 논리 (x,y) 중심, 바닥 z0, 길이 l(a 방향)·폭 w·높이 h 상자를 칸별 병합 목록에 넣는다
    function box(color, x, y, z0, l, w, h, a) {
      const key = color + '|' + Math.floor(x / CHUNK) + ',' + Math.floor(y / CHUNK);
      let c = chunks.get(key);
      if (!c) chunks.set(key, c = { color, pos: [], nor: [] });
      q.setFromAxisAngle(yAxis, a); m4.compose(new THREE.Vector3(x, z0 + h / 2, -y), q, new THREE.Vector3(l, h, w));
      const e = m4.elements, ca = Math.cos(a), sa = Math.sin(a);
      for (let i = 0; i < P.length; i += 3) {
        const px = P[i], py = P[i + 1], pz = P[i + 2];
        c.pos.push(e[0] * px + e[4] * py + e[8] * pz + e[12], e[1] * px + e[5] * py + e[9] * pz + e[13], e[2] * px + e[6] * py + e[10] * pz + e[14]);
        const nx = Nm[i], ny = Nm[i + 1], nz = Nm[i + 2];
        c.nor.push(ca * nx + sa * nz, ny, -sa * nx + ca * nz);
      }
    }
    const obstacle = (x, y, l, w, a) => road.obstacles.push({ x, y, l, w, a });
    const css = c => '#' + c.toString(16).padStart(6, '0');
    function plane(key, cw, ch, draw, width, height) {
      const mat = new THREE.MeshBasicMaterial({ map: H.canvasTex(res, key, cw, ch, draw), transparent: true, side: THREE.DoubleSide });
      res.mat.set('hwtex' + res.mat.size, mat);
      const m = new THREE.Mesh(H.unitPlane(res), mat); m.scale.set(width, height, 1); g.add(m); return m;
    }
    // 세운 판: 진행 방향 a로 오는 운전자를 바라본다(render-road 표지판과 같은 식)
    const facing = (m, x, y, z, a) => { m.position.set(x, z, -y); m.rotation.y = a - Math.PI / 2; };

    // ── 중앙분리대(콘크리트 0.8m)·가드레일: 곡선 표본을 현 오차 5cm 안에서 줄여 조각(≤300m)마다 상자 + 충돌 ──
    function pieces(pts) {
      const out = [];
      let i = 0;
      while (i < pts.length - 1) {
        let j = i + 1;
        while (j + 1 < pts.length) {
          const [x0, y0] = pts[i], [x1, y1] = pts[j + 1], L = Math.hypot(x1 - x0, y1 - y0);
          if (L > CHUNK) break;
          let ok = true;
          for (let k = i + 1; k <= j && ok; k++) ok = Math.abs((x1 - x0) * (pts[k][1] - y0) - (y1 - y0) * (pts[k][0] - x0)) / L < 0.05;
          if (!ok) break;
          j++;
        }
        const [x0, y0] = pts[i], [x1, y1] = pts[j], L = Math.hypot(x1 - x0, y1 - y0);
        // 300m 넘는 직선(점 2개)도 칸 크기로 자른다
        const n = Math.max(1, Math.ceil(L / CHUNK));
        for (let k = 0; k < n; k++) out.push({ x0: x0 + (x1 - x0) * k / n, y0: y0 + (y1 - y0) * k / n, x1: x0 + (x1 - x0) * (k + 1) / n, y1: y0 + (y1 - y0) * (k + 1) / n });
        i = j;
      }
      return out;
    }
    for (const wall of net.walls) for (const p of pieces(wall.pts)) {
      const L = Math.hypot(p.x1 - p.x0, p.y1 - p.y0), a = Math.atan2(p.y1 - p.y0, p.x1 - p.x0);
      if (L < 0.05) continue;
      const cx = (p.x0 + p.x1) / 2, cy = (p.y0 + p.y1) / 2, nx = -Math.sin(a), ny = Math.cos(a); // 진행 방향 왼쪽
      if (wall.kind === 'median') { // 차로 왼쪽 가장자리 바깥
        const x = cx + nx * 0.3, y = cy + ny * 0.3;
        box(K.concrete, x, y, 0, L, 0.5, 0.8, a); obstacle(x, y, L, 0.5, a);
      } else { // 가드레일: 갓길(가속·감속차로) 바깥, 오른쪽
        const x = cx - nx * 0.2, y = cy - ny * 0.2;
        box(K.rail, x, y, 0.45, L, 0.12, 0.32, a); obstacle(x, y, L, 0.2, a);
        for (let s = 2; s < L; s += 4) box(K.post, p.x0 + Math.cos(a) * s - nx * 0.3, p.y0 + Math.sin(a) * s - ny * 0.3, 0, 0.12, 0.12, 0.75, a);
      }
    }

    // ── 문형 안내판: 같은 위치(분기 2장)는 한 문형에. 기둥은 노면 바깥 ──
    const onRoad = (x, y) => { const p = R.project(net, x, y); return p && p.dist <= net.lanes[p.laneId].width / 2 + 0.05; };
    const groups = [];
    for (const s of net.signs) if (s.kind === 'overhead') {
      const grp = groups.find(gp => Math.abs(gp[0].a - s.a) < 0.01 && Math.hypot(gp[0].x - s.x, gp[0].y - s.y) < 25);
      if (grp) grp.push(s); else groups.push([s]);
    }
    for (const grp of groups) {
      const s0 = grp[0], a = s0.a, nx = -Math.sin(a), ny = Math.cos(a);
      const reach = dir => { let d = 0; for (let k = 0.5; k <= 40 && onRoad(s0.x + nx * k * dir, s0.y + ny * k * dir); k += 0.5) d = k; return d; };
      const left = reach(1) + 1.2, right = reach(-1) + 1.2, span = left + right;
      const mx = s0.x + nx * (left - right) / 2, my = s0.y + ny * (left - right) / 2;
      for (const d of [left, -right]) {
        const x = s0.x + nx * d, y = s0.y + ny * d;
        box(K.gantry, x, y, 0, 0.45, 0.45, GANTRY_Z + PANEL_H + 0.4, a); obstacle(x, y, 0.5, 0.5, a);
      }
      // 판 뒤 가로 보(진행 방향으로 0.5m 뒤)
      box(K.gantry, mx + Math.cos(a) * 0.5, my + Math.sin(a) * 0.5, GANTRY_Z + PANEL_H - 0.6, 0.5, span, 0.5, a);
      const lat = s => (s.x - s0.x) * nx + (s.y - s0.y) * ny;
      const gap = grp.length > 1 ? Math.min(...grp.slice(1).map(s => Math.abs(lat(s) - lat(grp[0])))) : Infinity;
      const width = Math.min(8, gap - 0.4);
      for (const s of grp) {
        const dist = s.dist >= 1000 ? s.dist / 1000 + 'km' : s.dist ? Math.round(s.dist) + 'm' : '';
        const m = plane('ovh' + s.text + s.dir + dist + (s.jc || ''), 512, 160, ctx => {
          ctx.fillStyle = css(K.sign); ctx.fillRect(0, 0, 512, 160);
          ctx.strokeStyle = css(K.white); ctx.lineWidth = 6; ctx.strokeRect(8, 8, 496, 144);
          ctx.fillStyle = css(K.white); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
          if (s.jc) { ctx.font = 'bold 26px sans-serif'; ctx.fillText(s.jc, 28, 36); }
          ctx.font = 'bold 54px sans-serif'; ctx.fillText(s.text, 28, s.jc ? 96 : 80, 340);
          if (dist) { ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'right'; ctx.fillText(dist, 484, 132); }
          // 화살표: 직진 ↑ / 오른쪽 ↗
          ctx.save(); ctx.translate(430, 70); if (s.dir === 'right') ctx.rotate(Math.PI / 4);
          ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(0, 40); ctx.lineTo(0, -22); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, -46); ctx.lineTo(-24, -14); ctx.lineTo(24, -14); ctx.closePath(); ctx.fill(); ctx.restore();
        }, width, width * 160 / 512);
        m.scale.y = Math.min(PANEL_H, m.scale.y);
        facing(m, s.x, s.y, GANTRY_Z + m.scale.y / 2, a);
      }
    }

    // ── 톨게이트: 차로 사이 섬·부스, 지붕, 차로별 하이패스(파랑)·일반(녹색) 판 ──
    const plazas = new Map();
    for (const id in net.lanes) { const ln = net.lanes[id]; if (ln.kind === 'toll') { if (!plazas.has(ln.road)) plazas.set(ln.road, []); plazas.get(ln.road).push(ln); } }
    for (const lanes of plazas.values()) {
      const pts = lanes.map(ln => ({ ln, p: R.pointAt(ln, ln.stopS) })), a = pts[0].p.a, nx = -Math.sin(a), ny = Math.cos(a);
      const edges = new Map();
      for (const { ln, p } of pts) for (const d of [ln.width / 2, -ln.width / 2]) {
        const x = p.x + nx * d, y = p.y + ny * d, k = Math.round(x * 2) + ',' + Math.round(y * 2);
        if (!edges.has(k)) edges.set(k, { x, y });
      }
      for (const { x, y } of edges.values()) {
        box(K.island, x, y, 0, 14, 0.8, 0.25, a); obstacle(x, y, 14, 0.8, a);
        box(K.booth, x, y, 0.25, 3, 1.0, 2.4, a); obstacle(x, y, 3, 1.0, a);
        box(K.post, x + Math.cos(a) * 4, y + Math.sin(a) * 4, 0.25, 0.35, 0.35, 5.95, a);
      }
      const cx = pts.reduce((v, o) => v + o.p.x, 0) / pts.length, cy = pts.reduce((v, o) => v + o.p.y, 0) / pts.length;
      const span = lanes.length * lanes[0].width + 6;
      box(K.roof, cx, cy, 6.2, 16, span, 0.7, a);
      box(K.fascia, cx - Math.cos(a) * 8, cy - Math.sin(a) * 8, 6.0, 0.2, span, 1.1, a);
      for (const { ln, p } of pts) {
        const hi = ln.toll === 'hipass';
        const m = plane('toll' + ln.toll, 256, 96, ctx => {
          ctx.fillStyle = css(hi ? K.hipass : K.fascia); ctx.fillRect(0, 0, 256, 96);
          ctx.fillStyle = css(K.white); ctx.font = 'bold 44px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(hi ? '하이패스' : '일반', 128, 50);
        }, 2.8, 1.05);
        facing(m, p.x - Math.cos(a) * 8.15, p.y - Math.sin(a) * 8.15, 6.55, a);
      }
    }

    // ── 휴게소: 통과 구역(주차 면) 오른쪽 바깥에 건물 상자 ──
    for (const id in net.lanes) {
      const ln = net.lanes[id];
      if (ln.kind !== 'rest') continue;
      const p = R.pointAt(ln, R.laneLength(ln) / 2), rx = Math.sin(p.a), ry = -Math.cos(p.a), off = ln.width / 2 + 30 + 11;
      const x = p.x + rx * off, y = p.y + ry * off;
      box(K.building, x, y, 0, 50, 16, 7, p.a); box(K.glass, x - rx * 0.05, y - ry * 0.05, 1, 46, 16.1, 3, p.a);
      box(K.fascia, x, y, 7, 52, 18, 0.6, p.a); obstacle(x, y, 50, 16, p.a);
    }

    // ── 차간거리 확인 노면표시(흰 띠 + 0m·50m·100m) ──
    for (const mk of net.marks) if (mk.kind === 'gap-check') {
      const bandM = new THREE.Mesh(H.unitPlane(res), H.basic(res, K.white));
      bandM.scale.set(0.45, mk.width - 0.4, 1); bandM.rotation.set(-Math.PI / 2, 0, mk.a); bandM.position.set(mk.x, 0.03, -mk.y); g.add(bandM);
      const t = plane('gap' + mk.label, 256, 256, ctx => {
        ctx.fillStyle = css(K.white); ctx.font = 'bold 110px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(mk.label, 128, 128);
      }, 3.2, 3.2);
      t.rotation.set(-Math.PI / 2, 0, mk.a - Math.PI / 2); t.position.set(mk.x - Math.cos(mk.a) * 3, 0.035, -(mk.y - Math.sin(mk.a) * 3));
    }

    // ── 가로수: 분리대 왼쪽·가드레일 오른쪽 바깥, 다른 차로에서 떨어진 곳만 ──
    const trees = [];
    for (const wall of net.walls) {
      if (wall.hw == null) continue; // 본선 요소만(가속·감속차로 레일 제외)
      const side = wall.kind === 'median' ? 1 : -1;
      for (let i = 1; i < wall.pts.length; i++) {
        const [x0, y0] = wall.pts[i - 1], [x1, y1] = wall.pts[i], L = Math.hypot(x1 - x0, y1 - y0), a = Math.atan2(y1 - y0, x1 - x0);
        for (let s = 0; s < L; s += TREE_STEP) {
          const h = Math.abs(Math.sin(x0 * 12.9898 + y0 * 78.233 + s * 0.37)), off = 9 + h * 16;
          const x = x0 + Math.cos(a) * s - Math.sin(a) * off * side, y = y0 + Math.sin(a) * s + Math.cos(a) * off * side;
          const pr = R.project(net, x, y);
          if (pr && pr.dist < net.lanes[pr.laneId].width / 2 + 6) continue;
          trees.push([x, y, 0.8 + h * 0.5]);
        }
      }
    }
    if (trees.length) {
      const pose = new THREE.Object3D();
      for (const [color, z, sx, sy] of [[K.trunk, 0, 0.5, 3], [K.tree, 2.5, 3.6, 4]]) {
        const inst = new THREE.InstancedMesh(H.unitBox(res), H.lam(res, color), trees.length);
        inst.frustumCulled = false; // 인스턴스 전체 범위는 계산되지 않으므로 끈다(그리기 호출 1회)
        trees.forEach(([x, y, k], i) => { pose.position.set(x, z + sy * k / 2, -y); pose.scale.set(sx * k, sy * k, sx * k); pose.updateMatrix(); inst.setMatrixAt(i, pose.matrix); });
        g.add(inst);
      }
    }

    for (const [key, c] of chunks) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(c.pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(c.nor, 3));
      geo.computeBoundingSphere(); res.geo.set('hw' + key, geo);
      g.add(new THREE.Mesh(geo, H.lam(res, c.color)));
    }
    return { chunks: chunks.size, trees: trees.length };
  }
  return { load, FAR, FOG };
})();
if (typeof module !== 'undefined') module.exports = PP_RHWR;
