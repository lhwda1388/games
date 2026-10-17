const assert = require('assert');
const D = require('../data.js');
const A = require('../art.js');
require('../art-legion.js'); require('../art-swarm.js'); require('../art-elysian.js'); require('../art-icons.js');   // 종족 정의가 A.SPR 에 등록된다
let n = 0; const test = (name, fn) => { fn(); n++; console.log('ok', name); };

test('dirOf: 8방향 + 정지 시 이전 값 + 히스테리시스', () => {
  assert.strictEqual(A.dirOf(1, 0, 3), 0); assert.strictEqual(A.dirOf(1, 1, 0), 1);
  assert.strictEqual(A.dirOf(0, 1, 0), 2); assert.strictEqual(A.dirOf(-1, 0, 0), 4);
  assert.strictEqual(A.dirOf(0, -1, 0), 6); assert.strictEqual(A.dirOf(1, -1, 0), 7);
  assert.strictEqual(A.dirOf(0, 0, 5), 5);
  assert.strictEqual(A.dirOf(1, 0.5, 0), 0);   // 26.6° — 동쪽 중심에서 30° 안이라 유지
  assert.strictEqual(A.dirOf(1, 0.7, 0), 1);   // 35° — 넘어감
});
test('poseKey·반전 표', () => {
  assert.deepStrictEqual(A.BASE_DIR, [0, 1, 2, 1, 0, 7, 6, 7]);
  assert.deepStrictEqual(A.FLIP_DIR, [0, 0, 0, 1, 1, 1, 0, 0]);
  assert.strictEqual(A.poseKey(4, 'move', 2), '0m2'); assert.strictEqual(A.poseKey(5, 'attack', 1), '7a1');
  assert.deepStrictEqual(A.parsePose(A.poseKey(7, 'attack', 1)), { dir: 7, anim: 'attack', i: 1 });
  assert.deepStrictEqual(A.parsePose(''), { dir: 0, anim: 'idle', i: 0 });
  assert.deepStrictEqual(A.parsePose('b2'), { dir: 0, anim: 'build', i: 2 });
  assert.deepStrictEqual(A.parsePose('w3d1'), { dir: 0, anim: 'work', i: 3, dmg: 1 });
});
test('단계 함수', () => {
  assert.deepStrictEqual([1500, 1001, 1000, 401, 400, 0].map(A.crystalStage), [0, 0, 1, 1, 2, 2]);
  assert.deepStrictEqual([[100, 100], [50, 100], [34, 100], [33, 100]].map(([h, m]) => A.dmgStage(h, m)), [0, 1, 1, 2]);
  assert.deepStrictEqual([0, 0.33, 0.34, 0.66, 0.67, 1].map(A.buildStage), [0, 0, 1, 1, 2, 2]);
});
test('rockMask: 이웃 비트, 맵 밖은 바위', () => {
  const W = 4, H = 3, rock = new Uint8Array(W * H); rock[1 * W + 2] = 1; // (2,1)
  assert.strictEqual(A.rockMask(rock, W, H, 1, 1), 1);           // E
  assert.strictEqual(A.rockMask(rock, W, H, 2, 0) & (1 << 2), 4); // S
  assert.strictEqual(A.rockMask(rock, W, H, 0, 0) & 0b11110000, 0b11110000); // W·NW·N·NE 맵 밖
});
test('정의 커버리지: 모든 유닛·건물·자원에 스프라이트', () => {
  for (const id in D.units) assert(A.SPR[id], id);
  for (const id in D.buildings) assert(A.SPR[id], id);
  for (const id of ['crystal', 'vent', 'chunk', 'canister']) assert(A.SPR[id], id);
});
test('견본: 바스티온·주둔지·크리스탈은 새 정의', () => {
  for (const id of ['bastion', 'garrison', 'crystal']) assert.strictEqual(A.SPR[id].px, 1, id);
  assert.strictEqual(A.SPR.bastion.dirs, 8);
  assert.deepStrictEqual(A.SPR.bastion.frames, { idle: 1, move: 4, attack: 2 });
});
test('테마: 10개 맵 전부, 없는 맵은 crossing', () => {
  for (const id of Object.keys(D.maps)) assert(A.THEMES[id], id);
  assert.strictEqual(Object.keys(A.THEMES).length >= 10, true);
});
test('장식: 결정론, 밀도 4~10%, 맵마다 다름', () => {
  const s1 = A.mapSeed('crossing'), s2 = A.mapSeed('maze'); assert.notStrictEqual(s1, s2);
  let k = 0, same = 0;
  for (let y = 0; y < 100; y++) for (let x = 0; x < 100; x++) {
    const d = A.decoAt(s1, x, y); if (d >= 0) k++; assert.strictEqual(d, A.decoAt(s1, x, y));
    if (d === A.decoAt(s2, x, y)) same++;
  }
  assert(k > 400 && k < 1000, 'density ' + k); assert(same < 9800);
});
test('장식: 6종 모두 나온다, 점막 타일 16종은 함수', () => {
  const seen = new Set(), sd = A.mapSeed('fortress');
  for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) seen.add(A.decoAt(sd, x, y));
  for (let k = -1; k < 6; k++) assert(seen.has(k), 'kind ' + k);
  for (let m = 0; m < 16; m++) assert.strictEqual(typeof A.creepTile(m), 'function');
});
test('생물: 결정론·바위 회피·개수', () => {
  const W = 160, H = 160, rock = new Uint8Array(W * H); for (let y = 60; y < 100; y++) for (let x = 60; x < 100; x++) rock[y * W + x] = 1;
  const info = { id: 'fortress', w: W, h: H, rock, vents: [[20 * 32, 20 * 32]] }, o1 = [], o2 = [];
  for (const t of [0, 399, 400, 5000]) {
    const n = A.critters(info, t, o1); assert.strictEqual(n, A.critters(info, t, o2));
    assert.deepStrictEqual(o1.slice(0, n), o2.slice(0, n));
    for (const c of o1.slice(0, n)) if (c.kind === 'beast') assert(!rock[Math.floor(c.y / 32) * W + Math.floor(c.x / 32)], `beast on rock at t=${t}`);
  }
  const n = A.critters(info, 100, o1), beasts = o1.slice(0, n).filter(c => c.kind === 'beast').length;
  assert(beasts >= 18 && beasts <= 30, 'beasts ' + beasts);
});
test('생물: 새 2무리·반딧불 5, 정의 8방향', () => {
  const W = 128, H = 128, rock = new Uint8Array(W * H), info = { id: 'crossing', w: W, h: H, rock, vents: [[640, 640], [3000, 3000]] }, o = [];
  const n = A.critters(info, 777, o), by = k => o.slice(0, n).filter(c => c.kind === k);
  assert(by('beast').length >= 12 && by('beast').length <= 20);
  assert(by('bird').length >= 10 && by('bird').length <= 14); for (const b of by('bird')) assert.strictEqual(b.alt, 40);
  assert.strictEqual(by('firefly').length, 10);
  for (const id of ['critter@beast', 'critter@bird']) { assert.strictEqual(A.SPR[id].px, 1); assert.strictEqual(A.SPR[id].dirs, 8); assert.strictEqual(A.SPR[id].frames.move, 2); }
  assert.deepStrictEqual([A.SPR['critter@beast'].w, A.SPR['critter@beast'].h, A.SPR['critter@bird'].w, A.SPR['critter@bird'].h], [16, 12, 12, 8]);
});
test('Task 3(레기온): 레기온 건물·자원은 새 정의, build 3단·work ≥ 2, 띄우기 건물은 lift 프레임', () => {
  for (const b of Object.values(D.buildings).filter(b => b.race === 'legion')) {
    const d = A.SPR[b.id]; assert.strictEqual(d.px, 1, b.id); assert.strictEqual(d.frames.build, 3, b.id); assert(d.frames.work >= 2, b.id);
    assert.strictEqual(d.w, b.w * 32, b.id); assert.strictEqual(d.h, b.h * 32 + d.oy, b.id);
    assert(Array.isArray(d.glow) && Array.isArray(d.smoke), b.id);
    if (b.lift) assert(d.frames.lift >= 2, b.id);
  }
  for (const id of ['crystal', 'vent', 'chunk', 'canister']) assert.strictEqual(A.SPR[id].px, 1, id);
  assert(A.SPR.vent.frames.work === 3);
  assert(A.SPR.pump.smoke.length > 0);
  assert.deepStrictEqual(A.parsePose('l1d2'), { dir: 0, anim: 'lift', i: 1, dmg: 2 });
});
test('Task 4: 레기온 유닛 전부 8방향 새 정의', () => {
  for (const u of Object.values(D.units).filter(u => u.race === 'legion')) {
    const d = A.SPR[u.id]; assert.strictEqual(d.px, 1, u.id); assert.strictEqual(d.dirs, 8, u.id);
    assert.strictEqual(d.frames.attack, 2, u.id); assert(d.frames.move >= 2 && d.frames.move <= 4, u.id);
  }
  for (const s of ['s', 'm', 'l']) assert(A.SPR['wreck@legion-' + s]);
  assert.strictEqual(A.SPR['bastion@siege'].dirs, 8);
  // 3b 시커: D.units 에 없어도(정체성 브랜치 머지 전) id 키로 정의가 있다
  const sk = A.SPR.seeker; assert.strictEqual(sk.px, 1); assert.strictEqual(sk.dirs, 8); assert.deepStrictEqual(sk.frames, { idle: 1, move: 2, attack: 2 });
});
test('전 종족: 모든 SPR 은 px 1, 모드·잔해·생물·고치 그림 존재', () => {
  for (const k in A.SPR) assert.strictEqual(A.SPR[k].px, 1, k);
  for (const k of ['mound@burrow', 'cocoon@cocoon', 'critter@beast', 'critter@bird']) assert(A.SPR[k], k);
  for (const r of ['legion', 'swarm', 'elysian']) for (const z of ['s', 'm', 'l']) assert(A.SPR['wreck@' + r + '-' + z], 'wreck@' + r + '-' + z);
  for (const id in D.units) for (const m in D.units[id].modes || {}) if (m !== 'burrow') assert(A.SPR[id + '@' + m], id + '@' + m);
});
test('능력 아이콘: 모든 능력에 종족 판 14×14 그림', () => {
  for (const id in D.abilities) { const d = A.SPR['spell@' + id]; assert(d, id); assert.deepStrictEqual([d.w, d.h, d.race], [14, 14, D.abilities[id].race], id); }
});
console.log(n, 'passed');
