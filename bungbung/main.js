// 붕붕이 — 메뉴, 게임 루프, 충돌 처리, HUD, 결과 화면, 기록 저장.
const DT = 1 / 60;
const SPEC = PP_CAR.SELTOS; // 차종을 바꾸려면 이 사양만 바꾼다(맵 시작 자세·화면 크기 모두 사양을 따른다).
const VIEWS = ['driver', 'rear', 'top'];
const VIEW_NAME = { driver: '운전석', rear: '후방', top: '위에서' };
const GOAL_KIND = { slot: '칸에 넣기', zone: '영역 도착', beside: '옆에 붙이기' };
const $ = id => document.getElementById(id);

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; /* 저장 실패해도 계속 */ } },
};

// 터치 힌트: 차례로 하나씩, 각각 한 번만(store에 기억). when이 참이 되면 뜨고 5초 뒤 또는 done이면 사라진다.
const touchHintEl = $('touch-hint');
const TOUCH_HINTS = [
  { key: 'pp-touch-hint2', text: '핸들은 엄지로 원을 따라 돌리세요. 회전 중에 떼면 실제 차처럼 핸들이 풀려요', when: () => true, done: () => inp.grab },
  { key: 'pp-gas-hint', text: '엑셀을 누른 채 아래로 밀면 그 깊이에서 멈춰요. 살살 가속할 때 쓰세요', when: () => [...inp.pedals.values()].some(p => p.kind === 'gas') && inp.depth.gas >= 1, done: () => false },
];
let touchHintUntil = 0;
const shownHints = new Set(); // 저장이 막힌 브라우저(사생활 모드 등)에서도 한 번만
function touchHint(ts) {
  const h = TOUCH_HINTS.find(x => !shownHints.has(x.key) && !store.get(x.key));
  if (!document.body.classList.contains('touch') || !h) return;
  if (!touchHintUntil) { if (!h.when()) return; touchHintUntil = ts + 5000; touchHintEl.textContent = h.text; touchHintEl.hidden = false; }
  if (ts > touchHintUntil || h.done()) { touchHintEl.hidden = true; touchHintUntil = 0; shownHints.add(h.key); store.set(h.key, true); }
}

const r = PP_RENDER.create($('view'));
const inp = PP_INPUT.create(document.body);
const audio = PP_AUDIO.create();
const navui = PP_NAVUI.create(document);
const game = { mode: 'menu', map: null, car: null, run: null, view: 'driver', acc: 0, last: 0, group: 'apt', menuKind: 'parking', cityGroup: 'city', noticeUntil: 0, brakeAt: -Infinity, contacts: 0, inclineTop: '', lesson: null, blink: 0, armed: false, hazard: false };

const fmtClock = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const fmtSec = t => (t < 60 ? Math.round(t) + '초' : Math.floor(t / 60) + '분 ' + Math.round(t % 60) + '초');
const fmtRecord = b => '접촉 ' + b.contacts + ' · 전환 ' + b.switches + ' · ' + fmtSec(b.time);
function setText(el, s) { if (el.textContent !== s) el.textContent = s; }

function goalText(map) {
  const g = map.goal;
  if (map.via && !game.run.via) return '먼저 파란 영역에 다녀오세요';
  if (g.type === 'slot') {
    const how = g.face === 'out' ? '후진으로 ' : g.face === 'in' ? '앞으로 ' : '';
    return '초록 칸에 ' + how + '넣고 P로 바꾸세요';
  }
  if (g.type === 'zone') return '초록 영역까지 가서 멈추세요' + (g.th != null ? ' (반대 방향을 보고)' : '');
  const side = g.side === 'fuel' ? (SPEC.fuelSide === 'left' ? '주유구 쪽(왼쪽)' : '주유구 쪽(오른쪽)') : g.side === 'left' ? '운전석 쪽' : '조수석 쪽';
  return side + '을 초록 선에 붙여 멈추세요';
}

// ── 레이아웃: 짧은 가로 화면(휴대폰)에서는 사이드미러를 핸들·페달 위 빈 띠에, 후방 인셋은 계기판 바로 위에 ──
function layout() {
  const short = window.innerHeight < 500, touch = document.body.classList.contains('touch');
  // 사이드미러: 실제처럼 앞유리 좌우 아래 모서리. 휴대폰은 핸들·페달 바로 위.
  // 190: 페달 바로 위까지 내려 오른쪽 위 미니맵과 겹치지 않게(작은 폰 375px 높이 기준)
  r.layout.mirrorY = touch || short ? Math.min(0.6, 190 / window.innerHeight) : 0.3;
  const city = document.body.classList.contains('city');
  r.layout.roomW = short ? (city ? 0.14 : 0.2) : 0.22; // 주행 휴대폰: 룸미러를 줄여 정지선에서 신호등이 보이게
  r.layout.topH = touch ? 18 : 14; r.layout.topLead = touch;
  // 휴대폰 주행: 왼쪽 사이드미러가 넓어지는 큰 화면에서 기어 위 깜빡이 버튼과 겹치지 않게 그 위로 올린다
  const bl = touch && (city || document.body.classList.contains('yard')) ? document.querySelector('.blink-controls').getBoundingClientRect() : null;
  r.layout.clearBelow = bl && bl.height ? { x: bl.left, y: window.innerHeight - bl.top + 4 } : null; // 위에서 보기 높이(m): 휴대폰은 핸들·페달이 가장자리를 덮으므로 더 넓게
  // 사이드미러는 핸들·페달(가장 높은 아래 조작부) 위로: 태블릿에서 큰 미러가 조작부를 덮지 않게. HUD가 숨겨져 있으면 null
  const ctl = touch ? ['.t-wheel', '.t-right'].map(s => document.querySelector(s).getBoundingClientRect()).filter(c => c.height) : [];
  r.layout.ctlTop = ctl.length ? window.innerHeight - Math.min(...ctl.map(c => c.top)) : null;
  r.layout.roomTop = city ? (short ? 76 : 92) : 12; // 주행: 내비 패널 아래
  r.layout.insetBottom = short ? 108 : 120;
  r.layout.insetW = short ? 0.29 : 0.36;
  PP_RENDER.resize(r);
  game.inclineTop = Math.round(r.layout.roomBottom + 8) + 'px'; // 운전석: 룸미러 바로 아래
}
// 휴대폰 세로: 회전 안내가 뜨면 주행은 멈춘다(메뉴). '그냥 계속'을 누르면 이번 세션은 안내·멈춤 없음
const portraitPhone = () => document.body.classList.contains('touch') && !document.body.classList.contains('rotate-skip') && matchMedia('(orientation: portrait) and (max-width: 600px)').matches;
// 첫 터치로 body.touch가 붙을 때도 resize가 온다(input.js) → 레슨 단계 안내를 터치 문구로 바로 바꾼다
window.addEventListener('resize', () => { layout(); if (game.lesson && game.mode === 'drive') paintStep(); if (game.mode === 'drive' && portraitPhone()) openMenu(); });
$('rotate-skip').addEventListener('click', () => document.body.classList.add('rotate-skip'));

