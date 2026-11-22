"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowRight, Radio, RefreshCw, Swords, Trophy, Users, Zap, BookOpen, Wrench, ShoppingBag, Shield } from "lucide-react";
import type { HeroRow, MetaResponse, StateData } from "@/lib/site";
import { fmtInt, fmtDate, fmtSouls, timeAgo, HERO_TYPE_RU, wrColor } from "@/lib/site";
import { HeroIcon, StatCard, WrBar, SectionHeader, FreshChip } from "./shared";
import type { TabKey } from "./header";

// тяжёлые блоки — отдельными чанками, чтобы не раздувать стартовый JS
const Roulette = dynamic(() => import("./roulette").then((m) => m.Roulette), {
  ssr: false,
  loading: () => <div className="h-[420px]" aria-hidden />,
});
const OnlineChart = dynamic(() => import("./online-chart").then((m) => m.OnlineChart), {
  ssr: false,
  loading: () => <div className="h-44" aria-hidden />,
});

/**
 * Фон обложки — в несколько слоёв, чтобы обложка никогда не выглядела пусто:
 *   1) статичный постер (self-host /img/hero-poster.jpg — грузится всегда и везде);
 *   2) интро-ролик — один раз при входе/перезагрузке страницы;
 *   3) зацикленный ролик — он уже играет под интро, поэтому переход идёт
 *      кроссфейдом: без чёрного кадра, повторной загрузки и «прыжка»;
 *   4) если WebM/VP9 не поддержан или локальные файлы не загрузились — VK Video.
 * Видео — только десктоп и только без prefers-reduced-motion; на мобильном остаётся
 * статичный фон (ноль трафика на видео). Шейд сверху сохраняет читаемость.
 */
const VK_VIDEO_SRC =
  "https://vkvideo.ru/video_ext.php?oid=-223127459&id=456239026&autoplay=1&loop=1&mute=1&hd=2&no_ads=1";
const INTRO_SRC = "/video/hero-intro.webm";
const LOOP_SRC = "/video/hero-loop.webm";

function HeroVideoBg() {
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<"local" | "vk" | "none">("none");
  const [introOn, setIntroOn] = useState(false);
  const [introDone, setIntroDone] = useState(false);
  const [introGone, setIntroGone] = useState(false);
  const [introOk, setIntroOk] = useState(true);
  const [loopOk, setLoopOk] = useState(true);
  const loopRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)").matches;
    const noMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
    if (!desktop || noMotion || saveData) return;
    // VP9/WebM: Chrome, Edge, Firefox и Safari 16+. Иначе — VK, как раньше.
    const probe = document.createElement("video");
    const canLocal =
      probe.canPlayType('video/webm; codecs="vp9"') !== "" || probe.canPlayType("video/webm") !== "";
    setEnabled(true);
    setMode(canLocal ? "local" : "vk");
  }, []);

  // оба локальных ролика не пошли — последний резерв: VK Video
  useEffect(() => {
    if (enabled && mode === "local" && !introOk && !loopOk) setMode("vk");
  }, [enabled, mode, introOk, loopOk]);

  // интро закончилось (или сломалось) — гасим его кроссфейдом поверх уже играющего цикла
  const endIntro = () => {
    setIntroDone(true);
    loopRef.current?.play().catch(() => {});
  };

  // страховка: если transitionend не пришёл, всё равно снимаем интро с экрана
  useEffect(() => {
    if (!introDone) return;
    const t = setTimeout(() => setIntroGone(true), 1100);
    return () => clearTimeout(t);
  }, [introDone]);

  return (
    <div className="hero-video-dl" aria-hidden>
      {/* слой 1: постер — всегда */}
      <div className="hero-poster-dl" />
      {/* слой 2: интро + зацикленный фон (только десктоп, WebM) */}
      {enabled && mode === "local" ? (
        <>
          {loopOk ? (
            <video
              ref={loopRef}
              className="hero-film"
              src={LOOP_SRC}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              onError={() => setLoopOk(false)}
            />
          ) : null}
          {introOk && !introGone ? (
            <video
              className={`hero-film hero-film-intro${introOn && !introDone ? " is-on" : ""}`}
              src={INTRO_SRC}
              autoPlay
              muted
              loop={!loopOk}
              playsInline
              preload="auto"
              poster="/img/hero-poster.jpg"
              onPlaying={() => setIntroOn(true)}
              onEnded={endIntro}
              onError={() => {
                setIntroOk(false);
                endIntro();
              }}
              onTransitionEnd={(e) => {
                if (e.propertyName === "opacity" && introDone) setIntroGone(true);
              }}
            />
          ) : null}
        </>
      ) : null}
      {/* слой 3: VK Video — если локальные файлы недоступны */}
      {enabled && mode === "vk" ? (
        <iframe
          src={VK_VIDEO_SRC}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          title="Трейлер Deadlock"
          tabIndex={-1}
        />
      ) : null}
      <div className="hero-video-shade" />
    </div>
  );
}

