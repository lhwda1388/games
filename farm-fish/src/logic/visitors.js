  // ---------- visitors: who drops by, what a tap gives. They never take anything. ----------
  // slot: where it shows up. One visitor per slot at a time. 'pond' = farm/pond scene, 'yard' and 'sky' = 마당.
  // stay is in real seconds (stretched by actScale like crows, so ?speed keeps them on screen).
  var VISITORS = [
    { id: 'cat',          name: '고양이',     slot: 'yard', w: 3, stay: [120, 240] },
    { id: 'raccoon',      name: '너구리',     slot: 'yard', w: 2, stay: [90, 180] },
    { id: 'squirrel',     name: '다람쥐',     slot: 'yard', w: 3, stay: [60, 150], need: 'tree' },
    { id: 'sparrows',     name: '참새 떼',    slot: 'yard', w: 3, stay: [60, 120], need: 'birdhouse', notNight: true },
    { id: 'butterfly',    name: '나비',       slot: 'yard', w: 3, stay: [60, 120], need: 'flowers', day: true },
    { id: 'mailman',      name: '우편배달부', slot: 'yard', w: 2, stay: [60, 90],  need: 'mailbox', notNight: true },
    { id: 'merchant',     name: '떠돌이 상인', slot: 'yard', w: 1, stay: [600, 600], notNight: true },
    { id: 'fireflies',    name: '반딧불',     slot: 'sky',  w: 4, stay: [120, 240], night: true },
    { id: 'shootingstar', name: '별똥별',     slot: 'sky',  w: 2, stay: [25, 40],  night: true },
    { id: 'rainbow',      name: '무지개',     slot: 'sky',  w: 30, stay: [150, 240], rainbow: true },
    { id: 'duckfam',      name: '오리 가족',  slot: 'pond', w: 3, stay: [60, 120], notNight: true },
    { id: 'turtle',       name: '거북이',     slot: 'pond', w: 2, stay: [120, 240] },
    { id: 'frog',         name: '개구리',     slot: 'pond', w: 2, stay: [90, 180] }
  ];
  var VISIT_MIN = 90e3, VISIT_SPAN = 150e3, GIFT_MAX = 6, MAIL_MAX = 30;
  var PRANKS = ['장독 뚜껑을 전부 열어 놨다', '빨래집게를 한 줄로 세워 놨다', '허수아비 모자를 거꾸로 씌웠다', '마당에 발자국으로 동그라미를 그렸다'];
  // what the merchant may carry: a rare seed, a seed for later, merchant-only decorations, a bundle
  var WARES = [
    { id: 'gold',     name: '황금 수박 씨앗', cost: 5000 },
    { id: 'fert3',    name: '비료 3포대',     cost: 90 },
    { id: 'lanterns', name: '연등',           cost: 5000, deco: true },
    { id: 'chime',    name: '풍경',           cost: 6000, deco: true },
    { id: 'seed',     name: '다음 씨앗',      cost: 0 }
  ];
  var GENERIC_LETTERS = [
    '연못 물이 맑아졌다는 소문이 마을에 돌아요. 오늘은 큰 녀석이 물지도 몰라요.',
    '닭은 20분, 오리는 40분, 젖소는 60분마다 무언가를 남긴대요. 쌓이면 우리를 한 번 눌러 주세요.',
    '비가 그친 직후 하늘을 보세요. 마당 위에 줄무늬 다리가 걸린대요.',
    '밤이 되면 마당에 작은 불빛이 날아다녀요. 소원을 빌어 보세요.',
    '집을 키우면 바구니도 커지고 냄비도 늘어난대요. 목수가 기다리고 있어요.',
    '떠돌이 상인은 10분만 머물러요. 귀한 씨앗을 들고 다닌다던데요.'
  ];
  function visitorById(id) { for (var k = 0; k < VISITORS.length; k++) if (VISITORS[k].id === id) return VISITORS[k]; return null; }
  function wareById(id) { for (var k = 0; k < WARES.length; k++) if (WARES[k].id === id) return WARES[k]; return null; }
  function letterText(k) {
    if (typeof k !== 'string') return null;
    if (k.charAt(0) === 'g') return GENERIC_LETTERS[+k.slice(1)] || null;
    if (k.slice(0, 2) === 'a:') return aucLetter(k);   // stage 11 ②: 경매 결과
    var e = eggById(k.slice(2));
    return k.slice(0, 2) === 'e:' && e ? e.letter : null;
  }
  function decodeVisit(v) {
    var num = function (x) { return typeof x === 'number' && isFinite(x); };
    var d = visitorById(v.id);
    if (!d || !num(v.at) || !num(v.until) || !num(v.x) || !num(v.n)) return null;
    var out = { id: v.id, at: v.at, until: v.until, x: Math.max(0, Math.min(1, v.x)), n: Math.max(0, Math.floor(v.n)) };
    if (v.prank !== undefined) out.prank = PRANKS.indexOf(v.prank) >= 0 ? v.prank : PRANKS[0];
    if (Array.isArray(v.wares)) out.wares = v.wares.filter(function (w) { return w && wareById(w.id) && num(w.cost); })
      .slice(0, 3).map(function (w) { var o = { id: w.id, cost: Math.round(w.cost), sold: w.sold === true }; if (typeof w.seed === 'string' && CROPS[w.seed]) o.seed = w.seed; return o; });
    return out;
  }

  // ---------- who can come right now ----------
  function visitWeight(s, d, cx) {
    if (d.need && !decoPlaced(s, d.need)) return 0;     // stored decorations attract nobody
    if (d.slot === 'pond' && curSpot(s) !== 'pond') return 0;     // pond visitors only at the 연못
    if (d.night && cx.phase !== 'night') return 0;
    if (d.notNight && cx.phase === 'night') return 0;
    if (d.day && (cx.phase === 'night' || cx.weather !== 'clear')) return 0;
    if (d.rainbow && !cx.rainbow) return 0;
    var w = d.w;
    if (d.id === 'cat') { if (decoPlaced(s, 'bench')) w *= 2; if (s.bag.some(function (e) { return itemInfo(e.id).kind === 'fish'; })) w *= 1.5; }
    if (d.id === 'raccoon') { if (decoPlaced(s, 'jars')) w *= 2; if (cx.phase === 'evening' || cx.phase === 'night') w *= 2; }
    if (d.id === 'frog' && cx.weather === 'rain') w *= 4;
    if (d.id === 'fireflies' && decoPlaced(s, 'chime')) w *= 3;
    if (d.id === 'turtle' && cx.weather !== 'clear') w = 0;
    return w;
  }
  function visitContext(now, tzMin) {
    return { phase: gameClock(now, tzMin).phase, weather: weatherAt(now, tzMin), rainbow: rainJustStopped(now, tzMin) };
  }
  function rollVisitor(s, now, rng, tzMin) {
    var cx = visitContext(now, tzMin), busy = {}, pool = [], tot = 0;
    yardOf(s).vis.forEach(function (v) { busy[visitorById(v.id).slot] = true; });
    VISITORS.forEach(function (d) {
      if (busy[d.slot]) return;
      var w = visitWeight(s, d, cx);
      if (w > 0) { pool.push({ d: d, w: w }); tot += w; }
    });
    if (!pool.length) return null;
    var r = rng() * tot;
    for (var k = 0; k < pool.length; k++) { r -= pool[k].w; if (r < 0) return pool[k].d; }
    return pool[pool.length - 1].d;
  }
  function rollWares(s, rng) {
    var pool = WARES.filter(function (w) {
      if (w.deco) return !s.yard.deco[w.id];
      if (w.id === 'seed') return SEEDS.some(function (id) { return seedCost(s, id) !== null; });
      return true;
    });
    var out = [];
    while (out.length < 3 && pool.length) {
      var w = pool.splice(Math.floor(rng() * pool.length), 1)[0], o = { id: w.id, cost: w.cost, sold: false };
      if (w.id === 'seed') {
        var next = SEEDS.filter(function (id) { return seedCost(s, id) !== null; })[0];
        o.seed = next; o.cost = Math.round(seedCost(s, next) * 0.6);     // a locked seed at 40% off
      }
      if (w.deco) o.cost = byId(DECOS, w.id).cost;
      out.push(o);
    }
    return out;
  }
  function nextLetter(s, rng) {
    var y = s.yard, open = EGGS.filter(function (e) { return !y.eggs[e.id]; });
    var k = y.letterNext++ % 2 === 1 && open.length ? 'e:' + open[Math.floor(rng() * open.length)].id
      : 'g' + (Math.floor(y.letterNext / 2) % GENERIC_LETTERS.length);
    return k;
  }
  function spawnVisitor(s, d, now, rng, actScale) {
    var y = yardOf(s);
    var v = { id: d.id, at: now, until: now + (d.stay[0] + rng() * (d.stay[1] - d.stay[0])) * 1000 * (actScale || 1), x: rng(), n: 0 };
    if (d.id === 'raccoon') v.prank = PRANKS[Math.floor(rng() * PRANKS.length)];
    if (d.id === 'merchant') v.wares = rollWares(s, rng);
    if (d.id === 'mailman') {
      y.mail.push({ k: nextLetter(s, rng), at: now, c: 20 + Math.floor(rng() * 41), read: false });
      if (y.mail.length > MAIL_MAX) y.mail.shift();
    }
    y.met[d.id] = (y.met[d.id] || 0) + 1;
    y.vis.push(v);
    return v;
  }
  // arrivals and departures; time-based, but a long absence brings one visitor, not a crowd
  function tickVisitors(s, now, rng, tzMin, actScale) {
    var y = yardOf(s), ev = [], sc = actScale || 1;
    for (var k = y.vis.length - 1; k >= 0; k--) {
      var v = y.vis[k];
      if (now < v.until) continue;
      y.vis.splice(k, 1);
      var e = { type: 'leave', id: v.id };
      if (v.id === 'cat' && !v.n) { e.gift = catGift(s, rng); addGift(s, e.gift); }     // the cat leaves its gift on the step anyway
      ev.push(e);
    }
    if (!y.nextVisitAt || y.nextVisitAt > now + (VISIT_MIN + VISIT_SPAN) * sc * 2) y.nextVisitAt = now + 30e3 * sc;
    if (now >= y.nextVisitAt) {
      y.nextVisitAt = now + (VISIT_MIN + rng() * VISIT_SPAN) * sc * (dayIs(s, 'cats') ? DAY_VISIT_MUL : 1);   // stage 8: 고양이 잔치
      var d = rollVisitor(s, now, rng, tzMin);
      if (d) { spawnVisitor(s, d, now, rng, sc); ev.push({ type: 'arrive', id: d.id }); }
    }
    return ev;
  }
  function catGift(s, rng) {
    var fish = 0; s.bag.forEach(function (e) { if (itemInfo(e.id).kind === 'fish') fish++; });
    return { c: 15 + Math.min(45, fish * 5) + Math.floor(rng() * 11), f: rng() < 0.2 ? 1 : 0 };
  }
  function addGift(s, g) { var y = yardOf(s); if (y.gifts.length < GIFT_MAX) y.gifts.push(g); else y.gifts[GIFT_MAX - 1].c += g.c; }
  function collectGifts(s) {
    var y = yardOf(s), c = 0, f = 0;
    y.gifts.forEach(function (g) { c += g.c; f += g.f; });
    y.gifts = []; s.coins += c; s.items.fert += f;
    return { c: c, f: f };
  }
  // a hint for an egg not found yet, in this visitor's voice (or null when all are found)
  function hintLine(s, rng, key) {
    var open = EGGS.filter(function (e) { return !s.yard.eggs[e.id]; });
    return open.length ? open[Math.floor(rng() * open.length)][key] : null;
  }
  function wish(s, now, tzMin) {
    var y = s.yard, day = gameClock(now, tzMin).day;
    if (y.eg.wishDay !== day) { y.eg.wishDay = day; y.eg.wishes = 0; }
    y.eg.wishes++;
    return y.eg.wishes >= 3 ? findEgg(s, 'wish3', now) : null;
  }
  // returns { id, coins, text, items, egg, stays, sheet }; the visitor stays put when stays=true
  function tapVisitor(s, id, now, rng, tzMin) {
    var y = yardOf(s), k, v = null;
    for (k = 0; k < y.vis.length; k++) if (y.vis[k].id === id) { v = y.vis[k]; break; }
    if (!v) return null;
    var out = { id: id, coins: 0, text: '', items: [], egg: null, stays: false, sheet: null };
    v.n++;
    if (id === 'cat') {
      out.stays = true;
      if (v.n === 1) {
        var g = catGift(s, rng); s.coins += g.c; s.items.fert += g.f; out.coins = g.c;
        out.text = '고양이가 바구니 속 물고기를 한참 구경하더니 ' + (g.f ? '비료 한 포대와 ' : '') + '동전을 두고 간다';
      } else {
        out.text = v.n >= 5 ? '골골골… 고양이가 무릎에 눕는다' : (hintLine(s, rng, 'cat') || '고양이가 골골거린다');
        if (v.n >= 5) out.egg = findEgg(s, 'catpet', now);
      }
    } else if (id === 'raccoon') {
      out.coins = between(rng, 10, 30); out.text = '너구리가 ' + v.prank + ' · 도토리 값을 두고 도망갔다';
    } else if (id === 'squirrel') {
      out.coins = between(rng, 10, 25); out.text = '다람쥐가 숨겨 둔 동전을 하나 꺼내 준다';
    } else if (id === 'sparrows') {
      var sold = bagAdd(s, 'feather', PRODUCTS.feather.price);
      out.items.push('feather'); out.text = '참새들이 후드득 날아간 자리에 깃털 하나' + (sold ? ' · 바구니가 꽉 차 팔았다' : '');
    } else if (id === 'butterfly') {
      out.coins = between(rng, 10, 20); out.text = '나비가 꽃밭을 한 바퀴 돌고 간다';
    } else if (id === 'mailman') {
      out.text = '우편배달부: 편지 왔어요!'; out.sheet = 'mail';
    } else if (id === 'merchant') {
      out.stays = true; out.sheet = 'merchant';
      out.text = hintLine(s, rng, 'merch') || '상인: 좋은 물건 있어요. 천천히 보세요.';
    } else if (id === 'fireflies' || id === 'shootingstar') {
      out.coins = id === 'fireflies' ? between(rng, 20, 60) : between(rng, 80, 200);
      out.text = (id === 'fireflies' ? '반딧불에' : '별똥별에') + ' 소원을 빌었다';
      out.egg = wish(s, now, tzMin);
    } else if (id === 'rainbow') {
      out.coins = between(rng, 50, 120); out.text = '무지개 끝에서 동전 주머니를 찾았다';
    } else if (id === 'duckfam') {
      out.stays = true;
      if (v.n === 1) out.coins = between(rng, 5, 15);
      out.text = v.n >= 3 ? '꽥꽥꽥! 새끼 오리들이 줄 맞춰 인사한다' : '꽥! 오리 가족이 고개를 돌린다';
      if (v.n >= 3) out.egg = findEgg(s, 'duckparade', now);
    } else if (id === 'turtle') {
      out.stays = true;
      if (v.n === 1) { out.coins = between(rng, 20, 50); out.text = '거북이 등에 붙어 있던 동전을 떼어 냈다'; }
      else out.text = '거북이가 느릿느릿 고개를 끄덕인다';
    } else if (id === 'frog') {
      out.coins = between(rng, 5, 15); out.text = '개구리가 퐁당! 연잎 위에 동전이 남았다';
    }
    s.coins += id === 'cat' ? 0 : out.coins;
    if (!out.stays) y.vis.splice(k, 1);
    return out;
  }
  function merchantBuy(s, k) {
    var y = yardOf(s), v = null;
    y.vis.forEach(function (x) { if (x.id === 'merchant') v = x; });
    var w = v && v.wares && v.wares[k];
    if (!w || w.sold) return { ok: false, why: 'gone' };
    var def = wareById(w.id);
    if (def.deco) {
      var r = buyDeco(s, w.id, true, w.cost);
      if (!r.ok) return r;
    } else {
      if (s.coins < w.cost) return { ok: false, why: 'coins' };
      if (w.id === 'seed' && (!w.seed || seedUnlocked(s, w.seed))) return { ok: false, why: 'owned' };
      s.coins -= w.cost;
      if (w.id === 'gold') { s.seeds.gold++; s.dex.goldSeed = true; }
      else if (w.id === 'fert3') s.items.fert += 3;
      else s.seedOk[w.seed] = true;
    }
    w.sold = true;
    return { ok: true, name: w.id === 'seed' ? CROPS[w.seed].name + ' 씨앗' : def.name };
  }
  function readMail(s, i) {
    var m = yardOf(s).mail[i];
    if (!m) return null;
    var c = m.read ? 0 : m.c;
    m.read = true; s.coins += c;
    return { text: letterText(m.k), coins: c };
  }

  expose({
    VISITORS: VISITORS, WARES: WARES, PRANKS: PRANKS, VISIT_MIN: VISIT_MIN, VISIT_SPAN: VISIT_SPAN,
    visitorById: visitorById, wareById: wareById, letterText: letterText, visitContext: visitContext,
    rollVisitor: rollVisitor, spawnVisitor: spawnVisitor, tickVisitors: tickVisitors, tapVisitor: tapVisitor,
    collectGifts: collectGifts, merchantBuy: merchantBuy, readMail: readMail
  });
