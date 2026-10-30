// farm-fish/test/stage12.test.js — stage 12 lane ③: 잠수 탐험 (24-room map, gear, 해저 도감, 항해일지)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = require('../build.js').build();
vm.runInThisContext(html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1], { filename: 'logic.js' });
const L = globalThis.Logic;
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const fresh = () => L.newState(0, seq(0.5));
const OPP = { n: 's', s: 'n', e: 'w', w: 'e' };
const STEP = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const room = (id) => L.DIVE_ROOMS.find((r) => r.id === id);
const thingK = (id, pred) => room(id).things.findIndex(pred);

// the 조선소 is lane ①'s; here the field is set by hand
function withYard() { const s = fresh(); s.port = { got: {}, done: { bridge: true, shipyard: true } }; return s; }

// ---------- map ----------
test('map: 24 rooms, unique ids and grid cells, 8 per zone, r0 in the 얕은 여', () => {
  assert.equal(L.DIVE_ROOMS.length, 24);
  const ids = new Set(), cells = new Set(), zones = { reef: 0, wreck: 0, deep: 0 };
  for (const r of L.DIVE_ROOMS) {
    assert.ok(!ids.has(r.id), 'dup ' + r.id); ids.add(r.id);
    const c = r.x + ',' + r.y; assert.ok(!cells.has(c), 'cell ' + c); cells.add(c);
    zones[r.zone]++;
    assert.ok(Array.isArray(r.bubbles) && r.bubbles.length <= 2, r.id);
    assert.ok(Array.isArray(r.things), r.id);
    assert.equal(L.diveRoom(r.id), r);
  }
  assert.deepEqual(zones, { reef: 8, wreck: 8, deep: 8 });
  assert.equal(room('r0').zone, 'reef');
  assert.equal(L.diveRoom('nope'), null);
});

test('map: every exit leads back the opposite way, to the grid neighbour', () => {
  for (const r of L.DIVE_ROOMS) for (const d of Object.keys(r.exits)) {
    const o = room(r.exits[d]);
    assert.ok(o, r.id + ' ' + d);
    assert.equal(o.exits[OPP[d]], r.id, r.id + ' ' + d + ' → ' + o.id);
    assert.equal(o.x, r.x + STEP[d][0]); assert.equal(o.y, r.y + STEP[d][1]);
  }
});

test('map: every room reachable from r0; without gear only the 얕은 여 (with the key room)', () => {
  const bfs = (ok) => {
    const seen = new Set(['r0']), q = ['r0'];
    while (q.length) { const r = room(q.shift()); for (const id of Object.values(r.exits)) if (!seen.has(id) && ok(room(id))) { seen.add(id); q.push(id); } }
    return seen;
  };
  assert.equal(bfs(() => true).size, 24);
  const free = bfs((r) => !r.gate && r.zone !== 'deep');
  assert.deepEqual([...free].sort(), L.DIVE_ROOMS.filter((r) => r.zone === 'reef').map((r) => r.id).sort());
  const keyRoom = L.DIVE_ROOMS.find((r) => r.things.some((t) => t.id === 'key'));
  assert.equal(keyRoom.zone, 'reef');
  assert.ok(keyRoom.id !== 'r0');
  // exactly one 열쇠 door from the 얕은 여 into the 난파선; every deep room asks for light; 2-3 tank rooms
  const doors = L.DIVE_ROOMS.filter((r) => r.zone === 'reef').flatMap((r) => Object.values(r.exits).map(room)).filter((o) => o.zone === 'wreck');
  assert.equal(doors.length, 1); assert.equal(doors[0].gate, 'key');
  const tanks = L.DIVE_ROOMS.filter((r) => r.gate === 'tank');
  assert.ok(tanks.length >= 2 && tanks.length <= 3);
  for (const t of tanks) for (const id of Object.values(t.exits)) assert.equal(room(id).bubbles.length, 0, 'long passage before ' + t.id);
  assert.equal(L.DIVE_ROOMS.filter((r) => r.things.some((t) => t.id === 'log')).length, 5);
  assert.deepEqual(L.DIVE_ROOMS.flatMap((r) => r.things.filter((t) => t.id === 'log').map((t) => t.n)).sort(), [1, 2, 3, 4, 5]);
  for (const r of L.DIVE_ROOMS) if (r.zone === 'reef') assert.ok(!r.things.some((t) => t.id === 'log' || t.id === 'box'), r.id);
});

