// node nebula-war/test/net.test.js
const assert = require('assert');
const D = require('../data.js');
const S = require('../sim.js');
const RP = require('../replay.js');
const NET = require('../net.js');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let fail = 0;

const V = RP.version(S, D);
const RACES = ['legion', 'swarm', 'elysian', 'legion'];
const roster = n => Array.from({ length: n }, (_, i) => ({ race: RACES[i], team: i, slot: i, color: i }));

// 피어 p 의 사람 흉내: 자기 상태만 읽고(UI처럼) 무작위 명령. 피어마다 다른 rng.
function human(g, p, r) {
  const rnd = n => S.mulberry32(r) % n, TF = S.TFP, out = [];
  const own = g.ents.filter(e => e.owner === p), units = own.filter(e => !e.isB), base = own.find(e => e.isB);
  if (g.tick === 4) {
    const crys = g.ents.filter(e => e.type === 'crystal').sort((a, b) => ((a.x - base.x) ** 2 + (a.y - base.y) ** 2) - ((b.x - base.x) ** 2 + (b.y - base.y) ** 2));
    out.push({ type: 'gather', ids: units.filter(e => e.def.worker).map(e => e.id), target: crys[0].id });
  }
  if (base && rnd(40) === 0) out.push({ type: 'train', ids: [base.id], what: D.races[g.players[p].race].worker });
  if (units.length && rnd(12) === 0) {
    const ids = units.slice(0, 1 + rnd(units.length)).map(e => e.id);
    out.push({ type: rnd(2) ? 'move' : 'attackMove', ids, x: (20 + rnd(88)) * TF + rnd(TF), y: (20 + rnd(88)) * TF, player: 3 - p }); // player 위조 시도 → net 이 덮어쓴다
  }
  return out;
}

// 가상 시간으로 n 피어 게임. opts.skip(i, t) = 그 피어가 그 시각에 틱을 못 돌림(잠자기), opts.at(t, ctx) 개입 훅.
// opts.wrap(tr, i) = 전송 가로채기(한쪽 방향 단절 등), opts.optFor(i) = 피어별 세션 옵션, opts.sim = sim 대체, opts.act = 명령 생성 대체.
function game({ n = 2, map = 'crossing', ticks = 300, latency = 0, jitter = 0, seed = 777, skip, at, sessOpt = {}, maxMs = 120000, wrap, optFor, sim = S, act = human } = {}) {
  let t = 0;
  const now = () => t;
  const hub = NET.loopback({ now, latency, jitter, seed });
  const ids = Array.from({ length: n }, (_, i) => 'peer' + i);
  const players = roster(n), events = ids.map(() => []), sums = ids.map(() => new Map());
  const peers = ids.map((id, i) => {
    const g = S.createGame({ seed, players, map }), raw = hub.endpoint(id), tr = wrap ? wrap(raw, i) : raw, rec = RP.create({ seed, map, players }, V);
    const sess = NET.session({ sim, game: g, self: i, peers: ids, transport: tr, now, rec, version: V, onEvent: ev => events[i].push(ev), ...sessOpt, ...(optFor ? optFor(i) : {}) });
    return { g, sess, rec, raw, r: { s: 1000 + i }, i };
  });
  const ctx = { hub, peers, events, sums, now };
  while (t < maxMs && peers.some(q => q.g.tick < ticks && q.sess.state === 'running')) {
    if (at) at(t, ctx);
    for (const q of peers) {
      if (q.g.tick >= ticks || (skip && skip(q.i, t))) continue;
      if (q.sess.state === 'running' && q.sess.status().players[q.i] !== 'dropped') {
        if (q.sess.ready()) for (const c of act(q.g, q.i, q.r)) q.sess.queue(c);
        if (q.sess.tick()) sums[q.i].set(q.g.tick, S.checksum(q.g));
      }
    }
    t += 50;
    hub.deliver();
  }
  ctx.t = t;
  return ctx;
}

// 단일 sim 재생(같은 명령) 체크섬 = 각 피어 체크섬
function assertSync(ctx, ticks, who = ctx.peers.map(q => q.i)) {
  const a = ctx.peers[who[0]];
  for (const i of who) assert.strictEqual(ctx.peers[i].g.tick, ticks, `peer${i} tick ${ctx.peers[i].g.tick}`);
  for (const i of who.slice(1)) assert.deepStrictEqual([...ctx.sums[i]], [...ctx.sums[who[0]]], `peer${i} 체크섬 ≠ peer${who[0]}`);
  const back = RP.decode(RP.encode(a.rec), V, D);
  assert(back.ok, 'rec 인코딩 왕복');
  const pl = RP.player(back.rec, S), got = new Map();
  RP.runToSync(pl, ticks, g => got.set(g.tick, S.checksum(g)));
  assert.deepStrictEqual([...got], [...ctx.sums[who[0]]], '단일 sim 재생 체크섬 ≠ 피어');
  assert(a.rec.cmds.length > 10, '명령이 실제로 오갔다: ' + a.rec.cmds.length);
  for (const [, c] of a.rec.cmds) if (c.type !== 'surrender') assert(c.player >= 0 && c.player < ctx.peers.length);
}

test('2피어 지연 없음: 400틱 동기 + 단일 sim 재생 일치, player 위조는 보낸 자리로 덮임', () => {
  const ctx = game({ n: 2, ticks: 400 });
  assertSync(ctx, 400);
  const byP = [0, 0];
  for (const [, c] of ctx.peers[0].rec.cmds) if (c.type === 'move' || c.type === 'attackMove') byP[c.player]++;
  assert(byP[0] > 0 && byP[1] > 0);
  assert(ctx.events.every(e => !e.some(x => x.type === 'desync' || x.type === 'lag')));
});

test('2피어 지연 80ms + 흔들림 150ms(순서 뒤바뀜): 동기 유지', () => {
  const ctx = game({ n: 2, ticks: 400, latency: 80, jitter: 150, seed: 31 });
  assert(ctx.hub.stats.reordered > 20, '순서 뒤바뀜 발생: ' + ctx.hub.stats.reordered);
  assertSync(ctx, 400);
});

test('4피어(expanse) 지연 40ms + 흔들림 90ms: 동기 + 재생 일치', () => {
  const ctx = game({ n: 4, map: 'expanse', ticks: 300, latency: 40, jitter: 90, seed: 5 });
  assert(ctx.hub.stats.reordered > 0);
  assertSync(ctx, 300);
});

test('입력 지연: 틱 t 에 넣은 명령은 턴 경계 + 2턴(4~6틱) 뒤 실행', () => {
  const ctx = game({ n: 2, ticks: 40 });
  const q = ctx.peers[0];
  const turn = q.sess.queue({ type: 'stop', ids: [] });
  assert.strictEqual(turn * q.sess.T - q.g.tick >= 4 && turn * q.sess.T - q.g.tick <= 6, true);
});

