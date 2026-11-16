"use client";

import { useEffect, useState } from "react";
import { CalendarDays, ExternalLink, Radio, Shield, Users } from "lucide-react";
import type { EsportsData } from "@/lib/site";
import { apiGet, fmtDate } from "@/lib/site";
import { EmptyState, SectionHeader, Spinner } from "./shared";

const STATUS_RU: Record<string, { label: string; color: string }> = {
  ongoing: { label: "Идёт сейчас", color: "var(--ok)" },
  upcoming: { label: "Скоро", color: "var(--accent)" },
  completed: { label: "Завершён", color: "var(--muted2)" },
  live: { label: "LIVE", color: "var(--danger)" },
  finished: { label: "Завершён", color: "var(--muted2)" },
};

export function EsportsSection() {
  const [data, setData] = useState<EsportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"tournaments" | "teams" | "matches">("tournaments");

  useEffect(() => {
    apiGet<EsportsData>("/api/esports")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="container-dl py-10">
      <SectionHeader
        kicker="Молодая, но живая сцена"
        title="Киберспорт Deadlock"
        lead="От студенческой лиги DCS до первого в истории LAN-турнира Guildlock Invitational — база турниров, команд и расписания. Сцена взрослеет: за 2026 год в турнирах разыграно $244,486 (по данным Liquipedia)."
      />

      <div className="mb-6 inline-flex rounded-full border border-[var(--line)] bg-[var(--panel)] p-1">
        {([
          { k: "tournaments", label: "Турниры", icon: CalendarDays },
          { k: "teams", label: "Команды", icon: Users },
          { k: "matches", label: "Расписание", icon: Radio },
        ] as const).map(({ k, label, icon: Icon }) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm transition-colors ${tab === k ? "bg-[var(--accent)] font-semibold text-[#0D1110]" : "text-[var(--muted2)] hover:text-[var(--ink)]"}`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : tab === "tournaments" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(data?.tournaments ?? []).map((t) => {
            const st = STATUS_RU[t.status] ?? STATUS_RU.upcoming;
            return (
              <article key={t.id} className="card-dl flex flex-col p-5" style={{ borderTop: `2px solid ${st.color}` }}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-base font-bold leading-snug">{t.name}</h3>
                  <span
                    className="shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: st.color, border: `1px solid ${st.color}` }}
                  >
                    {st.label}
                  </span>
                </div>
                <div className="mt-2 space-y-1 text-xs text-[var(--muted2)]">
                  <div>{t.organizer} · {t.region}</div>
                  <div>{t.format}</div>
                  <div>
                    Призовой фонд: <b className="text-[var(--accent)]">{t.prizePool || "—"}</b>
                    {t.teamsCount ? <> · {t.teamsCount} команд</> : null}
                  </div>
                  <div>
                    {t.startDate ? fmtDate(t.startDate) : "?"} — {t.endDate ? fmtDate(t.endDate) : "по н.в."}
                  </div>
                </div>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--muted2)]">{t.description}</p>
                {t.source ? (
                  <a href={t.source} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-xs text-[var(--accent)] hover:underline">
                    Источник <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                ) : null}
              </article>
            );
          })}
          {(data?.tournaments ?? []).length === 0 ? <EmptyState title="Турниры не найдены" hint="База киберспорта ещё не заполнена" /> : null}
        </div>
      ) : tab === "teams" ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(data?.teams ?? []).map((tm) => (
            <article key={tm.id} className="card-dl p-5" style={{ borderTop: "2px solid var(--spirit)" }}>
              <div className="flex items-center gap-3">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--spirit)] font-display text-sm font-bold text-[var(--spirit)]">
                  {tm.tag || tm.name.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <h3 className="font-display text-base font-bold">{tm.name}</h3>
                  <div className="text-xs text-[var(--muted2)]">{tm.region}</div>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[var(--muted2)]">{tm.description}</p>
            </article>
          ))}
          <article className="card-dl flex flex-col justify-center border-dashed p-5 text-center">
            <Shield className="mx-auto mb-2 h-6 w-6 text-[var(--muted2)]" aria-hidden />
            <p className="text-sm text-[var(--muted2)]">
              База команд пополняется. Сцена Deadlock молодая: как только команды публикуют составы на
              Liquipedia и в DCS, они появляются здесь через админ-API портала.
            </p>
          </article>
        </div>
      ) : (
        <div className="space-y-3">
          {(data?.matches ?? []).map((m) => {
            const st = STATUS_RU[m.status] ?? STATUS_RU.upcoming;
            return (
              <article key={m.id} className="card-dl flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-44 flex-1">
                  <div className="text-[11px] uppercase tracking-widest text-[var(--muted2)]">{m.tournamentName}</div>
                  <div className="mt-0.5 text-xs text-[var(--muted2)]">{m.stage}</div>
                </div>
                <div className="flex items-center gap-3 text-sm font-semibold">
                  <span className="text-right">{m.teamA}</span>
                  <span className="rounded-md border border-[var(--line)] px-2.5 py-1 font-display text-xs text-[var(--muted2)]">{m.format}</span>
                  <span>{m.teamB}</span>
                </div>
                <div className="ml-auto flex items-center gap-3 text-xs text-[var(--muted2)]">
                  <span>{m.scheduledAt ? fmtDate(m.scheduledAt) : "—"}</span>
                  <span
                    className="rounded-full px-2.5 py-1 font-bold uppercase tracking-wider"
                    style={{ color: st.color, border: `1px solid ${st.color}`, fontSize: 10 }}
                  >
                    {st.label}
                  </span>
                </div>
              </article>
            );
          })}
          {(data?.matches ?? []).length === 0 ? (
            <EmptyState title="Расписание пусто" hint="Матчи появятся по мере публикации сеток турнирами" />
          ) : null}
        </div>
      )}

      <p className="mt-6 text-xs leading-relaxed text-[var(--muted2)]">
        Источники: collegedeadlock.com (Deadlock Collegiate Series), Liquipedia (Guildlock Invitational и коммьюнити-кубки).
        Данные раздела редактируются через административный API портала (POST /api/esports).
      </p>
    </section>
  );
}
