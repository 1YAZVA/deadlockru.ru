import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cacheGet, cacheSet } from "@/lib/cache";
import { startScheduler } from "@/lib/scheduler";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ActiveMatch = {
  match_id: number;
  start_time: number;
  players: { account_id: number; team: number; hero_id: number; abandoned?: number | null }[];
};

async function getActiveMatches(): Promise<{ count: number; matches: { id: number; min: number; a: number[]; b: number[] }[] }> {
  const cached = cacheGet<{ count: number; matches: { id: number; min: number; a: number[]; b: number[] }[] }>("active_matches");
  if (cached) return cached;
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
    const matches = raw.slice(0, 40).map((m) => ({
      id: m.match_id,
      min: Math.max(0, Math.round((now - m.start_time) / 60)),
      a: m.players.filter((p) => p.team === 0).map((p) => p.hero_id),
      b: m.players.filter((p) => p.team === 1).map((p) => p.hero_id),
    }));
    const out = { count: raw.length, matches };
    cacheSet("active_matches", out, 60_000);
    return out;
  } catch {
    return { count: 0, matches: [] };
  }
}

export async function GET() {
  // подстраховка: если instrumentation не сработала (dev-перезапуск),
  // первый запрос к state поднимает планировщик — guard внутри не даст дубля
  startScheduler();

  const [heroCount, itemCount, patchCount, lbCount, tournamentCount, online, history, latest, topMeta, lastSyncs, active] =
    await Promise.all([
      db.hero.count({ where: { playerSelectable: true, disabled: false, inDevelopment: false } }),
      db.item.count({ where: { shopable: true } }),
      db.patch.count(),
      db.leaderboardEntry.count(),
      db.tournament.count(),
      db.onlinePoint.findFirst({ orderBy: { at: "desc" } }),
      // 30 дней × 144 замера/день = 4320 — отдаём всё накопленное за месяц
      db.onlinePoint.findMany({ orderBy: { at: "asc" }, take: 4400 }),
      db.patch.findFirst({ orderBy: { pubDate: "desc" }, select: { id: true, title: true, titleRu: true, pubDate: true, source: true, isPatch: true } }),
      db.heroStat.findMany({ orderBy: { winRate: "desc" }, take: 8, select: { heroId: true, winRate: true, pickRate: true, matches: true } }),
      db.syncState.findMany(),
      getActiveMatches(),
    ]);

  const syncMap: Record<string, unknown> = {};
  for (const s of lastSyncs) {
    if (s.key.startsWith("last_")) {
      try { syncMap[s.key.slice(5)] = JSON.parse(s.value); } catch { syncMap[s.key.slice(5)] = null; }
    }
  }

  // пик за 24 ч из ISteamChartsService и запасное «сейчас» пишет задача online
  const peakRaw = Number(lastSyncs.find((s) => s.key === "online_peak")?.value);
  const liveRaw = Number(lastSyncs.find((s) => s.key === "online_live")?.value);
  const peak24 = Number.isFinite(peakRaw) ? peakRaw : null;

  let onlineOut = online ? { count: online.count, at: online.at, peak: peak24 } : null;
  if (!onlineOut && Number.isFinite(liveRaw) && liveRaw > 0) {
    onlineOut = {
      count: liveRaw,
      at: lastSyncs.find((s) => s.key === "online_live")?.updatedAt ?? new Date(),
      peak: peak24,
    };
  }

  return NextResponse.json({
    counts: {
      heroes: heroCount,
      items: itemCount,
      patches: patchCount,
      leaderboardPlayers: lbCount,
      tournaments: tournamentCount,
      activeMatches: active.count,
    },
    online: onlineOut,
    onlineHistory: history.map((p) => ({ count: p.count, at: p.at })),
    // в баннере на главной показываем официальное русское название, если оно есть
    latestPatch: latest ? { ...latest, title: latest.titleRu || latest.title } : null,
    topMeta,
    sync: syncMap,
    activeMatches: active.matches,
  });
}
