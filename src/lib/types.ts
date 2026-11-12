/**
 * Domain types for TimeFlow.
 *
 * The shapes here mirror the PostgreSQL tables in
 * `supabase/migrations/20260101000000_init_timeflow.sql` one-to-one so that the
 * same objects flow through the Supabase adapter and the local adapter.
 *
 * All instants are ISO-8601 strings in UTC (e.g. `2026-11-11T03:20:00.000Z`).
 */

export type UUID = string;
export type ISODateTime = string;

/* -------------------------------------------------------------------------- */
/* Enums                                                                       */
/* -------------------------------------------------------------------------- */

export type TaskStatus = "todo" | "in_progress" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "urgent";
export type ScheduleType = "task" | "event";
export type TimeEntrySource = "timer" | "manual";
export type TimerStatus = "running" | "paused" | "stopped";

export const TASK_STATUSES: TaskStatus[] = ["todo", "in_progress", "done", "cancelled"];
export const TASK_PRIORITIES: TaskPriority[] = ["low", "medium", "high", "urgent"];
export const SCHEDULE_TYPES: ScheduleType[] = ["task", "event"];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  done: "Done",
  cancelled: "Cancelled",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

/* -------------------------------------------------------------------------- */
/* Entities                                                                    */
/* -------------------------------------------------------------------------- */

