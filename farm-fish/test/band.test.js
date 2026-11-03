// farm-fish/test/band.test.js — 마을 음악회: 악기 6종 and where they come from, 연주 daily cap, 광장 음악회 once a day, 축제 날 ×2,
// chart/judge/grade, save guards, and the "기존 플레이 무영향" points (no s.band without an instrument, junk/chest/gift rolls
// untouched for fixed seeds, old saves identical, music call-for-call the same with no band).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const html = require('../build.js').build();
vm.runInThisContext(html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1], { filename: 'logic.js' });
const L = globalThis.Logic;
const SRC = path.join(__dirname, '..', 'src');
const read = (f) => fs.readFileSync(path.join(SRC, f), 'utf8');
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const fresh = () => L.newState(0, seq(0.5));
// a seeded generator that counts its calls
const seeded = (a) => { let x = a * 2654435761 % 2147483647 || 1; const f = () => { f.n++; x = (x * 48271) % 2147483647; return x / 2147483647; }; f.n = 0; return f; };
const without = (s) => { const o = JSON.parse(JSON.stringify(s)); delete o.band; return JSON.stringify(o); };
const TZ = 0, WED = Date.UTC(2026, 10, 4, 19), THU = Date.UTC(2026, 10, 5, 19);   // 2026-11-04 is a Wednesday (계절 축제 day)

test('spec: six instruments, each from its own source, and those sources exist', () => {
  assert.deepEqual(L.BND_INS.map((d) => d.name), ['오카리나', '작은 북', '하모니카', '실로폰', '아코디언', '우쿨렐레']);
  assert.deepEqual(L.BND_INS.map((d) => d.from), ['find', 'kid', 'fisher', 'teacher', 'grandma', 'trader']);
  const names = { kid: '꼬마 도윤', fisher: '박 영감', teacher: '하늘 선생님', grandma: '순자 할머니' };
  for (const id in names) assert.equal(L.residentById(id).name, names[id]);
  assert.equal(typeof L.traderOpen, 'function');
  assert.equal(new Set(L.BND_INS.map((d) => d.lane)).size, 6);
  assert.equal(L.BND_PLAY_CAP, 3);
  assert.equal(L.BND_FEST_MUL, 2);
  assert.equal(L.BND_TITLE, '마을 악단');
});

test('s.band appears only with the first instrument; ticks without one make nothing', () => {
  const s = fresh(), before = JSON.stringify(s);
  assert.deepEqual(L.bndTakeDue(s), []);
  assert.equal(s.band, undefined);
  assert.equal(L.bndOk(s), false);
  assert.equal(L.bndPlayPay(s, 1, WED, TZ).why, 'ins');
  assert.equal(L.bndShowPay(s, 1, WED, TZ, 'night').why, 'ins');
  assert.equal(L.bndMute(s, 'drum', true), false);
  assert.equal(JSON.stringify(s), before);
  L.befriendPts(s, 'kid', L.FRIEND_LV[1]);   // 친밀도 2: not yet
  assert.equal(L.friendLevel(s, 'kid'), 2);
  assert.deepEqual(L.bndTakeDue(s), []);
  assert.equal(s.band, undefined);
  assert.deepEqual(L.bndGive(s, 'drum'), { ok: true, first: true });
  assert.deepEqual(s.band, { ins: { drum: true }, mute: {}, play: null, show: null, best: 0 });
  assert.deepEqual(L.bndGive(s, 'drum'), { ok: false, why: 'owned' });
  assert.equal(L.bndGive(s, 'nope').why, 'none');
  // the UI tick and the music hooks start with the instrument check (a save without one never gets s.band)
  const ui = read('ui/band.js');
  assert.match(ui.slice(ui.indexOf('function bndTick(')).split('\n')[1], /L\.bndOk\(S\)/);
  assert.match(ui.slice(ui.indexOf('function bndTrack(')).split('\n')[1], /if \(!S\.band\) return p;/);
  assert.match(read('ui/sound.js'), /if \(S\.band\) \(tr\.bsteps\[ln\.step\] \|\| \[\]\)/);
});

