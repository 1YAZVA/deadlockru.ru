// ============ admin.js: режим правки прямо на живом сайте ============
// Вход ТОЛЬКО по секретному URL: сайт/#panel-xk7m2q (SecretHash ниже — поменяйте на свой ключ!).
// После личного входа сайт выглядит как обычно, но внизу справа появляется «+»
// (добавить новость / героя / сборку), а у каждой карточки — маленький бейдж «✎ править».
// Сохранение — коммитами в GitHub-репозиторий сайта (нужен токен Contents: Read/Write).
'use strict';

window.AdminUI = (function () {
  // *** СМЕНИТЕ ЭТУ СТРОКУ на свой личный ключ: открывать правку будете по адресу
  //     ваш-сайт/#panel-ВАШ-КЛЮЧ. Никто без этой ссылки режим правки не увидит. ***
  const SECRET_HASH = 'panel-xk7m2q';
  const isUnlocked = () => location.hash === '#' + SECRET_HASH;

  // ---------- личный вход: почта + пароль + ключ доступа ----------
  // Хранятся только SHA-256 хэши; правильные значения знает только владелец.
  const CREDS = {
    email:    'c6af2dfeda701d1e7660a4bfdf2184d05f82e66286a62f210704c69e24a0ab19',
    password: '3342f6871f186f673675bee82f6b39e6373b7812991c469cf8889034f7993a91',
    key:      '87043049c4c6aaadb41d793bc04cfd5a8d42de37c0968cd5db2cdad0d87f4582',
  };
  const AUTH_FLAG = 'dl_admin_auth';
  const sha256hex = async (s) => {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
  };
  const authed = () => localStorage.getItem(AUTH_FLAG) === '1';
  const deauth = () => localStorage.removeItem(AUTH_FLAG);

  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  const LS_KEY = 'dl_admin';
  const DEFAULT_REPO = '1YAZVA/deadlockru.ru';
  const DEFAULT_BRANCH = 'main';
  const FILES = { patchnotes: 'data/patchnotes.json', heroes: 'data/heroes.json', builds: 'data/builds.json', items: 'data/items.json' };
  let cfg = null;              // {repo, branch, token}
  const dirty = { patchnotes: false, heroes: false, builds: false, items: false }; // что не закоммичено

  function loadCfg() {
    try { cfg = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (_) { cfg = null; }
    if (!cfg) cfg = { repo: DEFAULT_REPO, branch: DEFAULT_BRANCH, token: '' };
    if (!cfg.repo) cfg.repo = DEFAULT_REPO;
    if (!cfg.branch) cfg.branch = DEFAULT_BRANCH;
  }
  function saveCfg(v) { cfg = v; v ? localStorage.setItem(LS_KEY, JSON.stringify(v)) : localStorage.removeItem(LS_KEY); }

  // ---------- GitHub API ----------
  async function gh(path, opts = {}) {
    return fetch('https://api.github.com' + path, {
      ...opts,
      headers: { 'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + cfg.token, ...(opts.headers || {}) },
    });
  }
  const b64 = (str) => {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    bytes.forEach(b => bin += String.fromCharCode(b));
    return btoa(bin);
  };
  async function getFile(path) {
    const r = await gh(`/repos/${cfg.repo}/contents/${path}?ref=${encodeURIComponent(cfg.branch)}`);
    if (r.status === 404) return { sha: null, json: null };
    if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    const bytes = Uint8Array.from(atob(j.content.trim()), (c) => c.charCodeAt(0));
    return { sha: j.sha, json: JSON.parse(new TextDecoder().decode(bytes)) };
  }
  async function putFile(path, obj, message) {
    const { sha } = await getFile(path);
    const r = await gh(`/repos/${cfg.repo}/contents/${path}`, {
      method: 'PUT',
      body: JSON.stringify({ message, content: b64(JSON.stringify(obj, null, 2)), branch: cfg.branch, ...(sha ? { sha } : {}) }),
    });
    if (!r.ok) throw new Error('GitHub ' + r.status);
    return r.json();
  }

  // ---------- модальный слой ----------
  let overlay = null;
  function modalEl() {
    if (!overlay) { overlay = document.createElement('div'); overlay.id = 'edit-overlay'; document.body.appendChild(overlay); }
    return overlay;
  }
  function closeModal() { if (overlay) overlay.innerHTML = ''; }
  function openModal(title, bodyHTML) {
    modalEl().innerHTML = `
      <div class="edit-bg" data-close="1"></div>
      <div class="edit-modal" role="dialog">
        <div class="edit-modal-head"><h3>${esc(title)}</h3><button class="edit-x" data-close="1" title="Закрыть">✕</button></div>
        ${bodyHTML}`;
    modalEl().querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModal));
    return modalEl().querySelector('.edit-modal');
  }

  // ---------- статус/тосты ----------
  function toast(msg, cls) {
    const t = document.createElement('div');
    t.className = 'edit-toast ' + (cls || '');
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4200);
  }

  // ---------- личный вход (шторка) ----------
  function showGate() {
    const m = openModal('Личный вход', `
      <p class="muted" style="margin:0 0 12px;font-size:13px">Режим правки доступен только владельцу сайта.</p>
      <label>Email</label><input id="gate-email" type="email" autocomplete="off">
      <label>Пароль</label><input id="gate-pass" type="password" autocomplete="off">
      <label>Ключ доступа</label><input id="gate-key" type="password" autocomplete="off">
      <button class="btn" id="gate-btn" style="margin-top:14px">Войти</button>
      <span class="edit-status" id="gate-status"></span>`);
    $('#gate-key', m).focus();
    const submit = async () => {
      const [e, p, k] = [$('#gate-email', m).value.trim(), $('#gate-pass', m).value, $('#gate-key', m).value];
      const [he, hp, hk] = await Promise.all([sha256hex(e), sha256hex(p), sha256hex(k)]);
      if (he === CREDS.email && hp === CREDS.password && hk === CREDS.key) {
        localStorage.setItem(AUTH_FLAG, '1');
        closeModal();
        enterEditMode();
      } else {
        const s = $('#gate-status', m); s.textContent = 'Неверные данные'; s.className = 'edit-status err';
      }
    };
    $('#gate-btn', m).addEventListener('click', submit);
    ['#gate-email', '#gate-pass', '#gate-key'].forEach(s => $(s, m).addEventListener('keydown', (ev) => { if (ev.key === 'Enter') submit(); }));
  }

  // ---------- токен ----------
  function openTokenModal() {
    const m = openModal('Подключить токен сохранения', `
      <p class="muted" style="margin:0 0 12px;font-size:13px">Правки сохраняются коммитами в GitHub,
      поэтому нужен токен с правом <b>Contents: Read and write</b> на репозиторий сайта.
      Создать: <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener" style="color:var(--accent)">github.com → токены</a>.</p>
      <label>Токен (сохранится только в этом браузере)</label>
      <input id="adm-token2" type="password" placeholder="ghp_… или github_pat_…" autocomplete="off">
      <div style="margin-top:12px"><button class="btn btn-sm" id="adm-connect">Подключить</button></div>
      <span class="edit-status" id="tok-status"></span>`);
    $('#adm-connect', m).addEventListener('click', async () => {
      const t = $('#adm-token2', m).value.trim();
      if (!t) { $('#tok-status', m).textContent = 'Вставьте токен'; $('#tok-status', m).className = 'edit-status err'; return; }
      $('#tok-status', m).textContent = 'Проверяю…';
      try {
        const rr = await fetch(`https://api.github.com/repos/${cfg.repo}/contents/${FILES.patchnotes}?ref=${encodeURIComponent(cfg.branch)}`,
          { headers: { 'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + t } });
        if (rr.status === 401) throw new Error('Токен недействителен');
        if (rr.status === 403) throw new Error('Нет права Contents:Read/Write на репозиторий');
        if (rr.status === 404) throw new Error('Репозиторий/ветка не найдены: ' + cfg.repo);
        if (!rr.ok) throw new Error('GitHub ' + rr.status);
        cfg.token = t; saveCfg(cfg); closeModal(); redrawToolbar();
        await pullAll();
        toast('Токен подключён, данные из GitHub загружены', 'ok');
      } catch (e) {
        $('#tok-status', m).textContent = e.message; $('#tok-status', m).className = 'edit-status err';
      }
    });
  }

  // Забрать свежие данные из GitHub (до правки). Без токена — пропускаем.
  const repoShas = {};
  async function pullAll() {
    if (!cfg.token) return;
    for (const key of Object.keys(FILES)) {
      try {
        const { sha, json } = await getFile(FILES[key]);
        repoShas[key] = sha;
        if (!json) continue;
        if (key === 'heroes') { window.state.heroes = json.heroes || []; window.state.heroesUpdatedAt = json.updatedAt; }
        if (key === 'builds') window.state.builds = json.builds || [];
        if (key === 'patchnotes') window.state.notes = json.notes || [];
        if (key === 'items') window.state.items = json.items || [];
      } catch (e) { /* один сбой не роняет остальные */ }
    }
    if (window.renderNews) window.renderNews();
    if (window.renderBuilds) window.renderBuilds();
    if (window.renderHeroesGrid) window.renderHeroesGrid();
    window.DPS?.update();
  }

  // ---------- режим правки ----------
  function enterEditMode() {
    document.body.classList.add('edit-on');
    ensureFAB();
    ensureToolbar();
    attachBadges();
    if (cfg.token) pullAll();
    else openTokenModal(); // предложить подключить сразу
  }
  function exitEditMode() {
    document.body.classList.remove('edit-on');
    $('#edit-fab')?.remove(); $('#edit-fab-menu')?.remove(); $('#edit-toolbar')?.remove();
    document.querySelectorAll('.edit-badge').forEach(b => b.remove());
    closeModal();
    history.replaceState(null, '', location.pathname + location.search);
  }

  // Плавающая «+» справа внизу
  function ensureFAB() {
    if ($('#edit-fab')) return;
    const fab = document.createElement('button');
    fab.id = 'edit-fab'; fab.title = 'Добавить';
    fab.textContent = '+';
    fab.addEventListener('click', () => {
      const menu = $('#edit-fab-menu');
      if (menu) return menu.remove();
      const m = document.createElement('div');
      m.id = 'edit-fab-menu';
      m.innerHTML = [
        ['note', '📰 Новость / патч'],
        ['hero', '🦸 Героя'],
        ['build', '🛡 Сборку'],
        ['item', '⚔ Предмет'],
      ].map(([k, l]) => `<button data-kind="${k}">${l}</button>`).join('');
      document.body.appendChild(m);
      m.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        m.remove();
        if (b.dataset.kind === 'note') openNoteModal(null);
        if (b.dataset.kind === 'hero') openHeroModal(null);
        if (b.dataset.kind === 'build') openBuildModal(null);
        if (b.dataset.kind === 'item') openItemModal(null);
      });
      const closer = (ev) => { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('click', closer); } };
      setTimeout(() => document.addEventListener('click', closer), 0);
    });
    document.body.appendChild(fab);
  }

  // Тулбар справа внизу над «+»: статус, сохранение, выход
  function redrawToolbar() {
    const tb = $('#edit-toolbar'); if (tb) tb.remove();
    const el = document.createElement('div');
    el.id = 'edit-toolbar';
    const dirtyList = Object.keys(dirty).filter(k => dirty[k]);
    el.innerHTML = `
      <span class="et-status">${cfg.token
        ? (dirtyList.length ? `черновик: ${dirtyList.map(k => k === 'patchnotes' ? 'новости' : k === 'heroes' ? 'герои' : k === 'items' ? 'предметы' : 'сборки').join(', ')}` : 'всё сохранено')
        : 'нет токена — только черновик'}</span>
      <button class="et-save" id="et-commit" title="Отправить изменения коммитами на GitHub">💾 Сохранить</button>
      ${cfg.token ? '' : '<button class="et-min" id="et-token" title="Подключить токен">🔌</button>'}
      <button class="et-min" id="et-exit" title="Выйти из режима правки">✕</button>`;
    document.body.appendChild(el);
    $('#et-commit', el).addEventListener('click', commit);
    $('#et-token', el)?.addEventListener('click', openTokenModal);
    $('#et-exit', el).addEventListener('click', () => {
      if (Object.values(dirty).some(Boolean) && !confirm('Есть несохранённые черновики — они пропадут. Выйти?')) return;
      deauth(); closeModal(); exitEditMode();
    });
  }
  const ensureToolbar = redrawToolbar;

  // ---------- бейджи «✎ править» на карточках ----------
  function attachBadges() {
    if (!document.body.classList.contains('edit-on')) return;
    const add = (el, kind, id) => {
      if (el.querySelector(':scope > .edit-badge')) return;
      el.style.position = getComputedStyle(el).position === 'static' ? 'relative' : '';
      const b = document.createElement('button');
      b.className = 'edit-badge'; b.type = 'button'; b.title = 'Редактировать'; b.textContent = '✎';
      b.addEventListener('click', (e) => {
        e.stopPropagation(); e.preventDefault();
        if (kind === 'note') openNoteModal(id);
        if (kind === 'hero') openHeroModal(id);
        if (kind === 'build') openBuildModal(id);
        if (kind === 'item') openItemModal(id);
      });
      el.appendChild(b);
    };
    document.querySelectorAll('#news-list .note[data-id]').forEach(el => add(el, 'note', el.dataset.id));
    document.querySelectorAll('#heroes-grid .hero-card[data-hero]').forEach(el => add(el, 'hero', el.dataset.hero));
    document.querySelectorAll('#builds-list .build[data-id]').forEach(el => add(el, 'build', el.dataset.id));
    document.querySelectorAll('#items-panel .item-card[data-id]').forEach(el => add(el, 'item', el.dataset.id));
  }
  // пересобираем бейджи после каждой перерисовки списков
  const mo = new MutationObserver(() => { if (document.body.classList.contains('edit-on')) attachBadges(); });
  function startObserver() {
    ['news-list', 'heroes-grid', 'builds-list'].forEach(id => {
      const el = document.getElementById(id);
      if (el) mo.observe(el, { childList: true });
    });
    const ip = document.getElementById('items-panel');
    if (ip) mo.observe(ip, { childList: true, subtree: true }); // панель предметов появляется/перерисовывается динамически
  }

  // ---------- редакторы (модалки) ----------
  function openNoteModal(id) {
    const n = id ? window.state.notes.find(x => x.id === id) : null;
    const m = openModal(n ? 'Правка новости' : 'Новая новость', `
      <label>Дата</label><input id="n-date" type="date" value="${esc(n?.date || new Date().toISOString().slice(0, 10))}">
      <label>Метка</label><input id="n-tag" value="${esc(n?.tag || 'Обновление')}" placeholder="Обновление / Баланс патч / Событие…">
      <label>Заголовок</label><input id="n-title" value="${esc(n?.title || '')}" placeholder="Например: Патч nerf по Vindicta">
      <label>Текст</label><textarea id="n-text" placeholder="Что изменилось, цифры, выводы…">${esc(n?.text || '')}</textarea>
      <div class="edit-actions">
        <button class="btn btn-sm" id="n-save">${n ? 'Сохранить' : 'Добавить'}</button>
        ${n ? '<button class="btn btn-danger btn-sm" id="n-del">🗑 Удалить</button>' : ''}
      </div>`);
    const save = () => {
      const rec = {
        id: n?.id || 'n' + Date.now(),
        date: $('#n-date', m).value || new Date().toISOString().slice(0, 10),
        tag: $('#n-tag', m).value.trim() || 'патч',
        title: $('#n-title', m).value.trim(),
        text: $('#n-text', m).value.trim(),
      };
      if (!rec.title) { toast('Заголовок обязателен', 'err'); return; }
      const i = window.state.notes.findIndex(x => x.id === rec.id);
      if (i >= 0) window.state.notes[i] = rec; else window.state.notes.push(rec);
      dirty.patchnotes = true; redrawToolbar();
      rerenderSite(); closeModal();
      toast('Сохранено в черновик → нажмите 💾 «Сохранить» для коммита', 'ok');
    };
    $('#n-save', m).addEventListener('click', save);
    $('#n-del', m)?.addEventListener('click', () => {
      if (!confirm('Удалить эту запись?')) return;
      window.state.notes = window.state.notes.filter(x => x.id !== n.id);
      dirty.patchnotes = true; redrawToolbar(); rerenderSite(); closeModal();
      toast('Удалено из черновика → не забудьте 💾 коммит', 'ok');
    });
    m.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') save(); });
  }

  function openHeroModal(id) {
    const h = id ? window.state.heroes.find(x => x.id === id) : null;
    const s = h?.stats || {};
    const m = openModal(h ? 'Правка героя' : 'Новый герой', `
      <div class="edit-grid2">
        <div><label>Имя</label><input id="h-name" value="${esc(h?.name || '')}"></div>
        <div><label>Роль</label><input id="h-role" value="${esc(h?.role || '')}" placeholder="Керри / танк / …"></div>
        <div><label>Цвет (hex)</label><input id="h-color" value="${esc(h?.color || '#ff7a1a')}"></div>
        <div><label>URL аватарки</label><input id="h-avatar" value="${esc(h?.avatar || '')}" placeholder="https://…"></div>
      </div>
      <label>Описание на карточке</label><textarea id="h-desc" style="min-height:70px">${esc(h?.desc || '')}</textarea>
      <div class="edit-grid4">
        <div><label>⚔ Урон оружия</label><input id="h-dmg" type="number" step="0.1" value="${s.weaponDamage ?? ''}"></div>
        <div><label>⏱ Темп, выстр/с</label><input id="h-fire" type="number" step="0.05" value="${s.fireRate ?? ''}"></div>
        <div><label>❤ Здоровье</label><input id="h-hp" type="number" value="${s.health ?? ''}"></div>
        <div><label>👟 Скорость</label><input id="h-ms" type="number" step="0.1" value="${s.moveSpeed ?? ''}"></div>
      </div>
      <label>Профиль героя (JSON: теги, оружие, способности с апгрейдами; пусто = без профиля)</label><textarea id="h-profile" style="min-height:140px;font-family:monospace;font-size:12px" placeholder='{"tags":"Танк", "abilities":[…]}'>${h?.profile ? esc(JSON.stringify(h.profile, null, 2)) : ''}</textarea>
      <div class="edit-actions">
        <button class="btn btn-sm" id="h-save">${h ? 'Сохранить' : 'Добавить'}</button>
        ${h ? '<button class="btn btn-danger btn-sm" id="h-del">🗑 Удалить</button>' : ''}
      </div>`);
    const save = () => {
      const num = (v) => parseFloat(v) || 0;
      const rec = {
        id: h?.id || 'h' + Date.now(),
        name: $('#h-name', m).value.trim(),
        role: $('#h-role', m).value.trim(),
        avatar: $('#h-avatar', m).value.trim(),
        color: $('#h-color', m).value.trim() || '#ff7a1a',
        desc: $('#h-desc', m).value.trim(),
        stats: { weaponDamage: num($('#h-dmg', m).value), fireRate: num($('#h-fire', m).value), health: num($('#h-hp', m).value), moveSpeed: num($('#h-ms', m).value) },
      };
      if (!rec.name) { toast('Имя обязательно', 'err'); return; }
      // профиль (JSON) — если поле заполнено, валидируем и сохраняем; пустое = профиль удалить
      const rawP = $('#h-profile', m).value.trim();
      if (rawP) {
        try { rec.profile = JSON.parse(rawP); }
        catch (e) { toast('Профиль: ошибка JSON — ' + e.message, 'err'); return; }
        if (rec.profile.abilities && !Array.isArray(rec.profile.abilities)) { toast('Профиль: abilities должен быть массивом', 'err'); return; }
      }
      if (h) {
        Object.assign(h, rec);
        h.stats = rec.stats;
        if (rawP) h.profile = rec.profile; else delete h.profile;
      } else {
        window.state.heroes.push(rec);
      }
      dirty.heroes = true; redrawToolbar();
      rerenderSite(); closeModal();
      toast('Сохранено в черновик → нажмите 💾 «Сохранить» для коммита', 'ok');
    };
    $('#h-save', m).addEventListener('click', save);
    $('#h-del', m)?.addEventListener('click', () => {
      if (!confirm('Удалить героя ' + h.name + '?')) return;
      window.state.heroes = window.state.heroes.filter(x => x.id !== h.id);
      dirty.heroes = true; redrawToolbar(); rerenderSite(); closeModal();
      toast('Удалено из черновика → не забудьте 💾 коммит', 'ok');
    });
  }

  function openItemModal(id) {
    const it = id ? (window.state.items || []).find(x => x.id === id) : null;
    const m = openModal(it ? 'Правка предмета' : 'Новый предмет', `
      <div class="edit-grid2">
        <div><label>Название</label><input id="i-name" value="${esc(it?.name || '')}" placeholder="Close Quarters"></div>
        <div><label>Стоимость (души)</label><input id="i-cost" type="number" step="1" value="${it?.cost ?? 800}"></div>
        <div><label>Категория</label>
          <select id="i-cat">
            <option value="weapon">Оружие</option>
            <option value="vitality">Живучесть</option>
            <option value="spirit">Спиритизм</option>
          </select></div>
        <div><label>Тир</label>
          <select id="i-tier">${[1, 2, 3, 4].map(t => `<option value="${t}">Тир ${t}</option>`).join('')}</select></div>
      </div>
      <label>Иконка (локальный путь img/… или URL)</label><input id="i-icon" value="${esc(it?.icon || '')}" placeholder="img/items/close_quarters.png">
      <label>Характеристики (по одной в строке; строка «—» скрывает блок)</label>
      <textarea id="i-stats" style="min-height:80px" placeholder="+8% урона оружия&#10;+30% ёмкости магазина">${esc((it?.stats || []).join('\n'))}</textarea>
      <div class="edit-actions">
        <button class="btn btn-sm" id="i-save">${it ? 'Сохранить' : 'Добавить'}</button>
        ${it ? '<button class="btn btn-danger btn-sm" id="i-del">🗑 Удалить</button>' : ''}
      </div>`);
    if (it) $('#i-cat', m).value = it.category || 'weapon';
    if (it) $('#i-tier', m).value = String(it.tier || 1);
    const save = () => {
      const rec = {
        id: it?.id || 'it' + Date.now(),
        name: $('#i-name', m).value.trim(),
        tier: parseInt($('#i-tier', m).value, 10) || 1,
        cost: parseInt($('#i-cost', m).value, 10) || 800,
        category: $('#i-cat', m).value,
        icon: $('#i-icon', m).value.trim(),
        stats: $('#i-stats', m).value.split('\n').map(s => s.trim()).filter(s => s && s !== '—'),
      };
      if (!rec.name) { toast('Название обязательно', 'err'); return; }
      if (it && it.funcEn) rec.funcEn = it.funcEn; // сохраняем EN-справку при правке
      const arr = window.state.items = window.state.items || [];
      const i = arr.findIndex(x => x.id === rec.id);
      if (i >= 0) arr[i] = rec; else arr.push(rec);
      dirty.items = true; redrawToolbar();
      rerenderSite(); closeModal();
      toast('Сохранено в черновик → нажмите 💾 «Сохранить» для коммита', 'ok');
    };
    $('#i-save', m).addEventListener('click', save);
    $('#i-del', m)?.addEventListener('click', () => {
      if (!confirm('Удалить предмет ' + it.name + '?')) return;
      window.state.items = (window.state.items || []).filter(x => x.id !== it.id);
      dirty.items = true; redrawToolbar(); rerenderSite(); closeModal();
      toast('Удалено из черновика → не забудьте 💾 коммит', 'ok');
    });
    m.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') save(); });
  }

  function openBuildModal(id) {
    const b = id ? window.state.builds.find(x => x.id === id) : null;
    const heroOpts = window.state.heroes.map(x => `<option value="${esc(x.id)}" ${x.id === b?.hero ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
    const m = openModal(b ? 'Правка сборки' : 'Новая сборка', `
      <div class="edit-grid2">
        <div><label>Герой</label><select id="b-hero">${heroOpts}</select></div>
        <div><label>Название</label><input id="b-title" value="${esc(b?.title || '')}"></div>
      </div>
      <label>Предметы (через запятую)</label><textarea id="b-items" style="min-height:60px">${esc(b?.items || '')}</textarea>
      <label>Описание / как играть</label><textarea id="b-desc" style="min-height:70px">${esc(b?.desc || '')}</textarea>
      <label>Метки</label><input id="b-tags" value="${esc(b?.tags || '')}" placeholder="крит, снайп, …">
      <div class="edit-actions">
        <button class="btn btn-sm" id="b-save">${b ? 'Сохранить' : 'Добавить'}</button>
        ${b ? '<button class="btn btn-danger btn-sm" id="b-del">🗑 Удалить</button>' : ''}
      </div>`);
    const save = () => {
      const rec = {
        id: b?.id || 'b' + Date.now(),
        hero: $('#b-hero', m).value,
        title: $('#b-title', m).value.trim(),
        items: $('#b-items', m).value,
        desc: $('#b-desc', m).value.trim(),
        tags: $('#b-tags', m).value.trim(),
      };
      if (!rec.title) { toast('Название обязательно', 'err'); return; }
      const i = window.state.builds.findIndex(x => x.id === rec.id);
      if (i >= 0) window.state.builds[i] = rec; else window.state.builds.push(rec);
      dirty.builds = true; redrawToolbar();
      rerenderSite(); closeModal();
      toast('Сохранено в черновик → нажмите 💾 «Сохранить» для коммита', 'ok');
    };
    $('#b-save', m).addEventListener('click', save);
    $('#b-del', m)?.addEventListener('click', () => {
      if (!confirm('Удалить сборку?')) return;
      window.state.builds = window.state.builds.filter(x => x.id !== b.id);
      dirty.builds = true; redrawToolbar(); rerenderSite(); closeModal();
      toast('Удалено из черновика → не забудьте 💾 коммит', 'ok');
    });
    if (b) $('#b-hero', m).value = b.hero;
  }

  // ---------- коммит ----------
  async function commit() {
    if (!cfg.token) { openTokenModal(); return; }
    redrawToolbar();
    const note = (title) => ({ note: 'Редактируется через режим правки на сайте', updatedAt: title });
    const msg = 'admin: правки в режиме правки';
    try {
      if (dirty.patchnotes) {
        await putFile(FILES.patchnotes, { ...note(new Date().toISOString().slice(0, 10)), notes: window.state.notes }, msg + ': новости');
        dirty.patchnotes = false;
      }
      if (dirty.heroes) {
        await putFile(FILES.heroes, { ...note(new Date().toISOString().slice(0, 10)), heroes: window.state.heroes }, msg + ': герои');
        dirty.heroes = false;
      }
      if (dirty.builds) {
        await putFile(FILES.builds, { ...note(new Date().toISOString().slice(0, 10)), builds: window.state.builds }, msg + ': сборки');
        dirty.builds = false;
      }
      if (dirty.items) {
        await putFile(FILES.items, { updatedAt: new Date().toISOString().slice(0, 10), source: '0xThiagoAmaral/deadlock-open-assets — игровые данные June 2026 (assets/game/items.json)', items: window.state.items }, msg + ': предметы');
        dirty.items = false;
      }
      redrawToolbar();
      toast('Сохранено коммитами! GitHub Pages обновит сайт через 1–3 мин.', 'ok');
    } catch (e) {
      redrawToolbar();
      toast('Ошибка коммита: ' + e.message, 'err');
    }
  }

  function rerenderSite() {
    if (window.renderNews) window.renderNews();
    if (window.renderBuilds) window.renderBuilds();
    if (window.renderHeroesGrid) window.renderHeroesGrid();
    if (window.renderItems) window.renderItems();
    if (window.renderHeroPage) window.renderHeroPage(); // вкладка героя (если открыта)
    window.DPS?.update();
  }

  loadCfg();
  startObserver();
  // Режим правки включается при каждой загрузке, если личный вход уже пройден
  // (флаг в localStorage живёт в этом браузере до кнопки «✕»). Шторка «Личный вход»
  // показывается только по секретному URL, если входа ещё не было.
  if (authed()) enterEditMode();
  else if (isUnlocked()) showGate();
  return { enter: () => { authed() ? (closeModal(), enterEditMode()) : showGate(); }, exitEditMode, isUnlocked, SECRET_HASH: '#' + SECRET_HASH };
})();
