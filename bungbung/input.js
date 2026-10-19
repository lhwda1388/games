// 붕붕이 — 키보드·터치 입력 → 조작 값. 키는 e.code를 써서 한글 자판 상태에서도 동작.
// Q/E는 미러 확인, Z/C는 방향지시등. 페달 깊이는 주차/주행 공통.
const PP_INPUT = (function ppInput() {
  const PP_CAR_ = typeof PP_CAR !== 'undefined' ? PP_CAR : require('./car.js');
  const GEAR_KEYS = { KeyP: 'P', KeyR: 'R', KeyN: 'N', KeyD: 'D' };
  const HANDLED = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyQ', 'KeyE', 'KeyZ', 'KeyC', 'KeyD', 'KeyW', 'KeyS', 'KeyP', 'KeyR', 'KeyN', 'KeyV', 'KeyX', 'Escape'];
  const LOCK = 450;
  // 페달 깊이(0..1): 누르고 있는 동안 목표 깊이까지 서서히 깊어지고, 떼면 빠르게 돌아온다.
  // 초당 변화량: 엑셀 0→1 약 1.2초, 브레이크 0→1 약 0.6초, 떼기 1→0 약 0.15초.
  const PRESS_RATE = { gas: 1 / 1.2, brake: 1 / 0.6 }, RELEASE_RATE = 1 / 0.15;
  const SLIDE_START = 10; // px: 이만큼 위아래로 밀면 '깊이 조절' 모드(위 = 깊게, 아래 = 얕게)
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // code가 빈 이벤트(일부 가상 키보드·자동화 도구)는 key로 대신 판단
  const codeOf = e => e.code || (/^[a-z]$/i.test(e.key) ? 'Key' + e.key.toUpperCase() : e.key);

  function keyboard(inp) {
    window.addEventListener('keydown', e => {
      const code = codeOf(e);
      if (!HANDLED.includes(code) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest && e.target.closest('input') && code !== 'Escape') return;
      e.preventDefault();
      if (!e.repeat) {
        if (GEAR_KEYS[code]) inp.gearReq = GEAR_KEYS[code];
        if (code === 'KeyZ') inp.blinkReq = -1;
        if (code === 'KeyC') inp.blinkReq = 1;
        if (code === 'KeyV') inp.viewReq = true;
        if (code === 'KeyX') inp.hazardReq = 1;
        if (code === 'Escape') inp.menuReq = true;
      }
      inp.down.add(code);
    });
    window.addEventListener('keyup', e => inp.down.delete(codeOf(e)));
    window.addEventListener('blur', () => reset(inp));
  }

  // 핸들: 원을 그리지 않고 좌우로 끈 거리만큼 돌린다(오른쪽 = 우회전 = 음수). 손을 떼면 주행 속도에 비례해 복원(car.js 자동 복원).
  const STEER_PER_PX = 3; // ponytail: 휴대폰 체감 감도 손잡이. 150px = 한쪽 끝까지.
  function wheel(inp, el) {
    el.addEventListener('pointerdown', e => {
      // 새 pointerdown은 항상 인계: iOS Safari에서 pointerup이 유실돼도 죽은 grab이 이후 터치를 막지 않게
      e.preventDefault();
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* 이미 뗀 포인터 */ }
      inp.grab = { id: e.pointerId, x: e.clientX, val: inp.carWheel };
      inp.steerAbs = inp.grab.val;
    });
    el.addEventListener('pointermove', e => {
      const g = inp.grab;
      if (!g || e.pointerId !== g.id) return;
      g.val = clamp(g.val - (e.clientX - g.x) * STEER_PER_PX * PP_CAR_.steerGain(inp.v || 0), -LOCK, LOCK);
      g.x = e.clientX;
      inp.steerAbs = g.val;
    });
    const end = e => { if (inp.grab && e.pointerId === inp.grab.id) inp.grab = null; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
  }

  // 깊이 한 스텝. target = 누르는 중이면 목표 깊이, 떼었으면 null.
  function depthStep(depth, target, kind, dt) {
    if (target == null) return Math.max(0, depth - RELEASE_RATE * dt);
    if (depth < target) return Math.min(target, depth + PRESS_RATE[kind] * dt);
    return Math.max(target, depth - RELEASE_RATE * dt);
  }

  // 페달: 누르고 있으면 끝까지 깊어진다. 엑셀은 누른 채 위아래로 밀면 그 깊이에서 멈추도록 목표를 조절.
  // 포인터별 추적이라 핸들과 동시 조작 가능.
  function pedal(inp, el, kind) {
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      inp.pedals.set(e.pointerId, { kind, y0: e.clientY, slide: false, base: 0, target: 1 });
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* 이미 뗀 포인터 */ }
      el.classList.add('is-pressed');
    });
    el.addEventListener('pointermove', e => {
      const p = inp.pedals.get(e.pointerId);
      if (!p) return;
      if (kind === 'brake') return; // 브레이크는 누르고 있으면 끝까지: 엄지가 미끄러져 얕게 고정되면 차가 안 선다
      if (!p.slide && Math.abs(e.clientY - p.y0) >= SLIDE_START) { p.slide = true; p.base = inp.depth[kind]; p.y0 = e.clientY; }
      if (p.slide) p.target = clamp(p.base + (p.y0 - e.clientY) / (el.getBoundingClientRect().height * 0.8), 0, 1);
    });
    const end = e => {
      inp.pedals.delete(e.pointerId);
      if (![...inp.pedals.values()].some(p => p.kind === kind)) el.classList.remove('is-pressed');
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  function reset(inp) {
    inp.down.clear(); inp.pedals.clear(); inp.mirrors.clear();
    inp.depth.gas=0;inp.depth.brake=0;inp.grab=null;inp.steerAbs=null;
    inp.blinkReq=0;inp.hazardReq=0;inp.gearReq=null;inp.viewReq=false;inp.menuReq=false;
    if (typeof document !== 'undefined') document.querySelectorAll('.pedal').forEach(el => el.classList.remove('is-pressed'));
  }
  function create(root) {
    const inp = { down: new Set(), mirrors: new Map(), pedals: new Map(), depth: { gas: 0, brake: 0 }, grab: null, gearReq: null, viewReq: false, menuReq: false, steerAbs: null, carWheel: 0 };
    keyboard(inp);
    root.querySelectorAll('[data-blink]').forEach(b=>{
      const req=()=>{inp.blinkReq=Number(b.dataset.blink);};
      b.addEventListener('pointerdown',e=>{e.preventDefault();req();});
      b.addEventListener('click',e=>{if(e.detail===0)req();});
    });
    root.querySelectorAll('[data-hazard]').forEach(b=>{
      const req=()=>{inp.hazardReq=1;};
      b.addEventListener('pointerdown',e=>{e.preventDefault();req();});
      b.addEventListener('click',e=>{if(e.detail===0)req();});
    });
    root.querySelectorAll('[data-mirror]').forEach(b=>{
      b.addEventListener('pointerdown',e=>{e.preventDefault();inp.mirrors.set(e.pointerId,b.dataset.mirror);try{b.setPointerCapture(e.pointerId);}catch(err){/* 이미 뗀 포인터 */}});
      const end=e=>inp.mirrors.delete(e.pointerId);
      for(const name of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(name,end);
      b.addEventListener('keydown',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();inp.mirrors.set('keyboard',b.dataset.mirror);}});
      b.addEventListener('keyup',()=>inp.mirrors.delete('keyboard'));
      b.addEventListener('blur',()=>inp.mirrors.delete('keyboard'));
    });
    const q = s => root.querySelector(s);
    if (q('[data-pp="wheel"]')) wheel(inp, q('[data-pp="wheel"]'));
    if (q('[data-pp="brake"]')) pedal(inp, q('[data-pp="brake"]'), 'brake');
    if (q('[data-pp="gas"]')) pedal(inp, q('[data-pp="gas"]'), 'gas');
    // 기어는 pointerdown으로 받는다: 다른 손가락으로 브레이크를 누른 채 탭하면 브라우저가 click을 만들지 않는다.
    // click은 키보드(Enter/Space) 조작용으로 남긴다(같은 기어 요청이 겹쳐도 무해).
    root.querySelectorAll('[data-gear]').forEach(b => {
      const req = () => { inp.gearReq = b.dataset.gear; };
      b.addEventListener('pointerdown', e => { e.preventDefault(); req(); });
      b.addEventListener('click', req);
    });
    root.querySelectorAll('[data-pp="view"]').forEach(b => b.addEventListener('click', () => { inp.viewReq = true; }));
    root.querySelectorAll('[data-pp="menu"]').forEach(b => b.addEventListener('click', () => { inp.menuReq = true; }));
    // 터치 조작은 손가락 입력 기기이거나 터치가 한 번이라도 있으면 표시
    const touchOn = () => { if (document.body.classList.contains('touch')) return; document.body.classList.add('touch'); window.dispatchEvent(new Event('resize')); }; // 미러 배치 다시
    if (window.matchMedia && matchMedia('(pointer: coarse)').matches) touchOn();
    window.addEventListener('touchstart', touchOn, { once: true, passive: true });
    return inp;
  }

  // carWheel: 현재 차 핸들각(터치 핸들을 잡을 때 기준값). dt: 지난 read 이후 초(페달 깊이 갱신).
  // 일회성 요청은 읽으면 비워진다.
  function read(inp, carWheel, dt = 0, v = 0) {
    if (carWheel != null) inp.carWheel = carWheel;
    inp.v = v; // 터치 드래그 감도용(pointermove가 read 사이에 오므로 저장)
    const k = c => inp.down.has(c);
    const left = k('ArrowLeft'), right = k('ArrowRight');
    const target = { gas: k('ArrowUp') || k('KeyW') ? 1 : null, brake: k('ArrowDown') || k('KeyS') ? 1 : null };
    for (const p of inp.pedals.values()) target[p.kind] = Math.max(target[p.kind] ?? 0, p.target);
    for (const kind of ['gas', 'brake']) inp.depth[kind] = depthStep(inp.depth[kind], target[kind], kind, dt);
    const out = {
      steerRate: ((left ? 1 : 0) - (right ? 1 : 0)) * PP_CAR_.steerGain(v),
      steerAbs: inp.steerAbs, hold: !!inp.grab, hazardReq: inp.hazardReq || 0,
      throttle: inp.depth.gas,
      brake: inp.depth.brake,
      blinkReq: inp.blinkReq || 0, mirrorL: k('KeyQ') || [...inp.mirrors.values()].includes('left'), mirrorR: k('KeyE') || [...inp.mirrors.values()].includes('right'),
      gearReq: inp.gearReq, viewReq: inp.viewReq, menuReq: inp.menuReq,
    };
    if (!inp.grab) inp.steerAbs = null;
    inp.blinkReq = 0; inp.hazardReq = 0; inp.gearReq = null; inp.viewReq = false; inp.menuReq = false;
    return out;
  }

  return { reset, create, read, depthStep, PRESS_RATE, RELEASE_RATE };
})();
if (typeof module !== 'undefined') module.exports = PP_INPUT;
