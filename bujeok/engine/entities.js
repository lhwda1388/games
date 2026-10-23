// 부적난무 — 적 생성·조회·피해, 플레이어 피격. sim·spawner·hooks·behaviors·patterns·save가 함께 쓰는 바닥 모듈(순환 참조 방지).
const BJ_ENT = (function bjEnt() {
  const def = (content, e) => content.enemies[e.id];
  const chapterOf = (content, state) => (content.chapters && content.chapters[state.chapterId]) || {};
  // 챕터 난이도 보정(입문은 관대하게). 없으면 체력·피해 1배, 회복 0
  const mods = (content, state) => {
    const m = { enemyHp: 1, enemyDmg: 1, regen: 0, ...(chapterOf(content, state).mods || {}) };
    for (const [k, v] of Object.entries(state.runMods || {})) if (k in m) m[k] *= v; // 저주 같은 판 보정(mods에 있는 키만)
    return m;
  };
  const elite = (content, e, k) => (e.elite ? content.rules.elite[k] : 1);
  const rageMul = (content, e, k) => content.rules.enrage[k] ** (e.rage || 0);
  const radius = (content, e) => def(content, e).r * elite(content, e, 'r');
  const damage = (content, e) => def(content, e).dmg * elite(content, e, 'dmg') * rageMul(content, e, 'dmgMul');
  // 이동 배수(폭주 × 느려짐). 정의 speed가 아닌 속도(돌진 등)에도 같은 배수를 쓴다
  const moveMul = (content, e) => rageMul(content, e, 'speedMul') * (e.slowT > 0 ? e.slowMul : 1);
  const speed = (content, e) => def(content, e).speed * moveMul(content, e) * (e.spdMul || 1);
  const mutation = (content, state) => (state.mutation && content.mutations && content.mutations[state.mutation]) || null;
  const curse = (state, k) => (state.curseFx && state.curseFx[k] != null ? state.curseFx[k] : 1);
  const uid = state => state.nextUid++;
  const freshFx = () => ({ hits: [], rings: [], events: [], notices: [], bolts: [], arcs: [], kills: [], hurts: [] });

  // 플레이어 가까이(rules.spawn.safeRadius 안)면 반경 경계로 밀어낸 자리
  function safePos(state, content, x, y) {
    const p = state.player, safe = content.rules.spawn.safeRadius, dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
    return d < safe ? { x: p.x + (d ? dx / d : 1) * safe, y: p.y + (d ? dy / d : 0) * safe } : { x, y };
  }

  // 개수 상한(rules.limits.enemies)을 넘으면 null. 보스는 상한을 무시한다.
  function spawnEnemy(state, content, id, x, y, opts = {}) {
    const d = content.enemies[id];
    if (!d.boss && state.enemies.length >= content.rules.limits.enemies) return null;
    const mu = mutation(content, state), hits = mu && (mu.target === id || (mu.ghosts && d.ghost));
    const hp = d.hp * (opts.elite ? content.rules.elite.hp : 1) * mods(content, state).enemyHp * (hits && mu.hpMul ? mu.hpMul : 1);
    const e = { uid: uid(state), id, x, y, hp, maxHp: hp };
    if (hits && mu.speedMul) e.spdMul = mu.speedMul;
    if (opts.elite) e.elite = 1;
    if (opts.owner) e.owner = opts.owner;
    if (opts.pack != null) e.pack = opts.pack;
    if (opts.tag) e.tag = opts.tag;
    state.enemies.push(e);
    return e;
  }

  // 피해를 주고 실제로 깎은 체력을 돌려준다. 0 이하가 되면 dead 표시만 — 제거·보상은 sim이 틱 끝에 처리한다.
  function hurt(state, e, dmg, owner) {
    if (e.dead || dmg <= 0) return 0;
    const dealt = Math.min(dmg, e.hp);
    state.stats.damageBy[owner] = (state.stats.damageBy[owner] || 0) + dealt;
    e.hp -= dmg;
    if (dmg >= 1 && state.fx.hits.length < 300) state.fx.hits.push({ x: e.x, y: e.y, dmg: Math.round(dmg), uid: e.uid });
    if (e.hp <= 0) e.dead = 1;
    return dealt;
  }

  // 느려짐: 이미 걸려 있으면 더 센 감속과 더 긴 시간을 남긴다
  function applySlow(e, slow) {
    const on = e.slowT > 0;
    e.slowMul = on ? Math.min(e.slowMul, slow.mul) : slow.mul;
    e.slowT = Math.max(on ? e.slowT : 0, slow.t);
  }

  // 플레이어 피격(무적 시간·챕터 피해 보정 포함). 맞았으면 true
  function hitPlayer(state, content, dmg, sourceId) {
    const p = state.player;
    if (p.invuln > 0) return false;
    p.hp -= dmg * mods(content, state).enemyDmg;
    p.invuln = content.rules.player.invuln;
    state.lastHit = sourceId;
    if (state.fx.hurts && state.fx.hurts.length < 300) state.fx.hurts.push({ x: p.x, y: p.y });
    return true;
  }

  // 시야 반경: base × 유효한 보정 배수 중 가장 작은 값(안개). 그림에만 쓴다
  function visionRadius(content, state) {
    let m = 1;
    for (const v of state.vision || []) if (v.until > state.t) m = Math.min(m, v.mul);
    return content.rules.vision.base * m;
  }
  // 열쇠 효과 배수: 챕터 keys에 있는 레시피로 합체했으면(갈래 무관) 그 배수를 곱한다
  function keyMul(content, state, k) {
    let m = 1;
    const keys = chapterOf(content, state).keys || {};
    for (const [recipe, eff] of Object.entries(keys)) if (state.fused && state.fused[recipe] && eff[k]) m *= eff[k];
    return m;
  }

  return { curse, visionRadius, keyMul, def, mods, radius, damage, moveMul, speed, safePos, uid, freshFx, mutation, spawnEnemy, hurt, applySlow, hitPlayer };
})();
if (typeof module !== 'undefined') module.exports = BJ_ENT;
