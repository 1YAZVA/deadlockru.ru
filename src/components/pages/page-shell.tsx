/**
 * Оболочка статических страниц (герои/предметы/патчи): шапка с настоящими
 * ссылками, контент, общий футер портала. Серверный компонент — отдаётся
 * готовым HTML, без ожидания JS.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site/footer";

const NAV = [
  { href: "/heroes/", label: "Герои" },
  { href: "/items/", label: "Предметы" },
  { href: "/patches/", label: "Патчи" },
  { href: "/#meta", label: "Мета" },
  { href: "/#leaderboard", label: "Лидерборд" },
];

export function PageShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[rgba(13,17,16,0.9)] backdrop-blur-md">
        <div className="container-dl flex h-14 items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="whitespace-nowrap font-display text-[15px] font-bold uppercase tracking-[0.14em]"
              aria-label="Deadlock//RU — на главную"
            >
              Deadlock<span className="text-[var(--accent)]">{"//"}</span>RU
            </Link>
            {/* возрастная маркировка — ФЗ-436, на каждой странице */}
            <span
              className="inline-flex h-6 w-6 shrink-0 items-center justify-center bg-black text-[9px] font-bold leading-none text-white"
              title="18+ — информация для совершеннолетних"
              role="img"
              aria-label="Возрастная категория 18+"
            >
              18+
            </span>
          </div>

          <nav className="hidden items-center gap-5 text-sm text-[var(--muted2)] md:flex" aria-label="Разделы">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="transition-colors hover:text-[var(--ink)]">
                {n.label}
              </Link>
            ))}
            <Link
              href="/"
              className="rounded-full border border-[var(--line)] px-3.5 py-1.5 text-[13px] text-[var(--ink)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              На портал
            </Link>
          </nav>

          <Link href="/" className="text-sm text-[var(--accent)] md:hidden">
            На портал
          </Link>
        </div>
      </header>

      <main className="flex-1 pb-10">{children}</main>

      <SiteFooter lastSyncAt={null} />
    </div>
  );
}

export function Breadcrumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="Хлебные крошки" className="mb-5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted2)]">
      {items.map((it, i) => (
        <span key={`${it.label}-${i}`} className="inline-flex items-center gap-1.5">
          {i > 0 ? <span aria-hidden>/</span> : null}
          {it.href ? (
            <Link href={it.href} className="transition-colors hover:text-[var(--ink)]">
              {it.label}
            </Link>
          ) : (
            <span className="text-[var(--ink)]">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function Pill({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
      style={{
        borderColor: color ? `${color}66` : "var(--line)",
        color: color || "var(--muted2)",
        background: color ? `${color}14` : "transparent",
      }}
    >
      {children}
    </span>
  );
}
