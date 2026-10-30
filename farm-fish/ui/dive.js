  // ---------- 잠수 탐험 (stage 12): one room = one screen, tap to swim, oxygen, take / look at things ----------
  // Logic in logic/dive.js + logic/divemap.js. Oxygen runs on frame time (dt), so it stops whenever the game is hidden
  // (no frames) or behind the boss key; it also waits while the minimap is open. At 0 the diver floats up: nothing is lost.
  // The 옛 포구 scene (lane ①) calls drawPortExtra_dive / tapPortExtra_dive for the dock marker; diveGearRows fills a sheet.
  var DIVE_SPEED = 38, DIVE_GAP = 18, DIVE_MID = 110;   // px/s; half width of a passage; e/w passage centre y
  var DIVE_MARK = [14, 114, 18, 26];                    // dock marker on the 포구 scene (x, y, w, h)
  var DIVE_MAPBTN = [3, 183, 18, 14];
  var DIVE_ZONE = { reef: '얕은 여', wreck: '난파선', deep: '심해 동굴' };
  var dv = null;   // the dive in progress: { room, x, y, tx, ty, o2, want, taken, map, dark, up, face, zones, n }
  function diveHome() { return L.portShown(S) ? 'port' : L.villageOk(S) ? 'village' : 'farm'; }

  function startDive(roomId) {
    if (!L.diveOk(S)) { toast('잠수는 옛 포구 조선소를 고친 뒤에', 2200); return false; }
    var id = roomId && L.diveCanEnter(S, roomId).ok ? roomId : 'r0';
    L.diveEnter(S, id);
    dv = { room: id, x: 90, y: 30, tx: 90, ty: 60, o2: L.diveO2Max(S), want: -1, taken: {}, map: false, dark: 0, up: 0, face: 1, zones: {}, n: 0 };
    dv.zones[L.diveRoom(id).zone] = true;
    goScene('dive');
    cv.setAttribute('aria-label', '잠수 · ' + DIVE_ZONE[L.diveRoom(id).zone]);
    save();
    return true;
  }
  function endDive(why) {
    var n = dv ? dv.n : 0;
    dv = null;
    goScene(diveHome());
    toast((why === 'o2' ? '숨이 차서 물 위로 · ' : '물 위로 · ') + (n ? '이번에 ' + n + '가지 · ' : '') + '주운 것·밝힌 방은 그대로', 3000);
    refresh();
  }

  // ---------- pre-rendered water per zone ----------
  var bgDive = {};
  ['reef', 'wreck', 'deep'].forEach(function (z) {
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var saved = ctx; ctx = c.getContext('2d');
    try {
      if (z === 'reef') {
        px(0, 0, W, H, 0);
        for (var y = 60; y < H; y += 4) px(0, y, W, 2, 1);   // light falling off with depth
        for (var k = 0; k < 6; k++) for (var j = 0; j < 120; j += 2) px(20 + k * 28 + Math.floor(j / 4), j, 1, 1, 1);   // rays
        px(0, 182, W, H - 182, 2);
        for (var s = 0; s < 60; s++) px(Math.floor(hash(s * 7 + 1) * W), 183 + Math.floor(hash(s * 3 + 2) * 16), 1, 1, 3);
      } else if (z === 'wreck') {
        px(0, 0, W, H, 1);
        for (var p = 30; p < 180; p += 12) { px(0, p, W, 1, 2); for (var q = (p / 12) % 2 ? 6 : 26; q < W; q += 40) px(q, p, 1, 12, 2); }   // hull planks
        px(0, 184, W, H - 184, 3);
        for (var r2 = 0; r2 < 40; r2++) px(Math.floor(hash(r2 * 11 + 4) * W), 185 + Math.floor(hash(r2 * 5 + 9) * 14), 2, 1, 2);
      } else {
        px(0, 0, W, H, 4);
        for (var m = 0; m < 50; m++) px(Math.floor(hash(m * 13 + 3) * W), Math.floor(hash(m * 17 + 8) * H), 1, 1, 3);   // drifting specks
        px(0, 186, W, H - 186, 3);
      }
    } finally { ctx = saved; }
    bgDive[z] = c;
  });
  // rock walls around a room, a gap where each passage leaves (bumps differ per room)
  function drawDiveWalls(r) {
    var col = r.zone === 'reef' ? 3 : r.zone === 'wreck' ? 4 : 3, h0 = r.id.charCodeAt(1) * 31;
    function bump(k) { return 6 + Math.floor(hash(h0 + k) * 5); }
    for (var x = 0; x < W; x += 4) {
      var gapN = r.exits.n && Math.abs(x + 2 - 90) < DIVE_GAP, gapS = r.exits.s && Math.abs(x + 2 - 90) < DIVE_GAP;
      if (!gapN && r.id !== 'r0') px(x, 0, 4, bump(x) + 6, col);
      if (!gapS) px(x, H - bump(x + 500), 4, bump(x + 500), col);
    }
    for (var y = 0; y < H; y += 4) {
      var gapW = r.exits.w && Math.abs(y + 2 - DIVE_MID) < DIVE_GAP, gapE = r.exits.e && Math.abs(y + 2 - DIVE_MID) < DIVE_GAP;
      if (!gapW) px(0, y, bump(y + 900), 4, col);
      if (!gapE) px(W - bump(y + 1300), y, bump(y + 1300), 4, col);
    }
    if (r.id === 'r0') { for (var x2 = 0; x2 < W; x2++) px(x2, 4 + Math.round(Math.sin(x2 / 8 + performance.now() / 600)), 1, 1, 2); }   // the surface
    // a locked 열쇠 door: bars across the passage
    Object.keys(r.exits).forEach(function (d) {
      var o = L.diveRoom(r.exits[d]);
      if (o.gate !== 'key' || (S.dive && S.dive.gear.key)) return;
      if (d === 'n' || d === 's') { var yy = d === 'n' ? 2 : H - 10; px(90 - DIVE_GAP, yy, DIVE_GAP * 2, 2, 4); px(90 - DIVE_GAP, yy + 6, DIVE_GAP * 2, 2, 4); for (var b = -DIVE_GAP; b < DIVE_GAP; b += 6) px(90 + b, yy, 2, 8, 4); px(87, yy + 2, 6, 5, 2); px(89, yy + 3, 2, 2, 4); }
      else { var xx = d === 'w' ? 2 : W - 10; px(xx, DIVE_MID - DIVE_GAP, 2, DIVE_GAP * 2, 4); px(xx + 6, DIVE_MID - DIVE_GAP, 2, DIVE_GAP * 2, 4); for (var b2 = -DIVE_GAP; b2 < DIVE_GAP; b2 += 6) px(xx, DIVE_MID + b2, 8, 2, 4); px(xx + 1, DIVE_MID - 3, 6, 6, 2); }
    });
  }
  // the diver (x, y = centre): mask, tank, kicking fins
  function drawDiver(x, y, face, tt) {
    var f = Math.floor(tt * 5) % 2;
    x = Math.round(x); y = Math.round(y);
    var rows = ['..444....', '.40044444', '.40044444', '..4444.4.', '....4....'];
    spr(rows, x - 4, y - 3, face < 0);
    px(face > 0 ? x - 7 : x + 5, y - 2 + f, 3, 1, 4); px(face > 0 ? x - 7 : x + 5, y + f, 3, 1, 4);   // fins
    px(face > 0 ? x - 1 : x - 1, y - 5, 3, 2, 3);   // tank
    if (S.dive && S.dive.gear.light) px(face > 0 ? x + 5 : x - 6, y - 1, 2, 1, 0);
  }
  function thingShown(r, k) {
    var t = r.things[k], d = S.dive;
    if (dv.taken[r.id + ':' + k]) return false;
    if (t.id === 'key') return !(d && d.gear.key);
    if (t.id === 'log') return !(d && d.log[t.n]);
    if (t.id === 'box') return !(d && d.box[t.box]);
    return true;
  }
  function o2Bar() {
    var max = L.diveO2Max(S), w = 96, f = Math.max(0, Math.round(w * dv.o2 / max));
    px(22, 4, w + 2, 7, 4); px(23, 5, w, 5, 2); px(23, 5, f, 5, dv.o2 < 10 && Math.floor(performance.now() / 250) % 2 ? 1 : 0);
    // bubble icon
    px(8, 4, 6, 6, 4); px(9, 5, 4, 4, 0); px(10, 6, 1, 1, 4); px(15, 2, 3, 3, 4); px(16, 3, 1, 1, 0);
  }

  // ---------- scene ----------
  function drawDive(tt, dt) {
    if (!dv) { dv = { room: 'r0', x: 90, y: 30, tx: 90, ty: 60, o2: L.diveO2Max(S), want: -1, taken: {}, map: false, dark: 0, up: 0, face: 1, zones: { reef: true }, n: 0 }; }
    var r = L.diveRoom(dv.room);
    ctx.drawImage(bgDive[r.zone], 0, 0);
    if (dv.dark > 0) {   // a deep room without the 손전등: pitch black, then back out
      px(0, 0, W, H, 4);
      dv.dark -= dt;
      if (dv.dark <= 0) dv.dark = 0;
      return;
    }
    var deep = r.zone === 'deep';
    if (deep) {   // the 손전등 pool of light around the diver
      ctx.globalAlpha = 0.7;
      for (var ly = -52; ly < 52; ly += 2) { var sp = Math.round(Math.sqrt(52 * 52 - ly * ly)); px(Math.round(dv.x) - sp, Math.round(dv.y) + ly, sp * 2, 2, Math.abs(ly) < 30 && sp > 40 ? 1 : 2); }
      ctx.globalAlpha = 1;
    }
    // bubble spots: a crack in the floor letting air up
    r.bubbles.forEach(function (b, j) {
      px(b[0] - 4, b[1] + 4, 9, 2, deep ? 2 : 3);
      for (var k = 0; k < 4; k++) {
        var ph = (tt * 0.8 + k / 4 + j * 0.3) % 1, by = Math.round(b[1] + 2 - ph * 40), bx = b[0] + Math.round(Math.sin(ph * 9 + k) * 2);
        px(bx, by, 2, 2, deep ? 1 : 4); if (!deep) px(bx, by, 1, 1, 0);
      }
    });
    drawDiveWalls(r);
    r.things.forEach(function (t, k) {
      if (!thingShown(r, k)) return;
      var lit = !deep || Math.hypot(t.x - dv.x, t.y - dv.y) < 52 || t.id === 'glowshell' || t.id === 'anglerfish' || t.id === 'lanternfish' || t.id === 'glowsquid';
      if (!lit) { px(t.x, t.y - 3, 1, 1, 3); return; }
      drawDiveThing(t.id, t.x, t.y, tt + k);
      if (k === dv.want) sparkle(t.x + 7, t.y - 10, tt);
    });
    // swim
    var still = boss || dv.up > 0 || dv.map;
    if (!still) {
      var dx = dv.tx - dv.x, dy = dv.ty - dv.y, dist = Math.hypot(dx, dy), step = DIVE_SPEED * dt;
      if (dist > 0.5) { dv.x += dx / dist * Math.min(step, dist); dv.y += dy / dist * Math.min(step, dist); if (Math.abs(dx) > 1) dv.face = dx > 0 ? 1 : -1; }
      if (dv.want >= 0) { var wt = r.things[dv.want]; if (!thingShown(r, dv.want)) dv.want = -1; else if (Math.hypot(wt.x - dv.x, wt.y - 4 - dv.y) < 16) { var k2 = dv.want; dv.want = -1; diveTakeNow(r, k2); } }
      diveEdge(r);
      // oxygen
      var near = L.diveRoom(dv.room).bubbles.some(function (b) { return Math.hypot(b[0] - dv.x, b[1] - 10 - dv.y) < 18; });
      dv.o2 = near ? Math.min(L.diveO2Max(S), dv.o2 + 30 * dt) : dv.o2 - dt;
      if (dv.o2 <= 0) { dv.o2 = 0; dv.up = 1.6; dv.want = -1; }
    }
    if (dv.up > 0 && !boss) {
      dv.y -= 40 * dt;
      dv.up -= dt;
      if (dv.up <= 0) { drawDiver(dv.x, dv.y, dv.face, tt); endDive('o2'); return; }
    }
    if (deep) {   // the 손전등 circle: everything outside it stays dim
      ctx.globalAlpha = 0.55;
      for (var y = 0; y < H; y += 2) {
        var span = Math.sqrt(Math.max(0, 52 * 52 - (y - dv.y) * (y - dv.y)));
        if (!span) { px(0, y, W, 2, 4); continue; }
        px(0, y, Math.max(0, Math.round(dv.x - span)), 2, 4); px(Math.round(dv.x + span), y, W, 2, 4);
      }
      ctx.globalAlpha = 1;
    }
    drawDiver(dv.x, dv.y, dv.face, tt);
    if (Math.floor(tt * 1.5) % 2) px(dv.x + dv.face * 3, dv.y - 6 - Math.floor((tt * 12) % 6), 1, 1, deep ? 1 : 4);
    o2Bar();
    // minimap button
    var mb = DIVE_MAPBTN;
    px(mb[0], mb[1], mb[2], mb[3], 4); px(mb[0] + 1, mb[1] + 1, mb[2] - 2, mb[3] - 2, 0);
    for (var j = 0; j < 3; j++) { px(mb[0] + 3 + j * 5, mb[1] + 3, 3, 3, 3); px(mb[0] + 3 + j * 5, mb[1] + 8, 3, 3, j === 1 ? 4 : 2); }
    if (dv.up > 0) { ctx.globalAlpha = Math.min(1, (1.6 - dv.up) / 1.6); px(0, 0, W, H, 0); ctx.globalAlpha = 1; }
    if (dv.map) drawDiveMap(tt);
  }
  // reaching a passage: next room, or bounce back with the reason
  function diveEdge(r) {
    var d = null;
    if (dv.x < 3 && r.exits.w) d = 'w';
    else if (dv.x > W - 3 && r.exits.e) d = 'e';
    else if (dv.y < 3 && r.exits.n) d = 'n';
    else if (dv.y > H - 3 && r.exits.s) d = 's';
    if (!d) return;
    var next = r.exits[d], can = L.diveCanEnter(S, next);
    var back = { w: [14, DIVE_MID], e: [W - 14, DIVE_MID], n: [90, 18], s: [90, H - 16] }[d];
    if (!can.ok) {
      dv.x = back[0]; dv.y = back[1]; dv.tx = dv.x + (d === 'w' ? 16 : d === 'e' ? -16 : 0); dv.ty = dv.y + (d === 'n' ? 16 : d === 's' ? -16 : 0);
      if (can.why === 'light') { dv.dark = 1.4; toast('너무 어둡다… 아무것도 안 보여 · 조선소에서 손전등을', 2800); }
      else if (can.why === 'key') toast('녹슨 문이 잠겨 있다 · 얕은 여 어딘가에 열쇠가', 2600);
      else if (can.why === 'tank') toast('기포 없는 긴 통로 · 큰 산소통이 있으면 끝까지 갈 수 있다', 2800);
      return;
    }
    var res = L.diveEnter(S, next), o = L.diveRoom(next);
    dv.room = next; dv.want = -1;
    var arrive = { w: [W - 10, DIVE_MID], e: [10, DIVE_MID], n: [90, H - 12], s: [90, 14] }[d];
    dv.x = arrive[0]; dv.y = arrive[1];
    dv.tx = dv.x + (d === 'w' ? -18 : d === 'e' ? 18 : 0); dv.ty = dv.y + (d === 'n' ? -18 : d === 's' ? 18 : 0);
    if (!dv.zones[o.zone]) { dv.zones[o.zone] = true; toast(DIVE_ZONE[o.zone] + (o.zone === 'deep' ? ' · 손전등 불빛만큼 보인다' : o.zone === 'wreck' ? ' · 가라앉은 옛 배' : ''), 2200); }
    else if (res && res.first) floatText('새 방 ' + L.diveSeenCount(S) + '/' + L.DIVE_ROOMS.length, dv.x, dv.y - 8);
    if (res && res.map) setTimeout(function () { toast('★ 해저 지도 완성 · 해저 지도 액자 ' + (res.stored ? '(보관함)' : '(마당)'), 4200); }, 600);
    save();
  }
  function diveTakeNow(r, k) {
    var t = r.things[k], dx = L.diveDexById(t.id);
    if (dx && dx.kind === 'pick' && bagStop()) return;
    var res = L.diveTake(S, r.id, k, Math.random);
    dv.taken[r.id + ':' + k] = true;
    if (!res) return;
    dv.n++;
    burst(t.x, t.y - 4, 8, r.zone === 'deep' ? 0 : 4, 30);
    if (res.kind === 'pick') {
      floatText('+' + dx.name, t.x, t.y - 10);
      toast((res.first ? '★ 처음 · 해저 도감에 · ' : '') + dx.name + ' 주웠다' + (res.sold ? ' · 바구니가 꽉 차 바로 팔았다 +' + res.sold : ''), 2000);
    } else if (res.kind === 'see') {
      toast(res.first ? '★ ' + dx.name + ' 발견 · 해저 도감에 · +' + res.coins : dx.name + ' · 오늘도 그 자리에', res.first ? 2800 : 1600);
    } else if (res.kind === 'key') {
      toast('★ 녹슨 열쇠! · 난파선 문이 열린다', 3200);
    } else if (res.kind === 'log') {
      toast('항해일지 ' + res.n + '/' + L.DIVE_LOG.length + ' · ' + L.DIVE_LOG[res.n - 1], 6500);
      if (res.done) setTimeout(function () { toast('★ 항해일지 완성 · 칭호 「' + L.diveTitles(S)[0] + '」 · 도감 해저 칸에서 다시 읽기', 4500); }, 6600);
    } else if (res.kind === 'box') {
      toast('★ 난파선 상자 · ' + (res.deco ? L.decoById(res.deco).name + (res.stored ? ' (보관함)' : ' (마당)') : '') + (res.coins ? (res.deco ? ' · ' : '') + '+' + res.coins + '코인' : ''), 3600);
    }
    refresh();
  }
  function tapDive(x, y) {
    if (!dv || dv.up > 0 || dv.dark > 0) return;
    if (dv.map) { dv.map = false; return; }
    if (hit(DIVE_MAPBTN, x, y, 3)) { dv.map = true; toast('해저 지도 ' + L.diveSeenCount(S) + '/' + L.DIVE_ROOMS.length + ' · 아무 데나 누르면 닫기 · 지도 보는 동안 산소는 그대로', 2600); return; }
    var r = L.diveRoom(dv.room), best = -1, bd = 14;
    r.things.forEach(function (t, k) { var d = Math.hypot(t.x - x, t.y - 5 - y); if (thingShown(r, k) && d < bd) { bd = d; best = k; } });
    if (best >= 0) {
      var t = r.things[best];
      if (Math.hypot(t.x - dv.x, t.y - 4 - dv.y) < 16) { diveTakeNow(r, best); return; }
      dv.want = best; dv.tx = t.x; dv.ty = t.y - 4; return;
    }
    dv.want = -1;
    // a tap near an open passage swims right through it; elsewhere the walls hold the diver in
    var ex = r.exits;
    if (ex.w && x < 26 && Math.abs(y - DIVE_MID) < DIVE_GAP + 6) { dv.tx = -6; dv.ty = DIVE_MID; return; }
    if (ex.e && x > W - 26 && Math.abs(y - DIVE_MID) < DIVE_GAP + 6) { dv.tx = W + 6; dv.ty = DIVE_MID; return; }
    if (ex.n && y < 22 && Math.abs(x - 90) < DIVE_GAP + 6) { dv.tx = 90; dv.ty = -6; return; }
    if (ex.s && y > H - 22 && Math.abs(x - 90) < DIVE_GAP + 6) { dv.tx = 90; dv.ty = H + 6; return; }
    dv.tx = Math.max(12, Math.min(W - 12, x)); dv.ty = Math.max(16, Math.min(H - 14, y));
  }

  // ---------- 옛 포구 hooks (lane ① calls these when they exist) ----------
  function drawPortExtra_dive(tt) {
    if (!L.diveOk(S)) return;
    var m = DIVE_MARK, x = m[0], y = m[1], bob = Math.round(Math.sin(tt * 2));
    // a buoy with the diver-down flag (white with a dark diagonal)
    px(x + 8, y + 2 + bob, 1, 14, 4);
    px(x + 9, y + 2 + bob, 9, 7, 4); px(x + 10, y + 3 + bob, 7, 5, 0);
    for (var k = 0; k < 7; k++) px(x + 10 + k, y + 3 + bob + Math.floor(k * 5 / 7), 1, 1, 4);
    px(x + 3, y + 16 + bob, 11, 5, 4); px(x + 4, y + 17 + bob, 9, 2, 1);
    px(x, y + 22, m[2], 1, 2);
  }
  function tapPortExtra_dive(x, y) {
    if (!L.diveOk(S) || y < DIVE_MARK[1] || !hit(DIVE_MARK, x, y, 3)) return false;   // no top pad: the dock's tap area ends at its top
    openDiveSheet();
    return true;
  }
  function openDiveSheet() {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true;
    sheetKind = 'dive'; sheetEl.hidden = false;
    renderDiveSheet();
  }
  function renderDiveSheet() {
    sheetHead('잠수');
    var say = document.createElement('p'); say.className = 'say';
    say.textContent = '밝힌 방 ' + L.diveSeenCount(S) + '/' + L.DIVE_ROOMS.length + ' · 해저 도감 ' + L.diveDexCount(S) + '/' + L.DIVE_DEX.length + ' · 항해일지 ' + L.diveLogCount(S) + '/' + L.DIVE_LOG.length;
    sheetEl.appendChild(say);
    var r = sheetRow(diveIcon('diver'), '잠수하기', '산소 ' + L.diveO2Max(S) + '초 · 기포에서 다시 채움 · 바닥나도 잃는 것 없음');
    var b = document.createElement('button'); b.type = 'button'; b.textContent = '들어가기'; b.setAttribute('aria-label', '잠수하기');
    b.addEventListener('click', function () { closeSheet(); startDive(); });
    r.appendChild(b);
    diveGearRows(renderDiveSheet);
    sheetRow(diveIcon('key'), '난파선 열쇠', S.dive && S.dive.gear.key ? '있음 · 난파선 문이 열려 있다' : '상점에 없음 · 얕은 여 안쪽 어딘가에');
  }
  // 조선소 장비 rows (큰 산소통, 손전등) into the open sheet; after = how to redraw that sheet once bought
  function diveGearRows(after) {
    ['tank', 'light'].forEach(function (id) {
      var g = L.DIVE_GEAR[id], have = !!(S.dive && S.dive.gear[id]);
      var need = g.need.map(function (q) { return L.itemInfo(q[0]).name + ' ' + Math.min(L.bagCount(S, q[0]), q[1]) + '/' + q[1]; }).join(' · ');
      var row = sheetRow(diveIcon(id), g.name, have ? (id === 'tank' ? '산소 ' + L.DIVE_O2_TANK + '초 · 긴 통로 끝까지' : '심해 동굴이 보인다') : g.coins.toLocaleString('ko-KR') + '코인 · ' + need);
      var b = document.createElement('button'); b.type = 'button'; b.textContent = have ? '있음' : '만들기';
      if (have) { b.disabled = true; b.className = 'max'; }
      else b.addEventListener('click', function () {
        var res = L.diveBuy(S, id);
        if (!res.ok) { toast(res.why === 'coins' ? '코인이 모자라요' : res.why === 'need' ? '바구니에 재료가 모자라요 · ' + need : '아직 못 만들어요', 2400); return; }
        toast('★ ' + g.name + ' · ' + (id === 'tank' ? '산소가 ' + L.DIVE_O2_TANK + '초로' : '이제 심해 동굴로'), 3000);
        refresh(); if (after) after();
      });
      row.appendChild(b);
    });
  }

  // ---------- console hooks ----------
  function addDiveHooks(FF) {
    FF.dive = {
      // FF.dive.go('d3') opens the 조선소 field if needed and dives straight into that room (its gate must be open)
      go: function (roomId) { if (!L.diveOk(S)) { S.port = S.port || { got: {}, done: {} }; S.port.done.shipyard = true; } startDive(roomId); return dv; },
      o2: function (n) { if (dv) dv.o2 = n === undefined ? L.diveO2Max(S) : n; return dv && dv.o2; },
      gear: function (id) { if (!S.dive) L.diveEnter(S, 'r0'); if (id === 'all') ['tank', 'light', 'key'].forEach(function (g) { S.dive.gear[g] = true; }); else if (id) S.dive.gear[id] = true; save(); return S.dive.gear; },
      sheet: function () { openDiveSheet(); return sheetKind; },
      tap: tapDive,
      state: function () { return dv && { room: dv.room, x: Math.round(dv.x), y: Math.round(dv.y), o2: Math.round(dv.o2 * 10) / 10, map: dv.map, dark: dv.dark, up: dv.up }; },
      seeAll: function () { if (!S.dive) L.diveEnter(S, 'r0'); L.DIVE_ROOMS.forEach(function (r) { S.dive.seen[r.id] = true; }); save(); return L.diveSeenCount(S); }
    };
  }
