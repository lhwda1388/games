// 네뷸라 워 — 시뮬 시계. 고정 스텝 누산기 + (선택) 탭이 가려져도 도는 백그라운드 구동. 렌더는 계속 rAF.
//
//   const clk = NW_CLOCK.create({ step, tick, canTick?, cap?, bgCap?, now? })
//     step      한 틱의 실제 시간(ms). 배속은 setStep(STEP / speed) 로 바꾼다.
//     tick()    틱 하나를 돌린다(명령 수집·S.step·이벤트). 한 번 pump 에서 여러 번 불릴 수 있다.
//     canTick() false 면 시간을 쌓지 않고 멈춘다(일시정지·종료). 매 틱 전에 다시 확인한다. 기본 항상 true.
//     cap       한 번 pump 에 따라잡는 최대 시간(ms, 기본 250) — 오래 멈췄다 돌아와도 폭주하지 않게.
//     bgCap     백그라운드 구동 때의 cap(기본 1000) — 대체 타이머가 1초로 묶여도 시간을 잃지 않게.
//   clk.pump(now)        rAF 에서 매 프레임 부른다. 쌓인 시간만큼 tick() 하고 돈 틱 수를 돌려준다.
//   clk.alpha()          직전·현재 틱 사이 보간 0..1 (= 쌓인 시간 / step).
//   clk.reset(now?)      쌓인 시간 0, 기준 시각 = now(기본 지금). 새 판·화면 복귀 때.
//   clk.setStep(ms)
//   clk.background(on)   on: 탭이 가려져 rAF 가 멈춰도 타이머가 pump 한다(P2P lockstep·AI 대 AI 용).
//                        off(기본): 솔로 — 가려지면 rAF 와 함께 멈춘다(돌아오면 cap 만큼만 따라잡음).
//                        타이머 = Blob URL Web Worker(file:// · http(s) 모두), 못 만들면 setTimeout.
//   clk.bg               현재 백그라운드 구동 종류: null | 'worker' | 'timeout'
//   clk.destroy()        타이머 정리.
// DOM 없이 node 에서도 쓸 수 있다(background 는 브라우저 전용, node 에선 setTimeout 대체).
const NW_CLOCK = (() => {
  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const WORKER_SRC = 'let t=0;onmessage=e=>{clearInterval(t);t=e.data>0?setInterval(()=>postMessage(0),e.data):0};';
  const PERIOD = 25; // 백그라운드 pump 간격(ms) — 틱 수는 누산기가 정하므로 step 보다 촘촘하기만 하면 된다

  // 백그라운드 타이머: fn 을 주기적으로 부른다. { kind, stop() }. 워커가 비동기로 실패하면(CSP·blob 로드 오류) setTimeout 으로 갈아타고 onFallback 을 부른다.
  function startTimer(fn, onFallback) {
    const h = { kind: 'timeout', stop() {} };
    const useTimeout = () => {
      let t = 0, live = true;
      const loop = () => { if (!live) return; t = setTimeout(loop, PERIOD); fn(); };
      t = setTimeout(loop, PERIOD);
      h.kind = 'timeout'; h.stop = () => { live = false; clearTimeout(t); };
    };
    if (typeof Worker !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined') {
      try {
        let url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }));
        const w = new Worker(url);
        const revoke = () => { if (url) { URL.revokeObjectURL(url); url = null; } };
        w.onmessage = () => { revoke(); fn(); }; // 구형 Safari 는 로드 전에 revoke 하면 실패 — 첫 메시지 때 해제
        w.onerror = () => { revoke(); w.terminate(); useTimeout(); if (onFallback) onFallback(); };
        w.postMessage(PERIOD);
        h.kind = 'worker'; h.stop = () => { revoke(); w.terminate(); };
        return h;
      } catch (e) { /* 동기 실패 — 아래 대체 */ }
    }
    useTimeout();
    return h;
  }

  function create(opt) {
    const { tick, canTick = () => true, cap = 250, bgCap = 1000, now = nowMs } = opt;
    let step = opt.step, acc = 0, last = now(), timer = null;
    function advance(t, max) {
      if (!canTick()) { if (t > last) last = t; return 0; } // 멈춘 순간의 보간(acc)은 그대로 둔다
      if (t > last) { acc += t - last; last = t; } // 시각이 거꾸로 가면(rAF 프레임 시작 vs now) 무시
      if (acc > max) acc = max;
      let n = 0;
      while (acc >= step && canTick()) { tick(); acc -= step; n++; }
      return n;
    }
    // 타이머 구동 pump: bgCap 적용, tick 이 던지면 백그라운드 구동을 멈추고 한 번만 던진다
    function timerPump() {
      try { advance(now(), bgCap); } catch (e) { clk.background(false); throw e; }
    }
    const clk = {
      bg: null,
      pump: t => advance(t === undefined ? now() : t, cap),
      alpha: () => Math.min(1, acc / step),
      reset(t) { acc = 0; last = t === undefined ? now() : t; },
      setStep(ms) { step = ms; },
      background(on) {
        if (!!on === !!timer) return;
        if (on) { timer = startTimer(timerPump, () => { clk.bg = timer.kind; }); clk.bg = timer.kind; }
        else { timer.stop(); timer = null; clk.bg = null; }
      },
      destroy() { clk.background(false); },
    };
    return clk;
  }
  return { create };
})();
if (typeof module !== 'undefined') module.exports = NW_CLOCK;
