// 네뷸라 워 — 스웜 아트(새 화풍, px: 1). art.js 다음, render.js 앞에서 읽힌다. NW_ART.SPR 에 정의를 등록한다.
// 스웜 = 보라 살(s) + 갈색 키틴(t) + 담즙(g)·발광(glow). 둥근 실루엣, 좌상단 빛, 외곽선 = s.o(순흑 아님).
// 공용 팔레트·음영 함수(art.js)는 고치지 않고, 필요한 변형 램프는 이 파일 안에서 만든다.
(() => {
  const A = typeof NW_ART !== 'undefined' ? NW_ART : require('./art.js');
  const { SPR, ramp, mix, css } = A;
  const FLAT = 0.7, TAU = Math.PI * 2;

  // ---- 작은 유틸 ----
  const hash = (x, y) => { let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
  const strHash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619); return h >>> 0; };
  const memo = new Map(); let memoT = null;
  // 파생 램프·색(T 하나당 한 번)
  const X = (T, id, mk) => { if (memoT !== T) { memo.clear(); memoT = T; } let v = memo.get(id); if (v === undefined) { v = mk(); memo.set(id, v); } return v; };
  const SW = T => X(T, 'pal', () => A.racePal('swarm', T));                       // 렌더가 다른 종족 팔레트를 넘겨도(잔해·변형 키) 스웜 색을 쓴다
  const bile = T => X(T, 'bile', () => ramp(T['color-gas'], T));                 // 담즙 램프(g)
  const ash = T => X(T, 'ash', () => ramp(mix(mix(T['legion-a'], T['swarm-a'], 0.3), T['color-void'], 0.25), T));   // 허스크: 감염된 회색 살
  const earth = T => X(T, 'earth', () => ramp(mix(T['swarm-b'], T['color-void'], 0.25), T));                       // 잠복 흙더미
  const glowR = T => X(T, 'glowr', () => ({ o: css(mix(T['color-gas'], T['color-void'], 0.5)), d: css(mix(T['color-gas'], T['color-void'], 0.2)), m: css(T['color-gas']), l: css(T['color-gas'], 1.5), h: css(T['color-glint']) }));

  // 다각형 체커 디더(반투명 막). fpoly 와 같은 픽셀 중심 규칙
  function dpoly(P, pts, c1, c2) {
    if (P.raw) { pts = pts.map(p => P.T(p[0], p[1])); P = P.raw; }   // 배율 펜: 체커는 확대 공간 픽셀에
    let y0 = Infinity, y1 = -Infinity; for (const p of pts) { if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    const xs = [];
    for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
      const yc = y + 0.5; xs.length = 0;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[j], b = pts[i]; if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) xs.push(a[0] + (yc - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) for (let x = Math.ceil(xs[k] - 0.5); x <= Math.floor(xs[k + 1] - 0.5); x++) {
        const on = ((x + y) & 1) === 1; if (on || c2) P.dot(x, y, on ? c1 : c2);
      }
    }
  }
  // 2px 선. 배율 펜(A.grow)이면 확대 공간에서 굵기도 키워 긋는다
  const thick = (P, x0, y0, x1, y1, c) => {
    let w = 2; if (P.raw) { [x0, y0] = P.T(x0, y0); [x1, y1] = P.T(x1, y1); w = Math.max(2, Math.round(P.sc * 2 - 0.6)); P = P.raw; }
    for (let k = 0; k < w; k++) P.line(x0 + k, y0, x1 + k, y1, c);
  };

  // ---- 유닛 리그: 몸 좌표(u 전방, v 오른쪽, z 위) → 화면. 그릴 것을 깊이 순 큐에 넣고 flush 로 뒤→앞 ----
  function rig(P, f, CX, CY) {
    const a = f.ang, ca = Math.cos(a), sa = Math.sin(a), Q = [];
    const R = {
      ca, sa, Q,
      gp: (u, v, z = 0) => [CX + u * ca - v * sa, CY + (u * sa + v * ca) * FLAT - z],
      dep: (u, v) => u * sa + v * ca,
      put(d, fn) { Q.push([d, Q.length, fn]); },
      // 타원체(앞 L·옆 W·위 H 반지름) → 화면 축 정렬 blob. 투영 범위가 정확히 맞는다
      ell(u, v, z, L, W, H, rp, bias = 0) {
        const ex = Math.sqrt((L * ca) ** 2 + (W * sa) ** 2), ey = Math.sqrt((FLAT * L * sa) ** 2 + (FLAT * W * ca) ** 2 + H * H);
        R.put(R.dep(u, v) + bias, () => { const [x, y] = R.gp(u, v, z); P.blob(x, y, Math.max(1, ex), Math.max(1, ey), rp); });
      },
      // 큰 살 덩어리 결: 주름 호(s.d)·점(s.l) — 커다란 blob 이 매끈한 벡터처럼 보이지 않게
      tex(u, v, z, L, W, H, rp, sd, bias = 0.05) {
        const ex = Math.sqrt((L * ca) ** 2 + (W * sa) ** 2), ey = Math.sqrt((FLAT * L * sa) ** 2 + (FLAT * W * ca) ** 2 + H * H);
        R.put(R.dep(u, v) + bias, () => {
          const [x, y] = R.gp(u, v, z);
          for (let k = 0; k < 3; k++) { const yy = y + ey * (0.25 + k * 0.2), hw = ex * Math.sqrt(Math.max(0, 1 - ((yy - y) / ey) ** 2)) * 0.7; P.line(x - hw * 0.8 + k, yy + 1, x - hw * 0.2 + k, yy, rp.d); }
          for (let k = 0; k < 6; k++) { const hh = hash(sd, k), dx = ((hh & 255) / 255 - 0.5) * ex * 1.3, dy = (((hh >>> 8) & 255) / 255 - 0.5) * ey * 1.2; if ((dx / ex) ** 2 + (dy / ey) ** 2 < 0.45) P.dot(x + dx, y + dy, k & 1 ? rp.l : rp.d); }
        });
      },
      // 다리: 엉덩이 → 무릎(바깥·위) 2px 허벅지 → 발 1px 정강이(가늘어지는 곤충 다리)
      leg(u, v, z, fu, fv, rp, bias = 0, kz = 3) {
        R.put(R.dep(fu, fv) + bias, () => {
          const [hx, hy] = R.gp(u, v, z), [kx, ky] = R.gp(u + (fu - u) * 0.45, v + (fv - v) * 0.7, z + kz), [fx, fy] = R.gp(fu, fv, 0);
          thick(P, hx, hy, kx, ky, rp.d); P.line(kx, ky, fx, fy, rp.d); P.dot(kx, ky - 1, rp.l); P.dot(fx, fy, rp.o);
        });
      },
      // 키틴 판: 몸 위 높이 z 의 육각 판(앞뒤 L, 옆 W). 위 가장자리 1px h, 아래 가장자리 d
      plate(u, v, z, L, W, rp, bias = 0.3) {
        R.put(R.dep(u, v) + bias, () => {
          const pts = [[L, 0], [L * 0.45, W], [-L * 0.55, W * 0.9], [-L, 0], [-L * 0.55, -W * 0.9], [L * 0.45, -W]].map(([du, dv]) => R.gp(u + du, v + dv, z));
          P.fpoly(pts, rp.m);
          let top = 0; for (let k = 1; k < 6; k++) if (pts[k][1] < pts[top][1]) top = k;
          const a1 = pts[(top + 5) % 6], b0 = pts[top], b1 = pts[(top + 1) % 6];
          P.line(a1[0], a1[1], b0[0], b0[1], rp.h); P.line(b0[0], b0[1], b1[0], b1[1], rp.h);
          let bot = 0; for (let k = 1; k < 6; k++) if (pts[k][1] > pts[bot][1]) bot = k;
          const c0 = pts[(bot + 5) % 6], c1 = pts[bot], c2 = pts[(bot + 1) % 6];
          P.line(c0[0], c0[1], c1[0], c1[1], rp.d); P.line(c1[0], c1[1], c2[0], c2[1], rp.d);
          const [mx, my] = R.gp(u + L * 0.1, v, z); P.dot(mx - 1, my - 1, rp.l, 2, 1);
        });
      },
      // 가시·뿔: 밑동 (u,v,z) 에서 끝 (eu,ev,ez) 로, 굵기 w. 왼쪽 면 l · 오른쪽 면 d
      spike(u, v, z, eu, ev, ez, w, rp, bias = 0.4) {
        R.put(R.dep(u, v) + bias, () => {
          const [x0, y0] = R.gp(u, v, z), [x1, y1] = R.gp(eu, ev, ez), dx = x1 - x0, dy = y1 - y0, n = Math.hypot(dx, dy) || 1, px = -dy / n * w, py = dx / n * w;
          P.fpoly([[x0 - px, y0 - py], [x0, y0], [x1, y1]], rp.l); P.fpoly([[x0, y0], [x0 + px, y0 + py], [x1, y1]], rp.d);
          P.dot(x1, y1, rp.h);
        });
      },
      // 막 날개: 뿌리(u,v,z) 에서 옆으로 span, 끝 높이 z + flap. 체커 디더(반투명) + 맥 2줄
      wing(u, side, v0, z, span, chord, flap, sweep, c, bias = -2) {
        const tipV = side * (v0 + span), tz = z + flap;
        R.put(R.dep(u - sweep, tipV) * 0.3 + bias, () => {
          const r0 = R.gp(u + chord * 0.5, side * v0, z), r1 = R.gp(u - chord * 0.5, side * v0, z);
          const t0 = R.gp(u - sweep + chord * 0.15, tipV, tz), t1 = R.gp(u - sweep - chord * 0.45, tipV * 0.92, tz - 1);
          dpoly(P, [r0, t0, t1, r1], c.s.l, c.s.m);
          P.line(r0[0], r0[1], t0[0], t0[1], c.s.h);
          const m0 = R.gp(u, side * v0, z), m1 = R.gp(u - sweep - chord * 0.15, tipV * 0.96, tz - 0.5); P.line(m0[0], m0[1], m1[0], m1[1], c.s.d);
          P.line(r1[0], r1[1], t1[0], t1[1], c.s.d);
        });
      },
      eyes(u, z, sp, c, bias = 0.6, n = 2) {        // 눈 1px 발광(뒤를 보면 숨긴다)
        if (sa < -0.8) return;
        R.put(R.dep(u, 0) + bias, () => { for (const v of n === 1 ? [0] : [-sp, sp]) { if (R.dep(0, v) < -sp * 0.7 && Math.abs(ca) > 0.5) continue; const [x, y] = R.gp(u, v, z); P.dot(x, y, c.glow); } });
      },
      flush() { Q.sort((p, q) => p[0] - q[0] || p[1] - q[1]); for (const q of Q) q[2](); Q.length = 0; },
    };
    return R;
  }
  // 이동 4프레임: 다리 교대 ±2, 몸 1px 물결
  const legSwing = (f, k) => f.anim === 'move' ? ((k & 1 ? -1 : 1) * (f.i & 1 ? 2 : -2)) : 0;
  const wave = (f, k) => f.anim === 'move' ? [0, 1, 0, -1][(f.i + k) & 3] : 0;
  const lunge = f => f.anim === 'attack' && f.i === 0 ? 3 : 0;
  const gape = f => f.anim === 'attack' && f.i === 1;
  // 다리 n쌍: us = 엉덩이 u 목록, 바깥으로 vo, 발은 vf
  function legs(R, f, us, v, z, vf, rp, reach = 0) {
    us.forEach((u, k) => { for (const sd of [-1, 1]) { const sw = legSwing(f, k + (sd > 0 ? 1 : 0)); R.leg(u, sd * v, z, u + reach * ((us.length - 1) / 2 - k) + sw, sd * vf, rp, -0.2); } });
  }
  // 턱(집게) 한 쌍: 머리 앞 u0 에서 길이 len, 벌림 open
  function mandibles(R, P, u0, z, len, open, rp) {
    for (const sd of [-1, 1]) R.put(R.dep(u0 + len, sd * 2) + 0.7, () => {
      const [x0, y0] = R.gp(u0, sd * 1.5, z), [x1, y1] = R.gp(u0 + len * 0.6, sd * (1.5 + open), z - 0.5), [x2, y2] = R.gp(u0 + len, sd * (0.6 + open * 0.6), z - 1);
      thick(P, x0, y0, x1, y1, rp.l); P.line(x1, y1, x2, y2, rp.h); P.dot(x0, y0, rp.d);
    });
  }
  function mouth(R, P, u, z, r, c) { R.put(R.dep(u, 0) + 0.8, () => { const [x, y] = R.gp(u, 0, z); P.fell(x, y, r, r * 0.75, c.s.o); P.fell(x, y + 0.5, r * 0.6, r * 0.4, c.k); }); }

  const unit = (w, h, oy, moves, draw, extra = {}) => Object.assign({ w, h, px: 1, ox: w / 2, oy, dirs: 8, race: 'swarm', frames: { idle: 1, move: moves, attack: 2 }, draw }, extra);

  // ======================= 스웜 유닛 14종 =======================
  Object.assign(SPR, {
    // 드러지(일꾼): 갈색 등껍질 + 집게 2, 다리 3쌍
    drudge: unit(26, 24, 20, 4, (P, c, f) => {
      const R = rig(P, f, 13, 19), s = c.s, t = c.t, lg = lunge(f);
      legs(R, f, [2.5, 0, -2.5], 2.5, 4, 7.5, t, 3);
      R.ell(-2.5, 0, 6 + wave(f, 0), 6, 4.6, 4, s);
      R.ell(-2, 0, 8 + wave(f, 0), 5, 4, 2.6, t, 0.2);                           // 갈색 등껍질
      R.plate(-4.5, 0, 10.3 + wave(f, 0), 2.2, 3, t, 0.3); R.plate(-0.5, 0, 10.6 + wave(f, 1), 2.2, 3.2, t, 0.31);
      R.ell(4.5 + lg, 0, 6, 3.2, 3, 3, s, 0.2);
      mandibles(R, P, 6.5 + lg, 5, 4, gape(f) ? 2.5 : 1, t);
      if (gape(f)) mouth(R, P, 7.2, 5.5, 1.6, c);
      R.eyes(6 + lg, 7.5, 1.3, c);
      R.flush();
    }),
    // 스키터: 낮고 빠른 몸, 등 가시 2
    skitter: unit(24, 18, 14, 4, (P, c, f) => {
      const R = rig(P, f, 12, 12.5), s = c.s, t = c.t, lg = lunge(f);
      legs(R, f, [2.5, 0, -2.5], 2, 3, 6.5, t, 3.5);
      R.ell(-2, 0, 4 + wave(f, 0), 6, 3.4, 2.6, s);
      R.spike(-1, 0, 6, -5, -0.8, 10.5, 2, t); R.spike(-4, 0, 5.5, -8, 0.8, 9, 1.8, t);
      R.ell(4 + lg, 0, 4, 3, 2.6, 2.4, s, 0.2);
      mandibles(R, P, 6 + lg, 3.5, 3.5, gape(f) ? 2.2 : 0.8, t);
      if (gape(f)) mouth(R, P, 6.5, 4, 1.3, c);
      R.eyes(5.5 + lg, 5.5, 1.1, c);
      R.flush();
    }),
    // 스파인웜: 3마디 S자 몸통(방향마다 마디가 몸 축을 따라 휜다), 머리 들고 꼬리에 가시 사출기
    spinewyrm: unit(44, 36, 30, 4, (P, c, f) => {
      const R = rig(P, f, 22, 28), s = c.s, t = c.t, lg = lunge(f), mv = f.anim === 'move' ? f.i : 0;
      const sv = k => Math.sin(k * 1.9 + mv * Math.PI / 2) * 2.6;               // S자 옆 흔들림(이동하면 물결이 흐른다)
      R.ell(-13, sv(0), 4, 3.6, 3.2, 3, s); R.spike(-14, sv(0), 6, -19, sv(0) * 1.2, 10, 2.2, t); R.spike(-12, sv(0) + 1.5, 6.5, -16, sv(0) + 3, 12, 2, t);
      R.ell(-6, sv(1), 5, 5, 4.2, 4, s); R.plate(-6, sv(1), 9, 4, 3.4, t);
      R.ell(2, sv(2), 6, 5.2, 4.4, 4.4, s); R.plate(2, sv(2), 10.5, 4.2, 3.6, t);
      R.ell(9 + lg, sv(3) * 0.5, 10, 4, 3.6, 3.6, s, 0.3);
      R.spike(8 + lg, sv(3) * 0.5 - 2, 12, 5 + lg, -5.5, 16, 2.4, t, 0.2); R.spike(8 + lg, sv(3) * 0.5 + 2, 12, 5 + lg, 5.5, 16, 2.4, t, 0.2);   // 목 프릴
      mandibles(R, P, 11.5 + lg, 9.5, 4, gape(f) ? 2.6 : 1, t);
      if (gape(f)) mouth(R, P, 12.5 + lg, 10, 1.8, c);
      R.eyes(11.5 + lg, 12, 1.5, c);
      R.flush();
    }),
    // 트렌처: 넓고 낮은 몸 + 커다란 삽 앞발
    trencher: unit(52, 36, 27, 4, (P, c, f) => {
      const R = rig(P, f, 26, 25), s = c.s, t = c.t, lg = lunge(f);
      legs(R, f, [0, -6], 6, 5, 11, t, 3);
      R.ell(-5, 0, 7 + wave(f, 0), 8, 7, 5.5, s);
      R.plate(-7, 0, 12 + wave(f, 0), 4.6, 5, t); R.plate(-1, 0, 12.5 + wave(f, 1), 3.6, 5.6, t);
      R.ell(5 + lg, 0, 6, 4.5, 4.5, 4, s, 0.2);
      for (const sd of [-1, 1]) {                                                // 삽 앞발: 굵은 팔 + 넓은 키틴 삽날(머리 양옆, 땅에 닿게)
        const sw = legSwing(f, sd > 0 ? 1 : 0) * 0.5, dig = gape(f) ? 2 : 0, u0 = 9 + lg + sw + dig;
        R.ell(5 + lg * 0.5, sd * 5, 5, 3, 2.4, 2.4, t, 0.1);
        R.put(R.dep(u0 + 3, sd * 7) + 0.5, () => {
          const q = [[u0 - 1, 3.5, 5], [u0 + 5, 4, 3], [u0 + 6.5, 9.5, 0.5], [u0, 10.5, 2]].map(([u, v, z]) => R.gp(u, sd * v, z));
          P.fpoly(q, t.m); P.line(q[0][0], q[0][1], q[1][0], q[1][1], t.h); P.line(q[3][0], q[3][1], q[0][0], q[0][1], t.l);
          P.line(q[1][0], q[1][1], q[2][0], q[2][1], t.d); P.line(q[2][0], q[2][1], q[3][0], q[3][1], t.o);
          for (let j = 1; j < 3; j++) { const a = R.gp(u0 + j * 2, sd * 4, 4), b = R.gp(u0 + j * 2 + 1, sd * 9.5, 1); P.line(a[0], a[1], b[0], b[1], t.d); }   // 삽날 홈
        });
      }
      if (gape(f)) mouth(R, P, 9, 6, 2, c);
      R.eyes(8.5 + lg, 8.5, 1.8, c);
      R.flush();
    }),
    // 허스크: 감염된 인간형 — 회색 살 + 보라 종양, 두 다리 보행, 빛나는 한쪽 눈
    husk: unit(28, 26, 23, 4, (P, c, f) => {
      const T = f.T, R = rig(P, f, 14, 22), g = ash(T), s = c.s, mv = f.anim === 'move' ? f.i : 0, lg = lunge(f) * 0.7;
      const st = [0, 2, 0, -2][mv], bob = mv & 1 ? 0 : 1;
      for (const sd of [-1, 1]) R.leg(0, sd * 2, 8, sd * st, sd * 2.5, g, 0, 1);
      R.ell(0.5 + lg * 0.3, 0, 12 - bob, 3, 4.2, 4.2, g);                         // 몸통(구부정)
      R.ell(-1.6, 1.6, 15 - bob, 2.6, 2.6, 2.4, s, 0.4);                       // 등 종양
      R.ell(-0.6, -2.2, 11 - bob, 1.3, 1.3, 1.3, s, 0.45);
      for (const sd of [-1, 1]) {                                                // 팔: 늘어진 팔 + 공격 시 앞으로 휘두름
        const reach = f.anim === 'attack' ? (f.i === 0 ? 6 : 3) : 1 - st * 0.5 * sd;
        R.put(R.dep(reach, sd * 3.5) + 0.1, () => { const [x0, y0] = R.gp(0.5, sd * 3.4, 14 - bob), [x1, y1] = R.gp(reach + lg, sd * 4, 9 - bob); thick(P, x0, y0, x1, y1, g.d); P.dot(x1, y1, s.l); });
      }
      R.ell(1.6 + lg * 0.4, 0, 18 - bob, 2.2, 2.2, 2.2, g, 0.5);                 // 머리
      R.ell(0.4, 1.2, 19.6 - bob, 1.3, 1.3, 1.2, s, 0.55);                       // 머리 종양
      R.eyes(3.2 + lg * 0.4, 18 - bob, 0.8, c, 0.7, 1);
      R.flush();
    }),
    // 블라이터: 등에 포자 굴뚝 2개(담즙 발광) + 다리 3쌍
    blighter: unit(48, 44, 37, 4, (P, c, f) => {
      const T = f.T, R = rig(P, f, 24, 35), s = c.s, t = c.t, G = bile(T), lg = lunge(f);
      legs(R, f, [4, 0, -4], 5.5, 5, 9.5, t, 5);
      R.ell(-3, 0, 8 + wave(f, 0), 9, 7.5, 6, s); R.tex(-3, 0, 8 + wave(f, 0), 9, 7.5, 6, s, 3);
      R.plate(0, 0, 13.5 + wave(f, 0), 4, 5, t); R.plate(-6, 0, 13 + wave(f, 0), 3.4, 5.4, t, 0.29);
      for (const [u, v, hh] of [[-5, -2.5, 11], [-7, 3, 8]]) {                   // 포자 굴뚝: 키틴 관 + 담즙 입구
        R.put(R.dep(u, v) + 0.6, () => {
          const [x, y] = R.gp(u, v, 12 + wave(f, 0));
          P.cyl(x, y, 0, 2.6, hh, t); P.fell(x, y - hh, 2.6, 1.8, t.o); P.fell(x, y - hh, 1.6, 1.1, G.m);
          P.dot(x - 1, y - hh - 1 - (f.anim === 'attack' ? 2 : 0), G.h);
          if (f.anim === 'attack') P.fell(x, y - hh - 3, 1.6 + f.i, 1.4 + f.i, G.l);
        });
      }
      R.ell(6 + lg, 0, 8, 4.4, 4.2, 4, s, 0.2);
      mandibles(R, P, 9 + lg, 7.5, 4, gape(f) ? 2.6 : 1.2, t);
      R.eyes(9 + lg, 10, 1.8, c);
      R.flush();
    }),
    // 베히모스: 92×76 거수 — 등 키틴 판 5장(마디 갑옷), 앞으로 휜 뿔 2, 굵은 키틴 다리 2쌍
    behemoth: unit(92, 76, 64, 4, (P, c, f) => {
      const R = rig(P, f, 46, 61), s = c.s, t = c.t, lg = lunge(f) * 1.5, T = f.T, mv = f.anim === 'move' ? f.i : 0;
      const tb = X(T, 'tusk', () => ramp(mix(T['swarm-b'], T['color-glint'], 0.5), T));                 // 상아 뿔
      for (const [k, u] of [[0, 10], [1, -12]]) for (const sd of [-1, 1]) {      // 기둥 다리: 살 허벅지 + 키틴 정강이 + 상아 발톱
        const sw = (k + (sd > 0 ? 1 : 0)) & 1 ? [0, 3, 0, -3][mv] : [0, -3, 0, 3][mv];
        R.ell(u + sw * 0.3, sd * 9, 12, 5, 4.5, 6, s, -0.12);
        R.ell(u + sw * 0.8, sd * 10, 4.5, 4, 3.6, 4.5, t, -0.1);
        R.put(R.dep(u + sw, sd * 10) - 0.08, () => { const [x, y] = R.gp(u + sw + 3, sd * 10, 0); P.dot(x - 2, y - 1, tb.l, 2, 1); P.dot(x + 1, y - 1, tb.m, 2, 1); });
      }
      R.ell(-6, 0, 21 + wave(f, 0), 21, 13, 11, s);                               // 몸통(살)
      R.tex(-6, 0, 21 + wave(f, 0), 21, 13, 11, s, 7);
      for (let k = 0; k < 5; k++) {                                              // 등 갑옷 5마디(뒤 → 앞, 가운데가 가장 높다)
        const u = -20 + k * 7, hz = 27 + [0, 2, 3, 2, 0][k] + wave(f, k), w = 11 - Math.abs(k - 2) * 1.2;
        R.ell(u, 0, hz, 5, w, 5, t, 0.3 + k * 0.01);
        R.put(R.dep(u, 0) + 0.305 + k * 0.01, () => { const [x0, y0] = R.gp(u - 4, -w * 0.6, hz + 4), [x1, y1] = R.gp(u - 4, w * 0.6, hz + 4); P.line(x0, y0, x1, y1, t.h); });
        if (k > 0 && k < 4) R.spike(u, 0, hz + 5, u - 3, 0, hz + 11 + (k === 2 ? 2 : 0), 2.4, tb, 0.32 + k * 0.01);
      }
      R.ell(16 + lg, 0, 16, 8, 8, 7, s, 0.4);                                     // 머리
      R.ell(15 + lg, 0, 21, 6, 7, 3.5, t, 0.41);                                  // 이마 판
      for (const sd of [-1, 1]) { R.spike(19 + lg, sd * 5, 20, 27 + lg, sd * 8, 27, 3.2, tb, 0.5); R.spike(27 + lg, sd * 8, 27, 33 + lg, sd * 7, 26, 1.8, tb, 0.51); }   // 뿔 2(휜 두 마디)
      if (gape(f)) mouth(R, P, 23, 13, 3.4, c);
      R.eyes(22 + lg, 17, 3.2, c, 0.6);
      R.flush();
    }),
    // 스폰링: 20×16 작은 벌레
    spawnling: unit(20, 16, 13, 4, (P, c, f) => {
      const R = rig(P, f, 10, 12), s = c.s, t = c.t, lg = lunge(f) * 0.6;
      legs(R, f, [1.5, -1.5], 1.8, 2.5, 5, t, 2.5);
      R.ell(-1.5, 0, 3.5 + wave(f, 0) * 0.5, 4, 3, 2.6, s);
      R.plate(-1.2, 0, 5.8, 2.6, 2.2, t);
      R.ell(3 + lg, 0, 3.5, 2.2, 2.2, 2, s, 0.2);
      if (gape(f)) mouth(R, P, 4.6, 3.5, 1, c);
      R.eyes(4.4 + lg, 4.5, 0.9, c);
      R.flush();
    }),

    // ---- 공중 ----
    // 블로터*: 부푼 주머니 + 아래로 늘어진 촉수 4. 이동 3프레임 = 부풂
    bloater: unit(56, 46, 34, 3, (P, c, f) => {
      const R = rig(P, f, 28, 34), s = c.s, t = c.t, inf = f.anim === 'move' ? [0, 1, 2][f.i] : 0, Z = 14;
      for (let k = 0; k < 4; k++) {                                              // 촉수 4: 아래로 흔들린다
        const a = k * Math.PI / 2 + Math.PI / 4, u = Math.cos(a) * 6, v = Math.sin(a) * 7;
        R.put(R.dep(u, v) - 0.5, () => {
          let [x, y] = R.gp(u, v, Z - 2);
          for (let j = 0; j < 5; j++) { const sw = Math.sin(j * 1.3 + k + (f.i || 0)) * 1.2, nx = x + sw, ny = y + 3; thick(P, x, y, nx, ny, j < 2 ? s.d : t.d); if (j < 2) P.line(x - 1, y, nx - 1, ny, s.m); x = nx; y = ny; }
          P.dot(x, y, t.l, 2, 1);
        });
      }
      R.ell(-1, 0, Z + 2, 14 + inf, 12 + inf, 10 + inf, s); R.tex(-1, 0, Z + 2, 14 + inf, 12 + inf, 10 + inf, s, 5);
      for (let k = 0; k < 3; k++) R.plate(-6 + k * 5, 0, Z + 11 - Math.abs(k - 1), 2.6, 6 - Math.abs(k - 1) * 1.5, t, 0.3 + k * 0.01);   // 등 키틴 판 3
      for (const [u, v, z] of [[-4, -8, Z + 3], [3, 8, Z + 2]]) R.put(R.dep(u, v) + 0.32, () => { const [x, y] = R.gp(u, v, z); P.fell(x, y, 1.6, 1.2, c.t.o); P.dot(x, y, c.glow); });   // 숨구멍 발광
      R.put(R.dep(-1, 0) + 0.35, () => {                                          // 맥: 등 위로 굽은 갈색 선
        const [x0, y0] = R.gp(-12, -3, Z + 4), [x1, y1] = R.gp(-2, -1, Z + 12), [x2, y2] = R.gp(8, 2, Z + 8);
        P.line(x0, y0, x1, y1, s.d); P.line(x1, y1, x2, y2, s.d);
      });
      R.ell(12, 0, Z + 1, 4, 4, 3.6, s, 0.5);                                     // 머리
      if (gape(f)) mouth(R, P, 15, Z, 2, c);
      R.eyes(15, Z + 2.5, 1.8, c, 0.6);
      R.flush();
    }),
    // 윙스팅*: 날개 4장(반투명) + 마디 몸 + 꼬리 침
    wingsting: unit(56, 44, 33, 2, (P, c, f) => {
      const R = rig(P, f, 28, 31), s = c.s, t = c.t, Z = 13, up = f.anim === 'move' ? (f.i ? -3 : 5) : 2, lg = lunge(f);
      for (const sd of [-1, 1]) { const nb = R.dep(0, sd) > 0.3 ? 6 : -3; R.wing(3, sd, 2, Z + 3, 13, 7, up, 5, c, nb); R.wing(-3, sd, 2, Z + 2, 10, 6, up - 2, 6, c, nb - 0.1); }
      R.ell(-9, 0, Z - 1, 7, 3.4, 3.2, s);                                       // 배
      R.spike(-14, 0, Z - 2, -22, 0, Z - 5, 1.6, t, 0.2);                         // 침
      R.ell(-1, 0, Z + 1, 4.2, 3.8, 3.6, s, 0.1); R.plate(-1, 0, Z + 4.5, 3.4, 3, t);
      R.ell(5 + lg, 0, Z + 1, 3.2, 3, 3, s, 0.2);
      mandibles(R, P, 7.5 + lg, Z, 3.5, gape(f) ? 2.4 : 1, t);
      R.eyes(7 + lg, Z + 2.5, 1.4, c);
      R.flush();
    }),
    // 시즈모*: 거대 턱 공중 — 커다란 머리·턱이 몸의 절반, 날개 2
    siegemaw: unit(72, 48, 39, 2, (P, c, f) => {
      const R = rig(P, f, 36, 37), s = c.s, t = c.t, T = f.T, Z = 13, up = f.anim === 'move' ? (f.i ? -3 : 5) : 2, op = gape(f) ? 4 : f.anim === 'attack' ? 0.5 : 2;
      const tb = X(T, 'tusk', () => ramp(mix(T['swarm-b'], T['color-glint'], 0.5), T));
      for (const sd of [-1, 1]) R.wing(-5, sd, 4, Z + 4, 17, 10, up, 7, c, R.dep(0, sd) > 0.3 ? 6 : -3);
      R.ell(-14, 0, Z, 8, 5, 4.5, s);
      R.ell(-4, 0, Z + 2, 8, 7, 6, s, 0.1); R.plate(-6, 0, Z + 8, 5, 4.6, t);
      R.ell(9, 0, Z + 1, 7, 7.5, 6, s, 0.2); R.plate(8, 0, Z + 7, 4, 5, t, 0.4);
      for (const sd of [-1, 1]) {                                                // 거대 턱: 상아 낫 2개
        R.put(R.dep(18, sd * 6) + 0.6, () => {
          const q = [[12, sd * (4 + op * 0.3), Z + 1], [20, sd * (7 + op), Z + 1], [27, sd * (3 + op * 0.6), Z - 1], [21, sd * (4 + op * 0.4), Z]].map(([u, v, z]) => R.gp(u, v, z));
          P.fpoly(q, tb.m); P.line(q[0][0], q[0][1], q[1][0], q[1][1], tb.h); P.line(q[1][0], q[1][1], q[2][0], q[2][1], tb.l); P.line(q[2][0], q[2][1], q[3][0], q[3][1], tb.d); P.dot(q[2][0], q[2][1], tb.h);
        });
      }
      if (gape(f)) mouth(R, P, 15, Z, 3, c);
      R.eyes(13, Z + 4, 3.2, c);
      R.flush();
    }),
    // 애시드윙*: 배 아래 산성 주머니(담즙 g) + 날개 2
    acidwing: unit(68, 48, 38, 2, (P, c, f) => {
      const R = rig(P, f, 34, 36), s = c.s, t = c.t, G = bile(f.T), Z = 14, up = f.anim === 'move' ? (f.i ? -3 : 5) : 2, lg = lunge(f);
      for (const sd of [-1, 1]) R.wing(-1, sd, 3, Z + 4, 17, 11, up, 7, c, R.dep(0, sd) > 0.3 ? 6 : -3);
      R.ell(-11, 0, Z + 1, 7, 4, 3.6, s); R.spike(-16, 0, Z, -24, 0, Z + 3, 1.6, t, 0.1);
      R.ell(-2, 0, Z - 5 + (f.anim === 'attack' && f.i === 1 ? -1 : 0), 6.5, 6, 5.5, G, 0.05);    // 산성 주머니(몸 아래)
      R.put(R.dep(-2, 0) + 0.08, () => { const [x, y] = R.gp(-2, 0, Z - 9); P.dot(x - 1, y + 2, G.o, 3, 1); if (f.anim === 'attack') P.fell(x, y + 4 + f.i * 2, 1.4, 1.6, G.l); });
      R.ell(0, 0, Z + 2, 6, 5, 4.4, s, 0.2); R.plate(-1, 0, Z + 6.5, 4.6, 3.8, t);
      R.ell(8 + lg, 0, Z + 2, 3.6, 3.4, 3.2, s, 0.3);
      mandibles(R, P, 10.5 + lg, Z + 1, 3.5, gape(f) ? 2.4 : 1, t);
      R.eyes(10 + lg, Z + 3.5, 1.6, c);
      R.flush();
    }),
    // 버스터*: 빛나는 담즙 구 + 작은 날개 2(자폭)
    burster: unit(28, 28, 22, 2, (P, c, f) => {
      const R = rig(P, f, 14, 21), s = c.s, G = glowR(f.T), Z = 10, up = f.anim === 'move' ? (f.i ? -2 : 4) : 1, sw = f.anim === 'attack' ? f.i : 0;
      for (const sd of [-1, 1]) R.wing(-2, sd, 3, Z + 4, 8, 6, up, 3, c, R.dep(0, sd) > 0.3 ? 6 : -3);
      R.ell(0, 0, Z, 6 + sw, 6 + sw, 6 + sw, G);                                  // 담즙 구
      R.put(R.dep(0, 0) + 0.2, () => { const [x, y] = R.gp(0, 0, Z); P.fell(x + 1, y + 1, 2.2, 2, c.w); P.dot(x - 3, y - 3, c.w, 2, 1); });
      R.ell(-4.5, 0, Z + 3, 3.2, 3, 2.6, s, 0.3);                                 // 뒤 살 덮개
      R.ell(5, 0, Z - 1, 2, 2, 2, s, 0.3); R.eyes(6.5, Z, 0.9, c);
      R.flush();
    }),
    // 매트런*: 커다란 몸 + 아래로 매달린 알 주머니(부풂 3프레임)
    matron: unit(60, 52, 40, 3, (P, c, f) => {
      const R = rig(P, f, 30, 38), s = c.s, t = c.t, G = bile(f.T), Z = 16, inf = f.anim === 'move' ? [0, 1, 2][f.i] : 0;
      for (const sd of [-1, 1]) R.wing(2, sd, 6, Z + 7, 11, 9, f.anim === 'move' ? [2, 4, 0][f.i] : 2, 5, c, R.dep(0, sd) > 0.3 ? 6 : -3);
      for (const [u, v, z] of [[-6, -4, Z - 9], [-2, 4, Z - 10], [-9, 3, Z - 7], [-3, 0, Z - 12]]) {   // 알 주머니
        const E = X(f.T, 'egg', () => ramp(mix(f.T['swarm-a'], f.T['color-glint'], 0.3), f.T));
        R.ell(u, v, z - 2 - inf * 0.5, 3.6 + inf * 0.3, 3.6 + inf * 0.3, 3.4 + inf * 0.3, E, 0.2);
        R.put(R.dep(u, v) + 0.21, () => { const [x, y] = R.gp(u, v, z - 2 - inf * 0.5); P.fell(x + 0.5, y + 0.5, 1.4, 1.2, G.d); P.dot(x, y, G.l); });
      }
      R.ell(-3, 0, Z, 13 + inf, 10 + inf, 8 + inf, s);
      for (let k = 0; k < 3; k++) R.plate(-9 + k * 6, 0, Z + 7.5 + inf, 3.6, 7 - k, t, 0.3);
      R.ell(10, 0, Z + 2, 4.5, 4.5, 4, s, 0.4);
      mandibles(R, P, 13, Z + 1, 3.5, gape(f) ? 2.4 : 1, t);
      R.eyes(13.5, Z + 3.5, 1.8, c);
      R.flush();
    }),
  });

  // ======================= 잔해·잠복·고치 (dirs 1) =======================
  const one = (w, h, frames, draw) => ({ w, h, px: 1, ox: w / 2, oy: h - 2, dirs: 1, race: 'swarm', frames, draw });
  function wreck(sz) {
    const W = [14, 24, 40][sz], H = [10, 16, 26][sz];
    return one(W, H, { idle: 1 }, (P, _c, f) => {
      const c = SW(f.T), s = c.s, t = c.t, cx = W / 2, cy = H / 2 + 1, sd = 101 + sz;
      P.fell(cx, cy + 1, W * 0.46, H * 0.34, s.o);                                // 보라 웅덩이(디더 테)
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dx = (x + 0.5 - cx) / (W * 0.4), dy = (y + 0.5 - cy - 1) / (H * 0.28); if (dx * dx + dy * dy < 1 && ((x + y) & 1)) P.dot(x, y, s.d); }
      P.fell(cx - W * 0.08, cy, W * 0.22, H * 0.14, s.d); P.dot(cx - W * 0.16, cy - 1, s.m, 2, 1);
      const n = 2 + sz * 2;
      for (let k = 0; k < n; k++) {                                               // 키틴 조각
        const hh = hash(sd, k), x = 2 + (hh & 1023) / 1023 * (W - 6), y = H * 0.25 + ((hh >>> 10) & 1023) / 1023 * H * 0.5, r = 1.5 + sz * 0.9 + ((hh >>> 20) & 3) * 0.4;
        const q = [[x - r, y], [x - r * 0.2, y - r * 0.9], [x + r, y - r * 0.3], [x + r * 0.4, y + r * 0.6]];
        P.fpoly(q, t.m); P.line(q[0][0], q[0][1], q[1][0], q[1][1], t.h); P.line(q[2][0], q[2][1], q[3][0], q[3][1], t.d);
      }
      if (sz) P.dot(cx + 2, cy - 2, c.g);
    });
  }
  Object.assign(SPR, {
    'wreck@swarm-s': wreck(0), 'wreck@swarm-m': wreck(1), 'wreck@swarm-l': wreck(2),
    // 공용 잠복 흙더미: 테마와 무관한 흙색 둔덕 3단 음영
    'mound@burrow': one(28, 14, { idle: 1 }, (P, _c, f) => {
      const e = earth(f.T);
      P.fell(14, 9, 13, 4.5, e.d); P.fell(12.5, 8, 10.5, 3.6, e.m); P.fell(11, 7, 6, 2.2, e.l);
      for (const [x, y] of [[5, 9], [20, 8], [15, 11], [9, 6]]) P.dot(x, y, e.o);
      P.dot(9, 6, e.h, 2, 1); P.dot(22, 10, e.l);
    }),
    // 고치: 갈색 고치 + 맥동 2프레임(속 보라 살 발광)
    'cocoon@cocoon': one(28, 30, { idle: 2 }, (P, _c, f) => {
      const c = SW(f.T), s = c.s, t = c.t, p = f.i & 1;
      P.fell(14, 26, 11, 3.2, s.o); P.dither(5, 24, 18, 4, s.d);
      P.blob(14, 16 - p * 0.5, 9 + p * 0.5, 11 + p * 0.5, t);
      for (const k of [-1, 0, 1]) P.line(14 + k * 5, 7, 14 + k * 6.5, 25, t.d);
      P.fell(13, 15, 3 + p, 4 + p, s.d); P.fell(12.5, 14.5, 1.6 + p * 0.6, 2.4 + p * 0.6, s.l);
      P.dot(9, 9, t.h, 2, 1);
    }),
  });

  // ======================= 건물 15종 =======================
  // 캔버스 = 터 w*32 × h*32 + 위로 oy. 터 = y oy..H. 좌상단 빛, 그림자는 오른쪽 아래.
  // 건설: b0 점막 고치 덩이 / b1 반쯤 솟은 돔(살 드러남) / b2 닫힌 돔(구멍 불 꺼짐). 가동 4프레임: 돔 ry +0/1/2/1, 구멍 발광 맥동.
  // 손상: 그을음 블록(해시 4px) void .55 + dmg2 금 2줄 — 정의가 직접 굽는다(포즈 'w0d1'·'w0d2').
  const PH = [0, 1, 2, 1];
  function pad(P, c, cx, cy, rx, ry) {                                         // 점막 바닥(크립 위 살 받침): 디더 테 + 진한 안쪽
    const cv = P.ctx.canvas; ry = Math.min(ry, cv.height - 6 - cy); rx = Math.min(rx, cx - 1, cv.width - 6 - cx);
    P.fell(cx + 2, cy + 2, rx, ry, c.s.o);
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy;
      if (d < 0.72 || (d < 1 && ((x + y) & 1))) P.dot(x, y, d < 0.5 ? c.s.d : c.s.o);
    }
  }
  // 돔: 바닥 타원 중심 (cx, cy), 반폭 rx, 높이 hh. 키틴(t) 몸 + 살(s) 띠는 따로
  function dome(P, rp, cx, cy, rx, hh) { P.blob(cx, cy - hh * 0.5, rx, hh * 0.5 + rx * 0.32, rp); }
  // 키틴 껍질: 돔 표면(바닥 중심 cx,cy · 반폭 rx · 높이 hh)을 판으로 덮는다. 판 사이 틈으로 살이 보인다.
  // 판 음영 = 표면 법선·빛(좌상 앞) → l/m/d, 위 가장자리 h. rows = [[φ0, φ1, 칸 수], …] (φ: 0 바닥 → 1 꼭대기)
  const LN = (() => { const v = [-0.55, 0.62, 0.56], n = Math.hypot(...v); return v.map(x => x / n); })();
  function shell(P, rp, cx, cy, rx, hh, rows, gap = 0.05, beta = 0.72, sd = 0) {
    const yc = cy - hh * 0.5, RY = hh * 0.5 + rx * 0.32, cb = Math.cos(beta), sb = Math.sin(beta);
    // 단위 구(방위 th, 고도 a)를 시선 쪽으로 beta 만큼 기울여 blob 타원에 맞춘다
    const sp = (th, a) => { const X = Math.sin(th) * Math.cos(a), Y = Math.sin(a), Zc = Math.cos(th) * Math.cos(a); return [X, Y * cb - Zc * sb, Y * sb + Zc * cb]; };
    const pt = (th, a) => { const v = sp(th, a); return [cx + rx * v[0], yc - RY * v[1]]; };
    const list = [];
    for (const [p0, p1, n, off = 0] of rows) for (let j = 0; j < n; j++) {
      const t0 = (j + off) / n * TAU + gap, t1 = (j + 1 + off) / n * TAU - gap, a0 = p0 * Math.PI / 2 + gap * 0.8, a1 = p1 * Math.PI / 2 - gap * 0.3, tm = (t0 + t1) / 2, am = (a0 + a1) / 2;
      const nv = sp(tm, am); if (nv[2] < 0.12) continue;
      if (sd && p0 > 0 && hash(sd + j, p0 * 100 | 0) % 9 === 0) continue;          // 빠진 판(살이 드러난다)
      list.push([nv[2], t0, t1, a0, a1, nv]);
    }
    list.sort((p, q) => p[0] - q[0]);
    for (const [, t0, t1, a0, a1, nv] of list) {
      const tm = (t0 + t1) / 2, pts = [pt(t0, a0), pt(tm, a0 - 0.04), pt(t1, a0), pt(t1, a1), pt(tm, a1 + 0.03), pt(t0, a1)];
      const d = nv[0] * LN[0] + nv[1] * LN[1] + nv[2] * LN[2];
      P.fpoly(pts, d > 0.66 ? rp.l : d > 0.25 ? rp.m : rp.d);
      // 위(먼) 가장자리 h, 아래(가까운) 가장자리 o — 판이 겹친 비늘처럼 읽힌다
      P.line(pts[5][0], pts[5][1], pts[4][0], pts[4][1], d > 0.25 ? rp.h : rp.l); P.line(pts[4][0], pts[4][1], pts[3][0], pts[3][1], d > 0.25 ? rp.h : rp.l);
      P.line(pts[0][0], pts[0][1], pts[1][0], pts[1][1], rp.o); P.line(pts[1][0], pts[1][1], pts[2][0], pts[2][1], rp.o);
      if (d > 0.55) { const m = pt(tm - 0.06, (a0 + a1) / 2 + 0.04); P.dot(m[0], m[1], rp.h); }
    }
  }
  // 판 덮인 둔덕: b1(k<1) = 살 둔덕 + 아래 판 한 줄, 완성 = 살 위 판 여러 줄(빠진 판 몇 장)
  function mound(P, c, cx, cy, rx, hh, k, sd, rows) {
    dome(P, c.s, cx, cy, rx, hh);
    if (k < 1) { shell(P, c.t, cx, cy, rx, hh, [[0, 0.3, Math.max(8, Math.round(rx / 3.4))]]); slime(P, c, cx - rx * 0.4, cy - hh * 0.9, 4); return; }
    shell(P, c.t, cx, cy, rx, hh, rows || [[0, 0.34, Math.round(rx / 2.6)], [0.34, 0.66, Math.round(rx / 3.4), 0.5], [0.66, 1, Math.max(3, Math.round(rx / 6))]], 0.05, 0.72, sd);
  }
  const topOf = (cy, rx, hh) => cy - hh * 0.5 - (hh * 0.5 + rx * 0.32) * Math.cos(0.72);
  // 구멍: 키틴 테 + 어둠 + 안쪽 발광(lv 0 = 꺼짐, 1..3 = 맥동)
  function hole(P, c, x, y, rx, ry, lv) {
    P.fell(x, y, rx + 1, ry + 1, c.t.o); P.fell(x, y - 0.5, rx + 1, ry + 0.5, c.t.d); P.fell(x, y + 0.5, rx, ry, c.k);
    if (lv > 0) { const k = 0.35 + lv * 0.13; P.fell(x, y + ry * 0.25, rx * k * 1.2, ry * k, c.g); if (lv >= 2) P.fell(x - 0.5, y + ry * 0.2, Math.max(1, rx * k * 0.6), Math.max(1, ry * k * 0.5), c.glow); }
    P.line(x - rx, y - ry * 0.4, x - rx * 0.3, y - ry - 0.5, c.t.h);
  }
  function spikeS(P, rp, x, y, len, ang, w) {                                   // 화면 좌표 가시(왼쪽 면 l, 오른쪽 면 d)
    const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len, px = -Math.sin(ang) * w, py = Math.cos(ang) * w;
    P.fpoly([[x + px, y + py], [x, y], [ex, ey]], rp.l); P.fpoly([[x, y], [x - px, y - py], [ex, ey]], rp.d); P.dot(ex, ey, rp.h);
  }
  function plateS(P, rp, pts) {                                                 // 화면 좌표 키틴 판: 면 m + 위 가장자리 h + 아래 d
    P.fpoly(pts, rp.m); const n = pts.length;
    let top = 0, bot = 0; for (let k = 1; k < n; k++) { if (pts[k][1] < pts[top][1]) top = k; if (pts[k][1] > pts[bot][1]) bot = k; }
    for (const k of [top, (top + n - 1) % n]) { const a = pts[k], b = pts[(k + 1) % n]; P.line(a[0], a[1], b[0], b[1], rp.h); }
    for (const k of [bot, (bot + n - 1) % n]) { const a = pts[k], b = pts[(k + 1) % n]; P.line(a[0], a[1], b[0], b[1], rp.d); }
  }
  function slime(P, c, x, y, n) { for (let k = 0; k < n; k++) P.dot(x + k * 3, y + (k & 1), c.s.h); }
  // b0: 점막 고치 덩이(터 크기에 맞춘 살 방울 무리 + 점액 반짝임)
  function cocoonLumps(P, c, W, oy, fh, id) {
    const cx = W / 2, cy = oy + fh * 0.58, n = 3 + Math.round(W / 32) * 2, sd = strHash(id);
    pad(P, c, cx, cy + 4, W * 0.42, fh * 0.3);
    const L = [];
    for (let k = 0; k < n; k++) { const hh = hash(sd, k), a = (hh & 1023) / 1023 * TAU, r = ((hh >>> 10) & 1023) / 1023; L.push([cx + Math.cos(a) * r * W * 0.27, cy + Math.sin(a) * r * fh * 0.18, 4 + ((hh >>> 20) & 7) * 0.8 + W * 0.03]); }
    L.sort((p, q) => p[1] - q[1]);
    for (const [x, y, r] of L) { P.blob(x, y - r * 0.5, r, r * 0.85, c.s); P.dot(x - r * 0.4, y - r * 1.1, c.w); }
    for (const [x, y, r] of L.slice(0, 3)) P.line(x - r * 0.5, y - r * 0.2, x - r * 0.8, y + r * 0.6, c.s.l);
  }
  // 그을음 굽기
  function scorch(P, id, dmg, c) {
    if (!dmg) return;
    const ctx = P.ctx, cv = ctx.canvas, W = cv.width, H = cv.height, img = ctx.getImageData(0, 0, W, H), d = img.data, sd = strHash(id), V = [8, 10, 18];
    const vv = c.k.match(/\d+/g).slice(0, 3).map(Number);
    for (let k = 0; k < 3; k++) V[k] = vv[k];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4; if (d[i + 3] < 110) continue;
      if (hash(sd ^ (x >> 2), y >> 2) % (dmg === 1 ? 5 : 3) === 0) for (let k = 0; k < 3; k++) d[i + k] += (V[k] - d[i + k]) * 0.55;
    }
    ctx.putImageData(img, 0, 0);
    if (dmg >= 2) {                                                              // 금 2줄(지그재그)
      for (let n = 0; n < 2; n++) {
        let x = W * (0.3 + n * 0.35) + (hash(sd, n) & 7), y = H * 0.32 + ((hash(sd, n + 9) >>> 4) & 7);
        for (let k = 0; k < 6; k++) { const nx = x + ((hash(sd, n * 16 + k) & 7) - 3.5), ny = y + 3 + (hash(sd, k + 40) & 3); P.line(x, y, nx, ny, c.s.o); x = nx; y = ny; }
      }
    }
  }
  // 건물 정의 공장: body(P, c, o) — o = { k 높이배율, lit 발광, ph 맥동(0..2), i 프레임, T }
  function bld(id, tw, th, oy, body, extra = {}) {
    const W = tw * 32, H = th * 32 + oy;
    return Object.assign({ w: W, h: H, px: 1, ox: 0, oy, dirs: 1, race: 'swarm', frames: { build: 3, work: 4 }, draw(P, cIn, f) {
      const c = SW(f.T), stage = f.anim === 'build' ? f.i : 3;
      if (stage === 0) { cocoonLumps(P, c, W, oy, th * 32, id); return; }
      body(P, c, { k: stage === 1 ? 0.55 : 1, lit: stage === 3, ph: stage === 3 ? PH[f.i & 3] : 0, i: f.i, T: f.T, W, H, oy, fh: th * 32, stage, dmg: f.dmg || 0 });
      void cIn; scorch(P, id, stage === 3 ? f.dmg || 0 : 0, c);
    } }, extra);
  }
  const lvOf = o => o.lit ? 1 + o.ph : 0;

  // ---- 번식지 계열(4×3): 번식지 → 성숙지 → 정점지. 같은 몸에 등급마다 판·가시 왕관·발광 볏을 더한다 ----
  function nestBody(level) {
    return (P, c, o) => {
      const { W, oy, fh, k, T } = o, cx = W / 2, cy = oy + fh * 0.64, rx = 48 + level * 2, hh = (38 + level * 4) * k + o.ph;
      const TOP = cy - hh * 0.5 - (hh * 0.5 + rx * 0.32) * Math.cos(0.72), tb = X(T, 'tusk', () => ramp(mix(T['swarm-b'], T['color-glint'], 0.5), T));
      pad(P, c, cx, cy + 4, 60, 22);
      for (const sd of [-1, 1]) {                                                // 옆 혹(살 주머니 + 숨구멍)
        const x = cx + sd * 47, y = cy + 6; P.blob(x, y - 7 * k, 11, 9 * k + 2, c.s); P.dot(x - 4, y - 13 * k, c.s.h, 2, 1);
        if (level && k === 1) hole(P, c, x + sd * 2, y - 4, 3, 2, lvOf(o) ? 1 + (o.ph >> 1) : 0);
      }
      dome(P, c.s, cx, cy, rx, hh);                                              // 살 돔(판 사이로 보인다)
      if (k < 1) {                                                              // b1: 반쯤 솟은 살 돔 + 아래 판 한 줄 + 점액
        shell(P, c.t, cx, cy, rx, hh, [[0, 0.3, 14]]);
        slime(P, c, cx - 20, TOP + 6, 6); P.dot(cx - 18, TOP + 10, c.w);
        return;
      }
      shell(P, c.t, cx, cy, rx, hh, [[0, 0.3, 16], [0.3, 0.58, 12, 0.5], [0.58, 0.82, 8], [0.82, 1, 4, 0.5]], 0.05, 0.72, 11 + level);
      // 앞 아가리: 애벌레 굴(발광 맥동) + 위 상아 이빨
      const mx = cx + 2, my = cy + 3; hole(P, c, mx, my, 15, 8, lvOf(o));
      for (let j = 0; j < 6; j++) spikeS(P, tb, mx - 13 + j * 5.2, my - 8 + Math.abs(j - 2.5) * 0.9, 5, Math.PI / 2 - (j - 2.5) * 0.08, 1.7);
      if (o.lit) for (let j = 0; j < 3; j++) { P.fell(mx - 6 + j * 6, my + 3 - (j === 1 ? 1 : 0), 2.4, 1.7, c.s.l); P.dot(mx - 7 + j * 6, my + 2 - (j === 1 ? 1 : 0), c.s.h); }
      if (level >= 1) {                                                          // 성숙지: 상아 가시 왕관 + 정수리 숨구멍
        for (let j = 0; j < 7; j++) { const a = -Math.PI / 2 + (j - 3) * 0.36, bx = cx - 3 + Math.cos(a) * 24, by = TOP + 8 + Math.abs(j - 3) * 3.2; spikeS(P, tb, bx, by, 10 + (j & 1) * 4, -Math.PI / 2 + (j - 3) * 0.22, 3.4); }
        hole(P, c, cx - 3, TOP + 6, 5, 3, lvOf(o));
      }
      if (level >= 2) {                                                          // 정점지: 높은 상아 첨탑 2 + 담즙 발광 볏(엄니가 감싼다)
        for (const [dx, len, a] of [[-16, 26, -1.95], [10, 26, -1.2]]) spikeS(P, tb, cx + dx, TOP + 10, len, a, 5.5);
        const gx = cx - 3, gy = TOP - 2, GR = glowR(T);
        P.fell(gx, gy + 3, 9, 6, c.t.o); P.blob(gx, gy, 7.5, 6.5, GR);
        P.fell(gx - 2, gy - 2, 1.5 + o.ph * 0.6, 1.2 + o.ph * 0.4, c.w);
        for (const sd of [-1, 1]) spikeS(P, tb, gx + sd * 8, gy + 5, 12, -Math.PI / 2 - sd * 0.5, 3.4);
      }
    };
  }
  const NEST_GLOW = [[66, 102, 10]];
  Object.assign(SPR, {
    nest: bld('nest', 4, 3, 20, nestBody(0), { glow: NEST_GLOW, smoke: [] }),
    grandnest: bld('grandnest', 4, 3, 20, nestBody(1), { glow: [...NEST_GLOW, [60, 50, 5]], smoke: [] }),
    apexnest: bld('apexnest', 4, 3, 24, nestBody(2), { glow: [...NEST_GLOW, [60, 26, 8]], smoke: [] }),
  });

  // ---- 흡수낭(가스, 2×2): 분출구를 덮은 살 주머니 + 위 담즙 웅덩이 입구, 관 2 ----
  SPR.siphon = bld('siphon', 2, 2, 12, (P, c, o) => {
    const { k, oy } = o, cx = 32, cy = oy + 42, G = bile(o.T), hh = 22 * k + o.ph, rx = 21, top = topOf(cy, rx, hh);
    pad(P, c, cx, cy + 4, 30, 16);
    for (const sd of [-1, 1]) { const x = cx + sd * 22, y = cy + 4; P.blob(x, y - 4 * k, 7, 6 * k + 1, c.s); P.dot(x - 3, y - 8 * k, c.s.h); }   // 흡입 혹
    mound(P, c, cx, cy, rx, hh, k, 21, [[0, 0.4, 9], [0.4, 0.75, 6, 0.5]]);
    if (k < 1) return;
    const gy = top + 6;                                                         // 위 담즙 입구(가스를 빨아올린다)
    P.fell(cx, gy, 10, 5, c.t.o); P.fell(cx, gy - 0.5, 9, 4, c.t.d);
    P.fell(cx, gy + 0.5, 7.5, 3.2, o.lit ? G.d : c.k);
    if (o.lit) { P.fell(cx - 1, gy, 4.5 + o.ph * 0.5, 1.8, G.m); P.dot(cx - 4, gy - 1, G.h, 2, 1); }
    P.line(cx - 9, gy - 1, cx - 5, gy - 4, c.t.h);
  }, { glow: [[32, 24, 7]], smoke: [[32, 20]] });

  // ---- 배양조(3×2): 키틴 테 그릇 + 보라 배양액, 기포가 프레임마다 오른다, 가시 2 ----
  SPR.vat = bld('vat', 3, 2, 12, (P, c, o) => {
    const { k, oy, i } = o, cx = 48, cy = oy + 38;
    pad(P, c, cx, cy + 6, 44, 18);
    for (const sd of [-1, 1]) spikeS(P, c.t, cx + sd * 34, cy - 4, 18 * k + 4, -Math.PI / 2 + sd * 0.45, 3);
    P.blob(cx, cy - 4 * k, 38, 16 * k + 4, c.t);
    if (k < 1) { P.fell(cx, cy - 10, 24, 6, c.s.d); return; }
    P.fell(cx, cy - 12, 29, 10, c.t.o); P.fell(cx, cy - 11, 27, 8.6, c.s.d);
    P.fell(cx - 3, cy - 12 + o.ph * 0.4, 20, 5.5, c.s.m); P.fell(cx - 9, cy - 14, 8, 2.2, c.s.l);
    if (o.lit) for (let j = 0; j < 4; j++) { const bx = cx - 16 + j * 10 + ((j * 7) % 3), by = cy - 8 - ((i + j * 2) % 4) * 2; P.fell(bx, by, 1.6, 1.4, c.s.h); }
    for (let j = 0; j < 6; j++) P.dot(cx - 26 + j * 10, cy - 1 + (j & 1), c.t.h, 3, 1);
    P.dot(cx - 26, cy - 18, c.t.h, 4, 1);
  }, { glow: [[48, 38, 14]], smoke: [] });

  // ---- 변이 소낭(3×2): 이빨 테로 둘린 구덩이, 안쪽 발광 + 옆 혹 ----
  SPR.mutapit = bld('mutapit', 3, 2, 12, (P, c, o) => {
    const { k, oy } = o, cx = 48, cy = oy + 38;
    pad(P, c, cx, cy + 4, 46, 20);
    for (const [x, y, r] of [[14, cy - 4, 7], [82, cy - 6, 6], [74, cy + 10, 5]]) { P.blob(x, y, r, r * 0.8 * k + 1, c.s); P.dot(x - r * 0.4, y - r * 0.6, c.s.h); }
    P.blob(cx, cy - 4 * k - o.ph * 0.4, 34, 12 * k + 4, c.t);
    if (k < 1) return;
    hole(P, c, cx, cy - 6, 22, 7, lvOf(o));
    for (let j = 0; j < 9; j++) { const a = Math.PI + j / 8 * Math.PI, x = cx + Math.cos(a) * 24, y = cy - 6 + Math.sin(a) * 8.5; spikeS(P, c.t, x, y + 1, 7 + (j & 1) * 3, -Math.PI / 2 + Math.cos(a) * 0.6, 2); }
    for (const sd of [-1, 1]) spikeS(P, c.t, cx + sd * 30, cy - 10, 14, -Math.PI / 2 + sd * 0.5, 3);
  }, { glow: [[48, 44, 12]], smoke: [] });

  // ---- 촉수 기둥 계열(2×2): 촉수 기둥 → 가시 뿌리 / 산성 낭. 공통 = 뿌리 둔덕 + 굵은 줄기 ----
  function stalk(P, c, o, cx, cy, hgt) {
    pad(P, c, cx, cy + 4, 28, 14);
    for (const sd of [-1, 1]) for (let j = 0; j < 2; j++) { const x = cx + sd * (12 + j * 6), y = cy + 3 + j * 4; P.blob(x, y, 4 - j, 2.4 - j * 0.5, c.t); }   // 뿌리 혹
    P.blob(cx, cy - 2, 12, 6, c.t);
    const top = cy - hgt * o.k;
    P.fpoly([[cx - 8, cy - 1], [cx - 5, top], [cx + 5, top], [cx + 8, cy - 1]], c.s.d);
    P.fpoly([[cx - 8, cy - 1], [cx - 5, top], [cx - 1, top], [cx - 1, cy - 1]], c.s.m);
    P.line(cx - 6, cy - 2, cx - 4, top + 1, c.s.l);
    for (let y = cy - 6; y > top + 2; y -= 6) { P.line(cx - 7, y, cx + 7, y + 1, c.t.d); P.line(cx - 6, y - 1, cx - 2, y - 1, c.t.l); }   // 마디 고리
    return top;
  }
  SPR.tendril = bld('tendril', 2, 2, 16, (P, c, o) => {
    const cx = 32, cy = o.oy + 44, top = stalk(P, c, o, cx, cy, 34);
    if (o.k < 1) return;
    const sw = [0, 1, 0, -1][o.i & 3] * (o.lit ? 1 : 0);
    for (const [a, len] of [[-2.5, 15], [-0.6, 15], [-1.57, 13], [-2.05, 10], [-1.1, 10]]) {   // 촉수 왕관(흔들림)
      let x = cx, y = top + 2;
      for (let j = 1; j <= 5; j++) { const aa = a + Math.sin(j * 0.9) * 0.25 + sw * 0.08 * j, nx = x + Math.cos(aa) * len / 5, ny = y + Math.sin(aa) * len / 5; thick(P, x, y, nx, ny, j < 4 ? c.s.m : c.s.l); x = nx; y = ny; }
      P.fell(x + 0.5, y, 2, 1.6, c.t.m); P.dot(x, y - 1, c.t.h);
    }
    P.blob(cx, top + 2, 6, 4, c.s); if (o.lit) P.fell(cx, top + 3, 2, 1.4, c.glow);
  }, { glow: [[32, 26, 4]], smoke: [] });
  SPR.spineroot = bld('spineroot', 2, 2, 16, (P, c, o) => {
    const cx = 32, cy = o.oy + 44, top = stalk(P, c, o, cx, cy, 16), T = o.T;
    if (o.k < 1) return;
    const tb = X(T, 'tusk', () => ramp(mix(T['swarm-b'], T['color-glint'], 0.5), T)), rise = o.ph;
    for (let j = 0; j < 7; j++) { const a = -Math.PI + 0.35 + j * (Math.PI - 0.7) / 6; spikeS(P, tb, cx + Math.cos(a) * 8, top + 4 + Math.abs(j - 3), (j === 3 ? 26 : 20 - Math.abs(j - 3) * 2) + (j & 1 ? rise : 0), a, 4.2); }
    P.blob(cx, top + 4, 9, 6, c.t); hole(P, c, cx, top + 5, 3.5, 2, lvOf(o));
  }, { glow: [[32, 26, 4]], smoke: [] });
  SPR.puffer = bld('puffer', 2, 2, 16, (P, c, o) => {
    const cx = 32, cy = o.oy + 44, top = stalk(P, c, o, cx, cy, 22), G = bile(o.T);
    if (o.k < 1) return;
    const r = 13 + o.ph * 0.6;
    P.blob(cx, top - 6, r, r * 0.85, G);                                        // 산성 낭(탐지기 눈 겸)
    P.fell(cx + 1, top - 5, 5, 4.2, G.o); P.fell(cx + 1, top - 5, 3.6, 3.2, c.s.m); P.fell(cx + 1, top - 5, 1.6, 2.6, c.k);   // 눈
    if (o.lit) P.dot(cx, top - 7, c.w);
    for (const [dx, dy] of [[-9, -12], [8, -14], [-11, -2], [11, -3]]) { P.fell(cx + dx, top + dy, 1.5, 1.2, G.o); P.dot(cx + dx, top + dy - 1, G.h); }   // 숨구멍
    for (const sd of [-1, 1]) plateS(P, c.t, [[cx + sd * 4, top + 6], [cx + sd * 13, top + 1], [cx + sd * 12, top + 6], [cx + sd * 6, top + 9]]);
  }, { glow: [[33, 22, 8]], smoke: [[32, 12]] });

  // ---- 가시뱀 굴(3×2): 둔덕 + 앞 굴 + 등 위로 감긴 가시 능선 ----
  SPR.wyrmpit = bld('wyrmpit', 3, 2, 12, (P, c, o) => {
    const { k, oy, T } = o, cx = 46, cy = oy + 44, rx = 38, hh = 20 * k + o.ph * 0.5, top = topOf(cy, rx, hh);
    const tb = X(T, 'tusk', () => ramp(mix(T['swarm-b'], T['color-glint'], 0.5), T));
    pad(P, c, cx, cy + 2, 46, 18);
    mound(P, c, cx, cy, rx, hh, k, 31);
    if (k < 1) return;
    for (let j = 0; j < 8; j++) {                                                // 감긴 등뼈: 마디 + 상아 가시(뱀이 굴 위에 똬리)
      const t = j / 7, x = cx - 30 + t * 56, y = top + 6 + Math.sin(t * Math.PI * 1.6 + 0.4) * 5 + Math.abs(t - 0.5) * 12;
      P.blob(x, y, 4.6, 3.6, c.s); spikeS(P, tb, x - 1, y - 2, 7 + (j & 1) * 3, -Math.PI / 2 - 0.35, 2.4);
    }
    hole(P, c, cx + 10, cy - 2, 12, 6.5, lvOf(o));
  }, { glow: [[56, 54, 9]], smoke: [] });

  // ---- 비상탑(2×2) → 대비상탑: 키틴 첨탑 + 막 날개 지느러미 ----
  function spire(level) {
    return (P, c, o) => {
      const { k, oy } = o, cx = 32, cy = oy + 46, hgt = (44 + level * 6) * k, bw = 12;
      pad(P, c, cx, cy + 2, 28, 14);
      mound(P, c, cx, cy + 2, 20, 10 * Math.max(k, 0.6), 1, 71 + level, [[0, 0.5, 9]]);
      if (level && k === 1) for (const sd of [-1, 1]) {                         // 대비상탑: 날개 지느러미 2쌍
        for (const [h0, sp] of [[0.75, 22], [0.45, 17]]) {
          const y0 = cy - hgt * h0, q = [[cx + sd * 3, y0], [cx + sd * sp, y0 - 10 - o.ph], [cx + sd * (sp - 3), y0 + 4], [cx + sd * 3, y0 + 9]];
          dpoly(P, q, c.s.h, c.s.l); P.line(q[0][0], q[0][1], q[1][0], q[1][1], c.t.m); P.line(q[1][0], q[1][1], q[3][0], q[3][1], c.s.d);
        }
      }
      if (!level && k === 1) for (const sd of [-1, 1]) {                        // 비상탑: 작은 막 한 쌍
        const y0 = cy - hgt * 0.6, q = [[cx + sd * 3, y0], [cx + sd * 16, y0 - 8 - o.ph], [cx + sd * 3, y0 + 10]];
        dpoly(P, q, c.s.h, c.s.l); P.line(q[0][0], q[0][1], q[1][0], q[1][1], c.t.m);
      }
      P.fpoly([[cx - bw, cy - 6], [cx - 2, cy - hgt], [cx + 1, cy - hgt], [cx + bw, cy - 6]], c.t.d);   // 첨탑(왼쪽 밝음, 마디마다 고리)
      P.fpoly([[cx - bw, cy - 6], [cx - 2, cy - hgt], [cx, cy - hgt], [cx - 2, cy - 6]], c.t.m);
      P.fpoly([[cx - bw + 1, cy - 7], [cx - 2, cy - hgt + 2], [cx - bw * 0.45, cy - 7]], c.t.l);
      P.line(cx - bw + 1, cy - 8, cx - 2, cy - hgt + 1, c.t.h);
      for (let j = 1; j < 6; j++) { const y = cy - 6 - (hgt - 6) * j / 6, hw = bw * (1 - j / 6) + 1; P.line(cx - hw, y, cx + hw, y + 1, c.t.o); P.line(cx - hw + 1, y - 1, cx - 1, y - 1, c.t.h); }
      if (k < 1) return;
      for (let j = 0; j < 2 + level; j++) hole(P, c, cx, cy - hgt * (0.25 + j * 0.22), 1.6, 1.2, lvOf(o) ? 1 + ((o.ph + j) % 3) : 0);
      if (level) { P.blob(cx, cy - hgt - 2, 5, 4, c.s); spikeS(P, c.t, cx, cy - hgt - 4, 8, -Math.PI / 2, 2); }
    };
  }
  SPR.roost = bld('roost', 2, 2, 16, spire(0), { glow: [[32, 40, 3]], smoke: [] });
  SPR.greatroost = bld('greatroost', 2, 2, 20, spire(1), { glow: [[32, 40, 3], [32, 18, 4]], smoke: [] });

  // ---- 모체 소굴(3×2): 낮은 돔 + 앞에 알 무더기(맥동) ----
  SPR.matronden = bld('matronden', 3, 2, 12, (P, c, o) => {
    const { k, oy } = o, cx = 50, cy = oy + 38, G = bile(o.T);
    pad(P, c, cx - 2, cy + 6, 46, 18);
    mound(P, c, cx + 6, cy, 30, 24 * k + o.ph, k, 41);
    if (k < 1) return;
    hole(P, c, cx + 10, cy - 4, 9, 6, lvOf(o));
    const eggs = [[22, cy + 2], [30, cy + 6], [16, cy + 8], [26, cy + 13], [36, cy + 12], [12, cy + 15]];
    for (const [x, y] of eggs) { P.blob(x, y - 3, 5, 5.5, c.s); P.fell(x + 0.5, y - 2, 2, 2.4, o.lit ? G.d : c.s.o); if (o.lit) P.dot(x, y - 3 + (o.ph > 1 ? 0 : 1), G.l); P.dot(x - 2, y - 6, c.s.h); }
  }, { glow: [[24, 50, 10]], smoke: [] });

  // ---- 역병 둔덕(4×2): 긴 둔덕 + 포자 굴뚝 3 + 담즙 웅덩이 ----
  SPR.blightmound = bld('blightmound', 4, 2, 16, (P, c, o) => {
    const { k, oy } = o, cx = 64, cy = oy + 40, G = bile(o.T);
    pad(P, c, cx, cy + 4, 62, 18);
    mound(P, c, cx - 4, cy + 2, 54, 16 * k + o.ph * 0.5, k, 51, [[0, 0.4, 22], [0.4, 0.8, 14, 0.5]]);
    if (k < 1) return;
    for (const [x, r] of [[34, 12], [82, 14]]) { P.blob(x, cy - 12, r, r - 4, c.s); P.dot(x - r * 0.5, cy - 12 - r * 0.6, c.s.h, 2, 1); }   // 포자 주머니
    for (const [x, hh, r] of [[22, 18, 4], [58, 26, 5], [96, 20, 4]]) {          // 포자 굴뚝
      P.cyl(x, cy - 8, 0, r, hh, c.t); P.fell(x, cy - 8 - hh, r, r * 0.7, c.t.o); P.fell(x, cy - 8 - hh, r - 1.2, (r - 1.2) * 0.7, o.lit ? G.m : c.k);
      if (o.lit) P.dot(x - 1, cy - 9 - hh - o.ph, G.h, 2, 1);
    }
    P.fell(76, cy + 4, 14, 4, G.o); P.fell(75, cy + 3.5, 12, 3, o.lit ? G.d : c.s.o); if (o.lit) P.dot(70 + o.ph * 2, cy + 3, G.l, 3, 1);   // 웅덩이
    for (const [x, y] of [[40, cy - 16], [70, cy - 18]]) hole(P, c, x, y, 3, 2, lvOf(o));
  }, { glow: [[22, 30, 4], [58, 22, 5], [96, 28, 4]], smoke: [[22, 26], [58, 18], [96, 24]] });

  // ---- 거수 동굴(3×2): 상아 늑골이 둘린 큰 동굴 입구, 안쪽 눈 2 ----
  SPR.behemothcave = bld('behemothcave', 3, 2, 16, (P, c, o) => {
    const { k, oy, T } = o, cx = 48, cy = oy + 42, tb = X(T, 'tusk', () => ramp(mix(T['swarm-b'], T['color-glint'], 0.5), T));
    pad(P, c, cx, cy + 4, 46, 16);
    mound(P, c, cx, cy + 4, 40, 40 * k + o.ph * 0.5, k, 61);
    if (k < 1) return;
    P.fell(cx + 2, cy - 4, 22, 17, c.t.o); P.fell(cx + 2, cy - 3, 20, 15.5, c.k);
    for (let j = 0; j < 5; j++) { const a = Math.PI + (j + 0.5) / 5 * Math.PI, x = cx + 2 + Math.cos(a) * 24, y = cy - 4 + Math.sin(a) * 20; spikeS(P, tb, x, y, 9, a + Math.PI * 0.6, 2.6); }   // 늑골 엄니
    for (const sd of [-1, 1]) spikeS(P, tb, cx + 2 + sd * 16, cy + 8, 10, -Math.PI / 2 - sd * 0.4, 3);
    if (o.lit) for (const sd of [-1, 1]) P.dot(cx + 2 + sd * 5, cy - 6 + (o.ph === 2 ? 1 : 0), c.glow, 2, o.ph === 2 ? 1 : 2);
    P.dot(cx - 30, cy - 34, c.t.h, 5, 1);
  }, { glow: [[50, 52, 8]], smoke: [] });
  // 연출 화면(VS·로비 분대)의 공격 섬광 자리: muzzle = 대기 동쪽 자세, muzzleSE = 대기 남동 자세(캔버스 좌표, 외곽선 1px 포함)
  SPR.behemoth.muzzle = [80, 36]; SPR.behemoth.muzzleSE = [76, 48];
  // Task 9: 옛 화면 크기(반해상도 ×2, 2px 외곽선)보다 작게 읽히던 유닛을 키운다 — 몸 면적이 옛 것 이상(측정: art9 보고서)
  for (const [id, k] of [['drudge', 1.45], ['skitter', 1.3], ['spawnling', 1.5], ['husk', 1.9], ['burster', 1.45], ['spinewyrm', 1.55], ['trencher', 1.55],
    ['blighter', 1.6], ['matron', 1.5], ['behemoth', 1.65], ['bloater', 1.45], ['wingsting', 1.6], ['siegemaw', 1.35], ['acidwing', 1.9]]) SPR[id] = A.grow(SPR[id], k);
})();
