  // ---------- title notification ----------
  function attention() {
    var n = S.fish.phase === 'bite' ? 1 : 0;
    S.plots.forEach(function (p) { if (p.crow || p.weed || L.isReady(p)) n++; });
    return n + deliverable() + (L.potReady(S, now()) ? 1 : 0) + yardAttention();
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
    tickFishing(t);
    tickYard(t);
    renderTray();
    updateTitle();
  }
  var booted = false;
  setInterval(tick, 200);
  setInterval(save, 5000);

  // ---------- render ----------
  function frame(dt) {
    var tt = performance.now() / 1000;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (reel && reel.tension > 0.7) shake = Math.max(shake, (reel.tension - 0.7) * 5);
    var sx = shake > 0.3 ? Math.round((Math.random() - 0.5) * shake) : 0;
    var sy = shake > 0.3 ? Math.round((Math.random() - 0.5) * shake) : 0;
    shake = Math.max(0, shake - dt * 8);
    scareWob = Math.max(0, scareWob - dt);
    ctx.translate(sx, sy);
    if (drawScene(tt, dt)) { drawParticles(dt); ctx.restore(); return; }   // stage 3: 마당 / 집 안
    ctx.drawImage(bg, 0, 0);

    drawWater(tt, dt);
    drawIce(tt);                 // stage 4: winter 연못 freezes (얼음낚시)
    drawSeasonGround('farm');    // stage 4: blossoms, tall grass, fallen leaves, snow drifts
    drawFarm(tt, dt);
    drawDecor(tt);
    drawVisitors(tt, dt, 'pond');
    drawBasketCorner(tt);
    var tip = drawFishing(tt, dt);
    drawFarmer(tt);
    drawRod(tip);
    drawParticles(dt);
    drawWeather(tt, dt);
    ctx.restore();
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

