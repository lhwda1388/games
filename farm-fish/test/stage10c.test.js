// farm-fish/test/stage10c.test.js — stage 10 lane ③: 주민들의 하루 (places by game time) + 새 주민 이사
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = require('../build.js').build();
vm.runInThisContext(html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1], { filename: 'logic.js' });
const L = globalThis.Logic;
const seq = (...xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const HOUR = 3600e3, DAY = 86400e3;
// game-clock phases inside game hour 0 (tz 0): morning 0–15 min, day 15–35, evening 35–45, night 45–60
const at = (day, min, h) => day * DAY + (h || 0) * HOUR + min * 60e3;
const PHASE_MIN = { morning: 5, day: 20, evening: 40, night: 50 };
const PHASES = Object.keys(PHASE_MIN);
const ALL = () => L.RESIDENTS.concat(L.RES_EXTRA).map((r) => r.id);
const NEW_IDS = () => L.RES_EXTRA.map((r) => r.id);

function vstate() {
  const s = L.newState(0, seq(0.5));
  s.rep = 5; s.coins = 1000;
  return s;
}
// make every move-in goal true
function allGoals(s) {
  s.cave = { own: true, e: 0, t: 0, wall: [], parts: {}, done: {}, dex: {}, lv: 0, n: 0 };
  L.FOSSILS.forEach((f) => { s.cave.done[f.id] = true; });
  s.isle = { boat: true, drift: [], palm: { day: -1, n: 0 }, lh: 0, lit: true, dex: {} };
  s.museum = { got: {}, done: {} };
  for (const r of L.MUSEUM_ROOM_IDS) { s.museum.got[r] = {}; L.MUSEUM_ROOMS[r].ids.forEach((id) => { s.museum.got[r][id] = true; }); }
}

// ---------- 새 주민 ----------
test('2–3 new residents, each with kinds, letters, gifts, village lines and an arrival letter', () => {
  const ids = NEW_IDS();
  assert.ok(ids.length >= 2 && ids.length <= 3);
  for (const r of L.RES_EXTRA) {
    assert.ok(r.name && r.who && r.kinds.length, r.id);
    assert.ok(!L.RESIDENTS.some((o) => o.id === r.id), r.id);
    assert.equal(L.residentById(r.id), r);
    const st = L.RES_STORY[r.id];
    assert.equal(st.letters.length, 4, r.id); assert.equal(st.gifts.length, 4, r.id);
    assert.ok(st.gifts[2] && st.gifts[3], r.id);
    assert.ok(L.TOWN_ARRIVE[r.id] && L.TOWN_ARRIVE[r.id].letter.length > 10, r.id);
    const d = L.VIL[r.id];
    for (const x of d.likes.concat(d.dislikes, d.errands)) assert.ok(L.itemInfo(x), r.id + ' ' + x);
    assert.ok(!d.likes.some((x) => d.dislikes.includes(x)), r.id);
    assert.equal(d.talk.length, 5, r.id);
    assert.ok(d.home && d.note && d.sayLike && d.sayOk && d.sayNo && d.hint);
  }
  // the old six stay the order board's residents
  assert.deepEqual(L.VIL_IDS, L.RESIDENTS.map((r) => r.id));
});

test('move-in goals: 화석 완성, 등대 점등, 박물관 절반 — each moves one resident in once', () => {
  const s = vstate();
  assert.deepEqual(L.townArrive(s), []);
  assert.equal(s.town, undefined, 'nothing saved before anyone arrives');
  for (const id of NEW_IDS()) assert.equal(L.resMoved(s, id), false);
  const goals = NEW_IDS().map((id) => L.TOWN_ARRIVE[id].goal);
  assert.deepEqual(goals.slice().sort(), ['fossil', 'lighthouse', 'museum']);
  // fossils
  s.cave = { own: true, e: 0, t: 0, wall: [], parts: {}, done: {}, dex: {}, lv: 0, n: 0 };
  L.FOSSILS.slice(1).forEach((f) => { s.cave.done[f.id] = true; });
  assert.deepEqual(L.townArrive(s), []);
  s.cave.done[L.FOSSILS[0].id] = true;
  const a = L.townArrive(s);
  assert.equal(a.length, 1);
  assert.equal(L.TOWN_ARRIVE[a[0]].goal, 'fossil');
  assert.ok(L.resMoved(s, a[0]));
  assert.deepEqual(L.townArrive(s), [], 'only once');
  // lighthouse
  s.isle = { boat: true, drift: [], palm: { day: -1, n: 0 }, lh: 0, lit: true, dex: {} };
  const b = L.townArrive(s);
  assert.equal(b.length, 1); assert.equal(L.TOWN_ARRIVE[b[0]].goal, 'lighthouse');
  // museum half full (not one short of it)
  s.museum = { got: {}, done: {} };
  const tot = L.museumTotal(s).m, need = Math.ceil(tot * L.TOWN_MUSEUM_PART);
  let n = 0;
  for (const r of L.MUSEUM_ROOM_IDS) for (const id of L.MUSEUM_ROOMS[r].ids) if (n < need - 1) { (s.museum.got[r] = s.museum.got[r] || {})[id] = true; n++; }
  assert.deepEqual(L.townArrive(s), []);
  for (const r of L.MUSEUM_ROOM_IDS) for (const id of L.MUSEUM_ROOMS[r].ids) if (n < need && !(s.museum.got[r] && s.museum.got[r][id])) { (s.museum.got[r] = s.museum.got[r] || {})[id] = true; n++; }
  const c = L.townArrive(s);
  assert.equal(c.length, 1); assert.equal(L.TOWN_ARRIVE[c[0]].goal, 'museum');
  for (const id of NEW_IDS()) assert.ok(L.resMoved(s, id));
});

test('nobody moves in before the 마을 opens', () => {
  const s = L.newState(0, seq(0.5));
  allGoals(s);
  assert.equal(L.villageOk(s), false);
  assert.deepEqual(L.townArrive(s), []);
  s.rep = L.VILLAGE_REP;
  assert.equal(L.townArrive(s).length, NEW_IDS().length);
});

test('arrival letters: unread until read, then read; read ones stay', () => {
  const s = vstate(); allGoals(s);
  const ids = L.townArrive(s);
  assert.deepEqual(L.townUnread(s).sort(), ids.slice().sort());
  assert.equal(L.townRead(s, ids[0]), true);
  assert.equal(L.townRead(s, ids[0]), false);
  assert.ok(!L.townUnread(s).includes(ids[0]));
  assert.ok(L.resMoved(s, ids[0]));
});

test('orders: no change for anyone until a new resident moves in; then they take some of their kinds', () => {
  const s = vstate();
  const orders = [];
  const kinds = new Set(L.RES_EXTRA.flatMap((r) => r.kinds));
  const items = [];
  // every kind a new resident takes has items on the order board somewhere
  for (const id of ['coal', 'copper', 'iron', 'quartz', 'shell', 'driftwood', 'clam', 'whelk', 'naengi', 'acorn', 'wildhoney', 'apple']) if (L.itemInfo(id)) items.push(id);
  for (const k of kinds) assert.ok(items.some((id) => L.itemInfo(id).kind === k), 'no test item of kind ' + k);
  for (const id of items) for (let n = 1; n <= 6; n++) for (const reward of [80, 150, 333]) orders.push({ id, n, reward, rep: 1 });
  for (const o of orders) assert.equal(L.residentFor(o, s), L.residentFor(o), 'unchanged before move-in');
  allGoals(s); L.townArrive(s);
  const who = new Set(orders.map((o) => L.residentFor(o, s)));
  for (const r of L.RES_EXTRA) assert.ok(who.has(r.id), r.id + ' never posts');
  for (const o of orders) {
    const w = L.residentFor(o, s);
    if (NEW_IDS().includes(w)) assert.ok(L.residentById(w).kinds.includes(L.itemInfo(o.id).kind));
    else assert.equal(w, L.residentFor(o), 'old owner kept');
  }
  // delivering such an order befriends the new resident
  const o = orders.find((q) => NEW_IDS().includes(L.residentFor(q, s)));
  const fr = L.befriend(s, o);
  assert.equal(fr.who, L.residentFor(o, s));
  assert.equal(L.friendPoints(s, fr.who), 1);
});

test('new residents: 친밀도 levels send letters and gifts once, like the old six', () => {
  const s = vstate(); allGoals(s); L.townArrive(s);
  for (const id of NEW_IDS()) {
    const ups = L.befriendPts(s, id, L.FRIEND_LV[3]);
    assert.deepEqual(ups.map((u) => u.lv), [1, 2, 3, 4], id);
    assert.ok(ups[2].gift && ups[3].gift, id);
    assert.ok(s.res.unread.includes(id + ':4'));
    assert.ok(L.resLetter(id, 2));
  }
  assert.deepEqual(L.befriendPts(s, NEW_IDS()[0], 50), []);
  // the 나리 gift recipe is only known after her level-3 letter
  const t = vstate();
  const gr = L.GIFT_RECIPES.filter((r) => NEW_IDS().includes(r.gift));
  for (const r of gr) assert.equal(L.recipeKnown(t, r), false);
  for (const r of gr) { L.befriendPts(t, r.gift, L.FRIEND_LV[2]); assert.equal(L.recipeKnown(t, r), true); }
});

test('new residents can be visited: talk, gift, errand go through the 마을 rules', () => {
  const s = vstate(); allGoals(s); L.townArrive(s);
  for (const id of NEW_IDS()) {
    const home = PHASES.map((p) => at(0, PHASE_MIN[p])).find((t) => !L.residentAway(id, t, 0));
    assert.ok(home !== undefined, id + ' never home');
    const r = L.vilTalk(s, id, home, 0);
    assert.ok(r.ok, id);
    assert.equal(L.vilTalk(s, id, home, 0).why, 'talked');
  }
  // not moved in yet → not visitable
  const t = vstate();
  const id = NEW_IDS()[0];
  const home = PHASES.map((p) => at(0, PHASE_MIN[p])).find((x) => !L.residentAway(id, x, 0));
  assert.equal(L.vilTalk(t, id, home, 0).ok, false);
});

// ---------- 주민들의 하루 ----------
test('day plan: every resident is out at a street place exactly when away from home', () => {
  for (const id of ALL()) {
    let places = 0;
    for (const day of [0, 1]) for (const p of PHASES) {
      const t = at(0, PHASE_MIN[p], day);
      const away = L.residentAway(id, t, 0), pl = L.residentPlace(id, t, 0);
      assert.equal(!!away, !!pl, id + ' ' + p);
      if (pl) { assert.ok(L.TOWN_PLACES[pl], id + ' ' + pl); places++; }
    }
    assert.ok(places >= 1, id + ' never out');
  }
  // the old six keep their old hours (stage 6B): 도윤 at school by day, 박 영감 out in the morning
  assert.equal(L.residentPlace('kid', at(0, PHASE_MIN.day), 0), 'school');
  assert.equal(L.residentPlace('kid', at(0, PHASE_MIN.evening), 0), null);
  assert.ok(L.residentPlace('fisher', at(0, PHASE_MIN.morning), 0));
  // places: at least 5 different ones in use, each with a name and a spot on the 180×200 street
  const used = new Set();
  for (const id of ALL()) for (const p of PHASES) for (const day of [0, 1]) { const pl = L.residentPlace(id, at(0, PHASE_MIN[p], day), 0); if (pl) used.add(pl); }
  assert.ok(used.size >= 5, [...used].join());
  for (const k of Object.keys(L.TOWN_PLACES)) {
    const p = L.TOWN_PLACES[k];
    assert.ok(p.name && p.x >= 0 && p.x <= 171 && p.y >= 0 && p.y <= 191, k);
  }
  // a line for every place each resident goes to
  for (const id of ALL()) for (const p of PHASES) for (const day of [0, 1]) {
    const pl = L.residentPlace(id, at(0, PHASE_MIN[p], day), 0);
    if (pl) assert.ok(L.TOWN_LINES[id][pl] && L.TOWN_LINES[id][pl].length >= 2, id + ' ' + pl);
  }
});

test('meeting someone out in the street: a place line, 친밀도 once a real day, then just the line', () => {
  const s = vstate();
  const t = at(3, PHASE_MIN.day);
  const r = L.townMeet(s, 'kid', t, 0);
  assert.equal(r.ok, true); assert.equal(r.place, 'school');
  assert.ok(L.TOWN_LINES.kid.school.includes(r.text));
  assert.equal(r.pts, L.TOWN_MEET_PTS);
  assert.equal(L.friendPoints(s, 'kid'), L.TOWN_MEET_PTS);
  const r2 = L.townMeet(s, 'kid', t + 60e3, 0);
  assert.equal(r2.ok, true); assert.equal(r2.again, true); assert.equal(r2.pts, 0);
  assert.equal(L.friendPoints(s, 'kid'), L.TOWN_MEET_PTS);
  // next real day: again
  const r3 = L.townMeet(s, 'kid', t + DAY, 0);
  assert.equal(r3.pts, L.TOWN_MEET_PTS);
  // at home → not out; not moved in → nobody there
  assert.equal(L.townMeet(s, 'kid', at(3, PHASE_MIN.evening), 0).why, 'home');
  const nid = NEW_IDS()[0], pt = PHASES.map((p) => at(3, PHASE_MIN[p])).find((x) => L.residentPlace(nid, x, 0));
  assert.equal(L.townMeet(s, nid, pt, 0).why, 'who');
  // 마을 closed → nothing
  const c = L.newState(0, seq(0.5));
  assert.equal(L.townMeet(c, 'kid', t, 0).ok, false);
});

test('who is out where right now (for the street picture)', () => {
  const s = vstate();
  const out = L.townOut(s, at(0, PHASE_MIN.day), 0);
  assert.ok(out.some((e) => e.id === 'kid' && e.place === 'school'));
  assert.ok(out.some((e) => e.id === 'teacher' && e.place === 'school'));
  assert.ok(!out.some((e) => NEW_IDS().includes(e.id)), 'not moved in yet');
  allGoals(s); L.townArrive(s);
  const all = PHASES.flatMap((p) => L.townOut(s, at(0, PHASE_MIN[p]), 0));
  for (const id of NEW_IDS()) assert.ok(all.some((e) => e.id === id), id);
  // two at one place stand side by side, never on the same spot
  for (const p of PHASES) {
    const o = L.townOut(s, at(0, PHASE_MIN[p]), 0), spots = o.map((e) => e.x + ',' + e.y);
    assert.equal(new Set(spots).size, spots.length, p);
  }
});

// ---------- 소문·수첩 ----------
test('each new resident carries 1–2 rumors', () => {
  for (const id of NEW_IDS()) {
    const n = L.RUMORS.filter((r) => r.src === 'res' && r.who === id).length;
    assert.ok(n >= 1 && n <= 2, id + ' ' + n);
  }
});

test('놀거리 수첩: 주민들의 하루 and 새 주민 lines with real conditions', () => {
  const day = L.guideById('townday'), nw = L.guideById('newres');
  assert.ok(day && nw);
  assert.ok(nw.lock.includes(String(Math.round(L.TOWN_MUSEUM_PART * 100))), nw.lock);
  const s = L.newState(0, seq(0.5));
  assert.equal(L.guideOpen(s, 'townday'), false);
  assert.equal(L.guideOpen(s, 'newres'), false);
  s.rep = L.VILLAGE_REP;
  assert.equal(L.guideOpen(s, 'townday'), true);
  assert.equal(L.guideOpen(s, 'newres'), false);
  allGoals(s); L.townArrive(s);
  assert.equal(L.guideOpen(s, 'newres'), true);
});

// ---------- save ----------
test('save: s.town and the new residents\' 친밀도·visits survive a round trip; fresh saves have no s.town', () => {
  const s = vstate(); allGoals(s);
  const ids = L.townArrive(s);
  L.townRead(s, ids[0]);
  L.befriendPts(s, ids[1], 20);
  const home = PHASES.map((p) => at(0, PHASE_MIN[p])).find((t) => !L.residentAway(ids[1], t, 0));
  L.vilTalk(s, ids[1], home, 0);
  L.townMeet(s, 'kid', at(0, PHASE_MIN.day), 0);
  const v = L.decode(L.encode(s));
  assert.deepEqual(v.town, s.town);
  assert.deepEqual(v.res, s.res);
  assert.equal(v.vil.talk[ids[1]], true);
  assert.equal(L.decode(L.encode(L.newState(0, seq(0.5)))).town, undefined);
  // junk is dropped
  const o = JSON.parse(L.encode(s));
  o.town = { mv: { nobody: 1, [ids[0]]: 'x' }, met: { day: 'q', ids: { kid: true, zz: true } } };
  const w = L.decode(JSON.stringify(o));
  assert.deepEqual(Object.keys(w.town.mv), []);
  assert.deepEqual(w.town.met.ids, {});
});

test('old fixtures load unchanged: no s.town, the same resident data', () => {
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    if (/"town":/.test(raw)) continue;   // saved by stage 10 ③+
    const s = L.decode(raw);
    assert.ok(s, f);
    assert.equal(s.town, undefined, f);
    const o = JSON.parse(raw);
    if (o.res) {
      assert.deepEqual(Object.keys(s.res.f).sort(), Object.keys(o.res.f || {}).filter((k) => o.res.f[k] > 0).sort(), f);
      assert.deepEqual(s.res.lv, Object.fromEntries(Object.entries(o.res.lv || {}).filter(([, n]) => n > 0)), f);
    }
    const again = L.decode(L.encode(s));
    assert.deepEqual(JSON.parse(L.encode(again)), JSON.parse(L.encode(s)), f);
  }
});

test('orders keep the resident who posted them when someone moves in later', () => {
  const s = L.newState(0, () => 0.3); s.rep = 99;
  let seq = 7; const rng = () => ((seq = (seq * 9301 + 49297) % 233280) / 233280);
  const os = []; for (let k = 0; k < 40; k++) { const o = L.genOrder(s, rng); if (!o.special) os.push(o); }
  const before = os.map(o => L.residentFor(o, s));
  assert.ok(os.every(o => o.by && L.residentById(o.by)), 'stamped at posting');
  s.isle = s.isle || {}; s.isle.lit = true; assert.ok(L.townArrive(s).length, 'someone moved in');
  assert.deepEqual(os.map(o => L.residentFor(o, s)), before);
  const back = L.decode(L.encode(Object.assign(s, { orders: [{ o: os[0], at: 0 }, { o: null, at: 1 }, { o: null, at: 1 }] })));
  assert.equal(back.orders[0].o.by, os[0].by, 'kept through a save');
});
