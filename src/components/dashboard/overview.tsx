"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  CircleDashed,
  Clock3,
  Plus,
  Timer,
  TrendingUp,
  TriangleAlert,
} from "lucide-react";

import { DailyTrendChart } from "@/components/analytics/charts";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/layout/stat-card";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { TimeEntryDialog } from "@/components/time-entries/time-entry-dialog";
import { TimerWidget } from "@/components/timer/timer-widget";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import {
  buildDailyTrend,
  buildTaskCompletionStats,
  secondsWithinRange,
  schedulesWithinRange,
} from "@/lib/stats";
import { TASK_PRIORITY_LABELS, type Task } from "@/lib/types";
import {
  formatDateLabel,
  formatDuration,
  formatTimeLabel,
  resolveRange,
} from "@/lib/time";
import { useAppStore } from "@/store/use-app-store";

export function Overview() {
  const timezone = useUserTimezone();
  const tasks = useAppStoreTasks();
  const schedules = useAppStoreSchedules();
  const timeEntries = useAppStoreTimeEntries();

  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [entryDialogOpen, setEntryDialogOpen] = useState(false);

  const today = useMemo(() => resolveRange("today", timezone), [timezone]);
  const week = useMemo(() => resolveRange("week", timezone), [timezone]);
  const trendRange = useMemo(() => {
    const base = resolveRange("today", timezone);
    return { start: new Date(base.start.getTime() - 13 * 86_400_000), end: base.end };
  }, [timezone]);

  const todaySeconds = secondsWithinRange(timeEntries, today);
  const weekSeconds = secondsWithinRange(timeEntries, week);
  const trend = useMemo(
    () => buildDailyTrend(timeEntries, trendRange, timezone),
    [timeEntries, trendRange, timezone]
  );

  const completion = useMemo(() => buildTaskCompletionStats(tasks), [tasks]);
  const openTasks = useMemo(
    () =>
      tasks
        .filter((task) => !task.deleted_at && (task.status === "todo" || task.status === "in_progress"))
        .sort((a, b) => {
          const aDue = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
          const bDue = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
          return aDue - bDue;
        }),
    [tasks]
  );

  const todaySchedules = useMemo(
    () => schedulesWithinRange(schedules, today).sort((a, b) => a.start_at.localeCompare(b.start_at)),
    [schedules, today]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description={formatDateLabel(new Date(), timezone)}
        actions={
          <>
            <Button size="sm" variant="outline" onClick={() => setEntryDialogOpen(true)}>
              <Clock3 className="size-4" />
              Log time
            </Button>
            <Button size="sm" onClick={() => setTaskDialogOpen(true)}>
              <Plus className="size-4" />
              New task
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Tracked today"
          value={formatDuration(todaySeconds)}
          hint={`${timeEntries.length} entries in total`}
          icon={Timer}
        />
        <StatCard
          label="This week"
          value={formatDuration(weekSeconds)}
          hint="Week starts Monday"
          icon={TrendingUp}
        />
        <StatCard
          label="Open tasks"
          value={String(completion.pending)}
          hint={`${completion.completed} completed`}
          icon={CircleDashed}
        />
        <StatCard
          label="Overdue"
          value={String(completion.overdue)}
          hint={completion.overdue > 0 ? "Needs attention" : "All clear"}
          icon={TriangleAlert}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Last 14 days</CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link href="/analytics">View analytics</Link>
              </Button>
            </CardHeader>
            <CardContent>
              <DailyTrendChart data={trend} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="size-4 text-muted-foreground" />
                Today&apos;s plan
              </CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link href="/calendar">Open calendar</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {todaySchedules.length === 0 ? (
                <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                  Nothing scheduled for today.
                </p>
              ) : (
                <ul className="divide-y">
                  {todaySchedules.map((schedule) => (
                    <li key={schedule.id} className="flex items-center gap-3 py-2.5">
                      <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">
                        {formatTimeLabel(schedule.start_at, timezone)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">{schedule.title}</span>
                      <span className="hidden text-xs text-muted-foreground sm:block">
                        {formatDuration(
                          (new Date(schedule.end_at).getTime() - new Date(schedule.start_at).getTime()) / 1000
                        )}
                      </span>
                      <Badge variant="secondary" className="shrink-0">
                        {schedule.schedule_type === "task" ? "Task" : "Event"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <TimerWidget />

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <CheckCircle2 className="size-4 text-muted-foreground" />
                Up next
              </CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link href="/tasks">All tasks</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {openTasks.length === 0 ? (
                <p className="rounded-md border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                  No open tasks. Enjoy the calm.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {openTasks.slice(0, 6).map((task) => (
                    <TaskRow key={task.id} task={task} timezone={timezone} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <TaskFormDialog open={taskDialogOpen} onOpenChange={setTaskDialogOpen} />
      <TimeEntryDialog open={entryDialogOpen} onOpenChange={setEntryDialogOpen} />
    </div>
  );
}

function TaskRow({ task, timezone }: { task: Task; timezone: string }) {
  const overdue =
    task.due_date !== null && new Date(task.due_date).getTime() < Date.now();
  return (
    <li className="flex items-start gap-2">
      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
      <div className="min-w-0 flex-1">
        <Link href={`/tasks?task=${task.id}`} className="block truncate text-sm hover:underline">
          {task.title}
        </Link>
        <p className="text-xs text-muted-foreground">
          {task.due_date
            ? `${overdue ? "Overdue · " : "Due "}${formatDateLabel(task.due_date, timezone)}`
            : "No due date"}
          {" · "}
          {TASK_PRIORITY_LABELS[task.priority]}
        </p>
      </div>
    </li>
  );
}

/* Small selector wrappers keep the component body readable. */
function useAppStoreTasks() {
  return useAppStore((state) => state.tasks);
}
function useAppStoreSchedules() {
  return useAppStore((state) => state.schedules);
}
function useAppStoreTimeEntries() {
  return useAppStore((state) => state.timeEntries);
}
