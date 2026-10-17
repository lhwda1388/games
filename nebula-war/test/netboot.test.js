const assert = require('assert');
const NB = require('../netboot.js');
const NET = require('../net.js');

let pass = 0, fail = 0;
const pending = [];
function test(name, fn) { pending.push([name, fn]); }

const ALPHA = /^[2-9A-HJKMNP-Z]{6}$/;
const seqRng = bytes => { let i = 0; return n => Array.from({ length: n }, () => bytes[i++ % bytes.length]); };

test('newCode: 6자, 혼동 문자 없음, 균일 알파벳', () => {
  for (let i = 0; i < 200; i++) assert(ALPHA.test(NB.newCode()), 'bad code');
  assert.strictEqual(NB.newCode(seqRng([0, 1, 2, 3, 4, 5])), '234567');
  // 거절 표본: 248 이상 바이트는 버린다
  assert.strictEqual(NB.newCode(seqRng([255, 250, 0, 0, 0, 0, 0, 0])), '222222');
});

test('normCode / peerIdOf / showCode', () => {
  assert.strictEqual(NB.normCode('k7m-2qx'), 'K7M2QX');
  assert.strictEqual(NB.normCode(' K7M 2QX '), 'K7M2QX');
  for (const bad of ['K7M2Q', 'K7M2QXX', 'K7M20X', 'K7MOQX', 'K7M1QX', 'K7MIQX', 'K7MLQX', '', null, undefined, 5, 'K7M!QX']) assert.strictEqual(NB.normCode(bad), null, String(bad));
  assert.strictEqual(NB.peerIdOf('K7M2QX'), 'nw-K7M2QX');
  assert.strictEqual(NB.showCode('K7M2QX'), 'K7M-2QX');
});

test('options: file:// → 공개 서버·CDN 기본값', async () => {
  const o = await NB.options({ loc: { protocol: 'file:' }, cfg: {}, fetch: () => assert.fail('no fetch') });
  assert.strictEqual(o.hosted, false); assert.strictEqual(o.turn, 'none'); assert.strictEqual(o.peerUrl, undefined);
  assert.deepStrictEqual(o.signaling, {});
  const o2 = await NB.options({ loc: { protocol: 'https:' }, cfg: undefined, fetch: () => assert.fail('no fetch') });
  assert.strictEqual(o2.hosted, false);
});

test('options: http + cfg + fetch 성공 → iceServers 주입', async () => {
  let call;
  const ice = [{ urls: 'turn:x', username: 'u', credential: 'c' }];
  const o = await NB.options({ loc: { protocol: 'https:' }, cfg: {}, fetch: async (u, init) => { call = [u, init]; return { ok: true, json: async () => ({ iceServers: ice }) }; } });
  assert.strictEqual(call[0], 'turn-credentials'); assert.strictEqual(call[1].credentials, 'same-origin');
  assert.strictEqual(o.hosted, true); assert.strictEqual(o.turn, 'ok'); assert.strictEqual(o.peerUrl, 'vendor/peerjs.min.js');
  assert.deepStrictEqual(o.signaling.config.iceServers, ice);
});

test('options: fetch 429·예외·잘못된 응답·시간 초과 → turn failed 이지만 resolve', async () => {
  const bads = [
    async () => ({ ok: false, status: 429 }),
    async () => { throw new Error('net'); },
    async () => ({ ok: true, json: async () => ({ iceServers: 'x' }) }),
    async () => ({ ok: true, json: async () => { throw new Error('json'); } }),
    () => new Promise(() => {}),
  ];
  for (const f of bads) {
    const o = await NB.options({ loc: { protocol: 'http:' }, cfg: {}, fetch: f, timeoutMs: 20 });
    assert.strictEqual(o.turn, 'failed'); assert.strictEqual(o.hosted, true); assert.strictEqual(o.peerUrl, 'vendor/peerjs.min.js');
    assert.strictEqual(o.signaling.config, undefined);
  }
});

test('options: cfg.signaling(host/path/key) 은 TURN 성공·실패 양쪽에서 유지', async () => {
  const cfg = { signaling: { host: 'sig.example', path: '/nw', key: 'k1', config: { sdpSemantics: 'unified-plan' } } };
  const ice = [{ urls: 'turn:x' }];
  const ok = await NB.options({ loc: { protocol: 'https:' }, cfg, fetch: async () => ({ ok: true, json: async () => ({ iceServers: ice }) }) });
  assert.strictEqual(ok.turn, 'ok');
  assert.strictEqual(ok.signaling.host, 'sig.example'); assert.strictEqual(ok.signaling.path, '/nw'); assert.strictEqual(ok.signaling.key, 'k1');
  assert.deepStrictEqual(ok.signaling.config, { sdpSemantics: 'unified-plan', iceServers: ice });
  const bad = await NB.options({ loc: { protocol: 'https:' }, cfg, fetch: async () => ({ ok: false }), timeoutMs: 20 });
  assert.strictEqual(bad.turn, 'failed');
  assert.strictEqual(bad.signaling.host, 'sig.example'); assert.strictEqual(bad.signaling.path, '/nw'); assert.strictEqual(bad.signaling.key, 'k1');
  assert.strictEqual(bad.signaling.config.iceServers, undefined);
  assert.notStrictEqual(ok.signaling, cfg.signaling); assert.strictEqual(cfg.signaling.config.iceServers, undefined); // 원본 불변
});

