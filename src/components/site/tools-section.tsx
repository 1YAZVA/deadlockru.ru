"use client";

/** Инструменты — 6 фишек портала: сравнение героев, калькулятор билдов,
 *  анализ патчей, live-центр, квиз «Угадай героя» и центр автоматизации */
import { useState } from "react";
import { Activity, Brain, GitCompareArrows, Radio, Scale, ShoppingBag, Wrench, Zap } from "lucide-react";
import type { HeroRow, ItemRow, MetaResponse } from "@/lib/site";
import { SectionHeader } from "./shared";
import { ToolCompare } from "./tool-compare";
import { ToolBuilder } from "./tool-builder";
import { ToolPatchImpact } from "./tool-patch-impact";
import { ToolLive } from "./tool-live";
import { ToolQuiz } from "./tool-quiz";
import { ToolSync } from "./tool-sync";

type ToolKey = "compare" | "builder" | "patch" | "live" | "quiz" | "sync";

const TOOLS: { key: ToolKey; label: string; icon: React.ComponentType<{ className?: string }>; desc: string }[] = [
  { key: "compare", label: "Сравнение героев", icon: Scale, desc: "Радар характеристик и мета-статы 2–3 героев бок о бок" },
  { key: "builder", label: "Калькулятор билдов", icon: ShoppingBag, desc: "Стоимость, кривая душ и винрейт собранного билда" },
  { key: "patch", label: "Анализ патчей", icon: GitCompareArrows, desc: "Кто вырос и кто просел между срезами винрейтов" },
  { key: "live", label: "Live-центр", icon: Radio, desc: "Активные матчи и онлайн Steam прямо сейчас" },
  { key: "quiz", label: "Квиз «Угадай героя»", icon: Brain, desc: "Игра на знание Deadlock: угадай героя по способности, ультимейту или иконке" },
  { key: "sync", label: "Центр автоматизации", icon: Zap, desc: "Задачи синхронизации, расписания и журналы" },
];

export function ToolsSection({
  heroes, items, meta, onOpenHero,
}: {
  heroes: HeroRow[];
  items: ItemRow[];
  meta: MetaResponse | null;
  onOpenHero: (id: number) => void;
}) {
  const [tool, setTool] = useState<ToolKey>("compare");
  const Active = TOOLS.find((t) => t.key === tool)!;

  return (
    <section className="container-dl py-10">
      <SectionHeader
        kicker="6 фишек портала"
        title="Инструменты"
        lead="То, чего нет у конкурентов: сравнение героев на радарах, калькулятор билдов с винрейтом и кривой душ, авто-анализ влияния патчей, live-центр, квиз «Угадай героя» и прозрачный центр автоматизации."
      />

      <div className="mb-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        {TOOLS.map(({ key, label, icon: Icon, desc }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTool(key)}
            className={`card-dl p-3.5 text-left transition-all ${tool === key ? "border-[var(--accent)] bg-[var(--panel)]" : "bg-[var(--panel2)]"}`}
            style={tool === key ? { borderTop: "2px solid var(--accent)" } : { borderTop: "2px solid var(--line)" }}
          >
            <div className="flex items-center gap-2">
              <Icon className={`h-4 w-4 ${tool === key ? "text-[var(--accent)]" : "text-[var(--muted2)]"}`} aria-hidden />
              <span className="text-sm font-bold">{label}</span>
            </div>
            <p className="mt-1 text-[11px] leading-snug text-[var(--muted2)]">{desc}</p>
          </button>
        ))}
      </div>

      <div className="fade-in" key={tool}>
        {tool === "compare" ? <ToolCompare heroes={heroes} meta={meta} /> : null}
        {tool === "builder" ? <ToolBuilder heroes={heroes} items={items} /> : null}
        {tool === "patch" ? <ToolPatchImpact heroes={heroes} onOpenHero={onOpenHero} /> : null}
        {tool === "live" ? <ToolLive heroes={heroes} /> : null}
        {tool === "quiz" ? <ToolQuiz /> : null}
        {tool === "sync" ? <ToolSync /> : null}
      </div>

      <div className="mt-8 flex items-center gap-2 rounded-lg border border-dashed border-[var(--line)] p-3 text-[11px] text-[var(--muted2)]">
        <Wrench className="h-3.5 w-3.5" aria-hidden />
        Все инструменты работают на тех же живых данных, что и остальной портал — без ручной поддержки.
      </div>
    </section>
  );
}
