  // ---------- farm render ----------
  function drawLocked(i) {
    // unbought ground: rough grass inside a dashed stake line, so the expansion reads as a goal
    var r = plotRect(i);
    for (var x = r.x + 1; x < r.x + r.w - 1; x += 3) { px(x, r.y, 1, 1, 2); px(x, r.y + r.h - 1, 1, 1, 2); }
    for (var y = r.y + 1; y < r.y + r.h - 1; y += 3) { px(r.x, y, 1, 1, 2); px(r.x + r.w - 1, y, 1, 1, 2); }
    for (var k = 0; k < 7; k++) {
      var gx = r.x + 4 + Math.floor(hash(i * 31 + k * 7) * (r.w - 9)), gy = r.y + 6 + Math.floor(hash(i * 17 + k * 3) * (r.h - 10));
      px(gx, gy, 1, 2, 3); px(gx + 2, gy - 1, 1, 3, 3); px(gx + 1, gy + 1, 1, 1, 2);
    }
    px(r.x + r.w - 9, r.y + 3, 1, 9, 4); px(r.x + r.w - 13, r.y + 3, 9, 5, 4); px(r.x + r.w - 12, r.y + 4, 7, 3, 0);
    px(r.x + r.w - 11, r.y + 5, 5, 1, 3);
  }
  function drawPlot(i, tt) {
    var r = plotRect(i), p = S.plots[i];
    // soil with furrows
    px(r.x + 1, r.y, r.w - 2, r.h, 4); px(r.x, r.y + 1, r.w, r.h - 2, 4);
    px(r.x + 1, r.y + 1, r.w - 2, r.h - 2, p.crop ? 1 : 0);
    for (var fy = r.y + 6; fy < r.y + r.h - 2; fy += 7)
      for (var fx = r.x + 3; fx < r.x + r.w - 3; fx++) if ((fx + fy) % 3 !== 0) px(fx, fy, 1, 1, 2);
    if (p.fert) for (var k3 = 0; k3 < 9; k3++) px(r.x + 3 + Math.floor(hash(i * 13 + k3) * (r.w - 6)), r.y + r.h - 3 - (k3 % 3) * 2, 1, 1, 3);
    if (!p.crop) {
      if (i === 0 && fresh && S.dex.crops.radish === undefined) { px(r.x + 20, r.y + 12, 4, 1, 3); px(r.x + 21, r.y + 10, 2, 5, 3); }
      return;
    }
    var st = L.stage(p), ready = st === 4;
    var bob = ready ? (Math.floor(tt * 2 + i) % 2) : 0;
    var xs = (p.crop === 'melon' || p.crop === 'gold' || p.crop === 'pumpkin') ? [13, 31] : [8, 22, 36];
    var baseY = r.y + r.h - 5;
    xs.forEach(function (ox, k) {
      var cx = r.x + ox, sway = (st >= 1 && st < 4 && Math.floor(tt * 1.5 + k + i) % 4 === 0) ? 1 : 0;
      if (st === 0) { px(cx - 1, baseY - 1, 3, 1, 3); px(cx, baseY - 2, 1, 1, 4); return; }
      if (st === 1) { spr(SP.sprout, cx - 2 + sway, baseY - 4); return; }
      if (p.crop === 'radish') spr(st === 2 ? SP.radish2 : st === 3 ? SP.radish3 : SP.radish4, cx - 3 + sway, baseY - (st === 2 ? 5 : st === 3 ? 6 : 10) - bob);
      else if (p.crop === 'berry') {
        if (st === 2) spr(SP.berry2, cx - 3 + sway, baseY - 7);
        else if (st === 3) { spr(SP.rosette, cx - 4, baseY - 2); spr(SP.berry3, cx - 2 + sway, baseY - 7); }
        else { spr(SP.rosette, cx - 4, baseY - 2); spr(SP.berry4, cx - 4, baseY - 12 - bob); }
      }
      else if (p.crop === 'potato') {
        if (st === 2) spr(SP.bush2, cx - 3 + sway, baseY - 4);
        else if (st === 3) spr(SP.potato3, cx - 4 + sway, baseY - 5);
        else spr(SP.potato4, cx - 4, baseY - 6 - bob);
      }
      else if (p.crop === 'pepper') {
        if (st === 2) spr(SP.bush2, cx - 3 + sway, baseY - 4);
        else spr(st === 3 ? SP.pepper3 : SP.pepper4, cx - 3 + sway, baseY - (st === 3 ? 5 : 7) - bob);
      }
      else if (p.crop === 'tomato') {
        if (st === 2) spr(SP.bush2, cx - 3 + sway, baseY - 4);
        else {
          spr(SP.tomvine, cx - 3 + sway, baseY - 9);
          if (st === 4) { spr(SP.tomato, cx - 5, baseY - 6 - bob); spr(SP.tomato, cx + 1, baseY - 9 - bob); }
        }
      }
      else if (p.crop === 'corn') {
        spr(st === 2 ? SP.corn2 : st === 3 ? SP.corn3 : SP.corn4, cx - (st === 4 ? 3 : 2) + sway, baseY - (st === 2 ? 5 : st === 3 ? 7 : 11) - bob);
      }
      else if (L.CROPS[p.crop].season) drawSeasonCrop(p.crop, st, cx, baseY, sway, bob);
      else if (p.crop === 'pumpkin') {
        spr(SP.vine, cx - 4 + sway, baseY - 5);
        if (st === 3) pumpkin(cx + 1, baseY, 7, 5);
        if (st === 4) pumpkin(cx, baseY + 1 - bob, 14, 9);
      }
      else {
        spr(SP.vine, cx - 4 + sway, baseY - 5);
        if (st === 3) melon(cx + 1, baseY, 7, 5, p.crop === 'gold');
        if (st === 4) melon(cx, baseY + 1 - bob, 13, 10, p.crop === 'gold');
      }
    });
    if (ready) {
      sparkle(r.x + r.w - 5, r.y + 4, tt + i * 0.37);
      if (p.crop === 'gold') { sparkle(r.x + 5, r.y + 6, tt + 0.5); sparkle(r.x + 22, r.y + 2, tt + 0.25); }
    } else {
      // progress bar: solid while growing, dashed while paused by weed
      var f = p.progress / L.CROPS[p.crop].grow, bw = r.w - 4;
      px(r.x + 2, r.y + r.h + 1, bw, 3, 4);
      px(r.x + 3, r.y + r.h + 2, bw - 2, 1, 0);
      var fill = Math.round((bw - 2) * f);
      for (var q = 0; q < fill; q++) if (!p.weed || q % 2 === 0) px(r.x + 3 + q, r.y + r.h + 2, 1, 1, 3);
    }
    if (p.crop === 'gold') spr(SP.star, r.x + 2, r.y + 2);
    if (p.weed) {
      spr(SP.weed, r.x + 6, r.y + 3); spr(SP.weed, r.x + 28, r.y + 4, true);
      spr(SP.weed, r.x + 17, r.y + 9);
    }
    if (p.crow) {
      var leftMs = (p.crow.until - now()) / SPEED;
      var urgent = leftMs < 15000;
      var ph = Math.floor(tt * (urgent ? 6 : 2.5) + i) % 4;
      var hop = ph === 2 ? 2 : 0;
      var cx2 = r.x + 14 + Math.round(Math.sin(tt * 0.6 + i) * 8);
      // white halo so the crow reads against plants without any colour
      var rows = ph === 0 ? SP.crowPeck : ph === 1 ? SP.crowFlap : SP.crow, flip = Math.cos(tt * 0.6 + i) < 0;
      for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) if (ox || oy) spr(rows.map(function (rw) { return rw.replace(/[0-4]/g, '0'); }), cx2 + ox, r.y + 4 - hop + oy, flip);
      spr(rows, cx2, r.y + 4 - hop, flip);
      // countdown pips above the crow: one pip per 10 s left
      var pips = Math.max(0, Math.min(6, Math.ceil(leftMs / 10000)));
      for (var k2 = 0; k2 < pips; k2++) px(cx2 + 1 + k2 * 2, r.y + 1 - hop, 1, 1, 4);
    }
  }

  function drawScarecrows(tt) {
    var t = L.tier(S, 'scare');
    if (!t) return;
    var wob = scareWob > 0 ? (Math.floor(tt * 12) % 2 ? 1 : -1) : 0;
    spr(SP.scarecrow, 4 + wob, 38);
    if (t >= 2) { px(4 + wob, 44, 1, 3, 0); px(3 + wob, 45, 1, 3, 2); }           // tin can on the arm
    if (t >= 3) spr(SP.scarecrow, 170 - wob, 38, true);
  }

  // returns true when (x, y) hit a plot, bought or not
  function tapPlot(x, y) {
    var t = now();
    for (var i = 0; i < L.N_MAX; i++) {
      var r = plotRect(i);
      if (x < r.x - 2 || x > r.x + r.w + 2 || y < r.y - 2 || y > r.y + r.h + 3) continue;
      if (i >= S.plots.length) {
        var c = L.upgradeCost(S, 'field');
        toast(c === null ? '여기는 아직 풀밭' : '상점에서 밭 확장 · ' + c + '코인');
        return true;
      }
      var p = S.plots[i];
      if (p.crow) {
        if (L.shoo(S, i, t)) { burst(r.x + 22, r.y + 10, 8, 4, 70); toast('훠이! 까마귀를 쫓았다'); }
        refresh(); return true;
      }
      if (p.weed) {
        L.pullWeed(S, i, t); burst(r.x + 22, r.y + 14, 8, 3, 50); toast('잡초 뽑기 완료 · 다시 자란다');
        refresh(); return true;
      }
      if (L.isReady(p)) {
        var hv = L.harvest(S, i, t, Math.random);
        burst(r.x + 22, r.y + 14, 10, 3, 60);
        floatText(hv.sold ? '+' + hv.sold : '+' + L.CROPS[hv.crop].name, r.x + 22, r.y + 4);
        if (hv.gold) toast('★ 딸기×수박 교배! 황금 수박 씨앗을 얻었다', 3500);
        else if (hv.sold) toast('바구니가 꽉 차서 바로 팔았다 · +' + hv.sold);
        else if (hv.lost) toast(L.CROPS[hv.crop].name + ' 수확 · 까마귀가 조금 먹었다');
        else toast(L.CROPS[hv.crop].name + ' 수확 · 바구니에 담았다');
        milestones();
        refresh(); return true;
      }
      if (S.sel === 'fert') {
        if (!p.crop) { toast('비료는 자라는 작물에 · 씨앗을 골라 심어요'); return true; }
        if (L.fertilize(S, i, t)) { burst(r.x + 22, r.y + 18, 8, 2, 40); toast('비료 · ' + L.CROPS[p.crop].name + ' 두 배로 자란다'); }
        else toast(p.fert ? '이미 비료를 줬어요' : '비료가 없어요');
        refresh(); return true;
      }
      if (!p.crop) {
        var id = S.sel;
        if (L.plant(S, i, id, t, curEnv(t).season)) { burst(r.x + 22, r.y + 20, 5, 2, 30); floatText(id === 'gold' ? '★' : '-' + L.CROPS[id].cost, r.x + 22, r.y + 6); }
        else if (!seedInSeason(id)) { toast(L.CROPS[id].name + '는 ' + L.SEASON_NAME[L.CROPS[id].season] + '에만 심을 수 있어요'); }
        else { toast('코인이 부족해요'); var tb = trayBtns[id].b; tb.classList.remove('shake'); void tb.offsetWidth; tb.classList.add('shake'); }
        refresh(); return true;
      }
      toast(L.CROPS[p.crop].name + ' · ' + fmtLeft(L.timeLeft(p)) + ' 남음' + (p.fert ? ' · 비료' : ''));
      return true;
    }
    return false;
  }

  function tickFarm(t) {
    L.advance(S, t, TZ).forEach(function (ev) {
      var r = plotRect(ev.i);
      toast('까마귀가 쪼아먹었다… 수확량 -30%');
      burst(r.x + 22, r.y + 8, 6, 4, 60);
    });
    var e = L.spawnEvent(S, t, Math.random, SPEED);
    if (e && e.type === 'scared') {
      var pr = plotRect(e.i);
      flyCrows.push({ x: pr.x + 16, y: pr.y + 2, t: 0 });
      scareWob = 1.5;
      toast('허수아비가 까마귀를 쫓아냈다', 2400);
    } else if (e) toast(e.type === 'crow' ? '까마귀다! 1분 안에 쫓아내자' : '잡초가 났다 · 성장이 멈췄다', 2600);
  }
  function drawFarm(tt, dt) {
    for (var i = 0; i < L.N_MAX; i++) { if (i < S.plots.length) drawPlot(i, tt); else drawLocked(i); }
    drawScarecrows(tt);
    for (var c = flyCrows.length - 1; c >= 0; c--) {
      var fc = flyCrows[c]; fc.t += dt;
      if (fc.t > 1.6) { flyCrows.splice(c, 1); continue; }
      spr(Math.floor(fc.t * 10) % 2 ? SP.crowFlap : SP.crow, fc.x + fc.t * 50, fc.y - fc.t * 30 - fc.t * fc.t * 10);
    }
  }
