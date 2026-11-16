// E2E-тест рулетки билдов: крутка героя -> билд -> режимы -> переролл -> код в игру.
// Запуск: bun run scripts/test-build-ui.ts
import { chromium } from "playwright";
import { decodeBuildCode } from "../src/lib/buildroll";

const BASE = "http://localhost:3000";

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  // 1. крутим героя
  const spinBtn = page.locator(".rl-spin");
  await spinBtn.waitFor({ state: "visible", timeout: 15000 });
  await spinBtn.click();
  await page.locator(".rl-result.show").waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(1200);
  const heroName = await page.locator(".rl-result .rl-info h3").first().innerText();
  console.log("hero:", heroName.replace(/\n.*/s, "").trim());

  // 2. крутим билд
  const bspin = page.locator(".rl-bspin");
  await bspin.waitFor({ state: "visible", timeout: 10000 });
  await bspin.click();
  await page.waitForTimeout(4200); // конец анимации слотов

  const slots = await page.locator(".rl-bslots .rl-slot").count();
  const filled = await page.locator(".rl-bslots .rl-slot.stop").count();
  const names = await page.locator(".rl-bslots .rl-slot-name").allInnerTexts();
  console.log("slots:", slots, "| filled:", filled);
  console.log("items:", names.filter((n) => n && n !== "—").length);
  if (slots !== 12 || filled !== 12) throw new Error("слоты не заполнены");

  // 3. порядок прокачки
  const skills = await page.locator(".rl-skill").count();
  const laneTxt = await page.locator(".rl-lane").innerText().catch(() => "");
  console.log("skill steps:", skills, "| lane:", laneTxt.trim());
  if (skills !== 16) throw new Error("прокачка не 16 шагов: " + skills);

  // 4. код билда: копируем и декодируем
  const codeBtn = page.locator(".rl-code");
  await codeBtn.click();
  await page.waitForTimeout(600);
  const toast = await page.locator(".rl-toast").innerText().catch(() => "(нет тоста)");
  console.log("toast:", toast);
  const code = await page.evaluate(() => navigator.clipboard.readText());
  console.log("code len:", code.length, "| head:", code.slice(0, 24));
  const dec = decodeBuildCode(code);
  console.log("decoded: heroId =", dec.heroId, "| items =", dec.items.length, "| changes =", dec.changes.length, "| name =", dec.name);
  if (dec.items.length !== 12) throw new Error("в коде не 12 предметов");
  if (dec.changes.length !== 16) throw new Error("в коде не 16 шагов прокачки");
  // все item_id настоящие числа
  if (dec.items.some((x) => !Number.isFinite(x) || x <= 0)) throw new Error("битные item_id");

  // 5. смена режима: «Поровну» — билд перекручивается, в каждом слоте своя категория
  await page.locator('.rl-seg button:has-text("Поровну")').click();
  await page.waitForTimeout(4200);
  const titles2 = await page.locator(".rl-bslots .rl-slot").evaluateAll((els) => els.map((e) => e.getAttribute("title") || ""));
  console.log("после «Поровну»:", titles2.slice(0, 3));
  if (titles2.filter((t) => t.includes("нажми, чтобы перекрутить")).length !== 12) throw new Error("после смены режима слоты не перезаполнились");

  // 6. переролл одного слота (тап по слоту 0)
  const before = titles2[0];
  await page.locator(".rl-bslots .rl-slot").first().click();
  await page.waitForTimeout(900);
  const after = (await page.locator(".rl-bslots .rl-slot").first().getAttribute("title")) || "";
  console.log("переролл слота 1:", before.slice(0, 40), "->", after.slice(0, 40));
  if (after === before) console.log("  (предмет не поменялся — допустимо, тот же предмет перероллится редко)");

  // 7. блок «Как вставить?»
  await page.locator(".rl-howbtn").click();
  await page.waitForTimeout(300);
  const how = await page.locator(".rl-how ol li").count();
  console.log("how-to steps:", how);
  if (how !== 5) throw new Error("в инструкции не 5 шагов");

  // 8. бегущая строка: 85s
  const marquee = await page.evaluate(() => {
    const el = document.querySelector(".marquee-dl");
    return el ? getComputedStyle(el).animationDuration : "(нет)";
  });
  console.log("marquee duration:", marquee);
  if (marquee !== "85s") throw new Error("бегущая строка не 85s: " + marquee);

  // скриншот рулетки билда
  const block = page.locator(".rl-buildroll");
  await block.screenshot({ path: "/tmp/render/build-roulette.png" });
  await page.screenshot({ path: "/tmp/render/roulette-full.png", fullPage: false });

  console.log("page errors:", errors.length ? errors : "нет");
  await browser.close();
  console.log("UI TEST PASSED");
}

main().catch((e) => {
  console.error("UI TEST FAILED:", e);
  process.exit(1);
});
