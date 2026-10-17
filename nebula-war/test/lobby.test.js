// node nebula-war/test/lobby.test.js
const assert = require('assert');
const D = require('../data.js');
const S = require('../sim.js');
const RP = require('../replay.js');
const NET = require('../net.js');
const AI = require('../ai.js');
const LB = require('../lobby.js');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let fail = 0;

const V = RP.version(S, D);
const RACES = Object.keys(D.races);
const rngFrom = s => { const r = { s }; return () => S.mulberry32(r) / 4294967296; };

// 방장 1 + 참가자 여럿. 가상 시간(10ms 단위), loopback 지연·흔들림.
function room({ map = 'expanse', latency = 20, jitter = 15, seed = 5 } = {}) {
  let t = 0;
  const now = () => t;
  const hub = NET.loopback({ now, latency, jitter, seed });
  const htr = hub.endpoint('host');
  const hev = [];
  const H = LB.host({ tr: htr, me: { name: '방장' }, maps: D.maps, map, version: V, now, rng: rngFrom(9), races: RACES, onChange: (s, e) => hev.push(e) });
  const run = (ms = 300) => { const end = t + ms; while (t < end) { t += 10; hub.deliver(); } };
  const joiner = (id, name, o = {}) => {
    const tr = hub.endpoint(id), log = { ch: [], deny: [], start: [] };
    const L = LB.join({ tr, hostId: 'host', name, version: V, now, maps: D.maps, races: RACES,
      onChange: (s, e) => log.ch.push(e), onDeny: r => log.deny.push(r), onStart: s => log.start.push(s), ...o });
    return { id, tr, L, log };
  };
  return { hub, htr, H, hev, run, joiner, now };
}
const seatsOf = st => JSON.stringify(st.seats);
const req = (j, op, value) => j.tr.send('host', { t: 'L.req', op, value });

test('참가·자리 배정: 참가 순서대로 빈 자리, 모두 같은 rev·seats', () => {
  const R = room();
  const B = R.joiner('B', '브라보'); R.run(); const C = R.joiner('C', '찰리'); R.run();
  const st = R.H.state();
  assert.strictEqual(st.t, 'L.state');
  assert.deepStrictEqual(st.seats.map(s => s.kind), ['human', 'human', 'human', 'open']);
  assert.deepStrictEqual(st.seats.map(s => s.peer || null), ['host', 'B', 'C', null]);
  assert.deepStrictEqual(st.seats.map(s => s.name).slice(0, 3), ['방장', '브라보', '찰리']);
  for (const j of [B, C]) { assert.strictEqual(j.L.state().rev, st.rev); assert.strictEqual(seatsOf(j.L.state()), seatsOf(st)); }
  assert(R.hev.some(e => e.type === 'peer-join'));
  const D2 = R.joiner('D', '델타'); R.run();
  const E = R.joiner('E', '에코'); R.run();
  assert.deepStrictEqual(E.log.deny, ['full']);
  assert.strictEqual(R.H.state().seats[3].peer, 'D');
  assert.strictEqual(D2.log.deny.length, 0);
});

test('버전 다름 → L.deny{version}, 방 상태 불변', () => {
  const R = room();
  const rev = R.H.state().rev, before = seatsOf(R.H.state());
  const B = R.joiner('B', '브라보', { version: 'deadbeef' }); R.run();
  assert.deepStrictEqual(B.log.deny, ['version']);
  assert.strictEqual(R.H.state().rev, rev);
  assert.strictEqual(seatsOf(R.H.state()), before);
});

