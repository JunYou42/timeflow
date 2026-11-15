"use client";

import { Fragment, useCallback, useMemo, useRef, useState } from "react";
import { BarChart3, CheckCircle2, Clock3, Target } from "lucide-react";
import { toast } from "sonner";

import {
  CategoryRadarChart,
  DailyTrendChart,
  PlannedVsActualChart,
} from "@/components/analytics/charts";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/layout/stat-card";
import { EmptyState } from "@/components/layout/states";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import {
  buildCategoryEffort,
  buildDailyTrend,
  buildPlannedVsActual,
  buildProjectAccuracy,
  buildTaskCompletionStats,
  entriesWithinRange,
  isUpcomingProject,
  schedulesWithinRange,
  sumSeconds,
  type ProjectEstimateRow,
} from "@/lib/stats";
import { formatDuration, resolveRange, type RangePreset } from "@/lib/time";
import type { UUID } from "@/lib/types";
import { cn } from "@/lib/utils";
import { describeError, useAppStore } from "@/store/use-app-store";

export function AnalyticsWorkspace() {
  const timezone = useUserTimezone();
  const timeEntries = useAppStore((state) => state.timeEntries);
  const schedules = useAppStore((state) => state.schedules);
  const tasks = useAppStore((state) => state.tasks);
  const categories = useAppStore((state) => state.categories);
  const projects = useAppStore((state) => state.projects);
  const updateProject = useAppStore((state) => state.updateProject);

  const [preset, setPreset] = useState<RangePreset>("week");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const range = useMemo(() => {
    if (preset === "custom" && customStart && customEnd) {
      return resolveRange("custom", timezone, new Date(), {
        start: `${customStart}T00:00:00`,
        end: `${customEnd}T00:00:00`,
      });
    }
    return resolveRange(preset === "custom" ? "week" : preset, timezone);
  }, [preset, customStart, customEnd, timezone]);

  const entries = useMemo(() => entriesWithinRange(timeEntries, range), [timeEntries, range]);
  const rangeSchedules = useMemo(() => schedulesWithinRange(schedules, range), [schedules, range]);

  // Long-term projects are estimated per week, and that column is judged on the
  // current week rather than on whatever range the page is showing.
  const weekRange = useMemo(() => resolveRange("week", timezone), [timezone]);
  const weekEntries = useMemo(
    () => entriesWithinRange(timeEntries, weekRange),
    [timeEntries, weekRange]
  );

  const actualSeconds = useMemo(() => sumSeconds(entries), [entries]);
  const plannedSeconds = useMemo(
    () =>
      rangeSchedules.reduce(
        (total, schedule) =>
          total +
          Math.max(
            0,
            Math.floor(
              (new Date(schedule.end_at).getTime() - new Date(schedule.start_at).getTime()) / 1000
            )
          ),
        0
      ),
    [rangeSchedules]
  );

  const categoryEffort = useMemo(
    () => buildCategoryEffort(tasks, schedules, timeEntries, projects, categories, range),
    [tasks, schedules, timeEntries, projects, categories, range]
  );
  const daily = useMemo(() => buildDailyTrend(entries, range, timezone), [entries, range, timezone]);
  const plannedVsActual = useMemo(
    () => buildPlannedVsActual(rangeSchedules, entries, range, timezone),
    [rangeSchedules, entries, range, timezone]
  );
  const completion = useMemo(() => buildTaskCompletionStats(tasks), [tasks]);
  const projectAccuracy = useMemo(
    () => buildProjectAccuracy(projects, tasks, timeEntries, weekEntries),
    [projects, tasks, timeEntries, weekEntries]
  );
  // Rows are sorted with the not-yet-started projects last, so a single divider
  // in front of the first one separates the two groups.
  const upcomingIndex = useMemo(
    () => projectAccuracy.findIndex((row) => isUpcomingProject(row)),
    [projectAccuracy]
  );

  const saveProjectEstimate = useCallback(
    async (projectId: UUID, estimatedHours: number | null) => {
      try {
        await updateProject(projectId, { estimated_hours: estimatedHours });
      } catch (error) {
        toast.error("Could not save the estimate", { description: describeError(error) });
      }
    },
    [updateProject]
  );

  const plannedSecondsInRange = plannedSeconds;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Analytics"
        description="Where your hours actually go, and how close your estimates are."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={preset} onValueChange={(value) => setPreset(value as RangePreset)}>
              <SelectTrigger className="h-9 w-auto min-w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This week</SelectItem>
                <SelectItem value="month">This month</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
            {preset === "custom" ? (
              <>
                <Input
                  type="date"
                  value={customStart}
                  onChange={(event) => setCustomStart(event.target.value)}
                  className="h-9 w-auto text-xs"
                  aria-label="Start date"
                />
                <Input
                  type="date"
                  value={customEnd}
                  onChange={(event) => setCustomEnd(event.target.value)}
                  className="h-9 w-auto text-xs"
                  aria-label="End date"
                />
              </>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Tracked" value={formatDuration(actualSeconds)} icon={Clock3} />
        <StatCard
          label="Planned"
          value={formatDuration(plannedSecondsInRange)}
          hint={`${rangeSchedules.length} scheduled blocks`}
          icon={BarChart3}
        />
        <StatCard
          label="Plan adherence"
          value={
            plannedSecondsInRange > 0
              ? `${Math.round((actualSeconds / plannedSecondsInRange) * 100)}%`
              : "—"
          }
          hint="Tracked ÷ planned"
          icon={Target}
        />
        <StatCard
          label="Completion"
          value={`${completion.completionRate}%`}
          hint={`${completion.completed}/${completion.total} tasks done`}
          icon={CheckCircle2}
        />
      </div>

      {actualSeconds === 0 && plannedSecondsInRange === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="Nothing to analyse yet in this range"
          description="Track some time or plan a few blocks and the charts will fill in."
        />
      ) : (
        <>
          {/* The radar needs elbow room for its category labels, so the two
              charts share the row instead of the bar chart taking two thirds. */}
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border bg-background p-5">
              <h2 className="mb-4 text-sm font-semibold">Tracked vs planned hours</h2>
              <PlannedVsActualChart data={plannedVsActual} />
            </div>
            <div className="rounded-lg border bg-background p-5">
              <h2 className="mb-4 text-sm font-semibold">Time by category</h2>
              <CategoryRadarChart data={categoryEffort} />
            </div>
          </div>

          <div className="rounded-lg border bg-background p-5">
            <h2 className="mb-4 text-sm font-semibold">Daily tracked hours</h2>
            <DailyTrendChart data={daily} />
          </div>
        </>
      )}

      <div className="rounded-lg border bg-background">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5">
          <h2 className="text-sm font-semibold">Estimated by project</h2>
          <span className="text-xs text-muted-foreground">Click an estimate to change it</span>
        </div>
        {projectAccuracy.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            No project has an estimate or tracked time yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[200px]">Project</TableHead>
                <TableHead>Estimated</TableHead>
                <TableHead>Actual</TableHead>
                <TableHead>Ratio</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projectAccuracy.map((row, index) => (
                <Fragment key={row.projectId}>
                  {index === upcomingIndex ? (
                    <TableRow className="border-none hover:bg-transparent">
                      <TableCell
                        colSpan={5}
                        className="border-t-2 border-dashed border-muted-foreground/30 bg-muted/40 py-2 text-xs font-medium text-muted-foreground"
                      >
                        Upcoming · starts later
                      </TableCell>
                    </TableRow>
                  ) : null}
                  <TableRow>
                    <TableCell>
                      <span className="flex items-center gap-2 font-medium">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: row.color }}
                        />
                        {row.name}
                        {row.endDate === null ? (
                          <Badge
                            variant="outline"
                            className="border-transparent bg-muted px-1.5 py-0 text-[10px] font-medium text-muted-foreground"
                          >
                            Long-term · per week
                          </Badge>
                        ) : null}
                      </span>
                    </TableCell>
                    <TableCell>
                      <ProjectEstimateCell row={row} onSave={saveProjectEstimate} />
                    </TableCell>
                    <TableCell
                      className="tabular-nums"
                      title={
                        row.endDate === null
                          ? "Everything tracked on this project so far"
                          : undefined
                      }
                    >
                      {formatDuration(row.actualSeconds)}
                    </TableCell>
                    <TableCell
                      title={
                        row.endDate === null
                          ? "This week's tracked time ÷ the weekly estimate"
                          : undefined
                      }
                    >
                      {row.ratio === null ? (
                        <span className="text-xs text-muted-foreground">No estimate</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Progress
                            value={Math.min(100, Math.round(row.ratio * 100))}
                            className={cn(
                              row.status === "over" && "bg-red-100 [&>div]:bg-red-500",
                              row.status === "under" && "bg-emerald-100 [&>div]:bg-emerald-500"
                            )}
                          />
                          <span className="w-12 text-right text-xs tabular-nums text-muted-foreground">
                            {row.ratio}×
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <AccuracyBadge status={row.status} />
                    </TableCell>
                  </TableRow>
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}

/** Stored hours, rounded the same way the estimate is written back. */
function estimateHours(seconds: number | null): number | null {
  if (seconds === null) return null;
  return Math.round((seconds / 3600) * 100) / 100;
}

interface ProjectEstimateCellProps {
  row: ProjectEstimateRow;
  onSave: (projectId: UUID, estimatedHours: number | null) => Promise<void>;
}

/**
 * The project's estimate, edited in place: clicking the figure turns it into a
 * field, Enter or clicking away stores it, Escape abandons the change.
 */
function ProjectEstimateCell({ row, onSave }: ProjectEstimateCellProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  // Enter fires a save and the ensuing unmount fires blur as well; the flag
  // keeps the second one from writing the same value twice.
  const committed = useRef(false);

  const startEditing = () => {
    const hours = estimateHours(row.estimatedSeconds);
    setValue(hours === null ? "" : String(hours));
    committed.current = false;
    setEditing(true);
  };

  const commit = () => {
    if (committed.current) return;
    committed.current = true;
    setEditing(false);

    const trimmed = value.trim();
    if (trimmed && !/^\d+(\.\d{1,2})?$/.test(trimmed)) {
      toast.error("Estimate must be a number of hours, e.g. 1.5");
      return;
    }
    const hours = trimmed ? Math.round(Number.parseFloat(trimmed) * 100) / 100 : null;
    if (hours === estimateHours(row.estimatedSeconds)) return;
    void onSave(row.projectId, hours);
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={startEditing}
        title="Click to edit the estimate"
        className="rounded px-1.5 py-0.5 text-left tabular-nums text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        {row.estimatedSeconds === null ? (
          <span className="text-xs">Set estimate</span>
        ) : (
          <>
            {formatDuration(row.estimatedSeconds)}
            {row.endDate === null ? (
              <span className="text-[10px] text-muted-foreground/70">/wk</span>
            ) : null}
          </>
        )}
      </button>
    );
  }

  return (
    <Input
      autoFocus
      inputMode="decimal"
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          committed.current = true;
          setEditing(false);
        }
      }}
      className="h-7 w-20 text-xs"
      aria-label={`Estimated hours for ${row.name}`}
    />
  );
}

function AccuracyBadge({ status }: { status: "under" | "on" | "over" | "unknown" }) {
  if (status === "unknown") {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const classes = {
    under: "border-transparent bg-emerald-100 text-emerald-700",
    on: "border-transparent bg-sky-100 text-sky-700",
    over: "border-transparent bg-red-100 text-red-700",
  } as const;
  const labels = { under: "Under", on: "On track", over: "Over" } as const;
  return <Badge className={classes[status]}>{labels[status]}</Badge>;
}
