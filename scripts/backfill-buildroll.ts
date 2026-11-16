// Бэкфилл данных для рулетки билдов:
// 1) component_items -> Item.componentsJson (один запрос к API);
// 2) HeroExtra.abilitiesJson перезаписываем локально с полем id (числовой ID способности для кода билда).
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const API = "https://api.deadlock-api.com";

async function fetchJson<T>(url: string, timeoutMs = 45000): Promise<T> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  // 1. компоненты апгрейдов
  type RawItem = { id: number; class_name: string; component_items?: string[] };
  const items = await fetchJson<RawItem[]>(`${API}/v1/assets/items`);
  let n = 0;
  for (const it of items) {
    const comps = Array.isArray(it.component_items) ? it.component_items : [];
    await db.item.updateMany({ where: { id: String(it.id) }, data: { componentsJson: JSON.stringify(comps) } });
    if (comps.length) n++;
  }
  console.log("items with components:", n);

  // 2. abilitiesJson с id (сигнатуры + ульты + остальное, как раньше, но с id)
  const abilities = await db.item.findMany({
    where: { type: "ability", disabled: false },
    select: { id: true, name: true, image: true, className: true, description: true, abilityType: true, heroesJson: true },
  });
  const byHero = new Map<number, object[]>();
  for (const a of abilities) {
    let heroIds: number[] = [];
    try { heroIds = JSON.parse(a.heroesJson || "[]") as number[]; } catch { heroIds = []; }
    for (const hid of heroIds) {
      if (!byHero.has(hid)) byHero.set(hid, []);
      byHero.get(hid)!.push({ id: a.id, name: a.name, image: a.image, className: a.className, description: a.description, abilityType: a.abilityType, _len: heroIds.length });
    }
  }
  let heroes = 0;
  for (const [hid, list] of byHero) {
    const sorted = (list as { _len?: number }[]).sort((x, y) => (x._len ?? 99) - (y._len ?? 99))
      .map(({ _len, ...rest }) => rest);
    await db.heroExtra.updateMany({ where: { heroId: hid }, data: { abilitiesJson: JSON.stringify(sorted) } });
    heroes++;
  }
  console.log("heroExtras updated:", heroes);
}

main().finally(() => db.$disconnect());
