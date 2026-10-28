// ============ admin.js: правки прямо на сайте через GitHub Contents API ============
// Логин: имя репозитория + fine-grained токен с правом Contents:Read/Write на этот репозиторий.
// Токен хранится ТОЛЬКО в localStorage вашего браузера и уходит только на api.github.com.
'use strict';

window.AdminUI = (function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const ROOT = () => $('#admin-root');

  const LS_KEY = 'dl_admin';
  let cfg = null;          // {repo, branch, token}
  let dataset = 'patchnotes';
  let editNoteId = null;

  function loadCfg() { try { cfg = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (_) { cfg = null; } }
  function saveCfg(v) { cfg = v; v ? localStorage.setItem(LS_KEY, JSON.stringify(v)) : localStorage.removeItem(LS_KEY); }

  // ---------- GitHub API ----------
  async function gh(path, opts = {}) {
    const r = await fetch('https://api.github.com' + path, {
      ...opts,
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': 'Bearer ' + cfg.token,
        ...(opts.headers || {}),
      },
    });
    return r;
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
    if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }

  const FILES = { patchnotes: 'data/patchnotes.json', heroes: 'data/heroes.json', builds: 'data/builds.json' };

  // ---------- рендер ----------
  function setStatus(text, cls) {
    const s = $('#adm-status'); if (!s) return;
    s.textContent = text; s.className = 'status ' + (cls || '');
  }

  function render() {
    loadCfg();
    if (!cfg || !cfg.token) return renderLogin();
    renderEditor();
  }

  function renderLogin() {
    ROOT().innerHTML = `
      <div class="admin-lock">
        <h3 style="margin-bottom:10px">Вход администратора</h3>
        <p class="muted" style="margin-bottom:14px;font-size:13px">
          Правки сохраняются коммитами в ваш GitHub-репозиторий, поэтому нужен токен.
          Создайте <b>fine-grained personal access token</b> (github.com → Settings → Developer settings),
          дайте доступ <b>только к репозиторию сайта</b> и только право <b>Contents: Read and write</b>.
        </p>
        <input id="adm-repo" placeholder="владелец/репозиторий, напр. ivanov/deadlock-fan" autocomplete="off">
        <input id="adm-branch" placeholder="ветка (обычно main)" value="main" autocomplete="off">
        <input id="adm-token" type="password" placeholder="github_pat_… ( сохранится только в этом браузере )" autocomplete="new-password">
        <button class="btn" id="adm-login">Войти</button>
        <span class="status" id="adm-status"></span>
      </div>`;
    $('#adm-login').addEventListener('click', async () => {
      const repo = $('#adm-repo').value.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '');
      const branch = $('#adm-branch').value.trim() || 'main';
      const token = $('#adm-token').value.trim();
      if (!repo.includes('/') || !token) return setStatus('Заполните репозиторий и токен', 'err');
      saveCfg({ repo, branch, token });
      setStatus('Проверяю доступ…');
      try {
        const r = await gh(`/repos/${repo}/contents/${FILES.patchnotes}?ref=${encodeURIComponent(branch)}`);
        if (r.status === 401) throw new Error('Токен недействителен — проверьте значение');
        if (r.status === 403) throw new Error('Нет доступа: токен должен иметь Contents: Read/Write на этот репозиторий');
        if (r.status === 404) throw new Error('Репозиторий/ветка не найдены. Проверьте имя и ветку');
        if (!r.ok) throw new Error('GitHub: ' + r.status);
        setStatus('Готово, вход выполнен', 'ok');
        renderEditor();
      } catch (e) {
        saveCfg(null);
        setStatus(e.message, 'err');
      }
    });
  }

  let currentSha = null;

  async function renderEditor() {
    ROOT().innerHTML = `
      <p class="muted" style="font-size:13px;margin-bottom:10px">
        Репозиторий: <b>${esc(cfg.repo)}</b>, ветка <b>${esc(cfg.branch)}</b>.
        Правки не применяются на сайте мгновенно — это коммит в GitHub; GitHub Pages публикация занимает 1–3 минуты.
        Токен хранится только в вашем браузере.
      </p>
      <div class="admin-toolbar">
        <select id="adm-ds" class="btn-ghost" style="padding:8px 12px;border-radius:8px;background:var(--panel2);border:1px solid var(--line);color:var(--text)">
          <option value="patchnotes">📝 Новости / патчи</option>
          <option value="heroes">🦸 Карточки героев</option>
          <option value="builds">🛡 Билды</option>
        </select>
        <button class="btn btn-ghost btn-sm" id="adm-reload">⟳ Загрузить из GitHub</button>
        <button class="btn btn-sm" id="adm-commit">💾 Сохранить (коммит)</button>
        <button class="btn btn-ghost btn-sm" id="adm-logout">Выйти</button>
        <span class="status" id="adm-status"></span>
      </div>
      <div id="adm-edit"></div>`;

    $('#adm-ds').value = dataset;
    $('#adm-ds').addEventListener('change', () => { dataset = $('#adm-ds').value; loadDataset(); });
    $('#adm-reload').addEventListener('click', loadDataset);
    $('#adm-logout').addEventListener('click', () => { saveCfg(null); render(); });
    $('#adm-commit').addEventListener('click', commit);

    await loadDataset();
  }

  async function loadDataset() {
    setStatus('Загрузка…');
    try {
      const { sha, json } = await getFile(FILES[dataset]);
      currentSha = sha;
      if (json) {
        if (dataset === 'heroes') { window.state.heroes = json.heroes || []; window.state.heroesUpdatedAt = json.updatedAt; }
        if (dataset === 'builds') window.state.builds = json.builds || [];
        if (dataset === 'patchnotes') window.state.notes = json.notes || [];
      }
      rerenderSite();
      editNoteId = null;
      renderBody();
      setStatus('Данные из GitHub загружены', 'ok');
    } catch (e) {
      renderBody();
      setStatus('Ошибка загрузки: ' + e.message, 'err');
    }
  }

  // ---------- редакторы ----------
  function renderBody() {
    if (dataset === 'patchnotes') renderNotesEditor();
    else if (dataset === 'heroes') renderHeroesEditor();
    else renderBuildsEditor();
  }

  function renderNotesEditor() {
    const notes = window.state.notes.slice().sort((a, b) => b.date.localeCompare(a.date));
    $('#adm-edit').innerHTML = `
      <div class="editor-form">
        <h3 style="margin-bottom:8px">${editNoteId ? 'Редактирование записи' : 'Новая запись'}</h3>
        <input type="hidden" id="n-id" value="${editNoteId || ''}">
        <label>Дата (ГГГГ-ММ-ДД)</label><input id="n-date" type="date" value="${new Date().toISOString().slice(0, 10)}">
        <label>Метка (Обновление / Баланс патч / Событие…)</label><input id="n-tag" value="Обновление">
        <label>Заголовок</label><input id="n-title" placeholder="Например: Патч nerf по Vindicta">
        <label>Текст заметки</label><textarea id="n-text" placeholder="Что изменилось, цифры, ваши выводы…"></textarea>
        <div style="margin-top:12px;display:flex;gap:8px">
          <button class="btn btn-sm" id="n-save">Сохранить запись (в черновик сайта)</button>
          <button class="btn btn-ghost btn-sm" id="n-new">Очистить форму</button>
        </div>
      </div>
      <h3 style="margin:8px 0">Записи (${notes.length})</h3>
      ${notes.map(n => `
        <div class="note" style="display:flex;justify-content:space-between;gap:10px;align-items:center">
          <div><b>${esc(n.title)}</b> <span class="muted">${esc(n.date)} · ${esc(n.tag || '')}</span></div>
          <div style="white-space:nowrap">
            <button class="btn btn-ghost btn-sm" data-edit-note="${esc(n.id)}">Редактировать</button>
            <button class="btn btn-danger btn-sm" data-del-note="${esc(n.id)}">Удалить</button>
          </div>
        </div>`).join('') || '<p class="muted">Пусто.</p>'}`;

    $('#n-save').addEventListener('click', () => {
      const rec = {
        id: $('#n-id').value || 'n' + Date.now(),
        date: $('#n-date').value || new Date().toISOString().slice(0, 10),
        tag: $('#n-tag').value.trim() || 'патч',
        title: $('#n-title').value.trim(),
        text: $('#n-text').value.trim(),
      };
      if (!rec.title) return setStatus('Заголовок обязателен', 'err');
      const i = window.state.notes.findIndex(x => x.id === rec.id);
      if (i >= 0) window.state.notes[i] = rec; else window.state.notes.push(rec);
      renderNotesEditor();
      rerenderSite();
      setStatus('Запись сохранена в черновик. Нажмите «💾 Сохранить (коммит)», чтобы отправить на сайт.', 'ok');
    });
    $('#n-new').addEventListener('click', () => { editNoteId = null; renderNotesEditor(); });

    $('#adm-edit').querySelectorAll('[data-edit-note]').forEach(b =>
      b.addEventListener('click', () => {
        const n = window.state.notes.find(x => x.id === b.dataset.editNote);
        if (!n) return;
        editNoteId = n.id; renderNotesEditor();
        $('#n-date').value = n.date; $('#n-tag').value = n.tag || ''; $('#n-title').value = n.title; $('#n-text').value = n.text;
      }));
    $('#adm-edit').querySelectorAll('[data-del-note]').forEach(b =>
      b.addEventListener('click', () => {
        window.state.notes = window.state.notes.filter(x => x.id !== b.dataset.delNote);
        renderNotesEditor(); rerenderSite();
        setStatus('Удалено из черновика. Не забудьте коммит.', 'ok');
      }));
  }

  function renderHeroesEditor() {
    const heroes = window.state.heroes;
    $('#adm-edit').innerHTML = `
      <div class="admin-toolbar">
        <button class="btn btn-sm" id="h-add">➕ Добавить героя</button>
        <span class="muted" style="font-size:13px">Правьте поля прямо в строках, затем «💾 Сохранить (коммит)».</span>
      </div>
      <div class="hero-edit-list"></div>`;

    const list = $('#adm-edit .hero-edit-list');
    const rowHTML = (h) => `
      <div class="hero-edit-row" data-id="${esc(h.id)}">
        <input data-f="name" value="${esc(h.name)}" placeholder="Имя">
        <input data-f="role" value="${esc(h.role)}" placeholder="Роль">
        <input data-f="avatar" value="${esc(h.avatar)}" placeholder="URL аватарки">
        <input data-f="color" value="${esc(h.color || '#ff7a1a')}" placeholder="Цвет (hex)">
        <button class="btn btn-danger btn-sm" data-del="${esc(h.id)}">✕</button>
        <textarea data-f="desc" style="grid-column:1/-1;min-height:60px" placeholder="Описание на карточке">${esc(h.desc)}</textarea>
        <label class="muted" style="font-size:11px">Урон оружия</label>
        <input data-f="weaponDamage" type="number" step="0.1" value="${h.stats?.weaponDamage ?? ''}">
        <label class="muted" style="font-size:11px">Темп стрельбы</label>
        <input data-f="fireRate" type="number" step="0.05" value="${h.stats?.fireRate ?? ''}">
        <label class="muted" style="font-size:11px">Здоровье</label>
        <input data-f="health" type="number" value="${h.stats?.health ?? ''}">
        <label class="muted" style="font-size:11px">Скорость</label>
        <input data-f="moveSpeed" type="number" step="0.1" value="${h.stats?.moveSpeed ?? ''}">
      </div>`;

    list.innerHTML = heroes.map(rowHTML).join('') || '<p class="muted">Пока ни одного героя.</p>';

    $('#h-add').addEventListener('click', () => {
      window.state.heroes.push({ id: 'h' + Date.now(), name: 'Новый герой', role: '', avatar: '', color: '#ff7a1a', desc: '', stats: { weaponDamage: 6, fireRate: 1, health: 600, moveSpeed: 6.8 } });
      renderHeroesEditor();
    });
    list.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', () => {
      window.state.heroes = window.state.heroes.filter(h => h.id !== b.dataset.del);
      renderHeroesEditor();
    }));
  }

  function renderBuildsEditor() {
    const builds = window.state.builds;
    const heroOpts = (cur) => window.state.heroes.map(h => `<option value="${esc(h.id)}" ${h.id === cur ? 'selected' : ''}>${esc(h.name)}</option>`).join('');
    $('#adm-edit').innerHTML = `
      <div class="admin-toolbar">
        <button class="btn btn-sm" id="b-add">➕ Добавить билд</button>
        <span class="muted" style="font-size:13px">Предметы — через запятую.</span>
      </div>
      ${builds.map((b, i) => `
        <div class="editor-form" data-bi="${i}">
          <div style="display:grid;grid-template-columns:200px 1fr;gap:8px">
            <div><label>Герой</label><select data-f="hero">${heroOpts(b.hero)}</select></div>
            <div><label>Название билда</label><input data-f="title" value="${esc(b.title)}"></div>
            <div style="grid-column:1/-1"><label>Предметы (через запятую)</label><textarea data-f="items" style="min-height:50px">${esc(b.items)}</textarea></div>
            <div style="grid-column:1/-1"><label>Описание / как играть</label><textarea data-f="desc">${esc(b.desc)}</textarea></div>
            <div style="grid-column:1/-1"><label>Метки</label><input data-f="tags" value="${esc(b.tags || '')}"></div>
          </div>
          <div style="margin-top:10px"><button class="btn btn-danger btn-sm" data-delb="${i}">Удалить билд</button></div>
        </div>`).join('') || '<p class="muted">Пусто.</p>'}`;

    $('#b-add').addEventListener('click', () => {
      window.state.builds.push({ id: 'b' + Date.now(), hero: window.state.heroes[0]?.id || '', title: 'Новый билд', items: '', desc: '', tags: '' });
      renderBuildsEditor();
    });
    $('#adm-edit').querySelectorAll('[data-delb]').forEach(b => b.addEventListener('click', () => {
      window.state.builds.splice(parseInt(b.dataset.delb, 10), 1);
      renderBuildsEditor();
    }));
  }

  // ---------- сборка и коммит ----------
  function collectHeroes() {
    return $('#adm-edit').querySelectorAll('.hero-edit-row').length ? [...$('#adm-edit').querySelectorAll('.hero-edit-row')].map(row => {
      const id = row.dataset.id;
      const prev = window.state.heroes.find(h => h.id === id) || {};
      const st = {};
      row.querySelectorAll('input[type=number]').forEach(inp => st[inp.dataset.f] = parseFloat(inp.value) || 0);
      const name = row.querySelector('[data-f=name]').value.trim();
      return {
        id, name,
        role: row.querySelector('[data-f=role]').value.trim(),
        avatar: row.querySelector('[data-f=avatar]').value.trim(),
        color: row.querySelector('[data-f=color]').value.trim(),
        desc: row.querySelector('[data-f=desc]').value.trim(),
        stats: { ...prev.stats, ...st },
      };
    }) : window.state.heroes;
  }

  function collectBuilds() {
    return [...$('#adm-edit').querySelectorAll('[data-bi]')].map((form) => {
      const i = parseInt(form.dataset.bi, 10);
      const base = window.state.builds[i] || { id: 'b' + Date.now() };
      const g = (f) => form.querySelector(`[data-f=${f}]`).value;
      return { ...base, hero: g('hero'), title: g('title').trim(), items: g('items'), desc: g('desc').trim(), tags: g('tags').trim() };
    });
  }

  async function commit() {
    setStatus('Коммит…');
    const note = { note: 'Редактируется через админку сайта', updatedAt: new Date().toISOString().slice(0, 10) };
    try {
      if (dataset === 'patchnotes') {
        await putFile(FILES.patchnotes, { ...note, notes: window.state.notes }, 'admin: обновлены новости/патчи');
      } else if (dataset === 'heroes') {
        const heroes = collectHeroes();
        await putFile(FILES.heroes, { ...note, heroes }, 'admin: обновлены карточки героев');
        window.state.heroes = heroes;
      } else {
        const builds = collectBuilds();
        await putFile(FILES.builds, { ...note, builds }, 'admin: обновлены билды');
        window.state.builds = builds;
      }
      rerenderSite();
      setStatus('Сохранено! Сайт обновится через 1–3 минуты (GitHub Pages).', 'ok');
    } catch (e) {
      setStatus('Ошибка: ' + e.message, 'err');
    }
  }

  function rerenderSite() {
    if (window.renderNews) window.renderNews();
    if (window.renderBuilds) window.renderBuilds();
    // heroes перерисуются через app.js, если он экспортирует рендер; для простоты — reload флеш не делаем:
    if (window.renderHeroesGrid) window.renderHeroesGrid();
    window.DPS?.update();
  }

  loadCfg();
  return { render };
})();
