  // ---------- Document Picture-in-Picture ----------
  // Browsers only open PiP from a user gesture, so "open small right away" arms the first click/key on the page.
  var pipWin = null, pipClosed = false, pipArmed = false, swallowClickUntil = 0;
  var pipOK = 'documentPictureInPicture' in window && window.top === window;
  var PIP_KEY = 'farmfish.autopip', pipHint = $('pipHint'), pipAuto = $('pipAuto');
  var PIP_LABEL = '<span class="mono-emoji">📌</span> ';
  function autoPip() { try { return localStorage.getItem(PIP_KEY) !== '0'; } catch (e) { return true; } }
  function arm() { pipArmed = pipOK && autoPip() && !pipWin && !pipClosed; pipHint.hidden = !pipArmed; }
  function setAutoPip(on) {
    try { localStorage.setItem(PIP_KEY, on ? '1' : '0'); } catch (e) { /* storage blocked: setting lasts this session */ }
    pipAuto.checked = on; arm();
  }
  function openPip() {
    pipArmed = false; pipHint.hidden = true;
    window.documentPictureInPicture.requestWindow({ width: 360, height: 480 }).then(function (pw) {
      pipWin = pw;
      var st = pw.document.createElement('style');
      st.textContent = Array.prototype.map.call(document.querySelectorAll('style'), function (s) { return s.textContent; }).join('\n');
      pw.document.head.appendChild(st);
      pw.document.title = '메모';
      var holder = pw.document.createElement('div'); holder.id = 'stage';
      pw.document.body.appendChild(holder);
      holder.appendChild(app);
      pipBtn.textContent = '돌아가기'; pipBtn.title = '원래 창으로 돌아가기';
      curWin = pw; bindDoc(pw.document, pw); fit(); startLoop();
      pw.addEventListener('pagehide', function () {
        stageEl.appendChild(app);
        pipWin = null; curWin = window; pipClosed = true;
        pipBtn.innerHTML = PIP_LABEL + '다시'; pipBtn.title = '다시 작게 띄우기';
        fit(); startLoop();
        toast('작게 띄운 창을 닫았어요 · 위의 📌 다시', 3200);
      });
    }).catch(function () { toast('작게 띄우기를 열 수 없어요'); });
  }
  function togglePip() { if (pipWin) pipWin.close(); else openPip(); }
  if (pipOK) {
    pipBtn.hidden = false;
    pipBtn.addEventListener('click', togglePip);
    pipAuto.checked = autoPip();
    pipAuto.addEventListener('change', function () { setAutoPip(pipAuto.checked); });
    window.addEventListener('pointerdown', function (e) {
      if (!pipArmed || pipAuto.parentNode.contains(e.target)) return;
      // this gesture only opens PiP: it must not also plant, cast or press a button
      e.preventDefault(); e.stopPropagation();
      swallowClickUntil = performance.now() + 1500;
      openPip();
    }, true);
    window.addEventListener('click', function (e) {
      if (performance.now() < swallowClickUntil) { e.preventDefault(); e.stopPropagation(); swallowClickUntil = 0; }
    }, true);
    window.addEventListener('keydown', function (e) {
      // Esc stays the boss key and P is the toggle itself; bare modifiers are not a decision to open
      if (!pipArmed || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.key === 'Escape' || isPipKey(e) ||
          /^(Shift|Control|Alt|Meta|Tab|CapsLock|Process)$/.test(e.key)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      openPip();
    }, true);
    arm();
  }

