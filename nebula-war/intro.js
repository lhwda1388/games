// 네뷸라 워 — 연출 화면: 타이틀 인트로 · 대전 시작(VS) 화면 · 메뉴 종족 카드 무대.
// 성운·별·로고는 저해상도 칸(CSS 2~3px)으로, 유닛은 새 1:1 스프라이트(R.spriteFull)를 정수 배율로 — 인트로·메뉴 배경은 화면 px 버퍼에 변환 ×PX,
// 무대(VS·로비)는 버퍼 = 아트 1px 에 CSS 정수 확대. image-rendering: pixelated. 색은 전부 CSS 토큰에서 읽는다.
// sim 과 무관(결정론 밖). 연출용 난수는 고정 시드 해시라 매번 같은 그림.
//   P = NW_PRESENT.create({ R, A, D, mapPreview })
//   P.title('full'|'short'|'still') → Promise   첫 방문 9초 / 재방문 1.6초 / 감소된 움직임: 정지 로고 + 아무 키 대기
//   P.versus({ players, me, random, map, resume, label, minMs }) → { progress(f), ready() → Promise, close() }   players = 명단, random = 무작위 종족 플레이어 번호들
//   P.backdrop(cv) · P.logo(cv, cssW) · P.squad(cv, owner, flip) · P.frame9(token) · P.mapBig(m, id) · P.textCanvas(...)  메뉴 화면 재료
const NW_PRESENT = (() => {
  const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]; // 4×4 Bayer 디더
  const hash = (x, y, s) => { // murmur3 마무리 섞기 — 값 노이즈에 직선 무늬가 생기지 않게
    let h = Math.imul(x | 0, 0x27d4eb2d) + Math.imul(y | 0, 0x165667b1) + Math.imul(s | 0, 0x9e3779b1) | 0;
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296; };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // 종족 연출 설정(자체 문구). hero/side = 대전 시작 화면·로비 자리 카드 무대(영웅 가운데, 호위 둘은 뒷줄).
  const RACE = {
    legion: {
      color: '--race-legion', rim: '--legion-b', dark: 0.62, trail: '--color-fire', trail2: '--color-fire-hot', pick: 'pickLegion',
      hero: 'bastion', side: ['trooper', 'trooper'],   // 새 아트의 하운드는 바스티온만큼 커서 영웅을 가린다 — 보병 둘이 호위
      line: '주운 고철로 싸운다 — 부서진 것도 다시 주워 쓴다.',
      cap: '녹슨 리벳의 선단',
    },
    swarm: {
      color: '--race-swarm', rim: '--race-swarm', dark: 0.6, trail: '--race-swarm', trail2: '--color-gas', pick: 'pickSwarm',
      hero: 'behemoth', side: ['skitter', 'spinewyrm'],
      line: '하나의 균사망이 자라난다 — 쓰러진 것은 모두 양분이 된다.',
      cap: '썩어서 자라는 군락',
    },
    elysian: {
      color: '--race-elysian', rim: '--elysian-a', dark: 0.25, trail: '--elysian-a', trail2: '--color-glint', pick: 'pickElysian',
      hero: 'arcwalker', side: ['oathblade', 'oathblade'],
      line: '모일수록 맑게 울린다 — 조율 기둥의 레이 라인이 닿는 곳에만 선다.',
      cap: '결정의 합창',
    },
  };

  function create({ R, A, D, mapPreview }) {
    const root = document.documentElement;
    const tok = n => getComputedStyle(root).getPropertyValue(n).trim();
    const RM = matchMedia('(prefers-reduced-motion: reduce)');
    // 토큰(oklch 등) → [r,g,b]: 1px 캔버스에 칠해 읽는다(브라우저가 색 공간 변환)
    const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const rgbCache = new Map();
    function rgb(name) {
      let v = rgbCache.get(name); if (v) return v;
      probe.clearRect(0, 0, 1, 1); probe.fillStyle = '#000'; probe.fillStyle = tok(name) || '#000'; probe.fillRect(0, 0, 1, 1);
      const d = probe.getImageData(0, 0, 1, 1).data; v = [d[0], d[1], d[2]]; rgbCache.set(name, v); return v;
    }
    const css = (c, a = 1) => `rgb(${c[0]} ${c[1]} ${c[2]} / ${a})`;
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const sfx = (name, vol = 1) => { if (A) Promise.resolve(A.unlock()).then(() => A.play(name, vol)); };
    const air = t => !!((D.units[t] || {}).air);
    const ART = typeof NW_ART !== 'undefined' ? NW_ART : null;   // 아트 정의(포즈 키·프레임 수·포구)

    // ---------- 공용 재료 ----------
    // 성운: 값 노이즈 fbm + 사선 은하띠, 4단계 디더 양자화. 보라/청록 두 색조를 저주파 노이즈로 가른다.
    function nebula(W, H, seed) {
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d'), img = x.createImageData(W, H), d = img.data;
      const vn = (px, py, s) => {
        const xi = Math.floor(px), yi = Math.floor(py), u = smooth(px - xi), v = smooth(py - yi);
        const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), cc = hash(xi, yi + 1, s), dd = hash(xi + 1, yi + 1, s);
        return (a + (b - a) * u) + ((cc + (dd - cc) * u) - (a + (b - a) * u)) * v;
      };
      const fbm = (px, py) => { let s = 0, amp = 0.5, f = 1 / 46, n = 0; for (let o = 0; o < 4; o++) { s += vn(px * f, py * f, seed + o) * amp; n += amp; amp *= 0.5; f *= 2; } return s / n; };
      const V = ['--nebula-v1', '--nebula-v2', '--nebula-v3'].map(rgb), Tl = ['--nebula-t1', '--nebula-t2', '--nebula-t3'].map(rgb), core = rgb('--nebula-core');
      for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
        const y0 = H * 0.52 - (px - W / 2) * 0.32, dist = (py - y0) / (H * 0.46), band = Math.max(0, 1 - dist * dist);
        const n = fbm(px, py);
        let v = n * 0.9 + band * 0.5 - 0.3 + (B4[(py & 3) * 4 + (px & 3)] / 16 - 0.5) * 0.12;
        let col = null;
        // 색조: 저주파 노이즈 두 겹, 경계는 Bayer 디더로 섞는다(딱딱한 경계선 없음)
        const hv = vn(px / 110, py / 110, seed + 9) * 0.7 + vn(px / 40, py / 40, seed + 11) * 0.3;
        const set = hv + (B4[((py + 1) & 3) * 4 + ((px + 2) & 3)] / 16 - 0.5) * 0.22 < 0.5 ? V : Tl;
        if (v > 0.74) col = core; else if (v > 0.6) col = set[2]; else if (v > 0.48) col = set[1]; else if (v > 0.38) col = set[0];
        if (!col) continue;
        const i = (py * W + px) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
      }
      x.putImageData(img, 0, 0); return c;
    }
    function stars(W, H, seed, n) {
      const out = [];
      for (let i = 0; i < n; i++) out.push({ x: hash(i, 1, seed) * W, y: hash(i, 2, seed) * H, z: hash(i, 3, seed) < 0.6 ? 0 : hash(i, 4, seed) < 0.75 ? 1 : 2, tw: hash(i, 5, seed) * 6.28 });
      return out;
    }
    function drawStars(x, list, W, ms, drift) {
      const dim = css(rgb('--star-dim')), hi = css(rgb('--color-glint')), sp = [1.5, 4, 9];
      for (const s of list) {
        const px = Math.floor(((s.x - drift * sp[s.z] * ms / 1000) % W + W) % W), py = Math.floor(s.y);
        const on = s.z === 0 ? 1 : 0.55 + 0.45 * Math.sin(s.tw + ms / (s.z === 2 ? 260 : 600));
        x.fillStyle = s.z === 0 ? dim : hi; x.globalAlpha = s.z === 0 ? 0.7 : on;
        x.fillRect(px, py, 1, 1);
        if (s.z === 2 && on > 0.85) { x.globalAlpha = 0.5; x.fillRect(px - 1, py, 3, 1); x.fillRect(px, py - 1, 1, 3); }
      }
      x.globalAlpha = 1;
    }
    // 실루엣: 1:1 스프라이트(자세 pose)를 어둡게 덮고 위쪽 가장자리에 종족색 림 라이트. k = 정수 배율(버퍼 px / 아트 px).
    // 스프라이트에 플레이어 색이 없으므로 owner 는 캐시 키에 들어가지 않는다. 반환 캔버스에 발밑 기준점 ox·oy(배율 적용, 반전 반영 — 지상은 불투명 맨 아래 줄)와 포구 mz 를 붙인다.
    const silCache = new Map();
    function silhouette(type, owner, k, flip, rimName, dark, pose = '') {
      const key = [type, pose, k, flip ? 1 : 0, rimName, dark].join('|');
      let c = silCache.get(key); if (c) return c;
      const s = R.spriteFull(type, pose), w = s.w, h = s.h, def = ART && ART.def(type);
      const b = document.createElement('canvas'); b.width = w; b.height = h;
      const x = b.getContext('2d', { willReadFrequently: true });
      if (flip) { x.translate(w, 0); x.scale(-1, 1); }
      x.drawImage(s.cv, 0, 0); x.setTransform(1, 0, 0, 1, 0, 0);
      const img = x.getImageData(0, 0, w, h), d = img.data;
      let fy = h; while (fy > 0 && !d.subarray((fy - 1) * w * 4, fy * w * 4).some((v, i) => (i & 3) === 3 && v)) fy--;   // 불투명 맨 아래 줄 + 1
      if (rimName || dark) {
        const vd = rgb('--color-void'), rim = rimName ? rgb(rimName) : null, fw = flip ? -1 : 1;
        const A_ = (px, py) => px < 0 || py < 0 || px >= w || py >= h ? 0 : d[(py * w + px) * 4 + 3];
        const rimMask = new Uint8Array(w * h);
        if (rim) for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) if (A_(px, py) && (!A_(px, py - 1) || !A_(px + fw, py - 1))) rimMask[py * w + px] = 1;
        for (let i = 0; i < w * h; i++) {
          if (!d[i * 4 + 3]) continue;
          const m = rimMask[i] ? rim : vd, t = rimMask[i] ? 0.85 : dark;
          d[i * 4] += (m[0] - d[i * 4]) * t; d[i * 4 + 1] += (m[1] - d[i * 4 + 1]) * t; d[i * 4 + 2] += (m[2] - d[i * 4 + 2]) * t;
        }
        x.putImageData(img, 0, 0);
      }
      if (k > 1) { c = document.createElement('canvas'); c.width = w * k; c.height = h * k; const y = c.getContext('2d'); y.imageSmoothingEnabled = false; y.drawImage(b, 0, 0, w * k, h * k); } else c = b;
      c.ox = Math.round((flip ? w - s.ox : s.ox) * k);
      c.oy = air(type) ? Math.round(s.oy * k) : (fy - 1) * k;   // 발밑: 지상 = 불투명 맨 아래 줄(다리 긴 보행기도 원판 위에 선다), 공중 = 정의 기준점
      const mz = def && (/^1/.test(pose) ? def.muzzleSE : /^0/.test(pose) || !pose ? def.muzzle : null);
      if (mz) c.mz = [Math.round(((flip ? w - 1 - mz[0] : mz[0]) + 0.5) * k), Math.round((mz[1] + 0.5) * k)];
      silCache.set(key, c); return c;
    }
    // 정수 배율 스프라이트 원색(좌우 반전 가능)
    // 캔버스의 불투명 픽셀 범위(위·오른쪽 끝) — 무대 위 물음표 자리
    function visBox(cv) {
      const W = cv.width, H = cv.height, d = cv.getContext('2d').getImageData(0, 0, W, H).data;
      let y0 = H, x1 = 0; for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) if (d[(y * W + xx) * 4 + 3]) { if (y < y0) y0 = y; if (xx > x1) x1 = xx; }
      return { y0: y0 === H ? 0 : y0, x1 };
    }
    function big(type, owner, k, flip, pose = '') { return silhouette(type, owner, k, flip, null, 0, pose); }
    // 이동 자세: 진행 방향(동 0 / 서 4 = 동쪽 그림 반전)의 move 프레임을 120ms 마다 순환. ph = 유닛마다 다른 발 위상
    const movePose = (type, dirE, ms, ph = 0) => {
      const n = ((ART && ART.def(type) || {}).frames || {}).move || 0;
      return n ? ART.poseKey(dirE ? 0 : 4, 'move', (Math.floor(ms / 120) + ph) % n) : '';
    };
    // 옛 배율 k(버퍼 px / 반해상도 px) → 새 아트 배율(아트 1px = 반해상도 ½px). U = 저해상도 한 칸의 버퍼 px
    const artK = (k, U) => Math.max(1, Math.round(k * U / 2));

    // 픽셀 글자: 디스플레이 폰트로 작게 찍고 임계 처리 → 마스크(빈 테두리 잘라냄)
    function pixelText(text, fs, spacing) {
      const c = document.createElement('canvas'), x = c.getContext('2d', { willReadFrequently: true });
      const font = `700 ${fs}px ${tok('--font-display')}`;
      x.font = font; if ('letterSpacing' in x) x.letterSpacing = spacing + 'px';
      const w = Math.ceil(x.measureText(text).width) + 8, h = Math.ceil(fs * 1.4) + 8;
      c.width = w; c.height = h; x.font = font; if ('letterSpacing' in x) x.letterSpacing = spacing + 'px';
      x.fillStyle = '#fff'; x.textBaseline = 'alphabetic'; x.fillText(text, 4, Math.round(fs * 1.05) + 4);
      const d = x.getImageData(0, 0, w, h).data;
      let x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let py = 0; py < h; py++) for (let px = 0; px < w; px++) if (d[(py * w + px) * 4 + 3] >= 120) { if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
      if (x1 < 0) return { w: 1, h: 1, m: new Uint8Array(1) };
      const W = x1 - x0 + 1, H = y1 - y0 + 1, m = new Uint8Array(W * H);
      for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) m[py * W + px] = d[((py + y0) * w + px + x0) * 4 + 3] >= 120 ? 1 : 0;
      return { w: W, h: H, m };
    }
    // 마스크 → 색칠한 로고 캔버스: 세로 4밴드(경계는 체커 디더) + 1px 외곽선 + 아래쪽 2px 압출
    function paintLogo(t, bands) {
      const W = t.w + 2, H = t.h + 4, c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d'), img = x.createImageData(W, H), d = img.data;
      const put = (px, py, col) => { if (px < 0 || py < 0 || px >= W || py >= H) return; const i = (py * W + px) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; };
      const M = (px, py) => px >= 0 && py >= 0 && px < t.w && py < t.h && t.m[py * t.w + px];
      const sh = rgb('--logo-shadow'), vd = rgb('--color-void'), cols = bands.map(rgb);
      for (let py = -1; py <= t.h + 3; py++) for (let px = -1; px <= t.w; px++) { // 외곽선 + 압출
        if (M(px, py)) continue;
        const ext = M(px, py - 1) || M(px, py - 2) || M(px - 1, py - 2);
        const edge = M(px - 1, py) || M(px + 1, py) || M(px, py - 1) || M(px, py + 1);
        if (ext) put(px + 1, py + 1, sh); else if (edge) put(px + 1, py + 1, vd);
      }
      for (let py = 0; py < t.h; py++) {
        const f = py / Math.max(1, t.h - 1) * (cols.length - 1);
        for (let px = 0; px < t.w; px++) {
          if (!M(px, py)) continue;
          let bi = Math.floor(f); const fr = f - bi;
          if (fr > 0.62 && ((px + py) & 1)) bi++; // 밴드 경계 디더
          put(px + 1, py + 1, cols[clamp(bi, 0, cols.length - 1)]);
        }
      }
      x.putImageData(img, 0, 0); return c;
    }

    // ---------- 1. 타이틀 인트로 ----------
    const intro = document.getElementById('intro'), icv = document.getElementById('intro-cv'), isub = document.getElementById('intro-sub');
    const icap = document.getElementById('intro-cap'), ihint = document.getElementById('intro-hint');
    // 인트로 편대: [종류, 배율 k(반해상도 기준 — 새 아트는 artK), 발밑 높이(화면 비율), 지연(초), 속도 배율]. 지상군은 아래 띠를 행군, 공중은 위.
    const FLY = {
      legion: { dir: 1, units: [['strider', 2, 0.79, 0.02, 1], ['bastion', 2, 0.92, 0.1, 0.96], ['trooper', 2, 0.86, 0.2, 1.02], ['trooper', 2, 0.94, 0.27, 1], ['trooper', 2, 0.82, 0.33, 0.99],
        ['phantom', 2, 0.32, 0.12, 1.12], ['phantom', 2, 0.46, 0.24, 1.1]] },
      swarm: { dir: -1, units: [['behemoth', 2.67, 0.93, 0.08, 0.95], ['spinewyrm', 2, 0.8, 0, 1], ['spinewyrm', 2, 0.95, 0.15, 1], ['skitter', 2, 0.85, 0.03, 1.06], ['skitter', 2, 0.9, 0.1, 1.05], ['skitter', 2, 0.79, 0.19, 1.04],
        ['wingsting', 2, 0.32, 0.05, 1.1], ['wingsting', 2, 0.45, 0.2, 1.08]] },
      elysian: { dir: 1, units: [['ark', 1.4, 0.52, 0, 0.94], ['skiff', 1.4, 0.3, 0.18, 1.08], ['skiff', 1.4, 0.66, 0.3, 1.06], ['arcwalker', 2, 0.93, 0.12, 1], ['oathblade', 2, 0.86, 0.22, 1.02], ['oathblade', 2, 0.95, 0.3, 1]] },
    };
    // 메뉴 배경의 먼 함대(공중만 — 하늘을 지나간다): [종류, 높이, 지연, 속도, 배율(PX 3 기준 — 주력함은 2, 호위는 1: 원근)]
    const BACK = {
      legion: { dir: 1, units: [['dreadnought', 0.55, 0, 1, 2], ['phantom', 0.36, 0.25, 1.5, 1], ['phantom', 0.46, 0.4, 1.55, 1], ['phantom', 0.3, 0.55, 1.45, 1]] },
      swarm: { dir: -1, units: [['wingsting', 0.5, 0, 1.25, 2], ...[1, 2, 3, 4, 5, 6].map(i => ['wingsting', 0.28 + (i % 3) * 0.1 + hash(i, 7, 3) * 0.04, 0.05 * i + hash(i, 8, 3) * 0.1, 1.2 + hash(i, 9, 3) * 0.3, 1])] },
      elysian: { dir: 1, units: [['ark', 0.5, 0, 0.9, 2], ['skiff', 0.3, 0.3, 1.3, 1], ['skiff', 0.7, 0.45, 1.35, 1], ['skiff', 0.36, 0.6, 1.25, 1]] },
    };
    // 종족, 시작, 끝(초). Task 9: 돌격처럼 보이던 통과(종족당 ~2.3초에 화면 전체)를 행군으로 — 지상군은 화면 가장자리에서 들어와
    // 가운데쯤까지 일정한 걸음으로 걷고 끝에서 옅어진다(다음 종족이 반대편에서 들어옴). 공중은 화면을 가로지르되 일정한 속도로.
    const PASS = [['legion', 0.6, 3.5], ['swarm', 3.0, 5.9], ['elysian', 5.4, 8.3]];
    const LOGO_T = 7.9, FULL_END = 11.2, SHORT_END = 1.5, FADE = 0.6, MARCH = 0.4;   // MARCH: 지상군 걷는 거리(화면 폭 비율)

    function title(kind) {
      return new Promise(resolve => {
        const still = kind === 'still', short = kind === 'short';
        let PX = 3, W = 0, H = 0, neb = null, st = null, logo = null, logoCv = null, LS = 2, t0 = 0, raf = 0, done = false, stung = false, lastCap = '';
        const parts = [];
        const x = icv.getContext('2d');
        function layout() {
          PX = innerWidth >= 1200 ? 3 : 2;
          W = Math.ceil(innerWidth / PX); H = Math.ceil(innerHeight / PX);
          // 버퍼 = 화면 px(새 1:1 아트를 원본 픽셀로). 성운·별·로고 등 옛 저해상도 그림은 변환 ×PX 로 같은 모양
          icv.width = W * PX; icv.height = H * PX; icv.style.width = W * PX + 'px'; icv.style.height = H * PX + 'px';
          neb = nebula(W + 64, H, 41); st = stars(W, H, 7, Math.round(W * H / 260));
          // 로고: 화면 폭의 64%(최대 960px)를 채우는 크기. 넓으면 로고 한 칸 = 2 저해상도 칸.
          LS = innerWidth >= 900 ? 2 : 1;
          const target = Math.min(innerWidth * (innerWidth >= 900 ? 0.64 : 0.86), 960) / (PX * LS);
          const m0 = pixelText('NEBULA WAR', 20, 1), fs = clamp(Math.round(20 * target / m0.w), 12, 64);
          logo = pixelText('NEBULA WAR', fs, Math.max(1, Math.round(fs / 14)));
          logoCv = paintLogo(logo, ['--logo-1', '--logo-2', '--logo-3', '--logo-4']);
          const lw = logoCv.width * LS, lh = logoCv.height * LS, lx = Math.floor((W - lw) / 2), ly = Math.floor(H * 0.42 - lh / 2);
          logo.at = [lx, ly, lw, lh];
          isub.style.top = (ly + lh) * PX + 20 + 'px';
          x.imageSmoothingEnabled = false;
        }
        function drawLogo(ms, appear) { // appear: 0..1 형성 진행, 그 뒤 반짝 sweep
          const [lx, ly] = logo.at, gl = rgb('--color-glint');
          if (appear >= 1) x.drawImage(logoCv, lx, ly, logoCv.width * LS, logoCv.height * LS);
          else {
            // 픽셀 하나하나가 왼→오 물결 + 난수 순서로 나타난다(나타나는 순간 하얗게)
            const lc = logoCv.getContext('2d'), src = lc.getImageData(0, 0, logoCv.width, logoCv.height).data, w = logoCv.width;
            for (let py = 0; py < logoCv.height; py++) for (let px = 0; px < w; px++) {
              const i = (py * w + px) * 4; if (!src[i + 3]) continue;
              const at = px / w * 0.55 + hash(px, py, 5) * 0.4;
              if (appear < at) continue;
              const fresh = appear - at < 0.06;
              x.fillStyle = fresh ? css(gl) : `rgb(${src[i]} ${src[i + 1]} ${src[i + 2]})`;
              const fall = fresh ? -LS : 0;
              x.fillRect(lx + px * LS, ly + py * LS + fall, LS, LS);
            }
          }
          return gl;
        }
        function glint(p) { // 사선 하이라이트가 로고를 훑는다
          if (p <= 0 || p >= 1) return;
          const [lx, ly] = logo.at, gl = css(rgb('--color-glint'), 0.9), w = logo.w, pos = -logo.h + p * (w + logo.h * 2);
          x.fillStyle = gl;
          for (let py = 0; py < logo.h; py++) for (let px = Math.max(0, Math.floor(pos - py * 0.6)); px < Math.min(w, pos - py * 0.6 + 3); px++)
            if (logo.m[py * w + px]) x.fillRect(lx + (px + 1) * LS, ly + (py + 1) * LS, LS, LS);
        }
        function caption(race) {
          if (race === lastCap) return; lastCap = race;
          if (!race) { icap.classList.remove('is-on'); return; }
          icap.querySelector('b').textContent = D.races[race].name; icap.querySelector('span').textContent = RACE[race].cap;
          icap.style.setProperty('--cap-color', `var(${RACE[race].color})`);
          icap.classList.remove('is-on'); void icap.offsetWidth; icap.classList.add('is-on');
        }
        function frame(now) {
          if (!t0) t0 = now;
          const ms = still ? 0 : now - t0, s = ms / 1000;
          x.setTransform(PX, 0, 0, PX, 0, 0); x.globalAlpha = 1; x.imageSmoothingEnabled = false;
          x.fillStyle = css(rgb('--color-fog')); x.fillRect(0, 0, W, H);
          x.drawImage(neb, -Math.floor(s * 3), 0);
          drawStars(x, st, W, ms, 1);
          // 종족 편대
          if (!short && !still) {
            let cap = '';
            for (const [race, a, b] of PASS) {
              if (s < a || s > b + FADE) continue;
              const f = FLY[race], dur = b - a;
              if (s < b - 0.2 && s > a + 0.15) cap = race;
              if (!f.whooshed && s >= a) { f.whooshed = true; if (A) A.play('whoosh', 0.7, f.dir * -0.4); }
              f.units.forEach(([type, k, hy, dl, spd], j) => {
                const p = (s - a - dl) / dur * spd;
                if (p <= 0 || (air(type) && p >= 1.15)) return;
                const ak = artK(k, PX), c = silhouette(type, 0, ak, f.dir < 0, RACE[race].rim, RACE[race].dark, movePose(type, f.dir > 0, ms, j));
                // 일정한 속도(가감속 없음). 공중 = 화면 가로지름, 지상 = 가장자리 → MARCH 만큼 걷고 패스 끝에서 옅어짐
                const Wb = W * PX, span = air(type) ? Wb + c.width * 2 : c.width + Wb * MARCH, e = p;
                const bx = Math.floor(f.dir > 0 ? -c.width + e * span : Wb - e * span);   // 버퍼 px
                x.globalAlpha = clamp(1 - (s - b) / FADE, 0, 1);
                const hov = air(type) ? Math.round(Math.sin(s * 3 + hy * 20)) * ak : 0;  // 공중 호버 ±1(아트 px)
                const by = Math.floor(H * PX * hy) - c.oy + hov;
                // 꼬리(저해상도 좌표): 레기온 = 엔진 불꽃, 스웜 = 포자 가스, 엘리시안 = 빛 줄기. 지상군은 발밑 흙먼지
                const kk = Math.max(1, Math.round(k)), tail = (f.dir > 0 ? bx : bx + c.width) / PX, ty = by / PX, ch = c.height / PX;
                if (race === 'elysian' && air(type)) { // 빛 줄기: 길게 늘어지며 옅어지는 3줄
                  for (let jj = 0; jj < 3; jj++) { x.fillStyle = css(rgb(jj ? RACE[race].trail : '--color-glint'), 0.45 - jj * 0.12); const len = (60 - jj * 14) * kk; x.fillRect(Math.round(tail - len), Math.round(ty + ch * (0.45 + jj * 0.12)), len, kk); }
                }
                if (hash(Math.floor(ms / 16), j + hy * 100, 3) < (air(type) ? 0.9 : 0.35)) parts.push({ x: tail + (f.dir > 0 ? -1 : 1), y: air(type) ? ty + ch * (0.4 + hash(ms | 0, hy * 50, 2) * 0.3) : ty + ch * 0.9, vx: -f.dir * (6 + hash(ms | 0, 3, hy * 9) * 10), vy: (hash(ms | 0, 4, hy * 9) - 0.5) * 4, life: 0, max: 0.5 + hash(ms | 0, 5, 1) * 0.5, c: !air(type) ? '--color-ink-3' : hash(ms | 0, 6, hy * 7) < 0.4 ? RACE[race].trail2 : RACE[race].trail, k: kk });
                x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(c, bx, by); x.setTransform(PX, 0, 0, PX, 0, 0); x.globalAlpha = 1;
              });
            }
            caption(cap);
          }
          // 입자
          const dt = 1 / 60;
          for (let i = parts.length - 1; i >= 0; i--) {
            const q = parts[i]; q.life += dt; q.x += q.vx * dt; q.y += q.vy * dt;
            if (q.life >= q.max) { parts.splice(i, 1); continue; }
            x.globalAlpha = 1 - q.life / q.max; x.fillStyle = css(rgb(q.c)); x.fillRect(Math.floor(q.x), Math.floor(q.y), q.k, q.k);
          }
          x.globalAlpha = 1;
          // 로고
          const lt = still ? 99 : short ? s - 0.1 : s - LOGO_T, formMs = short ? 0.5 : 1.0;
          if (lt > 0) {
            if (!stung && !still) { stung = A ? A.play('sting', 0.8) : false; stung = stung || 'tried'; }
            drawLogo(ms, clamp(lt / formMs, 0, 1));
            if (!still) glint((lt - formMs - 0.1) / 0.45);
            if (lt > formMs && lt < formMs + 0.25 && !still) { // 형성 직후 번쩍
              x.globalAlpha = (1 - (lt - formMs) / 0.25) * 0.35; x.fillStyle = css(rgb('--color-glint')); x.fillRect(0, 0, W, H); x.globalAlpha = 1;
            }
            if (lt > formMs * 0.8 || still) isub.classList.add('is-on');
            if (!short && !still && lt > formMs + 0.4) ihint.dataset.phase = 'end';
          }
          // 시작 페이드 인
          if (!still && !short && s < 0.8) { x.globalAlpha = 1 - s / 0.8; x.fillStyle = css(rgb('--color-fog')); x.fillRect(0, 0, W, H); x.globalAlpha = 1; }
          if (!still && s >= (short ? SHORT_END : FULL_END)) finish(false);
          if (!still || done) raf = requestAnimationFrame(frame); // 정지 화면은 한 번만 그린다(크기 변경 때 다시)
        }
        function finish(skipped) {
          if (done) return; done = true;
          caption('');
          if (skipped && stung !== true) sfx('sting', 0.55); // 첫 입력으로 소리가 열렸으면 그때부터
          intro.classList.add('is-out');
          setTimeout(() => {
            cancelAnimationFrame(raf); intro.hidden = true; intro.classList.remove('is-out');
            isub.classList.remove('is-on'); delete ihint.dataset.phase;
            removeEventListener('keydown', onKey, true); removeEventListener('keyup', onKeyUp, true); removeEventListener('click', onClick, true); removeEventListener('resize', onResize);
            resolve();
          }, RM.matches ? 160 : 420);
        }
        let held = null;
        function onKey(ev) {
          if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'].includes(ev.key) || /^F\d{1,2}$/.test(ev.key) || ev.ctrlKey || ev.metaKey || ev.altKey) return; // 브라우저 단축키는 그대로
          ev.preventDefault(); ev.stopImmediatePropagation(); held = ev.code;
          if (!ev.repeat) finish(true);
        }
        function onKeyUp(ev) { if (ev.code === held) { ev.preventDefault(); ev.stopImmediatePropagation(); held = null; } }
        function onClick(ev) { ev.preventDefault(); ev.stopImmediatePropagation(); finish(true); }
        function onResize() { layout(); if (still) frame(performance.now()); }
        ihint.querySelector('[data-t]').textContent = still ? '계속하려면 아무 키나 누르세요' : '건너뛰기';
        intro.dataset.kind = kind;
        intro.hidden = false; intro.classList.remove('is-out');
        intro.focus({ preventScroll: true });
        addEventListener('keydown', onKey, true); addEventListener('keyup', onKeyUp, true); addEventListener('click', onClick, true); addEventListener('resize', onResize);
        for (const k in FLY) FLY[k].whooshed = false;
        // 로고 폰트가 늦게 오면 최대 0.7초만 기다린다(오프라인이면 대체 글꼴로 찍힌다)
        const fontReady = document.fonts && document.fonts.load ? Promise.race([document.fonts.load(`700 20px ${tok('--font-display')}`), sleep(700)]).catch(() => {}) : Promise.resolve();
        x.fillStyle = css(rgb('--color-fog')); x.fillRect(0, 0, icv.width, icv.height);
        fontReady.then(() => { if (done) return; layout(); raf = requestAnimationFrame(frame); });
      });
    }

    // ---------- 2. 대전 시작 화면 ----------
    const vs = document.getElementById('vs'), vbg = document.getElementById('vs-bg');
    let vsNeb = null, qmark = null;
    // 무대 CSS 배율: 옛 반해상도 배율 k 의 절반(새 아트 = 반해상도의 2배 픽셀). 버퍼가 가장 큰 영웅(발밑 위 ~66px + 뒷줄)을 담을 만큼(≥ 78px) 되게 줄인다
    // Task 9: 가장 큰 영웅(베히모스, 발밑 위 ~78px) + 무작위 자리의 물음표(~16px)가 겹치지 않고 들어가도록 버퍼 ≥ STAGE_MIN
    const STAGE_MIN = 118;
    const stageK = (cssH, k) => { let a = Math.max(1, Math.round(k / 2)); while (a > 1 && cssH / a < STAGE_MIN) a--; return a; };
    function stageCanvas(cv, cssW, cssH, k) { cv.width = Math.ceil(cssW / k); cv.height = Math.ceil(cssH / k); cv.style.width = cv.width * k + 'px'; cv.style.height = cv.height * k + 'px'; }
    // 무대 한 장: 영웅 유닛 가운데, 옆 유닛 둘은 뒤쪽. 디더 원판 위. flip = 왼쪽을 본다(상대편).
    // 버퍼 1px = 아트 1px(새 1:1 스프라이트를 원본 픽셀로). 원판 디더·물음표·탄 같은 옛 저해상도 그림은 u = 2 버퍼 px 칸으로.
    const IDLE = '1i0';   // 대기 자세: 남동(상대 쪽이면 반전 = 남서)
    function drawSquad(x, race, owner, flip, ms, opt = {}) {
      const W = x.canvas.width, H = x.canvas.height, cfg = RACE[race], base = Math.floor(H * 0.84), u = 2, cx = Math.floor(W / 2);
      x.clearRect(0, 0, W, H);
      // 원판: 종족색 디더 타원 + 어두운 그림자(u 칸 단위)
      const rc = rgb(opt.mystery ? '--color-ink-3' : cfg.color), pc = rgb('--color-paper-2');
      const rx = Math.floor(W * 0.42 / u), ry = Math.max(3, Math.floor(H * 0.09 / u));
      for (let py = -ry; py <= ry; py++) for (let px = -rx; px <= rx; px++) {
        const r = (px * px) / (rx * rx) + (py * py) / (ry * ry); if (r > 1) continue;
        const th = B4[((py + 64) & 3) * 4 + ((px + 64) & 3)] / 16;
        // 안쪽은 종족색을 살짝 섞은 패널색, 가장자리로 갈수록 종족색이 디더로 번진다
        const c = r > 0.86 ? rc : r > 0.6 && th < (r - 0.6) * 2.2 ? mix(pc, rc, 0.55) : mix(pc, rc, 0.16);
        x.fillStyle = css(c); x.fillRect(cx + px * u, base + py * u, u, u);
      }
      const put = (c, dy = 0) => x.drawImage(c, cx - c.ox, base - c.oy + dy);
      if (opt.mystery) { // 무작위 공개 전: 종족을 돌려 보이는 검은 실루엣 + 물음표
        const c = silhouette(cfg.hero, owner, 1, flip, '--color-ink-3', 0.95, IDLE);
        put(c, air(cfg.hero) ? -10 * u : 0);
        // 물음표: 실루엣의 보이는 꼭대기 위(1:1 아트 px 크기). 위 공간이 모자라면 실루엣 오른쪽 위로 비켜 겹치지 않게
        const q = qmark || (qmark = textCanvas('?', 16, ['--color-ink', '--color-ink-2']));
        const bb = c.bb || (c.bb = visBox(c)), top = base - c.oy - (air(cfg.hero) ? 10 * u : 0) + bb.y0, bob = RM.matches ? 0 : Math.round(Math.sin(ms / 300));
        let qx = cx - (q.width >> 1), qy = top - q.height - 3 + bob;
        if (qy < 1) { qx = Math.min(W - q.width - 1, cx - c.ox + bb.x1 + 2); qy = Math.max(1, top + bob); }
        x.drawImage(q, qx, qy);
        return;
      }
      // 대기 미세 움직임: 지상 = 숨쉬기 1px, 공중 = 호버 ±u
      const idle = (t, ph) => RM.matches ? 0 : air(t) ? Math.round(Math.sin(ms / 420 + ph) * u) : Math.round((Math.sin(ms / 260 + ph) + 1) / 2);
      const hop = (opt.hop || 0) * u;
      cfg.side.forEach((t, i) => {
        const c = big(t, owner, 1, flip, IDLE), dx = (i ? 1 : -1) * Math.floor(W * 0.31), dy = -Math.floor(H * 0.07);
        x.drawImage(c, cx + dx - c.ox, base + dy - c.oy - (air(t) ? 10 * u : 0) - idle(t, i * 2.1) - hop);
      });
      // 영웅: 공격 연출 순간(shoot 0.55~0.7) attack 프레임 0→1, 섬광은 정의의 포구(muzzleSE)
      const sh = opt.shoot > 0.55 && opt.shoot < 0.7 ? (opt.shoot - 0.55) / 0.15 : -1;
      const hc = big(cfg.hero, owner, 1, flip, sh >= 0 ? (sh < 0.45 ? '1a0' : '1a1') : IDLE), hl = air(cfg.hero) ? 10 * u : 0;
      const hx = cx - hc.ox, hy = base - hc.oy + 1 - hl - idle(cfg.hero, 0.7) - hop;
      x.drawImage(hc, hx, hy);
      if (sh >= 0) { // 섬광 + 탄(상대 쪽으로)
        const sd = flip ? -1 : 1, m = hc.mz || [flip ? 0 : hc.width, Math.floor(hc.oy * 0.4)], mx = hx + m[0], my = hy + m[1];
        x.fillStyle = css(rgb('--color-glint')); if (sh < 0.3) { x.fillRect(mx - u, my - u, 2 * u, 2 * u); x.globalAlpha = 0.5; x.fillRect(mx - 2 * u, my - u / 2, 4 * u, u); x.globalAlpha = 1; }
        x.fillStyle = css(rgb(cfg.rim)); const bx = mx + sd * Math.floor(3 * u + sh * W * 0.4); x.fillRect(Math.min(bx, bx - sd * 3 * u), my - u / 2, 3 * u, u);
      }
      if (opt.flash > 0) { // 번쩍임은 그린 픽셀에만(캔버스 사각형이 드러나지 않게)
        x.globalCompositeOperation = 'source-atop'; x.globalAlpha = opt.flash; x.fillStyle = css(rgb('--color-glint')); x.fillRect(0, 0, W, H);
        x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
      }
    }

    // o = { players: [{race, team, slot, color}], me, random: [플레이어 번호…], map, resume, label, minMs }
    // 팀 묶음으로 한 줄: [A·B] VS [C], 개인전 A VS B VS C VS D. 무작위 종족 자리마다 따로 공개 연출.
    const vrow = document.getElementById('vs-row');
    function versus(o) {
      const pl = o.players, me = o.me ?? -1, map = D.maps[o.map] || { name: o.map, desc: '', starts: [] };
      const groups = []; // 팀 첫 등장 순
      pl.forEach((q, i) => { let g = groups.find(x => x.team === q.team); if (!g) groups.push(g = { team: q.team, ids: [] }); g.ids.push(i); });
      const n = pl.length, teamGame = groups.some(g => g.ids.length > 1), big2 = n === 2;
      vs.dataset.n = String(n);
      // 무대 크기: 한 줄에 n 장 + VS 글자(그룹 사이). 2인은 예전 크기.
      const midW = innerWidth >= 1280 ? 150 : 110, avail = innerWidth - 64 - (groups.length - 1) * midW - groups.length * 32;
      const sw = big2 ? Math.min(480, Math.floor(innerWidth * (innerWidth >= 768 ? 0.32 : 0.8))) : clamp(Math.floor(avail / n), 160, 360), sh = Math.max(Math.floor(sw * 0.6), big2 ? 0 : Math.min(240, Math.floor(innerHeight * 0.24)));   // 4인: 무대 높이를 STAGE_MIN×2 까지 확보
      const k = big2 ? (innerWidth >= 1280 ? 5 : innerWidth >= 900 ? 4 : 3) : clamp(Math.floor(sw / 90), 2, 4);
      const ka = stageK(sh, k);   // 무대 버퍼 = 아트 1:1, CSS 확대 ka(정수)
      // 배경 성운(정지) — 화면 크기마다 한 번
      const bp = 3, bw = Math.ceil(innerWidth / bp), bh = Math.ceil(innerHeight / bp);
      if (!vsNeb || vsNeb.width !== bw || vsNeb.height !== bh) {
        vbg.width = bw; vbg.height = bh; vbg.style.width = bw * bp + 'px'; vbg.style.height = bh * bp + 'px';
        const bx = vbg.getContext('2d'); bx.fillStyle = css(rgb('--color-fog')); bx.fillRect(0, 0, bw, bh);
        bx.globalAlpha = 0.55; bx.drawImage(nebula(bw, bh, 77), 0, 0); bx.globalAlpha = 1;
        drawStars(bx, stars(bw, bh, 3, Math.round(bw * bh / 300)), bw, 0, 0);
        vsNeb = vbg;
      }
      // VS 글자(픽셀) — 그룹 사이마다 같은 그림
      const vk = big2 ? k : Math.max(2, k - 1);
      const vcv = paintLogo(pixelText('VS', big2 && innerWidth >= 1280 ? 30 : 24, 2), ['--logo-1', '--color-warn', '--race-legion', '--logo-shadow']);
      const vsWord = () => { const c = document.createElement('canvas'); c.width = vcv.width; c.height = vcv.height; c.style.width = vcv.width * vk + 'px'; c.style.height = vcv.height * vk + 'px'; c.getContext('2d').drawImage(vcv, 0, 0); return c; };
      // 줄 만들기
      vrow.textContent = '';
      const sides = [];
      const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
      const LV = typeof NW_AI !== 'undefined' ? NW_AI.LEVEL_NAMES : {};
      const roleText = i => (i === me ? '나' : me >= 0 && pl[me].team === pl[i].team ? '팀원' : '상대') + (pl[i].ai ? ' · AI ' + (LV[pl[i].ai.level] || '') : '');
      groups.forEach((g, gi) => {
        if (gi) { const mid = mk('div', 'vs-mid'); mid.setAttribute('aria-hidden', 'true'); mid.appendChild(vsWord()); vrow.appendChild(mid); }
        const box = mk('div', 'vs-team' + (teamGame ? ' is-team' : ''));
        if (teamGame) box.appendChild(mk('p', 'vs-team-tag', '팀 ' + (g.team + 1)));
        const row = mk('div', 'vs-team-row'); box.appendChild(row);
        for (const i of g.ids) {
          const q = pl[i], side = mk('div', 'vs-side'), cv = mk('canvas');
          side.dataset.in = (gi + 0.5) / groups.length < 0.5 ? 'l' : gi === (groups.length - 1) / 2 ? 'c' : 'r';
          side.style.setProperty('--pc', `var(--player-${((q.color | 0) & 3) + 1})`);
          cv.setAttribute('aria-hidden', 'true'); stageCanvas(cv, sw, sh, ka);
          const who = mk('p', 'vs-who'); who.append(mk('span', 'vs-dot'), mk('span', 'vs-name', q.name || 'P' + (i + 1)), mk('small', 'vs-role', roleText(i)));
          side.append(cv, who, mk('p', 'vs-race'), mk('p', 'vs-line'));
          row.appendChild(side);
          const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
          sides.push({ i, q, side, x, flip: side.dataset.in === 'r', random: (o.random || []).includes(i), t: -1e9 });
        }
        vrow.appendChild(box);
      });
      const fill = sd => {
        sd.side.style.setProperty('--vs-color', `var(${RACE[sd.q.race].color})`);
        sd.side.querySelector('.vs-race').textContent = D.races[sd.q.race].name;
        sd.side.querySelector('.vs-line').textContent = RACE[sd.q.race].line;
      };
      const reduce = RM.matches;
      sides.forEach(sd => {
        sd.revealed = !sd.random || reduce;
        if (sd.revealed) fill(sd);
        else { sd.side.querySelector('.vs-race').textContent = '무작위'; sd.side.querySelector('.vs-line').textContent = '종족을 고르는 중…'; sd.side.style.setProperty('--vs-color', 'var(--color-ink-3)'); sd.side.querySelector('.vs-race').setAttribute('aria-live', 'polite'); }
      });
      const title = () => groups.map(g => g.ids.map(i => sides.find(s => s.i === i)).map(s => s.revealed ? D.races[s.q.race].name : '무작위').join('·')).join(' 대 ') + ' — ' + map.name;
      document.getElementById('vs-title').textContent = title();
      // 맵: 시작 후보만 중립 표식(누가 어디서 시작하는지 알려 주지 않는다 — 정찰의 몫)
      const mapBox = vs.querySelector('.vs-mapcv'); mapBox.textContent = ''; if (D.maps[o.map]) mapBox.appendChild(mapBig(map));
      vs.querySelector('.vs-map-name').textContent = map.name; vs.querySelector('.vs-map-desc').textContent = map.desc;
      const prog = vs.querySelector('.vs-prog'), pfill = prog.querySelector('.meter-fill'), ppct = prog.querySelector('.num'), pbar = prog.querySelector('[role=progressbar]');
      prog.hidden = !o.resume; prog.querySelector('.vs-prog-what').textContent = o.label || '';
      pfill.style.transform = 'scaleX(0)'; ppct.textContent = '0%'; pbar.setAttribute('aria-valuenow', '0');
      vs.dataset.resume = o.resume ? '1' : '';
      vs.hidden = false; vs.classList.remove('is-in', 'is-out'); void vs.offsetWidth; vs.classList.add('is-in');
      vs.focus({ preventScroll: true });
      const randoms = sides.filter(sd => !sd.revealed), REVEAL_MS = 1250, GAP_MS = 380;
      const T0 = performance.now(), minMs = o.minMs || (o.resume ? 2000 : Math.max(2400, REVEAL_MS + randoms.length * GAP_MS + 600));
      let raf = 0, vsSounded = false, lastTick = -1, closed = false, skipAt = 0;
      const races = Object.keys(RACE);
      function loop(now) {
        const ms = now - T0;
        if (!vsSounded && ms > (reduce ? 0 : 380)) { vsSounded = true; sfx('vs', 0.9); for (const sd of sides) if (sd.revealed) sd.t = ms; }
        let spinning = false;
        randoms.forEach((sd, r) => {
          if (sd.revealed) return;
          if (ms >= REVEAL_MS + r * GAP_MS || skipAt) {
            sd.revealed = true; sd.t = ms; sfx('reveal', 0.8);
            fill(sd); sd.side.classList.add('is-reveal');
            document.getElementById('vs-title').textContent = title();
          } else spinning = true;
        });
        const i = Math.floor(ms / 95);
        if (spinning && i !== lastTick && ms > 450) { lastTick = i; if (A) A.play('tick', 0.5); }
        const fl = (t0, a) => reduce ? 0 : Math.max(0, a * (1 - (ms - t0) / 260)); // 시간 기준 감쇠(프레임 수와 무관)
        sides.forEach((sd, j) => {
          if (sd.revealed) drawSquad(sd.x, sd.q.race, sd.i, sd.flip, ms, { flash: fl(sd.t, sd.random ? 0.9 : 0.6), shoot: reduce || ms - sd.t < 600 ? -1 : ((ms - sd.t + j * 650) % 2600) / 2600 });   // 공개 뒤 자리마다 엇갈려 한 발씩
          else drawSquad(sd.x, races[(i + j) % 3], sd.i, sd.flip, ms, { mystery: true });
        });
        if (!closed) raf = requestAnimationFrame(loop);
      }
      raf = requestAnimationFrame(loop);
      let readyRes = null, wantReady = false;
      const readyP = new Promise(r => { readyRes = r; });
      const allRevealed = () => sides.every(sd => sd.revealed);
      function check() {
        if (!wantReady || closed) return;
        const ms = performance.now() - T0;
        if (ms >= minMs || (skipAt && allRevealed())) readyRes(); else setTimeout(check, Math.min(100, Math.max(16, minMs - ms)));
      }
      function onKey(ev) {
        if (/^F\d{1,2}$/.test(ev.key) || ev.ctrlKey || ev.metaKey || ev.altKey) return;
        ev.preventDefault(); ev.stopImmediatePropagation();
        if (!ev.repeat && !o.resume && /^(Enter|Space|Escape)$/.test(ev.code === 'Space' ? 'Space' : ev.key)) { skipAt = performance.now(); check(); }
      }
      function onClick(ev) { ev.preventDefault(); ev.stopImmediatePropagation(); if (!o.resume) { skipAt = performance.now(); check(); } }
      addEventListener('keydown', onKey, true); addEventListener('click', onClick, true);
      return {
        progress(f) {
          const p = Math.floor(clamp(f, 0, 1) * 100);
          pfill.style.transform = 'scaleX(' + clamp(f, 0, 1) + ')'; ppct.textContent = p + '%'; pbar.setAttribute('aria-valuenow', String(p));
        },
        ready() { wantReady = true; check(); return readyP; },
        close() {
          if (closed) return; closed = true;
          removeEventListener('keydown', onKey, true); removeEventListener('click', onClick, true);
          vs.classList.add('is-out');
          if (document.activeElement && vs.contains(document.activeElement)) document.activeElement.blur();
          setTimeout(() => { cancelAnimationFrame(raf); vs.hidden = true; vs.classList.remove('is-in', 'is-out'); }, reduce ? 160 : 420);
        },
      };
    }

    // ---------- 3. 메뉴 화면 재료: 배경 · 로고 · 9-slice 픽셀 틀 · 큰 맵 · 진영 무대 ----------
    // 배경: 흐르는 성운 + 멀리 지나가는 편대 실루엣 + 먼 전투 섬광. 메뉴 뒤 전면.
    function backdrop(cv) {
      const x = cv.getContext('2d');
      let W = 0, H = 0, PX = 3, neb = null, st = null;
      function layout() { // 버퍼 = 화면 px, 성운·별·섬광은 변환 ×PX(인트로와 같은 방식)
        PX = innerWidth >= 1200 ? 3 : 2;
        W = Math.ceil(innerWidth / PX); H = Math.ceil(innerHeight / PX);
        cv.width = W * PX; cv.height = H * PX; cv.style.width = W * PX + 'px'; cv.style.height = H * PX + 'px';
        neb = nebula(W + 96, H, 53); st = stars(W, H, 19, Math.round(W * H / 240));
        x.imageSmoothingEnabled = false;
      }
      layout();
      const races = ['legion', 'swarm', 'elysian'], CYC = 16000; // 16초마다 다른 종족 편대가 천천히 지나간다
      function draw(ms) {
        if (cv.width !== Math.ceil(innerWidth / PX) * PX || cv.height !== Math.ceil(innerHeight / PX) * PX) layout();
        const still = RM.matches; if (still) ms = 11800; // 정지 화면: 편대가 오른쪽 하늘에 있는 순간
        x.setTransform(PX, 0, 0, PX, 0, 0); x.globalAlpha = 1; x.imageSmoothingEnabled = false;
        x.fillStyle = css(rgb('--color-fog')); x.fillRect(0, 0, W, H);
        x.drawImage(neb, -Math.floor((Math.sin(ms / 60000) + 1) / 2 * 96), 0); // 천천히 왕복(끊김 없음)
        drawStars(x, st, W, ms, 1);
        // 먼 전투 섬광: 화면 오른쪽 아래 성운 속에서 깜빡이는 폭발 점
        for (let i = 0; i < 6; i++) {
          const per = 1700 + i * 230, ph = (ms + i * 977) % per / per, n = Math.floor((ms + i * 977) / per);
          if (ph > 0.3) continue;
          const bx = Math.floor(W * (0.45 + hash(n, i, 1) * 0.5)), by = Math.floor(H * (0.35 + hash(n, i, 2) * 0.5)), q = ph / 0.3, r = Math.round(1 + q * 4);
          x.globalAlpha = (1 - q) * 0.8; x.fillStyle = css(rgb(q < 0.3 ? '--color-fire-hot' : '--color-fire'));
          x.fillRect(bx - 1, by - 1, 2, 2);
          x.globalAlpha = (1 - q) * 0.4; x.fillRect(bx - r, by, 1, 1); x.fillRect(bx + r, by, 1, 1); x.fillRect(bx, by - r, 1, 1); x.fillRect(bx, by + r, 1, 1);
        }
        x.globalAlpha = 1;
        // 먼 함대(공중만): 아트 1~2배(화면 px) — 인트로보다 작게, 어둡게. 이동 프레임 순환
        const n = Math.floor(ms / CYC), race = races[n % 3], p = (ms % CYC) / CYC, f = BACK[race], Wb = W * PX, Hb = H * PX;
        x.setTransform(1, 0, 0, 1, 0, 0);
        f.units.forEach(([type, hy, dl, spd, sc], j) => {
          const q = (p - dl * 0.06) * spd * 0.9;
          if (q <= 0 || q >= 1.1) return;
          const c = silhouette(type, 1, Math.max(1, Math.round(sc * PX / 3)), f.dir < 0, RACE[race].rim, 0.78, still ? '' : movePose(type, f.dir > 0, ms, j));
          const span = Wb + c.width * 2, px = Math.floor(f.dir > 0 ? -c.width + q * span : Wb - q * span);
          const py = Math.floor(Hb * (0.2 + hy * 0.6) - c.height / 2) + (still ? 0 : Math.round(Math.sin(ms / 700 + hy * 9)));
          x.globalAlpha = 0.85; x.drawImage(c, px, py);
          const tx = f.dir > 0 ? px : px + c.width, ty = py + Math.floor(c.height / 2);
          if (race === 'elysian') { x.globalAlpha = 0.25; x.fillStyle = css(rgb('--elysian-a')); x.fillRect(f.dir > 0 ? tx - 60 : tx, ty, 60, 2); }
          else if (hash(Math.floor(ms / 90), j, hy * 99) < 0.6) { x.globalAlpha = 0.6; x.fillStyle = css(rgb(RACE[race].trail)); x.fillRect(f.dir > 0 ? tx - 4 : tx + 2, ty, 2, 2); }
        });
        x.globalAlpha = 1;
      }
      return { draw };
    }
    // 픽셀 글자 캔버스(로고·VS 등). bands = 위→아래 색 토큰
    function textCanvas(text, fs, bands, spacing = 1) { return paintLogo(pixelText(text, fs, spacing), bands); }
    // 로고 캔버스 + 주기적 반짝 sweep(6초마다)
    function logo(cv, cssW) {
      const LS = 2, PXL = 3, tgt = cssW / (PXL * LS);
      const m0 = pixelText('NEBULA WAR', 20, 1), fs = clamp(Math.round(20 * tgt / m0.w), 12, 64);
      const t = pixelText('NEBULA WAR', fs, Math.max(1, Math.round(fs / 14))), lc = paintLogo(t, ['--logo-1', '--logo-2', '--logo-3', '--logo-4']);
      cv.width = lc.width * LS; cv.height = lc.height * LS; cv.style.width = cv.width * PXL + 'px'; cv.style.height = cv.height * PXL + 'px';
      const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
      const gl = css(rgb('--color-glint'), 0.85);
      return {
        draw(ms) {
          x.clearRect(0, 0, cv.width, cv.height); x.drawImage(lc, 0, 0, cv.width, cv.height);
          if (RM.matches) return;
          const p = (ms % 6000) / 900; if (p >= 1) return;
          const pos = -t.h + p * (t.w + t.h * 2); x.fillStyle = gl;
          for (let py = 0; py < t.h; py++) for (let px = Math.max(0, Math.floor(pos - py * 0.6)); px < Math.min(t.w, pos - py * 0.6 + 3); px++)
            if (t.m[py * t.w + px]) x.fillRect((px + 1) * LS, (py + 1) * LS, LS, LS);
        },
      };
    }
    // 9-slice 픽셀 틀: 18×18 원본(모서리 6px)을 토큰 색으로 그려 data URL 로. CSS 는 border-image 12px(×2) 로 키운다.
    function frame9(edgeName, fillAlpha = 0.86) {
      const c = document.createElement('canvas'); c.width = c.height = 18;
      const x = c.getContext('2d'), vd = rgb('--color-void'), ed = rgb(edgeName), dk = mix(ed, vd, 0.55), fl = rgb('--color-paper-2'), gl = rgb('--color-glint');
      const P = (px, py, col, a = 1) => { x.fillStyle = css(col, a); x.fillRect(px, py, 1, 1); };
      // 안쪽 채움
      x.fillStyle = css(fl, fillAlpha); x.fillRect(3, 3, 12, 12);
      for (let i = 0; i < 18; i++) for (let j = 0; j < 18; j++) {
        const e = Math.min(i, j, 17 - i, 17 - j), cornerI = Math.min(i, 17 - i), cornerJ = Math.min(j, 17 - j);
        if (cornerI + cornerJ < 2) continue;              // 모서리 깎기(계단)
        if (e === 0 || (cornerI + cornerJ === 2)) P(i, j, vd);
        else if (e === 1 || (cornerI + cornerJ === 3)) P(i, j, ed);
        else if (e === 2) P(i, j, dk);
      }
      // 모서리 리벳(하이라이트 픽셀)
      for (const [i, j] of [[3, 3], [14, 3], [3, 14], [14, 14]]) P(i, j, gl, 0.9);
      return c.toDataURL();
    }
    // 큰 맵 미리보기(맵 타일 1:1, 기본 128×128): 맵 테마 색(NW_ART.theme(id).mini) 땅 디더 2톤, 바위 위·왼쪽 1px 하이라이트·아래 1px 그늘, 사이트(시작·확장)마다 크리스탈 8개, 시작점.
    // 시작점은 후보 표식만(중립색) — 누가 어디서 시작하는지는 어떤 화면에도 보이지 않는다(정찰·안개의 몫).
    // id = 맵 id(지형 색 테마). 없으면 D.maps 에서 찾는다
    function mapBig(m, id) {
      const W = m.w ?? 128, H = m.h ?? 128;
      if (id === undefined && D) id = Object.keys(D.maps).find(k => D.maps[k] === m);
      const mi = NW_ART.theme(id).mini;
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d'), img = x.createImageData(W, H), d = img.data, solid = new Uint8Array(W * H);
      for (const [tx, ty, w, h] of m.rocks) for (let j = ty; j < ty + h; j++) for (let i = tx; i < tx + w; i++) if (i >= 0 && j >= 0 && i < W && j < H) solid[j * W + i] = 1;
      const ga = mi.ground, gb = mix(mi.ground, mi.groundHi, 0.5), rk = mi.rock, rkHi = mi.rockHi, vd = rgb('--color-void'), rkLo = mix(mi.rock, vd, 0.35);
      const S_ = (a, b) => a < 0 || b < 0 || a >= W || b >= H || solid[b * W + a] === 1;
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        let col;
        if (solid[j * W + i]) col = !S_(i, j - 1) || !S_(i - 1, j) ? rkHi : !S_(i, j + 1) ? rkLo : rk;   // 빛은 좌상단: 위·왼쪽 가장자리 1px 밝게, 아래 1px 어둡게
        else if (j > 0 && solid[(j - 1) * W + i]) col = mix(mi.shadow, vd, 0.35);  // 바위 그림자
        else col = hash(i >> 2, j >> 2, 3) + B4[(j & 3) * 4 + (i & 3)] / 40 > 0.62 ? gb : ga;
        const k = (j * W + i) * 4; d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      // 크리스탈: sim 의 사이트 규칙과 같은 자리(좌측 세로 4 + 상단 가로 4, 2×1 타일, flip 거울). 시작 사이트는 starts[0] 배치의 거울.
      const cr = css(rgb('--crystal')), crd = css(mix(rgb('--crystal'), vd, 0.5)), s0 = m.starts[0];
      const sites = m.starts.map((s, i) => [s0.tx, s0.ty, s.flip ?? (i ? 3 : 0)]).concat(m.expansions.map(e => [e.tx, e.ty, e.flip ?? (e.mirror ? 3 : 0)]));
      for (const [sx, sy, f] of sites) {
        const tiles = [];
        for (let i = 0; i < 4; i++) tiles.push([sx - 6, sy - 1 + i], [sx - 4 + 2 * i, sy - 6]);
        for (const [tx0, ty0] of tiles) {
          const tx = f & 1 ? W - tx0 - 2 : tx0, ty = f & 2 ? H - ty0 - 1 : ty0;
          x.fillStyle = crd; x.fillRect(tx, ty + 1, 2, 1); x.fillStyle = cr; x.fillRect(tx, ty, 2, 1);
        }
      }
      for (const s of m.starts) {
        x.fillStyle = css(vd); x.fillRect(s.tx - 3, s.ty - 3, 11, 11);
        x.fillStyle = css(rgb('--color-ink-2')); x.fillRect(s.tx - 2, s.ty - 2, 9, 9);
        x.fillStyle = css(rgb('--color-paper-2')); x.fillRect(s.tx + 1, s.ty + 1, 3, 3);
      }
      return c;
    }
    // 진영 무대(메뉴 배너): drawSquad 에 가끔 공격 섬광, 고른 직후 깡충
    function squad(cv, owner, flip) {
      const x = cv.getContext('2d'); x.imageSmoothingEnabled = false;
      let hopAt = -1e9;
      return {
        hop() { hopAt = performance.now(); },
        draw(race, ms) {
          if (race === 'random') { drawSquad(x, ['legion', 'swarm', 'elysian'][Math.floor(ms / 700) % 3], owner, flip, ms, { mystery: true }); return; }
          const hop = RM.matches ? 0 : clamp((performance.now() - hopAt) / 280, 0, 1);
          drawSquad(x, race, owner, flip, ms, { hop: hop < 1 ? Math.round(Math.sin(hop * Math.PI) * 4) : 0, shoot: RM.matches ? -1 : (ms % 2600) / 2600 });
        },
      };
    }

    return { title, versus, backdrop, logo, textCanvas, frame9, mapBig, squad, stageK, RACE, RM };
  }
  return { create, RACE };
})();
if (typeof module !== 'undefined') module.exports = NW_PRESENT;
