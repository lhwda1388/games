// 효과음·음악(audio.js) — 가짜 AudioContext 로 소리 없이 규칙만 확인한다
const test = require('node:test');
const assert = require('node:assert');

// ---- 최소 가짜 WebAudio ----
const param = v => ({ value: v, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {}, setTargetAtTime() {}, cancelScheduledValues() {} });
const node = extra => Object.assign({ connect() {}, disconnect() {}, start() {}, stop() {} }, extra);
let lastCtx = null;
class FakeCtx {
  constructor() { this.state = 'suspended'; this.currentTime = 0; this.sampleRate = 8000; this.destination = node(); lastCtx = this; }
  resume() { this.state = 'running'; return Promise.resolve(); }
  createGain() { return node({ gain: param(1) }); }
  createOscillator() { this.osc = (this.osc || 0) + 1; return node({ type: 'sine', frequency: param(440), detune: param(0) }); }
  createBufferSource() { return node({ buffer: null, loop: false, playbackRate: param(1) }); }
  createBiquadFilter() { return node({ type: 'lowpass', frequency: param(350), Q: param(1) }); }
  createDynamicsCompressor() { return node({ threshold: param(-24), ratio: param(12) }); }
  createConvolver() { return node({ buffer: null }); }
  createStereoPanner() { return node({ pan: param(0) }); }
  createWaveShaper() { return node({ curve: null, oversample: 'none' }); }
  createBuffer(ch, n) { const d = Array.from({ length: ch }, () => new Float32Array(n)); return { getChannelData: c => d[c] }; }
}
const store = new Map();
global.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
global.window = { AudioContext: FakeCtx };
const NW_AUDIO = require('../audio.js');

async function ready() { const A = NW_AUDIO.create(); await A.unlock(); return { A, ac: lastCtx }; }

test('잠김: unlock 전 play 는 아무것도 하지 않는다', () => {
  const A = NW_AUDIO.create();
  assert.strictEqual(A.play('gun'), false);
  assert.strictEqual(A.voices, 0);
});

test('unlock 뒤 play 가 소리를 내고, 음소거면 다시 막힌다', async () => {
  const { A } = await ready();
  assert.strictEqual(A.play('gun'), true);
  A.setMuted(true); assert.strictEqual(A.play('shell'), false);
  A.setMuted(false);
});

test('동시 발음 제한: 전체 8개(우선 소리는 10개), 같은 소리는 40ms 안에 2개', async () => {
  const { A } = await ready();
  const names = ['gun', 'shell', 'missile', 'flame', 'spine', 'acid', 'glaive', 'beam', 'slash', 'bite'];
  let n = 0; for (const s of names) if (A.play(s)) n++;
  assert.strictEqual(n, 8); assert.strictEqual(A.voices, 8);
  assert.strictEqual(A.play('boomL'), true); assert.strictEqual(A.play('done'), true);   // 우선 소리는 10개까지
  assert.strictEqual(A.play('ready'), false);
  const B = (await ready()).A;
  assert.strictEqual(B.play('gun'), true); assert.strictEqual(B.play('gun'), true); assert.strictEqual(B.play('gun'), false);
});

test('명령 응답: 종류별·종족별 소리, 시전·부속 건설은 조용히', async () => {
  const { A } = await ready();
  assert.strictEqual(A.cmd({ type: 'move', ids: [1] }, 'swarm'), true);
  assert.strictEqual(A.cmd({ type: 'attack', ids: [1] }, 'elysian'), true);
  assert.strictEqual(A.cmd({ type: 'build', ids: [1], what: 'x', tx: 3, ty: 4 }, 'legion'), true);
  assert.strictEqual(A.cmd({ type: 'build', ids: [1], what: 'addon' }, 'legion'), false);
  assert.strictEqual(A.cmd({ type: 'cast', ids: [1] }, 'legion'), false);
  assert.strictEqual(A.cmd({ type: 'train', ids: [1] }, 'nope'), true);   // 모르는 종족 = 레기온 소리
});

test('교전: 3초 창 합계가 문턱을 넘으면 스팅 한 번, 쿨다운 동안은 다시 안 남, 강도는 0..1', async () => {
  const { A } = await ready();
  A.startMatch('legion');
  let fired = 0;
  for (let t = 0; t < 60; t++) if (A.combat(1)) fired++;
  assert.strictEqual(fired, 1);                                            // 30틱째에 넘음
  assert(A.intensity > 0.9 && A.intensity <= 1);
  for (let t = 0; t < 600; t++) if (A.combat(2)) fired++;
  assert.strictEqual(fired, 1);                                            // 45초(900틱) 쿨다운
  for (let t = 0; t < 60; t++) A.combat(0);
  assert.strictEqual(A.intensity, 0);
  for (let t = 0; t < 300; t++) if (A.combat(1)) fired++;
  assert.strictEqual(fired, 2);
  A.stopMatch();
});

