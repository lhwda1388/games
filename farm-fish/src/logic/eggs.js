  // ---------- hidden easter eggs (도감 "기록" tab shows ??? + hint until found) ----------
  // hint = 기록 tab line, letter = 우편배달부 편지, cat/merch = what the cat and the merchant let slip.
  var EGGS = [
    { id: 'scarecrow', name: '춤추는 허수아비', reward: 300, desc: '열 번 말을 걸었더니 허수아비가 춤을 췄다',
      hint: '허수아비가 심심해 보인다… 쉬지 않고 열 번 말을 걸어 볼까?',
      letter: '밭의 허수아비가 외롭대요. 쉬지 않고 열 번쯤 톡톡 두드려 주면 기뻐할 거예요.',
      cat: '고양이가 허수아비를 빤히 본다. 자꾸 건드려 보고 싶은 눈치다',
      merch: '상인: 허수아비도 말 걸어 주는 걸 좋아해요. 열 번쯤 연달아요.' },
    { id: 'clockfish', name: '시계 물고기', reward: 0, desc: '정각에 문 물고기는 시계 물고기였다',
      hint: '시계가 딱 맞을 때(00분) 연못이 이상하다',
      letter: '매시 정각, 00분이 되는 그 1분 동안 연못에서 째깍 소리가 난대요. 그때 입질을 받아 보세요.',
      cat: '고양이가 연못을 보며 꼬리로 째깍째깍 박자를 맞춘다… 00분을 기다리나?',
      merch: '상인: 정각에 낚싯대를 드리워 본 적 있어요? 00분이요, 00분.' },
    { id: 'radish999', name: '무 999개', reward: 2000, desc: '999번째 무가 고개 숙여 인사했다',
      hint: '무를 아주아주 많이(999개) 거두면 무가 인사를 한다',
      letter: '무 농사 장인은 무를 999개 거둔 사람을 말한대요. 거기까지 가면 무가 인사를 한다나요.',
      cat: '고양이가 무 더미 위에서 999까지 세다가 잠들었다',
      merch: '상인: 무를 999개 거둔 농부를 본 적이 있어요. 무가 절을 하더라고요.' },
    { id: 'midnight', name: '자정의 손님', reward: 500, desc: '밤 12시 정각, 부엉이가 마당에 앉아 있었다',
      hint: '진짜 밤 12시(0시~0시 10분)에 와 보면 누가 기다린다',
      letter: '진짜 시계로 밤 12시, 0시 10분 전까지 마당을 열어 두면 부엉이가 들른대요.',
      cat: '고양이가 자정 이야기를 하는 것 같다. 밤 12시에 누가 온다나',
      merch: '상인: 진짜 밤 12시에 문을 열어 둔 집엔 부엉이가 와요.' },
    { id: 'wish3', name: '소원 세 개', reward: 400, desc: '한밤에 소원 세 개를 빌었다',
      hint: '하룻밤에 별똥별·반딧불에게 소원을 세 번 빌면…',
      letter: '하룻밤에 소원을 세 번 빌면 하나는 꼭 이루어진대요. 별똥별도 반딧불도 좋아요.',
      cat: '고양이가 밤하늘을 세 번 올려다본다',
      merch: '상인: 소원은 한 밤에 세 번. 그게 요령이에요.' },
    { id: 'sleep', name: '꿈속 낚시', reward: 300, desc: '밤에 침대에 누웠더니 고래를 낚는 꿈을 꿨다',
      hint: '밤이 되면 집 안 침대에 누워 보자',
      letter: '밤에는 푹 자야지요. 침대에 누우면 좋은 꿈을 꿀 거예요.',
      cat: '고양이가 하품을 하며 집 안 침대 쪽을 본다. 밤엔 자야지',
      merch: '상인: 밤에 침대에서 자 본 적 있어요? 꿈이 끝내줘요.' },
    { id: 'duckparade', name: '오리 행진', reward: 300, desc: '새끼 오리들이 줄 맞춰 인사했다',
      hint: '오리 가족이 연못을 지날 때 세 번 인사해 보자',
      letter: '연못을 건너는 오리 가족에게 세 번 손을 흔들면 새끼들이 줄 맞춰 인사해요.',
      cat: '고양이가 오리 가족 쪽으로 세 번 꼬리를 흔든다',
      merch: '상인: 오리 가족 보면 세 번 인사해 봐요. 귀여운 걸 보게 될 거예요.' },
    { id: 'catpet', name: '고양이 친구', reward: 300, desc: '고양이를 다섯 번 쓰다듬어 친구가 됐다',
      hint: '마당에 온 고양이를 다섯 번 쓰다듬어 보자',
      letter: '고양이는 다섯 번쯤 쓰다듬어 줘야 마음을 연대요.',
      cat: '고양이가 머리를 내민다. 더 쓰다듬어 달라는 눈치다',
      merch: '상인: 그 고양이, 다섯 번은 쓰다듬어 줘야 친구가 돼요.' }
  ];
  // 시계 물고기: real only when the bite lands at real hh:00. Not in any normal pool or order (unlock never met).
  FISH.push({ id: 'clockfish', name: '시계 물고기', rarity: '정각 한정', w: 0, min: 18, max: 40, power: 1.2, price: 600,
    window: 'jeonggak', unlock: 'never', egg: true, hint: '시계가 딱 맞을 때(00분) 연못이 이상하다' });

  function eggById(id) { for (var k = 0; k < EGGS.length; k++) if (EGGS[k].id === id) return EGGS[k]; return null; }
  function eggCount(s) { return s.yard ? Object.keys(s.yard.eggs).length : 0; }
  // marks found and pays once; returns the egg, or null if already found
  function findEgg(s, id, now) {
    var y = yardOf(s), e = eggById(id);
    if (!e || y.eggs[id]) return null;
    y.eggs[id] = now; s.coins += e.reward;
    return e;
  }
  // ten taps on the scarecrow with no pause longer than 3 s (actScale keeps it real-time under ?speed)
  function tapScarecrow(s, now, actScale) {
    var g = yardOf(s).eg;
    if (now - g.scareAt > 3000 * (actScale || 1)) g.scare = 0;
    g.scare++; g.scareAt = now;
    if (g.scare < 10) return { n: g.scare, egg: null };
    g.scare = 0;
    return { n: 10, egg: findEgg(s, 'scarecrow', now) };
  }
  // the bite landed at real hh:00 → it's the clock fish
  function clockRoll(d, rng) {
    if (d.getMinutes() !== 0) return null;
    var f = fishById('clockfish');
    return { id: f.id, size: Math.round((f.min + (f.max - f.min) * rng()) * 10) / 10 };
  }
  function tapBed(s, now, tzMin) {
    if (gameClock(now, tzMin).phase !== 'night') return { text: '아직 졸리지 않다… 밤에 다시 누워 보자', egg: null };
    var e = findEgg(s, 'sleep', now);
    return { text: e ? '쿨쿨… 고래를 낚는 꿈을 꿨다' : '쿨쿨… 푹 잤다', egg: e };
  }
  // conditions that can be checked any time: d = the real Date (midnight is a real-clock egg)
  function checkEggs(s, now, d) {
    var out = [], e;
    if (d.getHours() === 0 && d.getMinutes() < 10 && (e = findEgg(s, 'midnight', now))) out.push(e);
    if ((s.dex.crops.radish || 0) >= 999 && (e = findEgg(s, 'radish999', now))) out.push(e);
    if (s.dex.fish.clockfish && (e = findEgg(s, 'clockfish', now))) out.push(e);
    return out;
  }

  expose({
    EGGS: EGGS, eggById: eggById, eggCount: eggCount, findEgg: findEgg, tapScarecrow: tapScarecrow,
    clockRoll: clockRoll, tapBed: tapBed, checkEggs: checkEggs
  });
