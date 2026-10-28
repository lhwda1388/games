  // ---------- 마을: six resident houses, their rooms, the visit sheet (대화·선물·심부름·이야기), "지금 할 일" bar ----------
  // view 'village' = the street, view 'home' = inside vilCur's house. Logic lives in logic/village.js.
  var vilCur = null, vilSay = '', vilGiftOpen = false;
  // house boxes [x, y] (52 × 48): body x+2..x+38, its own touch on the right
  var VHOUSE = { grandma: [4, 34], fisher: [64, 34], chef: [124, 34], kid: [4, 118], teacher: [64, 118], painter: [124, 118] };
  function vilNow() { return now(); }
  function villageAttention() { return L.villageOk(S) && L.VIL_IDS.some(function (id) { return L.vilAttention(S, id, vilNow(), YTZ); }); }

  // ---------- pre-rendered street ----------
  var bgVillage = document.createElement('canvas'); bgVillage.width = W; bgVillage.height = H;
  (function paintVillage() {
    var saved = ctx; ctx = bgVillage.getContext('2d');
    px(0, 0, W, H, 0);
    for (var k = 0; k < 220; k++) px(Math.floor(hash(k * 7 + 5) * W), 26 + Math.floor(hash(k * 13 + 1) * (H - 26)), 1, 1, k % 4 ? 1 : 2);
    // the lane between the two rows, and the path down to the bottom edge
    px(0, 92, W, 16, 1); for (var x = 2; x < W; x += 9) px(x, 99, 4, 1, 2);
    px(0, 92, W, 1, 2); px(0, 107, W, 1, 2);
    px(84, 168, 12, 32, 1); px(84, 168, 1, 32, 2); px(95, 168, 1, 32, 2);
    // a well in the middle of the lane, small trees between the houses
    px(56, 172, 14, 8, 2); px(57, 171, 12, 1, 4); px(56, 180, 14, 1, 4); px(58, 164, 1, 8, 4); px(67, 164, 1, 8, 4); px(57, 163, 12, 2, 4);
    [[60, 88], [120, 88], [60, 172], [120, 172], [174, 100]].forEach(function (t, i) {
      px(t[0], t[1] - 4, 2, 5, 4);
      px(t[0] - 3, t[1] - 10, 8, 6, 3); px(t[0] - 2, t[1] - 12, 6, 2, 3); px(t[0] - 1, t[1] - 9, 2, 1, i % 2 ? 2 : 4);
    });
    ctx = saved;
  })();

  // ---------- houses: a shared body, each with its own roof and touch ----------
  var JAR = ['.444.', '42224', '43334', '43334', '.444.'];
  function houseBody(x, y, wall, roof) {
    // roof rows widen from the ridge
    for (var j = 0; j < 12; j++) { var w = 16 + j * 2; px(x + 20 - w / 2, y + j, w, 1, roof); }
    px(x + 2, y + 12, 36, 24, 4); px(x + 3, y + 13, 34, 22, wall);
    px(x + 16, y + 22, 8, 14, 4); px(x + 17, y + 23, 6, 13, 3); px(x + 21, y + 29, 1, 1, 0);   // door
  }
  function houseWindow(x, y, lit) {
    px(x, y, 8, 7, 4); px(x + 1, y + 1, 6, 5, lit ? 0 : 3); px(x + 4, y + 1, 1, 5, 4);
  }
  var DRAW_HOUSE = {
    grandma: function (x, y, tt) {
      houseBody(x, y, 1, 3);
      for (var j = 1; j < 12; j += 3) for (var i = 0; i < 40; i += 4) px(x + i, y + j, 1, 1, 4);   // roof tiles
      spr(JAR, x + 40, y + 30); spr(JAR, x + 45, y + 31); spr(['.44.', '4224', '4334', '.44.'], x + 42, y + 25);
    },
    fisher: function (x, y, tt) {
      px(x, y + 6, 40, 3, 4); px(x + 1, y + 9, 38, 3, 3);                                           // flat shed roof
      px(x + 2, y + 12, 36, 24, 4); px(x + 3, y + 13, 34, 22, 2);
      for (var k = y + 15; k < y + 35; k += 4) px(x + 3, k, 34, 1, 3);                                // planks
      px(x + 16, y + 22, 8, 14, 4); px(x + 17, y + 23, 6, 13, 1);
      // rod leaning on the wall, the line swaying, a net
      for (var r = 0; r < 26; r++) px(x + 40 + Math.floor(r / 3), y + 36 - r, 1, 1, 4);
      var sw = Math.round(Math.sin(tt * 1.5) * 1);
      for (var l = 0; l < 10; l++) px(x + 48 + sw, y + 11 + l, 1, 1, 3);
      for (var n = 0; n < 4; n++) { px(x + 42 + n * 2, y + 30, 1, 6, 3); px(x + 41, y + 30 + n * 2, 8, 1, 3); }
    },
    chef: function (x, y, tt) {
      houseBody(x, y, 0, 4);
      px(x + 6, y - 6, 28, 7, 4); px(x + 7, y - 5, 26, 5, 0);                                          // sign board: a bowl
      px(x + 15, y - 3, 10, 1, 4); px(x + 16, y - 2, 8, 1, 4); px(x + 18, y - 1, 4, 1, 4);
      for (var s = 0; s < 3; s++) if ((Math.floor(tt * 2) + s) % 3) px(x + 17 + s * 3, y - 9 - (s % 2), 1, 2, 3);
      for (var a = 0; a < 36; a += 4) px(x + 2 + a, y + 12, 4, 4, (a / 4) % 2 ? 0 : 4);                // striped awning
      px(x + 40, y + 28, 10, 8, 4); px(x + 41, y + 29, 8, 6, 2); px(x + 42, y + 26, 6, 2, 3);          // pot on a crate
    },
    kid: function (x, y, tt) {
      houseBody(x, y, 0, 3);
      for (var j = 2; j < 12; j += 2) px(x + 20 - (8 + j), y + j, 16 + j * 2, 1, 4);                   // dark-blue-ish roof (striped)
      px(x + 42, y + 32, 5, 4, 4); px(x + 43, y + 31, 3, 1, 4); px(x + 43, y + 33, 1, 1, 0);           // ball
      var kx = x + 44 + Math.round(Math.sin(tt) * 2), ky = y + 2;                                     // kite on a string
      px(kx, ky, 1, 1, 4); px(kx - 1, ky + 1, 3, 1, 4); px(kx - 2, ky + 2, 5, 1, 3); px(kx - 1, ky + 3, 3, 1, 4); px(kx, ky + 4, 1, 1, 4);
      for (var q = 0; q < 6; q++) px(kx - Math.floor(q / 2), ky + 5 + q * 4, 1, 3, 3);
    },
    teacher: function (x, y, tt) {
      houseBody(x, y, 1, 2);
      px(x + 18, y - 4, 4, 4, 4); px(x + 19, y - 3, 2, 2, 2);                                          // little bell tower
      px(x + 44, y + 4, 1, 32, 4);                                                                     // flag pole
      var fw = Math.floor(tt * 3) % 2;
      px(x + 45, y + 4, 6, 4, 4); px(x + 45 + fw, y + 5, 4, 2, 0);
      for (var b = 0; b < 3; b++) px(x + 40, y + 32 - b * 2, 9 - b * 2, 2, b % 2 ? 2 : 4);              // books by the door
    },
    painter: function (x, y, tt) {
      houseBody(x, y, 0, 2);
      px(x + 10, y + 3, 20, 6, 4); px(x + 11, y + 4, 18, 4, 0); px(x + 20, y + 4, 1, 4, 4);           // skylight
      // easel with a canvas outside
      px(x + 41, y + 22, 1, 14, 4); px(x + 49, y + 22, 1, 14, 4); px(x + 45, y + 18, 1, 18, 4);
      px(x + 40, y + 20, 11, 9, 4); px(x + 41, y + 21, 9, 7, 0);
      px(x + 42, y + 25, 7, 1, 2); px(x + 43, y + 23, 3, 2, 3); px(x + 46, y + 22, 2, 2, 1);
    }
  };
  var faceCache = {};
  function faceOf(id) { return faceCache[id] || (faceCache[id] = faceCanvas(id)); }
  // a tiny speech mark above the roof: '!' = something to do, an envelope = the story's next step is here
  function markAbove(x, y, story, tt) {
    var b = Math.round(Math.sin(tt * 4) * 1);
    px(x - 4, y - 9 + b, 9, 8, 4); px(x - 3, y - 8 + b, 7, 6, 0); px(x, y - 1 + b, 1, 2, 4);
    if (story) { px(x - 2, y - 7 + b, 5, 4, 4); px(x - 1, y - 6 + b, 3, 2, 0); px(x, y - 5 + b, 1, 1, 4); }
    else { px(x, y - 7 + b, 1, 3, 4); px(x, y - 3 + b, 1, 1, 4); }
  }
  function drawVillage(tt, dt) {
    var t = vilNow(), e = curEnv(t), night = e.phase === 'night', cur = L.storyNow(S);
    ctx.drawImage(bgVillage, 0, 0);
    drawSky(tt, e.phase);
    L.VIL_IDS.forEach(function (id) {
      var p = VHOUSE[id], away = L.residentAway(id, t, YTZ);
      DRAW_HOUSE[id](p[0], p[1], tt);
      houseWindow(p[0] + 6, p[1] + 18, !away);
      if (id !== 'fisher') houseWindow(p[0] + 27, p[1] + 18, !away && !night);
      if (away) { px(p[0] + 17, p[1] + 26, 6, 4, 0); px(p[0] + 18, p[1] + 27, 4, 1, 4); px(p[0] + 18, p[1] + 29, 3, 1, 3); }   // closed sign
      else spr(FACE[id], p[0] + 26, p[1] + 39);                                                                             // standing by the door
      var storyHere = !!(cur && cur.step.at === id);
      if (!away && (storyHere || L.vilAttention(S, id, t, YTZ))) markAbove(p[0] + 20, p[1] - (id === 'chef' ? 8 : 0), storyHere, tt);
    });
    drawYardWeather(tt, e.weather);
    if (night || e.phase === 'evening') {
      ctx.globalAlpha = night ? 0.34 : 0.12; px(0, 0, W, H, 4); ctx.globalAlpha = 1;
      if (night) { drawStars(tt); L.VIL_IDS.forEach(function (id) { var p = VHOUSE[id]; if (!L.residentAway(id, t, YTZ)) px(p[0] + 7, p[1] + 19, 6, 5, 0); }); }
    }
  }
  function tapVillage(x, y) {
    var hitId = null;
    L.VIL_IDS.forEach(function (id) { var p = VHOUSE[id]; if (hit([p[0], p[1] - 8, 52, 58], x, y)) hitId = id; });
    if (hitId) { enterHome(hitId); return; }
    var cur = L.storyNow(S);
    toast(cur ? '지금 할 일 · ' + cur.step.todo : '집을 누르면 들어가요 · 창이 밝으면 집에 있어요', 2600);
  }
  function enterHome(id) {
    vilCur = id; vilSay = ''; vilGiftOpen = false;
    goScene('home');
    var d = L.residentById(id), away = L.residentAway(id, vilNow(), YTZ);
    toast(away ? d.name + ' · ' + away : d.name + ' · ' + L.VIL[id].home + ' · 눌러서 말 걸기', 2400);
  }

  // ---------- rooms: same frame, furnished by who lives there ----------
  var VDOOR = [78, 186, 24, 8];
  var bookRows = function (x, y, w, h) {
    px(x, y, w, h, 4);
    for (var r = 0; r < h - 2; r += 7) for (var i = 1; i < w - 1; i += 2) px(x + i, y + 1 + r, 1, 5 - (i % 3 ? 0 : 1), (i * 7 + r) % 3 ? 1 : 3);
  };
  var DRAW_ROOM = {
    grandma: function (tt) {
      for (var k = 0; k < 3; k++) spr(['..444..', '.42224.', '4333334', '4333334', '4333334', '.43334.', '..444..'], 6 + k * 10, 100);   // 장독
      px(4, 107, 32, 2, 3);
      px(120, 120, 34, 20, 3); for (var q = 0; q < 34; q += 6) px(120 + q, 120, 3, 20, 2);              // knitted blanket
      px(66, 146, 14, 8, 4); px(67, 147, 12, 6, 2);                                                       // yarn basket, ball and needles
      px(70, 142, 5, 5, 1); px(71, 143, 3, 1, 3); px(69, 139, 1, 6, 4); px(76, 139, 1, 6, 4);
      px(130, 30, 22, 26, 4); px(131, 31, 20, 24, 0); for (var c = 0; c < 4; c++) px(133 + c * 5, 40, 3, 3, 2);   // calendar
    },
    fisher: function (tt) {
      for (var r = 0; r < 3; r++) for (var j = 0; j < 40; j++) px(10 + r * 8 + Math.floor(j / 4), 30 + j, 1, 1, 4);   // rods on the wall
      px(8, 70, 34, 2, 4);
      px(120, 26, 50, 26, 4); px(122, 28, 46, 22, 0);                                                     // 어탁
      var c = faceCache.etaku || (faceCache.etaku = fishCanvas('carp'));
      ctx.imageSmoothingEnabled = false; ctx.drawImage(c, 126, 31, 38, 16);
      for (var n = 0; n < 6; n++) { px(126 + n * 6, 130, 1, 22, 3); px(124, 130 + n * 4, 34, 1, 3); }       // net
      px(20, 150, 20, 10, 4); px(21, 151, 18, 3, 2);                                                      // tackle box
    },
    chef: function (tt) {
      px(10, 110, 70, 12, 4); px(11, 111, 68, 4, 1);                                                      // counter
      [18, 44].forEach(function (x, i) {
        px(x, 100, 16, 10, 4); px(x + 1, 101, 14, 3, 2);
        for (var s = 0; s < 3; s++) if ((Math.floor(tt * 2) + s + i) % 3) px(x + 4 + s * 4, 92 - (s % 2) * 2, 1, 5, 2);
      });
      px(120, 24, 48, 34, 4); px(122, 26, 44, 30, 3);                                                     // menu board
      for (var m = 0; m < 4; m++) { px(126, 31 + m * 6, 26 - (m % 2) * 8, 1, 0); px(158, 31 + m * 6, 4, 1, 0); }
      [24, 44, 64].forEach(function (x) { px(x, 132, 8, 3, 4); px(x + 3, 135, 2, 10, 4); });              // stools
    },
    kid: function (tt) {
      [[14, 150], [22, 150], [18, 144]].forEach(function (b, i) { px(b[0], b[1], 8, 6, 4); px(b[0] + 1, b[1] + 1, 6, 4, i % 2 ? 0 : 2); });   // blocks
      var by = 148 - Math.abs(Math.round(Math.sin(tt * 3) * 4));
      px(140, by, 8, 8, 4); px(141, by + 1, 6, 6, 0); px(143, by + 1, 2, 6, 4);                          // bouncing ball
      px(120, 112, 40, 18, 4); px(121, 113, 38, 8, 0); px(121, 121, 38, 8, 2);                            // small bed
      [[14, 30], [44, 36], [126, 30]].forEach(function (d, i) {                                         // crayon drawings
        px(d[0], d[1], 22, 18, 4); px(d[0] + 1, d[1] + 1, 20, 16, 0);
        px(d[0] + 4, d[1] + 10 - i, 6, 6, 3); px(d[0] + 12, d[1] + 5, 5, 5, i % 2 ? 2 : 4);
      });
      px(56, 150, 18, 4, 4); px(60, 144, 2, 6, 4); px(61, 144, 6, 4, 2);                                   // toy boat
    },
    teacher: function (tt) {
      bookRows(4, 22, 40, 64); bookRows(136, 22, 40, 64);
      px(60, 26, 60, 34, 4); px(62, 28, 56, 30, 3);                                                        // chalkboard
      px(68, 36, 20, 1, 1); px(68, 42, 32, 1, 1); px(68, 48, 14, 1, 1);
      px(60, 120, 50, 4, 4); px(64, 124, 2, 20, 4); px(104, 124, 2, 20, 4);                                // desk
      px(70, 112, 8, 8, 4); px(71, 113, 6, 6, 1); px(73, 113, 1, 6, 3); px(73, 120, 2, 1, 4);              // globe
      px(92, 116, 10, 4, 0); px(92, 115, 10, 1, 4);                                                       // open book
    },
    painter: function (tt) {
      [[10, 26, 30, 22], [46, 30, 22, 18], [130, 24, 40, 28]].forEach(function (f, i) {                  // paintings
        px(f[0], f[1], f[2], f[3], 4); px(f[0] + 2, f[1] + 2, f[2] - 4, f[3] - 4, i === 1 ? 1 : 0);
        for (var x = 0; x < f[2] - 4; x++) px(f[0] + 2 + x, f[1] + f[3] - 6 - Math.round(Math.sin((x + i * 5) / 4) * 3), 1, 1, 3);
      });
      px(124, 100, 2, 50, 4); px(150, 100, 2, 50, 4); px(137, 96, 2, 54, 4);                                // easel
      px(120, 100, 36, 28, 4); px(122, 102, 32, 24, 0);
      px(126, 116, 24, 1, 3); px(130, 108, 6, 6, 2); px(140, 106, 8, 8, 1);
      [16, 26, 36].forEach(function (x, i) { px(x, 146, 7, 8, 4); px(x + 1, 147, 5, 3, i + 1); });          // paint jars
    }
  };
  var VWALL = { grandma: 1, fisher: 2, chef: 0, kid: 0, teacher: 1, painter: 0 };
  function drawHome(tt, dt) {
    var id = vilCur, t = vilNow(), e = curEnv(t), away = L.residentAway(id, t, YTZ), k;
    px(0, 0, W, 86, VWALL[id]);
    for (k = 0; k < 140; k++) px(Math.floor(hash(k * 3 + 7) * W), Math.floor(hash(k * 5 + id.length) * 84), 1, 1, VWALL[id] ? 0 : 1);
    px(0, 84, W, 3, 4);
    for (k = 87; k < H; k++) px(0, k, W, 1, (k - 87) % 9 === 0 ? 2 : 1);
    // window with today's sky
    px(84, 12, 26, 20, 4); px(85, 13, 24, 18, e.phase === 'night' ? 3 : e.phase === 'evening' ? 1 : 0); px(97, 13, 1, 18, 4);
    DRAW_ROOM[id](tt);
    // the resident in the middle of the room, or a note on the floor
    if (!away) {
      ctx.imageSmoothingEnabled = false;
      var bob = Math.round(Math.sin(tt * 2) * 1);
      ctx.drawImage(faceOf(id), 0, 0, 12, 12, 76, 104 + bob, 36, 36);
      px(84, 141, 22, 2, 2);
    } else {
      px(84, 128, 20, 14, 4); px(85, 129, 18, 12, 0); for (k = 0; k < 3; k++) px(87, 132 + k * 3, 14 - k * 3, 1, 3);
    }
    px(VDOOR[0], VDOOR[1], VDOOR[2], VDOOR[3], 4); px(VDOOR[0] + 1, VDOOR[1] + 1, VDOOR[2] - 2, VDOOR[3] - 1, 2);
    if (e.phase === 'night') { ctx.globalAlpha = 0.18; px(0, 0, W, H, 4); ctx.globalAlpha = 1; }
  }
  function tapHome(x, y) {
    if (hit(VDOOR, x, y, 4)) { goScene('village'); return; }
    openVil();
  }

  // ---------- visit sheet ----------
  function openVil() {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true;
    sheetKind = 'vil'; sheetEl.hidden = false;
    renderVil();
  }
  function upsToast(ups, pre) {
    var top = ups.length ? ups[ups.length - 1].lv : 0;
    var msg = pre + (top ? ' · ★ 친밀도 ' + top + '단계 · 편지가 왔어요 (바구니 › 주민)' : '');
    toast(msg, top ? 3600 : 2400);
    if (top) burst(94, 110, 14, 0, 60);
  }
  var VWHY = { away: '지금은 집에 없어요', talked: '오늘은 이미 이야기했어요', gifted: '오늘은 이미 선물했어요', item: '바구니에 없어요', here: '여기서 할 일이 아니에요', none: '부탁이 없어요' };
  function renderVil() {
    var id = vilCur, d = L.residentById(id), V = L.VIL[id], t = vilNow(), away = L.residentAway(id, t, YTZ);
    var lv = L.friendLevel(S, id), keep = sheetEl.scrollTop;
    sheetHead(d.name);
    var say = document.createElement('p'); say.className = 'say';
    say.textContent = away ? '문에 쪽지: ' + away : vilSay || (d.name.split(' ').pop() + ': ' + V.talk[Math.min(4, lv)][0]);
    sheetEl.appendChild(say);
    var h3 = document.createElement('h3'); h3.textContent = V.home;
    var hb = document.createElement('b'); hb.textContent = '친밀도 ' + lv + '단계'; h3.appendChild(hb); sheetEl.appendChild(h3);
    // story step here
    var cur = L.storyNow(S);
    if (cur && cur.step.at === id) {
      var need = cur.step.need, have = need ? L.bagCount(S, need[0]) : 0;
      var r0 = sheetRow(need ? itemIcon(need[0]) : letterIcon(), '이야기 · ' + cur.story.name,
        cur.step.todo + (need ? ' · 가진 것 ' + have + '/' + need[1] : '') + ' · ' + (cur.k + 1) + '/' + cur.story.steps.length + '단계');
      r0.appendChild(vBtn(need ? '건네기' : '전하기', !!away || (need && have < need[1]), function () {
        var res = L.storyStep(S, id, vilNow(), YTZ);
        if (!res.ok) { toast(VWHY[res.why] || '아직이에요'); return; }
        vilSay = res.say;
        if (res.done) {
          var st = L.storyById(res.story), g = res.gift;
          upsToast(res.ups, '★ 이야기 완결 · ' + st.name + ' · +' + (res.coins + g.coins) + '코인' + (g.coins ? '' : ' · ' + giftName(g) + ' 받음'));
          burst(94, 100, 22, 0, 80);
        } else upsToast(res.ups, '다음: ' + L.storyNow(S).step.todo);
        refresh(); renderVil();
      }, '이야기 진행'));
    }
    // talk
    var talked = !L.canTalk(S, id, t, YTZ) && !away;
    var r1 = sheetRow(faceCanvas(id), '대화', talked ? '오늘은 이야기했어요 · 내일 또' : '하루 한 번 · 친밀도 +' + L.VIL_TALK_PTS);
    r1.appendChild(vBtn('말 걸기', !!away || talked, function () {
      var res = L.vilTalk(S, id, vilNow(), YTZ);
      if (!res.ok) { toast(VWHY[res.why]); return; }
      vilSay = d.name.split(' ').pop() + ': ' + res.text;
      upsToast(res.ups, res.hint ? '비밀 힌트를 들었다 · 도감 기록' : '친밀도 +' + res.pts);
      refresh(); renderVil();
    }, d.name + '에게 말 걸기'));
    // gift
    var gifted = !L.canGift(S, id, t, YTZ) && !away, known = V.likes.slice(0, 1 + lv);
    var r2 = sheetRow(itemIcon(known[0]), '선물', gifted ? '오늘은 선물했어요 · 내일 또' : '좋아해요: ' + known.map(function (x) { return L.itemInfo(x).name; }).join('·') + (known.length < V.likes.length ? '…' : ''));
    r2.appendChild(vBtn(vilGiftOpen ? '접기' : '고르기', !!away || gifted || !S.bag.length, function () { vilGiftOpen = !vilGiftOpen; renderVil(); }, '선물 고르기'));
    if (vilGiftOpen && !away && !gifted) {
      var seen = {};
      S.bag.forEach(function (e) {
        if (seen[e.id]) return; seen[e.id] = true;
        var it = L.itemInfo(e.id), liked = known.indexOf(e.id) >= 0;
        var r = sheetRow(itemIcon(e.id), it.name + (liked ? ' ♥' : ''), L.bagCount(S, e.id) + '개 있음', 'gift');
        r.appendChild(vBtn('주기', false, function () {
          var res = L.vilGift(S, id, e.id, vilNow(), YTZ);
          if (!res.ok) { toast(VWHY[res.why]); return; }
          vilGiftOpen = false;
          vilSay = d.name.split(' ').pop() + ': ' + res.text;
          upsToast(res.ups, res.kind === 'like' ? '아주 좋아해요 · 친밀도 +' + res.pts : res.pts ? '친밀도 +' + res.pts : '마음만 받았어요');
          refresh(); renderVil();
        }, it.name + ' 선물하기'));
      });
    }
    // errand
    var er = away ? null : L.errandFor(S, id, t, YTZ);
    if (er) {
      var info = L.itemInfo(er.id), hv = L.bagCount(S, er.id);
      var r3 = sheetRow(itemIcon(er.id), '부탁 · ' + info.name + ' ' + er.n + '개', '가진 것 ' + hv + '/' + er.n + ' · 보상 ' + L.errandReward(er) + '코인 · 기한 없음');
      var acts = document.createElement('div'); acts.className = 'acts'; r3.appendChild(acts);
      acts.appendChild(vBtn('건네기', hv < er.n, function () {
        var res = L.errandDone(S, id, vilNow(), YTZ);
        if (!res.ok) { toast(VWHY[res.why]); return; }
        vilSay = d.name.split(' ').pop() + ': ' + V.sayLike;
        floatText('+' + res.coins, 94, 100);
        upsToast(res.ups, '부탁 완료 · +' + res.coins + '코인');
        refresh(); renderVil();
      }, '부탁 들어주기'));
      acts.appendChild(vBtn('다음에', false, function () { L.errandDecline(S, id, vilNow(), YTZ); toast('괜찮아요, 다음에 부탁할게요', 1800); refresh(); renderVil(); }, '부탁 거절하기'));
    }
    var p = document.createElement('p'); p.className = 'note';
    p.textContent = '대화·선물은 하루 한 번 · 싫어하는 걸 줘도 손해는 없어요 · 친해지면 편지와 선물이 와요';
    sheetEl.appendChild(p);
    sheetEl.scrollTop = keep;
  }
  function vBtn(text, off, fn, label) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = text; b.disabled = !!off;
    if (off) b.className = 'max';
    if (label) b.setAttribute('aria-label', label);
    b.addEventListener('click', fn);
    return b;
  }
  function letterIcon() {
    var c = document.createElement('canvas'); c.width = 12; c.height = 12;
    spr(['4444444444', '4044444404', '4004444004', '4000440004', '4000000004', '4444444444'], 1, 3, false, c.getContext('2d'));
    return c;
  }

  // ---------- "지금 할 일" bar (마을 and rooms) and the line in the 주민 tab ----------
  var vilBar = document.createElement('button');
  vilBar.type = 'button'; vilBar.id = 'vilBar'; vilBar.hidden = true;
  app.appendChild(vilBar);
  vilBar.addEventListener('click', function () {
    var cur = L.storyNow(S);
    if (!cur) return;
    if (view === 'home' && vilCur === cur.step.at) openVil(); else enterHome(cur.step.at);
  });
  function storyText() {
    var cur = L.storyNow(S);
    if (cur) return cur.step.todo;
    var lk = L.storyLocked(S);
    if (lk) return '다음 이야기는 ' + Object.keys(lk.req).map(function (r) { return L.residentById(r).name + ' ' + lk.req[r] + '단계'; }).join('·') + '에 열려요';
    return '이야기를 모두 마쳤어요';
  }
  var vilBarKey = '';
  function renderVilBar() {
    var on = view === 'village' || view === 'home', txt = on ? storyText() : '', key = on + txt;
    if (key === vilBarKey) return;
    vilBarKey = key;
    vilBar.hidden = !on;
    if (!on) return;
    vilBar.innerHTML = '';
    var b = document.createElement('b'); b.textContent = '지금 할 일';
    var sm = document.createElement('span'); sm.textContent = txt;
    vilBar.appendChild(b); vilBar.appendChild(sm);
    vilBar.setAttribute('aria-label', '지금 할 일: ' + txt);
  }
  // called by goScene: canvas label + bar
  function sceneVillage(sc) {
    if (sc === 'village') cv.setAttribute('aria-label', '마을');
    if (sc === 'home' && vilCur) cv.setAttribute('aria-label', L.residentById(vilCur).name + ' 집 안');
    if (sc !== 'home' && sheetKind === 'vil') closeSheet();
    renderVilBar();
  }
  function tickVillageUI(t) {
    renderVilBar();
    if (sheetKind === 'vil' && !sheetEl.hidden && Math.floor(t / 1000 / SPEED) % 20 === 0) renderVil();
  }
  // one line under the 단골 주민 heading in the 바구니 › 주민 tab
  function renderStoryLine(el) {
    if (!L.villageOk(S)) return;
    var p = document.createElement('p'); p.className = 'note todo';
    p.textContent = '지금 할 일 · ' + storyText() + ' (이동 › 마을)';
    el.appendChild(p);
  }

  // ---------- console hooks ----------
  function addVillageHooks(FF) {
    FF.village = function () { if (!L.villageOk(S)) S.rep = Math.max(S.rep, L.VILLAGE_REP); goScene('village'); refresh(); return L.storyNow(S) && L.storyNow(S).step.todo; };
    FF.visit = function (id) { if (!L.VIL[id]) return L.VIL_IDS; if (!L.villageOk(S)) S.rep = Math.max(S.rep, L.VILLAGE_REP); enterHome(id); openVil(); return L.residentAway(id, vilNow(), YTZ) || 'home'; };
    FF.vilReset = function () { if (S.vil) { S.vil.day = -1; S.vil.ed = {}; } refresh(); return S.vil; };
  }
