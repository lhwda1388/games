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
      sndMaster = sndCtx.createGain(); sndMaster.gain.value = volBus('master'); sndMaster.connect(sndCtx.destination);
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

  // one voice: oscillator from f0 (slide to f1) with a short attack and an exponential fall; returns its end time
  function sndOsc(type, f0, f1, t, dur, vol, dest) {
    var o = sndCtx.createOscillator(), g = sndCtx.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || sndSfx); o.start(t); o.stop(t + dur + 0.02);
    return t + dur;
  }
  // filtered noise (filter freq slides f0 → f1)
  function sndHiss(kind, f0, f1, t, dur, vol, dest) {
    var s = sndCtx.createBufferSource(), f = sndCtx.createBiquadFilter(), g = sndCtx.createGain();
    s.buffer = sndNoise; f.type = kind; f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || sndSfx); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
    return t + dur;
  }
  // notes one after another, each `step` apart
  function sndSeq(type, fs, t, step, dur, vol) {
    var end = t;
    fs.forEach(function (f, k) { end = sndOsc(type, f, f, t + k * step, k === fs.length - 1 ? dur * 1.6 : dur, vol); });
    return end;
  }
  var SND = {
    tap:     function (t) { return sndOsc('triangle', 1100, 900, t, 0.035, 0.05); },
    cast:    function (t) { sndOsc('triangle', 520, 260, t, 0.12, 0.03); return sndHiss('bandpass', 1800, 500, t, 0.22, 0.12); },
    bite:    function (t) { sndOsc('sine', 900, 300, t, 0.09, 0.12); return sndOsc('sine', 700, 250, t + 0.11, 0.08, 0.09); },
    strike:  function (t) { sndOsc('triangle', 300, 120, t, 0.12, 0.1); return sndHiss('lowpass', 1200, 300, t, 0.2, 0.18); },
    tick:    function (t) { return sndOsc('square', 1400, 1400, t, 0.018, 0.025); },
    catch:   function (t) { return sndSeq('triangle', [523, 784], t, 0.07, 0.1, 0.09); },
    catchRare: function (t) { sndSeq('square', [523, 659, 784, 1047], t, 0.07, 0.12, 0.03); return sndSeq('triangle', [523, 659, 784, 1047], t, 0.07, 0.12, 0.08); },
    catchLegend: function (t) {
      sndSeq('square', [392, 523, 659, 784], t, 0.09, 0.1, 0.025);
      sndSeq('triangle', [392, 523, 659, 784], t, 0.09, 0.1, 0.07);
      [784, 1047, 1319].forEach(function (f) { sndOsc('triangle', f, f, t + 0.38, 0.6, 0.05); });
      return sndOsc('square', 1047, 1047, t + 0.38, 0.6, 0.02);
    },
    lost:    function (t) { return sndSeq('triangle', [440, 330, 247], t, 0.1, 0.14, 0.07); },
    snap:    function (t) { sndHiss('highpass', 3000, 3000, t, 0.05, 0.15); return sndSeq('triangle', [330, 220], t + 0.06, 0.1, 0.14, 0.07); },
    plant:   function (t) { sndHiss('lowpass', 600, 600, t, 0.06, 0.06); return sndOsc('triangle', 180, 110, t, 0.09, 0.12); },
    water:   function (t) { sndOsc('sine', 1200, 1800, t + 0.03, 0.04, 0.04); sndOsc('sine', 1500, 2200, t + 0.1, 0.04, 0.04); return sndHiss('bandpass', 2500, 1200, t, 0.25, 0.05); },
    harvest: function (t) { sndOsc('triangle', 440, 880, t, 0.08, 0.09); return sndOsc('triangle', 1320, 1320, t + 0.07, 0.06, 0.05); },
    coin:    function (t) { return sndSeq('square', [988, 1319], t, 0.06, 0.1, 0.035); },
    buy:     function (t) { sndHiss('bandpass', 3000, 3000, t, 0.03, 0.04); return sndSeq('triangle', [784, 587], t, 0.06, 0.09, 0.07); },
    level:   function (t) { sndSeq('square', [523, 659, 784, 1047], t, 0.06, 0.1, 0.035); return sndSeq('triangle', [523, 659, 784, 1047], t, 0.06, 0.1, 0.06); },
    error:   function (t) { return sndSeq('triangle', [196, 175], t, 0.09, 0.08, 0.05); },
    splash:  function (t) { sndOsc('sine', 400, 120, t, 0.15, 0.08); return sndHiss('lowpass', 2000, 300, t, 0.4, 0.2); },
    whoosh:  function (t) { return sndHiss('bandpass', 400, 1400, t, 0.25, 0.04); },
    hit:     function (t) { sndHiss('bandpass', 2000, 2000, t, 0.03, 0.05); return sndOsc('square', 660, 330, t, 0.06, 0.04); },
    // active play: 잠수, 탈것, 사진기, 곤충, 별 잇기, 동굴, 도전, 보스전, 쓰다듬기
    swim:    function (t) { sndOsc('sine', 220, 150, t + 0.02, 0.12, 0.03); return sndHiss('lowpass', 500, 200, t, 0.22, 0.06); },
    beep:    function (t) { sndOsc('square', 880, 880, t, 0.05, 0.025); return sndOsc('square', 880, 880, t + 0.1, 0.05, 0.025); },
    jump:    function (t) { sndOsc('square', 300, 700, t, 0.1, 0.025); return sndOsc('triangle', 300, 700, t, 0.1, 0.06); },
    bump:    function (t) { sndHiss('lowpass', 800, 200, t, 0.1, 0.12); return sndOsc('triangle', 160, 70, t, 0.12, 0.12); },
    shutter: function (t) { sndHiss('highpass', 4000, 4000, t, 0.02, 0.1); sndOsc('square', 1800, 1800, t + 0.06, 0.015, 0.02); return sndHiss('bandpass', 2500, 2500, t + 0.06, 0.03, 0.08); },
    swing:   function (t) { return sndHiss('bandpass', 800, 2500, t, 0.12, 0.05); },
    // p = how many stars are joined so far: each one a step up a pentatonic scale
    star:    function (t, p) {
      var f = 523 * Math.pow(2, [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24][Math.max(0, Math.min(10, p || 0))] / 12);
      sndOsc('triangle', f * 2, f * 2, t, 0.06, 0.015);
      return sndOsc('sine', f, f, t, 0.18, 0.06);
    },
    chime:   function (t) { [523, 784].forEach(function (f) { sndOsc('triangle', f, f, t + 0.3, 0.6, 0.04); }); return sndSeq('sine', [1047, 1319, 1568, 2093], t, 0.08, 0.2, 0.05); },
    pick:    function (t) { sndOsc('triangle', 180, 90, t, 0.06, 0.06); sndHiss('bandpass', 3500, 3500, t, 0.04, 0.08); sndOsc('square', 1300, 1100, t, 0.04, 0.025); return sndOsc('triangle', 2600, 2400, t, 0.09, 0.03); },
    sting:   function (t) {
      sndOsc('triangle', 110, 55, t, 0.5, 0.12); sndHiss('lowpass', 3000, 200, t, 0.45, 0.14);
      sndSeq('square', [220, 233], t, 0.12, 0.1, 0.03);
      return sndOsc('square', 466, 440, t + 0.24, 0.3, 0.025);
    },
    puff:    function (t) { return sndHiss('lowpass', 900, 300, t, 0.15, 0.08); },
    pet:     function (t) { sndOsc('sine', 700, 900, t, 0.06, 0.05); return sndOsc('sine', 900, 1200, t + 0.08, 0.08, 0.05); }
  };
  var SND_GAPS = { tick: 150, swim: 700, beep: 300 };
  // soft: a fallback sound (button tap, wallet spend) that stays quiet when something else just played; arg: passed to the sound
  function sfx(name, soft, arg) {
    if (!sndOn || !sfxOn || !sndCtx || sndCtx.state !== 'running' || !SND[name]) return;
    var p = performance.now();
    if (p - (sndLast[name] || -1e9) < (SND_GAPS[name] || SND_GAP)) return;
    if (soft && p - sndAny < SND_SOFT) return;
    var t = sndCtx.currentTime;
    sndEnds = sndEnds.filter(function (e) { return e > t; });
    if (sndEnds.length >= SND_VOICES) return;
    sndLast[name] = sndAny = p;
    try { sndEnds.push(SND[name](t + 0.005, arg)); } catch (e) { /* a browser without some node type: stay quiet */ }
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
    morning: {   // D major, 108 bpm: bright, a little bounce
      bpm: 108, swing: 0, lead: ['square', 0.022], bassV: 0.07, arpV: 0, form: 'AABC',
      bass: 'r . 5 . o . 5 .', arp: '', drum: 'k . h . s . h .',
      A: { ch: 'D Bm G A', mel: 'F#5 . A5 B5 A5 - F#5 . | D5 - F#5 . E5 D5 B4 . | D5 . E5 F#5 G5 - B5 . | A5 - - - E5 - . .' },
      B: { ch: 'G A F#m Bm', mel: 'B5 . A5 G5 F#5 - G5 . | A5 - E5 . C#5 - E5 . | F#5 . E5 F#5 A5 - F#5 . | D5 - F#5 . B4 - - .' },
      C: { ch: 'Em A D D', mel: 'G5 . F#5 E5 D5 - E5 . | C#5 . E5 . A5 - G5 . | F#5 - D5 . A4 . D5 . | D5 - - - . . . .' }
    },
    day: {       // F major, 88 bpm, swung: relaxed lo-fi sevenths
      bpm: 88, swing: 0.14, lead: ['triangle', 0.075], bassV: 0.08, arpV: 0.018, form: 'ABAC',
      bass: 'r - - 5 . r 5 .', arp: '. . 3 . . . 7 .', drum: 'k . h . s . h k',
      A: { ch: 'FM7 Am7 Dm7 C', mel: 'A4 - C5 . E5 - D5 C5 | E5 - - . C5 . A4 . | F4 . A4 C5 D5 - C5 . | G4 - - - . . . .' },
      B: { ch: 'BbM7 Am7 Gm7 C', mel: 'D5 - F5 . E5 D5 C5 . | C5 - E5 . A4 - . . | Bb4 . D5 . F5 - E5 D5 | E5 - - - G4 - . .' },
      C: { ch: 'BbM7 C FM7 FM7', mel: 'D5 - F5 . A5 - G5 F5 | E5 - D5 . C5 - . . | A4 . C5 . E5 - C5 . | F5 - - - . . . .' }
    },
    evening: {   // Eb major, 76 bpm, swung: warm and slow, broken chords underneath
      bpm: 76, swing: 0.1, lead: ['triangle', 0.07], bassV: 0.08, arpV: 0.014, form: 'ABAC',
      bass: 'r - - - 5 - - .', arp: 'r 3 5 7 o 7 5 3', drum: 'k . . . s . . h',
      A: { ch: 'EbM7 Cm7 AbM7 Bb', mel: 'G4 - Bb4 - Eb5 - D5 . | C5 - - - G4 - . . | Ab4 . C5 . Eb5 - F5 . | D5 - - - - - . .' },
      B: { ch: 'Gm7 Cm7 Fm7 Bb', mel: 'Bb4 - D5 - F5 - Eb5 . | Eb5 - - - C5 - . . | Ab4 - C5 . F5 - Eb5 D5 | D5 - - - Bb4 - . .' },
      C: { ch: 'AbM7 Bb EbM7 EbM7', mel: 'C5 - Eb5 . Ab5 - G5 F5 | F5 - D5 . Bb4 - . . | G4 . Bb4 . Eb5 - D5 . | Eb5 - - - - - . .' }
    },
    night: {     // A minor, 62 bpm: sparse, no drums
      bpm: 62, swing: 0, lead: ['triangle', 0.06], bassV: 0.06, arpV: 0.016, form: 'ABAC',
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
  // a track → steps[eighth] = [[kind, hz, eighths, vol]]; built once
  function musBuild(tr) {
    if (tr.steps) return tr;
    var steps = [], bar = 0;
    function add(i, ev) { (steps[i] = steps[i] || []).push(ev); }
    tr.form.split('').forEach(function (sec) {
      var S2 = tr[sec], base = bar * 8;
      musHits(musToks(S2.mel)).forEach(function (h) {
        var m = /^([A-G][#b]?)(\d)$/.exec(h.v);
        add(base + h.i, ['lead', musHz(12 * (+m[2] + 1) + musPc(m[1])), h.len, tr.lead[1]]);
      });
      S2.ch.split(' ').forEach(function (c, b) {
        var m = /^([A-G][#b]?)(m7|M7|m)?$/.exec(c), pc = (musPc(m[1]) + 12) % 12, iv = MUS_CH[m[2] || ''];
        function note(t, oct) { return oct + (t === 'r' ? 0 : t === '3' ? iv[1] : t === '5' ? iv[2] : t === '7' ? (iv[3] || 12) : 12); }
        var bassRoot = 40 + (pc - 4 + 12) % 12, arpRoot = 60 + pc;
        musHits(musToks(tr.bass)).forEach(function (h) { add(base + b * 8 + h.i, ['bass', musHz(note(h.v, bassRoot)), h.len, tr.bassV]); });
        if (tr.arpV) musHits(musToks(tr.arp)).forEach(function (h) { add(base + b * 8 + h.i, ['arp', musHz(note(h.v, arpRoot)), h.len, tr.arpV]); });
        if (tr.drum) musToks(tr.drum).forEach(function (d, i) { if (d !== '.') add(base + b * 8 + i, [d]); });
      });
      bar += 4;
    });
    tr.steps = steps; tr.n = bar * 8; tr.eighth = 30 / tr.bpm;
    return tr;
  }
  var sndMus = null, musLanes = [], musName = '', musForce = null, musDucked = false, musNotes = 0;
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
  function musStep(ln, t) {
    var tr = ln.tr, len = tr.eighth;
    (tr.steps[ln.step] || []).forEach(function (ev) {
      musNotes++;
      if (ev[0] === 'lead') musVoice(ln.g, tr.lead[0], ev[1], t, ev[2] * len * 0.95, ev[3]);
      else if (ev[0] === 'bass') musVoice(ln.g, 'triangle', ev[1], t, ev[2] * len * 0.9, ev[3]);
      else if (ev[0] === 'arp') musVoice(ln.g, 'sine', ev[1], t, Math.max(2, ev[2]) * len, ev[3]);
      else musDrum(ln.g, ev[0], t);
    });
  }
  // start `name` (or silence for ''), fading every older lane out over MUS_FADE
  function musSwitch(name) {
    var t = sndCtx.currentTime;
    musLanes.forEach(function (ln) {
      if (ln.end > t + MUS_FADE) { ln.end = t + MUS_FADE; ln.g.gain.cancelScheduledValues(t); ln.g.gain.setValueAtTime(ln.g.gain.value, t); ln.g.gain.linearRampToValueAtTime(0, t + MUS_FADE); }
    });
    musName = name;
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
    var t = sndCtx.currentTime, want = musOn ? (musForce || curEnv(now()).phase) : '';
    if (want !== musName) musSwitch(want);
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
    crackle: function (t, d) { for (var k = 0, n = 1 + Math.floor(Math.random() * 3); k < n; k++) sndHiss('highpass', 2500, 2500, t + k * 0.03, 0.015, 0.03 + Math.random() * 0.04, d); }
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
  function volBus(k) {
    var g = Math.pow(VOL[k] / 100, 2);
    return g * (k === 'master' ? 0.5 : k === 'sfx' ? 0.8 : k === 'music' ? MUS_BUS * (musDucked ? MUS_DUCK : 1) : AMB_BUS);
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
  // any button press that made no sound of its own gets a soft click (bubble phase: after the button's own handler)
  function sndClick(e) { var b = e.target && e.target.closest && e.target.closest('button,label'); if (b && !b.disabled) sfx('tap', true); }
