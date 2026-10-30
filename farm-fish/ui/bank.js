  // ---------- 은행 (opened from the 바구니 tab): put coins in, take them out, interest per real day ----------
  var BANK_WHY = { coins: '코인이 모자라요', cap: '통장엔 ' + L.BANK_CAP.toLocaleString('ko-KR') + '코인까지만 맡아요', bal: '통장에 그만큼 없어요', n: '맡길 돈이 없어요' };
  // a little pixel coin stack for the rows
  var BANK_ICON = ['............', '...444444...', '..40000004..', '..44444444..', '..40000004..', '..44444444..',
    '..40000004..', '..44444444..', '..40022004..', '..44444444..', '............', '............'];
  function bankIcon() {
    var c = document.createElement('canvas'); c.width = 12; c.height = 12;
    spr(BANK_ICON, 0, 0, false, c.getContext('2d'));
    return c;
  }
  function openBank() {
    dexEl.hidden = true; shopEl.hidden = true; bagEl.hidden = true; calEl.hidden = true;
    sheetKind = 'bank'; sheetEl.hidden = false;
    var got = L.bankSettle(S, now(), TZ);
    if (got) { toast('통장에 이자가 붙었다 · +' + got.toLocaleString('ko-KR'), 3000); save(); }
    renderBank();
  }
  function bankRow(name, sub, amounts, go) {
    var r = sheetRow(bankIcon(), name, sub);
    var a = document.createElement('div'); a.className = 'acts';
    amounts.forEach(function (q) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'max b'; b.textContent = q[0];
      b.setAttribute('aria-label', name + ' ' + q[0]);
      if (!(q[1] > 0)) b.disabled = true;
      b.addEventListener('click', function () { go(q[1]); });
      a.appendChild(b);
    });
    r.appendChild(a);
  }
  function renderBank() {
    var bal = L.bankBal(S), room = L.BANK_CAP - bal, rate = Math.round(L.BANK_RATE * 100);
    sheetHead('은행');
    var say = document.createElement('p'); say.className = 'say';
    say.textContent = '은행원: 맡긴 돈엔 자정마다 ' + rate + '%씩 이자가 붙어요. 찾을 땐 언제든지요.';
    sheetEl.appendChild(say);
    var h3 = document.createElement('h3'); h3.textContent = '통장';
    var b = document.createElement('b'); b.textContent = bal.toLocaleString('ko-KR') + ' / ' + L.BANK_CAP.toLocaleString('ko-KR') + '코인'; h3.appendChild(b); sheetEl.appendChild(h3);
    var put = Math.min(S.coins, room);
    bankRow('맡기기', '지갑 ' + S.coins.toLocaleString('ko-KR') + '코인' + (room <= 0 ? ' · 통장이 꽉 찼어요' : ''),
      [['100', put >= 100 ? 100 : 0], ['1,000', put >= 1000 ? 1000 : 0], ['전부', put]], function (n) {
        var res = L.bankPut(S, n, now(), TZ);
        if (!res.ok) { toast(BANK_WHY[res.why]); renderBank(); return; }
        toast(res.n.toLocaleString('ko-KR') + '코인 맡겼다'); refresh(); save(); renderBank();
      });
    bankRow('찾기', '지금까지 이자 ' + (S.bank ? S.bank.i : 0).toLocaleString('ko-KR') + '코인 · 내일 +' + Math.min(room, Math.floor(bal * L.BANK_RATE)).toLocaleString('ko-KR'),
      [['100', bal >= 100 ? 100 : 0], ['1,000', bal >= 1000 ? 1000 : 0], ['전부', bal]], function (n) {
        var res = L.bankTake(S, n, now(), TZ);
        if (!res.ok) { toast(BANK_WHY[res.why]); renderBank(); return; }
        toast(res.n.toLocaleString('ko-KR') + '코인 찾았다'); fxCoinsDom(sheetEl.querySelector('.wallet')); refresh(); save(); renderBank();
      });
    var p = document.createElement('p'); p.className = 'note';
    p.textContent = '현실 하루(자정)마다 이자 ' + rate + '% (소수점 버림) · ' + L.BANK_CAP.toLocaleString('ko-KR') + '코인까지 · 오래 비워도 이자는 ' +
      L.BANK_CATCHUP + '일치까지만 · 통장 돈으로는 살 수 없으니 쓸 땐 찾기';
    sheetEl.appendChild(p);
  }
  // console hooks: FF.bank() → the 통장 (opens the 은행)
  function addBankHooks(FF) {
    FF.bank = function () { openBank(); return S.bank || null; };
  }
