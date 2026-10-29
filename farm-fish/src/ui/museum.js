  // ---------- 박물관 (stage 7): the building in the 마을, view 'museum' with six wall cases, the curator, the donate sheet ----------
  // A case shows one small mark per id of its room: filled when donated, a faint outline while empty. Logic: logic/museum.js.
  var musRoom = null, musSay = '', musAttnAt = 0, musAttn = false;
  var MUS_AT = [128, 169, 50, 30];   // the building on the street (bottom right, below the 화실)
  var MUS_DOOR = [78, 186, 24, 8];
  var MUS_CURATOR = [70, 148, 18, 34];
  // 4×4..5×5 marks, one per room ('4' ink, '3' dark)
  var MUS_GLYPH = {
    fish:    ['.44.4', '43444', '.44.4'],
    bug:     ['4...4', '.444.', '43434', '.444.'],
    fossil:  ['.444.', '4...4', '4.4.4', '4..44', '.44..'],
    mineral: ['..4..', '.434.', '43334', '.434.', '..4..'],
    star:    ['..4..', '..4..', '44344', '..4..', '.4.4.'],
    sea:     ['.444.', '4.4.4', '44444', '..4..']
  };
  var MUS_FROM = { bag: '바구니에서 하나', bugs: '곤충 기록으로 · 도감은 그대로', fossil: '완성한 화석 기록으로', sky: '관측 기록으로 · 도감은 그대로' };
  var MUS_WHY = { closed: '박물관이 아직 닫혀 있어요', room: '이 전시실 것이 아니에요', got: '이미 전시 중이에요', need: '지금 가진 게 없어요' };

  function musCase(k) { return [4 + (k % 3) * 58, 34 + Math.floor(k / 3) * 54, 54, 52]; }   // below the corner clock and 이동 button
  function musGrid(n) {
    var cols = Math.max(1, Math.ceil(Math.sqrt(n * 50 / 40))), rows = Math.ceil(n / cols);
    return { cols: cols, cell: Math.max(4, Math.min(Math.floor(50 / cols), Math.floor(40 / rows))) };
  }
  function musGlyph(r, x, y, sc) {
    MUS_GLYPH[r].forEach(function (row, j) {
      for (var i = 0; i < row.length; i++) if (row[i] !== '.') px(x + i * sc, y + j * sc, sc, sc, +row[i]);
    });
  }
  function musName(r, id) {
    var from = L.MUSEUM_ROOMS[r].from;
    return from === 'bag' ? L.itemInfo(id).name : from === 'bugs' ? L.bugById(id).name : from === 'fossil' ? L.fossilById(id).name : L.starById(id).name;
  }
  function musIcon(r, id) {
    var from = L.MUSEUM_ROOMS[r].from;
    if (from === 'bag') return itemIcon(id);
    if (from === 'bugs') return bugCanvas(id, 16, 12);
    if (from === 'fossil') return fossilIcon(id);
    return starIcon(id);
  }
  function roomIcon(r) {
    var c = document.createElement('canvas'); c.width = 12; c.height = 12;
    var saved = ctx; ctx = c.getContext('2d');
    try { var g = MUS_GLYPH[r]; musGlyph(r, Math.floor((12 - g[0].length * 2) / 2), Math.floor((12 - g.length * 2) / 2), 2); } finally { ctx = saved; }
    return c;
  }
  // anything to donate right now? (checked once a second: a mark over the building, a dot on 마을)
  function museumAttention() {
    var p = performance.now();
    if (p - musAttnAt > 1000) {
      musAttnAt = p;
      musAttn = L.museumOk(S) && L.MUSEUM_ROOM_IDS.some(function (r) { return L.donatable(S, r).length > 0; });
    }
    return musAttn;
  }

  // ---------- the building on the 마을 street ----------
  function drawMuseumHouse(tt) {
    var x = MUS_AT[0], y = MUS_AT[1], open = L.museumOk(S);
    for (var j = 0; j < 8; j++) px(x + 25 - (4 + j * 3), y + j, 8 + j * 6, 1, 4);         // pediment
    px(x + 22, y + 3, 6, 3, 0);                                                            // round window in it
    px(x + 2, y + 8, 46, 2, 4); px(x + 3, y + 10, 44, 15, 1);
    for (var c = 0; c < 5; c++) { px(x + 5 + c * 9, y + 10, 4, 15, 0); px(x + 5 + c * 9, y + 10, 1, 15, 3); }   // columns
    px(x + 21, y + 14, 8, 11, 4); px(x + 22, y + 15, 6, 10, open ? 3 : 2);                 // door
    if (!open) { px(x + 20, y + 17, 10, 2, 3); px(x + 20, y + 21, 10, 2, 3); }               // boarded
    px(x, y + 25, 50, 2, 4); px(x + 2, y + 27, 46, 2, 3);                                  // steps
    if (open && museumAttention()) markAbove(x + 25, y - 1, false, tt);
  }
  function tapMuseumHouse(x, y) {
    if (!hit(MUS_AT, x, y, 2)) return false;
    if (!L.museumOk(S)) { toast('박물관 · 곡괭이·망원경·섬의 배 중 하나가 생기면 문을 열어요', 3200); return true; }
    enterMuseum();
    return true;
  }
  function enterMuseum() {
    musSay = '';
    goScene('museum');
    var t = L.museumTotal(S);
    toast('박물관 · 기증 ' + t.n + '/' + t.m + ' · 진열장을 누르면 기증', 2600);
  }

  // ---------- inside: six wall cases, the curator, the door ----------
  function drawMuseum(tt) {
    var e = curEnv(now()), k;
    px(0, 0, W, 142, 1);
    for (k = 0; k < 9; k++) px(k * 22 + 1, 28, 1, 114, 2);                                 // wall panels
    for (k = 0; k < 12; k++) px(90 - (12 + k * 5), 4 + k, 24 + k * 10, 1, k < 2 ? 4 : 2);   // pediment over the cases
    px(84, 9, 12, 4, 0); px(0, 26, W, 2, 4);
    px(0, 140, W, 3, 4);
    for (k = 143; k < H; k++) px(0, k, W, 1, (k - 143) % 9 === 0 ? 2 : 0);
    for (k = 0; k < 6; k++) px(6 + k * 32, 143, 1, H - 143, 1);
    L.MUSEUM_ROOM_IDS.forEach(function (r, i) {
      var c = musCase(i), room = L.MUSEUM_ROOMS[r], g = musGrid(room.ids.length), gl = MUS_GLYPH[r];
      var sc = Math.max(1, Math.floor((g.cell - 1) / Math.max(gl[0].length, gl.length)));
      var gw = gl[0].length * sc, gh = gl.length * sc, cnt = L.museumCount(S, r);
      px(c[0], c[1], c[2], c[3], 4); px(c[0] + 1, c[1] + 1, c[2] - 2, 42, 0);              // frame, glass
      room.ids.forEach(function (id, j) {
        var cx = c[0] + 2 + (j % g.cols) * g.cell, cy = c[1] + 2 + Math.floor(j / g.cols) * g.cell;
        if (L.museumGot(S, r, id)) musGlyph(r, cx + Math.floor((g.cell - gw) / 2), cy + Math.floor((g.cell - gh) / 2), sc);
        else {                                                                              // empty: a faint outline
          var w = g.cell - 1;
          px(cx, cy, w, 1, 1); px(cx, cy + w - 1, w, 1, 1); px(cx, cy, 1, w, 1); px(cx + w - 1, cy, 1, w, 1);
        }
      });
      // name plate with a fill bar; a finished room gets a rosette
      px(c[0] + 1, c[1] + 43, c[2] - 2, 8, 3);
      px(c[0] + 4, c[1] + 46, c[2] - 8, 3, 2); px(c[0] + 4, c[1] + 46, Math.round((c[2] - 8) * cnt.n / cnt.m), 3, 0);
      if (S.museum && S.museum.done[r]) {
        var b = Math.floor(tt * 2) % 2;
        px(c[0] + c[2] - 8, c[1] - 2, 7, 7, 4); px(c[0] + c[2] - 7, c[1] - 1, 5, 5, b ? 0 : 1); px(c[0] + c[2] - 5, c[1] + 1, 1, 1, 4);
      }
    });
    // the curator: round glasses, a bow tie, a little bob
    var cx0 = MUS_CURATOR[0], cy0 = MUS_CURATOR[1] + Math.round(Math.sin(tt * 2) * 1);
    spr(['...4444...', '..422224..', '..400004..', '.44404044.', '..400004..', '..400004..', '...4444...',
         '..433334..', '.43344334.', '.43334334.', '.43333334.', '.43333334.', '..433334..', '..44..44..', '..44..44..'], cx0 + 4, cy0 + 6);
    px(cx0 + 7, cy0 + 14, 4, 1, 0);
    px(cx0 + 2, cy0 + 22, 14, 2, 2);
    // a small stand with the visitor book beside him
    px(118, 160, 22, 3, 4); px(127, 163, 4, 16, 4); px(122, 179, 14, 2, 4); px(120, 157, 18, 3, 0); px(129, 157, 1, 3, 3);
    px(MUS_DOOR[0], MUS_DOOR[1], MUS_DOOR[2], MUS_DOOR[3], 4); px(MUS_DOOR[0] + 1, MUS_DOOR[1] + 1, MUS_DOOR[2] - 2, MUS_DOOR[3] - 1, 2);
    if (e.phase === 'night') { ctx.globalAlpha = 0.18; px(0, 0, W, H, 4); ctx.globalAlpha = 1; }
  }
  function tapMuseum(x, y) {
    if (hit(MUS_DOOR, x, y, 4)) { goScene('village'); return; }
    for (var i = 0; i < 6; i++) if (hit(musCase(i), x, y, 2)) { openMuseum(L.MUSEUM_ROOM_IDS[i]); return; }
    if (hit(MUS_CURATOR, x, y, 6)) { musSay = L.curatorLine(S, gameDay()); toast(musSay, 3200); }
    openMuseum(null);
  }
  function gameDay() { return L.gameClock(now(), YTZ).day; }

  // ---------- donate sheet: rooms with counts, the open room's donatable things ----------
  function openMuseum(room) {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true;
    sheetKind = 'museum'; sheetEl.hidden = false;
    if (room) musRoom = room;
    renderMuseum();
  }
  function renderMuseum() {
    var keep = sheetEl.scrollTop, tot = L.museumTotal(S);
    sheetHead('박물관');
    var say = document.createElement('p'); say.className = 'say';
    say.textContent = musSay || L.curatorLine(S, gameDay());
    sheetEl.appendChild(say);
    var h3 = document.createElement('h3'); h3.textContent = '전시실';
    var hb = document.createElement('b'); hb.textContent = tot.n + ' / ' + tot.m; h3.appendChild(hb); sheetEl.appendChild(h3);
    L.MUSEUM_ROOM_IDS.forEach(function (r) {
      var room = L.MUSEUM_ROOMS[r], cnt = L.museumCount(S, r), can = L.donatable(S, r), done = !!(S.museum && S.museum.done[r]);
      var row = sheetRow(roomIcon(r), room.name + ' ' + cnt.n + '/' + cnt.m,
        (done ? '완성 · 칭호 「' + room.title + '」' : '완성하면 「' + room.title + '」 · ' + L.decoById(room.deco).name + ' · ' + room.coins + '코인') +
        (can.length ? ' · 지금 기증 ' + can.length + '개' : ''));
      row.appendChild(vBtn(musRoom === r ? '접기' : can.length ? '기증' : '보기', false, function () { musRoom = musRoom === r ? null : r; renderMuseum(); }, room.name + ' 열기'));
      if (musRoom !== r) return;
      can.forEach(function (id) {
        var name = musName(r, id), sub = MUS_FROM[room.from] + (room.from === 'bag' ? ' · ' + L.bagCount(S, id) + '개 있음' : '');
        var it = sheetRow(musIcon(r, id), name, sub, 'gift');
        it.appendChild(vBtn('기증', false, function () { doDonate(r, id, name); }, name + ' 기증하기'));
      });
      var left = cnt.m - cnt.n - can.length;
      var p = document.createElement('p'); p.className = 'note';
      p.textContent = cnt.n >= cnt.m ? '이 전시실은 가득 찼어요' : (can.length ? '' : '지금 기증할 수 있는 게 없어요 · ') + '아직 못 구한 것 ' + left + '개 · 힌트는 도감에';
      sheetEl.appendChild(p);
    });
    var titles = L.museumTitles(S).concat(L.portTitles(S), L.diveTitles(S));
    var p2 = document.createElement('p'); p2.className = 'note';
    p2.textContent = (titles.length ? '칭호: ' + titles.join(' · ') + ' · ' : '') + '기증해도 도감 기록은 그대로 · 바구니 물건은 하나만 빠져요';
    sheetEl.appendChild(p2);
    sheetEl.scrollTop = keep;
  }
  function doDonate(r, id, name) {
    var res = L.donate(S, r, id), room = L.MUSEUM_ROOMS[r];
    if (!res.ok) { toast(MUS_WHY[res.why] || '아직이에요'); renderMuseum(); return; }
    var cnt = L.museumCount(S, r);
    musSay = L.curatorLine(S, gameDay());
    musAttnAt = 0;
    if (res.reward) {
      var g = res.reward;
      toast('★ ' + room.name + ' 완성 · 칭호 「' + g.title + '」 · +' + g.coins + '코인' + (g.deco ? ' · ' + L.decoById(g.deco).name + (g.stored ? ' (보관함)' : ' (마당)') : ''), 4200);
      burst(90, 60, 22, 0, 80);
      if (res.allDone) setTimeout(function () { toast('★ 모든 전시실 완성 · 칭호 「' + res.allDone.title + '」 · +' + res.allDone.coins + '코인', 4500); }, 4400);
    } else toast(josa(name, '을', '를') + ' 기증했다 · ' + room.name + ' ' + cnt.n + '/' + cnt.m, 2200);
    refresh(); renderMuseum();
  }
  // called by sceneVillage (goScene)
  function sceneMuseum(sc) {
    if (sc === 'museum') cv.setAttribute('aria-label', '박물관');
    if (sc !== 'museum' && sheetKind === 'museum') closeSheet();
  }

  // ---------- 도감: one progress line ----------
  function renderMuseumDex() {
    if (!L.museumOk(S) && !S.museum) return;
    var t = L.museumTotal(S), titles = L.museumTitles(S).concat(L.portTitles(S), L.diveTitles(S));
    dexHead('박물관', t.n, t.m, L.MUSEUM_ROOM_IDS.map(function (r) { var c = L.museumCount(S, r); return L.MUSEUM_ROOMS[r].name + ' ' + c.n + '/' + c.m; }).join(' · ') +
      (titles.length ? ' · 칭호 ' + titles.join('·') : '') + ' (이동 › 마을)');
  }

  // ---------- 마당 decorations from finished rooms ----------
  DRAW_DECO.bronzefish = function (x, y) {
    px(x + 4, y + 12, 8, 4, 4); px(x + 5, y + 11, 6, 1, 3);
    px(x + 2, y + 4, 9, 5, 3); px(x + 1, y + 5, 11, 3, 3); px(x + 11, y + 2, 2, 3, 3); px(x + 11, y + 8, 2, 3, 3);
    px(x + 3, y + 5, 1, 1, 0); px(x + 7, y + 9, 2, 2, 3); px(x + 4, y + 4, 5, 1, 2);
  };
  DRAW_DECO.beetlestat = function (x, y) {
    px(x + 2, y + 9, 10, 3, 4);
    px(x + 3, y + 3, 8, 6, 4); px(x + 4, y + 4, 6, 4, 3); px(x + 7, y + 4, 1, 4, 4);
    px(x + 6, y, 2, 3, 4); px(x + 4, y + 1, 1, 2, 4); px(x + 9, y + 1, 1, 2, 4); px(x + 5, y + 4, 1, 1, 1);
  };
  DRAW_DECO.dinobones = function (x, y) {
    px(x + 1, y + 18, 22, 2, 4);
    px(x + 4, y + 9, 1, 9, 3); px(x + 15, y + 9, 1, 9, 3);
    for (var k = 0; k < 6; k++) px(x + 4 + k * 2, y + 6 + (k % 2), 1, 4, 2);
    px(x + 3, y + 8, 14, 1, 3); px(x + 16, y + 3, 6, 4, 3); px(x + 17, y + 4, 1, 1, 0); px(x + 18, y + 6, 4, 1, 4);
    px(x, y + 9, 3, 1, 3); px(x - 1, y + 10, 2, 1, 3);
  };
  DRAW_DECO.crystalcol = function (x, y, tt) {
    px(x + 1, y + 17, 8, 3, 4);
    px(x + 3, y + 2, 4, 15, 3); px(x + 4, y, 2, 2, 3); px(x + 4, y + 3, 1, 12, 1);
    px(x + 1, y + 8, 2, 9, 2); px(x + 7, y + 10, 2, 7, 2);
    if (Math.floor((tt || 0) * 2) % 5 === 0) px(x + 4, y + 4, 1, 1, 0);
  };
  DRAW_DECO.orrery = function (x, y, tt) {
    px(x + 4, y + 17, 6, 3, 4); px(x + 6, y + 10, 2, 7, 4);
    px(x + 5, y + 4, 4, 4, 3); px(x + 6, y + 5, 1, 1, 0);
    px(x + 1, y + 6, 12, 1, 2);
    var a = (tt || 0) * 0.8, ox = Math.round(Math.cos(a) * 6), oy = Math.round(Math.sin(a) * 2);
    px(x + 6 + ox, y + 5 + oy, 2, 2, 4);
  };
  DRAW_DECO.pearlshell = function (x, y) {
    px(x + 1, y + 6, 12, 4, 4); px(x + 2, y + 7, 10, 2, 2);
    px(x + 2, y + 1, 10, 5, 4); px(x + 3, y + 2, 8, 3, 1); px(x + 5, y + 2, 1, 3, 3); px(x + 8, y + 2, 1, 3, 3);
    px(x + 6, y + 6, 3, 2, 0);
  };

  // ---------- console hooks ----------
  function addMuseumHooks(FF) {
    // FF.museum() opens it (giving a telescope if needed) and goes in; FF.museum('fish') opens that room's sheet
    FF.museum = function (room) {
      if (!L.museumOk(S)) { S.coins += L.SCOPE_COST; L.buyScope(S); }
      if (!L.villageOk(S)) S.rep = Math.max(S.rep, L.VILLAGE_REP);
      enterMuseum(); refresh();
      if (room) openMuseum(room);
      return L.museumTotal(S);
    };
    // FF.museumFill(room, left): makes every id of the room donatable; with left = n, donates all but n of them
    FF.museumFill = function (room, left) {
      var R = L.MUSEUM_ROOMS[room];
      if (!R) return L.MUSEUM_ROOM_IDS;
      if (!L.museumOk(S)) { S.coins += L.SCOPE_COST; L.buyScope(S); }
      R.ids.forEach(function (id) {
        if (L.museumGot(S, room, id)) return;
        if (R.from === 'bag') S.bag.push({ id: id, v: L.itemInfo(id).price });   // over the cap: a test hook
        else if (R.from === 'bugs') { if (!S.bugs) { S.coins += L.NET_COST; L.buyNet(S); } L.catchBug(S, id); }
        else if (R.from === 'fossil') { if (!S.cave) { S.rep = Math.max(S.rep, L.CAVE_REP); S.coins += L.PICK_COST; L.buyPick(S, now(), Math.random); } S.cave.done[id] = true; }
        else L.seeStar(S, id, now());
      });
      if (typeof left === 'number') L.donatable(S, room).slice(0, Math.max(0, L.donatable(S, room).length - left)).forEach(function (id) { L.donate(S, room, id); });
      musAttnAt = 0; refresh();
      if (sheetKind === 'museum') renderMuseum();
      return L.museumCount(S, room);
    };
  }
