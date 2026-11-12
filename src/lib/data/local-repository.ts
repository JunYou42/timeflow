/**
 * Local Mode repository.
 *
 * Persists the whole dataset in `localStorage` under a single key. It is used
 * when Supabase credentials are absent so that the application remains fully
 * functional (and testable) without a database.
 *
 * This is deliberately *not* a fake: every write is persisted and survives
 * reloads, and the same business rules (parallel timers, soft deletion,
 * derived durations) are enforced here as in the SQL schema.
 */

import {
  DEFAULT_CATEGORIES,
  type Category,
  type CategoryInsert,
  type CategoryUpdate,
  type Profile,
  type Project,
  type ProjectInsert,
  type ProjectUpdate,
  type Schedule,
  type ScheduleInsert,
  type ScheduleUpdate,
  type Tag,
  type TagInsert,
  type TagUpdate,
  type Task,
  type TaskInsert,
  type TaskUpdate,
  type TimeEntry,
  type TimeEntryInsert,
  type TimeEntryUpdate,
  type TimerSession,
  type UUID,
} from "@/lib/types";
import { computeTimerElapsedSeconds, durationBetween, nowIso, toIso } from "@/lib/time";
import {
  LOCAL_USER_EMAIL,
  LOCAL_USER_ID,
  newId,
  RepositoryError,
  type AppUser,
  type Repository,
  type RepositorySnapshot,
  type StopTimerResult,
} from "@/lib/data/repository";
import { buildLocalSeed, type LocalSeed } from "@/lib/data/local-seed";

const STORAGE_KEY = "timeflow:local:v1";

interface LocalDatabase extends LocalSeed {
  version: 1;
}

function emptyDatabase(): LocalDatabase {
  const now = nowIso();
  return {
    version: 1,
    profile: {
      id: LOCAL_USER_ID,
      display_name: "Local User",
      timezone: process.env.NEXT_PUBLIC_DEFAULT_TIMEZONE || "Asia/Shanghai",
      created_at: now,
      updated_at: now,
    },
    projects: [],
    categories: DEFAULT_CATEGORIES.map((category) => ({
      id: newId(),
      user_id: LOCAL_USER_ID,
      name: category.name,
      color: category.color,
      created_at: now,
      updated_at: now,
    })),
    tasks: [],
    schedules: [],
    timeEntries: [],
    timerSessions: [],
    tags: [],
  };
}

export class LocalRepository implements Repository {
  readonly mode = "local" as const;

  private cache: LocalDatabase | null = null;
  private listeners = new Set<(user: AppUser | null) => void>();

  /* ------------------------------------------------------------------ */
  /* storage plumbing                                                    */
  /* ------------------------------------------------------------------ */

