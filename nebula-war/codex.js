// 네뷸라 워 — 도감(코덱스): 종족·유닛·건물·능력 설명 문구 + 메인 메뉴 도감 화면.
// 문구만 여기 둔다(id 로 묶음). 이름·체력·무기·비용·시간·요구 건물·능력·연구는 화면이 그릴 때 data.js(NW_DATA)에서 읽는다.
// 능력 한 줄 설명(SPELL_DESC)은 명령 카드 툴팁(ui.js)과 도감이 함께 쓴다 — 출처는 여기 하나.
// 화면: NW_CODEX.mount(section, { D, R, A, RM }) -> { open(), onKey(ev) } — 처음 열 때 만들고(지연), 종족 탭도 처음 고를 때 채운다.
// test/codex.test.js: data.js 의 모든 유닛·건물(중립 제외)·능력 id 에 문구가 있고, 여기 남은 id 가 data.js 에 모두 있는지 확인.
const NW_CODEX = (() => {
  const races = {
    legion: {
      tag: '녹슨 리벳의 선단',
      intro: '난파선 고철을 리벳으로 이어 붙인 인양 선단.',
      style: [
        '단단한 보병·차량으로 전선을 민다',
        '부속 건물로 기능을 늘리고, 건물을 띄워 옮긴다',
        '일꾼이 기계와 건물을 고친다',
      ],
      mechanics: [
        { name: '자동 정박', text: '앵커는 잠시 멈추면 스스로 정박하고, 이동 명령에 바로 풀린다.',
          facts: D => { const b = D.units.bastion, s = b.modes.siege; return '정지 ' + sec(s.time) + '초 → 정박 · 피해 ' + b.weapon.dmg + ' → ' + s.weapon.dmg + ' · 사거리 ' + tiles(b.weapon.range) + ' → ' + tiles(s.weapon.range) + '타일'; } },
        { name: '부속과 이륙', text: '부속 건물로 연구를 늘리고, 주요 건물은 띄워 옮긴다.',
          facts: D => '부속 ' + Object.values(D.buildings).filter(b => b.addonOf).length + '종 · 띄울 수 있는 건물 ' + Object.values(D.buildings).filter(b => b.lift).length + '종' },
      ],
    },
    swarm: {
      tag: '썩어서 자라는 군락',
      intro: '소행성 먼지에 뿌리내려 하나의 균사망으로 싸우는 균류 군락.',
      style: [
        '유충에서 유닛을 한꺼번에 키운다',
        '일꾼이 건물로 변태하고, 건물은 균사층 위에만 선다',
        '이길수록 빨리·단단하게 불어난다',
      ],
      mechanics: [
        { name: '변이 누적', text: '처치 수가 쌓이면 방어가 붙고, 2단계부터 회복이 빨라진다.',
          facts: D => { const m = D.races.swarm.mutation; return '처치 ' + m.at.join(' / ') + ' → 방어 +' + m.armor.join(' / +') + ' · 2단계 회복 ×' + m.regen2; } },
        { name: '처치 시 유충 충전', text: '적을 쓰러뜨리면 가장 가까운 균핵에 유충이 찬다.',
          facts: D => '적 유닛 처치 1 → 유충 +' + D.races.swarm.killLarva + ' (균핵당 최대 3)' },
        { name: '균사층과 휴면', text: '연구 뒤 지상 유닛이 땅속에 숨어 탐지기 없이는 안 보인다.',
          facts: D => { const u = D.upgrades.swarm_burrow; return '휴면 연구 ' + u.name + ' @ ' + D.buildings[u.at].name + ' · 휴면하는 유닛 ' + Object.values(D.units).filter(x => x.modes && x.modes.burrow).length + '종'; } },
      ],
    },
    elysian: {
      tag: '결정의 합창',
      intro: '성운 결정에서 깨어나, 모일수록 강해지는 기계 의식.',
      style: [
        '비싸고 튼튼한 유닛을 적게 굴린다',
        '일꾼은 건물을 불러내고 바로 일터로 돌아간다',
        '같은 종류끼리 뭉치고, 기둥으로 레이 라인을 넓힌다',
      ],
      mechanics: [
        { name: '공명 재생', text: '같은 종류가 모여 있으면 전투 중에도 결정막이 찬다.',
          facts: D => { const r = D.races.elysian.resonance; return '반경 ' + r.r + '타일 안 같은 종류 n기(최대 ' + r.cap + ') → 1초마다 결정막 +⌊n/' + r.per + '⌋'; } },
        { name: '레이 라인', text: '건물은 기둥 둘레나 기둥 사이 빛의 선 위에만 서고, 기둥이 부서지면 멈춘다.',
          facts: D => { const p = D.buildings.resonator; return '기둥 반경 ' + p.power + '타일 · 기둥 사이 ' + p.link + '타일 이내 연결 · 선 폭 ' + p.width + '타일'; } },
      ],
    },
  };

  // 유닛: role = 역할 먼저 한 줄, flavor = 짧은 설정
  const units = {
    // 리벳
    engineer:    { role: '일꾼. 채집·건설에 기계 수리까지.', flavor: '리벳 총 한 자루면 난파선도 집이 된다.' },
    trooper:     { role: '기본 보병. 지상·공중을 모두 쏜다.', flavor: '갑판을 닦던 손으로 소총을 든다.' },
    scorcher:    { role: '근거리 범위 보병. 소형 무리를 태운다.', flavor: '용접 불꽃은 적을 가리지 않는다.' },
    corpsman:    { role: '치료 보병. 주변 생체 아군을 자동 치료.', flavor: '찢어진 것은 꿰매면 된다.' },
    shade:       { role: '저격·지원 보병. 표식으로 적을 약하게.', flavor: '먼저 보는 쪽이 이긴다.' },
    hound:       { role: '빠른 견제 차량. 시커를 풀어 쫓는다.', flavor: '브레이크는 선택 사항.' },
    bastion:     { role: '공성 차량. 멈추면 정박해 먼 거리를 포격.', flavor: '닻을 내리는 순간, 거기가 전선이다.' },
    strider:     { role: '대공 보행 차량. 지상 사격 + 강한 대공.', flavor: '항구 크레인을 걷게 만들었다.' },
    phantom:     { role: '전투 비행선. 공중에 강하고 지상도 견제.', flavor: '윙윙 소리가 들리면 이미 늦었다.' },
    ferry:       { role: '수송선. 지상 유닛을 싣고 난다.', flavor: '화물칸 문은 늘 반쯤 열려 있다.' },
    surveyor:    { role: '탐지 지원선. 정화·견인 빔으로 아군을 돕고 적을 묶는다.', flavor: '잔해를 끌던 배가 이제 적을 끈다.' },
    lancer:      { role: '대공 전담. 공중 무리에 범위 작살.', flavor: '고래잡이 작살을 하늘로 돌렸다.' },
    dreadnought: { role: '기함. 가장 튼튼하고, 수리 드론으로 기계를 고친다.', flavor: '폐선 열두 척을 이어 붙였다.' },
    seeker:      { role: '소환 전용. 지상 적을 쫓아 자폭한다.', flavor: '깡통에 프로펠러, 그리고 화약.' },
    // 마이셀
    drudge:      { role: '일꾼. 채집하고, 스스로 건물로 변태한다.', flavor: '뿌리 한 가닥이 곧 새 기둥이 된다.' },
    bloater:     { role: '보급 비행체. 연구 뒤 탐지·수송.', flavor: '느릿하게 떠다니는 포자 주머니.' },
    skitter:     { role: '빠른 근접. 둘씩 태어나 떼로 덮친다.', flavor: '포자 하나에 다리 여섯.' },
    spinewyrm:   { role: '원거리. 지상·공중을 가시로 쏜다.', flavor: '가시를 세우고 튕겨 낸다.' },
    trencher:    { role: '휴면 포격. 땅속에서 일직선 범위 공격.', flavor: '뿌리가 창이 되어 솟는다.' },
    wingsting:   { role: '비행 견제. 튕기는 공격으로 여럿을 친다.', flavor: '바람보다 빠른 포자.' },
    siegemaw:    { role: '공중 포격. 먼 지상 목표를 폭격.', flavor: '주머니에서 산성 덩어리가 떨어진다.' },
    acidwing:    { role: '대공 전담. 공중 적에 부식 포자.', flavor: '닿는 금속마다 녹이 핀다.' },
    burster:     { role: '자폭 대공. 공중 적에 붙어 터진다.', flavor: '여문 씨앗은 터지기 위해 산다.' },
    matron:      { role: '지원 비행체. 스폰링을 뿌리고 균사 장판을 깐다.', flavor: '군락의 어머니 갓.' },
    husk:        { role: '소환 전용. 적 무리 속에서 크게 터진다.', flavor: '쓰러진 몸에서 다시 싹튼다.' },
    blighter:    { role: '마법 유닛. 부패 포자와 기생 발아.', flavor: '썩는 냄새가 나면 너무 가까이 온 것이다.' },
    behemoth:    { role: '최종 근접. 거대한 체력으로 전선을 짓밟는다.', flavor: '천 년 묵은 고목이 걸어 나왔다.' },
    spawnling:   { role: '소환 전용. 잠깐 사는 근접 유닛.', flavor: '태어나자마자 문다.' },
    // 코러스
    shaper:      { role: '일꾼. 건물을 불러내고 바로 일터로 돌아간다.', flavor: '음 하나를 맞추면 결정이 자란다.' },
    oathblade:   { role: '근접 전사. 두꺼운 결정막으로 앞줄을 버틴다.', flavor: '날을 세운 결정은 부러지지 않는다.' },
    arcwalker:   { role: '원거리 보행기. 지상·공중을 광선으로 쏜다.', flavor: '빛을 휘어 모퉁이 너머를 겨눈다.' },
    sage:        { role: '마법 유닛. 공명 파쇄, 둘이 합쳐 하모닉.', flavor: '한 음으로 산을 울린다.' },
    umbra:       { role: '은신 근접. 둘이 합쳐 디스코드.', flavor: '침묵도 하나의 음이다.' },
    ascendant:   { role: '합체 유닛. 두꺼운 결정막 + 범위 공격.', flavor: '두 목소리가 겹쳐 화음이 된다.' },
    voidascendant:{ role: '합체 마법 유닛. 결정 봉인·결정화로 적을 묶는다.', flavor: '어긋난 화음은 듣는 이를 멈춰 세운다.' },
    crucible:    { role: '느린 공성. 샤드를 만들어 쏜다.', flavor: '실을 잣듯 파편을 뽑아낸다.' },
    shard:       { role: '크루시블 탄. 날아가 범위로 터진다.', flavor: '깨진 결정은 가장 날카롭다.' },
    skiff:       { role: '수송선. 지상 유닛을 싣고 난다.', flavor: '울림을 타고 미끄러지는 배.' },
    watcher:     { role: '은신 탐지기. 정찰하고 적 마나를 빼앗는다.', flavor: '가장 작은 소리까지 듣는다.' },
    sentinel:    { role: '전투 비행체. 공중에 강하고 지상도 견제.', flavor: '현이 울릴 때마다 적이 떨어진다.' },
    skimmer:     { role: '대공 전담. 빠른 범위 공격, 광자 탐침 정찰.', flavor: '귀가 아플 만큼 높은 음.' },
    ark:         { role: '모함. 스파크를 띄워 보낸다.', flavor: '노래 한 소절마다 전투기 한 기.' },
    spark:       { role: '앤섬 함재기. 앤섬 주위를 돌며 쏜다.', flavor: '짧고 날카로운 한 음.' },
    warden:      { role: '지휘 비행체. 주변 아군을 감추고 결정막을 채운다.', flavor: '합창은 지휘자가 있어야 완성된다.' },
  };

  const buildings = {
    // 리벳
    hq:          { role: '본진. 리베터 생산, 띄워 옮길 수 있다.', flavor: '선단이 처음 닻을 내린 자리.' },
    uplink:      { role: '도크 부속. 드론 정찰.', flavor: '고물 안테나도 신호는 잡는다.' },
    silo:        { role: '도크 부속. 고철 낙하.', flavor: '하늘에서 고철이 떨어지는 날.' },
    depot:       { role: '보급. 보급 한도를 늘린다.', flavor: '쌓아 둔 고철이 곧 보급이다.' },
    pump:        { role: '가스 채취. 분출구 위에 짓는다.', flavor: '새는 곳은 테이프로 막았다.' },
    garrison:    { role: '보병 생산. 데커·스코처·메딕·스포터.', flavor: '해먹 열두 개, 코 고는 소리 스무 개.' },
    workshop:    { role: '보병 강화. 무기·장갑 연구.', flavor: '선반이 돌면 탄이 깎여 나온다.' },
    drillhall:   { role: '보병 기술. 데커 사거리·연막 구역 연구.', flavor: '고치는 법과 쏘는 법을 함께 가르친다.' },
    pillbox:     { role: '방어 시설. 지상·공중을 쏜다.', flavor: '화물 상자에 총구를 뚫었다.' },
    flak:        { role: '대공 방어·탐지. 숨은 적을 드러낸다.', flavor: '하늘을 향해 쉬지 않고 덜컹거린다.' },
    motorpool:   { role: '차량 생산. 스키드·앵커·갠트리.', flavor: '바퀴부터 붙이고 생각은 나중에.' },
    garage:      { role: '조립장 부속. 차량 전용 연구.', flavor: '개조할 수 없는 고철은 없다.' },
    arsenal:     { role: '차량·함선 강화. 무기·장갑 연구.', flavor: '녹은 쇳물이 다시 장갑판이 된다.' },
    airfield:    { role: '함선 생산. 버저·카고·터그·하푼·레비아탄.', flavor: '활주로는 짧고, 배짱은 길다.' },
    tower:       { role: '발진 갑판 부속. 상위 함선 해금.', flavor: '깜빡이는 불빛 하나로 선단을 부른다.' },
    labs:        { role: '고급 기술. 견인 빔 연구, 강화 2·3단계 해금.', flavor: '뜯어 보면 무엇이든 배울 수 있다.' },
    intel:       { role: '해체 연구소 부속. 스포터 해금·기술 연구.', flavor: '거울 조각을 이어 몸을 감춘다.' },
    gravlab:     { role: '해체 연구소 부속. 수리 드론 연구, 레비아탄 해금.', flavor: '배의 등뼈를 다시 세우는 곳.' },
    // 마이셀
    nest:        { role: '본진. 유충으로 모든 유닛을 키운다.', flavor: '군락의 심장, 균사망의 매듭.' },
    grandnest:   { role: '균핵 변태. 블로터 연구, 중반 기술 해금.', flavor: '매듭이 굵어지면 갓이 더 높이 선다.' },
    apexnest:    { role: '대균핵 변태. 후반 기술 해금.', flavor: '군락이 다 자랐다.' },
    siphon:      { role: '가스 채취. 분출구 위에 뿌리내린다.', flavor: '분출구에 뿌리를 꽂고 들이마신다.' },
    vat:         { role: '첫 기술. 스키터 해금·속도 연구.', flavor: '첫 포자가 싹트는 밭.' },
    mutapit:     { role: '지상 강화. 공격·갑피 연구.', flavor: '더 단단한 몸이 자라는 굴.' },
    tendril:     { role: '균사층 확장. 변태해 방어 시설이 된다.', flavor: '균사가 땅을 덮어 길을 낸다.' },
    spineroot:   { role: '지상 방어. 지상 적을 찌른다.', flavor: '밟으면 찔린다.' },
    puffer:      { role: '대공 방어·탐지.', flavor: '하늘을 향해 포자를 뿜는다.' },
    wyrmpit:     { role: '스파인웜 해금. 사거리 연구, 트렌처 해금.', flavor: '굴 안은 가시투성이다.' },
    roost:       { role: '비행 유닛 해금. 비행 공격·갑피 연구.', flavor: '포자가 날개를 얻는 둥지.' },
    greatroost:  { role: '비행 둥지 변태. 시즈모·애시드윙 해금.', flavor: '둥지가 터질 듯 부풀었다.' },
    matronden:   { role: '매트런 해금. 균사 장판 연구.', flavor: '어머니 갓이 쉬는 둥지.' },
    blightmound: { role: '블라이터 해금. 부패 포자 연구.', flavor: '썩은 것이 쌓여 언덕이 된다.' },
    behemothcave:{ role: '베히모스 해금.', flavor: '오래된 뿌리가 굴 깊이 잠들어 있다.' },
    // 코러스
    sanctum:     { role: '본진. 튜너 생산, 레이 라인 기둥.', flavor: '합창이 처음 울린 자리.' },
    resonator:   { role: '보급·레이 라인 기둥. 건물이 설 선을 긋는다.', flavor: '기둥 사이에 빛의 현이 걸린다.' },
    distiller:   { role: '가스 채취. 분출구 위에 세운다.', flavor: '가스를 맑은 음으로 거른다.' },
    portal:      { role: '지상 생산. 오스블레이드·아크워커·캔터·뮤트.', flavor: '목소리가 형체를 얻는 관문.' },
    anvil:       { role: '지상 강화. 무기·갑옷·결정막 연구.', flavor: '결정을 갈아 날을 세운다.' },
    wardspire:   { role: '방어 시설·탐지. 지상·공중을 쏜다.', flavor: '높은 음 하나가 침입자를 꿰뚫는다.' },
    synapse:     { role: '중반 기술. 공중 강화·아크워커 사거리 연구.', flavor: '여러 음을 하나의 화음으로 묶는다.' },
    constructbay:{ role: '구조체 생산. 크루시블·스키프·리스너.', flavor: '결정을 부어 몸을 빚는다.' },
    assemblybay: { role: '크루시블 해금.', flavor: '주조된 몸에 마지막 결을 새긴다.' },
    lookout:     { role: '리스너 해금. 시야·음파 역류 연구.', flavor: '먼 곳의 떨림을 듣는다.' },
    skygate:     { role: '비행 생산. 센티넬·스키머·앤섬·컨덕터.', flavor: '하늘로 열린 관문.' },
    fleetspire:  { role: '앤섬 해금.', flavor: '가장 높은 음을 위한 첨탑.' },
    citadel:     { role: '오스블레이드 속도 연구, 캔터 회당 해금.', flavor: '음계를 쌓아 올린 성채.' },
    sagelibrary: { role: '캔터·뮤트 해금. 공명 파쇄 연구.', flavor: '모든 노래가 적혀 있는 곳.' },
    wardencourt: { role: '컨덕터 해금. 프리즘 장막 연구.', flavor: '지휘자가 박자를 고르는 곳.' },
  };

  // 능력 한 줄 설명 — 명령 카드 툴팁(ui.js)과 도감이 함께 쓴다
  const SPELL_DESC = {
    heal: '아군 생체 유닛 체력 회복', smoke: '연막 구역 안 아군을 감춘다', optcloak: '켜 두는 동안 은신',
    mark: '적 하나가 받는 피해 +25%', discharge: '범위 적 마나·결정막 −100', seeker: '시커 2기를 잠시 띄운다',
    cleanse: '아군 하나의 해로운 상태 해제', tow: '적 하나를 잠시 묶는다', scan: '먼 곳을 밝히고 숨은 적 탐지',
    junkdrop: '잠시 뒤 범위에 큰 피해(아군 포함)', spores: '스폰링 3기를 뿌린다', mat: '장판 위 아군 회복, 적 감속',
    rot: '구역 안 적에게 지속 피해', sprout: '허스크 1기를 일으킨다', mindstorm: '범위 지속 피해',
    amplify: '주변 아군 이동 속도 ×1.5', stasis: '구역 안 모두 정지(피아 무관)', crystallize: '적 하나의 공격을 잠시 봉쇄',
    probe: '먼 곳을 밝히고 숨은 적 탐지', prism: '켜 두는 동안 주변 아군 은신', chorus: '구역 안 아군 결정막 +120',
    echo: '적 마나를 모두 빼앗아 주변 아군에게 나눈다', repairdrones: '구역 안 아군 기계·함선을 8초간 수리',
  };

  // ---- 수치 표기(데이터 → 글자) ----
  const TICK = 20, TILE = 32;
  const sec = t => Number((t / TICK).toFixed(1));
  const tiles = px => Number((px / TILE).toFixed(1));
  const DMG_T = { normal: '일반', concussive: '진동', explosive: '폭발' };
  const SIZE_T = { small: '소형', medium: '중형', large: '대형' };

  // ======== 화면 ========
  // Hallmark · component: codex screen (main-menu 도감) · genre: technical · theme: custom 야간 작전 단말기(기존 토큰만 — 새 색 없음)
  // states: default · hover · focus · active · selected(탭) · disabled(없음) · loading(종족 첫 채움, 동기) · ping(테크 이동)
  const CSS = `
.menu[data-scr="codex"] .menu-scan { background: repeating-linear-gradient(to bottom, var(--scan) 0 1px, transparent 1px 3px), var(--menu-veil); }
.scr-codex { display: grid; align-content: start; gap: var(--space-4); padding: var(--space-4) var(--space-8) var(--space-8); }
.cx-top { align-items: end; }
.cx-tabs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); min-width: 0; }
.cx-tab { --frame: var(--frame-neutral); position: relative; isolation: isolate; display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-rows: auto auto; column-gap: var(--space-2); align-items: center;
  min-height: 72px; min-width: 0; padding: 0 var(--space-2); font: inherit; color: var(--color-ink-2); background: transparent; cursor: pointer; text-align: left; }
.cx-tab canvas { grid-row: 1 / 3; image-rendering: pixelated; width: 40px; height: 40px; opacity: 0.55; transition: opacity var(--dur-fast) var(--ease-out); }
.cx-tab-n { font-family: var(--font-display); font-weight: 700; font-size: var(--text-lg); line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cx-tab-s { font-size: var(--text-xs); color: var(--color-ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cx-tab::before { content: ""; position: absolute; inset: -6px; z-index: -1; pointer-events: none; opacity: 0; transition: opacity var(--dur-fast) var(--ease-out);
  background: repeating-linear-gradient(to bottom, transparent 0 2px, var(--scan) 2px 3px), radial-gradient(ellipse at 30% 50%, color-mix(in oklch, var(--wash) 34%, transparent), transparent 75%); }
.cx-tab:hover { color: var(--color-ink); }
.cx-tab:hover canvas, .cx-tab[aria-selected="true"] canvas { opacity: 1; }
.cx-tab:hover::before { opacity: 0.5; }
.cx-tab:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
.cx-tab:active { transform: translateY(1px); }
.cx-tab[aria-selected="true"] { --frame: var(--race-frame); color: var(--color-ink); }
.cx-tab[aria-selected="true"]::before { opacity: 1; }
.cx-tab[aria-selected="true"] .cx-tab-n { color: var(--wash); }
[data-race="legion"] { --wash: var(--race-legion); --race-frame: var(--frame-legion); }
[data-race="swarm"] { --wash: var(--race-swarm); --race-frame: var(--frame-swarm); }
[data-race="elysian"] { --wash: var(--race-elysian); --race-frame: var(--frame-elysian); }
.cx-race { display: grid; gap: var(--space-6); min-width: 0; }
.cx-race:not([hidden]) { animation: cx-in 220ms var(--ease-out); }
@keyframes cx-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
/* 종족 개요: 무대(대표 유닛) | 설정·플레이 감각 | 상징 메커니즘 */
.cx-over { --frame: var(--race-frame); position: relative; isolation: isolate; display: grid; grid-template-columns: auto minmax(0, 1.1fr) minmax(0, 1fr); gap: var(--space-4) var(--space-8); align-items: start; padding: var(--space-4) var(--space-6) var(--space-6); min-width: 0; }
.cx-over::before { content: ""; position: absolute; inset: -6px; z-index: -1; pointer-events: none;
  background: repeating-linear-gradient(to bottom, transparent 0 2px, var(--scan) 2px 3px), radial-gradient(ellipse at 10% 60%, color-mix(in oklch, var(--wash) 30%, transparent), transparent 60%); }
.cx-hero { display: grid; place-items: end center; min-width: 168px; min-height: 160px; align-self: center; }
.cx-hero canvas { image-rendering: pixelated; display: block; max-width: 100%; height: auto; }
.cx-name-big { margin: 0; font-family: var(--font-display); font-weight: 700; font-size: clamp(32px, 4vw, 52px); line-height: 1; color: var(--wash); overflow-wrap: anywhere; }
.cx-tagline { margin: var(--space-2) 0 var(--space-3); font-family: var(--font-display); font-weight: 500; font-size: var(--text-sm); letter-spacing: 0.16em; color: var(--color-ink-2); }
.cx-over p { max-width: 62ch; }
.cx-intro { margin: 0; font-size: var(--text-md); line-height: 1.65; color: var(--color-ink); }
.cx-k { margin: var(--space-4) 0 var(--space-1); font-family: var(--font-num); font-weight: 500; font-size: var(--text-xs); letter-spacing: 0.14em; color: var(--wash); }
.cx-style { margin: 0; padding: 0; list-style: none; display: grid; gap: var(--space-1); font-size: var(--text-sm); line-height: 1.5; color: var(--color-ink-2); }
.cx-style li { position: relative; padding-left: var(--space-4); }
.cx-style li::before { content: ""; position: absolute; left: 2px; top: 0.6em; width: 6px; height: 6px; background: var(--wash); }
.cx-mech { margin: 0; padding: 0; list-style: none; display: grid; gap: var(--space-3); }
.cx-mech li { display: grid; gap: var(--space-1); padding: var(--space-2) 0 var(--space-2) var(--space-4); box-shadow: inset 3px 0 0 0 var(--wash); }
.cx-mech b { font-family: var(--font-display); font-weight: 700; font-size: var(--text-lg); color: var(--color-ink); }
.cx-mech p { margin: 0; font-size: var(--text-sm); line-height: 1.6; color: var(--color-ink-2); }
.cx-mech .cx-facts { font-family: var(--font-num); font-size: var(--text-sm); font-weight: 500; color: var(--color-accent); line-height: 1.5; }
/* 목록 머리 */
.cx-h { margin: 0 0 var(--space-3); display: flex; align-items: center; gap: var(--space-3); font-family: var(--font-display); font-weight: 700; font-size: var(--text-xl); }
.cx-h .num { font-size: var(--text-sm); color: var(--color-ink-3); }
.cx-h::after { content: ""; flex: 1; height: 2px; background: repeating-linear-gradient(90deg, var(--color-line) 0 4px, transparent 4px 8px); }
.cx-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); gap: var(--space-3); }
/* 카드 */
.cx-card { --frame: var(--frame-neutral); position: relative; isolation: isolate; display: grid; align-content: start; gap: var(--space-2); min-width: 0; padding: var(--space-2) var(--space-3) var(--space-3); outline: none; scroll-margin: var(--space-12); }
.cx-card:hover, .cx-card:focus-visible, .cx-card:focus-within { --frame: var(--race-frame); }
.cx-card:focus-visible { box-shadow: 0 0 0 2px var(--color-focus); }
.cx-card.is-ping { --frame: var(--frame-accent); box-shadow: 0 0 0 2px var(--color-accent); animation: cx-ping 520ms var(--ease-out) 2; }
@keyframes cx-ping { 0% { box-shadow: 0 0 0 2px var(--color-accent), 0 0 0 2px color-mix(in oklch, var(--color-accent) 70%, transparent); } 100% { box-shadow: 0 0 0 2px var(--color-accent), 0 0 0 14px transparent; } }
.cx-stage { position: relative; display: grid; place-items: end center; height: 148px; margin: 0 calc(var(--space-1) * -1); overflow: hidden;
  background: repeating-linear-gradient(to bottom, transparent 0 2px, var(--scan) 2px 3px), radial-gradient(ellipse at 50% 85%, color-mix(in oklch, var(--wash) 26%, transparent), transparent 70%), var(--color-fog);
  box-shadow: inset 0 -2px 0 0 color-mix(in oklch, var(--wash) 45%, transparent); }
.cx-stage[data-air] { place-items: center; }
.cx-stage canvas { image-rendering: pixelated; display: block; max-width: 100%; max-height: 100%; object-fit: contain; }
.cx-stage[data-air] canvas { animation: cx-hover 2.4s var(--ease-in-out) infinite alternate; }
@keyframes cx-hover { from { transform: translateY(-3px); } to { transform: translateY(3px); } }
.cx-badge { position: absolute; left: var(--space-1); top: var(--space-1); padding: 0 var(--space-1); font-family: var(--font-num); font-size: 10px; line-height: 16px; letter-spacing: 0.08em; color: var(--color-ink-2); background: var(--color-scrim); }
.cx-card h4 { margin: var(--space-1) 0 0; font-family: var(--font-display); font-weight: 700; font-size: var(--text-lg); line-height: 1.2; overflow-wrap: anywhere; }
.cx-tags { margin: 0; display: flex; flex-wrap: wrap; gap: var(--space-1); }
.cx-tags span { padding: 0 6px; font-size: var(--text-xs); line-height: 20px; color: var(--color-ink-2); box-shadow: inset 0 0 0 1px var(--color-line); white-space: nowrap; }
.cx-role { margin: 0; font-size: var(--text-sm); line-height: 1.55; color: var(--color-ink); }
.cx-flav { margin: 0; font-size: var(--text-xs); line-height: 1.5; color: var(--color-ink-3); }
.cx-stats { margin: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2px var(--space-3); font-size: var(--text-xs); }
.cx-stats dt { color: var(--color-ink-3); white-space: nowrap; }
.cx-stats dd { margin: 0; color: var(--color-ink); min-width: 0; overflow-wrap: anywhere; }
.cx-stats .num, .cx-cost .num, .cx-sp-m .num { font-family: var(--font-num); }
.cx-hp { color: var(--color-hp); } .cx-sh { color: var(--color-shield); }
.cx-cost { margin: 0; display: flex; flex-wrap: wrap; gap: var(--space-1) var(--space-3); padding-top: var(--space-2); font-size: var(--text-xs); color: var(--color-ink-2); box-shadow: inset 0 1px 0 0 color-mix(in oklch, var(--color-line) 60%, transparent); }
.cx-cost .g { color: var(--crystal); } .cx-cost .g.gas { color: var(--color-gas); } .cx-cost .g.sup { color: var(--color-ink-2); }
.cx-links { margin: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: var(--space-1) var(--space-2); align-items: baseline; font-size: var(--text-xs); }
.cx-links dt { color: var(--color-ink-3); white-space: nowrap; }
.cx-links dd { margin: 0; display: flex; flex-wrap: wrap; gap: var(--space-1); min-width: 0; }
.cx-jump { min-height: 24px; padding: 0 var(--space-2); display: inline-flex; align-items: center; gap: 4px; font: inherit; font-family: var(--font-display); font-weight: 500; font-size: var(--text-xs); color: var(--color-accent);
  background: transparent; border: 0; cursor: pointer; box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--color-accent) 50%, transparent); white-space: nowrap; transition: background-color var(--dur-fast) var(--ease-out); }
.cx-jump::after { content: "→"; font-family: var(--font-num); }
.cx-jump:hover { background: color-mix(in oklch, var(--color-accent) 16%, transparent); color: var(--color-focus); }
.cx-jump:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 1px; }
.cx-jump:active { transform: translateY(1px); }
.cx-plain { color: var(--color-ink-2); white-space: nowrap; }
.cx-plain.is-wrap { white-space: normal; }
.cx-spells { margin: 0; padding: 0; list-style: none; display: grid; gap: var(--space-2); }
.cx-spells li { display: grid; grid-template-columns: 32px minmax(0, 1fr); gap: 2px var(--space-2); align-items: start; padding: var(--space-2); background: color-mix(in oklch, var(--color-paper) 70%, transparent); box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--color-mana) 35%, transparent); }
.cx-spells canvas { grid-row: 1 / span 4; image-rendering: pixelated; width: 32px; height: 32px; }
.cx-spells li > :not(canvas) { grid-column: 2; min-width: 0; }
.cx-sp-n { font-family: var(--font-display); font-weight: 700; font-size: var(--text-sm); color: var(--color-ink); }
.cx-sp-m { display: flex; flex-wrap: wrap; gap: 0 var(--space-2); font-size: var(--text-xs); color: var(--color-ink-3); }
.cx-sp-m .mana { color: var(--color-mana); }
.cx-sp-d { margin: 0; font-size: var(--text-xs); line-height: 1.5; color: var(--color-ink-2); }
.cx-sp-r { margin: 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1); font-size: var(--text-xs); color: var(--color-ink-3); }
.cx-foot { margin: 0; }
@media (max-width: 1099px) {
  .cx-over { grid-template-columns: auto minmax(0, 1fr); }
  .cx-over .cx-mechs { grid-column: 1 / -1; }
}
@media (max-width: 767px) {
  .scr-codex { padding: var(--space-3) var(--space-4) var(--space-6); }
  .cx-top .setup-head { gap: var(--space-3); }
  .cx-tabs { width: 100%; gap: var(--space-1); }
  .cx-tab { grid-template-columns: minmax(0, 1fr); justify-items: center; text-align: center; min-height: 64px; padding: 0; }
  .cx-tab canvas { grid-row: auto; width: 32px; height: 32px; }
  .cx-tab-n { font-size: var(--text-sm); max-width: 100%; }
  .cx-tab-s { display: none; }
  .cx-over { grid-template-columns: minmax(0, 1fr); padding: var(--space-3) var(--space-3) var(--space-4); }
  .cx-hero { min-height: 120px; }
}
`;

  function mount(root, { D, R, A, RM }) {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
    const RACES = Object.keys(D.races);
    const HERO = { legion: 'bastion', swarm: 'behemoth', elysian: 'arcwalker' }; // 종족 무대(메뉴 연출과 같은 대표 유닛)
    const nameOf = id => (D.units[id] || D.buildings[id] || D.upgrades[id] || { name: id }).name;

    // ---- 뼈대 ----
    root.innerHTML = '';
    const top = el('header', 'setup-top cx-top'), head = el('div', 'setup-head');
    const back = el('button', 'btn back'); back.type = 'button'; back.id = 'codex-back';
    back.innerHTML = '<span aria-hidden="true">◀</span> 뒤로 <span class="kbd">Esc</span>';
    const h2 = el('h2', 'setup-title'); h2.id = 'codex-title'; h2.innerHTML = '도감<small>종족 · 유닛 · 건물</small>';
    head.append(back, h2);
    const tabs = el('div', 'cx-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', '종족');
    const panel = el('div', 'cx-panel'); panel.id = 'cx-panel'; panel.setAttribute('role', 'tabpanel'); panel.tabIndex = -1;
    const tabEls = {}, raceEls = {};
    for (const r of RACES) {
      const t = el('button', 'cx-tab pframe'); t.type = 'button'; t.id = 'cx-tab-' + r; t.dataset.race = r;
      t.setAttribute('role', 'tab'); t.setAttribute('aria-controls', 'cx-panel'); t.setAttribute('aria-selected', 'false'); t.tabIndex = -1;
      const ic = R.icon(HERO[r], 0, 40); ic.setAttribute('aria-hidden', 'true');
      t.append(ic, el('span', 'cx-tab-n', D.races[r].name), el('span', 'cx-tab-s', races[r].tag));
      tabs.appendChild(t); tabEls[r] = t;
    }
    top.append(head, tabs);
    const foot = el('p', 'main-foot cx-foot');
    foot.innerHTML = '<span><b>◀ ▶</b> 종족</span><span><b>↑ ↓ ← →</b> 카드 이동</span><span><b>Enter</b> 요구 건물로 이동</span><span><b>Esc</b> 뒤로</span>';
    root.append(top, panel, foot);

    // ---- 스프라이트 ----
    // 불투명 경계 상자(여러 자세의 합집합) → 정수 배율. 건물은 작업 프레임(w0..), 유닛은 남동 대기 자세.
    function box(cvs) {
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (const cv of cvs) {
        const W = cv.width, H = cv.height, d = cv.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
      return x1 < 0 ? { x: 0, y: 0, w: 1, h: 1 } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    }
    const anim = []; // { cv, frames, b } 화면에 보이는 건물만 프레임을 돌린다
    function spriteCanvas(type, isB, maxW, maxH, kMax = 4) {
      const n = isB && typeof NW_ART !== 'undefined' ? NW_ART.def(type).frames.work || 1 : 1;
      const frames = []; for (let i = 0; i < n; i++) frames.push(R.spriteFull(type, isB ? 'w' + i : '1i0').cv);
      const b = box(frames), k = Math.max(1, Math.min(kMax, Math.floor(Math.min(maxW / b.w, maxH / b.h))));
      const cv = document.createElement('canvas'); cv.width = b.w; cv.height = b.h; cv.style.width = b.w * k + 'px';
      cv.setAttribute('aria-hidden', 'true');
      const x = cv.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(frames[0], b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
      if (n > 1) anim.push({ cv, frames, b, on: false });
      return cv;
    }
    let animT = 0, animI = 0;
    const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => { for (const e of es) { const a = anim.find(q => q.cv === e.target); if (a) a.on = e.isIntersecting; } }) : null;
    function tickAnim() {
      if (root.hidden || RM.matches) { clearInterval(animT); animT = 0; return; }
      animI++;
      for (const a of anim) if (a.on) { const x = a.cv.getContext('2d'); x.clearRect(0, 0, a.b.w, a.b.h); x.drawImage(a.frames[animI % a.frames.length], a.b.x, a.b.y, a.b.w, a.b.h, 0, 0, a.b.w, a.b.h); }
    }
    const startAnim = () => { if (!animT && !RM.matches) animT = setInterval(tickAnim, 250); };

    // ---- 수치 줄 ----
    function weaponText(w) {
      const tgt = w.air ? (w.ground === false ? '공중' : '지상·공중') : '지상';
      let s = tgt + ' <span class="num">' + w.dmg + '</span> ' + DMG_T[w.type];
      if (w.splash) s += ' · 범위';
      if (w.bounce) s += ' · 튕김 ' + w.bounce;
      if (w.suicide) s += ' · 자폭';
      s += ' · ' + (w.range <= 16 ? '근접' : '사거리 <span class="num">' + tiles(w.range) + '</span>');
      if (!w.suicide) s += ' · <span class="num">' + sec(w.cooldown) + '</span>초';
      return s;
    }
    const row = (dl, k, html) => { dl.append(el('dt', null, k)); const d = el('dd'); d.innerHTML = html; dl.append(d); };
    function costLine(cost, supply, time, count) {
      const p = el('p', 'cx-cost');
      let h = '<span><span class="g" aria-hidden="true">◆</span> 크리스탈 <span class="num">' + (cost.crystal || 0) + '</span></span>';
      if (cost.nebula) h += '<span><span class="g gas" aria-hidden="true">●</span> 가스 <span class="num">' + cost.nebula + '</span></span>';
      if (supply) h += '<span><span class="g sup" aria-hidden="true">▲</span> 보급 <span class="num">' + supply * (count || 1) + '</span></span>';
      if (time) h += '<span>시간 <span class="num">' + sec(time) + '초</span></span>';
      if (count > 1) h += '<span>한 번에 <span class="num">' + count + '</span>기</span>';
      p.innerHTML = h; return p;
    }
    // 링크 줄: 같은 종족 카드로 이동(테크 점프). 카드가 없는 대상(연구 등)은 글자만.
    function jump(id) {
      const b = el('button', 'cx-jump', nameOf(id)); b.type = 'button'; b.dataset.jump = id;
      b.setAttribute('aria-label', nameOf(id) + ' 카드로 이동'); return b;
    }
    function links(card, pairs) {
      const dl = el('dl', 'cx-links'); let any = false;
      for (const [k, ids, plain, tail] of pairs) {
        if (!ids || !ids.length) continue; any = true;
        dl.append(el('dt', null, k)); const dd = el('dd'); if (k === '요구') dd.dataset.req = '';
        if (plain) dd.append(el('span', 'cx-plain is-wrap', ids.join(' · '))); else for (const id of ids) dd.append(jump(id));
        if (tail) dd.append(el('span', 'cx-plain', tail));
        dl.append(dd);
      }
      if (any) card.append(dl);
    }
    function spells(card, ids) {
      if (!ids || !ids.length) return;
      const ul = el('ul', 'cx-spells'); ul.setAttribute('aria-label', '능력');
      for (const id of ids) {
        const a = D.abilities[id], li = el('li');
        const ic = R.icon('spell@' + id, 0, 32); ic.setAttribute('aria-hidden', 'true'); li.append(ic);
        li.append(el('span', 'cx-sp-n', a.name));
        const m = el('span', 'cx-sp-m');
        m.innerHTML = (a.cost ? '<span class="mana"><span aria-hidden="true">✦</span> 마나 <span class="num">' + a.cost + '</span></span>' : '<span>마나 없음</span>')
          + (a.cooldown >= TICK ? '<span>재사용 <span class="num">' + sec(a.cooldown) + '초</span></span>' : '')
          + (a.range ? '<span>사거리 <span class="num">' + tiles(a.range) + '</span></span>' : '')
          + '<span>' + (a.target === 'unit' ? '대상 지정' : a.target === 'point' ? '지점 지정' : '즉시') + (a.toggle ? ' · 켜고 끄기' : '') + (a.autocast ? ' · 자동 시전' : '') + '</span>';
        li.append(m, el('p', 'cx-sp-d', SPELL_DESC[id]));
        if (a.requires) { const up = D.upgrades[a.requires], r = el('p', 'cx-sp-r'); r.append(el('span', null, '연구 필요 · ' + up.name), jump(up.at)); li.append(r); }
        ul.append(li);
      }
      card.append(ul);
    }

    // ---- 종족 채우기(처음 고를 때 한 번) ----
    function buildRace(r) {
      const wrap = el('div', 'cx-race'); wrap.dataset.race = r; wrap.hidden = true;
      const C = races[r];
      // 개요
      const over = el('section', 'cx-over pframe'); over.setAttribute('aria-labelledby', 'cx-name-' + r);
      const hero = el('div', 'cx-hero'); hero.append(spriteCanvas(HERO[r], false, 220, 180, 2));
      const lore = el('div');
      const nm = el('h3', 'cx-name-big', D.races[r].name); nm.id = 'cx-name-' + r;
      lore.append(nm, el('p', 'cx-tagline', C.tag), el('p', 'cx-intro', C.intro), el('p', 'cx-k', '플레이 감각'));
      const sty = el('ul', 'cx-style'); for (const t of C.style) sty.append(el('li', null, t)); lore.append(sty);
      const mechs = el('div', 'cx-mechs'); mechs.append(el('p', 'cx-k', '상징 메커니즘'));
      const ol = el('ul', 'cx-mech');
      for (const m of C.mechanics) { const li = el('li'); li.append(el('b', null, m.name), el('p', 'cx-facts', m.facts(D)), el('p', null, m.text)); ol.append(li); }
      mechs.append(ol); over.append(hero, lore, mechs); wrap.append(over);

      const trainedAt = {}; // 유닛 → 생산 건물
      for (const [bid, b] of Object.entries(D.buildings)) if (b.race === r) for (const u of b.trains || []) (trainedAt[u] = trainedAt[u] || []).push(bid);
      // 소환·함재기 출처
      const summonedBy = {};
      for (const [uid, u] of Object.entries(D.units)) if (u.race === r) {
        for (const ab of u.abilities || []) { const ef = D.abilities[ab].effect; if (ef.kind === 'summon') (summonedBy[ef.unit] = summonedBy[ef.unit] || []).push(uid); }
        if (u.launcher) (summonedBy[u.launcher.child] = summonedBy[u.launcher.child] || []).push(uid);
      }

      const lists = [['units', '유닛', D.units], ['buildings', '건물', D.buildings]];
      for (const [kind, title, src] of lists) {
        const ids = Object.keys(src).filter(id => src[id].race === r && !src[id].neutral);
        const sec_ = el('section', 'cx-sec'); sec_.setAttribute('aria-labelledby', 'cx-h-' + r + '-' + kind);
        const h = el('h3', 'cx-h'); h.id = 'cx-h-' + r + '-' + kind; h.innerHTML = title + ' <span class="num">' + ids.length + '</span>';
        const grid = el('div', 'cx-grid');
        for (const id of ids) grid.append(kind === 'units' ? unitCard(id, trainedAt, summonedBy) : bldCard(id));
        sec_.append(h, grid); wrap.append(sec_);
      }
      for (const a of anim) if (io && !a.obs) { io.observe(a.cv); a.obs = true; }
      panel.append(wrap); raceEls[r] = wrap;
      return wrap;
    }
    function cardShell(id, isB) {
      const d = isB ? D.buildings[id] : D.units[id], P = isB ? buildings[id] : units[id];
      const c = el('article', 'cx-card pframe'); c.id = 'cx-' + id; c.dataset.id = id; c.tabIndex = -1; c.setAttribute('aria-labelledby', 'cx-' + id + '-n');
      const stage = el('div', 'cx-stage'); if (!isB && d.air) stage.dataset.air = '';
      stage.append(spriteCanvas(id, isB, isB ? 200 : 180, isB ? 140 : 132), el('span', 'cx-badge', isB ? '건물' : '유닛'));
      const h = el('h4', null, d.name); h.id = 'cx-' + id + '-n';
      c.append(stage, h);
      return { c, d, P };
    }
    function tagsOf(list) { const p = el('p', 'cx-tags'); for (const t of list.filter(Boolean)) p.append(el('span', null, t)); return p; }
    function unitCard(id, trainedAt, summonedBy) {
      const { c, d, P } = cardShell(id, false);
      c.append(tagsOf([d.air ? '공중' : '지상', SIZE_T[d.size], d.worker && '일꾼', d.detector && '탐지', d.cloaked && '상시 은신', d.transport && '수송 ' + d.transport + '칸',
        d.summoned && '소환 전용', d.modes && d.modes.burrow && '휴면 가능', d.modes && d.modes.siege && '자동 정박']));
      c.append(el('p', 'cx-role', P.role), el('p', 'cx-flav', P.flavor));
      const dl = el('dl', 'cx-stats');
      row(dl, '체력', '<span class="num cx-hp">' + d.hp + '</span>' + (d.shield ? ' · 결정막 <span class="num cx-sh">' + d.shield + '</span>' : '') + ' · 방어 <span class="num">' + d.armor + '</span>');
      if (d.weapon) row(dl, d.weapon2 ? '무기 1' : '무기', weaponText(d.weapon));
      if (d.weapon2) row(dl, '무기 2', weaponText(d.weapon2));
      if (d.modes) for (const [m, md] of Object.entries(d.modes)) if (md.weapon) row(dl, m === 'siege' ? '정박 시' : '휴면 시', weaponText(md.weapon));
      if (d.launcher) { const L = d.launcher; row(dl, '함재기', D.units[L.child].name + ' 최대 <span class="num">' + L.max + '</span> · 한 기 ◆<span class="num">' + L.cost.crystal + '</span> · 사거리 <span class="num">' + tiles(L.range) + '</span>'); }
      if (d.energy) row(dl, '마나', '<span class="num">' + d.energy.max + '</span> (시작 <span class="num">' + d.energy.start + '</span>)');
      row(dl, '속도 · 시야', '<span class="num">' + d.speed + '</span> · <span class="num">' + d.sight + '</span>타일');
      if (d.provides) row(dl, '보급 제공', '<span class="num">+' + d.provides + '</span>');
      c.append(dl);
      if (!d.summoned && !(d.cost.crystal === 0 && !d.cost.nebula && d.mergeFrom)) c.append(costLine(d.cost, d.supply, d.time, d.count));
      else if (d.mergeFrom) c.append(costLine({ crystal: 0 }, d.supply, d.time, 1));
      links(c, [
        ['생산', d.morphFrom || d.mergeFrom ? null : trainedAt[id]],
        ['변태', d.morphFrom ? [d.morphFrom] : null],
        ['합체', d.mergeFrom ? [d.mergeFrom] : null, false, '× 2'],
        ['출처', summonedBy[id]],
        ['요구', (d.requires || []).filter(b => !(trainedAt[id] || []).includes(b))],
      ]);
      spells(c, d.abilities);
      return c;
    }
    function bldCard(id) {
      const { c, d, P } = cardShell(id, true);
      c.append(tagsOf([d.w + '×' + d.h + '칸', d.dropoff && '자원 받음', d.detector && '탐지', d.lift && '띄우기', d.addonOf && '부속', d.morphFrom && '변태', d.onVent && '분출구 위', d.power && '레이 라인 기둥', d.larva && '유충']));
      c.append(el('p', 'cx-role', P.role), el('p', 'cx-flav', P.flavor));
      const dl = el('dl', 'cx-stats');
      row(dl, '체력', '<span class="num cx-hp">' + d.hp + '</span>' + (d.shield ? ' · 결정막 <span class="num cx-sh">' + d.shield + '</span>' : '') + ' · 방어 <span class="num">' + d.armor + '</span>');
      if (d.weapon) row(dl, '무기', weaponText(d.weapon));
      if (d.provides) row(dl, '보급 제공', '<span class="num">+' + d.provides + '</span>');
      if (d.energy) row(dl, '마나', '<span class="num">' + d.energy.max + '</span> (시작 <span class="num">' + d.energy.start + '</span>)');
      c.append(dl, costLine(d.cost, 0, d.time, 1));
      const ups = (d.researches || []).map(u => D.upgrades[u].name + (D.upgrades[u].levels > 1 ? ' ' + D.upgrades[u].levels + '단계' : ''));
      links(c, [
        ['부속', d.addonOf ? [d.addonOf] : null],
        ['변태', d.morphFrom ? [d.morphFrom] : null],
        ['요구', d.requires],
        ['생산', d.trains],
        ['연구', ups, true],
      ]);
      spells(c, d.abilities);
      return c;
    }

    // ---- 탭 · 이동 ----
    let cur = null;
    function select(r, focusTab) {
      if (!raceEls[r]) buildRace(r);
      cur = r;
      for (const k of RACES) {
        const on = k === r; tabEls[k].setAttribute('aria-selected', String(on)); tabEls[k].tabIndex = on ? 0 : -1;
        if (raceEls[k]) raceEls[k].hidden = !on;
      }
      panel.setAttribute('aria-labelledby', 'cx-tab-' + r);
      const cards = curCards(); cards.forEach((c, i) => { c.tabIndex = i ? -1 : 0; });
      if (focusTab) tabEls[r].focus();
      startAnim();
    }
    const curCards = () => cur ? [...raceEls[cur].querySelectorAll('.cx-card')] : [];
    function focusCard(c, ping) {
      for (const o of curCards()) o.tabIndex = o === c ? 0 : -1;
      c.focus({ preventScroll: true });
      c.scrollIntoView({ block: ping ? 'center' : 'nearest', behavior: ping && !RM.matches ? 'smooth' : 'auto' });
      if (ping) { c.classList.remove('is-ping'); void c.offsetWidth; c.classList.add('is-ping'); setTimeout(() => c.classList.remove('is-ping'), 1200); }
    }
    tabs.addEventListener('click', ev => { const t = ev.target.closest('.cx-tab'); if (t && t.dataset.race !== cur) { A.play('tick', 0.6); select(t.dataset.race); } });
    tabs.addEventListener('keydown', ev => {
      const i = RACES.indexOf(cur), n = RACES.length;
      const to = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[ev.key];
      if (ev.key === 'ArrowDown') { ev.preventDefault(); const c = curCards()[0]; if (c) focusCard(c, false); return; }
      if (to === undefined) return;
      ev.preventDefault(); A.play('tick', 0.5); select(RACES[to], true);
    });
    panel.addEventListener('click', ev => {
      const b = ev.target.closest('[data-jump]'); if (!b) return;
      const c = root.querySelector('#cx-' + b.dataset.jump); if (c) { A.play('tick', 0.6); focusCard(c, true); }
    });
    panel.addEventListener('keydown', ev => {
      const c = ev.target.closest && ev.target.closest('.cx-card');
      if (!c || ev.target !== c) return;
      const L = curCards(), i = L.indexOf(c), grid = c.parentElement;
      const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
      const sib = [...grid.children], j = sib.indexOf(c);
      let n = null;
      if (ev.key === 'ArrowRight') n = L[i + 1];
      else if (ev.key === 'ArrowLeft') n = L[i - 1];
      else if (ev.key === 'ArrowDown') n = j + cols < sib.length ? sib[j + cols] : L[i + (sib.length - j)];
      else if (ev.key === 'ArrowUp') n = j - cols >= 0 ? sib[j - cols] : L[i - j - 1];
      else if (ev.key === 'Home') n = L[0];
      else if (ev.key === 'End') n = L[L.length - 1];
      else if (ev.key === 'Enter') { const b = c.querySelector('[data-req] [data-jump]') || c.querySelector('[data-jump]'); if (b) { ev.preventDefault(); b.click(); } return; }
      else return;
      ev.preventDefault();
      if (n) { A.play('tick', 0.4); focusCard(n, false); }
    });

    select(RACES[0]);
    return {
      back,
      open() { select(cur || RACES[0]); },
      focusEl() { return tabEls[cur]; },
    };
  }

  return { races, units, buildings, SPELL_DESC, mount };
})();
if (typeof module !== 'undefined') module.exports = NW_CODEX;
