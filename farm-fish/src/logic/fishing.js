  // ---------- fishing ----------
  var FISH = [
    { id: 'minnow',  name: '피라미',   rarity: '흔함',    w: 40, min: 6,  max: 14,  power: 0.8,  price: 12 },
    { id: 'crucian', name: '붕어',     rarity: '흔함',    w: 34, min: 14, max: 32,  power: 1.0,  price: 28 },
    { id: 'catfish', name: '메기',     rarity: '드묾',    w: 16, min: 30, max: 72,  power: 1.3,  price: 70 },
    { id: 'carp',    name: '비단잉어', rarity: '희귀',    w: 7,  min: 40, max: 90,  power: 1.6,  price: 160 },
    { id: 'lunch',   name: '점심 붕어', rarity: '점심 한정', w: 30, min: 18, max: 36, power: 1.1, price: 110, window: 'lunch' },
    { id: 'tuna',    name: '퇴근 참치', rarity: '전설',   w: 10, min: 90, max: 210, power: 2.2,  price: 1200, window: 'friday' },
    { id: 'koi',     name: '금빛 잉어', rarity: '전설',   w: 5,  min: 50, max: 110, power: 2.0,  price: 600, unlock: 'koi' },
    // 강 (river). phase = game-clock time of day, weather = weatherAt(), season = game season (stage 4 adds seasonal fish)
    { id: 'dace',      name: '갈겨니',   rarity: '흔함', w: 40, min: 8,  max: 18,  power: 0.9, price: 30,   spot: 'river', hint: '여울에 흔한 작은 물고기' },
    { id: 'chub',      name: '끄리',     rarity: '흔함', w: 30, min: 15, max: 35,  power: 1.1, price: 50,   spot: 'river', hint: '여울을 떼 지어 다닌다' },
    { id: 'loach',     name: '미꾸라지', rarity: '흔함', w: 30, min: 8,  max: 18,  power: 0.8, price: 60,   spot: 'river', weather: 'rain', hint: '비가 오면 진흙에서 나온다' },
    { id: 'trout',     name: '산천어',   rarity: '드묾', w: 18, min: 18, max: 40,  power: 1.3, price: 150,  spot: 'river', phase: ['morning'], hint: '맑은 아침 물에서' },
    { id: 'eel',       name: '뱀장어',   rarity: '드묾', w: 16, min: 40, max: 90,  power: 1.5, price: 220,  spot: 'river', phase: ['night'], hint: '밤이 되면 돌 틈에서 나온다' },
    { id: 'bass',      name: '배스',     rarity: '드묾', w: 16, min: 25, max: 55,  power: 1.4, price: 160,  spot: 'river', weather: 'fog', hint: '안개 낀 날 겁 없이 문다' },
    { id: 'smelt',     name: '빙어',     rarity: '드묾', w: 26, min: 8,  max: 15,  power: 0.9, price: 140,  spot: 'river', weather: 'snow', hint: '눈 오는 날 강에서' },
    { id: 'mandarin',  name: '쏘가리',   rarity: '희귀', w: 8,  min: 20, max: 50,  power: 1.6, price: 280,  spot: 'river', hint: '바위 그늘에 숨어 산다' },
    { id: 'salmon',    name: '연어',     rarity: '희귀', w: 7,  min: 50, max: 90,  power: 1.9, price: 520,  spot: 'river', weather: 'rain', hint: '불어난 강을 거슬러 오른다' },
    { id: 'snakehead', name: '가물치',   rarity: '희귀', w: 8,  min: 40, max: 85,  power: 1.8, price: 460,  spot: 'river', weather: 'rain', season: 'summer', hint: '장맛비에 불어난 물풀 사이에서' },
    { id: 'sturgeon',  name: '철갑상어', rarity: '전설', w: 3,  min: 80, max: 180, power: 2.4, price: 1600, spot: 'river', weather: 'fog', hint: '짙은 안개 속 강 밑바닥에 무언가…' },
    // 바다 (sea)
    { id: 'mackerel',  name: '고등어',   rarity: '흔함', w: 40, min: 20, max: 40,  power: 1.1, price: 60,   spot: 'sea', hint: '등에 물결무늬 · 바다에 흔하다' },
    { id: 'horse',     name: '전갱이',   rarity: '흔함', w: 32, min: 15, max: 35,  power: 1.0, price: 50,   spot: 'sea', hint: '떼로 몰려다닌다' },
    { id: 'flounder',  name: '광어',     rarity: '드묾', w: 18, min: 30, max: 70,  power: 1.4, price: 240,  spot: 'sea', hint: '모래 바닥에 납작 엎드려 있다' },
    { id: 'rockfish',  name: '우럭',     rarity: '드묾', w: 18, min: 20, max: 45,  power: 1.3, price: 200,  spot: 'sea', phase: ['night'], hint: '바위 틈에서 느긋하게 문다' },
    { id: 'squid',     name: '오징어',   rarity: '드묾', w: 16, min: 20, max: 40,  power: 1.2, price: 260,  spot: 'sea', phase: ['night'], hint: '밤에 불빛을 따라온다' },
    { id: 'hairtail',  name: '갈치',     rarity: '드묾', w: 14, min: 60, max: 120, power: 1.4, price: 340,  spot: 'sea', phase: ['evening', 'night'], hint: '해가 지면 은빛으로 올라온다' },
    { id: 'cod',       name: '대구',     rarity: '드묾', w: 20, min: 40, max: 90,  power: 1.5, price: 300,  spot: 'sea', weather: 'snow', hint: '눈 내리는 바다에서' },
    { id: 'snapper',   name: '참돔',     rarity: '희귀', w: 8,  min: 30, max: 70,  power: 1.7, price: 520,  spot: 'sea', phase: ['morning'], hint: '아침 물때에 붉게… 아니 회색으로 빛난다' },
    { id: 'octopus',   name: '문어',     rarity: '희귀', w: 8,  min: 30, max: 80,  power: 1.6, price: 480,  spot: 'sea', weather: 'rain', hint: '비 오는 날 바위에서 기어 나온다' },
    { id: 'yellowtail', name: '방어',    rarity: '희귀', w: 7,  min: 60, max: 100, power: 1.9, price: 700,  spot: 'sea', hint: '힘센 회유어 · 좋은 낚싯대가 필요하다' },
    { id: 'ghostray',  name: '안개 가오리', rarity: '전설', w: 3, min: 80, max: 160, power: 2.3, price: 1800, spot: 'sea', weather: 'fog', hint: '안개 속에서 커다란 그림자가 미끄러진다' },
    { id: 'swordfish', name: '황새치',   rarity: '전설', w: 2,  min: 120, max: 260, power: 2.5, price: 2600, spot: 'sea', phase: ['day'], hint: '한낮 먼바다의 전설 · 장력을 잘 다뤄야' }
  ];
  var BITE_MS = 2500;
  var WAIT_MIN = 20e3, WAIT_SPAN = 70e3;
  var NIBBLE_MS = 700, NIB_MIN = 5e3, NIB_SPAN = 11e3, NIB_GAP = 3e3;
  var REEL_MAX = 10, WARN = 0.4;
  function fishById(id) { for (var k = 0; k < FISH.length; k++) if (FISH[k].id === id) return FISH[k]; return null; }
  function inWindow(f, d) {
    if (!f.window) return true;
    var h = d.getHours();
    if (f.window === 'lunch') return h === 12;
    if (f.window === 'friday') return d.getDay() === 5 && h >= 17;
    return false;
  }
  // s is optional: without it, unlock-only species are excluded, the spot is 연못 and bait has no effect.
  // env = { phase, weather, season } (see fishEnv); without it, it is worked out from d in d's own time zone.
  function availableFish(d, s, env) {
    env = env || fishEnv(d.getTime(), -d.getTimezoneOffset());
    var spot = curSpot(s);
    return FISH.filter(function (f) {
      return inWindow(f, d) && (!f.unlock || !!(s && s.ms && s.ms[f.unlock])) && (f.spot || 'pond') === spot && fishEnvOk(f, env);
    });
  }
  function rollFish(d, rng, s, env) {
    var pool = availableFish(d, s, env), tot = 0, k, rare = s ? UPG.bait.rare[tier(s, 'bait')] : 1;
    var wt = pool.map(function (f) { return f.w * (f.rarity === '흔함' ? 1 : rare); });
    for (k = 0; k < pool.length; k++) tot += wt[k];
    var r = rng() * tot, pick = pool[pool.length - 1];
    for (k = 0; k < pool.length; k++) { r -= wt[k]; if (r < 0) { pick = pool[k]; break; } }
    var size = Math.round((pick.min + (pick.max - pick.min) * Math.pow(rng(), 1.6)) * 10) / 10;
    return { id: pick.id, size: size };
  }
  function sizeFrac(roll) {
    var f = fishById(roll.id);
    return Math.max(0, Math.min(1, (roll.size - f.min) / (f.max - f.min)));
  }
  function waitMs(s, rng) { return Math.round((WAIT_MIN + rng() * WAIT_SPAN) * UPG.bait.wait[tier(s, 'bait')]); }
  function nextNibble(s, from, rng) { return from + Math.round((NIB_MIN + rng() * NIB_SPAN) * UPG.bait.wait[tier(s, 'bait')]); }
  function cast(s, now, rng, x, y) {
    if (s.fish.phase !== 'idle') return false;
    s.fish = { phase: 'wait', x: x, y: y, biteAt: now + waitMs(s, rng), nibAt: 0, nibEnd: 0 };
    s.fish.nibAt = nextNibble(s, now, rng);
    return true;
  }
  function reelIn(s) {
    if (s.fish.phase !== 'wait') return false;
    s.fish = { phase: 'idle' }; return true;
  }
  // Decoy nibbles: a fish tastes the bait (bobber taps) before the real bite. Striking then scares it.
  function updateFishing(s, now, rng, actScale, env) {
    actScale = actScale || 1;
    var f = s.fish;
    if (f.phase === 'wait' && now < f.biteAt) {
      if (now >= f.nibAt) {
        var fresh = now - f.nibAt <= 1000 * actScale && f.nibAt < f.biteAt - NIB_GAP;
        f.nibAt = nextNibble(s, now, rng);
        if (fresh) { f.nibEnd = now + NIBBLE_MS * actScale; return 'nibble'; }
      }
      return null;
    }
    if (f.phase === 'wait' && now >= f.biteAt) {
      var end = f.biteAt + BITE_MS * actScale;
      if (now > end) { s.fish = { phase: 'idle' }; return 'missed'; }
      f.phase = 'bite'; f.biteEnd = end; f.roll = rollFish(new Date(f.biteAt), rng, s, env);
      return 'bite';
    }
    if (f.phase === 'bite' && now > f.biteEnd) { s.fish = { phase: 'idle' }; return 'missed'; }
    return null;
  }
  function hook(s, now) {
    var f = s.fish;
    if (f.phase !== 'bite' || now > f.biteEnd) return null;
    f.phase = 'reel';
    return f.roll;
  }
  // Player jerks the rod. On a real bite this hooks; any earlier it spooks the fish and the wait starts over.
  function strike(s, now, rng) {
    var f = s.fish;
    if (f.phase === 'bite') { var roll = hook(s, now); return roll ? { type: 'hook', roll: roll } : null; }
    if (f.phase !== 'wait') return null;
    var wasNibble = now < f.nibEnd;
    f.biteAt = now + waitMs(s, rng);
    f.nibAt = nextNibble(s, now, rng);
    f.nibEnd = 0;
    return { type: 'scared', nibble: wasNibble };
  }
  // Reel minigame: holding raises catch and tension; the fish pulls in telegraphed bursts toward r.dir.
  function newReel(roll, rodTier) {
    var f = fishById(roll.id);
    return { tension: 0, catch: 0.25, t: 0, power: f.power * (0.85 + 0.3 * sizeFrac(roll)),
      tgain: UPG.rod.tgain[rodTier || 0], dir: 1, burst: 0, warn: 0, next: 0.9, result: null };
  }
  function reelStep(r, dt, holding, rng) {
    if (r.result) return r.result;
    r.t += dt;
    if (r.burst > 0) r.burst = Math.max(0, r.burst - dt);
    else if (r.warn > 0) { r.warn -= dt; if (r.warn <= 0) { r.warn = 0; r.burst = 0.4 + rng() * 0.45; } }
    else {
      r.next -= dt;
      if (r.next <= 0) { r.warn = WARN; r.dir = rng() < 0.5 ? -1 : 1; r.next = (0.6 + rng() * 1.1) / Math.pow(r.power, 0.35); }
    }
    var pulling = r.burst > 0;
    if (holding) {
      r.tension += (0.2 + (pulling ? 1.3 * r.power : 0)) * r.tgain * dt;
      if (!pulling) r.catch += 0.3 / Math.pow(r.power, 0.3) * dt;
    } else {
      r.tension = Math.max(0, r.tension - 0.8 * dt);
      r.catch -= (pulling ? 0.04 * r.power : 0.02) * dt;
    }
    if (r.tension >= 1) r.result = 'snap';
    else if (r.catch >= 1) r.result = 'caught';
    else if (r.catch <= 0 || r.t >= REEL_MAX) r.result = 'escaped';
    return r.result;
  }
  function landFish(s, roll) {
    var f = fishById(roll.id);
    var coins = Math.round(f.price * (0.7 + 0.6 * sizeFrac(roll)));
    var d = s.dex.fish[f.id] || { n: 0, best: 0 };
    var newBest = roll.size > d.best;
    s.dex.fish[f.id] = { n: d.n + 1, best: Math.max(d.best, roll.size) };
    var sold = bagAdd(s, f.id, coins);
    dailyBump(s, 'fish'); dailyBump(s, 'spot', curSpot(s));
    s.fish = { phase: 'idle' };
    return { coins: coins, sold: sold, newBest: newBest, first: d.n === 0 };
  }
  function loseFish(s) { s.fish = { phase: 'idle' }; }

  expose({
    FISH: FISH, BITE_MS: BITE_MS, REEL_MAX: REEL_MAX, NIBBLE_MS: NIBBLE_MS,
    fishById: fishById, inWindow: inWindow, availableFish: availableFish, rollFish: rollFish, sizeFrac: sizeFrac,
    waitMs: waitMs, cast: cast, reelIn: reelIn, updateFishing: updateFishing, hook: hook, strike: strike,
    newReel: newReel, reelStep: reelStep, landFish: landFish, loseFish: loseFish
  });
