const test = require('node:test');
const assert = require('node:assert');
const C = require('../content/index.js');
const SIM = require('../engine/sim.js');
const ENT = require('../engine/entities.js');
const BEH = require('../engine/behaviors.js');
const META = require('../engine/meta.js');
const SAVE = require('../engine/save.js');

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } }; };
const fresh = () => SAVE.loadMeta(mem());
const H = {
  ...C.heroes,
  t_boss: { name: 'b', start: 'bell', bossDmgMul: 1.3 },
  t_ghost: { name: 'g', start: 'bell', ghostDmgMul: 1.35 },
  t_fast: { name: 'f', start: 'bell', speedMul: 1.15 },
  t_rev: { name: 'r', start: 'bell', revive: 1 },
  t_area: { name: 'a', start: 'red_bean', areaMul: 1.2 },
  t_bite: { name: 'p', start: 'red_bean', blockDps: 10 },
};
const C2 = { ...C, heroes: H };
// 입문: 변이 RNG가 없고 적 체력 배수 1
const mk = (heroId, o = {}) => SIM.create(C2, { seed: 5, heroId, chapterId: 'tutorial', runId: 'r', ...o });
const bellDmg = C.talismans.bell.levels[0].dmg;

test('영웅 bossDmgMul: 보스에게만 배수', () => {
  const s = mk('t_boss');
  s.slots = [{ id: 'bell', lv: 1, cd: 0 }];
  const boss = ENT.spawnEnemy(s, C2, 'one_eye', 40, 0), mob = ENT.spawnEnemy(s, C2, 'little_dokkaebi', -40, 0);
  const hb = boss.hp, hm = mob.hp;
  SIM.step(s, C2, {}, 1 / 60);
  assert.ok(Math.abs((hb - boss.hp) - bellDmg * 1.3) < 1e-6, `${hb - boss.hp}`);
  assert.ok(Math.abs((hm - mob.hp) - bellDmg) < 1e-6, `${hm - mob.hp}`);
});

test('영웅 ghostDmgMul: 귀신에게만 배수', () => {
  const s = mk('t_ghost');
  s.slots = [{ id: 'bell', lv: 1, cd: 0 }];
  const g = ENT.spawnEnemy(s, C2, 'japgwi', 40, 0), mob = ENT.spawnEnemy(s, C2, 'little_dokkaebi', -40, 0);
  g.hp = g.maxHp = 1000; mob.hp = mob.maxHp = 1000;
  SIM.step(s, C2, {}, 1 / 60);
  assert.ok(Math.abs((1000 - g.hp) - bellDmg * 1.35) < 1e-6, `${1000 - g.hp}`);
  assert.ok(Math.abs((1000 - mob.hp) - bellDmg) < 1e-6, `${1000 - mob.hp}`);
});

test('영웅 speedMul: 플레이어 이동 속도 배수', () => {
  const a = mk('t_fast'), b = mk('yeonhwa');
  a.slots = []; b.slots = [];
  SIM.step(a, C2, { mx: 1, my: 0 }, 0.1);
  SIM.step(b, C2, { mx: 1, my: 0 }, 0.1);
  assert.ok(Math.abs(a.player.x / b.player.x - 1.15) < 1e-9, `${a.player.x} / ${b.player.x}`);
});

test('부활: 영웅 revive + 무당집 revive = 2번, 세 번째 쓰러지면 끝', () => {
  const s = mk('t_rev', { perks: { revive: 1 } });
  assert.strictEqual(s.perks.revive, 2);
  s.slots = [];
  for (let i = 1; i <= 2; i++) {
    s.player.hp = -1; s.player.invuln = 0;
    SIM.step(s, C2, {}, 1 / 60);
    assert.strictEqual(s.over, null, `부활 ${i}`);
    assert.strictEqual(s.revives, i);
  }
  assert.strictEqual(s.revived, true);
  s.player.hp = -1; s.player.invuln = 0;
  SIM.step(s, C2, {}, 1 / 60);
  assert.ok(s.over && !s.over.win);
});

