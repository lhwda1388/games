// node nebula-war/test/ai.test.js
const assert = require('assert');
const S = require('../sim.js');
const AI = require('../ai.js');
const RP = require('../replay.js');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let fail = 0;
const TF = S.TFP;

// 1:1 명단. ai 인자가 null이면 정지 상대(명령 없음)
const duo = (a, b, aiA = { level: 'normal' }, aiB = null, slots = [0, 1]) => [
  { race: a, team: 0, slot: slots[0], color: 0, ...(aiA ? { ai: aiA } : {}) },
  { race: b, team: 1, slot: slots[1], color: 1, ...(aiB ? { ai: aiB } : {}) }];

// AI 대전 실행. log = [[tick, cmds]] (명령 있는 틱만). until(g) 참이면 중단.
function run({ map = 'crossing', players, seed = 7, ticks, until, onTick }) {
  const g = S.createGame({ seed, map, players }), ais = AI.fromRoster(g, players, seed), log = [];
  let issued = 0, valid = 0, castIssued = 0, castValid = 0;
  for (let t = 0; t < ticks && g.winner === -1; t++) {
    const cmds = AI.collect(g, ais, []);
    if (cmds.length) { log.push([g.tick, JSON.parse(JSON.stringify(cmds))]); issued += cmds.length; valid += validCount(g, cmds); for (const c of cmds) if (c.type === 'cast') { castIssued++; castValid += validCount(g, [c]); } }
    S.step(g, cmds);
    if (onTick) onTick(g, ais);
    if (until && until(g)) break;
  }
  return { g, ais, log, issued, valid, castIssued, castValid };
}

// 명령 유효 판정 — sim applyCommands 검증과 같은 조건. 같은 틱 앞 명령의 지출은 pend로 누적.
function validCount(g, cmds) {
  let ok = 0;
  const pend = g.players.map(() => ({ crystal: 0, nebula: 0, supply2: 0 })), nOf = new Map();
  for (const c of cmds) {
    const p = c.player, q = pend[p];
    const own = id => { const e = S.byId(g, id); return e && e.owner === p ? e : null; };
    let good = false;
    if (c.type === 'train') {
      const b = own(c.ids[0]), n = (b && nOf.get(b.id)) || 0;
      good = !!b && S.canTrain(g, p, b, c.what, { ...q, n }) === '';
      if (good) { const u = S.D.units[c.what]; q.crystal += u.cost.crystal || 0; q.nebula += u.cost.nebula || 0; q.supply2 += Math.round((u.supply || 0) * 2) * (u.count || 1); nOf.set(b.id, n + 1); }
    } else if (c.type === 'build') {
      const e = own(c.ids[0]);
      good = !!e && (e.isB ? S.canAddon(g, p, e, c.what) === '' : !!e.def.worker && S.canPlace(g, p, c.what, c.tx, c.ty, e.id) === '');
    } else if (c.type === 'research') good = S.canResearch(g, p, own(c.ids[0]), c.what) === '';
    else if (c.type === 'morph') good = S.canMorph(g, p, own(c.ids[0]), c.what) === '';
    else if (c.type === 'gather') { const t = S.byId(g, c.target); good = !!t && (t.type === 'crystal' || (t.owner === p && !!t.def.onVent && !(t.buildLeft > 0))) && c.ids.some(own); }
    else if (c.type === 'attack') { const t = S.byId(g, c.target); good = !!t && S.isEnemy(g, p, t.owner) && c.ids.some(own); }
    else if (c.type === 'cast') {
      const e = (c.ids || []).map(own).find(x => x && S.canCast(g, p, x, c.what) === '');
      const A = S.D.abilities[c.what], t = c.target != null ? S.byId(g, c.target) : null;
      good = !!e && !!A && (A.target !== 'unit' || S.castTarget(g, e, A, t));
    } else if (c.type === 'autocast') good = (c.ids || []).some(id => { const e = own(id); return e && (e.def.abilities || []).includes(c.what); });
    else if (c.type === 'hold') good = (c.ids || []).some(own);
    else good = (c.ids || []).some(own);
    if (good) ok++;
  }
  return ok;
}
const ownOf = (g, p, pred) => g.ents.filter(e => e.owner === p && pred(e));
const tiles = e => [Math.floor(e.x / TF), Math.floor(e.y / TF)];

test('view: 안 보이는 적은 foes에 없고, 본 건물은 기억했다가 파괴 확인 시 지운다', () => {
  const g = S.createGame({ seed: 1, map: 'crossing', players: duo('legion', 'legion') });
  const mem = AI.newMemory();
  const far = S.spawn(g, 1, 'trooper', 100 * TF, 100 * TF);
  const b = S.spawn(g, 1, 'depot', 20, 14); // p0 시작 일꾼 시야 안
  S.step(g, []);
  let v = AI.view(g, 0, mem);
  assert(!v.foes.includes(far), '안개 속 적 유닛'); assert(v.foes.includes(b)); assert(mem.bld.has(b.id));
  for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) g.fog[0][(14 + j) * g.map.w + 20 + i] = 1; // 시야가 닫힌 것처럼
  v = AI.view(g, 0, mem);
  assert(!v.foes.includes(b) && mem.bld.has(b.id), '안 보여도 기억');
  b.hp = 0; S.step(g, []);                   // 파괴 → 다음 틱 안개 재계산으로 그 자리가 보임
  v = AI.view(g, 0, mem);
  assert(!mem.bld.has(b.id), '파괴 확인 후 삭제');
  assert(v.allies.length === 0 && v.res.some(e => e.type === 'crystal'));
});

test('시야 공정: 안개 속 적 유닛 위치가 달라도 AI 명령은 같다', () => {
  const players = duo('legion', 'swarm');
  const runWith = x => {
    const g = S.createGame({ seed: 3, map: 'crossing', players });
    S.spawn(g, 1, 'skitter', x * TF, 120 * TF); // p0 본진에서 먼 안개 속
    const ais = AI.fromRoster(g, players, 3), log = [];
    for (let t = 0; t < 900; t++) { const c = AI.collect(g, ais, []); log.push(JSON.stringify(c)); S.step(g, c); }
    return log;
  };
  assert.deepStrictEqual(runWith(60), runWith(70));
});

test('끝판 탐색: 옛 본진 뒤 구석에 숨은 마지막 적 건물을 찾아 부순다(사이트 순회만으로는 안 보이는 자리)', () => {
  const players = duo('legion', 'legion', { level: 'hard' }); // 탐색 규칙 검사 — 첫 공격 제한·느린 판단이 없는 어려움(≈ 옛 보통)
  const g = S.createGame({ seed: 5, map: 'crossing', players }), ais = AI.fromRoster(g, players, 5);
  for (const e of g.ents) if (e.owner === 1) e.hp = 0; // 본진 소멸 → 남은 건 구석 정비 학교 하나(연구 건물이라 유닛 없이도 탈락 아님; 보급고만 남으면 즉시 탈락)
  const d = S.spawn(g, 1, 'drillhall', 125, 126);           // (114,115) 시작 사이트 중심에서 약 13타일 — 사이트 도착 시야 밖
  for (let i = 0; i < 16; i++) S.spawn(g, 0, 'trooper', (24 + (i % 4)) * TF, (24 + (i >> 2)) * TF);
  for (let t = 0; t < 20000 /* 시작 위치 거울 보정(본진 ty 115·crossing 바위 대칭)으로 탐색 경로가 바뀌어 ~17300틱 */ && g.winner === -1; t++) S.step(g, AI.collect(g, ais, []));
  assert.strictEqual(g.winner, 0, `winner ${g.winner} tick ${g.tick} depot hp ${d.hp}`);
});

test('think는 상태를 바꾸지 않고 g.rng를 쓰지 않는다', () => {
  const players = duo('elysian', 'legion', { level: 'hard' }, { level: 'easy' });
  const g = S.createGame({ seed: 4, map: 'crossing', players }), ais = AI.fromRoster(g, players, 4);
  for (let t = 0; t < 300; t++) S.step(g, AI.collect(g, ais, []));
  const ck = S.checksum(g), rs = g.rng.s;
  for (let k = 0; k < 16; k++) { g.tick++; AI.collect(g, ais, []); } // 판단 틱을 여러 번 지나게
  g.tick -= 16;
  assert.strictEqual(S.checksum(g), ck); assert.strictEqual(g.rng.s, rs);
});

test('결정론: 같은 시드·명단 → 틱별 AI 명령·체크섬 동일', () => {
  const players = duo('legion', 'elysian', { level: 'normal' }, { level: 'hard' });
  const a = run({ players, ticks: 3000 }), b = run({ players, ticks: 3000 });
  assert(a.log.length > 20);
  assert.deepStrictEqual(a.log, b.log); assert.strictEqual(S.checksum(a.g), S.checksum(b.g));
});

test('판단 간격·엇갈림: 쉬움 24·보통 16·어려움 8, 4명이면 phase가 서로 다름', () => {
  const players = [0, 1, 2, 3].map(i => ({ race: 'legion', team: i, slot: i, color: i, ai: { level: 'hard' } }));
  const g = S.createGame({ seed: 1, map: 'fortress', players });
  for (const [lv, every] of [['easy', 24], ['normal', 16], ['hard', 8]]) {
    const ais = AI.fromRoster(g, players.map(q => ({ ...q, ai: { level: lv } })), 1);
    assert(ais.every(a => a.L.every === every), lv);
    assert.strictEqual(new Set(ais.map(a => a.phase)).size, 4, lv);
  }
});

test('경제: 세 종족 모두 3000틱에 일꾼 늘리고 채집, 보급 막힘 없음', () => {
  for (const race of ['legion', 'swarm', 'elysian']) {
    let blocked = 0;
    const r = run({ players: duo(race, 'legion'), ticks: 3000, onTick: g => { const q = g.players[0]; if (q.supplyUsed2 >= q.supplyMax2 && q.supplyMax2 < 400) blocked++; } });
    const ws = ownOf(r.g, 0, e => e.def.worker);
    assert(ws.length >= 12, `${race} workers ${ws.length}`);
    // 정찰·순찰 일꾼과 건설 중인 일꾼은 노는 게 아니다(Task 3: 정찰이 생기면서 3000틱 무렵 정찰 1 + 건설 2~3이 겹친다)
    const busy = w => w.id === r.ais[0].st.scout || w.id === r.ais[0].st.patrol || (w.order && ['gather', 'build', 'constructing'].includes(w.order.type));
    assert(ws.filter(busy).length >= ws.length - 2, `${race} idle workers`);
    assert(blocked < 300, `${race} supply blocked ${blocked} ticks`);
    assert(r.valid >= r.issued * 0.95, `${race} valid ${r.valid}/${r.issued}`);
  }
});

test('일꾼 목표: 난이도별 수정 8개 기준 8 / 12 / 12 (+가스 건물 1개)', () => {
  assert.strictEqual(AI.workerTarget(AI.LEVELS.easy, 8, 0), 8);
  assert.strictEqual(AI.workerTarget(AI.LEVELS.normal, 8, 1), 15);
  assert.strictEqual(AI.workerTarget(AI.LEVELS.hard, 8, 1), 15);
});

test('리플레이: AI 게임 기록 재생 → 같은 체크섬 (재생은 AI를 돌리지 않는다)', () => {
  const players = duo('swarm', 'elysian', { level: 'hard' }, { level: 'easy' }).map((q, i) => ({ ...q, name: 'A' + i }));
  const V = RP.version(S, S.D), rec = RP.create({ seed: 5, map: 'crossing', players }, V);
  const g = S.createGame({ seed: 5, map: 'crossing', players }), ais = AI.fromRoster(g, rec.players, 5);
  for (let t = 0; t < 2000; t++) { const c = AI.collect(g, ais, []); RP.record(rec, g.tick, c); S.step(g, c); }
  rec.ticks = 2000;
  const back = RP.decode(RP.encode(rec), V, S.D);
  assert(back.ok); assert.deepStrictEqual(back.rec.players.map(q => q.ai), [{ level: 'hard' }, { level: 'easy' }]);
  const pl = RP.player(back.rec, S); RP.runToSync(pl, 2000);
  assert.strictEqual(S.checksum(pl.state), S.checksum(g));
});

