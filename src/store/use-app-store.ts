"use client";

import { create } from "zustand";

import { getRepository, resolveStorageMode } from "@/lib/data";
import type { AppUser, Repository, StopTimerResult, StorageMode } from "@/lib/data/repository";
import { RepositoryError } from "@/lib/data/repository";
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
  Task,
  TaskInsert,
  TaskUpdate,
  TimeEntry,
  TimeEntryInsert,
  TimeEntryUpdate,
  TimerSession,
  UUID,
} from "@/lib/types";

export type LoadStatus = "idle" | "loading" | "ready" | "error";

interface AppState {
  mode: StorageMode;
  status: LoadStatus;
  error: string | null;
  user: AppUser | null;

  profile: Profile | null;
  projects: Project[];
  categories: Category[];
  tasks: Task[];
  schedules: Schedule[];
  timeEntries: TimeEntry[];
  /** Every session still running or paused -- several may be open at once. */
  activeTimers: TimerSession[];

  /* lifecycle ------------------------------------------------------------ */
  initialize: () => Promise<void>;
  refresh: () => Promise<void>;
  resetLocalData: () => Promise<void>;

  /* auth ----------------------------------------------------------------- */
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOutUser: () => Promise<void>;

  /* projects ------------------------------------------------------------- */
  createProject: (input: ProjectInsert) => Promise<Project>;
  updateProject: (id: UUID, patch: ProjectUpdate) => Promise<Project>;
  deleteProject: (id: UUID) => Promise<void>;

  /* categories ----------------------------------------------------------- */
  createCategory: (input: CategoryInsert) => Promise<Category>;
  updateCategory: (id: UUID, patch: CategoryUpdate) => Promise<Category>;
  deleteCategory: (id: UUID) => Promise<void>;

  /* tasks ---------------------------------------------------------------- */
  createTask: (input: TaskInsert) => Promise<Task>;
  updateTask: (id: UUID, patch: TaskUpdate) => Promise<Task>;
  deleteTask: (id: UUID) => Promise<void>;

  /* schedules ------------------------------------------------------------ */
  createSchedule: (input: ScheduleInsert) => Promise<Schedule>;
  updateSchedule: (id: UUID, patch: ScheduleUpdate) => Promise<Schedule>;
  deleteSchedule: (id: UUID) => Promise<void>;

  /* time entries --------------------------------------------------------- */
  createTimeEntry: (input: TimeEntryInsert) => Promise<TimeEntry>;
  updateTimeEntry: (id: UUID, patch: TimeEntryUpdate) => Promise<TimeEntry>;
  deleteTimeEntry: (id: UUID) => Promise<void>;

  /* timer ---------------------------------------------------------------- */
  startTimer: (taskId: UUID | null, projectId: UUID | null) => Promise<TimerSession>;
  pauseTimer: (id: UUID) => Promise<void>;
  resumeTimer: (id: UUID) => Promise<void>;
  stopTimer: (id: UUID) => Promise<StopTimerResult>;
  discardTimer: (id: UUID) => Promise<void>;

  /* profile -------------------------------------------------------------- */
  updateProfile: (patch: Partial<Pick<Profile, "display_name" | "timezone">>) => Promise<void>;
}

let repo: Repository | null = null;

function getRepo(): Repository {
  if (!repo) repo = getRepository();
  return repo;
}

export function describeError(error: unknown): string {
  if (error instanceof RepositoryError) return error.message;
  if (error instanceof Error) return error.message;
  return "Something went wrong";
}

