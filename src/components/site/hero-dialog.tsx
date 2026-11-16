"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Sword, ShieldHalf, Sparkles, Clock, TrendingUp } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { HeroExtraData, HeroRow, ItemRow } from "@/lib/site";
import { apiGet, STAT_RU, fmt1, fmtInt, fmtPct, fmtSouls, fmtDateTime, HERO_TYPE_RU, loreParagraphs, sanitizeHtml, wrColor, wrTier } from "@/lib/site";
import { HeroIcon, ItemIcon, SafeImg, WinRateBadge, WrBar, MiniStat, Spinner, TypeChip, TierChip } from "./shared";

type HeroDetail = {
  hero: HeroRow & { startingStats: Record<string, number> };
  stat: {
    winRate: number; pickRate: number; matches: number; kda: number; avgNetWorth: number;
    kills: number; deaths: number; assists: number; playerDamage: number; damageTaken: number; lastHits: number;
  } | null;
  history: { winRate: number; pickRate: number; matches: number; at: string }[];
  extra: HeroExtraData | null;
};

const HERO_STAT_KEYS = [
  "max_health", "max_move_speed", "weapon_power", "light_melee_damage", "heavy_melee_damage",
  "stamina", "reload_speed", "base_health_regen", "sprint_speed",
  "air_dash_distance_in_meters", "ground_dash_distance_in_meters", "tech_range",
];