test('resident instruments: added at 친밀도 3, the old gifts and letters exactly as before', () => {
  assert.deepEqual(L.RES_STORY.kid.gifts, [null, null, { type: 'deco', id: 'birdhouse' }, { type: 'recipe', id: 'goguma' }]);
  assert.deepEqual(L.RES_STORY.fisher.gifts, [null, null, { type: 'furn', id: 'radio' }, { type: 'deco', id: 'stones' }]);
  assert.deepEqual(L.RES_STORY.teacher.gifts, [null, null, { type: 'recipe', id: 'naengguk' }, { type: 'furn', id: 'shelf' }]);
  assert.deepEqual(L.RES_STORY.grandma.gifts, [null, null, { type: 'recipe', id: 'ssukjeon' }, { type: 'furn', id: 'plant' }]);
  const a = fresh(), b = fresh();
  const ua = ['kid', 'fisher', 'teacher', 'grandma', 'chef'].map((w) => L.befriendPts(a, w, L.FRIEND_LV[2]));
  const ub = ['kid', 'fisher', 'teacher', 'grandma', 'chef'].map((w) => { const u = L.befriendPts(b, w, L.FRIEND_LV[2]); L.bndTakeDue(b); return u; });
  assert.deepEqual(ub, ua, 'same level-ups and gifts');
  assert.equal(without(b), JSON.stringify(a), 'nothing else changed');
  assert.deepEqual(Object.keys(b.band.ins).sort(), ['accordion', 'drum', 'harmonica', 'xylo']);
  assert.deepEqual(L.bndTakeDue(b), [], 'once');
  assert.doesNotMatch(read('logic/residents.js'), /\bbnd[A-Z]|BND_/);
});

test('오카리나: an extra roll after the junk/chest result; the same rng calls and results for fixed seeds', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const run = (band) => {
      const s = fresh(), r = seeded(seed), log = [];
      for (let k = 0; k < 80; k++) {
        const id = L.JUNK[Math.floor(r() * L.JUNK.length)].id;
        log.push(JSON.stringify(L.landJunk(s, id, r)));
        if (band) L.bndFind(s, 'junk');
        if (s.junk.box) { log.push(JSON.stringify(L.openChest(s, r, k % 2))); if (band) L.bndFind(s, 'chest'); }
      }
      return { s, log, n: r.n };
    };
    const a = run(false), b = run(true);
    assert.deepEqual(b.log, a.log, 'seed ' + seed + ': same junk and chests');
    assert.equal(b.n, a.n, 'seed ' + seed + ': same number of rng calls');
    assert.equal(without(b.s), JSON.stringify(a.s), 'seed ' + seed);
  }
  assert.doesNotMatch(read('logic/band.js'), /Math\.random|\brng\b/);
  for (const f of ['logic/fishing.js', 'logic/junk.js', 'logic/treasure.js', 'logic/residents.js'])
    assert.doesNotMatch(read(f), /\bbnd[A-Z]\w*\(|BND_/, f + ' does not call 마을 음악회');
});

test('오카리나 odds: about 1 in 40 junk, 1 in 6 chests, the same for a given save, never twice', () => {
  let j = 0, c = 0;
  for (let born = 0; born < 400; born++) {
    const s = fresh(); s.born = born * 7919; s.junk = { seen: {}, n: {}, letters: [], box: 2, total: born % 50 };
    if (L.bndFind(s, 'junk')) j++;
    const t = fresh(); t.born = born * 7919; t.junk = { seen: {}, n: {}, letters: [], box: 1, total: born % 50 };
    if (L.bndFind(t, 'chest')) c++;
    const again = fresh(); again.born = s.born; again.junk = Object.assign({}, s.junk);
    assert.equal(L.bndFind(again, 'junk'), s.band ? 'ocarina' : null, 'deterministic');
    if (s.band) assert.equal(L.bndFind(s, 'junk'), null, 'not twice');
  }
  assert.ok(j > 2 && j < 25, 'junk ' + j);
  assert.ok(c > 35 && c < 110, 'chest ' + c);
  assert.equal(L.bndFind(fresh(), 'junk'), null, 'no junk yet: nothing');
});