// ── 게임 시작/메뉴/결과 ──
function loadScene(map) {
  game.city = null;
  navui.voice.stop(); PP_INPUT.reset(inp); document.body.classList.remove('city');
  layout();
  $('drive-toast').hidden=true;$('res-penalties').hidden=true;$('res-reason').hidden=true;
  $('res-switches').parentElement.hidden=false;
  setText($('res-next'),'다음 맵');
  $('st-contacts').firstChild.textContent='접촉';
  document.querySelector('#res-contacts').previousElementSibling.textContent='접촉';
  game.map = map;
  game.car = PP_CAR.create(PP_MAPS.startPose(map, SPEC), SPEC);
  game.run = PP_SCORE.createRun(map);
  game.contacts = 0;
  PP_RENDER.loadMap(r, map);
  PP_RENDER.showGoal(r, map.via || map.goal, !!map.via);
}

function start(map) {
  game.lesson = null; document.body.classList.remove('lesson', 'yard');
  document.querySelectorAll('.lesson-glow').forEach(e => e.classList.remove('lesson-glow')); $('lesson-toast').hidden = true; // 레슨 도중 메뉴에서 다른 맵으로 가도 강조·토스트가 남지 않게
  loadScene(map);
  game.mode = 'drive'; game.acc = 0;
  game.group = map.group; game.menuKind='parking';
  try { history.replaceState(null, '', '?map=' + map.id); } catch (e) { /* file:// 등 */ }
  setText($('hud-map'), map.name);
  setText($('hud-goal'), goalText(map));
  setText($('hud-tip'), map.tip);
  $('hud-tip').hidden = false;
  $('hud').hidden = false; $('menu').hidden = true; $('result').hidden = true;
  layout(); // HUD가 보인 뒤 다시: 사이드미러가 핸들·페달 실제 위치를 피하도록
}

// 주행 미션 시작·HUD·기록. 주차 상태와 분리한다.
function startDrive(mission) {
  game.lesson = null; document.body.classList.remove('lesson', 'yard');
  document.querySelectorAll('.lesson-glow').forEach(e => e.classList.remove('lesson-glow')); $('lesson-toast').hidden = true; // 레슨 도중 메뉴에서 다른 맵으로 가도 강조·토스트가 남지 않게
  PP_INPUT.reset(inp); document.body.classList.add('city'); game.menuKind='city'; game.cityGroup=mission.group||'city';
  layout();
  const d = game.city = PP_DRIVE.create(mission, SPEC);
  PP_NAVUI.reset(navui,d);
  $('res-switches').parentElement.hidden=true;
  setText($('res-next'),'다음 미션');
  const lab = mission.exam ? '점수' : '감점';
  $('st-contacts').firstChild.textContent=lab;
  document.querySelector('#res-contacts').previousElementSibling.textContent=lab;
  game.car = d.car; game.map = { ...mission, obstacles: [], floors: [], ramps: [] };
  game.run = d.score; game.mode = 'drive'; game.acc = 0;
  const road = PP_RROAD.load(r, d.net, { highway: !!mission.highway, night: mission.timeOfDay === 'night', weather: mission.weather });
  if (mission.highway) PP_RHWR.load(r, d.net, road); // 분리대·가드레일·문형 기둥·부스도 충돌 상자로
  d.obstacles = road.obstacles;
  game.view = 'driver'; PP_RENDER.setView(r, game.view);
  try { history.replaceState(null, '', '?drive=' + mission.id); } catch (e) { /* file:// */ }
  setText($('hud-map'), mission.name); setText($('hud-tip'), mission.tip);
  $('hud-tip').hidden = false; $('hud').hidden = false; $('menu').hidden = true; $('result').hidden = true;
  layout(); // HUD가 보인 뒤 다시: 사이드미러가 깜빡이 버튼 실제 위치를 피하도록
}
function cityHud(ts, ctl) {
  const d = game.city;
  PP_NAVUI.update(navui,d,audio);
  gearEls.forEach(e => e.classList.toggle('is-on', e.textContent === d.car.gear));
  tGearEls.forEach(e => e.classList.toggle('is-on', e.dataset.gear === d.car.gear));
  setText($('speed'), String(Math.round(Math.abs(d.car.v)*3.6)));
  $('steer-icon').setAttribute('transform', 'rotate('+ -d.car.wheel +')');
  $('t-wheel-g').setAttribute('transform', 'rotate('+ -d.car.wheel +')');
  setText($('steer-deg'), Math.round(Math.abs(d.car.wheel))+'°');
  setText($('steer-dir'), d.blink === -1 ? '◀ 좌측' : d.blink === 1 ? '우측 ▶' : '가운데');
  setText($('st-contacts').querySelector('b'), String(d.exam ? d.exam.score : d.score.penalties.length));
  if (d.exam) setText($('hud-map'), d.mission.name + ' · ' + d.exam.score + '점'); // 터치·좁은 화면은 상태 칸이 숨으니 점수를 왼쪽 위에도
  setText($('st-time'), fmtClock(d.t)); setText($('st-switches'), '0');
  $('hud-tip').hidden = !game.lesson && d.t > 8; $('incline').hidden = true; $('sn-front').hidden = true; $('sn-rear').hidden = true;
  for (const [kind, depth] of [['gas',ctl.throttle],['brake',ctl.brake]]) {
    const pct = Math.round(depth*100)+'%'; pedalEls[kind].style.setProperty('--depth',pct); $('pd-'+kind).style.width=pct;
  }
  touchHint(ts); $('notice').hidden = ts > game.noticeUntil; setText($('btn-view'), VIEW_NAME[game.view]);
}
function cityResult() {
  $('result').classList.remove('is-lesson');
  const d=game.city, res=PP_DSCORE.result(d.score); game.mode='result';
  PP_INPUT.reset(inp);navui.voice.stop();PP_AUDIO.setDistance(audio,Infinity);
  if(d.exam){examResult(d,res.time);return;}
  const key='pp-drive-best-'+d.mission.id,prev=store.get(key);
  const isBest=res.passed && PP_DSCORE.better(res,prev);
  if(isBest)store.set(key,res);
  setText($('res-map'),d.mission.name);setText($('res-grade'),res.passed?'통과':'다시 연습');
  $('res-grade').classList.toggle('is-perfect',res.passed && !res.penalties.length);
  setText($('res-contacts'),res.penalties.length+'건');setText($('res-time'),fmtSec(res.time));
  setText($('res-reason'),res.failReason || (res.penalties.length?'감점 내용을 확인하고 다시 연습해 보세요.':'감점 없이 목적지에 도착했어요.'));
  $('res-reason').hidden=false;
  const list=$('res-penalties');list.textContent='';list.hidden=!res.penalties.length;
  for(const p of res.penalties){const li=document.createElement('li');li.textContent=fmtClock(p.t)+' · '+p.text;list.append(li);}
  setText($('res-best'),isBest?(prev?'최고 기록을 새로 세웠어요':'첫 통과 기록을 저장했어요'):prev?'최고 기록 · '+fmtDriveRecord(prev):'통과하면 최고 기록을 저장해요');
  $('res-best').classList.toggle('is-new',isBest);$('result').hidden=false;$('hud').hidden=true;
  $('res-retry').focus({preventScroll:true});
  const kind=d.mission.group==='highway'?'highway':'city';
  logRun(kind,d.mission.id,res.passed,res.time,PP_PROGRESS.marksOf(kind,res));
}
function examResult(d, time) {
  const ex = PP_EXAM.result(d.exam);
  examCard(d.mission, ex, time, PP_EXAM.PASS, d.score.failReason);
  logRun('exam', d.mission.id, ex.passed, time, PP_PROGRESS.marksOf('exam', ex));
}
// 시험 결과 카드(도로주행 B1·장내기능 공용). m = { id, name }
function examCard(m, ex, time, pass, fail) {
  const rec={score:ex.score,passed:ex.passed,dq:ex.dq,time};
  const key='pp-exam-best-'+m.id,prev=store.get(key),isBest=PP_EXAM.better(rec,prev);
  if(isBest)store.set(key,rec);
  setText($('res-map'),m.name);setText($('res-grade'),ex.passed?'합격':ex.dq?'실격':'불합격');
  $('res-grade').classList.toggle('is-perfect',ex.passed && ex.score===100);
  setText($('res-contacts'),ex.score+'점');setText($('res-time'),fmtSec(time));
  setText($('res-reason'),ex.passed?'합격선 '+pass+'점 · 실제 시험과 다를 수 있어요':(ex.end||fail||'목적지에 도착하지 못했어요')+' · 실제 시험과 다를 수 있어요');
  $('res-reason').hidden=false;
  const list=$('res-penalties');list.textContent='';list.hidden=!ex.items.length;
  for(const p of ex.items){const li=document.createElement('li');li.textContent=fmtClock(p.t)+' · '+(p.pts==null?'실격':'−'+p.pts)+' · '+p.text;list.append(li);}
  setText($('res-best'),isBest?(prev?'최고 기록을 새로 세웠어요':'첫 기록을 저장했어요'):'최고 기록 · '+prev.score+'점 · '+examVerdict(prev));
  $('res-best').classList.toggle('is-new',isBest);$('result').hidden=false;$('hud').hidden=true;
  $('res-retry').focus({preventScroll:true});
}
const examVerdict = b => b.passed?'합격':b.dq?'실격':'불합격'; // 예전 기록엔 dq가 없다
const fmtExamRecord = b => '최고 '+b.score+'점 · '+examVerdict(b);
const fmtDriveRecord = b => '감점 '+b.penalties.length+' · '+fmtSec(b.time);

