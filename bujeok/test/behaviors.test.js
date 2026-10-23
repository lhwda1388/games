const test = require('node:test');
const assert = require('node:assert');
const C = require('../content/index.js');
const B = require('../engine/behaviors.js');
const W = require('../engine/world.js');
const RNG = require('../engine/rng.js');

function mk(enemies = []) {
  const state = {
    t: 0, nextUid: 100, rng: RNG.create(3),
    player: { x: 0, y: 0, dirX: 0, dirY: -1, moved: 0, hp: 50, maxHp: 100, stillT: 0 },
    enemies, shots: [], zones: [], stats: { damageBy: {} }, fx: require('../engine/entities.js').freshFx(),
  };
  const hash = W.createHash(64);
  W.build(hash, enemies);
  return { state, content: C, hash, cdMul: 1 };
}
const foe = (uid, x, y, id = 'dokkaebi_fire') => ({ uid, id, x, y, hp: 1000, maxHp: 1000 });

test('콘텐츠의 모든 부품 종류가 구현돼 있다', () => {
  for (const t of Object.values(C.talismans)) for (const p of t.parts) assert.ok(B.KINDS.includes(p.kind), p.kind);
});

test('projectile nearest: 가장 가까운 적 쪽으로 count발, 쿨다운 시작', () => {
  const ctx = mk([foe(1, 100, 0), foe(2, -300, 0)]);
  const slot = { id: 'fire_talisman', lv: 3, cd: 0 };
  B.tickSlot(ctx, slot, 1 / 60);
  assert.strictEqual(ctx.state.shots.length, 2);
  for (const s of ctx.state.shots) assert.ok(s.vx > 0);
  assert.ok(slot.cd > 0);
});

test('쏠 적이 없으면 쏘지 않고 쿨다운을 0에 둔다', () => {
  const ctx = mk();
  const slot = { id: 'fire_talisman', lv: 1, cd: 0 };
  B.tickSlot(ctx, slot, 1 / 60);
  assert.strictEqual(ctx.state.shots.length, 0);
  assert.strictEqual(slot.cd, 0);
});

test('관통 투사체는 같은 적을 한 번만 맞힌다', () => {
  const e = foe(1, 0, -20);
  const ctx = mk([e]);
  ctx.state.shots.push({ uid: 9, x: 0, y: 0, vx: 0, vy: -10, r: 16, dmg: 5, pierce: 99, ttl: 1, owner: 'whirlwind', hit: [] });
  for (let i = 0; i < 10; i++) B.updateShots(ctx, 1 / 60);
  assert.strictEqual(e.hp, 995);
});

test('관통 0 투사체는 한 번 맞히면 사라진다', () => {
  const ctx = mk([foe(1, 0, -5), foe(2, 0, -6)]);
  ctx.state.shots.push({ uid: 9, x: 0, y: 0, vx: 0, vy: -10, r: 7, dmg: 5, pierce: 0, ttl: 1, owner: 'fire_talisman', hit: [] });
  B.updateShots(ctx, 1 / 60);
  assert.strictEqual(ctx.state.shots.length, 0);
  assert.strictEqual(ctx.state.enemies.filter(e => e.hp < 1000).length, 1);
});

test('shockwave: 반경 안만 피해·밀어냄, 링 표시', () => {
  const near = foe(1, 50, 0), far = foe(2, 400, 0);
  const ctx = mk([near, far]);
  B.tickSlot(ctx, { id: 'bell', lv: 1, cd: 0 }, 1 / 60);
  assert.strictEqual(near.hp, 1000 - 12);
  assert.strictEqual(near.x, 110);
  assert.strictEqual(far.hp, 1000);
  assert.strictEqual(ctx.state.fx.rings.length, 1);
});

test('trail: 실제 이동 36px마다 장판, 최대 24개(오래된 것부터 지움)', () => {
  const ctx = mk();
  const slot = { id: 'firewind_step', lv: 1, cd: 0 };
  ctx.state.player.moved = 36 * 30;
  B.tickSlot(ctx, slot, 1 / 60);
  assert.strictEqual(ctx.state.zones.length, 24);
  const still = mk();
  B.tickSlot(still, { id: 'firewind_step', lv: 1, cd: 0 }, 1 / 60);
  assert.strictEqual(still.state.zones.length, 0);
});

test('aura: 반경 안 적을 가장자리까지 밀고 초당 피해', () => {
  const e = foe(1, 50, 0);
  const ctx = mk([e]);
  const slot = { id: 'boundary_ward', lv: 1, cd: 0 };
  for (let i = 0; i < 60; i++) { W.build(ctx.hash, ctx.state.enemies); B.tickSlot(ctx, slot, 1 / 60); }
  assert.ok(Math.abs(e.x - 121) < 0.01, String(e.x));
  assert.ok(e.hp < 1000);
});

