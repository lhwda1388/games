// farm-fish/test/rec.test.js — 소리 도감: sound table + conditions, 녹음기, auto/tap ★, milestones, 박물관 별관, save guards,
// and the "기존 플레이 무영향" points (no s.rec without a 녹음기, museum numbers untouched, old saves identical, no rng).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = require('../build.js').build();
vm.runInThisContext(html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1], { filename: 'logic.js' });
const L = globalThis.Logic;
const SRC = path.join(__dirname, '..', 'src');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const fresh = (rep, coins) => { const s = L.newState(0, seq(0.5)); s.rep = rep; s.coins = coins; return s; };
const owned = () => { const s = fresh(L.REC_REP, L.REC_COST); assert.deepEqual(L.recBuy(s), { ok: true }); return s; };
const ctx = (o) => Object.assign({ now: 0, view: 'yard', spot: '', phase: 'day', season: 'spring', weather: 'clear', festival: null, fire: false, chime: false }, o);

test('spec numbers: 녹음기 3,000 at ★5; milestones 5·10·15·20·all; ~24 sounds with one legend', () => {
  assert.equal(L.REC_COST, 3000);
  assert.equal(L.REC_REP, 5);
  assert.ok(L.REC_SOUNDS.length >= 24 && L.REC_SOUNDS.length <= 28, String(L.REC_SOUNDS.length));
  assert.deepEqual(L.REC_MS.map((m) => m.n), [5, 10, 15, 20, L.REC_SOUNDS.length]);
  assert.equal(L.REC_SOUNDS.filter((d) => d.legend).length, 1);
  assert.equal(L.REC_MS[L.REC_MS.length - 1].deco, 'gramophone');
  const d = L.decoById('gramophone');
  assert.ok(d && d.merchant && d.from === 'rec', '축음기 is a reward, never sold');
  assert.equal(L.buyDeco(fresh(99, 1e6), 'gramophone').ok, false);
});

test('every sound: unique id, name, hint, a when list in the fish-def format, an ambient one-shot that exists', () => {
  const sound = read('ui/sound.js'), recUi = read('ui/rec.js');
  const evSrc = sound.slice(sound.indexOf('var AMB_EV = {'), sound.indexOf('function ambWant'));
  const evs = new Set([...evSrc.matchAll(/^\s{4}(\w+):\s*function/gm)].map((m) => m[1]));
  const rate = recUi.slice(recUi.indexOf('var REC_RATE = {'), recUi.indexOf('var REC_DWELL'));
  const OLD = ['bird', 'cicada', 'cricket', 'frog', 'owl', 'drop', 'crackle'];   // the 환경음 that ambWant schedules on its own
  const ids = new Set();
  for (const d of L.REC_SOUNDS) {
    assert.ok(!ids.has(d.id), 'dup ' + d.id); ids.add(d.id);
    assert.ok(d.name && d.hint && d.grp, d.id);
    assert.ok(Array.isArray(d.when) && d.when.length, d.id);
    for (const w of d.when) for (const k of Object.keys(w)) assert.ok(['phase', 'season', 'weather', 'where', 'fest', 'fire', 'chime'].includes(k), d.id + ' ' + k);
    assert.ok(evs.has(d.ev), d.id + ': AMB_EV.' + d.ev);
    // a new one-shot has its own rate; an old one keeps the rate ambWant already gives it (never doubled up)
    if (OLD.includes(d.ev)) assert.doesNotMatch(rate, new RegExp('\\b' + d.ev + ':'), d.ev);
    else assert.match(rate, new RegExp('\\b' + d.ev + ':'), d.ev + ' has a rate');
  }
  for (const id of OLD) assert.ok(evs.has(id), 'old one-shot kept: ' + id);
});

