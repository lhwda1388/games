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
  function haptSet(on) {
    haptOn = on;
    try { localStorage.setItem(HAPT_KEY, on ? '1' : '0'); } catch (e) { /* storage blocked: setting lasts this session */ }
    if (on) hapt(30);
  }
