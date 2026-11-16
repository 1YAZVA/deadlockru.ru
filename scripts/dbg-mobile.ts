import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2200);
await page.locator(".rl-spin").click();
await page.waitForTimeout(1400);
await page.locator(".rl-bspin").click();
await page.waitForTimeout(4200);
// нет ли горизонтального скролла
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log("horizontal overflow px:", overflow);
const block = page.locator(".rl-buildroll");
await block.screenshot({ path: "/tmp/render/build-mobile.png" });
await browser.close();
console.log("done");
