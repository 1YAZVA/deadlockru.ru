// ===== Рулетка «Кем играть?» — Deadlock//RU =====
// Самодостаточный блок на главной: карусель аватарок в стиле «кейса»,
// тикающий звук (WebAudio, без файлов), карточка героя с винрейтом и билдом,
// история круток (localStorage) и шеринг результата.
(function () {
  const ROOT_ID = 'roulette-root';
  const LS_HISTORY = 'dl_roulette_history';
  const LS_SOUND = 'dl_roulette_sound';
  const CARD_W = 84, GAP = 12, PITCH = CARD_W + GAP;
  const STRIP_LEN = 96;          // карточек в ленте одной крутки
  const TARGET_TAIL = 6;         // сколько карточек видно после победителя
  const DUR_FULL = 4800, DUR_REDUCED = 900;

  const root = document.getElementById(ROOT_ID);
  if (!root) return;

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtK = (n) => n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace('.0', '') + ' тыс.' : String(n);
  const store = {
    get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} }
  };

  // ---------- каркас ----------
  root.innerHTML = `
    <div class="rl" id="rl" aria-label="Рулетка героев">
      <div class="rl-head">
        <div>
          <h2 class="rl-title">Не знаешь, кем играть?</h2>
          <p class="rl-sub">Крути рулетку — выпадет случайный герой с винрейтом за месяц и готовой сборкой.</p>
        </div>
        <button class="rl-sound" id="rl-sound" type="button" title="Звук вкл/выкл" aria-label="Звук">🔊</button>
      </div>
      <div class="rl-frame" id="rl-frame">
        <div class="rl-strip" id="rl-strip"></div>
        <div class="rl-fade rl-left"></div>
        <div class="rl-fade rl-right"></div>
        <div class="rl-pointer" aria-hidden="true"><span></span><span></span></div>
      </div>
      <div class="rl-actions">
        <button class="rl-spin" id="rl-spin" type="button">🎲 Крутить рулетку</button>
        <button class="rl-share" id="rl-share" type="button" hidden>Поделиться результатом</button>
      </div>
      <div class="rl-result" id="rl-result"></div>
      <div class="rl-history" id="rl-history" hidden>
        <span class="rl-h-label">Выпадало сегодня:</span>
        <div class="rl-h-row" id="rl-h-row"></div>
      </div>
    </div>`;

  const $ = (id) => document.getElementById(id);
  const frame = $('rl-frame'), strip = $('rl-strip'), result = $('rl-result');
  const spinBtn = $('rl-spin'), shareBtn = $('rl-share');
  const historyBox = $('rl-history'), historyRow = $('rl-h-row');

  // ---------- звук (WebAudio, без файлов) ----------
  let ac = null, soundOn = store.get(LS_SOUND, '1') !== '0';
  const audio = () => { try { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); return ac; } catch { return null; } };
  function blip(freq, gain, dur, type, delay) {
    if (!soundOn) return; const a = audio(); if (!a) return;
    const t = a.currentTime + (delay || 0);
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'square'; o.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
  }
  const tick = () => blip(1750 + Math.random() * 250, 0.05, 0.045);
  const winChord = () => { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => blip(f, 0.07, 0.5, 'sine', i * 0.09)); };

  const soundBtn = $('rl-sound');
  const paintSound = () => { soundBtn.textContent = soundOn ? '🔊' : '🔇'; soundBtn.classList.toggle('off', !soundOn); };
  paintSound();
  soundBtn.addEventListener('click', () => { soundOn = !soundOn; store.set(LS_SOUND, soundOn ? '1' : '0'); paintSound(); if (soundOn) tick(); });

  // ---------- данные ----------
  let lastId = null, spinning = false;
  const heroesReady = () => (window.state?.heroes || []).length > 0;
  function waitData() {
    return new Promise((res) => {
      if (heroesReady()) return res();
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (heroesReady() || Date.now() - t0 > 15000) { clearInterval(iv); res(); }
      }, 120);
    });
  }

  const pickHero = () => {
    const hs = window.state.heroes;
    let h;
    do { h = hs[Math.floor(Math.random() * hs.length)]; } while (hs.length > 1 && h.id === lastId);
    return h;
  };
  const metaOf = (id) => window.state.meta?.heroes?.[id];
  // Valve переименовывал предметы («Hollow Point Ward» → «Hollow Point»,
  // «High-Velocity Mag» → «High Velocity Rounds»), а builds.json писался в разное
  // время — сопоставляем без пунктуации и по префиксу, иначе иконки терялись.
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-zа-я0-9]+/g, '');
  const itemIcon = (name) => {
    const want = String(name || '').trim();
    if (!want) return null;
    const items = window.state.items || [];
    const wn = norm(want);
    let it = items.find((x) => (x.name || '').toLowerCase() === want.toLowerCase()); // точное совпадение
    if (!it && wn) it = items.find((x) => norm(x.name) === wn); // то же без пунктуации
    if (!it && wn) {
      // старое/новое название Valve: сравниваем начало нормализованного имени
      // («highvelocitymag» → «High-Velocity Rounds»), берём самое длинное совпадение
      const key = wn.slice(0, 10);
      it = items
        .filter((x) => norm(x.name).indexOf(key) === 0)
        .sort((a, b) => norm(b.name).length - norm(a.name).length)[0];
    }
    return it?.icon || null;
  };
  const buildOf = (id) => (window.state.builds || []).find((b) => b.hero === id);

  // Предметы грузятся лениво (app.js: ensureItemsData, при первом открытии «Предметов»),
  // а рулетке билда нужен полный список — подгружаем по требованию.
  let itemsLoad = null;
  function ensureItems() {
    if ((window.state.items || []).length) return Promise.resolve();
    if (typeof window.ensureItemsData !== 'function') return Promise.resolve();
    return itemsLoad || (itemsLoad = window.ensureItemsData().catch(() => {}));
  }

  // ---------- лента ----------
  function cardHTML(h) {
    return `<div class="rl-card" style="--hc:${esc(h.color || '#C8A96A')}" data-id="${esc(h.id)}" title="${esc(h.name)}">
      <img src="${esc(h.avatar)}" alt="${esc(h.name)}" loading="lazy"
           onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${esc((h.name || '?').charAt(0))}'}))">
      <b>${esc(h.name)}</b>
    </div>`;
  }
  function buildStrip(targetId) {
    const hs = window.state.heroes;
    const targetIndex = STRIP_LEN - 1 - TARGET_TAIL;
    let targetPos = -1;
    const seq = [];
    for (let i = 0; i < STRIP_LEN; i++) {
      let h;
      if (i === targetIndex) { h = hs.find((x) => x.id === targetId); targetPos = i; }
      else {
        do { h = hs[Math.floor(Math.random() * hs.length)]; } while (seq[i - 1] && h.id === seq[i - 1].id);
      }
      seq.push(h);
    }
    strip.innerHTML = seq.map(cardHTML).join('');
    return targetPos;
  }

  // ---------- крутка ----------
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function spin() {
    if (spinning) return;
    if (!heroesReady()) { spinBtn.textContent = 'Загружаю героев…'; waitData().then(() => { spinBtn.textContent = '🎲 Крутить рулетку'; spin(); }); return; }
    if (!(window.state.items || []).length) {
      // предметы нужны карточке результата (иконки сборки) и рулетке билда
      spinBtn.textContent = 'Загружаю предметы…';
      ensureItems().then(() => { spinBtn.textContent = '🎲 Крутить рулетку'; spin(); });
      return;
    }
    spinning = true;
    spinBtn.disabled = true; spinBtn.classList.add('busy');
    audio(); // разблокируем звук жестом
    const hero = pickHero();
    lastId = hero.id;
    const targetPos = buildStrip(hero.id);
    const frameW = frame.clientWidth, center = frameW / 2;
    const xFor = (i) => center - (i * PITCH + CARD_W / 2);
    const startX = xFor(3);
    const jitter = (Math.random() - 0.5) * PITCH * 0.62;
    const endX = xFor(targetPos) + jitter;
    const dur = reduced ? DUR_REDUCED : DUR_FULL;
    const t0 = performance.now();
    let lastTickAt = 0, lastIdx = -1;
    strip.classList.add('moving');
    frame.classList.add('rolling');

    function step(now) {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 4); // easeOutQuart: резкий старт, долгое торможение
      const x = startX + (endX - startX) * e;
      strip.style.transform = `translate3d(${x}px,0,0)`;
      const idx = Math.round((center - CARD_W / 2 - x) / PITCH);
      if (idx !== lastIdx && now - lastTickAt > 26) { lastIdx = idx; lastTickAt = now; if (p < 0.99 && !reduced) tick(); }
      if (p < 1) requestAnimationFrame(step);
      else land(hero);
    }
    requestAnimationFrame(step);
  }

  // ---------- приземление ----------
  function land(hero) {
    spinning = false;
    spinBtn.disabled = false; spinBtn.classList.remove('busy');
    spinBtn.textContent = '🎲 Крутить ещё';
    strip.classList.remove('moving'); frame.classList.remove('rolling');
    const win = strip.querySelector(`.rl-card[data-id="${hero.id}"]`);
    if (win) { win.classList.add('won'); setTimeout(() => win.classList.remove('won'), 2400); }
    winChord();
    confetti(hero.color || '#C8A96A');
    showResult(hero);
    pushHistory(hero);
    shareBtn.hidden = false;
    shareBtn.dataset.text = shareText(hero);
  }

  function shareText(h, picks) {
    const m = metaOf(h.id);
    const wr = m ? ` (винрейт ${m.wr}%)` : '';
    const bld = picks && picks.length ? ` Рандом-билд: ${picks.map((p) => p.name).join(', ')}.` : '';
    return `🎲 Кем играть в Deadlock? Мне выпал ${h.name}${wr}.${bld} Крути тоже: https://deadlockru.ru/`;
  }

  function showResult(h) {
    const m = metaOf(h.id), bld = buildOf(h.id);
    const wrHTML = m
      ? `<span class="rl-wr ${m.wr > 51 ? 'up' : m.wr < 49 ? 'down' : ''}">${m.wr}% WR · ${fmtK(m.matches)} матчей/30д</span>`
      : `<span class="rl-wr">винрейт появится с обновлением мета-данных</span>`;
    const stats = h.stats ? [
      ['♥', 'health', ' HP'], ['⚔', 'weaponDamage', ' урон'], ['⏱', 'fireRate', '/с'], ['👟', 'moveSpeed', ' м/с']
    ].map(([ic, k, sfx]) => h.stats[k] != null ? `<span class="rl-stat">${ic} <b>${h.stats[k]}</b>${sfx}</span>` : '').join('') : '';
    const buildHTML = bld ? `
      <div class="rl-build">
        <span class="rl-b-title">Сборка: ${esc(bld.title)}</span>
        <div class="rl-b-items">${String(bld.items).split(',').slice(0, 8).map((n) => {
          const ic = itemIcon(n);
          return ic ? `<img src="${esc(ic)}" alt="${esc(n.trim())}" title="${esc(n.trim())}" loading="lazy">` : '';
        }).join('')}</div>
        <button class="rl-b-more" type="button" data-goto="builds">Все сборки →</button>
      </div>`
      : `<div class="rl-build none">Готовой сборки для героя пока нет — <button class="rl-b-more" type="button" data-goto="builds">посмотреть имеющиеся</button></div>`;
    const buildRollHTML = `
      <div class="rl-buildroll">
        <div class="rl-br-head">
          <span class="rl-b-title">🎰 Рулетка билда</span>
          <span class="rl-br-hint">12 случайных предметов, как в игре — тир и категория у каждого выпадают случайно</span>
        </div>
        <div class="rl-bslots" id="rl-bslots">${Array.from({ length: BUILD_SLOTS }, (_, i) => `
          <div class="rl-slot" data-i="${i}">
            <span class="rl-slot-tier">?</span>
            <span class="rl-slot-img"><span class="rl-slot-ph">?</span></span>
          </div>`).join('')}</div>
        <div class="rl-br-foot">
          <button class="rl-bspin" id="rl-bspin" type="button">🎲 Собрать случайный билд</button>
          <span class="rl-bcost" id="rl-bcost" hidden><i></i><b>0</b>&nbsp;душ за билд</span>
        </div>
      </div>`;
    result.innerHTML = `
      <article class="rl-res" style="--hc:${esc(h.color || '#C8A96A')}">
        <span class="rl-ava"><img src="${esc(h.avatar)}" alt="${esc(h.name)}"
          onerror="this.replaceWith(Object.assign(document.createElement('span'),{textContent:'${esc((h.name || '?').charAt(0))}'}))"></span>
        <div class="rl-info">
          <h3>${esc(h.name)} ${wrHTML}</h3>
          <span class="rl-role">${esc(h.role || '')}</span>
          <p>${esc(h.desc || '')}</p>
          <div class="rl-stats">${stats}</div>
          ${buildHTML}
          ${buildRollHTML}
        </div>
      </article>`;
    lastHero = h; lastPicks = null;
    result.classList.remove('show'); void result.offsetWidth; // перезапуск анимации
    result.classList.add('show');
  }

  // ---------- рулетка билда (случайные предметы, 12 слотов как в игре) ----------
  const BUILD_SLOTS = 12;
  const CAT_COLOR = { weapon: '#E08A3C', vitality: '#4CAD6D', spirit: '#8C6FD1' };
  let lastHero = null, lastPicks = null, building = false, swapTimer = null;
  const fmtNum = (n) => Number(n || 0).toLocaleString('ru-RU');

  function randomBuild() {
    const pool = (window.state.items || []).slice(); // полная случайность: любой тир, любая категория
    const out = [];
    while (out.length < BUILD_SLOTS && pool.length) {
      out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    return out;
  }

  async function spinBuild() {
    if (building || !lastHero) return;
    if (!(window.state.items || []).length) {
      // первый запуск до ленивой загрузки: подкачиваем предметы и крутим заново
      const btn0 = document.getElementById('rl-bspin');
      building = true;
      if (btn0) { btn0.disabled = true; btn0.textContent = 'Загружаю предметы…'; }
      await ensureItems();
      building = false;
      if (btn0) { btn0.disabled = false; btn0.textContent = '🎲 Собрать случайный билд'; }
      if ((window.state.items || []).length) spinBuild(); // предметы готовы — крутим
      return;
    }
    const items = window.state.items || [];
    if (!items.length) return;
    building = true;
    const btn = document.getElementById('rl-bspin');
    const cost = document.getElementById('rl-bcost');
    btn.disabled = true; btn.textContent = 'Кручу билд…';
    if (cost) cost.hidden = true;
    audio();
    const slots = [...document.querySelectorAll('#rl-bslots .rl-slot')];
    slots.forEach((s) => { s.classList.remove('stop'); s.classList.add('spin'); });
    const picks = randomBuild();

    const finish = () => {
      clearInterval(swapTimer); swapTimer = null;
      slots.forEach((s) => { s.classList.remove('spin'); s.classList.add('stop'); });
      picks.forEach((it, i) => {
        const s = slots[i]; if (!s) return;
        s.style.setProperty('--cat', CAT_COLOR[it.category] || '#C8A96A');
        const tb = s.querySelector('.rl-slot-tier'); if (tb) tb.textContent = 'Т' + it.tier;
        const img = s.querySelector('.rl-slot-img');
        if (img) img.innerHTML = `<img src="${esc(it.icon)}" alt="${esc(it.name)}" title="${esc(it.name)} · Т${it.tier} · ${fmtNum(it.cost)} душ">`;
      });
      const total = picks.reduce((a, p) => a + (Number(p.cost) || 0), 0);
      if (cost) { cost.hidden = false; cost.querySelector('b').textContent = fmtNum(total); }
      btn.disabled = false; btn.textContent = '🎲 Крутить ещё';
      building = false; lastPicks = picks;
      winChord();
      if (shareBtn && !shareBtn.hidden) shareBtn.dataset.text = shareText(lastHero, picks);
    };

    if (reduced) { finish(); return; } // без анимации — мгновенно

    // быстрое перелистывание предметов во всех слотах
    swapTimer = setInterval(() => {
      slots.forEach((s) => {
        const img = s.querySelector('.rl-slot-img');
        const it = items[Math.floor(Math.random() * items.length)];
        img.innerHTML = `<img src="${esc(it.icon)}" alt="">`;
      });
      blip(850 + Math.random() * 250, 0.015, 0.03);
    }, 85);

    // слоты останавливаются по очереди слева направо, каждый в цвет своей категории
    picks.forEach((it, i) => {
      setTimeout(() => {
        const s = slots[i]; if (!s) return;
        s.classList.remove('spin'); s.classList.add('stop');
        s.style.setProperty('--cat', CAT_COLOR[it.category] || '#C8A96A');
        const tb = s.querySelector('.rl-slot-tier'); if (tb) tb.textContent = 'Т' + it.tier;
        const img = s.querySelector('.rl-slot-img');
        img.innerHTML = `<img src="${esc(it.icon)}" alt="${esc(it.name)}" title="${esc(it.name)} · Т${it.tier} · ${fmtNum(it.cost)} душ">`;
        blip(500 + i * 80, 0.05, 0.2, 'triangle');
        if (i === picks.length - 1) setTimeout(finish, 300);
      }, 600 + i * 240);
    });
  }

  // ---------- конфетти ----------
  function confetti(color) {
    if (reduced) return;
    const colors = [color, '#C8A96A', '#E08A3C', '#8C6FD1', '#4CAD6D', '#E8E6E0'];
    for (let i = 0; i < 26; i++) {
      const s = document.createElement('span');
      s.className = 'rl-conf';
      s.style.cssText = `left:${45 + (Math.random() - 0.5) * 30}%;background:${colors[i % colors.length]};
        animation-duration:${1 + Math.random() * 0.8}s;animation-delay:${Math.random() * 0.15}s;
        transform:rotate(${Math.random() * 360}deg)`;
      $('rl').appendChild(s);
      s.addEventListener('animationend', () => s.remove());
    }
  }

  // ---------- история круток ----------
  function getHistory() { try { return JSON.parse(store.get(LS_HISTORY, '[]')) || []; } catch { return []; } }
  function pushHistory(h) {
    let ids = getHistory().filter((x) => x !== h.id);
    ids.unshift(h.id); ids = ids.slice(0, 8);
    store.set(LS_HISTORY, JSON.stringify(ids));
    paintHistory();
  }
  function paintHistory() {
    const ids = getHistory();
    const hs = window.state?.heroes || [];
    const items = ids.map((id) => hs.find((x) => x.id === id)).filter(Boolean);
    if (!items.length) return;
    historyBox.hidden = false;
    historyRow.innerHTML = items.map((h) => `
      <button class="rl-h-ava" type="button" data-id="${esc(h.id)}" title="${esc(h.name)} — показать карточку">
        <img src="${esc(h.avatar)}" alt="${esc(h.name)}" loading="lazy">
      </button>`).join('');
  }
  historyRow.addEventListener('click', (e) => {
    const b = e.target.closest('.rl-h-ava'); if (!b || spinning) return;
    const h = (window.state?.heroes || []).find((x) => x.id === b.dataset.id);
    if (h) showResult(h);
  });

  // ---------- шеринг ----------
  shareBtn.addEventListener('click', async () => {
    const text = shareBtn.dataset.text || '🎲 Кем играть в Deadlock? Крути рулетку: https://deadlockru.ru/';
    try {
      if (navigator.share) await navigator.share({ title: 'Deadlock//RU', text, url: 'https://deadlockru.ru/' });
      else { await navigator.clipboard.writeText(text); toast('Результат скопирован — вставь в чат друзьям ✅'); }
    } catch {}
  });
  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'rl-toast'; t.textContent = msg;
    $('rl').appendChild(t);
    setTimeout(() => t.classList.add('on'), 20);
    setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 300); }, 2600);
  }

  spinBtn.addEventListener('click', spin);
  result.addEventListener('click', (e) => { if (e.target.closest('#rl-bspin')) spinBuild(); });
  paintHistory();
})();
