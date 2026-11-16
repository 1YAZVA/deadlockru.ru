import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** История винрейтов всех героев — для анализа влияния патчей */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const hours = Math.min(720, Math.max(2, Number(url.searchParams.get("hours") ?? "168") || 168));
  const since = new Date(Date.now() - hours * 3600_000);

  const rows = await db.heroStatHistory.findMany({
    where: { at: { gte: since } },
    orderBy: { at: "asc" },
    select: { heroId: true, winRate: true, pickRate: true, matches: true, at: true },
  });

  const stamps = [...new Set(rows.map((r) => r.at.toISOString()))].sort();

  return NextResponse.json({
    stamps,
    points: rows.map((r) => ({ heroId: r.heroId, winRate: r.winRate, pickRate: r.pickRate, matches: r.matches, at: r.at })),
  });
}
