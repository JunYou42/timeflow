"use client";

import { useMemo, useState } from "react";
import { Clock3, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/layout/stat-card";
import { EmptyState } from "@/components/layout/states";
import { PlanActualByCategory } from "@/components/analytics/plan-actual-by-category";
import { SchedulePool } from "@/components/calendar/schedule-pool";
import { TimeEntryDialog } from "@/components/time-entries/time-entry-dialog";
import type { TimeEntryDialogDefaults } from "@/components/time-entries/time-entry-dialog";
import { TimeLogsCalendar } from "@/components/time-entries/time-logs-calendar";
import { CategoryDot } from "@/components/tasks/task-meta";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { entriesWithinRange, buildCategoryPlanVsActual, sumSeconds } from "@/lib/stats";
import {
  dayKey,
  formatDateLabel,
  formatDuration,
  formatTimeLabel,
  parseLocalInputValue,
  resolveRange,
  toLocalInputValue,
  type RangePreset,
} from "@/lib/time";
import type { TimeEntry } from "@/lib/types";
import { describeError, useAppStore } from "@/store/use-app-store";

const ALL = "__all__";
const NONE = "__none__";

const VIEWS = [
  { id: "list", label: "List" },
  { id: "calendar", label: "Calendar" },
] as const;

type ViewMode = (typeof VIEWS)[number]["id"];

export function TimeLogsWorkspace() {
  const timezone = useUserTimezone();
  const timeEntries = useAppStore((state) => state.timeEntries);
  const schedules = useAppStore((state) => state.schedules);
  const tasks = useAppStore((state) => state.tasks);
  const projects = useAppStore((state) => state.projects);
  const categories = useAppStore((state) => state.categories);
  const deleteTimeEntry = useAppStore((state) => state.deleteTimeEntry);

  const [view, setView] = useState<ViewMode>("calendar");
  const [preset, setPreset] = useState<RangePreset>("week");
  const [categoryFilter, setCategoryFilter] = useState(ALL);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TimeEntry | null>(null);
  const [defaults, setDefaults] = useState<TimeEntryDialogDefaults | undefined>(undefined);
  const [pendingDelete, setPendingDelete] = useState<TimeEntry | null>(null);

  const presetRange = useMemo(() => resolveRange(preset, timezone), [preset, timezone]);
  // In calendar view the visible period of the grid wins, so the stats above
  // always describe what the user is looking at.
  const [calendarRange, setCalendarRange] = useState<{ start: Date; end: Date } | null>(null);
  const range = view === "calendar" && calendarRange ? calendarRange : presetRange;

  const taskTitle = useMemo(() => new Map(tasks.map((task) => [task.id, task.title])), [tasks]);
  const projectById = useMemo(
    () => new Map(projects.map((project) => [project.id, project])),
    [projects]
  );
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );
  // Categories carry no manual order, so the filter lists them by name.
  const categoryOptions = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    [categories]
  );

  const filtered = useMemo(() => {
    return entriesWithinRange(timeEntries, range)
      .filter((entry) => {
        if (categoryFilter === NONE) return entry.category_id === null;
        if (categoryFilter !== ALL) return entry.category_id === categoryFilter;
        return true;
      })
      .sort((a, b) => b.start_at.localeCompare(a.start_at));
  }, [timeEntries, range, categoryFilter]);

  const totalSeconds = useMemo(() => sumSeconds(filtered), [filtered]);

  // Period-level plan vs. actual, deliberately independent of the category
  // filter so it always answers "how did this period go overall".
  const categoryRows = useMemo(
    () => buildCategoryPlanVsActual(schedules, timeEntries, tasks, projects, categories, range),
    [schedules, timeEntries, tasks, projects, categories, range]
  );

  const grouped = useMemo(() => {
    const groups = new Map<string, TimeEntry[]>();
    for (const entry of filtered) {
      const key = dayKey(entry.start_at, timezone);
      const list = groups.get(key) ?? [];
      list.push(entry);
      groups.set(key, list);
    }
    return [...groups.entries()].sort(([a], [b]) => b.localeCompare(a));
  }, [filtered, timezone]);

  const timerCount = filtered.filter((entry) => entry.source === "timer").length;

  const openCreate = (start?: Date, end?: Date) => {
    setEditing(null);
    setDefaults(
      start && end
        ? { start_at: toLocalInputValue(start, timezone), end_at: toLocalInputValue(end, timezone) }
        : undefined
    );
    setDialogOpen(true);
  };

  const openEdit = (entry: TimeEntry) => {
    setEditing(entry);
    setDefaults(undefined);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Time Logs"
        description="Every recorded block of time, whether captured by the timer or entered by hand."
        actions={
          <Button size="sm" onClick={() => openCreate()}>
            <Plus className="size-4" />
            Add entry
          </Button>
        }
      />

      <PlanActualByCategory
        groups={categoryRows}
        rangeLabel={`${formatDateLabel(range.start, timezone)} → ${formatDateLabel(
          new Date(range.end.getTime() - 1),
          timezone
        )}`}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Total in range" value={formatDuration(totalSeconds)} icon={Clock3} />
        <StatCard label="Entries" value={String(filtered.length)} hint={`${timerCount} from timer`} />
        <StatCard
          label="Average per entry"
          value={filtered.length ? formatDuration(Math.round(totalSeconds / filtered.length)) : "—"}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-3">
        <div className="flex items-center gap-1 rounded-md border p-0.5">
          {VIEWS.map((item) => (
            <Button
              key={item.id}
              variant={view === item.id ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => setView(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>

        <Select
          value={preset}
          onValueChange={(value) => setPreset(value as RangePreset)}
          disabled={view === "calendar"}
        >
          <SelectTrigger className="h-9 w-auto min-w-[140px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This week</SelectItem>
            <SelectItem value="month">This month</SelectItem>
          </SelectContent>
        </Select>

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-9 w-auto min-w-[180px] text-xs">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            <SelectItem value={NONE}>No category</SelectItem>
            {categoryOptions.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                <CategoryDot color={category.color} className="mr-2 align-middle" />
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="ml-auto text-xs text-muted-foreground">
          {formatDateLabel(range.start, timezone)} → {formatDateLabel(new Date(range.end.getTime() - 1), timezone)}
        </span>
      </div>

      {view === "calendar" ? (
        <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
          <div className="self-start xl:sticky xl:top-20">
            <SchedulePool
              title="Drag to log"
              description="Drag a task or an ongoing project onto the grid to log the time you spent on it."
            />
          </div>
          <TimeLogsCalendar
            entries={filtered}
            onSelectEntry={openEdit}
            onCreateEntry={openCreate}
            onRangeChange={setCalendarRange}
          />
        </div>
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={Clock3}
          title="No time recorded in this range"
          description="Start the timer on the Overview page or add a manual entry."
          action={
            <Button size="sm" onClick={() => openCreate()}>
              <Plus className="size-4" />
              Add entry
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          {grouped.map(([day, entries]) => (
            <section key={day} className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {formatDateLabel(
                    parseLocalInputValue(`${day}T12:00`, timezone) ?? `${day}T12:00:00.000Z`,
                    timezone
                  )}
                </h3>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatDuration(sumSeconds(entries))}
                </span>
              </div>
              <ul className="divide-y rounded-lg border bg-background">
                {entries.map((entry) => {
                  const category = entry.category_id ? categoryById.get(entry.category_id) : undefined;
                  const project = entry.project_id ? projectById.get(entry.project_id) : undefined;
                  const label =
                    entry.title ??
                    project?.name ??
                    (entry.task_id ? taskTitle.get(entry.task_id) ?? "Untitled" : "Untracked");
                  return (
                    <li key={entry.id} className="flex items-center gap-3 p-3">
                      <div className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">
                        <div>{formatTimeLabel(entry.start_at, timezone)}</div>
                        <div>{formatTimeLabel(entry.end_at, timezone)}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{label}</p>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {project ? (
                            <span className="flex items-center gap-1">
                              <span
                                className="size-1.5 rounded-full"
                                style={{ backgroundColor: project.color }}
                              />
                              {project.name}
                            </span>
                          ) : entry.task_id ? (
                            <span>{taskTitle.get(entry.task_id)}</span>
                          ) : null}
                          {category ? (
                            <span className="flex items-center gap-1">
                              <CategoryDot color={category.color} />
                              {category.name}
                            </span>
                          ) : null}
                          <Badge variant="secondary" className="text-[10px]">
                            {entry.source === "timer" ? "Timer" : "Manual"}
                          </Badge>
                        </div>
                      </div>
                      <span className="shrink-0 text-sm font-medium tabular-nums">
                        {formatDuration(entry.duration_seconds)}
                      </span>
                      <div className="flex shrink-0 items-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label="Edit entry"
                          onClick={() => openEdit(entry)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 text-destructive hover:text-destructive"
                          aria-label="Delete entry"
                          onClick={() => setPendingDelete(entry)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <TimeEntryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        entry={editing}
        defaults={defaults}
      />

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => (open ? undefined : setPendingDelete(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this time entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `${formatDuration(pendingDelete.duration_seconds)} recorded on ${formatDateLabel(
                    pendingDelete.start_at,
                    timezone
                  )} will be removed. This cannot be undone.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!pendingDelete) return;
                try {
                  await deleteTimeEntry(pendingDelete.id);
                  toast.success("Time entry deleted");
                } catch (error) {
                  toast.error("Could not delete the entry", { description: describeError(error) });
                } finally {
                  setPendingDelete(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
