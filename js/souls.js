// ---------- Души (фоновая анимация вкладки «Герои») ----------
// По референсу из игры: светящаяся «плазма» с тёмным ядром и вспышками-спицами,
// тянущая за собой извивающийся дымный хвост-хлыст + искры.
// Свои души — зелёные, вражеские — фиолетово-синие и янтарные.
(function () {
  'use strict';

  const PANE = '#tab-heroes';
  const SOULS_PER_SIDE = 7;             // по 7 душ слева и справа

  // палитры: [мягкий RGB], [глубокий RGB], вспышки, ядро-минус
  const PALETTES = {
    ally:   { soft: [64, 245, 168],  deep: [26, 160, 96],   flash: '#E7FFF2', dark: [8, 20, 15] },
    enemy:  { soft: [155, 122, 240], deep: [84, 58, 178],   flash: '#EFEAFF', dark: [12, 8, 22] },
    amber:  { soft: [255, 190, 92],  deep: [190, 120, 40],  flash: '#FFF3DC', dark: [24, 14, 6] }
  };

  let canvas, ctx, raf = null, running = false, sideW = 0;
  const souls = [];
  const sparks = [];
  const glitters = [];

  const rand = (a, b) => a + Math.random() * (b - a);

  function makeSoul(initial) {
    const side = Math.random() < 0.5 ? 0 : 1;
    const roll = Math.random();
    const kind = roll < 0.62 ? 'ally' : (roll < 0.87 ? 'enemy' : 'amber');
    const h = window.innerHeight;
    const lane = rand(18, Math.max(34, Math.min(sideW, 240) - 18));
    return {
      side, kind, pal: PALETTES[kind],
      laneX: lane,
      y: initial ? rand(-60, h) : h + rand(30, 320),
      r: kind === 'ally' ? rand(5, 9) : rand(7, 11),
      vy: kind === 'ally' ? rand(55, 95) : rand(38, 64),
      swayAmp: rand(9, 24),
      swayFreq: rand(0.25, 0.7),
      phase: rand(0, 60),
      spin: (Math.random() < 0.5 ? -1 : 1) * rand(1.4, 3.2),  // вихрь ядра
      pulse: rand(0.7, 1.5),                                  // частота вспышек
      alpha: initial ? rand(.5, .9) : 0,
      trail: [],
      hist: 0
    };
  }

  function spawnSpark(x, y, pal) {
    if (sparks.length > 110) return;
    sparks.push({
      x: x + rand(-8, 8), y: y + rand(-4, 18),
      vx: rand(-11, 11), vy: rand(8, 34),
      r: rand(0.8, 2.6), life: rand(0.5, 1.4), t: 0, pal
    });
  }

  function spawnGlitter(x, y, pal) {
    if (glitters.length > 30) return;
    glitters.push({ x, y, life: rand(0.3, 0.7), t: 0, pal, size: rand(2.5, 5) });
  }

  // -- хвост-хлыст: тёмный дым + светлое сердце внутри, каждая точка извивается --
  function drawTail(s, now, a) {
    const n = s.trail.length;
    if (n < 2) return;
    const [dsr, dsg, dsb] = s.pal.dark;   // дым (тёмный)
    const [sr, sg, sb] = s.pal.soft;      // свечение

    ctx.lineCap = 'round';
    for (let i = 1; i < n; i++) {
      const p0 = s.trail[i - 1], p1 = s.trail[i];
      const k = i / n;                                  // 0 у головы, 1 на конце
      const wob = Math.sin(now * 0.0035 + i * 0.5) * (0.5 + 1.8 * k) * s.r * 1.5;

      ctx.globalCompositeOperation = 'source-over';
      // дым (широкий тёмный, непрерывный)
      ctx.strokeStyle = `rgba(${dsr},${dsg},${dsb},${(0.5 * k * a).toFixed(3)})`;
      ctx.lineWidth = s.r * (1.6 - 0.9 * k);
      ctx.beginPath(); ctx.moveTo(p0.x + wob * 0.4, p0.y); ctx.lineTo(p1.x + wob, p1.y); ctx.stroke();

      ctx.globalCompositeOperation = 'lighter';
      // светлая жила внутри дыма
      ctx.strokeStyle = `rgba(${sr},${sg},${sb},${(0.62 * (1 - k) * a).toFixed(3)})`;
      ctx.lineWidth = s.r * 0.34;
      ctx.beginPath(); ctx.moveTo(p0.x + wob * 0.22, p0.y); ctx.lineTo(p1.x + wob * 0.55, p1.y); ctx.stroke();

      if (Math.random() < 0.004) spawnGlitter(p1.x + wob, p1.y, s.pal);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 1;
  }

  function drawSoul(s, now, dt) {
    const w = window.innerWidth, h = window.innerHeight;

    // движение
    s.y -= s.vy * dt;
    s.phase += dt;
    s.hist += dt;

    // появление / затухание наверху
    const fadeIn = Math.min(1, s.alpha + dt * 0.8);
    const fadeTop = Math.min(1, (s.y - h * 0.05) / (h * 0.12));
    const a = fadeIn * Math.max(0, Math.min(1, fadeTop));
    s.alpha = fadeIn;
    if (a <= 0.01) return;

    const sway = Math.sin(s.phase * s.swayFreq * Math.PI * 2) * s.swayAmp;
    const drift = Math.sin(now * 0.0004 + s.phase * 3) * 4;
    const px = (s.side === 0 ? s.laneX : w - s.laneX) + sway + drift;

    // копим точки хвоста (хвост тянется и слегка «отстаёт» вниз)
    if (s.hist > 0.045) {
      s.hist = 0;
      s.trail.push({ x: px, y: s.y + s.r * 0.8 });
      if (s.trail.length > 24) s.trail.shift();
    } else {
      for (const p of s.trail) p.y -= s.vy * dt * 0.55;
    }

    const [sr, sg, sb] = s.pal.soft;
    const [dr, dg, db] = s.pal.deep;
    const flicker = 1 + Math.sin(now * 0.021 * s.pulse + s.phase * 7) * 0.08; // трепет пламени
    const rr = s.r * flicker;

    // 1) хвост-хлыст
    drawTail(s, now, a);

    ctx.globalCompositeOperation = 'lighter';

    // 2) далёкий ореол
    let g = ctx.createRadialGradient(px, s.y, 0, px, s.y, rr * 6.5);
    g.addColorStop(0, `rgba(${dr},${dg},${db},${(0.26 * a).toFixed(3)})`);
    g.addColorStop(0.55, `rgba(${dr},${dg},${db},${(0.09 * a).toFixed(3)})`);
    g.addColorStop(1, `rgba(${dr},${dg},${db},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, s.y, rr * 6.5, 0, Math.PI * 2); ctx.fill();

    // 3) свечение тела
    g = ctx.createRadialGradient(px, s.y, 0, px, s.y, rr * 2.6);
    g.addColorStop(0, `rgba(${sr},${sg},${sb},${(0.6 * a).toFixed(3)})`);
    g.addColorStop(1, `rgba(${sr},${sg},${sb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, s.y, rr * 2.6, 0, Math.PI * 2); ctx.fill();

    // 4) вспышки-спицы: вращающиеся языки пламени вокруг ядра
    const spin = now * 0.001 * s.spin * s.pulse + s.phase * 2;
    const pulseW = 0.5 + 0.5 * Math.sin(now * 0.003 * s.pulse + s.phase);
    ctx.strokeStyle = `rgba(${sr},${sg},${sb},${(0.45 * a).toFixed(3)})`;
    ctx.lineWidth = rr * 0.24;
    for (let i = 0; i < 4; i++) {
      const ang = spin + (i * Math.PI) / 2;
      const len = rr * (1.2 + 0.8 * pulseW);
      const c = Math.cos(ang), sn = Math.sin(ang);
      ctx.beginPath();
      ctx.moveTo(px + c * rr * 0.75, s.y + sn * rr * 0.75);
      ctx.lineTo(px + c * len, s.y + sn * len);
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
    }

    // 5) крестовая вспышка на пике пульса
    if (pulseW > 0.93) {
      const fa = (pulseW - 0.93) / 0.07;
      ctx.strokeStyle = s.pal.flash;
      ctx.globalAlpha = 0.75 * fa * a;
      ctx.lineWidth = rr * 0.14;
      ctx.beginPath();
      ctx.moveTo(px - rr * 2.4, s.y); ctx.lineTo(px + rr * 2.4, s.y);
      ctx.moveTo(px, s.y - rr * 2.4); ctx.lineTo(px, s.y + rr * 2.4);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // 6) тело: яркая плазма с тёмным ядром-зрачком
    g = ctx.createRadialGradient(px, s.y, 0, px, s.y, rr * 1.35);
    g.addColorStop(0, `rgba(${s.pal.dark[0]},${s.pal.dark[1]},${s.pal.dark[2]},${(0.9 * a).toFixed(3)})`);   // тёмный зрачок
    g.addColorStop(0.55, `rgba(${sr},${sg},${sb},${(0.95 * a).toFixed(3)})`);                                  // плазма
    g.addColorStop(1, `rgba(${dr},${dg},${db},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, s.y, rr * 1.35, 0, Math.PI * 2); ctx.fill();

    // световая кайма поверх
    ctx.strokeStyle = `rgba(${Math.min(255,sr+110)},${Math.min(255,sg+90)},${Math.min(255,sb+70)},${(0.65 * a).toFixed(3)})`;
    ctx.lineWidth = rr * 0.16;
    ctx.beginPath(); ctx.arc(px, s.y, rr * 0.98, 0, Math.PI * 2); ctx.stroke();

    // 7) искры позади
    if (Math.random() < 0.3) spawnSpark(px + rand(-4, 4), s.y + rr, s.pal);

    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 1;
  }

  function drawSparks(dt) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.t += dt;
      if (p.t >= p.life) { sparks.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const k = 1 - p.t / p.life;
      ctx.fillStyle = `rgba(${p.pal.soft[0]},${p.pal.soft[1]},${p.pal.soft[2]},${(0.85 * k).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.2, p.r * k), 0, Math.PI * 2);
      ctx.fill();
    }
    // блики-глиттеры (крошечные звёздочки на хвостах)
    for (let i = glitters.length - 1; i >= 0; i--) {
      const p = glitters[i];
      p.t += dt;
      if (p.t >= p.life) { glitters.splice(i, 1); continue; }
      const k = 1 - p.t / p.life;
      const s2 = p.size * k;
      ctx.strokeStyle = p.pal.flash;
      ctx.globalAlpha = 0.6 * k;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(p.x - s2, p.y); ctx.lineTo(p.x + s2, p.y);
      ctx.moveTo(p.x, p.y - s2); ctx.lineTo(p.x, p.y + s2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function frame(now) {
    if (!running) return;
    const w = window.innerWidth, h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);
    const dt = Math.min(0.05, (now - (frame.prev || now)) / 1000);
    frame.prev = now;

    for (const s of souls) drawSoul(s, now, dt);
    drawSparks(dt);

    for (let i = 0; i < souls.length; i++) {
      if (souls[i].y < -80) souls[i] = makeSoul(false);
    }
    raf = requestAnimationFrame(frame);
  }

  function metrics() {
    const main = document.querySelector('main');
    if (!main) { sideW = 60; return; }
    const gap = (window.innerWidth - main.getBoundingClientRect().width) / 2;
    sideW = Math.max(50, Math.min(gap, 260));
  }

  function resize() {
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    metrics();
  }

  function start() {
    if (running || !canvas) return;
    const pane = document.querySelector(PANE);
    if (!pane || !pane.classList.contains('active')) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    running = true;
    canvas.style.opacity = '1';
    frame.prev = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    if (canvas) canvas.style.opacity = '0';
  }

  function init() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    canvas = document.createElement('canvas');
    canvas.id = 'souls-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);

    ctx = canvas.getContext('2d');
    resize();

    metrics();
    for (let i = 0; i < SOULS_PER_SIDE * 2; i++) {
      const s = makeSoul(true);
      s.side = i % 2;
      s.laneX = rand(18, Math.max(34, Math.min(sideW, 240) - 18));
      souls.push(s);
    }

    window.addEventListener('resize', resize);

    const pane = document.querySelector(PANE);
    if (pane && 'MutationObserver' in window) {
      new MutationObserver(() => {
        if (pane.classList.contains('active')) start(); else stop();
      }).observe(pane, { attributes: true, attributeFilter: ['class'] });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) stop(); else start();
      });
    }

    start();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
