// 붕붕이 — three.js 장면, 시점 3종, 미러 3개, 후방카메라 인셋, 궤적선.
// 논리 좌표 (x 동, y 북, z 높이) → three (x, z, -y). 논리 반시계 회전 = three rotation.y 양수.
const PP_RENDER = (function ppRender() {
  const C = typeof PP_CAR !== 'undefined' ? PP_CAR : require('./car.js');
  const M = typeof PP_MAPS !== 'undefined' ? PP_MAPS : require('./maps.js');
  const D2R = Math.PI / 180;
  // 색 토큰: 구조물 = 무채색 콘크리트 + 안전 노랑/검정, 차 = 자동차 도장색 + 짙은 유리·검은 바퀴·전조등/후미등
  const COL = {
    indoorBg: 0x30343b, sky: 0xb7d2ea, concrete: 0x62666e, asphalt: 0x3f454c, outer: 0x2b2d31, ceiling: 0x7d8189,
    line: 0xffffff, goal: 0x2fe08a, via: 0x4fb3ff, guide: 0xffd23a, guideNear: 0xff4a3d, edge: 0x101216,
    wall: 0xd9d5cb, base: 0x2e3238, pillar: 0xe6e3da, guard: 0x26282c, label: 0x1f4e8c, labelInk: '#f4f2ec',
    yellow: 0xf2c230, dark: 0x1d1f22, curb: 0xa7a59f, steel: 0x9aa3ab, pole: 0x6f777f, lamp: 0xfff1c4,
    building: 0xc9b9a0, window: 0x2c3a48, kiosk: 0x2f6db5, pump: 0xeceae5, pumpTop: 0xc8323a, sign: 0x2f6db5,
    bike: 0xc23b33, bike2: 0x2a8a8a, bar: 0xd23a32, white: 0xf2f0ea, fluor: 0xf4f8ff,
    me: 0x99552c, glass: 0x253345, tire: 0x141516, hub: 0xb9bec4, head: 0xfff3cf, tail: 0xe0262e, dash: 0x202226, trim: 0x3a3e45, pillar: 0x5d6066, headliner: 0x9a9b98,
  };
  const HAZARD = ['#f2c230', '#1d1f22'];
  // 한국 주차장 차색 분포(흰·은·회·검 위주, 가끔 남색·빨강·파랑). 맵의 차 순번으로 고정 선택.
  const PARKED = [0xe6e6e3, 0xe6e6e3, 0xaab0b6, 0x6b7078, 0xe6e6e3, 0x1d1f23, 0xaab0b6, 0x26355a,
    0xe6e6e3, 0x6b7078, 0x1d1f23, 0xa3262a, 0xe6e6e3, 0xaab0b6, 0x2d5fa8];
  const KIND = { // 기본 높이(실내)
    wall: 2.6, pillar: 2.6, curb: 0.15, rail: 0.12, stop: 0.15, pole: 6, building: 4, kiosk: 1.4, pump: 1.8, cart: 1.0, bike: 1.0, bar: 0.1,
  };
  const CEIL_H = 2.6;

  const v3 = (x, y, z) => new THREE.Vector3(x, z, -y);
  const mat = color => new THREE.MeshLambertMaterial({ color });

  // ── 자원 캐시: 맵(또는 내 차)마다 하나. 같은 키는 공유, 다시 불러올 때 통째로 dispose ──
  const makeRes = () => ({ geo: new Map(), mat: new Map(), tex: new Map() });
  function cached(store, key, make) {
    let v = store.get(key);
    if (!v) { v = make(); store.set(key, v); }
    return v;
  }
  function disposeRes(res) {
    if (!res) return;
    for (const store of [res.geo, res.mat, res.tex]) { store.forEach(x => x.dispose()); store.clear(); }
  }
  const unitBox = res => cached(res.geo, 'box', () => new THREE.BoxGeometry(1, 1, 1));
  const unitCyl = res => cached(res.geo, 'cyl', () => new THREE.CylinderGeometry(1, 1, 1, 14));
  const unitPlane = res => cached(res.geo, 'plane', () => new THREE.PlaneGeometry(1, 1));
  const lam = (res, color) => cached(res.mat, 'l' + color, () => mat(color));
  const basic = (res, color) => cached(res.mat, 'b' + color, () => new THREE.MeshBasicMaterial({ color }));

  function canvasTex(res, key, w, h, draw) {
    return cached(res.tex, key, () => {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      draw(c.getContext('2d'));
      return new THREE.CanvasTexture(c);
    });
  }
  // 사선 안전 줄무늬 (기둥·가로등 아랫부분)
  function hazardMat(res) {
    return cached(res.mat, 'hazard', () => {
      const t = canvasTex(res, 'hazard', 64, 64, g => {
        g.fillStyle = HAZARD[0]; g.fillRect(0, 0, 64, 64);
        g.fillStyle = HAZARD[1];
        for (let i = -64; i < 128; i += 32) { g.beginPath(); g.moveTo(i, 64); g.lineTo(i + 16, 64); g.lineTo(i + 80, 0); g.lineTo(i + 64, 0); g.fill(); }
      });
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      return new THREE.MeshLambertMaterial({ map: t });
    });
  }
  // 두 색 띠 (연석·차막이·차단봉): 2px 텍스처를 긴 축 방향 UV로 반복
  function bandMat(res, c1, c2) {
    return cached(res.mat, 'band' + c1 + c2, () => {
      const t = canvasTex(res, 'band' + c1 + c2, 2, 1, g => { g.fillStyle = c1; g.fillRect(0, 0, 1, 1); g.fillStyle = c2; g.fillRect(1, 0, 1, 1); });
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
      return new THREE.MeshLambertMaterial({ map: t });
    });
  }
  function bandGeo(res, l, h, w, period) {
    return cached(res.geo, ['band', l, h, w, period].map(n => (typeof n === 'number' ? n.toFixed(2) : n)).join(':'), () => {
      const g = new THREE.BoxGeometry(l, h, w), pos = g.attributes.position, uv = g.attributes.uv, alongX = l >= w, len = Math.max(l, w);
      for (let i = 0; i < pos.count; i++) uv.setXY(i, ((alongX ? pos.getX(i) : pos.getZ(i)) + len / 2) / period, 0.5);
      return g;
    });
  }
  // 기둥 번호판 (예: B2-14)
  function labelMat(res, text) {
    return cached(res.mat, 'label' + text, () => {
      const t = canvasTex(res, 'label' + text, 128, 64, g => {
        g.fillStyle = '#' + COL.label.toString(16).padStart(6, '0'); g.fillRect(0, 0, 128, 64);
        g.fillStyle = COL.labelInk; g.font = 'bold 38px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(text, 64, 34);
      });
      return new THREE.MeshLambertMaterial({ map: t });
    });
  }

  // 바닥 질감: 잔 얼룩 + (콘크리트) 2m 줄눈. 움직임과 경사가 눈에 들어오게.
  function groundMat(res, color, seams) {
    return cached(res.mat, 'ground' + color + seams, () => {
      const t = canvasTex(res, 'ground' + seams, 128, 128, g => {
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
        let seed = 7;
        const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < 900; i++) { const v = 200 + Math.floor(rnd() * 55); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(rnd() * 128, rnd() * 128, 1 + rnd() * 3, 1 + rnd() * 3); }
        if (seams) { g.fillStyle = 'rgba(40,42,46,0.55)'; g.fillRect(0, 0, 128, 2); g.fillRect(0, 0, 2, 128); }
      });
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 4;
      return new THREE.MeshLambertMaterial({ color, map: t });
    });
  }
  // 접지 그림자·벽 밑 어두운 띠 (실제 그림자 맵 없이 반투명 텍스처 사각형)
  function softMat(res, kind) {
    return cached(res.mat, 'soft' + kind, () => {
      const t = canvasTex(res, 'soft' + kind, 64, 64, g => {
        if (kind === 'blob') {
          const gr = g.createRadialGradient(32, 32, 8, 32, 32, 32);
          gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
        } else { // fade: v=0(벽 쪽) 진함 → v=1 투명
          const gr = g.createLinearGradient(0, 64, 0, 0);
          gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
        }
      });
      return new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    });
  }
  // 바닥 높이를 따라 휘는 사각형 (경사로 위에서도 바닥에 붙음). (cx,cy) 중심, l×w, 방향 a. 로컬 v=-w/2 쪽이 텍스처 아래(v=0).
  let quadNo = 0;
  function groundQuad(res, map, cx, cy, l, w, a, material, lift = 0.012) {
    const nx = Math.max(1, Math.ceil(l / 2)), geo = new THREE.PlaneGeometry(1, 1, nx, 1), pos = geo.attributes.position;
    const co = Math.cos(a), si = Math.sin(a);
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) * l, v = pos.getY(i) * w, x = cx + co * u - si * v, y = cy + si * u + co * v;
      const p = v3(x, y, M.heightAt(map, x, y) + lift);
      pos.setXYZ(i, p.x, p.y, p.z);
    }
    res.geo.set('quad' + quadNo++, geo);
    const m = new THREE.Mesh(geo, material);
    m.renderOrder = 1;
    return m;
  }
  // 경사 표지판: 노란 사각 표지 "오르막/내리막 경사 N%"
  function slopeSignMat(res, up, pct) {
    return cached(res.mat, 'sign' + up + pct, () => {
      const t = canvasTex(res, 'sign' + up + pct, 256, 256, g => {
        g.fillStyle = '#f2c230'; g.fillRect(0, 0, 256, 256);
        g.strokeStyle = '#1d1f22'; g.lineWidth = 14; g.strokeRect(10, 10, 236, 236);
        g.fillStyle = '#1d1f22'; g.beginPath(); // 경사 삼각형
        if (up) { g.moveTo(40, 150); g.lineTo(216, 150); g.lineTo(216, 70); } else { g.moveTo(40, 150); g.lineTo(216, 150); g.lineTo(40, 70); }
        g.fill();
        g.font = 'bold 50px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText((up ? '오르막 ' : '내리막 ') + pct + '%', 128, 200);
      });
      return new THREE.MeshLambertMaterial({ map: t, side: THREE.DoubleSide });
    });
  }

  // 장애물 로컬 좌표(x = 길이 l 방향, ly = 폭 w 방향)에 상자 하나
  // 윤곽선: 구조물·차 모서리에 어두운 선을 그어 깊이와 경계를 분명하게
  const edgeMat = res => cached(res.mat, 'edge', () => new THREE.LineBasicMaterial({ color: COL.edge, transparent: true, opacity: 0.55 }));
  const edgesOf = (res, geo) => cached(res.geo, 'edges' + geo.uuid, () => new THREE.EdgesGeometry(geo, 25));
  function part(parent, geo, material, lx, ly, z0, l, h, w, res) {
    const m = new THREE.Mesh(geo, material);
    m.scale.set(l, h, w);
    m.position.set(lx, z0 + h / 2, -ly);
    if (res && geo.type === 'BoxGeometry') m.add(new THREE.LineSegments(edgesOf(res, geo), edgeMat(res)));
    parent.add(m);
    return m;
  }

  // 카메라를 차 로컬 좌표(뒷축 기준)에 두고 로컬 방향 phi(논리, 0 = 앞)로 down만큼 내려다보게
  function mountCam(cam, lx, ly, lz, phi, down) {
    cam.position.set(lx, lz, -ly);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(-down * D2R, phi - Math.PI / 2, 0);
    return cam;
  }

  function create(canvas) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.autoClear = false;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x5a5650, 0.8));
    scene.add(new THREE.AmbientLight(0xffffff, 0.15));
    // 해는 -x(서쪽) 위: 오르막(+x로 오르는 면)은 평지보다 밝고, 내리막은 어둡게 → 경사가 명암으로 드러남
    const sun = new THREE.DirectionalLight(0xffffff, 0.7);
    sun.position.set(-45, 50, 20);
    scene.add(sun);

    const carGroup = new THREE.Group();
    carGroup.rotation.order = 'YZX'; // 요(y) 다음 로컬 z축 피치
    scene.add(carGroup);

    const camDriver = new THREE.PerspectiveCamera(70, 1, 0.05, 300);
    const camRear = new THREE.PerspectiveCamera(100, 1, 0.05, 200);
    const camTop = new THREE.PerspectiveCamera(55, 1, 1, 200);
    camTop.rotation.set(-Math.PI / 2, 0, 0); // 북쪽(three -z)이 화면 위
    // 레이어 1 = 궤적선(후방·위 시점만), 레이어 2 = 천장·형광등(위 시점에서는 숨김)
    camRear.layers.enable(1); camTop.layers.enable(1);
    camDriver.layers.enable(2); camRear.layers.enable(2);
    carGroup.add(camDriver, camRear);

    const mirrors = ['left', 'right', 'room'].map(id => {
      const cam = new THREE.PerspectiveCamera(id === 'room' ? 48 : 45, 2, 0.05, 150);
      cam.layers.enable(2);
      carGroup.add(cam);
      const rt = new THREE.WebGLRenderTarget(384, 192); // 모바일 성능 한도 안에서 선명하게
      rt.texture.wrapS = THREE.RepeatWrapping; rt.texture.repeat.x = -1; rt.texture.offset.x = 1; // 좌우 반전
      // 베젤: 밝은 바깥 테(어두운 장면에서도 거울 경계가 보이게) + 검은 안쪽 테
      const rim = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xd7dbe0 }));
      const frame = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x111316 }));
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: rt.texture }));
      return { id, cam, rt, rim, frame, glass };
    });
    const hudScene = new THREE.Scene();
    const hudCam = new THREE.OrthographicCamera(0, 1, 1, 0, -10, 10);
    for (const m of mirrors) hudScene.add(m.rim, m.frame, m.glass);

    // 궤적선 (레이어 1: 운전석 메인·미러에는 안 보임). 1px 선 대신 폭 있는 띠로 그려 작은 화면에서도 보이게.
    // 눈금 1m마다, 첫 눈금(1m)은 빨강.
    const N = 24;
    const ribbon = (n, color) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 2 * 3), 3));
      const idx = [];
      for (let i = 0; i < n - 1; i++) { const a = 2 * i; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      m.layers.set(1); m.frustumCulled = false;
      scene.add(m);
      return m;
    };
    const sides = [0, 1].map(() => ribbon(N + 1, COL.guide));
    const ticks = [1, 2, 3, 4, 5, 6].map(m => ribbon(2, m === 1 ? COL.guideNear : COL.guide));

    const r = {
      renderer, scene, carGroup, camDriver, camRear, camTop, mirrors, hudScene, hudCam, sides, ticks, N,
      view: 'driver', mapGroup: null, mapRes: null, carRes: null, goalGroup: null, carSpec: null, wheels: null,
      w: 1, h: 1, map: null, goalMarker: null, layout: { mirrorY: 0.58, insetBottom: 84, insetW: 0.34, roomW: 0.26, roomBottom: 0 },
    };
    resize(r);
    return r;
  }

  function disposeGroup(g) {
    if (!g) return;
    g.parent && g.parent.remove(g);
    g.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && !o.material.userData.shared) o.material.dispose();
    });
  }

  function addBox(group, cx, cy, l, w, a, z0, h, material) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(l, h, w), material);
    m.position.copy(v3(cx, cy, z0 + h / 2));
    m.rotation.y = a;
    group.add(m);
    return m;
  }

  function ground(res, map, color) {
    const b = map.bounds, bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    const geo = new THREE.PlaneGeometry(bw, bh, Math.ceil(bw * 2), Math.ceil(bh * 2));
    const pos = geo.attributes.position, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    for (let i = 0; i < pos.count; i++) {
      const x = cx + pos.getX(i), y = cy + pos.getY(i);
      pos.setXYZ(i, x, M.heightAt(map, x, y), -y);
    }
    geo.computeVertexNormals();
    // 텍스처 반복: 2m마다 한 장(줄눈 간격 2m)
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * bw / 2, uv.getY(i) * bh / 2);
    res.geo.set('ground', geo);
    return new THREE.Mesh(geo, groundMat(res, color, map.env === 'indoor'));
  }

  // ── 차 모양: 옆모습 돌출(바퀴 아치 포함) 하체 + 좁은 유리 캐빈 + 지붕 + 바퀴 4 + 전조등/후미등 ──
  // P = { L, W, H, ra, fa (뒤/앞 축 위치), tw (바퀴 중심 좌우 거리), cowl (앞유리 아래 위치) }, 원점 = 차체 중심 바닥, x = 앞
  const WHEEL_R = 0.34;
  function carParts(res, P) {
    const { L, W, H, ra, fa, tw, cowl } = P;
    const hB = 0.3, belt = H * 0.62, bump = belt - 0.32, hoodF = belt - 0.17, roofH = H - 0.07, R = 0.44, ws = 0.8;
    const x0 = -L / 2 + 0.02, x1 = L / 2 - 0.02, key = [L, W, H, ra, fa, cowl].map(n => n.toFixed(2)).join(':');
    const body = cached(res.geo, 'body:' + key, () => {
      const s = new THREE.Shape();
      s.moveTo(x0 + 0.06, hB);
      s.lineTo(ra - R, hB); s.absarc(ra, hB, R, Math.PI, 0, true);
      s.lineTo(fa - R, hB); s.absarc(fa, hB, R, Math.PI, 0, true);
      s.lineTo(x1 - 0.08, hB); s.lineTo(x1, hB + 0.12); s.lineTo(x1, bump);
      s.lineTo(x1 - 0.18, hoodF); s.lineTo(cowl, belt);
      s.lineTo(x0 + 0.15, belt); s.lineTo(x0, belt - 0.22); s.lineTo(x0, hB + 0.1);
      const g = new THREE.ExtrudeGeometry(s, { depth: W, bevelEnabled: false, curveSegments: 5 });
      g.translate(0, 0, -W / 2);
      return g;
    });
    const cab = cached(res.geo, 'cab:' + key, () => {
      const s = new THREE.Shape();
      s.moveTo(cowl, belt); s.lineTo(cowl - ws, roofH); s.lineTo(x0 + 0.5, roofH); s.lineTo(x0 + 0.12, belt);
      const g = new THREE.ExtrudeGeometry(s, { depth: W - 0.3, bevelEnabled: false });
      g.translate(0, 0, -(W - 0.3) / 2);
      return g;
    });
    const box = unitBox(res);
    const wheel = cached(res.geo, 'wheel', () => new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.22, 14).rotateX(Math.PI / 2));
    const hub = cached(res.geo, 'hub', () => new THREE.CylinderGeometry(0.19, 0.19, 0.225, 10).rotateX(Math.PI / 2));
    const q0 = new THREE.Quaternion();
    const at = (x, y, z, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q0, new THREE.Vector3(sx, sy, sz));
    const rf = cowl - ws - 0.02, rr = x0 + 0.55, lampZ = W / 2 - 0.3;
    const parts = [
      { k: 'body', geo: body, m: at(0, 0, 0) },
      { k: 'glass', geo: cab, m: at(0, 0, 0) },
      { k: 'roof', geo: box, m: at((rf + rr) / 2, roofH + 0.035, 0, rf - rr, 0.07, W - 0.42) },
      { k: 'grille', geo: box, m: at(L / 2 - 0.03, bump - 0.24, 0, 0.04, 0.14, W * 0.42) },
    ];
    for (const z of [lampZ, -lampZ]) {
      parts.push({ k: 'head', geo: box, m: at(L / 2 - 0.03, bump - 0.08, z, 0.04, 0.12, 0.34) });
      parts.push({ k: 'tail', geo: box, m: at(-L / 2 + 0.03, belt - 0.33, z, 0.04, 0.13, 0.36) });
    }
    for (const [u, front] of [[ra, false], [fa, true]]) {
      for (const side of [1, -1]) {
        parts.push({ k: 'wheel', geo: wheel, m: at(u, WHEEL_R, side * tw), front, u, side });
        parts.push({ k: 'hub', geo: hub, m: at(u, WHEEL_R, side * tw), front, u, side });
      }
    }
    return { parts, belt, roof: [rf, rr, roofH] };
  }
  function carPartMat(res, k, bodyColor) {
    switch (k) {
      case 'body': case 'roof': return lam(res, bodyColor);
      case 'glass': return lam(res, COL.glass);
      case 'grille': return lam(res, COL.dark);
      case 'head': return basic(res, COL.head);
      case 'tail': return basic(res, COL.tail);
      case 'wheel': return lam(res, COL.tire);
      default: return lam(res, COL.hub);
    }
  }

  // 주차된 차 전부를 부품별 InstancedMesh 몇 개로 (차가 많아도 그리기 호출 수 고정)
  function parkedCars(g, res, cars, map) {
    const buckets = new Map(), UP = new THREE.Vector3(0, 1, 0), ONE = new THREE.Vector3(1, 1, 1);
    for (const { o, base, idx } of cars) {
      const color = new THREE.Color(PARKED[(idx * 7 + 3) % PARKED.length]);
      const H = idx % 3 === 0 ? 1.62 : 1.47; // SUV·세단 섞기
      const P = { L: o.l, W: o.w, H, ra: -o.l / 2 + 0.95, fa: o.l / 2 - 0.9, tw: o.w / 2 - 0.13, cowl: o.l / 2 - 1.5 };
      // 경사로 위 주차 차는 노면 경사를 따라 기울인다(벽·기둥은 수직 그대로 → 경사가 대비로 보임)
      const fx = Math.cos(o.a) * o.l / 2, fy = Math.sin(o.a) * o.l / 2;
      const pitch = Math.atan2(M.heightAt(map, o.x + fx, o.y + fy) - M.heightAt(map, o.x - fx, o.y - fy), o.l);
      const q = new THREE.Quaternion().setFromAxisAngle(UP, o.a).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), pitch));
      const root = new THREE.Matrix4().compose(v3(o.x, o.y, base), q, ONE);
      g.add(groundQuad(res, map, o.x, o.y, o.l + 0.7, o.w + 0.6, o.a, softMat(res, 'blob')));
      for (const p of carParts(res, P).parts) {
        const key = p.k + p.geo.uuid;
        let b = buckets.get(key);
        if (!b) buckets.set(key, b = { p, list: [] });
        b.list.push([new THREE.Matrix4().multiplyMatrices(root, p.m), color]);
      }
    }
    // 차 윤곽선: 차체·유리 외곽을 한 LineSegments로 합쳐 그린다(그리기 호출 1회)
    const pts = [];
    for (const { p, list } of buckets.values()) {
      if (p.k !== 'body' && p.k !== 'glass') continue;
      const ep = edgesOf(res, p.geo).attributes.position, v = new THREE.Vector3();
      for (const [m] of list) for (let i = 0; i < ep.count; i++) { v.fromBufferAttribute(ep, i).applyMatrix4(m); pts.push(v.x, v.y, v.z); }
    }
    if (pts.length) {
      const eg = new THREE.BufferGeometry();
      eg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      res.geo.set('carEdges', eg);
      const lines = new THREE.LineSegments(eg, edgeMat(res));
      lines.frustumCulled = false;
      g.add(lines);
    }
    for (const { p, list } of buckets.values()) {
      const tinted = p.k === 'body' || p.k === 'roof';
      const material = tinted ? cached(res.mat, 'instWhite', () => mat(0xffffff)) : carPartMat(res, p.k);
      const im = new THREE.InstancedMesh(p.geo, material, list.length);
      list.forEach(([m, c], i) => { im.setMatrixAt(i, m); if (tinted) im.setColorAt(i, c); });
      im.frustumCulled = false; // 인스턴스가 맵 전체에 퍼져 있음
      g.add(im);
    }
  }

  // 구조물: 무채색·안전색 위주로 차와 확실히 다르게. 모든 부품은 충돌 상자 안에 둔다.
  function structure(group, res, o, base, h, label, floorZ, tilt = 0) {
    const g = new THREE.Group();
    g.position.copy(v3(o.x, o.y, base));
    g.rotation.order = 'YZX'; g.rotation.y = o.a; g.rotation.z = tilt;
    group.add(g);
    const box = unitBox(res), cyl = unitCyl(res), l = o.l, w = o.w;
    switch (o.kind) {
      case 'pillar': {
        part(g, box, lam(res, COL.pillar), 0, 0, 0, l - 0.04, h, w - 0.04, res);
        part(g, box, hazardMat(res), 0, 0, 0, l - 0.02, 1.0, w - 0.02);
        const s = 0.07;
        for (const [cx, cy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) part(g, box, lam(res, COL.guard), cx * (l - s) / 2, cy * (w - s) / 2, 0, s, 1.2, s);
        if (label && h > 2) {
          const lm = labelMat(res, label), plane = unitPlane(res), y = Math.min(1.75, h - 0.4);
          for (const [nx, ny] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const p = new THREE.Mesh(plane, lm), face = nx ? w : l;
            p.scale.set(Math.min(face * 0.8, 0.56), Math.min(face * 0.8, 0.56) / 2, 1);
            p.position.set(nx * (l / 2 - 0.015), y, -ny * (w / 2 - 0.015));
            p.rotation.y = Math.atan2(nx, -ny);
            g.add(p);
          }
        }
        break;
      }
      case 'wall':
        part(g, box, lam(res, COL.wall), 0, 0, 0, l, h, w - 0.02, res);
        part(g, box, lam(res, COL.base), 0, 0, 0, l, Math.min(0.3, h), w);
        break;
      case 'curb':
        if (Math.max(l, w) > 15) {
          part(g, box, lam(res, COL.curb), 0, 0, 0, l, h, w, res);
        } else {
          const m = new THREE.Mesh(bandGeo(res, l, h, w, 1.0), bandMat(res, HAZARD[0], HAZARD[1]));
          m.position.y = h / 2; m.add(new THREE.LineSegments(edgesOf(res, m.geometry), edgeMat(res))); g.add(m);
        }
        break;
      case 'stop': {
        const m = new THREE.Mesh(bandGeo(res, l, h, w, 0.5), bandMat(res, HAZARD[0], HAZARD[1]));
        m.position.y = h / 2; m.add(new THREE.LineSegments(edgesOf(res, m.geometry), edgeMat(res))); g.add(m);
        break;
      }
      case 'rail':
        part(g, box, lam(res, COL.yellow), 0, 0, 0, l, h, w, res);
        break;
      case 'bar': {
        const m = new THREE.Mesh(bandGeo(res, l, h, w, 0.5), bandMat(res, '#d23a32', '#f2f0ea'));
        m.position.y = h / 2; m.add(new THREE.LineSegments(edgesOf(res, m.geometry), edgeMat(res))); g.add(m);
        // 차단기 몸통: 막대 한쪽 끝, 바닥까지 (막대 상자 안)
        const alongX = l >= w, end = Math.max(l, w) / 2 - 0.05, post = Math.min(l, w);
        part(g, box, lam(res, COL.yellow), alongX ? end : 0, alongX ? 0 : end, floorZ - base, post, base - floorZ, post);
        break;
      }
      case 'pole': {
        const rad = Math.min(l, w) * 0.3;
        const post = new THREE.Mesh(cyl, lam(res, COL.pole)); post.scale.set(rad, h, rad); post.position.y = h / 2; g.add(post);
        const foot = new THREE.Mesh(cyl, hazardMat(res)); foot.scale.set(rad * 1.25, 1.0, rad * 1.25); foot.position.y = 0.5; g.add(foot);
        part(g, box, lam(res, COL.pole), 0, 0, h - 0.18, l * 0.9, 0.14, w * 0.9);
        part(g, box, basic(res, COL.lamp), 0, 0, h - 0.22, l * 0.7, 0.04, w * 0.7);
        break;
      }
      case 'building': {
        const b1 = Math.min(1.0, h * 0.25), b2 = Math.min(h - 0.5, h * 0.72);
        part(g, box, lam(res, COL.building), 0, 0, 0, l, b1, w, res);
        part(g, box, lam(res, COL.window), 0, 0, b1, l - 0.1, b2 - b1, w - 0.1);
        part(g, box, lam(res, COL.building), 0, 0, b2, l, h - b2, w, res);
        part(g, box, lam(res, COL.base), 0, 0, h - 0.15, l, 0.15, w);
        break;
      }
      case 'kiosk':
        part(g, box, lam(res, COL.base), 0, 0, 0, l * 0.6, h * 0.6, w * 0.6);
        part(g, box, lam(res, COL.kiosk), 0, 0, h * 0.6, l, h * 0.36, w, res);
        part(g, box, lam(res, COL.yellow), 0, 0, h * 0.96, l, h * 0.04, w);
        break;
      case 'pump':
        part(g, box, lam(res, COL.dark), 0, 0, 0, l, 0.15, w);
        part(g, box, lam(res, COL.pump), 0, 0, 0.15, l - 0.08, h - 0.5, w - 0.08, res);
        part(g, box, lam(res, COL.dark), 0, 0, h * 0.55, l * 0.5, h * 0.17, w);
        part(g, box, lam(res, COL.pumpTop), 0, 0, h - 0.35, l, 0.35, w);
        break;
      case 'cart': {
        const s = 0.06, steel = lam(res, COL.steel);
        for (const [cx, cy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) part(g, box, steel, cx * (l - s) / 2, cy * (w - s) / 2, 0, s, h, s);
        for (const cy of [1, -1]) for (const z of [h - 0.05, h * 0.5]) part(g, box, steel, 0, cy * (w - s) / 2, z, l, 0.05, s * 0.7);
        part(g, box, lam(res, COL.sign), (l - 0.04) / 2, 0, h * 0.5, 0.04, h * 0.5, w - 2 * s);
        break;
      }
      case 'bike': {
        const along = l >= w, len = Math.max(l, w), wid = Math.min(l, w);
        const torus = cached(res.geo, 'tire-bike', () => new THREE.TorusGeometry(0.3, 0.03, 6, 16));
        const inner = new THREE.Group(); inner.rotation.y = along ? 0 : Math.PI / 2; g.add(inner);
        part(inner, box, lam(res, COL.steel), 0, 0, 0.28, len * 0.95, 0.05, 0.05); // 거치대
        [[-wid / 4, COL.bike, -0.05], [wid / 4, COL.bike2, 0.05]].forEach(([y, c, dx]) => {
          for (const x of [-0.55, 0.55]) {
            const t = new THREE.Mesh(torus, lam(res, COL.dark)); t.position.set(x + dx, 0.33, -y); inner.add(t);
          }
          const fm = lam(res, c);
          part(inner, box, fm, dx, y, 0.52, 1.1, 0.05, 0.04);
          part(inner, box, fm, dx - 0.2, y, 0.52, 0.05, 0.35, 0.04);
          part(inner, box, fm, dx + 0.45, y, 0.52, 0.05, 0.4, 0.04);
          part(inner, box, lam(res, COL.dark), dx + 0.45, y, 0.9, 0.05, 0.04, Math.min(0.4, wid / 2 - 0.02));
          part(inner, box, lam(res, COL.dark), dx - 0.2, y, 0.86, 0.22, 0.05, 0.1);
        });
        break;
      }
      default:
        part(g, box, lam(res, COL.wall), 0, 0, 0, l, h, w, res);
    }
  }

  // 실내 천장 + 형광등 줄 (레이어 2: 위 시점에서는 안 그림). 형광등은 실제 조명 없이 발광색만.
  function ceiling(group, res, map, cz) {
    const b = map.bounds, bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    const ceil = new THREE.Mesh(unitPlane(res), cached(res.mat, 'ceiling', () => new THREE.MeshLambertMaterial({ color: COL.ceiling, emissive: 0x3c3f45 })));
    ceil.scale.set(bw, bh, 1);
    ceil.rotation.x = Math.PI / 2; // 아래를 봄
    ceil.position.copy(v3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, cz));
    ceil.layers.set(2);
    group.add(ceil);
    const spots = [];
    for (let x = b.x0 + 2; x < b.x1 - 1; x += 4.6) for (let y = b.y0 + 1.5; y < b.y1 - 0.5; y += 4.2) spots.push([x, y]);
    const strips = new THREE.InstancedMesh(unitPlane(res), basic(res, COL.fluor), spots.length);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2), s = new THREE.Vector3(1.3, 0.14, 1);
    spots.forEach(([x, y], i) => strips.setMatrixAt(i, new THREE.Matrix4().compose(v3(x, y, cz - 0.02), q, s)));
    strips.frustumCulled = false;
    strips.layers.set(2);
    group.add(strips);
  }

  // 벽 밑 어두운 띠(양쪽) + 기둥·기계류 밑 접지 그림자: 물체가 바닥에 붙어 서 있는 느낌과 거리감
  const BLOB_KINDS = ['pillar', 'pole', 'kiosk', 'pump', 'building', 'cart'];
  function contactShadows(g, res, map) {
    for (const o of map.obstacles) {
      if (o.kind === 'wall' && o.l > o.w) {
        const n = [-Math.sin(o.a), Math.cos(o.a)], off = o.w / 2 + 0.35;
        for (const sgn of [1, -1]) g.add(groundQuad(res, map, o.x + n[0] * off * sgn, o.y + n[1] * off * sgn, o.l, 0.7, sgn > 0 ? o.a : o.a + Math.PI, softMat(res, 'fade')));
      } else if (BLOB_KINDS.includes(o.kind)) {
        g.add(groundQuad(res, map, o.x, o.y, o.l + 0.8, o.w + 0.8, o.a, softMat(res, 'blob')));
      }
    }
  }

  // 경사 단서: 경사로 가장자리 줄무늬 + 오르막/내리막 표지판(%)
  function slopeCues(g, res, map, indoor) {
    const free = (x, y) => map.obstacles.every(o => {
      if (o.kind === 'wall' || o.kind === 'curb') return true;
      const dx = x - o.x, dy = y - o.y, c = Math.cos(o.a), si = Math.sin(o.a);
      return Math.abs(c * dx + si * dy) > o.l / 2 + 0.6 || Math.abs(-si * dx + c * dy) > o.w / 2 + 0.6;
    });
    const b = map.bounds;
    for (const rp of map.ramps) {
      const dz = rp.z1 - rp.z0;
      if (Math.abs(dz) < 0.05) continue;
      const co = Math.cos(rp.a), si = Math.sin(rp.a), at = (u, v) => [rp.x + co * u - si * v, rp.y + si * u + co * v];
      if (rp.w <= 6) { // 좁은 경사로: 양쪽 가장자리 노랑·검정 줄무늬
        const edge = cached(res.mat, 'rampEdge' + rp.l, () => {
          const t = canvasTex(res, 'rampEdge' + rp.l, 64, 16, gg => {
            gg.fillStyle = HAZARD[0]; gg.fillRect(0, 0, 64, 16); gg.fillStyle = HAZARD[1];
            for (let i = -16; i < 80; i += 32) { gg.beginPath(); gg.moveTo(i, 16); gg.lineTo(i + 16, 16); gg.lineTo(i + 32, 0); gg.lineTo(i + 16, 0); gg.fill(); }
          });
          t.wrapS = THREE.RepeatWrapping; t.repeat.set(rp.l / 1.2, 1);
          return new THREE.MeshBasicMaterial({ map: t, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
        });
        for (const v of [rp.w / 2 - 0.45, -(rp.w / 2 - 0.45)]) { const [x, y] = at(0, v); g.add(groundQuad(res, map, x, y, rp.l, 0.25, rp.a, edge, 0.01)); }
      }
      const s = Math.sign(dz), pct = Math.round(Math.abs(dz) / rp.l * 100);
      // 오르막 표지 = 낮은 쪽에서 오는 차를 향해, 내리막 표지 = 높은 쪽에서 오는 차를 향해
      for (const up of [true, false]) {
        const startU = up ? -s * rp.l / 2 : s * rp.l / 2, into = up ? s : -s;
        let spot = null;
        for (const f of [0.3, 0.35, 0.4, 0.45, 0.25, 0.2]) {
          for (const side of [1, -1]) {
            let [x, y] = at(startU + into * f * rp.l, side * (rp.w / 2 - 0.45));
            x = Math.max(b.x0 + 0.7, Math.min(b.x1 - 0.7, x)); y = Math.max(b.y0 + 0.7, Math.min(b.y1 - 0.7, y));
            if (free(x, y)) { spot = [x, y]; break; }
          }
          if (spot) break;
        }
        if (!spot) continue;
        const [x, y] = spot, z = M.heightAt(map, x, y), face = [-co * into, -si * into]; // 다가오는 차 쪽
        const sign = new THREE.Group();
        sign.position.copy(v3(x, y, z));
        sign.rotation.y = Math.atan2(face[0], -face[1]);
        const plate = new THREE.Mesh(unitPlane(res), slopeSignMat(res, up, pct));
        plate.scale.set(0.8, 0.8, 1); plate.position.set(0, 2.0, 0.03);
        sign.add(plate);
        part(sign, unitBox(res), lam(res, COL.pole), 0, 0, 1.58, 0.86, 0.86, 0.04, res).position.z = 0;
        if (!indoor) part(sign, unitCyl(res), lam(res, COL.pole), 0, 0, 0, 0.08, 1.6, 0.08);
        g.add(sign);
      }
    }
  }

  function clearMap(r) {
    if (r.mapGroup) r.scene.remove(r.mapGroup);
    disposeRes(r.mapRes);
    disposeGroup(r.goalGroup); r.goalGroup = null; r.goalMarker = null;
    r.road = null; r.roadMode = false; r.focusMirror = null;
  }

  function loadMap(r, map) {
    clearMap(r);
    r.map = map;
    const res = r.mapRes = makeRes();
    const g = new THREE.Group(), indoor = map.env === 'indoor';
    r.scene.background = new THREE.Color(indoor ? COL.indoorBg : COL.sky);
    r.scene.fog = indoor ? null : new THREE.Fog(COL.sky, 60, 180);
    g.add(ground(res, map, indoor ? COL.concrete : COL.asphalt));
    const zs = [0].concat(map.floors.map(f => f.z), map.ramps.flatMap(rp => [rp.z0, rp.z1]));
    const outer = new THREE.Mesh(unitPlane(res), lam(res, COL.outer));
    outer.scale.set(400, 400, 1);
    outer.rotation.x = -Math.PI / 2; outer.position.y = Math.min(...zs) - 0.05;
    g.add(outer);
    if (indoor) ceiling(g, res, map, Math.max(...zs) + CEIL_H);
    const lineMat = basic(res, COL.line), box = unitBox(res);
    for (const [x1, y1, x2, y2] of map.lines) {
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, z = M.heightAt(map, mx, my) + 0.005;
      const m = new THREE.Mesh(box, lineMat);
      m.scale.set(Math.hypot(x2 - x1, y2 - y1) + 0.15, 0.01, 0.15);
      m.position.copy(v3(mx, my, z + 0.005));
      m.rotation.y = Math.atan2(y2 - y1, x2 - x1);
      g.add(m);
    }
    const cars = [];
    let pillarNo = 0;
    map.obstacles.forEach(o => {
      const base = o.z ?? M.heightAt(map, o.x, o.y);
      if (o.kind === 'car') { cars.push({ o, base, idx: cars.length }); return; }
      let h = o.h ?? (o.kind === 'wall' && !indoor ? 2.0 : KIND[o.kind] || KIND.wall), b0 = base, tilt = 0;
      if (o.z == null && (o.kind === 'wall' || o.kind === 'curb')) {
        // 경사 위의 긴 벽: 수직으로 세우되 낮은 끝까지 내려 바닥에 붙인다(윗선은 수평 → 오르막에서 벽이 낮아져 보임).
        // 연석은 낮아서 노면 경사를 따라 기울인다.
        const ex = Math.cos(o.a) * o.l / 2, ey = Math.sin(o.a) * o.l / 2;
        const z1 = M.heightAt(map, o.x - ex, o.y - ey), z2 = M.heightAt(map, o.x + ex, o.y + ey);
        if (Math.abs(z2 - z1) > 0.05) {
          if (o.kind === 'wall') { b0 = Math.min(z1, z2); h += Math.max(z1, z2) - base; } else tilt = Math.atan2(z2 - z1, o.l);
        }
      }
      const label = indoor && o.kind === 'pillar' ? 'B2-' + (12 + 2 * pillarNo++) : null;
      structure(g, res, o, b0, h, label, M.heightAt(map, o.x, o.y), tilt);
    });
    if (cars.length) parkedCars(g, res, cars, map);
    contactShadows(g, res, map);
    slopeCues(g, res, map, indoor);
    r.scene.add(g);
    r.mapGroup = g;
  }

  // 목표(또는 경유지) 표시: slot·zone = 사각 테두리, beside = 면 선 막대 + 기준 위치 기둥
  function showGoal(r, goal, isVia = false) {
    disposeGroup(r.goalGroup);
    const g = new THREE.Group(), color = isVia ? COL.via : COL.goal;
    const edge = new THREE.MeshBasicMaterial({ color });
    const fill = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, depthWrite: false });
    const z = M.heightAt(r.map, goal.x, goal.y) + 0.02;
    const co = Math.cos(goal.a), si = Math.sin(goal.a);
    const at = (u, v) => [goal.x + co * u - si * v, goal.y + si * u + co * v];
    if (goal.type === 'beside') {
      addBox(g, goal.x, goal.y, 2 * goal.alongTol + 2, 0.12, goal.a, z, 0.04, edge);
      addBox(g, goal.x, goal.y, 0.12, 0.12, goal.a, z, 1.3, edge);
    } else {
      const hl = goal.l / 2, hw = goal.w / 2, t = 0.2;
      for (const [u, v, l, w] of [[0, hw, goal.l, t], [0, -hw, goal.l, t], [hl, 0, t, goal.w], [-hl, 0, t, goal.w]]) {
        const [x, y] = at(u, v);
        addBox(g, x, y, l, w, goal.a, M.heightAt(r.map, x, y) + 0.02, 0.03, edge);
      }
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(goal.l, goal.w), fill);
      plate.rotation.order = 'YXZ';
      plate.rotation.set(-Math.PI / 2, goal.a, 0);
      plate.position.copy(v3(goal.x, goal.y, z));
      g.add(plate);
    }
    // 떠 있는 아래 화살표: 운전석 눈높이 위에서 목표 위치를 가리킴(천장 2.6m 아래)
    const marker = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.55, 4).rotateX(Math.PI), edge);
    cone.position.y = 0.28;
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.45, 0.16), edge);
    shaft.position.y = 0.76;
    for (const m of [cone, shaft]) { m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: COL.edge }))); marker.add(m); }
    marker.position.copy(v3(goal.x, goal.y, z + 1.25));
    marker.userData.z = marker.position.y;
    g.add(marker);
    r.goalMarker = marker;
    r.scene.add(g);
    r.goalGroup = g;
  }

  // 내 차: 사양(spec)에서 크기를 잡는다. 그룹 원점 = 뒷축 중앙, 로컬 +x = 앞.
  const ME_H = 1.6;        // 차 높이 (SUV)
  const DRIVER_PITCH = 2; // 살짝 내려다봄: 대시보드 너머 노면과 먼 신호를 함께
  const EYE_UP = 0.15;     // 좌석 기준점 위 눈높이 → 셀토스(SUV) 실제 눈높이 약 1.35m
  function buildCar(r, spec) {
    for (const ch of r.carGroup.children.slice()) if (!ch.isCamera) r.carGroup.remove(ch);
    disposeRes(r.carRes);
    const res = r.carRes = makeRes();
    const L = spec.length, W = spec.width, ro = spec.rearOverhang, wb = spec.wheelbase;
    const d = spec.driver, center = C.centerOffset(spec), cowl = d.x + 0.75;
    const { parts, belt, roof } = carParts(res, {
      L, W, H: ME_H, ra: -center, fa: wb - center, tw: Math.min(spec.track / 2, W / 2 - 0.13), cowl: cowl - center,
    });
    const body = new THREE.Group();
    body.position.x = center;
    r.carGroup.add(body);
    r.wheels = [];
    const pivots = new Map();
    for (const p of parts) {
      const mesh = new THREE.Mesh(p.geo, carPartMat(res, p.k, COL.me));
      if (p.k === 'wheel' || p.k === 'hub') { // 바퀴는 축 위치 피벗에 (앞바퀴 조향)
        const key = p.u + ':' + p.side;
        let pivot = pivots.get(key);
        if (!pivot) {
          pivot = new THREE.Group();
          pivot.position.set(p.u, WHEEL_R, p.m.elements[14]);
          pivots.set(key, pivot);
          body.add(pivot);
          if (p.front) r.wheels.push(pivot);
        }
        pivot.add(mesh);
        continue;
      }
      mesh.applyMatrix4(p.m);
      body.add(mesh);
    }
    const shadow = new THREE.Mesh(unitPlane(res), softMat(res, 'blob'));
    shadow.scale.set(L + 0.7, W + 0.6, 1); shadow.rotation.x = -Math.PI / 2; shadow.position.set(center, 0.015, 0); shadow.renderOrder = 1;
    shadow.layers.set(1); // 위·후방 시점에서만 (운전석·미러에는 안 보임)
    r.carGroup.add(shadow);
    const box = unitBox(res), dash = lam(res, COL.dash);
    const inner = (lx, lz, l, h, w) => { const m = new THREE.Mesh(box, dash); m.scale.set(l, h, w); m.position.set(lx, lz, 0); r.carGroup.add(m); };
    inner((d.x - 0.2 - ro) / 2, belt + 0.03, d.x - 0.2 + ro, 0.06, W - 0.24);             // 실내 바닥 (룸미러에 차체 윗면 대신)
    inner((roof[0] + roof[1]) / 2 + center, roof[2] - 0.02, roof[0] - roof[1], 0.02, W - 0.42); // 천장 내장재 (룸미러에 지붕색 대신)
    mountCam(r.camDriver, d.x + 0.22, d.y, d.z + EYE_UP, 0, DRIVER_PITCH);
    mountCam(r.camRear, -ro, 0, 1.0, Math.PI, 25);
    const [ml, mr, mm] = r.mirrors;
    mountCam(ml.cam, d.x + 0.6, W / 2 + 0.1, 1.18, Math.PI - 24 * D2R, 5);
    mountCam(mr.cam, d.x + 0.6, -(W / 2 + 0.1), 1.18, Math.PI + 24 * D2R, 5);
    mountCam(mm.cam, -ro - 0.05, 0, 1.35, Math.PI, 4);
    PP_COCKPIT.build(r, spec);
    r.carSpec = spec;
  }

  function setView(r, view) { r.view = view; }

  function resize(r) {
    const w = window.innerWidth, h = window.innerHeight;
    r.w = w; r.h = h;
    r.renderer.setSize(w, h);
    for (const cam of [r.camDriver, r.camRear, r.camTop]) { cam.aspect = w / h; cam.updateProjectionMatrix(); }
    r.hudCam.right = w; r.hudCam.top = h; r.hudCam.updateProjectionMatrix();
    const side = Math.min(w * 0.2, h * (h < 500 ? 0.36 : 0.3), 220), room = Math.min(w * r.layout.roomW, h * 0.4, 270), pad = 12, b = 4, rim = 2;
    const place = (m, cx, cy, mw) => {
      m.glass.scale.set(mw, mw / 2, 1); m.glass.position.set(cx, cy, 2);
      m.frame.scale.set(mw + 2 * b, mw / 2 + 2 * b, 1); m.frame.position.set(cx, cy, 1);
      m.rim.scale.set(mw + 2 * (b + rim), mw / 2 + 2 * (b + rim), 1); m.rim.position.set(cx, cy, 0);
    };
    const my = h * r.layout.mirrorY;
    place(r.mirrors[0], pad + side / 2, my, side);
    place(r.mirrors[1], w - pad - side / 2, my, side);
    const top = r.layout.roomTop ?? pad + 6;
    place(r.mirrors[2], w / 2, h - top - room / 4, room);
    r.layout.roomBottom = top + room / 2 + b + rim;
  }

  function updateGuides(r, car) {
    const show = car.gear !== 'P';
    r.sides.concat(r.ticks).forEach(l => { l.visible = show; });
    if (!show) return;
    const s = car.spec, dir = car.gear === 'R' ? -1 : 1;
    const lx = dir > 0 ? s.wheelbase + C.frontOverhang(s) : -s.rearOverhang, hw = s.width / 2;
    const poses = [{ x: car.x, y: car.y, th: car.th }].concat(C.predict(car, 6, dir, r.N));
    const pts = [hw, -hw].map(ly => poses.map(p => C.toWorld(p, lx, ly)));
    pts.forEach((line, k) => setRibbon(r.sides[k], line, 0.05, r.map));
    const per = r.N / 6;
    r.ticks.forEach((t, i) => setRibbon(t, [pts[0][(i + 1) * per], pts[1][(i + 1) * per]], 0.04, r.map));
  }
  // 점 목록을 따라 폭 2·hw인 띠 꼭짓점을 채운다(지면 4cm 위)
  function setRibbon(mesh, line, hw, map) {
    const a = mesh.geometry.attributes.position, n = line.length;
    line.forEach(([x, y], i) => {
      const p = line[Math.min(i + 1, n - 1)], q = line[Math.max(i - 1, 0)];
      const dx = p[0] - q[0], dy = p[1] - q[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * hw, ny = dx / L * hw;
      const z = M.heightAt(map, x, y) + 0.04, u = v3(x + nx, y + ny, z), v = v3(x - nx, y - ny, z);
      a.setXYZ(2 * i, u.x, u.y, u.z); a.setXYZ(2 * i + 1, v.x, v.y, v.z);
    });
    a.needsUpdate = true;
  }

  function update(r, car) {
    if (r.carSpec !== car.spec) buildCar(r, car.spec);
    r.carGroup.position.copy(v3(car.x, car.y, car.z));
    r.carGroup.rotation.set(0, car.th, car.pitch);
    for (const lamp of r.blinkLights) lamp.visible = r.roadMode && lamp.userData.side === r.playerBlink && r.blinkOn;
    const steer = C.delta(car);
    for (const wh of r.wheels) wh.rotation.y = steer;
    if (r.roadMode) r.sides.concat(r.ticks).forEach(l => { l.visible = false; });
    else updateGuides(r, car);
    r.camDriver.rotation.x = -DRIVER_PITCH * D2R;
    if (r.steering) r.steering.rotation.z = car.wheel * D2R;
    const b = C.bodyBox(car);
    r.camTop.position.copy(v3(b.x, b.y, car.z + (r.roadMode ? 40 : 14)));
    if (r.goalMarker) { r.goalMarker.position.y = r.goalMarker.userData.z + Math.sin(performance.now() / 300) * 0.08; r.goalMarker.rotation.y += 0.02; }

    const R = r.renderer, w = r.w, h = r.h, driver = r.view === 'driver';
    if (driver) {
      for (const m of r.mirrors) { R.setRenderTarget(m.rt); R.clear(); R.render(r.scene, m.cam); }
      R.setRenderTarget(null);
    }
    for (const m of r.mirrors) {
      const focused = r.focusMirror === m.id;
      if (m.rim.userData.focused !== focused) {
        resize(r);
        for (const other of r.mirrors) other.rim.userData.focused = r.focusMirror === other.id;
        const selected = r.mirrors.find(x => x.id === r.focusMirror);
        if (selected) for (const part of [selected.rim, selected.frame, selected.glass]) {
          part.scale.multiplyScalar(1.35);
          part.position.x = selected.id === 'left' ? 18 + part.scale.x/2 : w - 18 - part.scale.x/2;
        }
        break;
      }
    }
    const main = driver ? r.camDriver : r.view === 'rear' ? r.camRear : r.camTop;
    main.aspect = w / h; main.updateProjectionMatrix();
    R.setViewport(0, 0, w, h);
    R.clear();
    R.render(r.scene, main);
    if (driver && car.gear === 'R') {
      const iw = Math.round(w * r.layout.insetW), ih = Math.round(iw * 0.6), ix = Math.round((w - iw) / 2), iy = r.layout.insetBottom;
      R.setScissorTest(true);
      R.setScissor(ix - 6, iy - 6, iw + 12, ih + 12); R.setClearColor(0xd7dbe0); R.clear(); // 밝은 테
      R.setScissor(ix - 4, iy - 4, iw + 8, ih + 8); R.setClearColor(0x111316); R.clear();
      R.setScissor(ix, iy, iw, ih); R.setViewport(ix, iy, iw, ih);
      R.setClearColor(0x000000); R.clear();
      r.camRear.aspect = iw / ih; r.camRear.updateProjectionMatrix();
      R.render(r.scene, r.camRear);
      R.setScissorTest(false);
      R.setViewport(0, 0, w, h);
    }
    if (driver) { // 미러는 주차·주행 공통 2D 창(좌우 아래 모서리 + 룸미러). 확인 중인 미러는 확대.
      R.clearDepth(); R.render(r.hudScene, r.hudCam);
    }
  }

  return { create, loadMap, clearMap, showGoal, setView, update, resize,
    assets: { makeRes, cached, unitBox, unitPlane, lam, basic, canvasTex, carParts, carPartMat, COL } };
})();
if (typeof module !== 'undefined') module.exports = PP_RENDER;
