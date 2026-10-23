const test = require('node:test');
const assert = require('node:assert');
const C = require('../content/index.js');
const AUDIO = require('../engine/audio.js');

test('효과음 8종 정의', () => {
  assert.deepStrictEqual(Object.keys(C.sfx).sort(), ['boss', 'fusion', 'gem', 'hit', 'hurt', 'kill', 'levelup', 'ui']);
  for (const [k, s] of Object.entries(C.sfx)) {
    assert.ok(['square', 'triangle', 'sawtooth', 'noise'].includes(s.wave), k);
    assert.ok(s.dur > 0 && s.dur <= 1.5 && s.vol > 0 && s.vol <= 1, k);
  }
});

test('곡 4개, 모든 음이 5음계 안, 마디 길이 4박, 장단 8칸', () => {
  assert.deepStrictEqual(Object.keys(C.music).sort(), ['dokkaebi_pass', 'fox_forest', 'menu', 'tutorial']);
  for (const [id, m] of Object.entries(C.music)) {
    assert.ok(m.bars.length >= 8 && m.bars.length <= 16, id);
    for (const [i, b] of m.bars.entries()) {
      assert.strictEqual(b.lead.reduce((s, n) => s + n[2], 0), 4, `${id} 마디 ${i}`);
      for (const [deg, oct] of b.lead) if (deg != null) { assert.ok(Number.isInteger(deg) && deg >= 0 && deg <= 4, `${id} ${i}`); assert.ok(oct >= -1 && oct <= 1, `${id} ${i}`); }
      assert.match(b.drum, /^[Dk.]{8}$/, `${id} ${i}`);
    }
  }
});

test('pitch: 궁상각치우 반음 간격 0·2·4·7·9', () => {
  const r = 220;
  assert.strictEqual(Math.round(AUDIO.pitch(r, 0, 0)), 220);
  assert.strictEqual(Math.round(AUDIO.pitch(r, 3, 0)), Math.round(220 * 2 ** (7 / 12)));
  assert.strictEqual(Math.round(AUDIO.pitch(r, 0, 1)), 440);
});

test('옛 meta에 settings 기본값', () => {
  const SAVE = require('../engine/save.js');
  const old = JSON.stringify({ schemaVersion: SAVE.SCHEMA, contentVersion: 1, data: { coins: 3, discovered: {}, grantedRuns: [] } });
  const m = SAVE.loadMeta({ getItem: k => (k === SAVE.KEYS.meta ? old : null), setItem() {}, removeItem() {} });
  assert.strictEqual(m.coins, 3);
  assert.strictEqual(m.settings.muted, false);
});

// 가짜 AudioContext: 예약된 소리의 시작 시각과 resume 호출을 기록한다
function fakeAudio(state) {
  const starts = [], calls = { resume: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ gain: param(), frequency: param(), connect() {}, start(at) { starts.push(at); }, stop() {} });
  class Ctx {
    constructor() { this.currentTime = 0; this.state = state; this.sampleRate = 8000; this.destination = {}; fakeAudio.ctx = this; }
    resume() { calls.resume++; return Promise.reject(new Error('not allowed')); }
    createGain() { return node(); }
    createOscillator() { return node(); }
    createBufferSource() { return node(); }
    createBuffer(ch, n) { return { getChannelData: () => new Float32Array(n) }; }
  }
  return { Ctx, starts, calls };
}

test('unlock: suspended·interrupted 모두 resume, 거부된 약속은 삼킨다', async () => {
  for (const st of ['suspended', 'interrupted']) {
    const f = fakeAudio(st);
    global.window = { AudioContext: f.Ctx };
    const a = AUDIO.create(C.sfx, C.music);
    a.unlock();
    await new Promise(r => setImmediate(r)); // unhandled rejection이면 node:test가 실패시킨다
    assert.strictEqual(f.calls.resume, 1, st);
  }
  delete global.window;
});

test('음악 예약: 멈춤 뒤 지난 시각에 소리를 몰아 예약하지 않는다', () => {
  const f = fakeAudio('running');
  global.window = { AudioContext: f.Ctx };
  const realSet = global.setInterval, realClear = global.clearInterval;
  let tick = null;
  global.setInterval = fn => { tick = fn; return 1; };
  global.clearInterval = () => {};
  try {
    const a = AUDIO.create(C.sfx, C.music);
    a.unlock(); a.track('tutorial');
    tick();
    fakeAudio.ctx.currentTime = 10; // 10초 멈춤
    f.starts.length = 0;
    tick();
    assert.ok(f.starts.length > 0);
    assert.ok(f.starts.every(at => at >= 10), Math.min(...f.starts));
  } finally { global.setInterval = realSet; global.clearInterval = realClear; delete global.window; }
});