test('권한·형식: 남의 자리·맵·모르는 op·프로토타입 키·범위 밖·긴 이름·8KiB 초과 → 무시', () => {
  const R = room();
  const B = R.joiner('B', '브라보'); R.run();
  const rev = R.H.state().rev, before = seatsOf(R.H.state());
  const bad = [
    { t: 'L.req', op: 'race', value: 'swarm', seat: 0 },           // 남의 자리 지정
    { t: 'L.req', op: 'team', value: 3, seat: 0 },
    { t: 'L.req', op: 'map', value: 'ring' },                      // 방장 전용
    { t: 'L.req', op: 'kick', value: 0 },
    { t: 'L.req', op: 'nope', value: 1 },
    { t: 'L.req', op: '__proto__', value: { ready: true } },
    { t: 'L.req', op: 'constructor', value: 'x' },
    JSON.parse('{"t":"L.req","op":"race","value":"swarm","__proto__":{"x":1}}'),
    { t: 'L.req', op: 'team', value: 4 }, { t: 'L.req', op: 'team', value: -1 }, { t: 'L.req', op: 'team', value: 1.5 },
    { t: 'L.req', op: 'color', value: 7 }, { t: 'L.req', op: 'race', value: 'zerg' }, { t: 'L.req', op: 'race', value: 'toString' },
    { t: 'L.req', op: 'ready', value: 'yes' },
    { t: 'L.req', op: 'name', value: 'x'.repeat(300) },
    { t: 'L.req', op: 'name', value: 'y'.repeat(9000) },
    { t: 'L.req', op: 'links', value: 'B' },
    { t: 'L.state', rev: 999, map: 'ring', seats: [] },              // 참가자가 방장 흉내
    { t: 'L.start', rev: 1, seed: 1, map: 'ring', players: [], peers: [] },
    null, 'L.req', [1, 2], { t: 5 },
  ];
  for (const m of bad) B.tr.send('host', m);
  R.run();
  assert.strictEqual(R.H.state().rev, rev, 'rev 불변');
  assert.strictEqual(seatsOf(R.H.state()), before, 'seats 불변');
  assert.strictEqual(R.H.state().map, 'expanse');
  assert.strictEqual({}.x, undefined);
  // 정상 요청은 자기 자리에만
  req(B, 'race', 'swarm'); req(B, 'team', 2); R.run();
  const s = R.H.state().seats;
  assert.strictEqual(s[1].race, 'swarm'); assert.strictEqual(s[1].team, 2);
  assert.strictEqual(s[0].race, JSON.parse(before)[0].race);
});

test('check: 형식 검사기 — 키 화이트리스트, 이름 정리', () => {
  assert.strictEqual(LB.check({ t: 'L.req', op: 'race', value: 'swarm', x: 1 }), null);
  assert.strictEqual(LB.check({ t: 'L.req', op: 'hack', value: 1 }), null);
  assert.strictEqual(LB.check({ t: 'L.deny', reason: 'boom' }), null);
  assert.deepStrictEqual(LB.check({ t: 'L.deny', reason: 'full' }), { t: 'L.deny', reason: 'full' });
  assert.strictEqual(LB.check({ t: 'L.join', v: V, name: 'z'.repeat(300) }), null);
  assert.strictEqual(LB.check({ t: 'L.join', v: V, name: 'abc', extra: 1 }), null);
  assert.strictEqual(LB.check({ t: 'hello' }), null);
  assert.strictEqual(LB.clean('a\u0000b‮c⁦d\u0007e  '), 'abcde');
  assert.strictEqual(LB.clean('가나다라마바사아자차카타파하가나다라'), '가나다라마바사아자차카타파하가나');
});

test('이름: 제어·양방향 문자 제거, 16자 자름, 빈 이름 P#', () => {
  const R = room();
  const B = R.joiner('B', '‮evil\u0007name-that-is-way-too-long'); R.run();
  const C = R.joiner('C', ' ⁦\u0001 '); R.run();
  const s = R.H.state().seats;
  assert.strictEqual(s[1].name, 'evilname-that-is');
  assert.strictEqual(s[2].name, 'P3');
  req(B, 'name', '‏안녕⁩'); R.run();
  assert.strictEqual(R.H.state().seats[1].name, '안녕');
  assert.strictEqual(C.L.state().seats[1].name, '안녕');
});

