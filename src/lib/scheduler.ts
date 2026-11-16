/**
 * Планировщик автоматической синхронизации Deadlock//RU.
 * Стартует вместе с сервером (см. src/instrumentation.ts) и крутит задачи по расписанию:
 *   онлайн — каждые 10 мин · лидерборды — 30 мин · патчи — 60 мин ·
 *   винрейты — 2 ч · контрпики/билды — 6 ч · каталог/ранги — 24 ч.
 * При пустой базе выполняет полный bootstrap-цикл.
 */
import { isBootstrapped, markBootstrapped, runTask, TASK_META, type TaskName } from "@/lib/sync";

type IntervalKey = Exclude<TaskName, "all" | "esports-seed">;

const SCHEDULE: { task: IntervalKey; everyMs: number; firstDelayMs: number }[] = [
  { task: "online", everyMs: 10 * 60_000, firstDelayMs: 20_000 },
  { task: "leaderboard", everyMs: 30 * 60_000, firstDelayMs: 35_000 },
  { task: "patches", everyMs: 60 * 60_000, firstDelayMs: 70_000 },
  { task: "stats", everyMs: 2 * 60 * 60_000, firstDelayMs: 90_000 },
  { task: "counters", everyMs: 6 * 60 * 60_000, firstDelayMs: 120_000 },
  { task: "extras", everyMs: 6 * 60 * 60_000, firstDelayMs: 150_000 },
  { task: "ranks", everyMs: 24 * 60 * 60_000, firstDelayMs: 180_000 },
  { task: "catalog", everyMs: 24 * 60 * 60_000, firstDelayMs: 200_000 },
];

const g = globalThis as unknown as { __dlSchedulerStarted?: boolean };

async function runSafely(task: IntervalKey) {
  const startedAt = Date.now();
  try {
    const res = await runTask(task);
    console.log(`[scheduler] ${task}: ok, ${res.records} записей за ${Date.now() - startedAt} мс`);
  } catch (e) {
    console.error(`[scheduler] ${task}: ошибка —`, e instanceof Error ? e.message : e);
  }
}

export function startScheduler() {
  if (g.__dlSchedulerStarted) return;
  g.__dlSchedulerStarted = true;
  console.log("[scheduler] запущен — задачи:", SCHEDULE.map((s) => `${s.task}/${Math.round(s.everyMs / 60000)}м`).join(", "));

  // Bootstrap: если база пуста — сразу гоняем полный цикл
  (async () => {
    try {
      await new Promise((r) => setTimeout(r, 8_000)); // даём серверу и Prisma подняться
      if (!(await isBootstrapped())) {
        console.log("[scheduler] база пуста — первичная синхронизация (bootstrap)...");
        await runTask("all");
        await markBootstrapped();
        console.log("[scheduler] bootstrap завершён");
      }
    } catch (e) {
      console.error("[scheduler] bootstrap:", e instanceof Error ? e.message : e);
    }
  })();

  for (const s of SCHEDULE) {
    setTimeout(() => {
      runSafely(s.task);
      const timer = setInterval(() => runSafely(s.task), s.everyMs);
      if (typeof timer.unref === "function") timer.unref();
    }, s.firstDelayMs);
  }
}

export { TASK_META };
