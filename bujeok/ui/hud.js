// 부적난무 — 전투 HUD. 값이 바뀔 때만 DOM을 고친다.
const BJ_HUD = (function bjHud() {
  function create(root, content) {
    root.innerHTML = `
      <div class="hud-top">
        <div class="bar hp" role="meter" aria-label="체력"><i></i></div>
        <div class="bar xp" role="meter" aria-label="경험치"><i></i></div>
        <div class="hud-row"><span class="lv"></span><span class="time"></span><span class="purse" aria-label="판 엽전"></span><span class="hud-btns"><button class="mute" type="button" aria-pressed="false" aria-label="소리 끄기">♪</button><button class="pause" type="button" aria-label="일시정지">Ⅱ</button></span></div>
        <div class="radar-slot" aria-hidden="true"></div>
      </div>
      <div class="slots" aria-label="장착한 부적"></div>
      <button class="fusion-badge" type="button" hidden>합체 가능</button>
      <div class="save-fail" role="status" hidden>저장 실패 — 이 판은 이어하기가 안 될 수 있어요</div>`;
    const q = s => root.querySelector(s);
    const prev = {};
    const set = (k, v, fn) => { if (prev[k] !== v) { prev[k] = v; fn(v); } };
    let pauseCb = () => {}, fusionCb = () => {}, muteCb = () => {};
    q('.pause').onclick = () => pauseCb();
    q('.mute').onclick = () => muteCb();
    q('.fusion-badge').onclick = () => fusionCb(q('.fusion-badge').dataset.recipe);
    return {
      show(on) { root.hidden = !on; },
      onPause(fn) { pauseCb = fn; },
      onFusion(fn) { fusionCb = fn; },
      onMute(fn) { muteCb = fn; },
      // 눌림 = 음소거 중. 라벨은 누르면 일어날 일을 말한다.
      setMuted(on) {
        const b = q('.mute');
        b.setAttribute('aria-pressed', String(on));
        b.setAttribute('aria-label', on ? '소리 켜기' : '소리 끄기');
      },
      saveFailed(on) { q('.save-fail').hidden = !on; },
      update(state) {
        const p = state.player;
        set('hp', Math.ceil(p.hp) + '/' + p.maxHp, () => {
          const v = Math.max(0, p.hp / p.maxHp);
          q('.hp i').style.width = v * 100 + '%';
          q('.hp').setAttribute('aria-valuenow', Math.ceil(p.hp));
        });
        set('xp', p.xp + '/' + p.level, () => { q('.xp i').style.width = Math.min(1, p.xp / BJ_SIM.xpNeed(content.rules, p.level)) * 100 + '%'; });
        set('purse', state.purse || 0, v => { q('.purse').textContent = v ? '엽전 ' + v : ''; });
        set('lv', p.level, v => { q('.lv').textContent = 'Lv ' + v; });
        set('time', Math.floor(state.t), () => { q('.time').textContent = BJ_TEXT.mmss(state.t); });
        set('slots', state.slots.map(s => s.id + s.lv).join(), () => {
          q('.slots').innerHTML = state.slots.map(s => {
            const t = content.talismans[s.id], A = typeof BJ_ART !== 'undefined' ? BJ_ART : null, id = 'i:' + s.id;
            const pic = A && A.sprites[id] ? `<img class="icon" src="${A.dataURL(id, 3)}" alt="" width="32" height="32">` : t.glyph;
            return `<div class="slot${t.fusion ? ' fused' : ''}" title="${t.name} Lv${s.lv}"><b>${pic}</b><small>${s.lv}</small></div>`;
          }).join('');
        });
        const ready = BJ_SKILLS.readyFusions(state, content).filter(r => state.postponed[r]);
        set('fusion', ready.join(), () => {
          const b = q('.fusion-badge');
          b.hidden = !ready.length;
          b.dataset.recipe = ready[0] || '';
        });
      },
    };
  }
  return { create };
})();
