const assert = require('assert');
// node bungbung/test/nets-snapshot.test.js — 미션·레슨·장내기능 도로망/맵 해시 스냅샷.
// 도로망이 바뀌면 실패한다. 일부러 바꾼 거면 `node bungbung/test/nets-snapshot.test.js --print` 결과로 EXPECTED를 갈아 끼운다.
const crypto = require('crypto');
const M = require('../missions.js');
require('../missions-highway.js'); require('../missions-exam.js'); // M.list에 붙는다
const LS = require('../lessons.js');
require('../yard.js'); // LS에 'yard' 등록

// 소수는 1e-6으로 반올림해 해시(엔진 간 마지막 자리 차이 무시)
const hash = x => crypto.createHash('md5').update(JSON.stringify(x, (k, v) => typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v)).digest('hex');
function current() {
  const out = {};
  for (const m of M.list) out[m.id] = hash(m.build());
  for (const l of LS.list) out['lesson:' + l.id] = hash(l.mission ? l.mission.build() : l.map);
  out.yard = hash(LS.byId('yard').map);
  return out;
}

const EXPECTED = {
  'city-lane': '6102df279dfdd454b95e9624026d8be0',
  'city-bus': '44ec69c336272c91e0a0a7ff92b25adb',
  'city-cutin': '2902bbf4beba7bb44251a419dc1b5361',
  'city-leftlane': 'ee1ea8728cfc9a4a2d63a3c3a63de55a',
  'city-signal': 'f4f252fdcf66b47e7e91ed7e3d807e05',
  'city-unprotected': 'fc841251d1b506845afc43840e74d88a',
  'city-rightstop': '30bccb3f1dc367677fc0fa13aa9c87ed',
  'city-uturn': '8e9944b6f94344100e7553395910ae53',
  'city-school': '45b75b42dcd72978b5bd81f1411955a5',
  'city-night': 'e178308abf797e8d9ea582c33c3ca366',
  'city-rain': 'bbf7f36f5d50a443eab359964b6c234d',
  'city-merge': '96546fa78d0b0d35d68abd66b2a8a9e8',
  'hw-merge': '1747ebcdae3ab90b67922b38cd7ded59',
  'hw-exit': '79fa605c9fa4a7b04e85c2b93bcedd75',
  'hw-jc': '7d7dcc97175299564d50d6c23dcbf82e',
  'hw-toll': 'e8cf2fb77ca157e4a2b8c156bc8a5151',
  'hw-pass': '2a5e3e0a93e1bc6d3b98d64498f5f36f',
  'hw-jam': 'bfa0bcd70a0f209ea2b984ff5476b8ee',
  'hw-rest': '6907df47f00641666c2803d5e71f8089',
  'hw-rain': '4c5998626955050ab7d4e55454725d34',
  'exam-a': '3d9bc03001e07188c8016b6c30749f94',
  'exam-b': '8bf494fe9e04da60982134a38a7d0ceb',
  'lesson:lesson-controls': 'de12ec13872fed57a7585b1da5bdc971',
  'lesson:lesson-parking': 'cbcc028b15a5b9aabf9bf1e69540b31e',
  'lesson:lesson-city': '4451fb056ed5b6ccc892b109c21eea6d',
  'yard': '3ce70a9798eb5c7fc4cbab09b1b15625',
};

const now = current();
if (process.argv.includes('--print')) { console.log(JSON.stringify(now, null, 2)); process.exit(0); }
let fail = 0;
try {
  assert.deepStrictEqual(Object.keys(now).sort(), Object.keys(EXPECTED).sort(), '목록이 다름');
  for (const id of Object.keys(EXPECTED)) assert.strictEqual(now[id], EXPECTED[id], `${id} 도로망이 바뀜 — 일부러 바꿨으면 --print로 갱신`);
  console.log('ok  도로망 스냅샷 ' + Object.keys(EXPECTED).length + '개');
} catch (e) { fail++; console.log('FAIL 도로망 스냅샷\n  ' + e.message); }
if (fail) process.exit(1);
console.log('all 1 passed');
