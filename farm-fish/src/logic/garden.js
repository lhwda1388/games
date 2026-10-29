  // ---------- stage 10 ②: 꽃밭 교배 (s.garden), 동물 새끼 (s.brood), 허수아비 꾸미기 (s.scare) ----------
  // All three are optional save blocks made on first use; older saves have none and play exactly as before.

  // ---------- 꽃: shape × pattern. Seeds are the plain ones; patterns only come from crossing ----------
  var FLOWER_SHAPES = [
    { id: 'daisy', name: '데이지' }, { id: 'tulip', name: '튤립' }, { id: 'bell', name: '초롱꽃' }, { id: 'cosmos', name: '코스모스' }
  ];
  var FLOWER_PATS = [
    { id: 'plain',  name: '',     hint: '꽃씨로 심는다' },
    { id: 'stripe', name: '줄무늬', hint: '민무늬 둘이 이웃하면' },
    { id: 'dot',    name: '점박이', hint: '민무늬 둘이 이웃하면' },
    { id: 'rim',    name: '테두리', hint: '줄무늬나 점박이가 민무늬 옆에서' },
    { id: 'double', name: '겹',    hint: '줄무늬와 점박이가 만나면' },
    { id: 'night',  name: '밤빛',   hint: '겹꽃끼리, 아주 가끔' }
  ];
  // unordered pair of patterns → what a child may be (missing pair: one of the parents' patterns)
  var CROSS_PAT = {
    'plain+plain': ['stripe', 'dot'], 'plain+stripe': ['stripe', 'rim'], 'dot+plain': ['dot', 'rim'],
    'dot+stripe': ['double', 'rim'], 'stripe+stripe': ['stripe', 'double'], 'dot+dot': ['dot', 'double'],
    'rim+rim': ['rim', 'double'], 'double+rim': ['double', 'night'], 'double+double': ['double', 'night'], 'night+night': ['night']
  };
  var FLOWERS = [];
  FLOWER_SHAPES.forEach(function (sh) {
    FLOWER_PATS.forEach(function (p) {
      FLOWERS.push({ id: sh.id + '_' + p.id, shape: sh.id, pat: p.id, name: p.id === 'plain' ? sh.name : p.id === 'double' ? '겹' + sh.name : p.name + ' ' + sh.name, hint: p.hint });
    });
  });
  var GARDEN_COLS = 4, GARDEN_ROWS = 2, GARDEN_N = GARDEN_COLS * GARDEN_ROWS;
  var FLOWER_SEED_COST = 80;
  var FLOWER_GROW = 2 * 3600e3;        // a planted or new flower blooms after this
  var CROSS_EVERY = 30 * 60e3;         // one cross check this often (offline too)
  var FLOWER_CROSS_CHANCE = 0.06;             // per bloomed neighbour pair, per check; at most one new flower a check
  var CROSS_MAX_STEPS = 200;           // catch-up limit after a long time away
  // 무늬꽃꿀: bees around patterned flowers (only with a garden, so old saves' honey is unchanged)
  var PATTERN_HONEY = { id: 'patternhoney', name: '무늬꽃꿀', price: 260, src: 'yard', hint: '마당 꽃밭에 무늬 꽃이 피어 있을 때 (겨울 빼고)' };
  HONEYS.push(PATTERN_HONEY); HONEY_BY[PATTERN_HONEY.id] = PATTERN_HONEY;

  function flowerById(id) { for (var k = 0; k < FLOWERS.length; k++) if (FLOWERS[k].id === id) return FLOWERS[k]; return null; }
  function gardenOk(s) { return !!(s.yard && s.yard.place && s.yard.place.deco.flowers !== undefined); }
  function gardenOf(s) {
    if (!s.garden) { var bed = []; for (var k = 0; k < GARDEN_N; k++) bed.push(null); s.garden = { bed: bed, dex: {}, next: 0 }; }
    return s.garden;
  }
  function gardenNeighbors(k) {
    var c = k % GARDEN_COLS, r = Math.floor(k / GARDEN_COLS), out = [];
    if (c > 0) out.push(k - 1);
    if (c < GARDEN_COLS - 1) out.push(k + 1);
    if (r > 0) out.push(k - GARDEN_COLS);
    if (r < GARDEN_ROWS - 1) out.push(k + GARDEN_COLS);
    return out;
  }
  function flowerBloom(p, now) { return !!p && now - p.t >= FLOWER_GROW; }
  function flowerDexCount(s) { return s.garden ? Object.keys(s.garden.dex).length : 0; }
  function plantFlower(s, k, shape, now) {
    if (!gardenOk(s)) return { ok: false, why: 'bed' };
    if (!(k >= 0 && k < GARDEN_N)) return { ok: false, why: 'slot' };
    var id = shape + '_plain';
    if (!flowerById(id)) return { ok: false, why: 'shape' };
    var g = gardenOf(s);
    if (g.bed[k]) return { ok: false, why: 'full' };
    if (s.coins < FLOWER_SEED_COST) return { ok: false, why: 'coins' };
    s.coins -= FLOWER_SEED_COST;
    g.bed[k] = { id: id, t: now };
    g.dex[id] = true;
    if (!g.next || g.next < now) g.next = now + CROSS_EVERY;
    return { ok: true, id: id };
  }
  function pullFlower(s, k) {
    if (!s.garden || !s.garden.bed[k]) return false;
    s.garden.bed[k] = null; return true;
  }
  // the child of two flowers: one parent's shape, a pattern from the table
  function crossChild(a, b, rng) {
    var fa = flowerById(a), fb = flowerById(b);
    var shape = rng() < 0.5 ? fa.shape : fb.shape;
    var key = [fa.pat, fb.pat].sort().join('+');
    var list = CROSS_PAT[key] || [fa.pat, fb.pat];
    return shape + '_' + list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
  }
  // time-based: every CROSS_EVERY, bloomed neighbours may cross into an empty slot next to them → [{ k, id, at, first }]
  function gardenTick(s, now, rng) {
    var g = s.garden, out = [];
    if (!g || !g.next) return out;
    var ok = gardenOk(s), steps = 0;
    for (; g.next <= now && steps < CROSS_MAX_STEPS; g.next += CROSS_EVERY, steps++) {
      if (ok) crossStep(g, g.next, rng, out);
    }
    if (g.next <= now) g.next = now + CROSS_EVERY;
    return out;
  }
  function crossStep(g, T, rng, out) {
    for (var k = 0; k < GARDEN_N; k++) {
      var ns = gardenNeighbors(k);
      for (var j = 0; j < ns.length; j++) {
        var m = ns[j];
        if (m < k || !flowerBloom(g.bed[k], T) || !flowerBloom(g.bed[m], T) || rng() >= FLOWER_CROSS_CHANCE) continue;
        var empty = gardenNeighbors(k).concat(gardenNeighbors(m)).filter(function (e, i, a) { return !g.bed[e] && a.indexOf(e) === i; }).sort();
        if (!empty.length) continue;
        var at = empty[Math.min(empty.length - 1, Math.floor(rng() * empty.length))];
        var id = crossChild(g.bed[k].id, g.bed[m].id, rng), first = !g.dex[id];
        g.bed[at] = { id: id, t: T }; g.dex[id] = true;
        out.push({ k: at, id: id, at: T, first: first });
        return;
      }
    }
  }
  // called by honeySources (orchard.js): blooming garden flowers add to 꽃밭꿀 / 무늬꽃꿀
  function gardenHoney(s, season, now, add) {
    if (season === 'winter' || !s.garden || !gardenOk(s)) return;
    s.garden.bed.forEach(function (p) {
      if (!flowerBloom(p, now)) return;
      if (flowerById(p.id).pat === 'plain') add('flowerbed', 0.5); else add(PATTERN_HONEY.id, 1);
    });
  }

  // ---------- 동물 새끼: 친밀도 = products collected; a baby now and then, grows, then lays/milks like an adult ----------
  var BABY_KIND = {
    hen:  { name: '병아리',   def: '삐약이' },
    duck: { name: '새끼오리', def: '꽥꽥이' },
    cow:  { name: '송아지',   def: '음매' }
  };
  var BABY_CARE = 200;                 // 친밀도 a baby needs (spent when one is born)
  var CARE_MAX = 999;
  var BABY_CHANCE = 0.25, BABY_GAP = 6 * 3600e3;   // one roll per animal kind this often once there is 친밀도
  var BABY_PER_HEAD = 1;               // babies per bought animal, ever
  var BABY_GROW = 3 * 86400e3;
  function broodOf(s) {
    if (!s.brood) s.brood = { care: { hen: 0, duck: 0, cow: 0 }, next: { hen: 0, duck: 0, cow: 0 }, kids: [] };
    return s.brood;
  }
  // collectAnimals (yard.js): every product picked up is a bit of 친밀도 for its animal
  function broodCare(s, items) {
    if (!items.length) return;
    var c = broodOf(s).care;
    items.forEach(function (pid) { var f = PRODUCTS[pid] && PRODUCTS[pid].from; if (c.hasOwnProperty(f)) c[f] = Math.min(CARE_MAX, c[f] + 1); });
  }
  function kidsOf(s, id) { return s.brood ? s.brood.kids.filter(function (k) { return k.kind === id; }).length : 0; }
  function babyRoom(s, id) { return ((s.animals && s.animals[id]) || 0) * BABY_PER_HEAD - kidsOf(s, id); }
  function kidGrown(kid, now) { return now - kid.born >= BABY_GROW; }
  // grown kids lay/milk too (animalTick adds them to the heads)
  function broodHeads(s, id, now) {
    if (!s.brood) return 0;
    var n = 0; s.brood.kids.forEach(function (k) { if (k.kind === id && kidGrown(k, now)) n++; }); return n;
  }
  function broodTick(s, now, rng) {
    var b = s.brood, out = [];
    if (!b) return out;
    ANIMAL_IDS.forEach(function (id) {
      if (babyRoom(s, id) <= 0 || b.care[id] < BABY_CARE || now < b.next[id]) return;
      b.next[id] = now + BABY_GAP;
      if (rng() >= BABY_CHANCE) return;
      var kid = { kind: id, name: BABY_KIND[id].def, born: now };
      b.kids.push(kid); b.care[id] -= BABY_CARE;
      out.push(kid);
    });
    return out;
  }
  function renameKid(s, k, name) {
    var n = cleanPetName(name), kid = s.brood && s.brood.kids[k];
    if (!kid || !n) return null;
    kid.name = n; return n;
  }

  // ---------- 허수아비 꾸미기: cosmetic only. fest = free, only on that festival's day ----------
  var SCARE_ITEMS = [
    { id: 'sc_straw',  slot: 'hat',   name: '밀짚모자',   cost: 300 },
    { id: 'sc_beanie', slot: 'hat',   name: '털모자',     cost: 500 },
    { id: 'sc_bow',    slot: 'hat',   name: '리본',       cost: 400 },
    { id: 'sc_crown',  slot: 'hat',   name: '벚꽃 화관',  cost: 0, fest: 'spring' },
    { id: 'sc_bucket', slot: 'hat',   name: '양동이 모자', cost: 0, fest: 'winter' },
    { id: 'sc_check',  slot: 'cloth', name: '체크 셔츠',  cost: 400 },
    { id: 'sc_overall', slot: 'cloth', name: '멜빵바지',  cost: 600 },
    { id: 'sc_rain',   slot: 'cloth', name: '비옷',       cost: 800 },
    { id: 'sc_hanbok', slot: 'cloth', name: '한복 저고리', cost: 0, fest: 'autumn' },
    { id: 'sc_shovel', slot: 'prop',  name: '삽',         cost: 300 },
    { id: 'sc_flag',   slot: 'prop',  name: '깃발',       cost: 500 },
    { id: 'sc_umbrella', slot: 'prop', name: '우산',      cost: 700 },
    { id: 'sc_fan',    slot: 'prop',  name: '불꽃 부채',  cost: 0, fest: 'summer' }
  ];
  var SCARE_SLOTS = ['hat', 'cloth', 'prop'];
  function scareItemById(id) { for (var k = 0; k < SCARE_ITEMS.length; k++) if (SCARE_ITEMS[k].id === id) return SCARE_ITEMS[k]; return null; }
  function scareOf(s) { if (!s.scare) s.scare = { got: {}, wear: { hat: null, cloth: null, prop: null } }; return s.scare; }
  // fest = the festival on now (or null) → 'none' | 'noscare' | 'owned' | 'fest' | 'coins' | 'ok'
  function scareItemStatus(s, id, fest) {
    var it = scareItemById(id);
    if (!it) return 'none';
    if (tier(s, 'scare') < 1) return 'noscare';
    if (s.scare && s.scare.got[id]) return 'owned';
    if (it.fest) return fest === it.fest ? 'ok' : 'fest';
    return s.coins < it.cost ? 'coins' : 'ok';
  }
  function getScareItem(s, id, fest) {
    var st = scareItemStatus(s, id, fest), it = scareItemById(id);
    if (st !== 'ok') return { ok: false, why: st };
    if (!it.fest) s.coins -= it.cost;
    scareOf(s).got[id] = true;
    return { ok: true };
  }
  // put it on (one per slot); the same one again takes it off
  function wearScare(s, id) {
    var it = scareItemById(id);
    if (!it || !s.scare || !s.scare.got[id]) return false;
    var w = s.scare.wear;
    w[it.slot] = w[it.slot] === id ? null : id;
    return true;
  }
  function scareLook(s) {
    var w = s.scare ? s.scare.wear : {};
    return { hat: w.hat || null, cloth: w.cloth || null, prop: w.prop || null };
  }

  // ---------- save: called by decode() (after the yard, so animals and the bed are known) ----------
  function decodeStage10B(o, s) {
    var num = function (x) { return typeof x === 'number' && isFinite(x); };
    var obj = function (x) { return !!x && typeof x === 'object' && !Array.isArray(x); };
    var cnt = function (x, max) { return num(x) ? Math.max(0, Math.min(max, Math.floor(x))) : 0; };
    if (obj(o.garden)) {
      var q = o.garden, g = gardenOf(s);
      if (Array.isArray(q.bed)) for (var k = 0; k < GARDEN_N; k++) {
        var p = q.bed[k];
        if (obj(p) && flowerById(p.id) && num(p.t)) g.bed[k] = { id: p.id, t: p.t };
      }
      if (obj(q.dex)) FLOWERS.forEach(function (f) { if (q.dex[f.id] === true) g.dex[f.id] = true; });
      if (num(q.next)) g.next = q.next;
    }
    if (obj(o.brood)) {
      var qb = o.brood, b = broodOf(s);
      ANIMAL_IDS.forEach(function (id) {
        if (obj(qb.care)) b.care[id] = cnt(qb.care[id], CARE_MAX);
        if (obj(qb.next) && num(qb.next[id])) b.next[id] = qb.next[id];
      });
      if (Array.isArray(qb.kids)) qb.kids.forEach(function (kd) {
        if (!obj(kd) || !BABY_KIND.hasOwnProperty(kd.kind) || !num(kd.born) || babyRoom(s, kd.kind) <= 0) return;
        b.kids.push({ kind: kd.kind, name: cleanPetName(kd.name) || BABY_KIND[kd.kind].def, born: kd.born });
      });
      // decodeYard capped the waiting products by bought heads only: give grown kids their share back
      var qp = obj(o.yard) && obj(o.yard.prod) ? o.yard.prod : null;
      if (qp && s.yard) ANIMAL_IDS.forEach(function (id) {
        var e = qp[id];
        if (obj(e) && num(e.t) && kidsOf(s, id)) s.yard.prod[id].n = cnt(e.n, (s.animals[id] + kidsOf(s, id)) * ANIMAL_CAP);
      });
    }
    if (obj(o.scare)) {
      var qs = o.scare, sc = scareOf(s);
      if (obj(qs.got)) SCARE_ITEMS.forEach(function (it) { if (qs.got[it.id] === true) sc.got[it.id] = true; });
      if (obj(qs.wear)) SCARE_SLOTS.forEach(function (sl) {
        var it = scareItemById(qs.wear[sl]);
        if (it && it.slot === sl && sc.got[it.id]) sc.wear[sl] = it.id;
      });
    }
  }

  expose({
    FLOWER_SHAPES: FLOWER_SHAPES, FLOWER_PATS: FLOWER_PATS, FLOWERS: FLOWERS, GARDEN_COLS: GARDEN_COLS, GARDEN_ROWS: GARDEN_ROWS, GARDEN_N: GARDEN_N,
    FLOWER_SEED_COST: FLOWER_SEED_COST, FLOWER_GROW: FLOWER_GROW, CROSS_EVERY: CROSS_EVERY, FLOWER_CROSS_CHANCE: FLOWER_CROSS_CHANCE,
    flowerById: flowerById, gardenOk: gardenOk, gardenOf: gardenOf, gardenNeighbors: gardenNeighbors, flowerBloom: flowerBloom,
    flowerDexCount: flowerDexCount, plantFlower: plantFlower, pullFlower: pullFlower, crossChild: crossChild, gardenTick: gardenTick,
    BABY_KIND: BABY_KIND, BABY_CARE: BABY_CARE, CARE_MAX: CARE_MAX, BABY_CHANCE: BABY_CHANCE, BABY_GAP: BABY_GAP, BABY_PER_HEAD: BABY_PER_HEAD, BABY_GROW: BABY_GROW,
    broodOf: broodOf, broodTick: broodTick, broodHeads: broodHeads, kidGrown: kidGrown, babyRoom: babyRoom, renameKid: renameKid,
    SCARE_ITEMS: SCARE_ITEMS, SCARE_SLOTS: SCARE_SLOTS, scareItemById: scareItemById, scareItemStatus: scareItemStatus,
    getScareItem: getScareItem, wearScare: wearScare, scareLook: scareLook,
    decodeStage10B: decodeStage10B
  });
