  // ---------- 잠수 (stage 12): minimap overlay, 해저 도감 rows, thing art, basket icons, decorations ----------
  // Minimap: seen rooms as cells (light 얕은 여 → dark 심해), passages as lines, a stub with a cross where a passage is
  // still shut for the gear in hand, a stub alone where it leads somewhere not yet seen. The current room blinks.
  var DMAP = { x: 15, y: 46, w: 20, h: 19, gx: 6 };   // origin, cell size, cell gap
  function dmapCell(r) { return [DMAP.x + r.x * (DMAP.w + DMAP.gx), DMAP.y + r.y * (DMAP.h + DMAP.gx), DMAP.w, DMAP.h]; }
  function drawDiveMap(tt) {
    ctx.globalAlpha = 0.85; px(0, 0, W, H, 0); ctx.globalAlpha = 1;
    px(8, 28, W - 16, 154, 4); px(10, 30, W - 20, 150, 1);
    var seen = (S.dive && S.dive.seen) || {}, on = Math.floor(tt * 3) % 2;
    var STEPV = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
    L.DIVE_ROOMS.forEach(function (r) {
      if (!seen[r.id]) return;
      var c = dmapCell(r), cx = c[0] + c[2] / 2, cy = c[1] + c[3] / 2;
      Object.keys(r.exits).forEach(function (d) {
        var o = L.diveRoom(r.exits[d]), v = STEPV[d], open = L.diveCanEnter(S, o.id).ok;
        var len = seen[o.id] ? DMAP.gx : Math.floor(DMAP.gx / 2) + 1;
        var x0 = d === 'e' ? c[0] + c[2] : d === 'w' ? c[0] - len : cx - 1, y0 = d === 's' ? c[1] + c[3] : d === 'n' ? c[1] - len : cy - 1;
        if (v[0]) px(x0, y0, len, 3, 4); else px(x0, y0, 3, len, 4);
        if (!open) { var mx = d === 'e' ? c[0] + c[2] + 2 : d === 'w' ? c[0] - 5 : cx - 2, my = d === 's' ? c[1] + c[3] + 2 : d === 'n' ? c[1] - 5 : cy - 2; px(mx, my, 1, 1, 0); px(mx + 2, my, 1, 1, 0); px(mx + 1, my + 1, 1, 1, 0); px(mx, my + 2, 1, 1, 0); px(mx + 2, my + 2, 1, 1, 0); }
      });
    });
    L.DIVE_ROOMS.forEach(function (r) {
      var c = dmapCell(r);
      if (!seen[r.id]) { px(c[0] + c[2] / 2 - 1, c[1] + c[3] / 2 - 1, 2, 2, 2); return; }
      px(c[0], c[1], c[2], c[3], 4);
      px(c[0] + 1, c[1] + 1, c[2] - 2, c[3] - 2, r.zone === 'reef' ? 0 : r.zone === 'wreck' ? 2 : 3);
      if (r.bubbles.length) { px(c[0] + 3, c[1] + c[3] - 5, 2, 2, 4); }
      if (r.log && !(S.dive && S.dive.log[r.log])) { px(c[0] + c[2] - 6, c[1] + 3, 3, 4, 4); }
      if (dv && dv.room === r.id && on) { px(c[0] + c[2] / 2 - 2, c[1] + c[3] / 2 - 2, 4, 4, 4); px(c[0] + c[2] / 2 - 1, c[1] + c[3] / 2 - 1, 2, 2, 0); }
    });
    // the boat above r0
    var c0 = dmapCell(L.diveRoom('r0'));
    px(c0[0] + 4, c0[1] - 8, 14, 3, 4); px(c0[0] + 10, c0[1] - 14, 1, 6, 4); px(c0[0] + 11, c0[1] - 13, 4, 4, 0);
  }

  // ---------- thing art (x = centre, y = bottom) ----------
  var DIVE_ART = {
    wakame:     ['.4..4.', '.40.4.', '..404.', '.4.04.', '.40.4.', '..404.', '.4.4..', '444444'],
    coralbit:   ['.4..4..', '404.404', '.40404.', '..404..', '..404..', '.44444.'],
    scallop:    ['..444..', '.40404.', '4040404', '4040404', '.44444.', '..444..'],
    seagrape:   ['.4.4.4', '404040', '.40404', '..404.', '..4...', '.444..'],
    seahorse:   ['.444.', '40044', '.404.', '.400.', '..40.', '.404.', '.44..', '..4..'],
    nudibranch: ['.4...4.', '..4.4..', '.44444.', '4022204', '.44444.'],
    reefschool: ['.4.....4..', '444...444.', '.4..4..4..', '...444....', '....4.....'],
    scrap:      ['....44', '..4434', '.43334', '433344', '44444.'],
    mussel:     ['..44.', '.4334', '43334', '43344', '4344.', '.44..'],
    pearlclam:  ['.44444.', '4222224', '4220224', '4444444', '.42224.', '..444..'],
    wreckeel:   ['...444...', '..40044..', '.4444444.', '44.....44'],
    seaturtle:  ['..4444...', '.422224.4', '422222444', '.422224.4', '.4...4...'],
    wreckcrab:  ['4.....4', '44...44', '.44444.', '4422244', '.4.4.4.'],
    glowshell:  ['..444..', '.40004.', '4000004', '4444444'],
    blackcoral: ['4..4..4', '.4.4.4.', '..444..', '...4...', '...4...', '.44444.'],
    anglerfish: ['....0..', '...4...', '.44444.', '4400044', '4404444', '.44444.'],
    gulper:     ['44......', '4044....', '40004444', '4044..44', '44......'],
    glowsquid:  ['..4..', '.404.', '.404.', '40004', '.4.4.', '4.4.4'],
    lanternfish:['..4444..', '.400004.', '40404044', '.444444.'],
    deepjelly:  ['.4444.', '400004', '444444', '.4.4..', '4.4.4.', '.4.4..'],
    key:        ['.44.....', '4004444.', '40044.44', '.44.....'],
    log:        ['.44444.', '4000004', '4044404', '4000004', '.44444.'],
    box:        ['.444444.', '42222224', '44444444', '42204224', '42222224', '44444444'],
    diver:      ['..444....', '.40044444', '.40044444', '..4444.4.', '....4....'],
    tank:       ['.44.', '4004', '4004', '4004', '4004', '4444'],
    light:      ['4444...', '40044..', '4000044', '40044..', '4444...']
  };
  var DIVE_SWIM = { seahorse: 1, nudibranch: 0.3, reefschool: 1, wreckeel: 0.5, seaturtle: 1, wreckcrab: 0.4, anglerfish: 1, gulper: 1, glowsquid: 1, lanternfish: 1, deepjelly: 1 };
  function drawDiveThing(id, x, y, tt) {
    var rows = DIVE_ART[id];
    if (!rows) return;
    var w = rows[0].length, sw = DIVE_SWIM[id] || 0;
    var bob = sw ? Math.round(Math.sin((tt || 0) * 1.6) * 2 * sw) : 0, dx = id === 'reefschool' || id === 'seaturtle' ? Math.round(Math.sin((tt || 0) * 0.5) * 6) : 0;
    spr(rows, x - Math.floor(w / 2) + dx, y - rows.length + bob);
    if (id === 'glowshell' || id === 'anglerfish' || id === 'pearlclam' || id === 'key' || id === 'box' || id === 'log') sparkle(x + Math.ceil(w / 2) + 1, y - rows.length + bob, tt || 0);
  }
  function diveIcon(id) {
    var c = document.createElement('canvas'); c.width = 14; c.height = 14;
    var saved = ctx; ctx = c.getContext('2d');
    try { var rows = DIVE_ART[id]; if (rows) spr(rows, 7 - Math.floor(rows[0].length / 2), 12 - rows.length); } finally { ctx = saved; }
    return c;
  }

  // ---------- 도감: 해저 ----------
  function renderDiveDex(row) {
    if (!L.diveOk(S) && !S.dive) return;
    var titles = L.diveTitles(S);
    dexHead('해저', L.diveDexCount(S), L.DIVE_DEX.length, '밝힌 방 ' + L.diveSeenCount(S) + '/' + L.DIVE_ROOMS.length + ' · 항해일지 ' + L.diveLogCount(S) + '/' + L.DIVE_LOG.length + (titles.length ? ' · 칭호 ' + titles.join('·') : '') + ' (포구 부두의 잠수 표시)');
    L.DIVE_DEX.forEach(function (d) {
      var got = !!(S.dive && S.dive.got[d.id]), ic = diveIcon(d.id); ic.className = 'sq';
      row(ic, got ? d.name : '???', got ? { reef: '얕은 여', wreck: '난파선', deep: '심해 동굴' }[d.zone] + ' · ' + (d.kind === 'pick' ? '주워서 바구니로 · ' + d.price + '코인' : '보기만 · ' + d.hint) : d.hint, got ? (d.kind === 'pick' ? '주움' : '봄') : '', !got);
    });
    for (var n = 1; n <= L.DIVE_LOG.length; n++) {
      if (!(S.dive && S.dive.log[n])) continue;
      var p = document.createElement('p'); p.className = 'note'; p.textContent = '항해일지 ' + L.DIVE_LOG[n - 1];
      dexEl.appendChild(p);
    }
  }

  // ---------- 마당 decorations from the dive ----------
  DRAW_DECO.wreckwheel = function (x, y, tt) {
    var cx = x + 7, cy = y + 7, a = (tt || 0) * 0.2;
    for (var k = 0; k < 8; k++) { var ang = a + k * Math.PI / 4; px(Math.round(cx + Math.cos(ang) * 6), Math.round(cy + Math.sin(ang) * 6), 2, 2, 4); }
    for (var j = 0; j < 16; j++) { var b = j * Math.PI / 8; px(Math.round(cx + Math.cos(b) * 4), Math.round(cy + Math.sin(b) * 4), 1, 1, 3); }
    px(cx - 1, cy - 1, 3, 3, 4); px(x + 6, y + 13, 3, 5, 3); px(x + 3, y + 17, 9, 1, 4);
  };
  DRAW_DECO.seamap = function (x, y) {
    px(x, y, 16, 12, 4); px(x + 1, y + 1, 14, 10, 0);
    [[3, 3], [7, 3], [11, 3], [3, 7], [7, 7], [11, 7]].forEach(function (p, k) { px(x + p[0], y + p[1], 3, 2, k < 3 ? 1 : k < 5 ? 2 : 3); });
    px(x + 6, y + 4, 1, 1, 4); px(x + 10, y + 4, 1, 1, 4); px(x + 4, y + 5, 1, 2, 4);
    px(x + 6, y + 12, 1, 2, 4); px(x + 9, y + 12, 1, 2, 4);
  };