test('map: every 해저 도감 entry lives in some room of its zone', () => {
  for (const d of L.DIVE_DEX) assert.ok(L.DIVE_ROOMS.some((r) => r.zone === d.zone && r.things.some((t) => t.id === d.id)), d.id);
  for (const r of L.DIVE_ROOMS) for (const t of r.things) {
    assert.ok(t.x >= 10 && t.x <= 170 && t.y >= 24 && t.y <= 190, r.id + ' ' + t.id);
    assert.ok(['key', 'log', 'box'].includes(t.id) || L.diveDexById(t.id), r.id + ' ' + t.id);
  }
});

// ---------- gates ----------
test('diveOk needs the 조선소; gates: key, light, tank', () => {
  const s0 = fresh();
  assert.equal(L.diveOk(s0), false);
  s0.port = { got: {}, done: { bridge: true } }; assert.equal(L.diveOk(s0), false);
  const s = withYard();
  assert.equal(L.diveOk(s), true);
  assert.deepEqual(L.diveCanEnter(s, 'r1'), { ok: true });
  const door = L.DIVE_ROOMS.find((r) => r.gate === 'key').id;
  assert.deepEqual(L.diveCanEnter(s, door), { ok: false, why: 'key' });
  assert.deepEqual(L.diveCanEnter(s, 'd0'), { ok: false, why: 'light' });
  const tank = L.DIVE_ROOMS.find((r) => r.gate === 'tank' && r.zone === 'wreck').id;
  // the key from the 얕은 여 opens the 난파선
  const kr = L.DIVE_ROOMS.find((r) => r.things.some((t) => t.id === 'key'));
  const got = L.diveTake(s, kr.id, kr.things.findIndex((t) => t.id === 'key'), seq(0.5));
  assert.equal(got.kind, 'key'); assert.equal(s.dive.gear.key, true);
  assert.equal(L.diveTake(s, kr.id, kr.things.findIndex((t) => t.id === 'key'), seq(0.5)), null);
  assert.deepEqual(L.diveCanEnter(s, door), { ok: true });
  assert.deepEqual(L.diveCanEnter(s, tank), { ok: false, why: 'tank' });
  s.dive.gear.light = true;
  assert.deepEqual(L.diveCanEnter(s, 'd0'), { ok: true });
  assert.equal(L.diveCanEnter(s, 'nope').ok, false);
  assert.equal(L.diveCanEnter(fresh(), 'r0').why, 'closed');
});

test('oxygen: 60 s, 120 s with the big tank; diveBuy checks shipyard, coins, materials', () => {
  assert.equal(L.DIVE_O2, 60); assert.equal(L.DIVE_O2_TANK, 120);
  const s = withYard();
  assert.equal(L.diveO2Max(s), 60);
  assert.equal(L.diveBuy(fresh(), 'tank').why, 'closed');
  s.coins = 0;
  assert.equal(L.diveBuy(s, 'tank').why, 'coins');
  s.coins = L.DIVE_GEAR.tank.coins + 5;
  assert.equal(L.diveBuy(s, 'tank').why, 'need');
  for (const [id, n] of L.DIVE_GEAR.tank.need) for (let k = 0; k < n; k++) L.bagAdd(s, id, 1);
  L.bagAdd(s, 'iron', 99);   // the dearest stays
  assert.deepEqual(L.diveBuy(s, 'tank'), { ok: true });
  assert.equal(s.coins, 5);
  assert.equal(L.bagCount(s, 'iron'), 1); assert.equal(s.bag.find((e) => e.id === 'iron').v, 99);
  assert.equal(L.bagCount(s, 'coralbit'), 0);
  assert.equal(L.diveO2Max(s), 120);
  assert.equal(L.diveBuy(s, 'tank').why, 'got');
  assert.equal(L.diveBuy(s, 'nope').ok, false);
  // material ids are real items
  for (const g of Object.values(L.DIVE_GEAR)) for (const [id] of g.need) assert.ok(L.itemInfo(id), id);
});

