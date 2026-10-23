const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const dir = path.join(__dirname, '..');

test('vendor 파일마다 LICENSES/README.txt에 고지가 있다', () => {
  const readme = fs.readFileSync(path.join(dir, 'LICENSES', 'README.txt'), 'utf8');
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const files = walk(path.join(dir, 'vendor')).filter(f => path.basename(f) !== 'README.md');
  assert.ok(files.length >= 4);
  for (const f of files) {
    const rel = path.relative(dir, f).split(path.sep).join('/');
    assert.ok(readme.includes('`' + rel + '`'), `${rel} 고지 없음`);
  }
  for (const m of readme.matchAll(/`([\w.-]+\.txt)`/g)) assert.ok(fs.existsSync(path.join(dir, 'LICENSES', m[1])), m[1]);
  const ofl = fs.readFileSync(path.join(dir, 'LICENSES', 'Galmuri-OFL.txt'), 'utf8');
  assert.match(ofl, /SIL OPEN FONT LICENSE/i);
});

test('크레딧 링크는 LICENSES의 .txt 파일을 가리키고 파일이 있다', () => {
  const src = fs.readFileSync(path.join(dir, 'ui', 'modals.js'), 'utf8');
  const links = [...src.matchAll(/href="(LICENSES\/[^"]+)"/g)].map(m => m[1]);
  assert.ok(links.length >= 2);
  for (const l of links) {
    assert.match(l, /\.txt$/, l);
    assert.ok(fs.existsSync(path.join(dir, l)), l);
  }
});

test('index.html·art.html의 로컬 스크립트·글꼴은 모두 같은 ?v= 토큰을 단다(캐시 무효화) — 토큰은 콘텐츠 VERSION', () => {
  const tokens = new Set();
  for (const page of ['index.html', 'art.html']) {
    const html = fs.readFileSync(path.join(dir, page), 'utf8');
    const urls = [...html.matchAll(/<script src="([^"]+)"/g), ...html.matchAll(/url\("([^"]+)"\)/g)].map(m => m[1]).filter(u => !/^https?:/.test(u));
    assert.ok(urls.length > 0, page);
    for (const u of urls) {
      const m = u.match(/\?v=([\w.-]+)$/);
      assert.ok(m, `${page}: ${u} 토큰 없음`);
      tokens.add(m[1]);
    }
  }
  assert.strictEqual(tokens.size, 1, [...tokens].join(','));
  assert.strictEqual([...tokens][0], String(require('../content/index.js').version)); // VERSION을 올리면 토큰도 같이 올린다
});

test('외부 그림·소리 파일이 없다(저작권 원칙: 직접 만든 것만)', () => {
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  const bad = walk(dir).filter(f => /\.(png|jpe?g|gif|webp|mp3|ogg|wav|m4a)$/i.test(f));
  assert.deepStrictEqual(bad, []);
});

test('비ASCII 글자가 있는 LICENSES/*.txt는 UTF-8 BOM으로 시작한다(charset 없는 text/plain에서도 한글이 깨지지 않게)', () => {
  for (const f of fs.readdirSync(path.join(dir, 'LICENSES')).filter(f => f.endsWith('.txt'))) {
    const buf = fs.readFileSync(path.join(dir, 'LICENSES', f));
    if (buf.every(b => b < 128)) continue;
    assert.deepStrictEqual([...buf.subarray(0, 3)], [0xef, 0xbb, 0xbf], f);
  }
});
