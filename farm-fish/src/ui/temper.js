  // ---------- stage 8 ② 손맛: reel cues per personality, boss phase signal, 어탁 wall row helpers, FF.temper ----------
  // reduceMotion lives in ui/fx.js (stage 8 ④)
  function phaseLabel(ks) { return ks.map(function (k) { return L.TEMPER_KINDS[k]; }).join('·'); }
  // what the player should do right now (text + whether it shouts)
  function reelCue(r, held, warning, pulling) {
    if (r.fx > 0) return { text: (r.phase + 1) + '단계! ' + phaseLabel(r.kinds), loud: true };
    var ev = r.ev;
    if (warning) {
      if (ev === 'jump') return { text: '튄다! 손 떼!', loud: true };
      if (ev === 'sound') return { text: '파고든다 · 짧게 끊어 당기기', loud: false };
      if (ev === 'run') return { text: '달린다! 손 떼!', loud: true };
      return { text: '손 떼!', loud: true };
    }
    if (pulling) {
      if (ev === 'jump') return held ? { text: '줄 끊어져요!', loud: true } : { text: '튀는 중… 놓고 기다려', loud: false };
      if (ev === 'sound') return held && r.hold >= 0.35 ? { text: '너무 길어! 떼고 다시', loud: true } : { text: '톡, 톡 짧게 당기기', loud: false };
      if (ev === 'run') {
        if (r.turn > 0) return { text: '돈다! 지금 감아!', loud: true };
        return held ? { text: '줄 끊어져요!', loud: true } : { text: '달리는 중… 기다려', loud: false };
      }
      return held ? { text: '줄 끊어져요!', loud: true } : { text: '버텨…', loud: false };
    }
    return { text: held ? '' : (r.t < 2.5 ? '꾹 눌러 감기' : '감아!'), loud: false };
  }
  // reel start: a legend announces its boss fight; a fish already in the 도감 reminds how it fights
  function reelIntro(roll) {
    var f = L.fishById(roll.id), n = L.temperOf(roll.id).length;
    if (n > 1) { toast('전설의 보스전! ' + n + '단계 · 화면이 번쩍이면 싸우는 법이 바뀐다', 3000); return; }
    // 순한형 still shows its name (VOC: 갈겨니·미꾸라지 had no name while reeling)
    if (S.dex.fish[roll.id]) toast(L.temperName(roll.id) === '순한형' ? f.name : f.name + ' · ' + L.temperName(roll.id) + ' · ' + L.temperTip(roll.id), 2600);
  }
  // boss phase change: shake, splash, and a blinking frame drawn by drawReelFrame
  function bossPhaseFx() {
    fxShake(5);
    burst(reelVis.x, reelVis.y, 20, 0, 110);
  }
  function drawReelFrame(tt) {
    if (!reel || !(reel.fx > 0) || (!reduceMotion && Math.floor(tt * 8) % 2)) return;   // reduced motion: steady frame
    px(0, 0, W, 3, 4); px(0, H - 3, W, 3, 4); px(0, 0, 3, H, 4); px(W - 3, 0, 3, H, 4);
  }

  // 어탁 wall row (집 안): the top records as small prints in a 2×2 frame; never takes a furniture or decoration spot
  function drawEtakuRow(rect) {
    var recs = L.topRecords(S, L.ETAKU_N);
    px(rect[0], rect[1], rect[2], rect[3], 4);
    for (var i = 0; i < L.ETAKU_N; i++) {
      var cx = rect[0] + 1 + (i % 2) * 24, cy = rect[1] + 1 + Math.floor(i / 2) * 12, e = recs[i];
      px(cx, cy, 23, 11, e ? 0 : 1);
      if (!e) { dashRect([cx + 3, cy + 2, 17, 7], 2); continue; }
      var c = etakuCache[e.id] || (etakuCache[e.id] = fishCanvas(e.id));
      ctx.imageSmoothingEnabled = false; ctx.drawImage(c, cx + 3, cy + 1, 16, 8);
      if (i === 0) px(cx + 19, cy + 8, 3, 2, 4);   // red-seal stamp on the biggest (grey here)
    }
  }
  function etakuText() {
    var recs = L.topRecords(S, L.ETAKU_N);
    if (!recs.length) return '어탁 자리 · 큰 물고기를 낚으면 걸린다';
    return '어탁 · ' + recs.map(function (e, k) { return (k + 1) + '. ' + L.fishById(e.id).name + ' ' + e.size.toFixed(1) + 'cm'; }).join(' · ');
  }

  // console hook: FF.temper('tuna') → its personality line; FF.records() → the 어탁 list
  function addTemperHooks(FF) {
    FF.temper = function (id) { return id ? L.temperName(id) + ' · ' + L.temperTip(id) : L.FISH.map(function (f) { return f.id + ' ' + L.temperName(f.id); }); };
    FF.records = function () { return L.topRecords(S, 10); };
    // FF.hookFish('tuna', 150): skip the wait and start a reel with that fish (for trying a personality)
    FF.hookFish = function (id, size) {
      var f = L.fishById(id);
      if (!f || reel) return false;
      S.fish = { phase: 'bite', x: POND.cx, y: POND.cy, biteAt: now(), biteEnd: now() + 60e3, roll: { id: id, size: size || (f.min + f.max) / 2 } };
      doStrike();
      return L.temperName(id);
    };
  }
