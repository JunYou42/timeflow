"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight, FolderKanban, Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/states";
import { ProjectDialog, type ProjectDialogState } from "@/components/projects/project-dialog";
import { ProjectEstimateDashboard } from "@/components/projects/project-estimate-dashboard";
import { ProjectTimeDashboard } from "@/components/projects/project-time-dashboard";
import { ProjectTimelineBoard } from "@/components/projects/project-timeline-board";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import {
  buildProjectPlanVsActual,
  buildProjectTimeline,
  buildWeeklyWorkload,
  decorateProjectsWithStats,
  planProjectReorder,
  projectTimelineRange,
  type ProjectPlanActualRow,
} from "@/lib/stats";
import { addDaysInTimezone, formatDuration, formatInTimezone, resolveRange } from "@/lib/time";
import {
  PROJECT_QUADRANT_LABELS,
  projectQuadrant,
  type ProjectQuadrant,
  type ProjectUpdate,
  type ProjectWithStats,
  type UUID,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { describeError, useAppStore } from "@/store/use-app-store";

const QUADRANT_ORDER: ProjectQuadrant[] = ["do", "plan", "delegate", "drop"];

const QUADRANT_DOT: Record<ProjectQuadrant, string> = {
  do: "bg-red-500",
  plan: "bg-sky-500",
  delegate: "bg-amber-500",
  drop: "bg-slate-400",
};

export function ProjectsWorkspace() {
  const timezone = useUserTimezone();
  const projects = useAppStore((state) => state.projects);
  const tasks = useAppStore((state) => state.tasks);
  const categories = useAppStore((state) => state.categories);
  const timeEntries = useAppStore((state) => state.timeEntries);
  const schedules = useAppStore((state) => state.schedules);
  const updateProject = useAppStore((state) => state.updateProject);

  const [dialog, setDialog] = useState<ProjectDialogState>({ open: false, project: null });

  // Which week the load panel below is looking at. 0 is the current one; the
  // arrows step a week at a time, so the same questions can be asked of any
  // week and the numbers and bars move together.
  const [weekOffset, setWeekOffset] = useState(0);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );

  const decorated = useMemo(
    () => decorateProjectsWithStats(projects, tasks, timeEntries),
    [projects, tasks, timeEntries]
  );

  // The timeline is a plan, so it only plots projects that have an end date.
  // Open-ended ones are listed beside it rather than given a made-up length.
  const scheduled = useMemo(
    () => decorated.filter((project) => project.end_date !== null),
    [decorated]
  );

  const openEnded = useMemo(
    () =>
      decorated
        .filter((project) => project.end_date === null)
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [decorated]
  );

  const range = useMemo(() => projectTimelineRange(scheduled, timezone), [scheduled, timezone]);

  const items = useMemo(() => buildProjectTimeline(scheduled, range), [scheduled, range]);

  // What a week has been given: blocks on the calendar against time actually
  // booked, project by project. Both sides share the same window so the numbers
  // and the bars below them tell one story. The reference date also drives the
  // estimate reading, so stepping weeks re-reads the load from that week's
  // point of view rather than always from today.
  const weekRange = useMemo(
    () => resolveRange("week", timezone, addDaysInTimezone(new Date(), weekOffset * 7, timezone)),
    [timezone, weekOffset]
  );

  const weekLoad = useMemo(
    () => buildProjectPlanVsActual(schedules, timeEntries, tasks, decorated, weekRange, weekRange.start),
    [schedules, timeEntries, tasks, decorated, weekRange]
  );

  // The headline estimate is the sum of the very targets the chart below draws,
  // so the 工期 card and 项目校准 can never disagree about the week.
  const workload = useMemo(() => buildWeeklyWorkload(weekLoad, projects), [weekLoad, projects]);

  const weekPlannedSeconds = weekLoad.reduce((sum, row) => sum + row.plannedSeconds, 0);
  const weekActualSeconds = weekLoad.reduce((sum, row) => sum + row.actualSeconds, 0);

  const weekLabel = `${formatInTimezone(weekRange.start, timezone, "MMM d")} – ${formatInTimezone(
    addDaysInTimezone(weekRange.end, -1, timezone),
    timezone,
    "MMM d"
  )}`;

  const quadrantCounts = useMemo(() => {
    const counts: Record<ProjectQuadrant, number> = { do: 0, plan: 0, delegate: 0, drop: 0 };
    for (const project of decorated) counts[projectQuadrant(project)] += 1;
    return counts;
  }, [decorated]);

  const totals = useMemo(
    () =>
      decorated.reduce(
        (sum, project) => ({
          estimated: sum.estimated + (project.estimated_hours ?? 0),
          taskEstimate: sum.taskEstimate + project.task_estimated_minutes,
          actual: sum.actual + project.actual_seconds,
        }),
        { estimated: 0, taskEstimate: 0, actual: 0 }
      ),
    [decorated]
  );

  const openProject = (project: ProjectWithStats) => setDialog({ open: true, project });

  const changeWindow = (projectId: UUID, patch: ProjectUpdate) => {
    void updateProject(projectId, patch).catch((error) => {
      toast.error("Could not move the project", { description: describeError(error) });
    });
  };

  const reorderProjects = (projectId: UUID, laneShift: number) => {
    const patches = planProjectReorder(items, projectId, laneShift);
    if (patches.length === 0) return;
    void Promise.all(
      patches.map((patch) => updateProject(patch.id, { sort_order: patch.sort_order }))
    ).catch((error) => {
      toast.error("Could not change the priority", { description: describeError(error) });
    });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Projects"
        description="Projects with an end date, laid out on a vertical timeline — scroll to travel through time."
        actions={
          <Button size="sm" onClick={() => setDialog({ open: true, project: null })}>
            <Plus className="size-4" />
            New project
          </Button>
        }
      />

      {decorated.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="No projects yet"
          description="Create a project, give it a start and end date, and it will appear on the timeline."
          action={
            <Button size="sm" onClick={() => setDialog({ open: true, project: null })}>
              <Plus className="size-4" />
              New project
            </Button>
          }
        />
      ) : (
        <>
          {/* The week's three numbers -- what it should cost, what was set
              aside for it, what it actually took -- gathered into one card so
              the panel reads as a single answer, with the week picker on its
              right and the per-project split of the last two beside it. */}
          <div className="grid gap-4 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
            <WeekSummaryCard
              weekLabel={weekLabel}
              isCurrentWeek={weekOffset === 0}
              onStep={(delta) => setWeekOffset((current) => current + delta)}
              onReset={() => setWeekOffset(0)}
              metrics={[
                {
                  label: "Estimated",
                  value: formatHours(workload.totalHours),
                  hint: `${formatHours(workload.ongoingHours)} long-term + ${formatHours(
                    workload.deadlineHours
                  )} short-term`,
                },
                {
                  label: "Planned",
                  value: formatDuration(weekPlannedSeconds),
                  hint: "Scheduled",
                },
                {
                  label: "Actual",
                  value: formatDuration(weekActualSeconds),
                  hint: "Tracked",
                },
              ]}
            />

            <WeekLoadChart rows={weekLoad} />
          </div>

          <Card>
            <CardContent className="flex flex-wrap items-center gap-x-5 gap-y-2 p-3 text-xs">
              {QUADRANT_ORDER.map((quadrant) => (
                <span key={quadrant} className="flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", QUADRANT_DOT[quadrant])} />
                  <span className="font-medium">{PROJECT_QUADRANT_LABELS[quadrant]}</span>
                  <span className="text-muted-foreground">{quadrantCounts[quadrant]}</span>
                </span>
              ))}
              <span className="ml-auto text-muted-foreground">
                Estimated {formatDuration(totals.estimated * 3600)} · Tasks{" "}
                {formatDuration(totals.taskEstimate * 60)} · Tracked{" "}
                {formatDuration(totals.actual)}
              </span>
            </CardContent>
          </Card>

          {/* Side by side: what the period's hours went into, next to whether
              each project is still inside its own estimate. */}
          <div className="grid gap-4 lg:grid-cols-2">
            <ProjectTimeDashboard projects={projects} tasks={tasks} timeEntries={timeEntries} />

            <ProjectEstimateDashboard projects={projects} tasks={tasks} timeEntries={timeEntries} />
          </div>

          <div className={cn("gap-4", openEnded.length > 0 && "grid xl:grid-cols-[minmax(0,1fr)_18rem]")}>
            <div className="min-w-0">
              {scheduled.length > 0 ? (
                <ProjectTimelineBoard
                  items={items}
                  range={range}
                  timezone={timezone}
                  onSelectProject={openProject}
                  onUpdateWindow={changeWindow}
                  onReorder={reorderProjects}
                />
              ) : (
                <Card>
                  <CardContent className="p-6 text-center text-sm text-muted-foreground">
                    No project has an end date yet, so there is nothing to plot.
                  </CardContent>
                </Card>
              )}
            </div>

            {openEnded.length > 0 ? (
              <aside className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-medium">No end date</h2>
                  <span className="text-xs text-muted-foreground">{openEnded.length}</span>
                </div>
                <p className="text-[11px] text-muted-foreground/80">
                  Kept off the timeline until they get an end date.
                </p>
                <div className="space-y-1.5">
                  {openEnded.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => openProject(project)}
                      title={`${project.name} · ${PROJECT_QUADRANT_LABELS[projectQuadrant(project)]}`}
                      className="flex w-full items-start gap-2 rounded-md border border-l-4 px-2 py-1.5 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      style={{
                        borderLeftColor: project.color,
                        backgroundColor: `${project.color}1a`,
                      }}
                    >
                      <span
                        className={cn(
                          "mt-1 size-2 shrink-0 rounded-full",
                          QUADRANT_DOT[projectQuadrant(project)]
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium leading-tight">
                          {project.name}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                          <span>
                            {project.start_date
                              ? `From ${formatInTimezone(project.start_date, timezone, "MMM d")}`
                              : "No dates"}
                          </span>
                          {project.category_id ? (
                            <span className="flex items-center gap-1">
                              <span
                                className="size-1.5 rounded-full"
                                style={{
                                  backgroundColor: categoryById.get(project.category_id)?.color,
                                }}
                              />
                              {categoryById.get(project.category_id)?.name}
                            </span>
                          ) : null}
                          {project.task_count > 0 ? (
                            <span>
                              {project.done_task_count}/{project.task_count} done
                            </span>
                          ) : null}
                          {project.actual_seconds > 0 ? (
                            <span>{formatDuration(project.actual_seconds)} tracked</span>
                          ) : null}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </aside>
            ) : null}
          </div>
        </>
      )}

      <ProjectDialog
        state={dialog}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
      />
    </div>
  );
}

