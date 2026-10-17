// 네뷸라 워 — 렌더러. 절차적 픽셀 스프라이트(반해상도 → ×2), 레이어 캔버스, 안개, 미니맵.
// 색은 index.html :root 디자인 토큰에서 한 번 읽는다. FALLBACK 은 같은 토큰 이름의 비상용 값.
//
// view = { me, camX, camY (월드 px), sel: id[], drag?: {x0,y0,x1,y1} (캔버스 화면 px),
//          ghost?: {what, tx, ty, ok}, vw?, vh? (HUD에 가리지 않은 뷰포트 px, 미니맵 카메라 사각형용),
//          pings?: [{x, y (월드 px), age 0..1}] (공격받음 알림 — 미니맵 맥동 링),
//          marks?: [{x, y (월드 px) | id, tone 'move'|'atk'|'aim', age 0..1}] (명령 확인 표시 — 지점 링 · 대상 깜빡임) }
// view.fx 는 쓰지 않는다: 이펙트는 R 내부 상태이고 틱마다 R.addEvents(step() 이벤트, state)를 정확히 1번 호출한다.
// view.noShake = true 면 화면 흔들림을 끈다(전시 화면). R.audio(NW_AUDIO) 가 있으면 R.draw 끝에서 효과음을 낸다.
const NW_RENDER = (() => {
  const S = NW_SIM, D = S.D, FP = S.FP, TILE = S.TILE, TFP = S.TFP;

  const FALLBACK = {
    'player-1': '#3783f0', 'player-2': '#f1453b', 'player-3': '#e5ec45', 'player-4': '#fa8ecd',
    'legion-a': '#8a929c', 'legion-b': '#f08a2e', 'swarm-a': '#6b2c86', 'swarm-b': '#6b4a35',
    'elysian-a': '#ecc65a', 'elysian-b': '#3ccdc0',
    'ground-a': '#2f3a2b', 'ground-b': '#37422f', 'rock': '#2c2a26', 'crystal': '#8fd0f5',
    'creep': 'rgba(120,50,150,0.55)', 'color-fog': '#05070c',
    'color-void': '#080a12', 'color-glint': '#ebf2f6', 'color-gas': '#8fdc4a', 'color-fire': '#f0782a', 'color-fire-hot': '#ffd96a',
    'color-power': '#5ad8e8', 'color-warn': '#f2c04a', 'color-alert': '#f2703a',
    'color-accent': '#4de0d2', 'color-hp': '#6fd16c', 'color-danger': '#f2584a', 'color-shield': '#7ab8f0',
    'color-ink': '#e4eef2', 'color-ink-2': '#9fb0b8',
    'color-mana': '#8a7cf0', 'color-storm': '#b45ae8', 'color-storm-hot': '#f4e8ff', 'color-scan': '#b6f2d6', 'color-heal': '#9cf28a', 'color-aim': '#8ff0ea',
  };

  // --- 색 유틸: 토큰(oklch 등)을 1px 캔버스로 sRGB [r,g,b,a]로 풀어 JS 에서 음영 계산 ---
  function readTokens() {
    const cs = getComputedStyle(document.documentElement);
    const probe = document.createElement('canvas'); probe.width = probe.height = 1;
    const x = probe.getContext('2d', { willReadFrequently: true });
    const out = {};
    for (const k in FALLBACK) {
      x.clearRect(0, 0, 1, 1); x.fillStyle = '#000'; x.fillStyle = cs.getPropertyValue('--' + k).trim() || FALLBACK[k];
      x.fillRect(0, 0, 1, 1);
      const d = x.getImageData(0, 0, 1, 1).data;
      out[k] = [d[0], d[1], d[2], d[3] / 255];
    }
    return out;
  }
  const A = NW_ART, css = A.css;   // 색 유틸·스프라이트 정의는 art.js
  const MELEE_MAX_RANGE = 40;   // 이 이하 사거리는 근접으로 보고 광선을 그리지 않는다 (px)
  const LIFT_B = 26;            // 떠 있는 건물의 높이 (px)
  const liftOf = d => d.air ? 14 + Math.round(d.radius * 0.5) : 0;
  const isRes = e => !!(e.isR || e.type === 'crystal' || e.type === 'vent');

  function raceOf(type) { // 'bastion@siege' → bastion 의 종족, 'mound@swarm' → swarm
    const [base, suf] = type.split('@'), d = D.units[base] || D.buildings[base];
    return d ? d.race : D.races[suf] ? suf : undefined;
  }
  const isBld = type => !!D.buildings[type];

  function create(canvas, miniCanvas) {
    const ctx = canvas.getContext('2d'), mctx = miniCanvas ? miniCanvas.getContext('2d') : null;
    const T = readTokens();
    const col = {
      fog: css(T['color-fog']), fogHalf: css(T['color-fog'], 1, 0.5),
      player: [0, 1, 2, 3].map(i => css(T['player-' + (i + 1)])), ink2: css(T['color-ink-2']), ink: css(T['color-ink']),
      accent: css(T['color-accent']), hp: css(T['color-hp']), danger: css(T['color-danger']), shield: css(T['color-shield']),
      track: css(T['color-void'], 1, 0.7), shadow: css(T['color-void'], 1, 0.28), warn: css(T['color-warn']),
      power: css(T['color-power']), fire: css(T['color-fire']), fireHot: css(T['color-fire-hot']), smoke: css(T['color-void'], 2.2, 0.6),
      gas: css(T['color-gas']), alert: css(T['color-alert']),
      mana: css(T['color-mana']), storm: css(T['color-storm']), stormHot: css(T['color-storm-hot']), stormDk: css(T['color-storm'], 0.5),
      scan: css(T['color-scan']), heal: css(T['color-heal']), aim: css(T['color-aim']),
    };
    const fxColor = { legion: css(T['legion-b'], 1.2), swarm: css(T['swarm-a'], 1.7), elysian: css(T['elysian-b'], 1.2) };
    const puffColor = { legion: css(T['legion-a'], 1.1), swarm: css(T['swarm-a'], 1.2), elysian: css(T['elysian-a']), none: css(T.crystal) };

    // --- 스프라이트 캐시 (type|pose|mode). 플레이어 색은 칠하지 않는다 — 소유 표시는 고리·꺾쇠·막대·미니맵 ---
    // 반환 { cv, w, h (캔버스 px, 외곽선 1px 포함), px (화면 배율), ox, oy (캔버스 안 발밑·터 좌상단 기준점) }
    const cache = new Map(), iconCache = new Map();
    let spriteBytes = 0;
    function sprite(type, pose = '', mode = '') {
      const def = A.def(type), key = type + '|' + pose + '|' + mode + (def.critter ? '|' + crMap : '');   // 생물은 맵 테마 털색
      let s = cache.get(key); if (s) return s;
      const px = 1, race = raceOf(type) || def.race || 'legion';   // 모든 정의는 1:1(px 1). '@' 키(잔해·둔덕·고치)는 정의의 race
      const cv = document.createElement('canvas'); cv.width = def.w + 2; cv.height = def.h + 2;
      const c = cv.getContext('2d', { willReadFrequently: true });
      c.translate(1, 1);
      const pal = A.racePal(race, T), f = A.parsePose(pose), outline = pal.oRgb;
      f.T = T; f.ang = f.dir * Math.PI / 4; if (def.critter) f.th = A.theme(crMap); def.draw(A.pen(c), pal, f);
      c.setTransform(1, 0, 0, 1, 0, 0);
      const W = cv.width, H = cv.height, img = c.getImageData(0, 0, W, H), solid = A.finish(img, outline);
      if (mode === 'flash') A.tint(img, solid, T['color-glint']);
      if (mode === 'dim') A.desat(img);
      if (mode === 'sh') A.tint(img, solid, T['color-void']);                       // 공중 그림자 실루엣
      c.putImageData(img, 0, 0);
      s = { cv, w: W, h: H, px, ox: (def.ox ?? def.w / 2) + 1, oy: (def.oy ?? def.h) + 1 };
      if (!mode && !def.critter) s.gl = glowPts(def, img, race, pose);
      cache.set(key, s); spriteBytes += W * H * 4; return s;
    }
    // 색 키: 시야 기준(me)과 무관하게 플레이어 고유색. players 를 모르면(첫 R.draw 전 메뉴·연출 화면) 색 = 플레이어 번호.
    const colorIdx = owner => { const p = R.players && R.players[owner]; return (p ? p.color ?? owner : owner) & 3; };

    const R = { me: 0, players: null, fx: [], dir: new Map(), aim: new Map(), pose: new Map(), tick: 0, hitAt: new Map(), wk: new Map(), sfx: [], shake: null, lastVis: null, cam: null, nextSeen: -1, audio: null, lastPos: new Map(), bMem: new Map(), cMem: new Map(), idleT: new Map(), kills: new Map(), hitBy: new Map(), idleChk: 0 };

    // HUD 버튼/메뉴 카드용 아이콘: 캐시 스프라이트를 size×size 안에 맞춰 그린 새 캔버스(복제라 DOM에 마음껏 넣어도 됨)
    R.icon = (type, owner, size) => {
      const key = type + '|' + size;
      let src = iconCache.get(key);
      if (!src) {
        const s = sprite(type);
        src = document.createElement('canvas'); src.width = src.height = size;
        const c = src.getContext('2d'); c.imageSmoothingEnabled = false;
        // 1:1 정의: 불투명 영역만 잘라 칸에 맞춘다 — 들어가면 정수 배율 원본, 넘치면 정수 분의 1 최근접 축소 + 외곽선 다시
        const b = s.bb || (s.bb = opaqueBox(s.cv)), k = Math.floor(Math.min(size / b.w, size / b.h));
        if (k >= 1) c.drawImage(s.cv, b.x, b.y, b.w, b.h, Math.floor((size - b.w * k) / 2), Math.floor((size - b.h * k) / 2), b.w * k, b.h * k);
        else {
          const dv = Math.ceil(Math.max((b.w + 2) / size, (b.h + 2) / size)), w = Math.ceil(b.w / dv), h = Math.ceil(b.h / dv);
          c.drawImage(s.cv, b.x, b.y, w * dv, h * dv, Math.floor((size - w) / 2), Math.floor((size - h) / 2), w, h);
          const img = c.getImageData(0, 0, size, size); A.finish(img, A.racePal(raceOf(type) || A.def(type).race || 'legion', T).oRgb); c.putImageData(img, 0, 0);
        }
        iconCache.set(key, src);
      }
      const out = document.createElement('canvas'); out.width = out.height = size;
      out.getContext('2d').drawImage(src, 0, 0);
      return out;
    };
    // 캔버스의 불투명 픽셀 경계 상자(외곽선 포함)
    function opaqueBox(cv) {
      const W = cv.width, H = cv.height, d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return x1 < 0 ? { x: 0, y: 0, w: W, h: H } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    }

    // 연출 화면(인트로·대전 시작·종족 카드)용: 원본 크기 스프라이트 캔버스(외곽선 포함). 공유 캐시라 그리기 원본으로만 쓴다.
    // 새 판 시작 때 호출: 첫 R.draw 전에 만드는 아이콘(HUD·연출)도 이번 판 색을 쓴다
    R.setPlayers = players => { R.players = players; };
    R.spriteFull = (type, pose = '') => { const s = sprite(type, pose); return { cv: s.cv, w: s.w, h: s.h, px: s.px, ox: s.ox, oy: s.oy }; };
    R.artStats = () => ({ sprites: cache.size, spriteBytes, chunks: chunks.size, chunkBytes: chunks.size * CHUNK_PX * CHUNK_PX * 4, particles: PT.n, glows: R.glowLast || 0 });
    const hash = (x, y) => { let h = Math.imul(x, 73856093) ^ Math.imul(y, 19349663); h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
    const exploredFoot = (f, e, W) => { for (let j = 0; j < e.def.h; j++) for (let i = 0; i < e.def.w; i++) if (f[(e.ty + j) * W + e.tx + i] >= 1) return true; return false; }; // W: 맵 가로 타일 수
    // 이 엔티티를 그릴까. 적 유닛은 visible 일 때만; 적 건물은 visible 이거나 발자국이 탐색됨.
    // ponytail: 건물 잔상 기억은 필요해지면 (지금은 탐색된 적 건물을 현재 모습 그대로 표시)
    function seen(state, me, e) {
      if (e.owner < 0 || e.owner === me) return { draw: true, vis: true };
      const vis = S.visible(state, me, e);
      return { draw: vis || (e.isB && exploredFoot(state.fog[me], e, state.map.w)), vis };
    }

    // ===== 아트: 지형 청크 =====
    // 8×8 타일(256px) 청크를 처음 보일 때 한 번 그려 두고 블릿. LRU 상한 96개(≈24MB). 프레임당 새 청크 최대 4개·6ms —
    // 나머지는 그 프레임만 단색으로 대신 칠한다. 맵(id·바위 배열)이 바뀌거나 R.reset() 이면 비운다. 점막은 굽지 않고 매 프레임 위에 칠한다.
    const CHUNK = 8, CHUNK_PX = CHUNK * TILE, CHUNK_MAX = 96, CHUNK_NEW = 4, CHUNK_MS = 6, chunks = new Map();
    let chunkRock = null;
    const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });   // 문자열(oklch 등) → rgb
    A.setup(T, str => { probe.clearRect(0, 0, 1, 1); probe.fillStyle = '#000'; probe.fillStyle = str; probe.fillRect(0, 0, 1, 1); return Array.from(probe.getImageData(0, 0, 1, 1).data.slice(0, 3)); });
    function terrain(state, tx0, ty0, tx1, ty1) {
      const rock = state.map.rock, creep = state.map.creep, MW = state.map.w;
      if (rock !== chunkRock) { chunks.clear(); chunkRock = rock; }
      const th = A.theme(state.map.id);
      let budget = CHUNK_NEW; const tBudget = performance.now() + CHUNK_MS;   // 개수(4)와 시간(6ms) 둘 다 — 첫 청크는 늘 허용
      for (let cy = Math.floor(ty0 / CHUNK); cy <= Math.floor(ty1 / CHUNK); cy++) for (let cx = Math.floor(tx0 / CHUNK); cx <= Math.floor(tx1 / CHUNK); cx++) {
        const key = cx + ',' + cy;
        let cv = chunks.get(key);
        if (cv) { chunks.delete(key); chunks.set(key, cv); }                       // LRU: 최근 사용을 뒤로
        else if (budget > 0 && (budget === CHUNK_NEW || performance.now() < tBudget)) {
          budget--; cv = document.createElement('canvas'); cv.width = cv.height = CHUNK_PX;
          A.drawChunk(cv.getContext('2d'), state, cx * CHUNK, cy * CHUNK, CHUNK, th);
          chunks.set(key, cv); if (chunks.size > CHUNK_MAX) chunks.delete(chunks.keys().next().value);
        }
        if (cv) { ctx.drawImage(cv, cx * CHUNK_PX, cy * CHUNK_PX); continue; }
        for (let ty = Math.max(ty0, cy * CHUNK); ty <= Math.min(ty1, cy * CHUNK + CHUNK - 1); ty++) for (let tx = Math.max(tx0, cx * CHUNK); tx <= Math.min(tx1, cx * CHUNK + CHUNK - 1); tx++) {
          ctx.fillStyle = rock[ty * MW + tx] ? th.rockCss[2] : th.groundCss[1]; ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);   // 대체: 단색
        }
      }
      // 점막(동적 — 청크에 굽지 않음): 4이웃 마스크 16종 × 변형 4 타일을 한 번 캐시해 블릿. 맵 밖 이웃은 점막으로 본다(가장자리 없음)
      const MH = state.map.h, cr = (x, y) => x < 0 || y < 0 || x >= MW || y >= MH || creep[y * MW + x] === 1;
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        if (creep[ty * MW + tx] !== 1) continue;
        const m = (cr(tx, ty - 1) ? 1 : 0) | (cr(tx + 1, ty) ? 2 : 0) | (cr(tx, ty + 1) ? 4 : 0) | (cr(tx - 1, ty) ? 8 : 0);
        ctx.drawImage(creepTile(m, hash(tx, ty) & 3), tx * TILE, ty * TILE);
      }
    }
    const creepTiles = [];
    function creepTile(m, v) {
      const k = m * 4 + v;
      let cv = creepTiles[k];
      if (!cv) { cv = document.createElement('canvas'); cv.width = cv.height = TILE; A.creepTile(m, v)(cv.getContext('2d'), T.creep); creepTiles[k] = cv; }
      return cv;
    }

    function blit(s, x, y, flip, alpha) { // 스프라이트를 ×px 확대, 화면 중심 (x,y)
      ctx.imageSmoothingEnabled = false;
      if (alpha !== undefined) ctx.globalAlpha = alpha;
      const dw = s.w * s.px, dh = s.h * s.px;
      if (flip) { ctx.save(); ctx.translate(Math.round(x), 0); ctx.scale(-1, 1); ctx.drawImage(s.cv, Math.round(-dw / 2), Math.round(y - dh / 2), dw, dh); ctx.restore(); }
      else ctx.drawImage(s.cv, Math.round(x - dw / 2), Math.round(y - dh / 2), dw, dh);
      if (alpha !== undefined) ctx.globalAlpha = 1;
    }

    // 크리스탈 반짝임 띠: 크리스탈 마스크 안의 대각 2px 흰 띠, 위치 0..6 (단계별 7장 캐시)
    const glints = new Map();
    function glint(s, st, pos) {
      const key = st + '|' + pos; let cv = glints.get(key); if (cv) return cv;
      cv = document.createElement('canvas'); cv.width = s.w; cv.height = s.h;
      const c = cv.getContext('2d'), x0 = -s.h * 0.6 + pos * (s.w + s.h * 0.6) / 6;
      c.fillStyle = css(T['color-glint']);
      for (let y = 0; y < s.h; y++) c.fillRect(Math.round(x0 + (s.h - y) * 0.6), y, 2, 1);
      c.globalCompositeOperation = 'destination-in'; c.drawImage(s.cv, 0, 0);
      glints.set(key, cv); spriteBytes += s.w * s.h * 4; return cv;
    }
    // 건물 그림자: 실루엣('sh')을 바닥선(터 아래 가장자리 baseY)에서 뒤집어 오른쪽 아래로 기울이고 납작하게(빛 좌상단 → 그림자 우하단)
    function bshadow(type, x0, baseY) {
      const def = A.def(type);
      const s = sprite(type, def.shadowPose || 'w0', 'sh'), ch = s.h;
      ctx.save(); ctx.globalAlpha = 0.32; ctx.transform(1, 0, -0.4, -0.34, x0 + 0.4 * ch, baseY + 0.34 * ch); ctx.drawImage(s.cv, 0, 0); ctx.restore();
    }

    function bar(x, y, w, frac, color, frame) { // frame = 플레이어색 테두리(없으면 바탕색)
      ctx.fillStyle = frame || col.track; ctx.fillRect(Math.round(x - w / 2) - 1, Math.round(y) - 1, w + 2, 4);
      if (frame) { ctx.fillStyle = col.track; ctx.fillRect(Math.round(x - w / 2), Math.round(y), w, 2); }
      ctx.fillStyle = color; ctx.fillRect(Math.round(x - w / 2), Math.round(y), Math.max(0, Math.round(w * frac)), 2);
    }


    // ===================== 이펙트 엔진 =====================
    // R.fx 항목 하나 = 연출 하나. 입자를 객체로 만들지 않고, 나이(age 틱 + 보간 alpha)에 대한 순수 함수로 그린다.
    // 무작위는 Math.random 대신 hash(seed, i) — seed 는 엔티티 id 와 sim 틱에서 나온다(리플레이에서 같은 연출).
    const FX_CAP = 400;                                  // 넘치면 오래된 것부터 버린다
    const IMP = 5;                                       // 피격 연출 길이(틱)
    const SPEED = { bullet: 48, shell: 28, missile: 15, spine: 26, acid: 16, glaive: 20 }; // 투사체 px/틱
    const SND = { bullet: 'gun', shell: 'shell', missile: 'missile', spine: 'spine', acid: 'acid', glaive: 'glaive', beam: 'beam', slash: 'slash', bite: 'bite', flame: 'flame' };
    const RM = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const FONT_NUM = getComputedStyle(document.documentElement).getPropertyValue('--font-num').trim() || 'monospace';
    const rnd = (seed, i) => hash(seed, i) / 4294967296;
    const P2 = v => Math.round(v / 2) * 2;               // 스프라이트 픽셀(2px) 격자에 맞춘다
    const TAU = 6.2832;
    const vd = T['color-void'];
    // 종족별 연출 팔레트: core(가장 밝은 중심) → a → b → c(식어 가는 끝), deb/deb2 파편, smoke 연기, mark 그을음
    const fxPal = {
      legion:  { core: css(T['color-glint']), a: col.fireHot, b: col.fire, c: css(T['color-fire'], 0.55), deb: css(T['legion-a'], 0.8), deb2: css(T['legion-b']), smoke: css(vd, 1.36), smoke2: css(vd, 1.12), mark: css(vd, 0.9) },
      swarm:   { core: css(T['color-gas'], 1.5), a: css(T['swarm-a'], 1.5), b: css(T['swarm-a'], 1.12), c: css(T['swarm-a'], 0.7), deb: css(T['swarm-b'], 1.15), deb2: col.gas, smoke: css(T['swarm-a'], 0.85), smoke2: css(T['swarm-a'], 0.55), mark: css(T['swarm-a'], 0.45) },
      elysian: { core: css(T['color-glint']), a: css(T['elysian-b'], 1.28), b: css(T['elysian-b'], 0.92), c: css(T['elysian-b'], 0.55), deb: css(T['elysian-a']), deb2: css(T['elysian-b'], 1.3), smoke: css(T['elysian-b'], 0.5), smoke2: css(vd, 1.25), mark: css(vd, 0.9) },
    };
    const ink = css(vd, 1.1);                            // 연출 외곽선(스프라이트 외곽선과 같은 계열)
    const ecoCol = { crystal: css(T.crystal, 1.15), crystalL: css(T.crystal, 1.6), gas: col.gas, gasL: css(T['color-gas'], 1.45), glint: css(T['color-glint']) };

    // 반해상도 원/타원 캐시. fl = 세로 비율, hole > 0 이면 두께 hole 의 고리. 가장자리는 계단(안티앨리어싱 없음).
    const blobC = new Map();
    function blobCv(r, c, fl, hole) {
      const key = r + '|' + c + '|' + fl + '|' + hole;
      let cv = blobC.get(key); if (cv) return cv;
      const ry = Math.max(1, Math.round(r * fl));
      cv = document.createElement('canvas'); cv.width = 2 * r + 1; cv.height = 2 * ry + 1;
      const x = cv.getContext('2d'); x.fillStyle = c;
      const ri = r - hole, ryi = ry - Math.max(1, Math.round(hole * fl));
      for (let j = -ry; j <= ry; j++) {
        const yy = j / (ry + 0.5), w = Math.floor((r + 0.5) * Math.sqrt(Math.max(0, 1 - yy * yy)));
        let wi = -1;
        if (hole && ri > 0 && ryi > 0 && Math.abs(j) <= ryi) { const y2 = j / (ryi + 0.5); wi = Math.floor((ri + 0.5) * Math.sqrt(Math.max(0, 1 - y2 * y2))) - 1; }
        if (wi < 0) x.fillRect(r - w, j + ry, 2 * w + 1, 1);
        else { x.fillRect(r - w, j + ry, w - wi, 1); x.fillRect(r + wi + 1, j + ry, w - wi, 1); }
      }
      if (blobC.size > 1500) blobC.clear();
      blobC.set(key, cv); return cv;
    }
    // r = 화면 px 반지름
    function disc(x, y, r, c, a = 1, fl = 1, hole = 0) {
      if (a <= 0.03 || r < 1) return;
      const cv = blobCv(Math.max(1, Math.round(r / 2)), c, fl, hole);
      ctx.globalAlpha = a > 1 ? 1 : a;
      ctx.drawImage(cv, P2(x) - cv.width, P2(y) - cv.height, cv.width * 2, cv.height * 2);
    }
    function spk(x, y, c, a = 1) {                       // 4px 불꽃 + 흰 심(비슷한 색 위에서도 보인다)
      if (a <= 0.03) return;
      ctx.globalAlpha = a > 1 ? 1 : a; const X = P2(x - 2), Y = P2(y - 2);
      ctx.fillStyle = c; ctx.fillRect(X, Y, 4, 4); ctx.fillStyle = ecoCol.glint; ctx.fillRect(X, Y, 2, 2);
    }
    function dot(x, y, s, c, a = 1) {
      if (a <= 0.03) return;
      ctx.globalAlpha = a > 1 ? 1 : a; ctx.fillStyle = c; ctx.fillRect(P2(x - s / 2), P2(y - s / 2), s, s);
    }
    function pline(x0, y0, x1, y1, s, c, a = 1) { // 픽셀 계단 선
      if (a <= 0.03) return;
      const dx = x1 - x0, dy = y1 - y0, n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 2));
      ctx.globalAlpha = a > 1 ? 1 : a; ctx.fillStyle = c;
      for (let i = 0; i <= n; i++) ctx.fillRect(P2(x0 + dx * i / n - s / 2), P2(y0 + dy * i / n - s / 2), s, s);
    }
    const easeOut = u => 1 - (1 - u) * (1 - u);
    function fang(x, y, dir) {                           // 픽셀 송곳니(dir 1 = 아래를 향함), 어두운 테두리
      const X = P2(x), Y = P2(y);
      for (let r = 0; r < 3; r++) { const w = 6 - 2 * r; ctx.fillStyle = ink; ctx.fillRect(X - w / 2 - 2, Y + dir * 2 * r - 2, w + 4, 4); }
      for (let r = 0; r < 3; r++) { const w = 6 - 2 * r; ctx.fillStyle = r ? ecoCol.glint : fxPal.swarm.a; ctx.fillRect(X - w / 2, Y + dir * 2 * r, w, 2); }
    }

    function shotStyle(def, wp, race) {
      if (!wp || wp.suicide) return 'none';
      if (wp.range <= MELEE_MAX_RANGE) return def && def.id === 'scorcher' ? 'flame' : race === 'swarm' ? 'bite' : 'slash';
      if (race === 'elysian') return 'beam';
      if (race === 'swarm') return wp.bounce ? 'glaive' : (wp.type === 'explosive' || wp.splash) ? 'acid' : 'spine';
      if (wp.ground === false) return 'missile';
      return wp.type === 'explosive' || wp.dmg >= 20 ? 'shell' : 'bullet';
    }

    const pushFx = f => { if (R.fx.length >= FX_CAP) R.fx.splice(0, R.fx.length - FX_CAP + 1); R.fx.push(f); };
    const onCam = (x, y, m) => { const c = R.cam; return !c || (x > c.x - m && x < c.x + c.w + m && y > c.y - m && y < c.y + c.h + m); };
    const shakeReq = (amp, n) => { if (!R.shake || R.shake.amp * R.shake.n / R.shake.N < amp) R.shake = { amp, n, N: n }; };

    R.reset = () => {
      R.fx = []; R.dir.clear(); R.aim.clear(); R.pose.clear(); chunks.clear(); R.lastPos.clear(); R.hitAt.clear(); R.wk.clear(); R.bMem.clear(); R.cMem.clear(); R.idleT.clear(); R.kills.clear(); R.hitBy.clear(); if (X3) X3.reset();
      R.sfx = []; R.shake = null; R.lastVis = null; R.nextSeen = -1; R.tick = 0; R.farT = -99; R.seenPrev = null; R.idleChk = 0;
      PT.f.fill(0); PT.n = 0; PT.head = 0; crRock = null;
    };

    // ---- 유닛 성격(소리만, 클라이언트 상태): ui 가 선택·명령한 내 유닛을 touch → 오래 방치되면 투덜거림(R.draw 11단계).
    // 고참: sim 의 e.kills 는 스웜 변이용이라 다른 종족은 0 — 여기서 '마지막으로 때린 유닛'으로 내 유닛 처치를 따로 센다(근사).
    const IDLE_T = 50 * S.TICK_RATE, IDLE_CHECK_T = S.TICK_RATE, ALLY_R = 6 * TILE; // sim 틱(R.tick) — 일시정지 중엔 흐르지 않는다
    R.touch = ids => { for (const id of ids || []) R.idleT.set(id, R.tick); };
    R.killsOf = e => e ? Math.max(e.kills || 0, R.kills.get(e.id) || 0) : 0;

    // 틱마다 1번 호출(step 이벤트). 이펙트 나이를 1틱 올리고 새 이벤트를 넣는다. state 는 sim 틱(시드)·생산 감지용.
    R.addEvents = (events, state) => {
      R.tick++;
      if (R.sfx.length > 64) R.sfx.length = 0;                 // 그리지 못한 틱이 쌓이면(창 좁힘 등) 묵은 소리는 버린다
      const tk = state ? state.tick : R.tick;
      for (const f of R.fx) f.age++;
      R.fx = R.fx.filter(f => f.age < f.ttl);
      if ((R.tick & 31) === 0) {
        for (const [id, t] of R.hitAt) if (t < R.tick - 8) R.hitAt.delete(id);
        for (const [id, a] of R.aim) if (a.t < R.tick - 12) R.aim.delete(id);
      }
      const deaths = {}, chain = {}, hop = {};
      let allyDone = false;
      for (const ev of events) if (ev.t === 'death') {
        deaths[ev.id] = ev;
        R.wk.delete(ev.id); R.dir.delete(ev.id); R.aim.delete(ev.id); R.lastPos.delete(ev.id); R.hitAt.delete(ev.id); R.bMem.delete(ev.id); R.cMem.delete(ev.id);   // 엔티티별 맵이 판 내내 자라지 않게
      }
      const near = id => !R.lastVis || R.lastVis.has(id);
      if (R.audio && R.audio.combat && state) {                    // 교전 강도·대규모 교전 스팅: 내 것이 낀 공격만 센다
        let n = 0;
        for (const ev of events) if (ev.t === 'attack') { const a = S.byId(state, ev.a), b = S.byId(state, ev.b); if ((a && a.owner === R.me) || (b && b.owner === R.me)) n++; }
        R.audio.combat(n);
      }
      for (const ev of events) {
        if (ev.t === 'attack') {
          R.hitBy.set(ev.b, ev.a);                                          // 고참 처치 세기용(죽으면 지운다)
          R.aim.set(ev.a, { b: ev.b, t: R.tick });                          // 공격 방향·공격 프레임용
          // 같은 틱에 같은 공격자의 연속 공격 = 튕김: 직전 목표에서 이어서, 한 칸씩 늦게
          const from = chain[ev.a] || 0, h = hop[ev.a] || 0;
          chain[ev.a] = ev.b; hop[ev.a] = h + 1;
          if (!near(ev.a) && !near(ev.b) && !(from && near(from))) {   // 화면 밖 교전은 만들지 않는다 — 소리만 멀리서(시야 안 지점만, 6틱에 1번)
            if (state && R.audio && R.tick - (R.farT || -99) >= 6) {
              const fogMe = state.fog[R.me], seen = e => e && fogMe[Math.floor(e.y / FP / TILE) * state.map.w + Math.floor(e.x / FP / TILE)] === 2 && S.visible(state, R.me, e); // 은폐·잠복(미탐지)은 소리도 없다
              const a = S.byId(state, ev.a), b = S.byId(state, ev.b), p = seen(a) ? a : seen(b) ? b : null;
              if (p) { R.farT = R.tick; R.sfx.push({ s: 'far', far: 1, x: p.x / FP, y: p.y / FP, seed: hash(ev.a, tk) }); }
            }
            continue;
          }
          pushFx({ k: 'shot', a: ev.a, b: ev.b, from, delay: h * 3, splash: !!ev.splash, age: 0, ttl: 16, init: false,
            dead: deaths[ev.b] || null, deadA: deaths[ev.a] || null, seed: hash(ev.a * 977 + ev.b, tk + h) });
        } else if (ev.t === 'death') {
          const x = ev.x / FP, y = ev.y / FP;
          // 직전 틱에 내게 보이던 것만(은폐·잠복 미탐지 적의 죽음은 처치음·콤보·고참 세기·폭발 모두 없다 — 정보 누수). 첫 틱(기록 없음)은 타일 시야만.
          const saw = ev.owner === R.me || !R.seenPrev || R.seenPrev.has(ev.id);
          const myKill = ev.by === R.me && ev.owner !== R.me && saw;
          if (myKill) R.sfx.push({ s: 'kill', kill: 1, x, y });   // 연타 콤보(화면 밖이어도 시야 안이면 작게)
          if (state && D.units[ev.type]) {
            const kr = myKill ? S.byId(state, R.hitBy.get(ev.id)) : null;
            if (kr && kr.owner === R.me && !kr.isB) R.kills.set(kr.id, (R.kills.get(kr.id) || 0) + 1);
            if (ev.owner === R.me && !allyDone && R.audio && R.audio.allyDown) {   // 내 유닛 죽음: 가장 가까운(ALLY_R 안) 살아남은 내 유닛 하나가 놀란다(틱당 1번 찾기, 쿨다운은 audio)
              allyDone = true;
              let best = null, bd2 = (ALLY_R * FP) ** 2;
              for (const e of state.ents) {
                if (e.isB || e.owner !== R.me || e.inside || e.parent || deaths[e.id] || !(e.hp > 0)) continue;
                const d2 = (e.x - ev.x) ** 2 + (e.y - ev.y) ** 2;
                if (d2 <= bd2) { bd2 = d2; best = e; }
              }
              if (best) R.sfx.push({ s: 'down', ally: best.id });
            }
          }
          R.hitBy.delete(ev.id); R.kills.delete(ev.id); R.idleT.delete(ev.id);
          if (!onCam(x, y, 120)) continue;
          const ud = D.units[ev.type], bd = D.buildings[ev.type];
          const race = (ud || bd || {}).race || 'legion', w = ud && ud.weapon;
          const s = bd ? 3 : w && w.suicide ? 2 : ud && ud.radius >= 16 ? 2 : 1;
          const pal = bd && race !== 'swarm' ? fxPal.legion : fxPal[race] || fxPal.legion;
          const alt = ud && ud.air ? liftOf(ud) : 0;
          const vis = saw && !!state && state.fog[R.me][Math.floor(y / TILE) * state.map.w + Math.floor(x / TILE)] === 2;   // 안개 속·안 보이던 죽음은 그리지 않는다(정보 누수)
          if (vis) pushFx({ k: 'boom', x, y, s, alt, pal, deb: fxPal[race] || fxPal.legion, bw: bd ? bd.w * TILE : 0, bh: bd ? bd.h * TILE : 0,
            splash: w && w.suicide ? w.splash || 16 : 0, seed: hash(ev.id, tk), age: 0, ttl: s === 3 ? 64 : s === 2 ? 46 : 32 });
          if (vis) {   // 파편·불꽃 파티클(풀)
            const nd = bd ? 10 : s === 2 ? 5 : 0, ns = bd ? 6 : s === 2 ? 3 : 0;
            for (let j = 0; j < nd; j++) ptSpawn(3, x + (rnd(ev.id, j) - 0.5) * (bd ? bd.w * TILE * 0.6 : 10), y, alt + 6, hash(ev.id, tk + j));
            for (let j = 0; j < ns; j++) ptSpawn(5, x, y, alt + 8, hash(ev.id, tk + 40 + j));
          }
          if (vis && ud && !alt) {                                                         // 지상 유닛 잔해(종족 그림이 없으면 레기온 것)
            const sz = ud.radius >= 15 ? 'l' : ud.radius >= 10 ? 'm' : 's';
            let wt = 'wreck@' + race + '-' + sz; if (!A.SPR[wt]) wt = 'wreck@legion-' + sz;
            pushFx({ k: 'wreck', x, y, type: wt, flip: hash(ev.id, 5) & 1, age: 0, ttl: 240 });
          }
          if (vis && !alt) pushFx({ k: 'scorch', x, y, r: bd ? Math.max(bd.w, bd.h) * TILE * 0.5 : s === 2 ? 20 : 11, pal: fxPal[race] || fxPal.legion, seed: hash(ev.id, 3), age: 0, ttl: bd ? 160 : 110 });
          if (onCam(x, y, 0)) { if (bd) shakeReq(4, 10); else if (s === 2) shakeReq(2, 7); }
          if (saw) R.sfx.push({ s: s >= 2 ? 'boomL' : 'boomS', x, y, seed: hash(ev.id, tk), def: ud });
        } else if (ev.t === 'done' || ev.t === 'research') R.sfx.push({ s: ev.t, id: ev.id });
        // 3a: 치료 십자(같은 대상은 6틱에 한 번만 새로), 합체 섬광
        else if (ev.t === 'cast' && ev.what === 'heal' && ev.tgt) {
          if (!onCam(ev.x / FP, ev.y / FP, 60) || R.fx.some(f => f.k === 'heal' && f.id === ev.tgt && f.age < 6)) continue;
          pushFx({ k: 'heal', id: ev.tgt, x: ev.x / FP, y: ev.y / FP, seed: hash(ev.tgt, tk), age: 0, ttl: 16 }); R.sfx.push({ s: 'c_heal', x: ev.x / FP, y: ev.y / FP, seed: hash(ev.tgt, tk) });
        } else if (ev.t === 'merge' && state) {
          const n = S.byId(state, ev.id); if (n && onCam(n.x / FP, n.y / FP, 80)) pushFx({ k: 'merge', x: n.x / FP, y: n.y / FP, seed: hash(ev.id, tk), age: 0, ttl: 20 });
        }
      }
      if (X3) X3.events(events, state, tk);                        // 3b: 정화·음파 역류·방전·소환 순간 연출, 지연 효과 낙하 충격
      // 일꾼 상태 변화(틱마다 정확히 1번 비교 → 한 프레임에 여러 틱이 지나가도 놓치지 않는다):
      // 하역 → +N 팝업(내 유닛만), 가스 건물에서 나옴 → 퍼프
      if (state) {
        const fogMe = state.fog[R.me];
        for (const e of state.ents) {
          if (e.isB || !e.def.worker) continue;
          const go = e.order && e.order.type === 'gather' ? e.order : null, ins = !!(go && go.kind === 1 && go.phase === 'mine');
          const pv = R.wk.get(e.id), wx = e.x / FP, wy = e.y / FP;
          if (pv && onCam(wx, wy, 96)) {
            if (pv.c > 0 && !e.carry && e.owner === R.me) {
              const b = pv.d ? S.byId(state, pv.d) : null;
              const bx = b ? b.x / FP : wx, by = b ? (b.lifted ? b.y / FP - b.def.h * TILE / 2 - LIFT_B : b.ty * TILE) + 6 : wy - 24;
              pushFx({ k: 'pop', x: bx + ((e.id * 7) % 13) - 6, y: by, txt: '+' + pv.c, gas: pv.k === 1, o: e.owner, age: 0, ttl: 20 });
              R.sfx.push({ s: 'drop', id: e.id });                    // 하역음(BGM 박자에 맞춘다)
            }
            if (pv.ins && !ins && fogMe[Math.floor(wy / TILE) * state.map.w + Math.floor(wx / TILE)] === 2) pushFx({ k: 'puff', x: wx, y: wy, seed: hash(e.id, tk), age: 0, ttl: 10 });
          }
          if (pv) { pv.c = e.carry; pv.k = e.carryKind; pv.ins = ins; pv.d = go ? go.drop || 0 : 0; }
          else R.wk.set(e.id, { c: e.carry, k: e.carryKind, ins, d: go ? go.drop || 0 : 0 });
        }
      }
      // 생산 완료(유닛 등장)·건설 시작(건물 등장): sim 이벤트가 없으니 새 id 중 내 것을 본다(함재기 제외)
      if (state) {
        if (R.nextSeen < 0) R.nextSeen = state.nextId;
        else if (state.nextId > R.nextSeen) {
          let u = false, b = false;
          for (let i = state.ents.length - 1; i >= 0 && !(u && b); i--) {
            const e = state.ents[i]; if (e.id < R.nextSeen || e.owner !== R.me || e.parent) continue;
            if (!e.isB && !u) { u = true; R.sfx.push({ s: 'ready', id: e.id }); }
            else if (e.isB && !b) { b = true; R.sfx.push({ s: 'con_' + (e.def.race || 'legion'), id: e.id }); }
          }
          R.nextSeen = state.nextId;
        }
      }
      // 심장박동: 내 마지막 생산 건물이나 비싼 유닛(250 이상)이 체력 35% 아래로 공격받는 중(내 것만 보므로 정보 누수 없음)
      if (state && R.audio && R.audio.danger && (R.tick % 10) === 0) {
        let prod = 0, risk = null;
        for (const e of state.ents) if (e.owner === R.me && e.isB && e.def.trains && !(e.buildLeft > 0)) prod++;
        for (const e of state.ents) {
          if (e.owner !== R.me || e.hpMax <= 0 || e.hp / e.hpMax >= 0.35 || state.tick - e.lastHit > 40) continue;
          const c = e.def.cost || {};
          if (e.isB ? e.def.trains && prod === 1 : (c.crystal || 0) + (c.nebula || 0) >= 250) { risk = e; break; }
        }
        if (risk) R.audio.danger();
      }
      if (state) { // 다음 틱 죽음 판정용: 지금 내게 보이는 남의 엔티티(은폐·잠복 미탐지·안개 속 제외)
        const sp = R.seenPrev || (R.seenPrev = new Set());
        sp.clear();
        for (const e of state.ents) if (e.owner >= 0 && e.owner !== R.me && S.visible(state, R.me, e)) sp.add(e.id);
      }
      artTick(state);
    };

    // ---- 연출 그리기: 전부 R.draw 안에서 쓰는 헬퍼(그 프레임의 ptOf/fogAt 를 받는다) ----
    // 원거리 총구 섬광
    function muzzle(x, y, ux, uy, P, race, t, st) {
      const k = 1 - t / 1.6, z = st === 'shell' || st === 'missile' ? 1.6 : 1;
      if (race === 'swarm') { disc(x + ux * 4, y + uy * 4, 3 + 4 * k, P.core, k); return; }
      if (race === 'elysian') { disc(x, y, 4 + 4 * k, P.a, 0.9 * k); dot(x, y, 4, P.core, k); return; }
      if (t < 1) {
        if (z > 1) disc(x + ux * 4, y + uy * 4, 7, P.a, 0.9);
        dot(x, y, 6, P.core); dot(x + ux * 6 * z, y + uy * 6 * z, 4, P.a); dot(x + ux * 11 * z, y + uy * 11 * z, 2, P.a);
        dot(x - uy * 5 * z, y + ux * 5 * z, 2, P.a); dot(x + uy * 5 * z, y - ux * 5 * z, 2, P.a);
      } else dot(x + ux * 3, y + uy * 3, 4 * z, P.a, 0.7);
    }
    // 피격 불꽃(도착 순간). u: 0→1
    function sparks(x, y, P, seed, u, n, sp, fall) {
      for (let i = 0; i < n; i++) {
        const an = rnd(seed, i) * TAU, d = (3 + rnd(seed, i + 40) * sp) * easeOut(u);
        dot(x + Math.cos(an) * d, y + Math.sin(an) * d * 0.75 + fall * u * u, 2, u < 0.45 ? P.core : P.a, 1 - u);
      }
    }
    function fireball(x, y, s, a, P, seed) {
      if (a < 0) return;
      const nb = 2 + s * 2, life = 6 + s * 3, spread = 3 + s * 5, R0 = 5 + s * 4.5;
      if (a < 1.3) { const k = 1 - a / 1.3 * 0.35; disc(x, y, R0 * 1.5 * k + 3, ink, 1); disc(x, y, R0 * 1.5 * k, P.a, 1); disc(x - 2, y - 2, R0 * 0.95 * k, P.core, 1); }
      if (a < 3) {                                                   // 첫 순간의 파편 줄기(별 모양)
        const k = a / 3, nr = 5 + s * 2;
        for (let i = 0; i < nr; i++) {
          const an = (i + rnd(seed, 400 + i) * 0.6) / nr * TAU, r0 = R0 * (0.5 + k * 0.9), r1 = r0 + (6 + s * 5) * (1 - k);
          pline(x + Math.cos(an) * r0, y + Math.sin(an) * r0 * 0.8, x + Math.cos(an) * r1, y + Math.sin(an) * r1 * 0.8, 2, k < 0.4 ? P.core : P.a, 1 - k * 0.6);
        }
      }
      const blob = i => {
        const u = (a - i * 0.45) / life; if (u < 0 || u >= 1) return null;
        const ox = (rnd(seed, i * 3) - 0.5) * 2 * spread, oy = (rnd(seed, i * 3 + 1) - 0.5) * 1.4 * spread - u * (4 + s * 5);
        const grow = u < 0.3 ? 0.55 + u * 1.5 : 1 - (u - 0.3) * 0.9;
        return [u, ox, oy, R0 * (0.6 + rnd(seed, i * 3 + 2) * 0.6) * grow];
      };
      for (let i = 0; i < nb; i++) {                                 // 스프라이트처럼 어두운 외곽선을 먼저 깐다
        const b = blob(i); if (b && b[0] < 0.75) disc(x + b[1] + 1, y + b[2] + b[3] * 0.3, b[3] + 3, ink, 1 - b[0]);
      }
      for (let i = 0; i < nb; i++) {
        const b = blob(i); if (!b) continue;
        const [u, ox, oy, r] = b;
        const c = u < 0.1 ? P.core : u < 0.32 ? P.a : u < 0.62 ? P.b : P.c, cd = u < 0.32 ? P.b : P.c;
        disc(x + ox + 1, y + oy + r * 0.3, r, u < 0.7 ? cd : P.smoke2, 1);          // 아래쪽 그늘 → 덩어리감
        disc(x + ox, y + oy, r * 0.88, c, 1);
        if (u < 0.5) disc(x + ox - r * 0.2, y + oy - r * 0.3, r * 0.45, u < 0.16 ? P.core : P.a, 1);
      }
    }
    // 파편: 위로 튀었다가 중력으로 떨어져 바닥에 남고 사라진다. h0 = 시작 높이(px)
    function debris(x, y, h0, s, a, P, Q, seed, n) {
      const V = 2 + s * 1.3, g = 0.75, life = 14 + s * 6;
      for (let i = 0; i < n; i++) {
        const vx = (rnd(seed, 50 + i) - 0.5) * 2.6 * V, vy = (rnd(seed, 80 + i) - 0.5) * V, vz = (0.7 + rnd(seed, 110 + i)) * V * 1.25;
        const tl = (vz + Math.sqrt(vz * vz + 2 * g * h0)) / g, tt = Math.min(a, tl);
        const z = Math.max(0, h0 + vz * tt - 0.5 * g * tt * tt), ember = i % 3 === 0;
        if (ember && a > tl) continue;
        const fade = a > tl ? 1 - (a - tl) / life : 1; if (fade <= 0) continue;
        const sz = rnd(seed, 140 + i) < 0.4 ? 4 : 2;
        dot(x + vx * tt, y + vy * tt - z, sz, ember ? (a < tl * 0.5 ? P.core : P.a) : i & 1 ? Q.deb : Q.deb2, fade);
      }
    }
    function smoke(x, y, s, a, P, seed, alt) {
      const n = 2 + s * 2, life = 18 + s * 8;
      for (let i = 0; i < n; i++) {
        const u = (a - 2 - i * 1.6) / life; if (u < 0 || u >= 1) continue;
        const rise = u * (16 + s * 14) + alt, drift = (rnd(seed, 200 + i) - 0.5) * 16 * u + Math.sin((a + i * 7) * 0.22) * 2;
        const r = (3 + s * 3.5) * (0.5 + u * 0.9);
        disc(x + drift + (rnd(seed, 230 + i) - 0.5) * s * 8, y - rise - 6, r, u < 0.22 ? P.smoke2 : P.smoke, 0.72 * (1 - u) * Math.min(1, u * 8));
      }
    }
    // 용접 불꽃(레기온 건설·수리)
    function weld(x, y, id, tk) {
      const cyc = 4, n = Math.floor(tk / cyc), ph = (tk - n * cyc) / cyc, sd = hash(id, n), P = fxPal.legion;
      const on = hash(id, Math.floor(tk * 4)) & 3;                   // 아크 불빛이 불규칙하게 깜빡인다
      if (on) { disc(x, y, on === 3 ? 10 : 7, P.a, 0.4); dot(x, y, 6, ink); dot(x, y, 4, P.core); } else dot(x, y, 4, P.a);
      for (let k = 0; k < 7; k++) {
        const vx = (rnd(sd, k) - 0.5) * 26, vz = 6 + rnd(sd, k + 9) * 12, q = Math.min(1, ph * (0.8 + rnd(sd, k + 20) * 0.6));
        if (k % 3) dot(x + vx * q, y - vz * q + 20 * q * q, 2, P.a, 1 - q); else spk(x + vx * q, y - vz * q + 20 * q * q, P.a, 1 - q);
      }
    }

    // ===== 아트: 그림자·발광·파티클·생물 =====
    // 발광: 2px 계단 방사형 캔버스 캐시 — 색 6종(종족 발광 legion·swarm·elysian + 크리스탈·가스·불꽃) × 반지름 4·8·16·32.
    // 그리는 동안 GL 에 (x, y, r, ci, a) 를 모았다가 공중 유닛·연기 다음, 안개 전에 'lighter' 합성으로 한 번에. 화면 안만, 프레임당 200개(넘으면 버림).
    const GLOW_RGB = [A.shade(T['color-fire-hot'], 1), A.shade(T['color-gas'], 1.5), A.shade(T['elysian-b'], 1.3), A.shade(T.crystal, 1.2), A.shade(T['color-gas'], 1), A.shade(T['color-fire'], 1)];
    const GI = { legion: 0, swarm: 1, elysian: 2 }, GLOW_MAX = 200;
    const glowC = new Map(), GL = new Float32Array(GLOW_MAX * 5);
    let gN = 0;
    function glowCv(ci, r) {
      const q = r <= 4 ? 4 : r <= 8 ? 8 : r <= 16 ? 16 : 32, key = ci * 64 + q;
      let cv = glowC.get(key); if (cv) return cv;
      cv = document.createElement('canvas'); cv.width = cv.height = q * 2;
      const x = cv.getContext('2d'), c = GLOW_RGB[ci];
      for (let j = 0; j < q * 2; j += 2) for (let i = 0; i < q * 2; i += 2) {
        const d = Math.hypot(i + 1 - q, j + 1 - q) / q; if (d >= 1) continue;
        x.fillStyle = `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${Math.ceil(Math.pow(1 - d, 1.7) * 5) / 5 * 0.8})`;   // 5단 계단(매끈한 그라데이션 아님)
        x.fillRect(i, j, 2, 2);
      }
      glowC.set(key, cv); return cv;
    }
    const glow = (x, y, r, ci, a = 1) => {
      if (gN >= GLOW_MAX || a <= 0.03 || !onCam(x, y, r)) return;
      const k = gN * 5; GL[k] = x; GL[k + 1] = y; GL[k + 2] = r; GL[k + 3] = ci; GL[k + 4] = a; gN++;
    };
    function flushGlow() {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < gN; i++) {
        const k = i * 5, cv = glowCv(GL[k + 3], GL[k + 2]), q = cv.width / 2;
        ctx.globalAlpha = GL[k + 4] > 1 ? 1 : GL[k + 4]; ctx.drawImage(cv, P2(GL[k]) - q, P2(GL[k + 1]) - q);
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      R.glowLast = gN; gN = 0;
    }
    // 스프라이트 발광 지점(캔버스 좌표, 외곽선 1px 포함): 정의의 glow([[x, y, r]] 또는 f => 배열)가 우선,
    // 없으면 그 종족 발광색(racePal.glow)으로 칠한 픽셀을 8px 칸으로 묶어 찾는다(가동 프레임에 켜진 창·불꽃·눈만 잡힌다). 최대 6개.
    function glowPts(def, img, race, pose) {
      if (def.glow) { const g = typeof def.glow === 'function' ? def.glow(A.parsePose(pose)) : def.glow; return g && g.length ? g.map(([x, y, r]) => [x + 1, y + 1, r || 8]) : null; }
      const ci = GI[race]; if (ci === undefined) return null;
      const g = GLOW_RGB[ci].map(v => Math.round(Math.min(255, v))), d = img.data, W = img.width, H = img.height, cells = new Map();
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        if (d[i + 3] && Math.abs(d[i] - g[0]) < 4 && Math.abs(d[i + 1] - g[1]) < 4 && Math.abs(d[i + 2] - g[2]) < 4) {
          const k = Math.floor(y / 12) * 64 + Math.floor(x / 12); let c = cells.get(k); if (!c) cells.set(k, c = [0, 0, 0]); c[0] += x; c[1] += y; c[2]++;
        }
      }
      const pts = [...cells.values()].sort((a, b) => b[2] - a[2]).slice(0, 4).map(([sx, sy, n]) => [sx / n + 0.5, sy / n + 0.5, n >= 14 ? 16 : 8]);
      return pts.length ? pts : null;
    }
    // 공중 그림자: 'sh'(void 실루엣) 스프라이트를 지면(o.y + 4)에 세로 0.5배·알파 .28, 높이 × 0.4 만큼 오른쪽으로
    function airShadow(s, x, y, lift, flip) {
      const dw = s.w * s.px, dh = s.h * s.px;
      ctx.save(); ctx.globalAlpha = 0.28; ctx.translate(Math.round(x + lift * 0.4), Math.round(y + 4)); ctx.scale(flip ? -1 : 1, 0.5);
      ctx.drawImage(s.cv, Math.round(-dw / 2), Math.round(-dh / 2), dw, dh); ctx.restore();
    }

    // 파티클 풀: (x, y, z, vx, vy, vz, age, ttl) × 600, 종류 0 연기 1 불티 2 먼지 3 파편 4 증기 5 불꽃. 고리 버퍼 — 꽉 차면 가장 먼저 생긴 것을 덮어쓴다.
    // 나이·위치는 sim 틱마다(addEvents) 갱신 → 배속·프레임률과 무관. 무작위는 hash(id, sim 틱) → 리플레이 동일.
    const PT_MAX = 600, PT = { n: 0, f: new Float32Array(PT_MAX * 8), k: new Uint8Array(PT_MAX), head: 0 };
    const PK = [[-0.004, 44, 18], [0.05, 18, 10], [0, 18, 8], [0.38, 30, 10], [-0.003, 28, 10], [0.25, 8, 6]];   // [중력, 수명, 수명 폭]
    function ptSpawn(k, x, y, z, seed) {
      const i = PT.head, f = PT.f, o = i * 8, r = j => rnd(seed, j) - 0.5;
      PT.head = (i + 1) % PT_MAX;
      if (f[o + 6] >= f[o + 7]) PT.n++;
      let vx = r(1), vy = r(2), vz = r(3) + 0.5;
      if (k === 0) { vx = vx * 0.3 + 0.12; vy *= 0.1; vz = 0.75 + vz * 0.45; }            // 연기: 동쪽으로 살짝 흘러간다
      else if (k === 1) { vx *= 1.2; vy *= 0.4; vz = 1.1 + vz; }
      else if (k === 2) { vx *= 0.5; vy *= 0.3; vz = 0.1 + vz * 0.15; }
      else if (k === 3) { vx *= 3.2; vy *= 1.6; vz = 2 + vz * 2; }
      else if (k === 4) { vx = vx * 0.25 + 0.1; vy = 0; vz = 0.7 + vz * 0.4; }
      else { vx *= 4; vy *= 2; vz = 1 + vz * 2; }
      f[o] = x; f[o + 1] = y; f[o + 2] = z; f[o + 3] = vx; f[o + 4] = vy; f[o + 5] = vz; f[o + 6] = 0; f[o + 7] = PK[k][1] + (r(4) + 0.5) * PK[k][2];
      PT.k[i] = k;
    }
    function ptTick() {
      const f = PT.f; let n = 0;
      for (let i = 0; i < PT_MAX; i++) {
        const o = i * 8; if (f[o + 6] >= f[o + 7]) continue;
        if (++f[o + 6] >= f[o + 7]) continue;
        const k = PT.k[i]; n++;
        f[o] += f[o + 3]; f[o + 1] += f[o + 4]; f[o + 2] += f[o + 5]; f[o + 5] -= PK[k][0];
        if (k === 1) f[o + 3] = f[o + 3] * 0.92 + Math.sin(f[o + 6] * 0.7 + i) * 0.12;   // 불티: 흔들리며 오른다
        if (f[o + 2] < 0) { f[o + 2] = 0; if (k === 3) { f[o + 3] *= 0.3; f[o + 4] *= 0.3; f[o + 5] = 0; } else if (k === 5) f[o + 7] = f[o + 6]; }
      }
      PT.n = n;
    }
    // 건물 연기 지점(월드 px): 정의의 smoke([[x, y]] 스프라이트 좌표)가 우선, 없으면 SMOKE_FB, 그것도 없으면 터 위쪽 두 점
    const SMOKE_FB = { garrison: [[110, 28]] };
    function smokePts(e, chimneyOnly) {
      const def = A.def(e.type), sp = def.smoke || SMOKE_FB[e.type];
      if (sp) return sp.map(([x, y]) => [e.tx * TILE + x, e.ty * TILE - def.oy + y]);
      if (chimneyOnly) return null;
      const bw = e.def.w * TILE, bh = e.def.h * TILE;
      return [[e.tx * TILE + bw * 0.32, e.ty * TILE + bh * 0.3], [e.tx * TILE + bw * 0.66, e.ty * TILE + bh * 0.45]];
    }
    const inGas = h => !!h && !!h.order && h.order.type === 'gather' && h.order.kind === 1 && h.order.phase === 'mine';
    // 3b 마법·상태·종족 특성 연출(fx3b.js, 없으면 끈다). 키 목록은 fx3b.js 머리말
    const X3 = typeof NW_FX3B !== 'undefined' ? NW_FX3B.create({ ctx, S, D, A, T, FP, TILE, R, disc, dot, pline, spk, glow, pushFx, ptSpawn, shakeReq, onCam, rnd, hash, P2, easeOut, RM, col, fxPal, ecoCol, css, ink }) : null;
    // 틱마다(addEvents 끝): 파티클 나이·위치 + 생성. 화면 안(R.lastVis)이고 그 자리가 지금 보이는(fog 2) 것만.
    function artTick(state) {
      ptTick();
      const vis = R.lastVis; if (!state || !vis) return;
      const tkS = state.tick, fogMe = state.fog[R.me], MW = state.map.w;
      const seen2 = (x, y) => fogMe[Math.floor(y / TILE) * MW + Math.floor(x / TILE)] === 2;
      let cover = null;
      for (const o of vis.values()) {
        const e = o.e;
        if (e.isB) {
          if (e.buildLeft > 0 || e.lifted || e.hp <= 0 || !seen2(e.x / FP, e.y / FP)) continue;
          const dm = e.burning ? 2 : e.hpMax > 0 ? A.dmgStage(e.hp, e.hpMax) : 0;
          const pts = dm >= 1 && (tkS + e.id) % (dm === 2 ? 2 : 4) === 0 ? smokePts(e) : null; // smoke: [] 인 건물(연기 없음)은 건너뜀
          if (pts && pts.length) {
            const p = pts[(tkS >> 2) % pts.length];
            ptSpawn(0, p[0], p[1], 0, hash(e.id, tkS));
            if (dm === 2) ptSpawn(1, p[0], p[1], 2, hash(e.id, tkS + 1));
          }
          if ((tkS + e.id) % 8 === 0) {
            if (e.def.onVent) { if (e.harvester && inGas(S.byId(state, e.harvester))) ptSpawn(0, e.x / FP, e.ty * TILE + 6, 0, hash(e.id, tkS + 2)); }
            else if (e.def.race === 'legion' && !e.unpowered) { const c = smokePts(e, true); if (c) for (const p of c) ptSpawn(0, p[0], p[1], 0, hash(e.id, tkS + 3)); }
          }
        } else if (e.type === 'vent') {
          if ((tkS + e.id) % 6 || !seen2(e.x / FP, e.y / FP)) continue;
          if (!cover) { cover = new Set(); for (const b of state.ents) if (b.isB && b.def.onVent) cover.add(b.tx + ',' + b.ty); }
          if (!cover.has(e.tx + ',' + e.ty)) ptSpawn(4, e.x / FP + (rnd(e.id, tkS) - 0.5) * 12, e.y / FP, 4, hash(e.id, tkS));
        } else if (!e.isR && !e.def.air && e.def.radius >= 12 && (tkS + e.id) % 6 === 0 && Math.abs(e.x - e.px) + Math.abs(e.y - e.py) > 4) {
          const x = e.x / FP, y = e.y / FP; if (!seen2(x, y)) continue;
          ptSpawn(2, x + (rnd(e.id, tkS) - 0.5) * e.def.radius, y + 3, 0, hash(e.id, tkS));
        }
      }
    }
    // 그리기: layer 0 = 파편(지상 유닛 다음), 1 = 나머지(공중 유닛 다음 — 위로 피어오른다)
    function drawPts(layer, alpha, fogAt, dustC) {
      const f = PT.f, P = fxPal.legion;
      for (let i = 0; i < PT_MAX; i++) {
        const o = i * 8, age = f[o + 6], ttl = f[o + 7]; if (age >= ttl) continue;
        const k = PT.k[i]; if ((k === 3) !== (layer === 0)) continue;
        const x = f[o] + f[o + 3] * alpha, y = f[o + 1] + f[o + 4] * alpha, z = Math.max(0, f[o + 2] + f[o + 5] * alpha), u = (age + alpha) / ttl;
        if (!onCam(x, y - z, 24) || !fogAt(x, y)) continue;
        const sy = y - z;
        if (k === 0) { const a = 0.75 * (1 - u) * Math.min(1, u * 5), r = 3 + u * 10 + (i & 3); disc(x + 1, sy + 1, r, P.smoke2, a * 0.8); disc(x - 1, sy - 1, r * 0.75, u < 0.15 ? P.smoke2 : P.smoke, a); }   // 연기: 아래 그늘 + 위 밝은 덩이
        else if (k === 1) dot(x, sy, 2, u < 0.4 ? col.fireHot : col.fire, 1 - u * u);
        else if (k === 2) disc(x, sy, 3 + u * 6, dustC, 0.45 * (1 - u));
        else if (k === 3) dot(x, sy, i & 1 ? 4 : 2, i & 2 ? P.deb : P.deb2, u > 0.75 ? (1 - u) * 4 : 1);
        else if (k === 4) disc(x, sy, 3 + u * 7, ecoCol.glint, 0.3 * (1 - u) * Math.min(1, u * 8));
        else spk(x, sy, col.fireHot, 1 - u);
      }
      ctx.globalAlpha = 1;
    }

    // 생물: art.js A.critters 의 위치 → 흩어짐(반경 5타일 안 가장 가까운 보이는 유닛·화면 안 착탄점 반대쪽으로 (5 − d)/5 × 3타일).
    // 현재 상태만의 순수 함수(프레임 상태 없음) → 리플레이 같은 틱이면 같은 자리. 밀린 뒤 바위 위·안개 아래면 그리지 않는다.
    let crInfo = null, crRock = null, crMap = 'crossing';
    const crOut = [], crSrc = [];
    function critterInfo(state) {
      if (state.map.rock !== crRock) {
        crRock = state.map.rock;
        crInfo = { id: state.map.id, w: state.map.w, h: state.map.h, rock: state.map.rock, vents: state.ents.filter(e => e.type === 'vent').map(e => [e.x / FP, e.y / FP]) };
      }
      return crInfo;
    }
    function placeCritters(state, alpha, ground, air, fogAt) {
      const n = A.critters(critterInfo(state), state.tick + alpha, crOut), MW = state.map.w, rock = state.map.rock, SR = 5 * TILE;
      crSrc.length = 0;
      for (const o of ground) if (o.vis) crSrc.push(o.x, o.y);
      for (const o of air) if (o.vis && !o.e.isB) crSrc.push(o.x, o.y);
      for (const f of R.fx) if (f.k === 'shot' && f.init && f.ttl > f.age && f.bx !== undefined && onCam(f.bx, f.by, 0)) crSrc.push(f.bx, f.gy === undefined ? f.by : f.gy);
      for (let i = 0; i < n; i++) {
        const c = crOut[i]; c.hide = true;
        if (!onCam(c.x, c.y, 260)) continue;
        if (c.kind !== 'firefly') {
          let bd = SR * SR, bx = 0, by = 0;
          for (let j = 0; j < crSrc.length; j += 2) { const dx = c.x - crSrc[j], dy = c.y - crSrc[j + 1], d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; bx = dx; by = dy; } }
          if (bd < SR * SR) {
            const d = Math.sqrt(bd), push = (SR - d) / SR * 3 * TILE;
            const ux = d > 0.5 ? bx / d : Math.cos(i * 2.4), uy = d > 0.5 ? by / d : Math.sin(i * 2.4);
            c.x += ux * push; c.y += uy * push;
            if (c.kind === 'beast') c.dir = A.dirOf(ux, uy, c.dir);
          }
          if (c.kind === 'beast') { const tx = Math.floor(c.x / TILE), ty = Math.floor(c.y / TILE); if (tx < 0 || ty < 0 || tx >= MW || ty >= state.map.h || rock[ty * MW + tx]) continue; }
        }
        if (!onCam(c.x, c.y - c.alt, 40) || !fogAt(c.x, c.y)) continue;
        c.hide = false;
      }
      return n;
    }
    const crPose = c => c.i ? A.poseKey(c.dir, 'move', 1) : A.poseKey(c.dir, 'idle', 0);
    function drawBeasts(n) {
      for (let i = 0; i < n; i++) {
        const c = crOut[i]; if (c.hide || c.kind !== 'beast') continue;
        const s = sprite('critter@beast', crPose(c));
        ctx.fillStyle = col.shadow; ctx.beginPath(); ctx.ellipse(c.x + 2, c.y + 3, 6, 2.5, 0, 0, 6.2832); ctx.fill();
        blit(s, c.x, c.y + 4 - (s.oy - s.h / 2) * s.px, !!A.FLIP_DIR[c.dir]);
      }
    }
    function drawBirds(n, shadowPass) {
      for (let i = 0; i < n; i++) {
        const c = crOut[i]; if (c.hide || c.kind !== 'bird') continue;
        const pose = A.poseKey(c.dir, 'move', c.i), flip = !!A.FLIP_DIR[c.dir];
        if (shadowPass) airShadow(sprite('critter@bird', pose, 'sh'), c.x, c.y, c.alt, flip);
        else blit(sprite('critter@bird', pose), c.x, c.y - c.alt, flip);
      }
    }
    function drawFireflies(n) {
      for (let i = 0; i < n; i++) {
        const c = crOut[i]; if (c.hide || c.kind !== 'firefly') continue;
        const y = c.y - c.alt;
        if (c.i) glow(c.x, y, 8, 4, 0.75);
        dot(c.x, y, 2, c.i ? ecoCol.gasL : ecoCol.gas, c.i ? 1 : 0.5);
      }
      ctx.globalAlpha = 1;
    }

    R.draw = (state, alpha, view) => {
      // me = 안개·소리 기준(선택한 시야). 색은 me 와 무관한 플레이어 고유색(colorIdx) — 시야를 바꿔도 색은 그대로.
      const me = view.me; R.me = me; R.players = state.players; crMap = state.map.id; gN = 0;
      const W = canvas.width, H = canvas.height;
      const cx = Math.max(0, Math.round(view.camX)), cy = Math.round(view.camY);
      const tk = R.tick + alpha;                                  // 연출 시계(틱, 소수)
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = col.fog; ctx.fillRect(0, 0, W, H);
      // 화면 흔들림: 큰 폭발 때만, 프레임 단위 감쇠. 데모 화면·감소된 움직임 설정에서는 끈다.
      let shx = 0, shy = 0;
      if (R.shake) {
        if (!view.noShake && !RM.matches) {
          const k = R.shake.n / R.shake.N, h = hash(R.shake.n, R.tick);
          shx = Math.round(((h & 255) / 127.5 - 1) * R.shake.amp * k); shy = Math.round((((h >> 8) & 255) / 127.5 - 1) * R.shake.amp * k);
        }
        if (--R.shake.n <= 0) R.shake = null;
      }
      ctx.translate(-cx + shx, -cy + shy);
      R.cam = { x: cx, y: cy, w: W, h: H };
      const tx0 = Math.max(0, Math.floor(cx / TILE)), ty0 = Math.max(0, Math.floor(cy / TILE));
      const MW = state.map.w, tx1 = Math.min(MW - 1, Math.floor((cx + W) / TILE)), ty1 = Math.min(state.map.h - 1, Math.floor((cy + H) / TILE));

      // 1) 지형 + 점막
      terrain(state, tx0, ty0, tx1, ty1);

      // 2) 엔티티 수집(화면 밖·안 보이는 적·가스 건물 안 일꾼 제외, 보간 적용)
      const inside = e => !!e.order && e.order.type === 'gather' && e.order.kind === 1 && e.order.phase === 'mine';
      const flat = [], blds = [], ground = [], air = [], vis = new Map();
      const L = cx - 80, Rr = cx + W + 80, Tp = cy - 80, Bt = cy + H + 80;
      for (const e of state.ents) {
        if (!e.isB && (inside(e) || e.inside)) continue;             // 가스 건물 안 일꾼 · 3a 탑승 유닛
        const sn = seen(state, me, e); if (!sn.draw) continue;
        let x, y;
        if (e.isB || isRes(e)) { x = e.x / FP; y = e.y / FP; }
        else { x = (e.px + (e.x - e.px) * alpha) / FP; y = (e.py + (e.y - e.py) * alpha) / FP; }
        if (x < L || x > Rr || y < Tp || y > Bt) continue;
        const o = { e, x, y, vis: sn.vis, lift: 0 };
        vis.set(e.id, o);
        if (isRes(e)) flat.push(o);                           // 크리스탈·분출구: 건물보다 먼저(분출구 위 가스 건물이 덮는다)
        else if (e.isB) { if (e.lifted) { o.lift = LIFT_B; air.push(o); } else blds.push(o); }
        else if (e.def.air) { o.lift = liftOf(e.def); air.push(o); }
        else ground.push(o);
      }
      // 건물 좌상단 픽셀: 띄운 건물은 타일 정렬(e.tx)이 아니라 실제 위치(e.x/e.y)를 따른다
      const foot = e => e.lifted ? [e.x / FP - e.def.w * TILE / 2, e.y / FP - e.def.h * TILE / 2] : [e.tx * TILE, e.ty * TILE];
      const byY = (a, b) => a.y - b.y;
      blds.sort(byY); ground.sort(byY); flat.sort(byY);

      const fogMe = state.fog[me];
      const fogAt = (x, y) => fogMe[Math.floor(y / TILE) * MW + Math.floor(x / TILE)] === 2;
      const lastPos = R.lastPos;
      for (const o of vis.values()) if (!o.e.isB && !isRes(o.e)) lastPos.set(o.e.id, [o.x, o.y]);
      // 반환: [몸 중심 x, y, 바닥 x, 바닥 y]
      const ptOf = (id, dead) => {
        const O = vis.get(id);
        if (O) return [O.x, O.y - (O.e.isB ? 10 : 8) - O.lift, O.x, O.y];
        if (dead) { const d = D.units[dead.type], lf = d && d.air ? liftOf(d) : 0; return [dead.x / FP, dead.y / FP - 8 - lf, dead.x / FP, dead.y / FP]; }
        const l = lastPos.get(id); return l ? [l[0], l[1] - 8, l[0], l[1]] : null;
      };
      const hitNow = id => { const h = R.hitAt.get(id); return h !== undefined && tk >= h && tk < h + 1.4; };

      // 2c) 바닥 그을음 자국 (지형 바로 위, 수 초 페이드)
      for (const f of R.fx) {
        if (f.k !== 'scorch' || !onCam(f.x, f.y, f.r + 8) || !fogAt(f.x, f.y)) continue;
        const a = f.age + alpha, fade = Math.min(1, (f.ttl - a) / 50) * Math.min(1, a / 3);
        disc(f.x, f.y + 2, f.r * 0.8, f.pal.mark, 0.35 * fade, 0.55);              // 가운데는 옅게, 가장자리는 얼룩
        for (let i = 0; i < 6; i++) disc(f.x + (rnd(f.seed, i) - 0.5) * f.r * 1.5, f.y + 2 + (rnd(f.seed, i + 9) - 0.5) * f.r * 0.7, f.r * (0.2 + rnd(f.seed, i + 20) * 0.25), f.pal.mark, 0.45 * fade, 0.6);
        for (let i = 0; i < 5; i++) dot(f.x + (rnd(f.seed, i + 40) - 0.5) * f.r * 2, f.y + 2 + (rnd(f.seed, i + 50) - 0.5) * f.r, 2, f.pal.mark, 0.6 * fade);
      }
      ctx.globalAlpha = 1;
      // 2d) 잔해: 그을음 바로 위, 마지막 60틱 동안 페이드
      for (const f of R.fx) {
        if (f.k !== 'wreck' || !onCam(f.x, f.y, 40) || !fogAt(f.x, f.y)) continue;
        const s = sprite(f.type), a = f.age + alpha;
        blit(s, f.x, f.y + 2 - (s.oy - s.h / 2), !!f.flip, Math.max(0, Math.min(1, (f.ttl - a) / 60)));
      }

      // 2e) 레이 라인(§6 E2): 엘리시안 기둥 사이 연결선(건물 아래). 내·팀 기둥은 항상, 적은 두 기둥 모두 그릴 수 있을 때만
      //     (보이거나 발자국이 탐색됨 — 건물 그리기 seen()과 같은 기준). 흐린 픽셀 선 + 선을 따라 흐르는 결정 반짝임.
      {
        const P = fxPal.elysian, h = TILE / 2;
        for (let p = 0; p < state.players.length; p++) {
          if (state.players[p].race !== 'elysian') continue;
          const net = S.powerNet(state, p), py = net.pylons, foe = S.isEnemy(state, me, p);
          for (const [i, j] of net.links) {
            const a = py[i], b = py[j];
            if (foe) { const ea = S.byId(state, a.id), eb = S.byId(state, b.id); if (!ea || !eb || !seen(state, me, ea).draw || !seen(state, me, eb).draw) continue; }
            const x0 = a.x2 * h, y0 = a.y2 * h, x1 = b.x2 * h, y1 = b.y2 * h, len = Math.hypot(x1 - x0, y1 - y0);
            if (!onCam((x0 + x1) / 2, (y0 + y1) / 2, len / 2 + 16)) continue;
            pline(x0, y0, x1, y1, 4, P.c, 0.22);
            pline(x0, y0, x1, y1, 2, P.b, 0.4);
            const ph = RM.matches ? 0 : tk * 1.5, seed = (a.id * 7 + b.id) % 48;
            for (let d = (ph + seed) % 48; d < len; d += 48) {
              const u = d / len, fade = Math.sin(Math.PI * u);              // 기둥 근처에서 잦아든다
              dot(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, 4, P.a, 0.55 * fade);
              dot(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, 2, P.core, 0.8 * fade);
            }
          }
        }
        ctx.globalAlpha = 1;
      }

      // 3) 자원(크리스탈·분출구) → 건물
      for (const o of flat) {
        const e = o.e, def = A.def(e.type);
        let st = 0;                                                                 // 크리스탈 고갈 단계: 발자국이 보이는 동안만 갱신, 안개 속은 마지막 본 값
        if (e.type === 'crystal') {
          let seenNow = false;
          for (let j = 0; j < e.def.h && !seenNow; j++) for (let i = 0; i < e.def.w; i++) if (fogMe[(e.ty + j) * MW + e.tx + i] === 2) { seenNow = true; break; }
          if (seenNow) R.cMem.set(e.id, A.crystalStage(e.amount));
          st = R.cMem.get(e.id) || 0;
        }
        const nw = (def.frames && def.frames.work) || 0;
        const s = sprite(e.type, e.type === 'crystal' ? 's' + st : nw ? 'w' + (Math.floor(tk / 8) + e.id) % nw : '');   // 터 좌상단 기준(건물과 같은 규칙)
        const rx = e.tx * TILE - 1, ry = e.ty * TILE - 1 - def.oy;
        ctx.drawImage(s.cv, rx, ry, s.w, s.h);
        if (e.type === 'crystal' && o.vis) {                                        // 반짝임: 90틱 주기 중 1/4 확률로 12틱 동안 대각 띠가 훑는다
          const n = Math.floor(tk / 90), ph = tk - n * 90;
          if (ph < 12 && hash(e.id, n) % 4 === 0) { ctx.globalAlpha = 0.85; ctx.drawImage(glint(s, st, Math.floor(ph / 12 * 7)), rx, ry); ctx.globalAlpha = 1; }
        }
      }
      for (const o of flat) if (fogAt(o.x, o.y)) { if (o.e.type === 'crystal') glow(o.x, o.y - 8, 16, 3, 0.25); else if (o.e.type === 'vent') glow(o.x, o.y, 16, 4, 0.3); }
      const progBar = (e, prog, color) => {
        const [fx, fy] = foot(e), bw = e.def.w * TILE - 12, by2 = fy + e.def.h * TILE - 14 + (e.lifted ? -LIFT_B : 0);
        ctx.fillStyle = col.track; ctx.fillRect(fx + 5, by2 - 1, bw + 2, 6);
        ctx.fillStyle = color; ctx.fillRect(fx + 6, by2, Math.round(bw * Math.max(0, Math.min(1, prog))), 4);
      };
      const shieldPop = (x, y, rx, k) => { disc(x, y, rx, fxPal.elysian.a, 0.22 * k, 0.75); disc(x, y, rx, fxPal.elysian.a, 0.95 * k, 0.75, 1); };
      // 소유 표식: 선택하지 않아도 누구 것인지 — 유닛 발밑 플레이어색 고리, 건물 터 네 모서리 꺾쇠(같은 종족끼리도 구분)
      const ownerDisc = (x, y, rx, owner) => {
        if (owner < 0) return;
        const c = col.player[colorIdx(owner)], ry = Math.max(3, rx * 0.5);
        ctx.fillStyle = c; ctx.strokeStyle = c; ctx.lineWidth = 2;
        ctx.globalAlpha = 0.22; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 0.95; ctx.stroke(); ctx.globalAlpha = 1;
      };
      const ownerCorners = (e, x, y, w, h) => {
        if (e.owner < 0) return;
        const k = Math.max(6, Math.min(12, Math.round(Math.min(w, h) * 0.2))), t = 3;
        ctx.fillStyle = col.track;                                                  // 어두운 받침(밝은 바닥·스프라이트 위에서도 읽히게)
        for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
          ctx.fillRect(sx > 0 ? cx - 1 : cx - k - 1, sy > 0 ? cy - 1 : cy - t - 1, k + 2, t + 2); ctx.fillRect(sx > 0 ? cx - 1 : cx - t - 1, sy > 0 ? cy - 1 : cy - k - 1, t + 2, k + 2);
        }
        ctx.fillStyle = col.player[colorIdx(e.owner)];
        for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
          ctx.fillRect(sx > 0 ? cx : cx - k, sy > 0 ? cy : cy - t, k, t); ctx.fillRect(sx > 0 ? cx : cx - t, sy > 0 ? cy : cy - k, t, k);
        }
      };
      const drawBuilding = (o, dy) => {
        const e = o.e, def = A.def(e.type);
        const morph = e.morph && D.buildings[e.morph.to] ? e.morph : null;
        const liveBuilding = e.buildLeft > 0 && !morph;
        // 건설 3단(b0..b2) / 가동 프레임(w0..). 건설 단계·손상 단계·전력 부족은 보일 때만 갱신(안개 속은 마지막 본 값; 본 적 없으면 b0)
        let mem = R.bMem.get(e.id); if (!mem) R.bMem.set(e.id, mem = { d: 0, u: false, b: liveBuilding ? 0 : -1 });
        if (o.vis) { mem.b = liveBuilding ? A.buildStage(1 - e.buildLeft / e.def.time) : -1; mem.d = !liveBuilding && e.hpMax > 0 ? A.dmgStage(e.hp, e.hpMax) : 0; mem.u = !!e.unpowered && e.buildLeft <= 0; }
        const building = mem.b >= 0, prog = liveBuilding ? 1 - e.buildLeft / e.def.time : 1;
        const dmg = mem.d, dim = mem.u;
        const lf = e.lifted && def.frames && def.frames.lift;                    // 띄운 건물: 분사구 자세(l0..)
        const pose = building ? 'b' + mem.b : lf ? 'l' + (Math.floor(tk / 3) + e.id) % lf + (dmg ? 'd' + dmg : '') : 'w' + (Math.floor(tk / 5) + e.id) % ((def.frames && def.frames.work) || 1) + (dmg ? 'd' + dmg : '');
        const s = sprite(e.type, pose, dim ? 'dim' : '');
        const [fx, fy] = foot(e), bx = fx - 1, by = fy - 1 - def.oy - dy, dw = s.w * s.px, dh = s.h * s.px;
        const bwp = e.def.w * TILE, bhp = e.def.h * TILE;
        if (building) {
          ctx.drawImage(s.cv, bx, by, dw, dh);
          ctx.globalAlpha = 1;
          if (o.vis && e.def.race === 'swarm') {                        // 점막 거품이 부풀었다 터진다
            const P = fxPal.swarm;
            for (let k = 0; k < 7; k++) {
              const per = 16, t0 = tk + k * per / 7 + e.id, n = Math.floor(t0 / per), ph = (t0 - n * per) / per, hs = hash(e.id * 13 + k, n);
              const x = fx + 6 + (hs & 1023) / 1023 * (bwp - 12), y = fy + bhp * 0.8 - ph * bhp * 0.45 - dy;
              disc(x, y, 2 + ph * 4, k % 3 ? P.a : P.core, 0.85 * (1 - ph * ph), 1, ph > 0.6 ? 1 : 0);
            }
          } else if (o.vis && e.def.race === 'elysian') {               // 소환 중: 청록 입자가 나선으로 모인다
            const P = fxPal.elysian, mx = fx + bwp / 2, my = fy + bhp / 2 - dy;
            disc(mx, my, bwp * 0.48 * (0.92 + 0.08 * Math.sin(tk * 0.5)), P.b, 0.4, 0.62, 1);
            for (let k = 0; k < 10; k++) {
              const per = 20, t0 = tk + k * 2, n = Math.floor(t0 / per), ph = (t0 - n * per) / per, an = rnd(hash(e.id, k), n) * TAU + ph * 3, rr = (1 - ph) * bwp * 0.55;
              dot(mx + Math.cos(an) * rr, my + Math.sin(an) * rr * 0.62 - ph * 8, ph > 0.7 ? 4 : 2, ph > 0.7 ? P.core : P.a, Math.min(1, ph * 4));
            }
          }
          ctx.globalAlpha = 1;
          ownerCorners(e, fx + 1, fy + 1 - dy, bwp - 2, bhp - 2);
          if (o.vis) progBar(e, prog, col.accent);
        } else {
          ctx.drawImage(s.cv, bx, by, dw, dh);
          if (o.vis && !dim) {                                                    // 발광: 창·불꽃·눈(가동 프레임) / 엘리시안 대체 / 화재(손상 2단)
            const ci = GI[e.def.race] ?? 0;
            if (s.gl) for (const [gx, gy, r] of s.gl) glow(bx + gx * s.px, by + gy * s.px, r, ci, 0.5);
            else if (e.def.race === 'elysian') glow(bx + dw / 2, by + dh * 0.45, 16, 2, 0.35);
            if (e.burning || (e.hpMax > 0 && A.dmgStage(e.hp, e.hpMax) === 2)) for (const [px, py] of smokePts(e)) glow(px, py - dy, 16, 5, 0.4 + 0.25 * ((hash(e.id, Math.floor(tk / 2)) & 3) / 3));
          }
          if (!e.isR) ownerCorners(e, fx + 1, fy + 1 - dy, bwp - 2, bhp - 2);
          if (o.vis && hitNow(e.id)) {
            if (e.shield > 0) shieldPop(fx + bwp / 2, fy + bhp / 2 - dy, Math.max(bwp, bhp) * 0.6, 1);
            else { ctx.globalAlpha = 0.7; ctx.drawImage(sprite(e.type, pose, 'flash').cv, bx, by, dw, dh); ctx.globalAlpha = 1; }
          }
          if (e.def.onVent && e.harvester && o.vis) {                   // 가스 건물 안에서 일꾼이 일하는 중: 맥동 + 가스 구름
            const h = S.byId(state, e.harvester);
            if (h && inside(h)) {
              const mx = fx + bwp / 2, pulse = 0.5 + 0.5 * Math.sin(tk * 0.9);
              disc(mx, fy + bhp * 0.55 - dy, bwp * 0.42, ecoCol.gas, 0.12 + 0.14 * pulse, 0.6);
              for (let k = 0; k < 3; k++) {
                const per = 15, t0 = tk + k * 5, ph = (t0 % per) / per;
                disc(mx - 6 + k * 6 + Math.sin(ph * 6 + k) * 3, fy + 6 - dy - ph * 26, 3 + ph * 6, k === 1 ? ecoCol.gasL : ecoCol.gas, 0.7 * (1 - ph) * Math.min(1, ph * 6));
              }
              ctx.globalAlpha = 1;
            }
          }
          if (morph) { if (o.vis) progBar(e, 1 - morph.left / D.buildings[morph.to].time, col.warn); }
          else if (e.owner === me && e.queue && e.queue.length && !e.def.larva) {      // 생산·연구 진행(내 건물)
            const q = e.queue[0], total = q.research
              ? ((D.upgrades[q.research] && (D.upgrades[q.research].time[(state.players[e.owner].up && state.players[e.owner].up[q.research]) || 0] || D.upgrades[q.research].time[0])) || 0)
              : ((D.units[q.what] && D.units[q.what].time) || 0);
            if (total > 0 && q.left !== undefined) progBar(e, 1 - q.left / total, q.research ? col.shield : col.accent);
          }
        }
      };
      for (const o of blds) { const e = o.e; const bm = R.bMem.get(e.id); if (!(bm ? bm.b >= 0 : e.buildLeft > 0)) bshadow(e.type, e.tx * TILE, e.ty * TILE + e.def.h * TILE); drawBuilding(o, 0); }

      // ── 3a: 마법 이펙트 ── 폭풍 구름(area_dot) · 스캔 빛기둥(reveal) · 치료 십자 · 합체 섬광. sim 상태(state.fx)는 읽기만 한다.
      const spellFx = (state, tk, alpha, fogAt, me) => {
        const ally = o => o >= 0 && !S.isEnemy(state, me, o);
        for (const f of state.fx) {
          const x = f.x / FP, y = f.y / FP;
          if (f.kind === 'area_dot' && !(X3 && X3.ownsAreaDot(f))) {
            const r = f.r / FP; if (!onCam(x, y, r + 40) || !(fogAt(x, y) || ally(f.owner))) continue;
            const L = D.abilities[f.ab].effect.left, k = Math.min(1, f.left / 12) * Math.min(1, (L - f.left + alpha) / 4); // 처음 4틱 피어오르고 끝 12틱 흐려짐
            disc(x, y + 2, r, col.storm, 0.16 * k, 0.6);                                     // 바닥 그늘
            disc(x, y + 2, r, col.storm, 0.7 * k, 0.6, 2);                                   // 가장자리
            for (let i = 0; i < 9; i++) {                                                    // 구름 덩이(천천히 맴돈다)
              const an = rnd(f.id, i) * TAU + tk * 0.04 * (i & 1 ? 1 : -1), rr = r * (0.25 + 0.6 * rnd(f.id, i + 20));
              const px = x + Math.cos(an) * rr, py = y - 26 + Math.sin(an) * rr * 0.45;
              disc(px, py, 10 + rnd(f.id, i + 40) * 10, i % 3 ? col.storm : col.stormDk, 0.55 * k, 0.6);
            }
            const n = Math.floor(tk / 3);                                                     // 번개: 3틱마다 새 갈래 2개
            for (let j = 0; j < 2; j++) {
              const h = hash(f.id * 7 + j, n), ph = (tk / 3) - n; if (ph > 0.7) continue;
              const an = (h & 1023) / 1023 * TAU, rr = r * ((h >> 10 & 255) / 255) * 0.85;
              const bx = x + Math.cos(an) * rr, by = y + Math.sin(an) * rr * 0.6, ty0 = by - 34;
              let px = bx + ((h >> 18 & 15) - 8), py = ty0;
              for (let q = 1; q <= 4; q++) { const nx = bx + (((h >> (q * 3)) & 15) - 8) * (1 - q / 4), ny = ty0 + 34 * q / 4; pline(px, py, nx, ny, 2, col.stormHot, k * (1 - ph)); px = nx; py = ny; }
              dot(bx, by, 4, col.stormHot, k * (1 - ph));
            }
          } else if (f.kind === 'reveal') {
            if (!ally(f.owner) && !fogAt(x, y)) continue;
            const r = f.r * TILE; if (!onCam(x, y, r)) continue;
            const L = D.abilities[f.ab].effect.left, age = L - f.left + alpha, hot = age < 10 ? 1 - age / 10 : 0;
            const k = Math.min(1, f.left / 20);                                               // 끝 20틱 흐려짐
            disc(x, y, r, col.scan, (0.05 + 0.1 * hot) * k, 0.6);                             // 바닥 원
            disc(x, y, r, col.scan, (0.35 + 0.5 * hot) * k, 0.6, 2);
            disc(x, y, 18 + 10 * hot, col.scan, (0.4 + 0.5 * hot) * k, 0.6);                  // 착지점
          }
        }
        for (const f of R.fx) {
          const a = f.age + alpha, u = a / f.ttl; if (u >= 1) continue;
          if (f.k === 'heal') {
            const O = vis.get(f.id); if (O) { f.x = O.x; f.y = O.y; }                         // 대상을 따라간다
            if (!fogAt(f.x, f.y)) continue;
            for (let i = 0; i < 3; i++) {                                                     // 초록 십자 입자 3개가 머리 위로 떠오른다
              const q = Math.min(1, u * (0.8 + rnd(f.seed, i) * 0.5)), px = f.x + (i - 1) * 10 + (rnd(f.seed, i + 8) - 0.5) * 6, py = f.y - 24 - i % 2 * 6 - q * 16;
              const kk = 0.9 * (1 - q * q);
              dot(px, py, 2, col.heal, kk); dot(px - 2, py, 2, col.heal, kk); dot(px + 2, py, 2, col.heal, kk); dot(px, py - 2, 2, col.heal, kk); dot(px, py + 2, 2, col.heal, kk);
            }
          } else if (f.k === 'merge') {
            if (!fogAt(f.x, f.y)) continue;
            disc(f.x, f.y - 14, 10 + 30 * easeOut(u), fxPal.elysian.a, 1 - u, 1, 2);
            disc(f.x, f.y - 14, 14 * (1 - u), fxPal.elysian.core, 1 - u);
          }
        }
        if (X3) X3.top(state, tk, alpha, fogAt, me, vis);
        ctx.globalAlpha = 1;
      };
      // 스캔 빛기둥: 하늘에서 내려오므로 안개 위에 그린다(처음 10틱 굵고 밝게)
      const scanBeams = (state, alpha, fogAt, me) => {
        for (const f of state.fx) {
          if (f.kind !== 'reveal') continue;
          const x = f.x / FP, y = f.y / FP;
          if (S.isEnemy(state, me, f.owner) && !fogAt(x, y)) continue;
          if (!onCam(x, y, 40)) continue;
          const L = D.abilities[f.ab].effect.left, age = L - f.left + alpha, hot = age < 10 ? 1 - age / 10 : 0, k = Math.min(1, f.left / 20);
          const top = R.cam ? R.cam.y - 20 : y - 600, bw = 6 + 18 * hot;
          ctx.fillStyle = col.scan;
          ctx.globalAlpha = (0.12 + 0.3 * hot) * k; ctx.fillRect(Math.round(x - bw), top, Math.round(bw * 2), Math.round(y - top));
          ctx.globalAlpha = (0.5 + 0.5 * hot) * k; ctx.fillRect(Math.round(x - 2 - 2 * hot), top, Math.round(4 + 4 * hot), Math.round(y - top));
        }
        ctx.globalAlpha = 1;
      };
      // ── 3a: 마법·상태 표시 ──
      // look3a: a = 알파(내·팀원 위장 0.45, 탐지된 적 위장 0.35~0.6 일렁임), jx = 1px 가로 흔들림, skin = 스프라이트 모드,
      //         bury = 묻힌 정도(0..1, 1 = 잠복 완료), cocoon = 유닛 고치. 렌더 전용(결정론 불필요).
      const look3a = (e, tk) => {
        const out = { a: 1, jx: 0, skin: '', bury: 0, cocoon: !!e.morph, ally: e.owner >= 0 && !S.isEnemy(state, me, e.owner) };
        if (out.cocoon) return out;
        if (S.cloaked(e)) {
          if (out.ally) out.a = 0.45;
          else { out.a = 0.35 + 0.25 * (0.5 + 0.5 * Math.sin(tk * 0.45 + e.id)); out.jx = RM.matches ? 0 : ((Math.floor(tk / 2) + e.id) & 1 ? 1 : -1); }
        }
        const md = e.def.modes;
        if (md) {
          const T0 = e.modeT > 0, to = e.modeTo, cur = e.mode;
          if (md.burrow && (cur === 'burrow' || (T0 && to === 'burrow'))) {
            const u = e.modeT / md.burrow.time;                                      // 전환 남은 비율
            out.bury = !T0 ? 1 : Math.max(0.15, Math.min(0.85, to === 'burrow' ? 1 - u : u)); // 전환 중엔 반쯤 묻힘
          }
          if (md.siege && A.def(e.type + '@siege')) {
            if (cur === 'siege' && !T0) out.skin = 'siege';
            else if (T0 && (to === 'siege' || cur === 'siege')) out.skin = (Math.floor(tk / 4) & 1) ? 'siege' : '';   // 전환 중: 번갈아
          }
        }
        return out;
      };
      // 위에서부터 keep 비율만 그린다(땅에 묻힘). yb = 바닥 y
      const blitCrop = (s, x, yb, flip, keep, a) => {          // 발밑(oy)까지의 위쪽 keep 비율을 바닥 yb 에 맞춰 그린다
        const sh = Math.max(1, Math.round(s.oy * keep)), dw = s.w * s.px;
        ctx.save(); ctx.globalAlpha = a; ctx.imageSmoothingEnabled = false;
        if (flip) { ctx.translate(Math.round(x), 0); ctx.scale(-1, 1); x = 0; }
        ctx.drawImage(s.cv, 0, 0, s.w, sh, Math.round(x - dw / 2), Math.round(yb - sh * s.px), dw, sh * s.px);
        ctx.restore();
      };
      // 고치(변태): 스웜 고치 2프레임, 진행할수록 빠르게 맥동. 합체 결과(mergeFrom)는 엘리시안 빛 구(겹 원, 전용 스프라이트 없음).
      const cocoon = (o, e, lift, tk) => {
        const merged = !!e.def.mergeFrom, to = D.units[e.morph.to], prog = to ? 1 - e.morph.left / to.time : 0;
        const per = 18 - prog * 10, ph = RM.matches ? 0.5 : 0.5 + 0.5 * Math.sin(tk * TAU / per), lf = lift ? lift * 0.6 : 0;
        ctx.fillStyle = col.shadow; ctx.beginPath(); ctx.ellipse(o.x + 2, o.y + 4, e.def.radius * 0.8, e.def.radius * 0.4, 0, 0, TAU); ctx.fill();
        ownerDisc(o.x, o.y + 2, e.def.radius * 0.8 + 2, e.owner);
        if (merged) {
          const P = fxPal.elysian, cy = o.y - 16 - lf, r = 11 + prog * 5 + ph * 2;
          disc(o.x, cy, r + 8 + ph * 6, P.a, 0.18 + 0.2 * ph);
          disc(o.x, cy, r, P.b, 0.9); disc(o.x, cy, r * 0.7, P.a, 0.95); disc(o.x, cy, r * 0.38, P.core);
          if (o.vis) glow(o.x, cy, r + 6, GI.elysian ?? 2, 0.5 + 0.3 * ph);
          ctx.globalAlpha = 1; o.top = cy - r; o.lift = lf; return;
        }
        const cs = sprite('cocoon@cocoon', 'i' + (ph > 0.5 ? 1 : 0)), cy = o.y + 4 - lf - (cs.oy - cs.h / 2) * cs.px;
        disc(o.x, cy, cs.w * cs.px * 0.45, fxPal.swarm.a, 0.1 + 0.16 * ph * prog);
        blit(cs, o.x, cy, false, 1);                                                // disc 가 남긴 globalAlpha 를 덮어쓴다
        o.top = cy - cs.h * cs.px / 2; o.lift = lf;
      };
      const unit = o => {
        const e = o.e, lift = liftOf(e.def), go0 = e.order && e.order.type === 'gather' && e.order.phase === 'mine' ? e.order : null;
        // 방향: 공격 목표 > 캐는 수정 > 이동 방향 > 이전 방향. 자세: 공격(4틱) > 이동 > 대기
        const mv = Math.abs(e.x - e.px) + Math.abs(e.y - e.py) > 4;
        const am = R.aim.get(e.id), tgt = am && R.tick - am.t < 12 ? S.byId(state, am.b) : null;
        const res = go0 ? S.byId(state, go0.res) : null, look = tgt || res;
        let dir = R.dir.get(e.id) ?? 2;
        dir = look ? A.dirOf(look.x - e.x, look.y - e.y, dir) : mv ? A.dirOf(e.x - e.px, e.y - e.py, dir) : dir;
        R.dir.set(e.id, dir);
        // ── 3a: 마법·상태 표시 (위장 · 잠복 · 포격 · 고치) ── sk = 모드 스킨 키('bastion@siege')
        const st3 = look3a(e, tk);
        if (st3.cocoon) { cocoon(o, e, lift, tk); return; }
        const sk0 = st3.skin ? e.type + '@' + st3.skin : e.type, sk = X3 ? X3.mutKey(e, sk0) : sk0;   // 3b 변이 단계: 1.1·1.2배 정의
        const def = A.def(sk), forced = R.pose.get(e.id);
        let anim = am && R.tick - am.t < 4 ? 'attack' : mv ? 'move' : 'idle';
        if (forced) { dir = forced.dir; anim = forced.anim; }
        const nf = (def.frames && def.frames[anim]) || 1;
        const fi = anim === 'attack' ? (forced ? Math.floor(tk / 3) % 2 : Math.min(1, Math.floor((R.tick - am.t) / 2)))
                 : nf > 1 ? (Math.floor(tk / 3) + e.id) % nf : 0;
        const pose = def.dirs === 8 ? A.poseKey(dir, nf > 1 || anim !== 'idle' ? anim : 'idle', fi) : '';
        const s = sprite(sk, pose), flip = !!A.FLIP_DIR[dir], fc = dir >= 3 && dir <= 5 ? -1 : 1;
        const bob = anim === 'idle' && !RM.matches ? (lift ? Math.round(Math.sin((tk + e.id * 7) * 0.15) * 2) : (Math.floor((tk + e.id * 5) / 20) & 1)) : 0;
        const cy0 = o.y + 4 - lift - bob - (s.oy - s.h / 2) * s.px;              // 발밑 기준점이 o.y+4 에 오도록
        const hit = o.vis && hitNow(e.id), shielded = hit && e.shield > 0;
        const go = e.order && e.order.type === 'gather' ? e.order : null;
        const jx = go && go.phase === 'mine' && !RM.matches && (Math.floor(tk) + e.id) & 2 ? 2 : 0;   // 채굴: 작은 흔들림
        if (lift) airShadow(sprite(sk, pose, 'sh'), o.x, o.y, lift, flip);         // 공중: 실루엣 그림자(높이만큼 오른쪽)
        else if (!st3.bury) { ctx.fillStyle = col.shadow; ctx.beginPath(); ctx.ellipse(o.x + 2, o.y + 4, e.def.radius, e.def.radius * 0.5, 0, 0, 6.2832); ctx.fill(); }   // 지상: 우하단 타원
        ownerDisc(o.x, o.y + 2, e.def.radius * (lift ? 0.8 : 1) + 2, e.owner);
        if (st3.bury > 0) {                                                         // 잠복(전환 중이면 반쯤 묻힘): 공용 흙더미 + 위만 남은 유닛
          const ms = sprite('mound@burrow');
          blit(ms, o.x, o.y + 4 - (ms.oy - ms.h / 2) * ms.px, false, 1);
          const done = st3.bury >= 1, keep = done ? 1 : 1 - st3.bury;               // 잠복 완료: 흙더미 위 반투명 유닛(적은 탐지됐을 때만 보여 일렁임)
          blitCrop(s, o.x + st3.jx, o.y + 4, flip, keep, done ? (st3.ally ? 0.4 : st3.a * 0.8) : st3.a);
          o.top = o.y + 4 - s.oy * s.px * keep; o.lift = 0;
          ctx.globalAlpha = 1; return;
        }
        const a3 = st3.a < 1 ? st3.a : undefined, ux = o.x + jx + st3.jx;          // 위장: 반투명 + (탐지된 적) 1px 흔들림
        blit(s, ux, cy0, flip, a3);
        if (o.vis && a3 === undefined) {
          const dw = s.w * s.px, dh = s.h * s.px;
          if (s.gl) for (const [gx, gy, r] of s.gl) glow(flip ? ux + dw / 2 - gx * s.px : ux - dw / 2 + gx * s.px, cy0 - dh / 2 + gy * s.px, r, GI[e.def.race] ?? 0, 0.6);
          else if (e.def.race === 'elysian') glow(o.x, cy0, 8, 2, 0.35);
        }
        if (hit && !shielded) blit(sprite(sk, pose, 'flash'), ux, cy0, flip, 0.8 * st3.a);   // 피격: 하얗게
        o.top = cy0 - s.h * s.px / 2; o.lift = lift;
        const rip = X3 && X3.unit(o, cy0, s, ux, flip, tk, shielded);                 // 3b 상태 덧그림(표식·가속·결정 봉인…)·변이 가시·공명 물결
        if (shielded && !rip) shieldPop(o.x, cy0, e.def.radius + 7, 1);
        if (e.carry > 0 && e.def.worker) {                                          // 운반 중: 크리스탈 조각 / 가스통
          const cs = sprite(e.carryKind === 1 ? 'canister' : 'chunk');
          blit(cs, o.x + fc * 9, cy0 + 2, false);
        }
        ctx.globalAlpha = 1;
      };
      // 4) 지상 유닛
      if (X3) X3.floor(state, tk, alpha, fogAt, me, vis);           // 3b 장판·오라·경고 표식·공명선(지상 유닛 아래)
      for (const o of ground) unit(o);

      // 4b) 생물(짐승) + 새 그림자 + 파편 파티클 — 화재 불티는 파티클(연기·불티)로 옮겼다
      const crN = placeCritters(state, alpha, ground, air, fogAt);
      drawBeasts(crN); drawBirds(crN, true);
      drawPts(0, alpha, fogAt, null);

      // 4c) 일꾼 연출: 채굴 불꽃(수정색), 용접 불꽃(레기온 건설·수리)
      for (const o of ground) {
        const e = o.e, od = e.order; if (!o.vis || !od || !e.def.worker) continue;
        if (od.type === 'gather' && od.phase === 'mine' && od.kind === 0) {
          const rs = S.byId(state, od.res); if (!rs) continue;
          const ddx = rs.x / FP - o.x, ddy = rs.y / FP - o.y, dd = Math.hypot(ddx, ddy) || 1;
          const px = o.x + ddx / dd * 11, py = o.y - 9 + ddy / dd * 4;
          const cyc = 6, t0 = tk + e.id * 3, n = Math.floor(t0 / cyc), ph = (t0 - n * cyc) / cyc, sd = hash(e.id, n);
          if (ph < 0.7) {
            const u = ph / 0.7;
            if (u < 0.35) {                                            // 곡괭이가 닿는 순간: 십자 섬광
              const k = 1 - u / 0.35; dot(px, py, 8, ecoCol.crystalL, k); dot(px, py, 4, ecoCol.glint);
              for (const [ox, oy] of [[-8, 0], [8, 0], [0, -8], [0, 8]]) { dot(px + ox, py + oy, 4, ecoCol.crystalL, k); dot(px + ox * 1.5, py + oy * 1.5, 2, ecoCol.glint, k); }
            }
            for (let k = 0; k < 5; k++) {
              const vx = (rnd(sd, k) - 0.5) * 26 - ddx / dd * 8, vz = 8 + rnd(sd, k + 7) * 12;
              spk(px + vx * u, py - vz * u + 16 * u * u, ecoCol.crystalL, 1 - u * u);
            }
          }
        } else if (od.type === 'constructing' || od.type === 'repair') {
          const t = S.byId(state, od.type === 'constructing' ? od.b : od.target); if (!t || t.owner !== e.owner) continue;
          const txp = t.x / FP, typ = t.y / FP, ddx = txp - o.x, ddy = typ - o.y, dd = Math.hypot(ddx, ddy) || 1;
          const reachD = t.isB ? Math.max(t.def.w, t.def.h) * TILE * 0.72 + 20 : (t.def.radius || 8) + e.def.radius + 14;
          if (dd > reachD) continue;                                                // 아직 가는 중
          if (od.type === 'repair' && !(t.buildLeft > 0) && t.hp >= t.hpMax) continue;
          weld(o.x + ddx / dd * 11, o.y - 8 + ddy / dd * 4, e.id, tk);
        }
      }
      ctx.globalAlpha = 1;

      // 5) 전투 연출 (지상층 / 공중층)
      const wpnFor = (d, tgtAir) => d ? (tgtAir && d.weapon2 && d.weapon2.air || !tgtAir && d.weapon && d.weapon.ground === false && d.weapon2 ? d.weapon2 : (d.weapon || d.weapon2)) : null;   // 지상 목표인데 주무기가 대공 전용이면(스키머) 대지 무기
      const initShot = f => {
        f.init = true;
        const A = ptOf(f.a, f.deadA), B = ptOf(f.b, f.dead), S0 = f.from ? ptOf(f.from, null) : A;
        if (!B || !S0) { f.ttl = 0; return; }
        if (!(fogAt(S0[2], S0[3]) || fogAt(B[2], B[3]))) { f.ttl = 0; return; }
        const att = S.byId(state, f.a), tg = S.byId(state, f.b);
        const attDef = att ? att.def : (f.deadA ? D.units[f.deadA.type] || D.buildings[f.deadA.type] : null);
        const race = (attDef && attDef.race) || 'legion';
        const tAir = !!((tg && (tg.def.air || tg.lifted)) || (f.dead && D.units[f.dead.type] && D.units[f.dead.type].air));
        const wp = att ? (tAir && att.def.weapon2 && att.def.weapon2.air || !tAir && att.def.weapon2 && (S.weaponOf(att, 'weapon') || {}).ground === false ? att.def.weapon2 : (S.weaponOf(att, 'weapon') || att.def.weapon2)) : wpnFor(attDef, tAir); // 모드 무기(트렌처·포격 배스천)
        const st = shotStyle(attDef, wp, race);
        if (st === 'none') { f.ttl = 0; return; }
        let ax = S0[0], ay = S0[1];
        const dx = B[0] - ax, dy = B[1] - ay, d = Math.hypot(dx, dy) || 1;
        if (!f.from && st !== 'slash' && st !== 'bite') { const off = Math.min(((attDef && attDef.radius) || 8) * 0.9, d / 3); ax += dx / d * off; ay += dy / d * off; }
        Object.assign(f, { air: tAir, race, st, ax, ay, bx: B[0], by: B[1], gy: B[3], P: fxPal[race] || fxPal.legion,
          splashR: (wp && wp.splash) || 0 });
        f.fly = SPEED[st] ? Math.max(1, Math.min(12, Math.ceil(d / SPEED[st]))) : st === 'slash' || st === 'bite' ? 1 : 0;
        f.arc = st === 'acid' || st === 'spine' ? (tAir ? 0.1 : 0.26) * d : st === 'glaive' ? 0.08 * d : 0;
        f.ttl = f.delay + f.fly + IMP + (st === 'beam' ? 3 : st === 'flame' ? 1 : 0);
        R.hitAt.set(f.b, R.tick - f.age + f.delay + f.fly);
        R.sfx.push({ s: SND[st], x: ax, y: S0[3], seed: f.seed });
      };
      const drawShot = (f, a) => {
        const t = a - f.delay; if (t < 0) return;
        const B = ptOf(f.b, f.dead); if (B) { f.bx = B[0]; f.by = B[1]; f.gy = B[3]; }
        const P = f.P, st = f.st, ax = f.ax, ay = f.ay, bx = f.bx, by = f.by;
        const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
        const ranged = st !== 'slash' && st !== 'bite' && st !== 'flame';
        if (ranged && !f.from && t < 1.6) muzzle(ax, ay, ux, uy, P, f.race, t, st);
        if (st === 'beam') { if (t < 3) glow(bx, by, 16, 2, 1 - t / 3); }            // 발광: 빔 착탄 / 엘리시안 총구 — 연출 1개당 1개
        else if (f.race === 'elysian' && ranged && !f.from && t < 1.6) glow(ax, ay, 8, 2, 1 - t / 1.6);
        if (st === 'beam') {                                            // 엘리시안: 즉시 굵은 빔 + 잔광
          if (t < 3) {
            const k = 1 - t / 3, w = t < 1 ? 6 : t < 2 ? 4 : 2;
            pline(ax, ay, bx, by, w + 4, P.c, 0.45 * k); pline(ax, ay, bx, by, w, P.a, k); pline(ax, ay, bx, by, 2, P.core, k);
            for (let i = 0; i < 5; i++) {                                 // 빔을 따라 튀는 에너지 픽셀
              const q = rnd(f.seed, i + Math.floor(t * 4) * 7), off = (rnd(f.seed, i + 30 + Math.floor(t * 4)) - 0.5) * 12;
              dot(ax + dx * q - uy * off, ay + dy * q + ux * off, 2, P.a, k);
            }
            disc(bx, by, 9 * k + 3, P.a, k); dot(bx, by, 4, P.core, k);
          } else pline(ax, ay, bx, by, 2, P.c, 0.5 * (1 - (t - 3) / (IMP + 3 - 3)));
          if (t < IMP) sparks(bx, by, P, f.seed, t / IMP, 5, 12, 0);
        } else if (st === 'flame') {                                    // 스코처: 화염 분사 원뿔
          const k = Math.min(1, (f.ttl - f.delay - t) / 3);
          for (let i = 0; i < 7; i++) {
            const q = (i + 1) / 7, ph = q * 0.55 + t / (IMP + 1) * 0.5, jit = (rnd(f.seed, i + Math.floor(t * 3) * 9) - 0.5) * 8 * q;
            disc(ax + dx * q * 1.1 - uy * jit, ay + dy * q * 1.1 + ux * jit - q * 3, 2 + q * 7, ph < 0.3 ? P.core : ph < 0.6 ? P.a : ph < 0.85 ? P.b : P.c, k);
          }
          if (f.splashR && t < IMP) disc(bx, f.gy, f.splashR * 1.2 * easeOut(t / IMP), P.a, 0.8 * (1 - t / IMP), 0.6, 1);
        } else if (st === 'slash') {                                    // 근접 베기 호(두꺼운 앞날 + 꼬리) + 베인 자리 섬광
          // 공격자 쪽으로 물러난 중심에서 그린 초승달이 대상 몸을 가로지른다
          const base = Math.atan2(uy, ux), h = Math.min(1, t / 1.2), k = t < 1.8 ? 1 : Math.max(0, 1 - (t - 1.8) / 1.4), sw = (f.seed & 1) ? 1 : -1;
          const ccx = bx - ux * 12, ccy = by - uy * 12;
          for (let q = Math.max(0, h - 0.75); q <= h; q += 0.045) {
            const an = base + sw * (-1.15 + 2.3 * q), lead = h - q, x = ccx + Math.cos(an) * 18, y = ccy + Math.sin(an) * 15;
            if (lead < 0.14) dot(x, y, 8, ink, k);
            dot(x, y, lead < 0.14 ? 6 : lead < 0.4 ? 4 : 2, lead < 0.14 ? P.core : lead < 0.4 ? P.a : P.b, k);
          }
          if (t >= 0.8 && t < 2.2) { const k2 = 1 - (t - 0.8) / 1.4; pline(bx - uy * 9 - ux * 3, by + ux * 9 - 6, bx + uy * 9 + ux * 3, by - ux * 9 + 6, 2, P.core, k2); }
          if (t >= 1 && t < 1 + IMP) sparks(bx, by, P, f.seed, (t - 1) / IMP, 4, 8, 0);
        } else if (st === 'bite') {                                     // 스웜 근접: 위아래 이빨이 닫힌다
          const g = 1 - Math.min(1, t / 1.1), k = t < 2 ? 1 : Math.max(0, 1 - (t - 2) / 1.5);
          ctx.globalAlpha = k;
          for (let i = -1; i <= 1; i++) { fang(bx + i * 8, by - 4 - 10 * g, 1); fang(bx + i * 8 + 4, by + 4 + 10 * g, -1); }
          if (t >= 1 && t < 1 + IMP) sparks(bx, by, fxPal.swarm, f.seed, (t - 1) / IMP, 5, 9, 10);
        } else if (t < f.fly) {                                         // 날아가는 투사체
          const p = t / f.fly, pos = q => [ax + dx * q, ay + dy * q - f.arc * 4 * q * (1 - q)];
          const [hx, hy] = pos(p), [qx, qy] = pos(Math.max(0, p - 0.12)), vx = hx - qx, vy = hy - qy, vl = Math.hypot(vx, vy) || 1, hux = vx / vl, huy = vy / vl;
          if (st === 'bullet') { pline(hx - hux * 14, hy - huy * 14, hx, hy, 2, P.b); dot(hx, hy, 4, P.a); dot(hx, hy, 2, P.core); }
          else if (st === 'shell') { pline(hx - hux * 10, hy - huy * 10, hx, hy, 4, P.b, 0.8); dot(hx, hy, 6, P.a); dot(hx, hy, 2, P.core); }
          else if (st === 'missile') {
            const wob = Math.sin(t * 2.5 + (f.seed & 7)) * 3;
            for (let j = 7; j >= 1; j--) { const q = p - j * 0.06; if (q < 0) continue; const [sx, sy] = pos(q); disc(sx - huy * wob * (j / 7), sy + hux * wob * (j / 7), 2 + j * 0.8, P.smoke, 0.6 * (1 - j / 8)); }
            dot(hx - hux * 7, hy - huy * 7, 4, P.a); pline(hx - hux * 5, hy - huy * 5, hx, hy, 2, P.core);
          } else if (st === 'spine') { pline(hx - hux * 9, hy - huy * 9, hx, hy, 2, P.b); dot(hx, hy, 2, P.core); dot(hx - hux * 9, hy - huy * 9, 2, P.c); }
          else if (st === 'acid') {
            const [d1x, d1y] = pos(Math.max(0, p - 0.07)), [d2x, d2y] = pos(Math.max(0, p - 0.14));
            dot(d2x, d2y, 2, ecoCol.gas, 0.6); dot(d1x, d1y, 4, ecoCol.gas, 0.85);
            disc(hx, hy, 7, ink); disc(hx, hy, 5, ecoCol.gas); dot(hx - 2, hy - 2, 2, P.core);
          } else if (st === 'glaive') {
            const an = t * 2.4 + (f.seed & 15);
            for (let k = 0; k < 3; k++) dot(hx + Math.cos(an + k * 2.09) * 5, hy + Math.sin(an + k * 2.09) * 3.5, 4, k ? ecoCol.gas : P.core);
            dot(hx, hy, 2, P.core);
          }
        } else {                                                        // 도착: 피격 불꽃 + 스플래시 충격파
          const u = (t - f.fly) / IMP; if (u >= 1) return;
          const big = st === 'shell' || st === 'missile' || st === 'acid';
          if (u < 0.35) disc(bx, by, (big ? 9 : 5) * (1 - u * 2), st === 'acid' ? fxPal.swarm.core : P.core, 1);
          sparks(bx, by, st === 'acid' ? fxPal.swarm : P, f.seed, u, big ? 7 : 4, big ? 12 : 8, st === 'acid' || st === 'spine' ? 10 : 0);
          if (f.splashR) {
            const gy = f.air ? by : f.gy;
            disc(bx, gy, f.splashR * 1.3 * (0.3 + 0.7 * easeOut(u)), P.a, 1 - u, 0.6, 1);
            disc(bx, gy, f.splashR * 0.7 * (1 - u), st === 'acid' ? ecoCol.gas : P.b, 0.7 * (1 - u), 0.6);
            if (!f.air) debris(bx, gy, 2, 1, t - f.fly, P, f.P, f.seed, 6);
          }
        }
      };
      const drawBoom = (f, a, air) => {
        const P = f.pal, s = f.s, x = f.x, gy = f.y, alt = f.alt;
        if (!!alt === air) {
          if (a < 8) glow(x, gy - 6 - alt, s >= 2 ? 32 : 16, 5, 0.9 * (1 - a / 8));    // 폭발 불빛
          if (s === 3) {                                                // 건물: 발자국 곳곳에서 연쇄 폭발
            const n = Math.min(6, 2 + Math.round(f.bw * f.bh / 1024));
            for (let i = 0; i < n; i++) fireball(x + (rnd(f.seed, 300 + i) - 0.5) * f.bw * 0.8, gy + (rnd(f.seed, 320 + i) - 0.5) * f.bh * 0.6, i ? 2 : 3, a - i * 1.7, P, hash(f.seed, i));
          } else fireball(x, gy - 6 - alt, s, a, P, f.seed);
          const ringR = (f.splash ? f.splash * 1.3 : 0) || (s === 3 ? f.bw * 0.9 : s === 2 ? 30 : 0);
          if (ringR && a < 7) disc(x, gy - (alt ? alt + 6 : 0), ringR * (0.25 + 0.75 * easeOut(a / 7)), P.a, 1 - a / 7, 0.6, 1);
          debris(x, gy, alt + 6, Math.min(s, 2), a, P, f.deb, f.seed, s === 3 ? 22 : s === 2 ? 14 : 8);
        }
        if (air) smoke(x, gy, s, a, P, f.seed, alt);
      };
      const drawFx = layerAir => {
        for (const f of R.fx) {
          const a = f.age + alpha;
          if (f.k === 'shot') {
            if (!f.init) initShot(f);
            if (f.ttl <= f.age || f.air !== layerAir) continue;
            drawShot(f, a);
          } else if (f.k === 'boom') {
            if (!onCam(f.x, f.y, 160) || !fogAt(f.x, f.y)) continue;
            drawBoom(f, a, layerAir);
          } else if (f.k === 'puff' && !layerAir) {
            const u = a / f.ttl; if (u >= 1) continue;
            for (let i = 0; i < 4; i++) disc(f.x + (rnd(f.seed, i) - 0.5) * 16 * u, f.y - 6 - u * 10 - rnd(f.seed, i + 4) * 6, 3 + u * 5, i & 1 ? ecoCol.gasL : ecoCol.gas, 0.8 * (1 - u));
          }
        }
        ctx.globalAlpha = 1;
      };
      drawFx(false);
      // 6) 공중 유닛 + 띄운 건물 (띄운 건물: 바닥 그림자 + 높이)
      for (const o of air) {
        if (!o.e.isB) continue;
        const e = o.e, sx = e.x / FP;
        bshadow(e.type, sx - e.def.w * TILE / 2 + 10, e.y / FP + e.def.h * TILE / 2);
      }
      air.sort(byY);
      for (const o of air) { if (o.e.isB) { drawBuilding(o, LIFT_B); } else unit(o); }
      drawBirds(crN, false);
      drawFx(true);
      drawPts(1, alpha, fogAt, A.theme(state.map.id).groundCss[3]);   // 연기·증기·먼지·불티·불꽃(위로 피어오른다)
      drawFireflies(crN);
      spellFx(state, tk, alpha, fogAt, me);
      flushGlow();                                                     // 가산 발광: 안개 전에 한 번에

      // 7) 안개: 0 = 불투명, 1 = 50%
      const f = state.fog[me];
      ctx.fillStyle = col.fog;
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (f[ty * MW + tx] === 0) ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      ctx.fillStyle = col.fogHalf;
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (f[ty * MW + tx] === 1) ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE);

      scanBeams(state, alpha, fogAt, me);

      // 7b) 하역 팝업 (+8): 1초 상승·페이드
      ctx.font = '500 16px ' + FONT_NUM; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      for (const p of R.fx) {
        if (p.k !== 'pop' || p.o !== me) continue; // 리플레이 시야를 바꾸면 이전 시야 주인의 팝업은 숨긴다
        const u = (p.age + alpha) / p.ttl; if (u >= 1) continue;
        const y = Math.round(p.y - 10 - 26 * easeOut(u)), k = u < 0.6 ? 1 : 1 - (u - 0.6) / 0.4;
        ctx.globalAlpha = k; ctx.lineWidth = 4; ctx.strokeStyle = css(vd); ctx.strokeText(p.txt, Math.round(p.x), y);
        ctx.fillStyle = p.gas ? ecoCol.gasL : ecoCol.crystalL; ctx.fillText(p.txt, Math.round(p.x), y);
      }
      ctx.globalAlpha = 1;

      // 8) 선택 원 + 체력/보호막 막대 + 함재기 알 (건물 -> 유닛 순)
      const sel = new Set(view.sel || []);
      for (const o of [...flat, ...blds, ...ground, ...air]) {
        const e = o.e, selected = sel.has(e.id), res = isRes(e);
        if (selected) {
          // 선택 원 = 플레이어색. 적(시야 기준 me 의 적)은 점선 — 색을 못 읽어도 모양으로 피아 구분
          ctx.strokeStyle = res || e.owner < 0 ? col.ink2 : col.player[colorIdx(e.owner)]; ctx.lineWidth = 2;
          if (!res && e.owner >= 0 && S.isEnemy(state, me, e.owner)) ctx.setLineDash([5, 4]);
          if (e.isB || res) { const [fx, fy] = foot(e); ctx.strokeRect(fx + 1, fy + 1 - o.lift, e.def.w * TILE - 2, e.def.h * TILE - 2); }
          else { ctx.beginPath(); ctx.ellipse(o.x, o.y + 3, e.def.radius + 4, (e.def.radius + 4) * 0.62, 0, 0, 6.2832); ctx.stroke(); }
          ctx.setLineDash([]);
        }
        if (res || e.owner < 0 || !o.vis) continue;
        const damaged = e.hp < e.hpMax || e.shield < e.shieldMax;
        if (!selected && !damaged) continue;
        if (e.isB && e.buildLeft > 0 && !selected) continue;
        const w = e.isB ? Math.min(e.def.w * TILE - 12, 56) : Math.max(16, e.def.radius * 2 + 6);
        const top = e.isB ? foot(e)[1] - 6 - o.lift : o.top - 4;
        let y = Math.round(top);
        const pc = colorIdx(e.owner);                                              // 막대 테두리 = 플레이어색(채움은 체력 의미색 유지)
        if (e.shieldMax > 0) { bar(o.x, y - 3, w, e.shield / e.shieldMax, col.shield, col.player[pc]); }
        const fr = e.hp / e.hpMax; bar(o.x, y, w, fr, fr <= 0.3 ? col.danger : col.hp, col.player[pc]);
        if (e.def.energy && !(e.buildLeft > 0) && !S.isEnemy(state, me, e.owner)) bar(o.x, y + 4, w, e.energy / S.energyMax(state, e), col.mana, col.player[pc]); // 3a 마나: 체력 바로 아래(내·팀원)
        if (selected && typeof e.hangar === 'number' && e.def.launcher) {          // 함재기·파쇄구 보유 수
          const mx = e.def.launcher.max, py = y - (e.shieldMax > 0 ? 9 : 6), x0 = Math.round(o.x - mx * 3);
          for (let i = 0; i < mx; i++) { ctx.fillStyle = i < e.hangar ? col.accent : col.track; ctx.fillRect(x0 + i * 6, py, 4, 4); }
        }
      }

      // 8b) 명령 확인 표시(ui.js commandAck → view.marks): 지점 = 줄어드는 링(공격 이동은 빨강 링 + X), 대상 = 테두리 깜빡임.
      //     대상은 이번 프레임에 그린 엔티티(vis)만 — 안개 속으로 사라지면 표시도 없다. 움직임 줄이기면 크기 고정·불투명도만.
      for (const m of view.marks || []) {
        const u = m.age, k = 1 - u;
        ctx.strokeStyle = m.tone === 'atk' ? col.danger : m.tone === 'aim' ? col.aim : col.hp; ctx.lineWidth = 2;
        if (m.id) {
          const o = vis.get(m.id); if (!o) continue;
          ctx.globalAlpha = RM.matches ? k : (Math.floor(u * 6) & 1 ? 0.25 : 1) * k; // 세 번 깜빡이며 사라진다
          const e = o.e;
          if (e.isB || isRes(e)) { const [fx, fy] = foot(e); ctx.strokeRect(fx - 2, fy - 2 - o.lift, e.def.w * TILE + 4, e.def.h * TILE + 4); }
          else { const r = e.def.radius + 8; ctx.beginPath(); ctx.ellipse(o.x, o.y + 3, r, r * 0.62, 0, 0, TAU); ctx.stroke(); }
        } else {
          const r = RM.matches ? 10 : 6 + 14 * k * k;                                      // 20px → 6px 로 오므라든다
          ctx.globalAlpha = k; ctx.beginPath(); ctx.ellipse(m.x, m.y, r, r * 0.62, 0, 0, TAU); ctx.stroke();
          if (m.tone === 'atk') { const s = 4; ctx.beginPath(); ctx.moveTo(m.x - s, m.y - s); ctx.lineTo(m.x + s, m.y + s); ctx.moveTo(m.x + s, m.y - s); ctx.lineTo(m.x - s, m.y + s); ctx.stroke(); }
        }
      }
      ctx.globalAlpha = 1;

      // 9) 배치 고스트 (월드 좌표, 타일 격자) + 엘리시안 레이 라인 전력권(기둥 원 + 연결선 띠: 건물 중심이 이 안이면 가동)
      if (view.ghost) {
        const g = view.ghost, d = D.buildings[g.what];
        if (d) {
          if (d.race === 'elysian' && !d.onVent) {
            const net = S.powerNet(state, me), py = net.pylons, h = TILE / 2;
            ctx.fillStyle = col.power; ctx.strokeStyle = col.power;
            ctx.globalAlpha = 0.1; ctx.beginPath();                              // 원은 한 경로로 채워 겹침이 진해지지 않게
            for (const p of py) { ctx.moveTo(p.x2 * h + p.r2 * h, p.y2 * h); ctx.arc(p.x2 * h, p.y2 * h, p.r2 * h, 0, TAU); }
            ctx.fill();
            ctx.lineCap = 'round'; ctx.beginPath();                              // 띠: 굵은 둥근 선 한 번(폭 = 양쪽 width)
            for (const [i, j, w2] of net.links) { ctx.lineWidth = w2 * TILE; ctx.moveTo(py[i].x2 * h, py[i].y2 * h); ctx.lineTo(py[j].x2 * h, py[j].y2 * h); }
            ctx.stroke(); ctx.lineCap = 'butt';
            ctx.globalAlpha = 0.8; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
            for (const p of py) { ctx.beginPath(); ctx.arc(p.x2 * h, p.y2 * h, p.r2 * h, 0, TAU); ctx.stroke(); }
            ctx.globalAlpha = 0.55; ctx.beginPath();
            for (const [i, j] of net.links) { ctx.moveTo(py[i].x2 * h, py[i].y2 * h); ctx.lineTo(py[j].x2 * h, py[j].y2 * h); }
            ctx.stroke();
            if (d.link) {                                                        // 기둥을 놓는 중: 이을 수 있는 기존 기둥까지 예고선
              const gx = 2 * g.tx + d.w, gy = 2 * g.ty + d.h;
              ctx.globalAlpha = 0.45; ctx.setLineDash([3, 7]); ctx.beginPath();
              for (const p of py) { const L = 2 * Math.min(d.link, p.link2 / 2), dx = gx - p.x2, dy = gy - p.y2; if (dx * dx + dy * dy <= L * L) { ctx.moveTo(gx * h, gy * h); ctx.lineTo(p.x2 * h, p.y2 * h); } }
              ctx.stroke();
            }
            ctx.setLineDash([]); ctx.globalAlpha = 1;
          }
          ctx.globalAlpha = 0.4; ctx.fillStyle = g.ok ? col.hp : col.danger;
          ctx.fillRect(g.tx * TILE, g.ty * TILE, d.w * TILE, d.h * TILE);
          ctx.globalAlpha = 0.55; const gd = A.def(g.what), s = sprite(g.what, 'w0');
          ctx.drawImage(s.cv, g.tx * TILE - 1, g.ty * TILE - 1 - gd.oy, s.w, s.h);
          ctx.globalAlpha = 1; ctx.strokeStyle = g.ok ? col.hp : col.danger; ctx.lineWidth = 1;
          ctx.strokeRect(g.tx * TILE + 0.5, g.ty * TILE + 0.5, d.w * TILE - 1, d.h * TILE - 1);
        }
      }

      // 9b) 3a 조준 커서: 시전자 사거리 원(옅게) + 커서 위치 효과 반경(점선) / 대상 지정이면 조준선·대상 고리
      if (view.aim) {
        const A = view.aim;
        ctx.strokeStyle = col.aim; ctx.lineWidth = 1;
        if (A.range > 0) { ctx.globalAlpha = 0.28; for (const [fx0, fy0] of A.from) { ctx.beginPath(); ctx.ellipse(fx0, fy0, A.range, A.range * 0.75, 0, 0, TAU); ctx.stroke(); } }
        ctx.lineWidth = 2;
        if (A.r > 0) {
          ctx.globalAlpha = 0.1; ctx.fillStyle = col.aim; ctx.beginPath(); ctx.ellipse(A.x, A.y, A.r, A.r * 0.75, 0, 0, TAU); ctx.fill();
          ctx.globalAlpha = 0.9; ctx.setLineDash([6, 5]); ctx.lineDashOffset = RM.matches ? 0 : -tk; ctx.beginPath(); ctx.ellipse(A.x, A.y, A.r, A.r * 0.75, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        }
        if (A.unit && A.tgt) { ctx.globalAlpha = 0.95; ctx.beginPath(); ctx.ellipse(A.tgt.x, A.tgt.y + 3, A.tgt.r + 6, (A.tgt.r + 6) * 0.62, 0, 0, TAU); ctx.stroke(); }
        ctx.globalAlpha = 0.95; const k = A.unit ? 7 : 5;                                     // 십자선
        ctx.fillStyle = A.unit && !A.tgt ? col.ink2 : col.aim;
        ctx.fillRect(Math.round(A.x) - k - 3, Math.round(A.y) - 1, k, 2); ctx.fillRect(Math.round(A.x) + 3, Math.round(A.y) - 1, k, 2);
        ctx.fillRect(Math.round(A.x) - 1, Math.round(A.y) - k - 3, 2, k); ctx.fillRect(Math.round(A.x) - 1, Math.round(A.y) + 3, 2, k);
        ctx.globalAlpha = 1;
      }

      // 10) 드래그 박스 (화면 좌표)
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (view.drag) {
        const x = Math.min(view.drag.x0, view.drag.x1), y = Math.min(view.drag.y0, view.drag.y1), w = Math.abs(view.drag.x1 - view.drag.x0), h = Math.abs(view.drag.y1 - view.drag.y0);
        ctx.globalAlpha = 0.12; ctx.fillStyle = col.accent; ctx.fillRect(x, y, w, h); ctx.globalAlpha = 1;
        ctx.strokeStyle = col.accent; ctx.lineWidth = 1; ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, w, h);
      }

      // 11) 효과음: 화면 안·안개 밖 소리만(가장자리는 감쇠), 내 건물/유닛의 완료음은 위치 무관
      if (R.sfx.length) {
        if (R.audio) {
          const ccx = cx + W / 2, ccy = cy + H / 2;
          for (const q of R.sfx) {
            if (q.ally) {                                            // 아군 사망 반응: 반응하는 내 유닛이 화면 안·가장자리일 때만
              const e = S.byId(state, q.ally); if (!e || e.owner !== me) continue;
              const nx = (e.x / FP - ccx) / (W / 2), off = Math.max(Math.abs(nx), Math.abs((e.y / FP - ccy) / (H / 2)));
              if (off <= 1.3) R.audio.allyDown(e.def, e.id, off <= 1 ? 0.6 : 0.25, Math.max(-0.7, Math.min(0.7, nx * 0.7)));
              continue;
            }
            if (q.id) {
              const e = S.byId(state, q.id); if (!e || e.owner !== me) continue;
              if (q.s === 'ready' && R.audio.ready) R.audio.ready(e.def, q.id); else if (q.s === 'ready' || q.s === 'done' || q.s === 'drop') R.audio.beat(q.s, q.s === 'drop' ? 0.35 : 1, 0, q.id); else R.audio.play(q.s, 1, 0, q.id);
              continue;
            }
            if (!fogAt(q.x, q.y)) continue;
            const nx = (q.x - ccx) / (W / 2), ny = (q.y - ccy) / (H / 2), off = Math.max(Math.abs(nx), Math.abs(ny));
            if (q.far) { if (off > 1) R.audio.far(Math.max(0.12, 0.5 / off), Math.max(-0.9, Math.min(0.9, nx / off)), q.seed); continue; }   // 방향만 들리는 먼 교전
            if (q.kill) { R.audio.kill(off <= 1 ? 0.8 : 0.3, Math.max(-0.7, Math.min(0.7, nx * 0.7))); continue; }
            if (off > 1.3) continue;
            if (q.def && R.audio.death) R.audio.death(q.s, q.def, off <= 1 ? 1 : 0.3, Math.max(-0.7, Math.min(0.7, nx * 0.7)), q.seed);
            else R.audio.play(q.s, off <= 1 ? 1 : 0.3, Math.max(-0.7, Math.min(0.7, nx * 0.7)), q.seed);
          }
        }
        R.sfx.length = 0;
      }
      // 11b) 투덜거림: 선택·명령한 적 있는 내 유닛이 명령 없이 IDLE_T(sim 틱 — 일시정지 중엔 안 센다) 넘게 화면 안에 있으면 하나만(전역 쿨다운·교전 문은 audio)
      const now = R.tick;
      if (R.audio && R.audio.idle && R.idleT.size && now - R.idleChk >= IDLE_CHECK_T) {
        R.idleChk = now;
        let cand = null;
        for (const [id, t0] of R.idleT) {
          const e = S.byId(state, id);
          if (!e || e.owner !== me || e.isB) { R.idleT.delete(id); continue; }
          if (e.order || e.inside) { R.idleT.set(id, now); continue; }          // 일하는 중(채취·이동·공격·탑승) = 방치 아님
          if (!cand && now - t0 >= IDLE_T && onCam(e.x / FP, e.y / FP, -16)) cand = e;
        }
        if (cand && R.audio.idle(cand.def, cand.id)) R.idleT.set(cand.id, now);
      }
      R.lastVis = vis;
    };

    // --- 미니맵: 맵 타일(w×h) 1:1 버퍼 → 캔버스(정사각 미니맵 안에 비율 유지·가운데 정렬) ---
    const mmBuf = document.createElement('canvas'); let mmCtx = null, mmImg = null; // 맵 크기가 바뀌면 다시 만든다
    const cFog = T['color-fog'], cCreep = T.creep;
    let cGa = null, cRock = null, mmMap = null;   // 바닥·바위 = 맵 테마의 미니맵 색(맵이 바뀌면 다시 읽는다)
    let mmBase = null, mmRock = null;              // 타일별 바닥색(지형 필드의 얼룩·흙길을 mini.ground 쪽으로 반쯤 당겨 바위와 명도 차 유지) — 맵마다 한 번
    R.drawMinimap = (state, view) => {
      if (!mctx) return;
      if (state.map.id !== mmMap || !cGa) { const mi = A.theme(state.map.id).mini; cGa = mi.ground; cRock = mi.rock; mmMap = state.map.id; }
      const MW = state.map.w, MH = state.map.h;
      if (!mmImg || mmBuf.width !== MW || mmBuf.height !== MH) { mmBuf.width = MW; mmBuf.height = MH; mmCtx = mmBuf.getContext('2d'); mmImg = mmCtx.createImageData(MW, MH); }
      const me = view.me, f = state.fog[me], d = mmImg.data, rock = state.map.rock, creep = state.map.creep;
      if (mmRock !== rock || mmBase.length !== MW * MH * 3) {
        mmRock = rock; mmBase = new Uint8ClampedArray(MW * MH * 3);
        const th = A.theme(state.map.id), F = A.field(state.map, th);
        for (let ty = 0; ty < MH; ty++) for (let tx = 0; tx < MW; tx++) {
          const i = ty * MW + tx, c = rock[i] ? cRock : F.mini(tx, ty), k = rock[i] ? 0 : 0.5;
          for (let j = 0; j < 3; j++) mmBase[i * 3 + j] = c[j] + (cGa[j] - c[j]) * k;
        }
      }
      for (let i = 0; i < MW * MH; i++) {
        let r = mmBase[i * 3], g = mmBase[i * 3 + 1], b = mmBase[i * 3 + 2];
        if (creep[i] === 1 && !rock[i]) { const a = cCreep[3]; r += (cCreep[0] - r) * a; g += (cCreep[1] - g) * a; b += (cCreep[2] - b) * a; }
        const fg = f[i];
        if (fg === 0) { r = cFog[0]; g = cFog[1]; b = cFog[2]; } else if (fg === 1) { r = r * 0.5 + cFog[0] * 0.5; g = g * 0.5 + cFog[1] * 0.5; b = b * 0.5 + cFog[2] * 0.5; }
        d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b; d[i * 4 + 3] = 255;
      }
      mmCtx.putImageData(mmImg, 0, 0);
      const cw = miniCanvas.width, ch = miniCanvas.height, k = Math.min(cw / MW, ch / MH), sx = k, sy = k;
      const mw = MW * k, mh = MH * k, ox = (cw - mw) / 2, oy = (ch - mh) / 2;
      mctx.setTransform(1, 0, 0, 1, 0, 0); mctx.imageSmoothingEnabled = false;
      if (ox || oy) { mctx.fillStyle = css(cFog, 1, 1); mctx.fillRect(0, 0, cw, ch); } // 정사각이 아닌 맵: 남는 띠
      mctx.setTransform(1, 0, 0, 1, ox, oy);
      mctx.drawImage(mmBuf, 0, 0, mw, mh);
      for (const e of state.ents) {
        if (e.inside) continue;                                // 3a 탑승 유닛
        const sn = seen(state, me, e); if (!sn.draw) continue;
        if (e.owner < 0 && !exploredFoot(f, e, MW)) continue; // 미탐색 안개 속 중립(크리스탈)은 숨김
        if (e.type === 'vent') { mctx.fillStyle = col.gas; mctx.fillRect(Math.floor(e.tx * sx), Math.floor(e.ty * sy), Math.max(2, Math.ceil(2 * sx)), Math.max(2, Math.ceil(2 * sy))); continue; }
        if (e.type === 'crystal') { mctx.fillStyle = css(T.crystal); mctx.fillRect(Math.floor(e.tx * sx), Math.floor(e.ty * sy), Math.max(2, Math.ceil(2 * sx)), Math.max(2, Math.ceil(sy))); continue; }
        mctx.fillStyle = col.player[colorIdx(e.owner)];
        if (e.isB && !e.isR) mctx.fillRect(Math.floor(e.tx * sx), Math.floor(e.ty * sy), Math.ceil(e.def.w * sx), Math.ceil(e.def.h * sy));
        else { const z = Math.max(2, Math.round(sx * 1.2)); mctx.fillRect(Math.round(e.x / TFP * sx - z / 2), Math.round(e.y / TFP * sy - z / 2), z, z); }
      }
      // 카메라 사각형
      mctx.strokeStyle = col.ink; mctx.lineWidth = 1;
      const rx = view.camX / TILE * sx, ry = ((view.camY + (view.oy || 0)) / TILE) * sy, rw = (view.vw || canvas.width) / TILE * sx, rh = (view.vh || canvas.height) / TILE * sy; // vw/vh = HUD에 가리지 않은 뷰포트
      mctx.strokeRect(Math.round(rx) + 0.5, Math.round(ry) + 0.5, Math.round(rw), Math.round(rh));
      // 공격받음 핑: 1초에 한 번 퍼지는 링(3번) + 가운데 고정 링. 동작 줄이기면 고정 링만.
      if (view.pings && view.pings.length) {
        mctx.strokeStyle = col.alert; mctx.lineWidth = 2;
        for (const p of view.pings) {
          const px = p.x / TILE * sx, py = p.y / TILE * sy, fade = 1 - p.age * 0.6;
          if (!RM.matches) {
            const ph = (p.age * 3) % 1;
            mctx.globalAlpha = (1 - ph) * fade; mctx.beginPath(); mctx.arc(px, py, 4 + ph * 12, 0, Math.PI * 2); mctx.stroke();
          }
          mctx.globalAlpha = fade; mctx.beginPath(); mctx.arc(px, py, 5, 0, Math.PI * 2); mctx.stroke();
        }
        mctx.globalAlpha = 1;
      }
    };

    return R;
  }

  return { create };
})();
if (typeof module !== 'undefined') module.exports = NW_RENDER;
