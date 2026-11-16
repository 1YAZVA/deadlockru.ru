import { db } from "@/lib/db";
async function main() {
  const dist = await db.badgeDist.findMany({ orderBy: { badge: "asc" } });
  console.log("BadgeDist:", dist.map(d => `${d.badge}:${d.name}=${d.players}`).join(" | "));
  const withImg = await db.patch.count({ where: { imageUrl: { not: "" } } });
  console.log("Patches with imageUrl:", withImg, "of", await db.patch.count());
  const samples = await db.patch.findMany({ orderBy: { pubDate: "desc" }, take: 5, select: { title: true, imageUrl: true } });
  for (const s of samples) console.log("-", s.title.slice(0, 30), "->", s.imageUrl.slice(0, 90));
  await (db as unknown as { $disconnect: () => Promise<void> }).$disconnect();
}
main();
