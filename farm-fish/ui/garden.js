  // ---------- stage 10 ②: 꽃밭 (bed art + sheet), 새끼 (pen art + sheet + names), 허수아비 옷 (art + sheet), 상점/도감 rows, FF hooks ----------
  // Logic in logic/garden.js. Nothing here puts things in the basket (honey still comes through the hives).

  // ---------- 꽃 art: 5×5 heads, 'p' = petal, 'c' = centre; the pattern decides each petal's shade ----------
  var FLOWER_ART = {
    daisy:  ['.p.p.', 'pp.pp', '..c..', 'pp.pp', '.p.p.'],
    tulip:  ['p.p.p', 'ppppp', 'ppppp', '.ppp.', '.....'],
    bell:   ['..p..', '.ppp.', '.ppp.', 'ppppp', 'p.p.p'],
    cosmos: ['p...p', '.p.p.', '..c..', '.p.p.', 'p...p']
  };
  function petalShade(pat, rows, i, j) {
    if (pat === 'stripe') return j % 2 ? 4 : 2;
    if (pat === 'dot') return (i + j) % 3 === 0 ? 4 : 2;
    if (pat === 'rim') {
      var edge = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(function (d) { var r = rows[j + d[1]]; return !r || r[i + d[0]] !== 'p'; });
      return edge ? 4 : 1;
    }
    if (pat === 'double') return (i + j) % 2 ? 3 : 4;
    if (pat === 'night') return 4;
    return 2;   // plain: mid grey, so it reads on the light yard
  }
  // head top-left at (x, y); bud = a closed little knob
  function drawFlowerHead(id, x, y, bud) {
    var f = L.flowerById(id);
    if (!f) return;
    if (bud) { px(x + 2, y + 2, 1, 3, 3); px(x + 1, y + 1, 3, 2, 4); return; }
    var rows = FLOWER_ART[f.shape];
    for (var j = 0; j < 5; j++) for (var i = 0; i < 5; i++) {
      var ch = rows[j][i];
      if (ch === 'p') px(x + i, y + j, 1, 1, petalShade(f.pat, rows, i, j));
      else if (ch === 'c') px(x + i, y + j, 1, 1, f.pat === 'night' ? 0 : f.pat === 'plain' ? 4 : 0);
    }
  }
  function flowerIcon(id, unk) {
    var c = document.createElement('canvas'); c.width = 12; c.height = 12;
    var saved = ctx; ctx = c.getContext('2d');
    try {
      px(5, 6, 1, 6, 3); px(3, 9, 2, 1, 3);
      if (id) drawFlowerHead(id, 3, 1, false); else px(2, 10, 8, 2, 2);
    } finally { ctx = saved; }
    if (unk) c.style.opacity = '0.35';
    return c;
  }
  // the 꽃밭 decoration: planted flowers replace the old wildflower picture once anything is planted
  var drawOldFlowers = DRAW_DECO.flowers;
  DRAW_DECO.flowers = function (x, y, tt, night) {
    var g = S.garden;
    if (!g || !g.bed.some(Boolean)) { drawOldFlowers(x, y, tt, night); return; }
    var t = now();
    px(x, y + 12, 32, 4, 3);
    for (var k = 0; k < L.GARDEN_N; k++) {
      var c = k % L.GARDEN_COLS, r = Math.floor(k / L.GARDEN_COLS), fx = x + 2 + c * 8 + (r ? 2 : 0), fy = y + (r ? 6 : 0);
      px(fx + 1, y + 12 + r * 2, 3, 1, 2);   // planting hole
      var p = g.bed[k];
      if (!p) continue;
      var sw = Math.floor(tt * 1.1 + k) % 5 === 0 ? 1 : 0;
      px(fx + 2, fy + 4, 1, y + 12 + r * 2 - (fy + 4), 3);
      drawFlowerHead(p.id, fx + sw, fy, !L.flowerBloom(p, t));
    }
  };
  function gardenLine() {
    var g = S.garden, n = g ? g.bed.filter(Boolean).length : 0;
    return '꽃 ' + n + '/' + L.GARDEN_N + ' · 도감 ' + L.flowerDexCount(S) + '/' + L.FLOWERS.length;
  }

  // ---------- 꽃밭 sheet: pick a seed shape, plant in empty slots, pull (tap twice) ----------
  var gardenShape = 'daisy', pullAsk = null;
  function openGardenSheet() {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true;
    sheetKind = 'garden'; sheetEl.hidden = false; pullAsk = null;
    renderGardenSheet();
  }
  function renderGardenSheet() {
    var keep = sheetEl.scrollTop, t = now(), g = S.garden;
    sheetHead('꽃밭');
    var say = document.createElement('p'); say.className = 'say';
    say.textContent = L.gardenOk(S) ? '이웃한 꽃끼리 가끔 섞여 무늬 꽃이 돼요 · 피는 데 ' + (L.FLOWER_GROW / 3600e3) + '시간 · ' + gardenLine()
      : '꽃밭을 마당에 놓아야 꽃이 자라요 · 심어 둔 꽃은 그대로 있어요';
    sheetEl.appendChild(say);
    var tabs = document.createElement('div'); tabs.className = 'tabs'; tabs.setAttribute('role', 'group'); tabs.setAttribute('aria-label', '심을 꽃씨');
    L.FLOWER_SHAPES.forEach(function (sh) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = sh.name;
      b.setAttribute('aria-pressed', String(gardenShape === sh.id));
      b.addEventListener('click', function () { gardenShape = sh.id; renderGardenSheet(); });
      tabs.appendChild(b);
    });
    sheetEl.appendChild(tabs);
    for (var k = 0; k < L.GARDEN_N; k++) (function (k) {
      var p = g && g.bed[k], where = (k < L.GARDEN_COLS ? '뒷줄 ' : '앞줄 ') + (k % L.GARDEN_COLS + 1);
      var f = p && L.flowerById(p.id);
      var sub = !p ? '빈 자리 · 이웃이 피어 있으면 저절로 생기기도' : L.flowerBloom(p, t) ? '피었다' : fmtLeft(p.t + L.FLOWER_GROW - t) + ' 뒤 핀다';
      var r = sheetRow(flowerIcon(p ? p.id : null), (f ? f.name : '빈 자리') + ' · ' + where, sub);
      var b = document.createElement('button'); b.type = 'button';
      if (!p) {
        b.textContent = '심기 ' + L.FLOWER_SEED_COST; b.setAttribute('aria-label', where + '에 ' + L.flowerById(gardenShape + '_plain').name + ' 심기 ' + L.FLOWER_SEED_COST + '코인');
        if (S.coins < L.FLOWER_SEED_COST) b.classList.add('poor');
        b.addEventListener('click', function () {
          var res = L.plantFlower(S, k, gardenShape, now());
          if (!res.ok) { toast(res.why === 'bed' ? '꽃밭을 마당에 놓아야 심을 수 있어요' : WHY[res.why] || '심을 수 없어요'); return; }
          toast(L.flowerById(res.id).name + ' 꽃씨를 심었다', 1600); refresh(); renderGardenSheet();
        });
      } else {
        var asking = pullAsk && pullAsk.k === k && performance.now() < pullAsk.until;
        b.textContent = asking ? '정말 뽑기' : '뽑기'; b.setAttribute('aria-label', f.name + ' 뽑기');
        b.addEventListener('click', function () {
          if (!(pullAsk && pullAsk.k === k && performance.now() < pullAsk.until)) { pullAsk = { k: k, until: performance.now() + 3000 }; renderGardenSheet(); return; }
          pullAsk = null; L.pullFlower(S, k); toast('뽑았다 · 자리가 비었다', 1400); refresh(); renderGardenSheet();
        });
      }
      r.appendChild(b);
    })(k);
    var note = document.createElement('p'); note.className = 'note';
    note.textContent = '민무늬 둘 → 줄무늬·점박이 · 무늬끼리 → 테두리·겹꽃 · 아주 가끔 밤빛 · 무늬 꽃이 피면 벌통에 무늬꽃꿀';
    sheetEl.appendChild(note);
    sheetEl.scrollTop = keep;
  }

  // ---------- 새끼: pen art, sheet, names ----------
  var KID_AT = [[62, 158], [80, 162], [92, 150], [66, 172], [88, 174], [60, 146], [84, 138]];
  var CHICK = ['.44..', '40043', '.444.', '.4.4.'];
  function drawKid(kid, x, y, tt, grown, k) {
    var flip = Math.sin(tt * 0.6 + k) < 0, bob = Math.floor(tt * 2 + k) % 3 === 0 ? 1 : 0;
    if (kid.kind === 'hen') { if (grown) hen(x, y - 2, flip, Math.floor(tt * 1.7 + k) % 5 === 0); else spr(CHICK, x, y + 2 - bob, flip); }
    else if (kid.kind === 'duck') { if (grown) duck(x, y - 1, flip); else spr(DUCKLING, x, y + 2 - bob, flip); }
    else if (grown) cow(x, y - 6, tt + k, flip);
    else {   // calf: a small spotted body, big head
      px(x, y, 8, 5, 4); px(x + 1, y + 1, 6, 3, 0); px(x + 2, y + 1, 2, 2, 4);
      px(x + 1, y + 5, 1, 3, 4); px(x + 6, y + 5, 1, 3, 4);
      var hx = flip ? x - 3 : x + 7;
      px(hx, y - 2 + bob, 4, 4, 4); px(hx + 1, y - 1 + bob, 2, 2, 0);
    }
  }
  function kidSpot(k) { var a = KID_AT[k % KID_AT.length]; return [a[0], a[1]]; }
  function drawBrood(tt) {
    if (!S.brood) return;
    var t = now();
    S.brood.kids.forEach(function (kid, k) {
      var a = kidSpot(k), dx = Math.round(Math.sin(tt * 0.4 + k * 1.7) * 3);
      drawKid(kid, a[0] + dx, a[1], tt, L.kidGrown(kid, t), k);
    });
  }
  function tapBroodYard(x, y) {
    if (!S.brood) return false;
    for (var k = 0; k < S.brood.kids.length; k++) {
      var a = kidSpot(k);
      if (hit([a[0] - 4, a[1] - 7, 18, 16], x, y)) { openBroodSheet(); return true; }
    }
    return false;
  }
  function kidIcon(kid, grown) {
    var c = document.createElement('canvas'); c.width = 22; c.height = 16;
    var saved = ctx; ctx = c.getContext('2d');
    try { drawKid(kid, 3, 8, 0, grown, 0); } finally { ctx = saved; }
    c.style.width = '22px'; c.style.height = '16px';
    return c;
  }
  // '2일 5시간' / '3시간 10분' / fmtLeft under an hour
  function growLeft(ms) {
    var h = Math.floor(ms / 3600e3), d = Math.floor(h / 24);
    if (d) return d + '일 ' + (h % 24) + '시간';
    if (h) return h + '시간 ' + Math.floor(ms % 3600e3 / 60e3) + '분';
    return fmtLeft(Math.max(0, ms));
  }
  function openBroodSheet() {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true;
    sheetKind = 'brood'; sheetEl.hidden = false;
    renderBroodSheet();
  }
  function careLine() {
    var b = L.broodOf(S);
    return L.ANIMAL_IDS.filter(function (id) { return S.animals[id] > 0; }).map(function (id) {
      return L.ANIMALS[id].name + ' ' + Math.min(b.care[id], L.BABY_CARE) + '/' + L.BABY_CARE + (L.babyRoom(S, id) > 0 ? '' : ' (다 낳음)');
    }).join(' · ');
  }
  function renderBroodSheet() {
    var t = now();
    sheetHead('새끼');
    var say = document.createElement('p'); say.className = 'say';
    say.textContent = '친밀도 · ' + careLine();
    sheetEl.appendChild(say);
    S.brood.kids.forEach(function (kid, k) {
      var grown = L.kidGrown(kid, t), bk = L.BABY_KIND[kid.kind];
      var r = sheetRow(kidIcon(kid, grown), kid.name, grown ? L.ANIMALS[kid.kind].name + ' · 다 자라서 ' + josa(L.ANIMALS[kid.kind].makes, '을', '를') + ' 낸다'
        : bk.name + ' · 자라는 중 · ' + growLeft(kid.born + L.BABY_GROW - t) + ' 남음');
      var b = document.createElement('button'); b.type = 'button'; b.textContent = '이름'; b.setAttribute('aria-label', kid.name + ' 이름 바꾸기');
      b.addEventListener('click', function () { openKidName(k); });
      r.appendChild(b);
    });
    var note = document.createElement('p'); note.className = 'note';
    note.textContent = '알·우유를 거둘수록 친밀도 · ' + L.BABY_CARE + '이 차면 가끔 새끼 (한 마리당 ' + L.BABY_PER_HEAD + ') · ' + (L.BABY_GROW / 86400e3) + '일이면 다 자란다';
    sheetEl.appendChild(note);
  }
  // typed text is cleaned in logic (pet name rules) and shown with textContent only
  function openKidName(k) {
    var kid = S.brood && S.brood.kids[k];
    if (!kid) return;
    sheetKind = 'kidName'; sheetEl.hidden = false;
    sheetHead('이름 짓기');
    var say = document.createElement('p'); say.className = 'say';
    say.textContent = L.BABY_KIND[kid.kind].name + '의 이름은?';
    sheetEl.appendChild(say);
    var row = document.createElement('div'); row.className = 'shareRow';
    row.appendChild(kidIcon(kid, L.kidGrown(kid, now())));
    var inp = document.createElement('input'); inp.type = 'text'; inp.className = 'field'; inp.maxLength = L.PET_NAME_MAX;
    inp.value = kid.name; inp.setAttribute('aria-label', '이름 (' + L.PET_NAME_MAX + '글자까지)'); inp.autocomplete = 'off';
    var b = document.createElement('button'); b.type = 'button'; b.textContent = '짓기';
    row.appendChild(inp); row.appendChild(b); sheetEl.appendChild(row);
    var hint = document.createElement('p'); hint.className = 'note';
    hint.textContent = '한글·영문·숫자 ' + L.PET_NAME_MAX + '글자까지';
    sheetEl.appendChild(hint);
    function submit() {
      var n = L.renameKid(S, k, inp.value);
      if (!n) { toast('쓸 수 있는 글자로 지어 주세요'); return; }
      toast('이제 「' + n + '」', 2000); refresh(); openBroodSheet();
    }
    b.addEventListener('click', submit);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    setTimeout(function () { try { inp.focus(); inp.select(); } catch (er) { /* focus may be refused */ } }, 0);
  }

  // ---------- 허수아비 옷: drawn over SP.scarecrow (9×15, top-left x, y); flip mirrors it like the sprite ----------
  function drawScareWear(x, y, flip, only) {
    var w = only || L.scareLook(S);
    function P(dx, dy, ww, h, c) { px(flip ? x + 9 - dx - ww : x + dx, y + dy, ww, h, c); }
    var k;
    switch (w.cloth) {
      case 'sc_check': P(0, 6, 9, 1, 4); for (k = 0; k < 20; k++) P(2 + k % 5, 7 + Math.floor(k / 5), 1, 1, (k + Math.floor(k / 5)) % 2 ? 4 : 0); break;
      case 'sc_overall': P(2, 8, 5, 3, 3); P(3, 6, 1, 2, 3); P(5, 6, 1, 2, 3); break;
      case 'sc_rain': P(0, 6, 9, 1, 2); P(1, 7, 7, 5, 2); P(4, 7, 1, 5, 4); break;
      case 'sc_hanbok': P(2, 6, 5, 2, 0); P(3, 6, 1, 2, 4); P(5, 7, 2, 1, 4); P(0, 6, 2, 1, 4); P(7, 6, 2, 1, 4); P(2, 8, 5, 3, 3); break;
    }
    switch (w.hat) {
      case 'sc_straw': P(2, 0, 5, 2, 1); P(2, 1, 5, 1, 4); P(0, 2, 9, 1, 1); break;
      case 'sc_beanie': P(2, 0, 5, 3, 4); P(2, 2, 5, 1, 2); P(4, -1, 1, 1, 4); break;
      case 'sc_bow': P(5, 0, 1, 1, 4); P(6, -1, 2, 3, 4); P(6, 0, 1, 1, 0); break;
      case 'sc_crown': for (k = 0; k < 4; k++) { P(1 + k * 2, 1, 1, 1, 0); P(2 + k * 2, 1, 1, 1, 4); } P(4, 0, 1, 1, 0); break;
      case 'sc_bucket': P(2, -2, 5, 5, 3); P(2, -2, 5, 1, 4); P(1, 2, 7, 1, 4); break;
    }
    switch (w.prop) {
      case 'sc_shovel': P(9, 2, 1, 8, 3); P(8, 10, 3, 3, 4); break;
      case 'sc_flag': P(9, -3, 1, 10, 4); P(10, -3, 4, 3, 2); P(10, -2, 2, 1, 0); break;
      case 'sc_umbrella': P(9, -2, 1, 9, 4); P(6, -3, 7, 1, 4); P(7, -4, 5, 1, 4); break;
      case 'sc_fan': P(9, 3, 1, 4, 4); P(8, 0, 4, 3, 0); P(8, 0, 4, 1, 4); P(9, 1, 1, 2, 4); break;
    }
  }
  function scareIcon(id) {
    var c = document.createElement('canvas'); c.width = 16; c.height = 20;
    var saved = ctx; ctx = c.getContext('2d');
    var it = L.scareItemById(id), only = { hat: null, cloth: null, prop: null };
    if (it) only[it.slot] = id;
    try { spr(SP.scarecrow, 2, 4); drawScareWear(2, 4, false, only); } finally { ctx = saved; }
    c.style.width = '16px'; c.style.height = '20px';
    return c;
  }
  function openScareSheet() {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true;
    sheetKind = 'scare'; sheetEl.hidden = false;
    renderScareSheet();
  }
  function renderScareSheet() {
    var keep = sheetEl.scrollTop, fest = curEnv(now()).festival, look = L.scareLook(S);
    sheetHead('허수아비 꾸미기');
    var worn = L.SCARE_SLOTS.map(function (sl) { return look[sl] && L.scareItemById(look[sl]).name; }).filter(Boolean);
    var say = document.createElement('p'); say.className = 'say';
    say.textContent = (worn.length ? worn.join(' · ') : '아무것도 안 입었다') + ' · 쫓는 힘은 그대로';
    sheetEl.appendChild(say);
    [['hat', '모자'], ['cloth', '옷'], ['prop', '소품']].forEach(function (sl) {
      var h3 = document.createElement('h3'); h3.textContent = sl[1]; sheetEl.appendChild(h3);
      L.SCARE_ITEMS.filter(function (it) { return it.slot === sl[0]; }).forEach(function (it) {
        var st = L.scareItemStatus(S, it.id, fest), on = look[it.slot] === it.id;
        var sub = it.fest ? L.FESTIVALS[it.fest].name + ' 날에만 받는 것' + (st === 'ok' ? ' · 오늘!' : '') : st === 'owned' ? '가지고 있다' : it.cost + '코인';
        var r = sheetRow(scareIcon(it.id), it.name, sub, st === 'fest' ? 'idle' : '');
        var b = document.createElement('button'); b.type = 'button';
        if (st === 'owned') { b.textContent = on ? '벗기' : '입기'; b.setAttribute('aria-pressed', String(on)); }
        else if (st === 'fest') { b.textContent = '축제 날'; b.disabled = true; b.className = 'max'; }
        else { b.textContent = it.fest ? '받기' : it.cost.toLocaleString('ko-KR'); if (st === 'coins') b.classList.add('poor'); }
        b.setAttribute('aria-label', it.name + ' ' + b.textContent);
        b.addEventListener('click', function () {
          if (st === 'owned') { L.wearScare(S, it.id); scareWob = 0.35; refresh(); renderScareSheet(); return; }
          var res = L.getScareItem(S, it.id, curEnv(now()).festival);
          if (!res.ok) { toast(WHY[res.why] || '아직 받을 수 없어요'); return; }
          L.wearScare(S, it.id);
          toast(josa(it.name, '을', '를') + ' 입혔다', 1800); refresh(); renderScareSheet();
        });
        r.appendChild(b);
      });
    });
    sheetEl.scrollTop = keep;
  }
  // 상점: one row under the tools once there is a scarecrow
  function renderScareShop() {
    if (L.tier(S, 'scare') < 1) return;
    var h3 = document.createElement('h3'); h3.textContent = '허수아비 꾸미기';
    var hb = document.createElement('b'); hb.textContent = Object.keys((S.scare && S.scare.got) || {}).length + ' / ' + L.SCARE_ITEMS.length; h3.appendChild(hb);
    shopEl.appendChild(h3);
    shopRow(scareIcon(null), '모자·옷·소품', '밭의 허수아비에 입히기 · 축제 날에만 받는 것도 · 쫓는 힘은 그대로', '꾸미기',
      function () { openScareSheet(); return { ok: true }; }, { aria: '허수아비 꾸미기' });
  }

  // ---------- 도감: 꽃 ----------
  function renderGardenDex(row) {
    dexHead('꽃', L.flowerDexCount(S), L.FLOWERS.length, S.garden ? '' : '마당에 꽃밭을 놓고 누르면 꽃씨를 심을 수 있어요');
    L.FLOWERS.forEach(function (f) {
      var got = !!(S.garden && S.garden.dex[f.id]), ic = flowerIcon(f.id); ic.className = 'sq';
      row(ic, got ? (f.pat === 'night' ? '★ ' : '') + f.name : '???', got ? (f.pat === 'plain' ? '꽃씨로 심는 꽃' : '교배로 핀 꽃') : f.hint, '', !got);
    });
  }

  // ---------- tick: crossing and babies (offline catch-up happens on the first tick) ----------
  var gardenRedraw = 0;
  function tickGardenUI(t) {
    if ((sheetKind === 'garden' || sheetKind === 'brood' || sheetKind === 'kidName') && view !== 'yard') closeSheet();
    var born = L.gardenTick(S, t, Math.random);
    if (born.length) {
      var e = born[born.length - 1], nm = L.flowerById(e.id).name;
      if (booted) toast(e.first ? '★ 꽃밭에 처음 보는 꽃봉오리 · ' + nm + ' · 도감에' : '꽃밭에 새 봉오리 · ' + nm + (born.length > 1 ? ' 외 ' + (born.length - 1) : ''), 3200);
      save();
    }
    L.broodTick(S, t, Math.random).forEach(function (kid) {
      if (booted) toast('★ ' + josa(L.ANIMALS[kid.kind].name, '이', '가') + ' ' + josa(L.BABY_KIND[kid.kind].name, '을', '를') + ' 낳았다! · 마당 우리에서 눌러 이름 짓기', 4200);
      save();
    });
    if (sheetKind === 'garden' && !sheetEl.hidden && quiet() && t - gardenRedraw > 10e3) { gardenRedraw = t; renderGardenSheet(); }
  }

  // ---------- console hooks ----------
  function addGardenHooks(FF) {
    // FF.garden() places the 꽃밭 and plants every empty slot in bloom; FF.garden('cross') forces cross checks now
    FF.garden = function (cmd) {
      var t = now();
      if (!L.gardenOk(S)) {
        L.yardOf(S);
        if (!S.yard.deco.flowers) { S.coins += L.decoById('flowers').cost; L.buyDeco(S, 'flowers'); }
        if (!L.gardenOk(S)) L.placeItem(S, 'deco', 'flowers');
      }
      if (cmd === 'cross') { L.gardenOf(S).next = t - L.CROSS_EVERY * 4; L.gardenTick(S, t, function () { return 0.01; }); }
      else for (var k = 0; k < L.GARDEN_N; k++) { S.coins += L.FLOWER_SEED_COST; L.plantFlower(S, k, L.FLOWER_SHAPES[k % L.FLOWER_SHAPES.length].id, t - L.FLOWER_GROW); }
      refresh(); return S.garden.bed.map(function (p) { return p && p.id; });
    };
    // FF.baby(kind) brings a baby now (buys the parent if needed); FF.baby('grow') grows every baby up
    FF.baby = function (kind) {
      var t = now();
      if (kind === 'grow') { if (S.brood) S.brood.kids.forEach(function (k) { k.born = Math.min(k.born, t - L.BABY_GROW); }); refresh(); return S.brood; }
      kind = L.ANIMALS[kind] ? kind : 'hen';
      L.yardOf(S); if (!S.animals[kind]) { S.yard.house = Math.max(S.yard.house, L.ANIMALS[kind].house); S.coins += L.animalCost(S, kind); L.buyAnimal(S, kind, t); }
      var b = L.broodOf(S); b.care[kind] = L.BABY_CARE; b.next[kind] = 0;
      L.broodTick(S, t, function () { return 0; }); refresh(); return S.brood;
    };
    // FF.scare() gives a scarecrow and every outfit
    FF.scare = function () {
      if (L.tier(S, 'scare') < 1) S.up.scare = 1;
      L.SCARE_ITEMS.forEach(function (it) { S.coins += it.cost; L.getScareItem(S, it.id, it.fest || null); });
      refresh(); return S.scare;
    };
  }
