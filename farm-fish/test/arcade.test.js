// farm-fish/test/arcade.test.js — 게임장: bets, payouts, daily prize cap, the four games' rules, slot expected return, saves
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
const DAY = 86400e3, T = 1000 * DAY + 3600e3;   // a local day, 01:00 at tz 0
const town = (coins) => { const s = fresh(); s.rep = L.VILLAGE_REP; s.coins = coins; return s; };

test('arcade: the bet is paid up front; a win pays bet × the difficulty multiplier, a loss pays nothing', () => {
  assert.deepEqual(L.ARC_BETS, [100, 300, 500, 1000]);
  assert.deepEqual(L.ARC_MUL, { easy: 1.5, normal: 2, hard: 3 });
  for (const d of L.ARC_DIFFS) {
    const s = town(5000);
    const r = L.arcStart(s, 'mole', d, 500, T, 0);
    assert.ok(r.ok, d);
    assert.equal(s.coins, 4500, 'bet paid at start');
    assert.equal(L.arcPay(s, r.play, true), 500 * L.ARC_MUL[d]);
    assert.equal(s.coins, 4500 + 500 * L.ARC_MUL[d]);
    assert.equal(L.arcPay(s, r.play, true), 0, 'paid once');
  }
  const s = town(5000), r = L.arcStart(s, 'throw', 'hard', 300, T, 0);
  assert.equal(L.arcPay(s, r.play, false), 0);
  assert.equal(s.coins, 4700, 'lost bet stays lost');
  // 1.5 × 100 is a whole number of coins
  const e = town(100), q = L.arcStart(e, 'match', 'easy', 100, T, 0);
  assert.equal(L.arcPay(e, q.play, true), 150);
});

test('arcade: cannot bet more than you have, odd amounts, unknown games, or before the 마을 opens', () => {
  const s = town(499);
  assert.deepEqual(L.arcStart(s, 'mole', 'easy', 500, T, 0), { ok: false, why: 'coins' });
  assert.equal(s.coins, 499);
  assert.equal(L.arcStart(s, 'mole', 'easy', 250, T, 0).why, 'bet');
  assert.equal(L.arcStart(s, 'mole', 'easy', -100, T, 0).why, 'bet');
  assert.equal(L.arcStart(s, 'chess', 'easy', 100, T, 0).why, 'game');
  assert.equal(L.arcStart(s, 'mole', 'insane', 100, T, 0).why, 'diff');
  assert.equal(L.arcStart(s, 'mole', 'easy', 0, T, 0).why, 'bet', 'no free play while prize plays are left');
  assert.equal(s.coins, 499, 'nothing taken on a refusal');
  assert.equal(s.arcade, undefined, 'and nothing counted');
  const f = fresh(); f.coins = 5000;
  assert.equal(L.arcStart(f, 'slot', null, 100, T, 0).why, 'village');
  assert.ok(L.arcStart(s, 'slot', null, 300, T, 0).ok, '슬롯 needs no difficulty');
});

test('arcade: prize plays are capped per real local day; then only free play; the next day resets', () => {
  const s = town(1e6);
  assert.equal(L.arcLeft(s, T, 0), L.ARC_DAY_CAP);
  for (let k = 0; k < L.ARC_DAY_CAP; k++) assert.ok(L.arcStart(s, 'slot', null, 100, T + k * 1000, 0).ok, 'play ' + k);
  assert.equal(L.arcLeft(s, T, 0), 0);
  const c = s.coins;
  assert.deepEqual(L.arcStart(s, 'mole', 'hard', 100, T + 5e3, 0), { ok: false, why: 'cap' });
  assert.equal(s.coins, c);
  assert.equal(L.arcLeft(s, T - DAY, 0), 0, 'clock set back a day: still capped');
  assert.deepEqual(L.arcStart(s, 'slot', null, 100, T - DAY, 0), { ok: false, why: 'cap' });
  const fun = L.arcStart(s, 'mole', 'hard', 0, T + 5e3, 0);
  assert.ok(fun.ok);
  assert.equal(L.arcPay(s, fun.play, true), 0, 'free play pays nothing');
  assert.equal(s.coins, c);
  assert.equal(s.arcade.n, L.ARC_DAY_CAP, 'free play is not counted');
  assert.equal(L.arcLeft(s, T + DAY, 0), L.ARC_DAY_CAP, 'next local day');
  assert.ok(L.arcStart(s, 'slot', null, 100, T + DAY, 0).ok);
  assert.equal(L.arcLeft(s, T + DAY, 0), L.ARC_DAY_CAP - 1);
  // the day follows the local time zone: 14:00 UTC is 23:00 at UTC+9, 15:30 UTC is already the next day there
  const z = town(1e6), H = 3600e3;
  assert.ok(L.arcStart(z, 'slot', null, 100, 1000 * DAY + 14 * H, 540).ok);
  assert.equal(L.arcLeft(z, 1000 * DAY + 14 * H, 540), L.ARC_DAY_CAP - 1);
  assert.equal(L.arcLeft(z, 1000 * DAY + 15.5 * H, 540), L.ARC_DAY_CAP, 'midnight passed at +9');
});

