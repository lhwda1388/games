  // ---------- stage 10 ③: 주민들의 하루 (people out on the 마을 street) + 새 주민 (cottages on the upper lane, rooms, faces) ----------
  // Logic lives in logic/town.js. drawVillage/tapVillage (ui/village.js) call drawTown/tapTown.
  // new faces: pith helmet + dark glasses, pigtails + sailor collar, flower crown + one braid holding a sprout
  FACE.archaeo = ['...222...', '..22222..', '.2444442.', '222222222', '..40004..', '.4440444.', '..40004..', '..24442..', '.2422242.'];
  FACE.seagirl = ['..44444..', '.4400044.', '444040444', '44.000.44', '4..444..4', '...404...', '..41114..', '.4141414.', '411111114'];
  FACE.botanist = ['..3.3.3..', '..44444..', '.4444404.', '.4404044.', '..40004..', '...444.4.', '.3.222.4.', '33222224.', '.3222222.'];
  DISH_TOP.hwajeon = ['.343.343.', '3333333333'];

  // cottages on the upper lane: [x, y] of a 30 × 26 box (roof, 20-wide body, the resident stands right of it)
  var TCOT = { botanist: [14, 2], archaeo: [58, 2], seagirl: [102, 2] };
  var TGOAL_HINT = { fossil: '동굴 화석을 모두 맞추면', lighthouse: '섬 등대에 불이 켜지면', museum: '박물관이 4분의 3쯤 차면' };
  function townIds() { return L.RES_EXTRA.map(function (r) { return r.id; }); }
  function townMovedIds() { return townIds().filter(function (id) { return L.resMoved(S, id); }); }

  function cottage(x, y, id, tt, away, night) {
    for (var j = 0; j < 9; j++) px(x + 11 - (5 + j), y + j, 10 + j * 2, 1, id === 'seagirl' ? 2 : 3);   // roof
    px(x + 1, y + 9, 20, 17, 4); px(x + 2, y + 10, 18, 15, id === 'archaeo' ? 2 : id === 'seagirl' ? 0 : 1);
    px(x + 4, y + 16, 6, 10, 4); px(x + 5, y + 17, 4, 9, 3);                                          // door
    px(x + 12, y + 13, 6, 5, 4); px(x + 13, y + 14, 4, 3, away ? 3 : night ? 0 : 1);                  // window
    if (id === 'archaeo') {          // stone courses and a pick + shovel by the wall
      for (var r = 0; r < 3; r++) for (var c = 0; c < 18; c += 6) px(x + 2 + c + (r % 2) * 3, y + 11 + r * 5, 1, 1, 4);
      px(x + 24, y + 14, 1, 12, 4); px(x + 22, y + 14, 5, 1, 4); px(x + 27, y + 16, 1, 10, 3); px(x + 26, y + 23, 3, 3, 3);
    } else if (id === 'seagirl') {   // wave pattern under the eaves and a life ring
      for (var w = 0; w < 18; w++) px(x + 2 + w, y + 11 + ((w >> 1) % 2), 1, 1, 3);
      px(x + 23, y + 12, 5, 5, 4); px(x + 24, y + 13, 3, 3, 0); px(x + 25, y + 14, 1, 1, 4);
      var fl = Math.floor(tt * 3) % 2; px(x + 11, y - 2, 1, 4, 4); px(x + 12, y - 2, 3 + fl, 2, 4);    // a small flag on the ridge
    } else {                         // flower pots and a vine over the door
      for (var v = 0; v < 6; v++) px(x + 3 + v, y + 15 - (v % 2), 1, 1, 3);
      [[23, 22], [27, 23]].forEach(function (p, i) { px(x + p[0], y + p[1], 3, 3, 4); px(x + p[0] + 1, y + p[1] - 3 + i, 1, 3, 3); px(x + p[0], y + p[1] - 4 + i, 3, 1, 2); });
    }
  }
  // an empty lot: two posts and a blank board
  function emptyLot(x, y) {
    px(x + 4, y + 16, 1, 10, 3); px(x + 15, y + 16, 1, 10, 3);
    px(x + 2, y + 13, 16, 6, 3); px(x + 3, y + 14, 14, 4, 0); px(x + 9, y + 15, 2, 2, 3);
  }
  // small marks for the places on the street
  function drawPlaces() {
    var P = L.TOWN_PLACES;
    px(P.pavilion.x - 4, 86, 25, 2, 4); px(P.pavilion.x - 3, 85, 23, 1, 3);                                   // 정자 roof on posts
    px(P.pavilion.x - 2, 88, 1, 18, 4); px(P.pavilion.x + 18, 88, 1, 18, 4);
    for (var k = 0; k < 4; k++) px(P.garden.x - 2 + k * 6, 105, 3, 1, 3);                                    // 텃밭 rows
    px(P.dock.x - 6, 96, 1, 10, 4); px(P.dock.x - 10, 94, 9, 4, 4); px(P.dock.x - 9, 95, 6, 2, 0); px(P.dock.x - 4, 95, 2, 2, 2);   // signpost →
  }
  // behind the old houses (their marks overlap the upper lane): lane, place marks, cottages
  function drawTownBack(tt) {
    var t = now(), night = curEnv(t).phase === 'night';
    px(10, 26, 134, 3, 1); px(10, 26, 134, 1, 2);                                                           // the upper lane
    drawPlaces();
    townIds().forEach(function (id) {
      var p = TCOT[id];
      if (!L.resMoved(S, id)) { emptyLot(p[0], p[1]); return; }
      var away = L.residentAway(id, t, YTZ);
      cottage(p[0], p[1], id, tt, away, night);
      if (away) { px(p[0] + 5, p[1] + 19, 4, 3, 0); px(p[0] + 5, p[1] + 20, 4, 1, 4); }   // closed sign
      else spr(FACE[id], p[0] + 21, p[1] + 17);
    });
  }
  // in front: attention marks on the cottages, everyone out at a place
  function drawTown(tt) {
    var t = now();
    townMovedIds().forEach(function (id) {
      var p = TCOT[id];
      if (!L.residentAway(id, t, YTZ) && L.vilAttention(S, id, t, YTZ)) markAbove(p[0] + 26, p[1] + 14, false, tt);
    });
    // everyone out at a place; a little speech mark until met today
    var met = (S.town && S.town.met && S.town.met.day === L.petDay(t, YTZ)) ? S.town.met.ids : {};
    L.townOut(S, t, YTZ).forEach(function (o) {
      var b = reduceMotion ? 0 : Math.round(Math.sin(tt * 2 + o.x) * 0.6);
      spr(FACE[o.id], o.x, o.y + b);
      if (!met[o.id] && L.villageOk(S)) { px(o.x + 6, o.y - 5, 5, 4, 4); px(o.x + 7, o.y - 4, 3, 2, 0); px(o.x + 6, o.y - 1, 1, 1, 4); }
    });
  }
  // street people first, then cottages; false when the tap is not ours
  function tapTown(x, y) {
    var t = now(), out = L.townOut(S, t, YTZ), k;
    for (k = out.length - 1; k >= 0; k--) {
      var o = out[k];
      if (!hit([o.x - 1, o.y - 5, 11, 15], x, y)) continue;
      var d = L.residentById(o.id), r = L.townMeet(S, o.id, t, YTZ);
      if (!r.ok) return false;
      var line = d.name + ' · ' + L.TOWN_PLACES[r.place].name + ' · ' + r.text;
      if (r.pts) { upsToast(r.ups, line + ' · 친밀도 +' + r.pts); refresh(); }
      else toast(line, 3600);
      return true;
    }
    var ids = townIds();
    for (k = 0; k < ids.length; k++) {
      var p = TCOT[ids[k]];
      if (!hit([p[0], 0, 30, p[1] + 26], x, y)) continue;
      if (L.resMoved(S, ids[k])) enterHome(ids[k]);
      else toast('빈 집터 · ' + TGOAL_HINT[L.TOWN_ARRIVE[ids[k]].goal] + ' 누가 이사 올지도', 3000);
      return true;
    }
    return false;
  }
  // arrivals: checked from the village tick, wherever the player is
  function tickTown() {
    var got = L.townArrive(S);
    if (!got.length) return;
    save();
    toast('새 주민 · ' + got.map(function (id) { return L.residentById(id).name; }).join('·') + ' 이사 왔어요 · 편지 (바구니 › 주민)', 4200);
    if (view === 'village') burst(TCOT[got[0]][0] + 12, 20, 14, 0, 60);
  }
  // unread count for the basket ping and the 주민 tab label: 친밀도 letters + arrival letters
  function resUnread() { return (S.res ? S.res.unread.length : 0) + L.townUnread(S).length; }

  // ---------- rooms ----------
  VWALL.archaeo = 1; VWALL.seagirl = 0; VWALL.botanist = 1;
  DRAW_ROOM.archaeo = function (tt) {
    px(6, 30, 40, 2, 4); px(6, 50, 40, 2, 4); px(6, 70, 40, 2, 4);                                        // shelves of finds
    [[9, 22], [20, 24], [32, 23], [12, 43], [28, 44], [16, 63], [34, 64]].forEach(function (f, i) {
      px(f[0], f[1], 7 - (i % 2), 8 - (i % 3), 4); px(f[0] + 1, f[1] + 1, 5 - (i % 2), 6 - (i % 3), i % 2 ? 2 : 3);
    });
    spr(['.4444.', '4.....4', '4.44..4', '4.4.4.4', '4..4..4', '.4444.'], 130, 30);                        // ammonite poster
    px(122, 24, 40, 32, 4); px(124, 26, 36, 28, 0); spr(['..4444..', '.4....4.', '4..44..4', '4.4..4.4', '4..4...4', '.4....4.', '..4444..'], 138, 34);
    px(110, 120, 56, 4, 4); px(114, 124, 2, 20, 4); px(160, 124, 2, 20, 4);                                  // desk, a bone, a magnifier
    px(118, 114, 18, 3, 1); px(117, 113, 3, 5, 1); px(134, 113, 3, 5, 1);
    px(146, 110, 7, 7, 4); px(147, 111, 5, 5, 0); px(152, 116, 4, 2, 4);
  };
  DRAW_ROOM.seagirl = function (tt) {
    for (var x = 0; x < W; x++) px(x, 70 + Math.round(Math.sin(x / 6 + tt) * 1.5), 1, 1, 3);               // a wave painted along the wall
    px(22, 28, 16, 16, 4); px(24, 30, 12, 12, 0); px(28, 34, 4, 4, 4);                                      // life ring
    px(126, 36, 40, 4, 4); [[128, 30], [138, 31], [148, 30], [158, 31]].forEach(function (s, i) { px(s[0], s[1], 5, 5, i % 2 ? 3 : 2); });   // shells
    px(120, 140, 44, 6, 4); px(124, 130, 2, 10, 4); px(125, 130, 12, 8, 1); px(140, 128, 2, 12, 4); px(141, 128, 10, 9, 0);   // toy ship
    var lb = Math.floor(tt * 2) % 2; px(20, 150, 10, 8, 4); px(21, 151, 8, 6, lb ? 0 : 1);                  // a lamp like grandpa's lighthouse
  };
  DRAW_ROOM.botanist = function (tt) {
    [[18, 24], [44, 28], [122, 24], [148, 28]].forEach(function (f, i) {                                      // pressed-flower frames
      px(f[0], f[1], 22, 26, 4); px(f[0] + 2, f[1] + 2, 18, 22, 0);
      px(f[0] + 10, f[1] + 10, 1, 12, 3); px(f[0] + 7 + (i % 2), f[1] + 6, 7, 5, i % 2 ? 2 : 3); px(f[0] + 6, f[1] + 15, 4, 2, 3);
    });
    [[14, 140], [30, 144], [140, 140], [156, 144]].forEach(function (p, i) {                                // pots with leaves
      px(p[0], p[1], 10, 10, 4); px(p[0] + 1, p[1] + 1, 8, 3, 2);
      px(p[0] + 4, p[1] - 8, 1, 8, 4);
      for (var k = 0; k < 3; k++) { var sw = Math.round(Math.sin(tt + i + k) * 0.6); px(p[0] + 1 + sw, p[1] - 3 - k * 3, 3, 2, 3); px(p[0] + 5 + sw, p[1] - 5 - k * 3, 3, 2, 3); }   // stem and leaves
    });
  };

  // ---------- console hooks ----------
  function addTownHooks(FF) {
    // FF.town('archaeo') moves one in now (marks the goal done); FF.town() → who is out where
    FF.town = function (id) {
      if (!id) return L.townOut(S, now(), YTZ).map(function (o) { return o.id + '@' + o.place; });
      if (!L.TOWN_ARRIVE[id]) return townIds();
      if (!L.villageOk(S)) S.rep = Math.max(S.rep, L.VILLAGE_REP);
      if (!S.town) S.town = { mv: {}, met: { day: -1, ids: {} } };
      S.town.mv[id] = 1; refresh(); save();
      return L.residentById(id).name;
    };
  }
