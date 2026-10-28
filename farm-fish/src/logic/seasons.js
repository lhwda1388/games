  // ---------- 계절 콘텐츠: seasonal crops and fish (game-clock seasons: 1 season = 1 real week) ----------
  // A seasonal seed is open from the start but can only be planted in its season; a crop already in the
  // ground keeps growing when the season turns. Seasonal fish use the fish table's `season` field.
  var SEASON_CROPS = [
    { id: 'ssuk',        name: '쑥',     grow: 240e3,  cost: 25, sell: 95,  season: 'spring', hint: '봄 들판의 첫 나물' },
    { id: 'cucumber',    name: '오이',   grow: 420e3,  cost: 35, sell: 140, season: 'summer', hint: '여름 덩굴에 주렁주렁' },
    { id: 'sweetpotato', name: '고구마', grow: 900e3,  cost: 60, sell: 250, season: 'autumn', hint: '가을 흙 속에서 굵어진다' },
    { id: 'cabbage',     name: '배추',   grow: 1500e3, cost: 90, sell: 420, season: 'winter', hint: '겨울 서리를 맞아 달아진다' }
  ];
  SEASON_CROPS.forEach(function (c) { CROPS[c.id] = c; SEEDS.push(c.id); });

  // 2–3 per season across the three spots (연못 has no `spot`)
  [
    { id: 'bitterling', name: '납자루', rarity: '흔함', w: 30, min: 5,  max: 10, power: 0.8, price: 45,  season: 'spring', hint: '봄 연못 · 조개 곁에 알을 낳는다' },
    { id: 'shad',       name: '웅어',   rarity: '드묾', w: 18, min: 18, max: 30, power: 1.2, price: 180, spot: 'river', season: 'spring', hint: '봄이면 강을 거슬러 오른다' },
    { id: 'webfoot',    name: '주꾸미', rarity: '드묾', w: 20, min: 10, max: 22, power: 1.1, price: 200, spot: 'sea', season: 'spring', hint: '봄 바다 · 소라 껍데기에 숨는다' },
    { id: 'killifish',  name: '송사리', rarity: '흔함', w: 30, min: 2,  max: 5,  power: 0.7, price: 30,  season: 'summer', hint: '여름 연못 물가에 떼로' },
    { id: 'sweetfish',  name: '은어',   rarity: '드묾', w: 18, min: 12, max: 25, power: 1.1, price: 220, spot: 'river', season: 'summer', hint: '여름 맑은 여울 · 수박 향이 난다' },
    { id: 'conger',     name: '붕장어', rarity: '드묾', w: 16, min: 40, max: 90, power: 1.5, price: 280, spot: 'sea', season: 'summer', phase: ['evening', 'night'], hint: '여름밤 바다 바닥에서' },
    { id: 'bluegill',   name: '블루길', rarity: '흔함', w: 30, min: 8,  max: 20, power: 0.9, price: 40,  season: 'autumn', hint: '가을 연못 · 겁 없이 문다' },
    { id: 'goby',       name: '망둥어', rarity: '흔함', w: 30, min: 10, max: 25, power: 1.0, price: 70,  spot: 'sea', season: 'autumn', hint: '가을 바다 · 아무 미끼나 덥석' },
    { id: 'gizzard',    name: '전어',   rarity: '드묾', w: 18, min: 15, max: 30, power: 1.2, price: 260, spot: 'sea', season: 'autumn', hint: '가을 전어 · 굽는 냄새가 마을까지' },
    { id: 'sleeper',    name: '동사리', rarity: '드묾', w: 22, min: 8,  max: 18, power: 1.0, price: 120, season: 'winter', hint: '겨울 얼음 밑 연못 바닥에서' },
    { id: 'lenok',      name: '열목어', rarity: '희귀', w: 8,  min: 30, max: 70, power: 1.7, price: 560, spot: 'river', season: 'winter', hint: '차가운 겨울 강의 귀한 손님' },
    { id: 'sandfish',   name: '도루묵', rarity: '흔함', w: 30, min: 12, max: 26, power: 1.0, price: 90,  spot: 'sea', season: 'winter', hint: '겨울 바다 · 알이 꽉 찼다' }
  ].forEach(function (f) { FISH.push(f); });

  // season = 'spring'… (UI passes its clock, so FF.season works); without it, the UTC game clock decides
  function cropSeasonOk(id, season) { var c = CROPS[id]; return !!c && (!c.season || c.season === season); }
  function seasonOf(now, season) { return season || gameClock(now, 0).season; }
  function seasonCrops(season) { return SEASON_CROPS.filter(function (c) { return !season || c.season === season; }).map(function (c) { return c.id; }); }
  // seasonal crops (and dishes that need one) stay off the order board: orders have no deadline, seasons do
  function seasonalItem(id) {
    if (CROPS[id]) return !!CROPS[id].season;
    if (forageById(id)) return forageSeasonal(id);
    if (treeById(id)) return true;   // stage 6A: fruit only comes in its season
    var r = recipeById(id);
    return !!r && r.need.some(function (x) { return !!(CROPS[x] && CROPS[x].season) || forageSeasonal(x) || !!treeById(x); });
  }

  expose({ SEASON_CROPS: SEASON_CROPS, cropSeasonOk: cropSeasonOk, seasonCrops: seasonCrops, seasonalItem: seasonalItem });
