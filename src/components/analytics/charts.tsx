"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { CategorySlice, DailyPoint, PlannedVsActualPoint } from "@/lib/stats";
import { formatDuration } from "@/lib/time";

const AXIS_STYLE = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };

function hours(seconds: number): number {
  return Math.round((seconds / 3600) * 100) / 100;
}

/* -------------------------------------------------------------------------- */
/* Time by category (donut)                                                    */
/* -------------------------------------------------------------------------- */

export function CategoryDonut({ data }: { data: CategorySlice[] }) {
  const total = data.reduce((sum, slice) => sum + slice.seconds, 0);
  if (total === 0) {
    return <ChartEmpty label="No tracked time in this range yet." />;
  }
  return (
    <div className="relative h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="seconds"
            nameKey="name"
            innerRadius={62}
            outerRadius={92}
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((slice) => (
              <Cell key={slice.categoryId} fill={slice.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number, name: string) => [formatDuration(value), name]}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-semibold tabular-nums">{formatDuration(total)}</span>
        <span className="text-xs text-muted-foreground">total tracked</span>
      </div>
    </div>
  );
}

export function CategoryLegend({ data }: { data: CategorySlice[] }) {
  const total = data.reduce((sum, slice) => sum + slice.seconds, 0);
  if (total === 0) return null;
  return (
    <ul className="space-y-2">
      {data.map((slice) => (
        <li key={slice.categoryId} className="flex items-center gap-2 text-sm">
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: slice.color }}
          />
          <span className="truncate">{slice.name}</span>
          <span className="ml-auto tabular-nums text-muted-foreground">
            {formatDuration(slice.seconds)}
          </span>
          <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
            {slice.percentage}%
          </span>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Daily trend (bars)                                                          */
/* -------------------------------------------------------------------------- */

export function DailyTrendChart({ data }: { data: DailyPoint[] }) {
  const hasData = data.some((point) => point.seconds > 0);
  if (!hasData) return <ChartEmpty label="Nothing tracked in this range." />;
  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
          <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} unit="h" />
          <Tooltip
            formatter={(value: number) => [`${value}h`, "Tracked"]}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Bar dataKey="hours" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Planned vs actual                                                           */
/* -------------------------------------------------------------------------- */

export function PlannedVsActualChart({ data }: { data: PlannedVsActualPoint[] }) {
  const rows = data.map((point) => ({
    label: point.label,
    Planned: hours(point.plannedSeconds),
    Actual: hours(point.actualSeconds),
  }));
  const hasData = rows.some((row) => row.Planned > 0 || row.Actual > 0);
  if (!hasData) return <ChartEmpty label="No plans or tracked time in this range." />;
  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
          <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={false} axisLine={false} />
          <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} unit="h" />
          <Tooltip
            formatter={(value: number, name: string) => [`${value}h`, name]}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {/* The plan is the backdrop, not the headline: a light grey bar keeps
              the eye on what was actually tracked. */}
          <Bar
            dataKey="Planned"
            fill="hsl(var(--muted-foreground) / 0.4)"
            radius={[4, 4, 0, 0]}
            maxBarSize={22}
          />
          <Bar dataKey="Actual" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartEmpty({ label }: { label: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
      {label}
    </div>
  );
}