test('block 장판은 적을 밖으로 밀고, mine 장판은 닿으면 터져 범위 피해 후 사라진다', () => {
  const a = foe(1, 10, 0);
  const ctx = mk([a]);
  ctx.state.zones.push({ uid: 1, x: 0, y: 0, r: 60, ttl: 3, kind: 'block', dps: 0, dmg: 0, blast: 0, owner: 'red_bean' });
  B.updateZones(ctx, 1 / 60);
  assert.strictEqual(a.x, 71);

  const b = foe(2, 10, 0), c = foe(3, 70, 0), d = foe(4, 200, 0);
  const m = mk([b, c, d]);
  m.state.zones.push({ uid: 2, x: 0, y: 0, r: 22, ttl: 12, kind: 'mine', dps: 0, dmg: 40, blast: 80, owner: 'bean_bell_trap' });
  B.updateZones(m, 1 / 60);
  assert.strictEqual(b.hp, 960);
  assert.strictEqual(c.hp, 960);
  assert.strictEqual(d.hp, 1000);
  assert.strictEqual(m.state.zones.length, 0);
});

const ENT = require('../engine/entities.js');
function withTalisman(id, t) { return { ...C, talismans: { ...C.talismans, [id]: t } }; }
const T = (parts, lv) => ({ name: 't', element: 'fire', glyph: 't', how: 'h', weak: 'w', color: 0xffffff, parts, levels: [lv] });

test('orbit: 궤도 구슬에 닿은 적만 초당 피해, 위치는 시간에서 계산', () => {
  const ctx = mk([foe(1, 60, 0), foe(2, 200, 0)]);
  ctx.content = withTalisman('o', T([{ kind: 'orbit', count: 1, R: 60, w: 0, r: 12 }], { dps: 60 }));
  B.tickSlot(ctx, { id: 'o', lv: 1, cd: 0 }, 1 / 60);
  assert.ok(Math.abs(ctx.state.enemies[0].hp - 999) < 1e-9);
  assert.strictEqual(ctx.state.enemies[1].hp, 1000);
  assert.deepStrictEqual(B.orbitPoints(ctx.state, { count: 1, R: 60, w: 0 }), [{ x: 60, y: 0 }]);
});

test('chain: 가장 가까운 적부터 jumps번 튀고 번개 선을 남긴다', () => {
  const ctx = mk([foe(1, 50, 0), foe(2, 120, 0), foe(3, 190, 0), foe(4, 900, 0)]);
  ctx.content = withTalisman('c', T([{ kind: 'chain', range: 300, jumpR: 100, jumps: 2 }], { cd: 1, dmg: 10 }));
  B.tickSlot(ctx, { id: 'c', lv: 1, cd: 0 }, 1 / 60);
  assert.deepStrictEqual(ctx.state.enemies.map(e => e.hp), [990, 990, 990, 1000]);
  assert.strictEqual(ctx.state.fx.bolts.length, 3);
});

test('strike inOwnZones: 내 장판 안의 적만 노린다', () => {
  const inZ = foe(1, 100, 0), out = foe(2, -100, 0);
  const ctx = mk([inZ, out]);
  ctx.content = withTalisman('s', T([{ kind: 'strike', range: 300, r: 10, count: 2, inOwnZones: true }], { cd: 1, dmg: 20 }));
  ctx.state.zones.push({ uid: 1, x: 100, y: 0, r: 50, ttl: 3, kind: 'damage', dps: 0, dmg: 0, blast: 0, owner: 's' });
  B.tickSlot(ctx, { id: 's', lv: 1, cd: 0 }, 1 / 60);
  assert.strictEqual(inZ.hp, 980);
  assert.strictEqual(out.hp, 1000);
});

test('지연 strike: 예고 장판을 깔고 delay 뒤에 터진다', () => {
  const e = foe(1, 100, 0);
  const ctx = mk([e]);
  ctx.content = withTalisman('d', T([{ kind: 'strike', range: 300, r: 40, count: 1, delay: 0.5 }], { cd: 9, dmg: 30 }));
  B.tickSlot(ctx, { id: 'd', lv: 1, cd: 0 }, 1 / 60);
  assert.strictEqual(e.hp, 1000);
  assert.strictEqual(ctx.state.zones[0].kind, 'delayed');
  for (let i = 0; i < 31; i++) B.updateZones(ctx, 1 / 60);
  assert.strictEqual(e.hp, 970);
  assert.strictEqual(ctx.state.zones.length, 0);
});

