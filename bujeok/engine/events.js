// 부적난무 — 돌발 사건 스케줄러. 판을 만들 때 챕터의 events 목록에서 2~3개를 시드로 고르고, 보스 앞뒤·판 끝을 피해 시각을 잡는다.
// 사건은 정의(content/events.js)의 onStart/onTick이 api로만 상태를 바꾼다(챕터 훅과 같은 규칙). 장소(site)는 사건이 쓰는 원형 지점이다.
const BJ_EVENTS = (function bjEvents() {
  const RNG = typeof BJ_RNG !== 'undefined' ? BJ_RNG : require('./rng.js');
  const HOOKS = typeof BJ_HOOKS !== 'undefined' ? BJ_HOOKS : require('./hooks.js');

  // 사건을 잡지 않는 시각: 보스 등장 bossGap 전부터 머무는 동안(중간 보스는 bossLeave) + bossGap 뒤까지,
  // 그리고 챕터 quietWindows({ from, every, len }: 챕터 기믹이 열리는 구간) quietPad 전부터 끝까지
  function busy(ch, rules, at) {
    const r = rules.events;
    if (ch.bosses.some(b => at > b.at - r.bossGap && at < b.at + (b.final ? 0 : rules.bossLeave) + r.bossGap)) return true;
    const q = ch.quietWindows;
    if (q) for (let w = q.from; w < ch.duration; w += q.every) if (at > w - r.quietPad && at < w + q.len) return true;
    return false;
  }

  // 입문(events 없음)은 RNG를 쓰지 않는다 — 입문 결정성·첫 합체 시간 테스트가 그대로여야 한다
  function plan(state, content) {
    const ch = content.chapters[state.chapterId], r = content.rules.events;
    if (!ch.events || !ch.events.length) return [];
    const n = Math.min(ch.events.length, r.min + RNG.int(state.rng, r.max - r.min + 1));
    const out = [];
    for (const id of RNG.sample(state.rng, ch.events, n)) {
      for (let tries = 0; tries < 30; tries++) {
        const at = Math.round(RNG.range(state.rng, r.from, ch.duration - r.endGap));
        if (busy(ch, content.rules, at) || out.some(e => Math.abs(at - e.at) < r.bossGap)) continue;
        out.push({ id, at, started: false, done: false });
        break;
      }
    }
    return out.sort((a, b) => a.at - b.at);
  }

  function tick(state, content, dt) {
    for (const ev of state.events) {
      if (ev.done || state.t < ev.at) continue;
      const def = content.events[ev.id], es = state.eventState[ev.id] || (state.eventState[ev.id] = {});
      const api = HOOKS.api(state, content, ev.id);
      if (!ev.started) { ev.started = true; def.onStart(api, es); }
      else if (def.onTick) def.onTick(api, es, dt);
      if (es.done) ev.done = true;
    }
    state.sites = state.sites.filter(s => s.until > state.t);
  }

  return { plan, tick, busy };
})();
if (typeof module !== 'undefined') module.exports = BJ_EVENTS;
