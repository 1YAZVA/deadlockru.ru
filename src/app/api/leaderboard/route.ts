import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveSteamAvatars } from "@/lib/steam-avatar";

export const dynamic = "force-dynamic";

const REGIONS = ["Europe", "NAmerica", "SAmerica", "Asia", "Oceania"] as const;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const region = url.searchParams.get("region") ?? "Global";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(10, Number(url.searchParams.get("pageSize") ?? "25") || 25));
  const search = (url.searchParams.get("search") ?? "").trim().toLowerCase();

  const where = region === "Global" ? {} : { region };
  const [all, regionCountsRaw] = await Promise.all([
    db.leaderboardEntry.findMany({
      where,
      orderBy: { rank: "asc" },
    }),
    db.leaderboardEntry.groupBy({ by: ["region"], _count: { _all: true } }),
  ]);

  const filtered = search ? all.filter((e) => e.accountName.toLowerCase().includes(search)) : all;

  // Глобальный вид: сортируем по позиции в регионе (1-е места всех регионов выше),
  // при равенстве — алфавит регионов.
  const sorted =
    region === "Global"
      ? [...filtered].sort((a, b) => a.rank - b.rank || a.region.localeCompare(b.region))
      : filtered;

  const total = sorted.length;
  const startIdx = (page - 1) * pageSize;
  const pageRows = sorted.slice(startIdx, startIdx + pageSize);

  // Агрегация «чаще всего в топах» — по top_hero_ids всей выборки
  const heroAgg = new Map<number, number>();
  for (const e of all) {
    let ids: number[] = [];
    try { ids = JSON.parse(e.topHeroIdsJson || "[]") as number[]; } catch { ids = []; }
    for (const id of ids) heroAgg.set(id, (heroAgg.get(id) ?? 0) + 1);
  }
  const topHeroes = [...heroAgg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([heroId, count]) => ({ heroId, count }));

  const updatedAt = all.reduce<Date | null>((acc, e) => (!acc || e.updatedAt > acc ? e.updatedAt : acc), null);

  // Аватарки Steam для текущей страницы: кэш в SQLite + добор публичных XML профилей.
  // Отдаём клиенту только прокси-ссылку (картинки тянутся через /api/img — работает из РФ).
  const avatarMap = await resolveSteamAvatars(
    db,
    pageRows.map((e) => {
      let ids: number[] = [];
      try { ids = JSON.parse(e.accountIdsJson || "[]") as number[]; } catch { ids = []; }
      return { key: `${e.region}-${e.rank}`, candidateIds: ids };
    })
  );

  return NextResponse.json({
    rows: pageRows.map((e) => {
      let ids: number[] = [];
      try { ids = JSON.parse(e.accountIdsJson || "[]") as number[]; } catch { ids = []; }
      const avatar = avatarMap.get(`${e.region}-${e.rank}`) ?? "";
      // steamid64 = 76561197960265728 + steamid3 (числа < 2^53, безопасно)
      const profileId = ids[0] ? String(76_561_197_960_265_728 + ids[0]) : "";
      return {
        region: e.region,
        rank: e.rank,
        accountName: e.accountName,
        topHeroIds: JSON.parse(e.topHeroIdsJson || "[]") as number[],
        avatar,
        profileUrl: profileId ? `https://steamcommunity.com/profiles/${profileId}` : "",
        updatedAt: e.updatedAt,
      };
    }),
    total,
    page,
    pageSize,
    regionCounts: Object.fromEntries(regionCountsRaw.map((r) => [r.region, r._count._all])),
    topHeroes,
    updatedAt,
  });
}
