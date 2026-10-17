// node nebula-war/test/ai-long.test.js  (ONLY=<이름 일부>로 골라 실행)
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
  const casts = players.map(() => ({})); // 플레이어별 시전 이벤트(t: 'cast') 능력 id → 횟수
  for (let t = 0; t < ticks && g.winner === -1; t++) {
    const cmds = AI.collect(g, ais, []);
    if (cmds.length) { log.push([g.tick, JSON.parse(JSON.stringify(cmds))]); issued += cmds.length; valid += validCount(g, cmds); for (const c of cmds) if (c.type === 'cast') { castIssued++; castValid += validCount(g, [c]); } }
    const own = new Map(g.ents.map(e => [e.id, e.owner])); // 시전 틱에 죽은 시전자도 주인을 알도록 step 전에
    for (const e of S.step(g, cmds)) if (e.t === 'cast' && own.get(e.id) >= 0) { const c = casts[own.get(e.id)]; c[e.what] = (c[e.what] || 0) + 1; }
    if (onTick) onTick(g, ais);
    if (until && until(g)) break;
  }
  return { g, ais, log, issued, valid, castIssued, castValid, casts };
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
      good = !!e && !!A && (A.target !== 'unit' || (!!t && t.hp > 0 && (!S.castTarget || S.castTarget(g, e, A, t))));
    } else if (c.type === 'autocast') good = (c.ids || []).some(id => { const e = own(id); return e && (e.def.abilities || []).includes(c.what); });
    else if (c.type === 'hold') good = (c.ids || []).some(own);
    else good = (c.ids || []).some(own);
    if (good) ok++;
  }
  return ok;
}
const ownOf = (g, p, pred) => g.ents.filter(e => e.owner === p && pred(e));
const tiles = e => [Math.floor(e.x / TF), Math.floor(e.y / TF)];

// 보통 AI가 정지 상대를 18000틱(15분) 안에 이긴다 — 모든 종족 × 2인·4인 맵
for (const map of ['crossing', 'gate', 'fortress']) for (const race of ['legion', 'swarm', 'elysian']) {
  test(`격파: 보통 ${race} vs 정지 — ${map}`, () => {
    const slots = map === 'fortress' ? [0, 2] : [0, 1];
    const r = run({ map, players: duo(race, 'elysian', { level: 'normal' }, null, slots), seed: 11, ticks: 18000 });
    assert.strictEqual(r.g.winner, 0, `${race} ${map} tick ${r.g.tick}`);
    assert(r.valid >= r.issued * 0.95, `valid ${r.valid}/${r.issued}`);
  });
}

for (const race of ['legion', 'swarm', 'elysian']) for (const pers of Object.keys(AI.PERS[race])) {
  test(`성향 격파: 보통 ${race}.${pers} vs 정지 — crossing`, () => {
    const r = run({ players: duo(race, 'legion', { level: 'normal', pers }), seed: 21, ticks: 18000 });
    assert.strictEqual(r.g.winner, 0, `${race}.${pers} tick ${r.g.tick}`);
  });
}
for (const level of ['easy', 'hard']) test(`격파: ${level} legion vs 정지 — crossing`, () => {
  const r = run({ players: duo('legion', 'swarm', { level }), seed: 31, ticks: level === 'easy' ? 27000 : 18000 });
  assert.strictEqual(r.g.winner, 0, `${level} tick ${r.g.tick}`);
});

test('팀전: 2:2 AI 게임이 끝나고 승자 결정 — fortress', () => {
  const players = [0, 1, 2, 3].map(i => ({ race: ['legion', 'swarm', 'elysian', 'legion'][i], team: i % 2, slot: i, color: i, ai: { level: 'normal' } }));
  const r = run({ map: 'fortress', players, seed: 41, ticks: 54000 });
  assert(r.g.winner === 0 || r.g.winner === 1, `winner ${r.g.winner} tick ${r.g.tick}`);
  console.log(`     2:2 winner team ${r.g.winner} @${r.g.tick}`);
});
test('개인전: 4인 AI 게임이 끝난다 — expanse', () => {
  const players = [0, 1, 2, 3].map(i => ({ race: ['legion', 'swarm', 'elysian', 'swarm'][i], team: i, slot: i, color: i, ai: { level: 'hard' } }));
  const r = run({ map: 'expanse', players, seed: 43, ticks: 54000 });
  assert(r.g.winner >= 0, `winner ${r.g.winner} tick ${r.g.tick}`);
  console.log(`     FFA winner ${r.g.winner} @${r.g.tick}`);
});

