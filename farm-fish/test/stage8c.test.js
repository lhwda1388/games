// test/stage8c.test.js — stage 8 lane ③: 소문과 보물 지도
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = require('../build.js').build();
vm.runInThisContext(html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1], { filename: 'logic.js' });
const L = globalThis.Logic;
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const fresh = () => L.newState(0, seq(0.5));
// every scene of every map open
function rich() {
  const s = fresh();
  s.rep = 99; s.coins = 1e7;
  L.buySpot(s, 'river'); L.buySpot(s, 'sea');
  L.unlockForest(s, 0); L.unlockOrchard(s);
  L.isleOf(s).boat = true;
  return s;
}
const fill = (s, id) => { const m = L.tmapById(id); L.tmapOf(s).p[id] = Array.from({ length: m.n }, (_, k) => k); };
const envFor = (m) => ({ phase: (m.cond && m.cond.phase) || 'day', weather: (m.cond && m.cond.weather && m.cond.weather[0]) || 'clear', low: true });

test('6+ maps of 3–4 pieces, each in a real scene with its own X; some need a time/weather/tide', () => {
  assert.ok(L.TMAPS.length >= 6);
  const ids = new Set();
  for (const m of L.TMAPS) {
    assert.ok(!ids.has(m.id)); ids.add(m.id);
    assert.ok(m.n >= 3 && m.n <= 4, m.id);
    assert.ok(L.TMAP_SCENE_NAME[m.scene], m.id);
    assert.ok(m.x >= 0 && m.x < 180 && m.y >= 0 && m.y < 200, m.id);
    assert.ok(m.land && m.name && m.reward, m.id);
    assert.ok(!/[0-9]/.test(m.land), 'landmark words, no numbers: ' + m.id);
  }
  assert.ok(L.TMAPS.filter((m) => m.cond).length >= 3);
  assert.ok(L.TMAPS.some((m) => m.cond && m.cond.phase === 'night'));
  assert.ok(L.TMAPS.some((m) => m.cond && m.cond.weather));
  // rewards: rare seed, decoration, coins all appear
  assert.ok(L.TMAPS.some((m) => m.reward.gold) && L.TMAPS.some((m) => m.reward.deco) && L.TMAPS.some((m) => m.reward.coins));
  L.TMAPS.filter((m) => m.reward.deco).forEach((m) => assert.ok(L.decoById(m.reward.deco), m.reward.deco));
});

test('pieces drop deterministically with rng, only for maps whose scene is open', () => {
  const s = fresh();
  assert.equal(L.tmapDrop(s, 'junk', seq(0.99)), null, 'roll missed');
  assert.equal(s.tmap, undefined, 'nothing made on a miss');
  assert.equal(L.tmapDrop(s, 'nope', seq(0)), null);
  const a = L.tmapDrop(fresh(), 'junk', seq(0, 0, 0)), b = L.tmapDrop(fresh(), 'junk', seq(0, 0, 0));
  assert.deepEqual(a, b);
  // a fresh farm can only reach 밭·마당 maps
  for (let k = 0; k < 40; k++) L.tmapDrop(s, 'junk', seq(0, k / 40, 0.3));
  const got = Object.keys(s.tmap.p);
  assert.ok(got.length > 0);
  for (const id of got) assert.ok(['farm', 'yard'].includes(L.tmapById(id).scene), id);
  // pieces never repeat and never exceed n
  for (const id of got) {
    const p = s.tmap.p[id];
    assert.equal(new Set(p).size, p.length);
    assert.ok(p.length <= L.tmapById(id).n);
  }
  assert.ok(L.tmapComplete(s, 'dock') && L.tmapComplete(s, 'pen'));
  assert.equal(L.tmapDrop(s, 'junk', seq(0)), null, 'nothing left to drop');
  // a richer farm gets the others too
  const r = rich();
  for (let k = 0; k < 200; k++) L.tmapDrop(r, ['junk', 'cave', 'drift'][k % 3], seq(0, (k % 7) / 7, (k % 4) / 4));
  assert.ok(L.TMAPS.every((m) => L.tmapComplete(r, m.id)), 'all maps reachable');
});

test('completing a map: the drop says so; pieces live outside the basket', () => {
  const s = fresh();
  const m = L.tmapById('dock');
  let last;
  for (let k = 0; k < 30 && !L.tmapComplete(s, 'dock'); k++) {
    last = L.tmapDrop(s, 'junk', seq(0, 0, k / 30));
    assert.equal(last.id, 'dock');
  }
  assert.equal(last.complete, true); assert.equal(last.have, m.n);
  assert.equal(s.bag.length, 0, 'never in the basket');
  L.sellAll && L.sellAll(s);
  assert.ok(L.tmapComplete(s, 'dock'), 'selling the basket cannot touch pieces');
});

