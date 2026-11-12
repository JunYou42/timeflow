"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CategoryPlanActualGroup } from "@/lib/stats";
import { formatDuration } from "@/lib/time";
import { cn } from "@/lib/utils";

interface PlanActualByCategoryProps {
  groups: CategoryPlanActualGroup[];
  /** Human-readable period the numbers describe, e.g. "Nov 10 → Nov 16". */
  rangeLabel: string;
}

const VIEW = 88;
const CENTER = VIEW / 2;
const OUTER_RADIUS = 35;
const INNER_RADIUS = 23;
const STROKE_WIDTH = 9;
/** Slice of the ring shaved off between neighbours so the sectors read apart. */
const SECTOR_GAP = 3;

/**
 * Lay a ring out as one dash per value, each positioned by the running total of
 * `offsets` rather than of `values`.
 *
 * Sharing the plan's offsets is what keeps the tracked ring honest: a project's
 * solid sector starts where its light plan sector starts, so it can never be
 * drawn wider than the plan it is measured against.
 *
 * Drawing sectors as dashes on a circle rather than as arc paths keeps a
 * single-value ring honest: a project that is the whole category still gets a
 * closed circle instead of a path that starts and ends on the same point.
 */
function ringDashes(
  values: number[],
  offsets: number[],
  radius: number
): { dasharray: string; dashoffset: number }[] {
  const circumference = 2 * Math.PI * radius;
  const total = offsets.reduce((sum, value) => sum + value, 0);
  const gap = values.length > 1 ? SECTOR_GAP : 0;

  let travelled = 0;
  return values.map((value, index) => {
    const fraction = total > 0 ? value / total : 0;
    const length = fraction * circumference - gap;
    const dash = {
      dasharray: `${Math.max(0, length)} ${circumference}`,
      dashoffset: -travelled,
    };
    travelled += total > 0 ? (offsets[index] / total) * circumference : 0;
    return dash;
  });
}

/**
 * Planned vs. tracked time for whatever period the host page is showing, one
 * ring per category with its projects drawn as the sectors.
 *
 * The category is the unit you budget in, so it gets its own ring; the project
 * is the unit the hours actually went to, so it gets the sectors. Both rings
 * are laid out by share of the category's plan: the light outer one draws every
 * project's plan, the solid inner one draws what was tracked, capped at that
 * plan. A tracked sector therefore always sits inside its plan sector, so
 * running over shows up in the numbers rather than as a sector that outgrows
 * the plan behind it.
 */
export function PlanActualByCategory({ groups, rangeLabel }: PlanActualByCategoryProps) {
  const totalTracked = groups.reduce((sum, group) => sum + group.actualSeconds, 0);
  const totalPlanned = groups.reduce((sum, group) => sum + group.plannedSeconds, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Plan vs. actual by category</CardTitle>
        <CardDescription className="text-xs">
          {rangeLabel} · {formatDuration(totalTracked)} tracked of{" "}
          {formatDuration(totalPlanned)} planned
        </CardDescription>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing planned or tracked in this period yet.
          </p>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {groups.map((group) => {
              const plan = group.projects.map((project) => project.plannedSeconds);
              const hasPlan = plan.some((value) => value > 0);
              // The tracked ring is capped at the plan; a category with no plan
              // at all has nothing to cap against, so it keeps its own total.
              const innerValues = hasPlan
                ? group.projects.map((project) =>
                    Math.min(project.actualSeconds, project.plannedSeconds)
                  )
                : group.projects.map((project) => project.actualSeconds);
              const innerOffsets = hasPlan ? plan : innerValues;
              const outer = ringDashes(plan, plan, OUTER_RADIUS);
              const inner = ringDashes(innerValues, innerOffsets, INNER_RADIUS);
              const over =
                group.plannedSeconds > 0 && group.actualSeconds > group.plannedSeconds;
              const adherence =
                group.plannedSeconds > 0
                  ? `${Math.round((group.actualSeconds / group.plannedSeconds) * 100)}%`
                  : "—";

              return (
                <li key={group.key} className="flex items-center gap-3 rounded-lg border p-3">
                  <div className="relative shrink-0">
                    <svg width={VIEW} height={VIEW} aria-hidden="true">
                      {group.projects.map((project, index) =>
                        outer[index].dasharray.startsWith("0 ") ? null : (
                          <circle
                            key={`plan-${project.key}`}
                            cx={CENTER}
                            cy={CENTER}
                            r={OUTER_RADIUS}
                            fill="none"
                            stroke={project.color}
                            strokeOpacity={0.28}
                            strokeWidth={STROKE_WIDTH}
                            strokeDasharray={outer[index].dasharray}
                            strokeDashoffset={outer[index].dashoffset}
                            transform={`rotate(-90 ${CENTER} ${CENTER})`}
                          />
                        )
                      )}
                      {group.projects.map((project, index) =>
                        inner[index].dasharray.startsWith("0 ") ? null : (
                          <circle
                            key={`actual-${project.key}`}
                            cx={CENTER}
                            cy={CENTER}
                            r={INNER_RADIUS}
                            fill="none"
                            stroke={project.color}
                            strokeWidth={STROKE_WIDTH}
                            strokeDasharray={inner[index].dasharray}
                            strokeDashoffset={inner[index].dashoffset}
                            transform={`rotate(-90 ${CENTER} ${CENTER})`}
                          />
                        )
                      )}
                    </svg>
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                      <span
                        className={cn(
                          "text-xs font-semibold tabular-nums",
                          over && "text-destructive"
                        )}
                      >
                        {adherence}
                      </span>
                      <span className="text-[10px] text-muted-foreground">of plan</span>
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={group.name}>
                      {group.name}
                    </p>
                    <p className="text-[11px] tabular-nums text-muted-foreground">
                      {formatDuration(group.actualSeconds)}
                      <span className="mx-1">/</span>
                      {group.plannedSeconds > 0 ? formatDuration(group.plannedSeconds) : "—"}
                    </p>
                    <ul className="mt-1.5 space-y-0.5">
                      {group.projects.map((project) => (
                        <li key={project.key} className="flex items-center gap-1.5 text-[11px]">
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: project.color }}
                          />
                          <span className="truncate" title={project.name}>
                            {project.name}
                          </span>
                          <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                            {formatDuration(project.actualSeconds)}
                            <span className="mx-1">/</span>
                            {project.plannedSeconds > 0
                              ? formatDuration(project.plannedSeconds)
                              : "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
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
