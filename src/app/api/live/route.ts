import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cacheGet, cacheSet } from "@/lib/cache";

export const dynamic = "force-dynamic";

type ActiveMatch = {
  match_id: number;
  start_time: number;
  players: { account_id: number; team: number; hero_id: number; abandoned?: number | null }[];
};

export async function GET() {
  const cached = cacheGet<{ count: number; matches: { id: number; min: number; a: number[]; b: number[] }[] }>("active_matches");
  let active: { count: number; matches: { id: number; min: number; a: number[]; b: number[] }[] };
  if (cached) {
    active = cached;
  } else {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20_000);
      const res = await fetch("https://api.deadlock-api.com/v1/matches/active", {
        signal: ctrl.signal, cache: "no-store",
        headers: { "User-Agent": "DeadlockRU-portal/1.0" },
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = (await res.json()) as ActiveMatch[];
      const now = Date.now() / 1000;
      active = {
        count: raw.length,
        matches: raw.slice(0, 60).map((m) => ({
          id: m.match_id,
          min: Math.max(0, Math.round((now - m.start_time) / 60)),
          a: m.players.filter((p) => p.team === 0).map((p) => p.hero_id),
          b: m.players.filter((p) => p.team === 1).map((p) => p.hero_id),
        })),
      };
      cacheSet("active_matches", active, 60_000);
    } catch {
      active = { count: 0, matches: [] };
    }
  }

  const [online, history, states] = await Promise.all([
    db.onlinePoint.findFirst({ orderBy: { at: "desc" } }),
    db.onlinePoint.findMany({ orderBy: { at: "asc" }, take: 300 }),
    db.syncState.findMany({ where: { key: { in: ["online_live", "online_peak"] } } }),
  ]);

  // пик за 24 ч и запасное значение онлайна хранятся в SyncState (пишет задача online)
  const stateByKey = new Map(states.map((s) => [s.key, s]));
  const peakRaw = Number(stateByKey.get("online_peak")?.value);
  const liveRaw = Number(stateByKey.get("online_live")?.value);
  const peak24 = Number.isFinite(peakRaw) ? peakRaw : null;

  let onlineOut = online ? { count: online.count, at: online.at, peak: peak24 } : null;
  // если точек в базе ещё нет — показываем последнее известное живое значение
  if (!onlineOut && Number.isFinite(liveRaw) && liveRaw > 0) {
    onlineOut = {
      count: liveRaw,
      at: stateByKey.get("online_live")?.updatedAt ?? new Date(),
      peak: peak24,
    };
  }

  return NextResponse.json({
    active,
    online: onlineOut,
    onlineHistory: history.map((p) => ({ count: p.count, at: p.at })),
  });
}
