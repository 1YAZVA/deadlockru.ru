import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const abs = await p.item.findMany({ where: { type: "ability" } });
  const single = abs.filter(a => { const h = JSON.parse(a.heroesJson); return Array.isArray(h) && h.length === 1; });
  const byType: Record<string, number> = {};
  for (const a of single) byType[a.abilityType] = (byType[a.abilityType] || 0) + 1;
  console.log("abilityType of single-hero abilities:", byType);
  // пример для героя 1 (Infernus): какие 4 скилла?
  for (const h of [1, 13]) {
    const mine = single.filter(a => JSON.parse(a.heroesJson)[0] === h);
    console.log(`hero ${h}:`, mine.map(a => `${a.abilityType}:${a.className}`).join(", "));
  }
}
main().finally(() => p.$disconnect());