function cardEl(name, tip, foot, recText, recNone, onClick) {
  const card = document.createElement('button');
  card.className = 'card';
  card.innerHTML = '<span class="card-name"></span><span class="card-tip"></span><span class="card-foot"><span></span><span class="rec"></span></span>';
  card.querySelector('.card-name').textContent = name;
  card.querySelector('.card-tip').textContent = tip;
  card.querySelector('.card-foot span').textContent = foot;
  const rec = card.querySelector('.rec');
  rec.textContent = recText; rec.classList.toggle('is-none', recNone);
  card.addEventListener('click', () => { game.review = null; onClick(); }); // 메뉴에서 다른 판을 고르면 복습 묶음은 끝
  return card;
}
function renderMenu() {
  const tabs = $('tabs'), cards = $('cards'), kind = game.menuKind;
  for (const k of MODES) $('mode-' + k).setAttribute('aria-selected', String(k === kind));
  tabs.textContent = ''; cards.textContent = '';
  tabs.hidden = kind === 'lesson' || kind === 'records';
  if (kind === 'records') { renderRecords(cards); return; }
  if (kind === 'lesson') {
    for (const l of PP_LESSONS.list) {
      const done = !!store.get('pp-lesson-done-' + l.id);
      cards.append(cardEl(l.name, l.tip, l.steps.length + '단계', done ? '완료' : '아직 안 함', !done, () => startLesson(l)));
    }
    return;
  }
  const city = kind === 'city';
  const groups = city ? [{ id: 'city', name: '시내' }, { id: 'highway', name: '고속도로' }, { id: 'exam', name: '면허시험' }] : PP_MAPS.GROUPS, cur = city ? game.cityGroup : game.group;
  const inCity = x => (x.group || 'city') === game.cityGroup;
  tabs.setAttribute('aria-label', city ? '주행 종류' : '주차 장소');
  for (const g of groups) {
    const b = document.createElement('button');
    b.className = 'tab'; b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(g.id === cur));
    b.textContent = g.name;
    const n = document.createElement('span');
    n.className = 'num'; n.textContent = (city ? PP_MISSIONS.list.filter(x => (x.group || 'city') === g.id) : PP_MAPS.list.filter(x => x.group === g.id)).length + (g.id === 'exam' ? 1 : 0); // 면허시험: 장내기능 카드
    b.append(n);
    b.addEventListener('click', () => { if (city) game.cityGroup = g.id; else game.group = g.id; renderMenu(); });
    tabs.append(b);
  }
  if (city && game.cityGroup === 'exam') { const y = PP_LESSONS.byId('yard'), b = store.get('pp-exam-best-yard'); cards.append(cardEl(y.name, y.tip, '장내기능 · 80점 합격', b ? fmtExamRecord(b) : '기록 없음', !b, () => startLesson(y))); }
  for (const m of (city ? PP_MISSIONS.list.filter(inCity) : PP_MAPS.list.filter(x => x.group === game.group))) {
    if (m.exam) { const b = store.get('pp-exam-best-' + m.id); cards.append(cardEl(m.name, m.tip, '도로주행 · 70점 합격', b ? fmtExamRecord(b) : '기록 없음', !b, () => startDrive(m))); continue; }
    const best = store.get((city ? 'pp-drive-best-' : 'pp-best-') + m.id);
    const foot = city ? (m.id === 'hw-toll' ? (m.hipass ? '하이패스 단말기 있음' : '하이패스 단말기 없음') : m.highway ? '고속도로' : '시내 주행') : GOAL_KIND[m.goal.type];
    cards.append(cardEl(m.name, m.tip, foot, best ? (city ? fmtDriveRecord(best) : fmtRecord(best)) : '기록 없음', !best, () => city ? startDrive(m) : start(m)));
  }
}

