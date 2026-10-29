  // ---------- stage 8 ④ 이펙트: pure timing helpers (time comes in as an argument; nothing here touches game state) ----------
  var FX_PARTICLES = 140;   // hard cap on live canvas particles
  var FX_LIVE = 16;         // hard cap on live timed effects (fly, pop, splash, beam)
  var FX_FLOATS = 10;       // hard cap on floating text elements
  var FX_COMBO_MS = 1600;   // harvests closer than this count as a streak (×2 ×3)
  var FX_COUNT_MS = 450;    // wallet count-up length
  var FX_HITSTOP_MS = 70;   // strike freeze (visual only)

  // ease-out cubic, clamped to 0..1
  function fxEase(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return 1 - (1 - t) * (1 - t) * (1 - t); }
  // rolling number: value shown el ms after a from → to change (dur <= 0 or done → to)
  function fxCount(from, to, el, dur) {
    if (!(dur > 0) || !(el < dur)) return to;
    if (el <= 0) return from;
    return Math.round(from + (to - from) * fxEase(el / dur));
  }
  // how many of `want` new items fit under `cap` when `have` are live
  function fxRoom(have, want, cap) { return Math.max(0, Math.min(want, cap - have)); }
  // an effect is stale once its time is up, or when the clock jumped backwards / far ahead (tab woke up)
  function fxStale(e, t) { return t < e.t0 - 1000 || t - e.t0 >= e.dur; }
  // drop stale effects in place; returns the list
  function fxPrune(list, t) {
    for (var k = list.length - 1; k >= 0; k--) if (fxStale(list[k], t)) list.splice(k, 1);
    return list;
  }
  // add an effect, dropping the oldest past the cap
  function fxPush(list, e, cap) { list.push(e); while (list.length > cap) list.shift(); return list; }
  // quick-succession counter: prev = { t, n } or null → the new { t, n }
  function fxCombo(prev, t, gap) { return prev && t >= prev.t && t - prev.t <= gap ? { t: t, n: prev.n + 1 } : { t: t, n: 1 }; }
  // catch reveal tier: 0 plain, 1 rare (shake + silhouette), 2 legend (darken → beam)
  function fxTier(f) { return !f ? 0 : f.rarity === '전설' ? 2 : f.rarity === '희귀' ? 1 : 0; }

  expose({
    FX_PARTICLES: FX_PARTICLES, FX_LIVE: FX_LIVE, FX_FLOATS: FX_FLOATS, FX_COMBO_MS: FX_COMBO_MS, FX_COUNT_MS: FX_COUNT_MS, FX_HITSTOP_MS: FX_HITSTOP_MS,
    fxEase: fxEase, fxCount: fxCount, fxRoom: fxRoom, fxStale: fxStale, fxPrune: fxPrune, fxPush: fxPush, fxCombo: fxCombo, fxTier: fxTier
  });
