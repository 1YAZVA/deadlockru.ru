"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { HERO_TYPE_RU, wrColor, fmtPct, fmt1, fmtInt, viaImgProxy, heroLocalIcon } from "@/lib/site";

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-sm text-[var(--muted2)]">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--accent)]" />
      {label ?? "Загрузка данных..."}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card-dl p-8 text-center">
      <h3 className="font-display text-sm uppercase tracking-widest text-[var(--accent)]">{title}</h3>
      {hint ? <p className="mt-2 text-sm text-[var(--muted2)]">{hint}</p> : null}
    </div>
  );
}

/**
 * Умная картинка с каскадом источников:
 *   0) прокси сайта /api/img (основной путь — работает даже если CDN заблокирован у пользователя),
 *   1) прямой URL (если прокси вдруг недоступен),
 *   2) заглушка с инициалами.
 */
export function SafeImg({
  src, alt, size, width, height, rounded = 8, circle, className = "", style, fallbackText,
}: {
  src?: string | null;
  alt: string;
  size?: number;
  width?: number | string;
  height?: number | string;
  rounded?: number;
  circle?: boolean;
  className?: string;
  style?: React.CSSProperties;
  fallbackText?: string;
}) {
  // внутренний компонент перемонтируется при смене src — каскадных рендеров нет
  return <SafeImgInner key={src ?? ""} src={src} alt={alt} size={size} width={width} height={height} rounded={rounded} circle={circle} className={className} style={style} fallbackText={fallbackText} />;
}

