// test/stage11a.test.js — stage 11 lane ①: 옛 포구 (꾸러미 채우기, 건물 복구, 할머니)
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = require('../build.js').build();
vm.runInThisContext(html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1], { filename: 'logic.js' });
const L = globalThis.Logic;
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };

// a farm with the 마을 and the 바다 낚시터 open
function pstate() {
  const s = L.newState(0, seq(0.5));
  s.rep = Math.max(s.rep, L.VILLAGE_REP, L.SPOTS.sea.rep);
  s.coins = 1e7;
  s.spotOk = s.spotOk || {}; s.spotOk.river = true; s.spotOk.sea = true;
  s.noSell = true;
  return s;
}
const bldg = (id) => L.PORT_BLDGS.find((b) => b.id === id);
const bundle = (id) => { for (const b of L.PORT_BLDGS) for (const u of b.bundles) if (u.id === id) return u; return null; };
// puts one of each item into every 'bag'/'junk' bundle of the building and checks every 'rec' one
function fillBldg(s, id) {
  for (const u of bldg(id).bundles) {
    if (u.kind === 'rec') { assert.ok(L.portCheck(s, u.id).ok, u.id); continue; }
    for (const it of u.ids) {
      if (u.kind === 'junk') { const j = L.junkOf(s); j.n[it] = (j.n[it] || 0) + 1; }
      else L.bagAdd(s, it, 10);
      assert.ok(L.portPut(s, u.id, it).ok, u.id + ' ' + it);
    }
  }
}
function recsMet(s) {
  s.museum = { got: { fish: {} }, done: {} };
  L.MUSEUM_ROOMS.fish.ids.slice(0, 30).forEach((id) => { s.museum.got.fish[id] = true; });
  s.sky = { own: true, seen: {}, wish: null, n: 0 };
  L.STARS.slice(0, 5).forEach((c) => { s.sky.seen[c.id] = 1; });
  s.cave = { own: true, e: 0, t: 0, wall: [], parts: {}, done: {}, dex: {}, lv: 0, n: 0 };
  L.FOSSILS.slice(0, 3).forEach((f) => { s.cave.done[f.id] = true; });
}

test('four buildings in order with the spec bundles and coins', () => {
  assert.deepEqual(L.PORT_BLDGS.map((b) => b.id), ['bridge', 'shipyard', 'market', 'station']);
  assert.deepEqual(L.PORT_BLDGS.map((b) => b.coins), [50000, 150000, 300000, 600000]);
  assert.deepEqual(bundle('forest').ids, ['pinecone', 'acorn', 'chestnut', 'gosari']);
  assert.deepEqual(bundle('junk').ids, ['boot', 'can', 'bottle', 'key']);
  assert.deepEqual(L.PORT_BLDGS.map((b) => b.bundles.length), [3, 3, 4, 4]);
  const ids = new Set();
  for (const b of L.PORT_BLDGS) for (const u of b.bundles) { assert.ok(!ids.has(u.id), u.id); ids.add(u.id); assert.ok(u.coins > 0 && u.name, u.id); }
});

test('every bundle item id exists (typo guard)', () => {
  for (const b of L.PORT_BLDGS) for (const u of b.bundles) {
    if (u.kind === 'rec') { assert.ok(['museum', 'stars', 'fossils'].includes(u.need.rec) && u.need.n > 0, u.id); continue; }
    for (const id of u.ids) {
      if (u.kind === 'junk') assert.ok(L.junkById(id), id);
      else assert.ok(L.itemInfo(id), id);
      assert.ok(L.portItemName(id), id);
    }
  }
});

test('portShown needs the 마을 and the 바다 낚시터', () => {
  const s = L.newState(0, seq(0.5));
  assert.equal(L.portShown(s), false);
  s.rep = L.VILLAGE_REP;
  assert.equal(L.portShown(s), false, 'no sea yet');
  s.spotOk = { sea: true };
  assert.equal(L.portShown(s), true);
  s.rep = 0;
  assert.equal(L.portShown(s), false, 'no village');
  assert.equal(L.portPut(s, 'forest', 'acorn').why, 'closed');
});

