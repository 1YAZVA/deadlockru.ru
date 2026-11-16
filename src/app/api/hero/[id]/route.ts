import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const heroId = Number(id);
  if (!Number.isFinite(heroId)) return NextResponse.json({ error: "bad id" }, { status: 400 });

  const hero = await db.hero.findUnique({ where: { id: heroId } });
  if (!hero) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [stat, history, extra] = await Promise.all([
    db.heroStat.findUnique({ where: { heroId } }),
    db.heroStatHistory.findMany({ where: { heroId }, orderBy: { at: "asc" }, take: 200 }),
    db.heroExtra.findUnique({ where: { heroId } }),
  ]);

  const compose = (d: string): { text: string; lore: string } => {
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
  const { text: descText, lore } = compose(hero.description);
  // Русская локализация: лор/теги из каталога deadlock-api (?language=russian)
  const tagsRu = JSON.parse(hero.tagsRuJson || "[]") as string[];
  const tags = JSON.parse(hero.tagsJson || "[]") as string[];

  // Способности: обогащаем официальной русской локализацией из каталога (nameRu/descriptionRu)
  // — работает сразу, не дожидаясь пере-синка extras.
  const abilitiesRaw = extra ? (JSON.parse(extra.abilitiesJson || "[]") as { id?: string; name: string; className: string; abilityType: string }[]) : [];
  const abilityIds = abilitiesRaw.map((a) => a.id).filter((v): v is string => Boolean(v));
  const ruAbilities = abilityIds.length
    ? await db.item.findMany({ where: { id: { in: abilityIds }, type: "ability" }, select: { id: true, nameRu: true, descriptionRu: true } })
    : [];
  const ruAbById = new Map(ruAbilities.map((i) => [i.id, i]));
  // nameRu вида "citadel_ability_..." — не перевод, а внутренний ключ, считаем его отсутствующим
  const isRealRu = (s: string | null | undefined) => Boolean(s) && !/[a-z]_[a-z]/.test(s as string);
  const abilitiesRu = abilitiesRaw.map((a) => {
    const ru = ruAbById.get(a.id ?? "");
    return {
      ...a,
      nameRu: isRealRu(ru?.nameRu) ? ru!.nameRu : undefined,
      descriptionRu: ru?.descriptionRu || undefined,
    };
  });

  return NextResponse.json({
    hero: {
      id: hero.id, name: hero.name, nameRu: hero.nameRu, className: hero.className,
      // русский лор приоритетнее; оригинал возвращаем в descriptionEn
      description: hero.descriptionRu || descText,
      descriptionEn: descText, lore,
      heroRole: hero.heroRole,
      tags: tagsRu.length ? tagsRu : tags, heroType: hero.heroType, complexity: hero.complexity,
      colorHex: hero.colorHex, iconCard: hero.iconCard, iconSmall: hero.iconSmall,
      startingStats: JSON.parse(hero.startingStats || "{}"),
      levelInfo: JSON.parse(hero.levelInfo || "{}"),
    },
    stat,
    history: history.map((h) => ({ winRate: h.winRate, pickRate: h.pickRate, matches: h.matches, at: h.at })),
    extra: extra
      ? {
          topItems: JSON.parse(extra.topItemsJson || "[]"),
          counters: JSON.parse(extra.countersJson || "[]"),
          builds: JSON.parse(extra.buildsJson || "[]"),
          abilities: abilitiesRu,
          updatedAt: extra.updatedAt,
        }
      : null,
  });
}
