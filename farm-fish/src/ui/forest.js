  // ---------- 숲: forage spots, forage art, the 도전 gauge (채집 + 수확), 도감 채집, 달력 entries ----------
  // spots: [centre x, ground y]; what grows is rolled when the 숲 is on screen (logic/forest.js)
  var FSPOTS = [[26, 98], [68, 88], [112, 102], [152, 92], [36, 148], [90, 160], [142, 146]];
  function forestShown() { return L.forestOk(S) || S.rep >= L.FOREST_REP; }
  function forestAttention() { return L.forestOk(S) && (L.forageReady(S) > 0 || L.forestNextAt(S) <= now()); }
  // the forage env: curEnv (FF overrides apply) + wet = raining or the block right after rain
  function fEnv(t) { var e = curEnv(t); e.wet = e.weather === 'rain' || (!wxOverride && L.rainJustStopped(t, TZ)); return e; }

  // ---------- pre-rendered forest floor and trees ----------
  var bgForest = document.createElement('canvas'); bgForest.width = W; bgForest.height = H;
  var PINES = [];   // tree tops, for snow caps
  function pine(cx, by, h, c) {
    PINES.push([cx, by - 4 - h]);
    px(cx, by - 4, 2, 4, 4);
    for (var j = 0; j < h; j++) {
      var hw = Math.floor((j % Math.ceil(h / 3)) * 0.8 + Math.floor(j / Math.ceil(h / 3)) * 2) + 1;
      px(cx + 1 - hw, by - 4 - h + j, hw * 2, 1, c);
    }
  }
  (function paintForest() {
    var saved = ctx; ctx = bgForest.getContext('2d');
    for (var k = 0; k < 320; k++) {
      var x = Math.floor(hash(k * 7 + 3) * W), y = 60 + Math.floor(hash(k * 11 + 9) * (H - 60));
      px(x, y, 1, 1, k % 5 ? 1 : 2);
    }
    // a winding path from the bottom up into the trees
    for (var y2 = 196; y2 > 60; y2--) {
      var cx = 90 + Math.round(Math.sin(y2 / 22) * 18);
      if (y2 % 3) { px(cx - 7, y2, 1, 1, 2); px(cx + 7, y2, 1, 1, 2); }
      if (y2 % 7 === 0) px(cx - 2 + (y2 % 5), y2, 2, 1, 1);
    }
    // back row of pines, then a front row a little lower
    for (var t = 0; t < 12; t++) pine(4 + t * 16 + Math.round(hash(t * 3) * 6), 52 + Math.round(hash(t * 5 + 1) * 6), 26 + Math.round(hash(t) * 10), 3);
    for (t = 0; t < 7; t++) pine(10 + t * 27 + Math.round(hash(t * 9 + 4) * 8), 70 + Math.round(hash(t * 13 + 2) * 6), 30 + Math.round(hash(t * 7) * 10), 4);
    // stones and a fallen log
    [[8, 182], [168, 176], [120, 186]].forEach(function (r) { px(r[0], r[1], 7, 3, 2); px(r[0] + 1, r[1] - 1, 5, 1, 2); px(r[0], r[1] + 3, 7, 1, 3); });
    px(150, 118, 26, 5, 3); px(150, 118, 26, 1, 4); px(150, 122, 26, 1, 4); px(174, 118, 2, 5, 4); px(175, 119, 1, 3, 2);
    ctx = saved;
  })();

  // ---------- forage art: drawn at (x = centre, y = ground) ----------
  var FG_ID = {
    acorn: function (x, y) { px(x - 2, y - 6, 5, 2, 4); px(x, y - 7, 1, 1, 4); px(x - 2, y - 4, 5, 3, 3); px(x - 1, y - 1, 3, 1, 3); px(x - 1, y - 4, 1, 1, 1); },
    chestnut: function (x, y) { px(x - 2, y - 6, 5, 1, 4); px(x - 3, y - 5, 7, 4, 4); px(x - 2, y - 1, 5, 1, 2); px(x - 1, y - 4, 1, 1, 1); },
    pinecone: function (x, y) { for (var j = 0; j < 6; j++) { var w = j < 2 ? 3 + j * 2 : 7 - (j - 2); px(x - Math.floor(w / 2), y - 7 + j, w, 1, j % 2 ? 4 : 3); } px(x, y - 8, 1, 1, 4); },
    pebble: function (x, y) { px(x - 2, y - 4, 4, 1, 2); px(x - 3, y - 3, 6, 3, 2); px(x - 3, y, 6, 1, 3); px(x - 1, y - 3, 1, 1, 1); },
    birdfeather: function (x, y) { for (var k = 0; k < 7; k++) { px(x - 3 + k, y - 1 - k, 1, 1, 4); if (k > 0 && k < 6) px(x - 4 + k, y - 1 - k, 1, 1, 2), px(x - 3 + k, y - k, 1, 1, 2); } },
    mapleleaf: function (x, y) { px(x, y - 8, 1, 7, 4); px(x - 3, y - 6, 7, 2, 3); px(x - 2, y - 7, 5, 4, 3); px(x - 4, y - 5, 1, 1, 3); px(x + 4, y - 5, 1, 1, 3); px(x, y - 9, 1, 1, 3); },
    icicle: function (x, y) { for (var j = 0; j < 7; j++) { var w = Math.max(1, 5 - j); px(x - Math.floor(w / 2), y - 8 + j, w, 1, 1); px(x - Math.floor(w / 2), y - 8 + j, 1, 1, 3); } },
    glowmoss: function (x, y, tt) { px(x - 4, y - 2, 9, 2, 3); px(x - 3, y - 3, 7, 1, 3); for (var k = 0; k < 3; k++) if ((Math.floor(tt * 2) + k) % 3) px(x - 3 + k * 3, y - 3 - (k % 2), 1, 1, 0); },
    clover4: function (x, y) { px(x, y - 4, 1, 4, 3); [[-2, -7], [1, -7], [-2, -10], [1, -10]].forEach(function (o) { px(x + o[0], y + o[1], 2, 2, 3); px(x + o[0], y + o[1], 1, 1, 4); }); px(x - 3, y - 2, 2, 1, 2); px(x + 2, y - 2, 2, 1, 2); },
    ginseng: function (x, y) { px(x, y - 11, 1, 5, 4); px(x - 3, y - 11, 2, 2, 3); px(x + 2, y - 11, 2, 2, 3); px(x - 1, y - 13, 3, 2, 4); px(x - 1, y - 6, 3, 3, 2); px(x - 2, y - 3, 1, 3, 2); px(x + 2, y - 3, 1, 3, 2); px(x - 1, y - 6, 1, 3, 4); },
    songi: function (x, y) { px(x - 1, y - 8, 3, 8, 0); px(x - 2, y - 8, 1, 8, 4); px(x + 2, y - 8, 1, 8, 4); px(x - 2, y - 1, 5, 1, 4); px(x - 3, y - 10, 7, 2, 4); px(x - 2, y - 11, 5, 1, 4); px(x - 1, y - 9, 1, 1, 2); },
    reishi: function (x, y) { px(x - 1, y - 3, 2, 3, 4); px(x - 5, y - 7, 9, 4, 4); px(x - 4, y - 8, 7, 1, 4); px(x - 4, y - 6, 7, 1, 3); px(x - 3, y - 5, 5, 1, 2); },
    woodear: function (x, y) { px(x - 5, y - 1, 11, 1, 3); px(x - 4, y - 5, 4, 4, 4); px(x + 1, y - 6, 4, 5, 4); px(x - 3, y - 4, 2, 2, 3); px(x + 2, y - 5, 2, 3, 3); },
    amberstone: function (x, y) { px(x - 2, y - 6, 5, 1, 4); px(x - 3, y - 5, 7, 4, 4); px(x - 2, y - 1, 5, 1, 4); px(x - 2, y - 5, 4, 3, 2); px(x - 1, y - 4, 1, 1, 0); }
  };
  var FG_CAT = {
    mush: function (x, y, v) {
      px(x - 2, y - 5, 1, 5, 4); px(x + 2, y - 5, 1, 5, 4); px(x - 1, y - 5, 3, 5, 0); px(x - 2, y - 1, 5, 1, 4);
      var big = v % 3 === 0;
      px(x - 4, y - 7, 9, 2, 4); px(x - 3, y - 9, 7, 2, 4); px(x - 2, y - 10, 5, 1, 4);
      if (big) { px(x - 5, y - 6, 11, 1, 4); }
      if (v % 2) { px(x - 2, y - 8, 1, 1, 1); px(x + 1, y - 9, 1, 1, 1); px(x + 2, y - 7, 1, 1, 1); }
      else px(x - 3, y - 7, 7, 1, 3);
    },
    green: function (x, y, v) {
      px(x, y - 9, 1, 9, 4); px(x - 1, y - 10, 2, 1, 4);
      for (var k = 0; k < 4; k++) { var w = 4 - k, yy = y - 2 - k * 2; px(x - w, yy, w, 1, v % 2 ? 3 : 2); px(x + 1, yy - 1, w, 1, 3); }
    },
    nut: function (x, y, v) {
      px(x, y - 9, 1, 2, 3);
      [[-3, 0], [2, 0], [0, -3]].forEach(function (o) { var bx = x + o[0], by = y + o[1]; px(bx - 1, by - 3, 3, 3, 4); px(bx, by - 4, 1, 1, 4); px(bx - 1, by - 3, 1, 1, v % 2 ? 2 : 1); });
    },
    herb: function (x, y, v) {
      px(x, y - 10, 1, 6, 4); px(x - 3, y - 9, 2, 3, 3); px(x + 2, y - 9, 2, 3, 3);
      px(x - 1, y - 4, 3, 4, 2); px(x - 1, y - 4, 1, 4, 4); px(x - 2, y, 1, 1, 2); px(x + 2, y, 1, 1, v % 2 ? 2 : 3);
    },
    flower: function (x, y, v) {
      px(x, y - 6, 1, 6, 3); px(x + 1, y - 3, 2, 1, 3);
      var c = v % 2 ? 2 : 1;
      px(x - 2, y - 9, 5, 1, c); px(x, y - 11, 1, 5, c); px(x - 1, y - 10, 3, 3, c); px(x, y - 9, 1, 1, 4);
      px(x - 3, y - 9, 1, 1, 4); px(x + 3, y - 9, 1, 1, 4); px(x, y - 12, 1, 1, 4);
    },
    misc: function (x, y, v) { px(x - 3, y - 4, 6, 4, 3); px(x - 2, y - 5, 4, 1, 3); px(x - 1, y - 3, 1, 1, v % 2 ? 1 : 0); },
    rare: function (x, y) { FG_ID.amberstone(x, y); }
  };
  function drawForage(id, x, y, tt) {
    var f = L.forageById(id);
    if (!f) return;
    if (FG_ID[id]) FG_ID[id](x, y, tt || 0);
    else { var h = 0; for (var k = 0; k < id.length; k++) h = (h * 31 + id.charCodeAt(k)) | 0; FG_CAT[f.cat](x, y, Math.floor(hash(h) * 6)); }
  }
  function forageIcon(id) {
    var c = document.createElement('canvas'); c.width = 14; c.height = 14;
    var saved = ctx; ctx = c.getContext('2d');
    try { drawForage(id, 7, 13, 0); } finally { ctx = saved; }
    return c;
  }

  // ---------- 숲 scene ----------
  function drawForest(tt, dt) {
    var t = now(), e = fEnv(t), night = e.phase === 'night';
    ctx.drawImage(bgForest, 0, 0);
    drawSky(tt, e.phase);
    drawForestSeason(tt, e.season);
    if (!L.forestOk(S)) { drawForestGate(tt); }
    else FSPOTS.forEach(function (sp, k) {
      var p = S.forest.spots[k];
      px(sp[0] - 6, sp[1] + 1, 13, 1, 2);
      if (p.id) {
        var f = L.forageById(p.id), bob = chal && chal.kind === 'forage' && chal.k === k ? Math.round(Math.sin(tt * 30)) : 0;
        drawForage(p.id, sp[0] + bob, sp[1], tt);
        if (f.rarity === '희귀' || f.rarity === '전설') sparkle(sp[0] + 6, sp[1] - 10, tt + k * 0.4);
      } else { px(sp[0] - 1, sp[1] - 1, 1, 1, 2); px(sp[0] + 1, sp[1] - 2, 1, 2, 2); }
    });
    drawPet(tt, dt, 'forest');
    drawYardWeather(tt, e.weather);
    if (night || e.phase === 'evening') { ctx.globalAlpha = night ? 0.36 : 0.14; px(0, 0, W, H, 4); ctx.globalAlpha = 1; }
    if (night) {
      drawStars(tt);
      if (S.forest) FSPOTS.forEach(function (sp, k) { if (S.forest.spots[k].id === 'glowmoss') FG_ID.glowmoss(sp[0], sp[1], tt); });
      if (e.season === 'summer') for (var k = 0; k < 6; k++) if ((Math.floor(tt * 2) + k) % 4) px((hash(k * 5) * W + Math.sin(tt * 0.7 + k) * 8) % W, 70 + hash(k * 9) * 100 + Math.cos(tt + k) * 5, 1, 1, 0);
    }
  }
  // blossoms in spring, leaves in autumn, snow caps in winter (fixed positions, no randomness per frame)
  function drawForestSeason(tt, se) {
    var k;
    if (se === 'winter') { PINES.forEach(function (p) { px(p[0], p[1], 2, 1, 0); px(p[0] - 1, p[1] + 1, 4, 1, 0); px(p[0] - 3, p[1] + 9, 3, 1, 0); px(p[0] + 3, p[1] + 13, 3, 1, 0); }); for (k = 0; k < 60; k++) px(Math.floor(hash(k * 17 + 5) * W), 76 + Math.floor(hash(k * 23 + 1) * 120), 3, 1, 1); }
    else if (se === 'autumn') for (k = 0; k < 40; k++) px(Math.floor(hash(k * 19 + 2) * W), 64 + Math.floor(hash(k * 29 + 3) * 132), 2, 1, k % 3 ? 3 : 2);
    else if (se === 'spring') for (k = 0; k < 26; k++) { var bx = Math.floor(hash(k * 13 + 7) * W), by = 70 + Math.floor(hash(k * 31 + 1) * 126); px(bx, by, 1, 1, 0); px(bx - 1, by, 1, 1, 2); px(bx + 1, by, 1, 1, 2); }
    else for (k = 0; k < 30; k++) { var gx = Math.floor(hash(k * 37 + 11) * W), gy = 74 + Math.floor(hash(k * 41 + 5) * 120); px(gx, gy - 2, 1, 3, 3); px(gx + 2, gy - 1, 1, 2, 3); }
  }
  var GATE = { x: 76, y: 112, w: 28, h: 26 };
  function drawForestGate(tt) {
    for (var x = 0; x < W; x += 6) { px(x, 128 + (x % 12 ? 1 : 0), 4, 1, 4); }
    px(GATE.x + 13, GATE.y + 8, 2, 18, 4);
    px(GATE.x, GATE.y, GATE.w, 10, 4); px(GATE.x + 1, GATE.y + 1, GATE.w - 2, 8, 0);
    for (var k = 0; k < 4; k++) px(GATE.x + 4 + k * 5, GATE.y + 4, 3, 2, 3);
    sparkle(GATE.x + GATE.w + 3, GATE.y - 1, tt);
  }
  function tapForest(x, y) {
    if (!L.forestOk(S)) {
      if (hit([GATE.x - 6, GATE.y - 6, GATE.w + 12, GATE.h + 12], x, y)) {
        if (L.forestStatus(S) === 'coins') { toast('숲 길 열기 · ' + L.FOREST_COST + '코인 필요해요', 2400); return; }
        confirmBuy('forest', '숲 길 열기', L.FOREST_COST, function () {
          var r = L.unlockForest(S, now());
          if (!r.ok) { toast(WHY[r.why] || '열 수 없어요'); return; }
          burst(GATE.x + 14, GATE.y + 6, 16, 0, 70);
          toast('★ 숲이 열렸다 · 철마다 다른 것이 돋는다 · 꾹 누르면 도전', 3600); refresh();
        });
      } else toast('숲으로 가는 길이 막혀 있다 · 표지판을 눌러 보자', 2200);
      return;
    }
    // a ripe spot wins over the pet (it likes to sit on them); an empty spot lets the pet be petted
    var empty = null;
    for (var k = 0; k < FSPOTS.length; k++) {
      var sp = FSPOTS[k];
      if (!hit([sp[0] - 8, sp[1] - 13, 16, 16], x, y, 2)) continue;
      var p = S.forest.spots[k];
      if (!p.id) { empty = empty || p; continue; }
      chal = { kind: 'forage', k: k, x: sp[0], y: sp[1] - 12, g: L.forageGame(p.id, performance.now(), Math.random), hinted: false };
      return;
    }
    if (tapPet(x, y)) return;
    if (empty) { toast('다시 돋는 중 · ' + fmtLeft(Math.max(0, empty.at - now())), 1600); return; }
    var ready = L.forageReady(S);
    toast(ready ? '반짝이는 걸 누르면 줍기 · 꾹 누르면 도전 (표시 칸에서 떼면 두 배)' : '다 주웠다 · ' + fmtLeft(Math.max(0, L.forestNextAt(S) - now())) + ' 뒤 다시 돋는다', 2600);
  }

  // ---------- 도전 gauge: press = start, release = judge (logic/challenge.js) ----------
  var chal = null, chHintN = 0;
  function holdHarvest(i, r) {
    chal = { kind: 'harvest', i: i, r: r, x: r.x + 22, y: r.y + 2, g: L.harvestGame(S.plots[i].crop, performance.now(), Math.random), hinted: false };
  }
  function chRelease() {
    if (!chal) return;
    chFinish(L.chJudge(chal.g, performance.now()));
  }
  function chFinish(res) {
    var c = chal; chal = null;
    var won = res === 'win';
    if (c.kind === 'harvest') { doHarvest(c.i, c.r, won, res === 'miss'); return; }
    var r = L.pickForage(S, c.k, now(), Math.random, won);
    if (!r) return;
    var f = L.forageById(r.id);
    burst(c.x, c.y + 6, won ? 16 : 8, won ? 4 : 2, won ? 70 : 40);
    floatText((won ? '★' : '+') + f.name + (r.n > 1 ? '×' + r.n : ''), c.x, c.y - 6);
    var tail = r.sold ? ' · 바구니가 꽉 차 바로 팔았다 +' + r.sold : ' · 바구니에';
    if (won) toast('도전 성공! ' + f.name + (r.n > 1 ? ' 두 개' : ' 하나 · 이번엔 덤이 없었다') + tail, 2600);
    else toast((res === 'miss' ? '아깝다 · ' : '') + f.name + (f.rarity !== '흔함' ? ' (' + f.rarity + ')' : '') + tail, 2200);
    refresh();
  }
  function drawChallenge() {
    if (!chal) return;
    var t = performance.now(), g = chal.g;
    if (t < g.t0) return;                         // a quick tap never shows the gauge
    if (!chal.hinted) { chal.hinted = true; if (chHintN++ < 3) toast(chal.kind === 'harvest' ? '도전 · 표시 칸에서 떼면 특상품 (값 두 배)' : '도전 · 표시 칸에서 떼면 두 배', 1800); }
    // above the thing being picked, or below it when that would run into the top corner buttons
    var bw = 62, bh = 9, by = chal.y - 16 >= 20 ? Math.round(chal.y - 16) : Math.round(chal.y + 28);
    var bx = Math.max(by < 36 ? 18 : 2, Math.min(W - bw - 2, Math.round(chal.x - bw / 2)));
    px(bx - 1, by - 1, bw + 2, bh + 2, 0);
    px(bx, by, bw, bh, 4); px(bx + 1, by + 1, bw - 2, bh - 2, 0);
    var zl = bx + 1 + Math.round(g.lo * (bw - 3)), zr = bx + 1 + Math.round(g.hi * (bw - 3));
    for (var x = zl; x <= zr; x++) px(x, by + 1, 1, bh - 2, (x - zl) % 2 ? 2 : 1);
    px(zl, by + 1, 1, bh - 2, 4); px(zr, by + 1, 1, bh - 2, 4);
    var p = L.chPos(g, t), nx = bx + 1 + Math.round(p * (bw - 3));
    px(nx - 1, by - 3, 3, 2, 4); px(nx, by - 1, 1, bh + 2, 4);
    // time left: a thin bar under the gauge
    var left = Math.max(0, 1 - (t - g.t0) / (g.end - g.t0));
    px(bx, by + bh + 1, Math.round(bw * left), 1, 3);
  }

  // ---------- tick: spots grow while the 숲 is on screen, pet finds, gauge timeout ----------
  var petFindAt = 0;
  function tickForestUI(t) {
    if (chal && L.chOver(chal.g, performance.now())) chFinish('miss');
    if (chal && chal.kind === 'forage' && view !== 'forest') chal = null;
    if (view !== 'forest' || !L.forestOk(S)) return;
    var e = fEnv(t);
    if (L.tickForest(S, t, e, Math.random)) save();
    if (S.pet && performance.now() > petFindAt) {
      petFindAt = performance.now() + 20e3 + Math.random() * 20e3;
      var f = L.petFind(S, t, TZ, e, Math.random);
      if (f) {
        var pp = petSeen();
        if (pp) burst(pp.x, pp.y - 6, 8, 2, 40);
        toast(josa(S.pet.name, '이', '가') + ' 킁킁… ' + josa(L.forageById(f.id).name, '을', '를') + ' 찾아 왔다' + (f.sold ? ' · 바로 팔았다 +' + f.sold : ''), 2600);
        refresh();
      }
    }
  }

  // ---------- 도감 채집 section and 달력 "지금만" entries ----------
  function forageCond(f) {
    var out = [];
    if (f.season) out.push(f.season.map(function (x) { return L.SEASON_NAME[x]; }).join('·'));
    if (f.phase) out.push(f.phase.map(function (x) { return L.PHASE_NAME[x]; }).join('·') + '에만');
    if (f.wet) out.push('비 올 때');
    return out.length ? out.join(' · ') : '언제나';
  }
  function renderForageDex(row) {
    var h3 = document.createElement('h3'); h3.textContent = '채집';
    var b = document.createElement('b'); b.textContent = L.forageDexCount(S) + ' / ' + L.FORAGE.length; h3.appendChild(b);
    dexEl.appendChild(h3);
    if (!L.forestOk(S)) { var p = document.createElement('p'); p.className = 'note'; p.textContent = '신뢰도 ★' + L.FOREST_REP + '이 되면 마당 너머 숲으로 가는 길이 보여요'; dexEl.appendChild(p); }
    L.FORAGE.forEach(function (f) {
      var n = S.forest ? S.forest.dex[f.id] || 0 : 0;
      row(forageIcon(f.id), n ? (f.rarity === '전설' || f.rarity === '희귀' ? '★ ' : '') + f.name : '???',
        n ? L.FORAGE_CATS[f.cat] + ' · ' + f.rarity + ' · ' + forageCond(f) + ' · ' + f.price + '코인' : f.hint, n ? n + '개' : '', !n);
    });
  }
  function renderForestNow(e) {
    e = fEnv(now());
    var list = L.FORAGE.filter(function (f) { return L.forageWeight(f, e) > 0 && (f.phase || f.wet || (f.season && f.rarity !== '흔함')); });
    if (!list.length) return;
    var h3 = document.createElement('h3'); h3.textContent = '숲에서 지금';
    var hb = document.createElement('b'); hb.textContent = L.forestOk(S) ? '돋아 있는 곳 ' + L.forageReady(S) : '숲 잠김'; h3.appendChild(hb);
    calEl.appendChild(h3);
    list.forEach(function (f) {
      var got = S.forest && S.forest.dex[f.id];
      var r = document.createElement('div'); r.className = 'dx' + (got ? '' : ' unk');
      var ic = forageIcon(f.id); ic.className = 'sq'; if (!got) ic.style.opacity = '0.5';
      var n = document.createElement('div'); n.className = 'n'; n.textContent = got ? f.name : '???';
      var s3 = document.createElement('small'); s3.textContent = got ? f.rarity + ' · ' + forageCond(f) : f.hint; n.appendChild(s3);
      var v = document.createElement('div'); v.className = 'v'; v.textContent = f.rarity;
      r.appendChild(ic); r.appendChild(n); r.appendChild(v); calEl.appendChild(r);
    });
    if (e.wet) note('비 온 뒤 · 숲에 버섯이 세 배');
  }

  // ---------- console hooks ----------
  function addForestHooks(FF) {
    FF.forest = function () { if (!S.forest) { S.rep = Math.max(S.rep, L.FOREST_REP); S.coins += L.FOREST_COST; L.unlockForest(S, now()); } goScene('forest'); refresh(); return S.forest; };
    // FF.forage() regrows every spot now; FF.forage('all') also fills the 도감 with every type
    FF.forage = function (all) {
      if (!S.forest) FF.forest();
      if (all === 'all') L.FORAGE.forEach(function (f) { S.forest.dex[f.id] = (S.forest.dex[f.id] || 0) + 1; });
      else if (typeof all === 'string' && L.forageById(all)) { S.forest.spots.forEach(function (p) { p.id = all; }); refresh(); return S.forest.spots; }
      S.forest.spots.forEach(function (p) { p.id = null; p.at = 0; });
      L.tickForest(S, now(), fEnv(now()), Math.random); refresh();
      return S.forest.spots.map(function (p) { return p.id; });
    };
  }
