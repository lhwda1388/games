// 네뷸라 워 — 효과음. WebAudio 합성만 쓴다(오디오 파일 없음).
// A.play(name, vol 0..1, pan -1..1, seed) — seed 로 음높이를 조금씩 흔들어 같은 소리도 매번 다르게(결정론 해시).
// 동시 발음 제한: 같은 소리는 40ms 안에 2개까지, 전체는 8개(폭발·완료음은 10개까지 끼어든다).
// 브라우저 자동재생 정책: 첫 사용자 입력에서 A.unlock() 이 AudioContext 를 만들고 resume 한다. 그 전 play 는 무시.
const NW_AUDIO = (() => {
  const VOL = 0.2, KEY = 'nw-muted', MAX = 8, MAX_PRI = 10, SAME = 2, SAME_MS = 0.04;
  const PRI = { boomL: 1, done: 1, research: 1, ready: 1, alert: 1, sting: 1, vs: 1, reveal: 1, pickLegion: 1, pickSwarm: 1, pickElysian: 1, whoosh: 1, tick: 1, junkHit: 1 };

  function create() {
    let ac = null, out = null, noise = null, muted = false, lcg = 12345;
    const ends = [], recent = new Map();
    try { muted = localStorage.getItem(KEY) === '1'; } catch (e) { muted = false; }

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
      return ac;
    }
    // 반환: 재생 가능해지면 풀리는 Promise(연출 화면이 '건너뛰기 → 바로 소리'에 쓴다)
    function unlock() { const a = ensure(); if (a && a.state === 'suspended') return a.resume().catch(() => {}); return Promise.resolve(); }

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
      gun:     (d, t, k) => Math.max(hiss(d, t, 0.07, 'highpass', 2400 * k, 1200, 0.7, 0.5), tone(d, t, 'square', 240 * k, 90, 0.045, 0.12)),
      shell:   (d, t, k) => Math.max(hiss(d, t, 0.22, 'lowpass', 1600 * k, 200, 0.8, 0.7), tone(d, t, 'sine', 130 * k, 45, 0.16, 0.5)),
      missile: (d, t, k) => Math.max(hiss(d, t, 0.32, 'bandpass', 700 * k, 2600 * k, 2.5, 0.45, 0.04), tone(d, t, 'sawtooth', 180 * k, 120, 0.12, 0.05)),
      flame:   (d, t, k) => hiss(d, t, 0.2, 'lowpass', 1800 * k, 600, 1.2, 0.5, 0.02),
      spine:   (d, t, k) => Math.max(tone(d, t, 'triangle', 900 * k, 280, 0.09, 0.28), hiss(d, t, 0.04, 'highpass', 3000, 2000, 1, 0.25)),
      acid:    (d, t, k) => Math.max(tone(d, t, 'sine', 420 * k, 110, 0.18, 0.4), hiss(d, t + 0.02, 0.14, 'bandpass', 900 * k, 300, 3, 0.35)),
      glaive:  (d, t, k) => Math.max(tone(d, t, 'triangle', 600 * k, 1300 * k, 0.12, 0.22), tone(d, t + 0.03, 'triangle', 1300 * k, 500, 0.1, 0.12)),
      beam:    (d, t, k) => Math.max(tone(d, t, 'sawtooth', 1500 * k, 520, 0.16, 0.14), tone(d, t, 'sine', 2300 * k, 1900, 0.18, 0.12)),
      slash:   (d, t, k) => hiss(d, t, 0.07, 'bandpass', 2600 * k, 4200, 2, 0.45),
      bite:    (d, t, k) => Math.max(hiss(d, t, 0.06, 'lowpass', 1000 * k, 400, 1, 0.5), tone(d, t, 'square', 150 * k, 80, 0.04, 0.12)),
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
    };

    function play(name, vol = 1, pan = 0, seed = 0) {
      if (!ac || muted || ac.state !== 'running' || !RECIPE[name] || vol <= 0) return false;
      const now = ac.currentTime;
      while (ends.length && ends[0] <= now) ends.shift();                // 끝난 소리 정리(시각 오름차순)
      if (ends.length >= (PRI[name] ? MAX_PRI : MAX)) return false;
      const r = recent.get(name);
      if (r && now - r.t < SAME_MS) { if (r.n >= SAME) return false; r.n++; } else recent.set(name, { t: now, n: 1 });
      const g = ac.createGain(); g.gain.value = vol;
      let dst = g;
      if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p); p.connect(out); } else g.connect(out);
      const k = 0.9 + ((((seed >>> 0) * 2654435761) >>> 0) % 1000) / 5000;  // 0.9 ~ 1.1
      const end = RECIPE[name](dst, now + 0.005, k);
      let i = ends.length; while (i > 0 && ends[i - 1] > end) i--; ends.splice(i, 0, end);
      return true;
    }

    function setMuted(m) {
      muted = !!m;
      try { localStorage.setItem(KEY, muted ? '1' : '0'); } catch (e) { /* 저장 못 해도 이번 세션은 적용 */ }
      if (out) out.gain.setTargetAtTime(muted ? 0 : VOL, ac.currentTime, 0.02);
    }
    return { unlock, play, setMuted, toggle: () => setMuted(!muted), get muted() { return muted; }, get voices() { return ends.length; } };
  }
  return { create };
})();
if (typeof module !== 'undefined') module.exports = NW_AUDIO;
