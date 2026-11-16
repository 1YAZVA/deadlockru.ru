"use client";

/** Квиз «Угадай героя» — игра на знание Deadlock: угадай героя по способности,
 *  ультимейту или иконке. Серия растёт до первой ошибки, рекорды дня и
 *  всё времени — в localStorage. Данные из /api/quiz (рус. локализация игры). */
import { useCallback, useEffect, useRef, useState } from "react";
import { Brain, Crown, Flame, Image as ImageIcon, RotateCcw, Share2, Sparkles, Trophy, Volume2, VolumeX, Zap } from "lucide-react";
import { apiGet, sanitizeHtml, viaImgProxy } from "@/lib/site";
import { Spinner } from "./shared";

type QuizOption = { id: number; name: string; nameRu?: string; icon: string; color: string };
type QuizQuestion = {
  kind: "ability" | "ultimate" | "icon";
  prompt: string;
  ability?: { name: string; typeRu: string; descHtml: string; image?: string };
  heroIcon?: string;
  options: QuizOption[];
  answerId: number;
};
type QuizResponse = { bank: { abilities: number; heroes: number }; questions: QuizQuestion[] };

const LS_BEST_DAY = "dl_quiz_best_day"; // {date:"YYYY-MM-DD", value:number}
const LS_BEST_ALL = "dl_quiz_best_all"; // число
const LS_SOUND = "dl_quiz_sound";
const KIND_RU: Record<QuizQuestion["kind"], string> = { ability: "Способность", ultimate: "Ультимейт", icon: "Иконка" };
const KIND_ICON: Record<QuizQuestion["kind"], React.ComponentType<{ className?: string }>> = {
  ability: Sparkles, ultimate: Zap, icon: ImageIcon,
};

