"use client";

/** Раздел «Команды» — каталог консольных команд Deadlock: читы песочницы,
 *  спавн юнитов, боты, регион, интерфейс и легендарные предметы (giveitem)
 *  с иконками. Все команды копируются в один клик. */

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Copy, ExternalLink, Search, Terminal } from "lucide-react";
import { SectionHeader } from "./shared";
import { CAT_LABELS, CAT_ORDER, COMMANDS, HOWTO_STEPS, type CommandCat } from "@/data/commands";

const SOURCE_GUIDES = [
  {
    label: "Гайд: Команды легендарных предметов",
    url: "https://steamcommunity.com/sharedfiles/filedetails/?id=3697702292",
  },
  {
    label: "Гайд: Deadlock Console Commands",
    url: "https://steamcommunity.com/sharedfiles/filedetails/?id=3366257359",
  },
];

function CopyButton({ text, big }: { text: string; big?: boolean }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // фолбэк для старых браузеров/HTTP
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setDone(true);
    setTimeout(() => setDone(false), 1600);
  };
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Скопировать команду ${text}`}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border transition-colors ${
        big ? "px-3.5 py-1.5 text-xs" : "px-2.5 py-1 text-[11px]"
      } ${done ? "border-[var(--ok)] text-[var(--ok)]" : "border-[var(--line)] text-[var(--muted2)] hover:border-[var(--accent)] hover:text-[var(--accent)]"}`}
    >
      {done ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      {done ? "Готово" : "Копировать"}
    </button>
  );
}

function CommandRow({ c }: { c: (typeof COMMANDS)[number] }) {
  return (
    <div className="card-dl flex flex-col gap-2.5 bg-[var(--panel2)] p-4 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold">{c.nameRu}</span>
          {c.nameEn ? <span className="text-[11px] text-[var(--muted2)]">{c.nameEn}</span> : null}
          {c.danger ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[rgba(255,120,90,0.35)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--danger)]">
              <AlertTriangle className="h-3 w-3" aria-hidden /> чит
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-xs leading-snug text-[var(--muted2)]">{c.desc}</p>
        <code className="mt-2 block overflow-x-auto rounded-md border border-[var(--line)] bg-[rgba(0,0,0,0.35)] px-3 py-1.5 font-mono text-xs text-[var(--accent)]">
          {c.cmd}
        </code>
      </div>
      <div className="sm:self-center">
        <CopyButton text={c.cmd} big />
      </div>
    </div>
  );
}

