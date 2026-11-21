import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs, PageShell } from "@/components/pages/page-shell";
import { getPatches, sanitizeHtml, type Patch } from "@/lib/pages-data";
import { patchSlug } from "@/lib/slugs";

export const dynamicParams = false;

function findPatch(slug: string): Patch | undefined {
  return getPatches().find((p) => patchSlug(p) === slug);
}

function plain(html?: string | null): string {
  return String(html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export async function generateStaticParams() {
  return getPatches().map((p) => ({ slug: patchSlug(p) }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const patch = findPatch(slug);
  if (!patch) return { title: "Патч не найден | Deadlock//RU" };

  const title = `${patch.titleRu || patch.title} — Deadlock`;
  const description = plain(patch.contentRu || patch.content).slice(0, 300) || "Обновление Deadlock от Valve.";

  return {
    title,
    description,
    alternates: { canonical: `/patches/${slug}/` },
    openGraph: {
      title,
      description,
      url: `/patches/${slug}/`,
      type: "article",
      publishedTime: patch.pubDate,
      images: patch.imageUrl ? [{ url: patch.imageUrl }] : undefined,
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function PatchPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const patch = findPatch(slug);
  if (!patch) notFound();

  const patches = [...getPatches()].sort((a, b) => (b.pubDate || "").localeCompare(a.pubDate || ""));
  const idx = patches.findIndex((p) => p.id === patch.id);
  const prev = idx > 0 ? patches[idx - 1] : null;
  const next = idx >= 0 && idx < patches.length - 1 ? patches[idx + 1] : null;

  const body = sanitizeHtml(patch.contentRu || patch.content);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: patch.titleRu || patch.title,
    datePublished: patch.pubDate,
    dateModified: patch.pubDate,
    inLanguage: "ru",
    mainEntityOfPage: `https://deadlockru.ru/patches/${slug}/`,
    author: { "@type": "Organization", name: "Valve" },
    publisher: { "@type": "Organization", name: "Deadlock//RU" },
  };

  return (
    <PageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="container-dl py-8">
        <Breadcrumbs
          items={[
            { href: "/", label: "Главная" },
            { href: "/patches/", label: "Патчи" },
            { label: fmtDate(patch.pubDate) },
          ]}
        />

        <article className="mx-auto max-w-3xl">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted2)]">
            <time dateTime={patch.pubDate}>{fmtDate(patch.pubDate)}</time>
            {patch.isPatch ? (
              <span className="rounded border border-[var(--accent)] px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--accent)]">
                патч
              </span>
            ) : null}
            <span>· источник: Valve</span>
          </div>

          <h1 className="mt-3 font-display text-2xl font-bold leading-tight tracking-tight md:text-3xl">
            {patch.titleRu || patch.title}
          </h1>

          <div
            className="patch-content mt-6 space-y-3 text-sm leading-relaxed text-[var(--ink)] [&_a]:text-[var(--accent)] [&_a]:underline [&_h1]:mt-5 [&_h1]:font-display [&_h1]:text-lg [&_h1]:font-bold [&_h2]:mt-5 [&_h2]:font-display [&_h2]:text-base [&_h2]:font-bold [&_h3]:mt-4 [&_h3]:font-semibold [&_img]:my-3 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md [&_li]:ml-5 [&_li]:list-disc [&_p]:my-2 [&_strong]:text-[var(--ink)] [&_ul]:my-2"
            dangerouslySetInnerHTML={{ __html: body }}
          />

          <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-5 text-sm">
            <a
              href={patch.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--muted2)] transition-colors hover:text-[var(--ink)]"
            >
              Оригинал в Steam ↗
            </a>
            <Link href="/patches/" className="text-[var(--accent)] hover:text-[var(--ink)]">
              ← Все патчи
            </Link>
          </div>

          <nav className="mt-8 grid gap-3 sm:grid-cols-2" aria-label="Соседние патчи">
            {prev ? (
              <Link href={`/patches/${patchSlug(prev)}/`} className="card-dl p-3 transition-colors hover:border-[var(--accent)]">
                <span className="block text-[11px] text-[var(--muted2)]">← Новее</span>
                <span className="mt-0.5 block text-sm font-semibold">{prev.titleRu || prev.title}</span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link href={`/patches/${patchSlug(next)}/`} className="card-dl p-3 text-right transition-colors hover:border-[var(--accent)]">
                <span className="block text-[11px] text-[var(--muted2)]">Старее →</span>
                <span className="mt-0.5 block text-sm font-semibold">{next.titleRu || next.title}</span>
              </Link>
            ) : null}
          </nav>
        </article>
      </div>
    </PageShell>
  );
}
