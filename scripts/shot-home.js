// Скриншот главной страницы для визуальной проверки обложки (видео + золотой заголовок)
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(9000); // даём данным, видео и рулетке прогрузиться
  await page.screenshot({ path: "/tmp/render/home-top.png" });
  // проверка вычисленных стилей заголовка
  const title = await page.evaluate(() => {
    const h1 = document.querySelector("h1");
    if (!h1) return null;
    const cs = getComputedStyle(h1);
    return { text: h1.textContent, color: cs.color, shadow: cs.textShadow, font: cs.fontFamily.slice(0, 40) };
  });
  console.log("H1:", JSON.stringify(title, null, 2));
  // позиция рулетки относительно обложки: видео должно заканчиваться до неё
  const geo = await page.evaluate(() => {
    const cover = document.querySelector(".hero-video-dl");
    const rl = document.querySelector(".rl");
    const h1 = document.querySelector("h1");
    const r = (el) => (el ? el.getBoundingClientRect().toJSON() : null);
    return { cover: r(cover), roulette: r(rl), h1: r(h1), scrollH: document.documentElement.scrollHeight };
  });
  console.log("GEO:", JSON.stringify(geo, null, 2));
  await browser.close();
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