test('dig: right spot pays once, wrong spot only hints, needs a complete map', () => {
  const s = fresh(), m = L.tmapById('dock');
  assert.deepEqual(L.tmapDig(s, 'farm', m.x, m.y, envFor(m)), { ok: false, why: 'none' }, 'map not complete');
  L.tmapOf(s).p.dock = [0, 1];
  assert.equal(L.tmapDig(s, 'farm', m.x, m.y, envFor(m)).why, 'none');
  fill(s, 'dock');
  const c0 = s.coins, g0 = s.seeds.gold;
  const far = L.tmapDig(s, 'farm', 170, 20, envFor(m));
  assert.deepEqual(far, { ok: false, why: 'far', id: 'dock' });
  assert.equal(L.tmapDig(s, 'farm', m.x + 25, m.y, envFor(m)).why, 'near');
  assert.equal(L.tmapDig(s, 'yard', m.x, m.y, envFor(m)).why, 'none', 'other scene');
  assert.equal(s.coins, c0, 'nothing lost'); assert.equal(s.seeds.gold, g0);
  assert.ok(L.tmapComplete(s, 'dock'), 'pieces kept after misses');
  assert.match(L.tmapHint(m, 'far'), new RegExp(m.land));
  const ok = L.tmapDig(s, 'farm', m.x + 3, m.y - 3, envFor(m));
  assert.equal(ok.ok, true); assert.equal(ok.id, 'dock');
  assert.equal(s.seeds.gold, g0 + m.reward.gold); assert.equal(s.coins, c0 + m.reward.coins);
  assert.ok(s.dex.goldSeed);
  assert.ok(L.tmapDug(s, 'dock'));
  assert.equal(L.tmapDig(s, 'farm', m.x, m.y, envFor(m)).why, 'none', 'treasure once per map');
  assert.equal(L.tmapDugCount(s), 1);
});

test('condition gating: moon map only at night, weather maps only in that weather, 갯벌 only at low tide', () => {
  const s = rich();
  for (const m of L.TMAPS.filter((x) => x.cond)) {
    fill(s, m.id);
    const bad = Object.assign(envFor(m), {});
    if (m.cond.phase) bad.phase = m.cond.phase === 'night' ? 'day' : 'night';
    if (m.cond.weather) bad.weather = 'clear';
    if (m.cond.tide) bad.low = false;
    const c0 = s.coins;
    const r = L.tmapDig(s, m.scene, m.x, m.y, bad);
    assert.deepEqual(r, { ok: false, why: 'cond', id: m.id }, m.id);
    assert.equal(s.coins, c0);
    assert.ok(L.tmapHint(m, 'cond').length > 0);
    assert.equal(L.tmapDig(s, m.scene, m.x, m.y, envFor(m)).ok, true, m.id);
  }
  const p = L.tmapById('palm');
  assert.equal(L.tmapCondOk(p, { phase: 'night' }), true);
  assert.equal(L.tmapCondOk(p, { phase: 'evening' }), false);
  assert.match(L.tmapHint(p, 'cond'), /달/);
});

test('decoration treasure goes to the yard (or 보관함); owned already → coins instead', () => {
  const s = rich(), m = L.TMAPS.find((x) => x.reward.deco);
  fill(s, m.id);
  const r = L.tmapDig(s, m.scene, m.x, m.y, envFor(m));
  assert.equal(r.reward.deco, m.reward.deco);
  assert.equal(s.yard.deco[m.reward.deco], true);
  const t = rich(); L.grantDeco(t, m.reward.deco); fill(t, m.id);
  const c0 = t.coins, r2 = L.tmapDig(t, m.scene, m.x, m.y, envFor(m));
  assert.equal(r2.reward.deco, undefined);
  assert.equal(t.coins, c0 + (m.reward.coins || 0) + 1000);
  assert.equal(L.buyDeco(fresh(), m.reward.deco).ok, false, 'not in the shop');
});