const reachT = (t, id) => { for (; t; t = S.D.buildings[t] && S.D.buildings[t].morphFrom) if (t === id) return true; return false; };
test('성향 데이터: 단계 순서대로 기술 조건 충족, 조합 유닛은 마법 전용·3단계 아님', () => {
  for (const [race, ps] of Object.entries(AI.PERS)) {
    assert(Object.keys(ps).length >= 1, race);
    for (const [id, P] of Object.entries(ps)) {
      const have = new Set([S.D.races[race].base]), has = r => [...have].some(t => reachT(t, r));
      const needAll = (rs, why) => { for (const r of rs || []) assert(has(r), `${race}.${id} ${why} needs ${r}`); };
      const hosts = { [S.D.races[race].base]: 1 }, addons = {}; // 부속은 본체당 하나: 부속 단계 수 ≤ 본체 단계 수(기지 = 시작 1 + 확장 단계)
      for (const st of P.build) {
        const [k, what] = st;
        if (k === 'x') hosts[S.D.races[race].base] = 1 + what;
        if (k === 'b' || k === 'm') {
          const d = S.D.buildings[what]; assert(d && d.race === race, `${id} ${what}`);
          needAll(d.requires, what); if (d.addonOf) needAll([d.addonOf], what); if (d.morphFrom) needAll([d.morphFrom], what);
          if (d.addonOf) { addons[d.addonOf] = (addons[d.addonOf] || 0) + 1; assert(addons[d.addonOf] <= (hosts[d.addonOf] || 0), `${race}.${id} ${what}: ${d.addonOf} 부속 자리 없음`); }
          else hosts[what] = (hosts[what] || 0) + 1; // 같은 id 단계 반복 = n개째
          have.add(what);
        } else if (k === 'u') {
          const u = S.D.units[what]; assert(u && u.race === race && !u.spellOnly && u.phase !== 3, `${id} ${what}`);
          needAll(u.requires, what); assert(Object.values(S.D.buildings).some(b => (b.trains || []).includes(what) && has(b.id)), `${id} trainer ${what}`);
        } else if (k === 'up') {
          const u = S.D.upgrades[what]; assert(u && u.race === race, what); needAll([u.at], what); needAll(u.requires && u.requires[0], what);
        } else if (k === 'gas' || k === 'x' || k === 'w') assert(Number.isInteger(what) && what >= 0, `${id} ${k}`);
        else assert.fail(`${id} unknown step ${k}`);
      }
      for (const u of Object.keys(P.mix)) {
        const d = S.D.units[u]; assert(d && d.race === race && !d.spellOnly && d.phase !== 3 && !d.worker, `${id} mix ${u}`);
        needAll(d.requires, 'mix ' + u);
        assert(Object.values(S.D.buildings).some(b => (b.trains || []).includes(u) && has(b.id)), `${id} mix trainer ${u}`);
      }
      for (const r of [...P.research, ...(P.spells || [])]) { const u = S.D.upgrades[r]; assert(u && u.race === race, `${id} research ${r}`); needAll([u.at], 'research ' + r); }
      for (const [u, c] of Object.entries(P.casters || {})) {
        const d = S.D.units[u]; assert(d && d.race === race && d.spellOnly && d.phase !== 3 && !P.mix[u] && c.per > 0 && c.max > 0, `${id} caster ${u}`);
        needAll(d.requires, 'caster ' + u);
        assert(Object.values(S.D.buildings).some(b => (b.trains || []).includes(u) && has(b.id)), `${id} caster trainer ${u}`);
      }
      assert(P.attack.value > 0 && P.attack.tick > 0 && P.expandAt > 0 && P.name, id);
    }
  }
});

const FIRST = [['legion', 'rush', 'garrison', 2, 'trooper', 6], ['swarm', 'skitter', 'vat', 1, 'skitter', 8], ['elysian', 'oath', 'portal', 2, 'oathblade', 4]];
test('생산: 종족별 첫 성향 — 7200틱 안에 빌드 건물·조합 유닛, 명령 유효 95%, 건설 착공 90%', () => {
  for (const [race, pers, bType, bN, uType, uN] of FIRST) {
    const builds = new Set(), seen = new Set();
    const r = run({ players: duo(race, 'legion', { level: 'normal', pers }), ticks: 7200,
      onTick: g => { for (const e of g.ents) if (e.owner === 0 && e.isB && !seen.has(e.id)) seen.add(e.id); } });
    for (const [, cmds] of r.log) for (const c of cmds) if (c.type === 'build' && c.player === 0 && !S.byId(r.g, c.ids[0])?.isB) builds.add(c.tx + ',' + c.ty + c.what);
    const done = ownOf(r.g, 0, e => e.isB && reachT(e.type, bType) && !(e.buildLeft > 0)).length;
    assert(done >= bN, `${race} ${bType} ${done}`);
    assert(ownOf(r.g, 0, e => e.type === uType).length >= uN, `${race} ${uType}`);
    assert(r.valid >= r.issued * 0.95, `${race} valid ${r.valid}/${r.issued}`);
    assert(seen.size - 1 >= builds.size * 0.9, `${race} 착공 ${seen.size - 1}/${builds.size}`); // -1: 시작 기지
  }
});

test('생산: 시전 유닛이 병력 비율 목표에 수렴하고 마법 연구가 순서대로 시작', () => {
  for (const [race, pers] of [['legion', 'rush'], ['elysian', 'oath'], ['elysian', 'ground']]) {
    const P = AI.PERS[race][pers], started = [];
    // seed 22: 시전 유닛 기술이 나오기 전에 끝나는 판(조기 승리)이면 비율 검사가 무의미해서, 세 경우 모두 군대가 남는 시드
    const r = run({ players: duo(race, 'legion', { level: 'normal', pers }, { level: 'easy' }), seed: 22, ticks: 14000,
      onTick: g => { for (const e of g.ents) if (e.owner === 0 && e.isB) for (const q of e.queue) if (q.research && P.spells.includes(q.research) && !started.includes(q.research)) started.push(q.research); } });
    const army = Object.keys(P.mix).reduce((n, u) => n + ownOf(r.g, 0, e => e.type === u).length, 0);
    for (const [u, c] of Object.entries(P.casters)) {
      const n = ownOf(r.g, 0, e => e.type === u).length, want = Math.min(Math.floor(c.max * AI.LEVELS.normal.casters / 100), Math.floor(army / c.per)); // 최대는 난이도 casters %
      assert(Math.abs(n - want) <= 1 || n >= want, `${race}.${pers} ${u} ${n}/${want} (army ${army})`);
    }
    assert(started.length >= 1, `${race}.${pers} 마법 연구 시작 안 함`);
    assert(JSON.stringify(started) === JSON.stringify(P.spells.filter(s => started.includes(s))), `${race}.${pers} 순서 ${started}`);
  }
});

test('배치: 건물이 길을 막지 않는다 — 본진→맵 중앙, 본진→모든 자기 건물 경로 존재', () => {
  for (const [race, pers] of FIRST) for (const map of ['crossing', 'gate']) {
    const r = run({ map, players: duo(race, 'legion', { level: 'normal', pers }), ticks: 7200 });
    const g = r.g, base = ownOf(g, 0, e => e.isB && e.def.dropoff)[0], sx = base.tx + 1, sy = base.ty + base.def.h + 1;
    assert(S.findPath(g, sx, sy, g.map.w >> 1, g.map.h >> 1).length > 0, `${race} ${map} 중앙`);
    for (const b of ownOf(g, 0, e => e.isB)) assert(S.findPath(g, sx, sy, b.tx - 1, b.ty + b.def.h).length > 0 || S.findPath(g, sx, sy, b.tx + b.def.w, b.ty - 1).length > 0, `${race} ${map} ${b.type}`);
  }
});

test('확장: 확장 단계에서 자기 본진이 아닌 사이트에 기지를 짓는다', () => {
  const r = run({ players: duo('swarm', 'legion', { level: 'normal', pers: 'skitter' }), ticks: 9000 });
  const nests = ownOf(r.g, 0, e => e.isB && e.def.dropoff);
  assert(nests.length >= 2, `bases ${nests.length}`);
  const st = r.g.map.starts[0];
  assert(nests.some(b => Math.abs(b.tx - st.tx) + Math.abs(b.ty - st.ty) > 16), '본진 밖');
});

test('정찰: 시작 후보를 돌아 적 본진을 기억한다(2인 맵, 적 위치 두 경우)', () => {
  for (const slots of [[0, 1], [0, 2]]) {
    const r = run({ players: duo('legion', 'swarm', { level: 'normal', pers: 'rush' }, null, slots), ticks: 4500 });
    const ai = r.ais[0];
    assert([...ai.mem.bld.values()].some(b => b.owner === 1 && reachT(b.type, 'nest')), `slots ${slots}`);
    assert(ai.st.scoutDone, 'scout returned');
  }
});

test('방어: 본진 근처에 보이는 적 → 병력이 그쪽으로 attackMove', () => {
  const players = duo('legion', 'swarm');
  const g = S.createGame({ seed: 2, map: 'crossing', players }), ais = AI.fromRoster(g, players, 2);
  const mine = [0, 1, 2, 3].map(i => S.spawn(g, 0, 'trooper', (20 + i) * TF, 24 * TF));
  const foe = S.spawn(g, 1, 'skitter', 22 * TF, 18 * TF); S.step(g, []);
  let cmds = [];
  for (let t = 0; t < 16 && !cmds.some(c => c.type === 'attackMove'); t++) { cmds = AI.collect(g, ais, []); S.step(g, cmds); }
  const am = cmds.find(c => c.type === 'attackMove');
  assert(am && mine.every(m => am.ids.includes(m.id)), 'army defends');
  assert(Math.abs(am.x - foe.x) < 6 * TF && Math.abs(am.y - foe.y) < 6 * TF);
});

test('후퇴: 보통 — 크게 불리하면 집결점으로 move, 쉬움은 후퇴 안 함', () => {
  for (const [level, expect] of [['normal', true], ['easy', false]]) {
    const players = duo('legion', 'legion', { level });
    const g = S.createGame({ seed: 2, map: 'crossing', players }), ais = AI.fromRoster(g, players, 2);
    const mine = [0, 1, 2].map(i => S.spawn(g, 0, 'trooper', (60 + i) * TF, 64 * TF));
    for (let i = 0; i < 12; i++) S.spawn(g, 1, 'trooper', (66 + (i % 4)) * TF, (62 + (i >> 2)) * TF);
    ais[0].st.mode = 'attack'; S.step(g, []);
    let moved = false;
    for (let t = 0; t < 16; t++) { const c = AI.collect(g, ais, []); if (c.some(x => x.type === 'move' && mine.some(m => x.ids.includes(m.id)))) moved = true; S.step(g, c); }
    assert.strictEqual(moved, expect, level);
  }
});

test('성향: 종족당 3개, 같은 시드 같은 성향, 시드 60개면 모두 나온다', () => {
  for (const race of ['legion', 'swarm', 'elysian']) {
    const keys = Object.keys(AI.PERS[race]); assert.strictEqual(keys.length, 3, race);
    const got = new Set();
    for (let seed = 1; seed <= 60; seed++) {
      const players = duo(race, 'legion'), g = S.createGame({ seed, map: 'crossing', players });
      const a = AI.fromRoster(g, players, seed)[0], b = AI.fromRoster(g, players, seed)[0];
      assert.strictEqual(a.pers, b.pers); got.add(a.pers);
    }
    assert.strictEqual(got.size, 3, race);
  }
});

