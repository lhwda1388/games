  // ---------- fishing flow ----------
  function doStrike() {
    var f = S.fish, res = L.strike(S, now(), Math.random);
    if (!res) return;
    if (res.type === 'scared') {
      // the fish bolts away from the bobber; the wait starts over
      scareFx = { t: 0, x: f.x + 4, y: f.y + 3, dir: f.x > POND.cx ? 1 : -1 };
      burst(f.x, f.y, 4, 0, 30);
      earlyTips++;
      if (res.nibble && earlyTips <= 3) toast('톡톡은 간보기 · 찌가 쑥 잠길 때 챔질!', 3200);
      else toast(res.nibble ? '간보기에 속았다 · 물고기가 달아났다' : '너무 일렀다 · 물고기가 놀랐다', 2400);
      refresh();
      return;
    }
    reelRoll = res.roll;
    reel = L.newReel(res.roll, L.tier(S, 'rod'));
    reelVis = { x: f.x, y: f.y, sx: f.x, sy: f.y, jx: 0, jy: 0, pulling: false };
    reelHud.hidden = false;
    dexBtn.disabled = true; shopBtn.disabled = true; bagBtn.disabled = true;
    shake = 2;
    burst(f.x, f.y, 10, 0, 60);
  }
  function endReel(res) {
    reelHud.hidden = true; cueEl.hidden = true;
    dexBtn.disabled = false; shopBtn.disabled = false; bagBtn.disabled = false;
    var f = L.fishById(reelRoll.id);
    if (res === 'caught') {
      var out = L.landFish(S, reelRoll);
      burst(reelVis.x, reelVis.y, 14, 0, 80);
      floatText(out.sold ? '+' + out.sold : '+' + f.name, ROD_BASE.x, ROD_BASE.y - 16);
      showResult(f, reelRoll, out);
      milestones();
    } else {
      L.loseFish(S);
      toast(res === 'snap' ? '툭… 줄이 끊어졌다' : (f.power >= 1.6 ? '묵직한 녀석이 도망갔다…' : '도망갔다…'), 2600);
      burst(reelVis.x, reelVis.y, 6, 2, 40);
    }
    reel = null; reelRoll = null;
    lastFishRes = performance.now();
    refresh();
  }
  function fishCanvas(id, unknown) {
    var c = document.createElement('canvas'); c.width = 16; c.height = 8;
    var c2 = c.getContext('2d'), saved = ctx; ctx = c2;
    var rows = FISH_SHAPE[id] || SP.fish;
    if (unknown) rows = rows.map(function (r) { return r.replace(/[013]/g, '2'); });
    else if (FISH_FILL[id]) rows = rows.map(function (r, j) { return r.replace(/0/g, function (m, i) { return String(FISH_FILL[id](i, j)); }); });
    else if (id === 'carp') rows = rows.map(function (r, j) { return r.replace(/0/g, function (m, i) { return (i + j) % 3 === 0 ? '3' : '0'; }); });
    else if (id === 'catfish') rows = rows.map(function (r) { return r.replace(/0/g, '2'); });
    else if (id === 'tuna') rows = rows.map(function (r, j) { return j < 3 ? r.replace(/0/g, '3') : r; });
    else if (id === 'lunch') rows = rows.map(function (r, j) { return j === 3 ? r.replace(/0/g, '1') : r; });
    else if (id === 'koi') rows = rows.map(function (r, j) { return r.replace(/0/g, function (m, i) { return (i * 2 + j) % 5 === 0 ? '4' : '1'; }); });
    else if (id === 'minnow') rows = rows.map(function (r, j) { return j === 3 ? r.replace(/0/g, '3') : r; });
    var rw = Math.max.apply(null, rows.map(function (r) { return r.length; }));
    spr(rows, Math.max(0, Math.floor((16 - rw) / 2)), 0, false, c2);
    if (id === 'catfish' && !unknown) { c2.fillStyle = G[4]; c2.fillRect(0, 2, 2, 1); c2.fillRect(0, 5, 2, 1); }
    ctx = saved;
    return c;
  }
  function showResult(f, roll, out) {
    resultEl.innerHTML = '';
    resultEl.appendChild(fishCanvas(f.id));
    var nm = document.createElement('div'); nm.className = 'nm';
    nm.textContent = (f.window === 'friday' ? '★ ' : '') + f.name;
    var sz = document.createElement('div'); sz.className = 'sz';
    sz.textContent = roll.size.toFixed(1) + 'cm · ' + (out.sold ? '+' + out.sold + ' 바로 팔림' : '바구니로');
    resultEl.appendChild(nm); resultEl.appendChild(sz);
    if (out.first || out.newBest) {
      var tg = document.createElement('div'); tg.className = 'tag';
      tg.textContent = out.first ? '도감 등록!' : '최고 기록!';
      resultEl.appendChild(tg);
    }
    resultEl.hidden = false;
    clearTimeout(showResult.t);
    showResult.t = setTimeout(hideResult, 2600);
  }
  function hideResult() { resultEl.hidden = true; }

  function tapPond(x, y) {
    if (x >= 148 && x < 172 && y >= 100 && y < 120) { openCal('spot'); return; }    // 낚시터 signpost
    if (!inPond(x, y, 1.0) && inWet(x, y, 1.0) && S.fish.phase === 'idle') {
      // open water outside the castable ellipse: aim at the nearest point inside it
      var a0 = Math.atan2((y - POND.cy) / POND.ry, (x - POND.cx) / POND.rx);
      x = POND.cx + Math.cos(a0) * POND.rx * 0.8; y = POND.cy + Math.sin(a0) * POND.ry * 0.8;
    }
    if (inPond(x, y, 1.0)) {
      if (S.fish.phase === 'idle') {
        var bx = x, by = y;
        if (!inPond(bx, by, 0.7)) { bx = POND.cx + (x - POND.cx) * 0.8; by = POND.cy + (y - POND.cy) * 0.8; }
        L.cast(S, now(), Math.random, Math.round(bx), Math.round(by));
        castAnim = { t: 0 };
        return refresh();
      }
      if (S.fish.phase === 'wait') {
        // tapping at the bobber is a strike; tapping elsewhere on the water just takes the line in
        if (Math.hypot(x - S.fish.x, y - S.fish.y) < 16) doStrike();
        else { L.reelIn(S); toast('줄을 걷었다'); refresh(); }
      }
    }
  }

  // ---------- pond render ----------
  function bez(ax, ay, bx, by, cx, cy, t) {
    var u = 1 - t;
    return { x: u * u * ax + 2 * u * t * cx + t * t * bx, y: u * u * ay + 2 * u * t * cy + t * t * by };
  }
  function drawLine(ax, ay, bx, by, sag, jit) {
    var cx = (ax + bx) / 2, cy = Math.max(ay, by) + sag;
    var n = Math.ceil(Math.hypot(bx - ax, by - ay)) + 2;
    for (var k = 0; k <= n; k++) {
      var p = bez(ax, ay, bx, by, cx, cy, k / n);
      var j = jit ? ((k % 2) ? jit : -jit) : 0;
      px(p.x, p.y + j, 1, 1, 4);
    }
  }
  function drawFarmer(tt) {
    var blink = Math.floor(tt * 10) % 37 === 0;
    var breathe = reel ? 0 : Math.floor(tt) % 2;
    spr(blink ? SP.farmerBlink : SP.farmer, 46, 121 + breathe);
  }
  // Rod keeps its butt angle and bends along a curve toward the (pulled) tip.
  function drawRod(tip) {
    var t3 = L.tier(S, 'rod');
    var cx = ROD_BASE.x + (ROD_TIP.x - ROD_BASE.x) * 0.6, cy = ROD_BASE.y + (ROD_TIP.y - ROD_BASE.y) * 0.6;
    for (var k = 0; k <= 24; k++) {
      var p = bez(ROD_BASE.x, ROD_BASE.y, tip.x, tip.y, cx, cy, k / 24);
      px(p.x, p.y, 1, 1, 4);
      if (k < 6 + t3 * 4) px(p.x + 1, p.y, 1, 1, t3 ? 4 : 3);
    }
    if (t3) { px(ROD_BASE.x + 2, ROD_BASE.y - 4, 3, 3, 4); px(ROD_BASE.x + 3, ROD_BASE.y - 3, 1, 1, 0); }
  }
  function drawBobber(x, y, dip, sunk) {
    if (sunk) {
      // the float is pulled under: only the antenna pokes out of the water
      px(x, y - 1 + dip, 1, 2, 4); px(x - 2, y + 1, 1, 1, 0); px(x + 2, y + 1, 1, 1, 0);
      return;
    }
    px(x, y - 4 + dip, 1, 2, 4);
    px(x - 1, y - 2 + dip, 3, 2, 4);
    px(x - 1, y + dip, 3, 2, 0); px(x - 2, y + dip, 1, 2, 4); px(x + 2, y + dip, 1, 2, 4); px(x - 1, y + 2 + dip, 3, 1, 4);
  }
  function ring(x, y, rx, ry, c) {
    var n = Math.max(12, Math.round(rx * 5));
    for (var k = 0; k < n; k++) {
      var a = k / n * Math.PI * 2;
      var xx = x + Math.cos(a) * rx, yy = y + Math.sin(a) * ry;
      if (inWet(xx, yy, 0.97)) px(xx, yy, 1, 1, c);
    }
  }
  // Fish seen from above as a dark shape: body ellipse plus a tail that flaps; facing +1 = head to the right.
  function fishShadow(x, y, len, facing, flap, alpha) {
    ctx.globalAlpha = alpha;
    var bl = Math.max(4, Math.round(len * 0.7)), bh = Math.max(3, Math.round(len * 0.3));
    for (var j = 0; j < bh; j++) {
      var yy = (j + 0.5 - bh / 2) / (bh / 2);
      var half = Math.max(1, Math.round(bl / 2 * Math.sqrt(1 - yy * yy)));
      px(x - half, y - bh / 2 + j, half * 2, 1, 4);
    }
    var tl = Math.max(2, len - bl), bx = x - facing * Math.round(bl / 2);
    for (var k = 0; k < tl; k++) {
      var sp = Math.round(k * 0.7), off = Math.round(flap * (k + 1) / tl);
      px(bx - facing * (k + 1), y - sp + off, 1, sp * 2 + 1, 4);
    }
    ctx.globalAlpha = 1;
  }
  function inside(v) {
    for (var k = 0; k < 20 && !inPond(v.x, v.y, 0.8); k++) { v.x = POND.cx + (v.x - POND.cx) * 0.94; v.y = POND.cy + (v.y - POND.cy) * 0.94; }
  }

  function drawDecor(tt) {
    drawSignpost(tt);
    if (L.tier(S, 'bait')) spr(SP.can, 37, 128);
    if (S.ms.lantern) {
      spr(SP.lantern, 50, 160);
      if (Math.floor(tt * 3) % 5) { px(52, 163, 3, 2, 0); } else px(53, 163, 1, 2, 1);
    }
    if (S.ms.boat) {
      var bb = Math.floor(tt * 1.2) % 2;
      spr(SP.boat, 126, 172 + bb);
      for (var k = 0; k < 8; k++) px(144 + k, 174 + Math.round(k * 0.5) + bb, 1, 1, 3);
    }
    if (S.ms.cat) {
      var alert = !!reel || S.fish.phase === 'bite';
      var blink = !alert && Math.floor(tt * 10) % 41 === 0;
      spr(alert ? SP.catAlert : blink ? SP.catBlink : SP.cat, 27, 126);
      if (!alert && Math.floor(tt * 0.8) % 3 === 0) px(26, 129, 1, 1, 4);          // tail flick
    }
  }
  function drawSwimmers(tt, dt) {
    nextSwim -= dt;
    if (nextSwim <= 0) {
      nextSwim = 7 + Math.random() * 12;
      var d = Math.random() < 0.5 ? -1 : 1;
      swimmers.push({ x: POND.cx - d * POND.rx * 0.75, y: POND.cy + (Math.random() - 0.5) * POND.ry * 1.1,
        dir: d, sp: 7 + Math.random() * 9, len: 6 + Math.floor(Math.random() * 5), ph: Math.random() * 6, age: 0 });
    }
    for (var n = swimmers.length - 1; n >= 0; n--) {
      var s = swimmers[n];
      s.age += dt; s.x += s.dir * s.sp * dt; s.y += Math.sin(tt * 1.3 + s.ph) * dt * 4;
      if (s.age > 1 && (!inWet(s.x, s.y, 0.85) || s.x < -10 || s.x > W + 10)) { swimmers.splice(n, 1); continue; }
      fishShadow(s.x, s.y, s.len, s.dir, Math.round(Math.sin(tt * 7 + s.ph)), 0.22);
    }
  }


  function drawWater(tt, dt) {
    if (scene === 'river') drawCurrent(tt);
    else if (scene === 'sea') drawWaves(tt);
    // water glints: slow, sparse
    for (var k = 0; k < 7 && scene === 'pond'; k++) {
      var ph = (tt * 0.25 + hash(k * 11) * 4) % 4;
      if (ph > 1.2) continue;
      var a = hash(k * 5 + 1) * Math.PI * 2, rr = Math.sqrt(hash(k * 9 + 2)) * 0.8;
      var gx = POND.cx + Math.cos(a) * POND.rx * rr, gy = POND.cy + Math.sin(a) * POND.ry * rr;
      px(gx - 1, gy, ph < 0.6 ? 3 : 2, 1, 0);
    }
    if (!reel) drawSwimmers(tt, dt);
  }
  function tickFishing(t) {
    if (!reel) {
      var f = L.updateFishing(S, t, Math.random, SPEED, curEnv(t));
      if (f === 'missed') toast('놓쳤다… 다시 던져보자');
      if (f === 'bite') { burst(S.fish.x, S.fish.y, 6, 0, 45); shake = Math.max(shake, 1); }
      if (f && f !== 'nibble') save();
    }
  }
  // line, bobber, hooked fish and the reel HUD; returns where the rod tip ends up
  function drawFishing(tt, dt) {
    var f = S.fish, tip = { x: ROD_TIP.x, y: ROD_TIP.y }, nowT = now();
    if (reel) {
      var held = holdPointer || holdSpace;
      var rs = L.reelStep(reel, dt, held, Math.random);
      var pulling = reel.burst > 0, warning = reel.warn > 0;
      if (pulling && !reelVis.pulling) { burst(reelVis.x, reelVis.y - 1, 14, 0, 90); shake = Math.max(shake, 2.5); }
      reelVis.pulling = pulling;
      // the fish is dragged from where it bit toward the dock as catch grows; bursts yank it away along reel.dir
      var tx = reelVis.sx + (ROD_TIP.x + 10 - reelVis.sx) * reel.catch * 0.85;
      var ty = reelVis.sy + (142 - reelVis.sy) * reel.catch * 0.85;
      var surge = pulling ? reel.dir * 18 : warning ? -reel.dir * 4 : 0;
      reelVis.jx += (surge - reelVis.jx) * Math.min(1, dt * (pulling ? 7 : 5));
      if (pulling) reelVis.jy += (Math.random() - 0.5) * 3;
      reelVis.jy *= 0.85;
      reelVis.x += (tx + reelVis.jx - reelVis.x) * Math.min(1, dt * 8);
      reelVis.y += (ty + reelVis.jy - reelVis.y) * Math.min(1, dt * 8);
      inside(reelVis);
      var facing = (pulling || warning) ? reel.dir : (reelVis.x > ROD_TIP.x ? -1 : 1);
      var len = Math.round(14 + 10 * Math.max(0, Math.min(1, (reel.power - 0.7) / 1.4)));
      var flap = Math.round(Math.sin(tt * (pulling ? 26 : warning ? 16 : 7)) * (pulling ? 3 : warning ? 2 : 1));
      var hx = reelVis.x + facing * len * 0.35, hy = reelVis.y;
      // wake and rings: wide and churning when pulling, a tight bright coil when about to pull
      if (pulling) {
        for (var w = 1; w < 8; w++) { px(reelVis.x - facing * (len * 0.5 + w * 2), reelVis.y - w * 0.8, 1, 1, 0); px(reelVis.x - facing * (len * 0.5 + w * 2), reelVis.y + w * 0.8, 1, 1, 0); }
        if (Math.random() < 0.7) burst(hx, hy - 1, 1 + (Math.random() < 0.4 ? 1 : 0), 0, 70);
        ring(reelVis.x, reelVis.y, len * 0.7 + (tt * 10 % 4), len * 0.3 + (tt * 5 % 2), 4);
      } else if (warning) {
        var wr = 2 + (tt * 14 % 3);
        ring(hx, hy, wr + 3, wr, 4); ring(hx, hy, wr + 6, wr + 1.5, 0);
      } else ring(reelVis.x, reelVis.y, len * 0.6 + (tt * 6 % 3), len * 0.25 + (tt * 3 % 1.5), 3);
      fishShadow(reelVis.x, reelVis.y + 1, len, facing, flap, warning ? 0.8 : pulling ? 0.7 : 0.55);
      // rod: bends toward the fish with tension, extra when the fish runs
      var ten = Math.min(1, reel.tension), ddx = hx - ROD_TIP.x, ddy = hy - ROD_TIP.y, dl = Math.hypot(ddx, ddy) || 1;
      var bendAmt = 2 + ten * 13 + (pulling ? 4 : 0) + (held ? 2 : 0);
      tip.x = ROD_TIP.x + ddx / dl * bendAmt * 0.55; tip.y = ROD_TIP.y + ddy / dl * bendAmt * 0.4 + bendAmt * 0.55;
      drawLine(tip.x, tip.y, hx, hy - 1, Math.max(0, 9 * (1 - ten) - (held ? 4 : 0) - (pulling ? 4 : 0)), ten > 0.75 || pulling ? 1 : 0);
      drawBobber(Math.round(hx + facing * 2), Math.round(hy - 2), 0, pulling || warning);
      if (warning && Math.floor(tt * 10) % 2 === 0) spr(BANG, hx - 3, hy - 20);
      // HUD strip
      tBar.style.width = Math.round(Math.min(1, reel.tension) * 100) + '%';
      cBar.style.width = Math.round(Math.max(0, Math.min(1, reel.catch)) * 100) + '%';
      tWrap.classList.toggle('hot', reel.tension > 0.75);
      var cue = warning ? '손 떼!' : pulling ? (held ? '줄 끊어져요!' : '버텨…') : held ? '' : (reel.t < 2.5 ? '꾹 눌러 감기' : '감아!');
      cueEl.hidden = !cue;
      if (cue) {
        cueEl.textContent = cue;
        cueEl.classList.toggle('loud', warning || (pulling && held));
        cueEl.style.left = Math.round(Math.max(40, Math.min(140, hx)) * 2) + 'px';
        cueEl.style.top = (36 + Math.round((hy - (warning ? 34 : 18)) * 2)) + 'px';
      }
      if (rs) endReel(rs);
    } else if (f.phase === 'wait' || f.phase === 'bite') {
      var bx = f.x, byy = f.y, dip = 0, sunk = false;
      if (castAnim) {
        castAnim.t += dt / 0.45;
        var ct = Math.min(1, castAnim.t);
        bx = ROD_TIP.x + (f.x - ROD_TIP.x) * ct;
        byy = ROD_TIP.y + (f.y - ROD_TIP.y) * ct - Math.sin(ct * Math.PI) * 18;
        if (castAnim.t >= 1) { castAnim = null; burst(f.x, f.y, 4, 0, 30); }
      }
      if (f.phase === 'wait' && !castAnim) {
        var leftReal = (f.biteAt - nowT) / SPEED / 1000;
        // the biter: a shadow that circles in during the last seconds
        if (leftReal < 4) {
          var ap = Math.max(0, leftReal) / 4;
          fishShadow(f.x + 7 + ap * 22 * Math.cos(tt), f.y + 4 + ap * 8, 10, Math.cos(tt) > 0 ? -1 : 1, Math.round(Math.sin(tt * 9)), 0.45 - ap * 0.2);
        }
        if (nowT < f.nibEnd) {
          // decoy nibble: a small fish taps the bait twice; the float stays up
          var np = 1 - (f.nibEnd - nowT) / SPEED / L.NIBBLE_MS;
          dip = (np < 0.18 || (np > 0.45 && np < 0.6)) ? 1 : 0;
          fishShadow(f.x + 6, f.y + 3, 7, -1, Math.round(Math.sin(tt * 14)), 0.32);
          ring(f.x, f.y + 1, 2 + np * 4, 1 + np * 2, 3);
        } else ring(f.x, f.y + 1, 3 + (tt * 2 % 3), 1 + (tt % 1.5), 2);
      }
      if (f.phase === 'bite') {
        // real bite: the float is dragged under and big rings spread
        sunk = true; dip = Math.floor(tt * 8) % 2;
        ring(f.x, f.y + 1, 3 + (tt * 10 % 5), 1.5 + (tt * 5 % 2.5), 4);
        ring(f.x, f.y + 1, 6 + (tt * 10 % 5), 3 + (tt * 5 % 2.5), 0);
        fishShadow(f.x + 3, f.y + 2, 11, -1, Math.round(Math.sin(tt * 20) * 2), 0.6);
        spr(BANG, f.x - 3, f.y - 18 + (Math.floor(tt * 6) % 2));
      }
      drawLine(tip.x, tip.y, bx, byy - 3, castAnim ? 0 : (sunk ? 2 : 8), 0);
      if (sunk) { tip.y += 2; tip.x += 1; }
      drawBobber(Math.round(bx), Math.round(byy), dip, sunk);
    }
    if (scareFx) {
      scareFx.t += dt;
      if (scareFx.t > 0.7) scareFx = null;
      else {
        var sxp = { x: scareFx.x + scareFx.dir * scareFx.t * 70, y: scareFx.y + scareFx.t * 6 };
        fishShadow(sxp.x, sxp.y, 9, scareFx.dir, Math.round(Math.sin(tt * 30) * 2), 0.5 * (1 - scareFx.t / 0.7));
        ring(scareFx.x - scareFx.dir * 4, scareFx.y - 2, 4 + scareFx.t * 10, 2 + scareFx.t * 4, 3);
      }
    }
    return tip;
  }
