  // ---------- 도감 "친구" tab: my record code (copy) and a friend's code side by side ----------
  // Trust boundary: a pasted code only ever goes through L.decodeShare and is shown with textContent.
  var friendStats = null, friendRaw = '';
  var HOUSE_NAMES = L.HOUSE.map(function (h) { return h.name; });
  function myCode() { return L.encodeShare(L.shareStats(S, now())); }
  function copyText(text, field) {
    var done = function () { toast('복사했어요 · 친구에게 붙여 넣어 달라고 해요', 2600); };
    var fallback = function () {
      try { field.focus(); field.select(); if (document.execCommand('copy')) { done(); return; } } catch (e) { /* not allowed here */ }
      toast('코드를 길게 눌러 직접 복사해 주세요', 2800);
    };
    try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, fallback); return; } } catch (e) { /* fall through */ }
    fallback();
  }
  function shareField(value, readOnly, label, max) {
    var f = document.createElement('input'); f.type = 'text'; f.className = 'field' + (readOnly ? ' code' : '');
    f.value = value; f.readOnly = !!readOnly; f.setAttribute('aria-label', label); f.spellcheck = false; f.autocomplete = 'off';
    if (max) f.maxLength = max;
    return f;
  }
  function renderShare() {
    var h3 = document.createElement('h3'); h3.textContent = '내 기록 코드';
    var b = document.createElement('b'); b.textContent = '농장 ' + L.farmYear(S, now()) + '년차'; h3.appendChild(b); dexEl.appendChild(h3);
    var nickRow = document.createElement('div'); nickRow.className = 'shareRow';
    var nick = shareField(S.nick || '', false, '닉네임 (선택, 8자)', L.NICK_MAX * 2);
    nick.placeholder = '닉네임 (선택)';
    nickRow.appendChild(nick); dexEl.appendChild(nickRow);
    var codeRow = document.createElement('div'); codeRow.className = 'shareRow';
    var code = shareField(myCode(), true, '내 기록 코드');
    var copy = document.createElement('button'); copy.type = 'button'; copy.textContent = '복사';
    copy.addEventListener('click', function () { copyText(code.value, code); });
    codeRow.appendChild(code); codeRow.appendChild(copy); dexEl.appendChild(codeRow);
    nick.addEventListener('input', function () {
      var c = L.cleanNick(nick.value);
      if (c) S.nick = c; else delete S.nick;
      code.value = myCode();
      if (friendStats) renderCompare(table);
    });
    nick.addEventListener('change', function () { nick.value = S.nick || ''; save(); });
    var p = document.createElement('p'); p.className = 'note';
    p.textContent = '코드에는 닉네임·년차·가장 큰 물고기·도감 수·★·요리·비밀·집만 들어가요';
    dexEl.appendChild(p);

    h3 = document.createElement('h3'); h3.textContent = '친구 기록과 비교'; dexEl.appendChild(h3);
    var inRow = document.createElement('div'); inRow.className = 'shareRow';
    var paste = shareField(friendRaw, false, '친구 기록 코드', 400);
    paste.placeholder = 'FF1-… 붙여 넣기';
    var go = document.createElement('button'); go.type = 'button'; go.textContent = '비교';
    inRow.appendChild(paste); inRow.appendChild(go); dexEl.appendChild(inRow);
    var msg = document.createElement('p'); msg.className = 'note'; dexEl.appendChild(msg);
    var table = document.createElement('div'); table.className = 'cmp'; dexEl.appendChild(table);
    function compare() {
      friendRaw = paste.value;
      var st = L.decodeShare(paste.value);
      if (!st) {
        friendStats = null; table.textContent = '';
        msg.textContent = paste.value.trim() ? '코드가 맞지 않아요 · 끝까지 다 복사했는지 확인해 주세요' : '친구가 보낸 코드를 붙여 넣어요';
        return;
      }
      friendStats = st; msg.textContent = '';
      renderCompare(table);
    }
    go.addEventListener('click', compare);
    paste.addEventListener('keydown', function (e) { if (e.key === 'Enter') compare(); });
    if (friendRaw) compare(); else msg.textContent = '친구가 보낸 코드를 붙여 넣어요';
  }
  function renderCompare(table) {
    var me = L.shareStats(S, now()), fr = friendStats;
    table.textContent = '';
    var fishText = function (st) { return st.fish ? (L.fishById(st.fish.id) ? L.fishById(st.fish.id).name : '???') + ' ' + st.fish.size.toFixed(1) + 'cm' : '—'; };
    var rows = [
      ['', me.nick || '나', fr.nick || '친구', null],
      ['농장', me.year + '년차', fr.year + '년차', [me.year, fr.year]],
      ['가장 큰 물고기', fishText(me), fishText(fr), [me.fish ? me.fish.size : 0, fr.fish ? fr.fish.size : 0]],
      ['물고기 도감', me.fdex + '종', fr.fdex + '종', [me.fdex, fr.fdex]],
      ['작물 도감', me.cdex + '종', fr.cdex + '종', [me.cdex, fr.cdex]],
      ['요리 도감', me.ddex + '종', fr.ddex + '종', [me.ddex, fr.ddex]],
      ['신뢰도', '★' + me.rep, '★' + fr.rep, [me.rep, fr.rep]],
      ['요리한 횟수', me.cooked + '번', fr.cooked + '번', [me.cooked, fr.cooked]],
      ['찾은 비밀', me.eggs + '개', fr.eggs + '개', [me.eggs, fr.eggs]],
      ['집', HOUSE_NAMES[me.house] || '?', HOUSE_NAMES[fr.house] || '?', [me.house, fr.house]]
    ];
    rows.forEach(function (r, k) {
      var line = document.createElement('div'); line.className = 'cr' + (k ? '' : ' head');
      [r[0], r[1], r[2]].forEach(function (t, j) {
        var c = document.createElement('span'); c.textContent = t;
        if (r[3] && j && r[3][j - 1] > r[3][2 - j]) c.className = 'win';
        line.appendChild(c);
      });
      table.appendChild(line);
    });
  }