function skirmish(level, setup) { // AI p0 병력 vs 정지 p1, 32틱 동안의 명령(보통 판단 16틱 × 2)
  const players = duo('legion', 'swarm', { level });
  const g = S.createGame({ seed: 2, map: 'crossing', players }), ais = AI.fromRoster(g, players, 2);
  const ctx = setup(g); ais[0].st.mode = 'attack'; S.step(g, []);
  const all = [];
  for (let t = 0; t < 32; t++) { const c = AI.collect(g, ais, []); all.push(...c); S.step(g, c); }
  return { g, ctx, all };
}
test('전술: 집중 사격(보통) — 사거리 안 가장 약한 적을 attack, 쉬움은 안 함', () => {
  const setup = g => {
    const mine = [0, 1, 2, 3].map(i => S.spawn(g, 0, 'trooper', (60 + i) * TF, 64 * TF));
    const foes = [0, 1, 2].map(i => S.spawn(g, 1, 'spinewyrm', (63 + i) * TF, 67 * TF));
    foes[2].hp = 10 * S.FP; return { mine, weak: foes[2] };
  };
  const n = skirmish('normal', setup);
  assert(n.all.some(c => c.type === 'attack' && c.target === n.ctx.weak.id), 'focus');
  const e = skirmish('easy', setup);
  assert(!e.all.some(c => c.type === 'attack'), 'easy no micro');
});
test('전술: 다친 유닛 빼기·카이팅(어려움)', () => {
  const r = skirmish('hard', g => {
    const hurt = S.spawn(g, 0, 'trooper', 60 * TF, 64 * TF); hurt.hp = Math.floor(hurt.hpMax / 5); hurt.lastHit = g.tick;
    const kiter = S.spawn(g, 0, 'trooper', 70 * TF, 64 * TF); kiter.cd = 10;
    const sk = S.spawn(g, 1, 'skitter', 71 * TF, 64 * TF);
    S.spawn(g, 1, 'skitter', 61 * TF, 65 * TF);
    return { hurt, kiter, sk };
  });
  const { hurt, kiter, sk } = r.ctx;
  assert(r.all.some(c => c.type === 'move' && c.ids.includes(hurt.id)), 'pull injured');
  const km = r.all.find(c => c.type === 'move' && c.ids.includes(kiter.id));
  assert(km && Math.abs(km.x - sk.x) > Math.abs(kiter.x - sk.x), 'kite away');
});
test('상성: 어려움 — 적 공중이 많으면 대공 못 하는 유닛 비중 0', () => {
  const players = duo('legion', 'swarm', { level: 'hard', pers: 'mech' });
  const g = S.createGame({ seed: 1, map: 'crossing', players }), ai = AI.fromRoster(g, players, 1)[0];
  assert(AI.mixFor(ai).hound > 0);
  for (let i = 0; i < 8; i++) ai.mem.air.set(1000 + i, 0);
  const m = AI.mixFor(ai);
  assert.strictEqual(m.hound || 0, 0); assert.strictEqual(m.bastion || 0, 0); assert(m.strider > 0);
});

test('3a: 은폐 적에게 맞으면 공격을 멈추고 물러나며 탐지 건물을 준비, 은폐 적은 대상으로 삼지 않는다', () => {
  const players = duo('legion', 'elysian', { level: 'normal' });
  const g = S.createGame({ seed: 3, map: 'crossing', players }), ai = AI.fromRoster(g, players, 3)[0];
  g.players[0].crystal = 2000;
  const mine = [0, 1, 2, 3].map(i => S.spawn(g, 0, 'trooper', (60 + i) * TF, 64 * TF));
  const um = S.spawn(g, 1, 'umbra', 61 * TF, 65 * TF);
  ai.st.mode = 'attack'; S.step(g, []);
  const all = [];
  for (let t = 0; t < 160; t++) {
    const c = ai.think(g); all.push(...c);
    S.step(g, t ? c : [...c, { type: 'attack', ids: [um.id], target: mine[0].id, player: 1 }]);
    if (!um.order) S.step(g, [{ type: 'attackMove', ids: [um.id], x: mine[1].x, y: mine[1].y, player: 1 }]);
  }
  assert(!all.some(c => c.type === 'attack' && c.target === um.id), 'cannot target hidden');
  assert(ai.st.unseenAt > 0, 'noticed unseen hits');
  assert(all.some(c => c.type === 'move' && c.ids.some(id => mine.some(e => e.id === id))), 'retreat');
  assert(all.some(c => c.type === 'build' && ['workshop', 'flak'].includes(c.what)), 'detector path');
});
test('3a: 모드 중인 적(포격 바스천)·모드 전용 무기 유닛도 전술이 깨지지 않는다', () => {
  const r = skirmish('normal', g => {
    [0, 1, 2, 3, 4, 5].forEach(i => S.spawn(g, 0, 'trooper', (58 + i) * TF, 64 * TF)); // 후퇴 기준을 넘지 않는 병력
    const b = S.spawn(g, 1, 'bastion', 63 * TF, 67 * TF); b.mode = 'siege';
    return { b };
  });
  assert(r.all.some(c => c.type === 'attack' && c.target === r.ctx.b.id), 'focus sieged');
});

// 팀 개시 테스트는 어려움(≈ 옛 보통: 첫 공격 제한 없음·공격 기준 ×1)으로 — 보통은 5분 전 공격을 안 한다
const quad = (...spec) => spec.map(([race, team, ai], i) => ({ race, team, slot: i, color: i, ...(ai ? { ai: { level: ai } } : {}) }));
test('팀: 같은 팀 AI 둘이 같은 목표로 함께 공격', () => {
  const players = quad(['legion', 0, 'hard'], ['swarm', 1, null], ['elysian', 0, 'hard'], ['swarm', 1, null]);
  const g = S.createGame({ seed: 3, map: 'fortress', players }), ais = AI.fromRoster(g, players, 3);
  assert.strictEqual(ais[0].board, ais[1].board);
  // 병력 가치 합(14×315 + 14×220)이 가장 큰 성향 기준(2200 × ECO 1.25) × 팀 AI 2명보다 크게
  for (const p of [0, 2]) for (let i = 0; i < 14; i++) S.spawn(g, p, p ? 'arcwalker' : 'bastion', (60 + (i % 7) * 2) * TF, (60 + p * 2 + (i >= 7 ? 1 : 0)) * TF);
  const eb = g.ents.find(e => e.owner === 1 && e.isB);
  for (const a of ais) a.mem.bld.set(eb.id, { id: eb.id, type: eb.type, owner: 1, tx: eb.tx, ty: eb.ty, w: eb.def.w, h: eb.def.h, x: eb.x, y: eb.y, seen: 0 });
  const tgt = new Map();
  for (let t = 0; t < 32; t++) { const c = AI.collect(g, ais, []); for (const x of c) if (x.type === 'attackMove' && x.ids.length >= 5) tgt.set(x.player, [x.x, x.y]); S.step(g, c); }
  assert(tgt.has(0) && tgt.has(2), 'both attack');
  const [a, b] = [tgt.get(0), tgt.get(2)];
  assert(Math.abs(a[0] - b[0]) < 8 * TF && Math.abs(a[1] - b[1]) < 8 * TF, 'same target');
});
test('팀: 리더가 개시하면 혼자서는 기준 미달인 팀원 AI도 함께 공격', () => {
  const players = quad(['legion', 0, 'hard'], ['swarm', 1, null], ['elysian', 0, 'hard'], ['swarm', 1, null]);
  const g = S.createGame({ seed: 3, map: 'fortress', players }), ais = AI.fromRoster(g, players, 3);
  for (let i = 0; i < 40; i++) S.spawn(g, 0, 'bastion', (60 + (i % 10) * 2) * TF, (60 + Math.floor(i / 10)) * TF);
  for (let i = 0; i < 4; i++) S.spawn(g, 2, 'arcwalker', (60 + i * 2) * TF, 70 * TF);
  const eb = g.ents.find(e => e.owner === 1 && e.isB);
  for (const a of ais) a.mem.bld.set(eb.id, { id: eb.id, type: eb.type, owner: 1, tx: eb.tx, ty: eb.ty, w: eb.def.w, h: eb.def.h, x: eb.x, y: eb.y, seen: 0 });
  for (let t = 0; t < 32; t++) S.step(g, AI.collect(g, ais, []));
  assert.strictEqual(ais[0].board.leader, 0);
  assert.strictEqual(ais[1].st.mode, 'attack', 'follower joins');
});

test('팀: 사람 팀원이 맞으면 AI 병력이 지원 간다', () => {
  const players = quad(['legion', 0, null], ['swarm', 1, null], ['elysian', 0, 'normal'], ['swarm', 1, null]);
  const g = S.createGame({ seed: 3, map: 'fortress', players }), ais = AI.fromRoster(g, players, 3);
  const army = [0, 1, 2, 3].map(i => S.spawn(g, 2, 'oathblade', (140 + i) * TF, 20 * TF));
  const hit = S.spawn(g, 0, 'trooper', 40 * TF, 40 * TF);
  for (let i = 0; i < 3; i++) S.spawn(g, 1, 'skitter', (42 + i) * TF, 42 * TF); // 피격 지점 근처에 보이는 적(가치 ≥ ASSIST_MIN)
  let got = null;
  for (let t = 0; t < 16 && !got; t++) {
    hit.lastHit = g.tick; hit.lastBy = 1;
    const c = AI.collect(g, ais, []); got = c.find(x => x.type === 'attackMove' && army.some(a => x.ids.includes(a.id))); S.step(g, c);
  }
  assert(got && Math.abs(got.x - hit.x) < 8 * TF && Math.abs(got.y - hit.y) < 8 * TF, 'assist');
});

test('팀: 피격 지점 근처에 보이는 적이 없으면 지원 가지 않는다', () => {
  const players = quad(['legion', 0, null], ['swarm', 1, null], ['elysian', 0, 'normal'], ['swarm', 1, null]);
  const g = S.createGame({ seed: 3, map: 'fortress', players }), ais = AI.fromRoster(g, players, 3);
  const army = [0, 1, 2, 3].map(i => S.spawn(g, 2, 'oathblade', (140 + i) * TF, 20 * TF));
  const hit = S.spawn(g, 0, 'trooper', 40 * TF, 40 * TF);
  let got = null;
  for (let t = 0; t < 16 && !got; t++) {
    hit.lastHit = g.tick; hit.lastBy = 1;
    const c = AI.collect(g, ais, []); got = c.find(x => x.type === 'attackMove' && army.some(a => x.ids.includes(a.id)) && Math.abs(x.x - hit.x) < 8 * TF); S.step(g, c);
  }
  assert(!got, 'no assist without visible enemies');
});
test('팀: 리더 AI 병력이 없으면 병력 있는 팀원이 리더가 되어 공격', () => {
  const players = quad(['legion', 0, 'hard'], ['swarm', 1, null], ['elysian', 0, 'hard'], ['swarm', 1, null]);
  const g = S.createGame({ seed: 3, map: 'fortress', players }), ais = AI.fromRoster(g, players, 3);
  for (let i = 0; i < 40; i++) S.spawn(g, 2, 'arcwalker', (60 + (i % 10) * 2) * TF, (70 + Math.floor(i / 10)) * TF);
  const eb = g.ents.find(e => e.owner === 1 && e.isB);
  for (const a of ais) a.mem.bld.set(eb.id, { id: eb.id, type: eb.type, owner: 1, tx: eb.tx, ty: eb.ty, w: eb.def.w, h: eb.def.h, x: eb.x, y: eb.y, seen: 0 });
  for (let t = 0; t < 32; t++) S.step(g, AI.collect(g, ais, []));
  assert.strictEqual(ais[0].board.leader, 2);
  assert.strictEqual(ais[1].st.mode, 'attack', 'armed member attacks');
});
test('팀: 리더가 오래 개시하지 않으면 팀원이 기준 충족 시 직접 공격', () => {
  const players = quad(['legion', 0, 'hard'], ['swarm', 1, null], ['elysian', 0, 'hard'], ['swarm', 1, null]);
  const g = S.createGame({ seed: 3, map: 'fortress', players }), ais = AI.fromRoster(g, players, 3);
  for (let i = 0; i < 40; i++) S.spawn(g, 0, 'bastion', (60 + (i % 10) * 2) * TF, (60 + Math.floor(i / 10)) * TF);
  for (let i = 0; i < 4; i++) S.spawn(g, 2, 'arcwalker', (60 + i * 2) * TF, 70 * TF);
  const eb = g.ents.find(e => e.owner === 1 && e.isB);
  for (const a of ais) a.mem.bld.set(eb.id, { id: eb.id, type: eb.type, owner: 1, tx: eb.tx, ty: eb.ty, w: eb.def.w, h: eb.def.h, x: eb.x, y: eb.y, seen: 0 });
  ais[0].st.calm = 1e9; // 리더는 개시하지 못한다
  let at = -1;
  for (let t = 0; t < AI.K.LEAD_WAIT + 100 && at < 0; t++) { S.step(g, AI.collect(g, ais, [])); if (ais[1].st.mode === 'attack') at = g.tick; }
  assert.strictEqual(ais[0].board.leader, 0);
  assert(at > AI.K.LEAD_WAIT, `follower solo attack at ${at}`);
});
test('빌드: 확장 자리가 없으면 확장 단계를 일정 시간 뒤 건너뛴다', () => {
  const players = duo('legion', 'swarm');
  const g = S.createGame({ seed: 7, map: 'crossing', players }), ais = AI.fromRoster(g, players, 7), ai = ais[0];
  ai.P = { ...AI.PERS.legion.mech, build: [['x', 1], ['gas', 1]] };
  // 모든 시작·확장 자리 옆에 기억한 적 건물(가짜) → expansionSpot 이 아무것도 못 찾는다
  const md = S.D.maps.crossing, spots = [...md.starts, ...md.expansions].map(s => [s.tx, s.ty]);
  let gasAt = -1;
  for (let t = 0; t < 2200 && gasAt < 0; t++) {
    g.players[0].crystal = 5000; g.players[0].nebula = 5000;
    spots.forEach(([tx, ty], i) => ai.mem.bld.set(1e6 + i, { id: 1e6 + i, type: S.D.races.swarm.base, owner: 1, tx, ty, w: 4, h: 3, x: tx * TF, y: ty * TF, seen: g.tick }));
    const c = AI.collect(g, ais, []);
    if (c.some(x => x.type === 'build' && x.what === 'pump')) gasAt = g.tick;
    if (c.some(x => x.type === 'build' && x.what === S.D.races.legion.base)) assert.fail('no expansion spot expected');
    S.step(g, c);
  }
  assert(gasAt >= AI.K.X_GIVEUP, `gas step reached at ${gasAt}`);
});

