const test = require('node:test');
const assert = require('node:assert');
const C = require('../content/index.js');
const SIM = require('../engine/sim.js');
const SAVE = require('../engine/save.js');
const bot = require('./bot.js');

const mk = seed => SIM.create(C, { seed, heroId: 'yeonhwa', chapterId: 'tutorial', runId: 'd' + seed });
const snap = s => JSON.stringify(s, SAVE.dropFx);

test('같은 시드와 같은 입력이면 같은 결과', () => {
  const a = bot.run(mk(11), C, 240), b = bot.run(mk(11), C, 240);
  assert.strictEqual(snap(a), snap(b));
});

test('스냅샷으로 저장·복원한 뒤 이어가도 끊김 없이 진행한 것과 같다', () => {
  const whole = bot.run(mk(11), C, 240);
  const half = bot.run(mk(11), C, 120);
  const restored = JSON.parse(snap(half));
  restored.fx = require('../engine/entities.js').freshFx();
  bot.run(restored, C, 240);
  assert.strictEqual(snap(restored), snap(whole));
});

test('입문: 첫 합체 창이 전투 시간 1:30~3:00 사이에 열린다(시드 1~5)', () => {
  for (let seed = 1; seed <= 5; seed++) {
    let at = null;
    bot.run(mk(seed), C, 200, s => {
      if (at == null) { const ev = s.fx.events.find(e => e.type === 'fusion_ready'); if (ev) at = ev.t; }
      s.fx.events.length = 0;
    });
    console.log(`seed ${seed}: 첫 합체 ${at == null ? '없음' : at.toFixed(1) + 's'}`);
    assert.ok(at != null && at >= 90 && at <= 180, `seed ${seed}: ${at}`);
  }
});

test('1챕터: 레시피 시작(검·번개 0갈래)으로 200초에 저장·복원해도 420초까지 끊김 없이 진행한 것과 같다', () => {
  const SK = require('../engine/skills.js');
  const mk1 = () => {
    const s = SIM.create(C, { seed: 7, heroId: 'yeonhwa', chapterId: 'dokkaebi_pass', runId: 'c1' });
    s.slots = [{ id: C.recipes.sword_chain.a, lv: 1, cd: 0 }]; s.target = null; SK.pickTarget(s, C);
    return s;
  };
  const clear = x => { x.fx.events.length = 0; x.fx.notices.length = 0; x.fx.bolts.length = 0; x.fx.arcs.length = 0; x.fx.hits.length = 0; x.fx.kills.length = 0; x.fx.hurts.length = 0; };
  const whole = bot.run(mk1(), C, 420, clear, { branch: 0 });
  const half = bot.run(mk1(), C, 200, clear, { branch: 0 });
  const restored = JSON.parse(snap(half));
  restored.fx = require('../engine/entities.js').freshFx();
  bot.run(restored, C, 420, clear, { branch: 0 });
  assert.ok(whole.stats.fusions.includes('thunder_sword'));
  assert.strictEqual(snap(restored), snap(whole));
});
