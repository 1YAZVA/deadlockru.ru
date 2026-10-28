// ============ dps.js: расчёт DPS ============
'use strict';
window.DPS = (function () {
  const val = (id) => parseFloat(document.getElementById(id)?.value) || 0;

  function update() {
    let dmg = val('calc-dmg') + val('calc-add');          // урон за выстрел
    const rate = Math.max(val('calc-rate') * (1 + val('calc-ratepct') / 100), 0.05);
    const critC = Math.min(Math.max(val('calc-critc'), 0), 100) / 100;
    const critM = Math.max(val('calc-critm'), 1);

    dmg *= 1 + val('calc-dmgpct') / 100;                  // бонус % урона

    const critFactor = 1 + critC * (critM - 1);           // ожидаемый множитель
    const avg = dmg * rate * critFactor;
    const max = dmg * rate * critM;

    $('#dps-avg').textContent = avg.toFixed(1);
    $('#dps-max').textContent = max.toFixed(1);
    $('#dps-perhit').textContent = dmg.toFixed(1);
    $('#dps-persec').textContent = rate.toFixed(2) + ' /с';
    $('#dps-critf').textContent = '×' + critFactor.toFixed(2);

    const sel = $('#calc-hero');
    const h = sel?.value && (window.state?.heroes || []).find(x => x.id === sel.value);
    if (h) $('#calc-hero-name').textContent = h.name;
  }

  function init() {
    ['calc-dmg','calc-rate','calc-add','calc-dmgpct','calc-ratepct','calc-critc','calc-critm']
      .forEach(id => document.getElementById(id)?.addEventListener('input', update));
    document.getElementById('calc-hero')?.addEventListener('change', (e) => {
      const h = (window.state?.heroes || []).find(x => x.id === e.target.value);
      if (h?.stats) {
        document.getElementById('calc-dmg').value = h.stats.weaponDamage ?? '';
        document.getElementById('calc-rate').value = h.stats.fireRate ?? '';
      }
      update();
    });
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);

  return { update };
})();
