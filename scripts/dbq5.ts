import { db } from "@/lib/db";
async function main() {
  const row = await db.leaderboardEntry.findFirst({ where: { region: "Europe", rank: 1 }, select: { accountName: true, accountIdsJson: true } });
  console.log(row?.accountName, row?.accountIdsJson?.slice(0, 60));
  await (db as unknown as { $disconnect: () => Promise<void> }).$disconnect();
}
main();
