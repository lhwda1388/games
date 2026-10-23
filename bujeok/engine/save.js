// 부적난무 — 저장(스펙 9.2). 키 3개(설정/영구/판)를 따로 쓰고, 각 키마다 마지막 정상본(.lastGood)을 둔다.
// 저장 실패(용량 초과·사생활 보호 모드)는 false로 알리고 게임은 계속한다.
const BJ_SAVE = (function bjSave() {
  const ENT = typeof BJ_ENT !== 'undefined' ? BJ_ENT : require('./entities.js');
  const SCHEMA = 1;
  const KEYS = { settings: 'bujeok.settings', meta: 'bujeok.meta', run: 'bujeok.run' };
  const VALID = {
    settings: d => !!d && typeof d === 'object',
    meta: d => !!d && typeof d.coins === 'number' && !!d.discovered && typeof d.discovered === 'object' && Array.isArray(d.grantedRuns),
    run: d => !!d && typeof d.t === 'number' && !!d.rng && typeof d.rng.s === 'number' && !!d.player && Array.isArray(d.slots),
  };
  const freshMeta = () => ({ coins: 0, discovered: {}, grantedRuns: [], tutorialDone: false, cleared: {}, village: {}, stats: { runs: 0, eliteKills: 0, bossKills: 0, ghostKills: 0, fusions: 0 }, killed: {}, obtained: {}, titles: [], lastHero: 'yeonhwa', lastCurses: {}, settings: { muted: false } });
  // 판 스냅샷에서 화면용 일시 데이터(fx)를 뺀다. 숫자는 반올림하지 않는다 — 복원 뒤에도 결정성이 유지돼야 한다.
  const dropFx = (k, v) => (k === 'fx' ? undefined : v);

  function parse(raw, kind) {
    try {
      const env = JSON.parse(raw);
      return env && env.schemaVersion === SCHEMA && VALID[kind](env.data) ? env : null;
    } catch (e) { return null; }
  }

  function write(store, kind, data, contentVersion) {
    if (!VALID[kind](data)) return false;
    try {
      const prev = store.getItem(KEYS[kind]);
      if (prev && parse(prev, kind)) store.setItem(KEYS[kind] + '.lastGood', prev);
      store.setItem(KEYS[kind], JSON.stringify({ schemaVersion: SCHEMA, contentVersion, data }, kind === 'run' ? dropFx : undefined));
      return true;
    } catch (e) { return false; }
  }

  // 본 키 → lastGood → 둘 다 깨졌으면 지우고 null.
  // ponytail: 스키마가 v1 하나뿐이라 마이그레이션 표는 없다. v2를 만들 때 parse 앞에 migrate[env.schemaVersion]을 끼운다.
  function read(store, kind) {
    try {
      for (const k of [KEYS[kind], KEYS[kind] + '.lastGood']) {
        const raw = store.getItem(k), env = raw && parse(raw, kind);
        if (env) return env;
      }
      store.removeItem(KEYS[kind]);
      store.removeItem(KEYS[kind] + '.lastGood');
    } catch (e) { /* 저장소 접근 불가 */ }
    return null;
  }

  function loadMeta(store) {
    const env = read(store, 'meta');
    if (!env) return freshMeta();
    // 계획 1 시절 meta: cleared가 없다. 그때는 잠금이 없었으므로 입문을 끝낸 적(tutorialDone, 승패 무관)이 있으면 입문 클리어로 봐 1챕터를 열어 둔다
    if (!env.data.cleared) env.data.cleared = env.data.tutorialDone ? { tutorial: true } : {};
    const f = freshMeta();
    for (const k of ['village', 'stats', 'killed', 'obtained', 'titles', 'lastHero', 'lastCurses', 'settings']) if (env.data[k] == null) env.data[k] = f[k];
    env.data.stats = { ...f.stats, ...env.data.stats }; // 옛 stats에 없는 통계 키는 0으로(있는 값은 그대로)
    return env.data;
  }

  function clearRun(store) {
    try { store.removeItem(KEYS.run); store.removeItem(KEYS.run + '.lastGood'); } catch (e) { /* 무시 */ }
  }

  // 진행 중 판. 콘텐츠 버전이 다르면 이어하지 않고 지운다(meta는 그대로, 스펙 9.2).
  function loadRun(store, contentVersion) {
    const env = read(store, 'run');
    if (!env) return null;
    if (env.contentVersion !== contentVersion) { clearRun(store); return { discarded: true }; }
    const state = env.data;
    state.fx = ENT.freshFx();
    return { state };
  }

  // 판 보상 지급. 같은 runId는 한 번만 — 새로고침·복귀로 결과 화면이 다시 떠도 중복 지급하지 않는다(최근 50개 기억).
  function grant(meta, res) {
    if (meta.grantedRuns.includes(res.runId)) return false;
    meta.grantedRuns.push(res.runId);
    if (meta.grantedRuns.length > 50) meta.grantedRuns.shift();
    meta.coins += res.coins;
    if (res.win) meta.cleared[res.chapterId] = true;
    for (const id of res.fusions) meta.discovered[id] = true;
    if (res.tutorial) meta.tutorialDone = true; // 챕터 데이터의 tutorial 플래그가 결정한다
    return true;
  }

  return { SCHEMA, KEYS, dropFx, write, read, loadMeta, loadRun, clearRun, grant };
})();
if (typeof module !== 'undefined') module.exports = BJ_SAVE;
