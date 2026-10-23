const test = require('node:test');
const assert = require('node:assert');
const bot = require('./bot.js');

const st = enemies => ({ t: 0, player: { x: 0, y: 0 }, enemies });

test('직선 예고 위에 있으면 선과 수직으로 피한다', () => {
  const v = bot.input(st([{ ph: 'warn', x: 0, y: -200, dx: 0, dy: 1, len: 400 }]));
  assert.ok(Math.abs(v.my) < 1e-9 && Math.abs(Math.abs(v.mx) - 1) < 1e-9, JSON.stringify(v));
});

test('원형 예고 안에 있으면 원 밖으로 피한다', () => {
  const v = bot.input(st([{ ph: 'warn', wx: 10, wy: 0, wr: 90 }]));
  assert.ok(v.mx < 0);
});

test('idle은 움직이지 않고 blind는 적을 보지 않는다', () => {
  assert.deepStrictEqual(bot.input(st([]), 'idle'), { mx: 0, my: 0 });
  const b = bot.input(st([{ x: 5, y: 0 }]), 'blind');
  assert.ok(Math.abs(b.mx - 1) < 1e-9);
});

test('원형 예고 중심에 정확히 서 있으면 시전한 적의 반대쪽으로 피한다', () => {
  const v = bot.input(st([{ ph: 'warn', x: 300, y: 0, wx: 0, wy: 0, wr: 90 }]));
  assert.ok(v.mx < -0.9, JSON.stringify(v));
  const w = bot.input(st([{ ph: 'warn', x: 0, y: 0, wx: 0, wy: 0, wr: 90 }]));
  assert.ok(Math.hypot(w.mx, w.my) > 0.9, JSON.stringify(w));
});

test('플레이어 쪽으로 날아오는 적 투사체는 옆으로 피한다', () => {
  const v = bot.input({ t: 0, player: { x: 0, y: 0 }, enemies: [], eshots: [{ x: 100, y: 0, vx: -300, vy: 0, r: 8 }] });
  assert.ok(Math.abs(v.mx) < 1e-9 && Math.abs(Math.abs(v.my) - 1) < 1e-9, JSON.stringify(v));
});

test('회피 봇은 가까운 적과 예고가 없고 살 돈이 있으면 열린 장터로 걸어가고, 제단은 찾지 않는다', () => {
  const site = (kind, x, y) => ({ id: 1, kind, x, y, r: 60, until: 99, v: 0 });
  const poor = bot.input({ t: 0, purse: 0, player: { x: 0, y: 0 }, enemies: [], sites: [site('market', 0, -200)] });
  assert.ok(!(poor.my < -0.9), JSON.stringify(poor));
  const v = bot.input({ t: 0, purse: 99, player: { x: 0, y: 0 }, enemies: [], sites: [site('market', 0, -200)] });
  assert.ok(v.my < -0.9 && Math.abs(v.mx) < 0.1, JSON.stringify(v));
  const a = bot.input({ t: 0, player: { x: 0, y: 0 }, enemies: [], sites: [site('altar', 0, -200)] });
  assert.ok(Math.abs(a.my) < 1e-9, JSON.stringify(a));
  const near = bot.input({ t: 0, purse: 99, player: { x: 0, y: 0 }, enemies: [{ x: 0, y: -80 }], sites: [site('market', 0, -200)] });
  assert.ok(near.my > 0.5, JSON.stringify(near));
  const warn = bot.input({ t: 0, purse: 99, player: { x: 0, y: 0 }, enemies: [{ ph: 'warn', x: 300, y: 0, wx: 10, wy: 0, wr: 90 }], sites: [site('market', 200, 0)] });
  assert.ok(warn.mx < 0, JSON.stringify(warn));
  assert.deepStrictEqual(bot.input({ t: 0, player: { x: 0, y: 0 }, enemies: [], sites: [site('market', 0, -200)] }, 'idle'), { mx: 0, my: 0 });
});
