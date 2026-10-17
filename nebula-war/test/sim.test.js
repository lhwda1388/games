// node nebula-war/test/sim.test.js
const assert = require('assert');
const D = require('../data.js');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('data: requires/trains 참조가 전부 존재', () => {
  for (const b of Object.values(D.buildings)) {
    for (const u of b.trains || []) assert(D.units[u], `${b.id}.trains ${u}`);
    for (const r of b.requires || []) assert(D.buildings[r], `${b.id}.requires ${r}`);
  }
  for (const u of Object.values(D.units)) for (const r of u.requires || []) assert(D.buildings[r], `${u.id}.requires ${r}`);
});

// ── 2단계 데이터 무결성 ──
const RACES = ['legion', 'swarm', 'elysian'];
const SPEC = {
  legion: { units: ['engineer', 'trooper', 'scorcher', 'corpsman', 'shade', 'hound', 'bastion', 'strider', 'phantom', 'ferry', 'surveyor', 'lancer', 'dreadnought'],
    buildings: ['hq', 'uplink', 'silo', 'depot', 'pump', 'garrison', 'workshop', 'drillhall', 'pillbox', 'flak', 'motorpool', 'garage', 'arsenal', 'airfield', 'tower', 'labs', 'intel', 'gravlab'] },
  swarm: { units: ['drudge', 'bloater', 'skitter', 'spinewyrm', 'trencher', 'wingsting', 'siegemaw', 'acidwing', 'burster', 'matron', 'husk', 'blighter', 'behemoth', 'spawnling'],
    buildings: ['nest', 'grandnest', 'apexnest', 'siphon', 'vat', 'mutapit', 'tendril', 'spineroot', 'puffer', 'wyrmpit', 'roost', 'greatroost', 'matronden', 'blightmound', 'behemothcave'] },
  elysian: { units: ['shaper', 'oathblade', 'arcwalker', 'sage', 'umbra', 'ascendant', 'voidascendant', 'crucible', 'skiff', 'watcher', 'sentinel', 'skimmer', 'ark', 'warden', 'spark', 'shard'],
    buildings: ['sanctum', 'resonator', 'distiller', 'portal', 'anvil', 'wardspire', 'synapse', 'constructbay', 'assemblybay', 'lookout', 'skygate', 'fleetspire', 'citadel', 'sagelibrary', 'wardencourt'] },
};
const SUMMONED = ['husk', 'spawnling', 'seeker']; // 3b: 마법 소환 전용(생산 불가)
const SPELL_ONLY = ['corpsman', 'surveyor', 'ferry', 'matron', 'blighter', 'sage', 'skiff', 'watcher', 'warden'];
const weaponsOf = d => [d.weapon, d.weapon2].filter(Boolean);
const children = () => Object.values(D.units).concat(Object.values(D.buildings)).filter(d => d.launcher).map(d => d.launcher.child);

test('data2: 스펙 표의 모든 id가 존재, 종족 일치, 소환 전용 유닛은 summoned', () => {
  for (const r of RACES) {
    for (const id of SPEC[r].units) { assert(D.units[id], `unit ${id}`); assert.strictEqual(D.units[id].race, r, id); assert(D.units[id].name, id); }
    for (const id of SPEC[r].buildings) { assert(D.buildings[id], `building ${id}`); assert.strictEqual(D.buildings[id].race, r, id); assert(D.buildings[id].name, id); }
  }
  for (const id of SUMMONED) assert.strictEqual(D.units[id].summoned, true, id);
  for (const b of Object.values(D.buildings)) for (const u of b.trains || []) assert(!SUMMONED.includes(u), `${b.id} trains summoned ${u}`);
});

test('data2: 모든 참조(requires/trains/researches/addonOf/morphFrom/launcher/카테고리/업그레이드)가 유효', () => {
  for (const d of Object.values(D.units).concat(Object.values(D.buildings))) {
    for (const r of d.requires || []) assert(D.buildings[r], `${d.id}.requires ${r}`);
    for (const w of weaponsOf(d)) if (w.upgrade) assert(D.categories[w.upgrade], `${d.id} weapon.upgrade ${w.upgrade}`);
    if (d.armorUpgrade) assert(D.categories[d.armorUpgrade], `${d.id}.armorUpgrade ${d.armorUpgrade}`);
    if (d.launcher) { assert(D.units[d.launcher.child], `${d.id}.launcher.child`); assert(d.launcher.max > 0 && d.launcher.build > 0 && d.launcher.cost.crystal >= 0, d.id); }
    for (const c of [d.weapon && d.weapon.upgrade, d.armorUpgrade].filter(Boolean)) assert.strictEqual(D.categories[c].race, d.race, `${d.id} cat ${c}`);
  }
  for (const b of Object.values(D.buildings)) {
    for (const u of b.trains || []) assert.strictEqual(D.units[u].race, b.race, `${b.id}.trains ${u} race`);
    for (const u of b.researches || []) { assert(D.upgrades[u], `${b.id}.researches ${u}`); assert.strictEqual(D.upgrades[u].at, b.id, `${u}.at`); }
    if (b.addonOf) { assert(D.buildings[b.addonOf], `${b.id}.addonOf`); assert.strictEqual(b.race, 'legion', b.id); }
    if (b.morphFrom) { assert(D.buildings[b.morphFrom], `${b.id}.morphFrom`); assert.strictEqual(b.race, 'swarm', b.id); }
  }
  for (const [id, u] of Object.entries(D.upgrades)) {
    assert(RACES.includes(u.race) && u.name, id);
    assert(D.buildings[u.at] && D.buildings[u.at].race === u.race, `${id}.at`);
    assert((D.buildings[u.at].researches || []).includes(id), `${id} not listed in ${u.at}.researches`);
    assert(u.levels === 1 || u.levels === 3, `${id}.levels`);
    assert.strictEqual(u.cost.length, u.levels, `${id}.cost`); assert.strictEqual(u.time.length, u.levels, `${id}.time`);
    for (const c of u.cost) assert(c.crystal >= 0 && c.nebula >= 0, `${id}.cost`);
    if (u.requires) { assert.strictEqual(u.requires.length, u.levels, `${id}.requires`); for (const l of u.requires) for (const r of l) assert(D.buildings[r], `${id}.requires ${r}`); }
    const e = u.effect;
    if (e.category) { assert(D.categories[e.category] && D.categories[e.category].race === u.race, `${id}.effect.category`); assert(e.dmgPerLevel > 0 || e.armorPerLevel > 0, id); }
    else if (e.shieldPerLevel) { assert.strictEqual(u.race, 'elysian', id); assert.strictEqual(u.levels, 3, id); }
    else if (e.unlock) { assert(typeof e.unlock === 'string' && u.levels === 1, id); } // 3a: 능력·모드 해금 연구
    else { assert(D.units[e.unit] && D.units[e.unit].race === u.race, `${id}.effect.unit`); assert(['range', 'speed', 'sight', 'cooldown'].includes(e.stat) && typeof e.add === 'number', `${id}.effect.stat`); }
  }
  for (const [id, c] of Object.entries(D.categories)) assert(RACES.includes(c.race) && c.name, id);
});

test('data2: races 시작 구성, size/weapon.type 유효, 비용 형태', () => {
  for (const [r, race] of Object.entries(D.races)) {
    assert(D.units[race.worker] && D.units[race.worker].worker && D.units[race.worker].race === r, `${r}.worker`);
    assert(D.buildings[race.base] && D.buildings[race.base].race === r, `${r}.base`);
    for (const s of race.start) assert(D.units[s] && D.units[s].race === r, `${r}.start ${s}`);
  }
  for (const u of Object.values(D.units)) {
    assert(['small', 'medium', 'large'].includes(u.size), `${u.id}.size`);
    assert(u.hp > 0 && u.speed > 0 && u.radius > 0 && u.sight > 0 && u.armor >= 0, `${u.id} stats`);
    assert(typeof u.supply === 'number' && u.time > 0, `${u.id} supply/time`);
  }
  for (const d of Object.values(D.units).concat(Object.values(D.buildings))) {
    for (const w of weaponsOf(d)) {
      assert(D.DMG_MULT[w.type], `${d.id} weapon.type ${w.type}`);
      assert(w.dmg > 0 && w.range > 0 && (w.suicide || w.cooldown > 0), `${d.id} weapon`);
      assert(w.air || w.ground !== false, `${d.id} weapon hits nothing`);
    }
    if (d.neutral) continue;
    assert(d.cost && d.cost.crystal >= 0 && (d.cost.nebula === undefined || d.cost.nebula >= 0), `${d.id}.cost`);
  }
  for (const b of Object.values(D.buildings)) assert(b.w > 0 && b.h > 0 && b.hp > 0 && (b.neutral || (RACES.includes(b.race) && b.time > 0)), b.id);
});

test('data2: 생산 가능한 유닛은 같은 종족 건물의 trains에 있다, 자식·소환 전용은 아니다', () => {
  const trained = new Set();
  for (const b of Object.values(D.buildings)) for (const u of b.trains || []) trained.add(u);
  const ch = children();
  assert(ch.includes('spark') && ch.includes('shard'));
  assert.strictEqual(D.units.ark.launcher.child, 'spark'); assert.strictEqual(D.units.crucible.launcher.child, 'shard');
  for (const u of Object.values(D.units)) {
    if (u.summoned || ch.includes(u.id) || u.morphFrom || u.mergeFrom) assert(!trained.has(u.id), `${u.id} must not be trainable`);
    else assert(trained.has(u.id), `${u.id} not in any trains`);
  }
});

test('data2: 마법 전용 유닛은 무기 없음, 마나 데이터 없음', () => {
  for (const id of SPELL_ONLY) { const u = D.units[id]; assert(u.spellOnly === true && !u.weapon && !u.weapon2, id); }
  for (const u of Object.values(D.units)) {
    if (u.spellOnly) assert(!u.weapon, u.id);
    for (const a of u.abilities || []) { assert(D.abilities[a], `${u.id}.abilities ${a}`); if (D.abilities[a].cost > 0) assert(u.energy && u.energy.max > 0, `${u.id} energy`); }
  }
});

test('data2: 가스·부속·변태·띄우기·유충·방어 건물', () => {
  const v = D.buildings.vent;
  assert(v && v.neutral === true && v.w === 2 && v.h === 2 && v.amount === 6250 && !v.race);
  for (const id of ['pump', 'siphon', 'distiller']) assert(D.buildings[id].onVent === true && D.buildings[id].w === 2 && D.buildings[id].h === 2, id);
  const addons = { uplink: 'hq', silo: 'hq', garage: 'motorpool', tower: 'airfield', intel: 'labs', gravlab: 'labs' };
  for (const b of Object.values(D.buildings)) assert.strictEqual(b.addonOf, addons[b.id], `${b.id}.addonOf`);
  const morphs = { grandnest: 'nest', apexnest: 'grandnest', spineroot: 'tendril', puffer: 'tendril', greatroost: 'roost' };
  for (const b of Object.values(D.buildings)) assert.strictEqual(b.morphFrom, morphs[b.id], `${b.id}.morphFrom`);
  const lift = ['hq', 'garrison', 'motorpool', 'airfield', 'labs', 'workshop'];
  for (const b of Object.values(D.buildings)) assert.strictEqual(!!b.lift, lift.includes(b.id), `${b.id}.lift`);
  for (const id of ['nest', 'grandnest', 'apexnest']) { const b = D.buildings[id]; assert(b.larva && b.dropoff && b.trains.length > 3, id); assert.deepStrictEqual(b.trains, D.buildings.nest.trains, id); }
  for (const id of ['pillbox', 'flak', 'spineroot', 'puffer', 'wardspire']) assert(D.buildings[id].weapon, `${id}.weapon`);
  assert(D.buildings.flak.weapon.air && D.buildings.flak.weapon.ground === false);
  assert(D.buildings.puffer.weapon.air && D.buildings.puffer.weapon.ground === false);
  assert(!D.buildings.spineroot.weapon.air);
});

test('data2: 무기 특성 — 튕김, 자폭, 지상/공중 분리, 스플래시', () => {
  assert(D.units.wingsting.weapon.bounce > 0);
  assert(D.units.burster.weapon.suicide && D.units.burster.weapon.air && D.units.burster.weapon.ground === false);
  assert(D.units.shard.weapon.suicide && D.units.shard.weapon.splash > 0);
  assert(D.units.scorcher.weapon.splash > 0 && D.units.scorcher.weapon.type === 'concussive');
  for (const id of ['strider', 'phantom', 'sentinel', 'dreadnought']) {
    const u = D.units[id]; assert(u.weapon && u.weapon2, id);
    assert(u.weapon.ground !== false && !u.weapon.air && u.weapon2.air && u.weapon2.ground === false, `${id} 지상/공중 분리`);
  }
  for (const id of ['lancer', 'skimmer']) assert(D.units[id].weapon.air && D.units[id].weapon.ground === false && D.units[id].weapon.splash > 0, id);
  for (const id of ['spinewyrm', 'arcwalker', 'trooper', 'shade']) assert.strictEqual(D.units[id].weapon.air, true, id);
});

test('data2: 업그레이드 — 종족마다 공격·방어 3단계(2·3단계 상위 건물 필요) + 유닛 전용 3개 안팎', () => {
  for (const r of RACES) {
    const ups = Object.values(D.upgrades).filter(u => u.race === r);
    const cat = ups.filter(u => u.effect.category);
    assert(cat.some(u => u.effect.dmgPerLevel) && cat.some(u => u.effect.armorPerLevel), `${r} attack/armor`);
    for (const u of cat) {
      assert.strictEqual(u.levels, 3, u.name);
      assert(u.requires && u.requires[0].length === 0 && u.requires[1].length > 0 && u.requires[2].length > 0, `${u.name} requires`);
    }
    const unit = ups.filter(u => !u.effect.category && !u.effect.shieldPerLevel && !u.effect.unlock);
    assert(unit.length >= 2 && unit.length <= 4, `${r} unit upgrades ${unit.length}`);
    // 모든 카테고리는 쓰이고, 업그레이드가 있다
    for (const [cid, c] of Object.entries(D.categories)) if (c.race === r) assert(cat.some(u => u.effect.category === cid), `category ${cid} has no upgrade`);
  }
});

test('data2: 1단계 수치 유지', () => {
  const pick = (d, ks) => Object.fromEntries(ks.map(k => [k, d[k]]));
  const U = ['hp', 'shield', 'armor', 'size', 'speed', 'radius', 'sight', 'supply', 'time', 'count', 'provides', 'air', 'worker'];
  assert.deepStrictEqual(pick(D.units.trooper, U), { hp: 50, shield: undefined, armor: 0, size: 'small', speed: 3, radius: 8, sight: 7, supply: 1, time: 300, count: undefined, provides: undefined, air: undefined, worker: undefined }); // 밸런스: 240 → 300
  assert.deepStrictEqual(pick(D.units.trooper.weapon, ['dmg', 'type', 'range', 'cooldown']), { dmg: 8, type: 'normal', range: 128, cooldown: 15 });
  assert.deepStrictEqual(D.units.trooper.requires, ['garrison']);
  assert.deepStrictEqual(pick(D.units.oathblade, ['hp', 'shield', 'armor', 'time']), { hp: 125, shield: 90, armor: 1, time: 600 }); // 밸런스: 75/800 → 90/600
  assert.strictEqual(D.units.oathblade.weapon.dmg, 20);
  assert.deepStrictEqual(pick(D.units.skitter, ['hp', 'speed', 'count', 'supply', 'time']), { hp: 45, speed: 4.5, count: 2, supply: 0.5, time: 300 });
  assert.deepStrictEqual(D.units.skitter.cost, { crystal: 65 });
  assert.deepStrictEqual(pick(D.units.bloater, ['hp', 'speed', 'provides', 'supply', 'air']), { hp: 250, speed: 1, provides: 8, supply: 0, air: true });
  assert.deepStrictEqual(pick(D.buildings.hq, ['hp', 'w', 'h', 'provides', 'time']), { hp: 1875, w: 4, h: 3, provides: 10, time: 1500 });
  assert.deepStrictEqual(pick(D.buildings.resonator, ['hp', 'shield', 'power', 'provides']), { hp: 375, shield: 375, power: 3, provides: 8 });
  assert.deepStrictEqual(pick(D.buildings.vat, ['hp', 'w', 'h', 'creep', 'time']), { hp: 940, w: 3, h: 2, creep: 3, time: 1200 });
  assert.deepStrictEqual(D.buildings.hq.trains, ['engineer']);
  for (const w of ['engineer', 'drudge', 'shaper']) assert.deepStrictEqual(D.units[w].cost, { crystal: 65 });
});

const S = require('../sim.js');

function scripted(seed) {
  const g = S.createGame({ seed, races: ['legion', 'swarm'] });
  const sums = [];
  for (let t = 0; t < 1000; t++) {
    const cmds = [];
    if (t === 5) {
      const w = g.ents.filter(e => e.owner === 0 && e.def.worker).map(e => e.id);
      cmds.push({ player: 0, type: 'move', ids: w, x: 40 * S.TFP, y: 30 * S.TFP });
    }
    if (t === 7) {
      const w = g.ents.filter(e => e.owner === 1 && e.def.worker).map(e => e.id);
      cmds.push({ player: 1, type: 'move', ids: w, x: 90 * S.TFP, y: 100 * S.TFP });
    }
    S.step(g, cmds);
    sums.push(S.checksum(g));
  }
  return sums;
}

test('결정론: 같은 시드·명령이면 매 틱 체크섬 일치', () => {
  assert.deepStrictEqual(scripted(42), scripted(42));
});

test('시작 상태: 본진 + 일꾼, 크리스탈 65', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'elysian'] });
  assert.strictEqual(g.players[0].crystal, 65);
  assert.strictEqual(g.ents.filter(e => e.owner === 0 && e.type === 'hq').length, 1);
  assert.strictEqual(g.ents.filter(e => e.owner === 1 && e.type === 'shaper').length, 4);
  assert(g.ents.filter(e => e.type === 'crystal').length >= 40);
});

test('시작 상태: 보급 ×2 정수, 스웜 블로터, id 오름차순', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'swarm'] });
  assert.strictEqual(g.players[0].supplyUsed2, 8);
  assert.strictEqual(g.players[0].supplyMax2, 20);
  assert.strictEqual(g.players[1].supplyMax2, 18);
  assert(g.ents.some(e => e.owner === 1 && e.type === 'bloater' && e.def.air));
  for (let i = 1; i < g.ents.length; i++) assert(g.ents[i].id > g.ents[i - 1].id);
  const hq = g.ents.find(e => e.type === 'hq');
  assert.strictEqual(S.byId(g, hq.id), hq);
  assert.strictEqual(hq.hp, 1875 * 256);
  assert.strictEqual(g.map.occ[10 * g.map.w + 10], hq.id);
});

test('이동: 직선, 도착 시 정지, px는 이전 x', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'elysian'] });
  const w = g.ents.find(e => e.owner === 0 && e.def.worker);
  g.ents = g.ents.filter(e => e === w || e.isB || e.type === 'crystal'); // 분리(separation)가 직선 경로를 밀지 않게 다른 유닛 제거
  const x0 = w.x;
  S.step(g, [{ player: 0, type: 'move', ids: [w.id], x: x0 + 100 * 256, y: w.y }]);
  assert.strictEqual(w.x, x0 + 896);
  S.step(g, []);
  assert.strictEqual(w.px, x0 + 896);
  for (let i = 0; i < 200; i++) S.step(g, []);
  assert.strictEqual(w.x, x0 + 100 * 256);
  assert.strictEqual(w.order, null);
});

test('길찾기: 바위를 돌아간다', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'] });
  for (let y = 40; y < 60; y++) g.map.rock[y * g.map.w + 50] = 1; // 세로 벽
  const p = S.findPath(g, 45, 50, 55, 50);
  assert(p.length > 10, 'path exists');
  for (const i of p) assert.strictEqual(g.map.rock[i], 0);
  assert.strictEqual(p[p.length - 1], 50 * g.map.w + 55);
});

test('이동: 일꾼이 목표에 도착', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'] });
  const w = g.ents.find(e => e.owner === 0 && e.type === 'engineer');
  S.step(g, [{ player: 0, type: 'move', ids: [w.id], x: 30 * S.TFP, y: 30 * S.TFP }]);
  for (let i = 0; i < 600; i++) S.step(g, []);
  assert(Math.abs(w.x - 30 * S.TFP) < S.TFP && Math.abs(w.y - 30 * S.TFP) < S.TFP);
});

test('체크섬: 다른 명령이면 같은 틱에서 값이 달라진다', () => {
  const run = move => {
    const g = S.createGame({ seed: 7, races: ['legion', 'swarm'] });
    const w = g.ents.find(e => e.owner === 0 && e.def.worker);
    S.step(g, move ? [{ player: 0, type: 'move', ids: [w.id], x: w.x + 50 * 256, y: w.y }] : []);
    for (let i = 0; i < 9; i++) S.step(g, []);
    return S.checksum(g);
  };
  assert.notStrictEqual(run(true), run(false));
  assert.strictEqual(run(true), run(true));
});

test('채집: 일꾼 1기가 600틱 안에 크리스탈을 가져온다', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'] });
  const w = g.ents.find(e => e.owner === 0 && e.type === 'engineer');
  const c = g.ents.filter(e => e.type === 'crystal')
    .sort((a, b) => ((a.x - w.x) ** 2 + (a.y - w.y) ** 2) - ((b.x - w.x) ** 2 + (b.y - w.y) ** 2) || a.id - b.id)[0];
  S.step(g, [{ player: 0, type: 'gather', ids: [w.id], target: c.id }]);
  for (let i = 0; i < 600; i++) S.step(g, []);
  assert(g.players[0].crystal >= 50 + 16, `crystal=${g.players[0].crystal}`);
});

test('채집: 일꾼 4기가 1200틱 동안 서로 막히지 않고 200 넘게 모은다 (교착 회귀)', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'] });
  const ws = g.ents.filter(e => e.owner === 0 && e.def.worker);
  assert.strictEqual(ws.length, 4);
  const crystals = g.ents.filter(e => e.type === 'crystal');
  const cmds = ws.map(w => {
    const c = crystals.slice().sort((a, b) => ((a.x - w.x) ** 2 + (a.y - w.y) ** 2) - ((b.x - w.x) ** 2 + (b.y - w.y) ** 2) || a.id - b.id)[0];
    return { player: 0, type: 'gather', ids: [w.id], target: c.id };
  });
  S.step(g, cmds);
  for (let i = 0; i < 1200; i++) S.step(g, []);
  const gained = g.players[0].crystal - 50;
  assert(gained > 200, `gained=${gained}`);
});

test('채집: 채집 줄 옆 분출구로 건설하러 가는 일꾼이 반납 일꾼과 정면으로 막히지 않는다 (교착 회귀)', () => {
  // 브라우저 플레이 재현: 부자 중앙 엘리시안, 4기 채집 중 1기에 증류기 건설 → 같은 y 줄에서 x축으로만 밀려 영원히 정지했다
  const g = S.createGame({ seed: 1, races: ['elysian', 'swarm'], map: 'bonanza' });
  const ws = g.ents.filter(e => e.owner === 0 && e.def.worker).map(e => e.id);
  const vent = g.ents.find(e => e.type === 'vent' && e.tx < 20 && e.ty < 20);
  for (let t = 0; t < 2600; t++) {
    const c = [];
    if (t === 880) c.push({ player: 0, type: 'gather', ids: ws, target: 3 });
    if (t === 1828) c.push({ player: 0, type: 'build', ids: [ws[0]], what: 'distiller', tx: vent.tx, ty: vent.ty });
    S.step(g, c);
  }
  assert(g.ents.some(e => e.type === 'distiller' && e.owner === 0), 'distiller placed');
  assert(g.players[0].crystal > 290, `mining continued (crystal=${g.players[0].crystal})`);
});

test('이동: 한 점에 몰린 부대도 웨이포인트에서 막히지 않고 출발한다', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'swarm'] });
  const ts = [];
  for (let i = 0; i < 5; i++) { const t = S.spawn(g, 0, 'trooper', 0, 0, false); t.x = (296 + i * 5) * S.FP; t.y = (392 + i * 4) * S.FP; t.px = t.x; t.py = t.y; ts.push(t); }
  S.step(g, [{ player: 0, type: 'attackMove', ids: ts.map(t => t.id), x: 100 * S.TFP, y: 100 * S.TFP }]);
  for (let i = 0; i < 800; i++) S.step(g, []);
  for (const t of ts) assert(t.x / S.TFP > 30, `x=${t.x / S.TFP}`);
});

test('생산: 보급 초과면 거부', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'] });
  const hq = g.ents.find(e => e.owner === 0 && e.type === 'hq');
  g.players[0].crystal = 10000;
  for (let i = 0; i < 7; i++) S.step(g, [{ player: 0, type: 'train', ids: [hq.id], what: 'engineer' }]);
  assert.strictEqual(hq.queue.length, 5);
  assert.strictEqual(S.canTrain(g, 0, hq, 'engineer'), 'queue');
  for (let i = 0; i < 260 * 5 + 10; i++) S.step(g, []);
  S.step(g, [{ player: 0, type: 'train', ids: [hq.id], what: 'engineer' }]);
  assert.strictEqual(g.players[0].supplyUsed2, 20);
  assert.strictEqual(S.canTrain(g, 0, hq, 'engineer'), 'supply');
});

test('생산: 스웜 유충 소모, 스키터 2기', () => {
  const g = S.createGame({ seed: 1, races: ['swarm', 'swarm'] });
  const nest = g.ents.find(e => e.owner === 0 && e.type === 'nest');
  g.players[0].crystal = 1000;
  S.spawn(g, 0, 'vat', 16, 16);
  S.step(g, [{ player: 0, type: 'train', ids: [nest.id], what: 'skitter' }]);
  assert.strictEqual(nest.larva, 2);
  for (let i = 0; i < 300; i++) S.step(g, []);
  assert.strictEqual(g.ents.filter(e => e.owner === 0 && e.type === 'skitter').length, 2);
  assert.strictEqual(g.players[0].supplyUsed2, 8 + 2); // 드러지 4기(8) + 블로터 0 + 스키터 2기(2)
});

test('생산: 유충 220틱마다 +1, 블로터 완성 시 보급 증가', () => {
  const g = S.createGame({ seed: 1, races: ['swarm', 'swarm'] });
  const nest = g.ents.find(e => e.owner === 0 && e.type === 'nest');
  g.players[0].crystal = 1000;
  assert.strictEqual(nest.larva, 3);
  S.step(g, [{ player: 0, type: 'train', ids: [nest.id], what: 'bloater' }]);
  assert.strictEqual(nest.larva, 2);
  for (let i = 0; i < 225; i++) S.step(g, []);
  assert.strictEqual(nest.larva, 3);
  const before = g.players[0].supplyMax2;
  for (let i = 0; i < 300; i++) S.step(g, []);
  assert.strictEqual(g.players[0].supplyMax2, before + 16);
});

test('건설: 엔지니어가 보급고 → 최대 보급 증가', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'] });
  const w = g.ents.find(e => e.owner === 0 && e.type === 'engineer');
  g.players[0].crystal = 125;
  S.step(g, [{ player: 0, type: 'build', ids: [w.id], what: 'depot', tx: 20, ty: 10 }]);
  for (let i = 0; i < 900; i++) S.step(g, []);
  assert.strictEqual(g.players[0].crystal, 0);
  assert.strictEqual(g.players[0].supplyMax2, (10 + 8) * 2);
});

