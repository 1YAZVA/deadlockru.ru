// ============ app.js: роутер, загрузка данных, онлайн, рендеры ============
'use strict';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const fmtNum = (n) => n == null ? '…' : Number(n).toLocaleString('ru-RU');

const APPID = 1422450; // Deadlock
const state = { heroes: [], builds: [], notes: [], items: [], meta: null };
window.state = state; // админка правит состояние через window.state

// ---------- навигация ----------
function go(tab) {
  document.querySelectorAll('main section').forEach(s => s.classList.remove('active'));
  const sec = $('#tab-' + tab);
  if (sec) sec.classList.add('active');
  document.querySelectorAll('#main-nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  location.hash = tab;
  window.scrollTo({ top: 0 });
}

$('#main-nav').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) go(b.dataset.tab); });
document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-goto]');
  if (g) { e.preventDefault(); go(g.dataset.goto); }
});
$('#go-home').addEventListener('click', () => go('home'));

// ---------- вкладка «Предметы»: вкладки категорий справа + магазин тиров ----------
const TIER_COST = { 1: 800, 2: 1600, 3: 3200, 4: 6400 }; // цена тира в соулах — как в игре

// вывески магазинов в духе игровых (FAIRFAX / CURIOSITY CATALOG / MPS)
const CAT_SHOP = {
  weapon:   { name: 'Фэйрфакс',  tag: 'артиллерия — куплено и продано' },
  spirit:   { name: 'Диковины',  tag: 'каталог № 777 — небесная алхимия и запретная лингвистика' },
  vitality: { name: 'MPS',       tag: 'мистико-фармацевтические магазины — для семей и зверей' },
};

function itemCardHTML(it) {
  const stats = Array.isArray(it.stats) ? it.stats.filter(Boolean) : [];
  return `<article class="item-card" data-id="${esc(it.id)}" tabindex="0" role="button" aria-expanded="false" title="${esc(it.name)}">
    <span class="item-icon"><img src="${esc(it.icon || '')}" alt="${esc(it.name)}" loading="lazy"></span>
    <b class="item-name">${esc(it.name)}</b>
    ${stats.length ? `<ul class="item-stats">${stats.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
  </article>`;
}

function tierSecHTML(cat, tier) {
  const list = (window.state.items || []).filter((i) => i.category === cat && Number(i.tier) === Number(tier));
  const cost = `<span class="cost"><i class="soul-dot"></i>${esc(fmtNum(TIER_COST[tier]))}</span><b>Тир ${tier}</b>`;
  if (!list.length) {
    return `<div class="tier-sec"><div class="tier-bar">${cost}</div><p class="tier-clear">Пусто — предметы добавим в этот тир позже.</p></div>`;
  }
  return `<div class="tier-sec">
    <div class="tier-bar">${cost}</div>
    <div class="items-row">${list.map(itemCardHTML).join('')}</div>
  </div>`;
}

function categoryPanelHTML(cat) {
  const shop = CAT_SHOP[cat] || { name: '', tag: '' };
  return `<div class="shop-head"><span class="shop-name">${esc(shop.name)}</span><span class="shop-tag">${esc(shop.tag)}</span></div>
    <div class="tiers-flow">${[1, 2, 3, 4].map((t) => tierSecHTML(cat, t)).join('')}</div>`;
}

function renderItems() { // перерисовка панели активной категории (вызывает и админка после правок)
  const btn = $('#items-cattabs .side-tab.active');
  const panel = $('#items-panel');
  if (!btn || !panel) return;
  panel.className = 'cat-panel open ' + btn.dataset.cat;
  panel.innerHTML = `<div class="cat-panel-box">${categoryPanelHTML(btn.dataset.cat)}</div>`;
  // нет png-иконки — показываем монограмму вместо битой картинки (файл можно добавить позже)
  panel.querySelectorAll('.item-icon img').forEach((img) => {
    img.addEventListener('error', () => {
      const name = img.closest('.item-card')?.querySelector('.item-name')?.textContent || '?';
      const mono = document.createElement('b');
      mono.className = 'item-mono';
      mono.textContent = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
      img.replaceWith(mono);
    });
  });
}
window.renderItems = renderItems;

// выбор категории во вкладках справа (панель одна на все, раскрывается влево)
function selectItemsCategory(cat) {
  const btn = document.querySelector('#items-cattabs .side-tab[data-cat="' + cat + '"]');
  if (!btn) return;
  document.querySelectorAll('#items-cattabs .side-tab').forEach((b) => {
    b.classList.toggle('active', b === btn);
    b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
  });
  renderItems();
  const panel = $('#items-panel'); // короткая вспышка при смене категории
  if (panel) { panel.classList.remove('fadein'); void panel.offsetWidth; panel.classList.add('fadein'); }
}
selectItemsCategory('weapon'); // Батя: старт с оружия — как на скрине магазина

$('#items-cattabs')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.side-tab');
  if (btn) selectItemsCategory(btn.dataset.cat);
});

// разворот характеристик предмета по клику на карточку
$('#items-panel')?.addEventListener('click', (e) => {
  if (e.target.closest('.edit-badge')) return; // ✎ — только редактирование
  const card = e.target.closest('.item-card');
  if (!card) return;
  card.classList.toggle('exp');
  card.setAttribute('aria-expanded', card.classList.contains('exp') ? 'true' : 'false');
});

// ---------- загрузка данных ----------
async function loadJSON(path) {
  try {
    const r = await fetch(path + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch (e) {
    console.warn('loadJSON failed:', path, e);
    return null;
  }
}

async function initData() {
  const [h, b, n, sn, it, mt] = await Promise.all([
    loadJSON('data/heroes.json'), loadJSON('data/builds.json'), loadJSON('data/patchnotes.json'),
    loadJSON('data/steam-news.json'), loadJSON('data/items.json'), loadJSON('data/meta.json')
  ]);
  state.heroes = h?.heroes || []; state.heroesUpdatedAt = h?.updatedAt;
  state.builds = b?.builds || [];
  state.notes = n?.notes || [];
  state.steamPosts = sn?.posts || [];
  state.steamSource = sn?.source || '';
  state.items = it?.items || [];
  state.meta = mt;
  if (!h && !b && !n) {
    // скорее всего открыто как file://
    document.body.insertAdjacentHTML('afterbegin',
      `<div style="background:var(--bad);color:#fff;padding:8px 16px;font-size:14px;text-align:center">
        Данные не загрузились: fetch не работает с file://. Откройте сайт через GitHub Pages или локальный сервер.</div>`);
  }
}

