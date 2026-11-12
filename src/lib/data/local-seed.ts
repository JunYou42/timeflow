/**
 * Sample seed data for Local Mode.
 *
 * The data is generated relative to "now" so the dashboard, calendar and
 * analytics are immediately meaningful. It is inserted as real records (not
 * hardcoded chart values) and can be discarded from Settings -> Reset data.
 */

import {
  addDaysInTimezone,
  durationBetween,
  nowIso,
  startOfDayInTimezone,
  toIso,
} from "@/lib/time";
import {
  DEFAULT_CATEGORIES,
  type Category,
  type Project,
  type Schedule,
  type Task,
  type TimeEntry,
  type TimerSession,
  type Tag,
  type Profile,
} from "@/lib/types";
import { newId } from "@/lib/data/repository";

export interface LocalSeed {
  profile: Profile;
  projects: Project[];
  categories: Category[];
  tasks: Task[];
  schedules: Schedule[];
  timeEntries: TimeEntry[];
  timerSessions: TimerSession[];
  tags: Tag[];
}

interface SeedShape {
  profile: Profile;
  projects: Project[];
  categories: Category[];
  tasks: Task[];
  schedules: Schedule[];
  timeEntries: TimeEntry[];
  timerSessions: TimerSession[];
  tags: Tag[];
}

