"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid, Cell, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis, BarChart, Bar, LabelList, ReferenceLine,
} from "recharts";
import type { HeroRow, MetaResponse } from "@/lib/site";
import { fmtInt, fmtPct, fmtSouls, wrColor, wrTier, timeAgo, rankLocalIcon, RANK_TIER_COLORS, RANK_NAMES } from "@/lib/site";
import { DropdownSelect, FreshChip, HeroIcon, SectionHeader, TierChip, TypeChip, WrBar } from "./shared";

type SortKey = "winRate" | "pickRate" | "matches" | "kda" | "netWorth";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "winRate", label: "Винрейт" },
  { value: "pickRate", label: "Пик-рейт" },
  { value: "matches", label: "Матчи" },
  { value: "kda", label: "KDA" },
  { value: "netWorth", label: "Нетворс" },
];

/** кастомный тик графика рангов: иконка ранга + название под ней */
function RankTick(props: { x?: number; y?: number; payload?: { value?: number }; tiers?: { id: number; name: string }[] }) {
  const { x, y, payload, tiers } = props;
  const tier = Number(payload?.value ?? 0);
  const name = tiers?.find((t) => t.id === tier)?.name ?? RANK_NAMES[tier] ?? "";
  if (!Number.isFinite(x) || !Number.isFinite(y)) return <g />;
  return (
    <g transform={`translate(${(x ?? 0) - 22},${(y ?? 0) + 6})`} className="rank-tick">
      { }
      <image href={rankLocalIcon(tier)} width={30} height={30} x={7} y={0} preserveAspectRatio="xMidYMid meet" />
      <text x={22} y={44} textAnchor="middle" fill="#8A9490" fontSize={8.5}>{name}</text>
    </g>
  );
}

