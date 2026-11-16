"use client";

/** ФИШКА 2 — Калькулятор билдов: собираешь герою билд, получаешь стоимость,
 *  баланс категорий, реализуемость по кривой душ и «винрейт билда» по данным матчей */
import { useMemo, useState } from "react";
import { Coins, Target, X } from "lucide-react";
import { AreaChart, Area, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HeroRow, ItemRow } from "@/lib/site";
import { SLOT_RU, fmtInt, fmtPct, wrColor } from "@/lib/site";
import { HeroIcon, ItemIcon, WrBar, DropdownSelect } from "./shared";

export function ToolBuilder({ heroes, items }: { heroes: HeroRow[]; items: ItemRow[] }) {
  const [heroId, setHeroId] = useState<number | "">(heroes[0]?.id ?? "");
  const [picked, setPicked] = useState<string[]>([]);
  const [slotF, setSlotF] = useState<"weapon" | "spirit" | "vitality">("weapon");
  const [q, setQ] = useState("");

  const hero = heroes.find((h) => h.id === heroId);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const catalog = useMemo(() => {
    const s = q.trim().toLowerCase();
    return items
      .filter((i) => i.slotType === slotF && (!s || i.name.toLowerCase().includes(s)))
      .sort((a, b) => (a.tier - b.tier) || (a.cost - b.cost));
  }, [items, slotF, q]);

  const chosen = useMemo(() => picked.map((id) => itemById.get(id)).filter(Boolean) as ItemRow[], [picked, itemById]);

  const totals = useMemo(() => {
    const cost = chosen.reduce((s, i) => s + (i.cost || 0), 0);
    const byTier: Record<number, number> = {};
    const bySlot: Record<string, number> = { weapon: 0, spirit: 0, vitality: 0 };
    let wrSum = 0, wrCount = 0;
    for (const i of chosen) {
      byTier[i.tier] = (byTier[i.tier] ?? 0) + 1;
      if (i.slotType in bySlot) bySlot[i.slotType] += 1;
      if (i.stat?.winRate) {
        wrSum += i.stat.winRate;
        wrCount += 1;
      }
    }
    return {
      cost,
      byTier,
      bySlot,
      buildWr: wrCount ? wrSum / wrCount : null,
      wrCount,
    };
  }, [chosen]);

  // кривая душ: из level_info героя (required_gold по уровням)
  const curve = useMemo(() => {
    if (!hero?.levelInfo) return [];
    const levels = Object.entries(hero.levelInfo)
      .map(([lvl, v]) => ({ lvl: Number(lvl), gold: v.required_gold ?? 0 }))
      .sort((a, b) => a.lvl - b.lvl);
    let acc = 0;
    return levels.map((l) => {
      acc += l.gold;
      return { lvl: `ур. ${l.lvl}`, souls: acc };
    });
  }, [hero]);

  const affordability = useMemo(() => {
    if (!totals.cost || curve.length === 0) return null;
    const lvl = curve.find((c) => c.souls >= totals.cost);
    return lvl ? lvl.lvl : "за пределами кривой (33 ур.)";
  }, [totals.cost, curve]);

  return (
    <div>
      <div className="mb-5 flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel2)] p-3 text-xs text-[var(--muted2)]">
        <Target className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
        Соберите билд для героя из реального магазина: увидите итоговую стоимость, на каком уровне игры её реально накопить,
        баланс категорий и средний винрейт предметов билда по данным матчей.
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* каталог */}
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-[var(--line)] bg-[var(--panel)] p-1">
              {(["weapon", "spirit", "vitality"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSlotF(k)}
                  className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${slotF === k ? "bg-[var(--accent)] font-semibold text-[#0D1110]" : "text-[var(--muted2)]"}`}
                >
                  {SLOT_RU[k].label}
                </button>
              ))}
            </div>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск предмета..."
              className="w-full max-w-56 rounded-full border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-sm outline-none placeholder:text-[var(--muted2)] focus:border-[var(--accent)]"
              aria-label="Поиск предмета"
            />
          </div>
          <div className="grid max-h-[460px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3 xl:grid-cols-4">
            {catalog.map((i) => {
              const isPicked = picked.includes(i.id);
              return (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => setPicked((p) => (isPicked ? p.filter((x) => x !== i.id) : p.length >= 14 ? p : [...p, i.id]))}
                  className={`item-tile flex items-center gap-2 p-2 text-left ${isPicked ? "border-[var(--accent)]" : ""}`}
                  title={`${i.name} · ${fmtInt(i.cost)} душ${i.stat ? ` · WR ${i.stat.winRate.toFixed(1)}%` : ""}`}
                >
                  <ItemIcon item={i} size={34} rounded={6} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[11px] font-semibold">{i.name}</div>
                    <div className="text-[10px] text-[var(--accent)]">T{i.tier} · {fmtInt(i.cost)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* итоги */}
        <div className="space-y-4">
          <div className="card-dl p-4" style={{ borderTop: "2px solid var(--accent)" }}>
            <label className="mb-1 block text-[11px] uppercase tracking-widest text-[var(--muted2)]">Герой</label>
            <DropdownSelect
              label="Герой"
              value={heroId === "" ? (heroes[0]?.id ?? 0) : heroId}
              options={heroes.map((h) => ({ value: h.id, label: h.name }))}
              onChange={(v) => setHeroId(v)}
              ariaLabel="Выбор героя"
              scroll
            />
            {hero ? (
              <div className="mt-3 flex items-center gap-2.5">
                <HeroIcon hero={hero} size={40} rounded={8} />
                <div>
                  <div className="font-display text-sm font-bold">{hero.name}</div>
                  <div className="text-[11px] text-[var(--muted2)]">Сложность {hero.complexity}/3</div>
                </div>
              </div>
            ) : null}
          </div>

          <div className="card-dl p-4" style={{ borderTop: "2px solid var(--weapon)" }}>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-[var(--muted2)]">Стоимость билда</span>
              <span className="flex items-center gap-1.5 font-display text-lg font-bold text-[var(--accent)]">
                <Coins className="h-4 w-4" aria-hidden /> {fmtInt(totals.cost)}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-[var(--muted2)]">
              {affordability ? `Реализуемо к ${affordability} по кривой душ героя` : "Выберите предметы для расчёта"}
            </div>
            {totals.buildWr != null ? (
              <div className="mt-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-[var(--muted2)]">Винрейт билда ({totals.wrCount} предм. с данными)</span>
                  <span className="font-display text-base font-bold" style={{ color: wrColor(totals.buildWr) }}>{fmtPct(totals.buildWr)}</span>
                </div>
                <div className="mt-1"><WrBar wr={totals.buildWr} min={44} max={56} /></div>
              </div>
            ) : null}
          </div>

          <div className="card-dl p-4" style={{ borderTop: "2px solid var(--spirit)" }}>
            <div className="mb-2 text-[11px] uppercase tracking-widest text-[var(--muted2)]">Состав ({chosen.length}/14)</div>
            {chosen.length === 0 ? (
              <p className="text-xs text-[var(--muted2)]">Пусто — кликайте по предметам слева</p>
            ) : (
              <div className="space-y-1.5">
                {chosen.map((i) => (
                  <div key={i.id} className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel2)] p-1.5">
                    <ItemIcon item={i} size={28} rounded={5} />
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold">{i.name}</span>
                    <span className="text-[10px]" style={{ color: i.stat ? wrColor(i.stat.winRate) : undefined }}>
                      {i.stat ? `${i.stat.winRate.toFixed(1)}%` : "—"}
                    </span>
                    <button type="button" onClick={() => setPicked((p) => p.filter((x) => x !== i.id))} className="text-[var(--muted2)] hover:text-[var(--danger)]" aria-label={`Убрать ${i.name}`}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] text-[var(--muted2)]">
              {(["weapon", "spirit", "vitality"] as const).map((k) => (
                <div key={k} className="rounded-md bg-[var(--panel2)] p-1.5">
                  <span className="block font-display text-sm font-bold" style={{ color: SLOT_RU[k].color }}>{totals.bySlot[k] ?? 0}</span>
                  {SLOT_RU[k].label}
                </div>
              ))}
            </div>
          </div>

          {curve.length > 1 ? (
            <div className="card-dl p-4">
              <div className="mb-2 text-[11px] uppercase tracking-widest text-[var(--muted2)]">Кривая душ героя (по уровням)</div>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={curve} margin={{ top: 4, right: 6, bottom: 0, left: -16 }}>
                    <CartesianGrid stroke="#2A332F" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="lvl" tick={{ fill: "#8A9490", fontSize: 9 }} tickLine={false} axisLine={{ stroke: "#2A332F" }} minTickGap={26} />
                    <YAxis tick={{ fill: "#8A9490", fontSize: 9 }} tickLine={false} axisLine={false} width={50} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}к` : String(v))} />
                    <Tooltip contentStyle={{ background: "#161C1A", border: "1px solid #2A332F", borderRadius: 10, fontSize: 12, color: "#E8E6E0" }} formatter={(v: number | string) => [`${fmtInt(Number(v))} душ`, "Накоплено"]} />
                    <Area type="monotone" dataKey="souls" stroke="#E08A3C" fill="#E08A3C" fillOpacity={0.2} strokeWidth={2} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-1 text-[10px] text-[var(--muted2)]">Красная точка кривой — уровень, где билд становится реальным.</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
