// 네뷸라 워 — 레기온 아트(건물 18 · 유닛 13 · 포격 모드 · 잔해) + 중립 자원(분출구 · 운반물).
// art.js 다음, render.js 전에 불러온다. art.js 의 SPR 표에 새 정의(px: 1)를 덮어써 등록한다 — 옛 반해상도 정의는 art.js 에 그대로 남는다.
// 화풍: 각진 강철·콘크리트 직육면체 조립, 지붕 주황 띠, 창 발광. 빛은 좌상단, 면마다 밝음(l)·중간(m)·어둠(d) + 외곽선(o).
// 무작위는 해시뿐(Math.random 금지). node 에서도 불러올 수 있다(테스트) — document 를 쓰지 않는다.
(() => {
  const A = typeof NW_ART !== 'undefined' ? NW_ART : require('./art.js');
  const { css, mix, ramp, shade } = A;
  const LX = -0.6, LY = -0.8, FLAT = 0.7, TAU = Math.PI * 2;
  const hash = (x, y) => { let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
  const strHash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

  // ---- 레기온 보조 램프(토큰에서 파생, T 하나당 한 번) ----
  const memo = new Map(); let memoT = null;
  const rp = (T, id, mk) => { if (memoT !== T) { memo.clear(); memoT = T; } let r = memo.get(id); if (!r) { r = ramp(mk(), T); memo.set(id, r); } return r; };
  const pals = T => ({
    gun: rp(T, 'lg-gun', () => shade(T['legion-a'], 0.55)),                         // 포금(궤도·총·배관)
    slab: rp(T, 'lg-slab', () => mix(T['legion-a'], T['color-void'], 0.5)),           // 콘크리트 판
    dark: rp(T, 'lg-dark', () => mix(T['legion-a'], T['color-void'], 0.42)),          // 셰이드 장갑
    glass: rp(T, 'lg-glass', () => T.crystal),
    gas: rp(T, 'lg-gas', () => T['color-gas']),
    rock: rp(T, 'lg-rock', () => mix(T.rock, T['color-glint'], 0.16)),
    teal: css(T['elysian-b'], 1.25), hot: css(T['color-fire']),
  });

  // ---- 3/4 시점 리그: 몸 좌표(u 전방, v 오른쪽, z 위) → 화면. add() 로 부품을 모아 깊이(지면 y + z·0.3) 순으로 그린다 ----
  // K = 배율(보병은 1.3 — 몸 좌표 수치는 그대로 두고 화면에서 키운다)
  function rig(P, CX, CY, ang, K = 1) {
    const ca = Math.cos(ang), sa = Math.sin(ang), q = [];
    const gp = (u, v) => [CX + (u * ca - v * sa) * K, CY + (u * sa + v * ca) * FLAT * K];
    const sp = (u, v, z) => { const g = gp(u, v); return [g[0], g[1] - z * K]; };
    const G = {
      ca, sa, gp, sp, K,
      box(u, v, z, len, wid, hgt, r) { const [x, y] = gp(u, v); return P.prism(x, y, z * K, len * K, wid * K, hgt * K, ang, r); },
      // 돌출 다각형(볼록): 몸 좌표 꼭짓점, 보이는 옆면 → m/d, 윗면 l, 앞 모서리 h
      poly(pts, z, hgt, r, edge = true) {
        const n = pts.length; let cu = 0, cv = 0; for (const p of pts) { cu += p[0]; cv += p[1]; } cu /= n; cv /= n;
        const g = pts.map(([u, v]) => gp(u, v)), bot = g.map(([x, y]) => [x, y - z]), top = g.map(([x, y]) => [x, y - z - hgt]), vis = [];
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n, a = pts[i], b = pts[j];
          let nu = b[1] - a[1], nv = -(b[0] - a[0]);
          if (nu * ((a[0] + b[0]) / 2 - cu) + nv * ((a[1] + b[1]) / 2 - cv) < 0) { nu = -nu; nv = -nv; }
          const L = Math.hypot(nu, nv) || 1; nu /= L; nv /= L;
          const nx = nu * ca - nv * sa, ny = nu * sa + nv * ca;
          if (ny <= 0.01) continue;
          vis.push(i);
          if (hgt > 0) P.fpoly([bot[i], bot[j], top[j], top[i]], nx * LX + ny * LY > 0.2 ? r.m : r.d);
        }
        P.fpoly(top, r.l);
        if (edge && r.h) for (const i of vis) { const j = (i + 1) % n; P.line(top[i][0], top[i][1] - 0.5, top[j][0], top[j][1] - 0.5, r.h); }
        return top;
      },
      cyl(u, v, z, r, hgt, rr) { const [x, y] = gp(u, v); P.cyl(x, y, z * K, r * K, hgt * K, rr); },
      dot(u, v, z, c, w = 1, h = 1) { const [x, y] = sp(u, v, z); P.dot(Math.round(x - (w - 1) / 2 - 0.01), Math.round(y - (h - 1) / 2 - 0.01), c, w, h); },
      line(a, b, c) { const p = sp(...a), r = sp(...b); P.line(p[0], p[1], r[0], r[1], c); },
      // 굵은 막대(다리·포신·안테나): 3D 두 점 사이 평행사변형, 빛 받는 쪽 가장자리 l
      strut(a, b, w, r) { const p = sp(...a), q2 = sp(...b); strut2(P, p, q2, w, r); },
      add(u, v, z, fn) { q.push([gp(u, v)[1] + z * 0.3, q.length, fn]); },
      flush() { q.sort((a, b) => a[0] - b[0] || a[1] - b[1]); for (const e of q) e[2](); q.length = 0; },
    };
    return G;
  }
  function strut2(P, p, q, w, r) {
    const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L * w / 2, ny = dx / L * w / 2;
    P.fpoly([[p[0] + nx, p[1] + ny], [q[0] + nx, q[1] + ny], [q[0] - nx, q[1] - ny], [p[0] - nx, p[1] - ny]], r.d);
    const s = nx * LX + ny * LY > 0 ? 1 : -1, k = w > 2 ? 0.5 : 0.2;
    P.line(p[0] + s * nx * k, p[1] + s * ny * k, q[0] + s * nx * k, q[1] + s * ny * k, r.l);
  }

  // ===================================================================== 건물 =====================================================================
  // 화면 좌표 상자: 왼쪽 x0, 앞 아래 모서리 y yB, 폭 w, 윗면 화면 깊이 dS, 높이 h (garrison 의 box 와 같은 규칙, 윗면 l · 정면 d)
  const bx = (P, x0, yB, w, dS, h, r) => P.prism(x0 + w / 2, yB - dS / 2, 0, w, dS / FLAT, h, 0, r);
  // 경고 사선(주황/외곽선)
  function stripes(P, k, x0, y0, w, h) { for (let x = x0; x < x0 + w; x++) for (let y = y0; y < y0 + h; y++) P.dot(x, y, ((x + (y0 + h - 1 - y)) >> 2) & 1 ? k.c.s.o : k.c.t.l); }
  // 셔터 문: 경고 사선 머리 + 가로 줄눈
  function shutter(P, k, x, y, w, h) {
    const s = k.c.s; stripes(P, k, x - 1, y - 4, w + 2, 4);
    P.r(x - 1, y, w + 2, h, s.o); P.r(x, y + 1, w, h - 1, s.d);
    for (let yy = y + 3; yy < y + h; yy += 3) P.r(x, yy, w, 1, s.o);
    P.r(x, y + 1, w, 1, s.m);
  }
  // 창: 가동 중이면 발광(5칸마다 유리색), 손상이면 일부 꺼짐
  function win(P, k, x, y, w, h, n) {
    const c = k.c; P.r(x - 1, y - 1, w + 2, h + 2, c.s.o);
    const off = !k.live || (k.dmg >= 1 && n % 3 === 2) || (k.dmg >= 2 && n % 2 === 1);
    P.r(x, y, w, h, off ? c.k : (n + k.i) % 5 === 0 ? c.g : c.glow);
    if (!off) P.r(x, y, Math.min(2, w), 1, c.w);
    P.r(x - 1, y + h + 1, w + 2, 1, c.s.m);                                                    // 창턱
  }
  const lamp = (P, k, x, y, on, w = 2, h = 1) => P.dot(x, y, k.live && on ? k.c.glow : k.c.s.o, w, h);
  // 콘크리트 판(터 전체) + 이음매
  function pad(P, k) {
    const { W, H, oy, X } = k, yB = oy + H - 2, top = oy + 5;
    const sl = X.slab, flat = { o: sl.o, d: sl.d, m: sl.m, l: sl.m, h: sl.l };                  // 판 윗면은 한 단 어둡게(건물 지붕과 구분)
    bx(P, 3, yB, W - 6, H - 10, 3, flat);
    for (let x = 27; x < W - 4; x += 24) P.r(x, top, 1, H - 10, sl.d);
    for (let y = top + 22; y < yB - 6; y += 28) P.r(4, y, W - 8, 1, sl.d);
    for (let x = 6; x < W - 6; x += 5) P.dot(x, top, sl.l);
  }
  // 부속 연결관(본체는 왼쪽): 왼쪽 가장자리로 뻗은 포금 관 + 주황 이음 고리
  function coupler(P, k, yB) { bx(P, 0, yB, 12, 8, 6, k.X.gun); P.r(5, yB - 6, 2, 6, k.c.t.m); P.r(5, yB - 6, 1, 6, k.c.t.l); }
  // 건설 0단: 기초 + 기둥 + 비계 · 1단: 아래 절반(덜 마른 윗면) + 기둥 + 위 비계
  function frameStage(P, k, mass, half) {
    const s = k.c.s, X = k.X, raw = { o: s.o, d: s.d, m: s.m, l: X.slab.l, h: X.slab.h };
    for (const [x0, yB, w, dS] of mass) bx(P, x0, yB, w, dS, 2, X.slab);
    for (const [x0, yB, w, dS, h] of mass) {
      if (half) bx(P, x0, yB, w, dS, Math.max(4, Math.round(h * 0.5)), raw);
      const top = yB - h - 2;
      for (const [x, y] of [[x0 + 1, yB - dS + 3], [x0 + w - 5, yB - dS + 3], [x0 + 1, yB], [x0 + w - 5, yB]]) bx(P, x, y, 4, 3, h + 2, s);
      const y0 = half ? top : top, y1 = half ? yB - Math.round(h * 0.5) : yB, xm = x0 + w / 2;
      for (const [a, b] of [[x0 + 3, xm], [xm, x0 + w - 3]]) { P.line(a, y1, b, y0, s.o); P.line(a, y0, b, y1, s.o); }
      P.line(x0 + 1, y0, x0 + w - 2, y0, s.o); P.line(x0 + 1, y0 + 1, x0 + w - 2, y0 + 1, s.d);
    }
    const [x0, yB] = mass[0];
    bx(P, x0 + 2, yB + 6, 7, 5, 4, X.gun); bx(P, x0 + 10, yB + 6, 5, 5, 3, k.c.t);       // 자재 더미
  }
  // 띄운 건물: 아래 분사구 + 불꽃(2프레임)
  function thrusters(P, k, pts) {
    const g = k.X.gun, c = k.c;
    for (const [x, y] of pts) {
      P.r(x - 3, y, 7, 3, g.o); P.r(x - 2, y, 5, 2, g.d); P.r(x - 2, y, 5, 1, g.l);
      P.r(x - 1, y + 3, 3, 2 + (k.i & 1), c.glow); P.r(x, y + 3, 1, 1 + (k.i & 1), c.w);
      if (k.i & 1) P.dot(x, y + 6, c.t.l);
    }
  }
  // 손상: 그을음 얼룩(1단 3곳, 2단 5곳) — 얼룩 안쪽은 2×2 블록 절반, 가장자리는 1/4 을 void .55 로 섞는다(판은 나중에 뒤에 깔려 그을리지 않는다).
  // 금 간 선(1단 1개, 2단 2개)
  function soot(P, k, seed) {
    const ctx = P.ctx, cv = ctx.canvas, W = cv.width, H = cv.height, img = ctx.getImageData(0, 0, W, H), d = img.data, V = k.T['color-void'];
    const n = k.dmg >= 2 ? 5 : 3, sp = [];
    for (let j = 0; j < n; j++) { const h = hash(seed, j + 11); sp.push([8 + (h & 1023) / 1023 * (W - 16), 4 + ((h >>> 10) & 1023) / 1023 * (k.oy + k.H * 0.75), (k.dmg >= 2 ? 11 : 8) + ((h >>> 20) & 7) * W / 128]); }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4; if (d[i + 3] < 110) continue;
      let r = 9; for (const [cx, cy, rr] of sp) r = Math.min(r, Math.hypot(x - cx, (y - cy) * 1.3) / rr);
      if (r >= 1) continue;
      const hb = hash(seed + (x >> 1), (y >> 1) * 131 + 7) & 3;
      if (r < 0.6 ? hb > 1 : hb > 0) continue;
      for (let c = 0; c < 3; c++) d[i + c] += (V[c] - d[i + c]) * 0.55;
    }
    ctx.putImageData(img, 0, 0);
    const nc = k.dmg >= 2 ? 2 : 1, cx0 = k.W / 2, cy0 = k.oy + k.H * 0.45;
    for (let j = 0; j < nc; j++) {
      const h = hash(seed, j + 3);
      let x = cx0 + ((h & 63) - 32) * k.W / 96, y = cy0 + (((h >>> 6) & 31) - 16) * k.H / 64;
      for (let s = 0; s < 4; s++) { const r = hash(h, s), nx = x + ((r & 7) - 3), ny = y + 3 + ((r >>> 3) & 3); P.line(x, y, nx, ny, k.c.s.o); x = nx; y = ny; }
    }
  }
  // 레기온 건물 정의: 터 W×H 타일, oy = 터 위로 솟은 높이. spec.body(P, c, k) 가 완성 모습을 그린다.
  // k = { T, X, c, stage(0..3), live(가동), dmg(0..2), lift, i(프레임), W, H(터 px), oy }
  function legion(id, w, h, oy, spec) {
    const W = w * 32, H = h * 32, seed = strHash(id);
    return {
      w: W, h: H + oy, px: 1, ox: 0, oy, dirs: 1, frames: spec.lift ? { build: 3, work: 4, lift: 2 } : { build: 3, work: 4 },
      glow: spec.glow || [], smoke: spec.smoke || [], shadowPose: 'l0',                // 그림자는 판 없이(띄운 자세 0)
      draw(P, c, f) {
        const T = f.T, X = pals(T), stage = f.anim === 'build' ? f.i : 3, lift = f.anim === 'lift';
        const k = { T, X, c, stage, live: stage === 3, dmg: f.dmg || 0, lift, i: f.anim === 'work' || lift ? f.i : 0, W, H, oy };
        if (stage < 2) { pad(P, k); frameStage(P, k, spec.mass, stage === 1); return; }
        spec.body(P, c, k);
        if (lift) thrusters(P, k, spec.thr || spec.mass.slice(0, 1).flatMap(([x0, yB, ww]) => [[x0 + 10, yB], [x0 + ww / 2, yB], [x0 + ww - 10, yB]]));
        if (k.dmg) soot(P, k, seed);
        if (!lift) { P.ctx.globalCompositeOperation = 'destination-over'; pad(P, k); P.ctx.globalCompositeOperation = 'source-over'; }   // 판은 몸 뒤에
      },
    };
  }

  const B = {};
  // ---- 사령부 4×3: 넓은 기단 + 2층 + 지휘탑(레이더 접시·안테나), 착륙 다리(띄우면 분사구) ----
  B.hq = legion('hq', 4, 3, 24, {
    lift: true, mass: [[8, 108, 112, 44, 22], [22, 84, 84, 26, 16], [46, 64, 36, 16, 20]],
    glow: [[64, 51, 10], [66, 26, 4], [52, 7, 2], [64, 98, 8]], smoke: [[18, 50], [110, 62]],
    thr: [[18, 108], [64, 108], [110, 108]],
    body(P, c, k) {
      const s = c.s, t = c.t, X = k.X, i = k.i;
      P.dither(112, 50, 10, 58, X.slab.o);                                                      // 판 위 그림자(오른쪽)
      bx(P, 8, 108, 112, 44, 22, s); P.r(8, 86, 1, 22, s.m);                                    // 기단
      P.r(8, 86, 112, 2, t.m); P.r(8, 86, 112, 1, t.l);                                         // 주황 띠
      for (const x of [32, 96]) P.r(x, 88, 1, 20, s.o);
      shutter(P, k, 48, 93, 32, 15); P.r(60, 89, 8, 2, k.live ? c.glow : s.o);                // 정문 + 표시등
      [14, 23, 103, 112].forEach((x, n) => win(P, k, x, 92, 5, 5, n));
      for (const x of [37, 41, 87, 91]) P.r(x, 95, 2, 9, s.o);
      if (!k.lift) for (const x of [10, 112]) bx(P, x, 112, 6, 4, 6, X.gun);                  // 착륙 다리
      if (!k.lift) for (let n = 0; n < 6; n++) P.r(50 + n * 5, 111, 3, 3, n & 1 ? X.slab.d : t.d);
      P.cyl(18, 78, 0, 4, 24, s); P.fell(18, 54, 3, 1.8, c.k);                                 // 굴뚝
      if (k.live && !k.dmg) P.dot(18, 52 - (i & 1), c.glow);
      P.cyl(110, 80, 0, 3, 14, X.gun); P.fell(110, 66, 2, 1.2, c.k);
      bx(P, 22, 84, 84, 26, 16, s); P.r(22, 68, 1, 16, s.m);                                   // 2층
      for (let n = 0; n < 8; n++) win(P, k, 27 + n * 10, 72, 5, 4, n + 3);
      bx(P, 46, 64, 36, 16, 20, s); P.r(46, 44, 1, 20, s.m);                                   // 지휘탑
      P.r(49, 48, 30, 7, s.o);
      for (let n = 0; n < 4; n++) P.r(50 + n * 7, 49, 6, 5, !k.live ? c.k : (n + i) % 4 === 0 ? c.w : c.g);
      P.r(50, 58, 28, 1, s.o); P.r(62, 58, 4, 6, s.o);
      bx(P, 22, 68, 84, 4, 3, t);                                                               // 2층 지붕 주황 난간
      // 레이더 접시(가동 중 회전: 폭이 변한다)
      const rx = k.live ? [10, 8, 5, 8][i] : 10;
      P.r(65, 28, 2, 6, X.gun.m); P.fell(66, 26, rx, 5, s.o); P.fell(66, 26, Math.max(1, rx - 1), 4, s.l); P.fell(66 + (rx > 6 ? 1 : 0), 26.5, Math.max(1, rx - 3), 2.6, s.d);
      P.line(66, 26, 66 - Math.round(rx * 0.4), 19, X.gun.d); P.dot(66 - Math.round(rx * 0.4), 18, k.live ? c.glow : s.d);
      P.line(52, 30, 52, 8, s.d); P.line(50, 14, 54, 14, s.d); P.line(51, 20, 53, 20, s.d); lamp(P, k, 52, 6, i & 1, 1, 2); // 안테나
    },
  });

  // ---- 주둔지 4×3 (Task 1 견본 그대로 + 띄운 상태) ----
  B.garrison = legion('garrison', 4, 3, 16, {
    lift: true, mass: [[12, 94, 80, 30, 34]], glow: [[52, 64, 6], [80, 25, 2], [110, 32, 3], [19, 71, 4], [28, 71, 4], [76, 71, 4], [85, 71, 4]], smoke: [[110, 30]],
    thr: [[20, 94], [52, 94], [84, 94]],
    body(P, c, k) {
      const s = c.s, t = c.t, i = k.i, live = k.live, dmg = k.dmg, slab = k.X.slab;
      if (!k.lift) { for (let n = 0; n < 7; n++) P.r(40 + n * 7, 101, 4, 3, n & 1 ? slab.d : t.d); P.dither(92, 40, 12, 56, slab.o); P.dither(16, 94, 80, 4, slab.o); }
      P.cyl(110, 72, 3, 6, 32, s); P.fell(110, 37, 4, 2.4, c.k);
      if (live && !dmg) P.dot(110, 32 - (i & 1), c.glow);
      P.r(92, 80, 12, 3, s.d); P.r(92, 80, 12, 1, s.l);
      bx(P, 12, 94, 80, 30, 34, s);
      for (let x = 22; x < 92; x += 10) P.line(x, 31, x, 57, s.m);
      bx(P, 20, 50, 14, 8, 5, s); bx(P, 40, 50, 12, 8, 5, s);
      for (let n = 0; n < 3; n++) P.r(22 + n * 4, 39, 2, 1, s.o);
      bx(P, 68, 46, 16, 6, 2, s); P.line(80, 37, 80, 26, s.d); P.dot(80, 25, live && (i & 1) ? c.glow : s.d);
      bx(P, 12, 60, 80, 5, 3, t);
      for (const x of [34, 70]) P.r(x, 63, 1, 31, s.o);
      stripes(P, k, 38, 66, 28, 4);
      P.r(39, 70, 26, 24, s.o); P.r(41, 71, 22, 23, s.d);
      for (let y = 73; y < 94; y += 3) P.r(41, y, 22, 1, s.o);
      P.r(41, 71, 22, 1, s.m);
      P.r(48, 63, 8, 2, live ? c.glow : s.o);
      [16, 25, 73, 82].forEach((x, n) => win(P, k, x, 69, 6, 5, n));
      for (const x of [18, 28, 76, 86]) P.r(x, 80, 2, 8, s.o);
      P.r(12, 60, 1, 34, s.m);
      if (dmg >= 2) { P.fpoly([[54, 38], [65, 35], [72, 41], [68, 50], [57, 52], [51, 45]], s.o); P.fpoly([[56, 41], [64, 38], [68, 43], [65, 48], [58, 49]], c.k); }
    },
  });

  // ---- 공학 연구소 4×3: 톱니 지붕 홀 + 지붕 위 주황 갠트리 크레인(가동 중 수레가 오간다) + 오른쪽 별관 굴뚝 ----
  B.workshop = legion('workshop', 4, 3, 24, {
    lift: true, mass: [[6, 108, 100, 46, 22], [106, 108, 16, 30, 12]],
    glow: [[26, 98, 8], [60, 95, 4], [72, 95, 4], [84, 95, 4], [96, 95, 4]], smoke: [[116, 52]],
    body(P, c, k) {
      const s = c.s, t = c.t, X = k.X, i = k.i;
      bx(P, 106, 108, 16, 30, 12, s); P.cyl(116, 92, 0, 4, 34, s); P.fell(116, 58, 3, 1.8, c.k);
      if (k.live && !k.dmg) P.dot(116, 55 - (i & 1), c.glow);
      bx(P, 6, 108, 100, 46, 22, s); P.r(6, 86, 1, 22, s.m);
      for (let r = 0; r < 4; r++) {                                                             // 톱니 지붕: 경사면 + 남향 유리띠
        const y0 = 41 + r * 11;
        P.r(8, y0, 96, 3, s.o);
        for (let x = 10; x < 102; x += 8) P.r(x, y0 + 1, 6, 1, k.live ? (((x >> 3) + r + i) % 7 ? c.g : c.glow) : s.d);
        P.fpoly([[8, y0 + 3], [104, y0 + 3], [104, y0 + 11], [8, y0 + 11]], r & 1 ? s.l : s.m);
        P.r(8, y0 + 3, 96, 1, s.h);
      }
      P.r(6, 86, 100, 2, t.m); P.r(6, 86, 100, 1, t.l);
      shutter(P, k, 12, 93, 30, 15); P.r(23, 89, 8, 2, k.live ? c.glow : s.o);
      for (let n = 0; n < 4; n++) win(P, k, 54 + n * 12, 92, 7, 6, n);
      for (const x of [50, 102]) P.r(x, 90, 1, 17, s.o);
      // 갠트리 크레인
      bx(P, 14, 62, 5, 4, 26, t); bx(P, 92, 62, 5, 4, 26, t);
      bx(P, 12, 37, 88, 6, 4, t); for (let x = 16; x < 98; x += 6) P.r(x, 33, 1, 4, t.o);
      const tx = 26 + (k.live ? [0, 18, 40, 18][i] : 0);
      bx(P, tx, 37, 10, 5, 3, X.gun); P.line(tx + 5, 37, tx + 5, 52, s.o); bx(P, tx + 1, 60, 8, 6, 6, X.gun);
      P.dot(tx + 4, 31, k.live && (i & 1) ? c.glow : s.o, 2, 1);
    },
  });

  // ---- 훈련소 3×2: 홀 + 깃발(펄럭임) + 사이렌 + 오른쪽 사격장 표적 ----
  B.drillhall = legion('drillhall', 3, 2, 16, {
    mass: [[6, 70, 64, 28, 20]], glow: [[38, 53, 4], [14, 56, 3], [58, 56, 3]], smoke: [],
    body(P, c, k) {
      const s = c.s, t = c.t, X = k.X, i = k.i;
      bx(P, 72, 74, 20, 36, 2, X.slab);                                                         // 사격장 바닥
      for (let y = 42; y < 72; y += 6) P.r(73, y, 18, 1, t.d);
      const target = (x, yB) => { bx(P, x, yB, 12, 2, 13, X.gun); P.fell(x + 6, yB - 7, 4.5, 4.5, c.w); P.fell(x + 6, yB - 7, 3, 3, t.m); P.fell(x + 6, yB - 7, 1.5, 1.5, c.w); P.dot(x + 6, yB - 7, s.o); };
      target(76, 46); target(80, 66);
      bx(P, 6, 70, 64, 28, 20, s); P.r(6, 50, 1, 20, s.m);
      bx(P, 6, 50, 64, 4, 3, t);
      shutter(P, k, 30, 56, 16, 14); P.r(35, 52, 6, 1, k.live ? c.glow : s.o);
      [12, 20, 54, 62].forEach((x, n) => win(P, k, x, 56, 5, 5, n));
      P.cyl(18, 40, 0, 3, 5, t); P.dot(17, 34, k.live && (i & 1) ? c.glow : t.d, 2, 1);        // 사이렌
      bx(P, 26, 42, 12, 6, 4, s); for (let n = 0; n < 3; n++) P.r(28 + n * 3, 37, 2, 1, s.o);
      P.line(60, 44, 60, 14, s.d); P.dot(60, 13, s.l);                                           // 깃대 + 깃발
      const w2 = [0, 1, 0, -1][i];
      P.fpoly([[61, 15], [71, 16 + w2], [71, 22 + w2], [61, 21]], t.m); P.line(61, 15, 71, 16 + w2, t.l); P.r(64, 18 + (w2 > 0 ? 1 : 0), 3, 1, t.d);
    },
  });

  // ---- 토치카 3×2: 팔각 콘크리트 2단 + 사격 틈 + 주황 지붕 뚜껑 + 포신 2 ----
  const oct = (ru, rv, ch) => [[ru, -rv + ch], [ru, rv - ch], [ru - ch, rv], [-ru + ch, rv], [-ru, rv - ch], [-ru, -rv + ch], [-ru + ch, -rv], [ru - ch, -rv]];
  B.pillbox = legion('pillbox', 3, 2, 10, {
    mass: [[10, 70, 76, 36, 14]], glow: [[40, 58, 2], [56, 58, 2]], smoke: [],
    thr: [[24, 68], [72, 68]],
    body(P, c, k) {
      const s = c.s, X = k.X, G = rig(P, 48, 52, 0), slit = { o: s.o, d: c.k, m: c.k, l: s.o };
      P.dither(80, 30, 10, 34, X.slab.o);
      G.poly(oct(40, 26, 10), 0, 6, X.slab);
      G.poly(oct(38.5, 24.5, 9.5), 6, 3, slit, false);
      for (const u of [-8, 8]) G.dot(u, 24.6, 7.5, k.live && ((k.i + (u > 0 ? 1 : 0)) & 1) ? c.glow : s.o, 2, 1);
      G.poly(oct(40, 26, 10), 9, 3, X.slab, false); G.poly(oct(40, 26, 10), 12, 1.5, c.t, false); G.poly(oct(40, 26, 10), 13.5, 0, X.slab);
      for (const u of [-14, 14]) { const [x, y] = G.gp(u, 27); P.prism(x, y, 7, 9, 2, 2, Math.PI / 2, X.gun); }   // 포신(남쪽으로)
      G.poly(oct(22, 13, 6), 13.5, 3, s);
      for (let u = -16; u <= 16; u += 8) G.dot(u, -8, 13.6, X.slab.d, 3, 1);
      G.cyl(-6, -2, 16.5, 4, 2, X.gun); G.cyl(8, -4, 16.5, 1.5, 4, s); G.dot(8, -4, 21, k.live ? c.g : s.o);
    },
  });

  // ---- 대공 포탑 2×2: 콘크리트 원판 + 회전 포탑(북동 조준, 쌍포신) + 회전 레이더(탐지기) ----
  B.flak = legion('flak', 2, 2, 12, {
    mass: [[12, 70, 40, 26, 10]], glow: [[30, 26, 2]], smoke: [], thr: [[22, 70], [42, 70]],
    body(P, c, k) {
      const s = c.s, X = k.X, i = k.i;
      P.cyl(32, 60, 0, 24, 5, X.slab); P.cyl(32, 58, 5, 15, 4, X.gun);
      const G = rig(P, 32, 56, -Math.PI / 4);
      G.box(-1, 0, 9, 14, 13, 7, s);
      for (const v of [-6, 6]) G.box(1, v, 9, 11, 2.5, 8, c.t);
      for (const v of [-2.3, 2.3]) G.strut([4, v, 15], [19, v, 27], 2, X.gun);
      for (const v of [-2.3, 2.3]) G.dot(19.5, v, 27.5, s.o);
      G.strut([-7, 0, 16], [-7, 0, 25], 2, X.gun);                                              // 레이더 기둥 + 회전 막대
      const th = k.live ? i * Math.PI / 4 : 0, ex = Math.cos(th) * 6, ev = Math.sin(th) * 6;
      G.strut([-7 - ex, -ev, 26], [-7 + ex, ev, 26], 2, s);
      G.dot(-7 + ex, ev, 27, k.live ? c.glow : s.o);
    },
  });

  // ---- 차량 공장 4×3: 큰 홀 + 고측창 + 큰 문 2 + 굴뚝 2 ----
  B.motorpool = legion('motorpool', 4, 3, 24, {
    lift: true, mass: [[6, 108, 116, 42, 26], [24, 76, 80, 18, 8]],
    glow: [[64, 72, 12], [34, 82, 2], [92, 82, 2]], smoke: [[110, 30], [99, 32]],
    thr: [[20, 108], [64, 108], [108, 108]],
    body(P, c, k) {
      const s = c.s, t = c.t, X = k.X, i = k.i;
      P.dither(114, 44, 8, 60, X.slab.o);
      bx(P, 6, 108, 116, 42, 26, s); P.r(6, 82, 1, 26, s.m);
      P.cyl(99, 56, 0, 3.5, 22, X.gun); P.fell(99, 34, 2.5, 1.5, c.k);
      P.cyl(110, 60, 0, 4, 26, X.gun); P.fell(110, 34, 3, 1.8, c.k);
      if (k.live && !k.dmg) { P.dot(110, 32 - (i & 1), c.glow); P.dot(99, 32 - ((i + 1) & 1), c.glow); }
      for (let x = 10; x < 120; x += 12) P.line(x, 42, x, 80, s.d);                          // 지붕 판넬
      bx(P, 10, 62, 10, 8, 4, s); bx(P, 10, 76, 10, 8, 4, s); for (const y of [55, 69]) P.r(12, y, 6, 1, s.o);   // 환기 상자
      P.r(8, 46, 112, 1, s.o); P.r(8, 47, 112, 1, s.h);
      bx(P, 24, 76, 80, 18, 8, s);                                                              // 고측창
      P.r(26, 69, 76, 5, s.o);
      for (let n = 0; n < 9; n++) P.r(27 + n * 8 + (n > 4 ? 2 : 0), 70, 6, 3, !k.live || (k.dmg >= 2 && n % 2) ? c.k : (n + i) % 6 === 0 ? c.w : c.g);
      bx(P, 24, 68, 80, 3, 2, t);
      P.r(6, 82, 116, 2, t.m); P.r(6, 82, 116, 1, t.l);
      shutter(P, k, 14, 89, 40, 19); shutter(P, k, 72, 89, 40, 19);
      P.r(32, 85, 4, 1, k.live && (i & 1) ? c.glow : s.o); P.r(90, 85, 4, 1, k.live && !(i & 1) ? c.glow : s.o);
      P.r(60, 88, 1, 20, s.o); P.r(63, 88, 1, 20, s.o); win(P, k, 116, 92, 3, 6, 1);
      if (!k.lift) for (let n = 0; n < 4; n++) { P.r(22 + n * 8, 110, 4, 2, X.slab.d); P.r(80 + n * 8, 110, 4, 2, X.slab.d); }
    },
  });

  // ---- 무기고 3×2: 방폭 벙커 + 지붕 포탄 선반 + 이중 방폭문 ----
  B.arsenal = legion('arsenal', 3, 2, 12, {
    mass: [[6, 68, 84, 32, 16]], glow: [[30, 58, 2], [66, 58, 2]], smoke: [],
    body(P, c, k) {
      const s = c.s, t = c.t, X = k.X, i = k.i;
      bx(P, 6, 68, 84, 32, 16, s); P.r(6, 52, 1, 16, s.m);
      for (const y of [36, 47]) {                                                               // 포탄 2줄
        P.r(10, y + 1, 76, 1, s.o);
        for (let n = 0; n < 7; n++) { const x = 16 + n * 11; P.cyl(x, y, 0, 2.6, 8, X.gun); P.cyl(x, y, 8, 2.6, 2, t); P.dot(x - 1, y - 11, t.h); }
      }
      bx(P, 6, 52, 84, 3, 2, t);
      P.r(33, 54, 30, 14, s.o); P.r(34, 55, 13, 13, s.d); P.r(49, 55, 13, 13, s.d);
      P.r(34, 55, 13, 1, s.m); P.r(49, 55, 13, 1, s.m);
      stripes(P, k, 34, 60, 13, 3); stripes(P, k, 49, 60, 13, 3);
      lamp(P, k, 29, 58, i & 1); lamp(P, k, 65, 58, !(i & 1));
      [12, 20, 74, 82].forEach((x, n) => P.r(x, 57, 3, 8, s.o));
    },
  });

  // ---- 비행장 4×3: 아치 격납고 + 착륙장(H, 유도등 순차 점멸) + 관제 박스 ----
  B.airfield = legion('airfield', 4, 3, 24, {
    lift: true, mass: [[6, 108, 60, 40, 28], [70, 110, 52, 50, 3]],
    glow: [[36, 92, 10], [112, 52, 4]], smoke: [], thr: [[18, 108], [52, 108], [96, 108]],
    body(P, c, k) {
      const s = c.s, t = c.t, X = k.X, i = k.i;
      // 착륙장
      bx(P, 70, 110, 52, 50, 3, X.slab);
      P.fell(96, 83, 18, 12, t.m); P.fell(96, 83, 15, 9.5, X.slab.l); P.fell(96, 83, 18, 12, t.m); P.fell(96, 83, 15.5, 10, X.slab.l);
      P.r(90, 78, 2, 10, t.l); P.r(100, 78, 2, 10, t.l); P.r(92, 82, 8, 2, t.l);
      const lights = [[73, 60], [86, 60], [99, 60], [113, 60], [118, 76], [118, 92], [113, 104], [99, 104], [86, 104], [73, 104], [73, 92], [73, 76]];
      lights.forEach(([x, y], n) => P.dot(x, y, k.live && ((n - i * 3 + 24) % 12) < 3 ? c.glow : s.o, 2, 1));
      bx(P, 104, 60, 16, 8, 14, s); P.r(105, 49, 14, 5, s.o); P.r(106, 50, 12, 3, k.live ? c.g : c.k); if (k.live) P.r(106, 50, 3, 1, c.w);
      bx(P, 104, 47, 16, 3, 2, t); P.line(116, 44, 116, 36, s.d); lamp(P, k, 116, 35, i & 1, 1, 1);
      // 아치 격납고
      const cx = 36, R = 30, Hh = 28, yF = 108, yBk = 68, N = 16, arc = (th, yb) => [cx - R * Math.cos(th), yb - Hh * Math.sin(th)];
      for (let n = 0; n < N; n++) {
        const a = n / N * Math.PI, b = (n + 1) / N * Math.PI, mid = (a + b) / 2;
        P.fpoly([arc(a, yF), arc(b, yF), arc(b, yBk), arc(a, yBk)], mid < 0.55 ? s.m : mid < 1.75 ? s.l : mid < 2.5 ? s.m : s.d);
      }
      for (let n = 2; n < N; n += 3) { const [x0, y0] = arc(n / N * Math.PI, yF), [x1, y1] = arc(n / N * Math.PI, yBk); P.line(x0, y0, x1, y1, s.d); }
      for (const yy of [76, 84, 92, 100]) { const pts = []; for (let n = 0; n <= N; n++) pts.push(arc(n / N * Math.PI, yy)); for (let n = 0; n < N; n++) if (n % 2 === 0) P.line(pts[n][0], pts[n][1], pts[n + 1][0], pts[n + 1][1], s.h); }
      const front = []; for (let n = 0; n <= 24; n++) front.push(arc(n / 24 * Math.PI, yF));
      P.fpoly(front, s.d);
      for (let n = 0; n < 24; n++) P.line(front[n][0], front[n][1], front[n + 1][0], front[n + 1][1], s.m);
      P.fpoly([[cx - 24, yF], [cx - 24, yF - 12], [cx - 14, yF - 20], [cx + 14, yF - 20], [cx + 24, yF - 12], [cx + 24, yF]], s.o);
      P.r(cx - 22, yF - 13, 44, 13, s.d); for (let y = yF - 11; y < yF; y += 3) P.r(cx - 22, y, 44, 1, s.o);
      stripes(P, k, cx - 14, yF - 19, 28, 4);
      P.r(cx - 6, yF - 26, 12, 3, k.live ? c.glow : s.o);
    },
  });

  // ---- 연구 단지 4×3: 본관 + 유리 돔 + 냉각탑 2(주황 띠) ----
  B.labs = legion('labs', 4, 3, 24, {
    lift: true, mass: [[6, 108, 80, 40, 20]], glow: [[40, 60, 14], [20, 96, 3], [64, 96, 3]], smoke: [[104, 64], [112, 44]],
    thr: [[18, 108], [46, 108], [74, 108], [104, 110]],
    body(P, c, k) {
      const s = c.s, t = c.t, X = k.X, i = k.i;
      const tower = (x, y, r, h) => { P.cyl(x, y, 0, r, h * 0.55, s); P.cyl(x, y, h * 0.55, r - 0.5, 3, t); P.cyl(x, y, h * 0.55 + 3, r - 1, h * 0.45 - 3, s); P.fell(x, y - h, r - 2.5, (r - 2.5) * 0.7, c.k); };
      tower(112, 72, 8, 26);
      P.r(84, 92, 14, 3, X.gun.d); P.r(84, 92, 14, 1, X.gun.l);
      bx(P, 6, 108, 80, 40, 20, s); P.r(6, 88, 1, 20, s.m);
      tower(104, 100, 10, 34);
      P.fell(40, 72, 22, 7, s.o); P.fell(40, 71, 21, 6, s.m);                                   // 돔 받침
      P.blob(40, 62, 19, 14, k.live ? X.glass : { o: s.o, d: s.o, m: s.d, l: s.m, h: s.l });
      if (k.live) { P.r(39, 62 - (i & 1), 3, 2, c.glow); P.dot(40, 61 - (i & 1), c.w); }
      for (const dx of [-12, 0, 12]) P.line(40 + dx * 0.4, 49, 40 + dx, 72, k.live ? X.glass.d : s.o);
      P.r(6, 88, 80, 2, t.m); P.r(6, 88, 80, 1, t.l);
      shutter(P, k, 36, 95, 14, 13);
      [12, 22, 58, 68].forEach((x, n) => win(P, k, x, 94, 6, 6, n));
      P.r(54, 46, 2, 6, s.d); lamp(P, k, 54, 45, i & 1, 2, 1);
    },
  });

  // ---- 보급고 3×2: 벙커 + 지붕 컨테이너 2 + 연료통 ----
  B.depot = legion('depot', 3, 2, 12, {
    mass: [[6, 68, 70, 30, 14]], glow: [[24, 30, 2]], smoke: [], thr: [[16, 68], [40, 68], [64, 68]],
    body(P, c, k) {
      const s = c.s, t = c.t, X = k.X, i = k.i;
      bx(P, 6, 68, 70, 30, 14, s); P.r(6, 54, 1, 14, s.m);
      bx(P, 10, 50, 28, 14, 9, t); for (let x = 12; x < 38; x += 3) P.r(x, 42, 1, 8, t.d);
      bx(P, 40, 50, 30, 14, 9, s); for (let x = 42; x < 70; x += 3) P.r(x, 42, 1, 8, s.d);
      bx(P, 16, 37, 18, 8, 3, s); lamp(P, k, 24, 30, i & 1, 2, 1);
      P.r(6, 54, 70, 2, t.m); P.r(6, 54, 70, 1, t.l);
      shutter(P, k, 18, 59, 24, 9);
      win(P, k, 50, 59, 5, 4, 0); win(P, k, 62, 59, 5, 4, 1);
      P.cyl(84, 66, 0, 8, 12, s); P.cyl(84, 66, 12, 8, 3, t); P.cyl(84, 66, 15, 8, 8, s); P.cyl(84, 66, 23, 3, 2, X.gun);
    },
  });

  // ---- 가스 정제기 2×2(분출구 위): 포금 격자 받침 + 정제 탱크(가스 관측창, 거품) + 굴뚝(연기 자리) ----
  B.pump = legion('pump', 2, 2, 16, {
    mass: [[8, 72, 48, 40, 26]], glow: [[27, 47, 5]], smoke: [[50, 10]], thr: [[16, 72], [48, 72]],
    body(P, c, k) {
      const s = c.s, t = c.t, X = k.X, i = k.i, gs = X.gas;
      if (!k.lift) { bx(P, 4, 76, 56, 50, 4, X.gun); for (let y = 26; y < 72; y += 4) P.r(6, y, 52, 1, X.gun.d); }
      P.cyl(50, 44, 4, 3.5, 26, X.gun); P.fell(50, 14, 2.5, 1.5, c.k);
      if (k.live && !k.dmg) P.dot(50, 12 - (i & 1), c.glow);
      P.cyl(28, 60, 4, 13, 14, s); P.cyl(28, 60, 18, 12.5, 3, t); P.cyl(28, 60, 21, 13, 8, s); P.cyl(28, 60, 29, 6, 3, X.gun);
      P.r(25, 38, 6, 16, s.o); P.r(26, 39, 4, 14, k.live ? gs.m : gs.o);                       // 가스 관측창
      if (k.live) { P.r(26, 39, 1, 14, gs.l); P.dot(28, 50 - i * 3, gs.h); P.dot(27, 46 - ((i + 2) % 4) * 2, gs.h); }
      bx(P, 40, 64, 18, 4, 4, X.gun); P.cyl(52, 62, 4, 3, 2, t); P.dot(52, 57, t.h);
      bx(P, 6, 68, 10, 6, 6, X.gun); lamp(P, k, 10, 60, i & 1);
    },
  });

  // ---- 정비고 2×2(차량 공장 부속): 작업장 + 롤 문 + 지붕 로봇 팔(용접 불꽃) ----
  B.garage = legion('garage', 2, 2, 8, {
    mass: [[8, 64, 50, 28, 18]], glow: [[28, 22, 3]], smoke: [],
    body(P, c, k) {
      const s = c.s, t = c.t, X = k.X, i = k.i;
      coupler(P, k, 60);
      bx(P, 8, 64, 50, 28, 18, s); P.r(8, 46, 1, 18, s.m);
      bx(P, 8, 46, 50, 3, 2, t);
      shutter(P, k, 16, 51, 24, 13); win(P, k, 46, 52, 6, 5, 2);
      P.cyl(44, 36, 0, 3.5, 3, X.gun);
      const a = k.live ? [0, 2, 0, -2][i] : 0;
      strut2(P, [44, 32], [36, 20 + a], 3, t); strut2(P, [36, 20 + a], [28, 25 + a], 2, X.gun);
      if (k.live && !(i & 1)) { P.dot(27, 25 + a, c.w); P.dot(26, 26 + a, c.glow); P.dot(28, 27 + a, c.glow); }
    },
  });

  // ---- 관제탑 2×2(비행장 부속): 기단 + 기둥 + 팔각 유리 관제실(주황 지붕) + 회전 경광등 ----
  B.tower = legion('tower', 2, 2, 20, {
    mass: [[10, 78, 44, 30, 8]], glow: [[32, 24, 8], [32, 8, 2]], smoke: [], thr: [[18, 78], [46, 78]],
    body(P, c, k) {
      const s = c.s, X = k.X, i = k.i, G = rig(P, 32, 32, 0);
      coupler(P, k, 74);
      bx(P, 12, 78, 40, 22, 8, s); P.r(12, 70, 1, 8, s.m); win(P, k, 18, 72, 4, 3, 1); win(P, k, 42, 72, 4, 3, 3);
      P.cyl(32, 64, 0, 6, 32, s); for (let y = 40; y < 60; y += 6) P.r(27, y, 10, 1, s.d);
      G.poly(oct(11, 9, 4), 0, 2, s);
      G.poly(oct(11, 9, 4), 2, 5, k.live ? { d: c.g, m: X.glass.l, l: s.l, h: c.w } : { d: c.k, m: s.o, l: s.d }, false);
      G.poly(oct(13, 11, 4), 7, 1.4, c.t, false); G.poly(oct(11, 9, 4), 8.4, 1, s);
      G.cyl(0, 0, 9.4, 2, 3, X.gun);
      const on = k.live ? i : -1;
      G.dot(0, 0, 14.4, on >= 0 ? c.glow : s.o, 2, 1);
      if (on >= 0) { const th = on * Math.PI / 2; G.dot(Math.cos(th) * 5, Math.sin(th) * 5, 13.4, c.glow); }
      G.line([5, -3, 9.4], [5, -3, 20], s.d);
    },
  });

  // ---- 첩보부 2×2(연구 단지 부속): 낮은 벙커 + 안테나 3 + 작은 접시 + 감시 화면 ----
  B.intel = legion('intel', 2, 2, 12, {
    mass: [[8, 68, 48, 28, 12]], glow: [[18, 7, 2], [30, 15, 2], [40, 30, 2]], smoke: [],
    body(P, c, k) {
      const s = c.s, t = c.t, X = k.X, i = k.i;
      coupler(P, k, 64);
      bx(P, 8, 68, 48, 28, 12, s); P.r(8, 56, 1, 12, s.m);
      bx(P, 8, 56, 48, 3, 2, t);
      for (let n = 0; n < 3; n++) { P.r(13 + n * 9, 59, 7, 5, s.o); P.r(14 + n * 9, 60, 5, 3, !k.live ? c.k : (n + i) % 3 ? c.g : c.w); }
      P.r(44, 58, 8, 10, s.o); P.r(45, 59, 6, 9, s.d);
      P.line(18, 42, 18, 8, s.d); P.line(15, 16, 21, 16, s.d); P.line(16, 24, 20, 24, s.d); lamp(P, k, 18, 7, i & 1, 1, 1);
      P.line(30, 38, 30, 16, s.d); P.line(28, 22, 32, 22, s.d); lamp(P, k, 30, 15, (i >> 1) & 1, 1, 1);
      P.r(42, 34, 2, 6, X.gun.m); P.fell(43, 32, 8, 4, s.o); P.fell(43, 32, 7, 3, s.l); P.fell(44, 32.5, 4.5, 1.8, s.d);
      P.line(43, 32, 40, 29, X.gun.d); lamp(P, k, 39, 28, 1, 1, 1);
    },
  });

  // ---- 중력 연구실 2×2(연구 단지 부속): 기단 + 기둥 2 + 떠 있는 고리(에너지 원판 맥동) ----
  B.gravlab = legion('gravlab', 2, 2, 16, {
    mass: [[6, 72, 52, 30, 10]], glow: [[32, 36, 10]], smoke: [],
    body(P, c, k) {
      const s = c.s, t = c.t, X = k.X, i = k.i;
      coupler(P, k, 68);
      bx(P, 6, 72, 52, 30, 10, s); P.r(6, 62, 1, 10, s.m);
      bx(P, 6, 62, 52, 3, 2, t);
      bx(P, 8, 56, 6, 4, 28, s); bx(P, 50, 56, 6, 4, 28, s); bx(P, 8, 28, 6, 4, 2, t); bx(P, 50, 28, 6, 4, 2, t);
      const bob = k.live ? [0, -1, 0, 1][i] : 2, y = 38 + bob;
      if (k.live) { P.line(14, 34, 17, y, c.g); P.line(50, 34, 47, y, c.g); }
      P.fell(32, y, 16, 6, s.o); P.fell(32, y - 0.5, 15, 5, s.l); P.fell(32, y + 0.5, 12, 3.6, s.d);
      P.fell(32, y, 10.5, 3, k.live ? c.g : c.k);
      if (k.live) { P.fell(32, y, [5, 7, 5, 3][i], [1.5, 2, 1.5, 1][i], c.w); }
      win(P, k, 18, 65, 5, 4, 0); win(P, k, 40, 65, 5, 4, 1);
    },
  });

  // ---- 위성 관제소 2×2(사령부 부속): 기단 + 회전 접시 ----
  B.uplink = legion('uplink', 2, 2, 16, {
    mass: [[8, 72, 48, 26, 10]], glow: [[24, 19, 2]], smoke: [],
    body(P, c, k) {
      const s = c.s, t = c.t, X = k.X, i = k.i;
      coupler(P, k, 68);
      bx(P, 8, 72, 48, 26, 10, s); P.r(8, 62, 1, 10, s.m);
      bx(P, 8, 62, 48, 3, 2, t);
      win(P, k, 14, 65, 5, 4, 0); win(P, k, 44, 65, 5, 4, 2);
      P.cyl(32, 54, 0, 4, 14, X.gun);
      const rx = k.live ? [18, 15, 12, 15][i] : 18;
      P.fell(31, 32, rx, 12, s.o); P.fell(31, 32, rx - 1.5, 10.5, s.l); P.fell(32, 33, rx - 4, 8, s.m); P.fell(34, 34.5, Math.max(2, rx - 8), 5, s.d);
      P.line(32, 33, 24, 20, X.gun.l); P.line(31, 33, 23, 20, X.gun.d); P.dot(23, 18, k.live ? c.glow : s.d, 2, 2);
    },
  });

  // ---- 미사일 사일로 2×2(사령부 부속): 낮은 콘크리트 판 + 경고 테두리 구멍 + 열린 해치 + 미사일 머리 ----
  B.silo = legion('silo', 2, 2, 10, {
    mass: [[6, 70, 52, 40, 8]], glow: [[10, 24, 2], [54, 24, 2], [32, 34, 4]], smoke: [],
    body(P, c, k) {
      const s = c.s, t = c.t, X = k.X, i = k.i;
      coupler(P, k, 66);
      bx(P, 6, 70, 52, 40, 8, X.slab); P.r(6, 62, 1, 8, X.slab.m);
      stripes(P, k, 17, 26, 30, 30);
      P.r(20, 29, 24, 24, s.o); P.r(21, 30, 22, 22, c.k);
      if (k.live) {
        P.cyl(32, 52, 0, 5, 12, { o: s.o, d: s.m, m: s.l, l: s.h, h: c.w });
        P.fpoly([[27, 41], [37, 41], [32, 33]], t.m); P.line(32, 33, 28, 40, t.h); P.r(27, 44, 10, 1, t.d);
        bx(P, 7, 58, 9, 30, 3, s); bx(P, 48, 58, 9, 30, 3, s);
      } else { bx(P, 20, 54, 12, 24, 2, s); bx(P, 32, 54, 12, 24, 2, s); }
      lamp(P, k, 10, 24, i & 1); lamp(P, k, 53, 24, !(i & 1));
    },
  });

  Object.assign(A.SPR, B);

  // ===================================================================== 자원 =====================================================================
  // 분출구 2×2: 바위 테(돌덩이 고리) + 안쪽 void 구멍 + 가스 웅덩이 2단 + 김(디더), work 3 = 웅덩이 반짝 위치·김 상승
  A.SPR.vent = { w: 64, h: 72, px: 1, ox: 0, oy: 8, dirs: 1, frames: { work: 3 }, glow: [[32, 40, 10]], smoke: [[32, 30]], draw(P, c, f) {
    const X = pals(f.T), rk = X.rock, gs = X.gas, i = f.anim === 'work' ? f.i % 3 : 0, CX = 32, CY = 44;
    P.fell(CX, CY + 3, 30, 18, rk.o);
    const ang = n => n / 9 * TAU + ((hash(n, 43) & 15) - 7) * 0.05;                         // 돌덩이 9개: 각도·크기·높이·기울기를 해시로 흩는다
    const chunk = n => { const a = ang(n), h = hash(n, 41), r = 22 + (h & 3), x = CX + Math.cos(a) * r, y = CY + Math.sin(a) * r * FLAT; P.prism(x, y, 0, 5 + (h & 7), 4 + ((h >>> 3) & 3), 3 + ((h >>> 5) & 7), a + ((h >>> 8) & 7) * 0.3, rk); };
    for (let n = 0; n < 9; n++) if (Math.sin(ang(n)) < 0) chunk(n);
    P.cyl(CX, CY, 0, 22, 3, rk); for (let n = 0; n < 14; n++) { const h = hash(n, 47), a = h / 4294967296 * TAU, rr = 12 + (h & 7); P.dot(CX + Math.cos(a) * rr, CY - 3 + Math.sin(a) * rr * FLAT, (h >>> 4) & 1 ? rk.d : rk.h); }
    P.fell(CX, CY - 5, 16, 10, rk.o); P.fell(CX, CY - 4, 14, 8.5, c.k);
    P.fell(CX, CY - 3, 12, 6.5, gs.d); P.fell(CX - 1, CY - 3.5, 8.5, 4.2, gs.m);
    const sp = [[-5, -1], [3, 0], [-1, 1]][i]; P.r(CX + sp[0], CY - 4 + sp[1], 3, 1, gs.h); P.dot(CX + sp[0] + 5, CY - 2 + sp[1], gs.l);
    for (let n = 0; n < 9; n++) if (Math.sin(ang(n)) >= 0) chunk(n);
    for (let n = 0; n < 3; n++) {                                                               // 김: 체커 디더 덩이가 3프레임 동안 오른다
      const ph = (i + n) % 3, y = CY - 14 - ph * 9 - n * 2, x = CX - 4 + ((n * 5) % 7) - ph;
      P.dither(x, y, 7 - ph, 4, gs.h); P.dither(x + 1, y - 2, 4 - (ph >> 1), 2, c.w);
    }
  } };
  // 일꾼 운반물: 크리스탈 조각(12×12) / 가스통(10×14)
  A.SPR.chunk = { w: 12, h: 12, px: 1, ox: 6, oy: 11, dirs: 1, frames: {}, draw(P, c, f) {
    const K = ramp(f.T.crystal, f.T);
    P.fpoly([[1, 8], [5, 0], [6, 11]], K.l); P.fpoly([[5, 0], [11, 7], [6, 11]], K.d); P.fpoly([[3, 8], [5, 2], [6, 10]], K.m);
    P.line(5, 1, 6, 10, K.h); P.dot(4, 2, c.w);
  } };
  A.SPR.canister = { w: 10, h: 14, px: 1, ox: 5, oy: 13, dirs: 1, frames: {}, draw(P, c, f) {
    const X = pals(f.T), gs = X.gas;
    P.cyl(5, 12, 0, 4, 10, c.s); P.r(3, 4, 4, 6, c.s.o); P.r(4, 5, 2, 4, gs.m); P.r(4, 5, 1, 4, gs.h);
    P.cyl(5, 12, 10, 2, 2, c.t);
  } };

  // ===================================================================== 유닛 =====================================================================
  // 공통: dirs 8 (방향 0·1·2·6·7 만 들어온다 — 3·4·5 는 렌더가 반전), 기준 (CX, CY) = 지면 중심, oy = 발밑.
  const STRIDE = [[2, -2], [0, 0], [-2, 2], [0, 0]], LIFTF = [[0, 0], [0, 1], [0, 0], [1, 0]];
  // 보병은 작아서(24~30px) 기울인 상자 대신 '화면 정렬 블록'(윗면 l · 정면 d · 왼쪽 세로줄 m)을 회전 위치에 놓는다 — 면이 깨끗하고,
  // 방향은 머리·총·배낭이 놓이는 자리로 읽힌다. 총은 2px 막대(rod).
  function ab(P, G, u, v, z, len, wid, hgt, r) {
    const [sx, sy] = G.gp(u, v), ca = Math.abs(G.ca), sa = Math.abs(G.sa), K = G.K;
    const w = Math.max(2, Math.round((len * ca + wid * sa) * K)), d = Math.max(1, Math.round((len * sa + wid * ca) * FLAT * K));
    const x = Math.round(sx - w / 2), yB = Math.round(sy + d / 2 - z * K), h = Math.round(hgt * K);
    if (h > 0) { P.r(x, yB - h, w, h, r.d); P.r(x, yB - h, 1, h, r.m); }
    P.r(x, yB - h - d, w, d, r.l);
    if (r.h && w > 3 && d > 1) P.r(x + 1, yB - h - d, w - 2, 1, r.h);
    return { x, w, top: yB - h - d, fy: yB - h, h, yB };
  }
  function rod(P, G, a, b, r, tip) {
    const p = G.sp(...a), q = G.sp(...b), vert = Math.abs(q[0] - p[0]) < Math.abs(q[1] - p[1]);
    if (vert) { P.line(p[0], p[1], q[0], q[1], r.l); P.line(p[0] + 1, p[1], q[0] + 1, q[1], r.d); }
    else { P.line(p[0], p[1] - 1, q[0], q[1] - 1, r.l); P.line(p[0], p[1], q[0], q[1], r.d); }
    if (tip) P.dot(q[0] + (vert ? 0 : Math.sign(q[0] - p[0]) * 0), q[1] - (vert ? 0 : 1), tip, vert ? 2 : 1, vert ? 1 : 2);
    return q;
  }
  // 얼굴 쪽 표시(바이저·렌즈): 머리 블록 정면/옆면 위, 바라보는 쪽으로 치우쳐. 북쪽을 보면 안 보인다
  function visor(P, G, hd, c, wFront, row = 1, rows = 2) {
    if (G.sa < -0.35) return;
    const vw = G.sa > 0.6 ? wFront : 3, cx = hd.x + hd.w / 2 + G.ca * (hd.w / 2 - 1.5);
    P.r(Math.round(cx - vw / 2), hd.fy + row, vw, rows, c);
  }
  // 보병 몸통(땅딸막한 비율 — 큰 투구·깊은 몸통·뒤로 튀어나온 배낭·짧은 다리, 1:1 에서 실루엣으로 구분된다):
  // 다리 2(이동 4단계: 접촉·통과·접촉·통과, 통과 때 몸 1px 위) + 몸통. dz = 몸 높이 보정(다리 4.5 + 흔들림). spec 가 머리·장비를 add 한다
  function trooperBase(P, c, f, X, CX, CY, torso, spec, chest) {
    const mv = f.anim === 'move' ? f.i : -1, atk = f.anim === 'attack' ? f.i : -1, G = rig(P, CX, CY, f.ang, f.K);
    const st = mv >= 0 ? STRIDE[mv] : [0.5, -0.5], lf = mv >= 0 ? LIFTF[mv] : [0, 0], dz = (mv === 1 || mv === 3 ? 1 : 0) - 1.5;
    const leg = { o: X.gun.o, d: X.gun.d, m: X.gun.m, l: X.gun.m };
    [-1.8, 1.8].forEach((v, n) => G.add(st[n], v, 0, () => ab(P, G, st[n], v, lf[n], 2.8, 2.6, 4.5 - lf[n], leg)));
    G.add(0, 0, 6, () => { const tb = ab(P, G, 0, 0, 6 + dz, 5.4, 7.4, 6, torso || c.s); if (chest) visor(P, G, tb, chest, 4, 1, 3); });   // 가슴판(앞을 볼 때)
    spec(G, dz, atk, (u, v, z, len, wid, hgt, r) => ab(P, G, u, v, z, len, wid, hgt, r), (a, b, r, tip) => rod(P, G, a, b, r, tip));
    G.flush();
  }
  const muzzle = (P, q, c) => { P.dot(q[0] - 1, q[1] - 2, c.w, 2, 2); P.dot(q[0] + 1, q[1] - 2, c.glow); P.dot(q[0] - 1, q[1] - 3, c.glow); P.dot(q[0] - 2, q[1] - 1, c.glow); };
  // K = 화면 배율(몸 좌표는 그대로, 옛 반해상도×2 자리를 채우도록 키운다). cy = 지면 중심 y(측정용)
  const unitDef = (w, h, CX, CY, oy, frames, draw, K = 1) => ({ w, h, px: 1, ox: CX, oy, cy: CY, K, dirs: 8, frames, draw(P, c, f) { f.K = K; draw(P, c, f, pals(f.T), CX, CY); } });
  const INF = { idle: 1, move: 4, attack: 2 };
  const U = {};
  const noH = r => ({ o: r.o, d: r.d, m: r.m, l: r.l });
  const HZ = 12;                                                                              // 머리 바닥 높이(몸통 위)

  // 엔지니어: 넓은 챙의 주황 안전모, 큰 연료통 배낭(주황 마개), 주황 조끼 띠, 용접 토치(끝 발광, 공격 = 불꽃)
  U.engineer = unitDef(30, 36, 15, 30, 32, INF, (P, c, f, X, CX, CY) => trooperBase(P, c, f, X, CX, CY, null, (G, dz, atk, box, rd) => {
    G.add(-5, 0, 7, () => { box(-5, 0, 6.5 + dz, 3.6, 6.4, 6.5, noH(X.gun)); box(-5, 1.6, 13 + dz, 2.2, 2.2, 1.2, noH(c.t)); });
    G.add(0, 0, 9.4, () => box(0, 0, 9.4 + dz, 7, 7.8, 1.2, noH(c.t)));
    G.add(0.4, 0, HZ, () => { const hd = box(0.6, 0, HZ + dz, 5.6, 5.6, 3.2, noH(c.s)); visor(P, G, hd, c.g, 4, 1); box(0.8, 0, HZ + 3.2 + dz, 8, 7.6, 1.2, noH(c.t)); box(0.2, 0, HZ + 4.4 + dz, 5.6, 5.4, 1.6, c.t); });
    const r = atk === 1 ? 1 : 0;
    G.add(3.5, 4, 8.5, () => { const q = rd([2 - r, 4, 8.5 + dz], [7.5 - r, 4, 9 + dz], X.gun, c.glow); if (atk === 0) { P.dot(q[0], q[1] - 3, c.w, 2, 2); P.dot(q[0] + 2, q[1] - 4, c.glow); P.dot(q[0] + 1, q[1], c.glow); P.dot(q[0] - 1, q[1] - 4, X.hot); } });
  }), 1.45);
  // 트루퍼: 큰 각진 투구 + 주황 슬릿 바이저, 견갑, 배낭, 소총(길이 10)
  U.trooper = unitDef(38, 36, 19, 30, 32, INF, (P, c, f, X, CX, CY) => trooperBase(P, c, f, X, CX, CY, null, (G, dz, atk, box, rd) => {
    G.add(-5, 0, 7, () => box(-5, 0, 7 + dz, 3.4, 6.2, 5.5, noH(X.gun)));
    for (const v of [-4.6, 4.6]) G.add(0, v, 10, () => box(0, v, 10 + dz, 4.6, 2.6, 2.6, noH(c.s)));
    G.add(0.4, 0, HZ, () => { const hd = box(0.8, 0, HZ + dz, 7, 6.6, 4.8, c.s); visor(P, G, hd, c.t.l, 5, 1); });
    const r = atk === 1 ? 1 : 0;
    G.add(5, 4.3, 9, () => { const q = rd([1.5 - r, 4.3, 8.8 + dz], [11.5 - r, 4.3, 9.4 + dz], X.gun); if (atk === 0) muzzle(P, q, c); });
  }, c.t.m), 1.45);
  // 스코처: 등에 큰 주황 연료통 2, 고글 마스크, 화염 노즐(점화 불씨, 공격 = 불길)
  U.scorcher = unitDef(46, 35, 23, 29, 31, INF, (P, c, f, X, CX, CY) => trooperBase(P, c, f, X, CX, CY, null, (G, dz, atk, box, rd) => {
    for (const v of [-1.9, 1.9]) G.add(-5.2, v, 7, () => G.cyl(-5.2, v, 5.5 + dz, 2.2, 8, c.t));
    for (const v of [-4.4, 4.4]) G.add(0, v, 10, () => box(0, v, 10 + dz, 4.2, 2.4, 2.2, noH(c.s)));
    G.add(0.4, 0, HZ, () => { const hd = box(0.8, 0, HZ + dz, 6.6, 6.2, 4.4, X.gun); visor(P, G, hd, c.g, 5, 1); });
    G.add(5, 4.3, 8.5, () => {
      const q = rd([1.5, 4.3, 8 + dz], [9.5, 4.3, 8.6 + dz], X.gun);
      if (atk === 0) { const dx = G.ca * 2.5, dy = G.sa * 1.8; for (let n = 0; n < 4; n++) P.dot(q[0] + dx * n - 1, q[1] - 2 + dy * n, n < 1 ? c.w : n < 3 ? c.glow : X.hot, 2, 2); }
      else if (atk === 1) { P.dot(q[0], q[1] - 2, c.glow, 2, 2); P.dot(q[0] + G.ca * 3, q[1] - 2 + G.sa * 2, X.hot); }
      else P.dot(q[0], q[1] - 1, c.glow);
    });
  }), 1.45);
  // 코어스맨: 흰 장갑 + 주황 십자(배낭·견장), 허리 약품 상자, 주사기(공격 = 치료 빛)
  U.corpsman = unitDef(28, 35, 14, 29, 31, INF, (P, c, f, X, CX, CY) => trooperBase(P, c, f, X, CX, CY, null, (G, dz, atk, box, rd) => {
    const white = { o: c.s.o, d: c.s.l, m: c.s.h, l: c.w };
    const cross = b => { const cx = b.x + (b.w >> 1), cy = b.top + (b.top < b.fy - 2 ? 1 : 0); P.r(cx - 1, cy + 1, 3, 1, c.t.m); P.r(cx, cy, 1, 3, c.t.m); };
    G.add(-5, 0, 7, () => cross(box(-5, 0, 7 + dz, 3.4, 6.2, 5.5, white)));
    for (const v of [-4.6, 4.6]) G.add(0, v, 10, () => cross(box(0, v, 10 + dz, 4.6, 2.8, 2.6, white)));
    G.add(0.4, 0, HZ, () => { const hd = box(0.8, 0, HZ + dz, 6.6, 6.2, 4.4, c.s); visor(P, G, hd, c.g, 5, 1); });
    G.add(-0.5, -4.4, 5, () => cross(box(-0.5, -4.6, 5 + dz, 3, 2, 3, white)));
    G.add(4, 4.3, 8.5, () => { const q = rd([2, 4.3, 8.5 + dz], [6.5, 4.3, 9 + dz], noH(c.s), atk === 0 ? c.w : c.g); if (atk === 0) { P.dot(q[0] - 1, q[1] - 3, c.g, 3, 3); P.dot(q[0], q[1] - 2, c.w); } });
  }), 1.45);
  // 셰이드: 어두운 장갑 + 두건·망토, 청록 렌즈 1px, 긴 저격총(조준경)
  U.shade = unitDef(42, 39, 21, 31, 33, INF, (P, c, f, X, CX, CY) => trooperBase(P, c, f, X, CX, CY, noH(X.dark), (G, dz, atk, box, rd) => {
    const cloak = { o: X.dark.o, d: X.dark.o, m: X.dark.d, l: X.dark.d };
    G.add(-4.1, 0, 3, () => box(-4.1, 0, 1 + dz, 1.6, 8.4, 11, cloak));                                // 망토
    G.add(-4.6, 0, 7, () => box(-4.6, 0, 7 + dz, 2.4, 5.4, 5, noH(X.dark)));
    G.add(0, 0, 10.5, () => box(-0.4, 0, 10.6 + dz, 7, 8.6, 1.4, noH(X.dark)));
    G.add(0.4, 0, HZ, () => {
      const hd = box(0.4, 0, HZ + dz, 6.4, 6.2, 4.4, noH(X.dark)); box(-0.6, 0, HZ + 4.4 + dz, 6.8, 6.8, 1.2, cloak);   // 두건
      visor(P, G, hd, X.dark.o, 4, 1); if (G.sa > -0.35) { const cx = hd.x + hd.w / 2 + G.ca * (hd.w / 2 - 1); P.dot(Math.round(cx), hd.fy + 1, X.teal); }
    });
    const r = atk === 1 ? 1 : 0;
    G.add(6, 4.3, 9, () => { const q = rd([1 - r, 4.3, 8.6 + dz], [13 - r, 4.3, 9.2 + dz], X.gun); const m = G.sp(5 - r, 4.3, 10.8 + dz); P.dot(m[0], m[1], X.teal, 2, 1); if (atk === 0) muzzle(P, q, c); });
  }), 1.45);

  // 하운드: 낮은 차체 + 4바퀴(홈 이동) + 주황 포탑 + 쌍열 기관포 + 전조등
  U.hound = unitDef(54, 51, 27, 35, 39, { idle: 1, move: 4, attack: 2 }, (P, c, f, X, CX, CY) => {
    const G = rig(P, CX, CY, f.ang, f.K), mv = f.anim === 'move' ? f.i : 0, atk = f.anim === 'attack' ? f.i : -1, s = c.s;
    for (const [u, v] of [[8, -7.5], [8, 7.5], [-8, -7.5], [-8, 7.5]]) G.add(u, v, 0, () => {
      G.box(u, v, 0, 7, 3.4, 6, X.gun);
      for (let k = 0; k < 3; k++) { const du = -3 + ((k * 2 + mv * 0.5) % 6); G.line([u + du, v - 1.7, 6.2], [u + du, v + 1.7, 6.2], X.gun.o); }
      const sg = Math.sign(v);                                                                   // 바깥 옆면이 보이면 바퀴 허브
      if (G.gp(0, sg)[1] > G.gp(0, 0)[1] + 0.1) { const [x, y] = G.sp(u, v + sg * 1.8, 3); P.dot(x - 1, y - 1, X.gun.l, 2, 2); P.dot(x - 0.5, y - 0.5, s.o); }
    });
    G.add(0, 0, 3, () => {
      G.box(-1, 0, 3, 24, 12, 5, s);
      G.poly([[11, -6], [16, -4], [16, 4], [11, 6]], 3, 4, s);
      G.box(-11.5, 0, 6, 3, 9, 3, X.gun); for (const v of [-2.5, 2.5]) G.dot(-13, v, 8, X.gun.o);
      for (const v of [-3, 3]) G.dot(16.2, v, 6, c.glow, 2, 1);
      G.box(1, 0, 8, 20, 12.4, 0.6, { o: c.t.o, d: c.t.d, m: c.t.m, l: s.l, h: c.t.l });
    });
    G.add(-1, 0, 9, () => {
      G.box(-2, 0, 8.6, 10, 9, 4, c.t); G.box(-4, 0, 12.6, 3, 5, 1, X.gun); G.dot(-5, -1.5, 14, c.glow);
      for (const v of [-1.3, 1.3]) { const r = atk === 1 && v > 0 ? 1.5 : 0; G.box(8 - r, v, 10.4, 10, 1.3, 1.3, X.gun); }
      if (atk === 0) { muzzle(P, G.sp(13.6, -1.3, 11), c); muzzle(P, G.sp(13.6, 1.3, 11), c); }
    });
    G.flush();
  }, 1.5);

  // 스트라이더: 역관절 2족 보행(허벅지·정강이 = 다리 2 × 2마디) + 조종석(유리) + 양옆 미사일 포드(주황)
  U.strider = unitDef(48, 80, 24, 64, 67, { idle: 1, move: 4, attack: 2 }, (P, c, f, X, CX, CY) => {
    const G = rig(P, CX, CY, f.ang, f.K), s = c.s, mv = f.anim === 'move' ? f.i : -1, atk = f.anim === 'attack' ? f.i : -1;
    const FU = mv >= 0 ? [[7, -7], [0, 0], [-7, 7], [0, 0]][mv] : [2, -2], FZ = mv === 1 ? [0, 4] : mv === 3 ? [4, 0] : [0, 0], dz = mv === 1 || mv === 3 ? 1 : 0;
    const HZ = 21 + dz;
    [-6, 6].forEach((v, n) => G.add(0, v, 0, () => {                                            // 역관절 다리: 허벅지(포금) → 무릎 → 정강이(강철) → 발
      const fu = FU[n], fz = FZ[n], hip = [0, v * 0.9, HZ], foot = [fu, v * 1.1, fz + 2], knee = [fu / 2 + 6, v, (HZ + fz) / 2 + 3];
      G.strut(hip, knee, 5, X.gun); G.strut(knee, foot, 3, s);
      G.box(fu + 1, v * 1.1, fz, 8, 4, 2.4, X.gun); G.dot(knee[0], knee[1], knee[2], s.l, 2, 2);
    }));
    G.add(0, 0, HZ, () => {
      G.box(-1, 0, HZ - 2, 10, 9, 3, X.gun);
      G.box(-1, 0, HZ, 16, 13, 8, s); G.box(-2, 0, HZ + 8, 10, 9, 1.4, s);
      G.poly([[7, -4.6], [11.5, -3], [11.5, 3], [7, 4.6]], HZ + 1, 5.5, s);
      G.poly([[7.5, -3.4], [11, -2.2], [11, 2.2], [7.5, 3.4]], HZ + 6.5, 1, X.glass);
      G.dot(-9.5, 0, HZ + 4, X.gun.o, 2, 2); G.dot(-3, 2.5, HZ + 9.6, c.glow);
    });
    for (const v of [-10, 10]) G.add(-1, v, HZ + 3, () => {
      const r = atk === 1 ? 1 : 0;
      G.box(-1 - r, v * 0.8, HZ + 4, 6, 4, 2, X.gun);
      G.box(-1 - r, v, HZ + 3, 12, 6, 7, c.t);
      for (const dv of [-1.4, 1.4]) for (const dzz of [1.8, 4.6]) G.dot(5.1 - r, v + dv, HZ + 3 + dzz, atk === 0 ? c.w : c.t.o);
      if (atk === 0) { G.dot(7, v, HZ + 7, c.glow, 2, 2); G.dot(9.5, v, HZ + 7.5, X.hot); }
    });
    G.flush();
  }, 1.5);

  // 공중: 엔진 불꽃 2단(move 0/1), 공격 = 날개 아래 섬광. 렌더가 lift·호버를 따로 준다(oy = 동체 아래)
  const AIR = { idle: 1, move: 2, attack: 2 };
  const flame = (G, c, X, u, v, z, big) => { G.dot(u, v, z, c.w); G.dot(u - 1.4, v, z, c.glow, 2, 1); if (big) { G.dot(u - 3, v, z, c.glow); G.dot(u - 4.4, v, z, X.hot); } };
  // 팬텀: 삼각 날개 + 엔진 2 + 유리 조종석
  U.phantom = unitDef(76, 58, 38, 37, 40, AIR, (P, c, f, X, CX, CY) => {
    const G = rig(P, CX, CY, f.ang, f.K), s = c.s, big = f.anim === 'move' && f.i === 1, atk = f.anim === 'attack' ? f.i : -1;
    for (const sg of [-1, 1]) G.add(-5, sg * 9, 5, () => {
      G.poly([[6, sg * 2.5], [-11, sg * 17], [-15, sg * 17], [-13, sg * 2.5]].map(([u, v]) => [u, v]), 5, 1.5, s);
      G.box(-13, sg * 15.5, 6.5, 3, 2, 0.8, c.t);
      if (atk === 0) G.dot(-2, sg * 9, 4.5, c.glow, 2, 2);
    });
    G.add(0, 0, 4, () => {
      G.poly([[19, 0], [9, -3.2], [-14, -3.2], [-16, 0], [-14, 3.2], [9, 3.2]], 4, 4, s);
      G.poly([[13, 0], [7, -1.8], [1, -1.8], [1, 1.8], [7, 1.8]], 8, 1.5, X.glass);
      G.box(-1, 0, 8, 3, 3, 0.6, c.t);
    });
    for (const v of [-2.4, 2.4]) G.add(-12, v, 6, () => { G.box(-12, v, 3.5, 6, 3, 4, X.gun); flame(G, c, X, -15.5, v, 5.5, big); });
    G.flush();
  }, 1.6);
  // 페리: 넓은 수송선 동체 + 쐐기 기수(유리) + 뒤 화물 도어(경고 칠) + 추진 포드 4
  U.ferry = unitDef(80, 67, 40, 43, 46, AIR, (P, c, f, X, CX, CY) => {
    const G = rig(P, CX, CY, f.ang, f.K), s = c.s, big = f.anim === 'move' && f.i === 1, atk = f.anim === 'attack' ? f.i : -1;
    const pod = (u, v) => G.add(u, v, 6, () => {                                                // 옆 엔진 나셀(짧은 날개 끝)
      G.box(u, v * 0.75, 7, 8, Math.abs(v) * 0.6, 1.5, s);
      G.box(u, v, 5, 10, 4.6, 5, X.gun); G.box(u + 4.4, v, 6, 1.2, 4, 3, c.t);
      flame(G, c, X, u - 5.6, v, 7.5, big);
    });
    for (const u of [-11, 11]) for (const v of [-11.5, 11.5]) if (G.gp(u, v)[1] < CY) pod(u, v);
    G.add(0, 0, 4, () => {
      G.box(-2, 0, 4, 34, 16, 9, s);
      G.poly([[15, -8], [24, -4.5], [24, 4.5], [15, 8]], 4, 7, s);
      G.poly([[16, -6], [22, -3.5], [22, 3.5], [16, 6]], 11, 1.2, X.glass);
      G.box(-19.6, 0, 5, 1.6, 12, 7, c.t); G.box(-2, 0, 13, 22, 4, 1.4, c.t);
      for (const v of [-8.3, 8.3]) for (const u of [-10, -4, 2, 8]) G.dot(u, v, 9.5, atk === 0 && u === 8 ? c.w : c.s.o);
      G.dot(-12, -5.8, 13.5, c.glow);
    });
    for (const u of [-11, 11]) for (const v of [-11.5, 11.5]) if (G.gp(u, v)[1] >= CY) pod(u, v);
    G.flush();
  }, 1.6);
  // 서베이어: 원반 3단 + 앞 감지 포드 + 회전 안테나(move 4프레임으로 돈다)
  U.surveyor = unitDef(74, 70, 37, 46, 49, { idle: 1, move: 4, attack: 2 }, (P, c, f, X, CX, CY) => {
    const G = rig(P, CX, CY, f.ang, f.K), s = c.s, mv = f.anim === 'move' ? f.i : 0, atk = f.anim === 'attack' ? f.i : -1;
    G.cyl(0, 0, 2, 26, 3, X.gun); G.cyl(0, 0, 5, 24, 3, s);
    for (let n = 0; n < 12; n++) { const a = n / 12 * TAU, x = CX + Math.cos(a) * 23.5 * f.K, y = CY + (Math.sin(a) * 23.5 * FLAT - 6.5) * f.K; if (Math.sin(a) > -0.2) P.dot(x, y, (n + mv) % 4 === 0 ? c.glow : c.s.o); }
    G.add(20, 0, 5, () => { G.box(20, 0, 4, 8, 7, 4, c.t); G.dot(24.4, 0, 6, atk === 0 ? c.w : X.teal, 2, 1); });
    G.cyl(0, 0, 8, 15, 3, s); G.cyl(0, 0, 11, 8, 3, X.glass);
    G.add(0, 0, 14, () => {
      G.strut([0, 0, 14], [0, 0, 25], 2, X.gun);
      const th = mv * Math.PI / 4, a1 = [Math.cos(th) * 9, Math.sin(th) * 9];
      G.strut([-a1[0], -a1[1], 25], [a1[0], a1[1], 25], 2, s);
      G.dot(a1[0], a1[1], 26, c.glow); G.dot(-a1[0], -a1[1], 26, c.t.l);
    });
    G.flush();
  }, 1.4);
  // 랜서: 길쭉한 미사일 동체 + 날개 4(앞 카나드 2·뒤 큰 날개 2) + 쌍발 엔진
  U.lancer = unitDef(88, 68, 44, 43, 46, AIR, (P, c, f, X, CX, CY) => {
    const G = rig(P, CX, CY, f.ang, f.K), s = c.s, big = f.anim === 'move' && f.i === 1, atk = f.anim === 'attack' ? f.i : -1;
    for (const sg of [-1, 1]) {
      G.add(-14, sg * 10, 6, () => { G.poly([[-8, sg * 4], [-16, sg * 16], [-21, sg * 16], [-19, sg * 4]], 6, 1.5, s); G.box(-18.5, sg * 14.6, 7.5, 4, 2, 0.8, c.t); if (atk === 0) G.dot(-14, sg * 9, 5.5, c.glow, 2, 2); else G.box(-12, sg * 9, 4.5, 5, 1.4, 1.4, X.gun); });
      G.add(8, sg * 6, 7, () => G.poly([[12, sg * 3.5], [6, sg * 9.5], [3, sg * 9.5], [4, sg * 3.5]], 7, 1, s));
    }
    G.add(0, 0, 4, () => {
      G.poly([[26, 0], [19, -4], [-20, -4], [-23, 0], [-20, 4], [19, 4]], 4, 7, s);
      G.poly([[26, 0], [21, -3.4], [16, -3.4], [16, 3.4], [21, 3.4]], 4, 7.2, c.t, true);
      G.poly([[13, 0], [9, -1.6], [2, -1.6], [2, 1.6], [9, 1.6]], 11, 1, X.glass);
      G.box(-6, 0, 11, 12, 2, 1, X.gun);
    });
    for (const v of [-2, 2]) G.add(-22, v, 7, () => flame(G, c, X, -23.5, v, 7.5, big));
    G.flush();
  }, 1.55);
  // 드레드노트: 전함(128×100 — 8방향 회전에 길이 96이 들어가도록 세로를 늘렸다), 포탑 3(주황 cyl), 함교 창 발광, 엔진 3
  U.dreadnought = unitDef(136, 111, 68, 71, 75, AIR, (P, c, f, X, CX, CY) => {
    const G = rig(P, CX, CY, f.ang, f.K), s = c.s, big = f.anim === 'move' && f.i === 1, atk = f.anim === 'attack' ? f.i : -1;
    G.add(0, 0, 4, () => {
      G.poly([[48, 0], [36, -12], [-36, -15], [-46, -10], [-46, 10], [-36, 15], [36, 12]], 4, 10, s);
      G.poly([[46, 0], [36, -10], [30, -10], [30, 10], [36, 10]], 14, 0.8, c.t);
      G.poly([[34, 0], [26, -8], [-30, -10], [-38, -6], [-38, 6], [-30, 10], [26, 8]], 14, 5, s);
      for (const sg of [-1, 1]) for (let u = -30; u < 30; u += 6) G.dot(u, sg * 14.6, 10, (u / 6 + (f.i || 0)) % 3 ? c.s.o : c.glow);
      for (const sg of [-1, 1]) G.box(0, sg * 13.6, 8, 64, 1, 1.4, c.t);
    });
    for (const [u, z] of [[24, 19], [10, 19], [-32, 19]]) G.add(u, 0, z, () => {
      G.cyl(u, 0, z, 5, 3, c.t); const back = u < 0, dir = back ? -1 : 1, r = atk === 1 ? 1.5 : 0;
      for (const v of [-1.4, 1.4]) G.box(u + dir * (7 - r), v, z + 1.5, 9, 1.2, 1.2, X.gun);
      if (atk === 0 && !back) { muzzle(P, G.sp(u + 12, -1.4, z + 2.4), c); muzzle(P, G.sp(u + 12, 1.4, z + 2.4), c); }
    });
    G.add(-14, 0, 19, () => {
      G.box(-14, 0, 19, 14, 11, 9, s); G.box(-16, 0, 28, 8, 7, 4, s);
      G.box(-6.6, 0, 22.5, 0.6, 9, 2.5, { o: s.o, d: c.glow, m: c.glow, l: c.w, h: c.w });
      G.strut([-18, 0, 32], [-18, 0, 40], 1, X.gun); G.dot(-18, 0, 41, c.glow);
    });
    for (const v of [-6, 0, 6]) G.add(-46, v, 9, () => { G.box(-45, v, 6, 4, 4, 5, X.gun); flame(G, c, X, -47.5, v, 8.5, big); });
    G.flush();
  }, 1.3);

  // 배스천 포격 모드(3a 용 변형 '@siege'): 궤도 접고 지지대 4개 펼침, 포신 1.4배
  U['bastion@siege'] = unitDef(66, 57, 33, 41, 45, { idle: 1, attack: 2 }, (P, c, f, X, CX, CY) => {
    const G = rig(P, CX, CY, f.ang, f.K), s = c.s, atk = f.anim === 'attack' ? f.i : -1;
    for (const [u, v] of [[12, 13], [12, -13], [-12, 13], [-12, -13]]) G.add(u * 0.9, v * 0.9, 0, () => {
      G.strut([u * 0.5, v * 0.45, 8], [u, v, 1], 3, X.gun); G.box(u, v, 0, 5, 5, 1.5, s);
    });
    G.add(0, 0, 1, () => {
      for (const v of [8, -8]) G.box(0, v, 2, 28, 5, 4, X.gun);
      G.box(0, 0, 5, 30, 18, 7, s); G.box(-1, 0, 12, 22, 13, 1, s);
      G.box(-12, 0, 12, 5, 12, 1, X.gun);
    });
    G.add(-2, 0, 13, () => {
      const r = atk === 0 ? 5 : atk === 1 ? 2 : 0, len = 27 - r;
      G.box(-2, 0, 13, 14, 12, 5, c.t); G.box(5.5, 0, 13.5, 3, 7, 4, c.t);
      G.box(4 + len / 2, 0, 14.5, len, 3, 3, s);
      G.box(4 + len - 1.5, 0, 14, 3, 5, 4, atk === 0 ? { d: s.l, m: s.h, l: c.w, h: c.w } : { d: s.d, m: s.m, l: s.h, h: c.w });
      if (atk === 0) muzzle(P, G.sp(6 + len, 0, 16), c);
      G.cyl(-5, -3, 18, 2.6, 2, s); G.dot(-7, 4, 18.5, c.glow);
    });
    G.flush();
  });
  // 시커(seeker, 3b 소환 전용 — 스키드가 풀어 놓는 자폭 드론): 낮게 뜬 쐐기 동체 + 주황 경고 등판 + 앞 붉은 눈 + 옆 스키드 2 + 꼬리 분사구.
  // 지상 유닛(반지름 4)이지만 2px 떠서 분사 불꽃이 바닥을 비춘다. move 2 = 분사 깜빡임, attack 2 = 눈 섬광(자폭 직전)
  U.seeker = unitDef(36, 32, 18, 25, 27, { idle: 1, move: 2, attack: 2 }, (P, c, f, X, CX, CY) => {
    const G = rig(P, CX, CY, f.ang, f.K), s = c.s, mv = f.anim === 'move' ? f.i : 0, atk = f.anim === 'attack' ? f.i : -1;
    for (const v of [-3.4, 3.4]) G.add(-0.5, v, 1, () => { G.box(-0.5, v, 1.2, 6, 1.2, 1.6, X.gun); G.dot(2.4, v, 2.2, s.o); });
    G.add(-5, 0, 3, () => { G.box(-5, 0, 3, 2, 3, 2.6, X.gun); G.dot(-6.4, 0, 4.2, mv ? c.w : c.glow, 1, 1); if (mv) G.dot(-7.6, 0, 4.2, X.hot); });
    G.add(0, 0, 3, () => {
      G.poly([[6.5, 0], [3.5, -3.2], [-4.5, -3.2], [-5.5, 0], [-4.5, 3.2], [3.5, 3.2]], 3, 3.2, s);
      G.poly([[3.6, 0], [1.6, -1.9], [-3.4, -1.9], [-3.4, 1.9], [1.6, 1.9]], 6.2, 0.8, c.t);
      G.dot(-1, 0, 7.4, s.o); G.dot(-2.2, -1.2, 7.4, c.t.o);
      G.dot(6.6, 0, 4.6, atk === 0 ? c.w : atk === 1 ? c.glow : X.hot, 1, 1);
    });
    G.add(-2.5, 0, 7, () => { G.strut([-2.5, 0, 7], [-4, 0, 10.5], 1, X.gun); G.dot(-4, 0, 11, atk >= 0 || mv ? c.glow : c.t.l); });
    G.flush();
  }, 1.7);
  // 연출 화면(VS·로비 분대)의 공격 섬광 자리: muzzle = 대기 동쪽 자세, muzzleSE = 대기 남동 자세(캔버스 좌표, 외곽선 1px 포함)
  Object.assign(A.SPR, U);
  A.SPR.bastion.muzzle = [57, 20]; A.SPR.bastion.muzzleSE = [51, 28];   // 바스티온 정의는 art.js
  // Task 9: 옛 화면 크기보다 작게 읽히던 유닛을 키운다(포격 모드는 바스티온과 같은 배율)
  for (const [id, k] of [['engineer', 1.1], ['trooper', 1.06], ['shade', 1.1], ['scorcher', 1.1], ['corpsman', 1.12], ['dreadnought', 1.1], ['bastion', 1.4], ['bastion@siege', 1.4]]) A.SPR[id] = A.grow(A.SPR[id], k);

  // ===================================================================== 잔해 =====================================================================
  // 'wreck@legion-s|m|l': 그을린 판 + 휜 금속 파편(해시 배치). 지상 유닛 사망 때 렌더가 240틱 남긴다.
  [['s', 14, 10, 3], ['m', 24, 16, 5], ['l', 40, 26, 8]].forEach(([sz, W, H, n]) => {
    A.SPR['wreck@legion-' + sz] = { w: W, h: H, px: 1, ox: W / 2, oy: H * 0.65, dirs: 1, frames: {}, draw(P, c, f) {
      const X = pals(f.T), s = c.s, g = X.gun, cx = W / 2, cy = H * 0.62, sd = strHash(sz);
      P.fell(cx, cy, W * 0.47, H * 0.32, g.o);
      P.dither(Math.round(cx - W * 0.4), Math.round(cy - H * 0.2), Math.round(W * 0.8), Math.round(H * 0.4), c.k);
      P.fpoly([[cx - W * 0.3, cy + 1], [cx - W * 0.1, cy - H * 0.3], [cx + W * 0.25, cy - H * 0.22], [cx + W * 0.3, cy + 2]], g.d);
      P.line(cx - W * 0.1, cy - H * 0.3, cx + W * 0.25, cy - H * 0.22, g.l);
      for (let k = 0; k < n; k++) {
        const h = hash(sd, k), x = cx + ((h & 255) / 255 - 0.5) * W * 0.8, y = cy + (((h >>> 8) & 255) / 255 - 0.6) * H * 0.6, l = 2 + ((h >>> 16) & 3) + (sz === 'l' ? 2 : 0);
        P.fpoly([[x, y], [x + l, y - 1 - ((h >>> 20) & 1)], [x + l - 1, y + 1]], (h >>> 22) & 1 ? s.m : s.d);
        P.dot(x, y - 1, s.l);
      }
      if (sz !== 's') { P.r(Math.round(cx - W * 0.35), Math.round(cy - 2), Math.round(W * 0.3), 3, g.m); for (let x = Math.round(cx - W * 0.35); x < cx - W * 0.05; x += 2) P.dot(x, cy - 2, g.o); }
      if (sz === 'l') { P.line(cx + 2, cy - 4, cx + W * 0.4, cy - H * 0.45, g.m); P.line(cx + 2, cy - 3, cx + W * 0.4, cy - H * 0.42, g.d); P.r(Math.round(cx - 5), Math.round(cy - 7), 8, 4, c.t.d); P.r(Math.round(cx - 5), Math.round(cy - 7), 8, 1, c.t.m); }
      P.dot(cx + 1, cy - 1, c.glow); if (sz !== 's') P.dot(cx - W * 0.2, cy, X.hot);
    } };
  });
})();
