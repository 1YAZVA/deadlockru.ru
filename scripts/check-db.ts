import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const [h, i, p, lb, hs, ex, rt, bd, on, t, tm, m, hist, logs] = await Promise.all([
    db.hero.count(), db.item.count(), db.patch.count(), db.leaderboardEntry.count(),
    db.heroStat.count(), db.heroExtra.count(), db.rankTier.count(), db.badgeDist.count(),
    db.onlinePoint.count(), db.tournament.count(), db.esportsTeam.count(), db.esportsMatch.count(),
    db.heroStatHistory.count(), db.syncLog.count(),
  ]);
  console.log({ heroes: h, items: i, patches: p, leaderboard: lb, heroStats: hs, heroExtras: ex, rankTiers: rt, badgeDist: bd, online: on, tournaments: t, teams: tm, matches: m, history: hist, logs });
  const top = await db.heroStat.findMany({ orderBy: { winRate: "desc" }, take: 3 });
  console.log("top WR:", top.map((x) => x.heroId + ": " + x.winRate.toFixed(1) + "%"));
  const p1 = await db.leaderboardEntry.findFirst({ where: { region: "Europe", rank: 1 } });
  console.log("EU #1:", p1?.accountName, p1?.topHeroIdsJson);
  const heroes = await db.hero.count({ where: { playerSelectable: true, disabled: false, inDevelopment: false } });
  console.log("selectable heroes:", heroes);
  const shopable = await db.item.count({ where: { shopable: true } });
  console.log("shopable items:", shopable);
  const ex1 = await db.heroExtra.findFirst();
  const counters = ex1 ? JSON.parse(ex1.countersJson) : null;
  console.log("sample extra heroId:", ex1?.heroId, "counters keys:", counters ? Object.keys(counters) : null);
  await db.$disconnect();
}
main();
