const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  await page.goto("http://localhost:3000/#home", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(3500); // ждём появления VK-плеера (1.2s задержка) и данных

  // геометрия: где заканчивается видео-блок и где начинается рулетка
  const geo = await page.evaluate(() => {
    const hero = document.querySelector(".hero-video-dl");
    const rl = document.querySelector(".rl");
    const stats = document.querySelectorAll("main .grid.grid-cols-2 > div").length;
    const heroRect = hero?.getBoundingClientRect();
    const rlRect = rl?.getBoundingClientRect();
    return {
      statsCards: stats,
      heroBottom: heroRect ? Math.round(heroRect.bottom + window.scrollY) : null,
      rlTop: rlRect ? Math.round(rlRect.top + window.scrollY) : null,
      heroHeight: heroRect ? Math.round(heroRect.height) : null,
    };
  });
  console.log("geometry:", JSON.stringify(geo));
  if (geo.heroBottom != null && geo.rlTop != null) {
    console.log("video bottom vs roulette top gap:", geo.rlTop - geo.heroBottom, "px (ожидается ~0)");
  }

  await page.screenshot({ path: "/tmp/render/hero-extended.png" });

  // мобильная проверка: видео скрыто, вёрстка не поехала
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: "/tmp/render/hero-extended-mobile.png" });

  await browser.close();
  console.log("DONE");
})().catch((e) => { console.error(e); process.exit(1); });
