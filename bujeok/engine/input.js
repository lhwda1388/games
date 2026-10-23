// 부적난무 — 입력. PC는 WASD·방향키, 터치·마우스는 누른 자리에 생기는 플로팅 조이스틱.
// ponytail: 고정 조이스틱·좌우 위치·감도 설정은 옵션 화면과 함께 계획 3에서.
const BJ_INPUT = (function bjInput() {
  const RADIUS = 60, DEAD = 0.15; // CSS px, 반경 대비 데드존 비율
  function stickVector(dx, dy, radius = RADIUS, dead = DEAD) {
    const d = Math.hypot(dx, dy);
    if (d < radius * dead) return { mx: 0, my: 0 };
    const k = Math.min(d, radius) / radius;
    return { mx: dx / d * k, my: dy / d * k };
  }
  const has = (keys, ...codes) => codes.some(c => keys.has(c));
  function keyVector(keys) {
    const x = has(keys, 'KeyD', 'ArrowRight') - has(keys, 'KeyA', 'ArrowLeft');
    const y = has(keys, 'KeyS', 'ArrowDown') - has(keys, 'KeyW', 'ArrowUp');
    const d = Math.hypot(x, y) || 1;
    return { mx: x / d + 0, my: y / d + 0 };
  }
  function attach(el) {
    const MOVE = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
    const keys = new Set();
    let pid = null, ox = 0, oy = 0, x = 0, y = 0;
    const pos = ev => { const r = el.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
    const onKey = down => ev => {
      if (!MOVE.has(ev.code)) return;
      ev.preventDefault();
      if (down) keys.add(ev.code); else keys.delete(ev.code);
    };
    function reset() { keys.clear(); pid = null; }
    window.addEventListener('keydown', onKey(true));
    window.addEventListener('keyup', onKey(false));
    window.addEventListener('blur', reset);
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', ev => {
      if (pid !== null) return;
      pid = ev.pointerId;
      [ox, oy] = pos(ev); x = ox; y = oy;
      el.setPointerCapture(pid);
    });
    el.addEventListener('pointermove', ev => { if (ev.pointerId === pid) [x, y] = pos(ev); });
    const up = ev => { if (ev.pointerId === pid) pid = null; };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return {
      read: () => (pid !== null ? stickVector(x - ox, y - oy) : keyVector(keys)),
      stick: () => ({ active: pid !== null, ox, oy, x, y }),
      reset,
    };
  }
  return { RADIUS, DEAD, stickVector, keyVector, attach };
})();
if (typeof module !== 'undefined') module.exports = BJ_INPUT;