test('건설: 스웜은 점막 밖 불가, 엘리시안은 공명장 밖 불가', () => {
  const g = S.createGame({ seed: 1, races: ['swarm', 'elysian'] });
  g.players[0].crystal = g.players[1].crystal = 1000;
  assert.strictEqual(S.canPlace(g, 0, 'vat', 16, 13), '');
  assert.strictEqual(S.canPlace(g, 0, 'vat', 60, 60), 'creep');
  assert.strictEqual(S.canPlace(g, 1, 'portal', 105, 110), 'power');
  assert.strictEqual(S.canPlace(g, 1, 'resonator', 105, 110), '');
});

test('건설: 완성 이벤트, 진행 중 hp 증가, 레기온은 엔지니어 사망 시 정지, 스웜 드러지 소모', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'swarm'] });
  const w = g.ents.find(e => e.owner === 0 && e.type === 'engineer');
  g.players[0].crystal = 125;
  S.step(g, [{ player: 0, type: 'build', ids: [w.id], what: 'depot', tx: 20, ty: 10 }]);
  for (let i = 0; i < 200; i++) S.step(g, []);
  const b = g.ents.find(e => e.type === 'depot');
  assert(b.buildLeft > 0 && b.hp > Math.floor(b.hpMax / 10) && b.hp < b.hpMax);
  const left = b.buildLeft;
  g.ents.splice(g.ents.indexOf(w), 1);
  for (let i = 0; i < 20; i++) S.step(g, []);
  assert.strictEqual(b.buildLeft, left);
  const g2 = S.createGame({ seed: 1, races: ['legion', 'swarm'] });
  const d = g2.ents.find(e => e.owner === 1 && e.type === 'drudge');
  g2.players[1].crystal = 500;
  const used = g2.players[1].supplyUsed2;
  S.step(g2, [{ player: 1, type: 'build', ids: [d.id], what: 'vat', tx: 118, ty: 109 }]);
  let done = [];
  for (let i = 0; i < 1500; i++) done.push(...S.step(g2, []));
  assert(!S.byId(g2, d.id));
  assert.strictEqual(g2.players[1].supplyUsed2, used - 2);
  assert(done.some(ev => ev.t === 'done'));
});

test('건설: 건설 중인 엔지니어는 명령을 무시하고 건물이 완성된다', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'] });
  const w = g.ents.find(e => e.owner === 0 && e.type === 'engineer');
  g.players[0].crystal = 125;
  S.step(g, [{ player: 0, type: 'build', ids: [w.id], what: 'depot', tx: 20, ty: 10 }]);
  for (let i = 0; i < 200; i++) S.step(g, []);
  const x = w.x, y = w.y;
  S.step(g, [{ player: 0, type: 'move', ids: [w.id], x: 5000, y: 5000 }, { player: 0, type: 'build', ids: [w.id], what: 'depot', tx: 30, ty: 10 }]);
  for (let i = 0; i < 700; i++) S.step(g, []);
  assert.strictEqual(w.x, x);
  assert.strictEqual(g.players[0].supplyMax2, 36);
});

test('데미지: 배율·방어력·최소·보호막', () => {
  const tgt = (type, sh = 0) => ({ def: S.D.units[type] || S.D.buildings[type], shield: sh });
  assert.deepStrictEqual(S.calcDamage({ dmg: 6, type: 'normal' }, tgt('trooper')), { shield: 0, hp: 6 * 256 });
  assert.deepStrictEqual(S.calcDamage({ dmg: 6, type: 'normal' }, tgt('oathblade')), { shield: 0, hp: 5 * 256 });
  assert.deepStrictEqual(S.calcDamage({ dmg: 16, type: 'concussive' }, tgt('hq')), { shield: 0, hp: Math.floor(15 * 256 * 30 / 100) });
  assert.deepStrictEqual(S.calcDamage({ dmg: 1, type: 'normal' }, tgt('hq')), { shield: 0, hp: 128 });
  assert.deepStrictEqual(S.calcDamage({ dmg: 6, type: 'normal' }, tgt('oathblade', 2 * 256)), { shield: 512, hp: 3 * 256 });
});

test('전투: 트루퍼 3기가 스키터 2기를 이긴다', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'swarm'] });
  for (let i = 0; i < 3; i++) S.spawn(g, 0, 'trooper', (40 + i) * S.TFP, 60 * S.TFP);
  for (let i = 0; i < 2; i++) S.spawn(g, 1, 'skitter', (40 + i) * S.TFP, 66 * S.TFP);
  for (let i = 0; i < 400; i++) S.step(g, []);
  assert.strictEqual(g.ents.filter(e => e.type === 'skitter').length, 0);
  assert(g.ents.filter(e => e.type === 'trooper').length >= 1);
});

test('승패: 건물 전멸 시 승리', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'swarm'] });
  for (const e of g.ents) if (e.owner === 1 && e.isB) e.hp = 0;
  S.step(g, []);
  assert.strictEqual(g.winner, 0);
});

test('승패: 유닛 0 + 보급·전력·가스·방어 건물만 남으면 탈락, 생산·연구·선행 건물이 하나라도 있으면 생존', () => {
  const only = (races, keep, extra) => {
    const g = S.createGame({ seed: 1, races });
    for (const e of g.ents) if (e.owner === 1) e.hp = 0;
    for (const [t, x, y] of keep) S.spawn(g, 1, t, x, y);
    if (extra) extra(g);
    S.step(g, []);
    return g;
  };
  // 정의는 데이터에서 파생: trains·researches·larva·다른 정의의 requires/morphFrom/addonOf 대상
  for (const [races, keep] of [[['legion', 'legion'], [['depot', 60, 60], ['pump', 66, 60]]], [['legion', 'elysian'], [['resonator', 60, 60], ['wardspire', 66, 60]]],
    [['legion', 'swarm'], [['siphon', 60, 60], ['spineroot', 66, 60]]]]) {
    const g = only(races, keep);
    assert(g.players[1].out && g.winner === 0, `${races[1]} ${keep.map(k => k[0])}`);
  }
  for (const [races, keep] of [[['legion', 'legion'], [['depot', 60, 60], ['drillhall', 66, 60]]], [['legion', 'elysian'], [['resonator', 60, 60], ['portal', 66, 60]]],
    [['legion', 'swarm'], [['tendril', 60, 60]]], [['legion', 'elysian'], [['synapse', 60, 60], ['fleetspire', 66, 60]]]]) {
    const g = only(races, keep);
    assert(!g.players[1].out && g.winner === -1, `${races[1]} ${keep.map(k => k[0])}`);
  }
  // 유닛(일꾼 포함)이 하나라도 있으면 보급 건물만으로 생존, 소환·함재기만으로는 안 됨
  const g1 = only(['legion', 'legion'], [['depot', 60, 60]], g => S.spawn(g, 1, 'engineer', 70 * S.TFP, 70 * S.TFP));
  assert(!g1.players[1].out && g1.winner === -1);
  const g2 = only(['legion', 'legion'], [['depot', 60, 60]], g => { S.spawn(g, 1, 'engineer', 70 * S.TFP, 70 * S.TFP).free = true; });
  assert(g2.players[1].out && g2.winner === 0);
  // 건물 0 이면 유닛이 있어도 탈락(기존 규칙)
  const g3 = only(['legion', 'legion'], [], g => S.spawn(g, 1, 'trooper', 70 * S.TFP, 70 * S.TFP));
  assert(g3.players[1].out && g3.winner === 0);
});

test('승패: surrender', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'swarm'] });
  S.step(g, [{ player: 0, type: 'surrender' }]);
  assert.strictEqual(g.winner, 1);
});

test('사망: 보급 반환·점유 해제·점막·이벤트, 크리스탈은 유지', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'swarm'] });
  const crystals = g.ents.filter(e => e.type === 'crystal').length;
  const sk = S.spawn(g, 1, 'skitter', 60 * S.TFP, 60 * S.TFP);
  const used = g.players[1].supplyUsed2;
  const nest = g.ents.find(e => e.owner === 1 && e.type === 'nest');
  S.spawn(g, 1, 'siphon', 50, 80); // 건물이 남아야 탈락하지 않는다
  sk.hp = 0; nest.hp = 0;
  const ev = S.step(g, []);
  assert.strictEqual(g.players[1].supplyUsed2, used - 1);
  assert(!S.byId(g, sk.id) && !S.byId(g, nest.id));
  assert.strictEqual(g.map.occ[nest.ty * g.map.w + nest.tx], 0);
  assert.strictEqual(g.map.creep.reduce((a, b) => a + b, 0), 0);
  assert.strictEqual(g.players[1].supplyMax2, 16); // 블로터만 남음
  assert(ev.some(x => x.t === 'death' && x.id === sk.id && x.type === 'skitter'));
  assert.strictEqual(g.ents.filter(e => e.type === 'crystal').length, crystals);
});

test('재생: 보호막은 100틱 후 20틱마다, 스웜 hp는 40틱마다', () => {
  const g = S.createGame({ seed: 1, races: ['elysian', 'swarm'] });
  const ob = S.spawn(g, 0, 'oathblade', 60 * S.TFP, 60 * S.TFP);
  const dr = S.spawn(g, 1, 'drudge', 70 * S.TFP, 70 * S.TFP);
  ob.shield = 0; ob.lastHit = g.tick; dr.hp -= 2048;
  for (let i = 0; i < 99; i++) S.step(g, []);
  assert.strictEqual(ob.shield, 0);
  for (let i = 0; i < 40; i++) S.step(g, []);
  assert(ob.shield >= 256 && ob.shield <= 512);
  assert.strictEqual(dr.hp, dr.hpMax - 2048 + 4 * 256);
  for (let i = 0; i < 1900; i++) S.step(g, []); // 보호막 90 = 20틱 × 90회 회복
  assert.strictEqual(dr.hp, dr.hpMax);
  assert.strictEqual(ob.shield, ob.shieldMax);
});

test('명령: stop/hold/attackMove/patrol/setRally, 공중·일꾼 규칙', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'swarm'] });
  const t = S.spawn(g, 0, 'trooper', 60 * S.TFP, 60 * S.TFP);
  const s = S.spawn(g, 1, 'skitter', 60 * S.TFP, 63 * S.TFP);
  S.step(g, [{ player: 0, type: 'hold', ids: [t.id] }]);
  assert.strictEqual(t.order.type, 'hold');
  for (let i = 0; i < 30; i++) S.step(g, []);
  assert(s.hp < s.hpMax || !S.byId(g, s.id)); // 사거리 안 → 사격
  const x = t.x, y = t.y;
  const far = S.spawn(g, 0, 'trooper', 100 * S.TFP, 20 * S.TFP);
  S.step(g, [{ player: 0, type: 'move', ids: [far.id], x: 90 * S.TFP, y: 20 * S.TFP }]);
  assert.strictEqual(far.order.type, 'move');
  S.step(g, [{ player: 0, type: 'stop', ids: [far.id] }]);
  assert.strictEqual(far.order, null);
  const hq = g.ents.find(e => e.owner === 0 && e.type === 'hq');
  S.step(g, [{ player: 0, type: 'setRally', ids: [hq.id], x: 123, y: 456 }]);
  assert.deepStrictEqual(hq.rally, { x: 123, y: 456 });
  // 지상 전용 무기는 공중 유닛을 공격 불가(2단계: 트루퍼는 대공 가능)
  const b = S.spawn(g, 1, 'bloater', 61 * S.TFP, 60 * S.TFP);
  const hd = S.spawn(g, 0, 'hound', 62 * S.TFP, 60 * S.TFP);
  S.step(g, [{ player: 0, type: 'attack', ids: [hd.id], target: b.id }]);
  assert(!hd.order || hd.order.target !== b.id);
  // attackMove: 도중 적과 교전
  const t2 = S.spawn(g, 0, 'trooper', 30 * S.TFP, 90 * S.TFP);
  const t3 = S.spawn(g, 0, 'trooper', 30 * S.TFP, 91 * S.TFP);
  const s2 = S.spawn(g, 1, 'skitter', 36 * S.TFP, 90 * S.TFP);
  S.step(g, [{ player: 0, type: 'attackMove', ids: [t2.id, t3.id], x: 50 * S.TFP, y: 90 * S.TFP }]);
  for (let i = 0; i < 300; i++) S.step(g, []);
  assert(!S.byId(g, s2.id));
  assert(t2.x > 45 * S.TFP);
});

test('전투: 결정론', () => {
  const run = () => {
    const g = S.createGame({ seed: 3, races: ['legion', 'swarm'] });
    for (let i = 0; i < 4; i++) S.spawn(g, 0, 'trooper', (40 + i) * S.TFP, 60 * S.TFP);
    for (let i = 0; i < 4; i++) S.spawn(g, 1, 'skitter', (40 + i) * S.TFP, 66 * S.TFP);
    for (let i = 0; i < 300; i++) S.step(g, []);
    return S.checksum(g);
  };
  assert.strictEqual(run(), run());
});

test('가스: 펌프를 짓고 일꾼이 가스를 가져온다', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'] });
  const v = g.ents.filter(e => e.type === 'vent').sort((a, b) => a.id - b.id)[0];
  const ws = g.ents.filter(e => e.owner === 0 && e.type === 'engineer');
  g.players[0].crystal = 1000;
  assert.strictEqual(S.canPlace(g, 0, 'pump', v.tx, v.ty), '');
  assert.strictEqual(S.canPlace(g, 0, 'depot', v.tx, v.ty), 'blocked');
  S.step(g, [{ player: 0, type: 'build', ids: [ws[0].id], what: 'pump', tx: v.tx, ty: v.ty }]);
  for (let i = 0; i < 1500; i++) S.step(g, []);
  const pump = g.ents.find(e => e.type === 'pump' && e.owner === 0);
  assert(pump && !(pump.buildLeft > 0));
  S.step(g, [{ player: 0, type: 'gather', ids: [ws[1].id], target: pump.id }]);
  for (let i = 0; i < 600; i++) S.step(g, []);
  assert(g.players[0].nebula >= 16, `nebula=${g.players[0].nebula}`);
});

test('가스: 분출구 배치·사유(vent/nebula), 건물 파괴 시 점유 복원, 한 번에 1기, 고갈 시 2', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'] });
  const vents = g.ents.filter(e => e.type === 'vent');
  assert.strictEqual(vents.length, 5);
  for (const v of vents) { assert(v.owner === -1 && v.amount === 6250 && !v.isB); assert.strictEqual(g.map.occ[v.ty * g.map.w + v.tx], v.id); }
  const v = vents[0];
  g.players[0].crystal = 1000;
  assert.strictEqual(S.canPlace(g, 0, 'pump', v.tx + 3, v.ty), 'vent');
  assert.strictEqual(S.canPlace(g, 0, 'pump', v.tx + 1, v.ty), 'vent');
  // 비용: 성운 부족 → 'nebula' (crystal 다음)
  const gar = S.spawn(g, 0, 'garrison', 20, 20), dh = S.spawn(g, 0, 'drillhall', 30, 20), mp = S.spawn(g, 0, 'motorpool', 40, 20);
  assert.strictEqual(S.canPlace(g, 0, 'arsenal', 50, 20), 'nebula');
  g.players[0].crystal = 0;
  assert.strictEqual(S.canPlace(g, 0, 'arsenal', 50, 20), 'crystal');
  g.players[0].crystal = 1000; g.players[0].supplyMax2 = 100;
  assert.strictEqual(S.canTrain(g, 0, gar, 'scorcher'), 'nebula');
  g.players[0].nebula = 30;
  assert.strictEqual(S.canTrain(g, 0, gar, 'scorcher'), '');
  S.step(g, [{ player: 0, type: 'train', ids: [gar.id], what: 'scorcher' }]);
  assert.strictEqual(g.players[0].nebula, 0); assert.strictEqual(g.players[0].crystal, 935);
  // 건물 위 → 'vent'(이미 점유), 파괴하면 점유 복원
  const pump = S.spawn(g, 0, 'pump', v.tx, v.ty, true);
  assert.strictEqual(g.map.occ[v.ty * g.map.w + v.tx], pump.id);
  assert.strictEqual(S.canPlace(g, 0, 'pump', v.tx, v.ty), 'vent');
  // 두 일꾼: 1기씩만 안에 들어간다
  const ws = g.ents.filter(e => e.owner === 0 && e.type === 'engineer');
  S.step(g, [{ player: 0, type: 'gather', ids: [ws[0].id, ws[1].id], target: pump.id }]);
  let maxIn = 0;
  for (let i = 0; i < 400; i++) { S.step(g, []); maxIn = Math.max(maxIn, ws.filter(w => w.order && w.order.type === 'gather' && w.order.phase === 'mine' && w.order.res === pump.id && w.x === pump.x && w.y === pump.y).length); }
  assert.strictEqual(maxIn, 1);
  assert(g.players[0].nebula >= 16, `nebula=${g.players[0].nebula}`);
  assert(v.amount < 6250);
  // 고갈: 8 대신 2
  v.amount = 0; ws[0].order = null; ws[1].order = null; ws[0].carry = ws[1].carry = 0;
  const before = g.players[0].nebula;
  S.step(g, [{ player: 0, type: 'gather', ids: [ws[0].id], target: pump.id }]);
  for (let i = 0; i < 400; i++) S.step(g, []);
  const got = g.players[0].nebula - before;
  assert(got >= 2 && got <= 6 && got % 2 === 0, `got=${got}`);
  pump.hp = 0; S.step(g, []);
  assert.strictEqual(g.map.occ[v.ty * g.map.w + v.tx], v.id);
  assert.strictEqual(S.canPlace(g, 0, 'pump', v.tx, v.ty), '');
});

test('가스: 결정론 — 같은 시드·명령이면 체크섬 동일', () => {
  const run = () => {
    const g = S.createGame({ seed: 7, races: ['legion', 'legion'] });
    const v = g.ents.find(e => e.type === 'vent'), ws = g.ents.filter(e => e.owner === 0 && e.type === 'engineer');
    g.players[0].crystal = 500;
    S.step(g, [{ player: 0, type: 'build', ids: [ws[0].id], what: 'pump', tx: v.tx, ty: v.ty }]);
    for (let i = 0; i < 700; i++) S.step(g, []);
    S.step(g, [{ player: 0, type: 'gather', ids: [ws[1].id, ws[2].id], target: g.ents.find(e => e.type === 'pump').id }]);
    for (let i = 0; i < 300; i++) S.step(g, []);
    return S.checksum(g);
  };
  assert.strictEqual(run(), run());
});

// ── Task 3: 테크트리 · 부속 · 변태 · 연구 ──
test('연구: 공격 1단계가 데미지를 올린다', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'swarm'] });
  g.players[0].crystal = g.players[0].nebula = 5000;
  const ws = S.spawn(g, 0, 'workshop', 20, 10);
  const up = Object.values(S.D.upgrades).find(u => u.at === 'workshop' && u.effect.category && u.effect.dmgPerLevel);
  S.step(g, [{ player: 0, type: 'research', ids: [ws.id], what: up.id }]);
  for (let i = 0; i < up.time[0] + 5; i++) S.step(g, []);
  assert.strictEqual(g.players[0].up[up.id], 1);
  assert.strictEqual(S.canResearch(g, 0, ws, up.id), up.levels === 1 ? 'max' : 'tech'); // 2단계는 상위 건물 필요
});

test('건물 변태: 번식지 → 성숙지, 요구 조건 상속', () => {
  const g = S.createGame({ seed: 1, races: ['swarm', 'legion'] });
  g.players[0].crystal = g.players[0].nebula = 5000;
  const nest = g.ents.find(e => e.owner === 0 && e.type === 'nest');
  S.spawn(g, 0, 'vat', 16, 13);
  S.step(g, [{ player: 0, type: 'morph', ids: [nest.id], what: 'grandnest' }]);
  for (let i = 0; i < S.D.buildings.grandnest.time + 5; i++) S.step(g, []);
  assert.strictEqual(nest.type, 'grandnest');
  assert(S.hasTech(g, 0, 'nest'));
});

test('부속: 사령부 + 위성 관제소', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'] });
  g.players[0].crystal = g.players[0].nebula = 5000;
  const hq = g.ents.find(e => e.owner === 0 && e.type === 'hq');
  for (const r of S.D.buildings.uplink.requires || []) if (r !== 'hq') S.spawn(g, 0, r, 30, 30);
  assert.strictEqual(S.canAddon(g, 0, hq, 'uplink'), '');
  S.step(g, [{ player: 0, type: 'build', ids: [hq.id], what: 'uplink' }]);
  for (let i = 0; i < S.D.buildings.uplink.time + 5; i++) S.step(g, []);
  const up = g.ents.find(e => e.type === 'uplink' && e.owner === 0);
  assert(up && up.tx === hq.tx + hq.def.w && !(up.buildLeft > 0));
});

test('데미지: 공격·방어·보호막 업그레이드 레벨', () => {
  const tgt = (type, sh = 0) => ({ def: S.D.units[type] || S.D.buildings[type], shield: sh });
  const W = S.D.units;
  // 레벨 0은 기존 2인자 결과와 동일
  assert.deepStrictEqual(S.calcDamage(W.scorcher.weapon, tgt('trooper'), 0, 0, 0), S.calcDamage(W.scorcher.weapon, tgt('trooper')));
  // weapon.perLevel 우선: 스코처 20 + 3×1
  assert.deepStrictEqual(S.calcDamage(W.scorcher.weapon, tgt('trooper'), 1), { shield: 0, hp: 23 * 256 });
  // perLevel 없으면 effect.dmgPerLevel(1): 트루퍼 8 + 2 − 방어 1
  assert.deepStrictEqual(S.calcDamage(W.trooper.weapon, tgt('trooper'), 2, 1), { shield: 0, hp: 9 * 256 });
  // 보호막 레벨: 6 − 1 = 5 → 보호막 2 흡수, 남은 3 − 기본 방어 1 = 2
  assert.deepStrictEqual(S.calcDamage({ dmg: 6, type: 'normal' }, tgt('oathblade', 2 * 256), 0, 0, 1), { shield: 512, hp: 2 * 256 });
});

test('stat: 유닛 전용 업그레이드 가산(weapon2 대상 포함)', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'] });
  const hound = S.spawn(g, 0, 'hound', 20 * S.TFP, 20 * S.TFP);
  const strider = S.spawn(g, 0, 'strider', 22 * S.TFP, 20 * S.TFP);
  const foe = S.spawn(g, 1, 'hound', 40 * S.TFP, 40 * S.TFP);
  assert.strictEqual(S.stat(g, hound, 'speed'), 4.75);
  g.players[0].up.legion_hound_speed = 1;
  g.players[0].up.legion_strider_range = 1;
  assert.strictEqual(S.stat(g, hound, 'speed'), 7.25);
  assert.strictEqual(S.stat(g, foe, 'speed'), 4.75);
  assert.strictEqual(S.stat(g, strider, 'range', 'weapon2'), 256);
  assert.strictEqual(S.stat(g, strider, 'range'), 160);
  assert.strictEqual(S.stat(g, hound, 'sight'), 8);
});

test('연구/변태/부속: 사유 코드와 생산 차단', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'swarm'] });
  const p = g.players[0];
  const ws = S.spawn(g, 0, 'workshop', 20, 10), ws2 = S.spawn(g, 0, 'workshop', 20, 20);
  assert.strictEqual(S.canResearch(g, 0, ws, 'legion_infantry_weapons'), 'crystal');
  p.crystal = p.nebula = 5000;
  assert.strictEqual(S.canResearch(g, 0, ws, 'legion_vehicle_weapons'), 'tech'); // 다른 건물 연구
  S.step(g, [{ player: 0, type: 'research', ids: [ws.id], what: 'legion_infantry_weapons' }]);
  assert.strictEqual(p.crystal, 4875);
  assert.strictEqual(S.canResearch(g, 0, ws2, 'legion_infantry_weapons'), 'busy');
  // 부속: 본체 아닌 건물 / 중복 / 건설 중 생산 불가
  const hq = g.ents.find(e => e.owner === 0 && e.type === 'hq');
  assert.strictEqual(S.canAddon(g, 0, hq, 'uplink'), 'tech'); // drillhall 없음
  assert.strictEqual(S.canAddon(g, 0, ws, 'uplink'), 'tech');
  S.spawn(g, 0, 'drillhall', 30, 30);
  S.step(g, [{ player: 0, type: 'build', ids: [hq.id], what: 'uplink' }]);
  assert.strictEqual(S.canTrain(g, 0, hq, 'engineer'), 'busy');
  assert.strictEqual(S.canAddon(g, 0, hq, 'uplink'), 'addon');
  assert.strictEqual(S.canPlace(g, 0, 'uplink', 40, 40), 'tech'); // 일꾼은 부속을 못 짓는다
  // 본체가 죽어도 부속은 남는다
  const ul = g.ents.find(e => e.type === 'uplink');
  hq.hp = 0; S.step(g, []);
  assert(S.byId(g, ul.id) && ul.main === 0);
});

test('변태 중 생산 불가, 상위 건물이 하위 요구 충족', () => {
  const g = S.createGame({ seed: 1, races: ['swarm', 'legion'] });
  g.players[0].crystal = g.players[0].nebula = 5000;
  const nest = g.ents.find(e => e.owner === 0 && e.type === 'nest');
  assert.strictEqual(S.canMorph(g, 0, nest, 'grandnest'), 'tech'); // vat 없음
  assert.strictEqual(S.canMorph(g, 0, nest, 'apexnest'), 'tech'); // 계보 건너뛰기 불가
  S.spawn(g, 0, 'vat', 16, 13);
  S.step(g, [{ player: 0, type: 'morph', ids: [nest.id], what: 'grandnest' }]);
  assert.strictEqual(S.canTrain(g, 0, nest, 'drudge'), 'busy');
  assert.strictEqual(nest.type, 'nest');
  assert(S.hasTech(g, 0, 'nest') && !S.hasTech(g, 0, 'grandnest'));
  for (let i = 0; i < S.D.buildings.grandnest.time; i++) S.step(g, []);
  assert.strictEqual(nest.type, 'grandnest');
  assert.strictEqual(nest.hp, nest.hpMax);
  assert(S.hasTech(g, 0, 'grandnest'));
  assert.strictEqual(S.canPlace(g, 0, 'roost', 16, 16), ''); // roost requires grandnest
  assert.strictEqual(S.canTrain(g, 0, nest, 'drudge'), '');
});

// ── N명 안전망: 1:1 고정 스크립트 1000틱 체크섬 ──
function pinRun(map, seed = 42) {
  const g = S.createGame({ seed, races: ['legion', 'swarm'], map });
  const near = (p, what) => { // 본진 근처 첫 설치 가능 타일(나선)
    const b = g.ents.find(e => e.owner === p && e.isB);
    for (let r = 4; r < 20; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (S.canPlace(g, p, what, b.tx + dx, b.ty + dy) === '') return [b.tx + dx, b.ty + dy];
    }
    return null;
  };
  const w1 = g.ents.filter(e => e.owner === 1 && e.def.worker).map(w => [w.id, w.x, w.y]);
  let built = false;
  for (let t = 0; t < 1000; t++) {
    const cmds = [];
    if (t === 0) for (let p = 0; p < 2; p++) {
      const ws = g.ents.filter(e => e.owner === p && e.def.worker);
      const d = c => Math.abs(c.x - ws[0].x) + Math.abs(c.y - ws[0].y);
      const c = g.ents.filter(e => e.type === 'crystal').reduce((a, b) => (d(b) < d(a) ? b : a)); // 최소 거리, 동률은 앞(id 작은) 것
      cmds.push({ player: p, type: 'gather', ids: ws.map(w => w.id), target: c.id });
    }
    if (t === 300) { g.players[0].crystal += 400; const at = near(0, 'garrison'); const w = g.ents.find(e => e.owner === 0 && e.def.worker);
      if (at) { built = true; cmds.push({ player: 0, type: 'build', ids: [w.id], what: 'garrison', tx: at[0], ty: at[1] }); } }
    if (t === 600) { const ws = g.ents.filter(e => e.owner === 1 && e.def.worker).slice(0, 3); const eb = g.ents.find(e => e.owner === 0 && e.isB);
      cmds.push({ player: 1, type: 'attackMove', ids: ws.map(w => w.id), x: eb.x, y: eb.y }); }
    S.step(g, cmds);
  }
  const moved = w1.some(([id, x, y]) => { const e = S.byId(g, id); return !e || e.x !== x || e.y !== y; });
  return { ck: S.checksum(g), g, built, moved };
}
// 명단 헬퍼(Task 5·6 재사용): 팀 번호 나열 → players
const roster = (...ts) => ts.map((team, i) => ({ race: ['legion', 'swarm', 'elysian', 'legion'][i], team, slot: i, color: i }));
const quadMap = () => { S.D.maps.__q4 = { name: 'q', desc: '', rocks: [],
  starts: [{ tx: 10, ty: 10 }, { tx: 114, ty: 114 }, { tx: 114, ty: 10, flip: 1 }, { tx: 10, ty: 114, flip: 2 }], expansions: [] }; return '__q4'; };

