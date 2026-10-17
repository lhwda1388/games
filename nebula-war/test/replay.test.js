// node nebula-war/test/replay.test.js
const assert = require('assert');
const D = require('../data.js');
const S = require('../sim.js');
const RP = require('../replay.js');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let fail = 0;

const V = RP.version(S, D);

// 결정론 명령 스크립트: 상태를 읽고(UI처럼) 명령을 만든다. 같은 rng 시드 → 같은 스트림.
function script(g, r) {
  const rnd = n => S.mulberry32(r) % n, cmds = [], TF = S.TFP;
  for (let p = 0; p < 2; p++) {
    const own = g.ents.filter(e => e.owner === p);
    const units = own.filter(e => !e.isB), base = own.find(e => e.isB), wk = units.filter(e => e.def.worker);
    const race = D.races[g.players[p].race];
    if (g.tick === 5) { // 일꾼 전원 채집
      const crys = g.ents.filter(e => e.type === 'crystal').sort((a, b) => ((a.x - base.x) ** 2 + (a.y - base.y) ** 2) - ((b.x - base.x) ** 2 + (b.y - base.y) ** 2));
      wk.forEach((w, i) => cmds.push({ type: 'gather', ids: [w.id], target: crys[i % 4].id, player: p }));
    }
    if (base && g.tick % 60 === 7 + p) cmds.push({ type: 'train', ids: [base.id], what: race.worker, player: p });
    if (g.tick > 200 && rnd(9) === 0 && units.length) { // 무작위 이동·공격 이동(일꾼 아닌 것 + 가끔 일꾼)
      const pool = units.filter(e => !e.def.worker || rnd(5) === 0);
      if (pool.length) {
        const ids = pool.slice(0, 1 + rnd(pool.length)).map(e => e.id);
        cmds.push({ type: rnd(2) ? 'move' : 'attackMove', ids, x: (20 + rnd(88)) * TF + rnd(TF), y: (20 + rnd(88)) * TF, player: p });
      }
    }
    if (g.tick === 400 + p && wk.length) cmds.push({ type: 'stop', ids: [wk[wk.length - 1].id], player: p });
    if (g.tick === 600 && wk.length) cmds.push({ type: 'gather', ids: wk.map(e => e.id), target: g.ents.find(e => e.type === 'crystal').id, player: p });
  }
  return cmds;
}

// 원 게임: 기록 + 매 틱 체크섬
function playOriginal(ticks, seed = 12345, races = ['legion', 'swarm'], map = 'crossing') {
  const g = S.createGame({ seed, races, map }), rec = RP.create({ seed, map, races }, V), r = { s: 99 }, sums = [], st = RP.stats(g);
  for (let i = 0; i < ticks; i++) {
    const cmds = script(g, r);
    RP.record(rec, g.tick, cmds);
    const ev = S.step(g, cmds);
    st.tick(g, ev);
    sums.push(S.checksum(g));
  }
  rec.ticks = g.tick;
  return { g, rec, sums, st };
}

test('record → replay: 1000틱 매 틱 체크섬 동일', () => {
  const o = playOriginal(1000);
  assert(o.rec.cmds.length > 30, 'enough commands recorded: ' + o.rec.cmds.length);
  assert(o.rec.cmds.every(([t]) => t >= 0 && t < 1000));
  const pl = RP.player(o.rec, S);
  for (let i = 0; i < 1000; i++) { pl.step(); assert.strictEqual(S.checksum(pl.state), o.sums[i], 'tick ' + i); }
  assert.strictEqual(pl.state.tick, 1000);
  assert(pl.done);
});

test('명령만 있는 틱만 기록, 기록은 원본 명령의 복사본', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'] }), rec = RP.create({ seed: 1, map: 'crossing', races: ['legion', 'legion'] }, V);
  RP.record(rec, 0, []);
  const c = { type: 'stop', ids: [5], player: 0 };
  RP.record(rec, 1, [c]);
  c.ids.push(6);
  assert.deepStrictEqual(rec.cmds, [[1, { type: 'stop', ids: [5], player: 0 }]]);
  void g;
});