test('rumors: 15+ lines from residents, bottle letters and visitors, about fish/forage/eggs/maps', () => {
  assert.ok(L.RUMORS.length >= 15);
  assert.equal(new Set(L.RUMORS.map((r) => r.id)).size, L.RUMORS.length);
  const by = (src) => L.RUMORS.filter((r) => r.src === src);
  assert.ok(by('res').length >= 5 && by('letter').length >= 3 && by('visitor').length >= 3);
  for (const r of by('res')) assert.ok(L.VIL_IDS.includes(r.who) || L.RES_EXTRA.some((x) => x.id === r.who), r.id);   // stage 10 ③: new residents too
  for (const r of by('visitor')) assert.ok(L.visitorById(r.who), r.id);
  for (const a of ['fish', 'forage', 'egg', 'map']) assert.ok(L.RUMORS.some((r) => r.about === a), a);
  for (const r of L.RUMORS) assert.ok(L.RUMOR_ABOUT[r.about] && r.text.length > 8, r.id);
});

test('hearing rumors: deterministic, each once, saved in order', () => {
  const s = fresh();
  assert.equal(L.rumorHear(s, 'res', 'fisher', seq(0.99)), null);
  assert.equal(s.rumor, undefined);
  const a = L.rumorHear(s, 'res', 'fisher', seq(0));
  assert.equal(a.who, 'fisher');
  const b = L.rumorHear(s, 'res', 'fisher', seq(0));
  assert.notEqual(a.id, b.id);
  assert.equal(L.rumorHear(s, 'res', 'fisher', seq(0)), null, 'fisher has told all');
  assert.equal(L.rumorHear(s, 'res', 'nobody', seq(0)), null);
  const c = L.rumorHear(s, 'letter', null, seq(0));
  assert.equal(c.src, 'letter');
  const d = L.rumorHear(s, 'visitor', 'merchant', seq(0));
  assert.equal(d.who, 'merchant');
  assert.deepEqual(s.rumor.got, [a.id, b.id, c.id, d.id]);
  assert.equal(L.rumorCount(s), 4);
  assert.ok(L.rumorHeard(s, c.id));
  // every line can be heard
  const t = fresh();
  for (const r of L.RUMORS) L.rumorHear(t, r.src, r.who || null, seq(0));
  for (let k = 0; k < 10; k++) L.rumorHear(t, 'letter', null, seq(0));
  assert.equal(L.rumorCount(t), L.RUMORS.length);
});

test('GUIDE has 소문 수첩 and 보물 지도 entries', () => {
  for (const id of ['rumor', 'tmap']) {
    const g = L.guideById(id);
    assert.ok(g && g.how, id);
    assert.equal(L.guideOpen(fresh(), id), true);
  }
});

test('save: s.tmap and s.rumor round-trip; junk dropped', () => {
  const s = rich();
  L.tmapOf(s).p.dock = [2, 0]; fill(s, 'palm'); s.tmap.dug.palm = true;
  L.rumorHear(s, 'letter', null, seq(0)); L.rumorHear(s, 'res', 'kid', seq(0));
  const t = L.decode(L.encode(s));
  assert.deepEqual(t.tmap, { p: { dock: [0, 2], palm: [0, 1, 2, 3] }, dug: { palm: true } });
  assert.deepEqual(t.rumor, s.rumor);
  const raw = JSON.parse(L.encode(s));
  raw.tmap = { p: { dock: [0, 0, 7, -1, 1.5, 'x', 1], evil: [0] }, dug: { dock: 'yes', well: true, bad: true } };
  raw.rumor = { got: ['r_tuna', 'r_tuna', 'nope', 5] };
  const u = L.decode(JSON.stringify(raw));
  assert.deepEqual(u.tmap, { p: { dock: [0, 1] }, dug: { well: true } });
  assert.deepEqual(u.rumor, { got: ['r_tuna'] });
  raw.tmap = 'bad'; raw.rumor = [1];
  const v = L.decode(JSON.stringify(raw));
  assert.ok(v); assert.equal(v.tmap, undefined); assert.equal(v.rumor, undefined);
  const f = L.decode(L.encode(fresh()));
  assert.equal(f.tmap, undefined); assert.equal(f.rumor, undefined);
});

test('old fixtures load unchanged without s.tmap / s.rumor, and maps work on them', () => {
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    if (/"(tmap|rumor)":/.test(raw)) continue;   // saved by stage 8 ③+
    const s = L.decode(raw);
    assert.ok(s, f);
    assert.equal(s.tmap, undefined, f); assert.equal(s.rumor, undefined, f);
    const again = L.decode(L.encode(s));
    assert.deepEqual(JSON.parse(L.encode(again)), JSON.parse(L.encode(s)), f);
    L.tmapDrop(s, 'junk', seq(0, 0, 0));
    assert.ok(Object.keys(s.tmap.p).length === 1, f);
  }
});