// ── D 성장·복습: 판 기록(pp-history), 내 기록 탭, 복습 묶음, 결과 칭찬 줄 ──
const MODES = ['lesson', 'parking', 'city', 'records'];
const CAT = PP_PROGRESS.catalog();
const CAT_NAME = { lesson: '레슨', parking: '주차', city: '시내', highway: '고속도로', exam: '면허시험' };
let hist = (h => Array.isArray(h) ? h : [])(store.get('pp-history')); // 저장이 막혀도 이번 세션은 이 메모리로 동작
// 판 기록이 생기기 전부터 하던 플레이어: 처음 한 번 예전 최고 기록·레슨 완료로 진행률·추천을 채운다(seed — 약점·7일·칭찬엔 안 들어감).
// 판 기록이 이미 있어도(D 이후 몇 판 한 플레이어) 통과 줄이 없는 id만 앞에 붙인다
if (!store.get('pp-history-seeded')) {
  const h = PP_PROGRESS.withSeeds(hist, k => store.get(k), CAT, Date.now());
  store.set('pp-history-seeded', true);
  if (h.length !== hist.length) { hist = h; store.set('pp-history', hist); }
}
let histSaved = (() => { try { localStorage.setItem('pp-probe', '1'); localStorage.removeItem('pp-probe'); return true; } catch (e) { return false; } })(); // 마지막 판 기록 저장이 됐나(내 기록 탭 바닥 문구)
const runOf = id => PP_LESSONS.byId(id) || PP_MAPS.byId(id) || PP_MISSIONS.byId(id);
const catOf = id => Object.keys(CAT_NAME).find(c => CAT[c].includes(id));
function launch(id) { const l = PP_LESSONS.byId(id), m = PP_MAPS.byId(id); if (l) startLesson(l); else if (m) start(m); else startDrive(PP_MISSIONS.byId(id)); }
// 판이 끝날 때 한 줄 기록 + 칭찬 줄 + 복습 묶음 진행. 각 결과 지점의 맨 끝에서 부른다([다음] 문구를 덮어쓰도록)
function logRun(kind, id, ok, time, marks) {
  const entry = { at: Date.now(), id, kind, ok: !!ok, time: Math.round(time * 10) / 10, marks };
  hist = PP_PROGRESS.record(hist, entry); histSaved = store.set('pp-history', hist);
  const p = PP_PROGRESS.praise(hist, entry), el = $('res-praise');
  el.textContent = ''; el.hidden = !p;
  if (p) { const tag = document.createElement('b'); tag.className = 'praise-tag'; tag.textContent = '나아졌어요'; el.append(tag, document.createTextNode(' ' + p)); } // 띄어쓰기: 화면 낭독기가 꼬리표와 문장을 붙여 읽지 않게
  const was = game.review, rv = game.review = PP_PROGRESS.reviewStep(was, id, marks);
  if (rv !== was) setText($('res-next'), rv.i + 1 < rv.ids.length ? '다음 복습 ' + (rv.i + 2) + '/' + rv.ids.length : '복습 끝');
}
function startReview(code) {
  const ids = PP_PROGRESS.reviewSet(hist, code, CAT);
  if (!ids.length) return;
  launch(ids[0]); game.review = PP_PROGRESS.reviewStart(code, ids);
}
// [다음]: 묶음 안 다음 미션, 끝이면 요약 카드. 복습 중이 아니면 false
function reviewNext() {
  const st = PP_PROGRESS.reviewAdvance(game.review);
  if (!st) return false;
  if (st.launch) { launch(st.launch); game.review = st.rv; return true; }
  const sm = st.summary, mk = PP_PROGRESS.MARKS[sm.code]; game.review = null;
  setText($('rv-map'), '복습 · ' + mk.name);
  setText($('rv-line'), '이번 ' + sm.runs + '판에서 ' + mk.name + ' ' + sm.n + '번');
  setText($('rv-tip'), sm.n ? '요령 · ' + mk.tip : '한 번도 안 나왔어요. 잘했어요!');
  game.menuKind = 'records'; // 요약 카드에서 Esc·메뉴도 [내 기록]으로
  $('result').hidden = true; $('review-done').hidden = false;
  $('rv-records').focus({ preventScroll: true });
  return true;
}
function renderRecords(cards) {
  const add = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  if (!hist.length) cards.append(add('p', 'rec-empty', '아직 기록이 없어요 — 처음이라면 탭부터'));
  const nextId = PP_PROGRESS.nextUp(hist, CAT), nx = nextId && runOf(nextId);
  if (nx) { const c = cardEl(nx.name, nx.tip, '다음 추천 · ' + CAT_NAME[catOf(nextId)], '시작', false, () => launch(nextId)); c.classList.add('is-next'); cards.append(c); }
  if (!hist.length) return;
  // 진행률: 분류별 한 번이라도 통과한 수 / 전체
  const prog = PP_PROGRESS.progressOf(hist, CAT), pb = add('section', 'rec-block');
  pb.append(add('h2', 'rec-h', '진행률 · 한 번이라도 통과'));
  for (const c of Object.keys(CAT_NAME)) {
    const { done, total } = prog[c], row = add('div', 'rec-row'), bar = add('span', 'rec-bar'), fill = add('i');
    fill.style.width = (total ? Math.round(done / total * 100) : 0) + '%'; bar.append(fill);
    row.append(add('span', '', CAT_NAME[c]), bar, add('span', 'num', done + '/' + total));
    pb.append(row);
  }
  // 최근 7일: 날짜별 점(연습한 날 채움)과 판 수
  const ds = PP_PROGRESS.days(hist, Date.now()), db = add('section', 'rec-block'), week = add('div', 'rec-days'), now = new Date();
  db.append(add('h2', 'rec-h', '최근 7일'));
  ds.forEach((n, k) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6 + k), lab = k === 6 ? '오늘' : '일월화수목금토'[d.getDay()];
    const it = add('div', n ? 'is-on' : ''); it.setAttribute('role', 'img'); it.setAttribute('aria-label', lab + ' ' + n + '판'); // role 없는 div의 aria-label은 읽히지 않는다
    it.append(add('i'), add('span', '', lab), add('b', '', String(n)));
    week.append(it);
  });
  db.append(week, add('p', 'rec-sum', '7일 중 ' + ds.filter(Boolean).length + '일 연습 · ' + ds.reduce((a, b) => a + b, 0) + '판'));
  cards.append(pb, db);
  // 자주 틀리는 것: 최근 30판 코드별 횟수 상위 3개(레슨은 0.5로 세니 반올림)
  const w = PP_PROGRESS.weak(hist), win = Math.min(PP_PROGRESS.WINDOW, hist.filter(e => !e.seed).length), g = add('h2', 'rec-group', '자주 틀리는 것');
  if (win) g.append(add('small', '', '최근 ' + win + '판'));
  cards.append(g);
  if (!win) cards.append(add('p', 'rec-empty', '이제부터 끝낸 판에서 자주 틀리는 것을 모아 보여 줘요')); // 예전 최고 기록(seed)만 있을 때
  else if (!w.length) cards.append(add('p', 'rec-empty', '최근 ' + win + '판에서 틀린 게 없어요. 잘하고 있어요!'));
  for (const x of w) {
    const ids = PP_PROGRESS.reviewSet(hist, x.code, CAT), c = add('article', 'card is-static');
    c.append(add('span', 'card-name', x.name), add('span', 'rec-count', '최근 ' + win + '판 중 ' + x.runs + '판에서'), add('span', 'card-tip', x.tip));
    if (ids.length) { const b = add('button', 'btn btn-primary', '복습 시작 · ' + ids.length + '판'); b.addEventListener('click', () => startReview(x.code)); c.append(b); } // 관련 미션 없는 코드(fail:other)는 버튼 없음
    cards.append(c);
  }
  // 기록 지우기: 브라우저 confirm 대신 화면 안 2단계
  const cl = add('div', 'rec-clear');
  cards.append(cl);
  const paint = armed => {
    cl.textContent = '';
    if (!armed) { const b = add('button', 'btn', '기록 지우기'); b.addEventListener('click', () => paint(true)); cl.append(add('p', '', '판 기록 ' + hist.filter(e => !e.seed).length + '개 · ' + (histSaved ? '이 브라우저에만 저장돼요' : '저장이 막혀 이번 세션에만 저장돼요')), b); return b; }
    const yes = add('button', 'btn is-danger', '모두 지우기'), no = add('button', 'btn', '취소');
    // 판·약점은 지우고, 진행률은 남아 있는 최고 기록·레슨 완료로 다시 채운다(최고 기록 배지와 맞게)
    yes.addEventListener('click', () => { hist = PP_PROGRESS.seedHistory(k => store.get(k), CAT, Date.now()); histSaved = store.set('pp-history', hist); renderMenu(); $('mode-records').focus({ preventScroll: true }); });
    no.addEventListener('click', () => paint(false).focus({ preventScroll: true }));
    cl.append(add('p', '', '판 기록과 약점을 모두 지울까요? 최고 기록과 진행률은 남아요.'), yes, no);
    no.focus({ preventScroll: true });
  };
  paint(false);
}

