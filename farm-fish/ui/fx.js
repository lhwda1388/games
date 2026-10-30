
  // ---------- stage 8 ④ 이펙트: game feel in one place ----------
  // Every effect is time-based (performance.now), capped (L.FX_*), and dropped when stale, so a backgrounded tab
  // never piles anything up. Effects only draw; they never change game state or fishing outcomes.
  // prefers-reduced-motion: no shake, flash, darken, hit-stop or flying things; text and sprite changes stay.
  var reduceMotion = false;
  (function () {
    try {
      var mq = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
      if (!mq) return;
      reduceMotion = !!mq.matches;
      var on = function (e) { reduceMotion = !!e.matches; };
      if (mq.addEventListener) mq.addEventListener('change', on); else if (mq.addListener) mq.addListener(on);
    } catch (e) { /* old browser */ }
  })();
  var fxList = [], hitUntil = 0, hitSnap = null, harvestRun = null, basketBump = 0;
  var coinTween = null, coinLast = null, pressAt = null;
  function fxT() { return performance.now(); }
  function fxAdd(e) { e.t0 = fxT() + (e.delay || 0); L.fxPush(fxList, e, L.FX_LIVE); return e; }
  function fxShake(n) { if (!reduceMotion) shake = Math.max(shake, n); }

  // hit-stop: hold the last drawn picture for a moment; the game (and the reel) keeps running underneath
  function fxHitStop(ms) {
    if (reduceMotion) return;
    if (!hitSnap) hitSnap = document.createElement('canvas');
    hitSnap.width = cv.width; hitSnap.height = cv.height;
    hitSnap.getContext('2d').drawImage(cv, 0, 0);
    hitUntil = fxT() + ms;
  }
  function drawHitStop() {
    if (!hitSnap || fxT() >= hitUntil) return;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(hitSnap, 0, 0); ctx.restore();
  }

  // ---------- effects added by the game ----------
  // strike: freeze + splash rings round the float
  function fxStrike(x, y) {
    fxHitStop(L.FX_HITSTOP_MS);
    fxAdd({ k: 'splash', x: x, y: y, dur: 420 });
  }
  // a caught fish jumps out and drops into the basket corner (or turns into coins when it was sold at once)
  function fxCatch(f, x, y, sold) {
    var tier = L.fxTier(f);
    if (tier) fxShake(tier > 1 ? 4 : 2.5);
    if (tier > 1 && !reduceMotion) fxAdd({ k: 'legend', x: x, y: y, dur: 1300 });
    if (sold) { fxCoins(x, y, sold); return; }
    if (reduceMotion) return;
    fxAdd({ k: 'fly', img: fishCanvas(f.id), w: 16, h: 8, x0: x - 8, y0: y - 6, x1: 6, y1: 120, arc: 30, dur: 650, delay: tier > 1 ? 700 : 0, land: true });
  }
  // harvest / forage: the item pops up with dirt bits; 특상품 pops higher and sparkles; quick streaks show ×2 ×3
  function fxHarvest(x, y, img, won) {
    burst(x, y + 4, won ? 8 : 5, 4, 45);   // dirt bits
    harvestRun = L.fxCombo(harvestRun, fxT(), L.FX_COMBO_MS);
    if (harvestRun.n >= 2) floatText('×' + harvestRun.n, x + 12, y - 14);
    if (reduceMotion || !img) return;
    fxAdd({ k: 'pop', img: img, x: x, y: y, h: won ? 22 : 12, big: !!won, dur: won ? 650 : 480 });
  }
  // coins: a few pixel coins fly up to the wallet; the wallet number then rolls up (see coinsShown)
  function fxCoins(x, y, amount) {
    if (reduceMotion || !(amount > 0)) return;
    var n = Math.min(5, 2 + Math.floor(Math.log(amount) / Math.LN10));
    for (var k = 0; k < n; k++) fxAdd({ k: 'coin', x0: x + (k - n / 2) * 3, y0: y, x1: 16, y1: -4, arc: 10 + k * 3, dur: 420, delay: k * 45 });
  }
  // DOM coins for panels that cover the canvas (바구니 sell / deliver): from the last press to the visible wallet
  function fxCoinsDom(target) {
    if (reduceMotion || !pressAt || !target || !app.animate) return;
    var doc = app.ownerDocument, ar = app.getBoundingClientRect(), sc = ar.width / 360 || 1, tr = target.getBoundingClientRect();
    if (app.querySelectorAll('.coinfly').length >= 8) return;
    var x0 = (pressAt.x - ar.left) / sc, y0 = (pressAt.y - ar.top) / sc;
    var x1 = (tr.left - ar.left) / sc + 2, y1 = (tr.top - ar.top) / sc + 2;
    for (var k = 0; k < 4; k++) {
      var d = doc.createElement('i'); d.className = 'coin coinfly';
      d.style.left = Math.round(x0 - 5 + (k - 1.5) * 6) + 'px'; d.style.top = Math.round(y0 - 5) + 'px';
      app.appendChild(d);
      var dx = x1 - (x0 - 5 + (k - 1.5) * 6), dy = y1 - (y0 - 5);
      var a = d.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(' + dx * 0.5 + 'px,' + (dy * 0.5 - 24) + 'px)', offset: 0.5 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px)' }], { duration: 420, delay: k * 50, easing: 'cubic-bezier(.4,0,.9,.6)', fill: 'forwards' });
      a.onfinish = a.oncancel = (function (el) { return function () { el.remove(); }; })(d);
    }
  }
  // 해금 · 신기록 · 도감 첫 등록: a short stamp landing
  function fxStamp(el) {
    if (!el || reduceMotion) return;
    el.classList.remove('stamp'); void el.offsetWidth; el.classList.add('stamp');
  }

  // ---------- wallet count-up ----------
  // value to show for the wallet: gains roll up over FX_COUNT_MS, spending shows at once
  function coinsShown(v) {
    var t = fxT();
    if (coinLast === null) coinLast = v;
    if (v !== coinLast) {
      var from = coinTween ? L.fxCount(coinTween.from, coinTween.to, t - coinTween.t0, L.FX_COUNT_MS) : coinLast;
      coinTween = v > coinLast && !reduceMotion ? { from: from, to: v, t0: t } : null;
      coinLast = v;
    }
    if (coinTween && t - coinTween.t0 >= L.FX_COUNT_MS) coinTween = null;
    return coinTween ? L.fxCount(coinTween.from, coinTween.to, t - coinTween.t0, L.FX_COUNT_MS) : v;
  }
  var coinsRolling = false;
  function coinsFrame() {
    if (!coinTween && !coinsRolling) return;
    var v = coinsShown(S.coins);
    coinsRolling = !!coinTween;   // one more frame after the roll ends writes the final number
    coinsEl.textContent = coinsFmt(v);
    var w = bagEl.hidden ? null : bagEl.querySelector('.wnum');
    if (w) w.textContent = v.toLocaleString('ko-KR');
  }

  // ---------- draw (called once per frame, after the particles) ----------
  function arcAt(e, p) {
    var q = L.fxEase(p);
    return { x: e.x0 + (e.x1 - e.x0) * q, y: e.y0 + (e.y1 - e.y0) * q - Math.sin(p * Math.PI) * e.arc };
  }
  function drawFx(tt) {
    var t = fxT();
    L.fxPrune(fxList, t);
    for (var n = 0; n < fxList.length; n++) {
      var e = fxList[n], p = (t - e.t0) / e.dur;
      if (p < 0) continue;
      if (e.k === 'splash') {
        ring(e.x, e.y + 1, 3 + p * 10, 1.5 + p * 4, p < 0.5 ? 4 : 3);
        if (p < 0.6) ring(e.x, e.y + 1, 1 + p * 6, 0.5 + p * 2.5, 0);
        for (var s = 0; s < 4; s++) px(e.x - 6 + s * 4, e.y - 2 - Math.sin(p * Math.PI) * (4 + (s % 2) * 3), 1, 1, 0);
      } else if (e.k === 'fly') {
        var a = arcAt(e, p);
        ctx.imageSmoothingEnabled = false; ctx.drawImage(e.img, Math.round(a.x), Math.round(a.y), e.w, e.h);
        if (e.land && p > 0.92 && !e.done) { e.done = true; basketBump = t + 160; }
      } else if (e.k === 'pop') {
        var lift = e.h * 4 * p * (1 - p), sz = e.big ? 18 : 12, iw = e.img.width * sz / 12, ih = e.img.height * sz / 12;
        ctx.imageSmoothingEnabled = false;
        ctx.globalAlpha = p > 0.8 ? (1 - p) / 0.2 : 1;
        ctx.drawImage(e.img, Math.round(e.x - iw / 2), Math.round(e.y - ih - lift), Math.round(iw), Math.round(ih));
        ctx.globalAlpha = 1;
        if (e.big) { sparkle(e.x - 11, e.y - 10 - lift, tt); sparkle(e.x + 11, e.y - 16 - lift, tt + 0.5); sparkle(e.x + 2, e.y - 24 - lift, tt + 0.25); }
      } else if (e.k === 'coin') {
        var c = arcAt(e, p);
        px(c.x - 1, c.y - 1, 3, 3, 4); px(c.x, c.y, 1, 1, Math.floor(p * 8) % 2 ? 0 : 2);
      } else if (e.k === 'legend') {
        // darken, then a beam of light falls on the fish
        var dk = p < 0.3 ? p / 0.3 : Math.max(0, 1 - (p - 0.3) / 0.7);
        ctx.globalAlpha = 0.5 * dk; px(0, 0, W, H, 4);
        if (p >= 0.3) {
          var q = (p - 0.3) / 0.7, bw = Math.round(4 + q * 10);
          ctx.globalAlpha = 0.85 * (1 - q); px(e.x - bw / 2, 0, bw, e.y + 4, 0);
          ctx.globalAlpha = 0.6 * (1 - q); px(e.x - bw / 2 - 2, 0, 1, e.y + 4, 1); px(e.x + bw / 2 + 1, 0, 1, e.y + 4, 1);
        }
        ctx.globalAlpha = 1;
      }
    }
  }
  function fxBasketDy() { return fxT() < basketBump ? -2 : 0; }

  // remember where the last press landed (panel buttons have no game coordinates)
  app.addEventListener('pointerdown', function (e) { pressAt = { x: e.clientX, y: e.clientY }; }, true);
  // end of frame: hit-stop picture on top, wallet roll
  function fxEnd() { drawHitStop(); coinsFrame(); }
