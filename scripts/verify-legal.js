// Проверка юридического блока: 18+ в шапке и футере, модалка политики, атрибуция
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.goto("http://localhost:3000/#home", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // 1. Плашка 18+ в шапке
  const headerBadge = page.locator('header span[title="Возрастная категория 18+"]');
  console.log("1. 18+ в шапке:", (await headerBadge.count()) === 1 ? await headerBadge.textContent() : "FAIL");
  await page.screenshot({ path: "/tmp/render/legal-header.png", clip: { x: 0, y: 0, width: 1440, height: 60 } });

  // 2. Футер: скролл вниз
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(600);
  const footBadges = await page.locator('footer span[title="Возрастная категория 18+"]').count();
  const policyBtn = await page.locator('button:has-text("Политика конфиденциальности")').count();
  const liq = await page.locator('footer :text("Liquipedia (CC BY-SA)")').count();
  console.log(`2. 18+ в футере: ${footBadges}, ссылка политики: ${policyBtn}, атрибуция Liquipedia: ${liq}`);
  await page.locator("footer").screenshot({ path: "/tmp/render/legal-footer.png" });

  // 3. Модалка политики
  await page.locator('button:has-text("Политика конфиденциальности")').click();
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
  const sections = await page.locator('[role="dialog"] h3').count();
  const bodyLocked = await page.evaluate(() => document.body.style.overflow);
  console.log(`3. Модалка открыта: разделов ${sections}, скролл страницы заблокирован: ${bodyLocked}`);
  await page.screenshot({ path: "/tmp/render/legal-policy.png" });

  // 4. Esc закрывает
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const closed = (await page.locator('[role="dialog"]').count()) === 0;
  const unlocked = await page.evaluate(() => document.body.style.overflow === "");
  console.log(`4. Esc закрывает: ${closed}, скролл разблокирован: ${unlocked}`);

  // 5. Лицензия шрифтов отдаётся статикой
  const res = await page.request.get("http://localhost:3000/fonts/FONTS-LICENSE.txt");
  console.log("5. FONTS-LICENSE.txt:", res.status() === 200 ? "OK" : `FAIL ${res.status()}`);

  // 6. Мобильный вид футера
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  await page.screenshot({ path: "/tmp/render/legal-mobile.png" });

  await browser.close();
  console.log("OK: юрблок на месте");
})();
