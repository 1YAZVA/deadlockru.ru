const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const menuGo = async (label) => {
    await page.click('header button:has-text("Меню")');
    await page.waitForTimeout(250);
    await page.click(`[role="menu"] button:has-text("${label}")`);
    await page.waitForTimeout(900);
  };

  // ---------- 1. «Назад» по вкладкам ----------
  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);
  console.log("start hash:", await page.evaluate(() => location.hash || "(none)"));

  await menuGo("Герои");
  console.log("after Герои:", await page.evaluate(() => location.hash));
  await menuGo("Команды");
  console.log("after Команды:", await page.evaluate(() => location.hash));

  await page.goBack();
  await page.waitForTimeout(900);
  console.log("after BACK #1:", await page.evaluate(() => location.hash));
  await page.goBack();
  await page.waitForTimeout(900);
  console.log("after BACK #2:", await page.evaluate(() => location.hash || "(none)"));
  await page.goForward();
  await page.waitForTimeout(900);
  console.log("after FORWARD:", await page.evaluate(() => location.hash));

  // ---------- 2. Карточка героя: «Назад» закрывает диалог ----------
  // мы на #heroes — кликаем первую карточку героя
  await page.waitForTimeout(500);
  const dlgSel = '[role="dialog"][aria-modal="true"]';
  const card = await page.$("main article, main .hs-grid > div > button, main [class*='grid'] > div:first-child button");
  if (card) {
    await card.click();
    await page.waitForTimeout(1300);
    const open = await page.evaluate((s) => !!document.querySelector(s), dlgSel);
    console.log("hero dialog opened:", open, "| hash:", await page.evaluate(() => location.hash));
    await page.goBack();
    await page.waitForTimeout(900);
    const closed = await page.evaluate((s) => !document.querySelector(s), dlgSel);
    console.log("after BACK: dialog closed:", closed, "| hash:", await page.evaluate(() => location.hash));
  } else {
    console.log("hero card not found — шаг диалога пропущен");
  }

  // ---------- 3. Рулетка на главной: крутка → Свернуть → чип → вернуть ----------
  await page.goto("http://localhost:3000/#home", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2000);
  const rl = await page.$(".rl");
  if (!rl) throw new Error(".rl not found on home");
  await page.evaluate(() => document.querySelector(".rl")?.scrollIntoView({ block: "center" }));
  await page.waitForTimeout(600);

  const spinBtn = await page.$(".rl-spin");
  console.log("spin button found:", !!spinBtn);
  await spinBtn.click();
  await page.waitForTimeout(5800); // крутка 4.8s + запас

  const resultOpen = !!(await page.$(".rl-result .rl-res"));
  const collapseBtn = await page.$("button.rl-collapse:has-text('Свернуть')");
  const hOpen = await page.evaluate(() => Math.round(document.querySelector(".rl").getBoundingClientRect().height));
  console.log("result after spin:", resultOpen, "| Свернуть:", !!collapseBtn, "| .rl height:", hOpen, "px");
  await page.screenshot({ path: "/tmp/render/rl-open.png" });

  await collapseBtn.click();
  await page.waitForTimeout(800);
  const resultGone = !(await page.$(".rl-result .rl-res"));
  const chip = await page.$("button.rl-collapse:has-text('Последний результат')");
  const hClosed = await page.evaluate(() => Math.round(document.querySelector(".rl").getBoundingClientRect().height));
  console.log("after Свернуть: result gone:", resultGone, "| chip:", !!chip, "| height:", hOpen, "->", hClosed, "px");
  await page.screenshot({ path: "/tmp/render/rl-collapsed.png" });

  if (chip) {
    await chip.click();
    await page.waitForTimeout(800);
    const restored = !!(await page.$(".rl-result .rl-res"));
    console.log("after chip: result restored:", restored);
    await page.screenshot({ path: "/tmp/render/rl-restored.png" });
  }

  await browser.close();
  console.log("DONE");
})().catch((e) => { console.error(e); process.exit(1); });
