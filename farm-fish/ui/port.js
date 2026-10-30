  // ---------- 옛 포구 (stage 11 ①): view 'port' — near shore + bridge + quay with 조선소·어판장·기차역, granny, bundle sheet ----------
  // Logic: logic/port.js. Lanes ②③ put their own signs on this scene through drawPortExtra_auction/_dive and
  // tapPortExtra_auction/_dive (called only when defined); PORT_AT below is the shared layout they can read.
  var PORT_AT = {
    shipyard: [4, 46, 52, 46], market: [62, 54, 50, 38], station: [118, 40, 58, 52],
    bridge: [78, 104, 24, 58], dock: [4, 92, 34, 20], granny: [134, 150, 14, 26]
  };
  var PORT_SIGN = [157, 90, 14, 18];   // the 「끊긴 다리」 sign at the sea end of the 마을 lane
  var PORT_WHY = { closed: '아직 포구로 가는 길이 없어요', order: '앞 건물부터 고쳐야 해요', got: '이미 넣었어요', need: '지금 가진 게 없어요', bundle: '이 꾸러미 것이 아니에요' };
  var portSheetFor = null, portSay = '', portAttnAt = 0, portAttn = false, portFx = null;
  var PORT_PEOPLE = {   // one figure per fixed building: 어부 on the dock, 목수, 짐꾼, 역무원
    bridge:   { at: [14, 83], rows: ['.444...', '44444..', '.404...', '.444...', '..3....', '.333.4.', '3.3.4..', '.333...', '.3.3...', '.3.3...'] },
    shipyard: { at: [46, 82], rows: ['..2....', '.444...', '.404...', '.444...', '..3...4', '.33334.', '3.3....', '.333...', '.3.3...', '.3.3...'] },
    market:   { at: [100, 82], rows: ['.444...', '.404...', '.444...', '..3....', '.3333..', '3.3.444', '..34444', '.3.3444', '.3.3...', '.3.3...'] },
    station:  { at: [164, 82], rows: ['44444..', '.444...', '.404...', '.444...', '..4....', '.444...', '4.4.4..', '.444...', '.4.4...', '.4.4...'] }
  };

  function portAttention() {
    var p = performance.now();
    if (p - portAttnAt > 1000) { portAttnAt = p; portAttn = L.portCan(S); }
    return portAttn;
  }
  function bridgeOk() { return L.portDone(S, 'bridge'); }

  // ---------- the sign in the 마을 ----------
  function drawPortSign(tt) {
    if (!L.portShown(S)) return;
    var x = PORT_SIGN[0], y = PORT_SIGN[1];
    px(x + 6, y + 6, 1, 12, 4);                                                    // post
    px(x, y + 1, 14, 7, 4); px(x + 1, y + 2, 12, 5, 0);                             // board
    px(x + 2, y + 4, 4, 1, 4); px(x + 8, y + 4, 4, 1, 4); px(x + 6, y + 5, 1, 1, 3); px(x + 7, y + 3, 1, 1, 3);   // a bridge with a gap
    px(x + 3, y + 5, 1, 1, 4); px(x + 10, y + 5, 1, 1, 4);
    if (portAttention()) markAbove(x + 7, y, false, tt);
  }
  function tapPortSign(x, y) {
    if (!L.portShown(S) || !hit(PORT_SIGN, x, y, 2)) return false;
    enterPort();
    return true;
  }
  function enterPort() {
    portSay = '';
    goScene('port');
    toast(bridgeOk() ? '옛 포구 · 건물을 누르면 꾸러미' : '끊긴 다리 · 할머니에게 말 걸기 · 다리를 누르면 꾸러미', 2800);
  }

  // ---------- pre-rendered sea, quay and shore ----------
  var bgPort = document.createElement('canvas'); bgPort.width = W; bgPort.height = H;
  (function paintPort() {
    var saved = ctx, k; ctx = bgPort.getContext('2d');
    px(0, 0, W, H, 0);
    px(0, 26, W, 134, 1);                                                          // sea
    for (k = 0; k < 90; k++) px(Math.floor(hash(k * 5 + 3) * (W - 4)), 28 + Math.floor(hash(k * 11 + 7) * 130), 3, 1, 2);
    px(0, 92, W, 12, 3); px(0, 92, W, 1, 4); px(0, 103, W, 1, 4);                  // quay
    for (k = 2; k < W; k += 8) px(k, 94, 1, 9, 2);
    for (k = 3; k < W; k += 14) px(k, 104, 2, 4, 4);                              // quay piles
    px(0, 160, W, 40, 2); px(0, 160, W, 1, 4);                                     // near shore
    for (k = 0; k < 70; k++) px(Math.floor(hash(k * 13 + 1) * W), 162 + Math.floor(hash(k * 7 + 5) * 38), 1, 1, k % 3 ? 3 : 0);
    ctx = saved;
  })();

  // ---------- buildings: old / fixed ----------
  function boards(x, y, w, h) { px(x, y + 1, w, 1, 3); px(x, y + h - 2, w, 1, 3); px(x + 1, y, 1, h, 2); }
  function drawShipyard(fixed, tt) {
    var a = PORT_AT.shipyard, x = a[0], y = a[1], j;
    for (j = 0; j < 14; j++) px(x + 26 - (6 + j * 2), y + j, 12 + j * 4, 1, fixed ? 4 : (j * 7 + 3) % 5 ? 3 : 1);   // gable roof (holes when old)
    px(x + 2, y + 14, 48, 32, 4); px(x + 3, y + 15, 46, 31, fixed ? 0 : 2);
    for (j = y + 17; j < y + 46; j += 4) px(x + 3, j, 46, 1, fixed ? 1 : 3);       // planks
    px(x + 16, y + 22, 20, 24, 4); px(x + 17, y + 23, 18, 23, fixed ? 2 : 1);     // big door
    if (fixed) {   // a hull on the slip, a small crane arm
      px(x + 19, y + 36, 14, 4, 4); px(x + 20, y + 40, 12, 2, 3); px(x + 25, y + 30, 1, 6, 4);
      px(x + 50, y + 2, 1, 44, 4); px(x + 36, y + 2, 15, 1, 4); px(x + 38, y + 3, 1, 4 + Math.round(Math.sin(tt) * 1), 3);
    } else { boards(x + 18, y + 26, 16, 10); px(x + 8, y + 20, 5, 1, 1); px(x + 40, y + 30, 1, 6, 1); }
  }
  function drawMarket(fixed, tt) {
    var a = PORT_AT.market, x = a[0], y = a[1], k;
    px(x, y + 4, 50, 3, 4);                                                        // flat roof
    px(x + 2, y + 7, 46, 31, 4); px(x + 3, y + 8, 44, 30, fixed ? 0 : 2);
    for (k = 0; k < 44; k += 4) {                                                  // awning: stripes, torn when old
      if (fixed) px(x + 3 + k, y + 8, 4, 6, (k / 4) % 2 ? 0 : 4);
      else if (k % 12) px(x + 3 + k, y + 8, 4, 2 + (k % 3), (k / 4) % 2 ? 1 : 3);
    }
    px(x + 5, y + 20, 40, 18, 4); px(x + 6, y + 21, 38, 17, fixed ? 1 : 3);       // open front
    if (fixed) {   // crates of fish and a hand bell
      for (k = 0; k < 3; k++) { px(x + 8 + k * 12, y + 30, 10, 7, 4); px(x + 9 + k * 12, y + 31, 8, 3, 0); px(x + 10 + k * 12, y + 32, 5, 1, 3); }
      var sw = Math.floor(tt * 2) % 2; px(x + 44, y - 2, 1, 6, 4); px(x + 42 + sw, y - 4, 4, 3, 3);
    } else { boards(x + 8, y + 24, 34, 12); }
  }
  function drawStation(fixed, tt) {
    var a = PORT_AT.station, x = a[0], y = a[1], k;
    for (k = 0; k < 10; k++) px(x + 29 - (10 + k * 2), y + k, 20 + k * 4, 1, fixed ? 4 : k % 3 ? 3 : 1);   // hip roof
    px(x + 4, y + 10, 50, 36, 4); px(x + 5, y + 11, 48, 35, fixed ? 0 : 2);
    px(x + 23, y + 12, 12, 10, 4); px(x + 24, y + 13, 10, 8, fixed ? 0 : 1);      // clock
    var m = fixed ? Math.floor(tt / 2) % 4 : 1;                                    // minute hand turns once fixed
    px(x + 26, y + 17, 3, 1, 4); px(x + [28, 29, 28, 25][m], y + [14, 17, 18, 17][m], m % 2 ? 3 : 1, m % 2 ? 1 : 3, 4);
    for (k = 0; k < 2; k++) { px(x + 8 + k * 34, y + 24, 8, 10, 4); px(x + 9 + k * 34, y + 25, 6, 8, fixed ? 1 : 3); if (!fixed) px(x + 8 + k * 34, y + 28, 8, 1, 2); }
    px(x + 24, y + 28, 10, 18, 4); px(x + 25, y + 29, 8, 17, fixed ? 2 : 1);      // door
    if (fixed) { px(x + 6, y + 6, 14, 3, 4); px(x + 7, y + 7, 12, 1, 0); }       // name board on the eave
    else boards(x + 25, y + 32, 8, 10);
    px(x - 2, y + 48, 62, 2, 4); for (k = 0; k < 60; k += 5) px(x - 1 + k, y + 50, 2, 1, 3);   // rails
  }
  function drawBridge(fixed, tt) {
    var a = PORT_AT.bridge, x = a[0], y = a[1], k;
    for (k = 0; k < 4; k++) px(x + 2 + (k % 2) * 18, y + 8 + Math.floor(k / 2) * 34, 2, 10, 4);   // posts
    for (var j = 0; j < a[3]; j += 3) {
      if (!fixed && j > 14 && j < 42) continue;                                     // the broken middle
      px(x, y + j, a[2], 2, 4); px(x + 1, y + j, a[2] - 2, 1, j % 2 ? 2 : 3);
    }
    if (fixed) { px(x - 1, y, 1, a[3], 4); px(x + a[2], y, 1, a[3], 4); }
    else {   // planks hanging into the gap, bobbing
      var b = Math.round(Math.sin(tt * 2) * 1);
      px(x + 3, y + 17, 2, 6 + b, 3); px(x + 16, y + 17, 2, 4 - b, 3); px(x + 8, y + 38 + b, 6, 1, 3); px(x + 12, y + 30, 5, 1, 2);
    }
  }
  var PORT_DRAW = { shipyard: drawShipyard, market: drawMarket, station: drawStation };

  function drawGranny(tt) {
    var a = PORT_AT.granny, b = Math.round(Math.sin(tt * 1.6) * 0.6);
    spr(['...3333....', '..344443...', '..340403...', '...4444....', '...3333....', '..333333...', '.33333333..', '.3333333.4.', '..333333.4.', '..333333.4.', '...44.44.4.'], a[0], a[1] + 10 + b);
    px(a[0] + 2, a[1] + 21, 9, 1, 3);
  }
  function drawDock(tt) {
    var a = PORT_AT.dock;
    px(a[0] + 1, a[1] + 3, 4, 6, 4); px(a[0], a[1] + 2, 6, 1, 4);                  // bollard on the quay
    px(a[0] + 26, a[1] + 4, 5, 5, 4); px(a[0] + 27, a[1] + 5, 3, 2, 0);            // bait bucket
    for (var r = 0; r < 14; r++) px(a[0] + 8 + r, a[1] + 2 - Math.floor(r / 3), 1, 1, 4);   // rod held out over the water
    var bob = Math.round(Math.sin(tt * 1.5));
    px(a[0] + 22, a[1] - 2, 1, 16 + bob, 3); px(a[0] + 21, a[1] + 14 + bob, 3, 2, 4);   // line and float below the quay
  }
  function drawPort(tt, dt) {
    var e = curEnv(now()), ok = bridgeOk();
    ctx.drawImage(bgPort, 0, 0);
    drawSky(tt, e.phase);
    for (var k = 0; k < 24; k++) { var ph = (tt * 0.25 + k * 0.13) % 1; if (ph < 0.5) px((hash(k * 3 + 1) * W + ph * 6) % W, 110 + Math.floor(hash(k * 9) * 46), 2, 1, 0); }
    var fxOn = portFx && performance.now() - portFx.t0 < 2600;
    if (!fxOn) portFx = null;
    ['shipyard', 'market', 'station'].forEach(function (id) {
      var fixed = L.portDone(S, id) && !(fxOn && portFx.id === id && performance.now() - portFx.t0 < 900);
      PORT_DRAW[id](fixed, tt);
    });
    if (!ok) { ctx.globalAlpha = 0.5; px(0, 26, W, 78, 1); ctx.globalAlpha = 1; }   // mist over the far side until the bridge stands
    if (ok) drawDock(tt);
    L.PORT_BLDGS.forEach(function (b) {
      var p = PORT_PEOPLE[b.id];
      if (L.portDone(S, b.id) && !(fxOn && portFx.id === b.id)) spr(p.rows, p.at[0] + Math.round(Math.sin(tt + p.at[0]) * 1), p.at[1]);
    });
    drawBridge(ok && !(fxOn && portFx.id === 'bridge' && performance.now() - portFx.t0 < 900), tt);
    drawGranny(tt);
    if (typeof drawPortExtra_auction === 'function') drawPortExtra_auction(tt);   // stage 11 ②
    if (typeof drawPortExtra_dive === 'function') drawPortExtra_dive(tt);         // stage 12
    var nx = L.portNext(S);
    if (nx && portAttention()) { var r = PORT_AT[nx.id]; markAbove(r[0] + Math.floor(r[2] / 2), r[1] - 1, false, tt); }
    if (fxOn) drawPortFx(tt);
    if (e.phase === 'night') { ctx.globalAlpha = 0.3; px(0, 0, W, H, 4); ctx.globalAlpha = 1; drawStars(tt); }
  }
  // fixing: a hammer swinging in the dust, then the name plate drops in
  function drawPortFx(tt) {
    var r = PORT_AT[portFx.id], age = performance.now() - portFx.t0, cx = r[0] + Math.floor(r[2] / 2), cy = r[1] + Math.floor(r[3] / 2);
    if (age < 900) {
      var up = reduceMotion ? 0 : Math.floor(age / 120) % 2;
      px(cx - 1, cy - 8 - up * 3, 2, 7, 4); px(cx - 4, cy - 10 - up * 3, 8, 3, 4); px(cx - 3, cy - 9 - up * 3, 6, 1, 2);
      return;
    }
    var drop = reduceMotion ? 0 : Math.max(0, 8 - Math.floor((age - 900) / 30));
    var py = Math.max(2, r[1] - 12) - drop;
    px(cx - 13, py, 26, 9, 4); px(cx - 12, py + 1, 24, 7, 0);
    px(cx - 9, py + 3, 3, 3, 4); px(cx - 8, py + 2, 1, 5, 4); px(cx - 10, py + 4, 5, 1, 4);   // a little star
    for (var k = 0; k < 3; k++) px(cx - 3 + k * 4, py + 4, 2, 1, 3);
  }

  function tapPort(x, y) {
    if (typeof tapPortExtra_auction === 'function' && tapPortExtra_auction(x, y)) return;   // stage 11 ②
    if (typeof tapPortExtra_dive === 'function' && tapPortExtra_dive(x, y)) return;         // stage 12
    if (typeof tapPortExtra_train === 'function' && tapPortExtra_train(x, y)) return;       // 기차 여행: 설원행
    if (hit(PORT_AT.granny, x, y, 4)) { portSay = L.grannyLine(S, Math.random); toast(portSay + ' · ' + L.portHint(S), 3800); return; }
    if (hit(PORT_AT.bridge, x, y, 2)) { openPortSheet('bridge'); return; }
    var ids = ['shipyard', 'market', 'station'];
    for (var k = 0; k < ids.length; k++) if (hit(PORT_AT[ids[k]], x, y, 1)) {
      if (!bridgeOk()) { toast('다리가 끊겨 건너갈 수 없어요 · 다리부터 고치기', 2400); return; }
      openPortSheet(ids[k]); return;
    }
    if (bridgeOk() && hit(PORT_AT.dock, x, y, 2)) { openPortSheet('dock'); return; }
    toast(L.portHint(S), 2600);
  }

  // ---------- sheet: the tapped building's bundles, a 복구 row; the dock's 바다 낚시터로 ----------
  function openPortSheet(what) {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true;
    sheetKind = 'port'; sheetEl.hidden = false; portSheetFor = what;
    renderPort();
  }
  function portIcon(u, id) {
    if (u.kind === 'junk') return junkCanvas(id);
    if (u.kind === 'rec') return roomIcon(u.need.rec === 'museum' ? 'fish' : u.need.rec === 'stars' ? 'star' : 'fossil');
    return itemIcon(id);
  }
  function bldgIcon(id) {
    var c = document.createElement('canvas'); c.width = 12; c.height = 12;
    spr(id === 'bridge' ? ['............', '............', '444444444444', '.4.4.4.4.4.4', '.4........4.', '.4........4.']
      : ['.....44.....', '...444444...', '.4444444444.', '..40000004..', '..40044004..', '..40044004..', '..44444444..'], 0, 3, false, c.getContext('2d'));
    return c;
  }
  function renderPort() {
    var keep = sheetEl.scrollTop, what = portSheetFor;
    sheetHead('옛 포구');
    var say = document.createElement('p'); say.className = 'say';
    say.textContent = portSay || L.grannyLine(S, function () { return 0; });
    sheetEl.appendChild(say);
    if (what === 'dock') {
      var row = sheetRow(bldgIcon('bridge'), '부두 낚시 자리', '바다 낚시터와 같은 물고기 · 부두에서 낚싯대 드리우기');
      row.appendChild(vBtn('바다 낚시터로', false, function () { closeSheet(); goScene('farm'); if (S.spot !== 'sea') goSpot('sea'); }, '바다 낚시터로 가기'));
      sheetEl.scrollTop = keep;
      return;
    }
    var b = L.PORT_BLDGS.filter(function (q) { return q.id === what; })[0], nx = L.portNext(S), cur = !!nx && nx.id === b.id, done = L.portDone(S, b.id);
    var h3 = document.createElement('h3'); h3.textContent = b.name;
    var hb = document.createElement('b');
    hb.textContent = done ? '복구됨' : b.bundles.filter(function (u) { return L.portBundleDone(S, u.id); }).length + ' / ' + b.bundles.length + ' 꾸러미';
    h3.appendChild(hb); sheetEl.appendChild(h3);
    if (!done && !cur) { var w = document.createElement('p'); w.className = 'note'; w.textContent = '앞 건물(' + nx.name + ')부터 고쳐야 해요 · 꾸러미는 미리 볼 수 있어요'; sheetEl.appendChild(w); }
    b.bundles.forEach(function (u) {
      var c = L.portCount(S, u.id);
      sheetRow(portIcon(u, L.portSlots(u)[0]), u.name + ' ' + c.n + '/' + c.m, c.n >= c.m ? '다 참 · 받은 보상 ' + u.coins + '코인' : '다 채우면 ' + u.coins + '코인');
      if (c.n >= c.m) return;   // a full bundle stays one row (short in the small window)
      L.portSlots(u).forEach(function (id) {
        var got = L.portGot(S, u.id, id), why = L.portWhy(S, u.id, id), name, sub;
        if (u.kind === 'rec') { name = L.PORT_REC_NAME[id] + ' ' + u.need.n + '개 이상'; sub = got ? '확인됨' : '지금 ' + L.portRecNow(S, id) + '개 · 기록만 보고 가져가지 않아요'; }
        else { name = L.portItemName(id); sub = got ? '넣음' : (u.kind === 'junk' ? '고물 상자에 ' : '바구니에 ') + L.portHave(S, u.id, id) + '개'; }
        var it = sheetRow(portIcon(u, id), name, sub, 'gift');
        if (got) return;
        if (u.kind === 'rec') it.appendChild(vBtn('확인', why !== 'ok', function () { doPortPut(u, id, name); }, name + ' 확인하기'));
        else it.appendChild(vBtn('넣기', why !== 'ok', function () { doPortPut(u, id, name); }, name + ' 넣기'));
      });
    });
    if (!done) {
      var all = b.bundles.every(function (u) { return L.portBundleDone(S, u.id); });
      var br = sheetRow(bldgIcon(b.id), b.name + ' 복구', all ? b.coins.toLocaleString('ko-KR') + '코인을 내면 복구' : '꾸러미를 다 채우면 ' + b.coins.toLocaleString('ko-KR') + '코인으로 복구');
      br.appendChild(vBtn('복구', !cur || !all || S.coins < b.coins, doPortBuild, b.name + ' 복구하기'));
    }
    var titles = L.portTitles(S), p2 = document.createElement('p'); p2.className = 'note';
    p2.textContent = (titles.length ? '칭호: ' + titles.join(' · ') + ' · ' : '') + '바구니 물건은 가장 싼 것 하나만 빠져요 · 기록 칸은 아무것도 가져가지 않아요';
    sheetEl.appendChild(p2);
    sheetEl.scrollTop = keep;
  }
  function doPortPut(u, id, name) {
    var r = u.kind === 'rec' ? L.portCheck(S, u.id) : L.portPut(S, u.id, id);
    if (!r.ok) { toast(PORT_WHY[r.why] || '아직이에요'); renderPort(); return; }
    portAttnAt = 0;
    if (r.bundleDone) { toast('★ ' + u.name + ' 완성 · +' + r.coins + '코인', 3000); fxStamp(toastEl); }
    else toast(josa(name, '을', '를') + ' 넣었다 · ' + u.name + ' ' + L.portCount(S, u.id).n + '/' + L.portCount(S, u.id).m, 2000);
    refresh(); renderPort();
  }
  function doPortBuild() {
    var r = L.portBuild(S);
    if (!r.ok) { toast(r.why === 'coins' ? '코인이 모자라요' : r.why === 'bundles' ? '꾸러미를 먼저 다 채워요' : '아직이에요'); renderPort(); return; }
    portFixed(r.bldg);
  }
  function portFixed(b) {
    closeSheet();
    portFx = { id: b.id, t0: performance.now() }; portAttnAt = 0; portSay = '';
    var a = PORT_AT[b.id];
    for (var k = 0; k < 3; k++) burst(a[0] + a[2] / 2 + (k - 1) * 8, a[1] + a[3] - 4, 10, k % 2 ? 2 : 3, 50);
    var t = L.portTitles(S);
    toast('★ ' + b.name + ' 복구! ' + (b.id === 'bridge' ? '포구 안으로 들어갈 수 있어요' : t.length ? '칭호 「' + t[0] + '」' : '포구에 사람이 늘었어요'), 4200);
    setTimeout(function () { fxStamp(toastEl); }, 900);
    refresh();
  }
  // called by sceneVillage (goScene)
  function scenePort(sc) {
    if (sc === 'port') cv.setAttribute('aria-label', '옛 포구');
    if (sc !== 'port' && /^(port|auction|trader|dive)$/.test(sheetKind)) closeSheet();
  }

  // ---------- console hooks ----------
  function addPortHooks(FF) {
    function open() {
      if (!L.villageOk(S)) S.rep = Math.max(S.rep, L.VILLAGE_REP);
      if (!L.spotUnlocked(S, 'sea')) { S.spotOk = S.spotOk || {}; S.spotOk.sea = true; }
    }
    // FF.port.fill('market'): fixes every earlier building, then fills that building's bundles (items given, records set)
    // FF.port.build(): pays (adding coins if short) and fixes the current building with its effect
    FF.port = {
      go: function () { open(); enterPort(); refresh(); return L.portHint(S); },
      fill: function (id) {
        open();
        var want = L.PORT_BLDGS.filter(function (b) { return b.id === id; })[0] || L.portNext(S);
        if (!want) return 'all done';
        L.PORT_BLDGS.forEach(function (b) {
          if (L.portDone(S, b.id) || L.PORT_BLDGS.indexOf(b) > L.PORT_BLDGS.indexOf(want)) return;
          b.bundles.forEach(function (u) {
            if (u.kind === 'rec') {
              var n = u.need.n;
              if (u.need.rec === 'museum') { S.museum = S.museum || { got: {}, done: {} }; S.museum.got.fish = S.museum.got.fish || {}; L.MUSEUM_ROOMS.fish.ids.slice(0, n).forEach(function (f) { S.museum.got.fish[f] = true; }); }
              else if (u.need.rec === 'stars') { if (!L.skyOk(S)) { S.coins += L.SCOPE_COST; L.buyScope(S); } L.STARS.slice(0, n).forEach(function (c) { L.seeStar(S, c.id, now()); }); }
              else { if (!S.cave) { S.rep = Math.max(S.rep, L.CAVE_REP); S.coins += L.PICK_COST; L.buyPick(S, now(), Math.random); } L.FOSSILS.slice(0, n).forEach(function (f) { S.cave.done[f.id] = true; }); }
              L.portCheck(S, u.id);
              return;
            }
            u.ids.forEach(function (it) {
              if (L.portGot(S, u.id, it)) return;
              if (u.kind === 'junk') { var j = L.junkOf(S); j.n[it] = (j.n[it] || 0) + 1; }
              else S.bag.push({ id: it, v: L.itemInfo(it).price });   // over the cap: a test hook
              L.portPut(S, u.id, it);
            });
          });
          if (b !== want) { S.coins += b.coins; L.portBuild(S); }
        });
        portAttnAt = 0; refresh();
        if (sheetKind === 'port') renderPort();
        return L.portHint(S);
      },
      build: function () {
        open();
        var b = L.portNext(S);
        if (!b) return 'all done';
        if (S.coins < b.coins) S.coins += b.coins - S.coins;
        var r = L.portBuild(S);
        if (r.ok) { if (view !== 'port') enterPort(); portFixed(r.bldg); }
        return r;
      }
    };
  }
