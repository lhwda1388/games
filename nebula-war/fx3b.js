// 네뷸라 워 — 3b 마법·상태·종족 특성 연출(렌더 전용). render.js 가 create() 안에서 보조 함수 묶음 H 를 넘겨 만든다.
// sim 상태는 읽기만 한다(결정론 무관). 무작위는 hash(id, 틱) 뿐. 아래 키가 sim 에 생기면 저절로 켜진다:
//   state.fx  kind 'zone'      — ab 별 모양(smoke·mat·rot·stasis·chorus), 그 밖은 시전자 종족 기본 장판
//             delay > 0        — 지점 경고 표식(수렴 고리·깜빡임·떨어지는 그림자). 사라지는 틱에 area_dot 이면 낙하 충격(junkdrop 은 고철 덩이)
//             kind 'aura'      — amplify(금빛 퍼지는 고리) · prism(프리즘 점선) · 그 밖 종족 기본. 위치 = 대상(시전자) 보간 위치
//             area_dot 'mindstorm' — 3b 목록(D.abilities.stasis)이 있으면 결정 파편 비(없으면 3a 폭풍 구름 그대로)
//   e.stf 비트 marked 32 · hasted 64 · stasis 128 (+ rooted 2 · disarmed 4 · slowed 8 — 견인 빔·결정화·균사 장판)
//   cast 이벤트 effect.cleanse · effect.burnEnergy · effect.drainEnergy(+share 받는 아군) · zone left 1(즉발) · summon → 순간 연출(R.fx 'x3…')
//   zone 'repairdrones' — 강철 바닥 + 맴도는 수리 드론 + 초록 용접 불꽃
//   e.kills(또는 e.mut) + D.races.swarm.mutation.at → 변이 1·2단계(스프라이트 1.1·1.2배 정의 + 가시)
//   D.races.elysian.resonance { r, cap } → 같은 종류 n ≥ 2 공명선·발밑 물결, 결정막 피격 = 물결 고리
const NW_FX3B = (() => {
  const TAU = 6.2832, FL = 0.6;
  const STF0 = { cloaked: 1, rooted: 2, disarmed: 4, slowed: 8, detected: 16, marked: 32, hasted: 64, stasis: 128 };

  // 변이 단계 0..2: sim 이 단계(e.mut)를 주면 그것, 아니면 처치 수(e.kills)와 문턱(at)
  function mutStage(e, D) {
    if (!e || !e.def || e.isB || e.def.race !== 'swarm') return 0;
    if (typeof e.mut === 'number') return Math.max(0, Math.min(2, e.mut | 0));
    const k = e.kills | 0; if (!k) return 0;
    const M = D && D.races && D.races.swarm && D.races.swarm.mutation, at = (M && M.at) || [3, 8];
    return k >= at[1] ? 2 : k >= at[0] ? 1 : 0;
  }
  // 공명: list [{id, owner, type, x, y}] (px) → { n: Map id → 이웃 수(자신 제외, 최대 cap), links: [[a, b]] (둘 다 n ≥ 2, 유닛당 가까운 2개) }
  function resonance(list, r, cap) {
    const groups = new Map(), n = new Map(), links = [], seen = new Set(), r2 = r * r;
    for (const u of list) { const k = u.owner + '|' + u.type; let g = groups.get(k); if (!g) groups.set(k, g = []); g.push(u); }
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      const near = g.map(() => []);
      for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) {
        const dx = g[i].x - g[j].x, dy = g[i].y - g[j].y, d = dx * dx + dy * dy;
        if (d <= r2) { near[i].push([d, j]); near[j].push([d, i]); }
      }
      for (let i = 0; i < g.length; i++) if (near[i].length) n.set(g[i].id, Math.min(cap, near[i].length));
      for (let i = 0; i < g.length; i++) {
        if ((n.get(g[i].id) || 0) < 2) continue;
        near[i].sort((a, b) => a[0] - b[0]);
        let c = 0;
        for (const [, j] of near[i]) {
          if (c >= 2) break;
          if ((n.get(g[j].id) || 0) < 2) continue;
          c++;
          const a = Math.min(g[i].id, g[j].id), b = Math.max(g[i].id, g[j].id), key = a + '|' + b;
          if (!seen.has(key)) { seen.add(key); links.push([a, b]); }
        }
      }
    }
    return { n, links };
  }

  function create(H) {
    const { ctx, S, D, A, T, FP, TILE, R, disc, dot, pline, spk, glow, pushFx, ptSpawn, shakeReq, onCam, rnd, hash, P2, easeOut, RM, col, fxPal, ecoCol, css, ink } = H;
    const ST = Object.assign({}, STF0, S.STF || {});
    const vd = T['color-void'];
    const PAL = {
      legion:  { fill: css(T['legion-b'], 0.75), rim: fxPal.legion.a, mote: fxPal.legion.b, hot: fxPal.legion.core },
      swarm:   { fill: css(T['swarm-a'], 1.1), rim: fxPal.swarm.a, mote: col.gas, hot: fxPal.swarm.core },
      elysian: { fill: css(T['elysian-b'], 0.8), rim: fxPal.elysian.a, mote: css(T['elysian-a']), hot: fxPal.elysian.core },
    };
    const C = {
      smoke: css(T['legion-a'], 0.78), smokeL: css(T['legion-a'], 1.08), smokeD: css(vd, 1.7),
      hypha: css(T['swarm-a'], 0.8), hyphaL: css(T['swarm-a'], 1.7), rot: css(T['swarm-b'], 0.85), rotL: css(T['color-gas'], 0.8),
      cry: css(T['elysian-b'], 1.05), cryL: css(T['elysian-b'], 1.5), cryD: css(T['elysian-b'], 0.55), gold: css(T['elysian-a']), goldL: css(T['elysian-a'], 1.3),
      warn: col.warn, alert: col.alert, mana: col.mana, shield: col.shield, scan: col.scan, heal: col.heal, glint: ecoCol.glint,
      bone: css(T['color-glint'], 0.82), spine: css(T['swarm-a'], 1.35), shadow: css(vd, 1, 1),
      steel: fxPal.legion.deb, steelL: css(T['legion-a'], 1.25), orange: fxPal.legion.deb2,
    };
    const pend = new Map(), rip = new Map(), zones = new Map();
    const SFX3 = Object.fromEntries('heal smoke optcloak mark discharge seeker cleanse tow scan junkdrop spores mat rot sprout mindstorm amplify stasis crystallize probe prism chorus echo repairdrones'.split(' ').map(k => [k, 1]));
    const BEEP = { 60: 'beep', 40: 'beep', 24: 'beep', 14: 'beepHi', 6: 'beepHi' };      // 고철 낙하 남은 틱 → 카운트다운 삑
    let resT = -1, resC = null;
    const effOf = ab => { const a = D.abilities[ab]; return a ? a.effect : null; };
    const raceOf = (state, o) => (state.players[o] && state.players[o].race) || 'legion';
    const resCfg = () => D.races.elysian && D.races.elysian.resonance;
    const shardRain = () => !!D.abilities.stasis;     // 3b 목록이 들어오면 공명 파쇄 = 결정 파편 비
    // 처음 6틱 피어오르고 끝 12틱 흐려짐(left -1 = 토글은 늘 1)
    const fade = (f, ef, al) => { const L = ef && ef.left > 0 ? ef.left : 0; return !L ? 1 : Math.min(1, (L - f.left + al) / 6) * Math.min(1, f.left / 12); };
    const rimTicks = (x, y, r, c, a, tk, n, sp) => { for (let i = 0; i < n; i++) { const an = i / n * TAU + (RM.matches ? 0 : tk * sp); dot(x + Math.cos(an) * r, y + Math.sin(an) * r * FL, 2, c, a); } };
    // 위로 솟은 픽셀 결정(외곽선 + 몸 + 왼쪽 빛면)
    function crystal(x, y, h, w, cf, ce, a) {
      if (a <= 0.03) return;
      const X = P2(x), Y = P2(y), hw = Math.max(2, P2(w / 2));
      const shape = (g) => { ctx.beginPath(); ctx.moveTo(X, Y - h - g); ctx.lineTo(X + hw + g, Y - h * 0.4); ctx.lineTo(X + hw + g, Y + g); ctx.lineTo(X - hw - g, Y + g); ctx.lineTo(X - hw - g, Y - h * 0.4); ctx.closePath(); ctx.fill(); };
      ctx.globalAlpha = a > 1 ? 1 : a;
      ctx.fillStyle = ink; shape(2); ctx.fillStyle = cf; shape(0);
      ctx.fillStyle = ce; ctx.fillRect(X - hw, P2(Y - h * 0.4), 2, P2(h * 0.4)); ctx.fillRect(X - 2, P2(Y - h * 0.8), 2, 2);
    }

    // ===== 바닥층(건물 다음, 지상 유닛 전): 장판·오라·경고 표식·공명선 =====
    function floor(state, tk, alpha, fogAt, me, vis) {
      const ally = o => o >= 0 && !S.isEnemy(state, me, o);
      for (const f of state.fx) {
        const pending = f.delay > 0;
        if (f.kind !== 'zone' && f.kind !== 'aura' && !pending) continue;
        let x = f.x / FP, y = f.y / FP;
        if (f.kind === 'aura') { const O = vis.get(f.tgt); if (!ally(f.owner) && !(O && O.vis)) continue; if (O) { x = O.x; y = O.y; } } // 적 오라: 시전자가 보일 때만(은신 위치 노출 방지)
        const r = f.kind === 'reveal' ? f.r * TILE : f.r / FP;
        if (!onCam(x, y, r + 40) || !(fogAt(x, y) || ally(f.owner))) continue;
        const ef = effOf(f.ab);
        if (pending) telegraph(f, ef, x, y, r, tk, alpha);
        else if (f.kind === 'aura') auraFloor(f, x, y, r, fade(f, ef, alpha), tk, raceOf(state, f.owner));
        else zoneFloor(f, x, y, r, fade(f, ef, alpha), tk, raceOf(state, f.owner));
      }
      if (resCfg()) resonanceFloor(vis, tk);
      ctx.globalAlpha = 1;
    }
    function zoneFloor(f, x, y, r, k, tk, race) {
      const id = f.id;
      if (f.ab === 'smoke') {                                                            // 연막 구역: 낮게 깔린 회색 연기 바닥
        disc(x, y + 2, r, C.smokeD, 0.3 * k, FL); disc(x, y + 2, r, C.smoke, 0.5 * k, FL, 2);
      } else if (f.ab === 'mat') {                                                       // 균사 장판: 보라 바닥 + 갈라지는 균사 + 바깥으로 흐르는 양분(초록 점)
        disc(x, y, r, C.hypha, 0.3 * k, FL); disc(x, y, r, PAL.swarm.rim, 0.6 * k, FL, 2);
        for (let i = 0; i < 9; i++) {
          const an = rnd(id, i) * TAU, r1 = r * (0.55 + 0.35 * rnd(id, i + 9)), bend = (rnd(id, i + 18) - 0.5) * 0.9;
          const mx = x + Math.cos(an) * r1 * 0.5, my = y + Math.sin(an) * r1 * 0.5 * FL, ex = x + Math.cos(an + bend) * r1, ey = y + Math.sin(an + bend) * r1 * FL;
          pline(x, y, mx, my, 2, C.hyphaL, 0.55 * k); pline(mx, my, ex, ey, 2, C.hyphaL, 0.38 * k);
          const q = RM.matches ? 0.5 : (tk * 0.035 + rnd(id, i + 27)) % 1, h2 = q < 0.5 ? q * 2 : (q - 0.5) * 2;
          const px = q < 0.5 ? x + (mx - x) * h2 : mx + (ex - mx) * h2, py = q < 0.5 ? y + (my - y) * h2 : my + (ey - my) * h2;
          dot(px, py, 2, C.heal, 0.9 * k * (1 - q * 0.7));
        }
        disc(x, y, 6, PAL.swarm.hot, 0.6 * k, FL);
      } else if (f.ab === 'rot') {                                                       // 부패 포자: 썩은 갈색 얼룩 바닥
        disc(x, y + 2, r, C.rot, 0.32 * k, FL); disc(x, y + 2, r, C.rotL, 0.45 * k, FL, 2);
        for (let i = 0; i < 6; i++) disc(x + (rnd(id, i) - 0.5) * r * 1.3, y + 2 + (rnd(id, i + 6) - 0.5) * r * 0.7, r * (0.15 + 0.15 * rnd(id, i + 12)), C.rot, 0.5 * k, FL);
      } else if (f.ab === 'stasis') {                                                    // 결정 봉인: 청록 바닥 + 가장자리 결정 기둥(뒤 절반)
        disc(x, y, r, C.cry, 0.16 * k, FL); disc(x, y, r, C.cryL, 0.75 * k, FL, 2);
        for (let i = 0; i < 12; i++) { const an = i / 12 * TAU + rnd(id, i) * 0.3; if (Math.sin(an) > 0) continue; crystal(x + Math.cos(an) * r, y + Math.sin(an) * r * FL, 8 + rnd(id, i + 5) * 8, 5, C.cry, C.cryL, 0.85 * k); }
      } else if (f.ab === 'chorus') {                                                    // 대합창: 중심에서 퍼지는 금·청록 물결
        disc(x, y, r, C.gold, 0.08 * k, FL); disc(x, y, r, C.cryL, 0.5 * k, FL, 2);
        for (let j = 0; j < 3; j++) { const u = RM.matches ? (j + 1) / 4 : ((tk + j * 12) % 36) / 36; disc(x, y, Math.max(4, r * u), j & 1 ? C.gold : C.cryL, 0.65 * (1 - u) * k, FL, 1); }
      } else if (f.ab === 'repairdrones') {                                              // 수리 드론: 강철 바닥 + 초록 테 + 도는 초록 눈금
        disc(x, y, r, C.steel, 0.12 * k, FL); disc(x, y, r, C.heal, 0.55 * k, FL, 2); rimTicks(x, y, r - 4, C.heal, 0.6 * k, tk, 16, -0.015);
      } else {                                                                           // 그 밖: 시전자 종족 장판
        const P = PAL[race] || PAL.legion;
        disc(x, y, r, P.fill, 0.16 * k, FL); disc(x, y, r, P.rim, 0.6 * k, FL, 2); rimTicks(x, y, r - 4, P.mote, 0.7 * k, tk, 14, 0.02);
      }
    }
    function auraFloor(f, x, y, r, k, tk, race) {
      if (f.ab === 'amplify') {                                                          // 공명 증폭: 시전자에서 퍼지는 금빛 고리 + 도는 점선
        disc(x, y, r, C.gold, 0.06 * k, FL);
        for (let j = 0; j < 2; j++) { const u = RM.matches ? 0.6 : ((tk + j * 12) % 24) / 24; disc(x, y, Math.max(6, r * u), C.goldL, 0.85 * (1 - u) * k, FL, 2); }
        disc(x, y, r, C.gold, 0.45 * k, FL, 1); rimTicks(x, y, r, C.goldL, 0.9 * k, tk, 12, 0.06);
      } else if (f.ab === 'prism') {                                                     // 프리즘 장막: 옅은 덮개 + 네 색이 도는 가장자리
        const cs = [C.cryL, C.gold, C.glint, C.mana];
        disc(x, y, r, C.cry, 0.05 * k, FL);
        for (let i = 0; i < 24; i++) { const an = i / 24 * TAU - (RM.matches ? 0 : tk * 0.015); dot(x + Math.cos(an) * r, y + Math.sin(an) * r * FL, 2, cs[i & 3], 0.5 * k); }
      } else { const P = PAL[race] || PAL.legion; disc(x, y, r, P.rim, 0.4 * k, FL, 1); rimTicks(x, y, r, P.mote, 0.6 * k, tk, 12, 0.04); }
    }
    // 지연 효과 경고: 바닥 붉은 기운 + 노란 테두리(갈수록 빨리 깜빡임) + 안으로 수렴하는 고리 + 십자 눈금 + 커지는 그림자
    function telegraph(f, ef, x, y, r, tk, alpha) {
      const p = pend.get(f.id), D0 = (ef && ef.delay) || (p && p.d0) || f.delay + 1;
      const u = Math.max(0, Math.min(1, 1 - (f.delay - alpha) / D0)), per = 10 - 7 * u, on = RM.matches || (tk / per) % 1 < 0.6;
      disc(x, y, r, C.alert, 0.06 + 0.14 * u, FL);
      disc(x, y, 6 + r * 0.5 * u, C.shadow, 0.15 + 0.3 * u, FL);
      disc(x, y, r, C.warn, on ? 0.9 : 0.4, FL, 2);
      disc(x, y, Math.max(6, r * (1 - u)), C.alert, 0.75, FL, 1);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) pline(x + dx * (r + 6), y + dy * (r + 6) * FL, x + dx * (r - 8), y + dy * (r - 8) * FL, 2, C.warn, 0.9);
      if (on) { dot(x, y, 4, C.alert, 1); dot(x, y, 2, C.glint, 1); }
    }
    function resonanceFloor(vis, tk) {
      const RS = resCfg(), list = [];
      for (const o of vis.values()) { const e = o.e; if (e.isB || e.isR || !o.vis || e.owner < 0 || e.morph || !e.def || e.def.race !== 'elysian') continue; list.push({ id: e.id, owner: e.owner, type: e.type, x: o.x, y: o.y - (o.lift || 0), o }); }
      if (list.length < 3) return;
      if (resT !== R.tick) { resT = R.tick; resC = resonance(list, (RS.r || 4) * TILE, RS.cap || 4); }   // 이웃 계산은 틱당 한 번(선은 보간 위치로)
      const res = resC;
      if (!res.links.length) return;
      const at = new Map(); for (const u of list) at.set(u.id, u);
      ctx.save(); ctx.strokeStyle = C.cryL; ctx.lineWidth = 2; ctx.globalAlpha = 0.55; ctx.setLineDash([4, 4]); ctx.lineDashOffset = RM.matches ? 0 : -tk * 0.6;
      ctx.beginPath();
      for (const [a, b] of res.links) { const p = at.get(a), q = at.get(b); if (!p || !q) continue; ctx.moveTo(P2(p.x), P2(p.y + 2)); ctx.lineTo(P2(q.x), P2(q.y + 2)); }
      ctx.stroke(); ctx.restore();
      for (const u of list) {                                                            // 공명 중(n ≥ 2): 40틱마다 발밑 물결(n 클수록 밝게)
        const n = res.n.get(u.id) || 0; if (n < 2) continue;
        const ph = RM.matches ? 0.3 : ((tk + u.id * 7) % 40) / 40; if (ph >= 0.5) continue;
        const q = ph * 2, rad = u.o.e.def.radius || 8;
        disc(u.x, u.y + 3, rad + 2 + q * 8, C.cryL, (0.25 + 0.06 * n) * (1 - q), 0.5, 1);
      }
    }

    // ===== 유닛 위 덧그림(unit() 안, 스프라이트 다음). 반환 true = 결정막 피격을 물결로 대신 그렸다 =====
    function spikes(s, ux, cy0, flip, st, tk, id) {
      if (!s.prof) {                                                                     // 열마다 맨 위 불투명 행(외곽선 포함), 스프라이트당 한 번
        const W = s.w, Hh = s.h, d = s.cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, Hh).data, pr = new Int16Array(W).fill(-1);
        for (let x = 0; x < W; x++) for (let y = 0; y < Hh; y++) if (d[(y * W + x) * 4 + 3]) { pr[x] = y; break; }
        let x0 = 0, x1 = W - 1; while (x0 < W && pr[x0] < 0) x0++; while (x1 > x0 && pr[x1] < 0) x1--;
        s.prof = pr; s.profX = [x0, x1];
      }
      const pr = s.prof, [x0, x1] = s.profX, dw = s.w * s.px, dh = s.h * s.px, fr = st === 1 ? [0.3, 0.5, 0.7] : [0.18, 0.34, 0.5, 0.66, 0.82];
      for (let i = 0; i < fr.length; i++) {
        let cx = Math.round(x0 + (x1 - x0) * fr[i]); while (cx < x1 && pr[cx] < 0) cx++;
        if (pr[cx] < 0) continue;
        const sx = flip ? ux + dw / 2 - (cx + 0.5) * s.px : ux - dw / 2 + (cx + 0.5) * s.px, sy = cy0 - dh / 2 + (pr[cx] + 1) * s.px;
        const h = (st === 1 ? 4 : 6) + (i === (fr.length >> 1) ? 2 : 0), X = P2(sx - 1), Y = P2(sy);
        ctx.globalAlpha = 1; ctx.fillStyle = ink; ctx.fillRect(X - 1, Y - h - 1, 4, h + 1);
        ctx.fillStyle = C.spine; ctx.fillRect(X, Y - h + 2, 2, h - 2); ctx.fillStyle = C.bone; ctx.fillRect(X, Y - h, 2, 2);
        if (st === 2) { ctx.fillStyle = col.gas; ctx.fillRect(X, Y - h, 2, 1); }
      }
      if (st === 2) glow(ux, cy0, 16, 1, 0.2 + (RM.matches ? 0 : 0.12 * Math.sin(tk * 0.2 + id)));
    }
    function shell(x, cy, dw, dh, rad, tk, id) {                                        // 결정 봉인: 육각 결정 껍질(반투명) + 면 빛 + 반짝임
      const w = Math.max(rad * 2 + 10, dw * 0.75), h = Math.max(rad * 2 + 12, dh * 0.95), X = P2(x), hw = P2(w / 2), T0 = P2(cy - h / 2), B = P2(cy + h / 2), sh = P2(h * 0.18);
      ctx.beginPath(); ctx.moveTo(X, T0 - 4); ctx.lineTo(X + hw, T0 + sh); ctx.lineTo(X + hw, B - sh); ctx.lineTo(X, B + 2); ctx.lineTo(X - hw, B - sh); ctx.lineTo(X - hw, T0 + sh); ctx.closePath();
      ctx.globalAlpha = 0.38; ctx.fillStyle = C.cry; ctx.fill();
      ctx.globalAlpha = 0.95; ctx.strokeStyle = C.cryL; ctx.lineWidth = 2; ctx.stroke();
      ctx.globalAlpha = 0.55; ctx.fillStyle = C.glint; ctx.fillRect(X - hw + 4, T0 + sh + 2, 2, P2(h * 0.45)); ctx.fillRect(X - 2, T0 + 2, 2, P2(h * 0.25));
      ctx.globalAlpha = 0.35; ctx.fillStyle = C.cryD; ctx.fillRect(X + 4, T0 + sh, 2, B - T0 - 2 * sh);
      const n = Math.floor(tk / 12), hsh = hash(id, n);
      if (!RM.matches && (hsh & 3) === 0) spk(X - hw + 4 + (hsh >> 4 & 15) / 15 * (hw * 2 - 8), T0 + sh + (hsh >> 8 & 15) / 15 * (B - T0 - 2 * sh), C.cryL, 1 - (tk / 12 - n));
      glow(x, cy, 16, 2, 0.35);
    }
    function reticle(x, cy, rad, tk, top) {                                              // 표식: 붉은 조준 꺾쇠(맥동) + 머리 위 마름모
      const k = RM.matches ? 1 : 1 + 0.12 * Math.sin(tk * 0.45), hw = P2(Math.max(rad + 6, 10) * k), hh = P2(hw * 0.8), X = P2(x), Y = P2(cy), L = 6;
      ctx.globalAlpha = 0.95;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const cx = X + sx * hw, cyy = Y + sy * hh;
        ctx.fillStyle = ink; ctx.fillRect(sx < 0 ? cx - 1 : cx - L - 1, cyy - 2, L + 2, 4); ctx.fillRect(cx - 2, sy < 0 ? cyy - 1 : cyy - L - 1, 4, L + 2);
        ctx.fillStyle = C.alert; ctx.fillRect(sx < 0 ? cx : cx - L, cyy - 1, L, 2); ctx.fillRect(cx - 1, sy < 0 ? cyy : cyy - L, 2, L);
      }
      const ty = P2(top - 8 - (RM.matches ? 0 : (Math.floor(tk / 6) & 1) * 2));
      ctx.fillStyle = ink; ctx.fillRect(X - 4, ty - 2, 8, 6); ctx.fillRect(X - 2, ty - 4, 4, 10);
      ctx.fillStyle = C.alert; ctx.fillRect(X - 2, ty, 4, 2); ctx.fillRect(X - 1, ty - 2, 2, 6);
    }
    function streaks(x, fy, rad, dir, tk, id) {                                         // 가속: 발밑에서 뒤로 흐르는 금빛 속도선 3줄(어두운 받침) + 발밑 금빛 고리
      const an = dir * Math.PI / 4, bx = -Math.cos(an), by = -Math.sin(an) * 0.6, L = Math.hypot(bx, by) || 1, px = -by / L, py = bx / L;
      disc(x, fy, rad + 4, C.goldL, 0.7, 0.5, 1);
      for (let i = 0; i < 3; i++) {
        const q = RM.matches ? 0.3 : (tk * 0.2 + i * 0.37 + id * 0.13) % 1, off = (i - 1) * 7, s0 = rad + 2 + q * 14, len = 16 + 8 * (i & 1);
        const x0 = x + bx * s0 + px * off, y0 = fy - 4 - (i & 1) * 4 + by * s0 + py * off, a = 1 - 0.6 * q;
        pline(x0, y0 + 2, x0 + bx * len, y0 + 2 + by * len, 4, ink, a * 0.8);
        pline(x0, y0, x0 + bx * len, y0 + by * len, 3, i === 1 ? C.goldL : C.cryL, a);
      }
    }
    function unit(o, cy0, s, ux, flip, tk, shielded) {
      const e = o.e, fl = e.stf | 0, rad = e.def.radius || 8, dw = s.w * s.px, dh = s.h * s.px, fy = o.lift ? cy0 + dh * 0.35 : o.y + 3;
      const mu = mutStage(e, D); if (mu) spikes(s, ux, cy0, flip, mu, tk, e.id);
      if (fl & ST.stasis) shell(ux, cy0, dw, dh, rad, tk, e.id);
      else {
        if (fl & ST.rooted) {                                                            // 견인 빔: 주황 고정 고리 + 집게 4 + 위로 오르는 견인 점
          disc(o.x, fy, rad + 6, C.orange, 0.85, 0.5, 1);
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const X = o.x + dx * (rad + 6), Y = fy + dy * (rad + 6) * 0.5; dot(X, Y, 6, ink, 1); dot(X, Y, 2, C.orange, 1); }
          for (let i = 0; i < 3; i++) { const q = RM.matches ? 0.5 : (tk * 0.08 + i / 3) % 1; dot(o.x + (i - 1) * 6, fy - q * 26, 2, C.orange, 0.7 * (1 - q)); }
        }
        if (fl & ST.disarmed) for (let i = 0; i < 3; i++) crystal(ux + (i - 1) * 7, o.top + 6 + (i & 1) * 2, 7 + (i & 1) * 3, 4, C.cry, C.cryL, 0.9);   // 결정화: 몸 위로 자란 결정
        if (fl & ST.slowed) for (let i = 0; i < 3; i++) { disc(o.x + (i - 1) * rad * 0.6, fy, 3 + (i & 1) * 2, C.hypha, 0.7, 0.6); dot(o.x + (i - 1) * rad * 0.6, fy + 3 + ((tk / 8 + i) % 3), 2, C.hyphaL, 0.7); }
      }
      if (fl & ST.hasted) streaks(ux, fy, rad, R.dir.get(e.id) ?? 2, tk, e.id);
      if (fl & ST.marked) reticle(ux, cy0, rad, tk, o.top);
      let took = false;
      if (resCfg() && e.def.race === 'elysian') {                                        // 결정막 피격 = 물결 고리 3겹(12틱)
        let st = rip.get(e.id);
        if (shielded) { if (st === undefined || tk - st > 5) rip.set(e.id, st = tk); took = true; }
        if (st !== undefined) {
          const a = tk - st;
          if (a > 12) rip.delete(e.id);
          else for (let j = 0; j < 3; j++) { const u = (a - j * 2.5) / 7; if (u >= 0 && u < 1) disc(o.x, cy0 + 2, (rad + 7) * (0.6 + 0.8 * u), j === 1 ? C.gold : C.cryL, 0.9 * (1 - u), 0.62, 1); }
        }
      }
      ctx.globalAlpha = 1;
      return took;
    }
    // 변이 단계 스프라이트 키: '<type>@mut1|2' = 1.1·1.2배로 다시 그린 정의(픽셀 선명, 처음 쓸 때 등록)
    function mutKey(e, sk) {
      const st = mutStage(e, D); if (!st) return sk;
      const key = sk + '@mut' + st, base = A.SPR[sk];
      if (!A.SPR[key]) { if (!base || base.px !== 1) return sk; A.SPR[key] = A.grow(base, st === 1 ? 1.1 : 1.2); }
      return key;
    }

    // ===== 위층(공중 유닛·연기 다음, 발광 합성·안개 전): 장판 입자·파편 비·낙하 덩이·순간 연출 =====
    const ownsAreaDot = f => f.delay > 0 || ((effOf(f.ab) || {}).delay > 0) || (f.ab === 'mindstorm' && shardRain());
    function top(state, tk, alpha, fogAt, me, vis) {
      const ally = o => o >= 0 && !S.isEnemy(state, me, o);
      for (const f of state.fx) {
        if (f.kind !== 'zone' && f.kind !== 'area_dot') continue;
        const x = f.x / FP, y = f.y / FP, r = f.r / FP;
        if (!onCam(x, y, r + 60) || !(fogAt(x, y) || ally(f.owner))) continue;
        const ef = effOf(f.ab), id = f.id;
        if (f.delay > 0) { if (f.delay < 14) junkFall(x, y, r, 1 - (f.delay - alpha) / 14, id); continue; }
        if (f.kind === 'area_dot') { if (f.ab === 'mindstorm' && shardRain()) shards(f, x, y, r, fade(f, ef, alpha), tk); continue; }
        const k = fade(f, ef, alpha);
        if (f.ab === 'smoke') for (let i = 0; i < 11; i++) {                             // 소용돌이치는 연기 덩이
          const an = rnd(id, i) * TAU + (RM.matches ? 0 : tk * 0.012 * (i & 1 ? 1 : -1)), rr = r * (0.12 + 0.72 * rnd(id, i + 10));
          const rise = RM.matches ? 0 : (tk * 0.12 + i * 3) % 8;
          disc(x + Math.cos(an) * rr, y - 8 + Math.sin(an) * rr * FL - rise, 9 + rnd(id, i + 20) * 8, i % 3 ? C.smoke : C.smokeL, 0.5 * k, 0.75);
        } else if (f.ab === 'rot') {                                                     // 낮은 포자 구름 + 떠오르는 포자
          for (let i = 0; i < 5; i++) disc(x + (rnd(id, i + 30) - 0.5) * r * 1.2, y - 6 + (rnd(id, i + 35) - 0.5) * r * 0.5, 10 + rnd(id, i + 40) * 7, C.rot, 0.35 * k, 0.7);
          for (let i = 0; i < 12; i++) { const q = RM.matches ? 0.4 : (tk * 0.03 + rnd(id, i)) % 1; const sx = x + (rnd(id, i + 5) - 0.5) * 1.6 * r, sy = y + (rnd(id, i + 9) - 0.5) * r * FL - q * 30, z = q < 0.5 ? 4 : 2; dot(sx, sy + 2, z, ink, 0.6 * k * (1 - q)); dot(sx, sy, z, i & 1 ? C.rotL : col.gas, k * (1 - q)); }
        } else if (f.ab === 'mat') {
          for (let i = 0; i < 5; i++) { const q = RM.matches ? 0.4 : (tk * 0.025 + rnd(id, i + 50)) % 1; dot(x + (rnd(id, i + 55) - 0.5) * 1.4 * r, y + (rnd(id, i + 60) - 0.5) * r * FL - 4 - q * 22, 2, C.heal, 0.9 * k * (1 - q)); }
        } else if (f.ab === 'stasis') {                                                  // 앞 절반 결정 기둥 + 반짝임
          for (let i = 0; i < 12; i++) { const an = i / 12 * TAU + rnd(id, i) * 0.3; if (Math.sin(an) <= 0) continue; crystal(x + Math.cos(an) * r, y + Math.sin(an) * r * FL, 8 + rnd(id, i + 5) * 8, 5, C.cry, C.cryL, 0.85 * k); }
          const n = Math.floor(tk / 8); for (let j = 0; j < 3; j++) { const h = hash(id * 5 + j, n), an = (h & 1023) / 1023 * TAU, rr = r * ((h >> 10 & 255) / 255); spk(x + Math.cos(an) * rr, y + Math.sin(an) * rr * FL - 10, C.cryL, k * (1 - (tk / 8 - n))); }
        } else if (f.ab === 'chorus') {                                                  // 떠오르는 음표(머리 4×4 + 기둥)
          for (let i = 0; i < 4; i++) {
            const q = RM.matches ? 0.4 : (tk * 0.03 + i / 4) % 1, nx = x + (rnd(id, i + 70) - 0.5) * r * 1.4, ny = y + (rnd(id, i + 75) - 0.5) * r * FL - 6 - q * 28, a = k * Math.min(1, (1 - q) * 2);
            dot(nx, ny, 4, i & 1 ? C.gold : C.cryL, a); dot(nx + 2, ny - 5, 2, i & 1 ? C.gold : C.cryL, a); dot(nx + 2, ny - 8, 2, i & 1 ? C.gold : C.cryL, a);
          }
          glow(x, y, 32, 2, 0.25 * k);
        } else if (f.ab === 'repairdrones') {                                            // 맴도는 수리 드론 4기(강철 몸 + 초록 눈) → 바닥으로 용접 빔 + 초록 불꽃
          for (let i = 0; i < 4; i++) {
            const an = i / 4 * TAU + (RM.matches ? 0 : tk * 0.04 * (i & 1 ? -1 : 1)), rr = r * (0.35 + 0.3 * rnd(id, i + 80));
            const dx = x + Math.cos(an) * rr, dy = y + Math.sin(an) * rr * FL - 22 - (RM.matches ? 0 : Math.sin(tk * 0.15 + i) * 2);
            dot(dx, dy + 3, 6, ink, 0.5 * k); dot(dx - 4, dy - 1, 8, C.steel, k); dot(dx - 1, dy - 3, 2, C.steelL, k); dot(dx - 1, dy + 1, 2, C.heal, k);
            const n = Math.floor(tk / 6), on = (hash(id * 7 + i, n) & 3) !== 0;
            if (!on) continue;
            const wx = dx + ((hash(id * 7 + i, n) >> 4 & 15) - 7.5), wy = dy + 18 + ((hash(id * 7 + i, n) >> 8 & 7) - 3.5);
            pline(dx, dy + 2, wx, wy, 2, C.heal, 0.7 * k);
            for (let j = 0; j < 3; j++) { const h = hash(id * 13 + i * 3 + j, tk >> 1); spk(wx + ((h & 15) - 7.5) * 0.6, wy - ((h >> 4) & 7), j ? C.heal : C.glint, k * 0.9); }
            glow(wx, wy, 12, 4, 0.45 * k);
          }
        } else {
          const P = PAL[raceOf(state, f.owner)] || PAL.legion;
          for (let i = 0; i < 6; i++) { const q = RM.matches ? 0.4 : (tk * 0.03 + rnd(id, i)) % 1; dot(x + (rnd(id, i + 5) - 0.5) * 1.4 * r, y + (rnd(id, i + 9) - 0.5) * r * FL - q * 22, 2, P.mote, k * (1 - q)); }
        }
      }
      for (const f of state.fx) {                                                        // 견인 빔: 시전자 → 대상, 둘 다 보일 때만
        if (f.kind !== 'status' || f.ab !== 'tow' || !f.src) continue;
        const A0 = vis.get(f.src), B0 = vis.get(f.tgt);
        if (!A0 || !B0 || !A0.vis || !B0.vis) continue;
        const ax = A0.x, ay = A0.y - (A0.lift || 0) - 6, bx = B0.x, by = B0.y - (B0.lift || 0) - 6;
        if (!onCam((ax + bx) / 2, (ay + by) / 2, Math.hypot(bx - ax, by - ay) / 2 + 40)) continue;
        const n = Math.max(3, Math.min(24, Math.round(Math.hypot(bx - ax, by - ay) / 10))), nx = -(by - ay), ny = bx - ax, nl = Math.hypot(nx, ny) || 1;
        const wob = i => RM.matches ? 0 : Math.sin(tk * 0.25 + i * 0.9 + f.id) * 2.5 * Math.sin(Math.PI * i / n);
        let px = ax, py = ay;
        for (let i = 1; i <= n; i++) {
          const t = i / n, w = wob(i), qx = ax + (bx - ax) * t + nx / nl * w, qy = ay + (by - ay) * t + ny / nl * w;
          pline(px, py + 2, qx, qy + 2, 4, ink, 0.55); pline(px, py, qx, qy, 4, C.orange, 0.5); pline(px, py, qx, qy, 2, i & 1 ? C.glint : C.orange, 0.95);
          px = qx; py = qy;
        }
        for (let i = 0; i < 4; i++) { const q = RM.matches ? 0.5 : (tk * 0.06 + i / 4) % 1; dot(ax + (bx - ax) * q, ay + (by - ay) * q - 1, 4, C.glint, 0.9 * Math.sin(Math.PI * q)); }
      }
      bursts(tk, alpha, fogAt, vis);
      ctx.globalAlpha = 1;
    }
    function shards(f, x, y, r, k, tk) {                                                // 공명 파쇄: 결정 파편이 비스듬히 떨어져 바닥에서 부서진다
      const id = f.id;
      disc(x, y + 2, r, C.cryD, 0.22 * k, FL); disc(x, y + 2, r, C.cryL, 0.65 * k, FL, 2);
      for (let i = 0; i < 16; i++) {
        const per = 10, t0 = tk + rnd(id, i) * per, n = Math.floor(t0 / per), ph = RM.matches ? 0.5 : t0 / per - n, h = hash(id * 31 + i, n);
        const an = (h & 1023) / 1023 * TAU, rr = r * Math.sqrt(((h >> 10) & 255) / 255) * 0.9, gx = x + Math.cos(an) * rr, gy = y + Math.sin(an) * rr * FL;
        if (ph < 0.75) { const v = ph / 0.75, sx = gx + 14 * (1 - v), sy = gy - 80 * (1 - v); crystal(sx, sy, 7, 3, C.cry, C.glint, k); pline(sx + 3, sy - 9, sx + 9, sy - 21, 2, C.cryL, 0.4 * k); }
        else { const v = (ph - 0.75) / 0.25; spk(gx, gy - 2, C.cryL, k * (1 - v)); for (const s of [-1, 1]) dot(gx + s * (3 + v * 7), gy - 2 - v * 4, 2, C.cryL, k * (1 - v)); }
      }
      glow(x, y - 10, 32, 2, 0.3 * k);
    }
    function junkFall(x, y, r, v, id) {                                                 // 고철 낙하 마지막 14틱: 하늘에서 달아오른 고철 덩이가 떨어진다
      v = Math.max(0, Math.min(1, v));
      const h = 320 * (1 - v) * (1 - v), X = x + 40 * (1 - v), Y = y - h - 10, s = 10 + r * 0.12;
      for (let i = 0; i < 4; i++) pline(X + 6 + i * 3, Y - 10 - i * 8, X + 18 + i * 5, Y - 34 - i * 10, 2, i & 1 ? C.warn : col.fireHot, 0.6 * v);
      ctx.globalAlpha = 1; ctx.fillStyle = ink;
      ctx.fillRect(P2(X - s) - 2, P2(Y - s * 0.7) - 2, P2(s * 2) + 4, P2(s * 1.4) + 4);
      ctx.fillStyle = C.steel; ctx.fillRect(P2(X - s), P2(Y - s * 0.7), P2(s * 2), P2(s * 1.4));
      ctx.fillStyle = C.steelL; ctx.fillRect(P2(X - s), P2(Y - s * 0.7), P2(s * 2), 2); ctx.fillRect(P2(X - s), P2(Y - s * 0.7), 2, P2(s * 1.4));
      ctx.fillStyle = C.orange; ctx.fillRect(P2(X - s * 0.4), P2(Y - s * 0.2), P2(s * 0.9), 4);
      for (let i = 0; i < 3; i++) { const hh = hash(id, i); ctx.fillStyle = i & 1 ? C.steelL : ink; ctx.fillRect(P2(X - s + (hh & 15) / 15 * s * 1.6), P2(Y - s * 0.7 - 4), 4, 4); }
      glow(X, Y, 16, 5, 0.5 + 0.4 * v);
    }
    function bursts(tk, alpha, fogAt, vis) {
      for (const f of R.fx) {
        if (f.k !== 'x3clean' && f.k !== 'x3burn' && f.k !== 'x3drain' && f.k !== 'x3zap' && f.k !== 'x3sum') continue;
        const a = f.age + alpha, u = a / f.ttl; if (u >= 1) continue;
        if (f.id) { const O = vis.get(f.id); if (O) { f.x = O.x; f.y = O.y - (O.lift || 0); } }
        if (!fogAt(f.x, f.y + (f.id ? 0 : 0))) continue;
        const x = f.x, y = f.y;
        if (f.k === 'x3clean') {                                                         // 정화: 하얀 고리 2개가 머리 위로 + 반짝임 + 떨어져 나가는 어두운 찌꺼기
          for (let j = 0; j < 2; j++) { const q = u * 1.4 - j * 0.3; if (q >= 0 && q < 1) disc(x, y - 2 - q * 24, 12, j ? C.scan : C.glint, 0.85 * (1 - q), 0.45, 1); }
          for (let i = 0; i < 6; i++) { const an = rnd(f.seed, i) * TAU, d = 6 + 18 * easeOut(u); spk(x + Math.cos(an) * d, y - 14 + Math.sin(an) * d * 0.6 - u * 6, C.scan, 1 - u); }
          for (let i = 0; i < 5; i++) { const an = rnd(f.seed, i + 9) * TAU, d = 4 + 20 * u; dot(x + Math.cos(an) * d, y - 12 + Math.sin(an) * d * 0.5 + 18 * u * u, 2, ink, 0.9 * (1 - u)); }
          glow(x, y - 12, 16, 3, 0.6 * (1 - u));
        } else if (f.k === 'x3burn') {                                                   // 음파 역류: 시전자 → 대상 음파 3개, 대상 마나가 안으로 모였다가 터진다
          if (a < 7) {
            const v = a / 7, C2 = f.c ? vis.get(f.c) : null;
            if (C2) for (let j = 0; j < 3; j++) { const q = Math.min(1, v * 1.3 - j * 0.15); if (q > 0) disc(C2.x + (x - C2.x) * q, (C2.y - 12 - (C2.lift || 0)) + (y - 12 - (C2.y - 12 - (C2.lift || 0))) * q, 6 + j * 2, C.mana, 0.8, 1, 1); }
            for (let i = 0; i < 8; i++) { const an = i / 8 * TAU + rnd(f.seed, i), d = 28 * (1 - v); dot(x + Math.cos(an) * d, y - 12 + Math.sin(an) * d * 0.6, 2, C.mana, 0.95); }
          } else {
            const v = (a - 7) / (f.ttl - 7);
            disc(x, y - 12, 6 + 26 * easeOut(v), C.mana, 1 - v, 0.75, 2); disc(x, y - 12, 10 * (1 - v), C.glint, 1 - v);
            for (let i = 0; i < 4; i++) { const an = rnd(f.seed, i + 20) * TAU; let px = x, py = y - 12; for (let q = 1; q <= 3; q++) { const nx = x + Math.cos(an + (rnd(f.seed, i * 4 + q) - 0.5) * 0.8) * q * 8 * (0.5 + v), ny = y - 12 + Math.sin(an) * q * 5 * (0.5 + v); pline(px, py, nx, ny, 2, C.mana, 1 - v); px = nx; py = ny; } }
            glow(x, y - 12, 32, 3, 0.8 * (1 - v));
          }
        } else if (f.k === 'x3drain') {                                                  // 음파 역류(마나 나눔): 대상 마나가 빨려 나와 시전자로 흐르고, 거기서 받는 아군마다 갈라져 흐른다
          const C2 = f.c ? vis.get(f.c) : null, cx = C2 ? C2.x : x, cy = C2 ? C2.y - (C2.lift || 0) : y, v1 = Math.min(1, a / 10);
          disc(x, y - 12, 14 * (1 - u), C.mana, 0.9 * (1 - u), 0.75, 2);
          for (let i = 0; i < 8; i++) { const q = (v1 * 1.2 - i * 0.05); if (q <= 0 || q >= 1) continue; const s = Math.sin(Math.PI * q) * 10 * (i & 1 ? 1 : -1); dot(x + (cx - x) * q, y - 12 + (cy - y) * q + s * 0.4, i & 1 ? 2 : 4, i & 2 ? C.glint : C.mana, 1 - u * 0.5); }
          if (a >= 8) {
            const v = Math.min(1, (a - 8) / (f.ttl - 8));
            for (const id of f.to || []) {
              const O = vis.get(id); if (!O) continue;
              const tx = O.x, ty = O.y - (O.lift || 0) - 10;
              for (let j = 0; j < 3; j++) { const q = v * 1.3 - j * 0.12; if (q > 0 && q < 1) dot(cx + (tx - cx) * q, cy - 12 + (ty - cy + 12) * q, 2, C.mana, 1 - v * 0.6); }
              if (v > 0.7) disc(tx, ty, 4 + 8 * (v - 0.7) / 0.3, C.mana, (1 - v) * 3, 0.6, 1);
            }
            glow(cx, cy - 12, 24, 3, 0.7 * (1 - v));
          }
        } else if (f.k === 'x3zap') {                                                    // 방전탄: 결정막·마나 소거 충격파 + 방사 번개
          const r = f.r;
          disc(x, y, Math.max(4, r * easeOut(u)), C.shield, 0.95 * (1 - u), FL, 2);
          disc(x, y, Math.max(4, r * 0.7 * easeOut(Math.min(1, u * 1.6))), C.mana, 0.8 * (1 - u), FL, 1);
          disc(x, y - 6, 14 * (1 - u), C.glint, 1 - u);
          if (u < 0.6) for (let i = 0; i < 8; i++) {
            const h = hash(f.seed + i, Math.floor(a / 2)), an = i / 8 * TAU + ((h & 255) / 255 - 0.5) * 0.6; let px = x, py = y - 4;
            for (let q = 1; q <= 4; q++) { const rr = r * q / 4 * (0.4 + u), nx = x + Math.cos(an) * rr + ((h >> (q * 4)) & 7) - 3.5, ny = y - 4 + Math.sin(an) * rr * FL; pline(px, py, nx, ny, 2, q & 1 ? C.shield : C.glint, 1 - u / 0.6); px = nx; py = ny; }
          }
          glow(x, y - 6, 32, 3, 0.9 * (1 - u));
        } else {                                                                         // 소환: 종족색 고리 + 불티
          const P = PAL[f.race] || PAL.legion;
          disc(x, y, 4 + 22 * easeOut(u), P.rim, 1 - u, FL, 1);
          for (let i = 0; i < 6; i++) { const an = rnd(f.seed, i) * TAU, d = 4 + 16 * easeOut(u); spk(x + Math.cos(an) * d, y - 6 + Math.sin(an) * d * 0.5 - u * 8, P.mote, 1 - u); }
        }
      }
    }

    // ===== 틱마다(addEvents 끝): cast 이벤트 → 순간 연출, 지연 효과 추적(끝나는 틱에 낙하 충격) =====
    function events(evs, state, tk) {
      if (!state) return;
      for (const ev of evs) {
        if (ev.t !== 'cast') continue;
        const ef = effOf(ev.what); if (!ef) continue;
        const x = ev.x / FP, y = ev.y / FP;
        if (ev.what !== 'heal' && SFX3[ev.what]) R.sfx.push({ s: 'c_' + ev.what, x, y, seed: hash(ev.id, tk) });   // 소리: 안개·화면 거름은 R.draw 의 효과음 단계가 한다
        if (!onCam(x, y, 120)) continue;
        const cs = S.byId(state, ev.id), race = cs ? raceOf(state, cs.owner) : 'legion', seed = hash(ev.id * 31 + (ev.tgt || 0), tk);
        if (ef.kind === 'instant' && ef.cleanse) pushFx({ k: 'x3clean', id: ev.tgt, x, y, seed, age: 0, ttl: 20 });
        else if (ef.kind === 'instant' && ef.burnEnergy) pushFx({ k: 'x3burn', id: ev.tgt, c: ev.id, x, y, seed, age: 0, ttl: 22 });
        else if (ef.kind === 'instant' && ef.drainEnergy) {                              // 받는 아군(렌더용 근사: 시전자 반경 share.r 안 같은 팀 마나 유닛)
          const sh = ef.share, r2 = sh ? (sh.r * TILE) ** 2 : -1, to = [];
          if (cs && sh) for (const o of state.ents) if (o.id !== ev.tgt && o.def.energy && !o.isB && !o.inside && o.owner >= 0 && !S.isEnemy(state, cs.owner, o.owner) && (!sh.race || o.def.race === sh.race)
            && ((o.x - cs.x) / FP) ** 2 + ((o.y - cs.y) / FP) ** 2 <= r2) to.push(o.id);
          pushFx({ k: 'x3drain', id: ev.tgt, c: ev.id, to, x, y, seed, age: 0, ttl: 26 });
        }
        else if (ef.kind === 'zone' && ef.left === 1) pushFx({ k: 'x3zap', x, y, r: ef.r, seed, age: 0, ttl: 16 });
        else if (ef.kind === 'summon') pushFx({ k: 'x3sum', x, y, race, seed, age: 0, ttl: 14 });
      }
      const now = new Set(), zn = new Set();
      for (const f of state.fx) {
        if (f.ab === 'stasis' && f.kind === 'zone' && !(f.delay > 0)) { zn.add(f.id); if (!zones.has(f.id)) zones.set(f.id, { x: f.x / FP, y: f.y / FP }); }
        if (f.delay > 0 && f.ab === 'junkdrop' && BEEP[f.delay]) R.sfx.push({ s: BEEP[f.delay], x: f.x / FP, y: f.y / FP, seed: f.id });
      }
      for (const [id, p] of zones) if (!zn.has(id)) { zones.delete(id); R.sfx.push({ s: 'stasisOff', x: p.x, y: p.y, seed: id }); }   // 결정 봉인이 풀릴 때
      for (const f of state.fx) if (f.delay > 0) {
        now.add(f.id);
        if (!pend.has(f.id)) pend.set(f.id, { x: f.x / FP, y: f.y / FP, r: f.kind === 'reveal' ? f.r * TILE : f.r / FP, kind: f.kind, d0: f.delay + 1 });
      }
      for (const [id, p] of pend) if (!now.has(id)) { pend.delete(id); if (p.kind === 'area_dot') impact(p, state, id, tk); }
    }
    function impact(p, state, id, tk) {                                                  // 낙하 충격: 기존 폭발·그을음 엔진 + 금속 파편·먼지 파티클 + 흔들림
      if (!onCam(p.x, p.y, 160)) return;
      const P = fxPal.legion, seed = hash(id, tk);
      pushFx({ k: 'boom', x: p.x, y: p.y, s: 2, alt: 0, pal: P, deb: P, bw: 0, bh: 0, splash: p.r, seed, age: 0, ttl: 46 });
      pushFx({ k: 'scorch', x: p.x, y: p.y, r: p.r * 0.7, pal: P, seed: hash(id, 3), age: 0, ttl: 160 });
      const fog = state.fog[R.me];
      if (fog && fog[Math.floor(p.y / TILE) * state.map.w + Math.floor(p.x / TILE)] === 2) {
        for (let j = 0; j < 12; j++) ptSpawn(3, p.x + (rnd(seed, j) - 0.5) * p.r, p.y, 8, hash(seed, j));
        for (let j = 0; j < 6; j++) ptSpawn(2, p.x + (rnd(seed, j + 20) - 0.5) * p.r * 1.6, p.y + (rnd(seed, j + 30) - 0.5) * p.r * 0.6, 2, hash(seed, j + 40));
        for (let j = 0; j < 4; j++) ptSpawn(0, p.x + (rnd(seed, j + 50) - 0.5) * p.r, p.y, 6, hash(seed, j + 60));
        if (onCam(p.x, p.y, 0)) shakeReq(5, 12);                                       // 흔들림·충격음도 내 시야 안일 때만
        R.sfx.push({ s: 'junkHit', x: p.x, y: p.y, seed });
      }
    }
    const reset = () => { pend.clear(); zones.clear(); rip.clear(); resT = -1; };

    return { floor, top, unit, mutKey, events, ownsAreaDot, reset };
  }

  return { create, mutStage, resonance, STF0 };
})();
if (typeof module !== 'undefined') module.exports = NW_FX3B;