function LegendaryCard({ c }: { c: (typeof COMMANDS)[number] }) {
  return (
    <div className="card-dl group flex flex-col bg-[var(--panel2)] p-3 transition-colors hover:border-[var(--accent)]">
      <div className="flex items-start gap-3">
        {c.img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={c.img}
            alt={c.nameRu}
            loading="lazy"
            className="h-16 w-16 shrink-0 rounded-lg border border-[var(--line)] object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold leading-tight">{c.nameRu}</div>
          <div className="truncate text-[11px] text-[var(--muted2)]">{c.nameEn}</div>
        </div>
      </div>
      <p className="mt-2 line-clamp-2 text-[11px] leading-snug text-[var(--muted2)]">{c.desc}</p>
      <code className="mt-2 block overflow-x-auto rounded-md border border-[var(--line)] bg-[rgba(0,0,0,0.35)] px-2 py-1 font-mono text-[10.5px] text-[var(--accent)]">
        {c.cmd}
      </code>
      <div className="mt-2.5">
        <CopyButton text={c.cmd} />
      </div>
    </div>
  );
}

export function CommandsSection() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<CommandCat | "all">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return COMMANDS.filter((c) => {
      if (cat !== "all" && c.cat !== cat) return false;
      if (!q) return true;
      return (
        c.cmd.toLowerCase().includes(q) ||
        c.nameRu.toLowerCase().includes(q) ||
        (c.nameEn ?? "").toLowerCase().includes(q) ||
        c.desc.toLowerCase().includes(q)
      );
    });
  }, [query, cat]);

  const legendaries = filtered.filter((c) => c.cat === "legendary");
  const others = filtered.filter((c) => c.cat !== "legendary");

  return (
    <section className="container-dl py-10">
      <SectionHeader
        kicker="Консоль Source 2"
        title="Команды"
        lead="Все интересные и чит-команды Deadlock в одном каталоге: читы песочницы, спавн героев и NPC, боты, смена региона, скрытие интерфейса и 17 легендарных предметов с иконками. Каждая команда копируется в один клик — вставь её в консоль на F7."
        right={
          <div className="flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5">
            <Terminal className="h-4 w-4 text-[var(--accent)]" aria-hidden />
            <span className="text-xs text-[var(--muted2)]">
              {COMMANDS.length} команд · F7
            </span>
          </div>
        }
      />

      {/* как открыть консоль */}
      <div className="mb-6 grid gap-3 md:grid-cols-3">
        {HOWTO_STEPS.map((s) => (
          <div key={s.n} className="card-dl bg-[var(--panel2)] p-4">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[var(--accent)] font-display text-sm text-[var(--accent)]">
                {s.n}
              </span>
              <span className="text-sm font-bold">{s.title}</span>
            </div>
            <p className="mt-2 text-xs leading-snug text-[var(--muted2)]">{s.text}</p>
          </div>
        ))}
      </div>

      {/* предупреждение */}
      <div className="mb-6 flex items-start gap-3 rounded-xl border border-[rgba(255,120,90,0.35)] bg-[rgba(255,120,90,0.06)] p-4">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" aria-hidden />
        <p className="text-xs leading-relaxed text-[var(--muted2)]">
          Чит-команды (<code className="font-mono text-[var(--danger)]">sv_cheats 1</code>, <code className="font-mono text-[var(--danger)]">giveitem</code>,{" "}
          <code className="font-mono text-[var(--danger)]">citadel_give_gold</code> и подобные) работают только в песочнице, лобби с ботами и приватных лобби.
          В публичных матчах Valve блокирует их на уровне сервера — попытки обойти это ограничение сторонними инструментами ведут к блокировке аккаунта.
          Команды региона, интерфейса и ботов безопасны и работают везде, где разрешены.
        </p>
      </div>

      {/* поиск + категории */}
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted2)]" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск: giveitem, регион, крипы…"
            className="w-full rounded-full border border-[var(--line)] bg-[var(--panel)] py-2 pl-9 pr-4 text-sm outline-none transition-colors placeholder:text-[var(--muted2)] focus:border-[var(--accent)]"
            aria-label="Поиск по командам"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCat("all")}
            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
              cat === "all"
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-[var(--line)] text-[var(--muted2)] hover:border-[var(--accent)]"
            }`}
          >
            Все ({COMMANDS.length})
          </button>
          {CAT_ORDER.map((k) => {
            const n = COMMANDS.filter((c) => c.cat === k).length;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setCat(k)}
                className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  cat === k
                    ? "border-[var(--accent)] text-[var(--accent)]"
                    : "border-[var(--line)] text-[var(--muted2)] hover:border-[var(--accent)]"
                }`}
              >
                {CAT_LABELS[k]} ({n})
              </button>
            );
          })}
        </div>
      </div>

      {/* легендарные предметы — сетка с иконками */}
      {legendaries.length > 0 ? (
        <>
          <div className="mb-3 mt-2 flex items-baseline gap-3">
            <h3 className="font-display text-lg font-bold">Легендарные предметы</h3>
            <span className="text-xs text-[var(--muted2)]">
              выдаются командой giveitem · сначала sv_cheats 1
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {legendaries.map((c) => (
              <LegendaryCard key={c.cmd} c={c} />
            ))}
          </div>
        </>
      ) : null}

      {/* остальные команды — списком по категориям */}
      {CAT_ORDER.filter((k) => k !== "legendary").map((k) => {
        const rows = others.filter((c) => c.cat === k);
        if (rows.length === 0) return null;
        return (
          <div key={k} className="mt-8">
            <h3 className="mb-3 font-display text-lg font-bold">
              {CAT_LABELS[k]} <span className="ml-1 text-xs font-normal text-[var(--muted2)]">· {rows.length}</span>
            </h3>
            <div className="grid gap-2.5">
              {rows.map((c) => (
                <CommandRow key={c.cmd} c={c} />
              ))}
            </div>
          </div>
        );
      })}

      {/* пустой результат */}
      {filtered.length === 0 ? (
        <div className="card-dl mt-6 p-8 text-center text-sm text-[var(--muted2)]">
          Ничего не найдено по запросу «{query}». Попробуй «giveitem», «нейтралы» или «регион».
        </div>
      ) : null}

      {/* источники */}
      <div className="mt-10 flex flex-col gap-2 rounded-xl border border-dashed border-[var(--line)] p-4 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-[11px] text-[var(--muted2)]">
          Проверено по гайдам Steam-сообщества. Названия и иконки легендарных предметов — из официальной русификации игры.
        </span>
        <div className="flex flex-wrap gap-2">
          {SOURCE_GUIDES.map((g) => (
            <a
              key={g.url}
              href={g.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--line)] px-3 py-1.5 text-[11px] text-[var(--muted2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              <ExternalLink className="h-3 w-3" aria-hidden />
              {g.label}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
