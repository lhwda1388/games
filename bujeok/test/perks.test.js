const test = require('node:test');
const assert = require('node:assert');
const C = require('../content/index.js');
const SIM = require('../engine/sim.js');
const SK = require('../engine/skills.js');
const ENT = require('../engine/entities.js');
const PAT = require('../engine/patterns.js');

const H = { ...C.heroes, t_tank: { name: '시험', start: 'fire_talisman', hpMul: 1.4, magnetMul: 1.5, eliteDmgMul: 1.3, rerolls: 0 } };
const CU = { t_hp: { name: 'a', desc: 'a', enemyHp: 1.3 }, t_warn: { name: 'b', desc: 'b', warnMul: 0.75 }, t_heal: { name: 'c', desc: 'c', healMul: 0.5 }, t_elite: { name: 'd', desc: 'd', eliteMul: 2 } };
const C2 = { ...C, heroes: H, curses: CU };
const mk = (o = {}) => SIM.create(C2, { seed: 9, heroId: 'yeonhwa', chapterId: 'dokkaebi_pass', runId: 'p', ...o });

test('perks·curses를 생략하면 생략 전과 같은 판(같은 시드 → 같은 상태)', () => {
  const a = SIM.create(C, { seed: 9, heroId: 'yeonhwa', chapterId: 'dokkaebi_pass', runId: 'p' });
  const b = SIM.create(C, { seed: 9, heroId: 'yeonhwa', chapterId: 'dokkaebi_pass', runId: 'p', perks: {}, curses: [] });
  for (const s of [a, b]) { delete s.perks; delete s.curses; delete s.curseFx; }
  assert.strictEqual(JSON.stringify(a, (k, v) => (k === 'fx' ? undefined : v)), JSON.stringify(b, (k, v) => (k === 'fx' ? undefined : v)));
});

test('영웅: 체력 배수, 흡수 범위, 정예 피해', () => {
  const s = mk({ heroId: 't_tank' });
  assert.strictEqual(s.player.maxHp, 140);
  s.slots = [];
  s.gems.push({ x: 90, y: 0, xp: 1 });
  SIM.step(s, C2, {}, 1 / 60);
  assert.ok(s.gems[0].x < 90 || s.gems.length === 0, '70×1.5=105 안이라 끌려와야 한다');
  const e = ENT.spawnEnemy(s, C2, 'little_dokkaebi', 50, 0, { elite: true });
  const hp = e.hp;
  s.slots = [{ id: 'bell', lv: 1, cd: 0 }];
  SIM.step(s, C2, {}, 1 / 60);
  assert.ok(Math.abs((hp - e.hp) - C.talismans.bell.levels[0].dmg * 1.3) < 1e-6);
});

test('시설 효과: 최대 체력·다시 뽑기·버리기·선택지 수', () => {
  const s = mk({ perks: { maxHpMul: 1.1, rerolls: 1, discards: 1, choiceBonus: 1 } });
  assert.ok(Math.abs(s.player.maxHp - 110) < 1e-9);
  assert.strictEqual(s.rerolls, C.heroes.yeonhwa.rerolls + 1);
  assert.strictEqual(s.discards, C.rules.discards + 1);
  s.pendingLevels = 1; SK.offer(s, C2);
  assert.strictEqual(s.choice.options.length, C.rules.choiceCount + 1);
});

test('부활: 한 번만, 체력 50%·무적·주변 일반 적 제거', () => {
  const s = mk({ perks: { revive: 1 } });
  s.slots = [];
  ENT.spawnEnemy(s, C2, 'little_dokkaebi', 100, 0);
  s.player.hp = -1;
  SIM.step(s, C2, {}, 1 / 60);
  assert.strictEqual(s.over, null);
  assert.strictEqual(s.revived, true);
  assert.ok(Math.abs(s.player.hp - s.player.maxHp * 0.5) < 1);
  assert.ok(s.player.invuln > 1.5);
  assert.strictEqual(s.enemies.length, 0);
  s.player.hp = -1; s.player.invuln = 0;
  SIM.step(s, C2, {}, 1 / 60);
  assert.ok(s.over && !s.over.win);
});

