"use client";

import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildProjectEstimateAccuracy } from "@/lib/stats";
import { formatDuration } from "@/lib/time";
import type { Project, Task, TimeEntry } from "@/lib/types";

/** Geometry of the gauge, in the SVG's own units (viewBox is 100 x 60). */
const GAUGE_CENTER_X = 50;
const GAUGE_CENTER_Y = 46;
const GAUGE_RADIUS = 40;
const GAUGE_ARC = "M 10 46 A 40 40 0 0 1 90 46";
const GAUGE_LENGTH = Math.PI * GAUGE_RADIUS;
const NEEDLE_LENGTH = 28;
/** A gauge that has run past full goes red, the same story the badge tells. */
const OVER_COLOR = "#dc2626";

interface ProjectEstimateDashboardProps {
  projects: Project[];
  tasks: Task[];
  timeEntries: TimeEntry[];
}

/**
 * Estimate versus tracked time, project by project.
 *
 * The companion of "Time spent by project": that card spreads the period's
 * hours across projects, this one asks whether each project stayed inside the
 * number typed into it. Both sides cover the whole project -- the estimate is a
 * whole-project figure, so a period filter would compare incomparable numbers
 * -- and tracked time counts what the project absorbed directly and through its
 * tasks.
 *
 * Each project gets a fuel gauge rather than a bar: the needle position is the
 * share of the estimate already burnt. Full is exactly the estimate, so a
 * needle pinned at the end with a red dial is a project that ran over.
 *
 * Only projects that are under way right now appear: what has ended has nothing
 * left to plan, what has not started yet is not today's problem, and what has
 * no end date has no finish line for the estimate to aim at.
 */
export function ProjectEstimateDashboard({
  projects,
  tasks,
  timeEntries,
}: ProjectEstimateDashboardProps) {
  const rows = useMemo(
    () => buildProjectEstimateAccuracy(projects, tasks, timeEntries),
    [projects, tasks, timeEntries]
  );

  const estimatedTotal = rows.reduce((sum, row) => sum + (row.estimatedSeconds ?? 0), 0);
  const trackedTotal = rows.reduce((sum, row) => sum + row.actualSeconds, 0);
  // Accuracy only means something for the projects that were given an estimate,
  // so the headline ratio ignores the hours tracked without one.
  const trackedAgainstEstimate = rows.reduce(
    (sum, row) => sum + (row.estimatedSeconds === null ? 0 : row.actualSeconds),
    0
  );
  const coverage =
    estimatedTotal > 0 ? Math.round((trackedAgainstEstimate / estimatedTotal) * 100) : null;

  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="text-sm">项目进度</CardTitle>
        <CardDescription className="text-xs">
          {formatDuration(estimatedTotal, { compact: true })} estimated ·{" "}
          {formatDuration(trackedTotal, { compact: true })} tracked
          {coverage === null ? "" : ` · ${coverage}% of the estimate used`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No project under way right now has an estimate or tracked time yet.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {rows.map((row) => {
              // The dial tops out at the estimate; anything beyond it is read
              // from the number, not the needle.
              const filled = row.ratio === null ? 0 : Math.min(row.ratio, 1);
              const over = row.ratio !== null && row.ratio > 1;
              const tone = over ? OVER_COLOR : row.color;
              const angle = Math.PI * filled;

              return (
                <li key={row.projectId} className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: row.color }}
                    />
                    <span className="truncate font-medium">{row.name}</span>
                    <span className="ml-auto shrink-0">
                      <AccuracyBadge status={row.status} />
                    </span>
                  </div>

                  <div className="mx-auto h-16 w-24">
                    <svg viewBox="0 0 100 60" className="h-full w-full">
                      <path
                        d={GAUGE_ARC}
                        fill="none"
                        stroke="hsl(var(--muted))"
                        strokeWidth={8}
                        strokeLinecap="round"
                      />
                      {/* Left out at zero: a round cap on a zero-length dash
                          would still paint a dot at the start of the dial. */}
                      {filled > 0 ? (
                        <path
                          d={GAUGE_ARC}
                          fill="none"
                          stroke={tone}
                          strokeWidth={8}
                          strokeLinecap="round"
                          strokeDasharray={GAUGE_LENGTH}
                          strokeDashoffset={GAUGE_LENGTH * (1 - filled)}
                        />
                      ) : null}
                      <line
                        x1={GAUGE_CENTER_X}
                        y1={GAUGE_CENTER_Y}
                        x2={GAUGE_CENTER_X - NEEDLE_LENGTH * Math.cos(angle)}
                        y2={GAUGE_CENTER_Y - NEEDLE_LENGTH * Math.sin(angle)}
                        stroke={tone}
                        strokeWidth={2.5}
                        strokeLinecap="round"
                      />
                      <circle cx={GAUGE_CENTER_X} cy={GAUGE_CENTER_Y} r={3.5} fill={tone} />
                    </svg>
                  </div>

                  <div className="flex items-baseline justify-center gap-2 text-[11px] tabular-nums text-muted-foreground">
                    <span className="text-sm font-semibold text-foreground">
                      {row.ratio === null ? "—" : `${Math.round(row.ratio * 100)}%`}
                    </span>
                    <span>
                      {row.estimatedSeconds === null
                        ? "No estimate"
                        : `${formatDuration(row.estimatedSeconds)} est`}{" "}
                      · {formatDuration(row.actualSeconds)} tracked
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** A project with no estimate has nothing to be accurate against. */
function AccuracyBadge({ status }: { status: "under" | "on" | "over" | "unknown" }) {
  if (status === "unknown") return null;
  const classes = {
    under: "border-transparent bg-emerald-100 text-emerald-700",
    on: "border-transparent bg-sky-100 text-sky-700",
    over: "border-transparent bg-red-100 text-red-700",
  } as const;
  const labels = { under: "Under", on: "On track", over: "Over" } as const;
  return <Badge className={classes[status]}>{labels[status]}</Badge>;
}
