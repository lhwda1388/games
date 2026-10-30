// test/stage10b.test.js — stage 10 lane ②: 꽃 교배, 동물 새끼, 허수아비 꾸미기
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
const H = 3600e3, D = 86400e3;

// a farm with the 꽃밭 decoration standing in the yard
function withBed() {
  const s = fresh();
  s.coins = 1e6;
  assert.ok(L.buyDeco(s, 'flowers').ok);
  assert.ok(L.gardenOk(s));
  return s;
}

// ---------- 꽃 ----------
test('flowers: 15+ kinds, every shape × pattern, unique ids, names and hints', () => {
  assert.ok(L.FLOWERS.length >= 15);
  assert.equal(L.FLOWERS.length, L.FLOWER_SHAPES.length * L.FLOWER_PATS.length);
  const ids = new Set();
  for (const f of L.FLOWERS) {
    assert.ok(!ids.has(f.id)); ids.add(f.id);
    assert.ok(f.name && f.hint && L.FLOWER_SHAPES.some((x) => x.id === f.shape) && L.FLOWER_PATS.some((x) => x.id === f.pat));
    assert.equal(L.flowerById(f.id), f);
  }
  assert.equal(L.flowerById('nope'), null);
  // seeds are the plain ones
  assert.ok(L.FLOWER_SHAPES.every((x) => L.flowerById(x.id + '_plain')));
});

test('garden needs the 꽃밭 standing; plant costs FLOWER_SEED_COST; pull frees the slot', () => {
  const s = fresh();
  assert.equal(L.gardenOk(s), false);
  assert.deepEqual(L.plantFlower(s, 0, 'daisy', 0), { ok: false, why: 'bed' });
  const b = withBed();
  const c0 = b.coins;
  assert.deepEqual(L.plantFlower(b, 0, 'daisy', 0), { ok: true, id: 'daisy_plain' });
  assert.equal(b.coins, c0 - L.FLOWER_SEED_COST);
  assert.equal(L.plantFlower(b, 0, 'tulip', 0).why, 'full');
  assert.equal(L.plantFlower(b, L.GARDEN_N, 'tulip', 0).why, 'slot');
  assert.equal(L.plantFlower(b, 1, 'rose?', 0).why, 'shape');
  b.coins = 0; assert.equal(L.plantFlower(b, 1, 'tulip', 0).why, 'coins');
  assert.ok(b.garden.dex.daisy_plain);
  assert.equal(L.flowerDexCount(b), 1);
  assert.ok(L.pullFlower(b, 0)); assert.equal(b.garden.bed[0], null);
  assert.equal(L.pullFlower(b, 0), false);
  // stored 꽃밭: nothing grows there, but flowers stay
  const d = withBed(); L.plantFlower(d, 2, 'bell', 0);
  assert.ok(L.storeItem(d, 'deco', 'flowers').ok);
  assert.equal(L.gardenOk(d), false);
  assert.equal(d.garden.bed[2].id, 'bell_plain');
});

test('neighbours: a 2-row bed, left/right/up/down only', () => {
  assert.equal(L.GARDEN_N, L.GARDEN_COLS * L.GARDEN_ROWS);
  assert.deepEqual(L.gardenNeighbors(0).sort(), [1, L.GARDEN_COLS].sort());
  const last = L.GARDEN_N - 1;
  assert.deepEqual(L.gardenNeighbors(last).sort(), [last - 1, last - L.GARDEN_COLS].sort());
  for (let k = 0; k < L.GARDEN_N; k++) for (const j of L.gardenNeighbors(k)) assert.ok(L.gardenNeighbors(j).includes(k));
});

test('crossing: rules are deterministic, keep a parent shape, and reach every pattern', () => {
  assert.equal(L.crossChild('daisy_plain', 'daisy_plain', seq(0.1)), L.crossChild('daisy_plain', 'daisy_plain', seq(0.1)));
  const pats = new Set(), shapes = new Set();
  for (let k = 0; k < 40; k++) {
    const id = L.crossChild('daisy_plain', 'tulip_plain', seq(k / 40, ((k * 7) % 40) / 40));
    const f = L.flowerById(id); assert.ok(f);
    assert.ok(['daisy', 'tulip'].includes(f.shape)); shapes.add(f.shape); pats.add(f.pat);
  }
  assert.equal(shapes.size, 2);
  assert.ok(!pats.has('plain'), 'two plain flowers make a pattern');
  // every pattern can be reached from the seeds by crossing
  const reach = new Set(['plain']);
  for (let round = 0; round < 6; round++) for (const a of [...reach]) for (const b of [...reach]) {
    for (let k = 0; k < 20; k++) reach.add(L.flowerById(L.crossChild('daisy_' + a, 'daisy_' + b, seq(k / 20))).pat);
  }
  for (const p of L.FLOWER_PATS) assert.ok(reach.has(p.id), p.id);
});

