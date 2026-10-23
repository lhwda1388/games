// 부적난무 — 선택 창, 결과, 메뉴, 일시정지, 알림. 문구는 콘텐츠 데이터(우리가 쓴 것)라서 innerHTML로 넣는다.
const BJ_MODALS = (function bjModals() {
  const $ = id => document.getElementById(id);
  const T = BJ_TEXT;
  // 그림 아이콘(<img>, 픽셀 그대로 확대). 그림이 없으면 대체 글자. mode 'silhouette'는 못 본 항목
  function icon(id, glyph, size = 48, mode) {
    const A = typeof BJ_ART !== 'undefined' ? BJ_ART : null;
    if (!id || !A || !A.sprites[id]) return glyph;
    return `<img class="icon" src="${A.dataURL(id, 3, mode)}" alt="" width="${size}" height="${size}">`;
  }

  // 선택 창은 열린 뒤 잠깐(ARM_MS) 입력을 받지 않는다 — 앞 창에서 넘어온 연타·꾹 누름이 새 창을 고르지 못하게(리뷰 중요 1)
  const ARM_MS = 250;
  let armedAt = 0;
  const armed = () => performance.now() >= armedAt;
  // 선택 창 단축키: 반복 입력, 무장 전, 일시정지 오버레이가 떠 있을 때, 입력칸에 쓰는 중에는 무시
  function choiceKey(fn) {
    document.onkeydown = ev => {
      if (ev.repeat || !armed() || !$('overlay').hidden) return;
      const t = ev.target && ev.target.tagName;
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
      fn(ev);
    };
  }

  function open(html, onClick, arm) {
    const m = $('modal');
    document.onkeydown = null; // 앞 창의 단축키가 남지 않게
    m.innerHTML = html;
    m.hidden = false;
    armedAt = arm ? performance.now() + ARM_MS : 0;
    m.onclick = arm ? ev => { if (armed()) onClick(ev); } : onClick;
    const first = m.querySelector('button');
    if (first) first.focus({ preventScroll: true });
  }
  function hideChoice() { const m = $('modal'); m.hidden = true; m.innerHTML = ''; m.onclick = null; document.onkeydown = null; }
  function hideAll() { hideChoice(); stopCountdown(); const o = $('overlay'); o.hidden = true; o.innerHTML = ''; }

  function cardHtml(c, i) {
    const pairs = c.pairs.map(p => `<li>짝 <b>${p.partner}</b> → ${p.branches.map(b => `${b.how} <em>(약점: ${b.weak})</em>`).join(' / ')}</li>`).join('');
    const wide = window.innerWidth >= 600 && window.innerHeight >= 760;
    return `<div class="cardwrap"><button type="button" class="card${c.related ? ' target' : ''}" data-i="${i}">
      <span class="glyph" aria-hidden="true">${icon(c.icon, c.glyph)}</span><span class="name">${c.title}</span><span class="lvl">${c.level}</span>
      <span class="how">${c.how}</span>${c.stats ? `<span class="stats">${c.stats}</span>` : ''}${c.weak ? `<span class="weak">약점: ${c.weak}</span>` : ''}
      ${c.related ? '<span class="tag">목표 합체</span>' : ''}</button>${pairs ? `<details class="more"${wide ? ' open' : ''}><summary>짝 조합 보기</summary><ul class="pairs">${pairs}</ul></details>` : ''}</div>`;
  }

  function levelup(state, content, h) {
    const cards = state.choice.options.map(o => T.option(content, state, o));
    const canDiscard = state.slots.length >= content.rules.slots && state.discards > 0;
    open(`<section class="sheet" role="dialog" aria-modal="true" aria-labelledby="lv-h">
      <h2 id="lv-h">레벨 ${state.player.level}${state.pendingLevels > 1 ? ` <span class="lv-more">(+${state.pendingLevels - 1} 더)</span>` : ''}</h2><p class="hint">부적 한 장을 고르세요 · <kbd>1</kbd>–<kbd>${cards.length}</kbd></p>
      <div class="cards">${cards.map(cardHtml).join('')}</div>
      <div class="row">${state.rerolls > 0 ? `<button type="button" class="ghost" data-act="reroll">다시 뽑기 (${state.rerolls})</button>` : ''}${canDiscard ? `<button type="button" class="ghost" data-act="discard">부적 버리기 (${state.discards})</button>` : ''}</div>
      <div class="discard-list row" hidden>${state.slots.map((s, i) => `<button type="button" class="ghost" data-slot="${i}">${content.talismans[s.id].name} Lv${s.lv} 버리기</button>`).join('')}</div>
    </section>`, ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.i != null) h.choose(+b.dataset.i);
      else if (b.dataset.act === 'reroll') h.reroll();
      else if (b.dataset.act === 'discard') $('modal').querySelector('.discard-list').hidden = false;
      else if (b.dataset.slot != null) h.discard(+b.dataset.slot);
    }, true);
    choiceKey(ev => { const n = +ev.key; if (n >= 1 && n <= cards.length) h.choose(n - 1); });
  }

  function market(state, content, h) {
    const rows = state.choice.offers.map((o, i) => {
      const c = T.option(content, state, o), poor = state.purse < o.price;
      return `<button type="button" class="card${poor ? ' poor' : ''}" data-i="${i}"${poor ? ' disabled' : ''}>
        <span class="glyph" aria-hidden="true">${icon(c.icon, c.glyph)}</span><span class="name">${c.title}</span><span class="lvl">엽전 ${o.price}</span>
        <span class="how">${c.how}</span>${c.stats ? `<span class="stats">${c.stats}</span>` : ''}</button>`;
    }).join('');
    open(`<section class="sheet market" role="dialog" aria-modal="true" aria-labelledby="mk-h">
      <h2 id="mk-h">도깨비 장터</h2><p class="hint">가진 엽전 ${state.purse} · <kbd>1</kbd>–<kbd>${state.choice.offers.length || 1}</kbd> 사기 · <kbd>Esc</kbd> 떠나기</p><p class="hint">하나라도 사면 장터가 걷혀요. 못 사고 떠나면 장터가 남아 다시 들를 수 있어요</p>
      <div class="cards">${rows || '<p class="hint">더 살 수 있는 부적이 없어요</p>'}</div>
      <div class="row"><button type="button" class="ghost" data-act="leave">떠나기</button></div>
    </section>`, ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.disabled) return;
      if (b.dataset.i != null) h.buy(+b.dataset.i); else h.leave();
    }, true);
    choiceKey(ev => {
      const n = +ev.key, o = state.choice && state.choice.offers;
      if (ev.key === 'Escape') h.leave();
      else if (o && n >= 1 && n <= o.length && state.purse >= o[n - 1].price) h.buy(n - 1);
    });
  }

  function fusion(state, content, meta, h) {
    const f = T.fusion(content, meta, state.choice.recipe);
    open(`<section class="sheet fusion" role="dialog" aria-modal="true" aria-labelledby="fu-h">
      <h2 id="fu-h">합체 — ${f.a} + ${f.b}</h2><p class="hint">두 갈래 중 하나를 고르세요. 이번 판에서는 바꿀 수 없어요 · <kbd>1</kbd> <kbd>2</kbd></p>
      <div class="cards two">${f.branches.map((b, i) => `<button type="button" class="card branch" data-b="${i}">
        <span class="glyph" aria-hidden="true">${icon(b.icon, b.glyph, 48, b.known ? undefined : 'silhouette')}</span><span class="name">${b.name}</span><span class="how">${b.how}</span>
        <span class="stats">${b.stats}</span><span class="weak">약점: ${b.weak}</span></button>`).join('')}</div>
      <div class="row"><button type="button" class="ghost" data-act="later">나중에</button></div>
    </section>`, ev => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.b != null) h.fuse(+b.dataset.b); else h.later();
    }, true);
    choiceKey(ev => { if (ev.key === '1' || ev.key === '2') h.fuse(+ev.key - 1); });
  }

  function result(res, content, h, unlocks) {
    const names = res.fusions.map(id => content.talismans[id].name).join(', ') || '없음';
    const u = unlocks || {}, nc = (res.curses || []).length;
    const extra = (u.newHeroes || []).map(id => `<dt>새 영웅</dt><dd>${content.heroes[id].name}</dd>`).join('')
      + (u.newTitles || []).map(t => `<dt>새 칭호</dt><dd>${t}</dd>`).join('')
      + (nc ? `<dt>저주</dt><dd>${nc}개 · 엽전 +${Math.round(nc * content.rules.curses.coinBonus * 100)}%</dd>` : '');
    open(`<section class="sheet result" role="dialog" aria-modal="true" aria-labelledby="rs-h">
      <h2 id="rs-h">${res.win ? '퇴치 성공' : '쓰러졌다'}</h2>
      <dl><dt>버틴 시간</dt><dd>${T.mmss(res.t)}</dd><dt>처치</dt><dd>${res.kills}</dd>${res.cause ? `<dt>쓰러뜨린 요괴</dt><dd>${res.cause}</dd>` : ''}${res.mutation ? `<dt>변이</dt><dd>${res.mutation}</dd>` : ''}
      <dt>완성한 합체</dt><dd>${names}</dd><dt>엽전</dt><dd>+${res.coins}</dd>${extra}</dl>
      <p class="goal">${T.nextGoal(res)}</p>
      <div class="row"><button type="button" data-act="again">다시 하기</button><button type="button" class="ghost" data-act="menu">처음으로</button></div>
    </section>`, ev => { const b = ev.target.closest('button'); if (b) h[b.dataset.act](); });
  }

  function menu(h) {
    const card = c => c.unlocked
      ? `<button type="button" class="chapter${h.resume ? ' ghost' : ''}" data-ch="${c.id}"><span class="name">${c.name}</span>${c.cleared ? '<span class="tag">클리어</span>' : ''}</button>`
      : `<button type="button" class="chapter locked" disabled aria-disabled="true"><span class="name">${c.name}</span><span class="reason">${c.reason}</span></button>`;
    open(`<section class="sheet menu" role="dialog" aria-modal="true" aria-labelledby="mn-h">
      <p class="sub">엽전 ${h.coins}${h.title ? ' · ' + h.title : ''}</p>
      <h1 id="mn-h" class="title">부적난무</h1><p class="sub">符籍亂舞 — 저승 문이 열린 조선</p>
      ${h.resume ? '<button type="button" data-act="resume">이어하기</button>' : ''}
      <div class="chapters">${h.cards.map(card).join('')}</div>
      <div class="row"><button type="button" class="ghost" data-act="village">주막거리</button><button type="button" class="ghost" data-act="codex">도감</button></div>
      <button type="button" class="ghost credits-link" data-act="credits">만든 것들</button>
    </section>`, ev => {
      const b = ev.target.closest('button');
      if (!b || b.disabled) return;
      if (b.dataset.act === 'resume') h.resume(); else if (b.dataset.act === 'village') h.village(); else if (b.dataset.act === 'codex') h.codex();
      else if (b.dataset.act === 'credits') credits(() => menu(h));
      else if (b.dataset.ch) h.pick(b.dataset.ch);
    });
  }

  // 출정 화면: 영웅 고르기(aria-pressed), 저주 고르기(허용될 때만, 최대 h.max개). 선택 상태는 화면(DOM)이 들고 있다가 "출정"에서 읽는다
  function prerun(h) {
    const hero = c => `<button type="button" class="card hero" data-hero="${c.id}" aria-pressed="${c.selected && c.unlocked}"${c.unlocked ? '' : ' disabled aria-disabled="true"'}>
      <span class="glyph" aria-hidden="true">${icon(c.icon, c.glyph)}</span><span class="name">${c.name}</span>${c.unlocked ? '' : '<span class="lvl">잠김</span>'}
      <span class="how">${c.desc}</span><span class="stats">시작 부적: ${c.start}</span>${c.unlocked ? '' : `<span class="weak">${c.reason}</span>`}</button>`;
    const curse = c => `<label class="curse"><input type="checkbox" value="${c.id}"${c.checked ? ' checked' : ''}><span class="name">${c.name}</span><span class="how">${c.desc}${c.reaction ? ' · 반응 난이도' : ''}</span></label>`;
    open(`<section class="sheet prerun" role="dialog" aria-modal="true" aria-labelledby="pr-h">
      <h2 id="pr-h">출정</h2><p class="hint">영웅을 고르세요</p>
      <div class="cards">${h.heroes.map(hero).join('')}</div>
      ${h.curses ? `<h3>저주 <span class="hint">(최대 ${h.max}개)</span></h3><div class="curses">${h.curses.map(curse).join('')}</div><p class="hint curse-note" aria-live="polite"></p>` : ''}
      <div class="row"><button type="button" data-act="go">출정</button><button type="button" class="ghost" data-act="back">돌아가기</button></div>
    </section>`, ev => {
      const m = $('modal'), b = ev.target.closest('button'), note = m.querySelector('.curse-note');
      const checked = () => [...m.querySelectorAll('.curses input:checked')];
      if (ev.target.matches && ev.target.matches('.curses input')) {
        if (checked().length > h.max) { ev.target.checked = false; note.textContent = `저주는 ${h.max}개까지만 고를 수 있어요`; return; }
        note.textContent = checked().length ? `결과 엽전 +${Math.round(checked().length * h.bonus * 100)}%` : '';
        return;
      }
      if (!b || b.disabled) return;
      if (b.dataset.hero) { m.querySelectorAll('.hero').forEach(x => x.setAttribute('aria-pressed', String(x === b))); return; }
      if (b.dataset.act === 'back') h.back();
      else if (b.dataset.act === 'go') h.go(m.querySelector('.hero[aria-pressed="true"]').dataset.hero, checked().map(i => i.value));
    });
    const sel = $('modal').querySelector('.hero[aria-pressed="true"]');
    if (!sel) { const f = $('modal').querySelector('.hero:not([disabled])'); if (f) f.setAttribute('aria-pressed', 'true'); }
    const n = $('modal').querySelectorAll('.curses input:checked').length;
    if (n) $('modal').querySelector('.curse-note').textContent = `결과 엽전 +${Math.round(n * h.bonus * 100)}%`;
  }

  function start(state, content, h) {
    const cards = state.choice.options.map(o => T.option(content, state, o));
    open(`<section class="sheet" role="dialog" aria-modal="true" aria-labelledby="st-h">
      <h2 id="st-h">시작 부적</h2><p class="hint">처음 가져갈 부적 한 장을 고르세요 · <kbd>1</kbd>–<kbd>${cards.length}</kbd></p>
      <div class="cards">${cards.map(cardHtml).join('')}</div>
    </section>`, ev => { const b = ev.target.closest('button'); if (b && b.dataset.i != null) h.choose(+b.dataset.i); }, true);
    choiceKey(ev => { const n = +ev.key; if (n >= 1 && n <= cards.length) h.choose(n - 1); });
  }

  // 만든 것들: LICENSES/README.txt와 같은 내용. 라이선스 원문은 LICENSES/ 파일 링크로 연다
  function credits(back) {
    const ext = [
      ['PixiJS 8.6.6', 'MIT', 'https://github.com/pixijs/pixijs', 'LICENSES/PixiJS-MIT.txt'],
      ['갈무리(Galmuri) 2.40.3', 'SIL OFL 1.1', 'https://github.com/quiple/galmuri', 'LICENSES/Galmuri-OFL.txt'],
      ['고운바탕', 'SIL OFL 1.1', 'https://fonts.google.com/specimen/Gowun+Batang', null],
      ['IBM Plex Sans KR', 'SIL OFL 1.1', 'https://fonts.google.com/specimen/IBM+Plex+Sans+KR', null],
    ];
    open(`<section class="sheet credits" role="dialog" aria-modal="true" aria-labelledby="cr-h">
      <h2 id="cr-h">만든 것들</h2>
      <p class="sub">그림·효과음·음악은 이 게임을 위해 새로 만들었습니다.</p>
      <h3>가져다 쓴 것</h3>
      <ul class="credit-list">${ext.map(([n, l, src, file]) => `<li><span class="name">${n}</span><span class="lic">${l}</span>
        <span class="links"><a href="${src}" target="_blank" rel="noopener">출처</a>${file ? ` · <a href="${file}" target="_blank" rel="noopener">라이선스 원문</a>` : ''}</span></li>`).join('')}</ul>
      <p class="hint">고운바탕과 IBM Plex Sans KR은 Google Fonts에서 불러옵니다. 갈무리 법적 고지: <a href="LICENSES/Galmuri-NOTICE.txt" target="_blank" rel="noopener">Galmuri-NOTICE.txt</a> · 전체 목록: <a href="LICENSES/README.txt" target="_blank" rel="noopener">LICENSES/README.txt</a></p>
      <div class="row"><button type="button" class="ghost" data-act="back">돌아가기</button></div>
    </section>`, ev => { const b = ev.target.closest('button'); if (b && b.dataset.act === 'back') back(); });
  }

  function village(h) {
    const dots = c => '●'.repeat(c.lv) + '○'.repeat(c.max - c.lv);
    const card = c => `<div class="facility"><span class="glyph" aria-hidden="true">${c.glyph}</span><span class="name">${c.name}</span><span class="dots" role="img" aria-label="${c.lv}단계 / ${c.max}">${dots(c)}</span>
      <span class="how">${c.desc}</span><span class="stats">${c.cost == null ? '최고 단계' : `다음: ${c.nextDesc} · 엽전 ${c.cost}`}</span>
      ${c.cost == null ? '' : `<button type="button" data-up="${c.id}"${c.affordable ? '' : ' disabled aria-disabled="true"'}>올리기</button>`}</div>`;
    open(`<section class="sheet village" role="dialog" aria-modal="true" aria-labelledby="vl-h">
      <h2 id="vl-h">주막거리</h2><p class="hint">가진 엽전 <span class="purse">${h.coins}</span></p>
      <div class="facilities">${h.cards.map(card).join('')}</div>
      <div class="row"><button type="button" class="ghost" data-act="back">돌아가기</button></div>
    </section>`, ev => {
      const b = ev.target.closest('button');
      if (!b || b.disabled) return;
      if (b.dataset.up) h.upgrade(b.dataset.up); else h.back();
    });
  }

  function codex(h) {
    const tabs = [['enemies', '요괴'], ['talismans', '부적'], ['fusions', '합체']];
    const art = (tab, x) => (tab === 'enemies' ? 'e:' : 'i:') + x.id;
    const item = (tab, x) => {
      if (x.found) return `<li class="entry"><span class="glyph" aria-hidden="true">${icon(art(tab, x), x.glyph, 32)}</span><span class="name">${x.name}</span>${x.how ? `<span class="how">${x.how}</span>` : ''}</li>`;
      return `<li class="entry unseen"><span class="glyph" aria-hidden="true">${icon(art(tab, x), '?', 32, 'silhouette')}</span><span class="name">???</span>${tab === 'fusions' && x.how ? `<span class="how">${x.how}</span>` : ''}</li>`;
    };
    function render(tab) {
      const c = h.codex;
      open(`<section class="sheet codex" role="dialog" aria-modal="true" aria-labelledby="cx-h">
        <h2 id="cx-h">도감</h2><p class="hint">수집률 ${Math.floor(c.pct * 100)}% (${c.found}/${c.total})</p>
        <div role="tablist" class="tabs">${tabs.map(([id, n]) => `<button type="button" role="tab" class="ghost" id="tab-${id}" aria-selected="${id === tab}" data-tab="${id}">${n} ${c[id].filter(x => x.found).length}/${c[id].length}</button>`).join('')}</div>
        <ul class="entries" role="tabpanel" aria-labelledby="tab-${tab}">${c[tab].map(x => item(tab, x)).join('')}</ul>
        <ul class="rewards">${h.rewards.map(r => `<li class="${h.titles.includes(r.title) ? 'got' : ''}">${Math.round(r.at * 100)}% · ${r.title}${h.titles.includes(r.title) ? ' (획득)' : ''}</li>`).join('')}</ul>
        <div class="row"><button type="button" class="ghost" data-act="back">돌아가기</button></div>
      </section>`, ev => {
        const b = ev.target.closest('button');
        if (!b) return;
        if (b.dataset.tab) { render(b.dataset.tab); const t = $('modal').querySelector('[aria-selected="true"]'); if (t) t.focus({ preventScroll: true }); } else h.back();
      });
    }
    render('enemies');
  }

  // 복귀: 탭 한 번 → 3·2·1 → onResume. 복귀 탭은 오버레이가 받으므로 이동 입력으로 새지 않는다(스펙 8절).
  let countdown = null; // 3·2·1이 도는 동안의 타이머 id
  function stopCountdown() { if (countdown != null) { clearInterval(countdown); countdown = null; } }
  let showTap = null;
  function pause(onResume) {
    const o = $('overlay');
    showTap = () => {
      stopCountdown();
      o.hidden = false;
      o.innerHTML = '<button type="button" class="resume-tap">탭해서 계속</button>';
      o.querySelector('button').focus({ preventScroll: true });
      o.onclick = () => {
        o.onclick = null;
        let n = 3;
        o.innerHTML = `<div class="count" aria-live="assertive">${n}</div>`;
        countdown = setInterval(() => {
          n--;
          if (n > 0) { o.querySelector('.count').textContent = n; return; }
          stopCountdown();
          o.hidden = true; o.innerHTML = '';
          onResume();
        }, 700);
      };
    };
    showTap();
  }
  // 카운트다운 중 탭이 숨겨지면: 타이머를 끊고 "탭해서 계속"으로 되돌린다. 카운트다운 중이 아니면 false.
  function cancelCountdown() { if (countdown == null) return false; showTap(); return true; }

  // 알림은 한 번에 하나씩(보스 예고와 사건 안내가 겹치지 않게, 스펙 8절)
  const queue = [];
  let showing = false;
  function toast(msg) { queue.push(msg); if (!showing) nextToast(); }
  function nextToast() {
    const el = $('toasts'), m = queue.shift();
    if (!m) { showing = false; el.textContent = ''; return; }
    showing = true;
    el.textContent = m;
    setTimeout(nextToast, 2200);
  }

  return { levelup, market, fusion, result, menu, prerun, start, village, codex, credits, pause, toast, hideChoice, hideAll, cancelCountdown };
})();