test('encode → decode 왕복 동일 + 왕복 후 재생도 매 틱 체크섬 동일', () => {
  const o = playOriginal(1000, 777, ['elysian', 'legion'], 'crossing');
  o.rec.ck = S.checksum(o.g);
  const txt = RP.encode(o.rec);
  assert.strictEqual(typeof txt, 'string');
  const d = RP.decode(txt, V);
  assert(d.ok, d.err);
  assert.deepStrictEqual(d.rec, o.rec);
  assert(txt.length < JSON.stringify(o.rec).length, 'encoded is smaller than plain JSON');
  const pl = RP.player(d.rec, S);
  for (let i = 0; i < 1000; i++) { pl.step(); assert.strictEqual(S.checksum(pl.state), o.sums[i], 'tick ' + i); }
  assert.strictEqual(S.checksum(pl.state), d.rec.ck);
});

test('버전 불일치·깨진 파일은 거부', () => {
  const o = playOriginal(50);
  const txt = RP.encode(o.rec);
  const bad = RP.decode(txt, V + 'x');
  assert.strictEqual(bad.ok, false); assert.strictEqual(bad.err, 'version');
  assert.strictEqual(RP.decode('{not json', V).err, 'parse');
  assert.strictEqual(RP.decode('{"v":"' + V + '"}', V).err, 'shape');
  assert.strictEqual(RP.decode(JSON.stringify({ v: V, seed: 1, map: 'nope', races: ['legion', 'swarm'], ticks: 0, k: [], c: [] }), V).err, 'shape');
  assert.strictEqual(RP.decode('null', V).err, 'shape');
});

test('VERSION: data·sim 함수가 바뀌면 달라진다', () => {
  assert.strictEqual(RP.version(S, D), V, 'stable');
  const D2 = JSON.parse(JSON.stringify(D)); D2.units.trooper.hp += 1;
  assert.notStrictEqual(RP.version(S, D2), V);
  const S2 = Object.assign({}, S, { step: function step(g, c) { return S.step(g, c); } });
  assert.notStrictEqual(RP.version(S2, D), V);
  assert(/^[0-9a-f]{8}$/.test(V), V);
});

test('VERSION: 내부 함수 본문만 달라도(SRC) 달라진다, 두 번 호출해도 안정', () => {
  assert.strictEqual(typeof S.SRC, 'function');
  const mk = body => ({ FP: 1, SRC: new Function('return function nwSim(){ function inner(){ return ' + body + '; } return { inner }; }')() });
  const A = mk(1), B = mk(2);
  assert.strictEqual(RP.version(A, D), RP.version(A, D), 'stable');
  assert.notStrictEqual(RP.version(A, D), RP.version(B, D));
});

test('NET_VERSION: VERSION + AI 소스 — AI 함수가 다르면 달라지고, VERSION 은 그대로', () => {
  const AI = require('../ai.js'), AIC = require('../ai-cast.js');
  assert.strictEqual(typeof AI.SRC, 'function'); assert.strictEqual(typeof AIC.SRC, 'function');
  const n = RP.netVersion(V, AI.SRC, AIC.SRC);
  assert(/^[0-9a-f]{8}$/.test(n), n);
  assert.strictEqual(RP.netVersion(V, AI.SRC, AIC.SRC), n, 'stable');
  assert.notStrictEqual(n, V);
  assert.notStrictEqual(RP.netVersion(V, function nwAI() { return 1; }, AIC.SRC), n);
  assert.notStrictEqual(RP.netVersion(V, AI.SRC, function nwAICast() { return 1; }), n);
  assert.strictEqual(RP.netVersion(null, AI.SRC, AIC.SRC), null);
  assert.strictEqual(RP.version(S, D), V, 'replay VERSION 은 AI 와 무관');
});

test('player: seek 앞/뒤(처음부터 재시뮬) 후 체크섬 동일', async () => {
  const o = playOriginal(600);
  const pl = RP.player(o.rec, S);
  RP.runToSync(pl, 400);
  assert.strictEqual(S.checksum(pl.state), o.sums[399]);
  RP.runToSync(pl, 150); // 뒤로 = reset + 재시뮬
  assert.strictEqual(pl.state.tick, 150);
  assert.strictEqual(S.checksum(pl.state), o.sums[149]);
  RP.runToSync(pl, 99999); // 끝 넘어가면 끝에서 멈춤
  assert.strictEqual(pl.state.tick, 600);
});