// ---------- taking things ----------
test('diveEnter marks seen and makes s.dive; locked rooms refuse', () => {
  const s = withYard();
  assert.equal(s.dive, undefined);
  assert.equal(L.diveEnter(s, 'r0').first, true);
  assert.ok(s.dive.seen.r0);
  assert.equal(L.diveEnter(s, 'r0').first, false);
  assert.equal(L.diveEnter(s, 'd0'), null);
  assert.equal(s.dive.seen.d0, undefined);
});

test('diveTake: pick → basket, see → 도감 only, log/box once, bad index null', () => {
  const s = withYard(); s.coins = 0;
  const pr = L.DIVE_ROOMS.find((r) => r.things.some((t) => L.diveDexById(t.id) && L.diveDexById(t.id).kind === 'pick'));
  const pk = pr.things.findIndex((t) => L.diveDexById(t.id) && L.diveDexById(t.id).kind === 'pick');
  const id = pr.things[pk].id, n0 = s.bag.length;
  const a = L.diveTake(s, pr.id, pk, seq(0.5));
  assert.equal(a.kind, 'pick'); assert.equal(a.id, id); assert.equal(a.first, true);
  assert.equal(s.bag.length, n0 + 1); assert.equal(s.bag[s.bag.length - 1].id, id);
  assert.equal(L.itemInfo(id).kind, 'dive');
  assert.equal(L.diveTake(s, pr.id, pk, seq(0.5)).first, false);   // picked again on another dive
  const sr = L.DIVE_ROOMS.find((r) => r.things.some((t) => L.diveDexById(t.id) && L.diveDexById(t.id).kind === 'see'));
  const sk = sr.things.findIndex((t) => L.diveDexById(t.id) && L.diveDexById(t.id).kind === 'see');
  const nb = s.bag.length;
  const b = L.diveTake(s, sr.id, sk, seq(0.5));
  assert.equal(b.kind, 'see'); assert.equal(b.first, true); assert.equal(b.coins, L.DIVE_SEE_COINS);
  assert.equal(s.bag.length, nb); assert.ok(s.dive.got[b.id]);
  assert.equal(L.diveTake(s, sr.id, sk, seq(0.5)).coins, undefined);
  const lr = L.DIVE_ROOMS.find((r) => r.things.some((t) => t.id === 'log'));
  const lk = lr.things.findIndex((t) => t.id === 'log');
  assert.equal(L.diveTake(s, lr.id, lk, seq(0.5)).kind, 'log');
  assert.equal(L.diveTake(s, lr.id, lk, seq(0.5)), null);
  const br = L.DIVE_ROOMS.find((r) => r.things.some((t) => t.id === 'box'));
  const bk = br.things.findIndex((t) => t.id === 'box');
  const c0 = s.coins, bx = L.diveTake(s, br.id, bk, seq(0.5));
  assert.equal(bx.kind, 'box');
  assert.ok((bx.coins || 0) > 0 || bx.deco);
  if (bx.coins) assert.equal(s.coins, c0 + bx.coins);
  assert.equal(L.diveTake(s, br.id, bk, seq(0.5)), null);
  assert.equal(L.diveTake(s, 'r0', 99, seq(0.5)), null);
  assert.equal(L.diveTake(s, 'nope', 0, seq(0.5)), null);
  assert.equal(L.diveTake(fresh(), 'r0', 0, seq(0.5)), null);
  // every box gives something, decorations are real
  for (const bxd of L.DIVE_BOXES) assert.ok(bxd.coins > 0 || L.decoById(bxd.deco), bxd.id);
});

