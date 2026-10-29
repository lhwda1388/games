  // ---------- 곤충 채집 (stage 6A): insects flying over 밭·마당·숲·과수원, catch card, 표본 상자, dex/calendar/shop rows, FF hooks ----------
  // One insect at a time on screen. Times are performance.now() ms (like the 도전 gauge), so ?speed never changes the feel.
  var BUG_KIND = {
    cabbagewhite: 'fly', sulphur: 'fly', swallowtail: 'fly', moth: 'fly', wintermoth: 'fly',
    dragonfly: 'drag', emperor: 'drag', damselfly: 'drag', redragonfly: 'drag', mayfly: 'drag', stonefly: 'drag',
    honeybee: 'bee', firefly: 'bee', ant: 'ant', springtail: 'ant', cicada: 'cicada', eveningcicada: 'cicada',
    grasshopper: 'hop', katydid: 'hop', cricket: 'hop', mantis: 'hop',
    ladybug: 'beetle', stagbeetle: 'beetle', rhinobeetle: 'beetle', chafer: 'beetle', longhorn: 'beetle', jewelbeetle: 'beetle', divingbeetle: 'beetle'
  };
  // wing/body shades per insect: [body, wing]
  var BUG_C = { cabbagewhite: [4, 0], sulphur: [4, 1], swallowtail: [4, 2], moth: [3, 2], wintermoth: [3, 1], redragonfly: [3, 0], emperor: [4, 1],
    ladybug: [4, 2], jewelbeetle: [4, 1], chafer: [3, 3], firefly: [4, 0] };
  function bugArt(id, x, y, sit, tt) {
    var k = BUG_KIND[id] || 'beetle', c = BUG_C[id] || [4, 1], flap = !sit && Math.floor(tt * 14) % 2;
    x = Math.round(x); y = Math.round(y);
    if (k === 'fly') {
      if (sit) { px(x, y - 5, 1, 5, c[0]); px(x - 2, y - 6, 2, 4, 4); px(x + 1, y - 6, 2, 4, 4); px(x - 1, y - 5, 1, 2, c[1]); px(x + 1, y - 5, 1, 2, c[1]); }
      else { px(x, y - 3, 1, 4, c[0]); var wy = flap ? -5 : -2; px(x - 4, y + wy, 4, 3, 4); px(x + 1, y + wy, 4, 3, 4); px(x - 3, y + wy + 1, 2, 1, c[1]); px(x + 2, y + wy + 1, 2, 1, c[1]); }
      px(x - 1, y - 7, 1, 1, 4); px(x + 1, y - 7, 1, 1, 4);
    } else if (k === 'drag') {
      px(x - 5, y - 2, 10, 1, c[0]); px(x + 4, y - 3, 2, 3, 4);
      var dw = sit ? 0 : flap ? -2 : 1;
      px(x - 1, y - 5 + dw, 6, 2, 2); px(x - 1, y + 1 - dw, 6, 2, 2); px(x, y - 4 + dw, 4, 1, 1);
    } else if (k === 'bee') {
      px(x - 2, y - 3, 5, 3, 4); px(x - 1, y - 3, 1, 3, id === 'firefly' ? 4 : 2); px(x + 1, y - 3, 1, 3, id === 'firefly' ? 4 : 2);
      if (!sit) { px(x - 2, y - 6 + (flap ? 0 : 1), 2, 2, 1); px(x + 1, y - 6 + (flap ? 0 : 1), 2, 2, 1); }
      if (id === 'firefly' && Math.floor(tt * 3) % 3) { px(x - 3, y - 1, 2, 2, 0); px(x - 4, y - 2, 1, 1, 1); }
    } else if (k === 'ant') {
      var a = id === 'springtail' ? 3 : 4;
      px(x - 3, y - 2, 2, 2, a); px(x, y - 2, 1, 1, a); px(x + 1, y - 2, 2, 2, a); px(x - 2, y, 1, 1, a); px(x + 1, y, 1, 1, a);
      if (!sit) px(x - 1, y - 4, 1, 1, a);
    } else if (k === 'cicada') {
      px(x - 2, y - 7, 4, 7, 4); px(x - 3, y - 6, 1, 6, 2); px(x + 2, y - 6, 1, 6, 2); px(x - 1, y - 8, 2, 1, 4);
      if (!sit && flap) { px(x - 6, y - 6, 3, 4, 1); px(x + 3, y - 6, 3, 4, 1); }
    } else if (k === 'hop') {
      px(x - 4, y - 3, 8, 2, id === 'cricket' ? 4 : 3); px(x + 3, y - 4, 2, 2, 4); px(x - 3, y - 1, 1, 2, 4); px(x - 1, y - 5, 4, 1, 4); px(x - 2, y - 6, 1, 2, 4);
      if (id === 'mantis') { px(x + 4, y - 7, 1, 4, 4); px(x + 5, y - 7, 2, 1, 4); }
      if (!sit && flap) px(x - 3, y - 6, 4, 2, 1);
    } else {
      var big = id === 'stagbeetle' || id === 'rhinobeetle';
      px(x - 3, y - 5, 6, 5, c[0]); px(x - 2, y - 6, 4, 1, c[0]); px(x, y - 5, 1, 5, c[1] === 4 ? 2 : c[1]);
      if (id === 'ladybug') { px(x - 2, y - 4, 1, 1, 0); px(x + 2, y - 2, 1, 1, 0); px(x - 2, y - 2, 1, 1, 0); }
      if (id === 'jewelbeetle') { px(x - 2, y - 4, 1, 3, 1); px(x + 2, y - 4, 1, 3, 2); }
      if (big) { px(x - 2, y - 8, 1, 2, 4); px(x + 1, y - 8, 1, 2, 4); px(x - 3, y - 9, 1, 1, 4); px(x + 2, y - 9, 1, 1, 4); }
      if (id === 'longhorn') { px(x - 4, y - 9, 1, 3, 4); px(x + 3, y - 9, 1, 3, 4); px(x - 5, y - 10, 1, 1, 4); px(x + 4, y - 10, 1, 1, 4); }
      px(x - 4, y - 1, 1, 1, 4); px(x + 3, y - 1, 1, 1, 4);
      if (!sit && flap) { px(x - 6, y - 6, 3, 3, 1); px(x + 3, y - 6, 3, 3, 1); }
    }
  }
  function bugCanvas(id, w, h, unknown) {
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var saved = ctx; ctx = c.getContext('2d');
    try { bugArt(id, Math.floor(w / 2), h - 1, true, 0); } finally { ctx = saved; }
    if (unknown) { var g = c.getContext('2d'); g.globalCompositeOperation = 'source-in'; g.fillStyle = G[2]; g.fillRect(0, 0, w, h); }
    return c;
  }

  // ---------- the one insect on screen ----------
  var bug = null, bugNextAt = performance.now() + 8e3, bugMissTips = 0, bugNetTips = 0, bugPend = null;
  var BUG_VIEWS = { farm: true, yard: true, forest: true, orchard: true };
  function bugPlaceOk(v) { return BUG_VIEWS[v] && (v !== 'forest' || L.forestOk(S)) && (v !== 'orchard' || L.orchardOk(S)); }
  function tickBugsUI() {
    var p = performance.now();
    if (bugPend && resultEl.hidden) bugDecide(bugPend.def);   // the card went away without a choice
    if (bug && (bug.place !== view || (bug.flee ? p > bug.flee.t + 900 : p > bug.fl.end))) { bug = null; bugNextAt = p + 20e3 + Math.random() * 40e3; }
    if (bug || p < bugNextAt || !bugPlaceOk(view) || reel) return;
    var id = L.rollBug(view, curEnv(now()), Math.random, S);
    bugNextAt = p + (15e3 + Math.random() * 20e3) * (L.dayIs(S, 'bugs') ? L.DAY_BUG_MUL : 1);   // stage 8: 곤충 잔치
    if (!id) return;
    bug = { id: id, place: view, fl: L.bugFlight(id, p + 200, Math.random) };
  }
  function bugNowPos(p) {
    if (bug.flee) { var u = (p - bug.flee.t) / 900; return { x: bug.flee.x + u * 120 * bug.flee.dx, y: bug.flee.y - u * 90, sit: false }; }
    return L.bugPos(bug.fl, p);
  }
  function drawBugs(tt) {
    if (!bug || bug.place !== view) return;
    var q = bugNowPos(performance.now());
    if (!q) return;
    if (q.sit) px(q.x - 3, q.y + 1, 7, 1, 2);
    bugArt(bug.id, q.x, q.y, q.sit, tt);
  }
  // first look at a tap: a hit on the insect is a catch try (true = the tap is used)
  function tapBug(x, y) {
    if (!bug || bug.flee || bug.place !== view) return false;
    var p = performance.now(), q = L.bugPos(bug.fl, p);
    if (!q || Math.hypot(q.x - x, q.y - 4 - y) > (q.sit ? L.BUG_HIT : 10)) return false;
    if (!L.netOk(S)) {
      if (bugNetTips++ < 3 || q.sit) toast(L.bugById(bug.id).rarity === '흔함' ? '곤충이다 · 상점에서 잠자리채를 사면 잡을 수 있어요' : '처음 보는 곤충 · 잠자리채가 있으면…', 2400);
      return true;
    }
    if (L.bugJudge(bug.fl, p) !== 'catch') {
      bug.flee = { x: q.x, y: q.y, t: p, dx: q.x < 90 ? -1 : 1 };
      if (bugMissTips++ < 3) toast('휙 날아갔다 · 앉아서 날개를 접었을 때 눌러요', 2200);
      return true;
    }
    var id = bug.id, c = L.catchBug(S, id);
    bug = null; bugNextAt = p + 20e3 + Math.random() * 30e3;
    burst(q.x, q.y - 3, 10, 0, 40);
    showBugCard(id, c);
    refresh();
    return true;
  }
  // the catch card: 놓아주기 (coins) or 표본 상자. No choice = a new kind goes in the box, a repeat is let go.
  function showBugCard(id, c) {
    var b = L.bugById(id);
    resultEl.innerHTML = '';
    var cv2 = bugCanvas(id, 20, 10); resultEl.appendChild(cv2);
    var nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = (b.rarity === '희귀' || b.rarity === '전설' ? '★ ' : '') + b.name;
    var sz = document.createElement('div'); sz.className = 'sz'; sz.textContent = b.rarity + ' · 잡았다!';
    resultEl.appendChild(nm); resultEl.appendChild(sz);
    if (c.first) { var tg = document.createElement('div'); tg.className = 'tag'; tg.textContent = '곤충 도감 등록!'; resultEl.appendChild(tg); }
    var row = document.createElement('div'); row.className = 'bugAct';
    var rel = document.createElement('button'); rel.type = 'button'; rel.textContent = '놓아주기 +' + b.price;
    rel.addEventListener('click', function () { bugDecide('release'); });
    row.appendChild(rel);
    if (!c.boxed) {
      var keep = document.createElement('button'); keep.type = 'button'; keep.textContent = '표본 상자';
      keep.addEventListener('click', function () { bugDecide('keep'); });
      row.appendChild(keep);
    }
    resultEl.appendChild(row);
    bugPend = { id: id, def: c.boxed ? 'release' : 'keep' };
    resultEl.hidden = false;
    clearTimeout(showResult.t);
    showResult.t = setTimeout(hideResult, 6000);
  }
  function bugDecide(choice) {
    var pd = bugPend;
    if (!pd) return;
    bugPend = null; hideResult();
    var b = L.bugById(pd.id);
    if (choice === 'keep') {
      var k = L.keepBug(S, pd.id);
      if (k.ok) toast(b.name + ' · 표본 상자에 넣었다' + (k.gift ? ' · 집 안에 표본 상자가 생겼다' : ''), 2800);
      else choice = 'release';
    }
    if (choice === 'release') { var got = L.releaseBug(S, pd.id); floatText('+' + got, 90, 90); toast(josa(b.name, '을', '를') + ' 놓아주었다 · 고맙다며 +' + got, 2200); }
    refresh();
  }

  // ---------- 표본 상자 in the house (furniture 'bugbox', 20×14) ----------
  DRAW_FURN.bugbox = function (x, y) {
    px(x, y, 20, 14, 4); px(x + 1, y + 1, 18, 12, 1); px(x + 1, y + 1, 18, 1, 0);
    var list = L.boxList(S);
    for (var k = 0; k < 8; k++) {
      var cx = x + 3 + (k % 4) * 4, cy = y + 4 + Math.floor(k / 4) * 5;
      if (k < list.length) { px(cx, cy, 2, 3, 4); px(cx - 1, cy, 1, 2, (k % 3) + 2); px(cx + 2, cy, 1, 2, (k % 3) + 2); }
      else px(cx, cy + 1, 1, 1, 2);
    }
  };

  // ---------- 도감: 과일 · 꿀 · 곤충 ----------
  function bugCond(b) {
    var out = [b.at.map(function (p) { return L.BUG_PLACES[p]; }).join('·')];
    if (b.season) out.push(b.season.map(function (x) { return L.SEASON_NAME[x]; }).join('·'));
    if (b.phase) out.push(b.phase.map(function (x) { return L.PHASE_NAME[x]; }).join('·'));
    if (b.wx) out.push(b.wx === 'dry' ? '비·눈 없는 날' : b.wx === 'clear' ? '맑은 날' : L.WEATHER_NAME[b.wx] + ' 올 때');
    return out.join(' · ');
  }
  function dexHead(title, n, total, lockNote) {
    var h3 = document.createElement('h3'); h3.textContent = title;
    var b = document.createElement('b'); b.textContent = n + ' / ' + total; h3.appendChild(b);
    dexEl.appendChild(h3);
    if (lockNote) { var p = document.createElement('p'); p.className = 'note'; p.textContent = lockNote; dexEl.appendChild(p); }
  }
  function renderStage6Dex(row) {
    var se = L.SEASON_NAME;
    dexHead('과일', L.fruitDexCount(S), L.TREES.length, L.orchardOk(S) ? '' : '신뢰도 ★' + L.ORCHARD_REP + '이 되면 과수원을 일굴 수 있어요');
    L.TREES.forEach(function (d) {
      var n = S.orchard ? S.orchard.dex[d.id] || 0 : 0, ic = fruitIcon(d.id); ic.className = 'sq';
      row(ic, n ? d.name : '???', n ? se[d.fruit] + ' 열매 · ' + se[d.bloom] + ' 꽃 · ' + d.price + '코인' : d.hint, n ? n + '개' : '', !n);
    });
    dexHead('꿀', L.honeyDexCount(S), L.HONEYS.length, S.bees ? '' : '과수원에 벌통을 놓으면 꽃에 따라 다른 꿀이 모여요');
    L.HONEYS.forEach(function (h) {
      var n = S.bees ? S.bees.dex[h.id] || 0 : 0, ic = honeyIcon(h.id); ic.className = 'sq';
      row(ic, n ? h.name : '???', n ? h.hint + ' · ' + h.price + '코인' : h.hint, n ? n + '병' : '', !n);
    });
    dexHead('곤충', L.bugDexCount(S), L.BUGS.length, L.netOk(S) ? '표본 ' + L.boxList(S).length + '종 · 집 안 표본 상자에' : '상점에서 잠자리채를 사면 곤충을 잡을 수 있어요');
    L.BUGS.forEach(function (b) {
      var n = S.bugs ? S.bugs.dex[b.id] || 0 : 0, ic = bugCanvas(b.id, 14, 14, !n); ic.className = 'sq';
      row(ic, n ? (b.rarity === '희귀' || b.rarity === '전설' ? '★ ' : '') + b.name : '???',
        n ? b.rarity + ' · ' + bugCond(b) + (S.bugs.box[b.id] ? ' · 표본' : '') : b.hint, n ? n + '마리' : '', !n);
    });
  }

  // ---------- 달력: insects only now, fruit this season ----------
  function renderStage6Now() {
    var e = curEnv(now());
    var list = L.BUGS.filter(function (b) { return (b.phase || b.wx) && Object.keys(L.BUG_PLACES).some(function (p) { return L.bugWeight(b, p, e) > 0; }); });
    if (list.length) {
      var h3 = document.createElement('h3'); h3.textContent = '곤충 지금';
      var hb = document.createElement('b'); hb.textContent = L.netOk(S) ? '잠자리채 있음' : '잠자리채 없음'; h3.appendChild(hb);
      calEl.appendChild(h3);
      list.forEach(function (b) {
        var got = S.bugs && S.bugs.dex[b.id];
        var r = document.createElement('div'); r.className = 'dx' + (got ? '' : ' unk');
        var ic = bugCanvas(b.id, 14, 14, !got); ic.className = 'sq';
        var n = document.createElement('div'); n.className = 'n'; n.textContent = got ? b.name : '???';
        var s3 = document.createElement('small'); s3.textContent = got ? bugCond(b) : b.hint; n.appendChild(s3);
        var v = document.createElement('div'); v.className = 'v'; v.textContent = b.rarity;
        r.appendChild(ic); r.appendChild(n); r.appendChild(v); calEl.appendChild(r);
      });
    }
    var ripe = L.TREES.filter(function (d) { return d.fruit === e.season; }).map(function (d) { return d.name; });
    note('이번 계절 과수원 열매 · ' + ripe.join('·'));
  }

  // ---------- 상점: 잠자리채 ----------
  function renderStage6Shop() {
    var h3 = document.createElement('h3'); h3.textContent = '곤충 채집'; shopEl.appendChild(h3);
    var own = L.netOk(S), r = document.createElement('div'); r.className = 'up';
    var n = document.createElement('div'); n.className = 'n'; n.textContent = '잠자리채';
    var sm = document.createElement('small');
    sm.textContent = own ? '곤충이 앉아 날개를 접었을 때 톡 · 표본 ' + L.boxList(S).length + '종' : '밭·마당·숲·과수원의 곤충을 잡는다 · 놓아주거나 표본 상자에';
    n.appendChild(sm);
    var bt = document.createElement('button'); bt.type = 'button';
    if (own) { bt.textContent = '있음'; bt.disabled = true; bt.className = 'max'; }
    else {
      bt.textContent = L.NET_COST.toLocaleString('ko-KR'); bt.setAttribute('aria-label', '잠자리채 사기 ' + L.NET_COST + '코인');
      if (S.coins < L.NET_COST) bt.classList.add('poor');
      bt.addEventListener('click', function () {
        var res = L.buyNet(S);
        if (!res.ok) { toast(WHY[res.why] || '살 수 없어요'); bt.classList.remove('shake'); void bt.offsetWidth; bt.classList.add('shake'); return; }
        toast('잠자리채 · 곤충이 앉았을 때 눌러 잡아요', 2800); refresh(); renderShop();
      });
    }
    r.appendChild(bugCanvas('cabbagewhite', 16, 16)); r.appendChild(n); r.appendChild(bt); shopEl.appendChild(r);
  }

  // ---------- console hooks ----------
  function addStage6Hooks(FF) {
    FF.orchard = function (grown) {
      if (!S.orchard) { S.rep = Math.max(S.rep, L.ORCHARD_REP); S.coins += L.ORCHARD_COST; L.unlockOrchard(S); }
      if (grown !== false) L.TREES.forEach(function (d, k) {
        if (!S.orchard.trees[k]) S.orchard.trees[k] = { id: d.id, at: now() - d.grow, t: now(), acc: 0, n: 0 };
        if (grown === 'fruit') S.orchard.trees[k].n = L.TREE_CAP;
      });
      goScene('orchard'); refresh(); return S.orchard.trees.map(function (p) { return p && p.id; });
    };
    FF.bees = function () {
      if (!S.orchard) FF.orchard(false);
      while (L.hiveCost(S) !== null) { S.coins += L.hiveCost(S); L.buyHive(S, now()); }
      S.bees.hives.forEach(function (h) { h.t = now() - L.HIVE_EVERY * 6; });
      L.hiveTick(S, now(), TZ, Math.random); refresh();
      return S.bees.hives.map(function (h) { return h.jar.slice(); });
    };
    // FF.bug() sends an insect from here now; FF.bug(id) that one; FF.bug('all') fills the 곤충 도감
    FF.bug = function (id) {
      if (!S.bugs) { S.coins += L.NET_COST; L.buyNet(S); }
      if (id === 'all') { L.BUGS.forEach(function (b) { L.catchBug(S, b.id); }); refresh(); return L.bugDexCount(S); }
      if (!BUG_VIEWS[view]) goScene('farm');
      var pick = id && L.bugById(id) ? id : L.rollBug(view, curEnv(now()), Math.random, S) || 'ant';
      bug = { id: pick, place: view, fl: L.bugFlight(pick, performance.now() + 200, Math.random) };
      var p0 = performance.now();
      return bug.fl.stops.map(function (s) { return { x: s.x, y: s.y, in: Math.round(s.t0 - p0), ms: s.t1 - s.t0 }; });   // where and when it lands
    };
  }
