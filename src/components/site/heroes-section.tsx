"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { HeroRow } from "@/lib/site";
import { HERO_TYPE_RU } from "@/lib/site";
import { HeroIcon, SafeImg, SectionHeader, TypeChip, WinRateBadge, WrBar, countLabel, DropdownSelect } from "./shared";

type SortKey = "name" | "winRate" | "matches" | "pickRate";
type TypeFilter = "all" | "mystic" | "marksman" | "brawler" | "assassin";

const HERO_SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "name", label: "По имени" },
  { value: "winRate", label: "По винрейту" },
  { value: "pickRate", label: "По пик-рейту" },
  { value: "matches", label: "По числу матчей" },
];

export function HeroesSection({ heroes, onOpenHero }: { heroes: HeroRow[]; onOpenHero: (id: number) => void }) {
  const [q, setQ] = useState("");
  const [typeF, setTypeF] = useState<TypeFilter>("all");
  const [sort, setSort] = useState<SortKey>("name");

  const list = useMemo(() => {
    let l = [...heroes];
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      l = l.filter((h) => h.name.toLowerCase().includes(s) || (h.tags ?? []).some((t) => t.toLowerCase().includes(s)));
    }
    if (typeF !== "all") l = l.filter((h) => h.heroType === typeF);
    if (sort === "name") l.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "winRate") l.sort((a, b) => (b.stat?.winRate ?? 0) - (a.stat?.winRate ?? 0));
    if (sort === "pickRate") l.sort((a, b) => (b.stat?.pickRate ?? 0) - (a.stat?.pickRate ?? 0));
    if (sort === "matches") l.sort((a, b) => (b.stat?.matches ?? 0) - (a.stat?.matches ?? 0));
    return l;
  }, [heroes, q, typeF, sort]);

  return (
    <section className="container-dl py-10">
      <SectionHeader
        kicker={`${countLabel(heroes.length, "герой", "героя", "героев")} в каталоге`}
        title="Герои"
        lead="Нажмите на героя: способности с цифрами, базовые характеристики, винрейт за 30 дней, топ-предметы, автобилд по стадиям и матрица контрпиков — всё из реальных матчей."
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted2)]" aria-hidden />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск героя..."
            className="w-full rounded-full border border-[var(--line)] bg-[var(--panel)] py-2 pl-9 pr-4 text-sm outline-none placeholder:text-[var(--muted2)] focus:border-[var(--accent)]"
            aria-label="Поиск героя"
          />
        </div>
        <div className="inline-flex rounded-full border border-[var(--line)] bg-[var(--panel)] p-1">
          {([
            { k: "all", label: "Все" },
            { k: "mystic", label: HERO_TYPE_RU.mystic.label },
            { k: "marksman", label: HERO_TYPE_RU.marksman.label },
            { k: "brawler", label: HERO_TYPE_RU.brawler.label },
            { k: "assassin", label: HERO_TYPE_RU.assassin.label },
          ] as { k: TypeFilter; label: string }[]).map(({ k, label }) => (
            <button
              key={k}
              type="button"
              onClick={() => setTypeF(k)}
              className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${typeF === k ? "bg-[var(--accent)] font-semibold text-[#0D1110]" : "text-[var(--muted2)] hover:text-[var(--ink)]"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <DropdownSelect
            label="Сортировка"
            value={sort}
            options={HERO_SORT_OPTIONS}
            onChange={setSort}
            ariaLabel="Сортировка героев"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {list.map((h) => (
          <button
            key={h.id}
            type="button"
            onClick={() => onOpenHero(h.id)}
            className="group card-dl overflow-hidden text-left transition-transform hover:-translate-y-0.5"
            style={{ borderTop: `2px solid ${h.colorHex}` }}
          >
            {/* портретный формат 280/380 — родной пропорции арта из deadlock-api:
                герой виден целиком, без обрезки рогов и головы */}
            <div className="relative aspect-[280/380] overflow-hidden bg-[#121614]">
              {h.iconCard ? (
                <SafeImg
                  src={h.iconCard}
                  alt={h.name}
                  width="100%"
                  height="100%"
                  className="hero-card-img h-full w-full"
                  style={{ borderRadius: 0, border: "none", background: "transparent", objectFit: "cover", objectPosition: "top center" }}
                  fallbackText={h.name.slice(0, 2)}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-2xl font-display text-[var(--muted2)]">{h.name.slice(0, 1)}</div>
              )}
              {h.stat ? (
                <div className="absolute right-2 top-2">
                  <WinRateBadge wr={h.stat.winRate} small />
                </div>
              ) : null}
            </div>
            <div className="p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-display text-sm font-bold group-hover:text-[var(--accent)]">{h.name}</span>
                {h.nameRu ? <span className="shrink-0 text-[10px] text-[var(--muted2)]">{h.nameRu}</span> : null}
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <TypeChip type={h.heroType} complexity={h.complexity} />
              </div>
              {h.stat ? (
                <div className="mt-2">
                  <WrBar wr={h.stat.winRate} />
                  <div className="mt-1 flex justify-between text-[10px] text-[var(--muted2)]">
                    <span>пик {h.stat.pickRate.toFixed(1)}%</span>
                    <span>{countLabel(h.stat.matches, "матч", "матча", "матчей")}</span>
                  </div>
                </div>
              ) : null}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
