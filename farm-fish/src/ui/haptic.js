  // ---------- 진동: navigator.vibrate buzzes beside a few sfx calls (bite, snap, bumps, ...), never in logic/ ----------
  // hapt(pattern, minGap) is a silent no-op without navigator.vibrate (iOS Safari, desktop) or with ⚙ 설정 「진동」 off.
  // On/off lives in localStorage, not in the save. Buzzes never stack: at least HAPT_GAP ms apart (minGap widens it).
  var HAPT_KEY = 'farmfish.vibe', HAPT_GAP = 150, haptLast = -1e9;
  var haptOn = (function () { try { return localStorage.getItem(HAPT_KEY) !== '0'; } catch (e) { return true; } })();
  function haptOK() { try { return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'; } catch (e) { return false; } }
  function hapt(pattern, minGap) {
    try {
      if (!haptOn || !haptOK()) return;
      var t = performance.now();
      if (t - haptLast < (minGap || HAPT_GAP)) return;
      haptLast = t;
      navigator.vibrate(pattern);
    } catch (e) { /* no buzz */ }
  }
  // iOS has no vibrate. iOS 18+ Safari ticks the Taptic Engine when a <label> tied to <input type=checkbox switch> is clicked
  // synchronously inside a user gesture, so haptTap() is only for real tap handlers (never bite, timers or collisions).
  function haptIOS() {
    try { return typeof navigator !== 'undefined' && typeof document !== 'undefined' && !haptOK() && (/iP(hone|ad|od)/.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)); } catch (e) { return false; }
  }
  var haptLbl = null;
  // ms: Android length (default 10); iOS always gets its one fixed tick
  function haptTap(ms) {
    try {
      if (!haptOn) return;
      if (haptOK()) { hapt(ms || 10); return; }
      if (!haptIOS()) return;
      var t = performance.now();
      if (t - haptLast < HAPT_GAP) return;
      haptLast = t;
      if (!haptLbl) {
        haptLbl = document.createElement('label'); haptLbl.setAttribute('aria-hidden', 'true');
        haptLbl.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;overflow:hidden;pointer-events:none';
        var sw = document.createElement('input'); sw.type = 'checkbox'; sw.setAttribute('switch', ''); sw.tabIndex = -1;
        haptLbl.appendChild(sw);
        haptLbl.addEventListener('click', function (e) { e.stopPropagation(); });   // keep it from sndClick and the other document click handlers
        document.body.appendChild(haptLbl);
      }
      haptLbl.click();
    } catch (e) { /* no tick */ }
  }
  function haptSet(on) {
    haptOn = on;
    try { localStorage.setItem(HAPT_KEY, on ? '1' : '0'); } catch (e) { /* storage blocked: setting lasts this session */ }
    if (on) hapt(30);
  }
