// Кросс-проверка: наш код билда читается декодером randomlock.com
import { PrismaClient } from "@prisma/client";
import { itemsToPool, makeCtx, rollBuild, rollSkillOrder, skillChanges, encodeBuildCode, heroSkillAbilities } from "../src/lib/buildroll";
// @ts-ignore — чужой модуль без типов
import { decodeBuildCode as rlDecode } from "/tmp/rl-buildcode.js";
const db = new PrismaClient();
async function main() {
  const rows = await db.item.findMany({ where: { shopable: true, disabled: false, type: { in: ["upgrade", "weapon"] } }, select: { id: true, className: true, name: true, nameRu: true, tier: true, cost: true, slotType: true, isActive: true, componentsJson: true } });
  const pool = itemsToPool(rows.map((r) => ({ ...r, components: JSON.parse(r.componentsJson || "[]") })));
  const hero = await db.hero.findUnique({ where: { id: 13 } }); // Haze
  const extra = await db.heroExtra.findUnique({ where: { heroId: 13 } });
  const abils = heroSkillAbilities(JSON.parse(extra?.abilitiesJson || "[]"));
  const r = (() => { let s = 42; return () => { s = (s * 1103515245 + 12345) >>> 0; return s / 2 ** 32; }; })();
  const build = rollBuild(r, makeCtx(pool), "curve", "chaos", 2);
  const skills = rollSkillOrder(r, 4, 3);
  const code = encodeBuildCode({
    heroId: hero!.id, name: `DEADLOCK//RU · ${hero!.name} · 16.11.2026`, desc: "Случайный билд из рулетки Deadlock//RU",
    categories: [{ name: "Порядок покупки 1→12", items: build.map((b) => b.id) }],
    abilityChanges: skillChanges(skills, abils.map((a) => a.id)),
  });
  const theirs = rlDecode(code);
  const theirItems = (theirs.categories ?? []).flatMap((c: { items: number[] }) => c.items);
  console.log("randomlock decoder -> heroId:", theirs.heroId, "| name:", theirs.name, "| desc:", theirs.desc);
  console.log("items:", theirItems.length, "| совпадают:", theirItems.join(",") === build.map((b) => b.id).join(","));
  console.log("changes:", theirs.changes.length, "| unlocks:", theirs.changes.filter((c: { currency_type: number }) => c.currency_type === 2).length);
  const ok = theirs.heroId === hero!.id && theirItems.length === 12 && theirItems.join(",") === build.map((b) => b.id).join(",") && theirs.changes.length === 16;
  console.log(ok ? "INTEROP OK — декодер randomlock читает наш код, формат совместим" : "INTEROP FAIL");
  process.exit(ok ? 0 : 1);
}
main().finally(() => db.$disconnect());