test('cone: 가장 가까운 적 방향의 부채꼴 안만, 느려짐을 건다', () => {
  const front = foe(1, 100, 0), side = foe(2, 0, 120);
  const ctx = mk([front, side]);
  ctx.content = withTalisman('k', T([{ kind: 'cone', r: 160, arc: 1.0, slow: { mul: 0.5, t: 1 } }], { cd: 1, dmg: 10 }));
  B.tickSlot(ctx, { id: 'k', lv: 1, cd: 0 }, 1 / 60);
  assert.strictEqual(front.hp, 990);
  assert.strictEqual(side.hp, 1000);
  assert.strictEqual(front.slowMul, 0.5);
  assert.strictEqual(ctx.state.fx.arcs.length, 1);
});

test('homing 투사체는 안 맞힌 적 쪽으로 돈다', () => {
  const e = foe(1, 0, 100);
  const ctx = mk([e]);
  ctx.state.shots.push({ uid: 9, x: 0, y: 0, vx: 100, vy: 0, r: 5, dmg: 5, pierce: 0, ttl: 2, owner: 'spirit_sword', hit: [], homing: 6 });
  B.updateShots(ctx, 1 / 60);
  assert.ok(ctx.state.shots[0].vy > 0);
  assert.ok(Math.abs(Math.hypot(ctx.state.shots[0].vx, ctx.state.shots[0].vy) - 100) < 1e-9);
});

test('chainOnHit: 투사체가 맞히면 그 적에서 번개가 튄다', () => {
  const a = foe(1, 0, -5), b = foe(2, 0, -100);
  const ctx = mk([a, b]);
  ctx.state.shots.push({ uid: 9, x: 0, y: 0, vx: 0, vy: -10, r: 8, dmg: 20, pierce: 0, ttl: 1, owner: 't', hit: [], chainOnHit: { jumps: 1, jumpR: 150, dmgMul: 0.5 } });
  B.updateShots(ctx, 1 / 60);
  assert.strictEqual(a.hp, 980);
  assert.strictEqual(b.hp, 990);
});

test('bossMul·ghostMul·lifesteal', () => {
  const boss = { uid: 1, id: 'one_eye', x: 50, y: 0, hp: 1000, maxHp: 1000 };
  const ghost = { uid: 2, id: 'japgwi', x: -50, y: 0, hp: 1000, maxHp: 1000 };
  const ctx = mk([boss, ghost]);
  ctx.content = withTalisman('m', T([{ kind: 'shockwave', r: 90, knock: 0, bossMul: 3, ghostMul: 2, lifesteal: 0.1 }], { cd: 1, dmg: 10 }));
  B.tickSlot(ctx, { id: 'm', lv: 1, cd: 0 }, 1 / 60);
  assert.strictEqual(boss.hp, 970);
  assert.strictEqual(ghost.hp, 980);
  assert.strictEqual(ctx.state.player.hp, 55);
});

test('저주 healMul: 흡혈과 오라 회복에도 곱한다', () => {
  const boss = { uid: 1, id: 'one_eye', x: 50, y: 0, hp: 1000, maxHp: 1000 };
  const ctx = mk([boss]);
  ctx.state.curseFx = { healMul: 0.5 };
  ctx.content = withTalisman('m', T([{ kind: 'shockwave', r: 90, knock: 0, bossMul: 3, lifesteal: 0.1 }], { cd: 1, dmg: 10 }));
  B.tickSlot(ctx, { id: 'm', lv: 1, cd: 0 }, 1 / 60);
  assert.strictEqual(ctx.state.player.hp, 51.5);
  const ctx2 = mk([foe(1, 30, 0)]);
  ctx2.state.curseFx = { healMul: 0.5 };
  ctx2.content = withTalisman('w', T([{ kind: 'aura', r: 100, push: 0 }], { dps: 60, heal: 6 }));
  B.tickSlot(ctx2, { id: 'w', lv: 1, cd: 0 }, 1 / 60);
  assert.ok(Math.abs(ctx2.state.player.hp - 50.05) < 1e-9);
});

test('stillOnly 오라는 0.3초 이상 서 있을 때만, heal은 그때만 회복', () => {
  const e = foe(1, 30, 0);
  const ctx = mk([e]);
  ctx.content = withTalisman('w', T([{ kind: 'aura', r: 100, push: 0, stillOnly: true }], { dps: 60, heal: 6 }));
  const slot = { id: 'w', lv: 1, cd: 0 };
  B.tickSlot(ctx, slot, 1 / 60);
  assert.strictEqual(e.hp, 1000);
  ctx.state.player.stillT = 0.5;
  B.tickSlot(ctx, slot, 1 / 60);
  assert.ok(e.hp < 1000);
  assert.ok(Math.abs(ctx.state.player.hp - 50.1) < 1e-9);
});

