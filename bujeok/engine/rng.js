// 부적난무 — 시드 RNG(mulberry32). 상태는 { s } 하나라 JSON으로 저장·복원하면 같은 수열이 이어진다.
const BJ_RNG = (function bjRng() {
  const create = seed => ({ s: seed >>> 0 });
  function next(r) {
    let t = (r.s = (r.s + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const int = (r, n) => Math.floor(next(r) * n);
  const range = (r, a, b) => a + next(r) * (b - a);
  const pick = (r, arr) => arr[int(r, arr.length)];
  // 서로 다른 k개(배열보다 크면 전부, 0 이하면 빈 배열)
  function sample(r, arr, k) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = int(r, i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, Math.max(0, k));
  }
  return { create, next, int, range, pick, sample };
})();
if (typeof module !== 'undefined') module.exports = BJ_RNG;
