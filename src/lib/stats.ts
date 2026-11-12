/**
 * Pure business-logic helpers.
 *
 * Everything in this module is side-effect free so it can be unit tested
 * without a browser or a database. UI components and the data layer both
 * consume these functions.
 */

import {
  addDaysInTimezone,
  dayKey,
  durationBetween,
  enumerateDayKeys,
  startOfDayInTimezone,
  toDate,
  type DateRange,
} from "@/lib/time";
import { projectQuadrant } from "@/lib/types";
import type {
  Category,
  Project,
  ProjectQuadrant,
  ProjectWithStats,
  Schedule,
  Task,
  TaskStatus,
  TaskWithStats,
  TimeEntry,
  UUID,
} from "@/lib/types";

/* -------------------------------------------------------------------------- */
/* Generic aggregation                                                         */
/* -------------------------------------------------------------------------- */

export function sumSeconds(entries: Array<Pick<TimeEntry, "duration_seconds">>): number {
  return entries.reduce((total, entry) => total + (entry.duration_seconds || 0), 0);
}

/** Seconds of `entries` that fall inside the half-open `[start, end)` range. */
export function secondsWithinRange(entries: TimeEntry[], range: DateRange): number {
  let total = 0;
  for (const entry of entries) {
    const start = Math.max(toDate(entry.start_at).getTime(), range.start.getTime());
    const end = Math.min(toDate(entry.end_at).getTime(), range.end.getTime());
    if (end > start) total += Math.floor((end - start) / 1000);
  }
  return total;
}

export function entriesWithinRange(entries: TimeEntry[], range: DateRange): TimeEntry[] {
  return entries.filter((entry) => {
    const start = toDate(entry.start_at).getTime();
    const end = toDate(entry.end_at).getTime();
    return end > range.start.getTime() && start < range.end.getTime();
  });
}

export function schedulesWithinRange(schedules: Schedule[], range: DateRange): Schedule[] {
  return schedules.filter((schedule) => {
    const start = toDate(schedule.start_at).getTime();
    const end = toDate(schedule.end_at).getTime();
    return end > range.start.getTime() && start < range.end.getTime();
  });
}

/* -------------------------------------------------------------------------- */
/* Distribution / trends                                                       */
/* -------------------------------------------------------------------------- */

export interface CategorySlice {
  categoryId: UUID | "uncategorized";
  name: string;
  color: string;
  seconds: number;
  percentage: number;
}

/**
 * Split tracked seconds by category. Entries without a category land in the
 * synthetic "Uncategorized" slice so the chart always reconciles with totals.
 */
