// node nebula-war/test/codex.test.js — 도감 문구가 data.js 와 어긋나지 않는지
const assert = require('assert');
const D = require('../data.js');
const C = require('../codex.js');
let n = 0; const test = (name, fn) => { fn(); n++; console.log('ok', name); };

const nonEmpty = s => typeof s === 'string' && s.trim().length > 0;

test('모든 유닛에 역할·설정 문구가 있다', () => {
  for (const id of Object.keys(D.units)) {
    const p = C.units[id];
    assert.ok(p && nonEmpty(p.role) && nonEmpty(p.flavor), '도감 문구 없음: units.' + id);
  }
});
test('모든 종족 건물(중립 제외)에 역할·설정 문구가 있다', () => {
  for (const [id, b] of Object.entries(D.buildings)) {
    if (b.neutral) continue;
    const p = C.buildings[id];
    assert.ok(p && nonEmpty(p.role) && nonEmpty(p.flavor), '도감 문구 없음: buildings.' + id);
  }
});
test('모든 능력에 설명이 있다', () => {
  for (const id of Object.keys(D.abilities)) assert.ok(nonEmpty(C.SPELL_DESC[id]), '능력 설명 없음: ' + id);
});
test('도감에 data.js 에 없는(낡은) id 가 없다', () => {
  for (const id of Object.keys(C.units)) assert.ok(D.units[id], '낡은 유닛 문구: ' + id);
  for (const id of Object.keys(C.buildings)) assert.ok(D.buildings[id] && !D.buildings[id].neutral, '낡은 건물 문구: ' + id);
  for (const id of Object.keys(C.SPELL_DESC)) assert.ok(D.abilities[id], '낡은 능력 설명: ' + id);
  for (const id of Object.keys(C.races)) assert.ok(D.races[id], '낡은 종족: ' + id);
});
test('모든 종족에 소개·플레이 감각·상징 메커니즘(수치는 data.js 에서)이 있다', () => {
  for (const id of Object.keys(D.races)) {
    const r = C.races[id];
    assert.ok(r && nonEmpty(r.tag) && nonEmpty(r.intro) && Array.isArray(r.style) && r.style.length >= 2 && r.style.every(nonEmpty), '종족 문구 없음: ' + id);
    assert.ok(r.mechanics.length >= 2, '상징 메커니즘 2개 이상: ' + id);
    for (const m of r.mechanics) {
      assert.ok(nonEmpty(m.name) && nonEmpty(m.text), id + ' 메커니즘 문구');
      const f = m.facts(D);
      assert.ok(nonEmpty(f) && !/undefined|NaN/.test(f), id + ' · ' + m.name + ' 수치 줄: ' + f);
    }
  }
});
test('능력·연구 참조가 도감 화면에서 풀린다(연구 → 연구 건물 카드)', () => {
  for (const [id, a] of Object.entries(D.abilities)) if (a.requires) {
    const up = D.upgrades[a.requires];
    assert.ok(up && D.buildings[up.at], id + ' 연구 건물: ' + a.requires);
  }
  for (const u of Object.values(D.units)) for (const r of u.requires || []) assert.ok(D.buildings[r], '요구 건물 없음: ' + r);
  for (const b of Object.values(D.buildings)) for (const r of b.requires || []) assert.ok(D.buildings[r], '요구 건물 없음: ' + r);
});
console.log(n + ' passed');
