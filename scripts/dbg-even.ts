import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2200);
await page.locator(".rl-spin").click();
await page.waitForTimeout(1500);
await page.locator(".rl-bspin").click();
await page.waitForTimeout(4200);
await page.locator('.rl-seg button:has-text("Поровну")').click();
await page.waitForTimeout(4200);
// читаем категории из CSS-переменной --cat
const cats = await page.locator(".rl-bslots .rl-slot").evaluateAll((els) =>
  els.map((e) => {
    const c = getComputedStyle(e).getPropertyValue("--cat").trim();
    const map: Record<string, string> = { "#E08A3C": "weapon", "#8C6FD1": "spirit", "#4CAD6D": "vitality" };
    return map[c] || (c || "none");
  })
);
console.log("cats:", cats.join(","));
const cnt = { weapon: 0, spirit: 0, vitality: 0 };
for (const c of cats) if (c in cnt) cnt[c as keyof typeof cnt]++;
console.log("counts:", cnt);
await browser.close();
