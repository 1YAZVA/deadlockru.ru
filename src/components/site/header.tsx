"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";

export type TabKey =
  | "home" | "news" | "heroes" | "meta" | "items" | "leaderboard"
  | "esports" | "guides" | "tools" | "commands" | "account";

export const TAB_LABELS: Record<TabKey, string> = {
  home: "Главная",
  news: "Новости",
  heroes: "Герои",
  meta: "Мета",
  items: "Предметы",
  leaderboard: "Лидерборд",
  esports: "Киберспорт",
  guides: "Гайды",
  tools: "Инструменты",
  commands: "Команды",
  account: "Профиль",
};

const MENU_ORDER: TabKey[] = ["account", "guides", "heroes", "meta", "items", "leaderboard", "esports", "tools", "commands"];

export function SiteHeader({
  active, onNavigate, online,
}: {
  active: TabKey;
  onNavigate: (tab: TabKey) => void;
  online: { count: number; at: string } | null;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const go = (t: TabKey) => {
    onNavigate(t);
    setMenuOpen(false);
    setMobileOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[rgba(13,17,16,0.9)] backdrop-blur-md">
      <div className="container-dl flex h-14 items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => go("home")}
            className="whitespace-nowrap font-display text-[15px] font-bold uppercase tracking-[0.14em]"
            aria-label="На главную"
          >
            Deadlock<span className="text-[var(--accent)]">{"//"}</span>RU
          </button>
          {/* возрастная маркировка информационной продукции — ФЗ-436 */}
          <span
            className="rounded-md border border-[var(--line)] px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-[var(--muted2)]"
            title="Возрастная категория 18+"
          >
            18+
          </span>
        </div>

        <nav className="ml-auto hidden items-center gap-6 text-sm text-[var(--muted2)] md:flex" aria-label="Основная навигация">
          <button
            type="button"
            onClick={() => go("home")}
            className={`transition-colors hover:text-[var(--ink)] ${active === "home" ? "text-[var(--ink)]" : ""}`}
          >
            Главная
          </button>
          <button
            type="button"
            onClick={() => go("news")}
            className={`transition-colors hover:text-[var(--ink)] ${active === "news" ? "text-[var(--ink)]" : ""}`}
          >
            Новости
          </button>
          <span
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-1 text-[13px] text-[var(--muted2)]"
            title="Мониторинг онлайна Deadlock в Steam"
          >
            <span className="dot-dl" />
            <span>Онлайн:</span> <b className="font-semibold text-[var(--ink)]">{online ? online.count.toLocaleString("ru-RU") : "…"}</b>
          </span>

          {/* раскрывающееся меню остальных разделов */}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              aria-expanded={menuOpen}
              aria-haspopup="true"
              onClick={() => setMenuOpen((v) => !v)}
              className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-1 text-[13px] text-[var(--ink)] transition-colors hover:border-[var(--accent)]"
            >
              <Menu className="h-3.5 w-3.5" aria-hidden />
              Меню
              <ChevronDown className={`h-3 w-3 transition-transform ${menuOpen ? "rotate-180" : ""}`} aria-hidden />
            </button>
            {menuOpen ? (
              <div
                role="menu"
                className="fade-in absolute right-0 top-[calc(100%+8px)] w-56 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] p-1.5 shadow-2xl"
              >
                {MENU_ORDER.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="menuitem"
                    onClick={() => go(t)}
                    className={`block w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--accent-hover)] ${active === t ? "text-[var(--accent)]" : "text-[var(--ink)]"}`}
                  >
                    {TAB_LABELS[t]}
                  </button>
                ))}
                <div className="deco-line my-1.5" />
                <div className="px-3 py-1.5 text-[11px] text-[var(--muted2)]">
                  Все данные обновляются автоматически
                </div>
              </div>
            ) : null}
          </div>
        </nav>

        {/* мобильная кнопка */}
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-[13px] md:hidden"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-label="Открыть меню"
        >
          {mobileOpen ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
          Меню
        </button>
      </div>

      {mobileOpen ? (
        <div className="fade-in border-t border-[var(--line)] bg-[var(--panel2)] md:hidden">
          <div className="container-dl grid grid-cols-2 gap-1 py-3">
            {(Object.keys(TAB_LABELS) as TabKey[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => go(t)}
                className={`rounded-lg px-3 py-2.5 text-left text-sm ${active === t ? "bg-[var(--accent-hover)] text-[var(--accent)]" : "text-[var(--ink)]"}`}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
            <div className="col-span-2 mt-1 flex items-center justify-center gap-2 rounded-full border border-[var(--line)] px-3 py-1.5 text-xs text-[var(--muted2)]">
              <span className="dot-dl" />
              Онлайн Steam: <b className="text-[var(--ink)]">{online ? online.count.toLocaleString("ru-RU") : "…"}</b>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}
