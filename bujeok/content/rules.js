// 부적난무 — 공통 규칙 수치. 밸런스 조정은 여기와 각 콘텐츠 파일에서만 한다.
const BJ_RULES = {
  vision: { base: 1000 }, // 시야 반경(px). 안개는 이 값에 배수를 곱한다(그림만 — 판정은 바뀌지 않는다)
  view: { w: 540, h: 960, spriteScale: 1.3 }, // spriteScale: 그림만 키운다(판정 반경은 그대로)
  player: { hp: 100, speed: 150, r: 14, magnet: 70, invuln: 0.5 },
  slots: 6, baseMaxLv: 5, fusionMaxLv: 3, fusionReq: 3,
  choiceCount: 3, pityWindow: 3, discards: 2, healOption: 30,
  // 레벨 n → n+1에 필요한 혼백. 목록을 넘으면 마지막 값 + xpCurveStep × 초과 레벨
  xpCurve: [4, 10, 13, 15, 18, 21, 24, 28, 32, 36], xpCurveStep: 5,
  spawn: { ringMin: 600, ringMax: 680, safeRadius: 220 },
  bossLeave: 45, thumbZoneY: 240, thumbWarnBonus: 0.3,
  gem: { pullSpeed: 420, pickR: 8 },
  limits: { enemies: 400, shots: 300, zones: 60, gems: 400, eshots: 200 },
  coins: { perTenSec: 1, perTenKills: 1, clear: 50 },
  elite: { hp: 3, r: 1.3, dmg: 1.5, xp: 3, coin: 3 },
  events: { min: 2, max: 3, from: 60, bossGap: 30, endGap: 30, quietPad: 25 }, // 판마다 돌발 사건 수와 시각 제약(스펙 6절). quietPad: 챕터 quietWindows 앞 여유(장소 수명만큼)
  curses: { max: 3, coinBonus: 0.25 }, // 고를 수 있는 저주 수, 저주 하나당 결과 엽전 보너스
  revive: { hpFrac: 0.5, invuln: 2, clearR: 220, max: 2 }, // 부활(무당집 + 영웅). max: 판마다 부활 횟수 상한(스펙 사용자 결정)
  purse: { perSec: 0.1 }, // 판 엽전 수입(초당, 정수 엽전으로 쌓고 소수는 state.purseAcc에)
  market: { offers: 3, newPrice: 12, upBase: 8, upPerLv: 4 }, // 도깨비 장터 가격: 새 부적, 강화(기본 + 현재 레벨당)
  // 최종 보스 폭주: 등장 after초 뒤부터 every초마다 1단계. 단계마다 속도·피해 배수 — 못 잡는 빌드도 판이 끝난다
  enrage: { after: 90, every: 30, speedMul: 3, dmgMul: 2 },
  targetRange: 700, // '가장 가까운 적'을 찾는 최대 거리
  hookSpawnCap: 60, // 챕터 훅 하나가 동시에 살려 둘 수 있는 적 수
  stillDelay: 0.3, // 이만큼(초) 서 있어야 stillOnly 오라가 켜진다
  chainFlashR: 16, // 번개가 튄 자리의 번쩍임 반경(화면 효과)
  homingRange: 400, // 유도 투사체가 새 목표를 찾는 반경
  ranged: { holdIn: 0.7, fireOut: 1.2, ttl: 3 }, // 원거리 패턴 기본값: range×holdIn 안이면 물러남, range×fireOut 밖이면 쏘지 않음, 투사체 수명(초). 패턴에 같은 이름이 있으면 그 값
  juice: { flash: 0.07, squash: 0.1, shards: 5, killShards: 10, shardLife: 0.45, maxShards: 300, soul: 0.3, hitstop: 0.06, shake: 4, shakeTime: 0.15, hurtEdge: 0.2 }, // 타격감 연출(그리기 전용). 3c 옵션에서 shake·flash를 줄인다
  summonOffset: 60, // 보스가 부른 졸개가 나타나는 거리(보스 기준)
};
if (typeof module !== 'undefined') module.exports = BJ_RULES;