test('우쿨렐레: only once the 상인 comes; his 하루 하나 list is the same', () => {
  const s = fresh(); s.coins = 1e5;
  assert.deepEqual(L.bndBuyUke(s), { ok: false, why: 'closed' });
  s.port = { got: {}, done: { station: true } };
  const day = L.traderToday(s, WED, TZ);
  s.coins = L.BND_UKE_COST - 1;
  assert.equal(L.bndBuyUke(s).why, 'coins');
  s.coins = L.BND_UKE_COST;
  assert.deepEqual(L.bndBuyUke(s), { ok: true });
  assert.equal(s.coins, 0);
  assert.ok(L.bndHas(s, 'uke'));
  assert.equal(L.bndBuyUke(s).why, 'owned');
  assert.deepEqual(L.traderToday(s, WED, TZ), day);
  assert.equal(s.trader, undefined, 'the 하루 하나 pick is not used');
});

test('chart, judge, grade', () => {
  const ch = L.bndChart([{ t: 0, m: 60 }, { t: 0.5, m: 64 }, { t: 1, m: 67 }, { t: 1.5, m: 72 }, { t: 2, m: 60 }], 4);
  assert.deepEqual(ch.map((c) => c.lane), [0, 1, 2, 3, 0]);
  assert.ok(L.bndChart([{ t: 0, m: 60 }, { t: 1, m: 62 }], 6).every((c) => c.lane >= 0 && c.lane < 6));
  assert.equal(L.bndChart([{ t: 0, m: 60 }], 4)[0].lane, 0);
  assert.equal(L.bndJudge(0), 'perfect'); assert.equal(L.bndJudge(-80), 'perfect');
  assert.equal(L.bndJudge(120), 'good'); assert.equal(L.bndJudge(-160), 'good');
  assert.equal(L.bndJudge(161), null);
  assert.equal(L.bndScore({ perfect: 10 }, 10), 1);
  assert.equal(L.bndScore({ good: 10 }, 10), 0.5);
  assert.equal(L.bndScore({}, 0), 0);
  assert.deepEqual([0, 0.44, 0.45, 0.7, 0.88, 1].map(L.bndGrade), [0, 0, 1, 2, 3, 3]);
  const s = fresh(); L.bndGive(s, 'drum'); L.bndGive(s, 'uke');
  assert.equal(L.bndShowLanes(s), 4);
  L.bndGive(s, 'xylo'); assert.equal(L.bndShowLanes(s), 5);
  L.bndGive(s, 'ocarina'); L.bndGive(s, 'accordion'); assert.equal(L.bndShowLanes(s), 6);
});

test('연주: rewards 3 times a real day, then just for fun; a new day starts over', () => {
  const s = fresh(); L.bndGive(s, 'drum'); s.coins = 0;
  const pays = [1, 0.75, 0.5, 1].map((x) => L.bndPlayPay(s, x, WED, TZ));
  assert.deepEqual(pays.map((p) => p.coins), [L.BND_PLAY_PAY[3], L.BND_PLAY_PAY[2], L.BND_PLAY_PAY[1], 0]);
  assert.deepEqual(pays.map((p) => p.left), [2, 1, 0, 0]);
  assert.equal(s.coins, L.BND_PLAY_PAY[3] + L.BND_PLAY_PAY[2] + L.BND_PLAY_PAY[1]);
  assert.ok(pays.slice(0, 3).every((p) => L.BND_FANS.includes(p.who)), 'a fan cheers');
  assert.equal(L.bndPlayLeft(s, WED + 3600e3, TZ), 0);
  assert.equal(L.bndPlayLeft(s, THU, TZ), 3);
  assert.equal(L.bndPlayPay(s, 0.1, THU, TZ).coins, L.BND_PLAY_PAY[0]);
  assert.equal(L.bndPlayPay(s, 0.1, THU, TZ).who, null, 'no grade: no 친밀도');
});

