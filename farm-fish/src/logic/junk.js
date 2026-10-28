  // ---------- 낚시 잡동사니 · 보물 상자 · 병 편지 (stage 5B) ----------
  // Sometimes a common fish's bite is something else. Junk never enters the 도감, the fish milestones or the basket:
  // it lives in s.junk (made lazily, absent from older saves) and is sold as 고물 or traded for recycled decorations.
  // Rare/legend/festival bites are never replaced, so junk can't cost a good fish.
  var JUNK_CHANCE = 0.1;                // of hooked 흔함 bites
  var JUNK = [
    { id: 'boot',   name: '낡은 장화',  w: 22, scrap: 15, desc: '한 짝뿐인 고무장화' },
    { id: 'can',    name: '빈 깡통',    w: 34, scrap: 10, desc: '찌그러진 통조림 깡통' },
    { id: 'bottle', name: '유리병',     w: 16, scrap: 20, desc: '물때 낀 빈 유리병' },
    { id: 'key',    name: '낡은 열쇠',  w: 10, scrap: 60, desc: '어딘가의 자물쇠에 맞을 것 같다' },
    { id: 'letter', name: '병 편지',    w: 32, desc: '코르크로 막힌 병 속에 종이가 말려 있다' },
    { id: 'chest',  name: '보물 상자',  w: 8,  desc: '이끼 낀 작은 나무 상자' }
  ];
  var SCRAP_IDS = ['boot', 'can', 'bottle', 'key'];
  // recycled decorations (DECOS below, merchant:true keeps them out of the shop); 'chest' = two keys open a box
  var RECYCLE = [
    { id: 'canchime',   need: { can: 4 },              name: '깡통 풍경' },
    { id: 'bootpot',    need: { boot: 3 },             name: '장화 화분' },
    { id: 'bottlelamp', need: { bottle: 3, can: 1 },   name: '유리병 등불' },
    { id: 'chest',      need: { key: 2 },              name: '보물 상자 열기' }
  ];
  var TREASURE_DECOS = ['anchor', 'shipwheel'];
  [
    { id: 'canchime',   name: '깡통 풍경',   cost: 0, merchant: true, from: 'junk', sz: [12, 22] },
    { id: 'bootpot',    name: '장화 화분',   cost: 0, merchant: true, from: 'junk', sz: [12, 18] },
    { id: 'bottlelamp', name: '유리병 등불', cost: 0, merchant: true, from: 'junk', sz: [8, 18] },
    { id: 'anchor',     name: '닻',          cost: 0, merchant: true, from: 'treasure', sz: [16, 20] },
    { id: 'shipwheel',  name: '배 키',       cost: 0, merchant: true, from: 'treasure', sz: [18, 20] }
  ].forEach(function (d) { DECOS.push(d); });

  // 병 편지: one short story in 12 letters, found in random order, never repeated until all 12 are in.
  // Some carry an easter-egg hint (EGGS ids) in their last line.
  var BOTTLE_LETTERS = [
    '첫 번째 병이에요. 등대섬에 사는 해솔이라고 해요. 섬에는 저랑 할머니, 그리고 고양이 무명이뿐이라 병에 편지를 넣어 띄워 봐요. 누가 읽으면 좋겠다.',
    '할머니는 등대지기예요. 밤마다 계단 백스물세 개를 올라가서 불을 닦아요. 저는 아직 육십 개쯤에서 숨이 차요.',
    '오늘은 바다가 잔잔해서 할머니랑 낚시를 했어요. 할머니가 그러는데, 찌가 톡톡 거릴 땐 참고 쑥 잠길 때 채야 한대요. 저는 세 번이나 일찍 챘어요.',
    '무명이가 또 어부 아저씨 배에 올라탔어요. 고양이는 물고기를 구경하는 게 제일 좋은가 봐요. 구경만 하고 아무것도 안 가져와요.',
    '태풍이 지나갔어요. 등대 유리가 하나 깨져서 할머니가 밤새 판자를 댔어요. 저는 손전등을 들고 있었어요. 조금 무서웠는데 할머니가 노래를 불러 줬어요.',
    '육지 학교에 가게 될지도 몰라요. 할머니는 가라고 하는데, 그럼 등대 불은 누가 같이 닦아요? 그 생각을 하면 자꾸 바다만 보게 돼요.',
    '병 편지에 답장이 올 리 없다는 거 알아요. 그래도 어제 바닷가에서 모르는 사람 글씨로 "잘 읽고 있어요"라고 쓴 조약돌을 주웠어요. 혹시 당신이에요?',
    '할머니가 어릴 적 이야기를 해 줬어요. 섬에 정각마다 째깍 소리를 내는 물고기가 살았대요. 00분에 낚싯대를 드리우면 만날 수 있다나요.',
    '오늘은 별똥별을 세 번 봤어요. 한 밤에 소원을 세 번 빌면 하나는 꼭 이루어진대서, 세 번 다 같은 소원을 빌었어요. 비밀이에요.',
    '결국 육지 학교에 가기로 했어요. 대신 방학마다 와서 계단을 끝까지 올라가기로 할머니랑 약속했어요. 요즘은 아흔 개까지 가요.',
    '떠나기 전날, 할머니가 등대 열쇠 하나를 줬어요. 너무 낡아서 맞는 자물쇠가 없대요. 그래도 주머니에 넣으면 든든해요. 낡은 열쇠 두 개면 뭐든 열린다는 말도 있대요.',
    '마지막 병이에요. 백스물세 개, 오늘 처음으로 끝까지 올라갔어요. 위에서 보니 바다가 다 보였어요. 어딘가에서 이 편지들을 모아 준 당신도요. 고마워요. — 해솔'
  ];
  var LETTER_DUP_COINS = 80;    // after all 12, a bottle still holds a few coins (and a reread)

  function junkById(id) { for (var k = 0; k < JUNK.length; k++) if (JUNK[k].id === id) return JUNK[k]; return null; }
  function junkOf(s) {
    if (!s.junk) s.junk = { n: {}, letters: [], box: 0, seen: {}, total: 0 };
    return s.junk;
  }
  function junkCount(s, id) { return (s.junk && s.junk.n[id]) || 0; }
  function lettersFound(s) { return s.junk ? s.junk.letters.length : 0; }
  // the letter a new bottle holds: a random unfound one (1-based number), or 0 once all are found
  function nextBottle(s, rng) {
    var have = s.junk ? s.junk.letters : [], left = [];
    for (var k = 1; k <= BOTTLE_LETTERS.length; k++) if (have.indexOf(k) < 0) left.push(k);
    return left.length ? left[Math.floor(rng() * left.length) % left.length] : 0;
  }
  // which junk (if any) a hooked roll turns into; null = keep the fish
  function rollJunk(roll, rng) {
    var f = roll && fishById(roll.id);
    if (!f || f.rarity !== '흔함' || f.egg || f.fest) return null;
    if (rng() >= JUNK_CHANCE) return null;
    var tot = 0, k; for (k = 0; k < JUNK.length; k++) tot += JUNK[k].w;
    var r = rng() * tot;
    for (k = 0; k < JUNK.length; k++) { r -= JUNK[k].w; if (r < 0) return JUNK[k].id; }
    return JUNK[JUNK.length - 1].id;
  }
  // brings junk id up instead of the fish: the line is idle again, nothing is lost
  function landJunk(s, id, rng) {
    var j = junkOf(s), out = { id: id, first: !j.seen[id] };
    j.seen[id] = true; j.total++;
    if (id === 'letter') {
      var n = nextBottle(s, rng);
      if (n) { j.letters.push(n); out.letter = n; out.complete = j.letters.length === BOTTLE_LETTERS.length; }
      else { s.coins += LETTER_DUP_COINS; out.coins = LETTER_DUP_COINS; out.letter = 1 + Math.floor(rng() * BOTTLE_LETTERS.length) % BOTTLE_LETTERS.length; out.reread = true; }
    } else if (id === 'chest') j.box++;
    else j.n[id] = (j.n[id] || 0) + 1;
    if (s.fish) s.fish = { phase: 'idle' };
    return out;
  }
  function scrapValue(s) { var t = 0; SCRAP_IDS.forEach(function (id) { t += junkCount(s, id) * junkById(id).scrap; }); return t; }
  // 고물 팔기: every scrap piece for coins (keys included; recipes need them, so the UI says so)
  function sellScrap(s, id) {
    var j = junkOf(s), t = 0;
    (id ? [id] : SCRAP_IDS).forEach(function (k) { t += (j.n[k] || 0) * junkById(k).scrap; j.n[k] = 0; });
    s.coins += t; return t;
  }
  function recycleById(id) { for (var k = 0; k < RECYCLE.length; k++) if (RECYCLE[k].id === id) return RECYCLE[k]; return null; }
  // 'ok' | 'owned' | 'need'
  function canRecycle(s, id) {
    var r = recycleById(id);
    if (!r) return 'none';
    if (r.id !== 'chest' && s.yard && s.yard.deco[r.id]) return 'owned';
    return Object.keys(r.need).every(function (k) { return junkCount(s, k) >= r.need[k]; }) ? 'ok' : 'need';
  }
  // owned (or placed) decoration without paying: stands on a free spot, else waits in the 보관함
  function grantDeco(s, id) {
    var y = yardOf(s);
    if (y.deco[id]) return { ok: false, why: 'owned' };
    y.deco[id] = true;
    return { ok: true, stored: !placeItem(s, 'deco', id).ok };
  }
  function recycle(s, id) {
    var why = canRecycle(s, id);
    if (why !== 'ok') return { ok: false, why: why };
    var r = recycleById(id), j = junkOf(s);
    Object.keys(r.need).forEach(function (k) { j.n[k] -= r.need[k]; });
    if (id === 'chest') { j.box++; return { ok: true, box: true }; }
    var g = grantDeco(s, id);
    return { ok: true, stored: g.stored };
  }
  // 보물 상자: tier 0 = opened plainly, 1 = 자물쇠 도전 success (better odds and twice the coins).
  // A treasure decoration is never given twice: when every one is owned that share turns into coins.
  function openChest(s, rng, tier) {
    var j = junkOf(s);
    if (j.box <= 0) return null;
    j.box--;
    tier = tier ? 1 : 0;
    var r = rng(), mul = tier ? 2 : 1, out;
    var decoP = tier ? 0.45 : 0.3, seedP = tier ? 0.3 : 0.25;
    if (r < decoP) {
      var free = TREASURE_DECOS.filter(function (id) { return !(s.yard && s.yard.deco[id]); });
      if (free.length) {
        var id = free[Math.floor(rng() * free.length) % free.length], g = grantDeco(s, id);
        out = { kind: 'deco', id: id, stored: g.stored };
        if (tier) { s.coins += 300; out.coins = 300; }
        return out;
      }
    } else if (r < decoP + seedP) {
      var n = tier ? 2 : 1;
      s.seeds.gold += n; s.dex.goldSeed = true;
      return { kind: 'seed', n: n };
    }
    var c = Math.round((300 + rng() * 400) * mul / 10) * 10;
    s.coins += c;
    return { kind: 'coins', coins: c };
  }

  // ---------- 자물쇠 도전 (optional lock-pick on a 보물 상자): one tap per pin ----------
  // Three pins slide up and down; tap while the current pin is in the notch. Pure: times are seconds since start.
  var PICK_PINS = 3, PICK_LIMIT = 10, PICK_NOTCH = [0.42, 0.58], PICK_MISSES = 1;
  function newPick(rng) {
    var ph = []; for (var k = 0; k < PICK_PINS; k++) ph.push(rng());
    return { pin: 0, ph: ph, misses: 0, set: [], result: null };
  }
  // pin k height 0..1 at time t: a triangle wave, each pin a little faster than the last
  function pinPos(p, k, t) {
    var sp = 0.55 + k * 0.2, x = (t * sp + p.ph[k]) % 1;
    return x < 0.5 ? x * 2 : 2 - x * 2;
  }
  function pickTap(p, t) {
    if (p.result) return p.result;
    if (t > PICK_LIMIT) { p.result = 'fail'; return p.result; }
    var y = pinPos(p, p.pin, t);
    if (y >= PICK_NOTCH[0] && y <= PICK_NOTCH[1]) {
      p.set.push(p.pin); p.pin++;
      if (p.pin >= PICK_PINS) p.result = 'ok';
      return p.result || 'hit';
    }
    p.misses++;
    if (p.misses > PICK_MISSES) p.result = 'fail';
    return p.result || 'miss';
  }
  function pickTime(p, t) { if (!p.result && t > PICK_LIMIT) p.result = 'fail'; return p.result; }

  // ---------- save: called by decode() just before it returns ----------
  function decodeJunk(o, s) {
    var q = o.junk;
    if (!q || typeof q !== 'object' || Array.isArray(q)) return;
    var num = function (x) { return typeof x === 'number' && isFinite(x); };
    var cnt = function (x, max) { return num(x) ? Math.max(0, Math.min(max, Math.floor(x))) : 0; };
    var j = junkOf(s);
    if (q.n && typeof q.n === 'object') SCRAP_IDS.forEach(function (id) { var v = cnt(q.n[id], 9999); if (v) j.n[id] = v; });
    if (Array.isArray(q.letters)) q.letters.forEach(function (k) {
      if (num(k) && k >= 1 && k <= BOTTLE_LETTERS.length && k === Math.floor(k) && j.letters.indexOf(k) < 0) j.letters.push(k);
    });
    j.box = cnt(q.box, 999);
    if (q.seen && typeof q.seen === 'object') JUNK.forEach(function (d) { if (q.seen[d.id] === true) j.seen[d.id] = true; });
    j.total = cnt(q.total, 1e9);
  }

  expose({
    JUNK: JUNK, JUNK_CHANCE: JUNK_CHANCE, SCRAP_IDS: SCRAP_IDS, RECYCLE: RECYCLE, TREASURE_DECOS: TREASURE_DECOS,
    BOTTLE_LETTERS: BOTTLE_LETTERS, LETTER_DUP_COINS: LETTER_DUP_COINS,
    junkById: junkById, junkOf: junkOf, junkCount: junkCount, lettersFound: lettersFound, nextBottle: nextBottle,
    rollJunk: rollJunk, landJunk: landJunk, scrapValue: scrapValue, sellScrap: sellScrap,
    recycleById: recycleById, canRecycle: canRecycle, recycle: recycle, grantDeco: grantDeco, openChest: openChest,
    PICK_PINS: PICK_PINS, PICK_LIMIT: PICK_LIMIT, PICK_NOTCH: PICK_NOTCH, newPick: newPick, pinPos: pinPos, pickTap: pickTap, pickTime: pickTime,
    decodeJunk: decodeJunk
  });
