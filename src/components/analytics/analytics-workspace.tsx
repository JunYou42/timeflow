"use client";

import { useMemo, useState } from "react";
import { BarChart3, CheckCircle2, Clock3, Target } from "lucide-react";

import {
  CategoryDonut,
  CategoryLegend,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import {
  buildCategoryAccuracy,
  buildDailyTrend,
  buildPlannedVsActual,
  buildTaskAccuracy,
  buildTaskCompletionStats,
  entriesWithinRange,
  groupSecondsByCategory,
  schedulesWithinRange,
  sumSeconds,
} from "@/lib/stats";
import { formatDuration, resolveRange, type RangePreset } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/use-app-store";

export function AnalyticsWorkspace() {
  const timezone = useUserTimezone();
  const timeEntries = useAppStore((state) => state.timeEntries);
  const schedules = useAppStore((state) => state.schedules);
  const tasks = useAppStore((state) => state.tasks);
  const categories = useAppStore((state) => state.categories);

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

  const slices = useMemo(() => groupSecondsByCategory(entries, categories), [entries, categories]);
  const daily = useMemo(() => buildDailyTrend(entries, range, timezone), [entries, range, timezone]);
  const plannedVsActual = useMemo(
    () => buildPlannedVsActual(rangeSchedules, entries, range, timezone),
    [rangeSchedules, entries, range, timezone]
  );
  const taskAccuracy = useMemo(() => buildTaskAccuracy(tasks, timeEntries), [tasks, timeEntries]);
  const categoryAccuracy = useMemo(
    () => buildCategoryAccuracy(tasks, timeEntries, categories),
    [tasks, timeEntries, categories]
  );
  const completion = useMemo(() => buildTaskCompletionStats(tasks), [tasks]);

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
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-lg border bg-background p-5 lg:col-span-2">
              <h2 className="mb-4 text-sm font-semibold">Tracked vs planned hours</h2>
              <PlannedVsActualChart data={plannedVsActual} />
            </div>
            <div className="rounded-lg border bg-background p-5">
              <h2 className="mb-4 text-sm font-semibold">Time by category</h2>
              <CategoryDonut data={slices} />
              <div className="mt-4">
                <CategoryLegend data={slices} />
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-background p-5">
            <h2 className="mb-4 text-sm font-semibold">Daily tracked hours</h2>
            <DailyTrendChart data={daily} />
          </div>

          <Tabs defaultValue="tasks">
            <TabsList>
              <TabsTrigger value="tasks">Estimation by task</TabsTrigger>
              <TabsTrigger value="categories">Estimation by category</TabsTrigger>
            </TabsList>

            <TabsContent value="tasks" className="mt-4">
              {taskAccuracy.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                  No tasks with an estimate or tracked time yet.
                </p>
              ) : (
                <div className="rounded-lg border bg-background">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[200px]">Task</TableHead>
                        <TableHead>Estimated</TableHead>
                        <TableHead>Actual</TableHead>
                        <TableHead>Ratio</TableHead>
                        <TableHead className="hidden sm:table-cell">Variance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {taskAccuracy.map((row) => (
                        <TableRow key={row.taskId}>
                          <TableCell className="truncate font-medium">{row.title}</TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">
                            {row.estimatedSeconds > 0 ? formatDuration(row.estimatedSeconds) : "—"}
                          </TableCell>
                          <TableCell className="tabular-nums">{formatDuration(row.actualSeconds)}</TableCell>
                          <TableCell>
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
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="categories" className="mt-4">
              <div className="rounded-lg border bg-background">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[180px]">Category</TableHead>
                      <TableHead>Estimated</TableHead>
                      <TableHead>Actual</TableHead>
                      <TableHead>Ratio</TableHead>
                      <TableHead className="hidden sm:table-cell">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {categoryAccuracy.map((row) => (
                      <TableRow key={row.categoryId}>
                        <TableCell>
                          <span className="flex items-center gap-2 font-medium">
                            <span
                              className="size-2.5 rounded-full"
                              style={{ backgroundColor: row.color }}
                            />
                            {row.name}
                          </span>
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {row.estimatedSeconds > 0 ? formatDuration(row.estimatedSeconds) : "—"}
                        </TableCell>
                        <TableCell className="tabular-nums">{formatDuration(row.actualSeconds)}</TableCell>
                        <TableCell className="tabular-nums">
                          {row.ratio === null ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            `${row.ratio}×`
                          )}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <AccuracyBadge
                            status={!row.ratio ? "unknown" : row.ratio > 1.05 ? "over" : row.ratio < 0.95 ? "under" : "on"}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
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
