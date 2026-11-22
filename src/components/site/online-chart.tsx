"use client";

/**
 * График онлайна Steam. Вынесен в отдельный чанк: recharts тяжёлый,
 * а на главной он нужен ниже первого экрана — стартовый JS не должен его ждать.
 */
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine } from "recharts";
import { fmtInt, fmtSouls } from "@/lib/site";

export function OnlineChart({
  data,
  peak,
}: {
  data: { t: string; v: number }[];
  peak?: number | null;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 4 }}>
        <defs>
          <linearGradient id="onlineFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4CAD6D" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#4CAD6D" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis
          dataKey="t"
          tick={{ fill: "#8A9490", fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: "#2A332F" }}
          minTickGap={46}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: "#8A9490", fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={56}
          // домен растягивается и на официальный пик 24 ч, чтобы линия пика была видна
          domain={["auto", (max: number) => Math.max(max, (peak ?? 0) + 3000)]}
          padding={{ top: 8, bottom: 4 }}
          tickFormatter={(v: number) => fmtSouls(v)}
        />
        {peak ? (
          <ReferenceLine
            y={peak}
            stroke="#DDA326"
            strokeDasharray="4 4"
            strokeOpacity={0.7}
            label={{ value: `пик 24 ч ${fmtInt(peak)}`, fill: "#DDA326", fontSize: 10, position: "insideTopRight" }}
          />
        ) : null}
        <Tooltip
          contentStyle={{ background: "#161C1A", border: "1px solid #2A332F", borderRadius: 10, fontSize: 12, color: "#E8E6E0" }}
          labelStyle={{ color: "#8A9490" }}
          formatter={(v: number | string) => [`${fmtInt(Number(v))} игрок(ов)`, "Онлайн"]}
        />
        <Area type="monotone" dataKey="v" stroke="#4CAD6D" strokeWidth={2} fill="url(#onlineFill)" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