test('runTo(비동기): 진행률 콜백 0→1, onTick 매 틱, 결과 체크섬 동일', async () => {
  const o = playOriginal(800);
  const pl = RP.player(o.rec, S), prog = [];
  let n = 0;
  await RP.runTo(pl, 800, { chunkMs: 2, onProgress: f => prog.push(f), onTick: () => n++ });
  assert.strictEqual(n, 800);
  assert.strictEqual(S.checksum(pl.state), o.sums[799]);
  assert(prog.length >= 2 && prog[prog.length - 1] === 1);
  for (let i = 1; i < prog.length; i++) assert(prog[i] >= prog[i - 1]);
  // 취소
  const pl2 = RP.player(o.rec, S), job = RP.runTo(pl2, 800, { chunkMs: 1 });
  job.cancel();
  const r = await job;
  assert.strictEqual(r, false); assert(pl2.state.tick < 800);
});

test('stats: 수집 자원·생산·처치/손실·5초 표본', () => {
  const o = playOriginal(1000), s = o.st.data;
  assert(s.players[0].crystal > 0 && s.players[1].crystal > 0, 'collected crystal');
  const g0 = S.createGame({ seed: 12345, races: ['legion', 'swarm'], map: 'crossing' });
  for (let p = 0; p < 2; p++) { // 생산 = 지금 유닛 수 - 시작 유닛 수 + 손실(유닛)
    const units = g => g.ents.filter(e => e.owner === p && !e.isB && !e.parent).length;
    assert(s.players[p].produced >= 1, 'produced ' + p);
    assert.strictEqual(s.players[p].produced, units(o.g) - units(g0) + s.players[p].losses, 'produced count ' + p);
  }
  assert.strictEqual(s.samples.length, 11); // tick 0,100,…,1000
  assert.deepStrictEqual(s.samples[0], [0, 0, 0, 0, 0]);
  const last = s.samples[s.samples.length - 1];
  assert.deepStrictEqual(last, [1000, s.players[0].crystal, s.players[0].nebula, s.players[1].crystal, s.players[1].nebula]);
  for (let i = 1; i < s.samples.length; i++) for (let k = 1; k < 5; k++) assert(s.samples[i][k] >= s.samples[i - 1][k], 'cumulative');
  // 처치/손실: 한쪽 유닛을 죽이면 손실 +1, 상대 처치 +1
  const g = S.createGame({ seed: 3, races: ['legion', 'swarm'] }), st = RP.stats(g);
  const victim = g.ents.find(e => e.owner === 1 && !e.isB);
  victim.hp = 0; victim.lastBy = 0; // 처치 = lastBy(by) 기준
  st.tick(g, S.step(g, []));
  assert.strictEqual(st.data.players[1].losses, 1); assert.strictEqual(st.data.players[0].kills, 1);
  // 3인 개인전: 2번이 1번을 처치하면 kills 는 2번만
  S.D.maps.__r3 = { name: 'r', desc: '', rocks: [], starts: [{ tx: 10, ty: 10 }, { tx: 114, ty: 114 }, { tx: 114, ty: 10, flip: 1 }], expansions: [] };
  try {
    const g3 = S.createGame({ seed: 3, map: '__r3', players: [0, 1, 2].map(i => ({ race: ['legion', 'swarm', 'elysian'][i], team: i, slot: i, color: i })) }), st3 = RP.stats(g3);
    const v3 = g3.ents.find(e => e.owner === 1 && !e.isB && !e.parent); v3.hp = 0; v3.lastBy = 2;
    st3.tick(g3, S.step(g3, []));
    assert.strictEqual(st3.data.players[1].losses, 1); assert.strictEqual(st3.data.players[2].kills, 1); assert.strictEqual(st3.data.players[0].kills, 0);
  } finally { delete S.D.maps.__r3; }
  // 재생으로 다시 모은 통계도 같다
  const pl = RP.player(o.rec, S), st2 = RP.stats(pl.state);
  RP.runToSync(pl, 1000, (g2, ev) => st2.tick(g2, ev));
  assert.deepStrictEqual(st2.data, s);
});