export const useAppStore = create<AppState>()((set, get) => ({
  mode: resolveStorageMode(),
  status: "idle",
  error: null,
  user: null,

  profile: null,
  projects: [],
  categories: [],
  tasks: [],
  schedules: [],
  timeEntries: [],
  activeTimers: [],

  /* -------------------------------------------------------------------- */
  /* lifecycle                                                             */
  /* -------------------------------------------------------------------- */

  initialize: async () => {
    if (get().status === "loading") return;
    set({ status: "loading", error: null });
    try {
      const repository = getRepo();
      const user = await repository.getCurrentUser();
      if (!user) {
        set({ status: "ready", user: null });
        return;
      }
      const snapshot = await repository.loadSnapshot();
      set({
        status: "ready",
        user,
        profile: snapshot.profile,
        projects: snapshot.projects,
        categories: snapshot.categories,
        tasks: snapshot.tasks,
        schedules: snapshot.schedules,
        timeEntries: snapshot.timeEntries,
        activeTimers: snapshot.activeTimers,
      });
    } catch (error) {
      set({ status: "error", error: describeError(error) });
    }
  },

  refresh: async () => {
    try {
      const snapshot = await getRepo().loadSnapshot();
      set({
        profile: snapshot.profile,
        projects: snapshot.projects,
        categories: snapshot.categories,
        tasks: snapshot.tasks,
        schedules: snapshot.schedules,
        timeEntries: snapshot.timeEntries,
        activeTimers: snapshot.activeTimers,
        status: "ready",
        error: null,
      });
    } catch (error) {
      set({ error: describeError(error) });
    }
  },

  resetLocalData: async () => {
    const repository = getRepo();
    if (repository.mode === "local") {
      const { resetLocalData } = await import("@/lib/data");
      resetLocalData();
    }
    await get().refresh();
  },

  /* -------------------------------------------------------------------- */
  /* auth                                                                 */
  /* -------------------------------------------------------------------- */

  signIn: async (email, password) => {
    await getRepo().signIn(email, password);
    await get().initialize();
  },

  signUp: async (email, password, displayName) => {
    await getRepo().signUp(email, password, displayName);
    await get().initialize();
  },

  signOutUser: async () => {
    await getRepo().signOut();
    // Drop every tenant-scoped slice so no data from the previous session
    // can be rendered while the next sign-in is in flight.
    set({
      user: null,
      profile: null,
      projects: [],
      categories: [],
      tasks: [],
      schedules: [],
      timeEntries: [],
      activeTimers: [],
      status: "ready",
      error: null,
    });
  },

  /* -------------------------------------------------------------------- */
  /* projects                                                              */
  /* -------------------------------------------------------------------- */

  createProject: async (input) => {
    // The database default is 0, which would stack every new project on the same
    // priority, so the next free slot is decided here for both backends.
    const sortOrder =
      input.sort_order ?? get().projects.reduce((max, item) => Math.max(max, item.sort_order), -1) + 1;
    const project = await getRepo().createProject({ ...input, sort_order: sortOrder });
    set((state) => ({ projects: [...state.projects, project] }));
    return project;
  },

  updateProject: async (id, patch) => {
    const previous = get().projects;
    set((state) => ({
      projects: state.projects.map((project) =>
        project.id === id ? { ...project, ...patch } : project
      ),
    }));
    try {
      const project = await getRepo().updateProject(id, patch);
      set((state) => ({
        projects: state.projects.map((item) => (item.id === id ? project : item)),
      }));
      return project;
    } catch (error) {
      set({ projects: previous });
      throw error;
    }
  },

  deleteProject: async (id) => {
    await getRepo().deleteProject(id);
    set((state) => ({
      projects: state.projects.filter((project) => project.id !== id),
      tasks: state.tasks.map((task) =>
        task.project_id === id ? { ...task, project_id: null } : task
      ),
    }));
  },

  /* -------------------------------------------------------------------- */
  /* categories                                                            */
  /* -------------------------------------------------------------------- */

  createCategory: async (input) => {
    const category = await getRepo().createCategory(input);
    set((state) => ({ categories: [...state.categories, category] }));
    return category;
  },

  updateCategory: async (id, patch) => {
    const category = await getRepo().updateCategory(id, patch);
    set((state) => ({
      categories: state.categories.map((item) => (item.id === id ? category : item)),
    }));
    return category;
  },

  deleteCategory: async (id) => {
    await getRepo().deleteCategory(id);
    set((state) => ({
      categories: state.categories.filter((category) => category.id !== id),
      tasks: state.tasks.map((task) =>
        task.category_id === id ? { ...task, category_id: null } : task
      ),
      timeEntries: state.timeEntries.map((entry) =>
        entry.category_id === id ? { ...entry, category_id: null } : entry
      ),
    }));
  },

  /* -------------------------------------------------------------------- */
  /* tasks                                                                 */
  /* -------------------------------------------------------------------- */

  createTask: async (input) => {
    const task = await getRepo().createTask(input);
    set((state) => ({ tasks: [task, ...state.tasks] }));
    return task;
  },

  updateTask: async (id, patch) => {
    const previous = get().tasks;
    // Optimistic: kanban drags and status toggles should feel instant.
    set((state) => ({
      tasks: state.tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)),
    }));
    try {
      const task = await getRepo().updateTask(id, patch);
      set((state) => ({ tasks: state.tasks.map((item) => (item.id === id ? task : item)) }));
      return task;
    } catch (error) {
      set({ tasks: previous });
      throw error;
    }
  },

  deleteTask: async (id) => {
    const previous = get().tasks;
    set((state) => ({
      tasks: state.tasks.map((task) => (task.id === id ? { ...task, deleted_at: new Date().toISOString() } : task)),
    }));
    try {
      await getRepo().deleteTask(id);
      await get().refresh();
    } catch (error) {
      set({ tasks: previous });
      throw error;
    }
  },

  /* -------------------------------------------------------------------- */
  /* schedules                                                             */
  /* -------------------------------------------------------------------- */

  createSchedule: async (input) => {
    const schedule = await getRepo().createSchedule(input);
    set((state) => ({ schedules: [...state.schedules, schedule] }));
    return schedule;
  },

  updateSchedule: async (id, patch) => {
    const previous = get().schedules;
    set((state) => ({
      schedules: state.schedules.map((schedule) =>
        schedule.id === id ? { ...schedule, ...patch } : schedule
      ),
    }));
    try {
      const schedule = await getRepo().updateSchedule(id, patch);
      set((state) => ({
        schedules: state.schedules.map((item) => (item.id === id ? schedule : item)),
      }));
      return schedule;
    } catch (error) {
      set({ schedules: previous });
      throw error;
    }
  },

  deleteSchedule: async (id) => {
    const previous = get().schedules;
    set((state) => ({ schedules: state.schedules.filter((schedule) => schedule.id !== id) }));
    try {
      await getRepo().deleteSchedule(id);
    } catch (error) {
      set({ schedules: previous });
      throw error;
    }
  },

  /* -------------------------------------------------------------------- */
  /* time entries                                                          */
  /* -------------------------------------------------------------------- */

  createTimeEntry: async (input) => {
    const entry = await getRepo().createTimeEntry(input);
    set((state) => ({ timeEntries: [entry, ...state.timeEntries] }));
    return entry;
  },

  updateTimeEntry: async (id, patch) => {
    const previous = get().timeEntries;
    set((state) => ({
      timeEntries: state.timeEntries.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry
      ),
    }));
    try {
      const entry = await getRepo().updateTimeEntry(id, patch);
      set((state) => ({
        timeEntries: state.timeEntries.map((item) => (item.id === id ? entry : item)),
      }));
      return entry;
    } catch (error) {
      set({ timeEntries: previous });
      throw error;
    }
  },

  deleteTimeEntry: async (id) => {
    const previous = get().timeEntries;
    set((state) => ({ timeEntries: state.timeEntries.filter((entry) => entry.id !== id) }));
    try {
      await getRepo().deleteTimeEntry(id);
    } catch (error) {
      set({ timeEntries: previous });
      throw error;
    }
  },

  /* -------------------------------------------------------------------- */
  /* timer                                                                 */
  /* -------------------------------------------------------------------- */

  startTimer: async (taskId, projectId) => {
    const session = await getRepo().startTimer(taskId, projectId);
    // Tracking the same thing twice hands back the session that is already
    // open, so the list is upserted rather than blindly appended to.
    set((state) => ({
      activeTimers: state.activeTimers.some((timer) => timer.id === session.id)
        ? state.activeTimers.map((timer) => (timer.id === session.id ? session : timer))
        : [...state.activeTimers, session],
    }));
    return session;
  },

  pauseTimer: async (id) => {
    const session = await getRepo().pauseTimer(id);
    set((state) => ({
      activeTimers: state.activeTimers.map((timer) =>
        timer.id === session.id ? session : timer
      ),
    }));
  },

  resumeTimer: async (id) => {
    const session = await getRepo().resumeTimer(id);
    set((state) => ({
      activeTimers: state.activeTimers.map((timer) =>
        timer.id === session.id ? session : timer
      ),
    }));
  },

  stopTimer: async (id) => {
    const result = await getRepo().stopTimer(id);
    // Only the session that was stopped leaves the list; any timer still
    // running keeps ticking, and each one writes its own time entry.
    set((state) => ({
      activeTimers: state.activeTimers.filter((timer) => timer.id !== id),
      timeEntries: result.entry ? [result.entry, ...state.timeEntries] : state.timeEntries,
    }));
    return result;
  },

  discardTimer: async (id) => {
    await getRepo().discardTimer(id);
    set((state) => ({
      activeTimers: state.activeTimers.filter((timer) => timer.id !== id),
    }));
  },

  /* -------------------------------------------------------------------- */
  /* profile                                                               */
  /* -------------------------------------------------------------------- */

  updateProfile: async (patch) => {
    const profile = await getRepo().updateProfile(patch);
    set({ profile });
  },
}));
