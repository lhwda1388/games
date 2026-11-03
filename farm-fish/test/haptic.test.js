// farm-fish/test/haptic.test.js — 진동: hapt() only in approved ui files, no-op without support / when off, never in logic or the save
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const read = (...p) => fs.readFileSync(path.join(SRC, ...p), 'utf8');
const hapSrc = read('ui', 'haptic.js');

// run haptic.js in a sandbox with a fake navigator / localStorage / clock
function load(nav, store, clock, doc) {
  const fn = new Function('navigator', 'localStorage', 'performance', 'document', hapSrc + '\nreturn { hapt: hapt, haptTap: haptTap, haptIOS: haptIOS, haptSet: haptSet, haptOK: haptOK, on: function () { return haptOn; } };');
  return fn(nav, store, { now: () => clock.t }, doc);
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
    if (/\bhapt(Tap)?\(/.test(read('ui', f))) found.add(f);
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
  assert.match(read('ui', 'settings.js'), /if \(haptOK\(\) \|\| haptIOS\(\)\)/);
});

// iOS 톡: fake document that records the hidden switch label and its clicks
function mkDoc() {
  const d = { made: [], clicks: 0, appended: 0, stopped: 0 };
  const el = (tag) => { const e = { tag, kids: [], attrs: {}, style: {}, listeners: {}, setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.kids.push(c); }, addEventListener(t, f) { this.listeners[t] = f; }, click() { d.clicks++; if (this.listeners.click) this.listeners.click({ stopPropagation() { d.stopped++; } }); } }; d.made.push(e); return e; };
  d.createElement = el;
  d.body = { appendChild() { d.appended++; } };
  return d;
}
const IOS = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', maxTouchPoints: 5 };

test('haptTap() clicks one hidden switch label on iOS, rate-limited, click kept from bubbling', () => {
  const clock = { t: 1000 }, doc = mkDoc();
  const h = load(IOS, mkStore(), clock, doc);
  assert.equal(h.haptIOS(), true);
  h.haptTap();
  assert.equal(doc.clicks, 1);
  const lbl = doc.made.find((e) => e.tag === 'label'), sw = doc.made.find((e) => e.tag === 'input');
  assert.equal(lbl.attrs['aria-hidden'], 'true');
  assert.equal(sw.type, 'checkbox'); assert.equal('switch' in sw.attrs, true);
  assert.equal(lbl.style.cssText.includes('display'), false);
  assert.equal(doc.stopped, 1);
  clock.t += 50; h.haptTap(); assert.equal(doc.clicks, 1);   // inside the 150ms gap
  clock.t += 200; h.haptTap(); assert.equal(doc.clicks, 2);
  assert.equal(doc.appended, 1);   // created once, lazily
  const ipad = load({ userAgent: 'Macintosh', platform: 'MacIntel', maxTouchPoints: 5 }, mkStore(), clock, mkDoc());
  assert.equal(ipad.haptIOS(), true);
});

test('haptTap() is a no-op when the 진동 setting is off', () => {
  const clock = { t: 1000 }, doc = mkDoc(), calls = [];
  load(IOS, mkStore({ 'farmfish.vibe': '0' }), clock, doc).haptTap();
  load({ vibrate: (p) => calls.push(p) }, mkStore({ 'farmfish.vibe': '0' }), clock, doc).haptTap();
  assert.equal(doc.clicks, 0); assert.deepEqual(calls, []);
});

test('haptTap() makes no DOM on a non-iOS platform without vibrate, and uses vibrate when present', () => {
  const clock = { t: 1000 }, doc = mkDoc();
  const h = load({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)', platform: 'Win32', maxTouchPoints: 0 }, mkStore(), clock, doc);
  assert.equal(h.haptIOS(), false);
  h.haptTap();
  assert.equal(doc.made.length, 0); assert.equal(doc.clicks, 0);
  const calls = []; const a = load({ vibrate: (p) => calls.push(p), userAgent: 'iPhone' }, mkStore(), clock, doc);
  a.haptTap(); assert.deepEqual(calls, [10]); assert.equal(doc.made.length, 0);
  assert.doesNotThrow(() => load(IOS, mkStore(), clock, undefined).haptTap());
});

test('haptTap( only in the gesture handlers: band, pond strike, cave', () => {
  const found = new Set();
  for (const f of fs.readdirSync(path.join(SRC, 'ui'))) if (/\bhaptTap\(/.test(read('ui', f))) found.add(f);
  assert.deepEqual([...found].sort(), ['band.js', 'cave.js', 'haptic.js', 'pond.js']);
  for (const f of fs.readdirSync(path.join(SRC, 'logic'))) assert.doesNotMatch(read('logic', f), /haptTap|haptIOS/, f);
});