test('BGM: 판 시작에 돌고 끝에 멈춘다, quantize = 다음 8분음표(음악이 없으면 그대로)', async () => {
  const { A, ac } = await ready();
  ac.currentTime = 5;
  assert.strictEqual(A.quantize(5.123), 5.123);
  A.startMatch('swarm'); assert.strictEqual(A.playing, true);
  const e = A.eighth, t0 = 5.1;                                            // 시작 = 지금 + 미리보기 100ms
  assert(Math.abs(A.quantize(5.2) - (t0 + e)) < 1e-9);
  assert(Math.abs(A.quantize(t0 + e) - (t0 + e)) < 1e-9);                  // 이미 박자 위면 그 자리
  assert(Math.abs(A.quantize(t0 + 3.2 * e) - (t0 + 4 * e)) < 1e-9);
  const o0 = ac.osc;
  try {
    for (let i = 0; i < 60; i++) A.combat(2);                              // 강도 최대 → 모든 레이어가 실제로 예약되는지(예외 없이)
    for (const dt of [0.5, 0.5, 9]) { ac.currentTime += dt; await new Promise(r => setTimeout(r, 40)); }   // 9초 = 늦음 → 건너뛰기
    assert(ac.osc - o0 > 8, '스케줄러가 음을 예약해야 한다: ' + (ac.osc - o0));
    assert(Math.abs(A.quantize(t0 + 3.2 * e) - (t0 + 4 * e)) < 1e-9);       // 건너뛰어도 박자 격자는 그대로
  } finally { if (A.playing) A.stopMatch(); }
  A.startMatch('swarm'); A.endMatch('win'); assert.strictEqual(A.playing, false);
  assert.strictEqual(A.quantize(9), 9);
});

test('음악 토글: localStorage nw-music 에 저장되고 새 인스턴스가 이어받는다', () => {
  const A = NW_AUDIO.create(); assert.strictEqual(A.musicOn, true);
  A.toggleMusic(); assert.strictEqual(A.musicOn, false); assert.strictEqual(store.get('nw-music'), '0');
  assert.strictEqual(NW_AUDIO.create().musicOn, false);
  A.setMusic(true); assert.strictEqual(store.get('nw-music'), '1'); assert.strictEqual(NW_AUDIO.create().musicOn, true);
  assert.strictEqual(A.muted, false);                                      // 효과음 음소거와는 따로
});

test('음악 음량: 0~100 저장, 예전 nw-music=0 은 끔, 0 은 끔과 같고 끔 뒤 음량 조절은 켠다', () => {
  store.clear();
  assert.strictEqual(NW_AUDIO.create().musicVol, 1);                       // 저장값 없음 = 100%
  store.set('nw-music', '0');
  let A = NW_AUDIO.create(); assert.strictEqual(A.musicOn, false); assert.strictEqual(A.musicVol, 1);  // 예전 끔 값 호환
  A.setMusicVol(0.4); assert.strictEqual(store.get('nw-music-vol'), '40'); assert.strictEqual(store.get('nw-music'), '1');
  assert.strictEqual(A.musicOn, true);                                     // 끈 상태에서 음량을 만지면 켠다
  A = NW_AUDIO.create(); assert.strictEqual(A.musicOn, true); assert.strictEqual(A.musicVol, 0.4);
  A.toggleMusic(); assert.strictEqual(A.musicOn, false); assert.strictEqual(A.musicVol, 0.4);   // 끔은 음량을 지우지 않는다
  A.toggleMusic(); assert.strictEqual(A.musicOn, true); assert.strictEqual(A.musicVol, 0.4);
  A.setMusicVol(0); assert.strictEqual(A.musicOn, false); assert.strictEqual(store.get('nw-music-vol'), '0');
  A.toggleMusic(); assert.strictEqual(A.musicOn, true); assert.strictEqual(A.musicVol, 1);      // 0 에서 켜면 100%
  A.setMusicVol(7); assert.strictEqual(A.musicVol, 1); A.setMusicVol(-1); assert.strictEqual(A.musicOn, false);
  store.set('nw-music-vol', 'abc'); assert.strictEqual(NW_AUDIO.create().musicVol, 1);          // 망가진 값
  store.clear();
});