function SafeImgInner({
  src, alt, size, width, height, rounded = 8, circle, className = "", style, fallbackText,
}: {
  src?: string | null;
  alt: string;
  size?: number;
  width?: number | string;
  height?: number | string;
  rounded?: number;
  circle?: boolean;
  className?: string;
  style?: React.CSSProperties;
  fallbackText?: string;
}) {
  const [stage, setStage] = useState(0);
  const w = width ?? size ?? 40;
  const h = height ?? size ?? 40;
  const radius = circle ? "9999px" : rounded;

  if (!src || stage >= 2) {
    return (
      <span
        className={`inline-flex items-center justify-center bg-[#1A211E] text-[10px] font-bold text-[var(--muted2)] ${className}`}
        style={{ width: w, height: h, borderRadius: radius, border: "1px solid var(--line)", flexShrink: 0, ...style }}
        aria-label={alt}
      >
        {(fallbackText ?? alt ?? "?").slice(0, 2).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={stage === 0 ? viaImgProxy(src) : src}
      alt={alt}
      width={typeof w === "number" ? w : undefined}
      height={typeof h === "number" ? h : undefined}
      loading="lazy"
      className={className}
      style={{ width: w, height: h, borderRadius: radius, objectFit: "cover", background: "#1A211E", border: "1px solid var(--line)", flexShrink: 0, ...style }}
      onError={() => setStage((s) => s + 1)}
    />
  );
}

/**
 * Иконка героя: сначала локальный файл из /img/heroes (self-host, быстрый и всегда доступный),
 * затем CDN через прокси /api/img, затем инициалы.
 */
export function HeroIcon({
  hero, size = 40, rounded = 8, className = "",
}: { hero?: { id?: number; heroId?: number; iconSmall?: string; iconCard?: string; name: string; colorHex?: string }; size?: number; rounded?: number; className?: string }) {
  const heroId = hero?.id ?? (typeof hero?.heroId === "number" ? hero.heroId : undefined);
  const local = heroLocalIcon(heroId);
  return (
    <SafeImg
      src={local || hero?.iconSmall || hero?.iconCard || ""}
      alt={hero?.name ?? "герой"}
      size={size}
      rounded={rounded}
      className={className}
      fallbackText={(hero?.name ?? "?").slice(0, 2)}
    />
  );
}

/**
 * Кастомный дропдаун в стиле сайта — замена нативному <select>,
 * который раскрывался системным белым списком и выбивался из тёмной темы.
 */
export function DropdownSelect<T extends string | number>({
  value, options, onChange, label, ariaLabel, scroll,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  ariaLabel?: string;
  scroll?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = options.find((o) => o.value === value);
  return (
    <div className="dd-dl" ref={ref}>
      <button
        type="button"
        className={`dd-btn ${open ? "open" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel ?? label}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="text-[var(--muted2)]">{label}:</span>
        <span className="dd-val">{current?.label ?? "—"}</span>
        <ChevronDown className="dd-chev h-3.5 w-3.5" aria-hidden />
      </button>
      {open ? (
        <div
          className={`dd-panel ${scroll ? "max-h-96 overflow-y-auto" : ""}`}
          role="listbox"
          aria-label={label}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              className={`dd-item ${o.value === value ? "active" : ""}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              {o.label}
              <Check className="dd-check h-3.5 w-3.5" aria-hidden />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ItemIcon({ item, size = 40, rounded = 8 }: { item?: { shopImage?: string; image?: string; name: string }; size?: number; rounded?: number }) {
  return (
    <SafeImg
      src={item?.shopImage || item?.image || ""}
      alt={item?.name ?? "предмет"}
      size={size}
      rounded={rounded}
      fallbackText={(item?.name ?? "?").slice(0, 2)}
    />
  );
}

export function WinRateBadge({ wr, small }: { wr: number; small?: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border font-semibold ${small ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"}`}
      style={{ color: wrColor(wr), borderColor: wrColor(wr), background: "rgba(255,255,255,0.02)" }}
    >
      {fmtPct(wr)}
    </span>
  );
}

export function WrBar({ wr, min = 40, max = 58 }: { wr: number; min?: number; max?: number }) {
  const p = Math.max(0, Math.min(100, ((wr - min) / (max - min)) * 100));
  return (
    <div className="wr-bar w-full">
      <i style={{ width: `${p}%`, background: wrColor(wr) }} />
    </div>
  );
}

export function TypeChip({ type, complexity }: { type: string; complexity?: number }) {
  const meta = HERO_TYPE_RU[type] ?? HERO_TYPE_RU[""];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold"
        style={{ color: meta.color, background: "color-mix(in srgb, currentColor 12%, transparent)", border: `1px solid ${meta.color}` }}
      >
        {meta.label}
      </span>
      {complexity ? (
        <span className="text-[11px] text-[var(--muted2)]" title="Сложность">
          {Array.from({ length: 3 }, (_, i) => (
            <i key={i} className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full" style={{ background: i < complexity ? meta.color : "#2A332F" }} />
          ))}
        </span>
      ) : null}
    </span>
  );
}

export function TierChip({ tier, color }: { tier: string; color: string }) {
  return (
    <span
      className="inline-flex h-7 w-7 items-center justify-center rounded-md font-display text-sm font-bold"
      style={{ color, border: `1px solid ${color}`, background: "rgba(255,255,255,0.02)" }}
    >
      {tier}
    </span>
  );
}

export function SectionHeader({
  kicker, title, lead, right,
}: { kicker?: string; title: string; lead?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        {kicker ? <div className="mb-2 font-display text-[11px] uppercase tracking-[0.25em] text-[var(--accent)]">{kicker}</div> : null}
        <h2 className="font-display text-2xl font-bold md:text-3xl">{title}</h2>
        {lead ? <p className="mt-2 max-w-2xl text-sm text-[var(--muted2)]">{lead}</p> : null}
      </div>
      {right ? <div className="flex flex-wrap items-center gap-2">{right}</div> : null}
    </div>
  );
}

export function FreshChip({ at, prefix = "Обновлено" }: { at: string | null | undefined; prefix?: string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-1 text-xs text-[var(--muted2)]">
      <span className="dot-dl" />
      {prefix}: {at ? new Date(at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
    </span>
  );
}

export function StatCard({
  label, value, sub, color = "var(--accent)", live, onClick,
}: { label: string; value: React.ReactNode; sub?: string; color?: string; live?: boolean; onClick?: () => void }) {
  return (
    <div
      className={`card-dl p-4 ${onClick ? "cursor-pointer transition-colors hover:border-[var(--accent)]" : ""}`}
      style={{ borderTop: `2px solid ${color}` }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") onClick(); } : undefined}
    >
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-[var(--muted2)]">
        {live ? <span className="dot-dl" /> : null}
        {label}
      </div>
      <div className="mt-1 font-display text-2xl font-bold" style={{ color }}>
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-xs text-[var(--muted2)]">{sub}</div> : null}
    </div>
  );
}

export function MiniStat({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] py-1.5 last:border-0">
      <span className="text-xs text-[var(--muted2)]">{label}</span>
      <span className="text-sm font-semibold" style={{ color }}>{value}</span>
    </div>
  );
}

export function fmtKda(k: number, d: number, a: number) {
  const v = (k + a) / Math.max(1, d);
  return fmt1(v);
}

export function countLabel(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${fmtInt(n)} ${one}`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${fmtInt(n)} ${few}`;
  return `${fmtInt(n)} ${many}`;
}
