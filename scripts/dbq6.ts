import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  // способности привязаны к героям?
  const abs = await p.item.findMany({ where: { type: "ability" }, select: { id: true, className: true, name: true, abilityType: true, heroesJson: true, image: true } });
  console.log("abilities total:", abs.length);
  const withH = abs.filter(a => { try { const h = JSON.parse(a.heroesJson); return Array.isArray(h) && h.length === 1; } catch { return false; } });
  console.log("abilities with exactly 1 hero:", withH.length);
  const perHero: Record<number, number> = {};
  for (const a of withH) { const h = JSON.parse(a.heroesJson)[0]; perHero[h] = (perHero[h] || 0) + 1; }
  const counts = Object.entries(perHero).map(([k, v]) => `${k}:${v}`);
  console.log("per hero:", counts.join(" "));
  console.log("sample:", withH.slice(0, 6).map(a => `${a.className} -> ${a.heroesJson} (${a.abilityType})`).join("\n"));
  // предметы: id, tier, cost, isActive
  const its = await p.item.findMany({ where: { type: { in: ["upgrade", "weapon"] } }, select: { id: true, className: true, tier: true, cost: true, isActive: true, slotType: true, shopable: true } });
  console.log("shop items:", its.length, "active:", its.filter(i => i.isActive).length, "tier1:", its.filter(i => i.tier === 1).length);
}
main().finally(() => p.$disconnect());
