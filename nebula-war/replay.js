// 네뷸라 워 — 리플레이 기록·인코딩·재생, 종료 통계 집계, 이어하기 저장. DOM 없음(node 테스트 가능).
// 결정론 sim 을 그대로 다시 돌린다: createGame({ seed, map, players }) + 기록된 틱마다 같은 명령으로 S.step.
//
// 기록 rec = { v, seed, map, players: [{race, team, slot, color, name, ai?}], ticks, cmds: [[tick, cmd], …], ck? }   (명령 있는 틱만, ck = ticks 시점 체크섬)
//   create(meta, v) → rec            record(rec, tick, cmds)  — cmds 를 복사해 붙인다
//   encode(rec) → 문자열              decode(str, v) → { ok, rec } | { ok:false, err:'parse'|'shape'|'version' }
//   version(S, D) → 8자리 hex        JSON.stringify(D) + S 의 함수 toString()·상수 해시. 코드·데이터가 바뀌면 달라진다.
//   player(rec, S) → { state, done, step(), reset() }
//   runToSync(pl, tick, onTick?)     렌더 없이 tick 까지(뒤로 가면 처음부터 재시뮬)
//   runTo(pl, tick, { onTick, onProgress, chunkMs }) → Promise<bool>  쪼개 돌리며 진행률(0..1) 콜백, .cancel()
//   stats(state) → { data, tick(state, events) }   수집 자원·생산·처치/손실·100틱(5초) 표본
//   saveResume(store, rec) / loadResume(store, v) / clearResume(store) / available(store)
//     store = () => localStorage (접근 자체가 throw 할 수 있어 함수로 받는다). 전부 try/catch, 실패는 false/null.
const NW_REPLAY = (() => {
  const RESUME_KEY = 'nw.resume';
  const clone = c => JSON.parse(JSON.stringify(c));

  function fnv(str, h = 2166136261) {
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
    return h >>> 0;
  }
  function version(S, D) {
    let src = JSON.stringify(D);
    for (const k of Object.keys(S).sort()) {
      const v = S[k];
      if (typeof v === 'function') src += '\n' + k + ':' + v.toString();
      else if (typeof v === 'number') src += '\n' + k + '=' + v;
    }
    return fnv(src).toString(16).padStart(8, '0');
  }

  // 명단 = [{race, team, slot, color, name}]. 예전 races 형식은 sim 과 같은 규칙으로 변환.
  // name = 표시 전용(1~16자, 앞뒤 공백 제거). sim·체크섬은 모른다. 없으면 "P1"~"P4".
  // ai = { level } (AI 자리, 표시·리플레이용 — sim 은 모른다). level 외 키는 버린다.
  const NAME_MAX = 16, AI_LEVELS = ['easy', 'normal', 'hard'];
  const aiOk = a => !!a && typeof a === 'object' && AI_LEVELS.includes(a.level);
  const toRoster = (players, races) => (players || races.map((race, i) => ({ race, team: i, slot: i, color: i }))).map((q, i) => {
    const o = { race: q.race, team: q.team, slot: q.slot, color: q.color, name: typeof q.name === 'string' && q.name.trim() ? q.name.trim().slice(0, NAME_MAX) : 'P' + (i + 1) };
    if (aiOk(q.ai)) o.ai = { level: q.ai.level };
    return o;
  });
  const create = ({ seed, map, players, races }, v) => ({ v, seed: seed | 0, map, players: toRoster(players, races), ticks: 0, cmds: [] });
  function record(rec, tick, cmds) {
    for (const c of cmds) rec.cmds.push([tick, clone(c)]);
  }

  // ---- 인코딩: 명령마다 [틱 차이, 형태 번호, 값…]. 형태 = [type, 나머지 키…] 표(k)로 키 이름·type 문자열을 한 번만 쓴다 ----
  function encode(rec) {
    const k = [], kIdx = new Map(), c = [];
    let prev = 0;
    for (const [t, cmd] of rec.cmds) {
      const keys = Object.keys(cmd).filter(x => x !== 'type');
      const shape = [cmd.type === undefined ? null : cmd.type].concat(keys), sig = JSON.stringify(shape);
      let si = kIdx.get(sig);
      if (si === undefined) { si = k.length; k.push(shape); kIdx.set(sig, si); }
      c.push([t - prev, si].concat(keys.map(x => cmd[x])));
      prev = t;
    }
    const out = { v: rec.v, seed: rec.seed, map: rec.map, players: rec.players, ticks: rec.ticks };
    if (rec.ck !== undefined) out.ck = rec.ck;
    out.k = k; out.c = c;
    if (Array.isArray(rec.chat) && rec.chat.length) out.chat = rec.chat; // 선택: [[tick, 자리, 'all'|'team', text], …]
    return JSON.stringify(out);
  }

  const isInt = n => Number.isInteger(n);
  function decode(str, v, D) {
    let o;
    try { o = JSON.parse(str); } catch (e) { return { ok: false, err: 'parse' }; }
    if (!o || typeof o !== 'object' || typeof o.v !== 'string') return { ok: false, err: 'shape' };
    if (o.v !== v) return { ok: false, err: 'version' };
    const data = D || (typeof NW_DATA !== 'undefined' ? NW_DATA : typeof require !== 'undefined' ? require('./data.js') : null);
    if (!isInt(o.seed) || !isInt(o.ticks) || o.ticks < 0 || !Array.isArray(o.k) || !Array.isArray(o.c)) return { ok: false, err: 'shape' };
    if (!data || typeof o.map !== 'string' || !Object.prototype.hasOwnProperty.call(data.maps, o.map)) return { ok: false, err: 'shape' };
    let pls = o.players;
    if (pls === undefined && Array.isArray(o.races)) pls = o.races.map((race, i) => ({ race, team: i, slot: i, color: i })); // 예전 형식
    const ns = data.maps[o.map].starts.length;
    if (!Array.isArray(pls) || pls.length < 2 || pls.length > 4 || pls.length > (data.maps[o.map].players ?? ns)) return { ok: false, err: 'shape' };
    for (const q of pls) {
      if (!q || typeof q !== 'object' || typeof q.race !== 'string' || !Object.prototype.hasOwnProperty.call(data.races, q.race) ||
        !isInt(q.team) || q.team < 0 || q.team > 3 || !isInt(q.color) || q.color < 0 || q.color > 3 || !isInt(q.slot) || q.slot < 0 || q.slot >= ns) return { ok: false, err: 'shape' };
    }
    if (new Set(pls.map(q => q.slot)).size !== pls.length) return { ok: false, err: 'shape' };
    if (new Set(pls.map(q => q.team)).size < 2) return { ok: false, err: 'shape' };
    for (const q of pls) if (q.name !== undefined && (typeof q.name !== 'string' || q.name.trim().length < 1 || q.name.trim().length > NAME_MAX)) return { ok: false, err: 'shape' };
    for (const q of pls) if (q.ai !== undefined && !aiOk(q.ai)) return { ok: false, err: 'shape' };
    if (o.ck !== undefined && !isInt(o.ck)) return { ok: false, err: 'shape' };
    for (const s of o.k) if (!Array.isArray(s) || !s.length || !s.slice(1).every(x => typeof x === 'string')) return { ok: false, err: 'shape' };
    const cmds = [];
    let t = 0;
    for (const row of o.c) {
      if (!Array.isArray(row) || !isInt(row[0]) || row[0] < 0 || !isInt(row[1]) || !o.k[row[1]]) return { ok: false, err: 'shape' };
      const shape = o.k[row[1]];
      if (row.length !== shape.length + 1) return { ok: false, err: 'shape' };
      t += row[0];
      if (t >= o.ticks) return { ok: false, err: 'shape' };
      const cmd = {};
      if (shape[0] !== null) cmd.type = shape[0];
      for (let i = 1; i < shape.length; i++) cmd[shape[i]] = row[i + 1];
      cmds.push([t, cmd]);
    }
    const rec = { v: o.v, seed: o.seed, map: o.map, players: toRoster(pls), ticks: o.ticks, cmds };
    if (o.ck !== undefined) rec.ck = o.ck;
    const chat = decodeChat(o.chat);
    if (chat) rec.chat = chat;
    return { ok: true, rec };
  }
  // 채팅 로그: 배열이 아니거나 600줄 초과면 통째로, 잘못된 튜플(틱·자리 정수, 'all'|'team', 1~200자)은 그 줄만 버린다. 표시 전용 — 재생·체크섬 무관.
  const CHAT_MAX = 600, CHAT_TEXT = 200;
  function decodeChat(c) {
    if (!Array.isArray(c) || c.length > CHAT_MAX) return null;
    const out = c.filter(q => Array.isArray(q) && q.length === 4 && isInt(q[0]) && q[0] >= 0 && isInt(q[1]) && q[1] >= 0 && q[1] <= 3 &&
      (q[2] === 'all' || q[2] === 'team') && typeof q[3] === 'string' && q[3].length >= 1 && q[3].length <= CHAT_TEXT);
    return out.length ? out : null;
  }

  // ---- 재생 ----
  function player(rec, S) {
    const pl = { rec, state: null, i: 0, get done() { return pl.state.tick >= rec.ticks; } };
    pl.reset = () => { pl.state = S.createGame({ seed: rec.seed, players: rec.players, map: rec.map }); pl.i = 0; };
    pl.step = () => {
      const g = pl.state, cmds = [];
      while (pl.i < rec.cmds.length && rec.cmds[pl.i][0] < g.tick) pl.i++; // (기록은 오름차순 — 방어용)
      while (pl.i < rec.cmds.length && rec.cmds[pl.i][0] === g.tick) cmds.push(clone(rec.cmds[pl.i++][1]));
      return S.step(g, cmds);
    };
    pl.reset();
    return pl;
  }
  function runToSync(pl, tick, onTick) {
    tick = Math.min(tick, pl.rec.ticks);
    if (tick < pl.state.tick) pl.reset();
    while (pl.state.tick < tick) { const ev = pl.step(); if (onTick) onTick(pl.state, ev); }
    return pl.state;
  }
  // 양보: 브라우저는 MessageChannel(백그라운드 탭에서도 setTimeout 처럼 1초로 묶이지 않는다), node 는 setTimeout.
  const later = (() => {
    if (typeof window === 'undefined' || typeof MessageChannel === 'undefined') return f => setTimeout(f, 0);
    const ch = new MessageChannel(), q = [];
    ch.port1.onmessage = () => { const f = q.shift(); if (f) f(); };
    return f => { q.push(f); ch.port2.postMessage(0); };
  })();
  // 비동기: chunkMs 씩 끊어 돌리고 사이에 양보(later). 끝나면 true, 취소되면 false.
  function runTo(pl, tick, opt = {}) {
    const { onTick, onProgress, chunkMs = 12 } = opt;
    let cancelled = false;
    tick = Math.min(tick, pl.rec.ticks);
    if (tick < pl.state.tick) pl.reset();
    const from = pl.state.tick, span = Math.max(1, tick - from);
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const p = new Promise(resolve => {
      function chunk() {
        if (cancelled) { resolve(false); return; }
        const t0 = now();
        do {
          if (pl.state.tick >= tick) break;
          const ev = pl.step(); if (onTick) onTick(pl.state, ev);
        } while (now() - t0 < chunkMs);
        if (onProgress) onProgress(pl.state.tick >= tick ? 1 : (pl.state.tick - from) / span);
        if (pl.state.tick >= tick) resolve(true); else later(chunk);
      }
      if (onProgress) onProgress(0);
      chunk();
    });
    p.cancel = () => { cancelled = true; };
    return p;
  }

  // ---- 종료 통계: 상태·이벤트만 읽는다(sim 무변경) ----
  // 수집 = 일꾼 carry 가 살아 있는 채로 >0 → 0 (sim 하역 지점과 같은 규칙), 생산 = 새로 생긴 유닛(자식 비행체 제외),
  // 처치/손실 = death 이벤트(id → 주인 기억). samples: [tick, 크리스탈0, 가스0, 크리스탈1, 가스1, …] 누적(플레이어 수 × 2 + 1), 100틱(5초)마다.
  const SAMPLE = 100;
  function stats(g0) {
    const data = { players: g0.players.map(() => ({ crystal: 0, nebula: 0, produced: 0, kills: 0, losses: 0 })), samples: [] };
    const owner = new Map(), carry = new Map();
    let nextId = g0.nextId;
    for (const e of g0.ents) if (e.owner >= 0) owner.set(e.id, e.parent ? -2 : e.owner);
    const sample = g => { const row = [g.tick]; for (const p of data.players) row.push(p.crystal, p.nebula); data.samples.push(row); };
    if (g0.tick % SAMPLE === 0) sample(g0);
    function tick(g, events) {
      const P = data.players;
      for (let i = g.ents.length - 1; i >= 0 && g.ents[i].id >= nextId; i--) {
        const e = g.ents[i];
        if (e.owner < 0) continue;
        owner.set(e.id, e.parent ? -2 : e.owner);
        if (!e.isB && !e.isR && !e.parent) P[e.owner].produced++;
      }
      nextId = g.nextId;
      for (const ev of events) {
        if (ev.t !== 'death') continue;
        const o = owner.get(ev.id);
        owner.delete(ev.id); carry.delete(ev.id);
        if (o === undefined || o < 0) continue;
        P[o].losses++; if (ev.by >= 0 && g.players[ev.by].team !== g.players[o].team) P[ev.by].kills++; // 처치 = by(다른 팀 가해자)
      }
      for (const e of g.ents) {
        if (e.owner < 0 || !e.def.worker) continue;
        const pv = carry.get(e.id), c = e.carry || 0;
        if (pv && pv[0] > 0 && c === 0) { if (pv[1] === 1) P[e.owner].nebula += pv[0]; else P[e.owner].crystal += pv[0]; }
        if (pv) { pv[0] = c; pv[1] = e.carryKind; } else carry.set(e.id, [c, e.carryKind]);
      }
      if (g.tick % SAMPLE === 0) sample(g);
    }
    return { data, tick };
  }

  // ---- 이어하기 저장소 ----
  function saveResume(store, rec) {
    try { store().setItem(RESUME_KEY, encode(rec)); return true; } catch (e) { return false; }
  }
  function clearResume(store) {
    try { store().removeItem(RESUME_KEY); return true; } catch (e) { return false; }
  }
  function loadResume(store, v, D) {
    let txt;
    try { txt = store().getItem(RESUME_KEY); } catch (e) { return null; }
    if (txt === null || txt === undefined) return null;
    const d = decode(txt, v, D);
    if (!d.ok) { clearResume(store); return null; }
    return d.rec;
  }
  function available(store) {
    try { const s = store(), k = RESUME_KEY + '.probe'; s.setItem(k, '1'); s.removeItem(k); return true; } catch (e) { return false; }
  }

  const VERSION = typeof NW_SIM !== 'undefined' && typeof NW_DATA !== 'undefined' ? version(NW_SIM, NW_DATA) : null;
  return { RESUME_KEY, SAMPLE, NAME_MAX, VERSION, version, create, record, encode, decode, player, runToSync, runTo, stats, saveResume, loadResume, clearResume, available };
})();
if (typeof module !== 'undefined') module.exports = NW_REPLAY;
