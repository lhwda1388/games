  // ---------- 설정: ⚙ in the header → one panel: 전체·효과음·음악·환경음 on/off + 크기, 작게 띄우기 ----------
  // Everything here lives in localStorage (sound.js, pip.js), never in the save. M stays the quick 전체 on/off (sndShow
  // keeps #setSnd in step). The panel sits inside #app like 도감, so it travels into the PiP window too.
  var setEl = $('set'), setBtn = document.createElement('button');
  setBtn.type = 'button'; setBtn.id = 'setBtn'; setBtn.title = '설정'; setBtn.setAttribute('aria-label', '설정');
  var setIcon = document.createElement('canvas'); setIcon.width = 7; setIcon.height = 7;
  setBtn.appendChild(setIcon);
  pipBtn.before(setBtn);
  spr(['..4.4..', '.44444.', '444.444', '44...44', '444.444', '.44444.', '..4.4..'], 0, 0, false, setIcon.getContext('2d'));
  var setPing = 0;
  function renderSet() {
    setEl.innerHTML = '';
    var h = document.createElement('h2'); h.textContent = '설정';
    var close = document.createElement('button'); close.type = 'button'; close.textContent = '닫기';
    close.addEventListener('click', function () { setEl.hidden = true; setBtn.focus(); });
    h.appendChild(close); setEl.appendChild(h);
    var h3 = document.createElement('h3'); h3.textContent = '소리'; setEl.appendChild(h3);
    setVolRow('setSnd', sndOn, '전체', 'M 키로 바로 끄고 켜기', sndSet, 'master');
    setVolRow('setSfx', sfxOn, '효과음', '낚시·수확·버튼 소리 · 끌어 보면 들려요', sfxSet, 'sfx');
    setVolRow('setMus', musOn, '음악', '시간마다 바뀌는 배경 음악', musSet, 'music');
    setVolRow('setAmb', ambOn, '환경음', '물소리·빗소리·새·벌레 · 음악을 꺼도 들려요', ambSet, 'ambient');
    bndSettings();   // 마을 음악회: 악기마다 켜고 끄기 (only once one is owned)
    if (haptOK() || haptIOS()) {   // 진동: only where the browser can buzz
      h3 = document.createElement('h3'); h3.textContent = '진동'; setEl.appendChild(h3);
      var vl = document.createElement('label'); vl.className = 'setRow';
      var vc = document.createElement('input'); vc.type = 'checkbox'; vc.checked = haptOn;
      vc.addEventListener('change', function () { haptSet(vc.checked); });
      var vt = document.createElement('span'); vt.textContent = '진동';
      var vs = document.createElement('small'); vs.textContent = haptOK() ? '입질·줄 끊김·부딪힘·곡괭이 · 폰에서만' : '아이폰은 터치할 때만 짧게'; vt.appendChild(vs);
      vl.appendChild(vc); vl.appendChild(vt); setEl.appendChild(vl);
    }
    if (!pipOK) return;
    h3 = document.createElement('h3'); h3.textContent = '작은 창'; setEl.appendChild(h3);
    var lb = document.createElement('label'); lb.className = 'setRow';
    var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = autoPip();
    cb.addEventListener('change', function () { setAutoPip(cb.checked); });
    var tx = document.createElement('span'); tx.textContent = '열면 바로 작게 띄우기';
    var sm = document.createElement('small'); sm.textContent = '첫 클릭에 작은 창으로 · P 키로 언제든 켜고 끄기'; tx.appendChild(sm);
    lb.appendChild(cb); lb.appendChild(tx); setEl.appendChild(lb);
  }
  // one sound row: on/off checkbox, then its 크기 slider (0–100, step 5) with the value as 「70%」
  function setVolRow(id, on, name, sub, set, k) {
    var box = document.createElement('div'); box.className = 'setVol';
    var lb = document.createElement('label'); lb.className = 'setRow';
    var cb = document.createElement('input'); cb.type = 'checkbox'; cb.id = id; cb.checked = !!on;
    cb.addEventListener('change', function () { set(cb.checked); });
    var tx = document.createElement('span'); tx.textContent = name;
    var sm = document.createElement('small'); sm.textContent = sub; tx.appendChild(sm);
    lb.appendChild(cb); lb.appendChild(tx); box.appendChild(lb);
    var row = document.createElement('div'); row.className = 'vol';
    var rl = document.createElement('label'); rl.className = 'vh'; rl.htmlFor = id + 'Vol'; rl.textContent = name + ' 크기';
    var rg = document.createElement('input'); rg.type = 'range'; rg.id = id + 'Vol'; rg.min = '0'; rg.max = '100'; rg.step = '5'; rg.value = String(VOL[k]);
    var out = document.createElement('output'); out.setAttribute('for', rg.id);
    function show() { var p = rg.value + '%'; out.textContent = p; rg.setAttribute('aria-valuetext', p); rg.style.setProperty('--p', p); }
    rg.addEventListener('input', function () {
      volSet(k, +rg.value); show();
      if (k === 'sfx' && performance.now() - setPing > 150) { setPing = performance.now(); sfx('volPing'); }   // hear the level while dragging
    });
    show();
    row.appendChild(rl); row.appendChild(rg); row.appendChild(out); box.appendChild(row); setEl.appendChild(box);
  }
  setBtn.addEventListener('click', function () {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true;
    renderSet(); setEl.hidden = false; setEl.scrollTop = 0;
  });
