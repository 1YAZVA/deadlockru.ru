import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  for (const hid of [72, 78, 84, 38, 62]) {
    const name = await p.hero.findUnique({ where: { id: hid }, select: { name: true } });
    const abs = await p.item.findMany({ where: { type: "ability" }, select: { className: true, abilityType: true, heroesJson: true } });
    const mine = abs.filter(a => { const h = JSON.parse(a.heroesJson); return Array.isArray(h) && h.length === 1 && h[0] === hid; });
    console.log(hid, name?.name, "->", mine.map(a => a.abilityType).sort().join(","));
  }
}
main().finally(() => p.$disconnect());