test('효과음 음량: 0~100 저장, 끄기(nw-muted)와 따로, 범위 밖·망가진 값 처리, 버스 음량에 반영', async () => {
  store.clear();
  assert.strictEqual(NW_AUDIO.create().sfxVol, 1);                         // 저장값 없음 = 100%
  let A = NW_AUDIO.create();
  A.setSfxVol(0.4); assert.strictEqual(store.get('nw-sfx-vol'), '40'); assert.strictEqual(A.sfxVol, 0.4);
  assert.strictEqual(NW_AUDIO.create().sfxVol, 0.4);                       // 새 인스턴스가 이어받는다
  A.setMuted(true); assert.strictEqual(A.sfxVol, 0.4);                     // 끔은 음량을 지우지 않는다
  A.setMuted(false); assert.strictEqual(A.muted, false); assert.strictEqual(A.sfxVol, 0.4);
  assert.strictEqual(store.get('nw-muted'), '0');                          // 음량은 끔 저장값을 건드리지 않는다
  A.setSfxVol(0); assert.strictEqual(A.sfxVol, 0); assert.strictEqual(A.muted, false); assert.strictEqual(store.get('nw-sfx-vol'), '0');
  A.setSfxVol(7); assert.strictEqual(A.sfxVol, 1); A.setSfxVol(-1); assert.strictEqual(A.sfxVol, 0);
  A.setSfxVol('abc'); assert.strictEqual(A.sfxVol, 0);
  A.setSfxVol(0.126); assert.strictEqual(store.get('nw-sfx-vol'), '13');
  A.setMusicVol(0.3); assert.strictEqual(A.sfxVol, 0.126); assert.strictEqual(store.get('nw-sfx-vol'), '13'); assert.strictEqual(store.get('nw-music-vol'), '30');   // 음악 음량과 독립
  for (const bad of ['abc', '-5', '101', '']) { store.set('nw-sfx-vol', bad); assert.strictEqual(NW_AUDIO.create().sfxVol, 1); }
  // 생성한 버스에 저장 음량이 들어간다(효과음 버스 = 음량, 앰비언스 버스 = 0.5 × 음량)
  const gains = [], orig = FakeCtx.prototype.createGain;
  FakeCtx.prototype.createGain = function () { const g = orig.call(this); gains.push(g); return g; };
  try {
    store.set('nw-sfx-vol', '50'); const B = NW_AUDIO.create(); await B.unlock();
    assert.ok(gains.some(g => g.gain.value === 0.5), 'sfx bus 0.5');
    assert.ok(gains.some(g => g.gain.value === 0.25), 'amb bus 0.25');
  } finally { FakeCtx.prototype.createGain = orig; }
  store.clear();
});

test('연타 콤보: 2초 안 연속 처치마다 음계 한 칸 위, 맨 위에서 멈춤, 2초 쉬면 처음으로', async () => {
  const { A, ac } = await ready();
  A.kill(); assert.strictEqual(A.combo, 0);
  for (let i = 1; i <= 4; i++) { ac.currentTime += 0.5; A.kill(); assert.strictEqual(A.combo, i); }
  ac.currentTime += 2.1; A.kill(); assert.strictEqual(A.combo, 0);
  for (let i = 0; i < 20; i++) { ac.currentTime += 0.3; A.kill(); }
  assert.strictEqual(A.combo, 10);                                         // 음계 끝(두 옥타브)
});

test('심장박동: 1초에 한 번, 8번 이어지면 15초 쉰다', async () => {
  const { A, ac } = await ready();
  let n = 0;
  for (let i = 0; i < 44; i++) { if (A.danger()) n++; ac.currentTime += 0.5; }   // 22초 동안 계속 위험
  assert.strictEqual(n, 8);                                                // 0~7초에 8번 → 7초부터 15초 쉼
  for (let i = 0; i < 4; i++) { if (A.danger()) n++; ac.currentTime += 0.5; }
  assert.strictEqual(n, 10);                                               // 22초 뒤 다시
});

test('박자 맞춤: 음악이 없으면 바로, 있으면 소리를 낸다(예약)', async () => {
  const { A } = await ready();
  assert.strictEqual(A.beat('drop', 0.5, 0, 3), true);
  A.startMatch('elysian');
  try { assert.strictEqual(A.beat('ready', 1, 0, 5), true); assert.strictEqual(A.beat('done', 1, 0, 6), true); }
  finally { A.stopMatch(); }
});

