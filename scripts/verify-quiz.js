// Проверка квиза «Угадай героя»: старт, верный ответ, неверный, экран серии, рекорды
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  let batch = null;
  page.on("response", async (res) => {
    if (res.url().includes("/api/quiz")) {
      try { batch = await res.json(); } catch {}
    }
  });

  await page.goto("http://localhost:3000/#tools", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  // 1. Открыть квиз
  await page.locator('button:has-text("Квиз «Угадай героя»")').first().click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: "/tmp/render/qz-intro.png" });
  console.log("1. Интро открыт");

  // 2. Начать игру
  await page.locator(".qz-start").click();
  await page.waitForSelector(".qz-opts button", { timeout: 15000 });
  await page.waitForTimeout(400);
  if (!batch || !batch.questions) throw new Error("батч /api/quiz не перехвачен");
  console.log(`2. Игра пошла: ${batch.questions.length} вопросов, банк ${JSON.stringify(batch.bank)}`);

  // 3. Верные ответы: кликаем по правильному варианту (имя из ответа API)
  const correctStreak = 2;
  for (let i = 0; i < correctStreak; i++) {
    const q = batch.questions[i];
    const ans = q.options.find((o) => o.id === q.answerId);
    await page.locator(`.qz-opt:has-text("${ans.nameRu || ans.name}")`).first().click();
    await page.waitForTimeout(300);
    const hasCorrect = (await page.locator(".qz-opt.correct").count()) > 0;
    console.log(`3.${i} верный ответ «${ans.nameRu || ans.name}» — подсветка correct: ${hasCorrect}`);
    await page.screenshot({ path: `/tmp/render/qz-right-${i}.png` });
    await page.waitForTimeout(900); // ждём автопереход
  }
  const streakTxt = await page.locator(".qz-streak b").first().textContent();
  console.log(`4. HUD серия = ${streakTxt} (ожидал ${correctStreak})`);
  if (Number(streakTxt) !== correctStreak) throw new Error("серия не выросла");

  // 4. Неверный ответ — первый не-правильный вариант
  const q3 = batch.questions[correctStreak];
  const wrong = q3.options.find((o) => o.id !== q3.answerId);
  await page.locator(`.qz-opt:has-text("${wrong.nameRu || wrong.name}")`).first().click();
  await page.waitForTimeout(300);
  const wrongShown = (await page.locator(".qz-opt.wrong").count()) > 0;
  const correctShown = (await page.locator(".qz-opt.correct").count()) > 0;
  console.log(`5. Неверный: wrong=${wrongShown}, правильный подсвечен=${correctShown}`);
  await page.screenshot({ path: "/tmp/render/qz-wrong.png" });

  // 5. Экран серии
  await page.waitForSelector(".qz-over", { timeout: 6000 });
  const overNum = await page.locator(".qz-over-num").textContent();
  const recordVisible = (await page.locator(".qz-record").count()) > 0;
  console.log(`6. Экран серии: ${overNum}, значок нового рекорда: ${recordVisible}`);
  await page.screenshot({ path: "/tmp/render/qz-over.png" });

  // 6. Рекорды в localStorage
  const ls = await page.evaluate(() => ({
    day: localStorage.getItem("dl_quiz_best_day"),
    all: localStorage.getItem("dl_quiz_best_all"),
  }));
  console.log(`7. localStorage: day=${ls.day}, all=${ls.all}`);
  if (Number(ls.all) !== correctStreak) throw new Error("рекорд всё времени не сохранился");

  // 7. Поделиться (clipboard)
  await page.locator(".qz-share").click();
  await page.waitForTimeout(400);
  const toastOn = (await page.locator(".qz-toast.on").count()) > 0;
  console.log(`8. Тост «скопировано»: ${toastOn}`);

  // 8. «Ещё раз» — новая игра
  await page.locator(".qz-start").click();
  await page.waitForSelector(".qz-opts button", { timeout: 15000 });
  console.log("9. «Ещё раз» — новая партия пошла");

  // 9. Мобильный вид
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: "/tmp/render/qz-mobile.png" });

  await browser.close();
  console.log("OK: квиз работает");
})();
