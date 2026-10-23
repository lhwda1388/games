// 부적난무 — 합체 레시피. 재료 둘(기본 부적) → 갈래 둘 중 하나. 갈래 부적은 talismans.js에 fusion: true로 있다.
const BJ_RECIPES = {
  fire_wind: { a: 'fire_talisman', b: 'whirlwind', branches: ['hwaryongpung', 'firewind_step'] },
  bell_bean: { a: 'bell', b: 'red_bean', branches: ['boundary_ward', 'bean_bell_trap'] },
  thunder_water: { a: 'thunder_talisman', b: 'water_splash', branches: ['storm_array', 'lightning_rain'] },
  sword_chain: { a: 'spirit_sword', b: 'chain_lightning', branches: ['thunder_sword', 'sword_rain'] },
  fox_peach: { a: 'fox_fire', b: 'peach_branch', branches: ['peach_foxfire', 'peach_ward'] },
  frost_wind: { a: 'frost_talisman', b: 'wind_step', branches: ['blizzard_step', 'north_wind'] },
};
if (typeof module !== 'undefined') module.exports = BJ_RECIPES;
