import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, PageShell, Pill } from "@/components/pages/page-shell";
import { getHeroes } from "@/lib/pages-data";
import { heroSlug } from "@/lib/slugs";

export const metadata: Metadata = {
  title: "Все герои Deadlock — каталог персонажей, роли и винрейт | Deadlock//RU",
  description:
    "Каталог всех героев Deadlock на русском: роли, типы, сложность, базовые характеристики и винрейт по реальным матчам. Переходите на страницу героя — способности, лор и статистика.",
  alternates: { canonical: "/heroes/" },
  openGraph: {
    title: "Все герои Deadlock — каталог персонажей",
    description: "Роли, типы, сложность и винрейт всех героев Deadlock по реальным матчам.",
    url: "/heroes/",
    type: "website",
  },
};

const TYPE_RU: Record<string, string> = {
  brawler: "Бойцы",
  marksman: "Стрелки",
  mystic: "Мистики",
  assassin: "Убийцы",
};

export default function HeroesIndexPage() {
  const heroes = [...getHeroes()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <PageShell>
      <div className="container-dl py-8">
        <Breadcrumbs items={[{ href: "/", label: "Главная" }, { label: "Герои" }]} />

        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
          Герои Deadlock — все {heroes.length} персонажей
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--muted2)]">
          Полный каталог героев Deadlock: роль в команде, тип, сложность освоения и винрейт по реальным
          матчам за последние 30 дней. На странице каждого героя — описание, лор, базовые характеристики,
          теги и ссылки на смежные разделы портала.
        </p>

        {heroes.length === 0 ? (
          <p className="mt-8 text-sm text-[var(--muted2)]">Данные героев ещё не сгенерированы.</p>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {heroes.map((h) => (
              <Link
                key={h.id}
                href={`/heroes/${heroSlug(h)}/`}
                className="group card-dl block overflow-hidden transition-transform hover:-translate-y-0.5"
                style={{ borderTop: `2px solid ${h.colorHex}` }}
              >
                <div className="relative aspect-[280/380] overflow-hidden bg-[#121614]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={h.iconCard}
                    alt={`${h.name} — герой Deadlock`}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover object-top transition-transform group-hover:scale-[1.02]"
                  />
                </div>
                <div className="p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-display text-sm font-bold group-hover:text-[var(--accent)]">{h.name}</span>
                    {h.nameRu ? <span className="shrink-0 text-[10px] text-[var(--muted2)]">{h.nameRu}</span> : null}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Pill color={h.colorHex}>{TYPE_RU[h.heroType] ?? h.heroType}</Pill>
                    {h.stat ? <span className="text-[11px] text-[var(--muted2)]">{h.stat.winRate.toFixed(1)}% WR</span> : null}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <p className="mt-10 text-xs text-[var(--muted2)]">
          Нужна статистика игрока или мета-аналитика?{" "}
          <Link href="/" className="text-[var(--accent)] hover:text-[var(--ink)]">
            Вернуться на портал Deadlock//RU
          </Link>
          .
        </p>
      </div>
    </PageShell>
  );
}
