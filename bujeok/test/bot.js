// 테스트·밸런스용 자동 플레이.
// 이동: 'evade'(기본: 예고 회피 → 가까운 적이 없고 살 돈이 있으면 장터로 → 가까운 적 회피 + 큰 원), 'idle'(가만히), 'blind'(적을 보지 않고 1.2초마다 8방향으로 돎).
// 선택: 레벨업은 목표 레시피 관련 → 없으면 첫 번째. 합체는 opts.branch(기본 0, -1이면 보류).
const SK = require('../engine/skills.js');
const SIM = require('../engine/sim.js');
const MK = require('../content/rules.js').market, MIN_PRICE = Math.min(MK.newPrice, MK.upBase + MK.upPerLv);

// 돌진 경고선·내려찍기 원 안에 있으면 빠져나갈 방향
function dodge(state) {
  const p = state.player;
  for (const q of state.eshots || []) {
    const sp = Math.hypot(q.vx, q.vy) || 1, ux = q.vx / sp, uy = q.vy / sp;
    const rx = p.x - q.x, ry = p.y - q.y, along = rx * ux + ry * uy;
    if (along < 0 || along > 140) continue;
    const side = rx * -uy + ry * ux;
    if (Math.abs(side) < 40) { const s = side >= 0 ? 1 : -1; return { mx: -uy * s + 0, my: ux * s + 0 }; }
  }
  for (const e of state.enemies) {
    if (e.ph !== 'warn') continue;
    if (e.wr) {
      let dx = p.x - e.wx, dy = p.y - e.wy, d = Math.hypot(dx, dy);
      // 원 중심에 정확히 서 있으면 방향이 없다 — 시전한 적의 반대쪽으로(그 위에도 서 있으면 +x로)
      if (d < 1) { dx = p.x - e.x; dy = p.y - e.y; d = Math.hypot(dx, dy); if (d < 1) return { mx: 1, my: 0 }; return { mx: dx / d, my: dy / d }; }
      if (d < e.wr + 30) return { mx: dx / d, my: dy / d };
    } else if (e.len) {
      const rx = p.x - e.x, ry = p.y - e.y, along = rx * e.dx + ry * e.dy;
      if (along < -40 || along > e.len + 40) continue;
      const side = rx * -e.dy + ry * e.dx;
      if (Math.abs(side) < 80) { const s = side >= 0 ? 1 : -1; return { mx: -e.dy * s + 0, my: e.dx * s + 0 }; }
    }
  }
  return null;
}

const MOVES = {
  evade(state) {
    const d = dodge(state);
    if (d) return d;
    const p = state.player;
    let mx = Math.cos(state.t * 0.4), my = Math.sin(state.t * 0.4), best = null, bd = 160 * 160;
    for (const e of state.enemies) {
      const q = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (q < bd) { bd = q; best = e; }
    }
    // 120px 안에 적이 없고 가장 싼 값 이상 가졌으면 열린 도깨비 장터로 걸어간다(저주 제단은 플레이어의 선택이라 찾지 않는다)
    const mk = bd >= 120 * 120 && state.purse >= MIN_PRICE && (state.sites || []).find(s => s.kind === 'market' && !(s.until <= state.t));
    if (mk) { const dx = mk.x - p.x, dy = mk.y - p.y, k = Math.hypot(dx, dy); return k < 10 ? { mx: 0, my: 0 } : { mx: dx / k, my: dy / k }; }
    if (best) { const k = Math.sqrt(bd) || 1; mx = mx * 0.3 + (p.x - best.x) / k; my = my * 0.3 + (p.y - best.y) / k; }
    return { mx, my };
  },
  idle: () => ({ mx: 0, my: 0 }),
  blind(state) { const a = Math.floor(state.t / 1.2) % 8 * Math.PI / 4; return { mx: Math.cos(a), my: Math.sin(a) }; },
};

function input(state, move = 'evade') { return MOVES[move](state); }

function decide(state, content, opts = {}) {
  const c = state.choice, branch = opts.branch == null ? 0 : opts.branch;
  if (c.kind === 'start') { SK.chooseStart(state, content, 0); return; }
  if (c.kind === 'levelup') SK.choose(state, content, Math.max(0, c.options.findIndex(o => SK.related(state, content, o))));
  else if (c.kind === 'market') {
    // 장터: 목표 관련 → 가진 부적 강화 순으로 살 수 있는 것을 산다(목표와 무관한 새 부적은 슬롯만 차지하니 사지 않는다)
    const can = o => state.purse >= o.price;
    let i = c.offers.findIndex(o => can(o) && SK.related(state, content, o));
    if (i < 0) i = c.offers.findIndex(o => can(o) && o.kind === 'up');
    if (i >= 0) SK.buy(state, content, i); else SK.leaveMarket(state, content);
  }
  else if (branch < 0) SK.postpone(state, content);
  else SK.fuse(state, content, branch);
}

function run(state, content, until, onStep, opts = {}) {
  const DT = 1 / 60;
  let guard = 0;
  while (!state.over && state.t < until && guard++ < until * 70) {
    if (state.choice) { decide(state, content, opts); continue; }
    SIM.step(state, content, input(state, opts.move), DT);
    state.fx.hits.length = 0;
    state.fx.rings.length = 0;
    if (onStep) onStep(state);
  }
  return state;
}

module.exports = { input, decide, run };
