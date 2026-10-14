// 밸런스 검증 봇 — index.html?bot=warrior|sorc|ranger|necro|all 로 열면 실행된다.
// 마우스/키보드 대신 게임 함수를 직접 호출해 보통 1~4막 + 악몽 1막을 진행하고,
// 막별 소요 시간(게임 내 분)·사망·귀환·레벨을 표로 남긴다. 결과: window.BOT_REPORT, 콘솔, 화면 좌측 상단.
(async () => {
  const DT = 1 / 30, LIMIT_MIN = +(new URLSearchParams(location.search).get('limit') || 40);   // 막 하나에 게임 시간 40분이 넘으면 막힌 것으로 본다
  botMode = true; muted = true;

  const near = (at, r) => monsters.filter(o => dist(o, at) < r).length;
  const RULES = {
    warrior: [['whirl', () => near(player, 130) >= 3], ['cry', () => near(player, 150) >= 3],
      ['leap', m => dist(m, player) > 160], ['bash', m => dist(m, player) < 70]],
    sorc: [['nova', () => near(player, 140) >= 3], ['chain', m => near(m, 170) >= 2], ['fireball', () => true]],
    ranger: [['rain', m => near(m, 90) >= 3], ['multi', () => near(player, 260) >= 3], ['ice', m => m.elite || m.boss], ['pierce', () => true]],
    necro: [['raise', () => allies.length < 1 + player.sk.raise], ['corpse', m => corpses.some(k => k.mhp && dist(k, m) < 70)],
      ['amp', m => (m.elite || m.boss || near(m, 110) >= 3) && !(m.cursed > 0)], ['spear', () => true]],
  };

  function aim(t) {
    cam.x = player.x - vw / 2; cam.y = player.y - (vh - HUDH) / 2;
    mouse.x = t.x - cam.x; mouse.y = t.y - cam.y;
  }
  function tryCast(m) {
    const p = player;
    for (const [id, when] of RULES[p.cls]) {
      const i = cls().skills.indexOf(id), cost = Math.round(SK[id].mp * (hasFx('chant') ? .7 : 1));
      if (!p.sk[id] || p.mp < cost || !when(m)) continue;
      aim(id === 'corpse' ? corpses.filter(k => k.mhp && dist(k, m) < 70)[0] : m);
      const before = p.mp;
      cast(i);
      if (p.mp < before) return true;
    }
    return false;
  }
  function manage() {
    const p = player;
    while (p.pts > 0) {   // 가장 랭크가 낮은 배운 스킬부터 올림
      const id = cls().skills.filter(s => p.lvl >= SK[s].lv).sort((a, b) => p.sk[a] - p.sk[b])[0];
      p.sk[id]++; p.pts--;
    }
    for (let i = p.bag.length - 1; i >= 0; i--) {
      const it = p.bag[i], cur = p.eq[it.slot];
      if (score(it) > score(cur)) { p.bag.splice(i, 1); p.eq[it.slot] = it; if (cur) p.bag.push(cur); }
    }
  }
  function town(st) {
    const p = player;
    for (const it of p.bag) p.gold += price(it);
    p.bag = []; p.hp = mhp(); p.mp = mmp();
    const buy = (k, n, cost) => { while (p[k] < n && p.gold >= cost) { p.gold -= cost; p[k]++; } };
    buy('tp', 2, 30); buy('hpPot', 6, 20); buy('mpPot', 4, 20);
    if (actDone) return interact(objs.find(o => o.type === 'actPortal'));
    const pt = objs.find(o => o.type === 'portal');
    if (pt) interact(pt); else enter(Math.max(1, maxFloor));
  }
  function dungeon(st, s) {
    const p = player;
    if (p.hp < mhp() * .45 && p.hpPot) { usePot('hp'); st.물약++; }
    if (p.mp < mmp() * .2 && p.mpPot) usePot('mp');
    if (p.hp < mhp() * .3 && !p.hpPot && p.tp) { townPortal(); st.귀환++; return; }
    if (actDone) { const ap = objs.find(o => o.type === 'actPortal'); if (ap) p.target = ap; return; }
    if (p.whirl > 0) return;
    const now = s.clock;
    if (p.target && p.target === s.watch) {
      if ((p.target.hp ?? 0) < s.watchHp) { s.watchHp = p.target.hp; s.since = now; }
      else if (now - s.since > 6) { s.ignore.set(p.target, now + 10); p.target = null; }
    } else { s.watch = p.target; s.watchHp = p.target?.hp ?? 0; s.since = now; }
    const ok = o => !(s.ignore.get(o) > now);
    const m = monsters.filter(o => ok(o) && visible(o) && dist(o, p) < 320 && (los(p, o) || dist(o, p) < 120)).sort((a, b) => dist(a, p) - dist(b, p))[0];
    if (m) {
      s.idle = 0;
      if (s.castCd <= 0 && los(p, m) && tryCast(m)) { s.castCd = .35; return; }
      if (!monsters.includes(p.target)) p.target = m;
      return;
    }
    const loot = items.find(it => ok(it) && it.kind === 'eq' && dist(it, p) < 220 && p.bag.length < BAG);
    if (loot) { p.target = loot; return; }
    if (!p.target) p.target = monsters.find(o => o.boss) || objs.find(o => o.type === 'stairs');
    s.idle += .1;
    if (s.idle > 15) {   // 15초 동안 싸우지도 못하고 제자리 → 막힌 것으로 보고 다음 목표로 옮김
      const g = monsters.find(o => o.boss) || objs.find(o => o.type === 'stairs');
      if (g && dist(p, s.last) < 30) { Object.assign(p, { x: g.x, y: g.y + 20 }); st.막힘++; }
      s.idle = 0; s.last = { x: p.x, y: p.y };
    }
  }

  // 막혔을 때 원인 파악용 상태 요약
  function diag() {
    const p = player, n = monsters.filter(o => dist(o, p) < 400).sort((a, b) => dist(a, p) - dist(b, p))[0];
    const t = p.target;
    return `층${floor} 위치(${p.x | 0},${p.y | 0}) 대상:${t ? (t.name || t.type || t.kind) : '-'} 경로:${p.path?.length ?? '-'}`
      + ` 근처:${n ? `${n.name} d${dist(n, p) | 0} 시야${los(p, n)} 길${!!path(p.x, p.y, n.x, n.y)} 기절${n.stun > 0}` : '-'}`
      + ` 보스:${monsters.some(o => o.boss)} 완료:${actDone} 소환:${allies.length} 소용돌이:${p.whirl > 0}`;
  }
  async function run(c) {
    localStorage.removeItem(SAVE);
    startGame(null, c); closePanel();
    const rows = [], s = { castCd: 0, idle: 0, last: { x: 0, y: 0 }, clock: 0, ignore: new Map(), since: 0 };
    let st = null, t = 0, think = 0, curKey = '';
    const key = () => `${DIFF[dl]} ${act + 1}막`;
    for (let tick = 0; ; tick++) {
      if (key() !== curKey) {   // 막이 바뀌면 기록 시작
        if (st) rows.push(st);
        curKey = key();
        if (rows.length === 5) break;   // 보통 1~4막 + 악몽 1막
        st = { 직업: CLASSES[c].name, 막: curKey, 분: 0, 사망: 0, 귀환: 0, 물약: 0, 막힘: 0, 레벨: 0, '최저HP%': 100 };
      }
      if (!panel.hidden) {
        const b = [...document.querySelectorAll('#p-btns button')].find(b => /난이도 시작/.test(b.textContent));
        if (b) b.click(); else if (panelLocked) { rows.push(st); break; } else closePanel();
      }
      if (dead) { st.사망++; respawn(); }
      think -= DT; s.castCd -= DT; s.clock += DT;
      if (think <= 0) { think = .1; manage(); floor === 0 ? town(st) : dungeon(st, s); }
      update(DT);
      t += DT; st.분 = +(st.분 + DT / 60).toFixed(3); st.레벨 = player.lvl;
      if (floor) st['최저HP%'] = Math.min(st['최저HP%'], Math.round(player.hp / mhp() * 100));
      if (st.분 > LIMIT_MIN) { st.막 += ' (시간 초과)'; st.진단 = diag(); rows.push(st); break; }
      if (tick % 3000 === 0) await new Promise(r => setTimeout(r));
    }
    for (const r of rows) r.분 = Math.round(r.분 * 10) / 10;
    return rows;
  }

  const list = BOT === 'all' ? Object.keys(CLASSES) : [BOT];
  const report = [];
  for (const c of list) report.push(...await run(c));
  window.BOT_REPORT = report;
  console.table(report);
  const pre = document.createElement('pre');
  pre.style.cssText = 'position:fixed;left:8px;top:8px;margin:0;padding:12px;background:var(--color-void);color:var(--color-ink);font:12px/1.5 monospace;z-index:9;max-height:90vh;overflow:auto';
  pre.textContent = report.map(r => Object.entries(r).map(([k, v]) => `${k} ${v}`).join(' | ')).join('\n');
  document.body.append(pre);
  botMode = false;
})();