export interface Profile {
  id: UUID;
  display_name: string | null;
  timezone: string;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface Project {
  id: UUID;
  user_id: UUID;
  name: string;
  description: string | null;
  color: string;
  /** Optional category, shared with tasks and time entries. */
  category_id: UUID | null;
  /** Planned window; either side may be null when it is not decided yet. */
  start_date: ISODateTime | null;
  end_date: ISODateTime | null;
  /** Eisenhower axes: urgency and importance are tracked separately. */
  is_urgent: boolean;
  is_important: boolean;
  /** Hand-written estimate, in hours (fractions allowed). Task estimates are summed separately for comparison. */
  estimated_hours: number | null;
  /** Manual priority, lowest first. Drives the left-to-right lane order on the timeline. */
  sort_order: number;
  archived_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface Category {
  id: UUID;
  user_id: UUID;
  name: string;
  color: string;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface Task {
  id: UUID;
  user_id: UUID;
  project_id: UUID | null;
  category_id: UUID | null;
  parent_task_id: UUID | null;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: ISODateTime | null;
  estimated_minutes: number | null;
  sort_order: number;
  deleted_at: ISODateTime | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
  completed_at: ISODateTime | null;
}

export interface Schedule {
  id: UUID;
  user_id: UUID;
  task_id: UUID | null;
  /** Set when the block belongs to a project rather than a single task. */
  project_id: UUID | null;
  title: string;
  start_at: ISODateTime;
  end_at: ISODateTime;
  schedule_type: ScheduleType;
  description: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface TimeEntry {
  id: UUID;
  user_id: UUID;
  task_id: UUID | null;
  /** Set when the recorded time belongs to a project rather than a single task. */
  project_id: UUID | null;
  schedule_id: UUID | null;
  category_id: UUID | null;
  start_at: ISODateTime;
  end_at: ISODateTime;
  duration_seconds: number;
  source: TimeEntrySource;
  title: string | null;
  notes: string | null;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface TimerSession {
  id: UUID;
  user_id: UUID;
  task_id: UUID | null;
  /** Set when the timer is tracking a project rather than a single task. */
  project_id: UUID | null;
  status: TimerStatus;
  started_at: ISODateTime;
  paused_at: ISODateTime | null;
  accumulated_seconds: number;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface Tag {
  id: UUID;
  user_id: UUID;
  name: string;
  color: string;
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

export interface TaskTag {
  task_id: UUID;
  tag_id: UUID;
  user_id: UUID;
}

/* -------------------------------------------------------------------------- */
/* Write payloads (what the UI sends to the data layer)                        */
/* -------------------------------------------------------------------------- */

export type TaskInsert = Omit<
  Task,
  "id" | "user_id" | "created_at" | "updated_at" | "sort_order" | "deleted_at" | "completed_at"
> & {
  id?: UUID;
  sort_order?: number;
  deleted_at?: ISODateTime | null;
  completed_at?: ISODateTime | null;
};

export type TaskUpdate = Partial<
  Omit<Task, "id" | "user_id" | "created_at" | "updated_at">
>;

export type ProjectQuadrant = "do" | "plan" | "delegate" | "drop";

export const PROJECT_QUADRANT_LABELS: Record<ProjectQuadrant, string> = {
  do: "Urgent & important",
  plan: "Important, not urgent",
  delegate: "Urgent, not important",
  drop: "Neither",
};

/** Eisenhower quadrant an urgency/importance pair falls into. */
export function projectQuadrant(project: Pick<Project, "is_urgent" | "is_important">): ProjectQuadrant {
  if (project.is_important) return project.is_urgent ? "do" : "plan";
  return project.is_urgent ? "delegate" : "drop";
}

export type ProjectInsert = Pick<Project, "name"> &
  Partial<
    Pick<
      Project,
      | "description"
      | "color"
      | "category_id"
      | "id"
      | "archived_at"
      | "start_date"
      | "end_date"
      | "is_urgent"
      | "is_important"
      | "estimated_hours"
      | "sort_order"
    >
  >;
export type ProjectUpdate = Partial<
  Pick<
    Project,
    | "name"
    | "description"
    | "color"
    | "category_id"
    | "archived_at"
    | "start_date"
    | "end_date"
    | "is_urgent"
    | "is_important"
    | "estimated_hours"
    | "sort_order"
  >
>;

export type CategoryInsert = Pick<Category, "name"> & Partial<Pick<Category, "color" | "id">>;
export type CategoryUpdate = Partial<Pick<Category, "name" | "color">>;

export type ScheduleInsert = Pick<Schedule, "title" | "start_at" | "end_at"> &
  Partial<Pick<Schedule, "task_id" | "project_id" | "schedule_type" | "description" | "id">>;
export type ScheduleUpdate = Partial<
  Pick<
    Schedule,
    "title" | "start_at" | "end_at" | "task_id" | "project_id" | "schedule_type" | "description"
  >
>;

export type TimeEntryInsert = Pick<TimeEntry, "start_at" | "end_at"> &
  Partial<
    Pick<
      TimeEntry,
      | "task_id"
      | "project_id"
      | "schedule_id"
      | "category_id"
      | "source"
      | "title"
      | "notes"
      | "id"
    >
  > & {
    /** Optional override; otherwise derived from start_at / end_at. */
    duration_seconds?: number;
  };
export type TimeEntryUpdate = Partial<
  Pick<
    TimeEntry,
    | "task_id"
    | "project_id"
    | "schedule_id"
    | "category_id"
    | "start_at"
    | "end_at"
    | "duration_seconds"
    | "title"
    | "notes"
  >
>;

export type TagInsert = Pick<Tag, "name"> & Partial<Pick<Tag, "color" | "id">>;
export type TagUpdate = Partial<Pick<Tag, "name" | "color">>;

export type TimerSessionInsert = Pick<TimerSession, "task_id"> & Partial<Pick<TimerSession, "id">>;

/* -------------------------------------------------------------------------- */
/* Derived / view models                                                       */
/* -------------------------------------------------------------------------- */

/** A task enriched with aggregated actual time read from time entries. */
export interface TaskWithStats extends Task {
  actual_seconds: number;
  entry_count: number;
  subtask_count: number;
  subtasks_done_count: number;
}

/** A project enriched with the roll-up of the tasks inside it. */
export interface ProjectWithStats extends Project {
  task_count: number;
  open_task_count: number;
  done_task_count: number;
  /** Sum of `estimated_minutes` across the project's live tasks. */
  task_estimated_minutes: number;
  actual_seconds: number;
}

export interface UserSettings {
  timezone: string;
  displayName: string;
  weekStartsOn: 0 | 1;
  defaultCategoryId: UUID | null;
}

export const DEFAULT_CATEGORIES: Array<Pick<Category, "name" | "color">> = [
  { name: "Work", color: "#6366f1" },
  { name: "Learning", color: "#0ea5e9" },
  { name: "Personal", color: "#10b981" },
  { name: "Hobby", color: "#f59e0b" },
  { name: "Other", color: "#94a3b8" },
];
