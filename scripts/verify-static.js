/**
 * Проверка статической версии сайта (GitHub Pages-экспорт).
 * Сайт должен быть подан на http://localhost:8899 (python -m http.server -d out).
 * Проверяем: загрузка данных из статических JSON, все вкладки, рулетка, квиз,
 * отсутствие обращений к серверным роутам.
 */
const { chromium } = require("playwright");
const fs = require("fs");

const BASE = process.env.BASE || "http://localhost:8899";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

  const api404 = [];
  const apiCalls = new Set();
  page.on("response", (res) => {
    const url = res.url();
    if (url.includes("/api/") || url.includes("/img-mirror/")) {
      apiCalls.add(url.replace(BASE, ""));
      if (res.status() >= 400) api404.push(`${res.status()} ${url}`);
    }
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  const results = [];
  const ok = (name, cond, extra = "") => {
    results.push(`${cond ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
    if (!cond) process.exitCode = 1;
  };

  // 1) главная
  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 30000 });
  const heroCards = await page.locator("[data-tab-content], .container-dl").first().innerText().catch(() => "");
  const bodyText = await page.innerText("body");
  ok("главная открылась", bodyText.length > 500);
  ok("данные на главной (герои/стата)", /Deadlock/i.test(bodyText) && bodyText.length > 2000, `${bodyText.length} симв.`);

  // 2) вкладка мета
  await page.goto(BASE + "/#meta", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const metaText = await page.innerText("body");
  ok("мета-таблица загрузилась", /Винрейт|винрейт|Meta|Метa|Патч/i.test(metaText), "");

  // 3) лидерборд
  await page.goto(BASE + "/#leaderboard", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const lbText = await page.innerText("body");
  ok("лидерборд загрузился", /записей|Игрок|Игроков|Позиция|позиция/i.test(lbText), "");

  // 4) новости
  await page.goto(BASE + "/#news", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const newsText = await page.innerText("body");
  ok("новости загрузились", /Патч|патч|новост|Steam|Valve/i.test(newsText), "");

  // 5) квиз: старт партии
  await page.goto(BASE + "/#tools", { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const quizBtn = page.locator('button:has-text("Угадай героя")').first();
  if (await quizBtn.count()) {
    await quizBtn.click();
    await page.waitForTimeout(600);
    const start = page.locator('button:has-text("Начать")').first();
    if (await start.count()) {
      await start.click();
      await page.waitForTimeout(2500);
      const qz = await page.innerText("body");
      ok("квиз выдал вопрос", /Чья эта способность|Кто этот герой/i.test(qz), "");
    } else {
      ok("квиз старт-кнопка", false, "кнопка не найдена");
    }
  } else {
    ok("квиз-плитка на странице", false, "не найдена");
  }

  // 6) рулетка: кнопка «Крутить»
  await page.goto(BASE + "/#home", { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const rollBtn = page.locator('button:has-text("Крутить")').first();
  if (await rollBtn.count()) {
    await rollBtn.click();
    await page.waitForTimeout(4000);
    const home = await page.innerText("body");
    ok("рулетка крутится (результат/прокачка)", /Порядок прокачки|билд|Билд|Последний результат/i.test(home), "");
  } else {
    ok("кнопка рулетки", false, "не найдена");
  }

  // 7) серверных роутов не осталось: все /api/* должны быть .json или удалёнкой
  const badCalls = [...apiCalls].filter((u) => u.startsWith("/api/") && !u.endsWith(".json"));
  ok("все /api/* запросы ушли в .json", badCalls.length === 0, badCalls.slice(0, 3).join(" | "));
  ok("нет 4xx/5xx на данных", api404.length === 0, api404.slice(0, 3).join(" | "));
  ok("нет JS-ошибок на страницах", errors.length === 0, errors.slice(0, 2).join(" | "));

  console.log(results.join("\n"));
  console.log(`\napi/img запросов: ${apiCalls.size}`);

  fs.mkdirSync("/tmp/render", { recursive: true });
  await page.screenshot({ path: "/tmp/render/static-home.png" });
  await browser.close();
})();
