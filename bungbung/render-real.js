// 실제 지도 렌더: 건물 외곽 압출(전부 BufferGeometry 하나로 병합), 플레이어 150m 안 이름 라벨(캔버스 스프라이트).
// 건물 이름은 OSM 사용자 입력 → 캔버스 fillText로만 그린다. render-road.js 다음에 로드(PP_RROAD.load가 만든 r.mapGroup에 붙인다).
// Hallmark · component: in-scene label · genre: utilitarian · theme: 붕붕이 instrument panel (기존 토큰 hex 계승)
// Hallmark · pre-emit critique: P4 H4 E4 S4 R5 V4
const PP_RREAL = (function ppRealRender() {
  // 회색 톤 3가지(벽) + 지붕은 같은 톤을 밝게. 라벨 판·글자 = 계기판 패널(--color-panel-solid)·잉크(--color-ink) 근사 hex
  const K = { walls: [0x9a968e, 0x8b8f93, 0xa39d91], panel: 'rgba(30,34,40,0.86)', ink: '#f2f0ea', rule: '#6b717a' };
  // ponytail: 지붕 기본색 배율. 지붕은 하늘·해 빛을 정면으로 받아(≈1.55배) 1 이상이면 위에서 볼 때 하얗게 날아간다 → 0.88로 '벽보다 약간 밝게'
  const ROOF_TONE = 0.88;
  // ponytail: 라벨 반경·개수는 사양(150m, 12개). 다시 고르는 이동 거리 5m = 매 프레임 정렬을 피하는 최소값
  const LABEL_R = 150, LABEL_MAX = 12, RESORT_MOVE = 5;
  const LABEL_H = 2.4, LABEL_GAP = 2.5, NAME_MAX = 18; // 라벨 높이(m), 지붕 위 간격(m), 글자 수 상한
  // ponytail: 라벨 중심 높이 상한(m). 고층(60m+) 지붕 위 라벨은 운전석 시야 밖 → 14m에 띄우고 건물에 가리지 않게 그린다(depthTest 끔)
  const LABEL_Z_MAX = 14;

  function load(r, buildings) {
    const res = { geo: new Map(), mat: new Map(), tex: new Map() }, g = new THREE.Group();
    (r.mapGroup || r.scene).add(g);
    const pos = [], nor = [], col = [], c = new THREE.Color(), named = [];
    const push = (x, z, y, nx, ny, nz) => { pos.push(x, z, -y); nor.push(nx, nz, -ny); col.push(c.r, c.g, c.b); };
    buildings.forEach((b, i) => {
      let pts = b.pts.filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
      if (pts.length < 3 || !(b.h > 0)) return;
      let area = 0;
      for (let k = 0; k < pts.length; k++) { const p = pts[k], q = pts[(k + 1) % pts.length]; area += p[0] * q[1] - q[0] * p[1]; }
      if (Math.abs(area) < 1e-3) return;
      if (area < 0) pts = pts.slice().reverse(); // 반시계로 맞춰 벽 법선이 바깥을 향하게
      const h = b.h, wall = K.walls[i % K.walls.length];
      c.setHex(wall);
      for (let k = 0; k < pts.length; k++) {
        const [x0, y0] = pts[k], [x1, y1] = pts[(k + 1) % pts.length], len = Math.hypot(x1 - x0, y1 - y0);
        if (len < 1e-6) continue;
        const nx = (y1 - y0) / len, ny = -(x1 - x0) / len;
        for (const [x, y, z] of [[x0, y0, 0], [x1, y1, 0], [x1, y1, h], [x0, y0, 0], [x1, y1, h], [x0, y0, h]]) push(x, z, y, nx, ny, 0);
      }
      c.setHex(wall).multiplyScalar(ROOF_TONE);
      const tris = THREE.ShapeUtils.triangulateShape(pts.map(([x, y]) => new THREE.Vector2(x, y)), []);
      for (const t of tris) for (const k of t) push(pts[k][0], h, pts[k][1], 0, 0, 1);
      if (b.name) {
        let cx = 0, cy = 0;
        for (const p of pts) { cx += p[0]; cy += p[1]; }
        named.push({ name: String(b.name), x: cx / pts.length, y: cy / pts.length, h });
      }
    });
    if (pos.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.computeBoundingSphere(); res.geo.set('buildings', geo);
      const m = new THREE.MeshLambertMaterial({ vertexColors: true }); res.mat.set('buildings', m);
      g.add(new THREE.Mesh(geo, m));
    }
    const sprites = [];
    for (let i = 0; i < LABEL_MAX; i++) { const s = new THREE.Sprite(); s.visible = false; s.renderOrder = 10; g.add(s); sprites.push(s); }
    return { g, res, named, sprites, at: null };
  }

  // 이름별 라벨 재질(캔버스 텍스처). 처음 보일 때 한 번 그린다.
  function labelMat(hd, name) {
    const hit = hd.res.mat.get('label:' + name);
    if (hit) return hit;
    const text = name.length > NAME_MAX ? name.slice(0, NAME_MAX - 1) + '…' : name;
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d'), font = '600 44px "IBM Plex Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", system-ui, sans-serif';
    ctx.font = font;
    const w = Math.ceil(ctx.measureText(text).width) + 40;
    cv.width = w; cv.height = 72;
    ctx.fillStyle = K.panel; ctx.fillRect(0, 0, w, 72);
    ctx.strokeStyle = K.rule; ctx.lineWidth = 2; ctx.strokeRect(1, 1, w - 2, 70);
    ctx.font = font; ctx.fillStyle = K.ink; ctx.textBaseline = 'middle'; ctx.fillText(text, 20, 38);
    const tex = new THREE.CanvasTexture(cv); hd.res.tex.set('label:' + name, tex);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    mat.userData.aspect = w / 72; hd.res.mat.set('label:' + name, mat);
    return mat;
  }

  function update(hd, player) {
    if (!hd || !player) return;
    if (hd.at && Math.hypot(player.x - hd.at.x, player.y - hd.at.y) < RESORT_MOVE) return;
    hd.at = { x: player.x, y: player.y };
    const near = [];
    for (const b of hd.named) { const d = Math.hypot(b.x - player.x, b.y - player.y); if (d < LABEL_R) near.push({ b, d }); }
    near.sort((a, b) => a.d - b.d);
    hd.sprites.forEach((s, i) => {
      const n = near[i];
      s.visible = !!n;
      if (!n) return;
      s.material = labelMat(hd, n.b.name);
      s.scale.set(LABEL_H * s.material.userData.aspect, LABEL_H, 1);
      s.position.set(n.b.x, Math.min(n.b.h + LABEL_GAP, LABEL_Z_MAX), -n.b.y);
    });
  }

  function dispose(hd) {
    if (!hd) return;
    if (hd.g.parent) hd.g.parent.remove(hd.g);
    for (const store of [hd.res.geo, hd.res.mat, hd.res.tex]) { store.forEach(x => x.dispose()); store.clear(); }
    hd.sprites.length = 0; hd.named.length = 0;
  }
  return { load, update, dispose };
})();
if (typeof module !== 'undefined') module.exports = PP_RREAL;
