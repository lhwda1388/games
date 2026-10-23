// 부적난무 — 밸런스 점검 도구. 자동 플레이로 챕터를 여러 판 돌려 클리어율·생존·피해 비중을 재고 BANDS와 비교한다.
// 사용: node bujeok/test/balance.js <chapterId> [seeds=10] [--check] [--hero=<id>] [--curses=a,b]   --check: 기준을 벗어나면 종료 코드 1
// --hero: 영웅(기본 yeonhwa). --curses: 저주를 건 판 — 기준 미달은 출력만 하고 종료 코드는 0(저주는 보상과 맞바꾸는 선택이라 클리어 기준이 낮아도 된다)
// 레시피마다 시작 부적을 그 레시피의 재료 a로 바꿔 두 갈래를 각각 시험한다(입문은 영웅 시작 부적의 레시피만).
const C = require('../content/index.js');
const SIM = require('../engine/sim.js');
const SK = require('../engine/skills.js');
const bot = require('./bot.js');

const BANDS = {
  fusedMin: 0.8,   // 갈래 통계가 합체한 판만 세므로, 합체에 이르는 판이 이 비율 이상이어야 통계를 믿을 수 있다
  clearMin: 0.6,   // 레시피·갈래별 클리어율(회피 봇) 하한
  branchGap: 0.25, // 같은 레시피 두 갈래의 클리어율 차이 상한
  shareMax: 0.65,  // 한 부적의 평균 피해 비중 상한
  endsBy: 150,     // 최종 보스 등장 뒤 이 시간 안에 판이 끝나야 한다(폭주 규칙)
  novice: { idle: 150, blind: 90, rate: 0.8 }, // 입문 전용: 초보 이동으로 이 시각까지 버티는 판의 비율 하한
  noFusionMid: 0.5, // 합체 없이 첫 중간 보스가 물러나는 시각까지 버티는 비율 하한
};
// 초보 기준(novice·noFusionMid)은 처음부터 고를 수 있는 영웅에게만 건다 — unlock이 있는 영웅은 해금까지 판을 쌓은 사람이 고른다(사용자 결정). 수치는 출력만 한다
const noviceBands = hero => !hero.unlock;
if (require.main !== module) { module.exports = { BANDS, noviceBands }; return; }

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const opt = k => { const a = process.argv.find(x => x.startsWith('--' + k + '=')); return a ? a.slice(k.length + 3) : null; };
const chapterId = args[0] || 'tutorial', N = +(args[1] || 10), check = process.argv.includes('--check');
const heroId = opt('hero') || 'yeonhwa', curses = (opt('curses') || '').split(',').filter(Boolean);
const ch = C.chapters[chapterId];
if (!ch) { console.error('없는 챕터: ' + chapterId); process.exit(2); }
if (!C.heroes[heroId]) { console.error('없는 영웅: ' + heroId); process.exit(2); }
for (const c of curses) if (!C.curses[c]) { console.error('없는 저주: ' + c); process.exit(2); }
const seeds = Array.from({ length: N }, (_, i) => i + 1);
const pct = x => Math.round(x * 100) + '%';
const fails = [];
const finalAt = ch.bosses.find(b => b.final).at;
const novice = noviceBands(C.heroes[heroId]);

function play(seed, { recipe, branch = 0, move = 'evade', until = finalAt + BANDS.endsBy }) {
  const s = SIM.create(C, { seed, heroId, chapterId, runId: 'bal' + seed, curses });
  if (recipe) { s.slots = [{ id: C.recipes[recipe].a, lv: 1, cd: 0 }]; s.target = null; SK.pickTarget(s, C); }
  bot.run(s, C, until, x => { x.fx.events.length = 0; x.fx.notices.length = 0; x.fx.bolts.length = 0; x.fx.arcs.length = 0; }, { branch, move });
  return s;
}

