// 붕붕이 — 메뉴, 게임 루프, 충돌 처리, HUD, 결과 화면, 기록 저장.
const DT = 1 / 60;
const SPEC = PP_CAR.SELTOS; // 차종을 바꾸려면 이 사양만 바꾼다(맵 시작 자세·화면 크기 모두 사양을 따른다).
const VIEWS = ['driver', 'rear', 'top'];
const VIEW_NAME = { driver: '운전석', rear: '후방', top: '위에서' };
const GOAL_KIND = { slot: '칸에 넣기', zone: '영역 도착', beside: '옆에 붙이기' };
const $ = id => document.getElementById(id);

const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 실패해도 계속 */ } },
};

// 터치 첫 주행 힌트: 한 번만(store에 기억), 5초 뒤 또는 핸들을 처음 잡으면 사라진다.
const touchHintEl = $('touch-hint');
let touchHintUntil = 0;
function touchHint(ts) {
  if (!document.body.classList.contains('touch') || store.get('pp-touch-hint')) return;
  if (!touchHintUntil) { touchHintUntil = ts + 5000; touchHintEl.textContent = '회전 중에는 엄지를 핸들에서 떼지 마세요 — 떼면 실제 차처럼 핸들이 풀려요'; touchHintEl.hidden = false; }
  if (ts > touchHintUntil || inp.grab) { touchHintEl.hidden = true; store.set('pp-touch-hint', true); }
}

const r = PP_RENDER.create($('view'));
const inp = PP_INPUT.create(document.body);
const audio = PP_AUDIO.create();
const navui = PP_NAVUI.create(document);
const game = { mode: 'menu', map: null, car: null, run: null, view: 'driver', acc: 0, last: 0, group: 'apt', menuKind: 'parking', cityGroup: 'city', noticeUntil: 0, brakeAt: -Infinity, contacts: 0, inclineTop: '' };

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
  r.layout.mirrorY = touch || short ? Math.min(0.6, 205 / window.innerHeight) : 0.3;
  r.layout.roomW = short ? 0.2 : 0.22;
  r.layout.roomTop = document.body.classList.contains('city') ? (short ? 76 : 92) : 12; // 주행: 내비 패널 아래
  r.layout.insetBottom = short ? 108 : 120;
  r.layout.insetW = short ? 0.29 : 0.36;
  PP_RENDER.resize(r);
  game.inclineTop = Math.round(r.layout.roomBottom + 8) + 'px'; // 운전석: 룸미러 바로 아래
}
window.addEventListener('resize', layout);

// ── 게임 시작/메뉴/결과 ──
function loadScene(map) {
  game.city = null; dropReal();
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
  loadScene(map);
  game.mode = 'drive'; game.acc = 0;
  game.group = map.group; game.menuKind='parking';
  try { history.replaceState(null, '', '?map=' + map.id); } catch (e) { /* file:// 등 */ }
  setText($('hud-map'), map.name);
  setText($('hud-goal'), goalText(map));
  setText($('hud-tip'), map.tip);
  $('hud-tip').hidden = false;
  $('hud').hidden = false; $('menu').hidden = true; $('result').hidden = true;
}