test('resume 저장소: 저장·복원, 버전 불일치·파싱 실패는 조용히 삭제, 저장소 오류는 null', () => {
  const mem = new Map(), store = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: k => mem.delete(k) };
  const o = playOriginal(300);
  o.rec.ck = S.checksum(o.g);
  assert.strictEqual(RP.saveResume(() => store, o.rec), true);
  assert(mem.has(RP.RESUME_KEY) && RP.RESUME_KEY === 'nw.resume');
  const back = RP.loadResume(() => store, V);
  assert.deepStrictEqual(back, o.rec);
  assert.strictEqual(RP.loadResume(() => store, V + 'z'), null);
  assert(!mem.has(RP.RESUME_KEY), 'mismatch deleted');
  mem.set(RP.RESUME_KEY, '{oops');
  assert.strictEqual(RP.loadResume(() => store, V), null);
  assert(!mem.has(RP.RESUME_KEY), 'parse failure deleted');
  mem.set(RP.RESUME_KEY, JSON.stringify({ ...JSON.parse(RP.encode(o.rec)), map: 'constructor' }));
  assert.strictEqual(RP.loadResume(() => store, V), null);
  RP.saveResume(() => store, o.rec); RP.clearResume(() => store);
  assert(!mem.has(RP.RESUME_KEY));
  const boom = () => { throw new Error('SecurityError'); };
  const thrower = { getItem: boom, setItem: boom, removeItem: boom };
  assert.strictEqual(RP.saveResume(boom, o.rec), false);
  assert.strictEqual(RP.saveResume(() => thrower, o.rec), false);
  assert.strictEqual(RP.loadResume(() => thrower, V), null);
  assert.strictEqual(RP.clearResume(() => thrower), false);
  assert.strictEqual(RP.available(() => thrower), false);
  assert.strictEqual(RP.available(() => store), true);
});

test('긴 고APM 게임 인코딩 크기(30분, 명령 9000개) < 500KB', () => {
  const rec = RP.create({ seed: 1, map: 'crossing', races: ['legion', 'swarm'] }, V), r = { s: 5 }, TF = S.TFP;
  for (let t = 0; t < 36000; t += 4) {
    const k = S.mulberry32(r) % 4, ids = []; for (let i = 0, n = 1 + S.mulberry32(r) % 12; i < n; i++) ids.push(100 + S.mulberry32(r) % 900);
    const c = k === 0 ? { type: 'move', ids, x: S.mulberry32(r) % (128 * TF), y: S.mulberry32(r) % (128 * TF) }
      : k === 1 ? { type: 'attack', ids, target: 100 + S.mulberry32(r) % 900 }
      : k === 2 ? { type: 'train', ids: [ids[0]], what: 'trooper' } : { type: 'attackMove', ids, x: S.mulberry32(r) % (128 * TF), y: S.mulberry32(r) % (128 * TF) };
    c.player = 0; RP.record(rec, t, [c]);
  }
  rec.ticks = 36000;
  const txt = RP.encode(rec);
  console.log('      (30분 9000명령 인코딩: ' + (txt.length / 1024).toFixed(1) + ' KB, 평문 JSON ' + (JSON.stringify(rec).length / 1024).toFixed(1) + ' KB)');
  assert(txt.length < 500 * 1024, txt.length);
  assert.deepStrictEqual(RP.decode(txt, V).rec, rec);
});

