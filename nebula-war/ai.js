// 네뷸라 워 — 규칙 기반 AI. sim 상태를 읽기만 하고 사람과 같은 명령을 낸다.
// DOM·Math.random·Date·g.rng 금지(결정론). 적은 S.visible + 기억(mem.bld)으로만 안다.
//
//   create(g, p, { level, seed, board, pers, cast }) → ai   (cast: 0 = 마법 끔 — 테스트 전용)        ai.think(g) → cmds[]  (판단 틱이 아니면 [])
//   fromRoster(g, players, seed) → ais[]   (q.ai 있는 자리만, 팀마다 board 공유)
//   collect(g, ais, cmds) → cmds           (플레이어 번호 순으로 이어 붙인다)
//   view(g, p, mem) → { tick, p, me, own, allies, foes, res, known }   (foes = 보이는 적만, 같은 패스에서 기억 갱신)
const NW_AI = (function nwAI() {
  const S = typeof NW_SIM !== 'undefined' ? NW_SIM : require('./sim.js');
  const D = S.D, TFP = S.TFP;
  const CAST = typeof NW_AI_CAST !== 'undefined' ? NW_AI_CAST : require('./ai-cast.js');

  // ---- ① 표 ----
  const LEVELS = { // every: 판단 간격(틱), wpc: 수정 1개당 일꾼 ×2, gas: 가스 건물당 일꾼, acc: 빌드 진행 확률(%),
                   // scoutAt: 정찰 출발 일꾼 수, micro: 0 없음·1 집중사격/사거리 뒤로·2 +다친 유닛 빼기·카이팅·상성, retreat: 적/아군 가치 비가 이 값(%) 넘으면 후퇴(0 = 안 함), attack: 공격 기준 배율(%),
                   // maxProd: 생산 건물 상한, patrol: 순찰 주기(틱, 0 = 안 함), firstAttack: 이 틱 전엔 공격 개시 안 함(방어는 함),
                   // expandLate: 빌드 이후 확장(expandAt)을 이만큼 늦춤, noRush: 러시 성향(P.rush) 안 고름,
                   // armyPerMin: 병력 가치 상한 = 게임 분 × 이 값 × ECO(넘으면 조합·수정 전용 유닛 생산 안 함), casters: 시전 유닛 목표 배율(%, casterOne),
                   // macro: 남는 수정 쓰기(네뷸라 막히면 빌드 중에도 가스·확장, 수정 전용 유닛·건물 기준 절반)
                   // cast: 시전(ai-cast.js) — lvl 규칙 최소 난이도, every 판단 n번에 1번, max 판단당 시전 명령, clump 뭉침 최소 수,
                   //       ff 아군 피해 회피(1 가치 비율·2 반경 안 0), reserve 결정적 마법 마나 남기기, toggles 교전 끝나면 토글 끄기, synergy 전술 연계
    // 2026-10-16 플레이 테스터: 전반적으로 어렵다 → 세 단계 모두 한 단계씩 낮춤(전술·마법 규칙은 그대로, 경제·판단 주기·공격 시점으로).
    //   어려움 ≈ 옛 보통(판단 8틱·일꾼 수정당 1.5·빌드 진행 90%·후퇴 150·공격 기준 ×1.2, micro 2·마법 3단계·macro 유지 — 옛 보통과 48판 24승),
    //   보통 = 옛 쉬움과 옛 보통 사이(판단 16틱·빌드 진행 60%·생산 건물 3·5분 전 공격 없음·공격 기준 ×1.4·병력 상한 분당 160·시전 유닛 절반·시전 판단 3번에 1번),
    //   쉬움 = 입문(판단 24틱·러시 성향 없음·9분 30초(11400틱) 전 공격 없음·공격 기준 ×1.4·빌드 진행 40%·확장 4500틱 늦게·병력 상한 분당 90(×ECO: 10분 1125))
    easy:   { every: 24, wpc: 2, gas: 2, acc: 40,  scoutAt: 13, micro: 0, retreat: 0,   attack: 140, maxProd: 2, patrol: 0, firstAttack: 11400, expandLate: 4500, noRush: true, armyPerMin: 90, casters: 50,
              cast: { lvl: 1, every: 4, max: 1 } },
    normal: { every: 16, wpc: 3, gas: 3, acc: 60,  scoutAt: 11, micro: 1, retreat: 150, attack: 140, maxProd: 3, patrol: 3000, firstAttack: 6000, expandLate: 2000, armyPerMin: 160, casters: 50,
              cast: { lvl: 2, every: 3, max: 3, clump: 4, ff: 1 } },
    hard:   { every: 8,  wpc: 3, gas: 3, acc: 90,  scoutAt: 9,  micro: 2, retreat: 150, attack: 120, maxProd: 5, patrol: 2000, casters: 150, macro: true,
              cast: { lvl: 3, every: 1, max: 6, clump: 3, ff: 2, reserve: true, toggles: true, synergy: true } },
  };
  // 자원 기준값(공격 가치·저축·잉여 수정/네뷸라) 배율 — 5bbc37e 재조정에서 비용·채집량이 함께 ×1.25
  const ECO = 1.25;
  // 관리자 상수(타일·틱·%) — 튜닝 손잡이
  const K = {
    DEFEND_R: 14,    // 자기 건물 이만큼 안의 보이는 적 유닛 = 방어
    RETREAT_R: 12,   // 후퇴 판단: 병력 중심 이 반경 안 적·아군 가치
    CALM: 600,       // 후퇴 후 재공격까지 틱
    RALLY_R: 6,      // 집결점 도착·목표 사이트 도착 반경
    MICRO_CMDS: 6,   // 전술 판단당 명령 상한
    PULL_HP: 30, BACK_HP: 60, PULL_HIT: 40, PULL_HP_MUT: 50, BACK_HP_MUT: 80, // 다친 유닛 빼기: hp% 미만·최근 피격 틱, 복귀 hp%
    KITE_RANGE: 96, MELEE: 32,              // 카이팅 사거리 하한(px), 근접 판정(px)
    UNSEEN_R: 12, UNSEEN_WIN: 240, DETECT_FOR: 6000, // 안 보이는 적: 반경, 사건 창(틱), 탐지 건물 유지 틱
    ASSIST_HIT: 60, ASSIST_HOLD: 120,       // 사람 팀원 지원: 피격 인정 틱, 해제 틱
    DRY: 4,                                 // 기지 주변 수정 덩이가 이 이하면 확장 우선
    OVERWHELM: 3,                           // 후퇴 안 함: 전체 병력 ≥ 근처 적 가치 × 이 배 × 후퇴 비율
    CELL: 8,                                // 끝판 탐색 칸 한 변(타일)
    STUCK: 900,                             // 공격 목표에 이 틱 동안 진척이 없으면 건너뜀
    SPLIT: 4,                               // 공격 중 습격: 병력이 습격 가치의 이 배 이상이면 일부만 방어
    LEAD_WAIT: 1200,                        // 팀원 단독 개시: 리더가 이 틱 동안 공격을 개시하지 않으면 팀원이 기준 충족 시 직접
    ASSIST_R: 10, ASSIST_MIN: 150,          // 사람 팀원 지원: 피격 지점 이 반경 안 보이는 적 가치가 이 이상일 때만
    X_GIVEUP: 1500,                         // 확장('x') 단계가 이 틱 동안 연속 실패(자리 없음)하면 건너뜀
    CAST_CMDS: 6,                           // 시전 명령 판단당 절대 상한(난이도 값은 LEVELS.cast.max)
    CASTER_BEHIND: 2, CASTER_FAR: 6,        // 무기 없는 시전 유닛: 병력 중심에서 집결점 쪽 이 타일 뒤, 이 타일 넘게 벌어지면 재명령
    CASTER_FRONT: 33,                       // 공격 중 시전 유닛이 따라갈 병력 = 목표에 가까운 이 % (최소 1기)
  };
  const LEVEL_NAMES = { easy: '쉬움', normal: '보통', hard: '어려움' };
  const NAMES = { // 종족별 AI 이름(자체 명칭, 표시 전용)
    legion: ['볼크 대령', '하딘 소령', '레이스 중령', '카브 장군', '오렌 대위', '텔마 준장'],
    swarm: ['심연모', '갈퀴 여왕', '포식 의지', '울음 군락', '검은 산란', '굶주린 둥지'],
    elysian: ['세레이아', '아우렐', '노바린', '이실렌', '카에도르', '벨리아'],
  };
  // 성향: build = 순서 있는 누적 목표(첫 미충족 단계를 진행). 'w' 일꾼 수, 'b' 건물(같은 id 반복 = n개째, 부속은 본체가 build),
  // 'm' 변태, 'gas' 가스 건물 수, 'x' 확장 수, 'u' 유닛 수(큐 포함), 'up' 연구 1단계. 이후 mix 비율 생산·research 순서 연구·expandAt 확장.
  const PERS = { legion: {}, swarm: {}, elysian: {} }; // 종족당 3개(키 고정)
  PERS.legion.rush = { name: '보병 러시', rush: true,
    build: [['w', 9], ['b', 'depot'], ['w', 10], ['b', 'garrison'], ['b', 'garrison'], ['w', 12], ['gas', 1], ['b', 'drillhall'],
      ['u', 'trooper', 6], ['b', 'depot'], ['up', 'legion_trooper_range'], ['b', 'workshop'], ['w', 16], ['b', 'garrison'], ['b', 'uplink']],
    mix: { trooper: 3, scorcher: 1 }, attack: { value: 600, tick: 3600 }, expandAt: 9000,
    research: ['legion_infantry_weapons', 'legion_infantry_armor'],
    casters: { corpsman: { per: 6, max: 4 } }, spells: ['legion_smoke'] };
  PERS.legion.mech = { name: '기갑 확장',
    build: [['w', 10], ['b', 'depot'], ['w', 13], ['x', 1], ['b', 'garrison'], ['gas', 1], ['u', 'trooper', 3], ['w', 16], ['b', 'motorpool'],
      ['b', 'depot'], ['b', 'garage'], ['gas', 2], ['b', 'arsenal'], ['b', 'motorpool'], ['up', 'legion_vehicle_weapons']],
    mix: { hound: 1, bastion: 2, strider: 2 }, attack: { value: 2000, tick: 9000 }, expandAt: 12000,
    research: ['legion_vehicle_plating', 'legion_strider_range', 'legion_hound_speed'],
    spells: ['legion_hound_drones'] };
  PERS.legion.air = { name: '공중 함대',
    build: [['w', 10], ['b', 'depot'], ['b', 'garrison'], ['gas', 1], ['u', 'trooper', 4], ['w', 14], ['b', 'motorpool'], ['b', 'depot'],
      ['b', 'airfield'], ['gas', 2], ['b', 'tower'], ['b', 'arsenal'], ['b', 'airfield'], ['b', 'labs'], ['b', 'gravlab'], ['up', 'legion_ship_weapons'],
      // 부속은 본체당 하나 — 위장 공방(관측수·방전탄·망토)은 두 번째 해체 연구소에, 중계 안테나(정찰)·투하 크레인(고철 낙하)은 본진·확장 기지에.
      // (aispells 때 위장 공방과 용골 작업장을 연구소 하나에 몰아 빌드가 용골 작업장에서 영영 멈췄다 — 빌드 이후 확장·가스·연구가 안 돌아 네뷸라가 말랐다)
      ['b', 'drillhall'], ['b', 'labs'], ['b', 'intel'], ['x', 1], ['b', 'uplink'], ['b', 'silo']],
    mix: { phantom: 6, lancer: 2, dreadnought: 1, shade: 1 }, attack: { value: 1800, tick: 8000 }, expandAt: 10000,
    research: ['legion_ship_plating'],
    casters: { surveyor: { per: 6, max: 2 } }, spells: ['legion_tow', 'legion_repairdrones', 'legion_discharge', 'legion_optcloak'], raid: 1 }; // 빌드 순서와 같게(연구는 순서대로만)
  PERS.swarm.skitter = { name: '스키터 러시', rush: true,
    build: [['w', 9], ['b', 'vat'], ['w', 10], ['gas', 1], ['u', 'skitter', 6], ['up', 'swarm_skitter_speed'], ['b', 'mutapit'], ['x', 1], ['w', 14], ['b', 'nest']],
    mix: { skitter: 1 }, attack: { value: 450, tick: 3000 }, expandAt: 7000,
    research: ['swarm_melee', 'swarm_carapace'] };
  PERS.swarm.macro = { name: '확장 물량',
    build: [['w', 10], ['x', 1], ['w', 12], ['b', 'vat'], ['gas', 1], ['u', 'skitter', 4], ['w', 16], ['b', 'wyrmpit'], ['gas', 2], ['b', 'mutapit'],
      ['up', 'swarm_missile'], ['m', 'grandnest'], ['x', 2], ['b', 'matronden'], ['m', 'apexnest'], ['b', 'blightmound'], ['b', 'behemothcave']],
    mix: { spinewyrm: 4, behemoth: 1, skitter: 2 }, attack: { value: 2200, tick: 9000 }, expandAt: 12000,
    research: ['swarm_spinewyrm_range', 'swarm_carapace', 'swarm_melee'],
    casters: { matron: { per: 6, max: 3 }, blighter: { per: 8, max: 3 } }, spells: ['swarm_mat', 'swarm_rot'] };
  PERS.swarm.air = { name: '비행 물량',
    build: [['w', 10], ['b', 'vat'], ['gas', 1], ['u', 'skitter', 4], ['w', 13], ['m', 'grandnest'], ['x', 1], ['gas', 2], ['b', 'roost'], ['up', 'swarm_flyer_attacks']],
    mix: { wingsting: 1 }, attack: { value: 1600, tick: 7000 }, expandAt: 10000,
    research: ['swarm_flyer_carapace'], raid: 1 };
  PERS.elysian.oath = { name: '오스블레이드 압박', rush: true,
    build: [['w', 8], ['b', 'resonator'], ['w', 10], ['b', 'portal'], ['b', 'portal'], ['w', 12], ['b', 'resonator'], ['gas', 1],
      ['u', 'oathblade', 4], ['b', 'anvil'], ['up', 'elysian_ground_weapons'], ['b', 'synapse'], ['b', 'citadel'], ['b', 'sagelibrary'], ['up', 'elysian_oathblade_speed']],
    mix: { oathblade: 3, arcwalker: 1 }, attack: { value: 800, tick: 4000 }, expandAt: 9000,
    research: ['elysian_ground_armor', 'elysian_shields'],
    casters: { sage: { per: 5, max: 3 } }, spells: ['elysian_mindstorm'] };
  // 브리프 데이터 + ['b', 'anvil'] — research 의 지상 무기·갑옷 연구가 대장간(anvil)에서만 되므로(성향 데이터 테스트의 at 검사)
  PERS.elysian.ground = { name: '고급 지상',
    build: [['w', 9], ['b', 'resonator'], ['w', 12], ['x', 1], ['b', 'portal'], ['gas', 1], ['u', 'oathblade', 2], ['b', 'synapse'], ['gas', 2],
      ['b', 'constructbay'], ['b', 'assemblybay'], ['b', 'portal'], ['b', 'anvil'], ['b', 'lookout'], ['b', 'citadel'], ['b', 'sagelibrary'], ['up', 'elysian_arcwalker_range']],
    mix: { arcwalker: 3, oathblade: 2, crucible: 1 }, attack: { value: 2200, tick: 9000 }, expandAt: 12000,
    research: ['elysian_ground_weapons', 'elysian_ground_armor'],
    casters: { sage: { per: 6, max: 2 }, watcher: { per: 12, max: 1 } }, spells: ['elysian_mindstorm', 'elysian_echo'], raid: 1 }; // 수송 견제: 스키프는 결정 주조소에서(함대는 주조소를 안 지어 못 한다)
  PERS.elysian.fleet = { name: '함대',
    build: [['w', 9], ['b', 'resonator'], ['b', 'portal'], ['gas', 1], ['u', 'oathblade', 2], ['w', 13], ['b', 'synapse'], ['gas', 2],
      ['b', 'skygate'], ['b', 'fleetspire'], ['b', 'skygate'], ['b', 'citadel'], ['b', 'sagelibrary'], ['b', 'wardencourt'], ['up', 'elysian_air_weapons']],
    mix: { sentinel: 2, skimmer: 1, ark: 1 }, attack: { value: 2000, tick: 9000 }, expandAt: 11000,
    research: ['elysian_air_armor'],
    casters: { warden: { per: 8, max: 2 } }, spells: ['elysian_prism'] };
  const AA = { legion: 'trooper', swarm: 'spinewyrm', elysian: 'arcwalker' }; // 종족 대공 기본 유닛(상성 생산)
  const FILL = { legion: 'trooper', swarm: 'skitter', elysian: 'oathblade' }; // 수정 전용 기본 유닛(네뷸라가 막혀 수정이 쌓일 때)
  const DET = { legion: 'flak', swarm: 'puffer', elysian: 'wardspire' }; // 종족 탐지 건물(안 보이는 적에게 맞을 때)
  const SUPPLY = { legion: 'depot', swarm: 'bloater', elysian: 'resonator' }; // 보급: 스웜은 유닛(train), 나머지는 건물(build)
  const NEAR = 10 * TFP; // 기지 주변 = 10타일(sim nearbyCrystal 과 같은 반경)
  const GAS = {}; // 종족 → 분출구 건물(onVent)
  for (const b of Object.values(D.buildings)) if (b.race && b.onVent) GAS[b.race] = b.id;
  // 부속이 붙는 본체(hq, motorpool, airfield, labs): 오른쪽 2칸을 비워 둔다
  const ADDON_HOST = new Set(Object.values(D.buildings).filter(b => b.addonOf).map(b => b.addonOf));

  const seedFor = (seed, p) => (seed ^ Math.imul(p + 1, 0x9E3779B1)) | 0;
  const newMemory = () => ({ bld: new Map(), air: new Map(), ground: new Map() });
  const newBoard = () => ({ target: null, attackAt: -1, leader: -1, members: [], active: false }); // members: 이 보드를 쓰는 AI 플레이어 번호, active: 리더가 공격 중
  const rnd = (ai, n) => S.mulberry32(ai.r) % n;
  const d2 = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy; };

  // ---- ② 뷰·기억 ----
  function tileSeen(g, f, b) {
    for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) if (f[(b.ty + j) * g.map.w + b.tx + i] === 2) return true;
    return false;
  }
  function view(g, p, mem) {
    const v = { tick: g.tick, p, me: g.players[p], own: [], allies: [], foes: [], res: [], known: mem.bld };
    const seen = new Set();
    for (const e of g.ents) {
      if (e.owner < 0) { v.res.push(e); continue; }
      if (e.owner === p) { v.own.push(e); continue; }
      if (!S.isEnemy(g, p, e.owner)) { v.allies.push(e); continue; }
      if (!S.visible(g, p, e)) continue;
      v.foes.push(e);
      if (e.isB) { seen.add(e.id); mem.bld.set(e.id, { id: e.id, type: e.type, owner: e.owner, tx: e.tx, ty: e.ty, w: e.def.w, h: e.def.h, x: e.x, y: e.y, seen: g.tick, done: !(e.buildLeft > 0) }); }
      else if (!e.def.worker && !e.parent && fighterDef(e.def)) (e.def.air ? mem.air : mem.ground).set(e.id, g.tick); // 전투 유닛만(블로터·일꾼·함재기 제외 — 상성 판단용)
    }
    for (const [id, b] of mem.bld) if (!seen.has(id) && tileSeen(g, g.fog[p], b)) mem.bld.delete(id); // 그 자리가 보이는데 없다 = 파괴·이동
    for (const m of [mem.air, mem.ground]) for (const [id, t] of m) if (t < g.tick - 3000) m.delete(id);
    return v;
  }

  // ---- ③ 공용 도우미 ----
  // 변태 계보(sim reaches 와 같은 규칙): type 이 id 이거나 morphFrom 을 따라 id 에 닿는가
  function lineage(type, id) {
    for (let t = type; t; t = D.buildings[t] && D.buildings[t].morphFrom) if (t === id) return true;
    return false;
  }
  const costOf = what => (D.units[what] || D.buildings[what]).cost;
  const supply2Of = what => { const u = D.units[what]; return u ? Math.round((u.supply || 0) * 2) * (u.count || 1) : 0; };
  // 예산 = 현재 자원 − 아직 착공 전인 자기 일꾼 build 명령 비용. n: 이번 판단에 건물마다 낸 train 수,
  // rects: 착공 전 건설 자리(명령 중 + 이번 판단) [tx, ty, w, h] — 겹치거나 붙여 짓지 않게
  function bankOf(g, v) {
    const me = v.me, bank = { crystal: me.crystal, nebula: me.nebula, supply2Free: me.supplyMax2 - me.supplyUsed2, n: new Map(), rects: [] };
    for (const e of v.own) {
      if (e.isB || !e.order || e.order.type !== 'build') continue;
      const d = D.buildings[e.order.what];
      spend(bank, d.cost); bank.rects.push([e.order.tx, e.order.ty, d.w, d.h]);
    }
    return bank;
  }
  function spend(bank, cost, supply2 = 0) { bank.crystal -= cost.crystal || 0; bank.nebula -= cost.nebula || 0; bank.supply2Free -= supply2; }
  const afford = (bank, cost, supply2 = 0) => bank.crystal >= (cost.crystal || 0) && bank.nebula >= (cost.nebula || 0) && bank.supply2Free >= supply2;
  // canTrain 에 넘길 같은 틱 지출분(예산에서 역산 — 착공 전 건설비도 들어가 더 엄격)
  const pendOf = (v, bank, b) => ({ crystal: v.me.crystal - bank.crystal, nebula: v.me.nebula - bank.nebula,
    supply2: (v.me.supplyMax2 - v.me.supplyUsed2) - bank.supply2Free, n: bank.n.get(b.id) || 0 });
  // 건물 수 = 완성+건설 중(계보 포함) + 그 건물로 build 명령 중인 일꾼 + 그 건물로 변태 중
  function count(v, id) {
    let n = 0;
    for (const e of v.own) {
      if (e.isB) { if (lineage(e.type, id) || (e.morph && e.morph.to === id)) n++; }
      else if (e.order && e.order.type === 'build' && e.order.what === id) n++;
    }
    return n;
  }
  // 유닛 수 = 자기 유닛 + 생산 큐(한 번에 여럿 나오는 유닛은 그 수만큼)
  function unitCount(v, id) {
    let n = 0;
    const per = (D.units[id] && D.units[id].count) || 1;
    for (const e of v.own) {
      if (!e.isB) { if (e.type === id) n++; continue; }
      for (const q of e.queue) if (q.what === id) n += per;
    }
    return n;
  }
  // 진행 중인 보급 수: 건설 중·착공 전 건설 명령(건물), 생산 큐(스웜 블로터)
  function supplyPending(v, what) {
    let n = 0;
    for (const e of v.own) {
      if (e.isB) { if (e.type === what && e.buildLeft > 0) n++; for (const q of e.queue) if (q.what === what) n++; }
      else if (e.order && e.order.type === 'build' && e.order.what === what) n++;
    }
    return n;
  }
  const supplyBusy = (v, what) => supplyPending(v, what) > 0;
  const basesOf = v => v.own.filter(b => b.isB && b.def.dropoff && !(b.buildLeft > 0) && !b.lifted);

  // 채굴 상자: 기지마다 10타일 안 수정·분출구 각각에 대해 (기지 ∪ 자원) 외접 사각형을 1칸 넓힌 것 [x0, y0, x1, y1](포함).
  // 자원마다 따로(일꾼 왕복 통로) — 하나로 묶으면 옆 확장 자원까지 끌어들여 기지 주변 전체를 막는다.
  function miningBoxes(v) {
    const out = [];
    for (const b of basesOf(v)) {
      const bx1 = b.tx + b.def.w - 1, by1 = b.ty + b.def.h - 1;
      out.push([b.tx - 1, b.ty - 1, bx1 + 1, by1 + 1]);
      for (const r of v.res) {
        if (d2(b, r) > NEAR * NEAR) continue;
        out.push([Math.min(b.tx, r.tx) - 1, Math.min(b.ty, r.ty) - 1, Math.max(bx1, r.tx + r.def.w - 1) + 1, Math.max(by1, r.ty + r.def.h - 1) + 1]);
      }
    }
    return out;
  }
  // 건물 자리: 본진(첫 dropoff 건물) 중심 기준 반경 3→16 정사각 링, 링 안은 위→아래·왼→오른쪽.
  // 조건: canPlace 가 자원 부족 외엔 통과, 풋프린트 둘레 1칸이 전부 걷기 가능(길막이 방지), 채굴 상자와 겹치지 않음,
  // 착공 전 자리(bank.rects)와 1칸 이상 떨어짐, 부속 본체면 부속 자리(오른쪽 2×2)도 걷기 가능.
  // 실패하면 ai.st.spotFail[what] = tick(200틱 재탐색 안 함). 엘리시안 레이 라인 밖 후보만 있었으면 ai.st.spotWhy = 'power'(100틱만 쉼).
  // 엘리시안: 레이 라인 판정은 호출당 S.powerNet 1회로 만든 net으로 먼저 거른다(후보마다 다시 만들지 않음).
  // 조율 기둥은 가장 가까운 자기 기둥(건설 중 포함)에서 10~14타일인 자리를 본진 중심에 가까운 순으로 우선(선이 이어지게).
  function findSpot(ai, g, v, what, bank) {
    const home = v.own.find(b => b.isB && b.def.dropoff);
    ai.st.spotWhy = '';
    if (!home || g.tick - (ai.st.spotFail[what] ?? -1e9) < 200) return null;
    const def = D.buildings[what], w = def.w, h = def.h, boxes = miningBoxes(v), rects = bank ? bank.rects.slice() : [];
    // 이미 있는 부속 본체(시작 기지 포함)의 오른쪽 부속 자리(2×2)도 비워 둔다 — 시작 본진 옆에 보급고가 서서 부속을 영영 못 붙이던 것
    for (const b of v.own) if (b.isB && ADDON_HOST.has(b.type)) rects.push([b.tx + b.def.w, b.ty + b.def.h - 2, 2, 2]);
    const ew = ADDON_HOST.has(what) ? w + 2 : w; // 부속 자리까지 포함한 폭
    const cx = home.tx + (home.def.w >> 1), cy = home.ty + (home.def.h >> 1);
    // 탐색은 자리 방향 기준(정규 좌표)으로 하고 실제 좌표로 뒤집는다 — 동률 순서가 자리마다 같은 모양(시작 위치 공정성)
    const fl = flipOf(ai, g), X2 = 2 * home.tx + home.def.w, Y2 = 2 * home.ty + home.def.h;
    const real = (tx, ty) => [fl & 1 ? X2 - tx - ew : tx, fl & 2 ? Y2 - ty - h : ty];
    let power = false;
    const ely = ai.race === 'elysian', net = ely ? S.powerNet(g, ai.p) : null;
    const ok = (tx, ty) => {
      if (ely && !S.inNet(net, what, tx, ty)) { power = true; return false; }
      const r = S.canPlace(g, ai.p, what, tx, ty);
      if (r === 'power') power = true;
      if (r !== '' && r !== 'crystal' && r !== 'nebula') return false;
      for (let j = -1; j <= h; j++) for (let i = -1; i <= ew; i++) {
        if (j >= 0 && j < h && i >= 0 && i < w) continue;
        if (!S.walkable(g, tx + i, ty + j)) return false;
      }
      for (const [x0, y0, x1, y1] of boxes) if (tx <= x1 && tx + ew - 1 >= x0 && ty <= y1 && ty + h - 1 >= y0) return false;
      for (const [rx, ry, rw, rh] of rects) if (tx - 1 <= rx + rw - 1 && tx + ew >= rx && ty - 1 <= ry + rh - 1 && ty + h >= ry) return false;
      return true;
    };
    if (ely && what === 'resonator') { // 기둥 사이 10~14타일(반타일 좌표 20~28, 정수 제곱 비교)
      const P = net.pylons.map(q => [q.x2, q.y2]);
      for (const b of v.own) if (b.isB && b.def.power && b.buildLeft > 0) P.push([2 * b.tx + b.def.w, 2 * b.ty + b.def.h]);
      const hx = 2 * home.tx + home.def.w, hy = 2 * home.ty + home.def.h, cands = [];
      for (let cty = cy - 20; cty <= cy + 20; cty++)
        for (let ctx = cx - 20; ctx <= cx + 20; ctx++) {
          const [tx, ty] = real(ctx, cty), x2 = 2 * tx + w, y2 = 2 * ty + h;
          let near = Infinity;
          for (const [px, py] of P) near = Math.min(near, (x2 - px) ** 2 + (y2 - py) ** 2);
          if (near >= 400 && near <= 784) cands.push([(x2 - hx) ** 2 + (y2 - hy) ** 2, cands.length, tx, ty]);
        }
      cands.sort((a, b) => a[0] - b[0] || a[1] - b[1]); // 동률: 위→아래·왼→오른쪽(스캔 순서)
      for (const [, , tx, ty] of cands) if (ok(tx, ty)) return [tx, ty];
    }
    // 엘리시안은 22까지 — 조율 기둥이 본진 ±20 안에 서는데 링이 16에서 끝나 바깥 기둥의 레이 라인을 못 써서
    // 배치 실패 → 기둥 추가만 되풀이했다(수정 수천·기둥 19개). 3×3 건물은 기둥 반경(3) 안에 못 들어가 선 위에만 선다.
    for (let r = 3, rMax = ely ? 22 : 16; r <= rMax; r++)
      for (let y = cy - r; y <= cy + r; y++)
        for (let x = cx - r; x <= cx + r; x++) {
          if (Math.abs(x - cx) !== r && Math.abs(y - cy) !== r) continue;
          const [tx, ty] = real(x - (w >> 1), y - (h >> 1));
          if (ok(tx, ty)) return [tx, ty];
        }
    if (power) { ai.st.spotWhy = 'power'; ai.st.spotFail[what] = g.tick - 100; } // 레이 라인 밖: 기둥을 짓는 동안 100틱만 쉰다
    else ai.st.spotFail[what] = g.tick;
    return null;
  }
  // 건설 일꾼: 정찰 아님, 놀거나 채집 중. 수정 채집 중·빈손 우선, 그다음 자리에서 가까운 순(거리², id 순)
  function builderFor(ai, v, tx, ty, taken) {
    const at = { x: tx * TFP, y: ty * TFP };
    let best = null, bk = Infinity;
    for (const w of v.own) {
      if (w.isB || !w.def.worker || w.id === ai.st.scout || taken.has(w.id)) continue;
      if (w.order && w.order.type !== 'gather') continue;
      const tier = w.order && w.order.kind === 0 && !(w.carry > 0) ? 0 : 1;
      const k = tier * 1e15 + d2(w, at);
      if (k < bk) { bk = k; best = w; }
    }
    return best;
  }
  // 빈 분출구: 자기 기지(본진→확장 순) 12타일 안, 아직 아무것도 안 지었고 착공 전 명령도 없는 것
  function findGasSpot(ai, g, v, bank) {
    const what = GAS[ai.race];
    for (const b of basesOf(v))
      for (const r of v.res) {
        if (r.type !== 'vent' || d2(b, r) > 144 * TFP * TFP || g.map.occ[r.ty * g.map.w + r.tx] !== r.id) continue;
        if (bank.rects.some(([x, y]) => x === r.tx && y === r.ty)) continue;
        const why = S.canPlace(g, ai.p, what, r.tx, r.ty);
        if (why === '' || why === 'crystal' || why === 'nebula') return [r.tx, r.ty];
      }
    return null;
  }
  // 확장 자리: 맵 시작 후보(기지 = starts[i]) + 확장(기준점 flip 변환) 중 자기·팀원 기지·착공 전 자리가 없고
  // 기억·보이는 적 건물이 10타일 안에 없는 곳을 본진에서 가까운 순으로, 각 후보 주변 반경 4 나선에서 놓을 수 있는 첫 타일.
  function expansionSpot(ai, g, v, bank) {
    const md = D.maps[g.map.id], W = g.map.w, H = g.map.h, what = D.races[ai.race].base, bw = D.buildings[what].w, bh = D.buildings[what].h;
    const home = v.own.find(b => b.isB && b.def.dropoff);
    if (!home) return null;
    const cands = [...md.starts.map(s => [s.tx, s.ty]),
      ...md.expansions.map(e => { const f = e.flip ?? (e.mirror ? 3 : 0); return [f & 1 ? W - e.tx - bw : e.tx, f & 2 ? H - e.ty - bh : e.ty]; })];
    const near = (x, y, tx, ty, r) => Math.abs(x - tx) <= r && Math.abs(y - ty) <= r;
    const foeB = [...v.known.values()];
    for (const f of v.foes) if (f.isB) foeB.push(f);
    // 순서: ① 내 자리 쪽(다른 시작 자리 어디보다 내 본진에 더 가까운) 자리 먼저 ② 가까운 순 ③ 동률은 자리 방향 기준(위→왼쪽).
    // 가운데처럼 여러 시작 자리에서 거리가 같은 자리를 양쪽이 동시에 노리면, 본진 4×3 의 반칸 비대칭 때문에 늘 같은 줄(위쪽)이
    // 경주에서 이겨 시작 위치 편향이 생겼다. 다툼 자리는 자기 쪽을 다 쓴 뒤로 미룬다.
    const fl = flipOf(ai, g), me = md.starts[g.players[ai.p].slot], dd = (c, s) => (c[0] - s.tx) ** 2 + (c[1] - s.ty) ** 2;
    const shared = c => md.starts.some(s => s !== me && (s.tx !== c[0] || s.ty !== c[1]) && dd(c, s) <= dd(c, home));
    const order = cands.map(c => [c, shared(c) ? 1 : 0, (c[0] - home.tx) ** 2 + (c[1] - home.ty) ** 2, fl & 2 ? H - c[1] : c[1], fl & 1 ? W - c[0] : c[0]])
      .sort((a, b) => a[1] - b[1] || a[2] - b[2] || a[3] - b[3] || a[4] - b[4]);
    for (const [[cx, cy]] of order) {
      if (v.own.some(b => b.isB && b.def.dropoff && near(b.tx, b.ty, cx, cy, 8)) || v.allies.some(b => b.isB && b.def.dropoff && near(b.tx, b.ty, cx, cy, 8))) continue;
      if (bank && bank.rects.some(([x, y]) => near(x, y, cx, cy, 8))) continue;
      if (foeB.some(b => near(b.tx, b.ty, cx, cy, 10))) continue;
      for (let r = 0; r <= 4; r++)
        for (let dy = -r; dy <= r; dy++)
          for (let dx = -r; dx <= r; dx++) {
            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
            const x = cx + (fl & 1 ? -dx : dx), y = cy + (fl & 2 ? -dy : dy); // 나선도 자리 방향 기준
            const why = S.canPlace(g, ai.p, what, x, y);
            if (why === '' || why === 'crystal' || why === 'nebula') return [x, y];
          }
    }
    return null;
  }

  // 일꾼 목표: 수정 1개당 wpc/2명 + 가스 건물당 gas명, 최대 70
  const workerTarget = (L, crystals, gasBuildings) => Math.min(70, Math.floor(crystals * L.wpc / 2) + gasBuildings * L.gas);

  // ---- ④ 관리자 ----
  // 경제: 놀고 있는 일꾼 채집, 가스 채우기, 보급(막히기 전), 일꾼 생산. wMin: 빌드 'w' 단계 일꾼 수(목표 하한)
  function economy(ai, g, v, bank, out, taken = new Set(), wMin = 0) {
    const p = ai.p, L = ai.L, wk = D.races[ai.race].worker, bases = basesOf(v);
    const workers = v.own.filter(e => !e.isB && e.def.worker);
    const crystals = v.res.filter(c => c.type === 'crystal' && c.amount > 0);
    const gasB = v.own.filter(b => b.isB && b.def.onVent && !(b.buildLeft > 0));
    const on = new Map(); // on: 자원 id → 붙은 일꾼 수, taken: 이번 판단에 명령 받은 일꾼
    for (const w of workers) if (w.order && w.order.type === 'gather') on.set(w.order.res, (on.get(w.order.res) || 0) + 1);
    const gather = (w, t) => { out.push({ type: 'gather', ids: [w.id], target: t.id, player: p }); taken.add(w.id); on.set(t.id, (on.get(t.id) || 0) + 1); };

    // 1. 놀고 있는 일꾼 → 수정이 남은 기지 중 가장 가까운 곳의 10타일 안, 붙은 일꾼이 가장 적은 수정(동률 id 작은 것)
    const live = bases.filter(b => crystals.some(c => d2(b, c) <= NEAR * NEAR)); // 다 캔 기지의 일꾼은 다른 기지로
    for (const w of workers) {
      if (w.order || w.id === ai.st.scout) continue;
      let base = null, bd = Infinity;
      for (const b of live) { const d = d2(b, w); if (d < bd) { bd = d; base = b; } }
      if (!base) break;
      let best = null, bn = Infinity;
      for (const c of crystals) {
        if (d2(base, c) > NEAR * NEAR) continue;
        const n = on.get(c.id) || 0;
        if (n < bn) { bn = n; best = c; }
      }
      if (best) gather(w, best);
    }

    // 2. 가스 건물마다 L.gas 명까지 — 수정 채집 일꾼 중 가까운 순
    for (const b of gasB) {
      while ((on.get(b.id) || 0) < L.gas) {
        let best = null, bd = Infinity;
        for (const w of workers) {
          if (taken.has(w.id) || !w.order || w.order.type !== 'gather' || w.order.kind !== 0) continue;
          const d = d2(b, w);
          if (d < bd) { bd = d; best = w; }
        }
        if (!best) break;
        on.set(best.order.res, on.get(best.order.res) - 1);
        gather(best, b);
      }
    }

    // 3. 보급(일꾼보다 먼저 — 모자라면 비용을 예약해 일꾼 생산이 먹지 않게)
    // 생산 건물 수: 일꾼 외 유닛을 뽑는 건물(짓는 중 포함 — 보급이 완성보다 늦지 않게). 유충 기지(스웜)도 생산 건물이다.
    const me = v.me, prodN = v.own.filter(b => b.isB && b.def.trains && (!b.def.dropoff || b.def.larva)).length;
    const free2 = me.supplyMax2 - me.supplyUsed2, need2 = 2 * (4 + 3 * prodN), sw = SUPPLY[ai.race];
    const prov2 = 2 * (D.units[sw] || D.buildings[sw]).provides; // 진행 중인 보급까지 셈해 모자라면 하나 더(생산 건물이 많을 때 겹쳐 짓기)
    if (me.supplyMax2 < 400 && free2 + supplyPending(v, sw) * prov2 < need2) {
      const cost = costOf(sw);
      let short = false;
      if (D.units[sw]) { // 스웜 블로터: 기지 유충으로
        short = !afford(bank, cost);
        for (const b of bases) {
          if (short || S.canTrain(g, p, b, sw, pendOf(v, bank, b)) !== '') continue;
          out.push({ type: 'train', ids: [b.id], what: sw, player: p });
          spend(bank, cost); bank.n.set(b.id, (bank.n.get(b.id) || 0) + 1);
          break;
        }
      } else if (!afford(bank, cost)) short = true;
      else {
        const spot = findSpot(ai, g, v, sw, bank), w = spot && builderFor(ai, v, spot[0], spot[1], taken);
        if (w) {
          out.push({ type: 'build', ids: [w.id], what: sw, tx: spot[0], ty: spot[1], player: p });
          spend(bank, cost); taken.add(w.id); bank.rects.push([spot[0], spot[1], D.buildings[sw].w, D.buildings[sw].h]);
        }
      }
      if (short) spend(bank, cost);
    }

    // 4. 일꾼 생산: 목표 미만이면 기지마다(레기온·엘리시안은 큐가 빌 때 1기, 스웜은 유충 전부)
    let crysN = 0;
    for (const c of crystals) if (bases.some(b => d2(b, c) <= NEAR * NEAR)) crysN++;
    const target = Math.max(workerTarget(L, crysN, gasB.length), wMin), cost = costOf(wk), s2 = supply2Of(wk);
    let have = unitCount(v, wk);
    // 유충 나누기(스웜): 'w' 단계가 아니고 일꾼이 목표 절반 이상이며 조합 유닛을 뽑을 기술이 있으면, 일꾼은 병력과 유충을 번갈아 쓴다
    // (병력 유충마다 st.larva +1(최대 2), 일꾼 유충마다 −1, 0 이면 일꾼 안 함). 유충이 가득(3) 찬 기지는 예외 — 병력을 못 뽑는 동안 일꾼이 굶지 않게.
    const split = !wMin && have * 2 >= target && Object.keys(mixFor(ai)).some(u => (D.units[u].requires || []).every(r => S.hasTech(g, p, r)));
    for (const b of bases) {
      if (!(b.def.trains || []).includes(wk)) continue;
      while (have < target) {
        const n = bank.n.get(b.id) || 0;
        if (!b.def.larva && (b.queue.length || n)) break;
        if (b.def.larva && split && ai.st.larva <= 0 && b.larva - n < 3) break;
        if (S.canTrain(g, p, b, wk, pendOf(v, bank, b)) !== '') break;
        out.push({ type: 'train', ids: [b.id], what: wk, player: p });
        spend(bank, cost, s2); bank.n.set(b.id, n + 1); have++;
        if (b.def.larva) ai.st.larva = Math.max(0, ai.st.larva - 1);
      }
    }
  }

  // 빌드 단계 충족 여부. 'b'·'m' 은 같은 단계가 앞에서 몇 번 나왔는지가 목표 개수(종족 기지는 시작 기지 + 앞선 확장 수만큼 더).
  function stepNeed(ai, st) {
    let n = 0, x = 0;
    for (const s of ai.P.build) {
      if (s[0] === st[0] && s[1] === st[1]) n++;
      if (s[0] === 'x') x = Math.max(x, s[1]);
      if (s === st) break;
    }
    if (st[0] === 'b' && st[1] === D.races[ai.race].base) n += 1 + x;
    return Math.max(n, 1);
  }
  function stepDone(ai, g, v, st) {
    const [k, what] = st;
    if (k === 'w') return unitCount(v, D.races[ai.race].worker) >= what;
    if (k === 'b' || k === 'm') return count(v, what) >= stepNeed(ai, st);
    if (k === 'gas') return count(v, GAS[ai.race]) >= Math.min(what, ventsOf(g, v)); // 분출구가 모자라면(확장 전) 있는 만큼만
    if (k === 'x') return siteBases(ai, g, v) >= 1 + what;
    if (k === 'u') return unitCount(v, what) >= st[2];
    if (k === 'up') return (v.me.up[what] || 0) >= 1 || v.own.some(b => b.isB && b.queue.some(q => q.research === what));
    return true;
  }
  // 자기 완성 기지 12타일 안의 분출구 수(가스 건물이 지어진 것 포함)
  const ventsOf = (g, v) => v.res.filter(r => r.type === 'vent' && basesOf(v).some(b => d2(b, r) <= 144 * TFP * TFP)).length;
  // 기지가 있는 맵 사이트 수(건설 중·착공 전 명령 포함) — 본진 옆에 더 지은 스웜 둥지(유충용)는 확장으로 세지 않는다
  function siteBases(ai, g, v) {
    const base = D.races[ai.race].base, at = [];
    for (const e of v.own) {
      if (e.isB) { if (lineage(e.type, base) || (e.morph && e.morph.to === base)) at.push([e.tx, e.ty]); }
      else if (e.order && e.order.type === 'build' && e.order.what === base) at.push([e.order.tx, e.order.ty]);
    }
    let n = 0;
    for (const s of sitesOf(ai, g)) if (at.some(([x, y]) => Math.abs(x - s.tx) <= 6 && Math.abs(y - s.ty) <= 6)) n++;
    return n;
  }
  const curStep = (ai, g, v) => ai.P ? ai.P.build.find(st => !ai.st.skipStep.has(st) && !stepDone(ai, g, v, st)) || null : null;

  // 일꾼에게 자리 build 명령. 반환: 'ok' | 'short'(자원 부족 — 저축) | 'fail'(자리·일꾼 없음)
  function buildWith(ai, v, bank, out, taken, what, spot) {
    const w = spot && builderFor(ai, v, spot[0], spot[1], taken), d = D.buildings[what];
    if (!w) return 'fail';
    out.push({ type: 'build', ids: [w.id], what, tx: spot[0], ty: spot[1], player: ai.p });
    spend(bank, d.cost); taken.add(w.id); bank.rects.push([spot[0], spot[1], d.w, d.h]);
    return 'ok';
  }
  function buildOne(ai, g, v, bank, out, taken, what) {
    const def = D.buildings[what];
    if (!afford(bank, def.cost)) return 'short';
    if (def.addonOf) { // 레기온 부속: 본체가 직접
      const host = v.own.find(b => b.isB && S.canAddon(g, ai.p, b, what) === '');
      if (!host) return 'fail';
      out.push({ type: 'build', ids: [host.id], what, player: ai.p }); spend(bank, def.cost);
      return 'ok';
    }
    const spot = findSpot(ai, g, v, what, bank);
    if (!spot && ai.st.spotWhy === 'power' && !supplyBusy(v, 'resonator')) return buildOne(ai, g, v, bank, out, taken, 'resonator');
    return buildWith(ai, v, bank, out, taken, what, spot);
  }
  function expandOne(ai, g, v, bank, out, taken) {
    const what = D.races[ai.race].base;
    if (!afford(bank, costOf(what))) return 'short';
    return buildWith(ai, v, bank, out, taken, what, expansionSpot(ai, g, v, bank));
  }
  // 한 기 생산: 그 유닛을 뽑는 완성 건물 중 큐가 빈 것(유충 건물은 유충이 있으면)
  function trainOne(ai, g, v, bank, out, what) {
    const s2 = supply2Of(what), cost = costOf(what);
    for (const b of v.own) {
      if (!b.isB || !(b.def.trains || []).includes(what)) continue;
      const n = bank.n.get(b.id) || 0;
      if (!b.def.larva && (b.queue.length || n)) continue;
      if (S.canTrain(g, ai.p, b, what, pendOf(v, bank, b)) !== '') continue;
      out.push({ type: 'train', ids: [b.id], what, player: ai.p });
      spend(bank, cost, s2); bank.n.set(b.id, n + 1);
      if (b.def.larva) ai.st.larva = Math.min(2, ai.st.larva + 1);
      return true;
    }
    return false;
  }
  function researchOne(ai, g, v, bank, out, id) {
    const u = D.upgrades[id], cost = u.cost[v.me.up[id] || 0];
    if (!cost) return 'fail';
    for (const b of v.own) {
      if (!b.isB) continue;
      const why = S.canResearch(g, ai.p, b, id);
      if (why === 'crystal' || why === 'nebula') return 'short';
      if (why !== '') continue;
      if (!afford(bank, cost)) return 'short';
      out.push({ type: 'research', ids: [b.id], what: id, player: ai.p }); spend(bank, cost);
      return 'ok';
    }
    return 'fail';
  }
  // 시전 유닛: 병력(조합 유닛 수) per 기당 1기, 최대 max — 최대는 난이도 casters %로 조정(쉬움 50 = 절반, 어려움 150 = ×1.5 — 병력이 커진 뒤에만 늘어 초반 빌드는 같다).
  // 목표 미만이면 한 기 생산
  function casterOne(ai, g, v, bank, out, mix) {
    const cs = ai.P.casters, pct = ai.L.casters;
    if (!cs) return;
    let army = 0;
    for (const u of Object.keys(mix)) army += unitCount(v, u);
    for (const [u, c] of Object.entries(cs)) {
      const max = Math.floor(c.max * pct / 100);
      if (unitCount(v, u) >= Math.min(max, Math.floor(army / c.per))) continue;
      if (afford(bank, costOf(u))) { trainOne(ai, g, v, bank, out, u); continue; }
      // 돈이 모자라면 조합 유닛이 가져가지 못하게 떼어 둔다(네뷸라가 계속 비어 못 뽑는다) — 다 지어진 생산 건물이 있고 요구 기술이 갖춰져 돈만 모자랄 때만
      const why = b => S.canTrain(g, ai.p, b, u, pendOf(v, bank, b));
      if (v.own.some(b => b.isB && (b.def.trains || []).includes(u) && (why(b) === 'crystal' || why(b) === 'nebula'))) spend(bank, costOf(u));
    }
  }
  // 탐지 건물 하나(본진 옆): 요구 건물이 없으면 그것부터, 스웜 산성 낭은 촉수 기둥을 지어 변태
  function detectorOne(ai, g, v, bank, out, taken) {
    const what = DET[ai.race], def = D.buildings[what];
    if (ai.race === 'legion' && count(v, 'drillhall') && !count(v, 'uplink')) buildOne(ai, g, v, bank, out, taken, 'uplink');
    if (count(v, what) || supplyBusy(v, def.morphFrom || what)) return;
    const miss = r => count(v, r) ? null : (D.buildings[r].requires || []).map(miss).find(Boolean) || r;
    const need = (def.requires || []).map(miss).find(Boolean);
    if (need) { if (!(D.buildings[need].requires || []).some(q => !S.hasTech(g, ai.p, q))) buildOne(ai, g, v, bank, out, taken, need); return; }
    if (!def.morphFrom) { buildOne(ai, g, v, bank, out, taken, what); return; }
    const b = v.own.find(e => e.isB && S.canMorph(g, ai.p, e, what) === '');
    if (!b) { if (!v.own.some(e => e.isB && e.type === def.morphFrom)) buildOne(ai, g, v, bank, out, taken, def.morphFrom); return; }
    if (afford(bank, def.cost)) { out.push({ type: 'morph', ids: [b.id], what, player: ai.p }); spend(bank, def.cost); }
  }
  // 단계 하나 실행. 반환 'ok' | 'short'(자원 부족 — 저축) | 'fail'(기술·자리·일꾼 없음 — 다음 판단에 다시)
  function runStep(ai, g, v, bank, out, taken, st) {
    const [k, what] = st;
    if (k === 'b') return buildOne(ai, g, v, bank, out, taken, what);
    if (k === 'm') {
      const def = D.buildings[what];
      if (!afford(bank, def.cost)) return 'short';
      const b = v.own.find(e => e.isB && S.canMorph(g, ai.p, e, what) === '');
      if (!b) return 'fail';
      out.push({ type: 'morph', ids: [b.id], what, player: ai.p }); spend(bank, def.cost);
      return 'ok';
    }
    if (k === 'gas') {
      if (!afford(bank, costOf(GAS[ai.race]))) return 'short';
      return buildWith(ai, v, bank, out, taken, GAS[ai.race], findGasSpot(ai, g, v, bank));
    }
    if (k === 'x') return expandOne(ai, g, v, bank, out, taken);
    if (k === 'u') return trainOne(ai, g, v, bank, out, what) ? 'ok' : 'fail';
    if (k === 'up') return researchOne(ai, g, v, bank, out, what);
    return 'fail';
  }
  const stepCost = (ai, v, st) => st[0] === 'gas' ? costOf(GAS[ai.race]) : st[0] === 'x' ? costOf(D.races[ai.race].base)
    : st[0] === 'up' ? D.upgrades[st[1]].cost[v.me.up[st[1]] || 0] || {} : st[0] === 'b' || st[0] === 'm' ? costOf(st[1]) : null;

  // 생산·건설: 빌드 단계(정확도 L.acc 확률로 진행, 자원 모자라면 저축) → 조합 비율 생산 →
  // (빌드 이후) 생산 건물 추가·연구·주기적 확장
  function production(ai, g, v, bank, out, taken, st) {
    const P = ai.P, L = ai.L;
    if (!P) return;
    let save = null;
    const saving = (cost, r) => { if (r === 'short') save = cost; };
    if (st) {
      if (rnd(ai, 100) < L.acc) {
        const r = runStep(ai, g, v, bank, out, taken, st);
        saving(stepCost(ai, v, st), r);
        // 확장 단계가 자리 없음으로 계속 실패하면(연속 K.X_GIVEUP 틱) 건너뛴다 — 빌드가 영영 멈추지 않게
        if (st[0] === 'x' && r === 'fail') {
          if (!ai.st.xFail || ai.st.xFail.st !== st) ai.st.xFail = { st, since: g.tick };
          else if (g.tick - ai.st.xFail.since >= K.X_GIVEUP) { ai.st.skipStep.add(st); ai.st.xFail = null; }
        } else if (st[0] === 'x') ai.st.xFail = null;
      }
      else if (stepCost(ai, v, st) && !afford(bank, stepCost(ai, v, st))) save = stepCost(ai, v, st);
    } else if (g.tick >= P.expandAt + (L.expandLate || 0)) { // 빌드 이후: expandAt 부터 6000틱마다 확장 하나 더
      let x = 0;
      for (const s of P.build) if (s[0] === 'x') x = Math.max(x, s[1]);
      const want = 1 + x + 1 + Math.floor((g.tick - P.expandAt - (L.expandLate || 0)) / 6000);
      if (siteBases(ai, g, v) < want) saving(costOf(D.races[ai.race].base), expandOne(ai, g, v, bank, out, taken));
    }
    // 빌드의 가스 단계가 분출구 부족으로 미뤄졌으면(확장 없이 가스 2개) 확장을 당겨 온다(진행 중인 확장이 없을 때)
    if (!save && P.build.some(s => s[0] === 'gas' && s[1] > ventsOf(g, v)) && siteBases(ai, g, v) <= basesOf(v).length && bank.crystal >= 400 * ECO)
      saving(costOf(D.races[ai.race].base), expandOne(ai, g, v, bank, out, taken));
    // 어려움(L.macro): 네뷸라가 막혔는데 수정이 쌓이면 빌드 중에도 빈 분출구에 가스, 빈 분출구가 없으면 확장(진행 중인 확장이 없을 때).
    // 맵마다 분출구는 사이트당 1개라 가스를 더 캐려면 확장밖에 없다 — 전에는 빌드가 끝나야 했고 6000틱마다 하나라 네뷸라 30~100에 수정이 수천씩 쌓였다
    if (L.macro && !save && v.me.nebula < 200 * ECO && bank.crystal > 500 * ECO && !supplyBusy(v, GAS[ai.race])) {
      const spot = findGasSpot(ai, g, v, bank), base = D.races[ai.race].base;
      if (spot) buildWith(ai, v, bank, out, taken, GAS[ai.race], spot);
      else if (bank.crystal > 700 * ECO && !supplyBusy(v, base)) expandOne(ai, g, v, bank, out, taken);
    }
    // 기지 주변 수정이 거의 다 떨어졌으면(덩이 4개 이하) 진행 중인 확장이 없을 때 확장부터(저축)
    if (!st && !save && v.res.filter(c => c.type === 'crystal' && c.amount > 0 && basesOf(v).some(b => d2(b, c) <= NEAR * NEAR)).length <= K.DRY
      && siteBases(ai, g, v) <= basesOf(v).length)
      saving(costOf(D.races[ai.race].base), expandOne(ai, g, v, bank, out, taken));
    // 안 보이는 적에게 맞았으면(은폐·잠복, 최근 6000틱) 탐지 건물(저축보다 먼저)
    if (g.tick - ai.st.unseenAt < K.DETECT_FOR) detectorOne(ai, g, v, bank, out, taken);
    if (save) { // 저축: 단계 비용을 떼어 두고, 그러고도 수정 150 이상 남을 때만 생산
      const rich = bank.crystal - (save.crystal || 0) >= 150 * ECO;
      spend(bank, save);
      if (!rich) return;
    }

    // 마법 연구: 순서대로, 연구 건물이 다 지어졌으면 유닛 생산보다 먼저(돈이 모자라면 비용을 떼어 저축 — 안 그러면 생산이 네뷸라를 계속 비워 못 시작한다)
    for (const id of P.spells || []) {
      if (stepDone(ai, g, v, ['up', id])) continue;
      if (researchOne(ai, g, v, bank, out, id) === 'short') spend(bank, D.upgrades[id].cost[v.me.up[id] || 0]);
      break; // 시작한 것(또는 못 시작한 것)을 지나 뒤 마법으로 건너뛰지 않는다
    }
    // 쉬움·보통: 병력 가치(생산 중 포함)가 시간 상한에 닿으면 유닛 생산은 멈춘다(건물·연구·확장은 계속)
    let room = Infinity;
    if (L.armyPerMin) {
      const val = u => (u.cost.crystal || 0) + (u.cost.nebula || 0);
      room = Math.floor(g.tick / 1200) * L.armyPerMin * ECO - armyValue(armyOf(ai, v));
      for (const b of v.own) if (b.isB) for (const q of b.queue) { const u = q.what && D.units[q.what]; if (u && !u.worker) room -= val(u) * (u.count || 1); }
    }
    // 조합 비율 생산: 현재 수 / 비율 이 가장 작은 유닛부터(동률은 mix 키 순), 못 뽑으면 다음 유닛
    const mix = mixFor(ai, v.me.nebula), keys = Object.keys(mix), have = new Map(keys.map(u => [u, unitCount(v, u)])), stuck = new Set();
    if (room > 0) { // 상한에 닿으면 유닛 생산만 건너뛴다 — 아래 건물·기술·연구는 계속
      if (ai.st.raid && ai.st.raid.want && !unitCount(v, ai.st.raid.want)) trainOne(ai, g, v, bank, out, ai.st.raid.want); // 수송 견제용 수송선(raidOne 이 요청)
      casterOne(ai, g, v, bank, out, mix); // 조합 생산이 건물 큐를 다 채우기 전에(시전 유닛은 목표 수 미만일 때만 한 기)
    }
    for (;;) {
      let best = null;
      for (const u of keys) if (!stuck.has(u) && (!best || have.get(u) * mix[best] < have.get(best) * mix[u])) best = u;
      if (!best || room <= 0) break;
      if (trainOne(ai, g, v, bank, out, best)) { have.set(best, have.get(best) + (D.units[best].count || 1)); room -= armyValue([{ def: D.units[best] }]) * (D.units[best].count || 1); }
      else stuck.add(best);
    }
    // 수정만 남을 때(네뷸라가 모자라 조합 유닛이 막힘): 수정 800 넘는 만큼 종족 수정 전용 유닛으로
    while (room > 0 && bank.crystal > (L.macro ? 400 : 800) * ECO && trainOne(ai, g, v, bank, out, FILL[ai.race])) room -= armyValue([{ def: D.units[FILL[ai.race]] }]);
    // 그래도 1500 넘게 쌓이면 수정 전용 유닛 생산 건물을 하나 더(짓는 중인 게 없고 L.maxProd 미만)
    const fb = Object.values(D.buildings).find(d => d.race === ai.race && !d.dropoff && (d.trains || []).includes(FILL[ai.race]));
    // (어려움 macro: 수정 1500 넘으면 상한 +3·두 개까지 겹쳐 짓기 — 하나씩 지으면 짓는 동안 수정이 계속 쌓였다)
    const flood = L.macro && bank.crystal > 1500 * ECO;
    if (fb && bank.crystal > (L.macro ? 800 : 1500) * ECO && count(v, fb.id) < L.maxProd + (flood ? 3 : 0) && supplyPending(v, fb.id) < (flood ? 2 : 1)) buildOne(ai, g, v, bank, out, taken, fb.id);
    // 빌드 이후 네뷸라가 모자라고 수정이 남으면 빈 분출구에 가스 건물(확장 기지 포함)
    if (!st && v.me.nebula < 300 * ECO && bank.crystal > 400 * ECO && !supplyBusy(v, GAS[ai.race])) {
      const spot = findGasSpot(ai, g, v, bank);
      if (spot) buildWith(ai, v, bank, out, taken, GAS[ai.race], spot);
    }

    // 생산 건물 추가: 조합 유닛을 뽑는 건물이 전부 바쁘고 수정이 남으면(짓는 중인 게 없고 L.maxProd 미만일 때).
    // 빌드 단계 중에도 수정이 600 넘게 쌓이면(유충·생산 건물이 모자라 남는 돈) 짓고, 1000 넘게 쌓이면 상한 +2·짓는 중인 게 하나뿐이면 하나 더(스웜 둥지 제외 — 1800틱짜리라 겹쳐 짓지 않는다).
    const trainsMix = d => (d.trains || []).some(u => keys.includes(u));
    const prodB = v.own.filter(b => b.isB && trainsMix(b.def));
    const idle = b => b.def.larva ? b.larva - (bank.n.get(b.id) || 0) >= 1 : !b.queue.length && !bank.n.get(b.id);
    const pending = prodB.filter(b => b.buildLeft > 0).length + v.own.filter(e => !e.isB && e.order && e.order.type === 'build' && trainsMix(D.buildings[e.order.what])).length;
    const cap = L.maxProd + (bank.crystal > 1000 * ECO ? 2 : 0);
    let top = keys[0];
    for (const u of keys) if (mix[u] > mix[top]) top = u;
    const pb = D.units[top].race === 'swarm' ? D.races.swarm.base
      : Object.values(D.buildings).find(d => d.race === ai.race && !d.dropoff && (d.trains || []).includes(top)).id;
    // 스웜은 유충이 병목이라 남는 수정 700마다 둥지 하나 더 겹쳐 짓는다(최대 3개 동시)
    const par = D.buildings[pb].dropoff ? Math.min(3, 1 + Math.floor(bank.crystal / (700 * ECO))) : bank.crystal > 1000 * ECO ? 2 : 1;
    if (prodB.length && pending < par && prodB.length < cap && bank.crystal > (st ? 600 : 400) * ECO && !prodB.some(b => !(b.buildLeft > 0) && idle(b))) {
      buildOne(ai, g, v, bank, out, taken, pb); // 스웜 둥지도(유충이 병목 — 'x' 단계는 siteBases 로 세어 본진 옆 둥지가 채우지 않는다)
    }
    if (st) return;

    // 조합 유닛의 기술 건물이 없으면(상성 생산으로 새 유닛이 들어온 경우) 하나 짓는다 — 요구 건물을 따라 내려가 지을 수 있는 첫 것
    for (const u of keys) {
      const miss = r => count(v, r) ? null : (D.buildings[r].requires || []).map(miss).find(Boolean) || r;
      const r = (D.units[u].requires || []).map(miss).find(Boolean);
      if (r && !(D.buildings[r].requires || []).some(q => !S.hasTech(g, ai.p, q))) { buildOne(ai, g, v, bank, out, taken, r); break; }
    }

    // 연구: 목록 순서로, 단계 상한까지
    for (const id of P.research) researchOne(ai, g, v, bank, out, id);
  }

  // ---- 무기 판정(sim pickW·rangeLim 과 같은 규칙) ----
  const airy = e => !!(e.def.air || e.lifted);
  const hit = (w, t) => !!w && (airy(t) ? !!w.air : w.ground !== false);
  const weaponsOf = d => d.launcher ? [D.units[d.launcher.child].weapon] : [d.weapon, d.weapon2].filter(Boolean);
  const hitsAir = d => weaponsOf(d).some(w => w.air);
  const reachOf = d => Math.max(0, ...(d.launcher ? [d.launcher.range] : weaponsOf(d).map(w => w.range))); // 최대 사거리(px)
  const melee = d => reachOf(d) <= K.MELEE;
  function wkFor(e, t) {
    const L = e.def.launcher;
    if (L) return hit(D.units[L.child].weapon, t) ? 'launcher' : null;
    return hit(S.weaponOf(e, 'weapon'), t) ? 'weapon' : hit(S.weaponOf(e, 'weapon2'), t) ? 'weapon2' : null; // 3a 모드(포격·잠복)는 무기가 바뀐다
  }
  const radiusOf = t => t.isB ? Math.min(t.def.w, t.def.h) * 16 : t.def.radius;
  // e 가 t 를 사거리 + extra(px) 안에서 때릴 수 있는가
  function canReach(g, e, t, extra = 0) {
    const wk = wkFor(e, t);
    if (!wk) return false;
    const l = ((wk === 'launcher' ? e.def.launcher.range : S.stat(g, e, 'range', wk)) + radiusOf(e) + radiusOf(t) + extra) * S.FP;
    return d2(e, t) <= l * l;
  }

  // 조합 비율: 성향 mix. 어려움(micro ≥ 2)은 최근 3000틱 기억의 적 공중 전투 유닛이 (공중+지상)의 30% 이상이면
  // 공중을 못 때리는 유닛을 빼고, 남는 게 없으면 종족 대공 기본 유닛(AA)으로.
  // nebula: 남는 네뷸라(600 이상)면 네뷸라를 쓰는 유닛 비중 ×3, 그런 유닛이 없으면 종족 대공 유닛(네뷸라를 쓰면)을 최대 비중으로 더한다.
  function mixFor(ai, nebula = 0) {
    if (!ai.P) return {};
    const mix = { ...ai.P.mix };
    if (nebula >= 600 * ECO) {
      const neb = Object.keys(mix).filter(u => D.units[u].cost.nebula);
      if (neb.length) for (const u of neb) mix[u] *= 3;
      else if (D.units[AA[ai.race]].cost.nebula) mix[AA[ai.race]] = Math.max(...Object.values(mix));
    }
    const air = ai.mem.air.size, ground = ai.mem.ground.size;
    if (ai.L.micro >= 2 && air > 0 && air * 10 >= (air + ground) * 3) {
      for (const u of Object.keys(mix)) if (!hitsAir(D.units[u])) delete mix[u];
      if (!Object.keys(mix).length) mix[AA[ai.race]] = 1;
    }
    return mix;
  }

  // ---- 정찰·군대 ----
  const homeOf = v => v.own.find(b => b.isB && b.def.dropoff) || null; // 본진 = 가장 오래된(id 작은) 기지
  const isBaseB = (g, b) => lineage(b.type, D.races[g.players[b.owner].race].base); // 적 종족은 공개 정보
  const fighterDef = d => !!(d.weapon || d.weapon2 || d.launcher || (d.modes && Object.values(d.modes).some(m => m.weapon))); // 모드에서만 무기가 있는 유닛(트렌처) 포함
  const armyValue = units => units.reduce((s, e) => s + (e.def.cost.crystal || 0) + (e.def.cost.nebula || 0), 0);
  const tileAt = (x, y) => [Math.floor(x / TFP), Math.floor(y / TFP)];
  // 자기 시작 자리 방향(flip: 1 x 거울·2 y 거울). 자리 주변 탐색의 동률 순서를 이것으로 뒤집어 자리마다 같게 한다.
  const flipOf = (ai, g) => g.map.starts[g.players[ai.p].slot].flip;
  const within = (a, b, tiles) => d2(a, b) <= tiles * tiles * TFP * TFP;
  // 맵 사이트: 시작 후보(start = true) + 확장(기준점 flip 변환). x, y = 기지 자리 중심(px)
  function sitesOf(ai, g) {
    if (ai.st.sites) return ai.st.sites;
    const md = D.maps[g.map.id], W = g.map.w, H = g.map.h, bd = D.buildings[D.races[ai.race].base], bw = bd.w, bh = bd.h;
    const at = (tx, ty, start) => ({ tx, ty, x: tx * TFP + (bw * TFP >> 1), y: ty * TFP + (bh * TFP >> 1), start });
    ai.st.sites = [...md.starts.map(s => at(s.tx, s.ty, true)),
      ...md.expansions.map(e => { const f = e.flip ?? (e.mirror ? 3 : 0); return at(f & 1 ? W - e.tx - bw : e.tx, f & 2 ? H - e.ty - bh : e.ty, false); })];
    return ai.st.sites;
  }
  // 시작 후보: 자기·팀원 기지가 6타일 안에 없는 시작 자리, 본진에서 가까운 순(동률은 자리 방향 기준 위→왼쪽 — 자리마다 같은 모양)
  function candidates(ai, g, v) {
    const home = homeOf(v), mine = [...v.own, ...v.allies].filter(b => b.isB && b.def.dropoff);
    const out = sitesOf(ai, g).filter(s => s.start && !mine.some(b => Math.abs(b.tx - s.tx) <= 6 && Math.abs(b.ty - s.ty) <= 6));
    const fl = flipOf(ai, g), W = g.map.w * TFP, H = g.map.h * TFP;
    const canon = s => [fl & 2 ? H - s.y : s.y, fl & 1 ? W - s.x : s.x];
    return home ? out.map(s => [s, d2(home, s), ...canon(s)]).sort((a, b) => a[1] - b[1] || a[2] - b[2] || a[3] - b[3]).map(a => a[0]) : out;
  }
  // 사이트를 본 틱 기록(자기 안개 — 중심 타일이 지금 보이면)
  const siteKey = s => s.tx + ',' + s.ty;
  function markSeen(ai, g) {
    const f = g.fog[ai.p];
    for (const s of sitesOf(ai, g)) { const [tx, ty] = tileAt(s.x, s.y); if (f[ty * g.map.w + tx] === 2) ai.st.seen[siteKey(s)] = g.tick; }
    // 탐색 표본: 짝수 좌표 타일(건물 발자국 최소 2×2 라 어느 건물이든 표본 하나를 덮는다)을 마지막으로 본 틱
    const W = g.map.w, H = g.map.h, LW = (W + 1) >> 1, st = ai.st;
    if (!st.look) st.look = new Int32Array(LW * ((H + 1) >> 1)).fill(-1);
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (f[y * W + x] === 2) st.look[(y >> 1) * LW + (x >> 1)] = g.tick;
  }
  // 끝판 탐색 칸(K.CELL 타일 사각형): 칸 안 바위 아닌 표본 중 가장 오래전에 본 틱(표본 없으면 Infinity), 칸 표본 전부를 본 것으로
  function cellAge(ai, g, i, mark) {
    const W = g.map.w, H = g.map.h, LW = (W + 1) >> 1, CW = Math.ceil(W / K.CELL), st = ai.st;
    const x0 = (i % CW) * K.CELL, y0 = Math.floor(i / CW) * K.CELL;
    let age = Infinity;
    for (let y = y0; y < Math.min(H, y0 + K.CELL); y += 2) for (let x = x0; x < Math.min(W, x0 + K.CELL); x += 2) {
      if (g.map.rock[y * W + x]) continue;
      const k = (y >> 1) * LW + (x >> 1);
      if (mark) st.look[k] = g.tick; else if (st.look[k] < age) age = st.look[k];
    }
    return age;
  }
  // 끝판 탐색: 이번 회차(st.round 이후)에 다 보지 못한 칸 중 병력 중심에서 가장 가까운 것(동률 번호). 남은 칸이 없으면 새 회차.
  // 자기 안개만 쓴다 — 숨은 적 건물은 직접 가 봐야 찾는다. 모든 칸이 회차마다 한 번씩은 확인된다.
  function searchCell(ai, g, c) {
    const st = ai.st, CW = Math.ceil(g.map.w / K.CELL), n = CW * Math.ceil(g.map.h / K.CELL);
    for (let pass = 0; pass < 2; pass++) {
      let best = -1, bd = Infinity;
      for (let i = 0; i < n; i++) {
        if (cellAge(ai, g, i) >= st.round) continue;
        const x = (i % CW) * K.CELL * TFP + (K.CELL * TFP >> 1), y = Math.floor(i / CW) * K.CELL * TFP + (K.CELL * TFP >> 1);
        const dd = d2(c, { x, y });
        if (dd < bd) { bd = dd; best = { x, y, id: 0, key: 'c' + i }; }
      }
      if (best !== -1) return best;
      st.round = g.tick;
    }
    return null;
  }
  // 기억한 적 기지 건물(가장 먼저 기억한 것 — Map 삽입 순서)
  function knownBase(g, v) { for (const b of v.known.values()) if (isBaseB(g, b)) return b; return null; }
  // 일꾼을 본진 수정 채집으로 돌려보낸다
  function sendHome(ai, v, w, out) {
    const home = homeOf(v);
    let best = null, bd = Infinity;
    for (const c of v.res) if (c.type === 'crystal' && c.amount > 0 && home && d2(home, c) <= NEAR * NEAR && d2(w, c) < bd) { bd = d2(w, c); best = c; }
    if (best) out.push({ type: 'gather', ids: [w.id], target: best.id, player: ai.p });
    else out.push({ type: 'stop', ids: [w.id], player: ai.p });
  }
  const moveTo = (ai, out, ids, s, type = 'move') => out.push({ type, ids, x: s.x, y: s.y, player: ai.p });

  // 정찰: 초반 일꾼 정찰(시작 후보를 정찰 위치에서 가까운 순으로) → 이후 주기 순찰(보통·어려움)
  function scout(ai, g, v, bank, out, taken = new Set()) {
    const L = ai.L, st = ai.st;
    markSeen(ai, g);
    if (!st.scoutDone) {
      let sc = st.scout ? v.own.find(e => e.id === st.scout) : null;
      if (st.scout && !sc) st.scout = 0; // 죽었다 → 다음 판단에 새로
      if (!sc) {
        const workers = v.own.filter(e => !e.isB && e.def.worker);
        if (workers.length < L.scoutAt) return;
        // 빈손 수정 일꾼 중 id 작은 것 — 수정 앞에서 캐는 중(moving 아님)인 일꾼은 채집 줄에 끼어 못 빠져나오니 걸어가는 일꾼으로
        sc = workers.find(w => !taken.has(w.id) && w.order && w.order.type === 'gather' && w.order.kind === 0 && !(w.carry > 0) && w.order.moving);
        if (!sc) return;
        st.scout = sc.id; st.scoutTo = '';
      }
      const eb = knownBase(g, v);
      const cs = candidates(ai, g, v);
      for (const s of cs) if (st.scoutTo === siteKey(s) && (st.seen[siteKey(s)] !== undefined || within(sc, s, 4))) st.scoutFrom = s;
      const left = eb ? [] : cs.filter(s => st.seen[siteKey(s)] === undefined && !within(sc, s, 4));
      if (!left.length) { // 찾았거나 다 봤다 → 복귀
        if (eb) st.enemyBase = { x: eb.x, y: eb.y, owner: eb.owner };
        sendHome(ai, v, sc, out); taken.add(sc.id);
        st.scout = 0; st.scoutDone = true; st.patrolAt = g.tick + L.patrol;
        return;
      }
      // 다음 후보: 첫 후보는 본진에서 가까운 순(candidates 순서), 그다음은 마지막으로 확인한 후보에서 가까운 것
      const from = st.scoutFrom;
      let next = left[0];
      if (from) for (const s of left) if (d2(from, s) < d2(from, next)) next = s;
      if (st.scoutTo !== siteKey(next) || !sc.order) { moveTo(ai, out, [sc.id], next); st.scoutTo = siteKey(next); taken.add(sc.id); }
      return;
    }
    if (!L.patrol) return;
    // 순찰 유닛: 도착(명령 없음)하면 놓아 준다(일꾼은 채집 복귀), 죽으면 다음 주기에
    const pu = st.patrol ? v.own.find(e => e.id === st.patrol) : null;
    if (st.patrol && (!pu || !pu.order)) { if (pu && pu.def.worker) sendHome(ai, v, pu, out); st.patrol = 0; }
    if (st.patrol || g.tick < st.patrolAt) return;
    st.patrolAt = g.tick + L.patrol;
    let unit = null;
    for (const e of armyOf(ai, v)) if (!unit || (e.def.speed > unit.def.speed)) unit = e;
    if (!unit) unit = v.own.find(w => !w.isB && w.def.worker && !taken.has(w.id) && w.order && w.order.type === 'gather' && w.order.kind === 0 && !(w.carry > 0));
    if (!unit) return;
    const home = homeOf(v);
    let best = null;
    for (const s of sitesOf(ai, g)) {
      if (home && Math.abs(home.tx - s.tx) <= 6 && Math.abs(home.ty - s.ty) <= 6) continue;
      if (!best || (st.seen[siteKey(s)] ?? -1) < (st.seen[siteKey(best)] ?? -1)) best = s;
    }
    if (!best) return;
    st.patrol = unit.id; taken.add(unit.id);
    moveTo(ai, out, [unit.id], best);
  }

  // 병력: 자기 비일꾼 전투 유닛(무기·launcher), 정찰·순찰·자식(함재기) 제외
  // 전술로 뺀 다친 유닛(ai.st.pulled)은 회복할 때까지 병력에서 제외
  const armyOf = (ai, v) => v.own.filter(e => !e.isB && !e.def.worker && !e.parent && fighterDef(e.def) && e.id !== ai.st.scout && e.id !== ai.st.patrol && !ai.st.pulled.has(e.id) && !(ai.st.raid && ai.st.raid.ids.includes(e.id)));
  // 집결점: 본진 중심에서 맵 중심 방향 8타일 지점의 가장 가까운 걷기 가능 타일 중심(본진이 바뀌면 다시)
  function rallyPoint(ai, g, v) {
    const home = homeOf(v);
    if (!home) return ai.st.rally ? ai.st.rally.pt : null;
    if (ai.st.rally && ai.st.rally.home === home.id) return ai.st.rally.pt;
    const mx = g.map.w * TFP >> 1, my = g.map.h * TFP >> 1, dx = mx - home.x, dy = my - home.y;
    const len = Math.max(1, Math.floor(Math.sqrt(dx * dx + dy * dy)));
    const [cx, cy] = tileAt(home.x + Math.trunc(dx * 8 * TFP / len), home.y + Math.trunc(dy * 8 * TFP / len));
    let pt = null, bd = Infinity;
    for (let r = 0; r <= 12 && !pt; r++)
      for (let y = cy - r; y <= cy + r; y++)
        for (let x = cx - r; x <= cx + r; x++) {
          if (Math.abs(x - cx) !== r && Math.abs(y - cy) !== r) continue;
          if (!S.walkable(g, x, y)) continue;
          const k = (x - cx) ** 2 + (y - cy) ** 2;
          if (k < bd) { bd = k; pt = { x: x * TFP + (TFP >> 1), y: y * TFP + (TFP >> 1) }; }
        }
    pt = pt || { x: home.x, y: home.y };
    ai.st.rally = { home: home.id, pt };
    return pt;
  }
  const centerOf = units => {
    let x = 0, y = 0;
    for (const e of units) { x += e.x; y += e.y; }
    return { x: Math.trunc(x / units.length), y: Math.trunc(y / units.length) };
  };
  const foeArmy = v => v.foes.filter(e => !e.isB && !e.def.worker && fighterDef(e.def));
  // 공격 목표: 기억한 적 건물 중 집결점에서 가까운 것(동률 id) → 안 본 시작 후보 → 확장 사이트 순회(ai.st.sweep)
  function attackTarget(ai, g, v, c) {
    const rally = rallyPoint(ai, g, v), st = ai.st;
    let best = null;
    for (const b of v.known.values()) {
      if (g.tick - (st.skipB[b.id] ?? -1e9) < K.STUCK * 3) continue; // 닿지 못해 건너뛴 건물(잠시)
      if (!best || d2(rally, b) < d2(rally, best) || (d2(rally, b) === d2(rally, best) && b.id < best.id)) best = b;
    }
    if (best) return { x: best.x, y: best.y, id: best.id, key: 'b' + best.id };
    const unseen = candidates(ai, g, v).find(s => st.seen[siteKey(s)] === undefined);
    if (unseen) return { x: unseen.x, y: unseen.y, id: 0, key: 's' + siteKey(unseen) };
    const home = homeOf(v), sites = sitesOf(ai, g).filter(s => !home || Math.abs(home.tx - s.tx) > 6 || Math.abs(home.ty - s.ty) > 6);
    if (!sites.length) return null;
    if (st.sweep >= sites.length && c && st.look) return searchCell(ai, g, c); // 사이트를 한 바퀴 돌고도 못 찾았다 → 맵 전체 칸 탐색
    const s = sites[st.sweep % sites.length];
    return { x: s.x, y: s.y, id: 0, key: 'w' + st.sweep };
  }
  // 팀 협동(army 앞): 리더 = 지금 리더가 탈락했거나 병력(전투 유닛)이 없으면 보드 구성원 중 탈락하지 않고 병력이 있는 가장 작은 번호(없으면 탈락하지 않은 가장 작은 번호). 사람 팀원(보드 밖)이 60틱 안에 적에게 맞았으면
  // 가장 최근 피격 위치(동률 id 작은 것)를 ai.st.assist 로, 120틱 동안 새 피격이 없으면 해제.
  function team(ai, g, v) {
    const b = ai.board, st = ai.st;
    const live = b.members.filter(q => !g.players[q].out); // members 는 플레이어 번호 오름차순(fromRoster)
    const armed = q => (q === ai.p ? v.own : v.allies).some(e => e.owner === q && !e.isB && !e.def.worker && !e.parent && fighterDef(e.def));
    if (!(live.includes(b.leader) && armed(b.leader))) b.leader = live.find(armed) ?? live[0] ?? -1; // 병력 있는 리더는 유지(공격 중 교체 방지)
    if (b.leader === ai.p) b.active = st.mode === 'attack';
    let best = null;
    for (const e of v.allies) {
      if (b.members.includes(e.owner) || g.tick - e.lastHit >= K.ASSIST_HIT || e.lastBy < 0 || !S.isEnemy(g, ai.p, e.lastBy)) continue;
      if (!best || e.lastHit > best.lastHit) best = e;
    }
    if (best) st.assist = { x: best.x, y: best.y, id: best.id, at: best.lastHit };
    else if (st.assist && g.tick - st.assist.at > K.ASSIST_HOLD) st.assist = null;
  }
  // 팀 AI 전원의 병력 가치(팀원 유닛은 v.allies)와 살아 있는 팀 AI 수
  function teamValue(ai, g, v, units) {
    const m = ai.board.members.filter(q => !g.players[q].out);
    let val = armyValue(units);
    for (const e of v.allies) if (m.includes(e.owner) && !e.isB && !e.def.worker && !e.parent && fighterDef(e.def)) val += armyValue([e]);
    return [val, m.length];
  }
  // 군대: 방어(최우선) → 후퇴 → 공격 개시 → 공격 → 집결
  function army(ai, g, v, bank, out) {
    const st = ai.st, L = ai.L, p = ai.p, rally = rallyPoint(ai, g, v);
    const held = e => !!(st.anchor && st.anchor.has(e.id)) || (e.order && e.order.type === 'cast'); // 정박 조작 중·시전 중 유닛은 공격 재명령·집결에서 뺀다(anchorMicro 가 해제)
    let units = armyOf(ai, v);
    if (!rally) return;
    // 생산 건물 집결점(일꾼 기지 제외)
    const prod = v.own.filter(b => b.isB && !b.def.dropoff && (b.def.trains || []).length && !(b.rally && b.rally.x === rally.x && b.rally.y === rally.y));
    if (prod.length) out.push({ type: 'setRally', ids: prod.map(b => b.id), x: rally.x, y: rally.y, player: p });
    const ids = us => us.map(e => e.id);

    // 1. 방어: 자기 건물 14타일 안의 보이는 적 유닛(일꾼 제외)
    const blds = v.own.filter(b => b.isB), home = homeOf(v) || rally;
    let threat = null;
    const raid = [];
    for (const f of v.foes) {
      if (f.isB || f.def.worker || !blds.some(b => within(b, f, K.DEFEND_R))) continue;
      raid.push(f);
      if (!threat || d2(home, f) < d2(home, threat)) threat = f;
    }
    // 공격 중 작은 습격(병력 가치가 습격의 K.SPLIT배 이상): 가까운 유닛부터 습격 가치 ×2 만큼만 돌려보내고 나머지는 공격 계속
    const rv = threat ? Math.max(1, armyValue(raid.filter(f => fighterDef(f.def)))) : 0;
    if (threat && st.mode === 'attack' && armyValue(units) >= rv * K.SPLIT) {
      const near = [...units].sort((a, b) => d2(a, threat) - d2(b, threat) || mutStage(ai, a) - mutStage(ai, b) || a.id - b.id), def = [];
      for (let sum = 0; sum < rv * 2 && near.length;) { const e = near.shift(); def.push(e); sum += armyValue([e]); }
      const go = def.filter(e => !(e.order && e.order.x !== undefined && within({ x: e.order.x, y: e.order.y }, threat, 4)));
      if (go.length) out.push({ type: 'attackMove', ids: ids(go), x: threat.x, y: threat.y, player: p });
      const dset = new Set(def.map(e => e.id));
      units = units.filter(e => !dset.has(e.id));
      threat = null;
    }
    if (threat) {
      if (!units.length) return;
      const re = st.mode !== 'defend' || st.defend !== threat.id;
      st.mode = 'defend'; st.defend = threat.id;
      const us = re ? units : units.filter(e => !e.order);
      if (us.length) out.push({ type: 'attackMove', ids: ids(us), x: threat.x, y: threat.y, player: p });
      return;
    }
    if (st.mode === 'defend') { st.mode = 'gather'; st.defend = 0; }
    if (!units.length) { st.mode = 'gather'; st.target = null; return; }
    const val = armyValue(units), c = centerOf(units), B = ai.board;

    // 5. 후퇴: 병력 중심 12타일 안 적 가치 × 100 > 아군 가치(중심 12타일 안 또는 그 적들 8타일 안) × L.retreat.
    // 병력이 길게 늘어져(공중이 먼저 도착) 중심에 아군이 적어도, 전체 병력이 그 적의 K.OVERWHELM배 이상이면 물러나지 않는다(뒤따라 합류)
    if (st.mode === 'attack' && L.retreat > 0) {
      const fs = foeArmy(v).filter(f => within(c, f, K.RETREAT_R)), fv = armyValue(fs);
      const mv = armyValue(units.filter(e => within(c, e, K.RETREAT_R) || fs.some(f => within(e, f, 8))));
      const outmatched = fv * 100 > mv * L.retreat && fv * K.OVERWHELM * L.retreat > val * 100;
      // 안 보이는 적(은폐·잠복)에게 병력이 맞는데 근처에 자기 탐지기가 없으면 물러난다
      const blind = ai.st.unseen && g.tick - ai.st.unseenAt <= 120 && within(c, ai.st.unseen, K.UNSEEN_R)
        && !v.own.some(e => e.def.detector && !(e.buildLeft > 0) && within(e, ai.st.unseen, 10));
      if (blind || outmatched) {
        st.mode = 'retreat'; st.calm = g.tick + K.CALM; st.target = null;
        if (B.leader === p) { B.target = null; B.active = false; } // 팀원은 보드를 보고 집결로
        out.push({ type: 'move', ids: ids(units), x: rally.x, y: rally.y, player: p });
        return;
      }
    }
    if (st.mode === 'retreat') {
      if (within(c, rally, K.RALLY_R)) st.mode = 'gather';
      else { const us = units.filter(e => !e.order); if (us.length) out.push({ type: 'move', ids: ids(us), x: rally.x, y: rally.y, player: p }); return; }
    }
    // 사람 팀원 지원(후퇴 다음): 피격 지점 근처에 보이는 적 가치가 K.ASSIST_MIN 이상일 때만.
    // 공격 중이면 가까운 유닛부터 그 적 가치 ×2 만큼만 보내고 나머지는 공격 계속. 그 외엔 전체(대상이 바뀔 때 전체, 그 외엔 명령 없는 유닛만)
    const av = st.assist ? armyValue(foeArmy(v).filter(f => within(st.assist, f, K.ASSIST_R))) : 0;
    if (av >= K.ASSIST_MIN && st.mode === 'attack') {
      const a = st.assist, near = [...units].sort((x, y) => d2(x, a) - d2(y, a) || x.id - y.id), def = [];
      for (let sum = 0; sum < av * 2 && near.length;) { const e = near.shift(); def.push(e); sum += armyValue([e]); }
      const go = def.filter(e => !(e.order && e.order.x !== undefined && within({ x: e.order.x, y: e.order.y }, a, 4)));
      if (go.length) out.push({ type: 'attackMove', ids: ids(go), x: a.x, y: a.y, player: p });
      const dset = new Set(def.map(e => e.id));
      units = units.filter(e => !dset.has(e.id));
      st.assistId = 0;
      if (!units.length) return;
    } else if (av >= K.ASSIST_MIN) {
      const re = st.assistId !== st.assist.id;
      st.assistId = st.assist.id; st.target = null;
      const us = re ? units : units.filter(e => !e.order);
      if (us.length) out.push({ type: 'attackMove', ids: ids(us), x: st.assist.x, y: st.assist.y, player: p });
      return;
    } else st.assistId = 0;

    // 2. 공격 개시
    const P = ai.P || { attack: { value: 600, tick: 4000 } }, need = P.attack.value * ECO * L.attack; // val × 100 과 비교
    // 팀(보드에 살아 있는 AI 2명 이상): 리더만 팀 병력 합 ≥ 기준 × 팀 AI 수로 개시하고 보드에 알린다. 팀원은 보드의 새 개시를 따른다.
    // 리더가 K.LEAD_WAIT 틱 넘게 개시하지 않고(공격 중도 아님) 팀 병력이 기준을 넘으면 팀원이 직접 개시해 보드에 알린다(solo — 리더 공격 여부와 무관하게 계속)
    const [tv, tn] = teamValue(ai, g, v, units), lead = tn < 2 || B.leader === p;
    if (st.mode === 'gather' && g.tick >= (st.calm || 0) && g.tick >= (L.firstAttack || 0)) {
      const solo = !lead && !B.active && g.tick - B.attackAt > K.LEAD_WAIT && tv * 100 >= need * tn;
      const go = lead ? (tv * 100 >= need * tn || (g.tick >= P.attack.tick && tv * 200 >= need * tn)) : B.attackAt > st.lastAttack || B.active || solo; // 후퇴했던 팀원은 리더가 공격 중이면 다시 합류
      if (go) {
        st.mode = 'attack'; st.target = null; st.solo = !lead && !B.active; // 리더 공격 없이 개시(직접·다른 팀원 단독 개시 합류)
        if (lead || solo) { B.attackAt = g.tick; B.target = null; }
        if (lead && tn >= 2) B.active = true;
        st.lastAttack = B.attackAt;
      }
    }
    // 리더를 따라간 팀원은 리더 공격이 끝나면(후퇴·전멸) 집결로
    if (st.mode === 'attack' && tn >= 2 && !lead && !st.solo && !B.active) { st.mode = 'gather'; st.target = null; }

    // 3·4. 공격 중: 목표가 바뀔 때만 전체 재명령, 그 외엔 명령 없는 유닛만
    if (st.mode === 'attack') {
      let t = st.target;
      if (t && t.id && !v.known.has(t.id)) t = null; // 목표 건물 파괴 확인
      if (t && t.key[0] === 'c' && cellAge(ai, g, +t.key.slice(1)) >= st.round) t = null; // 탐색 칸을 다 봤다 → 다음 칸
      if (t && !t.id && t.key[0] !== 'c' && within(c, t, K.RALLY_R) && !v.foes.some(f => within(t, f, 10))) { // 도착했는데 적 없음 → 다음
        if (t.key[0] === 'w') st.sweep = (st.sweep || 0) + 1;
        t = null;
      }
      if (!t || t.key[0] !== 'b') { // 건물을 새로 알게 되면 바로 건물로
        const nt = attackTarget(ai, g, v, c);
        if (nt && (!t || nt.key[0] === 'b')) t = nt;
      }
      if (tn >= 2) { if (lead) B.target = t; else if (B.target) t = B.target; } // 팀원은 리더 목표를 따른다
      // 진척 없음: 병력 중심이 K.STUCK 틱 동안 목표에 10% 이상 가까워지지 않으면(길이 없거나 막힘) 그 목표를 건너뛴다
      if (t) {
        const dd = d2(c, t), pr = st.prog;
        if (!pr || pr.key !== t.key) st.prog = { key: t.key, best: dd, at: g.tick };
        else if (dd * 10 < pr.best * 8) { pr.best = dd; pr.at = g.tick; }
        else if (g.tick - pr.at > K.STUCK && !v.foes.some(f => within(c, f, 10))) {
          if (t.key[0] === 's') st.seen[t.key.slice(1)] = g.tick; else if (t.key[0] === 'w') st.sweep = (st.sweep || 0) + 1; else if (t.key[0] === 'c') cellAge(ai, g, +t.key.slice(1), true); else st.skipB[t.id] = g.tick;
          st.prog = null; st.target = null; return;
        }
      }
      if (!t) return;
      const re = !st.target || st.target.key !== t.key;
      st.target = t;
      const us = re ? units.filter(e => !held(e)) : units.filter(e => !e.order);
      if (!us.length) return;
      // 사거리 유닛 뒤로(micro ≥ 1): 근접 유닛이 섞여 있으면 원거리 유닛 지점을 목표에서 집결점 쪽으로 3타일
      const mel = us.filter(e => melee(e.def)), rng = us.filter(e => !melee(e.def));
      if (L.micro >= 1 && mel.length && rng.length) {
        const dx = rally.x - t.x, dy = rally.y - t.y, len = Math.max(1, Math.floor(Math.sqrt(dx * dx + dy * dy))), k = Math.min(3 * TFP, len);
        out.push({ type: 'attackMove', ids: ids(mel), x: t.x, y: t.y, player: p });
        out.push({ type: 'attackMove', ids: ids(rng), x: t.x + Math.trunc(dx * k / len), y: t.y + Math.trunc(dy * k / len), player: p });
      } else out.push({ type: 'attackMove', ids: ids(us), x: t.x, y: t.y, player: p });
      return;
    }

    // 6. 집결: 집결점 6타일 밖, 집결점으로 가는 중이 아닌 유닛만
    const us = units.filter(e => !within(e, rally, K.RALLY_R) && !(e.order && e.order.x !== undefined && within({ x: e.order.x, y: e.order.y }, rally, K.RALLY_R)) && !(e.order && e.order.type === 'attack') && !held(e));
    if (us.length) out.push({ type: 'attackMove', ids: ids(us), x: rally.x, y: rally.y, player: p });
  }

  // 앵커 정박 조작(L.cast.lvl ≥ 2 = 보통 이상): 공격·집결 중인 정박 가능 유닛이 정박 무기 사거리 안에 보이는 적 지상 유닛·건물을 보면 hold(제자리에서 정박).
  // 사거리 + 2타일 안에 보이는 적이 120틱 없고 병력이 공격 중이면 병력 목표로 attackMove(해제). 후퇴 move 는 그대로 해제 역할. 명령한 유닛은 busy.
  function anchorMicro(ai, g, v, out, busy) {
    const st = ai.st, p = ai.p, held = st.anchor || (st.anchor = new Map()), FREE = 120;
    const foes = v.foes.filter(f => f.hp > 0 && !f.def.air);
    for (const id of [...held.keys()]) if (!v.own.some(e => e.id === id)) held.delete(id);
    for (const e of armyOf(ai, v)) {
      const m = e.def.modes && Object.values(e.def.modes).find(md => md.auto && md.weapon);
      if (!m) continue;
      const seen = extra => foes.some(f => { const l = (m.weapon.range + radiusOf(e) + radiusOf(f)) * S.FP + extra; return d2(e, f) <= l * l; });
      if (held.has(e.id) && (!e.order || e.order.type !== 'hold')) held.delete(e.id); // 다른 명령으로 풀림 — 이번 판단에 다시 hold 할 수 있다
      if (held.has(e.id)) {
        busy.add(e.id);
        if (seen(2 * TFP)) held.set(e.id, g.tick);
        else if (g.tick - held.get(e.id) >= FREE) {
          if (st.mode === 'attack' && st.target) { out.push({ type: 'attackMove', ids: [e.id], x: st.target.x, y: st.target.y, player: p }); held.delete(e.id); }
          else if (st.mode === 'gather') held.delete(e.id); // 집결 중: 다음 판단에 army 가 집결점으로 보낸다
        }
      } else if (!e.mode && !(e.modeT > 0) && st.mode !== 'retreat' && e.order && (e.order.type === 'attackMove' || e.order.type === 'attack') && seen(0)) {
        out.push({ type: 'hold', ids: [e.id], player: p }); held.set(e.id, g.tick); busy.add(e.id);
      }
    }
  }

  // 변이 인지(어려움): 마이셀 유닛 처치 수로 변이 단계 → 1단계 이상은 hp 50% 미만에 빼고, 2단계는 hp 80% 회복 전 복귀 안 함. 동률 정렬 보조
  const mutStage = (ai, e) => ai.L.micro < 2 || !e.kills ? 0 : e.kills >= D.races.swarm.mutation.at[1] ? 2 : e.kills >= D.races.swarm.mutation.at[0] ? 1 : 0;
  const mutationMicro = (ai, e, back) => { const m = mutStage(ai, e); return back ? (m >= 2 ? K.BACK_HP_MUT : K.BACK_HP) : (m >= 1 ? K.PULL_HP_MUT : K.PULL_HP); };

  // 공명 뭉치기(코러스 어려움, 집결 중): 집결점 안에서 같은 종류 이웃(4타일 안)이 2기 미만인 유닛을 그 종류 무게중심으로 move — 판단당 한 종류, 1명령
  function resonanceGroup(ai, g, v, rally, out, busy) {
    if (ai.race !== 'elysian' || ai.L.micro < 2 || ai.st.mode !== 'gather') return false;
    const us = armyOf(ai, v).filter(e => !e.def.air && within(e, rally, K.RALLY_R)), kinds = [...new Set(us.map(e => e.type))].sort();
    for (const k of kinds) {
      const same = us.filter(e => e.type === k);
      const lone = same.filter(e => same.reduce((n, o) => n + (o !== e && within(e, o, 4) ? 1 : 0), 0) < 2);
      if (!lone.length || same.length < 3) continue;
      const c = centerOf(same);
      if (!S.walkable(g, Math.floor(c.x / TFP), Math.floor(c.y / TFP))) continue;
      const go = lone.filter(e => !(e.order && e.order.type === 'move' && within({ x: e.order.x, y: e.order.y }, c, 1)));
      if (go.length) { out.push({ type: 'move', ids: go.map(e => e.id), x: c.x, y: c.y, player: ai.p }); for (const e of go) busy.add(e.id); return true; }
    }
    return false;
  }

  // 전술(L.micro ≥ 1, army 다음): 다친 유닛 빼기·카이팅(micro ≥ 2) → 집중 사격. 한 판단에 명령 최대 6개.
  // 교전 = 병력 중 사거리 + 2타일 안에 보이는 적 유닛이 있는 유닛
  // 수송 견제(어려움 2회·보통 드물게 1회, 성향 raid): 수송선 + 지상 소형·중형 4기를 load → 기억한 적 기지의 수정 덩이 바깥쪽으로 날아가 unload →
  // 보이는 일꾼 attack → 수송선이 맞거나 위협이 크면 recall(load) → 집결점에 unload. 수송선이 죽으면 다시 하지 않는다.
  // 공정 시야: 기억한 적 건물·지금 보이는 적만 읽는다(수정 덩이 위치는 맵 공개 정보). 대공 건물·유닛 11타일 안 지점은 피한다.
  const RAID_TR = { legion: 'ferry', swarm: 'bloater', elysian: 'skiff' };
  function raidSpot(ai, g, v, tr) {
    const aa = [...v.known.values()].filter(b => b.owner !== ai.p && hitsAir(D.buildings[b.type])).concat(v.foes.filter(f => !f.isB && hitsAir(f.def)));
    let best = null, bd = Infinity;
    for (const b of v.known.values()) {
      if (!S.isEnemy(g, ai.p, b.owner) || !isBaseB(g, b) || !b.done) continue; // 짓는 중이던 기지(일꾼 없음)는 빼고
      const ms = v.res.filter(r => r.type === 'crystal' && within(r, b, 10));
      if (!ms.length) continue;
      const c = centerOf(ms), dx = c.x - b.x, dy = c.y - b.y, len = Math.max(1, Math.floor(Math.sqrt(dx * dx + dy * dy)));
      const pt = { x: Math.min(Math.max(c.x + Math.trunc(dx * 3 * TFP / len), 2 * TFP), (g.map.w - 2) * TFP), y: Math.min(Math.max(c.y + Math.trunc(dy * 3 * TFP / len), 2 * TFP), (g.map.h - 2) * TFP) };
      if (aa.some(a => within(a, pt, 11))) continue;
      const d = d2(pt, tr); // 가까운 기지(지금 남은 덩이 수는 안개 너머 채굴 정도를 엿보는 셈이라 비교하지 않는다)
      if (d < bd) { bd = d; best = { x: pt.x, y: pt.y, bx: b.x, by: b.y }; }
    }
    return best;
  }
  function raidOne(ai, g, v, bank, out, busy) {
    const st = ai.st, p = ai.p, tick = g.tick, race = ai.race;
    if (!ai.P || !ai.P.raid || ai.level === 'easy') return;
    const R = st.raid || (st.raid = { n: 0, max: ai.level === 'hard' ? 2 : rnd(ai, 3) === 0 ? 1 : 0, dead: false, ph: '', endAt: 0, ids: [], t: 0, spot: null, safe: null, since: 0, re: 0, lastWork: 0 });
    const done = wait => { R.ph = ''; R.ids = []; R.t = 0; R.endAt = tick + wait; };
    if (R.ph === '') {
      if (R.dead || R.n >= R.max || tick < (ai.level === 'hard' ? 7000 : 12000) || tick < R.endAt || st.mode === 'retreat') return;
      const army = armyOf(ai, v);
      if (army.length < 8) return;
      const tdef = D.units[RAID_TR[race]], me = v.me;
      const tr = v.own.find(e => e.type === tdef.id && !e.isB && !e.inside && e.hp > 0 && !(e.life > 0) && (!tdef.transportReq || me.up[tdef.transportReq]));
      if (!tr) {
        if (tdef.transportReq && !me.up[tdef.transportReq]) researchOne(ai, g, v, bank, out, tdef.transportReq);
        else if (race !== 'swarm' && !unitCount(v, tdef.id)) R.want = tdef.id; // 생산(production)이 조합 유닛보다 먼저 뽑는다 — 여기선 생산 건물 큐가 이미 차 있다
        return;
      }
      R.want = null;
      const squad = army.filter(e => !e.def.air && !e.inside && e.def.size !== 'large' && S.canLoad(g, p, tr, e) === '').sort((a, b) => d2(a, tr) - d2(b, tr) || a.id - b.id).slice(0, 4);
      if (squad.length < 4) return;
      const spot = raidSpot(ai, g, v, tr);
      if (!spot) return;
      const dx = spot.x - spot.bx, dy = spot.y - spot.by, len = Math.max(1, Math.floor(Math.sqrt(dx * dx + dy * dy)));
      const clampX = x => Math.min(Math.max(x, TFP), (g.map.w - 1) * TFP), clampY = y => Math.min(Math.max(y, TFP), (g.map.h - 1) * TFP);
      Object.assign(R, { ph: 'load', t: tr.id, ids: squad.map(e => e.id), spot, safe: { x: clampX(spot.x + Math.trunc(dx * 5 * TFP / len)), y: clampY(spot.y + Math.trunc(dy * 5 * TFP / len)) }, since: tick, re: tick });
      out.push({ type: 'load', ids: R.ids.slice(), target: tr.id, player: p });
      busy.add(tr.id); for (const id of R.ids) busy.add(id);
      return;
    }
    const tr = v.own.find(e => e.id === R.t);
    if (!tr || !(tr.hp > 0)) { R.dead = true; done(0); return; }
    const sq = v.own.filter(e => R.ids.includes(e.id) && e.hp > 0), inside = sq.filter(e => e.inside === tr.id), hurt = tick - tr.lastHit < 40;
    busy.add(tr.id); for (const e of sq) busy.add(e.id);
    const cmd = c => out.push({ ...c, player: p });
    const home = () => { // 집결점이 없으면(본진 없음·이어하기로 캐시 없음) 견제를 끝낸다
      const r = rallyPoint(ai, g, v);
      if (!r) { done(3000); return; }
      R.ph = 'home'; R.since = tick; R.re = tick; cmd({ type: 'unload', ids: [tr.id], x: r.x, y: r.y });
    };
    if (R.ph === 'load') {
      if (inside.length === sq.length && sq.length >= 2 || (tick - R.since > 900 && inside.length >= 2)) {
        R.ph = 'fly'; R.since = tick; R.re = tick; cmd({ type: 'unload', ids: [tr.id], x: R.spot.x, y: R.spot.y });
      } else if (tick - R.since > 900 || sq.length < 2 || hurt) { if (inside.length) home(); else done(1500); }
      else if (tick - R.re >= 120) { R.re = tick; const w = sq.filter(e => !e.inside && !e.order); if (w.length) cmd({ type: 'load', ids: w.map(e => e.id), target: tr.id }); }
    } else if (R.ph === 'fly') {
      if (!inside.length) { R.ph = 'fight'; R.n++; R.since = tick; R.lastWork = tick; R.re = tick - 1e6; cmd({ type: 'move', ids: [tr.id], x: R.safe.x, y: R.safe.y }); }
      else if (hurt || tick - R.since > 3000) home();
      else if (!tr.order && tick - R.re >= 60) { R.re = tick; cmd({ type: 'unload', ids: [tr.id], x: R.spot.x, y: R.spot.y }); }
    } else if (R.ph === 'fight' || R.ph === 'recall') {
      const out2 = sq.filter(e => !e.inside);
      if (!sq.length) { home(); return; }
      if (R.ph === 'fight') {
        const c = centerOf(out2.length ? out2 : sq), workers = v.foes.filter(f => !f.isB && f.def.worker && within(f, R.spot, 16)), guards = v.foes.filter(f => !f.isB && !f.def.worker && fighterDef(f.def) && within(f, c, 9));
        if (workers.length) R.lastWork = tick;
        // 수송선이 맞는 건 회수 사유가 아니다(내려 준 뒤 바깥쪽으로 빠져 있다) — 분대가 줄거나 지킬 병력이 오면 회수
        if (sq.length <= 1 || tick - R.since > 2400 || tick - R.lastWork > 600 || armyValue(guards) > armyValue(sq)) {
          R.ph = 'recall'; R.since = tick; R.re = tick - 1e6;
          cmd({ type: 'move', ids: [tr.id], x: R.safe.x, y: R.safe.y });
        } else {
          const groups = new Map();
          for (const e of out2) {
            let t = null;
            for (const f of workers) if (canReach(g, e, f, 20 * S.TILE) && (!t || d2(e, f) < d2(e, t))) t = f;
            if (!t || (e.order && e.order.type === 'attack' && e.order.target === t.id)) continue;
            if (!groups.has(t.id)) groups.set(t.id, []);
            groups.get(t.id).push(e.id);
          }
          for (const [target, ids] of groups) cmd({ type: 'attack', ids, target });
          // 일꾼이 안 보이면 수정 덩이 쪽(지점과 기지 중간)으로 공격 이동 — 내린 자리(덩이 바깥)에서는 시야 밖일 수 있다
          if (!workers.length && tick - R.re >= 120) { R.re = tick; const w = out2.filter(e => !e.order); if (w.length) cmd({ type: 'attackMove', ids: w.map(e => e.id), x: (R.spot.x + R.spot.bx) >> 1, y: (R.spot.y + R.spot.by) >> 1 }); }
        }
      } else if (inside.length === sq.length || tick - R.since > 600) {
        if (inside.length) home(); else done(3000);
      } else if (tick - R.re >= 120) { R.re = tick; const w = out2.filter(e => !e.order || e.order.type !== 'board'); if (w.length) cmd({ type: 'load', ids: w.map(e => e.id), target: tr.id }); }
    } else if (R.ph === 'home') {
      const left = v.own.some(e => e.inside === tr.id);
      if (!left && !tr.order) done(3000);
      else if (tick - R.since > 2500) done(3000);
      else if (!tr.order && tick - R.re >= 60) { R.re = tick; const r = rallyPoint(ai, g, v); if (r) cmd({ type: 'unload', ids: [tr.id], x: r.x, y: r.y }); else done(3000); }
    }
  }

  function tactics(ai, g, v, bank, out) {
    const L = ai.L, st = ai.st, p = ai.p, busy = new Set(); // busy: 이 판단에 전술이 명령한 유닛(casters 가 건드리지 않음)
    if (L.micro < 1) return busy;
    raidOne(ai, g, v, bank, out, busy);
    const rally = rallyPoint(ai, g, v);
    if (!rally) return busy;
    let budget = K.MICRO_CMDS;
    if (resonanceGroup(ai, g, v, rally, out, busy)) budget--;
    if (L.cast.lvl >= 2) anchorMicro(ai, g, v, out, busy);
    // 회복된(hp 60% 이상 또는 보호막 가득, 재생 없는 레기온은 집결점 도착) 유닛은 다시 병력으로
    for (const id of [...st.pulled]) {
      const e = v.own.find(u => u.id === id);
      const regen = e && (e.def.race === 'swarm' || e.shieldMax > 0);
      if (!e || e.hp * 100 >= e.hpMax * mutationMicro(ai, e, true) || (e.shieldMax > 0 && e.shield >= e.shieldMax) || (!regen && within(e, rally, 3))) st.pulled.delete(id);
    }
    const units = armyOf(ai, v), foes = v.foes.filter(f => !f.isB && f.hp > 0);
    if (!units.length || !foes.length) return busy;
    if (L.micro >= 2) {
      // 다친 유닛 빼기: hp 30% 미만, 40틱 안에 맞은 비공중 유닛 → 집결점
      const hurt = units.filter(e => !e.def.air && e.hp * 100 < e.hpMax * mutationMicro(ai, e, false) && g.tick - e.lastHit < K.PULL_HIT);
      if (hurt.length) {
        out.push({ type: 'move', ids: hurt.map(e => e.id), x: rally.x, y: rally.y, player: p }); budget--;
        for (const e of hurt) { st.pulled.add(e.id); busy.add(e.id); }
      }
    }
    const engaged = units.filter(e => !busy.has(e.id) && !(e.order && e.order.type === 'cast') && foes.some(f => canReach(g, e, f, 2 * S.TILE)));
    if (L.micro >= 2) {
      // 카이팅: 사거리 96px 이상·재장전 중, 2타일 안 근접 적 → 그 반대 방향 2타일
      for (const e of engaged) {
        if (budget <= 0) break;
        if (!(e.cd > 0) || reachOf(e.def) < K.KITE_RANGE) continue;
        let near = null;
        for (const f of foes) if (melee(f.def) && wkFor(f, e) && within(e, f, 2) && (!near || d2(e, f) < d2(e, near))) near = f;
        if (!near) continue;
        const dx = e.x - near.x, dy = e.y - near.y, len = Math.max(1, Math.floor(Math.sqrt(dx * dx + dy * dy)));
        const x = e.x + Math.trunc(dx * 2 * TFP / len), y = e.y + Math.trunc(dy * 2 * TFP / len);
        if (!S.walkable(g, Math.floor(x / TFP), Math.floor(y / TFP))) continue;
        out.push({ type: 'move', ids: [e.id], x, y, player: p }); budget--; busy.add(e.id);
      }
    }
    // 집중 사격: 사거리 안 보이는 적 중 hp + 보호막 최소(동률 id 작은 것), 이미 그 대상 attack 이면 그대로. 같은 대상끼리 묶는다.
    // 후퇴 중엔 하지 않는다(attack 이 후퇴 move 를 덮어쓰지 않게)
    if (st.mode === 'retreat') return busy;
    const groups = new Map();
    for (const e of engaged) {
      if (busy.has(e.id)) continue;
      let best = null, bk = Infinity;
      for (const f of foes) {
        if (!canReach(g, e, f)) continue;
        const k = f.hp + (f.shield || 0);
        if (k < bk) { bk = k; best = f; } // foes 는 id 오름차순 → 동률은 id 작은 것
      }
      if (!best || (e.order && e.order.type === 'attack' && e.order.target === best.id)) continue;
      if (!groups.has(best.id)) groups.set(best.id, []);
      groups.get(best.id).push(e.id);
    }
    for (const [target, us] of groups) {
      if (budget <= 0) break;
      out.push({ type: 'attack', ids: us, target, player: p }); budget--;
      for (const id of us) busy.add(id);
    }
    return busy;
  }

  // 시전자(tactics 다음): ① 무기 없는 시전 유닛(spellOnly)은 병력 중심에서 집결점 쪽 K.CASTER_BEHIND 타일 뒤로 attackMove
  // (K.CASTER_FAR 타일 넘게 벌어지고 그쪽으로 가는 중이 아닐 때만) ② 마법 판단 ai-cast.js castPlan — 판단 LEVELS.cast.every 번에 1번, 시전 유닛이 있을 때만
  function casters(ai, g, v, out, busy) {
    const st = ai.st, p = ai.p;
    const cs = v.own.filter(e => (e.def.abilities || []).length && !e.isB && !e.def.worker && !e.parent && !(e.life > 0) && !e.inside && !fighterDef(e.def)
      && !busy.has(e.id) && e.id !== st.scout && e.id !== st.patrol && !(e.order && e.order.type === 'cast'));
    const units = armyOf(ai, v), rally = rallyPoint(ai, g, v);
    // 지상·공중 시전 유닛은 각각 같은 종류(def.air) 병력 기준(없으면 전체). 지상 지점이 못 가는 곳이면 병력 중심
    for (const air of [false, true]) {
      const mc = cs.filter(e => !!e.def.air === air);
      if (!mc.length || !units.length || !rally) continue;
      const same = units.filter(e => !!e.def.air === air), base = same.length ? same : units;
      // 공격 중에는 목표에 가까운 앞쪽 K.CASTER_FRONT % 병력의 중심(긴 행렬의 뒤꽁무니에 머물지 않게)
      const t = st.mode === 'attack' && st.target, lead = t ? base.slice().sort((a, b) => d2(a, t) - d2(b, t) || a.id - b.id).slice(0, Math.max(1, Math.floor(base.length * K.CASTER_FRONT / 100))) : base;
      const c = centerOf(lead), dx = rally.x - c.x, dy = rally.y - c.y, len = Math.max(1, Math.floor(Math.sqrt(dx * dx + dy * dy))), k = Math.min(K.CASTER_BEHIND * TFP, len);
      let pt = { x: c.x + Math.trunc(dx * k / len), y: c.y + Math.trunc(dy * k / len) };
      const ok = q => air || S.walkable(g, Math.floor(q.x / TFP), Math.floor(q.y / TFP));
      if (!ok(pt)) { if (!ok(c)) continue; pt = { x: c.x, y: c.y }; }
      const go = mc.filter(e => !within(e, pt, K.CASTER_FAR) && !(e.order && e.order.x !== undefined && within({ x: e.order.x, y: e.order.y }, pt, K.CASTER_FAR)));
      if (go.length) { out.push({ type: 'attackMove', ids: go.map(e => e.id), x: pt.x, y: pt.y, player: p }); for (const e of go) busy.add(e.id); }
    }
    if (!ai.castOn || !v.own.some(e => (e.def.abilities || []).length)) return;
    st.castN = (st.castN || 0) + 1;
    if ((st.castN - 1) % ai.L.cast.every !== 0) return;
    const cmds = CAST.castPlan(ai, g, v, busy);
    for (let i = 0; i < cmds.length && i < K.CAST_CMDS; i++) out.push(cmds[i]);
  }

  // 안 보이는 적에게 맞음(보통·어려움): 지난 판단 이후 적에게 맞은 자기 유닛·건물, 또는 죽은(사라진) 자기 유닛 중
  // 12타일 안에 보이는 적이 지난 판단·이번 판단 모두 없는 것 = 사건. 240틱 안 사건 2개부터 인정(쏜 적이 방금 죽어 안 보이는 경우를 거른다).
  // 자기 엔티티의 lastHit·lastBy·생존만 읽는다(맞고 죽는 것은 화면에서도 보인다). 위치 = 가장 최근 사건.
  function unseenHits(ai, g, v) {
    if (ai.L.micro < 1) return;
    const st = ai.st, alive = new Map();
    let at = null;
    const quiet = (e, who) => !v.foes.some(f => (who < 0 || f.owner === who) && within(e, f, K.UNSEEN_R));
    for (const e of v.own) {
      const q = quiet(e, -1), was = st.lastOwn.get(e.id); // 교전 중이던(지난 판단에 적이 보이던) 유닛은 제외 — 서로 죽인 경우
      if (!e.isB && !e.parent && !(e.life > 0)) alive.set(e.id, { x: e.x, y: e.y, q, b: !!(e.order && e.order.type === 'build') }); // 함재기(모선 귀환)·시간제한 소환은 사라져도 죽음으로 안 셈. b: 건설하러 가는 일꾼(스웜은 건물이 되며 사라진다)
      if (q && (!was || was.q) && g.tick - e.lastHit <= ai.L.every && e.lastBy >= 0 && S.isEnemy(g, ai.p, e.lastBy)) { at = { x: e.x, y: e.y }; st.unseenEv.push(g.tick); }
    }
    for (const [id, e] of st.lastOwn) if (!alive.has(id) && !e.b && e.q && quiet(e, -1)) { at = at || e; st.unseenEv.push(g.tick); }
    st.lastOwn = alive;
    st.unseenEv = st.unseenEv.filter(t => t > g.tick - K.UNSEEN_WIN);
    if (at && st.unseenEv.length >= 2) { st.unseen = at; st.unseenAt = g.tick; }
  }

  // ---- ⑤ create/think/fromRoster/collect ----
  function think(ai, g) {
    if (g.winner !== -1 || g.players[ai.p].out || (g.tick + ai.phase) % ai.L.every !== 0) return [];
    const v = view(g, ai.p, ai.mem), bank = bankOf(g, v), out = [], taken = new Set();
    const st = curStep(ai, g, v);
    economy(ai, g, v, bank, out, taken, st && st[0] === 'w' ? st[1] : 0);
    production(ai, g, v, bank, out, taken, st);
    scout(ai, g, v, bank, out, taken);
    unseenHits(ai, g, v);
    team(ai, g, v);
    army(ai, g, v, bank, out);
    casters(ai, g, v, out, tactics(ai, g, v, bank, out));
    return out;
  }

  // 판단 엇갈림(phase): 자리를 판단 간격에 고르게 펼친다(2인이면 every/2 차이 — 서로의 판단 사이 간격이 양쪽 같음).
  // 누가 먼저 생각하는지는 시드로 돌린다(전에는 (p×5)%every 라 플레이어 1이 늘 같은 쪽으로 치우쳤다).
  function phaseOf(g, p, seed, every) {
    const n = Math.max(1, g.players.length), rot = (seed >>> 0) % n;
    return Math.floor(((p + rot) % n) * every / n);
  }
  function create(g, p, opt = {}) {
    const level = LEVELS[opt.level] ? opt.level : 'normal', race = g.players[p].race;
    const ai = { p, level, L: LEVELS[level], castOn: opt.cast !== 0, r: { s: seedFor(opt.seed | 0, p) }, race, pers: null, P: null,
      phase: phaseOf(g, p, opt.seed | 0, LEVELS[level].every), board: opt.board || newBoard(), mem: newMemory(), st: { scout: 0, spotFail: {}, spotWhy: '', scoutDone: false, seen: {}, patrol: 0, patrolAt: 0, mode: 'gather', sweep: 0, look: null, round: 0, calm: 0, pulled: new Set(), larva: 0, unseen: null, unseenAt: -1e9, unseenEv: [], lastOwn: new Map(), lastAttack: -1, assist: null, prog: null, skipB: {}, skipStep: new Set(), xFail: null, solo: false } };
    const keys = Object.keys(PERS[race]).filter(k => !LEVELS[level].noRush || !PERS[race][k].rush);
    ai.pers = opt.pers && PERS[race][opt.pers] ? opt.pers : keys.length ? keys[rnd(ai, keys.length)] : null;
    ai.P = ai.pers ? PERS[race][ai.pers] : null;
    if (!ai.board.members.includes(p)) { ai.board.members.push(p); ai.board.members.sort((a, b) => a - b); }
    ai.think = gg => think(ai, gg);
    return ai;
  }
  function fromRoster(g, players, seed) {
    const boards = new Map(), ais = [];
    players.forEach((q, p) => {
      if (!q.ai) return;
      if (!boards.has(q.team)) boards.set(q.team, newBoard());
      ais.push(create(g, p, { level: q.ai.level, seed, board: boards.get(q.team), pers: q.ai.pers, cast: q.ai.cast }));
    });
    return ais;
  }
  function collect(g, ais, cmds) { for (const ai of ais) for (const c of ai.think(g)) cmds.push(c); return cmds; }

  return { LEVELS, LEVEL_NAMES, NAMES, PERS, seedFor, newMemory, newBoard, view, workerTarget, create, fromRoster, collect,
    stepDone, findSpot, expansionSpot, candidates, armyValue, rallyPoint, mixFor, AA, K, ECO, CAST,
    _: { bankOf, spend, afford, lineage, count, unitCount, findSpot, stepDone, expansionSpot, casterOne, researchOne }, SRC: nwAI };
})();
if (typeof module !== 'undefined') module.exports = NW_AI;
