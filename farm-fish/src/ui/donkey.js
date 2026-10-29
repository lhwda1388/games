  // ---------- 당나귀 (stage 9 ②): art, 마당 spot + sheet (쓰다듬기·먹이·이름), 상점 row, 깊은 숲·산꼭대기 scenes, FF hooks ----------
  // Logic in logic/donkey.js. Finds use the 숲 forage art and the same 도전 gauge (chal.kind 'ride', finished in chFinish).
  var DONKEY_YARD = { x: 24, y: 141 };          // feet, top-left of the pen (clear of hens and the cow)
  var DEEP_SP = [[30, 112], [134, 114], [52, 152], [152, 146]];
  var PEAK_SP = [[36, 152], [120, 164], [154, 144]];
  var PSCOPE = [78, 98, 26, 20];                // the flat rock to watch the stars from
  var RIDE_SP = { deep: DEEP_SP, peak: PEAK_SP };
  var RIDE_DONKEY = { deep: { x: 160, y: 188 }, peak: { x: 22, y: 188 } };
  var donkeyHearts = [];
  PLACE.deep = ['깊은 숲', '당나귀 타고 깊은 숲으로'];
  PLACE.peak = ['산꼭대기', '당나귀 타고 산꼭대기로'];
  BUG_VIEWS.deep = true; BUG_VIEWS.peak = true;
  BUG_KIND.stickinsect = 'hop'; BUG_KIND.mtswallow = 'fly'; BUG_KIND.apollo = 'fly'; BUG_KIND.alpinedrag = 'drag'; BUG_KIND.rockhopper = 'hop';
  BUG_C.mtswallow = [4, 3]; BUG_C.apollo = [3, 0]; BUG_C.giantlonghorn = [4, 2]; BUG_C.giantstag = [4, 3];

  // ---------- art: feet at (x, y), facing right unless flip; mode 'stand' | 'walk' | 'graze' ----------
  function drawDonkey(x, y, flip, mode, tt) {
    function P(dx, dy, w, h, c) { px(flip ? x - dx - w : x + dx, y + dy, w, h, c); }
    var step = mode === 'walk' && Math.floor(tt * 5) % 2, g = mode === 'graze' ? 6 : 0;
    P(-7, -11, 13, 1, 4); P(-7, -10, 13, 6, 3); P(-6, -4, 11, 1, 4);
    P(-6, -4, 2, 4 - step, 4); P(-3, -4, 1, 4 - (1 - step), 4); P(2, -4, 1, 4 - step, 4); P(4, -4, 2, 4 - (1 - step), 4);
    P(-8, -10, 1, 5, 4); P(-9, -6, 2, 2, 4);                                   // tail
    if (Math.floor(tt * 1.3) % 4 === 0) P(-9, -7, 1, 1, 4);
    P(4, -14 + g, 3, 5, 3); P(4, -15 + g, 1, 6, 4);                            // neck + mane
    P(5, -16 + g, 6, 4, 3); P(10, -14 + g, 2, 2, 1); P(7, -15 + g, 1, 1, 4);   // head, muzzle, eye
    var ear = Math.floor(tt * 0.9) % 5 === 0 ? 1 : 0;
    P(5, -20 + g + ear, 1, 4 - ear, 4); P(7, -20 + g, 1, 4, 4);
    if (L.donkeyLevel(S) >= L.LOAD_LV) { P(-4, -12, 6, 5, 2); P(-4, -12, 6, 1, 4); P(-2, -9, 2, 1, 4); }   // 짐 싣기 saddlebag
  }
  function donkeyIcon() {
    var c = document.createElement('canvas'); c.width = 22; c.height = 22;
    var saved = ctx; ctx = c.getContext('2d');
    try { drawDonkey(10, 21, false, 'stand', 0); } finally { ctx = saved; }
    c.style.width = '22px'; c.style.height = '22px';
    return c;
  }
  function drawHearts(dt) {
    for (var k = donkeyHearts.length - 1; k >= 0; k--) {
      var h = donkeyHearts[k];
      h.t += dt;
      if (h.t > 1.2) { donkeyHearts.splice(k, 1); continue; }
      spr(PET_SP.heart, h.x - 2 + Math.round(Math.sin(h.t * 6) * 2), h.y - 22 - Math.round(h.t * 14));
    }
  }

  // ---------- 마당 ----------
  function drawDonkeyYard(tt, dt) {
    if (!S.donkey) return;
    var d = DONKEY_YARD, u = tt % 24;
    px(d.x - 7, d.y, 14, 1, 2);
    drawDonkey(d.x, d.y, u > 12, u % 12 < 5 ? 'graze' : 'stand', tt);
    drawHearts(dt || 0);
  }
  function tapDonkeyYard(x, y) {
    if (!S.donkey || !hit([DONKEY_YARD.x - 10, DONKEY_YARD.y - 22, 22, 24], x, y, 2)) return false;
    openDonkeySheet();
    return true;
  }
  function donkeyPetNow(at) {
    var r = L.donkeyPet(S, now(), TZ);
    if (!r) return;
    donkeyHearts.push({ x: at.x, y: at.y, t: 0 });
    var nm = S.donkey.name;
    if (r.up) toast('♥ ' + nm + ' 친밀도 ' + r.up + ' · ' + L.DONKEY_ACTS[r.up], 3600);
    else toast(nm + ' · 귀를 쫑긋' + (r.gain ? '' : ' · 오늘은 충분히 쓰다듬었다'), 1500);
    save();
  }

  // ---------- sheet: 쓰다듬기 · 먹이 · 이름 ----------
  function openDonkeySheet() {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true;
    sheetKind = 'donkey'; sheetEl.hidden = false;
    renderDonkeySheet();
  }
  function renderDonkeySheet() {
    var d = S.donkey, lv = L.donkeyLevel(S), next = L.DONKEY_LV[lv];
    sheetHead(d.name);
    var say = document.createElement('p'); say.className = 'say';
    say.textContent = '친밀도 ' + lv + (next ? ' (' + d.f + '/' + next + ') · 다음: ' + L.DONKEY_ACTS[lv + 1] : ' · 최고') + ' · 지금: ' + L.DONKEY_ACTS[lv];
    sheetEl.appendChild(say);
    var food = L.donkeyFood(S);
    act('쓰다듬기', '하루 ' + L.DONKEY_PETS_DAY + '번 친밀도 +1', '쓰다듬기', function () { donkeyPetNow(DONKEY_YARD); });
    act('먹이 주기', food ? '바구니의 ' + L.itemInfo(food).name + ' 하나 · 친밀도 +' + L.DONKEY_FEED_F + ' (하루 ' + L.DONKEY_FEEDS_DAY + '번)' : '바구니에 무·감자·옥수수·사과·배·호박이 있으면', '주기', function () {
      var r = L.donkeyFeed(S, now(), TZ);
      if (!r || !r.ok) { toast(r && r.why === 'full' ? '배불러 한다 · 내일 또' : '줄 먹이가 없어요 · 무나 감자를 바구니에', 2000); return; }
      donkeyHearts.push({ x: DONKEY_YARD.x, y: DONKEY_YARD.y, t: 0 });
      toast(josa(L.itemInfo(r.id).name, '을', '를') + ' 아삭아삭' + (r.up ? ' · ♥ 친밀도 ' + r.up + ' · ' + L.DONKEY_ACTS[r.up] : ''), r.up ? 3600 : 1800);
      refresh();
    });
    act('이름', '「' + d.name + '」', '바꾸기', function () { openDonkeyName('rename'); });
    var p = document.createElement('p'); p.className = 'note';
    p.textContent = '친밀도 ' + L.DEEP_LV + ' 깊은 숲 · ' + L.LOAD_LV + ' 짐 싣기 (바구니 +' + L.DONKEY_BAG + '칸) · ' + L.PEAK_LV + ' 산꼭대기 · 이동 메뉴에서' + (L.forestOk(S) ? '' : ' (숲 길이 열려 있어야)');
    sheetEl.appendChild(p);
    function act(name, sub, label, fn) {
      var r = sheetRow(donkeyIcon(), name, sub);
      var b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.setAttribute('aria-label', name);
      b.addEventListener('click', function () { fn(); if (sheetKind === 'donkey' && !sheetEl.hidden) renderDonkeySheet(); });
      r.appendChild(b);
    }
  }
  // mode 'buy' or 'rename'. Typed text: cleaned in logic, shown with textContent only (same rules as the 반려동물).
  function openDonkeyName(mode) {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true;
    sheetKind = 'donkeyName'; sheetEl.hidden = false;
    sheetHead(mode === 'rename' ? '이름 바꾸기' : '당나귀 들이기');
    var say = document.createElement('p'); say.className = 'say';
    say.textContent = mode === 'rename' ? S.donkey.name + '의 새 이름은?' : '순한 눈의 당나귀. 이름을 지어 줄까?';
    sheetEl.appendChild(say);
    var row = document.createElement('div'); row.className = 'shareRow';
    row.appendChild(donkeyIcon());
    var inp = document.createElement('input'); inp.type = 'text'; inp.className = 'field'; inp.maxLength = L.PET_NAME_MAX;
    inp.placeholder = L.DONKEY_DEF; inp.setAttribute('aria-label', '이름 (' + L.PET_NAME_MAX + '글자까지)'); inp.autocomplete = 'off';
    if (mode === 'rename') inp.value = S.donkey.name;
    var b = document.createElement('button'); b.type = 'button'; b.textContent = mode === 'rename' ? '바꾸기' : '들이기';
    row.appendChild(inp); row.appendChild(b); sheetEl.appendChild(row);
    var hint = document.createElement('p'); hint.className = 'note';
    hint.textContent = '한글·영문·숫자 ' + L.PET_NAME_MAX + '글자까지 · 비우면 「' + L.DONKEY_DEF + '」' + (mode === 'rename' ? '' : ' · ' + L.DONKEY_COST.toLocaleString('ko-KR') + '코인');
    sheetEl.appendChild(hint);
    function submit() {
      if (mode === 'rename') {
        var nn = L.renameDonkey(S, inp.value);
        if (!nn) { toast('쓸 수 있는 글자로 지어 주세요'); return; }
        toast('이제 「' + nn + '」', 2000);
      } else {
        var r = L.buyDonkey(S, inp.value, now());
        if (!r.ok) { toast(WHY[r.why] || '아직 들일 수 없어요'); return; }
        toast('★ ' + josa(r.name, '이', '가') + ' 마당 우리에 왔다 · 눌러서 쓰다듬고 먹이 주기', 3600);
      }
      closeSheet(); refresh();
    }
    b.addEventListener('click', submit);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    setTimeout(function () { try { inp.focus(); } catch (er) { /* focus may be refused */ } }, 0);
  }

  // ---------- 상점 row ----------
  function renderDonkeyShop() {
    var h3 = document.createElement('h3'); h3.textContent = '당나귀';
    var hb = document.createElement('b'); hb.textContent = S.donkey ? S.donkey.name : '탈것'; h3.appendChild(hb); shopEl.appendChild(h3);
    if (S.donkey) {
      var lv = L.donkeyLevel(S), next = L.DONKEY_LV[lv];
      shopRow(donkeyIcon(), S.donkey.name, '친밀도 ' + lv + (next ? ' (' + S.donkey.f + '/' + next + ')' : ' · 최고') + ' · ' + L.DONKEY_ACTS[lv], '이름',
        function () { openDonkeyName('rename'); return { ok: true }; });
      return;
    }
    var st = L.donkeyStatus(S);
    shopRow(donkeyIcon(), '당나귀', st === 'rep' ? '신뢰도 ★' + L.DONKEY_REP + '이 되면 · 마당 우리에서 산다 · 친해지면 깊은 숲·산꼭대기까지 태워 준다'
      : '마당 우리에서 산다 · 쓰다듬고 먹이 주면 친해져서 깊은 숲·산꼭대기까지 태워 준다', st === 'rep' ? '★' + L.DONKEY_REP : L.DONKEY_COST.toLocaleString('ko-KR'),
      function () {
        if (st === 'rep') return { ok: false, why: 'rep' };
        if (st === 'coins') return { ok: false, why: 'coins' };
        openDonkeyName('buy'); return { ok: true };
      }, { poor: st !== 'ok', aria: '당나귀 들이기 ' + L.DONKEY_COST + '코인' });
  }

  // ---------- 깊은 숲 · 산꼭대기 backgrounds ----------
  var bgDeep = document.createElement('canvas'); bgDeep.width = W; bgDeep.height = H;
  var bgPeak = document.createElement('canvas'); bgPeak.width = W; bgPeak.height = H;
  (function paintRide() {
    var saved = ctx, k, x, y;
    ctx = bgDeep.getContext('2d');
    px(0, 0, W, H, 1);
    for (k = 0; k < 420; k++) px(Math.floor(hash(k * 13 + 5) * W), 70 + Math.floor(hash(k * 17 + 2) * (H - 70)), 1, 1, k % 4 ? 2 : 3);
    // tall dark trunks, a canopy that hides the sky
    px(0, 0, W, 26, 4);
    for (x = 0; x < W; x += 2) px(x, 26, 1, 3 + Math.floor(hash(x * 3) * 6), 4);
    [[6, 6], [30, 4], [58, 7], [96, 5], [122, 6], [148, 8], [172, 5]].forEach(function (tr, j) {
      var w = tr[1], bot = 74 + Math.floor(hash(j * 7) * 14);
      px(tr[0], 0, w, bot, 4); px(tr[0] + 1, 20, 1, bot - 24, 3);
      px(tr[0] - 2, bot - 2, w + 4, 2, 4);
    });
    // ferns, mossy rocks, a small stream
    for (k = 0; k < 16; k++) { x = Math.floor(hash(k * 29 + 1) * W); y = 90 + Math.floor(hash(k * 31 + 7) * 100); for (var j = 0; j < 4; j++) { px(x - j, y - j, 1, 1, 3); px(x + j, y - j, 1, 1, 3); } px(x, y - 4, 1, 4, 3); }
    [[10, 176], [140, 180], [86, 132]].forEach(function (r) { px(r[0], r[1], 12, 5, 3); px(r[0] + 1, r[1] - 2, 10, 2, 2); px(r[0] + 2, r[1] - 3, 7, 1, 2); });
    for (y = 120; y < H; y++) { x = 60 + Math.round(Math.sin(y / 14) * 10); if (y % 2) px(x, y, 4, 1, 0); }
    ctx = bgPeak.getContext('2d');
    px(0, 0, W, H, 0);
    // far ridges below the summit, then the summit rock
    for (x = 0; x < W; x++) {
      var r1 = 74 + Math.round(Math.sin(x / 17) * 6 + Math.sin(x / 7) * 2), r2 = 92 + Math.round(Math.sin(x / 23 + 1) * 5);
      px(x, r1, 1, 30, 1); px(x, r2, 1, 30, 2);
      var top = 112 + Math.round(Math.abs(x - 90) * 0.25 + Math.sin(x / 9) * 2);
      px(x, top, 1, H - top, 1); px(x, top, 1, 1, 4); px(x, top + 1, 1, 1, 2);
    }
    for (k = 0; k < 140; k++) px(Math.floor(hash(k * 7 + 3) * W), 120 + Math.floor(hash(k * 11 + 9) * 80), 2, 1, k % 4 ? 2 : 3);
    // a cairn (돌탑) and a few clouds
    [[150, 108, 12, 4], [152, 104, 8, 4], [154, 100, 5, 4], [155, 97, 3, 3]].forEach(function (b) { px(b[0], b[1], b[2], b[3], 2); px(b[0], b[1] + b[3] - 1, b[2], 1, 4); });
    [[20, 40], [110, 30], [60, 56]].forEach(function (c) { px(c[0], c[1], 22, 3, 1); px(c[0] + 4, c[1] - 2, 12, 2, 1); });
    ctx = saved;
  })();

  // ---------- scene draw / tap ----------
  function drawRideScene(place, tt, dt) {
    var t = now(), e = fEnv(t), night = e.phase === 'night', sp = RIDE_SP[place], spots = S.donkey && S.donkey[place];
    ctx.drawImage(place === 'deep' ? bgDeep : bgPeak, 0, 0);
    if (place === 'peak') {
      if (night || e.phase === 'evening') { ctx.globalAlpha = night ? 0.8 : 0.25; px(0, 0, W, 112, 4); ctx.globalAlpha = 1; }
      if (night) for (var k = 0; k < 120; k++) if ((Math.floor(tt * 1.2) + k) % 9) px(Math.floor(hash(k * 41 + 3) * W), Math.floor(hash(k * 43 + 1) * 104), 1, 1, k % 5 ? 1 : 0);
      drawPeakScope(tt, night);
    } else drawForestSeason(tt, e.season);
    sp.forEach(function (p, k) {
      px(p[0] - 6, p[1] + 1, 13, 1, 2);
      var q = spots && spots[k];
      if (q && q.id) {
        var f = L.forageById(q.id), bob = chal && chal.kind === 'ride' && chal.k === k ? Math.round(Math.sin(tt * 30)) : 0;
        drawForage(q.id, p[0] + bob, p[1], tt);
        if (f.rarity === '희귀' || f.rarity === '전설') sparkle(p[0] + 6, p[1] - 10, tt + k * 0.4);
      } else { px(p[0] - 1, p[1] - 1, 1, 1, 2); px(p[0] + 1, p[1] - 2, 1, 2, 2); }
    });
    var d = RIDE_DONKEY[place];
    px(d.x - 7, d.y, 14, 1, 2);
    drawDonkey(d.x, d.y, place === 'deep', tt % 20 < 7 ? 'graze' : 'stand', tt);
    drawHearts(dt || 0);
    drawYardWeather(tt, e.weather);
    if (place === 'deep') {
      ctx.globalAlpha = night ? 0.45 : e.phase === 'evening' ? 0.22 : 0.1; px(0, 0, W, H, 4); ctx.globalAlpha = 1;
      if (night) for (var j = 0; j < 8; j++) if ((Math.floor(tt * 2) + j) % 3) px((hash(j * 5 + 2) * W + Math.sin(tt * 0.6 + j) * 8) % W, 60 + hash(j * 9 + 4) * 120, 1, 1, 0);
    } else if (night) { ctx.globalAlpha = 0.18; px(0, 112, W, H - 112, 4); ctx.globalAlpha = 1; }
  }
  function drawPeakScope(tt, night) {
    var r = PSCOPE;
    px(r[0], r[1] + 12, r[2], 6, 2); px(r[0] + 2, r[1] + 10, r[2] - 4, 2, 2); px(r[0], r[1] + 17, r[2], 1, 4);
    if (!L.skyOk(S)) return;
    var x = r[0] + 6, y = r[1] - 4;
    px(x + 6, y + 6, 1, 8, 4); px(x + 3, y + 13, 1, 1, 4); px(x + 9, y + 13, 1, 1, 4);
    for (var k = 0; k < 10; k++) px(x + k, y + 8 - k * 0.6, 2, 2, k < 2 ? 4 : 3);
    if (night) sparkle(x + 13, y - 2, tt);
  }
  function tapRideScene(place, x, y) {
    if (!L.rideOk(S, place)) { goScene('yard'); return; }
    var sp = RIDE_SP[place], spots = S.donkey[place] || [], empty = null;
    for (var k = 0; k < sp.length; k++) {
      if (!hit([sp[k][0] - 8, sp[k][1] - 13, 16, 16], x, y, 2)) continue;
      var p = spots[k];
      if (!p || !p.id) { empty = empty || p; continue; }
      if (bagStop()) return;
      chal = { kind: 'ride', place: place, k: k, x: sp[k][0], y: sp[k][1] - 12, g: L.forageGame(p.id, performance.now(), Math.random), hinted: false };
      return;
    }
    var d = RIDE_DONKEY[place];
    if (hit([d.x - 12, d.y - 22, 24, 24], x, y, 2)) { donkeyPetNow(d); return; }
    if (place === 'peak' && hit(PSCOPE, x, y, 3)) {
      if (!L.skyOk(S)) { toast('별이 쏟아질 듯한 바위 · 상점 망원경이 있으면 여기서 별자리를 이을 수 있어요', 2600); return; }
      openStars(false, true); return;
    }
    if (empty) { toast('다시 돋는 중 · ' + fmtLeft(Math.max(0, empty.at - now())), 1600); return; }
    var nx = L.rideNextAt(S, place);
    toast(L.rideReady(S, place) ? '반짝이는 걸 누르면 줍기 · 꾹 누르면 도전' : '다 주웠다' + (nx ? ' · ' + fmtLeft(Math.max(0, nx - now())) + ' 뒤 다시 돋는다' : ''), 2400);
  }
  // chFinish (ui/forest.js) hands kind 'ride' here
  function rideDone(c, won, res) {
    var r = L.pickRide(S, c.place, c.k, now(), Math.random, won);
    if (!r) return;
    var f = L.forageById(r.id), first = S.forest.dex[r.id] === r.n;
    burst(c.x, c.y + 6, won ? 16 : 8, won ? 4 : 2, won ? 70 : 40);
    fxHarvest(c.x, c.y + 8, itemIcon(r.id), won);
    if (r.sold) fxCoins(c.x, c.y, r.sold);
    floatText((won ? '★' : '+') + f.name + (r.n > 1 ? '×' + r.n : ''), c.x, c.y - 6);
    var tail = r.sold ? ' · 바구니가 꽉 차 바로 팔았다 +' + r.sold : ' · 바구니에';
    toast((first ? '처음 찾았다! ' : won ? '도전 성공! ' : res === 'miss' ? '아깝다 · ' : '') + f.name + (r.n > 1 ? ' ×' + r.n : '') + (f.rarity !== '흔함' ? ' (' + f.rarity + ')' : '') + tail, 2400);
    refresh();
  }
  function rideAttention(sc) {
    if (!L.rideOk(S, sc)) return false;
    return L.rideReady(S, sc) > 0 || L.rideNextAt(S, sc) <= now();
  }
  function tickRideUI(t) {
    if (chal && chal.kind === 'ride' && view !== chal.place) chal = null;
    if (view !== 'deep' && view !== 'peak') { if (sheetKind === 'donkey' && view !== 'yard') closeSheet(); return; }
    if (!L.rideOk(S, view)) { goScene('yard'); return; }
    if (L.tickRide(S, view, t, fEnv(t), Math.random)) save();
  }
  // tickNotice (ui/spots.js): a find here only now, not picked yet
  function rideNotice(e, live) {
    if ((view !== 'deep' && view !== 'peak') || !L.rideOk(S, view)) return null;
    var fe = fEnv(now()), out = null, pl = view;
    fe.place = pl;
    L.FORAGE.forEach(function (f) {
      if (f.place !== pl || !L.forageConditional(f) || L.forageWeight(f, fe) <= 0) return;
      var c = noticeCause(f, fe);
      if (!c) return;
      var key = 'ride:' + pl + '|' + c.k;
      live[key] = true;
      if (out || S.forest.dex[f.id]) return;
      out = { k: key, say: c.say + ' · ' + L.RIDE_PLACES[pl] + '에 처음 보는 게…' };
    });
    return out;
  }

  // ---------- console hooks ----------
  function addDonkeyHooks(FF) {
    // FF.donkey() buys one for free; FF.donkey(n) sets 친밀도 level n; FF.donkey('reset') resets today's counters
    FF.donkey = function (arg) {
      if (!S.donkey) { S.rep = Math.max(S.rep, L.DONKEY_REP); S.coins += L.DONKEY_COST; L.buyDonkey(S, '', now()); }
      if (typeof arg === 'number') S.donkey.f = arg ? L.DONKEY_LV[Math.min(L.DONKEY_LV.length, arg) - 1] : 0;
      if (arg === 'reset') { S.donkey.pn = 0; S.donkey.fn = 0; }
      refresh(); return S.donkey;
    };
    // FF.mount('deep'|'peak') rides there now (opens the 숲 and raises 친밀도 as needed); FF.mount(place, 'regrow') refills its spots
    FF.mount = function (place, cmd) {
      place = place === 'peak' ? 'peak' : 'deep';
      if (!S.forest) FF.forest();
      FF.donkey(); if (!L.rideOk(S, place)) S.donkey.f = L.DONKEY_LV[(place === 'deep' ? L.DEEP_LV : L.PEAK_LV) - 1];
      if (cmd === 'regrow' && S.donkey[place]) S.donkey[place].forEach(function (p) { p.id = null; p.at = 0; });
      goScene(place); L.tickRide(S, place, now(), fEnv(now()), Math.random); refresh();
      return S.donkey[place].map(function (p) { return p.id; });
    };
  }
