// 네뷸라 워 — P2P 게임 중 화면 조각(지연 대기·끊김 알림·desync/오류 화면·채팅·핑). net.js 세션 이벤트를 그대로 먹는다.
// index.html 의 P2P 게임 루프(startNet)가 세션 onEvent 를 여기로 넘긴다. 순수 도우미는 node 에서 require 가능.
//
// const N = NW_NETUI.create({
//   root,                       // 붙일 곳(기본 #game)
//   me, nameOf(p), colorOf(p),  // colorOf → CSS 색(기본 var(--player-p+1))
//   chat(text, scope),          // → sess.chat     (없으면 채팅 입력 안 열림)
//   ping(x, y, kind),           // → sess.ping     (월드 px, kind = 'ping' | 'attack' | 'help')
//   status(),                   // → sess.status() (지연 패널 경과 시간·대기 명단을 여기서 읽는다, 선택)
//   drop(players),              // '내보내기' 선택 → 자리마다 sess.drop(p) (없으면 선택지 없이 기다리기만)
//   onMenu(), onSaveReplay(),   // 종료 화면 버튼(onSaveReplay 없으면 그 버튼 없음)
//   logExtra(ev),               // 로그 JSON 에 덧붙일 것 { version, status, rec, … }
//   main, mini,                 // 지도·미니맵 캔버스(핑 오버레이를 그 위에 맞춘다)
//   view(),                     // → { camX, camY } (U.view)
//   worldSize(),                // → [W, H] 월드 px
//   promptMs = 8000, sfx(kind)? // 핑 소리(선택)
//   dropAfterMs?                // 세션 자동 내보내기 시간 — 있으면 선택지 아래 '약 N초 뒤 자동으로 내보냅니다'
// })
// N.event(ev)   세션 onEvent 를 그대로 넘긴다: lag resume dropping drop dropped desync mismatch error chat ping
// N.open(scope) / N.close() / N.add({player, text, scope}) / N.toast(text, player?, tone?) / N.reset() / N.destroy()
// NW_NETUI.typing   채팅 입력 중이면 true — ui.js keydown 이 이걸 보고 게임 단축키를 건너뛴다.
//
// 입력: Enter = 채팅(전체), Shift+Enter = 팀, 입력 중 Tab = 전체↔팀, "/t " 접두어 = 팀, Enter 보내기, Esc 닫기.
//   Alt+클릭(지도·미니맵) = 집결 핑, Alt+Shift = 여기 공격, Alt+Ctrl(⌘) = 도움. 피어 문자열은 전부 textContent 로만.
const NW_NETUI = (() => {
  const CHAT_MAX = 200, LOG_KEEP = 50, FADE_MS = 8000, BURST = 5, WINDOW = 3000, PING_MS = 3000, TOAST_MS = 4500;
  const KINDS = { ping: '집결', attack: '여기 공격', help: '도움' };
  const defNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // ---- 순수 도우미 ----
  // 제어 문자·양방향 덮어쓰기·폭 없는 공백(ZWJ 는 이모지 결합에 필요해서 남김) 제거, 줄바꿈은 공백으로.
  const BAD = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f​‌‎‏‪-‮⁠-⁤⁦-⁩﻿]/g;
  function clean(s) { return String(s == null ? '' : s).replace(/[\t\n\r]/g, ' ').replace(BAD, ''); }
  // n = UTF-16 길이 상한(net·lobby·replay 와 같은 200, 같은 단위) — 코드포인트 경계에서 자른다(이모지 반쪽 방지)
  const clip = (s, n) => { if (s.length <= n) return s; let o = ''; for (const ch of s) { if (o.length + ch.length > n) break; o += ch; } return o; };
  // 입력 한 줄 → { text, scope } | null(빈 문자열). "/t " = 팀, "/a " = 전체.
  function parse(raw, scope = 'all') {
    let s = clean(raw).trim();
    const m = /^\/([ta])(?:\s+|$)/i.exec(s);
    if (m) { scope = m[1].toLowerCase() === 't' ? 'team' : 'all'; s = s.slice(m[0].length); }
    s = clip(s.replace(/\s+/g, ' ').trim(), CHAT_MAX);
    return s ? { text: s, scope: scope === 'team' ? 'team' : 'all' } : null;
  }
  // 받은 메시지 표시용: 같은 정리 + 길이 자르기
  const display = t => clip(clean(t).replace(/\s+/g, ' ').trim(), CHAT_MAX);
  // 미끄러지는 창: ms 안에 n 번까지. ok() 가 false 면 wait() 만큼 뒤에 다시.
  function limiter(n = BURST, ms = WINDOW, now = defNow) {
    let log = [];
    const trim = t => { log = log.filter(x => t - x < ms); };
    return {
      ok(t = now()) { trim(t); if (log.length >= n) return false; log.push(t); return true; },
      wait(t = now()) { trim(t); return log.length < n ? 0 : ms - (t - log[0]); },
    };
  }
  const mmss = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  const kindOf = k => (Object.prototype.hasOwnProperty.call(KINDS, k) ? k : 'ping');
  // 로그 파일: 이벤트 원본 + 덧붙일 것(버전·status·rec…). 피어가 보낸 값은 JSON 안에만 들어간다.
  function logPayload(ev, extra = {}, at = new Date()) {
    const out = { kind: ev.type, at: at.toISOString() };
    for (const k of ['tick', 'mine', 'theirs', 'player', 'recent', 'field', 'reason', 'message']) if (ev[k] !== undefined) out[k] = ev[k];
    return Object.assign(out, extra);
  }
  // 자동 내보내기까지 남은 초(올림, 0 이상). 세션은 마지막으로 들은 시각 기준이라 대기 시간 기준인 이 값은 근사.
  const autoDropIn = (waitingMs, dropAfterMs) => Math.max(0, Math.ceil((dropAfterMs - (waitingMs || 0)) / 1000));
  // 지금 띄울 화면(세션 status 만 보고): 끝 화면 > 지연+선택지(promptMs 넘김) > 지연 > 없음. 콘솔 NW_DEBUG.net.overlay() 가 이걸 부른다.
  function overlayFor(st, promptMs = 8000) {
    if (!st) return null;
    if (['dropped', 'desync', 'mismatch', 'error'].includes(st.state)) return st.state;
    const w = Array.isArray(st.waiting) ? st.waiting : [];
    if (!w.length) return null;
    return (st.waitingMs || 0) >= promptMs ? 'prompt' : 'lag';
  }
  const logName = ev => 'nebula-war-' + ev.type + '-' + (Number.isInteger(ev.tick) ? ev.tick : Date.now()) + '.json';

  let typing = false;

  // ---- DOM ----
  function create(o = {}) {
    const doc = document, now = defNow;
    const root = o.root || doc.getElementById('game') || doc.body;
    const nameOf = o.nameOf || (p => 'P' + (p + 1)), colorOf = o.colorOf || (p => 'var(--player-' + ((p | 0) % 4 + 1) + ')');
    const promptMs = o.promptMs || 8000;
    const RM = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
    const h = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const btn = (text, cls) => { const b = h('button', 'btn act' + (cls ? ' ' + cls : ''), text); b.type = 'button'; return b; };
    const chip = p => { const i = h('i', 'nl-chip'); i.style.setProperty('--k', colorOf(p)); i.setAttribute('aria-hidden', 'true'); return i; };
    const timers = new Set(), later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    const nodes = [];
    const mount = e => { root.appendChild(e); nodes.push(e); return e; };

    // ---------- 1. 상대 연결 지연 ----------
    const lagEl = mount(h('section', 'nl-lag panel')); lagEl.hidden = true;
    lagEl.setAttribute('role', 'status'); lagEl.setAttribute('aria-live', 'polite');
    const lagHead = lagEl.appendChild(h('div', 'nl-lag-head'));
    lagHead.appendChild(h('span', 'nl-beat')).setAttribute('aria-hidden', 'true');
    const lagWord = lagHead.appendChild(h('h2', 'nl-lag-word', '상대 연결 지연'));
    const lagTime = lagHead.appendChild(h('span', 'num nl-lag-time', '00:00'));
    const lagSub = lagEl.appendChild(h('p', 'nl-lag-sub', '게임이 멈췄습니다. 상대의 신호를 기다리는 중입니다.'));
    const lagList = lagEl.appendChild(h('ul', 'nl-lag-list'));
    const lagAsk = lagEl.appendChild(h('div', 'nl-lag-ask')); lagAsk.hidden = true;
    lagAsk.appendChild(h('p', 'nl-lag-q', '계속 기다릴까요?'));
    const lagActs = lagAsk.appendChild(h('div', 'nl-acts'));
    const waitBtn = lagActs.appendChild(btn('계속 기다리기'));
    const kickBtn = lagActs.appendChild(btn('내보내기', 'is-danger'));
    const lagAuto = o.dropAfterMs ? lagAsk.appendChild(h('p', 'nl-lag-sub')) : null;
    let lag = null, lagTimer = 0;

    function lagRender() {
      if (!lag) return;
      let ms = now() - lag.since;
      if (o.status) {
        const st = o.status();
        if (st && Array.isArray(st.waiting) && st.waiting.length) { lag.waiting = st.waiting.slice(); ms = st.waitingMs; }
      }
      lagTime.textContent = mmss(ms);
      const sig = lag.waiting.join(',');
      if (sig !== lag.sig) {
        lag.sig = sig; lagList.textContent = '';
        for (const p of lag.waiting) {
          const li = lagList.appendChild(h('li', 'nl-lag-p'));
          li.appendChild(chip(p)); li.appendChild(h('span', 'nl-nm', nameOf(p))); li.appendChild(h('span', 'nl-lag-st', '응답 없음'));
        }
      }
      if (lagAuto) { const k = autoDropIn(ms, o.dropAfterMs); lagAuto.textContent = k > 0 ? '응답이 없으면 약 ' + k + '초 뒤 자동으로 내보냅니다' : '곧 자동으로 내보냅니다'; }
      if (o.drop && !lag.kicking && lagAsk.hidden && ms >= lag.askAt) {
        lagAsk.hidden = false;
        if (!typing && !screenOn()) waitBtn.focus({ preventScroll: true });
      }
    }
    function lagStart(waiting, ms) {
      clearTimeout(lag && lag.backT);
      lag = { since: now() - (ms || 0), waiting: (waiting || []).slice(), askAt: promptMs, sig: null, kicking: false };
      lagEl.hidden = false; lagEl.classList.remove('is-ok'); lagWord.textContent = '상대 연결 지연';
      lagSub.textContent = '게임이 멈췄습니다. 상대의 신호를 기다리는 중입니다.';
      lagAsk.hidden = true; kickBtn.disabled = false; kickBtn.textContent = '내보내기';
      clearInterval(lagTimer); lagTimer = setInterval(lagRender, 250); lagRender();
    }
    function lagEnd(recovered) {
      clearInterval(lagTimer); lagTimer = 0;
      if (!lag) return;
      const back = lagAsk.contains(doc.activeElement);
      lag = null; lagAsk.hidden = true;
      if (back) doc.activeElement.blur();
      if (!recovered) { lagEl.hidden = true; return; }
      lagEl.classList.add('is-ok'); lagWord.textContent = '연결 회복'; lagSub.textContent = '게임을 이어 갑니다.'; lagList.textContent = '';
      later(() => { if (!lag) lagEl.hidden = true; }, 1200);
    }
    waitBtn.addEventListener('click', () => {
      if (!lag) return;
      lagAsk.hidden = true; lag.askAt = (now() - lag.since) + promptMs; // 다시 promptMs 뒤에 묻는다
      doc.activeElement && doc.activeElement.blur();
    });
    kickBtn.addEventListener('click', () => {
      if (!lag || !o.drop) return;
      lag.kicking = true; kickBtn.disabled = true; kickBtn.textContent = '내보내는 중…';
      o.drop(lag.waiting.slice());
    });

    // ---------- 2. 끊김 알림(토스트) ----------
    const toasts = mount(h('div', 'nl-toasts')); toasts.setAttribute('role', 'status'); toasts.setAttribute('aria-live', 'polite');
    function toast(text, p, tone) {
      const t = toasts.appendChild(h('p', 'nl-toast'));
      if (tone) t.dataset.tone = tone;
      if (p != null) { t.style.setProperty('--k', colorOf(p)); t.appendChild(chip(p)); t.appendChild(h('span', 'nl-nm', nameOf(p))); } // 이름은 잘라서
      t.appendChild(h('span', '', text));
      while (toasts.children.length > 4) toasts.firstChild.remove();
      later(() => t.classList.add('is-old'), TOAST_MS);
      later(() => t.remove(), TOAST_MS + 700);
      return t;
    }

    // ---------- 3. 종료 화면(나 끊김 · desync · 버전 불일치 · 오류) ----------
    const scr = mount(h('div', 'nl-screen')); scr.hidden = true;
    const scrPanel = scr.appendChild(h('div', 'nl-panel panel'));
    scrPanel.setAttribute('role', 'alertdialog'); scrPanel.setAttribute('aria-modal', 'true');
    const scrWord = scrPanel.appendChild(h('h2', 'nl-word')); scrWord.id = 'nl-word';
    const scrText = scrPanel.appendChild(h('p', 'nl-text')); scrText.id = 'nl-text';
    scrPanel.setAttribute('aria-labelledby', 'nl-word'); scrPanel.setAttribute('aria-describedby', 'nl-text');
    const scrFacts = scrPanel.appendChild(h('dl', 'nl-facts'));
    const scrActs = scrPanel.appendChild(h('div', 'nl-acts'));
    const screenOn = () => !scr.hidden;
    function download(ev) {
      const data = JSON.stringify(logPayload(ev, o.logExtra ? o.logExtra(ev) : {}), null, 1);
      const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      const a = h('a'); a.href = url; a.download = logName(ev); doc.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }
    function fact(k, v, p) {
      scrFacts.appendChild(h('dt', '', k));
      const dd = scrFacts.appendChild(h('dd'));
      if (p != null) { dd.appendChild(chip(p)); dd.appendChild(h('span', 'nl-nm', nameOf(p))); if (v !== '') dd.appendChild(h('span', 'num', ' ' + v)); }
      else dd.appendChild(h('span', 'num', v));
    }
    function screen(tone, word, text, facts, ev, opts = {}) {
      close(); lagEnd(false);
      scr.dataset.tone = tone; scrWord.textContent = word; scrText.textContent = text;
      scrFacts.textContent = ''; for (const f of facts) fact(...f); scrFacts.hidden = !facts.length;
      scrActs.textContent = '';
      if (opts.log) { const b = scrActs.appendChild(btn('로그 저장 (.json)')); b.addEventListener('click', () => download(ev)); }
      if (opts.replay && o.onSaveReplay) { const b = scrActs.appendChild(btn('리플레이 저장 (.json)')); b.addEventListener('click', () => o.onSaveReplay()); }
      const m = scrActs.appendChild(btn('메뉴로')); m.addEventListener('click', () => { if (o.onMenu) o.onMenu(); });
      scr.hidden = false;
      scrActs.firstChild.focus({ preventScroll: true });
    }
    scr.addEventListener('keydown', ev => { // 포커스 트랩(버튼 몇 개)
      if (ev.key !== 'Tab') return;
      const b = [...scrActs.querySelectorAll('button')], i = b.indexOf(doc.activeElement);
      ev.preventDefault(); b[(i + (ev.shiftKey ? b.length - 1 : 1)) % b.length].focus();
    });
    const hex = v => (Number.isInteger(v) ? (v >>> 0).toString(16).padStart(8, '0') : String(v));

    // ---------- 4. 채팅 ----------
    const chatEl = mount(h('div', 'nl-chat'));
    const logEl = chatEl.appendChild(h('ol', 'nl-log')); logEl.setAttribute('aria-live', 'polite'); logEl.setAttribute('aria-label', '채팅');
    const inRow = chatEl.appendChild(h('div', 'nl-in panel')); inRow.hidden = true;
    const scopeBtn = inRow.appendChild(h('button', 'btn nl-scope')); scopeBtn.type = 'button'; scopeBtn.tabIndex = -1;
    const input = inRow.appendChild(h('input', 'nl-input'));
    input.type = 'text'; input.maxLength = CHAT_MAX; input.autocomplete = 'off'; input.spellcheck = false; input.setAttribute('aria-label', '채팅 입력');
    const count = inRow.appendChild(h('span', 'num nl-count', '0/' + CHAT_MAX));
    const hint = chatEl.appendChild(h('p', 'nl-hint')); hint.hidden = true;
    // 채팅 열기 버튼(P2P 만 — o.chat 이 있을 때): 터치에는 Enter 가 없으므로 로그 아래 같은 자리에 둔다. 열리면 입력 줄이 이 자리를 쓴다.
    const talk = chatEl.appendChild(h('button', 'btn nl-talk')); talk.type = 'button'; talk.hidden = !o.chat;
    talk.appendChild(h('span', null, '채팅'));
    talk.appendChild(h('span', 'kbd', 'Enter')).setAttribute('aria-hidden', 'true');
    talk.setAttribute('aria-label', '채팅 열기 (Enter · 팀은 Shift+Enter)');
    input.enterKeyHint = 'send';
    const lim = limiter(), pingLim = limiter();
    let scope = 'all';
    const setScope = s => { scope = s === 'team' ? 'team' : 'all'; scopeBtn.textContent = scope === 'team' ? '팀' : '전체'; scopeBtn.setAttribute('aria-pressed', String(scope === 'team')); inRow.dataset.scope = scope; };
    setScope('all');
    const HINT = 'Enter 보내기 · Tab 전체/팀 · Esc 닫기';
    function open(s = 'all') {
      if (!o.chat || screenOn()) return;
      setScope(s); typing = true; chatEl.classList.add('is-open'); inRow.hidden = false; hint.hidden = false; talk.hidden = true;
      hint.textContent = HINT; hint.classList.remove('is-err');
      input.focus({ preventScroll: true }); logEl.scrollTop = logEl.scrollHeight;
    }
    function close() {
      typing = false; chatEl.classList.remove('is-open'); inRow.hidden = true; hint.hidden = true; talk.hidden = !o.chat;
      if (doc.activeElement === input) input.blur();
      logEl.scrollTop = logEl.scrollHeight;
    }
    function send() {
      const p = parse(input.value, scope);
      if (!p) { input.value = ''; close(); return; }
      if (!lim.ok()) { hint.textContent = '잠시 후 다시 — 3초에 ' + BURST + '개까지 보낼 수 있습니다'; hint.classList.add('is-err'); return; }
      input.value = ''; count.textContent = '0/' + CHAT_MAX; close();
      o.chat(p.text, p.scope);
    }
    function add(m) {
      if (!m || !Number.isInteger(m.player)) return;
      const text = display(m.text); if (!text) return;
      const li = logEl.appendChild(h('li', 'nl-msg'));
      li.dataset.scope = m.scope === 'team' ? 'team' : 'all';
      li.appendChild(h('span', 'nl-sc', m.scope === 'team' ? '[팀]' : '[전체]'));
      const who = li.appendChild(h('span', 'nl-who', nameOf(m.player))); who.style.setProperty('--k', colorOf(m.player));
      li.appendChild(h('span', 'nl-tx', text));
      while (logEl.children.length > LOG_KEEP) logEl.firstChild.remove();
      later(() => li.classList.add('is-old'), FADE_MS);
      logEl.scrollTop = logEl.scrollHeight;
    }
    input.addEventListener('input', () => {
      count.textContent = input.value.length + '/' + CHAT_MAX;
      if (/^\/t\s/i.test(input.value) && scope !== 'team') { setScope('team'); input.value = input.value.replace(/^\/t\s+/i, ''); }
    });
    input.addEventListener('keydown', ev => {
      if (ev.isComposing || ev.keyCode === 229) return; // 한글 조합 중 Enter 는 조합 확정
      if (ev.key === 'Enter') { ev.preventDefault(); send(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); close(); }
      else if (ev.key === 'Tab') { ev.preventDefault(); setScope(scope === 'team' ? 'all' : 'team'); }
    });
    input.addEventListener('blur', () => { if (typing) close(); }); // 지도를 클릭하면 단축키를 돌려준다(쓰던 글은 남김)
    talk.addEventListener('click', () => open('all'));
    scopeBtn.addEventListener('mousedown', ev => { ev.preventDefault(); setScope(scope === 'team' ? 'all' : 'team'); });
    const editable = t => !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON|A|SUMMARY)$/.test(t.tagName));
    function onKey(ev) {
      if (typing || ev.key !== 'Enter' || ev.repeat || ev.altKey || ev.ctrlKey || ev.metaKey) return;
      if (editable(ev.target) || screenOn() || !root.isConnected || root.closest('[hidden]')) return;
      if (doc.querySelector('[data-hud=mode-chip]:not([hidden])')) return; // 무장 중 Enter = 명령 실행(ui.js) — 채팅은 무장을 풀고
      ev.preventDefault(); open(ev.shiftKey ? 'team' : 'all');
    }
    addEventListener('keydown', onKey, true);

    // ---------- 5. 핑 ----------
    const pings = [];
    const ovMain = o.main ? o.main.insertAdjacentElement('afterend', h('canvas', 'nl-ov')) : null;
    const ovMini = o.mini ? o.mini.insertAdjacentElement('afterend', h('canvas', 'nl-ov')) : null;
    [ovMain, ovMini].forEach(c => c && c.setAttribute('aria-hidden', 'true'));
    const cssVar = (c) => { const m = /^var\((--[\w-]+)\)$/.exec(c); return m ? getComputedStyle(doc.documentElement).getPropertyValue(m[1]).trim() : c; };
    const font = () => getComputedStyle(doc.documentElement).getPropertyValue('--font-display').trim() || 'sans-serif';
    function onDown(ev) {
      if (!ev.altKey || ev.button !== 0 || (ev.target !== o.main && ev.target !== o.mini) || !o.ping || screenOn()) return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      let x, y;
      if (ev.target === o.mini) {
        const r = o.mini.getBoundingClientRect(), [W, H] = o.worldSize(), k = Math.min(r.width / W, r.height / H);
        x = (ev.clientX - r.left - (r.width - W * k) / 2) / k; y = (ev.clientY - r.top - (r.height - H * k) / 2) / k;
        x = Math.max(0, Math.min(W, x)); y = Math.max(0, Math.min(H, y));
      } else {
        const r = o.main.getBoundingClientRect(), v = o.view();
        x = v.camX + ev.clientX - r.left; y = v.camY + ev.clientY - r.top;
      }
      if (!pingLim.ok()) return;
      o.ping(Math.round(x), Math.round(y), ev.shiftKey ? 'attack' : (ev.ctrlKey || ev.metaKey) ? 'help' : 'ping');
    }
    const onCtx = ev => { if (ev.altKey && (ev.target === o.main || ev.target === o.mini)) ev.preventDefault(); }; // macOS Ctrl+클릭
    addEventListener('mousedown', onDown, true); addEventListener('contextmenu', onCtx, true);
    // 터치: 미니맵 길게 누르기(450ms, 거의 안 움직임) = 핑 종류 고르기 — 집결 · 여기 공격 · 도움(Alt / Alt+Shift / Alt+Ctrl 클릭과 같은 핑).
    // 미니맵 탭·끌기(카메라)는 ui.js 가 받고, 오래 누른 탭은 거기서 카메라를 옮기지 않는다.
    const pickEl = mount(h('div', 'nl-pick panel')); pickEl.hidden = true;
    pickEl.setAttribute('role', 'menu'); pickEl.setAttribute('aria-label', '핑 종류');
    let pickAt = null, holdT = 0, hold = null;
    for (const k of ['ping', 'attack', 'help']) {
      const b = pickEl.appendChild(h('button', 'btn nl-pick-b'));
      b.type = 'button'; b.dataset.kind = k; b.setAttribute('role', 'menuitem');
      const c = b.appendChild(h('canvas', 'nl-pick-g')); c.width = c.height = 20; c.setAttribute('aria-hidden', 'true');
      b.appendChild(h('span', '', KINDS[k]));
      b.addEventListener('click', () => {
        const at = pickAt; closePick();
        if (at && o.ping && !screenOn() && pingLim.ok()) o.ping(Math.round(at[0]), Math.round(at[1]), k);
      });
    }
    function paintPick() { // 표식 = 본화면 핑과 같은 모양(내 색)
      const col = cssVar(colorOf(o.me | 0));
      for (const c of pickEl.querySelectorAll('canvas')) {
        const ctx = c.getContext('2d'); ctx.clearRect(0, 0, 20, 20); ctx.strokeStyle = col; ctx.lineWidth = 2; glyph(ctx, c.parentNode.dataset.kind, 10, 11, 6); ctx.stroke();
      }
    }
    function openPick(cx, cy, at) {
      pickAt = at; pickEl.hidden = false; paintPick();
      const r = root.getBoundingClientRect(), w = pickEl.offsetWidth, hh = pickEl.offsetHeight, M = 8;
      const x = Math.max(M, Math.min(cx - r.left - w / 2, r.width - w - M)), y = Math.max(M, Math.min(cy - r.top - hh - 16, r.height - hh - M)); // 손가락 위(가리지 않게)
      pickEl.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
      pickEl.querySelector('button').focus({ preventScroll: true });
    }
    function closePick() { pickAt = null; if (!pickEl.hidden) { pickEl.hidden = true; if (pickEl.contains(doc.activeElement)) doc.activeElement.blur(); } }
    function miniAt(x0, y0) {
      const r = o.mini.getBoundingClientRect(), [W, H] = o.worldSize(), k = Math.min(r.width / W, r.height / H);
      return [Math.max(0, Math.min(W, (x0 - r.left - (r.width - W * k) / 2) / k)), Math.max(0, Math.min(H, (y0 - r.top - (r.height - H * k) / 2) / k))];
    }
    function onPDown(ev) {
      if (!pickEl.hidden && !pickEl.contains(ev.target)) { // 바깥 탭 = 닫기만(전장·미니맵에 명령·카메라가 새지 않게)
        closePick();
        if (ev.target === o.main || ev.target === o.mini) { ev.preventDefault(); ev.stopPropagation(); }
        return;
      }
      if (ev.pointerType !== 'touch' || ev.target !== o.mini || !o.ping || !o.worldSize || screenOn()) return;
      clearTimeout(holdT); hold = { id: ev.pointerId, x: ev.clientX, y: ev.clientY };
      holdT = setTimeout(() => { const p = hold; hold = null; if (p) openPick(p.x, p.y, miniAt(p.x, p.y)); }, 450);
    }
    function onPMove(ev) { if (hold && ev.pointerId === hold.id && Math.hypot(ev.clientX - hold.x, ev.clientY - hold.y) > 10) { clearTimeout(holdT); hold = null; } }
    function onPUp(ev) { if (hold && ev.pointerId === hold.id) { clearTimeout(holdT); hold = null; } }
    const onPickKey = ev => { if (ev.key === 'Escape' && !pickEl.hidden) { ev.preventDefault(); ev.stopImmediatePropagation(); closePick(); } };
    addEventListener('pointerdown', onPDown, true); addEventListener('pointermove', onPMove, true);
    addEventListener('pointerup', onPUp, true); addEventListener('pointercancel', onPUp, true); addEventListener('keydown', onPickKey, true);
    let raf = 0;
    function addPing(ev) {
      pings.push({ x: +ev.x || 0, y: +ev.y || 0, kind: kindOf(ev.kind), player: ev.player, at: now(), col: cssVar(colorOf(ev.player)) });
      while (pings.length > 12) pings.shift();
      if (o.sfx) o.sfx(kindOf(ev.kind));
      if (!raf) raf = requestAnimationFrame(draw);
    }
    function fit(c, target) {
      const r = target.getBoundingClientRect();
      Object.assign(c.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
      const w = Math.round(r.width), hh = Math.round(r.height);
      if (c.width !== w || c.height !== hh) { c.width = w; c.height = hh; }
      const ctx = c.getContext('2d'); ctx.clearRect(0, 0, w, hh); return ctx;
    }
    function glyph(ctx, kind, x, y, s) { // 종류 표식: 공격 = 조준 마름모+X, 도움 = 삼각 경고, 집결 = 아래 꺾쇠
      ctx.beginPath();
      if (kind === 'attack') { ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); ctx.moveTo(x - s / 2.4, y - s / 2.4); ctx.lineTo(x + s / 2.4, y + s / 2.4); ctx.moveTo(x + s / 2.4, y - s / 2.4); ctx.lineTo(x - s / 2.4, y + s / 2.4); }
      else if (kind === 'help') { ctx.moveTo(x, y - s); ctx.lineTo(x + s, y + s * 0.8); ctx.lineTo(x - s, y + s * 0.8); ctx.closePath(); ctx.moveTo(x, y - s * 0.35); ctx.lineTo(x, y + s * 0.2); ctx.moveTo(x, y + s * 0.42); ctx.lineTo(x, y + s * 0.5); }
      else { ctx.moveTo(x - s, y - s * 0.6); ctx.lineTo(x, y + s * 0.5); ctx.lineTo(x + s, y - s * 0.6); ctx.moveTo(x, y + s * 0.5); ctx.lineTo(x, y - s * 1.3); }
    }
    function draw() {
      raf = 0;
      const t = now();
      while (pings.length && t - pings[0].at > PING_MS) pings.shift();
      const ink = cssVar('var(--color-void)'), paper = cssVar('var(--color-paper-2)'), still = RM.matches;
      if (ovMain && o.view) {
        const ctx = fit(ovMain, o.main), v = o.view(), W = ovMain.width, H = ovMain.height, f = font(), cs = getComputedStyle(doc.documentElement);
        const bar = parseFloat(cs.getPropertyValue('--bar-h')) || 0, hud = parseFloat(cs.getPropertyValue('--hud-h')) || 0;
        for (const p of pings) {
          const age = (t - p.at) / PING_MS, fade = age < 0.8 ? 1 : (1 - age) / 0.2;
          let sx = p.x - v.camX, sy = p.y - v.camY;
          const R = v.vw || W, M = 28, T = bar + M, B = H - hud - M, out = sx < M || sy < T || sx > R - M || sy > B; // 상단 바·계기 기둥에 가리지 않는 영역(R = 기둥 왼쪽 끝)
          ctx.globalAlpha = fade; ctx.strokeStyle = p.col; ctx.lineWidth = 2;
          if (out) { // 화면 밖: 가장자리에 그 방향 화살표
            const cx = W / 2, cy = H / 2, a = Math.atan2(sy - cy, sx - cx);
            sx = Math.max(M, Math.min(R - M, sx)); sy = Math.max(T, Math.min(B, sy));
            ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); ctx.fillStyle = p.col; ctx.strokeStyle = ink;
            ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-8, -9); ctx.lineTo(-4, 0); ctx.lineTo(-8, 9); ctx.closePath(); ctx.fill(); ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore();
            continue;
          }
          if (!still) for (let k = 0; k < 3; k++) { // 0.33초 간격으로 퍼지는 원 3개(1초 주기 반복)
            const ph = ((t - p.at) / 1000 - k / 3) % 1;
            if (ph < 0 || (t - p.at) / 1000 - k / 3 < 0) continue;
            ctx.globalAlpha = fade * (1 - ph); ctx.beginPath(); ctx.ellipse(sx, sy, 10 + ph * 34, (10 + ph * 34) * 0.55, 0, 0, Math.PI * 2); ctx.stroke();
          }
          ctx.globalAlpha = fade; ctx.beginPath(); ctx.ellipse(sx, sy, 14, 7.7, 0, 0, Math.PI * 2); ctx.stroke();
          const gy = sy - 30 - (still ? 0 : Math.abs(Math.sin((t - p.at) / 180)) * 4 * (1 - age));
          ctx.lineWidth = 5; ctx.strokeStyle = ink; glyph(ctx, p.kind, sx, gy, 9); ctx.stroke();
          ctx.lineWidth = 2.5; ctx.strokeStyle = p.col; glyph(ctx, p.kind, sx, gy, 9); ctx.stroke();
          const label = KINDS[p.kind] + ' · ' + nameOf(p.player);
          ctx.font = '700 12px ' + f; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const tw = ctx.measureText(label).width + 12;
          ctx.fillStyle = paper; ctx.fillRect(sx - tw / 2, gy - 32, tw, 18);
          ctx.fillStyle = p.col; ctx.fillRect(sx - tw / 2, gy - 32, 3, 18);
          ctx.fillStyle = cssVar('var(--color-ink)'); ctx.fillText(label, sx + 1.5, gy - 23);
        }
        ctx.globalAlpha = 1;
      }
      if (ovMini && o.worldSize) {
        const ctx = fit(ovMini, o.mini), [W, H] = o.worldSize(), cw = ovMini.width, ch = ovMini.height, k = Math.min(cw / W, ch / H);
        const ox = (cw - W * k) / 2, oy = (ch - H * k) / 2;
        for (const p of pings) {
          const age = (t - p.at) / PING_MS, x = ox + p.x * k, y = oy + p.y * k;
          const blink = still || Math.floor((t - p.at) / 250) % 2 === 0;
          ctx.globalAlpha = 1 - age * 0.5;
          if (!still) { const ph = ((t - p.at) / 1000) % 1; ctx.strokeStyle = p.col; ctx.lineWidth = 2; ctx.globalAlpha = (1 - ph) * (1 - age * 0.5); ctx.beginPath(); ctx.arc(x, y, 4 + ph * 14, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1 - age * 0.5; }
          if (blink) { ctx.fillStyle = ink; ctx.fillRect(Math.round(x) - 4, Math.round(y) - 4, 8, 8); ctx.fillStyle = p.col; ctx.fillRect(Math.round(x) - 3, Math.round(y) - 3, 6, 6); }
        }
        ctx.globalAlpha = 1;
      }
      if (pings.length) raf = requestAnimationFrame(draw);
    }

    // ---------- 이벤트 ----------
    function event(ev) {
      if (!ev || typeof ev.type !== 'string') return;
      switch (ev.type) {
        case 'lag': if (!screenOn()) lagStart(ev.waiting, ev.ms); break;
        case 'resume': lagEnd(true); break;
        case 'dropping': toast('연결 끊김 — 항복 처리됩니다', ev.player, 'warn'); break;
        case 'drop':
          toast('탈락 (연결 끊김)', ev.player, 'danger');
          if (lag) { lag.waiting = lag.waiting.filter(p => p !== ev.player); lag.sig = null; if (!lag.waiting.length) lagEnd(true); else lagRender(); }
          break;
        case 'dropped':
          screen('danger', '연결 끊김', '연결이 끊겨 대전에서 빠졌습니다. 다른 플레이어들은 경기를 이어 갑니다.', [], ev, { replay: true });
          break;
        case 'desync': {
          const facts = [['틱', String(ev.tick)], ['내 체크섬', hex(ev.mine)]];
          if (Number.isInteger(ev.player)) facts.push(['상대', ev.theirs && ev.theirs[ev.player] !== undefined ? hex(ev.theirs[ev.player]) : '', ev.player]);
          screen('warn', '동기화 어긋남', '모든 플레이어의 게임 상태는 같아야 하는데, 틱 ' + ev.tick + '에서 서로 다른 결과가 나와 경기를 멈췄습니다. 로그를 저장해 보내 주시면 원인을 찾는 데 쓰입니다.', facts, ev, { log: true, replay: true });
          break;
        }
        case 'mismatch': {
          const facts = [['다른 항목', String(ev.field)]];
          if (Number.isInteger(ev.player)) facts.push(['상대', '', ev.player]);
          screen('warn', '버전 불일치', '다른 버전의 게임과 연결되었습니다. 모두 같은 파일(같은 버전)로 다시 열어 주세요.', facts, ev);
          break;
        }
        case 'error':
          screen('danger', '네트워크 오류', '경기를 이어 갈 수 없는 오류가 났습니다. 로그를 저장해 보내 주시면 원인을 찾는 데 쓰입니다.',
            [['사유', String(ev.reason)], ['내용', display(ev.message || '') || '—']], ev, { log: true, replay: true });
          break;
        case 'chat': add(ev); break;
        case 'ping': addPing(ev); break;
      }
    }
    function reset() {
      lagEnd(false); close(); scr.hidden = true; logEl.textContent = ''; toasts.textContent = ''; pings.length = 0; closePick(); clearTimeout(holdT); hold = null;
    }
    function destroy() {
      reset(); for (const t of timers) clearTimeout(t); timers.clear(); cancelAnimationFrame(raf);
      removeEventListener('keydown', onKey, true); removeEventListener('mousedown', onDown, true); removeEventListener('contextmenu', onCtx, true);
      removeEventListener('pointerdown', onPDown, true); removeEventListener('pointermove', onPMove, true); removeEventListener('pointerup', onPUp, true); removeEventListener('pointercancel', onPUp, true); removeEventListener('keydown', onPickKey, true);
      for (const n of [...nodes, ovMain, ovMini]) if (n) n.remove();
    }
    return { event, open, close, add, toast, reset, destroy, get typing() { return typing; } };
  }

  // ---- ?demo=netui : 가짜 이벤트로 모든 조각을 보여 준다(네트워크 없음) ----
  function demo({ root, main, mini, view, worldSize }) {
    const names = ['하늘매', '검은별', 'Lemon_7', '<img src=x onerror=alert(1)>'], me = 0, team = [0, 0, 1, 1];
    let N, waiting = [], since = 0, st = 'running';
    const status = () => ({ state: st, waiting, waitingMs: waiting.length ? performance.now() - since : 0 });
    const W = () => worldSize(), V = () => view();
    const fire = ev => N.event(ev);
    N = create({
      root, me, main, mini, view: V, worldSize: W, status, promptMs: 8000,
      nameOf: p => names[p] || 'P' + (p + 1),
      chat: (text, scope) => {
        fire({ type: 'chat', player: me, text, scope });
        setTimeout(() => fire({ type: 'chat', player: scope === 'team' ? 1 : 2, text: scope === 'team' ? '확인, 합류합니다' : 'gg 잘 부탁해요', scope }), 1200);
      },
      ping: (x, y, kind) => fire({ type: 'ping', player: me, x, y, kind }),
      drop: ps => setTimeout(() => { for (const p of ps) { fire({ type: 'dropping', player: p }); fire({ type: 'drop', player: p, turn: 120 }); } waiting = []; }, 600),
      onMenu: () => { N.reset(); }, onSaveReplay: () => {},
      logExtra: () => ({ version: 'demo', status: status(), ua: navigator.userAgent }),
    });
    const center = () => { const v = V(), r = main.getBoundingClientRect(); return [v.camX + r.width / 2, v.camY + r.height / 2]; };
    const recent = Array.from({ length: 6 }, (_, i) => [1180 + i * 2, { player: i % 2, type: 'move', ids: [3 + i], x: 4000 + i * 64, y: 5200 }]);
    const acts = {
      lag: () => { waiting = [2, 3]; since = performance.now(); fire({ type: 'lag', waiting, ms: 500 }); },
      lagLong: () => { waiting = [2]; since = performance.now() - 9000; fire({ type: 'lag', waiting, ms: 9000 }); },
      resume: () => { waiting = []; fire({ type: 'resume', ms: 2400 }); },
      drop: () => { fire({ type: 'dropping', player: 3 }); setTimeout(() => fire({ type: 'drop', player: 3, turn: 241 }), 900); },
      dropped: () => { st = 'dropped'; fire({ type: 'dropped' }); },
      desync: () => { st = 'desync'; fire({ type: 'desync', tick: 1200, mine: 0x9a3f12c4, theirs: { 0: 0x9a3f12c4, 1: 0x1c07be55 }, player: 1, recent }); },
      mismatch: () => { st = 'mismatch'; fire({ type: 'mismatch', player: 1, field: 'v' }); },
      error: () => { st = 'error'; fire({ type: 'error', reason: 'sim', message: 'TypeError: Cannot read properties of undefined (reading \'hp\')' }); },
      chat: () => {
        fire({ type: 'chat', player: 1, text: '오른쪽 확장 먼저 갑니다', scope: 'team' });
        fire({ type: 'chat', player: 2, text: 'glhf', scope: 'all' });
        fire({ type: 'chat', player: 3, text: '<b>굵게?</b> 안 되죠 ‮olleh', scope: 'all' });
        fire({ type: 'chat', player: 0, text: '가스 먼저 올립니다, 2분에 정찰', scope: 'team' });
      },
      ping: () => { const [x, y] = center(); fire({ type: 'ping', player: 1, x: x - 160, y: y - 40, kind: 'attack' }); fire({ type: 'ping', player: 0, x: x + 120, y: y + 60, kind: 'ping' }); fire({ type: 'ping', player: 1, x: x + 2400, y: y - 300, kind: 'help' }); },
      reset: () => { st = 'running'; waiting = []; N.reset(); },
    };
    const bar = document.body.appendChild(document.createElement('div'));
    bar.className = 'nl-demo panel'; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', '네트워크 화면 데모');
    const lbl = { lag: '지연', lagLong: '지연 8초+', resume: '회복', drop: '상대 끊김', dropped: '나 끊김', desync: 'desync', mismatch: '버전', error: '오류', chat: '채팅 받기', ping: '핑 받기', reset: '초기화' };
    for (const k in acts) { const b = bar.appendChild(document.createElement('button')); b.type = 'button'; b.className = 'btn'; b.textContent = lbl[k]; b.addEventListener('mousedown', e => e.preventDefault()); b.addEventListener('click', acts[k]); }
    const show = new URLSearchParams(location.search).get('show');
    if (show) for (const k of show.split(',')) if (acts[k]) acts[k]();
    return { ui: N, fire, acts };
  }

  return { create, demo, parse, clean, display, limiter, mmss, kindOf, autoDropIn, logPayload, logName, overlayFor, KINDS, CHAT_MAX, get typing() { return typing; } };
})();
if (typeof module !== 'undefined') module.exports = NW_NETUI;
