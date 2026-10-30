// test/stage7d.test.js — stage 7 박물관: six rooms filled by donations (basket items or records), a reward per room
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = require('../build.js').build();
vm.runInThisContext(html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1], { filename: 'logic.js' });
const L = globalThis.Logic;
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const give = (s, id, n, v) => { for (let k = 0; k < (n || 1); k++) L.bagAdd(s, id, v === undefined ? L.itemInfo(id).price : v); };
const ROOMS = ['fish', 'bug', 'fossil', 'mineral', 'star', 'sea'];

// a player who owns the 망원경 (the museum is open) and a big basket
function openState() {
  const s = L.newState(0, seq(0.5));
  s.coins = 99999; L.buyScope(s); s.coins = 0;
  s.up.basket = 2;
  return s;
}
function withCave(s) { s.rep = Math.max(s.rep, L.CAVE_REP); s.coins += L.PICK_COST; L.buyPick(s, 0, seq(0.5)); return s; }

test('rooms: six, every id belongs to its source table, no id twice in a room, all reachable', () => {
  assert.deepEqual(L.MUSEUM_ROOM_IDS, ROOMS);
  ROOMS.forEach((r) => {
    const room = L.MUSEUM_ROOMS[r];
    assert.ok(room && room.name && room.ids.length >= 5, r);
    assert.equal(new Set(room.ids).size, room.ids.length, r + ' has a duplicate');
    assert.ok(room.coins > 0 && room.title, r + ' reward');
  });
  const R = L.MUSEUM_ROOMS;
  assert.deepEqual(R.fish.ids, L.FISH.map((f) => f.id), 'every fish, 섬·축제·전설 too');
  assert.ok(R.fish.ids.includes('dotdom') && R.fish.ids.includes('clockfish'));
  assert.deepEqual(R.bug.ids, L.BUGS.map((b) => b.id));
  assert.deepEqual(R.fossil.ids, L.FOSSILS.map((f) => f.id));
  assert.ok(R.mineral.ids.every((id) => L.oreById(id)) && !R.mineral.ids.includes('rock'));
  assert.equal(R.mineral.ids.length, L.ORES.length - 1);
  assert.deepEqual(R.star.ids, L.STARS.map((c) => c.id));
  assert.ok(R.sea.ids.includes('pearl'));
  R.sea.ids.forEach((id) => assert.ok(L.itemInfo(id), id + ' is a basket item'));
  assert.ok(!R.sea.ids.includes('dletter') && !R.sea.ids.includes('exoticseed'), 'letters and seeds never sit in the basket');
  // basket rooms only ask for things that can be in the basket
  ['fish', 'mineral', 'sea'].forEach((r) => R[r].ids.forEach((id) => assert.ok(L.itemInfo(id), r + ':' + id)));
  const tot = L.museumTotal(L.newState(0, seq(0.5)));
  assert.equal(tot.n, 0);
  assert.equal(tot.m, ROOMS.reduce((a, r) => a + R[r].ids.length, 0));
});

test('museumOk: opens with the pickaxe, the telescope or the fixed boat', () => {
  const s = L.newState(0, seq(0.5));
  assert.equal(L.museumOk(s), false);
  assert.equal(L.canDonate(s, 'fish', 'minnow'), false);
  give(s, 'minnow');
  assert.deepEqual(L.donate(s, 'fish', 'minnow'), { ok: false, why: 'closed' });
  assert.equal(L.bagCount(s, 'minnow'), 1);
  const a = L.newState(0, seq(0.5)); withCave(a); assert.equal(L.museumOk(a), true);
  const b = L.newState(0, seq(0.5)); b.coins = L.SCOPE_COST; L.buyScope(b); assert.equal(L.museumOk(b), true);
  const c = L.newState(0, seq(0.5));
  c.rep = 40; c.coins = 99999; L.buySpot(c, 'sea'); c.coins = L.BOAT_FIX.coins;
  const j = L.junkOf(c); j.n.can = L.BOAT_FIX.junk;
  assert.equal(L.museumOk(c), false);
  assert.equal(L.fixBoat(c).ok, true);
  assert.equal(L.museumOk(c), true);
});

