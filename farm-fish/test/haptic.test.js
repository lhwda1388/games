// farm-fish/test/haptic.test.js — 진동: hapt() only in approved ui files, no-op without support / when off, never in logic or the save
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const read = (...p) => fs.readFileSync(path.join(SRC, ...p), 'utf8');
const hapSrc = read('ui', 'haptic.js');

// run haptic.js in a sandbox with a fake navigator / localStorage / clock
function load(nav, store, clock) {
  const fn = new Function('navigator', 'localStorage', 'performance', hapSrc + '\nreturn { hapt: hapt, haptSet: haptSet, haptOK: haptOK, on: function () { return haptOn; } };');
  return fn(nav, store, { now: () => clock.t });
}
const mkStore = (init) => { const d = Object.assign({}, init); return { d, getItem: (k) => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); } }; };

test('hapt() calls navigator.vibrate with the pattern', () => {
  const calls = [], clock = { t: 1000 };
  const h = load({ vibrate: (p) => { calls.push(p); return true; } }, mkStore(), clock);
  h.hapt([40, 60, 40]);
  assert.deepEqual(calls, [[40, 60, 40]]);
});

test('hapt() is a silent no-op without navigator.vibrate', () => {
  const clock = { t: 1000 };
  const h = load({}, mkStore(), clock);
  assert.equal(h.haptOK(), false);
  assert.doesNotThrow(() => h.hapt(50));
  const h2 = load(undefined, mkStore(), clock);
  assert.doesNotThrow(() => h2.hapt(50));
});

test('hapt() is a no-op when the 진동 setting is off, and the setting lives in farmfish.vibe', () => {
  const calls = [], clock = { t: 1000 }, nav = { vibrate: (p) => { calls.push(p); } };
  const store = mkStore({ 'farmfish.vibe': '0' });
  const h = load(nav, store, clock);
  h.hapt(50);
  assert.deepEqual(calls, []);
  h.haptSet(true);
  assert.equal(store.d['farmfish.vibe'], '1');
  clock.t += 1000; h.hapt(50);
  assert.ok(calls.length >= 1);
  h.haptSet(false);
  assert.equal(store.d['farmfish.vibe'], '0');
  const n = calls.length; clock.t += 1000; h.hapt(50);
  assert.equal(calls.length, n);
});

test('hapt() rate-limits: 150ms gap, wider when asked, and survives a throwing vibrate', () => {
  const calls = [], clock = { t: 1000 };
  const h = load({ vibrate: (p) => { calls.push(p); } }, mkStore(), clock);
  h.hapt(1); clock.t += 100; h.hapt(2); clock.t += 60; h.hapt(3);
  assert.deepEqual(calls, [1, 3]);
  clock.t += 200; h.hapt(4, 800); clock.t += 700; h.hapt(5, 800);
  assert.deepEqual(calls, [1, 3, 5]);   // 4 came 200ms after 3: under its 800ms gap
  const bad = load({ vibrate: () => { throw new Error('x'); } }, mkStore(), clock);
  assert.doesNotThrow(() => bad.hapt(1));
});

test('every hapt( call sits in the approved ui files', () => {
  const allowed = new Set(['haptic.js', 'pond.js', 'fx.js', 'band.js', 'temper.js', 'dive.js', 'ride.js', 'cave.js', 'settings.js']);
  const found = new Set();
  for (const f of fs.readdirSync(path.join(SRC, 'ui'))) {
    if (/\bhapt\(/.test(read('ui', f))) found.add(f);
  }
  for (const f of found) assert.ok(allowed.has(f), f + ' must not buzz');
  for (const f of ['pond.js', 'fx.js', 'band.js', 'temper.js', 'dive.js', 'ride.js', 'cave.js']) assert.ok(found.has(f), f + ' buzzes');
});

test('the 진동 key stays out of the save, logic/ has no vibrate or hapt', () => {
  assert.match(hapSrc, /HAPT_KEY = 'farmfish\.vibe'/);
  assert.doesNotMatch(read('logic', 'save.js'), /vibe|vibrate|hapt/);
  for (const f of fs.readdirSync(path.join(SRC, 'logic'))) assert.doesNotMatch(read('logic', f), /vibrate|\bhapt/, f);
});

test('the 진동 row in ⚙ 설정 only shows where navigator.vibrate exists', () => {
  assert.match(read('ui', 'settings.js'), /if \(haptOK\(\)\)/);
});