test('부활: 영웅 revive만으로도 한 번, 합계는 rules.revive.max에서 잘린다', () => {
  const one = mk('t_rev');
  assert.strictEqual(one.perks.revive, 1);
  const H3 = { ...H, t_rev3: { name: 'x', start: 'bell', revive: 3 } };
  const capped = SIM.create({ ...C2, heroes: H3 }, { seed: 5, heroId: 't_rev3', chapterId: 'tutorial', runId: 'r', perks: { revive: 1 } });
  assert.strictEqual(C.rules.revive.max, 2);
  assert.strictEqual(capped.perks.revive, 2);
});

test('영웅 areaMul: 장판·흔적·오라 반지름(r, blast)에만 곱한다', () => {
  const base = id => BEH.partsOf(C, { id, lv: 1 }).parts[0], big = id => BEH.partsOf(C, { id, lv: 1 }, 1.2).parts[0];
  assert.ok(Math.abs(big('red_bean').r - base('red_bean').r * 1.2) < 1e-9);
  assert.ok(Math.abs(big('peach_branch').r - base('peach_branch').r * 1.2) < 1e-9);
  assert.ok(Math.abs(big('bean_bell_trap').blast - base('bean_bell_trap').blast * 1.2) < 1e-9);
  assert.strictEqual(big('bell').r, base('bell').r); // 충격파는 그대로
  assert.strictEqual(big('fox_fire').r, base('fox_fire').r); // 궤도도 그대로
  assert.deepStrictEqual(BEH.AREA_KINDS, ['zone', 'trail', 'aura']);
  const s = mk('t_area');
  SIM.step(s, C2, {}, 1 / 60);
  const z = s.zones.find(q => q.owner === 'red_bean');
  assert.ok(z && Math.abs(z.r - base('red_bean').r * 1.2) < 1e-9, JSON.stringify(z));
});

test('영웅 blockDps: 막는 장판(팥 결계)에 닿은 적에게만 피해, 다른 영웅의 팥 주머니는 그대로', () => {
  const run = heroId => {
    const s = mk(heroId);
    s.slots = [{ id: 'red_bean', lv: 1, cd: 0 }];
    const e = ENT.spawnEnemy(s, C2, 'little_dokkaebi', 20, 0), far = ENT.spawnEnemy(s, C2, 'little_dokkaebi', 400, 0);
    e.hp = e.maxHp = far.hp = far.maxHp = 1000;
    SIM.step(s, C2, {}, 1 / 60); // 1틱째: 장판을 깔고 바로 닿은 적을 밀어낸다
    SIM.step(s, C2, {}, 1 / 60);
    return { s, e, far };
  };
  const bite = run('t_bite'), plain = run('t_area');
  assert.ok(bite.s.zones.some(z => z.kind === 'block'));
  assert.ok(bite.e.hp < 1000 && 1000 - bite.e.hp <= 10 * 2 / 60 + 1e-9, `${1000 - bite.e.hp}`);
  assert.ok(bite.s.stats.damageBy.red_bean > 0); // 팥 주머니의 몫으로 센다(처치·경험치도 팥 주머니로)
  assert.strictEqual(bite.far.hp, 1000);
  assert.strictEqual(plain.e.hp, 1000);
  assert.strictEqual(C.heroes.parkssi.blockDps > 0, true);
  assert.deepStrictEqual(Object.keys(C.heroes).filter(id => C.heroes[id].blockDps), ['parkssi']);
});

test('밸런스 도구: 해금 영웅은 초보 기준(입문 초보 이동·합체 없이 중간 보스) 제외 — unlock 유무로만 정한다', () => {
  const { noviceBands } = require('./balance.js');
  assert.deepStrictEqual(Object.keys(C.heroes).filter(id => noviceBands(C.heroes[id])), ['yeonhwa']);
  assert.strictEqual(noviceBands({ name: 'x', start: 'bell' }), true);
  assert.strictEqual(noviceBands({ name: 'x', start: 'bell', unlock: { stat: 'runs', n: 1 } }), false);
});

test('SIM.result: 보스·귀신 처치 수', () => {
  const s = mk('yeonhwa');
  s.slots = [];
  const b = ENT.spawnEnemy(s, C2, 'one_eye', 400, 0), g = ENT.spawnEnemy(s, C2, 'japgwi', -400, 0);
  b.dead = 1; g.dead = 1;
  SIM.step(s, C2, {}, 1 / 60);
  const r = SIM.result(s, C2);
  assert.deepStrictEqual([r.bossKills, r.ghostKills], [1, 1]);
});

