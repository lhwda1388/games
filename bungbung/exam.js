// 붕붕이 — 도로주행시험식 채점(비공식). 100점에서 감점, 70점 미만이 되는 순간 시험 중단, 실격 항목은 즉시 불합격.
// 주행 채점(drive-score)의 감점 이벤트를 점수로 바꾸고, 시험에만 있는 항목(출발·도착 깜빡이, 급제동)을 더한다. DOM 없음.
const PP_EXAM = (function ppExam() {
  const S = typeof PP_DSCORE !== 'undefined' ? PP_DSCORE : require('./drive-score.js');
  const T = S.TEXT, START = 100, PASS = 70;
  const POINTS = { blink: 5, mirror: 5, solid: 7, stop: 10, speed: 10, gap: 5, cutin: 7, route: 5 };
  const HARD_V = 20 / 3.6, HARD_DEC = 5.5, HARD_GAP = 5; // 급제동: 이 속도 이상에서 이 감속(m/s²) 초과, 이 간격(s)에 한 번
  const START_WIN = 3, END_WIN = 5, ROUTE_MAX = 3;

  // 같은 코드에 문구가 여럿이라 문구로 가른다: 적색·좌회전 신호 위반, 보행자 보호 위반, 비보호 위반은 실격
  function rule(e) {
    if (e.code === 'signal') return e.text === T.yellow ? 5 : 'dq';
    if (e.code === 'stop' && e.text === T.ped) return 'dq';
    if (e.code === 'unprotected') return 'dq';
    return POINTS[e.code] ?? 5;
  }
  const create = () => ({ score: START, items: [], end: null, started: false, finished: false,
    prevV: 0, brakeT: -Infinity, leftT: -Infinity, rightT: -Infinity, routeN: 0 });
  // 항목 = { t, pts, text, code } — code는 drive-score 감점 코드 그대로, 시험 전용은 start·end·hardBrake (progress.js 약점 집계)
  function deduct(ex, t, pts, text, code) {
    ex.score -= pts; ex.items.push({ t, pts, text, code });
    if (ex.score < PASS && !ex.end) ex.end = ex.finished ? '도착했지만 점수가 70점 아래예요' : '점수가 70점 아래로 내려가 시험이 중단됐어요';
  }
  // 매 스텝 끝(drive.js). events = 이번 스텝의 drive-score 감점
  function update(ex, d, events, dt) {
    if (ex.end || ex.finished) return;
    const t = d.t, v = d.car.v;
    if (d.blink === -1) ex.leftT = t;
    if (d.blink === 1) ex.rightT = t;
    if (!ex.started && Math.abs(v) > 1) {
      ex.started = true;
      if (t - ex.leftT > START_WIN) deduct(ex, t, 5, '출발할 때 왼쪽 깜빡이를 켜지 않았어요', 'start');
    }
    if (ex.prevV > HARD_V && (ex.prevV - v) / dt > HARD_DEC && t - ex.brakeT > HARD_GAP) { ex.brakeT = t; deduct(ex, t, 3, '급제동했어요 — 미리 천천히 줄이세요', 'hardBrake'); }
    ex.prevV = v;
    for (const e of events) {
      if (ex.end) return;
      const r = rule(e);
      if (r === 'dq') { ex.items.push({ t, pts: null, text: e.text, code: e.code }); ex.end = '실격 — ' + e.text; return; }
      deduct(ex, t, r, e.text, e.code);
      if (e.code === 'route' && ++ex.routeN >= ROUTE_MAX && !ex.end) ex.end = '안내를 세 번 놓쳐 시험이 중단됐어요';
    }
    if (ex.end) return;
    if (d.score.failReason) { ex.end = '실격 — ' + d.score.failReason; return; }
    if (d.score.done) {
      ex.finished = true;
      if (t - ex.rightT > END_WIN) deduct(ex, t, 5, '도착해 세울 때 오른쪽 깜빡이를 켜지 않았어요', 'end');
    }
  }
  const result = ex => ({ score: ex.score, passed: !ex.end && ex.finished && ex.score >= PASS, dq: !!ex.end && ex.end.startsWith('실격'), end: ex.end, items: ex.items.slice() });
  // 좋은 기록: 합격 > 실격 아님 > 점수 높음 > 시간 짧음 (예전 기록엔 dq가 없다 = 실격 아님)
  function better(a, b) {
    if (!b) return true;
    if (a.passed !== b.passed) return a.passed;
    if (!!a.dq !== !!b.dq) return !a.dq;
    if (a.score !== b.score) return a.score > b.score;
    return a.time < b.time;
  }
  return { PASS, create, update, result, better, rule };
})();
if (typeof module !== 'undefined') module.exports = PP_EXAM;
