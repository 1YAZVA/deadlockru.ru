"use client";

/** ФИШКА 3 — Анализ влияния патчей: сдвиги винрейтов между срезами */
import { useEffect, useMemo, useState } from "react";
import { GitCompareArrows, TrendingDown, TrendingUp } from "lucide-react";
import type { HeroRow } from "@/lib/site";
import { apiGet, fmtDateTime, wrColor } from "@/lib/site";
import { HeroIcon, Spinner, DropdownSelect } from "./shared";

type HistoryData = {
  stamps: string[];
  points: { heroId: number; winRate: number; pickRate: number; matches: number; at: string }[];
};

export function ToolPatchImpact({ heroes, onOpenHero }: { heroes: HeroRow[]; onOpenHero: (id: number) => void }) {
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [idxA, setIdxA] = useState(0);
  const [idxB, setIdxB] = useState(0);

  const heroById = useMemo(() => new Map(heroes.map((h) => [h.id, h])), [heroes]);

  useEffect(() => {
    apiGet<HistoryData>("/api/meta/history?hours=336")
      .then((d) => {
        setData(d);
        if (d.stamps.length >= 2) {
          setIdxA(d.stamps.length - 2);
          setIdxB(d.stamps.length - 1);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const deltas = useMemo(() => {
    if (!data || data.stamps.length < 2) return [];
    const at = data.stamps[idxA];
    const bt = data.stamps[idxB];
    if (!at || !bt) return [];
    const mapA = new Map(data.points.filter((p) => p.at === at).map((p) => [p.heroId, p]));
    const mapB = new Map(data.points.filter((p) => p.at === bt).map((p) => [p.heroId, p]));
    const out: { heroId: number; delta: number; wrA: number; wrB: number; matches: number }[] = [];
    for (const [heroId, b] of mapB) {
      const a = mapA.get(heroId);
      if (!a) continue;
      out.push({ heroId, delta: b.winRate - a.winRate, wrA: a.winRate, wrB: b.winRate, matches: b.matches });
    }
    return out.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
  }, [data, idxA, idxB]);

  if (loading) return <Spinner label="Загружаем срезы винрейтов..." />;

  if (!data || data.stamps.length < 2) {
    return (
      <div className="card-dl p-8 text-center text-sm text-[var(--muted2)]">
        <GitCompareArrows className="mx-auto mb-3 h-8 w-8 text-[var(--muted2)]" aria-hidden />
        Нужны минимум два среза статистики. Планировщик делает снимок винрейтов каждые 2 часа —
        инструмент заработает автоматически после второго цикла.
      </div>
    );
  }

  const stamps = data.stamps;
  const up = deltas.filter((d) => d.delta > 0.05).slice(0, 10);
  const down = deltas.filter((d) => d.delta < -0.05).slice(0, 10);

  return (
    <div>
      <div className="mb-5 flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel2)] p-3 text-xs text-[var(--muted2)]">
        <GitCompareArrows className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
        Выберите два среза винрейтов (например, до и после патча) — покажем, кто вырос, а кто просел.
        Каждый срез делается автоматически каждые 2 часа.
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-4">
        <DropdownSelect
          label="Срез A"
          value={idxA}
          options={stamps.map((s, i) => ({ value: i, label: fmtDateTime(s) }))}
          onChange={setIdxA}
          ariaLabel="Срез A"
          scroll
        />
        <span className="text-[var(--accent)]">→</span>
        <DropdownSelect
          label="Срез B"
          value={idxB}
          options={stamps.map((s, i) => ({ value: i, label: fmtDateTime(s) }))}
          onChange={setIdxB}
          ariaLabel="Срез B"
          scroll
        />
        <span className="text-xs text-[var(--muted2)]">{deltas.length} героев в обоих срезах</span>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="card-dl p-4" style={{ borderTop: "2px solid var(--ok)" }}>
          <h4 className="mb-3 flex items-center gap-2 font-display text-xs uppercase tracking-widest text-[var(--ok)]">
            <TrendingUp className="h-4 w-4" aria-hidden /> Выросли после среза A
          </h4>
          {up.length === 0 ? (
            <p className="py-4 text-center text-xs text-[var(--muted2)]">Заметных ростов нет</p>
          ) : (
            up.map((d) => <DeltaRow key={d.heroId} d={d} heroById={heroById} onOpenHero={onOpenHero} />)
          )}
        </div>
        <div className="card-dl p-4" style={{ borderTop: "2px solid var(--danger)" }}>
          <h4 className="mb-3 flex items-center gap-2 font-display text-xs uppercase tracking-widest text-[var(--danger)]">
            <TrendingDown className="h-4 w-4" aria-hidden /> Просели после среза A
          </h4>
          {down.length === 0 ? (
            <p className="py-4 text-center text-xs text-[var(--muted2)]">Заметных просадок нет</p>
          ) : (
            down.map((d) => <DeltaRow key={d.heroId} d={d} heroById={heroById} onOpenHero={onOpenHero} />)
          )}
        </div>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-[var(--muted2)]">
        Совет: совместите срез B с датой свежего патча из раздела «Новости» — так видно, как Valve изменил баланс.
        Источник срезов: deadlock-api.com (винрейты ранкед-матчей за скользящие 30 дней).
      </p>
    </div>
  );
}

function DeltaRow({
  d, heroById, onOpenHero,
}: {
  d: { heroId: number; delta: number; wrA: number; wrB: number; matches: number };
  heroById: Map<number, HeroRow>;
  onOpenHero: (id: number) => void;
}) {
  const h = heroById.get(d.heroId);
  if (!h) return null;
  const color = wrColor(d.wrB);
  return (
    <button type="button" onClick={() => onOpenHero(d.heroId)} className="lb-row flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left">
      <HeroIcon hero={h} size={32} rounded={6} />
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{h.name}</span>
      <span className="text-xs text-[var(--muted2)]">{d.wrA.toFixed(1)}% → {d.wrB.toFixed(1)}%</span>
      <span className="w-16 text-right font-display text-sm font-bold" style={{ color: d.delta >= 0 ? "var(--ok)" : "var(--danger)" }}>
        {d.delta >= 0 ? "+" : ""}{d.delta.toFixed(2)}
      </span>
      <span className="hidden w-20 text-right text-[10px] text-[var(--muted2)] sm:block">{wrColor(d.delta) ? "" : ""}{d.matches >= 1000 ? `${(d.matches / 1000).toFixed(0)}к матчей` : `${d.matches} матчей`}</span>
    </button>
  );
}