test('4인 리플레이: 매 틱 체크섬 일치 + 인코딩 왕복', () => {
  const players = [0, 1, 2, 3].map(i => ({ race: ['legion', 'swarm', 'elysian', 'swarm'][i], team: i % 2, slot: i, color: i }));
  const live = S.createGame({ seed: 9, map: 'fortress', players }), rec = RP.create({ seed: 9, map: 'fortress', players }, V);
  const sums = [];
  for (let t = 0; t < 600; t++) {
    const cmds = t === 10 ? [0, 1, 2, 3].map(p => ({ player: p, type: 'train', ids: [live.ents.find(e => e.owner === p && e.isB).id], what: D.races[players[p].race].worker })) : [];
    RP.record(rec, t, cmds); S.step(live, cmds); sums.push(S.checksum(live));
  }
  rec.ticks = 600; // record()는 cmds만 쌓는다 — ticks는 호출자가 갱신(index.html과 같음)
  const back = RP.decode(RP.encode(rec), V, D);
  assert(back.ok); assert.deepStrictEqual(back.rec.players, players.map((q, i) => ({ ...q, name: 'P' + (i + 1) })));
  const pl = RP.player(back.rec, S); const got = [];
  RP.runToSync(pl, 600, g => got.push(S.checksum(g)));
  assert.deepStrictEqual(got, sums);
});
test('통계: 샘플 행은 플레이어 수 × 2 + 1', () => {
  const players = [0, 1, 2].map(i => ({ race: 'legion', team: i, slot: i, color: i }));
  const g = S.createGame({ seed: 1, map: 'fortress', players }), st = RP.stats(g);
  assert.strictEqual(st.data.samples[0].length, 7); assert.strictEqual(st.data.players.length, 3);
});
test('decode: 잘못된 명단 거부, 예전 races 형식은 명단으로 변환', () => {
  const P = (q, map = 'crossing') => JSON.stringify({ v: V, seed: 1, map, players: q, ticks: 0, k: [], c: [] });
  const ok = i => ({ race: 'legion', team: i, slot: i, color: i });
  const shape = s => assert.strictEqual(RP.decode(s, V, D).err, 'shape');
  shape(P([ok(0)]));                                                  // 1명
  shape(P([ok(0), ok(1), ok(2)]));                                    // 2인 맵(시작 후보 4곳)에 3명
  shape(P([ok(0), { ...ok(1), slot: 0 }]));                           // 슬롯 중복
  shape(P([ok(0), { ...ok(1), slot: 4 }]));                           // 슬롯 범위 밖
  assert(RP.decode(P([ok(0), { ...ok(1), slot: 3 }]), V, D).ok);      // 2인 맵의 다른 시작 후보
  shape(P([ok(0), { ...ok(1), team: 4 }]));                           // 팀 범위
  shape(P([ok(0), { ...ok(1), color: -1 }]));                         // 색 범위
  shape(P([ok(0), { ...ok(1), team: 1.5 }]));                         // 정수 아님
  shape(P([ok(0), { ...ok(1), race: 'constructor' }]));               // 상속 키
  shape(P([ok(0), { ...ok(1), race: 'nope' }]));
  shape(P([ok(0), null]));
  for (const m of ['constructor', '__proto__', 'toString']) shape(P([ok(0), ok(1)], m));   // 상속 키 맵 이름
  shape(P([ok(0), { ...ok(1), team: 0 }]));                           // 팀이 하나뿐
  shape(P('x'));
  shape(P([ok(0), ok(1), ok(2), ok(3), ok(0)], 'fortress'));          // 5명
  assert(RP.decode(P([ok(0), ok(1), ok(2), ok(3)], 'fortress'), V, D).ok);
  const old = RP.decode(JSON.stringify({ v: V, seed: 1, map: 'crossing', races: ['legion', 'swarm'], ticks: 0, k: [], c: [] }), V, D);
  assert(old.ok); assert.deepStrictEqual(old.rec.players, [{ race: 'legion', team: 0, slot: 0, color: 0, name: 'P1' }, { race: 'swarm', team: 1, slot: 1, color: 1, name: 'P2' }]);
});
test('플레이어 이름: 왕복·기본값·검증', () => {
  const P = q => JSON.stringify({ v: V, seed: 1, map: 'crossing', players: q, ticks: 0, k: [], c: [] });
  const ok = (i, name) => ({ race: 'legion', team: i, slot: i, color: i, ...(name === undefined ? {} : { name }) });
  const rec = RP.create({ seed: 1, map: 'crossing', players: [ok(0, '  지휘관 '), ok(1, '<b>x</b>')] }, V);
  assert.deepStrictEqual(rec.players.map(q => q.name), ['지휘관', '<b>x</b>']);
  const back = RP.decode(RP.encode(rec), V, D);
  assert(back.ok); assert.deepStrictEqual(back.rec.players.map(q => q.name), ['지휘관', '<b>x</b>']);
  assert.deepStrictEqual(RP.decode(P([ok(0), ok(1, 'a')]), V, D).rec.players.map(q => q.name), ['P1', 'a']); // 없으면 P번호
  assert(RP.decode(P([ok(0, 'a'.repeat(16)), ok(1)]), V, D).ok);
  const shape = q => assert.strictEqual(RP.decode(P(q), V, D).err, 'shape');
  shape([ok(0, 'a'.repeat(17)), ok(1)]); shape([ok(0, 5), ok(1)]); shape([ok(0, ''), ok(1)]); shape([ok(0, '   '), ok(1)]); shape([ok(0, null), ok(1)]);
  // 이름은 sim 에 영향 없음
  const a = S.createGame({ seed: 1, map: 'crossing', players: [ok(0, 'A'), ok(1, 'B')] }), b = S.createGame({ seed: 1, map: 'crossing', players: [ok(0), ok(1)] });
  assert.strictEqual(S.checksum(a), S.checksum(b));
});