type OnlineRange = "24h" | "7d" | "30d";

const RANGE_MS: Record<OnlineRange, number> = {
  "24h": 24 * 3600_000,
  "7d": 7 * 24 * 3600_000,
  "30d": 30 * 24 * 3600_000,
};

export function HomeSection({
  state, heroes, meta, onNavigate, onOpenHero,
}: {
  state: StateData | null;
  heroes: HeroRow[];
  meta: MetaResponse | null;
  onNavigate: (t: TabKey) => void;
  onOpenHero: (heroId: number) => void;
}) {
  const heroById = useMemo(() => new Map(heroes.map((h) => [h.id, h])), [heroes]);
  const metaHeroList = useMemo(() => {
    if (!state?.topMeta) return [];
    return state.topMeta
      .map((m) => ({ ...m, hero: heroById.get(m.heroId) }))
      .filter((x) => x.hero);
  }, [state, heroById]);

  const [range, setRange] = useState<OnlineRange>("24h");

  /**
   * График онлайна. Диапазоны: 24 часа / 7 дней / 30 дней.
   * Шкала Y — в тыс. игроков, авто-домен с запасом; X — время.
   * Для 7д/30д точки агрегируются по часам (средняя за час) — кривая читается,
   * даже когда накопились тысячи замеров.
   */
  const online = useMemo(() => {
    const pts = (state?.onlineHistory ?? [])
      .map((p) => ({ at: new Date(p.at).getTime(), v: p.count }))
      .filter((p) => Number.isFinite(p.at));
    const since = Date.now() - RANGE_MS[range];
    const win = pts.filter((p) => p.at >= since);
    const bucketMs = range === "24h" ? 0 : range === "7d" ? 3600_000 : 3 * 3600_000;
    let out: { t: string; v: number; at: number }[] = [];
    if (!bucketMs) {
      out = win.map((p) => ({
        at: p.at,
        t: new Date(p.at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
        v: p.v,
      }));
    } else {
      const acc = new Map<number, { s: number; n: number }>();
      for (const p of win) {
        const key = Math.floor(p.at / bucketMs) * bucketMs;
        const a = acc.get(key) ?? { s: 0, n: 0 };
        a.s += p.v;
        a.n += 1;
        acc.set(key, a);
      }
      out = [...acc.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([at, a]) => ({
          at,
          t:
            range === "7d"
              ? new Date(at).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) +
                " " +
                new Date(at).toLocaleTimeString("ru-RU", { hour: "2-digit" }) + "ч"
              : new Date(at).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
          v: Math.round(a.s / a.n),
        }));
      // пока данных мало (один часовой бакет) — показываем сырые замеры, а не пустую карточку
      if (out.length <= 1) {
        out = win.map((p) => ({
          at: p.at,
          t: new Date(p.at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
          v: p.v,
        }));
      }
    }
    const measured = pts.length;
    const spanDays = pts.length > 1 ? (pts[pts.length - 1].at - pts[0].at) / 86_400_000 : 0;
    return { data: out, measured, spanDays, total: pts.length };
  }, [state, range]);

  return (
    <section>
      {/* ---- обложка (как до патча): компактный блок с фоновым видео, ---- */}
      <div className="relative overflow-hidden">
        <div className="hero-bg-dl absolute inset-0" aria-hidden />
        <HeroVideoBg />
        <div className="hero-grid-dl absolute inset-0" aria-hidden />
        <div className="container-dl relative flex flex-col items-center py-16 text-center md:py-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-4 py-1.5 text-xs text-[var(--muted2)]">
            <span className="dot-dl" />
            Данные обновляются автоматически · {state ? `${fmtInt(state.counts.heroes)} героев · ${fmtInt(state.counts.items)} предметов · ${fmtInt(state.counts.leaderboardPlayers)} игроков в рейтинге` : "загрузка..."}
          </span>
          <h1 className="hero-title-dl mt-8 font-deco text-5xl leading-none md:text-7xl">Deadlock</h1>
          <p className="mt-3 font-display text-lg font-semibold uppercase tracking-[0.2em] md:text-xl">
            <span style={{ color: "var(--weapon)" }}>Онлайн.</span>{" "}
            <span style={{ color: "var(--spirit)" }}>Герои.</span>{" "}
            <span style={{ color: "var(--vitality)" }}>Патчи.</span>{" "}
            <span style={{ color: "var(--accent)" }}>Киберспорт.</span>
          </p>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-[var(--muted2)] md:text-base">
            Глобальный портал о Deadlock на русском: живой онлайн Steam, полные каталоги героев и предметов,
            автоматическая лента патчей Valve, лидерборды пяти регионов, киберспортивная сцена,
            мета-аналитика и уникальные инструменты — всё на живых данных.
          </p>
        </div>

        {/* ---- свежее обновление + живые счётчики — на том же видеофоне: фон тянется до красной черты ---- */}
        <div className="container-dl relative">
          <div className="flex justify-center pt-8 pb-6">
            {state?.latestPatch ? (
              <button
                type="button"
                onClick={() => onNavigate("news")}
                className="relative z-10 inline-flex max-w-full items-center gap-2 rounded-full border border-[var(--accent)] bg-[rgba(200,169,106,0.08)] px-4 py-2.5 text-sm transition-colors hover:bg-[rgba(200,169,106,0.18)]"
                title="Открыть патч-ноуты и новости"
              >
                <span className="dot-dl shrink-0" />
                <span className="min-w-0 text-left leading-snug">
                  {state.latestPatch.isPatch ? "Свежий патч:" : "Свежее обновление:"}{" "}
                  <b className="break-words">{state.latestPatch.title}</b>
                </span>
                <span className="hidden whitespace-nowrap text-xs text-[var(--muted2)] sm:inline">{fmtDate(state.latestPatch.pubDate)}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" aria-hidden />
              </button>
            ) : null}
          </div>

          {/* ---- живые счётчики (кликабельные — ведут в свой раздел) ---- */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <StatCard live label="Онлайн Steam" value={state ? fmtInt(state.online?.count ?? 0) : "…"} sub={state?.online ? `${timeAgo(state.online.at)}${state.online.peak ? ` · пик 24 ч: ${fmtInt(state.online.peak)}` : ""}` : ""} color="var(--ok)" />
            <StatCard live label="Матчей идёт" value={state ? fmtInt(state.counts.activeMatches) : "…"} sub="в этот момент" color="var(--danger)" />
            <StatCard label="Героев в каталоге" value={state ? fmtInt(state.counts.heroes) : "…"} sub="полные статы и билды" color="var(--spirit)" onClick={() => onNavigate("heroes")} />
            <StatCard label="Предметов в магазине" value={state ? fmtInt(state.counts.items) : "…"} sub="с ценами и тирами" color="var(--weapon)" onClick={() => onNavigate("items")} />
            <StatCard label="Игроков в рейтинге" value={state ? fmtInt(state.counts.leaderboardPlayers) : "…"} sub="5 регионов" color="var(--accent)" onClick={() => onNavigate("leaderboard")} />
            <StatCard label="Материалов в базе" value={state ? fmtInt(state.counts.patches) : "…"} sub="патчей и новостей" color="var(--vitality)" onClick={() => onNavigate("news")} />
          </div>
          {/* хвост видеофона 44px: фон доходит ровно до верхней кромки рулетки (у .rl теперь margin: 0) */}
          <div className="h-11" aria-hidden />
        </div>
      </div>

      <div className="container-dl">
        {/* ---- рулетка «Кем играть?» — фирменная фишка, как на deadlockru.ru ---- */}
        <div className="container-dl px-0">
          <Roulette heroes={heroes} meta={meta} onOpenHero={onOpenHero} onNavigate={onNavigate} />
        </div>

        {/* ---- бегущая строка живых матчей (скорость снижена: 100 с вместо 85) ---- */}
        {state && state.activeMatches.length > 0 ? (
          <div className="mt-6 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel2)] py-3" aria-label="Тикер активных матчей">
            <div className="marquee-dl px-4">
              {[...state.activeMatches, ...state.activeMatches].map((m, i) => (
                <span key={`${m.id}-${i}`} className="inline-flex items-center gap-2 whitespace-nowrap text-xs text-[var(--muted2)]">
                  <span className="live-pill">LIVE</span>
                  <span>#{m.id}</span>
                  <span>·</span>
                  <span>{m.min} мин</span>
                  <span>·</span>
                  {m.a.slice(0, 6).map((hid, j) => (
                    <HeroIcon key={`a${j}`} hero={heroById.get(hid)} size={22} rounded={5} />
                  ))}
                  <Swords className="mx-1 h-3 w-3 text-[var(--accent)]" aria-hidden />
                  {m.b.slice(0, 6).map((hid, j) => (
                    <HeroIcon key={`b${j}`} hero={heroById.get(hid)} size={22} rounded={5} />
                  ))}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {/* ---- разделы ---- */}
        <div className="mt-12">
          <SectionHeader
            kicker="Навигация"
            title="Что внутри портала"
            lead="Восемь разделов и шесть уникальных инструментов — всё на автоматически синхронизируемых данных."
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { tab: "heroes" as TabKey, icon: Users, cls: "card-spirit", color: "var(--spirit)", t: "Герои", d: `${state ? fmtInt(state.counts.heroes) : "42"} героя: статы, роль, карточка и советы, винрейты, контрпики, топ-предметы и автобилды из матчей.` },
              { tab: "items" as TabKey, icon: ShoppingBag, cls: "card-weapon", color: "var(--weapon)", t: "Предметы", d: "Магазин как в игре: тиры I–IV, категории Оружие / Спиритизм / Живучесть, цены и глобальный винрейт каждого предмета." },
              { tab: "leaderboard" as TabKey, icon: Trophy, cls: "card-gold", color: "var(--accent)", t: "Лидерборд", d: "Топ-игроки пяти регионов, поиск, подиум, топ героев в рейтинге. Обновляется каждые 30 минут." },
              { tab: "esports" as TabKey, icon: Shield, cls: "card-danger", color: "var(--danger)", t: "Киберспорт", d: "Турниры, команды и расписание матчей: от студенческой лиги DCS до первого LAN — Guildlock Invitational." },
              { tab: "guides" as TabKey, icon: BookOpen, cls: "card-vitality", color: "var(--vitality)", t: "Гайды", d: "Авто-гайды по каждому герою: способности с цифрами, сильные и слабые матчапы, билд по стадиям игры." },
              { tab: "tools" as TabKey, icon: Wrench, cls: "card-gold", color: "var(--accent)", t: "Инструменты", d: "6 инструментов: сравнение героев, калькулятор билдов, анализ влияния патчей, live-центр, тест знаний и центр автоматизации." },
            ].map(({ tab, icon: Icon, cls, color, t, d }) => (
              <article key={t} className={`card-dl ${cls} cursor-pointer p-5`} onClick={() => onNavigate(tab)}>
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg border" style={{ color, borderColor: color }}>
                    <Icon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} aria-hidden />
                  </span>
                  <h3 className="font-display text-base font-bold">{t}</h3>
                </div>
                <p className="mt-2 min-h-[44px] text-sm text-[var(--muted2)]">{d}</p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onNavigate(tab);
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent)] transition-transform hover:translate-x-0.5"
                >
                  Смотреть <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </button>
              </article>
            ))}
          </div>
        </div>

        {/* ---- мета + онлайн ---- */}
        <div className="mt-12 grid gap-6 lg:grid-cols-2">
          <div className="card-dl p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-display text-sm font-bold uppercase tracking-widest text-[var(--accent)]">Топ меты · винрейт</h3>
              <button type="button" onClick={() => onNavigate("meta")} className="inline-flex items-center gap-1 text-xs text-[var(--muted2)] transition-colors hover:text-[var(--ink)]">
                Вся мета <ArrowRight className="h-3 w-3" aria-hidden />
              </button>
            </div>
            {metaHeroList.length === 0 ? (
              <p className="py-6 text-center text-sm text-[var(--muted2)]">Статистика загружается после первого цикла синхронизации</p>
            ) : (
              <div className="space-y-3">
                {metaHeroList.map((m) => (
                  <button key={m.heroId} type="button" onClick={() => onOpenHero(m.heroId)} className="group flex w-full items-center gap-3 text-left">
                    <HeroIcon hero={m.hero} size={36} rounded={7} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-semibold group-hover:text-[var(--accent)]">{m.hero!.name}</span>
                        <span className="text-sm font-bold" style={{ color: wrColor(m.winRate) }}>{m.winRate.toFixed(1)}%</span>
                      </div>
                      <WrBar wr={m.winRate} />
                    </div>
                    <span className="hidden w-16 text-right text-[11px] text-[var(--muted2)] sm:block">
                      пик {m.pickRate.toFixed(1)}%
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="card-dl p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-bold uppercase tracking-widest text-[var(--ok)]">
                <span className="inline-flex items-center gap-2">
                  <Radio className="h-4 w-4" aria-hidden /> Онлайн в Steam
                </span>
              </h3>
              <span className="text-2xl font-display font-bold text-[var(--ink)]">{state ? fmtInt(state.online?.count ?? 0) : "…"}</span>
            </div>

            {/* диапазоны: сутки / неделя / месяц */}
            <div className="mb-3 inline-flex rounded-full border border-[var(--line)] bg-[var(--panel2)] p-1">
              {([
                { k: "24h" as OnlineRange, l: "24 часа" },
                { k: "7d" as OnlineRange, l: "7 дней" },
                { k: "30d" as OnlineRange, l: "30 дней" },
              ]).map(({ k, l }) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setRange(k)}
                  className={`rounded-full px-3 py-1 text-xs transition-colors ${range === k ? "bg-[var(--accent)] font-semibold text-[#0D1110]" : "text-[var(--muted2)] hover:text-[var(--ink)]"}`}
                >
                  {l}
                </button>
              ))}
            </div>

            {online.data.length > 1 ? (
              <div className="h-44">
                <OnlineChart data={online.data} peak={state?.online?.peak ?? null} />
              </div>
            ) : (
              <div className="flex h-44 items-center justify-center rounded-lg border border-dashed border-[var(--line)] bg-[var(--panel2)] px-6 text-center">
                <p className="text-xs text-[var(--muted2)]">
                  Мониторинг пишет замер каждые 10 минут. Накоплено{" "}
                  <b className="text-[var(--ink)]">{online.measured}</b>{" "}
                  {online.measured === 1 ? "замер" : "замеров"} — через пару часов здесь будет суточная кривая,
                  а неделя заполнится за 7 дней.
                </p>
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--muted2)]">
              <span>
                Источник: официальные страницы Valve — Steam Store Charts (живое «сейчас», поле nConcurrentInGame)
                и ISteamChartsService (пик за 24 ч).
              </span>
              <span>Новый замер каждые 10 минут · история хранится 7 дней · {range === "24h" ? "на графике: каждый замер" : range === "7d" ? "на графике: среднее за час" : "на графике: среднее за 3 часа"}</span>
            </div>
          </div>
        </div>

        {/* ---- чем портал лучше ---- */}
        <div className="mt-12 mb-16">
          <SectionHeader
            kicker="Автоматизация"
            title="Портал живёт сам"
            lead="Никаких ручных обновлений: планировщик сервера тянет данные из открытых API по расписанию и складывает в базу."
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: RefreshCw, t: "9 задач синхронизации", d: "Онлайн, лидерборды, патчи, винрейты, контрпики, билды, ранги, каталог, киберспорт." },
              { icon: Zap, t: "Расписание без человека", d: "От 10 минут (онлайн Steam) до суток (каталог). Логи и статусы каждой задачи — в центре автоматизации." },
              { icon: Trophy, t: "5 регионов лидербордов", d: "Европа, Сев. и Юж. Америка, Азия, Океания — 900+ игроков с топ-героями каждого." },
              { icon: Swords, t: "Живая картина матча", d: `${state ? fmtInt(state.counts.activeMatches) : "150"}+ активных матчей в тикере с составами команд.` },
            ].map(({ icon: Icon, t, d }) => (
              <div key={t} className="card-dl p-4">
                <Icon className="h-5 w-5 text-[var(--accent)]" aria-hidden />
                <div className="mt-2 font-display text-sm font-bold">{t}</div>
                <p className="mt-1 text-xs leading-relaxed text-[var(--muted2)]">{d}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-center">
            <FreshChip at={state ? Object.values(state.sync).find(Boolean)?.at ?? null : null} prefix="Последний цикл данных" />
          </div>
        </div>
      </div>
    </section>
  );
}

export function heroTypeLabel(t: string) {
  return HERO_TYPE_RU[t]?.label ?? "Герой";
}