const start = C.heroes[heroId].start;
const heroRecipe = Object.keys(C.recipes).find(r => C.recipes[r].a === start || C.recipes[r].b === start);
const recipes = ch.tutorial ? [heroRecipe] : Object.keys(C.recipes);
const allRates = [], allWins = [];
console.log(`# ${chapterId} — 시드 ${N}개, 영웅 ${heroId}${curses.length ? ', 저주 ' + curses.join(',') : ''}`);
for (const recipe of recipes) {
  const rates = [];
  for (const branch of [0, 1]) {
    const all = seeds.map(seed => play(seed, { recipe: ch.tutorial ? null : recipe, branch }));
    const fusion = C.recipes[recipe].branches[branch];
    // 그 갈래로 실제로 합체한 판만 센다 — 합체 전에 죽은 판(miss)은 기본 부적의 성적이라 갈래 비교에서 뺀다(수는 따로 보인다)
    const runs = all.filter(s => s.stats.fusions.includes(fusion)), n = runs.length || 1, miss = N - runs.length;
    const clear = runs.filter(s => s.over && s.over.win).length / n;
    const notEnded = all.filter(s => !s.over).length;
    const share = {};
    for (const s of runs) {
      const d = s.stats.damageBy, tot = Object.values(d).reduce((a, b) => a + b, 0) || 1;
      for (const [k, v] of Object.entries(d)) share[k] = (share[k] || 0) + v / tot / n;
    }
    const [topId, top] = Object.entries(share).sort((a, b) => b[1] - a[1])[0] || ['-', 0];
    const avgT = Math.round(runs.reduce((a, s) => a + s.t, 0) / n);
    const deaths = runs.filter(s => s.over && !s.over.win).map(s => Math.round(s.t) + 's ' + s.over.cause);
    const missed = all.filter(s => !s.stats.fusions.includes(fusion)).map(s => Math.round(s.t) + 's ' + (s.over ? s.over.cause : '-'));
    console.log(`${recipe}/${fusion}: 클리어 ${pct(clear)} (합체 ${runs.length}/${N}), 평균 ${avgT}s, 최대 비중 ${topId} ${pct(top)}${notEnded ? `, 끝나지 않음 ${notEnded}` : ''}${deaths.length ? `\n  사망: ${deaths.join(', ')}` : ''}${miss ? `\n  합체 전 종료(miss ${miss}): ${missed.join(', ')}` : ''}`);
    if (!runs.length) fails.push(`${fusion}: 합체한 판이 없음`);
    if (runs.length / N < BANDS.fusedMin) fails.push(`${fusion}: 합체한 판 ${runs.length}/${N} < ${pct(BANDS.fusedMin)}`);
    if (clear < BANDS.clearMin) fails.push(`${fusion}: 클리어 ${pct(clear)} < ${pct(BANDS.clearMin)}`);
    if (top > BANDS.shareMax) fails.push(`${fusion}: ${topId} 비중 ${pct(top)} > ${pct(BANDS.shareMax)}`);
    if (notEnded) fails.push(`${fusion}: 끝나지 않은 판 ${notEnded}`);
    rates.push(clear); allRates.push(clear); allWins.push(all.filter(s => s.over && s.over.win).length / N);
  }
  if (Math.abs(rates[0] - rates[1]) > BANDS.branchGap) fails.push(`${recipe}: 갈래 차이 ${pct(Math.abs(rates[0] - rates[1]))} > ${pct(BANDS.branchGap)}`);
}

const avg = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
console.log(`레시피 평균 클리어: ${pct(avg(allRates))} (합체 못 한 판 포함 ${pct(avg(allWins))})`);

const mid = ch.bosses.find(b => !b.final);
if (mid) {
  const until = mid.at + C.rules.bossLeave;
  const ok = seeds.filter(seed => { const s = play(seed, { branch: -1, until }); return !s.over || s.over.win; }).length / N;
  console.log(`합체 없이 ${until}s까지 생존: ${pct(ok)}${novice ? '' : ' (해금 영웅: 기준 제외)'}`);
  if (novice && ok < BANDS.noFusionMid) fails.push(`합체 없이 첫 중간 보스까지 생존 ${pct(ok)} < ${pct(BANDS.noFusionMid)}`);
}

if (ch.tutorial) {
  for (const move of ['idle', 'blind']) {
    const until = BANDS.novice[move];
    const ok = seeds.filter(seed => !play(seed, { move, until }).over).length / N;
    console.log(`초보(${move}) ${until}s까지 생존: ${pct(ok)}${novice ? '' : ' (해금 영웅: 기준 제외)'}`);
    if (novice && ok < BANDS.novice.rate) fails.push(`초보(${move}) ${until}s 생존 ${pct(ok)} < ${pct(BANDS.novice.rate)}`);
  }
}

if (fails.length) console.log('\n기준 미달:\n- ' + fails.join('\n- '));
else console.log('\n기준 통과');
if (check && fails.length && !curses.length) process.exit(1);
