"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { HeroRow, ItemRow, MetaResponse, StateData } from "@/lib/site";
import { apiGet } from "@/lib/site";
import { SiteHeader, type TabKey } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { HomeSection } from "@/components/site/home-section";
import { Spinner } from "@/components/site/shared";

/**
 * Разделы грузятся отдельными чанками: главная не тянет код инструментов,
 * рулетки, таблиц и карточки героя. Это режет стартовый JS в разы.
 */
const sectionFallback = () => (
  <div className="py-20">
    <Spinner label="Загружаем раздел…" />
  </div>
);

const NewsSection = dynamic(() => import("@/components/site/news-section").then((m) => m.NewsSection), { loading: sectionFallback });
const HeroesSection = dynamic(() => import("@/components/site/heroes-section").then((m) => m.HeroesSection), { loading: sectionFallback });
const MetaSection = dynamic(() => import("@/components/site/meta-section").then((m) => m.MetaSection), { loading: sectionFallback });
const ItemsSection = dynamic(() => import("@/components/site/items-section").then((m) => m.ItemsSection), { loading: sectionFallback });
const LeaderboardSection = dynamic(() => import("@/components/site/leaderboard-section").then((m) => m.LeaderboardSection), { loading: sectionFallback });
const EsportsSection = dynamic(() => import("@/components/site/esports-section").then((m) => m.EsportsSection), { loading: sectionFallback });
const GuidesSection = dynamic(() => import("@/components/site/guides-section").then((m) => m.GuidesSection), { loading: sectionFallback });
const ToolsSection = dynamic(() => import("@/components/site/tools-section").then((m) => m.ToolsSection), { loading: sectionFallback });
const CommandsSection = dynamic(() => import("@/components/site/commands-section").then((m) => m.CommandsSection), { loading: sectionFallback });
const AccountSection = dynamic(() => import("@/components/site/account-section").then((m) => m.AccountSection), { loading: sectionFallback });
const HeroDialog = dynamic(() => import("@/components/site/hero-dialog").then((m) => m.HeroDialog), { loading: () => null });

const VALID_TABS: TabKey[] = ["home", "news", "heroes", "meta", "items", "leaderboard", "esports", "guides", "tools", "commands", "account"];

function tabFromHash(): TabKey {
  if (typeof window === "undefined") return "home";
  const h = window.location.hash.replace("#", "") as TabKey;
  return VALID_TABS.includes(h) ? h : "home";
}

