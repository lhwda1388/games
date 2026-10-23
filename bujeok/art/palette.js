// 부적난무 — 픽셀아트 공용 팔레트와 도구. 문자 1개 = 색 1개, '.' = 투명. 붉은 계열은 위험 예고 전용이라 넣지 않는다(분홍 볼 z까지만).
const BJ_ART_KIT = (function bjArtKit() {
  const PAL = {
    k: 0x1a1420, K: 0x3a2e3e,
    '&': 0x6e3f3a, '*': 0x94584c, // 팥색 그림자·밝은 면(채도 낮은 검붉은 갈색, 박씨부인의 팥 주머니)
    s: 0xf8dcc0, t: 0xecb994, T: 0xc4876a, z: 0xf2a0a0,
    a: 0x2b2633, A: 0x4d4560, j: 0x6a6080,
    r: 0xf6f1e7, R: 0xd6cdbd, x: 0xa39985,
    i: 0x3b5694, I: 0x5f7fc4, U: 0x263763, v: 0x9fb6e8,
    g: 0x5f9a4e, G: 0x3e6b34, h: 0x94c870, H: 0x2a4a24,
    y: 0xf2cb4c, Y: 0xbf8f2c, e: 0xfff0a0,
    o: 0xe8893a, O: 0xb0581f, l: 0xf7b46a, L: 0x7a3a16,
    w: 0xffffff, W: 0xe6eef4, p: 0xc8dcec, P: 0x8ea8c0, q: 0x5d7590,
    n: 0xf1e2b4, N: 0xc2a868, c: 0x8a5a3a, C: 0x5a3a26,
    m: 0x7fd6c0, M: 0x3f9a86, b: 0x7a4fa0, u: 0x4a5fa8,
    B: 0xa47cc8, V: 0x523070, // 보라 밝은 면·그림자(외눈 도깨비)
    f: 0xc4bcd4, F: 0x8c84a4, // 회보라(잡귀)
    Z: 0xd07890, // 분홍 그림자(회복 복숭아)
    '@': 0x3d3a8c, '$': 0x5f5bbd, // 남보라 쾌자·밝은 면(연화)
    d: 0x2a2820, D: 0x221f19, E: 0x353126, S: 0x4a4638, Q: 0x5e594a, // 서낭당 흙길·돌
    X: 0x34204a, // 짙은 보라 그림자(두억시니)
    J: 0x857545, // 누런 그림자(창귀, 죽순)
    1: 0x2b2a2f, 2: 0x222126, 3: 0x37353c, 4: 0x4a4752, 5: 0x625e6b, // 도깨비 고개 바위 바닥·제단 돌
    6: 0x1e2620, 7: 0x171e19, 8: 0x27322a, 9: 0x3b4a30, 0: 0x55663c, // 여우 숲 대숲 바닥·댓잎
  };
  // 왼쪽 반쪽 줄을 좌우로 뒤집어 붙이고, overrides({ 'x,y': ch })로 비대칭 부분을 덧칠한다
  function sym(half, over) {
    const rows = half.map(l => (l + [...l].reverse().join('')).split(''));
    for (const [k, ch] of Object.entries(over || {})) { const [x, y] = k.split(',').map(Number); rows[y][x] = ch; }
    return rows.map(r => r.join(''));
  }
  // 덧칠 블록 → overrides. '.'은 건너뛴다
  function ov(block, x0, y0) {
    const o = {};
    block.forEach((l, dy) => [...l].forEach((ch, dx) => { if (ch !== '.') o[`${x0 + dx},${y0 + dy}`] = ch; }));
    return o;
  }
  return { PAL, sym, ov };
})();
if (typeof module !== 'undefined') module.exports = BJ_ART_KIT;