test('잠든 피어: 다른 피어가 멈추고 lag 이벤트(대기 = 그 자리) → 깨어나면 resume, 동기 유지', () => {
  const ctx = game({ n: 3, map: 'expanse', ticks: 300, latency: 30, jitter: 20, skip: (i, t) => i === 2 && t >= 3000 && t < 7000 });
  assertSync(ctx, 300);
  for (const i of [0, 1]) {
    const lag = ctx.events[i].find(e => e.type === 'lag');
    assert(lag, 'peer' + i + ' lag');
    assert.deepStrictEqual(lag.waiting, [2]);
    const res = ctx.events[i].find(e => e.type === 'resume');
    assert(res && res.ms >= 3500, 'resume ms ' + (res && res.ms));
    assert(!ctx.events[i].some(e => e.type === 'drop' || e.type === 'dropping'), '10초 전에는 내보내지 않음');
  }
});

test('대기 중 status: waiting·waitingMs·lagging', () => {
  let seen = null;
  game({ n: 2, ticks: 200, skip: (i, t) => i === 1 && t >= 2000 && t < 4000,
    at: (t, ctx) => { if (t === 3500) seen = ctx.peers[0].sess.status(); } });
  assert(seen.lagging && seen.state === 'running');
  assert.deepStrictEqual(seen.waiting, [1]);
  assert(seen.waitingMs >= 1000 && seen.waitingMs <= 1600, 'waitingMs ' + seen.waitingMs);
});

test('고의 desync(한 피어 상태 변조) → 양쪽 모두 감지·정지, 로그에 틱·체크섬·최근 명령', () => {
  const ctx = game({ n: 2, ticks: 400, latency: 40, at: (t, c) => { if (c.peers[1].g.tick === 101 && !c.done) { c.peers[1].g.players[1].crystal += 5; c.done = true; } } });
  for (const i of [0, 1]) {
    const q = ctx.peers[i], ev = ctx.events[i].find(e => e.type === 'desync');
    assert(ev, 'peer' + i + ' desync');
    assert.strictEqual(ev.tick, 120);
    assert.notStrictEqual(ev.mine, ev.theirs[1 - i]);
    assert(ev.recent.length > 0 && Array.isArray(ev.recent[0]));
    assert.strictEqual(q.sess.state, 'desync');
    assert(q.g.tick < 140, '정지: ' + q.g.tick);
    assert.strictEqual(q.sess.tick(), null);
  }
});

test('끊김(close): 남은 피어가 같은 턴에 항복 주입 → 탈락, 계속 동기 + 재생 일치', () => {
  const ctx = game({ n: 3, map: 'expanse', ticks: 400, latency: 40, jitter: 60,
    at: (t, c) => { if (c.peers[2].g.tick >= 200 && !c.cut) { c.hub.disconnect('peer2'); c.cut = true; } } });
  assertSync(ctx, 400, [0, 1]);
  const d0 = ctx.events[0].find(e => e.type === 'drop'), d1 = ctx.events[1].find(e => e.type === 'drop');
  assert(d0 && d1 && d0.player === 2 && d0.turn === d1.turn, JSON.stringify([d0, d1]));
  for (const i of [0, 1]) {
    const g = ctx.peers[i].g;
    assert(g.players[2].out, '탈락');
    assert(!g.ents.some(e => e.owner === 2), '유닛 전부 사망');
    assert.deepStrictEqual(ctx.peers[i].sess.status().players, ['live', 'live', 'dropped']);
  }
  const sur = ctx.peers[0].rec.cmds.filter(([, c]) => c.type === 'surrender');
  assert.deepStrictEqual(sur.map(([t, c]) => [t, c.player]), [[d0.turn * 2, 2]]);
});

test('조용한 정지(10초) → 자동 내보내기, 깨어난 피어는 dropped', () => {
  const ctx = game({ n: 3, map: 'expanse', ticks: 500, latency: 30, skip: (i, t) => i === 2 && t >= 4000 && t < 20000 });
  assertSync(ctx, 500, [0, 1]);
  for (const i of [0, 1]) {
    const dr = ctx.events[i].find(e => e.type === 'dropping');
    assert(dr && dr.player === 2);
    assert(ctx.peers[i].g.players[2].out);
  }
  assert(ctx.events[2].some(e => e.type === 'dropped'));
  assert.strictEqual(ctx.peers[2].sess.state, 'dropped');
});

test('autoDrop:false → 대기만(lag), UI 가 drop(p) 하면 진행', () => {
  const ctx = game({ n: 2, ticks: 300, sessOpt: { autoDrop: false }, skip: i => i === 1, maxMs: 15000 });
  assert.strictEqual(ctx.peers[0].sess.state, 'running');
  assert(ctx.events[0].some(e => e.type === 'lag'));
  assert(!ctx.events[0].some(e => e.type === 'dropping'));
  const q = ctx.peers[0], t0 = q.g.tick;
  q.sess.drop(1);
  while (q.g.tick < t0 + 40) assert(q.sess.tick(), '혼자 남으면 바로 진행');
  assert(q.g.players[1].out);
});

test('4피어 중 하나 끊김 + 다른 하나는 링크 일부 단절 없이 계속: 남은 3피어 같은 턴에 내보냄', () => {
  const ctx = game({ n: 4, map: 'expanse', ticks: 300, latency: 50, jitter: 100, seed: 9,
    at: (t, c) => { if (t === 4000) c.hub.disconnect('peer1'); } });
  assertSync(ctx, 300, [0, 2, 3]);
  const turns = [0, 2, 3].map(i => ctx.events[i].find(e => e.type === 'drop').turn);
  assert(turns.every(x => x === turns[0]), turns);
});

test('hello 불일치(시드 다름) → mismatch, 진행 안 함', () => {
  let t = 0;
  const now = () => t, hub = NET.loopback({ now }), ids = ['a', 'b'], ev = [[], []], players = roster(2);
  const ss = ids.map((id, i) => NET.session({ sim: S, game: S.createGame({ seed: i ? 2 : 1, players, map: 'crossing' }), self: i, peers: ids, transport: hub.endpoint(id), now, version: V, onEvent: e => ev[i].push(e) }));
  for (let k = 0; k < 10; k++) { for (const s of ss) s.tick(); t += 50; hub.deliver(); }
  for (const i of [0, 1]) { assert.strictEqual(ss[i].state, 'mismatch'); assert.strictEqual(ev[i][0].field, 'ck0'); }
});