test('ready: 맵·자리 구성 변경 시 해제, 메시 완성 전 개시 불가(사유)', () => {
  const R = room();
  const B = R.joiner('B', 'B'); R.run(); const C = R.joiner('C', 'C'); R.run();
  assert.strictEqual(R.H.canStart().ok, false);
  B.L.req('ready', true); C.L.req('ready', true); R.run();
  assert.strictEqual(R.H.state().seats[0].ready, true, '방장은 항상 ready');
  assert.strictEqual(R.H.canStart().ok, true, R.H.canStart().why);
  R.H.setMap('ring'); R.run();
  assert.deepStrictEqual(R.H.state().seats.slice(1, 3).map(s => s.ready), [false, false]);
  assert.deepStrictEqual(C.L.state().seats.slice(1, 3).map(s => s.ready), [false, false]);
  assert.strictEqual(C.L.state().map, 'ring');
  assert.strictEqual(R.H.canStart().ok, false);
  assert(/준비/.test(R.H.canStart().why), R.H.canStart().why);
  B.L.req('ready', true); C.L.req('ready', true); R.run();
  assert.strictEqual(R.H.canStart().ok, true);
  R.H.setSeat(3, { kind: 'ai', level: 'hard' }); R.run();
  assert.deepStrictEqual(R.H.state().seats.slice(1, 3).map(s => s.ready), [false, false]);
  assert.strictEqual(R.H.state().seats[3].level, 'hard');
  // 메시: B–C 끊김 → 전원 준비여도 '연결 맞추는 중…'
  R.hub.cut('B', 'C');
  B.L.req('ready', true); C.L.req('ready', true); R.run();
  const cs = R.H.canStart();
  assert.strictEqual(cs.ok, false); assert(/연결 맞추는 중/.test(cs.why), cs.why);
  R.hub.heal('B', 'C'); R.H.setMine({ name: '방장2' }); R.run(); // 방장 메시지마다 참가자가 연결 목록을 다시 본다
  assert.strictEqual(R.H.canStart().ok, true, R.H.canStart().why);
  // 팀 규칙(index.html 과 공유): 모두 같은 팀이면 불가
  for (const j of [B, C]) j.L.req('team', 0);
  R.H.setMine({ team: 0 }); R.H.setSeat(3, { kind: 'closed' }); R.run();
  for (const j of [B, C]) j.L.req('ready', true);
  R.run();
  assert.strictEqual(R.H.canStart().ok, false); assert(/팀/.test(R.H.canStart().why));
});

test('방장 setSeat: AI 자리 종족·팀·색 지정(색 맞바꿈, 사람 준비 해제), 잘못된 값·AI 아닌 자리는 거부', () => {
  const R = room();
  const B = R.joiner('B', 'B'); R.run();
  B.L.req('ready', true); R.run();
  const c0 = R.H.state().seats.map(s => s.color);
  assert.strictEqual(R.H.setSeat(2, { kind: 'ai', level: 'hard', race: 'swarm', team: 0, color: c0[1] }), true); R.run();
  const st = R.H.state();
  assert.deepStrictEqual([st.seats[2].kind, st.seats[2].race, st.seats[2].team, st.seats[2].color, st.seats[2].level], ['ai', 'swarm', 0, c0[1], 'hard']);
  assert.strictEqual(st.seats[1].color, c0[2], '색 맞바꿈');
  assert.strictEqual(new Set(st.seats.map(s => s.color)).size, st.seats.length);
  assert.strictEqual(st.seats[1].ready, false, '사람 준비 해제');
  assert.strictEqual(seatsOf(B.L.state()), seatsOf(st));
  assert.strictEqual(R.H.setSeat(2, { kind: 'ai', race: 'random' }), true);
  assert.strictEqual(R.H.state().seats[2].race, 'random');
  const rev = R.H.state().rev;
  for (const o of [{ kind: 'ai', race: 'zerg' }, { kind: 'ai', race: '__proto__' }, { kind: 'ai', team: 4 }, { kind: 'ai', team: -1 }, { kind: 'ai', color: 1.5 },
    { kind: 'closed', race: 'swarm' }, { kind: 'open', team: 1 }]) assert.strictEqual(R.H.setSeat(2, o), false, JSON.stringify(o));
  assert.strictEqual(R.H.setSeat(1, { kind: 'ai', race: 'swarm' }), false, '사람 자리');
  assert.strictEqual(R.H.state().rev, rev);
});

test('참가자 팀·종족 변경 → 다른 참가자 준비 해제, canStart 는 사람 참가자 1명 이상 필요', () => {
  const R = room();
  R.H.setSeat(1, { kind: 'ai', team: 1 });
  const nobody = R.H.canStart();
  assert.strictEqual(nobody.ok, false); assert.strictEqual(nobody.why, '참가자를 기다리는 중');
  R.H.setSeat(1, { kind: 'open' });
  const B = R.joiner('B', 'B'); R.run(); const C = R.joiner('C', 'C'); R.run();
  B.L.req('ready', true); C.L.req('ready', true); R.run();
  assert.strictEqual(R.H.canStart().ok, true, R.H.canStart().why);
  B.L.req('team', 3); R.run();
  assert.deepStrictEqual(R.H.state().seats.slice(1, 3).map(s => s.ready), [true, false]);
  C.L.req('ready', true); R.run();
  C.L.req('race', 'random'); R.run();
  assert.deepStrictEqual(R.H.state().seats.slice(1, 3).map(s => s.ready), [false, true]);
});

