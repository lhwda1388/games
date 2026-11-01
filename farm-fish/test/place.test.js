// farm-fish/test/place.test.js — 지금 있는 곳: every view and every fishing spot has a name (ui/place.js), and the names tell places apart
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = require('../build.js').build();
vm.runInThisContext(html.match(/<script id="logic">([\s\S]*?)<\/script>/)[1], { filename: 'logic.js' });
const L = globalThis.Logic;
const ui = html.match(/<script id="ui">([\s\S]*?)<\/script>/)[1];
const place = fs.readFileSync(path.join(__dirname, '..', 'src', 'ui', 'place.js'), 'utf8');
const table = (name) => vm.runInNewContext('(' + place.match(new RegExp('var ' + name + ' = (\\{[\\s\\S]*?\\});'))[1] + ')');
const PLC_VIEW = table('PLC_VIEW'), PLC_SPOT = table('PLC_SPOT');
const CAMP_VIEWS = L.CMP_SITES.map((t) => t.view);
const spotLabel = (id) => PLC_SPOT[id] || L.SPOTS[id].name;
const viewLabel = (v) => CAMP_VIEWS.includes(v) ? L.CMP_SITES.find((t) => t.view === v).name : PLC_VIEW[v];

// every view the UI goes to or checks for: goScene('x'), view === 'x', the train destinations, the camp sites
function uiViews() {
  const out = new Set();
  for (const re of [/goScene\('([a-z]+)'\)/g, /view [!=]== '([a-z]+)'/g]) { let m; while ((m = re.exec(ui))) out.add(m[1]); }
  Object.values(vm.runInNewContext('(' + ui.match(/var TRN_VIEW = (\{[^}]*\})/)[1] + ')')).forEach((v) => out.add(v));
  CAMP_VIEWS.forEach((v) => out.add(v));
  out.delete('cmpup');   // the camp's 「물가에서 올라가기」 key: goScene turns it into the camp view (cmpOutTo)
  return [...out];
}

test('every view has a place name (a new scene must add one to PLC_VIEW in ui/place.js)', () => {
  const views = uiViews();
  assert.ok(views.length >= 20, 'the scan sees the views: ' + views.join());
  const special = ['farm', 'home'];   // named by the fishing spot / by the resident
  const missing = views.filter((v) => !special.includes(v) && !viewLabel(v));
  assert.deepEqual(missing, []);
});

test('every fishing spot has a name, and no spot reads like a view (섬 부두 vs 섬, 산골 계곡 물가 vs 산골 계곡)', () => {
  const ids = Object.keys(L.SPOTS);
  assert.ok(ids.length >= 11, ids.join());
  ids.forEach((id) => assert.ok(spotLabel(id), id));
  const viewNames = new Set(uiViews().map(viewLabel).filter(Boolean));
  const clash = ids.filter((id) => viewNames.has(spotLabel(id)));
  assert.deepEqual(clash, []);
  const labels = ids.map(spotLabel);
  assert.equal(new Set(labels).size, labels.length, 'two spots share a name: ' + labels.join());
  assert.equal(spotLabel('island'), '섬 부두');
  assert.equal(spotLabel('snow'), '설원 얼음 호수');
  assert.equal(spotLabel('cmpbrook'), '계곡 캠핑 물가');
});

test('the canvas label reads the same table (one source, not a second list in goScene)', () => {
  assert.match(ui, /cv\.setAttribute\('aria-label', plcAria\(sc\)\)/);
  assert.deepEqual(ui.match(/cv\.setAttribute\('aria-label', '[^']*'/g) || [], [], 'no canvas label written as a literal');
});