test('arcade: 두더지 — layout fits the time, hits count, 고슴도치 costs, need rises with difficulty', () => {
  const e = L.ARC_MOLE.easy, n = L.ARC_MOLE.normal, h = L.ARC_MOLE.hard;
  assert.ok(e.need < n.need && n.need < h.need, 'higher target');
  assert.ok(e.up > n.up && n.up > h.up, 'shorter pop');
  for (const d of L.ARC_DIFFS) {
    const g = L.moleLayout(d, Math.random), real = g.pops.filter((p) => !p.hog).length;
    assert.ok(g.pops.every((p) => p.t + g.up <= L.ARC_MOLE_TIME && p.hole >= 0 && p.hole < L.ARC_MOLE_HOLES), d);
    assert.ok(real >= g.need, d + ': enough moles to win (' + real + ' ≥ ' + g.need + ')');
    assert.ok(g.need / real >= 0.55, d + ': not a gift');
    // two pops never share a hole at once
    g.pops.forEach((p, i) => g.pops.forEach((q, j) => { if (i < j && p.hole === q.hole) assert.ok(q.t >= p.t + g.up || p.t >= q.t + g.up, d); }));
  }
  const g = L.moleLayout('hard', seq(0.5, 0.1, 0.9, 0.3, 0.7));
  const m = g.pops.findIndex((p) => !p.hog), p = g.pops[m];
  assert.equal(L.moleTap(g, p.t - 1, p.hole), null, 'not up yet');
  assert.equal(L.moleTap(g, p.t + 10, p.hole), 'mole');
  assert.equal(g.score, 1);
  assert.equal(L.moleTap(g, p.t + 20, p.hole), null, 'one mole, one hit');
  g.pops.push({ t: 40000, hole: 4, hog: true }); g.score = 3;   // after the layout's own pops, so it is alone
  assert.equal(L.moleTap(g, 40100, 4), 'hog');
  assert.equal(g.score, 3 - L.ARC_HOG_COST);
  g.pops.push({ t: 41000, hole: 4, hog: false });
  assert.equal(L.moleTap(g, 41000 + g.up, 4), null, 'down again');
  assert.ok(L.moleOver(g, L.ARC_MOLE_TIME) && !L.moleOver(g, L.ARC_MOLE_TIME - 1));
});

test('arcade: 짝 맞추기 — pairs, misses use a try, run out of tries and lose', () => {
  const ratio = (d) => L.ARC_MATCH[d].tries / L.ARC_MATCH[d].pairs;
  assert.ok(L.ARC_MATCH.easy.pairs < L.ARC_MATCH.normal.pairs && L.ARC_MATCH.normal.pairs < L.ARC_MATCH.hard.pairs, 'more cards');
  assert.ok(ratio('easy') > ratio('normal') && ratio('normal') > ratio('hard'), 'fewer spare tries');
  assert.ok(L.ARC_CARDS.length >= L.ARC_MATCH.hard.pairs);
  for (const id of L.ARC_CARDS) assert.ok(L.itemInfo(id), 'card picture ' + id);
  const g = L.matchDeal('normal', Math.random);
  assert.equal(g.cards.length, 2 * L.ARC_MATCH.normal.pairs);
  const where = {};
  g.cards.forEach((id, k) => (where[id] = where[id] || []).push(k));
  assert.ok(Object.values(where).every((ks) => ks.length === 2));
  // a miss, then hide
  const ids = Object.keys(where);
  assert.equal(L.matchFlip(g, where[ids[0]][0]), 'first');
  assert.equal(L.matchFlip(g, where[ids[0]][0]), null, 'same card twice');
  assert.equal(L.matchFlip(g, where[ids[1]][0]), 'miss');
  assert.equal(L.matchFlip(g, where[ids[2]][0]), null, 'two open: wait');
  L.matchHide(g);
  assert.equal(g.used, 1);
  // every pair straight away
  ids.forEach((id) => { assert.equal(L.matchFlip(g, where[id][0]), 'first'); assert.equal(L.matchFlip(g, where[id][1]), 'pair'); });
  assert.ok(L.matchWon(g) && L.matchOver(g));
  assert.equal(g.used, 1 + ids.length);
  // only misses → out of tries, lost
  const b = L.matchDeal('hard', Math.random), bw = {};
  b.cards.forEach((id, k) => (bw[id] = bw[id] || []).push(k));
  const bi = Object.keys(bw);
  for (let k = 0; k < b.tries; k++) { L.matchFlip(b, bw[bi[k % bi.length]][0]); assert.equal(L.matchFlip(b, bw[bi[(k + 1) % bi.length]][0]), 'miss'); L.matchHide(b); }
  assert.ok(L.matchOver(b) && !L.matchWon(b));
  assert.equal(L.matchFlip(b, 0), null, 'no flips after the end');
});

