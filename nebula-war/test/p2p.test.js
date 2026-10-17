// node nebula-war/test/p2p.test.js — index.html P2P 게임 루프 접착(startNet·netTick·나가기)을 DOM 없이 그대로 흉내 낸 통합 테스트
//   로비(L.start) → toGame → createGame·rec·AI → lobby.detach → session(extra = AI) → NW_CLOCK(canTick = sess.ready, setStep(STEP·drift))
//   흔들리는 loopback 위 사람 2 + AI 1: 체크섬 일치, 한쪽 나가기(항복 큐 → 실행 or 1.5초 → close) 뒤 남은 쪽 계속, 기록 단독 재생 일치.
const assert = require('assert');
const D = require('../data.js');
const S = require('../sim.js');
const RP = require('../replay.js');
const NET = require('../net.js');
const AI = require('../ai.js');
const LB = require('../lobby.js');
const CLOCK = require('../clock.js');
global.NW_REPLAY = RP; // net.js 가 rec 기록에 쓴다(브라우저와 같은 경로)
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let fail = 0;
const V = RP.version(S, D);
const RACES = Object.keys(D.races);
const STEP = 1000 / S.TICK_RATE;
const rngFrom = s => { const r = { s }; return () => S.mulberry32(r) / 4294967296; };

// 사람 흉내(lobby.test.js 와 같은 방식)
function human(g, p, r) {
  const rnd = n => S.mulberry32(r) % n, TF = S.TFP, out = [];
  const own = g.ents.filter(e => e.owner === p), units = own.filter(e => !e.isB), base = own.find(e => e.isB);
  if (g.tick === 4) {
    const crys = g.ents.filter(e => e.type === 'crystal').sort((a, b) => ((a.x - base.x) ** 2 + (a.y - base.y) ** 2) - ((b.x - base.x) ** 2 + (b.y - base.y) ** 2));
    out.push({ type: 'gather', ids: units.filter(e => e.def.worker).map(e => e.id), target: crys[0].id });
  }
  if (base && rnd(40) === 0) out.push({ type: 'train', ids: [base.id], what: D.races[g.players[p].race].worker });
  if (units.length && rnd(15) === 0) out.push({ type: 'move', ids: units.slice(0, 1 + rnd(units.length)).map(e => e.id), x: (20 + rnd(88)) * TF, y: (20 + rnd(88)) * TF });
  return out;
}

// index.html startNet + netTick + netClose + netLeave 를 그대로 옮긴 것(DOM·VS·netui 빼고)
function startNet(start, tr, lobby, now, seed) {
  const G = LB.toGame(start, tr.id);
  const g = S.createGame(G.meta), rec = RP.create(G.meta, V), bots = AI.fromRoster(g, rec.players, rec.seed);
  lobby.detach();
  const n = { g, rec, self: G.self, tr, left: false, leaving: false, leaveAt: 0, extra: [], ev: [], sums: new Map(), r: { s: seed }, steps: new Set() };
  n.sess = NET.session({ sim: S, game: g, self: G.self, peers: G.peers, transport: tr, now, version: V, rec, stepMs: STEP, onEvent: e => n.ev.push(e),
    extra: gg => { const out = []; for (const ai of bots) { if (ai.off) continue; try { out.push(...ai.think(gg)); } catch (e) { ai.off = true; } } return out; } });
  n.clock = CLOCK.create({ step: STEP, now, tick: () => netTick(n), canTick: () => !n.left && n.sess.ready() });
  n.clock.reset(now());
  return n;
}
function netTick(n) {
  if (!n.leaving && n.sess.ready()) for (const c of human(n.g, n.self, n.r)) n.sess.queue(c); // UI 명령 = U.takeCommands()
  for (const c of n.extra.splice(0)) n.sess.queue(c);
  const ev = n.sess.tick();
  const d = n.sess.drift(); n.steps.add(d); n.clock.setStep(STEP * d);
  if (ev === null) return;
  if (n.g.tick % 20 === 0) n.sums.set(n.g.tick, S.checksum(n.g));
  if (n.leaving && n.g.players[n.self].out) netClose(n);
}
function netClose(n) {
  if (n.left) return;
  n.left = true; n.rec.ticks = n.g.tick; n.rec.ck = S.checksum(n.g);
  n.sess.close(); n.tr.close();
}
function netLeave(n, t) { n.leaving = true; n.leaveAt = t; n.extra.push({ type: 'surrender', player: n.self }); }

function replayCk(rec) {
  const back = RP.decode(RP.encode(rec), V, D);
  assert(back.ok, 'rec 왕복');
  const pl = RP.player(back.rec, S), got = new Map();
  RP.runToSync(pl, rec.ticks, g => { if (g.tick % 20 === 0) got.set(g.tick, S.checksum(g)); });
  return { got, ck: S.checksum(pl.state) };
}