test('only the current building takes items; unknown ids are refused', () => {
  const s = pstate();
  L.bagAdd(s, 'driftwood', 20);
  assert.equal(L.portPut(s, 'drift', 'driftwood').why, 'order');
  assert.equal(L.portPut(s, 'forest', 'driftwood').why, 'bundle');
  assert.equal(L.portPut(s, 'nope', 'acorn').why, 'bundle');
  assert.equal(L.portPut(s, 'forest', 'acorn').why, 'need');
  assert.equal(s.port, undefined, 'nothing made yet');
  assert.equal(s.bag.length, 1);
});

test('putting takes the cheapest one; the same slot twice is "got"', () => {
  const s = pstate();
  L.bagAdd(s, 'trout', 300); L.bagAdd(s, 'trout', 120); L.bagAdd(s, 'trout', 200);
  const r = L.portPut(s, 'river', 'trout');
  assert.ok(r.ok);
  assert.ok(s.port && s.port.got.river.trout);
  assert.deepEqual(s.bag.map((e) => e.v).sort((a, b) => a - b), [200, 300]);
  assert.equal(L.portPut(s, 'river', 'trout').why, 'got');
  assert.equal(s.bag.length, 2);
});

test('a junk slot takes one 고물 from s.junk', () => {
  const s = pstate();
  fillBldg(s, 'bridge'); assert.ok(L.portBuild(s).ok);
  const j = L.junkOf(s); j.n.boot = 2;
  assert.ok(L.portPut(s, 'junk', 'boot').ok);
  assert.equal(L.junkCount(s, 'boot'), 1);
  assert.equal(L.portPut(s, 'junk', 'can').why, 'need');
});

test('a full bundle pays its coins once', () => {
  const s = pstate();
  const ids = bundle('forest').ids;
  let paid = 0;
  ids.forEach((id, k) => {
    L.bagAdd(s, id, 5);
    const c0 = s.coins, r = L.portPut(s, 'forest', id);
    assert.ok(r.ok);
    assert.equal(!!r.bundleDone, k === ids.length - 1, id);
    if (r.bundleDone) { assert.equal(r.coins, bundle('forest').coins); paid += s.coins - c0; }
    else assert.equal(s.coins, c0);
  });
  assert.equal(paid, bundle('forest').coins);
  assert.ok(L.portBundleDone(s, 'forest'));
  L.bagAdd(s, 'acorn', 5);
  assert.equal(L.portPut(s, 'forest', 'acorn').why, 'got');
});

test('record slots take nothing and check the record', () => {
  const s = pstate();
  for (const id of ['bridge', 'shipyard', 'market']) { fillBldg(s, id); assert.ok(L.portBuild(s).ok, id); }
  assert.equal(L.portCheck(s, 'museum').why, 'need');
  recsMet(s);
  L.bagAdd(s, 'acorn', 5);
  const bag = JSON.stringify(s.bag), museum = JSON.stringify(s.museum), sky = JSON.stringify(s.sky), cave = JSON.stringify(s.cave);
  const c0 = s.coins, r = L.portCheck(s, 'museum');
  assert.ok(r.ok && r.bundleDone);
  assert.equal(s.coins, c0 + bundle('museum').coins);
  assert.ok(L.portCheck(s, 'stars').ok); assert.ok(L.portCheck(s, 'fossils').ok);
  assert.equal(L.portCheck(s, 'museum').why, 'got');
  assert.equal(JSON.stringify(s.bag), bag); assert.equal(JSON.stringify(s.museum), museum);
  assert.equal(JSON.stringify(s.sky), sky); assert.equal(JSON.stringify(s.cave), cave);
  assert.equal(L.portCheck(s, 'gems').why, 'bundle');
});

test('portBuild: bundles first, then coins; then the next building', () => {
  const s = pstate();
  assert.equal(L.portNext(s).id, 'bridge');
  assert.equal(L.portBuild(s).why, 'bundles');
  fillBldg(s, 'bridge');
  s.coins = bldg('bridge').coins - 1;
  assert.equal(L.portBuild(s).why, 'coins');
  s.coins = bldg('bridge').coins + 7;
  const r = L.portBuild(s);
  assert.ok(r.ok); assert.equal(r.bldg.id, 'bridge');
  assert.equal(s.coins, 7);
  assert.ok(L.portDone(s, 'bridge')); assert.ok(!L.portDone(s, 'shipyard'));
  assert.equal(L.portNext(s).id, 'shipyard');
});