test('gardenTick: bloomed neighbours sometimes cross into an empty neighbour slot (offline too)', () => {
  const s = withBed();
  L.plantFlower(s, 0, 'daisy', 0); L.plantFlower(s, 1, 'tulip', 0);
  assert.equal(L.flowerBloom(s.garden.bed[0], L.FLOWER_GROW - 1), false);
  assert.equal(L.flowerBloom(s.garden.bed[0], L.FLOWER_GROW), true);
  // not bloomed yet: nothing, whatever the rng
  assert.deepEqual(L.gardenTick(s, L.FLOWER_GROW - 1, seq(0)), []);
  // a long time away with a lucky rng: new flowers only next to their parents, at most GARDEN_N, all kinds known
  const born = L.gardenTick(s, 3 * D, seq(0));
  assert.ok(born.length >= 1);
  for (const e of born) { assert.ok(L.flowerById(e.id)); assert.ok(s.garden.dex[e.id]); }
  assert.ok(s.garden.bed.filter(Boolean).length <= L.GARDEN_N);
  // an unlucky rng: nothing crosses
  const u = withBed(); L.plantFlower(u, 0, 'daisy', 0); L.plantFlower(u, 1, 'daisy', 0);
  assert.deepEqual(L.gardenTick(u, 3 * D, seq(0.99)), []);
  // lone flowers never cross
  const lone = withBed(); L.plantFlower(lone, 0, 'daisy', 0); L.plantFlower(lone, 7, 'daisy', 0);
  assert.equal(L.GARDEN_N, 8); assert.ok(!L.gardenNeighbors(0).includes(7));
  assert.deepEqual(L.gardenTick(lone, 3 * D, seq(0)), []);
  // deterministic: same state + rng → same garden
  const a = withBed(), b = withBed();
  [a, b].forEach((x) => { L.plantFlower(x, 1, 'bell', 0); L.plantFlower(x, 2, 'cosmos', 0); L.plantFlower(x, 5, 'bell', 0); });
  L.gardenTick(a, 2 * D, seq(0.05, 0.6, 0.3)); L.gardenTick(b, 2 * D, seq(0.05, 0.6, 0.3));
  assert.deepEqual(a.garden, b.garden);
});

test('one cross check per CROSS_EVERY, children start as buds', () => {
  const s = withBed();
  L.plantFlower(s, 0, 'daisy', 0); L.plantFlower(s, 1, 'daisy', 0);
  const t = L.FLOWER_GROW + L.CROSS_EVERY;
  const got = L.gardenTick(s, t, seq(0));
  assert.ok(got.length <= Math.ceil(t / L.CROSS_EVERY));
  for (const e of got) assert.equal(L.flowerBloom(s.garden.bed[e.k], e.at), false, 'new flower is a bud');
});

test('honey: blooming patterned flowers give 무늬꽃꿀; old saves (no s.garden) keep the same sources', () => {
  const ph = L.honeyById('patternhoney');
  assert.ok(ph && L.itemInfo('patternhoney').kind === 'honey');
  const s = withBed();
  const before = JSON.stringify(L.honeySources(s, 'spring', 5 * D));
  assert.ok(!before.includes('patternhoney'));
  // the same yard with a garden that has only buds: unchanged
  L.plantFlower(s, 0, 'daisy', 5 * D);
  assert.equal(JSON.stringify(L.honeySources(s, 'spring', 5 * D)), before);
  // a blooming striped flower
  s.garden.bed[1] = { id: 'tulip_stripe', t: 0 };
  const w = L.honeySources(s, 'spring', 5 * D);
  assert.ok(w.some((x) => x.id === 'patternhoney'));
  assert.ok(!L.honeySources(s, 'winter', 5 * D).some((x) => x.id === 'patternhoney'), 'winter: no flowers');
});

