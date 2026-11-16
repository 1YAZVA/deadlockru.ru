"use client";

import { useMemo, useState } from "react";
import { Crosshair, Sparkles, HeartPulse, X, Search } from "lucide-react";
import type { ItemRow } from "@/lib/site";
import { SLOT_RU, fmtInt, fmtPct, wrColor, sanitizeHtml } from "@/lib/site";
import { ItemIcon, SectionHeader } from "./shared";

type SlotKey = "weapon" | "spirit" | "vitality";

const SLOT_ICON: Record<SlotKey, React.ComponentType<{ className?: string }>> = {
  weapon: Crosshair,
  spirit: Sparkles,
  vitality: HeartPulse,
};

export function ItemsSection({ items }: { items: ItemRow[] }) {
  const [slot, setSlot] = useState<SlotKey>("weapon");
  const [q, setQ] = useState("");
  const [tierF, setTierF] = useState(0); // 0 = все
  const [selected, setSelected] = useState<ItemRow | null>(null);

  const bySlot = useMemo(() => {
    const m: Record<string, ItemRow[]> = { weapon: [], spirit: [], vitality: [] };
    for (const i of items) {
      const s = (i.slotType as SlotKey) || "";
      if (m[s]) m[s].push(i);
    }
    for (const k of Object.keys(m)) m[k].sort((a, b) => (a.tier - b.tier) || (a.cost - b.cost) || a.name.localeCompare(b.name));
    return m;
  }, [items]);

  const list = useMemo(() => {
    let l = bySlot[slot] ?? [];
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      // ищем и по английскому, и по официальному русскому названию
      l = l.filter((i) => i.name.toLowerCase().includes(s) || (i.nameRu ?? "").toLowerCase().includes(s));
    }
    if (tierF > 0) l = l.filter((i) => i.tier === tierF);
    return l;
  }, [bySlot, slot, q, tierF]);

  const tiers = useMemo(() => {
    const set = new Set((bySlot[slot] ?? []).map((i) => i.tier).filter((t) => t > 0));
    return [...set].sort((a, b) => a - b);
  }, [bySlot, slot]);

  const slotMeta = SLOT_RU[slot];
  const Icon = SLOT_ICON[slot];

  return (
    <section className="container-dl py-10">
      <SectionHeader
        kicker={`${fmtInt(items.length)} предметов с данными`}
        title="Предметы"
        lead="Магазин как в игре: вкладки категорий справа, тиры и цены у каждого предмета. Глобальный винрейт — из реальных матчей, обновляется автоматически."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_200px]">
        {/* панель контента */}
        <div className="order-2 lg:order-1">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted2)]" aria-hidden />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Поиск в «${slotMeta.label}»...`}
                className="w-full rounded-full border border-[var(--line)] bg-[var(--panel)] py-2 pl-9 pr-4 text-sm outline-none placeholder:text-[var(--muted2)] focus:border-[var(--accent)]"
                aria-label="Поиск предмета"
              />
            </div>
            <div className="inline-flex rounded-full border border-[var(--line)] bg-[var(--panel)] p-1">
              <button
                type="button"
                onClick={() => setTierF(0)}
                className={`rounded-full px-3 py-1.5 text-sm ${tierF === 0 ? "bg-[var(--accent)] font-semibold text-[#0D1110]" : "text-[var(--muted2)]"}`}
              >
                Все тиры
              </button>
              {tiers.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTierF(t)}
                  className={`rounded-full px-3 py-1.5 text-sm ${tierF === t ? "bg-[var(--accent)] font-semibold text-[#0D1110]" : "text-[var(--muted2)]"}`}
                >
                  T{t}
                </button>
              ))}
            </div>
            <span className="ml-auto text-xs text-[var(--muted2)]">{fmtInt(list.length)} шт.</span>
          </div>

          {/* сгруппировано по тирам */}
          <div className="space-y-6">
            {tiers.filter((t) => tierF === 0 || t === tierF).map((t) => {
              const tierItems = list.filter((i) => i.tier === t);
              if (tierItems.length === 0) return null;
              return (
                <div key={t}>
                  <div className="mb-2.5 flex items-center gap-3">
                    <span className="font-display text-xs font-bold uppercase tracking-widest" style={{ color: slotMeta.color }}>
                      Тир {["I", "II", "III", "IV", "V"][t - 1] ?? t}
                    </span>
                    <span className="text-[11px] text-[var(--muted2)]">{tierItems.length} предметов · от {fmtInt(Math.min(...tierItems.map((i) => i.cost || Infinity)))} душ</span>
                    <div className="deco-line flex-1" />
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-5">
                    {tierItems.map((i) => (
                      <button key={i.id} type="button" onClick={() => setSelected(i)} className="item-tile flex items-center gap-2.5 p-2 text-left">
                        <ItemIcon item={i} size={40} rounded={8} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold">{i.name}</div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] text-[var(--accent)]">{i.cost ? `${fmtInt(i.cost)} душ` : "—"}</span>
                            {i.stat ? <span className="text-[10px]" style={{ color: wrColor(i.stat.winRate) }}>{i.stat.winRate.toFixed(1)}%</span> : null}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {list.length === 0 ? <div className="card-dl p-8 text-center text-sm text-[var(--muted2)]">Ничего не найдено</div> : null}
          </div>
        </div>

        {/* вкладки категорий справа — как в игре */}
        <nav className="order-1 flex gap-2 lg:order-2 lg:flex-col lg:items-start lg:self-start" aria-label="Категории магазина">
          {(["weapon", "spirit", "vitality"] as SlotKey[]).map((k) => {
            const m = SLOT_RU[k];
            const I = SLOT_ICON[k];
            const active = slot === k;
            return (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => { setSlot(k); setTierF(0); }}
                className={`flex flex-1 items-center gap-2.5 rounded-xl border p-3 text-left transition-all lg:w-full lg:flex-none ${
                  active ? "border-[var(--accent)] bg-[var(--panel)]" : "border-[var(--line)] bg-[var(--panel2)] hover:border-[#3A453F]"
                }`}
                style={active ? { borderColor: m.color, boxShadow: `inset 2px 0 0 ${m.color}` } : undefined}
              >
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ color: m.color, background: "rgba(255,255,255,0.03)", border: `1px solid ${m.color}` }}>
                  <I className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold" style={{ color: active ? m.color : "var(--ink)" }}>{m.label}</span>
                  <span className="block text-[10px] text-[var(--muted2)]">{fmtInt((bySlot[k] ?? []).length)} шт.</span>
                </span>
              </button>
            );
          })}
          <div className="hidden rounded-xl border border-[var(--line)] bg-[var(--panel2)] p-3 text-[11px] leading-relaxed text-[var(--muted2)] lg:block">
            <span className="inline-flex" style={{ color: slotMeta.color }}>
              <Icon className="mb-1 h-4 w-4" aria-hidden />
            </span>
            Тиры внутри категории отсортированы по стоимости. Вишите винрейт — значит предмет стабильно покупают.
          </div>
        </nav>
      </div>

      {selected ? <ItemDialog item={selected} onClose={() => setSelected(null)} /> : null}
    </section>
  );
}

function ItemDialog({ item, onClose }: { item: ItemRow; onClose: () => void }) {
  const slotMeta = SLOT_RU[item.slotType] ?? SLOT_RU[""];
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={item.name} onClick={onClose}>
      <div
        className="fade-in w-full max-w-md overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-4 border-b border-[var(--line)] p-5" style={{ background: `linear-gradient(120deg, ${slotMeta.color}22, transparent 60%)` }}>
          <ItemIcon item={item} size={64} rounded={12} />
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-lg font-bold">{item.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--muted2)]">
              <span style={{ color: slotMeta.color }} className="font-semibold">{slotMeta.label}</span>
              {item.tier ? <span>· Тир {item.tier}</span> : null}
              {item.isActive ? <span className="rounded bg-[var(--panel2)] px-1.5 py-0.5">активный</span> : null}
            </div>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--line)] text-[var(--muted2)] hover:border-[var(--accent)]" aria-label="Закрыть">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-5">
          {item.cost ? (
            <div className="mb-3 flex items-baseline justify-between rounded-lg border border-[var(--line)] bg-[var(--panel2)] px-3 py-2">
              <span className="text-xs text-[var(--muted2)]">Стоимость</span>
              <span className="font-display text-sm font-bold text-[var(--accent)]">{fmtInt(item.cost)} душ</span>
            </div>
          ) : null}
          {item.description ? (
            <div className="patch-content mb-4 text-sm leading-relaxed text-[var(--muted2)]" dangerouslySetInnerHTML={{ __html: sanitizeHtml(item.description) }} />
          ) : null}
          {item.props.length > 0 ? (
            <div className="mb-4">
              <div className="mb-2 font-display text-[11px] uppercase tracking-widest text-[var(--accent)]">Характеристики</div>
              <div className="grid grid-cols-2 gap-1.5">
                {item.props.map((p, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-2 rounded-md bg-[var(--panel2)] px-2.5 py-1.5 text-xs">
                    <span className="text-[var(--muted2)]">{p.label}</span>
                    <b className="font-semibold">{p.value}{p.postfix ?? ""}</b>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {item.stat ? (
            <div className="rounded-lg border border-[var(--line)] p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-xs text-[var(--muted2)]">Глобальный винрейт предмета</span>
                <span className="font-display text-base font-bold" style={{ color: wrColor(item.stat.winRate) }}>{fmtPct(item.stat.winRate)}</span>
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-[var(--muted2)]">
                <span>{fmtInt(item.stat.matches)} матчей</span>
                <span>{fmtInt(item.stat.players)} игроков</span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
