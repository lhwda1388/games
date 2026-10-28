  var L = globalThis.Logic;
  var qs = new URLSearchParams(location.search);
  var SPEED = Math.max(1, Math.min(3600, Number(qs.get('speed')) || 1));
  var SAVE_KEY = SPEED === 1 ? 'farmfish.v1' : 'farmfish.debug';
  var T0 = Date.now(), base = T0;
  function now() { return SPEED === 1 ? Date.now() : base + (Date.now() - T0) * SPEED; }

  // ---------- palette: read the five grayscale tokens so canvas and DOM share them ----------
  if (qs.get('bg') === 'transparent') document.documentElement.style.setProperty('--bg', 'transparent');
  var css = getComputedStyle(document.documentElement);
  var G = ['--g0', '--g1', '--g2', '--g3', '--g4'].map(function (v) { return css.getPropertyValue(v).trim(); });

  // ---------- state ----------
  // Save safety: the very first load by a save-safe version keeps the untouched string in <key>.bak (once ever). A save that
  // will not decode is never overwritten: it is copied aside and this session plays without saving.
  var S = null, saveBlocked = false, BAK_KEY = SAVE_KEY + '.bak', raw = null;
  try { raw = localStorage.getItem(SAVE_KEY); } catch (e) { /* storage blocked: play without saving */ }
  if (raw) {
    // The backup is best effort (it can hit the storage quota); a failure must not cost the real save.
    try { if (localStorage.getItem(BAK_KEY) === null) localStorage.setItem(BAK_KEY, raw); } catch (e) {}
    try { S = L.decode(raw); } catch (e) { S = null; }
    if (!S) {
      saveBlocked = true;
      try { if (localStorage.getItem(BAK_KEY) !== raw) localStorage.setItem(SAVE_KEY + '.bad', raw); } catch (e) {}
    }
  }
  // Two tabs on one save: the 'storage' event only fires in the OTHER tab, so whichever tab saves first
  // keeps saving and the other stops, instead of the two overwriting each other every 5 s.
  window.addEventListener('storage', function (e) {
    if (e.key !== SAVE_KEY || saveBlocked) return;
    saveBlocked = true;
    if (typeof toast === 'function') toast('다른 창에서 게임이 열려 있어요 · 이 창은 저장을 멈춰요', 6000);
  });
  var fresh = !S;
  if (S && SPEED !== 1 && S.savedAt > base) base = S.savedAt;
  if (!S) S = L.newState(now(), Math.random);
  else L.resume(S, now(), Math.random);
  function save() {
    if (saveBlocked) return;
    S.savedAt = now();
    try { localStorage.setItem(SAVE_KEY, L.encode(S)); } catch (e) { /* storage blocked: play without saving */ }
  }

  // ---------- DOM ----------
  var app = document.getElementById('app');
  var stageEl = document.getElementById('stage');
  var cv = document.getElementById('cv'), ctx = cv.getContext('2d');
  var W = 180, H = 200;
  var $ = function (id) { return document.getElementById(id); };
  var bagEl = $('bag'), bagBtn = $('bagBtn');
  var coinsEl = $('coins'), toastEl = $('toast'), trayEl = $('tray'), reelHud = $('reelHud');
  var tBar = $('tBar'), cBar = $('cBar'), tWrap = $('tWrap'), cueEl = $('reelCue');
  var resultEl = $('result'), dexEl = $('dex'), shopEl = $('shop'), bossEl = $('boss'), floatsEl = $('floats');
  var dexBtn = $('dexBtn'), shopBtn = $('shopBtn'), pipBtn = $('pipBtn');

