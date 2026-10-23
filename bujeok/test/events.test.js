const test = require('node:test');
const assert = require('node:assert');
const C = require('../content/index.js');
const SIM = require('../engine/sim.js');
const SK = require('../engine/skills.js');
const EV = require('../engine/events.js');
const ENT = require('../engine/entities.js');

const mk = (chapterId = 'dokkaebi_pass', seed = 3) => SIM.create(C, { seed, heroId: 'yeonhwa', chapterId, runId: 'e' });

test('입문은 사건이 없고, 정규 챕터는 2~3개를 보스 앞뒤 30초와 끝 30초를 피해서 잡는다', () => {
  assert.deepStrictEqual(mk('tutorial').events, []);
  for (let seed = 1; seed <= 20; seed++) {
    const s = mk('dokkaebi_pass', seed), ch = C.chapters.dokkaebi_pass, r = C.rules.events;
    assert.ok(s.events.length >= r.min && s.events.length <= r.max, String(s.events.length));
    assert.strictEqual(new Set(s.events.map(e => e.id)).size, s.events.length);
    for (const e of s.events) {
      assert.ok(e.at >= r.from && e.at <= ch.duration - r.endGap, String(e.at));
      for (const b of ch.bosses) assert.ok(Math.abs(e.at - b.at) >= r.bossGap, `${e.at} vs ${b.at}`);
      assert.ok(ch.events.includes(e.id));
    }
  }
});

test('정예 습격: 시작하면 정예 4마리와 알림', () => {
  const s = mk();
  s.events = [{ id: 'elite_raid', at: 1, started: false, done: false }];
  s.t = 1; EV.tick(s, C, 1 / 60);
  assert.strictEqual(s.enemies.filter(e => e.elite).length, 4);
  assert.ok(s.events[0].done);
  assert.ok(s.fx.notices.some(n => n.includes('정예')));
});

test('도깨비 장터: 1초 서 있으면 장터 선택, 엽전으로 사고 떠난다', () => {
  const s = mk();
  s.events = [{ id: 'market', at: 1, started: false, done: false }];
  s.t = 1; EV.tick(s, C, 1 / 60);
  const site = s.sites[0];
  assert.strictEqual(site.kind, 'market');
  s.player.x = site.x; s.player.y = site.y;
  for (let i = 0; i < 62; i++) { s.t += 1 / 60; EV.tick(s, C, 1 / 60); }
  assert.strictEqual(s.choice.kind, 'market');
  assert.strictEqual(s.choice.offers.length, C.rules.market.offers);
  const o = s.choice.offers[0];
  SK.buy(s, C, 0);
  assert.strictEqual(s.choice.offers.length, C.rules.market.offers);
  s.purse = 100;
  SK.buy(s, C, 0);
  assert.strictEqual(s.purse, 100 - o.price);
  SK.leaveMarket(s, C);
  assert.strictEqual(s.choice, null);
  assert.strictEqual(s.sites.length, 0);
});

test('저주 제단: 1.5초 서 있으면 요괴 피해 ×1.3(판 끝까지), 레벨업 2번, 엽전 10', () => {
  const s = mk();
  s.events = [{ id: 'curse_altar', at: 1, started: false, done: false }];
  s.t = 1; EV.tick(s, C, 1 / 60);
  const site = s.sites[0];
  s.player.x = site.x; s.player.y = site.y;
  for (let i = 0; i < 92; i++) { s.t += 1 / 60; EV.tick(s, C, 1 / 60); }
  assert.ok(Math.abs(ENT.mods(C, s).enemyDmg - C.chapters.dokkaebi_pass.mods.enemyDmg * 1.3) < 1e-9);
  assert.strictEqual(s.pendingLevels, 2);
  assert.strictEqual(s.purse, 10);
});

test('장소에 아무도 오지 않으면 시간이 다해 사라지고 사건이 끝난다', () => {
  const s = mk();
  s.events = [{ id: 'market', at: 1, started: false, done: false }];
  s.t = 1; EV.tick(s, C, 1 / 60);
  s.player.x = 99999;
  for (let i = 0; i < 26 * 60; i++) { s.t += 1 / 60; EV.tick(s, C, 1 / 60); }
  assert.strictEqual(s.sites.length, 0);
  assert.ok(s.events[0].done);
});

test('정예는 엽전 구슬을 떨어뜨리고, 주우면 판 엽전, 결과 엽전에 더해진다', () => {
  const s = mk();
  s.slots = [];
  const e = ENT.spawnEnemy(s, C, 'little_dokkaebi', 300, 0, { elite: true });
  ENT.hurt(s, e, 1e9, 'x');
  SIM.step(s, C, {}, 1 / 60);
  const coin = s.gems.find(g => g.coin);
  assert.strictEqual(coin.coin, C.rules.elite.coin);
  s.player.x = coin.x; s.player.y = coin.y;
  SIM.step(s, C, {}, 1 / 60);
  assert.strictEqual(s.purse, C.rules.elite.coin);
  assert.ok(SIM.result(s, C).coins >= C.rules.elite.coin);
});