// ---------- 새끼 ----------
function farmWith(kind, n) {
  const s = fresh(); s.coins = 1e6; s.yard = undefined; L.yardOf(s); s.yard.house = 3;
  for (let k = 0; k < n; k++) assert.ok(L.buyAnimal(s, kind, 0).ok);
  return s;
}

test('care: collecting products raises 친밀도 for that animal', () => {
  const s = farmWith('hen', 1);
  L.animalTick(s, L.ANIMALS.hen.every * 3);
  L.collectAnimals(s, L.ANIMALS.hen.every * 3, seq(0.5));
  assert.equal(L.broodOf(s).care.hen, 3);
  assert.equal(s.brood.care.cow, 0);
});

test('baby: needs 친밀도, rolls once per BABY_GAP, caps at BABY_PER_HEAD per head', () => {
  const s = farmWith('cow', 1);
  const b = L.broodOf(s);
  assert.deepEqual(L.broodTick(s, 0, seq(0)), [], 'no 친밀도 yet');
  b.care.cow = L.BABY_CARE;
  const born = L.broodTick(s, 10, seq(0));
  assert.equal(born.length, 1);
  assert.equal(born[0].kind, 'cow');
  assert.equal(s.brood.kids[0].name, L.BABY_KIND.cow.def);
  assert.equal(s.brood.care.cow, 0, '친밀도 spent');
  // cap: one head → one baby
  b.care.cow = 1e3;
  assert.deepEqual(L.broodTick(s, 10 + L.BABY_GAP * 5, seq(0)), []);
  // an unlucky roll waits BABY_GAP
  const u = farmWith('hen', 2); L.broodOf(u).care.hen = L.BABY_CARE;
  assert.deepEqual(L.broodTick(u, 0, seq(0.99)), []);
  assert.deepEqual(L.broodTick(u, L.BABY_GAP - 1, seq(0)), [], 'too soon');
  assert.equal(L.broodTick(u, L.BABY_GAP, seq(0)).length, 1);
});

test('baby grows over BABY_GROW, then makes products like an adult (cap respected, nothing lost)', () => {
  const s = farmWith('hen', 1);
  L.broodOf(s).care.hen = L.BABY_CARE;
  L.broodTick(s, 0, seq(0));
  const kid = s.brood.kids[0];
  assert.ok(L.BABY_GROW >= 2 * D && L.BABY_GROW <= 5 * D, 'a few real days');
  assert.equal(L.kidGrown(kid, L.BABY_GROW - 1), false);
  assert.equal(L.kidGrown(kid, L.BABY_GROW), true);
  assert.equal(L.broodHeads(s, 'hen', L.BABY_GROW - 1), 0);
  assert.equal(L.broodHeads(s, 'hen', L.BABY_GROW), 1);
  // after growing: two heads lay
  const t0 = L.BABY_GROW;
  L.collectAnimals(s, t0, seq(0.5));
  L.animalTick(s, t0 + L.ANIMALS.hen.every);
  assert.equal(s.yard.prod.hen.n, 2);
  // the waiting cap counts the grown kid too, and survives a reload
  L.animalTick(s, t0 + L.ANIMALS.hen.every * 50);
  assert.equal(s.yard.prod.hen.n, 2 * L.ANIMAL_CAP);
  const back = L.decode(L.encode(s));
  assert.equal(back.yard.prod.hen.n, 2 * L.ANIMAL_CAP);
  assert.deepEqual(back.brood, s.brood);
  // buying more animals still follows the shop's own caps
  assert.equal(s.animals.hen, 1);
});

test('naming a baby uses the pet name rules', () => {
  const s = farmWith('duck', 1);
  L.broodOf(s).care.duck = L.BABY_CARE; L.broodTick(s, 0, seq(0));
  assert.equal(L.renameKid(s, 0, '  꼬마<b>  '), '꼬마b');
  assert.equal(s.brood.kids[0].name, '꼬마b');
  assert.equal(L.renameKid(s, 0, '<>'), null);
  assert.equal(L.renameKid(s, 5, '아무'), null);
  assert.ok(L.renameKid(s, 0, 'x'.repeat(30)).length <= L.PET_NAME_MAX);
});

