// 붕붕이 — 키보드·터치 입력 → 조작 값. 키는 e.code를 써서 한글 자판 상태에서도 동작.
// D는 기어(Drive)라서 보조 조향 키는 Q(왼쪽)/E(오른쪽).
const PP_INPUT = (function ppInput() {
  const GEAR_KEYS = { KeyP: 'P', KeyR: 'R', KeyN: 'N', KeyD: 'D' };
  const HANDLED = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyQ', 'KeyE', 'KeyD', 'KeyW', 'KeyS', 'KeyP', 'KeyR', 'KeyN', 'KeyV', 'Escape', 'ShiftLeft', 'ShiftRight'];
  const LOCK = 450;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // code가 빈 이벤트(일부 가상 키보드·자동화 도구)는 key로 대신 판단
  const codeOf = e => e.code || (/^[a-z]$/i.test(e.key) ? 'Key' + e.key.toUpperCase() : e.key === 'Shift' ? 'ShiftLeft' : e.key);

  function keyboard(inp) {
    window.addEventListener('keydown', e => {
      const code = codeOf(e);
      if (!HANDLED.includes(code) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest && e.target.closest('input') && code !== 'Escape') return;
      e.preventDefault();
      if (!e.repeat) {
        if (GEAR_KEYS[code]) inp.gearReq = GEAR_KEYS[code];
        if (code === 'KeyV') inp.viewReq = true;
        if (code === 'Escape') inp.menuReq = true;
      }
      inp.down.add(code);
    });
    window.addEventListener('keyup', e => inp.down.delete(codeOf(e)));
    window.addEventListener('blur', () => inp.down.clear());
  }

  // 핸들: 중심 기준 화면 각도 변화량만큼 돌린다(시계 방향 = 우회전 = 음수). 손을 떼도 각도 유지.
  function wheel(inp, el) {
    const angleAt = e => {
      const b = el.getBoundingClientRect();
      return Math.atan2(e.clientY - (b.top + b.height / 2), e.clientX - (b.left + b.width / 2)) * 180 / Math.PI;
    };
    el.addEventListener('pointerdown', e => {
      if (inp.grab) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      inp.grab = { id: e.pointerId, ang: angleAt(e), val: inp.carWheel };
      inp.steerAbs = inp.grab.val;
    });
    el.addEventListener('pointermove', e => {
      const g = inp.grab;
      if (!g || e.pointerId !== g.id) return;
      const a = angleAt(e);
      let d = a - g.ang;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      g.ang = a;
      g.val = clamp(g.val - d, -LOCK, LOCK);
      inp.steerAbs = g.val;
    });
    const end = e => { if (inp.grab && e.pointerId === inp.grab.id) inp.grab = null; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // 페달: 누른 세로 위치로 세기 결정(아래 0.2 ~ 위 1.0). 포인터별 추적이라 핸들과 동시 조작 가능.
  function pedal(inp, el, kind) {
    const level = e => { const b = el.getBoundingClientRect(); return clamp((b.bottom - e.clientY) / b.height, 0.2, 1); };
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      inp.pedals.set(e.pointerId, { kind, v: level(e) });
      el.classList.add('is-pressed');
    });
    el.addEventListener('pointermove', e => {
      const p = inp.pedals.get(e.pointerId);
      if (p) p.v = level(e);
    });
    const end = e => {
      inp.pedals.delete(e.pointerId);
      if (![...inp.pedals.values()].some(p => p.kind === kind)) el.classList.remove('is-pressed');
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  function create(root) {
    const inp = { down: new Set(), pedals: new Map(), grab: null, gearReq: null, viewReq: false, menuReq: false, steerAbs: null, carWheel: 0 };
    keyboard(inp);
    const q = s => root.querySelector(s);
    if (q('[data-pp="wheel"]')) wheel(inp, q('[data-pp="wheel"]'));
    if (q('[data-pp="brake"]')) pedal(inp, q('[data-pp="brake"]'), 'brake');
    if (q('[data-pp="gas"]')) pedal(inp, q('[data-pp="gas"]'), 'gas');
    root.querySelectorAll('[data-gear]').forEach(b => b.addEventListener('click', () => { inp.gearReq = b.dataset.gear; }));
    root.querySelectorAll('[data-pp="view"]').forEach(b => b.addEventListener('click', () => { inp.viewReq = true; }));
    root.querySelectorAll('[data-pp="menu"]').forEach(b => b.addEventListener('click', () => { inp.menuReq = true; }));
    // 터치 조작은 손가락 입력 기기이거나 터치가 한 번이라도 있으면 표시
    const touchOn = () => document.body.classList.add('touch');
    if (window.matchMedia && matchMedia('(pointer: coarse)').matches) touchOn();
    window.addEventListener('touchstart', touchOn, { once: true, passive: true });
    return inp;
  }

  // carWheel: 현재 차 핸들각(터치 핸들을 잡을 때 기준값). 일회성 요청은 읽으면 비워진다.
  function read(inp, carWheel) {
    if (carWheel != null) inp.carWheel = carWheel;
    const k = c => inp.down.has(c);
    const left = k('ArrowLeft') || k('KeyQ'), right = k('ArrowRight') || k('KeyE');
    const gas = k('ArrowUp') || k('KeyW'), shift = k('ShiftLeft') || k('ShiftRight');
    let tGas = 0, tBrake = 0;
    for (const p of inp.pedals.values()) {
      if (p.kind === 'gas') tGas = Math.max(tGas, p.v); else tBrake = Math.max(tBrake, p.v);
    }
    const out = {
      steerRate: (left ? 1 : 0) - (right ? 1 : 0),
      steerAbs: inp.steerAbs,
      throttle: Math.max(gas ? (shift ? 1 : 0.6) : 0, tGas),
      brake: Math.max(k('ArrowDown') || k('KeyS') ? 1 : 0, tBrake),
      gearReq: inp.gearReq, viewReq: inp.viewReq, menuReq: inp.menuReq,
    };
    if (!inp.grab) inp.steerAbs = null;
    inp.gearReq = null; inp.viewReq = false; inp.menuReq = false;
    return out;
  }

  return { create, read };
})();
if (typeof module !== 'undefined') module.exports = PP_INPUT;
