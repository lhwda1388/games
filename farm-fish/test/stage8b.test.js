// test/stage8b.test.js — stage 8 ② 손맛: fish personalities in the reel, boss phases, 월척 records, 어탁, share code
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = require('../build.js').build();
vm.runInThisContext(html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1], { filename: 'logic.js' });
const L = globalThis.Logic;
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
// small seeded rng (mulberry32) so the simulations are repeatable
function rngOf(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const DT = 1 / 30;

// a player who reads the signals (with a short reaction delay)
function sensible(r, me) {
  const ev = r.ev, danger = r.warn > 0 || r.burst > 0;
  if (danger) me.seen = me.seen || r.t; else me.seen = 0;
  const late = me.seen && r.t - me.seen >= 0.2;
  if (r.burst > 0 && ev === 'sound') { me.p = (me.p || 0) + DT; return me.p % 0.6 < 0.3 && r.tension < 0.8; }   // short pulls
  if (r.burst > 0 && ev === 'run') return r.turn > 0;
  if (late) return false;
  if (me.hold && r.tension >= 0.8) me.hold = false;
  else if (!me.hold && r.tension <= 0.45) me.hold = true;
  return me.hold;
}
// hold the whole time, whatever the fish does
function naive() { return true; }
function play(id, size, policy, seed, rod, calm) {
  const r = L.newReel({ id, size }, rod === undefined ? 1 : rod), rng = rngOf(seed), me = { hold: true };
  if (calm) { r.phases = [['burst']]; r.kinds = ['burst']; r.ev = 'burst'; r.tmax = L.REEL_MAX; }   // the same fish as a 순한
  let res = null, phases = [0];
  for (let k = 0; k < 4000 && !res; k++) {
    res = L.reelStep(r, DT, policy(r, me), rng);
    if (r.phase !== phases[phases.length - 1]) phases.push(r.phase);
  }
  return { res, phases, r };
}
function winRate(id, policy, n, rod, calm) {
  const f = L.fishById(id); let w = 0;
  for (let k = 0; k < n; k++) if (play(id, f.min + (f.max - f.min) * ((k * 0.618) % 1), policy, 1000 + k, rod, calm).res === 'caught') w++;
  return w / n;
}
const kindsOf = (id) => [...new Set(L.temperOf(id).flat())];

test('every fish has a personality from data; 순한 fish keep today\'s reel', () => {
  for (const f of L.FISH) {
    const t = L.temperOf(f.id);
    assert.ok(Array.isArray(t) && t.length >= 1 && t.length <= 3, f.id);
    t.forEach((ph) => ph.forEach((k) => assert.ok(L.TEMPER_KINDS[k], f.id + ' ' + k)));
    assert.equal(typeof L.temperName(f.id), 'string');
    assert.deepEqual(L.temperOf(f.id), L.temperOf(f.id), 'deterministic');
  }
  assert.deepEqual(L.temperOf('minnow'), [['burst']]);
  assert.equal(L.temperName('minnow'), '순한형');
  // the four kinds are all used
  const used = new Set(L.FISH.flatMap((f) => kindsOf(f.id)));
  for (const k of ['burst', 'jump', 'sound', 'run']) assert.ok(used.has(k), k);
});

test('rarer fish are more mixed; every legend is a 2–3 phase boss', () => {
  const avg = (rar) => { const fs = L.FISH.filter((f) => f.rarity === rar); return fs.reduce((a, f) => a + kindsOf(f.id).length, 0) / fs.length; };
  assert.ok(avg('흔함') < avg('드묾') + 0.01 && avg('드묾') < avg('희귀'), [avg('흔함'), avg('드묾'), avg('희귀')].join(' '));
  assert.ok(L.FISH.filter((f) => f.rarity === '희귀').every((f) => kindsOf(f.id).length >= 2));
  for (const f of L.FISH.filter((x) => x.rarity === '전설')) {
    const n = L.temperOf(f.id).length;
    assert.ok(n >= 2 && n <= 3, f.id + ' phases ' + n);
    assert.ok(L.isBoss(f.id));
    assert.match(L.temperName(f.id), /보스/);
  }
  assert.ok(!L.isBoss('carp'));
  // an id the table does not list still gets a stable answer from its rarity
  assert.deepEqual(L.temperOf('nope'), [['burst']]);
});

test('순한 reel is exactly the old model (same numbers for the same inputs)', () => {
  // reference: the stage-7 reelStep, copied here verbatim
  function oldStep(r, dt, holding, rng) {
    if (r.result) return r.result;
    r.t += dt;
    if (r.burst > 0) r.burst = Math.max(0, r.burst - dt);
    else if (r.warn > 0) { r.warn -= dt; if (r.warn <= 0) { r.warn = 0; r.burst = 0.4 + rng() * 0.45; } }
    else {
      r.next -= dt;
      if (r.next <= 0) { r.warn = 0.4; r.dir = rng() < 0.5 ? -1 : 1; r.next = (0.6 + rng() * 1.1) / Math.pow(r.power, 0.35); }
    }
    const pulling = r.burst > 0;
    if (holding) {
      r.tension += (0.2 + (pulling ? 1.3 * r.power : 0)) * r.tgain * dt;
      if (!pulling) r.catch += 0.3 / Math.pow(r.power, 0.3) * dt;
    } else {
      r.tension = Math.max(0, r.tension - 0.8 * dt);
      r.catch -= (pulling ? 0.04 * r.power : 0.02) * dt;
    }
    if (r.tension >= 1) r.result = 'snap';
    else if (r.catch >= 1) r.result = 'caught';
    else if (r.catch <= 0 || r.t >= 10) r.result = 'escaped';
    return r.result;
  }
  for (const id of L.FISH.filter((f) => L.temperName(f.id) === '순한형').map((f) => f.id)) {
    for (let seed = 1; seed <= 6; seed++) {
      const a = L.newReel({ id, size: L.fishById(id).max }, seed % 4), b = JSON.parse(JSON.stringify(a));
      const ra = rngOf(seed), rb = rngOf(seed), pol = rngOf(seed + 99);
      let k = 0, x = null, y = null;
      for (; k < 900 && !x; k++) {
        const h = pol() < 0.7;
        x = L.reelStep(a, DT, h, ra); y = oldStep(b, DT, h, rb);
        assert.equal(a.tension, b.tension, id + ' tension @' + k);
        assert.equal(a.catch, b.catch, id + ' catch @' + k);
      }
      assert.equal(x, y, id);
    }
  }
});

test('점프: pulling during a jump spikes tension; a tell comes first; holding through loses more', () => {
  const id = L.FISH.find((f) => L.temperName(f.id) === '점프형').id;
  const r = L.newReel({ id, size: L.fishById(id).min }, 1), rng = rngOf(7);
  let sawTell = false, jumpT = 0, k = 0;
  for (; k < 2000 && !r.result; k++) {
    if (r.warn > 0 && r.ev === 'jump') sawTell = true;
    if (r.burst > 0 && r.ev === 'jump') { assert.ok(sawTell, 'tell before the jump'); break; }
    L.reelStep(r, DT, false, rng);
  }
  assert.ok(r.burst > 0 && r.ev === 'jump', 'a jump came');
  // during a jump: holding raises tension much faster than a 순한 burst would
  const t0 = r.tension, c0 = r.catch;
  const held = JSON.parse(JSON.stringify(r)), let_ = JSON.parse(JSON.stringify(r));
  L.reelStep(held, 0.1, true, rngOf(1)); L.reelStep(let_, 0.1, false, rngOf(1));
  assert.ok(held.tension - t0 > (0.2 + 1.3 * r.power) * r.tgain * 0.1 * 1.4, 'spike');
  assert.ok(let_.catch >= c0, 'letting go during a jump does not lose the fish');
  const good = winRate(id, sensible, 60), bad = winRate(id, naive, 60);
  assert.ok(good >= 0.6, 'sensible wins ' + good);
  assert.ok(bad < good - 0.15, 'naive ' + bad + ' vs sensible ' + good);
  // with the best rod, holding through works on a 순한 of the same size far more often than on this one
  const calmHold = winRate(id, naive, 60, 3, true), hold = winRate(id, naive, 60, 3);
  assert.ok(hold < calmHold - 0.2, 'hold-through ' + hold + ' vs as 순한 ' + calmHold);
});

test('버팀: short pulls beat a long hold while it digs in', () => {
  const id = L.FISH.find((f) => L.temperName(f.id) === '버팀형').id;
  const r = L.newReel({ id, size: L.fishById(id).min }, 1), rng = rngOf(3);
  for (let k = 0; k < 2000 && !(r.burst > 0 && r.ev === 'sound'); k++) L.reelStep(r, DT, false, rng);
  assert.ok(r.burst > 0 && r.ev === 'sound');
  r.tension = 0; r.burst = 5;   // a long dig, to compare the two ways of pulling for one second
  const long = JSON.parse(JSON.stringify(r)), pump = JSON.parse(JSON.stringify(r)), q = rngOf(2);
  for (let k = 0; k < 30; k++) { L.reelStep(long, DT, true, q); L.reelStep(pump, DT, (k % 18) < 9, q); }
  assert.ok(pump.catch > long.catch, 'pumping gains more line ' + pump.catch + ' vs ' + long.catch);
  assert.ok(pump.tension < long.tension, 'and keeps the line safer');
  const good = winRate(id, sensible, 60), bad = winRate(id, naive, 60);
  assert.ok(good >= 0.6, 'sensible wins ' + good);
  assert.ok(bad < good - 0.15, 'naive ' + bad + ' vs sensible ' + good);
  // with the best rod, holding through works on a 순한 of the same size far more often than on this one
  const calmHold = winRate(id, naive, 60, 3, true), hold = winRate(id, naive, 60, 3);
  assert.ok(hold < calmHold - 0.2, 'hold-through ' + hold + ' vs as 순한 ' + calmHold);
});

test('질주: side runs flip direction with a short rest at each turn', () => {
  const id = L.FISH.find((f) => L.temperName(f.id) === '질주형').id;
  const r = L.newReel({ id, size: L.fishById(id).min }, 1), rng = rngOf(5);
  let turns = 0, wasTurn = false, dirs = new Set();
  for (let k = 0; k < 3000 && !r.result; k++) {
    L.reelStep(r, DT, false, rng);
    if (r.burst > 0 && r.ev === 'run') { dirs.add(r.dir); if (r.turn > 0 && !wasTurn) turns++; }
    wasTurn = r.turn > 0;
    r.catch = 0.5;   // keep it on the line to watch
  }
  assert.ok(turns >= 2, 'turns ' + turns);
  assert.equal(dirs.size, 2);
  // reeling in the turn gains line faster than reeling in calm water
  const t = L.newReel({ id, size: L.fishById(id).min }, 1);
  t.ev = 'run'; t.burst = 1; t.turn = 0.3; t.leg = 0;
  const c = L.newReel({ id, size: L.fishById(id).min }, 1);
  c.next = 9;
  L.reelStep(t, 0.1, true, rngOf(1)); L.reelStep(c, 0.1, true, rngOf(1));
  assert.ok(t.catch - 0.25 > (c.catch - 0.25) * 1.5);
  assert.ok(winRate(id, sensible, 60) >= 0.6);
});

test('mixed fish use both of their kinds', () => {
  const id = L.FISH.find((f) => f.rarity === '희귀').id, want = kindsOf(id), seen = new Set();
  for (let seed = 1; seed < 30; seed++) {
    const r = L.newReel({ id, size: 50 }, 3), rng = rngOf(seed);
    for (let k = 0; k < 600 && !r.result; k++) { L.reelStep(r, DT, false, rng); r.catch = 0.5; if (r.burst > 0) seen.add(r.ev); }
  }
  for (const k of want) assert.ok(seen.has(k), id + ' ' + k);
});

test('boss: phases advance with the catch bar, each change is signalled, and a good player can win', () => {
  for (const f of L.FISH.filter((x) => x.rarity === '전설')) {
    const n = L.temperOf(f.id).length;
    const r = L.newReel({ id: f.id, size: f.min }, 3);
    assert.equal(r.phase, 0);
    assert.ok(r.tmax >= L.REEL_MAX, 'bosses get at least the usual time');
    // drive the catch bar up by hand and watch the phase flip
    const seen = [];
    for (let k = 0; k < 4000 && !r.result; k++) {
      r.tension = 0; r.catch = Math.min(0.99, r.catch + 0.004);
      const before = r.phase;
      L.reelStep(r, DT, false, rngOf(k));
      if (r.phase !== before) { seen.push(r.phase); assert.ok(r.fx > 0, 'signal on change'); assert.deepEqual(r.kinds, L.temperOf(f.id)[r.phase]); }
      if (r.phase === n - 1 && r.catch >= 0.98) break;
    }
    assert.deepEqual(seen, Array.from({ length: n - 1 }, (_, i) => i + 1), f.id);
  }
  // sensible play with the best rod lands a legend reasonably often; the fight goes through every phase
  const boss = L.FISH.find((x) => x.rarity === '전설' && L.temperOf(x.id).length === 3);
  let wins = 0, full = 0;
  for (let k = 0; k < 40; k++) {
    const g = play(boss.id, (boss.min + boss.max) / 2, sensible, 500 + k, 3);
    if (g.res === 'caught') { wins++; if (g.phases.length === 3) full++; }
  }
  assert.ok(wins >= 12, boss.id + ' wins ' + wins + '/40');
  assert.equal(full, wins, 'every win went through all phases');
});

test('a lost fish only loses that fish', () => {
  const s = L.newState(0, seq(0.5));
  s.coins = 321; s.dex.fish.crucian = { n: 2, best: 20 };
  s.fish = { phase: 'reel', x: 1, y: 1, roll: { id: 'tuna', size: 150 } };
  const before = JSON.stringify({ c: s.coins, d: s.dex, b: s.bag });
  L.loseFish(s);
  assert.equal(s.fish.phase, 'idle');
  assert.equal(JSON.stringify({ c: s.coins, d: s.dex, b: s.bag }), before);
});

test('월척 records: 신기록 with the old best and the difference; 어탁 top list', () => {
  const s = L.newState(0, seq(0.5));
  let out = L.landFish(s, { id: 'crucian', size: 20 });
  assert.equal(out.first, true); assert.equal(out.record, false, 'a first catch is a 도감 등록, not a 신기록');
  out = L.landFish(s, { id: 'crucian', size: 18 });
  assert.equal(out.record, false); assert.equal(out.newBest, false);
  out = L.landFish(s, { id: 'crucian', size: 23.4 });
  assert.equal(out.record, true); assert.equal(out.prev, 20); assert.equal(out.gain, 3.4);
  assert.equal(s.dex.fish.crucian.best, 23.4);
  assert.deepEqual(L.topRecords(s, 4), [{ id: 'crucian', size: 23.4 }]);
  L.landFish(s, { id: 'minnow', size: 9 }); L.landFish(s, { id: 'catfish', size: 60 });
  L.landFish(s, { id: 'carp', size: 41 }); L.landFish(s, { id: 'koi', size: 99 });
  assert.deepEqual(L.topRecords(s, 4).map((e) => e.id), ['koi', 'catfish', 'carp', 'crucian']);
  assert.equal(L.topRecords(L.newState(0, seq(0.5)), 4).length, 0);
  // the floating-point gain is rounded to one decimal
  out = L.landFish(s, { id: 'koi', size: 100.3 });
  assert.equal(out.gain, 1.3);
});

test('share code: carries the next records, round-trips, old codes still decode', () => {
  const s = L.newState(0, seq(0.5));
  s.born = 0;
  L.landFish(s, { id: 'crucian', size: 23.4 });
  const one = L.shareStats(s, 0);
  assert.equal(one.recs, undefined, 'one species: the old code, nothing extra');
  const oldCode = L.encodeShare(one);
  assert.equal(oldCode.split('-').length, 13);
  assert.deepEqual(L.decodeShare(oldCode), one);
  L.landFish(s, { id: 'koi', size: 99 }); L.landFish(s, { id: 'catfish', size: 60.5 }); L.landFish(s, { id: 'carp', size: 41 }); L.landFish(s, { id: 'minnow', size: 9 });
  const st = L.shareStats(s, 0);
  assert.deepEqual(st.fish, { id: 'koi', size: 99 });
  assert.deepEqual(st.recs, [{ id: 'catfish', size: 60.5 }, { id: 'carp', size: 41 }, { id: 'crucian', size: 23.4 }]);
  const code = L.encodeShare(st);
  assert.ok(code.startsWith('FF1-') && code.length < 140, code);
  assert.deepEqual(L.decodeShare(code), st);
  assert.deepEqual(L.decodeShare(code.toLowerCase()), st);
  for (let k = 4; k < code.length; k++) {
    if (code[k] === '-' || code[k] === '.') continue;
    assert.equal(L.decodeShare(code.slice(0, k) + (code[k] === '1' ? '2' : '1') + code.slice(k + 1)), null);
  }
  // a code from the stage-7 build (fixed string) still decodes
  const body = 'FF1--1-crucian-' + (237).toString(36) + '-1-0-0-0-0-0-0', legacy = body + '-' + ('0000' + (L.strHash(body) % 1679616).toString(36)).slice(-4);
  assert.deepEqual(L.decodeShare(legacy).fish, { id: 'crucian', size: 23.7 });
  // forged record parts are rejected or cleaned
  const forge = (rec) => { const b = body + '-' + rec; return b + '-' + ('0000' + (L.strHash(b) % 1679616).toString(36)).slice(-4); };
  assert.equal(L.decodeShare(forge('<b>.1')), null);
  assert.equal(L.decodeShare(forge('carp.zzzzzzz')), null);
  assert.equal(L.decodeShare(forge('a.1.b.2.c.3.d.4.e.5.f.6')), null, 'too many');
  assert.deepEqual(L.decodeShare(forge('carp.b')).recs, [{ id: 'carp', size: 1.1 }]);
});

test('old fixtures: no new save fields needed, records and 어탁 come from the existing dex', () => {
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8'), s = L.decode(raw);
    assert.ok(s, f);
    const top = L.topRecords(s, 4);
    const best = Object.keys(JSON.parse(raw).dex.fish || {}).length;
    assert.equal(top.length, Math.min(4, best), f);
    for (let k = 1; k < top.length; k++) assert.ok(top[k - 1].size >= top[k].size, f);
    assert.ok(L.decodeShare(L.encodeShare(L.shareStats(s, Date.now()))), f);
  }
});

test('놀거리 수첩 has lines for 성격, 보스전 and 월척·어탁, open from the start', () => {
  const s = L.newState(0, seq(0.5));
  for (const id of ['temper', 'boss', 'records']) {
    const g = L.guideById(id);
    assert.ok(g && g.how.length > 10, id);
    assert.ok(L.guideOpen(s, id), id);
  }
  assert.match(L.guideById('temper').how, /점프/);
  assert.match(L.guideById('records').how, /어탁/);
});