// 실제 지도 건물·라벨(PP_RREAL) 정리. 주행을 떠나거나 다시 시작할 때.
function dropReal() { if (game.real) { PP_RREAL.dispose(game.real); game.real = null; } $('osm-attr').hidden = true; }
// 주행 미션 시작·HUD·기록. 주차 상태와 분리한다.
function startDrive(mission) {
  dropReal(); PP_INPUT.reset(inp); document.body.classList.add('city');
  if (mission.group === 'real') game.menuKind = 'real'; else { game.menuKind = 'city'; game.cityGroup = mission.group || 'city'; }
  layout();
  const d = game.city = PP_DRIVE.create(mission, SPEC);
  PP_NAVUI.reset(navui,d);
  $('res-switches').parentElement.hidden=true;
  setText($('res-next'),mission.group==='real'?'메뉴로':'다음 미션');
  $('st-contacts').firstChild.textContent='감점';
  document.querySelector('#res-contacts').previousElementSibling.textContent='감점';
  game.car = d.car; game.map = { ...mission, obstacles: [], floors: [], ramps: [] };
  game.run = d.score; game.mode = 'drive'; game.acc = 0;
  const real = mission.group === 'real';
  const road = PP_RROAD.load(r, d.net, { highway: !!mission.highway, real });
  if (real) { game.real = PP_RREAL.load(r, game.realBuildings || []); $('osm-attr').hidden = false; }
  if (mission.highway) PP_RHWR.load(r, d.net, road); // 분리대·가드레일·문형 기둥·부스도 충돌 상자로
  d.obstacles = road.obstacles;
  game.view = 'driver'; PP_RENDER.setView(r, game.view);
  if (!real) try { history.replaceState(null, '', '?drive=' + mission.id); } catch (e) { /* file:// */ }
  setText($('hud-map'), mission.name); setText($('hud-tip'), mission.tip || '');
  $('hud-tip').hidden = false; $('hud').hidden = false; $('menu').hidden = true; $('result').hidden = true;
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
  setText($('st-contacts').querySelector('b'), String(d.score.penalties.length));
  setText($('st-time'), fmtClock(d.t)); setText($('st-switches'), '0');
  $('hud-tip').hidden = d.t > 8 || !d.mission.tip; $('incline').hidden = true; $('sn-front').hidden = true; $('sn-rear').hidden = true;
  for (const [kind, depth] of [['gas',ctl.throttle],['brake',ctl.brake]]) {
    const pct = Math.round(depth*100)+'%'; pedalEls[kind].style.setProperty('--depth',pct); $('pd-'+kind).style.width=pct;
  }
  touchHint(ts); $('notice').hidden = ts > game.noticeUntil; setText($('btn-view'), VIEW_NAME[game.view]);
}
function cityResult() {
  const d=game.city, res=PP_DSCORE.result(d.score); game.mode='result';
  PP_INPUT.reset(inp);navui.voice.stop();PP_AUDIO.setDistance(audio,Infinity);
  // 실제 지도는 매번 경로가 달라 최고 기록을 비교·저장하지 않는다
  const real=d.mission.group==='real',key='pp-drive-best-'+d.mission.id,prev=real?null:store.get(key);
  const isBest=!real && res.passed && PP_DSCORE.better(res,prev);
  if(isBest)store.set(key,res);
  setText($('res-map'),d.mission.name);setText($('res-grade'),res.passed?'통과':'다시 연습');
  $('res-grade').classList.toggle('is-perfect',res.passed && !res.penalties.length);
  setText($('res-contacts'),res.penalties.length+'건');setText($('res-time'),fmtSec(res.time));
  setText($('res-reason'),res.failReason || (res.penalties.length?'감점 내용을 확인하고 다시 연습해 보세요.':'감점 없이 목적지에 도착했어요.'));
  $('res-reason').hidden=false;
  const list=$('res-penalties');list.textContent='';list.hidden=!res.penalties.length;
  for(const p of res.penalties){const li=document.createElement('li');li.textContent=fmtClock(p.t)+' · '+p.text;list.append(li);}
  setText($('res-best'),real?'실제 지도 주행은 기록을 저장하지 않아요':isBest?(prev?'최고 기록을 새로 세웠어요':'첫 통과 기록을 저장했어요'):prev?'최고 기록 · '+fmtDriveRecord(prev):'통과하면 최고 기록을 저장해요');
  $('res-best').classList.toggle('is-new',isBest);$('result').hidden=false;$('hud').hidden=true;
  $('res-retry').focus({preventScroll:true});
}
const fmtDriveRecord = b => '감점 '+b.penalties.length+' · '+fmtSec(b.time);

