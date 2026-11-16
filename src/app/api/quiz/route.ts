import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Квиз «Угадай героя» — серверный банк вопросов.
 *  Способности/ульты с русской локализацией из каталога + иконки героев.
 *  Ответы (answerId) — id героя из вариантов. */

type AbilityJson = { id?: string; name: string; className: string; abilityType: string; image?: string; description?: string };
type QuizOption = { id: number; name: string; nameRu?: string; icon: string; color: string };
type QuizQuestion = {
  kind: "ability" | "ultimate" | "icon";
  prompt: string;
  ability?: { name: string; typeRu: string; descHtml: string; image?: string };
  heroIcon?: string;
  options: QuizOption[];
  answerId: number;
};

/** Русские названия типов способностей (как в карточке героя) */
const ABILITY_TYPE_RU: Record<string, string> = {
  signature: "особая",
  ultimate: "ультимейт",
  passive: "пассивная",
};

/** nameRu вида "citadel_ability_..." — не перевод, а внутренний ключ */
const isRealRu = (s: string | null | undefined) => Boolean(s) && !/[a-z]_[a-z]/.test(s as string);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Убираем из текста-подсказки то, что выдаёт героя: {s:hero_name} и прямые упоминания имени */
function scrub(text: string, heroNameRu: string, heroName: string): string {
  let s = text.replace(/\{s:hero_name\}/g, "герой");
  for (const nm of [heroNameRu, heroName]) {
    if (!nm) continue;
    s = s.replace(new RegExp(escapeRe(nm), "gi"), "герой");
  }
  return s;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Варианты: правильный герой + 3 случайных других */
function pickOptions(correct: QuizOption, pool: QuizOption[]): QuizOption[] {
  const others = shuffle(pool.filter((o) => o.id !== correct.id)).slice(0, 3);
  return shuffle([correct, ...others]);
}

export async function GET() {
  const heroes = await db.hero.findMany({
    select: { id: true, name: true, nameRu: true, colorHex: true, iconCard: true, iconSmall: true },
  });
  const extras = await db.heroExtra.findMany({ select: { heroId: true, abilitiesJson: true } });

  const optionPool: QuizOption[] = heroes
    .filter((h) => h.iconCard || h.iconSmall)
    .map((h) => ({ id: h.id, name: h.name, nameRu: h.nameRu ?? undefined, icon: h.iconSmall || h.iconCard, color: h.colorHex }));

  // Русская локализация способностей из каталога (как в /api/hero/[id])
  const abilityIds = new Set<string>();
  const abilByHero = new Map<number, AbilityJson[]>();
  for (const ex of extras) {
    let list: AbilityJson[] = [];
    try {
      list = JSON.parse(ex.abilitiesJson || "[]") as AbilityJson[];
    } catch {
      continue;
    }
    abilByHero.set(ex.heroId, list);
    for (const a of list) if (a.id) abilityIds.add(a.id);
  }
  const ruRows = abilityIds.size
    ? await db.item.findMany({ where: { id: { in: [...abilityIds] }, type: "ability" }, select: { id: true, nameRu: true, descriptionRu: true } })
    : [];
  const ruById = new Map(ruRows.map((r) => [r.id, r]));

  const heroById = new Map(heroes.map((h) => [h.id, h]));
  const abilityQs: QuizQuestion[] = [];
  const iconQs: QuizQuestion[] = [];

  for (const [heroId, list] of abilByHero) {
    const hero = heroById.get(heroId);
    if (!hero || !hero.nameRu) continue; // вопрос строится на русском каталоге
    const correct: QuizOption = {
      id: hero.id, name: hero.name, nameRu: hero.nameRu ?? undefined,
      icon: hero.iconSmall || hero.iconCard, color: hero.colorHex,
    };
    if (!correct.icon) continue;

    // способности с настоящим русским описанием (особые / ульты / пассивные)
    for (const a of list) {
      if (!["signature", "ultimate", "passive"].includes(a.abilityType)) continue;
      const ru = a.id ? ruById.get(a.id) : undefined;
      const desc = ru?.descriptionRu || "";
      if (desc.length < 30) continue; // слишком короткое — неинтересно угадывать
      const nameRu = isRealRu(ru?.nameRu) ? ru!.nameRu! : undefined;
      abilityQs.push({
        kind: a.abilityType === "ultimate" ? "ultimate" : "ability",
        prompt: "Чья эта способность?",
        ability: {
          name: nameRu || a.name,
          typeRu: ABILITY_TYPE_RU[a.abilityType] ?? a.abilityType,
          descHtml: scrub(desc, hero.nameRu, hero.name),
          image: a.image,
        },
        options: pickOptions(correct, optionPool),
        answerId: hero.id,
      });
    }
  }

  // Иконка → герой
  for (const o of shuffle(optionPool)) {
    iconQs.push({
      kind: "icon",
      prompt: "Кто этот герой?",
      heroIcon: o.icon,
      options: pickOptions(o, optionPool),
      answerId: o.id,
    });
  }

  // Сборка батча: до 9 вопросов по способностям (с ультами) + 3 иконки
  const ults = shuffle(abilityQs.filter((q) => q.kind === "ultimate"));
  const rest = shuffle(abilityQs.filter((q) => q.kind !== "ultimate"));
  const iconCount = 3;
  const abCount = Math.min(9, ults.length + rest.length);
  const picked: QuizQuestion[] = [];
  for (const q of ults.slice(0, Math.min(ults.length, 3))) picked.push(q);
  for (const q of rest) {
    if (picked.length >= abCount) break;
    picked.push(q);
  }
  for (const q of shuffle(iconQs).slice(0, iconCount)) picked.push(q);

  const questions = shuffle(picked);

  return NextResponse.json({
    bank: { abilities: abilityQs.length, heroes: optionPool.length },
    questions,
  });
}
