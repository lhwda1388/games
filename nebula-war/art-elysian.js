// 네뷸라 워 — 엘리시안 아트(새 화풍 px: 1). 건물 16 · 유닛 16(파쇄구·스파크 포함) · 잔해 3.
// art.js 다음, render.js 앞에서 읽는다. art.js 의 정의 표(NW_ART.SPR)에 직접 등록한다(공유 헬퍼는 건드리지 않음).
// 금 s = 유선형 판·받침, 청록 t = 에너지 수정·코어, 흰 심 w. 빛은 좌상단, 외곽선은 s.o(render 의 finish).
// 건물: 건설 b0 청록 와이어프레임 / b1 금 받침 + 위 와이어 / b2 수정 꺼진 완성, 가동 w0..3 = 수정 빛 4단 순환 + 고리 1px 상하 + 금 판 위 보호막 일렁임 띠.
//       손상은 자세 키 'w#d1|d2'(Task 1 형식): 그을음 블록(void .55) + d2 는 금 간 선 2개.
// 유닛: 0·1·2·6·7 방향만 그린다(3·4·5 는 렌더가 반전). u = 앞, v = 오른쪽, z = 위 → 화면 (x, y·0.7 − z).
(() => {
  const A = typeof NW_ART !== 'undefined' ? NW_ART : require('./art.js');
  const { mix, css, ramp } = A;
  const FLAT = 0.7, LX = -0.6, LY = -0.8, TAU = Math.PI * 2;

  // ---------- 팔레트 ----------
  const memo = new Map(); let memoT = null;
  const rampOf = (T, id, mk) => { if (memoT !== T) { memo.clear(); memoT = T; } let r = memo.get(id); if (!r) { r = ramp(mk(), T); memo.set(id, r); } return r; };
  // 엘리시안 확장: G = 청록 에너지 6단(o d m l h w). 엄브라·보이드 어센던트용 보라빛 램프(swarm-a 와 청록·void 혼합)
  function pal(c, T) {
    const X = { s: c.s, t: c.t, w: c.w, k: c.k, G: [c.t.o, c.t.d, c.t.m, c.t.l, c.t.h, c.w] };
    X.v = rampOf(T, 'ely-violet', () => mix(T['swarm-a'], T['elysian-b'], 0.3));
    X.dk = rampOf(T, 'ely-dusk', () => mix(T['elysian-a'], T['color-void'], 0.5));
    X.vo = rampOf(T, 'ely-void', () => mix(T['swarm-a'], T['color-void'], 0.35));
    return X;
  }
  // 에너지 밝기: L = -1(꺼짐) 0 1 2, k = 0(어두운 면)..3(밝은 면)
  const en = (X, L, k) => L < 0 ? X.G[[0, 1, 1, 2][k]] : X.G[Math.min(5, L + 1 + k)];
  const enV = (X, L, k, R) => L < 0 ? [R.o, R.d, R.d, R.m][k] : [R.d, R.m, R.l, R.h, X.w, X.w][Math.min(5, L + k)];

  // ---------- 화면 공간 도형(건물·공용) ----------
  function arc(P, cx, cy, rx, ry, a0, a1, col) {
    if (P.raw) { const q = P.T(cx, cy); cx = q[0]; cy = q[1]; rx *= P.sc; ry *= P.sc; P = P.raw; }
    const n = Math.max(6, Math.ceil((a1 - a0) * Math.max(rx, ry)));
    let px = null, py = null;
    for (let k = 0; k <= n; k++) { const a = a0 + (a1 - a0) * k / n, x = Math.floor(cx + Math.cos(a) * rx), y = Math.floor(cy + Math.sin(a) * ry); if (x !== px || y !== py) P.dot(x, y, col); px = x; py = y; }
  }
  // 둥근 받침(타원 원기둥): 옆 = 왼쪽 m · 나머지 d, 윗면 l, 앞 입술 h, 뒤 왼쪽 테 h
  function dais(P, cx, gy, z, rx, ry, hgt, R, top) {
    const yb = gy - z, yt = yb - hgt;
    if (hgt > 0) for (let x = Math.ceil(cx - rx - 0.5); x <= Math.floor(cx + rx - 0.5); x++) {
      const t = (x + 0.5 - cx) / rx; if (t <= -1 || t >= 1) continue;
      const dy = ry * Math.sqrt(1 - t * t), y0 = Math.floor(yt + dy), y1 = Math.floor(yb + dy);
      P.r(x, y0, 1, y1 - y0 + 1, t < -0.55 ? R.m : R.d);
      if (y1 - y0 >= 3 && t > -0.55) P.dot(x, y1, R.o);                            // 바닥 접지선
    }
    if (top) P.fell(cx, yt, rx, ry, top);
    else {                                                                          // 윗면 m + 좌상 l 초승달 반사
      P.fell(cx, yt, rx, ry, R.m);
      P.fell(cx - rx * 0.1, yt - ry * 0.14, rx * 0.84, ry * 0.76, R.l);
      P.fell(cx + rx * 0.04, yt + ry * 0.02, rx * 0.8, ry * 0.74, R.m);
    }
    arc(P, cx, yt, rx - 0.6, ry - 0.6, Math.PI * 0.12, Math.PI * 0.88, R.h);       // 앞 입술
    arc(P, cx, yt, rx - 0.6, ry - 0.6, Math.PI * 1.05, Math.PI * 1.45, R.h);       // 뒤 왼쪽 테
    return yt;
  }
  // 수평 고리(위에서 본 납작한 링). part = 'back'(위 절반) | 'front' | 'all'. 두께 thick px 아래로
  function ring(P, cx, cy, rx, ry, th, R, part = 'all', thick = 2) {
    if (P.raw) { const q = P.T(cx, cy); cx = q[0]; cy = q[1]; rx *= P.sc; ry *= P.sc; th *= P.sc; thick = Math.round(thick * P.sc); P = P.raw; }
    const irx = rx - th, iry = ry - th * ry / rx;
    for (let pass = 0; pass < 2; pass++) {
      const off = pass === 0 ? thick : 0;
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (dx * dx / (rx * rx) + dy * dy / (ry * ry) > 1) continue;
        if (irx > 0 && iry > 0 && dx * dx / (irx * irx) + dy * dy / (iry * iry) <= 1) continue;
        if ((part === 'back' && dy >= 0) || (part === 'front' && dy < 0)) continue;
        let col = R.d;
        if (pass) { const a = Math.atan2(dy / ry, dx / rx), k = Math.cos(a) * LX + Math.sin(a) * LY; col = k > 0.75 ? R.h : k > 0.05 ? R.l : k > -0.65 ? R.m : R.d; }
        P.dot(x, y + off, col);
      }
    }
  }
  // 세운 고리(관문 아치): 두께는 오른쪽 아래로, 면은 좌상단 밝음
  function vring(P, cx, cy, rx, ry, th, R, dep = 3) {
    if (P.raw) { const q = P.T(cx, cy); cx = q[0]; cy = q[1]; rx *= P.sc; ry *= P.sc; th *= P.sc; dep = Math.round(dep * P.sc); P = P.raw; }
    const irx = rx - th, iry = ry - th;
    for (let pass = 0; pass < 2; pass++) {
      const ox = pass ? 0 : 1, oy = pass ? 0 : dep;
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy, o = dx * dx / (rx * rx) + dy * dy / (ry * ry), i = dx * dx / (irx * irx) + dy * dy / (iry * iry);
        if (o > 1 || i <= 1) continue;
        let col = R.d;
        if (pass) { const a = Math.atan2(dy / ry, dx / rx), k = Math.cos(a) * LX + Math.sin(a) * LY, edge = (Math.sqrt(o) - Math.sqrt(i) * irx / rx) < 0; col = k > 0.7 ? R.h : k > 0.1 ? R.l : k > -0.55 ? R.m : R.d; if (i < 1.18 && k < -0.2) col = R.l; void edge; }
        P.dot(x + ox, y + oy, col);
      }
    }
  }
  // 떠 있는 정팔면체 수정(위아래 꼭짓점). 면 = 좌상 밝음, 우하 어둠
  function octa(P, X, x, cy, w, h, L) {
    const t = [x, cy - h / 2], b = [x, cy + h / 2], l = [x - w / 2, cy], r = [x + w / 2, cy], m = [x + w * 0.1, cy + h * 0.05];
    P.fpoly([l, m, t], en(X, L, 2)); P.fpoly([m, r, t], en(X, L, 1)); P.fpoly([l, b, m], en(X, L, 1)); P.fpoly([m, b, r], en(X, L, 0));
    if (L >= 0) { P.line(l[0] + 1, l[1], t[0], t[1] + 1, en(X, L, 3)); if (h >= 8) P.dot(x - w * 0.18, cy - h * 0.22, X.w); }
  }
  // 땅에서 솟은 수정 기둥(크리스탈과 같은 면 구성)
  function spike(P, X, x, y, w, h, L, lean = 0) {
    const tip = [x + lean, y - h], sl = [x - w + lean * 0.6, y - h * 0.62], sr = [x + w + lean * 0.6, y - h * 0.62];
    const bl = [x - w, y], bm = [x + 1, y + 2], br = [x + w, y];
    P.fpoly([bl, bm, tip, sl], en(X, L, 2)); P.fpoly([bm, br, sr, tip], en(X, L, 0));
    P.fpoly([[x - w * 0.35, y - 1], [x + 0.5, y + 1], tip], en(X, L, 1));
    if (L >= 0) { P.line(bm[0], bm[1] - 1, tip[0], tip[1], en(X, L, 3)); P.dot(tip[0] - 1, tip[1], X.w, 2, 1); }
  }
  // 금 날개판: 왼쪽 면 l · 오른쪽 면 d · 등줄 h. ol/or = 바깥으로 부푼 옆선 점
  function fin(P, R, bl, br, t, ol, or) {
    const bm = [(bl[0] + br[0]) / 2, (bl[1] + br[1]) / 2], N = 7;
    const qb = (a, c, b, k) => { const u = k / N, v = 1 - u; return [v * v * a[0] + 2 * u * v * c[0] + u * u * b[0], v * v * a[1] + 2 * u * v * c[1] + u * u * b[1]]; };
    const outer = [], inner = [];
    for (let k = 0; k <= N; k++) { outer.push(qb(bl, ol, t, k)); inner.push(qb(t, or, br, k)); }
    P.fpoly([...outer, bm], R.l); P.fpoly([bm, ...inner], R.d); P.line(bm[0], bm[1] - 1, t[0], t[1], R.h);
  }
  function ball(P, x, y, rx, ry, R) {
    P.fell(x, y, rx, ry, R.d); P.fell(x - rx * 0.12, y - ry * 0.14, rx * 0.84, ry * 0.8, R.m);
    P.fell(x - rx * 0.34, y - ry * 0.38, rx * 0.42, ry * 0.36, R.l); P.dot(x - rx * 0.46, y - ry * 0.55, R.h, rx > 5 ? 2 : 1, 1);
  }
  function core(P, X, x, y, r, L) {
    P.fell(x, y, r, r, en(X, L, 1)); P.fell(x - r * 0.12, y - r * 0.12, r * 0.7, r * 0.7, en(X, L, 2));
    P.fell(x - r * 0.26, y - r * 0.26, r * 0.36, r * 0.36, en(X, L, 3)); if (L >= 0 && r >= 2.5) P.dot(x - r * 0.4, y - r * 0.45, X.w);
  }
  // 바닥 직육면체(주둔지와 같은 box: 왼쪽 x0, 앞 아래 화면 y yB, 폭 w, 화면 깊이 dS)
  const box = (P, x0, yB, w, dS, z, h, R) => P.prism(x0 + w / 2, yB + z - dS / 2, z, w, dS / FLAT, h, 0, R);

  // ---------- 후처리(캔버스 픽셀) ----------
  const rgbOf = s => s.match(/[\d.]+/g).slice(0, 3).map(v => Math.round(+v));
  function post(P, fn) { const c = P.ctx, W = c.canvas.width, H = c.canvas.height, img = c.getImageData(0, 0, W, H); fn(img.data, W, H); c.putImageData(img, 0, 0); }
  // 와이어프레임: 불투명 경계·색 경계만 line 색, 안쪽은 3줄마다 홀로그램 주사선(scan)
  function wire(P, line, scan) {
    const L = rgbOf(line), S = rgbOf(scan);
    post(P, (d, W, H) => {
      const src = new Uint8ClampedArray(d), op = i => src[i * 4 + 3] > 0;
      const diff = (i, j) => Math.abs(src[i * 4] - src[j * 4]) + Math.abs(src[i * 4 + 1] - src[j * 4 + 1]) + Math.abs(src[i * 4 + 2] - src[j * 4 + 2]) > 60;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x; if (!op(i)) continue;
        const edge = x === 0 || y === 0 || x === W - 1 || y === H - 1 || !op(i - 1) || !op(i + 1) || !op(i - W) || !op(i + W) ||
          diff(i, i + 1) && op(i + 1) || diff(i, i + W) && op(i + W);
        const c = edge ? L : (y % 3 === 0 && (x & 1)) ? S : null;
        if (c) { d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; } else d[i * 4 + 3] = 0;
      }
    });
  }
  // 보호막 일렁임: 대각 띠(x + y) 안의 금 픽셀을 램프 한 단 밝게. 가동 프레임 i 마다 띠가 왼쪽 위 → 오른쪽 아래로
  function shimmer(P, R, i, n) {
    const from = [R.m, R.l].map(rgbOf), to = [R.l, R.h].map(rgbOf);
    post(P, (d, W, H) => {
      const span = W + H, c0 = (i + 0.5) / n * span, hw = 1.6;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const s = x + y; if (Math.abs(s - c0) > hw) continue;
        const p = (y * W + x) * 4; if (!d[p + 3]) continue;
        for (let k = 0; k < 2; k++) if (d[p] === from[k][0] && d[p + 1] === from[k][1] && d[p + 2] === from[k][2]) { d[p] = to[k][0]; d[p + 1] = to[k][1]; d[p + 2] = to[k][2]; break; }
      }
    });
  }
  const hash = (x, y) => { let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
  const strHash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; };
  // 손상: hash(type, x>>2, y>>2) % 5 (d1) / % 3 (d2) 블록을 void .55 로 섞고, d2 는 금 간 선 2개(s.o)
  function scorch(P, X, T, type, dmg) {
    const v = T['color-void'], sd = strHash(type), m = dmg >= 2 ? 3 : 5, o = rgbOf(X.s.o);
    post(P, (d, W, H) => {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const p = (y * W + x) * 4; if (!d[p + 3]) continue;
        if (hash(sd ^ (x >> 2), (y >> 2) * 7919) % m === 0 && ((x + y) & 1) && d[p] > d[p + 2]) for (let k = 0; k < 3; k++) d[p + k] = d[p + k] + (v[k] - d[p + k]) * 0.55;
      }
      if (dmg < 2) return;
      for (let n = 0; n < 2; n++) {                                                 // 금: 위에서 아래로 갈지자
        let x = Math.floor(W * (0.3 + 0.4 * n) + (hash(sd, n) % 9) - 4), y = 0;
        while (y < H && !d[(y * W + x) * 4 + 3]) y++;
        for (let k = 0; k < 26 && y < H; k++) {
          const p = (y * W + x) * 4; if (d[p + 3]) { d[p] = o[0]; d[p + 1] = o[1]; d[p + 2] = o[2]; }
          const r = hash(sd + n, k); y++; x += (r & 3) === 0 ? -1 : (r & 3) === 1 ? 1 : 0; if (x < 0 || x >= W) break;
        }
      }
    });
  }

  // ---------- 건물 공통 ----------
  // spec: { w, h (타일), oy, glow, smoke, base(P, K), top(P, K) }  K = { X, L, bob, i, stage, cx, gy, W, H, Y0 }
  function building(id, spec) {
    const W = spec.w * 32, H = spec.h * 32, oy = spec.oy;
    return { w: W, h: H + oy, px: 1, ox: 0, oy, dirs: 1, frames: { build: 3, work: 4 }, glow: spec.glow, smoke: [],
      draw(P, c, f) {
        const X = pal(c, f.T), stage = f.anim === 'build' ? f.i : 3, i = stage === 3 ? f.i % 4 : 0;
        const K = { X, T: f.T, L: stage === 3 ? [0, 1, 2, 1][i] : -1, bob: stage === 3 ? [0, -1, 0, 1][i] : 0, i, stage, cx: W / 2, gy: oy + H / 2, W, H: H + oy, Y0: oy };
        if (stage === 1) {                                                          // b1: 받침은 금으로 완성, 위는 와이어(받침과 겹친 곳도 위가 보이게)
          spec.base(P, K); const cvs = P.ctx.canvas, under = P.ctx.getImageData(0, 0, cvs.width, cvs.height);
          P.ctx.save(); P.ctx.setTransform(1, 0, 0, 1, 0, 0); P.ctx.clearRect(0, 0, cvs.width, cvs.height); P.ctx.restore();
          spec.top(P, K); wire(P, X.t.l, X.t.d);
          post(P, d => { const u = under.data; for (let p = 0; p < d.length; p += 4) if (!d[p + 3] && u[p + 3]) { d[p] = u[p]; d[p + 1] = u[p + 1]; d[p + 2] = u[p + 2]; d[p + 3] = 255; } });
          return;
        }
        spec.base(P, K); spec.top(P, K);
        if (stage === 0) { wire(P, X.t.l, X.t.d); return; }
        if (stage === 3) shimmer(P, X.s, i, 4);
        if (f.dmg) scorch(P, X, f.T, id, f.dmg);
      } };
  }
  // 공통 받침: 금 타원 단 + 청록 상감 고리(에너지 밝기 따라)
  function plinth(P, K, rx, ry, hgt = 4, inlay = true) {
    const { X, cx, gy } = K, yt = dais(P, cx, gy + 2, 0, rx, ry, hgt, X.dk);
    for (let k = 0; k < 8; k++) {                                                   // 방사형 판 이음(안쪽 고리 ~ 바깥 테)
      const a = (k + 0.5) * TAU / 8, c = Math.cos(a), sn = Math.sin(a);
      P.line(cx + c * rx * 0.62, yt + sn * ry * 0.62, cx + c * (rx - 2), yt + sn * (ry - 1.5), X.dk.o);
    }
    if (inlay) ring(P, cx, yt, rx * 0.62 + 1, ry * 0.62 + 0.8, 1.6, { d: en(X, K.L, 0), m: en(X, K.L, 1), l: en(X, K.L, 2), h: en(X, K.L, 3) }, 'all', 0);
    return yt;
  }

  // 유닛 확대 펜: 발밑 (CX, CY) 기준으로 좌표·반지름을 sc 배. 픽셀을 하나씩 찍는 도우미(ring·vring·arc·rod·blade)는 P.raw 로 변환 후 직접 그린다(틈 없음)
  function scaledPen(P0, CX, CY, sc) {
    const T = (x, y) => [CX + (x - CX) * sc, CY + (y - CY) * sc], n = v => Math.max(1, Math.round(v * sc - 0.25));
    return { raw: P0, sc, T, ctx: P0.ctx,
      fpoly: (pts, c) => P0.fpoly(pts.map(p => T(p[0], p[1])), c),
      fell: (x, y, rx, ry, c) => { const q = T(x, y); P0.fell(q[0], q[1], rx * sc, ry * sc, c); },
      line: (x0, y0, x1, y1, c) => { const a = T(x0, y0), b = T(x1, y1); P0.line(a[0], a[1], b[0], b[1], c); },
      dot: (x, y, c, w = 1, h = 1) => { const q = T(x, y); P0.dot(q[0], q[1], c, n(w), n(h)); },
      r: (x, y, w, h, c) => { const q = T(x, y); P0.r(Math.round(q[0]), Math.round(q[1]), n(w), n(h), c); },
      dither: P0.dither, prism: P0.prism, cyl: P0.cyl };
  }

  const B = {};
  // 성소(본진 4×3): 3단 받침, 양옆 초승달 금 날개, 가운데 큰 청록 첨탑 + 떠 있는 고리, 양쪽 작은 떠 있는 수정
  B.sanctum = building('sanctum', { w: 4, h: 3, oy: 24, glow: [[64, 30, 16], [34, 40, 6], [94, 40, 6]],
    base(P, K) { const { X, cx } = K; plinth(P, K, 56, 38, 5); dais(P, cx, 67, 0, 37, 24, 5, X.s); dais(P, cx, 59, 0, 21, 13, 4, X.s); },
    top(P, K) {
      const { X, cx, L, bob } = K;
      for (const s of [-1, 1]) {                                                    // 초승달 뿔(안으로 휜다) + 발치 청록 수로
        const a = [cx + s * 40, 64], b = [cx + s * 27, 66];
        fin(P, X.s, s < 0 ? a : b, s < 0 ? b : a, [cx + s * 22, 2], s < 0 ? [cx - 62, 24] : [cx + 30, 36], s < 0 ? [cx - 30, 36] : [cx + 62, 24]);
        P.line(cx + s * 30, 70, cx + s * 18, 63, en(X, L, 2)); P.line(cx + s * 31, 71, cx + s * 19, 64, en(X, L, 0));
      }
      ring(P, cx, 30 + bob, 22, 7, 3.5, X.s, 'back');
      spike(P, X, cx, 56, 10, 52, L);
      spike(P, X, cx - 12, 58, 5, 22, L, -4); spike(P, X, cx + 12, 59, 5, 18, L, 4);
      ring(P, cx, 30 + bob, 22, 7, 3.5, X.s, 'front');
      spike(P, X, cx - 30, 70, 4, 12, L, -2); spike(P, X, cx + 30, 70, 4, 12, L, 2);
      octa(P, X, cx - 34, 40 + bob, 8, 14, L); octa(P, X, cx + 34, 40 - bob, 8, 14, L);
      P.r(cx - 7, 106, 14, 2, en(X, L, 2)); P.r(cx - 4, 106, 8, 1, en(X, L, 3));      // 앞 문턱 빛
    } });
  // 공명탑(2×2, 전력): 받침 + 세 발톱 + 떠 있는 팔면체 + 고리
  B.resonator = building('resonator', { w: 2, h: 2, oy: 16, glow: [[32, 24, 11]],
    base(P, K) { const { X, cx, gy } = K; plinth(P, K, 25, 16, 3); dais(P, cx, gy - 1, 0, 13, 8.5, 4, X.s); },
    top(P, K) {
      const { X, cx, L, bob } = K;
      ring(P, cx, 28 + bob, 15, 5, 2.6, X.s, 'back', 1);
      fin(P, X.s, [cx - 13, 44], [cx - 8, 45], [cx - 15, 18], [cx - 21, 32], [cx - 9, 30]);
      fin(P, X.s, [cx + 8, 45], [cx + 13, 44], [cx + 15, 18], [cx + 9, 30], [cx + 21, 32]);
      octa(P, X, cx, 22 + bob, 14, 26, L);
      ring(P, cx, 28 + bob, 15, 5, 2.6, X.s, 'front', 1);
    } });
  // 증류기(2×2, 분출구 위): 금 원통 탱크 + 청록 유리 돔 + 옆 배관
  B.distiller = building('distiller', { w: 2, h: 2, oy: 16, glow: [[32, 24, 11]],
    base(P, K) { plinth(P, K, 27, 18, 3, false); },
    top(P, K) {
      const { X, cx, gy, L, bob } = K;
      for (const sx of [-1, 1]) { box(P, cx + sx * 21 - 4, gy + 8, 8, 8, 3, 9, X.s); core(P, X, cx + sx * 21, gy - 6, 1.6, L); }
      const yt = dais(P, cx, gy + 7, 3, 17, 11, 16, X.s);
      for (let k = -2; k <= 2; k++) P.r(cx + k * 6, yt + 11 - Math.abs(k), 1, 8, X.s.d);
      ring(P, cx, yt, 17, 11, 3, X.s, 'all', 0);
      P.fell(cx, yt - 2, 13, 11, en(X, L, 0)); P.fell(cx - 1, yt - 4, 11, 9, en(X, L, 1));
      P.fell(cx - 3, yt - 7, 6.5, 5, en(X, L, 2)); P.fell(cx - 5, yt - 9, 2.5, 2, en(X, L, 3)); if (L >= 0) P.dot(cx - 6, yt - 10, X.w);
      ring(P, cx, yt - 4 + bob, 15, 4, 1.4, X.s, 'all', 1);
    } });
  // 관문(4×3): 세운 금 고리 아치 + 안쪽 청록 소용돌이 막 + 양옆 기둥
  B.portal = building('portal', { w: 4, h: 3, oy: 24, glow: [[64, 44, 24]],
    base(P, K) { const { X, cx, gy } = K; plinth(P, K, 56, 37, 5); },
    top(P, K) {
      const { X, cx, L, i } = K, cy = 44;
      for (let r = 0; r < 4; r++) P.fell(cx + r * 0.7, cy + r * 0.9, 24 - r * 5, 34 - r * 7.5, r === 0 ? en(X, L, 0) : en(X, L, r));
      if (L >= 0) for (let a = 0; a < 3; a++) for (let k = 0; k < 30; k++) {           // 나선 팔 3: 프레임마다 돈다
        const t = k / 30, an = a * TAU / 3 + t * 4.2 + i * 0.5, rr = 3 + t * 20;
        P.dot(cx + Math.cos(an) * rr * 0.72, cy + Math.sin(an) * rr * 1.05, en(X, L, k < 12 ? 3 : 1));
      }
      vring(P, cx, cy, 31, 42, 8, X.s, 3);
      for (let k = 0; k < 7; k++) { const a = Math.PI * (0.62 + k * 0.29); P.line(cx + Math.cos(a) * 23.5, cy + Math.sin(a) * 34.5, cx + Math.cos(a) * 30.5, cy + Math.sin(a) * 41.5, X.s.d); }
      core(P, X, cx, cy - 38, 3.2, L);
      for (const sx of [-1, 1]) { box(P, cx + sx * 24 - 6, 92, 12, 8, 5, 6, X.s); fin(P, X.s, [cx + sx * 42 - 3, 82], [cx + sx * 42 + 3, 82], [cx + sx * 42, 50], [cx + sx * 42 - 6, 68], [cx + sx * 42 + 6, 68]); core(P, X, cx + sx * 42, 74, 2.4, L); }
    } });
  // 대장간(3×2): 금 모루 + 떠 있는 청록 망치 수정 + 불꽃 점
  B.anvil = building('anvil', { w: 3, h: 2, oy: 24, glow: [[48, 18, 9], [48, 52, 6]],
    base(P, K) { plinth(P, K, 38, 22, 3); },
    top(P, K) {
      const { X, cx, gy, L, bob, i } = K;
      box(P, cx - 20, gy + 10, 40, 16, 3, 12, X.s);
      P.r(cx - 13, gy - 6, 26, 4, X.s.o); P.r(cx - 12, gy - 5, 24, 2, en(X, L, 2)); P.r(cx - 12, gy - 5, 24, 1, en(X, L, 3));   // 달아오른 화구
      P.prism(cx - 2, gy - 4, 15, 46, 14, 6, 0, X.s);                                // 모루 판
      fin(P, X.s, [cx + 20, gy - 25], [cx + 21, gy - 18], [cx + 36, gy - 24], [cx + 28, gy - 28], [cx + 30, gy - 18]);   // 뿔
      P.prism(cx - 24, gy - 4, 15, 4, 16, 6, 0, X.s);                                // 꼬리 받침
      octa(P, X, cx, 16 + bob, 14, 24, L);
      for (let k = 0; k < 5; k++) { const a = k * 1.26 + i * 0.5, x = cx + Math.cos(a) * 15, y = 18 + Math.sin(a) * 5 + bob; P.dot(x, y, en(X, L, k & 1 ? 3 : 2)); }
    } });
  // 수호 포탑(2×2): 두 금 날개가 감싼 탑 + 가운데 떠 있는 청록 눈 수정
  B.wardspire = building('wardspire', { w: 2, h: 2, oy: 24, glow: [[32, 30, 8]],
    base(P, K) { plinth(P, K, 24, 16, 3); },
    top(P, K) {
      const { X, cx, L, bob } = K;
      fin(P, X.s, [cx - 13, 56], [cx - 6, 58], [cx - 3, 4], [cx - 15, 26], [cx - 4, 34]);
      fin(P, X.s, [cx + 6, 58], [cx + 13, 56], [cx + 3, 4], [cx + 4, 34], [cx + 15, 26]);
      P.fpoly([[cx - 5, 38], [cx + 5, 38], [cx + 3, 54], [cx - 3, 54]], X.s.d);
      octa(P, X, cx, 30 + bob, 10, 18, L);
      for (const sx of [-1, 1]) fin(P, X.s, [cx + sx * 20 - 2, 58], [cx + sx * 20 + 2, 58], [cx + sx * 24, 44], [cx + sx * 20 - 3, 50], [cx + sx * 22 + 2, 52]);
    } });
  // 신경 회랑(3×2): 긴 금 회랑 + 아치 늑골 3 + 청록 노드가 빛줄로 이어진다
  B.synapse = building('synapse', { w: 3, h: 2, oy: 24, glow: [[22, 22, 5], [48, 18, 6], [74, 22, 5]],
    base(P, K) { plinth(P, K, 42, 23, 3); },
    top(P, K) {
      const { X, cx, gy, L, i } = K;
      ball(P, cx, gy - 12, 36, 18, X.s);                                              // 둥근 회랑 지붕
      box(P, cx - 36, gy + 10, 72, 14, 3, 12, X.s);
      for (const x of [-22, 0, 22]) { P.fell(cx + x, gy - 1, 5, 6, X.s.o); P.fell(cx + x, gy, 4, 5, en(X, L, 1)); P.r(cx + x - 4, gy, 9, 6, en(X, L, 1)); P.r(cx + x - 5, gy + 6, 11, 1, X.s.o); P.fell(cx + x - 1, gy + 1, 2, 3, en(X, L, 3)); }
      const nx = [cx - 26, cx, cx + 26], ny = [24, 18, 24];
      for (let k = 0; k < 2; k++) { const c = (k + i) % 2 ? en(X, L, 3) : en(X, L, 2); P.line(nx[k], ny[k], nx[k + 1], ny[k + 1], c); P.line(nx[k], ny[k] - 1, nx[k + 1], ny[k + 1] - 1, en(X, L, 1)); }
      nx.forEach((x, k) => { P.cyl(x, ny[k] + 8, 0, 2, 5, X.s); core(P, X, x, ny[k], k === 1 ? 5 : 3.6, L); });
    } });
  // 구축체 공방(3×2): 두 금 팔이 받친 조립 중 청록 구 + 와이어 고리
  B.constructbay = building('constructbay', { w: 3, h: 2, oy: 24, glow: [[48, 36, 11]],
    base(P, K) { plinth(P, K, 40, 23, 3); },
    top(P, K) {
      const { X, cx, gy, L, bob } = K;
      box(P, cx - 30, gy + 14, 60, 12, 3, 6, X.s);
      fin(P, X.s, [cx - 30, 64], [cx - 22, 64], [cx - 12, 16], [cx - 34, 30], [cx - 18, 36]);
      fin(P, X.s, [cx + 22, 64], [cx + 30, 64], [cx + 12, 16], [cx + 18, 36], [cx + 34, 30]);
      ring(P, cx, 38 + bob, 16, 5, 1.5, { d: en(X, L, 0), m: en(X, L, 1), l: en(X, L, 2), h: en(X, L, 3) }, 'back', 0);
      core(P, X, cx, 36 + bob, 10, L);
      ring(P, cx, 38 + bob, 16, 5, 1.5, { d: en(X, L, 0), m: en(X, L, 1), l: en(X, L, 2), h: en(X, L, 3) }, 'front', 0);
    } });
  // 구축 지원소(3×2): 금 돔 + 청록 띠 창 + 위에 떠 있는 고리
  B.assemblybay = building('assemblybay', { w: 3, h: 2, oy: 24, glow: [[48, 46, 8]],
    base(P, K) { plinth(P, K, 40, 23, 3); },
    top(P, K) {
      const { X, cx, gy, L, bob } = K;
      dais(P, cx, gy + 10, 3, 32, 18, 6, X.s);
      ball(P, cx, gy - 6, 28, 22, X.s);
      P.r(cx - 30, gy + 2, 60, 6, X.s.m);                                             // 돔 아랫단(잘라 평평하게)
      P.r(cx - 30, gy + 2, 60, 1, X.s.h);
      for (let k = -2; k <= 2; k++) P.fpoly([[cx + k * 10 - 2, gy - 2], [cx + k * 10 + 2, gy - 2], [cx + k * 11 + 2, gy + 6], [cx + k * 11 - 2, gy + 6]], en(X, L, k === 0 ? 3 : 2));
      ring(P, cx, 18 + bob, 12, 4, 2, X.s, 'all', 1); core(P, X, cx, 18 + bob, 2.5, L);
    } });
  // 관측소(3×2): 받침 + 가는 기둥 + 위에 떠 있는 큰 렌즈 원반(청록 눈)
  B.lookout = building('lookout', { w: 3, h: 2, oy: 24, glow: [[48, 20, 10]],
    base(P, K) { plinth(P, K, 40, 26, 3); },
    top(P, K) {
      const { X, cx, gy, L, bob } = K;
      P.cyl(cx, gy + 2, 3, 4, 26, X.s);
      for (const sx of [-1, 1]) fin(P, X.s, [cx + sx * 6 - 2, gy - 4], [cx + sx * 6 + 2, gy - 4], [cx + sx * 26, gy - 26], [cx + sx * 12 - 2, gy - 20], [cx + sx * 16 + 3, gy - 10]);
      const ey = 22 + bob;
      ring(P, cx, ey, 22, 12, 4, X.s, 'all', 3);
      P.fell(cx, ey, 17, 8.5, en(X, L, 0)); P.fell(cx - 1, ey - 1, 13, 6.5, en(X, L, 1)); P.fell(cx - 2, ey - 2, 7, 3.5, en(X, L, 3));
      P.fell(cx + 1, ey, 3, 2, X.k); if (L >= 0) P.dot(cx - 4, ey - 3, X.w, 2, 1);
    } });
  // 하늘문(4×3): 두 금 뿔 기둥이 안으로 휘고, 그 사이 높이 떠 있는 청록 에너지 원반 + 고리
  B.skygate = building('skygate', { w: 4, h: 3, oy: 24, glow: [[64, 26, 22], [64, 76, 8]],
    base(P, K) { plinth(P, K, 54, 36, 5); },
    top(P, K) {
      const { X, cx, L, bob, i } = K;
      const ey = 24 + bob;
      ring(P, cx, ey, 32, 10, 4, X.s, 'back', 3);
      fin(P, X.s, [cx - 48, 84], [cx - 34, 86], [cx - 26, 2], [cx - 60, 36], [cx - 34, 48]);
      fin(P, X.s, [cx + 34, 86], [cx + 48, 84], [cx + 26, 2], [cx + 34, 48], [cx + 60, 36]);
      if (L >= 0) for (let y = ey + 8; y < 74; y++) for (let x = -5; x <= 5; x++) if (((x + y + i) & 1) && Math.abs(x) < 6 - (y - ey) * 0.04) P.dot(cx + x, y, en(X, L, Math.abs(x) < 2 ? 2 : 0));
      P.fell(cx, ey, 26, 7.5, en(X, L, 0)); P.fell(cx - 1, ey - 0.5, 22, 6, en(X, L, 1)); P.fell(cx - 3, ey - 1, 14, 3.5, en(X, L, 2)); P.fell(cx - 5, ey - 1.5, 6, 1.5, en(X, L, 3));
      if (L >= 0) for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + i * 0.35; P.dot(cx + Math.cos(a) * 18, ey + Math.sin(a) * 4.5, X.w); }
      ring(P, cx, ey, 32, 10, 4, X.s, 'front', 3);
      spike(P, X, cx, 80, 7, 22, L); spike(P, X, cx - 12, 82, 4, 11, L, -3); spike(P, X, cx + 12, 82, 4, 11, L, 3);
    } });
  // 함대 첨탑(3×2): 금 첨탑에 크기 줄어드는 떠 있는 고리 3 + 꼭대기 수정
  B.fleetspire = building('fleetspire', { w: 3, h: 2, oy: 24, glow: [[48, 8, 7]],
    base(P, K) { plinth(P, K, 36, 21, 3); },
    top(P, K) {
      const { X, cx, gy, L, bob } = K;
      const rs = [[gy - 10, 24], [gy - 27, 18], [gy - 42, 12]];
      rs.forEach(([y, r], k) => ring(P, cx, y + (k & 1 ? -bob : bob), r, r * 0.34, 3, X.s, 'back', 2));
      fin(P, X.s, [cx - 9, gy + 4], [cx + 9, gy + 4], [cx, 12], [cx - 9, gy - 28], [cx + 8, gy - 28]);
      for (let y = gy - 4; y > 22; y -= 9) P.r(cx - 1, y, 2, 3, en(X, L, 2));
      rs.forEach(([y, r], k) => ring(P, cx, y + (k & 1 ? -bob : bob), r, r * 0.34, 3, X.s, 'front', 2));
      octa(P, X, cx, 8 + bob, 9, 15, L);
    } });
  // 성채(3×2): 금 계단식 단 3 + 청록 창 띠 + 꼭대기 왕관 수정
  B.citadel = building('citadel', { w: 3, h: 2, oy: 24, glow: [[48, 6, 8], [48, 44, 6]],
    base(P, K) { plinth(P, K, 42, 23, 3, false); },
    top(P, K) {
      const { X, cx, gy, L, i } = K;
      for (const sx of [-1, 1]) { P.cyl(cx + sx * 31, gy + 6, 3, 7, 22, X.s); spike(P, X, cx + sx * 31, gy - 21, 4, 10, L, sx); P.r(cx + sx * 31 - 1, gy - 10, 2, 6, en(X, L, 2)); }
      box(P, cx - 26, gy + 12, 52, 12, 3, 10, X.s);                                    // 성벽
      for (let k = 0; k < 6; k++) box(P, cx - 25 + k * 9, gy + 2, 5, 3, 13, 3, X.s);   // 총안
      box(P, cx - 15, gy + 4, 30, 16, 3, 28, X.s);                                     // 본성
      for (let k = 0; k < 4; k++) box(P, cx - 14 + k * 8, gy - 12, 4, 3, 31, 3, X.s);
      P.r(cx - 4, gy - 13, 8, 14, X.s.o); P.r(cx - 3, gy - 12, 6, 13, en(X, L, 1)); P.r(cx - 3, gy - 12, 6, 2, en(X, L, (i & 1) ? 3 : 2));
      for (const x of [-10, 8]) { P.r(cx + x, gy - 20, 2, 5, X.s.o); P.r(cx + x, gy - 19, 2, 3, en(X, L, 2)); }
      spike(P, X, cx, gy - 33, 6, 19, L); spike(P, X, cx - 8, gy - 32, 3, 9, L, -2); spike(P, X, cx + 8, gy - 32, 3, 9, L, 2);
    } });
  // 현자 서고(3×2): 원형 열주 전당 + 금 돔 + 둘레를 도는 청록 서판 수정 3
  B.sagelibrary = building('sagelibrary', { w: 3, h: 2, oy: 24, glow: [[48, 30, 9]],
    base(P, K) { plinth(P, K, 40, 23, 3); },
    top(P, K) {
      const { X, cx, gy, L, bob, i } = K;
      const orb = (k, back) => { const a = k * TAU / 3 + i * 0.4, y = Math.sin(a); if ((y < 0) !== back) return; octa(P, X, cx + Math.cos(a) * 34, gy - 22 + y * 8 + bob, 6, 10, L); };
      for (let k = 0; k < 3; k++) orb(k, true);
      const yt = dais(P, cx, gy + 8, 3, 24, 15, 18, X.s);
      for (let k = -3; k <= 3; k++) { const x = cx + k * 6.5, dy = 15 * Math.sqrt(1 - (k * 6.5 / 24) ** 2); P.r(Math.round(x) - 1, Math.round(yt + dy) + 2, 2, 12, k < -1 ? X.s.d : X.s.o); }
      ball(P, cx, yt - 2, 24, 18, X.s); P.r(cx - 24, yt - 2, 48, 3, X.s.m); arc(P, cx, yt + 1, 23.4, 14.4, 0.1, Math.PI - 0.1, X.s.h);
      core(P, X, cx, yt - 18, 4, L);
      for (let k = 0; k < 3; k++) orb(k, false);
    } });
  // 조율 법정(3×2): 뒤 반원 열주 + 가운데 떠 있는 코어와 방패판 3
  B.wardencourt = building('wardencourt', { w: 3, h: 2, oy: 24, glow: [[48, 30, 10]],
    base(P, K) { plinth(P, K, 40, 23, 3); },
    top(P, K) {
      const { X, cx, gy, L, bob, i } = K;
      for (let k = 0; k < 7; k++) { const a = Math.PI + k * Math.PI / 6, x = cx + Math.cos(a) * 34, y = gy + 4 + Math.sin(a) * 18; P.cyl(x, y, 3, 3, 26, X.s); }
      arc(P, cx, gy - 21, 34, 18, Math.PI, TAU, X.s.l); arc(P, cx, gy - 22, 34, 18, Math.PI, TAU, X.s.h);
      const cy = gy - 18 + bob;
      const plate = (k, back) => { const a = k * TAU / 3 + i * 0.3, s = Math.sin(a); if ((s < 0) !== back) return;
        const x = cx + Math.cos(a) * 15, y = cy + s * 6; fin(P, X.s, [x - 3, y + 8], [x + 3, y + 8], [x, y - 10], [x - 5, y - 2], [x + 5, y - 2]); };
      for (let k = 0; k < 3; k++) plate(k, true);
      core(P, X, cx, cy, 6, L);
      for (let k = 0; k < 3; k++) plate(k, false);
    } });

  // ---------- 유닛 공통 ----------
  function view(f, CX, CY) {
    const ca = Math.cos(f.ang), sa = Math.sin(f.ang);
    return { ca, sa, pj: (u, v, z = 0) => [CX + u * ca - v * sa, CY + (u * sa + v * ca) * FLAT - z], dp: (u, v) => u * sa + v * ca };
  }
  // 볼록 다각형 돌출(유선형 판): 보이는 옆면 m/d, 윗면 top(기본 m), 좌상 안쪽 l, 빛 받는 뒤 테 h
  function hull(P, V, pts, z, hgt, R, o = {}) {
    const n = pts.length; let cu = 0, cv = 0; for (const p of pts) { cu += p[0]; cv += p[1]; } cu /= n; cv /= n;
    const bot = pts.map(p => V.pj(p[0], p[1], z)), top = pts.map(p => V.pj(p[0], p[1], z + hgt)), ks = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, a = pts[i], b = pts[j]; let nu = b[1] - a[1], nv = -(b[0] - a[0]);
      if (nu * ((a[0] + b[0]) / 2 - cu) + nv * ((a[1] + b[1]) / 2 - cv) < 0) { nu = -nu; nv = -nv; }
      const nx = nu * V.ca - nv * V.sa, ny = nu * V.sa + nv * V.ca, Ln = Math.hypot(nx, ny) || 1, k = (nx * LX + ny * LY) / Ln;
      ks.push(k);
      if (hgt > 0 && ny / Ln > 0.02) P.fpoly([bot[i], bot[j], top[j], top[i]], k > -0.3 ? R.m : R.d);
    }
    P.fpoly(top, o.top || R.m);
    let sx = 0, sy = 0; for (const p of top) { sx += p[0]; sy += p[1]; } sx /= n; sy /= n;
    const ext = Math.max(...top.map(p => Math.abs(p[0] - sx))) + Math.max(...top.map(p => Math.abs(p[1] - sy)));
    if (o.inset !== false && ext > 7) P.fpoly(top.map(p => [sx + (p[0] - sx) * 0.6 - 1, sy + (p[1] - sy) * 0.6 - 1]), o.lit || R.l);
    if (R.h) for (let i = 0; i < n; i++) if (ks[i] > 0.45) { const j = (i + 1) % n; P.line(top[i][0], top[i][1], top[j][0], top[j][1], R.h); }
    return { top, bot };
  }
  const zs = () => { const L = []; return { add: (d, fn) => L.push([d, fn]), run: () => { L.sort((a, b) => a[0] - b[0]); for (const p of L) p[1](); } }; };
  // 호버 판 아래 빛(지상 엘리시안 유닛은 발 대신 떠 있는 판): 프레임 m 마다 밝기 2단
  const hoverGlow = (P, X, V, rx, m, L = 1) => { const [x, y] = V.pj(0, 0, 0); P.fell(x, y, rx, rx * 0.42, en(X, L, m ? 1 : 0)); P.fell(x - 0.5, y - 0.3, rx * 0.55, rx * 0.22, en(X, L, m ? 3 : 2)); };
  // 3D 막대(다리·팔·검): 시작·끝 (u,v,z) 사이 굵기 w 선
  const rod = (P, V, a, b, w, col) => { let p = V.pj(...a), q = V.pj(...b); if (P.raw) { p = P.T(...p); q = P.T(...q); w = Math.round(w * P.sc); P = P.raw; } for (let k = 0; k < w; k++) P.line(p[0] + (k & 1) * (k > 1 ? -1 : 1) * ((k + 1) >> 1), p[1], q[0] + (k & 1) * (k > 1 ? -1 : 1) * ((k + 1) >> 1), q[1], col); };
  const blade = (P, X, V, a, b, L) => { let p = V.pj(...a), q = V.pj(...b); if (P.raw) { p = P.T(...p); q = P.T(...q); P = P.raw; } P.line(p[0], p[1] + 1, q[0], q[1] + 1, en(X, L, 1)); P.line(p[0], p[1], q[0], q[1], en(X, L, 3)); P.line(p[0], p[1] - 1, q[0], q[1] - 1, en(X, L, 2)); P.dot(q[0], q[1], X.w); };

  // spec: { w, h, oy, frames: { move }, glow, draw(P, X, f, K) }  K = { V, L, mv, at, i, cx, cy }
  function unit(spec) {
    const fr = { idle: 1, move: spec.move || 2, attack: 2 }, sc = spec.sc || 1, cx0 = spec.w / 2;
    // glow: 정의에는 발밑 기준 [dx, dy, r](동쪽 자세, 확대 전) → 캔버스 좌표로(건물과 같은 형식)
    const glow = (spec.glow || []).map(([x, y, r]) => [Math.round(cx0 + x * sc), Math.round(spec.oy + y * sc), Math.round(r * sc)]);
    return { w: spec.w, h: spec.h, px: 1, ox: spec.w / 2, oy: spec.oy, dirs: 8, frames: fr, glow,
      draw(P, c, f) {
        const X = pal(c, f.T), cx = this.w / 2, cy = this.oy;          // this = 정의(전시·측정에서 캔버스를 바꿔도 따라온다)
        const mv = f.anim === 'move' ? f.i : -1, at = f.anim === 'attack' ? f.i : -1;
        const K = { V: view(f, cx, cy), L: at === 0 ? 2 : 1, mv, at, i: f.i, cx, cy, T: f.T };
        spec.draw(sc !== 1 ? scaledPen(P, cx, cy, sc) : P, X, f, K);
      } };
  }
  const U = {};
  const lens = (len, wid, n = 10, tail = 0.55) => {                               // 물방울 유선형 윤곽: 앞이 뾰족, 뒤가 둥글게
    const pts = []; for (let k = 0; k < n; k++) { const a = k / n * TAU, c = Math.cos(a), s = Math.sin(a); pts.push([c > 0 ? c * len / 2 : c * len / 2 * tail * 1.6, s * wid / 2 * (c > 0 ? 1 - c * 0.35 : 1)]); } return pts;
  };

  // 셰이퍼(일꾼): 물고기형 금 동체 + 청록 코어 + 꼬리·옆 지느러미 + 호버 빛
  U.shaper = unit({ sc: 1.44, w: 36, h: 37, oy: 30, move: 2, glow: [[1, -11, 3]], draw(P, X, f, K) {
    const { V, L, mv, at } = K, z = 5, Z = zs(), flap = mv === 1 ? 1.5 : 0;
    hoverGlow(P, X, V, 6, mv >= 0 ? mv : 0);
    for (const s of [-1, 1]) Z.add(V.dp(-2, s * 6), () => P.fpoly([V.pj(1, s * 3, z + 2), V.pj(-4, s * (8 + flap), z + 1 + flap), V.pj(-5, s * 3, z + 2)], X.s.d));
    Z.add(0, () => {
      hull(P, V, [[10, 0], [8, 3.2], [3, 5], [-2, 5], [-7, 3.2], [-9, 0], [-7, -3.2], [-2, -5], [3, -5], [8, -3.2]], z, 5, X.s);
      P.fpoly([V.pj(-5, 0, z + 4), V.pj(-11, 0, z + 11 - flap), V.pj(-9, 0, z + 3)], X.s.l);   // 꼬리 지느러미
      const [qx, qy] = V.pj(1.5, 0, z + 5); core(P, X, qx, qy - 1, 2.6, L);
      const [ex, ey] = V.pj(8, 0, z + 2); P.dot(ex, ey, at >= 0 ? X.w : en(X, L, 3));
    });
    Z.run();
  } });
  // 오스블레이드: 걸음 4, 청록 망토, 금 갑주, 손목 에너지 검 2 (공격: 들어 올림 → 앞으로 베기)
  U.oathblade = unit({ sc: 1.53, w: 46, h: 64, oy: 52, move: 4, glow: [[1, -16, 3]], draw(P, X, f, K) {
    const { V, L, mv, at } = K, Z = zs();
    const sw = mv >= 0 ? [0, 2.5, 0, -2.5][mv] : 0, up = mv === 1 || mv === 3 ? 1 : 0, sway = mv >= 0 ? (mv & 1) : 0;
    for (const s of [-1, 1]) Z.add(V.dp(s * sw, s * 2.5) - 0.2, () => { rod(P, V, [s * sw * 0.5, s * 2.2, 9 + up], [s * sw, s * 2.6, 1], 2, X.s.d); const [fx, fy] = V.pj(s * sw + 1, s * 2.6, 0); P.r(fx - 1, fy - 1, 3, 2, X.s.m); });
    Z.add(V.dp(-5, 0), () => P.fpoly([V.pj(-1.5, -5.5, 18 + up), V.pj(-1.5, 5.5, 18 + up), V.pj(-5.5 - sway, 7.5, 3), V.pj(-6.5 - sway, 0, 2), V.pj(-5.5 - sway, -7.5, 3)], X.t.d));
    Z.add(0, () => {
      hull(P, V, [[4, 0], [2.8, 4.4], [-1.2, 5.2], [-4, 3.2], [-4, -3.2], [-1.2, -5.2], [2.8, -4.4]], 6 + up, 7, X.s);   // 허리 판갑(치마형)
      hull(P, V, [[3.2, 0], [2, 5.8], [-1.8, 6.2], [-3.2, 2.5], [-3.2, -2.5], [-1.8, -6.2], [2, -5.8]], 13 + up, 5, X.s);  // 흉갑
      const [cx, cy] = V.pj(1.4, 0, 16 + up); core(P, X, cx, cy, 1.6, L);
      const [hx, hy] = V.pj(0, 0, 22 + up); ball(P, hx, hy, 3.6, 3.8, X.s);
      const [vx, vy] = V.pj(2.6, 0, 22 + up); if (V.dp(1, 0) > -0.5) P.r(vx - 1, vy, 2, 1, en(X, L, 3));
      const [cx2, cy2] = V.pj(-2.5, 0, 27 + up); const [cx1, cy1] = V.pj(0, 0, 25 + up); P.line(cx1, cy1, cx2, cy2, X.t.l);   // 투구 깃
    });
    for (const s of [-1, 1]) {
      const pad = V.pj(0, s * 6, 17.5 + up); Z.add(V.dp(0, s * 6) + 0.1, () => ball(P, pad[0], pad[1], 3.2, 2.4, X.s));
      const hand = [2.5, s * 5.5, 11 + up];
      const tip = at === 0 ? [3, s * 7.5, 27] : at === 1 ? [14, s * 2.5, 9] : [9, s * 7, 3 + up];
      Z.add(V.dp(5, s * 6) + 0.2, () => blade(P, X, V, hand, tip, at >= 0 ? 2 : L));
    }
    Z.run();
  } });
  // 아크워커: 4족 보행 금 껍질 + 등 위 큰 청록 코어 + 앞 방전포
  U.arcwalker = unit({ sc: 1.31, w: 70, h: 78, oy: 53, move: 4, glow: [[-1, -27, 7], [22, -18, 3]], draw(P, X, f, K) {
    const { V, L, mv, at } = K, Z = zs();
    const legs = [[9, 9, 0], [9, -9, 1], [-9, 9, 1], [-9, -9, 0]];
    for (const [u, v, pair] of legs) {
      const ph = mv >= 0 ? ((mv + pair * 2) % 4) : -1, lift = ph === 1 ? 4 : 0, du = ph === 0 ? 2 : ph === 2 ? -2 : 0;
      const sv = Math.sign(v), knee = [u * 1.35 + du, v * 1.75, 22 + lift * 0.5], foot = [u * 1.25 + du * 1.5, v * 1.9, lift];
      Z.add(V.dp(knee[0], knee[1]), () => {
        rod(P, V, [u, v, 17], knee, 4, X.s.d); rod(P, V, [u, v, 19], knee, 2, X.s.m); rod(P, V, [u, v, 20], knee, 1, X.s.h);
        rod(P, V, knee, foot, 3, X.s.d); rod(P, V, knee, foot, 1, X.s.l);
        const [kx, ky] = V.pj(...knee); ball(P, kx, ky, 2.2, 2.2, X.s);
        const [fx, fy] = V.pj(...foot); P.fell(fx, fy, 2.4, 1.3, X.s.d); void sv;
      });
    }
    Z.add(0, () => {
      hull(P, V, lens(34, 25), 14, 8, X.s);
      hull(P, V, [[8, 0], [5, 6], [-4, 7], [-9, 3], [-9, -3], [-4, -7], [5, -6]], 22, 2, X.s, { inset: false });
      const [cx, cy] = V.pj(-1, 0, 27); core(P, X, cx, cy, 6, L);
      for (const s of [-1, 1]) { const [x, y] = V.pj(-1, s * 7.5, 23); P.dot(x, y, en(X, L, 2)); }
    });
    const gun = () => { hull(P, V, [[22, 0], [20, 2], [12, 2.5], [12, -2.5], [20, -2]], 17, 3, X.s, { inset: false }); const [tx, ty] = V.pj(22.5, 0, 18.5); core(P, X, tx, ty, at === 0 ? 3.2 : 2, at === 0 ? 2 : L); };
    Z.add(V.dp(16, 0) + 0.5, gun);
    Z.run();
  } });
  // 세이지: 긴 금 로브 + 청록 띠, 두건 속 눈 2, 머리 위 떠 있는 고리, 호버
  U.sage = unit({ sc: 1.46, w: 28, h: 58, oy: 50, move: 2, glow: [[3, -23, 4]], draw(P, X, f, K) {
    const { V, L, mv, at } = K, Z = zs(), sw = mv === 1 ? 1 : 0;
    hoverGlow(P, X, V, 5.5, mv >= 0 ? mv : 0);
    const [rx, ry] = V.pj(0, 0, 0), hy = ry - 30 + (mv === 1 ? -1 : 0);
    ring(P, rx, hy, 7.5, 2.8, 1.8, X.s, 'back', 1);
    Z.add(0, () => {
      const oct = (r, b) => [[r, 0], [r * 0.7, r * 0.7], [0, r], [-r * 0.7 - b, r * 0.7], [-r - b, 0], [-r * 0.7 - b, -r * 0.7], [0, -r], [r * 0.7, -r * 0.7]];
      hull(P, V, oct(6.8, sw), 2, 5, X.s); hull(P, V, oct(5.2, sw * 0.5), 7, 5, X.s); hull(P, V, oct(3.8, 0), 12, 7, X.s);   // 아래로 퍼지는 로브
      for (const sd of [-1, 1]) { const a = V.pj(1, sd * 4.2, 17), b = V.pj(2.5, sd * 4.8, 11); P.line(a[0], a[1], b[0], b[1], X.s.d); }   // 소매
      const s1 = V.pj(3.6, -2, 15), s2 = V.pj(5, 2, 4); P.line(s1[0], s1[1], s2[0], s2[1], en(X, L, 2)); const s3 = V.pj(5.2, 0, 7); P.dot(s3[0], s3[1], en(X, L, 3));
      const [hx, hy2] = V.pj(0, 0, 23); ball(P, hx, hy2, 3.6, 3.6, X.s);
      if (V.dp(1, 0) > -0.5) { const [fx, fy] = V.pj(2.6, 0, 22.5); P.r(fx - 2, fy - 1, 4, 3, X.k); for (const s of [-1, 1]) { const [ex, ey] = V.pj(3, s * 1.2, 23); P.dot(ex, ey, en(X, L, 3)); } }
    });
    for (const s of [-1, 1]) { const hp = at >= 0 ? [3, s * 5, 22 + at * 2] : [3, s * 4.5, 13]; Z.add(V.dp(3, s * 5), () => { const [x, y] = V.pj(...hp); core(P, X, x, y, at >= 0 ? 2.4 : 1.5, at >= 0 ? 2 : L); }); }
    Z.run();
    ring(P, rx, hy, 7.5, 2.8, 1.8, X.s, 'front', 1);
  } });
  // 엄브라: 어두운 금(dusk) 망토 + 보라빛 청록 낫 날 하나, 호버
  U.umbra = unit({ sc: 1.45, w: 46, h: 51, oy: 42, move: 2, glow: [[3, -21, 3]], draw(P, X, f, K) {
    const { V, mv, at } = K, Z = zs(), D = X.dk, Vr = X.v, sw = mv === 1 ? 1.2 : 0, Lv = at === 0 ? 2 : 1;
    const [gx, gy] = V.pj(0, 0, 0); P.fell(gx, gy, 6, 2.5, Vr.d); P.fell(gx, gy - 0.5, 3.5, 1.4, Vr.l);
    Z.add(0, () => {
      hull(P, V, [[4, 0], [2.5, 5.5], [-2, 7], [-6 - sw, 5], [-8 - sw, 0], [-6 - sw, -5], [-2, -7], [2.5, -5.5]], 2, 9, D, { lit: Vr.d });
      hull(P, V, [[3, 0], [1.5, 4.5], [-2, 5], [-4, 2], [-4, -2], [-2, -5], [1.5, -4.5]], 11, 7, D, { lit: Vr.m });
      const [hx, hy] = V.pj(0.5, 0, 21); ball(P, hx, hy, 3.6, 3.8, D);
      const [tx, ty] = V.pj(-2.5, 0, 25); P.fpoly([[hx - 2, hy - 2], [tx, ty - 2], [hx + 1, hy - 3]], D.l);   // 두건 뾰족 끝
      if (V.dp(1, 0) > -0.5) { const [ex, ey] = V.pj(3, 0, 21); P.r(ex - 1, ey, 3, 1, enV(X, Lv, 3, Vr)); }
      const [sx, sy] = V.pj(1, 0, 15); P.dot(sx, sy, enV(X, Lv, 2, Vr), 2, 1);
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, p = V.pj(Math.cos(a) * 6.2 - 2 - sw, Math.sin(a) * 6.5, 2.5); if (Math.sin(a) * V.ca + Math.cos(a) * V.sa > -0.3) P.dot(p[0], p[1], enV(X, Lv, 1 + (k & 1), Vr), 2, 1); }   // 밑단 보라 빛 테
      const c1 = V.pj(2.6, -3, 17), c2 = V.pj(3.2, 3, 12); P.line(c1[0], c1[1], c2[0], c2[1], Vr.d);
    });
    const hand = [3, 5, 12], tip = at === 0 ? [-2, 8, 26] : at === 1 ? [14, -2, 8] : [7, 6, 3];
    Z.add(V.dp(6, 7), () => {
      const p = V.pj(...hand), q = V.pj(...tip), r = V.pj(tip[0] + (at === 1 ? -3 : 3), tip[1] - 3, tip[2] + (at === 0 ? -6 : 4));
      P.line(p[0], p[1], q[0], q[1], D.l);
      P.fpoly([[q[0], q[1]], [r[0], r[1]], [(q[0] + r[0]) / 2 + 3, (q[1] + r[1]) / 2 + 3]], enV(X, Lv, 1, Vr)); P.fpoly([[q[0], q[1]], [r[0], r[1]], [(q[0] + r[0]) / 2 + 1, (q[1] + r[1]) / 2 + 1]], enV(X, Lv, 2, Vr));
      P.line(q[0], q[1], r[0], r[1], enV(X, Lv, 3, Vr)); P.dot(q[0], q[1], X.w);
    });
    Z.run();
  } });
  // 어센던트 / 보이드 어센던트: 순수 에너지 구 + 금 왕관 조각 고리(프레임마다 회전) + 아래로 가늘어지는 꼬리
  function ascendant(voidv) {
    return unit({ sc: 1.25, w: 64, h: 69, oy: 66, move: 2, glow: [[0, -28, 16]], draw(P, X, f, K) {
      const { L, mv, at, cx, cy } = K, R = voidv ? X.vo : X.t, Rg = voidv ? X.dk : X.s, c = (k, lv = L) => voidv ? enV(X, lv - 1, k, X.v) : en(X, lv, k);
      const oy = cy - 28, rot = (mv >= 0 ? mv : 0) * 0.4 + (at >= 0 ? 0.2 : 0);
      for (let k = 0; k < 6; k++) { const t = k / 6; P.fell(cx + Math.sin(k + rot * 3) * 1.5, cy - 4 - t * 14, 2 + t * 5, 1 + t * 2, k < 2 ? R.d : c(0)); }
      const seg = back => { for (let k = 0; k < 5; k++) { const a0 = k * TAU / 5 + rot, a1 = a0 + 0.75, s = Math.sin(a0 + 0.37); if ((s < 0) !== back) continue;
        for (let a = a0; a <= a1; a += 0.03) for (let w = 0; w < 3; w++) P.dot(cx + Math.cos(a) * (24 - w * 0.5), oy + 9 + Math.sin(a) * 8 + w, w === 0 ? (Math.cos(a) * LX + Math.sin(a) * LY > 0 ? Rg.h : Rg.l) : w === 1 ? Rg.m : Rg.d); } };
      seg(true);
      P.fell(cx, oy, 15, 15, voidv ? X.vo.o : c(0)); P.fell(cx - 1, oy - 1, 13, 13, c(1)); P.fell(cx - 3, oy - 3, 9, 9, c(2)); P.fell(cx - 4.5, oy - 4.5, 5, 5, c(3));
      if (voidv) { P.fell(cx + 2, oy + 2, 8, 8, X.k); P.fell(cx - 1, oy - 1, 7.5, 7.5, c(1)); P.fell(cx - 3, oy - 3, 4, 4, c(2)); arc(P, cx + 2, oy + 2, 8.5, 8.5, 0.1, 1.6, X.v.h); }
      for (let k = 0; k < 12; k++) { const a = k * TAU / 12 + rot * 2; if (hash(k, 3) & 1) P.dot(cx + Math.cos(a) * 12, oy + Math.sin(a) * 12, voidv ? X.v.h : X.w); }
      P.dot(cx - 6, oy - 7, X.w, 2, 2);
      for (const s of [-1, 0, 1]) fin(P, Rg, [cx + s * 7 - 2, oy - 13 + Math.abs(s) * 2], [cx + s * 7 + 2, oy - 13 + Math.abs(s) * 2], [cx + s * 9, oy - (s ? 20 : 24)], [cx + s * 7 - 3, oy - 17], [cx + s * 8 + 3, oy - 17]);
      seg(false);
      if (at === 0) { P.fell(cx, oy, 6, 6, X.w); }
    } });
  }
  U.ascendant = ascendant(false);
  U.voidascendant = ascendant(true);
  // 크루시블: 바퀴 없이 떠 있는 금 포대 + 열린 등 격납칸 속 청록 파쇄구 3 + 앞 방출구
  U.crucible = unit({ sc: 1.53, w: 94, h: 81, oy: 58, move: 2, glow: [[-3, -18, 6], [26, -11, 4]], draw(P, X, f, K) {
    const { V, L, mv, at } = K, Z = zs();
    for (const [u, v] of [[10, 11], [10, -11], [-12, 11], [-12, -11]]) { const [x, y] = V.pj(u, v, 0); P.fell(x, y, 4, 1.8, en(X, L, mv === 1 ? 1 : 0)); P.dot(x - 1, y, en(X, L, 2), 2, 1); }
    Z.add(0, () => {
      hull(P, V, lens(46, 30, 12, 0.5), 5, 9, X.s);
      hull(P, V, [[10, 0], [6, 8], [-10, 9], [-16, 5], [-16, -5], [-10, -9], [6, -8]], 14, 3, X.s, { inset: false });
      hull(P, V, [[6, 0], [3, 6], [-9, 6], [-12, 3], [-12, -3], [-9, -6], [3, -6]], 17, 0, X.s, { top: X.s.o, inset: false });
      for (const [u, v] of [[0, -2.8], [-6, 2.8], [-7, -2.8], [0, 2.8]].slice(0, 3)) { const [x, y] = V.pj(u, v, 18); core(P, X, x, y - 1, 2.6, L); }
      for (const s of [-1, 1]) { const a = V.pj(-6, s * 10, 17), b = V.pj(-14, s * 13, 25); P.fpoly([a, V.pj(2, s * 9, 17), b], X.s.l); }   // 격납 날개 뚜껑(열림)
    });
    Z.add(V.dp(22, 0) + 0.5, () => { hull(P, V, [[26, 0], [23, 3], [18, 3.5], [18, -3.5], [23, -3]], 9, 4, X.s, { inset: false }); const [x, y] = V.pj(26.5, 0, 11); core(P, X, x, y, at === 0 ? 3.5 : 2, at >= 0 ? 2 : L); });
    Z.run();
  } });
  // 파쇄구: 작은 청록 구 + 금 띠, 호버
  U.shard = unit({ sc: 1.47, w: 20, h: 21, oy: 18, move: 2, glow: [[0, -7, 4]], draw(P, X, f, K) {
    const { L, mv, at, cx, cy } = K;
    P.fell(cx, cy - 1, 3, 1.2, en(X, L, 0));
    core(P, X, cx, cy - 7, 4.6, at >= 0 ? 2 : L);
    const rot = mv === 1 ? 1 : 0; arc(P, cx, cy - 7 + rot * 0.5, 5.4, 2.2, 0.1, Math.PI - 0.1, X.s.l); arc(P, cx, cy - 6 + rot * 0.5, 5.2, 2, 0.2, Math.PI - 0.2, X.s.d);
  } });
  // 스키프(공중 수송·마법): 넓은 금 렌즈 동체 + 청록 덮개 + 엔진 포드 2 + 뒤 추진광
  U.skiff = unit({ sc: 1.49, w: 68, h: 55, oy: 34, move: 2, glow: [[9, -9, 5], [-16, -5, 4]], draw(P, X, f, K) {
    const { V, L, mv } = K, th = mv === 1 ? 2 : 1;
    // 포드는 동체 좌표를 v 로 옮겨 그린다
    const pod = s => { const W = { ...V, pj: (u, v, z) => V.pj(u - 2, v + s * 14, z) }; hull(P, W, lens(22, 7, 8), 3, 4, X.s); const [x, y] = W.pj(-10, 0, 5); P.fell(x, y, 2 + th * 0.5, 2, en(X, L, th + 1)); P.dot(x, y, X.w); };
    const Z2 = zs(); Z2.add(V.dp(0, -14), () => pod(-1)); Z2.add(V.dp(0, 14), () => pod(1));
    Z2.add(0, () => {
      for (const s of [-1, 1]) P.fpoly([V.pj(2, s * 6, 5), V.pj(-4, s * 13, 5), V.pj(-10, s * 13, 5), V.pj(-8, s * 6, 5)], X.s.d);
      hull(P, V, lens(40, 22, 12), 2, 6, X.s);
      hull(P, V, [[14, 0], [11, 3.5], [5, 4.5], [3, 0], [5, -4.5], [11, -3.5]], 8, 2, X.t, { top: en(X, L, 2), lit: en(X, L, 3) });
      const [x, y] = V.pj(-16, 0, 5); P.fell(x, y, 2.5, 2, en(X, L, th + 1));
    });
    Z2.run();
  } });
  // 와처: 눈 하나 금 원반 + 아래 작은 고리, 공중
  U.watcher = unit({ sc: 1.52, w: 48, h: 40, oy: 30, move: 2, glow: [[2, -10, 6]], draw(P, X, f, K) {
    const { V, L, mv, cx, cy } = K;
    ring(P, cx, cy + 1 + (mv === 1 ? 1 : 0), 6, 2, 1.5, { d: en(X, L, 0), m: en(X, L, 1), l: en(X, L, 2), h: en(X, L, 3) }, 'all', 0);
    for (const s of [-1, 1]) { const a = V.pj(-4, s * 8, 6), b = V.pj(-9, s * 12, 9), c2 = V.pj(-2, s * 11, 5); P.fpoly([a, b, c2], X.s.d); }
    hull(P, V, (() => { const p = []; for (let k = 0; k < 10; k++) p.push([Math.cos(k / 10 * TAU) * 11, Math.sin(k / 10 * TAU) * 11]); return p; })(), 3, 3, X.s);
    const [ex, ey] = V.pj(0, 0, 9);
    ring(P, ex, ey - 1, 9, 6.5, 2.2, X.s, 'all', 1);                                   // 눈테
    P.fell(ex, ey - 1, 6.8, 4.6, X.w);
    const [ix, iy] = V.pj(2.6, 0, 9); P.fell(ix, iy - 1, 3.8, 3.4, en(X, L, 1)); P.fell(ix - 0.4, iy - 1.4, 2.8, 2.4, en(X, L, 2));
    P.fell(ix + 0.3, iy - 0.8, 1.4, 1.4, X.k); P.dot(ix - 2, iy - 3, X.w);
  } });
  // 센티넬: 날개 3장(좌우 후퇴익 + 등 지느러미) 금 전투기 + 청록 조종석, 공중
  U.sentinel = unit({ sc: 1.7, w: 86, h: 82, oy: 58, move: 2, glow: [[8, -10, 4], [-15, -6, 4]], draw(P, X, f, K) {
    const { V, L, mv, at } = K, Z = zs(), th = mv === 1 ? 2 : 1;
    for (const s of [-1, 1]) Z.add(V.dp(-4, s * 14), () => { hull(P, V, [[6, s * 4], [-6, s * 22], [-12, s * 22], [-8, s * 4]], 4, 2, X.s); const a = V.pj(-6, s * 22, 6), b = V.pj(-12, s * 22, 6); P.line(a[0], a[1], b[0], b[1], en(X, L, 2)); });
    Z.add(0, () => {
      hull(P, V, lens(40, 13, 10), 3, 6, X.s);
      hull(P, V, [[12, 0], [9, 2.5], [4, 3], [3, 0], [4, -3], [9, -2.5]], 9, 2, X.t, { top: en(X, L, 2), lit: en(X, L, 3) });
      P.fpoly([V.pj(-2, -0.9, 9), V.pj(-16, 0, 22), V.pj(-17, 0, 18), V.pj(-12, 0.9, 9)], X.s.l); P.fpoly([V.pj(-2, 0.9, 9), V.pj(-16, 0, 22), V.pj(-12, -0.9, 9)], X.s.m);  // 등 날개(옆에서 봐도 두께)
      const a = V.pj(-16, 0, 22), b = V.pj(-17, 0, 18); P.line(a[0], a[1], b[0], b[1], en(X, L, 3));
      const [x, y] = V.pj(-15, 0, 6); P.fell(x, y, 2 + th * 0.6, 2, en(X, L, th + 1)); P.dot(x, y, X.w);
      if (at === 0) { const [mx, my] = V.pj(21, 0, 6); core(P, X, mx, my, 2.5, 2); }
    });
    Z.run();
  } });
  // 스키머: 납작한 화살촉 정찰선 + 청록 빛 줄 2, 공중
  U.skimmer = unit({ sc: 1.8, w: 68, h: 54, oy: 35, move: 2, glow: [[5, -7, 3]], draw(P, X, f, K) {
    const { V, L, mv, at } = K, th = mv === 1 ? 2 : 1;
    hull(P, V, [[18, 0], [4, 5], [-12, 10], [-10, 0], [-12, -10], [4, -5]], 3, 3, X.s);
    for (const s of [-1, 1]) { const a = V.pj(12, s * 1.6, 6), b = V.pj(-8, s * 6.5, 6); P.line(a[0], a[1], b[0], b[1], en(X, L, at >= 0 ? 3 : 2)); }
    hull(P, V, [[9, 0], [5, 2], [0, 2], [0, -2], [5, -2]], 6, 2, X.t, { top: en(X, L, 2), inset: false });
    for (const s of [-1, 1]) { const [x, y] = V.pj(-11, s * 8, 4); P.fell(x, y, 1 + th * 0.6, 1.2, en(X, L, th + 1)); }
  } });
  // 아크(모함 136×84 기준): 거대 금 렌즈 동체, 등 위 격납고 문 3(청록), 뒤 함교, 추진광
  U.ark = unit({ sc: 1.6, w: 164, h: 140, oy: 84, move: 2, glow: [[18, -17, 6], [3, -17, 6], [-12, -17, 6], [42, -10, 4]], draw(P, X, f, K) {
    const { V, L, mv, at } = K, Z = zs(), th = mv === 1 ? 2 : 1;
    for (const s of [-1, 1]) Z.add(V.dp(-8, s * 26), () => { const W = { ...V, pj: (u, v, z) => V.pj(u - 14, v + s * 26, z) }; hull(P, W, lens(44, 12, 10), 2, 6, X.s); const [x, y] = W.pj(-20, 0, 5); P.fell(x, y, 3 + th, 3, en(X, L, th + 1)); P.dot(x - 1, y, X.w, 2, 1); });
    Z.add(0, () => {
      hull(P, V, lens(100, 44, 14, 0.45), 2, 12, X.s);
      hull(P, V, [[34, 0], [26, 11], [-26, 15], [-36, 9], [-36, -9], [-26, -15], [26, -11]], 14, 3, X.s, { inset: false });
      for (let k = 0; k < 3; k++) { const u = 18 - k * 15, W = { ...V, pj: (a, b, z) => V.pj(a + u, b, z) };
        hull(P, W, [[5, 0], [4, 6], [-5, 6], [-5, -6], [4, -6]], 17, 0, X.s, { top: X.s.o, inset: false });
        hull(P, W, [[4, 0], [3, 4.5], [-4, 4.5], [-4, -4.5], [3, -4.5]], 17, 0, X.t, { top: en(X, at >= 0 ? 2 : L, (k + K.i) % 3 === 0 ? 3 : 2), inset: false }); }
      const Wb = { ...V, pj: (a, b, z) => V.pj(a - 30, b, z) };
      hull(P, Wb, [[6, 0], [3, 5], [-5, 5], [-7, 0], [-5, -5], [3, -5]], 17, 8, X.s);
      const [wx, wy] = Wb.pj(5.5, 0, 22); P.r(wx - 2, wy - 1, 4, 2, en(X, L, 3));
      const [cx, cy] = V.pj(42, 0, 10); core(P, X, cx, cy, 3, L);
    });
    Z.run();
  } });
  // 스파크(아크 함재기): 작은 금 다트 + 청록 꼬리빛
  U.spark = unit({ sc: 1.39, w: 24, h: 19, oy: 12, move: 2, glow: [[1, -3, 3]], draw(P, X, f, K) {
    const { V, L, mv, at } = K;
    const [x, y] = V.pj(-5, 0, 2); P.fell(x, y, 1.5 + (mv === 1 ? 1 : 0), 1.5, en(X, L, 2));
    hull(P, V, [[6, 0], [-4, 4], [-2, 0], [-4, -4]], 1, 2, X.s, { inset: false });
    const [cx, cy] = V.pj(1, 0, 3); P.dot(cx, cy, at >= 0 ? X.w : en(X, L, 3));
  } });
  // 워든: 청록 코어 둘레를 도는 떠 있는 금 방패판 3(이동 프레임마다 회전)
  U.warden = unit({ sc: 1.43, w: 70, h: 71, oy: 64, move: 2, glow: [[0, -26, 9]], draw(P, X, f, K) {
    const { L, mv, at, cx, cy } = K, oy = cy - 26, rot = (mv >= 0 ? mv : 0) * 0.35 + (f.ang || 0) * 0.15;
    P.fell(cx, cy, 10, 3, en(X, L, 0)); P.fell(cx - 1, cy - 0.5, 6, 1.6, en(X, L, 2));
    for (let y = oy + 10; y < cy - 2; y += 2) P.dot(cx, y, en(X, L, 1));
    const plate = back => { for (let k = 0; k < 3; k++) { const a = k * TAU / 3 + rot, s = Math.sin(a), c = Math.cos(a); if ((s < 0) !== back) continue;
      const x = cx + c * 20, y = oy + s * 7 + 2, hw = 3 + Math.abs(s) * 4;               // 방패판: 옆에서 보면 좁고, 앞뒤에서 보면 넓다
      const pts = [[x - hw, y - 9], [x, y - 13], [x + hw, y - 9], [x + hw * 0.9, y + 4], [x, y + 11], [x - hw * 0.9, y + 4]];
      P.fpoly(pts, back ? X.s.d : X.s.m);
      P.fpoly([[x - hw + 1, y - 8], [x, y - 11], [x, y + 8], [x - hw * 0.8, y + 3]], back ? X.s.m : X.s.l);
      P.line(x, y - 11, x, y + 8, back ? X.s.m : X.s.h);
      P.dot(x - 0.5, y - 2, en(X, L, back ? 1 : 3), 2, 2); } };
    plate(true);
    ring(P, cx, oy + 8, 15, 4.5, 2, X.s, 'back', 1);
    core(P, X, cx, oy, 9, at === 0 ? 2 : L);
    ring(P, cx, oy + 8, 15, 4.5, 2, X.s, 'front', 1);
    plate(false);
  } });

  // ---------- 잔해 ----------
  function wreck(n, w) {
    return { w, h: Math.round(w * 0.7), px: 1, ox: w / 2, oy: Math.round(w * 0.55), dirs: 1, frames: { idle: 1 }, draw(P, c, f) {
      const X = pal(c, f.T), cx = w / 2, cy = Math.round(w * 0.55), sd = strHash('wreck' + n);
      for (let k = 0; k < n; k++) {
        const h = hash(sd, k), a = (h & 255) / 255 * TAU, r = ((h >>> 8) & 255) / 255 * w * 0.32, x = cx + Math.cos(a) * r, y = cy - 2 + Math.sin(a) * r * 0.55, s = 2 + ((h >>> 16) % Math.max(2, w / 6));
        if (k % 3 === 2) { P.fpoly([[x - s * 0.5, y], [x, y - s * 1.2], [x + s * 0.5, y]], X.G[1]); P.dot(x - 1, y - s * 0.6, X.G[2]); continue; }   // 꺼진 수정
        const pts = [[x - s, y], [x - s * 0.3, y - s * 0.7], [x + s, y - s * 0.4], [x + s * 0.6, y + s * 0.3]];
        P.fpoly(pts, (h >>> 20) & 1 ? X.s.d : X.s.m); P.line(pts[0][0], pts[0][1], pts[1][0], pts[1][1], X.s.l);
      }
    } };
  }

  // 연출 화면(VS·로비 분대)의 공격 섬광 자리: muzzle = 대기 동쪽 자세, muzzleSE = 대기 남동 자세(캔버스 좌표, 외곽선 1px 포함)
  U.arcwalker.muzzle = [66, 29]; U.arcwalker.muzzleSE = [56, 44];
  U.crucible = A.grow(U.crucible, 1.08); U.sentinel = A.grow(U.sentinel, 1.07);   // Task 9: 옛 화면 크기 이상으로
  Object.assign(A.SPR, B, U, { 'wreck@elysian-s': wreck(3, 14), 'wreck@elysian-m': wreck(6, 24), 'wreck@elysian-l': wreck(10, 40) });
})();
