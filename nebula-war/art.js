// 네뷸라 워 — 아트 정의. 색 유틸·스프라이트 펜·종족 팔레트·스프라이트 정의 표(SPR)·지형 청크 그리기.
// 이미지 파일 없이 코드로만 그린다. 렌더러(render.js)가 오프스크린 캔버스에 한 번 그려 캐시한다.
// 정의 { w, h, px: 1, ox, oy, dirs, frames, draw(P, c, f) } = 1:1.
// node 에서도 불러올 수 있다(순수 함수 테스트) — 모듈을 읽을 때 document 를 쓰지 않는다.
const NW_ART = (() => {
  const clamp = v => v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
  // f<1 어둡게, f>1 흰색 쪽으로 (f=2 → 흰색; 미니맵 바위는 1.5)
  function shade(c, f) {
    return f <= 1 ? [c[0] * f, c[1] * f, c[2] * f, c[3]] : [c[0] + (255 - c[0]) * (f - 1), c[1] + (255 - c[1]) * (f - 1), c[2] + (255 - c[2]) * (f - 1), c[3]];
  }
  const css = (c, f = 1, a) => { const s = f === 1 ? c : shade(c, f); return `rgba(${clamp(s[0])},${clamp(s[1])},${clamp(s[2])},${a === undefined ? s[3] : a})`; };

  // --- 스프라이트 펜. 옛 메서드(r e p l clear cut)는 캔버스 경로(가장자리는 finish()에서 임계 처리),
  // 새 3/4 시점 도형(prism cyl blob)과 fpoly·fell·line·dot·dither 는 픽셀 중심 표본으로 직접 래스터화 — 안티앨리어싱 색이 생기지 않는다 ---
  const LX = -0.6, LY = -0.8;                               // 빛: 좌상단 (정규화된 (-0.6, -0.8))
  const FLAT = 0.7;                                         // 3/4 시점: 지면 y 를 0.7 로 눌러 그린다 (sy = y * 0.7 - z)
  function pen(ctx) {
    const span = (x0, x1, y, c) => { if (x1 >= x0) { ctx.fillStyle = c; ctx.fillRect(x0, y, x1 - x0 + 1, 1); } };
    const P = {
      ctx,
      // 다각형(볼록·오목): 각 행의 픽셀 중심(y+.5)에서 가장자리 교차점 사이 픽셀 중심을 채운다 → 맞닿은 면 사이 틈·겹침 없음
      fpoly(pts, c) {
        let y0 = Infinity, y1 = -Infinity;
        for (const p of pts) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
        const xs = [];
        for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
          const yc = y + 0.5; xs.length = 0;
          for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const a = pts[j], b = pts[i];
            if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
          }
          xs.sort((p, q) => p - q);
          for (let k = 0; k + 1 < xs.length; k += 2) span(Math.ceil(xs[k] - 0.5), Math.floor(xs[k + 1] - 0.5), y, c);
        }
      },
      fell(cx, cy, rx, ry, c) {
        for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
          const t = (y + 0.5 - cy) / ry; if (t <= -1 || t >= 1) continue;
          const hw = rx * Math.sqrt(1 - t * t); span(Math.ceil(cx - hw - 0.5), Math.floor(cx + hw - 0.5), y, c);
        }
      },
      dot(x, y, c, w = 1, h = 1) { ctx.fillStyle = c; ctx.fillRect(Math.floor(x), Math.floor(y), w, h); },
      line(x0, y0, x1, y1, c) {                              // 브레즌햄 1px
        x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.floor(x1); y1 = Math.floor(y1);
        const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
        let err = dx + dy; ctx.fillStyle = c;
        for (;;) { ctx.fillRect(x0, y0, 1, 1); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
      },
      // (x + y) & 1 인 픽셀만 c 로(c2 가 있으면 나머지는 c2) — 2색 체커 디더
      dither(x, y, w, h, c, c2) {
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
          const on = ((x + i + y + j) & 1) === 1; if (!on && !c2) continue;
          ctx.fillStyle = on ? c : c2; ctx.fillRect(x + i, y + j, 1, 1);
        }
      },
      // 직육면체: 바닥 중심 (cx, cy) = 지면(z=0)의 화면 좌표, 높이 z 에서 hgt 만큼, 방향 ang(0 = 동쪽, 시계 방향).
      // 보이는 옆면(바깥 법선의 화면 y > 0)을 먼저, 윗면(l)을 나중에. 옆면 음영 = 법선·빛 > 0.2 → m, 아니면 d. 윗면 앞 모서리 1px h.
      prism(cx, cy, z, len, wid, hgt, ang, rp) {
        const ca = Math.cos(ang), sa = Math.sin(ang), l = len / 2, w = wid / 2;
        const loc = [[l, -w], [l, w], [-l, w], [-l, -w]], nrm = [[1, 0], [0, 1], [-1, 0], [0, -1]];
        const g = loc.map(([u, v]) => [cx + u * ca - v * sa, cy + (u * sa + v * ca) * FLAT]);
        const bot = g.map(([x, y]) => [x, y - z]), top = g.map(([x, y]) => [x, y - z - hgt]);
        const vis = [];
        for (let i = 0; i < 4; i++) {
          const nx = nrm[i][0] * ca - nrm[i][1] * sa, ny = nrm[i][0] * sa + nrm[i][1] * ca, j = (i + 1) & 3;
          if (ny <= 0.01) continue;
          vis.push(i);
          if (hgt > 0) P.fpoly([bot[i], bot[j], top[j], top[i]], nx * LX + ny * LY > 0.2 ? rp.m : rp.d);
        }
        P.fpoly(top, rp.l);
        if (rp.h) for (const i of vis) { const j = (i + 1) & 3; P.line(top[i][0], top[i][1] - 0.5, top[j][0], top[j][1] - 0.5, rp.h); }
        return { top, bot };
      },
      // 세로 원기둥: 옆면 d → 왼쪽 m (빛이 좌상단), 윗면 타원 l, 왼쪽 위 하이라이트 h
      cyl(cx, cy, z, r, hgt, rp) {
        const ry = r * FLAT, yb = cy - z, yt = yb - hgt;
        P.fell(cx, yb, r, ry, rp.d); P.r(Math.ceil(cx - r - 0.5), Math.floor(yt), Math.floor(cx + r - 0.5) - Math.ceil(cx - r - 0.5) + 1, Math.ceil(yb) - Math.floor(yt), rp.d);
        const xm = Math.round(cx - r * 0.25);
        for (let y = Math.floor(yt); y <= Math.ceil(yb + ry); y++) {                // 왼쪽 밝은 쪽
          const t = (y + 0.5 - yb) / ry, hw = y + 0.5 <= yb ? r : t < 1 ? r * Math.sqrt(1 - t * t) : -1;
          if (hw > 0) span(Math.ceil(cx - hw - 0.5) + 1, Math.min(xm, Math.floor(cx + hw - 0.5)), y, rp.m);
        }
        P.fell(cx, yt, r, ry, rp.l);
        if (rp.h) { P.dot(cx - r * 0.45, yt - ry * 0.45, rp.h, 2, 1); }
      },
      // 유기체 덩어리: d 전체 → m(좌상 18%, 82%) → l(좌상 35%, 45%) → h 1~2px. d·m 경계는 체커 디더
      blob(cx, cy, rx, ry, rp) {
        P.fell(cx, cy, rx, ry, rp.d);
        const mx = cx - rx * 0.18, my = cy - ry * 0.18;
        for (let y = Math.floor(my - ry * 0.9); y <= Math.ceil(my + ry * 0.9); y++) {   // 디더 띠(82%~90%)
          const t = (y + 0.5 - my) / (ry * 0.9); if (t <= -1 || t >= 1) continue;
          const hw = rx * 0.9 * Math.sqrt(1 - t * t), x0 = Math.ceil(mx - hw - 0.5), x1 = Math.floor(mx + hw - 0.5);
          for (let x = x0; x <= x1; x++) if (((x + y) & 1) === 1) P.dot(x, y, rp.m);
        }
        P.fell(mx, my, rx * 0.82, ry * 0.82, rp.m);
        P.fell(cx - rx * 0.35, cy - ry * 0.35, rx * 0.45, ry * 0.45, rp.l);
        if (rp.h) P.dot(cx - rx * 0.45, cy - ry * 0.5, rp.h, rx > 6 ? 2 : 1, 1);
      },
      r(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); },
      e(cx, cy, rx, ry, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 6.2832); ctx.fill(); },
      p(pts, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fill(); },
      l(x0, y0, x1, y1, c, w = 1) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); },
      clear(x, y, w, h) { ctx.clearRect(x, y, w, h); },
      cut(w, h, k) { // 네 모서리 면취(각진 실루엣)
        for (let i = 0; i < k; i++) {
          ctx.clearRect(0, i, k - i, 1); ctx.clearRect(w - (k - i), i, k - i, 1);
          ctx.clearRect(0, h - 1 - i, k - i, 1); ctx.clearRect(w - (k - i), h - 1 - i, k - i, 1);
        }
      },
    };
    return P;
  }

  const SPR = {};

  // ===================== 새 화풍 견본 (px: 1, 3/4 시점, 좌상단 빛) =====================
  // 파생 램프(토큰 rgb 에서 만든 것)는 T 하나당 한 번만 만든다
  const rmemo = new Map(); let rmT = null;
  const rampOf = (T, id, mk) => { if (rmT !== T) { rmemo.clear(); rmT = T; } let r = rmemo.get(id); if (!r) { r = ramp(mk(), T); rmemo.set(id, r); } return r; };

  // 레기온 바스티온(전차). 바닥 중심 (32, 36), 발밑 (32, 40). 방향 0·1·2·6·7 만 들어온다(3·4·5 는 렌더가 반전).
  // 짙은 포금색 궤도 + 강철 차체 + 주황 포탑 — 포탑도 방향을 따라 돌아 실루엣만으로 진행 방향이 읽힌다
  SPR.bastion = { w: 64, h: 52, px: 1, ox: 32, oy: 40, dirs: 8, frames: { idle: 1, move: 4, attack: 2 }, draw(P, c, f) {
    const T = f.T, a = f.ang, ca = Math.cos(a), sa = Math.sin(a), CX = 32, CY = 36;
    const gp = (u, v) => [CX + u * ca - v * sa, CY + (u * sa + v * ca) * FLAT];   // 차체 좌표(u 전방, v 오른쪽) → 화면(z = 0)
    const pr = (u, v, z, len, wid, hgt, rp) => { const [x, y] = gp(u, v); return P.prism(x, y, z, len, wid, hgt, a, rp); };
    const s = c.s, t = c.t, tr = rampOf(T, 'legion-track', () => shade(T['legion-a'], 0.55));
    const mv = f.anim === 'move' ? f.i : 0, recoil = f.anim === 'attack' ? (f.i === 0 ? 4 : 1) : 0;
    const track = v => {
      pr(0, v, 0, 34, 7, 6, tr);
      for (let u = -14 + 2 * mv; u < 17; u += 8) {                                   // 궤도 홈: 이동 프레임마다 2px 전진(8px 주기)
        const [x0, y0] = gp(u, v - 3.5), [x1, y1] = gp(u, v + 3.5); P.line(x0, y0 - 6.5, x1, y1 - 6.5, tr.o);
      }
      const sg = Math.sign(v);
      if (sg * ca > 0.2) for (let k = 0; k < 5; k++) {                               // 바깥 옆면이 보이면 바퀴 5개
        const [wx, wy] = gp(-12 + k * 6, v + sg * 3.5); P.fell(wx, wy - 3, 2.4, 2.4, tr.o); P.dot(wx - 1, wy - 4, tr.m);
      }
    };
    const behind = v => gp(0, v)[1] < CY - 0.01;
    for (const v of [10, -10]) if (behind(v)) track(v);
    const nose = () => { pr(16.5, 0, 4, 4, 17, 5, s); for (const v of [-6, 6]) { const [x, y] = gp(18.5, v); P.dot(x - 1, y - 8, c.glow, 2, 1); } };
    if (sa < -0.01) nose();
    pr(0, 0, 5, 30, 18, 7, s);                                                       // 차체
    pr(-1, 0, 12, 22, 13, 1, s);                                                     // 갑판(한 단 높게 — 윗면 테두리 빛)
    const grille = pr(-12, 0, 12, 5, 12, 1, tr);                                     // 뒤 엔진 그릴
    for (let k = 1; k < 4; k++) { const [x0, y0] = gp(-14.5 + k * 1.25, -5), [x1, y1] = gp(-14.5 + k * 1.25, 5); P.line(x0, y0 - 13.5, x1, y1 - 13.5, tr.o); }
    void grille;
    if (sa >= -0.01) nose();
    for (const v of [10, -10]) if (!behind(v)) track(v);
    const turret = () => {
      const mant = () => pr(5.5, 0, 13.5, 3, 7, 4, t);                              // 포방패(앞이 멀면 몸통보다 먼저)
      if (sa < -0.01) mant();
      pr(-2, 0, 13, 14, 12, 5, t);                                                   // 주황 포탑
      if (sa >= -0.01) mant();
      const [cx, cy] = gp(-5, -3); P.cyl(cx, cy, 18, 2.6, 2, s);                     // 전차장 큐폴라
      const [lx, ly] = gp(-7, 4); P.dot(lx, ly - 18.5, c.glow);                      // 램프
    };
    const barrel = () => {
      const len = 19 - recoil, fl = f.anim === 'attack' && f.i === 0;
      pr(4 + len / 2, 0, 14.5, len, 3, 3, s);
      pr(4 + len - 1.5, 0, 14, 3, 5, 4, fl ? { d: s.l, m: s.h, l: c.w, h: c.w } : { d: s.d, m: s.m, l: s.h, h: c.w });   // 포구 제동기(공격 0프레임은 달아오름)
    };
    if (sa < -0.01) { barrel(); turret(); } else { turret(); barrel(); }
  } };

  // 레기온 주둔지(4×3 타일). 캔버스 128×112, 터 = y 16..112. 터는 화면 좌표 그대로(건물은 위로만 솟는다)
  // box: 왼쪽 x0, 앞 아래 모서리 화면 y yB, 폭 w, 화면 깊이 dS, 지면 높이 z, 높이 h
  const box = (P, x0, yB, w, dS, z, h, rp) => P.prism(x0 + w / 2, yB + z - dS / 2, z, w, dS / FLAT, h, 0, rp);
  SPR.garrison = { w: 128, h: 112, px: 1, ox: 0, oy: 16, dirs: 1, frames: { build: 3, work: 4 }, draw(P, c, f) {
    const T = f.T, s = c.s, t = c.t, i = f.i;
    const slab = rampOf(T, 'legion-slab', () => mix(T['legion-a'], T['color-void'], 0.5));
    const stage = f.anim === 'build' ? i : 3, dmg = f.dmg || 0, live = stage === 3;
    box(P, 3, 110, 122, 84, 0, 3, slab);                                             // 콘크리트 판
    for (let x = 27; x < 124; x += 24) P.r(x, 23, 1, 84, slab.d);                    // 판 이음매
    for (const y of [44, 72]) P.r(4, y, 120, 1, slab.d);
    for (let k = 0; k < 7; k++) P.r(40 + k * 7, 101, 4, 3, k & 1 ? slab.d : t.d);    // 정문 앞 경고 칠
    const pillars = h => { for (const [x, yB] of [[12, 64], [88, 64], [12, 94], [88, 94]]) box(P, x, yB, 4, 3, 3, h, s); };
    const scaffold = (y0, y1) => { for (const [x0, x1] of [[14, 52], [52, 90]]) { P.line(x0, y1, x1, y0, s.o); P.line(x0, y0, x1, y1, s.o); } P.line(12, y0, 92, y0, s.o); P.line(12, y0 + 1, 92, y0 + 1, s.d); };
    if (stage === 0) { pillars(34); scaffold(57, 94); return; }
    if (stage === 1) { box(P, 12, 94, 80, 30, 3, 17, s); pillars(34); scaffold(57, 77); return; }
    // 그림자(빛이 좌상단 → 오른쪽·아래로): 판 위 체커 디더
    P.dither(92, 40, 12, 56, slab.o); P.dither(16, 94, 80, 4, slab.o);
    // 굴뚝 + 배관
    P.cyl(110, 72, 3, 6, 32, s); P.fell(110, 37, 4, 2.4, c.k);
    if (live && !dmg) P.dot(110, 32 - (i & 1), c.glow);                              // 굴뚝 열기 1px
    P.r(92, 80, 12, 3, s.d); P.r(92, 80, 12, 1, s.l);
    box(P, 12, 94, 80, 30, 3, 34, s);                                                // 본관
    for (let x = 22; x < 92; x += 10) P.line(x, 31, x, 57, s.m);                     // 지붕 판넬 이음
    box(P, 20, 50, 14, 8, 37, 5, s); box(P, 40, 50, 12, 8, 37, 5, s);                // 지붕 환기구
    for (let k = 0; k < 3; k++) P.r(22 + k * 4, 39, 2, 1, s.o);
    box(P, 68, 46, 16, 6, 37, 2, s); P.line(80, 37, 80, 26, s.d); P.dot(80, 25, live ? c.glow : s.d);   // 통신 안테나
    box(P, 12, 60, 80, 5, 37, 3, t);                                                 // 지붕 앞 주황 띠
    // 정면(어두운 면): 판넬 줄눈, 정문(경고 사선 머리 + 셔터), 창문
    for (const x of [34, 70]) P.r(x, 63, 1, 31, s.o);
    for (let x = 38; x < 66; x++) for (let y = 66; y < 70; y++) P.dot(x, y, ((x + (69 - y)) >> 2) & 1 ? s.o : t.l);
    P.r(39, 70, 26, 24, s.o); P.r(41, 71, 22, 23, s.d);
    for (let y = 73; y < 94; y += 3) P.r(41, y, 22, 1, s.o);
    P.r(41, 71, 22, 1, s.m);
    P.r(48, 63, 8, 2, live ? c.glow : s.o);                                          // 정문 위 표시등
    [16, 25, 73, 82].forEach((x, k) => {                                             // 창문 4개: 가동 중이면 하나씩 유리색으로 깜빡
      P.r(x - 1, 68, 8, 7, s.o);
      const off = !live || (dmg >= 1 && k === 3) || (dmg >= 2 && k === 0);
      P.r(x, 69, 6, 5, off ? c.k : (k + i) % 4 === 0 ? c.g : c.glow);
      if (!off) P.r(x, 69, 2, 1, c.w);
      P.r(x - 1, 75, 8, 1, s.m);                                                     // 창턱
    });
    for (const x of [18, 28, 76, 86]) P.r(x, 80, 2, 8, s.o);                         // 환기 슬롯
    P.r(12, 60, 1, 34, s.m);                                                         // 왼쪽 모서리 빛
    if (dmg >= 1) {                                                                  // 손상: 그을음(디더) + 금, 2단계는 지붕 구멍
      P.dither(20, 78, 12, 12, s.o); P.dither(70, 64, 12, 10, s.o); P.dither(44, 36, 14, 8, s.o);
      P.line(30, 62, 34, 72, s.o); P.line(34, 72, 31, 80, s.o);
    }
    if (dmg >= 2) {
      P.fpoly([[54, 38], [65, 35], [72, 41], [68, 50], [57, 52], [51, 45]], s.o); P.fpoly([[56, 41], [64, 38], [68, 43], [65, 48], [58, 49]], c.k);
      P.line(51, 45, 46, 47, s.o); P.line(72, 41, 77, 39, s.o);
      P.dither(12, 62, 14, 16, s.o); P.dither(76, 80, 14, 10, s.o);
    }
  } };

  // 크리스탈(2×1 타일). 캔버스 64×40, 터 = y 8..40. 큰 기둥 3 + 작은 기둥 2, 기둥 = 왼쪽 면 l · 오른쪽 면 d · 꼭짓점 h
  SPR.crystal = { w: 64, h: 40, px: 1, ox: 0, oy: 8, dirs: 1, frames: { stage: 3 }, draw(P, c, f) {
    const K = rampOf(f.T, 'crystal', () => f.T.crystal), st = f.i;
    // [x, 바닥 y, 반폭, 높이, 기울기, 큰 기둥?]
    let ps = [[20, 31, 7, 27, -3, 1], [8, 36, 5, 15, -4, 0], [46, 32, 7, 24, 4, 1], [32, 36, 8, 32, 1, 1], [57, 37, 5, 13, 3, 0]];
    if (st === 1) ps = ps.filter(p => p[5]).map(p => [p[0], p[1], p[2], Math.round(p[3] * 0.75), p[4], 1]);
    if (st === 2) ps = [[33, 36, 7, 16, 1, 1]];
    P.fell(32, 36, st === 2 ? 12 : st === 1 ? 22 : 28, 3, K.o);                                      // 바닥 그림자 받침
    if (st === 2) for (const [x, y] of [[18, 35], [46, 37], [26, 39]]) P.fpoly([[x - 3, y], [x, y - 4], [x + 3, y]], K.l), P.dot(x, y - 3, K.h);
    for (const [x, y, w, h, lean] of ps.sort((p, q) => p[1] - q[1])) {
      const tip = [x + lean, y - h], sl = [x - w + lean * 0.6, y - h * 0.62], sr = [x + w + lean * 0.6, y - h * 0.62];
      const bl = [x - w, y], bm = [x + 1, y + 2], br = [x + w, y];
      P.fpoly([bl, bm, tip, sl], K.l);
      P.fpoly([bm, br, sr, tip], K.d);
      P.fpoly([[x - w * 0.35, y - 1], [x + 0.5, y + 1], tip], K.m);                 // 앞 결정면
      P.line(bm[0], bm[1] - 1, tip[0], tip[1], K.h);                                 // 모서리 반사
      P.dot(tip[0] - 1, tip[1], c ? K.h : K.h, 2, 1); P.dot(sl[0] + 1, sl[1] + 1, K.h);
    }
  } };

  // 임계 처리(안티앨리어싱 제거: 알파 ≥ 110 → 불투명) + 1px 외곽선. outline = [r,g,b]. 반환 = 불투명 마스크
  function finish(img, outline) {
    const W = img.width, H = img.height, d = img.data, solid = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) { if (d[i * 4 + 3] >= 110) { d[i * 4 + 3] = 255; solid[i] = 1; } else d[i * 4 + 3] = 0; }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; if (solid[i]) continue;
      if ((x > 0 && solid[i - 1]) || (x < W - 1 && solid[i + 1]) || (y > 0 && solid[i - W]) || (y < H - 1 && solid[i + W])) {
        d[i * 4] = outline[0]; d[i * 4 + 1] = outline[1]; d[i * 4 + 2] = outline[2]; d[i * 4 + 3] = 255;
      }
    }
    return solid;
  }
  // 피격 번쩍임: 외곽선만 남기고 몸통을 c 로
  function tint(img, solid, c) { const d = img.data; for (let i = 0; i < solid.length; i++) if (solid[i]) { d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; } }
  // 공명장 밖: 어둡고 채도 낮게
  function desat(img) {
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) { if (!d[i + 3]) continue; const m = (d[i] + d[i + 1] + d[i + 2]) / 3; for (let k = 0; k < 3; k++) d[i + k] = (d[i + k] * 0.4 + m * 0.25) * 0.8 + 6; }
  }
  const def = type => SPR[type];

  // ===== 새 화풍(px: 1) — 램프·자세·방향 =====
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] === undefined ? 1 : a[3]];
  // 픽셀 아트 램프: 어둠은 void(푸른 남색) 쪽, 밝음은 glint 쪽으로 — 명도와 함께 색상이 살짝 이동한다
  function ramp(base, T) {
    const v = T['color-void'], g = T['color-glint'];
    return { o: css(mix(base, v, 0.78)), d: css(mix(base, v, 0.45)), m: css(base), l: css(mix(base, g, 0.28)), h: css(mix(base, g, 0.6)), oRgb: mix(base, v, 0.78).slice(0, 3).map(Math.round) };
  }
  // 새 정의용 종족 팔레트: s = 몸(주재료), t = 보조재, g = 유리·심, glow = 발광. 외곽선 o = s.o (순흑이 아닌 몸색의 가장 어두운 단계)
  const RACE = {
    legion:  { s: 'legion-a', t: 'legion-b', g: ['crystal', 1.3], glow: ['color-fire-hot', 1] },
    swarm:   { s: 'swarm-a', t: 'swarm-b', g: ['color-gas', 1], glow: ['color-gas', 1.5] },
    elysian: { s: 'elysian-a', t: 'elysian-b', g: ['color-glint', 1], glow: ['elysian-b', 1.3] },
  };
  const palCache = new Map();
  function racePal(race, T) {
    let p = palCache.get(race); if (p && p.T === T) return p;
    const r = RACE[race] || RACE.legion, s = ramp(T[r.s], T), t = ramp(T[r.t], T);
    p = { T, o: s.o, oRgb: s.oRgb, s, t, g: css(T[r.g[0]], r.g[1]), glow: css(T[r.glow[0]], r.glow[1]), w: css(T['color-glint']), k: css(T['color-void']) };
    palCache.set(race, p); return p;
  }
  // 방향 0 E, 1 SE, 2 S, 3 SW, 4 W, 5 NW, 6 N, 7 NE (화면 y 아래, 시계 방향). 3·4·5 는 1·0·7 을 좌우 반전해 쓴다
  const BASE_DIR = [0, 1, 2, 1, 0, 7, 6, 7], FLIP_DIR = [0, 0, 0, 1, 1, 1, 0, 0];
  const ANIM = { i: 'idle', m: 'move', a: 'attack', b: 'build', w: 'work', s: 'stage', l: 'lift' };
  const poseKey = (dir, anim, i) => '' + BASE_DIR[dir] + anim[0] + i;
  // '1m2' → { dir: 1, anim: 'move', i: 2 } · 'b0'(방향 없음) → { dir: 0, anim: 'build', i: 0 } · 'w3d1' → 손상 1단계(dmg) · '' → 대기
  function parsePose(p) {
    const m = p ? /^(\d?)([a-z])(\d*)(?:d(\d))?$/.exec(p) : null;
    if (!m) return { dir: 0, anim: 'idle', i: 0 };
    const f = { dir: m[1] ? +m[1] : 0, anim: ANIM[m[2]] || 'idle', i: +m[3] || 0 };
    if (m[4]) f.dmg = +m[4];
    return f;
  }
  const OCT = Math.PI / 4, HYST = Math.PI / 6;
  // 이동·조준 벡터 → 8방향. 현재 방향 중심에서 ±30° 안이면 그대로(경계에서 떨지 않게)
  function dirOf(dx, dy, prev) {
    if (Math.abs(dx) + Math.abs(dy) === 0) return prev;
    const a = Math.atan2(dy, dx);
    if (prev !== undefined && prev !== null) { let df = Math.abs(a - prev * OCT) % (2 * Math.PI); if (df > Math.PI) df = 2 * Math.PI - df; if (df <= HYST + 1e-9) return prev; }
    return ((Math.round(a / OCT) % 8) + 8) % 8;
  }
  const crystalStage = amount => amount > 1000 ? 0 : amount > 400 ? 1 : 2;
  const dmgStage = (hp, hpMax) => hp * 3 <= hpMax ? 2 : hp * 2 <= hpMax ? 1 : 0;
  const buildStage = prog => prog < 1 / 3 ? 0 : prog < 2 / 3 ? 1 : 2;
  const NB = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];   // E SE S SW W NW N NE
  function rockMask(rock, W, H, tx, ty) {
    let m = 0;
    for (let b = 0; b < 8; b++) { const x = tx + NB[b][0], y = ty + NB[b][1]; if (x < 0 || y < 0 || x >= W || y >= H || rock[y * W + x]) m |= 1 << b; }
    return m;
  }

  // ===== 지형: 맵 테마 + 청크 그리기 =====
  // 무작위는 좌표·맵 id 해시뿐(리플레이에서 같은 그림)
  const hash = (x, y) => { let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
  const strHash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; };
  const hn = (x, y, sd) => hash(x ^ sd, y + (sd >>> 7)) / 4294967296;
  function vnoise(x, y, sd) {                               // 값 잡음(부드러운 보간) 0..1
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hn(ix, iy, sd), b = hn(ix + 1, iy, sd), c = hn(ix, iy + 1, sd), d = hn(ix + 1, iy + 1, sd);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  // 맵별 테마(oklch). 표의 기준값 [L%, C, H] 에서 단계를 만든다(hallmark: 같은 명도대에서 색상만 바꾼다 — 바닥 L 26~40%).
  // ground = 어둠→밝음 4단(L −4·0·+4·+8), rock = 아래 그림자·옆·윗면·하이라이트(L −13·−7·0·+10), deco = 풀 장식색.
  // 어두운 단계는 색상이 void 쪽(260°)으로, 밝은 단계는 따뜻한 쪽(80°)으로 몇 도 돈다. pat: 'plate' = 철판 이음매 바닥.
  const lch = (L, C, H) => `oklch(${+L.toFixed(1)}% ${+C.toFixed(3)} ${+(((H % 360) + 360) % 360).toFixed(1)})`;
  const toward = (h, t, k) => { let df = ((t - h + 540) % 360) - 180; return h + df * k; };
  // soil(선택): 맨흙·흙길 색. 없으면 바닥·바위를 섞은 흙(같은 색조라 단조로운 테마는 따로 준다 — Task 9)
  function mkTheme([gl, gc, gh], [rl, rc, rh], deco, pat, soil) {
    return {
      ground: [lch(gl - 4, gc * 0.85, toward(gh, 260, 0.04)), lch(gl, gc, gh), lch(gl + 4, gc * 1.1, toward(gh, 80, 0.05)), lch(gl + 8, gc * 1.2, toward(gh, 80, 0.1))],
      rock: [lch(rl - 13, rc * 0.7, toward(rh, 260, 0.05)), lch(rl - 7, rc * 0.9, toward(rh, 260, 0.03)), lch(rl, rc, rh), lch(rl + 10, rc * 1.05, toward(rh, 80, 0.05))],
      deco, pat: pat || '', soil };
  }
  const THEMES = {
    crossing: mkTheme([31, 0.04, 138], [30, 0.028, 55], 'oklch(52% 0.05 80)'),     // 이끼 들판
    narrows:  mkTheme([33, 0.045, 70], [29, 0.03, 40], 'oklch(55% 0.06 60)'),      // 황토 협곡
    expanse:  mkTheme([36, 0.04, 105], [31, 0.02, 80], 'oklch(58% 0.07 110)'),     // 마른 초원
    gate:     mkTheme([29, 0.016, 250], [24, 0.012, 260], 'oklch(58% 0.07 55)', '', 'oklch(32% 0.018 45)'),   // 현무암 재 + 녹슨 화산토 길·잉걸 장식
    isles:    mkTheme([31, 0.04, 175], [28, 0.025, 200], 'oklch(55% 0.06 165)'),   // 청록 이끼섬
    maze:     mkTheme([30, 0.05, 38], [25, 0.03, 30], 'oklch(50% 0.08 45)'),       // 녹슨 붉은 땅
    ring:     mkTheme([38, 0.04, 85], [30, 0.03, 70], 'oklch(60% 0.05 90)'),       // 경기장 모래
    diagonal: mkTheme([30, 0.03, 225], [25, 0.022, 240], 'oklch(66% 0.05 165)', '', 'oklch(34% 0.02 90)'),   // 차가운 점판암 + 서리 이끼·마른 흙길
    bonanza:  mkTheme([30, 0.03, 300], [26, 0.025, 290], 'oklch(62% 0.08 220)'),   // 보랏빛 결정 평원
    fortress: mkTheme([30, 0.015, 220], [27, 0.02, 230], 'oklch(55% 0.03 60)', 'plate'),   // 철판 요새
  };
  let setT = null, rgbOf = null;
  const themeCache = new Map();
  // render.js create() 가 토큰 rgb 표와 문자열 → rgb 변환기(1px 캔버스 프로브)를 넘긴다
  function setup(T, conv) { setT = T; rgbOf = conv; themeCache.clear(); }
  // 테마 rgb 표. mini = 미니맵·로비 미리보기 색(바닥 = ground[2], 바위 = rock[1] — 작은 칸에서도 갈리게 명도 차 ≥ 10),
  // metal = 잔해·파편용 회색 램프(legion-a 를 바닥 명도로 눌러 유닛보다 튀지 않게) [o, d, m, l, h]
  function theme(mapId) {
    const id = THEMES[mapId] ? mapId : 'crossing';
    let th = themeCache.get(id); if (th) return th;
    const src = THEMES[id], rgb = v => rgbOf(v).slice(0, 3);
    const V = (setT ? setT['color-void'] : [8, 10, 18]).slice(0, 3), Gl = (setT ? setT['color-glint'] : [235, 242, 246]).slice(0, 3);
    const mb = mix((setT ? setT['legion-a'] : [138, 146, 156]).slice(0, 3), V, 0.3).slice(0, 3);
    th = { id, pat: src.pat, ground: src.ground.map(rgb), rock: src.rock.map(rgb), deco: rgb(src.deco), soil: src.soil ? rgb(src.soil) : null, void: V, glint: Gl };
    th.metal = [mix(mb, V, 0.7), mix(mb, V, 0.35), mb, mix(mb, Gl, 0.25), mix(mb, Gl, 0.6)].map(c => c.slice(0, 3).map(Math.round));
    th.groundCss = th.ground.map(c => css(c)); th.rockCss = th.rock.map(c => css(c));
    th.mini = { ground: th.ground[2], rock: th.rock[1], groundHi: th.ground[3], rockHi: th.rock[3], shadow: th.ground[0] };
    themeCache.set(id, th); return th;
  }
  // 맵 id → 장식 시드(FNV-1a 32비트). 게임 시드와 무관 — 같은 맵은 언제나 같은 장식
  const mapSeed = id => strHash(String(id));
  // 바닥 타일 장식 종류: -1 없음, 0 작은 돌 3개, 1 바위 덩이, 2 잔해, 3 풀 포기, 4 작은 분화구, 5 금속 파편. 밀도 7%
  function decoAt(seed, tx, ty) {
    const h = hash(hash(tx, ty) ^ seed, (seed >>> 11) ^ 0x2545f491);
    return h % 1000 < 70 ? (h >>> 12) % 6 : -1;
  }
  // ===== 지형 풍부화: 큰 얼룩·흙길·장식 무리·솟은 바위 =====
  // 테마 식생: 같은 장식 종류(decoAt)를 맵마다 다르게 읽는다
  const FLORA = { crossing: 'grass', isles: 'grass', expanse: 'grass', narrows: 'shrub', maze: 'shrub', ring: 'shrub', gate: 'ash', diagonal: 'grass', bonanza: 'crystal', fortress: 'metal' };
  const rgb3 = c => [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])];
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];   // 4×4 순서 디더(2px 격자에 쓴다)
  // 맵 바닥 필드(맵·테마마다 한 번): 명도 사다리 5단 + 흙 3단, 본진 → 맵 중앙 흙길 선분. px(X, Y) → rgb. 청크와 미니맵이 같이 쓴다
  const fieldCache = new WeakMap();
  function field(map, th) {
    let F = fieldCache.get(map.rock); if (F && F.th === th) return F;
    const G = th.ground, Rk = th.rock, V = th.void, sd = strHash(map.id || 'crossing');
    const lad = [rgb3(mix(G[0], V, 0.2)), G[0], G[1], G[2], G[3]];
    const So = th.soil, S0 = rgb3(So ? mix(So, V, 0.18) : mix(G[1], Rk[2], 0.55)), S1 = rgb3(So || mix(G[2], Rk[3], 0.55)), Sd = rgb3(mix(S0, V, 0.22)), S2 = rgb3(mix(S1, th.glint, 0.07));
    const cx = map.w * 16, cy = map.h * 16, segs = [];
    for (const st of map.starts || []) segs.push([(st.tx + 2) * 32, (st.ty + 2) * 32, cx, cy]);
    const segD = (x, y) => {
      let best = 1e12;
      for (const [ax, ay, bx, by] of segs) {
        const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1; let t = ((x - ax) * dx + (y - ay) * dy) / L; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = ax + dx * t - x, ey = ay + dy * t - y, dd = ex * ex + ey * ey; if (dd < best) best = dd;
      }
      return Math.sqrt(best);
    };
    const PW = 30;
    // 흙길: 좌표를 저주파 잡음으로 흔들어 굽이치게. 가운데 두 줄 바퀴 자국, 가장자리 8px 디더
    const path = (X, Y, b) => {
      const d = segD(X + (vnoise(X / 170, Y / 170, sd + 11) - 0.5) * 100, Y + (vnoise(X / 170, Y / 170, sd + 12) - 0.5) * 100);
      const w = PW + (vnoise(X / 64, Y / 64, sd + 13) - 0.5) * 14;
      if (d >= w) return null;
      if (Math.abs(d - 9) < 1.4 && vnoise(X / 40, Y / 40, sd + 14) > 0.42 && b < 0.75) return S0;   // 끊긴 바퀴 자국
      if (d > w - 10) return (d - (w - 10)) / 10 > b ? null : S1;
      const g = hash((X >> 1) ^ sd, (Y >> 1) + 7);
      return g % 9 === 0 ? S0 : g % 6 === 0 || (vnoise(X / 22, Y / 22, sd + 15) > 0.62 && b < 0.5) ? S2 : S1;
    };
    // 바닥 픽셀(2px 블록): 큰 얼룩(230px) + 중간(70px) + 잔결(20px) → 사다리 0..4. 띠 경계에서만 디더 → 넓은 단색 면 + 계단 경계
    const px = (X, Y, nearPath) => {
      const b = BAYER[((Y >> 1) & 3) * 4 + ((X >> 1) & 3)] / 16 + 1 / 32;
      if (nearPath) { const p = path(X, Y, b); if (p) return p; }
      const m = vnoise(X / 230, Y / 230, sd + 3) * 0.6 + vnoise(X / 70, Y / 70, sd + 4) * 0.26 + vnoise(X / 18, Y / 18, sd + 1) * 0.14;
      let t = 0.5 + (m - 0.3) / 0.4 * 3; t = t < 0.5 ? 0.5 : t > 3.99 ? 3.99 : t;
      let i = Math.floor(t); const f = t - i;
      if (f > 0.45 && (f - 0.45) / 0.55 > b) i++;                                    // 띠 경계 절반은 디더
      const gr = hash((X >> 1) ^ sd, Y >> 1);                                         // 잔알갱이: 2px 블록 열에 하나 꼴로 한 단 위·아래
      if (gr % 11 === 0) i++; else if (gr % 13 === 0) i--;
      i = i < 0 ? 0 : i > 4 ? 4 : i;
      const sp = vnoise(X / 90, Y / 90, sd + 9);                                      // 맨흙 얼룩: 가장자리는 디더로 풀리고 안은 흙 결
      if (sp > 0.71 && (sp - 0.71) / 0.06 > b) return gr % 7 === 0 ? S0 : gr % 5 === 0 ? S2 : S1;
      return lad[i];
    };
    const nearPath = (tx, ty) => segs.length > 0 && segD(tx * 32 + 16, ty * 32 + 16) < PW + 90;
    // 미니맵 1px = 타일 1칸: 잔결·디더 없이 큰 얼룩만 연속 보간 + 맨흙·흙길(굽이 포함)
    const mini = (tx, ty) => {
      const X = tx * 32 + 16, Y = ty * 32 + 16;
      if (nearPath(tx, ty) && path(X, Y, 0.5)) return S1;
      if (vnoise(X / 90, Y / 90, sd + 9) > 0.73) return S1;
      const m = vnoise(X / 230, Y / 230, sd + 3) * 0.7 + vnoise(X / 70, Y / 70, sd + 4) * 0.3;
      let t = 0.5 + (m - 0.3) / 0.4 * 3; t = t < 0 ? 0 : t > 3.99 ? 3.99 : t;
      const i = Math.floor(t); return rgb3(mix(lad[i], lad[i + 1], t - i));
    };
    F = { th, px, nearPath, mini };
    fieldCache.set(map.rock, F); return F;
  }
  // 장식 종류(-1 없음): 기본은 decoAt(7%), 바위 곁·맵 가장자리·덤불 잡음이 bonus 만큼 더한다(바위 곁은 돌·바위 무리 위주)
  function decoKind(seed, tx, ty, bonus) {
    const k = decoAt(seed, tx, ty);
    if (k >= 0 || bonus <= 0) return k;
    const r = hash(hash(ty, tx) ^ seed, 0x51ed);
    return r % 1000 < bonus * 1000 ? [1, 0, 3, 1, 0, 5, 3, 4][(r >>> 12) & 7] : -1;
  }
  // 장식 그리기. P(x, y, rgb) 칠, S(x, y, k) 어둡게(그림자) — 청크 픽셀 좌표. h = 무작위 해시, (x, y) = 바닥 기준점
  function decoDraw(kind, h, x, y, th, flora, P, S) {
    const G = th.ground, Rk = th.rock, M = th.metal, V = th.void, Gl = th.glint;
    const RT = [Rk[0], Rk[1], Rk[2], Rk[3], rgb3(mix(Rk[3], Gl, 0.22))];
    const fl = (cx, cy, rx, ry, fn) => { for (let j = Math.floor(-ry); j <= Math.ceil(ry); j++) for (let i = Math.floor(-rx); i <= Math.ceil(rx); i++) { const u = (i + 0.5) / rx, v = (j + 0.5) / ry, r = u * u + v * v; if (r <= 1) fn(Math.round(cx) + i, Math.round(cy) + j, u, v, r); } };
    const shadow = (cx, cy, rx, ry, k) => fl(cx, cy, rx, ry, (px, py, u, v, r) => S(px, py, r > 0.7 ? k * 0.6 : k));
    const r01 = i => hash(h, i) / 4294967296;
    const boulder = (bx, by, w, hh, sh) => {                           // 바닥 중심 (bx, by), 너비 w, 높이 hh. 좌상단 빛 · 우하단 외곽선 · 그림자
      const rx = w / 2, ry = hh / 2, cy = by - ry, sdv = hash(bx & 1023, by & 1023) ^ h;
      if (sh) shadow(bx + rx * 0.5, by - 1, rx * 1.05, Math.max(2, ry * 0.55), 0.42);
      fl(bx, cy, rx + 0.5, ry + 0.5, (px, py, u, v, r) => {
        const vv = v > 0.5 ? 0.5 + (v - 0.5) * 1.5 : v, rr = u * u + vv * vv;
        const jag = ((hash(px >> 1, (py >> 1) ^ sdv) >>> 4) & 7) / 7 * 0.22;
        if (rr > 1 - jag * 0.5) return;
        const facet = (((hash(px / 3 | 0, (py / 3 | 0) ^ sdv) >>> 6) & 7) / 7 - 0.5) * 0.45;
        const lit = -(u * 0.6 + v * 0.8) + facet;
        let c = lit > 0.55 ? RT[4] : lit > 0.18 ? RT[3] : lit > -0.3 ? RT[2] : RT[1];
        if (rr > 0.72 - jag && u + v > 0.1) c = RT[0]; else if (rr > 0.8 - jag) c = RT[1];
        P(px, py, c);
      });
    };
    const blade = (bx, by, len, lean, F3) => { for (let s = 0; s < len; s++) P(Math.round(bx + lean * s * s / len), by - s, s < 2 ? F3[0] : s >= len - 2 ? F3[2] : F3[1]); };
    const tuft = (bx, by, hs, F3) => {
      const n = 4 + (hs & 3);
      shadow(bx + 2, by, 5, 1.6, 0.35);
      for (let k = 0; k < n; k++) { const hk = hash(hs, k); blade(bx + (k - n / 2) * 1.5 + ((hk & 3) - 1.5) * 0.5, by - (hk >>> 9 & 1), 5 + (hk >>> 3) % 6, ((hk >>> 7) % 5 - 2) * 0.6, F3); }
    };
    const crack = (cx, cy, len, hs) => {
      const dk = rgb3(mix(G[0], V, 0.5)), set = new Set();
      let px = cx, py = cy, dir = hs & 3;
      for (let k = 0; k < len; k++) {
        set.add(px + ',' + py);
        const r = hash(hs, k + 9);
        if ((r & 7) === 0) dir = (dir + ((r >>> 3) & 1 ? 1 : 3)) & 3;
        px += [1, 1, -1, -1][dir] * ((r >>> 5) & 1 ? 1 : 0) + ((r >>> 6) & 3 ? [1, 0, -1, 0][dir] : 0);
        py += (r >>> 8) & 1 ? [0, 1, 0, -1][dir] : (r >>> 9) & 1 ? 1 : 0;
        if (k === (len >> 1)) { let qx = px, qy = py; for (let b = 0; b < len / 3; b++) { set.add(qx + ',' + qy); const r2 = hash(hs, b + 99); qx += (r2 & 1) ? 1 : 0; qy += (r2 & 2) ? 1 : -1 + ((r2 >>> 2) & 1); } }
      }
      for (const s of set) { const [a, b] = s.split(',').map(Number); if (!set.has((a + 1) + ',' + (b + 1))) P(a + 1, b + 1, G[3]); }
      for (const s of set) { const [a, b] = s.split(',').map(Number); P(a, b, dk); }
    };
    const blob = (cx, cy, rx, ry, c, c2, hs) => fl(cx, cy, rx, ry, (px, py, u, v, r) => {
      const n = ((hash(px >> 1, (py >> 1) ^ hs) >>> 5) & 7) / 7;
      if (r > 0.65 + n * 0.35) return;
      P(px, py, r > 0.55 && ((px + py) & 1) ? c2 : c);
    });
    const plate = (cx, cy, w, hh, sk) => {                              // 기운 금속 판: 외곽선 o, 윗변 빛, 볼트, 녹 점
      shadow(cx + w / 2 + 2, cy + hh + 1, w * 0.55, 2.5, 0.4);
      for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) {
        const xx = cx + i + Math.round(sk * j / hh), edge = i === 0 || j === 0 || i === w - 1 || j === hh - 1;
        P(xx, cy + j, edge ? (j === 0 ? M[3] : M[0]) : j === 1 ? M[3] : j >= hh - 2 ? M[1] : M[2]);
      }
      P(cx + 2, cy + 2, M[4]); P(cx + w - 3 + sk, cy + 2, M[4]); P(cx + 2 + sk, cy + hh - 2, M[0]);
      if (h & 4) { const rs = rgb3(mix(M[1], Rk[3], 0.6)); P(cx + (w >> 1), cy + (hh >> 1), rs); P(cx + (w >> 1) + 1, cy + (hh >> 1), rs); }
    };
    const pipe = (cx, cy, len) => {
      shadow(cx + len / 2 + 2, cy + 4, len * 0.55, 2, 0.4);
      for (let i = 0; i < len; i++) { P(cx + i, cy, M[0]); P(cx + i, cy + 1, M[4]); P(cx + i, cy + 2, M[2]); P(cx + i, cy + 3, M[1]); P(cx + i, cy + 4, M[0]); }
      for (const ex of [cx - 1, cx + len]) for (let j = 1; j < 4; j++) P(ex, cy + j, ex < cx ? M[3] : M[1]);
    };
    const pebbles = (cx, cy, n) => {
      for (let k = 0; k < n; k++) {
        const hk = hash(h, k + 300), px = cx + ((hk & 31) - 16) * 0.8 | 0, py = cy + (((hk >>> 5) & 15) - 8) | 0, w = 2 + ((hk >>> 9) & 1);
        S(px + w, py + 2, 0.4); S(px + 1, py + 2, 0.4);
        for (let j = 0; j < 2; j++) for (let i = 0; i < w; i++) P(px + i, py + j, j ? RT[1] : i ? RT[2] : RT[4]);
      }
    };
    const shards = (cx, cy, n) => {                                      // 작은 결정: 왼면 밝음 · 오른면 어둠 · 꼭대기 반짝
      const D = th.deco, dl = rgb3(mix(D, Gl, 0.35)), dd = rgb3(mix(D, V, 0.45)), od = rgb3(mix(D, V, 0.75));
      shadow(cx + 4, cy + 1, 7, 2, 0.4);
      for (let k = 0; k < n; k++) {
        const hk = hash(h, k + 500), bx = cx + (k - (n >> 1)) * 4 + (hk & 1), hgt = 6 + ((hk >>> 2) % 6), lean = ((hk >>> 5) % 3) - 1;
        for (let s = 0; s < hgt; s++) {
          const ww = s > hgt - 3 ? 1 : 2, ox = Math.round(lean * s / hgt);
          for (let i = -ww; i <= ww; i++) P(bx + i + ox, cy - s, i === -ww || i === ww ? od : i < 0 ? dl : i === 0 ? D : dd);
        }
        P(bx + Math.round(lean) - 0, cy - hgt, Gl);
      }
    };
    const crater = (cx, cy, rx) => {
      const ry = Math.max(4, Math.round(rx * 0.62)), sh = rgb3(mix(G[0], V, 0.35));
      fl(cx, cy, rx + 1, ry + 1, (px, py, u, v, r) => {
        const up = u + v * 1.4 < 0;
        if (r > 0.92) { if (((px + py) & 1) || r < 0.97) P(px, py, up ? G[3] : G[0]); }
        else if (r > 0.6) P(px, py, up ? G[3] : G[2]);
        else if (r > 0.36) P(px, py, up ? sh : G[3]);
        else P(px, py, (px + py) & 1 ? G[0] : sh);
      });
      for (let k = 0; k < 6; k++) { const a = r01(k + 40) * 6.283, rr = rx + 3 + r01(k + 50) * 5; P(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr * 0.62), k & 1 ? G[0] : RT[2]); }
    };
    const shrub = (cx, cy) => {                                          // 마른 덤불: 갈색 가지 부채 + 끝 deco
      const br = rgb3(mix(Rk[1], V, 0.15)), tip = th.deco;
      shadow(cx + 3, cy, 7, 2, 0.38);
      for (let k = 0; k < 7; k++) {
        const a = -Math.PI / 2 + (k - 3) * 0.33 + (r01(k + 60) - 0.5) * 0.2, len = 5 + r01(k + 70) * 6;
        for (let s = 0; s <= len; s++) P(Math.round(cx + Math.cos(a) * s), Math.round(cy + Math.sin(a) * s * 0.9), s >= len - 1 ? tip : br);
      }
    };
    const grass3 = [rgb3(mix(th.deco, G[0], 0.55)), th.deco, rgb3(mix(th.deco, Gl, 0.3))];
    const moss = () => {
      const mc = rgb3(mix(th.deco, G[1], 0.6)), mh = rgb3(mix(th.deco, G[2], 0.35));
      blob(x, y, 9 + (h & 7), 6 + ((h >>> 3) & 3), mc, mh, h);
      tuft(x - 3, y + 1, hash(h, 1), grass3); if (h & 16) tuft(x + 5, y - 2, hash(h, 2), grass3);
    };
    const flora3 = () => {
      if (flora === 'grass') { if (h & 1) moss(); else { tuft(x - 5, y, hash(h, 3), grass3); tuft(x + 3, y + 3, hash(h, 4), grass3); if (h & 2) tuft(x + 8, y - 4, hash(h, 5), grass3); } }
      else if (flora === 'shrub') { shrub(x, y); if (h & 2) pebbles(x + 6, y + 2, 3); }
      else if (flora === 'crystal') shards(x, y, 2 + (h & 1));
      else blob(x, y, 8 + (h & 7), 4 + ((h >>> 3) & 3), rgb3(mix(G[0], V, 0.38)), rgb3(mix(G[0], V, 0.2)), h);   // 재·기름 얼룩
    };
    switch (kind) {
      case 0: pebbles(x, y, 5 + (h & 3)); break;
      case 1: {                                                             // 바위 무리: 큰 것 1 + 작은 것 1~3, 뒤(위)부터
        const big = 10 + (h % 6), rocks = [[x, y, big, Math.round(big * 0.72)]];
        for (let k = 0; k < 1 + ((h >>> 4) % 3); k++) { const a = r01(k + 10) * 6.283, w = 5 + ((hash(h, k + 20) >>> 3) % 5); rocks.push([Math.round(x + Math.cos(a) * (big * 0.7 + 2)), Math.round(y + Math.sin(a) * big * 0.4), w, Math.round(w * 0.75)]); }
        rocks.sort((a, b) => a[1] - b[1]);
        for (const [bx, by, w, hh] of rocks) boulder(bx, by, w, hh, true);
        if (h & 8) pebbles(x + 8, y + 3, 3);
        break;
      }
      case 2: if (flora === 'metal' || flora === 'ash') { plate(x - 6, y - 4, 9 + (h % 7), 5 + ((h >>> 3) % 3), ((h >>> 6) % 5) - 2); if (h & 32) pebbles(x + 4, y + 4, 3); } else crack(x - 8, y - 4, 20 + (h % 18), h); break;
      case 3: flora3(); break;
      case 4: crater(x, y, 8 + (h % 6)); break;
      default:
        if (flora === 'metal') { pipe(x - 8, y - 2, 12 + (h % 8)); if (h & 2) plate(x + 2, y + 4, 7, 4, 1); }
        else if (flora === 'crystal') shards(x, y, 2);
        else if (flora === 'grass') { tuft(x, y, h, grass3); tuft(x + 6, y + 4, hash(h, 9), grass3); }
        else crack(x - 8, y - 4, 22 + (h % 16), h);
    }
  }
  // 점막 타일: mask4 = 이웃이 점막인 변(1 N, 2 E, 4 S, 8 W), v = 변형 0..3. 열린 변은 4px 물결 가장자리
  // (경계가 1~3px 안으로 hash 로 들쭉날쭉, 경계 1px 은 creep×1.4 밝은 테두리), 열린 두 변이 만나는 모서리는 둥글게.
  // 돌려주는 함수 (ctx, c=[r,g,b,a]) 가 32×32 에 그린다 — render.js 가 한 번 캐시해 점막 타일마다 블릿.
  function creepTile(mask4, v = 0) {
    const TS = 32, N = !(mask4 & 1), E = !(mask4 & 2), S = !(mask4 & 4), Wo = !(mask4 & 8), R = 6;
    // 경계 안쪽 거리: 주기 16px 물결(0~3px, 타일을 넘어 이어진다) + hash 지터 1~2px → 1~5px
    const inset = (t, side) => 1 + ((hash((t >> 1) + v * 97, side * 31 + 7) >>> 5) & 1) + Math.round(1.5 + 1.5 * Math.sin((t + side * 5) * Math.PI / 8));
    return (ctx, c) => {
      const fill = `rgba(${c[0]},${c[1]},${c[2]},${c[3]})`, edge = `rgba(${clamp(c[0] * 1.4)},${clamp(c[1] * 1.4)},${clamp(c[2] * 1.4)},${Math.min(1, c[3] + 0.3)})`;
      const vein = `rgba(${clamp(c[0] * 0.7)},${clamp(c[1] * 0.7)},${clamp(c[2] * 0.7)},${Math.min(1, c[3] + 0.15)})`, spot = `rgba(${clamp(c[0] * 1.25)},${clamp(c[1] * 1.25)},${clamp(c[2] * 1.25)},${c[3]})`;
      for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
        const dN = N ? y - inset(x, 1) : 99, dS = S ? TS - 1 - y - inset(x, 3) : 99, dW = Wo ? x - inset(y, 4) : 99, dE = E ? TS - 1 - x - inset(y, 2) : 99;
        let d = Math.min(dN, dS, dW, dE);
        for (const [a, b] of [[dN, dW], [dN, dE], [dS, dW], [dS, dE]]) if (a < R && b < R) d = Math.min(d, R - Math.hypot(R - a, R - b));
        const hv = hash(x + v * 131, y + v * 57);
        if (d < 0) { if (d > -2.5 && (hv & 7) === 0) { ctx.fillStyle = fill; ctx.fillRect(x, y, 1, 1); } continue; }   // 경계 밖 포자 점
        ctx.fillStyle = d < 1 ? edge : d < 2 && (hv & 1) ? edge : (hv % 61) === 0 ? spot : (hv % 47) === 0 && d > 3 ? vein : fill;
        ctx.fillRect(x, y, 1, 1);
      }
    };
  }
  // 바위 윗면 결: 지터 격자(11px) 최근접 점 셀 = 바위 덩이. 덩이 경계는 틈(어둠), 덩이마다 좌상단 밝음·우하단 그늘
  function cobble(X, Y, Rk, sd) {
    const GS = 14, gx = Math.floor(X / GS), gy = Math.floor(Y / GS);
    let d1 = 1e9, d2 = 1e9, fx = 0, fy = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const hh = hash((gx + i) ^ sd, gy + j), px = (gx + i) * GS + 1 + (hh % 12), py = (gy + j) * GS + 1 + ((hh >>> 8) % 12);
      const dd = (X - px) * (X - px) + (Y - py) * (Y - py);
      if (dd < d1) { d2 = d1; d1 = dd; fx = px; fy = py; } else if (dd < d2) d2 = dd;
    }
    const gap = Math.sqrt(d2) - Math.sqrt(d1);
    if (gap < 1.2) return Rk[1];
    const r = (X - fx) + (Y - fy), ct = hash(fx ^ sd, fy) % 5;                    // 덩이마다 명도 조금 다름
    return r < -5 ? Rk[3] : r > 4 && gap < 3.5 ? Rk[1] : ct === 0 && ((X + Y) & 1) ? Rk[1] : ct === 1 && ((X + Y) & 1) ? Rk[3] : Rk[2];
  }
  // 타일 (cx0..cx0+n-1, cy0..cy0+n-1) 을 청크 캔버스(n*32 정사각)에 그린다. 픽셀을 직접 쓴다(ImageData).
  // 1) 바닥: field() 의 큰 얼룩·맨흙·흙길(2px 블록) + 철판 무늬 + 바위가 남동쪽으로 드리운 그림자.
  // 2) 바위: rockMask 자동 타일 — 땅보다 밝은 윗면(조약돌 결, 위·왼쪽 빛 테두리), 아래(S 열림) 18px 절벽면(지층 띠·세로 금·윗 테두리 빛·밑동 어둠).
  // 3) 장식 무리: 청크 + 둘레 2타일을 돌며 그리고 청크 밖 픽셀은 버린다(이웃 청크도 같은 해시로 그려 경계가 이어진다). 바위 타일 위에는 안 그린다.
  function drawChunk(ctx, state, cx0, cy0, n, th) {
    const TS = 32, W = n * TS, img = ctx.createImageData(W, W), d = img.data;
    const map = state.map, MW = map.w, MH = map.h, rock = map.rock, sd = strHash(map.id || 'crossing');
    const G = th.ground, Rk = th.rock, V = th.void, F = field(map, th), flora = FLORA[th.id] || 'grass';
    const X0 = cx0 * TS, Y0 = cy0 * TS;
    const put = (x, y, c) => { const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; };
    const dark = (x, y, k) => { const i = (y * W + x) * 4; d[i] += (V[0] - d[i]) * k; d[i + 1] += (V[1] - d[i + 1]) * k; d[i + 2] += (V[2] - d[i + 2]) * k; };
    const isRock = (x, y) => x < 0 || y < 0 || x >= MW || y >= MH || !!rock[y * MW + x];
    const rockPx = (X, Y) => X >= 0 && Y >= 0 && isRock(X >> 5, Y >> 5);
    // 바위 그림자(빛 좌상단 → 남동쪽): 안쪽 (−7, −11) 짙게, 바깥 (−13, −20) 디더로 옅게
    const castShadow = (lx, ly, X, Y) => { if (rockPx(X - 7, Y - 11)) dark(lx, ly, 0.42); else if (rockPx(X - 13, Y - 20) && ((X + Y) & 1)) dark(lx, ly, 0.24); };
    const cobT = [Rk[0], Rk[1], rgb3(mix(Rk[2], Rk[3], 0.4)), Rk[3]];                          // 윗면: 땅보다 밝게(솟아 보이게)
    const topHi = rgb3(mix(Rk[3], th.glint, 0.2)), faceMid = rgb3(mix(Rk[1], Rk[0], 0.45));
    // 장식 금지: 크리스탈·분출구 타일과 그 1칸 둘레, 시작 본진 터(starts 기준 4×3)
    const ban = new Set(), banRect = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) ban.add(y * MW + x); };
    for (const e of state.ents) if (e.isR) banRect(e.tx - 1, e.ty - 1, (e.def.w || 2) + 2, (e.def.h || 1) + 2);
    for (const st of map.starts || []) banRect(st.tx, st.ty, 4, 3);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const tx = cx0 + i, ty = cy0 + j; if (tx >= MW || ty >= MH) continue;
      const ox = i * TS, oy = j * TS, np = F.nearPath(tx, ty);
      if (!rock[ty * MW + tx]) {
        for (let ly = 0; ly < TS; ly += 2) for (let lx = 0; lx < TS; lx += 2) {         // 2px 블록
          const c = F.px(tx * TS + lx, ty * TS + ly, np);
          put(ox + lx, oy + ly, c); put(ox + lx + 1, oy + ly, c); put(ox + lx, oy + ly + 1, c); put(ox + lx + 1, oy + ly + 1, c);
        }
        if (th.pat === 'plate') {                                                   // 철판: 64px 판을 벽돌처럼 엇갈려 깐다. 이음매 = 어둠 1px + 빛 1px, 판마다 명도 조금 다름, 모서리 리벳
          for (let ly = 0; ly < TS; ly++) for (let lx = 0; lx < TS; lx++) {
            const X = tx * TS + lx, Y = ty * TS + ly, pr = Y >> 6, U = X + (pr & 1) * 32, pc = U >> 6, u = U & 63, v = Y & 63;
            const ph = hash(pc ^ sd, pr);
            let c = null;
            if (u === 0 || v === 0) c = G[0];
            else if (u === 1 || v === 1) c = G[2];
            else if ((u === 5 || u === 58) && (v === 5 || v === 58)) c = G[3];
            else if ((u === 6 || u === 59) && (v === 6 || v === 59)) c = G[0];
            else if (ph % 3 === 0 && ((X + Y) & 1)) c = G[0];                      // 어두운 판(디더)
            else if (ph % 5 === 1 && ((X + Y) & 1) && (Y & 1)) c = G[2];            // 밝은 판(성긴 디더)
            if (c) put(ox + lx, oy + ly, c);
          }
        }
        if (isRock(tx - 1, ty) || isRock(tx, ty - 1) || isRock(tx - 1, ty - 1)) for (let ly = 0; ly < TS; ly++) for (let lx = 0; lx < TS; lx++) castShadow(ox + lx, oy + ly, tx * TS + lx, ty * TS + ly);
        continue;
      }
      const m = rockMask(rock, MW, MH, tx, ty), N = !(m & 64), S = !(m & 4), Wo = !(m & 16), E = !(m & 1);
      // 가장자리 흔들림: 열린 변은 4px 마디마다 0~3px 안으로 들어간다(바위 덩어리가 자연스럽게)
      const wob = (a, k) => (hash(a >> 2, k ^ sd) >>> 3) & 3, CF = 18;
      for (let ly = 0; ly < TS; ly++) for (let lx = 0; lx < TS; lx++) {
        const X = tx * TS + lx, Y = ty * TS + ly;
        const eN = N ? wob(X, 11 + Y - ly) : -9, eW = Wo ? wob(Y, 13 + X - lx) : -9, eE = E ? wob(Y, 17 + X - lx) : -9, eS = S ? wob(X, 19 + Y - ly) : -9;
        const dN = ly - eN, dW = lx - eW, dE = TS - 1 - lx - eE, dS = TS - 1 - ly - eS;   // 열린 변까지 거리(음수 = 바깥)
        // 바깥 모서리: 4px 계단으로 깎는다(깎인 곳은 바닥 — 남·동쪽이면 그림자 안)
        const corner = (N && Wo && dN + dW < 4) || (N && E && dN + dE < 4) || (S && Wo && dS + dW < 4) || (S && E && dS + dE < 4);
        if (dN < 0 || dW < 0 || dE < 0 || dS < 0 || corner) {
          put(ox + lx, oy + ly, F.px(X & ~1, Y & ~1, np));
          if ((S && dS < 2) || (E && dE < 2)) dark(ox + lx, oy + ly, 0.42);
          continue;
        }
        let c;
        if (S && dS < CF) {                                                         // 절벽면: 윗 테두리 빛 → 처마 그늘 → 5px 지층 띠 → 밑동 어둠
          const band = Math.floor((dS + ((hash(X >> 3, 5 ^ sd) >>> 3) & 1)) / 5);
          if (dS === CF - 1) c = topHi;
          else if (dS === CF - 2) c = Rk[2];
          else if (dS === CF - 3) c = Rk[0];
          else if (dS < 2) c = Rk[0];
          else {
            c = band & 1 ? Rk[1] : faceMid;
            if (hash(X >> 1, 77 ^ sd) % 11 === 0 && dS < CF - 4) c = Rk[0];                                  // 세로 금
            else if (hash(X >> 1, 91 ^ sd) % 7 === 0 && ((Y >> 1) & 1) && dS > 4) c = Rk[2];                // 튀어나온 돌
            else if (dS < 6 && ((X + Y) & 1)) c = Rk[0];                                                     // 밑동 어둠(디더)
            if (E && dE < 3) c = Rk[0];
            else if (Wo && dW < 2) c = Rk[2];
          }
        } else {
          c = cobble(X, Y, cobT, sd);
          if ((N && dN < 2) || (Wo && dW < 2)) c = topHi;
          else if ((N && dN < 4) || (Wo && dW < 4)) c = Rk[3];
          else if (E && dE < 3) c = Rk[1];
        }
        // 안쪽 모서리 노치(두 변은 바위인데 대각선이 바위가 아님)
        if ((!(m & 128) && !N && !E && lx >= TS - 3 && ly < 3) || (!(m & 32) && !N && !Wo && lx < 3 && ly < 3) ||
            (!(m & 2) && !S && !E && lx >= TS - 3 && ly >= TS - 3) || (!(m & 8) && !S && !Wo && lx < 3 && ly >= TS - 3)) c = Rk[1];
        put(ox + lx, oy + ly, c);
      }
    }
    // 장식 무리
    const P = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= W || rockPx(X0 + x, Y0 + y)) return; put(x, y, c); };
    const Sh = (x, y, k) => { if (x < 0 || y < 0 || x >= W || y >= W || rockPx(X0 + x, Y0 + y)) return; dark(x, y, k); };
    for (let ty = Math.max(0, cy0 - 2); ty < Math.min(MH, cy0 + n + 2); ty++) for (let tx = Math.max(0, cx0 - 2); tx < Math.min(MW, cx0 + n + 2); tx++) {
      if (rock[ty * MW + tx] || ban.has(ty * MW + tx)) continue;
      let near = 9;
      for (let j = -2; j <= 2 && near > 1; j++) for (let i = -2; i <= 2; i++) if (isRock(tx + i, ty + j)) near = Math.min(near, Math.max(Math.abs(i), Math.abs(j)));
      const edge = Math.min(tx, ty, MW - 1 - tx, MH - 1 - ty) <= 3;
      const clump = vnoise(tx / 7, ty / 7, sd + 21);
      let bonus = (near === 1 ? 0.4 : near === 2 ? 0.16 : 0) + (edge ? 0.18 : 0) + (clump > 0.64 ? 0.22 : 0);
      if (bonus === 0 && clump < 0.38) continue;                                    // 탁 트인 빈 들
      const k = decoKind(sd, tx, ty, bonus); if (k < 0) continue;
      const h2 = hash(hash(tx, ty), 0xdec0);
      decoDraw(k, h2, (tx - cx0) * TS + 8 + (h2 & 15), (ty - cy0) * TS + 10 + ((h2 >>> 4) & 15), th, flora, P, Sh);
    }
    ctx.putImageData(img, 0, 0);
  }

  // ===== 중립 생물(렌더 전용 — sim 에 없다, 선택·클릭 대상 아님) =====
  // 털·깃 색은 맵 테마(f.th: render.js 가 넘긴다). 없으면 회갈색. 외곽선은 finish() 가 씌운다.
  const crPal = th => {
    const D = th ? th.deco : [150, 130, 100], V = th ? th.void : [8, 10, 18], Gl = th ? th.glint : [235, 242, 246], R0 = th ? th.rock[1] : [70, 60, 50];
    const c = v => css([...rgb3(v), 1]);
    // Task 9: 흙길·맨흙 위에서 묻히지 않게 몸(m)을 한 단 어둡게, 등(l)은 밝게 — 명도 대비로 읽힌다
    return { o: c(mix(D, V, 0.82)), d: c(mix(D, V, 0.58)), m: c(mix(mix(D, R0, 0.35), V, 0.32)), l: c(mix(D, Gl, 0.3)), h: c(mix(D, Gl, 0.6)), k: c(V) };
  };
  // 작은 네발짐승 16×12: 기준점(발밑) (8, 10). 기본 방향 0 동·1 남동·2 남·6 북·7 북동 (3·4·5 는 렌더러가 좌우 반전)
  SPR['critter@beast'] = { w: 16, h: 12, px: 1, ox: 8, oy: 10, dirs: 8, frames: { idle: 1, move: 2 }, critter: true, draw(P, _c, f) {
    const c = crPal(f.th), b = f.dir, mv = f.anim === 'move', st = mv && f.i ? 1 : 0;
    const leg = (x, y0, len) => P.r(x, y0, 1, len, c.d);
    if (b === 0 || b === 1 || b === 7) {                                            // 옆·3/4: 몸통 가로, 머리 오른쪽
      const hx = b === 0 ? 13 : 12, hy = b === 7 ? 3 : b === 1 ? 5 : 4;
      if (st) { leg(4, 8, 2); leg(7, 8, 2); leg(9, 8, 2); leg(12, 8, 2); } else { leg(5, 8, 2); leg(6, 8, 2); leg(10, 8, 2); leg(11, 8, 2); }
      P.r(1, 4, 2, 1, c.d); P.dot(1, 3, c.m);                                         // 꼬리
      P.fell(7.5, 6, 5, 2.6, c.m); P.fell(7, 5.4, 4, 1.4, c.l); P.r(5, 7, 6, 1, c.d);   // 몸통: 등 밝음, 배 어둠
      P.fell(hx, hy + 0.5, 2.2, 1.8, c.m); P.dot(hx - 1, hy - 1, c.l); P.dot(hx - 1, hy - 2, c.d);   // 머리 + 귀
      P.dot(hx + 1, hy, c.k); P.dot(hx + 2, hy + 1, c.d);                               // 눈 · 코
    } else {                                                                        // 앞(2)·뒤(6): 몸통 세로
      if (st) { leg(5, 8, 2); leg(10, 9, 2); leg(6, 9, 1); leg(9, 8, 1); } else { leg(5, 8, 2); leg(6, 9, 1); leg(9, 9, 1); leg(10, 8, 2); }
      P.fell(7.5, 6, 3.6, 3, c.m); P.fell(7, 5.2, 2.4, 1.6, c.l);
      if (b === 2) { P.fell(7.5, 3.5, 2.4, 2, c.m); P.dot(6, 1, c.d); P.dot(9, 1, c.d); P.dot(6, 3, c.k); P.dot(9, 3, c.k); P.dot(7, 5, c.d); P.dot(8, 5, c.d); }
      else { P.fell(7.5, 3, 2.2, 1.6, c.d); P.dot(6, 1, c.d); P.dot(9, 1, c.d); P.r(7, 9, 2, 2, c.m); }
    }
  } };
  // 새 12×8(위에서 본 실루엣): 기준점 = 가운데. move 0 = 날개 편, 1 = 내려친
  SPR['critter@bird'] = { w: 12, h: 8, px: 1, ox: 6, oy: 4, dirs: 8, frames: { idle: 1, move: 2 }, critter: true, draw(P, _c, f) {
    const c = crPal(f.th), a = f.dir * Math.PI / 4, ca = Math.cos(a), sa = Math.sin(a), up = !(f.anim === 'move' && f.i);
    const at = (u, v) => [5.5 + u * ca - v * sa, 3.5 + (u * sa + v * ca) * 0.85];
    const seg = (u0, v0, u1, v1, col) => { const [x0, y0] = at(u0, v0), [x1, y1] = at(u1, v1); P.line(x0 + 0.5, y0 + 0.5, x1 + 0.5, y1 + 0.5, col); };
    const sp = up ? 4.5 : 2.6, bk = up ? -1.6 : -0.6;
    seg(0.5, 0, bk, -sp, c.d); seg(0.5, 0, bk, sp, c.d);                             // 날개(어두운 깃)
    if (up) { seg(0, -1, bk + 0.6, -sp + 1, c.l); seg(0, 1, bk + 0.6, sp - 1, c.m); }   // 날개 윗면 빛(왼쪽 위)
    seg(-2.5, 0, 2, 0, c.m); seg(-3.2, 0, -2.5, 0, c.d);                              // 몸·꼬리
    const [hx, hy] = at(2.6, 0); P.dot(hx + 0.5, hy + 0.5, c.l);                     // 머리
  } };
  // 생물 위치(순수 함수 — 같은 info·tick 이면 같은 결과, 리플레이에서 같다). out 의 객체를 재사용해 채우고 개수를 돌려준다.
  // info = { id, w, h, rock: Uint8Array(w*h), vents: [[x, y] 월드 px] }, tick = sim 틱(소수 허용: 보간)
  const HERD_SEG = 400, BIRD_CYC = 1200;
  function floorNear(info, tx, ty) {                                               // (tx, ty) 에서 나선으로 첫 바닥 타일
    const W = info.w, H = info.h, ok = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !info.rock[y * W + x];
    for (let r = 0; r < 24; r++) for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      if (Math.max(Math.abs(i), Math.abs(j)) !== r) continue;
      if (ok(tx + i, ty + j)) return [(tx + i) * 32 + 16, (ty + j) * 32 + 16];
    }
    return [tx * 32 + 16, ty * 32 + 16];
  }
  function herdAnchor(info, sd, herd, seg) {                                       // 무리 집(맵마다 고정) 둘레 ±8타일에서 구간마다 고른 바닥
    const hm = hash(sd ^ 0x4e5d, herd), hx = 8 + hm % Math.max(1, info.w - 16), hy = 8 + (hm >>> 12) % Math.max(1, info.h - 16);
    const hs = hash(hash(sd, herd + 1), seg), clampT = (v, m) => v < 1 ? 1 : v > m - 2 ? m - 2 : v;
    return floorNear(info, clampT(hx + (hs & 15) - 8, info.w), clampT(hy + ((hs >>> 4) & 15) - 8, info.h));
  }
  function critters(info, tick, out) {
    const sd = mapSeed(info.id), W = info.w, H = info.h, it = Math.floor(tick);
    const onRock = (x, y) => { const tx = Math.floor(x / 32), ty = Math.floor(y / 32); return tx < 0 || ty < 0 || tx >= W || ty >= H || !!info.rock[ty * W + tx]; };
    let n = 0;
    const emit = (kind, x, y, dir, i, alt) => { const o = out[n] || (out[n] = {}); o.kind = kind; o.x = x; o.y = y; o.dir = dir; o.i = i; o.alt = alt; n++; };
    // 짐승 무리: 구간의 55% 는 풀을 뜯고(제자리), 나머지에 다음 기준점으로 smoothstep 이동
    const herds = Math.floor(W * H / 4096);
    for (let hd = 0; hd < herds; hd++) {
      const seg = Math.floor(tick / HERD_SEG), u = (tick - seg * HERD_SEG) / HERD_SEG;
      const a = herdAnchor(info, sd, hd, seg), b = herdAnchor(info, sd, hd, seg + 1);
      const w = u < 0.55 ? 0 : (u - 0.55) / 0.45, s = w * w * (3 - 2 * w), walking = w > 0 && w < 1;
      let bx = a[0] + (b[0] - a[0]) * s, by = a[1] + (b[1] - a[1]) * s;
      if (onRock(bx, by)) { const e = s < 0.5 ? a : b; bx = e[0]; by = e[1]; }
      const hdir = dirOf(b[0] - a[0], b[1] - a[1], 2), cnt = 3 + hash(sd, hd + 900) % 3;
      for (let k = 0; k < cnt; k++) {
        const hk = hash(hd * 31 + k, sd ^ 0x77);
        let x = bx + ((hk & 255) / 255 * 2 - 1) * 48, y = by + (((hk >>> 8) & 255) / 255 * 2 - 1) * 48 + Math.sin(tick * 0.05 + k);
        if (onRock(x, y)) { x = bx; y = by; }
        const dir = walking ? hdir : (hash(hk, seg) >>> 5) & 7;
        emit('beast', x, y, dir, walking ? (it >> 2) & 1 : 0, 0);
      }
    }
    // 새 떼 2무리: 1200틱마다 맵 한 변에서 맞은편 변으로 직선, 5~7마리 V자
    const MWp = W * 32, MHp = H * 32, M = 96;
    for (let fk = 0; fk < 2; fk++) {
      const t = tick + fk * 600, cyc = Math.floor(t / BIRD_CYC), u = (t - cyc * BIRD_CYC) / BIRD_CYC;
      const hb = hash(hash(sd, 77 + fk), cyc), side = hb & 3, p0 = ((hb >>> 2) & 1023) / 1023, p1 = ((hb >>> 12) & 1023) / 1023;
      const [x0, y0, x1, y1] = side === 0 ? [-M, p0 * MHp, MWp + M, p1 * MHp] : side === 1 ? [MWp + M, p0 * MHp, -M, p1 * MHp]
        : side === 2 ? [p0 * MWp, -M, p1 * MWp, MHp + M] : [p0 * MWp, MHp + M, p1 * MWp, -M];
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, dir = dirOf(dx, dy, 0);
      const lx = x0 + dx * u, ly = y0 + dy * u, cnt = 5 + (hb >>> 24) % 3;
      for (let k = 0; k < cnt; k++) {
        const r = (k + 1) >> 1, sgn = k & 1 ? 1 : -1;
        emit('bird', lx - ux * r * 14 - uy * sgn * r * 11, ly - uy * r * 14 + ux * sgn * r * 11, dir, ((it >> 2) + k) & 1, 40);
      }
    }
    // 반딧불: 분출구마다 5마리, 반경 1.5타일 안 궤도(반경도 천천히 숨쉰다)
    info.vents.forEach(([vx, vy], vi) => {
      for (let k = 0; k < 5; k++) {
        const an = tick * 0.03 * (1 + k * 0.15) + k * 1.257 + vi * 0.7, r = 48 * (0.55 + 0.45 * Math.sin(tick * 0.017 + k * 2.1));
        emit('firefly', vx + Math.cos(an) * r, vy + Math.sin(an) * r * 0.6, 0, (it + k * 13) % 50 < 38 ? 1 : 0, 7 + 3 * Math.sin(tick * 0.08 + k));
      }
    });
    return n;
  }

  // ---- 정의 확대(Task 9: 옛 화면 크기보다 작아진 유닛) ----
  // 배율 펜: 좌표·반지름·면을 sc 배, 1px 선·점은 1px 그대로(픽셀 결 유지). 엘리시안 scaledPen 과 같은 { raw, sc, T } 인터페이스라
  // 종족 파일의 굵은 선(rod·thick)·디더 막이 raw 로 내려가 확대 공간에서 바로 그린다.
  function scalePen(P0, sc) {
    const T = (x, y) => [x * sc, y * sc], n = v => Math.max(1, Math.round(v * sc - 0.25)), un = q => q.map(p => [p[0] / sc, p[1] / sc]);
    return { raw: P0, sc, T, ctx: P0.ctx,
      fpoly: (pts, c) => P0.fpoly(pts.map(p => T(p[0], p[1])), c),
      fell: (x, y, rx, ry, c) => P0.fell(x * sc, y * sc, rx * sc, ry * sc, c),
      blob: (x, y, rx, ry, rp) => P0.blob(x * sc, y * sc, rx * sc, ry * sc, rp),
      line: (x0, y0, x1, y1, c) => P0.line(x0 * sc, y0 * sc, x1 * sc, y1 * sc, c),
      dot: (x, y, c, w = 1, h = 1) => P0.dot(x * sc, y * sc, c, n(w), n(h)),
      r: (x, y, w, h, c) => P0.r(Math.round(x * sc), Math.round(y * sc), n(w), n(h), c),
      dither: (x, y, w, h, c, c2) => P0.dither(Math.round(x * sc), Math.round(y * sc), Math.round(w * sc), Math.round(h * sc), c, c2),
      cyl: (cx, cy, z, r, hgt, rp) => P0.cyl(cx * sc, cy * sc, z * sc, r * sc, hgt * sc, rp),
      prism: (cx, cy, z, len, wid, hgt, ang, rp) => { const q = P0.prism(cx * sc, cy * sc, z * sc, len * sc, wid * sc, hgt * sc, ang, rp); return { top: un(q.top), bot: un(q.bot) }; },
      e: (cx, cy, rx, ry, c) => P0.e(cx * sc, cy * sc, rx * sc, ry * sc, c),
      p: (pts, c) => P0.p(pts.map(p => T(p[0], p[1])), c),
      l: (x0, y0, x1, y1, c, w = 1) => P0.l(x0 * sc, y0 * sc, x1 * sc, y1 * sc, c, w),
      clear: (x, y, w, h) => P0.clear(x * sc, y * sc, w * sc, h * sc) };
  }
  // 정의를 sc 배로: 캔버스·기준점·발광·포구 자리도 함께. 그리기 = 원래 정의(this 유지)에 배율 펜
  function grow(d, sc) {
    const xy = g => g && g.map(([x, y, r]) => r === undefined ? [x * sc, y * sc] : [x * sc, y * sc, r * sc]);
    const W = Math.ceil(d.w * sc);
    const g = Object.assign({}, d, { w: W, h: Math.ceil(d.h * sc), ox: d.ox === d.w / 2 ? W / 2 : d.ox * sc, oy: d.oy * sc, grown: sc,   // 가로 중심 기준은 유지
      draw(P, c, f) { return d.draw.call(d, scalePen(P, sc), c, f); } });
    if (d.cy !== undefined) g.cy = d.cy * sc;
    if (d.muzzle) g.muzzle = d.muzzle.map(v => Math.round(v * sc));
    if (d.muzzleSE) g.muzzleSE = d.muzzleSE.map(v => Math.round(v * sc));
    if (typeof d.glow === 'function') g.glow = f => xy(d.glow(f)); else if (d.glow) g.glow = xy(d.glow);
    return g;
  }

  return { shade, css, mix, pen, ramp, racePal, scalePen, grow, SPR, def, finish, tint, desat,
    BASE_DIR, FLIP_DIR, poseKey, parsePose, dirOf, crystalStage, dmgStage, buildStage, rockMask,
    THEMES, setup, theme, drawChunk, mapSeed, decoAt, creepTile, field, critters };
})();
if (typeof module !== 'undefined') module.exports = NW_ART;
