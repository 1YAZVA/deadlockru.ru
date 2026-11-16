import { db } from "@/lib/db";
async function main() {
  const hs = await db.hero.findMany({ select: { id: true, name: true, iconCard: true, iconSmall: true, colorHex: true, heroType: true }, take: 70 });
  for (const h of hs) console.log(h.id, "|", h.name, "|", h.iconSmall.slice(0, 90));
  await (db as unknown as { $disconnect: () => Promise<void> }).$disconnect();
}
main();