test('명단: 4명 2:2, 기지가 각 자리에, 보급 개별', () => {
  const map = quadMap();
  try {
    const g = S.createGame({ seed: 1, map, players: roster(0, 1, 0, 1) });
    assert.strictEqual(g.players.length, 4);
    for (let p = 0; p < 4; p++) {
      const b = g.ents.find(e => e.owner === p && e.isB);
      assert.deepStrictEqual([b.tx, b.ty], [g.map.starts[p].tx, g.map.starts[p].ty]);
      assert(g.players[p].supplyMax2 > 0);
    }
    assert(S.isEnemy(g, 0, 1) && !S.isEnemy(g, 0, 2) && !S.isEnemy(g, 0, 0) && !S.isEnemy(g, 0, -1));
    assert.strictEqual(g.fog[0], g.fog[2]); assert.notStrictEqual(g.fog[0], g.fog[1]);
    const b2 = g.ents.find(e => e.owner === 2 && e.isB);
    assert(S.visible(g, 0, b2), '팀원 기지가 보인다');
  } finally { delete S.D.maps.__q4; }
});

test('팀: 같은 팀 유닛은 공격 명령을 받아도 때리지 않는다', () => {
  const map = quadMap();
  try {
    const g = S.createGame({ seed: 1, map, players: roster(0, 1, 0, 1) });
    const a = S.spawn(g, 0, 'trooper', 60 * S.TFP, 60 * S.TFP), f = S.spawn(g, 2, 'trooper', 61 * S.TFP, 60 * S.TFP);
    S.step(g, [{ player: 0, type: 'attack', ids: [a.id], target: f.id }]);
    for (let i = 0; i < 100; i++) S.step(g, []);
    assert.strictEqual(f.hp, f.hpMax);
  } finally { delete S.D.maps.__q4; }
});

test('명단: 잘못된 명단은 거부', () => {
  assert.throws(() => S.createGame({ seed: 1, players: [{ race: 'legion', team: 0, slot: 0, color: 0 }] }), /roster/);
  assert.throws(() => S.createGame({ seed: 1, players: roster(0, 1).map(p => ({ ...p, slot: 0 })) }), /roster/);
});

test('명단: 2인 맵(players 2)은 시작 후보 4곳 중 아무 두 자리, 3명 이상은 거부', () => {
  for (const map of TWO) {
    assert.throws(() => S.createGame({ seed: 1, map, players: roster(0, 1, 2) }), /roster/, map);
    assert.throws(() => S.createGame({ seed: 1, map, players: roster(0, 1).map((p, i) => ({ ...p, slot: 4 + i })) }), /roster/, map);
    const g = S.createGame({ seed: 1, map, players: roster(0, 1).map((p, i) => ({ ...p, slot: 2 + i })) });
    for (let p = 0; p < 2; p++) {
      const b = g.ents.find(e => e.owner === p && e.isB);
      assert.deepStrictEqual([b.tx, b.ty], [g.map.starts[2 + p].tx, g.map.starts[2 + p].ty], map);
    }
  }
});

// expanse·ring·bonanza는 Task 6 4인 개조로 재고정, fortress 추가. 6개 2인 맵은 Task 6b(시작 후보 4곳)로 재고정.
// 3a Task 1: 체크섬에 마나·상태·모드·g.fx 필드와 3a 업그레이드가 들어가 전부 재고정(이후 3a 동안 불변).
// main 수치 재조정(5bbc37e, ×1.25·채집 10·시작 65) 병합 + 3a 신규 수치 재조정으로 재고정.
// 3a 최종 리뷰: 체크섬에 소환 플래그(free) 추가로 재고정(동작 변화 없음 — 플래그 빼면 이전 값 그대로).
// 3b: 연구 id 8개 추가(체크섬 UP_IDS) — 진행 동일.
// 정체성 §6(자동 정박·변이·공명·처치 유충): 체크섬에 still·kills·lastById 추가로 재고정(1:1 1000틱 동작 변화 없음 — 세 필드 빼면 이전 값 그대로).
// 시작 위치 공정성: 본진 4×3 거울 좌표(ty 114→115 등)·시작 일꾼/생산 출구를 자리 flip 으로 뒤집음 → 초기 배치가 달라져 전부 재고정.
const PINS = { crossing: 3915845220, narrows: 4022083681, expanse: 3847071265, gate: 278154116, isles: 152592420, maze: 3789779726, ring: 308126574, diagonal: 4069649429, bonanza: 3143952152, fortress: 3999234630 };
for (const map of Object.keys(PINS)) test(`안전망: ${map} 1:1 1000틱 체크섬 고정`, () => {
  const a = pinRun(map), b = pinRun(map);
  assert.strictEqual(a.ck, b.ck, '결정론');
  assert(a.built, '건설 위치를 찾음');
  assert(a.g.ents.some(e => e.owner === 0 && e.type === 'garrison'), '병영 건설 시작');
  assert(a.g.players[0].crystal > 65, '채집 수익');
  assert(a.moved, '1번 일꾼 이동');
  assert.strictEqual(a.ck, PINS[map], map);
});

test('맵 크기: 160 맵에서 생성·길찾기·안개·클램프', () => {
  S.D.maps.__t160 = { name: 't', desc: '', w: 160, h: 160, rocks: [[70, 0, 4, 60]],
    starts: [{ tx: 10, ty: 10 }, { tx: 146, ty: 146 }], expansions: [] };
  try {
    const g = S.createGame({ seed: 1, races: ['legion', 'legion'], map: '__t160' });
    assert.strictEqual(g.map.rock.length, 160 * 160);
    const u = g.ents.find(e => e.owner === 0 && !e.isB);
    S.step(g, [{ player: 0, type: 'move', ids: [u.id], x: 155 * S.TFP, y: 5 * S.TFP }]);
    for (let i = 0; i < 2000; i++) S.step(g, []);
    assert(Math.floor(u.x / S.TFP) > 140, `x tile ${Math.floor(u.x / S.TFP)}`); // 바위 벽을 돌아 128 너머까지
    assert.strictEqual(g.fog[0][5 * 160 + Math.floor(u.x / S.TFP)], 2);
    assert.strictEqual(S.MAP, undefined);
  } finally { delete S.D.maps.__t160; }
});

let fail = 0;
test('안개: 본진 근처 보임, 반대편 미탐색', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'] });
  S.step(g, []);
  assert.strictEqual(g.fog[0][12 * g.map.w + 12], 2);
  assert.strictEqual(g.fog[0][115 * g.map.w + 115], 0);
});

// ── Task 4: 무기 확장 · 방어 건물 · 함재기 ──
test('무기: 스트라이더는 공중을 쏘고 트루퍼도 공중을 쏜다(대공 플래그)', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'swarm'] });
  const st = S.spawn(g, 0, 'strider', 40 * S.TFP, 60 * S.TFP);
  const ws = S.spawn(g, 1, 'wingsting', 40 * S.TFP, 64 * S.TFP);
  for (let i = 0; i < 400; i++) S.step(g, []);
  assert(!S.byId(g, ws.id) || ws.hp < ws.hpMax);
});

test('무기: 스플래시는 주변 적까지 맞힌다', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'swarm'] });
  const sc = S.spawn(g, 0, 'scorcher', 40 * S.TFP, 60 * S.TFP);
  const a = S.spawn(g, 1, 'skitter', 40 * S.TFP, 61 * S.TFP);
  const b = S.spawn(g, 1, 'skitter', 41 * S.TFP, 61 * S.TFP);
  S.step(g, [{ player: 0, type: 'attack', ids: [sc.id], target: a.id }]);
  for (let i = 0; i < 60; i++) S.step(g, []);
  assert(b.hp < b.hpMax);
});

test('방어 건물: 토치카가 사거리 안 적을 쏜다', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'swarm'] });
  S.spawn(g, 0, 'pillbox', 40, 60);
  const s = S.spawn(g, 1, 'skitter', 41 * S.TFP, 63 * S.TFP);
  S.step(g, [{ player: 1, type: 'hold', ids: [s.id] }]);
  for (let i = 0; i < 200; i++) S.step(g, []);
  assert(!S.byId(g, s.id) || s.hp < s.hpMax);
});

test('함재기: 아크가 스파크를 채우고 교전 시 사출한다', () => {
  const g = S.createGame({ seed: 1, races: ['elysian', 'legion'] });
  g.players[0].crystal = 5000;
  const ark = S.spawn(g, 0, 'ark', 40 * S.TFP, 60 * S.TFP);
  for (let i = 0; i < S.D.units.ark.launcher.build * 3 + 10; i++) S.step(g, []);
  assert(ark.hangar >= 3);
  S.spawn(g, 1, 'trooper', 40 * S.TFP, 66 * S.TFP);
  for (let i = 0; i < 60; i++) S.step(g, []);
  assert(g.ents.some(e => e.type === 'spark' && e.parent === ark.id));
});

test('무기: 튕김 — 96px 안 다음 적에게 1/3, 그다음 1/9, 대상마다 attack 이벤트', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'swarm'] });
  const ws = S.spawn(g, 1, 'wingsting', 40 * S.TFP, 60 * S.TFP);
  const a = S.spawn(g, 0, 'trooper', 40 * S.TFP, 62 * S.TFP);
  const b = S.spawn(g, 0, 'trooper', 41 * S.TFP, 62 * S.TFP);
  const c = S.spawn(g, 0, 'trooper', 42 * S.TFP, 62 * S.TFP);
  const far = S.spawn(g, 0, 'trooper', 46 * S.TFP, 62 * S.TFP); // 96px 밖
  const ev = S.step(g, [{ player: 1, type: 'attack', ids: [ws.id], target: a.id }, { player: 0, type: 'stop', ids: [a.id, b.id, c.id, far.id] }]);
  const mine = ev.filter(x => x.t === 'attack' && x.a === ws.id).map(x => x.b);
  assert.deepStrictEqual(mine, [a.id, b.id, c.id]);
  assert.strictEqual(a.hpMax - a.hp, 11 * 256);
  assert.strictEqual(b.hpMax - b.hp, Math.floor(11 * 256 / 3));
  assert.strictEqual(c.hpMax - c.hp, Math.floor(11 * 256 / 9));
  assert.strictEqual(far.hp, far.hpMax);
});

test('무기: 자폭 — 버스터는 데미지 후 사라지고 보급 반환', () => {
  const g = S.createGame({ seed: 1, races: ['swarm', 'legion'] });
  const bu = S.spawn(g, 0, 'burster', 40 * S.TFP, 60 * S.TFP);
  const ph = S.spawn(g, 1, 'phantom', 40 * S.TFP + 20 * S.FP, 60 * S.TFP);
  const used = g.players[0].supplyUsed2;
  const ev = S.step(g, [{ player: 0, type: 'attack', ids: [bu.id], target: ph.id }]);
  assert(ev.some(x => x.t === 'attack' && x.a === bu.id && x.b === ph.id));
  assert(!S.byId(g, bu.id));
  assert(ev.some(x => x.t === 'death' && x.id === bu.id));
  assert.strictEqual(ph.hpMax - ph.hp, 138 * 256);
  assert.strictEqual(g.players[0].supplyUsed2, used - 1);
  // 지상 대상은 불가(air 전용)
  const bu2 = S.spawn(g, 0, 'burster', 50 * S.TFP, 60 * S.TFP);
  const tr = S.spawn(g, 1, 'trooper', 50 * S.TFP, 61 * S.TFP);
  S.step(g, [{ player: 0, type: 'attack', ids: [bu2.id], target: tr.id }]);
  assert(!bu2.order || bu2.order.target !== tr.id);
});

test('무기: 두 무기 — 대상 종류에 맞는 무기와 그 무기의 쿨다운', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'swarm'] });
  const st = S.spawn(g, 0, 'strider', 40 * S.TFP, 60 * S.TFP);
  const ws = S.spawn(g, 1, 'wingsting', 40 * S.TFP, 63 * S.TFP);
  const sk = S.spawn(g, 1, 'skitter', 60 * S.TFP, 60 * S.TFP);
  g.tick = 1; // 스웜 hp 재생(tick % 40 === 0)이 측정에 섞이지 않게
  S.step(g, [{ player: 0, type: 'attack', ids: [st.id], target: ws.id }, { player: 1, type: 'stop', ids: [ws.id] }]);
  assert.strictEqual(ws.hpMax - ws.hp, Math.floor(25 * 256 * 60 / 100)); // weapon2: 25 폭발 vs 소형
  assert(st.cd2 > 0 && st.cd === 0);
  const st2 = S.spawn(g, 0, 'strider', 60 * S.TFP, 62 * S.TFP);
  S.step(g, [{ player: 0, type: 'attack', ids: [st2.id], target: sk.id }]);
  assert.strictEqual(sk.hpMax - sk.hp, 15 * 256); // weapon: 15 일반
  assert(st2.cd > 0 && st2.cd2 === 0);
  // 공중 전용 무기 건물은 지상을 못 쏜다
  const fl = S.spawn(g, 0, 'flak', 80, 60);
  const sk2 = S.spawn(g, 1, 'skitter', 81 * S.TFP, 63 * S.TFP);
  S.step(g, [{ player: 1, type: 'hold', ids: [sk2.id] }]);
  for (let i = 0; i < 40; i++) S.step(g, []);
  assert.strictEqual(sk2.hp, sk2.hpMax);
});

test('함재기: 파쇄구는 1회용 자폭 — 귀환·격납 없음, 부모 사망 시 자식도 사망', () => {
  const g = S.createGame({ seed: 1, races: ['elysian', 'legion'] });
  g.players[0].crystal = 0;
  const cr = S.spawn(g, 0, 'crucible', 40 * S.TFP, 60 * S.TFP);
  cr.hangar = 1;
  const tr = S.spawn(g, 1, 'trooper', 40 * S.TFP, 64 * S.TFP);
  S.step(g, [{ player: 1, type: 'hold', ids: [tr.id] }]);
  let launched = false, exploded = false;
  for (let i = 0; i < 200 && !exploded; i++) {
    const ev = S.step(g, []);
    if (g.ents.some(e => e.type === 'shard' && e.parent === cr.id)) launched = true;
    if (ev.some(x => x.t === 'attack' && x.splash && S.D.units.shard && x.b === tr.id)) exploded = true;
  }
  assert(launched && exploded);
  S.step(g, []);
  assert(!g.ents.some(e => e.type === 'shard'));
  assert.strictEqual(cr.hangar, 0);
  assert(!S.byId(g, tr.id));
  // 스파크: 교전 끝나면 귀환·격납, 부모 사망 시 자식 사망
  const ark = S.spawn(g, 0, 'ark', 80 * S.TFP, 60 * S.TFP);
  ark.hangar = 2;
  const t2 = S.spawn(g, 1, 'engineer', 80 * S.TFP, 65 * S.TFP);
  for (let i = 0; i < 40; i++) S.step(g, []);
  assert.strictEqual(g.ents.filter(e => e.parent === ark.id).length, 2);
  t2.hp = 0;
  for (let i = 0; i < 200; i++) S.step(g, []);
  assert.strictEqual(g.ents.filter(e => e.parent === ark.id).length, 0);
  assert.strictEqual(ark.hangar, 2);
  const t3 = S.spawn(g, 1, 'engineer', 80 * S.TFP, 65 * S.TFP);
  for (let i = 0; i < 20; i++) S.step(g, []);
  const kids = g.ents.filter(e => e.parent === ark.id);
  assert(kids.length > 0);
  ark.hp = 0;
  const ev = S.step(g, []);
  assert(!g.ents.some(e => e.parent === ark.id));
  for (const k of kids) assert(ev.some(x => x.t === 'death' && x.id === k.id));
  void t3;
});

test('방어 건물: 엘리시안 포탑은 공명장 밖이면 정지(powered)', () => {
  const g = S.createGame({ seed: 1, races: ['elysian', 'swarm'] });
  const ws = S.spawn(g, 0, 'wardspire', 40, 60);
  const s = S.spawn(g, 1, 'skitter', 41 * S.TFP, 63 * S.TFP);
  assert.strictEqual(S.powered(g, ws), false);
  S.step(g, [{ player: 1, type: 'hold', ids: [s.id] }]);
  for (let i = 0; i < 60; i++) S.step(g, []);
  assert.strictEqual(s.hp, s.hpMax);
  S.spawn(g, 0, 'resonator', 43, 60); // 중심 거리 정확히 3타일(레이 라인 기둥 반경 경계 포함)
  assert.strictEqual(S.powered(g, ws), true);
  assert.strictEqual(S.powered(g, g.ents.find(e => e.type === 'sanctum' && e.owner === 0)), true);
  for (let i = 0; i < 60; i++) S.step(g, []);
  assert(!S.byId(g, s.id) || s.hp < s.hpMax);
});

test('레이 라인: nearSeg 정수 선분 거리(투영 안 = 외적², 밖 = 끝점 거리, 길이 0)', () => {
  // 선분 (0,0)-(20,0), r = 4 (반타일 단위)
  assert.strictEqual(S.nearSeg(10, 4, 0, 0, 20, 0, 4), true);   // 수직 거리 정확히 r
  assert.strictEqual(S.nearSeg(10, 5, 0, 0, 20, 0, 4), false);
  assert.strictEqual(S.nearSeg(10, -4, 0, 0, 20, 0, 4), true);
  assert.strictEqual(S.nearSeg(-3, 0, 0, 0, 20, 0, 4), true);   // A 바깥: 끝점 거리 3
  assert.strictEqual(S.nearSeg(-3, 3, 0, 0, 20, 0, 4), false);  // 끝점 거리 √18 > 4 (투영 연장선 위라도 안 됨)
  assert.strictEqual(S.nearSeg(24, 0, 0, 0, 20, 0, 4), true);   // B 바깥
  assert.strictEqual(S.nearSeg(25, 0, 0, 0, 20, 0, 4), false);
  // 대각선 (0,0)-(12,16), 길이 20: 점 (6+4·0.8, 8−4·0.6) = (9.2, 5.6) ≈ 거리 4 → 정수 근방
  // 대각선 (0,0)-(12,16), 길이 20: 거리 = |cross| / 20
  assert.strictEqual(S.nearSeg(10, 5, 0, 0, 12, 16, 4), false); // |10·16 − 5·12| = 100 → 5
  assert.strictEqual(S.nearSeg(9, 6, 0, 0, 12, 16, 4), true);   // |9·16 − 6·12| = 72 → 3.6
  assert.strictEqual(S.nearSeg(10, 7, 0, 0, 12, 16, 4), true);  // |160 − 84| = 76 → 3.8
  assert.strictEqual(S.nearSeg(3, 3, 3, 3, 3, 3, 0), true);     // 길이 0 선분 = 점
  assert.strictEqual(S.nearSeg(4, 3, 3, 3, 3, 3, 0), false);
});

function leyGame() { // 기둥 둘(조율 기둥, 12타일 = 중심 반타일 24 떨어짐, 연결 14 이내)
  const g = S.createGame({ seed: 1, races: ['elysian', 'swarm'] });
  g.players[0].crystal = 5000; g.players[0].nebula = 5000;
  const a = S.spawn(g, 0, 'resonator', 40, 60), b = S.spawn(g, 0, 'resonator', 52, 60);
  return { g, a, b };
}
test('레이 라인: 기둥 사이 선 위(폭 2)는 건설 가능·가동, 선 밖·연결 안 된 기둥 사이는 power', () => {
  const { g, a } = leyGame();
  const net = S.powerNet(g, 0);
  assert.deepStrictEqual(net.pylons.filter(p => p.id === a.id).map(p => [p.x2, p.y2, p.r2, p.link2, p.w2]), [[82, 122, 6, 28, 4]]);
  assert(net.links.some(([i, j]) => net.pylons[i].id === a.id || net.pylons[j].id === a.id), 'linked');
  // 공명 관문 4×3: (45, 59) 중심 (94, 121) — 기둥 원(3타일) 밖, 선에서 0.5타일 → 선 위
  assert.strictEqual(S.canPlace(g, 0, 'portal', 45, 59), '');
  assert.strictEqual(S.inNet(net, 'portal', 45, 59), true);
  // 중심 y2 = 2·61+3 = 125 → 선에서 1.5타일(가능) / 2·62+3 = 127 → 2.5타일(불가)
  assert.strictEqual(S.canPlace(g, 0, 'portal', 45, 61), '');
  assert.strictEqual(S.canPlace(g, 0, 'portal', 45, 62), 'power');
  // 기둥 원 안(반경 3) — 선 끝 바깥(선분 띠는 끝점 거리 2.5타일로 밖)
  assert.strictEqual(S.canPlace(g, 0, 'anvil', 37, 60), '');
  assert.strictEqual(S.canPlace(g, 0, 'anvil', 36, 60), 'power');
  // 기둥 사이가 14타일 초과면 연결 없음 → 가운데는 power
  const g2 = S.createGame({ seed: 1, races: ['elysian', 'swarm'] });
  g2.players[0].crystal = 5000;
  S.spawn(g2, 0, 'resonator', 38, 60); S.spawn(g2, 0, 'resonator', 54, 60); // 16타일
  assert.strictEqual(S.powerNet(g2, 0).links.filter(([i, j]) => S.powerNet(g2, 0).pylons[i].x2 >= 76 && S.powerNet(g2, 0).pylons[j].x2 >= 76).length, 0);
  assert.strictEqual(S.canPlace(g2, 0, 'portal', 45, 59), 'power');
  // 미완성 기둥은 기둥이 아니다
  const g3 = S.createGame({ seed: 1, races: ['elysian', 'swarm'] });
  g3.players[0].crystal = 5000;
  S.spawn(g3, 0, 'resonator', 40, 60); const c = S.spawn(g3, 0, 'resonator', 52, 60); c.buildLeft = 10;
  assert.strictEqual(S.canPlace(g3, 0, 'portal', 45, 59), 'power');
});
test('레이 라인: 기둥 하나가 부서지면 그 선 위 건물이 정지(unpowered), 다시 세우면 복구', () => {
  const { g, b } = leyGame();
  const pt = S.spawn(g, 0, 'portal', 45, 59);
  S.step(g, []);
  assert.strictEqual(pt.unpowered, false);
  b.hp = 0;
  S.step(g, []); // deaths에서 제거
  S.step(g, []); // 다음 틱 power에서 반영
  assert(!S.byId(g, b.id));
  assert.strictEqual(pt.unpowered, true);
  assert.strictEqual(S.powered(g, pt), false);
  assert.strictEqual(S.canPlace(g, 0, 'portal', 45, 63), 'power');
  S.spawn(g, 0, 'resonator', 52, 60);
  S.step(g, []);
  assert.strictEqual(pt.unpowered, false);
});
test('레이 라인: 결정론 — 같은 장면 두 번 매 틱 체크섬 일치, 캐시가 기둥 사망을 즉시 반영', () => {
  const run = () => {
    const { g, b } = leyGame(); S.spawn(g, 0, 'portal', 45, 59); const out = [];
    for (let t = 0; t < 40; t++) { if (t === 20) b.hp = 0; S.step(g, []); out.push(S.checksum(g)); }
    return out;
  };
  assert.deepStrictEqual(run(), run());
  const { g, b } = leyGame();
  const n1 = S.powerNet(g, 0); assert.strictEqual(S.powerNet(g, 0), n1); // 기둥 그대로면 재사용
  g.ents.splice(g.ents.indexOf(b), 1);                                    // 틱 중간 제거
  assert.notStrictEqual(S.powerNet(g, 0), n1);
  assert.strictEqual(S.inNet(S.powerNet(g, 0), 'portal', 45, 59), false);
});

test('data2: 엘리시안 보호막 업그레이드(대장간, shieldPerLevel 1)가 데미지에 반영', () => {
  const u = Object.values(D.upgrades).find(x => x.race === 'elysian' && x.effect.shieldPerLevel);
  assert(u && u.at === 'anvil' && u.levels === 3 && u.effect.shieldPerLevel === 1);
  const g = S.createGame({ seed: 1, races: ['legion', 'elysian'] });
  const tr = S.spawn(g, 0, 'trooper', 40 * S.TFP, 60 * S.TFP);
  const ob = S.spawn(g, 1, 'oathblade', 40 * S.TFP, 62 * S.TFP);
  g.players[1].up[u.id] = 2;
  S.step(g, [{ player: 0, type: 'attack', ids: [tr.id], target: ob.id }, { player: 1, type: 'hold', ids: [ob.id] }]);
  assert.strictEqual(ob.shieldMax - ob.shield, 6 * 256); // 8 − 보호막 2단계
});

test('전투 확장: 결정론', () => {
  const run = () => {
    const g = S.createGame({ seed: 5, races: ['elysian', 'swarm'] });
    g.players[0].crystal = 2000;
    S.spawn(g, 0, 'resonator', 44, 60); S.spawn(g, 0, 'wardspire', 40, 60);
    const ark = S.spawn(g, 0, 'ark', 50 * S.TFP, 60 * S.TFP); ark.hangar = 4;
    S.spawn(g, 0, 'crucible', 52 * S.TFP, 62 * S.TFP).hangar = 3;
    for (let i = 0; i < 4; i++) S.spawn(g, 1, 'wingsting', (48 + i) * S.TFP, 68 * S.TFP);
    for (let i = 0; i < 4; i++) S.spawn(g, 1, 'skitter', (48 + i) * S.TFP, 70 * S.TFP);
    for (let i = 0; i < 2; i++) S.spawn(g, 1, 'burster', (50 + i) * S.TFP, 72 * S.TFP);
    const sums = [];
    for (let i = 0; i < 400; i++) { S.step(g, []); sums.push(S.checksum(g)); }
    return sums;
  };
  assert.deepStrictEqual(run(), run());
});

// ── 종족 시스템 + 1단계 이월 (Task 5) ──
test('레기온: 엔지니어가 죽어도 다른 엔지니어가 건설을 재개한다', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'] });
  g.players[0].crystal = 1000;
  const [w1, w2] = g.ents.filter(e => e.owner === 0 && e.type === 'engineer');
  S.step(g, [{ player: 0, type: 'build', ids: [w1.id], what: 'depot', tx: 20, ty: 10 }]);
  for (let i = 0; i < 200; i++) S.step(g, []);
  w1.hp = 0; S.step(g, []);
  const d = g.ents.find(e => e.type === 'depot');
  S.step(g, [{ player: 0, type: 'repair', ids: [w2.id], target: d.id }]);
  for (let i = 0; i < 900; i++) S.step(g, []);
  assert(!(d.buildLeft > 0));
});

