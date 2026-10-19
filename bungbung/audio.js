// 붕붕이 — 주차 센서 경고음과 접촉음 (WebAudio). 첫 사용자 입력에서 resume.
const PP_AUDIO = (function ppAudio() {
  const BEEP = 0.06;

  function create() {
    return { ctx: null, gain: null, vol: 0.6, d: Infinity, next: 0, cont: false };
  }

  function resume(a) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!a.ctx) {
      a.ctx = new AC();
      const osc = a.ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.value = 1000;
      a.gain = a.ctx.createGain(); a.gain.gain.value = 0;
      osc.connect(a.gain).connect(a.ctx.destination);
      osc.start();
    }
    if (a.ctx.state === 'suspended') a.ctx.resume();
  }

  const interval = d => (d > 1.2 ? 0 : d > 0.8 ? 0.6 : d > 0.5 ? 0.3 : d >= 0.3 ? 0.15 : -1); // -1 = 연속음

  // 매 프레임 호출: 가장 가까운 장애물 거리 m에 맞춰 삑 간격을 정한다.
  function setDistance(a, m) {
    a.d = m;
    if (!a.ctx || a.ctx.state !== 'running') return;
    const t = a.ctx.currentTime, g = a.gain.gain, iv = interval(m), level = 0.25 * a.vol;
    if (iv < 0) {
      if (!a.cont) { g.cancelScheduledValues(t); g.setTargetAtTime(level, t, 0.01); a.cont = true; }
      return;
    }
    if (a.cont) { g.cancelScheduledValues(t); g.setTargetAtTime(0, t, 0.01); a.cont = false; a.next = t + 0.1; }
    if (iv === 0 || t < a.next) return;
    g.setValueAtTime(level, t);
    g.setValueAtTime(0, t + BEEP);
    a.next = t + iv;
  }

  function contact(a) {
    if (!a.ctx || a.ctx.state !== 'running') return;
    const t = a.ctx.currentTime, osc = a.ctx.createOscillator(), g = a.ctx.createGain();
    osc.type = 'square'; osc.frequency.setValueAtTime(140, t); osc.frequency.exponentialRampToValueAtTime(70, t + 0.18);
    g.gain.setValueAtTime(0.3 * a.vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(g).connect(a.ctx.destination);
    osc.start(t); osc.stop(t + 0.22);
  }

  function setVolume(a, v) {
    a.vol = Math.max(0, Math.min(1, v));
    if (a.cont && a.ctx) a.gain.gain.setTargetAtTime(0.25 * a.vol, a.ctx.currentTime, 0.01);
  }

  return { create, resume, setDistance, contact, setVolume };
})();
if (typeof module !== 'undefined') module.exports = PP_AUDIO;
