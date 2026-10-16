// 네뷸라 워 — P2P 대기실 프로토콜(방장 권한). DOM 없음(node 테스트). 전송 계층은 net.js 의 transport 그대로.
//
// 신뢰 범위: 방장이 맵·자리 구성·시드·시작점·무작위 종족을 정한다. 참가자는 받은 명단을 검사(check)만 하고, 형식이 깨졌으면 방을 나간다.
//   록스텝이라 모든 피어가 전체 상태를 가진다(맵핵 가능 — 본질적 한계). 서명 없음.
//   방 코드(방장 피어 id)는 약 30비트 — 공개 신호 서버에서 추측 참가가 가능하므로 방장 내보내기 + 개시 때 명단 잠금으로 대응.
//   피어 메시지는 전부 믿지 않는다: 8 KiB 초과·키 화이트리스트 밖(__proto__ 등)·범위 밖 값은 버리고, 방장은 피어마다
//   L.req 초당 20개·채팅 3초 5개만 반영, 초당 100개 넘게 보내면 내보낸다. 참가자는 자기 자리 필드만 바꿀 수 있다.
//   한계: L.deny 는 메시지만 보내고 연결을 끊지 않는다(끊기는 받은 쪽이 tr.close() — 악의적 피어는 연결을 붙들 수 있지만
//   자리·명단에는 다시 들어오지 못한다). 내보내기 차단은 피어 id 단위라 새 id 로 다시 접속하면 막지 못한다(방장이 다시 내보낸다).
//
// 메시지(타입 'L.' 접두어 — 세션 메시지 hello·cmd 등과 겹치지 않고, 모르는 타입은 조용히 버린다)
//   참가자 → 방장: {t:'L.join', v, name}  {t:'L.req', op, value}  op ∈ race|team|color|ready|name|chat|links
//   방장 → 전원:   {t:'L.state', rev, map, seats:[{kind:'human'|'ai'|'closed'|'open', peer?, name, race, team, color, level?, ready}]}
//                  {t:'L.chat', from(자리), text}  {t:'L.deny', reason: version|full|locked|kicked}  {t:'L.start', rev, seed, map, players, peers}
//
// host({ tr, me:{name}, maps, map, version, now?, rng?, races?, onChange }) → { state, setMap, setSeat, kick, setMine, chat, canStart, start, detach }
// join({ tr, hostId, name, version, now?, maps?, races?, onChange, onDeny, onStart }) → { req, chat, state, detach }
//   onChange(state, ev)  ev.type ∈ state|chat|peer-join|peer-left|links.  onDeny(reason) 뒤 참가자는 처리기를 떼고 tr.close().
// toGame(start, selfId) → { meta:{seed, map, players}, peers, self }   lobbyState(seats) → { ok, why, mu, sub }(index.html 과 공유)
// check(msg, ctx?) → 정리된 새 메시지 | null   clean(text, max=16) → 제어·양방향 문자 제거, 앞뒤 공백 제거, 자름
const NW_LOBBY = (() => {
  const MAX_BYTES = 8192, NAME_MAX = 16, RAW_NAME = 64, CHAT_MAX = 200, RAW_CHAT = 1000, ID_MAX = 64, MAX_LINKS = 16, SEATS = 4;
  const REQ_PER_S = 20, KICK_PER_S = 100, CHAT_BURST = 5, CHAT_WINDOW = 3000;
  const LEVELS = ['easy', 'normal', 'hard'], KINDS = ['human', 'ai', 'closed', 'open'], DENY = ['version', 'full', 'locked', 'kicked'];
  const OPS = new Set(['race', 'team', 'color', 'ready', 'name', 'chat', 'links']);
  const DEF_RACES = ['legion', 'swarm', 'elysian'], DEF_SEAT_RACE = ['legion', 'swarm', 'elysian', 'random'];
  const isInt = Number.isInteger, isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const clone = v => JSON.parse(JSON.stringify(v));
  const defNow = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const defRng = () => {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] / 4294967296; }
    return Math.random();
  };
  const globalData = () => (typeof NW_DATA !== 'undefined' ? NW_DATA : null);
  const mapSeats = m => m.players ?? m.starts.length;
  // netui.js 와 같은 문자 집합(제어·양방향·폭 없는 공백·BOM, ZWJ 는 남김) + 탭·줄바꿈
  const BAD_CH = /[\u0000-\u001f\u007f-\u009f\u061c\u200b\u200c\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;
  const clean = (t, max = NAME_MAX) => String(t).replace(BAD_CH, '').trim().slice(0, max);
  const team03 = v => isInt(v) && v >= 0 && v <= 3;
  const idOk = v => typeof v === 'string' && v.length > 0 && v.length <= ID_MAX;
  const keysOk = (m, allow, need = allow) => Object.keys(m).every(k => allow.includes(k)) && need.every(k => has(m, k));
  const bytes = m => {
    let s; try { s = JSON.stringify(m); } catch (e) { return Infinity; }
    if (typeof s !== 'string') return Infinity;
    if (s.length > MAX_BYTES) return s.length;
    return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : s.length;
  };

  // 개시 가능 여부 + 사유, 대전 구성 문구(index.html 솔로 로비와 같은 규칙). 닫힌 자리·빈(open) 자리는 세지 않는다.
  function lobbyState(seats) {
    const open = seats.filter(s => s.kind !== 'closed' && s.kind !== 'open'), teams = [];
    for (const s of open) { const t = teams.find(x => x.team === s.team); if (t) t.n++; else teams.push({ team: s.team, n: 1 }); }
    let why = '';
    if (open.length < 2) why = '열린 자리가 둘 이상 있어야 합니다';
    else if (teams.length < 2) why = '팀이 하나뿐입니다 — 다른 팀 번호를 고른 자리가 있어야 합니다';
    const mu = teams.length < 2 ? '대전 불가' : teams.every(t => t.n === 1) && teams.length > 2 ? '개인전' : teams.map(t => t.n).join(' 대 ');
    const sub = teams.length < 2 ? '' : teams.every(t => t.n === 1) ? open.length + '인' + (teams.length > 2 ? ' · 각자' : '') : '팀전 · ' + open.length + '인';
    return { ok: !why, why, mu, sub };
  }

  // ---- 형식 검사(방장·참가자 공용) ----
  // ctx = { maps, races } 가 있으면 맵 존재·자리 수·종족 소속까지 본다.
  const raceOk = (v, races, rand) => typeof v === 'string' && v.length <= 16 && (rand && v === 'random' || (races ? races.includes(v) : /^[a-z]+$/.test(v) && !(v in {})));
  function seatCheck(s, races) {
    if (!isObj(s) || !keysOk(s, ['kind', 'peer', 'name', 'race', 'team', 'color', 'level', 'ready'], ['kind', 'name', 'race', 'team', 'color', 'ready'])) return null;
    if (!KINDS.includes(s.kind) || typeof s.name !== 'string' || s.name.length > RAW_NAME || !raceOk(s.race, races, true) ||
      !team03(s.team) || !team03(s.color) || typeof s.ready !== 'boolean') return null;
    if ((s.kind === 'human') !== has(s, 'peer') || has(s, 'peer') && !idOk(s.peer)) return null;
    if ((s.kind === 'ai') !== has(s, 'level') || has(s, 'level') && !LEVELS.includes(s.level)) return null;
    const o = { kind: s.kind, name: clean(s.name), race: s.race, team: s.team, color: s.color, ready: s.ready };
    if (s.kind === 'human') o.peer = s.peer;
    if (s.kind === 'ai') o.level = s.level;
    return o;
  }
  function playerCheck(q, ns, races) {
    if (!isObj(q) || !keysOk(q, ['race', 'team', 'slot', 'color', 'name', 'ai'], ['race', 'team', 'slot', 'color', 'name'])) return null;
    if (!raceOk(q.race, races, false) || !team03(q.team) || !team03(q.color) || !isInt(q.slot) || q.slot < 0 || q.slot >= ns ||
      typeof q.name !== 'string' || q.name.length > RAW_NAME || !clean(q.name)) return null;
    if (has(q, 'ai') && !(isObj(q.ai) && keysOk(q.ai, ['level']) && LEVELS.includes(q.ai.level))) return null;
    const o = { race: q.race, team: q.team, slot: q.slot, color: q.color, name: clean(q.name) };
    if (has(q, 'ai')) o.ai = { level: q.ai.level };
    return o;
  }
  function check(m, ctx = {}) {
    if (!isObj(m) || typeof m.t !== 'string' || bytes(m) > MAX_BYTES) return null;
    const { maps = null, races = null } = ctx;
    const mapOk = id => typeof id === 'string' && id.length <= 32 && (!maps || has(maps, id));
    switch (m.t) {
      case 'L.join':
        if (!keysOk(m, ['t', 'v', 'name']) || typeof m.v !== 'string' || m.v.length > 32 || typeof m.name !== 'string' || m.name.length > RAW_NAME) return null;
        return { t: m.t, v: m.v, name: clean(m.name) };
      case 'L.req': {
        if (!keysOk(m, ['t', 'op', 'value']) || typeof m.op !== 'string' || !OPS.has(m.op)) return null;
        const v = m.value;
        let ok;
        switch (m.op) {
          case 'race': ok = raceOk(v, races, true); break;
          case 'team': case 'color': ok = team03(v); break;
          case 'ready': ok = typeof v === 'boolean'; break;
          case 'name': ok = typeof v === 'string' && v.length <= RAW_NAME; break;
          case 'chat': ok = typeof v === 'string' && v.length <= RAW_CHAT && !!clean(v, CHAT_MAX); break;
          case 'links': ok = Array.isArray(v) && v.length <= MAX_LINKS && v.every(idOk); break;
        }
        if (!ok) return null;
        return { t: m.t, op: m.op, value: m.op === 'name' ? clean(v) : m.op === 'chat' ? clean(v, CHAT_MAX) : m.op === 'links' ? v.slice() : v };
      }
      case 'L.state': {
        if (!keysOk(m, ['t', 'rev', 'map', 'seats']) || !isInt(m.rev) || m.rev < 0 || !mapOk(m.map) || !Array.isArray(m.seats)) return null;
        if (m.seats.length < 2 || m.seats.length > SEATS || maps && m.seats.length !== mapSeats(maps[m.map])) return null;
        const seats = m.seats.map(s => seatCheck(s, races));
        if (seats.some(s => !s)) return null;
        const ids = seats.filter(s => s.peer).map(s => s.peer);
        if (new Set(ids).size !== ids.length) return null;
        return { t: m.t, rev: m.rev, map: m.map, seats };
      }
      case 'L.chat':
        if (!keysOk(m, ['t', 'from', 'text']) || !isInt(m.from) || m.from < 0 || m.from >= SEATS || typeof m.text !== 'string' || m.text.length > RAW_CHAT) return null;
        return clean(m.text, CHAT_MAX) ? { t: m.t, from: m.from, text: clean(m.text, CHAT_MAX) } : null;
      case 'L.deny':
        if (!keysOk(m, ['t', 'reason']) || !DENY.includes(m.reason)) return null;
        return { t: m.t, reason: m.reason };
      case 'L.start': {
        if (!keysOk(m, ['t', 'rev', 'seed', 'map', 'players', 'peers']) || !isInt(m.rev) || !isInt(m.seed) || !mapOk(m.map)) return null;
        if (!Array.isArray(m.players) || !Array.isArray(m.peers) || m.players.length !== m.peers.length || m.players.length < 2 || m.players.length > SEATS) return null;
        const mp = maps ? maps[m.map] : null, ns = mp ? mp.starts.length : SEATS;
        if (mp && m.players.length > mapSeats(mp)) return null;
        const players = m.players.map(q => playerCheck(q, ns, races));
        if (players.some(q => !q)) return null;
        if (new Set(players.map(q => q.slot)).size !== players.length || new Set(players.map(q => q.team)).size < 2) return null;
        if (!m.peers.every((id, i) => (id === null ? !!players[i].ai : idOk(id) && !players[i].ai))) return null;
        const ids = m.peers.filter(id => id !== null);
        if (!ids.length || new Set(ids).size !== ids.length) return null;
        return { t: m.t, rev: m.rev, seed: m.seed, map: m.map, players, peers: m.peers.slice() };
      }
    }
    return null;
  }

  // 무작위 종족·시작점 확정(방장 쪽 기본 — index.html 은 자기 resolveRoster 를 넘길 수 있다). seats = 참가 자리(사람·AI)만, 순서대로.
  function resolveDefault(seats, map, rng, races) {
    const free = [...Array(map.starts.length).keys()];
    return seats.map(s => {
      const slot = free.splice(Math.floor(rng() * free.length), 1)[0];
      const race = s.race === 'random' ? races[Math.floor(rng() * races.length)] : s.race;
      return { race, team: s.team, slot, color: s.color, name: s.name, ...(s.kind === 'ai' ? { ai: { level: s.level } } : {}) };
    });
  }

  // 피어별 시간 창 계수기
  function counter(now) {
    const m = new Map();
    return {
      hit(id, key, win) { const k = id + '\u0000' + key, t = now(), l = (m.get(k) || []).filter(x => t - x < win); m.set(k, l); l.push(t); return l.length; },
      count(id, key, win) { const t = now(); return (m.get(id + '\u0000' + key) || []).filter(x => t - x < win).length; },
      forget(id) { for (const k of [...m.keys()]) if (k.startsWith(id + '\u0000')) m.delete(k); },
    };
  }

  // ---- 방장 ----
  function host({ tr, me = {}, maps, map, version, now = defNow, rng = defRng, races, onChange = () => {} }) {
    races = races || (globalData() ? Object.keys(globalData().races) : DEF_RACES);
    if (!maps || !has(maps, map)) throw new Error('lobby-map');
    const ctx = { maps, races };
    const seats = [0, 1, 2, 3].map(i => ({ kind: 'open', name: '', race: DEF_SEAT_RACE[i], team: i, color: i, level: 'normal', ready: false }));
    Object.assign(seats[0], { kind: 'human', peer: tr.id, name: clean(me.name || '') || 'P1', ready: true });
    const links = new Map(), banned = new Set(), rate = counter(now);
    let cur = map, rev = 0, started = null;
    const n = () => mapSeats(maps[cur]);
    const view = () => seats.slice(0, n());
    const seatOf = id => view().findIndex(s => s.kind === 'human' && s.peer === id);
    const out = s => {
      const o = { kind: s.kind, name: s.kind === 'human' || s.kind === 'ai' ? s.name : '', race: s.race, team: s.team, color: s.color, ready: s.kind === 'human' && s.ready };
      if (s.kind === 'human') o.peer = s.peer;
      if (s.kind === 'ai') o.level = s.level;
      return o;
    };
    const state = () => ({ t: 'L.state', rev, map: cur, seats: view().map(out) });
    const humans = () => view().filter(s => s.kind === 'human' && s.peer !== tr.id);
    const emit = ev => { try { onChange(state(), ev); } catch (e) { /* UI 오류가 로비를 멈추지 않게 */ } };
    const bump = ev => { rev++; const st = state(); for (const s of humans()) tr.send(s.peer, st); emit(ev || { type: 'state' }); };
    const unready = () => { for (const s of seats) if (s.kind === 'human' && s.peer !== tr.id) s.ready = false; };
    const vacate = s => { const id = s.peer; s.kind = 'open'; s.name = ''; s.ready = false; delete s.peer; links.delete(id); rate.forget(id); };
    const deny = (id, reason) => tr.send(id, { t: 'L.deny', reason });
    function swapColor(s, v) { const o = seats.find(x => x !== s && x.color === v); if (o) o.color = s.color; s.color = v; }

    function apply(i, op, v, from) {
      const s = seats[i];
      if (op === 'chat') { const m = { t: 'L.chat', from: i, text: v }; for (const h of humans()) tr.send(h.peer, m); emit({ type: 'chat', from: i, text: v, name: s.name }); return; }
      if (op === 'links') { links.set(from, new Set(v)); emit({ type: 'links', seat: i }); return; }
      if (op === 'name') v = v || 'P' + (i + 1);
      if (op === 'ready' && s.peer === tr.id) return;
      if (s[op] === v) return;
      if (op === 'color') swapColor(s, v); else s[op] = v;
      if (op === 'team' || op === 'race') for (const h of humans()) if (h !== s) h.ready = false; // 구성이 바뀌면 다른 참가자는 다시 확인
      bump();
    }
    function kickId(id, i) { deny(id, 'kicked'); banned.add(id); vacate(seats[i]); bump({ type: 'peer-left', seat: i }); }

    tr.onmessage = (from, raw) => {
      if (typeof from !== 'string') return;
      const i = seatOf(from);
      if (rate.hit(from, 'all', 1000) > KICK_PER_S) { if (i > 0) kickId(from, i); else banned.add(from); return; }
      const m = check(raw, ctx);
      if (!m) return;
      if (i < 0) {
        if (m.t !== 'L.join') return;
        if (banned.has(from)) return deny(from, 'kicked');
        if (started) return deny(from, 'locked');
        if (m.v !== version) return deny(from, 'version');
        const k = view().findIndex(s => s.kind === 'open');
        if (k < 0) return deny(from, 'full');
        Object.assign(seats[k], { kind: 'human', peer: from, name: m.name || 'P' + (k + 1), ready: false });
        bump({ type: 'peer-join', seat: k });
        return;
      }
      if (m.t !== 'L.req' || started || i === 0 && from === tr.id) return;
      if (rate.hit(from, 'req', 1000) > REQ_PER_S) return;
      if (m.op === 'chat' && rate.hit(from, 'chat', CHAT_WINDOW) > CHAT_BURST) return;
      apply(i, m.op, m.value, from);
    };
    tr.onclose = id => {
      const i = seatOf(id);
      rate.forget(id); links.delete(id);
      if (i > 0 && !started) { vacate(seats[i]); bump({ type: 'peer-left', seat: i }); }
    };
    const prevOpen = tr.onopen;
    tr.onopen = id => { // 세션이 이 처리기를 이어받는다(onopen 만) → 개시 뒤 새 연결도 거절
      if (prevOpen) prevOpen(id);
      if (started && !started.peers.includes(id)) deny(id, 'locked');
    };

    function setMap(id) {
      if (started || typeof id !== 'string' || !has(maps, id) || id === cur) return false;
      cur = id;
      const k = n();
      for (let j = k; j < SEATS; j++) { // 잘려 나가는 사람 자리는 앞쪽 사람 아닌 자리와 맞바꾼다, 없으면 '꽉 참'
        if (seats[j].kind !== 'human') continue;
        const t = seats.findIndex((s, x) => x < k && s.kind !== 'human');
        if (t >= 0) { const tmp = seats[t]; seats[t] = seats[j]; seats[j] = tmp; }
        else { const id2 = seats[j].peer; deny(id2, 'full'); vacate(seats[j]); emit({ type: 'peer-left', seat: j }); }
      }
      unready(); bump(); return true;
    }
    // o = { kind, level?, name?, race?, team?, color? } — race·team·color 는 AI 자리만
    function setSeat(i, o = {}) {
      const s = seats[i];
      if (started || !isInt(i) || i < 0 || i >= n() || !s || s.kind === 'human' || !['ai', 'closed', 'open'].includes(o.kind)) return false;
      if (o.level !== undefined && !LEVELS.includes(o.level)) return false;
      const ai = o.kind === 'ai';
      if (o.race !== undefined && !(ai && raceOk(o.race, races, true))) return false;
      if (o.team !== undefined && !(ai && team03(o.team))) return false;
      if (o.color !== undefined && !(ai && team03(o.color))) return false;
      s.kind = o.kind;
      if (o.level) s.level = o.level;
      if (o.race !== undefined) s.race = o.race;
      if (o.team !== undefined) s.team = o.team;
      if (o.color !== undefined && o.color !== s.color) swapColor(s, o.color);
      s.name = ai ? clean(o.name || '') || 'AI ' + (i + 1) : '';
      unready(); bump(); return true;
    }
    function kick(i) {
      const s = seats[i];
      if (!isInt(i) || i <= 0 || i >= n() || !s || s.kind !== 'human') return false;
      kickId(s.peer, i); return true;
    }
    function setMine(o = {}) {
      if (started) return false;
      const s = seats[0];
      let ch = false;
      if (o.race !== undefined && raceOk(o.race, races, true) && s.race !== o.race) { s.race = o.race; ch = true; }
      if (o.team !== undefined && team03(o.team) && s.team !== o.team) { s.team = o.team; ch = true; }
      if (o.color !== undefined && team03(o.color) && s.color !== o.color) { swapColor(s, o.color); ch = true; }
      if (o.name !== undefined) { const nm = clean(o.name) || 'P1'; if (nm !== s.name) { s.name = nm; ch = true; } }
      if (ch) bump();
      return ch;
    }
    function chat(text) {
      const t = typeof text === 'string' ? clean(text, CHAT_MAX) : '';
      if (!t || started) return false;
      apply(0, 'chat', t, tr.id); return true;
    }
    function canStart() {
      if (started) return { ok: false, why: '이미 시작했습니다' };
      const ls = lobbyState(view());
      if (!ls.ok) return { ok: false, why: ls.why };
      const hs = humans();
      if (!hs.length) return { ok: false, why: '참가자를 기다리는 중' };
      if (hs.some(s => !s.ready)) return { ok: false, why: '준비하지 않은 참가자가 있습니다' };
      for (const a of hs) for (const b of hs) if (a !== b && !(links.get(a.peer) && links.get(a.peer).has(b.peer))) return { ok: false, why: '연결 맞추는 중…' };
      return { ok: true, why: '' };
    }
    function start(resolveRoster) {
      if (!canStart().ok) return null;
      const inSeats = view().filter(s => s.kind === 'human' || s.kind === 'ai').map(s => ({ ...out(s), level: s.level }));
      let players = resolveRoster ? resolveRoster(clone(inSeats), cur) : resolveDefault(inSeats, maps[cur], rng, races);
      if (players && !Array.isArray(players)) players = players.players;
      const msg = check({ t: 'L.start', rev, seed: Math.floor(rng() * 4294967296) | 0, map: cur, players, peers: inSeats.map(s => s.peer || null) }, ctx);
      if (!msg || msg.players.length !== inSeats.length) return null;
      started = msg;
      for (const s of humans()) tr.send(s.peer, msg);
      if (tr.setRoster) tr.setRoster(msg.peers.filter(id => id !== null));
      return clone(msg);
    }
    function detach() { tr.onmessage = null; tr.onclose = null; }
    return { state, setMap, setSeat, kick, setMine, chat, canStart, start, detach };
  }

  // ---- 참가자 ----
  function join({ tr, hostId, name, version, now = defNow, maps, races, onChange = () => {}, onDeny = () => {}, onStart = () => {} }) {
    const D = globalData();
    maps = maps || (D ? D.maps : null);
    races = races || (D ? Object.keys(D.races) : DEF_RACES);
    const ctx = { maps, races }, rate = counter(now);
    let st = null, sentLinks = '', done = false;
    const emit = ev => { try { onChange(st && clone(st), ev); } catch (e) { /* UI 오류 무시 */ } };
    const send = m => { if (!done) tr.send(hostId, m); };
    function syncLinks() { // 방장 메시지마다 지금 연결 목록을 보고(바뀌었을 때만) — 방장이 메시 완성을 판단
      if (!st || !st.seats.some(s => s.peer === tr.id)) return;
      const ids = tr.peers().filter(id => id !== hostId).sort().slice(0, MAX_LINKS), key = ids.join('\n');
      if (key !== sentLinks) { sentLinks = key; send({ t: 'L.req', op: 'links', value: ids }); }
    }
    function leave(reason) {
      if (done) return;
      done = true; detach();
      try { onDeny(reason); } catch (e) { /* UI 오류 무시 */ }
      tr.close();
    }
    tr.onmessage = (from, raw) => {
      if (done || from !== hostId) return;
      const m = check(raw, ctx);
      if (!m) { if (isObj(raw) && raw.t === 'L.state') leave('bad'); return; } // 방장이 보낸 깨진 명단 → 나간다(깨진 L.start 는 거부만)
      if (m.t === 'L.state') {
        if (st && m.rev <= st.rev) return; // 늦게 온 옛 상태
        const prev = st;
        st = m;
        if (prev) prev.seats.forEach((s, i) => { const q = m.seats[i]; if (s.peer && (!q || q.peer !== s.peer)) emit({ type: 'peer-left', seat: i }); });
        m.seats.forEach((s, i) => { if (s.peer && s.peer !== tr.id && (!prev || !prev.seats[i] || prev.seats[i].peer !== s.peer)) emit({ type: 'peer-join', seat: i }); });
        emit({ type: 'state' });
      } else if (m.t === 'L.chat') emit({ type: 'chat', from: m.from, text: m.text, name: st && st.seats[m.from] ? st.seats[m.from].name : '' });
      else if (m.t === 'L.deny') { leave(m.reason); return; }
      else if (m.t === 'L.start') {
        if (!st || m.rev !== st.rev || m.peers.filter(id => id === tr.id).length !== 1 || !m.peers.includes(hostId)) return;
        done = true; // 세션으로 넘어간다 — 처리기 떼기는 호출자가 detach() 로(세션 생성 직전)
        try { onStart(clone(m)); } catch (e) { /* UI 오류 무시 */ }
        return;
      }
      syncLinks();
    };
    tr.onclose = id => { if (done) return; if (id === hostId) leave('closed'); else syncLinks(); };
    const prevOpen = tr.onopen;
    tr.onopen = id => { if (prevOpen) prevOpen(id); if (!done) syncLinks(); };
    function req(op, value) {
      const m = check({ t: 'L.req', op, value }, ctx);
      if (!m || done) return false;
      if (op === 'chat' && rate.hit('me', 'chat', CHAT_WINDOW) > CHAT_BURST) return false;
      send(m); return true;
    }
    const chat = text => req('chat', typeof text === 'string' ? text : '');
    const state = () => st && clone(st);
    function detach() { if (tr.onmessage) tr.onmessage = null; tr.onclose = null; tr.onopen = prevOpen || null; }
    send({ t: 'L.join', v: String(version), name: clean(name || '') });
    return { req, chat, state, detach };
  }

  function toGame(start, selfId) {
    const s = clone(start);
    return { meta: { seed: s.seed, map: s.map, players: s.players }, peers: s.peers, self: s.peers.indexOf(selfId) };
  }

  return { MAX_BYTES, NAME_MAX, lobbyState, check, clean, host, join, toGame, mapSeats };
})();
if (typeof module !== 'undefined') module.exports = NW_LOBBY;
