// farm-fish/test/build.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build, STYLE, BODY, LOGIC, UI } = require('../build.js');

test('index.html is up to date with src/ (run: node farm-fish/build.js)', () => {
  const onDisk = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(onDisk === build(), 'index.html is stale: run `node farm-fish/build.js` and commit it');
});

test('every src file is listed in build.js exactly once', () => {
  const src = path.join(__dirname, '..', 'src');
  const onDisk = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const p = path.join(dir, e.name);
      if (e.name.startsWith('.')) return;   // tool state dirs (.omc) are not sources
      if (e.isDirectory()) walk(p);
      else onDisk.push(path.relative(src, p).split(path.sep).join('/'));
    });
  })(src);
  const listed = ['page.html'].concat(STYLE, BODY, LOGIC, UI);
  assert.deepEqual(listed.slice().sort(), onDisk.sort());
});

// logic/ and ui/ files each share one scope: a second top-level `function NAME` silently replaces the first
// (게임장's slot-machine drawSlot once replaced the 마당 empty-spot drawSlot and blanked 마당·숲·갯벌)
test('no top-level function name is declared twice in the logic or ui block', () => {
  const html = build();
  for (const id of ['logic', 'ui']) {
    const m = html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>'));
    assert.ok(m, id + ' block');
    const seen = {}, dup = [], re = /^ {2}function ([A-Za-z_$][\w$]*)\s*\(/gm;
    let f;
    while ((f = re.exec(m[1]))) { if (seen[f[1]]) dup.push(f[1]); seen[f[1]] = true; }
    assert.ok(Object.keys(seen).length > 100, id + ': the scan sees the functions');
    assert.deepEqual(dup, [], id);
  }
});
