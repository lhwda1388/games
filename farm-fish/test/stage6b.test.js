// farm-fish/test/stage6b.test.js — stage 6B: 마을 (주민 집 방문: 대화·선물·심부름), 이어지는 심부름 이야기
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
const at = (day, min) => day * DAY + min * 60e3;
const MORNING = 5, DAYTIME = 20, EVENING = 40, NIGHT = 50;
const homeAt = (id, day) => [MORNING, DAYTIME, EVENING, NIGHT].map((m) => at(day, m)).find((t) => !L.residentAway(id, t, 0));

function vstate() {
  const s = L.newState(0, seq(0.5));
  s.rep = 5; s.coins = 1000;
  return s;
}
const give = (s, id, n) => { for (let k = 0; k < (n || 1); k++) L.bagAdd(s, id, L.itemInfo(id).price); };

test('마을 opens at ★5 or any resident 친밀도 1단계', () => {
  const s = L.newState(0, seq(0.5));
  assert.equal(L.villageOk(s), false);
  s.rep = 4; assert.equal(L.villageOk(s), false);
  s.rep = 5; assert.equal(L.villageOk(s), true);
  const t = L.newState(0, seq(0.5));
  L.befriendPts(t, 'kid', L.FRIEND_LV[0]);
  assert.equal(L.villageOk(t), true);
});

test('six residents, each with valid likes/dislikes/errands and lines for every level', () => {
  assert.deepEqual(L.VIL_IDS, L.RESIDENTS.map((r) => r.id));
  for (const id of L.VIL_IDS) {
    const d = L.VIL[id];
    for (const x of d.likes.concat(d.dislikes, d.errands)) assert.ok(L.itemInfo(x), id + ' ' + x);
    assert.ok(!d.likes.some((x) => d.dislikes.includes(x)), id);
    assert.equal(d.talk.length, 5, id);
    d.talk.forEach((ls) => assert.ok(ls.length >= 1));
    assert.ok(d.home && d.note && d.sayLike && d.sayOk && d.sayNo && d.hint);
  }
});

test('residents are away at some game times and home at others', () => {
  for (const id of L.VIL_IDS) {
    const away = [0, 1].some((h) => [MORNING, DAYTIME, EVENING, NIGHT].some((m) => L.residentAway(id, at(0, m) + h * HOUR, 0)));
    assert.ok(away, id + ' never away');
    assert.ok(homeAt(id, 0) !== undefined && homeAt(id, 1) !== undefined, id + ' never home');
  }
  assert.ok(L.residentAway('kid', at(0, DAYTIME), 0));
  assert.equal(L.residentAway('kid', at(0, EVENING), 0), null);
  assert.ok(L.residentAway('fisher', at(0, MORNING), 0));
  // 오 화백 only goes sketching on odd game days
  const g0 = L.gameClock(at(0, DAYTIME), 0).day % 2;
  assert.equal(!!L.residentAway('painter', at(0, DAYTIME), 0), g0 === 1);
  assert.equal(!!L.residentAway('painter', at(0, DAYTIME) + HOUR, 0), g0 === 0);
});

test('talk: once per resident per real local day, gives 친밀도, cannot talk while away', () => {
  const s = vstate(), t = homeAt('grandma', 3);
  const r = L.vilTalk(s, 'grandma', t, 0);
  assert.equal(r.ok, true); assert.ok(r.text);
  assert.equal(L.friendPoints(s, 'grandma'), L.VIL_TALK_PTS);
  assert.equal(L.vilTalk(s, 'grandma', t + 60e3, 0).why, 'talked');
  assert.equal(L.vilTalk(s, 'fisher', homeAt('fisher', 3), 0).ok, true);   // other residents have their own cap
  assert.equal(L.vilTalk(s, 'kid', at(3, DAYTIME), 0).why, 'away');
  assert.equal(L.vilTalk(s, 'grandma', homeAt('grandma', 4), 0).ok, true); // next real day
  assert.equal(L.friendPoints(s, 'grandma'), 2 * L.VIL_TALK_PTS);
  // the real day follows the local timezone: at UTC+9, 14:50 and 15:10 UTC are 23:50 and 00:10 local → a new day
  const u = vstate(), t1 = 15 * HOUR - 10 * 60e3, t2 = 15 * HOUR + 10 * 60e3;
  assert.equal(L.vilTalk(u, 'grandma', t1, 540).ok, true);
  assert.equal(L.vilTalk(u, 'grandma', t1 + 5 * 60e3, 540).ok, false);
  assert.equal(L.vilTalk(u, 'grandma', t2, 540).ok, true);
});

