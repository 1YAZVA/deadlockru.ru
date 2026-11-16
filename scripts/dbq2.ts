import { db } from "@/lib/db";
async function main() {
  const rows = await db.badgeDist.findMany({ orderBy: { badge: "asc" }, take: 80 });
  console.log(JSON.stringify(rows));
  const rt = await db.rankTier.findMany({ orderBy: { id: "asc" } });
  console.log(JSON.stringify(rt.map(r => ({ id: r.id, name: r.name }))));
  await (db as unknown as { $disconnect: () => Promise<void> }).$disconnect();
}
main();
