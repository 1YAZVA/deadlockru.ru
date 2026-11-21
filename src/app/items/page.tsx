import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, PageShell } from "@/components/pages/page-shell";
import { getItems } from "@/lib/pages-data";
import { itemSlug } from "@/lib/slugs";

export const metadata: Metadata = {
  title: "Все предметы Deadlock — магазин, тиры и цены | Deadlock//RU",
  description:
    "Полный каталог предметов Deadlock: оружие, спиритизм и живучесть, тиры от I до V, стоимость в душах и винрейт покупки по реальным матчам. Откройте предмет — свойства, компоненты и статистика.",
  alternates: { canonical: "/items/" },
  openGraph: {
    title: "Все предметы Deadlock — магазин и тиры",
    description: "Каталог предметов Deadlock: тиры, цены, свойства и винрейт покупки.",
    url: "/items/",
    type: "website",
  },
};

const SLOTS: { key: string; label: string; color: string; note: string }[] = [
  { key: "weapon", label: "Оружие", color: "var(--weapon, #C86B4A)", note: "урон, скорострельность, пробитие" },
  { key: "spirit", label: "Спиритизм", color: "var(--spirit, #8A7BD8)", note: "способности, техника, контроль" },
  { key: "vitality", label: "Живучесть", color: "var(--vitality, #4CAD6D)", note: "здоровье, броня, регенерация" },
];

const ROMAN = ["I", "II", "III", "IV", "V"];

export default function ItemsIndexPage() {
  const items = getItems();

  return (
    <PageShell>
      <div className="container-dl py-8">
        <Breadcrumbs items={[{ href: "/", label: "Главная" }, { label: "Предметы" }]} />

        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
          Предметы Deadlock — все {items.length} покупок магазина
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--muted2)]">
          Магазин Deadlock по категориям и тирам: стоимость в душах, свойства и винрейт покупки по реальным
          матчам. На странице предмета — полное описание, список свойств, из каких компонентов собирается
          и какие предметы того же тира стоит рассмотреть.
        </p>

        {items.length === 0 ? (
          <p className="mt-8 text-sm text-[var(--muted2)]">Данные предметов ещё не сгенерированы.</p>
        ) : (
          <div className="mt-8 space-y-10">
            {SLOTS.map((slot) => {
              const list = items
                .filter((i) => i.slotType === slot.key)
                .sort((a, b) => a.tier - b.tier || a.cost - b.cost || a.name.localeCompare(b.name));
              if (!list.length) return null;
              return (
                <section key={slot.key}>
                  <div className="mb-3 flex flex-wrap items-baseline gap-3">
                    <h2 className="font-display text-lg font-bold" style={{ color: slot.color }}>
                      {slot.label}
                    </h2>
                    <span className="text-xs text-[var(--muted2)]">
                      {list.length} предметов · {slot.note}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((i) => (
                      <Link
                        key={i.id}
                        href={`/items/${itemSlug(i)}/`}
                        className="group card-dl flex items-center gap-3 p-2.5 transition-colors hover:border-[var(--accent)]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={i.image || i.shopImage}
                          alt={i.name}
                          width={40}
                          height={40}
                          loading="lazy"
                          className="h-10 w-10 shrink-0 rounded-md border border-[var(--line)] object-cover"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold group-hover:text-[var(--accent)]">
                            {i.name}
                            {i.nameRu ? <span className="ml-1.5 text-[11px] font-normal text-[var(--muted2)]">{i.nameRu}</span> : null}
                          </span>
                          <span className="mt-0.5 flex items-center justify-between gap-2 text-[11px]">
                            <span className="text-[var(--accent)]">
                              T{ROMAN[i.tier - 1] ?? i.tier} · {i.cost ? `${i.cost.toLocaleString("ru-RU")} душ` : "бесплатно"}
                            </span>
                            {i.stat ? <span className="text-[var(--muted2)]">{i.stat.winRate.toFixed(1)}% WR</span> : null}
                          </span>
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <p className="mt-10 text-xs text-[var(--muted2)]">
          Хотите подобрать билд под героя?{" "}
          <Link href="/heroes/" className="text-[var(--accent)] hover:text-[var(--ink)]">
            Откройте каталог героев
          </Link>{" "}
          или{" "}
          <Link href="/" className="text-[var(--accent)] hover:text-[var(--ink)]">
            вернитесь на портал
          </Link>
          .
        </p>
      </div>
    </PageShell>
  );
}
