/* Снимает снапшоты всех GET-ответов API в public/data/*.json —
   это данные для версии сайта на GitHub Pages (их будет обновлять GitHub Action). */
const fs = require('fs');
const path = require('path');
const BASE = 'http://localhost:3000';
const OUT = path.join(__dirname, '..', 'public', 'data');
fs.mkdirSync(path.join(OUT, 'hero'), { recursive: true });

async function j(url) {
  const res = await fetch(BASE + url, { cache: 'no-store' });
  if (!res.ok) throw new Error(url + ' -> HTTP ' + res.status);
  return res.json();
}
async function save(name, obj) {
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj));
  console.log('saved', name, Math.round(fs.statSync(path.join(OUT, name)).size / 1024) + ' KB');
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // простые снапшоты
  await save('state.json', await j('/api/state'));
  await save('heroes.json', await j('/api/heroes'));
  await save('items.json', await j('/api/items'));
  await save('meta.json', await j('/api/meta'));
  await save('meta-history-168.json', await j('/api/meta/history?hours=168'));
  await save('meta-history-336.json', await j('/api/meta/history?hours=336'));
  await save('live.json', await j('/api/live'));
  await save('quiz.json', await j('/api/quiz'));
  await save('esports.json', await j('/api/esports'));

  // герои по одному (карточки)
  const heroes = await j('/api/heroes');
  const list = heroes.heroes || heroes; // shape guard
  const ids = Array.isArray(list) ? list.map((h) => h.id) : [];
  for (const id of ids) {
    try { await save('hero/' + id + '.json', await j('/api/hero/' + id)); }
    catch (e) { console.log('hero', id, 'FAIL', e.message); }
    await sleep(120);
  }

  // патчи: все страницы по 30
  const patches = [];
  let page = 1, total = 0;
  do {
    const d = await j('/api/patches?filter=all&page=' + page + '&pageSize=30');
    total = d.total; patches.push(...d.items); page++;
    await sleep(150);
  } while (patches.length < total && page < 100);
  await save('patches-all.json', { total: patches.length, items: patches });

  // лидерборд: полный список по регионам (Global + 5 регионов), страницы по 100
  const regions = ['Global', 'Europe', 'NAmerica', 'SAmerica', 'Asia', 'Oceania'];
  for (const region of regions) {
    const rows = []; let p = 1, t = 0;
    do {
      const d = await j('/api/leaderboard?region=' + region + '&page=' + p + '&pageSize=100');
      t = d.total; rows.push(...d.rows); p++;
      await sleep(200);
    } while (rows.length < t && p < 200);
    await save('lb-' + region + '.json', { rows, total: rows.length, pageSize: 100, regionCounts: region === 'Global' ? await regionCounts() : undefined, topHeroes: undefined, updatedAt: rows.length ? rows[0].updatedAt : null });
  }
  async function regionCounts() {
    const g = await j('/api/leaderboard?region=Global&page=1&pageSize=10');
    return g.regionCounts;
  }

  console.log('DONE');
})().catch((e) => { console.error('SNAPSHOT ERROR:', e.message); process.exit(1); });
