  // ---------- title notification ----------
  function attention() {
    var n = S.fish.phase === 'bite' ? 1 : 0;
    S.plots.forEach(function (p) { if (p.crow || p.weed || L.isReady(p)) n++; });
    return n + deliverable() + (L.potReady(S, now()) ? 1 : 0) + yardAttention() + boomBadge();   // stage 8: 입질 폭풍 / 대풍년 on
  }
  function updateTitle() {
    var away = document.hidden || !document.hasFocus();
    var n = attention();
    var want = away && n > 0 ? '(' + n + ') 메모' : '메모';
    if (document.title !== want) document.title = want;
  }

  // ---------- logic tick ----------
  function tick() {
    var t = now();
    tickDaily(t);      // stage 4: today's list first, so this tick's harvests count
    tickFarm(t);
    tickBasket(t);
    cmpTripTick(t);    // 캠핑 물가: morning ends the night fishing (before a bite is rolled)
    tickFishing(t);
    tickYard(t);
    tickForestUI(t);   // stage 5A: 숲 spots, pet finds, 도전 timeout
    tickStage7B(t);    // stage 7: 동굴 gauge, 별 잇기 at dawn
    tickOrchardUI(t); tickBugsUI();   // stage 6A: fruit, honey, insects
    tickVillageUI(t);  // stage 6B: 지금 할 일 bar, visit sheet refresh
    tickFlatUI(t); tickCameraUI(t);   // stage 7 ①: tide tag, 사진기 button
    tickIsleUI(t);     // stage 7 섬: drift washes up, sheets follow the scene
    tickRideUI(t);     // stage 9 ②: 깊은 숲·산꼭대기 spots, 도전 cleanup
    tickShipUI(t);     // stage 9 ①: 먼 섬 drift, 배 sheet
    tickGardenUI(t);   // stage 10 ②: 꽃 교배, 새끼
    tickCraftUI(t);    // 가공 공방 sheet
    tickCampUI(t);     // 캠핑: morning wake-up, camp sheets
    tickEventsUI(t);   // stage 8 ①: 오늘의 날 card, boom chip
    tickContestUI(t);  // stage 10 ①: 낚시 대회 week, 결산 카드 year
    tickFest(t);       // stage 5B: festival on/off, header chip
    tickNotice(t);     // a short condition opened an uncaught fish/find here
    trnTick(t);        // 기차 여행: 온천욕 chip
    renderTray();
    updateTitle();
  }
  var booted = false;
  setInterval(tick, 200);
  setInterval(save, 5000);

  // ---------- render ----------
  function frame(dt) {
    var tt = performance.now() / 1000;
    tickMini(dt);      // stage 5B: 자물쇠 / 불 조절 도전
    tickRide(dt);      // stage 9 ③: 자전거·썰매·열기구
    tickArcade(dt);    // 게임장: the round on its own board
    mysTick();         // 내 가게: customers while the game is open
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (reel && reel.tension > 0.7) shake = Math.max(shake, (reel.tension - 0.7) * 5);
    var sx = shake > 0.3 && !reduceMotion ? Math.round((Math.random() - 0.5) * shake) : 0;
    var sy = shake > 0.3 && !reduceMotion ? Math.round((Math.random() - 0.5) * shake) : 0;
    shake = Math.max(0, shake - dt * 8);
    scareWob = Math.max(0, scareWob - dt);
    ctx.translate(sx, sy);
    if (drawScene(tt, dt)) { drawFestival(tt); drawBugs(tt); drawParticles(dt); drawFx(tt); drawChallenge(); drawDig(); ctx.restore(); fxEnd(); return; }   // stage 3: 마당 / 집 안 (+ 5A 숲, 5B festival sky)
    ctx.drawImage(bg, 0, 0);
    var trip = trnTrip();        // 기차 여행 물가: the destination's land, no 밭 (it keeps growing at home)

    drawWater(tt, dt);
    drawIce(tt);                 // stage 4: winter 연못 freezes (얼음낚시)
    if (!trip) {
      drawSeasonGround('farm');  // stage 4: blossoms, tall grass, fallen leaves, snow drifts
      drawFarm(tt, dt);
    }
    drawFarmSign();              // stage 10 ①: 농장 간판 (hides its name tag on a trip)
    drawDecor(tt);
    drawVisitors(tt, dt, 'pond');
    drawBasketCorner(tt);
    var tip = drawFishing(tt, dt);
    drawFarmer(tt);
    if (!trip) drawPet(tt, dt, 'farm');   // stage 5A
    drawRod(tip);
    drawBugs(tt);      // stage 6A
    drawParticles(dt);
    drawFx(tt);               // stage 8 ④: splash, fly-to-basket, pops, coins, legend beam
    drawWeather(tt, dt);
    drawChallenge();          // stage 5A: 수확 도전 gauge
    drawDig();                // stage 8 ③: 꾹 눌러 파기 ring
    drawFestival(tt);            // stage 5B: petals, fireworks, moon on the water
    ctx.restore();
    fxEnd();
  }

  // ---------- loop (rAF of whichever window currently hosts the game) ----------
  var curWin = window, gen = 0;
  function startLoop() {
    var my = ++gen, w = curWin, last = 0;
    function step(ts) {
      if (my !== gen) return;
      var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
      last = ts;
      frame(dt);
      w.requestAnimationFrame(step);
    }
    w.requestAnimationFrame(step);
  }

  // ---------- fit to window ----------
  function fit() {
    var w = curWin.innerWidth, h = curWin.innerHeight;
    var s = Math.min(w / 360, h / 480);
    app.style.transform = 'scale(' + s + ')';
    // the main-tab hint sits over the pond, scaled with the game, clear of the toast line
    if (curWin === window) pipHint.style.transform = 'translate(-50%,-50%) translateY(' + Math.round(80 * s) + 'px) scale(' + s + ')';
  }

