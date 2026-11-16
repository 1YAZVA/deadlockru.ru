import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const heroes = await db.hero.findMany({
    where: { playerSelectable: true, disabled: false, inDevelopment: false },
    orderBy: { name: "asc" },
  });
  const stats = await db.heroStat.findMany();
  const extras = await db.heroExtra.findMany({ select: { heroId: true, topItemsJson: true, countersJson: true } });
  const statMap = new Map(stats.map((s) => [s.heroId, s]));
  const extraMap = new Map(extras.map((e) => [e.heroId, e]));
  const composeDescription = (d: string): { text: string; lore: string } => {
    try {
      const o = JSON.parse(d);
      if (o && typeof o === "object") {
        const lore = typeof o.lore === "string" ? o.lore : "";
        const text = [typeof o.role === "string" ? o.role : "", typeof o.playstyle === "string" ? o.playstyle : ""]
          .filter(Boolean)
          .join(". ");
        return { text: text || lore, lore };
      }
    } catch {
      /* обычная строка */
    }
    return { text: d, lore: "" };
  };
  return NextResponse.json({
    heroes: heroes.map((h) => {
      const { text, lore } = composeDescription(h.description);
      // Официальная русская локализация из каталога: лор, теги, имя.
      // Показываем русский текст, оригинал остаётся доступным для тултипов.
      const tagsRu = JSON.parse(h.tagsRuJson || "[]") as string[];
      const tags = JSON.parse(h.tagsJson || "[]") as string[];
      return {
        id: h.id,
        name: h.name,
        nameRu: h.nameRu,
        className: h.className,
        description: h.descriptionRu || text,
        descriptionEn: text,
        lore,
        heroRole: h.heroRole,
        tags: tagsRu.length ? tagsRu : tags,
        heroType: h.heroType,
        complexity: h.complexity,
        colorHex: h.colorHex,
        iconCard: h.iconCard,
        iconSmall: h.iconSmall,
        startingStats: JSON.parse(h.startingStats || "{}"),
        levelInfo: JSON.parse(h.levelInfo || "{}"),
        stat: statMap.get(h.id) ?? null,
        hasExtras: extraMap.has(h.id),
      };
    }),
  });
}