test('명단 ai: level 보존(그 외 키는 버림), 잘못된 값 거부', () => {
  const players = [{ race: 'legion', team: 0, slot: 0, color: 0, ai: { level: 'hard', pers: 'rush' } }, { race: 'swarm', team: 1, slot: 1, color: 1 }];
  const rec = RP.create({ seed: 1, map: 'crossing', players }, V);
  assert.deepStrictEqual(rec.players[0].ai, { level: 'hard' }); assert.strictEqual(rec.players[1].ai, undefined);
  rec.ticks = 1;
  assert.deepStrictEqual(RP.decode(RP.encode(rec), V, D).rec.players[0].ai, { level: 'hard' });
  for (const bad of [{ level: 'godlike' }, 5, null, 'hard']) {
    const o = JSON.parse(RP.encode(rec)); o.players[0].ai = bad;
    assert.strictEqual(RP.decode(JSON.stringify(o), V, D).err, 'shape', JSON.stringify(bad));
  }
});
// 3a: 같은 준비(setup3a)를 라이브·재생 양쪽 상태에 적용한 뒤 3a 명령만 기록 → 왕복 → 매 틱 체크섬 동일
function setup3a(g) {
  const T = S.TFP, c = (tx, ty) => [tx * T + (T >> 1), ty * T + (T >> 1)];
  g.players[0].up.legion_optcloak = 1; g.players[1].up.elysian_mindstorm = 1;
  const o = { corps: S.spawn(g, 0, 'corpsman', ...c(72, 66)), shade: S.spawn(g, 0, 'shade', ...c(73, 66)), ferry: S.spawn(g, 0, 'ferry', ...c(72, 68)),
    troop: S.spawn(g, 0, 'trooper', ...c(73, 68)), bast: S.spawn(g, 0, 'bastion', ...c(75, 68)), up: S.spawn(g, 0, 'uplink', 30, 30),
    sages: [S.spawn(g, 1, 'sage', ...c(78, 70)), S.spawn(g, 1, 'sage', ...c(79, 70))], umbras: [S.spawn(g, 1, 'umbra', ...c(78, 73)), S.spawn(g, 1, 'umbra', ...c(79, 73))] };
  for (const e of [o.shade, ...o.sages]) e.energy = 200 * S.FP;
  return o;
}
test('3a 명령(cast·autocast·load·unload·siege·merge) 기록 → 인코딩 왕복 → 재생 매 틱 체크섬 동일', () => {
  const meta = { seed: 5, races: ['legion', 'elysian'], map: 'crossing' }, T = S.TFP;
  const live = S.createGame(meta), o = setup3a(live), rec = RP.create(meta, V), sums = []; let merged = false;
  for (let t = 0; t < 600; t++) {
    const cmds = [];
    if (t === 3) cmds.push({ player: 0, type: 'load', ids: [o.troop.id], target: o.ferry.id }, { player: 0, type: 'cast', ids: [o.shade.id], what: 'optcloak' },
      { player: 0, type: 'siege', ids: [o.bast.id] }, { player: 0, type: 'autocast', ids: [o.corps.id], what: 'heal', on: false },
      { player: 1, type: 'merge', ids: o.umbras.map(e => e.id) });
    if (t === 50) cmds.push({ player: 0, type: 'unload', ids: [o.ferry.id], x: 76 * T, y: 66 * T },
      { player: 1, type: 'cast', ids: o.sages.map(e => e.id), what: 'mindstorm', x: 73 * T, y: 67 * T },
      { player: 0, type: 'cast', ids: [o.up.id], what: 'scan', x: 78 * T, y: 72 * T });
    RP.record(rec, t, cmds); if (S.step(live, cmds).some(x => x.t === 'merge')) merged = true; sums.push(S.checksum(live));
  }
  rec.ticks = 600;
  const back = RP.decode(RP.encode(rec), V, D);
  assert(back.ok); assert.deepStrictEqual(back.rec.cmds, rec.cmds);
  const pl = RP.player(back.rec, S); setup3a(pl.state);
  const got = []; RP.runToSync(pl, 600, g => got.push(S.checksum(g)));
  assert.deepStrictEqual(got, sums);
  assert(merged, '합체가 실제로 일어남'); // 결과 유닛은 적 포격에 죽을 수 있어 이벤트로 확인
});