test('채팅·핑: 별도 채널(팀 범위), 체크섬·리플레이 무관, 잘못된 메시지 무시', () => {
  let t = 0;
  const now = () => t, hub = NET.loopback({ now, latency: 20 }), ids = ['a', 'b', 'c'], ev = [[], [], []];
  const players = [{ race: 'legion', team: 0, slot: 0, color: 0 }, { race: 'swarm', team: 0, slot: 1, color: 1 }, { race: 'elysian', team: 1, slot: 2, color: 2 }];
  const gs = ids.map(() => S.createGame({ seed: 3, players, map: 'expanse' }));
  const recs = ids.map(() => RP.create({ seed: 3, map: 'expanse', players }, V));
  const trs = ids.map(id => hub.endpoint(id));
  const ss = ids.map((id, i) => NET.session({ sim: S, game: gs[i], self: i, peers: ids, transport: trs[i], now, rec: recs[i], version: V, onEvent: e => ev[i].push(e) }));
  const run = k => { for (let j = 0; j < k; j++) { for (const s of ss) s.tick(); t += 50; hub.deliver(); } };
  run(5);
  ss[0].chat('  gg  ');
  ss[0].chat('팀만', 'team');
  ss[2].ping(10 * S.TFP, 20 * S.TFP, 'help');
  trs[2].send('a', { t: 'chat', text: 42 });
  trs[2].send('a', { t: 'cmd', turn: 'x', cmds: 'y' });
  trs[2].send('a', { t: 'cmd', turn: 999999, cmds: [] });
  trs[2].send('a', null);
  run(60);
  const chats = i => ev[i].filter(e => e.type === 'chat').map(e => [e.player, e.text, e.scope]);
  assert.deepStrictEqual(chats(0), [[0, 'gg', 'all'], [0, '팀만', 'team']]);
  assert.deepStrictEqual(chats(1), [[0, 'gg', 'all'], [0, '팀만', 'team']]);
  assert.deepStrictEqual(chats(2), [[0, 'gg', 'all']]);
  assert.deepStrictEqual(ev[2].filter(e => e.type === 'ping').map(e => e.kind), ['help']);
  assert(!ev[0].some(e => e.type === 'ping') && !ev[1].some(e => e.type === 'ping'), '적 팀 핑은 안 옴');
  assert(gs.every(g => g.tick === gs[0].tick && S.checksum(g) === S.checksum(gs[0])));
  assert(recs.every(r => r.cmds.length === 0));
});

// ---- 믿지 않는 피어(검토 재현 → 회귀) ----
const errs = ctx => ctx.events.flatMap((e, i) => e.filter(x => x.type === 'error').map(x => [i, x]));
const turnOf = q => q.g.tick / 2 | 0;

test('검사: commandCheck — 타입별 허용 필드만, 잘못된 필드·모르는 타입·프로토타입 키 거부', () => {
  const g = S.createGame({ seed: 1, players: roster(2), map: 'crossing' }), chk = NET.commandCheck(S, g), TF = S.TFP;
  assert.deepStrictEqual(chk({ type: 'move', ids: [3, 4], x: 5 * TF, y: 6 * TF, player: 1, junk: { a: 1 } }, 0), { type: 'move', player: 0, ids: [3, 4], x: 5 * TF, y: 6 * TF });
  assert.deepStrictEqual(chk({ type: 'surrender', player: 1 }, 0), { type: 'surrender', player: 0 });
  assert.deepStrictEqual(chk({ type: 'autocast', ids: [1], what: Object.keys(D.abilities)[0], on: true }, 1).on, true);
  assert(chk({ type: 'build', ids: [1], what: 'depot' }, 0), '부속(tx/ty 없음)');
  for (const bad of [
    { type: 'move', ids: 5, x: 1, y: 1 }, { type: 'move', ids: [1, 'x'], x: 1, y: 1 }, { type: 'move', ids: [1.5], x: 1, y: 1 },
    { type: 'move', ids: [1] }, { type: 'move', ids: [1], x: 1.5, y: 1 }, { type: 'move', ids: [1], x: 1e308, y: 1 }, { type: 'move', ids: [1], x: null, y: 1 },
    { type: 'move', ids: Array(2000).fill(1), x: 1, y: 1 }, { type: 'attack', ids: [1], target: -1 }, { type: 'attack', ids: [1] },
    { type: 'train', ids: [1], what: '__proto__' }, { type: 'train', ids: [1], what: 'constructor' }, { type: 'train', ids: [1], what: 'x'.repeat(40) },
    { type: 'train', ids: [1], what: 7 }, { type: 'land', ids: [1], tx: -1, ty: 0 }, { type: 'land', ids: [1], tx: g.map.w, ty: 0 },
    { type: 'autocast', ids: [1], what: Object.keys(D.abilities)[0], on: 1 }, { type: 'x' }, { type: 'toString' }, { type: '__proto__' }, null, [], 'move', { ids: [1] },
  ]) assert.strictEqual(chk(bad, 0), null, JSON.stringify(bad));
});

test('검사 통과한 무작위 명령(퍼징)은 sim 을 깨지 않는다', () => {
  const types = ['move', 'attackMove', 'patrol', 'setRally', 'attack', 'gather', 'repair', 'load', 'stop', 'hold', 'merge', 'lift', 'burrow', 'unburrow',
    'siege', 'unsiege', 'train', 'research', 'morph', 'build', 'land', 'cast', 'autocast', 'unload', 'surrender'];
  const names = [...Object.keys(D.units), ...Object.keys(D.buildings), ...Object.keys(D.upgrades), ...Object.keys(D.abilities)];
  let r = 11, acc = 0;
  const rnd = n => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r % n; };
  for (let s = 0; s < 16; s++) {
    const g = S.createGame({ seed: s + 1, players: [{ race: ['legion', 'swarm', 'elysian'][s % 3], team: 0, slot: 0, color: 0 }, { race: ['swarm', 'elysian', 'legion'][s % 3], team: 1, slot: 1, color: 1 }], map: ['crossing', 'expanse', 'isles', 'maze'][s % 4] });
    const chk = NET.commandCheck(S, g), LIM = Math.max(g.map.w, g.map.h) * S.TFP;
    for (let t = 0; t < 150; t++) {
      const cmds = [];
      for (let k = 0; k < 4; k++) {
        const id = () => (rnd(4) ? g.ents[rnd(g.ents.length)].id : rnd(100000)), v = () => [0, -LIM, 2 * LIM, rnd(g.map.w * S.TFP), rnd(3) - 1][rnd(5)];
        const c = { type: types[rnd(types.length)], ids: Array.from({ length: rnd(12) }, id), x: v(), y: v(), target: id(), unit: id(), what: names[rnd(names.length)], tx: rnd(g.map.w), ty: rnd(g.map.h), on: !!rnd(2) };
        for (const f of Object.keys(c)) if (f !== 'type' && !rnd(4)) delete c[f];
        const x = chk(c, rnd(2));
        if (x) { acc++; cmds.push(x); }
      }
      S.step(g, cmds);
    }
    assert(g.ents.every(e => Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.hp)), 'seed ' + s);
  }
  assert(acc > 3000, 'accepted ' + acc);
});

