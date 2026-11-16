"use client";

import { useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import type { HeroRow } from "@/lib/site";
import { fmtInt } from "@/lib/site";
import { HeroIcon, SectionHeader, TypeChip, WinRateBadge, countLabel } from "./shared";

/**
 * Гайды на ВСЕХ героев каталога (не только топ-12): каждый герой получает
 * авто-гайд из статистики матчей. Для удобства — поиск и сортировка по матчу/винрейту.
 */
export function GuidesSection({ heroes, onOpenHero }: { heroes: HeroRow[]; onOpenHero: (id: number) => void }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"matches" | "winRate" | "name">("matches");

  const list = useMemo(() => {
    let l = [...heroes];
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      l = l.filter((h) => h.name.toLowerCase().includes(s) || (h.nameRu ?? "").toLowerCase().includes(s));
    }
    if (sort === "matches") l.sort((a, b) => (b.stat?.matches ?? 0) - (a.stat?.matches ?? 0));
    if (sort === "winRate") l.sort((a, b) => (b.stat?.winRate ?? 0) - (a.stat?.winRate ?? 0));
    if (sort === "name") l.sort((a, b) => a.name.localeCompare(b.name));
    return l;
  }, [heroes, q, sort]);

  return (
    <section className="container-dl py-10">
      <SectionHeader
        kicker="Генерируются из данных матчей"
        title="Гайды"
        lead="Авто-гайд на каждого героя каталога — все способности с цифрами, базовые характеристики, сильные и слабые матчапы, топ-предметы и билд по стадиям игры. Обновляется вместе со статистикой — без ручной работы."
        right={
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-1 text-xs text-[var(--muted2)]">
            <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden />
            {countLabel(heroes.length, "герой", "героя", "героев")} с гайдом
          </span>
        }
      />

      <div className="mb-5 flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel2)] p-3 text-xs text-[var(--muted2)]">
        <Sparkles className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
        Каждый гайд собирается автоматически: матрица контрпиков, топ-предметы по винрейту
        и порядок покупок по среднему времени покупки в реальных матчах. Нажмите на героя — гайд откроется во вкладках карточки.
      </div>

      {/* поиск + сортировка: находим нужного героя среди всех */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted2)]" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск героя..."
            className="w-full rounded-full border border-[var(--line)] bg-[var(--panel)] py-2 pl-9 pr-4 text-sm outline-none placeholder:text-[var(--muted2)] focus:border-[var(--accent)]"
            aria-label="Поиск героя в гайдах"
          />
        </div>
        <div className="inline-flex rounded-full border border-[var(--line)] bg-[var(--panel)] p-1">
          {([
            { k: "matches", label: "По популярности" },
            { k: "winRate", label: "По винрейту" },
            { k: "name", label: "По имени" },
          ] as const).map(({ k, label }) => (
            <button
              key={k}
              type="button"
              onClick={() => setSort(k)}
              className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${sort === k ? "bg-[var(--accent)] font-semibold text-[#0D1110]" : "text-[var(--muted2)] hover:text-[var(--ink)]"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-[var(--muted2)]">Показано: {countLabel(list.length, "герой", "героя", "героев")}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => onOpenHero(h.id)}
            className="card-dl group flex items-center gap-4 p-4 text-left transition-transform hover:-translate-y-0.5"
            style={{ borderLeft: `3px solid ${h.colorHex}` }}
          >
            <HeroIcon hero={h} size={56} rounded={10} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-display text-sm font-bold group-hover:text-[var(--accent)]">{h.name}</span>
                {h.stat ? <WinRateBadge wr={h.stat.winRate} small /> : null}
              </div>
              <div className="mt-1"><TypeChip type={h.heroType} complexity={h.complexity} /></div>
              <div className="mt-1 text-[11px] text-[var(--muted2)]">
                {h.hasExtras
                  ? `Способности · матчапы · билд · ${h.stat ? countLabel(h.stat.matches, "матч", "матча", "матчей") : "данные"}`
                  : "Гайд появится после синхронизации"}
              </div>
            </div>
            <span className="text-[var(--accent)] transition-transform group-hover:translate-x-1">→</span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="card-dl p-8 text-center text-sm text-[var(--muted2)]">Герой не найден — попробуйте другое имя</div>
      ) : null}
    </section>
  );
}