// ---------- рендеры ----------
function renderNews() {
  const box = $('#news-list');
  // свои заметки (редактируются в панели) + официальные посты Valve из data/steam-news.json
  const own = state.notes.map(n => ({ ...n, own: true }));
  const steam = (state.steamPosts || []).map(p => ({
    ...p,
    tag: /patch|update|balance/i.test(p.title) ? 'Патч Valve' : 'Официально',
    own: false
  }));
  const all = [...own, ...steam].sort((a, b) => b.date.localeCompare(a.date));
  const steamCount = steam.length;

  box.innerHTML = `
    <p class="muted" style="text-align:center;font-size:12.5px;margin-bottom:18px">
      Официальные обновления Valve (${steamCount}) — загружаются из Steam.
      Свои заметки сообщества можно добавить в режиме редактора.</p>`
    + (all.length
      ? all.map(n => `
      <article class="note" ${n.own ? `data-id="${esc(n.id)}"` : ''}>
        <div class="meta"><span class="tag">${esc(n.tag || 'новость')}</span><span>${esc(n.date)}</span></div>
        <h3 style="font-family:var(--font-display);font-size:17px;margin-bottom:4px">${esc(n.title)}</h3>
        <p class="muted" style="white-space:pre-wrap">${esc(n.text)}</p>
        ${n.url ? `<a class="note-src" href="${esc(n.url)}" target="_blank" rel="noopener">источник в Steam ↗</a>` : ''}
      </article>`).join('')
      : '<p class="muted">Новостей пока нет.</p>');

  const latest = all[0];
  const pill = $('#home-patch-pill');
  if (pill) {
    if (latest) {
      $('#pill-title').textContent = latest.title;
      $('#pill-date').textContent = latest.date;
      pill.style.display = 'flex';
    } else {
      pill.style.display = 'none';
    }
  }
}

function heroAvatar(h) {
  const letter = (h.name || '?').trim().charAt(0).toUpperCase();
  return h.avatar
    ? `<img src="${esc(h.avatar)}" alt="${esc(h.name)}" loading="lazy">`
    : esc(letter);
}

function renderHeroes() {
  $('#heroes-grid').innerHTML = state.heroes.map(h => `
    <div class="hero-card${h.profile ? ' has-profile' : ''}" data-hero="${esc(h.id)}" title="${h.profile ? 'Открыть профиль героя' : 'Открыть в DPS-калькуляторе'}">
      <span class="ava-letter" data-letter="${esc((h.name || '?').charAt(0).toUpperCase())}">${heroAvatar(h)}</span>
      <span style="min-width:0">
        <h4>${esc(h.name)}${h.profile ? ' <span class="prof-chip">профиль</span>' : ''}</h4>
        <span class="en">${esc(h.role || '')}</span>
        <span class="tags">
          ${h.tags ? String(h.tags).split(',').filter(Boolean).map(t => `<span class="tag-pill">${esc(t.trim())}</span>`).join('') : ''}
          ${h.stats ? `<span class="stat-chip">⚔ ${h.stats.weaponDamage ?? '—'}</span><span class="stat-chip">⏱ ${h.stats.fireRate ?? '—'}/с</span>` : ''}
        </span>
      </span>
    </div>`).join('') || '<p class="muted">Список пуст.</p>';

  // если иконка героя не загрузилась (CDN недоступен) — показываем букву вместо чёрного круга
  const grid = $('#heroes-grid');
  grid?.querySelectorAll('.ava-letter img').forEach(img => {
    const box = img.closest('.ava-letter');
    img.addEventListener('error', () => {
      if (box) box.textContent = box.dataset.letter || '?';
    });
  });
}

function renderBuilds() {
  $('#builds-list').innerHTML = state.builds.map(bld => {
    const hero = state.heroes.find(h => h.id === bld.hero);
    return `
    <article class="build" data-id="${esc(bld.id)}">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:4px;flex-wrap:wrap">
        <span class="tag-pill" style="color:var(--accent);border-color:rgba(200,169,106,.4)">${hero ? esc(hero.name) : esc(bld.hero || '')}</span>
        ${bld.tags ? String(bld.tags).split(',').filter(Boolean).map(t => `<span class="tag-pill">${esc(t.trim())}</span>`).join('') : ''}
      </div>
      <h3>${esc(bld.title)}</h3>
      <div class="items">${String(bld.items || '').split(',').map(i => i.trim()).filter(Boolean).map(i => `<span class="item">${esc(i)}</span>`).join('')}</div>
      <p class="muted" style="white-space:pre-wrap">${esc(bld.desc || '')}</p>
    </article>`;
  }).join('') || '<p class="muted">Сборок пока нет.</p>';
}