// ── 시전자 조작(ai-cast.js) ──
const CAST = require('../ai-cast.js');
// 코러스 AI p0(캔터 1기, 60,64) vs 정지 p1. 보이는 리벳 4기 뭉침(64~65, 64~65) + 안개 속 8기(hx, 64)
function castScene(level = 'normal', hx = 100) {
  const players = duo('elysian', 'legion', { level });
  const g = S.createGame({ seed: 2, map: 'crossing', players }), ais = AI.fromRoster(g, players, 2), ai = ais[0];
  const sage = S.spawn(g, 0, 'sage', 60 * TF, 64 * TF); sage.energy = 200 * S.FP;
  const clump = [0, 1, 2, 3].map(i => S.spawn(g, 1, 'trooper', (64 + (i & 1)) * TF, (64 + (i >> 1)) * TF));
  const hid = [];
  for (let i = 0; i < 8; i++) hid.push(S.spawn(g, 1, 'trooper', (hx + (i & 3)) * TF, (64 + (i >> 2)) * TF));
  S.step(g, []);
  return { g, ais, ai, sage, clump, hid };
}
const ctxOf = (sc) => CAST.context(sc.ai, sc.g, AI.view(sc.g, 0, sc.ai.mem));

test('시전 선택기: foeClump는 보이는 4기 뭉침 중심, 안개 속 뭉침은 무시(옮겨도 결과 동일)', () => {
  const res = [100, 110].map(hx => {
    const sc = castScene('normal', hx), ctx = ctxOf(sc);
    assert(sc.hid.every(e => !ctx.foes.includes(e)), '안개 속 적은 ctx 밖');
    return CAST.pick.foeClump(ctx, sc.sage, S.D.abilities.junkdrop, 56, 1, 0); // 사거리 무제한 마법으로도 안 보이는 적은 못 고른다
  });
  const c = res[0], sc = castScene();
  const cx = sc.clump.reduce((s, e) => s + e.x, 0) / 4, cy = sc.clump.reduce((s, e) => s + e.y, 0) / 4;
  assert(c && c.n === 4, JSON.stringify(c));
  assert(Math.abs(c.x - cx) < TF && Math.abs(c.y - cy) < TF, 'center');
  assert.deepStrictEqual(res[0], res[1]);
  assert.strictEqual(CAST.pick.foeClump(ctxOf(sc), sc.sage, S.D.abilities.junkdrop, 56, 5, 0), null, 'minN');
});

test('시전 선택기: friendlyOk — ff 2는 반경+1타일 안 아군 1기도 거부, ff 1은 가치 비율', () => {
  const sc = castScene(), ctx = ctxOf(sc), x = 64 * TF, y = 64 * TF;
  assert(CAST.friendlyOk(ctx, x, y, 48, 200, 2), '아군 없음');
  assert(CAST.friendlyOk(ctx, x, y, 48, 200, 0), 'ff 0');
  const mine = S.spawn(sc.g, 0, 'oathblade', 64 * TF + 70 * S.FP, y); // 반경 48 밖, 48+32 안
  const ctx2 = ctxOf(sc), val = CAST._.valueOf(mine);
  assert(!CAST.friendlyOk(ctx2, x, y, 48, 10000, 2), 'ff 2 거부');
  assert(CAST.friendlyOk(ctx2, x, y, 48, val, 1), 'ff 1: 반경 밖 아군은 안 셈');
  mine.x = x + 10 * S.FP;
  const ctx3 = ctxOf(sc);
  assert(CAST.friendlyOk(ctx3, x, y, 48, val * 3 + 1, 1) && !CAST.friendlyOk(ctx3, x, y, 48, val * 3, 1), 'ff 1 비율');
});

test('시전 계획: g 불변·같은 입력 같은 명령, 규칙 lvl·연구·마나·busy 존중', () => {
  const saved = CAST.RULES.mindstorm;
  CAST.RULES.mindstorm = { pick: 'foeClump', args: [48, 1, 0], when: 'combat', lvl: 2, ff: true };
  try {
    const sc = castScene('normal'), g = sc.g, v = AI.view(g, 0, sc.ai.mem);
    assert.deepStrictEqual(CAST.castPlan(sc.ai, g, v), [], '연구 전');
    g.players[0].up.elysian_mindstorm = 1;
    const ck = S.checksum(g), rs = g.rng.s;
    const a = CAST.castPlan(sc.ai, g, v), b = CAST.castPlan(sc.ai, g, v);
    assert.strictEqual(S.checksum(g), ck); assert.strictEqual(g.rng.s, rs);
    assert.deepStrictEqual(a, b);
    assert.strictEqual(a.length, 1); assert.strictEqual(a[0].what, 'mindstorm'); assert.deepStrictEqual(a[0].ids, [sc.sage.id]);
    assert.strictEqual(validCount(g, a), 1);
    assert.deepStrictEqual(CAST.castPlan(sc.ai, g, v, new Set([sc.sage.id])), [], 'busy');
    sc.sage.energy = 10 * S.FP; assert.deepStrictEqual(CAST.castPlan(sc.ai, g, v), [], '마나 부족');
    sc.sage.energy = 200 * S.FP;
    const easy = castScene('easy'); easy.g.players[0].up.elysian_mindstorm = 1;
    assert.deepStrictEqual(CAST.castPlan(easy.ai, easy.g, AI.view(easy.g, 0, easy.ai.mem)), [], 'lvl 2 규칙은 쉬움에서 꺼짐');
    // 실제 진행: 명령 → sim이 시전(t: 'cast' 이벤트)
    let cast = false;
    for (let t = 0; t < 120 && !cast; t++) cast = S.step(g, t ? [] : a).some(ev => ev.t === 'cast' && ev.what === 'mindstorm');
    assert(cast, 'sim cast');
  } finally { CAST.RULES.mindstorm = saved; }
});

test('시전 규칙 표: 데이터의 모든 능력 id(종족 유닛·건물)에 규칙이 있고, 데이터에 없는 id는 없다', () => {
  for (const d of [...Object.values(S.D.units), ...Object.values(S.D.buildings)])
    for (const id of d.abilities || []) assert(CAST.RULES[id], 'rule missing: ' + id);
  for (const id of Object.keys(S.D.abilities)) assert(CAST.RULES[id], 'rule missing: ' + id);
  for (const [id, R] of Object.entries(CAST.RULES)) {
    assert(S.D.abilities[id], 'unknown id ' + id);
    assert(typeof CAST.pick[R.pick] === 'function', id + ' pick'); assert(Number.isInteger(R.lvl), id + ' lvl');
  }
});

test('시전 유닛 따라가기: 병력 공격 중 → 메딕에게 병력 뒤 지점 attackMove, 6타일 안이면 재명령 없음', () => {
  const runCase = (cx) => {
    const r = skirmish('normal', g => {
      [0, 1, 2, 3].map(i => S.spawn(g, 0, 'trooper', (60 + i) * TF, 64 * TF));
      return [0, 1].map(i => S.spawn(g, 0, 'corpsman', (cx + i) * TF, 64 * TF));
    });
    return { r, cmds: r.all.filter(c => c.ids && c.ids.some(id => r.ctx.some(m => m.id === id))) };
  };
  const far = runCase(30);
  const am = far.cmds.find(c => c.type === 'attackMove');
  assert(am && far.r.ctx.every(m => am.ids.includes(m.id)), 'follow');
  assert(Math.abs(am.x - 61.5 * TF) <= 3 * TF && Math.abs(am.y - 64 * TF) <= 3 * TF, 'behind army ' + am.x / TF + ',' + am.y / TF);
  assert.strictEqual(far.cmds.filter(c => c.type === 'attackMove').length, 1, '가는 중엔 재명령 없음');
  const near = runCase(61);
  assert.strictEqual(near.cmds.length, 0, 'within 6 tiles');
});

test('시전 빈도: 쉬움은 판단 4번에·보통은 3번에 1번만 castPlan, cast: 0이면 실행 안 함', () => {
  const orig = CAST.castPlan;
  try {
    for (const [level, cast, every] of [['easy', undefined, 4], ['normal', undefined, 3], ['hard', 0, 0]]) {
      let calls = 0;
      CAST.castPlan = (...a) => { calls++; return orig(...a); };
      const players = duo('elysian', 'legion', { level, ...(cast === 0 ? { cast } : {}) });
      const g = S.createGame({ seed: 2, map: 'crossing', players }), ais = AI.fromRoster(g, players, 2);
      S.spawn(g, 0, 'sage', 60 * TF, 64 * TF);
      for (let t = 0; t < 24 * 9; t++) S.step(g, AI.collect(g, ais, []));
      const n = ais[0].st.castN || 0;
      if (every) { assert(n >= 8, level + ' decisions ' + n); assert.strictEqual(calls, Math.ceil(n / every), level); }
      else assert.strictEqual(calls, 0, 'cast 0');
    }
  } finally { CAST.castPlan = orig; }
});

test('성능: 4인 fortress, AI 3명(어려움), 400기 + 시전 유닛 40기 장면 — AI 틱당 평균 1ms 이하, castPlan 0.3ms 이하', () => {
  const players = [0, 1, 2, 3].map(i => ({ race: ['legion', 'swarm', 'elysian', 'legion'][i], team: i, slot: i, color: i, ...(i ? { ai: { level: 'hard' } } : {}) }));
  const g = S.createGame({ seed: 5, map: 'fortress', players }), ais = AI.fromRoster(g, players, 5);
  const UT = { legion: 'trooper', swarm: 'spinewyrm', elysian: 'oathblade' };
  // Task 10: 플레이어마다 시전 유닛 10기(종족별 혼합, 마나 가득, 마법 연구 완료)
  const CU = { legion: ['corpsman', 'shade', 'surveyor', 'dreadnought', 'hound'], swarm: ['matron', 'blighter'], elysian: ['sage', 'warden', 'watcher', 'voidascendant', 'skimmer'] };
  for (const id in S.D.upgrades) if (/_(smoke|optcloak|discharge|hound_drones|tow|repairdrones|mat|rot|mindstorm|prism|echo)$/.test(id)) for (const q of g.players) if (id.startsWith(q.race)) q.up[id] = 1;
  for (let p = 0; p < 4; p++) { const st = g.map.starts[p], sx = st.tx < 80 ? 1 : -1, sy = st.ty < 80 ? 1 : -1; // 맵 안쪽 방향으로
    for (let i = 0; i < 100; i++) S.spawn(g, p, UT[players[p].race], (st.tx + 2 + sx * (i % 10)) * TF, (st.ty + sy * (8 + Math.floor(i / 10))) * TF);
    const cu = CU[players[p].race];
    for (let i = 0; i < 10; i++) { const e = S.spawn(g, p, cu[i % cu.length], (st.tx + 2 + sx * (i % 10)) * TF, (st.ty + sy * 19) * TF); if (e.def.energy) e.energy = S.energyMax(g, e); } }
  for (let t = 0; t < 200; t++) S.step(g, AI.collect(g, ais, [])); // 기억·상태 데우기
  const orig = CAST.castPlan;
  let ns = 0n, cns = 0n, calls = 0;
  const blocks = []; // 100틱 구간별 평균(ms) — CPU 부하로 한 구간이 튀어도 중앙값은 안 흔들린다
  CAST.castPlan = (...a) => { const t0 = process.hrtime.bigint(); const r = orig(...a); cns += process.hrtime.bigint() - t0; calls++; return r; };
  try {
    for (let t = 0; t < 800; t++) {
      const t0 = process.hrtime.bigint(); const c = AI.collect(g, ais, []); const d = process.hrtime.bigint() - t0; ns += d;
      blocks[t / 100 | 0] = (blocks[t / 100 | 0] || 0) + Number(d) / 1e6 / 100;
      S.step(g, c);
    }
  } finally { CAST.castPlan = orig; }
  const ms = Number(ns) / 1e6 / 800, cms = Number(cns) / 1e6 / Math.max(1, calls);
  console.log('     AI ms/tick', ms.toFixed(3), 'castPlan ms/call', cms.toFixed(3), 'calls', calls, 'ents', g.ents.length);
  assert(calls > 0, 'castPlan 호출');
  const med = blocks.slice().sort((x, y) => x - y)[blocks.length >> 1]; // 구간 중앙값 기준 판정(전체 평균은 로그용)
  assert(med <= 1, `${med.toFixed(3)} ms/tick (중앙값; 평균 ${ms.toFixed(3)})`);
  assert(cms <= 0.3, `castPlan ${cms.toFixed(3)} ms`);
});

