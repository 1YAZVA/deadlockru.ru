"use client";

/** ФИШКА 1 — Сравнение героев: радар базовых характеристик + мета-статы бок о бок */
import { useEffect, useMemo, useState } from "react";
import { Scale, X } from "lucide-react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip, LineChart, Line, CartesianGrid, XAxis, YAxis } from "recharts";
import type { HeroRow, MetaResponse } from "@/lib/site";
import { apiGet, STAT_RU, fmt1, fmtInt, fmtPct, fmtSouls, wrColor } from "@/lib/site";
import { HeroIcon, TypeChip } from "./shared";

const RADAR_KEYS = ["max_health", "max_move_speed", "weapon_power", "light_melee_damage", "stamina", "tech_range"] as const;

export function ToolCompare({
  heroes, meta,
}: {
  heroes: HeroRow[];
  meta: MetaResponse | null;
}) {
  const [picked, setPicked] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [histPoints, setHistPoints] = useState<{ heroId: number; winRate: number; at: string }[]>([]);

  useEffect(() => {
    apiGet<{ stamps: string[]; points: { heroId: number; winRate: number; at: string }[] }>("/api/meta/history?hours=168")
      .then((d) => setHistPoints(d.points))
      .catch(() => setHistPoints([]));
  }, []);

  const metaMap = useMemo(() => new Map((meta?.rows ?? []).map((r) => [r.heroId, r])), [meta]);
  const heroById = useMemo(() => new Map(heroes.map((h) => [h.id, h])), [heroes]);
  const maxBy = useMemo(() => {
    const m: Record<string, number> = {};
    for (const k of RADAR_KEYS) {
      m[k] = Math.max(1, ...heroes.map((h) => Number(h.startingStats?.[k] ?? 0)));
    }
    return m;
  }, [heroes]);

  const radarData = useMemo(
    () =>
      RADAR_KEYS.map((k) => {
        const row: Record<string, number | string> = { stat: STAT_RU[k] ?? k };
        for (const id of picked) {
          const h = heroById.get(id);
          row[h?.name ?? String(id)] = Number((((h?.startingStats?.[k] ?? 0) / maxBy[k]) * 100).toFixed(1));
        }
        return row;
      }),
    [picked, heroById, maxBy]
  );

  const candidates = useMemo(() => {
    const s = search.trim().toLowerCase();
    return heroes.filter((h) => !picked.includes(h.id) && (!s || h.name.toLowerCase().includes(s))).slice(0, 12);
  }, [heroes, picked, search]);

  const COLORS = ["#C8A96A", "#8C6FD1", "#4CAD6D"];

  const historyChart = useMemo(() => {
    if (!histPoints.length || picked.length === 0) return [];
    const stamps = [...new Set(histPoints.map((p) => p.at))].sort().slice(-30);
    return stamps.map((at) => {
      const row: Record<string, number | string> = {
        t: new Date(at).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) +
          " " + new Date(at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      };
      for (const id of picked) {
        const h = heroById.get(id);
        const pt = histPoints.find((p) => p.at === at && p.heroId === id);
        if (h && pt) row[h.name] = Number(pt.winRate.toFixed(2));
      }
      return row;
    });
  }, [histPoints, picked, heroById]);

  return (
    <div>
      <div className="mb-5 flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel2)] p-3 text-xs text-[var(--muted2)]">
        <Scale className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
        Выберите двух-трёх героев: покажем радар базовых характеристик (нормировано к лучшему в игре) и мета-статы бок о бок.
      </div>

      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Добавить героя..."
            className="mb-3 w-full rounded-full border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-sm outline-none placeholder:text-[var(--muted2)] focus:border-[var(--accent)]"
            aria-label="Добавить героя"
          />
          <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
            {candidates.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => setPicked((p) => (p.length >= 3 ? p : [...p, h.id]))}
                disabled={picked.length >= 3}
                className="flex w-full items-center gap-2.5 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-2 text-left transition-colors hover:border-[var(--accent)] disabled:opacity-40"
              >
                <HeroIcon hero={h} size={30} rounded={6} />
                <span className="flex-1 truncate text-sm">{h.name}</span>
                <TypeChip type={h.heroType} />
              </button>
            ))}
          </div>
        </div>

        <div>
          {picked.length === 0 ? (
            <div className="card-dl flex h-64 items-center justify-center text-sm text-[var(--muted2)]">
              Выберите героев слева — радар и таблица появятся здесь
            </div>
          ) : (
            <>
              <div className="card-dl mb-4 p-4">
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} outerRadius="78%">
                      <PolarGrid stroke="#2A332F" />
                      <PolarAngleAxis dataKey="stat" tick={{ fill: "#8A9490", fontSize: 10 }} />
                      <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                      <Tooltip contentStyle={{ background: "#161C1A", border: "1px solid #2A332F", borderRadius: 10, fontSize: 12, color: "#E8E6E0" }} />
                      {picked.map((id, i) => {
                        const h = heroById.get(id);
                        return (
                          <Radar
                            key={id}
                            name={h?.name ?? String(id)}
                            dataKey={h?.name ?? String(id)}
                            stroke={COLORS[i]}
                            fill={COLORS[i]}
                            fillOpacity={0.15}
                            isAnimationActive={false}
                          />
                        );
                      })}
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {picked.map((id, i) => {
                  const h = heroById.get(id);
                  const m = metaMap.get(id);
                  if (!h) return null;
                  return (
                    <div key={id} className="card-dl p-4" style={{ borderTop: `2px solid ${COLORS[i]}` }}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <HeroIcon hero={h} size={34} rounded={7} />
                          <span className="font-display text-sm font-bold">{h.name}</span>
                        </div>
                        <button type="button" onClick={() => setPicked((p) => p.filter((x) => x !== id))} className="text-[var(--muted2)] hover:text-[var(--danger)]" aria-label="Убрать героя">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="mt-2 space-y-1 text-xs">
                        <div className="flex justify-between"><span className="text-[var(--muted2)]">Винрейт</span><b style={{ color: m ? wrColor(m.winRate) : undefined }}>{m ? fmtPct(m.winRate) : "—"}</b></div>
                        <div className="flex justify-between"><span className="text-[var(--muted2)]">Пик</span><b>{m ? fmtPct(m.pickRate) : "—"}</b></div>
                        <div className="flex justify-between"><span className="text-[var(--muted2)]">KDA</span><b>{m ? fmt1(m.kda) : "—"}</b></div>
                        <div className="flex justify-between"><span className="text-[var(--muted2)]">Ср. нетворс</span><b>{m ? fmtSouls(m.avgNetWorth) : "—"}</b></div>
                        <div className="flex justify-between"><span className="text-[var(--muted2)]">Здоровье</span><b>{fmtInt(h.startingStats?.max_health)}</b></div>
                        <div className="flex justify-between"><span className="text-[var(--muted2)]">Сила оружия</span><b>{fmt1(h.startingStats?.weapon_power)}</b></div>
                        <div className="flex justify-between"><span className="text-[var(--muted2)]">Выносливость</span><b>{fmt1(h.startingStats?.stamina)}</b></div>
                      </div>
                      {m ? (
                        <div className="mt-2 text-[10px] text-[var(--muted2)]">{fmtInt(m.matches)} матчей в срезе</div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {picked.length >= 2 ? (
                <div className="card-dl mt-4 p-4">
                  <h4 className="mb-2 font-display text-xs uppercase tracking-widest text-[var(--accent)]">История винрейта (срез последних 7 дней)</h4>
                  <div className="h-48">
                    {historyChart.length > 1 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={historyChart} margin={{ top: 6, right: 10, bottom: 0, left: -20 }}>
                          <CartesianGrid stroke="#2A332F" strokeDasharray="3 3" vertical={false} />
                          <XAxis dataKey="t" tick={{ fill: "#8A9490", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#2A332F" }} minTickGap={34} />
                          <YAxis tick={{ fill: "#8A9490", fontSize: 10 }} tickLine={false} axisLine={false} width={42} domain={["auto", "auto"]} />
                          <Tooltip contentStyle={{ background: "#161C1A", border: "1px solid #2A332F", borderRadius: 10, fontSize: 12, color: "#E8E6E0" }} />
                          {picked.map((id, i) => {
                            const h = heroById.get(id);
                            return (
                              <Line
                                key={id}
                                type="monotone"
                                dataKey={h?.name ?? String(id)}
                                stroke={COLORS[i]}
                                strokeWidth={2}
                                dot={false}
                                isAnimationActive={false}
                                connectNulls
                              />
                            );
                          })}
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-[var(--muted2)]">
                        История строится автоматически: каждые 2 часа планировщик делает новый снимок винрейтов.
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