test('레기온: 체력 1/3 이하 건물은 불타 내려간다', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'] });
  const d = S.spawn(g, 0, 'depot', 20, 10);
  d.hp = Math.floor(d.hpMax / 3);
  const h0 = d.hp;
  for (let i = 0; i < 100; i++) S.step(g, []);
  assert(d.hp < h0);
});

test('엘리시안: 공명장 밖 관문은 생산하지 않는다', () => {
  const g = S.createGame({ seed: 1, races: ['elysian', 'legion'] });
  g.players[0].crystal = 1000;
  const r = S.spawn(g, 0, 'resonator', 105, 110);
  const p = S.spawn(g, 0, 'portal', 101, 108);
  S.step(g, [{ player: 0, type: 'train', ids: [p.id], what: 'oathblade' }]);
  r.hp = 0;
  for (let i = 0; i < S.D.units.oathblade.time + 50; i++) S.step(g, []);
  assert.strictEqual(g.ents.filter(e => e.type === 'oathblade').length, 0);
});

test('띄우기: 병영을 띄워 옮겨 착륙', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'] });
  const b = S.spawn(g, 0, 'garrison', 20, 14);
  S.step(g, [{ player: 0, type: 'lift', ids: [b.id] }]);
  for (let i = 0; i < 40; i++) S.step(g, []);
  S.step(g, [{ player: 0, type: 'land', ids: [b.id], tx: 30, ty: 20 }]);
  for (let i = 0; i < 600; i++) S.step(g, []);
  assert.strictEqual(b.tx, 30); assert(!b.lifted);
});

test('레기온 수리: 건물·기계 유닛을 비용(최대 hp 대비 1/3) 비례로 수리, 보병은 불가', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'] });
  g.players[0].crystal = 1000;
  const w = g.ents.find(e => e.owner === 0 && e.type === 'engineer');
  const d = S.spawn(g, 0, 'depot', 20, 10);
  d.hp = d.hpMax >> 1;
  S.step(g, [{ player: 0, type: 'repair', ids: [w.id], target: d.id }]);
  for (let i = 0; i < 800 && w.order; i++) S.step(g, []);
  assert.strictEqual(d.hp, d.hpMax); assert.strictEqual(w.order, null);
  assert.strictEqual(1000 - g.players[0].crystal, 21); // ceil(125/3 × 1/2)
  const hd = S.spawn(g, 0, 'hound', 16 * S.TFP, 20 * S.TFP);
  hd.hp = 256;
  const c0 = g.players[0].crystal;
  S.step(g, [{ player: 0, type: 'repair', ids: [w.id], target: hd.id }]);
  for (let i = 0; i < 800 && w.order; i++) S.step(g, []);
  assert.strictEqual(hd.hp, hd.hpMax); assert(c0 - g.players[0].crystal > 0 && c0 - g.players[0].crystal <= 32);
  const tr = S.spawn(g, 0, 'trooper', 16 * S.TFP, 22 * S.TFP);
  tr.hp = 256;
  S.step(g, [{ player: 0, type: 'repair', ids: [w.id], target: tr.id }]);
  assert(!w.order || w.order.type !== 'repair');
});

test('레기온 수리: 자원이 없으면 수리를 멈춘다', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'] });
  g.players[0].crystal = 0;
  const w = g.ents.find(e => e.owner === 0 && e.type === 'engineer');
  const d = S.spawn(g, 0, 'depot', 20, 10);
  d.hp = d.hpMax >> 1;
  const h0 = d.hp;
  S.step(g, [{ player: 0, type: 'repair', ids: [w.id], target: d.id }]);
  for (let i = 0; i < 400; i++) S.step(g, []);
  assert.strictEqual(d.hp, h0); assert.strictEqual(w.order, null); // 첫 단위 비용을 못 내 즉시 중단
});

test('화재: 0까지 타면 파괴, 수리로 1/3 넘기면 멈춤', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'] });
  const d = S.spawn(g, 0, 'depot', 20, 10);
  d.hp = 2 * 256;
  for (let i = 0; i < 60; i++) S.step(g, []);
  assert(!g.ents.includes(d));
  const d2 = S.spawn(g, 0, 'depot', 30, 10);
  d2.hp = Math.floor(d2.hpMax / 3) + 1;
  const h = d2.hp;
  for (let i = 0; i < 100; i++) S.step(g, []);
  assert.strictEqual(d2.hp, h);
});

test('띄우기: 생산 중단(진행 유지)·부속 분리·발밑 비움, 대공만 공격 가능, 승패 건물 수 포함', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'] });
  g.players[0].crystal = 1000;
  const b = S.spawn(g, 0, 'motorpool', 20, 14), a = S.spawn(g, 0, 'garage', 24, 15);
  a.main = b.id; b.addon = a.id;
  S.step(g, [{ player: 0, type: 'train', ids: [b.id], what: 'hound' }]);
  S.step(g, [{ player: 0, type: 'lift', ids: [b.id] }]);
  const left = b.queue[0].left;
  for (let i = 0; i < 50; i++) S.step(g, []);
  assert(b.lifted); assert.strictEqual(b.queue[0].left, left);
  assert.strictEqual(b.addon, 0); assert.strictEqual(a.main, 0); assert(g.ents.includes(a));
  assert(S.walkable(g, 21, 15));
  assert(S.canTrain(g, 0, b, 'hound'));
  g.ents = g.ents.filter(e => e.owner !== 0 || e.isB); // 일꾼(비공격 지상)이 건물보다 자동 대상 우선이라 치운다
  const hd = S.spawn(g, 1, 'hound', b.x + 2 * S.TFP, b.y);
  const tr = S.spawn(g, 1, 'trooper', b.x - 2 * S.TFP, b.y);
  for (let i = 0; i < 20; i++) S.step(g, []);
  assert(!hd.order || hd.order.target !== b.id); // 지상 전용 무기
  assert(tr.order && tr.order.target === b.id);   // 대공 무기
  // 착륙 불가 자리(바위)면 공중에 남는다
  S.step(g, [{ player: 0, type: 'land', ids: [b.id], tx: 56, ty: 28 }]);
  for (let i = 0; i < 1500; i++) S.step(g, []);
  assert(b.lifted); assert.strictEqual(b.order, null); // 도착 후 착륙 실패 → 명령 취소
});

test('건물 배치 시 발밑 유닛을 가장 가까운 빈 타일로 밀어낸다', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'] });
  const u = S.spawn(g, 0, 'trooper', 41 * S.TFP + 100, 41 * S.TFP + 100);
  S.spawn(g, 0, 'depot', 40, 40);
  const tx = Math.floor(u.x / S.TFP), ty = Math.floor(u.y / S.TFP);
  assert(S.walkable(g, tx, ty), `unit at ${tx},${ty}`);
  assert(Math.abs(tx - 41) + Math.abs(ty - 41) <= 2);
});

test('채집: 수정 고갈 제거가 같은 틱 다음 엔티티를 건너뛰지 않는다', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'] });
  const [a, b] = g.ents.filter(e => e.owner === 0 && e.type === 'engineer');
  const [c1, c2] = g.ents.filter(e => e.type === 'crystal');
  c1.amount = 10;
  a.order = { type: 'gather', res: c1.id, kind: 0, phase: 'mine', t: 1, moving: false, issued: false, x: c1.x, y: c1.y };
  b.order = { type: 'gather', res: c2.id, kind: 0, phase: 'mine', t: 1, moving: false, issued: false, x: c2.x, y: c2.y };
  assert.strictEqual(g.ents.indexOf(b), g.ents.indexOf(a) + 1);
  S.step(g, []);
  assert(!g.ents.includes(c1)); assert.strictEqual(a.carry, 10); assert.strictEqual(b.carry, 10);
});

test('채집·건설: 도착 근접 판정 실패(접근 불가) 시 명령 취소', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'] });
  const w = g.ents.find(e => e.owner === 0 && e.type === 'engineer');
  const c = S.spawn(g, -1, 'crystal', 40, 40);
  for (let y = 39; y <= 41; y++) for (let x = 39; x <= 42; x++) if (!(y === 40 && (x === 40 || x === 41))) g.map.rock[y * g.map.w + x] = 1;
  S.step(g, [{ player: 0, type: 'gather', ids: [w.id], target: c.id }]);
  for (let i = 0; i < 300; i++) S.step(g, []);
  assert.strictEqual(w.order, null); assert.strictEqual(w.carry, 0);
});

test('체크섬: lifted·unpowered·order 전 필드·건물 타일 좌표를 반영', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'elysian'] });
  const w = g.ents.find(e => e.owner === 0 && e.type === 'engineer');
  const b = S.spawn(g, 0, 'garrison', 20, 14);
  const base = S.checksum(g);
  const diff = (fn, undo) => { fn(); const h = S.checksum(g); undo(); assert.notStrictEqual(h, base); assert.strictEqual(S.checksum(g), base); };
  diff(() => { b.lifted = true; }, () => { b.lifted = false; });
  diff(() => { b.unpowered = true; }, () => { b.unpowered = false; });
  diff(() => { b.tx = 21; }, () => { b.tx = 20; });
  w.order = { type: 'gather', res: 5, kind: 0, phase: 'to', t: 0, moving: false, issued: false, x: 1, y: 1 };
  const base2 = S.checksum(g);
  w.order.phase = 'mine'; assert.notStrictEqual(S.checksum(g), base2); w.order.phase = 'to';
  w.order.res = 6; assert.notStrictEqual(S.checksum(g), base2); w.order.res = 5;
  w.order.issued = true; assert.notStrictEqual(S.checksum(g), base2);
});

test('종족 시스템: 결정론', () => {
  const run = () => {
    const g = S.createGame({ seed: 9, races: ['legion', 'elysian'] });
    g.players[0].crystal = 2000; g.players[1].crystal = 2000;
    const ws = g.ents.filter(e => e.owner === 0 && e.type === 'engineer');
    const gar = S.spawn(g, 0, 'garrison', 20, 14), d = S.spawn(g, 0, 'depot', 26, 10);
    d.hp = Math.floor(d.hpMax / 4);
    const r = S.spawn(g, 1, 'resonator', 105, 110); S.spawn(g, 1, 'portal', 101, 108);
    const sums = [];
    for (let i = 0; i < 500; i++) {
      const cmds = [];
      if (i === 1) cmds.push({ player: 0, type: 'repair', ids: [ws[0].id], target: d.id }, { player: 0, type: 'lift', ids: [gar.id] });
      if (i === 5) cmds.push({ player: 0, type: 'land', ids: [gar.id], tx: 30, ty: 20 }, { player: 0, type: 'build', ids: [ws[1].id], what: 'depot', tx: 20, ty: 24 });
      if (i === 100) r.hp = 0;
      S.step(g, cmds); sums.push(S.checksum(g));
    }
    return sums;
  };
  assert.deepStrictEqual(run(), run());
});

// ── 맵 선택 ──
test('맵: 모든 맵에서 두 본진 사이 길이 있고 사이트가 비어 있다', () => {
  for (const id of Object.keys(S.D.maps)) {
    const g = S.createGame({ seed: 1, races: ['legion', 'swarm'], map: id });
    const [a, b] = S.D.maps[id].starts;
    const path = S.findPath(g, a.tx + 2, a.ty + 4, b.tx + 2, b.ty + 4);
    assert(path.length > 0, `${id}: no path`);
    assert.strictEqual(g.ents.filter(e => e.type === 'vent').length, S.D.maps[id].starts.length + S.D.maps[id].expansions.length);
    assert.strictEqual(g.map.id, id);
  }
});

test('맵: 기본 맵은 교차로이고 기존 배치를 유지한다', () => {
  const a = S.createGame({ seed: 7, races: ['legion', 'legion'] });
  const b = S.createGame({ seed: 7, races: ['legion', 'legion'], map: 'crossing' });
  assert.strictEqual(S.checksum(a), S.checksum(b));
  assert.deepStrictEqual(Object.keys(S.D.maps).sort(), ['bonanza', 'crossing', 'diagonal', 'expanse', 'fortress', 'gate', 'isles', 'maze', 'narrows', 'ring']);
  assert.notStrictEqual(S.checksum(a), S.checksum(S.createGame({ seed: 7, races: ['legion', 'legion'], map: 'narrows' })));
});

test('맵: 사이트 영역(자원 주변 1타일·본진 풋프린트)에 바위가 없다', () => {
  for (const id of Object.keys(S.D.maps)) {
    const g = S.createGame({ seed: 1, races: ['legion', 'legion'], map: id }), W = g.map.w, H = g.map.h;
    const bad = [];
    for (const e of g.ents) {
      if (!e.isR && !e.isB) continue;
      for (let ty = e.ty - (e.isR ? 1 : 0); ty < e.ty + e.def.h + (e.isR ? 1 : 0); ty++)
        for (let tx = e.tx - (e.isR ? 1 : 0); tx < e.tx + e.def.w + (e.isR ? 1 : 0); tx++)
          if (tx >= 0 && ty >= 0 && tx < W && ty < H && g.map.rock[ty * W + tx]) bad.push(`${e.type}@${tx},${ty}`);
    }
    assert.deepStrictEqual(bad, [], `${id}: rock in site`);
  }
});

// 거울 대칭 검사(flip 1 x거울, 2 y거울, 3 180°). 반환: 거울에 대응하지 않는 바위 타일(오름차순)과 자원(수정·분출구, isR) 타일.
function flipMisses(id, flip) {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'], map: id }), W = g.map.w, H = g.map.h;
  const rot = t => { const x = t % W, y = (t - x) / W; return ((flip & 2) ? H - 1 - y : y) * W + ((flip & 1) ? W - 1 - x : x); };
  const rocks = []; for (let i = 0; i < W * H; i++) if (g.map.rock[i] && !g.map.rock[rot(i)]) rocks.push(i);
  const res = new Set(); for (const e of g.ents) if (e.isR) for (let j = 0; j < e.def.h; j++) for (let k = 0; k < e.def.w; k++) res.add((e.ty + j) * W + e.tx + k);
  return { rocks, res: [...res].filter(t => !res.has(rot(t))).sort((a, b) => a - b) };
}
const QUAD = ['expanse', 'ring', 'bonanza', 'fortress'];
const TWO = ['crossing', 'narrows', 'gate', 'isles', 'maze', 'diagonal'];
const fullRoster = id => roster(...Array.from({ length: S.D.maps[id].players ?? S.D.maps[id].starts.length }, (_, i) => i));
test('4인 맵: 시작 4개, 가로·세로 거울 대칭(바위·자원)', () => {
  for (const id of QUAD) {
    assert.strictEqual(S.D.maps[id].starts.length, 4, id);
    assert.strictEqual(S.D.maps[id].players, 4, id);
    for (const f of [1, 2, 3]) assert.deepStrictEqual(flipMisses(id, f), { rocks: [], res: [] }, `${id} flip ${f}`);
  }
  assert.strictEqual(S.D.maps.fortress.w, 160);
});
test('모든 맵: 시작 4곳 모든 쌍·확장이 지상으로 연결', () => {
  for (const id of Object.keys(S.D.maps)) {
    const g = S.createGame({ seed: 1, map: id, players: fullRoster(id) });
    const st = g.map.starts;
    assert.strictEqual(st.length, 4, id);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++)
      if (i !== j) assert(S.findPath(g, st[i].tx + 2, st[i].ty + 4, st[j].tx + 2, st[j].ty + 4).length > 0, `${id} ${i}→${j}`);
    for (const v of g.ents.filter(e => e.type === 'vent')) assert(S.findPath(g, st[0].tx + 2, st[0].ty + 4, v.tx, v.ty).length > 0, `${id} vent ${v.id}`);
  }
});
test('모든 맵: 시작 사이트 i의 수정 8개·분출구가 본진 i 가까이(flip 뒤바뀜 검출)', () => {
  for (const id of Object.keys(S.D.maps)) {
    const g = S.createGame({ seed: 1, map: id, players: fullRoster(id) });
    const cr = g.ents.filter(e => e.type === 'crystal'), vt = g.ents.filter(e => e.type === 'vent');
    g.map.starts.forEach((s, i) => {
      const cx2 = 2 * s.tx + 4, cy2 = 2 * s.ty + 4; // 본진 중심 ×2
      const far = e => Math.max(Math.abs(2 * e.tx + e.def.w - cx2), Math.abs(2 * e.ty + e.def.h - cy2)) > 20; // 10타일 초과
      for (const e of cr.slice(8 * i, 8 * i + 8).concat(vt[i])) assert(!far(e), `${id} start ${i}: ${e.type}@${e.tx},${e.ty}`);
    });
  }
});
test('2인 맵: players 2, 시작 후보 4곳(상대 위치 비공개)', () => {
  assert.deepStrictEqual(Object.keys(S.D.maps).filter(id => !QUAD.includes(id)).sort(), TWO.slice().sort());
  for (const id of TWO) { assert.strictEqual(S.D.maps[id].players, 2, id); assert.strictEqual(S.D.maps[id].starts.length, 4, id); }
});

test('모든 맵: 본진이 갇히지 않는다 — 각 본진 주변에서 지상으로 닿는 타일이 넓다', () => {
  for (const id of Object.keys(S.D.maps)) {
    const g = S.createGame({ seed: 1, map: id, players: fullRoster(id) }), W = g.map.w;
    for (const s of g.map.starts) {
      const seen = new Uint8Array(W * g.map.h), q = [(s.ty + 4) * W + s.tx + 2]; seen[q[0]] = 1; let n = 0;
      assert(S.walkable(g, s.tx + 2, s.ty + 4), `${id}: start front blocked`);
      while (q.length && n < 4000) {
        const t = q.pop(), x = t % W, y = (t - x) / W; n++;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy, k = ny * W + nx; if (S.walkable(g, nx, ny) && !seen[k]) { seen[k] = 1; q.push(k); } }
      }
      assert(n >= 4000, `${id} start ${s.tx},${s.ty}: only ${n} tiles`);
    }
  }
});

test('사이트: flip 1·2는 가로·세로 거울, 3은 기존 180° 미러와 같다', () => {
  S.D.maps.__tq = { name: 't', desc: '', rocks: [],
    starts: [{ tx: 10, ty: 10 }, { tx: 114, ty: 114 }, { tx: 114, ty: 10, flip: 1 }, { tx: 10, ty: 114, flip: 2 }], expansions: [] };
  try {
    const g = S.createGame({ seed: 1, races: ['legion', 'legion'], map: '__tq' });
    const tiles = g.ents.filter(e => e.type === 'crystal').map(e => e.ty * 128 + e.tx);
    const set = new Set(tiles);
    for (const e of g.ents.filter(e => e.type === 'crystal')) {
      assert(set.has(e.ty * 128 + (126 - e.tx)), 'x mirror');
      assert(set.has((127 - e.ty) * 128 + e.tx), 'y mirror');
    }
    assert.strictEqual(tiles.length, 32);
    assert.strictEqual(g.ents.filter(e => e.type === 'vent').length, 4);
  } finally { delete S.D.maps.__tq; }
});

test('맵: 시작 후보 순서 — 좌상·우하(180°)·우상(x거울)·좌하(y거울)', () => {
  for (const [id, m] of Object.entries(S.D.maps)) {
    const W = m.w ?? 128, H = m.h ?? 128, [a] = m.starts;
    assert.deepStrictEqual(m.starts[1], { tx: W - 4 - a.tx, ty: H - 3 - a.ty }, `${id}: starts`); // 본진 4×3
    if (m.starts.length === 4) assert.deepStrictEqual(m.starts.slice(2), [{ tx: W - 4 - a.tx, ty: a.ty, flip: 1 }, { tx: a.tx, ty: H - 3 - a.ty, flip: 2 }], `${id}: quad starts`);
  }
});


// 본진 → 본진 지상 경로 비용(octile 10/14 단위)과 직선(octile) 비용
function pathCost(id) {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'], map: id }), W = g.map.w;
  const [a, b] = S.D.maps[id].starts;
  const [sx, sy, gx, gy] = [a.tx + 2, a.ty + 4, b.tx + 2, b.ty + 4];
  let cx = sx, cy = sy, cost = 0;
  for (const t of S.findPath(g, sx, sy, gx, gy)) {
    const x = t % W, y = (t - x) / W;
    cost += x !== cx && y !== cy ? 14 : 10; cx = x; cy = y;
  }
  const dx = Math.abs(gx - sx), dy = Math.abs(gy - sy);
  return { cost, straight: 10 * (dx + dy) - 6 * Math.min(dx, dy) };
}

test('맵: 모든 확장 사이트는 본진에서 지상으로 도달 가능', () => {
  for (const id of Object.keys(S.D.maps)) {
    const g = S.createGame({ seed: 1, races: ['legion', 'legion'], map: id });
    const st = S.D.maps[id].starts[0];
    for (const v of g.ents.filter(e => e.type === 'vent' || e.type === 'crystal')) {
      const p = S.findPath(g, st.tx + 2, st.ty + 4, v.tx, v.ty);
      assert(p.length > 0, `${id}: ${v.type}@${v.tx},${v.ty} unreachable`);
    }
  }
});

test('맵 gate: 본진 둘레 통행 경계(체비셰프 고리)의 최소 폭이 4 이하, 열린 맵은 넓다', () => {
  const minRing = id => {
    const g = S.createGame({ seed: 1, races: ['legion', 'legion'], map: id });
    const st = S.D.maps[id].starts[0], cx2 = 2 * st.tx + 3, cy2 = 2 * st.ty + 3; // 중심 좌표 x2
    const seen = new Uint8Array(128 * 128), q = [(st.ty + 4) * 128 + st.tx + 2];
    seen[q[0]] = 1;
    const ring = new Array(60).fill(0);
    while (q.length) {
      const t = q.pop(), x = t % 128, y = (t - x) / 128;
      const d = Math.max(Math.abs(2 * x + 1 - cx2), Math.abs(2 * y + 1 - cy2)) >> 1;
      if (d < 60) ring[d]++;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, n = ny * 128 + nx;
        if (S.walkable(g, nx, ny) && !seen[n]) { seen[n] = 1; q.push(n); }
      }
    }
    return Math.min(...ring.slice(12, 40));
  };
  assert(minRing('gate') <= 4, `gate ring ${minRing('gate')}`);
  assert(minRing('expanse') > 8);
});

test('맵 maze: 본진 간 경로가 직선의 1.6배 이상', () => {
  const { cost, straight } = pathCost('maze');
  assert(cost >= 1.6 * straight, `${cost} vs ${straight}`);
});

test('맵 diagonal: 본진 간 경로 비용이 모든 맵 중 최장', () => {
  const d = pathCost('diagonal').cost;
  for (const id of Object.keys(S.D.maps).filter(k => k !== 'diagonal')) assert(d > pathCost(id).cost, `${id} ${pathCost(id).cost} >= ${d}`);
});

test('맵 bonanza: 중앙 사이트(rich) 크리스탈 양이 일반 사이트의 2배이고 그 외 맵의 크리스탈은 전부 1875', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'], map: 'bonanza' });
  const cr = g.ents.filter(e => e.type === 'crystal');
  const sum = a => a.reduce((s, c) => s + c.amount, 0);
  const center = cr.filter(c => c.tx >= 50 && c.tx <= 77 && c.ty >= 50 && c.ty <= 77);
  const start = cr.filter(c => c.tx < 20 && c.ty < 20);
  assert.strictEqual(start.length, 8);
  assert.strictEqual(center.length, 32); // 중앙 네 사이트: 원본 + 세 거울 = 크리스탈 32개
  assert.strictEqual(sum(center), 4 * 2 * sum(start)); // 개수 4배 × 양 2배(rich)
  assert(center.every(c => c.amount === 3750));
  for (const id of Object.keys(S.D.maps).filter(k => k !== 'bonanza' && k !== 'fortress'))
    assert(S.createGame({ seed: 1, races: ['legion', 'legion'], map: id }).ents.filter(e => e.type === 'crystal').every(c => c.amount === 1875), id);
});

test('맵 isles: 바위로 갈린 4~5개 구역(폭 8 미만 통로는 구역을 잇지 못함)이 있고 본진 간 지상 경로는 있다', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'], map: 'isles' });
  assert(pathCost('isles').cost > 0);
  // 9×9 상자가 전부 비어 있는 타일(폭 9 이상 지역)만 남겨 연결 성분을 센다: 좁은 통로는 끊긴다.
  const R = 4, core = new Uint8Array(128 * 128);
  for (let y = R; y < 128 - R; y++) for (let x = R; x < 128 - R; x++) {
    let ok = 1;
    for (let j = -R; j <= R && ok; j++) for (let i = -R; i <= R; i++) if (g.map.rock[(y + j) * 128 + x + i]) { ok = 0; break; }
    core[y * 128 + x] = ok;
  }
  const sizes = [];
  for (let t = 0; t < 128 * 128; t++) {
    if (!core[t]) continue;
    let n = 0; const q = [t]; core[t] = 0;
    while (q.length) {
      const c = q.pop(); n++;
      for (const d of [1, -1, 128, -128]) if (core[c + d]) { core[c + d] = 0; q.push(c + d); }
    }
    if (n >= 40) sizes.push(n);
  }
  assert(sizes.length >= 4 && sizes.length <= 5, `regions ${sizes}`);
});

test('canTrain: pend 인자(같은 틱 대기 명령분)를 자원·보급·대기열·유충에 반영', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'swarm'] });
  const hq = g.ents.find(e => e.owner === 0 && e.type === 'hq');
  g.players[0].crystal = 100;
  assert.strictEqual(S.canTrain(g, 0, hq, 'engineer'), '');
  assert.strictEqual(S.canTrain(g, 0, hq, 'engineer', {}), '');
  assert.strictEqual(S.canTrain(g, 0, hq, 'engineer', { crystal: 60 }), 'crystal');
  assert.strictEqual(S.canTrain(g, 0, hq, 'engineer', { n: 5 }), 'queue');
  const p = g.players[0]; p.crystal = 10000;
  assert.strictEqual(S.canTrain(g, 0, hq, 'engineer', { supply2: p.supplyMax2 - p.supplyUsed2 }), 'supply');
  const nest = g.ents.find(e => e.owner === 1 && e.type === 'nest');
  g.players[1].crystal = 10000;
  assert.strictEqual(S.canTrain(g, 1, nest, 'drudge', { n: 2 }), '');
  assert.strictEqual(S.canTrain(g, 1, nest, 'drudge', { n: 3 }), 'larva');
});

test('canRepair: 자기 레기온 건물/기계만, 미완성은 builder 기록이 있을 때(부속 제외), 완성은 손상일 때', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'] });
  const hq = g.ents.find(e => e.owner === 0 && e.type === 'hq'), eng = g.ents.find(e => e.owner === 0 && e.type === 'engineer');
  assert.strictEqual(S.canRepair(g, 0, hq), false);
  hq.hp -= 10 * S.FP;
  assert.strictEqual(S.canRepair(g, 0, hq), true);
  assert.strictEqual(S.canRepair(g, 1, hq), false);
  eng.hp -= S.FP;
  assert.strictEqual(S.canRepair(g, 0, eng), false); // 보병은 기계가 아님
  const dep = S.spawn(g, 0, 'depot', 20, 20, false);
  assert.strictEqual(S.canRepair(g, 0, dep), false); // builder 없음(부속과 같은 경우)
  dep.builder = 9999;
  assert.strictEqual(S.canRepair(g, 0, dep), true);
});

