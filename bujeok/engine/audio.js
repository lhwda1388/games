// 부적난무 — 소리. WebAudio 합성만 쓴다(파일 없음, 스펙 3·6절). 첫 입력 뒤 unlock()부터 소리가 난다.
const BJ_AUDIO = (function bjAudio() {
  const STEPS = [0, 2, 4, 7, 9]; // 궁상각치우(반음)
  const MASTER = 0.8;
  const pitch = (root, deg, oct) => root * 2 ** ((STEPS[deg] + 12 * oct) / 12);

  // 무음 WAV(8비트 모노 8kHz, 0.1초)를 런타임에 만든다 — 파일 없음. iOS 구버전에서 미디어 채널을 열기 위한 용도
  function silentWav() {
    const n = 800, b = new Uint8Array(44 + n), v = new DataView(b.buffer);
    const tag = (o, t) => { for (let i = 0; i < 4; i++) b[o + i] = t.charCodeAt(i); };
    tag(0, 'RIFF'); v.setUint32(4, 36 + n, true); tag(8, 'WAVE'); tag(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    tag(36, 'data'); v.setUint32(40, n, true); b.fill(128, 44); // 8비트 PCM 무음 = 128
    return b;
  }

  function create(sfx, music) {
    let ctx = null, master = null, muted = false, cur = null, timer = null;
    const lastAt = {}, perSec = {}; // perSec[name] = { sec, n }
    let clipDone = false;
    function unlock() {
      // iOS 사파리: 기본 오디오 세션은 ambient라 무음 스위치에 막힌다 → playback으로 올린다
      try { if (typeof navigator !== 'undefined' && navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* 무시 */ }
      if (!clipDone && typeof document !== 'undefined' && typeof Audio !== 'undefined') { // 구버전 iOS 대비: 무음 클립을 한 번 재생
        clipDone = true;
        try {
          const bytes = silentWav();
          let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
          const el = new Audio('data:audio/wav;base64,' + btoa(bin));
          el.setAttribute('playsinline', ''); el.loop = false;
          const pr = el.play(); if (pr && pr.catch) pr.catch(() => {});
        } catch (e) { /* 무시 */ }
      }
      if (!ctx) {
        const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
        if (!AC) return;
        ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : MASTER; master.connect(ctx.destination);
      }
      if (ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {}); // suspended·interrupted(사파리 전화·시리 뒤)
      if (cur && !timer) startTrack(cur);
    }
    function noiseBuf() {
      const b = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return b;
    }
    let nb = null;
    function voice(wave, f0, f1, dur, vol, at) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.001, at + dur);
      g.connect(master);
      let src;
      if (wave === 'noise') { src = ctx.createBufferSource(); src.buffer = nb || (nb = noiseBuf()); }
      else { src = ctx.createOscillator(); src.type = wave; src.frequency.setValueAtTime(f0, at); src.frequency.exponentialRampToValueAtTime(Math.max(1, f1), at + dur); }
      src.connect(g); src.start(at); src.stop(at + dur + 0.02);
    }
    function play(name) {
      const s = sfx[name];
      if (!ctx || muted || !s) return;
      const now = ctx.currentTime, sec = Math.floor(now);
      if (lastAt[name] != null && now - lastAt[name] < 0.016) return;
      const c = perSec[name] && perSec[name].sec === sec ? perSec[name] : (perSec[name] = { sec, n: 0 });
      if (++c.n > (s.max || 20)) return;
      lastAt[name] = now;
      voice(s.wave, s.f0, s.f1, s.dur, s.vol, now);
    }
    // 반 박 단위로 앞을 내다보며 예약한다(setInterval 100ms)
    function startTrack(id) {
      stopTrack();
      const m = music[id];
      if (!ctx || !m) return;
      const beat = 60 / m.bpm;
      let bar = 0, t = ctx.currentTime + 0.1;
      timer = setInterval(() => {
        if (t < ctx.currentTime) t = ctx.currentTime + 0.05; // 멈춤(GC·느린 기기) 뒤 지난 마디를 한꺼번에 울리지 않는다
        while (t < ctx.currentTime + 0.4) {
          const b = m.bars[bar % m.bars.length];
          let at = t;
          for (const [deg, oct, beats] of b.lead) { if (deg != null && !muted) voice('triangle', pitch(m.root, deg, oct), pitch(m.root, deg, oct), beats * beat * 0.9, 0.18, at); at += beats * beat; }
          [...b.drum].forEach((ch, i) => { if (ch === '.' || muted) return; const tt = t + i * beat / 2; if (ch === 'D') voice('sine', 90, 50, 0.18, 0.35, tt); else voice('noise', 0, 0, 0.05, 0.12, tt); });
          t += 4 * beat; bar++;
        }
      }, 100);
    }
    function stopTrack() { if (timer) clearInterval(timer); timer = null; }
    function track(id) { if (id === cur && timer) return; cur = id; if (id == null) stopTrack(); else startTrack(id); }
    function setMuted(b) { muted = !!b; if (master) master.gain.value = muted ? 0 : MASTER; }
    return { unlock, play, track, setMuted, get muted() { return muted; } };
  }
  return { create, pitch, silentWav };
})();
if (typeof module !== 'undefined') module.exports = BJ_AUDIO;
