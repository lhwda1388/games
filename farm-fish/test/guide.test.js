// farm-fish/test/guide.test.js — 놀거리 수첩: GUIDE table, open/locked from real state, "새" marks, scene tips, save
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
const open = (s) => L.GUIDE.filter((g) => L.guideOpen(s, g.id)).map((g) => g.id);

test('every GUIDE entry has id/name/how/lock and ids are unique', () => {
  assert.ok(L.GUIDE.length >= 30);
  const ids = new Set();
  for (const g of L.GUIDE) {
    for (const k of ['id', 'name', 'how', 'lock']) assert.equal(typeof g[k], 'string', g.id + ' ' + k);
    assert.ok(g.id && g.name && g.how, g.id);
    assert.ok(!ids.has(g.id), 'dup ' + g.id);
    ids.add(g.id);
    assert.equal(typeof L.guideOpen(fresh(), g.id), 'boolean', g.id);
  }
  // every entry that can start locked says how to open it
  for (const g of L.GUIDE) if (!L.guideOpen(fresh(), g.id)) assert.ok(g.lock.length > 0, g.id);
  assert.equal(L.guideOpen(fresh(), 'nope'), false);
});

test('a fresh farm has 밭/연못 open and 숲/동굴/섬 locked', () => {
  const s = fresh(), o = open(s);
  for (const id of ['farm', 'pond', 'bag', 'yard']) assert.ok(o.includes(id), id);
  for (const id of ['forest', 'cave', 'island', 'river', 'sea', 'orchard', 'village', 'flat', 'stars', 'camera', 'bugs', 'bees', 'pet'])
    assert.ok(!o.includes(id), id);
});

test('lock hints use the real numbers from the game', () => {
  const by = (id) => L.GUIDE.find((g) => g.id === id);
  assert.match(by('forest').lock, new RegExp('★' + L.FOREST_REP));
  assert.match(by('orchard').lock, new RegExp('★' + L.ORCHARD_REP));
  assert.match(by('village').lock, new RegExp('★' + L.VILLAGE_REP));
  assert.match(by('cave').lock, new RegExp('★' + L.CAVE_REP));
  assert.match(by('river').lock, new RegExp('★' + L.SPOTS.river.rep));
  assert.match(by('sea').lock, new RegExp('★' + L.SPOTS.sea.rep));
});

test('entries open under the real conditions', () => {
  const s = fresh();
  s.rep = 50; s.coins = 1e6;
  assert.ok(!L.guideOpen(s, 'forest'), 'rep alone does not open the 숲 (path is bought)');
  assert.ok(L.guideOpen(s, 'village'), '마을 at ★' + L.VILLAGE_REP);
  assert.ok(L.guideOpen(s, 'story'));
  assert.ok(L.buySpot(s, 'river')); assert.ok(L.guideOpen(s, 'river'));
  assert.ok(L.buySpot(s, 'sea'));
  for (const id of ['sea', 'flat', 'trap']) assert.ok(L.guideOpen(s, id), id);
  assert.ok(!L.guideOpen(s, 'island'), 'boat not fixed yet');
  assert.ok(L.unlockForest(s, 0).ok); assert.ok(L.guideOpen(s, 'forest'));
  assert.ok(L.unlockOrchard(s).ok); assert.ok(L.guideOpen(s, 'orchard'));
  assert.ok(!L.guideOpen(s, 'bees'));
  assert.ok(L.buyHive(s, 0).ok); assert.ok(L.guideOpen(s, 'bees'));
  assert.ok(L.buyNet(s).ok); assert.ok(L.guideOpen(s, 'bugs'));
  assert.ok(L.buyCamera(s).ok); assert.ok(L.guideOpen(s, 'camera'));
  assert.ok(L.buyScope(s).ok); assert.ok(L.guideOpen(s, 'stars')); assert.ok(L.guideOpen(s, 'meteor'));
  assert.equal(L.caveStatus(s), 'ok'); assert.ok(L.buyPick(s, 0, seq(0.5)).ok); assert.ok(L.guideOpen(s, 'cave'));
  assert.ok(L.adoptPet(s, 'dog', '', 0).ok); assert.ok(L.guideOpen(s, 'pet'));
  L.isleOf(s).boat = true;
  assert.ok(L.guideOpen(s, 'island')); assert.ok(L.guideOpen(s, 'lighthouse'));
  assert.ok(L.buyDonkey(s, '', 0).ok); s.donkey.f = 1e4; assert.ok(L.guideOpen(s, 'peak'));   // stage 9 ②
  // stage 9 ①: 돛배 and 통통배 (coins + materials) open 먼바다, 난바다, 먼 섬
  s.noSell = true;
  for (let k = 0; k < 2; k++) { const t = L.shipNext(s); s.coins += t.coins; t.need.forEach(([id, n]) => { for (let j = 0; j < n; j++) L.bagAdd(s, id, 1); }); assert.ok(L.upgradeShip(s).ok); }
  assert.ok(L.buyBike(s).ok); assert.ok(L.guideOpen(s, 'bike'));   // stage 9 ③
  s.coins += 1e5; s.up.scare = 1; L.buyDeco(s, 'flowers'); assert.ok(L.buyAnimal(s, 'hen', 0).ok);   // stage 10 ②: 꽃밭, 새끼, 허수아비
  s.res = s.res || { f: {}, lv: {}, rec: {}, unread: [] }; s.res.lv.fisher = L.CONTEST_FRIEND; assert.ok(L.guideOpen(s, 'contest'));   // stage 10 ①
  s.isle.lit = true; assert.ok(L.townArrive(s).length); assert.ok(L.guideOpen(s, 'newres'));   // stage 10 ③: 등대 점등 → 바다 이사
  assert.deepEqual(open(s), L.GUIDE.map((g) => g.id), 'everything open');
});

