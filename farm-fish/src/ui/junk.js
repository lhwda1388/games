  // ---------- 낚시 잡동사니 · 보물 상자 · 병 편지 (stage 5B): result card, 고물 sheet, 기록 letters ----------
  // 16×8 art in the fish card's frame, so junk reads as "not a fish" at a glance
  var JUNK_ART = {
    boot:   ['....4444........', '....4334........', '....4334........', '....4334........', '....43344444....', '....4333333344..', '....4444444444..', '................'],
    can:    ['................', '...44444444.....', '...42222224.....', '...40000004.....', '...43333334.....', '...40000004.....', '...44444444.....', '................'],
    bottle: ['......44........', '......44........', '.....4004.......', '....400004......', '....402204......', '....400004......', '....444444......', '................'],
    key:    ['................', '.444............', '4..4444444444...', '4..4....4.4.4...', '.444............', '................', '................', '................'],
    letter: ['......22........', '......44........', '.....4004.......', '....411114......', '....410014......', '....411114......', '....444444......', '................'],
    chest:  ['...4444444444...', '..433333333334..', '..444444444444..', '..433334433334..', '..433334433334..', '..433333333334..', '..444444444444..', '................']
  };
  function junkCanvas(id, unknown) {
    var c = document.createElement('canvas'); c.width = 16; c.height = 8;
    var rows = JUNK_ART[id];
    if (unknown) rows = rows.map(function (r) { return r.replace(/[0134]/g, '2'); });
    spr(rows, 0, 0, false, c.getContext('2d'));
    return c;
  }

  // ---------- the catch: called by doStrike right after a real hook ----------
  // returns true when the bite was junk (no reel: the line just comes up with it)
  function catchJunk(roll, f) {
    var id = L.rollJunk(roll, Math.random);
    if (!id) return false;
    var out = L.landJunk(S, id, Math.random);
    tmapAfter('junk'); if (id === 'letter') rumorAfter('letter');   // stage 8 ③
    burst(f.x, f.y, 8, 0, 50);
    floatText('+' + L.junkById(id).name, ROD_BASE.x, ROD_BASE.y - 16);
    showJunk(out);
    refresh();
    return true;
  }
  var junkFocus = null;   // what the sheet opens on: 'letter' n, or 'chest'
  function showJunk(out) {
    var d = L.junkById(out.id);
    resultEl.innerHTML = '';
    var cv2 = junkCanvas(out.id); cv2.className = 'jk'; resultEl.appendChild(cv2);
    var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = d.name;
    var sz = document.createElement('div'); sz.className = 'sz';
    if (out.id === 'letter') sz.textContent = out.reread ? '+' + out.coins + ' · 다시 읽기' : out.letter + '번째 편지 · 눌러서 읽기';
    else if (out.id === 'chest') sz.textContent = '눌러서 열기';
    else sz.textContent = '고물 · ' + d.scrap + '코인어치 · 눌러서 보기';
    resultEl.appendChild(nm); resultEl.appendChild(sz);
    if (out.first || out.complete) {
      var tg = document.createElement('div'); tg.className = 'tag';
      tg.textContent = out.complete ? '편지 12통 완성!' : '처음 건졌다';
      resultEl.appendChild(tg);
    }
    junkFocus = out.id === 'letter' ? { letter: out.letter } : out.id === 'chest' ? { chest: true } : null;
    resultEl.hidden = false;
    clearTimeout(showResult.t);
    showResult.t = setTimeout(hideResult, out.id === 'letter' || out.id === 'chest' ? 4500 : 2600);
  }
  // the junk card is the way in: tapping it opens the 고물 sheet (on the letter / chest it brought)
  resultEl.addEventListener('click', function () {
    if (!resultEl.querySelector('.jk')) return;
    hideResult(); openJunk();
  });

  // ---------- 고물 sheet (reuses the 마당 sheet frame) ----------
  function openJunk() {
    if (reel) return;
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true;
    sheetKind = 'junk'; sheetEl.hidden = false;
    renderJunk();
    sheetEl.scrollTop = 0;
  }
  function jBtn(row, text, fn, off, label) {
    var b = document.createElement('button'); b.type = 'button'; b.textContent = text;
    if (off) b.disabled = true;
    if (label) b.setAttribute('aria-label', label);
    b.addEventListener('click', fn);
    row.appendChild(b); return b;
  }
  function renderJunk() {
    sheetHead('고물 상자');
    var j = L.junkOf(S), f = junkFocus;
    junkFocus = null;
    if (f && f.letter) {
      var box = document.createElement('div'); box.className = 'letter new';
      var lt = document.createElement('div'); lt.className = 'lt'; lt.textContent = '병 편지 ' + f.letter + ' / ' + L.BOTTLE_LETTERS.length;
      var tx = document.createElement('p'); tx.textContent = L.BOTTLE_LETTERS[f.letter - 1];
      box.appendChild(lt); box.appendChild(tx); sheetEl.appendChild(box);
    }
    if (j.box > 0) {
      var h = document.createElement('h3'); h.textContent = '보물 상자';
      var hb = document.createElement('b'); hb.textContent = j.box + '개'; h.appendChild(hb); sheetEl.appendChild(h);
      var r = sheetRow(junkCanvas('chest'), '보물 상자', '그냥 열거나 · 자물쇠 도전(10초, 성공하면 더 좋은 것)');
      jBtn(r, '열기', function () { chestResult(L.openChest(S, Math.random, 0), false); });
      jBtn(r, '도전', function () { startPick(); }, false, '자물쇠 도전');
    }
    var h2 = document.createElement('h3'); h2.textContent = '고물';
    var b2 = document.createElement('b'); b2.textContent = L.scrapValue(S).toLocaleString('ko-KR') + '코인어치'; h2.appendChild(b2); sheetEl.appendChild(h2);
    L.SCRAP_IDS.forEach(function (id) {
      var d = L.junkById(id), n = L.junkCount(S, id), seen = !!j.seen[id];
      var ic = junkCanvas(id, !seen); if (!n) ic.style.opacity = '0.35';
      var row = sheetRow(ic, seen ? d.name + ' ×' + n : '???', seen ? d.desc + ' · 하나에 ' + d.scrap : '낚시하다 보면 건져요', n ? '' : 'idle');
      if (n) jBtn(row, '팔기', function () { var v = L.sellScrap(S, id); toast(d.name + ' 팔았다 · +' + v); refresh(); renderJunk(); }, false, d.name + ' 팔기');
    });
    var all = document.createElement('button'); all.type = 'button'; all.className = 'sellAll';
    all.textContent = '고물 다 팔기 · ' + L.scrapValue(S).toLocaleString('ko-KR'); all.disabled = !L.scrapValue(S);
    all.addEventListener('click', function () { var v = L.sellScrap(S); toast('고물을 팔았다 · +' + v); refresh(); renderJunk(); });
    sheetEl.appendChild(all);
    var h3 = document.createElement('h3'); h3.textContent = '재활용'; sheetEl.appendChild(h3);
    L.RECYCLE.forEach(function (rc) {
      var st = L.canRecycle(S, rc.id), need = Object.keys(rc.need).map(function (k) { return L.junkById(k).name + ' ' + L.junkCount(S, k) + '/' + rc.need[k]; }).join(' · ');
      var icon = rc.id === 'chest' ? junkCanvas('chest') : decoIcon(rc.id);
      var row = sheetRow(icon, rc.name, rc.id === 'chest' ? need + ' · 열쇠 두 개면 상자가 열린다' : need + ' · 마당 장식', st === 'ok' ? '' : 'idle');
      if (st === 'owned') { jBtn(row, '있음', function () {}, true); return; }
      jBtn(row, rc.id === 'chest' ? '열쇠 쓰기' : '만들기', function () {
        var res = L.recycle(S, rc.id);
        if (!res.ok) { toast('재료가 모자라요'); return; }
        if (res.box) toast('딸깍 · 보물 상자를 하나 찾았다', 2400);
        else toast(res.stored ? rc.name + ' 완성 · 보관함에 넣어 뒀어요' : rc.name + ' 완성 · 마당에 놓았다', 2600);
        refresh(); renderJunk();
      }, st !== 'ok');
    });
    var p = document.createElement('p'); p.className = 'note';
    p.textContent = '잡동사니는 도감에 안 들어가요 · 병 편지는 도감 › 기록에서 다시 읽을 수 있어요';
    sheetEl.appendChild(p);
  }
  function chestResult(res, challenged) {
    if (!res) return;
    var msg = res.kind === 'deco' ? josa(L.decoById(res.id).name, '이', '가') + ' 들어 있었다 · ' + (res.stored ? '보관함에' : '마당에 놓았다') + (res.coins ? ' · +' + res.coins : '')
      : res.kind === 'seed' ? '황금 수박 씨앗 ' + res.n + '개!' : '코인 +' + res.coins;
    toast((challenged ? '자물쇠가 풀렸다 · ' : '') + msg, 3200);
    refresh();
    if (sheetKind === 'junk') renderJunk();
  }

  // ---------- 병 편지 in the 도감 기록 tab ----------
  function renderBottleLetters() {
    var found = S.junk ? S.junk.letters : [];
    var h3 = document.createElement('h3'); h3.textContent = '병 편지';
    var b = document.createElement('b'); b.textContent = found.length + ' / ' + L.BOTTLE_LETTERS.length; h3.appendChild(b); dexEl.appendChild(h3);
    if (!found.length) {
      var q = document.createElement('p'); q.className = 'note'; q.textContent = '낚시하다 가끔 병이 걸려요 · 열두 통을 모으면 이야기 하나'; dexEl.appendChild(q);
    }
    L.BOTTLE_LETTERS.forEach(function (text, k) {
      if (found.indexOf(k + 1) < 0) return;
      var box = document.createElement('div'); box.className = 'letter';
      var lt = document.createElement('div'); lt.className = 'lt'; lt.textContent = (k + 1) + '번째 병';
      var tx = document.createElement('p'); tx.textContent = text;
      box.appendChild(lt); box.appendChild(tx); dexEl.appendChild(box);
    });
    var open = document.createElement('button'); open.type = 'button'; open.className = 'sellAll';
    open.textContent = '고물 상자 열기' + (S.junk && S.junk.box ? ' · 보물 ' + S.junk.box : '');
    open.addEventListener('click', openJunk);
    dexEl.appendChild(open);
  }

  // ---------- minigame overlay: 자물쇠 도전 (보물 상자) and 불 조절 도전 (냄비); one tap type ----------
  var miniEl = document.createElement('section');
  miniEl.className = 'overlay'; miniEl.id = 'mini'; miniEl.hidden = true; miniEl.setAttribute('aria-label', '도전');
  app.appendChild(miniEl);
  var miniCv = document.createElement('canvas'); miniCv.width = 90; miniCv.height = 56;
  var miniTitle = document.createElement('h2'), miniTip = document.createElement('p'), miniGive = document.createElement('button');
  miniTip.className = 'tip'; miniGive.type = 'button'; miniGive.textContent = '그만하고 그냥 받기';
  miniEl.appendChild(miniTitle); miniEl.appendChild(miniCv); miniEl.appendChild(miniTip); miniEl.appendChild(miniGive);
  var mini = null;   // { kind: 'pick'|'heat', g, t, done }
  function miniOn() { return !!mini; }
  function openMini(kind, g, title, tip) {
    mini = { kind: kind, g: g, t: 0, done: 0 };
    miniTitle.textContent = title; miniTip.textContent = tip;
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true; sheetEl.hidden = true;
    miniEl.hidden = false;
    drawMini();
  }
  function miniTap() {
    if (!mini || mini.done) return;
    if (mini.kind === 'pick') {
      var r = L.pickTap(mini.g, mini.t);
      if (r === 'hit') burstMini();
      if (r === 'miss') miniTip.textContent = '아깝다 · 한 번 더 놓치면 그냥 열려요';
      if (r === 'ok' || r === 'fail') endMini(r);
    } else L.heatTap(mini.g);
    drawMini();
  }
  var miniFlash = 0;
  function burstMini() { miniFlash = 0.25; }
  miniEl.addEventListener('pointerdown', function (e) {
    if (e.target === miniGive) return;
    e.preventDefault(); miniTap();
  });
  miniGive.addEventListener('click', function () { if (mini && !mini.done) endMini('fail'); });
  // driven by the frame loop (works in the PiP window too); paused behind the boss key
  function tickMini(dt) {
    if (!mini || boss) return;
    if (mini.done) { mini.done -= dt; if (mini.done <= 0) closeMini(); return; }
    mini.t += dt; miniFlash = Math.max(0, miniFlash - dt);
    var r = mini.kind === 'pick' ? L.pickTime(mini.g, mini.t) : L.heatStep(mini.g, dt);
    if (r) endMini(r);
    drawMini();
  }
  function endMini(r) {
    var m = mini;
    m.done = 0.9;
    miniTip.textContent = r === 'ok' ? '성공!' : '괜찮아요 · 평소대로 받아요';
    if (m.kind === 'pick') {
      var res = L.openChest(S, Math.random, r === 'ok' ? 1 : 0);
      chestResult(res, r === 'ok');
    } else finishHeat(r === 'ok');
    drawMini();
  }
  function closeMini() {
    var kind = mini && mini.kind;
    mini = null; miniEl.hidden = true;
    if (kind === 'pick') openJunk();
    else if (kind === 'heat') openBag('cook');
  }
  function drawMini() {
    var c2 = miniCv.getContext('2d'), saved = ctx; ctx = c2;
    try {
      px(0, 0, 90, 56, 0);
      if (mini.kind === 'pick') drawLockPick(mini.g, mini.t); else drawHeat(mini.g);
    } finally { ctx = saved; }
  }
  // three pins in a lock body; the notch band in the middle; set pins stay up
  function drawLockPick(g, t) {
    px(6, 4, 78, 48, 4); px(8, 6, 74, 44, 1);
    var top = 10, h = 36, n0 = top + h * (1 - L.PICK_NOTCH[1]), n1 = top + h * (1 - L.PICK_NOTCH[0]);
    px(8, n0, 74, n1 - n0, miniFlash > 0 ? 0 : 2);
    for (var k = 0; k < L.PICK_PINS; k++) {
      var x = 22 + k * 22, done = g.set.indexOf(k) >= 0, y = done ? (n0 + n1) / 2 : top + h * (1 - L.pinPos(g, k, t));
      px(x, top, 6, h, 3);
      px(x - 1, y - 3, 8, 6, k === g.pin && !g.result ? 4 : 3); px(x + 1, y - 1, 4, 2, done ? 0 : 2);
      if (k === g.pin && !g.result) { px(x + 2, top + h + 2, 2, 2, 4); }
    }
    var left = Math.max(0, 1 - t / L.PICK_LIMIT);
    px(8, 52, Math.round(74 * left), 2, 4);
  }
  // a pot over a fire: the heat gauge on the right with its sweet zone, the flame grows with the heat
  function drawHeat(g) {
    var gx = 70, gy = 6, gh = 44, z0 = gy + gh * (1 - L.HEAT_ZONE[1]), z1 = gy + gh * (1 - L.HEAT_ZONE[0]);
    px(gx, gy, 12, gh, 4); px(gx + 2, gy + 2, 8, gh - 4, 0);
    px(gx + 2, z0, 8, z1 - z0, 2);
    var hy = gy + gh * (1 - g.h);
    px(gx - 3, hy - 1, 18, 3, 4);
    // pot
    px(14, 10, 40, 4, 4); px(16, 14, 36, 16, 4); px(18, 16, 32, 12, 3);
    for (var w = 0; w < 3; w++) { var ph = (g.t * 0.8 + w * 0.33) % 1; px(24 + w * 9, 8 - Math.round(ph * 7), 2, 2, 2); }
    // flame under the pot: height follows heat, flickers
    var fh = Math.round(3 + g.h * 15);
    for (var k = 0; k < 6; k++) {
      var fx = 18 + k * 6, hh = Math.max(2, fh - (k % 3) * 2 + Math.round(Math.sin(g.t * 9 + k) * 1.5));
      px(fx, 50 - hh, 4, hh, 4); px(fx + 1, 51 - hh + 2, 2, Math.max(1, hh - 3), 2);
    }
    px(12, 50, 46, 3, 4);
    var p = Math.min(1, g.inZone / L.HEAT_NEED);
    px(4, 6, 4, gh, 4); px(5, 7, 2, gh - 2, 0); px(5, 7 + Math.round((gh - 2) * (1 - p)), 2, Math.round((gh - 2) * p), 3);
  }
  function startPick() {
    if (!S.junk || S.junk.box <= 0) return;
    openMini('pick', L.newPick(Math.random), '자물쇠 도전', '굵은 핀이 가운데 홈에 오면 탭 · 핀 세 개');
  }

  // console hooks for testing (attached by boot.js)
  function addJunkHooks(FF) {
    // FF.junk('chest') lands that junk now; FF.junk() opens the 고물 sheet
    FF.junk = function (id) {
      if (!id) { openJunk(); return S.junk; }
      var out = L.landJunk(S, id, Math.random); showJunk(out); refresh(); return out;
    };
    // FF.letter(n): mark letter n found (FF.letter('all') for every one) and open it
    FF.letter = function (n) {
      var j = L.junkOf(S);
      var list = n === 'all' ? L.BOTTLE_LETTERS.map(function (x, k) { return k + 1; }) : [n || 1];
      list.forEach(function (k) { if (j.letters.indexOf(k) < 0) j.letters.push(k); });
      junkFocus = { letter: list[list.length - 1] }; refresh(); openJunk(); return j.letters.slice();
    };
    FF.pick = function () { L.junkOf(S).box++; startPick(); return mini; };
    FF.junkRate = function () { return L.JUNK_CHANCE; };
  }