test('conditions: time, season, weather, place, festival, fire, 풍경; indoors only the train', () => {
  const has = (o, id) => L.recNow(ctx(o)).includes(id);
  assert.ok(has({ phase: 'morning' }, 'sparrow'));
  assert.ok(!has({ phase: 'night' }, 'sparrow'));
  assert.ok(!has({ weather: 'rain' }, 'sparrow'));
  assert.ok(!has({ season: 'winter' }, 'sparrow'));
  assert.ok(has({ view: 'forest', phase: 'morning' }, 'cuckoo'));
  assert.ok(!has({ view: 'yard', phase: 'morning' }, 'cuckoo'));
  assert.ok(has({ view: 'farm', spot: 'pond', phase: 'night' }, 'frog'));
  assert.ok(!has({ view: 'farm', spot: 'pond', phase: 'night', season: 'autumn' }, 'frog'));
  assert.ok(has({ view: 'farm', spot: 'river' }, 'brook'));
  assert.ok(has({ view: 'farm', spot: 'sea' }, 'surf'));
  assert.ok(has({ view: 'farm', spot: 'ocean' }, 'whale'));
  assert.ok(has({ view: 'trnvalley' }, 'fall'));
  assert.ok(has({ view: 'trnonsen' }, 'bubble'));
  assert.ok(has({ weather: 'rain' }, 'rain'));
  assert.ok(has({ fire: true, view: 'cmpforest' }, 'campfire'));
  assert.ok(!has({ view: 'cmpforest' }, 'campfire'));
  assert.ok(has({ chime: true }, 'windbell'));
  assert.ok(!has({}, 'windbell'));
  assert.ok(has({ view: 'peak' }, 'windbell'));
  assert.ok(has({ festival: 'summer', season: 'summer', phase: 'night' }, 'firework'));
  assert.ok(!has({ season: 'summer', phase: 'night' }, 'firework'));
  assert.ok(has({ weather: 'snow', season: 'winter' }, 'snowstep'));
  assert.deepEqual(L.recNow(ctx({ view: 'house', weather: 'rain' })), []);
  assert.deepEqual(L.recNow(ctx({ view: 'museum', phase: 'night' })), []);
  assert.deepEqual(L.recNow(ctx({ view: 'trnride' })), ['whistle']);
});

test('the legend: fog + early morning + 계곡, and only in some game minutes (same for everyone)', () => {
  const at = (now, o) => L.recNow(ctx(Object.assign({ now, view: 'trnvalley', phase: 'morning', weather: 'fog' }, o))).includes('mistsong');
  let n = 0;
  for (let m = 0; m < 400; m++) if (at(m * 60e3)) n++;
  assert.ok(n > 40 && n < 160, 'about 1 in 4 minutes: ' + n);
  const yes = [...Array(400).keys()].map((m) => m * 60e3).find((t) => at(t));
  assert.equal(at(yes), true); assert.equal(at(yes + 30e3), true, 'the whole minute');
  assert.equal(at(yes, { weather: 'clear' }), false);
  assert.equal(at(yes, { phase: 'day' }), false);
  assert.equal(at(yes, { view: 'forest' }), false);
});

test('녹음기: ★ and coins checked; s.rec made only by buying it', () => {
  const s = fresh(L.REC_REP - 1, 1e6);
  assert.deepEqual(L.recBuy(s), { ok: false, why: 'rep' });
  s.rep = L.REC_REP; s.coins = L.REC_COST - 1;
  assert.deepEqual(L.recBuy(s), { ok: false, why: 'coins' });
  assert.equal(s.rec, undefined);
  s.coins = L.REC_COST;
  assert.deepEqual(L.recBuy(s), { ok: true });
  assert.equal(s.coins, 0);
  assert.deepEqual(s.rec, { tool: true, has: {}, got: {}, mus: {} });
  assert.deepEqual(L.recBuy(s), { ok: false, why: 'owned' });
});

test('auto = ★1 into an empty slot only; tap = ★2, then ★3, then nothing', () => {
  const s = owned();
  assert.deepEqual(L.recTake(s, 'sparrow', 'auto'), { ok: true, q: 1, first: true, up: false, ms: [] });
  assert.equal(L.recTake(s, 'sparrow', 'auto').ok, false);
  assert.equal(L.recTake(s, 'sparrow', 'tap').q, 2);
  assert.equal(L.recTake(s, 'sparrow', 'auto').ok, false, 'auto never lowers');
  const r = L.recTake(s, 'sparrow', 'tap');
  assert.equal(r.q, 3); assert.equal(r.up, true);
  assert.deepEqual(L.recTake(s, 'sparrow', 'tap'), { ok: false, why: 'max', q: 3 });
  assert.equal(L.recTake(s, 'owl', 'tap').q, 2, 'a first tap is ★2');
  assert.equal(L.recCount(s), 2);
  assert.equal(L.recTake(s, 'nope', 'tap').why, 'none');
});

