// 붕붕이 — 성장·복습(D): 판 기록, 약점 코드, 약점 집계, 진행률, 최근 7일, 복습 묶음, 칭찬 한 줄, 다음 추천. DOM 없음.
// 판 한 줄 = { at: ms, id, kind: 'parking'|'city'|'highway'|'exam'|'yard'|'lesson', ok, time: 초, marks: [약점 코드] }
// 기록(hist)은 오래된 것 → 최신 순 배열. 함수는 입력을 바꾸지 않고 시각은 인자(now)로만 받는다.
const PP_PROGRESS = (function ppProgress() {
  const DS = typeof PP_DSCORE !== 'undefined' ? PP_DSCORE : require('./drive-score.js');
  const MAX = 300, WINDOW = 30, LESSON_W = 0.5, PRAISE_MIN_RUNS = 3, PRAISE_MIN_AVG = 0.5;
  const CATS = ['lesson', 'parking', 'city', 'highway', 'exam'];

  const m = (name, tip, missions) => ({ name, tip, missions });
  const MARKS = {
    // 시내·고속도로·도로주행시험 감점(drive-score 코드)
    blink: m('깜빡이', '차선 변경·회전 1초 전에 깜빡이를 켜 두세요', ['city-lane', 'city-uturn', 'city-leftlane', 'city-merge', 'exam-a']),
    mirror: m('사이드미러 확인', '차선을 바꾸기 3초 안에 사이드미러를 보세요', ['city-lane', 'city-bus', 'hw-merge', 'city-merge']),
    solid: m('실선 차선 변경', '실선 구간에서는 차선을 바꾸지 말고 점선에서 미리 옮기세요', ['city-bus', 'city-leftlane', 'city-lane']),
    stopline: m('정지선', '정지선 앞에서 멈추도록 미리 속도를 줄이세요', ['city-signal', 'city-rightstop', 'city-school']),
    signal: m('신호 위반', '황색이면 멈출 수 있을 때 멈추고, 적색엔 정지선 앞에 서세요', ['city-signal', 'city-night', 'exam-b']),
    stop: m('일시정지·보행자', '우회전 전 적색이면 완전히 멈추고, 횡단보도에 사람이 있으면 기다리세요', ['city-rightstop', 'city-school', 'city-night']),
    unprotected: m('비보호 좌회전', '비보호 좌회전은 녹색 신호에 마주 오는 차가 없을 때만', ['city-unprotected']),
    speed: m('과속', '표지판의 제한속도를 보고 넘기 전에 발을 떼세요', ['city-school', 'city-night', 'city-rain', 'exam-a']),
    gap: m('앞차 간격', '앞차와 1초 이상(빗길 2초) 간격을 두세요', ['city-cutin', 'city-rain', 'hw-rain', 'hw-jam', 'hw-pass']),
    cutin: m('끼어들기', '옆 차로 뒤차와 충분히 떨어졌을 때 들어가세요', ['city-cutin', 'city-merge', 'hw-merge']),
    route: m('경로 이탈', '안내가 나오면 미리 그 차로로 옮겨 두세요', ['city-leftlane', 'hw-exit', 'hw-jc']),
    minSpeed: m('최저속도', '고속도로 본선에서는 50km/h 아래로 떨어지지 마세요', ['hw-merge', 'hw-pass']),
    shoulder: m('갓길 주행', '갓길은 긴급할 때만 — 차로 안을 지키세요', ['hw-jam', 'hw-rest']),
    passLane: m('1차로 주행', '1차로는 추월할 때만, 추월 후 오른쪽으로 돌아오세요', ['hw-pass']),
    mergeSlow: m('느린 합류', '가속차로에서 본선 속도까지 올린 뒤 합류하세요', ['hw-merge']),
    hazard: m('비상등', '정체·돌발 앞에서 멈추면 비상등으로 뒤차에 알리세요', ['hw-jam', 'yard']),
    tollStop: m('톨게이트 정지', '일반 차로는 정지선에서 완전히 멈췄다 출발하세요', ['hw-toll']),
    hipassSpeed: m('하이패스 속도', '하이패스 차로는 30km/h 이하로 지나세요', ['hw-toll']),
    // 도로주행시험 전용 항목
    start: m('출발 깜빡이', '출발 전에 왼쪽 깜빡이를 켜고 움직이세요', ['exam-a', 'exam-b', 'yard']),
    end: m('도착 깜빡이', '세우기 전에 오른쪽 깜빡이를 켜세요', ['exam-a', 'exam-b', 'yard']),
    hardBrake: m('급제동', '앞을 멀리 보고 미리 천천히 줄이세요', ['city-rain', 'hw-rain', 'exam-a', 'exam-b', 'hw-jam']),
    // 실패(drive-score FAIL 키)
    'fail:car': m('차와 충돌', '옆·앞 차와의 거리를 미리 확인하고 천천히 움직이세요', ['city-cutin', 'city-lane', 'city-rain', 'hw-merge']),
    'fail:ped': m('보행자와 충돌', '횡단보도 앞에서는 속도를 줄이고 사람을 먼저 보세요', ['city-rightstop', 'city-school', 'city-night']),
    'fail:wall': m('구조물 충돌', '회전할 때 바깥으로 크게 돌지 말고 차로를 따라가세요', ['city-uturn', 'city-leftlane', 'lesson-city']),
    'fail:reverse': m('역주행', '회전 뒤에는 오른쪽 차로로 들어가세요', ['city-uturn', 'city-leftlane']),
    'fail:offroad': m('도로 이탈', '회전 중에도 차로 가운데를 보고 핸들을 맞추세요', ['city-uturn', 'lesson-city']),
    'fail:accelEnd': m('합류 실패', '가속차로가 끝나기 전에 본선 틈을 골라 들어가세요', ['hw-merge']),
    'fail:tollLane': m('하이패스 차로 오진입', '단말기가 없으면 일반 차로(파란색 아님)로 가세요', ['hw-toll']),
    'fail:missedExit': m('출구·분기 놓침', '출구 안내 1km 전부터 바깥 차로로 옮기세요', ['hw-exit', 'hw-jc']),
    'fail:laneEnd': m('차로 감소 합류 실패', '차로가 끝나기 전에 깜빡이를 켜고 옆 차로로 합류하세요', ['city-merge']), // 차로 감소는 city-merge에만 있다
    'fail:other': m('주행 실패', '천천히 다시 해 보세요', []),
    // 주차
    contact: m('접촉', '천천히 움직이고 모서리가 가까우면 멈췄다 다시 꺾으세요', ['mall-mart', 'apt-pillar', 'special-tower']),
    switches: m('전후진 전환', '들어가기 전에 차를 칸과 나란히 맞추면 덜 왔다 갔다 해요', ['street-uturn', 'street-parallel', 'apt-piloti']),
    bump: m('방지턱 과속', '방지턱 앞에서 10km/h 아래로 줄이세요', ['apt-bump']),
    // 장내기능
    curb: m('연석 접촉', '코너 전에 바깥쪽에 붙고 천천히 도세요', ['yard', 'street-corner']),
    hill: m('경사로', '정지 구역에 완전히 멈췄다가 브레이크에서 엑셀로 빠르게 옮기세요', ['yard', 'street-hill-start', 'apt-ramp']),
    tpark: m('직각주차', '칸을 지나친 뒤 후진으로 넣고, 2분 안에 마치세요', ['yard', 'apt-pillar', 'mall-mart']),
    blinkCorner: m('회전 깜빡이', '코너 진입선 전에 도는 쪽 깜빡이를 켜세요', ['yard', 'city-uturn']),
    accel: m('가속 구간', '가속 구간에서는 20km/h 넘게 밟으세요', ['yard']),
    alarm: m('돌발 정지', '"돌발!"이 뜨면 바로 멈추고 비상등을 켜세요', ['yard', 'hw-jam']),
    light: m('신호교차로', '빨간불이면 정지선 앞에 멈췄다가 초록불에 가세요', ['yard', 'city-signal']),
    // 레슨
    retry: m('레슨 다시 하기', '안내 문구를 끝까지 읽고 천천히 따라 하세요', ['lesson-controls', 'lesson-parking', 'lesson-city']),
  };

  // 시험·장내기능 항목은 code를 들고 온다(exam.js·yard.js). 아래 문구 → 코드는 code가 없던 예전 결과용
  // 문구 → 코드(도로주행시험 항목)
  const DRIVE_TEXT = { blink: 'blink', mirror: 'mirror', solid: 'solid', bus: 'solid', stopline: 'stopline', red: 'signal', yellow: 'signal', left: 'signal',
    stop: 'stop', ped: 'stop', unprotected: 'unprotected', gap: 'gap', gapRain: 'gap', gapHw: 'gap', cutin: 'cutin', route: 'route' };
  const textCode = {};
  for (const [k, code] of Object.entries(DRIVE_TEXT)) if (typeof DS.TEXT[k] === 'string') textCode[DS.TEXT[k]] = code;
  for (const k of Object.keys(DS.TEXT)) if (typeof DS.TEXT[k] === 'string' && !textCode[DS.TEXT[k]]) textCode[DS.TEXT[k]] = k;
  function examCode(text) {
    if (textCode[text]) return textCode[text];
    if (/^제한속도를 넘었어요/.test(text)) return 'speed';
    if (/^출발할 때/.test(text)) return 'start';
    if (/^도착해 세울 때/.test(text)) return 'end';
    if (/^급제동/.test(text)) return 'hardBrake';
    return null;
  }
  const failCode = reason => {
    const k = Object.keys(DS.FAIL).find(k => DS.FAIL[k] === reason);
    return 'fail:' + (k || 'other');
  };
  // 장내기능 항목 문구 → 코드(yard.js CODES: TEXT 키 → 코드)
  let yardCode = null;
  function yardText(text) {
    if (!yardCode) {
      const Y = typeof PP_YARD !== 'undefined' ? PP_YARD : require('./yard.js');
      yardCode = {};
      for (const [k, code] of Object.entries(Y.CODES)) yardCode[Y.TEXT[k]] = code;
    }
    return yardCode[text] || null;
  }
  const rep = (code, n) => Array.from({ length: Math.max(0, n | 0) }, () => code);

  // 종류별 결과 → 약점 코드. ref = 주차 맵(par) 등
  function marksOf(kind, result, ref) {
    const r = result || {};
    if (kind === 'parking') {
      const bumps = Math.min(r.bumps || 0, r.contacts || 0), par = ref && ref.par != null ? ref.par : 2;
      return rep('contact', (r.contacts || 0) - bumps).concat(rep('bump', bumps), (r.switches || 0) > par ? ['switches'] : []);
    }
    if (kind === 'city' || kind === 'highway') {
      const out = (r.penalties || []).map(p => p.code);
      if (r.failReason) out.push(failCode(r.failReason));
      return out;
    }
    if (kind === 'exam') {
      const out = (r.items || []).map(i => i.code || examCode(i.text)).filter(Boolean);
      // 실격 사유가 주행 실패(충돌 등)면 fail 코드. 감점 항목 실격은 항목에 이미 들어 있다
      if (r.end && r.end.startsWith('실격 — ')) {
        const why = r.end.slice('실격 — '.length);
        if (Object.values(DS.FAIL).includes(why)) out.push(failCode(why));
      }
      return out;
    }
    if (kind === 'yard') return (r.items || []).map(i => i.code || yardText(i.text)).filter(Boolean);
    if (kind === 'lesson') return rep('retry', typeof result === 'number' ? result : r.retries || 0);
    return [];
  }

  // max는 실제 판만 센다 — 넘치면 가장 오래된 실제 판부터 버리고 seed(진행률)는 남긴다
  function record(hist, entry, max = MAX) {
    const h = (hist || []).concat([entry]);
    let drop = h.filter(e => !e.seed).length - max;
    return drop > 0 ? h.filter(e => e.seed || drop-- <= 0) : h;
  }

  // 예전 최고 기록으로 채운 판(seed)은 진행률·추천에만 쓴다 — 약점·7일·칭찬에서는 뺀다
  const real = hist => (hist || []).filter(e => !e.seed);

  // 최근 n판의 코드별 횟수(레슨 0.5) → 판당 빈도 순 최대 3개. 동률: 최근에 받은 것 → 코드 순
  // runs = 그 실수가 한 번이라도 나온 판 수(화면 "최근 N판 중 n판에서" — 횟수와 달리 N을 넘지 않는다)
  function weak(hist, n = WINDOW) {
    const win = real(hist).slice(-n), cnt = {}, last = {}, runs = {};
    win.forEach((e, i) => {
      const w = e.kind === 'lesson' ? LESSON_W : 1;
      for (const c of e.marks || []) { cnt[c] = (cnt[c] || 0) + w; last[c] = i; }
      for (const c of new Set(e.marks || [])) runs[c] = (runs[c] || 0) + 1;
    });
    return Object.keys(cnt)
      .sort((a, b) => cnt[b] - cnt[a] || last[b] - last[a] || (a < b ? -1 : a > b ? 1 : 0))
      .slice(0, 3)
      .map(code => ({ code, count: cnt[code], runs: runs[code], perRun: cnt[code] / win.length,
        name: MARKS[code] ? MARKS[code].name : code, tip: MARKS[code] ? MARKS[code].tip : '' }));
  }

  // 실제 목록에서 분류별 id. 브라우저는 전역, Node는 require
  function catalog() {
    const node = typeof require === 'function';
    const maps = typeof PP_MAPS !== 'undefined' ? PP_MAPS : node ? require('./maps.js') : null;
    const mis = typeof PP_MISSIONS !== 'undefined' ? PP_MISSIONS : node ? require('./missions.js') : null;
    if (node && typeof PP_MISSIONS === 'undefined') { require('./missions-highway.js'); require('./missions-exam.js'); } // list에 붙는다
    const les = typeof PP_LESSONS !== 'undefined' ? PP_LESSONS : node ? require('./lessons.js') : null;
    if (node && typeof PP_YARD === 'undefined') require('./yard.js'); // PP_LESSONS에 'yard' 등록
    const ids = (list, group) => (list || []).filter(x => !group || x.group === group).map(x => x.id);
    const ml = mis ? mis.list : [];
    return { lesson: les ? ids(les.list) : [], parking: maps ? ids(maps.list) : [], city: ids(ml, 'city'), highway: ids(ml, 'highway'),
      exam: ids(ml, 'exam').concat(les && les.byId('yard') ? ['yard'] : []) };
  }

  const passedIds = hist => new Set((hist || []).filter(e => e.ok).map(e => e.id));
  function progressOf(hist, cat) {
    const ok = passedIds(hist), out = {};
    for (const c of CATS) { const ids = cat[c] || []; out[c] = { done: ids.filter(id => ok.has(id)).length, total: ids.length }; }
    return out;
  }

  // 최근 7일(지역 날짜) 판 수, 오래된 날 → 오늘
  function days(hist, now) {
    const d = new Date(now), out = [];
    for (let i = 6; i >= 0; i--) {
      const a = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i).getTime();
      const b = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i + 1).getTime();
      out.push(real(hist).filter(e => e.at >= a && e.at < b).length);
    }
    return out;
  }

  // 복습 묶음: 관련 미션 중 최근 그 코드를 받은 것 → 안 해 본 것 → 나머지, 최대 3개(카탈로그에 있는 id만)
  function reviewSet(hist, code, cat) {
    const mk = MARKS[code];
    if (!mk) return [];
    const all = new Set([].concat(...CATS.map(c => (cat && cat[c]) || [])));
    const rel = mk.missions.filter(id => all.has(id)), h = hist || [], out = [];
    const add = id => { if (out.length < 3 && !out.includes(id)) out.push(id); };
    for (let i = h.length - 1; i >= 0; i--) if (rel.includes(h[i].id) && (h[i].marks || []).includes(code)) add(h[i].id);
    const played = new Set(h.map(e => e.id));
    rel.filter(id => !played.has(id)).forEach(add);
    rel.forEach(add);
    return out;
  }

  // 이번 판 코드 수가 같은 종류 최근 30판 평균보다 줄었으면 한 줄(가장 많이 준 코드 하나)
  function praise(hist, entry) {
    let h = hist || [];
    if (h[h.length - 1] === entry) h = h.slice(0, -1);
    const win = real(h).filter(e => e.kind === entry.kind).slice(-WINDOW);
    if (win.length < PRAISE_MIN_RUNS) return null;
    const sum = {};
    for (const e of win) for (const c of e.marks || []) sum[c] = (sum[c] || 0) + 1;
    const now = {};
    for (const c of entry.marks || []) now[c] = (now[c] || 0) + 1;
    let best = null;
    for (const c of Object.keys(sum).sort()) {
      const avg = sum[c] / win.length, drop = avg - (now[c] || 0);
      if (avg >= PRAISE_MIN_AVG && drop > 0 && (!best || drop > best.drop)) best = { c, avg, drop };
    }
    if (!best) return null;
    const name = MARKS[best.c] ? MARKS[best.c].name : best.c;
    return `${name} 실수가 줄었어요 (최근 ${win.length}판 평균 ${Math.round(best.avg * 10) / 10} → 이번 ${now[best.c] || 0})`;
  }

  // 다음 추천: 아직 통과 못 한 것 중 레슨 → 첫 주차 맵 → 시내 → 고속도로 → 시험 → 나머지 주차
  function nextUp(hist, cat) {
    const ok = passedIds(hist), p = cat.parking || [];
    const order = [].concat(cat.lesson || [], p.slice(0, 1), cat.city || [], cat.highway || [], cat.exam || [], p.slice(1));
    return order.find(id => !ok.has(id)) || null;
  }

  // 복습 묶음 상태 rv = { code, ids, i, runs, n, played }. 판이 끝나면 reviewStep(지금 미션 id면 판 수·그 코드 횟수를 더하고 played),
  // [다음]은 reviewAdvance: 아직 이번 미션을 안 끝냈으면 null(복습 아님 취급), 남았으면 { rv, launch: 다음 id }, 끝이면 { rv: null, summary }
  const reviewStart = (code, ids) => ({ code, ids, i: 0, runs: 0, n: 0, played: false });
  function reviewStep(rv, id, marks) {
    if (!rv || rv.ids[rv.i] !== id) return rv;
    return Object.assign({}, rv, { runs: rv.runs + 1, n: rv.n + (marks || []).filter(c => c === rv.code).length, played: true });
  }
  function reviewAdvance(rv) {
    if (!rv || !rv.played) return null;
    const nx = Object.assign({}, rv, { i: rv.i + 1, played: false });
    if (nx.i < nx.ids.length) return { rv: nx, launch: nx.ids[nx.i], summary: null };
    return { rv: null, launch: null, summary: { code: rv.code, runs: rv.runs, n: rv.n } };
  }

  // 기존 플레이어: 예전 최고 기록·레슨 완료로 통과 한 줄씩(seed: true, marks 없음) — 진행률·다음 추천에 반영
  // get(key) = 저장값(main.js store.get). 주차 최고 기록은 끝까지 넣었을 때만, 주행·시험은 passed일 때만 저장값을 인정
  function seedHistory(get, cat, now) {
    const out = [], add = (id, kind, rec) => out.push({ at: now, id, kind, ok: true, time: rec && typeof rec.time === 'number' ? rec.time : 0, marks: [], seed: true });
    for (const id of cat.lesson || []) if (get('pp-lesson-done-' + id)) add(id, 'lesson', null);
    for (const id of cat.parking || []) { const b = get('pp-best-' + id); if (b) add(id, 'parking', b); }
    for (const k of ['city', 'highway']) for (const id of cat[k] || []) { const b = get('pp-drive-best-' + id); if (b && b.passed) add(id, k, b); }
    for (const id of cat.exam || []) { const b = get('pp-exam-best-' + id); if (b && b.passed) add(id, id === 'yard' ? 'yard' : 'exam', b); }
    return out;
  }
  // 기록에 통과 줄이 없는 id만 seed로 앞에 붙인다 — 판 기록이 이미 있는 플레이어도 예전 최고 기록이 진행률에 들어가게
  function withSeeds(hist, get, cat, now) {
    const ok = passedIds(hist);
    return seedHistory(get, cat, now).filter(e => !ok.has(e.id)).concat(hist || []);
  }

  return { MAX, WINDOW, MARKS, record, marksOf, weak, catalog, progressOf, days, reviewSet, praise, nextUp, reviewStart, reviewStep, reviewAdvance, seedHistory, withSeeds };
})();
if (typeof module !== 'undefined') module.exports = PP_PROGRESS;
