  // ---------- stage 10 ④ 계절 도감 챌린지: card at season start, 달력 rows, ticks + reward, season decoration art ----------
  var questN = -1;
  function questLine(g) { return (g.done ? '■ ' : '□ ') + g.kind + ' · ' + (g.again ? '한 번 더: ' + g.name : g.done || g.plain ? g.name : '??? — ' + g.hint); }
  function questReward(se) {
    var id = L.QUEST_DECOS[se];
    return S.quest && S.quest.got[se] ? L.QUEST_COINS.toLocaleString('ko-KR') + '코인 (' + josa(L.decoById(id).name, '은', '는') + ' 이미 받음)' : L.decoById(id).name + ' (' + L.SEASON_NAME[se] + ' 한정 장식)';
  }
  function questCard() {
    var p = L.questProgress(S);
    showCard({ kicker: '계절 챌린지 · ' + p.n + '/' + p.list.length, title: L.SEASON_NAME[p.season] + '에 꼭 볼 것 ' + p.list.length + '개',
      lines: p.list.map(questLine).concat(['다 채우면 ' + questReward(p.season) + ' · 달력에서 다시 보기']) });
  }
  function tickQuest() {
    if (!booted || reel) return;
    L.questEnsure(S, now(), TZ);
    var p = L.questProgress(S);
    if (L.questCardDue(S)) { L.questCardSeen(S); questN = p.n; questCard(); save(); }
    if (questN >= 0 && p.n > questN && p.n < p.list.length) {
      var g = p.list.filter(function (x) { return x.done; }).pop();
      toast('계절 챌린지 ' + p.n + '/' + p.list.length + (g ? ' · ' + g.name : ''), 2600);
    }
    questN = p.n;
    var r = L.questClaim(S);
    if (!r) return;
    showCard({ kicker: '계절 챌린지 완료', title: L.SEASON_NAME[r.season] + '에 꼭 볼 것 다 봤다!',
      lines: r.deco ? [L.decoById(r.deco).name + (r.stored ? ' · 보관함에 넣어 뒀다 (상점에서 놓기)' : ' · 마당에 놓았다')] : ['+' + r.coins.toLocaleString('ko-KR') + '코인 · ' + L.SEASON_NAME[r.season] + ' 장식은 이미 있다'] });
    refresh();
  }
  setInterval(tickQuest, 1000);

  function questSig() { var p = S.quest ? L.questProgress(S) : null; return p ? S.quest.w + ':' + p.n + ':' + p.ok : ''; }
  function questBox(done) {
    var c = document.createElement('canvas'); c.width = 12; c.height = 12; c.className = 'sq';
    var saved = ctx; ctx = c.getContext('2d');
    px(1, 1, 10, 10, 4); px(2, 2, 8, 8, 0);
    if (done) { px(3, 6, 2, 2, 4); px(5, 7, 2, 2, 4); px(7, 4, 2, 3, 4); px(8, 3, 1, 1, 4); }
    ctx = saved;
    return c;
  }
  // 달력 오늘 tab: this season's five, ticked from the real 도감
  function renderQuestCal() {
    L.questEnsure(S, now(), TZ);
    var p = L.questProgress(S);
    if (!p.list.length) return;
    var h3 = document.createElement('h3'); h3.textContent = '계절 챌린지 · ' + L.SEASON_NAME[p.season] + '에 꼭 볼 것';
    var hb = document.createElement('b'); hb.textContent = p.ok ? '완료' : p.n + '/' + p.list.length; h3.appendChild(hb);
    calEl.appendChild(h3);
    p.list.forEach(function (g) {
      var r = document.createElement('div'); r.className = 'dx' + (g.done || g.again || g.plain ? '' : ' unk');
      r.appendChild(questBox(g.done));
      var n = document.createElement('div'); n.className = 'n'; n.textContent = g.again || g.done || g.plain ? g.name : '???';
      var s3 = document.createElement('small'); s3.textContent = g.again ? (g.done ? '이번 계절에 또 만났다' : '이번 계절에 한 번 더') : g.plain ? '이번 계절에 하나' : g.hint; n.appendChild(s3);
      var v = document.createElement('div'); v.className = 'v'; v.textContent = g.done ? '완료' : g.kind;
      r.appendChild(n); r.appendChild(v); calEl.appendChild(r);
    });
    note(p.ok ? '이번 계절 챌린지 끝 · 다음 계절에 새 카드' : '다 채우면 ' + questReward(p.season) + ' · 놓쳐도 다음 해 같은 계절에 다시');
  }

  // ---------- season decorations (DECOS from logic/quest.js) ----------
  DRAW_DECO.qazalea = function (x, y) {
    px(x + 2, y + 11, 8, 5, 4); px(x + 3, y + 12, 6, 3, 2); px(x + 1, y + 10, 10, 1, 4);
    px(x + 5, y + 6, 1, 4, 3); px(x + 3, y + 7, 1, 3, 3); px(x + 8, y + 7, 1, 3, 3);
    [[1, 3], [4, 1], [7, 2], [9, 5], [2, 6], [6, 4]].forEach(function (q) { px(x + q[0], y + q[1], 3, 2, 2); px(x + q[0] + 1, y + q[1] + 1, 1, 1, 4); px(x + q[0] + 1, y + q[1], 1, 1, 0); });
  };
  DRAW_DECO.qsunflower = function (x, y, tt) {
    var sway = Math.round(Math.sin((tt || 0) * 0.8));
    px(x + 4, y + 10, 2, 14, 3); px(x + 1, y + 15, 3, 2, 3); px(x + 6, y + 18, 3, 2, 3);
    px(x + 1 + sway, y + 1, 8, 8, 3); px(x + sway, y + 3, 10, 4, 3); px(x + 3 + sway, y, 4, 10, 3); px(x + 2 + sway, y + 2, 6, 6, 2);
    px(x + 3 + sway, y + 3, 4, 4, 4); px(x + 4 + sway, y + 4, 1, 1, 2);
  };
  DRAW_DECO.qmaple = function (x, y) {
    px(x + 3, y + 12, 8, 4, 4); px(x + 4, y + 13, 6, 2, 2); px(x + 2, y + 11, 10, 1, 4);
    px(x + 6, y + 6, 2, 5, 4); px(x + 4, y + 8, 3, 1, 4);
    px(x + 1, y + 2, 12, 5, 3); px(x + 3, y, 8, 3, 3); px(x + 2, y + 6, 4, 2, 3); px(x + 9, y + 5, 4, 2, 3);
    px(x + 3, y + 2, 1, 1, 1); px(x + 8, y + 1, 1, 1, 1); px(x + 11, y + 4, 1, 1, 1); px(x + 12, y + 14, 2, 1, 3);
  };
  DRAW_DECO.qsnowlamp = function (x, y, tt, night) {
    px(x + 4, y + 12, 2, 6, 4); px(x + 1, y + 18, 8, 2, 4);
    px(x + 1, y + 3, 8, 9, 4); px(x + 2, y + 4, 6, 7, night ? 0 : 1); px(x, y + 2, 10, 1, 4); px(x + 3, y, 4, 2, 4);
    px(x + 4, y + 5, 2, 5, 3); px(x + 3, y + 7, 4, 1, 3); px(x + 3, y + 5, 1, 1, 3); px(x + 6, y + 9, 1, 1, 3);
    px(x - 1, y + 1, 12, 1, 0);   // snow on the cap
  };

  // console hooks: FF.quest() → progress; FF.quest('card') shows the card; FF.quest('fill') records all five
  function addQuestHooks(FF) {
    FF.quest = function (cmd) {
      L.questEnsure(S, now(), TZ);
      if (cmd === 'card') questCard();
      if (cmd === 'fill') S.quest.list.forEach(function (g) {
        if (g.k === 'fish') { var d = S.dex.fish[g.id] || { n: 0, best: 10 }; S.dex.fish[g.id] = { n: d.n + 1, best: d.best }; }
        else if (g.k === 'crop') S.dex.crops[g.id] = (S.dex.crops[g.id] || 0) + 1;
        else if (g.k === 'forage') S.forest.dex[g.id] = (S.forest.dex[g.id] || 0) + 1;
        else if (g.k === 'bug') S.bugs.dex[g.id] = (S.bugs.dex[g.id] || 0) + 1;
        else if (g.k === 'flat' && S.flat) S.flat.dex[g.id] = (S.flat.dex[g.id] || 0) + 1;
        else if (g.k === 'star') L.seeStar(S, g.id, now());
      });
      return L.questProgress(S);
    };
  }
