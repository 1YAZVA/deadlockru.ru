// ============ app.js: роутер, загрузка данных, онлайн, рендеры ============
'use strict';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
const fmtNum = (n) => n == null ? '…' : Number(n).toLocaleString('ru-RU');

const APPID = 1422450; // Deadlock
const state = { heroes: [], builds: [], notes: [] };
window.state = state; // админка правит состояние через window.state

// ---------- навигация ----------
function go(tab) {
  document.querySelectorAll('main section').forEach(s => s.classList.remove('active'));
  const sec = $('#tab-' + tab);
  if (sec) sec.classList.add('active');
  document.querySelectorAll('#main-nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  location.hash = tab;
  if (tab === 'admin' && window.AdminUI) window.AdminUI.render();
  window.scrollTo({ top: 0 });
}

$('#main-nav').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) go(b.dataset.tab); });
document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-goto]');
  if (g) { e.preventDefault(); go(g.dataset.goto); }
});
$('#go-home').addEventListener('click', () => go('home'));

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
  const [h, b, n] = await Promise.all([
    loadJSON('data/heroes.json'), loadJSON('data/builds.json'), loadJSON('data/patchnotes.json')
  ]);
  state.heroes = h?.heroes || []; state.heroesUpdatedAt = h?.updatedAt;
  state.builds = b?.builds || [];
  state.notes = n?.notes || [];
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
  box.innerHTML = state.notes.length
    ? state.notes.slice().sort((a, b) => b.date.localeCompare(a.date)).map(n => `
      <article class="note">
        <div class="meta"><span class="tag">${esc(n.tag || 'патч')}</span><span>${esc(n.date)}</span></div>
        <h3>${esc(n.title)}</h3>
        <p class="muted" style="white-space:pre-wrap">${esc(n.text)}</p>
      </article>`).join('')
    : '<p class="muted">Пока нет записей — добавьте их через 🔒 Админку.</p>';

  const latest = state.notes.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
  $('#home-latest-note').innerHTML = latest
    ? `<b>${esc(latest.title)}</b><p style="margin-top:4px">${esc(String(latest.text).slice(0, 140))}…</p><div class="muted">${esc(latest.date)}</div>`
    : 'Записей пока нет.';
}

function heroAvatar(h) {
  return h.avatar
    ? `<img src="${esc(h.avatar)}" alt="${esc(h.name)}" loading="lazy">`
    : `<span style="color:${esc(h.color || 'var(--accent)')}">◆</span>`;
}

function renderHeroes() {
  $('#heroes-grid').innerHTML = state.heroes.map(h => `
    <div class="card hero-card" data-hero="${esc(h.id)}" title="Открыть в калькуляторе">
      <div class="ava">${heroAvatar(h)}</div>
      <h4>${esc(h.name)}</h4>
      <div class="role">${esc(h.role || '')}</div>
      <p class="muted" style="min-height:60px">${esc(h.desc || '')}</p>
      <div class="stats-row">
        ${h.stats ? `
        <span class="stat-chip">⚔ ${h.stats.weaponDamage ?? '—'}</span>
        <span class="stat-chip">⏱ ${h.stats.fireRate ?? '—'}/с</span>
        <span class="stat-chip">❤ ${h.stats.health ?? '—'}</span>` : ''}
      </div>
    </div>`).join('') || '<p class="muted">Список пуст — добавьте героев в админке.</p>';
}

function renderBuilds() {
  $('#builds-list').innerHTML = state.builds.map(bld => {
    const hero = state.heroes.find(h => h.id === bld.hero);
    return `
    <article class="build">
      <div class="meta" style="display:flex;gap:10px;align-items:center;margin-bottom:4px">
        <span class="role" style="margin:0">${hero ? esc(hero.name) : esc(bld.hero || '')}</span>
        ${bld.tags ? `<span class="tag">${esc(bld.tags)}</span>` : ''}
      </div>
      <h3>${esc(bld.title)}</h3>
      <div class="items">${String(bld.items || '').split(',').map(i => i.trim()).filter(Boolean).map(i => `<span class="item">${esc(i)}</span>`).join('')}</div>
      <p class="muted" style="white-space:pre-wrap">${esc(bld.desc || '')}</p>
    </article>`;
  }).join('') || '<p class="muted">Билдов пока нет — добавьте в админке.</p>';
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

async function fetchOnline() {
  // 1) официальный live-счётчик (заработает, когда Valve откроет публичную статистику)
  try {
    const j = await fetchJSON(`https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${APPID}`);
    if (typeof j?.response?.player_count === 'number') return { kind: 'live', value: j.response.player_count };
  } catch (_) {}
  // 2) пик за последние сутки из официальной статистики Steam Charts
  try {
    const j = await fetchJSON('https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/');
    const row = j?.response?.ranks?.find((x) => x.appid === APPID);
    if (row?.peak_in_game) return { kind: 'peak', value: row.peak_in_game };
  } catch (_) {}
  return null;
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
  const res = await fetchOnline();
  const live = $('#online-count'), home = $('#home-online');
  if (res) {
    [live, home].forEach((el) => { if (el) el.textContent = fmtNum(res.value); });
    home.style.color = res.kind === 'peak' ? 'var(--accent2)' : 'var(--ok)';
    const note = $('#home-online-note');
    if (note) note.textContent = res.kind === 'peak' ? 'пик за 24 ч · Steam Charts' : 'обновляется каждую минуту';
    $('.online-widget').title = res.kind === 'peak'
      ? 'Пик одновременного онлайна за последние сутки (Steam Charts). Живой счётчик Steam пока не открывает статистику для этой игры.'
      : 'Одновременно играющих в Steam';
    localStorage.setItem('dl_online_last', JSON.stringify({ t: Date.now(), ...res }));
  } else {
    // прокси недоступны: показываем последнее известное значение, если есть
    const last = JSON.parse(localStorage.getItem('dl_online_last') || 'null');
    if (last) {
      const mins = Math.round((Date.now() - last.t) / 60000);
      const label = `≈ ${fmtNum(last.value)} (${mins === 0 ? '<1' : mins} мин назад)`;
      [live, home].forEach((el) => { if (el) el.textContent = label; });
      const note = $('#home-online-note');
      if (note) note.textContent = 'внешние запросы недоступны — показано последнее значение';
    } else {
      [live, home].forEach((el) => { if (el) el.textContent = 'н/д'; });
    }
  }
  const hist = JSON.parse(localStorage.getItem('dl_online_hist') || '[]');
  const now = Date.now();
  if (res && (!hist.length || now - hist[hist.length - 1].t > 55e3)) hist.push({ t: now, c: res.value });
  while (hist.length > 48) hist.shift();
  localStorage.setItem('dl_online_hist', JSON.stringify(hist));
  drawSpark();
}
function startOnlineLoop() { refreshOnline(); clearInterval(sparkTimer); sparkTimer = setInterval(refreshOnline, 60e3); }

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
  if (hash && $('#tab-' + hash)) go(hash);
})();
