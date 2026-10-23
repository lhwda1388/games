// 부적난무 — 그림 등록부. 그림 ID: h:영웅 e:적 i:부적 w:바닥·소품·줍는 것. 없는 ID는 render가 한자 동그라미로 그린다.
const BJ_ART = (function bjArt() {
  const KIT = typeof BJ_ART_KIT !== 'undefined' ? BJ_ART_KIT : require('./palette.js');
  const parts = [
    typeof BJ_ART_HEROES !== 'undefined' ? BJ_ART_HEROES : require('./heroes.js'),
    typeof BJ_ART_ENEMIES !== 'undefined' ? BJ_ART_ENEMIES : require('./enemies.js'),
    typeof BJ_ART_WORLD !== 'undefined' ? BJ_ART_WORLD : require('./world.js'),
    typeof BJ_ART_ICONS !== 'undefined' ? BJ_ART_ICONS : require('./icons.js'),
  ];
  const sprites = Object.assign({}, ...parts);
  function check(art) {
    const err = [];
    for (const [id, s] of Object.entries(art.sprites)) {
      if (!s.frames || !s.frames.length) { err.push(`${id}: 프레임 없음`); continue; }
      const h = s.frames[0].length, w = (s.frames[0][0] || '').length;
      s.frames.forEach((f, fi) => {
        if (f.length !== h) err.push(`${id}: 프레임 ${fi} 높이 ${f.length} ≠ ${h}`);
        f.forEach((row, y) => {
          if (row.length !== w) err.push(`${id}: 프레임 ${fi} 줄 ${y} 길이 ${row.length} ≠ ${w}`);
          for (const ch of row) if (ch !== '.' && !(ch in art.PAL)) err.push(`${id}: 팔레트 밖 문자 ${ch}`);
        });
      });
    }
    return err;
  }
  // <img> src용 PNG data URL(브라우저 전용, 캐시). mode 'silhouette'는 모든 칸을 k로 칠한다(도감에서 못 본 항목)
  const urls = new Map();
  function dataURL(id, scale, mode) {
    const s = sprites[id];
    if (!s || typeof document === 'undefined') return '';
    const key = id + '@' + scale + (mode || '');
    if (urls.has(key)) return urls.get(key);
    const f = s.frames[0], h = f.length, w = f[0].length, cv = document.createElement('canvas');
    cv.width = w * scale; cv.height = h * scale;
    const cx = cv.getContext('2d');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = f[y][x];
      if (ch === '.' || (mode === 'silhouette' && ch === 'a' && id.startsWith('i:'))) continue; // 합체 아이콘의 어두운 바탕은 비워 테두리와 그림 모양만 남긴다
      cx.fillStyle = '#' + KIT.PAL[mode === 'silhouette' ? 'k' : ch].toString(16).padStart(6, '0');
      cx.fillRect(x * scale, y * scale, scale, scale);
    }
    const url = cv.toDataURL('image/png');
    urls.set(key, url);
    return url;
  }
  return { PAL: KIT.PAL, SCALE: 1.5, sprites, check, dataURL };
})();
if (typeof module !== 'undefined') module.exports = BJ_ART;