/** Hours as a terse figure: "12h", "12.5h". */
function formatHours(hours: number): string {
  return `${Math.round(hours * 10) / 10}h`;
}

interface WeekMetric {
  label: string;
  value: string;
  hint: string;
}

/**
 * The week's three headline numbers on one card, with the week picker above
 * them.
 *
 * Splitting these into three separate cards left the row looking thin, so they
 * share a single surface and read as one answer to "how is the week going":
 * how much it should cost, how much was set aside, how much it took. The
 * arrows step a week at a time and a shortcut jumps back to the current one.
 */
function WeekSummaryCard({
  weekLabel,
  isCurrentWeek,
  onStep,
  onReset,
  metrics,
}: {
  weekLabel: string;
  isCurrentWeek: boolean;
  onStep: (delta: number) => void;
  onReset: () => void;
  metrics: WeekMetric[];
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0 pb-3">
        <div className="space-y-1">
          <CardTitle className="text-sm">工期</CardTitle>
          <CardDescription className="text-xs">{weekLabel}</CardDescription>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="Previous week"
            onClick={() => onStep(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs"
            disabled={isCurrentWeek}
            onClick={onReset}
          >
            This week
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            aria-label="Next week"
            onClick={() => onStep(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <ul className="divide-y">
          {metrics.map((metric) => (
            <li
              key={metric.label}
              className="flex items-baseline justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 space-y-0.5">
                <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {metric.label}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">{metric.hint}</p>
              </div>
              <p className="shrink-0 text-xl font-semibold tabular-nums">{metric.value}</p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/**
 * The week's scheduled and tracked hours, project by project.
 *
 * Each row is scaled to its own weekly estimate, so a full bar means the
 * project got exactly the hours it asked for and the length can be read as
 * "how far along the estimate is" rather than against another project's
 * numbers. The muted bar is what the calendar promised, the coloured one what
 * was actually booked, and every row carries its two durations plus the
 * estimate it is measured against.
 */
function WeekLoadChart({ rows }: { rows: ProjectPlanActualRow[] }) {
  return (
    <Card>
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="text-sm">项目校准</CardTitle>
        <CardDescription className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="h-1 w-4 rounded-full bg-muted-foreground/40" />
            Planned
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-foreground/70" />
            Tracked
          </span>
          <span className="ml-auto text-muted-foreground">of each estimate</span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No project is active in this period.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <li key={row.projectId} className="space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: row.color }}
                  />
                  <span className="truncate font-medium">{row.name}</span>
                  <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                    {formatDuration(row.plannedSeconds)}
                    <span className="mx-1">/</span>
                    {formatDuration(row.actualSeconds)}
                    {row.targetSeconds > 0 ? (
                      <>
                        <span className="mx-1">of</span>
                        {formatDuration(row.targetSeconds)}
                      </>
                    ) : null}
                  </span>
                </div>
                <div className="space-y-0.5">
                  <LoadBar
                    seconds={row.plannedSeconds}
                    target={row.targetSeconds}
                    className="bg-muted-foreground/40"
                  />
                  <LoadBar
                    seconds={row.actualSeconds}
                    target={row.targetSeconds}
                    style={{ backgroundColor: row.color }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function LoadBar({
  seconds,
  target,
  className,
  style,
}: {
  seconds: number;
  target: number;
  className?: string;
  style?: CSSProperties;
}) {
  // A full bar is the project's own estimate for the week. Projects without one
  // get no reference line, so their bar is left unset rather than guessed at. A
  // 2% floor keeps a sliver of time from vanishing entirely.
  const width =
    target > 0 && seconds > 0 ? Math.min(100, Math.max(2, (seconds / target) * 100)) : 0;
  return (
    <div className="h-1 overflow-hidden rounded-full bg-muted">
      <div
        className={cn("h-full rounded-full", className)}
        style={{ ...style, width: `${width}%` }}
      />
    </div>
  );
}
