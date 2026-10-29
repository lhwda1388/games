  // ---------- 반려동물: one cat or dog that follows you around (s.pet, absent until adopted). It never takes anything. ----------
  // 고양이: free once the 고양이 친구 secret is found or the visiting cat came PET_CAT_VISITS times. 강아지: bought in the 상점.
  // Real-day counters (tzMin = minutes east of UTC): petting raises 친밀도 a few times a day, gifts come a few times a day
  // with a gap between them, and in the 숲 it sniffs out a find now and then. Each counter resets at local midnight.
  var PET_KINDS = {
    cat: { id: 'cat', name: '고양이', def: '나비', cost: 0 },
    dog: { id: 'dog', name: '강아지', def: '바둑이', cost: 3000 }
  };
  var PET_CAT_VISITS = 5;
  var PET_LV = [5, 15, 35, 70];                       // 친밀도 for levels 1..4
  var PET_ACTS = ['곁에 앉아 있기', '꼬리 흔들며 따라다니기', '선착장에서 찌 구경 · 숲에서 킁킁', '하루 선물 한 번 더', '발밑에서 낮잠'];
  var PET_PETS_DAY = 5, PET_GIFT_GAP = 2 * 3600e3, PET_FIND_DAY = 3, PET_FIND_GAP = 15 * 60e3, PET_FIND_LV = 2;
  var PET_GIFTS = { cat: ['minnow', 'crucian', 'minnow'], dog: ['pebble', 'pinecone', 'birdfeather'] };

  function petDay(now, tzMin) { return Math.floor((now + (tzMin || 0) * 60e3) / 86400e3); }
  function petLevel(s) {
    var f = s.pet ? s.pet.f : 0, lv = 0;
    while (lv < PET_LV.length && f >= PET_LV[lv]) lv++;
    return lv;
  }
  function petGiftCap(s) { return (petLevel(s) >= 3 ? 3 : 2) + (dayIs(s, 'pet') ? 1 : 0); }   // stage 8: 반려동물 신난 날
  // 이름: same letters as the farm nickname (Hangul, latin, digits, space, a few marks), 6 characters
  var PET_NAME_MAX = 6;
  function cleanPetName(str) { return cleanNick(str).slice(0, PET_NAME_MAX).trim(); }
  function catAdoptOk(s) { return !!(s.yard && (s.yard.eggs.catpet || (s.yard.met.cat || 0) >= PET_CAT_VISITS)); }
  function adoptStatus(s, kind) {
    var k = PET_KINDS[kind];
    if (!k) return 'none';
    if (s.pet) return 'have';
    if (kind === 'cat' && !catAdoptOk(s)) return 'locked';
    if (s.coins < k.cost) return 'coins';
    return 'ok';
  }
  function adoptPet(s, kind, name, now) {
    var st = adoptStatus(s, kind);
    if (st !== 'ok') return { ok: false, why: st };
    var k = PET_KINDS[kind];
    s.coins -= k.cost;
    s.pet = { kind: kind, name: cleanPetName(name) || k.def, at: now, f: 0, day: -1, pn: 0, gn: 0, fn: 0, gnext: now + PET_GIFT_GAP, fnext: now };
    return { ok: true, name: s.pet.name };
  }
  function renamePet(s, name) {
    var n = cleanPetName(name);
    if (!s.pet || !n) return null;
    s.pet.name = n; return n;
  }
  function petRollDay(p, now, tzMin) { var d = petDay(now, tzMin); if (p.day !== d) { p.day = d; p.pn = 0; p.gn = 0; p.fn = 0; } }
  // 쓰다듬기: always a heart; 친밀도 only for the first PET_PETS_DAY a day. up = the level it just reached
  function petPet(s, now, tzMin) {
    var p = s.pet;
    if (!p) return null;
    petRollDay(p, now, tzMin);
    var before = petLevel(s), gain = 0;
    if (p.pn < PET_PETS_DAY) { p.pn++; p.f++; gain = 1; }
    var lv = petLevel(s);
    return { gain: gain, lv: lv, up: lv > before ? lv : 0 };
  }
  function petGiftReady(s, now, tzMin) {
    var p = s.pet;
    if (!p) return false;
    petRollDay(p, now, tzMin);
    return p.gn < petGiftCap(s) && now >= p.gnext;
  }
  // a small present into the basket: the cat brings a little fish, the dog a little forage (or what grows in the 숲 now)
  function takePetGift(s, now, tzMin, env, rng) {
    if (!petGiftReady(s, now, tzMin)) return null;
    var p = s.pet, list = PET_GIFTS[p.kind], id = list[Math.floor(rng() * list.length) % list.length];
    if (p.kind === 'dog' && s.forest && env && rng() < 0.5) id = rollForage(env, rng);
    p.gn++; p.gnext = now + PET_GIFT_GAP; p.f++;
    var it = itemInfo(id), sold = bagAdd(s, id, it.price);
    if (forageById(id) && s.forest) forageNote(s, id, 1);
    return { id: id, sold: sold };
  }
  // in the 숲 at 친밀도 PET_FIND_LV+: a few finds a day, PET_FIND_GAP apart
  function petFind(s, now, tzMin, env, rng) {
    var p = s.pet;
    if (!p || !s.forest || petLevel(s) < PET_FIND_LV) return null;
    petRollDay(p, now, tzMin);
    if (p.fn >= PET_FIND_DAY || now < p.fnext) return null;
    p.fn++; p.fnext = now + PET_FIND_GAP;
    var id = rollForage(env, rng), sold = bagAdd(s, id, forageById(id).price);
    forageNote(s, id, 1);
    return { id: id, sold: sold };
  }

  // ---------- save: called by decode() at the end ----------
  function decodePet(o, s) {
    var q = o.pet;
    if (!q || typeof q !== 'object' || !PET_KINDS[q.kind]) return;
    var num = function (x) { return typeof x === 'number' && isFinite(x); };
    var cnt = function (x, max) { return num(x) ? Math.max(0, Math.min(max, Math.floor(x))) : 0; };
    s.pet = { kind: q.kind, name: (typeof q.name === 'string' && cleanPetName(q.name)) || PET_KINDS[q.kind].def,
      at: num(q.at) ? q.at : 0, f: cnt(q.f, 1e6), day: num(q.day) ? Math.floor(q.day) : -1,
      pn: cnt(q.pn, PET_PETS_DAY), gn: cnt(q.gn, 9), fn: cnt(q.fn, PET_FIND_DAY),
      gnext: num(q.gnext) ? q.gnext : 0, fnext: num(q.fnext) ? q.fnext : 0 };
  }
  // stage 5A save block: 숲 and 반려동물 (both optional)
  function decodeStage5A(o, s) { decodeForest(o, s); decodePet(o, s); }

  expose({
    PET_KINDS: PET_KINDS, PET_LV: PET_LV, PET_ACTS: PET_ACTS, PET_CAT_VISITS: PET_CAT_VISITS, PET_NAME_MAX: PET_NAME_MAX,
    PET_PETS_DAY: PET_PETS_DAY, PET_GIFT_GAP: PET_GIFT_GAP, PET_FIND_DAY: PET_FIND_DAY, PET_FIND_GAP: PET_FIND_GAP, PET_FIND_LV: PET_FIND_LV,
    petDay: petDay, petLevel: petLevel, petGiftCap: petGiftCap, cleanPetName: cleanPetName, catAdoptOk: catAdoptOk,
    adoptStatus: adoptStatus, adoptPet: adoptPet, renamePet: renamePet, petPet: petPet, petGiftReady: petGiftReady,
    takePetGift: takePetGift, petFind: petFind, decodePet: decodePet, decodeStage5A: decodeStage5A
  });
