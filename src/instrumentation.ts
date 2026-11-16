/**
 * Next.js instrumentation: стартует планировщик синхронизации
 * в nodejs-рантайме сервера. Клиентская сборка не затрагивается.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
  }
}