test('canLift: lift 가능 건물만, 변태·부속 건설 중이면 busy, 이미 떠 있으면 tech — lift 명령과 일치', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'] });
  const hq = g.ents.find(e => e.owner === 0 && e.type === 'hq');
  assert.strictEqual(S.canLift(g, 0, hq), '');
  assert.strictEqual(S.canLift(g, 1, hq), 'tech');
  const dep = S.spawn(g, 0, 'depot', 30, 30);
  assert.strictEqual(S.canLift(g, 0, dep), 'tech'); // lift 없는 건물
  g.players[0].crystal = 1000; g.players[0].nebula = 1000;
  S.spawn(g, 0, 'drillhall', 40, 40);
  S.step(g, [{ player: 0, type: 'build', ids: [hq.id], what: 'uplink' }]);
  assert(hq.addon, 'addon started');
  assert.strictEqual(S.canLift(g, 0, hq), 'busy');
  S.step(g, [{ player: 0, type: 'lift', ids: [hq.id] }]);
  assert(!hq.lifted, "lift rejected while busy"); // 명령도 같은 규칙으로 거부
  for (let i = 0; i < 700; i++) S.step(g, []);
  assert.strictEqual(S.canLift(g, 0, hq), '');
  S.step(g, [{ player: 0, type: 'lift', ids: [hq.id] }]);
  assert.strictEqual(hq.lifted, true);
  assert.strictEqual(S.canLift(g, 0, hq), 'tech');
});

// ── 2단계 통합: 장시간 결정론 (3000틱 × 3 종족 조합, 스크립트 명령) ──
const LONG = {
  legion: { tech: ['garrison', 'workshop', 'motorpool', 'airfield', 'pillbox', 'flak'], up: ['workshop', 'legion_infantry_weapons'],
    army: ['trooper', 'trooper', 'trooper', 'scorcher', 'hound', 'bastion', 'strider', 'phantom', 'lancer', 'dreadnought'], lift: 'garrison', train: ['garrison', 'trooper'] },
  swarm: { tech: ['vat', 'mutapit', 'spineroot', 'puffer', 'roost'], up: ['mutapit', 'swarm_melee'],
    army: ['skitter', 'skitter', 'skitter', 'spinewyrm', 'spinewyrm', 'wingsting', 'wingsting', 'burster', 'burster', 'behemoth'], train: [null, 'skitter'] },
  elysian: { tech: ['resonator', 'anvil', 'portal', 'synapse', 'wardspire', 'skygate'], up: ['anvil', 'elysian_ground_weapons'],
    army: ['oathblade', 'oathblade', 'arcwalker', 'arcwalker', 'crucible', 'sentinel', 'skimmer', 'ark'], kill: 'resonator', train: ['portal', 'oathblade'] },
};
function freeSpot(g, w, h, cx, cy, cond) { // 결정론적 나선 탐색: 걷기 가능 + 비점유 + 1칸 여백 (+ ok(tx, ty) 조건)
  for (let r = 0; r < 40; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const tx = cx + dx, ty = cy + dy; let ok = true;
    for (let j = -1; j <= h && ok; j++) for (let i = -1; i <= w && ok; i++)
      if (!S.walkable(g, tx + i, ty + j) || g.map.occ[(ty + j) * g.map.w + tx + i]) ok = false;
    if (ok && (!cond || cond(tx, ty))) return [tx, ty];
  }
  throw new Error('no spot');
}
// players: 명단(races 배열이면 1:1). 각자 같은 스크립트, 공격 대상은 다음 번호 플레이어의 본진 자리((p+1)%n).
function longRun(players, map, seed) {
  if (typeof players[0] === 'string') players = players.map((race, i) => ({ race, team: i, slot: i, color: i }));
  const races = players.map(q => q.race), n = players.length;
  const g = S.createGame({ seed, players, map });
  const sums = [], st = players.map(q => g.map.starts[q.slot]), foe = p => st[(p + 1) % n];
  const own = players.map(() => ({}));
  let researching = null;
  for (let p = 0; p < n; p++) {
    const P = g.players[p], L = LONG[races[p]];
    P.crystal = 6000; P.nebula = 4000;
    const bx = st[p].tx + 2, by = st[p].ty + 1, dx = bx < g.map.w / 2 ? 1 : -1, dy = by < g.map.h / 2 ? 1 : -1;
    let lit = null;
    if (races[p] === 'elysian') { // 레이 라인: 테크 무리 둘레 네 모서리에 기둥(가로 12·세로 10타일 연결 사각형) → 테크 건물은 선·원 위에만
      for (const [sx, sy] of [[-6, -5], [6, -5], [-6, 5], [6, 5]]) { const [tx, ty] = freeSpot(g, 2, 2, bx + dx * 9 + sx, by + dy * 9 + sy); S.spawn(g, p, 'resonator', tx, ty); }
      lit = t => (tx, ty) => S.inNet(S.powerNet(g, p), t, tx, ty);
    }
    for (const t of L.tech) { // 테크 건물은 기지 앞쪽에 완성 상태로
      const d = S.D.buildings[t], [tx, ty] = freeSpot(g, d.w, d.h, bx + dx * 9, by + dy * 9, lit && lit(t));
      own[p][t] = S.spawn(g, p, t, tx, ty);
      if (races[p] === 'swarm') S.recomputeCreep(g);
    }
    own[p].army = L.army.map((u, i) => S.spawn(g, p, u, (bx + dx * (16 + (i % 4) * 2)) * S.TFP, (by + dy * (16 + (i >> 2) * 2)) * S.TFP).id);
    own[p].vent = g.ents.filter(e => e.type === 'vent').sort((a, b) => Math.abs(a.tx - st[p].tx) + Math.abs(a.ty - st[p].ty) - Math.abs(b.tx - st[p].tx) - Math.abs(b.ty - st[p].ty) || a.id - b.id)[0];
  }
  for (let t = 0; t < 3000; t++) {
    const cmds = [];
    for (let p = 0; p < n; p++) {
      const L = LONG[races[p]], O = own[p], race = S.D.races[races[p]];
      const workers = g.ents.filter(e => e.owner === p && e.def.worker).map(e => e.id);
      const base = g.ents.find(e => e.owner === p && e.isB && e.def.dropoff);
      const gasB = g.ents.find(e => e.owner === p && e.isB && e.def.onVent && !(e.buildLeft > 0));
      if (t === 3 + p && workers.length) {
        const crystal = g.ents.filter(e => e.type === 'crystal').sort((a, b) => Math.abs(a.x - base.x) + Math.abs(a.y - base.y) - Math.abs(b.x - base.x) - Math.abs(b.y - base.y) || a.id - b.id)[0];
        cmds.push({ player: p, type: 'gather', ids: workers.slice(1), target: crystal.id });
        const gas = Object.values(S.D.buildings).find(d => d.onVent && d.race === races[p]);
        cmds.push({ player: p, type: 'build', ids: [workers[0]], what: Object.keys(S.D.buildings).find(k => S.D.buildings[k] === gas), tx: O.vent.tx, ty: O.vent.ty });
      }
      if (t % 200 === 10 && base) cmds.push({ player: p, type: 'train', ids: [base.id], what: race.worker });
      if (t % 300 === 50 && L.train[0] && O[L.train[0]]) cmds.push({ player: p, type: 'train', ids: [O[L.train[0]].id], what: L.train[1] });
      if (t % 300 === 50 && !L.train[0] && base) cmds.push({ player: p, type: 'train', ids: [base.id], what: L.train[1] });
      if (t === 20) cmds.push({ player: p, type: 'research', ids: [O[L.up[0]].id], what: L.up[1] });
      if (gasB && t % 500 === 400) cmds.push({ player: p, type: 'gather', ids: workers.slice(-2), target: gasB.id });
      if (t === 600) cmds.push({ player: p, type: 'attackMove', ids: O.army, x: (foe(p).tx + 2) * S.TFP, y: (foe(p).ty + 2) * S.TFP });
      if (t === 1500) cmds.push({ player: p, type: 'attackMove', ids: g.ents.filter(e => e.owner === p && !e.isB && !e.def.worker && !e.parent).map(e => e.id), x: (foe(p).tx + 2) * S.TFP, y: (foe(p).ty + 2) * S.TFP });
      if (L.lift && t === 900) cmds.push({ player: p, type: 'lift', ids: [O[L.lift].id] });
      if (L.lift && t === 950) { const [tx, ty] = [O[L.lift].tx, O[L.lift].ty]; cmds.push({ player: p, type: 'land', ids: [O[L.lift].id], tx, ty }); }
      if (L.kill && t === 2000) O[L.kill].hp = 0; // 공명탑 파괴 → 공명장 밖 건물 정지
    }
    S.step(g, cmds);
    sums.push(S.checksum(g));
    if (t === 1500) researching = races.map((r, p) => g.ents.some(e => e.owner === p && e.isB && e.queue.some(q => q.research === LONG[r].up[1] && q.left < S.D.upgrades[q.research].time[0] - 1000)));
  }
  return { sums, g, researching };
}
for (const [races, map] of [[['legion', 'swarm'], 'crossing'], [['swarm', 'elysian'], 'ring'], [['elysian', 'legion'], 'bonanza'], [roster(0, 1, 0, 1), 'fortress']]) {
  test(`결정론 장시간: ${races.map(r => r.race || r).join(' vs ')} @${map} 3000틱 매 틱 체크섬 일치`, () => {
    const a = longRun(races, map, 1234), b = longRun(races, map, 1234), rs = races.map(r => r.race || r);
    assert.strictEqual(a.sums.length, 3000);
    for (let i = 0; i < 3000; i++) if (a.sums[i] !== b.sums[i]) assert.fail(`tick ${i} checksum diverged`);
    // 스크립트가 실제로 시스템을 건드렸는지(가스 채집·연구·전투 사망)
    for (let p = 0; p < rs.length; p++) {
      assert(a.researching[p], `${rs[p]} research progressing at tick 1500`); // 1단계 연구는 4000틱 이상(연구 건물은 전투로 파괴될 수 있음)
      assert(a.g.ents.some(e => e.owner === p && e.isB && e.def.onVent), `${rs[p]} gas building`);
    }
    const armies = rs.reduce((n, r) => n + LONG[r].army.length, 0);
    const alive = a.g.ents.filter(e => e.owner >= 0 && !e.isB && !e.def.worker && !e.parent).length;
    assert(alive < armies, `combat happened (${alive} of ${armies} alive)`);
    assert.notStrictEqual(a.sums[2999], longRun(races, map, 1235).sums[2999], 'seed changes outcome');
  });
}

test('탈락: 건물 전멸 → 유닛 전부 사망, 이후 명령 무시, 남은 팀 승리', () => {
  const map = quadMap();
  try {
    const g = S.createGame({ seed: 1, map, players: roster(0, 1, 2) }); // 3인 개인전
    for (const e of g.ents) if (e.owner === 1 && e.isB) e.hp = 0;
    const ev = S.step(g, []);
    assert(ev.some(x => x.t === 'player-out' && x.p === 1));
    assert(!g.ents.some(e => e.owner === 1));
    assert(g.players[1].out && g.winner === -1);
    // 탈락자의 명령은 무시: 검증이 없으면 surrender 가 eliminate 를 다시 돌려 player-out 이벤트가 또 나온다
    const g2 = S.createGame({ seed: 1, map, players: roster(0, 1, 2) });
    for (const e of g2.ents) if (e.owner === 1 && e.isB) e.hp = 0;
    S.step(g2, []);
    const e1 = S.step(g, [{ player: 1, type: 'surrender' }]), e2 = S.step(g2, []);
    assert(!e1.some(x => x.t === 'player-out'));
    assert.deepStrictEqual(e1, e2); assert.strictEqual(S.checksum(g), S.checksum(g2));
    for (const e of g.ents) if (e.owner === 2 && e.isB) e.hp = 0;
    S.step(g, []);
    assert.strictEqual(g.winner, 0);
  } finally { delete S.D.maps.__q4; }
});

test('항복: 팀원이 남으면 계속, 마지막 팀 전멸 동시 → 무승부', () => {
  const map = quadMap();
  try {
    const g = S.createGame({ seed: 1, map, players: roster(0, 1, 0, 1) });
    S.step(g, [{ player: 0, type: 'surrender' }]);
    assert(g.players[0].out && !g.ents.some(e => e.owner === 0) && g.winner === -1);
    for (const e of g.ents) if (e.isB && (e.owner === 1 || e.owner === 2 || e.owner === 3)) e.hp = 0;
    S.step(g, []);
    assert.strictEqual(g.winner, -2);
  } finally { delete S.D.maps.__q4; }
});

test('항복: 같은 틱 생산 완료·건설로 생긴 엔티티도 남지 않는다', () => {
  const map = quadMap();
  try {
    const g = S.createGame({ seed: 1, map, players: roster(0, 1, 0, 1) });
    const hq = g.ents.find(e => e.owner === 0 && e.isB && !e.def.onVent);
    S.step(g, [{ player: 0, type: 'train', ids: [hq.id], what: 'engineer' }]);
    assert(hq.queue.length); hq.queue[0].left = 1;
    S.step(g, [{ player: 0, type: 'surrender' }]);
    assert(!g.ents.some(e => e.owner === 0), '1틱 후');
    S.step(g, []);
    assert(!g.ents.some(e => e.owner === 0), '2틱 후'); assert(g.players[0].out && g.winner === -1);
  } finally { delete S.D.maps.__q4; }
});

test('명령 검증: 범위 밖 player 무시', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'] }), g2 = S.createGame({ seed: 1, races: ['legion', 'legion'] });
  S.step(g, [{ player: 5, type: 'surrender' }, { player: -1, type: 'surrender' }, { player: 0.5, type: 'surrender' }]); S.step(g2, []);
  assert.strictEqual(S.checksum(g), S.checksum(g2));
});

test('처치 귀속: 사망 이벤트 by = 가해자, 1:1 winner 값 호환', () => {
  const g = S.createGame({ seed: 1, races: ['legion', 'legion'] });
  const a = S.spawn(g, 0, 'trooper', 60 * S.TFP, 60 * S.TFP), t = S.spawn(g, 1, 'trooper', 61 * S.TFP, 60 * S.TFP);
  t.hp = 1; let ev = [];
  for (let i = 0; i < 60 && !ev.some(x => x.t === 'death' && x.id === t.id); i++) ev = S.step(g, [i ? null : { player: 0, type: 'attack', ids: [a.id], target: t.id }].filter(Boolean));
  assert(ev.some(x => x.t === 'death' && x.id === t.id && x.by === 0 && x.owner === 1));
  for (const e of g.ents) if (e.owner === 1 && e.isB) e.hp = 0;
  S.step(g, []); assert.strictEqual(g.winner, 0);
});

test('처치 귀속: 같은 팀 피해·탈락은 by -1', () => {
  const map = quadMap();
  try {
    const g = S.createGame({ seed: 1, map, players: roster(0, 1, 0, 1) });
    const u = S.spawn(g, 1, 'trooper', 60 * S.TFP, 60 * S.TFP); u.lastBy = 3; u.hp = 0; // 같은 팀 가해자
    const v = S.spawn(g, 1, 'trooper', 62 * S.TFP, 60 * S.TFP); v.lastBy = 0; v.hp = 0;
    const ev = S.step(g, []);
    assert.strictEqual(ev.find(x => x.t === 'death' && x.id === u.id).by, -1);
    assert.strictEqual(ev.find(x => x.t === 'death' && x.id === v.id).by, 0);
    const ev2 = S.step(g, [{ player: 1, type: 'surrender' }]);
    assert(ev2.filter(x => x.t === 'death' && x.owner === 1).every(x => x.by === -1));
  } finally { delete S.D.maps.__q4; }
});

// ── 3a: 마나·시전·효과 ──
// 무대: 바위 없는 4인 시험 맵에서 1:1(0번 좌상 본진, 1번 우하 본진), 중앙(64,64) 근처는 비어 있다
function arena(races, fn) { const map = quadMap(); try { return fn(S.createGame({ seed: 1, map, races })); } finally { delete S.D.maps.__q4; } }
const at = (tx, ty) => [tx * S.TFP + (S.TFP >> 1), ty * S.TFP + (S.TFP >> 1)];
const run = (g, n, cmds = []) => { let ev = []; for (let i = 0; i < n; i++) ev = ev.concat(S.step(g, i ? [] : cmds)); return ev; };

test('data3a: 능력 데이터 유효(종족·대상·효과 종류·연구 참조)', () => {
  const KINDS = ['instant', 'status', 'area_dot', 'summon', 'aura', 'reveal', 'zone'];
  for (const [id, a] of Object.entries(D.abilities)) {
    assert(RACES.includes(a.race) && a.name && a.cost >= 0 && a.range >= 0, id);
    assert(['unit', 'point', 'self', 'auto'].includes(a.target), `${id}.target`);
    assert(KINDS.includes(a.effect.kind), `${id}.effect.kind`);
    if (a.requires) assert(D.upgrades[a.requires], `${id}.requires`);
  }
  for (const id of ['heal', 'mindstorm', 'optcloak', 'scan']) assert(D.abilities[id], id);
  for (const [u, a] of [['corpsman', 'heal'], ['sage', 'mindstorm'], ['shade', 'optcloak']]) assert.strictEqual(D.units[u].abilities[0], a, u); // 3b에서 마법 추가, 3a 견본은 첫 칸 유지
  assert.deepStrictEqual(D.buildings.uplink.abilities, ['scan']);
});

test('마나: 생산 시 50, 틱당 재생, 최대치에서 멈춤', () => arena(['legion', 'elysian'], g => {
  const s = S.spawn(g, 1, 'sage', ...at(64, 64));
  assert.strictEqual(s.energy, 50 * S.FP);
  S.step(g, []);
  assert.strictEqual(s.energy, 50 * S.FP + S.ENERGY_REGEN);
  assert.strictEqual(S.energyMax(g, s), 200 * S.FP);
  s.energy = 200 * S.FP - 1; S.step(g, []);
  assert.strictEqual(s.energy, 200 * S.FP);
}));

test('시전: 미연구·마나 부족은 무시, 시전 순간 차감', () => arena(['legion', 'elysian'], g => {
  const s = S.spawn(g, 1, 'sage', ...at(60, 64)), [x, y] = at(66, 64);
  const cast = { player: 1, type: 'cast', ids: [s.id], what: 'mindstorm', x, y };
  assert.strictEqual(S.canCast(g, 1, s, 'mindstorm'), 'research');
  S.step(g, [cast]); assert.strictEqual(g.fx.length, 0); assert.strictEqual(s.order, null);
  g.players[1].up.elysian_mindstorm = 1;
  assert.strictEqual(S.canCast(g, 1, s, 'mindstorm'), 'energy');
  S.step(g, [cast]); assert.strictEqual(g.fx.length, 0);
  s.energy = 80 * S.FP;
  S.step(g, [cast]);
  assert.strictEqual(g.fx.length, 1);
  assert.strictEqual(g.fx[0].kind, 'area_dot');
  assert.strictEqual(s.energy, 5 * S.FP + S.ENERGY_REGEN);
  assert.strictEqual(S.canCast(g, 0, s, 'mindstorm'), 'tech', '남의 유닛');
}));

// 정신 폭풍 n개를 같은 지점에 → 대상 피해
function stormLoss(n) {
  return arena(['legion', 'elysian'], g => {
    g.players[1].up.elysian_mindstorm = 1;
    const ss = Array.from({ length: n }, (_, i) => S.spawn(g, 1, 'sage', ...at(60, 63 + i)));
    for (const s of ss) s.energy = 100 * S.FP;
    const f = S.spawn(g, 0, 'ferry', ...at(66, 64)), [x, y] = at(66, 64);
    run(g, 20, [{ player: 1, type: 'cast', ids: ss.map(s => s.id), what: 'mindstorm', x, y }]);
    return { loss: f.hpMax - f.hp, fx: g.fx.length, energy: ss.map(s => s.energy) };
  });
}
test('시전: 여러 기 선택 → 전원 시전·각자 차감, 같은 범위 효과는 중첩되지 않는다', () => {
  const one = stormLoss(1), two = stormLoss(2);
  assert(one.loss > 0, '폭풍 피해');
  assert.strictEqual(one.fx, 1); assert.strictEqual(two.fx, 2);
  assert.strictEqual(two.energy[0], two.energy[1]);
  assert(two.energy[0] < 50 * S.FP, '둘 다 차감');
  assert.strictEqual(two.loss, one.loss, '중첩 없음');
});

test('치료: 자동 시전으로 다친 아군 생체 유닛 회복, 기계·자신은 아님', () => arena(['legion', 'elysian'], g => {
  const c = S.spawn(g, 0, 'corpsman', ...at(64, 64)), t = S.spawn(g, 0, 'trooper', ...at(65, 64)), h = S.spawn(g, 0, 'hound', ...at(63, 64));
  assert.strictEqual(c.auto, 'heal', '기본 켜짐');
  t.hp = h.hp = c.hp = 10 * S.FP;
  run(g, 40);
  assert(t.hp > 10 * S.FP, '트루퍼 회복');
  assert.strictEqual(h.hp, 10 * S.FP, '기계 제외');
  assert.strictEqual(c.hp, 10 * S.FP, '자신 제외');
  assert(c.energy < 50 * S.FP, '마나 소모');
  run(g, 1, [{ player: 0, type: 'autocast', ids: [c.id], what: 'heal', on: false }]);
  assert.strictEqual(c.auto, '');
}));

test('광학 위장: 연구 후 켜기·끄기(무료), 마나 지속 소모, 바닥나면 해제', () => arena(['legion', 'elysian'], g => {
  g.players[0].up.legion_optcloak = 1;
  const s = S.spawn(g, 0, 'shade', ...at(64, 64)), on = { player: 0, type: 'cast', ids: [s.id], what: 'optcloak' };
  s.energy = 40 * S.FP;
  S.step(g, [on]); assert(S.cloaked(s), '켜짐');
  const e1 = s.energy; S.step(g, []); assert(s.energy < e1, '지속 소모');
  S.step(g, [on]); assert(!S.cloaked(s), '다시 시전 = 끄기');
  const e2 = s.energy; S.step(g, []); assert(s.energy > e2, '끄면 재생');
  s.energy = 40 * S.FP;
  S.step(g, [on]); assert(S.cloaked(s));
  run(g, 400); assert(!S.cloaked(s), '마나 바닥 → 해제');
}));

test('위성 스캔: 건물 시전, 사거리 무제한, 지점에 일시 시야', () => arena(['legion', 'elysian'], g => {
  const u = S.spawn(g, 0, 'uplink', 20, 20), tile = 100 * g.map.w + 100, [x, y] = at(100, 100);
  assert.notStrictEqual(g.fog[0][tile], 2);
  S.step(g, [{ player: 0, type: 'cast', ids: [u.id], what: 'scan', x, y }]);
  assert.strictEqual(g.fog[0][tile], 2);
  assert.strictEqual(u.energy, S.ENERGY_REGEN);
  run(g, S.D.abilities.scan.effect.left + 1);
  assert.strictEqual(g.fx.length, 0);
  assert.strictEqual(g.fog[0][tile], 1);
}));

test('효과 종류: status(이동 불가)·summon(시간제한)·aura(주변 아군 위장) — 데이터만으로 동작', () => arena(['legion', 'elysian'], g => {
  const A = S.D.abilities, cdef = S.D.units.corpsman, old = cdef.abilities;
  A.__root = { name: 't', race: 'legion', cost: 10, target: 'unit', range: 320, filter: 'enemy', effect: { kind: 'status', flag: 'rooted', left: 30 } };
  A.__sum = { name: 't', race: 'legion', cost: 10, target: 'point', range: 320, effect: { kind: 'summon', unit: 'trooper', count: 2, life: 40 } };
  A.__aura = { name: 't', race: 'legion', cost: 10, target: 'self', range: 0, effect: { kind: 'aura', flag: 'cloaked', r: 96, left: -1 } };
  cdef.abilities = ['heal', '__root', '__sum', '__aura'];
  try {
    const c = S.spawn(g, 0, 'corpsman', ...at(64, 64)); c.energy = 200 * S.FP;
    const e = S.spawn(g, 1, 'sage', ...at(68, 64)), ex = e.x, ey = e.y;
    S.step(g, [{ player: 0, type: 'cast', ids: [c.id], what: '__root', target: e.id }]);
    assert(e.stf & S.STF.rooted);
    run(g, 10, [{ player: 1, type: 'move', ids: [e.id], x: ex + 6 * S.TFP, y: ey }]);
    assert.deepStrictEqual([e.x, e.y], [ex, ey], '이동 불가');
    run(g, 40); assert(e.x > ex, '30틱 뒤 풀려서 이동');

    const sup = g.players[0].supplyUsed2, [sx, sy] = at(64, 60);
    run(g, 1, [{ player: 0, type: 'cast', ids: [c.id], what: '__sum', x: sx, y: sy }]);
    const sum = g.ents.filter(x => x.owner === 0 && x.type === 'trooper');
    assert.strictEqual(sum.length, 2); assert(sum.every(x => x.life > 0));
    assert.strictEqual(g.players[0].supplyUsed2, sup, '소환은 보급 없음');
    const ev = run(g, 45);
    assert(sum.every(x => !S.byId(g, x.id) && ev.some(d => d.t === 'death' && d.id === x.id && d.by === -1)), '시간제한 사망');
    assert.strictEqual(g.players[0].supplyUsed2, sup, '만료 후에도 보급 그대로(반환 없음)');

    const near = S.spawn(g, 0, 'trooper', ...at(65, 64)), far = S.spawn(g, 0, 'trooper', ...at(74, 64));
    run(g, 1, [{ player: 0, type: 'cast', ids: [c.id], what: '__aura' }]);
    assert(S.cloaked(near) && S.cloaked(c) && !S.cloaked(far));
  } finally { cdef.abilities = old; delete A.__root; delete A.__sum; delete A.__aura; }
}));

test('위장: 미탐지면 공격 명령·자동 대상·시야 불가, 팀원 탐지기(연구 후 블로터) 공유', () => {
  const map = quadMap();
  try {
    const g = S.createGame({ seed: 1, map, players: roster(0, 1, 0, 1) }); // 0 레기온·2 엘리시안 vs 1 스웜·3 레기온
    const u = S.spawn(g, 2, 'umbra', ...at(64, 64)), t = S.spawn(g, 3, 'trooper', ...at(66, 64));
    S.step(g, [{ player: 2, type: 'hold', ids: [u.id] }, { player: 3, type: 'attack', ids: [t.id], target: u.id }]);
    assert.strictEqual(t.order, null, '미탐지 대상 공격 명령 거부');
    run(g, 40);
    assert.strictEqual(u.hp + u.shield, u.hpMax + u.shieldMax, '미탐지: 피해 없음');
    assert(S.cloaked(u) && !S.visible(g, 3, u) && !S.visible(g, 1, u) && S.visible(g, 0, u) && S.visible(g, 2, u));
    S.spawn(g, 1, 'bloater', ...at(68, 64));
    run(g, 2);
    assert(!S.visible(g, 3, u), '연구 전 블로터는 탐지기 아님');
    g.players[1].up.swarm_bloater_detect = 1;
    run(g, 2);
    assert(S.visible(g, 3, u) && S.detected(g, 3, u), '팀원(1번) 탐지기를 3번이 공유');
    run(g, 40);
    assert(u.hp + u.shield < u.hpMax + u.shieldMax, '탐지 후 자동 공격');
  } finally { delete S.D.maps.__q4; }
});

test('위성 스캔: 지점의 위장 유닛을 일시 탐지', () => arena(['legion', 'elysian'], g => {
  const up = S.spawn(g, 0, 'uplink', 20, 20), u = S.spawn(g, 1, 'umbra', ...at(64, 64));
  S.spawn(g, 0, 'trooper', ...at(66, 64));
  S.step(g, [{ player: 1, type: 'hold', ids: [u.id] }]);
  assert(!S.visible(g, 0, u));
  S.step(g, [{ player: 0, type: 'cast', ids: [up.id], what: 'scan', x: u.x, y: u.y }]);
  assert(S.visible(g, 0, u) && S.detected(g, 0, u));
  run(g, S.D.abilities.scan.effect.left + 2);
  assert(!S.visible(g, 0, u), '스캔 종료 → 다시 숨음');
}));