test('queue: 검사 못 넘는 명령은 -1(받는 쪽과 같은 판정), 한 턴 256개 넘치면 다음 턴으로', () => {
  const ctx = game({ n: 2, ticks: 40, act: () => [] });
  const q = ctx.peers[0];
  assert.strictEqual(q.sess.queue({ type: 'move', ids: 5, x: 1, y: 1 }), -1);
  assert.strictEqual(q.sess.queue({ type: 'nuke' }), -1);
  const turns = Array.from({ length: 300 }, () => q.sess.queue({ type: 'stop', ids: [] }));
  assert(turns.slice(0, 256).every(x => x === turns[0]) && turns.slice(256).every(x => x === turns[0] + 1), [turns[0], turns[255], turns[256]]);
  const ctx2 = game({ n: 2, ticks: 60, act: (g, p) => (p === 0 && g.tick === 10 ? Array.from({ length: 300 }, () => ({ type: 'stop', ids: [] })) : []) });
  assertSyncLoose(ctx2, 60);
  const per = new Map();
  for (const [t, c] of ctx2.peers[1].rec.cmds) if (c.type === 'stop') per.set(t, (per.get(t) || 0) + 1);
  assert.deepStrictEqual([...per.values()], [256, 44]);
});
// 명령 수 조건 없는 동기 확인
function assertSyncLoose(ctx, ticks, who = ctx.peers.map(q => q.i)) {
  for (const i of who) assert.strictEqual(ctx.peers[i].g.tick, ticks, `peer${i} tick ${ctx.peers[i].g.tick}`);
  for (const i of who.slice(1)) assert.deepStrictEqual([...ctx.sums[i]], [...ctx.sums[who[0]]], `peer${i} 체크섬 ≠ peer${who[0]}`);
}

test('잘못된 명령 필드(ids:5) 묶음 → 거부·보낸 피어 내보냄, 받는 쪽 sim 예외 없음(crash.js)', () => {
  const ctx = game({ n: 3, map: 'expanse', ticks: 400, latency: 30,
    at: (t, c) => { if (t === 2000) c.peers[2].raw.send('peer0', { t: 'cmd', turn: turnOf(c.peers[0]) + 3, cmds: [{ type: 'move', ids: 5, x: 1, y: 1 }] }); } });
  assertSync(ctx, 400, [0, 1]);
  assert.deepStrictEqual(errs(ctx), []);
  for (const i of [0, 1]) assert.deepStrictEqual(ctx.peers[i].sess.status().players, ['live', 'live', 'dropped']);
  assert(!ctx.peers[0].rec.cmds.some(([, c]) => c.type === 'move' && !Array.isArray(c.ids)));
});

test('S.step 예외(방어) → state error, error 이벤트 한 번, 다시 던지지 않음', () => {
  let boom = 0;
  const bad = { ...S, step: (g, c) => { if (g.tick === 50) { boom++; throw new Error('kaboom'); } return S.step(g, c); } };
  const ctx = game({ n: 2, ticks: 200, sim: bad, maxMs: 6000 });
  for (const i of [0, 1]) {
    const q = ctx.peers[i];
    assert.strictEqual(q.sess.state, 'error');
    assert.deepStrictEqual(ctx.events[i].filter(e => e.type === 'error').map(e => [e.reason, e.message]), [['step', 'kaboom']]);
    assert.strictEqual(q.sess.tick(), null);
  }
  assert.strictEqual(boom, 2, '피어마다 한 번');
});

test('부풀린 have 의 drop 공지(forge.js) → 공지한 피어 내보냄, 지목된 피어·정직한 피어는 계속', () => {
  const ctx = game({ n: 3, map: 'expanse', ticks: 400, latency: 30,
    at: (t, c) => { if (t === 2000) c.peers[2].raw.send('peer0', { t: 'drop', p: 1, have: turnOf(c.peers[0]) + 60, b: [] }); } });
  assertSync(ctx, 400, [0, 1]);
  for (const i of [0, 1]) assert.deepStrictEqual(ctx.peers[i].sess.status().players, ['live', 'live', 'dropped']);
  assert(!ctx.events[0].some(e => e.type === 'dropping' && e.player === 1));
});

test('drop 공지 중계 묶음에 빈틈(have 까지 못 채움) → 공지한 피어 내보냄', () => {
  const ctx = game({ n: 3, map: 'expanse', ticks: 400, latency: 30,
    at: (t, c) => { if (t === 2000) c.peers[2].raw.send('peer0', { t: 'drop', p: 1, have: turnOf(c.peers[0]) + 5, b: [] }); } });
  assertSync(ctx, 400, [0, 1]);
  for (const i of [0, 1]) assert.deepStrictEqual(ctx.peers[i].sess.status().players, ['live', 'live', 'dropped']);
});

test('나를 내보내는 공지 하나(과반 아님) → 무시하고 계속', () => {
  const ctx = game({ n: 3, map: 'expanse', ticks: 300, latency: 30,
    at: (t, c) => { if (t === 2000) c.peers[2].raw.send('peer1', { t: 'drop', p: 1, have: turnOf(c.peers[1]), b: [] }); } });
  assertSync(ctx, 300);
  assert(ctx.peers.every(q => q.sess.state === 'running'));
  assert(!ctx.events[1].some(e => e.type === 'dropped'));
});

test('hello 안 끝난 피어의 drop 공지 무시, live 자리의 dropFinal 무시', () => {
  let t = 0;
  const now = () => t, hub = NET.loopback({ now, latency: 20 }), ids = ['a', 'b', 'c'], players = roster(3), ev = [[], [], []];
  const trs = ids.map(id => hub.endpoint(id));
  const ss = [0, 1].map(i => NET.session({ sim: S, game: S.createGame({ seed: 4, players, map: 'expanse' }), self: i, peers: ids, transport: trs[i], now, version: V, onEvent: e => ev[i].push(e) }));
  trs[2].send('a', { t: 'drop', p: 1, have: 1, b: [] }); // c 는 hello 를 안 보냈다
  trs[2].send('a', { t: 'dropFinal', p: 1, F: 1, b: [] });
  for (let k = 0; k < 10; k++) { for (const s of ss) s.tick(); t += 50; hub.deliver(); }
  assert.deepStrictEqual(ss[0].status().players, ['live', 'live', 'live']);
  assert(!ev[0].some(e => e.type === 'dropping'));
});