test('auto-record never fires without a 녹음기, and touches nothing', () => {
  const s = fresh(50, 1e6), before = JSON.stringify(s);
  for (const d of L.REC_SOUNDS) for (const how of ['auto', 'tap']) assert.deepEqual(L.recTake(s, d.id, how), { ok: false, why: 'tool' });
  assert.equal(JSON.stringify(s), before);
  assert.equal(s.rec, undefined);
  assert.equal(L.recDonate(s, 'sparrow').why, 'closed');
  assert.deepEqual(L.recAnnexCan(s), []);
  // the UI tick and the 환경음 hooks start with the 녹음기 check (so a save without one never gets s.rec)
  const ui = read('ui/rec.js');
  for (const fn of ['recTick', 'recHeard', 'recAmbAdd']) {
    const body = ui.slice(ui.indexOf('function ' + fn + '('));
    assert.match(body.split('\n')[1], /L\.recOk\(S\)/, fn + ' checks the 녹음기 first');
  }
});

test('milestones: coins + title at 5/10/15/20, the 축음기 at all; each paid once', () => {
  const s = owned(); s.coins = 0;
  const got = [];
  L.REC_SOUNDS.forEach((d) => { got.push(...L.recTake(s, d.id, 'auto').ms); });
  assert.deepEqual(got.map((m) => m.n), [5, 10, 15, 20, L.REC_SOUNDS.length]);
  assert.equal(s.coins, L.REC_MS.reduce((a, m) => a + m.coins, 0));
  assert.equal(s.yard.deco.gramophone, true);
  assert.equal(got[4].deco, 'gramophone');
  assert.deepEqual(L.recTitles(s), L.REC_MS.map((m) => m.title));
  const c = s.coins;
  L.REC_SOUNDS.forEach((d) => { assert.deepEqual(L.recTake(s, d.id, 'tap').ms, []); });
  assert.equal(s.coins, c, 'not paid again');
});

// a farm with every museum room done (명예 관장)
function curator() {
  const s = fresh(50, 1e6);
  assert.ok(L.buyScope(s).ok);
  s.museum = { got: {}, done: {} };
  L.MUSEUM_ROOM_IDS.forEach((r) => { s.museum.got[r] = {}; L.MUSEUM_ROOMS[r].ids.forEach((id) => { s.museum.got[r][id] = true; }); s.museum.done[r] = true; });
  return s;
}
test('박물관 별관 소리실: separate from the six rooms; 명예 관장 and every number stay the same', () => {
  assert.deepEqual(L.MUSEUM_ROOM_IDS, ['fish', 'bug', 'fossil', 'mineral', 'star', 'sea']);
  const s = curator();
  const look = () => JSON.stringify([L.museumTotal(s), L.museumAllDone(s), L.museumTitles(s), [0, 1, 2, 3].map((k) => L.curatorLine(s, k)),
    L.MUSEUM_ROOM_IDS.map((r) => L.museumCount(s, r))]);
  const before = look();
  assert.ok(L.museumAllDone(s)); assert.ok(L.museumTitles(s).includes('명예 관장'));
  assert.equal(L.recDonate(s, 'sparrow').why, 'closed', 'no 녹음기: no annex');
  s.coins += L.REC_COST; s.rep = 50; assert.ok(L.recBuy(s).ok);
  assert.equal(L.recDonate(s, 'sparrow').why, 'need');
  L.REC_SOUNDS.forEach((d) => L.recTake(s, d.id, 'auto'));
  assert.equal(L.recAnnexCan(s).length, L.REC_SOUNDS.length);
  assert.equal(look(), before, 'museum numbers after recording');
  const coins = s.coins;
  let last;
  L.REC_SOUNDS.forEach((d) => { last = L.recDonate(s, d.id); assert.ok(last.ok, d.id); });
  assert.deepEqual(last.reward, { coins: L.REC_ANNEX.coins, title: L.REC_ANNEX.title });
  assert.equal(s.coins, coins + L.REC_ANNEX.coins);
  assert.equal(L.recDonate(s, 'sparrow').why, 'got');
  assert.deepEqual(L.recAnnexCount(s), { n: L.REC_SOUNDS.length, m: L.REC_SOUNDS.length });
  assert.equal(L.recQ(s, 'sparrow'), 1, 'the recording stays');
  assert.equal(look(), before, 'museum numbers after the full annex');
  assert.ok(L.recTitles(s).includes(L.REC_ANNEX.title));
  // the six-room museum logic never reads s.rec
  assert.doesNotMatch(read('logic/museum.js'), /\.rec\b|\brec[A-Z]/);
});