export function ToolQuiz() {
  const [phase, setPhase] = useState<"intro" | "play" | "over">("intro");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [qs, setQs] = useState<QuizQuestion[]>([]);
  const [idx, setIdx] = useState(0);
  const [streak, setStreak] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<"right" | "wrong" | null>(null);
  const [won, setWon] = useState(false);
  const [newRecord, setNewRecord] = useState(false);
  const [bestDay, setBestDay] = useState(0);
  const [bestAll, setBestAll] = useState(0);
  const [bank, setBank] = useState<{ abilities: number; heroes: number } | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [toast, setToast] = useState("");

  const rootRef = useRef<HTMLDivElement | null>(null);
  const acRef = useRef<AudioContext | null>(null);
  const streakRef = useRef(0);
  const bestDayRef = useRef(0);
  const bestAllRef = useRef(0);
  const timersRef = useRef<number[]>([]);

  // localStorage читаем асинхронно — без setState прямо в теле эффекта
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setSoundOn(localStorage.getItem(LS_SOUND) !== "0");
        const today = new Date().toISOString().slice(0, 10);
        const raw = JSON.parse(localStorage.getItem(LS_BEST_DAY) || "null") as { date: string; value: number } | null;
        const day = raw && raw.date === today ? raw.value : 0;
        const all = Number(localStorage.getItem(LS_BEST_ALL) || "0");
        setBestDay(day);
        bestDayRef.current = day;
        setBestAll(all);
        bestAllRef.current = all;
      } catch {}
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // незавершённые таймеры переходов не переживают размонтирование
  useEffect(() => () => { timersRef.current.forEach((t) => window.clearTimeout(t)); }, []);

  // ---------- звук (WebAudio, без файлов — как в рулетке) ----------
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

  const goodChord = useCallback(() => {
    [659.25, 830.61].forEach((f, i) => blip(f, 0.06, 0.22, "sine", i * 0.07));
  }, [blip]);
  const badTone = useCallback(() => {
    blip(233.08, 0.07, 0.3, "sawtooth");
    blip(174.61, 0.07, 0.4, "sawtooth", 0.12);
  }, [blip]);
  const recordChord = useCallback(() => {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => blip(f, 0.07, 0.5, "sine", i * 0.09));
  }, [blip]);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    try {
      localStorage.setItem(LS_SOUND, next ? "1" : "0");
    } catch {}
    if (next) blip(880, 0.05, 0.12, "triangle");
  };

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    const t = window.setTimeout(() => setToast(""), 2600);
    timersRef.current.push(t);
  }, []);

  const confetti = useCallback((color: string) => {
    const root = rootRef.current;
    if (!root) return;
    const colors = [color, "#C8A96A", "#E08A3C", "#8C6FD1", "#4CAD6D", "#E8E6E0"];
    for (let i = 0; i < 26; i++) {
      const s = document.createElement("span");
      s.className = "qz-conf";
      s.style.cssText = `left:${45 + (Math.random() - 0.5) * 30}%;background:${colors[i % colors.length]};
        animation-duration:${1 + Math.random() * 0.8}s;animation-delay:${Math.random() * 0.15}s;
        transform:rotate(${Math.random() * 360}deg)`;
      root.appendChild(s);
      s.addEventListener("animationend", () => s.remove());
    }
  }, []);

  // ---------- игра ----------
  const start = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setErr("");
    setQs([]);
    setIdx(0);
    streakRef.current = 0;
    setStreak(0);
    setPicked(null);
    setResult(null);
    setWon(false);
    setNewRecord(false);
    audio(); // разблокируем звук жестом
    blip(660, 0.05, 0.14, "triangle");
    try {
      const d = await apiGet<QuizResponse>("/api/quiz");
      if (!d.questions.length) throw new Error("банк вопросов пуст");
      setBank(d.bank);
      setQs(d.questions);
      setPhase("play");
    } catch {
      setErr("Не удалось собрать вопросы — попробуй ещё раз.");
    } finally {
      setLoading(false);
    }
  }, [loading, audio, blip]);

  const endGame = useCallback(
    (wonAll: boolean) => {
      const sc = streakRef.current;
      const today = new Date().toISOString().slice(0, 10);
      let isRecord = false;
      if (sc > bestAllRef.current) {
        bestAllRef.current = sc;
        setBestAll(sc);
        try {
          localStorage.setItem(LS_BEST_ALL, String(sc));
        } catch {}
        isRecord = true;
      }
      try {
        const raw = JSON.parse(localStorage.getItem(LS_BEST_DAY) || "null") as { date: string; value: number } | null;
        const prev = raw && raw.date === today ? raw.value : 0;
        if (sc > prev) {
          localStorage.setItem(LS_BEST_DAY, JSON.stringify({ date: today, value: sc }));
          bestDayRef.current = sc;
          setBestDay(sc);
          isRecord = true;
        }
      } catch {}
      setWon(wonAll);
      setNewRecord(isRecord);
      setPhase("over");
      if (wonAll || (isRecord && sc >= 3)) {
        confetti("#C8A96A");
        recordChord();
      } else if (isRecord) {
        recordChord();
      } else {
        blip(392, 0.05, 0.25, "triangle");
      }
    },
    [confetti, recordChord, blip]
  );

  const answer = useCallback(
    (oId: number) => {
      if (result) return; // на вопрос уже ответили
      const q = qs[idx];
      if (!q) return;
      setPicked(oId);
      if (oId === q.answerId) {
        streakRef.current += 1;
        setStreak(streakRef.current);
        setResult("right");
        goodChord();
        // рекорд дня обновляется на лету
        if (streakRef.current > bestDayRef.current) {
          bestDayRef.current = streakRef.current;
          setBestDay(streakRef.current);
        }
        const t = window.setTimeout(() => {
          setResult(null);
          setPicked(null);
          if (idx + 1 >= qs.length) endGame(true);
          else setIdx((i) => i + 1);
        }, 950);
        timersRef.current.push(t);
      } else {
        setResult("wrong");
        badTone();
        const t = window.setTimeout(() => endGame(false), 1700);
        timersRef.current.push(t);
      }
    },
    [result, qs, idx, goodChord, badTone, endGame]
  );

  const share = useCallback(async () => {
    const text = `Квиз «Угадай героя»: серия ${streakRef.current} на DeadlockRU — угадай и ты ${typeof window !== "undefined" ? window.location.origin : ""}`;
    try {
      await navigator.clipboard.writeText(text);
      showToast("Результат скопирован — кидай друзьям");
    } catch {
      showToast(text);
    }
  }, [showToast]);

  const q = qs[idx];
  const optClass = (oId: number) => {
    let c = "qz-opt";
    if (result) {
      if (oId === q?.answerId) c += " correct";
      else if (oId === picked) c += " wrong";
      else c += " dim";
    }
    return c;
  };

  return (
    <div className="qz" ref={rootRef} aria-label="Квиз Угадай героя">
      <div className="card-dl qz-stage">
        {phase === "intro" ? (
          <div className="qz-intro fade-in">
            <div className="qz-emblem" aria-hidden>
              <Brain />
            </div>
            <h3 className="qz-title">Квиз «Угадай героя»</h3>
            <p className="qz-lead">
              Показываем способность, ультимейт или иконку — выбираешь героя из четырёх вариантов. Ошибёшься — серия обнуляется.
              Насколько хорошо ты знаешь каталог Deadlock?
            </p>
            <ul className="qz-rules">
              <li>
                <Sparkles aria-hidden /> Способности и ульты — на русском, из официальной локализации игры
              </li>
              <li>
                <Flame aria-hidden /> Серия растёт, пока не ошибёшься — в батче 12 вопросов
              </li>
              <li>
                <Crown aria-hidden /> Рекорд дня и рекорд всё времени сохраняются на устройстве
              </li>
            </ul>
            <div className="qz-recs">
              <span>
                <Trophy aria-hidden className="qz-trophy" /> Рекорд дня: <b>{bestDay}</b>
              </span>
              <span>
                <Crown aria-hidden className="qz-trophy" /> Всё время: <b>{bestAll}</b>
              </span>
              {bank ? (
                <span className="qz-bank">
                  В банке {bank.abilities} вопросов по {bank.heroes} героям
                </span>
              ) : null}
            </div>
            {err ? <p className="qz-err">{err}</p> : null}
            <button type="button" className="qz-start" onClick={start} disabled={loading}>
              {loading ? <Spinner /> : <Sparkles aria-hidden />} Начать игру
            </button>
          </div>
        ) : null}

        {phase === "play" && q ? (
          <div className="fade-in" key={idx}>
            <div className="qz-hud">
              <span className="qz-streak">
                <Flame aria-hidden /> Серия: <b>{streak}</b>
                {result === "right" ? <span className="qz-plus">+1</span> : null}
              </span>
              <span className="qz-rec">
                <Trophy aria-hidden /> Рекорд дня: <b>{bestDay}</b>
              </span>
              <span className="qz-count">
                Вопрос {idx + 1}/{qs.length}
              </span>
              <button
                type="button"
                className={`qz-sound ${soundOn ? "" : "off"}`}
                title="Звук вкл/выкл"
                aria-label="Звук вкл/выкл"
                onClick={toggleSound}
              >
                {soundOn ? <Volume2 style={{ width: 15, height: 15 }} aria-hidden /> : <VolumeX style={{ width: 15, height: 15 }} aria-hidden />}
              </button>
            </div>

            <div className="qz-qbox">
              <span className="qz-kind">
                {(() => {
                  const KIcon = KIND_ICON[q.kind];
                  return <KIcon aria-hidden />;
                })()}
                {KIND_RU[q.kind]}
              </span>

              {q.ability ? (
                <div className="qz-abl">
                  {q.ability.image ? <img src={viaImgProxy(q.ability.image)} alt={q.ability.name} loading="lazy" /> : null}
                  <div className="min-w-0">
                    <div className="qz-abl-name">
                      {q.ability.name}
                      <span className="qz-abl-type">{q.ability.typeRu}</span>
                    </div>
                    <div className="ability-desc qz-desc" dangerouslySetInnerHTML={{ __html: sanitizeHtml(q.ability.descHtml) }} />
                  </div>
                </div>
              ) : (
                <div className="qz-ico">
                  <img src={viaImgProxy(q.heroIcon || "")} alt="Иконка героя" loading="lazy" />
                </div>
              )}

              <p className="qz-prompt">{q.prompt}</p>

              <div className="qz-opts" role="group" aria-label="Варианты ответа">
                {q.options.map((o) => (
                  <button key={o.id} type="button" className={optClass(o.id)} style={{ "--hc": o.color } as React.CSSProperties} disabled={!!result} onClick={() => answer(o.id)}>
                    <img src={viaImgProxy(o.icon)} alt="" loading="lazy" />
                    <span>{o.nameRu || o.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {phase === "over" ? (
          <div className="qz-over fade-in">
            {won ? <Crown aria-hidden /> : <Flame aria-hidden />}
            <div className="qz-over-num">{streak}</div>
            <div className="qz-over-t">{won ? "Банк пройден без ошибок!" : "Серия прервана"}</div>
            {newRecord ? (
              <div className="qz-record">
                <Crown aria-hidden /> Новый рекорд дня!
              </div>
            ) : null}
            <p className="qz-over-sub">
              {streak >= 8
                ? "Ты знаешь игру не понаслышке — держи рекорд."
                : streak >= 4
                  ? "Крепкая серия — рекорд ближе, чем кажется."
                  : "Загляни в карточки героев — и следующая серия будет выше."}
            </p>
            <div className="qz-over-btns">
              <button type="button" className="qz-start" onClick={start}>
                <RotateCcw aria-hidden /> Ещё раз
              </button>
              <button type="button" className="qz-share" onClick={share}>
                <Share2 aria-hidden /> Поделиться
              </button>
            </div>
          </div>
        ) : null}

        <div className={`qz-toast ${toast ? "on" : ""}`} role="status">
          {toast}
        </div>
      </div>
    </div>
  );
}
