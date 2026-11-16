import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runTask, TASKS, TASK_META, type TaskName } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const running = new Set<string>();

export async function GET() {
  const [last, logs] = await Promise.all([
    db.syncState.findMany(),
    db.syncLog.findMany({ orderBy: { at: "desc" }, take: 40 }),
  ]);
  const lastMap: Record<string, unknown> = {};
  for (const s of last) {
    if (s.key.startsWith("last_")) {
      try { lastMap[s.key.slice(5)] = JSON.parse(s.value); } catch { lastMap[s.key.slice(5)] = null; }
    }
  }
  return NextResponse.json({
    tasks: TASK_META,
    last: lastMap,
    running: [...running],
    logs: logs.map((l) => ({
      id: l.id, task: l.task, status: l.status, records: l.records,
      message: l.message, durationMs: l.durationMs, at: l.at,
    })),
  });
}

export async function POST(req: Request) {
  let body: { task?: string } = {};
  try {
    body = (await req.json()) as { task?: string };
  } catch {
    // пустое тело — запускаем «all»
  }
  const task = (body.task ?? "all") as TaskName;
  if (!TASKS.includes(task)) {
    return NextResponse.json({ ok: false, error: `неизвестная задача: ${task}` }, { status: 400 });
  }
  const lockKey = task;
  if (running.has(lockKey)) {
    return NextResponse.json({ ok: false, error: "задача уже выполняется" }, { status: 409 });
  }
  running.add(lockKey);
  try {
    const result = await runTask(task);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "ошибка синхронизации" }, { status: 500 });
  } finally {
    running.delete(lockKey);
  }
}
