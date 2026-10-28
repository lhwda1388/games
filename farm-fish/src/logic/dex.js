  // ---------- 도감 milestones ----------
  var MILESTONES = [
    { id: 'cat',     need: 5,     name: '고양이',   desc: '선착장에 고양이가 와서 같이 찌를 본다' },
    { id: 'lantern', need: 8,     name: '석등',     desc: '연못가에 석등이 켜진다' },
    { id: 'koi',     crop: 'gold', name: '금빛 잉어', desc: '연못에 새 물고기가 산다' },
    { id: 'boat',    need: 'all', name: '나룻배',   desc: '연못에 작은 배가 묶인다' },
    { id: 'fish20',  fish: 20,    name: '물고기 20종', desc: '장식 하나를 받았다 · 어부의 깃발' },
    { id: 'fish30',  fish: 30,    name: '물고기 30종', desc: '장식 하나를 받았다 · 등대 모형' }
  ];
  // the original 도감 (4 crops incl. gold + 7 fish) stays the 'all' goal so new crops don't move it
  var BASE_DEX = { crops: ['radish', 'berry', 'melon', 'gold'], fish: ['minnow', 'crucian', 'catfish', 'carp', 'lunch', 'tuna', 'koi'] };
  var DEX_TOTAL = BASE_DEX.crops.length + BASE_DEX.fish.length;
  var DEX_ALL = Object.keys(CROPS).length + FISH.length;
  function dexCount(s) {
    var n = 0;
    Object.keys(CROPS).forEach(function (k) { if (s.dex.crops[k]) n++; });
    FISH.forEach(function (f) { if (s.dex.fish[f.id]) n++; });
    return n;
  }
  function baseDexCount(s) {
    var n = 0;
    BASE_DEX.crops.forEach(function (k) { if (s.dex.crops[k]) n++; });
    BASE_DEX.fish.forEach(function (k) { if (s.dex.fish[k]) n++; });
    return n;
  }
  function fishDexCount(s) { var n = 0; FISH.forEach(function (f) { if (s.dex.fish[f.id]) n++; }); return n; }
  function milestoneMet(s, m) {
    if (m.crop) return !!s.dex.crops[m.crop];
    if (m.fish) return fishDexCount(s) >= m.fish;
    if (m.need === 'all') return baseDexCount(s) >= DEX_TOTAL;
    return dexCount(s) >= m.need;
  }
  function checkMilestones(s) {
    var out = [];
    MILESTONES.forEach(function (m) { if (!s.ms[m.id] && milestoneMet(s, m)) { s.ms[m.id] = true; out.push(m.id); } });
    return out;
  }

  expose({
    MILESTONES: MILESTONES, BASE_DEX: BASE_DEX, DEX_TOTAL: DEX_TOTAL, DEX_ALL: DEX_ALL,
    dexCount: dexCount, fishDexCount: fishDexCount, baseDexCount: baseDexCount, milestoneMet: milestoneMet, checkMilestones: checkMilestones
  });
