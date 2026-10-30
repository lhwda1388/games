  // ---------- 반려동물: art, where it is in each scene, petting, gifts, 상점 adoption + name sheet ----------
  var PET_SP = {
    dog: ['........44..', '3......4334.', '.3....333034', '..3333333333', '..333333333.', '..33333333..', '..4.4..4.4..', '..4.4..4.4..'],
    dogStep: ['........44..', '3......4334.', '.3....333034', '..3333333333', '..333333333.', '..33333333..', '...4.4..4.4.', '...4.4..4.4.'],
    dogAlert: ['.......4.4..', '3......4334.', '.3....333034', '..3333333333', '..333333333.', '..33333333..', '..4.4..4.4..', '..4.4..4.4..'],
    dogSleep: ['........44..', '.....333334.', '.33333333304', '333333333333'],
    catStep: ['......4.4', '......444', '4.....404', '4...44444', '.4.44444.', '..444444.', '..444444.', '...4.4.4.'],
    catSleep: ['......4.4', '.4444444.', '444444444', '.4444444.'],
    heart: ['.4.4.', '44444', '.444.', '..4..'],
    gift: ['.4.4.', '44444', '40404', '44444']
  };
  var FARM_PET = { x: 30, y: 147 };
  var petLast = null, petHearts = [];
  function petSeen() { return petLast && performance.now() - petLast.at < 300 ? petLast : null; }
  // where the pet is and what it is doing: { x, y (feet), flip, mode: sit | walk | alert | sleep | sniff }
  function petPose(tt, where) {
    var lv = L.petLevel(S);
    if (where === 'farm') {
      var fishing = S.fish.phase === 'wait' || S.fish.phase === 'bite';
      if (lv >= 2 && fishing) return { x: FARM_PET.x, y: FARM_PET.y, flip: false, mode: S.fish.phase === 'bite' ? 'alert' : 'sit' };
      if (lv >= 4 && tt % 40 < 16) return { x: FARM_PET.x, y: FARM_PET.y, flip: false, mode: 'sleep' };
      return { x: FARM_PET.x, y: FARM_PET.y, flip: false, mode: 'sit' };
    }
    if (where === 'yard') {
      if (lv < 1) return { x: 92, y: 110, flip: false, mode: 'sit' };
      if (lv >= 4 && tt % 50 < 14) return { x: 88, y: 110, flip: true, mode: 'sleep' };   // clear of the 공방 (craft.js CFT_AT)
      var u = (tt / 14) % 2, w = u < 1 ? u : 2 - u, pause = Math.abs(w - 0.5) > 0.46;
      return { x: 64 + Math.round(w * 28), y: 110, flip: u >= 1, mode: pause ? 'sit' : 'walk' };
    }
    // 숲: trots from spot to spot (each leg 7 s), sniffing for the last 3 s once 친밀도 allows
    var leg = Math.floor(tt / 7), f = (tt % 7) / 4, a = FSPOTS[leg % FSPOTS.length], b = FSPOTS[(leg + 1) % FSPOTS.length];
    if (f >= 1) return { x: b[0] - 10, y: b[1] + 4, flip: false, mode: lv >= L.PET_FIND_LV ? 'sniff' : 'sit' };
    return { x: Math.round(a[0] - 10 + (b[0] - a[0]) * f), y: Math.round(a[1] + 4 + (b[1] - a[1]) * f), flip: b[0] < a[0], mode: 'walk' };
  }
  function drawPetSprite(kind, x, y, flip, mode, tt) {
    var cat = kind === 'cat', step = Math.floor(tt * 6) % 2, blink = Math.floor(tt * 10) % 41 === 0;
    var rows = mode === 'sleep' ? PET_SP[cat ? 'catSleep' : 'dogSleep']
      : mode === 'alert' ? (cat ? SP.catAlert : PET_SP.dogAlert)
      : mode === 'walk' && step ? PET_SP[cat ? 'catStep' : 'dogStep']
      : cat ? (blink ? SP.catBlink : SP.cat) : PET_SP.dog;
    var w = rows[0].length, x0 = Math.round(x - w / 2), y0 = y - rows.length + (mode === 'sniff' && step ? 1 : 0);
    spr(rows, x0, y0, flip);
    if (mode !== 'sleep') {
      // collar, so it reads as ours (not the visiting cat); a wagging tail for the dog
      var cx = flip ? x0 + w - 1 - (cat ? 6 : 7) : x0 + (cat ? 6 : 7);
      px(cx, y0 + 3, 1, 1, 1);
      if (!cat && Math.floor(tt * 4) % 2) px(flip ? x0 + w - 1 : x0, y0, 1, 1, 3);
    } else if (Math.floor(tt) % 3) px(x0 + w + 1 - (Math.floor(tt) % 3) * 2, y0 - 3 - (Math.floor(tt) % 3), 2, 1, 4);
  }
  function drawPet(tt, dt, where) {
    if (!S.pet) return;
    var p = petPose(tt, where);
    px(p.x - 5, p.y, 10, 1, 2);
    drawPetSprite(S.pet.kind, p.x, p.y, p.flip, p.mode, tt);
    if (L.petGiftReady(S, now(), TZ) && Math.floor(tt * 2) % 2) spr(PET_SP.gift, p.x - 2, p.y - 15);
    for (var k = petHearts.length - 1; k >= 0; k--) {
      var h = petHearts[k];
      h.t += dt;
      if (h.t > 1.2) { petHearts.splice(k, 1); continue; }
      spr(PET_SP.heart, h.x - 2 + Math.round(Math.sin(h.t * 6) * 2), h.y - 12 - Math.round(h.t * 14));
    }
    petLast = { x: p.x, y: p.y, at: performance.now() };
  }
  function tapPet(x, y) {
    var p = petSeen();
    if (!S.pet || !p || !hit([p.x - 7, p.y - 11, 14, 12], x, y, 3)) return false;
    var t = now(), nm = S.pet.name;
    var g = L.takePetGift(S, t, TZ, L.forestOk(S) ? fEnv(t) : null, Math.random);
    if (g) {
      petHearts.push({ x: p.x, y: p.y, t: 0 });
      burst(p.x, p.y - 8, 8, 0, 40);
      toast(josa(nm, '이', '가') + ' 선물을 물고 왔다 · ' + L.itemInfo(g.id).name + (g.sold ? ' · 바구니가 꽉 차 팔았다 +' + g.sold : ' · 바구니에'), 2800);
      refresh(); return true;
    }
    var r = L.petPet(S, t, TZ);
    petHearts.push({ x: p.x, y: p.y, t: 0 });
    if (r.up) toast('♥ ' + nm + ' 친밀도 ' + r.up + ' · 새 행동: ' + L.PET_ACTS[r.up], 3600);
    else toast(S.pet.kind === 'cat' ? '골골골… ' + nm + (r.gain ? '' : ' · 오늘은 충분히 쓰다듬었다') : nm + ' · 꼬리를 흔든다' + (r.gain ? '' : ' · 오늘은 충분히 쓰다듬었다'), 1500);
    save(); return true;
  }

  // ---------- 상점: 반려동물 section + name sheet ----------
  function petIcon(kind) {
    var c = document.createElement('canvas'); c.width = 14; c.height = 10;
    var saved = ctx; ctx = c.getContext('2d');
    try { drawPetSprite(kind, 7, 9, false, 'sit', 0); } finally { ctx = saved; }
    c.style.width = '28px'; c.style.height = '20px';
    return c;
  }
  function renderPetShop() {
    var h3 = document.createElement('h3'); h3.textContent = '반려동물';
    var hb = document.createElement('b'); hb.textContent = S.pet ? S.pet.name : '한 마리'; h3.appendChild(hb); shopEl.appendChild(h3);
    if (S.pet) {
      var lv = L.petLevel(S), next = L.PET_LV[lv];
      petRow(S.pet.kind, S.pet.name, L.PET_KINDS[S.pet.kind].name + ' · 친밀도 ' + lv + (next ? ' (' + S.pet.f + '/' + next + ')' : ' · 최고') + ' · ' + L.PET_ACTS[lv], '이름', false, function () { openPetSheet('rename'); });
      return;
    }
    var cs = L.adoptStatus(S, 'cat'), ds = L.adoptStatus(S, 'dog');
    petRow('cat', '고양이', cs === 'locked' ? '마당 고양이와 친구가 되면 (다섯 번 쓰다듬기 · 또는 ' + L.PET_CAT_VISITS + '번 만나기)' : '마당 고양이가 따라오고 싶어 한다 · 무료',
      cs === 'locked' ? '잠김' : '데려오기', cs === 'locked', function () { openPetSheet('cat'); });
    petRow('dog', '강아지', '숲에서 채집물을 잘 찾는다 · 쓰다듬고 선물 받기', L.PET_KINDS.dog.cost.toLocaleString('ko-KR'), false, function () {
      if (L.adoptStatus(S, 'dog') === 'coins') { toast('코인이 부족해요'); return; }
      openPetSheet('dog');
    }, ds === 'coins');
    var p = document.createElement('p'); p.className = 'note'; p.textContent = '한 마리만 함께 살아요 · 장면마다 따라다니고, 하루 몇 번 작은 선물을 가져와요';
    shopEl.appendChild(p);
  }
  function petRow(kind, name, sub, label, disabled, onClick, poor) {
    var r = document.createElement('div'); r.className = 'up';
    var n = document.createElement('div'); n.className = 'n'; n.textContent = name;
    var sm = document.createElement('small'); sm.textContent = sub; n.appendChild(sm);
    var b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.disabled = disabled;
    if (disabled) b.className = 'max';
    if (poor) b.classList.add('poor');
    b.setAttribute('aria-label', name + ' ' + label);
    b.addEventListener('click', onClick);
    r.appendChild(petIcon(kind)); r.appendChild(n); r.appendChild(b); shopEl.appendChild(r);
  }
  // mode: 'cat' | 'dog' (adopt) or 'rename'. The name is typed text: cleaned in logic, shown with textContent only.
  function openPetSheet(mode) {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true;
    sheetKind = 'pet'; sheetEl.hidden = false;
    var kind = mode === 'rename' ? S.pet.kind : mode;
    sheetHead(mode === 'rename' ? '이름 바꾸기' : L.PET_KINDS[kind].name + ' 데려오기');
    var say = document.createElement('p'); say.className = 'say';
    say.textContent = mode === 'rename' ? S.pet.name + '의 새 이름은?' : kind === 'cat' ? '마당 고양이가 발치에 앉는다. 이름을 지어 줄까?' : '꼬리를 흔드는 강아지. 이름을 지어 줄까?';
    sheetEl.appendChild(say);
    var row = document.createElement('div'); row.className = 'shareRow';
    var ic = petIcon(kind); row.appendChild(ic);
    var inp = document.createElement('input'); inp.type = 'text'; inp.className = 'field'; inp.maxLength = L.PET_NAME_MAX;
    inp.placeholder = L.PET_KINDS[kind].def; inp.setAttribute('aria-label', '이름 (' + L.PET_NAME_MAX + '글자까지)'); inp.autocomplete = 'off';
    if (mode === 'rename') inp.value = S.pet.name;
    var b = document.createElement('button'); b.type = 'button'; b.textContent = mode === 'rename' ? '바꾸기' : '데려오기';
    row.appendChild(inp); row.appendChild(b); sheetEl.appendChild(row);
    var hint = document.createElement('p'); hint.className = 'note';
    hint.textContent = '한글·영문·숫자 ' + L.PET_NAME_MAX + '글자까지 · 비우면 「' + L.PET_KINDS[kind].def + '」' + (kind === 'dog' && mode !== 'rename' ? ' · ' + L.PET_KINDS.dog.cost.toLocaleString('ko-KR') + '코인' : '');
    sheetEl.appendChild(hint);
    function submit() {
      if (mode === 'rename') {
        var nn = L.renamePet(S, inp.value);
        if (!nn) { toast('쓸 수 있는 글자로 지어 주세요'); return; }
        toast('이제 「' + nn + '」', 2000);
      } else {
        var r = L.adoptPet(S, kind, inp.value, now());
        if (!r.ok) { toast(r.why === 'coins' ? '코인이 부족해요' : r.why === 'have' ? '이미 한 마리가 있어요' : '아직 데려올 수 없어요'); return; }
        toast('★ ' + josa(r.name, '이', '가') + ' 식구가 됐다 · 쓰다듬어 주세요', 3200);
      }
      closeSheet(); refresh();
    }
    b.addEventListener('click', submit);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    setTimeout(function () { try { inp.focus(); } catch (er) { /* focus may be refused */ } }, 0);
  }

  // ---------- console hooks ----------
  function addPetHooks(FF) {
    // FF.pet('cat'|'dog', name?) adopts for free; FF.pet() shows it; FF.pet('lv', n) sets 친밀도 level; FF.pet('gift') makes a gift due
    FF.pet = function (kind, arg) {
      if (kind === 'lv') { if (S.pet) S.pet.f = arg ? L.PET_LV[Math.min(L.PET_LV.length, arg) - 1] : 0; }
      else if (kind === 'gift') { if (S.pet) { S.pet.gnext = 0; S.pet.gn = 0; } }
      else if (kind === 'cat' || kind === 'dog') { delete S.pet; S.coins += L.PET_KINDS[kind].cost; L.yardOf(S).met.cat = Math.max(S.yard.met.cat || 0, L.PET_CAT_VISITS); L.adoptPet(S, kind, arg || '', now()); }
      refresh(); return S.pet;
    };
  }
