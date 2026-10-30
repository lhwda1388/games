  // ---------- 은행: put coins away, interest every real (local) day ----------
  // Interest is credited lazily (opening the 은행, putting in, taking out): one step per local midnight passed
  // since s.bank.d, each step floor(balance × BANK_RATE), compounding. Away longer than BANK_CATCHUP days
  // still pays only BANK_CATCHUP days, so leaving the game alone is not the best plan. The balance never
  // goes over BANK_CAP (putting in stops there, and interest stops there too). A clock set back pays nothing.
  // s.bank = { c: balance, d: local day last settled, i: interest earned so far } is made on the first deposit.
  var BANK_RATE = 0.02;       // per real day
  var BANK_CAP = 300000;      // most coins the bank holds (6,000 a day at most: about a tenth of a day's play)
  var BANK_CATCHUP = 7;       // most days of interest paid at once

  function bankBal(s) { return s.bank ? s.bank.c : 0; }
  // interest for `days` steps on balance c, under the cap
  function bankGrow(c, days) {
    for (var k = 0; k < Math.min(days, BANK_CATCHUP); k++) c = Math.min(BANK_CAP, c + Math.floor(c * BANK_RATE));
    return c;
  }
  // the balance with interest up to today, without changing anything (for buttons)
  function bankPeek(s, now, tzMin) {
    if (!s.bank) return 0;
    return bankGrow(s.bank.c, toyDay(now, tzMin) - s.bank.d);
  }
  // credits interest up to today; returns the interest paid now
  function bankSettle(s, now, tzMin) {
    if (!s.bank) return 0;
    var d = toyDay(now, tzMin), c = bankGrow(s.bank.c, d - s.bank.d), got = c - s.bank.c;
    s.bank.c = c; s.bank.i += got; s.bank.d = Math.max(d, s.bank.d);   // never back: no day pays twice
    return got;
  }
  // put n coins in → { ok, n } or { ok: false, why: 'n' | 'coins' | 'cap' }
  function bankPut(s, n, now, tzMin) {
    n = Math.floor(n);
    if (!(n > 0)) return { ok: false, why: 'n' };
    if (n > s.coins) return { ok: false, why: 'coins' };
    bankSettle(s, now, tzMin);
    if (bankBal(s) + n > BANK_CAP) return { ok: false, why: 'cap' };
    if (!s.bank) s.bank = { c: 0, d: toyDay(now, tzMin), i: 0 };
    s.bank.c += n; s.coins -= n;
    return { ok: true, n: n };
  }
  // take n coins out → { ok, n } or { ok: false, why: 'n' | 'bal' }
  function bankTake(s, n, now, tzMin) {
    n = Math.floor(n);
    if (!(n > 0)) return { ok: false, why: 'n' };
    bankSettle(s, now, tzMin);
    if (n > bankBal(s)) return { ok: false, why: 'bal' };
    s.bank.c -= n; s.coins += n;
    return { ok: true, n: n };
  }
  function decodeBank(o, s) {
    var q = o.bank;
    function ok(x) { return typeof x === 'number' && isFinite(x) && x >= 0; }
    if (!q || typeof q !== 'object' || !ok(q.c) || typeof q.d !== 'number' || !isFinite(q.d)) return;
    s.bank = { c: Math.min(BANK_CAP, Math.floor(q.c)), d: Math.floor(q.d), i: ok(q.i) ? Math.floor(q.i) : 0 };
  }

  expose({
    BANK_RATE: BANK_RATE, BANK_CAP: BANK_CAP, BANK_CATCHUP: BANK_CATCHUP,
    bankBal: bankBal, bankPeek: bankPeek, bankSettle: bankSettle, bankPut: bankPut, bankTake: bankTake, decodeBank: decodeBank
  });