// 난이도 순서: 같은 종족 거울전, 시드 10개, 36000틱(30분) 제한 — 시간 초과는 승리 아님
function series(strong, weak, n = 10, a = { level: strong }, b = { level: weak }) {
  let wins = 0;
  for (let k = 0; k < n; k++) {
    const race = ['legion', 'swarm', 'elysian'][k % 3], swap = k % 2 === 1; // 자리·플레이어 번호 치우침 제거
    const players = swap ? duo(race, race, b, a) : duo(race, race, a, b);
    const r = run({ map: k < 5 ? 'crossing' : 'gate', players, seed: 100 + k, ticks: 36000 });
    if (r.g.winner === (swap ? 1 : 0)) wins++;
    console.log(`     ${strong} vs ${weak} #${k} ${race} ${r.ais.map(x => x.level + '.' + x.pers).join(' ')} → winner ${r.g.winner} @${r.g.tick}`);
  }
  return wins;
}
test('난이도: 어려움 vs 쉬움 10판 중 8승 이상', () => { const w = series('hard', 'easy'); assert(w >= 8, `${w}/10`); });
test('난이도: 보통 vs 쉬움 10판 중 6승 이상', () => { const w = series('normal', 'easy'); assert(w >= 6, `${w}/10`); });
test('난이도: 어려움 vs 보통 10판 중 6승 이상', () => { const w = series('hard', 'normal'); assert(w >= 6, `${w}/10`); });

// ── 마법(Task 10) ──
test('마법 효과: 어려움(마법 켬) vs 어려움(cast 0) 거울 12판(종족당 4) 중 7승 이상', () => {
  const w = series('hard', 'hard', 12, { level: 'hard' }, { level: 'hard', cast: 0 });
  assert(w >= 7, `${w}/12`);
});
// 시전 통계: 같은 시드 거울전 6판(종족당 2)을 난이도별로. 판당 시전 = 두 AI의 시전 이벤트 합.
// 판당 시전 수에서는 자동 시전 능력(치료 heal)을 뺀다 — sim 기본값으로 켜져 있어 AI 판단과 무관하고, 반복 시전이라 틱마다 이벤트가 난다
// (서로 다른 능력 id 집계에는 포함). 성향은 고정: 종족마다 두 판에 세 성향이 모두 나오게(판 0 = 성향 0 vs 1, 판 1 = 성향 2 vs 1)
const CAST_SEEDS = [300, 301, 302, 303, 304, 305];
function castSeries(level) {
  const byRace = { legion: {}, swarm: {}, elysian: {} }, perGame = [];
  let issued = 0, valid = 0, castIssued = 0, castValid = 0;
  CAST_SEEDS.forEach((seed, k) => {
    const race = ['legion', 'swarm', 'elysian'][k % 3], ps = Object.keys(AI.PERS[race]), [pa, pb] = k < 3 ? [ps[0], ps[1]] : [ps[2], ps[1]];
    const r = run({ map: k < 3 ? 'crossing' : 'gate', players: duo(race, race, { level, pers: pa }, { level, pers: pb }), seed, ticks: 36000 });
    let n = 0;
    for (const c of r.casts) for (const id in c) { byRace[race][id] = (byRace[race][id] || 0) + c[id]; if (!S.D.abilities[id].autocast) n += c[id]; }
    perGame.push(n); issued += r.issued; valid += r.valid; castIssued += r.castIssued; castValid += r.castValid;
    console.log(`     ${level} cast #${k} ${race} ${r.ais.map(x => x.pers).join(' ')} → winner ${r.g.winner} @${r.g.tick} casts ${n} ${JSON.stringify(r.casts)}`);
  });
  return { byRace, perGame, total: perGame.reduce((a, b) => a + b, 0), issued, valid, castIssued, castValid };
}
let castStats = null;
const castStatsOnce = () => castStats || (castStats = { easy: castSeries('easy'), normal: castSeries('normal'), hard: castSeries('hard') });
test('시전 통계: 어려움 거울 6판 — 종족마다 서로 다른 능력 3개 이상, 판당 시전 평균 8회 이상', () => {
  const h = castStatsOnce().hard;
  for (const race in h.byRace) assert(Object.keys(h.byRace[race]).length >= 3, `${race} ${JSON.stringify(h.byRace[race])}`);
  assert(h.total >= 8 * h.perGame.length, `avg ${h.total / h.perGame.length} ${h.perGame}`);
});
test('시전 통계: 같은 시드에서 쉬움 시전 ≤ 보통의 1/3, 보통 < 어려움', () => {
  const s = castStatsOnce();
  console.log(`     casts easy ${s.easy.total} normal ${s.normal.total} hard ${s.hard.total}`);
  assert(s.easy.total * 3 <= s.normal.total, `easy ${s.easy.total} normal ${s.normal.total}`);
  assert(s.normal.total < s.hard.total, `normal ${s.normal.total} hard ${s.hard.total}`);
});
test('시전 통계: 명령 유효율 전체 95% 이상, 시전 명령 90% 이상', () => {
  const s = castStatsOnce();
  let issued = 0, valid = 0, ci = 0, cv = 0;
  for (const k in s) { issued += s[k].issued; valid += s[k].valid; ci += s[k].castIssued; cv += s[k].castValid; }
  console.log(`     valid ${valid}/${issued} cast ${cv}/${ci}`);
  assert(valid >= issued * 0.95, `valid ${valid}/${issued}`);
  assert(cv >= ci * 0.9, `cast valid ${cv}/${ci}`);
});

for (const [name, fn] of tests) {
  if (process.env.ONLY && !name.includes(process.env.ONLY)) continue;
  const t0 = Date.now();
  try { fn(); console.log('ok  ', name, `(${Date.now() - t0}ms)`); } catch (e) { fail++; console.log('FAIL', name, '\n  ', e.message); }
}
console.log(fail ? `${fail} failed` : 'all passed');
process.exit(fail ? 1 : 0);
