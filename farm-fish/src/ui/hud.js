  // ---------- runtime UI state ----------
  var reel = null, reelRoll = null, reelVis = null;
  var holdPointer = false, holdSpace = false, boss = false;
  var castAnim = null, particles = [], shake = 0, lastFishRes = 0;
  var swimmers = [], nextSwim = 3, scareFx = null, flyCrows = [], scareWob = 0, earlyTips = 0;

  // ---------- toast / floats ----------
  var toastTimer = 0;
  function toast(msg, ms) {
    toastEl.textContent = msg; toastEl.classList.add('on');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, ms || 2200);
  }
  function floatText(text, x, y) {
    while (floatsEl.children.length >= L.FX_FLOATS) floatsEl.removeChild(floatsEl.firstChild);   // stage 8 ④: cap
    var d = document.createElement('div');
    d.className = 'float'; d.textContent = text;
    d.style.left = (x * 2) + 'px'; d.style.top = (36 + y * 2) + 'px';
    floatsEl.appendChild(d);
    setTimeout(function () { d.remove(); }, 1150);
  }
  function burst(x, y, n, c, spread) {
    n = L.fxRoom(particles.length, n, L.FX_PARTICLES);   // stage 8 ④: hard cap
    for (var k = 0; k < n; k++) particles.push({ x: x, y: y, vx: (Math.random() - 0.5) * (spread || 40), vy: -Math.random() * 40 - 10, life: 0.6 + Math.random() * 0.4, c: c });
  }
  function drawParticles(dt) {
    for (var n = particles.length - 1; n >= 0; n--) {
      var q = particles[n];
      q.life -= dt; if (q.life <= 0) { particles.splice(n, 1); continue; }
      q.vy += 90 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      px(q.x, q.y, 1, 1, q.c);
      if (q.c === 0) px(q.x + 1, q.y, 1, 1, 4);
    }
  }