test('talk lines follow the level, some days are easy hints for secrets not found yet', () => {
  const s = vstate();
  let hints = 0, plain = 0;
  for (let d = 0; d < 60; d++) { const l = L.talkLine(s, 'teacher', d); if (l.hint) hints++; else { plain++; assert.ok(L.VIL.teacher.talk[0].includes(l.text)); } }
  assert.ok(hints > 5 && plain > 20, hints + '/' + plain);
  L.befriendPts(s, 'teacher', L.FRIEND_LV[3]);
  for (let d = 0; d < 30; d++) { const l = L.talkLine(s, 'teacher', d); if (!l.hint) assert.ok(L.VIL.teacher.talk[4].includes(l.text)); }
  // with every secret found, no hints
  s.yard = s.yard || {}; s.yard.eggs = {}; L.EGGS.forEach((e) => { s.yard.eggs[e.id] = true; });
  for (let d = 0; d < 30; d++) assert.equal(L.talkLine(s, 'teacher', d).hint, false);
});

test('gift: one basket item per resident per day; liked gives more, disliked gives +0 (never negative)', () => {
  const s = vstate(), t = homeAt('kid', 2);
  give(s, 'berry', 2); give(s, 'pepper'); give(s, 'radish');
  const r = L.vilGift(s, 'kid', 'berry', t, 0);
  assert.equal(r.ok, true); assert.equal(r.kind, 'like'); assert.equal(r.pts, L.VIL_GIFT_PTS.like);
  assert.equal(L.bagCount(s, 'berry'), 1);
  assert.equal(L.vilGift(s, 'kid', 'berry', t, 0).why, 'gifted');
  assert.equal(L.bagCount(s, 'berry'), 1, 'second gift same day takes nothing');
  const before = L.friendPoints(s, 'kid');
  const n = L.vilGift(s, 'kid', 'pepper', homeAt('kid', 3), 0);
  assert.equal(n.kind, 'dislike'); assert.equal(n.pts, 0); assert.equal(L.friendPoints(s, 'kid'), before);
  const o = L.vilGift(s, 'kid', 'radish', homeAt('kid', 4), 0);
  assert.equal(o.kind, 'ok'); assert.equal(L.friendPoints(s, 'kid'), before + L.VIL_GIFT_PTS.ok);
  assert.ok(L.VIL_GIFT_PTS.like > L.VIL_GIFT_PTS.ok && L.VIL_GIFT_PTS.ok > L.VIL_GIFT_PTS.dislike && L.VIL_GIFT_PTS.dislike === 0);
  assert.equal(L.vilGift(s, 'kid', 'melon', homeAt('kid', 5), 0).why, 'item', 'item not in basket');
  assert.equal(L.vilGift(s, 'kid', 'berry', at(6, DAYTIME), 0).why, 'away');
  assert.equal(L.bagCount(s, 'berry'), 1);
});

test('friendship from the 마을 feeds the existing level system: level gifts and letters come once', () => {
  const s = vstate();
  s.yard = s.yard || L.newState(0, seq(0.5)).yard;
  let ups = [];
  for (let d = 0; d < 40; d++) {
    give(s, 'ssuk');
    const t = homeAt('grandma', d);
    ups = ups.concat(L.vilTalk(s, 'grandma', t, 0).ups, L.vilGift(s, 'grandma', 'ssuk', t, 0).ups);
  }
  assert.deepEqual(ups.map((u) => u.lv), [1, 2, 3, 4]);
  assert.equal(L.friendLevel(s, 'grandma'), 4);
  assert.equal(s.res.unread.filter((k) => k.startsWith('grandma:')).length, 4);
  assert.equal(s.res.rec.ssukjeon, true);
  const coins = s.coins;
  give(s, 'ssuk');
  const more = L.vilGift(s, 'grandma', 'ssuk', homeAt('grandma', 50), 0);
  assert.deepEqual(more.ups, []); assert.equal(s.coins, coins);
});

