  // ---------- 도감 "놀거리" tab: open places/activities with how-to, locked ones dimmed with what opens them ----------
  // Reuses .dx/.tagx/.note from style.css (tokens only). Entries shown here are marked seen right after rendering.
  function guideTabLabel() { var n = L.guideNew(S).length; return n ? '놀거리 · 새 ' + n : '놀거리'; }
  // opening the 도감 while something new has opened lands on 놀거리 (this file sits before records.js, so this runs first)
  dexBtn.addEventListener('click', function () { if (L.guideNew(S).length) dexTab = 'guide'; });
  function renderGuide() {
    var fresh = L.guideNew(S);
    var open = L.GUIDE.filter(function (g) { return L.guideOpen(S, g.id); });
    var shut = L.GUIDE.filter(function (g) { return !L.guideOpen(S, g.id); });
    guideHead('할 수 있는 것', open.length + ' / ' + L.GUIDE.length);
    open.forEach(function (g) { guideRow(g.name, g.how, fresh.indexOf(g.id) >= 0, false); });
    if (shut.length) {
      guideHead('아직 잠긴 것', shut.length + '');
      shut.forEach(function (g) { guideRow(g.name, '여는 법 · ' + g.lock, false, true); });
    }
    var p = document.createElement('p'); p.className = 'note';
    p.textContent = '새로 열리면 「새」 표시 · 새 장소에 처음 가면 한 번 알려 줘요';
    dexEl.appendChild(p);
    if (!fresh.length) return;
    L.guideSee(S, fresh); save();
    var tb = dexEl.querySelector('.tabs button[aria-pressed="true"]');
    if (tb) tb.textContent = guideTabLabel();   // seen now: drop the "새 N" from the tab
  }
  function guideHead(text, count) {
    var h3 = document.createElement('h3'); h3.textContent = text;
    var b = document.createElement('b'); b.textContent = count; h3.appendChild(b);
    dexEl.appendChild(h3);
  }
  function guideRow(name, sub, isNew, locked) {
    var r = document.createElement('div'); r.className = 'dx' + (locked ? ' unk' : '');
    var n = document.createElement('div'); n.className = 'n'; n.textContent = name;
    if (isNew) { var t = document.createElement('span'); t.className = 'tagx'; t.textContent = '새'; n.appendChild(t); }
    var sm = document.createElement('small'); sm.textContent = sub; n.appendChild(sm);
    r.appendChild(n); dexEl.appendChild(r);
  }
  // first visit to a scene: its how-line once (called from goScene)
  function guideTipShow(sc) {
    var g = L.guideTip(S, sc);
    if (!g) return;
    save(); toast(g.name + ' · ' + g.how, 4200);
  }
  function addGuideHooks(FF) {
    // FF.guide() → { open, locked, new }; FF.guide('reset') forgets seen entries and tips
    FF.guide = function (cmd) {
      if (cmd === 'reset') delete S.guide;
      return { open: L.GUIDE.filter(function (g) { return L.guideOpen(S, g.id); }).map(function (g) { return g.id; }),
        locked: L.GUIDE.filter(function (g) { return !L.guideOpen(S, g.id); }).map(function (g) { return g.id; }),
        new: L.guideNew(S) };
    };
  }
