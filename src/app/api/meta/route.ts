import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const [stats, heroes, badgeDist, rankTiers] = await Promise.all([
    db.heroStat.findMany(),
    db.hero.findMany({ where: { playerSelectable: true, disabled: false, inDevelopment: false } }),
    db.badgeDist.findMany({ orderBy: { badge: "asc" } }),
    db.rankTier.findMany({ orderBy: { id: "asc" } }),
  ]);
  const heroMap = new Map(heroes.map((h) => [h.id, h]));
  const rows = stats
    .filter((s) => heroMap.has(s.heroId))
    .map((s) => ({
      heroId: s.heroId,
      name: heroMap.get(s.heroId)!.name,
      colorHex: heroMap.get(s.heroId)!.colorHex,
      iconCard: heroMap.get(s.heroId)!.iconCard,
      heroType: heroMap.get(s.heroId)!.heroType,
      complexity: heroMap.get(s.heroId)!.complexity,
      winRate: s.winRate,
      pickRate: s.pickRate,
      matches: s.matches,
      kda: s.kda,
      avgNetWorth: s.avgNetWorth,
      kills: s.kills,
      deaths: s.deaths,
      assists: s.assists,
      playerDamage: s.playerDamage,
      damageTaken: s.damageTaken,
      lastHits: s.lastHits,
      netWorth: s.netWorth,
      updatedAt: s.updatedAt,
    }));
  const totalMatches = rows.reduce((acc, r) => acc + r.matches, 0) / 12;
  return NextResponse.json({
    rows,
    totalMatches: Math.round(totalMatches),
    badgeDist,
    rankTiers,
    updatedAt: rows[0]?.updatedAt ?? null,
  });
}
