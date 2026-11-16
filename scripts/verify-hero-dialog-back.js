const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const dlgSel = '[role="dialog"][aria-modal="true"]';

  await page.goto("http://localhost:3000/#heroes", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(2500);

  // клик по первой карточке героя (button.card-dl внутри сетки)
  const card = page.locator("main button.card-dl").first();
  const cnt = await page.locator("main button.card-dl").count();
  console.log("hero cards found:", cnt);
  await card.click();
  await page.waitForTimeout(1500);
  const open = await page.evaluate((s) => !!document.querySelector(s), dlgSel);
  console.log("dialog opened:", open, "| hash:", await page.evaluate(() => location.hash));

  // BACK — диалог закрывается, вкладка остаётся
  await page.goBack();
  await page.waitForTimeout(900);
  const closed = await page.evaluate((s) => !document.querySelector(s), dlgSel);
  console.log("after BACK: dialog closed:", closed, "| hash:", await page.evaluate(() => location.hash));

  // FORWARD — диалог открывается снова
  await page.goForward();
  await page.waitForTimeout(1000);
  const reopened = await page.evaluate((s) => !!document.querySelector(s), dlgSel);
  console.log("after FORWARD: dialog reopened:", reopened);

  // закрытие по крестику не должно ломать историю
  await page.waitForTimeout(400);
  const closeBtn = await page.$('[role="dialog"] button[aria-label*="акрыть"], [role="dialog"] [class*="close"]');
  if (closeBtn) {
    await closeBtn.click();
    await page.waitForTimeout(900);
    const closed2 = await page.evaluate((s) => !document.querySelector(s), dlgSel);
    console.log("closed via X:", closed2, "| hash:", await page.evaluate(() => location.hash));
    // после X и назад — должны вернуться к предыдущей вкладке, не к чужому сайту
    await page.goBack();
    await page.waitForTimeout(900);
    console.log("after BACK from heroes: hash =", await page.evaluate(() => location.hash || "(none)"));
  } else {
    console.log("X button not found");
  }

  await browser.close();
  console.log("DONE");
})().catch((e) => { console.error(e); process.exit(1); });