function renderMenu() {
  const tabs = $('tabs'), cards = $('cards'), real = game.menuKind === 'real';
  for (const k of ['parking', 'city', 'real']) $('mode-' + k).setAttribute('aria-selected', String(game.menuKind === k));
  tabs.hidden = cards.hidden = real; $('real').hidden = !real;
  tabs.textContent = '';
  if (real) { realMenu.show(); return; }
  const city=game.menuKind==='city';
  const groups=city?[{id:'city',name:'시내'},{id:'highway',name:'고속도로'}]:PP_MAPS.GROUPS, cur=city?game.cityGroup:game.group;
  const inCity=x=>(x.group||'city')===game.cityGroup;
  tabs.setAttribute('aria-label',city?'주행 종류':'주차 장소');
  for (const g of groups) {
    const b = document.createElement('button');
    b.className = 'tab'; b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(g.id === cur));
    b.textContent = g.name;
    const n = document.createElement('span');
    n.className = 'num'; n.textContent = (city?PP_MISSIONS.list.filter(x => (x.group||'city') === g.id):PP_MAPS.list.filter(x => x.group === g.id)).length;
    b.append(n);
    b.addEventListener('click', () => { if (city) game.cityGroup = g.id; else game.group = g.id; renderMenu(); });
    tabs.append(b);
  }
  cards.textContent = '';
  for (const m of (city?PP_MISSIONS.list.filter(inCity):PP_MAPS.list.filter(x => x.group === game.group))) {
    const best = store.get((city?'pp-drive-best-':'pp-best-') + m.id);
    const card = document.createElement('button');
    card.className = 'card';
    card.innerHTML = '<span class="card-name"></span><span class="card-tip"></span><span class="card-foot"><span></span><span class="rec"></span></span>';
    card.querySelector('.card-name').textContent = m.name;
    card.querySelector('.card-tip').textContent = m.tip;
    card.querySelector('.card-foot span').textContent = city?(m.id==='hw-toll'?(m.hipass?'하이패스 단말기 있음':'하이패스 단말기 없음'):m.highway?'고속도로':'시내 주행'):GOAL_KIND[m.goal.type];
    const rec = card.querySelector('.rec');
    rec.textContent = best ? (city?fmtDriveRecord(best):fmtRecord(best)) : '기록 없음';
    rec.classList.toggle('is-none', !best);
    card.addEventListener('click', () => city?startDrive(m):start(m));
    cards.append(card);
  }
}

function openMenu() {
  game.mode = 'menu';navui.voice.stop();PP_INPUT.reset(inp);
  PP_AUDIO.setDistance(audio, Infinity);
  if (game.map && !game.city) game.group = game.map.group;
  $('btn-resume').hidden = !(game.run && !game.run.done && !game.run.failReason);
  renderMenu();
  $('menu').hidden = false; $('result').hidden = true; $('hud').hidden = true;
}

function resume() {
  game.mode = 'drive';PP_INPUT.reset(inp);
  $('menu').hidden = true; $('hud').hidden = false;
}

function showResult() {
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
}

function nextMap() {
  if (game.city && game.city.mission.group === 'real') { openMenu(); return; } // 실제 지도: 다음 미션 없음 → 메뉴
  if (game.city) { const cur=game.city.mission, l=PP_MISSIONS.list.filter(x => x.group === cur.group), i=l.indexOf(cur); startDrive(l[(i+1)%l.length]); return; }
  const i = PP_MAPS.list.indexOf(game.map);
  start(PP_MAPS.list[(i + 1) % PP_MAPS.list.length]);
}

$('res-retry').addEventListener('click', () => game.city ? startDrive(game.city.mission) : start(game.map));
$('res-next').addEventListener('click', nextMap);
$('res-menu').addEventListener('click', openMenu);
$('btn-resume').addEventListener('click', resume);
for(const kind of ['parking','city','real'])$('mode-'+kind).addEventListener('click',()=>{game.menuKind=kind;renderMenu();});
const voiceEnabled=$('voice-enabled');voiceEnabled.checked=store.get('pp-voice')!==false;
navui.voice.enable(voiceEnabled.checked);
voiceEnabled.addEventListener('change',()=>{navui.voice.enable(voiceEnabled.checked);store.set('pp-voice',voiceEnabled.checked);});