// ── 튜토리얼 레슨: 기존 주차/주행 시작 위에 단계 판정을 얹는다. 감점·결과 화면 대신 단계 안내 ──
let lessonToastUntil = 0;
function startLesson(lesson) {
  if (lesson.kind === 'city') { const g = game.cityGroup; startDrive(lesson.mission); game.cityGroup = g; }
  else { const g = game.group; start(lesson.map); game.group = g; game.car.gear = lesson.gear; }
  game.lesson = PP_LESSONS.create(lesson); game.menuKind = 'lesson';
  game.blink = 0; game.armed = false; game.hazard = false; game.blinkPhase = null; // 다시 하기: 첫 박자 똑딱 소리를 빠뜨리거나 겹치지 않게
  if (lesson.exam) { game.car.vMax = lesson.vMax; game.menuKind = 'city'; game.cityGroup = 'exam'; document.body.classList.add('yard'); layout(); } // 장내기능: 이 코스만 최고 속도 30km/h, 메뉴는 면허시험 탭으로
  document.body.classList.add('lesson'); markAsked(); navui.voice.stop(); // 레슨은 감점 토스트·음성 안내 없음
  try { history.replaceState(null, '', '?lesson=' + lesson.id); } catch (e) { /* file:// */ }
  paintStep();
}
function paintStep() {
  const L = game.lesson, st = PP_LESSONS.step(L), touch = document.body.classList.contains('touch');
  if (L.exam) { setText($('hud-map'), L.lesson.name + ' · ' + L.exam.score + '점'); setText($('hud-goal'), (L.i + 1) + '/' + L.lesson.steps.length + ' ' + st.name + ' — ' + st.text); }
  else { setText($('hud-map'), L.lesson.name + ' · ' + (L.i + 1) + '/' + L.lesson.steps.length); setText($('hud-goal'), st.text); }
  setText($('hud-tip'), touch && st.touch ? '빛나는 곳을 쓰세요' : st.keys);
  $('hud-tip').hidden = false;
  document.querySelectorAll('.lesson-glow').forEach(e => e.classList.remove('lesson-glow'));
  if (st.touch) document.querySelectorAll(st.touch).forEach(e => e.classList.add('lesson-glow'));
  if (!game.city) PP_RENDER.showGoal(r, st.goal || PP_LESSONS.NOGOAL);
}
function lessonToast(text, retry, ts, ms) {
  const el = $('lesson-toast');
  setText(el, text); el.classList.toggle('is-retry', retry); el.hidden = false;
  lessonToastUntil = ts + (ms || (retry ? 2000 : 800));
}
function lessonTick(ts, ctl, dt, hit) {
  if (game.lesson.exam) { examTick(ts, ctl, dt, hit); return; }
  const ev = PP_LESSONS.update(game.lesson, { car: game.car, ctl, dt, d: game.city, hit });
  if (game.city) game.run = game.city.score; // 되돌리기는 시내 채점을 새로 만든다
  if (ev && ev.type === 'finish') { lessonDone(); return; }
  if (ev && ev.type === 'retry') game.lesson.retries = (game.lesson.retries || 0) + 1; // 판 기록: 레슨 약점(retry)
  if (ev) { lessonToast(ev.type === 'ok' ? '좋아요!' : '다시 해 볼까요' + (ev.reason ? ' — ' + ev.reason : ''), ev.type === 'retry', ts); paintStep(); }
  $('lesson-toast').hidden = ts > lessonToastUntil;
}
// 장내기능(시험 레슨): 감점·실격 토스트, 돌발 경고, 끝나면 시험 결과 카드
function examTick(ts, ctl, dt, hit) {
  const L = game.lesson, alarm = L.alarm;
  const ev = PP_LESSONS.update(L, { car: game.car, ctl, dt, hit, blink: game.blink, hazard: game.hazard, view: game.view });
  if (ev && ev.type === 'finish') { examDone(); return; }
  const last = ev && ev.items && ev.items[ev.items.length - 1];
  if (last) { lessonToast((last.pts == null ? '실격' : '−' + last.pts) + ' · ' + last.text, true, ts, 2500); PP_AUDIO.warning(audio); }
  else if (alarm == null && L.alarm != null) { lessonToast('돌발! 바로 멈추고 비상등', true, ts, 3000); PP_AUDIO.warning(audio); }
  else if (ev && ev.type === 'ok') lessonToast('통과 · ' + L.lesson.steps[L.i - 1].name, false, ts, 1200);
  if (ev) paintStep();
  $('lesson-toast').hidden = ts > lessonToastUntil;
}
function examDone() {
  const L = game.lesson;
  game.mode = 'result'; PP_INPUT.reset(inp); PP_AUDIO.setDistance(audio, Infinity);
  game.run.done = true; // '이어서 주행'으로 못 잇게
  document.querySelectorAll('.lesson-glow').forEach(e => e.classList.remove('lesson-glow'));
  $('lesson-toast').hidden = true;
  $('result').classList.remove('is-lesson');
  $('res-switches').parentElement.hidden = true; setText($('res-next'), '도로주행 시험');
  document.querySelector('#res-contacts').previousElementSibling.textContent = '점수';
  const ex = PP_LESSONS.examResult(L);
  examCard(L.lesson, ex, L.t, L.lesson.exam.pass, null);
  logRun('yard', L.lesson.id, ex.passed, L.t, PP_PROGRESS.marksOf('yard', ex));
}
function lessonDone() {
  const les = game.lesson.lesson, l = PP_LESSONS.list, i = l.indexOf(les), last = i === l.length - 1;
  game.mode = 'result'; PP_INPUT.reset(inp); navui.voice.stop(); PP_AUDIO.setDistance(audio, Infinity);
  store.set('pp-lesson-done-' + les.id, true);
  if (!game.city) game.run.done = true; // 주차형은 NOGOAL이라 안 켜짐 — 끝난 레슨을 '이어서 주행'으로 못 잇게
  document.querySelectorAll('.lesson-glow').forEach(e => e.classList.remove('lesson-glow'));
  $('lesson-toast').hidden = true;
  $('result').classList.add('is-lesson');
  setText($('res-map'), les.name); setText($('res-grade'), '레슨 완료');
  $('res-grade').classList.add('is-perfect');
  setText($('res-reason'), last ? '기초를 모두 익혔어요. 이제 실제 주차 맵에서 연습해 보세요.' : '다음 레슨: ' + l[i + 1].name);
  $('res-reason').hidden = false; $('res-penalties').hidden = true;
  setText($('res-next'), last ? '첫 주차 맵 하기' : '다음 레슨');
  $('result').hidden = false; $('hud').hidden = true;
  $('res-next').focus({ preventScroll: true });
  logRun('lesson', les.id, true, game.city ? game.city.t : game.run.t, PP_PROGRESS.marksOf('lesson', game.lesson.retries || 0));
}

