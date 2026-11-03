  // ---------- 소리: tiny Web Audio synth, no files ----------
  // sfx(name) is a silent no-op before the first pointerdown/keydown (sndWake, bound in bindDoc for the tab and the PiP
  // window), while muted, or without Web Audio. Graph: voices → sndSfx (bus, soft lowpass) → sndMaster → speakers;
  // the music and ambient buses hang off sndMaster too. On/off and 크기 live in localStorage, not in the save.
  var SND_KEY = 'farmfish.sound';
  var sndOn = (function () { try { return localStorage.getItem(SND_KEY) !== '0'; } catch (e) { return true; } })();
  var SFX_KEY = 'farmfish.sfx';
  var sfxOn = (function () { try { return localStorage.getItem(SFX_KEY) !== '0'; } catch (e) { return true; } })();
  // 크기 0–100 per bus (⚙ 설정 sliders), kept before the AudioContext exists and applied when each bus is made.
  // 100 = the gains the mix was made at; squared so the middle of the slider sounds like the middle.
  var VOL_KEY = 'farmfish.vol.', VOL = {};
  ['master', 'sfx', 'music', 'ambient'].forEach(function (k) {
    var v = null; try { v = localStorage.getItem(VOL_KEY + k); } catch (e) { /* storage blocked: full volume */ }
    VOL[k] = v !== null && v !== '' && isFinite(+v) ? Math.max(0, Math.min(100, Math.round(+v))) : 100;
  });
  var sndCtx = null, sndMaster = null, sndSfx = null, sndNoise = null;
  var sndLast = {}, sndAny = -1e9, sndEnds = [];
  var SND_VOICES = 8, SND_GAP = 60, SND_SOFT = 80;
  function sndWake() {
    if (!sndOn) return;
    if (!sndCtx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { sndOn = false; return; }
      try { sndCtx = new AC(); } catch (e) { sndOn = false; return; }
      // a limiter after the master: at 100% the game sits near other tabs' loudness and stacked sounds don't clip (VOC: 100%가 너무 작음)
      var lim = sndCtx.createDynamicsCompressor();
      lim.threshold.value = -6; lim.knee.value = 3; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.2;
      lim.connect(sndCtx.destination);
      sndMaster = sndCtx.createGain(); sndMaster.gain.value = volBus('master'); sndMaster.connect(lim);
      var lp = sndCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4500; lp.connect(sndMaster);
      sndSfx = sndCtx.createGain(); sndSfx.gain.value = volBus('sfx'); sndSfx.connect(lp);
      var n = sndCtx.sampleRate, buf = sndCtx.createBuffer(1, n, n), d = buf.getChannelData(0);
      for (var k = 0; k < n; k++) d[k] = Math.random() * 2 - 1;
      sndNoise = buf;
    }
    if (sndCtx.state !== 'running' && (!document.hidden || pipWin)) sndCtx.resume();   // also iOS 'interrupted'; PiP plays while the tab hides
  }
  // a hidden tab is quiet unless the PiP window is showing the game
  function sndVis() {
    if (!sndCtx) return;
    if (document.hidden && !pipWin) sndCtx.suspend(); else if (sndOn) sndCtx.resume();
  }
  document.addEventListener('visibilitychange', sndVis);

  // per-play variation (소리 다양성): sfx sets these for the one sound it plays — pitch ±3%, length ±10% — then puts them
  // back to 1, so the ambient one-shots and the 소리 도감 replays that share sndOsc/sndHiss are never touched. UI Math.random only.
  var sndP = 1, sndD = 1;
  // one voice: oscillator from f0 (slide to f1) with a short attack and an exponential fall; returns its end time
  function sndOsc(type, f0, f1, t, dur, vol, dest) {
    var o = sndCtx.createOscillator(), g = sndCtx.createGain();
    f0 *= sndP; f1 *= sndP; dur *= sndD;
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || sndSfx); o.start(t); o.stop(t + dur + 0.02);
    return t + dur;
  }
  // filtered noise (filter freq slides f0 → f1)
  function sndHiss(kind, f0, f1, t, dur, vol, dest) {
    var s = sndCtx.createBufferSource(), f = sndCtx.createBiquadFilter(), g = sndCtx.createGain();
    f0 *= sndP; f1 *= sndP; dur *= sndD;
    s.buffer = sndNoise; f.type = kind; f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || sndSfx); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
    return t + dur;
  }
  // notes one after another, each `step` apart
  function sndSeq(type, fs, t, step, dur, vol, dest) {
    var end = t;
    step *= sndD;
    fs.forEach(function (f, k) { end = sndOsc(type, f, f, t + k * step, k === fs.length - 1 ? dur * 1.6 : dur, vol, dest); });
    return end;
  }
  // ---- materials ----
  // metal: a 2-operator FM bell; the modulator (ratio × f) fades so the clang clears into a ring
  function sndFM(f, ratio, index, t, dur, vol, dest) {
    var c = sndCtx.createOscillator(), m = sndCtx.createOscillator(), mg = sndCtx.createGain(), g = sndCtx.createGain();
    f *= sndP; dur *= sndD;
    c.frequency.value = f; m.frequency.value = f * ratio;
    mg.gain.setValueAtTime(f * index, t); mg.gain.exponentialRampToValueAtTime(f * index * 0.04 + 0.01, t + dur * 0.6);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    m.connect(mg); mg.connect(c.frequency); c.connect(g); g.connect(dest || sndSfx);
    c.start(t); m.start(t); c.stop(t + dur + 0.02); m.stop(t + dur + 0.02);
    return t + dur;
  }
  // bells one after another
  function sndBells(fs, t, step, dur, vol, ratio, dest) {
    var end = t;
    step *= sndD;
    fs.forEach(function (f, k) { end = sndFM(f, ratio || 3.5, 1.4, t + k * step, k === fs.length - 1 ? dur * 1.8 : dur, vol, dest); });
    return end;
  }
  // string: a short Karplus-Strong pluck (a burst of noise looped through a one-period delay that averages itself down)
  function sndPluck(f, t, dur, vol, dest) {
    f *= sndP; dur *= sndD;
    var sr = sndCtx.sampleRate, n = Math.ceil(sr * dur), N = Math.max(2, Math.round(sr / f - 0.5)), b = sndCtx.createBuffer(1, n, sr), d = b.getChannelData(0), k;
    for (k = 0; k < N && k < n; k++) d[k] = Math.random() * 2 - 1;
    for (; k < n; k++) d[k] = 0.498 * (d[k - N] + (k > N ? d[k - N - 1] : 0));
    var s = sndCtx.createBufferSource(), g = sndCtx.createGain();
    s.buffer = b; vol *= 0.3; g.gain.setValueAtTime(vol, t); g.gain.setValueAtTime(vol, t + dur * 0.7);   // the noise burst peaks near 1: a third
    g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(g); g.connect(dest || sndSfx); s.start(t); s.stop(t + dur + 0.02);
    return t + dur;
  }
  function sndPlucks(fs, t, step, dur, vol, dest) {
    var end = t;
    step *= sndD;
    fs.forEach(function (f, k) { end = sndPluck(f, t + k * step, k === fs.length - 1 ? dur * 1.6 : dur, vol, dest); });
    return end;
  }
  // wood: a click of band-passed noise over a short resonant tone
  function sndWood(f, t, dur, vol, dest) {
    sndHiss('bandpass', f * 4, f * 3, t, 0.02, vol * 1.4, dest);
    return sndOsc('triangle', f * 1.25, f, t, dur, vol, dest);
  }
  // water: a sine that pops upward
  function sndDrop(f, t, vol, dest) { return sndOsc('sine', f, f * 2.3, t, 0.07, vol, dest); }
  // ---- place palettes: 동굴 = an echo send, 바다·잠수 = wide (left dry, right a few ms later) ----
  var sndEchoIn = null, sndWideIn = null;
  function sndCave() {
    if (sndEchoIn && sndEchoIn.context === sndCtx) return sndEchoIn;
    var i = sndCtx.createGain(), d = sndCtx.createDelay(1), fb = sndCtx.createGain(), lp = sndCtx.createBiquadFilter(), w = sndCtx.createGain();
    d.delayTime.value = 0.13; fb.gain.value = 0.36; lp.type = 'lowpass'; lp.frequency.value = 1700; w.gain.value = 0.55;
    i.connect(sndSfx); i.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(w); w.connect(sndSfx);
    return (sndEchoIn = i);
  }
  function sndWide() {
    if (sndWideIn && sndWideIn.context === sndCtx) return sndWideIn;
    var i = sndCtx.createGain(), l = sndCtx.createStereoPanner(), r = sndCtx.createStereoPanner(), d = sndCtx.createDelay(0.1);
    l.pan.value = -0.6; r.pan.value = 0.6; d.delayTime.value = 0.019;
    i.connect(l); i.connect(d); d.connect(r); l.connect(sndSfx); r.connect(sndSfx);
    return (sndWideIn = i);
  }
  // ---- context args ----
  // a fish's species length (L.fishById(id).max, cm) → 0 (피라미) … 1 (the biggest): the splash grows with it
  function sndBig(a) { return a > 0 ? Math.max(0, Math.min(1, Math.log(a / 8) / Math.log(30))) : 0.3; }
  // coins received → how many clinks: 1–9 one, 10s two, 100s three, 1000s four, more five
  function sndCount(a) { return a > 0 ? Math.max(1, Math.min(5, 1 + Math.floor(Math.log(a) / Math.LN10))) : 2; }
  // crop → how it comes out of the ground: root (a dull pull), pop (juicy), snap (a crisp stalk); unknown ids get one by name
  var SND_CROP = { radish: ['root', 230], potato: ['root', 170], sweetpotato: ['root', 150], pumpkin: ['root', 120], berry: ['pop', 780],
    tomato: ['pop', 560], melon: ['pop', 300], cucumber: ['pop', 640], pepper: ['snap', 900], corn: ['snap', 700], cabbage: ['snap', 480], ssuk: ['snap', 1100] };
  function sndCrop(id) {
    if (SND_CROP[id]) return SND_CROP[id];
    var h = 0, s = String(id || '');
    for (var k = 0; k < s.length; k++) h = (h * 31 + s.charCodeAt(k)) % 997;
    return [['root', 'pop', 'snap'][h % 3], 200 + h % 600];
  }
  function sndPull(t, id) {
    var c = sndCrop(id);
    sndHiss('lowpass', 700, 220, t, 0.1, 0.07);   // soil
    if (c[0] === 'root') { sndWood(c[1], t + 0.04, 0.11, 0.05); return sndOsc('sine', c[1] / 2, c[1] / 3, t + 0.04, 0.12, 0.045); }
    if (c[0] === 'pop') { sndDrop(c[1], t + 0.04, 0.08); return sndDrop(c[1] * 1.5, t + 0.1, 0.05); }
    sndHiss('highpass', 3500, 3500, t + 0.04, 0.03, 0.08);
    return sndWood(c[1], t + 0.04, 0.06, 0.08);
  }
  var SND = {
    // ---- buttons and sheets (실내: short and dry) ----
    tap:      function (t) { return sndOsc('triangle', 1100, 900, t, 0.035, 0.05); },
    tapOpen:  function (t) { sndHiss('bandpass', 1400, 2800, t, 0.07, 0.05); return sndOsc('triangle', 660, 990, t, 0.06, 0.05); },
    tapClose: function (t) { sndHiss('bandpass', 2600, 1200, t, 0.06, 0.045); return sndOsc('triangle', 990, 590, t, 0.06, 0.05); },
    tapOk:    function (t) { sndOsc('triangle', 990, 990, t, 0.03, 0.03); return sndOsc('triangle', 1480, 1480, t + 0.05, 0.05, 0.028); },
    // ---- fishing (물가: water) ----
    cast:     function (t) { sndOsc('triangle', 520, 260, t, 0.12, 0.03); sndHiss('bandpass', 1800, 500, t, 0.22, 0.12); return sndDrop(520, t + 0.3, 0.04); },
    bite:     function (t) { sndDrop(380, t, 0.12); sndHiss('lowpass', 1500, 400, t, 0.12, 0.05); return sndDrop(300, t + 0.12, 0.1); },
    strike:   function (t) { sndOsc('triangle', 300, 120, t, 0.12, 0.1); return sndHiss('lowpass', 1200, 300, t, 0.2, 0.18); },
    tick:     function (t) { return sndOsc('square', 1400, 1400, t, 0.018, 0.025); },
    // a = species length (cm): bigger fish, bigger splash
    catch:    function (t, a) { var s = sndBig(a); sndHiss('lowpass', 1200 + 1800 * s, 300, t, 0.15 + 0.25 * s, 0.05 + 0.12 * s); return sndPlucks([587, 880], t + 0.05, 0.08, 0.16, 0.2); },
    catchRare: function (t, a) {
      var s = sndBig(a); sndHiss('lowpass', 1500 + 1800 * s, 300, t, 0.2 + 0.3 * s, 0.06 + 0.12 * s);
      sndPlucks([659, 740, 988, 1319], t + 0.05, 0.07, 0.16, 0.2); return sndFM(1976, 3.5, 1, t + 0.3, 0.5, 0.04);
    },
    catchLegend: function (t, a) {
      var s = sndBig(a); sndHiss('lowpass', 2500 + 1000 * s, 250, t, 0.5 + 0.3 * s, 0.1 + 0.08 * s); sndOsc('sine', 110, 70, t, 0.6, 0.08);
      sndBells([466, 587, 698, 880], t + 0.08, 0.09, 0.25, 0.045, 2);
      return sndFM(1319, 3.5, 1.5, t + 0.45, 0.8, 0.05);
    },
    lost:     function (t) { sndHiss('lowpass', 1200, 300, t + 0.1, 0.25, 0.08); return sndOsc('triangle', 330, 150, t, 0.4, 0.09); },
    missed:   function (t) { sndOsc('sine', 600, 380, t, 0.12, 0.05); return sndPlucks([494, 415], t + 0.08, 0.1, 0.16, 0.18); },
    snap:     function (t) { sndHiss('highpass', 3000, 3000, t, 0.05, 0.15); return sndSeq('triangle', [330, 220], t + 0.06, 0.1, 0.14, 0.07); },
    junkCatch: function (t) { sndHiss('lowpass', 1500, 300, t, 0.2, 0.06); return sndFM(220, 2.76, 3, t + 0.03, 0.3, 0.08); },
    // 상자 열기 (자물쇠 / 불 조절)
    lockPick: function (t) { sndHiss('highpass', 4000, 4000, t, 0.02, 0.06); return sndFM(1800, 1.5, 1, t, 0.08, 0.05); },
    lockMiss: function (t) { return sndWood(140, t, 0.12, 0.09); },
    puff:     function (t) { sndOsc('sine', 90, 60, t, 0.12, 0.04); return sndHiss('lowpass', 900, 250, t, 0.18, 0.08); },
    chestOpen: function (t) { sndOsc('sawtooth', 110, 160, t, 0.22, 0.02); return sndBells([784, 988, 1175, 1397], t + 0.15, 0.07, 0.18, 0.05); },
    chestFail: function (t) { sndWood(110, t, 0.14, 0.09); return sndPlucks([392, 330], t + 0.1, 0.12, 0.2, 0.2); },
    // ---- 밭 (earth and wood) ----
    plant:    function (t) { sndHiss('lowpass', 600, 600, t, 0.06, 0.06); return sndOsc('triangle', 180, 110, t, 0.09, 0.12); },
    fertilize: function (t) { sndHiss('highpass', 5000, 3000, t, 0.25, 0.06); return sndOsc('sine', 170, 120, t, 0.12, 0.08); },
    offSeason: function (t) { sndWood(180, t, 0.08, 0.045); return sndWood(150, t + 0.11, 0.1, 0.04); },
    // a = crop id
    harvest:  function (t, a) { return sndPull(t, a); },
    harvestStar: function (t, a) { sndPull(t, a); return sndPlucks([659, 831, 988], t + 0.12, 0.06, 0.14, 0.2); },
    forage:   function (t) { sndHiss('bandpass', 2600, 1800, t, 0.09, 0.07); return sndWood(520, t + 0.03, 0.06, 0.08); },
    forageStar: function (t) { sndHiss('bandpass', 2600, 1800, t, 0.09, 0.07); sndWood(520, t + 0.03, 0.06, 0.08); return sndPlucks([698, 880, 1047], t + 0.1, 0.06, 0.14, 0.2); },
    // ---- coins and shops (metal) ----
    // a = coins: more coins, more clinks
    coin:     function (t, a) {
      var n = sndCount(a), end = t, fs = [1760, 1976, 2349, 2637, 2093];
      for (var k = 0; k < n; k++) end = sndFM(fs[(k + Math.floor(Math.random() * 3)) % 5], 1.4, 1.5, t + k * 0.055, 0.14, 0.04);
      return end;
    },
    sell:     function (t) { sndHiss('lowpass', 600, 300, t + 0.1, 0.08, 0.06); sndFM(2349, 3.5, 1.2, t, 0.12, 0.04); return sndFM(2793, 3.5, 1.2, t + 0.06, 0.16, 0.04); },
    bankOut:  function (t) { sndHiss('bandpass', 900, 500, t, 0.12, 0.05); sndFM(1397, 3.5, 1.5, t + 0.08, 0.16, 0.045); return sndFM(1568, 3.5, 1.5, t + 0.14, 0.2, 0.045); },
    till:     function (t) { sndOsc('square', 2000, 2000, t, 0.012, 0.02); sndHiss('bandpass', 1200, 700, t + 0.03, 0.1, 0.05); return sndFM(1760, 1, 2, t + 0.08, 0.4, 0.05); },
    arcPay:   function (t) { return sndBells([1760, 2217, 1760, 2637], t, 0.06, 0.12, 0.04); },
    tip:      function (t) { sndFM(2637, 3.5, 1.2, t, 0.12, 0.04); return sndFM(3136, 3.5, 1.2, t + 0.07, 0.16, 0.04); },
    bugFree:  function (t) { for (var k = 0; k < 3; k++) sndHiss('bandpass', 1800 + k * 500, 1800 + k * 500, t + k * 0.05, 0.035, 0.05); return sndFM(2349, 3.5, 1, t + 0.18, 0.14, 0.035); },
    volPing:  function (t) { return sndOsc('sine', 1000, 1000, t, 0.09, 0.08); },
    buy:      function (t) { sndHiss('bandpass', 3000, 3000, t, 0.03, 0.04); sndWood(420, t + 0.03, 0.06, 0.06); return sndFM(1568, 3.5, 1, t + 0.05, 0.1, 0.04); },
    stamp:    function (t) { sndHiss('lowpass', 900, 200, t, 0.08, 0.12); sndOsc('sine', 130, 60, t, 0.14, 0.12); return sndHiss('highpass', 5000, 5000, t + 0.02, 0.04, 0.04); },
    // ---- ★ notes (hud.js toast: kind read from the message) and blocked actions ----
    level:    function (t) { sndPluck(587, t, 0.22, 0.18); return sndFM(1175, 3.5, 1.4, t + 0.02, 0.5, 0.06); },
    starNew:  function (t) { sndPlucks([784, 1319], t, 0.09, 0.18, 0.22); return sndFM(2637, 3.5, 1, t + 0.18, 0.3, 0.03); },
    starOpen: function (t) { sndOsc('sawtooth', 120, 180, t, 0.2, 0.015); return sndBells([698, 932, 1245], t + 0.08, 0.1, 0.22, 0.06, 2); },
    starTitle: function (t) { sndSeq('square', [587, 587, 880], t, 0.08, 0.08, 0.03); sndSeq('triangle', [587, 587, 880], t, 0.08, 0.08, 0.07); return sndBells([1175, 1480], t + 0.3, 0.02, 0.3, 0.045, 2); },
    starSet:  function (t) { return sndBells([831, 1047, 1245, 1397, 1661], t, 0.05, 0.14, 0.05); },
    error:    function (t) { return sndSeq('triangle', [196, 175], t, 0.09, 0.08, 0.05); },
    bagFull:  function (t) { for (var k = 0; k < 3; k++) sndHiss('bandpass', 1300 + k * 300, 900, t + k * 0.03, 0.03, 0.04); return sndOsc('triangle', 150, 130, t + 0.08, 0.16, 0.055); },
    // ---- 곤충 ----
    netMiss:  function (t) { sndHiss('bandpass', 600, 2000, t, 0.14, 0.06); return sndOsc('square', 220, 330, t + 0.1, 0.1, 0.02); },
    swing:    function (t) { sndHiss('bandpass', 800, 2500, t, 0.12, 0.05); return sndOsc('sine', 200, 120, t + 0.08, 0.08, 0.035); },
    bugCatch: function (t) { for (var k = 0; k < 3; k++) sndOsc('sine', k % 2 ? 2800 : 2400, k % 2 ? 2800 : 2400, t + k * 0.04, 0.03, 0.04); return sndPluck(988, t + 0.12, 0.2, 0.2); },
    bugRare:  function (t) { for (var k = 0; k < 4; k++) sndOsc('sine', k % 2 ? 2800 : 2400, k % 2 ? 2800 : 2400, t + k * 0.04, 0.03, 0.022); return sndPlucks([988, 1245, 1480], t + 0.15, 0.07, 0.16, 0.16); },
    // ---- 동굴 (stone, with an echo) ----
    pick:     function (t) { var e = sndCave(); sndHiss('bandpass', 3000, 2500, t, 0.03, 0.06, e); sndOsc('triangle', 260, 170, t, 0.07, 0.045, e); return sndOsc('square', 1300, 1100, t, 0.03, 0.02, e); },
    ore:      function (t) { var e = sndCave(); for (var k = 0; k < 3; k++) sndHiss('bandpass', 1800 + Math.random() * 1500, 1500, t + k * 0.045, 0.025, 0.09, e); return sndWood(330, t + 0.02, 0.07, 0.06, e); },
    oreRare:  function (t) { return sndBells([1319, 1568, 1976], t, 0.07, 0.16, 0.045, 3.5, sndCave()); },
    fossilPart: function (t) { var e = sndCave(); sndWood(240, t, 0.1, 0.08, e); return sndPlucks([494, 740], t + 0.08, 0.09, 0.2, 0.2, e); },
    fossilDone: function (t) { var e = sndCave(); sndFM(139, 1.4, 4, t, 0.9, 0.04, e); return sndBells([554, 698, 831, 1109], t + 0.05, 0.08, 0.22, 0.035, 3.5, e); },
    // ---- 사진기·캠핑·반려동물 ----
    shutter:  function (t) { sndHiss('highpass', 4000, 4000, t, 0.02, 0.1); sndOsc('square', 1800, 1800, t + 0.06, 0.015, 0.02); return sndHiss('bandpass', 2500, 2500, t + 0.06, 0.03, 0.08); },
    fireLight: function (t) { sndHiss('lowpass', 300, 1500, t, 0.35, 0.1); for (var k = 0; k < 3; k++) sndHiss('bandpass', 3000, 3000, t + 0.15 + k * 0.06, 0.02, 0.012); return t + 0.35; },
    cookDone: function (t) { sndHiss('highpass', 3000, 5000, t, 0.25, 0.05); return sndWood(660, t + 0.1, 0.08, 0.07); },
    burnt:    function (t) { sndHiss('highpass', 2000, 1200, t, 0.3, 0.05); return sndPlucks([233, 196], t + 0.08, 0.14, 0.24, 0.24); },
    petGift:  function (t) { sndOsc('sine', 900, 1300, t, 0.08, 0.045); return sndWood(300, t + 0.1, 0.08, 0.045); },
    pet:      function (t) { sndOsc('sine', 700, 900, t, 0.06, 0.05); return sndOsc('sine', 900, 1200, t + 0.08, 0.08, 0.05); },
    donkeyPet: function (t) { sndHiss('lowpass', 500, 300, t, 0.1, 0.05); sndOsc('triangle', 300, 250, t + 0.06, 0.1, 0.045); return sndOsc('triangle', 260, 220, t + 0.18, 0.12, 0.045); },
    // ---- 잠수 (바다: wide, underwater) ----
    splash:   function (t) { var w = sndWide(); sndOsc('sine', 400, 120, t, 0.15, 0.08, w); sndHiss('lowpass', 2000, 300, t, 0.4, 0.2, w); return sndDrop(300, t + 0.3, 0.04, w); },
    diveOut:  function (t) { var w = sndWide(); sndDrop(320, t, 0.06, w); sndDrop(420, t + 0.07, 0.06, w); return sndHiss('lowpass', 300, 2200, t + 0.1, 0.3, 0.26, w); },
    swim:     function (t) { sndOsc('sine', 220, 150, t + 0.02, 0.12, 0.03); return sndHiss('lowpass', 500, 200, t, 0.22, 0.06); },
    beep:     function (t) { sndOsc('square', 880, 880, t, 0.05, 0.025); return sndOsc('square', 880, 880, t + 0.1, 0.05, 0.025); },
    diveBlock: function (t) { var w = sndWide(); sndHiss('lowpass', 300, 150, t, 0.15, 0.12, w); return sndOsc('sine', 90, 50, t, 0.2, 0.12, w); },
    whoosh:   function (t) { return sndHiss('lowpass', 200, 800, t, 0.35, 0.1, sndWide()); },
    divePickNew: function (t) { var w = sndWide(); sndDrop(500, t, 0.05, w); return sndPlucks([784, 988, 1175], t + 0.05, 0.07, 0.16, 0.2, w); },
    divePick: function (t) { var w = sndWide(); sndDrop(450, t, 0.06, w); return sndPluck(587, t + 0.04, 0.2, 0.2, w); },
    diveSeeNew: function (t) { var w = sndWide(); sndOsc('sine', 440, 660, t, 0.3, 0.05, w); return sndBells([880, 1109], t + 0.2, 0.09, 0.2, 0.04, 3.5, w); },
    diveSee:  function (t) { return sndOsc('sine', 1200, 1150, t, 0.15, 0.03, sndWide()); },
    diveLog:  function (t) { var w = sndWide(); sndHiss('bandpass', 3000, 2000, t, 0.1, 0.05, w); return sndWood(330, t + 0.05, 0.09, 0.08, w); },
    diveTreasure: function (t) { var w = sndWide(); sndFM(185, 1.4, 3, t, 0.8, 0.06, w); return sndBells([740, 932, 1109, 1480], t + 0.08, 0.08, 0.24, 0.045, 3.5, w); },
    // ---- 갯벌 (mud on the shore: wide) ----
    trapSet:  function (t) { var w = sndWide(); sndWood(220, t, 0.08, 0.07, w); sndHiss('lowpass', 600, 200, t + 0.05, 0.1, 0.08, w); return sndDrop(260, t + 0.1, 0.05, w); },
    trapPull: function (t) { var w = sndWide(); sndHiss('bandpass', 1500, 900, t, 0.15, 0.06, w); for (var k = 0; k < 3; k++) sndWood(1800 + k * 400, t + 0.08 + k * 0.05, 0.03, 0.05, w); return t + 0.25; },
    dig:      function (t) { var w = sndWide(); sndHiss('lowpass', 900, 300, t, 0.12, 0.12, w); return sndOsc('triangle', 120, 80, t, 0.1, 0.1, w); },
    digFind:  function (t) { var w = sndWide(); sndDrop(420, t + 0.06, 0.07, w); return sndDrop(630, t + 0.12, 0.06, w); },
    digRare:  function (t) { return sndBells([1245, 1568, 1865], t + 0.06, 0.07, 0.18, 0.045, 3.5, sndWide()); },
    // ---- 게임장 (마을: bells) ----
    arcWin:   function (t) { return sndBells([1319, 1760, 1319, 1760, 2217], t, 0.06, 0.12, 0.05, 1.4); },
    arcLose:  function (t) { sndOsc('square', 160, 150, t, 0.2, 0.025); return sndSeq('triangle', [311, 294, 277], t + 0.05, 0.11, 0.12, 0.08); },
    hit:      function (t) { sndWood(330, t, 0.06, 0.08); return sndOsc('sine', 1400, 900, t + 0.02, 0.06, 0.04); },
    moleHog:  function (t) { sndOsc('square', 230, 230, t, 0.06, 0.03); return sndOsc('square', 205, 205, t + 0.08, 0.08, 0.03); },
    cardPair: function (t) { sndFM(1175, 3.5, 1.2, t, 0.25, 0.04); return sndFM(1568, 3.5, 1.2, t + 0.04, 0.3, 0.04); },
    cardFlip: function (t) { return sndHiss('bandpass', 2500, 4000, t, 0.05, 0.08); },
    ballThrow: function (t) { sndHiss('bandpass', 600, 1800, t, 0.12, 0.08); return sndOsc('sine', 400, 700, t, 0.08, 0.05); },
    slotSpin: function (t) { for (var k = 0; k < 8; k++) sndOsc('square', 1500, 1500, t + k * 0.03, 0.01, 0.01); return sndFM(2093, 1.4, 1.5, t + 0.26, 0.2, 0.018); },
    // ---- arriving somewhere (place.js): one per place palette ----
    arriveLand: function (t) { sndHiss('lowpass', 500, 300, t, 0.06, 0.03); sndHiss('lowpass', 500, 300, t + 0.14, 0.06, 0.03); return sndWood(400, t + 0.24, 0.06, 0.025); },
    arriveWater: function (t) { sndHiss('lowpass', 400, 900, t, 0.3, 0.03); sndDrop(500, t + 0.05, 0.022); return sndDrop(700, t + 0.17, 0.02); },
    arriveSea: function (t) { var w = sndWide(); sndHiss('lowpass', 300, 1300, t, 0.6, 0.07, w); return sndHiss('highpass', 3000, 2000, t + 0.35, 0.4, 0.012, w); },
    arriveCave: function (t) { var e = sndCave(); sndOsc('sine', 70, 55, t, 0.4, 0.025, e); return sndDrop(900, t + 0.1, 0.022, e); },
    arriveTown: function (t) { sndFM(784, 1.4, 2, t, 0.5, 0.02); return sndFM(659, 1.4, 2, t + 0.22, 0.6, 0.018); },
    arriveIn: function (t) { sndWood(200, t, 0.07, 0.03); return sndOsc('square', 2400, 2400, t + 0.09, 0.012, 0.008); },
    // ---- 탈것 ----
    rideGo:   function (t) { sndHiss('bandpass', 400, 1400, t, 0.3, 0.035); return sndFM(2093, 2, 1.5, t + 0.05, 0.3, 0.018); },
    sight:    function (t) { sndHiss('highpass', 4000, 4000, t, 0.02, 0.08); return sndFM(1568, 3.5, 1, t + 0.04, 0.25, 0.04); },
    balTap:   function (t) { return sndHiss('bandpass', 1200, 900, t, 0.06, 0.12); },
    jump:     function (t) { sndOsc('square', 300, 700, t, 0.1, 0.025); return sndOsc('triangle', 300, 700, t, 0.1, 0.06); },
    sledSwerve: function (t) { return sndHiss('highpass', 2000, 5000, t, 0.15, 0.035); },
    crash:    function (t) { sndHiss('lowpass', 1200, 200, t, 0.25, 0.09); for (var k = 0; k < 3; k++) sndWood(260 - k * 40, t + k * 0.06, 0.06, 0.045); return t + 0.25; },
    bump:     function (t) { sndHiss('lowpass', 600, 150, t, 0.1, 0.12); return sndOsc('sine', 110, 70, t, 0.12, 0.12); },
    rideFail: function (t) { return sndPlucks([392, 349, 311], t, 0.11, 0.18, 0.22); },
    rideDone: function (t) { sndPlucks([587, 659, 880], t, 0.08, 0.16, 0.2); return sndFM(1175, 3.5, 1.2, t + 0.24, 0.35, 0.04); },
    flowerPick: function (t) { sndDrop(900, t, 0.06); return sndOsc('sine', 2600, 2600, t + 0.05, 0.08, 0.025); },
    // ---- 별 잇기 (p = how many stars are joined so far: each one a step up a pentatonic scale) ----
    star:     function (t, p) {
      var f = 523 * Math.pow(2, [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24][Math.max(0, Math.min(10, p || 0))] / 12);
      sndOsc('triangle', f * 2, f * 2, t, 0.06, 0.015);
      return sndOsc('sine', f, f, t, 0.18, 0.06);
    },
    chime:    function (t) { [523, 784].forEach(function (f) { sndOsc('triangle', f, f, t + 0.3, 0.6, 0.04); }); return sndBells([1047, 1175, 1568, 1760, 2093], t, 0.07, 0.2, 0.04, 3.5); },
    starWrong: function (t) { sndOsc('sine', 660, 660, t, 0.12, 0.04); return sndOsc('sine', 622, 600, t + 0.02, 0.16, 0.04); },
    sting:    function (t) {
      sndOsc('triangle', 110, 55, t, 0.5, 0.12); sndHiss('lowpass', 3000, 200, t, 0.45, 0.14);
      sndSeq('square', [220, 233], t, 0.12, 0.1, 0.03);
      return sndOsc('square', 466, 440, t + 0.24, 0.3, 0.025);
    },
    // ---- 장난감 ----
    water:    function (t) { sndHiss('lowpass', 1500, 300, t, 0.15, 0.08); sndDrop(400, t + 0.02, 0.05); return sndDrop(650, t + 0.07, 0.04); },
    leaves:   function (t) { for (var k = 0; k < 3; k++) sndHiss('bandpass', 3000 + k * 600, 2400, t + k * 0.04 + Math.random() * 0.02, 0.05, 0.06); return t + 0.17; },
    snowStep: function (t) { sndHiss('bandpass', 1200, 800, t, 0.07, 0.1); return sndHiss('highpass', 4000, 4000, t + 0.02, 0.04, 0.025); },
    // ---- 마을 음악회 ----
    // a resident hands over an instrument: three wooden 실로폰 bars up, a bell on top
    bandGet:  function (t) { [784, 988, 1175].forEach(function (f, k) { sndWood(f, t + k * 0.09, 0.22, 0.05); }); return sndFM(1568, 3.93, 0.8, t + 0.3, 0.6, 0.035); },
    // an 오카리나 comes up with the junk: a breath, then two soft round notes
    bandFind: function (t) { sndHiss('bandpass', 1800, 1400, t, 0.12, 0.03); sndOsc('sine', 1047, 1047, t + 0.05, 0.22, 0.07); return sndOsc('sine', 1397, 1397, t + 0.25, 0.45, 0.07); },
    // the 우쿨렐레 bought: one down-strum
    bandBuy:  function (t) { return sndPlucks([392, 523, 659, 880], t, 0.022, 0.5, 0.25); },
    // a tap with no note near it, or a note let go by: a muffled wood knock
    bandMiss: function (t) { return sndWood(150, t, 0.07, 0.05); },
    // 마당 연주 over: a strummed cadence
    bandEnd:  function (t) { sndPlucks([392, 494, 587], t, 0.02, 0.3, 0.2); return sndPlucks([523, 659, 784, 1047], t + 0.28, 0.02, 0.5, 0.22); },
    // 음악회 over: the audience claps (noise bursts) under a bell chord
    bandCheer: function (t) {
      for (var k = 0; k < 16; k++) sndHiss('bandpass', 1400 + Math.random() * 1200, 1100, t + k * 0.055 + Math.random() * 0.03, 0.035, 0.06);
      return sndBells([784, 988, 1175, 1568], t + 0.1, 0.06, 0.4, 0.03, 3.5);
    }
  };
  var SND_GAPS = { tick: 150, swim: 700, beep: 300 };
  // the gap rule is kept per family: each sound that split off an older one shares that one's gap and last-played time, so
  // whatever the old sound held back (a ★ toast then a stamp, two harvests at once) is still held back the same way
  var SND_FAM = {
    tapOpen: 'tap', tapClose: 'tap', tapOk: 'tap', cardFlip: 'tap', balTap: 'tap', diveSee: 'tap',
    missed: 'lost', chestFail: 'lost', burnt: 'lost', arcLose: 'lost', rideFail: 'lost',
    junkCatch: 'catch', bugCatch: 'catch', rideDone: 'catch',
    bugRare: 'catchRare', fossilPart: 'catchRare', oreRare: 'catchRare', divePickNew: 'catchRare', diveSeeNew: 'catchRare',
    diveTreasure: 'catchLegend',
    lockPick: 'hit', cardPair: 'hit',
    lockMiss: 'error', offSeason: 'error', bagFull: 'error', moleHog: 'error', starWrong: 'error',
    chestOpen: 'level', harvestStar: 'level', forageStar: 'level', stamp: 'level', starNew: 'level', starOpen: 'level', starTitle: 'level',
    starSet: 'level', fossilDone: 'level', digRare: 'level', arcWin: 'level',
    fertilize: 'water',
    forage: 'harvest', ore: 'harvest', cookDone: 'harvest', petGift: 'harvest', divePick: 'harvest', diveLog: 'harvest', trapPull: 'harvest',
    digFind: 'harvest', flowerPick: 'harvest',
    sell: 'coin', bankOut: 'coin', till: 'coin', arcPay: 'coin', tip: 'coin', bugFree: 'coin', volPing: 'coin',
    trapSet: 'plant', dig: 'plant', snowStep: 'plant',
    diveOut: 'splash',
    slotSpin: 'whoosh', rideGo: 'whoosh', arriveLand: 'whoosh', arriveWater: 'whoosh', arriveSea: 'whoosh', arriveCave: 'whoosh',
    arriveTown: 'whoosh', arriveIn: 'whoosh',
    diveBlock: 'bump', crash: 'bump',
    sight: 'shutter',
    netMiss: 'swing', sledSwerve: 'swing', leaves: 'swing',
    fireLight: 'puff',
    donkeyPet: 'pet',
    ballThrow: 'cast',
    bandGet: 'level', bandFind: 'catchRare', bandBuy: 'buy', bandMiss: 'error', bandEnd: 'chime', bandCheer: 'catchLegend'
  };
  // tuned sounds keep their pitch (each 별 a scale step, the 크기 slider's reference ping); only their length varies
  var SND_TUNED = { star: true, chime: true, volPing: true };
  // soft: a fallback sound (button tap, wallet spend) that stays quiet when something else just played; arg: passed to the sound
  function sfx(name, soft, arg) {
    if (!sndOn || !sfxOn || !sndCtx || sndCtx.state !== 'running' || !SND[name]) return;
    var p = performance.now(), fam = SND_FAM[name] || name;
    if (p - (sndLast[fam] || -1e9) < (SND_GAPS[fam] || SND_GAP)) return;
    if (soft && p - sndAny < SND_SOFT) return;
    var t = sndCtx.currentTime;
    sndEnds = sndEnds.filter(function (e) { return e > t; });
    if (sndEnds.length >= SND_VOICES) return;
    sndLast[fam] = sndAny = p;
    sndPlay(name, t + 0.005, arg);
  }
  function sndPlay(name, t, arg) {
    sndP = SND_TUNED[name] ? 1 : 0.97 + Math.random() * 0.06; sndD = 0.9 + Math.random() * 0.2;
    try { sndEnds.push(SND[name](t, arg)); } catch (e) { /* a browser without some node type: stay quiet */ }
    sndP = sndD = 1;
  }
  // which ★ toast this is (hud.js): '' while there is no sound to play, so a muted game reads nothing
  var SND_STAR = [['title', /칭호/], ['set', /완성|완결|모든 |완료|다 모았/], ['open', /열렸다|열린다|개통|생겼다|해금|됐다|왔다|샀다|켜졌다|복구|이제 /], ['new', /처음|새 /]];
  function sndStar(msg) {
    if (!sndOn || !sfxOn || !sndCtx || sndCtx.state !== 'running') return '';
    for (var k = 0; k < SND_STAR.length; k++) if (SND_STAR[k][1].test(msg)) return SND_STAR[k][0];
    return '';
  }

  // ---------- 음악: one small loop per time of day (curEnv phase), crossfaded ----------
  // Lanes of voices → per-track gain (the crossfade) → sndMus (quiet bus, ducked in the reel fight and minigames) → lowpass
  // → sndMaster. A 200ms timer books notes up to MUS_AHEAD seconds ahead on the AudioContext clock, so a busy or throttled
  // main thread (hidden tab while the PiP window shows the game) never makes it drift. A suspended context books nothing.
  // Song text: one token per eighth note, '.' rest, '-' holds the note before, '|' is just a bar line.
  // Chords per bar feed the bass and arp patterns: r root, 3 third, 5 fifth, 7 seventh (octave on a plain triad), o octave.
  // Drums per eighth: k soft kick, s brushed snare, h hat. All four tunes are written for this game.
  var MUS_KEY = 'farmfish.music';
  var musOn = (function () { try { return localStorage.getItem(MUS_KEY) !== '0'; } catch (e) { return true; } })();
  var MUS_AHEAD = 1.5, MUS_BUS = 0.3, MUS_DUCK = 0.45, MUS_FADE = 2.5;
  var MUS = {
    morning: {   // D major, 108 bpm: bright, a little bounce; 종 (FM bell) lead
      bpm: 108, swing: 0, lead: ['bell', 0.042], bassV: 0.07, arpV: 0, form: 'AABC',
      bass: 'r . 5 . o . 5 .', arp: '', drum: 'k . h . s . h .',
      A: { ch: 'D Bm G A', mel: 'F#5 . A5 B5 A5 - F#5 . | D5 - F#5 . E5 D5 B4 . | D5 . E5 F#5 G5 - B5 . | A5 - - - E5 - . .' },
      B: { ch: 'G A F#m Bm', mel: 'B5 . A5 G5 F#5 - G5 . | A5 - E5 . C#5 - E5 . | F#5 . E5 F#5 A5 - F#5 . | D5 - F#5 . B4 - - .' },
      C: { ch: 'Em A D D', mel: 'G5 . F#5 E5 D5 - E5 . | C#5 . E5 . A5 - G5 . | F#5 - D5 . A4 . D5 . | D5 - - - . . . .' }
    },
    day: {       // F major, 88 bpm, swung: relaxed lo-fi sevenths; 기타풍 plucked lead and arp
      bpm: 88, swing: 0.14, lead: ['pluck', 0.08], voice: { arp: 'pluck' }, bassV: 0.08, arpV: 0.018, form: 'ABAC',
      bass: 'r - - 5 . r 5 .', arp: '. . 3 . . . 7 .', drum: 'k . h . s . h k',
      A: { ch: 'FM7 Am7 Dm7 C', mel: 'A4 - C5 . E5 - D5 C5 | E5 - - . C5 . A4 . | F4 . A4 C5 D5 - C5 . | G4 - - - . . . .' },
      B: { ch: 'BbM7 Am7 Gm7 C', mel: 'D5 - F5 . E5 D5 C5 . | C5 - E5 . A4 - . . | Bb4 . D5 . F5 - E5 D5 | E5 - - - G4 - . .' },
      C: { ch: 'BbM7 C FM7 FM7', mel: 'D5 - F5 . A5 - G5 F5 | E5 - D5 . C5 - . . | A4 . C5 . E5 - C5 . | F5 - - - . . . .' }
    },
    evening: {   // Eb major, 76 bpm, swung: warm and slow, broken chords underneath; soft pad lead, e-piano arp
      bpm: 76, swing: 0.1, lead: ['pad', 0.055], voice: { arp: 'epiano' }, bassV: 0.08, arpV: 0.014, form: 'ABAC',
      bass: 'r - - - 5 - - .', arp: 'r 3 5 7 o 7 5 3', drum: 'k . . . s . . h',
      A: { ch: 'EbM7 Cm7 AbM7 Bb', mel: 'G4 - Bb4 - Eb5 - D5 . | C5 - - - G4 - . . | Ab4 . C5 . Eb5 - F5 . | D5 - - - - - . .' },
      B: { ch: 'Gm7 Cm7 Fm7 Bb', mel: 'Bb4 - D5 - F5 - Eb5 . | Eb5 - - - C5 - . . | Ab4 - C5 . F5 - Eb5 D5 | D5 - - - Bb4 - . .' },
      C: { ch: 'AbM7 Bb EbM7 EbM7', mel: 'C5 - Eb5 . Ab5 - G5 F5 | F5 - D5 . Bb4 - . . | G4 . Bb4 . Eb5 - D5 . | Eb5 - - - - - . .' }
    },
    night: {     // A minor, 62 bpm: sparse, no drums; 오르골 (music box) lead and arp, sine bass
      bpm: 62, swing: 0, lead: ['box', 0.06], voice: { bass: 'sine', arp: 'box' }, bassV: 0.06, arpV: 0.016, form: 'ABAC',
      bass: 'r - - - - - - -', arp: 'r . . 5 . . 7 .', drum: '',
      A: { ch: 'Am7 FM7 Dm7 Em', mel: 'E5 - - - C5 - . . | A4 - - - . . . . | D5 - F5 - E5 - D5 - | B4 - - - - - . .' },
      B: { ch: 'FM7 Em7 Dm7 E', mel: 'C5 - - - A4 - . . | B4 - G4 - . . . . | F4 - A4 - D5 - C5 - | B4 - - - G#4 - . .' },
      C: { ch: 'FM7 G Am7 Am7', mel: 'A4 - C5 - E5 - D5 . | D5 - - - B4 - . . | C5 - - - B4 - A4 - | A4 - - - - - - .' }
    }
  };
  var MUS_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var MUS_CH = { '': [0, 4, 7], m: [0, 3, 7], M7: [0, 4, 7, 11], m7: [0, 3, 7, 10] };
  function musHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function musPc(s) { return MUS_PC[s[0]] + (s[1] === '#' ? 1 : s[1] === 'b' ? -1 : 0); }
  function musToks(s) { return s.split(/\s+/).filter(function (x) { return x && x !== '|'; }); }
  // a pattern of tokens → [{ i: eighth index, len: eighths, v: token }] (held by '-')
  function musHits(toks) {
    var out = [];
    toks.forEach(function (x, i) { if (x === '-') { if (out.length) out[out.length - 1].len++; } else if (x !== '.') out.push({ i: i, len: 1, v: x }); });
    return out;
  }
  // a track → steps[eighth] = [[kind, hz, eighths, vol]]; built once.
  // 마을 음악회: the six instrument lanes go into bsteps[eighth] = [[lane, hz, eighths, vol, instrument id]], apart from
  // steps, and musStep plays them only for an instrument owned and not muted (L.bndLive), so with no band the tune is
  // the same call for call. hz is an array of chord notes for the 우쿨렐레 strum.
  function musBuild(tr) {
    if (tr.steps) return tr;
    var steps = [], bsteps = [], bar = 0, lv = tr.lead[1];
    function add(i, ev) { (steps[i] = steps[i] || []).push(ev); }
    function addB(i, ev) { (bsteps[i] = bsteps[i] || []).push(ev); }
    tr.form.split('').forEach(function (sec) {
      var S2 = tr[sec], base = bar * 8;
      musHits(musToks(S2.mel)).forEach(function (h) {
        var m = /^([A-G][#b]?)(\d)$/.exec(h.v);
        add(base + h.i, ['lead', musHz(12 * (+m[2] + 1) + musPc(m[1])), h.len, tr.lead[1]]);
        addB(base + h.i, ['oca', musHz(12 * (+m[2] + 2) + musPc(m[1])), h.len, lv * 0.35, 'ocarina']);
      });
      S2.ch.split(' ').forEach(function (c, b) {
        var m = /^([A-G][#b]?)(m7|M7|m)?$/.exec(c), pc = (musPc(m[1]) + 12) % 12, iv = MUS_CH[m[2] || ''];
        function note(t, oct) { return oct + (t === 'r' ? 0 : t === '3' ? iv[1] : t === '5' ? iv[2] : t === '7' ? (iv[3] || 12) : 12); }
        var bassRoot = 40 + (pc - 4 + 12) % 12, arpRoot = 60 + pc;
        musHits(musToks(tr.bass)).forEach(function (h) { add(base + b * 8 + h.i, ['bass', musHz(note(h.v, bassRoot)), h.len, tr.bassV]); });
        if (tr.arpV) musHits(musToks(tr.arp)).forEach(function (h) { add(base + b * 8 + h.i, ['arp', musHz(note(h.v, arpRoot)), h.len, tr.arpV]); });
        if (tr.drum) musToks(tr.drum).forEach(function (d, i) { if (d !== '.') add(base + b * 8 + i, [d]); });
        var at = base + b * 8, tone = function (k) { return musHz(arpRoot + iv[k % iv.length] + (k >= iv.length ? 12 : 0)); };
        [0, 3, 6].forEach(function (i, k) { addB(at + i, ['drm', k ? 150 : 110, 1, tr.drum ? 0.05 : 0.012, 'drum']); });
        [0, 1, 2].forEach(function (k) { addB(at, ['hrm', tone(k), 8, 0.006, 'harmonica']); });
        [1, 3, 5, 7].forEach(function (i, k) { addB(at + i, ['xyl', 2 * tone(k), 1, 0.012, 'xylo']); });
        addB(at, ['acc', musHz(bassRoot - 12), 8, 0.02, 'accordion']);
        [2, 6].forEach(function (i) { addB(at + i, ['uke', [0, 1, 2, 3].map(tone), 1, 0.008, 'uke']); });
      });
      bar += 4;
    });
    tr.steps = steps; tr.bsteps = bsteps; tr.n = bar * 8; tr.eighth = 30 / tr.bpm;
    return tr;
  }
  var sndMus = null, musLanes = [], musTrack = '', musForce = null, musDucked = false, musNotes = 0;
  function musVoice(dest, type, f, t, dur, vol) {
    var o = sndCtx.createOscillator(), g = sndCtx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.linearRampToValueAtTime(vol * 0.6, t + dur * 0.7); g.gain.linearRampToValueAtTime(0, t + dur + 0.08);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.1);
  }
  function musDrum(dest, d, t) {
    if (d === 'k') {
      var o = sndCtx.createOscillator(), g = sndCtx.createGain();
      o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(0.09, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.18);
      return;
    }
    var s = sndCtx.createBufferSource(), f = sndCtx.createBiquadFilter(), g2 = sndCtx.createGain(), dur = d === 's' ? 0.1 : 0.03;
    s.buffer = sndNoise; f.type = d === 's' ? 'bandpass' : 'highpass'; f.frequency.value = d === 's' ? 1800 : 7000;
    g2.gain.setValueAtTime(d === 's' ? 0.035 : 0.018, t); g2.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g2); g2.connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
  }
  // instruments (dest, Hz, start, length, volume). A track names one per lane: lead[0] for the melody, voice: { lane: name }
  // for the rest (MUS_VOICE when it says nothing). A lane added to musBuild later only needs its name here and a voice.
  function musEnv(g, t, vol, attack, hold, end) {
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(Math.max(vol * hold, 0.0001), Math.max(t + attack + 0.01, end - 0.05)); g.gain.linearRampToValueAtTime(0, end);
  }
  var MUS_INST = {
    triangle: function (d, f, t, dur, v) { musVoice(d, 'triangle', f, t, dur, v); },
    sine: function (d, f, t, dur, v) { musVoice(d, 'sine', f, t, dur, v); },
    square: function (d, f, t, dur, v) { musVoice(d, 'square', f, t, dur, v); },
    // 종: FM, the clang (modulator at 3.5×) fading in a quarter second, then a ring past the note
    bell: function (d, f, t, dur, v) {
      var c = sndCtx.createOscillator(), m = sndCtx.createOscillator(), mg = sndCtx.createGain(), g = sndCtx.createGain(), end = t + Math.max(dur, 0.25) + 0.45;
      c.frequency.value = f; m.frequency.value = f * 3.5;
      mg.gain.setValueAtTime(f * 1.1, t); mg.gain.exponentialRampToValueAtTime(f * 0.03, t + 0.3);
      musEnv(g, t, v, 0.004, 0.08, end);
      m.connect(mg); mg.connect(c.frequency); c.connect(g); g.connect(d); c.start(t); m.start(t); c.stop(end + 0.02); m.stop(end + 0.02);
    },
    // 기타풍: a sawtooth whose low-pass closes fast after the attack
    pluck: function (d, f, t, dur, v) {
      var o = sndCtx.createOscillator(), lp = sndCtx.createBiquadFilter(), g = sndCtx.createGain(), end = t + dur + 0.12;
      o.type = 'sawtooth'; o.frequency.value = f; lp.type = 'lowpass'; lp.Q.value = 2;
      lp.frequency.setValueAtTime(Math.min(f * 8, 5000), t); lp.frequency.exponentialRampToValueAtTime(f * 1.3, t + 0.35);
      musEnv(g, t, v, 0.004, 0.25, end);
      o.connect(lp); lp.connect(g); g.connect(d); o.start(t); o.stop(end + 0.02);
    },
    // 패드: two detuned sawtooths, soft low-pass, slow swell and release
    pad: function (d, f, t, dur, v) {
      var lp = sndCtx.createBiquadFilter(), g = sndCtx.createGain(), end = t + dur + 0.35;
      lp.type = 'lowpass'; lp.frequency.value = 1200; lp.Q.value = 0.5;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + Math.min(0.15, dur * 0.5));
      g.gain.setValueAtTime(v, t + dur * 0.8); g.gain.linearRampToValueAtTime(0, end);
      [-6, 6].forEach(function (c) { var o = sndCtx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = c; o.connect(lp); o.start(t); o.stop(end + 0.02); });
      lp.connect(g); g.connect(d);
    },
    // 전자 피아노 (저녁 arp): FM at 1:1, the bite fading
    epiano: function (d, f, t, dur, v) {
      var c = sndCtx.createOscillator(), m = sndCtx.createOscillator(), mg = sndCtx.createGain(), g = sndCtx.createGain(), end = t + dur + 0.2;
      c.frequency.value = f; m.frequency.value = f;
      mg.gain.setValueAtTime(f * 0.8, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + 0.4);
      musEnv(g, t, v, 0.006, 0.3, end);
      m.connect(mg); mg.connect(c.frequency); c.connect(g); g.connect(d); c.start(t); m.start(t); c.stop(end + 0.02); m.stop(end + 0.02);
    },
    // 오르골: a sine tine with a quick high partial, ringing on past the note
    box: function (d, f, t, dur, v) {
      var end = t + Math.max(dur, 0.6) + 0.5, g = sndCtx.createGain(), h = sndCtx.createGain(), o = sndCtx.createOscillator(), o2 = sndCtx.createOscillator();
      o.frequency.value = f; o2.frequency.value = f * 4.2;
      musEnv(g, t, v, 0.003, 0.05, end);
      h.gain.setValueAtTime(v * 0.25, t); h.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(g); o2.connect(h); g.connect(d); h.connect(d); o.start(t); o2.start(t); o.stop(end + 0.02); o2.stop(t + 0.27);
    },
    // ---------- 마을 음악회 instruments (bsteps lanes) ----------
    // 오카리나: a sine with a breathy swell and a slow vibrato
    ocarina: function (d, f, t, dur, v) {
      var o = sndCtx.createOscillator(), lfo = sndCtx.createOscillator(), lg = sndCtx.createGain(), g = sndCtx.createGain(), end = t + dur + 0.1;
      o.frequency.value = f; lfo.frequency.value = 5; lg.gain.value = f * 0.006;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.04); g.gain.setValueAtTime(v, t + dur * 0.8); g.gain.linearRampToValueAtTime(0, end);
      lfo.connect(lg); lg.connect(o.frequency); o.connect(g); g.connect(d); o.start(t); lfo.start(t); o.stop(end + 0.02); lfo.stop(end + 0.02);
    },
    // 작은 북: a short sine thump falling an octave
    tom: function (d, f, t, dur, v) {
      var o = sndCtx.createOscillator(), g = sndCtx.createGain();
      o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.5, t + 0.14);
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g); g.connect(d); o.start(t); o.stop(t + 0.22);
    },
    // 하모니카: a reedy square through a low-pass, slow in, held
    reed: function (d, f, t, dur, v) {
      var o = sndCtx.createOscillator(), lp = sndCtx.createBiquadFilter(), g = sndCtx.createGain(), end = t + dur + 0.15;
      o.type = 'square'; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = 0.7;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.12); g.gain.setValueAtTime(v, t + dur * 0.85); g.gain.linearRampToValueAtTime(0, end);
      o.connect(lp); lp.connect(g); g.connect(d); o.start(t); o.stop(end + 0.02);
    },
    // 실로폰: a wooden bar, the tone and its bright 4th partial, quick decay
    xylo: function (d, f, t, dur, v) {
      var o = sndCtx.createOscillator(), o2 = sndCtx.createOscillator(), g = sndCtx.createGain(), h = sndCtx.createGain();
      o.frequency.value = f; o2.frequency.value = f * 3.93;
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      h.gain.setValueAtTime(v * 0.3, t); h.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      o.connect(g); o2.connect(h); g.connect(d); h.connect(d); o.start(t); o2.start(t); o.stop(t + 0.37); o2.stop(t + 0.1);
    },
    // 아코디언: two detuned sawtooths under a low-pass, the bellows breathing a little
    accord: function (d, f, t, dur, v) {
      var lp = sndCtx.createBiquadFilter(), g = sndCtx.createGain(), end = t + dur + 0.1;
      lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.5;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.06); g.gain.linearRampToValueAtTime(v * 0.75, t + dur * 0.5);
      g.gain.linearRampToValueAtTime(v * 0.85, t + dur * 0.85); g.gain.linearRampToValueAtTime(0, end);
      [-8, 8].forEach(function (c) { var o = sndCtx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = c; o.connect(lp); o.start(t); o.stop(end + 0.02); });
      lp.connect(g); g.connect(d);
    },
    // 우쿨렐레: a quick down-strum, each string a triangle that dies away
    strum: function (d, fs, t, dur, v) {
      fs.forEach(function (f, k) {
        var o = sndCtx.createOscillator(), g = sndCtx.createGain(), t0 = t + k * 0.018;
        o.type = 'triangle'; o.frequency.value = f;
        g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.4);
        o.connect(g); g.connect(d); o.start(t0); o.stop(t0 + 0.42);
      });
    }
  };
  var MUS_VOICE = { bass: 'triangle', arp: 'sine', oca: 'ocarina', drm: 'tom', hrm: 'reed', xyl: 'xylo', acc: 'accord', uke: 'strum' };
  function musStep(ln, t) {
    var tr = ln.tr, len = tr.eighth;
    (tr.steps[ln.step] || []).forEach(function (ev) {
      musNotes++;
      var k = ev[0], inst = MUS_INST[k === 'lead' ? tr.lead[0] : (tr.voice && tr.voice[k]) || MUS_VOICE[k]];
      if (!inst) musDrum(ln.g, k, t);
      else inst(ln.g, ev[1], t, k === 'arp' ? Math.max(2, ev[2]) * len : ev[2] * len * (k === 'bass' ? 0.9 : 0.95), ev[3]);
    });
    if (S.band) (tr.bsteps[ln.step] || []).forEach(function (ev) {   // 마을 음악회: owned, unmuted instruments only
      if (!L.bndLive(S, ev[4])) return;
      musNotes++;
      MUS_INST[MUS_VOICE[ev[0]]](ln.g, ev[1], t, ev[2] * len * 0.95, ev[3]);
    });
  }
  // start `name` (or silence for ''), fading every older lane out over MUS_FADE
  function musSwitch(name) {
    var t = sndCtx.currentTime;
    musLanes.forEach(function (ln) {
      if (ln.end > t + MUS_FADE) { ln.end = t + MUS_FADE; ln.g.gain.cancelScheduledValues(t); ln.g.gain.setValueAtTime(ln.g.gain.value, t); ln.g.gain.linearRampToValueAtTime(0, t + MUS_FADE); }
    });
    musTrack = name;
    if (!MUS[name]) return;
    var g = sndCtx.createGain(); g.connect(sndMus);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + MUS_FADE);
    musLanes.push({ tr: musBuild(MUS[name]), g: g, step: 0, at: t + 0.05, end: Infinity });
  }
  function musTick() {
    if (!sndCtx || sndCtx.state !== 'running') return;
    if (!sndMus) {
      var lp = sndCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.connect(sndMaster);
      sndMus = sndCtx.createGain(); sndMus.gain.value = volBus('music'); sndMus.connect(lp);
    }
    var t = sndCtx.currentTime, want = musOn ? (musForce || bndTrack(curEnv(now()).phase)) : '';   // bndTrack: the phase itself unless a 음악회 is on
    if (want !== musTrack) musSwitch(want);
    var duck = !!(reel || mini || arcOn());
    if (duck !== musDucked) { musDucked = duck; sndMus.gain.setTargetAtTime(volBus('music'), t, 0.4); }
    musLanes = musLanes.filter(function (ln) {
      if (ln.end + 1 < t) { setTimeout(function () { ln.g.disconnect(); }, 500); return false; }
      if (ln.at < t) ln.at = t + 0.05;   // back from a pause or a stall: carry on from now, never a burst of late notes
      var stop = Math.min(t + MUS_AHEAD, ln.end);
      while (ln.at < stop) {
        musStep(ln, ln.at);
        ln.at += ln.tr.eighth * (ln.step % 2 ? 1 - ln.tr.swing : 1 + ln.tr.swing);
        ln.step = (ln.step + 1) % ln.tr.n;
      }
      return true;
    });
  }
  var sndErr = null;   // a timer error is logged once, not swallowed every tick
  function sndLog(e) { if (!sndErr) { sndErr = e; console.warn(e); } }
  setInterval(function () { try { musTick(); } catch (e) { sndLog(e); } }, 200);
  function musSet(on) {
    musOn = on;
    try { localStorage.setItem(MUS_KEY, on ? '1' : '0'); } catch (e) { /* storage blocked: setting lasts this session */ }
    toast(on ? '음악 켬' : '음악 끔', 1600);
  }

  // ---------- 환경음: a quiet soundscape for where you are, the weather, the time of day ----------
  // Looping layers (one shared 4s noise buffer, filtered, most with a slow LFO) → per-layer gain (the crossfade) → sndAmb
  // (bus, under the music) → lowpass → sndMaster; plus sparse random one-shots (birds, cicadas, crickets, frogs, an owl, rain
  // drops, fire crackle) booked on the AudioContext clock. ambTick reads the state every 500ms, never per frame. A layer
  // that has faded out is stopped and rebuilt when wanted again. Mute and a hidden tab suspend the whole context.
  var AMB_KEY = 'farmfish.ambient';
  var ambOn = (function () { try { return localStorage.getItem(AMB_KEY) !== '0'; } catch (e) { return true; } })();
  var AMB_BUS = 0.4, AMB_FADE = 2, AMB_DT = 0.5;
  // layer: noise filter [type, Hz, Q], volume, gain LFO [Hz, depth 0–1], filter LFO [Hz, ±Hz]
  var AMB_LAYERS = {
    lap:   { f: ['lowpass', 450, 0.7], v: 0.35, lfo: [0.17, 0.4] },                       // 연못·강: gentle lapping
    waves: { f: ['lowpass', 600, 0.7], v: 0.45, lfo: [0.09, 0.55] },                      // 바다: slow swells
    brook: { f: ['bandpass', 1600, 0.8], v: 0.12, lfo: [0.6, 0.2], sweep: [1.7, 500] },   // 계곡·온천: a trickle
    under: { f: ['lowpass', 220, 0.7], v: 0.7, lfo: [0.05, 0.25] },                       // 잠수 (and the train's rumble, quieter)
    rain:  { f: ['bandpass', 3000, 0.4], v: 0.08 },
    wind:  { f: ['bandpass', 500, 1.5], v: 0.4, lfo: [0.11, 0.5], sweep: [0.07, 250] },
    fire:  { f: ['lowpass', 250, 0.7], v: 0.3, lfo: [0.8, 0.3] }
  };
  // the water at each fishing spot ('farm' view; every SCENES id — test/sound.test.js checks): layer → level
  var AMB_SPOT = {
    pond: { lap: 1 }, river: { lap: 0.8, brook: 0.4 }, sea: { waves: 1 }, island: { waves: 1 }, offshore: { waves: 1 }, ocean: { waves: 1 },
    valley: { brook: 1 }, onsen: { brook: 0.5, lap: 0.5 }, snow: { wind: 0.7 }, cmpbrook: { brook: 1 }, cmpshore: { waves: 1 }
  };
  // the other views with water or wind; any view not here is dry land (birds, bugs, weather only)
  var AMB_VIEW = {
    island: { waves: 0.8 }, farisle: { waves: 1 }, port: { waves: 0.6 }, flat: { waves: 0.5 }, peak: { wind: 1 },
    trnvalley: { brook: 0.7 }, trnonsen: { brook: 0.5 }, trnsnow: { wind: 0.8 }, cmpvalley: { brook: 0.8 }, cmpsea: { waves: 0.8 }
  };
  // indoors: quiet, rain only muffled (the train: its own low rumble)
  var AMB_IN = { house: true, home: true, museum: true, cave: true, trnride: true };
  // one-shots at time t into the ambient bus d
  var AMB_EV = {
    bird: function (t, d) {
      var f = 2600 + Math.random() * 1500, n = 2 + Math.floor(Math.random() * 4), up = Math.random() < 0.5;
      for (var k = 0; k < n; k++) sndOsc('sine', f, f * (up ? 1.3 : 0.75), t + k * (0.09 + Math.random() * 0.05), 0.05, 0.02, d);
    },
    cicada: function (t, d) {   // a buzzing tone (square tremolo) that swells, holds a few seconds and fades
      var o = sndCtx.createOscillator(), am = sndCtx.createOscillator(), ag = sndCtx.createGain(), g = sndCtx.createGain(), e = sndCtx.createGain(), len = 2 + Math.random() * 3;
      o.frequency.value = 4000 + Math.random() * 800; am.type = 'square'; am.frequency.value = 30 + Math.random() * 20;
      ag.gain.value = 0.5; g.gain.value = 0.5;
      e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.012, t + 1); e.gain.setValueAtTime(0.012, t + len); e.gain.linearRampToValueAtTime(0, t + len + 1.5);
      am.connect(ag); ag.connect(g.gain); o.connect(g); g.connect(e); e.connect(d);
      o.start(t); am.start(t); o.stop(t + len + 1.6); am.stop(t + len + 1.6);
    },
    cricket: function (t, d) {
      var f = 4300 + Math.random() * 600, r, k, n = 1 + Math.floor(Math.random() * 3);
      for (r = 0; r < n; r++) for (k = 0; k < 3; k++) sndOsc('sine', f, f, t + r * 0.4 + k * 0.05, 0.025, 0.012, d);
    },
    frog: function (t, d) { var f = 130 + Math.random() * 60; sndOsc('triangle', f, f * 0.8, t, 0.07, 0.03, d); sndOsc('triangle', f * 1.1, f * 0.85, t + 0.11, 0.08, 0.03, d); },
    owl: function (t, d) { sndOsc('sine', 420, 390, t, 0.25, 0.025, d); sndOsc('sine', 400, 370, t + 0.6, 0.4, 0.02, d); },
    drop: function (t, d) { var f = 1500 + Math.random() * 1500; sndOsc('sine', f, f * 0.6, t, 0.04, 0.012, d); },
    crackle: function (t, d) { for (var k = 0, n = 1 + Math.floor(Math.random() * 3); k < n; k++) sndHiss('highpass', 2500, 2500, t + k * 0.03, 0.015, 0.03 + Math.random() * 0.04, d); },
    // 소리 도감 (ui/rec.js): booked only while a 녹음기 is owned and that sound's conditions hold (recAmbAdd); never on their own
    cuckoo: function (t, d) { sndOsc('sine', 740, 700, t, 0.22, 0.03, d); sndOsc('sine', 590, 560, t + 0.3, 0.32, 0.03, d); },
    woodpk: function (t, d) { for (var k = 0, n = 8 + Math.floor(Math.random() * 6); k < n; k++) sndOsc('triangle', 900, 500, t + k * 0.055, 0.02, 0.03, d); },
    oriole: function (t, d) { [1300, 1700, 1500, 2000].forEach(function (f, k) { sndOsc('sine', f, f * 1.1, t + k * 0.13, 0.11, 0.022, d); }); },
    gull: function (t, d) { for (var k = 0; k < 3; k++) { sndOsc('sawtooth', 1500, 1000, t + k * 0.28, 0.2, 0.008, d); sndOsc('sine', 1500, 1000, t + k * 0.28, 0.2, 0.02, d); } },
    bigcicada: function (t, d) { for (var k = 0; k < 14; k++) sndOsc('square', 2600, 2500, t + k * 0.07, 0.05, 0.006 + (k < 7 ? k : 14 - k) * 0.001, d); },
    bellbug: function (t, d) { for (var k = 0; k < 4; k++) sndOsc('sine', 4100, 4100, t + k * 0.16, 0.12, 0.012, d); },
    toad: function (t, d) { sndOsc('square', 260, 230, t, 0.12, 0.01, d); sndOsc('triangle', 260, 230, t, 0.12, 0.03, d); sndOsc('triangle', 300, 250, t + 0.3, 0.12, 0.03, d); },
    kingfish: function (t, d) { sndOsc('sine', 3200, 3600, t, 0.06, 0.02, d); sndOsc('sine', 600, 200, t + 0.12, 0.12, 0.03, d); sndHiss('lowpass', 2000, 400, t + 0.12, 0.3, 0.06, d); },
    scops: function (t, d) { sndOsc('sine', 980, 940, t, 0.14, 0.02, d); sndOsc('sine', 980, 900, t + 0.22, 0.2, 0.02, d); },
    trickle: function (t, d) { for (var k = 0; k < 4; k++) { var f = 900 + Math.random() * 900; sndOsc('sine', f, f * 1.4, t + k * 0.09, 0.05, 0.01, d); } },
    fall: function (t, d) { sndHiss('lowpass', 900, 700, t, 2.5, 0.05, d); sndHiss('bandpass', 2500, 2000, t, 2.5, 0.02, d); },
    bubble: function (t, d) { for (var k = 0; k < 5; k++) { var f = 300 + Math.random() * 300; sndOsc('sine', f, f * 1.8, t + k * 0.12 + Math.random() * 0.05, 0.05, 0.03, d); } },
    surf: function (t, d) { sndHiss('lowpass', 400, 1600, t, 1.2, 0.07, d); sndHiss('highpass', 3000, 2000, t + 0.8, 1.4, 0.02, d); },
    whale: function (t, d) { sndOsc('sine', 220, 330, t, 1.4, 0.03, d); sndOsc('sine', 330, 180, t + 1.4, 1.6, 0.025, d); },
    whistle: function (t, d) { sndOsc('triangle', 660, 640, t, 0.9, 0.02, d); sndOsc('triangle', 830, 800, t, 0.9, 0.015, d); },
    boom: function (t, d) { sndOsc('sine', 120, 45, t, 0.5, 0.06, d); sndHiss('lowpass', 1200, 200, t, 0.6, 0.08, d); sndHiss('highpass', 4000, 4000, t + 0.4, 0.5, 0.015, d); },
    windbell: function (t, d) { [2093, 2637, 3136].forEach(function (f, k) { sndOsc('sine', f, f, t + k * 0.11 + Math.random() * 0.05, 1.1, 0.012, d); }); },
    crunch: function (t, d) { for (var k = 0; k < 3; k++) sndHiss('bandpass', 1500, 900, t + k * 0.38, 0.12, 0.05, d); },
    mist: function (t, d) { [523, 659, 784, 659, 880].forEach(function (f, k) { sndOsc('sine', f, f, t + k * 0.35, 0.6, 0.02, d); sndOsc('triangle', f / 2, f / 2, t + k * 0.35, 0.6, 0.008, d); }); }
  };
  // what should be playing now: { lay: { layer: level }, ev: { one-shot: per second } }
  function ambWant() {
    var lay = {}, ev = {}, v = view, t = now(), e = curEnv(t), k;
    if (!ambOn) return { lay: lay, ev: ev };
    if (v === 'dive') return { lay: { under: 1 }, ev: ev };
    if (AMB_IN[v]) {
      if (v === 'trnride') lay.under = 0.4;
      if (e.weather === 'rain') lay.rain = 0.3;
      return { lay: lay, ev: ev };
    }
    var water = v === 'farm' ? AMB_SPOT[scene] || AMB_SPOT.pond : AMB_VIEW[v] || {};
    for (k in water) lay[k] = water[k];
    var wet = e.weather === 'rain', cold = e.weather === 'snow' || e.season === 'winter', ph = e.phase, se = e.season;
    if (wet) { lay.rain = 1; ev.drop = 1.5; }
    if (cold) lay.wind = Math.max(lay.wind || 0, e.weather === 'snow' ? 0.6 : 0.4);
    // a lit camp fire: at the camp, or quieter from its night-fishing water
    var site = cmpIsView(v) ? cmpSiteNow() : v === 'farm' && SCENES[scene].camp;
    if (site && S.camp && L.cmpFireOn(S, site, t)) { lay.fire = v === 'farm' ? 0.5 : 1; ev.crackle = v === 'farm' ? 1 : 3; }
    if (!cold && !wet && (ph === 'morning' || ph === 'day')) ev.bird = ph === 'morning' ? 0.4 : 0.2;
    if (se === 'summer' && ph === 'day' && !wet && !cold) ev.cicada = 0.12;
    if (!cold && (ph === 'evening' || ph === 'night')) ev.cricket = se === 'autumn' ? 1 : ph === 'evening' ? 0.6 : 0.4;
    if (ph === 'night' && (se === 'spring' || se === 'summer') && (lay.lap || lay.brook || wet)) ev.frog = 0.3;
    if (ph === 'night' && !wet) ev.owl = 0.03;
    return { lay: lay, ev: ev };
  }
  var sndAmb = null, ambNoise = null, ambLive = {}, ambNow = { lay: {}, ev: {} };
  function ambLayer(id) {
    var A = AMB_LAYERS[id], s = sndCtx.createBufferSource(), f = sndCtx.createBiquadFilter(), m = sndCtx.createGain(), g = sndCtx.createGain(), lfos = [];
    s.buffer = ambNoise; s.loop = true; f.type = A.f[0]; f.frequency.value = A.f[1]; f.Q.value = A.f[2];
    m.gain.value = 1 - (A.lfo ? A.lfo[1] : 0); g.gain.value = 0;
    function lfo(hz, depth, param) {
      var o = sndCtx.createOscillator(), og = sndCtx.createGain();
      o.frequency.value = hz * (0.85 + Math.random() * 0.3); og.gain.value = depth; o.connect(og); og.connect(param); o.start(); lfos.push(o);
    }
    if (A.lfo) lfo(A.lfo[0], A.lfo[1], m.gain);
    if (A.sweep) lfo(A.sweep[0], A.sweep[1], f.frequency);
    s.connect(f); f.connect(m); m.connect(g); g.connect(sndAmb); s.start(0, Math.random() * 4);
    return { s: s, g: g, lfos: lfos, lv: 0, off: 0 };
  }
  function ambTick() {
    if (!sndCtx || sndCtx.state !== 'running') return;
    if (!sndAmb) {
      var lp = sndCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5000; lp.connect(sndMaster);
      sndAmb = sndCtx.createGain(); sndAmb.gain.value = volBus('ambient'); sndAmb.connect(lp);
      var n = sndCtx.sampleRate * 4, d = (ambNoise = sndCtx.createBuffer(1, n, sndCtx.sampleRate)).getChannelData(0);
      for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    }
    var t = sndCtx.currentTime, w = ambNow = ambWant(), id;
    recAmbAdd(w);   // 소리 도감: adds its own one-shots only (a 녹음기 owned, 환경음 on); the ones above are untouched
    for (id in AMB_LAYERS) {
      var lv = w.lay[id] || 0, ly = ambLive[id];
      if (!ly && !lv) continue;
      if (!ly) ly = ambLive[id] = ambLayer(id);
      if (lv !== ly.lv) { ly.lv = lv; ly.off = t; ly.g.gain.setTargetAtTime(lv * AMB_LAYERS[id].v, t, AMB_FADE / 3); }
      if (!lv && t - ly.off > AMB_FADE * 2) {   // faded out: stop it, rebuilt when wanted again
        ly.s.stop(); ly.lfos.forEach(function (o) { o.stop(); }); ly.g.disconnect(); delete ambLive[id];
      }
    }
    for (id in w.ev) {   // about rate × 0.5s of each one-shot this tick, at random moments in the next half second
      var c = w.ev[id] * AMB_DT, k = Math.floor(c) + (Math.random() < c % 1 ? 1 : 0);
      if (k > 0) recHeard(id);   // 소리 도감: a ♪ chip when it is a sound you can record here
      while (k-- > 0) AMB_EV[id](t + 0.05 + Math.random() * AMB_DT, sndAmb);
    }
  }
  setInterval(function () { try { ambTick(); } catch (e) { sndLog(e); } }, AMB_DT * 1000);
  function ambSet(on) {
    ambOn = on;
    try { localStorage.setItem(AMB_KEY, on ? '1' : '0'); } catch (e) { /* storage blocked: setting lasts this session */ }
    toast(on ? '환경음 켬' : '환경음 끔', 1600);
  }

  // ---------- 크기: each bus = its mix gain × the slider (music ducking stays on top) ----------
  var SND_LOUD = 8;   // master at 100%: catch sounds reach the limiter (-6 dBFS), music RMS about -21 dBFS (was 0.5: 24 dB quieter, VOC)
  function volBus(k) {
    var g = Math.pow(VOL[k] / 100, 2);
    return g * (k === 'master' ? SND_LOUD : k === 'sfx' ? 0.8 : k === 'music' ? MUS_BUS * (musDucked ? MUS_DUCK : 1) : AMB_BUS);
  }
  function volSet(k, v) {
    VOL[k] = v;
    try { localStorage.setItem(VOL_KEY + k, String(v)); } catch (e) { /* storage blocked: setting lasts this session */ }
    var bus = { master: sndMaster, sfx: sndSfx, music: sndMus, ambient: sndAmb }[k];
    if (bus) bus.gain.setTargetAtTime(volBus(k), sndCtx.currentTime, 0.05);   // not made yet: picked up when it is
  }
  function sfxSet(on) {
    sfxOn = on;
    try { localStorage.setItem(SFX_KEY, on ? '1' : '0'); } catch (e) { /* storage blocked: setting lasts this session */ }
    toast(on ? '효과음 켬' : '효과음 끔', 1600);
  }

  // ---------- on/off: ⚙ 설정 「전체」 row, M key ----------
  // M (or the 설정 row) flips everything; the 설정 checkbox follows (app, not document: it may live in the PiP window)
  function sndShow() { var cb = app.querySelector('#setSnd'); if (cb) cb.checked = !!sndOn; }
  function sndSet(on) {
    sndOn = on;
    try { localStorage.setItem(SND_KEY, on ? '1' : '0'); } catch (e) { /* storage blocked: setting lasts this session */ }
    if (on) sndWake(); else if (sndCtx) sndCtx.suspend();   // no Web Audio: sndWake turns sndOn back off
    sndShow();
    toast(sndOn ? '소리 켬 · M 키로 끄기' : on ? '이 브라우저는 소리를 낼 수 없어요' : '소리 끔 · M 키로 켜기', 1600);
  }
  function sndToggle() { sndSet(!sndOn); }
  // M on any layout or case: physical KeyM, m/M, or the Korean IME jamo on that key
  function isSndKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    var t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return false;
    return e.code === 'KeyM' || (typeof e.key === 'string' && (e.key.toLowerCase() === 'm' || e.key === 'ㅡ'));
  }
  // any button press that made no sound of its own gets a soft click (bubble phase: after the button's own handler): a sheet
  // opening (the header buttons), closing (닫기 · ✕ · 그만), a purchase or confirm (a price, 사기·짓기·받기…), or a plain tap.
  // The button is not even looked at while there is no sound to play.
  var SND_OPEN_IDS = { bagBtn: 1, shopBtn: 1, dexBtn: 1, clockBtn: 1, setBtn: 1, pipBtn: 1, sceneBtn: 1 };
  var SND_CLOSE = /^(닫기|✕|×|그만)/, SND_OK = /^[\d,]+$|코인|사기|짓기|받기|팔기|기증|개통|고치기|확인|넣기|맡기/;
  function sndClick(e) {
    if (!sndOn || !sfxOn || !sndCtx) return;
    var b = e.target && e.target.closest && e.target.closest('button,label');
    if (!b || b.disabled || b.closest('#band .pads')) return;   // 마을 음악회 pads sound their own note
    var x = (b.textContent || '').trim(), k = SND_OPEN_IDS[b.id] ? 1 : SND_CLOSE.test(x) ? 2 : SND_OK.test(x) ? 3 : 0;
    sfx(k === 1 ? 'tapOpen' : k === 2 ? 'tapClose' : k === 3 ? 'tapOk' : 'tap', true);
  }