test('errands: occasional, from obtainable items, no deadline, can decline, reward once', () => {
  const s = vstate();
  let offered = 0, first = null;
  for (let d = 0; d < 30; d++) {
    const e = L.errandFor(s, 'grandma', homeAt('grandma', d), 0);
    if (e) {
      offered++; if (!first) first = { d, e: { ...e } };
      assert.equal(L.errandDecline(s, 'grandma', homeAt('grandma', d), 0), true);
      assert.equal(L.errandFor(s, 'grandma', homeAt('grandma', d), 0), null, 'declined → nothing more that day');
    }
  }
  assert.ok(offered >= 4 && offered <= 20, 'offered ' + offered);
  assert.ok(L.obtainable(s, first.e.id));
  // accept on its day, then come back days later: still the same errand (no deadline)
  const u = vstate(), e = L.errandFor(u, 'grandma', homeAt('grandma', first.d), 0);
  assert.deepEqual(e, first.e);
  const later = homeAt('grandma', first.d + 9);
  assert.deepEqual(L.errandFor(u, 'grandma', later, 0), first.e);
  assert.equal(L.errandDone(u, 'grandma', later, 0).why, 'item');
  give(u, e.id, e.n);
  const c0 = u.coins, r = L.errandDone(u, 'grandma', later, 0);
  assert.equal(r.ok, true); assert.equal(r.coins, L.errandReward(e)); assert.equal(u.coins, c0 + r.coins);
  assert.ok(r.coins > L.itemInfo(e.id).price * e.n, 'better than selling');
  assert.equal(L.friendPoints(u, 'grandma'), L.VIL_ERRAND_PTS);
  assert.equal(L.bagCount(u, e.id), 0);
  assert.equal(L.errandDone(u, 'grandma', later, 0).why, 'none');
  assert.equal(L.errandFor(u, 'grandma', later, 0), null, 'one errand a day at most');
});

test('stories: 4+ series of 3–5 steps, valid residents, items and rewards', () => {
  assert.ok(L.STORIES.length >= 4);
  for (const st of L.STORIES) {
    assert.ok(st.steps.length >= 3 && st.steps.length <= 5, st.id);
    for (const p of st.steps) {
      assert.ok(L.VIL[p.at] && p.todo && p.say, st.id);
      if (p.need) assert.ok(L.itemInfo(p.need[0]) && p.need[1] >= 1, st.id);
    }
    assert.ok(st.letter && st.coins > 0 && (st.reward.type === 'deco' ? L.decoById(st.reward.id) : L.furnById(st.reward.id)), st.id);
    for (const r of Object.keys(st.req)) assert.ok(L.VIL[r], st.id);
    // relationships: a story goes between at least two residents
    assert.ok(new Set(st.steps.map((p) => p.at)).size >= 2, st.id);
  }
  assert.ok(L.STORIES.some((st) => st.steps.some((p) => p.need)) && L.STORIES.some((st) => st.steps.some((p) => !p.need)));
});

test('story steps advance only at the right house, with the right items; the end rewards once', () => {
  const s = vstate();
  s.yard = s.yard || L.newState(0, seq(0.5)).yard;
  const st = L.STORIES[0];
  assert.equal(L.storyNow(s).story.id, st.id);
  const wrong = L.VIL_IDS.find((id) => id !== st.steps[0].at);
  assert.equal(L.storyStep(s, wrong, homeAt(wrong, 0), 0).why, 'here');
  let coins = s.coins, k = 0;
  for (const p of st.steps) {
    assert.equal(L.storyNow(s).k, k);
    assert.equal(L.storyNow(s).step.todo, p.todo);
    if (p.need) { assert.equal(L.storyStep(s, p.at, homeAt(p.at, 0), 0).why, 'item'); give(s, p.need[0], p.need[1]); }
    const r = L.storyStep(s, p.at, homeAt(p.at, 0), 0);
    assert.equal(r.ok, true); assert.equal(r.say, p.say);
    assert.equal(r.done, k === st.steps.length - 1);
    k++;
  }
  assert.equal(L.storyDone(s, st.id), true);
  assert.ok(s.coins >= coins + st.coins);
  assert.equal(s.yard.deco[st.reward.id] || s.coins >= coins + st.coins + L.decoById(st.reward.id).cost, true);
  // finished story never comes back; the next open one (if any) starts at its step 0
  const now = L.storyNow(s);
  assert.ok(!now || now.story.id !== st.id);
  coins = s.coins;
  assert.equal(L.storyStep(s, st.steps[st.steps.length - 1].at, homeAt(st.steps[st.steps.length - 1].at, 0), 0).ok, !!now && now.step.at === st.steps[st.steps.length - 1].at);
});

