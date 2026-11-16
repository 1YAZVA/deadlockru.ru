"use client";

/**
 * Рулетка «Кем играть?» — порт фирменной фишки deadlockru.ru (js/roulette.js).
 * Карусель аватарок в стиле кейса, тикающий звук (WebAudio, без файлов),
 * карточка героя с винрейтом за 30 дней, рулетка билда (12 случайных предметов),
 * история круток (localStorage) и шеринг результата.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Volume2, VolumeX, Copy, RotateCcw, ChevronUp, ChevronDown } from "lucide-react";
import type { HeroRow, ItemRow, MetaResponse, HeroExtraData } from "@/lib/site";
import { fmtInt, viaImgProxy, HERO_TYPE_RU, apiGet } from "@/lib/site";
import { HeroIcon } from "./shared";
import {
  itemsToPool, makeCtx, rollBuild, rerollOne, rollSkillOrder, skillChanges,
  encodeBuildCode, newSeed, rng, heroSkillAbilities, tuneFromTopItems,
  LANES, SLOT_N, MAX_ACTIVE, ORDER_LABEL, ORDER_HINT, INVEST_LABEL, INVEST_HINT,
} from "@/lib/buildroll";
import type { BItem, BAbility, RollOrder, Invest, Lane, PickCtx } from "@/lib/buildroll";

const CARD_W = 84;
const GAP = 12;
const PITCH = CARD_W + GAP;
const STRIP_LEN = 96; // карточек в ленте одной крутки
const TARGET_TAIL = 6; // сколько карточек видно после победителя
const DUR_FULL = 4800;
const DUR_REDUCED = 900;
const LS_HISTORY = "dl_roulette_history";
const LS_SOUND = "dl_roulette_sound";
const CAT_COLOR: Record<string, string> = { weapon: "#E08A3C", vitality: "#4CAD6D", spirit: "#8C6FD1" };

type RlHero = {
  id: number; name: string; role: string; desc: string;
  color: string; icon: string; stats: { hp?: number; dmg?: number; rate?: number; speed?: number };
};

export function Roulette({
  heroes, meta, onOpenHero, onNavigate,
}: {
  heroes: HeroRow[];
  meta: MetaResponse | null;
  onOpenHero: (id: number) => void;
  onNavigate: (tab: "guides") => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef(0);

  const [items, setItems] = useState<ItemRow[]>([]);
  const [spinning, setSpinning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastHero, setLastHero] = useState<RlHero | null>(null);
  const [lastPicks, setLastPicks] = useState<BItem[] | null>(null);
  const [building, setBuilding] = useState(false);
  const [slotPhase, setSlotPhase] = useState<"idle" | "spin" | "stop">("idle");
  const [slotTick, setSlotTick] = useState(0);
  const [shareHidden, setShareHidden] = useState(true);
  // результат крутки можно свернуть («Свернуть») и вернуть чипом — билд и код не теряются
  const [resultOpen, setResultOpen] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [history, setHistory] = useState<number[]>([]);
  const [toast, setToast] = useState("");
  // рулетка билда: режимы и результат
  const [orderMode, setOrderMode] = useState<RollOrder>("curve");
  const [investMode, setInvestMode] = useState<Invest>("chaos");
  const [abils, setAbils] = useState<BAbility[]>([]);
  const [skills, setSkills] = useState<number[]>([]);
  const [lane, setLane] = useState<Lane | null>(null);
  const [rerollIdx, setRerollIdx] = useState(-1);
  const [howOpen, setHowOpen] = useState(false);
  const poolRef = useRef<BItem[]>([]);
  const ctxRef = useRef<PickCtx | null>(null);
  const abilsRef = useRef<BAbility[]>([]);
  const tuneRef = useRef<Map<number, number> | undefined>(undefined);
  const heroExtraCache = useRef<Map<number, { abils: BAbility[]; tune: Map<number, number> | undefined }>>(new Map());
  const firstMode = useRef(true);

  const metaHero = useMemo(() => new Map((meta?.rows ?? []).map((r) => [r.heroId, r])), [meta]);

  const toRlHero = useCallback(
    (h: HeroRow): RlHero => ({
      id: h.id,
      name: h.name,
      role: HERO_TYPE_RU[h.heroType]?.label ?? "Герой",
      // описание приходит с HTML-разметкой (<br>, ссылки) — в карточке рулетки нужен чистый текст
      desc: (h.description ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
      color: h.colorHex || "#C8A96A",
      icon: h.iconSmall || h.iconCard,
      stats: {
        hp: h.startingStats?.max_health,
        dmg: h.startingStats?.weapon_power,
        rate: h.startingStats?.fire_rate,
        speed: h.startingStats?.max_move_speed,
      },
    }),
    []
  );

  // предметы для рулетки билда грузим сами, если родитель ещё не успел
  useEffect(() => {
    if (items.length > 0 || heroes.length === 0) return;
    let alive = true;
    const t = setTimeout(() => {
      // STATIC_MODE: apiGet сам подставит /api/items.json
      apiGet<{ items: ItemRow[] }>("/api/items")
        .then((d) => {
          if (alive && d?.items) setItems(d.items);
        })
        .catch(() => {});
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [items.length, heroes.length]);

  // пул предметов для рулетки билда (+ правила совместимости)
  useEffect(() => {
    const pool = itemsToPool(items);
    poolRef.current = pool;
    ctxRef.current = makeCtx(pool);
  }, [items]);

  // способности героя и «подкрутка» под его мету — грузим один раз на героя
  const loadHeroExtra = useCallback(async (heroId: number) => {
    const cache = heroExtraCache.current;
    const hit = cache.get(heroId);
    if (hit) {
      setAbils(hit.abils);
      abilsRef.current = hit.abils;
      tuneRef.current = hit.tune;
      return;
    }
    try {
      const d = await apiGet<{ extra: HeroExtraData | null }>(`/api/hero/${heroId}`);
      const ab = heroSkillAbilities(d.extra?.abilities);
      const tune = tuneFromTopItems(d.extra?.topItems);
      cache.set(heroId, { abils: ab, tune });
      setAbils(ab);
      abilsRef.current = ab;
      tuneRef.current = tune;
    } catch {
      setAbils([]);
      abilsRef.current = [];
      tuneRef.current = undefined;
    }
  }, []);

  // ---------- звук (WebAudio, без файлов) ----------
  const acRef = useRef<AudioContext | null>(null);
  useEffect(() => {
    // localStorage читаем асинхронно — без setState прямо в теле эффекта
    const t = setTimeout(() => {
      try {
        setSoundOn(localStorage.getItem(LS_SOUND) !== "0");
        const raw = localStorage.getItem(LS_HISTORY);
        if (raw) setHistory((JSON.parse(raw) as number[]).slice(0, 8));
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const audio = useCallback(() => {
    try {
      if (!acRef.current) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        acRef.current = new Ctor();
      }
      if (acRef.current.state === "suspended") void acRef.current.resume();
      return acRef.current;
    } catch {
      return null;
    }
  }, []);

  const blip = useCallback(
    (freq: number, gain: number, dur: number, type: OscillatorType = "square", delay = 0) => {
      if (!soundOn) return;
      const a = audio();
      if (!a) return;
      const t = a.currentTime + delay;
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(a.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    },
    [audio, soundOn]
  );

  const tick = useCallback(() => blip(1750 + Math.random() * 250, 0.05, 0.045), [blip]);
  const winChord = useCallback(() => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => blip(f, 0.07, 0.5, "sine", i * 0.09));
  }, [blip]);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    try {
      localStorage.setItem(LS_SOUND, next ? "1" : "0");
    } catch {}
    if (next) tick();
  };

  // свернуть результат — рулетка возвращается к исходному компактному виду
  const collapseResult = useCallback(() => {
    setResultOpen(false);
    blip(420, 0.04, 0.12, "triangle");
  }, [blip]);

  // ---------- крутка ----------
  const lastIdRef = useRef<number | null>(null);

  const buildStrip = useCallback(
    (targetId: number): { seq: RlHero[]; targetPos: number } => {
      const rl = heroes.map(toRlHero);
      const targetIndex = STRIP_LEN - 1 - TARGET_TAIL;
      const seq: RlHero[] = [];
      let targetPos = targetIndex;
      for (let i = 0; i < STRIP_LEN; i++) {
        if (i === targetIndex) {
          seq.push(rl.find((x) => x.id === targetId) ?? rl[0]);
        } else {
          let h = rl[Math.floor(Math.random() * rl.length)];
          let guard = 0;
          while (seq[i - 1] && h.id === seq[i - 1].id && guard++ < 10) {
            h = rl[Math.floor(Math.random() * rl.length)];
          }
          seq.push(h);
        }
      }
      void targetPos;
      return { seq, targetPos: targetIndex };
    },
    [heroes, toRlHero]
  );

  const paintStrip = useCallback((seq: RlHero[]) => {
    const el = stripRef.current;
    if (!el) return;
    el.innerHTML = "";
    for (const h of seq) {
      const card = document.createElement("div");
      card.className = "rl-card";
      card.style.setProperty("--hc", h.color);
      card.dataset.id = String(h.id);
      card.title = h.name;
      const img = document.createElement("img");
      img.src = h.icon ? viaImgProxy(h.icon) : "";
      img.alt = h.name;
      img.loading = "lazy";
      img.onerror = () => img.replaceWith(Object.assign(document.createElement("span"), { textContent: h.name.charAt(0) }));
      const b = document.createElement("b");
      b.textContent = h.name;
      card.append(img, b);
      el.appendChild(card);
    }
  }, []);

  // до первой крутки лента не пустая: рисуем статичный ряд героев (как «прилавок» кейса)
  useEffect(() => {
    if (heroes.length < 2) return;
    paintStrip(heroes.slice(0, 24).map(toRlHero));
    const strip = stripRef.current;
    if (strip) strip.style.transform = "translate3d(0,0,0)";
  }, [heroes, paintStrip, toRlHero]);

  const confetti = useCallback((color: string) => {
    const root = rootRef.current;
    if (!root) return;
    const colors = [color, "#C8A96A", "#E08A3C", "#8C6FD1", "#4CAD6D", "#E8E6E0"];
    for (let i = 0; i < 26; i++) {
      const s = document.createElement("span");
      s.className = "rl-conf";
      s.style.cssText = `left:${45 + (Math.random() - 0.5) * 30}%;background:${colors[i % colors.length]};
        animation-duration:${1 + Math.random() * 0.8}s;animation-delay:${Math.random() * 0.15}s;
        transform:rotate(${Math.random() * 360}deg)`;
      root.appendChild(s);
      s.addEventListener("animationend", () => s.remove());
    }
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  }, []);

  const pushHistory = useCallback((id: number) => {
    setHistory((prev) => {
      const next = [id, ...prev.filter((x) => x !== id)].slice(0, 8);
      try {
        localStorage.setItem(LS_HISTORY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const shareText = useCallback(
    (h: RlHero, picks?: BItem[] | null) => {
      const m = metaHero.get(h.id);
      const wr = m ? ` (винрейт ${m.winRate.toFixed(1)}%)` : "";
      const bld = picks?.length ? ` Рандом-билд: ${picks.map((p) => p.name).join(", ")}.` : "";
      return `🎲 Кем играть в Deadlock? Мне выпал ${h.name}${wr}.${bld} Крути тоже: ${typeof window !== "undefined" ? window.location.origin : ""}`;
    },
    [metaHero]
  );

  const spin = useCallback(() => {
    if (spinning || busy) return;
    if (heroes.length < 2) return;
    setSpinning(true);
    setBusy(true);
    audio(); // разблокируем звук жестом

    let hero = heroes[Math.floor(Math.random() * heroes.length)];
    let guard = 0;
    while (heroes.length > 1 && hero.id === lastIdRef.current && guard++ < 10) {
      hero = heroes[Math.floor(Math.random() * heroes.length)];
    }
    lastIdRef.current = hero.id;
    const rl = toRlHero(hero);

    const { seq, targetPos } = buildStrip(hero.id);
    paintStrip(seq);

    const frame = frameRef.current;
    const strip = stripRef.current;
    if (!frame || !strip) {
      setSpinning(false);
      setBusy(false);
      return;
    }
    frame.classList.add("rolling");
    strip.classList.add("moving");

    const frameW = frame.clientWidth;
    const center = frameW / 2;
    const xFor = (i: number) => center - (i * PITCH + CARD_W / 2);
    const startX = xFor(3);
    const jitter = (Math.random() - 0.5) * PITCH * 0.62;
    const endX = xFor(targetPos) + jitter;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dur = reduced ? DUR_REDUCED : DUR_FULL;
    const t0 = performance.now();
    let lastTickAt = 0;
    let lastIdx = -1;

    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 4); // easeOutQuart: резкий старт, долгое торможение
      const x = startX + (endX - startX) * e;
      strip.style.transform = `translate3d(${x}px,0,0)`;
      const idx = Math.round((center - CARD_W / 2 - x) / PITCH);
      if (idx !== lastIdx && now - lastTickAt > 26) {
        lastIdx = idx;
        lastTickAt = now;
        if (p < 0.99 && !reduced) tick();
      }
      if (p < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        frame.classList.remove("rolling");
        strip.classList.remove("moving");
        const win = strip.querySelector(`.rl-card[data-id="${hero.id}"]`);
        if (win) {
          win.classList.add("won");
          setTimeout(() => win.classList.remove("won"), 2400);
        }
        winChord();
        confetti(rl.color);
        setLastHero(rl);
        setResultOpen(true);
        setLastPicks(null);
        setSkills([]);
        setLane(null);
        setAbils([]);
        abilsRef.current = [];
        tuneRef.current = undefined;
        void loadHeroExtra(hero.id);
        setShareHidden(false);
        pushHistory(hero.id);
        setSpinning(false);
        setBusy(false);
      }
    };
    rafRef.current = requestAnimationFrame(step);
  }, [spinning, busy, heroes, audio, buildStrip, paintStrip, tick, winChord, confetti, pushHistory, setBusy, toRlHero, loadHeroExtra]);

  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // ---------- рулетка билда ----------
  const spinBuild = useCallback(() => {
    const ctx = ctxRef.current;
    if (building || !lastHero || !ctx || poolRef.current.length === 0) return;
    setBuilding(true);
    audio();
    setSlotPhase("spin");
    setLastPicks(null);
    setSkills([]);
    setLane(null);

    const r = rng(newSeed());
    const actives = Math.floor(r() * (MAX_ACTIVE + 1));
    const picks = rollBuild(r, ctx, orderMode, investMode, actives);
    // порядок прокачки — только для героев с 4 прокачиваемыми способностями
    const ab = abilsRef.current;
    const ultIdx = ab.findIndex((a) => a.ult) >= 0 ? ab.findIndex((a) => a.ult) : ab.length - 1;
    const sk = ab.length === 4 ? rollSkillOrder(r, ab.length, ultIdx) : [];
    const ln = LANES[Math.floor(r() * LANES.length)];

    const finish = () => {
      setSlotPhase("stop");
      setLastPicks(picks);
      setSkills(sk);
      setLane(ln);
      setBuilding(false);
      winChord();
    };
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || picks.length === 0) {
      finish();
      return;
    }
    // быстрое перелистывание предметов во всех слотах + тик звука
    const iv = setInterval(() => {
      setSlotTick((t) => t + 1);
      blip(850 + Math.random() * 250, 0.015, 0.03);
    }, 85);
    // слоты останавливаются по очереди слева направо
    picks.forEach((_, i) => {
      setTimeout(() => {
        blip(500 + i * 80, 0.05, 0.2, "triangle");
        if (i === picks.length - 1) {
          clearInterval(iv);
          setTimeout(finish, 300);
        }
      }, 600 + i * 200);
    });
  }, [building, lastHero, orderMode, investMode, audio, blip, winChord]);

  // переролл одного предмета: тап по слоту
  const rerollSlot = useCallback(
    (i: number) => {
      const ctx = ctxRef.current;
      if (building || slotPhase !== "stop" || !lastPicks || !ctx || !lastPicks[i]) return;
      const it = rerollOne(rng(newSeed()), ctx, lastPicks, i, orderMode, investMode);
      if (!it) return;
      setRerollIdx(i);
      setTimeout(() => setRerollIdx(-1), 480);
      blip(650 + Math.random() * 120, 0.04, 0.16, "triangle");
      setLastPicks((prev) => (prev ? prev.map((x, j) => (j === i ? it : x)) : prev));
    },
    [building, slotPhase, lastPicks, orderMode, investMode, blip]
  );

  // смена режима — сразу перекручиваем готовый билд по новым правилам
  useEffect(() => {
    if (firstMode.current) {
      firstMode.current = false;
      return;
    }
    if (slotPhase === "stop" && lastPicks?.length) spinBuild();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderMode, investMode]);

  // ---------- код билда для игры ----------
  const gameCode = useCallback((): string | null => {
    if (!lastHero || !lastPicks?.length) return null;
    const ab = abilsRef.current;
    const d = new Date();
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    try {
      return encodeBuildCode({
        heroId: lastHero.id,
        name: `DEADLOCK//RU · ${lastHero.name} · ${dd}.${mm}.${d.getFullYear()}`,
        desc: `Случайный билд из рулетки · ${window.location.origin}`,
        categories: [{ name: "Порядок покупки 1→12", items: lastPicks.map((p) => p.id) }],
        abilityChanges: ab.length === 4 && skills.length === ab.length * 4 ? skillChanges(skills, ab.map((a) => a.id)) : undefined,
      });
    } catch {
      return null;
    }
  }, [lastHero, lastPicks, skills]);

  const copyGameCode = useCallback(async () => {
    try {
      const code = gameCode();
      if (!code) throw new Error("no build");
      await navigator.clipboard.writeText(code);
      showToast("Код скопирован! В игре: выбери героя → Поиск сборок → Создать сборку → Вставить сборку");
    } catch {
      showToast("Не удалось собрать код сборки — попробуй ещё раз");
    }
  }, [gameCode, showToast]);

  // ---------- шеринг ----------
  const share = useCallback(async () => {
    if (!lastHero) return;
    const text = shareText(lastHero, lastPicks);
    try {
      if (navigator.share) {
        await navigator.share({ title: "Deadlock//RU", text, url: window.location.origin });
      } else {
        await navigator.clipboard.writeText(text);
        showToast("Результат скопирован — вставь в чат друзьям");
      }
    } catch {}
  }, [lastHero, lastPicks, shareText, showToast]);

  const metaOf = lastHero ? metaHero.get(lastHero.id) : null;
  const historyHeroes = history
    .map((id) => heroes.find((h) => h.id === id))
    .filter(Boolean) as HeroRow[];

  return (
    <div className="rl" ref={rootRef} aria-label="Рулетка героев">
      <div className="rl-head">
        <div>
          <h2 className="rl-title">Не знаешь, кем играть?</h2>
          <p className="rl-sub">Крути рулетку — выпадет случайный герой с винрейтом за месяц и готовой сборкой.</p>
        </div>
        <button
          className={`rl-sound ${soundOn ? "" : "off"}`}
          type="button"
          title="Звук вкл/выкл"
          aria-label="Звук вкл/выкл"
          onClick={toggleSound}
        >
          {soundOn ? <Volume2 style={{ width: 17, height: 17 }} aria-hidden /> : <VolumeX style={{ width: 17, height: 17 }} aria-hidden />}
        </button>
      </div>

      <div className="rl-frame" ref={frameRef}>
        <div className="rl-strip" ref={stripRef} />
        <div className="rl-fade rl-left" />
        <div className="rl-fade rl-right" />
        <div className="rl-pointer" aria-hidden>
          <span />
          <span />
        </div>
      </div>

      <div className="rl-actions">
        <button className="rl-spin" type="button" onClick={spin} disabled={busy || heroes.length < 2}>
          {heroes.length < 2 ? "Загружаю героев…" : busy ? "Кручу…" : "🎲 Крутить рулетку"}
        </button>
        {lastHero && !shareHidden && resultOpen ? (
          <button className="rl-share" type="button" onClick={share}>
            Поделиться результатом
          </button>
        ) : null}
        {lastHero && resultOpen ? (
          <button
            className="rl-collapse"
            type="button"
            onClick={collapseResult}
            title="Свернуть — рулетка вернётся к исходному виду, результат останется в чипе ниже"
          >
            <ChevronUp style={{ width: 15, height: 15 }} aria-hidden /> Свернуть
          </button>
        ) : null}
        {lastHero && !resultOpen ? (
          <button
            className="rl-collapse"
            type="button"
            onClick={() => setResultOpen(true)}
            title="Показать последний результат"
          >
            <ChevronDown style={{ width: 15, height: 15 }} aria-hidden /> Последний результат: {lastHero.name}
          </button>
        ) : null}
      </div>

      {lastHero && resultOpen ? (
        <div className="rl-result show">
          <article className="rl-res" style={{ ["--hc" as string]: lastHero.color }}>
            <span className="rl-ava">
              <HeroIcon hero={lastHero} size={96} rounded={9999} />
            </span>
            <div className="rl-info">
              <h3>
                {lastHero.name}{" "}
                {metaOf ? (
                  <span className={`rl-wr ${metaOf.winRate > 51 ? "up" : metaOf.winRate < 49 ? "down" : ""}`}>
                    {metaOf.winRate.toFixed(1)}% WR · {fmtInt(metaOf.matches)} матчей/30д
                  </span>
                ) : (
                  <span className="rl-wr">винрейт появится с обновлением мета-данных</span>
                )}
              </h3>
              <span className="rl-role">{lastHero.role}</span>
              <p>{lastHero.desc}</p>
              <div className="rl-stats">
                {lastHero.stats.hp != null ? <span className="rl-stat">♥ <b>{fmtInt(lastHero.stats.hp)}</b> HP</span> : null}
                {lastHero.stats.dmg != null ? <span className="rl-stat">⚔ <b>{fmtInt(lastHero.stats.dmg)}</b> урон</span> : null}
                {lastHero.stats.speed != null ? <span className="rl-stat">👟 <b>{lastHero.stats.speed}</b> м/с</span> : null}
              </div>
              <div className="rl-build none">
                Билд героя и контрпики —{" "}
                <button className="rl-b-more" type="button" onClick={() => onOpenHero(lastHero.id)}>
                  открыть карточку героя
                </button>{" "}
                ·{" "}
                <button className="rl-b-more" type="button" onClick={() => onNavigate("guides")}>
                  гайды →
                </button>
              </div>

              <div className="rl-buildroll">
                <div className="rl-br-head">
                  <span className="rl-b-title">Рулетка билда — как на randomlock</span>
                  <span className="rl-br-hint">12 предметов с порядком покупки, прокачка, линия и код, который вставляется прямо в игру</span>
                </div>

                <div className="rl-modes">
                  <div className="rl-mode" role="group" aria-label="Режим крутки">
                    <span className="rl-mode-l">Крутка</span>
                    <div className="rl-seg">
                      {(["curve", "loose", "chaos"] as RollOrder[]).map((m) => (
                        <button key={m} type="button" className={orderMode === m ? "on" : ""} title={ORDER_HINT[m]} onClick={() => setOrderMode(m)}>
                          {ORDER_LABEL[m]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rl-mode" role="group" aria-label="Баланс инвестиций">
                    <span className="rl-mode-l">Вклад</span>
                    <div className="rl-seg">
                      {(["chaos", "even", "mono"] as Invest[]).map((m) => (
                        <button key={m} type="button" className={investMode === m ? "on" : ""} title={INVEST_HINT[m]} onClick={() => setInvestMode(m)}>
                          {INVEST_LABEL[m]}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="rl-bslots">
                  {Array.from({ length: SLOT_N }, (_, i) => {
                    const it = slotPhase === "stop" ? lastPicks?.[i] : undefined;
                    // во время крутки каждый тик меняет случайный предмет в слоте (анимация «прокрутки»)
                    const pool = poolRef.current;
                    const spinItem = slotPhase === "spin" && pool.length ? pool[(slotTick * 7 + i * 13) % pool.length] : undefined;
                    const show = it ?? spinItem;
                    const clickable = slotPhase === "stop" && !building && !!it;
                    return (
                      <button
                        key={i}
                        type="button"
                        className={`rl-slot ${slotPhase === "spin" ? "spin" : it ? "stop" : ""} ${rerollIdx === i ? "reroll" : ""}`}
                        style={{ ["--cat" as string]: it ? CAT_COLOR[it.cat] ?? "#C8A96A" : undefined }}
                        title={it ? `${it.name} · ${fmtInt(it.cost)} душ — нажми, чтобы перекрутить предмет` : "Слот билда"}
                        onClick={() => rerollSlot(i)}
                        disabled={!clickable}
                      >
                        <span className="rl-slot-num">{it ? i + 1 : "?"}</span>
                        <span className="rl-slot-img">
                          {show ? (
                            <img src={viaImgProxy(show.img)} alt={show.name} loading="lazy" />
                          ) : (
                            <span className="rl-slot-ph">?</span>
                          )}
                        </span>
                        <span className="rl-slot-name">{show ? show.name : "—"}</span>
                        {it ? (
                          <span className="rl-slot-sub">
                            Т{it.tier} · {fmtInt(it.cost)}{it.active ? " · акт." : ""}
                          </span>
                        ) : null}
                        {clickable ? <RotateCcw className="rl-slot-rr" style={{ width: 13, height: 13 }} aria-hidden /> : null}
                      </button>
                    );
                  })}
                </div>

                {skills.length && abils.length === 4 ? (
                  <div className="rl-skills">
                    <span className="rl-skills-l">Порядок прокачки</span>
                    <div className="rl-skillrow">
                      {skills.map((abIdx, step) => {
                        const a = abils[abIdx];
                        return (
                          <span key={step} className={`rl-skill ${a?.ult ? "ult" : ""}`} title={`${step + 1}. ${a?.name ?? ""}${a?.ult ? " (ульта)" : ""}`}>
                            {a?.image ? <img src={viaImgProxy(a.image)} alt={a.name} loading="lazy" /> : null}
                            <b>{step + 1}</b>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="rl-br-foot">
                  <button
                    className="rl-bspin"
                    type="button"
                    onClick={spinBuild}
                    disabled={building || poolRef.current.length === 0 || slotPhase === "spin"}
                  >
                    {poolRef.current.length === 0 ? "Загружаю предметы…" : slotPhase === "spin" ? "Кручу билд…" : lastPicks ? "🎲 Крутить ещё" : "🎲 Собрать случайный билд"}
                  </button>
                  <button
                    className="rl-code"
                    type="button"
                    onClick={copyGameCode}
                    disabled={slotPhase !== "stop" || !lastPicks?.length}
                    title="Код билда вставляется прямо в Deadlock: Поиск сборок → Создать сборку → Вставить сборку"
                  >
                    <Copy style={{ width: 14, height: 14 }} aria-hidden /> Копировать код в игру
                  </button>
                  <button className="rl-howbtn" type="button" onClick={() => setHowOpen((v) => !v)}>
                    Как вставить?
                  </button>
                  {lastPicks ? (
                    <span className="rl-bcost" style={{ visibility: slotPhase === "stop" ? "visible" : "hidden" }}>
                      <i />
                      <b>{fmtInt(lastPicks.reduce((a, p) => a + (p.cost || 0), 0))}</b>&nbsp;душ за билд
                    </span>
                  ) : null}
                  {lane ? (
                    <span className="rl-lane" style={{ ["--lc" as string]: lane.color }}>
                      <i aria-hidden /> Линия: <b>{lane.name}</b>
                    </span>
                  ) : null}
                </div>

                {howOpen ? (
                  <div className="rl-how">
                    <b>Как вставить билд в Deadlock</b>
                    <ol>
                      <li>Скопируй код кнопкой «Копировать код в игру».</li>
                      <li>В игре выбери того же героя, которому выпал билд.</li>
                      <li>Открой <b>Поиск сборок</b> (вкладка сборок в магазине).</li>
                      <li>Нажми <b>Создать сборку</b> → <b>Вставить сборку</b> и вставь код.</li>
                      <li>Предметы и порядок прокачки появятся сами — без модов и аддонов.</li>
                    </ol>
                    <span className="rl-how-note">Тап по любому предмету — перекрутка только этого слота.</span>
                  </div>
                ) : null}
              </div>
            </div>
          </article>
        </div>
      ) : null}

      {historyHeroes.length > 0 ? (
        <div className="rl-history">
          <span className="rl-h-label">Выпадало недавно:</span>
          <div className="rl-h-row">
            {historyHeroes.map((h) => (
              <button
                key={h.id}
                type="button"
                className="rl-h-ava"
                title={`${h.name} — показать карточку`}
                onClick={() => onOpenHero(h.id)}
              >
                <HeroIcon hero={h} size={34} rounded={9999} />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {toast ? <div className="rl-toast on">{toast}</div> : null}
    </div>
  );
}
