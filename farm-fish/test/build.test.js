// test/build.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build, STYLE, BODY, LOGIC, UI } = require('../build.js');

test('index.html is up to date with src/ (run: node build.js)', () => {
  const onDisk = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(onDisk === build(), 'index.html is stale: run `node build.js` and commit it');
});

test('every src file is listed in build.js exactly once', () => {
  const src = path.join(__dirname, '..', 'src');
  const onDisk = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else onDisk.push(path.relative(src, p).split(path.sep).join('/'));
    });
  })(src);
  const listed = ['page.html'].concat(STYLE, BODY, LOGIC, UI);
  assert.deepEqual(listed.slice().sort(), onDisk.sort());
});