test('음악회: 2 instruments, evening/night, once a real day; missing a day loses nothing', () => {
  const s = fresh(); L.bndGive(s, 'drum');
  assert.equal(L.bndShowWhy(s, THU, TZ, 'night'), 'ins');
  L.bndGive(s, 'uke');
  assert.equal(L.bndShowWhy(s, THU, TZ, 'morning'), 'time');
  assert.equal(L.bndShowWhy(s, THU, TZ, 'day'), 'time');
  assert.equal(L.bndShowWhy(s, THU, TZ, 'evening'), 'ok');
  const r = L.bndShowPay(s, 0.75, THU, TZ, 'night');
  assert.equal(r.grade, 2); assert.equal(r.fest, null); assert.equal(r.coins, L.BND_SHOW_PAY[2]);
  assert.equal(r.ups.length, L.BND_FANS.length);
  assert.equal(L.bndShowWhy(s, THU + 3600e3, TZ, 'night'), 'done');
  assert.equal(L.bndShowPay(s, 1, THU + 3600e3, TZ, 'night').why, 'done', 'once a day');
  const later = THU + 5 * 86400e3;   // days skipped: it just opens again
  assert.equal(L.bndShowWhy(s, later, TZ, 'evening'), 'ok');
  assert.equal(s.band.best, 2);
  assert.ok(!s.band.gold && !s.band.song);
});

test('축제 날 (Wednesday): rewards ×2, a 은 unlocks the song, the song plays that night; first 금 = 칭호', () => {
  assert.equal(L.bndFestDay(WED, TZ), L.festWeek(WED, TZ).id);
  assert.equal(L.bndFestDay(THU, TZ), null);
  const mk = () => { const s = fresh(); L.bndGive(s, 'drum'); L.bndGive(s, 'uke'); s.coins = 0; return s; };
  const a = mk(), b = mk();
  const ra = L.bndShowPay(a, 0.75, THU, TZ, 'night'), rb = L.bndShowPay(b, 0.75, WED, TZ, 'night');
  assert.equal(rb.coins, ra.coins * 2);
  assert.equal(b.coins, a.coins * 2);
  assert.equal(L.friendPoints(b, 'kid'), 2 * L.friendPoints(a, 'kid'));
  assert.equal(ra.song, false); assert.equal(rb.song, true, 'the festival 은 chance');
  assert.equal(rb.title, false);
  assert.equal(L.bndSongNow(b, WED, TZ, 'night'), true);
  assert.equal(L.bndSongNow(b, WED, TZ, 'evening'), false);
  assert.equal(L.bndSongNow(b, THU, TZ, 'night'), false);
  assert.equal(L.bndSongNow(a, WED, TZ, 'night'), false);
  const g = L.bndShowPay(a, 1, THU + 86400e3, TZ, 'evening');
  assert.equal(g.title, true); assert.equal(g.song, true);
  assert.deepEqual(L.bndTitles(a), ['마을 악단']);
  assert.equal(L.bndShowPay(a, 1, THU + 2 * 86400e3, TZ, 'evening').title, false, 'once');
});

test('save: decodeBand keeps good fields when others are broken; round-trip stable', () => {
  const s = fresh(); L.bndGive(s, 'drum'); L.bndGive(s, 'xylo'); L.bndMute(s, 'xylo', true);
  L.bndPlayPay(s, 1, THU, TZ);
  assert.deepEqual(L.decode(L.encode(s)).band, s.band);
  const base = JSON.parse(L.encode(s));
  const with_ = (band) => L.decode(JSON.stringify(Object.assign({}, base, { band }))).band;
  assert.equal(with_('x'), undefined);
  assert.equal(with_([1]), undefined);
  assert.equal(with_({ ins: {} }), undefined, 'no instrument: no s.band');
  assert.equal(with_({ ins: { nope: true, drum: 1 } }), undefined);
  assert.deepEqual(with_({ ins: { drum: true, nope: true }, mute: { drum: true, uke: true }, play: 'x', show: 'y', best: 9, gold: 1, song: true }),
    { ins: { drum: true }, mute: { drum: true }, play: null, show: null, best: 3, song: true });
  assert.deepEqual(with_({ ins: { uke: true }, mute: [], play: { d: 5.5, n: 99 }, show: 20000, best: -1 }),
    { ins: { uke: true }, mute: {}, play: { d: 5, n: L.BND_PLAY_CAP }, show: 20000, best: 0 });
  assert.ok(L.decode(JSON.stringify(Object.assign({}, base, { band: { ins: 'broken' } }))), 'the rest of the save still loads');
});

