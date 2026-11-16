/**
 * Одноразовый прогон синка данных (для GitHub Actions).
 * Использует существующую логику src/lib/sync.ts — те же задачи, что и на сервере.
 * Запуск: DATABASE_URL="file:..." npx tsx scripts/run-sync.ts [all|catalog|stats|...]
 */
import { runTask } from "../src/lib/sync";
import { db } from "../src/lib/db";

async function main() {
  const task = (process.argv[2] ?? "all") as Parameters<typeof runTask>[0];
  const res = await runTask(task);
  console.log("sync ok:", JSON.stringify(res));
  await db.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("sync failed:", e);
    process.exit(1);
  });
