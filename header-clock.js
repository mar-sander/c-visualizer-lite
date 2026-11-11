/* L-UI16: PC本体のローカル時刻のみを使用。更新日はHTMLの固定値です。 */
(() => {
  'use strict';
  const clock = document.getElementById('header-clock');
  if(!clock) return;
  const desktop = window.matchMedia('(min-width: 901px)');
  let timer;

  function refresh(){
    window.clearTimeout(timer);
    if(!desktop.matches) return;
    const now = new Date();
    clock.textContent = String(now.getHours()).padStart(2, '0') + ':' +
      String(now.getMinutes()).padStart(2, '0');
    // 分境界に合わせ、遅延・日付変更・PCの時刻補正にも毎回追従します。
    timer = window.setTimeout(refresh, 60000 - (now.getSeconds() * 1000 + now.getMilliseconds()));
  }

  clock.addEventListener('click', () => {
    clock.setAttribute('aria-pressed', String(clock.getAttribute('aria-pressed') !== 'true'));
  });
  desktop.addEventListener('change', refresh);
  document.addEventListener('visibilitychange', () => {
    if(!document.hidden) refresh();
  });
  window.addEventListener('focus', refresh);
  window.addEventListener('pageshow', refresh);
  refresh();
})();