test('after the 기차역: title, no next building, granny and hint lines', () => {
  const s = pstate();
  assert.deepEqual(L.portTitles(s), []);
  assert.ok(L.PORT_GRANNY.start.includes(L.grannyLine(s, seq(0))));
  assert.match(L.portHint(s), /다리/);
  recsMet(s);
  for (const b of L.PORT_BLDGS) { fillBldg(s, b.id); assert.ok(L.portBuild(s).ok, b.id); }
  assert.equal(L.portNext(s), null);
  assert.equal(L.portBuild(s).ok, false);
  assert.deepEqual(L.portTitles(s), ['포구를 되살린 사람']);
  for (const k of ['start', 'bridge', 'shipyard', 'market', 'station']) assert.equal(L.PORT_GRANNY[k].length, 2, k);
  assert.ok(L.PORT_GRANNY.station.includes(L.grannyLine(s, seq(0.99))));
  assert.equal(typeof L.portHint(s), 'string');
});

test('guide has a port line, open with the port, lock text from the real rule', () => {
  const g = L.guideById('port');
  assert.ok(g && g.how && g.lock);
  const s = L.newState(0, seq(0.5));
  assert.equal(L.guideOpen(s, 'port'), false);
  assert.equal(L.guideOpen(pstate(), 'port'), true);
});

test('decode(encode(s)) keeps the port; unknown ids are dropped; auc is left alone', () => {
  const s = pstate();
  fillBldg(s, 'bridge'); L.portBuild(s);
  L.bagAdd(s, 'copper', 5); L.portPut(s, 'ore', 'copper');
  const back = L.decode(L.encode(s));
  assert.deepEqual(back.port, s.port);
  const o = JSON.parse(L.encode(s));
  o.port.got.ore.mithril = true; o.port.got.nope = { acorn: true }; o.port.done.castle = true; o.port.got.forest.acorn = 1;
  const d = L.decode(JSON.stringify(o));
  assert.equal(d.port.got.ore.mithril, undefined);
  assert.equal(d.port.got.nope, undefined);
  assert.equal(d.port.done.castle, undefined);
  assert.equal(d.port.got.forest.acorn, undefined);
  assert.ok(d.port.done.bridge && d.port.got.ore.copper);
  // a junk value instead of an object is ignored
  const o2 = JSON.parse(L.encode(L.newState(0, seq(0.5)))); o2.port = 'x';
  assert.equal(L.decode(JSON.stringify(o2)).port, undefined);
});

test('old fixtures load without s.port', () => {
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    if (/"port":/.test(raw)) continue;   // saved by stage 11+
    const s = L.decode(raw);
    assert.ok(s, f);
    assert.equal(s.port, undefined, f);
    assert.equal(typeof L.portShown(s), 'boolean', f);
  }
});

test('당나귀 never eats a 지키기 item, nor the last one the 포구 building still needs', () => {
  const s = pstate();
  assert.equal(L.unlockForest(s, 0).ok, true);
  assert.equal(L.buyDonkey(s, '', 0).ok, true);
  s.port = { got: {}, done: { bridge: true, shipyard: true } };   // 어판장 next: its 밭 꾸러미 wants potato
  L.bagAdd(s, 'potato', 60);
  assert.equal(L.portWants(s, 'potato'), true);
  assert.equal(L.donkeyFeed(s, 1000, 0).why, 'food', 'the only potato waits for the bundle');
  L.bagAdd(s, 'potato', 50);
  assert.equal(L.donkeyFeed(s, 1000, 0).id, 'potato', 'a spare one is fine');
  assert.equal(L.bagCount(s, 'potato'), 1);
  s.keep = { radish: true }; s.donkey.fn = 0;   // past the daily cap check
  L.bagAdd(s, 'radish', 30);
  assert.equal(L.donkeyFeed(s, 1000, 0).why, 'food', 'kept radish stays');
});