test('사건은 중간 보스가 머무는 동안(등장 − 간격 ~ 등장 + bossLeave + 간격)에 잡히지 않는다', () => {
  const r = C.rules.events;
  for (const chId of ['dokkaebi_pass', 'fox_forest']) {
    const ch = C.chapters[chId];
    for (let seed = 1; seed <= 400; seed++) {
      for (const e of mk(chId, seed).events) {
        for (const b of ch.bosses) {
          const after = b.final ? 0 : C.rules.bossLeave;
          assert.ok(!(e.at > b.at - r.bossGap && e.at < b.at + after + r.bossGap), `${chId} seed ${seed}: ${e.id}@${e.at} vs ${b.enemy}@${b.at}`);
        }
      }
    }
  }
});

test('챕터 quietWindows(기믹이 열리는 구간)와 겹치지 않게 잡는다', () => {
  const ch = C.chapters.dokkaebi_pass, q = ch.quietWindows, r = C.rules.events;
  assert.ok(q && q.every > 0);
  for (let seed = 1; seed <= 300; seed++) {
    for (const e of mk('dokkaebi_pass', seed).events) {
      for (let w = q.from; w < ch.duration; w += q.every) assert.ok(!(e.at > w - r.quietPad && e.at < w + q.len), `seed ${seed}: ${e.id}@${e.at} vs ring@${w}`);
    }
  }
});

test('장터: 아무것도 못 사고 떠나면 장소가 남고, 나갔다 다시 1초 서면 또 열린다. 사면 장소가 사라진다', () => {
  const s = mk();
  s.events = [{ id: 'market', at: 1, started: false, done: false }];
  s.t = 1; EV.tick(s, C, 1 / 60);
  const site = s.sites[0], tick = n => { for (let i = 0; i < n; i++) { s.t += 1 / 60; EV.tick(s, C, 1 / 60); } };
  s.player.x = site.x; s.player.y = site.y;
  s.purse = 0;
  tick(62);
  assert.strictEqual(s.choice.kind, 'market');
  SK.leaveMarket(s, C);
  assert.strictEqual(s.sites.length, 1);
  tick(120);
  assert.strictEqual(s.choice, null, '안에 계속 서 있으면 바로 다시 열지 않는다');
  s.player.x = site.x + 999; tick(2);
  s.player.x = site.x; tick(62);
  assert.strictEqual(s.choice.kind, 'market');
  s.purse = 100;
  SK.buy(s, C, 0);
  assert.strictEqual(s.sites.length, 0);
  SK.leaveMarket(s, C);
  tick(1);
  assert.ok(s.events[0].done);
});

test('판 엽전 수입: rules.purse.perSec만큼 결정적으로 쌓이고(소수는 state에), 결과 엽전에 들어간다', () => {
  const s = mk('dokkaebi_pass', 9);
  s.slots = []; s.events = [];
  const per = C.rules.purse.perSec;
  assert.ok(per > 0);
  for (let i = 0; i < 60 * 25; i++) SIM.step(s, C, { mx: 0, my: 0 }, 1 / 60);
  assert.strictEqual(s.purse, Math.floor(25 * per + 1e-6));
  assert.ok(s.purseAcc >= 0 && s.purseAcc < 1);
  assert.ok(Number.isInteger(s.purse));
  const coins = SIM.result(s, C).coins;
  s.purse += 3;
  assert.strictEqual(SIM.result(s, C).coins, coins + 3);
});

test('판 보정(runMods)은 mods에 있는 키면 같은 방식으로 곱해진다', () => {
  const s = mk();
  s.runMods = { enemyHp: 2, nope: 9 };
  assert.ok(Math.abs(ENT.mods(C, s).enemyHp - C.chapters.dokkaebi_pass.mods.enemyHp * 2) < 1e-9);
  assert.strictEqual(ENT.mods(C, s).nope, undefined);
});

test('구슬 상한: 혼백 구슬 없이 회복·엽전 구슬만 넘쳐도 멈추지 않는다', () => {
  const s = mk();
  s.slots = []; s.events = [];
  for (let i = 0; i < C.rules.limits.gems + 20; i++) s.gems.push({ x: 5000, y: 5000 + i, xp: 0, heal: 1 });
  SIM.step(s, C, {}, 1 / 60);
  assert.ok(s.gems.length > C.rules.limits.gems);
});
