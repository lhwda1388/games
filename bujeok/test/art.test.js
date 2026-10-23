const test = require('node:test');
const assert = require('node:assert');
const ART = require('../art/index.js');
const C = require('../content/index.js');

test('그림 데이터: 검사 오류 없음', () => {
  assert.deepStrictEqual(ART.check(ART), []);
});

test('검사기가 줄 길이·팔레트 밖 문자·프레임 크기를 잡는다', () => {
  const bad = { PAL: ART.PAL, sprites: { a: { frames: [['kk', 'k']] }, b: { frames: [['k#']] }, c: { frames: [['kk'], ['kkk']] } } };
  const errs = ART.check(bad);
  assert.ok(errs.some(e => e.includes('a')), errs.join());
  assert.ok(errs.some(e => e.includes('b') && e.includes('#')), errs.join());
  assert.ok(errs.some(e => e.includes('c')), errs.join());
});

test('sym: 반쪽을 뒤집어 붙이고 덧칠한다', () => {
  const { sym, ov } = require('../art/palette.js');
  assert.deepStrictEqual(sym(['ab.'], ov(['k'], 0, 0)), ['kb..ba']);
});

test('영웅 모두 32×32 그림이 있다', () => {
  for (const id of Object.keys(C.heroes)) {
    const s = ART.sprites['h:' + id];
    assert.ok(s, id);
    for (const f of s.frames) { assert.strictEqual(f.length, 32, id); assert.strictEqual(f[0].length, 32, id); }
  }
});

// 색상(°)·채도·명도(HSL). 붉은 계열 = 색상 ±20° 안, 채도 > 0.45, 명도 0.15~0.85(어두운 빨강도 잡는다)
function isRed(c) {
  const r = (c >> 16) / 255, g = ((c >> 8) & 255) / 255, b = (c & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d === 0) return false;
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  return (h <= 20 || h >= 340) && s > 0.45 && l > 0.15 && l < 0.85;
}

test('붉은 계열 판정은 어두운 빨강과 적 고유색 빨강을 잡는다', () => {
  for (const c of [0xff3b30, 0x9e2a2b, 0xb02020, 0xc8553d, 0xd62839]) assert.ok(isRed(c), c.toString(16));
  for (const c of [0xffe680, 0xfff4d6, 0xf2cb4c, 0x1a1420, 0xffffff]) assert.ok(!isRed(c), c.toString(16));
});

test('붉은 계열 색은 팔레트에 없다(위험 예고 전용, 분홍 볼터치 z·Z만 예외)', () => {
  for (const [ch, c] of Object.entries(ART.PAL)) {
    if (ch === 'z' || ch === 'Z') continue;
    assert.ok(!isRed(c), `${ch} ${c.toString(16)}`);
  }
});

test('입문에 나오는 적은 모두 그림이 있다', () => {
  const ch = C.chapters.tutorial, ids = new Set(ch.waves.map(w => w.enemy).concat(ch.bosses.map(b => b.enemy), ['dokkaebi_fire_small']));
  for (const id of ids) assert.ok(ART.sprites['e:' + id], id);
});

test('크기 규칙: 잡몹 16~24, 보스 48~56', () => {
  for (const [id, s] of Object.entries(ART.sprites)) {
    if (!id.startsWith('e:')) continue;
    const def = C.enemies[id.slice(2)], w = s.frames[0][0].length;
    assert.ok(def, id);
    if (def.boss) assert.ok(w >= 48 && w <= 56, `${id} ${w}`);
    else assert.ok(w >= 16 && w <= 24, `${id} ${w}`);
  }
});

test('모든 부적에 16×16 아이콘', () => {
  for (const id of Object.keys(C.talismans)) {
    const s = ART.sprites['i:' + id];
    assert.ok(s, id);
    assert.strictEqual(s.frames[0].length, 16, id); assert.strictEqual(s.frames[0][0].length, 16, id);
  }
});

test('입문 바닥 타일 4장, 줍는 것과 탄환 그림', () => {
  assert.strictEqual(ART.sprites['w:tile:tutorial'].frames.length, 4);
  for (const id of ['w:gem', 'w:coin', 'w:heal', 'w:shot', 'w:prop:shrine']) assert.ok(ART.sprites[id], id);
});

test('모든 적이 그림을 가진다(도감 제외 적 포함)', () => {
  for (const id of Object.keys(C.enemies)) assert.ok(ART.sprites['e:' + id], id);
});

test('모든 챕터 바닥 타일과 사건 장소 그림', () => {
  for (const id of Object.keys(C.chapters)) assert.strictEqual(ART.sprites['w:tile:' + id].frames.length, 4, id);
  for (const [id, ev] of Object.entries(C.events)) if (ev.site) assert.ok(ART.sprites['w:site:' + id], id);
});

test('처치 파편은 붉지 않다: render.js 파편 색은 SHARD_COLORS뿐이고 모두 붉은 계열 밖', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'engine', 'render.js'), 'utf8');
  const cols = src.match(/SHARD_COLORS = \[([^\]]+)\]/)[1].split(',').map(s => Number(s.trim()));
  assert.ok(cols.length >= 2);
  for (const c of cols) assert.ok(!isRed(c), c.toString(16));
  assert.match(src, /function burst\(x, y, n\)/); // 적 고유색(보스는 빨강)을 받지 않는다
  for (const m of src.matchAll(/\bburst\(([^)]*)\)/g)) assert.ok(m[1].split(',').length === 3, m[0]);
});