// ── 리벳 규칙(Task 6) ──
// 리벳 AI p0 vs 정지 p1(기본 코러스). setup(g) → 시전자 등. 연구는 ups 로. 한 번 진행해 시야를 만든 뒤 plan() 으로 castPlan.
function legScene(level, setup, foe = 'elysian', ups = []) {
  const players = duo('legion', foe, { level }), g = S.createGame({ seed: 2, map: 'crossing', players }), ais = AI.fromRoster(g, players, 2);
  for (const u of ups) g.players[0].up[u] = 1;
  const o = setup(g); S.step(g, []);
  return { g, ai: ais[0], o, plan: () => CAST.castPlan(ais[0], g, AI.view(g, 0, ais[0].mem)) };
}
const lcast = (cmds, what) => cmds.filter(c => c.type === 'cast' && c.what === what);
const foeRing = (g, type, n, x, y, p = 1) => Array.from({ length: n }, (_, i) => S.spawn(g, p, type, (x + (i & 1)) * TF, (y + (i >> 1)) * TF));
const own4 = g => [0, 1, 2, 3].map(i => S.spawn(g, 0, 'trooper', (60 + (i & 1)) * TF, (64 + (i >> 1)) * TF));
const full = (e) => { e.energy = 200 * S.FP; return e; };
const only = (what, fn) => { const sv = {}; for (const id of ['optcloak', 'mark', 'discharge']) if (id !== what) { sv[id] = CAST.RULES[id].lvl; CAST.RULES[id].lvl = 9; } try { return fn(); } finally { for (const id in sv) CAST.RULES[id].lvl = sv[id]; } };