test('old saves: no s.band appears, re-encode is the same, the guide gets no new mark', () => {
  const dir = path.join(__dirname, 'fixtures');
  const files = fs.readdirSync(dir).filter((n) => n.endsWith('.json'));
  assert.ok(files.length >= 19);
  for (const f of files) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    if (JSON.parse(raw).band) continue;   // the fixture made with instruments
    const s = L.decode(raw);
    assert.equal(s.band, undefined, f);
    assert.equal(L.guideOpen(s, 'band'), false, f);
    assert.ok(!L.guideNew(s).includes('band'), f);
    const e1 = L.encode(s);
    assert.equal(L.encode(L.decode(e1)), e1, f + ': stable');
    assert.ok(!('band' in JSON.parse(e1)), f);
    // a hand-over makes s.band only when a resident's instrument is already due
    const due = L.bndDue(s);
    L.bndTakeDue(s);
    assert.equal(s.band === undefined, due.length === 0, f);
  }
});

// ---------- the UI tick (ui/band.js bndHere + bndTick + bndChipShow) in a stub context ----------
function uiTick(S, view, vilCur, ticks = 3) {
  const ui = read('ui/band.js'), src = ui.match(/^ {2}var BND_(FROM|SHORT) = .*$/gm).join('\n') + '\n' + ui.slice(ui.indexOf('  function bndHere('), ui.indexOf('  bndChip.addEventListener('));
  const log = { toasts: [], sfx: [], refresh: 0 };
  let p = 0;
  const ctx = { S, L, view, vilCur, BND_TZ: 0,
    bndLastAt: 0, bndChip: { hidden: true, dataset: {}, classList: { toggle() {} }, setAttribute() {} }, bndEl: { hidden: true },
    bndPhase: () => 'day', performance: { now: () => (p += 5000) }, toast: (m) => log.toasts.push(m), sfx: (k) => log.sfx.push(k), refresh: () => log.refresh++ };
  vm.createContext(ctx);
  vm.runInContext(src + '; for (var i = 0; i < ' + ticks + '; i++) bndTick(' + WED + ');', ctx);
  return { log, chip: ctx.bndChip };
}
const friends = (s, ids) => ids.forEach((w) => L.befriendPts(s, w, L.FRIEND_LV[2]));

test('resident instruments come in person: ticks away from the 마을 never hand them over', () => {
  for (const view of ['farm', 'yard', 'house', 'forest', 'port', 'museum']) {
    const s = fresh(); friends(s, ['kid', 'grandma']);
    const before = JSON.stringify(s), r = uiTick(s, view, 'kid');
    assert.equal(s.band, undefined, view);
    assert.equal(JSON.stringify(s), before, view + ': nothing written');
    assert.deepEqual(r.log, { toasts: [], sfx: [], refresh: 0 }, view + ': no toast, no sound');
    assert.equal(r.chip.hidden, true, view + ': no chip');
  }
});