test('dropFinal 의 F 가 묶음보다 앞서면(빈틈) 적용 안 함 → 보낸 피어 내보냄', () => {
  // peer0 이 조정자. peer2 잠듦 → peer0 이 drop(2). peer0 → peer1 dropFinal 을 F+1·빈 묶음으로 변조.
  const ctx = game({ n: 3, map: 'expanse', ticks: 300, latency: 30, sessOpt: { autoDrop: false }, skip: (i, t) => i === 2 && t >= 2000, maxMs: 30000,
    wrap: (tr, i) => { if (i === 0) { const send = tr.send.bind(tr); tr.send = (to, m) => send(to, m.t === 'dropFinal' ? { ...m, F: m.F + 1, b: [] } : m); } return tr; },
    at: (t, c) => { if (t === 5000) c.peers[0].sess.drop(2); } });
  assert.deepStrictEqual(errs(ctx), []);
  const d1 = ctx.events[1].filter(e => e.type === 'drop').map(e => e.player);
  assert.deepStrictEqual(d1.sort(), [0, 2], '변조한 peer0 을 내보내고 혼자서 2 확정');
  const f0 = ctx.events[0].find(e => e.type === 'drop' && e.player === 2), f1 = ctx.events[1].find(e => e.type === 'drop' && e.player === 2);
  assert.strictEqual(f1.turn, f0.turn, '변조된 F+1 이 아닌 원래 F');
});

// twodrop*.js: 4피어, t=3000 에 C 가 A·B 와 끊김(D 에게만 닿음). D 는 C 내보내기 공지를 처음 보내는 순간 D→A 도 끊김.
function twoDrop({ ticks = 600, dLazy = false, mode = 'send', act = human } = {}) {
  const blocked = new Set();
  return game({ n: 4, map: 'expanse', ticks, latency: 30, seed: 5, maxMs: 90000, act,
    optFor: i => (dLazy && i === 3 ? { dropAfterMs: 1e9 } : {}),
    wrap: (tr, i) => {
      const send = tr.send.bind(tr);
      tr.send = (to, m) => {
        if (mode === 'send' && tr.id === 'peer3' && m.t === 'drop' && m.p === 2) blocked.add('peer3>peer0');
        if (!blocked.has(tr.id + '>' + to)) send(to, m);
      };
      return tr;
    },
    at: (t, c) => {
      if (t === 3000) { blocked.add('peer2>peer0'); blocked.add('peer2>peer1'); }
      if (mode === 'status' && c.peers[3].sess.status().players[2] !== 'live') blocked.add('peer3>peer0');
    } });
}
function assertTwoDrop(ctx, ticks, loose) {
  (loose ? assertSyncLoose : assertSync)(ctx, ticks, [0, 1]);
  assert.deepStrictEqual(errs(ctx), []);
  for (const i of [0, 1]) {
    assert.strictEqual(ctx.peers[i].sess.state, 'running');
    assert.deepStrictEqual(ctx.peers[i].sess.status().players, ['live', 'live', 'dropped', 'dropped']);
    assert(ctx.peers[i].g.players[2].out && ctx.peers[i].g.players[3].out);
  }
  const fin = i => ctx.events[i].filter(e => e.type === 'drop').map(e => [e.player, e.turn]).sort((a, b) => a[0] - b[0]);
  assert.deepStrictEqual(fin(1), fin(0), '같은 F');
  for (const i of [2, 3]) assert.strictEqual(ctx.peers[i].sess.state, 'dropped');
}

test('겹친 내보내기(twodrop4): 조정자 하나가 F 를 정한다 — 실제 명령으로 A·B 체크섬·재생 일치', () => {
  assertTwoDrop(twoDrop({ dLazy: true }), 600);
});
test('남을 기다리느라 멈춘 피어는 내보내지 않는다(하트비트, twodrop.js 그대로)', () => {
  // 원 재현 루프 그대로: 배달은 t 증가 전, D 는 C 를 live 아님으로 보는 순간부터 D→A 끊김
  let t = 0;
  const now = () => t, hub = NET.loopback({ now, latency: 30 }), ids = ['A', 'B', 'C', 'D'], players = roster(4), ev = ids.map(() => []), blocked = new Set();
  const sums = ids.map(() => new Map());
  const peers = ids.map((id, i) => {
    const tr = hub.endpoint(id), send = tr.send.bind(tr);
    tr.send = (to, m) => { if (!blocked.has(id + '>' + to)) send(to, m); };
    const g = S.createGame({ seed: 5, players, map: 'expanse' });
    return { g, i, sess: NET.session({ sim: S, game: g, self: i, peers: ids, transport: tr, now, version: V, onEvent: e => ev[i].push(e) }) };
  });
  for (; t < 60000; t += 50) {
    if (t === 3000) { blocked.add('C>A'); blocked.add('C>B'); }
    if (!blocked.has('D>A') && peers[3].sess.status().players[2] !== 'live') blocked.add('D>A');
    for (const q of peers) if (q.sess.state === 'running') { if (q.g.tick % 7 === 0 && q.sess.ready()) q.sess.queue({ type: 'stop', ids: [] }); if (q.sess.tick()) sums[q.i].set(q.g.tick, S.checksum(q.g)); }
    hub.deliver();
  }
  for (const i of [0, 1]) {
    assert.strictEqual(peers[i].sess.state, 'running', ids[i]);
    assert.deepStrictEqual(peers[i].sess.status().players, ['live', 'live', 'dropped', 'dropped']);
    assert(peers[i].g.tick > 700, ids[i] + ' tick ' + peers[i].g.tick);
  }
  for (const [k, v] of sums[0]) if (sums[1].has(k)) assert.strictEqual(sums[1].get(k), v, 'tick ' + k);
  const fin = i => ev[i].filter(e => e.type === 'drop').map(e => [e.player, e.turn]).sort((a, b) => a[0] - b[0]);
  assert.deepStrictEqual(fin(1), fin(0));
  assert(!ev[1].some(e => e.type === 'dropping' && e.player === 0) && !ev[3].some(e => e.type === 'dropping' && e.player === 0), 'A 를 탓하지 않음');
});
test('남을 기다리느라 멈춘 피어는 내보내지 않는다(하트비트, twodrop3.js)', () => {
  const ctx = twoDrop({ mode: 'send' });
  assertTwoDrop(ctx, 600);
  assert(!ctx.events[1].some(e => e.type === 'dropping' && e.player === 0) && !ctx.events[3].some(e => e.type === 'dropping' && e.player === 0));
});

