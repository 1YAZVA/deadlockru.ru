import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs, PageShell, Pill } from "@/components/pages/page-shell";
import { getItems, sanitizeHtml, type Item } from "@/lib/pages-data";
import { itemSlug } from "@/lib/slugs";

export const dynamicParams = false;

const SLOT_META: Record<string, { label: string; color: string }> = {
  weapon: { label: "Оружие", color: "var(--weapon)" },
  spirit: { label: "Спиритизм", color: "var(--spirit)" },
  vitality: { label: "Живучесть", color: "var(--vitality)" },
};

const ROMAN = ["I", "II", "III", "IV", "V"];

function findItem(slug: string): Item | undefined {
  return getItems().find((i) => itemSlug(i) === slug);
}

function plain(text?: string | null): string {
  return String(text ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function generateStaticParams() {
  return getItems().map((i) => ({ slug: itemSlug(i) }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const item = findItem(slug);
  if (!item) return { title: "Предмет не найден | Deadlock//RU" };

  const slot = SLOT_META[item.slotType]?.label ?? "Предмет";
  const tier = ROMAN[item.tier - 1] ?? String(item.tier);
  const title = `${item.name}${item.nameRu ? ` (${item.nameRu})` : ""} — предмет Deadlock, ${item.cost ? `${item.cost} душ` : "бесплатно"}`;
  const desc = plain(item.description) || `${item.name} в Deadlock: свойства, стоимость и статистика покупки.`;
  const description = `${slot}, тир ${tier}${item.cost ? `, ${item.cost} душ` : ""}. ${desc}`.slice(0, 300);

  return {
    title,
    description,
    alternates: { canonical: `/items/${slug}/` },
    openGraph: {
      title,
      description,
      url: `/items/${slug}/`,
      type: "article",
      images: item.image ? [{ url: item.image, alt: item.name }] : undefined,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ItemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const item = findItem(slug);
  if (!item) notFound();

  const all = getItems();
  const slot = SLOT_META[item.slotType] ?? { label: "Прочее", color: "var(--accent)" };
  const tierRom = ROMAN[item.tier - 1] ?? String(item.tier);

  const byClass = new Map(all.map((i) => [i.className, i]));
  const components = (item.components ?? []).map((c) => byClass.get(c)).filter(Boolean) as Item[];

  const similar = all
    .filter((i) => i.id !== item.id && i.slotType === item.slotType && i.tier === item.tier)
    .sort((a, b) => (b.stat?.winRate ?? 0) - (a.stat?.winRate ?? 0))
    .slice(0, 6);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Thing",
    name: item.name,
    description: plain(item.description) || item.descriptionEn || item.name,
    image: item.image ? `https://deadlockru.ru${item.image}` : undefined,
    url: `https://deadlockru.ru/items/${slug}/`,
    additionalType: "https://schema.org/VideoGameSeries",
  };

  return (
    <PageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="container-dl py-8">
        <Breadcrumbs
          items={[
            { href: "/", label: "Главная" },
            { href: "/items/", label: "Предметы" },
            { label: item.name },
          ]}
        />

        <div className="grid gap-8 md:grid-cols-[220px_1fr]">
          <div>
            <div className="card-dl p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.shopImage || item.image}
                alt={`${item.name} — предмет Deadlock`}
                width={188}
                height={188}
                className="mx-auto h-auto w-full max-w-[188px] object-contain"
              />
              <div className="mt-3 text-center font-display text-lg font-bold text-[var(--accent)]">
                {item.cost ? `${item.cost.toLocaleString("ru-RU")} душ` : "Бесплатно"}
              </div>
            </div>
          </div>

          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
              {item.name}
              {item.nameRu ? <span className="text-[var(--muted2)]"> — {item.nameRu}</span> : null}
            </h1>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Pill color={slot.color}>{slot.label}</Pill>
              <Pill>Тир {tierRom}</Pill>
              {item.stat ? <Pill>{item.stat.winRate.toFixed(1)}% винрейт</Pill> : null}
            </div>

            {item.description ? (
              <div
                className="ability-desc mt-5 text-sm leading-relaxed text-[var(--ink)] [&_span]:text-[var(--accent)]"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.description) }}
              />
            ) : null}

            {item.props?.length ? (
              <div className="mt-6">
                <h2 className="font-display text-base font-bold">Свойства</h2>
                <dl className="mt-3 space-y-1.5 text-sm">
                  {item.props.map((p, i) => (
                    <div key={`${p.label}-${i}`} className="flex items-baseline justify-between gap-4 border-b border-[var(--line)] py-1.5">
                      <dt className="text-[var(--muted2)]">{p.label}</dt>
                      <dd className="whitespace-nowrap font-medium">
                        {p.value}
                        {p.postfix ? <span className="text-[var(--muted2)]">{p.postfix}</span> : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}

            {components.length ? (
              <div className="mt-6">
                <h2 className="font-display text-base font-bold">Собирается из</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {components.map((c) => (
                    <Link
                      key={c.id}
                      href={`/items/${itemSlug(c)}/`}
                      className="card-dl flex items-center gap-2 px-2.5 py-1.5 text-sm transition-colors hover:border-[var(--accent)]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={c.image} alt={c.name} width={24} height={24} loading="lazy" className="h-6 w-6 rounded" />
                      {c.name}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            {item.stat ? (
              <div className="mt-6">
                <h2 className="font-display text-base font-bold">Статистика покупки</h2>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {[
                    { label: "Винрейт", value: `${item.stat.winRate.toFixed(1)}%` },
                    { label: "Матчей", value: item.stat.matches.toLocaleString("ru-RU") },
                    { label: "Игроков", value: item.stat.players.toLocaleString("ru-RU") },
                  ].map((s) => (
                    <div key={s.label} className="card-dl px-3 py-2">
                      <div className="font-display text-sm font-bold">{s.value}</div>
                      <div className="text-[11px] text-[var(--muted2)]">{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {similar.length ? (
          <section className="mt-12">
            <h2 className="font-display text-lg font-bold">
              Другие предметы тира {tierRom} · {slot.label}
            </h2>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {similar.map((s) => (
                <Link
                  key={s.id}
                  href={`/items/${itemSlug(s)}/`}
                  className="group card-dl flex items-center gap-2.5 p-2.5 transition-colors hover:border-[var(--accent)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.image} alt={s.name} width={32} height={32} loading="lazy" className="h-8 w-8 rounded" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold group-hover:text-[var(--accent)]">{s.name}</span>
                    <span className="block text-[11px] text-[var(--muted2)]">
                      {s.cost ? `${s.cost.toLocaleString("ru-RU")} душ` : "бесплатно"}
                      {s.stat ? ` · ${s.stat.winRate.toFixed(1)}%` : ""}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <div className="mt-10 flex flex-wrap gap-3 text-sm">
          <Link href="/items/" className="text-[var(--accent)] hover:text-[var(--ink)]">
            ← Все предметы
          </Link>
          <Link href="/" className="text-[var(--muted2)] hover:text-[var(--ink)]">
            На портал Deadlock//RU
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
