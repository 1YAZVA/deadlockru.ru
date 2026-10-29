// ============ app.js: роутер, загрузка данных, онлайн, рендеры ============
'use strict';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const fmtNum = (n) => n == null ? '…' : Number(n).toLocaleString('ru-RU');

const APPID = 1422450; // Deadlock
const state = { heroes: [], builds: [], notes: [], items: [] };
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

// ---------- вкладка «Предметы»: категории-вкладки с выпадающей панелью тиров ----------
const ITEM_TIER_LABELS = { 1: 'Тир 1', 2: 'Тир 2', 3: 'Тир 3', 4: 'Тир 4' };

function itemCardHTML(it) {
  const stats = Array.isArray(it.stats) ? it.stats.filter(Boolean) : [];
  return `<article class="item-card" data-id="${esc(it.id)}">
    <span class="item-icon"><img src="${esc(it.icon || '')}" alt="${esc(it.name)}" loading="lazy"></span>
    <div class="item-info">
      <b class="item-name">${esc(it.name)}</b>
      <span class="item-cost"><i class="soul-dot"></i>${esc(fmtNum(it.cost))} душ</span>
      ${stats.length ? `<ul class="item-stats">${stats.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>` : ''}
    </div>
  </article>`;
}

function tierCellHTML(cat, tier) {
  const list = (window.state.items || []).filter((i) => i.category === cat && Number(i.tier) === Number(tier));
  const body = list.length
    ? `<div class="item-grid">${list.map(itemCardHTML).join('')}</div>`
    : '<p class="tier-clear">Пусто — предметы добавим в этот тир позже.</p>';
  return `<div class="tier-cell"><h4>${ITEM_TIER_LABELS[tier]}</h4>${body}</div>`;
}

function categoryPanelHTML(cat) {
  return `<div class="cat-panel-box"><div class="tier-grid">${[1, 2, 3, 4].map((t) => tierCellHTML(cat, t)).join('')}</div></div>`;
}

function renderItems() { // перерисовка открытой панели (вызывает и админка после правок)
  const btn = $('#items-cattabs .cat-tab.active');
  const panel = $('#items-panel');
  if (!btn || !panel || !panel.classList.contains('open')) return;
  const inner = panel.querySelector('.cat-panel-inner');
  if (inner) inner.innerHTML = categoryPanelHTML(btn.dataset.cat);
}
window.renderItems = renderItems;

$('#items-cattabs')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.cat-tab');
  if (!btn) return;
  const box = $('#items-cattabs'), panel = $('#items-panel');
  const already = btn.classList.contains('active');
  box.querySelectorAll('.cat-tab.active').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-expanded', 'false'); });
  if (already) { // повторный клик — свернуть панель
    panel.classList.remove('open');
    panel.addEventListener('transitionend', () => { if (!panel.classList.contains('open')) panel.innerHTML = ''; }, { once: true });
    return;
  }
  btn.classList.add('active');
  btn.setAttribute('aria-expanded', 'true');
  panel.className = 'cat-panel open ' + btn.dataset.cat;
  panel.innerHTML = `<div class="cat-panel-inner">${categoryPanelHTML(btn.dataset.cat)}</div>`;
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
  const [h, b, n, sn, it] = await Promise.all([
    loadJSON('data/heroes.json'), loadJSON('data/builds.json'), loadJSON('data/patchnotes.json'),
    loadJSON('data/steam-news.json'), loadJSON('data/items.json')
  ]);
  state.heroes = h?.heroes || []; state.heroesUpdatedAt = h?.updatedAt;
  state.builds = b?.builds || [];
  state.notes = n?.notes || [];
  state.steamPosts = sn?.posts || [];
  state.steamSource = sn?.source || '';
  state.items = it?.items || [];
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
    <div class="hero-card" data-hero="${esc(h.id)}" title="Открыть в DPS-калькуляторе">
      <span class="ava-letter" data-letter="${esc((h.name || '?').charAt(0).toUpperCase())}">${heroAvatar(h)}</span>
      <span style="min-width:0">
        <h4>${esc(h.name)}</h4>
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

// ---------- каркание героя в калькулятор ----------
document.addEventListener('click', (e) => {
  const hc = e.target.closest('.hero-card[data-hero]');
  if (!hc) return;
  const h = state.heroes.find(x => x.id === hc.dataset.hero);
  if (h?.stats) {
    $('#calc-hero').value = h.id;
    $('#calc-dmg').value = h.stats.weaponDamage ?? '';
    $('#calc-rate').value = h.stats.fireRate ?? '';
    go('calc');
    window.DPS?.update();
  }
});

// ---------- init ----------
(async function init() {
  await initData();
  const heroes = state.heroes;
  $('#calc-hero').innerHTML = '<option value="">— вручную —</option>' +
    heroes.map(h => `<option value="${esc(h.id)}">${esc(h.name)}</option>`).join('');
  renderNews(); renderHeroes(); renderBuilds();
  window.renderNews = renderNews; window.renderBuilds = renderBuilds; window.renderHeroesGrid = renderHeroes;
  startOnlineLoop();
  loadSteamNews();
  window.DPS?.update();
  const hash = location.hash.replace('#', '');
  if (window.AdminUI && window.AdminUI.isUnlocked()) { window.AdminUI.enter(); return; } // секретный URL → режим правки
  if (hash && $('#tab-' + hash)) {
    go(hash);
  } else if (hash) {
    history.replaceState(null, '', location.pathname + location.search); // неизвестный хэш — сбрасываем
  }
})();
