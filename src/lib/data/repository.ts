/**
 * Storage abstraction.
 *
 * TimeFlow ships two interchangeable repositories behind one interface:
 *
 *  - `supabase` -- the production path (PostgreSQL + RLS + Supabase Auth).
 *  - `local`    -- a browser-persisted fallback so the product can be run and
 *                  exercised end-to-end before Supabase credentials exist.
 *
 * Business logic never talks to Supabase directly; it only depends on the
 * `Repository` contract below.
 */

import type {
  Category,
  CategoryInsert,
  CategoryUpdate,
  Profile,
  Project,
  ProjectInsert,
  ProjectUpdate,
  Schedule,
  ScheduleInsert,
  ScheduleUpdate,
  Tag,
  TagInsert,
  TagUpdate,
  Task,
  TaskInsert,
  TaskUpdate,
  TimeEntry,
  TimeEntryInsert,
  TimeEntryUpdate,
  TimerSession,
  UUID,
} from "@/lib/types";

export type StorageMode = "supabase" | "local";

export interface AppUser {
  id: UUID;
  email: string | null;
  displayName: string | null;
}

export interface RepositorySnapshot {
  profile: Profile;
  projects: Project[];
  categories: Category[];
  tasks: Task[];
  schedules: Schedule[];
  timeEntries: TimeEntry[];
  /** Every session that is still running or paused -- several may be open. */
  activeTimers: TimerSession[];
}

export interface StopTimerResult {
  session: TimerSession | null;
  entry: TimeEntry | null;
}

/**
 * Every write returns the persisted entity so callers can apply optimistic
 * updates and then reconcile with the authoritative row.
 */
export interface Repository {
  readonly mode: StorageMode;

  /* auth / identity ------------------------------------------------------- */
  getCurrentUser(): Promise<AppUser | null>;
  signIn(email: string, password: string): Promise<AppUser>;
  signUp(email: string, password: string, displayName: string): Promise<AppUser>;
  signOut(): Promise<void>;
  /** Emits the user id whenever the session changes (used to reset caches). */
  onAuthStateChange(callback: (user: AppUser | null) => void): () => void;

  /* profile --------------------------------------------------------------- */
  getProfile(): Promise<Profile>;
  updateProfile(patch: Partial<Pick<Profile, "display_name" | "timezone">>): Promise<Profile>;

  /* bulk read ------------------------------------------------------------- */
  loadSnapshot(): Promise<RepositorySnapshot>;

  /* projects -------------------------------------------------------------- */
  listProjects(): Promise<Project[]>;
  createProject(input: ProjectInsert): Promise<Project>;
  updateProject(id: UUID, patch: ProjectUpdate): Promise<Project>;
  deleteProject(id: UUID): Promise<void>;

  /* categories ------------------------------------------------------------ */
  listCategories(): Promise<Category[]>;
  createCategory(input: CategoryInsert): Promise<Category>;
  updateCategory(id: UUID, patch: CategoryUpdate): Promise<Category>;
  deleteCategory(id: UUID): Promise<void>;

  /* tasks ----------------------------------------------------------------- */
  listTasks(options?: { includeDeleted?: boolean }): Promise<Task[]>;
  createTask(input: TaskInsert): Promise<Task>;
  updateTask(id: UUID, patch: TaskUpdate): Promise<Task>;
  /** Soft delete: keeps historical schedules and time entries intact. */
  deleteTask(id: UUID): Promise<void>;

  /* schedules ------------------------------------------------------------- */
  listSchedules(): Promise<Schedule[]>;
  createSchedule(input: ScheduleInsert): Promise<Schedule>;
  updateSchedule(id: UUID, patch: ScheduleUpdate): Promise<Schedule>;
  deleteSchedule(id: UUID): Promise<void>;

  /* time entries ---------------------------------------------------------- */
  listTimeEntries(): Promise<TimeEntry[]>;
  createTimeEntry(input: TimeEntryInsert): Promise<TimeEntry>;
  updateTimeEntry(id: UUID, patch: TimeEntryUpdate): Promise<TimeEntry>;
  deleteTimeEntry(id: UUID): Promise<void>;

  /* timer ----------------------------------------------------------------- */
  /** Sessions that are still running or paused; a user may have several. */
  listActiveTimers(): Promise<TimerSession[]>;
  /**
   * Opens a session for a single task, or for a project when `projectId` is the
   * one given. Tracking the same thing twice returns the open session.
   */
  startTimer(taskId: UUID | null, projectId: UUID | null): Promise<TimerSession>;
  pauseTimer(id: UUID): Promise<TimerSession>;
  resumeTimer(id: UUID): Promise<TimerSession>;
  /** Stops one session and writes the resulting time entry (source: "timer"). */
  stopTimer(id: UUID): Promise<StopTimerResult>;
  /** Stops one session without recording any time. */
  discardTimer(id: UUID): Promise<void>;

  /* tags ------------------------------------------------------------------ */
  listTags(): Promise<Tag[]>;
  createTag(input: TagInsert): Promise<Tag>;
  updateTag(id: UUID, patch: TagUpdate): Promise<Tag>;
  deleteTag(id: UUID): Promise<void>;
}

export class RepositoryError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "RepositoryError";
  }
}

/** The seeded/single user id used by Local Mode. */
export const LOCAL_USER_ID = "00000000-0000-4000-8000-000000000001";
export const LOCAL_USER_EMAIL = "local@timeflow.app";

export function newId(): UUID {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