// peer3 잠듦(autoDrop 끔). peer0(조정자)이 drop(3) → F 를 peer1 에게만 보내고 바로 끊김.
// relay=false 면 peer1 의 재전파도 peer0 이 사라질 때까지 peer2 에게 막힌다 → peer2 는 새 조정자(peer1)에게 다시 공지하고, peer1 이 확정값으로 답한다.
function partialFinal(relay) {
  let cutDone = false, gone = false;
  const ctx = game({ n: 4, map: 'expanse', ticks: 300, latency: 30, seed: 3, sessOpt: { autoDrop: false }, skip: (i, t) => i === 3 && t >= 2000, maxMs: 40000,
    wrap: (tr, i) => {
      const send = tr.send.bind(tr);
      if (i === 0) tr.send = (to, m) => { if (m.t === 'dropFinal') { if (to === 'peer1') send(to, m); cutDone = true; return; } send(to, m); };
      if (i === 1 && !relay) tr.send = (to, m) => { if (m.t === 'dropFinal' && to === 'peer2' && !gone) return; send(to, m); };
      return tr;
    },
    at: (t, c) => {
      if (t === 5000) c.peers[0].sess.drop(3);
      if (cutDone && !gone) { gone = true; c.hub.disconnect('peer0'); }
    } });
  assertSync(ctx, 300, [1, 2]);
  assert.deepStrictEqual(errs(ctx), []);
  const f = i => ctx.events[i].filter(e => e.type === 'drop').map(e => [e.player, e.turn]).sort((a, b) => a[0] - b[0]);
  assert.deepStrictEqual(f(2), f(1));
  assert.deepStrictEqual(f(1).map(x => x[0]), [0, 3]);
  assert.strictEqual(f(1).find(x => x[0] === 3)[1], ctx.events[0].find(e => e.type === 'drop' && e.player === 3).turn, '앞 조정자의 F 그대로');
  return ctx;
}
test('조정자가 F 를 일부에게만 보내고 끊김 → 받은 피어의 재전파로 같은 F', () => { partialFinal(true); });
test('조정자가 F 를 일부에게만 보내고 끊김 + 재전파도 막힘 → 새 조정자에게 다시 공지, 확정값으로 답', () => {
  const ctx = partialFinal(false);
  assert(ctx.events[2].some(e => e.type === 'dropping' && e.player === 0));
});

test('hello 유실 → 1초마다 재전송, 링크 회복 뒤 진행', () => {
  const ctx = game({ n: 2, ticks: 100, at: (t, c) => { if (t === 0) c.hub.cut('peer0', 'peer1'); if (t === 2500) c.hub.heal('peer0', 'peer1'); } });
  assertSync(ctx, 100);
  assert(ctx.events.every(e => e.some(x => x.type === 'lag') && !e.some(x => x.type === 'dropping')));
});

test('ck: ckEvery 배수 아님·먼 미래 틱은 버린다(맵 무한 증가·거짓 desync 방지)', () => {
  const ctx = game({ n: 3, map: 'expanse', ticks: 300, latency: 20,
    at: (t, c) => { if (t === 1000) { c.peers[2].raw.send('peer0', { t: 'ck', tick: 241, ck: 1 }); c.peers[2].raw.send('peer0', { t: 'ck', tick: 280, ck: 1 }); } } });
  assert(ctx.peers[0].g.tick < 280 - 64 * 2 + 300, 'sanity');
  assertSync(ctx, 300);
  assert(!ctx.events[0].some(e => e.type === 'desync'));
});

test('drift(): 느린 피어보다 한 턴 넘게 앞서면 1.05 → 시계가 따르면(5% 늘임) 따라잡혀 1', () => {
  const seen = [];
  let f = 1, n = 0;
  // peer1 은 2~6초 동안 절반 속도. peer0 의 시계는 drift() 를 따라 1.05 면 스무 번에 한 번 쉰다.
  const ctx = game({ n: 2, ticks: 500, latency: 20,
    skip: (i, t) => (i === 1 ? t >= 2000 && t < 6000 && (t / 50) % 2 === 1 : f > 1 && ++n % 20 === 0),
    at: (t, c) => { f = c.peers[0].sess.drift(); if (t > 2000 && t < 6000) seen.push(f); if (t > 14000 && t < 20000) seen.push(-f); } });
  assertSync(ctx, 500);
  assert(seen.includes(1.05), '앞섰을 때 늘이기');
  assert(seen.some(x => x < 0) && seen.filter(x => x < 0).every(x => x === -1), '따라잡힌 뒤 1');
});

test('채팅·핑 받는 쪽 검사: 적 팀 팀채팅·적 핑 버림, 핑 좌표 자름, 채팅 3초에 5개', () => {
  let t = 0;
  const now = () => t, hub = NET.loopback({ now, latency: 20 }), ids = ['a', 'b', 'c'], ev = [[], [], []];
  const players = [{ race: 'legion', team: 0, slot: 0, color: 0 }, { race: 'swarm', team: 0, slot: 1, color: 1 }, { race: 'elysian', team: 1, slot: 2, color: 2 }];
  const trs = ids.map(id => hub.endpoint(id));
  const ss = ids.map((id, i) => NET.session({ sim: S, game: S.createGame({ seed: 3, players, map: 'expanse' }), self: i, peers: ids, transport: trs[i], now, version: V, onEvent: e => ev[i].push(e) }));
  const run = k => { for (let j = 0; j < k; j++) { for (const s of ss) s.tick(); t += 50; hub.deliver(); } };
  run(5);
  trs[2].send('a', { t: 'chat', text: '적 팀채팅', scope: 'team' });
  trs[2].send('a', { t: 'ping', x: 1, y: 1 });
  trs[1].send('a', { t: 'ping', x: -5, y: 1e9 });
  for (let k = 0; k < 8; k++) trs[1].send('a', { t: 'chat', text: 'spam' + k });
  run(10);
  assert(!ev[0].some(e => e.type === 'chat' && e.player === 2));
  assert.deepStrictEqual(ev[0].filter(e => e.type === 'ping').map(e => [e.player, e.x, e.y]), [[1, 0, ss[0] && S.createGame({ seed: 3, players, map: 'expanse' }).map.h * S.TFP - 1]]);
  assert.strictEqual(ev[0].filter(e => e.type === 'chat' && e.player === 1).length, 5);
  t += 3100;
  trs[1].send('a', { t: 'chat', text: 'later' });
  run(5);
  assert.strictEqual(ev[0].filter(e => e.type === 'chat' && e.player === 1).length, 6);
});