test('a visit hands over every due instrument with one toast in their voice; a home visit only that resident\'s', () => {
  const s = fresh(); friends(s, ['kid', 'grandma', 'fisher']);
  let r = uiTick(s, 'home', 'grandma');
  assert.deepEqual(Object.keys(s.band.ins), ['accordion']);
  assert.deepEqual(r.log.toasts, ['순자 할머니: 이 아코디언 받아요 · 마당 ♪ 연주']);
  assert.deepEqual(r.log.sfx, ['bandGet']);
  r = uiTick(s, 'village', null);
  assert.deepEqual(Object.keys(s.band.ins).sort(), ['accordion', 'drum', 'harmonica']);
  assert.equal(r.log.toasts.length, 1, 'one toast for two instruments');
  assert.equal(r.log.toasts[0], '도윤·박 영감: 이 작은 북·하모니카 받아요');
  r = uiTick(s, 'village', null);
  assert.deepEqual(r.log.toasts, [], 'once');
  assert.deepEqual(L.bndTakeDue(fresh(), 'kid'), []);
});

test('old saves with 친밀도 3 (raised in memory, fixtures untouched): loaded and ticked anywhere but the 마을, no s.band', () => {
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    if (JSON.parse(raw).band) continue;
    const s = L.decode(raw); friends(s, ['kid', 'fisher', 'teacher', 'grandma']);
    const s2 = L.decode(L.encode(s));
    assert.equal(L.bndDue(s2).length, 4, f);
    const r = uiTick(s2, 'farm', null, 5);
    assert.equal(s2.band, undefined, f);
    assert.deepEqual(r.log.toasts, [], f);
    assert.ok(!('band' in JSON.parse(L.encode(s2))), f);
    const v = uiTick(s2, 'village', null);
    assert.equal(L.bndCount(s2), 4, f + ': handed over on the visit');
    assert.deepEqual(v.log.toasts, ['도윤·박 영감·선생님·할머니: 악기 4개 받아요 · 작은 북·하모니카·실로폰·아코디언'], f);
  }
});

