  // ---------- stage 9 ③: 자전거 배달, 열기구, 겨울 썰매 ----------
  // One overlay (#ride) runs all three one-button rides; the logic judges from the tap times it records.
  // The 마을 언덕 (bottom left of the street) opens a small menu: 열기구 when one is up, 썰매 in game winter.
  // Rides use real seconds (frame dt), pause behind the boss key, and take Space or a tap anywhere on the overlay.
  var HILL = [2, 168, 48, 32];
  var RW = 120, RH = 64;
  var rideEl = document.createElement('section');
  rideEl.className = 'overlay'; rideEl.id = 'ride'; rideEl.hidden = true; rideEl.setAttribute('aria-label', '탈것');
  app.appendChild(rideEl);
  var rideTitle = document.createElement('h2'), rideCv = document.createElement('canvas'), rideTip = document.createElement('p');
  var rideMenu = document.createElement('div'), rideStop = document.createElement('button');
  rideCv.width = RW; rideCv.height = RH; rideTip.className = 'tip'; rideMenu.className = 'menu';
  rideStop.type = 'button';
  rideEl.appendChild(rideTitle); rideEl.appendChild(rideCv); rideEl.appendChild(rideTip); rideEl.appendChild(rideMenu); rideEl.appendChild(rideStop);
  var ride = null;   // { kind: 'bike'|'sled'|'bal'|'menu', lay, taps, t, done, ... }
  function rideOn() { return !!ride && ride.kind !== 'menu'; }

  function showRide() {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true; sheetEl.hidden = true;
    rideEl.hidden = false;
  }
  function closeRide() {
    var k = ride && ride.kind;
    ride = null; rideEl.hidden = true;
    if (k === 'bike') openBag('order');
  }
  rideStop.addEventListener('click', function () {
    if (!ride) return;
    if (ride.kind === 'menu' || ride.done) { closeRide(); return; }
    endRide(true);
  });
  rideEl.addEventListener('pointerdown', function (e) {
    if (!rideOn() || e.target.tagName === 'BUTTON') return;
    e.preventDefault(); rideTap();
  });
  function rideTap() {
    if (!rideOn() || ride.done || boss) return;
    ride.taps.push(ride.t);
    if (ride.kind === 'bal') {
      var seen = L.balloonJudge(ride.lay, [ride.t]);
      if (seen.length && ride.seen.indexOf(seen[0]) < 0) { ride.seen.push(seen[0]); ride.flash = 0.35; rideTip.textContent = L.sightById(seen[0]).name + '!'; }
    }
  }
  function startRide(kind, lay, title, tip, extra) {
    ride = { kind: kind, lay: lay, taps: [], t: 0, done: 0, flash: 0, seen: [], season: curEnv(now()).season };
    for (var k in extra) ride[k] = extra[k];
    rideTitle.textContent = title; rideTip.textContent = tip;
    rideMenu.hidden = true; rideCv.hidden = false;
    rideStop.textContent = kind === 'bike' ? '그만 타기 (납품은 그대로)' : '그만 타기';
    showRide(); drawRide();
  }

  // ---------- 자전거 배달: 납품 first, then the ride for a tip ----------
  function bikeDeliver(k) {
    if (!L.bikeOk(S) || !L.canDeliver(S, k)) return;
    var r = doDeliver(k);
    if (!r) return;
    var road = L.BIKE_ROAD[curEnv(now()).season];
    startRide('bike', L.bikeLayout(Math.random), '자전거 배달 · ' + road.name,
      '탭 = 점프 · ' + road.bump + '·고양이 넘고 ' + road.flower + ' 줍기', { pay: r.coins, road: road });
  }
  // ---------- 썰매 ----------
  function sledStart() {
    var t = now(), e = curEnv(t);
    if (!L.villageOk(S) || e.season !== 'winter') return;
    var fest = e.festival === 'winter';
    startRide('sled', L.sledLayout(Math.random, fest), fest ? '눈사람 축제 썰매' : '언덕 썰매',
      '탭 = 옆 줄로 · 바위·나무 피하고 눈꽃 줍기' + (L.sledBest(S) ? ' · 최고 ' + L.sledBest(S) + '초' : ''), { fest: fest ? L.festivalAt(t, TZ) : null });
  }
  // ---------- 열기구 ----------
  var balForce = false;   // FF.balloon(): a window now, for testing
  function balStart() {
    var t = now(), r;
    if (balForce) { balForce = false; r = { ok: true }; }   // FF test ride: free, no window used up
    else r = L.balloonStart(S, t);
    if (!r.ok) { toast(BAL_WHY[r.why] || '지금은 못 타요'); return; }
    refresh();
    startRide('bal', L.balloonLayout(curEnv(t), Math.random), '열기구', '새·구름이 가운데 틀에 오면 탭', {});
  }
  var BAL_WHY = { village: '마을이 열리면 탈 수 있어요', closed: '지금은 열기구가 없어요', rode: '이번 열기구는 이미 탔어요 · 다음 때 또', coins: '코인이 부족해요' };

  // ---------- tick (frame loop) ----------
  function rideLen() { return ride.kind === 'bike' ? L.BIKE_TIME : ride.kind === 'sled' ? L.SLED_TIME : L.BAL_TIME; }
  function tickRide(dt) {
    if (!rideOn() || boss) return;
    if (ride.done) { ride.done -= dt; ride.flash = Math.max(0, ride.flash - dt); if (ride.done <= 0) closeRide(); else drawRide(); return; }
    ride.t += dt; ride.flash = Math.max(0, ride.flash - dt);
    if (ride.kind === 'bike') {
      var b = L.bikeRun(ride.lay, ride.taps, ride.t);
      if (b.crash) { endRide(false); return; }
    }
    if (ride.kind === 'sled') {
      var sr = L.sledRun(ride.lay, ride.taps, ride.t);
      if (sr.bumps > (ride.bumps || 0)) { ride.bumps = sr.bumps; ride.flash = 0.3; }
    }
    if (ride.t >= rideLen()) endRide(false);
    drawRide();
  }
  // quit = the 그만 button: plain result
  function endRide(quit) {
    var m = ride, msg;
    m.done = 1.6;
    if (m.kind === 'bike') {
      var run = quit ? { crash: true, flowers: 0 } : L.bikeRun(m.lay, m.taps);
      m.crash = run.crash;
      var f = L.bikeFinish(S, m.pay, run);
      msg = run.crash ? (quit ? '걸어서 갔다 · 납품은 그대로' : '꽈당! · 괜찮아요, 납품은 그대로') : '무사히 배달! · 팁 +' + f.tip + (run.flowers ? ' · 꽃 ' + run.flowers : '');
      if (f && f.tip) fxCoinsDom(rideTitle);
    } else if (m.kind === 'sled') {
      if (quit) msg = '썰매에서 내렸다';
      else {
        var t = now(), sr = L.sledRun(m.lay, m.taps);
        var fw = m.fest || null;   // the window the run started in
        var o = L.sledFinish(S, sr, t, fw);
        msg = sr.time + '초' + (o.best ? ' · 신기록!' : ' · 최고 ' + L.sledBest(S) + '초') + (o.fest ? ' · 축제 선물' : '') + (o.coins ? ' · +' + o.coins : '');
        if (o.best) fxStamp(rideTip);
      }
    } else {
      var seen = L.balloonJudge(m.lay, m.taps), out = L.balloonFinish(S, seen), shot = balShots(seen);
      msg = (seen.length ? '본 것 ' + seen.length + '가지' : '구름 사이를 둥실') + (out.first.length ? ' · 새로 ' + out.first.length + ' (+' + out.coins + ')' : '') +
        (out.all ? ' · 하늘 도감 완성!' : '') + (shot ? ' · 앨범 +' + shot : '');
    }
    rideTip.textContent = msg; rideStop.textContent = '닫기';
    toast(msg, 3200);
    refresh(); drawRide();
  }
  // 사진기: the ride itself and some sights fill album slots
  function balShots(seen) {
    if (!L.camOk(S)) return 0;
    var ids = L.shotsNow({ scene: 'balloon', vis: [] });
    seen.forEach(function (id) { L.shotsNow({ scene: 'balloon', vis: [], sight: id }).forEach(function (x) { if (ids.indexOf(x) < 0) ids.push(x); }); });
    var n = 0;
    ids.forEach(function (id) { var r = L.takeShot(S, id, now()); if (r && r.first) n++; });
    return n;
  }

  // ---------- drawing ----------
  function drawRide() {
    if (!ride || ride.kind === 'menu') return;
    var c2 = rideCv.getContext('2d'), saved = ctx; ctx = c2;
    try {
      px(0, 0, RW, RH, 0);
      if (ride.kind === 'bike') drawBikeRide(); else if (ride.kind === 'sled') drawSledRide(); else drawBalRide();
      var left = Math.max(0, 1 - ride.t / rideLen());
      px(0, RH - 2, Math.round(RW * left), 2, 4);
    } finally { ctx = saved; }
  }
  var BIKE_SPEED = 34, BIKE_X = 22, GROUND = 50;
  var BIKE_SPR = ['....44..', '...4.4..', '.444444.', '4.4..4.4', '4.4..4.4', '.4....4.'];
  var CAT_SPR = ['4...4', '44444', '40404', '44444', '.4.4.'];
  var FLOWER_SPR = ['.4.', '434', '.4.', '.2.'];
  function drawBikeRide() {
    var t = ride.t, se = ride.season;
    // seasonal road: far hills, roadside trees, sky touches
    for (var k = 0; k < 6; k++) { var hx = ((k * 40 - t * 6) % 240 + 240) % 240 - 40; px(hx, 30, 40, 4, 1); px(hx + 6, 26, 28, 4, 1); }
    for (var j = 0; j < 5; j++) {
      var tx = ((j * 31 - t * 18) % 155 + 155) % 155 - 20;
      px(tx + 3, 34, 2, 10, 3);
      px(tx, 26, 8, 8, se === 'winter' ? 1 : se === 'autumn' ? 3 : 2); px(tx + 1, 25, 6, 1, 4);
      if (se === 'spring') { px(tx + 2, 28, 1, 1, 0); px(tx + 5, 30, 1, 1, 0); }
    }
    if (!reduceMotion) for (var p = 0; p < 10; p++) {
      var fx = (hash(p * 13) * RW - t * (se === 'summer' ? 4 : 10)) % RW, fy = (hash(p * 7 + 1) * GROUND + t * (se === 'summer' ? 60 : 8)) % GROUND;
      fx = (fx + RW) % RW;
      if (se === 'summer') px(fx, fy, 1, 3, 2); else if (se === 'winter') px(fx, fy, 1, 1, 0); else if (se === 'autumn') px(fx, fy, 2, 1, 3); else px(fx, fy, 1, 1, 2);
    }
    px(0, GROUND + 2, RW, 1, 4); px(0, GROUND + 3, RW, RH - GROUND - 3, se === 'winter' ? 0 : 1);
    for (var d = 0; d < 8; d++) px(((d * 18 - t * BIKE_SPEED) % 144 + 144) % 144 - 12, GROUND + 7, 8, 1, 3);   // road marks
    ride.lay.forEach(function (e) {
      var x = BIKE_X + (e.t - t) * BIKE_SPEED;
      if (x < -10 || x > RW + 10) return;
      if (e.kind === 'flower') { if (!ride.picked || ride.picked.indexOf(e.t) < 0) spr(FLOWER_SPR, x - 1, GROUND - 14); }
      else if (e.kind === 'cat') spr(CAT_SPR, x - 2, GROUND - 3);
      else if (se === 'autumn') { px(x - 4, GROUND, 9, 2, 3); px(x - 3, GROUND - 1, 7, 1, 2); }
      else if (se === 'winter') { px(x - 4, GROUND - 1, 9, 3, 0); px(x - 4, GROUND - 2, 9, 1, 2); px(x - 3, GROUND - 3, 7, 1, 2); }
      else { px(x - 5, GROUND + 1, 11, 2, 2); px(x - 3, GROUND + 1, 7, 1, 3); }
    });
    // rider: in the air on a jump; picked flowers vanish
    var jumps = L.bikeJumps(ride.taps), y = 0;
    jumps.forEach(function (jt) { if (t >= jt && t < jt + L.BIKE_JUMP) { var u = (t - jt) / L.BIKE_JUMP; y = Math.round(4 * 12 * u * (1 - u)); } });
    ride.lay.forEach(function (e) {
      if (e.kind === 'flower' && e.t <= t && jumps.some(function (j) { return e.t >= j && e.t < j + L.BIKE_JUMP; })) {
        ride.picked = ride.picked || [];
        if (ride.picked.indexOf(e.t) < 0) { ride.picked.push(e.t); ride.flash = 0.25; }
      }
    });
    var crashed = ride.done && ride.crash;
    if (crashed) { spr(BIKE_SPR, BIKE_X - 6, GROUND - 3, true); px(BIKE_X - 2, GROUND - 5, 3, 3, 4); }
    else {
      spr(BIKE_SPR, BIKE_X - 4, GROUND - 4 - y);
      px(BIKE_X - 1, GROUND - 12 - y, 3, 3, 4); px(BIKE_X, GROUND - 9 - y, 1, 4, 4);   // rider
      px(BIKE_X - 4, GROUND - 6 - y, 3, 2, 3);   // parcel on the rack
    }
    if (ride.flash > 0) px(BIKE_X + 4, GROUND - 16 - y, 2, 2, 4);
  }
  var LANE_Y = [24, 44], SLED_X = 18, SLED_SPEED = 30;
  var ROCK_SPR = ['.444.', '42224', '42224', '44444'];
  var TREE_SPR = ['..4..', '.444.', '44444', '.444.', '44444', '..4..'];
  var SNOWMAN_SPR = ['.444.', '40004', '.444.', '40004', '40004', '.444.'];
  var FLAKE_SPR = ['.2.', '202', '.2.'];
  function drawSledRide() {
    var t = ride.t;
    px(0, 0, RW, 12, 1);   // sky strip, the slope below
    for (var m = 0; m < 4; m++) { var mx = ((m * 44 - t * 4) % 176 + 176) % 176 - 30; for (var r = 0; r < 8; r++) px(mx + r, 11 - r, 24 - r * 2, 1, 2); }
    for (var s = 0; s < 18; s++) px(((s * 23 - t * SLED_SPEED) % 180 + 180) % 180 - 20, 16 + (s * 11) % 40, 3, 1, 1);   // snow ripples
    px(0, 34, RW, 1, 1);
    ride.lay.forEach(function (e) {
      var x = SLED_X + (e.t - t) * SLED_SPEED, y = LANE_Y[e.lane];
      if (x < -8 || x > RW + 8) return;
      if (e.kind === 'flake') { if (e.t > t || L.sledLane(ride.taps, e.t) !== e.lane) spr(FLAKE_SPR, x - 1, y - 4); }
      else spr(e.kind === 'rock' ? ROCK_SPR : e.kind === 'tree' ? TREE_SPR : SNOWMAN_SPR, x - 2, y - (e.kind === 'rock' ? 3 : 5));
    });
    var lane = L.sledLane(ride.taps, t), y0 = LANE_Y[lane], wob = ride.flash > 0 && !reduceMotion ? 1 : 0;
    px(SLED_X - 5, y0 + 1, 10, 1, 4); px(SLED_X - 5, y0, 1, 1, 4);   // runner
    px(SLED_X - 3, y0 - 2, 7, 2, 3);
    px(SLED_X - 1 + wob, y0 - 6, 3, 3, 4); px(SLED_X - 2 + wob, y0 - 3, 4, 1, 2);   // rider, scarf
    if (ride.fest) { spr(SNOWMAN_SPR, RW - 8, 2); }   // the festival snowman cheering at the top
    if (ride.flash > 0) { px(SLED_X + 6, y0 - 8, 1, 3, 4); px(SLED_X + 8, y0 - 7, 1, 2, 4); }
  }
  var FRAME_X = RW / 2, BAL_SPEED = 22;
  function drawBalRide() {
    var t = ride.t;
    // the farm far below, drifting under the basket (the farm, then the village, then the farm again)
    var sc = RW / W, hh = Math.round(H * sc), off = Math.round(t * 6) % (hh * 2);
    [bg, bgVillage, bg].forEach(function (im, k) { ctx.drawImage(im, 0, 0, W, H, 0, k * hh - off, RW, hh); });
    ctx.globalAlpha = 0.4; px(0, 0, RW, RH, 0); ctx.globalAlpha = 1;   // haze: we are high up
    var night = curEnv(now()).phase === 'night';
    if (night) { ctx.globalAlpha = 0.45; px(0, 0, RW, RH, 4); ctx.globalAlpha = 1; }
    // the frame in the middle: corners only
    var fw = 26, fh = 30, fx = FRAME_X - fw / 2, fy = 14, fc = ride.flash > 0 ? 4 : 3;
    [[fx, fy], [fx + fw - 5, fy], [fx, fy + fh - 1], [fx + fw - 5, fy + fh - 1]].forEach(function (p) { px(p[0], p[1], 5, 1, fc); });
    [[fx, fy], [fx + fw - 1, fy], [fx, fy + fh - 5], [fx + fw - 1, fy + fh - 5]].forEach(function (p) { px(p[0], p[1], 1, 5, fc); });
    ride.lay.forEach(function (e) {
      var x = FRAME_X + (e.t - t) * BAL_SPEED;
      if (x < -20 || x > RW + 20) return;
      drawSight(e.id, x, 28 + Math.round(Math.sin(e.t * 3) * 3), t, ride.seen.indexOf(e.id) >= 0);
    });
    // the basket's rim at the bottom edge
    px(0, RH - 8, RW, 6, 4); for (var b = 2; b < RW; b += 6) px(b, RH - 7, 3, 4, 3);
  }
  // birds flap, clouds are puffs of paper with a grey edge; a seen one gets a tick above it
  var SIGHT_SPR = {
    whale:  ['....2222222......', '..22000000022...2', '.2000000000002.20', '200000000000000002', '.2000000000000022.', '..222222222222....'],
    rabbit: ['.2..2....', '.20.20...', '.20.20...', '2000002..', '200000022', '.2000000.2', '..22222.'],
    fishc:  ['...222....', '.2200022.2', '2000000020', '.2200022.2', '...222....'],
    sheep:  ['.22.22.22.', '2002002002', '.22.22.22.', '22.22.22..', '00200200..', '22.22.22..'],
    heart:  ['.22.22.', '2002002', '2000002', '.20002.', '..202..', '...2...'],
    dragon: ['22........22....', '0022....2200022.', '.200222200....22', '..2000000.......', '...22222........'],
    rainbow:['...4444444...', '.44.33333.44.', '4.33.222.33.4', '4.3.2...2.3.4'],
    snowc:  ['..2222..', '.200002.', '20000002', '.222222.', '.0..0..0', '..0..0..'],
    kite:   ['..4..', '.444.', '44344', '.444.', '..4..', '...4.', '..4..', '...4.'],
    moonhalo:['..2222..', '.2....2.', '2..44..2', '2..44..2', '.2....2.', '..2222..']
  };
  function birdAt(x, y, t, big, c) {
    var up = Math.floor(t * 6) % 2;
    if (big) { px(x - 4, y + (up ? -1 : 1), 4, 1, c); px(x + 1, y + (up ? -1 : 1), 4, 1, c); px(x - 1, y, 3, 2, c); }
    else { px(x - 2, y + (up ? -1 : 0), 2, 1, c); px(x + 1, y + (up ? -1 : 0), 2, 1, c); px(x, y, 1, 1, c); }
  }
  function drawSight(id, x, y, t, seen) {
    var sp = SIGHT_SPR[id];
    if (sp) spr(sp.map(function (r) { return r.replace(/2/g, '3'); }), x - Math.floor(sp[0].length / 2), y - Math.floor(sp.length / 2));
    else if (id === 'sparrow') { birdAt(x - 4, y, t, false, 4); birdAt(x + 2, y - 3, t + 0.3, false, 4); birdAt(x + 4, y + 3, t + 0.6, false, 4); }
    else if (id === 'geese') { for (var g = 0; g < 5; g++) birdAt(x - 8 + g * 4, y - 4 + Math.abs(g - 2) * 3, t + g * 0.1, false, 4); }
    else if (id === 'eagle') birdAt(x, y, t * 0.5, true, 4);
    else if (id === 'heron') { birdAt(x, y, t * 0.7, true, 2); px(x + 2, y - 2, 3, 1, 4); }
    else if (id === 'swallow') { birdAt(x, y, t, false, 4); px(x - 3, y + 1, 1, 2, 4); px(x + 3, y + 1, 1, 2, 4); }
    else if (id === 'magpie') { birdAt(x, y, t, true, 4); px(x + 2, y + 1, 5, 1, 4); px(x - 1, y + 1, 2, 1, 0); }
    else if (id === 'gull') { birdAt(x, y, t * 0.8, true, 3); px(x, y, 1, 1, 0); }
    else if (id === 'owl') { px(x - 3, y - 3, 7, 7, 4); px(x - 2, y - 2, 2, 2, 0); px(x + 1, y - 2, 2, 2, 0); px(x - 3, y - 4, 1, 1, 4); px(x + 3, y - 4, 1, 1, 4); }
    if (seen) { px(x - 1, y - 9, 1, 1, 4); px(x, y - 8, 1, 1, 4); px(x + 1, y - 9, 1, 1, 4); px(x + 2, y - 10, 1, 1, 4); }
  }
  function sightIcon(id, got) {
    var c = document.createElement('canvas'); c.width = 20; c.height = 14;
    var saved = ctx; ctx = c.getContext('2d');
    try { px(0, 0, 20, 14, 1); if (got) drawSight(id, 10, 7, 0, false); else { px(6, 5, 8, 4, 2); px(8, 4, 4, 1, 2); } }
    finally { ctx = saved; }
    return c;
  }

  // ---------- 마을 언덕 ----------
  function drawHill(tt) {
    var x = HILL[0], y = HILL[1], e = curEnv(now()), up = !!L.balloonFor(S, now()) || balForce;
    for (var j = 0; j < 12; j++) px(x + 22 - (6 + j * 2), y + 18 + j, 12 + j * 4, 1, e.season === 'winter' ? 0 : 2);   // the mound
    px(x + 12, y + 17, 20, 1, 4);
    px(x + 38, y + 20, 1, 9, 4); px(x + 34, y + 18, 10, 4, 4); px(x + 35, y + 19, 8, 2, 0);   // sign
    if (up) {
      var b = reduceMotion ? 0 : Math.round(Math.sin(tt * 1.6) * 1);
      px(x + 14, y - 6 + b, 16, 14, 4); px(x + 15, y - 5 + b, 14, 12, 0); px(x + 21, y - 5 + b, 2, 12, 2);   // envelope
      px(x + 16, y + 8 + b, 1, 4, 4); px(x + 27, y + 8 + b, 1, 4, 4); px(x + 17, y + 11 + b, 10, 5, 4); px(x + 18, y + 12 + b, 8, 3, 3);   // basket
    }
    if (e.season === 'winter') { px(x + 4, y + 26, 10, 1, 4); px(x + 4, y + 25, 1, 1, 4); px(x + 6, y + 23, 7, 2, 3); }   // sled at the foot
  }
  function tapHill(x, y) {
    if (!hit(HILL, x, y, 2)) return false;   // the balloon's top half sits over the kid's house: only the hill opens it
    openHill();
    return true;
  }
  function hhmm(ms) { var d = new Date(ms); return d.getHours() + ':' + ('0' + d.getMinutes()).slice(-2); }
  function openHill() {
    ride = { kind: 'menu' };
    rideTitle.textContent = '마을 언덕'; rideCv.hidden = true; rideMenu.hidden = false; rideStop.textContent = '닫기';
    rideMenu.innerHTML = '';
    var t = now(), e = curEnv(t), w = L.balloonFor(S, t), c = L.balloonCan(S, t), can = c.ok || balForce;
    rideTip.textContent = L.villageOk(S) ? '열기구는 현실 하루 몇 번 · 썰매는 게임 겨울에' : BAL_WHY.village;
    var nx = w || L.balloonNext(t);
    hillRow(balIcon(), '열기구', can ? '지금 떠 있어요 · ' + Math.max(1, Math.ceil((w ? w.end - t : L.BALLOON_LEN) / 60e3)) + '분 남음 · 하늘 도감 ' + L.sightCount(S) + '/' + L.SIGHTS.length
      : c.why === 'rode' ? '이번 열기구는 탔어요 · 다음은 ' + hhmm(L.balloonNext(w.end).start) : c.why === 'coins' ? '지금 떠 있어요 · 코인이 모자라요' : '다음 열기구 ' + hhmm(nx.start) + ' (' + L.BALLOON_LEN / 60e3 + '분)',
      can ? L.BALLOON_FARE.toLocaleString('ko-KR') : '–', can, function () { balStart(); }, '열기구 타기 ' + L.BALLOON_FARE + '코인');
    var winter = e.season === 'winter', sok = winter && L.villageOk(S);
    hillRow(sledIcon(), e.festival === 'winter' && winter ? '썰매 · 눈사람 축제' : '썰매',
      (winter ? (L.sledBest(S) ? '최고 기록 ' + L.sledBest(S) + '초' : '아직 기록 없음') : '게임 겨울에만 · 지금은 ' + L.SEASON_NAME[e.season]) + ' · 신기록 +' + L.SLED_RECORD_COINS,
      sok ? '타기' : '–', sok, function () { sledStart(); }, '썰매 타기');
    showRide();
  }
  function hillRow(icon, name, sub, label, ok, fn, aria) {
    var r = document.createElement('div'); r.className = 'up';
    var n = document.createElement('div'); n.className = 'n'; n.textContent = name;
    var sm = document.createElement('small'); sm.textContent = sub; n.appendChild(sm);
    var bt = document.createElement('button'); bt.type = 'button'; bt.textContent = label; bt.setAttribute('aria-label', aria);
    if (!ok) bt.disabled = true; else bt.className = 'go';
    bt.addEventListener('click', fn);
    r.appendChild(icon); r.appendChild(n); r.appendChild(bt); rideMenu.appendChild(r);
  }
  function iconOf(fn, w, h) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var saved = ctx; ctx = c.getContext('2d');
    try { fn(); } finally { ctx = saved; }
    return c;
  }
  function balIcon() { return iconOf(function () { px(2, 0, 12, 10, 4); px(3, 1, 10, 8, 0); px(7, 1, 2, 8, 2); px(4, 10, 1, 2, 4); px(11, 10, 1, 2, 4); px(5, 12, 6, 4, 4); }, 16, 16); }
  function sledIcon() { return iconOf(function () { px(1, 11, 14, 1, 4); px(1, 10, 1, 1, 4); px(3, 8, 10, 2, 3); px(7, 3, 3, 3, 4); px(6, 6, 4, 2, 2); }, 16, 16); }
  function bikeIcon() { return iconOf(function () { spr(BIKE_SPR, 4, 7); px(7, 2, 3, 3, 4); px(8, 5, 1, 3, 4); }, 16, 16); }

  // ---------- 상점 · 도감 ----------
  function renderRideShop() {
    var h3 = document.createElement('h3'); h3.textContent = '탈것'; shopEl.appendChild(h3);
    var own = L.bikeOk(S), r = document.createElement('div'); r.className = 'up';
    var n = document.createElement('div'); n.className = 'n'; n.textContent = '자전거';
    var sm = document.createElement('small');
    sm.textContent = own ? '주문 납품 옆 「자전거로」 · 배달 ' + S.bike.runs + '번' : '주문을 자전거로 배달 · 무사히 가면 팁 +' + Math.round(L.BIKE_TIP * 100) + '% 이상';
    n.appendChild(sm);
    var bt = document.createElement('button'); bt.type = 'button';
    if (own) { bt.textContent = '있음'; bt.disabled = true; bt.className = 'max'; }
    else {
      bt.textContent = L.BIKE_COST.toLocaleString('ko-KR'); bt.setAttribute('aria-label', '자전거 사기 ' + L.BIKE_COST + '코인');
      if (S.coins < L.BIKE_COST) bt.classList.add('poor');
      bt.addEventListener('click', function () {
        var res = L.buyBike(S);
        if (!res.ok) { toast(WHY[res.why] || '살 수 없어요'); bt.classList.remove('shake'); void bt.offsetWidth; bt.classList.add('shake'); return; }
        toast('자전거 · 주문 게시판에서 「자전거로」 배달해 보세요', 2800); refresh(); renderShop();
      });
    }
    r.appendChild(bikeIcon()); r.appendChild(n); r.appendChild(bt); shopEl.appendChild(r);
  }
  function renderRideDex(row) {
    var h3 = document.createElement('h3'); h3.textContent = '하늘';
    var b = document.createElement('b'); b.textContent = L.sightCount(S) + ' / ' + L.SIGHTS.length; h3.appendChild(b);
    dexEl.appendChild(h3);
    var p = document.createElement('p'); p.className = 'note';
    var bits = [];
    if (!S.bal) bits.push('마을 언덕 열기구에서 새·구름 모양을 모아요');
    if (L.sledBest(S)) bits.push('썰매 최고 ' + L.sledBest(S) + '초');
    if (S.bike && S.bike.clean) bits.push('자전거 무사 배달 ' + S.bike.clean + '번');
    if (bits.length) { p.textContent = bits.join(' · '); dexEl.appendChild(p); }
    L.SIGHTS.forEach(function (d) {
      var n = S.bal ? S.bal.seen[d.id] || 0 : 0, ic = sightIcon(d.id, !!n); ic.className = 'sq';
      row(ic, n ? d.name : '???', n ? (d.kind === 'bird' ? '새 · ' : '구름 · ') + d.hint : d.hint, n ? n + '번' : '', !n);
    });
  }

  // ---------- console hooks ----------
  function addRideHooks(FF) {
    // FF.ride('bike'|'sled'|'bal'|'hill'): start one now (bike needs a deliverable order; sled any season)
    FF.ride = function (kind) {
      if (kind === 'hill' || !kind) { openHill(); return ride; }
      if (kind === 'bal') { balForce = true; balStart(); return ride; }
      if (kind === 'sled') { var e = curEnv(now()); startRide('sled', L.sledLayout(Math.random, e.festival === 'winter'), '언덕 썰매', '탭 = 옆 줄로', { fest: e.festival === 'winter' ? L.festivalAt(now(), TZ) : null }); return ride; }
      if (kind === 'bike') {
        if (!L.bikeOk(S)) { S.coins += L.BIKE_COST; L.buyBike(S); }
        var o = S.orders[0].o || L.genOrder(S, Math.random); S.orders[0] = { o: o, at: 0 };
        while (L.bagCount(S, o.id) < o.n) S.bag.push({ id: o.id, v: 1 });
        bikeDeliver(0); return ride;
      }
      return null;
    };
    FF.rideTap = rideTap;
    FF.rideState = function () { return ride && { kind: ride.kind, t: ride.t, taps: ride.taps.slice(), done: ride.done, lay: ride.lay }; };
  }