test('위장: 광학 위장 셰이드는 적에게 안 보이고 적 탐지기(와처) 근처에선 보인다', () => arena(['legion', 'elysian'], g => {
  g.players[0].up.legion_optcloak = 1;
  const s = S.spawn(g, 0, 'shade', ...at(64, 64)); S.spawn(g, 1, 'arcwalker', ...at(67, 64));
  S.step(g, [{ player: 0, type: 'cast', ids: [s.id], what: 'optcloak' }]); // 같은 틱에 hold를 주면 cast 명령을 덮어쓴다
  S.step(g, [{ player: 0, type: 'hold', ids: [s.id] }]);
  assert(S.cloaked(s) && !S.visible(g, 1, s));
  S.spawn(g, 1, 'watcher', ...at(66, 66)); S.step(g, []); // 건물 탐지기는 공명장 밖이면 꺼지므로 유닛 탐지기로
  assert(S.visible(g, 1, s) && S.detected(g, 1, s));
}));

test('수송: 유닛이 타러 감·수송선이 태우러 감, 8칸 초과 거부, 지점 하차·한 기 하차', () => arena(['legion', 'elysian'], g => {
  const f = S.spawn(g, 0, 'ferry', ...at(64, 64));
  const bs = [S.spawn(g, 0, 'bastion', ...at(62, 66)), S.spawn(g, 0, 'bastion', ...at(66, 66))]; // 대형 4칸 × 2 = 8칸
  const far = S.spawn(g, 0, 'trooper', ...at(50, 64));
  run(g, 60, [{ player: 0, type: 'load', ids: bs.map(e => e.id), target: f.id }]);
  assert(bs.every(e => e.inside === f.id), '탑승');
  assert.deepStrictEqual(S.cargo(g, f).map(e => e.id), bs.map(e => e.id));
  assert(bs.every(e => e.x === f.x && e.y === f.y), '수송선 위치를 따라감');
  assert.strictEqual(S.canLoad(g, 0, f, far), 'space');
  run(g, 200, [{ player: 0, type: 'load', ids: [f.id], target: far.id }]);
  assert.strictEqual(far.inside, 0, '칸 초과 거부');
  const [x, y] = at(80, 64);
  run(g, 300, [{ player: 0, type: 'unload', ids: [f.id], x, y }]);
  assert(bs.every(e => e.inside === 0 && Math.abs(e.x - x) <= 3 * S.TFP && Math.abs(e.y - y) <= 3 * S.TFP), '지점 하차');
  run(g, 400, [{ player: 0, type: 'load', ids: [far.id], target: f.id }]);
  assert.strictEqual(far.inside, f.id);
  S.step(g, [{ player: 0, type: 'unload', ids: [f.id], unit: far.id }]);
  assert.strictEqual(far.inside, 0, '한 기 하차');
}));

test('수송: 수송선 사망 → 탑승 유닛 사망, 처치는 수송선을 잡은 쪽, 탑승 중엔 안 보임', () => arena(['legion', 'elysian'], g => {
  const f = S.spawn(g, 0, 'ferry', ...at(64, 64)), t = S.spawn(g, 0, 'trooper', ...at(65, 64));
  run(g, 30, [{ player: 0, type: 'load', ids: [t.id], target: f.id }]);
  assert.strictEqual(t.inside, f.id);
  assert(!S.visible(g, 0, t) && !S.visible(g, 1, t));
  const sup = g.players[0].supplyUsed2;
  f.hp = 0; f.lastBy = 1;
  const ev = S.step(g, []);
  assert(ev.some(x => x.t === 'death' && x.id === f.id && x.by === 1));
  assert(ev.some(x => x.t === 'death' && x.id === t.id && x.by === 1));
  assert(!S.byId(g, t.id));
  assert(g.players[0].supplyUsed2 < sup, '보급 반환');
}));

test('수송: 블로터는 연구 후에만 태운다', () => arena(['swarm', 'legion'], g => {
  const b = S.spawn(g, 0, 'bloater', ...at(64, 64)), d = S.spawn(g, 0, 'skitter', ...at(65, 64));
  assert.strictEqual(S.canLoad(g, 0, b, d), 'research');
  run(g, 60, [{ player: 0, type: 'load', ids: [d.id], target: b.id }]);
  assert.strictEqual(d.inside, 0);
  g.players[0].up.swarm_bloater_transport = 1;
  run(g, 60, [{ player: 0, type: 'load', ids: [d.id], target: b.id }]);
  assert.strictEqual(d.inside, b.id);
}));

test('잠복: 연구 필요, 잠복 중 이동·공격 불가 + 위장, 트렌처는 잠복 중에만 공격', () => arena(['swarm', 'legion'], g => {
  const s = S.spawn(g, 0, 'spinewyrm', ...at(64, 64));
  assert.strictEqual(S.canMode(g, 0, s, 'burrow'), 'research');
  g.players[0].up.swarm_burrow = 1;
  run(g, 20, [{ player: 0, type: 'burrow', ids: [s.id] }]);
  assert.strictEqual(s.mode, 'burrow'); assert(S.cloaked(s));
  const x0 = s.x, y0 = s.y;
  run(g, 20, [{ player: 0, type: 'move', ids: [s.id], x: x0 + 5 * S.TFP, y: y0 }]);
  assert.deepStrictEqual([s.x, s.y], [x0, y0], '잠복 중 이동 불가');
  const e = S.spawn(g, 1, 'trooper', ...at(66, 64));
  run(g, 40);
  assert.strictEqual(e.hp, e.hpMax, '잠복 스파인웜은 공격 안 함');
  assert(!S.visible(g, 1, s), '적에게 안 보임');
  const tr = S.spawn(g, 0, 'trencher', ...at(64, 66));
  S.step(g, [{ player: 0, type: 'hold', ids: [tr.id] }]); run(g, 40);
  assert.strictEqual(e.hp, e.hpMax, '트렌처: 잠복 전엔 공격 없음');
  run(g, 60, [{ player: 0, type: 'burrow', ids: [tr.id] }]);
  assert(!S.byId(g, e.id) || e.hp < e.hpMax, '트렌처: 잠복 후 공격');
  run(g, 20, [{ player: 0, type: 'unburrow', ids: [s.id] }]);
  assert.strictEqual(s.mode, '');
}));

test('자동 정박(L2): 60틱 정지 → 정박 무기, 이동·공격 이동 즉시 해제, siege 명령 없음', () => arena(['legion', 'elysian'], g => {
  const b = S.spawn(g, 0, 'bastion', ...at(64, 64)), x0 = b.x;
  assert.strictEqual(S.weaponOf(b, 'weapon').range, 224);
  assert.strictEqual(S.canMode(g, 0, b, 'siege'), 'tech', 'auto 모드는 명령 없음');
  run(g, 1, [{ player: 0, type: 'siege', ids: [b.id] }]);
  assert.strictEqual(b.modeT, 0, 'siege 명령 무시');
  run(g, 58);
  assert.strictEqual(b.mode, '', '59틱: 아직');
  run(g, 1);
  assert.strictEqual(b.mode, 'siege', '60틱 정지 → 정박');
  assert(S.canCommand(b, 0), '정박 중에도 명령 가능');
  assert.strictEqual(S.weaponOf(b, 'weapon').range, S.D.units.bastion.modes.siege.weapon.range);
  const t = S.spawn(g, 1, 'arcwalker', ...at(73, 64)); // 288px: 일반 사거리 밖, 정박 사거리 안
  run(g, 60);
  assert(t.hp + t.shield < t.hpMax + t.shieldMax, '정박 사거리로 공격');
  assert.strictEqual(b.mode, 'siege'); assert.strictEqual(b.x, x0, '정박 중 추격하지 않음');
  g.ents = g.ents.filter(e => e !== t);
  run(g, 1, [{ player: 0, type: 'move', ids: [b.id], x: b.x, y: b.y + 6 * S.TFP }]);
  assert.strictEqual(b.mode, '', '이동 명령 → 즉시 해제'); assert(b.y !== at(64, 64)[1], '같은 틱에 이동');
  assert.strictEqual(S.weaponOf(b, 'weapon').range, 224);
  for (let i = 0; i < 400 && b.order; i++) S.step(g, []);
  assert.strictEqual(b.order, null, '도착');
  run(g, 59); assert.strictEqual(b.mode, '');
  run(g, 1); assert.strictEqual(b.mode, 'siege', '다시 서면 60틱 뒤 재정박');
  run(g, 1, [{ player: 0, type: 'attackMove', ids: [b.id], x: b.x + 6 * S.TFP, y: b.y }]);
  assert.strictEqual(b.mode, '', '공격 이동 → 즉시 해제');
  run(g, 1, [{ player: 0, type: 'stop', ids: [b.id] }]);
  run(g, 30, [{ player: 0, type: 'hold', ids: [b.id] }]);
  run(g, 30); assert.strictEqual(b.mode, 'siege', '정지·위치 고수도 정박');
  const t2 = S.spawn(g, 1, 'arcwalker', ...at(Math.floor(b.x / S.TFP) + 20, Math.floor(b.y / S.TFP)));
  run(g, 1, [{ player: 0, type: 'attack', ids: [b.id], target: t2.id }]);
  run(g, 1);
  assert.strictEqual(b.mode, '', '사거리 밖 공격 명령(추격) → 해제');
}));

test('변이 누적(S2): 처치 귀속(lastById), 3·8킬 방어력 +1/+2, 2단계 회복 ×2', () => arena(['swarm', 'legion'], g => {
  const w = S.spawn(g, 0, 'spinewyrm', ...at(64, 64));
  const kill = () => {
    const t = S.spawn(g, 1, 'trooper', ...at(67, 64)); t.hp = 1;
    run(g, 1, [{ player: 0, type: 'attack', ids: [w.id], target: t.id }]);
    for (let i = 0; i < 60 && S.byId(g, t.id); i++) S.step(g, []);
    assert(!S.byId(g, t.id), '처치');
  };
  const tw = S.D.units.trooper.weapon, dmg = () => S.calcDamage(tw, w).hp;
  const d0 = dmg();
  kill(); assert.strictEqual(w.kills, 1); assert.strictEqual(w.lastById, 0);
  kill(); kill(); assert.strictEqual(w.kills, 3);
  assert.strictEqual(d0 - dmg(), Math.floor(1 * S.FP * S.D.DMG_MULT[tw.type][w.def.size] / 100), '1단계 방어력 +1');
  w.kills = 8;
  assert.strictEqual(d0 - dmg(), Math.floor(2 * S.FP * S.D.DMG_MULT[tw.type][w.def.size] / 100), '2단계 방어력 +2');
  // 회복: 40틱마다 +1 → 2단계 +2
  const r = S.spawn(g, 0, 'spinewyrm', ...at(60, 60));
  while (g.tick % 40 !== 0) S.step(g, []);
  w.hp = r.hp = S.FP * 10;
  S.step(g, []);
  assert.strictEqual(w.hp, S.FP * 12, '2단계 회복 ×2'); assert.strictEqual(r.hp, S.FP * 11, '0단계 회복 그대로');
  // 마법 피해로 처치: 변이 귀속 없음(lastById 0)
  const t = S.spawn(g, 1, 'trooper', ...at(67, 64)); t.hp = 1; t.lastBy = 0; t.lastById = 0;
  t.hp = 0; S.step(g, []);
  assert.strictEqual(w.kills, 8, '마법 처치는 변이 귀속 없음');
}));

test('처치 유충 충전: 마이셀이 적 유닛을 죽이면 가장 가까운 빈자리 균핵 유충 +1 (건물·소환 처치 제외)', () => arena(['swarm', 'legion'], g => {
  const home = g.ents.find(e => e.owner === 0 && e.type === 'nest');
  const far = S.spawn(g, 0, 'nest', 40, 40), near = S.spawn(g, 0, 'nest', 60, 60);
  for (const n of [home, far, near]) n.larva = 1;
  const die = (type, x, y, free = false) => { const t = S.spawn(g, 1, type, ...(S.D.units[type] ? at(x, y) : [x, y])); t.free = free; t.hp = 0; t.lastBy = 0; S.step(g, []); };
  die('trooper', 62, 62);
  assert.strictEqual(near.larva, 2, '가장 가까운 균핵'); assert.strictEqual(far.larva, 1); assert.strictEqual(home.larva, 1);
  near.larva = 3;
  die('trooper', 62, 62);
  assert.strictEqual(near.larva, 3, '꽉 찬 균핵 건너뜀'); assert.strictEqual(far.larva + home.larva, 3, '다음으로 가까운 균핵');
  const before = far.larva + home.larva;
  die('pillbox', 70, 70);
  die('trooper', 62, 62, true);
  assert.strictEqual(far.larva + home.larva, before, '건물·소환 처치는 충전 없음');
  const t = S.spawn(g, 1, 'trooper', ...at(62, 62)); t.hp = 0; t.lastBy = -1; S.step(g, []);
  assert.strictEqual(far.larva + home.larva, before, '가해자 없음 = 충전 없음');
}));

test('처치 귀속: 함재기 자식 처치는 유충·변이 없음, 소환 가해자는 변이 없음(유충은 충전)', () => arena(['swarm', 'elysian'], g => {
  const home = g.ents.find(e => e.owner === 0 && e.type === 'nest'); home.larva = 1;
  const w = S.spawn(g, 0, 'spinewyrm', ...at(64, 64)), ark = S.spawn(g, 1, 'ark', ...at(80, 64));
  const c = S.spawn(g, 1, 'spark', ...at(66, 64), true, true); c.parent = ark.id;
  c.hp = 0; c.lastBy = 0; c.lastById = w.id; S.step(g, []);
  assert(!S.byId(g, c.id), '자식 사망');
  assert.strictEqual(w.kills, 0, '자식 처치 = 변이 없음'); assert.strictEqual(home.larva, 1, '자식 처치 = 유충 없음');
  const h = S.spawn(g, 0, 'husk', ...at(64, 66), true, true); h.free = true;
  const t = S.spawn(g, 1, 'oathblade', ...at(66, 66)); t.hp = 0; t.lastBy = 0; t.lastById = h.id; S.step(g, []);
  assert.strictEqual(h.kills, 0, '소환 가해자 변이 없음'); assert.strictEqual(home.larva, 2, '적 유닛 처치 = 유충 충전');
}));

test('수송: 자동 정박한 바스티온 — 수송선이 태우러 감·인접 탑승 모두 가능, 탑승하면 정박 해제', () => arena(['legion', 'elysian'], g => {
  const b = S.spawn(g, 0, 'bastion', ...at(64, 64)), f = S.spawn(g, 0, 'ferry', ...at(70, 64));
  run(g, 61); assert.strictEqual(b.mode, 'siege', '정박');
  assert.strictEqual(S.canLoad(g, 0, f, b), '');
  run(g, 200, [{ player: 0, type: 'load', ids: [f.id], target: b.id }]);
  assert.strictEqual(b.inside, f.id, '수송선이 태우러 감'); assert.strictEqual(b.mode, '', '탑승 → 정박 해제'); assert.strictEqual(b.still, 0);
  const b2 = S.spawn(g, 0, 'bastion', ...at(90, 90)), f2 = S.spawn(g, 0, 'ferry', ...at(91, 90));
  run(g, 61); assert.strictEqual(b2.mode, 'siege');
  run(g, 60, [{ player: 0, type: 'load', ids: [b2.id], target: f2.id }]);
  assert.strictEqual(b2.inside, f2.id, '인접 수송선에 탑승'); assert.strictEqual(b2.mode, '');
  run(g, 100); assert.strictEqual(b2.mode, '', '탑승 중 재정박 없음');
}));

test('공명 재생(E1): 반경 4타일 같은 종류 n → 20틱마다 +floor(n/2), 전투 중에도, 최대 4', () => arena(['elysian', 'legion'], g => {
  const grp = [0, 1, 2, 3, 4].map(i => S.spawn(g, 0, 'oathblade', ...at(60 + (i % 3), 60 + (i >> 1))));
  const pair = [0, 1, 2].map(i => S.spawn(g, 0, 'oathblade', ...at(80 + i, 80)));
  const lone = S.spawn(g, 0, 'oathblade', ...at(100, 60)), calm = S.spawn(g, 0, 'oathblade', ...at(100, 100));
  const mixed = S.spawn(g, 0, 'arcwalker', ...at(61, 61));
  const all = grp.concat(pair, [lone, calm, mixed]);
  for (const e of all) e.order = { type: 'hold' };
  while (g.tick % 20 !== 0) S.step(g, []);
  for (const e of all) { e.shield = 0; e.lastHit = g.tick; }
  calm.lastHit = g.tick - 200;
  S.step(g, []);
  for (const e of grp) assert.strictEqual(e.shield, 2 * S.FP, '5기 뭉침(n=4 상한) 전투 중 +2');
  for (const e of pair) assert(e.shield === S.FP || e.shield === 0, '3기: 가운데 n=2 → +1, 양끝은 n≥2');
  assert.strictEqual(pair[1].shield, S.FP, 'n=2 → +1');
  assert.strictEqual(lone.shield, 0, '혼자 전투 중 = 회복 없음');
  assert.strictEqual(calm.shield, S.FP, '혼자 비전투 = 지금과 같은 +1');
  assert.strictEqual(mixed.shield, 0, '다른 종류는 공명 안 함');
  S.step(g, []);
  assert.strictEqual(grp[0].shield, 2 * S.FP, '20틱마다만');
}));

test('data3a: 모드 무기 참조 유효', () => {
  for (const u of Object.values(D.units)) for (const [m, d] of Object.entries(u.modes || {})) {
    assert(['burrow', 'siege'].includes(m) && d.time > 0, `${u.id}.modes.${m}`);
    if (d.requires) assert(D.upgrades[d.requires], `${u.id}.modes.${m}.requires`);
    if (d.weapon && d.weapon.upgrade) assert.strictEqual(D.categories[d.weapon.upgrade].race, u.race, `${u.id} mode weapon cat`);
  }
  assert(!D.units.trencher.weapon && D.units.trencher.modes.burrow.weapon);
});

test('data3a: 해금 유닛은 변태·합체로만 얻는다', () => {
  const M = { trencher: ['morphFrom', 'spinewyrm'], siegemaw: ['morphFrom', 'wingsting'], acidwing: ['morphFrom', 'wingsting'], ascendant: ['mergeFrom', 'sage'], voidascendant: ['mergeFrom', 'umbra'] };
  for (const [id, [k, from]] of Object.entries(M)) { assert.strictEqual(D.units[id][k], from, id); assert.strictEqual(D.units[id].phase, undefined, id); }
});

test('유닛 변태: 스파인웜 → 트렌처, 같은 id, 고치 중 행동 불가, 비용·보급 차이', () => arena(['swarm', 'legion'], g => {
  const p = g.players[0];
  S.spawn(g, 0, 'wyrmpit', 20, 20); p.crystal = p.nebula = 1000; p.supplyMax2 = 400;
  const s = S.spawn(g, 0, 'spinewyrm', ...at(64, 64)), sup = p.supplyUsed2, T = S.D.units.trencher;
  assert.strictEqual(S.canMorph(g, 0, s, 'acidwing'), 'tech');
  S.step(g, [{ player: 0, type: 'morph', ids: [s.id], what: 'trencher' }]);
  assert(s.morph && s.morph.to === 'trencher');
  assert.strictEqual(p.supplyUsed2, sup + 2);
  assert.strictEqual(p.crystal, 1000 - T.cost.crystal); assert.strictEqual(p.nebula, 1000 - T.cost.nebula);
  const x0 = s.x;
  run(g, 20, [{ player: 0, type: 'move', ids: [s.id], x: s.x + 4 * S.TFP, y: s.y }]);
  assert.strictEqual(s.x, x0, '고치는 움직이지 않는다');
  run(g, T.time);
  const t = S.byId(g, s.id);
  assert.strictEqual(t.type, 'trencher'); assert.strictEqual(t.morph, null); assert.strictEqual(t.hp, t.hpMax);
}));

test('합체: 세이지 2 → 어센던트(새 id, 고치 후 완성), 보급 유지, 남는 1기는 그대로', () => arena(['elysian', 'legion'], g => {
  const ss = [0, 1, 2].map(i => S.spawn(g, 0, 'sage', ...at(60 + 3 * i, 64))), sup = g.players[0].supplyUsed2;
  const ev = run(g, 60 + S.D.units.ascendant.time, [{ player: 0, type: 'merge', ids: ss.map(e => e.id) }]);
  const as = g.ents.filter(e => e.owner === 0 && e.type === 'ascendant');
  assert.strictEqual(as.length, 1); assert(as[0].id > ss[2].id, '새 id');
  assert(!S.byId(g, ss[0].id) && !S.byId(g, ss[1].id) && S.byId(g, ss[2].id));
  assert(ev.some(x => x.t === 'merge' && x.a === ss[0].id && x.b === ss[1].id && x.id === as[0].id));
  assert(!ev.some(x => x.t === 'death' && (x.id === ss[0].id || x.id === ss[1].id)), '합체는 사망이 아니다');
  assert.strictEqual(g.players[0].supplyUsed2, sup, '2+2 → 4');
  assert.strictEqual(as[0].morph, null, '합체 진행 완료');
}));

// 3a 통합: 마법·수송·잠복·포격·변태·합체를 모두 쓰는 3인(레기온·스웜·엘리시안) 3000틱
function magicRun(seed) {
  const map = quadMap();
  try {
    const g = S.createGame({ seed, map, players: roster(0, 1, 2) }), sums = [], seen = {};
    for (const P of g.players) P.crystal = P.nebula = 5000;
    g.players[0].up.legion_optcloak = 1;
    Object.assign(g.players[1].up, { swarm_burrow: 1, swarm_bloater_transport: 1 });
    g.players[2].up.elysian_mindstorm = 1;
    const sp = (p, u, tx, ty) => S.spawn(g, p, u, ...at(tx, ty)), ids = a => a.map(e => e.id);
    const xy = (tx, ty) => { const [x, y] = at(tx, ty); return { x, y }; };
    const L = { corps: [sp(0, 'corpsman', 40, 40), sp(0, 'corpsman', 41, 41)], troops: [0, 1, 2, 3].map(i => sp(0, 'trooper', 38 + i, 43)),
      shade: sp(0, 'shade', 42, 40), bast: sp(0, 'bastion', 44, 44), ferry: sp(0, 'ferry', 38, 45), up: S.spawn(g, 0, 'uplink', 24, 24) };
    S.spawn(g, 1, 'wyrmpit', 96, 100);
    const W = { wyrms: [0, 1, 2].map(i => sp(1, 'spinewyrm', 86 + i, 88)), skit: [0, 1].map(i => sp(1, 'skitter', 86 + i, 90)), bloat: sp(1, 'bloater', 90, 90) };
    const E = { sages: [0, 1, 2].map(i => sp(2, 'sage', 86 + i, 40)), umbras: [0, 1].map(i => sp(2, 'umbra', 86 + i, 42)) };
    for (const e of [...E.sages, L.shade, ...L.corps]) e.energy = 200 * S.FP;
    const c0 = xy(64, 64);
    for (let t = 0; t < 3000; t++) {
      const c = [];
      if (t === 5) c.push({ player: 0, type: 'load', ids: ids(L.troops.slice(2)), target: L.ferry.id },
        { player: 0, type: 'cast', ids: [L.shade.id], what: 'optcloak' }, { player: 0, type: 'siege', ids: [L.bast.id] },
        { player: 1, type: 'morph', ids: [W.wyrms[0].id], what: 'trencher' }, { player: 1, type: 'burrow', ids: [W.wyrms[2].id] },
        { player: 1, type: 'load', ids: ids(W.skit), target: W.bloat.id }, { player: 2, type: 'merge', ids: ids(E.umbras) });
      if (t === 100) c.push({ player: 0, type: 'attackMove', ids: ids([...L.troops.slice(0, 2), L.shade]), ...c0 },
        { player: 0, type: 'move', ids: ids(L.corps), ...xy(60, 60) }, { player: 0, type: 'unload', ids: [L.ferry.id], ...xy(60, 60) },
        { player: 1, type: 'unload', ids: [W.bloat.id], ...xy(70, 70) }, { player: 1, type: 'attackMove', ids: [W.wyrms[1].id], ...c0 },
        { player: 2, type: 'move', ids: ids(E.sages), ...xy(70, 58) });
      if (t === 400 || t === 1400) c.push({ player: 2, type: 'cast', ids: ids(E.sages), what: 'mindstorm', ...c0 });
      if (t === 500) c.push({ player: 0, type: 'cast', ids: [L.up.id], what: 'scan', ...c0 });
      if (t === 700) c.push({ player: 1, type: 'unburrow', ids: [W.wyrms[2].id] }, { player: 0, type: 'unsiege', ids: [L.bast.id] });
      if (t === 1000) for (let p = 0; p < 3; p++) c.push({ player: p, type: 'attackMove', ids: g.ents.filter(e => e.owner === p && !e.isB && !e.def.worker && !e.parent).map(e => e.id), ...c0 });
      S.step(g, c); sums.push(S.checksum(g));
      if (g.fx.some(f => f.kind === 'area_dot')) seen.storm = true;
      if (g.fx.some(f => f.kind === 'reveal')) seen.scan = true;
      if (g.fx.some(f => f.kind === 'status')) seen.cloak = true;
      if (g.ents.some(e => e.inside)) seen.inside = true;
      if (g.ents.some(e => e.mode === 'burrow')) seen.burrow = true;
      if (g.ents.some(e => e.mode === 'siege')) seen.siege = true;
      if (g.ents.some(e => e.type === 'trencher' && !e.morph)) seen.trencher = true;
      if (g.ents.some(e => e.type === 'voidascendant')) seen.merge = true;
    }
    return { sums, seen };
  } finally { delete S.D.maps.__q4; }
}
test('결정론 3a: 마법·수송·잠복·포격·변태·합체 3000틱 매 틱 체크섬 일치', () => {
  const a = magicRun(1234), b = magicRun(1234);
  for (let i = 0; i < 3000; i++) if (a.sums[i] !== b.sums[i]) assert.fail(`tick ${i} checksum diverged`);
  for (const k of ['storm', 'scan', 'cloak', 'inside', 'burrow', 'siege', 'trencher', 'merge']) assert(a.seen[k], `시스템 미사용: ${k}`);
});

test('치료 자동 시전: 위치 사수는 사거리 안만(제자리), 공격 이동은 가며 치료 후 목적지로', () => arena(['legion', 'elysian'], g => {
  const c = S.spawn(g, 0, 'corpsman', ...at(64, 64)), near = S.spawn(g, 0, 'trooper', ...at(65, 64)), far = S.spawn(g, 0, 'trooper', ...at(64, 70));
  near.hp = far.hp = 10 * S.FP;
  run(g, 1, [{ player: 0, type: 'hold', ids: [c.id] }]);
  const x0 = c.x, y0 = c.y;
  run(g, 60);
  assert(near.hp > 10 * S.FP, '사거리 안 회복');
  assert.strictEqual(far.hp, 10 * S.FP, '사거리 밖은 안 감');
  assert(c.x === x0 && c.y === y0 && c.order && c.order.type === 'hold', '제자리·위치 사수 유지');
  const c2 = S.spawn(g, 0, 'corpsman', ...at(60, 60)), t2 = S.spawn(g, 0, 'trooper', ...at(60, 62));
  t2.hp = 10 * S.FP;
  run(g, 1, [{ player: 0, type: 'attackMove', ids: [c2.id], x: at(60, 80)[0], y: at(60, 80)[1] }]);
  run(g, 40);
  assert(t2.hp > 10 * S.FP, '공격 이동 중 회복');
  run(g, 600);
  assert(Math.abs(c2.y - at(60, 80)[1]) < S.TFP && !c2.order, '치료 후 목적지 도착');
}));