export function HeroDialog({
  heroId, heroes, items, onClose,
}: {
  heroId: number;
  heroes: HeroRow[];
  items: ItemRow[];
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<HeroDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "items" | "counters" | "abilities" | "guide">("overview");

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const base = heroes.find((h) => h.id === heroId);

  useEffect(() => {
    let alive = true;
    apiGet<HeroDetail>(`/api/hero/${heroId}`)
      .then((d) => {
        if (alive) setDetail(d);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [heroId]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEsc);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onEsc);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const hero = detail?.hero ?? base;
  const stat = detail?.stat ?? base?.stat ?? null;
  const accent = hero?.colorHex ?? "var(--accent)";
  const typeMeta = HERO_TYPE_RU[hero?.heroType ?? ""] ?? HERO_TYPE_RU[""];
  const tier = stat ? wrTier(stat.winRate) : null;

  const historyChart = (detail?.history ?? []).filter((_, i, arr) => arr.length <= 40 || i % Math.ceil(arr.length / 40) === 0)
    .map((h) => ({ t: new Date(h.at).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }), wr: Number(h.winRate.toFixed(2)) }));

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/70 p-3 backdrop-blur-sm md:p-8" role="dialog" aria-modal="true" aria-label={hero?.name}>
      <div className="fade-in relative my-4 w-full max-w-4xl overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg)]">
        {/* шапка карточки: pr-14 — место под крестик, чтобы он не налезал на винрейт */}
        <div className="relative flex flex-col gap-4 border-b border-[var(--line)] p-5 pr-16 md:flex-row md:items-center md:pr-16" style={{ background: `linear-gradient(120deg, ${accent}22, transparent 55%)` }}>
          {hero ? <HeroIcon hero={hero} size={72} rounded={14} /> : null}
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-2xl font-bold" style={{ color: accent }}>{hero?.name ?? "…"}</h3>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <TypeChip type={hero?.heroType ?? ""} complexity={hero?.complexity} />
              {hero?.tags?.length ? <span className="text-xs text-[var(--muted2)]">{hero.tags.join(" · ")}</span> : null}
            </div>
          </div>
          {stat ? (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-widest text-[var(--muted2)]">Винрейт</div>
                <div className="font-display text-xl font-bold" style={{ color: wrColor(stat.winRate) }}>{fmtPct(stat.winRate)}</div>
              </div>
              {tier ? <TierChip tier={tier.tier} color={tier.color} /> : null}
            </div>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--bg)] text-[var(--muted2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--ink)]"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* табы */}
        <div className="flex gap-1 overflow-x-auto border-b border-[var(--line)] bg-[var(--panel2)] px-3 py-2">
          {([
            { k: "overview", label: "Обзор" },
            { k: "items", label: "Предметы и билд" },
            { k: "counters", label: "Матчапы" },
            { k: "abilities", label: "Способности" },
            { k: "guide", label: "Авто-гайд" },
          ] as const).map(({ k, label }) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm transition-colors ${tab === k ? "bg-[var(--accent)] font-semibold text-[#0D1110]" : "text-[var(--muted2)] hover:bg-[var(--accent-hover)] hover:text-[var(--ink)]"}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="max-h-[calc(100vh-260px)] overflow-y-auto p-5">
          {loading && !detail ? (
            <Spinner />
          ) : (
            <>
              {/* ---- ОБЗОР ---- */}
              {tab === "overview" ? (
                <div className="grid gap-5 md:grid-cols-2">
                  <div>
                    <h4 className="mb-2 font-display text-xs uppercase tracking-widest text-[var(--accent)]">Базовые характеристики</h4>
                    {hero?.startingStats && Object.keys(hero.startingStats).length > 0 ? (
                      <div>
                        {HERO_STAT_KEYS.filter((k) => hero.startingStats[k] != null).map((k) => (
                          <MiniStat key={k} label={STAT_RU[k] ?? k} value={fmt1(hero.startingStats[k])} />
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-[var(--muted2)]">Статы появятся после синхронизации каталога.</p>
                    )}
                  </div>
                  <div>
                    <h4 className="mb-2 font-display text-xs uppercase tracking-widest text-[var(--accent)]">Статистика матчей (30 дней)</h4>
                    {stat ? (
                      <div>
                        <MiniStat label="Матчей проанализировано" value={fmtInt(stat.matches)} />
                        <MiniStat label="Пик-рейт" value={fmtPct(stat.pickRate)} color="var(--spirit)" />
                        <MiniStat label="KDA" value={fmt1(stat.kda)} color="var(--accent)" />
                        <MiniStat label="Средний нетворс" value={fmtSouls(stat.avgNetWorth)} color="var(--weapon)" />
                        <MiniStat label="Урон по героям (всего)" value={fmtSouls(stat.playerDamage)} color="var(--danger)" />
                        <MiniStat label="Получено урона (всего)" value={fmtSouls(stat.damageTaken)} />
                        <MiniStat label="Ласт-хиты (всего)" value={fmtInt(stat.lastHits)} />
                      </div>
                    ) : (
                      <p className="text-sm text-[var(--muted2)]">Статистика появится после цикла синхронизации винрейтов (раз в 2 часа).</p>
                    )}
                    {historyChart.length > 2 ? (
                      <div className="mt-4 h-36">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={historyChart} margin={{ top: 6, right: 8, bottom: 0, left: -22 }}>
                            <CartesianGrid stroke="#2A332F" strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="t" tick={{ fill: "#8A9490", fontSize: 10 }} tickLine={false} axisLine={{ stroke: "#2A332F" }} minTickGap={30} />
                            <YAxis tick={{ fill: "#8A9490", fontSize: 10 }} tickLine={false} axisLine={false} width={42} domain={["dataMin - 1", "dataMax + 1"]} />
                            <Tooltip contentStyle={{ background: "#161C1A", border: "1px solid #2A332F", borderRadius: 10, fontSize: 12, color: "#E8E6E0" }} formatter={(v: number | string) => [`${v}%`, "Винрейт"]} />
                            <Line type="monotone" dataKey="wr" stroke={accent} strokeWidth={2} dot={false} isAnimationActive={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    ) : null}
                    {/* история героя: официальная русская локализация, абзацами без голых <br> */}
                    {(() => {
                      const paras = loreParagraphs(hero?.description);
                      const parasEn = loreParagraphs(hero?.descriptionEn);
                      if (paras.length === 0 && parasEn.length === 0) return null;
                      const isRu = paras.length > 0;
                      return (
                        <div className="mt-4">
                          <h4 className="mb-2 font-display text-xs uppercase tracking-widest text-[var(--accent)]">История героя</h4>
                          <div className="space-y-2">
                            {(isRu ? paras : parasEn).map((p, i) => (
                              <p key={i} className="text-sm leading-relaxed text-[var(--muted2)]">{p}</p>
                            ))}
                          </div>
                          {!isRu && parasEn.length > 0 ? (
                            <p className="mt-2 text-[11px] text-[var(--muted2)]">
                              Русская локализация появится после следующей синхронизации каталога.
                            </p>
                          ) : null}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              ) : null}

              {/* ---- ПРЕДМЕТЫ И БИЛД ---- */}
              {tab === "items" ? (
                <ItemsTab detail={detail} itemById={itemById} />
              ) : null}

              {/* ---- МАТЧАПЫ ---- */}
              {tab === "counters" ? (
                <CountersTab detail={detail} heroes={heroes} />
              ) : null}

              {/* ---- СПОСОБНОСТИ ---- */}
              {tab === "abilities" ? (
                detail?.extra?.abilities?.length ? (
                  <AbilitiesTab abilities={detail.extra.abilities} heroName={hero?.nameRu || hero?.name || ""} />
                ) : (
                  <p className="py-8 text-center text-sm text-[var(--muted2)]">
                    Способности синхронизируются задачей «Топ-предметы и автобилды» (раз в 6 часов).
                  </p>
                )
              ) : null}

              {/* ---- АВТО-ГАЙД ---- */}
              {tab === "guide" ? (
                <GuideTab detail={detail} hero={hero} itemById={itemById} heroes={heroes} />
              ) : null}
            </>
          )}
        </div>

        {detail?.extra?.updatedAt ? (
          <div className="border-t border-[var(--line)] bg-[var(--panel2)] px-5 py-2 text-[11px] text-[var(--muted2)]">
            Данные героя обновлены: {fmtDateTime(detail.extra.updatedAt)} · источник: deadlock-api.com
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------- таб способностей ---------- */

const ABILITY_TYPE_RU: Record<string, string> = {
  innate: "врождённая",
  melee: "ближний бой",
  signature: "особая",
  ultimate: "ульта",
  passive: "пассивная",
};

/** Русские названия для способностей, у которых в каталоге только внутренний ключ */
const ABILITY_NAME_RU: Record<string, string> = {
  citadel_ability_zipline_boost: "Ускорение по тросу",
  citadel_ability_climb_rope: "Карабканье по тросу",
  citadel_ability_melee_thumper: "Ближний бой",
  citadel_ability_tier2boss_aoe_wave: "Ударная волна босса",
  citadel_ability_tier3boss_drop_bombs: "Покровитель: бомбометание",
  ability_swan_ult: "Ультимейт",
};

/** "citadel_ability_zipline_boost" → "Zipline Boost" */
function prettifyAbilityName(cls: string): string {
  const bare = cls.replace(/^citadel_ability_/, "").replace(/^ability_/, "").replace(/_v\d+$/, "");
  return bare.split("_").map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join(" ");
}

function abilityDisplayName(a: { name: string; nameRu?: string; className: string }): string {
  // nameRu из каталога — если это настоящий перевод (не внутренний ключ вида ability_xxx)
  if (a.nameRu && !/[a-z]_[a-z]/.test(a.nameRu)) return a.nameRu;
  const dict = ABILITY_NAME_RU[a.className];
  if (dict) return dict;
  // если name — внутренний ключ, превращаем его в читаемый вид
  if (a.name && /[a-z]_[a-z]/.test(a.name)) return prettifyAbilityName(a.name);
  if (a.name) return a.name;
  // совсем без имени — читаем className, иначе нейтральное название
  const pretty = prettifyAbilityName(a.className);
  return pretty && !/citadel/i.test(pretty) ? pretty : "Способность";
}

function AbilityDescription({ html, heroName }: { html: string; heroName: string }) {
  // {s:hero_name} — игровой плейсхолдер, подставляем имя героя
  const filled = html.replace(/\{s:hero_name\}/g, heroName || "Герой");
  return <div className="ability-desc" dangerouslySetInnerHTML={{ __html: sanitizeHtml(filled) }} />;
}

function AbilitiesTab({ abilities, heroName }: { abilities: HeroExtraData["abilities"]; heroName: string }) {
  const main = abilities.filter((a) => a.abilityType !== "innate");
  const innate = abilities.filter((a) => a.abilityType === "innate");

  return (
    <div>
      {/* основные способности: крупные карточки с описанием */}
      {main.length > 0 ? (
        <>
          <h4 className="mb-3 font-display text-xs uppercase tracking-widest text-[var(--accent)]">Способности героя</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            {main.map((a) => {
              const typeRu = ABILITY_TYPE_RU[a.abilityType] ?? a.abilityType;
              const desc = a.descriptionRu || a.description;
              return (
                <div key={a.className + a.name} className="card-dl bg-[var(--panel2)] p-4">
                  <div className="flex items-center gap-3">
                    <SafeImg src={a.image} alt={abilityDisplayName(a)} size={46} rounded={10} fallbackText={abilityDisplayName(a).slice(0, 2)} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">{abilityDisplayName(a)}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full border border-[var(--line)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted2)]">
                          {typeRu}
                        </span>
                        {/* английское оригинальное название, если отличается */}
                        {a.name && !/[a-z]_[a-z]/.test(a.name) && abilityDisplayName(a).toLowerCase() !== a.name.toLowerCase() ? (
                          <span className="text-[10px] text-[var(--muted2)]">{a.name}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  {desc ? (
                    <div className="mt-2.5">
                      <AbilityDescription html={desc} heroName={heroName} />
                    </div>
                  ) : (
                    <p className="mt-2.5 text-xs italic text-[var(--muted2)]">Описание появится после следующей синхронизации каталога.</p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {/* врождённые: компактные плашки вместо пустых карточек */}
      {innate.length > 0 ? (
        <>
          <h4 className="mb-3 mt-6 font-display text-xs uppercase tracking-widest text-[var(--accent)]">
            Врождённые <span className="ml-1 font-sans text-[11px] normal-case tracking-normal text-[var(--muted2)]">— есть у всех героев, не прокачиваются</span>
          </h4>
          <div className="flex flex-wrap gap-2">
            {innate.map((a) => (
              <div
                key={a.className + a.name}
                className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel2)] py-1.5 pl-2 pr-3.5"
                title={abilityDisplayName(a)}
              >
                <SafeImg src={a.image} alt={abilityDisplayName(a)} size={26} rounded={13} fallbackText={abilityDisplayName(a).slice(0, 2)} />
                <span className="text-xs font-medium">{abilityDisplayName(a)}</span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

/* ---------- таб предметов ---------- */
function ItemsTab({ detail, itemById }: { detail: HeroDetail | null; itemById: Map<string, ItemRow> }) {
  const stage = (label: string, picks: HeroExtraData["builds"]["early"] | undefined, hint: string) => (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h4 className="font-display text-xs uppercase tracking-widest text-[var(--accent)]">{label}</h4>
        <span className="text-[11px] text-[var(--muted2)]">{hint}</span>
      </div>
      {picks && picks.length > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {picks.map((p) => {
            const item = itemById.get(p.itemId);
            if (!item) return null;
            return (
              <div key={p.itemId} className="item-tile flex items-center gap-2 p-2" title={`${item.name} · WR ${p.winRate.toFixed(1)}%`}>
                <ItemIcon item={item} size={34} rounded={6} />
                <div className="min-w-0">
                  <div className="truncate text-[11px] font-semibold">{item.name}</div>
                  <div className="text-[10px]" style={{ color: wrColor(p.winRate) }}>{p.winRate.toFixed(1)}%</div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-[var(--muted2)]">Недостаточно данных по стадии</p>
      )}
    </div>
  );

  const top = detail?.extra?.topItems ?? [];
  const b = detail?.extra?.builds;

  return (
    <div className="space-y-6">
      <div>
        <h4 className="mb-2 font-display text-xs uppercase tracking-widest text-[var(--accent)]">Топ-предметы героя</h4>
        {top.length > 0 ? (
          <div className="space-y-2">
            {top.map((p) => {
              const item = itemById.get(p.itemId);
              if (!item) return null;
              return (
                <div key={p.itemId} className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel2)] p-2">
                  <ItemIcon item={item} size={38} rounded={7} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-semibold">{item.name}</span>
                      {item.cost ? <span className="text-xs text-[var(--muted2)]">{fmtInt(item.cost)} душ</span> : null}
                      <span className="ml-auto text-xs" style={{ color: wrColor(p.winRate) }}>{p.winRate.toFixed(1)}% · {fmtInt(p.matches)} матчей</span>
                    </div>
                    <WrBar wr={p.winRate} min={44} max={58} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-[var(--muted2)]">Топ-предметы появятся после задачи «Топ-предметы и автобилды».</p>
        )}
      </div>
      <div className="deco-line" />
      <div className="space-y-5">
        {stage("Ранняя игра", b?.early, "первая четверть матча")}
        {stage("Середина", b?.mid, "второй-третий тир")}
        {stage("Поздняя игра", b?.late, "финальные покупки")}
      </div>
      <p className="text-xs text-[var(--muted2)]">
        Стадии построены автоматически по среднему времени покупки предметов в реальных матчах (доля от длительности игры).
      </p>
    </div>
  );
}

/* ---------- таб матчапов ---------- */
function CountersTab({ detail, heroes }: { detail: HeroDetail | null; heroes: HeroRow[] }) {
  const heroById = useMemo(() => new Map(heroes.map((h) => [h.id, h])), [heroes]);
  const c = detail?.extra?.counters;
  if (!c) {
    return <p className="py-8 text-center text-sm text-[var(--muted2)]">Матрица контрпиков синхронизируется раз в 6 часов (один запрос даёт все пары героев).</p>;
  }
  const block = (title: string, list: HeroExtraData["counters"]["hardest"], color: string, hint: string) => (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <h4 className="font-display text-xs uppercase tracking-widest" style={{ color }}>{title}</h4>
        <span className="text-[11px] text-[var(--muted2)]">{hint}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {list.map((m) => {
          const enemy = heroById.get(m.enemyHeroId);
          if (!enemy) return null;
          return (
            <div key={m.enemyHeroId} className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel2)] p-2">
              <HeroIcon hero={enemy} size={38} rounded={7} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{enemy.name}</span>
                  <span className="text-sm font-bold" style={{ color: wrColor(m.winRate) }}>{m.winRate.toFixed(1)}%</span>
                </div>
                <WrBar wr={m.winRate} min={35} max={65} />
              </div>
              <span className="text-[10px] text-[var(--muted2)]">{fmtInt(m.matches)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
  return (
    <div className="space-y-6">
      {block("Сложные соперники", c.hardest, "var(--danger)", "винрейт героя против них")}
      <div className="deco-line" />
      {block("Удобные соперники", c.easiest, "var(--ok)", "винрейт героя против них")}
    </div>
  );
}

/* ---------- авто-гайд ---------- */
function GuideTab({
  detail, hero, itemById, heroes,
}: { detail: HeroDetail | null; hero?: HeroRow; itemById: Map<string, ItemRow>; heroes: HeroRow[] }) {
  const stat = detail?.stat;
  const typeMeta = HERO_TYPE_RU[hero?.heroType ?? ""] ?? HERO_TYPE_RU[""];
  const b = detail?.extra?.builds;
  const c = detail?.extra?.counters;
  const heroById = useMemo(() => new Map(heroes.map((h) => [h.id, h])), [heroes]);

  const paragraphs: string[] = [];
  if (hero) {
    paragraphs.push(
      `${hero.name} — герой типа «${typeMeta.label}»${hero.tags?.length ? ` (${hero.tags.slice(0, 3).join(", ").toLowerCase()})` : ""}. ` +
        `Сложность ${hero.complexity ?? 1} из 3. ` +
        (hero.startingStats?.max_health ? `Базовое здоровье ${fmtInt(hero.startingStats.max_health)}, сила оружия ${fmt1(hero.startingStats.weapon_power)}.` : "")
    );
  }
  if (stat) {
    paragraphs.push(
      `За последние 30 дней проанализировано ${fmtInt(stat.matches)} матчей с героем: винрейт ${fmtPct(stat.winRate)} ` +
        `при пик-рейте ${fmtPct(stat.pickRate)}, KDA ${fmt1(stat.kda)}, средний нетворс ${fmtSouls(stat.avgNetWorth)} душ. ` +
        (stat.winRate >= 52 ? "Герой сейчас в плюсе и стабильно сильный." : stat.winRate >= 49 ? "Герой сбалансирован — около нейтрального винрейта." : "Герой сейчас в минусе: требует уверенной игры или ждёт баффа.")
    );
  }
  if (b?.early?.length) {
    const earlyNames = b.early.map((p) => itemById.get(p.itemId)?.name).filter(Boolean).slice(0, 3).join(", ");
    paragraphs.push(`Стартовая покупка по данным матчей: ${earlyNames}. Затем билд развивается через предметы средней стадии — полный порядок выше во вкладке «Предметы и билд».`);
  }
  if (c?.hardest?.length) {
    const hard = c.hardest.slice(0, 3).map((m) => heroById.get(m.enemyHeroId)?.name).filter(Boolean).join(", ");
    const easy = c.easiest.slice(0, 3).map((m) => heroById.get(m.enemyHeroId)?.name).filter(Boolean).join(", ");
    paragraphs.push(`Матчапы: осторожнее против ${hard}. Лучшая цель для агрессии — ${easy}. Полная матрица — во вкладке «Матчапы».`);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel2)] p-3 text-xs text-[var(--muted2)]">
        <Sparkles className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
        Гайд сгенерирован автоматически из данных {fmtInt(stat?.matches ?? 0)} реальных матчей (deadlock-api.com) и обновляется вместе с ними.
      </div>
      {paragraphs.map((p, i) => (
        <p key={i} className="text-sm leading-relaxed">{p}</p>
      ))}
      {detail?.extra?.topItems?.length ? (
        <div className="rounded-lg border border-[var(--line)] p-3">
          <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-[var(--muted2)]">
            <TrendingUp className="h-3.5 w-3.5" aria-hidden /> Ключевые предметы билда
          </div>
          <div className="flex flex-wrap gap-2">
            {detail.extra.topItems.slice(0, 6).map((p) => {
              const item = itemById.get(p.itemId);
              if (!item) return null;
              return (
                <span key={p.itemId} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--panel2)] px-2.5 py-1 text-xs">
                  <ItemIcon item={item} size={18} rounded={4} />
                  {item.name}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export { Sword, ShieldHalf, Clock };
