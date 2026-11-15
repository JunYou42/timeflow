"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { CategoryEffortRow, DailyPoint, PlannedVsActualPoint } from "@/lib/stats";

const AXIS_STYLE = { fontSize: 11, fill: "hsl(var(--muted-foreground))" };

/** One colour per series, reused by the radar's three rings. */
const ESTIMATE_COLOR = "#f59e0b";
const PLAN_COLOR = "#94a3b8";
const TRACKED_COLOR = "hsl(var(--primary))";

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

function hours(seconds: number): number {
  return roundHours(seconds / 3600);
}

/* -------------------------------------------------------------------------- */
/* Time by category (radar)                                                    */
/* -------------------------------------------------------------------------- */

export function CategoryRadarChart({ data }: { data: CategoryEffortRow[] }) {
  const rows = data.map((row) => ({
    category: row.name,
    Estimate: hours(row.estimatedSeconds),
    Plan: hours(row.plannedSeconds),
    Tracked: hours(row.trackedSeconds),
  }));
  const hasData = rows.some((row) => row.Estimate > 0 || row.Plan > 0 || row.Tracked > 0);
  if (!hasData) return <ChartEmpty label="No estimates, plans or tracked time in this range." />;

  // Each axis's 100% is the estimate of that category, so the estimate ring is
  // always at the rim and plan/tracked are read as "how much of the estimate
  // was planned / tracked". Categories without an estimate fall back to their
  // largest plan/tracked figure so the point still has room to be drawn.
  const points = rows.map((row) => {
    const axisMax = row.Estimate > 0 ? row.Estimate : Math.max(row.Plan, row.Tracked, 1);
    return {
      category: row.category,
      axisMax,
      Estimate: row.Estimate / axisMax,
      Plan: row.Plan / axisMax,
      Tracked: row.Tracked / axisMax,
    };
  });

  return (
    <div className="h-[300px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={points} outerRadius="70%">
          <PolarGrid stroke="hsl(var(--border))" />
          <PolarAngleAxis dataKey="category" tick={AXIS_STYLE} />
          {/* Every axis is drawn full at 1, so the ticks read as percentages of
              that category's estimate rather than as hours. */}
          <PolarRadiusAxis
            domain={[0, 1]}
            tickCount={5}
            tickFormatter={(value: number) => `${Math.round(value * 100)}%`}
            tick={AXIS_STYLE}
            axisLine={false}
          />
          <Tooltip
            formatter={(value: number, name: string, item) => {
              const axisMax =
                (item as { payload?: { axisMax?: number } } | undefined)?.payload?.axisMax ?? 1;
              return [`${roundHours(value * axisMax)}h`, name];
            }}
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {/* Estimate is the widest reference ring; tracked is the one to read
              against it, so it is drawn last and sits on top. */}
          <Radar
            name="Estimate"
            dataKey="Estimate"
            stroke={ESTIMATE_COLOR}
            fill={ESTIMATE_COLOR}
            fillOpacity={0.12}
          />
          <Radar
            name="Plan"
            dataKey="Plan"
            stroke={PLAN_COLOR}
            fill={PLAN_COLOR}
            fillOpacity={0.16}
          />
          <Radar
            name="Tracked"
            dataKey="Tracked"
            stroke={TRACKED_COLOR}
            fill={TRACKED_COLOR}
            fillOpacity={0.24}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
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