test('village also opens through a friend, not only ★', () => {
  const s = fresh();
  assert.ok(!L.guideOpen(s, 'village'));
  L.befriendPts(s, 'kid', L.FRIEND_LV[0]);
  assert.ok(L.guideOpen(s, 'village'));
});

test('guideNew lists open unseen entries; guideSee clears them', () => {
  const s = fresh();
  assert.equal(s.guide, undefined, 'created lazily');
  const n0 = L.guideNew(s);
  assert.deepEqual(n0, open(s));
  L.guideSee(s, n0);
  assert.deepEqual(L.guideNew(s), []);
  s.rep = 5;
  assert.deepEqual(L.guideNew(s), ['village', 'story', 'balloon', 'sled', 'townday']);   // 열기구·썰매 live on the 마을 언덕; stage 10 ③ 주민들의 하루
  L.guideSee(s, ['village', 'bogus']);
  assert.deepEqual(L.guideNew(s), ['story', 'balloon', 'sled', 'townday']);
  assert.equal(s.guide.seen.bogus, undefined);
});

test('scene tips come once per scene', () => {
  const s = fresh();
  const g = L.guideTip(s, 'yard');
  assert.ok(g && g.how, 'first visit gives a tip');
  assert.equal(L.guideTip(s, 'yard'), null, 'only once');
  assert.ok(L.guideTip(s, 'cave'));
  assert.equal(L.guideTip(s, 'nowhere'), null);
  assert.equal(L.guideTip(s, 'farm'), null, 'the start scene needs no tip');
});

test('s.guide round-trips through encode/decode and junk is dropped', () => {
  const s = fresh();
  L.guideSee(s, ['farm', 'pond']); L.guideTip(s, 'yard');
  const t = L.decode(L.encode(s));
  assert.deepEqual(t.guide, { seen: { farm: true, pond: true }, tip: { yard: true } });
  const raw = JSON.parse(L.encode(s));
  raw.guide = { seen: { farm: true, evil: true, pond: 'x' }, tip: { yard: true, nope: true } };
  assert.deepEqual(L.decode(JSON.stringify(raw)).guide, { seen: { farm: true }, tip: { yard: true } });
  raw.guide = 'bad';
  const u = L.decode(JSON.stringify(raw));
  assert.ok(u); assert.equal(u.guide, undefined);
  assert.equal(L.decode(L.encode(fresh())).guide, undefined);
});

test('old fixtures load without s.guide and the guide works on them', () => {
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    if (/"(flat|cam|cave|sky|isle|museum|guide)":/.test(fs.readFileSync(path.join(dir, f), 'utf8'))) continue;   // saved by stage 7+
    const s = L.decode(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.ok(s, f);
    assert.equal(s.guide, undefined, f);
    assert.ok(L.guideOpen(s, 'farm') && L.guideOpen(s, 'pond'), f);
    assert.ok(L.guideNew(s).length > 0, f);
  }
});
