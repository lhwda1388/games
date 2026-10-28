  // ---------- 도감 / 상점: fold a section by tapping its heading ----------
  // Panels are rebuilt from scratch on every open/tab switch, so instead of touching each render function
  // this watches the two long panels and re-applies the folds after any rebuild. A section is a <h3> plus
  // the siblings after it up to the next <h3>. Folded titles are remembered per panel (per viewer only).
  var FOLD_KEY = 'farmfish.fold';
  var folded = {};
  try { folded = JSON.parse(localStorage.getItem(FOLD_KEY) || '{}') || {}; } catch (e) { folded = {}; }
  function foldId(panel, h) {   // the heading's own words, without the ▸ mark or the count in <b>
    var t = Array.prototype.filter.call(h.childNodes, function (n) { return n.nodeType === 3; }).map(function (n) { return n.textContent; }).join('');
    return panel.id + ':' + t.trim();
  }
  function applyFolds(panel) {
    var cur = null;
    Array.prototype.forEach.call(panel.children, function (el) {
      if (el.tagName === 'H3') {
        if (!el.dataset.fold) {
          el.dataset.fold = '1';
          el.tabIndex = 0; el.setAttribute('role', 'button');
          var mark = document.createElement('i'); mark.className = 'fold-mark'; mark.setAttribute('aria-hidden', 'true');
          el.insertBefore(mark, el.firstChild);
          var flip = function () {
            var id = foldId(panel, el);
            if (folded[id]) delete folded[id]; else folded[id] = 1;
            try { localStorage.setItem(FOLD_KEY, JSON.stringify(folded)); } catch (e) {}
            applyFolds(panel);
          };
          el.addEventListener('click', flip);
          el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); flip(); } });
        }
        cur = !!folded[foldId(panel, el)];
        el.setAttribute('aria-expanded', cur ? 'false' : 'true');
        el.querySelector('.fold-mark').textContent = cur ? '▸' : '▾';
        return;
      }
      if (cur !== null) el.classList.toggle('fold-out', cur);
    });
  }
  [dexEl, shopEl].forEach(function (panel) {
    new MutationObserver(function () { applyFolds(panel); }).observe(panel, { childList: true });
  });
