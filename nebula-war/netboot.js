// 네뷸라 워 — P2P 연결 부트스트랩: 방 코드, 호스팅 TURN 자격증명, openPeer 옵션·재시도. DOM 없음(loc·cfg·fetch·Peer·rng 주입 가능).
// 방 코드 = 방장 피어 id('nw-' + 6자). 알파벳은 혼동 문자(0 O 1 I L)를 뺀 31자.
const NW_NETBOOT = (() => {
  const ALPHA = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const LIMIT = 256 - (256 % ALPHA.length); // 거절 표본 상한(편향 방지)
  const MSG = { 'peer-unavailable': '방을 찾을 수 없습니다', timeout: '응답이 없습니다', network: '연결 서버에 닿지 않습니다',
    'server-error': '연결 서버에 닿지 않습니다', 'browser-incompatible': '이 브라우저는 P2P를 지원하지 않습니다' };
  const randBytes = n => globalThis.crypto.getRandomValues(new Uint8Array(n));

  function newCode(rng = randBytes) {
    let s = '';
    while (s.length < 6) for (const b of rng(8)) if (b < LIMIT && s.length < 6) s += ALPHA[b % ALPHA.length];
    return s;
  }
  function normCode(input) {
    if (typeof input !== 'string') return null;
    const c = input.replace(/[\s-]/g, '').toUpperCase();
    return c.length === 6 && [...c].every(ch => ALPHA.includes(ch)) ? c : null;
  }
  const peerIdOf = code => 'nw-' + code;
  const showCode = code => code.slice(0, 3) + '-' + code.slice(3);

  // 호스팅 모드(http(s) + NW_NET_CONFIG)면 turn-credentials 를 받아 iceServers 로. 실패해도 거부하지 않는다.
  async function options({ loc = globalThis.location, cfg = globalThis.NW_NET_CONFIG, fetch = globalThis.fetch, timeoutMs = 3000 } = {}) {
    const hosted = !!cfg && typeof cfg === 'object' && !!loc && /^https?:$/.test(loc.protocol);
    if (!hosted) return { signaling: {}, hosted: false, turn: 'none' };
    const base = cfg.signaling && typeof cfg.signaling === 'object' ? cfg.signaling : {}; // host/port/path/key/secure 등
    const out = { signaling: { ...base }, peerUrl: 'vendor/peerjs.min.js', hosted: true, turn: 'failed' };
    let timer;
    try {
      const get = (async () => {
        const r = await fetch('turn-credentials', { credentials: 'same-origin' });
        if (!r || !r.ok) throw new Error('turn');
        const j = await r.json();
        if (!j || !Array.isArray(j.iceServers)) throw new Error('turn');
        return j.iceServers;
      })();
      const lim = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('turn-timeout')), timeoutMs); });
      get.catch(() => {}); // 시간 초과 뒤 늦은 거부가 처리 안 됨 경고를 내지 않게
      const iceServers = await Promise.race([get, lim]);
      out.signaling = { ...base, config: { ...(base.config || {}), iceServers } };
      out.turn = 'ok';
    } catch (e) { /* TURN 없이 진행 */ }
    clearTimeout(timer);
    return out;
  }

  const korean = e => {
    const code = (e && e.message) || 'peer';
    return Object.assign(new Error(MSG[code] || '연결할 수 없습니다'), { code });
  };
  const netOf = o => o.net || (typeof NW_NET !== 'undefined' ? NW_NET : require('./net.js'));
  const peerOpts = async o => {
    const { net, rng, loc, cfg, fetch, ...rest } = o;
    const b = await options({ loc, cfg, fetch });
    return { b, opts: { ...rest, signaling: b.signaling, ...(b.peerUrl ? { peerUrl: b.peerUrl } : {}) } };
  };

  async function host(o = {}) {
    const { b, opts } = await peerOpts(o);
    for (let i = 0; ; i++) {
      const code = newCode(o.rng);
      try { return { tr: await netOf(o).openPeer({ ...opts, id: peerIdOf(code) }), code, turn: b.turn, hosted: b.hosted }; }
      catch (e) { if (!(e && e.message === 'unavailable-id' && i < 2)) throw e && e.message === 'unavailable-id' ? e : korean(e); }
    }
  }

  async function join(input, o = {}) {
    const code = normCode(input);
    if (!code) throw Object.assign(new Error('방 코드가 올바르지 않습니다'), { code: 'bad-code' });
    const { b, opts } = await peerOpts(o);
    let tr;
    try {
      tr = await netOf(o).openPeer(opts);
      await tr.connect(peerIdOf(code));
    } catch (e) { if (tr) tr.close(); throw korean(e); }
    return { tr, turn: b.turn, hosted: b.hosted };
  }

  return { newCode, normCode, peerIdOf, showCode, options, host, join };
})();
if (typeof module !== 'undefined') module.exports = NW_NETBOOT;