test('유닛 수다: 같은 유닛 연타면 단계가 오르고, 다른 유닛·쉬면 처음으로', async () => {
  const { A, ac } = await ready();
  A.select('legion', 7); assert.strictEqual(A.spam, 0);
  for (let i = 1; i <= 4; i++) { ac.currentTime += 0.3; A.select('legion', 7); assert.strictEqual(A.spam, i); }
  ac.currentTime += 0.3; A.select('legion', 8); assert.strictEqual(A.spam, 0);
  ac.currentTime += 0.3; A.select('legion', 8); assert.strictEqual(A.spam, 1);
  ac.currentTime += 2; A.select('legion', 8); assert.strictEqual(A.spam, 0);
  ac.currentTime += 0.1; A.select('legion', 0); A.select('legion', 0); assert.strictEqual(A.spam, 0);   // 여러 개 선택은 세지 않는다
});

// ---- 유닛 목소리: 유닛 데이터에서 프로필을 뽑는다 ----
const D = require('../data.js');
const sig = p => [p.race, p.w, p.arch, p.pitch.toFixed(2), p.body].join('|');

test('유닛 목소리: 같은 종족 일꾼·무거운 지상·공중은 서로 다른 프로필, 종족 재료는 유지', () => {
  const A = NW_AUDIO.create();
  for (const [wk, heavy, air] of [['engineer', 'bastion', 'phantom'], ['drudge', 'behemoth', 'wingsting'], ['shaper', 'arcwalker', 'sentinel']]) {
    const a = A.profile(D.units[wk]), b = A.profile(D.units[heavy]), c = A.profile(D.units[air]);
    assert.strictEqual(a.arch, 'worker'); assert.strictEqual(c.arch, 'air');
    assert.strictEqual(a.w, 0); assert(b.w >= 1 && b.pitch < a.pitch && b.body > a.body, heavy + ' 는 일꾼보다 낮고 무거워야 한다');
    assert.strictEqual(new Set([sig(a), sig(b), sig(c)]).size, 3);
    assert(a.race === b.race && b.race === c.race && a.race === D.units[wk].race);
  }
  assert.strictEqual(A.profile(D.units.bastion).arch, 'mech');
  assert.strictEqual(A.profile(D.units.trooper).arch, 'bio');
  assert.strictEqual(A.profile(D.units.matron).arch, 'caster');
  const lev = A.profile(D.units.dreadnought);                            // 덮어쓰기: 레비아탄 = 가장 낮고 무겁게
  assert(lev.w === 2 && lev.pitch <= Math.min(...Object.values(D.units).map(u => A.profile(u).pitch)));
  for (const r of ['legion', 'swarm', 'elysian']) {                        // 종족마다 서로 다른 프로필이 여럿(소리 하나가 아니다)
    const ps = Object.values(D.units).filter(u => u.race === r).map(u => sig(A.profile(u)));
    assert(new Set(ps).size >= 6, r + ': ' + new Set(ps).size);
  }
  assert.deepStrictEqual(A.profile('swarm'), { race: 'swarm', w: 1, arch: null, pitch: 1, body: 0 });   // 예전 호출(종족 문자열)
  assert.strictEqual(A.profile(D.buildings.vent).arch, null);             // 건물 = 종족 소리
});

test('유닛 목소리: 섞인 선택은 가장 비싼 유닛 하나, 선택·명령·완료·죽음 모두 소리를 낸다', async () => {
  const { A, ac } = await ready();
  const U = D.units;
  assert.strictEqual(A.lead([U.engineer, U.dreadnought, U.trooper]), U.dreadnought);
  assert.strictEqual(A.lead([U.skitter, U.behemoth, U.drudge]), U.behemoth);
  assert.deepStrictEqual(A.profile([U.engineer, U.lancer, U.trooper]), A.profile(U.lancer));
  const v0 = A.voices;
  assert.strictEqual(A.select([U.engineer, U.lancer], 0), true);
  assert.strictEqual(A.voices, v0 + 1);                                    // 섞인 선택도 소리 하나
  ac.currentTime += 1;
  assert.strictEqual(A.cmd({ type: 'move', ids: [1] }, [U.hound, U.phantom]), true);
  assert.strictEqual(A.cmd({ type: 'attack', ids: [1] }, [U.skitter]), true);
  assert.strictEqual(A.cmd({ type: 'move', ids: [1] }, [U.drudge]), true);
  assert.strictEqual(A.cmd({ type: 'train', ids: [1] }, [U.dreadnought]), true);   // 생산은 종족 소리
  assert.strictEqual(A.cmd({ type: 'cast', ids: [1] }, [U.sage]), false);
  ac.currentTime += 1;
  assert.strictEqual(A.ready(U.ark, 5), true);
  assert.strictEqual(A.death('boomL', U.dreadnought, 1, 0, 3), true);
  assert.strictEqual(A.death('boomS', U.engineer, 1, 0, 4), true);
});

