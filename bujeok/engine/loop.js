// 부적난무 — 60Hz 고정 틱. 프레임 시간을 누적해 DT 단위로 step을 부른다.
const BJ_LOOP = (function bjLoop() {
  const DT = 1 / 60, MAX_STEPS = 5;
  // 한 프레임에 최대 5틱. 그보다 밀리면 남은 시간을 버린다(느린 기기에서 따라잡기 폭주 방지, 스펙 9절).
  function advance(acc, elapsed, step) {
    acc += elapsed;
    let n = 0;
    while (acc >= DT - 1e-9 && n < MAX_STEPS) { step(DT); acc -= DT; n++; }
    if (n === MAX_STEPS) return 0;
    return Math.max(0, acc);
  }
  return { DT, MAX_STEPS, advance };
})();
if (typeof module !== 'undefined') module.exports = BJ_LOOP;