test('stories: paused anytime (no deadline), cannot step while away, next series unlocks by 친밀도', () => {
  const s = vstate();
  const st = L.STORIES[0];
  L.storyStep(s, st.steps[0].at, homeAt(st.steps[0].at, 0), 0);
  // weeks later it is still waiting at step 1
  assert.equal(L.storyNow(s).k, 1);
  const a = st.steps[1].at, away = [0, 1].flatMap((h) => [MORNING, DAYTIME, EVENING, NIGHT].map((m) => at(0, m) + h * HOUR)).find((t) => L.residentAway(a, t, 0));
  assert.equal(L.storyStep(s, a, away, 0).why, 'away');
  // finish story 1: the 2nd (needs 민지 사장 1단계) is locked until then
  st.steps.slice(1).forEach((p) => { if (p.need) give(s, p.need[0], p.need[1]); L.storyStep(s, p.at, homeAt(p.at, 30), 0); });
  assert.equal(L.storyDone(s, st.id), true);
  const t = L.newState(0, seq(0.5)); t.rep = 5; t.vil = s.vil;   // same progress, no friendship at all
  assert.equal(L.storyNow(t), null);
  assert.ok(L.storyLocked(t));
  L.befriendPts(t, 'chef', L.FRIEND_LV[0]);
  assert.equal(L.storyNow(t).story.id, 'stew');
});

test('save round-trip keeps 마을 progress; junk is dropped; saves without it load with no stories', () => {
  const s = vstate();
  const t0 = homeAt('grandma', 7);
  L.vilTalk(s, 'grandma', t0, 0);
  give(s, 'radish'); L.vilGift(s, 'grandma', 'radish', t0, 0);
  s.vil.err.kid = { id: 'berry', n: 3 }; s.vil.ed.fisher = 6;
  L.storyStep(s, 'grandma', t0, 0);
  const back = L.decode(L.encode(s));
  assert.deepEqual(back.vil, s.vil);
  assert.deepEqual(L.decode(L.encode(back)).vil, s.vil);
  // damaged fields are dropped, not trusted
  const bad = JSON.parse(L.encode(s));
  bad.vil.talk.nobody = true; bad.vil.err.chef = { id: 'nope', n: 2 }; bad.vil.st = { cur: 'scarf', k: 99, done: { fake: true } };
  const b = L.decode(JSON.stringify(bad));
  assert.equal(b.vil.talk.nobody, undefined); assert.equal(b.vil.err.chef, undefined);
  assert.deepEqual(b.vil.st, { cur: null, k: 0, done: {} });
  // a save without vil (every released build) has no stories done and starts at the first one
  const plain = L.decode(L.encode(L.newState(0, seq(0.5))));
  assert.equal(plain.vil, undefined);
  plain.rep = 5;
  assert.equal(L.storyNow(plain).story.id, L.STORIES[0].id);
  assert.equal(L.storyDone(plain, L.STORIES[0].id), false);
});

test('v1 save and every released fixture still load; none of them has 마을 progress', () => {
  const v1 = JSON.stringify({ v: 1, coins: 120, sel: 'radish', plots: Array.from({ length: 6 }, () => ({ crop: null, progress: 0, t: 0, yieldMul: 1, weed: false, crow: null })),
    seeds: { gold: 0 }, ms: {}, nextEventAt: 0, fish: { phase: 'idle' }, dex: { crops: { radish: 3 }, fish: {}, goldSeed: false }, savedAt: 0 });
  const s = L.decode(v1);
  assert.ok(s); assert.equal(s.coins, 120); assert.equal(s.vil, undefined); assert.equal(L.villageOk(s), false);
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const o = L.decode(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.ok(o, f); assert.equal(o.vil, undefined, f);
    const sn = L.storyNow(o);
    if (L.villageOk(o)) assert.ok(sn && sn.k === 0, f);
  }
});
