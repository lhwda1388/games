// 네뷸라 워 — 효과음. WebAudio 합성만 쓴다(오디오 파일 없음).
// A.play(name, vol 0..1, pan -1..1, seed) — seed 로 음높이를 조금씩 흔들어 같은 소리도 매번 다르게(결정론 해시).
// 동시 발음 제한: 같은 소리는 40ms 안에 2개까지, 전체는 8개(폭발·완료음은 10개까지 끼어든다).
// 브라우저 자동재생 정책: 첫 사용자 입력에서 A.unlock() 이 AudioContext 를 만들고 resume 한다. 그 전 play 는 무시.
// 믹스: 음악 / 효과음 / 앰비언스 버스 → (건조 신호 + 잔향 보내기) → out(음소거) → 컴프레서. 잔향은 코드로 만든 감쇠 잡음 임펄스 응답.
// 판 시작 A.startMatch(race) → 우주 드론 앰비언스, A.stopMatch() → 정지.
const NW_AUDIO = (() => {
  const VOL = 0.2, KEY = 'nw-muted', MKEY = 'nw-music', VKEY = 'nw-music-vol', SKEY = 'nw-sfx-vol', MAX = 8, MAX_PRI = 10, SAME = 2, SAME_MS = 0.04;
  const PRI = { battle: 1, victory: 1, defeat: 1, heart: 1, boomL: 1, done: 1, research: 1, ready: 1, alert: 1, sting: 1, vs: 1, reveal: 1, pickLegion: 1, pickSwarm: 1, pickElysian: 1, whoosh: 1, tick: 1, junkHit: 1, v_ready: 1 };

  function create() {
    let ac = null, out = null, noise = null, muted = false, lcg = 12345;
    let sfxBus = null, musicBus = null, ambBus = null, amb = null, matchRace = null, musicOn = true, musicVol = 1, sfxVol = 1, lay = null;
    const ends = [], recent = new Map();
    try { muted = localStorage.getItem(KEY) === '1'; } catch (e) { muted = false; }
    try { musicOn = localStorage.getItem(MKEY) !== '0'; } catch (e) { musicOn = true; }   // 예전 저장값: '0' = 끔
    try { const v = parseInt(localStorage.getItem(VKEY), 10); if (v >= 0 && v <= 100) musicVol = v / 100; } catch (e) { musicVol = 1; }   // 음량 0~100(없으면 100)
    try { const v = parseInt(localStorage.getItem(SKEY), 10); if (v >= 0 && v <= 100) sfxVol = v / 100; } catch (e) { sfxVol = 1; }   // 효과음 음량 0~100(없으면 100)
    const mOn = () => musicOn && musicVol > 0;   // 실제로 들리는 상태(끔 또는 음량 0이면 꺼짐)

    function ensure() {
      if (ac) return ac;
      const C = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!C) return null;
      ac = new C();
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -18; comp.ratio.value = 6;
      out = ac.createGain(); out.gain.value = muted ? 0 : VOL;
      out.connect(comp); comp.connect(ac.destination);
      noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);           // 1초 백색 소음(LCG, 고정 시드)
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) { lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0; d[i] = lcg / 2147483648 - 1; }
      // 잔향: 2초 스테레오 감쇠 잡음(채널마다 다른 LCG 열 → 넓게). 보내는 양은 버스마다 다르게, 돌아오는 양은 낮게.
      const rev = ac.createConvolver(), wet = ac.createGain(), n = Math.floor(ac.sampleRate * 2), ir = ac.createBuffer(2, n, ac.sampleRate);
      for (let c = 0; c < 2; c++) {
        const ch = ir.getChannelData(c); let r = 777 + c * 9001;
        for (let i = 0; i < n; i++) { r = (Math.imul(r, 1664525) + 1013904223) >>> 0; ch[i] = (r / 2147483648 - 1) * Math.pow(1 - i / n, 3); }
      }
      rev.buffer = ir; wet.gain.value = 0.55; rev.connect(wet); wet.connect(out);
      const bus = (gain, send) => {
        const b = ac.createGain(), s = ac.createGain(); b.gain.value = gain; s.gain.value = send;
        b.connect(out); b.connect(s); s.connect(rev); return b;
      };
      sfxBus = bus(sfxVol, 0.16); musicBus = bus(musicGain(), 0.35); ambBus = bus(0.5 * sfxVol, 0.4);
      lay = newLayers();
      return ac;
    }
    // 음악 레이어(판마다 새로): 패드(저역 필터) · 저음 펄스 · 퍼커션 · 아르페지오(저역 필터). 퍼커션·아르페지오는 교전 강도로 열린다.
    function newLayers() {
      const layer = (v, lp) => { const g = ac.createGain(); g.gain.value = v; g.connect(musicBus); if (!lp) return { g, in: g }; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; f.Q.value = 0.8; f.connect(g); return { g, in: f, f }; };
      return { pad: layer(0, 800), pulse: layer(0), perc: layer(0), arp: layer(0, 2000) };
    }
    function musicGain() { return mOn() ? 0.55 * musicVol : 0; }
    // 반환: 재생 가능해지면 풀리는 Promise(연출 화면이 '건너뛰기 → 바로 소리'에 쓴다)
    function unlock() {
      const a = ensure(); if (!a) return Promise.resolve();
      const p = a.state === 'suspended' ? a.resume().catch(() => {}) : Promise.resolve();
      return p.then(() => { if (matchRace && !amb) ambStart(); if (matchRace && !mus) musicStart(); });
    }

    // ---- 앰비언스: 우주 드론(느리게 움직이는 저역 필터 잡음 + 살짝 어긋난 저음 두 개, 느린 LFO) ----
    function ambStart() {
      if (!ac || ac.state !== 'running' || amb) return;
      const t = ac.currentTime, nodes = [];
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 4); g.connect(ambBus);
      const src = ac.createBufferSource(), fl = ac.createBiquadFilter(), ng = ac.createGain();
      src.buffer = noise; src.loop = true; fl.type = 'lowpass'; fl.frequency.value = 320; fl.Q.value = 1.2; ng.gain.value = 0.22;
      src.connect(fl); fl.connect(ng); ng.connect(g); nodes.push(src);
      const lfo = ac.createOscillator(), lg = ac.createGain();                 // 필터가 20초에 한 번 숨쉬듯
      lfo.frequency.value = 0.05; lg.gain.value = 180; lfo.connect(lg); lg.connect(fl.frequency); nodes.push(lfo);
      const root = { legion: 55, swarm: 49, elysian: 41.2 }[matchRace] || 55;
      for (const [f, ty, v] of [[root, 'sine', 0.3], [root * 1.006, 'triangle', 0.12], [root * 1.5, 'sine', 0.06]]) {
        const o = ac.createOscillator(), og = ac.createGain(); o.type = ty; o.frequency.value = f; og.gain.value = v;
        o.connect(og); og.connect(g); nodes.push(o);
      }
      const lfo2 = ac.createOscillator(), lg2 = ac.createGain();               // 음량도 아주 느리게 출렁
      lfo2.frequency.value = 0.07; lg2.gain.value = 0.25; lfo2.connect(lg2); lg2.connect(g.gain); nodes.push(lfo2);
      for (const nd of nodes) nd.start(t);
      amb = { g, nodes };
    }
    function ambStop() {
      if (!amb) return;
      const t = ac.currentTime, a = amb; amb = null;
      a.g.gain.cancelScheduledValues(t); a.g.gain.setTargetAtTime(0.0001, t, 0.6);
      for (const nd of a.nodes) nd.stop(t + 3);
    }
    function startMatch(race) {
      matchRace = race || 'legion'; hits.fill(0); hitSum = 0; ctick = 0; lastBattle = -BATTLE_COOL; intensity = 0;
      ensure(); ambStart(); musicStop(); musicStart();
    }
    function stopMatch() { matchRace = null; if (ac) { ambStop(); musicStop(); } }

    // ---- 절차적 BGM(엠비언트 SF): 미리보기 스케줄러 — 25ms 마다 AudioContext 시간으로 100ms 앞까지 8분음표를 예약한다 ----
    // 화음 진행은 종족별 고정(2마디마다 바뀜, 8화음 = 16마디 순환). 평소엔 패드 + 저음 펄스, 교전 강도가 오르면 퍼커션 → 아르페지오가 열린다.
    const BPM = 76, E8 = 60 / BPM / 2, PER_CHORD = 16, LOOK = 0.1;
    const SONG = {   // bass = 저음 MIDI, prog = 화음(근음 위 반음 수), 패드·아르페지오 음색과 필터
      legion:  { bass: 45, pad: 'sawtooth', padLp: 750, arp: 'square', arpLp: 1800, hat: ['bandpass', 7000, 6], kick: [110, 42],
                 prog: [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17], [0, 3, 7], [5, 8, 12], [8, 12, 15], [7, 10, 14]] },
      swarm:   { bass: 38, pad: 'triangle', padLp: 520, arp: 'sine', arpLp: 1100, hat: ['bandpass', 1400, 4], kick: [90, 34],
                 prog: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [10, 13, 17], [0, 3, 7], [1, 5, 8], [5, 8, 12], [8, 12, 15]] },
      elysian: { bass: 40, pad: 'sine', padLp: 3200, arp: 'triangle', arpLp: 5200, hat: ['highpass', 9000, 1], kick: [120, 60],
                 prog: [[0, 4, 7, 11], [2, 6, 9], [0, 4, 7, 11], [9, 12, 16], [4, 7, 11, 14], [2, 6, 9, 13], [0, 4, 7, 11], [7, 11, 14]] },
    };
    const ARP = [0, 1, 2, 1, 3, 2, 1, 2];
    const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
    let mus = null;   // { race, t0, step, next, timer, padNow }
    const chordOf = step => SONG[mus.race].prog[Math.floor(step / PER_CHORD) % 8];
    function musicStart() {
      if (!ac || ac.state !== 'running' || mus || !matchRace) return;
      const S = SONG[rc(matchRace)], t = ac.currentTime;
      lay.pad.f.frequency.value = S.padLp; lay.arp.f.frequency.value = S.arpLp;
      for (const [k, v] of [['pad', 1], ['pulse', 1], ['perc', 0], ['arp', 0]]) { const g = lay[k].g.gain; g.cancelScheduledValues(t); g.setValueAtTime(v, t); }
      mus = { race: rc(matchRace), t0: t + LOOK, step: 0, next: t + LOOK, padNow: true, timer: setInterval(sched, 25) };
    }
    function musicStop() {
      if (!mus) return;
      clearInterval(mus.timer); mus = null;
      const t = ac.currentTime, old = lay;
      for (const k in old) { const g = old[k].g.gain; g.cancelScheduledValues(t); g.setTargetAtTime(0, t, 0.8); }
      // 이미 예약된 음표는 옛 레이어에 붙어 있다 — 바로 다음 판을 시작해도 그 음표가 되살아나지 않게 레이어를 새로 만들고, 옛 것은 페이드 뒤 끊는다
      lay = newLayers();
      setTimeout(() => { for (const k in old) old[k].g.disconnect(); }, 5000);
    }
    function sched() {
      if (!mus || !ac || ac.state !== 'running') return;
      const now = ac.currentTime;
      if (mus.next < now - 0.2) { const skip = Math.ceil((now - mus.next) / E8); mus.step += skip; mus.next += skip * E8; mus.padNow = true; } // 탭이 가려져 늦었으면 건너뛴다
      while (mus.next < now + LOOK) {
        if (!muted && mOn()) note(mus.step, mus.next);
        mus.step++; mus.next += E8;
      }
    }
    // 패드 한 음: 천천히 올라 머물다 내려온다(지속음 — tone 은 바로 감쇠한다)
    function hold(dst, t, type, f, dur, peak, att) {
      const o = ac.createOscillator(), g = ac.createGain(), rel = Math.min(1.5, dur / 3);
      o.type = type; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + att); g.gain.setValueAtTime(peak, t + dur - rel); g.gain.linearRampToValueAtTime(0, t + dur);
      o.connect(g); g.connect(dst); o.start(t); o.stop(t + dur + 0.05);
    }
    function note(step, t) {
      const S = SONG[mus.race], ch = chordOf(step), inC = step % PER_CHORD, bar = Math.floor(step / 8);
      if (inC === 0 || mus.padNow) {                                   // 패드: 화음이 바뀔 때(또는 다시 켜졌을 때) 느리게 부풀었다 사라진다
        mus.padNow = false;
        const dur = (PER_CHORD - inC) * E8 + 1.2;
        for (const x of ch) {
          const f = mtof(S.bass + 12 + x);
          hold(lay.pad.in, t, S.pad, f, dur, 0.03, 1.6); hold(lay.pad.in, t, S.pad, f * 1.004, dur, 0.018, 2.2);
          if (mus.race === 'elysian') hold(lay.pad.in, t + 0.3, 'triangle', f * 2, dur - 0.3, 0.01, 2.5);
        }
      }
      let r = ((ch[0] % 12) + 12) % 12; if (r > 6) r -= 12;
      const bassF = mtof(S.bass + r);
      if (step % 4 === 0) tone(lay.pulse.in, t, 'sine', bassF, bassF * 0.98, E8 * 1.8, 0.22, 0.02);   // 저음 펄스(4분음표)
      if (step % 2 === 0) {                                            // 강도 → 레이어 문 열기(천천히)
        lay.perc.g.gain.setTargetAtTime(Math.min(1, intensity * 1.4), t, 1.5);
        lay.arp.g.gain.setTargetAtTime(Math.max(0, (intensity - 0.2) / 0.8), t, 2.5);
      }
      if (intensity > 0.02) {
        if (step % 8 === 0 || (step % 8 === 6 && bar % 2)) tone(lay.perc.in, t, 'sine', S.kick[0], S.kick[1], 0.28, 0.5, 0.003);
        if (step % 8 === 4) hiss(lay.perc.in, t, 0.16, 'bandpass', 1800, 900, 1.2, 0.22);
        hiss(lay.perc.in, t, 0.035, S.hat[0], S.hat[1], S.hat[1] * 0.8, S.hat[2], step % 2 ? 0.07 : 0.11);
      }
      if (intensity > 0.2) {                                           // 아르페지오: 화음음 2옥타브, 마디마다 시작 자리를 돈다
        const ns = ch.concat(ch.map(x => x + 12)), f = mtof(S.bass + 24 + ns[(ARP[step % 8] + bar) % ns.length]);
        tone(lay.arp.in, t, S.arp, f, f, E8 * 0.9, 0.05, 0.005);
        if (intensity > 0.7 && step % 2) tone(lay.arp.in, t + E8 / 2, S.arp, f * 2, f * 2, E8 * 0.4, 0.025, 0.003);
      }
    }
    // 다음 8분음표 시각(음악이 안 돌면 t 그대로)
    function quantize(t) { return mus ? mus.t0 + Math.ceil((t - mus.t0) / E8 - 1e-6) * E8 : t; }
    function setMusic(on) {
      musicOn = !!on;
      try { localStorage.setItem(MKEY, musicOn ? '1' : '0'); } catch (e) { /* 저장 못 해도 이번 세션은 적용 */ }
      if (musicBus) musicBus.gain.setTargetAtTime(musicGain(), ac.currentTime, 0.1);
      if (mus && mOn()) mus.padNow = true;
    }
    // 음량 0~1. 0 이면 끈 것과 같다(저장은 0~100 정수). 끔 상태에서 음량만 바꾸면 켠다.
    function setMusicVol(v) {
      musicVol = Math.max(0, Math.min(1, Number(v) || 0));
      try { localStorage.setItem(VKEY, String(Math.round(musicVol * 100))); } catch (e) { /* 저장 못 해도 이번 세션은 적용 */ }
      if (musicVol > 0 && !musicOn) setMusic(true); else if (musicBus) musicBus.gain.setTargetAtTime(musicGain(), ac.currentTime, 0.1);
      if (mus && mOn()) mus.padNow = true;
    }
    // 효과음 음량 0~1(효과음 + 앰비언스 버스). 켜기/끄기(setMuted)와 별개라 끔 상태에서도 값은 그대로 저장된다.
    function setSfxVol(v) {
      sfxVol = Math.max(0, Math.min(1, Number(v) || 0));
      try { localStorage.setItem(SKEY, String(Math.round(sfxVol * 100))); } catch (e) { /* 저장 못 해도 이번 세션은 적용 */ }
      if (sfxBus) { sfxBus.gain.setTargetAtTime(sfxVol, ac.currentTime, 0.05); ambBus.gain.setTargetAtTime(0.5 * sfxVol, ac.currentTime, 0.05); }
    }
    function toggleMusic() { const was = mOn(); if (!was && musicVol === 0) setMusicVol(1); setMusic(!was); }

    // ---- 소리 재료 ----
    function env(g, t, peak, att, dur) {
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    function tone(dst, t, type, f0, f1, dur, peak, att = 0.003) {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      env(g, t, peak, att, dur); o.connect(g); g.connect(dst); o.start(t); o.stop(t + dur + 0.02);
      return t + dur;
    }
    function hiss(dst, t, dur, ftype, f0, f1, q, peak, att = 0.002) {
      const s = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = noise; s.loop = true;
      fl.type = ftype; fl.Q.value = q; fl.frequency.setValueAtTime(f0, t); fl.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
      env(g, t, peak, att, dur); s.connect(fl); fl.connect(g); g.connect(dst);
      lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0;
      s.start(t, (lcg / 4294967296) * 0.9); s.stop(t + dur + 0.02);
      return t + dur;
    }
    // k = 음높이 배율(0.9~1.1). 반환: 끝나는 시각
    const RECIPE = {
      gun:     (d, t, k) => Math.max(hiss(d, t, 0.07, 'highpass', 2400 * k, 1200, 0.7, 0.5), tone(d, t, 'square', 240 * k, 90, 0.045, 0.12), tone(d, t, 'sine', 110 * k, 48, 0.06, 0.22)),
      shell:   (d, t, k) => Math.max(hiss(d, t, 0.22, 'lowpass', 1600 * k, 200, 0.8, 0.7), tone(d, t, 'sine', 130 * k, 45, 0.16, 0.5)),
      missile: (d, t, k) => Math.max(hiss(d, t, 0.32, 'bandpass', 700 * k, 2600 * k, 2.5, 0.45, 0.04), tone(d, t, 'sawtooth', 180 * k, 120, 0.12, 0.05)),
      flame:   (d, t, k) => hiss(d, t, 0.2, 'lowpass', 1800 * k, 600, 1.2, 0.5, 0.02),
      spine:   (d, t, k) => Math.max(tone(d, t, 'triangle', 900 * k, 280, 0.09, 0.28), hiss(d, t, 0.04, 'highpass', 3000, 2000, 1, 0.25)),
      acid:    (d, t, k) => Math.max(tone(d, t, 'sine', 420 * k, 110, 0.18, 0.4), hiss(d, t + 0.02, 0.14, 'bandpass', 900 * k, 300, 3, 0.35)),
      glaive:  (d, t, k) => Math.max(tone(d, t, 'triangle', 600 * k, 1300 * k, 0.12, 0.22), tone(d, t + 0.03, 'triangle', 1300 * k, 500, 0.1, 0.12)),
      beam:    (d, t, k) => Math.max(tone(d, t, 'sawtooth', 1500 * k, 520, 0.16, 0.14), tone(d, t, 'sine', 2300 * k, 1900, 0.18, 0.12)),
      slash:   (d, t, k) => Math.max(hiss(d, t, 0.07, 'bandpass', 2600 * k, 4200, 2, 0.45), tone(d, t + 0.02, 'sine', 140 * k, 60, 0.06, 0.2)),
      bite:    (d, t, k) => Math.max(hiss(d, t, 0.06, 'lowpass', 1000 * k, 400, 1, 0.5), tone(d, t, 'square', 150 * k, 80, 0.04, 0.12), tone(d, t, 'sine', 100 * k, 45, 0.07, 0.25)),
      boomS:   (d, t, k) => Math.max(hiss(d, t, 0.38, 'lowpass', 1400 * k, 220, 0.7, 0.9, 0.004), tone(d, t, 'sine', 120 * k, 40, 0.25, 0.6)),
      boomL:   (d, t, k) => Math.max(hiss(d, t, 1.1, 'lowpass', 900 * k, 120, 0.7, 1, 0.006), tone(d, t, 'sine', 75 * k, 26, 0.75, 0.9), hiss(d, t + 0.08, 0.6, 'bandpass', 500, 160, 1, 0.4)),
      done:    (d, t) => Math.max(tone(d, t, 'square', 660, 660, 0.09, 0.12), tone(d, t + 0.09, 'square', 990, 990, 0.14, 0.12)),
      ready:   (d, t) => Math.max(tone(d, t, 'triangle', 520, 520, 0.07, 0.25), tone(d, t + 0.07, 'triangle', 780, 780, 0.11, 0.25)),
      alert:   (d, t) => Math.max(tone(d, t, 'square', 784, 784, 0.07, 0.16), tone(d, t + 0.09, 'square', 587, 587, 0.07, 0.16), tone(d, t + 0.18, 'square', 784, 784, 0.1, 0.14)), // 공격받음
      // ---- 연출 화면(Task 13) ----
      // 타이틀 로고: 낮은 사인 붐 + 5도 화음 상승 아르페지오 + 바람 소리 꼬리
      sting:   (d, t) => Math.max(tone(d, t, 'sine', 55, 41, 1.6, 0.7, 0.01), hiss(d, t, 1.4, 'bandpass', 300, 2400, 1.2, 0.35, 0.3),
                 [220, 330, 440, 660, 880].reduce((m, f, i) => Math.max(m, tone(d, t + 0.12 + i * 0.09, 'triangle', f, f * 1.003, 0.9 - i * 0.08, 0.16)), 0)),
      whoosh:  (d, t, k) => hiss(d, t, 0.9, 'bandpass', 260 * k, 1800 * k, 1.6, 0.4, 0.35),           // 실루엣이 스칠 때
      deny:    (d, t) => Math.max(tone(d, t, 'square', 220, 220, 0.06, 0.13), tone(d, t + 0.07, 'square', 147, 147, 0.1, 0.13)), // 잠긴 항목
      tick:    (d, t, k) => tone(d, t, 'square', 1400 * k, 1400 * k, 0.025, 0.08),                     // 무작위 공개 회전
      reveal:  (d, t) => Math.max(tone(d, t, 'square', 392, 392, 0.08, 0.14), tone(d, t + 0.08, 'square', 587, 587, 0.16, 0.14), hiss(d, t, 0.2, 'highpass', 3000, 1500, 0.8, 0.2)),
      vs:      (d, t) => Math.max(tone(d, t, 'sine', 90, 34, 0.7, 0.9, 0.004), hiss(d, t, 0.5, 'lowpass', 2400, 200, 0.7, 0.7, 0.003),
                 tone(d, t + 0.05, 'sawtooth', 220, 110, 0.35, 0.08), tone(d, t + 0.05, 'sawtooth', 330, 165, 0.35, 0.06)),
      // 종족 선택: 레기온 = 금속 철컥(사각파 + 짧은 잡음 두 번), 스웜 = 젖은 으르렁(저역 잡음 + 흔들리는 사인), 엘리시안 = 맑은 종소리(삼각파 배음)
      pickLegion:  (d, t) => Math.max(hiss(d, t, 0.05, 'bandpass', 2200, 1800, 3, 0.5), tone(d, t, 'square', 180, 120, 0.08, 0.16),
                     hiss(d, t + 0.11, 0.06, 'bandpass', 3200, 2600, 3, 0.45), tone(d, t + 0.11, 'square', 240, 200, 0.1, 0.14)),
      pickSwarm:   (d, t) => Math.max(hiss(d, t, 0.45, 'lowpass', 700, 180, 4, 0.6, 0.04), tone(d, t, 'sine', 140, 70, 0.4, 0.4, 0.03), tone(d, t + 0.05, 'triangle', 300, 120, 0.3, 0.1, 0.05)),
      pickElysian: (d, t) => [784, 1175, 1568].reduce((m, f, i) => Math.max(m, tone(d, t + i * 0.06, 'triangle', f, f, 0.6 - i * 0.12, 0.16 - i * 0.03, 0.004)), 0),
      // ---- 3b 마법(fx3b.js 가 cast 이벤트마다 'c_<능력 id>' 로 낸다). 레기온 = 금속·기계, 스웜 = 젖은·유기, 엘리시안 = 수정·합창 ----
      c_heal:     (d, t, k) => Math.max(tone(d, t, 'triangle', 700 * k, 900 * k, 0.07, 0.12), hiss(d, t, 0.04, 'bandpass', 2600, 3200, 3, 0.18)),
      c_smoke:    (d, t, k) => Math.max(hiss(d, t, 0.5, 'lowpass', 1800 * k, 300, 0.8, 0.5, 0.01), tone(d, t, 'square', 200 * k, 90, 0.06, 0.1)),
      c_optcloak: (d, t, k) => Math.max(tone(d, t, 'sawtooth', 1200 * k, 300, 0.3, 0.1, 0.02), hiss(d, t, 0.25, 'highpass', 4000, 1500, 0.8, 0.12, 0.03)),
      c_mark:     (d, t, k) => Math.max(tone(d, t, 'square', 1760 * k, 1760 * k, 0.05, 0.1), tone(d, t + 0.07, 'square', 2349 * k, 2349 * k, 0.08, 0.1)),
      c_discharge:(d, t, k) => Math.max(hiss(d, t, 0.3, 'highpass', 3500 * k, 900, 0.9, 0.55, 0.002), tone(d, t, 'sawtooth', 900 * k, 60, 0.28, 0.2), tone(d, t, 'sine', 80, 38, 0.3, 0.4)),
      c_seeker:   (d, t, k) => Math.max(hiss(d, t, 0.05, 'bandpass', 2400, 2000, 3, 0.4), tone(d, t, 'square', 150 * k, 110, 0.07, 0.14), tone(d, t + 0.1, 'sawtooth', 500 * k, 1400 * k, 0.2, 0.07)),
      c_cleanse:  (d, t, k) => Math.max(tone(d, t, 'sine', 900 * k, 1500 * k, 0.18, 0.18), hiss(d, t, 0.12, 'highpass', 4500, 3000, 0.8, 0.15)),
      c_tow:      (d, t, k) => Math.max(tone(d, t, 'sawtooth', 120 * k, 340 * k, 0.35, 0.14, 0.04), tone(d, t, 'square', 125 * k, 345 * k, 0.35, 0.05, 0.04), hiss(d, t, 0.05, 'bandpass', 2600, 2200, 3, 0.35)),
      c_scan:     (d, t, k) => Math.max(tone(d, t, 'sine', 1000 * k, 1000 * k, 0.1, 0.16), tone(d, t + 0.14, 'sine', 1500 * k, 1500 * k, 0.16, 0.16), hiss(d, t, 0.1, 'bandpass', 3000, 3000, 4, 0.15)),
      c_junkdrop: (d, t, k) => Math.max(tone(d, t, 'square', 330 * k, 330 * k, 0.07, 0.14), tone(d, t + 0.1, 'square', 220 * k, 220 * k, 0.12, 0.14), hiss(d, t, 0.06, 'bandpass', 1800, 1500, 3, 0.4)), // 호출 신호
      beep:       (d, t, k) => tone(d, t, 'square', 880 * k, 880 * k, 0.05, 0.12),                      // 고철 낙하 카운트다운
      beepHi:     (d, t, k) => Math.max(tone(d, t, 'square', 1320 * k, 1320 * k, 0.05, 0.14), tone(d, t + 0.07, 'square', 1320 * k, 1320 * k, 0.05, 0.14)),
      junkHit:    (d, t, k) => Math.max(hiss(d, t, 0.9, 'lowpass', 1100 * k, 140, 0.7, 1, 0.004), tone(d, t, 'sine', 80 * k, 28, 0.6, 0.9),
                    hiss(d, t, 0.12, 'bandpass', 2400 * k, 1500, 4, 0.6), tone(d, t + 0.05, 'square', 420 * k, 260, 0.1, 0.12), hiss(d, t + 0.16, 0.1, 'bandpass', 3100 * k, 2000, 4, 0.35)),
      c_spores:   (d, t, k) => Math.max(hiss(d, t, 0.3, 'lowpass', 900 * k, 250, 3, 0.55, 0.02), tone(d, t, 'sine', 260 * k, 90, 0.18, 0.35), tone(d, t + 0.08, 'sine', 340 * k, 120, 0.14, 0.25)),
      c_mat:      (d, t, k) => Math.max(hiss(d, t, 0.4, 'lowpass', 600 * k, 160, 5, 0.6, 0.06), tone(d, t, 'sine', 110 * k, 70, 0.4, 0.35, 0.05)),
      c_rot:      (d, t, k) => Math.max(hiss(d, t, 0.45, 'bandpass', 1400 * k, 400, 2, 0.5, 0.05), tone(d, t, 'triangle', 190 * k, 100, 0.35, 0.18, 0.03), tone(d, t + 0.1, 'sine', 400 * k, 150, 0.12, 0.2)),
      c_sprout:   (d, t, k) => Math.max(tone(d, t, 'sine', 90 * k, 240 * k, 0.25, 0.4, 0.02), hiss(d, t + 0.1, 0.18, 'lowpass', 1000, 300, 4, 0.5), tone(d, t + 0.3, 'triangle', 300 * k, 140, 0.1, 0.2)),
      c_mindstorm:(d, t, k) => [1568, 2093, 1760, 2349, 1397].reduce((m, f, i) => Math.max(m, tone(d, t + i * 0.05, 'triangle', f * k, f * k * 0.98, 0.3, 0.11, 0.002)), hiss(d, t, 0.25, 'highpass', 5000, 3000, 1, 0.2)),
      c_amplify:  (d, t, k) => [523, 659, 784].reduce((m, f, i) => Math.max(m, tone(d, t + i * 0.04, 'triangle', f * k, f * k * 1.01, 0.5, 0.14, 0.03)), tone(d, t, 'sine', 262 * k, 262 * k, 0.5, 0.2, 0.05)),
      c_stasis:   (d, t, k) => Math.max(tone(d, t, 'sine', 2093 * k, 2093 * k, 0.6, 0.14, 0.003), tone(d, t, 'triangle', 3136 * k, 3136 * k, 0.4, 0.08, 0.003), tone(d, t + 0.02, 'sine', 140 * k, 70, 0.35, 0.4), hiss(d, t, 0.12, 'highpass', 5000, 4000, 1, 0.3)),
      stasisOff:  (d, t, k) => Math.max(tone(d, t, 'triangle', 2637 * k, 1175 * k, 0.4, 0.12, 0.002), hiss(d, t, 0.2, 'highpass', 6000, 3000, 0.8, 0.3, 0.002), tone(d, t + 0.06, 'sine', 1568 * k, 784, 0.3, 0.1)),
      c_crystallize:(d, t, k) => Math.max(hiss(d, t, 0.1, 'highpass', 6000, 4000, 1, 0.35, 0.001), tone(d, t, 'triangle', 3136 * k, 2093 * k, 0.15, 0.12), tone(d, t + 0.05, 'triangle', 2349 * k, 1760 * k, 0.2, 0.1)),
      c_probe:    (d, t, k) => Math.max(tone(d, t, 'sine', 700 * k, 2100 * k, 0.25, 0.14, 0.01), tone(d, t + 0.22, 'triangle', 1568 * k, 1568 * k, 0.2, 0.12)),
      c_prism:    (d, t, k) => [1047, 1319, 1568, 2093].reduce((m, f, i) => Math.max(m, tone(d, t + i * 0.035, 'triangle', f * k, f * k, 0.3, 0.1)), 0),
      c_chorus:   (d, t, k) => [262, 330, 392, 523].reduce((m, f, i) => Math.max(m, tone(d, t + i * 0.03, 'triangle', f * k, f * k * 1.004, 0.7, 0.13, 0.08), tone(d, t, 'sine', f * 2 * k, f * 2 * k, 0.6, 0.05, 0.1)), 0),
      c_echo:     (d, t, k) => Math.max(tone(d, t, 'sine', 400 * k, 1400 * k, 0.18, 0.16), tone(d, t + 0.12, 'sine', 600 * k, 1760 * k, 0.16, 0.1), [1047, 1319, 1568].reduce((m, f, i) => Math.max(m, tone(d, t + 0.28 + i * 0.04, 'triangle', f * k, f * k, 0.18, 0.08)), 0)),
      c_repairdrones:(d, t, k) => Math.max(tone(d, t, 'sawtooth', 70 * k, 140 * k, 0.5, 0.12, 0.05), hiss(d, t, 0.4, 'bandpass', 900 * k, 1600, 3, 0.25, 0.08),
                    hiss(d, t + 0.2, 0.06, 'highpass', 4000 * k, 3000, 1, 0.3), hiss(d, t + 0.32, 0.06, 'highpass', 4400 * k, 3000, 1, 0.25), tone(d, t + 0.45, 'triangle', 880 * k, 1320 * k, 0.12, 0.12)),
      research:(d, t) => [523, 659, 784, 1047].reduce((m, f, i) => Math.max(m, tone(d, t + i * 0.075, 'triangle', f, f, 0.12, 0.25)), 0),
      // ---- 유닛·건물 피드백(종족별): sel = 선택, mv = 이동·기타 명령 응답, atk = 공격 명령, place = 건물 배치, con = 건설 시작, train = 생산·연구 시작 ----
      // sel_* 은 k 로 길이도 줄인다(k = 1/길이) — 연타 이스터에그가 k 를 올리면 빨라지고 높아진다.
      sel_legion:   (d, t, k) => Math.max(hiss(d, t, 0.03 / k, 'bandpass', 3200 * k, 2600, 3, 0.35), tone(d, t, 'square', 620 * k, 740 * k, 0.05 / k, 0.08), tone(d, t + 0.06 / k, 'square', 930 * k, 930 * k, 0.05 / k, 0.07)),
      sel_swarm:    (d, t, k) => Math.max(tone(d, t, 'sine', 300 * k, 170 * k, 0.14 / k, 0.3, 0.01), hiss(d, t, 0.12 / k, 'lowpass', 900 * k, 300, 5, 0.35, 0.02)),
      sel_elysian:  (d, t, k) => Math.max(tone(d, t, 'triangle', 1568 * k, 1568 * k, 0.28 / k, 0.12), tone(d, t + 0.05 / k, 'triangle', 2349 * k, 2349 * k, 0.24 / k, 0.08)),
      mv_legion:    (d, t, k) => Math.max(tone(d, t, 'square', 330 * k, 470 * k, 0.06, 0.08), hiss(d, t, 0.03, 'bandpass', 2600 * k, 2200, 3, 0.3)),
      mv_swarm:     (d, t, k) => Math.max(hiss(d, t, 0.12, 'lowpass', 700 * k, 220, 5, 0.4, 0.02), tone(d, t, 'sine', 210 * k, 140, 0.1, 0.25, 0.01)),
      mv_elysian:   (d, t, k) => Math.max(tone(d, t, 'sine', 1047 * k, 1319 * k, 0.1, 0.12), tone(d, t + 0.04, 'triangle', 2093 * k, 2093 * k, 0.14, 0.05)),
      atk_legion:   (d, t, k) => Math.max(tone(d, t, 'sawtooth', 240 * k, 150, 0.1, 0.1), hiss(d, t, 0.04, 'bandpass', 2000 * k, 1600, 3, 0.4), hiss(d, t + 0.07, 0.04, 'bandpass', 2800 * k, 2200, 3, 0.35)),
      atk_swarm:    (d, t, k) => Math.max(hiss(d, t, 0.15, 'bandpass', 1300 * k, 450, 3, 0.45, 0.01), tone(d, t, 'triangle', 190 * k, 85, 0.14, 0.2, 0.01)),
      atk_elysian:  (d, t, k) => Math.max(tone(d, t, 'triangle', 1760 * k, 1175 * k, 0.12, 0.12), tone(d, t, 'sine', 880 * k, 587 * k, 0.12, 0.12), hiss(d, t, 0.05, 'highpass', 5000, 4000, 1, 0.15)),
      place_legion: (d, t, k) => Math.max(tone(d, t, 'square', 130 * k, 70, 0.1, 0.16), hiss(d, t, 0.06, 'bandpass', 1500 * k, 1100, 2, 0.5), hiss(d, t + 0.08, 0.05, 'bandpass', 2600 * k, 2000, 3, 0.35)),
      place_swarm:  (d, t, k) => Math.max(hiss(d, t, 0.22, 'lowpass', 650 * k, 140, 6, 0.6, 0.01), tone(d, t, 'sine', 130 * k, 55, 0.2, 0.4, 0.01)),
      place_elysian:(d, t, k) => [523, 784, 1047].reduce((m, f, i) => Math.max(m, tone(d, t + i * 0.02, 'triangle', f * k, f * k, 0.4, 0.09, 0.01)), 0),
      con_legion:   (d, t, k) => [0, 0.06, 0.12].reduce((m, o, i) => Math.max(m, hiss(d, t + o, 0.035, 'bandpass', (2400 + i * 300) * k, 2000, 4, 0.4)), tone(d, t, 'sawtooth', 90 * k, 110 * k, 0.2, 0.06, 0.02)),
      con_swarm:    (d, t, k) => [300, 380, 260].reduce((m, f, i) => Math.max(m, tone(d, t + i * 0.07, 'sine', f * k, f * k * 0.6, 0.07, 0.25)), hiss(d, t, 0.25, 'lowpass', 500, 200, 4, 0.3, 0.03)),
      con_elysian:  (d, t, k) => [1319, 1568, 1976, 2637].reduce((m, f, i) => Math.max(m, tone(d, t + i * 0.045, 'triangle', f * k, f * k, 0.22, 0.08)), 0),
      train_legion: (d, t, k) => Math.max(tone(d, t, 'square', 440 * k, 660 * k, 0.08, 0.09), tone(d, t + 0.08, 'square', 660 * k, 660 * k, 0.06, 0.08)),
      train_swarm:  (d, t, k) => Math.max(tone(d, t, 'sine', 150 * k, 320 * k, 0.2, 0.3, 0.03), hiss(d, t, 0.18, 'lowpass', 800 * k, 300, 4, 0.3, 0.03)),
      train_elysian:(d, t, k) => Math.max(tone(d, t, 'triangle', 659 * k, 659 * k, 0.35, 0.1, 0.08), tone(d, t, 'triangle', 988 * k, 988 * k, 0.35, 0.07, 0.08)),
      // ---- 유닛 성격: idle = 오래 방치된 내 유닛의 투덜거림(작게), down = 옆 아군이 죽었을 때 놀람(음높이 뚝 + 더듬기) ----
      idle_legion:  (d, t, k) => Math.max(tone(d, t, 'sawtooth', 150 * k, 85 * k, 0.5, 0.04, 0.08), tone(d, t + 0.3, 'square', 990 * k, 990 * k, 0.05, 0.05), tone(d, t + 0.4, 'square', 740 * k, 740 * k, 0.08, 0.045)), // 지루한 서보 한숨 + 삐-삐
      idle_swarm:   (d, t, k) => [0, 0.13, 0.24].reduce((m, o, i) => Math.max(m, hiss(d, t + o, 0.1, 'lowpass', (520 - i * 80) * k, 180, 9, 0.3, 0.02)), tone(d, t, 'sine', 120 * k, 70 * k, 0.55, 0.22, 0.06)), // 낮은 꾸르륵
      idle_elysian: (d, t, k) => [1568, 1319, 1047].reduce((m, f, i) => Math.max(m, tone(d, t + i * 0.13, 'triangle', f * k, f * k * 0.995, 0.4, 0.06 - i * 0.01, 0.02)), 0),   // 부드러운 하강 종소리
      down_legion:  (d, t, k) => [0, 0.05, 0.1].reduce((m, o, i) => Math.max(m, tone(d, t + o, 'square', (760 - i * 90) * k, (740 - i * 90) * k, 0.03, 0.07)), tone(d, t + 0.16, 'sawtooth', 520 * k, 170 * k, 0.3, 0.05, 0.01)), // 삐-삐-삐 더듬고 뚝
      down_swarm:   (d, t, k) => Math.max(tone(d, t, 'sine', 430 * k, 150 * k, 0.38, 0.25, 0.01), hiss(d, t + 0.04, 0.3, 'bandpass', 950 * k, 300, 4, 0.3, 0.02)),                                // 낑 하는 울음
      down_elysian: (d, t, k) => Math.max(tone(d, t, 'triangle', 1319 * k, 1245 * k, 0.22, 0.08), tone(d, t + 0.12, 'triangle', 988 * k, 880 * k, 0.4, 0.07), tone(d, t + 0.12, 'sine', 1047 * k, 932 * k, 0.4, 0.04)), // 어긋난 단조 하강
      // ---- 재미 요소: kill = 연타 처치음(k 가 음계를 오른다), q_* = BGM 박자에 맞춰 화음 음으로(k = 음/440), far = 먼 교전, heart = 심장박동 ----
      kill:    (d, t, k) => Math.max(tone(d, t, 'triangle', 660 * k, 660 * k, 0.09, 0.14), tone(d, t + 0.01, 'sine', 1320 * k, 1320 * k, 0.07, 0.05)),
      q_drop:  (d, t, k) => Math.max(tone(d, t, 'triangle', 440 * k, 440 * k, 0.12, 0.08), tone(d, t, 'sine', 880 * k, 880 * k, 0.06, 0.03)),
      q_ready: (d, t, k) => Math.max(tone(d, t, 'triangle', 440 * k, 440 * k, 0.09, 0.2), tone(d, t + 0.09, 'triangle', 660 * k, 660 * k, 0.14, 0.2)),
      q_done:  (d, t, k) => Math.max(tone(d, t, 'square', 440 * k, 440 * k, 0.09, 0.1), tone(d, t + 0.09, 'square', 880 * k, 880 * k, 0.14, 0.1)),
      far:     (d, t, k) => Math.max(hiss(d, t, 0.35, 'lowpass', 500 * k, 120, 0.7, 0.6, 0.01), tone(d, t, 'sine', 70 * k, 38, 0.3, 0.4, 0.005), hiss(d, t + 0.12, 0.25, 'lowpass', 400 * k, 100, 0.7, 0.35, 0.01)),
      heart:   (d, t) => Math.max(tone(d, t, 'sine', 70, 40, 0.13, 0.8, 0.005), tone(d, t + 0.2, 'sine', 62, 36, 0.16, 0.6, 0.005)),
      // ---- 스팅: 대규모 교전 시작(북 두 번 + 낮은 금관 찌르기), 승리(장조 상승), 패배(단조 하강 + 긴 붐) ----
      battle:  (d, t) => Math.max(tone(d, t, 'sine', 75, 38, 0.5, 0.8, 0.004), hiss(d, t, 0.35, 'lowpass', 900, 150, 0.8, 0.5, 0.004),
                 tone(d, t + 0.26, 'sine', 70, 36, 0.6, 0.85, 0.004), hiss(d, t + 0.26, 0.4, 'lowpass', 800, 140, 0.8, 0.5, 0.004),
                 tone(d, t + 0.26, 'sawtooth', 147, 140, 0.9, 0.09, 0.03), tone(d, t + 0.26, 'sawtooth', 220, 210, 0.9, 0.07, 0.03), tone(d, t + 0.26, 'sawtooth', 294, 280, 0.8, 0.04, 0.03)),
      victory: (d, t) => Math.max([262, 330, 392, 523, 659, 784].reduce((m, f, i) => Math.max(m, tone(d, t + i * 0.11, 'triangle', f, f, 1.2 - i * 0.08, 0.16)), 0),
                 [131, 196, 262, 330].reduce((m, f) => Math.max(m, tone(d, t + 0.6, 'sawtooth', f, f, 2.6, 0.035, 0.5)), 0), tone(d, t, 'sine', 65, 40, 1.2, 0.6, 0.01)),
      defeat:  (d, t) => Math.max([440, 349, 294, 220].reduce((m, f, i) => Math.max(m, tone(d, t + i * 0.32, 'triangle', f, f * 0.99, 0.9, 0.14, 0.02)), 0),
                 tone(d, t + 1.0, 'sawtooth', 110, 55, 2.4, 0.06, 0.3), tone(d, t, 'sine', 55, 30, 2.2, 0.7, 0.01), hiss(d, t, 1.6, 'lowpass', 600, 80, 0.7, 0.4, 0.01)),
    };

    // 일그러짐(연타 이스터에그): 단계별 tanh 곡선, 만든 것은 다시 쓴다
    const curves = new Map();
    function curve(drive) {
      const key = Math.round(drive * 10); if (curves.has(key)) return curves.get(key);
      const n = 256, c = new Float32Array(n), a = 1 + key * 2;
      for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(a * x) / Math.tanh(a); }
      curves.set(key, c); return c;
    }

    // o(선택): { k: 음높이 배율 고정, at: 시작 시각(AudioContext 시간, 미래면 예약), drive: 0..1 일그러짐, lp: 저역통과 Hz }
    function play(name, vol = 1, pan = 0, seed = 0, o) {
      if (!ac || muted || ac.state !== 'running' || !RECIPE[name] || vol <= 0) return false;
      const now = ac.currentTime;
      while (ends.length && ends[0] <= now) ends.shift();                // 끝난 소리 정리(시각 오름차순)
      if (ends.length >= (PRI[name] ? MAX_PRI : MAX)) return false;
      const r = recent.get(name);
      if (r && now - r.t < SAME_MS) { if (r.n >= SAME) return false; r.n++; } else recent.set(name, { t: now, n: 1 });
      const g = ac.createGain(); g.gain.value = vol;
      let dst = g;
      if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(sfxBus); } else g.connect(sfxBus);
      if (o && o.lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = 0.7; f.connect(dst); dst = f; }
      if (o && o.drive > 0) { const w = ac.createWaveShaper(); w.curve = curve(o.drive); w.connect(dst); dst = w; }
      const k = o && o.k ? o.k : 0.9 + ((((seed >>> 0) * 2654435761) >>> 0) % 1000) / 5000;  // 0.9 ~ 1.1
      const end = RECIPE[name](dst, o && o.at > now ? o.at : now + 0.005, k, o && o.prof);
      let i = ends.length; while (i > 0 && ends[i - 1] > end) i--; ends.splice(i, 0, end);
      return true;
    }

    // ---- 유닛 목소리: 유닛 데이터에서 음색 프로필을 뽑는다(유닛마다 손으로 쓴 표 없음) ----
    // 체급 w(0 가벼움·1 중간·2 무거움) = 반지름·비용, 음높이 = 반지름(연속), 몸통(저역 쿵) = 체급, 계열 arch = 일꾼·보병(생체)·기계·공중·술사.
    // 종족 재료는 그대로(레기온 금속·스웜 젖은·엘리시안 수정) — 종족 응답음 위에 체급 몸통 + 계열 음색 층을 얹는다.
    // VOICE_OV: 공식이 어색한 몇몇 상징 유닛만 덮어쓴다.
    const VOICE_OV = {
      dreadnought: { w: 2, pitch: 0.55, body: 1.3 },      // 레비아탄: 주력함 — 더 낮고 무겁게
      ark:         { w: 2, pitch: 0.6, body: 1.2 },       // 앤섬: 엘리시안 모함
      ascendant:   { arch: 'caster', w: 2 },              // 하모닉: 합체 에너지체(기계 아님)
      voidascendant: { w: 2 },
      behemoth:    { pitch: 0.7, body: 1.2 },             // 베히모스: 스웜 최대 지상 유닛
    };
    const worth = d => (d.cost ? (d.cost.crystal || 0) + (d.cost.nebula || 0) : 0) || (d.radius || 0) * 20;   // 소환·합체(비용 0)는 반지름으로
    // 여러 개 선택: 가장 중요한(비싼, 같으면 큰) 유닛 하나
    function lead(defs) {
      let b = null;
      for (const d of defs) if (d && (!b || worth(d) > worth(b) || (worth(d) === worth(b) && (d.radius || 0) > (b.radius || 0)))) b = d;
      return b;
    }
    // x = 종족 문자열(예전 호출 — 종족 소리 그대로) | 유닛 def | def 배열
    function profile(x) {
      if (Array.isArray(x)) x = lead(x);
      if (!x || typeof x !== 'object') return { race: rc(x), w: 1, arch: null, pitch: 1, body: 0 };
      const race = rc(x.race);
      if (!x.radius) return { race, w: 1, arch: null, pitch: 1, body: 0 };   // 건물(집결 명령 등) = 종족 소리
      const r = x.radius, c = worth(x);
      const w = r >= 15 || c >= 300 ? 2 : r <= 9 && c < 150 ? 0 : 1;
      const arch = x.worker ? 'worker' : x.energy && !x.weapon ? 'caster' : x.air ? 'air'
        : /vehicle/.test(x.armorUpgrade || '') || (x.size === 'large' && race !== 'swarm') ? 'mech' : 'bio';
      const p = { race, w, arch, pitch: Math.max(0.55, Math.min(1.35, 1.6 - r * 0.04)), body: [0, 0.4, 1][w] };
      return Object.assign(p, VOICE_OV[x.id]);
    }
    // 계열 음색 층(짧고 작게): k = 음높이(연타 배율 포함), L = 길이 배율
    const ARCH = {
      worker: (d, t, k) => Math.max(tone(d, t, 'square', 1700 * k, 1700 * k, 0.018, 0.05), tone(d, t + 0.045, 'square', 2100 * k, 2100 * k, 0.018, 0.045)),   // 연장 딸깍딸깍
      bio:    (d, t, k, L) => hiss(d, t, 0.09 * L, 'bandpass', 600 * k, 1100 * k, 7, 0.32, 0.01),                                                          // 모음 같은 '와'(좁은 대역 잡음)
      mech:   (d, t, k, L) => Math.max(tone(d, t, 'sawtooth', 95 * k, 150 * k, 0.14 * L, 0.06, 0.02), hiss(d, t + 0.1 * L, 0.03, 'bandpass', 2400 * k, 2000, 4, 0.3)), // 서보 윙 + 철컥
      air:    (d, t, k, L) => Math.max(hiss(d, t, 0.2 * L, 'bandpass', 380 * k, 1300 * k, 2, 0.28, 0.05), tone(d, t, 'sine', 220 * k, 230 * k, 0.2 * L, 0.06, 0.04)),  // 바람 + 엔진 웅
      caster: (d, t, k, L) => Math.max(tone(d, t, 'triangle', 2093 * k, 2093 * k, 0.25 * L, 0.05, 0.02), tone(d, t, 'triangle', 2217 * k, 2217 * k, 0.25 * L, 0.04, 0.02)), // 맥놀이 반짝임
    };
    // 이동 응답에만 얹는 움직임 소리(루프 없음): 기계 = 엔진 웅웅, 공중 = 날갯짓 펄럭, 스웜 지상 = 다리 사각사각
    function motion(d, t, k, p) {
      if (p.arch === 'mech') return hiss(d, t + 0.04, 0.32, 'lowpass', 260 * k, 120, 2, 0.35, 0.06);
      if (p.arch === 'air') return [0, 0.07, 0.14].reduce((m, o) => Math.max(m, hiss(d, t + o, 0.05, 'bandpass', 700 * k, 400 * k, 1.5, 0.22, 0.01)), 0);
      if (p.race === 'swarm') return [0, 0.04, 0.09, 0.13].reduce((m, o, i) => Math.max(m, hiss(d, t + o, 0.015, 'highpass', (3000 + i * 400) * k, 2500, 1, 0.18)), 0);
      return t;
    }
    // 고참 자신감 층(선택·이동·공격 응답에만): 1단계 = 위로 튀는 장식음 + 옥타브 반짝임, 2단계 = 여기에 근음·5도·옥타브 화음 + 긴 꼬리.
    // 처치 수 문턱은 VET. 종족 재료 그대로(레기온 사각파·스웜 사인·엘리시안 삼각파). 반환: 끝나는 시각.
    const VET = [3, 8], VET_TONE = { legion: ['square', 660], swarm: ['sine', 330], elysian: ['triangle', 1319] };
    const vetTier = n => n >= VET[1] ? 2 : n >= VET[0] ? 1 : 0;
    function vetLayer(d, t, kk, race, tier) {
      const [ty, f0] = VET_TONE[race], f = f0 * kk, at = t + 0.07;
      let end = Math.max(tone(d, at, ty, f, f * 2, 0.08, 0.06), tone(d, at + 0.07, 'sine', f * 2, f * 2.01, 0.16, 0.035));
      if (tier >= 2) end = [1, 1.5, 2].reduce((m, x, i) => Math.max(m, tone(d, at + 0.1 + i * 0.03, ty, f * x, f * x, 0.45, 0.04 - i * 0.008, 0.02)), end);
      return end;
    }
    // 목소리 하나 = 종족 응답음(체급 음높이) + 체급 몸통 + 계열 층 (+ 이동이면 움직임 소리, 고참이면 자신감 층)
    // kind: sel·mv·atk·ready(= sel 재료) · idle·down(유닛 성격)
    function voice(kind, d, t, k, p) {
      const kk = k * p.pitch, L = 0.8 + p.w * 0.25;
      let end = RECIPE[(kind === 'ready' ? 'sel' : kind) + '_' + p.race](d, t, kk);
      if (p.body > 0) end = Math.max(end, tone(d, t, 'sine', 95 * kk, 42, 0.16 * L, (kind === 'idle' ? 0.15 : 0.3) * p.body, 0.006));
      if (p.arch) end = Math.max(end, ARCH[p.arch](d, t + (kind === 'ready' ? 0.06 : kind === 'idle' ? 0.25 : 0.01), kk, L));
      if (kind === 'mv' && p.arch) end = Math.max(end, motion(d, t, k, p));
      if (p.vet && (kind === 'sel' || kind === 'mv' || kind === 'atk')) end = Math.max(end, vetLayer(d, t, kk, p.race, p.vet));
      return end;
    }
    for (const kind of ['sel', 'mv', 'atk', 'ready', 'idle', 'down']) RECIPE['v_' + kind] = (d, t, k, p) => voice(kind, d, t, k, p || profile(''));
    // vet = 처치 수 → 단계가 있으면 프로필 사본에 붙인다
    const withVet = (who, vet) => { const p = profile(who), v = vetTier(vet || 0); return v ? Object.assign({}, p, { vet: v }) : p; };

    // ---- 명령 응답·선택 ----
    const rc = r => r === 'swarm' || r === 'elysian' ? r : 'legion';
    const CMD = { attack: 'atk', attackMove: 'atk', train: 'train', research: 'train', morph: 'con', merge: 'con', cast: null, autocast: null };
    // c = ui 가 sim 에 넣는 명령, who = 종족 문자열(예전) | 유닛 def | 명령받은 유닛 def 배열(가장 비싼 유닛 목소리 하나).
    // 건설은 자리 지정(tx 있음)만 배치음 — 부속은 건물이 생길 때 render 가 건설 시작음을 낸다. 배치·생산·변태는 종족 소리.
    // vet(선택) = 명령받은 유닛의 처치 수(가장 많은 것) — 이동·공격 응답에 고참 층
    function cmd(c, who, vet = 0) {
      const p = c.type === 'build' ? (c.tx !== undefined ? 'place' : null) : c.type in CMD ? CMD[c.type] : 'mv';
      if (!p) return false;
      const pr = withVet(who, vet), seed = c.ids ? c.ids[0] : 0;
      return p === 'mv' || p === 'atk' ? play('v_' + p, 0.7, 0, seed, { prof: pr }) : play(p + '_' + pr.race, 0.7, 0, seed);
    }
    // 유닛 수다 이스터에그: 같은 내 유닛을 0.8초 안에 다시 누르면 단계가 오른다 → 빨라지고·높아지고·일그러진다. 쉬면 처음으로.
    const SPAM_GAP = 0.8;
    let selId = 0, selT = -9, spam = 0;
    function select(who, id, vet = 0) {
      if (!ac || ac.state !== 'running') return false;
      const now = ac.currentTime;
      spam = id && id === selId && now - selT < SPAM_GAP ? Math.min(spam + 1, 10) : 0;
      selId = id || 0; selT = now;
      return play('v_sel', 0.6, 0, 0, { prof: withVet(who, vet), k: 1 + spam * 0.13, drive: spam >= 3 ? Math.min(1, (spam - 2) / 6) : 0 });
    }
    // 생산 완료: 박자 맞춤 완료음 + 그 유닛 목소리(완료음 바로 뒤)
    function ready(def, seed = 0) {
      if (!ac || ac.state !== 'running') return false;
      const ok = beat('ready', 0.7, 0, seed);
      const at = (mus && mOn() ? quantize(ac.currentTime + 0.02) : ac.currentTime) + 0.17;
      return play('v_ready', 0.55, 0, seed, { prof: profile(def), at }) || ok;
    }
    // 죽음 폭발: 같은 체급으로 음높이·크기 조절(가벼움 = 높고 작게, 무거움 = 낮고 크게)
    function death(name, def, vol = 1, pan = 0, seed = 0) {
      const p = profile(def), j = 0.95 + ((((seed >>> 0) * 2654435761) >>> 0) % 1000) / 10000;
      return play(name, vol * [0.8, 1, 1.15][p.w], pan, seed, { k: j * [1.15, 1, 0.8][p.w] });
    }

    // ---- 유닛 성격(render 가 조건을 고른다: 방치된 내 유닛·화면 안 / 죽은 내 유닛 옆 생존자). 여기선 전역 쿨다운만 ----
    // 투덜거림: 전체에서 IDLE_COOL 초에 한 번, 교전 강도가 IDLE_MAX_INT 를 넘으면 안 냄.
    // 아군 사망 반응: ALLY_COOL 초에 한 번(몰살돼도 한 번), 0.3~0.6초 뒤에(seed 로 흔들림).
    const IDLE_COOL = 20, IDLE_MAX_INT = 0.1, ALLY_COOL = 3;
    let idleT = -99, downT = -99;
    function idle(def, id = 0) {
      if (!ac || ac.state !== 'running') return false;
      const now = ac.currentTime;
      if (now - idleT < IDLE_COOL || intensity > IDLE_MAX_INT) return false;
      const ok = play('v_idle', 0.4, 0, id, { prof: profile(def) });
      if (ok) idleT = now;
      return ok;
    }
    function allyDown(def, id = 0, vol = 0.6, pan = 0) {
      if (!ac || ac.state !== 'running') return false;
      const now = ac.currentTime;
      if (now - downT < ALLY_COOL) return false;
      const at = now + 0.3 + ((((id >>> 0) * 2654435761) >>> 0) % 1000) / 1000 * 0.3;
      const ok = play('v_down', vol, pan, id, { prof: profile(def), at });
      if (ok) downT = now;
      return ok;
    }

    // ---- 교전 감지: render 가 틱마다 '내 것이 낀 공격 이벤트 수'를 넘긴다 → 3초 창 합계 = 강도(음악용), 문턱을 넘으면 교전 스팅(쿨다운) ----
    const WIN = 60, BATTLE_N = 30, BATTLE_COOL = 900;                  // 틱 단위: 3초 창, 45초 쿨다운
    const hits = new Uint16Array(WIN);
    let hitSum = 0, ctick = 0, lastBattle = -BATTLE_COOL, intensity = 0;
    function combat(n) {
      ctick++;
      const i = ctick % WIN; hitSum += n - hits[i]; hits[i] = n;
      intensity = Math.min(1, hitSum / 40);
      if (hitSum >= BATTLE_N && ctick - lastBattle >= BATTLE_COOL) { lastBattle = ctick; play('battle', 0.75); return true; }
      return false;
    }
    // 판 끝: r = 'win' | 'lose' | 'draw' | 'out'
    function endMatch(r) { play(r === 'win' ? 'victory' : 'defeat', 0.9); stopMatch(); }

    // ---- 연타 콤보: 내 처치가 2초 안에 이어지면 처치음이 오음 음계를 한 칸씩 오른다, 쉬면 처음 음으로 ----
    const KILL_GAP = 2, SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    let combo = 0, killT = -9;
    function kill(vol = 1, pan = 0) {
      if (!ac || ac.state !== 'running') return false;
      const now = ac.currentTime;
      combo = now - killT < KILL_GAP ? Math.min(combo + 1, SCALE.length - 1) : 0; killT = now;
      return play('kill', vol, pan, 0, { k: Math.pow(2, SCALE[combo] / 12) });
    }
    // ---- 박자 맞춤 피드백: 음악이 돌면 다음 8분음표에 지금 화음의 음으로, 아니면 원래 소리를 바로 ----
    const BEAT_FB = { drop: 'q_drop', ready: 'ready', done: 'done' };
    function beat(name, vol = 1, pan = 0, seed = 0) {
      if (!ac || ac.state !== 'running') return false;
      if (!mus || !mOn()) return play(BEAT_FB[name] || name, vol, pan, seed);
      const at = quantize(ac.currentTime + 0.02), ch = chordOf(Math.round((at - mus.t0) / E8));
      const f = mtof(SONG[mus.race].bass + 24 + ch[(seed >>> 0) % ch.length]);
      return play('q_' + name, vol, pan, seed, { at, k: f / 440 });
    }
    // ---- 정보가 되는 소리: 화면 밖(안개 밖) 교전은 저역통과한 먼 소리, 위험하면 심장박동(1초 간격, 8번 뒤 15초 쉼) ----
    function far(vol, pan, seed) { return play('far', vol, pan, seed, { lp: 700 }); }
    let beatT = -9, beats = 0, restUntil = -9;
    function danger() {
      if (!ac || ac.state !== 'running') return false;
      const now = ac.currentTime;
      if (now < restUntil || now - beatT < 1) return false;
      beats = now - beatT > 3 ? 1 : beats + 1; beatT = now;
      if (beats >= 8) { restUntil = now + 15; beats = 0; }
      return play('heart', 0.9);
    }

    function setMuted(m) {
      muted = !!m;
      try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) { /* 저장 못 해도 이번 세션은 적용 */ }
      if (out) out.gain.setTargetAtTime(muted ? 0 : VOL, ac.currentTime, 0.02);
      if (mus && !muted) mus.padNow = true;
    }
    return { unlock, play, setMuted, startMatch, stopMatch, kill, beat, far, danger, get combo() { return combo; }, quantize, setMusic, setMusicVol, setSfxVol, get sfxVol() { return sfxVol; }, toggleMusic, get musicVol() { return musicVol; }, get musicOn() { return mOn(); }, get eighth() { return E8; }, get playing() { return !!mus; }, endMatch, combat, get intensity() { return intensity; }, cmd, select, ready, death, profile, lead, idle, allyDown, vetTier, VET, get spam() { return spam; }, toggle: () => setMuted(!muted), get muted() { return muted; }, get voices() { return ends.length; } };
  }
  return { create };
})();
if (typeof module !== 'undefined') module.exports = NW_AUDIO;
