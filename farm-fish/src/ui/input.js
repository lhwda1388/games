  // ---------- pointer / keys ----------
  function toLocal(e) {
    var r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  }
  cv.addEventListener('pointerdown', function (e) {
    if (boss) return;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (er) { /* capture not available */ }
    holdPointer = true;
    var p = toLocal(e);
    tap(p.x, p.y);
  });
  function release() { holdPointer = false; }
  cv.addEventListener('pointerup', release);
  cv.addEventListener('pointercancel', release);
  cv.addEventListener('lostpointercapture', release);

  function fmtLeft(ms) {
    var s = Math.ceil(ms / 1000 / SPEED);
    if (s >= 60) return Math.floor(s / 60) + '분 ' + (s % 60) + '초';
    return s + '초';
  }
  function tap(x, y) {
    if (reel) return;
    if (!resultEl.hidden) hideResult();
    if (tapScene(x, y)) return;
    if (S.fish.phase === 'bite') { doStrike(); return; }
    if (tapPlot(x, y)) return;
    if (tapCorner(x, y)) return;
    tapPond(x, y);
  }
  function refresh() { renderTray(); save(); updateTitle(); }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      var moving = pick && pick.moving; closePick();     // Esc first cancels 옮기기; otherwise it is the boss key
      if (!moving) toggleBoss();
      return;
    }
    if (isPipKey(e)) { e.preventDefault(); if (pipOK && !e.repeat) togglePip(); return; }
    if (boss) return;
    var tg = e.target && e.target.tagName;
    if (tg === 'INPUT' || tg === 'TEXTAREA') return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (e.repeat) return;
      holdSpace = true;
      if (reel) return;
      if (!resultEl.hidden) hideResult();
      if (S.fish.phase === 'bite' || S.fish.phase === 'wait') doStrike();
      else if (S.fish.phase === 'idle' && dexEl.hidden && shopEl.hidden && bagEl.hidden) {
        var a = Math.random() * Math.PI * 2, k = Math.sqrt(Math.random()) * 0.6;
        L.cast(S, now(), Math.random, Math.round(POND.cx + Math.cos(a) * POND.rx * k), Math.round(POND.cy + Math.sin(a) * POND.ry * k));
        castAnim = { t: 0 }; refresh();
      }
    }
  }
  // P toggles PiP on any layout or case: physical KeyP, p/P, or the Korean IME jamo on that key
  function isPipKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    var t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return false;
    return e.code === 'KeyP' || (typeof e.key === 'string' && (e.key.toLowerCase() === 'p' || e.key === 'ㅔ'));
  }
  function onKeyUp(e) { if (e.code === 'Space') holdSpace = false; }
  function bindDoc(doc, win) {
    doc.addEventListener('keydown', onKeyDown);
    doc.addEventListener('keyup', onKeyUp);
    win.addEventListener('blur', function () { holdSpace = false; holdPointer = false; updateTitle(); });
    win.addEventListener('focus', updateTitle);
    win.addEventListener('resize', fit);
  }
  bindDoc(document, window);
  document.addEventListener('visibilitychange', function () { updateTitle(); if (document.hidden) save(); });
  window.addEventListener('pagehide', save);

  function toggleBoss() {
    boss = !boss;
    bossEl.hidden = !boss;
    holdPointer = false; holdSpace = false;
  }