export function MetaSection({
  meta, heroes, onOpenHero,
}: {
  meta: MetaResponse | null;
  heroes: HeroRow[];
  onOpenHero: (id: number) => void;
}) {
  const [sort, setSort] = useState<SortKey>("winRate");

  const rows = useMemo(() => {
    if (!meta) return [];
    return [...meta.rows].sort((a, b) =>
      sort === "netWorth" ? b.avgNetWorth - a.avgNetWorth : (b[sort] as number) - (a[sort] as number)
    );
  }, [meta, sort]);

  const tierGroups = useMemo(() => {
    if (!meta) return [];
    const groups: Record<string, typeof meta.rows> = { S: [], A: [], B: [], C: [], D: [] };
    for (const r of meta.rows) {
      const t = wrTier(r.winRate);
      groups[t.tier].push(r);
    }
    return (["S", "A", "B", "C", "D"] as const).map((k) => ({
      tier: k,
      color: wrTier(k === "S" ? 54 : k === "A" ? 51 : k === "B" ? 49 : k === "C" ? 46 : 44).color,
      heroes: groups[k].sort((a, b) => b.winRate - a.winRate),
    }));
  }, [meta]);

  const scatter = useMemo(
    () => meta?.rows.map((r) => ({ x: Number(r.pickRate.toFixed(2)), y: Number(r.winRate.toFixed(2)), z: r.matches, name: r.name, color: r.colorHex, heroId: r.heroId })) ?? [],
    [meta]
  );

  /** подписываем на карте меты только выдающихся героев — иначе нечитаемая каша */
  const scatterLabels = useMemo(() => {
    if (!meta || meta.rows.length === 0) return [];
    const byPick = [...meta.rows].sort((a, b) => b.pickRate - a.pickRate).slice(0, 5);
    const byWr = [...meta.rows].sort((a, b) => b.winRate - a.winRate).slice(0, 3);
    const ids = new Set<number>();
    for (const h of [...byPick, ...byWr]) ids.add(h.heroId);
    return meta.rows.filter((r) => ids.has(r.heroId)).map((r) => ({
      x: Number(r.pickRate.toFixed(2)), y: Number(r.winRate.toFixed(2)), z: 1, name: r.name, color: r.colorHex,
    }));
  }, [meta]);

  const badgeChart = useMemo(() => {
    if (!meta) return [];
    const tiers = new Map(meta.rankTiers.map((t) => [t.id, t.name]));
    return (meta.badgeDist ?? [])
      .filter((b) => b.players > 0)
      .sort((a, b) => a.badge - b.badge)
      .map((b) => ({
        tier: b.badge,
        name: tiers.get(b.badge) ?? b.name,
        players: b.players,
        color: RANK_TIER_COLORS[b.badge] ?? "#8C6FD1",
      }));
  }, [meta]);

  const badgeTotal = useMemo(() => badgeChart.reduce((s, b) => s + b.players, 0), [badgeChart]);

  const rankTickTiers = useMemo(() => (meta?.rankTiers ?? []).map((t) => ({ id: t.id, name: t.name })), [meta]);

  const avgWr = useMemo(() => (meta && meta.rows.length ? meta.rows.reduce((s, r) => s + r.winRate, 0) / meta.rows.length : 0), [meta]);

  return (
    <section className="container-dl py-10">
      <SectionHeader
        kicker="Аналитика за 30 дней"
        title="Мета героев"
        lead="Кто сейчас силён, а кто проседает: винрейты, пик-рейты, KDA и нетворс по всем героям. Данные собираются из ранкед-матчей автоматически раз в 2 часа."
        right={<FreshChip at={meta?.updatedAt ?? null} />}
      />

      {!meta || meta.rows.length === 0 ? (
        <div className="card-dl p-8 text-center text-sm text-[var(--muted2)]">
          Мета-статистика появится после первого цикла синхронизации (задача «Винрейты героев», раз в 2 часа).
        </div>
      ) : (
        <>
          <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="card-dl p-4" style={{ borderTop: "2px solid var(--accent)" }}>
              <div className="text-[11px] uppercase tracking-widest text-[var(--muted2)]">Матчей в срезе</div>
              <div className="mt-1 font-display text-2xl font-bold text-[var(--accent)]">{fmtInt(meta.totalMatches)}</div>
            </div>
            <div className="card-dl p-4" style={{ borderTop: "2px solid var(--spirit)" }}>
              <div className="text-[11px] uppercase tracking-widest text-[var(--muted2)]">Героев с данными</div>
              <div className="mt-1 font-display text-2xl font-bold text-[var(--spirit)]">{meta.rows.length}</div>
            </div>
            <div className="card-dl p-4" style={{ borderTop: "2px solid var(--vitality)" }}>
              <div className="text-[11px] uppercase tracking-widest text-[var(--muted2)]">Средний винрейт</div>
              <div className="mt-1 font-display text-2xl font-bold text-[var(--vitality)]">{fmtPct(avgWr)}</div>
            </div>
            <div className="card-dl p-4" style={{ borderTop: "2px solid var(--weapon)" }}>
              <div className="text-[11px] uppercase tracking-widest text-[var(--muted2)]">Разброс тиров</div>
              <div className="mt-1 flex items-center gap-1.5 pt-1">
                {tierGroups.map((g) => (
                  <TierChip key={g.tier} tier={g.tier} color={g.color} />
                ))}
              </div>
            </div>
          </div>

          {/* тир-лист */}
          <h3 className="mb-3 font-display text-sm font-bold uppercase tracking-widest text-[var(--accent)]">Тир-лист по винрейту</h3>
          <div className="mb-8 space-y-3">
            {tierGroups.map((g) => (
              <div key={g.tier} className="card-dl flex items-start gap-4 p-4">
                <TierChip tier={g.tier} color={g.color} />
                <div className="flex min-h-14 flex-1 flex-wrap content-start gap-2.5">
                  {g.heroes.length === 0 ? (
                    <span className="text-xs text-[var(--muted2)]">нет героев</span>
                  ) : (
                    g.heroes.map((h) => (
                      <button
                        key={h.heroId}
                        type="button"
                        onClick={() => onOpenHero(h.heroId)}
                        title={`${h.name} — ${h.winRate.toFixed(1)}%`}
                        className="group flex items-center gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--panel2)] py-1.5 pl-1.5 pr-3.5 transition-colors hover:border-[var(--accent)]"
                      >
                        <HeroIcon hero={{ iconSmall: h.iconCard, iconCard: h.iconCard, name: h.name, colorHex: h.colorHex }} size={40} rounded={9} />
                        <span className="text-sm font-semibold group-hover:text-[var(--accent)]">{h.name}</span>
                        <span className="text-xs font-bold" style={{ color: wrColor(h.winRate) }}>{h.winRate.toFixed(1)}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* scatter пик vs винрейт */}
            <div className="card-dl p-5">
              <h3 className="mb-1 break-words font-display text-sm font-bold uppercase tracking-widest text-[var(--accent)]">Карта меты: пик vs винрейт</h3>
              <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--muted2)]">
                <span><b className="text-[var(--ink)]">Горизонталь</b> — как часто героя пикают (пик-рейт, %)</span>
                <span><b className="text-[var(--ink)]">Вертикаль</b> — насколько он побеждает (винрейт, %)</span>
                <span><b className="text-[var(--ink)]">Размер круга</b> — число матчей</span>
              </div>
              {/* подписи осей — HTML над и под графиком, чтобы не налезать на деления шкалы */}
              <div className="mb-1 text-[11px] font-semibold text-[var(--muted2)]">↑ Винрейт, %</div>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 18, right: 22, bottom: 8, left: -8 }}>
                    <CartesianGrid stroke="#2A332F" strokeDasharray="3 3" />
                    <XAxis
                      type="number" dataKey="x" name="Пик-рейт"
                      tick={{ fill: "#8A9490", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#2A332F" }}
                      unit="%" domain={["dataMin - 2", "dataMax + 2"]}
                    />
                    <YAxis
                      type="number" dataKey="y" name="Винрейт"
                      tick={{ fill: "#8A9490", fontSize: 10 }} tickLine={false} axisLine={false}
                      domain={["dataMin - 1.5", "dataMax + 1.5"]} unit="%" width={52}
                    />
                    <ZAxis type="number" dataKey="z" range={[40, 320]} />
                    <ReferenceLine y={50} stroke="#C8A96A" strokeDasharray="5 5" strokeOpacity={0.55}
                      label={{ value: "50% — баланс", fill: "#C8A96A", fontSize: 10, position: "insideTopLeft" }} />
                    <Tooltip
                      cursor={{ strokeDasharray: "3 3", stroke: "#3A453F" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as { name: string; x: number; y: number; z: number; color: string };
                        return (
                          <div style={{ background: "#161C1A", border: `1px solid ${d.color || "#2A332F"}`, borderRadius: 10, fontSize: 12, color: "#E8E6E0", padding: "10px 12px", minWidth: 180 }}>
                            <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.name}</div>
                            <div>Пик-рейт: <b>{d.x.toFixed(1)}%</b></div>
                            <div>Винрейт: <b style={{ color: wrColor(d.y) }}>{d.y.toFixed(1)}%</b></div>
                            <div>Матчей за 30 дней: <b>{fmtInt(d.z)}</b></div>
                            <div style={{ color: "#8A9490", marginTop: 4, fontSize: 10.5 }}>клик — карточка героя</div>
                          </div>
                        );
                      }}
                    />
                    <Scatter data={scatter} isAnimationActive={false} onClick={(d: { name?: string }) => {
                      const row = meta.rows.find((r) => r.name === d?.name);
                      if (row) onOpenHero(row.heroId);
                    }}>
                      {scatter.map((s, i) => (
                        <Cell key={i} fill={s.color} fillOpacity={0.72} stroke="#0D1110" cursor="pointer" />
                      ))}
                    </Scatter>
                    {/* подписи выдающихся героев — поверх точек */}
                    <Scatter data={scatterLabels} isAnimationActive={false} shape={() => <g />} >
                      <LabelList dataKey="name" position="top" offset={10} style={{ fill: "#E8E6E0", fontSize: 10, fontWeight: 600, paintOrder: "stroke", stroke: "#0D1110", strokeWidth: 3 }} />
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-1 text-right text-[11px] font-semibold text-[var(--muted2)]">Пик-рейт, % →</div>
              <p className="mt-2 text-xs text-[var(--muted2)]">
                Правый верхний угол — сильные и популярные герои, левый нижний — аутсайдеры. Подписаны только топы по пику и винрейту.
              </p>
            </div>

            {/* распределение значков — цвет столбца = цвет ранга, под каждым рангом его иконка */}
            <div className="card-dl p-5">
              <h3 className="mb-1 font-display text-sm font-bold uppercase tracking-widest text-[var(--spirit)]">Распределение игроков по рангам</h3>
              <p className="mb-3 text-[11px] text-[var(--muted2)]">
                Каждый столбец — свой ранг в его цвете: от Обскуруса до Этернуса. Всего в срезе {fmtInt(badgeTotal)} игроков.
              </p>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={badgeChart} margin={{ top: 18, right: 10, bottom: 66, left: -6 }} barCategoryGap="22%">
                    <CartesianGrid stroke="#2A332F" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="tier"
                      tick={<RankTick tiers={rankTickTiers} />}
                      tickLine={false}
                      axisLine={{ stroke: "#2A332F" }}
                      interval={0}
                      height={64}
                    />
                    <YAxis
                      tick={{ fill: "#8A9490", fontSize: 10 }} tickLine={false} axisLine={false} width={52}
                      tickFormatter={(v: number) => fmtSouls(v)}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(200,169,106,0.06)" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as { tier: number; name: string; players: number; color: string };
                        return (
                          <div style={{ background: "#161C1A", border: `1px solid ${d.color}`, borderRadius: 10, fontSize: 12, color: "#E8E6E0", padding: "10px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              { }
                              <img src={rankLocalIcon(d.tier)} alt="" width={26} height={26} />
                              <b>{d.name}</b>
                            </div>
                            <div>Игроков: <b>{fmtInt(d.players)}</b></div>
                            <div>Доля: <b>{badgeTotal ? ((d.players / badgeTotal) * 100).toFixed(1) : "0"}%</b></div>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="players" radius={[6, 6, 0, 0]} isAnimationActive={false}>
                      {badgeChart.map((b, i) => (
                        <Cell key={i} fill={b.color} fillOpacity={0.9} stroke="#0D1110" />
                      ))}
                      <LabelList dataKey="players" position="top" formatter={(v: number) => fmtSouls(v)} fill="#8A9490" fontSize={9} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-2 text-xs text-[var(--muted2)]">Источник: deadlock-api.com — публичное распределение значков всех игроков.</p>
            </div>
          </div>

          {/* полная таблица */}
          <div className="card-dl mt-8 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] p-4">
              <h3 className="font-display text-sm font-bold uppercase tracking-widest">Полная таблица меты</h3>
              <DropdownSelect
                label="Сортировка"
                value={sort}
                options={SORT_OPTIONS}
                onChange={setSort}
                ariaLabel="Сортировка таблицы"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--line)] text-left text-[11px] uppercase tracking-widest text-[var(--muted2)]">
                    <th className="px-4 py-3">Герой</th>
                    <th className="px-4 py-3">Тип</th>
                    <th className="px-4 py-3">Винрейт</th>
                    <th className="px-4 py-3">Пик</th>
                    <th className="px-4 py-3">KDA</th>
                    <th className="px-4 py-3">Ср. нетворс</th>
                    <th className="px-4 py-3">Матчи</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.heroId}
                      className="lb-row cursor-pointer border-b border-[var(--line)] last:border-0"
                      onClick={() => onOpenHero(r.heroId)}
                    >
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2.5">
                          <HeroIcon hero={{ iconSmall: r.iconCard, iconCard: r.iconCard, name: r.name, colorHex: r.colorHex }} size={34} rounded={7} />
                          <span className="font-semibold">{r.name}</span>
                        </span>
                      </td>
                      <td className="px-4 py-3"><TypeChip type={r.heroType} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-12 font-bold" style={{ color: wrColor(r.winRate) }}>{r.winRate.toFixed(1)}%</span>
                          <div className="w-24"><WrBar wr={r.winRate} /></div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[var(--muted2)]">{r.pickRate.toFixed(1)}%</td>
                      <td className="px-4 py-3">{r.kda.toFixed(2)}</td>
                      <td className="px-4 py-3 text-[var(--muted2)]">{fmtSouls(r.avgNetWorth)}</td>
                      <td className="px-4 py-3 text-[var(--muted2)]">{fmtInt(r.matches)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t border-[var(--line)] p-3 text-[11px] text-[var(--muted2)]">
              Срез обновлён {timeAgo(meta.updatedAt)} · источник: deadlock-api.com, ранкед-матчи
            </div>
          </div>
        </>
      )}
    </section>
  );
}