export function groupSecondsByCategory(
  entries: TimeEntry[],
  categories: Category[]
): CategorySlice[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const buckets = new Map<string, CategorySlice>();

  for (const entry of entries) {
    const key = entry.category_id && byId.has(entry.category_id) ? entry.category_id : "uncategorized";
    const existing = buckets.get(key);
    if (existing) {
      existing.seconds += entry.duration_seconds || 0;
      continue;
    }
    const category = byId.get(key);
    buckets.set(key, {
      categoryId: (category?.id ?? "uncategorized") as UUID | "uncategorized",
      name: category?.name ?? "Uncategorized",
      color: category?.color ?? "#cbd5e1",
      seconds: entry.duration_seconds || 0,
      percentage: 0,
    });
  }

  const total = [...buckets.values()].reduce((sum, slice) => sum + slice.seconds, 0);
  return [...buckets.values()]
    .map((slice) => ({
      ...slice,
      percentage: total > 0 ? Math.round((slice.seconds / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.seconds - a.seconds);
}

export interface ProjectTimeSlice {
  projectId: UUID;
  name: string;
  color: string;
  seconds: number;
  /** Share of the project time tracked in the period, as a percentage. */
  percentage: number;
}

/**
 * Split tracked seconds by project.
 *
 * Time reaches a project along two paths -- booked straight against the project
 * or against one of its tasks -- and both are folded into the same slice. Time
 * with no project behind it is skipped: the question here is "where did the
 * project time go", so unassigned hours would only dilute the shares.
 */
export function groupSecondsByProject(
  entries: TimeEntry[],
  tasks: Task[],
  projects: Project[]
): ProjectTimeSlice[] {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const projectByTask = new Map(tasks.map((task) => [task.id, task.project_id]));
  const buckets = new Map<UUID, ProjectTimeSlice>();

  for (const entry of entries) {
    const projectId =
      entry.project_id ?? (entry.task_id ? projectByTask.get(entry.task_id) ?? null : null);
    const project = projectId ? projectById.get(projectId) : undefined;
    if (!project) continue;

    const existing = buckets.get(project.id);
    if (existing) {
      existing.seconds += entry.duration_seconds || 0;
      continue;
    }
    buckets.set(project.id, {
      projectId: project.id,
      name: project.name,
      color: project.color,
      seconds: entry.duration_seconds || 0,
      percentage: 0,
    });
  }

  const total = [...buckets.values()].reduce((sum, slice) => sum + slice.seconds, 0);
  return [...buckets.values()]
    .map((slice) => ({
      ...slice,
      percentage: total > 0 ? Math.round((slice.seconds / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.seconds - a.seconds);
}

export interface DailyPoint {
  date: string;
  label: string;
  seconds: number;
  hours: number;
}

/** Actual tracked seconds per calendar day, zero-filled across the range. */
export function buildDailyTrend(
  entries: TimeEntry[],
  range: DateRange,
  timezone: string
): DailyPoint[] {
  const keys = enumerateDayKeys(range, timezone);
  const buckets = new Map<string, number>(keys.map((key) => [key, 0]));

  for (const entry of entries) {
    const key = dayKey(entry.start_at, timezone);
    if (!buckets.has(key)) buckets.set(key, 0);
    buckets.set(key, (buckets.get(key) ?? 0) + (entry.duration_seconds || 0));
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, seconds]) => ({
      date,
      label: date.slice(5),
      seconds,
      hours: Math.round((seconds / 3600) * 100) / 100,
    }));
}

export interface PlannedVsActualPoint {
  key: string;
  label: string;
  plannedSeconds: number;
  actualSeconds: number;
}

/**
 * Compare planned (schedule) duration against actual (time entry) duration,
 * bucketed per day in the user's timezone. Only the overlapping portion of a
 * record is attributed to each day, so a record spanning midnight is split
 * rather than inflating a single bucket.
 */
export function buildPlannedVsActual(
  schedules: Schedule[],
  entries: TimeEntry[],
  range: DateRange,
  timezone: string
): PlannedVsActualPoint[] {
  const buckets = enumerateDayKeys(range, timezone).map((key) => {
    const start = startOfDayInTimezone(`${key}T12:00:00.000Z`, timezone);
    return {
      key,
      label: key.slice(5),
      plannedSeconds: 0,
      actualSeconds: 0,
      start,
      end: addDaysInTimezone(start, 1, timezone),
    };
  });

  const accumulate = (
    records: Array<{ start_at: string; end_at: string }>,
    field: "plannedSeconds" | "actualSeconds"
  ) => {
    for (const record of records) {
      const recordStart = toDate(record.start_at).getTime();
      const recordEnd = toDate(record.end_at).getTime();
      if (recordEnd <= recordStart) continue;
      for (const bucket of buckets) {
        const start = Math.max(recordStart, bucket.start.getTime());
        const end = Math.min(recordEnd, bucket.end.getTime());
        if (end > start) bucket[field] += Math.floor((end - start) / 1000);
      }
    }
  };

  accumulate(schedules, "plannedSeconds");
  accumulate(entries, "actualSeconds");

  return buckets.map(({ key, label, plannedSeconds, actualSeconds }) => ({
    key,
    label,
    plannedSeconds,
    actualSeconds,
  }));
}

/* -------------------------------------------------------------------------- */
/* Per-category plan vs. actual                                                */
/* -------------------------------------------------------------------------- */

export interface CategoryPlanActualRow {
  /** `uncategorized` collects everything with no category, so the rows reconcile. */
  categoryId: UUID | "uncategorized";
  name: string;
  color: string;
  plannedSeconds: number;
  actualSeconds: number;
}

/**
 * Per-category planned vs. tracked time inside a period.
 *
 * A schedule's category is inherited from what it is attached to — its project
 * first, then its task — while a time entry carries its own `category_id`,
 * which the entry dialogs derive from the same task or project. Only the part
 * of a record that falls inside `range` is counted, so a block that straddles
 * the boundary is clipped rather than inflating one period.
 */
export function buildCategoryPlanVsActual(
  schedules: Schedule[],
  entries: TimeEntry[],
  tasks: Task[],
  projects: Project[],
  categories: Category[],
  range: DateRange
): CategoryPlanActualRow[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const projectsById = new Map(projects.map((project) => [project.id, project]));

  const buckets = new Map<string, CategoryPlanActualRow>();

  const bucketFor = (categoryId: UUID | null): CategoryPlanActualRow => {
    const key = categoryId && categoryById.has(categoryId) ? categoryId : "uncategorized";
    const existing = buckets.get(key);
    if (existing) return existing;
    const category = key === "uncategorized" ? undefined : categoryById.get(key);
    const row: CategoryPlanActualRow = {
      categoryId: (category?.id ?? "uncategorized") as UUID | "uncategorized",
      name: category?.name ?? "Uncategorized",
      color: category?.color ?? "#cbd5e1",
      plannedSeconds: 0,
      actualSeconds: 0,
    };
    buckets.set(key, row);
    return row;
  };

  const overlapSeconds = (start: string, end: string): number => {
    const from = Math.max(toDate(start).getTime(), range.start.getTime());
    const to = Math.min(toDate(end).getTime(), range.end.getTime());
    return to > from ? Math.floor((to - from) / 1000) : 0;
  };

  for (const schedule of schedules) {
    const project = schedule.project_id ? projectsById.get(schedule.project_id) : undefined;
    const task = schedule.task_id ? tasksById.get(schedule.task_id) : undefined;
    bucketFor(project?.category_id ?? task?.category_id ?? null).plannedSeconds += overlapSeconds(
      schedule.start_at,
      schedule.end_at
    );
  }

  for (const entry of entries) {
    bucketFor(entry.category_id).actualSeconds += overlapSeconds(entry.start_at, entry.end_at);
  }

  return [...buckets.values()]
    .filter((row) => row.plannedSeconds > 0 || row.actualSeconds > 0)
    .sort(
      (a, b) =>
        b.plannedSeconds - a.plannedSeconds ||
        b.actualSeconds - a.actualSeconds ||
        a.name.localeCompare(b.name)
    );
}

/* -------------------------------------------------------------------------- */
/* Task metrics                                                                */
/* -------------------------------------------------------------------------- */

export interface TaskCompletionStats {
  total: number;
  completed: number;
  pending: number;
  overdue: number;
  cancelled: number;
  completionRate: number;
}

export function buildTaskCompletionStats(
  tasks: Task[],
  now: Date = new Date()
): TaskCompletionStats {
  const active = tasks.filter((task) => !task.deleted_at);
  const completed = active.filter((task) => task.status === "done").length;
  const cancelled = active.filter((task) => task.status === "cancelled").length;
  const pending = active.filter(
    (task) => task.status === "todo" || task.status === "in_progress"
  ).length;
  const overdue = active.filter(
    (task) =>
      (task.status === "todo" || task.status === "in_progress") &&
      task.due_date !== null &&
      toDate(task.due_date) < now
  ).length;

  const considered = active.length - cancelled;
  return {
    total: active.length,
    completed,
    pending,
    overdue,
    cancelled,
    completionRate: considered > 0 ? Math.round((completed / considered) * 1000) / 10 : 0,
  };
}

/** Actual seconds recorded per task id. */
export function buildActualSecondsByTask(entries: TimeEntry[]): Map<UUID, number> {
  const map = new Map<UUID, number>();
  for (const entry of entries) {
    if (!entry.task_id) continue;
    map.set(entry.task_id, (map.get(entry.task_id) ?? 0) + (entry.duration_seconds || 0));
  }
  return map;
}

export function buildEntryCountByTask(entries: TimeEntry[]): Map<UUID, number> {
  const map = new Map<UUID, number>();
  for (const entry of entries) {
    if (!entry.task_id) continue;
    map.set(entry.task_id, (map.get(entry.task_id) ?? 0) + 1);
  }
  return map;
}

/** Enrich tasks with aggregated actual time and subtask counters. */
export function decorateTasksWithStats(tasks: Task[], entries: TimeEntry[]): TaskWithStats[] {
  const actual = buildActualSecondsByTask(entries);
  const counts = buildEntryCountByTask(entries);
  const children = new Map<UUID, Task[]>();
  for (const task of tasks) {
    if (!task.parent_task_id) continue;
    const list = children.get(task.parent_task_id) ?? [];
    list.push(task);
    children.set(task.parent_task_id, list);
  }

  return tasks.map((task) => {
    const subtasks = children.get(task.id) ?? [];
    return {
      ...task,
      actual_seconds: actual.get(task.id) ?? 0,
      entry_count: counts.get(task.id) ?? 0,
      subtask_count: subtasks.length,
      subtasks_done_count: subtasks.filter((subtask) => subtask.status === "done").length,
    };
  });
}

/**
 * Estimation Ratio = Actual Time / Estimated Time.
 *
 * Returns `null` when the estimate is missing or zero, because an infinite
 * ratio is not a useful planning signal. `over` reports how far past the
 * estimate the task ran (0 when on or under budget).
 */
export function estimationRatio(
  estimatedSeconds: number | null | undefined,
  actualSeconds: number
): { ratio: number | null; over: number; status: "under" | "on" | "over" | "unknown" } {
  if (!estimatedSeconds || estimatedSeconds <= 0) {
    return { ratio: null, over: 0, status: "unknown" };
  }
  const ratio = Math.round((actualSeconds / estimatedSeconds) * 1000) / 1000;
  let status: "under" | "on" | "over" = "on";
  if (ratio > 1.05) status = "over";
  else if (ratio < 0.95) status = "under";
  return { ratio, over: Math.max(0, actualSeconds - estimatedSeconds), status };
}

export interface CategoryAccuracyRow {
  categoryId: UUID | "uncategorized";
  name: string;
  color: string;
  estimatedSeconds: number;
  actualSeconds: number;
  ratio: number | null;
}

/** Estimation ratio aggregated per category (estimates come from tasks). */
export function buildCategoryAccuracy(
  tasks: Task[],
  entries: TimeEntry[],
  categories: Category[]
): CategoryAccuracyRow[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const rows = new Map<string, CategoryAccuracyRow>();

  const ensure = (categoryId: UUID | null): CategoryAccuracyRow => {
    const key = categoryId && byId.has(categoryId) ? categoryId : "uncategorized";
    const existing = rows.get(key);
    if (existing) return existing;
    const category = byId.get(key);
    const row: CategoryAccuracyRow = {
      categoryId: (category?.id ?? "uncategorized") as UUID | "uncategorized",
      name: category?.name ?? "Uncategorized",
      color: category?.color ?? "#cbd5e1",
      estimatedSeconds: 0,
      actualSeconds: 0,
      ratio: null,
    };
    rows.set(key, row);
    return row;
  };

  for (const task of tasks) {
    if (task.deleted_at) continue;
    ensure(task.category_id).estimatedSeconds += Math.max(0, (task.estimated_minutes ?? 0) * 60);
  }

  for (const entry of entries) {
    const task = entry.task_id ? tasks.find((item) => item.id === entry.task_id) : undefined;
    const categoryId = entry.category_id ?? task?.category_id ?? null;
    ensure(categoryId).actualSeconds += entry.duration_seconds || 0;
  }

  return [...rows.values()]
    .map((row) => ({
      ...row,
      ratio:
        row.estimatedSeconds > 0
          ? Math.round((row.actualSeconds / row.estimatedSeconds) * 1000) / 1000
          : null,
    }))
    .sort((a, b) => b.actualSeconds - a.actualSeconds);
}

export interface TaskAccuracyRow {
  taskId: UUID;
  title: string;
  estimatedSeconds: number;
  actualSeconds: number;
  ratio: number | null;
  status: "under" | "on" | "over" | "unknown";
}

export function buildTaskAccuracy(tasks: Task[], entries: TimeEntry[]): TaskAccuracyRow[] {
  const actual = buildActualSecondsByTask(entries);
  return tasks
    .filter((task) => !task.deleted_at && task.parent_task_id === null)
    .map((task) => {
      const estimatedSeconds = Math.max(0, (task.estimated_minutes ?? 0) * 60);
      const actualSeconds = actual.get(task.id) ?? 0;
      const { ratio, status } = estimationRatio(estimatedSeconds, actualSeconds);
      return { taskId: task.id, title: task.title, estimatedSeconds, actualSeconds, ratio, status };
    })
    .filter((row) => row.estimatedSeconds > 0 || row.actualSeconds > 0)
    .sort((a, b) => b.actualSeconds - a.actualSeconds);
}

export interface ProjectEstimateRow {
  projectId: UUID;
  name: string;
  color: string;
  /** Hand-written estimate in seconds, or null when the project has none. */
  estimatedSeconds: number | null;
  actualSeconds: number;
  ratio: number | null;
  status: "under" | "on" | "over" | "unknown";
}

/**
 * Estimate versus tracked time, one row per project.
 *
 * The estimate is the figure typed into the project itself; task estimates are
 * a separate signal and stay on the analytics page. Tracked time covers the
 * whole project -- booked straight against it or against one of its tasks -- so
 * both sides of the comparison span the same ground.
 *
 * Projects with neither an estimate nor tracked time are dropped: an empty row
 * would only pad the list. Only projects that are under way right now make it
 * in -- one that has ended has nothing left to plan, one that has not started
 * yet is not today's problem, and one with no end date has no finish line for
 * the estimate to aim at.
 */
export function buildProjectEstimateAccuracy(
  projects: Project[],
  tasks: Task[],
  entries: TimeEntry[],
  now: Date = new Date()
): ProjectEstimateRow[] {
  const projectByTask = new Map(tasks.map((task) => [task.id, task.project_id]));
  const actualByProject = new Map<UUID, number>();

  for (const entry of entries) {
    // An entry that names a task is attributed through the task even when it
    // also carries a project, so nothing is counted twice.
    const projectId = entry.task_id ? projectByTask.get(entry.task_id) ?? null : entry.project_id;
    if (!projectId) continue;
    actualByProject.set(
      projectId,
      (actualByProject.get(projectId) ?? 0) + (entry.duration_seconds || 0)
    );
  }

  const cutoff = now.getTime();

  return projects
    .filter((project) => {
      // Only the projects that are under way right now: one that has finished
      // has nothing left to plan, and one that has not started is not this
      // month's problem. A missing start date means it is already running.
      if (project.end_date === null) return false;
      if (new Date(project.end_date).getTime() <= cutoff) return false;
      return project.start_date === null || new Date(project.start_date).getTime() <= cutoff;
    })
    .map((project) => {
      const estimatedSeconds =
        project.estimated_hours === null
          ? null
          : Math.max(0, Math.round(project.estimated_hours * 3600));
      const actualSeconds = actualByProject.get(project.id) ?? 0;
      const { ratio, status } = estimationRatio(estimatedSeconds, actualSeconds);
      return {
        projectId: project.id,
        name: project.name,
        color: project.color,
        estimatedSeconds,
        actualSeconds,
        ratio,
        status,
      };
    })
    .filter((row) => row.estimatedSeconds !== null || row.actualSeconds > 0)
    .sort(
      (a, b) =>
        (b.estimatedSeconds ?? 0) - (a.estimatedSeconds ?? 0) || b.actualSeconds - a.actualSeconds
    );
}

/* -------------------------------------------------------------------------- */
/* Project roll-up                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Roll the tasks inside each project up into the project.
 *
 * Only live tasks (not deleted, not cancelled) count, so the numbers agree with
 * `buildTaskCompletionStats`. Tracked time is attributed through the task, so
 * time logged against a project without a task is not counted here.
 */
export function decorateProjectsWithStats(
  projects: Project[],
  tasks: Task[],
  entries: TimeEntry[]
): ProjectWithStats[] {
  const byProject = new Map<UUID, Task[]>();
  for (const task of tasks) {
    if (!task.project_id || task.deleted_at || task.status === "cancelled") continue;
    const list = byProject.get(task.project_id) ?? [];
    list.push(task);
    byProject.set(task.project_id, list);
  }

  const actualByTask = buildActualSecondsByTask(entries);
  // Entries tracked against the project itself, rather than against one of its
  // tasks. Entries that name both are left to the task side, so nothing is
  // counted twice.
  const actualByProject = new Map<UUID, number>();
  for (const entry of entries) {
    if (!entry.project_id || entry.task_id) continue;
    actualByProject.set(
      entry.project_id,
      (actualByProject.get(entry.project_id) ?? 0) + (entry.duration_seconds || 0)
    );
  }

  return projects.map((project) => {
    const owned = byProject.get(project.id) ?? [];
    return {
      ...project,
      task_count: owned.length,
      open_task_count: owned.filter((task) => task.status !== "done").length,
      done_task_count: owned.filter((task) => task.status === "done").length,
      task_estimated_minutes: owned.reduce(
        (total, task) => total + (task.estimated_minutes ?? 0),
        0
      ),
      actual_seconds:
        owned.reduce((total, task) => total + (actualByTask.get(task.id) ?? 0), 0) +
        (actualByProject.get(project.id) ?? 0),
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Project timeline                                                            */
/* -------------------------------------------------------------------------- */

const DAY_MS = 24 * 60 * 60 * 1000;
/** Keeps the first and last bar away from the edge of the scroll area. */
const TIMELINE_PADDING_DAYS = 3;

export interface ProjectTimelineItem {
  project: ProjectWithStats;
  quadrant: ProjectQuadrant;
  /** Effective window, in epoch milliseconds, used for layout. */
  startMs: number;
  endMs: number;
  /** Position and length relative to the range start. */
  offsetMs: number;
  durationMs: number;
  /** Horizontal slot inside the cluster, and how many slots that cluster needs. */
  lane: number;
  laneCount: number;
  /** Neither bound is set, so the bar is pinned to today as a placeholder. */
  isUnscheduled: boolean;
}

/** Effective window of a project; undated ones are pinned to `now`. */
function projectWindow(
  project: Pick<Project, "start_date" | "end_date">,
  now: Date
): { startMs: number; endMs: number; isUnscheduled: boolean } {
  if (!project.start_date && !project.end_date) {
    const anchor = now.getTime();
    return { startMs: anchor, endMs: anchor + DAY_MS, isUnscheduled: true };
  }

  const startMs = toDate(project.start_date ?? project.end_date ?? now).getTime();
  const endMs = toDate(project.end_date ?? project.start_date ?? now).getTime();
  // Half-open windows: a bar must have some height, so collapse to one day
  // rather than rendering a zero-height rectangle.
  return {
    startMs,
    endMs: endMs > startMs ? endMs : startMs + DAY_MS,
    isUnscheduled: false,
  };
}

/**
 * Vertical extent of the timeline: the span of every project window, padded to
 * whole days in the user's timezone. Undated projects pin to today, which keeps
 * an otherwise empty board anchored somewhere sensible.
 */
export function projectTimelineRange(
  projects: Array<Pick<Project, "start_date" | "end_date">>,
  timezone: string,
  now: Date = new Date()
): DateRange {
  const anchor = startOfDayInTimezone(now, timezone);

  if (projects.length === 0) {
    return {
      start: addDaysInTimezone(anchor, -7, timezone),
      end: addDaysInTimezone(anchor, 8, timezone),
    };
  }

  const windows = projects.map((project) => projectWindow(project, now));
  const first = Math.min(...windows.map((window) => window.startMs));
  const last = Math.max(...windows.map((window) => window.endMs));

  return {
    start: addDaysInTimezone(
      startOfDayInTimezone(new Date(first), timezone),
      -TIMELINE_PADDING_DAYS,
      timezone
    ),
    end: addDaysInTimezone(
      startOfDayInTimezone(new Date(last), timezone),
      TIMELINE_PADDING_DAYS + 1,
      timezone
    ),
  };
}

/**
 * Position projects on a vertical timeline and assign each one a horizontal
 * lane so that overlapping windows never cover each other.
 *
 * Lanes are handed out in priority order (`sort_order`), each project taking the
 * left-most lane that is still free for its window. That makes the horizontal
 * position express priority, which is what the sideways drag edits. Because
 * every lane is checked against *all* of its intervals rather than just the last
 * one, the result is collision-free even though the input is no longer sorted by
 * start time.
 */
export function buildProjectTimeline(
  projects: ProjectWithStats[],
  range: DateRange,
  now: Date = new Date()
): ProjectTimelineItem[] {
  const rangeStart = range.start.getTime();

  const items: ProjectTimelineItem[] = projects
    .map((project) => {
      const window = projectWindow(project, now);
      return {
        project,
        quadrant: projectQuadrant(project),
        startMs: window.startMs,
        endMs: window.endMs,
        offsetMs: window.startMs - rangeStart,
        durationMs: window.endMs - window.startMs,
        lane: 0,
        laneCount: 1,
        isUnscheduled: window.isUnscheduled,
      };
    })
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);

  const laneIntervals: Array<Array<{ startMs: number; endMs: number }>> = [];
  const byPriority = [...items].sort(
    (a, b) =>
      a.project.sort_order - b.project.sort_order || a.startMs - b.startMs || a.endMs - b.endMs
  );

  for (const item of byPriority) {
    let lane = laneIntervals.findIndex((intervals) =>
      intervals.every((slot) => slot.endMs <= item.startMs || slot.startMs >= item.endMs)
    );
    if (lane === -1) {
      lane = laneIntervals.length;
      laneIntervals.push([]);
    }
    laneIntervals[lane].push({ startMs: item.startMs, endMs: item.endMs });
    item.lane = lane;
  }

  // Bars that overlap, directly or transitively, share a lane count so they can
  // be sized against each other. Independent clusters keep the full width.
  let index = 0;
  while (index < items.length) {
    let cursor = index;
    let maxLane = -1;
    let clusterEnd = items[index].endMs;
    while (cursor < items.length && items[cursor].startMs < clusterEnd) {
      maxLane = Math.max(maxLane, items[cursor].lane);
      clusterEnd = Math.max(clusterEnd, items[cursor].endMs);
      cursor += 1;
    }
    for (let item = index; item < cursor; item += 1) items[item].laneCount = maxLane + 1;
    index = cursor;
  }

  return items;
}

export interface ProjectOrderPatch {
  id: UUID;
  sort_order: number;
}

/** Every bar that overlaps `seed`, directly or transitively. */
function overlappingCluster(
  items: ProjectTimelineItem[],
  seed: ProjectTimelineItem
): ProjectTimelineItem[] {
  const cluster = [seed];
  let grew = true;
  while (grew) {
    grew = false;
    for (const item of items) {
      if (cluster.includes(item)) continue;
      if (cluster.some((member) => member.startMs < item.endMs && item.startMs < member.endMs)) {
        cluster.push(item);
        grew = true;
      }
    }
  }
  return cluster;
}

/**
 * Priority values that move `projectId` `laneShift` places through the bars it
 * shares a lane group with.
 *
 * The existing order values are permuted rather than renumbered, so priorities
 * stay unique across the whole board. Returns an empty array when the drag
 * cannot change anything — no shift, or a project sitting alone.
 */
export function planProjectReorder(
  items: ProjectTimelineItem[],
  projectId: UUID,
  laneShift: number
): ProjectOrderPatch[] {
  if (laneShift === 0) return [];

  const target = items.find((item) => item.project.id === projectId);
  if (!target || target.laneCount <= 1) return [];

  const visual = [...overlappingCluster(items, target)].sort(
    (a, b) =>
      a.lane - b.lane ||
      a.project.sort_order - b.project.sort_order ||
      a.startMs - b.startMs ||
      a.endMs - b.endMs
  );

  const from = visual.findIndex((item) => item.project.id === projectId);
  const to = Math.max(0, Math.min(visual.length - 1, from + laneShift));
  if (from === to) return [];

  const [moved] = visual.splice(from, 1);
  visual.splice(to, 0, moved);

  const orders = visual.map((item) => item.project.sort_order).sort((a, b) => a - b);
  const patches: ProjectOrderPatch[] = [];
  visual.forEach((item, index) => {
    if (item.project.sort_order !== orders[index]) {
      patches.push({ id: item.project.id, sort_order: orders[index] });
    }
  });
  return patches;
}

/**
 * Priority values that lift `ordered[fromIndex]` to `toIndex` in a list already
 * sorted by priority.
 *
 * Unlike `planProjectReorder`, which permutes the values of one overlapping
 * cluster, this renumbers the whole list from 0. That is what a settings-style
 * list wants: it shows every project, so the visible order and the stored order
 * should be the same dense sequence. Rows whose value would not change are left
 * out of the patch set.
 */
export function planProjectMove(
  ordered: Project[],
  fromIndex: number,
  toIndex: number
): ProjectOrderPatch[] {
  if (fromIndex === toIndex) return [];

  const next = [...ordered];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return [];
  next.splice(toIndex, 0, moved);

  const patches: ProjectOrderPatch[] = [];
  next.forEach((project, index) => {
    if (project.sort_order !== index) patches.push({ id: project.id, sort_order: index });
  });
  return patches;
}

/* -------------------------------------------------------------------------- */
/* Scheduling integrity                                                        */
/* -------------------------------------------------------------------------- */

export interface ScheduleLike {
  id?: string;
  start_at: string;
  end_at: string;
}

/** Schedules that overlap the candidate half-open interval. */
export function findOverlappingSchedules<T extends ScheduleLike>(
  candidate: { start_at: string; end_at: string; id?: string },
  schedules: T[]
): T[] {
  const start = toDate(candidate.start_at).getTime();
  const end = toDate(candidate.end_at).getTime();
  return schedules.filter((schedule) => {
    if (candidate.id && schedule.id === candidate.id) return false;
    const scheduleStart = toDate(schedule.start_at).getTime();
    const scheduleEnd = toDate(schedule.end_at).getTime();
    return scheduleStart < end && scheduleEnd > start;
  });
}

/* -------------------------------------------------------------------------- */
/* Timer guard                                                                 */
/* -------------------------------------------------------------------------- */

/** True when a session blocks starting a brand new timer for the same user. */
export function isTimerBlocking(
  session: { status: string; task_id: UUID | null } | null | undefined,
  nextTaskId: UUID | null
): boolean {
  if (!session) return false;
  if (session.status !== "running" && session.status !== "paused") return false;
  return session.task_id !== nextTaskId;
}

export const STATUS_ORDER: TaskStatus[] = ["todo", "in_progress", "done", "cancelled"];

export { durationBetween };
