  // ---------- 오늘의 할 일 (달력 panel, top) + 농장 N년차; the logic tick keeps today's list and pays once ----------
  function todayKey(t) {
    var d = new Date(t), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  L.ensureBorn(S, now());
  function tickDaily(t) {
    var had = S.daily && S.daily.key;
    L.ensureDaily(S, todayKey(t));
    if (had && had !== S.daily.key && booted) toast('새 날 · 오늘의 할 일 3개가 생겼다 · 달력', 3000);
    var r = L.claimDaily(S);
    if (r) {
      setTimeout(function () { toast('★ 오늘의 할 일 완료 · +' + r.coins + ' · 비료 ' + r.fert, 3600); }, booted ? 900 : 3400);
      floatText('+' + r.coins, 90, 40); refresh();
    }
  }
  function dailySig() { return S.daily ? S.daily.key + S.daily.goals.map(function (g) { return g.p; }).join('') + S.daily.paid : ''; }
  function renderDaily() {
    var d = S.daily;
    var h3 = document.createElement('h3'); h3.textContent = '오늘의 할 일';
    var b = document.createElement('b'); b.textContent = '농장 ' + L.farmYear(S, now()) + '년차'; h3.appendChild(b); calEl.appendChild(h3);
    if (!d) return;
    var list = document.createElement('div'); list.className = 'todo';
    d.goals.forEach(function (g) {
      var done = g.p >= g.n;
      var r = document.createElement('div'); r.className = 'ms' + (done ? ' done' : '');
      var bx = document.createElement('span'); bx.className = 'box';
      var n = document.createElement('div'); n.className = 'n'; n.textContent = L.dailyText(g);
      var v = document.createElement('div'); v.className = 'v'; v.textContent = Math.min(g.p, g.n) + '/' + g.n;
      r.appendChild(bx); r.appendChild(n); r.appendChild(v); list.appendChild(r);
    });
    calEl.appendChild(list);
    var rw = L.dailyReward(S);
    note(d.paid ? '오늘 몫은 다 했어요 · 내일 새 할 일이 와요' : '셋 다 하면 ' + rw.coins + '코인 + 비료 ' + rw.fert + ' · 못 해도 괜찮아요');
  }