function openMenu() {
  game.mode = 'menu';navui.voice.stop();PP_INPUT.reset(inp);
  PP_AUDIO.setDistance(audio, Infinity);
  if (game.map && !game.city && game.map.group) game.group = game.map.group; // 레슨 맵은 그룹 없음
  $('lesson-ask').hidden = true;
  $('btn-resume').hidden = !(game.run && !game.run.done && !game.run.failReason);
  renderMenu();
  $('menu').hidden = false; $('result').hidden = true; $('hud').hidden = true; $('review-done').hidden = true;
}

function resume() {
  game.mode = 'drive';PP_INPUT.reset(inp);
  $('menu').hidden = true; $('hud').hidden = false;
  layout(); // 메뉴에 있는 동안 회전·크기 변경이 있었으면 HUD 위치 기준으로 다시
}

function showResult() {
  $('result').classList.remove('is-lesson');
  if (game.city) { cityResult(); return; }
  const { map, run } = game;
  game.mode = 'result';
  PP_AUDIO.setDistance(audio, Infinity);
  const res = PP_SCORE.result(run, map);
  const rec = { contacts: res.contacts, switches: res.switches, time: res.time };
  const key = 'pp-best-' + map.id, prev = store.get(key);
  const isBest = PP_SCORE.better(rec, prev);
  if (isBest) store.set(key, rec);
  setText($('res-map'), map.name);
  setText($('res-grade'), res.grade);
  $('res-grade').classList.toggle('is-perfect', res.grade === '완벽');
  setText($('res-contacts'), res.contacts + '회');
  setText($('res-switches'), res.switches + '회');
  setText($('res-time'), fmtSec(res.time));
  const best = $('res-best');
  best.textContent = isBest ? (prev ? '최고 기록을 새로 세웠어요' : '첫 기록을 저장했어요') : '최고 기록 · ' + fmtRecord(prev);
  best.classList.toggle('is-new', isBest);
  $('result').hidden = false;
  $('res-next').focus({ preventScroll: true });
  logRun('parking', map.id, true, res.time, PP_PROGRESS.marksOf('parking', { contacts: res.contacts, switches: res.switches, bumps: run.bumps || 0 }, map));
}

function nextMap() {
  if (reviewNext()) return;
  if (game.lesson && game.lesson.exam) { startDrive(PP_MISSIONS.byId('exam-a')); return; }
  if (game.lesson) { const l = PP_LESSONS.list, i = l.indexOf(game.lesson.lesson); if (i + 1 < l.length) startLesson(l[i + 1]); else start(PP_MAPS.list[0]); return; }
  if (game.city) { const cur=game.city.mission, l=PP_MISSIONS.list.filter(x => x.group === cur.group), i=l.indexOf(cur); startDrive(l[(i+1)%l.length]); return; }
  const i = PP_MAPS.list.indexOf(game.map);
  start(PP_MAPS.list[(i + 1) % PP_MAPS.list.length]);
}