  private read(): LocalDatabase {
    if (this.cache) return this.cache;
    const fallback = emptyDatabase();
    const seeded = (): LocalDatabase => ({
      version: 1,
      ...buildLocalSeed(fallback, LOCAL_USER_ID),
    });
    if (typeof window === "undefined") {
      this.cache = seeded();
      return this.cache;
    }
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        const database = seeded();
        this.write(database);
        return database;
      }
      const parsed = JSON.parse(raw) as Partial<LocalDatabase>;
      this.cache = { ...fallback, ...parsed, version: 1 };
    } catch (error) {
      // Corrupted payload: start clean rather than bricking the app.
      const database = seeded();
      this.write(database);
      void error;
    }
    return this.cache ?? seeded();
  }

  private write(database: LocalDatabase) {
    this.cache = database;
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(database));
    } catch {
      // Quota exceeded -- keep the in-memory copy usable.
    }
  }

  private mutate<T>(mutator: (database: LocalDatabase) => T): T {
    const database = this.read();
    const result = mutator(database);
    this.write({ ...database });
    return result;
  }

  /** Exposed for the Settings page ("reset local data"). */
  resetLocalData(): void {
    this.write({ version: 1, ...buildLocalSeed(emptyDatabase(), LOCAL_USER_ID) });
  }

  getSeedSnapshot(): LocalDatabase {
    return this.read();
  }

  /* ------------------------------------------------------------------ */
  /* auth / identity                                                     */
  /* ------------------------------------------------------------------ */

  private user(): AppUser {
    return { id: LOCAL_USER_ID, email: LOCAL_USER_EMAIL, displayName: "Local User" };
  }

  async getCurrentUser(): Promise<AppUser | null> {
    return this.user();
  }

  async signIn(): Promise<AppUser> {
    return this.user();
  }

  async signUp(): Promise<AppUser> {
    return this.user();
  }

  async signOut(): Promise<void> {
    // Local Mode has no session to destroy.
  }

  onAuthStateChange(callback: (user: AppUser | null) => void): () => void {
    this.listeners.add(callback);
    callback(this.user());
    return () => this.listeners.delete(callback);
  }

  /* ------------------------------------------------------------------ */
  /* profile                                                             */
  /* ------------------------------------------------------------------ */

  async getProfile(): Promise<Profile> {
    return this.read().profile;
  }

  async updateProfile(patch: Partial<Pick<Profile, "display_name" | "timezone">>): Promise<Profile> {
    return this.mutate((database) => {
      database.profile = { ...database.profile, ...patch, updated_at: nowIso() };
      return database.profile;
    });
  }

  /* ------------------------------------------------------------------ */
  /* bulk read                                                           */
  /* ------------------------------------------------------------------ */

  async loadSnapshot(): Promise<RepositorySnapshot> {
    const database = this.read();
    return {
      profile: database.profile,
      projects: database.projects.filter((project) => !project.archived_at),
      categories: database.categories,
      tasks: database.tasks,
      schedules: database.schedules,
      timeEntries: database.timeEntries,
      activeTimers: this.activeTimersOf(database),
    };
  }

  /* ------------------------------------------------------------------ */
  /* projects                                                            */
  /* ------------------------------------------------------------------ */

  async listProjects(): Promise<Project[]> {
    return this.read().projects.filter((project) => !project.archived_at);
  }

  async createProject(input: ProjectInsert): Promise<Project> {
    return this.mutate((database) => {
      const timestamp = nowIso();
      const project: Project = {
        id: input.id ?? newId(),
        user_id: LOCAL_USER_ID,
        name: input.name,
        description: input.description ?? null,
        color: input.color ?? "#6366f1",
        category_id: input.category_id ?? null,
        start_date: input.start_date ?? null,
        end_date: input.end_date ?? null,
        is_urgent: input.is_urgent ?? false,
        is_important: input.is_important ?? false,
        estimated_hours: input.estimated_hours ?? null,
        sort_order:
          input.sort_order ??
          database.projects.reduce((max, project) => Math.max(max, project.sort_order), -1) + 1,
        archived_at: input.archived_at ?? null,
        created_at: timestamp,
        updated_at: timestamp,
      };
      database.projects = [project, ...database.projects];
      return project;
    });
  }

  async updateProject(id: UUID, patch: ProjectUpdate): Promise<Project> {
    return this.mutate((database) => {
      const index = database.projects.findIndex((project) => project.id === id);
      if (index < 0) throw new RepositoryError("Project not found");
      const updated = { ...database.projects[index], ...patch, updated_at: nowIso() };
      database.projects[index] = updated;
      return updated;
    });
  }

  async deleteProject(id: UUID): Promise<void> {
    this.mutate((database) => {
      // Tasks and schedules keep their history; they simply lose the project
      // association, mirroring the foreign key's `on delete set null`.
      database.projects = database.projects.filter((project) => project.id !== id);
      database.tasks = database.tasks.map((task) =>
        task.project_id === id ? { ...task, project_id: null, updated_at: nowIso() } : task
      );
      database.schedules = database.schedules.map((schedule) =>
        schedule.project_id === id
          ? { ...schedule, project_id: null, updated_at: nowIso() }
          : schedule
      );
      database.timeEntries = database.timeEntries.map((entry) =>
        entry.project_id === id ? { ...entry, project_id: null, updated_at: nowIso() } : entry
      );
    });
  }

  /* ------------------------------------------------------------------ */
  /* categories                                                          */
  /* ------------------------------------------------------------------ */

  async listCategories(): Promise<Category[]> {
    return this.read().categories;
  }

  async createCategory(input: CategoryInsert): Promise<Category> {
    return this.mutate((database) => {
      const timestamp = nowIso();
      const category: Category = {
        id: input.id ?? newId(),
        user_id: LOCAL_USER_ID,
        name: input.name,
        color: input.color ?? "#0ea5e9",
        created_at: timestamp,
        updated_at: timestamp,
      };
      database.categories = [...database.categories, category];
      return category;
    });
  }

  async updateCategory(id: UUID, patch: CategoryUpdate): Promise<Category> {
    return this.mutate((database) => {
      const index = database.categories.findIndex((category) => category.id === id);
      if (index < 0) throw new RepositoryError("Category not found");
      const updated = { ...database.categories[index], ...patch, updated_at: nowIso() };
      database.categories[index] = updated;
      return updated;
    });
  }

  async deleteCategory(id: UUID): Promise<void> {
    this.mutate((database) => {
      database.categories = database.categories.filter((category) => category.id !== id);
      database.tasks = database.tasks.map((task) =>
        task.category_id === id ? { ...task, category_id: null, updated_at: nowIso() } : task
      );
      database.timeEntries = database.timeEntries.map((entry) =>
        entry.category_id === id ? { ...entry, category_id: null, updated_at: nowIso() } : entry
      );
      database.projects = database.projects.map((project) =>
        project.category_id === id
          ? { ...project, category_id: null, updated_at: nowIso() }
          : project
      );
    });
  }

  /* ------------------------------------------------------------------ */
  /* tasks                                                               */
  /* ------------------------------------------------------------------ */

  async listTasks(options?: { includeDeleted?: boolean }): Promise<Task[]> {
    const { tasks } = this.read();
    return options?.includeDeleted ? tasks : tasks.filter((task) => !task.deleted_at);
  }

  async createTask(input: TaskInsert): Promise<Task> {
    return this.mutate((database) => {
      const timestamp = nowIso();
      const task: Task = {
        id: input.id ?? newId(),
        user_id: LOCAL_USER_ID,
        project_id: input.project_id ?? null,
        category_id: input.category_id ?? null,
        parent_task_id: input.parent_task_id ?? null,
        title: input.title,
        description: input.description ?? null,
        status: input.status ?? "todo",
        priority: input.priority ?? "medium",
        due_date: input.due_date ?? null,
        estimated_minutes: input.estimated_minutes ?? null,
        sort_order: input.sort_order ?? database.tasks.length,
        deleted_at: input.deleted_at ?? null,
        created_at: timestamp,
        updated_at: timestamp,
        completed_at: input.completed_at ?? (input.status === "done" ? timestamp : null),
      };
      database.tasks = [task, ...database.tasks];
      return task;
    });
  }

  async updateTask(id: UUID, patch: TaskUpdate): Promise<Task> {
    return this.mutate((database) => {
      const index = database.tasks.findIndex((task) => task.id === id);
      if (index < 0) throw new RepositoryError("Task not found");
      const previous = database.tasks[index];
      const nextStatus = patch.status ?? previous.status;
      const updated: Task = {
        ...previous,
        ...patch,
        completed_at:
          nextStatus === "done"
            ? patch.completed_at ?? previous.completed_at ?? nowIso()
            : patch.completed_at ?? null,
        updated_at: nowIso(),
      };
      database.tasks[index] = updated;
      return updated;
    });
  }

  async deleteTask(id: UUID): Promise<void> {
    this.mutate((database) => {
      const timestamp = nowIso();
      database.tasks = database.tasks.map((task) =>
        task.id === id || task.parent_task_id === id
          ? { ...task, deleted_at: timestamp, updated_at: timestamp }
          : task
      );
      // Views are stopped but history is preserved.
      database.timerSessions = database.timerSessions.map((session) =>
        session.task_id === id && session.status !== "stopped"
          ? { ...session, status: "stopped", updated_at: timestamp }
          : session
      );
    });
  }

  /* ------------------------------------------------------------------ */
  /* schedules                                                           */
  /* ------------------------------------------------------------------ */

  async listSchedules(): Promise<Schedule[]> {
    return this.read().schedules;
  }

  async createSchedule(input: ScheduleInsert): Promise<Schedule> {
    if (durationBetween(input.start_at, input.end_at) <= 0) {
      throw new RepositoryError("End time must be later than start time");
    }
    return this.mutate((database) => {
      const timestamp = nowIso();
      const schedule: Schedule = {
        id: input.id ?? newId(),
        user_id: LOCAL_USER_ID,
        task_id: input.task_id ?? null,
        project_id: input.project_id ?? null,
        title: input.title,
        start_at: toIso(input.start_at),
        end_at: toIso(input.end_at),
        schedule_type: input.schedule_type ?? (input.task_id ? "task" : "event"),
        description: input.description ?? null,
        created_at: timestamp,
        updated_at: timestamp,
      };
      database.schedules = [...database.schedules, schedule];
      return schedule;
    });
  }

  async updateSchedule(id: UUID, patch: ScheduleUpdate): Promise<Schedule> {
    return this.mutate((database) => {
      const index = database.schedules.findIndex((schedule) => schedule.id === id);
      if (index < 0) throw new RepositoryError("Schedule not found");
      const updated: Schedule = {
        ...database.schedules[index],
        ...patch,
        start_at: patch.start_at ? toIso(patch.start_at) : database.schedules[index].start_at,
        end_at: patch.end_at ? toIso(patch.end_at) : database.schedules[index].end_at,
        updated_at: nowIso(),
      };
      if (durationBetween(updated.start_at, updated.end_at) <= 0) {
        throw new RepositoryError("End time must be later than start time");
      }
      database.schedules[index] = updated;
      return updated;
    });
  }

  async deleteSchedule(id: UUID): Promise<void> {
    this.mutate((database) => {
      database.schedules = database.schedules.filter((schedule) => schedule.id !== id);
      database.timeEntries = database.timeEntries.map((entry) =>
        entry.schedule_id === id ? { ...entry, schedule_id: null } : entry
      );
    });
  }

  /* ------------------------------------------------------------------ */
  /* time entries                                                        */
  /* ------------------------------------------------------------------ */

  async listTimeEntries(): Promise<TimeEntry[]> {
    return this.read().timeEntries;
  }

  async createTimeEntry(input: TimeEntryInsert): Promise<TimeEntry> {
    return this.mutate((database) => {
      const timestamp = nowIso();
      const start = toIso(input.start_at);
      const end = toIso(input.end_at);
      const entry: TimeEntry = {
        id: input.id ?? newId(),
        user_id: LOCAL_USER_ID,
        task_id: input.task_id ?? null,
        project_id: input.project_id ?? null,
        schedule_id: input.schedule_id ?? null,
        category_id: input.category_id ?? null,
        start_at: start,
        end_at: end,
        duration_seconds:
          input.duration_seconds ?? Math.max(0, durationBetween(start, end)),
        source: input.source ?? "manual",
        title: input.title ?? null,
        notes: input.notes ?? null,
        created_at: timestamp,
        updated_at: timestamp,
      };
      database.timeEntries = [entry, ...database.timeEntries];
      return entry;
    });
  }

  async updateTimeEntry(id: UUID, patch: TimeEntryUpdate): Promise<TimeEntry> {
    return this.mutate((database) => {
      const index = database.timeEntries.findIndex((entry) => entry.id === id);
      if (index < 0) throw new RepositoryError("Time entry not found");
      const previous = database.timeEntries[index];
      const start = patch.start_at ? toIso(patch.start_at) : previous.start_at;
      const end = patch.end_at ? toIso(patch.end_at) : previous.end_at;
      const updated: TimeEntry = {
        ...previous,
        ...patch,
        start_at: start,
        end_at: end,
        duration_seconds:
          patch.duration_seconds ??
          (patch.start_at || patch.end_at
            ? Math.max(0, durationBetween(start, end))
            : previous.duration_seconds),
        updated_at: nowIso(),
      };
      database.timeEntries[index] = updated;
      return updated;
    });
  }

  async deleteTimeEntry(id: UUID): Promise<void> {
    this.mutate((database) => {
      database.timeEntries = database.timeEntries.filter((entry) => entry.id !== id);
    });
  }

  /* ------------------------------------------------------------------ */
  /* timer                                                               */
  /* ------------------------------------------------------------------ */

  private activeTimersOf(database: LocalDatabase): TimerSession[] {
    return database.timerSessions
      .filter((session) => session.status === "running" || session.status === "paused")
      .sort((a, b) => a.started_at.localeCompare(b.started_at));
  }

  async listActiveTimers(): Promise<TimerSession[]> {
    return this.activeTimersOf(this.read());
  }

  async startTimer(taskId: UUID | null, projectId: UUID | null): Promise<TimerSession> {
    return this.mutate((database) => {
      const timestamp = nowIso();
      // Several timers may run at once, but tracking the same thing twice just
      // hands back the session that is already open.
      const existing = database.timerSessions.find(
        (session) =>
          (session.status === "running" || session.status === "paused") &&
          session.task_id === taskId &&
          session.project_id === projectId
      );
      if (existing) return existing;

      const session: TimerSession = {
        id: newId(),
        user_id: LOCAL_USER_ID,
        task_id: taskId,
        project_id: projectId,
        status: "running",
        started_at: timestamp,
        paused_at: null,
        accumulated_seconds: 0,
        created_at: timestamp,
        updated_at: timestamp,
      };
      database.timerSessions = [session, ...database.timerSessions];
      return session;
    });
  }

  async pauseTimer(id: UUID): Promise<TimerSession> {
    return this.mutate((database) => {
      const index = database.timerSessions.findIndex((session) => session.id === id);
      const session = index >= 0 ? database.timerSessions[index] : undefined;
      if (!session || session.status !== "running") {
        throw new RepositoryError("No running timer to pause");
      }
      const timestamp = nowIso();
      const updated: TimerSession = {
        ...session,
        status: "paused",
        accumulated_seconds: computeTimerElapsedSeconds(session, timestamp),
        paused_at: timestamp,
        updated_at: timestamp,
      };
      database.timerSessions[index] = updated;
      return updated;
    });
  }

  async resumeTimer(id: UUID): Promise<TimerSession> {
    return this.mutate((database) => {
      const index = database.timerSessions.findIndex((session) => session.id === id);
      const session = index >= 0 ? database.timerSessions[index] : undefined;
      if (!session || session.status !== "paused") {
        throw new RepositoryError("No paused timer to resume");
      }
      const timestamp = nowIso();
      const updated: TimerSession = {
        ...session,
        status: "running",
        started_at: timestamp,
        paused_at: null,
        updated_at: timestamp,
      };
      database.timerSessions[index] = updated;
      return updated;
    });
  }

  async stopTimer(id: UUID): Promise<StopTimerResult> {
    let result: StopTimerResult = { session: null, entry: null };
    this.mutate((database) => {
      const index = database.timerSessions.findIndex(
        (session) =>
          session.id === id && (session.status === "running" || session.status === "paused")
      );
      if (index < 0) return;
      const session = database.timerSessions[index];
      const timestamp = nowIso();
      const elapsed = computeTimerElapsedSeconds(session, timestamp);
      const stopped: TimerSession = {
        ...session,
        status: "stopped",
        accumulated_seconds: elapsed,
        paused_at: session.status === "running" ? timestamp : session.paused_at,
        updated_at: timestamp,
      };
      database.timerSessions[index] = stopped;

      if (elapsed > 0) {
        const endAt = new Date(timestamp);
        const startAt = new Date(endAt.getTime() - elapsed * 1000);
        // Whatever the timer tracked decides the entry's category and title:
        // the task first, then the project.
        const task = session.task_id
          ? database.tasks.find((item) => item.id === session.task_id)
          : undefined;
        const project = session.project_id
          ? database.projects.find((item) => item.id === session.project_id)
          : undefined;
        const entry: TimeEntry = {
          id: newId(),
          user_id: LOCAL_USER_ID,
          task_id: session.task_id,
          project_id: session.project_id,
          schedule_id: null,
          category_id: task?.category_id ?? project?.category_id ?? null,
          start_at: startAt.toISOString(),
          end_at: endAt.toISOString(),
          duration_seconds: elapsed,
          source: "timer",
          title: task?.title ?? project?.name ?? "Tracked session",
          notes: null,
          created_at: timestamp,
          updated_at: timestamp,
        };
        database.timeEntries = [entry, ...database.timeEntries];
        result = { session: stopped, entry };
      } else {
        result = { session: stopped, entry: null };
      }
    });
    return result;
  }

  async discardTimer(id: UUID): Promise<void> {
    this.mutate((database) => {
      const timestamp = nowIso();
      database.timerSessions = database.timerSessions.map((session) =>
        session.id === id &&
        (session.status === "running" || session.status === "paused")
          ? { ...session, status: "stopped", updated_at: timestamp }
          : session
      );
    });
  }

  /* ------------------------------------------------------------------ */
  /* tags                                                                */
  /* ------------------------------------------------------------------ */

  async listTags(): Promise<Tag[]> {
    return this.read().tags;
  }

  async createTag(input: TagInsert): Promise<Tag> {
    return this.mutate((database) => {
      const timestamp = nowIso();
      const tag: Tag = {
        id: input.id ?? newId(),
        user_id: LOCAL_USER_ID,
        name: input.name,
        color: input.color ?? "#94a3b8",
        created_at: timestamp,
        updated_at: timestamp,
      };
      database.tags = [...database.tags, tag];
      return tag;
    });
  }

  async updateTag(id: UUID, patch: TagUpdate): Promise<Tag> {
    return this.mutate((database) => {
      const index = database.tags.findIndex((tag) => tag.id === id);
      if (index < 0) throw new RepositoryError("Tag not found");
      const updated = { ...database.tags[index], ...patch, updated_at: nowIso() };
      database.tags[index] = updated;
      return updated;
    });
  }

  async deleteTag(id: UUID): Promise<void> {
    this.mutate((database) => {
      database.tags = database.tags.filter((tag) => tag.id !== id);
    });
  }
}
