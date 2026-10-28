  // ---------- 도감 "기록" tab: secrets (??? + easy hint), visitors met, letters ----------
  var dexTab = 'dex';
  function decorateDex() {
    var head = dexEl.querySelector('h2');
    if (!head) return;
    var tabs = document.createElement('div'); tabs.className = 'tabs'; tabs.setAttribute('role', 'group');
    [['dex', '도감'], ['rec', '기록 ' + L.eggCount(S) + '/' + L.EGGS.length], ['friend', '친구']].forEach(function (tb) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = tb[1];
      b.setAttribute('aria-pressed', String(dexTab === tb[0]));
      b.addEventListener('click', function () { dexTab = tb[0]; renderDex(); renderSettings(); decorateDex(); dexEl.scrollTop = 0; });
      tabs.appendChild(b);
    });
    head.after(tabs);
    if (dexTab !== 'rec' && dexTab !== 'friend') return;
    while (tabs.nextSibling) tabs.nextSibling.remove();
    if (dexTab === 'rec') renderRecords(); else renderShare();   // stage 4: 친구 기록 비교
  }
  dexBtn.addEventListener('click', decorateDex);
  function recRow(icon, name, sub, val, unk) {
    var r = document.createElement('div'); r.className = 'dx' + (unk ? ' unk' : '');
    var n = document.createElement('div'); n.className = 'n'; n.textContent = name;
    var sm = document.createElement('small'); sm.textContent = sub; n.appendChild(sm);
    var v = document.createElement('div'); v.className = 'v'; v.textContent = val;
    if (unk) icon.style.opacity = '0.35';
    icon.classList.add('sq');
    r.appendChild(icon); r.appendChild(n); r.appendChild(v); dexEl.appendChild(r);
  }
  function medal(got) {
    var c = document.createElement('canvas'); c.width = 12; c.height = 12;
    spr(got ? ['..4..4..', '...44...', '..4444..', '.400004.', '40044004', '40400404', '.400004.', '..4444..']
            : ['..2..2..', '...22...', '..2222..', '.2....2.', '2..22..2', '2.2..2.2', '.2....2.', '..2222..'], 2, 2, false, c.getContext('2d'));
    return c;
  }
  function renderRecords() {
    var y = S.yard;
    var h3 = document.createElement('h3'); h3.textContent = '비밀';
    var b = document.createElement('b'); b.textContent = L.eggCount(S) + ' / ' + L.EGGS.length; h3.appendChild(b); dexEl.appendChild(h3);
    L.EGGS.forEach(function (e) {
      var at = y.eggs[e.id];
      recRow(medal(!!at), at ? e.name : '???', at ? e.desc : '힌트 · ' + e.hint, at && e.reward ? '+' + e.reward : '', !at);
    });
    var p = document.createElement('p'); p.className = 'note';
    p.textContent = '힌트는 우편배달부 편지, 떠돌이 상인, 고양이도 흘려요';
    dexEl.appendChild(p);
    h3 = document.createElement('h3'); h3.textContent = '찾아온 손님';
    var met = L.VISITORS.filter(function (d) { return y.met[d.id]; }).length;
    b = document.createElement('b'); b.textContent = met + ' / ' + L.VISITORS.length; h3.appendChild(b); dexEl.appendChild(h3);
    L.VISITORS.forEach(function (d) {
      var n = y.met[d.id] || 0, need = L.DECOS.filter(function (x) { return x.brings === d.id; })[0];
      var hint = d.night ? '밤에 마당 하늘을 보면…' : d.rainbow ? '비가 그친 직후에…' : d.slot === 'pond' ? '연못가에 가끔' : need ? josa(need.name, '을', '를') + ' 놓으면…' : '마당에 가끔';
      recRow(visitorIcon(d.id), n ? d.name : '???', n ? (d.slot === 'pond' ? '연못' : '마당') + '에 왔던 손님' : hint, n ? n + '번' : '', !n);
    });
    renderBottleLetters();   // stage 5B: 병 편지 + the 고물 상자
    h3 = document.createElement('h3'); h3.textContent = '편지';
    b = document.createElement('b'); b.textContent = y.mail.length + '통'; h3.appendChild(b); dexEl.appendChild(h3);
    var read = y.mail.filter(function (m) { return m.read; });
    if (!read.length) { var q = document.createElement('p'); q.className = 'note'; q.textContent = '우체통을 놓으면 우편배달부가 편지를 가져와요'; dexEl.appendChild(q); }
    read.slice().reverse().forEach(function (m) {
      var box = document.createElement('div'); box.className = 'letter';
      var tx = document.createElement('p'); tx.textContent = L.letterText(m.k); box.appendChild(tx); dexEl.appendChild(box);
    });
  }
  function visitorIcon(id) {
    var d = L.visitorById(id), c = document.createElement('canvas'); c.width = 24; c.height = 24;
    var saved = ctx; ctx = c.getContext('2d');
    try {
      var v = { id: id, at: 0, until: 1, x: 0.5, n: 1 }, p = { x: 12, y: 16, dir: 1 };
      if (id === 'shootingstar') p = { x: 20, y: 6 };
      if (id === 'rainbow') { ctx.translate(-78, -2); DRAW_VIS.rainbow(v, p, 0); }
      else if (id === 'merchant') { ctx.scale(0.5, 0.5); DRAW_VIS.merchant(v, { x: 18, y: 30 }, 0); }
      else if (id === 'fireflies') { for (var k = 0; k < 5; k++) { px(4 + k * 4, 6 + (k % 3) * 5, 2, 2, 3); } }
      else DRAW_VIS[id](v, p, 0);
    } finally { ctx = saved; }
    if (d.slot === 'sky') c.style.background = 'var(--g1)';
    return c;
  }
