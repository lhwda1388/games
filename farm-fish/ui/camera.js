  // ---------- 사진기 (stage 7): corner button that lights up on a moment, white flash, 도감 앨범, 상점 row, FF.camera ----------
  // Every tick the screen is described as a plain ctx and L.shotsNow says which album slots could be taken right now.
  var camBtn = document.createElement('button');
  camBtn.type = 'button'; camBtn.id = 'camBtn'; camBtn.hidden = true; camBtn.setAttribute('aria-label', '사진 찍기');
  var camDot = document.createElement('i'); camDot.className = 'dot'; camDot.hidden = true;
  camBtn.appendChild(camIcon()); camBtn.appendChild(camDot);
  app.appendChild(camBtn);
  var camFlash = document.createElement('div'); camFlash.id = 'camFlash'; camFlash.setAttribute('aria-hidden', 'true');
  app.appendChild(camFlash);
  var camShots = [], camLegend = null, camLanded = null;

  function camIcon() {
    var c = document.createElement('canvas'); c.width = 14; c.height = 10;
    var saved = ctx; ctx = c.getContext('2d');
    try {
      px(1, 2, 12, 8, 4); px(4, 0, 5, 2, 4); px(2, 3, 10, 6, 0); px(10, 3, 2, 1, 4);
      px(5, 4, 4, 4, 4); px(6, 5, 2, 2, 2); px(6, 5, 1, 1, 0);
    } finally { ctx = saved; }
    return c;
  }
  // a frame with a dot in the corner: the album icon (empty frame = not taken yet)
  function shotIcon(id, got) {
    var c = document.createElement('canvas'); c.width = 14; c.height = 14;
    var saved = ctx; ctx = c.getContext('2d');
    try {
      px(1, 2, 12, 10, got ? 4 : 2); px(2, 3, 10, 8, 0);
      if (got) {
        var h = 0; for (var k = 0; k < id.length; k++) h = (h * 31 + id.charCodeAt(k)) | 0;
        px(2, 8, 10, 3, 2); px(3 + Math.floor(hash(h) * 5), 4, 3, 3, 3); px(8, 7, 3, 1, 3);
      }
    } finally { ctx = saved; }
    return c;
  }

  // what is on screen now, as the pure ctx L.shotsNow reads
  function camCtx(t) {
    var e = curEnv(t), p = performance.now(), sc = view, tt = p / 1000;
    var vis = S.yard.vis.filter(function (v) {
      var slot = L.visitorById(v.id).slot;
      return sc === 'farm' ? slot === 'pond' && L.curSpot(S) === 'pond' : sc === 'yard' && slot !== 'pond';
    }).map(function (v) { return v.id; });
    var c = { scene: sc, phase: e.phase, season: e.season, weather: e.weather, festival: e.festival, vis: vis };
    if (camLanded && p - camLanded.at < 12e3) c.landed = camLanded.id;
    if (flatLastDug && p - flatLastDug.at < 12e3) c.dug = flatLastDug.id;
    if (S.pet && (sc === 'farm' || sc === 'yard') && petPose(tt, sc).mode === 'sleep') c.petNap = true;
    if (sc === 'yard' && L.decoPlaced(S, 'snowman')) c.snowman = true;
    if (sc === 'flat') c.low = !!tideNow(t).low;
    if (sc === 'forest' && e.phase === 'night' && S.forest && S.forest.spots.some(function (q) { return q.id === 'glowmoss'; })) c.glowmoss = true;
    stage7BShotCtx(c); isleShotCtx(c);   // 유성우, 동굴, 화석 완성, 섬 등대
    return c;
  }
  // a 전설 fish just landed: its 도감 count went up since the last tick
  function camWatchLegend() {
    var now1 = {};
    L.FISH.forEach(function (f) { if (f.rarity === '전설') now1[f.id] = S.dex.fish[f.id] ? S.dex.fish[f.id].n : 0; });
    if (camLegend) Object.keys(now1).forEach(function (id) { if (now1[id] > (camLegend[id] || 0)) camLanded = { id: id, at: performance.now() }; });
    camLegend = now1;
  }
  function tickCameraUI(t) {
    camWatchLegend();
    var own = L.camOk(S);
    camBtn.hidden = !own;
    if (!own || boss) return;
    camShots = L.shotsNow(camCtx(t));
    var fresh = camShots.some(function (id) { return !S.cam.album[id]; });
    camBtn.classList.toggle('on', camShots.length > 0);
    camDot.hidden = !fresh;
    camBtn.setAttribute('aria-label', camShots.length ? (fresh ? '사진 찍기 · 앨범에 없는 장면' : '사진 찍기 · 찍을 만한 순간') : '사진 찍기');
  }
  function camFlashNow() {
    camFlash.classList.remove('go'); void camFlash.offsetWidth; camFlash.classList.add('go');
  }
  camBtn.addEventListener('click', function () {
    if (!L.camOk(S) || reel) return;
    tickCameraUI(now());
    camFlashNow();
    var got = [];
    camShots.forEach(function (id) { var r = L.takeShot(S, id, now()); if (r && r.first) got.push(L.shotById(id).name); });
    if (got.length) toast('찰칵 · 앨범에 「' + got.join('」「') + '」 · ' + L.albumCount(S) + ' / ' + L.SHOTS.length, 3200);
    else if (camShots.length) toast('찰칵 · 이미 앨범에 있는 장면이에요', 2000);
    else toast('찰칵 · 사진기가 반짝일 때 찍으면 앨범에 남아요', 2400);
    refresh(); tickCameraUI(now());
  });

  // ---------- 도감 앨범 ----------
  function renderAlbumDex(row) {
    var h3 = document.createElement('h3'); h3.textContent = '앨범';
    var b = document.createElement('b'); b.textContent = L.albumCount(S) + ' / ' + L.SHOTS.length; h3.appendChild(b);
    dexEl.appendChild(h3);
    if (!L.camOk(S)) { var p = document.createElement('p'); p.className = 'note'; p.textContent = '상점에서 사진기를 사면 반짝이는 순간을 앨범에 모을 수 있어요'; dexEl.appendChild(p); }
    L.SHOTS.forEach(function (s1) {
      var at = S.cam && S.cam.album[s1.id], ic = shotIcon(s1.id, !!at); ic.className = 'sq';
      var d = at ? new Date(at) : null;
      row(ic, at ? s1.name : '???', s1.hint, d ? (d.getMonth() + 1) + '/' + d.getDate() : '', !at);
    });
  }

  // ---------- 상점: 사진기 ----------
  function renderCameraShop() {
    var h3 = document.createElement('h3'); h3.textContent = '사진'; shopEl.appendChild(h3);
    var own = L.camOk(S), r = document.createElement('div'); r.className = 'up';
    var n = document.createElement('div'); n.className = 'n'; n.textContent = '사진기';
    var sm = document.createElement('small');
    sm.textContent = own ? '오른쪽 위 사진기가 반짝이면 찰칵 · 앨범 ' + L.albumCount(S) + ' / ' + L.SHOTS.length : '손님·무지개·축제 같은 순간을 앨범에 모은다';
    n.appendChild(sm);
    var bt = document.createElement('button'); bt.type = 'button';
    if (own) { bt.textContent = '있음'; bt.disabled = true; bt.className = 'max'; }
    else {
      bt.textContent = L.CAMERA_COST.toLocaleString('ko-KR'); bt.setAttribute('aria-label', '사진기 사기 ' + L.CAMERA_COST + '코인');
      if (S.coins < L.CAMERA_COST) bt.classList.add('poor');
      bt.addEventListener('click', function () {
        var res = L.buyCamera(S);
        if (!res.ok) { toast(WHY[res.why] || '살 수 없어요'); bt.classList.remove('shake'); void bt.offsetWidth; bt.classList.add('shake'); return; }
        toast('사진기 · 오른쪽 위 버튼이 반짝이면 찍을 순간이에요', 3000); refresh(); renderShop(); tickCameraUI(now());
      });
    }
    r.appendChild(camIcon()); r.appendChild(n); r.appendChild(bt); shopEl.appendChild(r);
  }

  // ---------- console hooks ----------
  function addCameraHooks(FF) {
    // FF.camera() gives the camera; FF.camera('all') fills the album; FF.shots() = what could be taken now
    FF.camera = function (all) {
      if (!L.camOk(S)) { S.coins += L.CAMERA_COST; L.buyCamera(S); }
      if (all === 'all') L.SHOTS.forEach(function (p) { L.takeShot(S, p.id, now()); });
      refresh(); tickCameraUI(now()); return L.albumCount(S);
    };
    FF.shots = function () { return L.shotsNow(camCtx(now())); };
  }