// ---------- 허수아비 ----------
test('scarecrow items: hats, clothes, props; some festival-only; need a scarecrow', () => {
  assert.ok(L.SCARE_ITEMS.length >= 10);
  for (const slot of ['hat', 'cloth', 'prop']) assert.ok(L.SCARE_ITEMS.filter((x) => x.slot === slot).length >= 3, slot);
  const fest = L.SCARE_ITEMS.filter((x) => x.fest);
  assert.ok(fest.length >= 4);
  for (const se of L.SEASONS) assert.ok(fest.some((x) => x.fest === se), se);
  const s = fresh(); s.coins = 1e5;
  const it = L.SCARE_ITEMS.find((x) => !x.fest);
  assert.equal(L.scareItemStatus(s, it.id, null), 'noscare');
  assert.equal(L.getScareItem(s, it.id, null).why, 'noscare');
  s.up.scare = 1;
  assert.equal(L.scareItemStatus(s, it.id, null), 'ok');
  const c0 = s.coins;
  assert.deepEqual(L.getScareItem(s, it.id, null), { ok: true });
  assert.equal(s.coins, c0 - it.cost);
  assert.equal(L.scareItemStatus(s, it.id, null), 'owned');
  // festival-only: free, and only on its own festival day
  const f = fest[0];
  assert.equal(L.scareItemStatus(s, f.id, null), 'fest');
  assert.equal(L.getScareItem(s, f.id, 'nope').why, 'fest');
  const c1 = s.coins;
  assert.deepEqual(L.getScareItem(s, f.id, f.fest), { ok: true });
  assert.equal(s.coins, c1);
  // poor
  const p = fresh(); p.up.scare = 1; p.coins = 0;
  assert.equal(L.getScareItem(p, it.id, null).why, 'coins');
});

test('wearing: one per slot, tap again to take off; cosmetic only (crow chance unchanged)', () => {
  const s = fresh(); s.coins = 1e5; s.up.scare = 2;
  const hats = L.SCARE_ITEMS.filter((x) => x.slot === 'hat' && !x.fest);
  hats.slice(0, 2).forEach((h) => L.getScareItem(s, h.id, null));
  const chance = L.UPG.scare.chance[L.tier(s, 'scare')];
  assert.ok(L.wearScare(s, hats[0].id));
  assert.equal(L.scareLook(s).hat, hats[0].id);
  assert.ok(L.wearScare(s, hats[1].id));
  assert.equal(L.scareLook(s).hat, hats[1].id);
  assert.ok(L.wearScare(s, hats[1].id));
  assert.equal(L.scareLook(s).hat, null);
  assert.equal(L.wearScare(s, L.SCARE_ITEMS.find((x) => x.slot === 'prop' && !s.scare.got[x.id]).id), false, 'not owned');
  assert.equal(L.UPG.scare.chance[L.tier(s, 'scare')], chance);
  assert.deepEqual(L.scareLook(fresh()), { hat: null, cloth: null, prop: null });
});

// ---------- 수첩 · 세이브 ----------
test('GUIDE lines for 꽃 교배, 동물 새끼, 허수아비 꾸미기, with numbers from constants', () => {
  const g = (id) => L.guideById(id);
  for (const id of ['garden', 'brood', 'scaredress']) assert.ok(g(id), id);
  assert.match(g('garden').how, new RegExp(String(L.FLOWERS.length)));
  assert.match(g('garden').lock, new RegExp(L.decoById('flowers').cost.toLocaleString('en-US')));
  assert.match(g('brood').how, new RegExp(String(L.BABY_GROW / D)));
  assert.match(g('scaredress').lock, new RegExp(L.UPG.scare.costs[0].toLocaleString('en-US')));
  const s = fresh();
  for (const id of ['garden', 'brood', 'scaredress']) assert.equal(L.guideOpen(s, id), false, id);
  const b = withBed(); assert.ok(L.guideOpen(b, 'garden'));
  assert.ok(L.guideOpen(farmWith('hen', 1), 'brood'));
  s.up.scare = 1; assert.ok(L.guideOpen(s, 'scaredress'));
});

