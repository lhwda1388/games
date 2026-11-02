// farm-fish/test/sound.test.js — 소리: every sfx('name') used in ui/ is a sound sound.js can play
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const UI = path.join(__dirname, '..', 'src', 'ui');
const soundSrc = fs.readFileSync(path.join(UI, 'sound.js'), 'utf8');
const table = soundSrc.slice(soundSrc.indexOf('var SND = {'), soundSrc.indexOf('var SND_GAPS'));
const defined = new Set([...table.matchAll(/^\s{4}(\w+):\s*function/gm)].map((m) => m[1]));

test('every sfx(\'name\') in src/ui names a sound in the sound.js table', () => {
  assert.ok(defined.size >= 15, 'sound table parsed: ' + [...defined].join(','));
  const used = new Set();
  for (const f of fs.readdirSync(UI)) {
    const src = fs.readFileSync(path.join(UI, f), 'utf8');
    // sfx('x'), and the names a ternary picks: sfx(a ? 'x' : 'y')
    for (const m of src.matchAll(/\bsfx\(([^;]*?)\)/g)) {
      for (const q of m[1].matchAll(/(?:^|[?:]\s*)'(\w+)'/g)) {
        assert.ok(defined.has(q[1]), f + ': sfx(\'' + q[1] + '\') is not in the SND table');
        used.add(q[1]);
      }
    }
  }
  for (const n of defined) assert.ok(used.has(n), n + ' (in the table) is hooked somewhere');
  for (const n of ['tap', 'cast', 'bite', 'strike', 'tick', 'catch', 'catchRare', 'catchLegend', 'lost', 'snap', 'plant', 'water',
    'harvest', 'coin', 'buy', 'level', 'error', 'splash', 'whoosh', 'hit',
    'swim', 'beep', 'jump', 'bump', 'shutter', 'swing', 'star', 'chime', 'pick', 'sting', 'puff', 'pet']) assert.ok(used.has(n), n + ' is hooked somewhere');
});

test('sound on/off is kept in its own localStorage key, not in the save', () => {
  assert.match(soundSrc, /SND_KEY = 'farmfish\.sound'/);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'src', 'logic', 'save.js'), 'utf8'), /sound/);
});

test('음악: a tune for every time of day, music on/off in its own key, not in the save', () => {
  const tunes = soundSrc.slice(soundSrc.indexOf('var MUS = {'), soundSrc.indexOf('var MUS_PC'));
  for (const p of ['morning', 'day', 'evening', 'night']) assert.match(tunes, new RegExp('\\n    ' + p + ': \\{'), p + ' has a tune');
  assert.match(soundSrc, /MUS_KEY = 'farmfish\.music'/);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'src', 'logic', 'save.js'), 'utf8'), /music/);
});

test('환경음: every fishing spot in SCENES has a water sound, on/off in its own key, not in the save', () => {
  const spots = soundSrc.slice(soundSrc.indexOf('var AMB_SPOT = {'), soundSrc.indexOf('var AMB_VIEW'));
  const bgSrc = fs.readFileSync(path.join(UI, 'background.js'), 'utf8');
  const ids = [...bgSrc.slice(bgSrc.indexOf('var SCENES = {'), bgSrc.indexOf('var scene =')).matchAll(/(\w+):\s*\{\s*cx:/g)].map((m) => m[1]);
  for (const f of fs.readdirSync(UI)) for (const m of fs.readFileSync(path.join(UI, f), 'utf8').matchAll(/\bSCENES\.(\w+)\s*=/g)) ids.push(m[1]);
  assert.ok(ids.length >= 10, 'SCENES parsed: ' + ids.join(','));
  for (const id of ids) assert.match(spots, new RegExp('\\b' + id + ': \\{'), id + ' has an ambient profile');
  assert.match(soundSrc, /AMB_KEY = 'farmfish\.ambient'/);
  assert.doesNotMatch(fs.readFileSync(path.join(__dirname, '..', 'src', 'logic', 'save.js'), 'utf8'), /ambient/);
});