export function buildLocalSeed(base: SeedShape, userId: string): LocalSeed {
  const timezone = base.profile.timezone || "Asia/Shanghai";
  const now = new Date();
  const todayStart = startOfDayInTimezone(now, timezone);
  const at = (dayOffset: number, hour: number, minute = 0) => {
    const dayStart = addDaysInTimezone(todayStart, dayOffset, timezone);
    return toIso(new Date(dayStart.getTime() + (hour * 60 + minute) * 60_000));
  };

  const stamp = nowIso();

  const categories: Category[] = base.categories.length
    ? base.categories
    : DEFAULT_CATEGORIES.map((category) => ({
        id: newId(),
        user_id: userId,
        name: category.name,
        color: category.color,
        created_at: stamp,
        updated_at: stamp,
      }));

  const categoryByName = new Map(categories.map((category) => [category.name, category]));
  const work = categoryByName.get("Work") ?? categories[0];
  const learning = categoryByName.get("Learning") ?? categories[0];
  const personal = categoryByName.get("Personal") ?? categories[0];
  const hobby = categoryByName.get("Hobby") ?? categories[0];

  const project = (
    name: string,
    color: string,
    description: string,
    categoryId: string | null,
    planning: Pick<
      Project,
      "start_date" | "end_date" | "is_urgent" | "is_important" | "estimated_hours" | "sort_order"
    >
  ): Project => ({
    id: newId(),
    user_id: userId,
    name,
    description,
    color,
    category_id: categoryId,
    ...planning,
    archived_at: null,
    created_at: stamp,
    updated_at: stamp,
  });

  // Ranges deliberately overlap so the timeline has lanes to lay out, and all
  // four Eisenhower quadrants are represented. `sort_order` is the priority that
  // decides the left-most lane where two windows overlap.
  const projects: Project[] = [
    project("TimeFlow", "#6366f1", "Ship the personal time management app", work.id, {
      start_date: at(-6, 9),
      end_date: at(6, 18),
      is_urgent: true,
      is_important: true,
      estimated_hours: 40,
      sort_order: 0,
    }),
    project("Certification prep", "#f59e0b", "AWS Solutions Architect study plan", learning.id, {
      start_date: at(-2, 9),
      end_date: at(2, 18),
      is_urgent: true,
      is_important: false,
      estimated_hours: 15,
      sort_order: 1,
    }),
    project("Flight Data", "#0ea5e9", "Analyse QAR / ALPR exports", work.id, {
      start_date: at(-10, 9),
      end_date: at(-1, 18),
      is_urgent: false,
      is_important: true,
      estimated_hours: 20,
      sort_order: 2,
    }),
    project("Personal", "#10b981", "Health, reading and side quests", personal.id, {
      start_date: at(0, 9),
      end_date: at(20, 21),
      is_urgent: false,
      is_important: false,
      estimated_hours: 10,
      sort_order: 3,
    }),
  ];

  const projectByName = new Map(projects.map((item) => [item.name, item]));
  const timeflow = projectByName.get("TimeFlow") ?? projects[0];
  const certification = projectByName.get("Certification prep") ?? projects[0];
  const flightData = projectByName.get("Flight Data") ?? projects[0];
  const personalProject = projectByName.get("Personal") ?? projects[0];

  const makeTask = (
    title: string,
    overrides: Partial<Task> = {}
  ): Task => ({
    id: newId(),
    user_id: userId,
    project_id: null,
    category_id: null,
    parent_task_id: null,
    title,
    description: null,
    status: "todo",
    priority: "medium",
    due_date: null,
    estimated_minutes: null,
    sort_order: 0,
    deleted_at: null,
    created_at: stamp,
    updated_at: stamp,
    completed_at: null,
    ...overrides,
  });

  const tasks: Task[] = [
    makeTask("Draft TimeFlow database schema", {
      project_id: timeflow.id,
      category_id: work.id,
      status: "done",
      priority: "high",
      due_date: at(-2, 18),
      estimated_minutes: 120,
      completed_at: at(-2, 17),
      sort_order: 0,
    }),
    makeTask("Build task management module", {
      project_id: timeflow.id,
      category_id: work.id,
      status: "in_progress",
      priority: "urgent",
      due_date: at(0, 18),
      estimated_minutes: 240,
      description: "Table, list and kanban views plus the detail drawer.",
      sort_order: 1,
    }),
    makeTask("Wire timer persistence to the database", {
      project_id: timeflow.id,
      category_id: work.id,
      status: "todo",
      priority: "high",
      due_date: at(1, 18),
      estimated_minutes: 180,
      sort_order: 2,
    }),
    makeTask("Review analytics charts", {
      project_id: timeflow.id,
      category_id: work.id,
      status: "todo",
      priority: "medium",
      due_date: at(2, 12),
      estimated_minutes: 60,
      sort_order: 3,
    }),
    makeTask("Prepare monthly fleet report", {
      project_id: flightData.id,
      category_id: work.id,
      status: "in_progress",
      priority: "high",
      due_date: at(3, 18),
      estimated_minutes: 300,
      sort_order: 4,
    }),
    makeTask("Read 'Deep Work' chapter 4", {
      project_id: certification.id,
      category_id: learning.id,
      status: "todo",
      priority: "low",
      due_date: at(1, 22),
      estimated_minutes: 45,
      sort_order: 5,
    }),
    makeTask("Morning run", {
      project_id: personalProject.id,
      category_id: hobby.id,
      status: "done",
      priority: "low",
      due_date: at(0, 7),
      estimated_minutes: 40,
      completed_at: at(0, 7, 40),
      sort_order: 6,
    }),
    makeTask("Weekly review", {
      project_id: personalProject.id,
      category_id: personal.id,
      status: "todo",
      priority: "medium",
      due_date: at(-1, 20),
      estimated_minutes: 30,
      sort_order: 7,
    }),
    makeTask("Migrate legacy time logs", {
      project_id: flightData.id,
      category_id: work.id,
      status: "cancelled",
      priority: "low",
      sort_order: 8,
    }),
  ];

  // Subtasks of "Build task management module".
  const parent = tasks[1];
  tasks.push(
    makeTask("Implement kanban drag & drop", {
      project_id: timeflow.id,
      category_id: work.id,
      parent_task_id: parent.id,
      priority: "high",
      estimated_minutes: 90,
      sort_order: 0,
    }),
    makeTask("Add task detail drawer", {
      project_id: timeflow.id,
      category_id: work.id,
      parent_task_id: parent.id,
      status: "done",
      priority: "medium",
      estimated_minutes: 60,
      completed_at: at(0, 11),
      sort_order: 1,
    })
  );

  const schedule = (
    title: string,
    startISO: string,
    endISO: string,
    taskId: string | null,
    type: "task" | "event",
    description: string | null = null,
    projectId: string | null = null
  ): Schedule => ({
    id: newId(),
    user_id: userId,
    task_id: taskId,
    project_id: projectId,
    title,
    start_at: startISO,
    end_at: endISO,
    schedule_type: type,
    description,
    created_at: stamp,
    updated_at: stamp,
  });

  const schedules: Schedule[] = [
    schedule("Morning run", at(0, 7), at(0, 7, 45), tasks[6].id, "task"),
    schedule("Team stand-up", at(0, 9, 30), at(0, 10), null, "event", "Daily sync", timeflow.id),
    schedule("Build task management module", at(0, 10), at(0, 12, 30), tasks[1].id, "task"),
    schedule("Lunch", at(0, 12, 30), at(0, 13, 30), null, "event"),
    schedule("Build task management module", at(0, 14), at(0, 17), tasks[1].id, "task"),
    schedule("Read 'Deep Work' chapter 4", at(1, 21), at(1, 22), tasks[5].id, "task"),
    schedule("Wire timer persistence", at(1, 10), at(1, 12), tasks[2].id, "task"),
    schedule("Review analytics charts", at(2, 10), at(2, 11), tasks[3].id, "task"),
    schedule("Prepare monthly fleet report", at(3, 9), at(3, 12), tasks[4].id, "task"),
    schedule("Weekly review", at(-1, 19, 30), at(-1, 20), tasks[7].id, "task"),
    schedule("Draft TimeFlow database schema", at(-2, 15), at(-2, 17), tasks[0].id, "task"),
  ];

  const entry = (
    taskId: string | null,
    categoryId: string | null,
    startISO: string,
    endISO: string,
    source: "timer" | "manual",
    title: string | null = null,
    notes: string | null = null,
    projectId: string | null = null
  ): TimeEntry => ({
    id: newId(),
    user_id: userId,
    task_id: taskId,
    project_id: projectId,
    schedule_id: null,
    category_id: categoryId,
    start_at: startISO,
    end_at: endISO,
    duration_seconds: durationBetween(startISO, endISO),
    source,
    title,
    notes,
    created_at: stamp,
    updated_at: stamp,
  });

  const timeEntries: TimeEntry[] = [
    // two weeks of history so the trends have shape
    entry(tasks[0].id, work.id, at(-2, 15), at(-2, 17, 10), "timer"),
    entry(tasks[7].id, personal.id, at(-1, 19, 30), at(-1, 20, 5), "timer"),
    entry(tasks[6].id, hobby.id, at(0, 7), at(0, 7, 42), "timer"),
    entry(tasks[1].id, work.id, at(0, 10, 5), at(0, 12, 15), "timer"),
    entry(null, personal.id, at(0, 12, 30), at(0, 13, 10), "manual", "Lunch", "Unplanned break"),
    entry(tasks[1].id, work.id, at(0, 14, 10), at(0, 15, 30), "timer"),
    entry(tasks[4].id, work.id, at(-3, 9, 30), at(-3, 12, 30), "timer"),
    entry(tasks[4].id, work.id, at(-4, 9), at(-4, 11, 45), "timer"),
    entry(tasks[5].id, learning.id, at(-5, 21), at(-5, 21, 50), "timer"),
    entry(null, personal.id, at(-5, 8), at(-5, 8, 25), "manual", "Commute"),
    entry(tasks[1].id, work.id, at(-6, 10), at(-6, 13), "timer"),
    entry(tasks[3].id, work.id, at(-7, 15), at(-7, 16), "timer"),
    entry(tasks[4].id, work.id, at(-8, 9), at(-8, 12, 20), "timer"),
    entry(null, hobby.id, at(-9, 19), at(-9, 20, 30), "manual", "Guitar practice"),
    // Tracked against a project rather than a task, the way a calendar block can be.
    entry(null, work.id, at(-1, 14), at(-1, 15, 30), "manual", null, null, flightData.id),
  ];

  const tags: Tag[] = [
    { id: newId(), user_id: userId, name: "focus", color: "#6366f1", created_at: stamp, updated_at: stamp },
    { id: newId(), user_id: userId, name: "deep-work", color: "#8b5cf6", created_at: stamp, updated_at: stamp },
    { id: newId(), user_id: userId, name: "admin", color: "#94a3b8", created_at: stamp, updated_at: stamp },
  ];

  return {
    profile: { ...base.profile, id: userId },
    projects,
    categories,
    tasks,
    schedules,
    timeEntries,
    timerSessions: [],
    tags,
  };
}
