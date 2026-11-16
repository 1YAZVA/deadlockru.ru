const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 60000 });

  // прокрутка к футеру
  await page.evaluate(() => document.querySelector("footer")?.scrollIntoView({ block: "end" }));
  await page.waitForTimeout(1200);

  // 1. mailto-ссылки
  const mailtos = await page.$$eval('footer a[href^="mailto:"]', (as) =>
    as.map((a) => ({ href: a.getAttribute("href"), text: (a.textContent || "").trim().slice(0, 60) }))
  );
  console.log("mailto links in footer:", JSON.stringify(mailtos, null, 2));

  // 2. старый адрес нигде не отрендерился
  const oldCount = await page.$$eval("body", (els) => (els[0].innerText.match(/info@deadlockru/g) || []).length);
  console.log("old info@deadlockru occurrences on page:", oldCount);

  // 3. новый адрес виден
  const newCount = await page.$$eval("body", (els) => (els[0].innerText.match(/deadlockru\.ru@gmail\.com/g) || []).length);
  console.log("new deadlockru.ru@gmail.com occurrences on page:", newCount);

  // 4. иконка почты — третий кружок в соцряду
  const mailIcon = await page.$('footer a[aria-label="Почта — по всем вопросам"]');
  console.log("mail icon button present:", !!mailIcon);

  await page.screenshot({ path: "/tmp/render/footer-mail.png" });

  // мобильная ширина — проверка переноса
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => document.querySelector("footer")?.scrollIntoView({ block: "end" }));
  await page.waitForTimeout(800);
  await page.screenshot({ path: "/tmp/render/footer-mail-mobile.png" });

  await browser.close();
  console.log("OK");
})().catch((e) => { console.error(e); process.exit(1); });