test('해금 { stat, n }: 누적 기록으로 열리고, 문구는 lockText + 진행도', () => {
  const C3 = { ...C, heroes: { ...C.heroes, t_lock: { name: 'l', start: 'bell', unlock: { stat: 'bossKills', n: 20 }, lockText: '보스 20마리 처치' } } };
  const m = fresh();
  assert.strictEqual(META.heroUnlocked(C3, m, 't_lock'), false);
  assert.strictEqual(META.heroLockReason(C3, m, 't_lock'), '보스 20마리 처치 (0/20)');
  m.stats.bossKills = 20;
  assert.strictEqual(META.heroUnlocked(C3, m, 't_lock'), true);
  assert.strictEqual(META.heroLockReason(C3, m, 't_lock'), '');
});

test('결과 기록: 보스·귀신·합체 누적, 새로 열린 영웅을 알린다', () => {
  const C3 = { ...C, heroes: { ...C.heroes, t_lock: { name: 'l', start: 'bell', unlock: { stat: 'ghostKills', n: 5 }, lockText: '귀신 5마리 처치' } } };
  const m = fresh();
  const res = { runId: 'x', win: false, chapterId: 'fox_forest', heroId: 'yeonhwa', killed: [], obtained: [], fusions: ['peach_ward', 'storm_array'], eliteKills: 0, bossKills: 1, ghostKills: 6, curses: [] };
  const out = META.record(C3, m, res);
  assert.deepStrictEqual([m.stats.bossKills, m.stats.ghostKills, m.stats.fusions], [1, 6, 2]);
  assert.ok(out.newHeroes.includes('t_lock'));
  const again = META.record(C3, m, { ...res, runId: 'y' });
  assert.ok(!again.newHeroes.includes('t_lock'));
});

test('옛 저장(새 통계 키 없음): 0으로 채우고 기존 해금은 그대로', () => {
  const s = mem();
  s.setItem('bujeok.meta', JSON.stringify({ schemaVersion: 1, contentVersion: 13, data: { coins: 5, discovered: {}, grantedRuns: [], tutorialDone: true, cleared: { tutorial: true, dokkaebi_pass: true }, village: {}, stats: { runs: 4, eliteKills: 60 }, killed: {}, obtained: {}, titles: [], lastHero: 'beomi', lastCurses: {} } }));
  const m = SAVE.loadMeta(s);
  assert.deepStrictEqual(m.stats, { runs: 4, eliteKills: 60, bossKills: 0, ghostKills: 0, fusions: 0 });
  for (const id of ['yeonhwa', 'jeonwoochi', 'beomi']) assert.ok(META.heroUnlocked(C, m, id), id);
});

test('콘텐츠 검사: 모르는 영웅 키, 모르는 통계, lockText 누락, 부활 상한 초과', () => {
  const bad = { ...C, heroes: { ...C.heroes,
    x1: { name: 'a', start: 'bell', speedMull: 1.1 },
    x2: { name: 'b', start: 'bell', unlock: { stat: 'nope', n: 3 }, lockText: 'x' },
    x3: { name: 'c', start: 'bell', unlock: { stat: 'runs', n: 3 } },
    x4: { name: 'd', start: 'bell', revive: 3 },
    x5: { name: 'e', start: 'bell', unlock: { stat: 'runs', n: 0 }, lockText: 'x' },
  } };
  const errs = C.validate(bad);
  for (const k of ['x1', 'x2', 'x3', 'x4', 'x5']) assert.ok(errs.some(e => e.includes('hero ' + k)), k + ': ' + errs.join(' | '));
  assert.deepStrictEqual(C.validate(C), []);
});

const ART = require('../art/index.js');
const TEXT = require('../ui/text.js');
const NEW = ['bari', 'gangrim', 'hong', 'cheoyong', 'parkssi'];

test('영웅 8명: 순서, 시작 부적이 전부 다르고 모두 기본 부적', () => {
  const ids = Object.keys(C.heroes);
  assert.deepStrictEqual(ids, ['yeonhwa', 'jeonwoochi', 'beomi', ...NEW]);
  const starts = ids.map(id => C.heroes[id].start);
  assert.strictEqual(new Set(starts).size, 8);
  for (const s of starts) assert.ok(C.talismans[s] && !C.talismans[s].fusion, s);
  assert.deepStrictEqual(NEW.map(id => C.heroes[id].start), ['peach_branch', 'chain_lightning', 'whirlwind', 'fox_fire', 'red_bean']);
});