// ── 메뉴: 실제 지도 — 출발(현재 위치·검색)·목적지 검색 → 직선거리 → 출발(지도 받기·도로 만들기) ──
// OSM 텍스트(장소 이름·주소)는 textContent로만 넣는다. 검색은 버튼 1회당 1요청(자동완성 없음), 간격은 PP_OSMF가 지킨다.
const REAL_MAX_D = 3000; // 한 번 운행 직선거리 상한(m) — PP_OSMF·PP_MREAL과 같은 값
const REAL_MSG = {
  gps: '현재 위치를 가져오지 못했어요. 출발지를 검색해 주세요',
  empty: '결과가 없어요. 다른 이름으로 검색해 보세요',
  search: '검색 서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요',
  'too-far': '3km 안의 목적지만 갈 수 있어요',
  busy: '지도 서버가 바빠요. 잠시 뒤 다시 시도해 주세요',
  'too-big': '영역이 너무 커요. 더 가까운 목적지를 골라 주세요',
  'no-route': '이 목적지로 가는 길을 찾지 못했어요',
};
// 지도 받기·만들기 오류 코드 → 문구. network(미러 모두 연결 실패)도 사용자에게는 '서버가 바빠요'로 안내한다.
const REAL_ERR = { network: 'busy', busy: 'busy', 'too-big': 'too-big', 'too-far': 'too-far', 'no-road': 'no-route', 'no-route': 'no-route', 'bad-coords': 'no-route' };
const realMenu = (function realMenuUi() {
  let osm = null; // PP_OSMF 클라이언트는 하나만(요청 간격을 공유)
  const client = () => osm || (osm = PP_OSMF.create());
  const ends = {};
  let job = 0; // 출발 진행 중 표시: 탭을 떠나거나 다시 누르면 이전 진행은 버린다
  const status = $('real-status'), dist = $('real-dist'), go = $('real-start');

  function say(box, text, retry, error) {
    box.hidden = !text; box.classList.toggle('is-error', !!error);
    box.querySelector('span').textContent = text || '';
    const b = box.querySelector('button'); b.hidden = !retry; b.onclick = retry || null;
    if (text && box === status) box.scrollIntoView({ block: 'nearest' }); // 휴대폰 세로: 진행·오류 문구가 아래로 밀려 있지 않게
  }
  function update() {
    const a = ends.from.pick, b = ends.to.pick;
    dist.classList.remove('is-error'); dist.textContent = '';
    if (!a || !b) { dist.textContent = '출발지와 목적지를 정해 주세요'; go.disabled = true; return; }
    const kx = Math.cos((a.lat + b.lat) / 2 * Math.PI / 180) * 111320;
    const d = Math.hypot((b.lon - a.lon) * kx, (b.lat - a.lat) * 110540);
    if (d > REAL_MAX_D) { dist.textContent = REAL_MSG['too-far']; dist.classList.add('is-error'); go.disabled = true; return; }
    const v = document.createElement('b'); v.textContent = d < 1000 ? Math.round(d) + 'm' : (d / 1000).toFixed(1) + 'km';
    dist.append('직선거리 ', v); go.disabled = !!job;
  }
  function pick(end, p) {
    const e = ends[end];
    e.pick = p; e.input.value = p ? p.name : e.input.value;
    e.picked.hidden = !p; e.picked.textContent = p ? '✓ ' + (p.addr || p.name) : '';
    e.box.classList.toggle('is-set', !!p);
    e.list.textContent = '';
    if (p) say(e.msg, '');
    update();
    if (p && ends.from.pick && ends.to.pick) go.scrollIntoView({ block: 'nearest' }); // 짧은 가로 화면: 다음 할 일(출발)이 보이게
  }
  async function search(end) {
    const e = ends[end], q = e.input.value.trim();
    if (!q) { e.input.focus(); return; }
    e.list.textContent = ''; e.btn.disabled = true;
    say(e.msg, '검색 중…');
    let list;
    try { list = await client().search(q); }
    catch (err) { say(e.msg, REAL_MSG.search, () => search(end), true); return; }
    finally { e.btn.disabled = false; }
    if (!list.length) { say(e.msg, REAL_MSG.empty, () => { e.input.focus(); e.input.select(); }, true); return; }
    say(e.msg, '');
    for (const p of list) {
      const li = document.createElement('li'), b = document.createElement('button'), name = document.createElement('b'), addr = document.createElement('small');
      b.type = 'button'; name.textContent = p.name; addr.textContent = p.addr; b.append(name, addr);
      b.addEventListener('click', () => pick(end, p));
      li.append(b); e.list.append(li);
    }
    e.list.firstChild.scrollIntoView({ block: 'nearest' });
  }
  async function here() {
    const e = ends.from, btn = $('real-here');
    btn.disabled = true; say(e.msg, '현재 위치 찾는 중…');
    try {
      const [lat, lon] = await PP_OSMF.locate();
      e.input.value = '';
      pick('from', { name: '현재 위치', addr: '', lat, lon });
    } catch (err) { pick('from', null); say(e.msg, REAL_MSG.gps, here, true); }
    finally { btn.disabled = false; }
  }
  const frameDrawn = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res))); // 문구가 한 번 그려진 뒤
  async function start() {
    const a = ends.from.pick, b = ends.to.pick;
    if (!a || !b) return;
    const my = ++job, alive = () => my === job && game.mode === 'menu' && game.menuKind === 'real';
    go.disabled = true;
    const end = (text, retry) => { if (my !== job) return; job = 0; say(status, text, retry, !!text); update(); };
    const fail = code => end(REAL_MSG[REAL_ERR[code] || 'no-route'], start);
    say(status, '지도 받는 중…');
    let data;
    try { data = await client().area([a.lat, a.lon], [b.lat, b.lon]); } catch (err) { fail(err.code); return; }
    if (!alive()) { end(''); return; } // 그사이 메뉴·탭을 떠났으면 버린다
    say(status, '도로 만드는 중…');
    await frameDrawn();
    if (!alive()) { end(''); return; }
    let out;
    try { out = PP_MREAL.make({ osm: data, from: [a.lat, a.lon], to: [b.lat, b.lon], seed: 1 }); } catch (err) { out = { error: (err && err.code) || 'no-route' }; }
    if (out.error) { fail(out.error); return; }
    end('');
    game.realBuildings = out.buildings;
    startDrive({ ...out.mission, name: '실제 지도 · ' + a.name + ' → ' + b.name });
  }

  for (const sec of document.querySelectorAll('#real .real-field')) {
    const end = sec.dataset.end, form = sec.querySelector('form');
    const e = ends[end] = { box: sec, input: form.querySelector('input'), btn: form.querySelector('button'), picked: sec.querySelector('.real-picked'), msg: sec.querySelector('.real-msg'), list: sec.querySelector('.real-results'), pick: null };
    form.addEventListener('submit', ev => { ev.preventDefault(); search(end); });
    e.input.addEventListener('input', () => { if (e.pick) { e.pick = null; e.picked.hidden = true; sec.classList.remove('is-set'); update(); } });
  }
  $('real-here').addEventListener('click', here);
  go.addEventListener('click', start);
  $('real-privacy-ok').addEventListener('click', () => { store.set('pp-osm-notice', true); $('real-privacy').hidden = true; });
  update();
  // 탭을 열 때마다: 첫 사용 안내(확인 전까지). 입력·선택은 그대로 남아 결과 화면에서 돌아와도 이어서 고른다.
  return { show() { $('real-privacy').hidden = !!store.get('pp-osm-notice'); } };
})();

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
  if (run.t > 4 && !$('hud-tip').hidden) $('hud-tip').hidden = true; // 팁은 4초 뒤 접어서 시야 확보
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
      if (ctl.gearReq && ctl.gearReq !== car.gear && !PP_CAR.setGear(car, ctl.gearReq, ts - game.brakeAt < 400)) game.noticeUntil = ts + 2500;
      if (ctl.viewReq) { game.view = VIEWS[(VIEWS.indexOf(game.view) + 1) % VIEWS.length]; PP_RENDER.setView(r, game.view); }
      if (game.city) PP_DRIVE.controls(game.city, ctl);
      game.acc += dt;
      while (game.acc >= DT && !run.done && !run.failReason) {
        if (game.city) { const events=PP_DRIVE.step(game.city,ctl,DT);PP_NAVUI.consume(navui,game.city,events); } else physicsStep(ctl);
        game.acc -= DT;
      }
      if (run.contacts > game.contacts) { game.contacts = run.contacts; PP_AUDIO.contact(audio); }
      const sp = PP_CAR.sensorPoints(car);
      PP_AUDIO.setDistance(audio, PP_COL.nearest(sp.front.concat(sp.rear, sp.left, sp.right), map.obstacles));
      if (game.city) cityHud(ts, ctl); else updateHud(ts, ctl);
      if (run.done || run.failReason) showResult();
    }
  } else if (ctl.menuReq) {
    if (game.mode === 'menu' && game.run && !game.run.done && !game.run.failReason) resume();
    else if (game.mode === 'result') openMenu();
  }
  if (!game.city) r.focusMirror = ctl.mirrorL ? 'left' : ctl.mirrorR ? 'right' : null;
  if (game.city) {
    r.focusMirror = game.city.focus; r.playerBlink = game.city.blink; r.playerHazard = game.city.hazard; r.blinkOn = Math.floor(game.city.t*2)%2 === 0;
    PP_RROAD.update(r, PP_TRAFFIC.cars(game.city.sim), PP_TRAFFIC.peds(game.city.sim), game.city.t, game.city.player);
    if (game.real) PP_RREAL.update(game.real, game.city.player);
  }
  if (game.car) PP_RENDER.update(r, game.car, game.map);
  PP_NAVUI.mirrors(navui,r,game.mode==='drive');
  requestAnimationFrame(frame);
}