test('리벳 규칙: 치료 자동 시전 켜기(보통), 쉬움은 안 함', () => {
  const setup = g => { const c = S.spawn(g, 0, 'corpsman', 60 * TF, 64 * TF); c.auto = ''; return c; };
  const n = legScene('normal', setup), a = n.plan();
  assert(a.length === 1 && a[0].type === 'autocast' && a[0].what === 'heal' && a[0].on === true && validCount(n.g, a) === 1, JSON.stringify(a));
  n.o.auto = 'heal'; assert.deepStrictEqual(n.plan(), []);
  assert.deepStrictEqual(legScene('easy', setup).plan(), []);
});
test('리벳 규칙: 연막(어려움만) — 교전 중 4기 뭉침, 보이는 적 탐지기가 10타일 안이면 안 씀', () => {
  const setup = det => g => { const c = full(S.spawn(g, 0, 'corpsman', 58 * TF, 64 * TF)); own4(g); foeRing(g, 'oathblade', 2, 66, 64); if (det) S.spawn(g, 1, 'surveyor', 66 * TF, 67 * TF); return c; };
  const h = legScene('hard', setup(false), 'legion', ['legion_smoke']), a = lcast(h.plan(), 'smoke');
  assert.strictEqual(a.length, 1); assert(Math.abs(a[0].x - 60.5 * TF) <= 2 * TF && validCount(h.g, a) === 1, JSON.stringify(a));
  assert.deepStrictEqual(lcast(legScene('normal', setup(false), 'legion', ['legion_smoke']).plan(), 'smoke'), [], '보통은 안 씀');
  assert.deepStrictEqual(lcast(legScene('hard', setup(true), 'legion', ['legion_smoke']).plan(), 'smoke'), [], '탐지기');
  assert.deepStrictEqual(lcast(legScene('hard', g => { const c = full(S.spawn(g, 0, 'corpsman', 58 * TF, 64 * TF)); own4(g); return c; }, 'legion', ['legion_smoke']).plan(), 'smoke'), [], '교전 아님');
});
test('리벳 규칙: 반사 망토 — 교전 시작 시 켬, 근처 탐지기면 안 켬, 어려움은 교전 끝나면 끔', () => {
  const setup = det => g => { const c = full(S.spawn(g, 0, 'shade', 60 * TF, 64 * TF)); foeRing(g, 'oathblade', 2, 66, 64); if (det) S.spawn(g, 1, 'surveyor', 67 * TF, 67 * TF); return c; };
  const ups = ['legion_optcloak'];
  const a = lcast(legScene('normal', setup(false), 'legion', ups).plan(), 'optcloak');
  assert.strictEqual(a.length, 1);
  assert.deepStrictEqual(lcast(legScene('normal', setup(true), 'legion', ups).plan(), 'optcloak'), [], '탐지기');
  const h = legScene('hard', g => full(S.spawn(g, 0, 'shade', 60 * TF, 64 * TF)), 'legion', ups);
  S.step(h.g, [{ type: 'cast', ids: [h.o.id], what: 'optcloak', player: 0 }]); S.step(h.g, []);
  assert(h.g.fx.some(f => f.ab === 'optcloak'), '켜짐');
  assert.strictEqual(lcast(h.plan(), 'optcloak').length, 1, '교전 끝 → 끔');
  const nrm = legScene('normal', g => full(S.spawn(g, 0, 'shade', 60 * TF, 64 * TF)), 'legion', ups);
  S.step(nrm.g, [{ type: 'cast', ids: [nrm.o.id], what: 'optcloak', player: 0 }]); S.step(nrm.g, []);
  assert.deepStrictEqual(lcast(nrm.plan(), 'optcloak'), [], '보통은 안 끔');
});
test('리벳 규칙: 표식 — 가치 최대 적, 어려움은 병력 집중 사격 대상, 이미 표식 붙은 적 제외', () => {
  const setup = g => {
    const c = full(S.spawn(g, 0, 'shade', 60 * TF, 64 * TF)), mine = own4(g);
    const cheap = S.spawn(g, 1, 'oathblade', 66 * TF, 64 * TF), dear = S.spawn(g, 1, 'arcwalker', 66 * TF, 66 * TF);
    for (const m of mine) m.order = { type: 'attack', target: cheap.id, auto: false, ax: -1, ay: -1, moving: false, resume: false };
    return { c, cheap, dear };
  };
  const n = legScene('normal', setup), h = legScene('hard', setup);
  const an = lcast(n.plan(), 'mark'), ah = lcast(h.plan(), 'mark');
  assert(an.length === 1 && an[0].target === n.o.dear.id && validCount(n.g, an) === 1, JSON.stringify(an));
  assert(ah.length === 1 && ah[0].target === h.o.cheap.id, JSON.stringify(ah));
  n.o.dear.stf |= S.STF.marked; // 이미 표식이 붙은 적은 건너뜀(겹쳐 걸지 않음)
  const an2 = lcast(n.plan(), 'mark'); assert(an2.length === 1 && an2[0].target === n.o.cheap.id, '표식 중복 ' + JSON.stringify(an2));
  n.o.cheap.stf |= S.STF.marked; assert.deepStrictEqual(lcast(n.plan(), 'mark'), [], '모두 표식');
  const hid = legScene('normal', g => { const c = full(S.spawn(g, 0, 'shade', 60 * TF, 64 * TF)); S.spawn(g, 1, 'arcwalker', 100 * TF, 64 * TF); return c; });
  assert.deepStrictEqual(lcast(hid.plan(), 'mark'), [], '안 보이는 적');
});
test('리벳 규칙: 방전탄 — 결정막 합 보통 200 / 어려움 120 또는 적 시전 유닛 2기, 안 보이면 안 씀', () => {
  const setup = (type, n, x = 66) => g => { const c = full(S.spawn(g, 0, 'shade', 60 * TF, 64 * TF)); foeRing(g, type, n, x, 64); return c; };
  const ups = ['legion_discharge'];
  only('discharge', () => {
    // oathblade 보호막 75: 2기 150 (보통 불충분·어려움 충분), 3기 225 (보통도)
    assert.deepStrictEqual(lcast(legScene('normal', setup('oathblade', 2), 'elysian', ups).plan(), 'discharge'), []);
    const h2 = legScene('hard', setup('oathblade', 2), 'elysian', ups), a = lcast(h2.plan(), 'discharge');
    assert(a.length === 1 && validCount(h2.g, a) === 1, JSON.stringify(a));
    assert.strictEqual(lcast(legScene('normal', setup('oathblade', 3), 'elysian', ups).plan(), 'discharge').length, 1);
    assert.strictEqual(lcast(legScene('hard', setup('sage', 2), 'elysian', ups).plan(), 'discharge').length, 1, '시전 유닛 2기');
    assert.deepStrictEqual(lcast(legScene('hard', setup('oathblade', 3, 100), 'elysian', ups).plan(), 'discharge'), [], '안개 속');
  });
});
test('리벳 규칙: 시커 — 스키드 6타일 안 지상 적 2기 이상', () => {
  const setup = n => g => { const c = S.spawn(g, 0, 'hound', 60 * TF, 64 * TF); foeRing(g, 'oathblade', n, 64, 64); return c; };
  const a = lcast(legScene('normal', setup(2), 'elysian', ['legion_hound_drones']).plan(), 'seeker');
  assert.strictEqual(a.length, 1);
  assert.deepStrictEqual(lcast(legScene('normal', setup(1), 'elysian', ['legion_hound_drones']).plan(), 'seeker'), []);
});
test('리벳 규칙: 정화 — 적이 건 상태의 아군, 대상 가치 보통 150 / 어려움 100', () => {
  const setup = type => g => {
    const c = full(S.spawn(g, 0, 'surveyor', 60 * TF, 64 * TF)), t = S.spawn(g, 0, type, 62 * TF, 64 * TF);
    S.spawn(g, 1, 'oathblade', 66 * TF, 64 * TF);
    g.fx.push({ id: g.nextId++, kind: 'status', ab: 'crystallize', owner: 1, x: t.x, y: t.y, r: 0, left: 100, tgt: t.id, drain: 0, delay: 0, src: 0 });
    return { c, t };
  };
  const n = legScene('normal', setup('shade')), h = legScene('hard', setup('shade'));
  assert.deepStrictEqual(lcast(n.plan(), 'cleanse'), [], '가치 < 150');
  const a = lcast(h.plan(), 'cleanse'); assert(a.length === 1 && a[0].target === h.o.t.id && validCount(h.g, a) === 1);
  assert.strictEqual(lcast(legScene('normal', setup('strider')).plan(), 'cleanse').length, 1);
});
test('리벳 규칙: 견인 빔 — 정박한 적은 바로, 멀어지는 적은 두 번째 판단부터', () => {
  const ups = ['legion_tow'];
  const st = legScene('normal', g => { const c = full(S.spawn(g, 0, 'surveyor', 60 * TF, 64 * TF)); const b = S.spawn(g, 1, 'bastion', 66 * TF, 64 * TF); b.mode = 'siege'; return { c, b }; }, 'legion', ups);
  const a = lcast(st.plan(), 'tow'); assert(a.length === 1 && a[0].target === st.o.b.id && validCount(st.g, a) === 1);
  const mk = () => legScene('normal', g => { const c = full(S.spawn(g, 0, 'surveyor', 60 * TF, 64 * TF)); return { c, f: S.spawn(g, 1, 'arcwalker', 64 * TF, 64 * TF) }; }, 'elysian', ups);
  const mv = mk();
  assert.deepStrictEqual(lcast(mv.plan(), 'tow'), [], '처음엔 이동 정보 없음');
  mv.o.f.x += 3 * TF;
  assert.strictEqual(lcast(mv.plan(), 'tow').length, 1, '멀어지는 중');
  const near = mk(); near.plan(); near.o.f.x -= 3 * TF;
  assert.deepStrictEqual(lcast(near.plan(), 'tow'), [], '다가오는 적');
});
test('리벳 규칙: 드론 정찰 — 안 보이는 사건 지점(쉬움 포함), 보통은 적 본진 미발견 시 안 본 시작 후보', () => {
  const setup = g => full(S.spawn(g, 0, 'uplink', 60 * TF, 64 * TF));
  const e = legScene('easy', setup); assert.deepStrictEqual(lcast(e.plan(), 'scan'), []);
  e.ai.st.unseen = { x: 70 * TF, y: 64 * TF }; e.ai.st.unseenAt = e.g.tick;
  const a = lcast(e.plan(), 'scan'); assert(a.length === 1 && a[0].x === 70 * TF && validCount(e.g, a) === 1, JSON.stringify(a));
  const n = legScene('normal', setup);
  for (let t = 0; t < 16 && !n.ai.st.sites; t++) { AI.collect(n.g, [n.ai], []); S.step(n.g, []); } // sites 준비
  const b = lcast(n.plan(), 'scan'); assert.strictEqual(b.length, 1, 'start candidate');
  assert(n.ai.st.sites.some(s => s.start && s.x === b[0].x && s.y === b[0].y));
  n.o.energy = 100 * S.FP; assert.deepStrictEqual(lcast(n.plan(), 'scan'), [], '마나 < 150');
});
test('리벳 규칙: 고철 낙하 — 정지 뭉침만, 움직이는 뭉침·아군 근처(어려움)·안 보이는 곳은 안 씀', () => {
  const setup = g => { const c = full(S.spawn(g, 0, 'silo', 60 * TF, 64 * TF)); S.spawn(g, 0, 'scorcher', 62 * TF, 64 * TF); const f = foeRing(g, 'oathblade', 4, 66, 64); return { c, f }; };
  const s = legScene('normal', setup);
  assert.deepStrictEqual(lcast(s.plan(), 'junkdrop'), [], '첫 판단: 정지 여부 모름');
  const a = lcast(s.plan(), 'junkdrop'); assert(a.length === 1 && validCount(s.g, a) === 1, JSON.stringify(a));
  const m = legScene('normal', setup); m.plan(); for (const f of m.o.f) f.x += 2 * TF;
  assert.deepStrictEqual(lcast(m.plan(), 'junkdrop'), [], '움직이는 뭉침');
  const h = legScene('hard', setup); h.plan(); S.spawn(h.g, 0, 'trooper', 66 * TF, 64 * TF);
  assert.deepStrictEqual(lcast(h.plan(), 'junkdrop'), [], '아군이 반경 안');
  const hid = legScene('normal', g => { const c = full(S.spawn(g, 0, 'silo', 60 * TF, 64 * TF)); S.spawn(g, 0, 'scorcher', 62 * TF, 64 * TF); foeRing(g, 'oathblade', 4, 100, 64); return c; });
  hid.plan(); assert.deepStrictEqual(lcast(hid.plan(), 'junkdrop'), [], '안개 속');
});
test('리벳 규칙: 수리 드론 — 기계 아군 결손 hp 합 300 이상에서만', () => {
  const setup = hurt => g => {
    const c = full(S.spawn(g, 0, 'dreadnought', 60 * TF, 64 * TF)), bs = [0, 1, 2, 3].map(i => S.spawn(g, 0, 'bastion', (62 + i) * TF, 64 * TF));
    S.spawn(g, 1, 'oathblade', 68 * TF, 64 * TF);
    if (hurt) for (const b of bs) b.hp = Math.floor(b.hpMax / 2);
    return c;
  };
  const a = lcast(legScene('normal', setup(true), 'elysian', ['legion_repairdrones']).plan(), 'repairdrones');
  assert.strictEqual(a.length, 1);
  assert.deepStrictEqual(lcast(legScene('normal', setup(false), 'elysian', ['legion_repairdrones']).plan(), 'repairdrones'), []);
});
test('앵커 정박: 사거리 안 적 → hold → 60틱 뒤 정박, 적이 사라지고 120틱 → 병력 목표로 재이동(보통 이상)', () => {
  const scene = level => {
    const players = duo('legion', 'swarm', { level }), g = S.createGame({ seed: 2, map: 'crossing', players }), ais = AI.fromRoster(g, players, 2);
    const b = S.spawn(g, 0, 'bastion', 60 * TF, 64 * TF), foe = S.spawn(g, 1, 'skitter', 69 * TF, 64 * TF);
    ais[0].st.mode = 'attack'; ais[0].st.target = { key: 'w0', x: 90 * TF, y: 64 * TF };
    S.step(g, [{ type: 'attackMove', ids: [b.id], x: 90 * TF, y: 64 * TF, player: 0 }]);
    return { g, ais, b, foe };
  };
  const sc = scene('normal'); let held = null;
  for (let t = 0; t < 16 && !held; t++) { const c = AI.collect(sc.g, sc.ais, []); held = c.find(x => x.type === 'hold'); S.step(sc.g, c); }
  assert(held && held.ids[0] === sc.b.id, 'hold');
  for (let t = 0; t < 70; t++) S.step(sc.g, AI.collect(sc.g, sc.ais, []));
  assert.strictEqual(sc.b.mode, 'siege', 'siege ' + sc.b.mode + ' ' + (sc.b.order && sc.b.order.type));
  sc.foe.hp = 0; // 적 사라짐
  let moved = null; const t0 = sc.g.tick;
  for (let t = 0; t < 300 && !moved; t++) { const c = AI.collect(sc.g, sc.ais, []); moved = c.find(x => x.type === 'attackMove' && x.ids.includes(sc.b.id)); S.step(sc.g, c); }
  assert(moved, 'release'); assert(sc.g.tick - t0 >= 100, 'ticks ' + (sc.g.tick - t0));
  const easy = scene('easy'); let any = false;
  for (let t = 0; t < 16; t++) { const c = AI.collect(easy.g, easy.ais, []); any = any || c.some(x => x.type === 'hold'); S.step(easy.g, c); }
  assert(!any, 'easy no hold');
});
test('앵커 정박: 집결 중에도 army 집결 명령이 hold 를 풀지 않는다 — hold 1번, 정박', () => {
  const players = duo('legion', 'swarm', { level: 'hard' }), g = S.createGame({ seed: 2, map: 'crossing', players }), ais = AI.fromRoster(g, players, 2);
  const b = S.spawn(g, 0, 'bastion', 60 * TF, 64 * TF), foe = S.spawn(g, 1, 'skitter', 69 * TF, 64 * TF);
  ais[0].st.mode = 'gather';
  S.step(g, [{ type: 'attackMove', ids: [b.id], x: 90 * TF, y: 64 * TF, player: 0 }]);
  let holds = 0, moves = 0;
  for (let t = 0; t < 120; t++) {
    const c = AI.collect(g, ais, []);
    const h0 = holds; // 첫 판단: 집결 attackMove 다음 같은 판단의 hold 가 이긴다 — 그 뒤로는 재명령 없음
    for (const x of c) if (x.ids && x.ids.includes(b.id)) { if (x.type === 'hold') holds++; else if (h0) moves++; }
    S.step(g, c); foe.hp = Math.max(foe.hp, 1);
  }
  assert.strictEqual(holds, 1, 'holds ' + holds); assert.strictEqual(moves, 0, 'moves ' + moves);
  assert.strictEqual(b.mode, 'siege', 'mode ' + b.mode);
});
test('전술: 시전 중(cast 명령) 유닛은 집중 사격·공격 재명령이 덮어쓰지 않는다', () => {
  const players = duo('legion', 'swarm', { level: 'normal' }), g = S.createGame({ seed: 2, map: 'crossing', players }), ais = AI.fromRoster(g, players, 2);
  const mine = [0, 1, 2, 3].map(i => S.spawn(g, 0, 'trooper', (60 + i) * TF, 64 * TF));
  const foes = [0, 1, 2].map(i => S.spawn(g, 1, 'spinewyrm', (63 + i) * TF, 67 * TF)); foes[2].hp = 10 * S.FP;
  ais[0].st.mode = 'attack'; S.step(g, []);
  let touched = 0, other = 0;
  for (let t = 0; t < 16; t++) {
    mine[0].order = { type: 'cast', what: 'mark', target: foes[0].id }; // 시전 중(AI 만 읽는다 — 매 틱 다시 건다)
    ais[0].st.target = null; // 목표 재설정 → army 전체 재명령 경로
    const c = AI.collect(g, ais, []);
    for (const x of c) if (x.type !== 'cast' && x.ids) { if (x.ids.includes(mine[0].id)) touched++; if (x.ids.includes(mine[1].id)) other++; }
    S.step(g, []);
  }
  assert(other > 0, '다른 유닛은 명령 받음'); assert.strictEqual(touched, 0, 'cast 중 유닛에 명령');
});
test('생산: 시전 유닛·마법 연구 저축은 생산 건물·기술이 있을 때만', () => {
  const players = duo('legion', 'swarm', { level: 'normal', pers: 'rush' }), g = S.createGame({ seed: 2, map: 'crossing', players }), ai = AI.fromRoster(g, players, 2)[0];
  S.spawn(g, 0, 'garrison', 20, 14);
  for (let i = 0; i < 12; i++) S.spawn(g, 0, 'trooper', (24 + (i % 4)) * TF, (20 + (i >> 2)) * TF);
  g.players[0].crystal = 100; g.players[0].nebula = 0; S.step(g, []);
  const bankAfter = () => { const v = AI.view(g, 0, ai.mem), bank = AI._.bankOf(g, v); AI._.casterOne(ai, g, v, bank, [], ai.P.mix); return bank; };
  const v0 = AI.view(g, 0, ai.mem), before = AI._.bankOf(g, v0).crystal;
  assert.strictEqual(bankAfter().crystal, before, '훈련소(drillhall) 없음 — 저축 안 함');
  assert.strictEqual(AI._.researchOne(ai, g, AI.view(g, 0, ai.mem), AI._.bankOf(g, AI.view(g, 0, ai.mem)), [], 'legion_smoke'), 'fail', '연구 건물 없음');
  S.spawn(g, 0, 'drillhall', 30, 14); S.step(g, []);
  assert(bankAfter().crystal < before, '기술 있고 네뷸라 부족 — 저축');
  assert.strictEqual(AI._.researchOne(ai, g, AI.view(g, 0, ai.mem), AI._.bankOf(g, AI.view(g, 0, ai.mem)), [], 'legion_smoke'), 'short', '연구 건물 있음');
});

// E2 레이 라인: 조율 기둥은 가장 가까운 자기 기둥에서 10~14타일(반타일 좌표 거리² 400~784), findSpot은 S.powerNet 1회
const pylonC = b => [2 * b.tx + b.def.w, 2 * b.ty + b.def.h];
const near2 = (b, ps) => Math.min(...ps.map(q => { const [ax, ay] = pylonC(b), [bx, by] = pylonC(q); return (ax - bx) ** 2 + (ay - by) ** 2; }));
test('레이 라인: findSpot 조율 기둥 10~14타일, 자리 없으면 나선, 호출당 powerNet 1회', () => {
  const players = duo('elysian', 'legion');
  const g = S.createGame({ seed: 3, map: 'crossing', players }), ai = AI.fromRoster(g, players, 3)[0];
  S.step(g, []);
  const home = ownOf(g, 0, e => e.def.dropoff)[0];
  let v = AI.view(g, 0, AI.newMemory());
  const sp = AI.findSpot(ai, g, v, 'resonator', { rects: [] });
  const d = near2({ tx: sp[0], ty: sp[1], def: S.D.buildings.resonator }, [home]);
  assert(sp && d >= 400 && d <= 784, `d2 ${d}`);
  const orig = S.powerNet; let n = 0;
  S.powerNet = (...a) => { n++; return orig(...a); };
  try { ai.st.spotFail = {}; AI.findSpot(ai, g, v, 'portal', { rects: [] }); } finally { S.powerNet = orig; }
  assert.strictEqual(n, 1, `powerNet ${n}`);
  const [hx, hy] = pylonC(home), W = g.map.w;
  for (let y = 0; y < g.map.h; y++) for (let x = 0; x < W; x++) { const r2 = (2 * x + 1 - hx) ** 2 + (2 * y + 1 - hy) ** 2; if (r2 >= 16 * 16 && r2 <= 32 * 32) g.map.rock[y * W + x] = 1; }
  v = AI.view(g, 0, AI.newMemory()); ai.st.spotFail = {};
  const got = AI.findSpot(ai, g, v, 'resonator', { rects: [] });
  ai.race = 'legion'; ai.st.spotFail = {}; // 엘리시안 규칙 끔 = 기존 나선
  const spiral = AI.findSpot(ai, g, v, 'resonator', { rects: [] }); ai.race = 'elysian';
  assert(got && spiral); assert.deepStrictEqual(got, spiral);
});
test('레이 라인: 엘리시안 성향 3개 × 7200틱 — 전력 끊긴 건물 0, 두 번째 이후 조율 기둥 80%가 기존 기둥과 10~14타일', () => {
  for (const pers of Object.keys(AI.PERS.elysian)) {
    const r = run({ players: duo('elysian', 'legion', { level: 'normal', pers }), ticks: 7200 });
    const done = ownOf(r.g, 0, e => e.isB && !(e.buildLeft > 0));
    assert.strictEqual(done.filter(b => b.unpowered).length, 0, `${pers} unpowered`);
    const ps = ownOf(r.g, 0, e => e.isB && e.def.power).sort((a, b) => a.id - b.id);
    const res = ps.filter(b => b.type === 'resonator').slice(1);
    const good = res.filter(b => { const d = near2(b, ps.filter(q => q.id < b.id)); return d >= 400 && d <= 784; }).length;
    assert(good >= res.length * 0.8, `${pers} ${good}/${res.length}`);
  }
});

