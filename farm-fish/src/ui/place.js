  // ---------- 지금 있는 곳: the place tag under the header and the arrival card ----------
  // One name table for every view (the canvas aria-label reads it too). The 'farm' view is named by its fishing spot
  // (L.SPOTS names), home-made camp views by L.CMP_SITES, a resident's room by the resident.
  var PLC_VIEW = { yard: '마당', house: '집 안', forest: '숲', orchard: '과수원', village: '마을', flat: '갯벌', cave: '동굴', stars: '별 잇기',
    island: '섬', deep: '깊은 숲', peak: '산꼭대기', farisle: '먼 섬', port: '옛 포구', museum: '박물관', dive: '잠수',
    trnvalley: '산골 계곡', trnonsen: '온천 마을', trnsnow: '설원 고개', trnride: '기차 안' };
  // a spot whose plain name is also a view's name gets told apart (the 섬 scene vs fishing off its 부두); spotName() reads it
  var PLC_SPOT = { island: '섬 부두', valley: '산골 계곡 물가' };
  var PLC_SALT = { sea: true, island: true, offshore: true, ocean: true, cmpshore: true };
  function placeName(v) {
    if (v === 'farm') return spotName(scene);
    if (v === 'home') return vilCur ? L.residentById(vilCur).name + ' 집 안' : '집 안';
    if (v === 'dive' && dv) return '잠수 · ' + DIVE_ZONE[L.diveRoom(dv.room).zone];
    if (cmpIsView(v)) return cmpViewName(v);
    return PLC_VIEW[v] || '집 안';
  }
  // the canvas label: on the farm it also says the 밭 is there (not on a trip's water)
  function plcAria(v) { return v === 'farm' && !SCENES[scene].trip ? '밭과 ' + placeName(v) : placeName(v); }

  var plcTag = document.createElement('div');
  plcTag.id = 'plcTag'; plcTag.setAttribute('aria-hidden', 'true');   // the canvas aria-label already says it
  var plcBanner = document.createElement('div');
  plcBanner.id = 'plcBanner'; plcBanner.setAttribute('aria-hidden', 'true');
  var plcBannerB = document.createElement('b'), plcBannerS = document.createElement('span');
  plcBanner.appendChild(plcBannerB); plcBanner.appendChild(plcBannerS);
  app.appendChild(plcTag); app.appendChild(plcBanner);
  var plcKey = '', plcName = '', plcTimer = 0;
  // every logic tick and after goScene: rename the tag; a new view or a new fishing spot shows the card (not at boot,
  // not in a dive or the 별 잇기 puzzle, not over the reel or a minigame)
  function plcTick() {
    if (!plcTag) return;   // a goScene while the files above still load
    var nm = placeName(view), key = view + '|' + (view === 'farm' ? scene : view === 'home' ? vilCur : '');
    if (nm !== plcName) { plcName = nm; plcTag.textContent = nm; }
    if (key === plcKey) return;
    var first = !plcKey;
    plcKey = key;
    if (first || reel || mini || chal || rideOn() || arcOn() || view === 'dive' || view === 'stars') return;
    sfx('whoosh');
    plcBannerB.textContent = nm;
    plcBannerS.textContent = view === 'farm' ? (PLC_SALT[scene] ? '바다 물고기' : '민물고기') : '';
    plcBannerS.hidden = view !== 'farm';
    plcBanner.classList.add('on');
    clearTimeout(plcTimer); plcTimer = setTimeout(function () { plcBanner.classList.remove('on'); }, 1500);
  }