test('save: garden/brood/scare round-trip; junk cleaned; fresh saves have none', () => {
  const s = withBed(); s.yard.house = 3;
  L.plantFlower(s, 0, 'daisy', 0); L.plantFlower(s, 1, 'tulip', 0);
  L.gardenTick(s, 2 * D, seq(0.1, 0.5));
  assert.ok(L.buyAnimal(s, 'hen', 0).ok); L.broodOf(s).care.hen = L.BABY_CARE; L.broodTick(s, 0, seq(0));
  s.up.scare = 1; const it = L.SCARE_ITEMS.find((x) => !x.fest); L.getScareItem(s, it.id, null); L.wearScare(s, it.id);
  const o = L.decode(L.encode(s));
  assert.deepEqual(o.garden, s.garden); assert.deepEqual(o.brood, s.brood); assert.deepEqual(o.scare, s.scare);
  const bad = JSON.parse(L.encode(s));
  bad.garden = { bed: [{ id: 'nope', t: 0 }, { id: 'daisy_dot', t: 'x' }, 5], dex: { nope: true, daisy_plain: true }, next: 'q' };
  bad.brood = { care: { hen: -5, cow: 1e9 }, next: {}, kids: [{ kind: 'pig', name: 'x', born: 0 }, { kind: 'hen', name: '<>', born: 0 }, 7] };
  bad.scare = { got: { nope: true, [it.id]: true }, wear: { hat: 'nope', cloth: it.id, prop: 3 } };
  const d = L.decode(JSON.stringify(bad));
  assert.ok(d);
  assert.equal(d.garden.bed.length, L.GARDEN_N); assert.ok(d.garden.bed.every((p) => p === null));
  assert.deepEqual(Object.keys(d.garden.dex), ['daisy_plain']);
  assert.ok(d.brood.care.hen === 0 && d.brood.care.cow <= L.CARE_MAX);
  assert.equal(d.brood.kids.length, 1); assert.equal(d.brood.kids[0].name, L.BABY_KIND.hen.def);
  assert.deepEqual(Object.keys(d.scare.got), [it.id]);
  assert.equal(d.scare.wear.hat, null); assert.equal(d.scare.wear.prop, null);
  assert.equal(d.scare.wear.cloth, it.slot === 'cloth' ? it.id : null);
  const f = L.decode(L.encode(fresh()));
  assert.equal(f.garden, undefined); assert.equal(f.brood, undefined); assert.equal(f.scare, undefined);
});

test('old fixtures load unchanged without s.garden / s.brood / s.scare; their honey sources are unchanged', () => {
  const dir = path.join(__dirname, 'fixtures');
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
    const raw = fs.readFileSync(path.join(dir, f), 'utf8');
    if (/"(garden|brood|scare)":/.test(raw)) continue;   // saved by stage 10 ②+
    const s = L.decode(raw);
    assert.ok(s, f);
    assert.equal(s.garden, undefined, f); assert.equal(s.brood, undefined, f); assert.equal(s.scare, undefined, f);
    const again = L.decode(L.encode(s));
    assert.deepEqual(JSON.parse(L.encode(again)), JSON.parse(L.encode(s)), f);
    for (const se of L.SEASONS) assert.ok(!L.honeySources(s, se, 1e13).some((x) => x.id === 'patternhoney'), f);
    // animals produce exactly as before (no grown kids)
    for (const id of L.ANIMAL_IDS) assert.equal(L.broodHeads(s, id, 1e13), 0);
  }
});

// the logic files share one scope: a second `var NAME =` silently replaces the first (the 꽃밭 CROSS_CHANCE once overwrote the 황금 씨앗 one)
test('no top-level var name is declared twice across the logic block', () => {
  const src = html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1], seen = {}, dup = [];
  const re = /^ {2}var ([^;]+);/gm;
  let m;
  while ((m = re.exec(src))) {
    m[1].split(/,\s*(?=[A-Za-z_$][\w$]*\s*=)/).forEach((part) => {
      const name = part.trim().split(/\s*=/)[0];
      if (/^[A-Za-z_$][\w$]*$/.test(name)) { if (seen[name]) dup.push(name); seen[name] = true; }
    });
  }
  assert.ok(seen.CROSS_CHANCE && seen.FLOWER_CROSS_CHANCE && Object.keys(seen).length > 100, 'the scan sees the declarations');
  assert.deepEqual(dup, []);
});