$('res-retry').addEventListener('click', () => game.lesson ? startLesson(game.lesson.lesson) : game.city ? startDrive(game.city.mission) : start(game.map));
$('res-next').addEventListener('click', nextMap);
$('res-menu').addEventListener('click', openMenu);
$('btn-resume').addEventListener('click', resume);
for (const kind of MODES) $('mode-' + kind).addEventListener('click', () => { game.menuKind = kind; renderMenu(); });
$('rv-records').addEventListener('click', () => { game.menuKind = 'records'; openMenu(); });
const voiceEnabled=$('voice-enabled');voiceEnabled.checked=store.get('pp-voice')!==false;
navui.voice.enable(voiceEnabled.checked);
voiceEnabled.addEventListener('change',()=>{navui.voice.enable(voiceEnabled.checked);store.set('pp-voice',voiceEnabled.checked);});

// ── 볼륨 ──
const vol = $('vol');
const savedVol = store.get('pp-vol');
PP_AUDIO.setVolume(audio, typeof savedVol === 'number' ? savedVol : 0.6);
vol.value = audio.vol;
vol.addEventListener('input', () => { PP_AUDIO.setVolume(audio, Number(vol.value)); store.set('pp-vol', audio.vol); });
const wake = () => { PP_AUDIO.resume(audio); navui.voice.unlock(); };
window.addEventListener('pointerdown', wake);
window.addEventListener('keydown', wake);

$('spec').textContent = '더뉴 셀토스 · 전장 ' + SPEC.length.toFixed(2) + 'm · 회전반경 ' + SPEC.turnRadius + 'm · 주유구 ' + (SPEC.fuelSide === 'left' ? '왼쪽' : '오른쪽') + '(확인 필요)';

// ── 물리 한 스텝 ──
function physicsStep(ctl) {
  const { car, map, run } = game;
  const prev = { x: car.x, y: car.y, th: car.th };
  const front = PP_CAR.toWorld(car, car.spec.wheelbase, 0);
  const zr = PP_MAPS.heightAt(map, car.x, car.y), zf = PP_MAPS.heightAt(map, front[0], front[1]);
  car.z = zr;
  PP_CAR.step(car, ctl, DT, Math.atan2(zf - zr, car.spec.wheelbase));
  const blocked = PP_COL.hit(PP_CAR.bodyBox(car), map.obstacles) >= 0;
  if (blocked) { Object.assign(car, prev); car.v = 0; }
  // 되돌린 뒤 다시 밀어붙이는 동안은 같은 접촉 1회로 센다(5cm 이상 떨어져야 접촉 끝).
  const b = PP_CAR.bodyBox(car);
  const touching = blocked || (run.touching && PP_COL.hit(Object.assign(b, { l: b.l + 0.1, w: b.w + 0.1 }), map.obstacles) >= 0);
  const hadVia = run.via;
  PP_SCORE.tick(run, map, car, DT, touching);
  if (!hadVia && run.via) { PP_RENDER.showGoal(r, map.goal); setText($('hud-goal'), goalText(map)); }
}

// ── HUD ──
const gearEls = [...$('gears').children], tGearEls = [...$('t-gears').children];
function sensor(el, d) {
  const show = d < 1.2;
  if (el.hidden === show) el.hidden = !show;
  if (!show) return;
  el.classList.toggle('is-near', d < 0.3);
  el.classList.toggle('is-mid', d >= 0.3 && d < 0.8);
  el.querySelector('i').style.width = Math.round(Math.min(1, (1.2 - d) / 0.9) * 100) + '%';
  setText(el.querySelector('.num'), d.toFixed(2) + 'm');
}
const pedalEls = { gas: document.querySelector('[data-pp="gas"]'), brake: document.querySelector('[data-pp="brake"]') };
function updateHud(ts, ctl) {
  const { car, run, map } = game;
  gearEls.forEach(e => e.classList.toggle('is-on', e.textContent === car.gear));
  tGearEls.forEach(e => e.classList.toggle('is-on', e.dataset.gear === car.gear));
  setText($('speed'), String(Math.round(Math.abs(car.v) * 3.6)));
  const w = Math.round(car.wheel);
  $('steer-icon').setAttribute('transform', 'rotate(' + -car.wheel + ')');
  $('t-wheel-g').setAttribute('transform', 'rotate(' + -car.wheel + ')');
  setText($('steer-deg'), Math.abs(w) + '°');
  setText($('steer-dir'), w > 2 ? '왼쪽' : w < -2 ? '오른쪽' : '가운데');
  setText($('st-contacts').querySelector('b'), String(run.contacts));
  $('st-contacts').classList.toggle('is-hot', run.touching);
  setText($('st-switches'), String(run.switches));
  setText($('st-time'), fmtClock(run.t));
  if (!game.lesson && run.t > 4 && !$('hud-tip').hidden) $('hud-tip').hidden = true; // 팁은 4초 뒤 접어서 시야 확보(레슨은 단계 안내라 유지)
  const sp = PP_CAR.sensorPoints(car);
  sensor($('sn-front'), PP_COL.nearest(sp.front, map.obstacles));
  sensor($('sn-rear'), PP_COL.nearest(sp.rear, map.obstacles));
  // 페달 깊이: 페달 안 채움 + HUD 막대
  for (const [kind, d] of [['gas', ctl.throttle], ['brake', ctl.brake]]) {
    const pct = Math.round(d * 100) + '%';
    pedalEls[kind].style.setProperty('--depth', pct);
    $('pd-' + kind).style.width = pct;
  }
  // 경사계: 차 앞뒤 기울기 2° 이상이면 표시(앞이 높으면 오르막)
  const deg = Math.round(car.pitch * 180 / Math.PI), tilt = Math.abs(deg) >= 2;
  if ($('incline').hidden === tilt) $('incline').hidden = !tilt;
  if (tilt) {
    const top = game.view === 'driver' ? game.inclineTop : ''; // 다른 시점은 미러가 없으니 화면 맨 위(CSS 기본값)
    if ($('incline').style.top !== top) $('incline').style.top = top;
    setText($('incline-txt'), (deg > 0 ? '오르막 ' : '내리막 ') + Math.abs(deg) + '°');
    $('incline-icon').setAttribute('transform', 'rotate(' + (-deg * 2) + ')');
  }
  touchHint(ts); $('notice').hidden = ts > game.noticeUntil;
  setText($('btn-view'), VIEW_NAME[game.view]);
}

