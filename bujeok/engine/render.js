// 부적난무 — PixiJS 그리기. 상태를 읽기만 한다(fx.hits·kills·hurts·rings 등 기록 배열은 읽은 뒤 비운다).
// 타격감(번쩍임·찌그러짐·파편·혼·히트스톱·흔들림·피격 가장자리)은 그리기 전용이다. 무작위는 Math.random — 시뮬레이션 결정성과 무관하다.
// 그리기 층(아래 → 위): 바닥·소품 → 피해 숫자 → 아군 효과(장판·투사체·구슬·링) → 그림자(본체 표시) → 적 → 안개 → 노출 표식 → 플레이어 → 위험 예고.
// 붉은 그림자는 안개 아래(안개 속에선 안 보임), 맞혀서 생긴 노출 표식(금빛 원)은 안개 위 — 안개 속 본체는 쳐서 찾는다.
// 스펙 8절 우선순위(위험 예고 > 플레이어 > 적 > 아군 효과 > 숫자)를 뒤집은 순서다. 위험 예고는 반투명 외곽선이라 아래를 가리지 않는다.
const BJ_RENDER = (function bjRender() {
  const VIEW_W = 540, VIEW_H = 960, RING_LIFE = 0.3, NUM_LIFE = 0.6, MAX_RINGS = 1500, MAX_NUMS = 60;
  const ENT = typeof BJ_ENT !== 'undefined' ? BJ_ENT : null;

  async function create(host, content) {
    const app = new PIXI.Application();
    await app.init({ resizeTo: host, background: 0x15130f, antialias: true, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2) });
    host.appendChild(app.canvas);

    const cam = new PIXI.Container();
    const layer = {};
    for (const n of ['ground', 'numbers', 'ally', 'shadow', 'enemies', 'juice', 'fog', 'mark', 'player', 'warn']) { layer[n] = new PIXI.Container(); cam.addChild(layer[n]); }
    const groundG = new PIXI.Graphics(), allyG = new PIXI.Graphics(), playerG = new PIXI.Graphics(), warnG = new PIXI.Graphics();
    const shadowG = new PIXI.Graphics(), fogG = new PIXI.Graphics(), markG = new PIXI.Graphics(), juiceG = new PIXI.Graphics();
    const frameG = new PIXI.Graphics(), stickG = new PIXI.Graphics();
    const tileC = new PIXI.Container(), gemC = new PIXI.Container(), shotC = new PIXI.Container();
    layer.ground.addChild(tileC, groundG); layer.ally.addChild(allyG, gemC, shotC); layer.player.addChild(playerG); layer.warn.addChild(warnG); layer.shadow.addChild(shadowG); layer.fog.addChild(fogG); layer.mark.addChild(markG); layer.juice.addChild(juiceG);
    app.stage.addChild(cam, frameG, stickG);

    const texCache = new Map();
    function glyphTex(key, glyph, r, color) {
      if (texCache.has(key)) return texCache.get(key);
      const c = new PIXI.Container();
      c.addChild(new PIXI.Graphics().circle(0, 0, r).fill({ color, alpha: 0.92 }).stroke({ width: 2, color: 0x000000, alpha: 0.45 }));
      const t = new PIXI.Text({ text: glyph, style: { fontFamily: 'Gowun Batang, serif', fontSize: Math.round(r * 1.15), fill: 0x1a1410, fontWeight: '700' } });
      t.anchor.set(0.5);
      c.addChild(t);
      const tex = app.renderer.generateTexture({ target: c, resolution: 2 });
      texCache.set(key, tex);
      return tex;
    }

    // 픽셀아트 그림 → 텍스처(캐시). white는 바깥 테두리 k(4방향 이웃에 빈칸·격자 밖이 있는 k)만 남기고 나머지를 흰색으로 칠한 번쩍임판
    const ART = typeof BJ_ART !== 'undefined' ? BJ_ART : null;
    function artTex(id, frame, white) {
      const s = ART && ART.sprites[id];
      if (!s) return null;
      const f = s.frames[frame % s.frames.length], key = id + '#' + (frame % s.frames.length) + (white ? '!' : '');
      if (texCache.has(key)) return texCache.get(key);
      const h = f.length, w = f[0].length, cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const cx = cv.getContext('2d'), img = cx.createImageData(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const ch = f[y][x];
        if (ch === '.') continue;
        const edge = ch === 'k' && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => ((f[y + dy] || '')[x + dx] || '.') === '.');
        const c = white && !edge ? 0xffffff : ART.PAL[ch], o = (y * w + x) * 4;
        img.data[o] = c >> 16; img.data[o + 1] = (c >> 8) & 255; img.data[o + 2] = c & 255; img.data[o + 3] = 255;
      }
      cx.putImageData(img, 0, 0);
      const tex = PIXI.Texture.from(cv);
      tex.source.scaleMode = 'nearest';
      texCache.set(key, tex);
      return tex;
    }

    // 스프라이트 풀: 바닥 타일·장식·줍는 것·탄환은 한 번 만든 스프라이트를 매 프레임 위치·텍스처만 바꿔 다시 쓴다
    const pools = new Map();
    function pooled(c, i) {
      let a = pools.get(c);
      if (!a) pools.set(c, a = []);
      if (!a[i]) { a[i] = new PIXI.Sprite(); a[i].anchor.set(0.5); c.addChild(a[i]); }
      a[i].visible = true;
      return a[i];
    }
    function hideFrom(c, n) { const a = pools.get(c) || []; for (let i = n; i < a.length; i++) a[i].visible = false; }
    // 좌표 해시(위치마다 고정). Math.imul로 32비트 곱을 정확히 하고 한 번 섞어 아래 비트가 바둑판처럼 되지 않게 한다
    const mix = h => { h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39); return (h ^ (h >>> 15)) >>> 0; };
    const TILE = 16 * (ART ? ART.SCALE : 1.5), tileHash = (tx, ty) => mix(Math.imul(tx, 73856093) ^ Math.imul(ty, 19349663));

    const enemySprites = new Map(), siteSprites = new Map();
    let propSprites = [], playerSprite = null, playerArt = false, facing = 1, runId = null;
    const rings = [], nums = [], numPool = [], bolts = [], arcs = [];
    const J = content.rules.juice, SHARD_LIFE = J.shardLife, SHARD_COLORS = [0xffe680, 0xfff4d6, 0xf2cb4c];
    const shards = [], souls = [], hitT = new Map(); // hitT: uid → { flash, squash } 끝나는 시각(ms)
    let hitstopUntil = 0, shakeUntil = 0, hurtUntil = 0;

    // 큰 사건(정예·보스 처치, 합체): 잠깐 멈춤 + 화면 흔들림
    function kick(kind) {
      if (kind !== 'big') return;
      const now = performance.now();
      hitstopUntil = now + J.hitstop * 1000;
      shakeUntil = now + J.shakeTime * 1000;
    }

    function burst(x, y, n) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 80;
        const color = SHARD_COLORS[Math.floor(Math.random() * SHARD_COLORS.length)];
        shards.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, color });
      }
      if (shards.length > J.maxShards) shards.splice(0, shards.length - J.maxShards); // 오래된 것부터 지운다
    }

    function resetRun(state) {
      for (const s of enemySprites.values()) s.destroy();
      enemySprites.clear();
      for (const s of siteSprites.values()) s.destroy();
      siteSprites.clear();
      for (const s of propSprites) { for (const f of s.flanks || []) f.destroy(); s.destroy(); }
      propSprites = [];
      if (playerSprite) { playerSprite.destroy(); playerSprite = null; } // 판마다 영웅이 바뀔 수 있다
      rings.length = 0;
      bolts.length = 0; arcs.length = 0;
      shards.length = 0; souls.length = 0; hitT.clear();
      hitstopUntil = 0; shakeUntil = 0; hurtUntil = 0;
      for (const n of nums) { layer.numbers.removeChild(n.t); numPool.push(n.t); }
      nums.length = 0;
      runId = state.runId;
    }

    function numText() {
      const t = numPool.pop() || new PIXI.BitmapText({ text: '', style: { fontFamily: 'Arial', fontSize: 16, fill: 0xfff4d6 } });
      t.anchor.set(0.5);
      t.alpha = 1;
      layer.numbers.addChild(t);
      return t;
    }

    function draw(state, dt, stick) {
      const w = app.screen.width, h = app.screen.height, k = Math.min(w / VIEW_W, h / VIEW_H);
      document.documentElement.style.setProperty('--view-w', VIEW_W * k + 'px');
      cam.scale.set(k);
      if (!state) { frameG.clear(); stickG.clear(); cam.visible = false; return; }
      cam.visible = true;
      if (state.runId !== runId) resetRun(state);

      const p = state.player, now = performance.now();

      // 타격감 기록 읽기: 맞음 → 번쩍임·찌그러짐·파편, 처치 → 파편·혼(정예·보스는 큰 사건), 피격 → 붉은 가장자리
      for (const hit of state.fx.hits) {
        if (hit.uid != null) hitT.set(hit.uid, { flash: now + J.flash * 1000, squash: now + J.squash * 1000 });
        burst(hit.x, hit.y, J.shards);
      }
      for (const kl of state.fx.kills) {
        burst(kl.x, kl.y, J.killShards * (kl.boss ? 3 : 1)); // 파편은 노랑·흰색만(적 색은 붉을 수 있다 — 붉은색은 위험 예고 전용)
        souls.push({ x: kl.x, y: kl.y, age: 0 });
        if (kl.boss || kl.elite) kick('big');
      }
      if (state.fx.hurts.length) hurtUntil = now + J.hurtEdge * 1000;
      if (now < hitstopUntil) { // 히트스톱: 그림만 멈춘다(시뮬레이션은 main.js가 그대로 돌린다). 마지막 화면이 그대로 남는다
        state.fx.hits.length = 0; state.fx.kills.length = 0; state.fx.hurts.length = 0; // 고리·탄·호는 다음 그림에서 읽는다
        return;
      }
      frameG.clear(); stickG.clear();

      cam.x = w / 2 - p.x * k; cam.y = h / 2 - p.y * k;
      if (now < shakeUntil) { cam.x += (Math.random() * 2 - 1) * J.shake * k; cam.y += (Math.random() * 2 - 1) * J.shake * k; }
      const vx0 = p.x - VIEW_W / 2, vy0 = p.y - VIEW_H / 2;

      // 바닥: 챕터 타일 그림(w:tile:<챕터>)으로 덮는다. 변형은 좌표 해시로 고정. 그림이 없으면 80px 격자 + 소품
      groundG.clear();
      const ch = content.chapters[state.chapterId], tileId = 'w:tile:' + state.chapterId, tileArt = ART && ART.sprites[tileId];
      let nt = 0;
      if (tileArt) {
        const n = tileArt.frames.length;
        const tx0 = Math.floor((vx0 - TILE) / TILE), ty0 = Math.floor((vy0 - TILE) / TILE);
        const tx1 = Math.floor((vx0 + VIEW_W + TILE) / TILE), ty1 = Math.floor((vy0 + VIEW_H + TILE) / TILE);
        for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
          const t = pooled(tileC, nt++);
          t.texture = artTex(tileId, tileHash(tx, ty) % n);
          t.x = (tx + 0.5) * TILE; t.y = (ty + 0.5) * TILE; t.scale.set(ART.SCALE);
        }
      } else {
        const gx = Math.floor(vx0 / 80) * 80, gy = Math.floor(vy0 / 80) * 80;
        for (let x = gx; x <= vx0 + VIEW_W + 80; x += 80) groundG.moveTo(x, vy0 - 80).lineTo(x, vy0 + VIEW_H + 80);
        for (let y = gy; y <= vy0 + VIEW_H + 80; y += 80) groundG.moveTo(vx0 - 80, y).lineTo(vx0 + VIEW_W + 80, y);
        groundG.stroke({ width: 1, color: 0x2a2620 });
      }
      hideFrom(tileC, nt);
      (ch.props || []).forEach((pr, i) => {
        const sp = state.props[i], px = sp.x != null ? sp.x : pr.x, py = sp.y != null ? sp.y : pr.y;
        if (pr.kind === 'ring') {
          const on = sp.state === 'active';
          if (on) {
            groundG.circle(px, py, pr.r).stroke({ width: 3, color: 0xffe08a, alpha: 0.8 });
            if (sp.v) groundG.moveTo(px + pr.r + 8, py).arc(px, py, pr.r + 8, 0, Math.PI * 2 * sp.v).stroke({ width: 4, color: 0x9ef0c4 });
          }
          let m = propSprites[i]; // 결계 고리 표식(w:prop:ring): 활성일 때만 원 중심에 그린다
          const mt = !m && artTex('w:prop:' + pr.kind, 0);
          if (mt) { m = propSprites[i] = new PIXI.Sprite(mt); m.anchor.set(0.5); m.scale.set(ART.SCALE); layer.ground.addChild(m); }
          if (m) { m.visible = on; m.x = px; m.y = py; }
          return;
        }
        let s = propSprites[i];
        if (!s) {
          const pt = artTex('w:prop:' + pr.kind, 0); // 소품 그림이 있으면 그림, 없으면 한자 동그라미
          s = propSprites[i] = new PIXI.Sprite(pt || glyphTex('prop:' + pr.kind, pr.glyph || '?', 26, 0x8a6d4a));
          s.anchor.set(0.5); if (pt) s.scale.set(ART.SCALE); layer.ground.addChild(s);
          const ft = pr.flank && artTex('w:prop:' + pr.flank, 0); // 양옆 장식: 소품 좌우 28px, 살짝 아래(판정 없음)
          s.flanks = ft ? [-1, 1].map(side => {
            const f = new PIXI.Sprite(ft);
            f.anchor.set(0.5, 1); f.scale.set(ART.SCALE); f.side = side; layer.ground.addChild(f);
            return f;
          }) : [];
        }
        for (const f of s.flanks) { f.x = px + f.side * 28; f.y = py + s.texture.height * s.scale.y / 2 + 6; } // 흔들림(회전)에 따라 변하는 s.height 대신 그림 높이
        const active = state.props[i].state === 'active';
        s.x = px; s.y = py;
        s.tint = active ? 0xffe08a : 0xffffff;
        s.rotation = active ? Math.sin(now / 60) * 0.08 : 0;
        if (active) groundG.circle(px, py, 200).stroke({ width: 2, color: 0xffe08a, alpha: 0.35 });
      });

      for (const s of state.sites) {
        const look = ((content.events || {})[s.owner] || {}).site || {}, col = look.color || 0xcfc6b4, glyph = look.glyph || '?'; // 장소 그림은 사건 정의(site)에서
        groundG.circle(s.x, s.y, s.r).fill({ color: col, alpha: 0.12 }).stroke({ width: 3, color: col, alpha: 0.85 });
        if (s.v) groundG.moveTo(s.x + s.r + 8, s.y).arc(s.x, s.y, s.r + 8, 0, Math.PI * 2 * s.v).stroke({ width: 4, color: 0x9ef0c4 });
        let sp = siteSprites.get(s.id);
        if (!sp) { // 장소 그림(w:site:<사건ID>)이 있으면 그림, 없으면 한자 글자. 원과 진행 호는 규칙 표시라 그대로 둔다
          const st = artTex('w:site:' + s.owner, 0);
          sp = new PIXI.Sprite(st || glyphTex('site:' + s.kind, glyph, 22, col)); sp.anchor.set(0.5); if (st) sp.scale.set(ART.SCALE);
          layer.ground.addChild(sp); siteSprites.set(s.id, sp);
        }
        sp.x = s.x; sp.y = s.y;
      }
      for (const [id, sp] of siteSprites) if (!state.sites.some(s => s.id === id)) { sp.destroy(); siteSprites.delete(id); }

      // 아군 효과: 장판 · 투사체 · 구슬 · 지속 오라 · 링
      allyG.clear();
      const colorOf = id => (content.talismans[id] || {}).color || 0x9ad0ff;
      for (const z of state.zones) {
        if (z.kind === 'delayed') {
          allyG.circle(z.x, z.y, z.r).stroke({ width: 2, color: colorOf(z.owner), alpha: 0.9 });
          continue;
        }
        allyG.circle(z.x, z.y, z.r).fill({ color: colorOf(z.owner), alpha: z.kind === 'block' ? 0.28 : z.kind === 'mine' ? 0.6 : 0.2 });
      }
      // 탄환: 부적 종이(w:shot)를 이동 방향으로 돌리고 부적 색으로 tint. 반경이 큰 탄은 r/5배
      const shotTex = artTex('w:shot', 0);
      let ns = 0;
      for (const s of state.shots) {
        if (!shotTex) { allyG.circle(s.x, s.y, s.r).fill({ color: colorOf(s.owner), alpha: 0.85 }); continue; }
        const sp = pooled(shotC, ns++);
        sp.texture = shotTex; sp.tint = colorOf(s.owner);
        sp.x = s.x; sp.y = s.y; sp.rotation = Math.atan2(s.vy || 0, s.vx || 0) + Math.PI / 2;
        sp.scale.set(ART.SCALE * Math.max(1, s.r / 5));
      }
      hideFrom(shotC, ns);
      // 줍는 것: 엽전(w:coin) · 회복 복숭아(w:heal) · 구슬(w:gem)
      let ng = 0;
      for (const g of state.gems) {
        const gt = artTex(g.coin ? 'w:coin' : g.heal ? 'w:heal' : 'w:gem', 0);
        if (gt) { const sp = pooled(gemC, ng++); sp.texture = gt; sp.x = g.x; sp.y = g.y; sp.scale.set(ART.SCALE); continue; }
        if (g.coin) { allyG.rect(g.x - 5, g.y - 5, 10, 10).fill({ color: 0xffd36b }).stroke({ width: 1.5, color: 0x6b4a10 }); continue; }
        if (g.heal) allyG.circle(g.x, g.y, 9).fill({ color: 0xff8fb0, alpha: 0.95 }).stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
        else allyG.circle(g.x, g.y, 4.5).fill({ color: 0x9ef0c4, alpha: 0.95 });
      }
      hideFrom(gemC, ng);
      for (const sl of state.slots) {
        const t = content.talismans[sl.id];
        for (const st of BJ_BEHAVIORS.partsOf(content, sl, content.heroes[state.heroId].areaMul || 1).parts) { // 시뮬과 같은 값으로 그린다
          if (st.kind === 'aura' && st.r) allyG.circle(p.x, p.y, st.r).stroke({ width: 2, color: t.color, alpha: st.stillOnly && (p.stillT || 0) < content.rules.stillDelay ? 0.15 : 0.5 });
          if (st.kind === 'orbit') for (const o of BJ_BEHAVIORS.orbitPoints(state, st)) allyG.circle(o.x, o.y, st.r).fill({ color: t.color, alpha: 0.9 });
        }
      }
      for (const r of state.fx.rings) if (rings.length < MAX_RINGS) rings.push({ ...r, age: 0 });
      state.fx.rings.length = 0;
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        r.age += dt;
        if (r.age >= RING_LIFE) { rings.splice(i, 1); continue; }
        allyG.circle(r.x, r.y, r.r * (0.6 + 0.4 * r.age / RING_LIFE)).stroke({ width: 3, color: r.color, alpha: 1 - r.age / RING_LIFE });
      }
      for (const b of state.fx.bolts) if (bolts.length < 300) bolts.push({ ...b, age: 0 });
      state.fx.bolts.length = 0;
      for (let i = bolts.length - 1; i >= 0; i--) {
        const b = bolts[i];
        b.age += dt;
        if (b.age >= 0.15) { bolts.splice(i, 1); continue; }
        allyG.moveTo(b.x1, b.y1).lineTo(b.x2, b.y2).stroke({ width: 3, color: b.color, alpha: 1 - b.age / 0.15 });
      }
      for (const a of state.fx.arcs) if (arcs.length < 100) arcs.push({ ...a, age: 0 });
      state.fx.arcs.length = 0;
      for (let i = arcs.length - 1; i >= 0; i--) {
        const a = arcs[i];
        a.age += dt;
        if (a.age >= 0.2) { arcs.splice(i, 1); continue; }
        allyG.moveTo(a.x, a.y).arc(a.x, a.y, a.r, a.a0 - a.arc / 2, a.a0 + a.arc / 2).lineTo(a.x, a.y).fill({ color: a.color, alpha: 0.35 * (1 - a.age / 0.2) });
      }

      // 적
      const seen = new Set();
      shadowG.clear(); markG.clear();
      for (const e of state.enemies) {
        let s = enemySprites.get(e.uid);
        const d = content.enemies[e.id], artId = 'e:' + e.id, art = ART && ART.sprites[artId];
        const gKey = 'e:' + e.id + (e.elite ? ':elite' : ''), gR = ENT.radius(content, e) * content.rules.view.spriteScale, gCol = e.elite ? 0xffd166 : d.color;
        if (!s) {
          s = new PIXI.Sprite(art ? artTex(artId, 0) : glyphTex(gKey, d.glyph, gR, gCol));
          s.anchor.set(0.5);
          s.lastX = e.x; s.lastY = e.y; s.facing = 1;
          layer.enemies.addChild(s);
          enemySprites.set(e.uid, s);
        }
        s.x = e.x; s.y = e.y;
        const ht = hitT.get(e.uid), flash = ht && now < ht.flash;
        let sx = 1, sy = 1;
        if (art) { // 걷기·흔들림·좌우는 플레이어와 같다. float 그림은 둥실 떠다닌다
          const moved = e.x !== s.lastX || e.y !== s.lastY, fr = moved ? Math.floor(now / 200) % 2 : 0;
          s.texture = artTex(artId, fr, flash);
          if (fr === 1) s.y -= ART.SCALE;
          if (art.float) s.y += Math.sin(now / 300 + e.uid) * ART.SCALE;
          if (e.x < s.lastX) s.facing = -1; else if (e.x > s.lastX) s.facing = 1;
          s.tint = e.elite && !flash ? 0xffe08a : 0xffffff;
          sx = s.facing * ART.SCALE; sy = ART.SCALE;
        } else s.texture = glyphTex(flash ? gKey + '!' : gKey, d.glyph, gR, flash ? 0xffffff : gCol); // 한자 동그라미는 흰 판으로 번쩍인다
        if (ht) {
          if (now < ht.squash) { sy *= 0.8; sx *= 1.15; } else if (now < ht.squash + 50) sy *= 1.08; else hitT.delete(e.uid);
        }
        s.scale.set(sx, sy);
        s.lastX = e.x; s.lastY = e.y;
        if (d.aura) shadowG.circle(e.x, e.y, d.aura.r).stroke({ width: 2, color: d.aura.color || 0xc8f0d0, alpha: 0.25 }); // 치유 범위: 흐린 녹빛 원(붉은색은 위험 예고 전용)
        if (d.tell === 'shadow') shadowG.ellipse(e.x, e.y + ENT.radius(content, e) * 0.7, ENT.radius(content, e) * 2.1, ENT.radius(content, e) * 1.15).fill({ color: 0xd62839, alpha: 0.9 }).stroke({ width: 2, color: 0xff8a8a, alpha: 0.9 }); // 본체 표시: 몸 밖으로 크게 드러나는 붉은 그림자
        if (e.markT > 0) { // 노출 표식: 안개 위에 금빛 이중 원(붉은색은 위험 예고 전용)
          const mr = ENT.radius(content, e) * content.rules.view.spriteScale + 6;
          markG.circle(e.x, e.y, mr).stroke({ width: 3, color: 0xffe08a, alpha: 0.95 }).circle(e.x, e.y, mr + 7).stroke({ width: 1.5, color: 0xffe08a, alpha: 0.5 });
        }
        seen.add(e.uid);
      }
      for (const [uid, s] of enemySprites) if (!seen.has(uid)) { s.destroy(); enemySprites.delete(uid); hitT.delete(uid); }
      for (const uid of hitT.keys()) if (!seen.has(uid)) hitT.delete(uid);

      // 파편(2×2 논리 도트, 중력) + 혼(흰 원이 위로 오르며 사라짐)
      juiceG.clear();
      const ds = ART ? ART.SCALE * 2 : 3;
      for (let i = shards.length - 1; i >= 0; i--) {
        const sh = shards[i];
        sh.age += dt;
        if (sh.age >= SHARD_LIFE) { shards.splice(i, 1); continue; }
        sh.vy += 400 * dt; sh.x += sh.vx * dt; sh.y += sh.vy * dt;
        const sa = 1 - sh.age / SHARD_LIFE, sx = Math.round(sh.x - ds / 2), sy = Math.round(sh.y - ds / 2);
        juiceG.rect(sx - 1, sy - 1, ds + 2, ds + 2).fill({ color: 0x1a1420, alpha: sa }); // 1px 어두운 테두리: 어두운 바닥에서도 보이게
        juiceG.rect(sx, sy, ds, ds).fill({ color: sh.color, alpha: sa });
      }
      for (let i = souls.length - 1; i >= 0; i--) {
        const so = souls[i];
        so.age += dt;
        if (so.age >= J.soul) { souls.splice(i, 1); continue; }
        const t = so.age / J.soul;
        juiceG.circle(so.x, so.y - 30 * t, 6 + 8 * t).fill({ color: 0xffffff, alpha: 0.5 * (1 - t) });
      }

      // 안개: 시야가 화면보다 작을 때만, 시야 밖을 덮고 가장자리를 두 겹으로 부드럽게 한다
      fogG.clear();
      const vr = ENT.visionRadius(content, state);
      if (vr < VIEW_H) {
        fogG.rect(vx0 - 100, vy0 - 100, VIEW_W + 200, VIEW_H + 200).fill({ color: 0x0b0d0c, alpha: 0.88 }).circle(p.x, p.y, vr).cut();
        fogG.circle(p.x, p.y, vr).stroke({ width: 40, color: 0x0b0d0c, alpha: 0.45 });
      }

      // 플레이어 + 피격 범위
      const heroArt = 'h:' + state.heroId;
      if (!playerSprite) {
        const tex = artTex(heroArt, 0);
        playerArt = !!tex; facing = 1;
        playerSprite = new PIXI.Sprite(tex || glyphTex('player', '巫', 16 * content.rules.view.spriteScale, 0xe9e1d2));
        playerSprite.anchor.set(0.5); layer.player.addChild(playerSprite);
      }
      playerSprite.x = p.x; playerSprite.y = p.y;
      if (playerArt) { // 걷기 2프레임(2프레임에서 살짝 뜀), 좌우는 가로 방향이 분명할 때만 바꾼다
        const fr = dt > 0 && !state.choice && !state.over && p.moved > 0.01 ? Math.floor(now / 200) % 2 : 0; // 멈춤·선택 창에서는 시뮬레이션이 안 가니 서 있는다
        playerSprite.texture = artTex(heroArt, fr);
        if (fr === 1) playerSprite.y -= ART.SCALE;
        if (p.dirX < -0.1) facing = -1; else if (p.dirX > 0.1) facing = 1;
        playerSprite.scale.set(facing * ART.SCALE, ART.SCALE);
      }
      playerSprite.alpha = p.invuln > 0 && Math.floor(now / 80) % 2 ? 0.4 : 1;
      playerG.clear().circle(p.x, p.y, content.rules.player.r).stroke({ width: 1.5, color: 0xffffff, alpha: 0.6 });

      // 위험 예고: 돌진 경고선, 보스 체력, 화면 밖 위협 표식
      warnG.clear();
      for (const e of state.enemies) {
        const d = content.enemies[e.id], er = ENT.radius(content, e);
        if (e.ph === 'warn' && e.len) {
          const x2 = e.x + e.dx * e.len, y2 = e.y + e.dy * e.len;
          warnG.moveTo(e.x, e.y).lineTo(x2, y2).stroke({ width: er * 2, color: 0xff3b30, alpha: 0.16 });
          warnG.moveTo(e.x, e.y).lineTo(x2, y2).stroke({ width: 2, color: 0xff6b5e, alpha: 0.9 });
        }
        if (e.ph === 'warn' && e.wr) {
          warnG.circle(e.wx, e.wy, e.wr).fill({ color: 0xff3b30, alpha: 0.14 }).stroke({ width: 2, color: 0xff6b5e, alpha: 0.9 });
        }
        if (e.ph === 'aim') warnG.moveTo(e.x, e.y).lineTo(e.x + e.ax * 70, e.y + e.ay * 70).stroke({ width: 3, color: 0xff6b5e, alpha: 0.9 });
        if (d.boss) {
          warnG.rect(e.x - 30, e.y - er - 12, 60, 5).fill({ color: 0x000000, alpha: 0.6 });
          warnG.rect(e.x - 30, e.y - er - 12, 60 * Math.max(0, e.hp / e.maxHp), 5).fill({ color: 0xff5a4a });
        }
        const off = e.x < vx0 || e.x > vx0 + VIEW_W || e.y < vy0 || e.y > vy0 + VIEW_H;
        if (off && (d.boss || e.ph === 'warn')) {
          const mx = Math.min(Math.max(e.x, vx0 + 18), vx0 + VIEW_W - 18), my = Math.min(Math.max(e.y, vy0 + 18), vy0 + VIEW_H - 18);
          const a = Math.atan2(e.y - my, e.x - mx);
          warnG.poly([mx + Math.cos(a) * 14, my + Math.sin(a) * 14, mx + Math.cos(a + 2.4) * 10, my + Math.sin(a + 2.4) * 10, mx + Math.cos(a - 2.4) * 10, my + Math.sin(a - 2.4) * 10]).fill({ color: 0xff3b30, alpha: 0.9 });
        }
      }
      for (const q of state.eshots) warnG.circle(q.x, q.y, q.r).fill({ color: 0xff3b30, alpha: 0.95 }).stroke({ width: 2, color: 0xffd0c8, alpha: 0.9 });

      // 피해 숫자(최대 60개)
      for (const hit of state.fx.hits) {
        if (nums.length >= MAX_NUMS) break;
        const t = numText();
        t.text = String(hit.dmg); t.x = hit.x; t.y = hit.y - 12;
        nums.push({ t, age: 0 });
      }
      for (let i = nums.length - 1; i >= 0; i--) {
        const n = nums[i];
        n.age += dt; n.t.y -= 30 * dt; n.t.alpha = 1 - n.age / NUM_LIFE;
        if (n.age >= NUM_LIFE) { layer.numbers.removeChild(n.t); numPool.push(n.t); nums.splice(i, 1); }
      }

      // 논리 영역 밖은 가린다 — 넓은 화면이 시야 이득을 얻지 않게(스펙 2절)
      const lw = VIEW_W * k, lh = VIEW_H * k, lx = (w - lw) / 2, ly = (h - lh) / 2;
      if (lx > 0) frameG.rect(0, 0, lx, h).rect(lx + lw, 0, w - lx - lw, h).fill({ color: 0x0d0c0a });
      if (ly > 0) frameG.rect(0, 0, w, ly).rect(0, ly + lh, w, h - ly - lh).fill({ color: 0x0d0c0a });
      if (now < hurtUntil) { // 피격 가장자리: 논리 화면 테두리 안쪽 24px를 붉게(위험 색)
        const e = 24 * k, a = 0.35 * (hurtUntil - now) / (J.hurtEdge * 1000);
        frameG.rect(lx, ly, lw, e).rect(lx, ly + lh - e, lw, e).rect(lx, ly + e, e, lh - 2 * e).rect(lx + lw - e, ly + e, e, lh - 2 * e).fill({ color: 0xff3b30, alpha: a });
      }

      if (stick && stick.active) {
        stickG.circle(stick.ox, stick.oy, 60).stroke({ width: 2, color: 0xffffff, alpha: 0.35 });
        stickG.circle(stick.x, stick.y, 22).fill({ color: 0xffffff, alpha: 0.35 });
      }
      state.fx.hits.length = 0; state.fx.kills.length = 0; state.fx.hurts.length = 0;
    }

    return { app, draw, kick };
  }

  return { create };
})();
if (typeof module !== 'undefined') module.exports = BJ_RENDER;