// ── 개발용 확인 경로: ?real=<픽스처> → 저장된 Overpass 응답으로 실제 지도 주행(네트워크 없이 오프라인 확인) ──
// 출발·목적지 = 픽스처 안 고정 두 점(직선 500~900m, 유턴 없는 경로). jamsil은 봇이 완주하는 테스트 경로.
const REAL_FIXTURES = {
  jamsil: { from: [37.5084, 127.0859], to: [37.5132, 127.0810] },
  gangnam: { from: [37.4960, 127.0250], to: [37.5000, 127.0300] },
  oguri: { from: [37.5570, 126.9330], to: [37.5600, 126.9380] },
};
function startRealFixture(name) {
  const f = Object.prototype.hasOwnProperty.call(REAL_FIXTURES, name) ? REAL_FIXTURES[name] : null;
  if (!f) return;
  fetch('test/fixtures/osm-' + name + '.json').then(res => res.json()).then(osm => {
    const out = PP_MREAL.make({ osm, from: f.from, to: f.to, seed: 1 });
    if (out.error) { console.warn('실제 지도 픽스처:', out.error); return; }
    game.realBuildings = out.buildings; startDrive(out.mission);
  }).catch(e => console.warn('실제 지도 픽스처를 불러오지 못했어요', e));
}

// ── 시작: ?map=이 있으면 바로 주행, 없으면 메뉴(뒤에 첫 맵을 보여줌) ──
layout();
const query = new URLSearchParams(location.search);
const initial = PP_MAPS.byId(query.get('map'));
const initialDrive = PP_MISSIONS.byId(query.get('drive'));
if (initialDrive) startDrive(initialDrive);
else if (initial) start(initial);
else { loadScene(PP_MAPS.list[0]); game.run = null; openMenu(); startRealFixture(query.get('real')); }
requestAnimationFrame(frame);