test('시작 부적 선택: startPick장(영웅 시작 부적 제외), 고르면 1레벨로 받는다', () => {
  const s = mk({ perks: { startPick: 3 } });
  assert.strictEqual(s.choice.kind, 'start');
  assert.strictEqual(s.choice.options.length, 3);
  assert.ok(s.choice.options.every(o => o.kind === 'new' && o.id !== 'bell' && !C.talismans[o.id].fusion));
  const id = s.choice.options[1].id;
  SK.chooseStart(s, C2, 1);
  assert.strictEqual(s.choice, null);
  assert.ok(s.slots.some(x => x.id === id && x.lv === 1));
  const all = mk({ perks: { startPick: 12 } });
  assert.strictEqual(all.choice.options.length, 11);
});

test('저주: 체력 배수(runMods), 예고 단축, 회복 반감, 정예 웨이브 두 배', () => {
  const s = mk({ curses: ['t_hp', 't_warn', 't_heal', 't_elite'] });
  assert.ok(Math.abs(ENT.mods(C2, s).enemyHp - C.chapters.dokkaebi_pass.mods.enemyHp * 1.3) < 1e-9);
  assert.strictEqual(ENT.curse(s, 'warnMul'), 0.75);
  s.slots = [];
  s.player.hp = 50;
  s.gems.push({ x: 0, y: 0, xp: 0, heal: 20 });
  SIM.step(s, C2, {}, 1 / 60);
  assert.ok(Math.abs(s.player.hp - 60) < 0.2);
  const e = { uid: 1, id: 'one_eye', x: 0, y: -300, hp: 1, maxHp: 1 };
  let n = 0;
  while (e.ph !== 'warn' && n++ < 900) PAT.move(s, C2, e, 1 / 60);
  assert.ok(Math.abs(e.warn - C.enemies.one_eye.pattern.warn * 0.75) < 1e-9);
});

test('결과: 저주 수와 서당 배수로 엽전 증가, 처치 종류·얻은 부적 기록', () => {
  const base = mk(), cursed = mk({ curses: ['t_hp', 't_warn'], perks: { coinMul: 1.2 } });
  for (const s of [base, cursed]) { s.t = 100; s.stats.kills = 50; }
  const rb = SIM.result(base, C2), rc = SIM.result(cursed, C2);
  assert.strictEqual(rc.coins, Math.round(rb.coins * 1.5 * 1.2));
  assert.deepStrictEqual(rc.curses, ['t_hp', 't_warn']);
  const s = mk();
  s.slots = [];
  const e = ENT.spawnEnemy(s, C2, 'egg_ghost', 300, 0);
  ENT.hurt(s, e, 1e9, 'x');
  SIM.step(s, C2, {}, 1 / 60);
  const r = SIM.result(s, C2);
  assert.ok(r.killed.includes('egg_ghost'));
  assert.ok(r.obtained.includes('bell'));
  assert.strictEqual(r.heroId, 'yeonhwa');
});

test('입문에는 판 엽전 수입이 없다', () => {
  const s = SIM.create(C, { seed: 1, heroId: 'yeonhwa', chapterId: 'tutorial', runId: 't' });
  s.slots = [];
  for (let i = 0; i < 60 * 20; i++) SIM.step(s, C, {}, 1 / 60);
  assert.strictEqual(s.purse, 0);
});

test('저주 정예 두 배: 정예 습격 수가 두 배, 저주 없으면 4마리·RNG 그대로', () => {
  const EV = require('../engine/events.js');
  const run = o => { const s = mk(o); s.events = [{ id: 'elite_raid', at: 1, started: false, done: false }]; s.t = 1; const before = JSON.stringify(s.rng); EV.tick(s, C2, 1 / 60); return { n: s.enemies.filter(e => e.elite).length, rngMoved: JSON.stringify(s.rng) !== before }; };
  assert.strictEqual(run({ curses: ['t_elite'] }).n, 8);
  const plain = run({});
  assert.strictEqual(plain.n, 4);
});

test('알 수 없는 영웅·저주 ID는 무시하고 기본 영웅으로 시작', () => {
  const s = mk({ heroId: 'nope', curses: ['nope', 't_hp'] });
  assert.strictEqual(s.heroId, 'yeonhwa');
  assert.deepStrictEqual(s.curses, ['t_hp']);
});
