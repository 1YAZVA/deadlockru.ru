"use client";

/** ФИШКА 5 — Центр автоматизации: статусы всех задач синхронизации, ручной запуск, логи */
import { useCallback, useEffect, useState } from "react";
import { Activity, CheckCircle2, Database, Play, RefreshCw, XCircle, Zap } from "lucide-react";
import type { SyncStatus } from "@/lib/site";
import { apiGet, fmtDateTime, fmtInt, timeAgo } from "@/lib/site";
import { GH_PAGES } from "@/lib/gh-data";
import { Spinner } from "./shared";

const SOURCES = [
  { name: "deadlock-api.com", what: "Герои, предметы, винрейты, контрпики, лидерборды 5 регионов, активные матчи, ранги", url: "https://deadlock-api.com" },
  { name: "Steam Web API", what: "Онлайн игроков (GetNumberOfCurrentPlayers, appid 1422450)", url: "https://api.steampowered.com" },
  { name: "Steam RSS + форумы Valve", what: "Патчи и новости из changelog playdeadlock.com и Steam-анонсов", url: "https://store.steampowered.com/news/app/1422450" },
  { name: "collegedeadlock.com / Liquipedia", what: "Киберспортивная сцена: турниры и команды (посев + админ-API)", url: "https://collegedeadlock.com" },
];

