/**
 * Supabase repository -- the production storage path.
 *
 * All timer transitions go through the SQL functions created in
 * `20260101000100_timer_functions.sql` (and revised in
 * `20260101000700_parallel_timers.sql`) so that "a running session is never
 * silently dropped" and "recorded time is never lost" are enforced by the
 * database, not the client. Several sessions may be open at once.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  RepositoryError,
  type AppUser,
  type Repository,
  type RepositorySnapshot,
  type StopTimerResult,
} from "@/lib/data/repository";
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
import { toIso } from "@/lib/time";

function unwrap<T>(data: T | null, error: { message: string } | null, context: string): T {
  if (error) throw new RepositoryError(`${context}: ${error.message}`, error);
  if (data === null) throw new RepositoryError(`${context}: no data returned`);
  return data;
}

export class SupabaseRepository implements Repository {
  readonly mode = "supabase" as const;

  constructor(private readonly client: SupabaseClient) {}

  /* ------------------------------------------------------------------ */
  /* helpers                                                             */
  /* ------------------------------------------------------------------ */

  private async requireUserId(): Promise<UUID> {
    const { data, error } = await this.client.auth.getUser();
    if (error || !data.user) throw new RepositoryError("Not authenticated", error);
    return data.user.id;
  }

  private toUser(user: { id: string; email?: string | null } | null): AppUser | null {
    if (!user) return null;
    return { id: user.id, email: user.email ?? null, displayName: null };
  }

  /* ------------------------------------------------------------------ */
  /* auth                                                                */
  /* ------------------------------------------------------------------ */

  async getCurrentUser(): Promise<AppUser | null> {
    const { data, error } = await this.client.auth.getUser();
    if (error) return null;
    return this.toUser(data.user);
  }

  async signIn(email: string, password: string): Promise<AppUser> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw new RepositoryError(error.message, error);
    return this.toUser(data.user) ?? this.toUser(data.session?.user ?? null)!;
  }

  async signUp(email: string, password: string, displayName: string): Promise<AppUser> {
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    if (error) throw new RepositoryError(error.message, error);
    if (!data.user) throw new RepositoryError("Sign-up did not return a user");
    // The `on_auth_user_created` trigger inserts the profile row; upsert keeps
    // the display name correct even if email confirmation is required.
    await this.client
      .from("profiles")
      .upsert({ id: data.user.id, display_name: displayName }, { onConflict: "id" });
    return { id: data.user.id, email: data.user.email ?? null, displayName };
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }

  onAuthStateChange(callback: (user: AppUser | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => {
      callback(this.toUser(session?.user ?? null));
    });
    return () => data.subscription.unsubscribe();
  }

  /* ------------------------------------------------------------------ */
  /* profile                                                             */
  /* ------------------------------------------------------------------ */

  async getProfile(): Promise<Profile> {
    const userId = await this.requireUserId();
    const { data, error } = await this.client
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new RepositoryError("Failed to load profile", error);
    if (data) return data as Profile;

    const { data: created, error: createError } = await this.client
      .from("profiles")
      .insert({ id: userId })
      .select("*")
      .single();
    return unwrap(created as Profile | null, createError, "Failed to create profile");
  }

  async updateProfile(patch: Partial<Pick<Profile, "display_name" | "timezone">>): Promise<Profile> {
    const userId = await this.requireUserId();
    const { data, error } = await this.client
      .from("profiles")
      .update(patch)
      .eq("id", userId)
      .select("*")
      .single();
    return unwrap(data as Profile | null, error, "Failed to update profile");
  }

  /* ------------------------------------------------------------------ */
  /* bulk read                                                           */
  /* ------------------------------------------------------------------ */

  async loadSnapshot(): Promise<RepositorySnapshot> {
    const userId = await this.requireUserId();
    const [profile, projects, categories, tasks, schedules, timeEntries, activeTimers] =
      await Promise.all([
        this.getProfile(),
        this.client.from("projects").select("*").eq("user_id", userId).is("archived_at", null),
        this.client.from("categories").select("*").eq("user_id", userId).order("created_at"),
        this.client.from("tasks").select("*").eq("user_id", userId),
        this.client.from("schedules").select("*").eq("user_id", userId),
        this.client.from("time_entries").select("*").eq("user_id", userId),
        this.listActiveTimers(),
      ]);

    return {
      profile,
      projects: unwrap(projects.data as Project[] | null, projects.error, "Failed to load projects"),
      categories: unwrap(
        categories.data as Category[] | null,
        categories.error,
        "Failed to load categories"
      ),
      tasks: unwrap(tasks.data as Task[] | null, tasks.error, "Failed to load tasks"),
      schedules: unwrap(
        schedules.data as Schedule[] | null,
        schedules.error,
        "Failed to load schedules"
      ),
      timeEntries: unwrap(
        timeEntries.data as TimeEntry[] | null,
        timeEntries.error,
        "Failed to load time entries"
      ),
      activeTimers,
    };
  }

  /* ------------------------------------------------------------------ */
  /* projects                                                            */
  /* ------------------------------------------------------------------ */

  async listProjects(): Promise<Project[]> {
    const userId = await this.requireUserId();
    const { data, error } = await this.client
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .is("archived_at", null);
    return unwrap(data as Project[] | null, error, "Failed to load projects");
  }

  async createProject(input: ProjectInsert): Promise<Project> {
    const userId = await this.requireUserId();
    const { data, error } = await this.client
      .from("projects")
      .insert({ ...input, user_id: userId })
      .select("*")
      .single();
    return unwrap(data as Project | null, error, "Failed to create project");
  }

  async updateProject(id: UUID, patch: ProjectUpdate): Promise<Project> {
    const { data, error } = await this.client
      .from("projects")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    return unwrap(data as Project | null, error, "Failed to update project");
  }

  async deleteProject(id: UUID): Promise<void> {
    // Soft archive: tasks keep their history and never lose the project link
    // silently. Tasks referencing it are detached by the FK's `on delete set null`
    // only when the row is truly deleted, so we archive instead.
    const { error } = await this.client
      .from("projects")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", id);
    if (error) throw new RepositoryError("Failed to archive project", error);
  }

  /* ------------------------------------------------------------------ */
  /* categories                                                          */
  /* ------------------------------------------------------------------ */

  async listCategories(): Promise<Category[]> {
    const userId = await this.requireUserId();
    const { data, error } = await this.client
      .from("categories")
      .select("*")
      .eq("user_id", userId)
      .order("created_at");
    return unwrap(data as Category[] | null, error, "Failed to load categories");
  }

  async createCategory(input: CategoryInsert): Promise<Category> {
    const userId = await this.requireUserId();
    const { data, error } = await this.client
      .from("categories")
      .insert({ ...input, user_id: userId })
      .select("*")
      .single();
    return unwrap(data as Category | null, error, "Failed to create category");
  }

  async updateCategory(id: UUID, patch: CategoryUpdate): Promise<Category> {
    const { data, error } = await this.client
      .from("categories")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    return unwrap(data as Category | null, error, "Failed to update category");
  }

  async deleteCategory(id: UUID): Promise<void> {
    const { error } = await this.client.from("categories").delete().eq("id", id);
    if (error) throw new RepositoryError("Failed to delete category", error);
  }

  /* ------------------------------------------------------------------ */
  /* tasks                                                               */
  /* ------------------------------------------------------------------ */

  async listTasks(options?: { includeDeleted?: boolean }): Promise<Task[]> {
    const userId = await this.requireUserId();
    let query = this.client.from("tasks").select("*").eq("user_id", userId);
    if (!options?.includeDeleted) query = query.is("deleted_at", null);
    const { data, error } = await query;
    return unwrap(data as Task[] | null, error, "Failed to load tasks");
  }

  async createTask(input: TaskInsert): Promise<Task> {
    const userId = await this.requireUserId();
    const { data, error } = await this.client
      .from("tasks")
      .insert({ ...input, user_id: userId })
      .select("*")
      .single();
    return unwrap(data as Task | null, error, "Failed to create task");
  }

  async updateTask(id: UUID, patch: TaskUpdate): Promise<Task> {
    const { data, error } = await this.client
      .from("tasks")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    return unwrap(data as Task | null, error, "Failed to update task");
  }

  async deleteTask(id: UUID): Promise<void> {
    const timestamp = new Date().toISOString();
    const { error } = await this.client
      .from("tasks")
      .update({ deleted_at: timestamp })
      .eq("id", id);
    if (error) throw new RepositoryError("Failed to archive task", error);
    // Children follow their parent into the archive.
    const { error: childError } = await this.client
      .from("tasks")
      .update({ deleted_at: timestamp })
      .eq("parent_task_id", id);
    if (childError) throw new RepositoryError("Failed to archive subtasks", childError);
    await this.client
      .from("timer_sessions")
      .update({ status: "stopped" })
      .eq("task_id", id)
      .in("status", ["running", "paused"]);
  }

  /* ------------------------------------------------------------------ */
  /* schedules                                                           */
  /* ------------------------------------------------------------------ */

  async listSchedules(): Promise<Schedule[]> {
    const userId = await this.requireUserId();
    const { data, error } = await this.client
      .from("schedules")
      .select("*")
      .eq("user_id", userId)
      .order("start_at");
    return unwrap(data as Schedule[] | null, error, "Failed to load schedules");
  }

  async createSchedule(input: ScheduleInsert): Promise<Schedule> {
    const userId = await this.requireUserId();
    const { data, error } = await this.client
      .from("schedules")
      .insert({
        ...input,
        start_at: toIso(input.start_at),
        end_at: toIso(input.end_at),
        user_id: userId,
      })
      .select("*")
      .single();
    return unwrap(data as Schedule | null, error, "Failed to create schedule");
  }

  async updateSchedule(id: UUID, patch: ScheduleUpdate): Promise<Schedule> {
    const payload: ScheduleUpdate = { ...patch };
    if (patch.start_at) payload.start_at = toIso(patch.start_at);
    if (patch.end_at) payload.end_at = toIso(patch.end_at);
    const { data, error } = await this.client
      .from("schedules")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();
    return unwrap(data as Schedule | null, error, "Failed to update schedule");
  }

  async deleteSchedule(id: UUID): Promise<void> {
    const { error } = await this.client.from("schedules").delete().eq("id", id);
    if (error) throw new RepositoryError("Failed to delete schedule", error);
  }

  /* ------------------------------------------------------------------ */
  /* time entries                                                        */
  /* ------------------------------------------------------------------ */

  async listTimeEntries(): Promise<TimeEntry[]> {
    const userId = await this.requireUserId();
    const { data, error } = await this.client
      .from("time_entries")
      .select("*")
      .eq("user_id", userId)
      .order("start_at", { ascending: false });
    return unwrap(data as TimeEntry[] | null, error, "Failed to load time entries");
  }

  async createTimeEntry(input: TimeEntryInsert): Promise<TimeEntry> {
    const userId = await this.requireUserId();
    const start = toIso(input.start_at);
    const end = toIso(input.end_at);
    const duration =
      input.duration_seconds ??
      Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000));
    const { data, error } = await this.client
      .from("time_entries")
      .insert({
        ...input,
        start_at: start,
        end_at: end,
        duration_seconds: duration,
        user_id: userId,
      })
      .select("*")
      .single();
    return unwrap(data as TimeEntry | null, error, "Failed to create time entry");
  }

  async updateTimeEntry(id: UUID, patch: TimeEntryUpdate): Promise<TimeEntry> {
    const payload: TimeEntryUpdate = { ...patch };
    if (patch.start_at) payload.start_at = toIso(patch.start_at);
    if (patch.end_at) payload.end_at = toIso(patch.end_at);
    if (
      payload.duration_seconds === undefined &&
      (patch.start_at || patch.end_at)
    ) {
      const { data: current, error: readError } = await this.client
        .from("time_entries")
        .select("start_at, end_at")
        .eq("id", id)
        .single();
      if (readError) throw new RepositoryError("Failed to read time entry", readError);
      const start = new Date(payload.start_at ?? current.start_at).getTime();
      const end = new Date(payload.end_at ?? current.end_at).getTime();
      payload.duration_seconds = Math.max(0, Math.floor((end - start) / 1000));
    }
    const { data, error } = await this.client
      .from("time_entries")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();
    return unwrap(data as TimeEntry | null, error, "Failed to update time entry");
  }

  async deleteTimeEntry(id: UUID): Promise<void> {
    const { error } = await this.client.from("time_entries").delete().eq("id", id);
    if (error) throw new RepositoryError("Failed to delete time entry", error);
  }

  /* ------------------------------------------------------------------ */
  /* timer                                                               */
  /* ------------------------------------------------------------------ */

  async listActiveTimers(): Promise<TimerSession[]> {
    const userId = await this.requireUserId();
    const { data, error } = await this.client
      .from("timer_sessions")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["running", "paused"])
      .order("started_at", { ascending: true });
    if (error) throw new RepositoryError("Failed to load timers", error);
    return (data as TimerSession[] | null) ?? [];
  }

  async startTimer(taskId: UUID | null, projectId: UUID | null): Promise<TimerSession> {
    const { data, error } = await this.client.rpc("start_timer", {
      p_task_id: taskId,
      p_project_id: projectId,
    });
    return unwrap(data as TimerSession | null, error, "Failed to start timer");
  }

  async pauseTimer(id: UUID): Promise<TimerSession> {
    const { data, error } = await this.client.rpc("pause_timer", { p_session_id: id });
    return unwrap(data as TimerSession | null, error, "Failed to pause timer");
  }

  async resumeTimer(id: UUID): Promise<TimerSession> {
    const { data, error } = await this.client.rpc("resume_timer", { p_session_id: id });
    return unwrap(data as TimerSession | null, error, "Failed to resume timer");
  }

  async stopTimer(id: UUID): Promise<StopTimerResult> {
    const { data, error } = await this.client.rpc("stop_timer", { p_session_id: id });
    if (error) throw new RepositoryError("Failed to stop timer", error);
    const payload = (data ?? {}) as { session: TimerSession | null; entry: TimeEntry | null };
    return { session: payload.session ?? null, entry: payload.entry ?? null };
  }

  async discardTimer(id: UUID): Promise<void> {
    const { error } = await this.client.rpc("discard_timer", { p_session_id: id });
    if (error) throw new RepositoryError("Failed to discard timer", error);
  }

  /* ------------------------------------------------------------------ */
  /* tags                                                                */
  /* ------------------------------------------------------------------ */

  async listTags(): Promise<Tag[]> {
    const userId = await this.requireUserId();
    const { data, error } = await this.client.from("tags").select("*").eq("user_id", userId);
    return unwrap(data as Tag[] | null, error, "Failed to load tags");
  }

  async createTag(input: TagInsert): Promise<Tag> {
    const userId = await this.requireUserId();
    const { data, error } = await this.client
      .from("tags")
      .insert({ ...input, user_id: userId })
      .select("*")
      .single();
    return unwrap(data as Tag | null, error, "Failed to create tag");
  }

  async updateTag(id: UUID, patch: TagUpdate): Promise<Tag> {
    const { data, error } = await this.client
      .from("tags")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    return unwrap(data as Tag | null, error, "Failed to update tag");
  }

  async deleteTag(id: UUID): Promise<void> {
    const { error } = await this.client.from("tags").delete().eq("id", id);
    if (error) throw new RepositoryError("Failed to delete tag", error);
  }
}
