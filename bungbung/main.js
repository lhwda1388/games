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
const game = { mode: 'menu', map: null, car: null, run: null, view: 'driver', acc: 0, last: 0, group: 'apt', noticeUntil: 0, contacts: 0 };

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

// ── 레이아웃: 짧은 가로 화면에서는 사이드미러를 조금 위로 ──
function layout() {
  r.layout.mirrorY = window.innerHeight < 500 ? 0.52 : 0.58;
  r.layout.insetBottom = 104;
  PP_RENDER.resize(r);
}
window.addEventListener('resize', layout);

// ── 게임 시작/메뉴/결과 ──
function loadScene(map) {
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
  game.group = map.group;
  try { history.replaceState(null, '', '?map=' + map.id); } catch (e) { /* file:// 등 */ }
  setText($('hud-map'), map.name);
  setText($('hud-goal'), goalText(map));
  setText($('hud-tip'), map.tip);
  $('hud-tip').hidden = false;
  $('hud').hidden = false; $('menu').hidden = true; $('result').hidden = true;
}

function renderMenu() {
  const tabs = $('tabs'), cards = $('cards');
  tabs.textContent = '';
  for (const g of PP_MAPS.GROUPS) {
    const b = document.createElement('button');
    b.className = 'tab'; b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(g.id === game.group));
    b.textContent = g.name;
    const n = document.createElement('span');
    n.className = 'num'; n.textContent = PP_MAPS.list.filter(m => m.group === g.id).length;
    b.append(n);
    b.addEventListener('click', () => { game.group = g.id; renderMenu(); });
    tabs.append(b);
  }
  cards.textContent = '';
  for (const m of PP_MAPS.list.filter(x => x.group === game.group)) {
    const best = store.get('pp-best-' + m.id);
    const card = document.createElement('button');
    card.className = 'card';
    card.innerHTML = '<span class="card-name"></span><span class="card-tip"></span><span class="card-foot"><span></span><span class="rec"></span></span>';
    card.querySelector('.card-name').textContent = m.name;
    card.querySelector('.card-tip').textContent = m.tip;
    card.querySelector('.card-foot span').textContent = GOAL_KIND[m.goal.type];
    const rec = card.querySelector('.rec');
    rec.textContent = best ? fmtRecord(best) : '기록 없음';
    rec.classList.toggle('is-none', !best);
    card.addEventListener('click', () => start(m));
    cards.append(card);
  }
}

function openMenu() {
  game.mode = 'menu';
  PP_AUDIO.setDistance(audio, Infinity);
  if (game.map) game.group = game.map.group;
  $('btn-resume').hidden = !(game.run && !game.run.done);
  renderMenu();
  $('menu').hidden = false; $('result').hidden = true; $('hud').hidden = true;
}

function resume() {
  game.mode = 'drive';
  $('menu').hidden = true; $('hud').hidden = false;
}

function showResult() {
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
  const i = PP_MAPS.list.indexOf(game.map);
  start(PP_MAPS.list[(i + 1) % PP_MAPS.list.length]);
}

$('res-retry').addEventListener('click', () => start(game.map));
$('res-next').addEventListener('click', nextMap);
$('res-menu').addEventListener('click', openMenu);
$('btn-resume').addEventListener('click', resume);

// ── 볼륨 ──
const vol = $('vol');
const savedVol = store.get('pp-vol');
PP_AUDIO.setVolume(audio, typeof savedVol === 'number' ? savedVol : 0.6);
vol.value = audio.vol;
vol.addEventListener('input', () => { PP_AUDIO.setVolume(audio, Number(vol.value)); store.set('pp-vol', audio.vol); });
const wake = () => PP_AUDIO.resume(audio);
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
function updateHud(ts) {
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
  if (run.t > 5 && !$('hud-tip').hidden) $('hud-tip').hidden = true;
  const sp = PP_CAR.sensorPoints(car);
  sensor($('sn-front'), PP_COL.nearest(sp.front, map.obstacles));
  sensor($('sn-rear'), PP_COL.nearest(sp.rear, map.obstacles));
  $('notice').hidden = ts > game.noticeUntil;
  setText($('btn-view'), VIEW_NAME[game.view]);
}

// ── 루프 ──
function frame(ts) {
  const dt = Math.min((ts - (game.last || ts)) / 1000, 0.1);
  game.last = ts;
  const ctl = PP_INPUT.read(inp, game.car ? game.car.wheel : 0);
  if (game.mode === 'drive') {
    const { car, run, map } = game;
    if (ctl.menuReq) openMenu();
    else {
      if (ctl.gearReq && ctl.gearReq !== car.gear && !PP_CAR.setGear(car, ctl.gearReq)) game.noticeUntil = ts + 1000;
      if (ctl.viewReq) { game.view = VIEWS[(VIEWS.indexOf(game.view) + 1) % VIEWS.length]; PP_RENDER.setView(r, game.view); }
      game.acc += dt;
      while (game.acc >= DT && !run.done) { physicsStep(ctl); game.acc -= DT; }
      if (run.contacts > game.contacts) { game.contacts = run.contacts; PP_AUDIO.contact(audio); }
      const sp = PP_CAR.sensorPoints(car);
      PP_AUDIO.setDistance(audio, PP_COL.nearest(sp.front.concat(sp.rear, sp.left, sp.right), map.obstacles));
      updateHud(ts);
      if (run.done) showResult();
    }
  } else if (ctl.menuReq) {
    if (game.mode === 'menu' && game.run && !game.run.done) resume();
    else if (game.mode === 'result') openMenu();
  }
  if (game.car) PP_RENDER.update(r, game.car, game.map);
  requestAnimationFrame(frame);
}

// ── 시작: ?map=이 있으면 바로 주행, 없으면 메뉴(뒤에 첫 맵을 보여줌) ──
layout();
const initial = PP_MAPS.byId(new URLSearchParams(location.search).get('map'));
if (initial) start(initial);
else { loadScene(PP_MAPS.list[0]); game.run = null; openMenu(); }
requestAnimationFrame(frame);