test('채팅 로그: 왕복 동일, 없으면 바이트 동일, 재생 체크섬·VERSION 무관, 잘못된 항목은 버림', () => {
  const o = playOriginal(300, 4242);
  const plain = RP.encode(o.rec);
  assert(!plain.includes('"chat"'));
  const chat = [[12, 0, 'all', '안녕'], [40, 1, 'team', 'gg']];
  const withChat = { ...o.rec, chat };
  const txt = RP.encode(withChat);
  assert.notStrictEqual(txt, plain);
  assert.strictEqual(RP.encode({ ...o.rec, chat: [] }), plain, '빈 채팅은 싣지 않음');
  const d = RP.decode(txt, V);
  assert(d.ok, d.err);
  assert.deepStrictEqual(d.rec.chat, chat);
  assert.deepStrictEqual({ ...d.rec, chat: undefined }, { ...o.rec, chat: undefined });
  const d0 = RP.decode(plain, V);
  assert(d0.ok); assert(!('chat' in d0.rec));
  assert.strictEqual(RP.encode(d0.rec), plain);
  const pl = RP.player(d.rec, S), got = []; RP.runToSync(pl, 300, g => got.push(S.checksum(g)));
  assert.deepStrictEqual(got, o.sums);
  assert.strictEqual(RP.version(S, D), V);
  const dec = chatVal => { const x = JSON.parse(txt); if (chatVal === undefined) delete x.chat; else x.chat = chatVal; const r = RP.decode(JSON.stringify(x), V); assert(r.ok, r.err); return r.rec.chat; };
  assert.strictEqual(dec('hi'), undefined);
  assert.strictEqual(dec({ a: 1 }), undefined);
  assert.strictEqual(dec(Array.from({ length: 601 }, (_, i) => [i, 0, 'all', 'x'])), undefined);
  assert.strictEqual(dec(Array.from({ length: 600 }, (_, i) => [i, 0, 'all', 'x'])).length, 600);
  assert.deepStrictEqual(dec([[1, 0, 'all', 'ok'], [1, 0, 'all', 'x'.repeat(201)], [-1, 0, 'all', 'a'], [1, 9, 'all', 'a'], [1, 0, 'zzz', 'a'], [1, 0, 'all', 5], [1, 0, 'all', ''], 'bad', [1, 0, 'all'], [2, 1, 'team', 'x'.repeat(200)]]),
    [[1, 0, 'all', 'ok'], [2, 1, 'team', 'x'.repeat(200)]]);
  assert.strictEqual(dec([[1, 0, 'zzz', 'a']]), undefined, '전부 버려지면 chat 없음');
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); console.log('ok  ', name); } catch (e) { fail++; console.log('FAIL', name, '\n  ', e.message); }
  }
  console.log(fail ? `${fail} failed` : 'all passed');
  process.exit(fail ? 1 : 0);
})();