test('arcade: 공 던지기 — lead the target; harder is faster and smaller', () => {
  const e = L.ARC_THROW.easy, h = L.ARC_THROW.hard;
  assert.ok(h.w < e.w && h.period[1] < e.period[0] && h.need >= e.need);
  const g = L.throwSetup('normal', seq(0.5));
  assert.equal(g.balls.length, L.ARC_BALLS);
  // find a throw time whose landing is dead centre, and one far off
  let good = -1, bad = -1;
  for (let u = 0; u < 4000 && (good < 0 || bad < 0); u++) {
    const x = L.throwX(g, 0, u + g.flight);
    if (good < 0 && Math.abs(x - L.ARC_AIM) < 0.5) good = u;
    if (bad < 0 && Math.abs(x - L.ARC_AIM) > 30) bad = u;
  }
  assert.ok(good >= 0 && bad >= 0);
  assert.equal(L.throwShot(g, good), true);
  assert.equal(L.throwShot(g, bad), false, 'every ball here has the same path (seq 0.5), so this one lands far off');
  for (let k = g.shots.length; k < L.ARC_BALLS; k++) L.throwShot(g, 0);
  assert.equal(L.throwShot(g, 0), null, 'out of balls');
  assert.ok(L.throwHits(g) >= 1);
  // the target stays on the lane
  for (let u = 0; u < 5000; u += 37) { const x = L.throwX(g, 2, u); assert.ok(x >= L.ARC_LANE[0] - 1e-9 && x <= L.ARC_LANE[1] + 1e-9); }
});

test('arcade: 슬롯 pays 777 ×20, three alike ×5, two alike ×1.5, else nothing', () => {
  assert.equal(L.slotMul(['seven', 'seven', 'seven']), 20);
  assert.equal(L.slotMul(['radish', 'radish', 'radish']), 5);
  assert.equal(L.slotMul(['seven', 'radish', 'seven']), 1.5);
  assert.equal(L.slotMul(['berry', 'radish', 'radish']), 1.5);
  assert.equal(L.slotMul(['berry', 'radish', 'seven']), 0);
  const ids = L.ARC_SLOT.map((x) => x.id);
  for (let k = 0; k < 200; k++) assert.ok(L.slotSpin(Math.random).every((id) => ids.includes(id)));
  assert.deepEqual(L.slotSpin(seq(0)), ['seven', 'seven', 'seven']);
  assert.deepEqual(L.slotSpin(seq(0.9999)), [ids[ids.length - 1], ids[ids.length - 1], ids[ids.length - 1]]);
  const s = town(1000), r = L.arcStart(s, 'slot', null, 100, T, 0);
  assert.equal(L.arcPay(s, r.play, L.slotMul(['seven', 'seven', 'seven'])), 2000);
});

test('arcade: 슬롯 expected return is a little under the bet (exact, every reel combination)', () => {
  const tot = L.ARC_SLOT.reduce((a, x) => a + x.w, 0);
  let ev = 0;
  for (const a of L.ARC_SLOT) for (const b of L.ARC_SLOT) for (const c of L.ARC_SLOT)
    ev += (a.w / tot) * (b.w / tot) * (c.w / tot) * L.slotMul([a.id, b.id, c.id]);
  assert.ok(ev < 1, 'house keeps an edge: ' + ev.toFixed(4));
  assert.ok(ev > 0.85, 'but not a robbery: ' + ev.toFixed(4));
});

test('arcade: s.arcade round-trips, junk is dropped, and old saves without it load', () => {
  const s = town(1e4);
  L.arcStart(s, 'slot', null, 100, T, 0);
  const t = L.decode(L.encode(s));
  assert.deepEqual(t.arcade, s.arcade);
  assert.equal(L.arcLeft(t, T, 0), L.ARC_DAY_CAP - 1);
  const raw = JSON.parse(L.encode(s));
  raw.arcade = { d: 'x', n: 3 };
  const u = L.decode(JSON.stringify(raw));
  assert.ok(u); assert.equal(u.arcade, undefined);
  raw.arcade = { d: 1000, n: 999 };
  assert.equal(L.decode(JSON.stringify(raw)).arcade.n, L.ARC_DAY_CAP);
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    if (JSON.parse(raw).arcade) continue;   // released after the arcade shipped: saves.test.js keeps it
    const o = L.decode(raw);
    assert.ok(o, f);
    assert.equal(o.arcade, undefined, f);
    assert.equal(L.arcLeft(o, T, 0), L.ARC_DAY_CAP, f);
  }
});

test('arcade: the 놀거리 수첩 has a line for it, open with the 마을', () => {
  const g = L.guideById('arcade');
  assert.ok(g && g.how.includes('×' + L.ARC_MUL.hard) && g.how.includes(String(L.ARC_DAY_CAP)));
  assert.equal(L.guideOpen(fresh(), 'arcade'), false);
  assert.equal(L.guideOpen(town(0), 'arcade'), true);
});