export function ToolSync() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // GitHub Pages: сервера нет, синками занимается GitHub Action по расписанию —
  // ручной запуск скрыт, вместо журналов показываем пояснение
  const gh = GH_PAGES;

  const load = useCallback(() => {
    if (gh) { setLoading(false); return; }
    apiGet<SyncStatus>("/api/sync")
      .then(setStatus)
      .finally(() => setLoading(false));
  }, [gh]);

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const runTask = async (task: string) => {
    if (gh) return;
    setBusy(task);
    setMessage(null);
    try {
      const res = await apiGet<{ ok: boolean; records?: number; error?: string }>(`/api/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task }),
      } as RequestInit);
      if (res.ok) setMessage(`Задача «${task}» выполнена: ${fmtInt(res.records ?? 0)} записей обновлено`);
      else setMessage(`Ошибка: ${res.error ?? "неизвестно"}`);
      load();
    } catch (e) {
      setMessage(`Ошибка: ${e instanceof Error ? e.message : "нет связи с сервером"}`);
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <Spinner label="Читаем журналы автоматизации..." />;

  if (gh) {
    return (
      <div>
        <div className="mb-5 flex items-start gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel2)] p-3 text-xs text-[var(--muted2)]">
          <Zap className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
          <span>
            Версия сайта на GitHub Pages обновляется <b>GitHub Action</b> по расписанию: лидерборды и активные матчи —
            каждые 30 минут, мета и герои — раз в 2 часа, новости и патчи — раз в час. Ручной запуск и журналы
            доступны в действиях репозитория (вкладка Actions на GitHub).
          </span>
        </div>
        <div className="rounded-lg border border-[var(--line)] bg-[var(--panel2)] p-4 text-sm text-[var(--muted2)]">
          {SOURCES.map((s) => (
            <div key={s.name} className="mb-2 last:mb-0">
              <b className="text-[var(--fg)]">{s.name}</b> — {s.what}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const taskEntries = Object.entries(status?.tasks ?? {}).filter(([k]) => k !== "esports-seed");

  return (
    <div>
      <div className="mb-5 flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel2)] p-3 text-xs text-[var(--muted2)]">
        <Zap className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
        Сайт синхронизирует себя сам: планировщик на сервере крутит задачи по расписанию. Здесь видно статус каждой,
        можно дёрнуть вручную и посмотреть логи последних запусков.
      </div>

      {message ? (
        <div className="fade-in mb-4 rounded-lg border border-[var(--accent)] bg-[rgba(200,169,106,0.08)] p-3 text-sm text-[var(--accent)]">
          {message}
        </div>
      ) : null}

      {/* задачи */}
      <div className="mb-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {taskEntries.map(([key, meta]) => {
          const last = status?.last?.[key];
          const isRunning = (status?.running ?? []).includes(key) || busy === key;
          return (
            <div key={key} className="card-dl flex flex-col p-4" style={{ borderTop: `2px solid ${last?.status === "error" ? "var(--danger)" : "var(--ok)"}` }}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-display text-sm font-bold">{meta.title}</h4>
                  <div className="mt-0.5 text-[11px] text-[var(--muted2)]">{meta.schedule}</div>
                </div>
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                  style={{
                    color: isRunning ? "var(--weapon)" : last?.status === "error" ? "var(--danger)" : "var(--ok)",
                    border: `1px solid ${isRunning ? "var(--weapon)" : last?.status === "error" ? "var(--danger)" : "var(--ok)"}`,
                  }}
                >
                  {isRunning ? "работает" : last?.status === "error" ? "ошибка" : "ок"}
                </span>
              </div>
              <div className="mt-2 flex-1 space-y-0.5 text-[11px] text-[var(--muted2)]">
                <div>Источник: {meta.source}</div>
                <div>
                  Последний запуск: {last ? `${timeAgo(last.at)} · ${fmtInt(last.records)} записей · ${(last.durationMs / 1000).toFixed(1)} с` : "ещё не запускалась"}
                </div>
                {last?.message ? <div className="truncate text-[var(--danger)]"> {last.message}</div> : null}
              </div>
              <button
                type="button"
                onClick={() => void runTask(key)}
                disabled={isRunning}
                className="mt-3 inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
              >
                {isRunning ? <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Play className="h-3.5 w-3.5" aria-hidden />}
                {isRunning ? "Выполняется..." : "Запустить сейчас"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void runTask("all")}
          disabled={busy === "all" || (status?.running ?? []).length > 0}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-bold text-[#0D1110] transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy === "all" ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden /> : <Zap className="h-4 w-4" aria-hidden />}
          Полный цикл синхронизации
        </button>
      </div>

      {/* источники */}
      <h4 className="mb-3 flex items-center gap-2 font-display text-xs uppercase tracking-widest text-[var(--accent)]">
        <Database className="h-4 w-4" aria-hidden /> Источники данных
      </h4>
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        {SOURCES.map((s) => (
          <a key={s.name} href={s.url} target="_blank" rel="noopener noreferrer" className="card-dl p-4 transition-colors hover:border-[var(--accent)]">
            <div className="font-display text-sm font-bold text-[var(--accent)]">{s.name} ↗</div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted2)]">{s.what}</p>
          </a>
        ))}
      </div>

      {/* логи */}
      <h4 className="mb-3 flex items-center gap-2 font-display text-xs uppercase tracking-widest text-[var(--accent)]">
        <Activity className="h-4 w-4" aria-hidden /> Журнал запусков (последние 40)
      </h4>
      <div className="card-dl max-h-80 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[var(--panel)]">
            <tr className="border-b border-[var(--line)] text-left text-[10px] uppercase tracking-widest text-[var(--muted2)]">
              <th className="px-3 py-2">Время</th>
              <th className="px-3 py-2">Задача</th>
              <th className="px-3 py-2">Статус</th>
              <th className="px-3 py-2">Записей</th>
              <th className="px-3 py-2">Длительность</th>
              <th className="px-3 py-2">Сообщение</th>
            </tr>
          </thead>
          <tbody>
            {(status?.logs ?? []).map((l) => (
              <tr key={l.id} className="border-b border-[var(--line)] last:border-0">
                <td className="whitespace-nowrap px-3 py-1.5 text-[var(--muted2)]">{fmtDateTime(l.at)}</td>
                <td className="px-3 py-1.5 font-semibold">{l.task}</td>
                <td className="px-3 py-1.5">
                  <span className="inline-flex items-center gap-1" style={{ color: l.status === "ok" ? "var(--ok)" : "var(--danger)" }}>
                    {l.status === "ok" ? <CheckCircle2 className="h-3 w-3" aria-hidden /> : <XCircle className="h-3 w-3" aria-hidden />}
                    {l.status}
                  </span>
                </td>
                <td className="px-3 py-1.5">{fmtInt(l.records)}</td>
                <td className="px-3 py-1.5 text-[var(--muted2)]">{(l.durationMs / 1000).toFixed(1)} с</td>
                <td className="max-w-40 truncate px-3 py-1.5 text-[var(--muted2)]" title={l.message}>{l.message || "—"}</td>
              </tr>
            ))}
            {(status?.logs ?? []).length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-[var(--muted2)]">Журнал пуст — задачи ещё не запускались</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