// 가짜 Peer (net.test.js 패턴)
function fakePeerLib(taken = new Set(), failOpen = {}) {
  const reg = new Map(); const made = [];
  const later = f => setImmediate(f);
  class Em { constructor() { this.h = {}; } on(k, f) { (this.h[k] = this.h[k] || []).push(f); } emit(k, ...a) { for (const f of this.h[k] || []) f(...a); } }
  class Conn extends Em {
    constructor(peer) { super(); this.peer = peer; this.open = false; this.other = null; }
    send(m) { const o = this.other, d = JSON.stringify(m); if (this.open && o) later(() => o.open && o.emit('data', JSON.parse(d))); }
    close() { if (!this.open) return; this.open = false; this.emit('close'); const o = this.other; if (o && o.open) { o.open = false; o.emit('close'); } }
  }
  class Peer extends Em {
    constructor(id) {
      super(); this.id = typeof id === 'string' ? id : 'auto' + reg.size; made.push(this.id);
      later(() => {
        if (taken.has(this.id)) { this.emit('error', { type: 'unavailable-id' }); return; }
        if (failOpen.type) { this.emit('error', { type: failOpen.type }); return; }
        reg.set(this.id, this); this.emit('open', this.id);
      });
    }
    connect(to) {
      const a = new Conn(to);
      later(() => {
        const dst = reg.get(to);
        if (to === 'nw-HANG22') return;
        if (!dst) { this.emit('error', { type: 'peer-unavailable', message: 'Could not connect to peer ' + to }); return; }
        const b = new Conn(this.id); a.other = b; b.other = a;
        dst.emit('connection', b);
        later(() => { a.open = b.open = true; a.emit('open'); b.emit('open'); });
      });
      return a;
    }
    destroy() { reg.delete(this.id); }
  }
  Peer.made = made;
  return Peer;
}
const file = { loc: { protocol: 'file:' }, cfg: {}, fetch: () => assert.fail('no fetch') };

test('host: 처음 두 번 unavailable-id 면 새 코드로 재시도', async () => {
  const taken = new Set(['nw-222222', 'nw-333333']);
  const Peer = fakePeerLib(taken);
  let calls = 0; // 호출마다 바이트 0,1,2 → 코드 222222, 333333, 444444
  const rng2 = n => Array(n).fill(calls++);
  const r = await NB.host({ ...file, Peer, net: NET, rng: rng2 });
  assert.strictEqual(r.code, '444444'); assert.deepStrictEqual(Peer.made, ['nw-222222', 'nw-333333', 'nw-444444']);
  assert.strictEqual(r.tr.id, 'nw-444444'); assert.strictEqual(typeof r.tr.connect, 'function');
});

test('host: 3번 다 unavailable-id 면 거부, 다른 오류는 즉시 한국어', async () => {
  let calls = 0;
  const taken = new Set(['nw-222222', 'nw-333333', 'nw-444444', 'nw-555555']);
  await assert.rejects(NB.host({ ...file, Peer: fakePeerLib(taken), net: NET, rng: n => Array(n).fill(calls++) }), e => e.message === 'unavailable-id');
  const P = fakePeerLib(new Set(), { type: 'network' });
  await assert.rejects(NB.host({ ...file, Peer: P, net: NET }), e => e.code === 'network' && e.message === '연결 서버에 닿지 않습니다');
  assert.strictEqual(P.made.length, 1);
});

test('join: 연결 성공 · 오류 매핑', async () => {
  const Peer = fakePeerLib();
  const h = await NB.host({ ...file, Peer, net: NET });
  const j = await NB.join(NB.showCode(h.code).toLowerCase(), { ...file, Peer, net: NET });
  assert(j.tr.peers().includes('nw-' + h.code));
  await assert.rejects(NB.join('222222', { ...file, Peer, net: NET }), e => e.code === 'peer-unavailable' && e.message === '방을 찾을 수 없습니다');
  await assert.rejects(NB.join('K7M2Q', { ...file, Peer, net: NET }), e => e.code === 'bad-code');
  await assert.rejects(NB.join('HANG22', { ...file, Peer, net: NET, connectTimeoutMs: 20 }), e => e.code === 'timeout' && e.message === '응답이 없습니다');
  await assert.rejects(NB.join('222222', { ...file, Peer: fakePeerLib(new Set(), { type: 'server-error' }), net: NET }), e => e.message === '연결 서버에 닿지 않습니다');
  await assert.rejects(NB.join('222222', { ...file, Peer: fakePeerLib(new Set(), { type: 'browser-incompatible' }), net: NET }), e => e.message === '이 브라우저는 P2P를 지원하지 않습니다');
});

(async () => {
  for (const [name, fn] of pending) {
    try { await fn(); pass++; console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n  ' + (e && e.stack || e)); }
  }
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