// ── 마이셀 규칙(Task 7) ──
// 마이셀 AI p0(어미 matron·블라이터 blighter 마나 가득, 60,64) vs 정지 p1. 보이는 리벳 trooper n기 뭉침(64~64.5, 64~65, 반 타일 간격)
function swarmScene(level = 'normal', n = 4) {
  const players = duo('swarm', 'legion', { level });
  const g = S.createGame({ seed: 2, map: 'crossing', players }), ais = AI.fromRoster(g, players, 2), ai = ais[0];
  const matron = S.spawn(g, 0, 'matron', 60 * TF, 64 * TF), blighter = S.spawn(g, 0, 'blighter', 60 * TF, 66 * TF);
  matron.energy = blighter.energy = 200 * S.FP;
  g.players[0].up.swarm_mat = 1; g.players[0].up.swarm_rot = 1;
  const foes = [];
  for (let i = 0; i < n; i++) foes.push(S.spawn(g, 1, 'trooper', (64 + (i & 1) / 2) * TF, (64 + (i >> 1) / 2) * TF));
  S.step(g, []);
  return { g, ai, matron, blighter, foes };
}
const planOf = sc => CAST.castPlan(sc.ai, sc.g, AI.view(sc.g, 0, sc.ai.mem));
const whatOf = cmds => cmds.map(c => c.what).sort();
test('마이셀 규칙: spores — 적 가치 ≥ 200 뭉침에만, 안개 속·가치 미달·쉬움은 없음', () => {
  const sc = swarmScene('normal', 6);
  const a = planOf(sc).find(c => c.what === 'spores');
  assert(a && a.ids[0] === sc.matron.id && Math.abs(a.x - 64.25 * TF) < TF, JSON.stringify(a));
  assert.strictEqual(validCount(sc.g, [a]), 1);
  const low = swarmScene('normal', 1); assert(!planOf(low).some(c => c.what === 'spores'), '가치 미달');
  const fog = swarmScene('normal', 6); for (const f of fog.foes) f.x += 60 * TF; S.step(fog.g, []);
  assert.deepStrictEqual(planOf(fog), [], '안개 속');
  const easy = swarmScene('easy', 6); assert(!planOf(easy).some(c => c.what === 'spores'), '쉬움');
});
test('마이셀 규칙: rot — 뭉침 n ≥ clump(보통 4)에서만, 아군 피해 검사 없이 아군 곁에도', () => {
  const sc = swarmScene('normal', 4);
  const a = planOf(sc).find(c => c.what === 'rot');
  assert(a && a.ids[0] === sc.blighter.id, JSON.stringify(a));
  assert(planOf(swarmScene('normal', 3)).every(c => c.what !== 'rot'), 'n 미달');
  S.spawn(sc.g, 0, 'skitter', 64 * TF, 64 * TF); S.step(sc.g, []);
  assert(planOf(sc).some(c => c.what === 'rot'), '아군이 섞여도 시전');
  const hard = swarmScene('hard', 3); assert(planOf(hard).some(c => c.what === 'rot'), '어려움 clump 3');
});
test('마이셀 규칙: sprout — 마나 100 미만이면 없음(150 이상 대기는 rot 에 밀려 못 썼다), 어려움도 rot 몫을 남기지 않음', () => {
  const sc = swarmScene('normal', 2); sc.blighter.energy = 110 * S.FP;
  assert(planOf(sc).some(c => c.what === 'sprout'), '110');
  sc.blighter.energy = 90 * S.FP; assert(!planOf(sc).some(c => c.what === 'sprout'), '90');
  const hard = swarmScene('hard', 2); hard.blighter.energy = 110 * S.FP;
  assert(planOf(hard).some(c => c.what === 'sprout'), 'hard 110');
  hard.blighter.energy = 90 * S.FP; assert(!planOf(hard).some(c => c.what === 'sprout'), 'hard 90');
});
test('마이셀 규칙: mat — 자기 부상 3 + 적 2가 반경 56 안일 때만, 어려움 후퇴 중엔 집결 쪽 3타일', () => {
  const mk = (level, hurt) => {
    const sc = swarmScene(level, 2); sc.matron.energy = 200 * S.FP;
    for (let i = 0; i < hurt; i++) { const e = S.spawn(sc.g, 0, 'skitter', (63 + i / 2) * TF, 64 * TF); e.hp = Math.floor(e.hpMax / 2); }
    S.step(sc.g, []); return sc;
  };
  assert(!planOf(mk('normal', 2)).some(c => c.what === 'mat'), '부상 2');
  const sc = mk('normal', 3), a = planOf(sc).find(c => c.what === 'mat');
  assert(a && a.ids[0] === sc.matron.id, JSON.stringify(a));
  const h = mk('hard', 3), h0 = planOf(h).find(c => c.what === 'mat');
  h.ai.st.mode = 'retreat';
  const h1 = planOf(h).find(c => c.what === 'mat');
  assert(h0 && h1 && h1.x < h0.x, `retreat shift ${h0 && h0.x} -> ${h1 && h1.x}`); // 본진은 왼쪽(작은 x) — 건물 쪽으로
});
test('변이 인지(어려움): 같은 hp 40%에서 0단계는 남고 1단계는 빠짐, 보통은 둘 다 남음, 2단계는 hp 80% 전 복귀 안 함', () => {
  const mut = S.D.races.swarm.mutation.at;
  const sk = level => skirmish(level, g => {
    const a = S.spawn(g, 0, 'skitter', 60 * TF, 64 * TF), b = S.spawn(g, 0, 'skitter', 60 * TF, 66 * TF);
    for (const e of [a, b]) { e.hp = Math.floor(e.hpMax * 0.4); e.lastHit = g.tick; }
    b.kills = mut[0];
    for (let i = 0; i < 4; i++) S.spawn(g, 0, 'skitter', (58 + i) * TF, 68 * TF); // 후퇴 판단이 서지 않게 멀쩡한 병력
    S.spawn(g, 1, 'trooper', 63 * TF, 65 * TF).cd = 1e6; // 쏘지 않는 적(hp 변화 없음)
    return { a, b };
  });
  const h = sk('hard'), moved = id => h.all.some(c => c.type === 'move' && c.ids.includes(id));
  assert(!moved(h.ctx.a.id), '0단계 남음'); assert(moved(h.ctx.b.id), '1단계 빠짐');
  const n = sk('normal');
  assert(!n.all.some(c => c.type === 'move'), '보통은 둘 다 남음');
  // 2단계: 빠진 뒤 hp 70%(60% 넘음)여도 pulled 유지(80% 전), 1단계는 풀림
  const g2 = S.createGame({ seed: 2, map: 'crossing', players: duo('swarm', 'legion', { level: 'hard' }) }), ai2 = AI.fromRoster(g2, duo('swarm', 'legion', { level: 'hard' }), 2)[0];
  const a2 = S.spawn(g2, 0, 'skitter', 60 * TF, 64 * TF), b2 = S.spawn(g2, 0, 'skitter', 60 * TF, 66 * TF);
  a2.kills = mut[0]; b2.kills = mut[1]; S.spawn(g2, 1, 'trooper', 63 * TF, 65 * TF).cd = 1e6; S.step(g2, []);
  for (const e of [a2, b2]) e.hp = Math.floor(e.hpMax * 0.7);
  ai2.st.pulled.add(a2.id); ai2.st.pulled.add(b2.id); ai2.st.mode = 'attack';
  for (let t = 0; t < ai2.L.every; t++) { S.step(g2, AI.collect(g2, [ai2], [])); }
  assert(!ai2.st.pulled.has(a2.id) && ai2.st.pulled.has(b2.id), 'stage 2 holds until 80%');
});

// ── 코러스 규칙(Task 8) ──
// 코러스 AI p0 + 시전 유닛 1기(60,64) vs 정지 p1. foes: [종류, x, y] 목록(보이는 거리)
function elyScene(level, caster, foes, up = []) {
  const players = duo('elysian', 'legion', { level });
  const g = S.createGame({ seed: 2, map: 'crossing', players }), ai = AI.fromRoster(g, players, 2)[0];
  const c = S.spawn(g, 0, caster, 60 * TF, 64 * TF); c.energy = 200 * S.FP;
  for (const u of up) g.players[0].up[u] = 1;
  const fs = foes.map(([t, x, y]) => S.spawn(g, 1, t, x * TF, y * TF));
  S.step(g, []);
  const plan = () => CAST.castPlan(ai, g, AI.view(g, 0, ai.mem)).filter(x => x.type === 'cast');
  return { g, ai, c, fs, plan };
}
const grid = (n, t = 'trooper', x0 = 64, y0 = 64) => Array.from({ length: n }, (_, i) => [t, x0 + (i % 4) / 2, y0 + (i >> 2) / 2]);
const whatOfE = cmds => cmds.map(x => x.what);

test('코러스 규칙: 공명 파쇄 — 가치 400(어려움 300) 미만 뭉침은 안 씀, 아군이 섞이면 난이도별 회피', () => {
  const val = n => n * CAST._.valueOf({ def: S.D.units.trooper });
  assert(val(5) >= 300 && val(5) < 400 && val(7) >= 400, 'values ' + val(5) + ' ' + val(7));
  for (const [lv, n, want] of [['normal', 5, false], ['normal', 7, true], ['hard', 5, true], ['hard', 3, false]]) {
    const sc = elyScene(lv, 'sage', grid(n), ['elysian_mindstorm']);
    assert.strictEqual(whatOfE(sc.plan()).includes('mindstorm'), want, `${lv} ${n}`);
  }
  const a = elyScene('normal', 'sage', grid(7), ['elysian_mindstorm']);
  S.spawn(a.g, 0, 'oathblade', 64 * TF, 64 * TF); // 아군 1기 가치 < 적 가치 / 3 → 보통은 씀
  assert(whatOfE(a.plan()).includes('mindstorm'), 'normal ff1');
  const h = elyScene('hard', 'sage', grid(7), ['elysian_mindstorm']);
  S.spawn(h.g, 0, 'oathblade', 64 * TF, 64 * TF); // 어려움 ff 2: 아군이 있으면 안 씀
  assert(!whatOfE(h.plan()).includes('mindstorm'), 'hard ff2');
});

