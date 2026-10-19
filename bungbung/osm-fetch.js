// 붕붕이 — 실제 지도: Nominatim 장소 검색(1초 간격)·Overpass 영역 다운로드(미러 재시도·크기 상한)·현재 위치. fetch·시계 주입 가능.
// 오류는 모두 `code` 필드가 있는 Error를 throw: network | too-far | too-big | busy | bad-coords | gps. OSM 텍스트는 가공하지 않고 그대로 돌려준다(표시는 textContent로).
const PP_OSMF = (function ppOsmf() {
  const DEG = Math.PI / 180, KX = 111320, KY = 110540;  // osm-graph의 투영과 같은 등장방형 근사
  // ponytail: 운영 주체가 다른 공용 서버 3곳(kumi와 private.coffee는 같은 곳). 하나가 자주 죽어서 순서대로 시도
  const MIRRORS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
  const NOMINATIM = 'https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=kr&accept-language=ko&limit=5&q=';
  const SEARCH_GAP = 1000;  // Nominatim 이용 정책: 요청 간 >= 1초
  const MAX_DIST = 3000, MARGIN = 300;  // 한 번 운행 직선거리 상한, 외접 사각형 여유(m)
  const MAX_BYTES = 30 * 1024 * 1024;
  const AREA_TIMEOUT = 60000, GPS_TIMEOUT = 10000;
  const err = code => Object.assign(new Error(code), { code });

  // 남,서,북,동 → Overpass 쿼리. test/fixtures/fetch-fixtures.sh가 이 문자열을 복사해 쓴다(출처는 여기).
  function query(bbox) {
    const b = bbox.join(',');
    return `[out:json][timeout:60];\n(way["highway"](${b}); node["highway"~"traffic_signals|crossing"](${b});\n way["building"](${b}); way["amenity"="parking"](${b}););\n(._;>;); out body;`;
  }
  const okPt = p => Array.isArray(p) && p.length === 2 && p.every(v => typeof v === 'number' && Number.isFinite(v)) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180;

  function create({ fetch = globalThis.fetch, now = Date.now, sleep = ms => new Promise(r => setTimeout(r, ms)), timeout = AREA_TIMEOUT } = {}) {
    let next = -Infinity;  // 다음 Nominatim 요청이 가능한 가장 이른 시각(동시 호출도 줄 세움)

    async function search(q) {
      const at = Math.max(now(), next);
      next = at + SEARCH_GAP;
      if (at > now()) await sleep(at - now());
      let list;
      try {
        const r = await fetch(NOMINATIM + encodeURIComponent(q));
        if (!r.ok) throw 0;
        list = JSON.parse(await r.text());
        if (!Array.isArray(list)) throw 0;
      } catch (e) { throw err('network'); }
      const out = [];
      for (const it of list) {
        if (!it || typeof it !== 'object') continue;
        const lat = parseFloat(it.lat), lon = parseFloat(it.lon);
        if (!okPt([lat, lon])) continue;  // NaN 좌표는 미션 생성에서 멈춤 → 여기서 거른다
        const addr = typeof it.display_name === 'string' ? it.display_name : '';
        out.push({ name: typeof it.name === 'string' && it.name ? it.name : addr.split(',')[0].trim(), lat, lon, addr });
        if (out.length === 5) break;
      }
      return out;
    }

    // 미러 한 곳 시도 → { json } | { fail: 'busy'|'network' }. 너무 크면 바로 throw.
    async function tryMirror(url, q) {
      const ac = new AbortController(), timer = setTimeout(() => ac.abort(), timeout);
      try {
        let r;
        try { r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q), signal: ac.signal }); }
        catch (e) { return { fail: ac.signal.aborted ? 'busy' : 'network' }; }
        if (!r.ok) return { fail: 'busy' };  // 429·5xx·406 등 → 다음 미러
        const len = Number(r.headers && r.headers.get('content-length'));
        if (len > MAX_BYTES) throw err('too-big');
        let text;
        try { text = await r.text(); } catch (e) { return { fail: ac.signal.aborted ? 'busy' : 'network' }; }
        if (text.length > MAX_BYTES) throw err('too-big');
        try { return { json: JSON.parse(text) }; } catch (e) { return { fail: 'busy' }; }  // 200인데 HTML 오류 페이지
      } finally { clearTimeout(timer); }
    }

    async function area(from, to) {
      if (!okPt(from) || !okPt(to)) throw err('bad-coords');
      const lat0 = (from[0] + to[0]) / 2, kx = Math.cos(lat0 * DEG) * KX;
      if (Math.hypot((to[1] - from[1]) * kx, (to[0] - from[0]) * KY) > MAX_DIST) throw err('too-far');
      const bbox = [Math.min(from[0], to[0]) - MARGIN / KY, Math.min(from[1], to[1]) - MARGIN / kx, Math.max(from[0], to[0]) + MARGIN / KY, Math.max(from[1], to[1]) + MARGIN / kx];
      const q = query(bbox);
      let code = 'network';
      for (const url of MIRRORS) {
        const r = await tryMirror(url, q);
        if (r.json) return r.json;
        if (r.fail === 'busy') code = 'busy';  // 한 번이라도 서버가 응답/지연이면 busy, 전부 연결 실패면 network
      }
      throw err(code);
    }

    return { search, area };
  }

  function locate(geo = typeof navigator !== 'undefined' ? navigator.geolocation : null, timeout = GPS_TIMEOUT) {
    return new Promise((resolve, reject) => {
      if (!geo) return reject(err('gps'));
      let done = false;
      const end = (f, v) => { if (!done) { done = true; clearTimeout(timer); f(v); } };
      const timer = setTimeout(() => end(reject, err('gps')), timeout);
      try {
        geo.getCurrentPosition(p => {
          const pt = [p && p.coords && p.coords.latitude, p && p.coords && p.coords.longitude];
          end(okPt(pt) ? resolve : reject, okPt(pt) ? pt : err('gps'));
        }, () => end(reject, err('gps')), { timeout, maximumAge: 60000 });
      } catch (e) { end(reject, err('gps')); }
    });
  }

  return { create, locate, query, MIRRORS };
})();
if (typeof module !== 'undefined') module.exports = PP_OSMF;