// ---- PeerJS 어댑터: 가짜 Peer(같은 API 일부)로 메시 형성·전송·끊김 ----
// opt.hang = 연결이 영영 안 열리는 id 집합, opt.failOpen = { id: 오류 type } 열리기 전 오류
function fakePeerLib(opt = {}) {
  const reg = new Map(), hang = opt.hang || new Set(), failOpen = opt.failOpen || {};
  Peer0.destroyed = [];
  const later = f => setImmediate(f);
  class Em { constructor() { this.h = {}; } on(k, f) { (this.h[k] = this.h[k] || []).push(f); } emit(k, ...a) { for (const f of this.h[k] || []) f(...a); } }
  class Conn extends Em {
    constructor(peer, owner) { super(); this.peer = peer; this.owner = owner; this.open = false; this.other = null; }
    send(m) { const o = this.other, d = JSON.stringify(m); if (this.open && o) later(() => o.open && o.emit('data', JSON.parse(d))); }
    close() { if (!this.open) return; this.open = false; const o = this.other; this.emit('close'); if (o && o.open) { o.open = false; o.emit('close'); } }
  }
  class Peer extends Em {
    constructor(id) {
      super(); this.id = typeof id === 'string' ? id : 'auto' + reg.size;
      later(() => { if (failOpen[this.id]) { this.emit('error', { type: failOpen[this.id] }); return; } reg.set(this.id, this); this.emit('open', this.id); });
    }
    connect(to) {
      const a = new Conn(to, this);
      later(() => {
        const dst = reg.get(to);
        if (hang.has(to)) return;
        if (!dst) { this.emit('error', { type: 'peer-unavailable', message: 'Could not connect to peer ' + to }); return; }
        const b = new Conn(this.id, dst); a.other = b; b.other = a;
        dst.emit('connection', b);
        later(() => { a.open = b.open = true; a.emit('open'); b.emit('open'); });
      });
      return a;
    }
    destroy() { Peer0.destroyed.push(this.id); reg.delete(this.id); for (const c of this.conns || []) c.close(); }
  }
  // destroy 가 연결을 닫도록 연결 목록 추적
  const orig = Peer.prototype.connect;
  Peer.prototype.connect = function (to) { const c = orig.call(this, to); (this.conns = this.conns || []).push(c); return c; };
  const origEmit = Peer.prototype.emit;
  Peer.prototype.emit = function (k, ...a) { if (k === 'connection') (this.conns = this.conns || []).push(a[0]); return origEmit.call(this, k, ...a); };
  Peer0.Peer = Peer;
  return Peer;
}
const Peer0 = {};
const settle = (ms = 30) => new Promise(r => setTimeout(r, ms));

test('PeerJS 어댑터(가짜 Peer): 방장 하나에만 붙어도 4명 메시, 세션 60틱 동기, 끊김 → onclose', async () => {
  const Peer = fakePeerLib();
  const names = ['host', 'j1', 'j2', 'j3'];
  const trs = [];
  for (const id of names) trs.push(await NET.openPeer({ id, Peer }));
  for (const tr of trs.slice(1)) await tr.connect('host');
  await settle(50);
  for (const tr of trs) assert.deepStrictEqual(tr.peers().sort(), names.filter(x => x !== tr.id).sort(), tr.id + ' 메시');
  await assert.rejects(trs[1].connect('nobody'), /peer-unavailable/);
  const players = roster(4), gs = names.map(() => S.createGame({ seed: 8, players, map: 'expanse' }));
  const ss = names.map((id, i) => NET.session({ sim: S, game: gs[i], self: i, peers: names, transport: trs[i], version: V }));
  const rs = names.map((_, i) => ({ s: 50 + i }));
  for (let k = 0; k < 400 && gs.some(g => g.tick < 60); k++) {
    for (let i = 0; i < 4; i++) if (gs[i].tick < 60 && ss[i].ready()) { for (const c of human(gs[i], i, rs[i])) ss[i].queue(c); ss[i].tick(); }
    await settle(1);
  }
  assert(gs.every(g => g.tick === 60), gs.map(g => g.tick));
  assert(gs.every(g => S.checksum(g) === S.checksum(gs[0])));
  const closed = [];
  trs[0].onclose = id => closed.push(id);
  trs[3].close();
  await settle(20);
  assert.deepStrictEqual(closed, ['j3']);
});

test('PeerJS 어댑터: 동시에 서로 연결(중복) → 양쪽 모두 작은 id 쪽 연결 하나만 남김, 메시지 정상, 닫으면 onclose 한 번', async () => {
  const Peer = fakePeerLib();
  const a = await NET.openPeer({ id: 'a', Peer, mesh: false }), b = await NET.openPeer({ id: 'b', Peer, mesh: false });
  await Promise.all([a.connect('b'), b.connect('a')]);
  const got = [], closed = [];
  b.onmessage = (f, m) => got.push([f, m.k]); a.onmessage = (f, m) => got.push([f, m.k]);
  a.onclose = id => closed.push('a:' + id); b.onclose = id => closed.push('b:' + id);
  for (let k = 0; k < 3; k++) { a.send('b', { k }); b.send('a', { k: 10 + k }); await settle(5); }
  await settle(20);
  assert.deepStrictEqual(got.filter(x => x[0] === 'a').map(x => x[1]), [0, 1, 2]);
  assert.deepStrictEqual(got.filter(x => x[0] === 'b').map(x => x[1]), [10, 11, 12]);
  assert.deepStrictEqual(closed, [], '진 연결을 닫아도 onclose 없음');
  assert.deepStrictEqual([a.peers(), b.peers()], [['b'], ['a']]);
  a.close();
  await settle(20);
  assert.deepStrictEqual(closed.sort(), ['a:b', 'b:a'], '양쪽 한 번씩');
});

test('PeerJS 어댑터: connect 시간 초과 → Error(timeout), 다시 시도 가능 · 열리기 전 오류 → Peer destroy', async () => {
  const Peer = fakePeerLib({ hang: new Set(['ghost']), failOpen: { taken: 'unavailable-id' } });
  const a = await NET.openPeer({ id: 'a', Peer, connectTimeoutMs: 30 });
  await assert.rejects(a.connect('ghost'), /timeout/);
  await assert.rejects(a.connect('ghost'), /timeout/, '항목이 지워져 새로 시도');
  await assert.rejects(NET.openPeer({ id: 'taken', Peer }), /unavailable-id/);
  assert(Peer0.destroyed.includes('taken'));
});