test('canDonate: per room, true only with the thing in hand (basket) or on record', () => {
  const s = withCave(openState());
  // fish: from the basket
  assert.equal(L.canDonate(s, 'fish', 'minnow'), false);
  give(s, 'minnow');
  assert.equal(L.canDonate(s, 'fish', 'minnow'), true);
  assert.equal(L.canDonate(s, 'mineral', 'minnow'), false, 'wrong room');
  assert.equal(L.canDonate(s, 'nope', 'minnow'), false);
  // bug: from the 곤충 도감 record (insects never sit in the basket)
  assert.equal(L.canDonate(s, 'bug', 'ant'), false);
  s.coins += L.NET_COST; L.buyNet(s); L.catchBug(s, 'ant');
  assert.equal(L.canDonate(s, 'bug', 'ant'), true);
  assert.equal(L.canDonate(s, 'bug', 'moth'), false);
  // fossil: only a completed one
  s.cave.parts.ammonite = [true, true, false];
  assert.equal(L.canDonate(s, 'fossil', 'ammonite'), false);
  s.cave.done.ammonite = true;
  assert.equal(L.canDonate(s, 'fossil', 'ammonite'), true);
  // mineral: basket; 돌 is not exhibited
  give(s, 'rock'); give(s, 'iron');
  assert.equal(L.canDonate(s, 'mineral', 'rock'), false);
  assert.equal(L.canDonate(s, 'mineral', 'iron'), true);
  // star: the observation record
  assert.equal(L.canDonate(s, 'star', 'orion'), false);
  L.seeStar(s, 'orion', 5);
  assert.equal(L.canDonate(s, 'star', 'orion'), true);
  // sea: 진주 and 표류물 from the basket
  assert.equal(L.canDonate(s, 'sea', 'pearl'), false);
  give(s, 'pearl'); give(s, 'shell');
  assert.equal(L.canDonate(s, 'sea', 'pearl'), true);
  assert.equal(L.canDonate(s, 'sea', 'shell'), true);
  // the list the donate sheet shows
  assert.deepEqual(L.donatable(s, 'sea'), ['pearl', 'shell'], 'in room order: 진주 first');
  assert.deepEqual(L.donatable(s, 'mineral'), ['iron']);
});

test('donate: one basket item leaves (the cheapest), nothing else; no double donation; 도감 unchanged', () => {
  const s = openState();
  give(s, 'carp', 1, 300); give(s, 'carp', 1, 120); give(s, 'carp', 1, 500); give(s, 'radish');
  s.dex.fish.carp = { n: 3, best: 52.1 };
  const dex = JSON.stringify(s.dex), coins = s.coins;
  const r = L.donate(s, 'fish', 'carp');
  assert.equal(r.ok, true);
  assert.equal(r.roomDone, false);
  assert.equal(L.bagCount(s, 'carp'), 2);
  assert.deepEqual(s.bag.filter((e) => e.id === 'carp').map((e) => e.v).sort((a, b) => a - b), [300, 500], 'the cheapest one went');
  assert.equal(L.bagCount(s, 'radish'), 1);
  assert.equal(JSON.stringify(s.dex), dex, '도감 stays as it was');
  assert.equal(s.coins, coins);
  assert.equal(s.museum.got.fish.carp, true);
  assert.equal(L.canDonate(s, 'fish', 'carp'), false, 'already on show');
  assert.deepEqual(L.donate(s, 'fish', 'carp'), { ok: false, why: 'got' });
  assert.equal(L.bagCount(s, 'carp'), 2, 'a refused donation takes nothing');
  assert.deepEqual(L.donate(s, 'fish', 'koi'), { ok: false, why: 'need' });
  assert.deepEqual(L.donate(s, 'fish', 'iron'), { ok: false, why: 'room' });
  assert.deepEqual(L.museumCount(s, 'fish'), { n: 1, m: L.MUSEUM_ROOMS.fish.ids.length });
  assert.equal(L.museumTotal(s).n, 1);
});

test('donate: stars and fossils go by record, the basket untouched and the records kept', () => {
  const s = withCave(openState());
  give(s, 'radish', 3);
  const bag = JSON.stringify(s.bag);
  L.seeStar(s, 'cygnus', 77);
  s.cave.done.trilobite = true; s.cave.parts.trilobite = [true, true, true];
  assert.equal(L.donate(s, 'star', 'cygnus').ok, true);
  assert.equal(L.donate(s, 'fossil', 'trilobite').ok, true);
  assert.equal(JSON.stringify(s.bag), bag);
  assert.equal(s.sky.seen.cygnus, 77, 'the observation record stays');
  assert.equal(s.cave.done.trilobite, true, 'the fossil record stays');
  assert.equal(L.donate(s, 'star', 'cygnus').why, 'got');
  // bugs too: the 곤충 record and the 표본 상자 stay
  s.coins += L.NET_COST; L.buyNet(s); L.catchBug(s, 'ant'); L.keepBug(s, 'ant');
  assert.equal(L.donate(s, 'bug', 'ant').ok, true);
  assert.equal(s.bugs.dex.ant, 1);
  assert.equal(s.bugs.box.ant, true);
});

