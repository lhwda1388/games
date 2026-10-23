// 부적난무 — 로컬 이벤트 로그(메모리, 최근 2000건). 개발 패널에서 JSON으로 내보낸다. 서버 전송은 없다(스펙 3절 알려진 한계).
const BJ_LOG = (function bjLog() {
  const MAX = 2000;
  const create = () => ({ items: [] });
  function push(log, ev) {
    log.items.push(ev);
    if (log.items.length > MAX) log.items.splice(0, log.items.length - MAX);
  }
  return { MAX, create, push };
})();
if (typeof module !== 'undefined') module.exports = BJ_LOG;