test('clean: 폭 없는 공백·BOM 제거, ZWJ 유지(netui 와 같은 집합)', () => {
  assert.strictEqual(LB.clean('a​b⁠c﻿d‌e'), 'abcde');
  assert.strictEqual(LB.clean('a‮b⁦c؜d'), 'abcd');
  assert.strictEqual(LB.clean('\u{1F468}‍\u{1F469}', 64), '\u{1F468}‍\u{1F469}');
});

test('lobbyState: index.html 과 같은 규칙(닫힌·빈 자리 제외)', () => {
  assert.strictEqual(LB.lobbyState([{ kind: 'me', team: 0 }, { kind: 'ai', team: 1 }]).ok, true);
  assert.strictEqual(LB.lobbyState([{ kind: 'me', team: 0 }, { kind: 'closed', team: 1 }]).why, '열린 자리가 둘 이상 있어야 합니다');
  assert(/팀이 하나뿐/.test(LB.lobbyState([{ kind: 'me', team: 0 }, { kind: 'idle', team: 0 }]).why));
  assert.strictEqual(LB.lobbyState([{ kind: 'human', team: 0 }, { kind: 'open', team: 1 }]).ok, false);
  const four = LB.lobbyState([{ kind: 'me', team: 0 }, { kind: 'ai', team: 0 }, { kind: 'ai', team: 1 }, { kind: 'ai', team: 1 }]);
  assert.deepStrictEqual([four.mu, four.sub], ['2 대 2', '팀전 · 4인']);
  const ffa = LB.lobbyState([{ kind: 'me', team: 0 }, { kind: 'ai', team: 1 }, { kind: 'ai', team: 2 }]);
  assert.deepStrictEqual([ffa.mu, ffa.sub], ['개인전', '3인 · 각자']);
});

test('레이트 제한: 1초 L.req 50개 → 20개만, 채팅 3초 5개, 폭주는 내보냄', () => {
  const R = room();
  const B = R.joiner('B', 'B'); const C = R.joiner('C', 'C'); R.run(1200);
  const rev = R.H.state().rev;
  for (let k = 0; k < 50; k++) req(B, 'name', 'n' + k);
  R.run(200);
  assert.strictEqual(R.H.state().rev - rev, 20);
  assert(/^n\d+$/.test(R.H.state().seats[1].name));
  R.run(1500);
  const chats = () => R.hev.filter(e => e.type === 'chat' && e.from === 1).length;
  for (let k = 0; k < 10; k++) req(B, 'chat', 'hi' + k);
  R.run(200);
  assert.strictEqual(chats(), 5);
  assert.strictEqual(C.log.ch.filter(e => e.type === 'chat').length, 5, '방장이 중계');
  R.run(3200);
  req(B, 'chat', 'again'); R.run(200);
  assert.strictEqual(chats(), 6);
  // 보내는 쪽도 3초 5개
  const ok = []; for (let k = 0; k < 6; k++) ok.push(C.L.chat('c' + k));
  assert.deepStrictEqual(ok, [true, true, true, true, true, false]);
  // 초당 100개 넘게 → 내보내기
  for (let k = 0; k < 150; k++) req(B, 'ready', k % 2 === 0);
  R.run(300);
  assert.deepStrictEqual(B.log.deny, ['kicked']);
  assert.strictEqual(R.H.state().seats[1].kind, 'open');
  assert(R.hev.some(e => e.type === 'peer-left' && e.seat === 1));
});

test('내보내기·나감: 자리 열림, 내보낸 피어는 다시 못 들어옴', () => {
  const R = room();
  const B = R.joiner('B', 'B'); const C = R.joiner('C', 'C'); R.run();
  R.H.kick(1); R.run();
  assert.deepStrictEqual(B.log.deny, ['kicked']);
  assert.strictEqual(R.H.state().seats[1].kind, 'open');
  assert.strictEqual(C.L.state().seats[1].kind, 'open');
  const B2 = R.joiner('B', 'B'); R.run(); // 같은 id 로 다시
  assert.deepStrictEqual(B2.log.deny, ['kicked']);
  R.hub.disconnect('C'); R.run();
  assert.strictEqual(R.H.state().seats[2].kind, 'open');
  assert(R.hev.some(e => e.type === 'peer-left' && e.seat === 2));
});

