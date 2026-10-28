// ---------- Души (фоновая анимация вкладки «Герои») ----------
// Свои души — зелёные (как после лайнового крипа), вражеские — фиолетово-синие.
// Многослойный рендер: ореол, пульсирующее кольцо, вращающаяся внутренняя
// энергия, яркое ядро и хвост-комета из затухающих следов + рой искр.
(function () {
  'use strict';

  const PANE = '#tab-heroes';
  const SOULS_PER_SIDE = 7;             // по 7 душ слева и справа
  const ENEMY_SHARE = 0.3;              // доля вражеских (фиолетовых) душ

  // палитры
  const PALETTES = {
    ally: {
      core: '#D8FFE8',
      soft: [110, 240, 160],   // rgb мягкого свечения
      deep: [32, 150, 90],     // rgb дальнего ореола
      spark: 'rgba(150,255,200,'
    },
    enemy: {
      core: '#ECE7FF',
      soft: [150, 120, 235],   // фиолетово-синий
      deep: [84, 60, 170],
      spark: 'rgba(200,180,255,'
    }
  };

  let canvas, ctx, raf = null, running = false, sideW = 0;
  const souls = [];
  const sparks = [];

  const rand = (a, b) => a + Math.random() * (b - a);

  function makeSoul(initial) {
    const side = Math.random() < 0.5 ? 0 : 1;
    const enemy = Math.random() < ENEMY_SHARE;
    const h = window.innerHeight;
    const lane = rand(18, Math.max(34, Math.min(sideW, 240) - 18));
    return {
      side, enemy, pal: enemy ? PALETTES.enemy : PALETTES.ally,
      laneX: lane,
      y: initial ? rand(-40, h) : h + rand(20, 300),
      r: enemy ? rand(7, 11) : rand(4.5, 8.5),          // вражеские чуть крупнее
      vy: enemy ? rand(16, 30) : rand(24, 46),
      swayAmp: rand(8, 22),
      swayFreq: rand(0.3, 0.75),
      phase: rand(0, 60),
      spin: rand(0.8, 2.4),                             // скорость внутреннего вихря
      pulse: rand(0.6, 1.4),                            // частота пульса кольца
      alpha: initial ? rand(.55, .95) : 0,
      trail: [],                                        // хвост-комета
      history: 0
    };
  }

  function spawnSpark(x, y, pal) {
    if (sparks.length > 90) return;
    sparks.push({
      x: x + rand(-7, 7), y: y + rand(-4, 16),
      vx: rand(-9, 9), vy: rand(6, 30),
      r: rand(0.7, 2.4), life: rand(0.6, 1.6), t: 0, pal
    });
  }

  function drawSoul(s, now, dt) {
    const w = window.innerWidth, h = window.innerHeight;

    // движение
    s.y -= s.vy * dt;
    s.phase += dt;
    s.history += dt;

    // появление / затухание
    const fadeIn = Math.min(1, s.alpha + dt * 0.8);
    const fadeTop = Math.min(1, (s.y - h * 0.05) / (h * 0.13));
    const a = fadeIn * Math.max(0, Math.min(1, fadeTop));
    s.alpha = fadeIn;
    if (a <= 0.01) return;

    const sway = Math.sin(s.phase * s.swayFreq * Math.PI * 2) * s.swayAmp;
    const drift = Math.sin(now * 0.0004 + s.phase * 3) * 4;
    const px = (s.side === 0 ? s.laneX : w - s.laneX) + sway + drift;

    // хвост-комета: копим следы
    if (s.history > 0.028) {
      s.history = 0;
      s.trail.push({ x: px, y: s.y + s.r * 0.6 });
      if (s.trail.length > 13) s.trail.shift();
    } else if (s.trail.length) {
      // след тоже «плывёт» вверх — правим за душой
      for (const p of s.trail) p.y -= s.vy * dt * 0.55;
    }

    const [sr, sg, sb] = s.pal.soft;
    const [dr, dg, db] = s.pal.deep;
    ctx.globalCompositeOperation = 'lighter';

    // 1) дальний ореол
    let g = ctx.createRadialGradient(px, s.y, 0, px, s.y, s.r * 7);
    g.addColorStop(0, `rgba(${dr},${dg},${db},${(0.30 * a).toFixed(3)})`);
    g.addColorStop(0.5, `rgba(${dr},${dg},${db},${(0.10 * a).toFixed(3)})`);
    g.addColorStop(1, `rgba(${dr},${dg},${db},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, s.y, s.r * 7, 0, Math.PI * 2); ctx.fill();

    // 2) среднее свечение
    g = ctx.createRadialGradient(px, s.y, 0, px, s.y, s.r * 3.2);
    g.addColorStop(0, `rgba(${sr},${sg},${sb},${(0.55 * a).toFixed(3)})`);
    g.addColorStop(1, `rgba(${sr},${sg},${sb},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, s.y, s.r * 3.2, 0, Math.PI * 2); ctx.fill();

    // 3) хвост-комета (позади и ниже)
    for (let i = 0; i < s.trail.length; i++) {
      const p = s.trail[i];
      const k = (i + 1) / s.trail.length;              // 0..1 к голове
      const rad = s.r * (0.16 + 0.7 * k);
      ctx.fillStyle = `rgba(${sr},${sg},${sb},${(0.35 * k * k * a).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, Math.PI * 2); ctx.fill();
    }

    // 4) пульсирующее кольцо
    const ringR = s.r * (2.1 + 0.25 * Math.sin(now * 0.002 * s.pulse + s.phase));
    ctx.strokeStyle = `rgba(${sr},${sg},${sb},${(0.28 * a).toFixed(3)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(px, s.y, ringR, 0, Math.PI * 2); ctx.stroke();

    // 5) внутренний вихрь: две дуги вращаются вокруг ядра
    const spin = now * 0.0016 * s.spin + s.phase;
    ctx.strokeStyle = `rgba(${sr},${sg},${sb},${(0.65 * a).toFixed(3)})`;
    ctx.lineWidth = s.r * 0.22;
    for (let k = 0; k < 2; k++) {
      const off = spin + k * Math.PI * 0.9;
      ctx.beginPath();
      ctx.arc(px, s.y, s.r * 1.05, off, off + Math.PI * 0.75);
      ctx.stroke();
    }

    // 6) ядро (яркое, почти белое)
    g = ctx.createRadialGradient(px, s.y, 0, px, s.y, s.r);
    g.addColorStop(0, s.pal.core);
    g.addColorStop(0.7, `rgba(${sr},${sg},${sb},${(0.95 * a).toFixed(3)})`);
    g.addColorStop(1, `rgba(${dr},${dg},${db},0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(px, s.y, s.r * 1.15, 0, Math.PI * 2); ctx.fill();

    // 7) искры
    if (Math.random() < 0.3) spawnSpark(px + rand(-4, 4), s.y + s.r, s.pal);

    ctx.globalCompositeOperation = 'source-over';
  }

  function drawSparks(dt) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.t += dt;
      if (p.t >= p.life) { sparks.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const k = 1 - p.t / p.life;
      ctx.fillStyle = p.pal.spark + (0.85 * k).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.2, p.r * k), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function frame(now) {
    if (!running) return;
    const h = window.innerHeight, w = window.innerWidth;
    ctx.clearRect(0, 0, w, h);
    const dt = Math.min(0.05, (now - (frame.prev || now)) / 1000);
    frame.prev = now;

    for (const s of souls) drawSoul(s, now, dt);
    drawSparks(dt);

    for (let i = 0; i < souls.length; i++) {
      if (souls[i].y < -60) souls[i] = makeSoul(false);
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
