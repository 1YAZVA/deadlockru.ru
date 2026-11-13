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
  document.querySelectorAll('#main-nav button, #nav-menu-panel button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  closeNavMenu(); // выбор вкладки в бургер-меню закрывает его
  location.hash = tab;
  window.scrollTo({ top: 0 });
  // тяжёлые данные — лениво, при первом открытии вкладки
  if (tab === 'news') ensureNewsData();
  if (tab === 'items') ensureItemsData();
}

$('#main-nav').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) go(b.dataset.tab); });
document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-goto]');
  if (g) { e.preventDefault(); go(g.dataset.goto); }
});
$('#go-home').addEventListener('click', () => go('home'));

// ---------- бургер-меню: кнопка со стрелкой вниз, список вкладок по алфавиту ----------
const navMenu = $('#nav-menu'), navMenuBtn = $('#nav-menu-btn'), navMenuPanel = $('#nav-menu-panel');
function closeNavMenu() {
  if (!navMenuPanel || navMenuPanel.hidden) return;
  navMenuPanel.hidden = true;
  navMenu.classList.remove('open'); // стрелка возвращается вниз
  navMenuBtn.setAttribute('aria-expanded', 'false');
}
navMenuBtn.addEventListener('click', () => {
  const willOpen = navMenuPanel.hidden;
  navMenuPanel.hidden = !willOpen;
  navMenu.classList.toggle('open', willOpen);
  navMenuBtn.setAttribute('aria-expanded', String(willOpen));
});
navMenuPanel.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) go(b.dataset.tab); });
document.addEventListener('click', (e) => { if (!navMenu.contains(e.target)) closeNavMenu(); }); // клик вне меню закрывает
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNavMenu(); });

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
// Кэш JSON в localStorage с TTL 10 минут: повторные заходы открываются мгновенно,
// между визитами работает браузерный кэш GitHub Pages (max-age=600).
// Раньше здесь было '?t=' + Date.now() + no-store — телефон заново качал
// ~300 КБ JSON при каждом открытии сайта.
const JSON_TTL = 10 * 60e3;

function cacheGet(key) {
  try {
    const hit = JSON.parse(localStorage.getItem('dl_cache:' + key) || 'null');
    return (hit && Date.now() - hit.t < JSON_TTL) ? hit.v : null;
  } catch (_) { return null; }
}
// протухший кэш (старше TTL, но сохранён): если все маршруты мертвы, лучше
// показать данные прошлой загрузки с пометкой, чем пустоту с ошибкой
function cacheGetStale(key) {
  try {
    const hit = JSON.parse(localStorage.getItem('dl_cache:' + key) || 'null');
    return (hit && hit.v != null) ? { v: hit.v, t: hit.t } : null;
  } catch (_) { return null; }
}
function cacheSet(key, v) {
  try { localStorage.setItem('dl_cache:' + key, JSON.stringify({ t: Date.now(), v })); }
  catch (_) {
    // квота localStorage переполнена (история матчей — ~1,7 МБ): выкидываем
    // старые steam-кэши и пробуем ещё раз, иначе просто не кэшируем
    try {
      Object.keys(localStorage).filter(k => k.startsWith('dl_cache:steam:')).forEach(k => localStorage.removeItem(k));
      localStorage.setItem('dl_cache:' + key, JSON.stringify({ t: Date.now(), v }));
    } catch (_) {}
  }
}
// админка вызывает после коммита, чтобы перезагрузка показала свежие правки
function dlClearDataCache() {
  Object.keys(localStorage).filter(k => k.startsWith('dl_cache:')).forEach(k => localStorage.removeItem(k));
}
window.dlClearDataCache = dlClearDataCache;

async function loadJSON(path, { fresh = false } = {}) {
  if (!fresh) { const hit = cacheGet(path); if (hit) return hit; }
  try {
    const r = await fetch(path, fresh ? { cache: 'no-store' } : {});
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    if (!fresh) cacheSet(path, j);
    return j;
  } catch (e) {
    console.warn('loadJSON failed:', path, e);
    return null;
  }
}

// При старте грузим только лёгкие данные (~44 КБ): герои, сборки, заметки, мета.
// Тяжёлые steam-news.json (~150 КБ) и items.json (~100 КБ) — лениво,
// при первом открытии вкладок «Новости» и «Предметы».
let newsLoaded = false, itemsLoaded = false;
async function ensureNewsData() {
  if (newsLoaded) return;
  newsLoaded = true;
  const sn = await loadJSON('data/steam-news.json');
  state.steamPosts = sn?.posts || [];
  state.steamSource = sn?.source || '';
  renderNews(); // доспорживаем список новостей и пилюлю «Свежий патч»
}
async function ensureItemsData() {
  if (itemsLoaded) return;
  itemsLoaded = true;
  if (!state.items.length) {
    const p = $('#items-panel');
    if (p) p.innerHTML = '<p class="muted" style="padding:24px;text-align:center">Загружаю предметы…</p>';
  }
  const it = await loadJSON('data/items.json');
  state.items = it?.items || [];
  renderItems();
}

async function initData() {
  const [h, b, n, mt] = await Promise.all([
    loadJSON('data/heroes.json'), loadJSON('data/builds.json'),
    loadJSON('data/patchnotes.json'), loadJSON('data/meta.json')
  ]);
  state.heroes = h?.heroes || []; state.heroesUpdatedAt = h?.updatedAt;
  state.builds = b?.builds || [];
  state.notes = n?.notes || [];
  state.meta = mt;
  if (!h && !b && !n) {
    // скорее всего открыто как file://
    document.body.insertAdjacentHTML('afterbegin',
      `<div style="background:var(--bad);color:#fff;padding:8px 16px;font-size:14px;text-align:center">
        Данные не загрузились: fetch не работает с file://. Откройте сайт через GitHub Pages или локальный сервер.</div>`);
  }
}

