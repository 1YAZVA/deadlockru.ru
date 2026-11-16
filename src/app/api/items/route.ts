import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await db.item.findMany({
    where: { shopable: true, disabled: false },
    orderBy: [{ tier: "asc" }, { cost: "asc" }, { name: "asc" }],
  });
  const stats = await db.itemStat.findMany();
  const statMap = new Map(stats.map((s) => [s.itemId, s]));
  return NextResponse.json({
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      // официальное русское название/описание из каталога, оригинал — рядом
      nameRu: i.nameRu,
      className: i.className,
      type: i.type,
      slotType: i.slotType,
      tier: i.tier,
      cost: i.cost,
      description: i.descriptionRu || i.description,
      descriptionEn: i.description,
      shopImage: i.shopImage,
      image: i.image,
      isActive: i.isActive,
      // class_name компонентов апгрейда — правила рулетки билдов (апгрейд съедает компонент)
      components: JSON.parse(i.componentsJson || "[]") as string[],
      props: (JSON.parse(i.propsRuJson || "[]") as { label: string }[]).length
        ? JSON.parse(i.propsRuJson || "[]")
        : JSON.parse(i.propsJson || "[]"),
      stat: statMap.get(i.id) ?? null,
    })),
  });
}