test('광학 위장: 이동 중 켜도 이동 명령 유지(자기 대상 시전은 즉시)', () => arena(['legion', 'elysian'], g => {
  g.players[0].up.legion_optcloak = 1;
  const s = S.spawn(g, 0, 'shade', ...at(60, 60));
  run(g, 1, [{ player: 0, type: 'move', ids: [s.id], x: at(70, 60)[0], y: at(70, 60)[1] }]);
  run(g, 1, [{ player: 0, type: 'cast', ids: [s.id], what: 'optcloak' }]);
  assert(S.cloaked(s), '켜짐');
  assert(s.order && s.order.type === 'move', '이동 유지');
  run(g, 300);
  assert(Math.abs(s.x - at(70, 60)[0]) < S.TFP, '목적지 도착');
}));

test('수송: 공중 수송선이 건물 위에 떠 있으면 수송선이 내려와 태운다', () => arena(['legion', 'elysian'], g => {
  const d = S.spawn(g, 0, 'depot', 60, 60), f = S.spawn(g, 0, 'ferry', d.x, d.y), t = S.spawn(g, 0, 'trooper', ...at(60, 66));
  run(g, 1, [{ player: 0, type: 'load', ids: [t.id], target: f.id }]);
  run(g, 400);
  assert.strictEqual(t.inside, f.id, '탑승');
}));

// ── 3a 최종 리뷰 ──
// 보급 재계산: 유닛(소환 제외) + 고치 차이 + 생산 큐
function supplyRecount(g, p) {
  let s = 0;
  for (const e of g.ents) {
    if (e.owner !== p || e.isR) continue;
    if (e.isB) { for (const q of e.queue) { if (q.research) continue; const u = S.D.units[q.what]; s += Math.round((u.supply || 0) * 2) * (u.count || 1); } continue; }
    if (!e.free) s += Math.round((e.def.supply || 0) * 2);
    if (e.morph && e.morph.to !== e.type) s += Math.round((S.D.units[e.morph.to].supply || 0) * 2) - Math.round((e.def.supply || 0) * 2);
  }
  return s;
}

test('합체: 같은 id 중복은 자기 자신과 합체하지 않는다(보급 = 재계산)', () => arena(['elysian', 'legion'], g => {
  const s = S.spawn(g, 0, 'sage', ...at(60, 64)), sup = g.players[0].supplyUsed2;
  run(g, 60 + S.D.units.ascendant.time, [{ player: 0, type: 'merge', ids: [s.id, s.id] }]);
  assert(S.byId(g, s.id), '세이지 유지');
  assert(!g.ents.some(e => e.type === 'ascendant'), '어센던트 없음');
  assert.strictEqual(g.players[0].supplyUsed2, sup);
  assert.strictEqual(g.players[0].supplyUsed2, supplyRecount(g, 0));
}));

test('상태 가드: 잠복 드러지는 건설·채취 명령 무시, 탑승 엔지니어는 채취 명령 무시', () => {
  arena(['swarm', 'legion'], g => {
    g.players[0].up.swarm_burrow = 1; g.players[0].crystal = 5000;
    const d = S.spawn(g, 0, 'drudge', ...at(60, 64)), ctl = S.spawn(g, 0, 'drudge', ...at(60, 66));
    run(g, 20, [{ player: 0, type: 'burrow', ids: [d.id] }]);
    assert.strictEqual(d.mode, 'burrow');
    S.step(g, [{ player: 0, type: 'build', ids: [d.id], what: 'nest', tx: 70, ty: 70 }, { player: 0, type: 'build', ids: [ctl.id], what: 'nest', tx: 70, ty: 70 }]);
    assert(ctl.order && ctl.order.type === 'build', '대조군은 건설');
    assert(!(d.order && d.order.type === 'build'), '잠복 중 건설 무시');
    const cr = g.ents.find(e => e.type === 'crystal');
    S.step(g, [{ player: 0, type: 'gather', ids: [d.id, ctl.id], target: cr.id }]);
    assert(ctl.order && ctl.order.type === 'gather', '대조군은 채취');
    assert(!(d.order && d.order.type === 'gather'), '잠복 중 채취 무시');
  });
  arena(['legion', 'elysian'], g => {
    const f = S.spawn(g, 0, 'ferry', ...at(64, 64)), w = S.spawn(g, 0, 'engineer', ...at(65, 64));
    run(g, 200, [{ player: 0, type: 'load', ids: [w.id], target: f.id }]);
    assert.strictEqual(w.inside, f.id);
    const cr = g.ents.find(e => e.type === 'crystal');
    run(g, 100, [{ player: 0, type: 'gather', ids: [w.id], target: cr.id }]);
    assert(!(w.order && w.order.type === 'gather'), '탑승 중 채취 무시');
    assert.strictEqual(w.inside, f.id);
  });
});

test('소환: 시간제한 만료 후 보급이 음수가 되지 않는다', () => arena(['legion', 'elysian'], g => {
  const A = S.D.abilities, cdef = S.D.units.corpsman, old = cdef.abilities;
  A.__sum = { name: 't', race: 'legion', cost: 10, target: 'point', range: 320, effect: { kind: 'summon', unit: 'trooper', count: 2, life: 40 } };
  cdef.abilities = ['heal', '__sum'];
  try {
    const c = S.spawn(g, 0, 'corpsman', ...at(64, 64)); c.energy = 200 * S.FP;
    const sup = g.players[0].supplyUsed2, [sx, sy] = at(64, 60);
    run(g, 1, [{ player: 0, type: 'cast', ids: [c.id], what: '__sum', x: sx, y: sy }]);
    assert.strictEqual(g.ents.filter(x => x.owner === 0 && x.type === 'trooper').length, 2);
    run(g, 45);
    assert.strictEqual(g.ents.filter(x => x.owner === 0 && x.type === 'trooper').length, 0);
    assert.strictEqual(g.players[0].supplyUsed2, sup, '만료 후 보급 그대로');
    assert.strictEqual(g.players[0].supplyUsed2, supplyRecount(g, 0));
  } finally { cdef.abilities = old; delete A.__sum; }
}));

test('시전 가드: 미탐지 위장 적은 대상 불가, 잠복 중 시전 불가', () => arena(['swarm', 'elysian'], g => {
  const A = S.D.abilities, bdef = S.D.units.blighter, old = bdef.abilities;
  A.__hit = { name: 't', race: 'swarm', cost: 10, target: 'unit', range: 320, filter: 'enemy', effect: { kind: 'instant', dmg: 5 } };
  bdef.abilities = ['__hit'];
  try {
    g.players[0].up.swarm_burrow = 1;
    const b = S.spawn(g, 0, 'blighter', ...at(64, 64)); b.energy = 200 * S.FP;
    const um = S.spawn(g, 1, 'umbra', ...at(66, 64)), hp = um.hp + um.shield;
    assert(S.cloaked(um) && !S.detected(g, 0, um));
    run(g, 5, [{ player: 0, type: 'cast', ids: [b.id], what: '__hit', target: um.id }]);
    assert.strictEqual(um.hp + um.shield, hp, '미탐지 위장 적에게 시전 안 됨');
    assert.strictEqual(b.energy >= 195 * S.FP, true);
    run(g, 20, [{ player: 0, type: 'burrow', ids: [b.id] }]);
    assert.strictEqual(b.mode, 'burrow');
    assert.strictEqual(S.canCast(g, 0, b, '__hit'), 'busy');
  } finally { bdef.abilities = old; delete A.__hit; }
}));

test('불변식 퍼즈: 무작위 3a 명령 5시드×1500틱 — 예외 없음, 보급 = 재계산, 탑승은 살아 있는 수송선', () => {
  const types = ['cast', 'autocast', 'load', 'unload', 'burrow', 'unburrow', 'siege', 'unsiege', 'morph', 'merge', 'gather', 'build', 'move', 'stop'];
  const abil = Object.keys(S.D.abilities), units = Object.keys(S.D.units), blds = Object.keys(S.D.buildings), T = S.TFP;
  for (let seed = 1; seed <= 5; seed++) {
    let rs = seed * 7919; const R = n => { rs = (Math.imul(rs, 1103515245) + 12345) >>> 0; return (rs >>> 8) % n; };
    const races = [['legion', 'swarm'], ['elysian', 'legion'], ['swarm', 'elysian']][seed % 3];
    const g = S.createGame({ seed, races, map: 'crossing' });
    for (const p of g.players) { p.crystal = 50000; p.nebula = 50000; for (const u in S.D.upgrades) if (S.D.upgrades[u].race === p.race) p.up[u] = S.D.upgrades[u].levels; }
    for (let p = 0; p < 2; p++) for (const u of units) {
      if (S.D.units[u].race !== g.players[p].race) continue;
      for (let k = 0; k < 2; k++) { const e = S.spawn(g, p, u, (55 + R(18)) * T + 16, (55 + R(18)) * T + 16); if (e.def.energy) e.energy = 200 * S.FP; }
    }
    for (let t = 0; t < 1500; t++) {
      const cmds = [];
      for (let k = 0; k < 3; k++) {
        const ids = [], n = 1 + R(6);
        for (let i = 0; i < n; i++) ids.push(g.ents[R(g.ents.length)].id);
        const tgt = g.ents[R(g.ents.length)], ty = types[R(types.length)];
        cmds.push({ player: R(3), type: ty, ids, what: ty === 'build' ? blds[R(blds.length)] : R(2) ? abil[R(abil.length)] : units[R(units.length)],
          target: R(5) ? tgt.id : R(99999), x: R(4) ? tgt.x + R(200 * S.FP) - 100 * S.FP : R(1e7) - 5e6, y: R(4) ? tgt.y : R(1e7) - 5e6,
          on: R(2) === 1, tx: R(128), ty: R(128) });
      }
      try { S.step(g, cmds); } catch (err) { throw new Error(`seed ${seed} t ${t}: ${err.message} ${JSON.stringify(cmds)}`); }
      for (let p = 0; p < 2; p++) assert.strictEqual(g.players[p].supplyUsed2, supplyRecount(g, p), `seed ${seed} t ${t} p${p} 보급`);
      for (const e of g.ents) if (e.inside) { const tr = S.byId(g, e.inside); assert(tr && tr.hp > 0 && tr.def.transport, `seed ${seed} t ${t} ${e.type} 탑승 대상 없음`); }
    }
  }
});

// ── 효과 라이브러리 확장(정체성 설계 §4): 시험 전용 능력을 잠시 붙여 데이터만으로 동작 확인 ──
// defs를 D.abilities에 넣고 unit(기본 코프스맨)의 능력으로 교체 → fn → 원복
function withSpells(defs, fn, unit = 'corpsman') {
  const A = S.D.abilities, d = S.D.units[unit], old = d.abilities;
  for (const k in defs) A[k] = Object.assign({ name: 't', race: d.race, cost: 10, range: 320 }, defs[k]);
  d.abilities = Object.keys(defs);
  try { return fn(); } finally { d.abilities = old; for (const k in defs) delete A[k]; }
}
const castAt = (p, e, what, x, y) => ({ player: p, type: 'cast', ids: [e.id], what, x, y });
const castOn = (p, e, what, t) => ({ player: p, type: 'cast', ids: [e.id], what, target: t.id });

test('zone 즉발(left 1): 적 마나·보호막 소거, 아군 무관, 같은 마법 2기는 중첩 없음, 다음 틱 소멸', () => withSpells({
  __burst: { target: 'point', effect: { kind: 'zone', r: 48, left: 1, enemy: { energy: 100, shield: 100 } } },
}, () => arena(['legion', 'elysian'], g => {
  const c1 = S.spawn(g, 0, 'corpsman', ...at(60, 64)), c2 = S.spawn(g, 0, 'corpsman', ...at(60, 65));
  for (const c of [c1, c2]) { c.energy = 200 * S.FP; c.auto = ''; }
  const s = S.spawn(g, 1, 'sage', ...at(66, 64)), al = S.spawn(g, 0, 'corpsman', ...at(66, 65));
  s.energy = 150 * S.FP; al.energy = 100 * S.FP; al.auto = '';
  S.step(g, [{ player: 0, type: 'cast', ids: [c1.id, c2.id], what: '__burst', x: s.x, y: s.y }]);
  assert.strictEqual(s.energy, 50 * S.FP + S.ENERGY_REGEN, '100만 소거(중첩 없음)');
  assert.strictEqual(s.shield, 0);
  assert.strictEqual(s.hp, s.hpMax, '체력 무피해');
  assert.strictEqual(al.energy, 100 * S.FP + S.ENERGY_REGEN, '아군 무관');
  assert.strictEqual(g.fx.length, 0, '즉발은 같은 틱에 끝');
})));

test('zone 지속: 총량을 left로 나눠 틱마다(아군 회복·적 피해), 플래그는 범위 안에만, 건물 제외', () => withSpells({
  __mat: { target: 'point', effect: { kind: 'zone', r: 64, left: 20, ally: { heal: 20 }, enemy: { dmg: 20, flag: 'slowed' }, all: { flag: 'marked' } } },
}, () => arena(['legion', 'elysian'], g => {
  const c = S.spawn(g, 0, 'corpsman', ...at(60, 64)); c.energy = 200 * S.FP; c.auto = '';
  const f = S.spawn(g, 0, 'ferry', ...at(66, 64)), s = S.spawn(g, 1, 'sage', ...at(67, 64)), far = S.spawn(g, 1, 'sage', ...at(80, 64));
  const b = S.spawn(g, 1, 'resonator', ...at(66, 66)), bhp = b.hp + b.shield;
  f.hp = 10 * S.FP;
  S.step(g, [castAt(0, c, '__mat', f.x, f.y)]);
  assert.strictEqual(f.hp, 11 * S.FP, '아군 회복 20/20틱 = 틱당 1');
  assert(s.stf & S.STF.slowed, '적 감속'); assert(s.stf & S.STF.marked, 'all 플래그(적)');
  assert(f.stf & S.STF.marked, 'all 플래그(아군)'); assert(!(f.stf & S.STF.slowed), '아군은 enemy 플래그 없음');
  assert.strictEqual(far.stf, 0, '범위 밖');
  run(g, 19);
  assert.strictEqual(f.hp, 30 * S.FP, '총 20 회복');
  // 적 피해: 틱당 1, 같은 zone의 all 표식이 플래그 단계에서 먼저 붙어 첫 틱부터 +25% → 20×1.25
  assert.strictEqual(s.hpMax + s.shieldMax - s.hp - s.shield, 20 * (S.FP + (S.FP >> 2)));
  assert.strictEqual(b.hp + b.shield, bhp, '건물 제외');
  assert.strictEqual(g.fx.length, 0);
  S.step(g, []); assert.strictEqual(s.stf, 0, '끝나면 플래그 해제');
})));

test('fx delay: 지점 효과가 delay 틱 뒤 시작(그동안 무적용), 체크섬 포함; needVis: 시야 밖 지점은 시전 안 됨', () => withSpells({
  __drop: { target: 'point', range: 0, needVis: true, effect: { kind: 'area_dot', r: 56, dmg: 50, left: 1, delay: 10 } },
}, () => arena(['legion', 'elysian'], g => {
  const c = S.spawn(g, 0, 'corpsman', ...at(64, 64)); c.energy = 200 * S.FP; c.auto = '';
  const s = S.spawn(g, 1, 'sage', ...at(66, 64)), hp0 = s.hp + s.shield;
  S.step(g, []); // 시야 갱신
  const [fx, fy] = at(110, 110);
  S.step(g, [castAt(0, c, '__drop', fx, fy)]);
  assert.strictEqual(g.fx.length, 0, '시야 밖 → 시전 안 됨');
  assert(c.energy > 195 * S.FP, '마나 그대로'); assert.strictEqual(c.order, null);
  S.step(g, [castAt(0, c, '__drop', s.x, s.y)]);
  assert.strictEqual(g.fx.length, 1); assert.strictEqual(g.fx[0].delay, 9);
  const ck = S.checksum(g); g.fx[0].delay++; assert.notStrictEqual(S.checksum(g), ck, '체크섬에 delay'); g.fx[0].delay--;
  run(g, 9);
  assert.strictEqual(s.hp + s.shield, hp0, '대기 중 무피해');
  assert.strictEqual(g.fx.length, 1); assert.strictEqual(g.fx[0].delay, 0);
  S.step(g, []);
  assert.strictEqual(hp0 - s.hp - s.shield, 50 * S.FP, 'delay 10틱 뒤 적용');
  assert.strictEqual(g.fx.length, 0);
})));

test('instant.cleanse + filter ally: 적이 건 status만 제거(자신·기계 포함), 적·건물은 대상 불가', () => withSpells({
  __cl: { target: 'unit', filter: 'ally', effect: { kind: 'instant', cleanse: true } },
  __haste: { target: 'unit', filter: 'ally', effect: { kind: 'status', flag: 'hasted', left: 200 } },
}, () => withSpells({
  __root: { target: 'unit', filter: 'enemy', effect: { kind: 'status', flag: 'rooted', left: 200 } },
}, () => arena(['legion', 'elysian'], g => {
  const c = S.spawn(g, 0, 'corpsman', ...at(60, 64)); c.energy = 200 * S.FP; c.auto = '';
  const f = S.spawn(g, 0, 'ferry', ...at(62, 64)), e = S.spawn(g, 1, 'sage', ...at(66, 64)); e.energy = 200 * S.FP;
  const hq = g.ents.find(x => x.owner === 0 && x.isB);
  run(g, 3, [castOn(1, e, '__root', f)]); run(g, 3, [castOn(1, e, '__root', c)]); run(g, 3, [castOn(0, c, '__haste', f)]);
  assert(f.stf & S.STF.rooted && f.stf & S.STF.hasted && c.stf & S.STF.rooted);
  run(g, 2, [castOn(0, c, '__cl', f)]);
  assert(!(f.stf & S.STF.rooted), '기계 아군 정화'); assert(f.stf & S.STF.hasted, '아군이 건 상태는 유지');
  run(g, 2, [castOn(0, c, '__cl', c)]);
  assert(!(c.stf & S.STF.rooted), '자신 정화');
  const en = c.energy;
  S.step(g, [castOn(0, c, '__cl', e)]); assert.strictEqual(c.order, null, '적 대상 불가');
  S.step(g, [castOn(0, c, '__cl', hq)]); assert.strictEqual(c.order, null, '건물 대상 불가');
  assert.strictEqual(c.energy, en + 2 * S.ENERGY_REGEN);
}), 'sage')));

test('instant.burnEnergy: 대상 마나 전부 → 피해(보호막 먼저), 마나 0', () => withSpells({
  __echo: { target: 'unit', filter: 'enemy', effect: { kind: 'instant', burnEnergy: true } },
}, () => arena(['legion', 'elysian'], g => {
  const c = S.spawn(g, 0, 'corpsman', ...at(60, 64)); c.energy = 200 * S.FP; c.auto = '';
  const s = S.spawn(g, 1, 'sage', ...at(64, 64)); s.energy = 80 * S.FP;
  S.step(g, [castOn(0, c, '__echo', s)]);
  assert.strictEqual(s.energy, S.ENERGY_REGEN, '마나 0(+같은 틱 재생)');
  assert.strictEqual(s.shield, 0); assert.strictEqual(s.hp, 20 * S.FP, '80 = 보호막 50 + 체력 30');
  const t = S.spawn(g, 1, 'oathblade', ...at(64, 66)), hp = t.hp + t.shield;
  run(g, 3, [castOn(0, c, '__echo', t)]);
  assert.strictEqual(t.hp + t.shield, hp, '마나 없는 대상은 무피해');
})));

test('instant.drainEnergy + share: 피해 없이 대상 마나 전부 → 시전자 반경 안 같은 팀 마나 유닛에 id 순 균등(나머지 작은 id부터, 최대치 초과 소멸)', () => withSpells({
  __drain: { target: 'unit', filter: 'enemy', cost: 0, effect: { kind: 'instant', drainEnergy: true, share: { r: 6 } } },
  __drainR: { target: 'unit', filter: 'enemy', cost: 0, effect: { kind: 'instant', drainEnergy: true, share: { r: 6, race: 'elysian' } } },
  __drain0: { target: 'unit', filter: 'enemy', cost: 0, effect: { kind: 'instant', drainEnergy: true } },
}, () => arena(['legion', 'elysian'], g => {
  const R = S.ENERGY_REGEN, mx = 200 * S.FP;
  const c = S.spawn(g, 0, 'corpsman', ...at(60, 64)), a1 = S.spawn(g, 0, 'corpsman', ...at(61, 64)), a2 = S.spawn(g, 0, 'corpsman', ...at(60, 66));
  const far = S.spawn(g, 0, 'corpsman', ...at(60, 74)), tr = S.spawn(g, 0, 'trooper', ...at(61, 65));
  for (const u of [c, a1, a2, far]) u.auto = '';
  const s = S.spawn(g, 1, 'sage', ...at(64, 64)), hp = s.hp + s.shield;
  c.energy = 100 * S.FP; a1.energy = mx - 1000; a2.energy = 0; far.energy = 0; s.energy = 100 * S.FP + 1;
  S.step(g, [castOn(0, c, '__drain', s)]);
  const d = 100 * S.FP + 1, q = Math.floor(d / 3); // 25601 / 3 = 8533 나머지 2 → c·a1 +1
  assert.strictEqual(s.energy, R, '대상 마나 0(+재생)'); assert.strictEqual(s.hp + s.shield, hp, '피해 없음');
  assert.strictEqual(c.energy, 100 * S.FP + q + 1 + R, '시전자 포함, 나머지 1');
  assert.strictEqual(a1.energy, mx, '최대치에서 멈춤');
  assert.strictEqual(a2.energy, q + R, '가장 큰 id 는 몫만');
  assert.strictEqual(far.energy, R, '반경 밖 무관'); assert(!tr.energy, '마나 없는 유닛 무관');
  s.energy = 50 * S.FP; const e0 = c.energy;
  S.step(g, [castOn(0, c, '__drainR', s)]);
  assert.strictEqual(s.energy, R); assert.strictEqual(c.energy, e0 + R, 'race 제한: 다른 종족은 못 받음');
  s.energy = 50 * S.FP; const e1 = c.energy;
  S.step(g, [castOn(0, c, '__drain0', s)]);
  assert.strictEqual(s.energy, R); assert.strictEqual(c.energy, e1 + R, 'share 없으면 소멸만');
})));

test('zone.ally.mech: 같은 팀 기계(차량·함선)만 회복, 생체·적 기계 무관(총량 = left 동안 정확히 heal)', () => withSpells({
  __rep: { target: 'point', cost: 0, effect: { kind: 'zone', r: 128, left: 160, ally: { heal: 150, mech: true } } },
}, () => arena(['legion', 'legion'], g => {
  const c = S.spawn(g, 0, 'corpsman', ...at(60, 64)); c.auto = '';
  const h = S.spawn(g, 0, 'hound', ...at(64, 64)), p = S.spawn(g, 0, 'ferry', ...at(65, 65)), t = S.spawn(g, 0, 'trooper', ...at(64, 65)), e = S.spawn(g, 1, 'hound', ...at(63, 63));
  for (const u of [h, p, t, e]) { u.hp = 10 * S.FP; u.order = { type: 'hold' }; }
  g.players[1].team = 9; g.players[0].team = 9; // 싸우지 않게 같은 팀 → e 는 '아군'이 되어야 회복
  const [x, y] = at(64, 64);
  run(g, 161, [castAt(0, c, '__rep', x, y)]);
  assert.strictEqual(h.hp, h.hpMax, '차량 회복(최대치에서 멈춤)'); assert.strictEqual(p.hp, 160 * S.FP, '함선 정확히 150 회복');
  assert.strictEqual(t.hp, 10 * S.FP, '생체 무관'); assert.strictEqual(e.hp, e.hpMax, '같은 팀 다른 플레이어 기계도 회복');
}) || arena(['legion', 'legion'], g => {
  const c = S.spawn(g, 0, 'corpsman', ...at(60, 64)), f = S.spawn(g, 1, 'ferry', ...at(64, 64)); c.auto = ''; f.hp = 10 * S.FP;
  run(g, 20, [castAt(0, c, '__rep', f.x, f.y)]);
  assert.strictEqual(f.hp, 10 * S.FP, '적 기계 무관');
})));

test('aura drain·toggle: 켜 둔 동안 마나 지속 소모, 다시 시전 = 끄기(무료), 바닥나면 해제', () => withSpells({
  __prism: { target: 'self', toggle: true, cost: 25, range: 0, effect: { kind: 'aura', flag: 'cloaked', r: 80, left: -1, drain: 12 } },
}, () => arena(['legion', 'elysian'], g => {
  const c = S.spawn(g, 0, 'corpsman', ...at(64, 64)), t = S.spawn(g, 0, 'trooper', ...at(65, 64)); c.auto = '';
  c.energy = 100 * S.FP;
  const on = { player: 0, type: 'cast', ids: [c.id], what: '__prism' };
  S.step(g, [on]);
  assert(S.cloaked(t) && S.cloaked(c));
  assert.strictEqual(c.energy, 75 * S.FP - 12 + S.ENERGY_REGEN, '시전 25 + 첫 틱 소모');
  const e1 = c.energy; S.step(g, []); assert.strictEqual(c.energy, e1 - 12 + S.ENERGY_REGEN, '틱당 drain');
  S.step(g, [on]); assert(!S.cloaked(t), '끄기'); const e2 = c.energy; S.step(g, []); assert(c.energy > e2, '끄면 재생만');
  c.energy = 26 * S.FP; S.step(g, [on]); assert(S.cloaked(t));
  run(g, 100); assert(!S.cloaked(t), '마나 바닥 → 해제'); assert.strictEqual(g.fx.length, 0);
})));

test('marked: 받는 피해 +25% — 무기(calcDamage)·마법 피해 모두', () => withSpells({
  __mark: { target: 'unit', filter: 'enemy', effect: { kind: 'status', flag: 'marked', left: 100 } },
  __hit: { target: 'unit', filter: 'enemy', effect: { kind: 'instant', dmg: 40 } },
}, () => arena(['legion', 'elysian'], g => {
  const c = S.spawn(g, 0, 'corpsman', ...at(60, 64)); c.energy = 200 * S.FP; c.auto = '';
  const s = S.spawn(g, 1, 'sage', ...at(64, 64)), w = S.D.units.oathblade.weapon;
  const base = S.calcDamage(w, s);
  S.step(g, [castOn(0, c, '__mark', s)]); assert(s.stf & S.STF.marked);
  const mk = S.calcDamage(w, s);
  assert.strictEqual(mk.shield + mk.hp, 20 * S.FP + (20 * S.FP >> 2), '보호막 대상: 20 → 25');
  assert(base.shield + base.hp === 20 * S.FP);
  const hp = s.hp + s.shield;
  run(g, 2, [castOn(0, c, '__hit', s)]);
  assert.strictEqual(hp - s.hp - s.shield, 50 * S.FP, '마법 40 → 50');
})));

