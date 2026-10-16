// 네뷸라 워 — 명령 카드 능력(마법) 아이콘. art.js 다음, render.js 앞에서 읽힌다. NW_ART.SPR['spell@<능력 id>'] 로 등록한다.
// 14×14 종족 판(리벳 = 강철 리벳판, 마이셀 = 둥근 살판, 코러스 = 금테 청록판) 위에 그림 1개, 그림은 1px void 그림자.
// R.icon('spell@heal', me, 32) 로 그린다 — 렌더러 외곽선이 붙어 16×16 → 32px 정수 2배. 해금 연구 아이콘도 같은 그림을 쓴다.
(() => {
  const A = typeof NW_ART !== 'undefined' ? NW_ART : require('./art.js');
  const { SPR, css, mix } = A;
  const N = 14;
  const k = (T, key, f = 1) => css(T[key], f);
  const mx = (T, a, b, t) => css(mix(T[a], T[b], t));
  // 종족 판: 바탕색을 돌려준다(그림 안쪽을 지울 때 쓴다)
  const PLATE = {
    legion(P, T) {
      const bg = mx(T, 'legion-a', 'color-void', 0.7);
      P.r(0, 0, N, N, bg);
      P.r(0, 0, N, 1, mx(T, 'legion-a', 'color-void', 0.35)); P.r(0, 0, 1, N, mx(T, 'legion-a', 'color-void', 0.35));
      P.r(0, N - 1, N, 1, mx(T, 'legion-a', 'color-void', 0.85)); P.r(N - 1, 0, 1, N, mx(T, 'legion-a', 'color-void', 0.85));
      for (const [x, y] of [[1, 1], [N - 2, 1], [1, N - 2], [N - 2, N - 2]]) P.dot(x, y, mx(T, 'legion-a', 'color-void', 0.45));
      return bg;
    },
    swarm(P, T) {
      const bg = mx(T, 'swarm-a', 'color-void', 0.62);
      P.r(0, 0, N, N, bg);
      P.dither(1, N - 4, N - 2, 3, mx(T, 'swarm-a', 'color-void', 0.45));
      P.r(1, 0, N - 2, 1, mx(T, 'swarm-a', 'color-void', 0.3));
      return bg;
    },
    elysian(P, T) {
      const bg = mx(T, 'elysian-b', 'color-void', 0.74);
      P.r(0, 0, N, N, bg);
      P.r(1, 0, N - 2, 1, k(T, 'elysian-a')); P.r(1, N - 1, N - 2, 1, mx(T, 'elysian-a', 'color-void', 0.5));
      P.dot(N / 2 - 1, 1, k(T, 'elysian-a', 1.4), 2, 1);
      return bg;
    },
  };
  // 모서리 깎기(그림 뒤에): 마이셀 둥근 판 · 코러스 면취
  const CUT = {
    swarm: [[0, 0], [1, 0], [0, 1], [N - 1, 0], [N - 2, 0], [N - 1, 1], [0, N - 1], [1, N - 1], [0, N - 2], [N - 1, N - 1], [N - 2, N - 1], [N - 1, N - 2]],
    elysian: [[0, 0], [N - 1, 0], [0, N - 1], [N - 1, N - 1]],
  };
  // 그림자 먼저(+1,+1, void) → 본 그림. g(dx, dy, c) 의 c(색) 은 그림자일 때 void 로 바뀐다
  const drop = (T, fn) => { const v = k(T, 'color-void'); fn(1, 1, () => v, true); fn(0, 0, c => c, false); };
  const ring = (P, cx, cy, r0, r1, c, bg, ry) => { P.fell(cx, cy, r1, ry ? r1 * ry : r1, c); P.fell(cx, cy, r0, ry ? r0 * ry : r0, bg); };

  const ICON = {
    // ── 리벳 ──
    heal: { race: 'legion', draw(P, T) {
      drop(T, (x, y, c) => { P.r(5 + x, 2 + y, 4, 10, c(k(T, 'color-heal'))); P.r(2 + x, 5 + y, 10, 4, c(k(T, 'color-heal'))); });
      P.r(5, 2, 1, 3, k(T, 'color-glint')); P.r(2, 5, 3, 1, k(T, 'color-glint'));
      for (let i = 0; i < 5; i++) P.dot(3 + i * 2, 6 + (i & 1), mx(T, 'legion-b', 'color-void', 0.35));   // 봉합 땀
    } },
    smoke: { race: 'legion', draw(P, T) {
      drop(T, (x, y, c) => {
        P.fell(3.5 + x, 9.5 + y, 2.6, 2.3, c(k(T, 'legion-a'))); P.fell(10.5 + x, 9.5 + y, 2.6, 2.3, c(k(T, 'legion-a')));
        P.fell(7 + x, 8.5 + y, 3.4, 3, c(k(T, 'legion-a', 1.15))); P.fell(5 + x, 4.5 + y, 2.4, 2.2, c(k(T, 'legion-a', 1.3))); P.fell(9.5 + x, 5 + y, 2, 1.8, c(k(T, 'legion-a', 1.3)));
      });
      P.dot(4, 3, k(T, 'color-glint'), 2, 1); P.dot(9, 4, k(T, 'color-glint'));
      P.dither(1, 10, 12, 2, mx(T, 'legion-a', 'color-void', 0.35));
      for (let x = 1; x < 13; x += 3) P.dot(x, 12, k(T, 'legion-b'), 2, 1);   // 경계 표시
    } },
    optcloak: { race: 'legion', draw(P, T) {
      const gl = k(T, 'crystal', 1.2);
      P.fell(7, 3.5, 2, 2, gl); P.fpoly([[4, 12], [10, 12], [9, 6], [5, 6]], mx(T, 'crystal', 'color-void', 0.55));
      P.dither(4, 6, 6, 6, gl);
      P.line(4, 11, 5, 6, k(T, 'color-glint')); P.dot(6, 2, k(T, 'color-glint'));
      P.line(10, 2, 12, 4, k(T, 'legion-b')); P.line(11, 7, 12, 8, k(T, 'legion-b'));
    } },
    mark: { race: 'legion', draw(P, T, bg) {
      drop(T, (x, y, c, sh) => {
        ring(P, 7 + x, 7 + y, 3, 4.6, c(k(T, 'color-danger')), sh ? c() : bg);
        P.r(6 + x, 0 + y, 2, 4, c(k(T, 'color-danger'))); P.r(6 + x, 10 + y, 2, 3, c(k(T, 'color-danger')));
        P.r(0 + x, 6 + y, 4, 2, c(k(T, 'color-danger'))); P.r(10 + x, 6 + y, 3, 2, c(k(T, 'color-danger')));
      });
      P.fell(7, 7, 3, 3, bg); P.r(6, 6, 2, 2, k(T, 'color-fire-hot'));
    } },
    discharge: { race: 'legion', draw(P, T) {
      drop(T, (x, y, c) => P.fpoly([[8 + x, 0 + y], [3 + x, 7 + y], [6.5 + x, 7 + y], [4.5 + x, 13 + y], [11 + x, 5 + y], [7.5 + x, 5 + y], [10 + x, 0 + y]], c(k(T, 'color-shield'))));
      P.line(8, 1, 4, 6, k(T, 'color-glint'));
      for (const [x, y] of [[2, 2], [12, 9], [11, 1], [2, 11]]) P.dot(x, y, k(T, 'color-mana', 1.3));
    } },
    seeker: { race: 'legion', draw(P, T) {
      const dr = (cx, cy) => drop(T, (x, y, c, sh) => {
        P.fell(cx + x, cy + y, 3, 2.2, c(k(T, 'legion-a'))); P.r(cx - 2 + x, cy - 4 + y, 4, 1, c(k(T, 'legion-a', 0.7)));
        P.dot(cx - 0.5 + x, cy - 3 + y, c(k(T, 'legion-a', 0.7)));
        if (!sh) { P.r(cx - 2, cy - 1, 2, 1, k(T, 'legion-a', 1.4)); P.dot(cx, cy, k(T, 'color-fire-hot')); }
      });
      dr(4, 10); dr(10, 5);
      P.dither(1, 4, 4, 2, k(T, 'legion-b')); P.dither(6, 10, 4, 2, k(T, 'legion-b'));
    } },
    cleanse: { race: 'legion', draw(P, T) {
      drop(T, (x, y, c) => P.fpoly([[7 + x, 0.5 + y], [8.4 + x, 5.6 + y], [13.5 + x, 7 + y], [8.4 + x, 8.4 + y], [7 + x, 13.5 + y], [5.6 + x, 8.4 + y], [0.5 + x, 7 + y], [5.6 + x, 5.6 + y]], c(k(T, 'color-scan'))));
      P.r(6, 6, 2, 2, k(T, 'color-glint')); P.line(7, 2, 7, 5, k(T, 'color-glint'));
      P.dot(11, 2, k(T, 'color-glint')); P.dot(2, 11, k(T, 'color-scan', 1.3));
    } },
    tow: { race: 'legion', draw(P, T) {
      P.dither(4, 0, 6, 7, k(T, 'color-power'));
      drop(T, (x, y, c) => {
        P.r(2 + x, 7 + y, 10, 2, c(k(T, 'legion-a'))); P.r(2 + x, 9 + y, 2, 3, c(k(T, 'legion-a'))); P.r(10 + x, 9 + y, 2, 3, c(k(T, 'legion-a')));
        P.r(4 + x, 11 + y, 1, 1, c(k(T, 'legion-a'))); P.r(9 + x, 11 + y, 1, 1, c(k(T, 'legion-a')));
      });
      P.r(2, 7, 10, 1, k(T, 'legion-a', 1.4)); P.r(6, 8, 2, 1, k(T, 'legion-b'));
    } },
    scan: { race: 'legion', draw(P, T, bg) {
      P.dither(6, 0, 2, 7, k(T, 'color-scan'));
      drop(T, (x, y, c, sh) => ring(P, 7 + x, 9 + y, 3.8, 5.5, c(k(T, 'color-scan')), sh ? c() : bg, 0.62));
      P.fell(7, 9, 3.8, 2.36, bg);
      P.fpoly([[7, 9], [11.5, 7], [11.5, 9.6]], mx(T, 'color-scan', 'color-void', 0.3));
      P.r(6, 8, 2, 2, k(T, 'color-glint'));
    } },
    junkdrop: { race: 'legion', draw(P, T) {
      P.fell(7, 12, 5.5, 1.3, mx(T, 'legion-b', 'color-void', 0.45));
      drop(T, (x, y, c) => P.fpoly([[7 + x, 2 + y], [11 + x, 6 + y], [7 + x, 10 + y], [3 + x, 6 + y]], c(k(T, 'legion-a'))));
      P.fpoly([[7, 2], [11, 6], [7, 6]], k(T, 'legion-a', 1.3)); P.line(4, 6, 10, 6, k(T, 'legion-b'));
      P.line(2, 0, 2, 3, k(T, 'legion-a', 1.3)); P.line(12, 0, 12, 2, k(T, 'legion-a', 1.3));
      P.dot(1, 11, k(T, 'legion-b')); P.dot(12, 10, k(T, 'legion-b'));
    } },
    repairdrones: { race: 'legion', draw(P, T) {
      P.dither(2, 11, 10, 2, k(T, 'color-heal'));                                               // 아래 수리 불빛
      const dr = (cx, cy) => drop(T, (x, y, c, sh) => {
        P.r(cx - 3 + x, cy + y, 6, 1, c(k(T, 'legion-a', 0.8)));                                 // 회전익 팔
        P.fell(cx + x, cy + 1 + y, 1.8, 1.4, c(k(T, 'legion-a', 1.15)));
        if (!sh) P.dot(cx, cy + 2, k(T, 'color-heal', 1.3));
      });
      dr(4, 3); dr(10, 5);
      P.line(4, 5, 6, 10, k(T, 'color-heal')); P.line(10, 7, 9, 10, k(T, 'color-heal'));      // 용접 빔
      P.dot(6, 10, k(T, 'color-glint')); P.dot(9, 10, k(T, 'color-glint')); P.dot(7, 9, k(T, 'color-heal', 1.4));
    } },
    // ── 마이셀 ──
    spores: { race: 'swarm', draw(P, T) {
      const orb = (cx, cy, r) => { drop(T, (x, y, c) => P.fell(cx + x, cy + y, r, r, c(k(T, 'color-gas')))); P.dot(cx - r * 0.5, cy - r * 0.5, k(T, 'color-glint')); P.dot(cx + 0.3, cy + 0.3, mx(T, 'color-gas', 'color-void', 0.45)); };
      orb(8, 4.5, 3); orb(4, 9.5, 2.5); orb(10, 10, 2);
      P.dot(2, 3, k(T, 'color-gas')); P.dot(12, 6, k(T, 'color-gas'));
    } },
    mat: { race: 'swarm', draw(P, T) {
      drop(T, (x, y, c) => {
        P.fell(7 + x, 10 + y, 6, 2.4, c(k(T, 'swarm-a', 1.3)));
        P.line(3 + x, 9 + y, 2 + x, 4 + y, c(k(T, 'swarm-a', 1.3))); P.line(7 + x, 8 + y, 7 + x, 3 + y, c(k(T, 'swarm-a', 1.3))); P.line(11 + x, 9 + y, 12 + x, 5 + y, c(k(T, 'swarm-a', 1.3)));
      });
      P.dither(3, 9, 8, 2, k(T, 'color-gas'));
      for (const [x, y] of [[2, 3], [7, 2], [12, 4]]) P.dot(x, y, k(T, 'color-gas'));
    } },
    rot: { race: 'swarm', draw(P, T) {
      const cl = mx(T, 'color-gas', 'swarm-a', 0.45);
      drop(T, (x, y, c) => { P.fell(4.5 + x, 6 + y, 3, 3, c(cl)); P.fell(9.5 + x, 5 + y, 3, 3, c(cl)); P.fell(7 + x, 8 + y, 4.5, 2.6, c(cl)); });
      P.fell(9, 4, 1.4, 1, k(T, 'color-gas')); P.fell(4, 5, 1, 1, k(T, 'color-gas'));
      P.dot(5, 7, k(T, 'color-void'), 2, 1); P.dot(8, 7, k(T, 'color-void'), 2, 1);
      for (const [x, y] of [[4, 11], [7, 12], [10, 11]]) P.dot(x, y, k(T, 'color-gas'), 1, 2);
    } },
    sprout: { race: 'swarm', draw(P, T) {
      P.r(1, 11, 12, 2, k(T, 'swarm-b')); P.dither(1, 11, 12, 1, k(T, 'swarm-b', 1.3));
      drop(T, (x, y, c) => {
        P.r(6 + x, 5 + y, 2, 6, c(mx(T, 'color-gas', 'color-void', 0.3)));
        P.fpoly([[7 + x, 9 + y], [2 + x, 6 + y], [3 + x, 9 + y]], c(mx(T, 'color-gas', 'color-void', 0.15)));
        P.fpoly([[7 + x, 8 + y], [12 + x, 5 + y], [11 + x, 8 + y]], c(mx(T, 'color-gas', 'color-void', 0.15)));
        P.fell(7 + x, 3.5 + y, 2.6, 2.6, c(k(T, 'swarm-a', 1.3)));
      });
      P.dot(6, 3, k(T, 'color-gas'), 2, 1); P.dot(3, 12, k(T, 'color-glint'), 2, 1);
    } },
    // ── 코러스 ──
    mindstorm: { race: 'elysian', draw(P, T) {
      drop(T, (x, y, c) => { P.fell(4.5 + x, 5.5 + y, 3, 2.5, c(k(T, 'color-storm'))); P.fell(9 + x, 4.5 + y, 3.4, 3, c(k(T, 'color-storm'))); P.r(2 + x, 5 + y, 10, 3, c(k(T, 'color-storm'))); });
      P.fell(8, 3, 1.6, 1, k(T, 'color-storm-hot'));
      drop(T, (x, y, c) => P.fpoly([[8 + x, 7 + y], [4.5 + x, 11 + y], [7 + x, 11 + y], [5.5 + x, 14 + y], [10 + x, 9 + y], [7.5 + x, 9 + y], [9.5 + x, 7 + y]], c(k(T, 'color-storm-hot'))));
    } },
    amplify: { race: 'elysian', draw(P, T) {
      const ch = (y, col) => drop(T, (x, yy, c) => P.fpoly([[2 + x, y + 4 + yy], [7 + x, y + yy], [12 + x, y + 4 + yy], [12 + x, y + 6.5 + yy], [7 + x, y + 2.5 + yy], [2 + x, y + 6.5 + yy]], c(col)));
      ch(6, k(T, 'elysian-b')); ch(2, k(T, 'elysian-b', 1.4));
      P.dot(6, 2, k(T, 'elysian-a', 1.4), 2, 1);
    } },
    stasis: { race: 'elysian', draw(P, T) {
      drop(T, (x, y, c) => P.fpoly([[7 + x, 1 + y], [12 + x, 4 + y], [12 + x, 10 + y], [7 + x, 13 + y], [2 + x, 10 + y], [2 + x, 4 + y]], c(k(T, 'elysian-b', 1.25))));
      P.fpoly([[7, 3], [10, 5], [10, 9], [7, 11], [4, 9], [4, 5]], mx(T, 'elysian-b', 'color-void', 0.4));
      P.dither(4, 4, 6, 7, k(T, 'elysian-b'));
      P.fell(7, 7, 1.4, 1.4, k(T, 'elysian-a', 1.3));
      P.line(3, 4, 6, 2, k(T, 'color-glint'));
    } },
    crystallize: { race: 'elysian', draw(P, T) {
      const sh = (pts, half) => { drop(T, (x, y, c) => P.fpoly(pts.map(p => [p[0] + x, p[1] + y]), c(k(T, 'elysian-b', 1.3)))); P.fpoly(half, mx(T, 'elysian-b', 'color-void', 0.3)); };
      sh([[3, 6], [5, 9], [3, 12], [1, 9]], [[3, 6], [5, 9], [3, 12]]);
      sh([[11, 5], [13, 8], [11, 11], [9, 8]], [[11, 5], [13, 8], [11, 11]]);
      sh([[7, 1], [10, 6.5], [7, 13], [4, 6.5]], [[7, 1], [10, 6.5], [7, 13]]);
      P.line(6, 3, 5, 6, k(T, 'color-glint'));
    } },
    probe: { race: 'elysian', draw(P, T) {
      const ray = k(T, 'elysian-b', 1.4);
      P.r(6, 0, 2, 2, ray); P.r(6, 12, 2, 2, ray); P.r(0, 6, 2, 2, ray); P.r(12, 6, 2, 2, ray);
      for (const [x, y] of [[2, 2], [11, 2], [2, 11], [11, 11]]) P.dot(x, y, ray);
      drop(T, (x, y, c) => P.fpoly([[7 + x, 3 + y], [11 + x, 7 + y], [7 + x, 11 + y], [3 + x, 7 + y]], c(k(T, 'elysian-a'))));
      P.fpoly([[7, 3], [11, 7], [7, 7]], k(T, 'elysian-a', 1.35));
      P.r(6, 6, 2, 2, k(T, 'elysian-b', 1.5));
    } },
    prism: { race: 'elysian', draw(P, T) {
      P.line(0, 8, 5, 7, k(T, 'color-glint'));
      drop(T, (x, y, c) => P.fpoly([[7 + x, 1.5 + y], [12 + x, 11.5 + y], [2 + x, 11.5 + y]], c(k(T, 'elysian-a', 1.3))));
      P.fpoly([[7, 1.5], [12, 11.5], [7, 11.5]], mx(T, 'elysian-b', 'color-void', 0.15));
      P.line(9, 6, 13, 4, k(T, 'color-danger')); P.line(10, 8, 13, 8, k(T, 'color-gas')); P.line(9, 10, 13, 12, k(T, 'color-shield'));
    } },
    chorus: { race: 'elysian', draw(P, T, bg) {
      drop(T, (x, y, c, sh) => ring(P, 7 + x, 7 + y, 4.8, 6, c(k(T, 'color-shield')), sh ? c() : bg));
      P.fell(7, 7, 4.8, 4.8, bg);
      ring(P, 7, 7, 2, 3.2, k(T, 'elysian-b', 1.25), bg);
      P.r(6, 6, 2, 2, k(T, 'elysian-a', 1.3)); P.dot(3, 3, k(T, 'color-glint'));
    } },
    echo: { race: 'elysian', draw(P, T, bg) {
      const wv = k(T, 'elysian-b', 1.25);
      ring(P, 1, 7, 7.5, 8.8, wv, bg); ring(P, 1, 7, 4.5, 5.8, wv, bg);
      P.r(1, 1, 2, 12, bg); P.r(0, 0, 1, N, mx(T, 'elysian-b', 'color-void', 0.74));
      drop(T, (x, y, c) => P.fpoly([[13 + x, 3 + y], [13 + x, 5.5 + y], [10 + x, 7 + y], [13 + x, 8.5 + y], [13 + x, 11 + y], [7.5 + x, 7 + y]], c(k(T, 'color-mana', 1.2))));
    } },
  };
  for (const id in ICON) {
    const ic = ICON[id];
    SPR['spell@' + id] = { w: N, h: N, px: 1, ox: N / 2, oy: N, race: ic.race, glow: [], icon: true,
      draw(P, pal, f) {
        const T = f.T || pal.T, bg = PLATE[ic.race](P, T), cx = P.ctx;
        cx.save(); cx.beginPath(); cx.rect(0, 0, N, N); cx.clip();   // 그림자가 판 밖으로 나가지 않게
        ic.draw(P, T, bg); cx.restore();
        for (const [x, y] of CUT[ic.race] || []) P.clear(x, y, 1, 1);
      } };
  }
  if (typeof module !== 'undefined') module.exports = { ICONS: Object.keys(ICON) };
})();
