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

// 주행 미션 시작·HUD·기록. 주차 상태와 분리한다.
function startDrive(mission) {
  PP_INPUT.reset(inp); document.body.classList.add('city'); game.menuKind='city'; game.cityGroup=mission.group||'city';
  layout();
  const d = game.city = PP_DRIVE.create(mission, SPEC);
  PP_NAVUI.reset(navui,d);
  $('res-switches').parentElement.hidden=true;
  setText($('res-next'),'다음 미션');
  $('st-contacts').firstChild.textContent='감점';
  document.querySelector('#res-contacts').previousElementSibling.textContent='감점';
  game.car = d.car; game.map = { ...mission, obstacles: [], floors: [], ramps: [] };
  game.run = d.score; game.mode = 'drive'; game.acc = 0;
  const road = PP_RROAD.load(r, d.net, { highway: !!mission.highway });
  if (mission.highway) PP_RHWR.load(r, d.net, road); // 분리대·가드레일·문형 기둥·부스도 충돌 상자로
  d.obstacles = road.obstacles;
  game.view = 'driver'; PP_RENDER.setView(r, game.view);
  try { history.replaceState(null, '', '?drive=' + mission.id); } catch (e) { /* file:// */ }
  setText($('hud-map'), mission.name); setText($('hud-tip'), mission.tip);
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
  $('hud-tip').hidden = d.t > 8; $('incline').hidden = true; $('sn-front').hidden = true; $('sn-rear').hidden = true;
  for (const [kind, depth] of [['gas',ctl.throttle],['brake',ctl.brake]]) {
    const pct = Math.round(depth*100)+'%'; pedalEls[kind].style.setProperty('--depth',pct); $('pd-'+kind).style.width=pct;
  }
  $('notice').hidden = ts > game.noticeUntil; setText($('btn-view'), VIEW_NAME[game.view]);
}
function cityResult() {
  const d=game.city, res=PP_DSCORE.result(d.score); game.mode='result';
  PP_INPUT.reset(inp);navui.voice.stop();PP_AUDIO.setDistance(audio,Infinity);
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
}
const fmtDriveRecord = b => '감점 '+b.penalties.length+' · '+fmtSec(b.time);

function renderMenu() {
  const tabs = $('tabs'), cards = $('cards');
  tabs.textContent = '';
  const city=game.menuKind==='city';
  const groups=city?[{id:'city',name:'시내'},{id:'highway',name:'고속도로'}]:PP_MAPS.GROUPS, cur=city?game.cityGroup:game.group;
  const inCity=x=>(x.group||'city')===game.cityGroup;
  tabs.setAttribute('aria-label',city?'주행 종류':'주차 장소');
  $('mode-city').setAttribute('aria-selected',String(city));$('mode-parking').setAttribute('aria-selected',String(!city));
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
  if (game.city) { const cur=game.city.mission, l=PP_MISSIONS.list.filter(x => x.group === cur.group), i=l.indexOf(cur); startDrive(l[(i+1)%l.length]); return; }
  const i = PP_MAPS.list.indexOf(game.map);
  start(PP_MAPS.list[(i + 1) % PP_MAPS.list.length]);
}

$('res-retry').addEventListener('click', () => game.city ? startDrive(game.city.mission) : start(game.map));
$('res-next').addEventListener('click', nextMap);
$('res-menu').addEventListener('click', openMenu);
$('btn-resume').addEventListener('click', resume);
for(const kind of ['parking','city'])$('mode-'+kind).addEventListener('click',()=>{game.menuKind=kind;renderMenu();});
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
  $('notice').hidden = ts > game.noticeUntil;
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
  }
  if (game.car) PP_RENDER.update(r, game.car, game.map);
  PP_NAVUI.mirrors(navui,r,game.mode==='drive');
  requestAnimationFrame(frame);
}

// ── 시작: ?map=이 있으면 바로 주행, 없으면 메뉴(뒤에 첫 맵을 보여줌) ──
layout();
const initial = PP_MAPS.byId(new URLSearchParams(location.search).get('map'));
const initialDrive = PP_MISSIONS.byId(new URLSearchParams(location.search).get('drive'));
if (initialDrive) startDrive(initialDrive);
else if (initial) start(initial);
else { loadScene(PP_MAPS.list[0]); game.run = null; openMenu(); }
requestAnimationFrame(frame);
