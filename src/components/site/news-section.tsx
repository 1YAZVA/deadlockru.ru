"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ExternalLink, FileText, Languages, Search } from "lucide-react";
import type { PatchRow } from "@/lib/site";
import { apiGet, fmtDateTime, sanitizeHtml, viaImgProxy } from "@/lib/site";
import { SectionHeader, Spinner, FreshChip, countLabel } from "./shared";

type Filter = "all" | "patches" | "news";

export function NewsSection() {
  const [items, setItems] = useState<PatchRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // какие записи показываем в оригинале (если есть официальный русский перевод)
  const [showOriginal, setShowOriginal] = useState<Set<string>>(new Set());
  const [lastAt, setLastAt] = useState<string | null>(null);

  const load = useCallback(async (f: Filter, p: number, q: string) => {
    setLoading(true);
    try {
      const data = await apiGet<{ total: number; items: PatchRow[] }>(
        `/api/patches?filter=${f}&page=${p}&pageSize=8&search=${encodeURIComponent(q)}`
      );
      setItems(data.items);
      setTotal(data.total);
      if (data.items.length > 0) setLastAt(data.items[0].pubDate);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filter, page, search);
  }, [load, filter, page, search]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleOriginal = (id: string) =>
    setShowOriginal((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pages = Math.max(1, Math.ceil(total / 8));

  return (
    <section className="container-dl py-10">
      <SectionHeader
        kicker="Автоматическая лента"
        title="Новости и патчи"
        lead="Официальные новости Valve из Steam и changelog с форумов playdeadlock.com — попадают на сайт автоматически, каждый час. Патчи показываем на русском (официальный перевод Valve), рядом доступен оригинал."
        right={<FreshChip at={lastAt} prefix="Свежая запись" />}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-full border border-[var(--line)] bg-[var(--panel)] p-1">
          {([
            { k: "all", label: "Всё" },
            { k: "patches", label: "Патчи" },
            { k: "news", label: "Обновления" },
          ] as { k: Filter; label: string }[]).map(({ k, label }) => (
            <button
              key={k}
              type="button"
              onClick={() => { setFilter(k); setPage(1); }}
              className={`rounded-full px-4 py-1.5 text-sm transition-colors ${filter === k ? "bg-[var(--accent)] font-semibold text-[#0D1110]" : "text-[var(--muted2)] hover:text-[var(--ink)]"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative ml-auto w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted2)]" aria-hidden />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Поиск по заголовкам..."
            className="w-full rounded-full border border-[var(--line)] bg-[var(--panel)] py-2 pl-9 pr-4 text-sm outline-none transition-colors placeholder:text-[var(--muted2)] focus:border-[var(--accent)]"
            aria-label="Поиск по новостям"
          />
        </div>
      </div>

      {loading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <div className="card-dl p-8 text-center text-sm text-[var(--muted2)]">Ничего не найдено</div>
      ) : (
        <div className="space-y-4">
          {items.map((p) => {
            const isOpen = expanded.has(p.id);
            const hasRu = Boolean(p.titleRu || p.contentRu);
            const wantOriginal = showOriginal.has(p.id) || !hasRu;
            const title = wantOriginal ? p.title : p.titleRu || p.title;
            const content = wantOriginal ? p.content : p.contentRu || p.content;
            const thumb = p.imageUrl ? viaImgProxy(p.imageUrl) : "";
            return (
              <article key={p.id} className="card-dl overflow-hidden">
                <button type="button" onClick={() => toggle(p.id)} className="flex w-full items-start gap-4 p-5 text-left">
                  {thumb ? (
                    <img
                      src={thumb}
                      alt=""
                      loading="lazy"
                      className="news-thumb"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  ) : (
                    <span className="news-thumb-fallback" aria-hidden>
                      <FileText className="h-6 w-6 text-[var(--muted2)]" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--muted2)]">
                      <span
                        className="rounded-full px-2 py-0.5 font-semibold"
                        style={{
                          color: p.isPatch ? "var(--accent)" : "var(--spirit)",
                          border: `1px solid ${p.isPatch ? "var(--accent)" : "var(--spirit)"}`,
                        }}
                      >
                        {p.isPatch ? "Патч" : "Обновление"}
                      </span>
                      <span>{p.source === "steam" ? "Steam" : "Форум Valve"}</span>
                      {p.category ? <span>· {p.category}</span> : null}
                      <span>· {fmtDateTime(p.pubDate)}</span>
                      {hasRu && !wantOriginal ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--ok)] px-2 py-0.5 text-[10px] font-semibold text-[var(--ok)]">
                          <Languages className="h-3 w-3" aria-hidden /> Русский · перевод Valve
                        </span>
                      ) : null}
                    </div>
                    <h3 className="mt-1.5 font-display text-base font-bold leading-snug md:text-lg">{title}</h3>
                  </div>
                  <ChevronDown className={`mt-1 h-5 w-5 shrink-0 text-[var(--muted2)] transition-transform ${isOpen ? "rotate-180" : ""}`} aria-hidden />
                </button>
                {isOpen ? (
                  <div className="fade-in border-t border-[var(--line)] px-5 pb-5 pt-4">
                    <div className="patch-content" dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }} />
                    <div className="mt-4 flex flex-wrap items-center gap-4">
                      <a
                        href={p.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-[var(--accent)] hover:underline"
                      >
                        Источник <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                      </a>
                      {hasRu ? (
                        <button
                          type="button"
                          onClick={() => toggleOriginal(p.id)}
                          className="inline-flex items-center gap-1.5 text-sm text-[var(--muted2)] transition-colors hover:text-[var(--ink)]"
                        >
                          <Languages className="h-3.5 w-3.5" aria-hidden />
                          {wantOriginal ? "Показать русский перевод" : "Показать оригинал (EN)"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {pages > 1 ? (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-40"
          >
            Назад
          </button>
          <span className="text-sm text-[var(--muted2)]">
            {page} / {pages} · {countLabel(total, "запись", "записи", "записей")}
          </span>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-40"
          >
            Вперёд
          </button>
        </div>
      ) : null}
    </section>
  );
}