test('P2P 루프: 사람 2 + AI 1, 시계·drift 구동, 체크섬 일치 → B 나가기(항복) → A 계속 → 기록 단독 재생 일치', () => {
  let t = 0;
  const now = () => t, hub = NET.loopback({ now, latency: 25, jitter: 30, seed: 7 });
  const htr = hub.endpoint('host'), btr = hub.endpoint('B');
  let bStart = null;
  const H = LB.host({ tr: htr, me: { name: 'A' }, maps: D.maps, map: 'crossing', version: V, now, rng: rngFrom(5), races: RACES });
  const B = LB.join({ tr: btr, hostId: 'host', name: 'B', version: V, now, maps: D.maps, races: RACES, onStart: s => { bStart = s; } });
  const run = ms => { const end = t + ms; while (t < end) { t += 10; hub.deliver(); } };
  run(200);
  H.setMap('expanse'); H.setSeat(2, { kind: 'ai', level: 'normal' }); H.setSeat(3, { kind: 'closed' }); run(200);
  B.req('ready', true); run(200);
  assert.strictEqual(H.canStart().ok, true, H.canStart().why);
  const st = H.start();
  const A = startNet(st, htr, H, now, 101);
  run(300); // B 는 VS 화면이 늦게 뜬 피어 — 방장 hello 를 로비 처리기가 먼저 받는다
  assert(bStart, 'B 가 L.start 받음');
  const Bn = startNet(bStart, btr, B, now, 202);
  const peers = [A, Bn];
  // 프레임마다(16ms) pump, 사이사이 전송
  const play = (ms, until = () => false) => { const end = t + ms; while (t < end && !until()) { t += 16; hub.deliver(); for (const q of peers) if (!q.left) q.clock.pump(t); } };
  play(90000, () => peers.every(q => q.g.tick >= 1200));
  for (const q of peers) {
    assert(q.g.tick >= 1200, 'tick ' + q.g.tick);
    assert(!q.ev.some(e => ['desync', 'error', 'mismatch', 'dropped'].includes(e.type)), JSON.stringify(q.ev.slice(0, 5)));
  }
  let common = 0;
  for (const [k, v] of A.sums) if (Bn.sums.has(k)) { assert.strictEqual(Bn.sums.get(k), v, 'tick ' + k); common++; }
  assert(common >= 55, 'common ' + common);
  assert(A.rec.cmds.some(([, c]) => c.player === 2), 'AI 명령 기록');
  assert(A.rec.cmds.some(([, c]) => c.player === 1), 'B 명령 기록');

  // B 나가기: 항복 큐 → 그 턴 실행 시 close(1.5초 안전장치)
  netLeave(Bn, t);
  play(1500, () => Bn.left);
  if (!Bn.left) netClose(Bn);
  assert(Bn.g.players[Bn.self].out, 'B 항복이 실행된 뒤 닫힘');
  const aAt = A.g.tick;
  play(20000, () => A.g.tick >= aAt + 400);
  assert(A.g.tick >= aAt + 400, 'A 가 B 없이 계속 진행: ' + aAt + ' → ' + A.g.tick);
  assert(A.g.players[1].out, 'A 에서도 B 탈락');
  assert(A.ev.some(e => e.type === 'drop' && e.player === 1), 'A 가 B 내보내기 확정');
  assert(!A.ev.some(e => ['desync', 'error'].includes(e.type)));
  netClose(A);

  // 기록 단독 재생: A·B 각자 rec 이 각자 체크섬을 재현, 겹치는 구간은 서로 같다
  for (const q of peers) {
    const { got, ck } = replayCk(q.rec);
    assert.strictEqual(ck, q.rec.ck, '끝 체크섬');
    for (const [k, v] of q.sums) assert.strictEqual(got.get(k), v, '재생 tick ' + k);
  }
});

test('P2P 루프: 체크섬은 세션 rec 만으로 재현(RP.record 중복 없음), drift 는 1 또는 1.05', () => {
  let t = 0;
  const now = () => t, hub = NET.loopback({ now, latency: 5, jitter: 60, seed: 3 });
  const atr = hub.endpoint('a'), btr = hub.endpoint('b');
  let bStart = null;
  const H = LB.host({ tr: atr, me: { name: 'A' }, maps: D.maps, map: 'crossing', version: V, now, rng: rngFrom(8), races: RACES });
  const B = LB.join({ tr: btr, hostId: 'a', name: 'B', version: V, now, maps: D.maps, races: RACES, onStart: s => { bStart = s; } });
  const run = ms => { const end = t + ms; while (t < end) { t += 10; hub.deliver(); } };
  run(200); B.req('ready', true); run(200);
  const st = H.start(); run(100);
  const peers = [startNet(st, atr, H, now, 1), startNet(bStart, btr, B, now, 2)];
  const end = t + 30000;
  while (t < end && peers.some(q => q.g.tick < 400)) { t += 16; hub.deliver(); for (const q of peers) q.clock.pump(t); }
  for (const q of peers) {
    assert(q.g.tick >= 400);
    for (const d of q.steps) assert(d === 1 || d === 1.05, 'drift ' + d);
    const ticks = q.rec.cmds.map(([k]) => k);
    assert.deepStrictEqual(ticks, [...ticks].sort((x, y) => x - y), '기록 틱 순서');
    netClose(q);
    const { got } = replayCk(q.rec);
    for (const [k, v] of q.sums) assert.strictEqual(got.get(k), v);
  }
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); console.log('ok  ', name); } catch (e) { fail++; console.log('FAIL', name, '\n  ', e.stack.split('\n').slice(0, 3).join('\n   ')); }
  }
  console.log(fail ? `${fail} failed` : 'all passed');
  process.exit(fail ? 1 : 0);
})();
