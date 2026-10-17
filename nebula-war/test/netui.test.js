// node nebula-war/test/netui.test.js — netui 순수 도우미(채팅 정리·자르기·범위 접두어, 보내기 제한, 로그 JSON)
const assert = require('assert');
const N = require('../netui.js');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);
let fail = 0;

test('parse: 공백 정리, 빈 문자열은 null', () => {
  assert.deepStrictEqual(N.parse('  안녕   하세요 \n'), { text: '안녕 하세요', scope: 'all' });
  assert.strictEqual(N.parse('   '), null);
  assert.strictEqual(N.parse(''), null);
  assert.strictEqual(N.parse(null), null);
});
test('parse: /t 접두어 = 팀, /a = 전체, 접두어만이면 null', () => {
  assert.deepStrictEqual(N.parse('/t 집결합시다'), { text: '집결합시다', scope: 'team' });
  assert.deepStrictEqual(N.parse('/T  gg'), { text: 'gg', scope: 'team' });
  assert.deepStrictEqual(N.parse('/a hi', 'team'), { text: 'hi', scope: 'all' });
  assert.deepStrictEqual(N.parse('hi', 'team'), { text: 'hi', scope: 'team' });
  assert.deepStrictEqual(N.parse('/today'), { text: '/today', scope: 'all' }); // 공백 없는 /t... 는 접두어 아님
  assert.strictEqual(N.parse('/t '), null);
  assert.strictEqual(N.parse('x', 'bogus').scope, 'all');
});
test('parse: net·lobby·replay 와 같은 200(UTF-16)으로 자른다(이모지 반쪽 없음)', () => {
  assert.strictEqual(N.CHAT_MAX, 200);
  assert.strictEqual(N.parse('가'.repeat(300)).text.length, 200);
  const e = N.parse('😀'.repeat(130)).text;
  assert.strictEqual(e.length, 200);
  assert.strictEqual(Array.from(e).length, 100);
  assert.ok(!/[\ud800-\udbff]$/.test(N.parse('a' + '😀'.repeat(130)).text));
});
test('clean: 제어·양방향·폭 없는 문자 제거, 한글·이모지(ZWJ) 보존', () => {
  assert.strictEqual(N.clean('a\u0000b\u0007c‮d⁦e​f﻿'), 'abcdef');
  assert.strictEqual(N.clean('줄\n바꿈\t탭'), '줄 바꿈 탭');
  const fam = '👨‍👩‍👧';
  assert.strictEqual(N.clean('가족 ' + fam), '가족 ' + fam);
  assert.strictEqual(N.clean('<img src=x onerror=alert(1)>'), '<img src=x onerror=alert(1)>'); // 글자 그대로(표시는 textContent)
});
test('display: 받은 메시지도 같은 정리 + 200자', () => {
  assert.strictEqual(N.display('  a ‮ b  '), 'a b');
  assert.strictEqual(N.display('x'.repeat(300)).length, 200);
});
test('limiter: 3초에 5개, 시간 지나면 회복, wait 는 남은 ms', () => {
  let t = 0;
  const L = N.limiter(5, 3000, () => t);
  for (let i = 0; i < 5; i++) { t = i * 100; assert.ok(L.ok()); }
  t = 500; assert.strictEqual(L.ok(), false); assert.strictEqual(L.wait(), 2500);
  t = 2999; assert.strictEqual(L.ok(), false);
  t = 3000; assert.ok(L.ok()); // 첫 것(0)이 창 밖
  t = 3050; assert.strictEqual(L.ok(), false); // 100·200·300·400·3000 이 아직 창 안
  t = 3100; assert.ok(L.ok());
  t = 99999; assert.strictEqual(L.wait(), 0);
});
test('limiter: 기본값 = net 의 채팅 제한(5개/3초)', () => {
  let t = 0;
  const L = N.limiter(undefined, undefined, () => t);
  for (let i = 0; i < 5; i++) assert.ok(L.ok());
  assert.strictEqual(L.ok(), false);
  t = 3000; assert.ok(L.ok());
});
test('mmss · kindOf', () => {
  assert.strictEqual(N.mmss(0), '00:00'); assert.strictEqual(N.mmss(7999), '00:07'); assert.strictEqual(N.mmss(65000), '01:05'); assert.strictEqual(N.mmss(-5), '00:00');
  assert.strictEqual(N.kindOf('attack'), 'attack'); assert.strictEqual(N.kindOf('help'), 'help');
  assert.strictEqual(N.kindOf('__proto__'), 'ping'); assert.strictEqual(N.kindOf('constructor'), 'ping'); assert.strictEqual(N.kindOf(undefined), 'ping');
  assert.deepStrictEqual(Object.keys(N.KINDS), ['ping', 'attack', 'help']);
});
test('logPayload · logName: desync 필드 + 덧붙임, 파일 이름에 틱', () => {
  const ev = { type: 'desync', tick: 1200, mine: 1, theirs: { 1: 2 }, player: 1, recent: [[1199, { type: 'stop' }]] };
  const at = new Date('2026-10-16T00:00:00Z');
  const p = N.logPayload(ev, { version: 7 }, at);
  assert.deepStrictEqual(p, { kind: 'desync', at: '2026-10-16T00:00:00.000Z', tick: 1200, mine: 1, theirs: { 1: 2 }, player: 1, recent: [[1199, { type: 'stop' }]], version: 7 });
  assert.strictEqual(N.logName(ev), 'nebula-war-desync-1200.json');
  assert.deepStrictEqual(N.logPayload({ type: 'error', reason: 'sim', message: 'x' }, {}, at), { kind: 'error', at: '2026-10-16T00:00:00.000Z', reason: 'sim', message: 'x' });
  assert.ok(/^nebula-war-error-\d+\.json$/.test(N.logName({ type: 'error' })));
});
test('overlayFor: 끝 화면 > 지연 8초 선택지 > 지연 > 없음', () => {
  assert.strictEqual(N.overlayFor(null), null);
  assert.strictEqual(N.overlayFor({ state: 'running', waiting: [], waitingMs: 0 }), null);
  assert.strictEqual(N.overlayFor({ state: 'running', waiting: [1], waitingMs: 7999 }), 'lag');
  assert.strictEqual(N.overlayFor({ state: 'running', waiting: [1], waitingMs: 8000 }), 'prompt');
  assert.strictEqual(N.overlayFor({ state: 'running', waiting: [1], waitingMs: 3000 }, 2000), 'prompt');
  for (const k of ['dropped', 'desync', 'mismatch', 'error']) assert.strictEqual(N.overlayFor({ state: k, waiting: [1], waitingMs: 9e3 }), k);
});
test('autoDropIn: 자동 내보내기까지 남은 초(올림, 음수 없음)', () => {
  assert.strictEqual(N.autoDropIn(8000, 30000), 22);
  assert.strictEqual(N.autoDropIn(8500, 30000), 22);
  assert.strictEqual(N.autoDropIn(29001, 30000), 1);
  assert.strictEqual(N.autoDropIn(31000, 30000), 0);
  assert.strictEqual(N.autoDropIn(undefined, 30000), 30);
});

test('typing 은 처음에 false', () => { assert.strictEqual(N.typing, false); });

for (const [name, fn] of tests) {
  try { fn(); console.log('ok  ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n  ' + (e && e.stack || e)); }
}
if (fail) { console.log(fail + ' failed'); process.exit(1); } else console.log('all ' + tests.length + ' passed');
