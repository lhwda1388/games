  // ---------- 불 조절 도전 (optional cooking minigame, stage 5B) ----------
  // Taking a dish out can be a little challenge: tap to stoke the fire and keep the heat inside the zone
  // for HEAT_NEED seconds within HEAT_LIMIT. Success = the dish is worth ×HEAT_BONUS; failure = the normal dish. Pure: dt in seconds.
  var HEAT_ZONE = [0.5, 0.75], HEAT_NEED = 3, HEAT_LIMIT = 8, HEAT_TAP = 0.15, HEAT_DECAY = 0.2, HEAT_BONUS = 1.15;
  function newHeat(rng) { return { h: 0.25, t: 0, inZone: 0, ph: rng() * 6.28, result: null }; }
  function heatTap(g) { if (!g.result) g.h = Math.min(1, g.h + HEAT_TAP); return g.h; }
  // the fire dies down unevenly (a slow wobble), so the rhythm of taps has to change a little
  function heatStep(g, dt) {
    if (g.result) return g.result;
    g.t += dt;
    g.h = Math.max(0, g.h - HEAT_DECAY * (1 + 0.6 * Math.sin(g.t * 1.7 + g.ph)) * dt);
    if (g.h >= HEAT_ZONE[0] && g.h <= HEAT_ZONE[1]) g.inZone += dt;
    if (g.inZone >= HEAT_NEED) g.result = 'ok';
    else if (g.t >= HEAT_LIMIT) g.result = 'fail';
    return g.result;
  }

  expose({ HEAT_ZONE: HEAT_ZONE, HEAT_NEED: HEAT_NEED, HEAT_LIMIT: HEAT_LIMIT, HEAT_BONUS: HEAT_BONUS, newHeat: newHeat, heatTap: heatTap, heatStep: heatStep });
