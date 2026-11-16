// Проверка: иконка звука рулетки отцентрована в кнопке (CSS-фикс .rl-sound)
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto("http://localhost:3000/#home", { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  const btn = page.locator(".rl-sound");
  await btn.waitFor({ state: "visible", timeout: 15000 });

  const m = await btn.evaluate((b) => {
    const svg = b.querySelector("svg");
    const rb = b.getBoundingClientRect();
    const rs = svg.getBoundingClientRect();
    return {
      btn: { w: rb.width, h: rb.height },
      svg: { w: rs.width, h: rs.height },
      offX: rs.left - rb.left,
      offY: rs.top - rb.top,
      gapRight: rb.right - rs.right,
      gapBottom: rb.bottom - rs.bottom,
    };
  });

  const cx = m.offX - m.gapRight; // 0 = по горизонтали центр
  const cy = m.offY - m.gapBottom; // 0 = по вертикали центр
  console.log("кнопка:", m.btn, "svg:", m.svg);
  console.log("отступ слева/сверху:", m.offX.toFixed(2), m.offY.toFixed(2), "справа/снизу:", m.gapRight.toFixed(2), m.gapBottom.toFixed(2));
  console.log("дисбаланс X:", cx.toFixed(2), "дисбаланс Y:", cy.toFixed(2));
  console.log(Math.abs(cx) <= 0.5 && Math.abs(cy) <= 0.5 ? "OK: иконка отцентрована" : "FAIL: иконка кривая");

  // Крупный скриншот кнопки для визуальной проверки
  await btn.screenshot({ path: "/tmp/render/rl-sound-btn.png" });
  await page.locator(".rl").screenshot({ path: "/tmp/render/rl-head.png" });

  // Выключенный звук — иконка VolumeX тоже по центру
  await btn.click();
  await page.waitForTimeout(300);
  const m2 = await btn.evaluate((b) => {
    const svg = b.querySelector("svg");
    const rb = b.getBoundingClientRect();
    const rs = svg.getBoundingClientRect();
    return { cx: rs.left - rb.left - (rb.right - rs.right), cy: rs.top - rb.top - (rb.bottom - rs.bottom) };
  });
  console.log("VolumeX дисбаланс X/Y:", m2.cx.toFixed(2), m2.cy.toFixed(2));
  await btn.screenshot({ path: "/tmp/render/rl-sound-off.png" });

  await browser.close();
})();
