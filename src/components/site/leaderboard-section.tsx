"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Crown, Medal, Search, Timer, Trophy, UserSearch, X } from "lucide-react";
import type { HeroRow, LbResponse } from "@/lib/site";
import { apiGet, REGION_RU, fmtInt, fmtDateTime, timeAgo, STATIC_MODE } from "@/lib/site";
import { HeroIcon, SafeImg, SectionHeader, Spinner } from "./shared";

type SearchResultRow = { account_id: number; personaname: string; profileurl?: string; avatar?: string };

const REGIONS = ["Global", "Europe", "NAmerica", "SAmerica", "Asia", "Oceania"] as const;

export function LeaderboardSection({ heroes }: { heroes: HeroRow[] }) {
  const heroById = useMemo(() => new Map(heroes.map((h) => [h.id, h])), [heroes]);
  const [region, setRegion] = useState<(typeof REGIONS)[number]>("Global");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [full, setFull] = useState<LbResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [nextIn, setNextIn] = useState(30 * 60);

  // поиск игрока по нику (Steam)
  const [playerQ, setPlayerQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<SearchResultRow[]>([]);

  const load = useCallback(async (r: string) => {
    setLoading(true);
    try {
      const d = await apiGet<LbResponse>(`/api/leaderboard?region=${r}`);
      setFull(d);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(region);
  }, [load, region]);

  // в статике грузим весь регион одним файлом — пагинация и поиск локально;
  // на сервере — как раньше, по запросу
  const filteredRows = useMemo(() => {
    const all = full?.rows ?? [];
    const q = search.trim().toLowerCase();
    return q ? all.filter((r) => r.accountName.toLowerCase().includes(q)) : all;
  }, [full, search]);

  const data = useMemo(() => {
    if (!full) return null;
    if (!STATIC_MODE) return full;
    const pageSize = 25;
    return {
      ...full,
      rows: filteredRows.slice((page - 1) * pageSize, page * pageSize),
      total: filteredRows.length,
      page,
      pageSize,
    };
  }, [full, filteredRows, page]);

  // авт refresh каждые 60с + обратный отсчёт до серверной синхронизации (30 мин)
  useEffect(() => {
    const t = setInterval(() => {
      setNextIn((v) => {
        if (v <= 1) {
          void load(region);
          return 30 * 60;
        }
        return v - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [load, region]);

  useEffect(() => {
    if (data?.updatedAt) {
      const elapsed = Math.max(0, Math.floor((Date.now() - new Date(data.updatedAt).getTime()) / 1000));
      setNextIn(Math.max(10, 30 * 60 - elapsed));
    }
  }, [data]);

  const mmss = `${String(Math.floor(nextIn / 60)).padStart(2, "0")}:${String(nextIn % 60).padStart(2, "0")}`;
  const podium = useMemo(() => (data?.rows ?? []).filter((r) => r.rank <= 3 && page === 1 && !search).slice(0, 3), [data, page, search]);
  const topHeroAgg = useMemo(() => (data?.topHeroes ?? []).map((t) => ({ ...t, hero: heroById.get(t.heroId) })).filter((x) => x.hero).slice(0, 6), [data, heroById]);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  const doPlayerSearch = async () => {
    if (playerQ.trim().length < 2) return;
    setSearching(true);
    try {
      const res = await apiGet<{ results: SearchResultRow[] }>(`/api/search?q=${encodeURIComponent(playerQ.trim())}`);
      setFound(res.results);
    } finally {
      setSearching(false);
    }
  };

  return (
    <section className="container-dl py-10">
      <SectionHeader
        kicker="Официальный рейтинг Deadlock"
        title="Лидерборд"
        lead="Топ-игроки пяти регионов с их сильнейшими героями. Данные тянутся с официального рейтинга автоматически каждые 30 минут — следите за обратным отсчётом."
        right={
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-1 text-xs text-[var(--muted2)]">
            <Timer className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden />
            Обновление через <b className="font-mono text-[var(--ink)]">{mmss}</b>
          </span>
        }
      />

      {/* подиум */}
      {podium.length === 3 ? (
        <div className="mb-8 grid gap-4 md:grid-cols-3">
          {[podium[1], podium[0], podium[2]].map((row, idx) => {
            const place = idx === 1 ? 1 : idx === 0 ? 2 : 3;
            const color = place === 1 ? "var(--accent)" : place === 2 ? "#B8C2BD" : "var(--weapon)";
            return (
              <div
                key={row.region + row.rank}
                className="card-dl relative p-5 text-center"
                style={{ borderTop: `3px solid ${color}`, transform: place === 1 ? "translateY(-6px)" : undefined }}
              >
                {place === 1 ? <Crown className="mx-auto mb-1 h-5 w-5 text-[var(--accent)]" aria-hidden /> : null}
                <div className="font-display text-3xl font-bold" style={{ color }}>{place}</div>
                {/* Steam-аватар игрока (через прокси сайта — работает из РФ) */}
                <div className="mt-2 flex justify-center">
                  <SafeImg
                    src={row.avatar}
                    alt={row.accountName}
                    size={72}
                    circle
                    className="h-18 w-18 shadow-lg"
                    style={{ width: 72, height: 72, borderWidth: 2, borderColor: color, background: "var(--panel2)" }}
                    fallbackText={row.accountName.slice(0, 2)}
                  />
                </div>
                <div className="mt-2 truncate font-display text-base font-bold">{row.accountName}</div>
                <div className="mt-1 text-xs text-[var(--muted2)]">
                  {REGION_RU[row.region]} · позиция {row.rank} в регионе
                </div>
                <div className="mt-3 flex justify-center gap-1.5">
                  {(row.topHeroIds ?? []).slice(0, 5).map((hid) => (
                    <HeroIcon key={hid} hero={heroById.get(hid)} size={30} rounded={6} />
                  ))}
                </div>
                {place === 1 ? (
                  <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--accent)] px-3 py-1 text-[11px] text-[var(--accent)]">
                    <Medal className="h-3 w-3" aria-hidden /> Лидер {REGION_RU[row.region]}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* фильтры */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="inline-flex flex-wrap rounded-full border border-[var(--line)] bg-[var(--panel)] p-1">
          {REGIONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => { setRegion(r); setPage(1); setSearch(""); }}
              className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${region === r ? "bg-[var(--accent)] font-semibold text-[#0D1110]" : "text-[var(--muted2)] hover:text-[var(--ink)]"}`}
            >
              {REGION_RU[r]}
              {data?.regionCounts?.[r] ? <span className="ml-1.5 text-[10px] opacity-70">{fmtInt(data.regionCounts[r])}</span> : null}
            </button>
          ))}
        </div>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted2)]" aria-hidden />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Фильтр по никнейму..."
            className="w-full rounded-full border border-[var(--line)] bg-[var(--panel)] py-2 pl-9 pr-4 text-sm outline-none placeholder:text-[var(--muted2)] focus:border-[var(--accent)]"
            aria-label="Фильтр по никнейму"
          />
        </div>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--accent)] bg-[rgba(200,169,106,0.1)] px-4 py-2 text-sm font-semibold text-[var(--accent)] transition-colors hover:bg-[rgba(200,169,106,0.2)]"
        >
          <UserSearch className="h-4 w-4" aria-hidden /> Найти любого игрока Steam
        </button>
        {data?.updatedAt ? (
          <span className="ml-auto text-[11px] text-[var(--muted2)]">Данные рейтинга: {timeAgo(data.updatedAt)}</span>
        ) : null}
      </div>

      {/* таблица */}
      {loading && !data ? (
        <Spinner />
      ) : (
        <div className="card-dl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-left text-[11px] uppercase tracking-widest text-[var(--muted2)]">
                  <th className="w-16 px-4 py-3">#</th>
                  <th className="px-4 py-3">Игрок</th>
                  <th className="px-4 py-3">Регион</th>
                  <th className="px-4 py-3">Топ герои</th>
                </tr>
              </thead>
              <tbody>
                {(data?.rows ?? []).map((row) => (
                  <tr key={row.region + row.rank} className="lb-row border-b border-[var(--line)] last:border-0">
                    <td className="px-4 py-2.5">
                      <span className={`font-display font-bold ${row.rank <= 3 ? "text-[var(--accent)]" : "text-[var(--muted2)]"}`}>
                        {region === "Global" ? `${row.rank}·${REGION_RU[row.region]}` : row.rank}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-3">
                        <SafeImg
                          src={row.avatar}
                          alt={row.accountName}
                          size={32}
                          circle
                          style={{ background: "var(--panel2)" }}
                          fallbackText={row.accountName.slice(0, 2)}
                        />
                        {row.profileUrl ? (
                          <a
                            href={row.profileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="Профиль Steam ↗"
                            className="font-semibold hover:text-[var(--accent)] hover:underline"
                          >
                            {row.accountName}
                          </a>
                        ) : (
                          <span className="font-semibold">{row.accountName}</span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-[var(--muted2)]">{REGION_RU[row.region]}</td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1.5">
                        {(row.topHeroIds ?? []).slice(0, 5).map((hid) => (
                          <span key={hid} title={heroById.get(hid)?.name ?? ""}>
                            <HeroIcon hero={heroById.get(hid)} size={28} rounded={6} />
                          </span>
                        ))}
                        {(row.topHeroIds ?? []).length === 0 ? <span className="text-xs text-[var(--muted2)]">—</span> : null}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] p-3">
            <span className="text-xs text-[var(--muted2)]">
              {data ? `${fmtInt(data.total)} записей в выборке · страница ${data.page} из ${pages}` : "—"}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-[var(--line)] px-3.5 py-1.5 text-sm disabled:opacity-40"
              >
                Назад
              </button>
              <button
                type="button"
                disabled={page >= pages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-[var(--line)] px-3.5 py-1.5 text-sm disabled:opacity-40"
              >
                Вперёд
              </button>
            </div>
          </div>
        </div>
      )}

      {/* топ героев рейтинга */}
      {topHeroAgg.length > 0 ? (
        <div className="card-dl mt-6 p-5">
          <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-bold uppercase tracking-widest text-[var(--accent)]">
            <Trophy className="h-4 w-4" aria-hidden /> Чаще всего в топах рейтинга
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {topHeroAgg.map(({ hero, count }) => (
              <div key={hero!.id} className="flex items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel2)] p-2.5">
                <HeroIcon hero={hero} size={36} rounded={7} />
                <span className="flex-1 truncate text-sm font-semibold">{hero!.name}</span>
                <span className="text-xs text-[var(--muted2)]">{fmtInt(count)} игроков</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* поиск игрока */}
      {searchOpen ? (
        <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/70 p-4 pt-24 backdrop-blur-sm" onClick={() => setSearchOpen(false)} role="dialog" aria-modal="true">
          <div className="fade-in w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg)]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 border-b border-[var(--line)] p-4">
              <Search className="h-4 w-4 text-[var(--accent)]" aria-hidden />
              <input
                autoFocus
                value={playerQ}
                onChange={(e) => setPlayerQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void doPlayerSearch();
                  if (e.key === "Escape") setSearchOpen(false);
                }}
                placeholder="Никнейм игрока Steam..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--muted2)]"
                aria-label="Никнейм игрока Steam"
              />
              <button type="button" onClick={() => void doPlayerSearch()} className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-xs font-bold text-[#0D1110]">
                Найти
              </button>
              <button type="button" onClick={() => setSearchOpen(false)} className="text-[var(--muted2)] hover:text-[var(--ink)]" aria-label="Закрыть поиск">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto p-3">
              {searching ? (
                <Spinner label="Ищем в базе игроков Steam..." />
              ) : found.length === 0 ? (
                <p className="p-6 text-center text-sm text-[var(--muted2)]">
                  Введите никнейм и нажмите Enter — покажем профили из публичной статистики Deadlock.
                </p>
              ) : (
                found.map((r) => (
                  <a
                    key={r.account_id}
                    href={r.profileurl ?? `https://steamcommunity.com/profiles/${r.account_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-[var(--accent-hover)]"
                  >
                    <SafeImg
                      src={r.avatar}
                      alt={r.personaname}
                      size={40}
                      circle
                      className="h-10 w-10"
                      style={{ background: "var(--panel2)" }}
                      fallbackText={r.personaname.slice(0, 2)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{r.personaname}</span>
                      <span className="block text-[11px] text-[var(--muted2)]">ID {r.account_id}</span>
                    </span>
                    <span className="text-[11px] text-[var(--accent)]">Профиль ↗</span>
                  </a>
                ))
              )}
            </div>
            <div className="border-t border-[var(--line)] p-2.5 text-center text-[10px] text-[var(--muted2)]">
              Обновлено: {fmtDateTime(data?.updatedAt ?? null)} · поиск по публичной статистике deadlock-api.com
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