test('save: decodeRec keeps good fields when others are broken; round-trip stable', () => {
  const s = owned();
  L.recTake(s, 'sparrow', 'auto'); L.recTake(s, 'owl', 'tap'); L.recTake(s, 'owl', 'tap');
  const again = L.decode(L.encode(s));
  assert.deepEqual(again.rec, s.rec);
  const base = JSON.parse(L.encode(s));
  const with_ = (rec) => L.decode(JSON.stringify(Object.assign({}, base, { rec }))).rec;
  assert.equal(with_({ has: { sparrow: 1 } }), undefined, 'no tool: no 녹음기');
  assert.equal(with_('x'), undefined);
  assert.equal(with_([1]), undefined);
  assert.deepEqual(with_({ tool: true, has: 'broken', got: { m5: true, bogus: true, annex: 1 }, mus: null }), { tool: true, has: {}, got: { m5: true }, mus: {} });
  assert.deepEqual(with_({ tool: true, has: { sparrow: 2, owl: 9, frog: 0, nope: 1, gull: '3' }, got: [], mus: { sparrow: true, owl: true } }),
    { tool: true, has: { sparrow: 2 }, got: {}, mus: { sparrow: true } }, 'a donated sound must still be recorded');
  assert.ok(L.decode(JSON.stringify(Object.assign({}, base, { rec: { tool: true, has: { sparrow: 1 } } }))), 'the rest of the save still loads');
});

test('old saves: no s.rec appears, re-encode is the same, the guide gets no new mark', () => {
  const dir = path.join(__dirname, 'fixtures');
  const files = fs.readdirSync(dir).filter((n) => n.endsWith('.json'));
  assert.ok(files.length >= 18);
  for (const f of files) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    if (JSON.parse(raw).rec) continue;   // the fixture made with a 녹음기
    const s = L.decode(raw);
    assert.equal(s.rec, undefined, f);
    assert.equal(L.guideOpen(s, 'rec'), false, f);
    assert.ok(!L.guideNew(s).includes('rec'), f);
    const e1 = L.encode(s), e2 = L.encode(L.decode(e1));
    assert.equal(e2, e1, f + ': stable');
    assert.ok(!('rec' in JSON.parse(e1)), f);
  }
});

test('no rng: the logic never rolls dice, so fishing/junk/treasure/gift rolls are untouched', () => {
  const src = read('logic/rec.js');
  assert.doesNotMatch(src, /Math\.random|\brng\b/);
  for (const f of ['logic/fishing.js', 'logic/junk.js', 'logic/treasure.js', 'logic/residents.js', 'logic/museum.js'])
    assert.doesNotMatch(read(f), /\brec[A-Z]\w*\(|REC_/, f + ' does not call 소리 도감');
});

test('guide: exactly one entry, locked until the 녹음기 with the real numbers', () => {
  const g = L.GUIDE.filter((e) => e.id === 'rec');
  assert.equal(g.length, 1);
  assert.equal(L.GUIDE.filter((e) => /녹음/.test(e.how + e.lock)).length, 1);
  assert.match(g[0].lock, new RegExp('★' + L.REC_REP));
  assert.match(g[0].lock, /3,000/);
  assert.equal(L.guideOpen(fresh(50, 1e6), 'rec'), false);
  assert.equal(L.guideOpen(owned(), 'rec'), true);
});

test('names: every new top-level name is rec*/REC_* (the shared scopes overwrite silently)', () => {
  for (const f of ['logic/rec.js', 'ui/rec.js']) {
    const src = read(f);
    const names = [...src.matchAll(/^ {2}function (\w+)/gm)].map((m) => m[1]);
    for (const m of src.matchAll(/^ {2}var (.*)$/gm)) for (const v of m[1].matchAll(/(?:^|,\s*)([A-Za-z_$][\w$]*)\s*=/g)) names.push(v[1]);
    assert.ok(names.length > 10, f);
    for (const n of names) assert.match(n, /^(rec|REC_)|^(addRecHooks|decodeRec)$/, f + ': ' + n);
  }
});
