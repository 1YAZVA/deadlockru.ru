"use client";

/** ФИШКА 4 — Live-центр: активные матчи прямо сейчас + график онлайна Steam */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Radio, Users } from "lucide-react";
import { AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HeroRow } from "@/lib/site";
import { apiGet, fmtInt, timeAgo } from "@/lib/site";
import { HeroIcon, Spinner, WrBar } from "./shared";
import { wrColor } from "@/lib/site";

type LiveData = {
  active: { count: number; matches: { id: number; min: number; a: number[]; b: number[] }[] };
  online: { count: number; at: string; peak?: number | null } | null;
  onlineHistory: { count: number; at: string }[];
};

export function ToolLive({ heroes }: { heroes: HeroRow[] }) {
  const [data, setData] = useState<LiveData | null>(null);
  const [loading, setLoading] = useState(true);
  const heroById = useMemo(() => new Map(heroes.map((h) => [h.id, h])), [heroes]);

  const load = useCallback(() => {
    apiGet<LiveData>("/api/live")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  const chart = useMemo(
    () =>
      (data?.onlineHistory ?? []).slice(-72).map((p) => ({
        t: new Date(p.at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
        v: p.count,
      })),
    [data]
  );

  // пик героев в активных матчах
  const heroPop = useMemo(() => {
    if (!data) return [];
    const counts = new Map<number, number>();
    for (const m of data.matches) for (const hid of [...m.a, ...m.b]) counts.set(hid, (counts.get(hid) ?? 0) + 1);
    return [...counts.entries()]
      .map(([heroId, n]) => ({ heroId, n, hero: heroById.get(heroId) }))
      .filter((x) => x.hero)
      .sort((a, b) => b.n - a.n)
      .slice(0, 8);
  }, [data, heroById]);

  const maxPop = Math.max(1, ...heroPop.map((h) => h.n));

  if (loading) return <Spinner label="Подключаемся к живым данным..." />;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel2)] p-3 text-xs text-[var(--muted2)]">
        <Activity className="h-4 w-4 shrink-0 text-[var(--danger)]" aria-hidden />
        Пульс игры прямо сейчас: активные матчи обновляются каждые 60 секунд, график онлайна — каждые 10 минут.
        {data?.online ? <span className="ml-auto">Замер онлайна: {timeAgo(data.online.at)}</span> : null}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card-dl p-4" style={{ borderTop: "2px solid var(--danger)" }}>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-[var(--muted2)]">
            <Radio className="h-3.5 w-3.5 text-[var(--danger)]" aria-hidden /> Матчей идёт
          </div>
          <div className="mt-1 font-display text-2xl font-bold text-[var(--danger)]">{data ? fmtInt(data.active.count) : "—"}</div>
        </div>
        <div className="card-dl p-4" style={{ borderTop: "2px solid var(--ok)" }}>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-[var(--muted2)]">
            <Users className="h-3.5 w-3.5 text-[var(--ok)]" aria-hidden /> Онлайн Steam
          </div>
          <div className="mt-1 font-display text-2xl font-bold text-[var(--ok)]">{data ? fmtInt(data.online?.count ?? 0) : "—"}</div>
        </div>
        <div className="card-dl p-4" style={{ borderTop: "2px solid var(--spirit)" }}>
          <div className="text-[11px] uppercase tracking-widest text-[var(--muted2)]">Героев в живых матчах</div>
          <div className="mt-1 font-display text-2xl font-bold text-[var(--spirit)]">{fmtInt(heroPop.length)}</div>
        </div>
        <div className="card-dl p-4" style={{ borderTop: "2px solid var(--accent)" }}>
          <div className="text-[11px] uppercase tracking-widest text-[var(--muted2)]">Игроков в матчах</div>
          <div className="mt-1 font-display text-2xl font-bold text-[var(--accent)]">
            {data ? fmtInt(data.matches.length * 12) : "—"}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* матчи */}
        <div>
          <h4 className="mb-3 font-display text-xs uppercase tracking-widest text-[var(--accent)]">Активные матчи (составы команд)</h4>
          {data && data.matches.length > 0 ? (
            <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
              {data.matches.map((m) => (
                <div key={m.id} className="card-dl flex flex-wrap items-center gap-3 p-3">
                  <span className="live-pill">LIVE</span>
                  <span className="text-xs text-[var(--muted2)]">#{m.id}</span>
                  <span className="text-xs text-[var(--muted2)]">{m.min} мин</span>
                  <div className="ml-auto flex items-center gap-1.5">
                    {m.a.slice(0, 6).map((hid, i) => (
                      <HeroIcon key={`a${i}`} hero={heroById.get(hid)} size={26} rounded={5} />
                    ))}
                    <span className="mx-1 text-[var(--accent)]">vs</span>
                    {m.b.slice(0, 6).map((hid, i) => (
                      <HeroIcon key={`b${i}`} hero={heroById.get(hid)} size={26} rounded={5} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="card-dl p-8 text-center text-sm text-[var(--muted2)]">
              Прямо сейчас активных матчей не зафиксировано. Обновление — каждую минуту.
            </div>
          )}
        </div>

        {/* онлайн-график + популярность героев */}
        <div className="space-y-4">
          <div className="card-dl p-4">
            <div className="mb-2 text-[11px] uppercase tracking-widest text-[var(--muted2)]">Онлайн за последние замеры</div>
            {chart.length > 2 ? (
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chart} margin={{ top: 4, right: 6, bottom: 0, left: -20 }}>
                    <CartesianGrid stroke="#2A332F" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="t" tick={{ fill: "#8A9490", fontSize: 9 }} tickLine={false} axisLine={{ stroke: "#2A332F" }} minTickGap={30} />
                    <YAxis tick={{ fill: "#8A9490", fontSize: 9 }} tickLine={false} axisLine={false} width={44} />
                    <Tooltip contentStyle={{ background: "#161C1A", border: "1px solid #2A332F", borderRadius: 10, fontSize: 12, color: "#E8E6E0" }} formatter={(v: number | string) => [`${v}`, "Онлайн"]} />
                    <Area type="monotone" dataKey="v" stroke="#4CAD6D" fill="#4CAD6D" fillOpacity={0.18} strokeWidth={2} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-4 text-center text-xs text-[var(--muted2)]">График строится после нескольких замеров</p>
            )}
          </div>

          {heroPop.length > 0 ? (
            <div className="card-dl p-4">
              <div className="mb-2 text-[11px] uppercase tracking-widest text-[var(--muted2)]">Кого чаще всего пикают прямо сейчас</div>
              <div className="space-y-2">
                {heroPop.map(({ hero, n }) => (
                  <div key={hero!.id} className="flex items-center gap-2.5">
                    <HeroIcon hero={hero} size={28} rounded={6} />
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">{hero!.name}</span>
                    <div className="w-20"><WrBar wr={(n / maxPop) * 55} min={0} max={58} /></div>
                    <span className="w-8 text-right text-xs font-bold" style={{ color: wrColor((n / maxPop) * 55) }}>{n}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