test('PeerJS 어댑터: roster 밖 id 는 소문내지도·따라 연결하지도 않음, 소문 목록 최대 16', async () => {
  const Peer = fakePeerLib();
  const host = await NET.openPeer({ id: 'h', Peer }), j1 = await NET.openPeer({ id: 'j1', Peer, roster: ['h', 'j1', 'j2'] });
  const j2 = await NET.openPeer({ id: 'j2', Peer }), x = await NET.openPeer({ id: 'x9', Peer });
  await j2.connect('h'); await x.connect('h');
  await j1.connect('h');
  await settle(60);
  assert.deepStrictEqual(j1.peers().sort(), ['h', 'j2'], 'roster 안 j2 만 메시');
  assert(!x.peers().includes('j1'));
  // 거대한 소문은 앞 16개만
  const fake = [...Array(40)].map((_, k) => 'z' + String(k).padStart(2, '0'));
  const q = await NET.openPeer({ id: 'q', Peer, connectTimeoutMs: 50 });
  let tries = 0;
  const realConnect = Peer.prototype.connect;
  Peer.prototype.connect = function (to) { if (this.id === 'q' && to.startsWith('z')) tries++; return realConnect.call(this, to); };
  await host.connect('q');
  await settle(10);
  host.send('q', { t: '_mesh', ids: fake });
  await settle(80);
  Peer.prototype.connect = realConnect;
  assert(tries <= 16, 'tries ' + tries);
  void j2;
});

test('loadPeerJS: 기본 CDN 은 SRI(sha384)·crossOrigin, 자체 호스팅 URL 은 integrity 생략', async () => {
  const made = [];
  global.window = {}; global.document = { createElement: () => { const s = { remove() {} }; made.push(s); return s; }, head: { appendChild: s => setImmediate(() => { window.Peer = function P() {}; s.onload(); }) } };
  try {
    const P = await NET.loadPeerJS();
    assert.strictEqual(typeof P, 'function');
    assert.strictEqual(made[0].src, NET.PEERJS_URL);
    assert.strictEqual(made[0].integrity, NET.PEERJS_SRI);
    assert(/^sha384-[A-Za-z0-9+/]{64}$/.test(NET.PEERJS_SRI));
    assert.strictEqual(made[0].crossOrigin, 'anonymous');
  } finally { delete global.window; delete global.document; }
  // 모듈 캐시(loading) 와 무관하게 새로 불러오기 위해 다시 require
  delete require.cache[require.resolve('../net.js')];
  const NET2 = require('../net.js');
  made.length = 0;
  global.window = {}; global.document = { createElement: () => { const s = { remove() {} }; made.push(s); return s; }, head: { appendChild: s => setImmediate(() => { window.Peer = function P() {}; s.onload(); }) } };
  try {
    await NET2.loadPeerJS('./vendor/peerjs.min.js');
    assert.strictEqual(made[0].src, './vendor/peerjs.min.js');
    assert.strictEqual(made[0].integrity, undefined);
    assert.strictEqual(made[0].crossOrigin, 'anonymous');
  } finally { delete global.window; delete global.document; }
});

test('loadPeerJS: node(DOM 없음)에서는 거부, URL 은 peerjs@1.5.4 고정', async () => {
  await assert.rejects(NET.loadPeerJS(), /no-dom/);
  assert(/peerjs@1\.5\.4\//.test(NET.PEERJS_URL));
});

test('리플레이 VERSION 은 net.js 와 무관(sim·data 만)', () => {
  assert.strictEqual(RP.version(S, D), V);
});

// 결함 주입 회귀(stressco): 피어 1~2 개가 끊기거나 침묵 — 생존자는 멈추지 않고(hang) 갈라지지(desync) 않아야 한다.
function stress(seed, JIT, ticks = 500) {
  let r = seed * 7919; const rnd = n => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r % n; };
  const RC = ['legion', 'swarm', 'elysian', 'legion', 'swarm'];
  const n = 3 + rnd(2);
  let t = 0; const now = () => t;
  const hub = NET.loopback({ now, latency: 30, jitter: JIT, seed });
  const ids = Array.from({ length: n }, (_, i) => 'p' + i);
  const players = Array.from({ length: n }, (_, i) => ({ race: RC[i], team: i, slot: i, color: i }));
  const sums = ids.map(() => new Map());
  const peers = ids.map((id, i) => {
    const g = S.createGame({ seed, players, map: 'expanse' });
    return { g, i, sess: NET.session({ sim: S, game: g, self: i, peers: ids, transport: hub.endpoint(id), now, version: V, dropAfterMs: 3000 }) };
  });
  const faults = [];
  rnd(2); // (원본 stressco 와 난수열을 맞춘다)
  { const at = 1000 + rnd(40) * 50, v = 1 + rnd(n - 1); faults.push({ at, kind: rnd(2) * 2, a: v, b: 0 }); faults.push({ at: at + rnd(30) * 50, kind: rnd(2) * 2, a: 0, b: 0 }); }
  const dead = new Set(), prog = ids.map(() => 0);
  while (t < 600000 && peers.some(q => !dead.has(q.i) && q.g.tick < ticks && q.sess.state === 'running')) {
    for (const f of faults) if (f.at === t) {
      if (f.kind === 0) { hub.disconnect(ids[f.a]); dead.add(f.a); }
      else { for (const x of ids) if (x !== ids[f.a]) hub.cut(ids[f.a], x); dead.add(f.a); }
    }
    for (const q of peers) {
      if (dead.has(q.i) || q.g.tick >= ticks || q.sess.state !== 'running') continue;
      if (q.sess.ready() && rnd(5) === 0) q.sess.queue({ type: 'stop', ids: [] });
      if (q.sess.tick()) { sums[q.i].set(q.g.tick, S.checksum(q.g)); prog[q.i] = t; }
    }
    t += 50; hub.deliver();
  }
  const alive = peers.filter(q => !dead.has(q.i)), bad = [];
  for (const q of alive) {
    if (q.sess.state !== 'running') bad.push(q.i + ':' + q.sess.state);
    else if (q.g.tick < ticks) bad.push(q.i + ':hang@' + q.g.tick);
  }
  for (let a = 0; a < alive.length; a++) for (let b = a + 1; b < alive.length; b++)
    for (const [tk, ck] of sums[alive[a].i]) if (sums[alive[b].i].has(tk) && sums[alive[b].i].get(tk) !== ck) { bad.push('diverge@' + tk); break; }
  return bad;
}
test('회귀: hello 전에 온 drop 이 버려져도 재공지로 복구(seed 26, jitter 2000)', () => assert.deepStrictEqual(stress(26, 2000), []));
test('회귀: 내보낸 피어의 옛 체크섬으로 desync 나지 않는다(seed 69, jitter 300)', () => assert.deepStrictEqual(stress(69, 300), []));

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); console.log('ok  ', name); } catch (e) { fail++; console.log('FAIL', name, '\n  ', e.message); }
  }
  console.log(fail ? `${fail} failed` : 'all passed');
  process.exit(fail ? 1 : 0);
})();
