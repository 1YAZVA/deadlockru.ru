/**
 * Обновление данных на GitHub Actions: поднимает серверный билд Next.js,
 * запускает все задачи синхронизации через /api/sync, ждёт их завершения,
 * снимает снапшоты всех GET-ответов в public/data/*.json (их коммитит воркфлоу).
 */
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const root = path.join(__dirname, "..");

process.env.DATABASE_URL = process.env.DATABASE_URL || "file:" + path.join(root, "db", "custom.db").replace(/\\/g, "/");
process.env.PORT = process.env.PORT || "3000";
process.env.NODE_ENV = "production";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = "http://localhost:" + process.env.PORT;

async function j(url, opts) {
  const res = await fetch(BASE + url, { cache: "no-store", ...opts });
  return { status: res.status, body: await res.json().catch(() => null) };
}

(async () => {
  const server = spawn("node", [path.join(".next", "standalone", "server.js")], {
    cwd: root, stdio: ["ignore", "inherit", "inherit"],
  });
  try {
    // ждём подъёма
    let up = false;
    for (let i = 0; i < 30 && !up; i++) {
      try { await j("/api/state"); up = true; } catch { await sleep(2000); }
    }
    if (!up) throw new Error("сервер не поднялся");
    console.log("server up");

    // какие задачи есть (из статуса /api/sync), исключая посев
    const st = await j("/api/sync");
    const tasks = Object.keys((st.body && st.body.tasks) || {}).filter((k) => k !== "esports-seed");
    console.log("tasks:", tasks.join(", "));

    // «all» запускает всё по очереди и ждёт завершения (может занять несколько минут)
    const r = await j("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: "all" }),
    });
    console.log("sync all ->", r.status, JSON.stringify(r.body).slice(0, 200));

    // страховка: ждём, пока ничего не выполняется (максимум 12 минут)
    for (let i = 0; i < 72; i++) {
      await sleep(10_000);
      const s = await j("/api/sync");
      const busy = Array.isArray(s.body && s.body.running) && s.body.running.length > 0;
      console.log("poll", i, busy ? "busy" : "idle");
      if (!busy) break;
    }

    // снапшоты
    delete require.cache[require.resolve("./snapshot-gh.cjs")];
    await require("./snapshot-gh.cjs");
    console.log("SYNC+SNAPSHOT DONE");
  } finally {
    server.kill();
    setTimeout(() => process.exit(0), 2000);
  }
})().catch((e) => { console.error("GH-SYNC ERROR:", e.message); process.exit(1); });
