  // ---------- boot ----------
  renderTray();
  fit();
  startLoop();
  tick();
  diaryBoot();       // stage 8: 자리 비운 사이 일기 from the catch-up that tick just did
  booted = true;
  if (saveBlocked) toast('저장을 읽지 못했어요 · 원본은 그대로 보관 · 이번엔 저장 안 됨', 8000);
  else if (fresh) toast('빈 밭을 눌러 무 심기 · 연못을 눌러 낚시', 4000);
  else {
    var ready = S.plots.filter(L.isReady).length;
    toast(ready ? '다녀오셨어요 · 수확할 작물 ' + ready + '개' : '다녀오셨어요', 3000);
  }
  if (SPEED !== 1) setTimeout(function () { toast('디버그 속도 ×' + SPEED + ' (별도 저장)', 2500); }, 3100);
  if (L.checkMilestones(S).length) save();     // saves from before milestones existed: unlock silently

  // console hooks for testing
  globalThis.FF = {
    get state() { return S; },
    get reel() { return reel; },
    now: now,
    forceBite: function () { if (S.fish.phase === 'wait') S.fish.biteAt = now(); },
    forceNibble: function () { if (S.fish.phase === 'wait') { S.fish.nibAt = now(); S.fish.biteAt = Math.max(S.fish.biteAt, now() + 10e3 * SPEED); } },
    coins: function (n) { S.coins += n; refresh(); },
    forceEvent: function () { S.nextEventAt = now(); },
    giveGold: function () { S.seeds.gold++; S.dex.goldSeed = true; renderTray(); },
    grow: function () { S.plots.forEach(function (p) { if (p.crop) p.progress = L.CROPS[p.crop].grow; }); },
    give: function (id, n) { for (var k = 0; k < (n || 1); k++) L.bagAdd(S, id, L.itemInfo(id).price); refresh(); },
    fillBag: function () { while (S.bag.length < L.bagCap(S)) L.bagAdd(S, 'radish', 30); refresh(); },
    rep: function (n) { S.rep += n; var u = L.checkUnlocks(S); refresh(); return u; },
    unlockSeeds: function () { Object.keys(L.SEED_UNLOCK).forEach(function (k) { S.seedOk[k] = true; }); refresh(); },
    newOrders: function () { S.orders.forEach(function (q) { q.o = null; q.at = 0; }); L.refreshOrders(S, now(), Math.random); refresh(); return S.orders; },
    special: function (k) { var o; do { o = L.genOrder(S, Math.random); } while (!o.special); S.orders[k || 0] = { o: o, at: 0 }; refresh(); return o; },
    cookDone: function () { if (S.pot) S.pot.until = now(); },
    openBag: openBag,
    save: save
  };
  addSkyHooks(globalThis.FF);
  addYardHooks(globalThis.FF);
  addForestHooks(globalThis.FF);   // stage 5A: FF.forest(), FF.forage(all)
  addStage7BHooks(globalThis.FF);  // stage 7: FF.cave, FF.caveE, FF.fossil, FF.sky, FF.stars, FF.meteor
  addPetHooks(globalThis.FF);      // stage 5A: FF.pet(kind)
  addJunkHooks(globalThis.FF);   // stage 5B: FF.junk, FF.letter, FF.pick
  addFestHooks(globalThis.FF);   // stage 5B: FF.festival, FF.fest, FF.heat
  addStage6Hooks(globalThis.FF); // stage 6A: FF.orchard, FF.bees, FF.bug
  addVillageHooks(globalThis.FF); // stage 6B: FF.village(), FF.visit(id), FF.vilReset()
  addFlatHooks(globalThis.FF); addCameraHooks(globalThis.FF);   // stage 7 ①: FF.flat/tide/flatFind, FF.camera/shots
  addGuideHooks(globalThis.FF);   // 놀거리 수첩: FF.guide(), FF.guide('reset')
  addIsleHooks(globalThis.FF);    // stage 7 섬: FF.isle(), FF.drift(id), FF.lighthouse(k)
  addShipHooks(globalThis.FF);    // stage 9 ①: FF.ship(t), FF.far(id)
  addEventsHooks(globalThis.FF);  // stage 8 ①: FF.boom, FF.boomNext, FF.day, FF.diary
  addMuseumHooks(globalThis.FF);  // stage 7 박물관: FF.museum(room), FF.museumFill(room, left)
  addTemperHooks(globalThis.FF);  // stage 8 ② 손맛: FF.temper(id), FF.records(), FF.hookFish(id, size)
  addTreasureHooks(globalThis.FF); // stage 8 ③: FF.tmap(id), FF.rumor(n), FF.dig(id)
  addDonkeyHooks(globalThis.FF);  // stage 9 ②: FF.donkey(lv), FF.mount(place)
  addGardenHooks(globalThis.FF);  // stage 10 ②: FF.garden(cmd), FF.baby(kind), FF.scare()
  addRideHooks(globalThis.FF);     // stage 9 ③: FF.ride(kind), FF.rideTap(), FF.rideState()
  addToyHooks(globalThis.FF); addQuestHooks(globalThis.FF);   // stage 10 ④: FF.toy(), FF.quest(cmd)
  addContestHooks(globalThis.FF);  // stage 10 ①: FF.contest(frac|'end'), FF.year('end')
  addTownHooks(globalThis.FF);     // stage 10 ③: FF.town(id) moves a new resident in, FF.town() who is out where
  // stage 4 hooks
  globalThis.FF.daily = function (done) {
    if (done) S.daily.goals.forEach(function (g) { g.p = g.n; });
    if (done === 'reset') { delete S.daily; }
    tickDaily(now()); refresh();
    return S.daily && S.daily.goals.map(function (g) { return L.dailyText(g) + ' ' + g.p + '/' + g.n; });
  };
  globalThis.FF.friend = function (code) { return code === undefined ? myCode() : L.decodeShare(code); };
  globalThis.FF.tank = function (fill) {
    if (fill) L.FISH.slice(0, L.tankCap(S)).forEach(function (f) { if (L.tankList(S).length < L.tankCap(S)) { S.tank = S.tank || []; S.tank.push({ id: f.id, v: f.price }); } });
    refresh(); return L.tankList(S);
  };
  globalThis.FF.res = function (id, n) {
    var o = null;
    for (var k = 1; k < 200 && !o; k++) { var c = { id: id === 'chef' ? 'jam' : id === 'fisher' ? 'crucian' : 'radish', n: k, reward: 60 * k }; if (L.residentFor(c) === id) o = c; }
    if (id === 'painter') o = { id: 'carp', n: 1, reward: 900, special: true };
    var ups = []; for (var j = 0; j < (n || 1); j++) ups = ups.concat(L.befriend(S, o).ups);
    refresh(); return ups;
  };
  globalThis.FF.born = function (daysAgo) { S.born = now() - (daysAgo || 0) * 86400e3; refresh(); return L.farmYear(S, now()); };