test('a finished room pays its reward once; all six bring the last one', () => {
  const s = withCave(openState());
  const room = L.MUSEUM_ROOMS.fossil, before = s.coins;
  room.ids.forEach((id) => { s.cave.done[id] = true; });
  let last;
  room.ids.forEach((id, k) => {
    last = L.donate(s, 'fossil', id);
    assert.equal(last.ok, true);
    if (k < room.ids.length - 1) { assert.equal(last.roomDone, false); assert.equal(last.reward, undefined); }
  });
  assert.equal(last.roomDone, true);
  assert.equal(last.reward.coins, room.coins);
  assert.equal(last.reward.title, room.title);
  assert.equal(s.coins, before + room.coins);
  assert.equal(s.museum.done.fossil, true);
  assert.equal(s.yard.deco[room.deco], true, 'the room decoration');
  assert.deepEqual(L.museumTitles(s), [room.title]);
  // nothing more to give: no second reward
  assert.equal(L.donate(s, 'fossil', room.ids[0]).ok, false);
  assert.equal(s.coins, before + room.coins);
  // a reward is never paid twice even if the room is marked done but a new id is still open
  const t = withCave(openState());
  t.museum = { got: { fossil: {} }, done: { fossil: true } };
  room.ids.forEach((id) => { t.cave.done[id] = true; });
  const c0 = t.coins;
  room.ids.forEach((id) => { const r = L.donate(t, 'fossil', id); assert.equal(r.ok, true); assert.equal(r.reward, undefined); });
  assert.equal(t.coins, c0);
});

test('every room completed → each paid once, plus the 명예 관장 bonus', () => {
  const s = withCave(openState());
  s.noSell = true;   // a huge pile in the basket
  s.coins += L.NET_COST; L.buyNet(s);
  const R = L.MUSEUM_ROOMS;
  R.fish.ids.concat(R.mineral.ids, R.sea.ids).forEach((id) => give(s, id));
  R.bug.ids.forEach((id) => L.catchBug(s, id));
  R.fossil.ids.forEach((id) => { s.cave.done[id] = true; });
  R.star.ids.forEach((id) => L.seeStar(s, id, 1));
  const c0 = s.coins;
  let all = 0, paid = 0;
  ROOMS.forEach((r) => R[r].ids.forEach((id) => {
    const res = L.donate(s, r, id);
    assert.equal(res.ok, true, r + ':' + id);
    if (res.reward) paid += res.reward.coins;
    if (res.allDone) { all++; paid += res.allDone.coins; }
  }));
  assert.equal(all, 1);
  assert.equal(s.coins - c0, paid);
  assert.equal(paid, ROOMS.reduce((a, r) => a + R[r].coins, 0) + L.MUSEUM_ALL.coins);
  assert.equal(L.museumTotal(s).n, L.museumTotal(s).m);
  assert.equal(L.museumTitles(s).length, 7);
  assert.equal(s.bag.length, 0, 'every donated item left the basket');
});

test('curator lines change with progress', () => {
  const s = openState();
  const a = L.curatorLine(s, 0);
  assert.equal(typeof a, 'string');
  give(s, 'minnow'); L.donate(s, 'fish', 'minnow');
  const b = L.curatorLine(s, 0);
  assert.notEqual(a, b);
  s.museum.done.fish = true;
  assert.notEqual(L.curatorLine(s, 0), b);
});

test('save: decode(encode(s)) keeps s.museum; junk is dropped; old fixtures load without it', () => {
  const s = withCave(openState());
  give(s, 'minnow'); L.donate(s, 'fish', 'minnow');
  s.cave.done.ammonite = true; L.donate(s, 'fossil', 'ammonite');
  s.museum.done.star = true;
  const back = L.decode(L.encode(s));
  assert.deepEqual(back.museum, s.museum);
  const o = JSON.parse(L.encode(s));
  o.museum = { got: { fish: { minnow: true, nope: true, koi: 1 }, wat: { x: true } }, done: { sea: true, wat: true, fish: 'yes' } };
  const d = L.decode(JSON.stringify(o));
  assert.deepEqual(d.museum, { got: { fish: { minnow: true } }, done: { sea: true } });
  o.museum = 'x';
  assert.equal(L.decode(JSON.stringify(o)).museum, undefined);
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    if (/"(flat|cam|cave|sky|isle|museum|guide)":/.test(fs.readFileSync(path.join(dir, f), 'utf8'))) continue;   // saved by stage 7+
    const t = L.decode(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.ok(t, f);
    assert.equal(t.museum, undefined, f);
    assert.equal(L.museumTotal(t).n, 0);
  }
});