test('참가자: 깨진 L.state → 방을 나간다', () => {
  const R = room();
  const B = R.joiner('B', 'B'); R.run();
  R.htr.send('B', { t: 'L.state', rev: 99, map: 'expanse', seats: [{ kind: 'human', name: 'x', race: 'zerg', team: 9, color: 0, ready: true }] });
  R.run();
  assert.deepStrictEqual(B.log.deny, ['bad']);
  assert(!R.htr.peers().includes('B'), '연결 닫힘');
});

// 3인(방장·B·C) + AI 1 개시
function started({ latency = 20, jitter = 15 } = {}) {
  const R = room({ latency, jitter });
  const B = R.joiner('B', 'B'); R.run(); const C = R.joiner('C', 'C'); R.run();
  R.H.setSeat(3, { kind: 'ai', level: 'easy' }); R.run();
  B.L.req('ready', true); C.L.req('ready', true); R.run(500);
  assert.strictEqual(R.H.canStart().ok, true, R.H.canStart().why);
  const st = R.H.start();
  assert(st && st.t === 'L.start');
  R.run(500);
  return { R, B, C, st };
}

test('개시: 모든 피어 toGame 같은 meta·peers, 다른 self, AI 자리 peers=null', () => {
  const { R, B, C, st } = started();
  assert.strictEqual(R.H.start(), null, '두 번 개시 안 됨');
  assert.strictEqual(B.log.start.length, 1); assert.strictEqual(C.log.start.length, 1);
  const gs = [LB.toGame(st, 'host'), LB.toGame(B.log.start[0], 'B'), LB.toGame(C.log.start[0], 'C')];
  for (const g of gs.slice(1)) { assert.deepStrictEqual(g.meta, gs[0].meta); assert.deepStrictEqual(g.peers, gs[0].peers); }
  assert.deepStrictEqual(gs.map(g => g.self), [0, 1, 2]);
  assert.deepStrictEqual(gs[0].peers, ['host', 'B', 'C', null]);
  assert.deepStrictEqual(gs[0].meta.players[3].ai, { level: 'easy' });
  assert(gs[0].meta.players.slice(0, 3).every(q => !q.ai));
  assert(gs[0].meta.players.every(q => RACES.includes(q.race)));
  assert.strictEqual(new Set(gs[0].meta.players.map(q => q.slot)).size, 4);
  assert(Number.isInteger(gs[0].meta.seed));
  S.createGame(gs[0].meta); // sim 이 받는 명단
  assert(RP.decode(RP.encode(RP.create(gs[0].meta, V)), V, D).ok, 'replay 명단 검사 통과');
});

test('개시 검사: 잘린 players·자기 id 없음·rev 어긋남·맵 없음·종족 이상 → onStart 안 불림', () => {
  const R = room({ jitter: 0 });
  const B = R.joiner('B', 'B'); R.run();
  R.H.setSeat(2, { kind: 'ai' }); R.run();
  const rev = B.L.state().rev;
  const players = [0, 1, 2].map(i => ({ race: RACES[i], team: i, slot: i, color: i, name: 'P' + (i + 1), ...(i === 2 ? { ai: { level: 'normal' } } : {}) }));
  const good = { t: 'L.start', rev, seed: 42, map: 'expanse', players, peers: ['host', 'B', null] };
  const bads = [
    { ...good, players: players.slice(0, 2) },
    { ...good, peers: ['host', 'X', null] },
    { ...good, peers: ['host', 'B', 'B'] },
    { ...good, rev: rev - 1 },
    { ...good, map: 'atlantis' },
    { ...good, players: players.map((q, i) => (i === 1 ? { ...q, race: 'random' } : q)) },
    { ...good, players: players.map((q, i) => (i === 1 ? { ...q, slot: 0 } : q)) },
    { ...good, seed: 1.5 },
  ];
  for (const m of bads) R.htr.send('B', m);
  R.run();
  assert.strictEqual(B.log.start.length, 0);
  R.htr.send('B', good); R.run();
  assert.strictEqual(B.log.start.length, 1, '정상 L.start 는 통과');
  assert.deepStrictEqual(LB.toGame(B.log.start[0], 'B').self, 1);
});

test('잠금: 개시 뒤 새 연결은 L.deny{locked} 후 닫힘', () => {
  const { R } = started();
  const late = R.joiner('late', '늦게'); R.run();
  assert.deepStrictEqual(late.log.deny, ['locked']);
  assert(!R.htr.peers().includes('late'));
});

// 사람 흉내(net.test.js 와 같은 방식, 단순화)
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

