// 부적난무 — 진입점: 저장 불러오기, 메뉴, 게임 루프, 선택 창·결과·일시정지 연결, 저장 시점(스펙 9.2).
(async function bjMain() {
  const C = BJ_CONTENT, SIM = BJ_SIM, SK = BJ_SKILLS, SAVE = BJ_SAVE, M = BJ_MODALS;
  const params = new URLSearchParams(location.search);
  const store = (function () {
    try { const s = window.localStorage; s.setItem('bujeok.probe', '1'); s.removeItem('bujeok.probe'); return s; }
    catch (e) { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } }; }
  })();
  const stage = document.getElementById('stage');
  const view = await BJ_RENDER.create(stage, C);
  const input = BJ_INPUT.attach(stage);
  const hud = BJ_HUD.create(document.getElementById('hud'), C);
  const log = BJ_LOG.create();
  const perf = { frameMs: 0, saveMs: 0 }, devFlags = { invincible: false };
  let meta = SAVE.loadMeta(store);
  let state = null, acc = 0, last = performance.now(), paused = false, saveClock = 0, shownChoice;
  const audio = BJ_AUDIO.create(C.sfx, C.music), muted0 = !!(meta.settings && meta.settings.muted); audio.setMuted(muted0); hud.setMuted(muted0); // settings 없는 meta(옛 save.js 캐시·손댄 저장)도 견딘다
  // song: 지금 화면이 원하는 곡. 탭이 숨겨지면 멈췄다가 돌아오면 이것을 다시 튼다.
  let song = null, heardChoice = null, prevXp = 0, prevLv = 0;
  const music = id => { song = id; audio.track(id); };

  function save() {
    if (!state || state.over) return;
    const t0 = performance.now();
    hud.saveFailed(!SAVE.write(store, 'run', state, C.version));
    perf.saveMs = performance.now() - t0;
  }

  function begin(s) {
    state = s; acc = 0; saveClock = 0; shownChoice = undefined; paused = false;
    prevXp = s.player.xp; prevLv = s.player.level; heardChoice = s.choice;
    M.hideAll(); hud.show(true);
    music(s.chapterId);
  }

  function newRun(chapterId, heroId = meta.lastHero || 'yeonhwa', curses = []) {
    const seed = params.has('seed') ? Number(params.get('seed')) >>> 0 : (Math.random() * 2 ** 32) >>> 0;
    begin(SIM.create(C, { seed, heroId, chapterId, runId: Date.now().toString(36) + '-' + seed.toString(36), perks: BJ_META.perks(C, meta), curses }));
    BJ_LOG.push(log, { type: 'run_start', chapterId, seed, t: 0 });
    save();
  }

  function menu(resumable) {
    state = null; hud.show(false); music('menu');
    meta = SAVE.loadMeta(store); // 결과 화면에서 새로 클리어한 챕터를 바로 보여 준다
    M.menu({
      resume: resumable ? () => { begin(resumable); pause(); } : null,
      coins: meta.coins, title: meta.titles[meta.titles.length - 1],
      pick: id => prerun(id), village: villageScreen, codex: codexScreen,
      cards: BJ_TEXT.chapterCards(C, meta, params.has('dev')),
    });
  }

  function prerun(chapterId) {
    M.prerun({
      heroes: BJ_TEXT.heroCards(C, meta),
      curses: BJ_META.cursesAllowed(C, meta, chapterId) ? BJ_TEXT.curseCards(C, meta, chapterId) : null,
      max: C.rules.curses.max, bonus: C.rules.curses.coinBonus,
      go: (heroId, curses) => newRun(chapterId, heroId, curses), back: () => menu(null),
    });
  }

  function villageScreen() {
    M.village({
      cards: BJ_TEXT.villageCards(C, meta), coins: meta.coins,
      upgrade: id => { meta = SAVE.loadMeta(store); if (BJ_META.upgrade(C, meta, id)) SAVE.write(store, 'meta', meta, C.version); villageScreen(); },
      back: () => menu(null),
    });
  }

  function codexScreen() {
    M.codex({ codex: BJ_META.codex(C, meta), rewards: C.codex.rewards, titles: meta.titles, back: () => menu(null) });
  }

  function finish() {
    const res = SIM.result(state, C);
    meta = SAVE.loadMeta(store); // 다른 탭이 쓴 엽전·발견 기록을 덮어쓰지 않게 지급 직전에 다시 읽는다
    let unlocks = { newTitles: [], newHeroes: [] };
    const before = { ...meta.cleared };
    if (SAVE.grant(meta, res)) { unlocks = BJ_META.record(C, meta, res, before); SAVE.write(store, 'meta', meta, C.version); }
    SAVE.clearRun(store);
    BJ_LOG.push(log, { type: 'run_end', win: res.win, t: res.t, kills: res.kills });
    state = null; hud.show(false); M.hideChoice(); music(null);
    M.result(res, C, { again: () => newRun(res.chapterId, res.heroId, res.curses), menu: () => menu(null) }, unlocks);
  }

  function pause() {
    if (!state || paused) return;
    paused = true;
    save(); music(null);
    M.pause(() => { input.reset(); paused = false; last = performance.now(); if (state) music(state.chapterId); });
  }

  function syncChoice() {
    const c = state.choice;
    if (c === shownChoice) return;
    shownChoice = c;
    if (!c) { M.hideChoice(); return; }
    if (c.kind === 'levelup') {
      if (c !== heardChoice) audio.play('levelup'); // 다시 뽑기·버리기로 같은 창을 다시 그릴 때는 울리지 않는다
      heardChoice = c;
      M.levelup(state, C, {
        choose: i => SK.choose(state, C, i),
        reroll: () => { SK.reroll(state, C); shownChoice = undefined; },
        discard: i => { SK.discard(state, C, i); shownChoice = undefined; },
      });
    } else if (c.kind === 'start') {
      M.start(state, C, { choose: i => SK.chooseStart(state, C, i) });
    } else if (c.kind === 'market') {
      M.market(state, C, { buy: i => { SK.buy(state, C, i); shownChoice = undefined; }, leave: () => SK.leaveMarket(state, C) });
    } else {
      M.fusion(state, C, meta, { fuse: b => SK.fuse(state, C, b), later: () => SK.postpone(state, C) });
    }
  }

  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.25);
    last = now;
    const t0 = performance.now();
    if (state) {
      if (!paused && !state.choice && !state.over) acc = BJ_LOOP.advance(acc, dt, h => SIM.step(state, C, input.read(), h));
      if (devFlags.invincible) state.player.invuln = 1;
      for (const ev of state.fx.events) {
        BJ_LOG.push(log, ev);
        if (ev.type === 'fusion' || ev.type === 'boss_kill') save();
        if (ev.type === 'fusion' || ev.type === 'boss_kill') view.kick('big');
        if (ev.type === 'fusion') audio.play('fusion');
        else if (ev.type === 'boss') audio.play('boss');
        else if (ev.type === 'boss_kill') audio.play('kill');
      }
      state.fx.events.length = 0;
      for (const n of state.fx.notices) M.toast(n);
      state.fx.notices.length = 0;
      // 소리: render가 fx 기록을 그린 뒤 비우므로 draw 앞에서 읽는다
      if (state.fx.hits.length) audio.play('hit');
      if (state.fx.kills.length) audio.play('kill');
      if (state.fx.hurts.length) audio.play('hurt');
      const p = state.player;
      if (p.level > prevLv || p.xp > prevXp) audio.play('gem');
      prevXp = p.xp; prevLv = p.level;
      view.draw(state, paused ? 0 : dt, input.stick());
      hud.update(state);
      syncChoice();
      if (!paused) { saveClock += dt; if (saveClock >= 30) { saveClock = 0; save(); } }
      if (state.over) finish();
    } else view.draw(null, dt, null);
    perf.frameMs = performance.now() - t0;
    requestAnimationFrame(frame);
  }

  hud.onPause(pause);
  hud.onFusion(r => { if (state) SK.openFusion(state, C, r); });
  hud.onMute(() => {
    const on = !audio.muted;
    audio.setMuted(on); hud.setMuted(on);
    meta = SAVE.loadMeta(store); meta.settings = meta.settings || {}; meta.settings.muted = on; // 다른 탭이 쓴 meta를 덮어쓰지 않게 다시 읽고 쓴다
    SAVE.write(store, 'meta', meta, C.version);
    audio.play('ui');
  });
  // 브라우저는 사용자 입력 안에서만 소리를 열어 준다. 매번 불러도 된다(멈춘 컨텍스트 재개).
  for (const type of ['pointerdown', 'touchstart', 'touchend', 'keydown']) document.addEventListener(type, () => audio.unlock(), true);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { audio.track(song); return; }
    audio.track(null);
    M.cancelCountdown(); // 3·2·1 도중이면 멈추고 다시 "탭해서 계속"
    if (paused) save(); else pause(); // 이미 멈춘 상태여도 숨겨질 때마다 저장한다
  });
  window.addEventListener('pagehide', () => { if (state) save(); }); // iOS는 탭을 닫을 때 visibilitychange 없이 pagehide만 줄 수 있다
  if (params.has('dev')) BJ_DEV.attach({ get: () => state, set: s => begin(s), content: C, log, store, perf, flags: devFlags });

  const saved = SAVE.loadRun(store, C.version);
  if (saved && saved.discarded) M.toast('업데이트로 이전 판은 이어할 수 없어요');
  if (saved && saved.state) menu(saved.state);
  else if (!meta.tutorialDone) newRun('tutorial');
  else menu(null);
  requestAnimationFrame(frame);
})();
