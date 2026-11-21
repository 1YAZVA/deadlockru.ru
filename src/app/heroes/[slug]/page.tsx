import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs, PageShell, Pill } from "@/components/pages/page-shell";
import { getHeroes, htmlToParagraphs, type Hero } from "@/lib/pages-data";
import { heroSlug } from "@/lib/slugs";

export const dynamicParams = false;

const TYPE_RU: Record<string, string> = {
  brawler: "Бойцы",
  marksman: "Стрелки",
  mystic: "Мистики",
  assassin: "Убийцы",
};

const STAT_ROWS: { key: string; label: string }[] = [
  { key: "max_health", label: "Здоровье" },
  { key: "max_move_speed", label: "Скорость передвижения" },
  { key: "sprint_speed", label: "Ускорение (рывок)" },
  { key: "crouch_speed", label: "Скорость в приседе" },
  { key: "move_acceleration", label: "Ускорение" },
  { key: "light_melee_damage", label: "Лёгкая атака в ближнем бою" },
  { key: "heavy_melee_damage", label: "Тяжёлая атака в ближнем бою" },
  { key: "stamina", label: "Выносливость" },
  { key: "base_health_regen", label: "Регенерация здоровья" },
  { key: "weapon_power", label: "Сила оружия" },
];

function findHero(slug: string): Hero | undefined {
  return getHeroes().find((h) => heroSlug(h) === slug);
}

function shortText(hero: Hero): string {
  const first = htmlToParagraphs(hero.description)[0] ?? "";
  const clean = first.replace(/\s+/g, " ").trim();
  if (clean.length <= 158) return clean;
  return `${clean.slice(0, 155).replace(/[.,;:\s]+\S*$/, "")}…`;
}

