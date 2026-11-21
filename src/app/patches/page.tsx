import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs, PageShell } from "@/components/pages/page-shell";
import { getPatches } from "@/lib/pages-data";
import { patchSlug } from "@/lib/slugs";

export const metadata: Metadata = {
  title: "Патчи и обновления Deadlock — все новости Valve | Deadlock//RU",
  description:
    "Лента официальных новостей и патчей Deadlock на русском: балансные правки, новые герои, ивенты и обновления игры. Каждый патч — отдельная страница с полным текстом.",
  alternates: { canonical: "/patches/" },
  openGraph: {
    title: "Патчи и обновления Deadlock",
    description: "Официальные патчи и новости Deadlock на русском — полные тексты обновлений.",
    url: "/patches/",
    type: "website",
  },
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export default function PatchesIndexPage() {
  const patches = [...getPatches()].sort((a, b) => (b.pubDate || "").localeCompare(a.pubDate || ""));

  return (
    <PageShell>
      <div className="container-dl py-8">
        <Breadcrumbs items={[{ href: "/", label: "Главная" }, { label: "Патчи" }]} />

        <h1 className="font-display text-2xl font-bold tracking-tight md:text-3xl">
          Патчи и обновления Deadlock
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--muted2)]">
          Все официальные новости Valve об игре — от балансных правок до новых героев и сезонов. Тексты
          публикуются на русском языке в том виде, в каком их выпускает разработчик. Каждый патч открывается
          отдельной страницей.
        </p>

        {patches.length === 0 ? (
          <p className="mt-8 text-sm text-[var(--muted2)]">Патчи ещё не загружены.</p>
        ) : (
          <ul className="mt-8 space-y-2">
            {patches.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/patches/${patchSlug(p)}/`}
                  className="group card-dl flex flex-wrap items-baseline gap-x-3 gap-y-1 p-4 transition-colors hover:border-[var(--accent)]"
                >
                  <span className="text-xs tabular-nums text-[var(--muted2)]">{fmtDate(p.pubDate)}</span>
                  {p.isPatch ? (
                    <span className="rounded border border-[var(--accent)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--accent)]">
                      патч
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 text-sm font-semibold group-hover:text-[var(--accent)]">
                    {p.titleRu || p.title}
                  </span>
                  <span className="text-xs text-[var(--muted2)] group-hover:text-[var(--ink)]">Читать →</span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-10 text-xs text-[var(--muted2)]">
          <Link href="/" className="text-[var(--accent)] hover:text-[var(--ink)]">
            Вернуться на портал Deadlock//RU
          </Link>{" "}
          — там живой онлайн, мета, лидерборды и статистика игроков.
        </p>
      </div>
    </PageShell>
  );
}