test('항해일지 5조각 → 바다 이야기꾼; 24 rooms → 해저 지도 액자 once', () => {
  const s = withYard();
  s.dive = undefined;
  assert.deepEqual(L.diveTitles(s), []);
  assert.equal(L.DIVE_LOG.length, 5);
  L.DIVE_ROOMS.forEach((r) => r.things.forEach((t, k) => { if (t.id === 'log') L.diveTake(s, r.id, k, seq(0.5)); }));
  assert.equal(L.diveLogDone(s), true);
  assert.deepEqual(L.diveTitles(s), ['바다 이야기꾼']);
  s.dive.gear = { tank: true, light: true, key: true };
  let maps = 0;
  L.DIVE_ROOMS.forEach((r) => { const e = L.diveEnter(s, r.id); if (e.map) maps++; });
  assert.equal(maps, 1);
  assert.ok(s.yard.deco.seamap);
  L.DIVE_ROOMS.forEach((r) => assert.ok(!L.diveEnter(s, r.id).map));
  assert.ok(L.decoById('seamap'));
});

test('해저 도감: ~20 kinds in every zone, unique ids, pick items known to itemInfo, see ones not', () => {
  assert.ok(L.DIVE_DEX.length >= 18 && L.DIVE_DEX.length <= 24);
  const ids = new Set();
  for (const d of L.DIVE_DEX) {
    assert.ok(!ids.has(d.id)); ids.add(d.id);
    assert.ok(d.name && d.hint && ['reef', 'wreck', 'deep'].includes(d.zone) && ['pick', 'see'].includes(d.kind), d.id);
    if (d.kind === 'pick') { assert.ok(d.price > 0); assert.deepEqual(L.itemInfo(d.id), { id: d.id, kind: 'dive', name: d.name, price: d.price }); }
    else assert.equal(L.itemInfo(d.id), null, d.id);
  }
  for (const z of ['reef', 'wreck', 'deep']) {
    assert.ok(L.DIVE_DEX.some((d) => d.zone === z && d.kind === 'pick'), z);
    assert.ok(L.DIVE_DEX.some((d) => d.zone === z && d.kind === 'see'), z);
  }
  assert.ok(L.DIVE_DEX.some((d) => d.zone === 'deep' && d.kind === 'see'));
  assert.equal(L.diveDexById('nope'), null);
});

// ---------- save ----------
test('save: round trip keeps s.dive, unknown ids dropped, old fixtures have none', () => {
  const s = withYard();
  L.diveEnter(s, 'r0'); L.diveEnter(s, 'r1');
  s.dive.got.seahorse = true; s.dive.gear.tank = true; s.dive.log[3] = true; s.dive.box[L.DIVE_BOXES[0].id] = true;
  const back = L.decode(L.encode(s));
  assert.deepEqual(back.dive, s.dive);
  const o = JSON.parse(L.encode(s));
  o.dive.seen.zz = true; o.dive.got.zz = true; o.dive.log[9] = true; o.dive.box.zz = true; o.dive.gear.key = 'yes';
  const d = L.decode(JSON.stringify(o)).dive;
  assert.equal(d.seen.zz, undefined); assert.equal(d.got.zz, undefined); assert.equal(d.log[9], undefined); assert.equal(d.box.zz, undefined);
  assert.equal(d.gear.key, false);
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    if (/"dive":/.test(raw)) continue;   // saved by stage 12+
    const t = L.decode(raw);
    assert.ok(t, f); assert.equal(t.dive, undefined, f);
  }
});

test('놀거리 수첩: dive and divemap lines, locked until the 조선소', () => {
  for (const id of ['dive', 'divemap']) {
    const g = L.guideById(id);
    assert.ok(g && g.lock.includes('조선소'), id);
    assert.equal(L.guideOpen(fresh(), id), false);
    assert.equal(L.guideOpen(withYard(), id), true);
  }
});