export async function generateStaticParams() {
  return getHeroes().map((h) => ({ slug: heroSlug(h) }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const hero = findHero(slug);
  if (!hero) return { title: "Герой не найден | Deadlock//RU" };

  const typeRu = TYPE_RU[hero.heroType] ?? hero.heroType;
  const title = `${hero.name}${hero.nameRu ? ` (${hero.nameRu})` : ""} в Deadlock — способности, статы и винрейт`;
  const description =
    shortText(hero) ||
    `${hero.name} в Deadlock: роль, базовые характеристики и винрейт по реальным матчам.`;
  return {
    title,
    description,
    alternates: { canonical: `/heroes/${slug}/` },
    openGraph: {
      title,
      description,
      url: `/heroes/${slug}/`,
      type: "article",
      images: hero.iconCard ? [{ url: hero.iconCard, alt: `${hero.name} — Deadlock` }] : undefined,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function HeroPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const hero = findHero(slug);
  if (!hero) notFound();

  const heroes = getHeroes();
  const paragraphs = htmlToParagraphs(hero.description);
  const lore = htmlToParagraphs(hero.lore);
  const related = heroes
    .filter((h) => h.id !== hero.id && h.heroType === hero.heroType)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 8);

  const typeRu = TYPE_RU[hero.heroType] ?? hero.heroType;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Thing",
    name: `${hero.name}${hero.nameRu ? ` (${hero.nameRu})` : ""}`,
    description: shortText(hero) || hero.descriptionEn || hero.name,
    image: hero.iconCard ? `https://deadlockru.ru${hero.iconCard}` : undefined,
    url: `https://deadlockru.ru/heroes/${slug}/`,
    isPartOf: { "@type": "VideoGame", name: "Deadlock", url: "https://deadlockru.ru/" },
  };

  return (
    <PageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="container-dl py-8">
        <Breadcrumbs
          items={[{ href: "/", label: "Главная" }, { href: "/heroes/", label: "Герои" }, { label: hero.name }]}
        />

        <div className="grid gap-8 lg:grid-cols-[300px_1fr]">
          <div>
            <div className="card-dl overflow-hidden" style={{ borderTop: `2px solid ${hero.colorHex}` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={hero.iconCard}
                alt={`${hero.name} — герой Deadlock`}
                width={300}
                height={407}
                className="h-auto w-full object-cover"
              />
            </div>
            {hero.stat ? (
              <div className="card-dl mt-3 grid grid-cols-2 gap-3 p-4 text-center">
                <div>
                  <div className="font-display text-lg font-bold" style={{ color: hero.stat.winRate >= 50 ? "var(--ok)" : "var(--danger)" }}>
                    {hero.stat.winRate.toFixed(1)}%
                  </div>
                  <div className="text-[11px] text-[var(--muted2)]">винрейт</div>
                </div>
                <div>
                  <div className="font-display text-lg font-bold">{hero.stat.pickRate.toFixed(1)}%</div>
                  <div className="text-[11px] text-[var(--muted2)]">пик-рейт</div>
                </div>
              </div>
            ) : null}
          </div>

          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
              {hero.name}
              {hero.nameRu ? <span className="text-[var(--muted2)]"> — {hero.nameRu}</span> : null}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Pill color={hero.colorHex}>{typeRu}</Pill>
              <Pill>Сложность: {hero.complexity}/3</Pill>
              {(hero.tags ?? []).map((t) => (
                <Pill key={t}>{t}</Pill>
              ))}
            </div>

            {hero.heroRole ? (
              <p className="mt-4 border-l-2 border-[var(--accent)] pl-3 text-sm italic text-[var(--muted2)]">
                {hero.heroRole}
              </p>
            ) : null}

            <div className="mt-5 space-y-3 text-sm leading-relaxed text-[var(--ink)]">
              {paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>

            {hero.stat ? (
              <div className="mt-7">
                <h2 className="font-display text-base font-bold">Статистика по реальным матчам</h2>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[
                    { label: "Матчей", value: hero.stat.matches.toLocaleString("ru-RU") },
                    { label: "KDA", value: hero.stat.kda?.toFixed(2) ?? "—" },
                    { label: "Средние души", value: Math.round(hero.stat.avgNetWorth ?? 0).toLocaleString("ru-RU") },
                    { label: "Убийств", value: Math.round(hero.stat.kills ?? 0).toLocaleString("ru-RU") },
                    { label: "Смертей", value: Math.round(hero.stat.deaths ?? 0).toLocaleString("ru-RU") },
                    { label: "Помощи", value: Math.round(hero.stat.assists ?? 0).toLocaleString("ru-RU") },
                  ].map((s) => (
                    <div key={s.label} className="card-dl px-3 py-2">
                      <div className="font-display text-sm font-bold">{s.value}</div>
                      <div className="text-[11px] text-[var(--muted2)]">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-7">
              <h2 className="font-display text-base font-bold">Базовые характеристики</h2>
              <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                {STAT_ROWS.filter((r) => hero.startingStats?.[r.key] != null).map((r) => (
                  <div key={r.key} className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] py-1.5">
                    <dt className="text-[var(--muted2)]">{r.label}</dt>
                    <dd className="font-medium">{hero.startingStats[r.key]}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {lore.length ? (
              <div className="mt-7">
                <h2 className="font-display text-base font-bold">Лор</h2>
                <div className="mt-3 space-y-3 text-sm leading-relaxed text-[var(--muted2)]">
                  {lore.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {related.length ? (
          <section className="mt-12">
            <h2 className="font-display text-lg font-bold">Другие герои типа «{typeRu}»</h2>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {related.map((h) => (
                <Link
                  key={h.id}
                  href={`/heroes/${heroSlug(h)}/`}
                  className="group card-dl flex items-center gap-3 p-3 transition-colors hover:border-[var(--accent)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={h.iconSmall} alt={h.name} width={44} height={44} loading="lazy" className="h-11 w-11 rounded-md object-cover" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold group-hover:text-[var(--accent)]">{h.name}</span>
                    {h.nameRu ? <span className="block truncate text-[11px] text-[var(--muted2)]">{h.nameRu}</span> : null}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <div className="mt-10 flex flex-wrap gap-3 text-sm">
          <Link href="/heroes/" className="text-[var(--accent)] hover:text-[var(--ink)]">
            ← Все герои
          </Link>
          <Link href="/" className="text-[var(--muted2)] hover:text-[var(--ink)]">
            На портал Deadlock//RU
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
