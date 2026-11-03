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

test('⚙ 설정: 크기 and 효과음 on/off in their own keys, not in the save; 도감 has no settings left', () => {
  assert.match(soundSrc, /VOL_KEY = 'farmfish\.vol\.'/);
  assert.match(soundSrc, /SFX_KEY = 'farmfish\.sfx'/);
  const save = fs.readFileSync(path.join(__dirname, '..', 'src', 'logic', 'save.js'), 'utf8');
  assert.doesNotMatch(save, /farmfish\.(vol|sfx)|volume|\bVOL\b/);
  assert.doesNotMatch(fs.readFileSync(path.join(UI, 'dex.js'), 'utf8'), /setRow|sndSet|musSet|ambSet/);
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

// ---------- 소리 다양성 (docs/superpowers/specs/sound-map.md) ----------
const OLD32 = ['tap', 'cast', 'bite', 'strike', 'tick', 'catch', 'catchRare', 'catchLegend', 'lost', 'snap', 'plant', 'water',
  'harvest', 'coin', 'buy', 'level', 'error', 'splash', 'whoosh', 'hit',
  'swim', 'beep', 'jump', 'bump', 'shutter', 'swing', 'star', 'chime', 'pick', 'sting', 'puff', 'pet'];
// (file, sound) for every sfx call in src/ui, read the same way as the first test above
function sfxSites() {
  const out = [];
  for (const f of fs.readdirSync(UI).sort()) {
    const src = fs.readFileSync(path.join(UI, f), 'utf8');
    for (const m of src.matchAll(/\bsfx\(([^;]*?)\)/g)) for (const q of m[1].matchAll(/(?:^|[?:]\s*)'(\w+)'/g)) out.push(f + ' ' + q[1]);
  }
  return out;
}

test('소리 지도: every sfx call site is in sound-map.md, and a sound shared by two rows says why', () => {
  const md = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'superpowers', 'specs', 'sound-map.md'), 'utf8');
  const rows = [...md.matchAll(/^\| (\w+\.js):\d+ \|([^|]*)\|([^|]*)\|([^|]*)\| (\w+) \|([^|]*)\|$/gm)]
    .map((m) => ({ site: m[1] + ' ' + m[5], name: m[5], why: m[6].trim() }));
  assert.ok(rows.length >= 100, 'sound-map rows parsed: ' + rows.length);
  assert.deepEqual(rows.map((r) => r.site).sort(), sfxSites().sort(), 'sound-map.md lists exactly the (file, sound) pairs in src/ui');
  const by = {};
  rows.forEach((r) => { (by[r.name] = by[r.name] || []).push(r); });
  for (const n in by) if (by[n].length > 1) for (const r of by[n]) assert.ok(r.why, n + ' is used by ' + by[n].length + ' rows: each needs a 같이 쓰는 이유');
  for (const r of rows) assert.ok(defined.has(r.name), r.name + ' (sound-map) is in the SND table');
});

test('소리 다양성: a different action gets a different sound — only the documented pair shares one', () => {
  const count = {};
  for (const s of sfxSites()) { const n = s.split(' ')[1]; count[n] = (count[n] || 0) + 1; }
  assert.deepEqual(Object.keys(count).filter((n) => count[n] > 1), ['cast'], 'only 낚싯대 던지기 (touch + keyboard) shares a name');
  assert.ok(defined.size >= 100, 'sounds: ' + defined.size);
});

test('logic files make no sound', () => {
  const LOGIC = path.join(__dirname, '..', 'src', 'logic');
  for (const f of fs.readdirSync(LOGIC)) {
    const src = fs.readFileSync(path.join(LOGIC, f), 'utf8');
    assert.doesNotMatch(src, /\bsfx\(|\bsnd[A-Z]\w*\(|\bSND\b|\bmus[A-Z]\w*\(|AudioContext|AudioNode|createOscillator/, f + ' has a sound call');
  }
});

test('소리 다양성 keeps the old rules: voice cap, loudness, gaps per old sound, mute = no-op', () => {
  assert.match(soundSrc, /SND_VOICES = 8, SND_GAP = 60, SND_SOFT = 80/);
  assert.match(soundSrc, /var SND_LOUD = 8;/);
  assert.match(soundSrc, /var SND_GAPS = \{ tick: 150, swim: 700, beep: 300 \};/);
  assert.match(soundSrc, /lim\.threshold\.value = -6; lim\.knee\.value = 3; lim\.ratio\.value = 20;/);
  // every sound that is not one of the original 32 inherits one of their gaps (SND_FAM)
  const famSrc = soundSrc.slice(soundSrc.indexOf('var SND_FAM = {'), soundSrc.indexOf('var SND_TUNED'));
  const fam = {};
  for (const m of famSrc.matchAll(/(\w+): '(\w+)'/g)) fam[m[1]] = m[2];
  for (const n of defined) {
    if (OLD32.includes(n)) assert.ok(!fam[n], n + ' keeps its own gap');
    else assert.ok(OLD32.includes(fam[n]), n + ' inherits the gap of an original sound (SND_FAM), got ' + fam[n]);
  }
  // sfx still returns before anything else while there is no sound to play; so do the button click and the ★ reader
  const sfxFn = soundSrc.slice(soundSrc.indexOf('function sfx('), soundSrc.indexOf('function sndPlay('));
  assert.match(sfxFn, /^function sfx\(name, soft, arg\) \{\s*if \(!sndOn \|\| !sfxOn \|\| !sndCtx \|\| sndCtx\.state !== 'running' \|\| !SND\[name\]\) return;/);
  assert.match(soundSrc, /function sndClick\(e\) \{\s*if \(!sndOn \|\| !sfxOn \|\| !sndCtx\) return;/);
  assert.match(soundSrc, /function sndStar\(msg\) \{\s*if \(!sndOn \|\| !sfxOn \|\| !sndCtx \|\| sndCtx\.state !== 'running'\) return '';/);
  // per-play variation is UI Math.random only, and is put back after the one sound
  const play = soundSrc.slice(soundSrc.indexOf('function sndPlay('), soundSrc.indexOf('var SND_STAR'));
  assert.match(play, /Math\.random\(\)/);
  assert.match(play, /sndP = sndD = 1;/);
  assert.doesNotMatch(play, /\bL\.|rng/);
});

test('음악: the four tunes each have their own lead instrument', () => {
  const tunes = soundSrc.slice(soundSrc.indexOf('var MUS = {'), soundSrc.indexOf('var MUS_PC'));
  const leads = [...tunes.matchAll(/lead: \['(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(leads, ['bell', 'pluck', 'pad', 'box']);
  const inst = soundSrc.slice(soundSrc.indexOf('var MUS_INST = {'), soundSrc.indexOf('var MUS_VOICE'));
  for (const l of leads) assert.match(inst, new RegExp('\\n    ' + l + ': function'), l + ' is an instrument');
});