test('hasted: 이동 속도 ×1.5 (speed + speed>>1)', () => withSpells({
  __amp: { target: 'self', range: 0, effect: { kind: 'aura', flag: 'hasted', r: 400, left: 100 } },
}, () => arena(['legion', 'elysian'], g => {
  const c = S.spawn(g, 0, 'corpsman', ...at(60, 60)); c.energy = 200 * S.FP; c.auto = '';
  const a = S.spawn(g, 0, 'trooper', ...at(60, 61)), b = S.spawn(g, 0, 'trooper', ...at(60, 95));
  S.step(g, [{ player: 0, type: 'cast', ids: [c.id], what: '__amp' }]);
  assert(a.stf & S.STF.hasted); assert(!(b.stf & S.STF.hasted));
  const ax = a.x, bx = b.x;
  run(g, 1, [{ player: 0, type: 'move', ids: [a.id], x: ax + 10 * S.TFP, y: a.y }, { player: 0, type: 'move', ids: [b.id], x: bx + 10 * S.TFP, y: b.y }]);
  run(g, 4);
  const sp = Math.trunc(3 * S.FP);
  assert.strictEqual(b.x - bx, 5 * sp, '보통 속도');
  assert.strictEqual(a.x - ax, 5 * (sp + (sp >> 1)), '1.5배');
})));

test('stasis(zone all): 피아 모두 이동·공격·시전 불가, 무기·마법·범위 피해 면역, 대상 지정·아군 오라 면역, 끝나면 해제', () => withSpells({
  __jail: { target: 'point', effect: { kind: 'zone', r: 48, left: 30, all: { flag: 'stasis' } } },
  __storm: { target: 'point', effect: { kind: 'area_dot', r: 64, dmg: 40, left: 10 } },
  __hit: { target: 'unit', filter: 'any', effect: { kind: 'instant', dmg: 10 } },
  __amp: { target: 'self', range: 0, effect: { kind: 'aura', flag: 'hasted', r: 400, left: -1 } },
}, () => arena(['legion', 'elysian'], g => {
  const c = S.spawn(g, 0, 'corpsman', ...at(58, 64)); c.energy = 200 * S.FP; c.auto = '';
  const t = S.spawn(g, 1, 'oathblade', ...at(66, 64)), mate = S.spawn(g, 0, 'corpsman', ...at(66, 65)); mate.energy = 200 * S.FP; mate.auto = '';
  const shooter = S.spawn(g, 0, 'trooper', ...at(63, 60));
  S.step(g, [{ player: 0, type: 'cast', ids: [c.id], what: '__amp' }]);
  S.step(g, [castAt(0, c, '__jail', t.x, t.y)]);
  const J = S.STF.stasis | S.STF.rooted | S.STF.disarmed;
  assert.strictEqual(t.stf & J, J); assert.strictEqual(mate.stf & J, J, '아군도 갇힘');
  assert(!(mate.stf & S.STF.hasted), '범위 효과(아군 오라) 면역'); assert(c.stf & S.STF.hasted);
  assert.strictEqual(S.canCast(g, 0, mate, '__hit'), 'busy', '갇힌 유닛은 시전 불가');
  const hp = t.hp + t.shield, mhp = mate.hp, tx = t.x;
  run(g, 1, [castAt(0, c, '__storm', t.x, t.y)]);
  run(g, 1, [castOn(0, c, '__hit', t)]); assert.strictEqual(c.order, null, '대상 지정 불가');
  run(g, 15, [{ player: 0, type: 'attack', ids: [shooter.id], target: t.id }, { player: 1, type: 'move', ids: [t.id], x: tx + 6 * S.TFP, y: t.y }]);
  assert.strictEqual(t.hp + t.shield, hp, '무기·범위 피해 면역'); assert.strictEqual(mate.hp, mhp);
  assert.strictEqual(t.x, tx, '이동 불가');
  assert(!S.byId(g, t.id) || t.stf & S.STF.stasis);
  run(g, 20);
  assert(!(t.stf & S.STF.stasis), '30틱 뒤 해제'); assert(mate.stf & S.STF.hasted);
  run(g, 1, [{ player: 0, type: 'attack', ids: [shooter.id], target: t.id }]);
  run(g, 40);
  assert(t.hp + t.shield < hp, '해제 후 공격 가능');
})));

test('stasis 빈틈: 갇힌 유닛·수송선 태우기 불가, 수리·함재기 생산 정지, 켜진 오라는 갇혀도 끌 수 있음', () => withSpells({
  __jail: { target: 'point', effect: { kind: 'zone', r: 96, left: 60, all: { flag: 'stasis' } } },
  __tog: { target: 'self', range: 0, toggle: true, cost: 0, effect: { kind: 'aura', flag: 'hasted', r: 64, left: -1, drain: 1 } },
}, () => arena(['legion', 'elysian'], g => {
  const c = S.spawn(g, 0, 'corpsman', ...at(58, 64)); c.energy = 200 * S.FP; c.auto = '';
  const mate = S.spawn(g, 0, 'corpsman', ...at(64, 63)); mate.energy = 200 * S.FP; mate.auto = '';
  const t = S.spawn(g, 0, 'trooper', ...at(63, 64)), fOut = S.spawn(g, 0, 'ferry', ...at(56, 64));
  const fIn = S.spawn(g, 0, 'ferry', ...at(65, 65)), tOut = S.spawn(g, 0, 'trooper', ...at(56, 66));
  const eng = S.spawn(g, 0, 'engineer', ...at(64, 66)), b = S.spawn(g, 0, 'bastion', ...at(65, 66)); b.hp = b.hpMax >> 1;
  const ark = S.spawn(g, 1, 'ark', ...at(66, 63)); ark.hangar = 0;
  g.players[0].crystal = g.players[0].nebula = g.players[1].crystal = 1000; // 수리·함재기 비용
  run(g, 1, [{ player: 0, type: 'cast', ids: [mate.id], what: '__tog' }]);
  assert(g.fx.some(f => f.ab === '__tog'), '오라 켜짐');
  run(g, 20, [{ player: 0, type: 'repair', ids: [eng.id], target: b.id }]);
  assert(b.hp > b.hpMax >> 1, '수리 진행 중');
  S.step(g, [castAt(0, c, '__jail', ...at(64, 64))]);
  for (const u of [mate, t, fIn, eng, b, ark]) assert(u.stf & S.STF.stasis, 'stasis ' + u.type);
  assert.strictEqual(S.canLoad(g, 0, fOut, t), 'tech', '갇힌 유닛 태우기 불가');
  assert.strictEqual(S.canLoad(g, 0, fIn, tOut), 'tech', '갇힌 수송선에 태우기 불가');
  run(g, 30, [{ player: 0, type: 'load', ids: [fOut.id], target: t.id }]);
  assert.strictEqual(t.inside, 0, '구출 불가');
  const hp = b.hp, lt = ark.lt;
  assert(lt > 0, '함재기 생산 중');
  run(g, 10);
  assert.strictEqual(b.hp, hp, '수리 정지'); assert.strictEqual(ark.lt, lt, '함재기 생산 정지');
  assert.strictEqual(S.canCast(g, 0, mate, '__tog'), '', '켜진 토글 끄기는 가능');
  run(g, 1, [{ player: 0, type: 'cast', ids: [mate.id], what: '__tog' }]);
  assert(!g.fx.some(f => f.ab === '__tog'), '오라 꺼짐');
  assert.strictEqual(S.canCast(g, 0, mate, '__tog'), 'busy', '다시 켜기는 불가');
})));

// ── 3b 마법 데이터(정체성 설계 §5): 시전자마다 실제 데이터로 시전 가능 + 효과 확인 ──
// [능력, 이름, 시전자(유닛/건물), 종족 쌍(0번 = 시전자), fn(g, c, P)] — 시전자는 0번 (60,64)(건물은 타일 60,62), 마나 200, 요구 연구 완료, 자동 시전 끔
const SPELLS_3B = [
  ['heal', '치료', 'corpsman', ['legion', 'elysian'], (g, c) => {
    const t = S.spawn(g, 0, 'trooper', ...at(61, 64)); t.hp = 10 * S.FP;
    run(g, 3, [castOn(0, c, 'heal', t)]); assert(t.hp > 10 * S.FP);
  }],
  ['smoke', '연막 구역', 'corpsman', ['legion', 'elysian'], (g, c) => {
    const t = S.spawn(g, 0, 'trooper', ...at(64, 64)), far = S.spawn(g, 0, 'trooper', ...at(64, 70));
    run(g, 2, [castAt(0, c, 'smoke', t.x, t.y)]);
    assert(S.cloaked(t), '안의 아군 위장'); assert(!S.cloaked(far), '범위 밖'); assert(!S.cloaked(c));
  }],
  ['optcloak', '반사 망토', 'shade', ['legion', 'elysian'], (g, c) => { run(g, 1, [{ player: 0, type: 'cast', ids: [c.id], what: 'optcloak' }]); assert(S.cloaked(c)); }],
  ['mark', '표식', 'shade', ['legion', 'elysian'], (g, c) => {
    const s = S.spawn(g, 1, 'sage', ...at(66, 64));
    run(g, 2, [castOn(0, c, 'mark', s)]); assert(s.stf & S.STF.marked);
    assert.strictEqual(g.fx.find(f => f.ab === 'mark').left, 240 - 2);
  }],
  ['discharge', '방전탄', 'shade', ['legion', 'elysian'], (g, c) => {
    const s = S.spawn(g, 1, 'sage', ...at(66, 64)); s.energy = 150 * S.FP;
    run(g, 2, [castAt(0, c, 'discharge', s.x, s.y)]);
    assert(s.energy < 51 * S.FP, '마나 100 소거'); assert.strictEqual(s.shield, 0, '결정막 소거');
  }],
  ['seeker', '시커', 'hound', ['legion', 'elysian'], (g, c) => {
    assert.strictEqual(c.energy, 0, '마나 없음');
    run(g, 1, [{ player: 0, type: 'cast', ids: [c.id], what: 'seeker' }]);
    const ds = g.ents.filter(e => e.type === 'seeker' && e.owner === 0);
    assert.strictEqual(ds.length, 2); assert(ds.every(d => d.free && d.life > 0 && d.life <= 200));
    assert.strictEqual(c.ccd, 400 - 1, '쿨다운 400');
    run(g, 1, [{ player: 0, type: 'cast', ids: [c.id], what: 'seeker' }]);
    assert.strictEqual(g.ents.filter(e => e.type === 'seeker').length, 2, '쿨다운 중 재시전 안 됨');
    const o = S.spawn(g, 1, 'oathblade', ...at(60, 60)), hp = o.hp + o.shield;
    run(g, 120);
    assert(o.hp + o.shield < hp && !g.ents.some(e => e.type === 'seeker'), '가까운 지상 적에게 자폭');
  }],
  ['cleanse', '정화', 'surveyor', ['legion', 'elysian'], (g, c) => {
    const t = S.spawn(g, 0, 'trooper', ...at(63, 64)), e = S.spawn(g, 1, 'voidascendant', ...at(68, 64)); e.energy = 200 * S.FP; e.auto = '';
    run(g, 3, [castOn(1, e, 'crystallize', t)]); assert(t.stf & S.STF.disarmed);
    run(g, 2, [castOn(0, c, 'cleanse', t)]); assert(!(t.stf & S.STF.disarmed), '적이 건 상태 제거');
  }],
  ['tow', '견인 빔', 'surveyor', ['legion', 'elysian'], (g, c) => {
    const s = S.spawn(g, 1, 'skimmer', ...at(66, 64));
    run(g, 2, [castOn(0, c, 'tow', s)]); assert(s.stf & S.STF.rooted, '공중도 묶임');
    const tf = g.fx.find(f => f.ab === 'tow'); assert(tf && tf.kind === 'status' && tf.src === c.id, '상태 fx 가 시전자 id(src)를 기억');
  }],
  ['scan', '드론 정찰', 'uplink', ['legion', 'elysian'], (g, c) => {
    const [x, y] = at(110, 110);
    run(g, 1, [castAt(0, c, 'scan', x, y)]);
    const f = g.fx.find(f => f.ab === 'scan'); assert(f && f.r === 7 && f.left === 400 - 1);
  }],
  ['junkdrop', '고철 낙하', 'silo', ['legion', 'elysian'], (g, c) => {
    const s = S.spawn(g, 1, 'sage', ...at(64, 66)), b = S.spawn(g, 1, 'resonator', 65, 66), hp = s.hp + s.shield, bhp = b.hp + b.shield;
    run(g, 2); // 시야 갱신
    const [fx, fy] = at(110, 110);
    run(g, 1, [castAt(0, c, 'junkdrop', fx, fy)]); assert.strictEqual(g.fx.length, 0, 'needVis: 시야 밖 불가');
    run(g, 40, [castAt(0, c, 'junkdrop', s.x, s.y)]);
    assert.strictEqual(s.hp + s.shield, hp, '낙하 전 무피해');
    run(g, 45);
    assert(!(s.hp > 0) || !S.byId(g, s.id), '80틱 뒤 200 피해'); assert.strictEqual(b.hp + b.shield, bhp, '건물 무피해');
  }],
  ['spores', '포자 산포', 'matron', ['swarm', 'legion'], (g, c) => {
    const [x, y] = at(64, 64);
    run(g, 2, [castAt(0, c, 'spores', x, y)]);
    const sp = g.ents.filter(e => e.type === 'spawnling' && e.owner === 0);
    assert.strictEqual(sp.length, 3); assert(sp.every(e => e.free && e.life > 0 && e.life <= 300));
  }],
  ['mat', '균사 장판', 'matron', ['swarm', 'legion'], (g, c) => {
    const a = S.spawn(g, 0, 'drudge', ...at(64, 64)), ref = S.spawn(g, 0, 'drudge', ...at(64, 74)), e = S.spawn(g, 1, 'corpsman', ...at(65, 64));
    a.hp = ref.hp = 10 * S.FP; e.auto = '';
    run(g, 40, [castAt(0, c, 'mat', a.x, a.y)]);
    assert(a.hp > ref.hp, '아군 회복'); assert(e.stf & S.STF.slowed, '적 감속');
  }],
  ['rot', '부패 포자', 'blighter', ['swarm', 'legion'], (g, c) => {
    const e = S.spawn(g, 1, 'corpsman', ...at(64, 64)), a = S.spawn(g, 0, 'drudge', ...at(64, 65)); e.auto = '';
    run(g, 40, [castAt(0, c, 'rot', e.x, e.y)]);
    assert(e.hp < e.hpMax, '적 피해'); assert.strictEqual(a.hp, a.hpMax, '아군 무피해');
  }],
  ['sprout', '기생 발아', 'blighter', ['swarm', 'legion'], (g, c) => {
    const [x, y] = at(63, 64);
    run(g, 2, [castAt(0, c, 'sprout', x, y)]);
    const h = g.ents.filter(e => e.type === 'husk' && e.owner === 0);
    assert.strictEqual(h.length, 1); assert(h[0].free && h[0].life > 0 && h[0].life <= 400);
  }],
  ['mindstorm', '공명 파쇄', 'sage', ['elysian', 'legion'], (g, c) => {
    const t = S.spawn(g, 1, 'trooper', ...at(66, 64));
    run(g, 10, [castAt(0, c, 'mindstorm', t.x, t.y)]); assert(t.hp < t.hpMax);
  }],
  ['amplify', '공명 증폭', 'sage', ['elysian', 'legion'], (g, c) => {
    const m = S.spawn(g, 0, 'oathblade', ...at(61, 64)), far = S.spawn(g, 0, 'oathblade', ...at(60, 70));
    run(g, 2, [{ player: 0, type: 'cast', ids: [c.id], what: 'amplify' }]);
    assert(c.stf & S.STF.hasted && m.stf & S.STF.hasted, '주변 아군 가속'); assert(!(far.stf & S.STF.hasted));
  }],
  ['stasis', '결정 봉인', 'voidascendant', ['elysian', 'legion'], (g, c) => {
    const t = S.spawn(g, 1, 'trooper', ...at(66, 64)), m = S.spawn(g, 0, 'oathblade', ...at(66, 65));
    run(g, 2, [castAt(0, c, 'stasis', t.x, t.y)]);
    assert(t.stf & S.STF.stasis && m.stf & S.STF.stasis, '피아 모두');
  }],
  ['crystallize', '결정화', 'voidascendant', ['elysian', 'legion'], (g, c) => {
    const t = S.spawn(g, 1, 'trooper', ...at(66, 64));
    run(g, 2, [castOn(0, c, 'crystallize', t)]);
    assert(t.stf & S.STF.disarmed && !(t.stf & S.STF.rooted), '공격 불가·이동 가능');
  }],
  ['probe', '광자 탐침', 'skimmer', ['elysian', 'legion'], (g, c) => {
    const [x, y] = at(68, 64);
    run(g, 1, [castAt(0, c, 'probe', x, y)]);
    const f = g.fx.find(f => f.ab === 'probe'); assert(f && f.kind === 'reveal' && f.r === 6 && f.left === 300 - 1);
  }],
  ['prism', '프리즘 장막', 'warden', ['elysian', 'legion'], (g, c) => {
    const m = S.spawn(g, 0, 'oathblade', ...at(62, 64)), far = S.spawn(g, 0, 'oathblade', ...at(60, 72));
    run(g, 2, [{ player: 0, type: 'cast', ids: [c.id], what: 'prism' }]);
    assert(S.cloaked(c) && S.cloaked(m), '주변 아군 위장'); assert(!S.cloaked(far));
    const en = c.energy; run(g, 10); assert(c.energy < en, '켜 둔 동안 마나 소모');
    run(g, 2, [{ player: 0, type: 'cast', ids: [c.id], what: 'prism' }]); assert(!S.cloaked(m), '다시 시전 = 끄기');
  }],
  ['chorus', '대합창', 'warden', ['elysian', 'legion'], (g, c) => {
    const m = S.spawn(g, 0, 'oathblade', ...at(64, 64)); m.shield = 0;
    run(g, 20, [castAt(0, c, 'chorus', m.x, m.y)]); assert(m.shield > 20 * S.FP, '결정막 회복');
  }],
  ['echo', '음파 역류', 'watcher', ['elysian', 'legion'], (g, c) => {
    const e = S.spawn(g, 1, 'corpsman', ...at(66, 64)); e.energy = 50 * S.FP; e.auto = '';
    const s = S.spawn(g, 0, 'sage', ...at(61, 64)), far = S.spawn(g, 0, 'sage', ...at(60, 74)), m = S.spawn(g, 0, 'corpsman', ...at(60, 65));
    s.energy = far.energy = 0; s.auto = far.auto = m.auto = ''; m.energy = 0;
    run(g, 2, [castOn(0, c, 'echo', e)]);
    assert(e.energy <= 2 * S.ENERGY_REGEN, '마나 0(+재생)'); assert.strictEqual(e.hp, e.hpMax, '피해 없음');
    assert.strictEqual(s.energy, 25 * S.FP + 2 * S.ENERGY_REGEN, '50 을 시전자·근처 코러스 둘이 나눔');
    assert.strictEqual(c.energy, 175 * S.FP + 2 * S.ENERGY_REGEN, '시전자도 받음');
    assert.strictEqual(far.energy, 2 * S.ENERGY_REGEN, '반경 밖 무관'); assert.strictEqual(m.energy, 2 * S.ENERGY_REGEN, '다른 종족 무관');
  }],
  ['repairdrones', '수리 드론 방출', 'dreadnought', ['legion', 'elysian'], (g, c) => {
    const h = S.spawn(g, 0, 'hound', ...at(64, 64)), p = S.spawn(g, 0, 'ferry', ...at(65, 64)), t = S.spawn(g, 0, 'trooper', ...at(64, 65));
    for (const u of [h, p, t]) { u.hp = 10 * S.FP; u.order = { type: 'hold' }; }
    const en = c.energy;
    run(g, 2, [castAt(0, c, 'repairdrones', h.x, h.y)]);
    assert(c.energy < en - 90 * S.FP, '마나 100'); assert(c.ccd > 0, '쿨다운');
    const f = g.fx.find(f => f.ab === 'repairdrones'); assert(f && f.kind === 'zone' && f.r === 128 * S.FP);
    run(g, 160);
    assert.strictEqual(h.hp, h.hpMax, '차량 수리(최대치)'); assert.strictEqual(p.hp, 160 * S.FP, '함선 150 수리'); assert.strictEqual(t.hp, 10 * S.FP, '생체 무관');
  }],
];
test('data3b: §5 마법 목록 — 23개 전부 존재, 이름·시전자 일치, 연구는 시전자 종족 건물에서', () => {
  assert.strictEqual(SPELLS_3B.length, 23);
  assert.deepStrictEqual(Object.keys(D.abilities).sort(), SPELLS_3B.map(r => r[0]).sort());
  for (const [id, name, by] of SPELLS_3B) {
    const A = D.abilities[id], d = D.units[by] || D.buildings[by];
    assert.strictEqual(A.name, name, id); assert.strictEqual(A.race, d.race, id); assert((d.abilities || []).includes(id), `${by} has ${id}`);
    if (A.requires) { const u = D.upgrades[A.requires]; assert(u && u.effect.unlock === id && D.buildings[u.at].race === d.race && D.buildings[u.at].researches.includes(u.id), `${id} research`); }
    if (A.effect.kind === 'summon') assert(D.units[A.effect.unit].summoned, `${id} summon`);
  }
});
for (const [id, name, by, races, fn] of SPELLS_3B) test(`3b 시전: ${name}(${id}) — ${by}`, () => arena(races, g => {
  const isB = !!D.buildings[by], A = D.abilities[id];
  const c = isB ? S.spawn(g, 0, by, 60, 62) : S.spawn(g, 0, by, ...at(60, 64));
  if (c.def.energy) c.energy = 200 * S.FP;
  c.auto = '';
  if (A.requires) { assert.strictEqual(S.canCast(g, 0, c, id), 'research'); g.players[0].up[A.requires] = 1; }
  assert.strictEqual(S.canCast(g, 0, c, id), '', 'castable');
  fn(g, c);
}));
test('결정론 3b: 마법 시나리오 23개 각각 두 번 실행 — 체크섬 일치', () => {
  const once = ([id, , by, races, fn]) => arena(races, g => {
    const c = D.buildings[by] ? S.spawn(g, 0, by, 60, 62) : S.spawn(g, 0, by, ...at(60, 64));
    if (c.def.energy) c.energy = 200 * S.FP;
    c.auto = ''; if (D.abilities[id].requires) g.players[0].up[D.abilities[id].requires] = 1;
    fn(g, c); run(g, 50); return S.checksum(g);
  });
  for (const r of SPELLS_3B) assert.strictEqual(once(r), once(r), r[0]);
});

// 시작 위치 공정성: 모든 맵에서 시작 자리마다 (본진, 시작 일꾼, 생산 출구, 크리스탈) 배치가 자리 flip 의 거울이다
test('시작 위치: 자리마다 본진·시작 유닛·크리스탈·생산 출구가 거울 대칭', () => {
  for (const [id, m] of Object.entries(S.D.maps)) {
    const W = (m.w ?? 128) * S.TFP, H = (m.h ?? 128) * S.TFP;
    for (const race of ['legion', 'swarm', 'elysian']) {
      const shape = slot => {
        const others = [...Array(m.starts.length).keys()].filter(s => s !== slot).slice(0, 1);
        const g = S.createGame({ seed: 1, map: id, players: [slot, ...others].map((s, i) => ({ race, team: i, slot: s, color: i })) });
        const f = g.map.starts[slot].flip, X = x => f & 1 ? W - x : x, Y = y => f & 2 ? H - y : y, base = g.ents.find(e => e.owner === 0 && e.isB);
        const own = g.ents.filter(e => e.owner === 0).map(e => `${e.type}@${X(e.x)},${Y(e.y)}`).sort();
        const cr = g.ents.filter(e => e.isR && Math.abs(e.x - base.x) < 10 * S.TFP && Math.abs(e.y - base.y) < 10 * S.TFP).map(e => `${e.type}@${X(e.x)},${Y(e.y)}`).sort();
        base.queue.push({ what: S.D.races[race].worker, left: 1 }); S.step(g, []);
        const u = g.ents[g.ents.length - 1].owner === 0 ? g.ents.filter(e => e.owner === 0 && !e.isB).pop() : null;
        return JSON.stringify([own, cr, u && `${X(u.x)},${Y(u.y)}`]);
      };
      // 180° 짝(0↔1, 2↔3)은 언제나 같아야 한다(diagonal 처럼 x·y 거울은 바위가 일부러 다를 수 있음)
      for (const [a, b] of [[0, 1], [2, 3]]) if (b < m.starts.length) assert.strictEqual(shape(b), shape(a), `${id} ${race} slot ${b} vs ${a}`);
    }
  }
});

test('자동 대상 우선순위: 등급(대공 공격 > 지상 공격 > 비공격 공중 > 비공격 지상·일꾼 > 건물) 먼저, 같은 등급은 거리', () => {
  arena(['legion', 'legion'], g => { // 가까운 일꾼·건물·지상 전용 유닛보다 멀리 있는 대공 공격 유닛
    const a = S.spawn(g, 0, 'trooper', ...at(64, 64));
    S.spawn(g, 1, 'engineer', ...at(65, 64)); S.spawn(g, 1, 'depot', 61, 63); S.spawn(g, 1, 'hound', ...at(64, 66));
    const far = S.spawn(g, 1, 'trooper', ...at(69, 64));
    for (const e of g.ents) if (e.owner === 1 && !e.isB) e.order = { type: 'hold' };
    S.step(g, []); S.step(g, []); // 첫 틱에 시야가 갱신된다
    assert(a.order && a.order.type === 'attack' && a.order.auto, '자동 공격');
    assert.strictEqual(a.order.target, far.id, '멀어도 반격하는 유닛 우선');
  });
  arena(['legion', 'legion'], g => { // 같은 등급: 가까운 쪽
    const a = S.spawn(g, 0, 'trooper', ...at(64, 64));
    S.spawn(g, 1, 'trooper', ...at(69, 64)); const near = S.spawn(g, 1, 'trooper', ...at(64, 67));
    const e1 = S.spawn(g, 1, 'engineer', ...at(65, 64)); S.spawn(g, 1, 'engineer', ...at(64, 65));
    for (const e of g.ents) if (e.owner === 1 && !e.isB) e.order = { type: 'hold' };
    S.step(g, []); S.step(g, []);
    assert.strictEqual(a.order.target, near.id, '같은 등급은 가까운 쪽');
    for (const e of g.ents) if (e.owner === 1 && e.type === 'trooper') e.hp = 0;
    S.step(g, []); S.step(g, []);
    assert.strictEqual(a.order.target, e1.id, '일꾼끼리: 같은 거리면 먼저 생긴 쪽(반복 순서)');
  });
});

test('자동 대상 우선순위: 나를 못 때리는 공격 대상(대공 전용 건물)은 비공격 등급 — 지상은 근접 유닛 먼저, 공중은 대공 건물 먼저', () => {
  for (const [atk, want] of [['trooper', 'skitter'], ['phantom', 'puffer']]) arena(['legion', 'swarm'], g => {
    const a = S.spawn(g, 0, atk, ...at(64, 64));
    S.spawn(g, 1, 'puffer', 65, 62); // 가까운 대공 전용 건물
    S.spawn(g, 1, 'skitter', ...at(68, 64)); // 더 먼 근접 지상 유닛
    for (const e of g.ents) if (e.owner === 1 && !e.isB) e.order = { type: 'hold' };
    S.step(g, []); S.step(g, []);
    assert(a.order && a.order.type === 'attack' && a.order.auto, atk + ' 자동 공격');
    assert.strictEqual(S.byId(g, a.order.target).type, want, atk);
  });
});

for (const [name, fn] of tests) {
  try { fn(); console.log('ok  ', name); } catch (e) { fail++; console.log('FAIL', name, '\n  ', e.message); }
}
console.log(fail ? `${fail} failed` : 'all passed');
process.exit(fail ? 1 : 0);