// ---------- 음악: the scheduled audio calls, recorded against a stub AudioContext ----------
// The hash below was recorded from ui/sound.js as it was before the 마을 음악회 (commit 92bd7ca), same harness.
const OLD_MUSIC = { hash: '92197262105f885af05016647112ca65b1ab22c57f751b06efa08d497cf08ea4', calls: 18076, notes: 1562 };
function musicLog(S) {
  const src = read('ui/sound.js'), music = src.slice(src.indexOf('var MUS = {'), src.indexOf('function musSwitch('));
  const log = [];
  let id = 0, r = 1;
  const param = (name) => { const p = { value: 0 }; ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'setTargetAtTime', 'cancelScheduledValues'].forEach((m) => { p[m] = (...a) => log.push(name + '.' + m + '(' + a.map((x) => +x.toFixed(6)).join(',') + ')'); }); return p; };
  const node = (kind) => {
    const n = { id: ++id, kind };
    ['frequency', 'gain', 'detune', 'Q'].forEach((k) => { n[k] = param(kind + n.id + '.' + k); });
    n.connect = (d) => log.push(kind + n.id + '>' + (d.kind ? d.kind + d.id : '?'));
    n.start = (...a) => log.push(kind + n.id + '.start(' + a.map((x) => +x.toFixed(6)) + ')');
    n.stop = (t) => log.push(kind + n.id + '.stop(' + t.toFixed(6) + ')');
    Object.defineProperty(n, 'type', { set: (v) => log.push(kind + n.id + '.type=' + v) });
    return n;
  };
  const ctx = { sndCtx: { createOscillator: () => node('osc'), createGain: () => node('gain'), createBiquadFilter: () => node('bq'), createBufferSource: () => node('src') },
    sndNoise: {}, Math: Object.assign(Object.create(Math), { random: () => { r = (r * 16807) % 2147483647; return r / 2147483647; } }), S, L, console };
  vm.createContext(ctx);
  vm.runInContext(music + `
    var out = { steps: {} };
    ['morning', 'day', 'evening', 'night'].forEach(function (name) {
      var tr = musBuild(MUS[name]), ln = { tr: tr, g: { kind: 'lane', id: name }, step: 0, at: 0.05 };
      out.steps[name] = JSON.stringify(tr.steps);
      for (var k = 0; k < tr.n * 2; k++) { musStep(ln, ln.at); ln.at += tr.eighth * (ln.step % 2 ? 1 - tr.swing : 1 + tr.swing); ln.step = (ln.step + 1) % tr.n; }
    });
    out.notes = musNotes;`, ctx);
  return { hash: crypto.createHash('sha256').update(log.join('\n')).digest('hex'), calls: log.length, notes: ctx.out.notes, steps: ctx.out.steps };
}
test('음악: with no instrument the four tunes schedule exactly the calls they did before (byte for byte)', () => {
  const none = musicLog(fresh());
  assert.deepEqual({ hash: none.hash, calls: none.calls, notes: none.notes }, OLD_MUSIC);
  const s = fresh(); L.bndGive(s, 'drum'); L.bndMute(s, 'drum', true);   // owned but all muted: the same too
  const muted = musicLog(s);
  assert.equal(muted.hash, OLD_MUSIC.hash);
  L.BND_INS.forEach((d) => L.bndGive(s, d.id)); L.bndMute(s, 'drum', false);
  const all = musicLog(s);
  assert.equal(JSON.stringify(all.steps), JSON.stringify(none.steps), 'the tune itself (tr.steps) never changes');
  assert.ok(all.notes > none.notes * 1.5 && all.calls > none.calls, 'six layers more');
  const one = fresh(); L.bndGive(one, 'ocarina');
  const o = musicLog(one);
  assert.ok(o.notes > none.notes && o.notes < all.notes, 'one instrument = one layer');
  // the four tunes keep their own lead; 음악회 곡 is added outside that table
  assert.match(read('ui/band.js'), /MUS\.band = \{/);
});

test('guide: exactly one entry, locked until an instrument', () => {
  assert.equal(L.GUIDE.filter((e) => e.id === 'band').length, 1);
  assert.equal(L.GUIDE.filter((e) => /음악회|악기/.test(e.name + e.how + e.lock)).length, 1);
  const s = fresh(); s.rep = 50;
  assert.equal(L.guideOpen(s, 'band'), false);
  L.bndGive(s, 'uke');
  assert.equal(L.guideOpen(s, 'band'), true);
});

test('names: every new top-level name is bnd*/BND_* (the shared scopes overwrite silently)', () => {
  for (const f of ['logic/band.js', 'ui/band.js']) {
    const src = read(f);
    const names = [...src.matchAll(/^ {2}function (\w+)/gm)].map((m) => m[1]);
    for (const m of src.matchAll(/^ {2}var (.*)$/gm)) for (const v of m[1].matchAll(/(?:^|,\s*)([A-Za-z_$][\w$]*)\s*=/g)) names.push(v[1]);
    assert.ok(names.length > 10, f);
    for (const n of names) assert.match(n, /^(bnd|BND_)|^(addBandHooks|decodeBand)$/, f + ': ' + n);
  }
});

test('review fixes: the round runs on the main loop, 무대 chip only when open, level-ups toasted, pads skip the tap sound, pluck release', () => {
  const ui = read('ui/band.js'), loop = read('ui/loop.js'), snd = read('ui/sound.js');
  assert.doesNotMatch(ui, /AnimationFrame/, 'no rAF of its own (PiP moves the loop to another window)');
  assert.match(loop.slice(loop.indexOf('function frame('), loop.indexOf('ctx.clearRect')), /bndFrame\(\);/);
  assert.match(ui, /view === 'village' && why === 'ok' \? 'show'/);
  assert.match(ui, /upsToast\(ups, /);
  assert.match(snd.slice(snd.indexOf('function sndClick(')).split('\n').slice(0, 4).join('\n'), /closest\('#band \.pads'\)/);
  assert.match(snd, /\n {4}g\.gain\.linearRampToValueAtTime\(0, t \+ dur\);\n {4}s\.connect\(g\)/);
  assert.match(ui.slice(ui.indexOf('function bndTrader(')).split('\n').slice(0, 3).join('\n'), /createElement\('h3'\)/);
});