test('speedMul: 보유한 오라의 이동 속도 배수를 곱한다(stillOnly 제외)', () => {
  const c = withTalisman('z', T([{ kind: 'aura', r: 0, push: 0, speedMul: 1.2 }], { dps: 0 }));
  assert.ok(Math.abs(B.speedMul(c, { slots: [{ id: 'z', lv: 1 }, { id: 'z', lv: 1 }] }) - 1.44) < 1e-9);
  assert.strictEqual(B.speedMul(c, { slots: [] }), 1);
});

test('레벨의 parts[i]는 공통 레벨 값 뒤에 그 부품에만 덮인다', () => {
  const c = withTalisman('pp', T([{ kind: 'aura', r: 100 }, { kind: 'orbit', count: 3, R: 60, w: 1, r: 10 }], { cd: 1, heal: 2, dps: 5, parts: [{ dps: 40 }] }));
  const { lv, parts } = B.partsOf(c, { id: 'pp', lv: 1 });
  assert.strictEqual(lv.cd, 1);
  assert.strictEqual(parts[0].dps, 40);
  assert.strictEqual(parts[1].dps, 5);
  assert.strictEqual(parts[1].heal, 2);
  assert.ok(!('parts' in parts[0]) && !('parts' in parts[1]));
});

test('도화결계: 궤도 피해는 결계보다 약하고 도화귀화보다 약하다', () => {
  for (let lv = 1; lv <= 3; lv++) {
    const [aura, orbit] = B.partsOf(C, { id: 'peach_ward', lv }).parts;
    const fox = B.partsOf(C, { id: 'peach_foxfire', lv }).parts[0];
    assert.ok(orbit.dps < aura.dps / 2, `lv${lv}: orbit ${orbit.dps} vs aura ${aura.dps}`);
    assert.ok(orbit.dps < fox.dps, `lv${lv}: orbit ${orbit.dps} vs foxfire ${fox.dps}`);
  }
});

test('homing 탐색 반경은 rules.homingRange', () => {
  const e = foe(1, 0, 300);
  const ctx = mk([e]);
  ctx.content = { ...C, rules: { ...C.rules, homingRange: 100 } };
  ctx.state.shots.push({ uid: 9, x: 0, y: 0, vx: 100, vy: 0, r: 5, dmg: 5, pierce: 0, ttl: 2, owner: 'spirit_sword', hit: [], homing: 6 });
  B.updateShots(ctx, 1 / 60);
  assert.strictEqual(ctx.state.shots[0].vy, 0);
});

test('stillOnly 대기 시간은 rules.stillDelay', () => {
  const e = foe(1, 30, 0);
  const ctx = mk([e]);
  const c = withTalisman('w', T([{ kind: 'aura', r: 100, push: 0, stillOnly: true }], { dps: 60 }));
  ctx.content = { ...c, rules: { ...C.rules, stillDelay: 0.1 } };
  ctx.state.player.stillT = 0.15;
  B.tickSlot(ctx, { id: 'w', lv: 1, cd: 0 }, 1 / 60);
  assert.ok(e.hp < 1000);
});

test('장판 상한이 차 있으면 지연 strike는 그 자리에서 바로 터진다(쿨다운만 날리지 않는다)', () => {
  const e = foe(1, 100, 0);
  const ctx = mk([e]);
  ctx.content = withTalisman('d', T([{ kind: 'strike', range: 300, r: 40, count: 1, delay: 0.5 }], { cd: 9, dmg: 30 }));
  for (let i = 0; i < C.rules.limits.zones; i++) ctx.state.zones.push({ uid: 1000 + i, x: 9999, y: 9999, r: 1, ttl: 99, kind: 'damage', dps: 0, dmg: 0, blast: 0, owner: 'x' });
  B.tickSlot(ctx, { id: 'd', lv: 1, cd: 0 }, 1 / 60);
  assert.strictEqual(e.hp, 970);
});

test('연쇄 번개가 튈 때마다 맞은 자리에 작은 번쩍임을 남긴다(뇌신검이 약해 보이지 않게)', () => {
  const ctx = mk([foe(1, 50, 0), foe(2, 120, 0)]);
  ctx.content = withTalisman('c', T([{ kind: 'chain', range: 300, jumpR: 100, jumps: 1 }], { cd: 1, dmg: 10 }));
  B.tickSlot(ctx, { id: 'c', lv: 1, cd: 0 }, 1 / 60);
  assert.strictEqual(ctx.state.fx.rings.filter(r => r.r === C.rules.chainFlashR).length, 1);
});