export default function Page() {
  const [tab, setTab] = useState<TabKey>("home");
  const tabRef = useRef<TabKey>("home");
  const [state, setState] = useState<StateData | null>(null);
  const [heroes, setHeroes] = useState<HeroRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [heroDialog, setHeroDialog] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const navigate = useCallback((t: TabKey) => {
    tabRef.current = t;
    setTab(t);
    if (typeof window !== "undefined") {
      // push, а не replace: каждая вкладка — отдельная запись истории,
      // кнопка «Назад» браузера возвращает к предыдущей вкладке, а не уводит с сайта
      if (window.location.hash !== `#${t}`) {
        window.history.pushState(null, "", `#${t}`);
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  // первичная загрузка данных
  useEffect(() => {
    const t0 = tabFromHash();
    tabRef.current = t0;
    setTab(t0);
    // «Назад»/«Вперёд» браузера: вкладка меняется по hash из истории
    const onHash = () => {
      const t = tabFromHash();
      if (t !== tabRef.current) {
        tabRef.current = t;
        setTab(t);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    };
    window.addEventListener("hashchange", onHash);
    // карточка героя сидит в истории через state записи (dlHero) — «Назад» закрывает её, не уводя с сайта
    const onPop = (e: PopStateEvent) => {
      setHeroDialog((e.state as { dlHero?: number } | null)?.dlHero ?? null);
    };
    window.addEventListener("popstate", onPop);

    (async () => {
      try {
        const [s, h] = await Promise.all([apiGet<StateData>("/api/state"), apiGet<{ heroes: HeroRow[] }>("/api/heroes")]);
        setState(s);
        setHeroes(h.heroes);
        // предметы и мета — параллельно, не блокируем главную
        apiGet<{ items: ItemRow[] }>("/api/items").then((d) => setItems(d.items)).catch(() => {});
        apiGet<MetaResponse>("/api/meta").then(setMeta).catch(() => {});
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось загрузить данные");
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("popstate", onPop);
    };
  }, []);

  // лёгкий поллинг состояния (онлайн, счётчики, свежий патч)
  useEffect(() => {
    const t = setInterval(() => {
      apiGet<StateData>("/api/state").then(setState).catch(() => {});
    }, 90_000);
    return () => clearInterval(t);
  }, []);

  const lastSyncAt = useMemo(() => {
    if (!state?.sync) return null;
    const times = Object.values(state.sync)
      .filter(Boolean)
      .map((s) => (s as { at: string }).at)
      .sort();
    return times.length ? times[times.length - 1] : null;
  }, [state]);

  const openHero = useCallback((id: number) => {
    setHeroDialog(id);
    // запись истории без смены URL: «Назад» закрывает карточку героя, «Вперёд» — открывает снова
    try {
      window.history.pushState({ dlHero: id }, "");
    } catch {}
  }, []);

  const closeHero = useCallback(() => {
    setHeroDialog(null);
    // если верхняя запись истории — запись карточки, съедаем её, чтобы «Назад» не открывал закрытую карточку
    if (typeof window !== "undefined" && (window.history.state as { dlHero?: number } | null)?.dlHero) {
      window.history.back();
    }
  }, []);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader active={tab} onNavigate={navigate} online={state?.online ?? null} />

      {/* pb-10 — гарантированный зазор между контентом раздела и футером,
          чтобы нижняя карточка/баннер не прилипали к подвалу сайта */}
      <main className="flex-1 pb-10">
        {error ? (
          <div className="container-dl py-20 text-center">
            <div className="card-dl mx-auto max-w-md p-8">
              <h2 className="font-display text-lg font-bold text-[var(--danger)]">Сервер данных недоступен</h2>
              <p className="mt-2 text-sm text-[var(--muted2)]">{error}. Планировщик повторит синхронизацию автоматически.</p>
            </div>
          </div>
        ) : loading ? (
          <div className="py-24">
            <Spinner label="Подключаемся к базе данных Deadlock//RU..." />
          </div>
        ) : (
          <div key={tab} className="fade-in">
            {tab === "home" ? <HomeSection state={state} heroes={heroes} meta={meta} onNavigate={navigate} onOpenHero={openHero} /> : null}
            {tab === "news" ? <NewsSection /> : null}
            {tab === "heroes" ? <HeroesSection heroes={heroes} onOpenHero={openHero} /> : null}
            {tab === "meta" ? <MetaSection meta={meta} heroes={heroes} onOpenHero={openHero} /> : null}
            {tab === "items" ? <ItemsSection items={items} /> : null}
            {tab === "leaderboard" ? <LeaderboardSection heroes={heroes} /> : null}
            {tab === "esports" ? <EsportsSection /> : null}
            {tab === "guides" ? <GuidesSection heroes={heroes} onOpenHero={openHero} /> : null}
            {tab === "tools" ? <ToolsSection heroes={heroes} items={items} meta={meta} onOpenHero={openHero} /> : null}
            {tab === "commands" ? <CommandsSection /> : null}
            {tab === "account" ? <AccountSection heroes={heroes} /> : null}
          </div>
        )}
      </main>

      <SiteFooter lastSyncAt={lastSyncAt} />

      {heroDialog != null ? (
        <HeroDialog heroId={heroDialog} heroes={heroes} items={items} onClose={closeHero} />
      ) : null}
    </div>
  );
}