test('유닛 수다: 유닛 def 로 불러도 연타 단계가 오른다', async () => {
  const { A, ac } = await ready();
  const u = D.units.dreadnought;
  A.select(u, 7); assert.strictEqual(A.spam, 0);
  for (let i = 1; i <= 6; i++) { ac.currentTime += 0.3; assert.strictEqual(A.select([u], 7), true); assert.strictEqual(A.spam, i); }
  ac.currentTime += 2; A.select(u, 7); assert.strictEqual(A.spam, 0);
});

// ---- 유닛 성격: 방치 투덜거림 · 아군 사망 반응 · 고참 응답 ----
test('투덜거림: 전역 20초 쿨다운, 교전 강도가 오르면 안 낸다, 종족마다 소리가 난다', async () => {
  const { A, ac } = await ready();
  const U = D.units;
  ac.currentTime = 100;
  assert.strictEqual(A.idle(U.trooper, 3), true);
  ac.currentTime += 5; assert.strictEqual(A.idle(U.drudge, 4), false);       // 다른 유닛이어도 쿨다운
  ac.currentTime += 14; assert.strictEqual(A.idle(U.drudge, 4), false);
  ac.currentTime += 1.5; assert.strictEqual(A.idle(U.drudge, 4), true);       // 20초 지나면 다시
  ac.currentTime += 21; assert.strictEqual(A.idle(U.sentinel, 5), true);     // 엘리시안
  A.startMatch('legion');
  for (let i = 0; i < 60; i++) A.combat(1);                                   // 강도 > 낮음
  assert(A.intensity > 0.1);
  ac.currentTime += 30; assert.strictEqual(A.idle(U.trooper, 3), false);
  A.stopMatch();
});

test('아군 사망 반응: 3초에 한 번(몰살돼도 한 번)', async () => {
  const { A, ac } = await ready();
  const U = D.units;
  ac.currentTime = 200;
  assert.strictEqual(A.allyDown(U.trooper, 9), true);
  for (let i = 0; i < 10; i++) assert.strictEqual(A.allyDown(U.trooper, 10 + i), false);
  ac.currentTime += 2.9; assert.strictEqual(A.allyDown(U.skitter, 1), false);
  ac.currentTime += 0.2; assert.strictEqual(A.allyDown(U.skitter, 1), true);
  ac.currentTime += 3.1; assert.strictEqual(A.allyDown(U.shaper, 2), true);
});

test('고참: 처치 3·8 문턱으로 단계, 단계가 오를수록 응답음 재료(오실레이터)가 늘어난다', async () => {
  const { A, ac } = await ready();
  assert.deepStrictEqual(A.VET, [3, 8]);
  assert.deepStrictEqual([0, 2, 3, 7, 8, 20].map(A.vetTier), [0, 0, 1, 1, 2, 2]);
  const u = D.units.trooper, n = [], m = [];
  for (const k of [0, 3, 8]) { ac.currentTime += 2; const o = ac.osc || 0; A.select(u, 0, k); n.push(ac.osc - o); }
  assert(n[0] < n[1] && n[1] < n[2], 'select: ' + n);
  for (const k of [0, 3, 8]) { ac.currentTime += 2; const o = ac.osc || 0; A.cmd({ type: 'attack', ids: [1] }, [u], k); m.push(ac.osc - o); }
  assert(m[0] < m[1] && m[1] < m[2], 'cmd: ' + m);
  ac.currentTime += 2; const o1 = ac.osc; A.cmd({ type: 'train', ids: [1] }, [u], 20); const t1 = ac.osc - o1;   // 생산 소리는 고참과 무관
  ac.currentTime += 2; const o2 = ac.osc; A.cmd({ type: 'train', ids: [1] }, [u], 0); assert.strictEqual(ac.osc - o2, t1);
  assert.strictEqual(A.profile(u).vet, undefined);                            // 원래 프로필은 그대로
});

test('고참이어도 연타 이스터에그는 그대로 오른다', async () => {
  const { A, ac } = await ready();
  const u = D.units.trooper;
  ac.currentTime += 5; A.select(u, 11, 9); assert.strictEqual(A.spam, 0);
  for (let i = 1; i <= 5; i++) { ac.currentTime += 0.3; assert.strictEqual(A.select([u], 11, 9), true); assert.strictEqual(A.spam, i); }
});
