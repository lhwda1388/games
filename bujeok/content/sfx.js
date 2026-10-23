// 부적난무 — 효과음 8종. 짧은 8비트 합성음(스펙 3·6절). f0 → f1 지수 스윕, dur 초, max 초당 최대 재생 수(기본 20).
const BJ_SFX = {
  hit: { wave: 'square', f0: 660, f1: 330, dur: 0.06, vol: 0.12, max: 20 },
  kill: { wave: 'noise', f0: 0, f1: 0, dur: 0.12, vol: 0.18, max: 12 },
  gem: { wave: 'triangle', f0: 880, f1: 1320, dur: 0.07, vol: 0.12, max: 15 },
  levelup: { wave: 'square', f0: 523, f1: 1046, dur: 0.35, vol: 0.2 },
  fusion: { wave: 'sawtooth', f0: 220, f1: 880, dur: 0.6, vol: 0.22 },
  hurt: { wave: 'sawtooth', f0: 200, f1: 80, dur: 0.18, vol: 0.25 },
  boss: { wave: 'square', f0: 110, f1: 70, dur: 0.9, vol: 0.25 },
  ui: { wave: 'triangle', f0: 600, f1: 600, dur: 0.04, vol: 0.1 },
};
if (typeof module !== 'undefined') module.exports = BJ_SFX;