test('새 영웅 특성(스펙 1절)', () => {
  const h = C.heroes;
  assert.deepStrictEqual([h.bari.revive, h.bari.hpMul], [1, undefined]); // 밸런스: 체력 -10%면 2챕터 갈래 차이 미달
  assert.deepStrictEqual([h.gangrim.bossDmgMul, h.gangrim.magnetMul], [1.5, 1.3]); // 밸런스: 1.3이면 최종 보스 폭주에 화룡풍 갈래가 진다
  assert.deepStrictEqual([h.hong.speedMul, h.hong.cdMul, h.hong.hpMul], [1.15, 0.9, 1.05]); // 밸런스 조정값
  assert.deepStrictEqual([h.cheoyong.ghostDmgMul, h.cheoyong.rerolls, h.cheoyong.hpMul], [1.35, 1, 1.35]); // 밸런스: 체력 보정 없으면 초반 사망으로 합체 판 미달
  assert.deepStrictEqual([h.parkssi.areaMul, h.parkssi.hpMul, h.parkssi.blockDps], [1.2, 1.1, 10]);
});

test('새 영웅 해금 조건(사용자 결정: 다양한 기록 조건)', () => {
  assert.deepStrictEqual(C.heroes.bari.unlock, { cleared: 'fox_forest' });
  assert.deepStrictEqual(C.heroes.gangrim.unlock, { stat: 'bossKills', n: 20 });
  assert.deepStrictEqual(C.heroes.hong.unlock, { stat: 'runs', n: 15 });
  assert.deepStrictEqual(C.heroes.cheoyong.unlock, { stat: 'ghostKills', n: 1000 });
  assert.deepStrictEqual(C.heroes.parkssi.unlock, { stat: 'fusions', n: 30 });
});

test('바리공주 + 무당집 3단계 = 판마다 부활 2번', () => {
  const perks = META.perks(C, { village: { shrine: 3 } });
  assert.strictEqual(perks.revive, 1);
  const s = SIM.create(C, { seed: 3, heroId: 'bari', chapterId: 'tutorial', runId: 'b', perks });
  assert.strictEqual(s.perks.revive, 2);
});

test('출정 카드: 새 영웅은 처음에 잠겨 있고 이유가 보인다', () => {
  const cards = Object.fromEntries(TEXT.heroCards(C, fresh()).map(c => [c.id, c]));
  for (const id of NEW) assert.strictEqual(cards[id].unlocked, false, id);
  assert.strictEqual(cards.bari.reason, '「여우 대숲」 클리어 시 열려요');
  assert.strictEqual(cards.gangrim.reason, '보스 20마리 처치 (0/20)');
  assert.strictEqual(cards.hong.reason, '판 15번 플레이 (0/15)');
  assert.strictEqual(cards.cheoyong.reason, '귀신 1000마리 처치 (0/1000)');
  assert.strictEqual(cards.parkssi.reason, '합체 30번 (0/30)');
});

test('옛 저장으로 새 영웅은 잠긴 채, 기존 해금은 그대로', () => {
  const s = mem();
  s.setItem('bujeok.meta', JSON.stringify({ schemaVersion: 1, contentVersion: 13, data: { coins: 0, discovered: {}, grantedRuns: [], tutorialDone: true, cleared: { tutorial: true, dokkaebi_pass: true }, village: {}, stats: { runs: 4, eliteKills: 60 }, killed: {}, obtained: {}, titles: [], lastHero: 'beomi', lastCurses: {} } }));
  const m = SAVE.loadMeta(s);
  for (const id of ['yeonhwa', 'jeonwoochi', 'beomi']) assert.ok(META.heroUnlocked(C, m, id), id);
  for (const id of NEW) assert.ok(!META.heroUnlocked(C, m, id), id);
});

test('새 영웅 그림: 32×32, 걷기 2프레임', () => {
  for (const id of NEW) {
    const s = ART.sprites['h:' + id];
    assert.ok(s, id);
    assert.strictEqual(s.frames.length, 2, id);
    for (const f of s.frames) { assert.strictEqual(f.length, 32, id); for (const row of f) assert.strictEqual(row.length, 32, id); }
  }
  assert.deepStrictEqual(ART.check(ART), []);
});