test('코러스 규칙: 공명 증폭 — 공격·후퇴 중 64px 안 아군 4기 이상, 이미 걸렸으면 안 씀', () => {
  const sc = elyScene('normal', 'sage', grid(2));
  for (const [x, y] of [[59, 64], [61, 64], [60, 63], [60, 65]]) S.spawn(sc.g, 0, 'oathblade', x * TF, y * TF);
  S.step(sc.g, []);
  sc.ai.st.mode = 'gather'; assert(!whatOfE(sc.plan()).includes('amplify'), 'gather');
  sc.ai.st.mode = 'attack';
  const cmds = sc.plan(); assert.deepStrictEqual(whatOfE(cmds), ['amplify']);
  sc.ai.st.mode = 'retreat'; assert(whatOfE(sc.plan()).includes('amplify'), 'retreat');
  S.step(sc.g, cmds); S.step(sc.g, []); sc.ai.st.mode = 'attack';
  assert(!whatOfE(sc.plan()).includes('amplify'), '이미 걸림');
  const few = elyScene('normal', 'sage', grid(2)); few.ai.st.mode = 'attack';
  assert(!whatOfE(few.plan()).includes('amplify'), '아군 부족');
});

test('코러스 규칙: 결정 봉인 — 아군이 반경 안(+1타일)에 1기라도 있으면 없음, 후퇴 중 추격 뭉침은 허용', () => {
  const val = CAST._.valueOf({ def: S.D.units.trooper });
  const n = Math.ceil(600 / val), sc = elyScene('normal', 'voidascendant', grid(n));
  assert.deepStrictEqual(whatOfE(sc.plan()), ['stasis']);
  const x = sc.plan()[0].x;
  const mine = S.spawn(sc.g, 0, 'oathblade', x, 65 * TF); S.step(sc.g, []);
  assert(!whatOfE(sc.plan()).includes('stasis'), '아군 1기');
  mine.x = x + 150 * S.FP; S.step(sc.g, []); // 반경 48 + 32 밖
  assert(whatOfE(sc.plan()).includes('stasis'), '멀면 씀');
  const small = elyScene('normal', 'voidascendant', grid(5));
  assert(!whatOfE(small.plan()).includes('stasis'), '가치 부족');
  small.ai.st.mode = 'retreat'; assert(whatOfE(small.plan()).includes('stasis'), '후퇴 중 추격 뭉침');
});

test('코러스 규칙: 결정화 — 이미 무장 해제된 대상 제외, 무기 없는 적은 대상 아님', () => {
  const sc = elyScene('normal', 'voidascendant', [['trooper', 64, 64]]);
  sc.c.energy = 200 * S.FP;
  const a = sc.plan(); assert.deepStrictEqual(whatOfE(a), ['crystallize']); assert.strictEqual(a[0].target, sc.fs[0].id);
  sc.fs[0].stf |= S.STF.disarmed; assert.deepStrictEqual(sc.plan(), [], '이미 무장 해제');
  const un = elyScene('normal', 'voidascendant', [['corpsman', 64, 64]]);
  assert.deepStrictEqual(un.plan(), [], '무기 없음');
});

test('코러스 규칙: 광자 탐침 — 안 보이는 적 사건이 있을 때만(쉬움도)', () => {
  const sc = elyScene('easy', 'skimmer', []);
  assert.deepStrictEqual(sc.plan(), [], '사건 없음');
  sc.ai.st.unseen = { x: 70 * TF, y: 64 * TF }; sc.ai.st.unseenAt = sc.g.tick;
  const a = sc.plan(); assert.deepStrictEqual(whatOfE(a), ['probe']); assert.strictEqual(a[0].x, 70 * TF);
});

test('코러스 규칙: 프리즘 장막 — 교전 중 켬, 보이는 탐지기 있으면 안 켬, 어려움은 교전 끝나면 끔', () => {
  const sc = elyScene('hard', 'warden', grid(2), ['elysian_prism']);
  const a = sc.plan(); assert.deepStrictEqual(whatOfE(a), ['prism']);
  S.step(sc.g, a); S.step(sc.g, []);
  assert.deepStrictEqual(sc.plan(), [], '켜진 채 교전 중 — 유지');
  for (const f of sc.fs) f.x += 60 * TF; S.step(sc.g, []); // 시야 밖
  assert.deepStrictEqual(whatOfE(sc.plan()), ['prism'], '교전 끝 — 끔');
  const det = elyScene('hard', 'warden', [['surveyor', 64, 64], ...grid(2)], ['elysian_prism']);
  assert(!whatOfE(det.plan()).includes('prism'), '탐지기');
  const far = elyScene('hard', 'warden', [['surveyor', 76, 64], ...grid(2)], ['elysian_prism']);
  assert(whatOfE(far.plan()).includes('prism'), '탐지기 10타일 밖 — 켬');
});

test('코러스 규칙: 대합창 — 보호막 결손 합 300 이상 뭉침일 때만', () => {
  const sc = elyScene('normal', 'warden', grid(2));
  const us = [0, 1, 2, 3, 4].map(i => S.spawn(sc.g, 0, 'oathblade', (58 + i / 2) * TF, 62 * TF));
  S.step(sc.g, []);
  assert.deepStrictEqual(sc.plan(), [], '보호막 가득');
  for (const u of us) u.shield = 0; // 결손 75 × 5 = 375
  const a = sc.plan(); assert.deepStrictEqual(whatOfE(a), ['chorus']);
  for (const u of us.slice(2)) u.shield = u.shieldMax; // 150
  assert.deepStrictEqual(sc.plan(), [], '결손 부족');
});

test('코러스 규칙: 음파 역류 — 마나가 모자란 아군 시전자가 6타일 안일 때만, sim 효과는 마나 이전', () => {
  const full = elyScene('normal', 'watcher', [['corpsman', 64, 64]], ['elysian_echo']);
  assert.deepStrictEqual(full.plan(), [], '마나 충분');
  const sc = elyScene('normal', 'watcher', [['corpsman', 64, 64]], ['elysian_echo']);
  sc.c.energy = 100 * S.FP;
  const a = sc.plan(); assert.deepStrictEqual(whatOfE(a), ['echo']); assert.strictEqual(a[0].target, sc.fs[0].id);
  assert.strictEqual(validCount(sc.g, a), 1);
  let done = false;
  for (let t = 0; t < 120 && !done; t++) done = S.step(sc.g, t ? [] : a).some(ev => ev.t === 'cast' && ev.what === 'echo');
  assert(done, 'sim cast');
  assert(sc.fs[0].energy < 2 * S.FP, '대상 마나 0'); assert(sc.c.energy > (100 - 50) * S.FP + 10 * S.FP, '아군 마나 증가');
});

test('공명 뭉치기: 어려움 코러스 — 흩어진 오스블레이드 6기가 집결 중 같은 종류끼리 모인다(보통은 move 없음)', () => {
  for (const [level, grouped] of [['hard', true], ['normal', false]]) {
    const players = duo('elysian', 'legion', { level });
    const g = S.createGame({ seed: 5, map: 'crossing', players }), ai = AI.fromRoster(g, players, 5)[0];
    S.step(g, []);
    const rally = AI.rallyPoint(ai, g, AI.view(g, 0, ai.mem));
    const sp = [[-5, -4], [5, -4], [-5, 4], [5, 4], [0, -5], [0, 5]];
    const us = sp.map(([dx, dy]) => S.spawn(g, 0, 'oathblade', rally.x + dx * TF, rally.y + dy * TF));
    ai.st.calm = 1e9; // 공격 개시 안 함
    let moved = false;
    for (let t = 0; t < 600; t++) { const cmds = AI.collect(g, [ai], []); if (cmds.some(c => c.type === 'move' && c.ids.some(id => us.some(u => u.id === id)))) moved = true; S.step(g, cmds); }
    const avg = us.reduce((s, e) => s + us.filter(o => o !== e && (o.x - e.x) ** 2 + (o.y - e.y) ** 2 <= 16 * TF * TF).length, 0) / us.length;
    if (grouped) assert(avg >= 2, 'hard avg ' + avg); else assert(!moved, 'normal은 move 명령 없음');
  }
});

// 수송 견제(raid): 수송선 + 지상 10기, 기억한 적 본진(채집 중 일꾼 4기, 정지 상대) — 내려서 일꾼을 잡고 돌아온다. 쉬움·raid 없는 성향은 안 함
test('수송 견제: 어려움 legion.air·elysian.ground — load→fly→fight, 적 일꾼 피해, 쉬움은 안 함', () => {
  const scene = (race, pers, level) => {
    const players = duo(race, 'legion', { level, pers }), g = S.createGame({ seed: 5, map: 'crossing', players }), ai = AI.fromRoster(g, players, 5)[0];
    const home = g.ents.find(e => e.owner === 0 && e.isB), base = g.ents.find(e => e.owner === 1 && e.isB && e.def.dropoff);
    S.spawn(g, 0, { legion: 'ferry', elysian: 'skiff' }[race], home.x + 4 * TF, home.y + 4 * TF);
    for (let i = 0; i < 10; i++) S.spawn(g, 0, { legion: 'trooper', elysian: 'oathblade' }[race], home.x + (3 + (i % 5)) * TF, home.y + (6 + (i / 5 | 0)) * TF);
    ai.mem.bld.set(base.id, { id: base.id, type: base.type, owner: 1, tx: base.tx, ty: base.ty, w: base.def.w, h: base.def.h, x: base.x, y: base.y, seen: 0, done: true });
    const cr = g.ents.filter(e => e.type === 'crystal').sort((a, b) => ((a.x - base.x) ** 2 + (a.y - base.y) ** 2) - ((b.x - base.x) ** 2 + (b.y - base.y) ** 2) || a.id - b.id)[0];
    S.step(g, [{ type: 'gather', ids: ownOf(g, 1, e => e.def.worker).map(e => e.id), target: cr.id, player: 1 }]);
    g.tick = 7000;
    const phases = new Set(), w0 = ownOf(g, 1, e => e.def.worker).length;
    for (let t = 0; t < 3000; t++) { S.step(g, AI.collect(g, [ai], [])); if (ai.st.raid) phases.add(ai.st.raid.ph); }
    return { phases, n: ai.st.raid ? ai.st.raid.n : 0, lost: w0 - ownOf(g, 1, e => e.def.worker && e.hp > 0).length };
  };
  for (const [race, pers] of [['legion', 'air'], ['elysian', 'ground']]) {
    const r = scene(race, pers, 'hard');
    assert(r.n >= 1 && ['load', 'fly', 'fight'].every(x => r.phases.has(x)), `${race}.${pers} ${[...r.phases]}`);
    assert(r.lost >= 1, `${race}.${pers} 일꾼 피해 ${r.lost}`);
  }
  assert.strictEqual(scene('legion', 'air', 'easy').n, 0, '쉬움');
  assert.strictEqual(scene('legion', 'mech', 'hard').n, 0, 'raid 없는 성향');
});

// 쉬움(2026-10-16 플레이 테스터 피드백 → 입문 수준으로 한 단계 더): 러시 성향 없음, 11400틱(9분 30초) 전 공격 개시 없음, 병력 가치 시간 상한 분당 90
test('쉬움: 러시 성향을 고르지 않고, 11400틱 전엔 공격하지 않으며, 병력이 분당 90 상한을 크게 넘지 않는다', () => {
  for (const race of ['legion', 'swarm', 'elysian']) for (let seed = 0; seed < 12; seed++) {
    const players = duo(race, 'legion', { level: 'easy' }), g = S.createGame({ seed, map: 'crossing', players });
    const ai = AI.fromRoster(g, players, seed)[0];
    assert(!AI.PERS[race][ai.pers].rush, `${race} seed ${seed} ${ai.pers}`);
  }
  for (const race of ['legion', 'swarm', 'elysian']) {
    let attackAt = -1, over = 0;
    run({ players: duo(race, 'legion', { level: 'easy' }), seed: 3, ticks: 13200, onTick: (g, ais) => {
      if (attackAt < 0 && ais[0].st.mode === 'attack') attackAt = g.tick;
      if (g.tick % 1200 === 0 && g.tick >= 7200) {
        const val = ownOf(g, 0, e => !e.isB && !e.def.worker).reduce((a, e) => a + (e.def.cost.crystal || 0) + (e.def.cost.nebula || 0), 0);
        over = Math.max(over, val - (g.tick / 1200) * 90 * 1.25);
      }
    } });
    assert(attackAt < 0 || attackAt >= 11400, `${race} attack ${attackAt}`);
    assert(over <= 900, `${race} over ${over}`); // 빌드 'u' 단계·한 판단 몫 초과 허용
  }
});

for (const [name, fn] of tests) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) continue;
  const t0 = Date.now();
  try { fn(); console.log('ok  ', name, `(${Date.now() - t0}ms)`); } catch (e) { fail++; console.log('FAIL', name, '\n  ', e.message); }
}
console.log(fail ? `${fail} failed` : 'all passed');
process.exit(fail ? 1 : 0);
