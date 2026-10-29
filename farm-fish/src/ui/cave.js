  // ---------- 동굴: the rock wall scene, ore/gem/fossil art, the 도전 hook, 도감 광물·화석, 상점 곡괭이·만들기 ----------
  // Logic in logic/cave.js. A tap breaks a cell (one energy); holding starts the 도전 gauge (logic/challenge.js),
  // and a release in the crack breaks the cell beside it too. chFinish (ui/forest.js) hands kind 'cave' to caveDone.
  var CW = { x: 12, y: 62, w: 26, h: 22 };   // wall origin and cell size (6 × 4 cells)
  var fossilMoment = 0;                      // performance.now() until which "a fossil was just completed" (사진기)
  function caveShown() { return L.caveOk(S); }
  function caveAttention() { return L.caveOk(S) && L.caveEnergy(S, now()).n >= L.CAVE_EMAX; }
  function cellRect(k) { var c = k % L.CAVE_COLS, r = Math.floor(k / L.CAVE_COLS); return [CW.x + c * CW.w, CW.y + r * CW.h, CW.w, CW.h]; }

  // ---------- pre-rendered cave: dark rock, a lit mouth behind, rails on the floor ----------
  var bgCave = document.createElement('canvas'); bgCave.width = W; bgCave.height = H;
  (function paintCave() {
    var saved = ctx; ctx = bgCave.getContext('2d');
    px(0, 0, W, H, 4);
    for (var k = 0; k < 420; k++) {
      var x = Math.floor(hash(k * 13 + 5) * W), y = Math.floor(hash(k * 17 + 2) * H);
      px(x, y, 1 + (k % 3 === 0 ? 1 : 0), 1, k % 4 ? 3 : 2);
    }
    // the arched ceiling line and the wall's frame
    for (var x2 = 0; x2 < W; x2++) { var hy = 30 + Math.round(Math.sin(x2 / 30) * 4 + Math.sin(x2 / 9) * 1.5); px(x2, hy, 1, 1, 2); px(x2, hy + 1, 1, 1, 3); }
    px(CW.x - 3, CW.y - 3, CW.w * 6 + 6, 1, 2); px(CW.x - 3, CW.y + CW.h * 4 + 2, CW.w * 6 + 6, 1, 2);
    px(CW.x - 3, CW.y - 3, 1, CW.h * 4 + 6, 2); px(CW.x + CW.w * 6 + 2, CW.y - 3, 1, CW.h * 4 + 6, 2);
    // wooden props
    [CW.x - 8, CW.x + CW.w * 6 + 5].forEach(function (bx) { px(bx, 34, 3, 120, 3); px(bx + 1, 34, 1, 120, 2); });
    px(CW.x - 9, 36, CW.w * 6 + 18, 3, 3); px(CW.x - 9, 36, CW.w * 6 + 18, 1, 2);
    // floor and a mine-cart rail
    for (x2 = 0; x2 < W; x2 += 2) px(x2, 168 + (x2 % 6 ? 0 : 1), 1, 1, 2);
    px(0, 182, W, 1, 2); px(0, 190, W, 1, 2);
    for (x2 = 4; x2 < W; x2 += 10) px(x2, 181, 3, 11, 3);
    // the cart
    px(120, 166, 34, 12, 3); px(121, 167, 32, 2, 2); px(118, 165, 38, 2, 2);
    px(124, 178, 6, 6, 2); px(144, 178, 6, 6, 2); px(126, 180, 2, 2, 4); px(146, 180, 2, 2, 4);
    ctx = saved;
  })();

  // ---------- ore / gem / fossil art (x = centre, y = bottom) ----------
  var ORE_DOT = { rock: null, coal: 4, copper: 2, iron: 4, silver: 0, goldore: 1 };
  // gem outlines as rows (4 = edge, 0/1/2 = facets)
  var GEM_SHAPE = {
    prism:  ['..44..', '.4004.', '.4014.', '.4014.', '.4014.', '.4004.', '..44..'],
    round:  ['.4444.', '400014', '401114', '401114', '400004', '.4444.'],
    cut:    ['.44444.', '4001004', '.40104.', '..414..', '...4...'],
    oval:   ['.444.', '40014', '40114', '40114', '40014', '.444.'],
    star:   ['...4...', '..404..', '4440444', '.40104.', '.40404.', '44...44'],
    drop:   ['..4..', '.404.', '40014', '40114', '.444.'],
    shard:  ['...44', '..404', '.4014', '40114', '4444.']
  };
  var GEM_OF = { quartz: 'prism', amethyst: 'shard', icecrystal: 'star', garnet: 'round', jade: 'oval', aquamarine: 'drop', sunstone: 'round', moonstone: 'oval', ruby: 'cut', diamond: 'cut' };
  function drawOre(id, x, y, tt) {
    var o = L.oreById(id);
    if (!o) return;
    if (o.kind === 'gem') {
      var rows = GEM_SHAPE[GEM_OF[id] || 'cut'], w = rows[0].length;
      spr(rows, x - Math.floor(w / 2), y - rows.length);
      if (o.rarity === '전설' || id === 'moonstone') sparkle(x + Math.ceil(w / 2) + 1, y - rows.length, tt || 0);
      return;
    }
    // a lump of rock with flecks
    px(x - 4, y - 5, 8, 4, 3); px(x - 3, y - 6, 6, 1, 3); px(x - 3, y - 1, 6, 1, 4); px(x - 4, y - 5, 1, 4, 4); px(x + 3, y - 5, 1, 4, 4); px(x - 3, y - 6, 6, 1, 4);
    px(x - 2, y - 5, 2, 1, 2);
    var d = ORE_DOT[id];
    if (d !== null && d !== undefined) { px(x - 2, y - 3, 1, 1, d); px(x + 1, y - 4, 1, 1, d); px(x, y - 2, 1, 1, d); if (id === 'iron') px(x - 1, y - 4, 3, 1, 4); }
    if (id === 'goldore') sparkle(x + 4, y - 6, tt || 0);
  }
  var FOSSIL_ART = {
    ammonite: function (x, y) { px(x - 4, y - 8, 8, 8, 3); px(x - 3, y - 9, 6, 1, 3); px(x - 3, y, 6, 1, 3); px(x - 2, y - 6, 4, 4, 2); px(x - 1, y - 5, 2, 2, 4); px(x + 1, y - 4, 1, 1, 3); },
    trilobite: function (x, y) { px(x - 3, y - 9, 6, 2, 3); px(x - 4, y - 7, 8, 6, 3); px(x - 1, y - 9, 2, 9, 2); for (var k = 0; k < 3; k++) px(x - 4, y - 6 + k * 2, 8, 1, 4); },
    leaffossil: function (x, y) { px(x - 1, y - 9, 2, 9, 3); for (var k = 0; k < 4; k++) { px(x - 4 + k % 2, y - 8 + k * 2, 3, 1, 2); px(x + 1, y - 8 + k * 2, 3 - k % 2, 1, 2); } },
    fishfossil: function (x, y) { px(x - 5, y - 5, 10, 1, 2); px(x + 4, y - 7, 2, 5, 3); px(x - 6, y - 6, 2, 3, 3); for (var k = 0; k < 4; k++) px(x - 3 + k * 2, y - 7, 1, 5, 2); },
    dinoegg: function (x, y) { px(x - 3, y - 9, 6, 9, 3); px(x - 4, y - 7, 8, 6, 3); px(x - 2, y - 7, 2, 2, 2); px(x + 1, y - 4, 2, 1, 4); px(x - 1, y - 3, 1, 2, 4); },
    mammoth: function (x, y) { for (var k = 0; k < 9; k++) px(x - 5 + k, y - 2 - Math.round(Math.sin(k / 8 * Math.PI) * 6), 2, 2, k < 6 ? 3 : 2); },
    dinoskull: function (x, y) { px(x - 5, y - 8, 9, 5, 3); px(x + 4, y - 6, 3, 3, 3); px(x - 3, y - 7, 2, 2, 4); px(x - 5, y - 3, 11, 1, 2); for (var k = 0; k < 5; k++) px(x - 4 + k * 2, y - 2, 1, 2, 3); },
    pterosaur: function (x, y) { px(x - 6, y - 3, 13, 1, 3); px(x - 6, y - 4, 2, 1, 3); px(x + 5, y - 4, 2, 1, 3); px(x - 1, y - 7, 2, 6, 2); px(x - 1, y - 9, 4, 2, 3); for (var k = 0; k < 3; k++) { px(x - 5 + k * 2, y - 2, 1, 2, 2); px(x + 2 + k * 2, y - 2, 1, 2, 2); } }
  };
  function drawFossil(id, x, y) { if (FOSSIL_ART[id]) FOSSIL_ART[id](x, y); }
  // basket / 도감 icon for ores, gems and the 화석 조각
  function caveIcon(id) {
    var c = document.createElement('canvas'); c.width = 14; c.height = 14;
    var saved = ctx; ctx = c.getContext('2d');
    try {
      if (id === 'fossilbit') { px(3, 6, 8, 6, 3); px(4, 5, 5, 1, 3); px(5, 8, 4, 1, 2); px(6, 7, 1, 3, 2); }
      else drawOre(id, 7, 13, 0);
    } finally { ctx = saved; }
    return c;
  }
  function fossilIcon(id) {
    var c = document.createElement('canvas'); c.width = 14; c.height = 14;
    var saved = ctx; ctx = c.getContext('2d');
    try { drawFossil(id, 7, 12); } finally { ctx = saved; }
    return c;
  }

  // ---------- 동굴 scene ----------
  function drawCave(tt, dt) {
    ctx.drawImage(bgCave, 0, 0);
    var c = S.cave, t = now();
    if (!c) return;
    // energy: one pip per point
    var e = L.caveEnergy(S, t), pw = 7, x0 = Math.round(W / 2 - (e.max * pw) / 2);
    for (var k = 0; k < e.max; k++) { px(x0 + k * pw, 44, pw - 2, 5, 2); if (k < e.n) px(x0 + k * pw + 1, 45, pw - 4, 3, 0); }
    // lantern swinging on the prop
    var sw = Math.round(Math.sin(tt * 1.4) * 1.5);
    px(CW.x - 8 + sw, 40, 1, 6, 2); px(CW.x - 10 + sw, 46, 5, 6, 2); px(CW.x - 9 + sw, 47, 3, 4, Math.floor(tt * 3) % 4 ? 0 : 1);
    c.wall.forEach(function (v, j) {
      var r = cellRect(j), bob = chal && chal.kind === 'cave' && chal.k === j ? Math.round(Math.sin(tt * 30)) : 0;
      if (!v) {
        px(r[0] + 2, r[1] + 2, r[2] - 4, r[3] - 4, 4);
        px(r[0] + 4, r[1] + r[3] - 5, 3, 2, 3); px(r[0] + r[2] - 8, r[1] + r[3] - 4, 4, 2, 3);
        return;
      }
      var x = r[0] + 1 + bob, y = r[1] + 1;
      px(x, y, r[2] - 2, r[3] - 2, 3);
      px(x, y, r[2] - 2, 1, 2); px(x, y, 1, r[3] - 2, 2);
      px(x, y + r[3] - 3, r[2] - 2, 1, 4); px(x + r[2] - 3, y, 1, r[3] - 2, 4);
      // a crack, different per cell
      var h = hash(j * 7919 + 13 + c.lv * 104729);
      px(x + 4 + Math.floor(h * 10), y + 4, 1, 4, 4); px(x + 5 + Math.floor(h * 10), y + 8, 3, 1, 4);
      if (h > 0.5) px(x + 14, y + 12, 4, 1, 2);
      if (v === 2) sparkle(x + 6 + Math.floor(h * 12), y + 6 + Math.floor(h * 8), tt + j * 0.37);
    });
  }
  function tapCave(x, y) {
    if (!S.cave) return;
    var t = now(), k = -1;
    for (var j = 0; j < S.cave.wall.length; j++) if (hit(cellRect(j), x, y)) { k = j; break; }
    if (k < 0) {
      var e0 = L.caveEnergy(S, t);
      toast('바위를 누르면 깨기 · 꾹 누르면 도전 (금 간 데서 떼면 한 칸 더) · 기력 ' + e0.n + '/' + e0.max, 2800);
      return;
    }
    if (!S.cave.wall[k]) { toast('이미 깬 자리 · 벽을 다 깨면 새 벽이 나온다', 1800); return; }
    var e = L.caveEnergy(S, t);
    if (e.n < 1) { toast('숨 좀 돌리자 · 기력 하나 차기까지 ' + fmtLeft(Math.max(0, e.next - t)), 2400); return; }
    if (bagStop()) return;
    var r = cellRect(k);
    chal = { kind: 'cave', k: k, x: r[0] + r[2] / 2, y: r[1], g: L.caveGame(performance.now(), Math.random), hinted: true };
  }
  var caveHintN = 0;
  function caveDone(c, won, res) {
    var r = L.mineCell(S, c.k, now(), Math.random, won, curEnv(now()));
    if (!r) return;
    tmapAfter('cave');   // stage 8 ③
    var rr = cellRect(c.k);
    burst(rr[0] + rr[2] / 2, rr[1] + rr[3] / 2, won ? 16 : 9, won ? 0 : 2, won ? 70 : 45);
    var parts = [mineText(r)];
    if (r.more) parts.push(mineText(r.more));
    floatText(parts.map(function (p) { return p.short; }).join(' '), c.x, c.y - 6);
    var sold = (r.sold || 0) + (r.more ? r.more.sold || 0 : 0), msg;
    var done = r.done ? r : r.more && r.more.done ? r.more : null;
    if (done) {
      fossilMoment = performance.now() + 15e3;
      msg = '★ ' + L.fossilById(done.fossil).name + ' 화석 완성! · +' + done.reward + ' · 도감 화석에';
    } else {
      msg = (won ? '도전 성공! 한 칸 더 · ' : res === 'miss' ? '아깝다 · ' : '') + parts.map(function (p) { return p.long; }).join(' · ');
      if (sold) msg += ' · 바구니가 꽉 차 바로 팔았다 +' + sold;
    }
    if (r.fresh) msg += ' · 벽 너머에 새 바위벽이';
    toast(msg, done ? 4200 : 2600);
    refresh();
  }
  function mineText(r) {
    if (r.kind === 'part') {
      var f = L.fossilById(r.fossil);
      if (r.dup) return { short: '+화석 조각', long: f.name + ' 조각 (이미 있음) · 화석 조각으로 바구니에' };
      return { short: '★' + f.name, long: f.name + ' 조각 ' + r.have + '/' + f.parts };
    }
    var o = L.oreById(r.id), first = S.cave.dex[r.id] === 1;
    return { short: '+' + o.name, long: (first && o.rarity !== '흔함' ? '★ 처음 · ' : '') + o.name + (o.rarity !== '흔함' ? ' (' + o.rarity + ')' : '') };
  }
  // per tick: drop a gauge left behind when the scene changed, explain the gauge the first times it shows
  function tickCaveUI() {
    if (!chal || chal.kind !== 'cave') return;
    if (view !== 'cave') { chal = null; return; }
    if (!chal.told && performance.now() >= chal.g.t0) { chal.told = true; if (caveHintN++ < 3) toast('도전 · 표시 칸에서 떼면 옆 칸까지 한 번에 (기력은 하나)', 1800); }
  }
  // 새 손님 알림 for the cave (ui/spots.js tickNotice): an unfound gem that only shows at this time, while here
  function caveNotice(e, live) {
    if (view !== 'cave' || !L.caveOk(S)) return null;
    var out = null;
    L.ORES.forEach(function (o) {
      if (!o.phase || L.oreWeight(o, e, null, false) <= 0) return;
      var key = 'cave|ph:' + e.phase;
      live[key] = true;
      if (!out && !S.cave.dex[o.id]) out = { k: key, say: NOTICE_PHASE[e.phase] + ' · 동굴 벽에 처음 보는 빛이…' };
    });
    return out;
  }

  // ---------- 도감: 광물 · 화석 ----------
  function oreCond(o) {
    var out = [];
    if (o.season) out.push(o.season.map(function (x) { return L.SEASON_NAME[x]; }).join('·'));
    if (o.phase) out.push(o.phase.map(function (x) { return L.PHASE_NAME[x]; }).join('·') + '에만');
    return out.length ? out.join(' · ') : '언제나';
  }
  function renderCaveDex(row) {
    dexHead('광물·보석', L.caveDexCount(S), L.ORES.length, L.caveOk(S) ? '' : '신뢰도 ★' + L.CAVE_REP + ' · 상점에서 곡괭이를 사면 숲 안쪽 동굴로 갈 수 있어요');
    L.ORES.forEach(function (o) {
      var n = S.cave ? S.cave.dex[o.id] || 0 : 0, ic = caveIcon(o.id); ic.className = 'sq';
      row(ic, n ? (o.rarity === '희귀' || o.rarity === '전설' ? '★ ' : '') + o.name : '???',
        n ? (o.kind === 'gem' ? '보석' : '광석') + ' · ' + o.rarity + ' · ' + oreCond(o) + ' · ' + o.price + '코인' : o.hint, n ? n + '개' : '', !n);
    });
    dexHead('화석', L.fossilCount(S), L.FOSSILS.length, L.caveOk(S) ? '바위 속에 드물게 조각이 · 겹친 조각은 팔 수 있어요' : '');
    L.FOSSILS.forEach(function (f) {
      var got = S.cave && S.cave.parts[f.id] ? S.cave.parts[f.id].filter(Boolean).length : 0, done = !!(S.cave && S.cave.done[f.id]);
      var ic = fossilIcon(f.id); ic.className = 'sq';
      row(ic, done ? '★ ' + f.name : got ? f.name + ' (미완성)' : '???', done ? '조각 ' + f.parts + '개 완성' : got ? '조각 ' + got + '/' + f.parts + ' · ' + f.hint : f.hint, done ? '완성' : got ? got + '/' + f.parts : '', !done);
    });
  }

  // ---------- 상점: 곡괭이, 광석으로 만들기 ----------
  function shopRow(icon, name, sub, label, onClick, opts) {
    var r = document.createElement('div'); r.className = 'up';
    var n = document.createElement('div'); n.className = 'n'; n.textContent = name;
    var sm = document.createElement('small'); sm.textContent = sub; n.appendChild(sm);
    var bt = document.createElement('button'); bt.type = 'button'; bt.textContent = label;
    if (opts && opts.max) { bt.disabled = true; bt.className = 'max'; }
    else {
      if (opts && opts.aria) bt.setAttribute('aria-label', opts.aria);
      if (opts && opts.poor) bt.classList.add('poor');
      bt.addEventListener('click', function () {
        var res = onClick();
        if (res && !res.ok) { toast(WHY[res.why] || res.why || '살 수 없어요'); bt.classList.remove('shake'); void bt.offsetWidth; bt.classList.add('shake'); }
      });
    }
    r.appendChild(icon); r.appendChild(n); r.appendChild(bt); shopEl.appendChild(r);
  }
  function pickIcon() {
    var c = document.createElement('canvas'); c.width = 16; c.height = 16;
    var saved = ctx; ctx = c.getContext('2d');
    try { for (var k = 0; k < 11; k++) px(3 + k, 14 - k, 2, 1, 3); px(2, 3, 12, 2, 4); px(1, 4, 2, 2, 4); px(13, 4, 2, 2, 4); px(7, 2, 3, 4, 4); } finally { ctx = saved; }
    return c;
  }
  function renderCaveShop() {
    var h3 = document.createElement('h3'); h3.textContent = '동굴'; shopEl.appendChild(h3);
    var own = L.caveOk(S), st = L.caveStatus(S);
    shopRow(pickIcon(), '곡괭이', own ? '숲 안쪽 동굴 · 바위를 깨면 광석·보석·화석' : st === 'rep' ? '신뢰도 ★' + L.CAVE_REP + '이 되면 살 수 있어요 · 숲 안쪽 동굴로' : '숲 안쪽 동굴이 열린다 · 기력은 시간이 지나면 차오른다',
      own ? '있음' : L.PICK_COST.toLocaleString('ko-KR'),
      function () {
        var res = L.buyPick(S, now(), Math.random);
        if (res.ok) { toast('곡괭이 · 이동 → 동굴 · 바위를 눌러 깨 보자', 3200); refresh(); renderShop(); }
        return res;
      }, { max: own, poor: !own && st !== 'ok', aria: '곡괭이 사기 ' + L.PICK_COST + '코인' });
    if (!own) return;
    L.CAVE_CRAFT.forEach(function (c) {
      var why = L.canCraft(S, c.id), need = Object.keys(c.need).map(function (x) { return L.itemInfo(x).name + ' ' + Math.min(L.bagCount(S, x), c.need[x]) + '/' + c.need[x]; }).join(' · ');
      shopRow(decoIcon(c.id), c.name, '마당 장식 · ' + need, why === 'owned' ? '있음' : '만들기',
        function () {
          var res = L.craftDeco(S, c.id);
          if (res.ok) { toast(josa(c.name, '을', '를') + ' 만들었다 · ' + (res.stored ? '보관함에' : '마당에 놓았다'), 3000); refresh(); renderShop(); }
          return res.ok ? res : { ok: false, why: res.why === 'need' ? '바구니에 광석이 모자라요' : res.why };
        }, { max: why === 'owned', poor: why !== 'ok', aria: c.name + ' 만들기' });
    });
  }

  // ---------- 마당 decorations from the cave ----------
  DRAW_DECO.orelamp = function (x, y, tt, night) {
    px(x + 4, y + 6, 2, 14, 3); px(x + 1, y + 19, 8, 1, 4);
    px(x + 1, y, 8, 2, 4); px(x + 2, y + 2, 6, 5, 4); px(x + 3, y + 3, 4, 3, night || Math.floor(tt * 2) % 5 ? 0 : 1);
  };
  DRAW_DECO.geode = function (x, y) {
    px(x + 1, y + 3, 14, 9, 3); px(x + 2, y + 2, 12, 1, 3); px(x, y + 5, 1, 6, 3); px(x + 15, y + 5, 1, 6, 3);
    px(x + 3, y + 4, 10, 6, 4);
    [[4, 8], [6, 6], [8, 7], [10, 5], [11, 8]].forEach(function (p, k) { px(x + p[0], y + p[1], 2, 10 - p[1], k % 2 ? 1 : 0); });
  };

  // ---------- 사진기 (lane ①): the cave's moments, for a camera ctx when L.shotsNow exists ----------
  function caveShotCtx(c) {
    if (view === 'cave') c.scene = 'cave';
    if (performance.now() < fossilMoment) c.fossilDone = true;
    return c;
  }

  // ---------- console hooks ----------
  function addCaveHooks(FF) {
    // FF.cave() buys the pickaxe and goes there; FF.cave('all') also fills the 광물 도감
    FF.cave = function (all) {
      if (!S.cave) { S.rep = Math.max(S.rep, L.CAVE_REP); S.coins += L.PICK_COST; L.buyPick(S, now(), Math.random); }
      if (all === 'all') L.ORES.forEach(function (o) { S.cave.dex[o.id] = (S.cave.dex[o.id] || 0) + 1; });
      goScene('cave'); refresh(); return S.cave;
    };
    FF.caveE = function (n) { if (S.cave) { S.cave.e = n === undefined ? L.CAVE_EMAX : n; S.cave.t = now(); } return L.caveEnergy(S, now()); };
    // FF.fossil(id) gives every part but one, so the next fossil roll of it completes; FF.fossil(id, true) completes it
    FF.fossil = function (id, done) {
      var f = L.fossilById(id) || L.FOSSILS[0];
      if (!S.cave) FF.cave();
      S.cave.parts[f.id] = []; for (var k = 0; k < f.parts; k++) S.cave.parts[f.id].push(done || k > 0);
      if (done) { S.cave.done[f.id] = true; fossilMoment = performance.now() + 15e3; }
      refresh(); return S.cave.parts[f.id];
    };
    FF.glint = function () { if (S.cave) S.cave.wall = S.cave.wall.map(function (v) { return v ? 2 : 0; }); return S.cave && S.cave.wall; };
  }
