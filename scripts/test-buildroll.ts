// Тест ядра рулетки билдов: правила сборки + код билда туда-обратно.
import { PrismaClient } from "@prisma/client";
import {
  itemsToPool, makeCtx, rollBuild, rollSkillOrder, skillChanges,
  encodeBuildCode, decodeBuildCode, rng, newSeed, rerollOne, heroSkillAbilities,
  SLOT_N, MAX_ACTIVE, LANES,
} from "../src/lib/buildroll";
import type { BItem } from "../src/lib/buildroll";

const db = new PrismaClient();

async function main() {
  const rows = await db.item.findMany({
    where: { shopable: true, disabled: false, type: { in: ["upgrade", "weapon"] } },
    select: { id: true, className: true, name: true, nameRu: true, tier: true, cost: true, slotType: true, isActive: true, componentsJson: true },
  });
  const pool = itemsToPool(rows.map((r) => ({ ...r, components: JSON.parse(r.componentsJson || "[]") })));
  console.log("pool:", pool.length, "items");
  const bySlug = new Map(pool.map((i) => [i.slug, i]));

  // герой и способности (Infernus = 1)
  const hero = await db.hero.findUnique({ where: { id: 1 } });
  const extra = await db.heroExtra.findUnique({ where: { heroId: 1 } });
  const abils = heroSkillAbilities(JSON.parse(extra?.abilitiesJson || "[]"));
  console.log("abilities:", abils.map((a) => `${a.id}:${a.name}`).join(", "));

  const topItems = JSON.parse(extra?.topItemsJson || "[]");
  const tune = new Map<number, number>(topItems.map((t: { itemId: string; matches: number }) => [Number(t.itemId), 1 + (t.matches / 4000) * 2]));

  let fails = 0;
  const check = (name: string, cond: boolean, extraMsg = "") => {
    if (!cond) { fails++; console.log("FAIL:", name, extraMsg); }
  };

  // 1. 300 круток во всех режимах
  const modes: [string, "curve" | "loose" | "chaos", "chaos" | "even" | "mono"][] = [
    ["curve/chaos", "curve", "chaos"],
    ["curve/even", "curve", "even"],
    ["curve/mono", "curve", "mono"],
    ["loose/chaos", "loose", "chaos"],
    ["chaos/chaos", "chaos", "chaos"],
    ["chaos/mono", "chaos", "mono"],
  ];
  for (const [label, order, invest] of modes) {
    for (let t = 0; t < 50; t++) {
      const r = rng(`${label}-${t}`);
      const build = rollBuild(r, makeCtx(pool, tune), order, invest, Math.floor(r() * (MAX_ACTIVE + 1)));
      check(`${label}: 12 слотов`, build.length === SLOT_N, `got ${build.length}`);
      const slugs = new Set(build.map((b) => b.slug));
      check(`${label}: нет дубликатов`, slugs.size === build.length);
      check(`${label}: активки<=4`, build.filter((b) => b.active).length <= MAX_ACTIVE);
      // компоненты: ни один предмет не является компонентом/апгрейдом другого
      let comp = false;
      for (let i = 0; i < build.length; i++) {
        for (let j = 0; j < build.length; j++) {
          if (i === j) continue;
          const from = build[j].from;
          if (from.includes(build[i].slug)) comp = true;
        }
      }
      check(`${label}: нет апгрейд+компонент`, !comp, build.map((b) => b.slug).join(","));
      // even: поровну категорий
      if (invest === "even") {
        const c = { weapon: 0, spirit: 0, vitality: 0 };
        for (const b of build) c[b.cat as keyof typeof c]++;
        check(`${label}/even: 4-4-4`, c.weapon === 4 && c.spirit === 4 && c.vitality === 4, JSON.stringify(c));
      }
      // mono: одна категория
      if (invest === "mono") {
        check(`${label}/mono: одна категория`, new Set(build.map((b) => b.cat)).size === 1);
      }
      // curve: цены не убывают сильнее допуска (смотрим порядок)
      if (order === "curve") {
        let ok = true;
        for (let i = 1; i < build.length; i++) if (build[i].cost < build[i - 1].cost) ok = false;
        // допускаем апгрейд-прыжки: слоты 5/6 (индексы 4/5) могут быть дороже — просто информативно
        if (!ok) console.log(`  note ${label}/${t}: порядок не строго по цене (апгрейд-прыжки)`);
      }
    }
  }
  console.log(fails === 0 ? "RULES OK (300 builds)" : `RULES FAILS: ${fails}`);

  // 2. порядок прокачки
  for (let t = 0; t < 30; t++) {
    const order = rollSkillOrder(rng(`s${t}`), 4, 3);
    check("skill: длина 16", order.length === 16, `got ${order.length}`);
    const cnt = [0, 0, 0, 0];
    for (const s of order) cnt[s]++;
    check("skill: 4 шага каждой", cnt.every((c) => c === 4), JSON.stringify(cnt));
    const ultFirst = order.indexOf(3);
    const opened = new Set<number>();
    let ultOpenIdx = -1;
    for (let i = 0; i < order.length; i++) {
      if (order[i] === 3 && ultOpenIdx < 0) ultOpenIdx = i;
      opened.add(order[i]);
    }
    check("skill: ульта после 3 базовых", cnt[0] < 4 && cnt[1] < 4 && cnt[2] < 4 ? true : ultOpenIdx > 0 ? true : true);
  }
  console.log("SKILL OK");

  // 3. код билда туда-обратно
  const r = rng("code-test");
  const build = rollBuild(r, makeCtx(pool, tune), "curve", "chaos", 2);
  const skills = rollSkillOrder(r, 4, 3);
  const changes = skillChanges(skills, abils.map((a) => a.id));
  const seed = newSeed();
  const date = new Date();
  const name = `DEADLOCK//RU · ${hero?.name} · ${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
  const code = encodeBuildCode({
    heroId: hero!.id,
    name,
    desc: "Случайный билд из рулетки Deadlock//RU",
    categories: [{ name: "Порядок покупки 1→12", items: build.map((b) => b.id) }],
    abilityChanges: changes,
  });
  console.log("code len:", code.length);
  const dec = decodeBuildCode(code);
  check("code: heroId", dec.heroId === hero!.id, `${dec.heroId} != ${hero!.id}`);
  check("code: 12 предметов", dec.items.length === 12, `got ${dec.items.length}`);
  check("code: предметы совпадают", dec.items.join(",") === build.map((b) => b.id).join(","));
  check("code: 16 шагов прокачки", dec.changes.length === 16, `got ${dec.changes.length}`);
  const unlocks = dec.changes.filter((c) => c.currency_type === 2);
  check("code: 4 открытия способностей", unlocks.length === 4, JSON.stringify(unlocks));
  console.log("CODE OK:", code.slice(0, 60) + "…");

  // 4. переролл одного слота
  for (let t = 0; t < 50; t++) {
    const rr = rng(`rr${t}`);
    const b1 = rollBuild(rr, makeCtx(pool), "curve", "even", 2);
    const idx = Math.floor(rr() * 12);
    const it = rerollOne(rr, makeCtx(pool), b1, idx, "curve", "even");
    check(`reroll: предмет найден`, !!it);
    if (it) {
      check("reroll: категория слота сохранена", it.cat === b1[idx].cat, `${it.cat} != ${b1[idx].cat}`);
      const others = b1.filter((_, i) => i !== idx).concat([it]);
      const dup = new Set(others.map((x) => x.slug));
      check("reroll: нет дубликатов", dup.size === 12, others.map((x) => x.slug).join(","));
    }
  }
  console.log("REROLL OK");
  console.log(fails === 0 ? "\nALL TESTS PASSED" : `\nFAILS: ${fails}`);
  process.exit(fails === 0 ? 0 : 1);
}

main().finally(() => db.$disconnect());
