// 네뷸라 워 — 입력 → 명령, 선택, 부대 지정, 카메라, HUD 갱신.
// DOM 전용. 시뮬레이션 상태는 읽기만 하고, 바꾸는 건 전부 명령(takeCommands)으로 내보낸다.
//
// NW_UI.create({ canvas, minimap, hud, sim, data, me, getState, render }) -> U
//   U.view            렌더러에 넘기는 view ({me, camX, camY, sel, drag, ghost, vw, vh})
//   U.takeCommands()  이번 틱 명령 배열(비움)
//   U.update(state)   매 프레임: 카메라 스크롤, 고스트, 상단 바, 선택 정보, 명령 카드
//   U.onEvents(evs)   매 틱: 죽은 엔티티를 선택/부대에서 뺀다
//   U.start() / U.stop()  게임 시작(선택·부대 초기화, 본진으로 카메라) / 입력 끄기
//   U.setSpectate(on, asObserver) / U.setVision(플레이어 번호|'all')  관전(탈락 후·리플레이): 명령 차단(선택·카메라만), 시야 기준 플레이어 전환
// 편의 기능(sim 에 명령을 보내지 않고 상태·이벤트만 읽는다):
//   공격받음 알림 — onEvents 의 attack 이벤트(틱 단위)로 판단, 화면 밖이면 가장자리 화살표·미니맵 핑(view.pings)·알림 줄·알림음.
//     같은 지역(반경 12타일) 10초(sim 200틱) 쿨다운. Space = 마지막 알림 위치로 카메라.
//   노는 일꾼 — 명령 없는 내 일꾼(가스 건물 안은 gather 명령이라 자동 제외). 버튼/F1 = 다음(순환), Shift = 전부.
//   명령 카드 툴팁 — hover(250ms)·키보드 focus(즉시), aria-describedby="nw-tip".
const NW_UI = (() => {
  const REASON = {
    crystal: '크리스탈이 부족합니다', nebula: '성운 가스가 부족합니다', supply: '보급이 부족합니다', tech: '먼저 필요한 건물을 지어야 합니다',
    larva: '유충이 없습니다', queue: '대기열이 가득 찼습니다', blocked: '놓을 수 없는 자리입니다',
    creep: '균사층 위에만 지을 수 있습니다', power: '레이 라인 위에만 지을 수 있습니다', vent: '가스 분출구 위에만 지을 수 있습니다',
    max: '이미 최고 단계입니다', busy: '지금 하는 작업이 끝나야 합니다', addon: '부속 건물이 이미 붙어 있습니다',
    unpowered: '레이 라인 밖이라 작동하지 않습니다', land: '내릴 수 없는 자리입니다', repair: '수리할 수 있는 대상이 아닙니다',
    energy: '마나가 부족합니다', research: '먼저 연구를 마쳐야 합니다', space: '수송 칸이 부족합니다', target: '그 대상에는 쓸 수 없습니다',
    pair: '같은 유닛을 둘 이상 선택해야 합니다', vis: '시야 안에만 쓸 수 있습니다',
  };
  // 3a: 모드 전환 버튼 이름, 수송 칸 크기(sim SLOTS 와 같다), 해금 연구 → 아이콘
  const MODE_LABEL = { burrow: '휴면', unburrow: '휴면 해제', siege: '정박', unsiege: '정박 해제' };
  const SLOT_N = { small: 1, medium: 2, large: 4 };
  const UNLOCK_SVG = { optcloak: 'optcloak', mindstorm: 'mindstorm', burrow: 'burrow', transport: 'load', detect: 'detect' };
  const upSvg = ef => ef.unlock ? UNLOCK_SVG[ef.unlock] || 'unlock' : ef.dmgPerLevel ? 'weapon' : 'armor';
  // 능력 아이콘 = art-icons.js 픽셀 그림(SPR 'spell@id'). 능력을 해금하는 연구도 같은 그림.
  const spellSprite = id => NW_SIM.D.abilities[id] && NW_ART.SPR['spell@' + id] ? 'spell@' + id : null;
  // 능력 한 줄 설명(툴팁) — 도감과 같은 출처(codex.js)
  const SPELL_DESC = NW_CODEX.SPELL_DESC;

  // 일꾼 건설 메뉴: [기본(B), 고급(V)]. 부속(addonOf)·변태(morphFrom)·중립 건물은 일꾼이 짓지 않으므로 넣지 않는다.
  const BUILD = {
    legion:  [['hq', 'depot', 'pump', 'garrison', 'workshop', 'drillhall', 'pillbox', 'flak'], ['motorpool', 'arsenal', 'airfield', 'labs']],
    swarm:   [['nest', 'siphon', 'vat', 'mutapit', 'tendril', 'wyrmpit'], ['roost', 'matronden', 'blightmound', 'behemothcave']],
    elysian: [['sanctum', 'resonator', 'distiller', 'portal', 'anvil', 'wardspire', 'synapse'],
              ['constructbay', 'assemblybay', 'lookout', 'skygate', 'fleetspire', 'citadel', 'sagelibrary', 'wardencourt']],
  };
  const SVG = {
    move: '<path d="M4 12h15M13 6l6 6-6 6"/>',
    stop: '<rect x="6" y="6" width="12" height="12"/>',
    hold: '<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/>',
    patrol: '<path d="M4 9h15l-4-4M20 15H5l4 4"/>',
    attack: '<circle cx="12" cy="12" r="6"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6"/>',
    build: '<path d="M3 20h18M5 20V11h14v9M9 11V6h6v5"/>',
    back: '<path d="M20 12H5M10 6l-6 6 6 6"/>',
    rally: '<path d="M6 21V4h11l-3 4 3 4H6"/>',
    build2: '<path d="M3 20h18M5 20V11h14v9M9 11V6h6v5M12 13v5M9.5 15.5h5"/>',
    repair: '<path d="M15 4a4 4 0 0 0 5 5l-10 10-4-1-1-4z"/>',
    lift: '<path d="M12 20V7M6 12l6-6 6 6M4 3h16"/>',
    land: '<path d="M12 3v13M6 11l6 6 6-6M4 21h16"/>',
    next: '<path d="M6 6l6 6-6 6M12 6l6 6-6 6"/>',
    weapon: '<path d="M4 20l3-3M6 14l4 4M9 15L20 4v4L12 16z"/>',
    armor: '<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/><path d="M9 14l3-3 3 3"/>',
    research: '<path d="M9 3h6M10 3v6l-5 11h14L14 9V3M8 15h8"/>',
    // 3a: 능력 · 모드 · 수송 · 해금 연구
    heal: '<path d="M9 4h6v5h5v6h-5v5H9v-5H4V9h5z"/>',
    mindstorm: '<path d="M6 14a4 4 0 0 1 1-8 5 5 0 0 1 9 1 3.5 3.5 0 0 1 1 7z"/><path d="M13 13l-3 4h4l-3 5"/>',
    optcloak: '<path d="M2 12c3-5 7-7 10-7s7 2 10 7c-3 5-7 7-10 7s-7-2-10-7z"/><circle cx="12" cy="12" r="3"/><path d="M4 21L20 3"/>',
    scan: '<path d="M12 2v11M8 4l4 9 4-9"/><ellipse cx="12" cy="18" rx="8" ry="3"/>',
    detect: '<path d="M2 12c3-5 7-7 10-7s7 2 10 7c-3 5-7 7-10 7s-7-2-10-7z"/><circle cx="12" cy="12" r="3"/>',
    burrow: '<path d="M12 3v9M8 8l4 4 4-4"/><path d="M3 20c3-5 15-5 18 0z"/>',
    unburrow: '<path d="M12 13V4M8 8l4-4 4 4"/><path d="M3 20c3-5 15-5 18 0z"/>',
    siege: '<path d="M3 16h14v-4H5zM9 12V9h5v3M14 10h8"/><path d="M5 16l-3 5M15 16l3 5"/>',
    unsiege: '<path d="M3 15h14v-4H5zM9 11V8h5v3M14 9h4"/><circle cx="6" cy="18" r="2"/><circle cx="14" cy="18" r="2"/>',
    load: '<path d="M4 12v8h16v-8"/><path d="M12 3v11M8 10l4 4 4-4"/>',
    unload: '<path d="M4 12v8h16v-8"/><path d="M12 15V3M8 7l4-4 4 4"/>',
    merge: '<path d="M4 4l8 8 8-8M12 12v9"/>',
    unlock: '<rect x="5" y="11" width="14" height="10"/><path d="M8 11V7a4 4 0 0 1 8 0"/>',
  };
  const svg = k => `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true">${SVG[k] || SVG.research}</svg>`;
  const ALERT_TEXT = { base: '본진이 공격받고 있습니다', worker: '일꾼이 공격받고 있습니다', unit: '유닛이 공격받고 있습니다' };
  const ALERT_R = 12, ALERT_COOL_S = 10, EDGE_MS = 2500, PING_MS = 3000, LINE_MS = 3000, TIP_DELAY = 250;
  const EDGE_SVG = '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M25 14L5 4l5 10-5 10z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="miter"/></svg>';
  const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const SCROLL = 24, EDGE = 8, MAX_SEL = 12, DBL = 300, LIFT_PX = 26; // LIFT_PX = render.js LIFT_B(띄운 건물 높이)
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const mmss = tick => { const s = Math.floor(tick / 20); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

  // 단축키: id 첫 글자, 이미 쓰였으면 id의 다음 글자(결정론적). 고정 키가 있는 항목은 그대로.
  function assignKeys(items) {
    const taken = new Set(items.filter(b => b.key).map(b => b.key));
    for (const b of items) {
      if (b.key) continue;
      for (const ch of b.id.toUpperCase()) if (ch >= 'A' && ch <= 'Z' && !taken.has(ch)) { b.key = ch; break; }
      taken.add(b.key);
    }
    return items;
  }

  function create(o) {
    const nameOf = o.nameOf || (i => 'P' + (i + 1)); // 표시 이름(textContent 로만 쓴다)
    const S = o.sim, D = o.data, R = o.render, canvas = o.canvas, mini = o.minimap, hud = o.hud;
    let me = o.me, spectate = false, seeAll = false, observer = false; // 관전: 명령 차단 · 시야 기준 me · seeAll = 전체 시야 · observer = 리플레이 시청자(소유 표시를 P 번호로)
    const TILE = S.TILE, TFP = S.TFP, FP = S.FP;
    const q = sel => hud.querySelector(sel);
    const el = { race: q('[data-hud=race]'), crystal: q('[data-hud=crystal]'), crystalWrap: q('[data-hud=crystal-wrap]'),
      supply: q('[data-hud=supply]'), supplyWrap: q('[data-hud=supply-wrap]'), clock: q('[data-hud=clock]'),
      nebula: q('[data-hud=nebula]'), nebulaWrap: q('[data-hud=nebula-wrap]'),
      info: q('[data-hud=info]'), card: q('[data-hud=card]'), notice: q('[data-hud=notice]'),
      alert: q('[data-hud=alert]'), edges: q('[data-hud=edges]'), idle: q('[data-hud=idle]'), idleIcon: q('[data-hud=idle-icon]'),
      idleN: q('[data-hud=idle-n]'), tip: q('#nw-tip'), pin: q('[data-hud=pin]'), chip: q('[data-hud=mode-chip]') };

    const view = { me, camX: 0, camY: 0, sel: [], drag: null, ghost: null, vw: 0, vh: 0, oy: 0, pings: [], marks: [] };
    // 키보드만으로(kbNav): 보이는 전장 가운데의 십자 = 커서. 방향키로 카메라를 옮겨 맞추고 Enter = 그 자리 왼쪽 클릭(선택 · 무장 실행),
    // 이동 무장 중 Enter = 우클릭 문맥 명령(채집·공격·이동). 마우스를 움직이거나 화면을 만지면 꺼진다. 키보드 조준(kbNav)이 아닐 땐 Enter 는 아무것도 안 한다(P2P 채팅 열기).
    let kbNav = false, kbOff = [0, 0]; // kbOff: 카메라가 맵 끝에 닿아 더 못 갈 때 십자가 가운데에서 벗어난 거리
    const kbCross = document.createElement('i'); kbCross.className = 'kb-cross'; kbCross.hidden = true; kbCross.setAttribute('aria-hidden', 'true'); kbCross.dataset.hud = 'kb-cross';
    const kbCenter = () => [view.vw / 2 + kbOff[0], view.oy + view.vh / 2 + kbOff[1]];
    // 방향키 한 축: 벗어난 십자를 먼저 가운데로 되돌리고, 나머지는 카메라, 카메라가 끝에 막힌 만큼 십자를 민다(보이는 전장 안에서).
    function kbAxis(d, i, lim) {
      let off = kbOff[i];
      if (off && Math.sign(d) !== Math.sign(off)) { const n = off + d; if (Math.sign(n) === Math.sign(off)) { kbOff[i] = n; return; } d = n; off = 0; }
      const k = i ? 'camY' : 'camX', c0 = view[k]; view[k] += d; clampCam();
      kbOff[i] = clamp(off + d - (view[k] - c0), -lim, lim);
    }
    // mode: null | 'move'|'attack'|'patrol'|'rally'|'repair' | {build} | {land: 건물 id}
    // page: 일꾼 카드 'main'|'build'|'build2', cpage: 건물 카드 페이지(3×3 넘칠 때)
    let cmds = [], mode = null, page = 'main', cpage = 0, groups = {}, active = false;
    let lastGroup = { n: -1, t: 0 }, lastClick = { id: 0, t: 0 }, drag = null, mmDrag = false, noticeT = 0;
    const mouse = { x: 0, y: 0, in: false, onCanvas: false, shift: false };
    // 알림: alerts = 표시 중({x, y, t0, node}), cool = 쿨다운 기록({x, y, tick}), lastAlert = Space 이동 위치
    let alerts = [], cool = [], lastAlert = null, alertT = 0, idleLast = 0, idleCount = -1;
    let tipSlot = -1, tipTimer = 0, tipSig = '';
    const keys = {};

    const st = () => o.getState();
    // HUD 치수 토큰(--bar-h · --hud-h · --dock-w · --mini)은 리사이즈 때 한 번만 읽어 캐시한다(매 프레임 getComputedStyle 금지).
    // --dock-w 는 오른쪽 계기 기둥 폭 + 바깥 여백(--space-2)까지 가린 폭으로 본다.
    let dims = null;
    function readDims() {
      const cs = getComputedStyle(document.documentElement), px = (k, d) => { const v = parseFloat(cs.getPropertyValue(k)); return Number.isFinite(v) ? v : d; };
      const dock = px('--dock-w', 0);
      dims = { bar: px('--bar-h', 36), hud: px('--hud-h', 0), dock: dock > 0 ? dock + px('--space-2', 8) : 0, mini: Math.round(px('--mini', 232)),
        ringR: px('--ring-r', 104), seg: px('--cmd', 56) };
      if (mini && dims.mini > 0 && (mini.width !== dims.mini || mini.height !== dims.mini)) { mini.width = dims.mini; mini.height = dims.mini; } // 미니맵 내부 해상도 = CSS 크기(정수 배율)
      return dims;
    }
    addEventListener('resize', () => { dims = null; });
    const hudH = () => (dims || readDims()).hud;
    const barH = () => (dims || readDims()).bar;
    const dockW = () => (dims || readDims()).dock;
    const ringDims = () => dims || readDims();
    // camY = 화면 맨 위(y=0)의 월드 y. 상단 바(oy)가 위를 덮으므로 camY는 -oy까지 내려가 월드 0행이 바 바로 아래에 온다.
    // 보이는 월드 영역은 [camX, camX+vw] × [camY+oy, camY+oy+vh] — vw 는 오른쪽 계기 기둥에 가리지 않은 폭.
    // clampCam 은 camX ≤ 월드 폭 − vw 라서 맵 오른쪽 끝이 기둥 왼쪽 가장자리까지 온다.
    function viewport() { view.oy = barH(); view.vw = Math.max(0, canvas.width - dockW()); view.vh = Math.max(0, canvas.height - hudH() - view.oy);
      const lx = Math.max(0, view.vw / 2 - 16), ly = Math.max(0, view.vh / 2 - 16); kbOff = [clamp(kbOff[0], -lx, lx), clamp(kbOff[1], -ly, ly)]; // 창 크기가 바뀌면 벗어난 십자도 새 보이는 전장 안으로
    }
    function clampCam() {
      const g = st(); if (!g) return;
      const WORLD_W = g.map.w * TILE, WORLD_H = g.map.h * TILE; // 월드 크기(px)는 현재 상태의 맵에서
      view.camX = clamp(view.camX, 0, Math.max(0, WORLD_W - view.vw)); view.camY = clamp(view.camY, -view.oy, Math.max(-view.oy, WORLD_H - view.vh - view.oy));
    }
    function centerOn(x, y) { viewport(); view.camX = x - view.vw / 2; view.camY = y - view.vh / 2 - view.oy; clampCam(); }
    const world = (sx, sy) => [view.camX + sx, view.camY + sy];
    // 명령 카드의 생산·연구·변태는 order 를 거치지 않으니 여기서 생산 시작음을 낸다(나머지 응답음은 commandAck).
    const push = c => { if (spectate) return; c.player = me; cmds.push(c); if (R.audio && PROD_SND[c.type]) R.audio.cmd(c, myRace()); };
    const PROD_SND = { train: 1, research: 1, morph: 1, merge: 1 };
    const myRace = () => { const g = st(); return g ? g.players[me].race : ''; };
    // 유닛 성격(소리만): 선택·명령한 내 유닛을 render 에 알린다(방치 투덜거림), vet = 그중 가장 많은 처치 수(고참 응답)
    const vetOf = es => R.killsOf ? es.reduce((m, e) => Math.max(m, R.killsOf(e)), 0) : 0;
    const markSeen = es => { if (R.touch) R.touch(es.map(e => e.id)); };
    const selAck = (id, es) => { if (R.audio && !spectate) { markSeen(es); R.audio.select(es.length ? es.map(e => e.def) : myRace(), id, vetOf(es)); } }; // 내 것 선택음(id = 같은 유닛 연타 감지용, 0 = 여러 개; 가장 비싼 유닛 목소리)
    const idEnts = ids => { const g = st(); return g && ids ? ids.map(id => S.byId(g, id)).filter(Boolean) : []; };
    // 명령 확인: 우클릭 문맥 명령·무장 클릭(contextCommand · loadContext · targetClick)이 낸 명령 하나마다 commandAck 가 한 번 불린다.
    // 지금은 화면 표시(view.marks — render 8b)만 띄운다. 사운드 2단계의 명령 응답음도 여기 한 곳에 붙인다.
    const MARK_MS = 450, FLASH_MS = 600, marks = []; // marks = [{x, y | id, tone, t0, ms}] — update 가 age 0..1 을 채운다
    function commandAck(c) {
      const tone = c.type === 'attack' || c.type === 'attackMove' ? 'atk' : c.type === 'cast' ? 'aim' : 'move', t0 = performance.now();
      if (c.target) marks.push({ id: c.target, tone, t0, ms: FLASH_MS, age: 0 });                          // 대상 명령: 대상 깜빡임
      else if (c.x !== undefined && c.type !== 'cast') marks.push({ x: c.x / FP, y: c.y / FP, tone, t0, ms: MARK_MS, age: 0 }); // 지점 시전은 sim 연출이 따로 있다
      if (marks.length > 12) marks.shift();
      if (R.audio) { const es = idEnts(c.ids); markSeen(es); R.audio.cmd(c, es.length ? es.map(e => e.def) : myRace(), vetOf(es)); } // 명령 응답음(명령받은 유닛 중 가장 비싼 유닛 목소리)
    }
    const order = c => { if (spectate) return; push(c); commandAck(c); };
    const mine = e => !!e && e.owner === me;

    // 플레이어 시점에서 보이는/알려진 엔티티(렌더러의 그리기 규칙과 같다)
    function explored(f, e, W) { // W: 맵 가로 타일 수
      const w = e.def.w || 2, h = e.def.h || 1; // 건물·분출구는 def 크기, 크리스탈은 2×1
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (f[(e.ty + j) * W + e.tx + i] >= 1) return true;
      return false;
    }
    function known(g, e) {
      if (e.inside) return false; // 탑승 유닛: 고르지도 그리지도 않는다(선택 중이면 update 에서 빠진다)
      if (seeAll || e.owner === me) return true;
      if (e.owner < 0) return explored(g.fog[me], e, g.map.w);
      return S.visible(g, me, e) || (e.isB && explored(g.fog[me], e, g.map.w));
    }
    const selEnts = g => view.sel.map(id => S.byId(g, id)).filter(Boolean);

    function setSel(ids) {
      view.sel = ids.slice(0, MAX_SEL);
      mode = null; page = 'main'; cpage = 0;
      selDirty = true; // 선택이 바뀌는 순간 → 링 자동 열기(updateRing)
    }

    // ---- 알림 줄 / 거부 표시 ----
    function notify(msg) {
      el.notice.textContent = msg; el.notice.classList.add('is-on');
      clearTimeout(noticeT); noticeT = setTimeout(() => el.notice.classList.remove('is-on'), 2000);
    }
    function flash(node) {
      if (!node) return;
      node.classList.remove('is-error'); void node.offsetWidth; node.classList.add('is-error');
      clearTimeout(node._t); node._t = setTimeout(() => node.classList.remove('is-error'), 600);
    }
    function reject(reason, slotBtn) {
      notify(REASON[reason] || REASON.blocked);
      if (R.audio) R.audio.play('deny', 0.6);
      if (reason === 'crystal') flash(el.crystalWrap);
      if (reason === 'nebula') flash(el.nebulaWrap);
      flash(slotBtn);
    }

    // ---- 선택 ----
    function pick(g, wx, wy) {
      let unit = null, ud = Infinity, stat = null;
      for (const e of g.ents) {
        if (!known(g, e)) continue;
        if (e.isB || e.isR) {
          const w = e.def.w || 2, h = e.def.h || 1;
          if (e.lifted) { // 띄운 건물: 실제 위치 + 높이(렌더와 같게)
            const x0 = e.x / FP - w * TILE / 2, y0 = e.y / FP - h * TILE / 2 - LIFT_PX;
            if (wx >= x0 && wx < x0 + w * TILE && wy >= y0 && wy < y0 + h * TILE) unit = unit || e;
          } else if (wx >= e.tx * TILE && wx < (e.tx + w) * TILE && wy >= e.ty * TILE && wy < (e.ty + h) * TILE) stat = e;
          continue;
        }
        const x = e.x / FP, y = e.y / FP - (e.def.air ? 20 : 0), r = e.def.radius;
        if (wx < x - r - 6 || wx > x + r + 6 || wy < y - 2 * r - 10 || wy > y + 6) continue;
        const dx = wx - x, dy = wy - (y - r), d = dx * dx + dy * dy;
        if (d < ud) { ud = d; unit = e; }
      }
      return unit || stat;
    }
    function onScreen(e) {
      const x = e.x / FP, y = e.y / FP;
      const top = view.camY + view.oy;
      return x >= view.camX && x < view.camX + view.vw && y >= top && y < top + view.vh;
    }
    function clickSelect(g, sx, sy, shift) {
      const [wx, wy] = world(sx, sy), t = pick(g, wx, wy), now = performance.now();
      if (!t) { if (!shift) setSel([]); return; }
      if (mine(t)) selAck(t.id, [t]);
      if (mine(t) && !shift && lastClick.id === t.id && now - lastClick.t < DBL) { // 더블클릭: 화면 안 같은 종류
        setSel(g.ents.filter(e => mine(e) && !e.inside && e.type === t.type && onScreen(e)).map(e => e.id));
        lastClick = { id: 0, t: 0 }; return;
      }
      lastClick = { id: t.id, t: now };
      const cur = selEnts(g);
      if (shift && mine(t) && cur.length && cur.every(mine)) {
        if (view.sel.includes(t.id)) { setSel(view.sel.filter(id => id !== t.id)); return; }
        const hasUnits = cur.some(e => !e.isB);
        if (t.isB && hasUnits) return;                       // 유닛이 있으면 건물 제외
        const keep = t.isB ? cur : cur.filter(e => !e.isB);  // 유닛을 더하면 건물은 빠진다
        setSel(keep.map(e => e.id).concat(t.id)); return;
      }
      setSel([t.id]);
    }
    function boxSelect(g, d, shift) {
      const x0 = Math.min(d.x0, d.x1) + view.camX, x1 = Math.max(d.x0, d.x1) + view.camX;
      const y0 = Math.min(d.y0, d.y1) + view.camY, y1 = Math.max(d.y0, d.y1) + view.camY;
      const inBox = e => { const x = e.x / FP, y = e.y / FP; return x >= x0 && x <= x1 && y >= y0 && y <= y1; };
      let found = g.ents.filter(e => mine(e) && !e.isB && !e.inside && inBox(e));
      if (!found.length) found = g.ents.filter(e => mine(e) && e.isB &&
        e.tx * TILE < x1 && (e.tx + e.def.w) * TILE > x0 && e.ty * TILE < y1 && (e.ty + e.def.h) * TILE > y0);
      if (!found.length) { if (!shift) setSel([]); return; } // 빈 박스 = 선택 해제
      selAck(0, found);
      if (shift) {
        const cur = selEnts(g).filter(mine), all = cur.concat(found.filter(e => !view.sel.includes(e.id)));
        const units = all.filter(e => !e.isB);
        setSel((units.length ? units : all).map(e => e.id));
      } else setSel(found.map(e => e.id));
    }

    // ---- 명령 ----
    const myUnits = g => selEnts(g).filter(e => mine(e) && !e.isB);
    const myBlds = g => selEnts(g).filter(e => mine(e) && e.isB);
    const liftedBlds = g => myBlds(g).filter(e => e.lifted);
    const movers = g => myUnits(g).concat(liftedBlds(g)); // 띄운 건물도 이동·정지 명령을 받는다
    const unitIds = g => movers(g).map(e => e.id);
    const isEnemy = (g, t) => t && S.isEnemy(g, me, t.owner);
    const engineers = g => myUnits(g).filter(e => e.def.worker && e.def.race === 'legion');
    const gasBld = t => !!t && t.isB && mine(t) && t.def.onVent && !(t.buildLeft > 0);

    function contextCommand(g, wx, wy) {
      const units = myUnits(g), blds = myBlds(g);
      const x = Math.round(wx * FP), y = Math.round(wy * FP);
      if (!units.length) {
        const lf = liftedBlds(g);
        if (lf.length) order({ type: 'move', ids: lf.map(e => e.id), x, y });
        else if (blds.length) order({ type: 'setRally', ids: blds.map(e => e.id), x, y });
        return;
      }
      const t = pick(g, wx, wy), ids = units.map(e => e.id), eng = engineers(g);
      if (loadContext(g, units, t)) return;
      if (isEnemy(g, t)) order({ type: 'attack', ids, target: t.id });
      else if (t && (t.type === 'crystal' || gasBld(t)) && units.some(e => e.def.worker)) order({ type: 'gather', ids, target: t.id });
      else if (eng.length && S.canRepair(g, me, t)) { // 문맥 수리: 엔지니어는 수리, 나머지는 그 자리로 이동
        order({ type: 'repair', ids: eng.map(e => e.id), target: t.id });
        const rest = units.filter(e => !eng.includes(e)).map(e => e.id);
        if (rest.length) order({ type: 'move', ids: rest, x, y });
      } else order({ type: 'move', ids, x, y });
    }
    // 3a 수송 문맥: 내 수송선 우클릭 = 선택 지상 유닛 탑승 / 수송선 선택 중 내 지상 유닛 우클릭 = 태우러 감
    const groundy = e => !e.isB && !e.def.air && !e.def.transport;
    const carriers = g => myUnits(g).filter(e => e.def.transport);
    function loadContext(g, units, t) {
      if (!t || !mine(t) || t.isB) return false;
      if (t.def.transport && !view.sel.includes(t.id)) {
        const riders = units.filter(groundy); if (!riders.length) return false;
        const r = S.canLoad(g, me, t, riders[0]);
        if (r === 'research') reject('research');
        else if (riders.every(u => S.canLoad(g, me, t, u) === 'space')) reject('space'); // 한 기도 못 탐(꽉 참)
        else order({ type: 'load', ids: riders.map(e => e.id), target: t.id });
        return true;
      }
      const cs = units.filter(e => e.def.transport);
      if (cs.length && groundy(t) && !view.sel.includes(t.id)) {
        const r = S.canLoad(g, me, cs[0], t);
        if (r === 'research') reject('research');
        else if (cs.every(c => S.canLoad(g, me, c, t) === 'space')) reject('space');
        else order({ type: 'load', ids: cs.map(e => e.id), target: t.id });
        return true;
      }
      return false;
    }
    // 3a 시전: 선택 중 그 능력을 가진 내 유닛·완성 건물(전원 시전 — 시전 가능 여부는 sim 이 각자 판정)
    const casters = (g, what) => selEnts(g).filter(e => mine(e) && !(e.buildLeft > 0) && (e.def.abilities || []).includes(what));
    const mechDef = d => d.race === 'legion' && !!d.armorUpgrade && d.armorUpgrade !== 'legion_infantry_armor'; // sim mech 와 같다
    function castOk(g, e, A, t) { // sim castTarget + 치료는 다친 대상만
      if (!t || !(t.hp > 0) || t.isR || t.inside || (t.stf & S.STF.stasis) || !known(g, t)) return false;
      const f = A.filter || 'any';
      if (f === 'enemy' && !S.isEnemy(g, e.owner, t.owner)) return false;
      if (f === 'ally' && (t.owner < 0 || S.isEnemy(g, e.owner, t.owner) || t.isB)) return false;
      if (f === 'ally-bio' && (t.owner < 0 || S.isEnemy(g, e.owner, t.owner) || t.isB || t.def.air || mechDef(t.def) || t === e)) return false;
      return !(A.effect.kind === 'instant' && A.effect.heal) || t.hp < t.hpMax;
    }
    function castAt(g, wx, wy, shift) {
      const what = mode.cast, A = D.abilities[what], cs = casters(g, what), ids = cs.map(e => e.id);
      if (!cs.length) { mode = null; return; }
      if (A.target === 'unit') {
        const t = pick(g, wx, wy);
        if (!cs.some(e => castOk(g, e, A, t))) { reject('target', slotOf(what)); return; }
        order({ type: 'cast', ids, what, target: t.id });
      } else {
        const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE); // sim seen 과 같다: 지점 타일이 내 팀 시야(2)
        if (A.needVis && A.target === 'point' && !(tx >= 0 && ty >= 0 && tx < g.map.w && ty < g.map.h && g.fog[me] && g.fog[me][ty * g.map.w + tx] === 2)) { reject('vis', slotOf(what)); return; }
        order({ type: 'cast', ids, what, x: Math.round(wx * FP), y: Math.round(wy * FP) });
      }
      if (!shift) mode = null;
    }
    function nearestWorker(g, tx, ty) {
      let best = null, bd = Infinity;
      for (const e of myUnits(g)) {
        if (!e.def.worker || !S.canCommand(e, me)) continue; // sim 명령 가능 판정과 동일(건설·탑승·잠복 중 제외)
        const dx = e.x / TFP - tx, dy = e.y / TFP - ty, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; best = e; }
      }
      return best;
    }
    // 고스트 좌상단 타일. 가스 건물은 커서 근처(4타일) 아는 분출구에 붙는다.
    function ghostTile(g, wx, wy, what) {
      const d = D.buildings[what];
      if (d.onVent) {
        let best = null, bd = 16;
        for (const v of g.ents) {
          if (v.type !== 'vent' || !known(g, v)) continue;
          const dx = wx / TILE - (v.tx + v.def.w / 2), dy = wy / TILE - (v.ty + v.def.h / 2), dd = dx * dx + dy * dy;
          if (dd < bd) { bd = dd; best = v; }
        }
        if (best) return [best.tx, best.ty];
      }
      return [clamp(Math.round(wx / TILE - d.w / 2), 0, g.map.w - d.w), clamp(Math.round(wy / TILE - d.h / 2), 0, g.map.h - d.h)];
    }
    function landOk(g, what, tx, ty) {
      const d = D.buildings[what];
      for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) if (!S.walkable(g, tx + i, ty + j)) return false;
      return true;
    }
    function targetClick(g, wx, wy, shift) {
      const x = Math.round(wx * FP), y = Math.round(wy * FP), ids = unitIds(g);
      if (mode.cast) { castAt(g, wx, wy, shift); return; }
      if (mode.unload) { order({ type: 'unload', ids: carriers(g).map(e => e.id), x, y }); if (!shift) mode = null; return; }
      if (mode.load) {
        const t = pick(g, wx, wy), cs = carriers(g);
        if (!t || !mine(t) || !groundy(t) || !cs.length) { reject('target', slotOf('load')); return; }
        const r = S.canLoad(g, me, cs[0], t);
        if (r === 'research' || r === 'tech') { reject(r === 'research' ? 'research' : 'target', slotOf('load')); return; }
        if (cs.every(c => S.canLoad(g, me, c, t) === 'space')) { reject('space', slotOf('load')); return; }
        order({ type: 'load', ids: cs.map(e => e.id), target: t.id });
        if (!shift) mode = null;
        return;
      }
      if (mode.build) {
        const [tx, ty] = ghostTile(g, wx, wy, mode.build), w = nearestWorker(g, tx, ty);
        if (!w) { mode = null; return; }
        const r = S.canPlace(g, me, mode.build, tx, ty, w.id);
        if (r) { reject(r, slotOf(mode.build)); return; }
        order({ type: 'build', ids: [w.id], what: mode.build, tx, ty });
        if (!shift) { mode = null; page = 'main'; }
        return;
      }
      if (mode.land) {
        const b = S.byId(g, mode.land);
        if (!b || !b.lifted) { mode = null; return; }
        const [tx, ty] = ghostTile(g, wx, wy, b.type);
        if (!landOk(g, b.type, tx, ty)) { reject('land', slotOf('land')); return; }
        order({ type: 'land', ids: [b.id], tx, ty }); mode = null;
        return;
      }
      if (mode === 'rally') order({ type: 'setRally', ids: myBlds(g).map(e => e.id), x, y });
      else if (mode === 'repair') {
        const t = pick(g, wx, wy);
        if (!S.canRepair(g, me, t)) { reject('repair', slotOf('repair')); return; }
        order({ type: 'repair', ids: engineers(g).map(e => e.id), target: t.id });
      } else if (mode === 'attack') {
        const t = pick(g, wx, wy);
        if (isEnemy(g, t)) order({ type: 'attack', ids, target: t.id }); else order({ type: 'attackMove', ids, x, y });
      } else if (mode === 'patrol') order({ type: 'patrol', ids, x, y });
      else if (mode === 'move') order({ type: 'move', ids, x, y });
      if (!shift) mode = null;
    }

    // ---- 명령 카드 ----
    // 이번 틱에 이미 쌓였지만 sim이 아직 처리하지 않은 명령분. train은 sim의 canTrain(pend)이 직접 반영하고,
    // 연구·변태·부속·띄우기는 같은 건물(b)·같은 연구(r)를 이번 틱 동안 '진행 중'으로 본다.
    const freshPend = () => ({ crystal: 0, nebula: 0, supply2: 0, n: {}, b: {}, r: {} });
    let pend = freshPend();
    const pay = cost => { pend.crystal += cost.crystal || 0; pend.nebula += cost.nebula || 0; };
    function short(g, cost) { // 버튼 상태용 자원 확인(크리스탈 먼저 — sim shortOf와 같은 순서), 대기분 포함
      const p = g.players[me];
      if (p.crystal - pend.crystal < (cost.crystal || 0)) return 'crystal';
      if (p.nebula - pend.nebula < (cost.nebula || 0)) return 'nebula';
      return '';
    }
    function buildReason(g, what) {
      const d = D.buildings[what];
      for (const r of d.requires || []) if (!S.hasTech(g, me, r)) return 'tech';
      return short(g, d.cost);
    }
    const costParts = c => ['크리스탈 ' + (c.crystal || 0)].concat(c.nebula ? ['가스 ' + c.nebula] : []);
    function costText(def, key) {
      const parts = [def.name].concat(costParts(def.cost));
      if (def.supply) parts.push('보급 ' + def.supply * (def.count || 1));
      return parts.join(' · ') + ' · [' + key + ']';
    }
    // 사유 우선순위: 기술·최고 단계 → 이번 틱 대기 중(busy) → 레이 라인 밖 → 그 밖의 sim 사유(자원 등)
    const busyNow = (b, r) => r === 'tech' || r === 'max' ? r : pend.b[b.id] ? 'busy' : b.unpowered ? 'unpowered' : r;
    function trainReason(g, b, w) {
      return busyNow(b, S.canTrain(g, me, b, w, { crystal: pend.crystal, nebula: pend.nebula, supply2: pend.supply2, n: pend.n[b.id] || 0 }));
    }
    function pushTrain(b, w) {
      const u = D.units[w]; pay(u.cost); pend.supply2 += Math.round((u.supply || 0) * 2) * (u.count || 1);
      pend.n[b.id] = (pend.n[b.id] || 0) + 1; push({ type: 'train', ids: [b.id], what: w });
    }
    const researchReason = (g, b, id) => busyNow(b, S.canResearch(g, me, b, id) || (pend.r[id] ? 'busy' : '') || short(g, D.upgrades[id].cost[g.players[me].up[id] || 0]));
    const morphReason = (g, b, w) => busyNow(b, S.canMorph(g, me, b, w) || short(g, D.buildings[w].cost));
    const addonReason = (g, b, w) => busyNow(b, S.canAddon(g, me, b, w) || short(g, D.buildings[w].cost));
    function trainers(g) { // 같은 종류(첫 선택 건물 기준) 완성 건물
      const blds = myBlds(g); if (!blds.length) return [];
      return blds.filter(b => b.type === blds[0].type && !(b.buildLeft > 0));
    }
    // 변태 계보까지 포함한 연구 목록(정점지는 성숙지 연구도 한다)
    function researchesOf(type) {
      const out = [];
      for (let t = type; t; t = D.buildings[t].morphFrom) for (const id of D.buildings[t].researches || []) if (!out.includes(id)) out.push(id);
      return out;
    }
    const ADDONS = {}, MORPHS = {};
    for (const d of Object.values(D.buildings)) {
      if (d.addonOf) (ADDONS[d.addonOf] = ADDONS[d.addonOf] || []).push(d.id);
      if (d.morphFrom) (MORPHS[d.morphFrom] = MORPHS[d.morphFrom] || []).push(d.id);
    }
    const lvOf = (g, id) => g.players[me].up[id] || 0;
    const qTotal = (g, owner, it) => it.research ? D.upgrades[it.research].time[Math.min(D.upgrades[it.research].levels - 1, g.players[owner].up[it.research] || 0)] : D.units[it.what].time;
    // 후보 중 가능한 첫 건물(대기열 짧은 순 → id 순)에 실행, 없으면 첫 사유로 거부
    function runOn(g, tr, reasonFn, id, act) {
      const ok = tr.filter(b => !reasonFn(g, b, id)).sort((a, c) => (a.queue.length - c.queue.length) || a.id - c.id);
      if (ok.length) act(ok[0]); else reject(reasonFn(g, tr[0], id), slotOf(id));
    }
    // 건물 카드 항목: 생산 → 변태 → 연구 → 부속 → 띄우기 → 집결지. 3×3을 넘으면 8개씩 페이지 + 9번째 칸 다음/뒤로.
    function bldItems(g, tr) {
      const b0 = tr[0], items = [];
      const best = fn => { const rs = tr.map(fn); return rs.indexOf('') >= 0 ? '' : rs[0]; };
      for (const w of b0.def.trains || []) items.push({ id: w, sprite: w, label: D.units[w].name, kind: 'train', src: 'unit',
        reason: best(b => trainReason(g, b, w)), title0: () => costText(D.units[w], '?'),
        prog: () => { let p = -1; for (const b of tr) for (const it of b.queue) if (it.what === w) p = Math.max(p, 1 - it.left / D.units[w].time); return p; },
        run: () => {
          const cand = tr.filter(t => !trainReason(g, t, w))
            .sort((a, c) => (a.def.larva ? (c.larva - (pend.n[c.id] || 0)) - (a.larva - (pend.n[a.id] || 0)) : (a.queue.length + (pend.n[a.id] || 0)) - (c.queue.length + (pend.n[c.id] || 0))) || a.id - c.id);
          if (cand.length) pushTrain(cand[0], w); else reject(trainReason(g, tr[0], w), slotOf(w));
        } });
      for (const what of b0.def.abilities || []) items.push(abilityItem(g, what, tr));
      for (const w of MORPHS[b0.type] || []) { const d = D.buildings[w]; items.push({ id: w, sprite: w, label: d.name, kind: 'morph', src: 'bld',
        reason: best(b => morphReason(g, b, w)), title0: () => '변태: ' + d.name + ' · ' + costParts(d.cost).join(' · '),
        prog: () => { let p = -1; for (const b of tr) if (b.morph && b.morph.to === w) p = Math.max(p, 1 - b.morph.left / d.time); return p; },
        run: () => runOn(g, tr, morphReason, w, b => { pay(d.cost); pend.b[b.id] = 1; push({ type: 'morph', ids: [b.id], what: w }); }) }); }
      for (const id of researchesOf(b0.type)) {
        const u = D.upgrades[id], lv = lvOf(g, id), maxed = lv >= u.levels, ef = u.effect;
        const lvTxt = u.levels > 1 ? ' ' + Math.min(lv + 1, u.levels) + '/' + u.levels + '단계' : '';
        items.push({ id, label: u.name, lv: u.levels > 1 ? Math.min(lv + 1, u.levels) + '/' + u.levels : '', kind: 'research', src: 'up', maxed,
          sprite: ef.unit || spellSprite(ef.unlock), svg: ef.unit ? null : upSvg(ef),
          reason: maxed ? 'max' : best(b => researchReason(g, b, id)),
          title0: () => '연구: ' + u.name + lvTxt + (maxed ? ' · 완료' : ' · ' + costParts(u.cost[lv]).join(' · ')),
          prog: () => { for (const e of g.ents) if (e.owner === me && e.isB) for (const it of e.queue) if (it.research === id) return 1 - it.left / u.time[Math.min(lv, u.levels - 1)]; return -1; },
          run: () => maxed ? reject('max', slotOf(id)) : runOn(g, tr, researchReason, id, b => { pay(u.cost[lv]); pend.r[id] = 1; push({ type: 'research', ids: [b.id], what: id }); }) });
      }
      for (const w of ADDONS[b0.type] || []) { const d = D.buildings[w]; items.push({ id: w, sprite: w, label: d.name, kind: 'addon', src: 'bld',
        reason: best(b => addonReason(g, b, w)), title0: () => '부속: ' + d.name + ' · ' + costParts(d.cost).join(' · '),
        prog: () => { let p = -1; for (const b of tr) { const a = b.addon && S.byId(g, b.addon); if (a && a.type === w && a.buildLeft > 0) p = Math.max(p, 1 - a.buildLeft / d.time); } return p; },
        run: () => runOn(g, tr, addonReason, w, b => { pay(d.cost); pend.b[b.id] = 1; push({ type: 'build', ids: [b.id], what: w }); }) }); }
      if (b0.def.lift) items.push({ id: 'lift', key: 'L', svg: 'lift', label: '띄우기', note: '띄운 뒤 이동해서 다른 곳에 내릴 수 있다', reason: best(b => busyNow(b, S.canLift(g, me, b))), title0: () => '띄우기 — 이동해서 다른 곳에 내릴 수 있다',
        run: () => { const ids = tr.filter(b => !busyNow(b, S.canLift(g, me, b))).map(b => b.id); for (const id of ids) pend.b[id] = 1; if (ids.length) push({ type: 'lift', ids }); } });
      if (b0.def.trains) items.push({ id: 'rally', svg: 'rally', label: '집결지', note: '생산된 유닛이 모일 곳 · 우클릭으로도 지정', armed: mode === 'rally', title0: () => '집결지 · 우클릭으로도 지정',
        run: () => { mode = mode === 'rally' ? null : 'rally'; } });
      return items;
    }
    // ---- 3a 명령 카드 항목: 능력 · 모드 전환 · 수송 · 합체 · 유닛 변태 ----
    const MERGE_U = {}, MORPH_U = {};
    for (const u of Object.values(D.units)) {
      if (u.mergeFrom) MERGE_U[u.mergeFrom] = u.id;
      if (u.morphFrom) (MORPH_U[u.morphFrom] = MORPH_U[u.morphFrom] || []).push(u.id);
    }
    const anyOk = rs => rs.includes('') ? '' : rs[0];
    // 능력 버튼: 왼쪽 위 = 마나 비용. 하나라도 시전 가능하면 활성(전원 시전). 우클릭 = 자동 시전 토글.
    function abilityItem(g, what, list) {
      const A = D.abilities[what], c0 = list[0], ids = list.map(e => e.id);
      const reason = anyOk(list.map(e => S.canCast(g, me, e, what)));
      const on = !!A.toggle && g.fx.some(f => f.ab === what && f.tgt === c0.id);
      const auto = !!A.autocast && c0.auto === what;
      return { id: what, svg: what, sprite: spellSprite(what), label: A.name, lv: A.cost ? String(A.cost) : '', kind: 'ability', src: 'ab', reason, auto, on,
        armed: on || !!(mode && mode.cast === what), reqUp: A.requires,
        run: () => {
          if (reason) { reject(reason, slotOf(what)); return; }
          if (A.target === 'self') { mode = null; push({ type: 'cast', ids, what }); }
          else mode = mode && mode.cast === what ? null : { cast: what };
        },
        alt: A.autocast ? () => push({ type: 'autocast', ids, what, on: !auto }) : null };
    }
    function unitExtras(g, units) {
      const u0 = units[0], d0 = u0.def, same = units.filter(e => e.type === u0.type), ids = same.map(e => e.id), out = [];
      for (const what of d0.abilities || []) out.push(abilityItem(g, what, same));
      for (const m of Object.keys(d0.modes || {})) {
        if (d0.modes[m].auto) continue; // 자동 정박: 버튼 없음(멈추면 스스로 정박, 움직이면 풀린다)
        const cur = u0.modeT > 0 ? u0.modeTo === m : u0.mode === m, cmd = cur ? 'un' + m : m;
        const reason = anyOk(same.map(e => S.canMode(g, me, e, cmd)));
        out.push({ id: cmd, svg: cmd, label: MODE_LABEL[cmd] || cmd, kind: 'mode', reason, reqUp: cur ? null : d0.modes[m].requires,
          note: m === 'burrow' ? (cur ? '땅 위로 나온다' : '땅속에 숨는다 · 적에게는 탐지기로만 보인다') : cur ? '다시 움직일 수 있게 된다' : '제자리에 고정 · 사거리가 크게 늘어난다',
          run: () => { if (reason) reject(reason, slotOf(cmd)); else { mode = null; push({ type: cmd, ids }); } } });
      }
      if (d0.transport) {
        const cs = units.filter(e => e.def.transport), req = d0.transportReq && !g.players[me].up[d0.transportReq] ? 'research' : '';
        const cargoN = cs.reduce((k, c) => k + S.cargo(g, c).length, 0);
        out.push({ id: 'load', svg: 'load', label: '태우기', kind: 'mode', reason: req, reqUp: d0.transportReq, armed: !!(mode && mode.load),
          note: '태울 내 지상 유닛을 클릭 · 지상 유닛을 고르고 수송선을 우클릭해도 탄다',
          run: () => { if (req) reject(req, slotOf('load')); else mode = mode && mode.load ? null : { load: true }; } });
        out.push({ id: 'unload', svg: 'unload', label: '내리기', kind: 'mode', reason: req || (cargoN ? '' : 'target'), armed: !!(mode && mode.unload),
          note: '내릴 지점을 클릭 · 선택 창의 탑승 유닛을 누르면 그 한 기만 내린다',
          run: () => { if (req) reject(req, slotOf('unload')); else if (!cargoN) reject('target', slotOf('unload')); else mode = mode && mode.unload ? null : { unload: true }; } });
      }
      const mg = MERGE_U[u0.type];
      if (mg) {
        const ok = same.filter(e => !e.morph && !e.inside && !e.mode && !(e.modeT > 0)), reason = ok.length >= 2 ? '' : 'pair';
        out.push({ id: 'merge', sprite: mg, label: '합체', kind: 'morph', reason, note: '둘씩 짝지어 ' + D.units[mg].name + '(으)로 합체한다',
          run: () => { if (reason) reject(reason, slotOf('merge')); else { mode = null; push({ type: 'merge', ids: ok.map(e => e.id) }); } } });
      }
      for (const w of MORPH_U[u0.type] || []) {
        const d = D.units[w], reason = anyOk(same.map(e => S.canMorph(g, me, e, w)));
        out.push({ id: w, sprite: w, label: d.name, kind: 'morph', src: 'unit', from: u0.type, reason,
          title0: () => '변태: ' + d.name + ' · ' + costParts(d.cost).join(' · '),
          prog: () => { let p = -1; for (const e of same) if (e.morph && e.morph.to === w) p = Math.max(p, 1 - e.morph.left / d.time); return p; },
          run: () => {
            const ok = same.filter(e => !S.canMorph(g, me, e, w));
            if (!ok.length) { reject(reason || 'busy', slotOf(w)); return; }
            mode = null; push({ type: 'morph', ids: ok.map(e => e.id), what: w });
          } });
      }
      return out;
    }
    function layout(items) { // 페이지 나누기 + 단축키(페이지가 바뀌어도 같은 항목은 같은 키)
      const pages = [];
      if (items.length <= 9) {
        const ral = items.find(b => b.id === 'rally'), rest = items.filter(b => b !== ral);
        rest.forEach((b, i) => { b.slot = i; }); if (ral) ral.slot = 8;
        pages.push(items);
      } else {
        for (let i = 0; i < items.length; i += 8) pages.push(items.slice(i, i + 8).map((b, k) => Object.assign(b, { slot: k })));
        pages.forEach((pg, i) => pg.push(i < pages.length - 1
          ? { id: 'next', slot: 8, key: 'N', svg: 'next', label: '다음 ' + (i + 1) + '/' + pages.length, title0: () => '다음 명령 ' + (i + 2) + '/' + pages.length, run: () => { cpage = i + 1; } }
          : { id: 'back', slot: 8, key: 'ESCAPE', keyLabel: 'Esc', svg: 'back', label: '뒤로', title0: () => '처음 명령으로', run: () => { cpage = 0; } }));
      }
      assignKeys(pages.flat());
      for (const b of pages.flat()) {
        const t = b.title0 ? b.title0() : b.label;
        b.title = t.includes('[?]') ? t.replace('[?]', '[' + (b.keyLabel || b.key) + ']') : t + ' · [' + (b.keyLabel || b.key) + ']';
      }
      cpage = Math.min(cpage, pages.length - 1);
      return pages[cpage];
    }
    function card(g) {
      if (spectate) return [];
      const units = myUnits(g);
      if (units.length) {
        const workers = units.some(e => e.def.worker), race = g.players[me].race;
        if ((page === 'build' || page === 'build2') && workers) {
          const list = BUILD[race][page === 'build' ? 0 : 1].filter(w => D.buildings[w] && !D.buildings[w].neutral && !D.buildings[w].addonOf && !D.buildings[w].morphFrom);
          const btns = list.map((w, i) => ({ id: w, slot: i, sprite: w, label: D.buildings[w].name, src: 'bld',
            reason: buildReason(g, w), armed: !!(mode && mode.build === w),
            run: b => { if (b.reason) reject(b.reason, slotOf(w)); else mode = { build: w }; } }));
          assignKeys(btns);
          for (const b of btns) b.title = costText(D.buildings[b.id], b.key);
          btns.push({ id: 'back', slot: 8, key: 'ESCAPE', keyLabel: 'Esc', svg: 'back', label: '뒤로', title: '뒤로 · [Esc]', run: () => { mode = null; page = 'main'; } });
          return btns;
        }
        if (page !== 'main') page = 'main';
        const arm = m => () => { mode = mode === m ? null : m; };
        const btns = [
          { id: 'move', slot: 0, key: 'M', svg: 'move', label: '이동', run: arm('move'), armed: mode === 'move' },
          { id: 'stop', slot: 1, key: 'S', svg: 'stop', label: '정지', run: () => { mode = null; push({ type: 'stop', ids: unitIds(g) }); } },
          { id: 'attack', slot: 2, key: 'A', svg: 'attack', label: '공격', run: arm('attack'), armed: mode === 'attack' },
          { id: 'patrol', slot: 3, key: 'P', svg: 'patrol', label: '순찰', run: arm('patrol'), armed: mode === 'patrol' },
          { id: 'hold', slot: 4, key: 'H', svg: 'hold', label: '위치 사수', run: () => { mode = null; push({ type: 'hold', ids: unitIds(g) }); } },
        ];
        if (engineers(g).length) btns.push({ id: 'repair', slot: 5, key: 'R', svg: 'repair', label: '수리', note: '우클릭으로도 수리', run: arm('repair'), armed: mode === 'repair' });
        if (workers) {
          btns.push({ id: 'build', slot: 6, key: 'B', svg: 'build', label: '기본 건설', run: () => { mode = null; page = 'build'; } });
          btns.push({ id: 'build2', slot: 7, key: 'V', svg: 'build2', label: '고급 건설', run: () => { mode = null; page = 'build2'; } });
        }
        const free = [5, 6, 7, 8].filter(i => !btns.some(b => b.slot === i));
        for (const it of unitExtras(g, units)) { if (!free.length) break; it.slot = free.shift(); btns.push(it); }
        assignKeys(btns);
        for (const b of btns) { const t0 = b.title0 ? b.title0() : b.label; b.title = t0 + ' · [' + b.key + ']' + (b.id === 'repair' ? ' · 우클릭으로도 수리' : ''); }
        return btns;
      }
      const lf = liftedBlds(g);
      if (lf.length) { // 띄운 건물: 이동·정지·착륙
        const b0 = lf[0];
        const btns = [
          { id: 'move', slot: 0, key: 'M', svg: 'move', label: '이동', run: () => { mode = mode === 'move' ? null : 'move'; }, armed: mode === 'move' },
          { id: 'stop', slot: 1, key: 'S', svg: 'stop', label: '정지', run: () => { mode = null; push({ type: 'stop', ids: unitIds(g) }); } },
          { id: 'land', slot: 2, key: 'L', svg: 'land', label: '착륙', note: '내릴 자리를 클릭', armed: !!(mode && mode.land), run: () => { mode = mode && mode.land ? null : { land: b0.id }; } },
        ];
        for (const b of btns) b.title = b.label + ' · [' + b.key + ']';
        return btns;
      }
      const tr = trainers(g);
      if (!tr.length) return [];
      return layout(bldItems(g, tr));
    }

    const SLOT_DEG = [250, 290, 330, 10, 50, 130, 170, 210, 90]; // 슬롯 → 화면 각도(0° = 3시, 시계 방향) — index.html #ring .seg[data-slot] 의 --a 와 같다
    // 명령 링: 칸 9개를 한 번 만들고 칸마다 내용만 바꾼다(클릭 중 DOM 교체 방지). 칸 자리는 CSS 가 슬롯 번호로 고정 각도에 놓는다.
    const slots = [];
    let curBtns = [], crumbSig = null, roving = 0, segHold = 0, segHeld = -1; // roving = 링에서 Tab 순서에 들어가는 칸 하나(로빙 tabindex)
    el.card.innerHTML = '<div class="ring-orbit" aria-hidden="true"></div><p class="ring-crumb" aria-hidden="true"><span class="ring-crumb-t"></span><span class="kbd ring-crumb-k"></span></p>';
    const crumbT = el.card.querySelector('.ring-crumb-t'), crumbK = el.card.querySelector('.ring-crumb-k');
    for (let i = 0; i < 9; i++) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'btn seg'; b.hidden = true; b.tabIndex = -1; b.dataset.slot = i;
      if (i === 8) b.dataset.tail = '';
      b.innerHTML = '<span class="seg-lv"></span><span class="seg-icon"></span><span class="seg-name"></span><span class="seg-prog"></span><span class="seg-key" aria-hidden="true"></span>';
      b.addEventListener('click', ev => {
        if (segHeld === i) { segHeld = -1; return; } // 길게 눌러 시트를 띄운 손가락을 뗀 클릭 — 실행하지 않는다
        const d = curBtns.find(x => x.slot === i); if (d && active) { runBtn(d); if (!ev.detail) kbArm(); } // detail 0 = 키보드 Enter/Space
      });
      b.addEventListener('mousedown', ev => ev.preventDefault()); // 캔버스 단축키 흐름 유지(포커스 이동 안 함)
      b.addEventListener('contextmenu', ev => { ev.preventDefault(); if (touchRecent()) return; const d = curBtns.find(x => x.slot === i); if (d && d.alt && active) { d.alt(); flashPress(b); } }); // 자동 시전 토글(터치의 길게 누르기는 시트가 맡는다)
      // 터치: 길게 누르기(450ms) = 툴팁을 아래 시트로 + 자동 시전 토글 버튼(설계서 §4.8)
      b.addEventListener('pointerdown', ev => { if (!isTouch(ev)) return; segHeld = -1; clearTimeout(segHold); segHold = setTimeout(() => { segHeld = i; openSheet(i); }, LONG_MS); });
      b.addEventListener('pointerup', () => clearTimeout(segHold));
      b.addEventListener('pointercancel', () => clearTimeout(segHold));
      b.addEventListener('mouseenter', () => { if (touchRecent()) return; clearTimeout(tipTimer); tipTimer = setTimeout(() => showTip(i), TIP_DELAY); });
      b.addEventListener('mouseleave', () => hideTip(i));
      b.addEventListener('focus', () => { roving = i; showTip(i); }); // 키보드 포커스는 지연 없이
      b.addEventListener('blur', () => hideTip(i));
      el.card.appendChild(b); slots.push({ node: b, sig: '' });
    }
    const slotOf = id => { const d = curBtns.find(x => x.id === id); return d ? slots[d.slot].node : null; };
    function runBtn(d) { const g = st(); if (g) d.run(d, g); }
    // 머리표: 링이 지금 무엇을 보여 주는지 한 줄 — "부대 6 · 캔터 2 · 오스블레이드 4" / "캔터" / "기본 건설" + Esc 뒤로 / "관문 · 1/2". 링 aria-label 도 같은 문구.
    function crumbOf(g) {
      const units = myUnits(g);
      if (units.length) {
        if (page === 'build' || page === 'build2') return [page === 'build' ? '기본 건설' : '고급 건설', 'Esc 뒤로'];
        if (units.length === 1) return [units[0].def.name, ''];
        const n = new Map(); for (const e of units) n.set(e.def.name, (n.get(e.def.name) || 0) + 1);
        return [['부대 ' + units.length].concat([...n].map(([k, v]) => k + ' ' + v)).join(' · '), ''];
      }
      const lf = liftedBlds(g);
      if (lf.length) return [lf[0].def.name + (lf.length > 1 ? ' ' + lf.length : '') + ' · 떠 있음', ''];
      const tr = trainers(g), tail = curBtns.find(x => x.slot === 8);
      if (!tr.length) return ['', ''];
      const m = tail && tail.id === 'next' && /(\d+)\/(\d+)$/.exec(tail.label);
      const pg = m ? ' · ' + m[1] + '/' + m[2] : tail && tail.id === 'back' && cpage > 0 ? ' · ' + (cpage + 1) + '/' + (cpage + 1) : '';
      return [tr[0].def.name + (tr.length > 1 ? ' ' + tr.length : '') + pg, cpage > 0 ? 'Esc 처음으로' : ''];
    }
    function renderCard(g) {
      curBtns = card(g);
      for (let i = 0; i < 9; i++) {
        const s = slots[i], d = curBtns.find(x => x.slot === i), n = s.node;
        if (!d) { if (s.sig) { n.hidden = true; s.sig = ''; n.classList.remove('is-auto', 'is-short'); } continue; }
        const sig = d.id + '|' + d.key + '|' + d.label + '|' + (d.lv || '');
        if (sig !== s.sig) {
          s.sig = sig; n.hidden = false;
          n.querySelector('.seg-key').textContent = d.keyLabel || d.key;
          const ic = n.querySelector('.seg-icon'); ic.innerHTML = '';
          if (d.sprite) ic.appendChild(R.icon(d.sprite, me, 32)); else ic.innerHTML = svg(d.svg);
          n.querySelector('.seg-name').textContent = d.label;
          n.querySelector('.seg-lv').textContent = d.lv || '';
          n.dataset.kind = d.kind || '';
        }
        const name = d.label + ' [' + (d.keyLabel || d.key) + ']'; // 자세한 내용은 툴팁(aria-describedby)
        if (n.getAttribute('aria-label') !== name) n.setAttribute('aria-label', name);
        n.setAttribute('aria-disabled', d.reason ? 'true' : 'false');
        n.setAttribute('aria-pressed', d.armed ? 'true' : 'false');
        n.classList.toggle('is-auto', !!d.auto); n.classList.toggle('is-short', d.reason === 'energy');
        const prog = d.prog ? d.prog() : -1; // 생산·연구·변태·부속 진행 띠
        const pe = n.querySelector('.seg-prog');
        pe.style.transform = 'scaleX(' + Math.max(0, prog) + ')'; pe.hidden = prog < 0;
      }
      if (slots[roving].node.hidden) { const f = slots.find(x => !x.node.hidden); roving = f ? slots.indexOf(f) : 0; }
      for (let i = 0; i < 9; i++) { const t = i === roving ? 0 : -1; if (slots[i].node.tabIndex !== t) slots[i].node.tabIndex = t; }
      const [ct, ck] = curBtns.length ? crumbOf(g) : ['', ''], csig = ct + '|' + ck;
      if (csig !== crumbSig) { crumbSig = csig; crumbT.textContent = ct; crumbK.textContent = ck; el.card.setAttribute('aria-label', '명령 링' + (ct ? ' — ' + ct : '')); }
      refreshTip(g); refreshSheet(g);
    }

    // ---- 명령 카드 툴팁: 이름 · 비용(크리스탈·가스·보급) · 시간 · 요구 건물 · 단축키 · 비활성 사유 ----
    const secs = t => Number((t / S.TICK_RATE).toFixed(1));
    function tipHtml(g, d, touchSheet) {
      const p = g.players[me], key = d.keyLabel || d.key;
      let name = d.label, cost = null, supply = 0, time = 0, req = [];
      if (d.src === 'unit') { const u = D.units[d.id]; cost = u.cost; supply = (u.supply || 0) * (u.count || 1) - (d.from ? D.units[d.from].supply || 0 : 0); time = u.time; req = u.requires || []; }
      else if (d.src === 'bld') { const b = D.buildings[d.id]; cost = b.cost; time = b.time; req = b.requires || []; }
      else if (d.src === 'up') {
        const u = D.upgrades[d.id], lv = Math.min(lvOf(g, d.id), u.levels - 1);
        if (u.levels > 1) name += ' ' + (lv + 1) + '/' + u.levels + '단계';
        if (!d.maxed) { cost = u.cost[lv]; time = u.time[lv]; }
        const r = u.requires || [];
        req = Array.isArray(r[0]) ? r[lv] || [] : r;
      }
      let h = '<p class="tip-name"><span>' + esc(name) + '</span><span class="tip-key"><span class="sr">단축키 </span>' + esc(key) + '</span></p>';
      if (d.src === 'ab') { // 능력: 마나 · 사거리 · 대상 · 자동 시전/토글 안내
        const A = D.abilities[d.id], short = d.reason === 'energy';
        let c = A.cost ? '<span' + (short ? ' class="is-short"' : '') + '><span class="glyph mana" aria-hidden="true">✦</span> 마나 <span class="num">' + A.cost + '</span></span>' : '<span>마나 없음</span>';
        if (A.cooldown >= S.TICK_RATE) c += '<span>재사용 <span class="num">' + secs(A.cooldown) + '초</span></span>';
        if (A.range) c += '<span>사거리 <span class="num">' + Math.round(A.range / TILE * 10) / 10 + '</span></span>';
        c += '<span>' + (A.target === 'unit' ? '대상 지정' : A.target === 'point' ? '지점 지정' : '즉시') + '</span>';
        h += '<p class="tip-cost">' + c + '</p>';
        if (SPELL_DESC[d.id]) h += '<p class="tip-desc">' + esc(SPELL_DESC[d.id]) + '</p>';
        if (A.toggle) h += '<p>' + (d.on ? '켜져 있음 · 다시 누르면 해제' : '켜면 유지하는 동안 마나가 계속 줄어든다') + '</p>';
        if (A.autocast && !touchSheet) h += '<p>우클릭: 자동 시전 ' + (d.auto ? '끄기 (지금 켜짐)' : '켜기 (지금 꺼짐)') + '</p>';
      }
      if (d.reqUp) { const ok = !!g.players[me].up[d.reqUp], nm = D.upgrades[d.reqUp] ? D.upgrades[d.reqUp].name : d.reqUp;
        h += '<p class="tip-req">요구 연구 <span class="' + (ok ? 'is-ok' : 'is-miss') + '">' + (ok ? '✓ ' : '✕ ') + esc(nm) + '<span class="sr">' + (ok ? ' 완료' : ' 미완료') + '</span></span></p>'; }
      if (cost) {
        const part = (glyph, cls, label, v, short) => '<span' + (short ? ' class="is-short"' : '') + '><span class="glyph' + cls + '" aria-hidden="true">' + glyph + '</span> ' + label + ' <span class="num">' + v + '</span></span>';
        let c = part('◆', '', '크리스탈', cost.crystal || 0, p.crystal - pend.crystal < (cost.crystal || 0));
        if (cost.nebula) c += part('●', ' gas', '가스', cost.nebula, p.nebula - pend.nebula < cost.nebula);
        if (supply) c += part('▲', '', '보급', supply, p.supplyUsed2 + Math.round(supply * 2) > p.supplyMax2);
        if (time) c += '<span>시간 <span class="num">' + secs(time) + '초</span></span>';
        h += '<p class="tip-cost">' + c + '</p>';
      } else if (d.maxed) h += '<p>연구 완료</p>';
      const un = d.src === 'up' && D.upgrades[d.id].effect.unlock;
      if (un && SPELL_DESC[un]) h += '<p class="tip-desc">해금: ' + esc(D.abilities[un].name) + ' — ' + esc(SPELL_DESC[un]) + '</p>';
      if (req.length) h += '<p class="tip-req">요구 ' + req.map(r => {
        const ok = S.hasTech(g, me, r), nm = (D.buildings[r] || D.units[r] || { name: r }).name;
        return '<span class="' + (ok ? 'is-ok' : 'is-miss') + '">' + (ok ? '✓ ' : '✕ ') + esc(nm) + '<span class="sr">' + (ok ? ' 있음' : ' 없음') + '</span></span>';
      }).join(' · ') + '</p>';
      if (d.note) h += '<p>' + esc(d.note) + '</p>';
      if (d.reason) h += '<p class="tip-why">' + esc(REASON[d.reason] || REASON.blocked) + '</p>';
      return h;
    }
    function showTip(i) { clearTimeout(tipTimer); if (tipSlot !== i) { hideTip(); tipSlot = i; } refreshTip(st()); }
    function hideTip(i) {
      clearTimeout(tipTimer);
      if (i !== undefined && tipSlot !== i) return;
      if (tipSlot >= 0) slots[tipSlot].node.removeAttribute('aria-describedby');
      tipSlot = -1; tipSig = ''; el.tip.hidden = true;
    }
    function refreshTip(g) {
      if (tipSlot < 0) return;
      const d = curBtns.find(x => x.slot === tipSlot), n = slots[tipSlot].node;
      if (!g || !active || !d) { hideTip(); return; }
      const html = tipHtml(g, d);
      if (html !== tipSig) { el.tip.innerHTML = html; tipSig = html; }
      el.tip.hidden = false; n.setAttribute('aria-describedby', 'nw-tip');
      // 칸 중심에서 링 바깥 방향으로 칸/2 + 30px(키캡 너머). 바깥 방향이 왼쪽이면 툴팁 오른쪽 끝을, 오른쪽이면 왼쪽 끝을 붙인다 —
      // 그래서 다른 칸이나 링 안의 선택 유닛을 덮지 않는다. 화면·상단 바·계기 기둥 밖으로 나가면 안쪽으로 밀어 넣는다.
      const r = n.getBoundingClientRect(), tw = el.tip.offsetWidth, th = el.tip.offsetHeight, M = 8;
      const a = SLOT_DEG[tipSlot] * Math.PI / 180, co = Math.cos(a), si = Math.sin(a), off = r.width / 2 + 30;
      let x = r.left + r.width / 2 + co * off - (co < -0.2 ? tw : co > 0.2 ? 0 : tw / 2);
      let y = r.top + r.height / 2 + si * off - (si < -0.2 ? th : si > 0.2 ? 0 : th / 2);
      const X1 = Math.max(M, (view.vw || innerWidth) - tw - M), Y0 = barH() + M, Y1 = Math.max(Y0, innerHeight - th - M);
      x = clamp(x, M, X1); y = clamp(y, Y0, Y1);
      // 밀어 넣다가 링(바깥 원)을 덮게 되면 — 링이 화면 가장자리 가까이 있을 때 — 링 위나 아래 바깥으로 옮긴다
      const m = /translate3d\((-?[\d.]+)px, ?(-?[\d.]+)px/.exec(ringXY), rd = ringDims(), Ro = rd.ringR + rd.seg * 0.71 + 4; // 칸 모서리까지
      if (m && ringSt === 'open') {
        const cx = +m[1], cy = +m[2], hit = (px, py) => Math.hypot(clamp(cx, px, px + tw) - cx, clamp(cy, py, py + th) - cy) < Ro;
        if (hit(x, y)) {
          const tx = clamp(r.left + r.width / 2 - tw / 2, M, X1), up = cy - rd.ringR - rd.seg / 2 - 50 - th, dn = cy + Ro + 8; // 위: 머리표보다 위
          if (si <= 0 && up >= Y0) { x = tx; y = up; } else if (dn <= Y1) { x = tx; y = dn; } else if (up >= Y0) { x = tx; y = up; }
        }
      }
      el.tip.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    }

    // ---- 칸 설명 시트(터치 길게 누르기): 툴팁 내용 + 자동 시전 켜기/끄기 + 닫기. 링이 접히거나 칸이 사라지면 닫힌다. ----
    const sheet = q('[data-hud=seg-sheet]'), sheetBody = sheet.querySelector('.seg-sheet-body'), sheetAuto = sheet.querySelector('[data-act=auto]');
    let sheetSlot = -1, sheetSig = '';
    function openSheet(i) { hideTip(); sheetSlot = i; sheetSig = ''; sheet.hidden = false; refreshSheet(st()); }
    function closeSheet() { if (sheetSlot < 0) return; sheetSlot = -1; sheet.hidden = true; if (sheet.contains(document.activeElement)) document.activeElement.blur(); }
    function refreshSheet(g) {
      if (sheetSlot < 0) return;
      const d = curBtns.find(x => x.slot === sheetSlot);
      if (!g || !active || !d || ringSt !== 'open') { closeSheet(); return; }
      const html = tipHtml(g, d, true);
      if (html !== sheetSig) { sheetSig = html; sheetBody.innerHTML = html; }
      sheetAuto.hidden = !d.alt;
      if (d.alt) { const t = d.auto ? '자동 시전 끄기' : '자동 시전 켜기'; if (sheetAuto.textContent !== t) sheetAuto.textContent = t; sheetAuto.setAttribute('aria-pressed', d.auto ? 'true' : 'false'); }
    }
    sheetAuto.addEventListener('click', () => { const d = curBtns.find(x => x.slot === sheetSlot); if (d && d.alt && active) { d.alt(); flashPress(slots[d.slot].node); } });
    sheet.querySelector('[data-act=close]').addEventListener('click', closeSheet);
    addEventListener('pointerdown', ev => { // 바깥을 누르면 닫는다 — 전장·미니맵을 누른 것이면 그 손가락은 닫기만 한다(유닛이 움직이지 않게)
      if (sheetSlot < 0 || sheet.contains(ev.target)) return;
      closeSheet();
      if (ev.target === canvas || ev.target === mini) { ev.preventDefault(); ev.stopPropagation(); }
    }, true);

    // ---- 명령 링 상태 · 위치 (설계서 §4.1–4.2) ----
    // ringSt: 'none' 없음(선택 없음·관전·명령 없음) · 'open' 열림 · 'pin' 핀(접힘 — 선택 중심 위 작은 마름모).
    // 열림 기준점(anchor)은 여는 순간의 월드 좌표로 고정한다: 유닛이 움직여도 링은 따라가지 않고, 카메라를 움직이면 땅과 함께 움직인다.
    const RING_AUTO_KEY = 'nw-ring-auto';
    let ringSt = 'none', anchor = null, selDirty = false, ringXY = '', pinXY = '', pinN = -1, pinT = 0, ringAuto = true;
    let lastMode = null, chipSig = '', chipW = 0, chipXY = '', noticeXY = '';
    try { ringAuto = localStorage.getItem(RING_AUTO_KEY) !== '0'; } catch (e) { ringAuto = true; } // 설정 "링 자동 열기"(기본 켬)
    // 기준점 = 내 선택의 화면 표시 위치 평균(월드 좌표). 공중 유닛·띄운 건물은 그려지는 높이만큼 위.
    function selCenter(g) {
      let x = 0, y = 0, n = 0;
      for (const e of selEnts(g)) { if (!mine(e)) continue; x += e.x / FP; y += e.y / FP - (e.def.air ? 20 : 0) - (e.lifted ? LIFT_PX : 0); n++; }
      return n ? { x: x / n, y: y / n, n } : null;
    }
    function setRing(s, g) {
      if (s === 'open' && g) { const c = selCenter(g); if (c) anchor = c; } // 열 때마다 기준점을 지금 선택에 다시 잡는다
      if (s === ringSt) return;
      ringSt = s;
      el.card.classList.toggle('is-open', s === 'open');
      if (s !== 'open' && el.card.contains(document.activeElement)) document.activeElement.blur(); // 접힌 칸에 포커스를 남기지 않는다
      if (s !== 'open') hideTip();
    }
    // 링 그릇을 기준점 − 카메라에 놓되, 칸·키캡·머리표가 보이는 영역(상단 바 아래 · 계기 기둥 왼쪽) 안에 들어오도록 끌어당긴다.
    function placeRing(sx, sy) {
      const d = ringDims(), out = d.ringR + d.seg / 2 + 26; // 칸 바깥 끝 + 키캡
      const x = Math.round(clamp(sx, out, Math.max(out, view.vw - out))), y = Math.round(clamp(sy, view.oy + out + 24, Math.max(view.oy + out + 24, view.oy + view.vh - out)));
      const t = 'translate3d(' + x + 'px,' + y + 'px,0)';
      if (t !== ringXY) { ringXY = t; el.card.style.transform = t; }
      // 거부 문구(.notice)는 링이 열려 있으면 꼬리(6시) 키캡 아래 — 누른 칸 가까이에서 읽힌다
      placeNotice('translate3d(' + x + 'px,' + Math.round(Math.min(y + d.ringR + d.seg / 2 + 40, innerHeight - 40)) + 'px,0) translateX(-50%)');
    }
    function placeNotice(t) { // t = '' → 기본 자리(보이는 영역 아래 가운데)
      if (t === noticeXY) return;
      noticeXY = t; el.notice.classList.toggle('at-ring', !!t); el.notice.style.transform = t;
    }
    function blinkPin() { // 링이 접힌 채 단축키를 누르면 핀이 잠깐 밝아져 '눌렸다'를 알린다(색만 — 감소 모션에서도 같음)
      if (ringSt !== 'pin') return;
      el.pin.classList.add('is-blink'); clearTimeout(pinT); pinT = setTimeout(() => el.pin.classList.remove('is-blink'), 120);
    }
    // 무장(대상 지정) 모드 칩: "공격 — 대상·지점 클릭 · Esc 취소" (칸 이름 + 대상 종류 + 취소 키)
    function modeText() {
      const id = typeof mode === 'string' ? mode : mode.cast || mode.build || (mode.land ? 'land' : mode.load ? 'load' : mode.unload ? 'unload' : '');
      const d = curBtns.find(x => x.id === id);
      const label = d ? d.label : mode.build ? D.buildings[mode.build].name : mode.cast ? D.abilities[mode.cast].name : id;
      const what = mode === 'attack' ? '대상·지점 클릭' : mode === 'repair' ? '수리할 대상 클릭' : mode === 'rally' ? '집결 지점 클릭' : mode.build ? '건설 위치 클릭'
        : mode.land ? '착륙 위치 클릭' : mode.load ? '태울 유닛 클릭' : mode.unload ? '내릴 지점 클릭' : mode.cast && D.abilities[mode.cast].target === 'unit' ? '대상 클릭' : '지점 클릭';
      if (kbNav) return label + ' — 가운데 십자 · Enter ' + (mode === 'move' ? '명령' : '실행'); // 키보드: 방향키로 카메라를 옮겨 맞춘다
      return label + ' — ' + (lastTouch ? what.replace('클릭', '탭') : what); // 터치(마지막 입력이 손가락)면 "탭"
    }
    function updateChip(px, py) {
      const on = !!mode && ringSt === 'pin';
      el.chip.hidden = !on;
      if (!on) return;
      const t = modeText();
      if (t !== chipSig) { chipSig = t; el.chip.firstChild.textContent = t; chipW = el.chip.offsetWidth; } // 문구가 바뀔 때만 폭을 잰다
      const x = px + 22 + chipW > view.vw - 8 ? px - 22 - chipW : px + 22; // 오른쪽이 모자라면 핀 왼쪽
      const tr = 'translate3d(' + Math.round(x) + 'px,' + Math.round(py - 12) + 'px,0)';
      if (tr !== chipXY) { chipXY = tr; el.chip.style.transform = tr; }
    }
    function updateRing(g) {
      const c = active && !spectate && curBtns.length ? selCenter(g) : null;
      if (!c) { setRing('none'); selDirty = false; lastMode = mode; el.card.hidden = true; el.pin.hidden = true; el.chip.hidden = true; placeNotice(''); return; }
      if (selDirty || ringSt === 'none') { setRing(selDirty && ringAuto ? 'open' : 'pin', g); selDirty = false; }
      if (mode && mode !== lastMode && ringSt === 'open') setRing('pin'); // 무장 명령을 고르면 전장을 가리지 않게 접는다(§4.5)
      lastMode = mode;
      el.card.hidden = false;
      if (ringSt === 'open') {
        const sx = anchor.x - view.camX, sy = anchor.y - view.camY;
        if (sx < 0 || sx >= view.vw || sy < view.oy || sy >= view.oy + view.vh) setRing('pin'); // 기준점이 화면 밖 → 접기
        else placeRing(sx, sy);
      }
      if (ringSt !== 'open') placeNotice('');
      el.pin.hidden = ringSt !== 'pin';
      if (ringSt === 'pin') { // 핀은 지금 선택 중심 위를 따라간다(작아서 가리지 않는다). 화면 밖이면 가장자리에 붙는다.
        const x = Math.round(clamp(c.x - view.camX, 20, Math.max(20, view.vw - 20))), y = Math.round(clamp(c.y - view.camY - 36, view.oy + 20, Math.max(view.oy + 20, view.oy + view.vh - 20)));
        const t = 'translate3d(' + x + 'px,' + y + 'px,0)';
        if (t !== pinXY) { pinXY = t; el.pin.style.transform = t; }
        if (c.n !== pinN) { pinN = c.n; el.pin.firstChild.textContent = c.n; }
        updateChip(x, y);
      } else el.chip.hidden = true;
    }
    el.pin.innerHTML = '<span class="pin-n"></span>';
    el.chip.after(kbCross);
    el.chip.innerHTML = '<span></span><span class="kbd">Esc 취소</span><button type="button" class="btn chip-x">취소</button>'; // 취소 버튼은 터치 화면에서만 보인다(CSS)
    el.chip.querySelector('.chip-x').addEventListener('mousedown', ev => ev.preventDefault());
    el.chip.querySelector('.chip-x').addEventListener('click', () => { const g = st(); if (active && g && mode) { mode = null; setRing('open', g); } }); // Esc 와 같다: 무장 해제 → 링 다시 열림
    el.pin.addEventListener('mousedown', ev => ev.preventDefault());
    el.pin.addEventListener('click', () => { const g = st(); if (active && g) setRing('open', g); });

    // ---- 공격받음 알림 ----
    function alertHit(g, b, text) { // text 가 있으면(위장 유닛 경고) 화면 안이어도 알린다. 쿨다운은 공유.
      if (!text && onScreen(b)) return;
      const x = b.x / FP, y = b.y / FP, R2 = (ALERT_R * TILE) ** 2;
      cool = cool.filter(c => g.tick - c.tick < ALERT_COOL_S * S.TICK_RATE);
      if (cool.some(c => (c.x - x) ** 2 + (c.y - y) ** 2 <= R2)) return;
      cool.push({ x, y, tick: g.tick });
      lastAlert = { x, y };
      const node = document.createElement('div'); node.className = 'edge'; node.hidden = true; node.innerHTML = EDGE_SVG;
      el.edges.appendChild(node);
      alerts.push({ x, y, t0: performance.now(), node });
      const msg = text || ALERT_TEXT[b.isB ? 'base' : b.def.worker ? 'worker' : 'unit'];
      el.alert.textContent = ''; // 같은 문구가 이어져도 다시 읽히게 비운 뒤 채운다
      requestAnimationFrame(() => { el.alert.innerHTML = esc(msg) + '<span class="kbd" aria-hidden="true">Space 이동</span>'; });
      el.alert.classList.add('is-on');
      clearTimeout(alertT); alertT = setTimeout(() => el.alert.classList.remove('is-on'), LINE_MS);
      if (R.audio) R.audio.play('alert', 1, 0, 0);
    }
    function updateAlerts() {
      const now = performance.now(), cx = view.vw / 2, cy = view.oy + view.vh / 2, M = 22;
      view.pings = [];
      alerts = alerts.filter(a => {
        const age = now - a.t0;
        if (age >= PING_MS) { a.node.remove(); return false; }
        view.pings.push({ x: a.x, y: a.y, age: age / PING_MS });
        const sx = a.x - view.camX, sy = a.y - view.camY;
        const inside = sx >= 0 && sx < view.vw && sy >= view.oy && sy < view.oy + view.vh;
        if (inside || age >= EDGE_MS + 500) { a.node.hidden = true; return true; }
        const dx = sx - cx, dy = sy - cy, k = Math.min((cx - M) / Math.max(1e-6, Math.abs(dx)), (view.vh / 2 - M) / Math.max(1e-6, Math.abs(dy)));
        a.node.hidden = false; a.node.classList.toggle('is-fade', age >= EDGE_MS);
        a.node.style.transform = 'translate(' + Math.round(cx + dx * k) + 'px,' + Math.round(cy + dy * k) + 'px) rotate(' + Math.atan2(dy, dx).toFixed(3) + 'rad)';
        return true;
      });
    }
    function clearAlerts() {
      for (const a of alerts) a.node.remove();
      alerts = []; cool = []; lastAlert = null; view.pings = [];
      clearTimeout(alertT); el.alert.classList.remove('is-on'); el.alert.textContent = '';
    }

    // ---- 노는 일꾼: 명령 없는 내 일꾼(id 순). 가스 건물 안 일꾼은 gather 명령을 들고 있어 빠진다. ----
    const idleWorkers = g => g.ents.filter(e => mine(e) && !e.isB && !e.isR && !e.inside && e.def.worker && !e.order).sort((a, b) => a.id - b.id);
    // 부대 번호 불러오기: 선택, 두 번 연달아 = 카메라 이동 (숫자 키·부대 칩 공용)
    function recallGroup(n, g) {
      const ids = (groups[n] || []).filter(id => S.byId(g, id));
      if (!ids.length) return;
      const now = performance.now();
      if (lastGroup.n === n && now - lastGroup.t < DBL) {
        let x = 0, y = 0; for (const id of ids) { const e = S.byId(g, id); x += e.x / FP; y += e.y / FP; }
        centerOn(x / ids.length, y / ids.length);
      }
      lastGroup = { n, t: now };
      setSel(ids);
    }
    function pickIdle(all) {
      const g = st(); if (!active || !g || spectate) return;
      const list = idleWorkers(g); if (!list.length) return;
      const nx = all ? list[0] : list.find(e => e.id > idleLast) || list[0];
      idleLast = nx.id;
      setSel(all ? list.map(e => e.id) : [nx.id]);
      centerOn(nx.x / FP, nx.y / FP);
    }
    function renderIdle(g) {
      const n = idleWorkers(g).length;
      if (n === idleCount) return;
      idleCount = n; el.idleN.textContent = n;
      el.idle.setAttribute('aria-disabled', n ? 'false' : 'true');
      el.idle.setAttribute('aria-label', '노는 일꾼 ' + n + '명 — 다음 일꾼 선택 [F1], Shift는 전부');
    }
    el.idle.addEventListener('mousedown', ev => ev.preventDefault());
    el.idle.addEventListener('click', ev => pickIdle(ev.shiftKey));

    // ---- 선택 정보 ----
    let infoSig = null, dyn = [];
    const meter = (cls) => `<div class="meter ${cls}"><span class="meter-fill"></span></div>`;
    const setMeter = (node, frac) => { node.style.transform = 'scaleX(' + clamp(frac, 0, 1) + ')'; };
    function ownerLabel(g, e) {
      if (e.owner < 0) return '중립';
      if (observer) return nameOf(e.owner) + ' · 팀 ' + (g.players[e.owner].team + 1); // 리플레이: 누구의 '나'도 아니다
      return (e.owner === me ? '나' : S.isEnemy(g, me, e.owner) ? '적' : '팀원') + ' · ' + nameOf(e.owner);
    }
    // 머리(선택 수 + 부대 칩)는 한 번만 만들고, 아래 본문(infoBody)만 선택이 바뀔 때 다시 짠다
    let infoHead = null, infoBody = null, infoTitle = null, infoChips = null, grpSig = null;
    function ensureInfo() {
      if (infoHead && infoHead.parentNode === el.info) return;
      el.info.innerHTML = '';
      infoHead = document.createElement('div'); infoHead.className = 'info-head';
      infoTitle = document.createElement('h2'); infoTitle.className = 'info-title';
      infoChips = document.createElement('div'); infoChips.className = 'groups'; infoChips.setAttribute('role', 'group'); infoChips.setAttribute('aria-label', '부대');
      infoHead.append(infoTitle, infoChips);
      infoBody = document.createElement('div'); infoBody.className = 'info-main';
      el.info.append(infoHead, infoBody); grpSig = null;
    }
    // 부대 번호 칩: 지정된 번호만. 클릭 = 선택, 두 번 = 카메라 이동(숫자 키와 같은 동작)
    function renderChips(g, ents) {
      const cur = ents.map(e => e.id).sort((a, b) => a - b).join(',');
      const nums = Object.keys(groups).sort().filter(n => groups[n].some(id => S.byId(g, id)));
      const sig = nums.map(n => n + ':' + groups[n].filter(id => S.byId(g, id)).sort((a, b) => a - b).join('.')).join('|') + '#' + cur;
      if (sig === grpSig) return;
      grpSig = sig; infoChips.innerHTML = ''; infoChips.hidden = !nums.length;
      for (const n of nums) {
        const ids = groups[n].filter(id => S.byId(g, id)), isCur = ids.slice().sort((a, b) => a - b).join(',') === cur;
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn grp' + (isCur ? ' is-cur' : ''); b.textContent = n;
        b.title = '부대 ' + n + ' · 클릭: 선택, 두 번 클릭: 카메라 이동';
        b.setAttribute('aria-label', '부대 ' + n + (isCur ? ' (현재)' : '') + ' — 클릭 선택, 두 번 클릭 카메라 이동');
        b.addEventListener('mousedown', ev => ev.preventDefault());
        b.addEventListener('click', () => { const gg = st(); if (active && gg) recallGroup(n, gg); });
        infoChips.appendChild(b);
      }
    }
    function renderInfo(g) {
      ensureInfo();
      const ents = selEnts(g);
      const one = ents.length === 1 ? ents[0] : null;
      const sig = ents.map(e => e.id).join(',') + (one ? '|' + one.type + '|' + (one.buildLeft > 0) + '|' + !!one.morph + '|' + !!one.lifted + '|' +
        (one.queue || []).map(x => x.what || x.research).join('.') : '');
      if (sig !== infoSig) {
        infoSig = sig; dyn = []; infoBody.innerHTML = '';
        infoTitle.innerHTML = ents.length > 1 ? '부대 <span class="num">' + ents.length + '</span><small>/ ' + MAX_SEL + '</small>' : ents.length ? '선택 <span class="num">1</span>' : '선택';
        if (one) buildOne(g, one); else if (ents.length) buildMany(ents);
        else infoBody.innerHTML = '<p class="info-empty">선택한 대상이 없습니다</p>';
      }
      renderChips(g, ents);
      for (const f of dyn) f(g);
    }
    // 카테고리 → 업그레이드 id, 종족 → 보호막 업그레이드 id
    const CAT_UP = {}, SHIELD_UP = {};
    for (const u of Object.values(D.upgrades)) { if (u.effect.category) CAT_UP[u.effect.category] = u.id; if (u.effect.shieldPerLevel) SHIELD_UP[u.race] = u.id; }
    function line(body, cls) { const p = document.createElement('p'); p.className = 'info-line' + (cls ? ' ' + cls : ''); body.appendChild(p); return p; }
    function buildOne(g, e) {
      const isRes = e.isR, def = e.def;
      const wrap = document.createElement('div'); wrap.className = 'info-one';
      const por = document.createElement('div'); por.className = 'portrait';
      const portType = () => e.mode && NW_ART.SPR[e.type + '@' + e.mode] ? e.type + '@' + e.mode : e.type; // 정박 등 모드 스킨
      let portKey = portType(); por.appendChild(R.icon(portKey, e.owner, 96));
      if (!isRes) dyn.push(() => { const k = portType(); if (k !== portKey) { portKey = k; por.replaceChildren(R.icon(k, e.owner, 96)); } });
      const body = document.createElement('div'); body.className = 'info-body';
      const race = !isRes && def.race ? D.races[def.race].name : '';
      body.innerHTML = `<h2 class="info-name">${e.type === 'crystal' ? '크리스탈' : def.name}</h2><p class="info-sub"></p>`;
      body.querySelector('.info-sub').textContent = ownerLabel(g, e) + (race ? ' · ' + race : ''); // 이름이 들어간다 — innerHTML 금지
      wrap.append(por, body); infoBody.appendChild(wrap);
      if (isRes) {
        const p = line(body);
        dyn.push(() => { p.innerHTML = '남은 양 <span class="num">' + e.amount + '</span>'; });
        return;
      }
      const vis = e.owner === me || S.visible(g, me, e);
      const rows = document.createElement('div'); rows.className = 'stats'; body.appendChild(rows);
      const stat = (label, cls) => {
        const r = document.createElement('div'); r.className = 'stat';
        r.innerHTML = `<span class="stat-label">${label}</span>${meter(cls)}<span class="num stat-num"></span>`;
        rows.appendChild(r); return [r.querySelector('.meter-fill'), r.querySelector('.stat-num'), r];
      };
      if (e.shieldMax > 0) {
        const [f, n] = stat('결정막', 'shield');
        dyn.push(() => { setMeter(f, e.shield / e.shieldMax); n.textContent = vis ? Math.ceil(e.shield / FP) + ' / ' + e.shieldMax / FP : '?'; });
      }
      const [hf, hn, hr] = stat('체력', 'hp');
      dyn.push(() => { const fr = e.hp / e.hpMax; setMeter(hf, fr); hr.classList.toggle('is-low', fr <= 0.3); hn.textContent = Math.ceil(e.hp / FP) + ' / ' + e.hpMax / FP; });
      const ally = e.owner >= 0 && !S.isEnemy(g, me, e.owner);
      if (def.energy && ally) { // 마나: 내·팀원 것만
        const [f, n] = stat('마나', 'mana');
        dyn.push(() => { const mx = S.energyMax(g, e); setMeter(f, e.energy / mx); n.textContent = Math.floor(e.energy / FP) + ' / ' + mx / FP; });
      }
      if (!e.isB && e.morph && ally) { // 고치: 변태 → 결과 / 합체 결과는 자기 타입
        const to = D.units[e.morph.to], merged = e.morph.to === e.type;
        line(body, 'is-warn').textContent = merged ? '합체 중 → ' + to.name : '변태 중 → ' + to.name;
        const [f, n] = stat(merged ? '합체' : '변태', 'cocoon');
        dyn.push(() => { if (!e.morph) return; const fr = 1 - e.morph.left / to.time; setMeter(f, fr); n.textContent = Math.floor(fr * 100) + '%'; });
      }
      if (!e.isB && ally && (def.modes || def.cloaked || (def.abilities || []).some(a => D.abilities[a].effect.flag === 'cloaked'))) { // 잠복·포격·위장 상태
        const p = line(body);
        dyn.push(() => { const t = e.modeT > 0 ? '전환 중…' : e.mode === 'burrow' ? '휴면 중' : e.mode === 'siege' && !def.modes.siege.auto ? '정박' : S.cloaked(e) ? '위장 중' : ''; p.textContent = t; p.hidden = !t; });
      }
      const am = !e.isB && ally && Object.keys(def.modes || {}).find(m => def.modes[m].auto);
      if (am) { // 자동 정박: 멈춰 있으면 still 이 차오르고 time 틱에 정박 → 움직이면 바로 해제
        const md = def.modes[am], [f, n, r] = stat('정박', 'anchor');
        dyn.push(() => {
          const on = e.mode === am, fr = on ? 1 : e.still / md.time;
          r.hidden = !on && !(e.still > 0); r.classList.toggle('is-on', on); setMeter(f, fr);
          n.textContent = on ? '정박 중' : '준비 ' + Math.floor(fr * 100) + '% · ' + Math.ceil((md.time - e.still) / S.TICK_RATE) + '초';
        });
      }
      if (!e.isB && def.race === 'swarm' && (S.weaponOf(e, 'weapon') || def.weapon2 || def.launcher) && (e.owner === me || vis)) { // 마이셀 변이: 처치 수는 내 것만, 적은 단계만
        const MUT = D.races.swarm.mutation, [f, n, r] = stat('변이', 'mutation'), p = line(body), mine = e.owner === me;
        dyn.push(() => {
          const st = e.kills >= MUT.at[1] ? 2 : e.kills >= MUT.at[0] ? 1 : 0;
          r.classList.toggle('is-on', st > 0);
          setMeter(f, mine ? (st === 2 ? 1 : e.kills / MUT.at[st]) : st / 2);
          n.textContent = !mine ? (st ? st + '단계' : '변이 전') : st === 2 ? '최대' : '처치 ' + e.kills + '/' + MUT.at[st];
          p.textContent = st === 2 ? '변이 2단계 · 방어 +' + MUT.armor[1] + ' · 회복 ' + MUT.regen2 + '배' : st === 1 ? '변이 1단계 · 방어 +' + MUT.armor[0] : '';
          p.hidden = !st;
        });
      }
      if (!e.isB && e.owner === me && def.race === 'elysian' && e.shieldMax > 0) { // 코러스 공명: 반경 r타일 같은 종류·같은 주인(sim.resonance 와 같은 규칙)
        const RES = D.races.elysian.resonance, r2 = (RES.r * S.TFP) ** 2, [f, n, r] = stat('공명', 'resonance'), p = line(body);
        dyn.push(() => {
          let c = 0;
          if (!e.inside) for (const o of g.ents) {
            if (o === e || o.type !== e.type || o.owner !== e.owner || o.isB || o.inside || !(o.hp > 0) || !o.shieldMax) continue;
            const dx = o.x - e.x, dy = o.y - e.y;
            if (dx * dx + dy * dy <= r2 && ++c >= RES.cap) break;
          }
          const k = Math.floor(c / RES.per);
          r.classList.toggle('is-on', k > 0); setMeter(f, c / RES.cap);
          n.textContent = '이웃 ' + c + '/' + RES.cap;
          p.textContent = k ? '결정막 회복 +' + k + ' · 전투 중에도' : '같은 종류가 ' + RES.per + '기 이상 모이면 결정막 회복';
        });
      }
      if (def.transport && e.owner === me) buildCargo(g, e, body);
      // 공격·방어(·보호막) 업그레이드 단계: 유닛만, 무기 카테고리가 없으면 공격은 생략
      if (!e.isB && e.owner >= 0) {
        const w1 = S.weaponOf(e, 'weapon') || Object.values(def.modes || {}).map(m => m.weapon).find(Boolean); // 모드 무기만 있는 유닛(트렌처)
        const wc = (w1 && w1.upgrade) || (def.weapon2 && def.weapon2.upgrade);
        const parts = [];
        if (wc && CAT_UP[wc]) parts.push(['공격', CAT_UP[wc]]);
        if (def.armorUpgrade && CAT_UP[def.armorUpgrade]) parts.push(['방어', CAT_UP[def.armorUpgrade]]);
        if (e.shieldMax > 0 && SHIELD_UP[def.race]) parts.push(['결정막', SHIELD_UP[def.race]]);
        if (parts.length) {
          const p = line(body, 'ups');
          dyn.push(() => { const up = g.players[e.owner].up; p.innerHTML = parts.map(([l, id]) => l + ' <span class="num">+' + (up[id] || 0) + '</span>').join('<span class="sep" aria-hidden="true">·</span>'); });
        }
      }
      if (def.launcher && e.owner === me) { // 함재기·파쇄구: 격납 수 / 최대, 출격 중
        const p = line(body), child = D.units[def.launcher.child].name;
        dyn.push(() => { const out = g.ents.reduce((k, c) => k + (c.parent === e.id ? 1 : 0), 0);
          p.innerHTML = child + ' 격납 <span class="num">' + e.hangar + ' / ' + def.launcher.max + '</span>' + (out ? ' · 출격 <span class="num">' + out + '</span>' : ''); });
      }
      if (e.owner !== me) return;
      if (e.isB && e.buildLeft > 0) {
        const [f, n] = stat('건설', 'prog');
        dyn.push(() => { const fr = 1 - e.buildLeft / def.time; setMeter(f, fr); n.textContent = Math.floor(fr * 100) + '%'; });
        return;
      }
      if (e.isB && e.morph) {
        const to = D.buildings[e.morph.to], [f, n] = stat('변태', 'prog');
        body.querySelector('.info-sub').textContent += ' · ' + to.name + '(으)로 변태 중';
        dyn.push(() => { if (!e.morph) return; const fr = 1 - e.morph.left / to.time; setMeter(f, fr); n.textContent = Math.floor(fr * 100) + '%'; });
      }
      if (e.isB && def.race === 'elysian') { // 레이 라인 밖이면 정지 표시
        const p = line(body, 'is-warn');
        dyn.push(() => { p.textContent = e.unpowered ? '레이 라인 밖 — 생산·연구·공격 정지' : ''; p.hidden = !e.unpowered; });
      }
      if (e.isB && e.lifted) line(body, 'is-warn').textContent = '떠 있음 — 내려야 생산·연구할 수 있다';
      if (e.isB && ADDONS[e.type]) { // 부속: 붙은 것 이름 + 건설 진행
        const p = line(body);
        dyn.push(() => { const a = e.addon && S.byId(g, e.addon); p.hidden = !a; p.innerHTML = a ? '부속 ' + a.def.name + (a.buildLeft > 0 ? ' 건설 중 <span class="num">' + Math.floor((1 - a.buildLeft / a.def.time) * 100) + '%</span>' : '') : ''; });
      }
      if (e.isB && def.larva) {
        const p = line(body);
        dyn.push(() => { p.innerHTML = '유충 <span class="num">' + e.larva + ' / 3</span>'; });
      }
      if (!e.isB && def.worker) {
        const p = line(body);
        dyn.push(() => {
          const o = e.order;
          p.innerHTML = o && o.type === 'constructing' ? '건설 중' : o && o.type === 'repair' ? (o.acc > 0 && !o.moving ? '수리 중' : '수리하러 가는 중')
            : e.carry ? '운반 중 ' + (e.carryKind === 1 ? '가스' : '크리스탈') + ' <span class="num">' + e.carry + '</span>' : '';
        });
      }
      if (e.isB && (def.trains || researchesOf(e.type).length || e.queue.length)) { // 생산·연구 대기열
        const qw = document.createElement('div'); qw.className = 'queue'; body.appendChild(qw);
        const cells = [];
        for (let i = 0; i < 5; i++) {
          const c = document.createElement('div'); c.className = 'queue-cell';
          const it = e.queue[i];
          if (it) {
            if (it.research) {
              const u = D.upgrades[it.research]; c.classList.add('is-research'); c.title = '연구: ' + u.name;
              if (u.effect.unit) c.appendChild(R.icon(u.effect.unit, me, 32)); else c.insertAdjacentHTML('beforeend', svg(upSvg(u.effect)));
            } else { c.appendChild(R.icon(it.what, me, 32)); c.title = D.units[it.what].name; }
            const pr = document.createElement('span'); pr.className = 'queue-prog'; c.appendChild(pr); cells.push([pr, i]);
          }
          qw.appendChild(c);
        }
        dyn.push(() => { for (const [pr, i] of cells) { const it = e.queue[i]; if (it) setMeter(pr, 1 - it.left / qTotal(g, me, it)); } });
      }
    }
    // 수송선 탑승 칸: 눈금 + '칸 5 / 8' + 탑승 유닛 아이콘(클릭 = 그 한 기 내리기)
    function buildCargo(g, e, body) {
      const box = document.createElement('div'); box.className = 'cargo'; body.appendChild(box);
      let csig = null;
      dyn.push(() => {
        const cs = S.cargo(g, e), sig = cs.map(c => c.id).join(',');
        if (sig === csig) return;
        csig = sig; box.innerHTML = '';
        const used = cs.reduce((k, c) => k + SLOT_N[c.def.size], 0), cap = e.def.transport;
        const pips = document.createElement('span'); pips.className = 'cargo-pips'; pips.setAttribute('aria-hidden', 'true');
        for (let i = 0; i < cap; i++) { const q = document.createElement('span'); q.className = 'cargo-pip' + (i < used ? ' is-on' : ''); pips.appendChild(q); }
        const lab = document.createElement('span'); lab.className = 'info-line'; lab.innerHTML = '탑승 칸 <span class="num">' + used + ' / ' + cap + '</span>';
        const head = document.createElement('div'); head.className = 'cargo-head'; head.append(pips, lab); box.appendChild(head);
        for (const c of cs) {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'btn cargo-cell';
          b.title = c.def.name + ' · 클릭: 이 유닛만 내리기'; b.setAttribute('aria-label', c.def.name + ' 내리기');
          b.appendChild(R.icon(c.type, c.owner, 32));
          b.addEventListener('mousedown', ev => ev.preventDefault());
          b.addEventListener('click', () => { if (active) push({ type: 'unload', ids: [e.id], unit: c.id }); });
          box.appendChild(b);
        }
      });
    }
    function buildMany(ents) {
      const grid = document.createElement('div'); grid.className = 'multi';
      for (const e of ents) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn multi-cell';
        b.title = e.def.name + ' · 클릭: 이 유닛만 선택, Shift+클릭: 빼기';
        b.setAttribute('aria-label', e.def.name + ' — 클릭 단독 선택, Shift+클릭 빼기');
        b.appendChild(R.icon(e.type, e.owner, 32));
        const mk = cls => { const m = document.createElement('div'); m.className = 'meter mini ' + cls; m.innerHTML = '<span class="meter-fill"></span>'; b.appendChild(m); return m; };
        const sm = e.shieldMax > 0 ? mk('shield') : null, m = mk('hp');
        b.addEventListener('mousedown', ev => ev.preventDefault());
        b.addEventListener('click', ev => { setSel(ev.shiftKey ? view.sel.filter(id => id !== e.id) : [e.id]); });
        dyn.push(() => {
          const fr = e.hp / e.hpMax; setMeter(m.firstChild, fr); m.classList.toggle('is-low', fr <= 0.3);
          if (sm) setMeter(sm.firstChild, e.shield / e.shieldMax);
        });
        grid.appendChild(b);
      }
      const cnt = new Map(); for (const e of ents) cnt.set(e.def.name, (cnt.get(e.def.name) || 0) + 1);
      const mix = document.createElement('p'); mix.className = 'info-mix';
      for (const [name, n] of cnt) { const sp = document.createElement('span'); sp.append(name + ' '); const bb = document.createElement('b'); bb.textContent = n; sp.appendChild(bb); mix.appendChild(sp); }
      infoBody.append(grid, mix);
    }

    // ---- 상단 바 ----
    function renderTop(g) {
      const p = g.players[me];
      el.race.textContent = D.races[p.race].name;
      el.crystal.textContent = p.crystal;
      el.nebula.textContent = p.nebula;
      el.supply.textContent = Math.ceil(p.supplyUsed2 / 2) + '/' + Math.floor(p.supplyMax2 / 2);
      el.supplyWrap.classList.toggle('is-full', p.supplyUsed2 >= p.supplyMax2);
      el.clock.textContent = mmss(g.tick);
    }

    // ---- 입력 ----
    const rel = ev => { const r = canvas.getBoundingClientRect(); return [ev.clientX - r.left, ev.clientY - r.top]; };
    canvas.addEventListener('mousedown', ev => {
      const g = st(); if (!active || !g) return;
      const [sx, sy] = rel(ev);
      if (ev.button === 0) {
        if (mode) { targetClick(g, ...world(sx, sy), ev.shiftKey); return; }
        drag = { x0: sx, y0: sy, x1: sx, y1: sy };
      } else if (ev.button === 2) {
        if (mode) { mode = null; return; } // 우클릭 = 대기 명령 취소
        contextCommand(g, ...world(sx, sy));
        if (ringSt === 'open') setRing('pin'); // 땅에 상황 명령 → 링을 핀으로 접는다
      }
    });
    addEventListener('mousemove', ev => {
      if (touchRecent()) return; // 손가락 탭 뒤 브라우저가 흉내 내는 mousemove — 가장자리 스크롤·커서 위치를 건드리지 않는다
      mouse.in = true; mouse.onCanvas = ev.target === canvas; mouse.shift = ev.shiftKey; kbNav = false; kbOff = [0, 0]; // 실제 커서가 다시 커서
      const [sx, sy] = rel(ev); mouse.x = sx; mouse.y = sy;
      if (drag) { drag.x1 = sx; drag.y1 = sy; view.drag = Math.abs(drag.x1 - drag.x0) + Math.abs(drag.y1 - drag.y0) > 4 ? drag : null; }
      if (mmDrag) miniCam(ev);
    });
    addEventListener('mouseup', ev => {
      if (ev.button === 0) mmDrag = false;
      if (ev.button !== 0 || !drag) return;
      const g = st(), d = drag; drag = null; view.drag = null;
      if (!active || !g) return;
      if (Math.abs(d.x1 - d.x0) + Math.abs(d.y1 - d.y0) <= 4) clickSelect(g, d.x0, d.y0, ev.shiftKey); else boxSelect(g, d, ev.shiftKey);
    });
    document.documentElement.addEventListener('mouseleave', () => { mouse.in = false; });
    addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouse.in = false; });
    addEventListener('contextmenu', ev => { if (active) ev.preventDefault(); });

    // ---- 터치 (설계서 §4.8 · 사용자 결정 D1): 탭 = 선택/명령 · 한 손가락 끌기 = 카메라 · 길게 누른 뒤 끌기 = 박스 선택 ----
    // pointerType 'touch' 만 여기서 받는다. 캔버스 pointerdown 을 preventDefault 해서 호환 마우스 이벤트(mousedown/up)가 생기지 않으므로
    // 위의 마우스 경로는 그대로이고 손가락은 이 경로만 탄다. 핀치 확대는 렌더러에 배율이 없어서 두지 않는다(두 번째 손가락 = 지금 동작 취소).
    const LONG_MS = 450, SLOP = 10;
    let touch = null, touchAt = -1e9;
    let lastTouch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches; // 모드 칩 문구 "클릭"/"탭": 굵은 포인터로 시작, 이후 마지막 입력을 따른다
    const isTouch = ev => ev.pointerType === 'touch';
    function touchRecent() { return performance.now() - touchAt < 800; }
    addEventListener('pointerdown', ev => { lastTouch = isTouch(ev); kbNav = false; kbOff = [0, 0]; if (lastTouch) { touchAt = performance.now(); mouse.in = false; } }, true);
    function aimAt(sx, sy) { mouse.x = sx; mouse.y = sy; mouse.onCanvas = true; } // 무장 중: 손가락 자리에 조준 원·건설 고스트
    function touchTap(g, sx, sy) {
      const [wx, wy] = world(sx, sy), hit = pick(g, wx, wy), units = myUnits(g);
      // 내 것을 탭 = 선택(두 번 탭 = 화면 안 같은 종류). 단, 일꾼이 내 가스 건물을, 엔지니어가 고칠 수 있는 내 것을 탭하면 상황 명령.
      const ctx = hit && mine(hit) && (gasBld(hit) && units.some(e => e.def.worker) || engineers(g).length && S.canRepair(g, me, hit));
      if (!spectate && (units.length || myBlds(g).length) && (!hit || !mine(hit) || ctx)) { // 땅·적·자원 탭(선택 있음) = 상황 명령 + 링 접힘
        contextCommand(g, wx, wy);
        if (ringSt === 'open') setRing('pin');
        return;
      }
      clickSelect(g, sx, sy, false);
    }
    canvas.addEventListener('pointerdown', ev => {
      if (!isTouch(ev)) return;
      ev.preventDefault();
      const g = st(); if (!active || !g) return;
      if (touch) { endTouch(null, true); return; } // 두 번째 손가락
      const [sx, sy] = rel(ev);
      touch = { id: ev.pointerId, x0: sx, y0: sy, x: sx, y: sy, kind: 'tap', t: 0 };
      touch.t = setTimeout(() => { // 길게 누르기: 박스 선택 시작(무장 중엔 조준을 계속 옮길 뿐)
        if (!touch || touch.kind !== 'tap' || mode) return;
        touch.kind = 'box'; drag = { x0: touch.x0, y0: touch.y0, x1: touch.x, y1: touch.y }; view.drag = drag;
        try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) { /* 진동 없음 */ }
      }, LONG_MS);
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* 캡처 실패 — 캔버스 안에서만 끌기 */ }
      if (mode) aimAt(sx, sy);
    });
    canvas.addEventListener('pointermove', ev => {
      if (!isTouch(ev) || !touch || ev.pointerId !== touch.id) return;
      const [sx, sy] = rel(ev);
      if (touch.kind === 'tap' && Math.hypot(sx - touch.x0, sy - touch.y0) > SLOP) { clearTimeout(touch.t); touch.kind = mode ? 'aim' : 'pan'; }
      if (touch.kind === 'pan') { view.camX -= sx - touch.x; view.camY -= sy - touch.y; clampCam(); }
      else if (touch.kind === 'box') { drag.x1 = sx; drag.y1 = sy; view.drag = drag; }
      if (mode) aimAt(sx, sy);
      touch.x = sx; touch.y = sy;
    });
    function endTouch(ev, cancel) {
      if (ev && (!isTouch(ev) || !touch || ev.pointerId !== touch.id)) return;
      const t = touch; touch = null; if (!t) return;
      clearTimeout(t.t); mouse.onCanvas = false;
      const d = t.kind === 'box' ? drag : null;
      if (d) { drag = null; view.drag = null; }
      const g = st(); if (cancel || !active || !g) return;
      if (mode && (t.kind === 'tap' || t.kind === 'aim')) { targetClick(g, ...world(t.x, t.y), false); return; } // 무장: 뗀 자리에 실행
      if (d) { if (Math.abs(d.x1 - d.x0) + Math.abs(d.y1 - d.y0) > 4) boxSelect(g, d, false); else setSel([]); return; } // 길게 눌렀다 그냥 떼기 = 선택 해제
      if (t.kind === 'tap') touchTap(g, t.x, t.y);
    }
    canvas.addEventListener('pointerup', ev => endTouch(ev, false));
    canvas.addEventListener('pointercancel', ev => endTouch(ev, true));

    function miniPoint(ev) { // 렌더와 같은 배치: 정사각 미니맵 안에 맵 비율 유지·가운데 정렬
      const r = mini.getBoundingClientRect(), m = st().map, k = Math.min(r.width / m.w, r.height / m.h);
      const ox = (r.width - m.w * k) / 2, oy = (r.height - m.h * k) / 2;
      return [clamp((ev.clientX - r.left - ox) / (m.w * k), 0, 1) * m.w * TILE, clamp((ev.clientY - r.top - oy) / (m.h * k), 0, 1) * m.h * TILE];
    }
    function miniCam(ev) { const [x, y] = miniPoint(ev); centerOn(x, y); }
    mini.addEventListener('mousedown', ev => {
      const g = st(); if (!active || !g) return;
      ev.preventDefault();
      if (ev.button === 0) {
        if (mode && !mode.build && !mode.land) { const [x, y] = miniPoint(ev); targetClick(g, x, y, ev.shiftKey); return; }
        mmDrag = true; miniCam(ev);
      } else if (ev.button === 2) { const [x, y] = miniPoint(ev); if (mode) mode = null; else { contextCommand(g, x, y); if (ringSt === 'open') setRing('pin'); } }
    });

    // 미니맵 터치: ≤767 의 미니맵 칩은 탭하면 화면 70% 로 펼친다(바깥 탭 = 접기). 펼친 미니맵·넓은 화면의 미니맵은 탭·끌기 = 카메라
    // (무장 중 탭 = 그 지점에 명령, 마우스와 같다). 길게 누르기(핑 종류 고르기)는 netui 가 받으므로 오래 누른 탭은 카메라를 옮기지 않는다.
    const dockBox = q('[data-hud=dock]'), scrim = q('[data-hud=mm-scrim]'), chipMQ = matchMedia('(max-width: 767px)');
    let mmBig = false, mmTouch = null;
    function setMmBig(on) {
      if (on === mmBig) return;
      mmBig = on; dockBox.classList.toggle('is-mm-big', on); scrim.hidden = !on;
      if (on) { const s = Math.round(mini.getBoundingClientRect().width); if (s > 0) { mini.width = s; mini.height = s; } } // 펼친 동안 내부 해상도 = 보이는 크기
      else dims = null; // 접으면 readDims 가 --mini 로 되돌린다
    }
    chipMQ.addEventListener('change', () => setMmBig(false));
    scrim.addEventListener('pointerdown', ev => { ev.preventDefault(); setMmBig(false); });
    addEventListener('pointerdown', ev => { if (mmBig && ev.target !== scrim && !mini.parentNode.contains(ev.target)) setMmBig(false); }, true); // 상단 바·아래 시트를 눌러도 접힌다(그 탭은 그대로 동작)
    mini.addEventListener('pointerdown', ev => {
      if (!isTouch(ev)) return;
      ev.preventDefault(); // 호환 mousedown(위의 마우스 경로) 막기
      const g = st(); if (!active || !g) return;
      if (chipMQ.matches && !mmBig) { setMmBig(true); return; }
      mmTouch = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, t0: performance.now(), moved: false };
      try { mini.setPointerCapture(ev.pointerId); } catch (e) { /* 캡처 실패 — 미니맵 안에서만 끌기 */ }
    });
    mini.addEventListener('pointermove', ev => {
      const t = mmTouch; if (!t || ev.pointerId !== t.id) return;
      if (!t.moved && Math.hypot(ev.clientX - t.x, ev.clientY - t.y) > SLOP) t.moved = true;
      if (t.moved && !mode) miniCam(ev);
    });
    mini.addEventListener('pointerup', ev => {
      const t = mmTouch; if (!t || ev.pointerId !== t.id) return;
      mmTouch = null;
      const g = st(); if (!active || !g || t.moved || performance.now() - t.t0 >= LONG_MS) return;
      if (mode && !mode.build && !mode.land) { const [x, y] = miniPoint(ev); targetClick(g, x, y, false); return; }
      miniCam(ev);
    });
    mini.addEventListener('pointercancel', () => { mmTouch = null; });

    addEventListener('keydown', ev => {
      if (!document.documentElement.dataset.kbd) document.documentElement.dataset.kbd = '1'; // 키 입력이 한 번이라도 들어오면 터치 화면에서도 키캡을 보인다
      const g = st(); if (!active || !g || (typeof NW_NETUI !== 'undefined' && NW_NETUI.typing)) return; // 채팅 입력 중엔 단축키 없음
      const k = ev.key, inRing = el.card.contains(document.activeElement);
      if (inRing && (k === 'ArrowLeft' || k === 'ArrowRight')) { // 링 칸 사이 이동(슬롯 순서, 꼬리 포함 순환) — 링 밖에선 카메라 스크롤
        ev.preventDefault();
        const vis = slots.filter(x => !x.node.hidden), i = vis.findIndex(x => x.node === document.activeElement);
        if (vis.length) vis[(i + (k === 'ArrowRight' ? 1 : -1) + vis.length) % vis.length].node.focus();
        return;
      }
      if (inRing && k === 'Enter' && ev.shiftKey) { // 자동 시전 토글(우클릭과 같다). 칸의 Enter 클릭은 막는다.
        ev.preventDefault();
        const d = curBtns.find(x => slots[x.slot].node === document.activeElement);
        if (d && d.alt) { d.alt(); flashPress(slots[d.slot].node); }
        return;
      }
      if (k === 'F6') { ev.preventDefault(); cycleRegion(ev.shiftKey ? -1 : 1, g); return; }
      if (k.startsWith('Arrow')) { keys[k] = true; ev.preventDefault(); if (!mouse.onCanvas || kbNav) kbNav = true; return; }
      if (ev.code && ev.code.startsWith('Digit')) {
        const n = ev.code.slice(5);
        ev.preventDefault();
        if (ev.ctrlKey || ev.metaKey) { const own = selEnts(g).filter(mine); if (own.length) groups[n] = own.map(e => e.id); return; }
        recallGroup(n, g); return;
      }
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      if (k === 'Tab') { // 전장에서: 링 열기 + 첫 칸 포커스 / 링 안에서: 접고 전장으로. 상단 바·계기 기둥 안에선 브라우저 기본 Tab.
        if (!inRing && !onField()) return;
        ev.preventDefault();
        if (inRing) { setRing('pin'); return; }
        focusRing(g, true);
        return;
      }
      if (k === 'F1') { ev.preventDefault(); pickIdle(ev.shiftKey); return; }
      if (ev.code === 'Space' || k === ' ') { // 마지막 알림 위치로(알림이 없었으면 무시). 버튼 위 포커스여도 클릭되지 않게 막는다.
        ev.preventDefault();
        if (!ev.repeat && lastAlert) centerOn(lastAlert.x, lastAlert.y);
        return;
      }
      if (k === 'Escape') {
        if (drag) { drag = null; view.drag = null; return; }
        if (mode) { mode = null; setRing('open', g); return; } // 무장 해제 → 링 다시 열림
        if (page !== 'main') { page = 'main'; return; }
        if (cpage > 0) { cpage = 0; return; }
        if (ringSt === 'open') setRing('pin'); // 사슬 끝: 링 접기
        return;
      }
      if (k === 'Enter' && kbNav && onField() && !ev.repeat) { // 키보드 커서(kbNav 일 때만 — 마우스 쓰는 중이면 Enter 는 채팅에 양보): 가운데 십자에 왼쪽 클릭(무장 = 실행, 이동 무장 = 문맥 명령). Shift = 대기열/추가 선택.
        ev.preventDefault(); viewport();
        const [sx, sy] = kbCenter();
        if (mode === 'move') { contextCommand(g, ...world(sx, sy)); mode = null; if (ringSt === 'open') setRing('pin'); }
        else if (mode) targetClick(g, ...world(sx, sy), ev.shiftKey);
        else clickSelect(g, sx, sy, ev.shiftKey);
        return;
      }
      // 한글 입력 상태면 ev.key 가 'ㅁ' 같은 자모로 온다 → 영문자가 아니면 물리 키(ev.code)로 판단. 영문 배열(Dvorak 등)은 ev.key 그대로.
      const key = /^[a-z]$/i.test(k) ? k.toUpperCase() : /^Key[A-Z]$/.test(ev.code || '') ? ev.code.slice(3) : k.length === 1 ? k.toUpperCase() : '';
      if (!key) return;
      curBtns = card(g); // 마지막 프레임 이후 선택/페이지가 바뀌었을 수 있다
      const d = curBtns.find(b => b.key === key);
      if (d) { ev.preventDefault(); runBtn(d); flashPress(slots[d.slot].node); blinkPin(); if (!mouse.in) kbArm(); } // 커서가 화면 밖(키보드만) = 가운데 조준
    });
    function kbArm() { if (!mode) return; kbNav = true; if (el.card.contains(document.activeElement)) document.activeElement.blur(); } // 링 칸에서 무장하면 포커스를 전장으로(Enter 가 칸을 다시 누르지 않게)
    addEventListener('keyup', ev => {
      if (ev.key.startsWith('Arrow')) keys[ev.key] = false;
      if (active && (ev.code === 'Space' || ev.key === ' ')) ev.preventDefault(); // 포커스된 버튼의 Space 클릭 방지
    });
    // 전장(캔버스) 포커스 = 아무 컨트롤에도 포커스가 없을 때
    const onField = () => { const a = document.activeElement; return !a || a === document.body || a === canvas || a === document.documentElement; };
    function focusRing(g, first) {
      if (ringSt === 'none') return false;
      setRing('open', g);
      const f = first ? slots.find(x => !x.node.hidden) : slots[roving];
      if (!f || f.node.hidden) return false;
      f.node.focus(); return true;
    }
    // F6 / Shift+F6 = 화면 영역 이동: 상단 바 → 명령 링 → 계기 기둥 → 전장(Tab 을 링에 쓰므로 영역 이동은 F6). 갈 데가 없는 영역은 건너뛴다.
    const dockEl = hud.querySelector('[data-hud=dock]'), barEl = hud.querySelector('.topbar');
    if (el.info && !el.info.hasAttribute('tabindex')) el.info.tabIndex = -1; // 버튼이 없는 선택 정보도 F6 로 닿아 읽히게
    function cycleRegion(dir, g) {
      const a = document.activeElement;
      const cur = barEl && barEl.contains(a) ? 0 : el.card.contains(a) ? 1 : dockEl && dockEl.contains(a) ? 2 : 3;
      const usable = b => !b.hidden && !b.closest('[hidden]') && b.getAttribute('aria-disabled') !== 'true' && b.offsetParent !== null;
      const go = [
        () => { const b = barEl && [...barEl.querySelectorAll('button')].find(usable); if (b) b.focus(); return !!b; },
        () => focusRing(g, false),
        () => { const b = dockEl && [...dockEl.querySelectorAll('button')].find(usable); const t = b || el.info; if (t) t.focus(); return !!t; },
        () => { if (a && a.blur) a.blur(); return true; },
      ];
      for (let n = 1; n <= 4; n++) if (go[(cur + dir * n + 8) % 4]()) return;
    }
    function flashPress(n) { n.classList.add('is-press'); setTimeout(() => n.classList.remove('is-press'), 90); }

    // ---- 호버 커서 ----
    // 포인터 아래 것(pick = known, 렌더와 같은 시야 규칙 — 안개 속 적은 안 잡힌다)과 무장 상태로 #main[data-cur] 를 고른다. 모양은 index.html CSS.
    // pick 은 엔티티를 한 바퀴 도니까 포인터·카메라가 그대로면 120ms 에 한 번만(밑으로 유닛이 지나가는 것만 따라잡는다).
    let curKind = '', curSig = '', curT = 0;
    function hoverCursor(g, now) {
      const on = active && mouse.in && mouse.onCanvas && !drag && !touch;
      const sig = on ? mouse.x + ',' + mouse.y + ',' + view.camX + ',' + view.camY : '';
      if (sig === curSig && now - curT < 120 && !mode) return;
      curSig = sig; curT = now;
      let k = '';
      if (!on) k = '';
      else if (mode === 'attack') k = 'attack';
      else if (mode) k = mode.build || mode.land ? '' : 'target'; // 건설·착륙은 고스트가 커서 노릇
      else {
        const t = pick(g, ...world(mouse.x, mouse.y)), units = spectate ? [] : myUnits(g);
        if (t && units.length && isEnemy(g, t)) k = 'attack';
        else if (t && (t.type === 'crystal' || gasBld(t)) && units.some(e => e.def.worker)) k = 'gather';
        else if (t) k = 'select';
      }
      if (k !== curKind) { curKind = k; if (k) canvas.dataset.cur = k; else delete canvas.dataset.cur; }
    }

    // ---- 매 프레임 ----
    function update(g) {
      viewport();
      // 죽었거나 안 보이게 된 선택 정리
      const alive = view.sel.filter(id => { const e = S.byId(g, id); return e && known(g, e); });
      if (alive.length !== view.sel.length) { const m = mode, pg = page, cp = cpage, sd = selDirty; setSel(alive); selDirty = sd; if (alive.length) { mode = m; page = pg; cpage = cp; } } // 죽어서 빠진 건 '선택 변경'이 아니다
      if (active) {
        let dx = 0, dy = 0;
        if (keys.ArrowLeft) dx -= SCROLL; if (keys.ArrowRight) dx += SCROLL; if (keys.ArrowUp) dy -= SCROLL; if (keys.ArrowDown) dy += SCROLL;
        if (mouse.in && !drag && !mmDrag) {
          if (mouse.x < EDGE) dx = -SCROLL; else if (mouse.x > canvas.width - EDGE) dx = SCROLL;
          if (mouse.y < EDGE) dy = -SCROLL; else if (mouse.y > canvas.height - EDGE) dy = SCROLL;
        }
        if (kbNav && (dx || dy)) { kbAxis(dx, 0, view.vw / 2 - 16); kbAxis(dy, 1, view.vh / 2 - 16); dx = dy = 0; }
        view.camX += dx; view.camY += dy;
        if (drag && (dx || dy)) { drag.x0 -= dx; drag.y0 -= dy; }
      }
      clampCam();
      if (mode && mode.build && !myUnits(g).some(e => e.def.worker)) mode = null;
      if (mode && mode.land) { const b = S.byId(g, mode.land); if (!b || !b.lifted || !view.sel.includes(b.id)) mode = null; }
      if (mode === 'repair' && !engineers(g).length) mode = null;
      if (mode && !mode.build && !mode.land && !mode.cast && mode !== 'rally' && !movers(g).length) mode = null;
      if (mode && mode.cast && !casters(g, mode.cast).length) mode = null;
      if (mode && (mode.load || mode.unload) && !carriers(g).length) mode = null;
      if (kbNav && mode) aimAt(...kbCenter());
      if (kbCross.hidden === kbNav) kbCross.hidden = !kbNav;
      if (kbNav) { const [cx, cy] = kbCenter(), tr = 'translate3d(' + Math.round(cx) + 'px,' + Math.round(cy) + 'px,0)'; if (kbCross.style.transform !== tr) kbCross.style.transform = tr; }
      view.aim = null; // 조준 커서: 커서 위치 효과 반경 + 시전자 사거리 원(render 3a 블록)
      if (mode && mode.cast && mouse.onCanvas) {
        const A = D.abilities[mode.cast], ef = A.effect, [wx, wy] = world(mouse.x, mouse.y), cs = casters(g, mode.cast);
        const r = ef.kind === 'area_dot' || ef.kind === 'aura' ? ef.r : ef.kind === 'reveal' ? ef.r * TILE : 0;
        let tgt = null;
        if (A.target === 'unit') { const t = pick(g, wx, wy); if (t && cs.some(e => castOk(g, e, A, t))) tgt = { x: t.x / FP, y: t.y / FP, r: t.def.radius || 12, air: !!t.def.air }; }
        view.aim = { x: wx, y: wy, r, range: A.range, unit: A.target === 'unit', tgt, from: cs.filter(e => !e.isB).map(e => [e.x / FP, e.y / FP]) };
      }
      if (mode === 'rally' && !myBlds(g).length) mode = null;
      if (mode && (mode.build || mode.land) && mouse.onCanvas) {
        const [wx, wy] = world(mouse.x, mouse.y);
        if (mode.build) {
          const [tx, ty] = ghostTile(g, wx, wy, mode.build), w = nearestWorker(g, tx, ty);
          view.ghost = { what: mode.build, tx, ty, ok: !!w && !S.canPlace(g, me, mode.build, tx, ty, w.id) };
        } else {
          const b = S.byId(g, mode.land), [tx, ty] = ghostTile(g, wx, wy, b.type);
          view.ghost = { what: b.type, tx, ty, ok: landOk(g, b.type, tx, ty) };
        }
      } else view.ghost = null;
      canvas.classList.toggle('is-targeting', !!mode && !mode.build && !mode.land);
      const now = performance.now();
      hoverCursor(g, now);
      for (let i = marks.length - 1; i >= 0; i--) { const m = marks[i]; m.age = (now - m.t0) / m.ms; if (m.age >= 1) marks.splice(i, 1); } // 명령 확인 표시 나이
      view.marks = marks;
      updateAlerts(); renderIdle(g);
      renderTop(g); renderInfo(g); renderCard(g); updateRing(g);
    }

    function onEvents(events) {
      const g = st();
      for (const ev of events) {
        if (ev.t === 'attack' && g) { // 피격 알림: 맞은 쪽(b)이 내 것이고 때린 쪽이 내 것이 아니면
          const b = S.byId(g, ev.b), a = S.byId(g, ev.a);
          if (!spectate && b && b.owner === me && !(a && a.owner === me)) alertHit(g, b, a && S.hidden(g, me, a) ? '위장 유닛 감지됨 — 탐지기가 필요합니다' : '');
          continue;
        }
        if (ev.t !== 'death') continue;
        if (view.sel.includes(ev.id)) view.sel = view.sel.filter(id => id !== ev.id);
        for (const n in groups) groups[n] = groups[n].filter(id => id !== ev.id);
      }
    }

    function start() {
      const g = st();
      cmds = []; pend = freshPend(); groups = {}; mode = null; page = 'main'; cpage = 0; drag = null; mmDrag = false; infoSig = null; setRing('none'); selDirty = false;
      view.sel = []; view.drag = null; view.ghost = null; marks.length = 0;
      for (const k in keys) keys[k] = false;
      el.notice.classList.remove('is-on');
      clearAlerts(); hideTip(); idleLast = 0; idleCount = -1;
      el.idleIcon.innerHTML = ''; el.idleIcon.appendChild(R.icon(D.races[g.players[me].race].worker, me, 24));
      const base = g.ents.find(e => e.owner === me && e.isB);
      if (base) centerOn(base.x / FP, base.y / FP);
      active = true;
    }

    return {
      view, update, onEvents, start,
      resume() { active = true; },
      // 관전 모드: 켜면 명령·알림·노는 일꾼을 끄고 명령 카드를 비운다(선택·카메라는 그대로).
      // asObserver = 리플레이 시청(소유 표시를 '나/적' 대신 P 번호로). 게임 중 탈락 관전은 false(내 기준 표시 유지).
      setSpectate(on, asObserver = false) { spectate = !!on; observer = spectate && !!asObserver; el.idle.hidden = spectate; cmds = []; mode = null; page = 'main'; cpage = 0; infoSig = null; if (spectate) clearAlerts(); },
      // vision = 플레이어 번호(그 팀의 공유 시야) | 'all'(전체 시야 — 기준 번호는 0을 쓰되 안개를 보지 않는다)
      setVision(v) { const g = st(); seeAll = v === 'all'; me = seeAll ? 0 : Number.isInteger(v) && v >= 0 && (!g || v < g.players.length) ? v : 0; view.me = me; infoSig = null; idleCount = -1; },
      get spectate() { return spectate; }, centerOn,
      // 설정 "선택하면 명령 링 자동 열기"(localStorage 'nw-ring-auto', 저장 못 해도 이번 세션은 적용)
      get ringAuto() { return ringAuto; },
      setRingAuto(v) { ringAuto = !!v; try { localStorage.setItem(RING_AUTO_KEY, ringAuto ? '1' : '0'); } catch (e) { /* 저장 못 해도 이번 세션은 적용 */ } },
      get ring() { return ringSt; },
      stop() { active = false; endTouch(null, true); closeSheet(); setMmBig(false); drag = null; view.drag = null; mmDrag = false; hideTip(); for (const k in keys) keys[k] = false; },
      takeCommands() { const c = cmds; cmds = []; pend = freshPend(); return c; },
      notify,
      get lastAlert() { return lastAlert; }, get alerts() { return alerts.length; }, idleWorkers: () => idleWorkers(st()).map(e => e.id),
    };
  }

  return { create };
})();
