// farm-fish/test/saves.test.js — saves written by RELEASED builds must load in the current build with nothing lost.
// Fixtures in test/fixtures/ were produced by each old build's own logic (encode of a well-played state).
// Never edit or delete a fixture; when a new version ships, ADD one.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = require('../build.js').build();
vm.runInThisContext(html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1], { filename: 'logic.js' });
const L = globalThis.Logic;

// Fields a player would notice losing. Each must come back exactly as the old build saved it.
const KEEP = [
  'coins', 'seeds', 'items', 'ms', 'dex.crops', 'dex.fish', 'dex.goldSeed',
  'up.rod', 'up.bait', 'up.field', 'up.scare', 'up.basket',
  'rep', 'bag', 'spotOk', 'spot', 'animals',
  'yard.house', 'yard.deco', 'yard.furn', 'yard.place', 'born', 'nick', 'tank',
  'pet.kind', 'pet.name', 'pet.f', 'forest.dex', 'junk.n', 'junk.letters', 'junk.box', 'fest.got', 'fest.rec'
];
const get = (o, p) => p.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);

const dir = path.join(__dirname, 'fixtures');
for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
  test('released save ' + f + ' loads with nothing lost, and stays stable', () => {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8'), old = JSON.parse(raw);
    const s = L.decode(raw);
    assert.ok(s, 'decode returned null');
    for (const p of KEEP) {
      const want = get(old, p);
      if (want === undefined) continue;          // that version did not have this field yet
      assert.deepEqual(get(s, p), want, f + ': ' + p);
    }
    old.plots.forEach((q, i) => assert.equal(s.plots[i].crop, q.crop, f + ': plot ' + i));
    assert.ok(s.plots.length >= old.plots.length, f + ': plots');
    const again = L.decode(L.encode(s));          // a second save/load must not drift
    for (const p of KEEP) assert.deepEqual(get(again, p), get(s, p), f + ': round-trip ' + p);
  });
}
