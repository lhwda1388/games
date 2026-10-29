  // ---------- stage 8 ② 손맛: fish personalities for the reel (used by newReel/reelStep), 월척 records, 어탁 ----------
  // A personality is a list of phases; each phase lists the event kinds the fish picks from.
  // burst = 순한 (the stage-1 tug), jump = 점프, sound = 버팀 (digs to the bottom), run = 질주 (side runs).
  var TEMPER_KINDS = { burst: '순한', jump: '점프', sound: '버팀', run: '질주' };
  // per-event timing: tell = warning before it starts (s), dur = [base, random extra] (s)
  var TEMPER_EV = {
    burst: { tell: WARN, dur: [0.4, 0.45] },
    jump: { tell: 0.55, dur: [0.45, 0.3] },
    sound: { tell: 0.45, dur: [1.0, 0.5] },
    run: { tell: 0.4, dur: [1.1, 0.5] }
  };
  // catch-bar points where a boss changes phase (2 or 3 phases); bosses get a little more time per extra phase
  var PHASE_AT = { 2: [0.55], 3: [0.45, 0.72] };
  var BOSS_EXTRA_S = 1, BOSS_SLACK = 0.027, BOSS_LUNGE = 0.04, TURN_S = 0.35, LONG_REST = 0.25;
  var B = ['burst'], J = ['jump'], D = ['sound'], R = ['run'];
  // common fish are mostly 순한, uncommon ones have one way of fighting, rare ones mix two, legends are bosses
  var TEMPER = {
    minnow: [B], crucian: [B], dace: [B], chub: [R], loach: [B], mackerel: [R], horse: [R], bitterling: [B],
    killifish: [B], bluegill: [B], goby: [D], sandfish: [B], damsel: [B], mullet: [J], blenny: [D],
    catfish: [D], trout: [J], eel: [D], bass: [J], smelt: [B], flounder: [D], rockfish: [D], squid: [R], hairtail: [R],
    cod: [D], shad: [R], webfoot: [D], sweetfish: [J], conger: [D], gizzard: [R], sleeper: [B], filefish: [R],
    tilefish: [D], halfbeak: [J], scorpion: [D], flyingfish: [J], blowfish: [B],
    carp: [['jump', 'burst']], mandarin: [['sound', 'jump']], salmon: [['jump', 'run']], snakehead: [['sound', 'jump']],
    snapper: [['run', 'sound']], octopus: [['sound', 'burst']], yellowtail: [['run', 'jump']], lenok: [['jump', 'run']],
    moray: [['sound', 'run']], sunfish: [['sound', 'jump']], grouper: [['sound', 'run']],
    lunch: [B], clockfish: [B], blossomcarp: [B], sparkfish: [J], moonfish: [['jump', 'burst']], snowsmelt: [B],
    tuna: [R, J, ['run', 'sound']], koi: [['burst', 'jump'], ['sound', 'burst']], sturgeon: [D, J, ['sound', 'run']],
    ghostray: [R, ['sound', 'jump']], swordfish: [J, R, ['jump', 'sound']], dotdom: [D, ['run', 'jump'], D]
  };
  // fish not in the table (added later) still get a stable personality from their rarity and id
  function temperOf(id) {
    if (TEMPER.hasOwnProperty(id)) return TEMPER[id];
    var f = fishById(id), h = strHash(String(id)), ks = ['jump', 'sound', 'run'];
    if (!f || f.rarity === '흔함' || f.egg) return [B];
    if (f.rarity === '전설') return [[ks[h % 3]], [ks[(h + 1) % 3]]];
    if (f.rarity === '희귀') return [[ks[h % 3], ks[(h + 1) % 3]]];
    return [[ks[h % 3]]];
  }
  function isBoss(id) { return temperOf(id).length > 1; }
  function phaseName(ph) { return ph.map(function (k) { return TEMPER_KINDS[k]; }).join('·'); }
  function temperName(id) {
    var t = temperOf(id);
    if (t.length > 1) return '보스 ' + t.length + '단계 · ' + t.map(phaseName).join(' → ');
    return phaseName(t[0]) + (t[0].length > 1 ? ' 섞임' : '형');
  }
  // one line for the 도감 (shown after the first catch)
  var TEMPER_TIP = { burst: '당길 때 손 떼기', jump: '튀기 직전 떼기', sound: '짧게 끊어 당기기', run: '방향 바꿀 때 감기' };
  function temperTip(id) {
    var ks = [];
    temperOf(id).forEach(function (ph) { ph.forEach(function (k) { if (ks.indexOf(k) < 0) ks.push(k); }); });
    return ks.map(function (k) { return TEMPER_TIP[k]; }).join(' · ');
  }

  // newReel fields for the fish's personality
  function temperReel(r, id) {
    var t = temperOf(id);
    r.phases = t; r.phase = 0; r.kinds = t[0]; r.ev = t[0][0]; r.fx = 0; r.hold = 0; r.leg = 0; r.turn = 0;
    r.tmax = REEL_MAX + BOSS_EXTRA_S * (t.length - 1);
    return r;
  }
  // a new event is due: same rng order as the old reel when the fish has only one kind
  function temperPick(r, rng) {
    var ks = r.kinds || B;
    r.ev = ks.length > 1 ? ks[Math.min(ks.length - 1, Math.floor(rng() * ks.length))] : ks[0];
    return TEMPER_EV[r.ev] || TEMPER_EV.burst;
  }
  function temperStart(r, rng) {
    var e = TEMPER_EV[r.ev] || TEMPER_EV.burst;
    r.burst = e.dur[0] + rng() * e.dur[1];
    if (r.ev === 'run') { r.leg = 0.45 + rng() * 0.25; r.turn = 0; }
    if ((r.ev === 'run' || r.ev === 'sound') && r.phases.length < 2) r.next += LONG_REST;   // long events leave a longer calm (not for bosses)
  }
  // side run: legs with a short rest (turn) between them; the direction flips at each turn
  function temperRun(r, dt, rng) {
    if (r.turn > 0) { r.turn = Math.max(0, r.turn - dt); if (r.turn === 0) r.leg = 0.45 + rng() * 0.25; return; }
    r.leg -= dt;
    if (r.leg <= 0) { r.leg = 0; r.turn = TURN_S; r.dir = -r.dir; }
  }
  // physics while a non-순한 event runs. Returns false for 순한 (the caller keeps the old formulas).
  function temperPhys(r, dt, holding) {
    var on = temperEv(r, dt, holding);
    // a boss takes line back whenever it is given slack (like a 순한 burst does)
    if (on && !holding && r.phases && r.phases.length > 1) r.catch -= BOSS_SLACK * r.power * dt;
    return on;
  }
  function temperEv(r, dt, holding) {
    var base = 0.3 / Math.pow(r.power, 0.3);
    if (r.ev === 'jump') {
      // in the air: a tight line spikes; slack line is right and the fish tires a little
      if (holding) r.tension += (0.2 + 2.6 * r.power) * r.tgain * dt;
      else { r.tension = Math.max(0, r.tension - 0.8 * dt); r.catch += 0.03 * dt; }
      return true;
    }
    if (r.ev === 'sound') {
      // dug in at the bottom: the longer one pull lasts, the harder it gets; short pulls still gain line
      if (holding && r.hold < 0.35) { r.tension += (0.2 + 0.2 * r.power) * r.tgain * dt; r.catch += 0.9 * base * dt; }
      else if (holding) { r.tension += (0.2 + 0.6 * r.power) * r.tgain * dt; r.catch -= 0.2 * r.power * dt; }   // it drags you down
      else { r.tension = Math.max(0, r.tension - 0.8 * dt); r.catch -= 0.005 * r.power * dt; }
      return true;
    }
    if (r.ev === 'run') {
      if (r.turn > 0) {
        // it rests while turning: the best moment to reel
        if (holding) { r.tension += 0.2 * r.tgain * dt; r.catch += 2.2 * base * dt; }
        else { r.tension = Math.max(0, r.tension - 0.8 * dt); r.catch -= 0.01 * dt; }
      } else if (holding) r.tension += (0.2 + 0.9 * r.power) * r.tgain * dt;
      else { r.tension = Math.max(0, r.tension - 0.8 * dt); r.catch -= 0.012 * r.power * dt; }
      return true;
    }
    return false;
  }
  // boss: the catch bar crossing a mark starts the next phase (fx = seconds of on-screen signal)
  function temperPhase(r) {
    var n = r.phases ? r.phases.length : 1;
    if (n < 2 || r.phase >= n - 1 || r.catch < PHASE_AT[n][r.phase]) return false;
    r.phase++; r.kinds = r.phases[r.phase]; r.fx = 1.2;
    r.burst = 0; r.warn = 0; r.turn = 0; r.next = 0.9; r.ev = r.kinds[0];
    r.power *= 1.05; r.catch -= BOSS_LUNGE;   // it bolts as it changes its way of fighting
    return true;
  }

  // ---------- 월척 records and 어탁 ----------
  // top n species by best size (cm), biggest first; ties keep FISH order
  function topRecords(s, n) {
    var out = [];
    FISH.forEach(function (f) { var d = s.dex.fish[f.id]; if (d && d.best > 0) out.push({ id: f.id, size: d.best }); });
    out.sort(function (a, b) { return b.size - a.size; });
    return out.slice(0, n);
  }
  var ETAKU_N = 4;

  expose({
    TEMPER_KINDS: TEMPER_KINDS, TEMPER_EV: TEMPER_EV, PHASE_AT: PHASE_AT, temperOf: temperOf, temperName: temperName,
    temperTip: temperTip, isBoss: isBoss, topRecords: topRecords, ETAKU_N: ETAKU_N
  });