// ---------- рендеры ----------
function newsTag(p) {
  const t = p.title || '';
  if (/хеллоуин|событи|ивент|праздн|акци|конкурс|спотлайт|фильм|трейлер/i.test(t)) return 'Событие';
  if (/обновлен|патч|баланс|фикс|сезон|ранг|изменен|нерф|бафф/i.test(t)) return 'Патч Valve';
  return 'Официально';
}

// баннер = первая картинка поста; в раскрытом тексте её убираем, чтобы не дублировалась
function newsBodyHTML(p) {
  const banner = (p.images && p.images[0]) || '';
  if (!banner) return p.contents;
  const safe = banner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return p.contents.replace(new RegExp('<img[^>]*src="' + safe + '"[^>]*>'), '');
}

// у Steam-постов в превью попадаются служебные плейсхолдеры картинок вида
// {STEAM_CLAN_IMAGE}/45164767/<hash>.png — они выглядят мусором и, что хуже,
// являются «словом» на 60+ символов: не переносятся и растягивают страницу
// на телефоне за границы экрана. Из превью убираем их полностью.
function newsPreview(text) {
  return String(text || '')
    .replace(/\{STEAM_CLAN_[A-Z_]+\}\/\S*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function renderNews() {
  const box = $('#news-list');
  // свои заметки (редактируются в панели) + официальные посты Valve из data/steam-news.json
  const own = state.notes.map(n => ({ ...n, own: true }));
  const steam = (state.steamPosts || []).map(p => ({ ...p, tag: newsTag(p), own: false }));
  const all = [...own, ...steam].sort((a, b) => b.date.localeCompare(a.date));
  const richCount = steam.filter(p => p.contents).length;

  box.innerHTML = `
    <p class="muted" style="text-align:center;font-size:12.5px;margin-bottom:18px">
      Официальные новости Valve (${steam.length}${richCount ? ` · полных: ${richCount}` : ''}) —
      полный текст на русском и картинки, обновляется автоматически раз в час.
      Свои заметки сообщества можно добавить в режиме редактора.</p>`
    + (all.length
      ? all.map(n => {
          if (!n.own && n.contents) {
            const banner = (n.images && n.images[0]) || '';
            const autoTag = n.lang === 'en→ru'
              ? '<span class="tag tag-auto">авто-перевод</span>' : '';
            return `
      <article class="note news-rich" data-nid="${esc(n.id)}">
        ${banner ? `<div class="news-banner"><img src="${esc(banner)}" alt="" loading="lazy"></div>` : ''}
        <div class="note-body">
          <div class="meta"><span class="tag">${esc(n.tag)}</span><span>${esc(n.date)}</span>${autoTag}</div>
          <h3>${esc(n.title)}</h3>
          <p class="news-preview muted">${esc(newsPreview(n.text))}</p>
          <div class="news-full"><div class="news-clip"><div class="news-body">${newsBodyHTML(n)}</div></div></div>
          <div class="news-actions">
            <button class="news-more" type="button">Читать полностью</button>
            ${n.url ? `<a class="note-src" href="${esc(n.url)}" target="_blank" rel="noopener">оригинал в Steam ↗</a>` : ''}
          </div>
        </div>
      </article>`;
          }
          return `
      <article class="note" ${n.own ? `data-id="${esc(n.id)}"` : ''}>
        <div class="meta"><span class="tag">${esc(n.tag || 'новость')}</span><span>${esc(n.date)}</span></div>
        <h3 style="font-family:var(--font-display);font-size:17px;margin-bottom:4px">${esc(n.title)}</h3>
        <p class="muted" style="white-space:pre-wrap">${esc(n.text)}</p>
        ${n.url ? `<a class="note-src" href="${esc(n.url)}" target="_blank" rel="noopener">источник в Steam ↗</a>` : ''}
      </article>`;
        }).join('')
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

function heroWrHTML(h) {
  // винрейт героя из meta.json (общий, за 30 дней) — на строке с именем, справа
  const row = state.meta?.heroes?.[h.id];
  const wr = row && typeof row.wr === 'number' && row.wr > 0 ? row.wr : null;
  if (wr === null) return '';
  const cls = metaWrClass(wr);
  const matches = typeof row.matches === 'number' && row.matches > 0
    ? ` · ${row.matches.toLocaleString('ru-RU')} ${heroMatchWord(row.matches)}` : '';
  return `<span class="hero-wr ${cls}" title="Винрейт за 30 дней${matches}">${heroTrendArrow(cls)}${wr.toFixed(1).replace('.', ',')}%</span>`;
}

function heroTrendArrow(cls) {
  // зигзаг-стрелка как на биржевых графиках: вверх (сильный), ровно (середина), вниз (слабый)
  const shapes = {
    'wr-up':   ['2.5 16.5 8 11 11 14 18 7.5', 'M13.5 7.5 L18 7.5 L18 12.5'],
    'wr-mid':  ['2.5 12 7 9 10 14 14 10 18.5 12', 'M14.5 8.5 L18.5 12 L14.5 15.5'],
    'wr-down': ['2.5 7.5 8 13 11 10 18 16.5', 'M13.5 16.5 L18 16.5 L18 11.5'],
  };
  const [pts, head] = shapes[cls] || shapes['wr-mid'];
  return `<svg class="wr-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="${pts}"/><path d="${head}"/></svg>`;
}

function heroMatchWord(n) {
  // русское склонение: 1 матч / 2 матча / 5 матчей
  const d100 = n % 100, d10 = n % 10;
  if (d10 === 1 && d100 !== 11) return 'матч';
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return 'матча';
  return 'матчей';
}

function renderHeroes() {
  $('#heroes-grid').innerHTML = state.heroes.map(h => `
    <div class="hero-card${h.profile ? ' has-profile' : ''}" data-hero="${esc(h.id)}" title="${h.profile ? 'Открыть профиль героя' : 'Открыть в DPS-калькуляторе'}">
      <span class="ava-letter" data-letter="${esc((h.name || '?').charAt(0).toUpperCase())}">${heroAvatar(h)}</span>
      <span style="flex:1;min-width:0">
        <span class="hero-name-row">
          <h4>${esc(h.name)}${h.profile ? ' <span class="prof-chip">профиль</span>' : ''}</h4>
          ${heroWrHTML(h)}
        </span>
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
  // Возвращает {live, peak, stale?, updated?}: live — текущий онлайн, peak — пик за 24 ч.
  // Источник №0: наш же data/live.json — его каждые 5 минут обновляет GitHub Actions
  // (свой файл → ни CORS, ни прокси; самый быстрый и надёжный путь).
  let live = null, peak = null, staleAt = null;
  try {
    const j = await (await fetch('data/live.json?t=' + Date.now(), { cache: 'no-store' })).json();
    const ageMs = Date.now() - Date.parse(j.updated);
    const fresh = ageMs < 25 * 60e3 && ageMs > -60e3; // старше 25 мин считаем протухшим
    if (fresh && typeof j.live === 'number') live = j.live;
    // пик из live.json берём всегда: Charts-API иногда не отвечает в браузере,
    // а в workflow мы его пишем в тот же файл
    if (fresh && typeof j.peak === 'number') peak = j.peak;
    // протухший файл запоминаем как «последнее известное»: покажем его с пометкой,
    // если внешние источники тоже не ответят — вместо «н/д»
    const ageH = ageMs / 60e3 / 60;
    if (!fresh && ageH < 24 && (typeof j.live === 'number' || typeof j.peak === 'number'))
      staleAt = { live: typeof j.live === 'number' ? j.live : null, peak: typeof j.peak === 'number' ? j.peak : null, updated: j.updated };
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
  if (live == null && peak == null) {
    // внешние источники тоже молчат: отдаём последнее известное с пометкой «протухло»
    if (staleAt) return { ...staleAt, stale: true };
    return null;
  }
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
  const widget = $('.online-widget');
  // протухшие данные: серая точка + время среза в тултипе (обновлятор временно не работает)
  widget?.classList.toggle('stale', !!(res?.stale));
  const utcHM = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC'; };
  if (res?.live != null) {
    // есть настоящий live-онлайн
    [live, homeLive].forEach((el) => { if (el) el.textContent = fmtNum(res.live); });
    if (homeLive) homeLive.style.color = 'var(--vitality)';
    if (note) note.textContent = res.stale ? 'онлайн на момент ' + utcHM(res.updated) + ' — обновление данных временно не работает' : 'играют прямо сейчас';
    widget && (widget.title = res.stale ? 'Данные на ' + utcHM(res.updated) + '. Обновление онлайна временно не работает — показано последнее известное значение.' : 'Одновременно играющих в Steam');
    if (homePeak && res.peak != null) { homePeak.textContent = 'Пик за 24 ч: ' + fmtNum(res.peak); homePeak.style.display = ''; }
  } else if (res?.peak != null) {
    // Steam пока не отдаёт live (Valve закрыл статистику) — показываем пик без пометок, только число
    [live, homeLive].forEach((el) => { if (el) el.textContent = fmtNum(res.peak); });
    if (homeLive) homeLive.style.color = 'var(--accent2)';
    if (note) note.textContent = res.stale ? 'пик онлайна за 24 ч на момент ' + utcHM(res.updated) : 'пик онлайна за 24 ч · точный «сейчас» Steam пока не отдаёт';
    widget && (widget.title = res.stale
      ? 'Пик онлайна за 24 ч, данные на ' + utcHM(res.updated) + '. Обновление временно не работает — показано последнее известное.'
      : 'Пик одновременного онлайна за 24 ч (Steam Charts). Текущий онлайн Valve пока не публикует для этой игры.');
    if (homePeak) { homePeak.style.display = 'none'; }
  } else {
    // внешние запросы не удались: показываем последнее известное значение — только число
    const last = JSON.parse(localStorage.getItem('dl_online_last') || 'null');
    if (last) {
      const label = fmtNum(last.value);
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
  // шкала: зелёный >51%, жёлтый 49–51%, красный <49%.
  // сравниваем по значению с 1 знаком (как показываем на экране), чтобы «49,0%» всегда было жёлтым
  const v = Math.round(wr * 10) / 10;
  if (v > 51) return 'wr-up';
  if (v >= 49) return 'wr-mid';
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

// страницы полных гайдов: герой -> URL (если гайда нет, кнопка не показывается)
const HERO_GUIDES = { abrams: '/heroes/abrams.html' };

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
          ${HERO_GUIDES[h.id] ? `<a class="btn btn-sm" href="${esc(HERO_GUIDES[h.id])}">📖 Полный гайд</a>` : ''}
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
  // новости: раскрытие/сворачивание полного текста
  const more = e.target.closest('.news-more');
  if (more) {
    const art = more.closest('.news-rich');
    if (art) {
      const open = art.classList.toggle('news-open');
      more.textContent = open ? 'Свернуть' : 'Читать полностью';
      more.classList.toggle('is-open', open);
    }
    return;
  }
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

// ---------- фоновое видео главной: только desktop ----------
// Раньше iframe VK-видео стоял прямо в HTML и грузился всем подряд — на мобильном
// интернете HD-видео занимало канал, и сайт «висел» до полной загрузки.
// Теперь видео подключается только на широких экранах, после полной загрузки
// страницы и не в режиме экономии трафика. На телефонах — статичный градиент из CSS.
function injectHeroVideo() {
  const bg = document.querySelector('#tab-home .hero-bg');
  if (!bg || bg.querySelector('iframe')) return;
  const conn = navigator.connection;
  if (conn && (conn.saveData || /2g/.test(conn.effectiveType || ''))) return;
  if (!window.matchMedia('(min-width: 1024px)').matches) return;
  const f = document.createElement('iframe');
  f.src = 'https://vkvideo.ru/video_ext.php?oid=-223127459&id=456239026&autoplay=1&loop=1&mute=1&hd=2&no_ads=1';
  f.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
  f.setAttribute('frameborder', '0');
  f.setAttribute('scrolling', 'no');
  f.setAttribute('title', '');
  f.setAttribute('aria-hidden', 'true');
  bg.insertBefore(f, bg.firstChild); // под затемняющим слоем .hero-bg-shade
}
(function scheduleHeroVideo() {
  const start = () => setTimeout(injectHeroVideo, 1500); // пауза — пусть первым грузится контент
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
})();

// ---------- статистика аккаунта Steam: deadlock-api.com (CORS открыт) ----------
const DL_API = 'https://api.deadlock-api.com/v1';
const STEAM64_BASE = 76561197960265728n; // steam64 = base + account_id

// числовые id героев API → [имя, файл аватара в img/heroes] ('' — буква вместо аватара)
const DL_HEROES = {
  1:['Infernus','infernus.webp'],2:['Seven','seven.webp'],3:['Vindicta','vindicta.png'],4:['Lady Geist','ghost.webp'],
  6:['Abrams','abrams.webp'],7:['Wraith','wraith.webp'],8:['McGinnis','forge.webp'],10:['Paradox',''],
  11:['Dynamo','dynamo.webp'],12:['Kelvin','kelvin.webp'],13:['Haze','haze.webp'],14:['Holliday','holliday.webp'],
  15:['Bebop','bebop.webp'],16:['Calico','calico.webp'],17:['Grey Talon','grey-talon.webp'],18:['Mo & Krill','mo-krill.webp'],
  19:['Shiv','shiv.webp'],20:['Ivy','ivy.webp'],25:['Warden','warden.webp'],27:['Yamato','yamato.webp'],
  31:['Lash','lash.webp'],35:['Viscous','viscous.webp'],50:['Pocket','synth.webp'],52:['Mirage','mirage.webp'],
  58:['Vyper','viper.webp'],60:['Sinclair','sinclair.webp'],63:['Mina','mina.webp'],64:['Drifter','drifter.webp'],
  65:['Venator','venator.webp'],66:['Victor','victor.webp'],67:['Paige','paige.webp'],69:['The Doorman','doorman.webp'],
  72:['Billy','billy.webp'],76:['Graves','graves.webp'],77:['Apollo','apollo.webp'],78:['Deadman Danny','deadman-danny.webp'],
  79:['Rem','rem.webp'],80:['Silver','silver.webp'],81:['Celeste','celeste.webp'],84:['Rat King','ratking.webp'],
  85:['Solomon','solomon.webp'],86:['Violet','violet.webp'],87:['Nurse Harrow','nurse.webp'],88:['Baba','baba.webp'],
};
// тировые ранги 0–11 (имена и цвета — /v1/assets/ranks); subrank — I…VI
const DL_RANKS = ['Obscurus','Initiate','Seeker','Acolyte','Sentinel','Mystic','Ritualist','Emissary','Oracle','Phantom','Ascendant','Eternus'];
const DL_RANK_COLORS = ['#333333','#6A3E1E','#882355','#5C6DAB','#719C47','#DDA326','#EE4F57','#B47FEB','#955138','#7C7C7C','#C39751','#5CE9A9'];
const DL_ROMAN = ['I','II','III','IV','V','VI'];

const dlHeroName = (id) => (DL_HEROES[id] ? DL_HEROES[id][0] : 'Герой #' + id);
function dlHeroAvatar(id) {
  const h = DL_HEROES[id];
  return (h && h[1])
    ? `<img src="img/heroes/${h[1]}" alt="${esc(h[0])}" loading="lazy">`
    : `<span class="ava-letter">${esc((h ? h[0] : '?').charAt(0))}</span>`;
}
function dlRankInfo(rank) {
  const t = Number(rank && rank.rank) || 0, s = Number(rank && rank.subrank) || 0;
  if (!t) return null;
  const i = Math.min(t, 11);
  return {
    name: DL_RANKS[i] + ' ' + (DL_ROMAN[Math.min(Math.max(s, 1), 6) - 1] || ''),
    img: `https://assets-bucket.deadlock-api.com/assets-api-res/images/ranks/rank${String(i).padStart(2, '0')}_lg.webp`,
    color: DL_RANK_COLORS[i],
  };
}
// «Steam ID / ссылка / STEAM_X:Y:Z / никнейм» → {id} или {nick}
function parseSteamInput(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  let m = s.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  if (m) return { id: Number(BigInt(m[1]) - STEAM64_BASE) };
  m = s.match(/steamcommunity\.com\/id\/([^/?#]+)/i);
  if (m) return { nick: m[1] };
  m = s.match(/^STEAM_[01]:([01]):(\d+)$/i);
  if (m) return { id: Number(m[2]) * 2 + Number(m[1]) };
  if (/^\d{17}$/.test(s)) return { id: Number(BigInt(s) - STEAM64_BASE) };
  if (/^\d{1,10}$/.test(s)) return { id: Number(s) };
  return { nick: s };
}
// fetch к deadlock-api с кэшем в localStorage (тот же TTL 10 минут, что и у данных сайта).
// API живёт за Cloudflare, и из некоторых сетей РФ прямой путь умирает (блокировка
// TLS/ECH), а публичные CORS-прокси то и дело лежат или ловят лимиты (429/522/520).
// Поэтому все маршруты запускаются ПАРАЛЛЕЛЬНО (гонка): побеждает первый ответивший,
// остальные отменяются — ожидание ограничено таймаутом самого медленного, а не суммой.
// Маршруты: свой Worker на /dlapi/ (если развёрнут на своём домене — самый надёжный
// путь; без него просто 404 и он отпадает мгновенно) → прямой путь (12 с) →
// публичные прокси (по 15 с). У allorigins два варианта (/get с распаковкой
// contents и /raw), r.jina.ai отдаёт текстом — распаковываем первый JSON в нём.
// Прокси оживают волнами, поэтому при полном провале гонка повторяется до 2 раз.
// Таймауты короткие сознательно: гонка выигрывает первый ответивший маршрут,
// а при полном провале лучше быстро показать «Повторить», чем держать спиннер 2 минуты.
const DL_ROUTES = [
  { tmo: 15000, url: (u) => location.origin + '/dlapi/?url=' + encodeURIComponent(u) },
  { tmo: 12000, url: (u) => u },
  { tmo: 15000, url: (u) => 'https://cors.eu.org/' + u },
  { tmo: 15000, url: (u) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u) },
  { tmo: 15000, url: (u) => 'https://api.allorigins.win/get?url=' + encodeURIComponent(u),
    unwrap: (j) => (typeof j.contents === 'string' ? JSON.parse(j.contents) : j.contents) },
  { tmo: 15000, url: (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u) },
  { tmo: 15000, url: (u) => 'https://api.cors.lol/?url=' + encodeURIComponent(u) },
  { tmo: 12000, text: true, url: (u) => 'https://r.jina.ai/' + u,
    unwrap: (t) => {
      const i = ['[', '{'].map((c) => t.indexOf(c)).filter((x) => x >= 0).sort((a, b) => a - b)[0];
      return JSON.parse(t.slice(i));
    } },
];
async function dlFetch(path) {
  const key = 'steam:' + path;
  const hit = cacheGet(key);
  if (hit) return hit;
  let aggErr = null;
  for (let round = 0; round < 2; round++) { // прокси оживают волнами — до двух попыток
    if (round) await new Promise((res) => setTimeout(res, 2000));
    const ctrls = new Map();
    const attempts = DL_ROUTES.map(async (route, i) => {
      const direct = i === 1; // индекс прямого пути в DL_ROUTES
      const ctrl = new AbortController();
      ctrls.set(i, ctrl);
      const to = setTimeout(() => ctrl.abort(), route.tmo);
      try {
        const r = await fetch(route.url(DL_API + path), { cache: 'no-store', signal: ctrl.signal });
        if (direct) { // от самого API — честные сообщения
          if (r.status === 429) throw Object.assign(new Error('Слишком много запросов к API — подожди минуту и попробуй снова'), { noProxy: true });
          if (r.status === 503 || r.status === 504) throw new Error('API перегружен — подожди минуту и попробуй снова');
        }
        if (!r.ok) throw new Error('маршрут ответил ' + r.status); // прокси: 429/522 — маршрут не годится
        let j;
        if (route.text) j = route.unwrap(await r.text());
        else { j = await r.json(); if (route.unwrap) j = route.unwrap(j); }
        return { i, j };
      } finally { clearTimeout(to); }
    });
    try {
      const { j } = await Promise.any(attempts); // побеждает первый ответивший маршрут
      for (const c of ctrls.values()) c.abort(); // остальные останавливаем
      cacheSet(key, j);
      return j;
    } catch (e) {
      aggErr = e;
      const noProxy = e && e.errors && e.errors.find((x) => x && x.noProxy);
      if (noProxy) throw noProxy; // лимит самого API — ретраить бессмысленно
    }
  }
  const errs = (aggErr && aggErr.errors) || [];
  const pick = errs.find((x) => x && x.noProxy) || errs[1] || errs[0]; // errs[1] — прямой путь
  const base = pick && pick.name === 'AbortError'
    ? 'API не ответил за отведённое время'
    : (pick && pick.message) || 'Сеть недоступна';
  throw new Error(base + ' — перепробовал все маршруты несколько раз; возможно, API недоступен из твоего региона, помогает VPN');
}
const dlDur = (s) => Math.floor(s / 60) + ':' + String(Math.round(s) % 60).padStart(2, '0');
// сохранённый (протухший) ответ прошлого раза — используется, когда все маршруты мертвы
const dlStale = (path) => cacheGetStale('steam:' + path);
const dlPlural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return (a > 10 && a < 20) ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many; };

function spSparkSVG(vals, color) {
  if (!vals || vals.length < 2) return '';
  const w = 600, h = 76, pad = 8;
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min;
  const pts = vals.map((v, i) => [
    (pad + i * (w - 2 * pad) / (vals.length - 1)).toFixed(1),
    (h - pad - (span ? (v - min) / span : 0.5) * (h - 2 * pad)).toFixed(1),
  ].join(',')).join(' ');
  return `<svg class="sp-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

function spHeroCard(h) {
  const wr = h.matches_played ? Math.round(h.wins / h.matches_played * 100) : 0;
  return `<div class="sp-hero">${dlHeroAvatar(h.hero_id)}
    <span class="sp-hinfo"><b>${esc(dlHeroName(h.hero_id))}</b>
      <small>${fmtNum(h.matches_played)} матчей · ${fmtNum(Math.round(h.networth_per_min || 0))} душ/мин</small></span>
    <span class="sp-hwr">${wr}%<small>винрейт</small></span></div>`;
}

function spMatchRow(m) {
  // исход: 1 = победа, 2 = поражение, 5 = «не учёт», 0 — исхода нет в базе
  const win = m.player_match_outcome === 1;
  const unknown = m.player_match_outcome !== 1 && m.player_match_outcome !== 2;
  const d = m.ranked_delta;
  return `<div class="sp-match ${win ? 'w' : unknown ? 'u' : 'l'}">${dlHeroAvatar(m.hero_id)}
    <span class="sp-mhero"><b>${esc(dlHeroName(m.hero_id))}</b>
      <small>${new Date(m.start_time * 1000).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} · ${unknown ? 'не учёт' : win ? 'победа' : 'поражение'}</small></span>
    <span class="sp-mkda"><b>${m.player_kills}/${m.player_deaths}/${m.player_assists}</b> К/Д/П</span>
    <span class="sp-msouls"><i class="soul-dot"></i>${fmtNum(m.net_worth)}</span>
    <span class="sp-mdur">${dlDur(m.match_duration_s)}</span>
    ${d != null ? `<span class="sp-mdelta ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d}</span>` : ''}
  </div>`;
}

const errMsg = (r) => (r && (r.reason || r) && (r.reason || r).message) || 'ошибка сети';

async function dlShowPlayer(accountId) {
  const box = $('#steam-player');
  $('#steam-candidates').hidden = true;
  box.innerHTML = '<div class="steam-msg">Загружаю статистику — профиль, ранг, матчи, герои…</div>';
  // если все маршруты тупят, через 13 с меняем текст — чтобы не выглядело зависанием
  const slowTo = setTimeout(() => {
    const m = box.querySelector('.steam-msg');
    if (m && box.contains(m)) m.textContent = 'Маршруты отвечают медленно — идёт повторная попытка…';
  }, 13000);
  // Фаза 1: профиль + ранг. Каждый запрос живёт своей жизнью — падение одного
  // не убивает весь блок (раньше один сбой в Promise.all оставлял пустоту).
  const [steamR, rankR] = await Promise.allSettled([
    dlFetch('/players/steam?account_ids=' + accountId),
    dlFetch('/players/' + accountId + '/rank'),
  ]);
  clearTimeout(slowTo);
  const profile = (() => { const a = steamR.status === 'fulfilled' ? steamR.value : null; return Array.isArray(a) ? (a.find((p) => p.account_id === accountId) || a[0]) : null; })();
  if (steamR.status === 'rejected' && rankR.status === 'rejected') {
    // все маршруты мертвы: если этот аккаунт раньше загружался — показываем
    // сохранённый профиль, а не пустоту
    const stale = dlStale('/players/steam?account_ids=' + accountId);
    if (stale && Array.isArray(stale.v) && stale.v.length) {
      const sp = stale.v.find((p) => p.account_id === accountId) || stale.v[0];
      box.innerHTML = `
        <div class="sp-head">
          ${sp && sp.avatarfull ? `<img class="sp-ava" src="${esc(sp.avatarfull)}" alt="${esc(sp.personaname || '')}">` : ''}
          <span class="sp-who"><b>${esc(sp && sp.personaname || 'Аккаунт ' + accountId)}</b>
            <span class="sp-sub">ID: ${accountId}</span>
            ${sp && sp.profileurl ? `<a class="sp-link" href="${esc(sp.profileurl)}" target="_blank" rel="noopener">Открыть в Steam ↗</a>` : ''}</span>
        </div>
        <div class="sp-note">Маршруты загрузки сейчас недоступны (прямой путь и прокси). Показаны сохранённые данные от
          ${new Date(stale.t).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} —
          подробности можно повторить позже. <button type="button" class="steam-retry" data-acc="${accountId}">Повторить</button></div>`;
      return;
    }
    box.innerHTML = '<div class="steam-msg err">' + esc(errMsg(steamR)) +
      ` <button type="button" class="steam-retry" data-acc="${accountId}">Повторить</button></div>`;
    return;
  }
  const rk = rankR.status === 'fulfilled' ? dlRankInfo(rankR.value) : null;
  const rankFail = rankR.status === 'rejected';
  const subParts = [profile && profile.realname, profile && profile.countrycode ? 'Страна: ' + profile.countrycode : '', 'ID: ' + accountId].filter(Boolean);
  box.innerHTML = `
    <div class="sp-head">
      ${profile && profile.avatarfull ? `<img class="sp-ava" src="${esc(profile.avatarfull)}" alt="${esc(profile.personaname || '')}">` : ''}
      <span class="sp-who"><b>${esc(profile && profile.personaname || 'Аккаунт ' + accountId)}</b>
        <span class="sp-sub">${esc(subParts.join(' · '))}</span>
        ${profile && profile.profileurl ? `<a class="sp-link" href="${esc(profile.profileurl)}" target="_blank" rel="noopener">Открыть в Steam ↗</a>` : ''}</span>
      <span class="sp-rank">${rk ? `<img src="${rk.img}" alt="${esc(rk.name)}">` : ''}
        <span class="sp-tier">${rk ? `<b style="color:${rk.color}">${esc(rk.name)}</b>` : '<b>Ранг не определён</b>'}
        <small>${rk ? 'звание · ' + (rankR.value.badge || 0) : rankFail ? 'ранг не загрузился' : 'нет ранговых матчей'}</small></span></span>
    </div>`;
  // Фаза 2: история матчей (~1,7 МБ) и статистика по героям грузятся НЕЗАВИСИМО —
  // каждая часть отрисовывается сразу, как только пришла, со своим «Повторить» при сбое.
  box.insertAdjacentHTML('beforeend', '<div id="steam-lifetime"><div class="steam-msg">Считаю матчи, героев и историю…</div></div>');
  const parts = { hist: null, hs: null, histErr: '', hsErr: '' };
  const refresh = () => {
    const host = $('#steam-lifetime');
    if (!host) return;
    const hist = parts.hist, hs = parts.hs || []; // hs может ещё не прийти, если история быстрее
    if (!hist && !hs && (parts.histErr || parts.hsErr)) {
      host.innerHTML = '<div class="steam-msg err">' + esc(parts.histErr || parts.hsErr) +
        ` <button type="button" class="steam-retry" data-acc="${accountId}">Повторить</button></div>`;
      return;
    }
    if (!hist && !hs) {
      host.innerHTML = '<div class="steam-msg err">Аккаунт есть, но матчей Deadlock нет — игрок скрыл статистику или не играл.</div>';
      return;
    }
    // Тоталы — по ПОЛНОЙ истории матчей (она шире hero-stats и включает уличные стычки).
    // Исход известен не для всех матчей: 1 = победа, 2 = поражение, 5 = «не учёт», 0 — исхода нет в базе.
    const sum = (arr, k) => arr.reduce((a, x) => a + (Number(x[k]) || 0), 0);
    let tiles, cumDeltas = [], histBlock = '', sparkBlock = '';
    if (hist) {
      const known = hist.filter((x) => x.player_match_outcome === 1 || x.player_match_outcome === 2);
      const knownW = known.filter((x) => x.player_match_outcome === 1).length;
      const wr = known.length >= 10 ? Math.round(knownW / known.length * 100) : 0;
      const recent = hist.slice(0, 50);
      const valid = recent.filter((x) => x.match_duration_s > 60 && x.net_worth > 0);
      const spmN = valid.slice(0, 20);
      const spm = spmN.length ? Math.round(spmN.reduce((a, x) => a + x.net_worth / (x.match_duration_s / 60), 0) / spmN.length) : 0;
      const k50 = sum(recent, 'player_kills'), d50 = sum(recent, 'player_deaths'), a50 = sum(recent, 'player_assists');
      const kda = d50 ? ((k50 + a50) / d50).toFixed(2) : '—';
      const avgDur = recent.length ? recent.reduce((a, x) => a + x.match_duration_s, 0) / recent.length : 0;
      let streak = 0, streakType = '';
      for (const x of hist) {
        if (x.player_match_outcome !== 1 && x.player_match_outcome !== 2) continue;
        streakType = x.player_match_outcome === 1 ? 'w' : 'l';
        streak = 1;
        for (const y of hist.slice(hist.indexOf(x) + 1)) {
          if (y.player_match_outcome !== x.player_match_outcome) break;
          streak++;
        }
        break;
      }
      const deltas = hist.slice(0, 50).slice().reverse().filter((x) => x.ranked_delta != null).map((x) => x.ranked_delta);
      let cum = 0; cumDeltas = deltas.map((d) => (cum += d));
      tiles = [
        { n: fmtNum(hist.length), t: 'матчей в базе API', s: 'включая уличные стычки' },
        { n: wr ? wr + '%' : '—', t: 'винрейт', hot: true, s: known.length ? 'по ' + known.length + ' матчам с известным исходом' : 'у API нет исходов матчей' },
        { n: fmtNum(spm), t: 'душ/мин · последние 20' },
        { n: kda, t: 'KDA · последние 50' },
        { n: fmtNum(Math.round(sum(hist, 'match_duration_s') / 3600)), t: 'часов в матчах', s: 'в Steam больше: + меню и лобби' },
        { n: fmtNum(profile && profile.matches_played_last_30d), t: 'матчей за 30 дней' },
        { n: streak ? (streakType === 'w' ? streak + ' ' + dlPlural(streak, 'победа', 'победы', 'побед') : streak + ' ' + dlPlural(streak, 'поражение', 'поражения', 'поражений')) : '—',
          t: 'текущая серия', cls: streakType === 'w' ? 'up' : streakType === 'l' ? 'down' : '' },
        { n: avgDur ? dlDur(avgDur) : '—', t: 'средний матч' },
        { n: fmtNum(sum(hist, 'net_worth')), t: 'душ собрано', s: 'за матчи в базе API' },
        { n: fmtNum(sum(hist, 'player_kills')), t: 'убийств' },
        { n: fmtNum(sum(hist, 'player_assists')), t: 'помощи' },
        { n: fmtNum(sum(hist, 'last_hits')), t: 'добиваний' },
        { n: fmtNum(sum(hist, 'denies')), t: 'укр. шаров' },
      ];
      sparkBlock = cumDeltas.length > 1 ? `<div class="sp-block"><h3>Движение по рангу · последние ${cumDeltas.length} ранговых матчей</h3>${spSparkSVG(cumDeltas, rk ? rk.color : '#C8A96A')}</div>` : '';
      histBlock = `<div class="sp-block"><h3>История матчей · последние ${Math.min(hist.length, 15)}</h3>
        <div class="sp-hist">${hist.slice(0, 15).map(spMatchRow).join('')}</div></div>`;
    } else {
      // история ещё не пришла — быстрая предварительная раскладка по героям
      const m = sum(hs, 'matches_played'), w = sum(hs, 'wins');
      tiles = [
        { n: fmtNum(m), t: 'матчей в базе API', s: 'по героям · история ещё считается' },
        { n: m ? Math.round(w / m * 100) + '%' : '—', t: 'винрейт', hot: true, s: 'по героям · уточнится по истории' },
        { n: fmtNum(Math.round(sum(hs, 'time_played') / 3600)), t: 'часов в матчах', s: 'в Steam больше: + меню и лобби' },
        { n: fmtNum(profile && profile.matches_played_last_30d), t: 'матчей за 30 дней' },
      ];
    }
    const fav = hs.slice().sort((a, b) => b.matches_played - a.matches_played).slice(0, 5);
    const qualified = hs.filter((h) => h.matches_played >= 5);
    const best = (qualified.length ? qualified : hs).slice()
      .sort((a, b) => b.wins / b.matches_played - a.wins / a.matches_played).slice(0, 5);
    const failed = [];
    if (parts.histErr) failed.push('история матчей: ' + parts.histErr);
    if (parts.hsErr) failed.push('статистика по героям: ' + parts.hsErr);
    host.innerHTML = `
      <div class="sp-tiles">${tiles.map((t) => `<div class="sp-tile${t.hot ? ' hot' : ''}"><div class="n ${t.cls || ''}">${t.n}</div><div class="t">${t.t}</div>${t.s ? `<div class="s">${t.s}</div>` : ''}</div>`).join('')}</div>
      ${sparkBlock}
      ${hs.length ? `<div class="sp-block sp-heroes">
        <div><h3>Любимые герои</h3>${fav.map(spHeroCard).join('')}</div>
        <div><h3>Лучшие по винрейту</h3>${best.map(spHeroCard).join('')}</div>
      </div>` : ''}
      ${histBlock}
      <div class="sp-note">${parts.staleAt ? `Свежая загрузка не удалась — показаны сохранённые данные от ${new Date(parts.staleAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}. ` : ''}Цифры — из открытой базы deadlock-api.com: в ней нет части матчей и исходов матчей до сентября 2026, поэтому итоги могут быть меньше внутриигровых. «Часов в Steam» дополнительно включает время в меню и лобби.${failed.length ? ' Не загрузилось: ' + esc(failed.join('; ')) + ' — можно повторить поиск.' : ''}</div>`;
  };
  dlFetch('/players/' + accountId + '/match-history')
    .then((j) => { parts.hist = Array.isArray(j) ? j : []; refresh(); })
    .catch((e) => {
      const stale = dlStale('/players/' + accountId + '/match-history'); // была ли старая загрузка
      if (stale && Array.isArray(stale.v) && stale.v.length) { parts.hist = stale.v; parts.staleAt = stale.t; }
      else parts.histErr = errMsg(e);
      refresh();
    });
  dlFetch('/players/hero-stats?account_ids=' + accountId)
    .then((j) => { parts.hs = Array.isArray(j) ? j : []; refresh(); })
    .catch((e) => {
      const stale = dlStale('/players/hero-stats?account_ids=' + accountId);
      if (stale && Array.isArray(stale.v) && stale.v.length) { parts.hs = stale.v; parts.staleAt = stale.t; }
      else parts.hsErr = errMsg(e);
      refresh();
    });
}

async function dlSearchNick(nick) {
  const box = $('#steam-player'), cand = $('#steam-candidates');
  box.innerHTML = '<div class="steam-msg">Ищу игроков по запросу «' + esc(nick) + '»…</div>';
  try {
    const res = await dlFetch('/players/steam-search?search_query=' + encodeURIComponent(nick) + '&limit=8');
    if (!res.length) {
      cand.hidden = true;
      box.innerHTML = '<div class="steam-msg err">Никого не нашёл по «' + esc(nick) + '». Введи Steam ID цифрами (узнать: steamid.io) или ссылку на профиль Steam.</div>';
      return;
    }
    box.innerHTML = '<div class="steam-msg">Нашёл ' + res.length + ' ' + dlPlural(res.length, 'игрока', 'игроков', 'игроков') + ' — выбери свой аккаунт:</div>';
    cand.innerHTML = res.map((p) => `<button type="button" class="sp-hero" data-acc="${p.account_id}">
        ${p.avatarmedium ? `<img src="${esc(p.avatarmedium)}" alt="" loading="lazy">` : '<span class="ava-letter">?</span>'}
        <span class="sp-hinfo"><b>${esc(p.personaname)}</b><small>${fmtNum(p.matches_played_last_30d)} матчей за 30 дней</small></span>
        <span class="sp-hwr">ID<small>${p.account_id}</small></span></button>`).join('');
    cand.hidden = false;
  } catch (e) {
    box.innerHTML = '<div class="steam-msg err">' + esc(e.message || 'Поиск не удался') + '</div>';
  }
}

async function dlLookup(raw) {
  const p = parseSteamInput(raw);
  if (!p) { $('#steam-player').innerHTML = '<div class="steam-msg err">Введи Steam ID, ссылку на профиль или никнейм.</div>'; return; }
  if (p.id != null) return dlShowPlayer(p.id);
  return dlSearchNick(p.nick);
}

$('#steam-lookup-btn').addEventListener('click', () => dlLookup($('#steam-lookup').value));
$('#steam-lookup').addEventListener('keydown', (e) => { if (e.key === 'Enter') dlLookup(e.target.value); });
document.addEventListener('click', (e) => {
  const ex = e.target.closest('.steam-example');
  if (ex) { $('#steam-lookup').value = ex.textContent.trim(); return dlLookup(ex.textContent.trim()); }
  const rt = e.target.closest('.steam-retry');
  if (rt) return dlShowPlayer(Number(rt.dataset.acc));
  const c = e.target.closest('#steam-candidates [data-acc]');
  if (c) { $('#steam-lookup').value = c.dataset.acc; return dlShowPlayer(Number(c.dataset.acc)); }
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