// 장내기능: 깜빡이·비상등(시내 drive.js와 같은 규칙 — 핸들을 90° 넘게 돌렸다 풀면 깜빡이가 꺼진다)
const blinkEls = { l: $('blink-left'), r: $('blink-right'), h: $('hazard') };
function yardControls(ctl) {
  if (ctl.blinkReq) { game.blink = game.blink === ctl.blinkReq ? 0 : ctl.blinkReq; game.armed = false; }
  if (ctl.hazardReq) game.hazard = !game.hazard;
  const w = game.car.wheel;
  if (game.blink && w * -game.blink > 90) game.armed = true;
  if (game.armed && Math.abs(w) < 15) { game.blink = 0; game.armed = false; }
  const on = Math.floor(game.lesson.t * 2) % 2 === 0, phase = game.blink || game.hazard ? Math.floor(game.lesson.t * 2) : null;
  if (phase !== null && phase !== game.blinkPhase) PP_AUDIO.tick(audio);
  game.blinkPhase = phase;
  for (const [el, dir] of [[blinkEls.l, -1], [blinkEls.r, 1]]) { el.classList.toggle('is-lit', game.blink === dir && on); el.setAttribute('aria-pressed', String(game.blink === dir)); }
  blinkEls.h.setAttribute('aria-pressed', String(game.hazard));
}

// ── 루프 ──
function frame(ts) {
  const dt = Math.min((ts - (game.last || ts)) / 1000, 0.1);
  game.last = ts;
  const ctl = PP_INPUT.read(inp, game.car ? game.car.wheel : 0, dt, game.car ? game.car.v : 0);
  if (game.mode === 'drive') {
    const { car, run, map } = game;
    if (ctl.menuReq) openMenu();
    else {
      // 브레이크에서 손을 떼고 기어를 누르는 사이(휴대폰 한 손 조작) 크리핑으로 굴러도 0.4초는 밟은 것으로 본다.
      if (ctl.brake > 0) game.brakeAt = ts;
      if (ctl.gearReq && ctl.gearReq !== car.gear && !PP_CAR.setGear(car, ctl.gearReq, ts - game.brakeAt < 400)) { setText($('notice'), '정지 후 변경 — 브레이크를 밟으세요'); game.noticeUntil = ts + 2500; }
      if (ctl.viewReq) { game.view = VIEWS[(VIEWS.indexOf(game.view) + 1) % VIEWS.length]; PP_RENDER.setView(r, game.view); }
      if (game.city) PP_DRIVE.controls(game.city, ctl);
      else if (game.lesson && game.lesson.exam) yardControls(ctl);
      game.acc += dt;
      while (game.acc >= DT && !run.done && !run.failReason) {
        if (game.city) { const d=game.city, events=PP_DRIVE.step(d,ctl,DT); if (game.lesson) d.speech.length=0; else PP_NAVUI.consume(navui,d,events);
          if (d.exam && !d.brakeHinted && d.exam.items.some(i => i.code === 'hardBrake')) { d.brakeHinted = true; navui.toastQueue.push({ text: '급제동 −3 · 브레이크는 짧게 나눠 밟으세요 (꾹 누르면 급제동)' }); } // 시험 전용 감점은 drive-score 토스트에 안 나와 첫 번만 알려 준다
        } else physicsStep(ctl);
        game.acc -= DT;
      }
      if (game.lesson) lessonTick(ts, ctl, dt, game.city ? !!game.city.score.failReason : run.contacts > game.contacts);
      if (run.contacts > game.contacts) {
        game.contacts = run.contacts; PP_AUDIO.contact(audio);
        if (run.bumpHit) { run.bumpHit = false; setText($('notice'), '방지턱을 천천히 넘으세요'); game.noticeUntil = ts + 2500; } // scoring.tick이 방지턱 과속을 표시
      }
      const sp = PP_CAR.sensorPoints(car);
      // 실제 차처럼 P에서는 센서음 끔: 벽에 붙여 세운 채 시작하는 맵에서 출발 전부터 계속 울리지 않게
      PP_AUDIO.setDistance(audio, car.gear === 'P' ? Infinity : PP_COL.nearest(sp.front.concat(sp.rear, sp.left, sp.right), map.obstacles));
      if (game.city) cityHud(ts, ctl); else updateHud(ts, ctl);
      if (!game.lesson && (run.done || run.failReason)) showResult();
    }
  } else if (ctl.menuReq) {
    if (game.mode === 'menu' && game.run && !game.run.done && !game.run.failReason) resume();
    else if (game.mode === 'result') openMenu();
  }
  if (!game.city) r.focusMirror = ctl.mirrorL ? 'left' : ctl.mirrorR ? 'right' : null;
  if (game.lesson && game.lesson.exam) {
    const L = game.lesson; PP_RENDER.setLight(r, L.light);
    r.playerBlink = game.blink; r.playerHazard = game.hazard; r.blinkOn = Math.floor(L.t * 2) % 2 === 0;
  }
  if (game.city) {
    r.focusMirror = game.city.focus; r.playerBlink = game.city.blink; r.playerHazard = game.city.hazard; r.blinkOn = Math.floor(game.city.t*2)%2 === 0;
    if (r.road) PP_RROAD.update(r, PP_TRAFFIC.cars(game.city.sim), PP_TRAFFIC.peds(game.city.sim), game.city.t, game.city.player);
  }
  if (game.car) PP_RENDER.update(r, game.car, game.map);
  PP_NAVUI.mirrors(navui,r,game.mode==='drive');
  requestAnimationFrame(frame);
}

// ── 시작: ?lesson= / ?drive= / ?map=이 있으면 바로, 없으면 메뉴(처음이면 튜토리얼 권유) ──
layout();
const query = new URLSearchParams(location.search);
const initial = PP_MAPS.byId(query.get('map'));
const initialDrive = PP_MISSIONS.byId(query.get('drive'));
const initialLesson = PP_LESSONS.byId(query.get('lesson'));
const markAsked = () => { store.set('pp-tutorial-asked', true); $('lesson-ask').hidden = true; };
$('ask-start').addEventListener('click', () => { markAsked(); startLesson(PP_LESSONS.list[0]); });
$('ask-skip').addEventListener('click', markAsked);
if (initialLesson) startLesson(initialLesson);
else if (initialDrive) startDrive(initialDrive);
else if (initial) start(initial);
else {
  loadScene(PP_MAPS.list[0]); game.run = null;
  const ask = !store.get('pp-tutorial-asked');
  if (ask) game.menuKind = 'lesson';
  openMenu();
  $('lesson-ask').hidden = !ask;
  if (ask) $('ask-start').focus({ preventScroll: true });
}
requestAnimationFrame(frame);
