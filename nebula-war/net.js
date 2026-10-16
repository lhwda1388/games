// 네뷸라 워 — P2P 록스텝(피어 메시). sim 은 모른다: 명령 형식·체크섬은 sim(S.step/S.checksum)·replay(NW_REPLAY.record) 그대로.
// 시간도 갖지 않는다: 바깥 시계(clock.js 등)가 매 틱 sess.tick() 을 부르고, 대기 시간 계산용 now() 만 주입받는다.
//
// 전제: 세션은 메시 연결이 안정된 뒤(피어당 연결 하나) 시작한다. chat text·ping kind 는 신뢰할 수 없는 입력 —
//   UI 는 textContent 로만 그리고 kind 는 화이트리스트로 거른다.
//
// 신뢰 모델(서명 없음): 피어 메시지는 전부 믿지 않는다. 형식·범위·명령 필드(sim 이 읽는 것만, 타입별)를 검사하고 어긋나면 버린다.
//   잘 짜인 턴의 묶음이 검사에 걸리거나, 내보내기 공지가 부풀린 have·빈틈 있는 중계 묶음을 보내면 '오작동' 으로 보고 그 피어를 내보낸다.
//   그러나 서명이 없으므로 중계된 묶음(다른 피어 것)·dropFinal 은 중계자를 믿는다 — 악의적 피어 하나가 남의 묶음을 지어내 중계하거나
//   거짓 체크섬으로 desync 를 일으키는 것까지는 막지 못한다(감지는 체크섬이 한다). 또 “p 가 안 들린다” 는 거짓말과 구별할 수 없으므로
//   아무 피어나 정상 범위의 drop 공지로 다른 피어를 내보낼 수 있다(내보내기는 전염 — 모두가 같은 결론에 닿는 쪽을 택함).
//   목표: 정직한 피어는 잘못된 입력 하나로 멈추거나
//   예외로 죽지 않고, 정직한 피어끼리는 같은 명령열(같은 체크섬)을 실행한다.
//
// 세션 sess = session({ sim, game, self, peers, transport, ... })
//   peers[i] = 플레이어 i 의 피어 id(사람) | null(AI·빈자리 — 모든 피어가 같이 계산, 명령 전송 없음). peers[self] = transport.id.
//   turnTicks(2) 틱 = 한 턴. 턴 n 시작(틱 n·T, 그 틱 실행 직전)에 로컬 대기열을 턴 n + delayTurns(2) 묶음으로 보낸다
//     → 입력 지연 4~6틱(200~300ms). 묶음 명령은 그 턴 첫 틱에 실행. 턴은 모든 사람 피어의 묶음(빈 묶음 포함)이 와야 시작.
//   sess.queue(cmd) → 실행 턴 | -1   로컬 명령 예약(player 는 self 로 강제, 받는 쪽과 같은 검사 — 통과 못 하면 -1).
//     한 턴 묶음은 MAX_CMDS(256)개까지, 넘치면 다음 턴으로. 받은 명령도 player = 보낸 피어의 자리로 강제(위조 방지).
//   sess.tick() → events | null   한 틱 진행(S.step 이벤트) 또는 대기(null). 바깥 시계가 고정 간격으로 부른다.
//   sess.ready()           지금 tick() 이 진행되는지. 대기 시간도 여기서 잰다(lag·하트비트·hello 재전송·자동 내보내기).
//     clock.js 연결: NW_CLOCK.create({ step: 50, tick: () => handle(sess.tick()), canTick: sess.ready }).background(true)
//   sess.drift() → 1 | 1.05   시계 늘이기 배율: 가장 느린 피어(추정)보다 한 턴(T 틱) 넘게 앞서면 1.05(스텝 간격 ×1.05 권장), 아니면 1.
//     cmd·hb 메시지가 보낸 쪽 틱을 싣는다. 록스텝 자체가 간격을 묶지만 앞선 쪽이 매 턴 멈칫하는 대신 살짝 느려지게 한다.
//   sess.status() → { state, tick, turn, waiting:[자리], waitingMs, lagging, players:['live'|'dropping'|'dropped'|'ai'] }
//     state: 'running' | 'desync' | 'mismatch' | 'dropped'(내가 쫓겨남) | 'error'(sim 예외·프로토콜 모순) | 'closed'
//   sess.drop(p)           p 를 내보낸다(“기다릴까요?” 질문 뒤 UI 가 부르는 경로). autoDrop 이면 dropAfterMs 동안 아무 메시지도
//     없는(하트비트 포함) 피어만 자동으로 — 남을 기다리느라 멈춘 피어는 hb 를 보내므로 탓하지 않는다.
//   sess.chat(text, scope='all'|'team') / sess.ping(x, y, kind)   록스텝·체크섬과 무관한 별도 채널(이벤트로만 전달).
//     받는 쪽도 팀 범위를 다시 검사하고(팀 채팅·핑은 같은 팀 것만), 핑 좌표는 지도 안으로 자르고, 채팅은 피어마다 3초에 5개까지.
//   sess.close()
//   onEvent(ev): {type:'lag', waiting, ms} {type:'resume', ms} {type:'dropping', player} {type:'drop', player, turn}
//     {type:'dropped'} {type:'desync', tick, mine, theirs:{자리:ck}, player, recent:[[tick, cmd]…]} {type:'mismatch', player, field}
//     {type:'chat', player, text, scope} {type:'ping', player, x, y, kind} {type:'error', reason, message}
//   체크섬: ckEvery(20)틱마다 S.checksum 교환, 불일치 → 'desync' 후 정지. 시작 핸드셰이크 hello = 버전·초기 체크섬(시드·맵·명단)·턴 설정.
//     hello 는 helloOk 될 때까지 transport.onopen 과 대기 중 1초마다 다시 보낸다(받으면 ack 로 한 번 답).
//   대기 중에는 500ms 마다 {t:'hb', waitingOn, tick} 을 보낸다(살아 있음 표시 — 자동 내보내기는 마지막으로 들은 시각 기준).
//
//   끊김(내보내기) 프로토콜: transport.onclose·자동·수동으로 p 를 'dropping' 으로 → 남은 피어 각자 “p 묶음을 어디까지 받았나(have)” 를
//     한 번 정해(이후 그 턴보다 뒤로는 진행하지 않는다) {t:'drop', p, have, co, b} 로 알린다(b = have 까지의 연속 묶음 중계, co = 내가 보는 조정자).
//     공지를 받은 피어도 p 를 dropping 으로 따라 한다. 조정자 = 살아 있는(live) 사람 자리 중 가장 작은 번호. 조정자는 live 피어 전원의
//     공지(co = 자기)가 모이면 F = max(have) 를 정해 {t:'dropFinal', p, F, b} 를 보내고, 받은 피어는 그대로 적용·재전파한다(모두 같은 F).
//     턴 F 까지는 그 묶음대로, 턴 F+1 첫 틱에 {player, type:'surrender'} 주입 → sim 규칙대로 탈락.
//     조정자가 내보내지면 다음 번호가 조정자 — 각자 미확정 내보내기를 co = 새 조정자로 다시 공지하고, 이미 확정한 피어는 공지를 받으면
//     dropFinal 로 답하므로 앞 조정자가 일부에게만 보낸 F 도 그대로 이어진다.
//     have 가 내 턴 + 2·DL + 1 보다 크거나 중계 묶음에 빈틈이 있으면 공지한 피어를 내보낸다. 나를 내보내는 공지는 다른 live 피어
//     과반이 보냈을 때만 받아들인다(state 'dropped').
//
// 전송 계층 transport = { id, send(to, msg), peers() → [id], onmessage(from, msg), onclose(id), onopen(id)?, close() }  (msg = JSON 가능 객체)
//   loopback({ now, latency, jitter, seed }) → hub   node 테스트용 메모리 전송(지연·흔들림·순서 뒤바뀜). hub.endpoint(id), hub.deliver(),
//     hub.disconnect(id), hub.cut(a, b), hub.heal(a, b), hub.stats = { sent, delivered, reordered }
//   openPeer({ id, signaling, Peer, mesh, roster, peerUrl, integrity, timeoutMs, connectTimeoutMs }) → Promise<transport + connect(id) + setRoster(ids)>
//     PeerJS(WebRTC). signaling = new Peer 옵션 그대로(host/port/path/secure/key/config.iceServers — 지금은 공개 PeerJS 서버, 나중에 자체 서버).
//     Peer 미주입 시 loadPeerJS(peerUrl) 로 처음 쓸 때만 불러온다: 기본은 CDN peerjs@1.5.4 + SRI(PEERJS_SRI)·crossOrigin,
//     peerUrl 로 자체 호스팅 파일을 줄 수 있다(integrity 는 그때 직접, 없으면 생략). file:// 와 http(s) 모두 같은 방식.
//     mesh: 연결이 열릴 때마다 아는 피어 목록(최대 16, roster 가 있으면 그 안의 id 만)을 소문내고, id 가 작은 쪽이 큰 쪽에 연결
//     → 방장 하나에만 붙어도 전원 메시가 된다. 같은 상대와 연결이 둘 생기면(동시에 서로 연결) 양쪽 모두 작은 id 쪽이 연 연결을 쓰고
//     다른 하나는 그 연결로 데이터가 오면 닫는다. connect(id) 는 connectTimeoutMs 안에 열리지 않으면 Error('timeout') 로 거부.
const NW_NET = (() => {
  const PEERJS_URL = 'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js';
  // sha384 of the exact file above (92865 bytes; sha256 matches data.jsdelivr.com's published hash rV2IcNHj…)
  const PEERJS_SRI = 'sha384-nlUQ8ZqCbvStErob+biJNzSgltf6urV3VGqhfIfzhmg9RXmpeRm76ELw0pYnKlTR';
  const MAX_CMDS = 256, MAX_IDS = 1024, MAX_AHEAD = 64, KEEP_TURNS = 64, KEEP_CK = 64, RECENT = 200, CHAT_MAX = 200, NAME_MAX = 32;
  const HB_MS = 500, HELLO_MS = 1000, CHAT_BURST = 5, CHAT_WINDOW = 3000, MAX_MESH = 16, ID_MAX = 2 ** 31 - 1;
  const HELLO_KEYS = ['v', 'ck0', 'tick0', 'T', 'DL', 'ckEvery', 'peers'];
  const clone = c => JSON.parse(JSON.stringify(c));
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const isInt = Number.isInteger;
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const defNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // 명령 타입별 필드(sim.applyCommands 가 읽는 것만): 1 = 필수, 0 = 선택. ids 는 모두 선택(sim: c.ids || []). 그 밖의 필드는 버린다.
  const XY = { ids: 0, x: 1, y: 1 }, TGT = { ids: 0, target: 1 }, IDS = { ids: 0 }, WHAT = { ids: 0, what: 1 };
  const CMD = {
    move: XY, attackMove: XY, patrol: XY, setRally: XY,
    attack: TGT, gather: TGT, repair: TGT, load: TGT,
    stop: IDS, hold: IDS, merge: IDS, lift: IDS, burrow: IDS, unburrow: IDS, siege: IDS, unsiege: IDS,
    train: WHAT, research: WHAT, morph: WHAT,
    build: { ids: 0, what: 1, tx: 0, ty: 0 }, land: { ids: 0, tx: 1, ty: 1 },
    cast: { ids: 0, what: 1, target: 0, x: 0, y: 0 }, autocast: { ids: 0, what: 1, on: 0 },
    unload: { ids: 0, unit: 0, x: 0, y: 0 }, surrender: {},
  };
  // 필드 종류: ids(정수 id 배열) xy(고정소수 좌표) tx/ty(타일) id(엔티티 id) name(데이터 키) bool
  const KIND = { ids: 'ids', x: 'xy', y: 'xy', tx: 'tx', ty: 'ty', target: 'id', unit: 'id', what: 'name', on: 'bool' };

  // 명령 검사기: 지도 크기·데이터 키로 범위를 잡는다. 통과 → 허용 필드만 담은 새 명령(player = p), 실패 → null.
  function commandCheck(S, g) {
    const D = S.D, TFP = S.TFP || 8192, mw = g.map.w, mh = g.map.h, LIM = Math.max(mw, mh) * TFP;
    const names = new Set();
    if (D) for (const t of ['units', 'buildings', 'upgrades', 'abilities']) if (D[t]) for (const k of Object.keys(D[t])) names.add(k);
    const okName = v => typeof v === 'string' && v.length <= NAME_MAX && (D ? names.has(v) : /^[A-Za-z][\w-]*$/.test(v) && !(v in {}));
    const ok = {
      ids: v => Array.isArray(v) && v.length <= MAX_IDS && v.every(x => isInt(x) && x >= 0 && x <= ID_MAX),
      xy: v => isInt(v) && v >= -LIM && v <= 2 * LIM, // UI 는 지도 가장자리 조금 밖도 찍는다(카메라 여백) — 넉넉하게
      tx: v => isInt(v) && v >= 0 && v < mw, ty: v => isInt(v) && v >= 0 && v < mh,
      id: v => isInt(v) && v >= 0 && v <= ID_MAX, name: okName, bool: v => typeof v === 'boolean',
    };
    return (c, p) => {
      if (!isObj(c) || typeof c.type !== 'string' || !has(CMD, c.type)) return null;
      const sc = CMD[c.type], x = { type: c.type, player: p };
      for (const k of Object.keys(sc)) {
        const v = c[k];
        if (v === undefined) { if (sc[k]) return null; continue; }
        if (!ok[KIND[k]](v)) return null;
        x[k] = Array.isArray(v) ? v.slice() : v;
      }
      return x;
    };
  }

  function session(o) {
    const { sim: S, game: g, self, peers, transport: tr, turnTicks: T = 2, delayTurns: DL = 2, ckEvery = 20,
      now = defNow, lagMs = 500, dropAfterMs = 10000, autoDrop = true, stepMs = 50, rec = null, extra = null, version = null, onEvent = () => {} } = o;
    const N = g.players.length;
    if (!Array.isArray(peers) || peers.length !== N || peers[self] !== tr.id || g.tick % T !== 0) throw new Error('net-config');
    const humans = [];
    const peerOf = new Map();
    peers.forEach((id, p) => { if (id !== null && id !== undefined) { humans.push(p); peerOf.set(id, p); } });
    const st = peers.map(id => (id === null || id === undefined ? 'ai' : 'live'));
    const tStart = g.tick / T + DL;          // 이보다 앞 턴은 모두 빈 묶음(암묵)
    const bundles = peers.map(() => new Map()), have = peers.map(() => tStart - 1);
    const hello = { t: 'hello', v: version, ck0: S.checksum(g), tick0: g.tick, T, DL, ckEvery, peers };
    const helloOk = new Set([self]);
    const mine = new Map(), theirs = new Map(), recent = [];
    const drops = new Map(); // p → { mine: 내가 공지한 have(고정), ann: Map(자리 → {have, co}), final? }
    const t0 = now(), lastHeard = peers.map(() => t0), peerTick = new Map(), chatLog = new Map(), selfDropBy = new Set();
    const sentAt = new Map(), rtt = new Map(), lastLead = new Map(); // 내가 보낸 틱 → 시각, 자리 → 왕복 표본(최근 16개, 최솟값 사용)
    const norm = commandCheck(S, g), mw = g.map.w * (S.TFP || 8192) - 1, mh = g.map.h * (S.TFP || 8192) - 1;
    let state = 'running', pending = [], flushed = -1, stallSince = null, lagging = false, lastHb = -Infinity, lastHello = t0;

    const emit = ev => { try { onEvent(ev); } catch (e) { /* UI 오류가 록스텝을 멈추지 않게 */ } };
    const live = () => humans.filter(p => st[p] === 'live');
    const coordinator = () => live()[0]; // 나는 running 인 동안 항상 live
    let lastCo = coordinator();
    const send = (p, m) => { if (p !== self) tr.send(peers[p], m); };
    const toLive = m => { for (const p of live()) send(p, m); };
    const contiguous = p => { while (bundles[p].has(have[p] + 1)) have[p]++; };
    const curTurn = () => g.tick / T | 0;
    const executed = () => Math.floor((g.tick - 1) / T); // 첫 틱까지 실행한 마지막 턴
    const prefix = (p, upTo) => [...bundles[p]].filter(([k]) => k <= Math.min(upTo, have[p])).sort((a, b) => a[0] - b[0]);
    function fail(reason, e) {
      if (state !== 'running') return;
      state = 'error';
      emit({ type: 'error', reason, message: e ? String(e && e.message || e) : reason });
    }
    // 오작동한 피어(검사 걸린 묶음·부풀린 have·빈틈 중계·거짓 dropFinal)는 내보낸다
    const misbehave = q => { if (q !== undefined && q !== null && q !== self && st[q] === 'live') drop(q); };

    // 묶음 저장: 형식이 틀리거나 범위 밖 턴은 조용히 버리고, 범위 안 턴인데 명령 검사에 걸리면 false(오작동)
    function store(p, turn, cmds) {
      if (!isInt(turn) || turn < tStart || turn > curTurn() + DL + MAX_AHEAD || bundles[p].has(turn)) return true;
      if (!Array.isArray(cmds) || cmds.length > MAX_CMDS) return false;
      const out = [];
      for (const c of cmds) { const x = norm(c, p); if (!x) return false; out.push(x); } // 하나라도 틀리면 묶음 전체 거부
      bundles[p].set(turn, out);
      contiguous(p);
      return true;
    }

    // ---- 내보내기 ----
    // 중계 묶음 검사(저장 없음): have[p]+1..upTo 를 (가진 것 + b) 로 빈틈 없이 채우고 명령 검사도 통과해야 한다.
    //   정상 → 새로 저장할 Map(턴 → 명령), 오작동 → null. b 의 upTo 넘는 턴·이미 가진 턴은 무시.
    function relay(p, upTo, b) {
      const got = new Map();
      if (Array.isArray(b)) for (const e of b) {
        if (!Array.isArray(e) || !isInt(e[0]) || e[0] > upTo || e[0] <= have[p] || bundles[p].has(e[0]) || got.has(e[0])) continue;
        if (!Array.isArray(e[1]) || e[1].length > MAX_CMDS) return null;
        const out = [];
        for (const c of e[1]) { const x = norm(c, p); if (!x) return null; out.push(x); }
        got.set(e[0], out);
      }
      for (let n = have[p] + 1; n <= upTo; n++) if (!got.has(n) && !bundles[p].has(n)) return null;
      return got;
    }
    const put = (p, got) => { for (const [k, v] of got) bundles[p].set(k, v); contiguous(p); };

    function announce(p) {
      const d = drops.get(p);
      const ep = st.filter(x => x !== 'live').length; // 공지 세대: 비-live 자리 수(늘기만 한다) — 뒤바뀐 옛 공지를 거른다
      d.ann.set(self, { have: d.mine, co: lastCo, ep });
      const m = { t: 'drop', p, have: d.mine, co: lastCo, ep, b: prefix(p, d.mine) };
      toLive(m); send(p, m); // 당사자에게도(살아 있으면 '쫓겨남' 을 안다)
    }
    // 조정자가 바뀌면 미확정 내보내기를 새 조정자 기준으로 다시 공지
    function coCheck() {
      const c = coordinator();
      if (c === lastCo) return false;
      lastCo = c;
      for (const [p, d] of drops) if (d.final === undefined) announce(p);
      return true;
    }
    function drop(p) {
      if (state !== 'running' || p === self || st[p] !== 'live') return;
      st[p] = 'dropping';
      for (const mp of theirs.values()) mp.delete(p); // 내보낸 피어의 옛 체크섬은 검사에서 뺀다
      drops.set(p, { mine: have[p], ann: new Map() });
      if (!coCheck()) announce(p);
      emit({ type: 'dropping', player: p });
      selfDropCheck();
      resolve();
    }
    const finalMsg = p => ({ t: 'dropFinal', p, F: drops.get(p).final, b: prefix(p, drops.get(p).final) });
    // 조정자만 F 를 정한다: live 전원이 co = 나 로 공지했을 때
    function resolve() {
      if (state !== 'running' || coordinator() !== self) return;
      const L = live();
      for (const [p, d] of drops) {
        if (d.final !== undefined || !L.every(q => d.ann.has(q) && d.ann.get(q).co === self)) continue;
        let F = -Infinity;
        for (const q of L) F = Math.max(F, d.ann.get(q).have);
        finalize(p, F, null, null);
      }
    }
    // F 적용(내가 정했든 받았든): 묶음이 F 까지 이어져야 하고, 이미 실행한 턴보다 앞이면 안 된다. 적용 후 live 전원에게 재전파.
    function finalize(p, F, b, from) {
      const d = drops.get(p);
      if (state !== 'running' || !d || d.final !== undefined) return;
      const got = relay(p, F, b);
      if (!got) { misbehave(from); return; }
      put(p, got);
      if (F < executed()) { fail('drop-final'); return; }
      d.final = F; st[p] = 'dropped';
      emit({ type: 'drop', player: p, turn: F + 1 });
      toLive(finalMsg(p));
      selfDropCheck();
    }
    // 나를 내보내는 공지: 다른 live 피어 과반이 보냈을 때만
    function selfDropCheck() {
      if (state !== 'running' || !selfDropBy.size) return;
      const others = live().filter(q => q !== self);
      if ([...selfDropBy].filter(q => st[q] === 'live').length * 2 > others.length) { state = 'dropped'; emit({ type: 'dropped' }); }
    }
    function onDrop(s, m) {
      if (!isInt(m.p) || !isInt(m.have) || m.p < 0 || m.p >= N || m.p === s) return;
      if (m.p === self) { selfDropBy.add(s); selfDropCheck(); return; }
      if (st[m.p] === 'ai') return;
      if (m.have < tStart - 1 || m.have > curTurn() + 2 * DL + 1) { misbehave(s); return; } // 부풀린 have → 정직한 피어를 영원히 묶는다
      const d0 = drops.get(m.p);
      if (d0 && d0.final !== undefined) { send(s, finalMsg(m.p)); return; } // 이미 확정 → 알려 준다(새 조정자·늦은 피어)
      const got = relay(m.p, m.have, m.b);
      if (!got) { misbehave(s); return; } // 중계 묶음 빈틈·검사 실패 — p 를 내보내기 전에 거른다
      if (st[m.p] === 'live') drop(m.p);
      const d = drops.get(m.p);
      if (!d || state !== 'running' || st[m.p] !== 'dropping') return;
      put(m.p, got); // 중계 묶음은 p 가 dropping 일 때, 공지한 have 까지만
      const old = d.ann.get(s), ep = isInt(m.ep) ? m.ep : 0;
      if (!old || old.ep <= ep) d.ann.set(s, { have: m.have, co: isInt(m.co) ? m.co : -1, ep });
      resolve();
    }
    function onDropFinal(s, m) {
      if (!isInt(m.p) || !isInt(m.F) || m.p < 0 || m.p >= N || m.p === self || m.p === s || st[m.p] === 'ai') return;
      // 진짜 F 는 조정자가 내 공지를 받은 뒤에만 나온다 → 내가 아직 live 로 보는 자리의 F 는 늦게 온 것도 아니고 받을 이유가 없다
      if (st[m.p] !== 'dropping') return;
      if (m.F < tStart - 1 || m.F > curTurn() + 2 * DL + 1) { misbehave(s); return; }
      finalize(m.p, m.F, m.b, s);
    }

    // ---- 받기 ----
    function onChat(p, m) {
      if (typeof m.text !== 'string' || !m.text.trim()) return;
      const scope = m.scope === 'team' ? 'team' : 'all';
      if (scope === 'team' && g.players[p].team !== g.players[self].team) return;
      const t = now(), log = (chatLog.get(p) || []).filter(x => t - x < CHAT_WINDOW);
      chatLog.set(p, log);
      if (log.length >= CHAT_BURST) return;
      log.push(t);
      emit({ type: 'chat', player: p, text: m.text.trim().slice(0, CHAT_MAX), scope });
    }
    const clampI = (v, a, b) => (v < a ? a : v > b ? b : v);
    tr.onmessage = (from, m) => {
      const p = peerOf.get(from);
      if (state !== 'running' || p === undefined || p === self || st[p] !== 'live' || !isObj(m) || typeof m.t !== 'string') return;
      lastHeard[p] = now();
      if ((m.t === 'cmd' || m.t === 'hb') && isInt(m.tick)) {
        if (!(peerTick.has(p) && peerTick.get(p).tick >= m.tick)) peerTick.set(p, { tick: m.tick, at: now() });
        const k = Array.isArray(m.seen) ? m.seen[self] : null; // 상대가 마지막으로 받은 내 틱 → 왕복 시간 표본
        if (isInt(k) && sentAt.has(k)) { const l = rtt.get(p) || []; l.push(now() - sentAt.get(k)); if (l.length > 16) l.shift(); rtt.set(p, l); }
        const r = rtt.get(p), lead = lastLead.get(p) || [];  // 받은 순간 내가 얼마나 앞섰나 = 내 틱 − (상대 틱 + 편도)
        lead.push(g.tick - m.tick - Math.round((r && r.length ? Math.min(...r) / 2 : 0) / stepMs));
        if (lead.length > 8) lead.shift();
        lastLead.set(p, lead);
      }
      if (m.t === 'hello') {
        if (!helloOk.has(p)) {
          for (const k of HELLO_KEYS)
            if (JSON.stringify(m[k]) !== JSON.stringify(hello[k])) { send(p, { ...hello, ack: true }); state = 'mismatch'; emit({ type: 'mismatch', player: p, field: k }); return; }
          helloOk.add(p);
        }
        if (!m.ack) send(p, { ...hello, ack: true }); // 상대가 내 hello 를 못 받았을 수 있다 → 한 번 답(ack 에는 답하지 않음)
      } else if (m.t === 'cmd') { if (!store(p, m.turn, m.cmds)) misbehave(p); }
      else if (m.t === 'ck') {
        if (!isInt(m.tick) || !isInt(m.ck) || m.tick % ckEvery !== 0 || m.tick <= g.tick - KEEP_CK * ckEvery || m.tick > g.tick + MAX_AHEAD * T) return;
        if (!theirs.has(m.tick)) theirs.set(m.tick, new Map());
        if (!theirs.get(m.tick).has(p)) theirs.get(m.tick).set(p, m.ck);
        check(m.tick);
      } else if (m.t === 'drop') { if (helloOk.has(p)) onDrop(p, m); }
      else if (m.t === 'dropFinal') { if (helloOk.has(p)) onDropFinal(p, m); }
      else if (m.t === 'chat') onChat(p, m);
      else if (m.t === 'ping') {
        if (!isInt(m.x) || !isInt(m.y) || g.players[p].team !== g.players[self].team) return;
        emit({ type: 'ping', player: p, x: clampI(m.x, 0, mw), y: clampI(m.y, 0, mh), kind: typeof m.kind === 'string' ? m.kind.slice(0, 16) : 'ping' });
      }
    };
    tr.onclose = id => { const p = peerOf.get(id); if (p !== undefined) drop(p); };
    const prevOpen = tr.onopen;
    tr.onopen = id => {
      if (prevOpen) prevOpen(id);
      const p = peerOf.get(id);
      if (state === 'running' && p !== undefined && p !== self && st[p] === 'live' && !helloOk.has(p)) send(p, hello);
    };

    function check(tick) {
      if (state !== 'running' || !mine.has(tick) || !theirs.has(tick)) return;
      const my = mine.get(tick);
      for (const [p, ck] of theirs.get(tick)) {
        if (ck === my || st[p] !== 'live') continue;
        state = 'desync';
        emit({ type: 'desync', tick, mine: my, theirs: Object.fromEntries(theirs.get(tick)), player: p, recent: recent.slice() });
        return;
      }
    }

    // ---- 진행 ----
    // 턴 n 에 막고 있는 자리들. 내보내는 중(미확정)인 자리는 내가 공지한 턴까지만 그 묶음으로 가고, 그 뒤는 F 를 기다린다
    //   → 조정자가 나면 아직 co = 나 로 공지 안 한 live 피어, 아니면 조정자.
    function blockers(n) {
      const w = new Set();
      for (const p of humans) {
        if (p === self || st[p] === 'dropped') continue;
        if (st[p] === 'live') { if (!helloOk.has(p) || n >= tStart && !bundles[p].has(n)) w.add(p); continue; }
        const d = drops.get(p);
        if (n < tStart || n <= d.mine && bundles[p].has(n)) continue;
        const c = coordinator();
        if (c !== self) w.add(c);
        else for (const q of live()) if (q !== self && !(d.ann.has(q) && d.ann.get(q).co === self)) w.add(q);
      }
      return [...w].sort((a, b) => a - b);
    }
    // 확정 안 된 내보내기는 공지한 턴까지만(blockers 가 비어도 — 예: 혼자 남음). 확정된 자리 묶음이 F 안쪽에서 빠지면 프로토콜 모순.
    function turnReady(n) {
      if (blockers(n).length) return false;
      for (const [p, d] of drops) {
        if (n < tStart) continue;
        if (d.final === undefined) { if (!(n <= d.mine && bundles[p].has(n))) return false; }
        else if (n <= d.final && !bundles[p].has(n)) { fail('drop-gap'); return false; }
      }
      return true;
    }
    const canGo = () => state === 'running' && (g.tick % T !== 0 || turnReady(g.tick / T));
    // ready() 는 대기 시간도 잰다(lag 이벤트·하트비트·hello 재전송·자동 내보내기): 시계가 canTick 으로 부르면 tick() 없이도 돈다.
    function ready() {
      if (canGo()) {
        if (stallSince !== null) { if (lagging) emit({ type: 'resume', ms: now() - stallSince }); stallSince = null; lagging = false; }
        return true;
      }
      if (state !== 'running') return false;
      const t = now();
      if (stallSince === null) stallSince = t;
      const ms = t - stallSince, waiting = blockers(g.tick / T);
      if (!lagging && ms >= lagMs) { lagging = true; emit({ type: 'lag', waiting, ms }); }
      if (t - lastHb >= HB_MS) { lastHb = t; toLive(stamp({ t: 'hb', waitingOn: waiting })); for (const [p, d] of drops) if (d.final === undefined) announce(p); } // 공지 재전송: hello 전에 온 공지는 버려진다
      if (t - lastHello >= HELLO_MS) { lastHello = t; for (const p of live()) if (!helloOk.has(p)) send(p, hello); }
      if (autoDrop) for (const p of waiting) if (t - lastHeard[p] >= dropAfterMs) drop(p);
      return canGo();
    }

    function tick() {
      if (!ready()) return null;
      const n = g.tick / T | 0, first = g.tick % T === 0;
      const cmds = [];
      if (first) {
        if (flushed < n) { // 내 턴 n+DL 묶음 확정·전송(MAX_CMDS 넘침은 다음 턴으로)
          flushed = n;
          const turn = n + DL, b = pending.splice(0, MAX_CMDS);
          bundles[self].set(turn, b); contiguous(self);
          toLive(stamp({ t: 'cmd', turn, cmds: b }));
        }
        for (let p = 0; p < N; p++) {
          const b = bundles[p].get(n);
          if (b && !(st[p] === 'dropped' && n > drops.get(p).final)) for (const c of b) cmds.push(clone(c));
          if (st[p] === 'dropped' && drops.get(p).final + 1 === n) cmds.push({ player: p, type: 'surrender' });
        }
        for (const b of bundles) for (const k of b.keys()) if (k < n - KEEP_TURNS) b.delete(k);
      }
      if (extra) for (const c of extra(g) || []) cmds.push(c);
      const tk = g.tick;
      if (rec) { if (typeof NW_REPLAY !== 'undefined') NW_REPLAY.record(rec, tk, cmds); else require('./replay.js').record(rec, tk, cmds); }
      for (const c of cmds) recent.push([tk, clone(c)]);
      if (recent.length > RECENT) recent.splice(0, recent.length - RECENT);
      let events;
      try { events = S.step(g, cmds); } catch (e) { fail('step', e); return null; } // 검사를 빠져나간 입력이 sim 을 깨도 매 틱 다시 던지지 않는다
      if (rec) rec.ticks = g.tick;
      if (g.tick % ckEvery === 0) {
        const ck = S.checksum(g), lo = g.tick - KEEP_CK * ckEvery;
        mine.set(g.tick, ck);
        for (const k of mine.keys()) if (k <= lo) mine.delete(k);
        for (const k of theirs.keys()) if (k <= lo) theirs.delete(k);
        toLive({ t: 'ck', tick: g.tick, ck });
        check(g.tick);
      }
      return events;
    }

    // cmd·hb 에 내 틱과 “자리마다 마지막으로 받은 틱” 을 싣는다(drift 추정: 상대 틱 + 왕복/2)
    function stamp(m) {
      m.tick = g.tick; m.seen = peers.map((_, q) => (peerTick.has(q) ? peerTick.get(q).tick : null));
      sentAt.set(g.tick, now());
      for (const k of sentAt.keys()) if (k < g.tick - 64 * T) sentAt.delete(k);
      return m;
    }
    function queue(cmd) {
      if (state !== 'running') return -1;
      const c = norm(cmd, self);
      if (!c) return -1;
      const k = pending.push(c) - 1;
      return (g.tick % T === 0 && flushed < g.tick / T ? g.tick / T : (g.tick / T | 0) + 1) + DL + Math.floor(k / MAX_CMDS); // 실행될 턴
    }
    // 흔들림은 늦게만 만드므로 최근 8개 중 최솟값(가장 덜 늦은 표본)으로 본다
    function drift() {
      if (state !== 'running') return 1;
      for (const p of live()) {
        const l = p === self ? null : lastLead.get(p);
        if (l && l.length && Math.min(...l) > T) return 1.05;
      }
      return 1;
    }
    function chat(text, scope = 'all') {
      if (state !== 'running' || typeof text !== 'string' || !text.trim()) return false;
      const m = { t: 'chat', text: text.trim().slice(0, CHAT_MAX), scope: scope === 'team' ? 'team' : 'all' };
      for (const p of live()) if (m.scope === 'all' || g.players[p].team === g.players[self].team) send(p, m);
      emit({ type: 'chat', player: self, text: m.text, scope: m.scope });
      return true;
    }
    function ping(x, y, kind = 'ping') { // 지도 핑은 팀에게만
      if (state !== 'running' || !isInt(x) || !isInt(y)) return false;
      const m = { t: 'ping', x: clampI(x, 0, mw), y: clampI(y, 0, mh), kind: String(kind).slice(0, 16) };
      for (const p of live()) if (g.players[p].team === g.players[self].team) send(p, m);
      emit({ type: 'ping', player: self, x: m.x, y: m.y, kind: m.kind });
      return true;
    }
    function status() {
      const n = g.tick / T | 0, stalled = stallSince !== null;
      return { state, tick: g.tick, turn: n, waiting: stalled ? blockers(n) : [], waitingMs: stalled ? now() - stallSince : 0, lagging, players: st.slice() };
    }
    function close() { state = 'closed'; tr.onmessage = null; tr.onclose = null; tr.onopen = prevOpen || null; }

    toLive(hello);
    return { tick, ready, queue, drop, drift, chat, ping, status, close, get state() { return state; }, T, DL };
  }

  // ---- 메모리 전송(테스트) ----
  function loopback({ now = defNow, latency = 0, jitter = 0, seed = 1 } = {}) {
    const r = { s: seed | 0 };
    const rnd = () => { let t = (r.s = (r.s + 0x6D2B79F5) | 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const eps = new Map(), q = [], cuts = new Set(), lastSeq = new Map();
    let seq = 0;
    const key = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
    const hub = { stats: { sent: 0, delivered: 0, reordered: 0 } };
    hub.endpoint = id => {
      const tr = { id, onmessage: null, onclose: null,
        peers: () => [...eps.keys()].filter(x => x !== id && !cuts.has(key(id, x))),
        send(to, m) {
          if (!eps.has(id) || !eps.has(to) || cuts.has(key(id, to))) return;
          hub.stats.sent++;
          q.push({ at: now() + latency + rnd() * jitter, seq: seq++, from: id, to, data: JSON.stringify(m) });
        },
        close() { hub.disconnect(id); } };
      eps.set(id, tr);
      return tr;
    };
    hub.deliver = () => {
      for (;;) {
        const t = now();
        let bi = -1;
        for (let i = 0; i < q.length; i++) if (q[i].at <= t && (bi < 0 || q[i].at < q[bi].at || q[i].at === q[bi].at && q[i].seq < q[bi].seq)) bi = i;
        if (bi < 0) return;
        const m = q.splice(bi, 1)[0], dst = eps.get(m.to), lk = m.from + '>' + m.to;
        if ((lastSeq.get(lk) ?? -1) > m.seq) hub.stats.reordered++; else lastSeq.set(lk, m.seq);
        if (dst && !cuts.has(key(m.from, m.to)) && dst.onmessage) { hub.stats.delivered++; dst.onmessage(m.from, JSON.parse(m.data)); }
      }
    };
    hub.disconnect = id => {
      if (!eps.delete(id)) return;
      for (let i = q.length - 1; i >= 0; i--) if (q[i].from === id || q[i].to === id) q.splice(i, 1);
      for (const tr of eps.values()) if (tr.onclose) tr.onclose(id);
    };
    hub.cut = (a, b) => { cuts.add(key(a, b)); }; // 조용한 단절(close 없음 — 타임아웃 경로)
    hub.heal = (a, b) => { cuts.delete(key(a, b)); };
    return hub;
  }

  // ---- PeerJS(WebRTC) ----
  let loading = null;
  function loadPeerJS(url = PEERJS_URL, integrity = url === PEERJS_URL ? PEERJS_SRI : null) {
    if (typeof window === 'undefined' || typeof document === 'undefined') return Promise.reject(new Error('no-dom'));
    if (window.Peer) return Promise.resolve(window.Peer);
    if (!loading) loading = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = url; s.async = true; s.crossOrigin = 'anonymous';
      if (integrity) s.integrity = integrity;
      s.onload = () => (window.Peer ? res(window.Peer) : rej(new Error('peerjs-load')));
      s.onerror = () => { loading = null; s.remove(); rej(new Error('peerjs-load')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  // 오류는 Error(err.type) — PeerJS 형식: 'unavailable-id' 'peer-unavailable' 'network' 'server-error' 'browser-incompatible' 'timeout' 등
  async function openPeer({ id, signaling = {}, Peer, mesh = true, roster = null, peerUrl, integrity, timeoutMs = 15000, connectTimeoutMs = 15000 } = {}) {
    const P = Peer || await (peerUrl ? loadPeerJS(peerUrl, integrity || null) : loadPeerJS());
    const peer = id ? new P(id, signaling) : new P(signaling);
    await new Promise((res, rej) => {
      let done = false;
      const to = setTimeout(() => { done = true; peer.destroy(); rej(new Error('timeout')); }, timeoutMs);
      peer.on('open', () => { if (done) return; done = true; clearTimeout(to); res(); });
      peer.on('error', e => { // 열리기 전 오류만: 신호 서버 연결·id 를 놓아 준다(연 뒤의 오류는 아래 처리기)
        if (done) return;
        done = true; clearTimeout(to); peer.destroy(); rej(new Error(e && e.type || 'peer'));
      });
    });
    let allow = Array.isArray(roster) ? new Set(roster) : null;
    const conns = new Map(), connecting = new Map(); // conns: 상대 id → 열린 연결 목록(보통 1개, 동시 연결이면 잠시 2개)
    const winner = to => (tr.id < to ? tr.id : to); // 연결이 둘이면 작은 id 쪽이 연 것을 쓴다(양쪽 같은 판정)
    const best = to => { const l = conns.get(to); return l && (l.find(c => c._nwInit === winner(to)) || l[0]); };
    const tr = { id: peer.id, onmessage: null, onclose: null, onopen: null, onerror: null,
      peers: () => [...conns.keys()],
      send(to, m) { const c = best(to); if (c && c.open) c.send(m); },
      connect,
      setRoster(ids) { allow = Array.isArray(ids) ? new Set(ids) : null; },
      close() { peer.destroy(); } };
    const gossip = () => {
      const ids = [tr.id, ...conns.keys()].filter(x => x === tr.id || !allow || allow.has(x)).slice(0, MAX_MESH);
      for (const l of conns.values()) for (const c of l) if (c.open) c.send({ t: '_mesh', ids });
    };
    function connect(to) {
      if (conns.has(to)) return Promise.resolve();
      if (connecting.has(to)) return connecting.get(to).p;
      const w = {};
      w.p = new Promise((res, rej) => {
        const tm = setTimeout(() => { if (connecting.get(to) === w) { connecting.delete(to); try { w.c.close(); } catch (e) { /* 이미 닫힘 */ } rej(new Error('timeout')); } }, connectTimeoutMs);
        w.res = () => { clearTimeout(tm); res(); };
        w.rej = e => { clearTimeout(tm); rej(e); };
      });
      connecting.set(to, w);
      w.c = peer.connect(to, { reliable: true, serialization: 'json', metadata: { nwFrom: tr.id } });
      attach(w.c, tr.id);
      return w.p;
    }
    function attach(c, init) {
      c._nwInit = init;
      c.on('open', () => {
        const l = conns.get(c.peer) || [], first = !l.length;
        if (l.includes(c)) return;
        l.push(c); conns.set(c.peer, l);
        const w = connecting.get(c.peer); if (w) { connecting.delete(c.peer); w.res(); }
        if (!first) return;
        if (mesh) gossip();
        if (tr.onopen) tr.onopen(c.peer);
      });
      c.on('data', m => {
        const l = conns.get(c.peer);
        if (!l || !l.includes(c)) return;
        if (l.length > 1 && c === best(c.peer)) { // 쓰는 연결로 데이터가 왔다(상대도 열었다) → 나머지는 닫는다(목록에서 먼저 빼므로 onclose 없음)
          const rest = l.filter(x => x !== c);
          l.length = 0; l.push(c);
          for (const x of rest) x.close();
        }
        if (isObj(m) && m.t === '_mesh') {
          if (mesh && Array.isArray(m.ids)) for (const x of m.ids.slice(0, MAX_MESH)) if (typeof x === 'string' && tr.id < x && !conns.has(x) && (!allow || allow.has(x))) connect(x).catch(() => {});
          return;
        }
        if (tr.onmessage) tr.onmessage(c.peer, m);
      });
      c.on('close', () => {
        const w = connecting.get(c.peer); if (w && w.c === c && !conns.has(c.peer)) { connecting.delete(c.peer); w.rej(new Error('peer-unavailable')); }
        const l = conns.get(c.peer), i = l ? l.indexOf(c) : -1;
        if (i < 0) return;
        l.splice(i, 1);
        if (!l.length) { conns.delete(c.peer); if (tr.onclose) tr.onclose(c.peer); }
      });
      c.on('error', e => { if (tr.onerror) tr.onerror(e); });
    }
    peer.on('connection', c => attach(c, c.peer));
    peer.on('error', e => {
      const t = e && e.type, m = t === 'peer-unavailable' && /(\S+)$/.exec(e.message || ''), w = m && connecting.get(m[1]);
      if (w) { connecting.delete(m[1]); w.rej(new Error(t)); }
      if (tr.onerror) tr.onerror(e);
    });
    return tr;
  }

  return { PEERJS_URL, PEERJS_SRI, MAX_CMDS, commandCheck, session, loopback, loadPeerJS, openPeer };
})();
if (typeof module !== 'undefined') module.exports = NW_NET;
