// Обход всех разделов сайта + полные скриншоты для ревью
const { chromium } = require("playwright");

const TABS = ["news", "heroes", "meta", "items", "leaderboard", "esports", "guides", "tools", "account"];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  for (const t of TABS) {
    await page.goto(`http://localhost:3000/#${t}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(4500); // данные раздела успевают прийти
    await page.screenshot({ path: `/tmp/render/tab-${t}.png`, fullPage: true });
    console.log("shot:", t);
  }
  await browser.close();
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
