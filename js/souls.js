// ---------- Души (фоновая анимация вкладки «Герои») ----------
// Светящиеся сферы, как души убитых криптов в Deadlock: всплывают снизу,
// слегка колышутся в полёте и тянут за собой рой мелких искр.
// Живут по бокам экрана (в «полях» рядом с контентом), за карточками.
(function () {
  'use strict';

  const PANE = '#tab-heroes';           // где живут души
  const SOULS_PER_SIDE = 7;             // по 7 душ слева и справа
  const GREEN = { core: '#C9FFDF', mid: 'rgba(76,230,138,', glow: 'rgba(46,196,110,' };

  let canvas, ctx, raf = null, running = false, sideW = 0, dpr = 1;
  const souls = [];
  const sparks = [];

  function rand(a, b) { return a + Math.random() * (b - a); }

  function makeSoul(initial) {
    const side = Math.random() < 0.5 ? 0 : 1;           // 0 = слева, 1 = справа
    const h = window.innerHeight;
    const w = window.innerWidth;
    const lane = rand(16, Math.max(32, Math.min(sideW, 240) - 16)); // линия внутри бокового поля
    const t = rand(0, 60);
    return {
      side,
      laneX: lane,
      y: initial ? rand(0, h) : h + rand(20, 260),
      r: rand(4.5, 9),                                  // радиус ядра
      vy: rand(22, 42),                                 // px/сек вверх
      swayAmp: rand(8, 22),                             // размах колыхания
      swayFreq: rand(0.35, 0.8),
      phase: t,
      alpha: initial ? rand(.5, .9) : 0,
      born: performance.now()
    };
  }

  function spawnSpark(x, y) {
    sparks.push({
      x: x + rand(-6, 6), y: y + rand(-4, 14),
      vx: rand(-8, 8), vy: rand(4, 26),
      r: rand(0.8, 2.2), life: rand(0.7, 1.5), t: 0
    });
  }

  function drawSoul(s, now, dt) {
    const w = window.innerWidth, h = window.innerHeight;
    s.y -= s.vy * dt;
    s.phase += dt;

    // появление снизу / исчезновение наверху
    const fadeIn = Math.min(1, s.alpha + dt * 0.8);
    const fadeTop = Math.min(1, (s.y - h * 0.06) / (h * 0.14)); // затухание у верхней кромки
    const a = fadeIn * Math.max(0, Math.min(1, fadeTop));
    s.alpha = fadeIn;

    // колыхание вокруг своей линии
    const sway = Math.sin(s.phase * s.swayFreq * Math.PI * 2) * s.swayAmp;
    const drift = Math.sin(now * 0.0004 + s.phase * 3) * 4; // медленный «поплавок»
    const px = (s.side === 0 ? s.laneX : w - s.laneX) + sway + drift;

    // след из искр
    if (Math.random() < 0.25) spawnSpark(px + rand(-3, 3), s.y + s.r);

    const g = ctx.createRadialGradient(px, s.y, 0, px, s.y, s.r * 4.5);
    g.addColorStop(0, GREEN.core);
    g.addColorStop(0.25, GREEN.mid + (0.9 * a) + ')');
    g.addColorStop(0.55, GREEN.glow + (0.35 * a) + ')');
    g.addColorStop(1, 'rgba(30,120,70,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, s.y, s.r * 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawSparks(dt) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.t += dt;
      if (p.t >= p.life) { sparks.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const k = 1 - p.t / p.life;
      ctx.globalAlpha = 0.5 * k;
      ctx.fillStyle = 'rgba(140,255,190,' + (0.7 * k).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * k, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function frame(now) {
    if (!running) return;
    const h = window.innerHeight, w = window.innerWidth;
    ctx.clearRect(0, 0, w, h);
    const dt = Math.min(0.05, (now - (frame.prev || now)) / 1000);
    frame.prev = now;

    for (const s of souls) drawSoul(s, now, dt);
    drawSparks(dt);

    // респавн: душа ушла за верх — рождаем внизу
    for (let i = 0; i < souls.length; i++) {
      if (souls[i].y < -30) souls[i] = makeSoul(false);
    }
    raf = requestAnimationFrame(frame);
  }

  function metrics() {
    // ширина бокового «поля»: зазор между краем экрана и контентом
    const main = document.querySelector('main');
    if (!main) { sideW = 60; return; }
    const gap = (window.innerWidth - main.getBoundingClientRect().width) / 2;
    sideW = Math.max(46, Math.min(gap, 260));
  }

  function resize() {
    if (!canvas) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
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

    // наполняем души: слева и справа поровну
    metrics();
    for (let i = 0; i < SOULS_PER_SIDE * 2; i++) {
      const s = makeSoul(true);
      s.side = i % 2;
      s.laneX = rand(16, Math.max(32, Math.min(sideW, 240) - 16));
      souls.push(s);
    }

    window.addEventListener('resize', resize);

    // активируем только на вкладке «Герои»
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
