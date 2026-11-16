// Репроверка: иконка на экране серии по центру + мобильный вид вопроса
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  let batch = null;
  page.on("response", async (res) => {
    if (res.url().includes("/api/quiz")) { try { batch = await res.json(); } catch {} }
  });

  await page.goto("http://localhost:3000/#tools", { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  await page.locator('button:has-text("Квиз «Угадай героя»")').first().click();
  await page.locator(".qz-start").click();
  await page.waitForSelector(".qz-opts button", { timeout: 15000 });

  // мобильный вид вопроса
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.locator(".qz-qbox").screenshot({ path: "/tmp/render/qz-mobile-q.png" });

  // ошибка → экран серии
  await page.setViewportSize({ width: 1440, height: 1000 });
  const q = batch.questions[0];
  const wrong = q.options.find((o) => o.id !== q.answerId);
  await page.locator(`.qz-opt:has-text("${wrong.nameRu || wrong.name}")`).first().click();
  await page.waitForSelector(".qz-over", { timeout: 6000 });
  await page.waitForTimeout(300);
  await page.locator(".qz-over").screenshot({ path: "/tmp/render/qz-over2.png" });
  const box = await page.locator(".qz-over > svg").boundingBox();
  const parent = await page.locator(".qz-over").boundingBox();
  const offL = box.x - parent.x, offR = (parent.x + parent.width) - (box.x + box.width);
  console.log("иконка: слева", offL.toFixed(1), "справа", offR.toFixed(1), Math.abs(offL - offR) < 3 ? "OK по центру" : "FAIL");
  await browser.close();
})();
