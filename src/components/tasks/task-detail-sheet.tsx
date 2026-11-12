"use client";

import { useMemo, useState } from "react";
import {
  CalendarPlus,
  Loader2,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { ScheduleDialog } from "@/components/calendar/schedule-dialog";
import { CategoryDot, TaskPriorityBadge, TaskStatusBadge } from "@/components/tasks/task-meta";
import { TaskFormDialog } from "@/components/tasks/task-form-dialog";
import { StartTimerDialog } from "@/components/timer/start-timer-dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { estimationRatio } from "@/lib/stats";
import {
  formatDateTimeLabel,
  formatDuration,
  minutesToSeconds,
  secondsToMinutes,
  toLocalInputValue,
} from "@/lib/time";
import type { Schedule, TimeEntry } from "@/lib/types";
import { describeError, useAppStore } from "@/store/use-app-store";

interface TaskDetailSheetProps {
  taskId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TaskDetailSheet({ taskId, open, onOpenChange }: TaskDetailSheetProps) {
  const timezone = useUserTimezone();
  const tasks = useAppStore((state) => state.tasks);
  const projects = useAppStore((state) => state.projects);
  const categories = useAppStore((state) => state.categories);
  const schedules = useAppStore((state) => state.schedules);
  const timeEntries = useAppStore((state) => state.timeEntries);
  const deleteTask = useAppStore((state) => state.deleteTask);
  const updateTask = useAppStore((state) => state.updateTask);

  const [editOpen, setEditOpen] = useState(false);
  const [timerOpen, setTimerOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const task = useMemo(
    () => tasks.find((item) => item.id === taskId) ?? null,
    [tasks, taskId]
  );

  const subtasks = useMemo(
    () => (task ? tasks.filter((item) => item.parent_task_id === task.id && !item.deleted_at) : []),
    [tasks, task]
  );

  const relatedEntries = useMemo(
    () => (task ? timeEntries.filter((entry) => entry.task_id === task.id) : []),
    [timeEntries, task]
  );

  const relatedSchedules = useMemo(
    () => (task ? schedules.filter((schedule) => schedule.task_id === task.id) : []),
    [schedules, task]
  );

  const actualSeconds = useMemo(
    () => relatedEntries.reduce((sum, entry) => sum + entry.duration_seconds, 0),
    [relatedEntries]
  );

  const estimate = task ? estimationRatio(minutesToSeconds(task.estimated_minutes), actualSeconds) : null;

  if (!task) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>Task not found</SheetTitle>
            <SheetDescription>The task may have been removed.</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    );
  }

  const project = projects.find((item) => item.id === task.project_id) ?? null;
  const category = categories.find((item) => item.id === task.category_id) ?? null;
  const progressPercent =
    estimate && estimate.ratio !== null ? Math.min(100, Math.round(estimate.ratio * 100)) : null;

  const toggleStatus = async () => {
    setBusy(true);
    try {
      const next = task.status === "done" ? "todo" : "done";
      await updateTask(task.id, {
        status: next,
        completed_at: next === "done" ? new Date().toISOString() : null,
      });
      toast.success(next === "done" ? "Task completed" : "Task reopened");
    } catch (error) {
      toast.error("Could not update the task", { description: describeError(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
          <SheetHeader className="border-b p-5 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <TaskStatusBadge status={task.status} />
              <TaskPriorityBadge priority={task.priority} />
            </div>
            <SheetTitle className="mt-2 pr-6 text-left text-lg leading-snug">{task.title}</SheetTitle>
            <SheetDescription className="text-left">
              {task.description ? task.description : "No description provided."}
            </SheetDescription>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setTimerOpen(true)}>
                <Play className="size-4" />
                Start timer
              </Button>
              <Button size="sm" variant="outline" onClick={() => setScheduleOpen(true)}>
                <CalendarPlus className="size-4" />
                Schedule
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
                <Pencil className="size-4" />
                Edit
              </Button>
            </div>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="space-y-5 p-5">
              <section className="space-y-2">
                <SectionTitle>Details</SectionTitle>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <Meta label="Project" value={project?.name ?? "—"} />
                  <Meta
                    label="Category"
                    value={
                      category ? (
                        <span className="flex items-center gap-1.5">
                          <CategoryDot color={category.color} />
                          {category.name}
                        </span>
                      ) : (
                        "—"
                      )
                    }
                  />
                  <Meta
                    label="Due"
                    value={task.due_date ? formatDateTimeLabel(task.due_date, timezone) : "—"}
                  />
                  <Meta
                    label="Estimated"
                    value={task.estimated_minutes ? `${task.estimated_minutes} min` : "—"}
                  />
                  <Meta label="Tracked" value={formatDuration(actualSeconds)} />
                  <Meta label="Entries" value={String(relatedEntries.length)} />
                </dl>
              </section>

              {task.estimated_minutes ? (
                <section className="space-y-2">
                  <SectionTitle>Estimation accuracy</SectionTitle>
                  <Progress value={progressPercent ?? 0} />
                  <p className="text-xs text-muted-foreground">
                    {progressPercent === null
                      ? "No estimate to compare against."
                      : `${progressPercent}% of the estimate used (${secondsToMinutes(actualSeconds)} of ${task.estimated_minutes} min)`}
                    {estimate?.status === "over"
                      ? ` · ${formatDuration(estimate.over)} over`
                      : ""}
                  </p>
                </section>
              ) : null}

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <SectionTitle>Subtasks</SectionTitle>
                  <span className="text-xs text-muted-foreground">
                    {subtasks.filter((item) => item.status === "done").length}/{subtasks.length} done
                  </span>
                </div>
                {subtasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No subtasks yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {subtasks.map((subtask) => (
                      <li key={subtask.id} className="flex items-center gap-2 text-sm">
                        <span
                          className={
                            subtask.status === "done"
                              ? "text-muted-foreground line-through"
                              : undefined
                          }
                        >
                          {subtask.title}
                        </span>
                        <TaskStatusBadge status={subtask.status} className="ml-auto text-[10px]" />
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-2">
                <SectionTitle>Scheduled blocks</SectionTitle>
                {relatedSchedules.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Not scheduled yet.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm">
                    {relatedSchedules
                      .sort((a, b) => a.start_at.localeCompare(b.start_at))
                      .map((schedule: Schedule) => (
                        <li key={schedule.id} className="flex items-center justify-between gap-2">
                          <span className="truncate">{schedule.title}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {formatDateTimeLabel(schedule.start_at, timezone)}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              </section>

              <section className="space-y-2">
                <SectionTitle>Time entries</SectionTitle>
                {relatedEntries.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No time tracked against this task.</p>
                ) : (
                  <ul className="divide-y">
                    {relatedEntries
                      .slice()
                      .sort((a, b) => b.start_at.localeCompare(a.start_at))
                      .map((entry: TimeEntry) => (
                        <li key={entry.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                          <span className="truncate text-xs text-muted-foreground">
                            {formatDateTimeLabel(entry.start_at, timezone)}
                          </span>
                          <span className="shrink-0 tabular-nums">
                            {formatDuration(entry.duration_seconds)}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              </section>
            </div>
          </ScrollArea>

          <div className="flex items-center gap-2 border-t p-4">
            <Button size="sm" onClick={toggleStatus} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {task.status === "done" ? "Reopen task" : "Mark complete"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto text-destructive hover:text-destructive"
              onClick={() => setDeleteOpen(true)}
            >
              <Trash2 className="size-4" />
              Delete
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <TaskFormDialog open={editOpen} onOpenChange={setEditOpen} task={task} />
      <StartTimerDialog open={timerOpen} onOpenChange={setTimerOpen} initialTaskId={task.id} />
      <ScheduleDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        defaults={{
          title: task.title,
          task_id: task.id,
          schedule_type: "task",
          start_at: defaultWindowStart(timezone),
          end_at: defaultWindowEnd(timezone),
        }}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this task?</AlertDialogTitle>
            <AlertDialogDescription>
              The task is archived. Time entries and schedules already recorded against it are kept
              so your history and analytics stay accurate.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await deleteTask(task.id);
                  toast.success("Task deleted");
                  onOpenChange(false);
                } catch (error) {
                  toast.error("Could not delete the task", { description: describeError(error) });
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate">{value}</dd>
    </div>
  );
}

/** Next half-hour boundary, used as a sensible default schedule start. */
function nextHalfHour(): Date {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setMinutes(date.getMinutes() < 30 ? 30 : 60);
  return date;
}

function defaultWindowStart(timezone: string): string {
  return toLocalInputValue(nextHalfHour(), timezone);
}

function defaultWindowEnd(timezone: string): string {
  const start = nextHalfHour();
  start.setMinutes(start.getMinutes() + 60);
  return toLocalInputValue(start, timezone);
}