test('로비 → 세션 통합: 사람 2 + AI 1, 600틱 체크섬 일치 + 기록 단독 재생 일치', () => {
  let t = 0;
  const now = () => t, hub = NET.loopback({ now, latency: 20, jitter: 15, seed: 11 });
  const htr = hub.endpoint('host'), btr = hub.endpoint('B');
  let bStart = null;
  const H = LB.host({ tr: htr, me: { name: 'A' }, maps: D.maps, map: 'crossing', version: V, now, rng: rngFrom(3), races: RACES });
  const B = LB.join({ tr: btr, hostId: 'host', name: 'B', version: V, now, maps: D.maps, races: RACES, onStart: s => { bStart = s; } });
  const run = ms => { const end = t + ms; while (t < end) { t += 10; hub.deliver(); } };
  run(200);
  // crossing 은 2인 맵 → AI 자리를 쓰려면 4인 맵
  H.setMap('expanse'); H.setSeat(2, { kind: 'ai', level: 'normal' }); H.setSeat(3, { kind: 'closed' }); run(200);
  B.req('ready', true); run(200);
  assert.strictEqual(H.canStart().ok, true, H.canStart().why);
  const st = H.start();
  const peers = [];
  const mk = (start, tr, lobby, i) => {
    const G = LB.toGame(start, tr.id), g = S.createGame(G.meta), rec = RP.create(G.meta, V), ais = AI.fromRoster(g, rec.players, rec.seed);
    lobby.detach();
    const ev = [], sums = new Map();
    const sess = NET.session({ sim: S, game: g, self: G.self, peers: G.peers, transport: tr, now, version: V, rec, extra: gg => AI.collect(gg, ais, []), stepMs: 50, onEvent: e => ev.push(e) });
    peers[i] = { g, sess, rec, ev, sums, r: { s: 100 + i }, self: G.self };
  };
  mk(st, htr, H, 0);   // 방장은 바로 세션 — B 의 로비 처리기가 hello 를 먼저 받는다
  run(60);            // L.start 와 방장 세션의 hello 가 B 의 로비 처리기로 — hello 는 조용히 버려야 한다
  assert(bStart, 'B 가 L.start 받음');
  mk(bStart, btr, B, 1);
  while (t < 120000 && peers.some(q => q.g.tick < 600)) {
    for (const q of peers) {
      if (q.g.tick >= 600) continue;
      if (q.sess.ready()) for (const c of human(q.g, q.self, q.r)) q.sess.queue(c);
      if (q.sess.tick()) q.sums.set(q.g.tick, S.checksum(q.g));
    }
    t += 50; hub.deliver();
  }
  for (const q of peers) { assert.strictEqual(q.g.tick, 600); assert(!q.ev.some(e => e.type === 'desync' || e.type === 'error' || e.type === 'mismatch'), JSON.stringify(q.ev)); }
  assert.deepStrictEqual([...peers[1].sums], [...peers[0].sums]);
  assert(peers[0].rec.cmds.some(([, c]) => c.player === 2), 'AI 명령이 기록됨');
  assert(peers[0].rec.cmds.some(([, c]) => c.player === 1), 'B 명령이 기록됨');
  for (const q of peers) {
    const back = RP.decode(RP.encode(q.rec), V, D);
    assert(back.ok, 'rec 왕복');
    const pl = RP.player(back.rec, S), got = new Map();
    RP.runToSync(pl, 600, g => got.set(g.tick, S.checksum(g)));
    assert.deepStrictEqual([...got], [...peers[0].sums], '단독 재생 체크섬');
  }
});

test('세션 넘김 뒤 로비 처리기에 세션 메시지가 와도 예외 없음', () => {
  const R = room({ jitter: 0 });
  const B = R.joiner('B', 'B'); R.run();
  for (const m of [{ t: 'hello', v: V }, { t: 'cmd', turn: 3, cmds: [] }, { t: 'hb' }, { t: 'ck', tick: 20, ck: 1 }]) { R.htr.send('B', m); B.tr.send('host', m); }
  R.run();
  assert.strictEqual(B.log.deny.length, 0);
  assert.strictEqual(R.H.state().seats[1].peer, 'B');
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); console.log('ok  ', name); } catch (e) { fail++; console.log('FAIL', name, '\n  ', e.stack.split('\n').slice(0, 3).join('\n   ')); }
  }
  console.log(fail ? `${fail} failed` : 'all passed');
  process.exit(fail ? 1 : 0);
})();