// ---------- онлайновый счётчик ----------
// Каскад: официальный счётчик Steam → пик за сутки из Steam Charts.
// api.steampowered.com и RSS без CORS-заголовков, поэтому пробуем прямые запросы,
// затем цепочку публичных CORS-прокси (они бесплатны и иногда недоступны — потому их несколько).
const PROXIES = [
  (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  (u) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
  (u) => 'https://api.cors.lol/?url=' + encodeURIComponent(u),
  (u) => 'https://r.jina.ai/' + u,
];
let directTried = false;
let proxyStart = 0; // ротация начала, чтобы нагрузка распределялась по прокси

async function fetchJSON(url) {
  const chain = [];
  if (!directTried) { // прямая попытка — один раз за загрузку страницы
    directTried = true;
    chain.push(url);
  }
  for (let i = 0; i < PROXIES.length; i++) {
    chain.push(PROXIES[(proxyStart + i) % PROXIES.length](url));
  }
  proxyStart++;
  for (const u of chain) {
    const c = new AbortController(); const to = setTimeout(() => c.abort(), 9000);
    try {
      const r = await fetch(u, { cache: 'no-store', signal: c.signal });
      clearTimeout(to);
      if (r.ok) return await r.json();
    } catch (_) { clearTimeout(to); }
  }
  throw new Error('live: все источники недоступны');
}

async function fetchOnlineStats() {
  // Возвращает {live, peak}: live — текущий онлайн, peak — пик за 24 ч (Steam Charts).
  // Источник №0: наш же data/live.json — его каждые 5 минут обновляет GitHub Actions
  // (свой файл → ни CORS, ни прокси; самый быстрый и надёжный путь).
  let live = null, peak = null;
  try {
    const j = await (await fetch('data/live.json?t=' + Date.now(), { cache: 'no-store' })).json();
    const fresh = Date.parse(j.updated) > Date.now() - 25 * 60e3; // старше 25 мин считаем протухшим
    if (fresh && typeof j.live === 'number') live = j.live;
    // пик из live.json берём всегда: Charts-API иногда не отвечает в браузере,
    // а в workflow мы его пишем в тот же файл
    if (fresh && typeof j.peak === 'number') peak = j.peak;
  } catch (_) {}
  // Свежий файл = источник истины, внешние запросы не нужны (грузятся до 30 с)
  if (live != null) return { live, peak };

  // Далее параллельные внешние источники — на случай, если Actions ещё не начал работать.
  const jobStore = fetchText(`https://store.steampowered.com/charts/mostplayed`);
  const jobExact = fetchJSON(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${APPID}`);
  const jobSpy = fetchJSON(`https://steamspy.com/api.php?request=appdetails&appid=${APPID}`);
  const jobCharts = fetchJSON('https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/');
  const [store, steam, spy, charts] = await Promise.allSettled([jobStore, jobExact, jobSpy, jobCharts]);

  if (live == null && store.status === 'fulfilled' && store.value) {
    const m = store.value.match(/1422450[\s\S]{0,200}?nConcurrentInGame\\?":(\d+)/);
    if (m) live = parseInt(m[1], 10);
  }
  if (live == null && steam.status === 'fulfilled') {
    const c = steam.value?.response?.player_count;
    if (typeof c === 'number') live = c;
  }
  if (live == null && spy.status === 'fulfilled') {
    const ccu = spy.value?.ccu;
    if (typeof ccu === 'number' && ccu > 0) live = ccu;
  }
  if (charts.status === 'fulfilled') {
    const row = charts.value?.response?.ranks?.find((x) => x.appid === APPID);
    if (row?.peak_in_game) peak = row.peak_in_game;
  }
  if (live == null && peak == null) return null;
  return { live, peak };
}

function drawSpark() {
  const cv = $('#spark'); if (!cv) return;
  const hist = JSON.parse(localStorage.getItem('dl_online_hist') || '[]');
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (hist.length < 2) return;
  const vals = hist.map(x => x.c), min = Math.min(...vals), max = Math.max(...vals), span = (max - min) || 1;
  ctx.beginPath();
  hist.forEach((p, i) => {
    const x = (i / (hist.length - 1)) * cv.width;
    const y = cv.height - 4 - ((p.c - min) / span) * (cv.height - 8);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
  ctx.strokeStyle = '#2fd8a0'; ctx.lineWidth = 2; ctx.stroke();
}

let sparkTimer = null;
async function refreshOnline() {
  // Онлайн показываем ТОЛЬКО в шапке (`.online-widget`, правый верхний угол).
  // Главную страницу не загружали лишними блоками; если элементы home-— не найдены, пропускаем.
  const res = await fetchOnlineStats();
  const live = $('#online-count'), homeLive = $('#home-online'), homePeak = $('#home-peak');
  const note = $('#home-online-note');
  if (res?.live != null) {
    // есть настоящий live-онлайн
    [live, homeLive].forEach((el) => { if (el) el.textContent = fmtNum(res.live); });
    if (homeLive) homeLive.style.color = 'var(--vitality)';
    if (note) note.textContent = 'играют прямо сейчас';
    const w = $('.online-widget'); if (w) w.title = 'Одновременно играющих в Steam';
    if (homePeak && res.peak != null) { homePeak.textContent = 'Пик за 24 ч: ' + fmtNum(res.peak); homePeak.style.display = ''; }
  } else if (res?.peak != null) {
    // Steam пока не отдаёт live (Valve закрыл статистику) — показываем пик с честной пометкой
    [live, homeLive].forEach((el) => { if (el) el.textContent = '★ ' + fmtNum(res.peak); });
    if (homeLive) homeLive.style.color = 'var(--accent2)';
    if (note) note.textContent = 'пик онлайна за 24 ч · точный «сейчас» Steam пока не отдаёт';
    const w = $('.online-widget'); if (w) w.title = 'Пик одновременного онлайна за 24 ч (Steam Charts). Текущий онлайн Valve пока не публикует для этой игры.';
    if (homePeak) { homePeak.style.display = 'none'; }
  } else {
    // внешние запросы не удались: показываем последнее известное значение
    const last = JSON.parse(localStorage.getItem('dl_online_last') || 'null');
    if (last) {
      const mins = Math.round((Date.now() - last.t) / 60000);
      const label = `≈ ${fmtNum(last.value)} (${mins === 0 ? '<1' : mins} мин назад)`;
      [live, homeLive].forEach((el) => { if (el) el.textContent = label; });
      if (note) note.textContent = 'внешние запросы недоступны — показано последнее значение';
    } else {
      [live, homeLive].forEach((el) => { if (el) el.textContent = 'н/д'; });
    }
  }
  if (res) {
    localStorage.setItem('dl_online_last', JSON.stringify({ t: Date.now(), value: res.live ?? res.peak, kind: res.live != null ? 'live' : 'peak' }));
    const hist = JSON.parse(localStorage.getItem('dl_online_hist') || '[]');
    const now = Date.now();
    if (!hist.length || now - hist[hist.length - 1].t > 55e3) hist.push({ t: now, c: res.live ?? res.peak });
    while (hist.length > 48) hist.shift();
    localStorage.setItem('dl_online_hist', JSON.stringify(hist));
  }
  drawSpark();
}
function startOnlineLoop() { refreshOnline(); clearInterval(sparkTimer); sparkTimer = setInterval(refreshOnline, 60e3); }

// fetchText — как fetchJSON, но для больших текстов (HTML-страницы Steam Store)
async function fetchText(url) {
  const chain = [];
  if (!directTried) { directTried = true; chain.push(url); }
  for (let i = 0; i < PROXIES.length; i++) chain.push(PROXIES[(proxyStart + i) % PROXIES.length](url));
  proxyStart++;
  for (const u of chain) {
    const ac = new AbortController(); const to = setTimeout(() => ac.abort(), 15000);
    try {
      const r = await fetch(u, { cache: 'no-store', signal: ac.signal });
      clearTimeout(to);
      if (r.ok) return await r.text();
    } catch (_) { clearTimeout(to); }
  }
  throw new Error('text: все источники недоступны');
}

// ---------- RSS официальных новостей ----------
async function loadSteamNews() {
  const box = $('#rss-list');
  const rss = `https://store.steampowered.com/feeds/news/app/${APPID}/`;
  const urls = [PROXIES[0](rss), PROXIES[1](rss), PROXIES[2](rss), rss];
  for (const u of urls) {
    let to = null;
    try {
      const ac = new AbortController();
      to = setTimeout(() => ac.abort(), 9000);
      const r = await fetch(u, { cache: 'no-store', signal: ac.signal });
      if (!r.ok) continue;
      const xml = new DOMParser().parseFromString(await r.text(), 'text/xml');
      const items = [...xml.querySelectorAll('item')].slice(0, 6);
      if (!items.length) continue;
      box.innerHTML = items.map((it) => {
        const t = it.querySelector('title')?.textContent || 'Без названия';
        const l = it.querySelector('link')?.textContent || '#';
        const d = it.querySelector('pubDate')?.textContent || '';
        return `<div class="rss-item"><a href="${esc(l)}" target="_blank" rel="noopener">${esc(t)}</a> <span style="float:right">${esc(d.slice(0, 16))}</span></div>`;
      }).join('');
      return;
    } catch (_) { if (to) clearTimeout(to); /* следующий источник */ }
    finally { if (to) clearTimeout(to); }
  }
  box.innerHTML = '<span class="muted">Не удалось загрузить RSS (CORS). Прямая ссылка: <a href="https://store.steampowered.com/news/app/1422450" target="_blank" rel="noopener">steamcommunity/news</a></span>';
}

// ---------- мета героев: два раздела — общий винрейт и Этернус ----------
const META_TIERS = [
  { key: 'S+', name: 'S+', color: '#ffd766' },
  { key: 'S', name: 'S', color: '#ff9d66' },
  { key: 'A', name: 'A', color: '#e8652a' },
  { key: 'B', name: 'B', color: '#33b573' },
  { key: 'C', name: 'C', color: '#4a7fe8' },
  { key: 'D', name: 'D', color: '#7a5fb8' },
];

function metaWrClass(wr) {
  if (wr >= 53) return 'wr-up';
  if (wr >= 48) return 'wr-mid';
  return 'wr-down';
}

// percentile-тиры как на tracklock: S+ 5%, S 10%, A 25%, B 50%, C 70%, остальные D
function metaTierMap(entries) {
  const sorted = entries.slice().sort((a, b) => b.wr - a.wr);
  const total = sorted.length || 1;
  const cuts = [0.05, 0.10, 0.25, 0.50, 0.70].map((p) => Math.floor(total * p));
  const out = new Map();
  sorted.forEach((e, i) => {
    let tier = 'D';
    if (i < cuts[0]) tier = 'S+';
    else if (i < cuts[1]) tier = 'S';
    else if (i < cuts[2]) tier = 'A';
    else if (i < cuts[3]) tier = 'B';
    else if (i < cuts[4]) tier = 'C';
    out.set(e.id, tier);
  });
  return out;
}

function metaCardHTML(h, wr) {
  const pct = typeof wr === 'number' ? wr.toFixed(1).replace('.', ',') + '%' : '—';
  return `<div class="meta-card" data-hero="${esc(h.id)}" title="Открыть профиль героя">
    ${h.avatar ? `<img src="${esc(h.avatar)}" alt="" loading="lazy">` : `<span class="ava-mono">${esc((h.name || '?').charAt(0))}</span>`}
    <span class="mc-t"><b>${esc(h.name)}</b><span class="wr ${metaWrClass(typeof wr === 'number' ? wr : 0)}">${pct}</span></span>
  </div>`;
}

function metaSectionHTML(title, subtitle, entries, note) {
  if (!entries.length) {
    return `<div class="meta-sec">
      <h3 class="meta-sec-title">${esc(title)} <small>${esc(subtitle)}</small></h3>
      <p class="muted meta-empty">Нет данных за выбранный период.</p>
    </div>`;
  }
  const tiers = metaTierMap(entries);
  const bands = META_TIERS.map((t) => {
    const inTier = entries.filter((e) => tiers.get(e.id) === t.key).sort((a, b) => b.wr - a.wr);
    if (!inTier.length) return '';
    return `<div class="tier-band">
      <div class="tier-badge t-${t.key === 'S+' ? 'S' : t.key}">${t.name}<small>${inTier.length} гер.</small></div>
      <div class="tier-heroes">${inTier.map((e) => metaCardHTML(e.h, e.wr)).join('')}</div>
    </div>`;
  }).join('');
  return `<div class="meta-sec">
    <h3 class="meta-sec-title">${esc(title)} <small>${esc(subtitle)}</small></h3>
    ${note ? `<p class="meta-note">${esc(note)}</p>` : ''}
    ${bands}
  </div>`;
}

function renderMeta() {
  const list = $('#meta-list'), filters = $('#meta-filters'), summary = $('#meta-summary');
  if (!list) return;
  const m = state.meta;
  if (filters) filters.innerHTML = '';

  const heroesMap = m?.heroes || {};
  const made = (key, minMatches) => {
    const out = [];
    for (const h of state.heroes) {
      const row = heroesMap[h.id];
      if (!row) continue;
      const wr = key === 'e' ? row.wrE : row.wr;
      const matches = key === 'e' ? row.matchesE : row.matches;
      if (typeof wr !== 'number' || wr <= 0) continue;
      if (typeof matches === 'number' && matches < minMatches) continue;
      out.push({ id: h.id, h, wr, matches });
    }
    return out;
  };
  const overall = made('a', 30);
  const eternus = made('e', 5);

  if (!overall.length && !eternus.length) {
    list.innerHTML = `<p class="muted meta-empty">Данные меты ещё не собраны — они подтягиваются автоматически из deadlock-api.com.</p>`;
    if (summary) summary.innerHTML = '';
    return;
  }

  if (summary) {
    summary.innerHTML = (m.updatedAt ? `<span>Обновлено: ${esc(String(m.updatedAt).replace('T', ' ').slice(0, 16))}</span>` : '')
      + (m.windowDays ? `<span>Период: ${esc(String(m.windowDays))} дней</span>` : '')
      + (m.mode ? `<span>Режим: ${esc(m.mode === 'ranked' ? 'ранкед' : String(m.mode))}</span>` : '')
      + `<span>Источник: deadlock-api.com</span>`;
  }

  list.innerHTML =
    metaSectionHTML('Общий винрейт', 'все ранги', overall) +
    metaSectionHTML(
      'Этернус', 'винрейт высшего ранга',
      eternus,
      eternus.length
        ? 'Только матчи на высшем ранге — выборка меньше, цифры резче: один сильный игрок может сдвинуть процент.'
        : ''
    );
}

$('#tab-meta')?.addEventListener('click', (e) => {
  const card = e.target.closest('.meta-card[data-hero]');
  if (card) {
    const h = state.heroes.find((x) => x.id === card.dataset.hero);
    if (h?.profile) openHeroPage(h.id);
    else jumpToCalc(h.id);
  }
});
window.renderMeta = renderMeta; // вызывается после правок в админке

// ---------- профиль героя: клик по герою открывает его способности и статы ----------
function abilityHTML(ab) {
  const rows = Array.isArray(ab.rows) ? ab.rows : [];
  const typeCls = /пассив/i.test(ab.type || '') ? 'pass' : /ульт/i.test(ab.type || '') ? 'ult' : 'act';
  return `<div class="abil-card" data-ab="${esc(ab.id || '')}">
    <div class="abil-head">
      <span class="abil-ico"><img src="${esc(ab.icon || '')}" alt="${esc(ab.name)}"></span>
      <div class="abil-tt">
        <b>${esc(ab.name)}</b>
        <span class="abil-meta">${(ab.meta || []).map(esc).join(' · ')}</span>
      </div>
      <span class="abil-type t-${typeCls}">${esc(ab.type || '')}</span>
    </div>
    <p class="abil-desc">${esc(ab.desc || '')}</p>
    ${rows.length ? `<ul class="abil-rows">${rows.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
    ${(ab.upgrades || []).length ? `<div class="abil-ups">${(ab.upgrades || []).map(u => `<span class="abil-up"><i>${esc(u.p)}</i>${esc(u.t)}</span>`).join('')}</div>` : ''}
    ${(ab.notes || []).length ? `<details class="abil-notes"><summary>Подробнее</summary><ul>${(ab.notes || []).map(n2 => `<li>${esc(n2)}</li>`).join('')}</ul></details>` : ''}
  </div>`;
}

function heroDetailHTML(h) {
  const p = h.profile || {};
  const chip = (v) => `<span class="hd-chip">${esc(v)}</span>`;
  const fine = [p.release ? 'Выход: ' + p.release : '', p.voice ? 'Озвучка: ' + p.voice : '', p.devNames ? 'внутренние имена: ' + p.devNames : ''].filter(Boolean).join(' · ');
  return `<div class="hero-detail" data-hero="${esc(h.id)}" style="--hcol:${esc(h.color || '#ff7a1a')}">
    <div class="hd-top">
      <span class="ava-letter hd-ava" data-letter="${esc((h.name || '?').charAt(0).toUpperCase())}">${heroAvatar(h)}</span>
      <div class="hd-id">
        <h3>${esc(h.name)}</h3>
        <span class="hd-role">${esc(h.role || '')}${p.tags ? ' · ' + esc(p.tags) : ''}</span>
        ${fine ? `<span class="hd-fine">${esc(fine)}</span>` : ''}
        <div class="hd-acts">
          <button type="button" class="btn btn-sm" data-hcalc-scroll>↓ К калькулятору</button>
          ${p.weapon ? `<span class="hd-weapon">⚔ ${esc(p.weapon.name)} — ${esc(p.weapon.subtitle || '')}</span>` : ''}
        </div>
      </div>
    </div>
    ${p.weapon?.rows ? `<div class="hd-block"><b>Оружие — ${esc(p.weapon.name)}</b><p class="hd-desc">${esc(p.weapon.desc || '')}</p><div class="hd-chips">${p.weapon.rows.map(chip).join('')}</div></div>` : ''}
    <div class="hd-grid">
      ${p.vitality ? `<div class="hd-block"><b>Живучесть</b><div class="hd-chips">${p.vitality.map(chip).join('')}</div></div>` : ''}
      ${p.melee ? `<div class="hd-block"><b>Ближний бой</b><div class="hd-chips">${p.melee.map(chip).join('')}</div></div>` : ''}
      ${p.spirit ? `<div class="hd-block"><b>Дух</b><div class="hd-chips">${chip(p.spirit)}</div></div>` : ''}
    </div>
    ${(p.abilities || []).length ? `<div class="hd-abilities">${p.abilities.map(abilityHTML).join('')}</div>`
      : `<p class="muted hd-empty">Полный профиль героя (способности, скейлы, апгрейды) скоро появится.</p>`}
    ${p.playstyle ? `<div class="hd-block hd-lore"><b>Стиль игры</b><p class="hd-desc">${esc(p.playstyle)}</p></div>` : ''}
    ${p.lore ? `<details class="hd-block hd-lore"><summary>Лор</summary><p class="hd-desc">${esc(p.lore)}</p></details>` : ''}
  </div>`;
}

// ---------- вкладка героя: профиль + DPS-калькулятор (уровень, дух, предметы) ----------
const HC = { heroId: null, cat: 'weapon', query: '', items: new Set() };

function openHeroPage(id) {
  const h = state.heroes.find(x => x.id === id);
  if (!h || !h.profile) return;
  const box = $('#hero-page');
  if (!box) return;
  HC.heroId = id; HC.cat = 'weapon'; HC.query = ''; HC.items = new Set();
  box.innerHTML = heroDetailHTML(h) + heroCalcHTML(h);
  go('hero');
  window.scrollTo({ top: 0 });
  heroCalcItemsList();
  heroCalcUpdate(h);
  // запасная рамка, если иконка способности не нашлась
  box.querySelectorAll('.abil-ico img').forEach(img => {
    img.addEventListener('error', () => { img.closest('.abil-ico')?.classList.add('ico-err'); img.remove(); });
  });
  window.renderHeroPage = () => { const cur = state.heroes.find(x => x.id === HC.heroId); if (cur?.profile) openHeroPage(cur.id); };
}

// ---- разбор характеристик выбранных предметов ----
const HC_SKIP = /(за стак|в засаде|по NPC|не-героям|за убийство|для заряж|усиленного)/i;
function collectItemMods() {
  const f = (s, re) => { const x = String(s).match(re); return x ? parseFloat(x[1].replace(',', '.')) : null; };
  const m = { wpct: 0, ratepct: 0, spirit: 0, health: 0, hpPct: 0, mag: 0, pellets: 0, regen: 0, meleePct: 0, cdr: 0, spiritShred: 0, cost: 0, kount: 0 };
  (state.items || []).filter(it => HC.items.has(it.id)).forEach(it => {
    m.kount++; m.cost += it.cost || 0;
    (it.stats || []).forEach(raw => {
      const s = String(raw).trim(); if (HC_SKIP.test(s)) return; let x;
      if ((x = f(s, /^([+-]\d+(?:[.,]\d+)?)%\s*(?:урона оружия|урона от оружия|к урону от оружия)/i)) != null) { m.wpct += x; return; }
      if ((x = f(s, /^([+-]\d+(?:[.,]\d+)?)%\s*(?:скорости стрельбы|Скорострельность)/i)) != null) { m.ratepct += x; return; }
      if ((x = f(s, /^([+-]\d+(?:[.,]\d+)?)\s*(?:силы духа|Спиритическая мощь)/i)) != null) { m.spirit += x; return; }
      if ((x = f(s, /^([+-]\d+(?:[.,]\d+)?)\s*(?:доп\.?\s?здоровья|Бонус к здоровью|ед\. к здоровью)/i)) != null) { m.health += x; return; }
      if ((x = f(s, /^([+-]\d+(?:[.,]\d+)?)%\s*Базовое здоровье/i)) != null) { m.hpPct += x; return; }
      if ((x = f(s, /^([+-]\d+(?:[.,]\d+)?)%\s*(?:ёмкости магазина|к боезапасу|Макс\.?\s?боезапас)/i)) != null) { m.mag += x; return; }
      if ((x = f(s, /^([+-]\d+)\s*доп\.?\s?патрона за выстрел/i)) != null) { m.pellets += x; return; }
      if (!/вне боя/i.test(s) && (x = f(s, /^([+-]\d+(?:[.,]\d+)?)\s*(?:ед\.?\s?к восстановлению здоровья|Восстановление здоровья)/i)) != null) { m.regen += x; return; }
      if ((x = f(s, /^([+-]\d+(?:[.,]\d+)?)%\s*(?:к урону в ближнем бою|Урон в ближнем бою|урона в ближнем бою)/i)) != null) { m.meleePct += x; return; }
      if ((x = f(s, /^([+-]\d+(?:[.,]\d+)?)%\s*(?:Сокращение перезарядки умений|к сокращению перезарядки умений)/i)) != null) { m.cdr += x; return; }
      if ((x = f(s, /^([+-]\d+(?:[.,]\d+)?)%\s*(?:сопротивления духу у врага|Сопр\.?\s?спиритизму у врага)/i)) != null) { m.spiritShred -= x; return; }
    });
  });
  return m;
}

function heroCalcHTML(h) {
  return `<div class="hd-calc" id="hero-calc" data-hcid="${esc(h.id)}">
    <h2 class="hc-title">DPS-калькулятор <span>${esc(h.name)}</span></h2>
    <div class="hc-controls">
      <label>Уровень героя (1–9)<input id="hc-lvl" type="number" min="1" max="9" step="1" value="1"></label>
      <label>Шанс крита, %<input id="hc-critc" type="number" min="0" max="100" step="1" value="0"></label>
      <label>Множитель крита<input id="hc-critm" type="number" min="1" step="0.1" value="2"></label>
      <label>Доп. сила духа (вручную)<input id="hc-spirit" type="number" step="1" value="0"></label>
    </div>
    <div class="hc-sum" id="hc-sum"></div>
    <div class="hc-out" id="hc-out"></div>
    <div class="hc-items">
      <div class="hc-itabs">
        ${[['weapon', 'Оружие'], ['vitality', 'Живучесть'], ['spirit', 'Спиритизм']].map(([c, t]) =>
    `<button type="button" data-hccat="${c}"${HC.cat === c ? ' class="active"' : ''}>${t}</button>`).join('')}
        <input id="hc-search" type="search" placeholder="Поиск предмета…" value="${esc(HC.query)}">
      </div>
      <div class="hc-igrid" id="hc-igrid"></div>
    </div>
  </div>`;
}

function heroCalcItemsList() {
  const grid = $('#hc-igrid');
  if (!grid) return;
  const q = HC.query.trim().toLowerCase();
  const list = (state.items || []).filter(it => it.category === HC.cat && (!q || (it.name || '').toLowerCase().includes(q)));
  grid.innerHTML = list.map(it => {
    const sel = HC.items.has(it.id);
    return `<label class="hc-item${sel ? ' sel' : ''}" title="${esc((it.stats || []).join(' · '))}">
      <input type="checkbox" data-hcitem="${esc(it.id)}"${sel ? ' checked' : ''}>
      <img src="${esc(it.icon || '')}" alt="">
      <span class="hc-item-info">
        <b>${esc(it.name)}<i>Т${esc(it.tier ?? '—')} · ${esc(it.cost ?? '')}💰</i></b>
        <span class="hc-item-stats">${esc((it.stats || []).slice(0, 2).join(' · '))}${(it.stats || []).length > 2 ? ' …' : ''}</span>
      </span>
    </label>`;
  }).join('') || '<p class="muted" style="grid-column:1/-1">Ничего не найдено.</p>';
}

function heroCalcUpdate(h) {
  const box = $('#hero-calc');
  if (!box || !h) return;
  const p = h.profile || {}, sc = p.scales || {};
  const lvl = Math.min(Math.max(parseInt($('#hc-lvl')?.value) || 1, 1), 9);
  const bonus = lvl - 1;
  const critC = Math.min(Math.max(parseFloat($('#hc-critc')?.value) || 0, 0), 100) / 100;
  const critM = Math.max(parseFloat($('#hc-critm')?.value) || 2, 1);
  const m = collectItemMods();
  const fmt = (v, d = 1) => v.toFixed(d).replace('.', ',');

  const spiritTotal = (sc.spirit || 0) + (sc.spiritPerLevel || 0) * bonus + m.spirit + (parseFloat($('#hc-spirit')?.value) || 0);
  const health = Math.round(((sc.health || 0) + (sc.healthPerLevel || 0) * bonus) * (1 + m.hpPct / 100) + m.health);
  const bullet = (sc.bullet || 0) + (sc.bulletPerLevel || 0) * bonus;
  const perBullet = bullet * (1 + m.wpct / 100);
  const pellets = Math.max(Math.round((sc.pellets ?? 1) + m.pellets), 1);
  const perShot = perBullet * pellets;
  const mag = Math.max(Math.round((sc.mag ?? 9) * (1 + m.mag / 100)), 1);
  const rate = (sc.fireRate || 0) * (1 + m.ratepct / 100);
  const critFactor = 1 + critC * (critM - 1);
  const dpsAvg = perShot * rate * critFactor;
  const dpsMax = perShot * rate * critM;
  const meleeLight = ((sc.melee || 0) + (sc.meleePerLevel || 0) * bonus) * (1 + m.meleePct / 100);
  const meleeHeavy = ((sc.meleeHeavy || 0) + (sc.meleeHeavyPerLevel || 0) * bonus) * (1 + m.meleePct / 100);

  $('#hc-sum').innerHTML = [
    `<span class="hd-chip">Сила духа: ${fmt(spiritTotal)}</span>`,
    `<span class="hd-chip">Здоровье: ${health}</span>`,
    `<span class="hd-chip">Реген: ${fmt((sc.regen || 0) + m.regen)} /с</span>`,
    `<span class="hd-chip">Урон оружия: ${m.wpct >= 0 ? '+' : ''}${fmt(m.wpct)}%</span>`,
    m.ratepct ? `<span class="hd-chip">Темп: ${m.ratepct >= 0 ? '+' : ''}${fmt(m.ratepct)}%</span>` : '',
    m.cdr ? `<span class="hd-chip">Перезарядка умений: ${fmt(m.cdr)}%</span>` : '',
    `<span class="hd-chip">Предметы: ${m.kount} · ${m.cost} 💰</span>`,
  ].filter(Boolean).join('');

  $('#hc-out').innerHTML = `
    <div class="hc-big">
      <div><span>DPS оружия (ожид. с критом)</span><b>${fmt(dpsAvg)}</b></div>
      <div><span>Макс. DPS (вечный крит)</span><b>${fmt(dpsMax)}</b></div>
    </div>
    <div class="hd-chips">
      <span class="hd-chip">Урон за выстрел: ${fmt(perShot)}</span>
      <span class="hd-chip">Картечина: ${fmt(perBullet, 2)} × ${pellets}</span>
      <span class="hd-chip">Темп: ${fmt(rate, 2)} /с</span>
      <span class="hd-chip">Обойма: ${mag}</span>
      <span class="hd-chip">Множитель крига: ×${critFactor.toFixed(2)}</span>
      <span class="hd-chip">Ближний бой: ${fmt(meleeLight)} / ${fmt(meleeHeavy)}</span>
    </div>
    ${m.spiritShred ? `<p class="hc-note">Дух-шред врага: ${fmt(m.spiritShred)}% → урон умений ×${fmt(1 + m.spiritShred / 100, 2)}</p>` : ''}
    <ul class="hc-abl">${(p.abilities || []).map(ab => {
    const c = ab.calc;
    const dmg = c ? (c.base + (c.scale || 0) * spiritTotal) * (1 + (m.spiritShred || 0) / 100) : null;
    return `<li><b>${esc(ab.name)}</b>${dmg != null
        ? `<span>${fmt(dmg)} ${esc(c.per || '')}</span><small>скейлинг духа ×${fmt(c.scale || 0)}</small>`
        : '<span class="muted">не наносит урон</span>'}</li>`;
  }).join('')}</ul>`;
}

// DPS-подстановка героя (прежнее поведение клика по карточке без профиля)
function jumpToCalc(id) {
  const h = state.heroes.find(x => x.id === id);
  if (h?.stats) {
    $('#calc-hero').value = h.id;
    $('#calc-dmg').value = h.stats.weaponDamage ?? '';
    $('#calc-rate').value = h.stats.fireRate ?? '';
    go('calc');
    window.DPS?.update();
  }
}

// клики: сетка героев → вкладка героя; внутри вкладки — вкладки категорий, «к калькулятору», снятие предмета
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-hcalc-scroll]')) { $('#hero-calc')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
  const cat = e.target.closest('[data-hccat]');
  if (cat) {
    HC.cat = cat.dataset.hccat;
    document.querySelectorAll('#hero-calc [data-hccat]').forEach(b => b.classList.toggle('active', b === cat));
    heroCalcItemsList();
    return;
  }
  const un = e.target.closest('[data-hcun]');
  if (un) {
    HC.items.delete(un.dataset.hcun);
    heroCalcItemsList();
    heroCalcUpdate(state.heroes.find(x => x.id === HC.heroId));
    return;
  }
  const hc = e.target.closest('.hero-card[data-hero]');
  if (!hc) return;
  const h = state.heroes.find(x => x.id === hc.dataset.hero);
  if (h?.profile) openHeroPage(h.id);
  else jumpToCalc(hc.dataset.hero); // у героя без профиля — прежнее поведение
});

// чекбоксы предметов калькулятора
document.addEventListener('change', (e) => {
  const cb = e.target.closest('[data-hcitem]');
  if (!cb) return;
  const id = cb.dataset.hcitem;
  cb.checked ? HC.items.add(id) : HC.items.delete(id);
  cb.closest('.hc-item')?.classList.toggle('sel', cb.checked);
  heroCalcUpdate(state.heroes.find(x => x.id === HC.heroId));
});

// ручные вводы калькулятора: уровень, крит, доп. дух, поиск предметов
document.addEventListener('input', (e) => {
  if (e.target.id === 'hc-search') { HC.query = e.target.value; heroCalcItemsList(); return; }
  if (!['hc-lvl', 'hc-critc', 'hc-critm', 'hc-spirit'].includes(e.target.id)) return;
  if (!$('#hero-page')?.contains(e.target)) return;
  heroCalcUpdate(state.heroes.find(x => x.id === HC.heroId));
});

// ---------- init ----------
(async function init() {
  await initData();
  const heroes = state.heroes;
  $('#calc-hero').innerHTML = '<option value="">— вручную —</option>' +
    heroes.map(h => `<option value="${esc(h.id)}">${esc(h.name)}</option>`).join('');
  renderNews(); renderHeroes(); renderBuilds(); renderItems(); renderMeta();
  window.renderNews = renderNews; window.renderBuilds = renderBuilds; window.renderHeroesGrid = renderHeroes;
  startOnlineLoop();
  loadSteamNews();
  window.DPS?.update();
  const hash = location.hash.replace('#', '');
  if (window.AdminUI && window.AdminUI.isUnlocked()) { window.AdminUI.enter(); return; } // секретный URL → режим правки
  if (hash === 'hero' && !HC.heroId) hash = 'heroes'; // пустую вкладку героя не открываем по hash
  if (hash && $('#tab-' + hash)) {
    go(hash);
  } else if (hash) {
    history.replaceState(null, '', location.pathname + location.search); // неизвестный хэш — сбрасываем
  }
})();
