import { describe, expect, it } from "vitest";

import {
  buildCategoryAccuracy,
  buildCategoryPlanVsActual,
  buildDailyTrend,
  buildPlannedVsActual,
  buildProjectEstimateAccuracy,
  buildProjectTimeline,
  buildTaskAccuracy,
  buildTaskCompletionStats,
  decorateProjectsWithStats,
  decorateTasksWithStats,
  entriesWithinRange,
  estimationRatio,
  findOverlappingSchedules,
  groupSecondsByCategory,
  groupSecondsByProject,
  isTimerBlocking,
  planProjectMove,
  planProjectReorder,
  projectTimelineRange,
  secondsWithinRange,
  sumSeconds,
} from "@/lib/stats";
import { projectQuadrant } from "@/lib/types";
import type { Category, Project, ProjectWithStats, Schedule, Task, TimeEntry } from "@/lib/types";

const USER = "user-1";
const STAMP = "2026-11-01T00:00:00.000Z";

function secondsBetween(start: string, end: string): number {
  return Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000));
}

function makeEntry(
  start_at: string,
  end_at: string,
  overrides: Partial<TimeEntry> = {}
): TimeEntry {
  return {
    id: `entry-${start_at}-${Math.random().toString(36).slice(2, 8)}`,
    user_id: USER,
    task_id: null,
    project_id: null,
    schedule_id: null,
    category_id: null,
    start_at,
    end_at,
    duration_seconds: secondsBetween(start_at, end_at),
    source: "manual",
    title: null,
    notes: null,
    created_at: STAMP,
    updated_at: STAMP,
    ...overrides,
  };
}

function makeSchedule(
  start_at: string,
  end_at: string,
  overrides: Partial<Schedule> = {}
): Schedule {
  return {
    id: `schedule-${start_at}-${Math.random().toString(36).slice(2, 8)}`,
    user_id: USER,
    task_id: null,
    project_id: null,
    title: "Block",
    start_at,
    end_at,
    schedule_type: "event",
    description: null,
    created_at: STAMP,
    updated_at: STAMP,
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `task-${Math.random().toString(36).slice(2, 8)}`,
    user_id: USER,
    project_id: null,
    category_id: null,
    parent_task_id: null,
    title: "Task",
    description: null,
    status: "todo",
    priority: "medium",
    due_date: null,
    estimated_minutes: null,
    sort_order: 0,
    deleted_at: null,
    created_at: STAMP,
    updated_at: STAMP,
    completed_at: null,
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: `project-${Math.random().toString(36).slice(2, 8)}`,
    user_id: USER,
    name: "Project",
    description: null,
    color: "#6366f1",
    category_id: null,
    start_date: null,
    end_date: null,
    is_urgent: false,
    is_important: false,
    estimated_hours: null,
    sort_order: 0,
    archived_at: null,
    created_at: STAMP,
    updated_at: STAMP,
    ...overrides,
  };
}

function makeCategory(name: string, color = "#6366f1"): Category {
  return {
    id: `category-${name}`,
    user_id: USER,
    name,
    color,
    created_at: STAMP,
    updated_at: STAMP,
  };
}

describe("aggregation", () => {
  it("sums tracked seconds", () => {
    const entries = [
      makeEntry("2026-11-11T09:00:00.000Z", "2026-11-11T10:00:00.000Z"),
      makeEntry("2026-11-11T11:00:00.000Z", "2026-11-11T11:30:00.000Z"),
    ];
    expect(sumSeconds(entries)).toBe(5400);
  });

  it("clips entries to the range instead of discarding them", () => {
    const entries = [
      // 23:00 -> 01:00 the next day.
      makeEntry("2026-11-11T23:00:00.000Z", "2026-11-12T01:00:00.000Z"),
    ];
    const dayOne = { start: new Date("2026-11-11T00:00:00.000Z"), end: new Date("2026-11-12T00:00:00.000Z") };
    const dayTwo = { start: new Date("2026-11-12T00:00:00.000Z"), end: new Date("2026-11-13T00:00:00.000Z") };

    expect(secondsWithinRange(entries, dayOne)).toBe(3600);
    expect(secondsWithinRange(entries, dayTwo)).toBe(3600);
    // No double counting: the two days together equal the record's real duration.
    expect(secondsWithinRange(entries, dayOne) + secondsWithinRange(entries, dayTwo)).toBe(
      entries[0].duration_seconds
    );
  });

  it("selects entries that merely overlap the range", () => {
    const entries = [makeEntry("2026-11-10T23:00:00.000Z", "2026-11-11T01:00:00.000Z")];
    const range = { start: new Date("2026-11-11T00:00:00.000Z"), end: new Date("2026-11-12T00:00:00.000Z") };
    expect(entriesWithinRange(entries, range)).toHaveLength(1);
  });
});

describe("groupSecondsByCategory", () => {
  it("buckets time and reconciles the percentages with the total", () => {
    const work = makeCategory("Work");
    const learning = makeCategory("Learning");
    const entries = [
      makeEntry("2026-11-11T09:00:00.000Z", "2026-11-11T10:00:00.000Z", { category_id: work.id }),
      makeEntry("2026-11-11T11:00:00.000Z", "2026-11-11T11:30:00.000Z", { category_id: work.id }),
      makeEntry("2026-11-11T12:00:00.000Z", "2026-11-11T12:30:00.000Z", { category_id: learning.id }),
      makeEntry("2026-11-11T13:00:00.000Z", "2026-11-11T13:30:00.000Z"),
    ];

    const slices = groupSecondsByCategory(entries, [work, learning]);
    // Sorted by tracked seconds, descending.
    expect(slices.map((slice) => slice.name)).toEqual(["Work", "Learning", "Uncategorized"]);
    expect(slices[0].seconds).toBe(5400);
    expect(slices[1].seconds).toBe(1800);
    expect(slices[2].seconds).toBe(1800);
    expect(slices.reduce((sum, slice) => sum + slice.percentage, 0)).toBeCloseTo(100, 1);
  });
});

describe("groupSecondsByProject", () => {
  it("folds project and task time together and skips unassigned hours", () => {
    const project = makeProject({ name: "Website", color: "#6366f1" });
    const other = makeProject({ name: "Newsletter" });
    const task = makeTask({ project_id: project.id });
    const entries = [
      makeEntry("2026-11-11T09:00:00.000Z", "2026-11-11T10:00:00.000Z", {
        project_id: project.id,
      }),
      makeEntry("2026-11-11T11:00:00.000Z", "2026-11-11T11:30:00.000Z", { task_id: task.id }),
      makeEntry("2026-11-11T12:00:00.000Z", "2026-11-11T12:30:00.000Z", {
        project_id: other.id,
      }),
      makeEntry("2026-11-11T13:00:00.000Z", "2026-11-11T13:30:00.000Z"),
    ];

    const slices = groupSecondsByProject(entries, [task], [project, other]);
    // Sorted by tracked seconds, descending; the task's hour lands on its project.
    expect(slices.map((slice) => slice.name)).toEqual(["Website", "Newsletter"]);
    expect(slices[0].seconds).toBe(5400);
    expect(slices[0].color).toBe("#6366f1");
    expect(slices[1].seconds).toBe(1800);
    expect(slices.reduce((sum, slice) => sum + slice.percentage, 0)).toBeCloseTo(100, 1);
  });

  it("ignores time pointing at a project that no longer exists", () => {
    const slices = groupSecondsByProject(
      [makeEntry("2026-11-11T09:00:00.000Z", "2026-11-11T10:00:00.000Z", { project_id: "gone" })],
      [],
      []
    );
    expect(slices).toEqual([]);
  });
});

describe("buildDailyTrend", () => {
  it("zero-fills every day in the range", () => {
    const entries = [makeEntry("2026-11-11T09:00:00.000Z", "2026-11-11T11:00:00.000Z")];
    const range = {
      start: new Date("2026-11-10T00:00:00.000Z"),
      end: new Date("2026-11-13T00:00:00.000Z"),
    };
    const trend = buildDailyTrend(entries, range, "UTC");
    expect(trend.map((point) => point.date)).toEqual(["2026-11-10", "2026-11-11", "2026-11-12"]);
    expect(trend.map((point) => point.seconds)).toEqual([0, 7200, 0]);
    expect(trend[1].hours).toBe(2);
    expect(trend[1].label).toBe("11-11");
  });
});

describe("buildPlannedVsActual", () => {
  it("splits a record that crosses midnight across both days", () => {
    const range = {
      start: new Date("2026-11-11T00:00:00.000Z"),
      end: new Date("2026-11-13T00:00:00.000Z"),
    };
    const schedules = [makeSchedule("2026-11-11T22:00:00.000Z", "2026-11-12T02:00:00.000Z")];
    const entries = [makeEntry("2026-11-11T23:00:00.000Z", "2026-11-12T00:30:00.000Z")];

    const points = buildPlannedVsActual(schedules, entries, range, "UTC");
    expect(points).toHaveLength(2);
    expect(points[0].plannedSeconds).toBe(7200);
    expect(points[1].plannedSeconds).toBe(7200);
    expect(points[0].actualSeconds).toBe(3600);
    expect(points[1].actualSeconds).toBe(1800);
  });
});

describe("buildCategoryPlanVsActual", () => {
  const range = {
    start: new Date("2026-11-11T00:00:00.000Z"),
    end: new Date("2026-11-12T00:00:00.000Z"),
  };

  it("books a record to its project's category, not the task's own", () => {
    const work = makeCategory("Work");
    const learning = makeCategory("Learning");
    const project = makeProject({ name: "Client", category_id: work.id });
    const task = makeTask({ project_id: project.id, category_id: learning.id });

    const schedules = [
      makeSchedule("2026-11-11T09:00:00.000Z", "2026-11-11T10:00:00.000Z", { task_id: task.id }),
    ];

    const groups = buildCategoryPlanVsActual(
      schedules,
      [],
      [task],
      [project],
      [work, learning],
      range
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe(work.id);
    expect(groups[0].plannedSeconds).toBe(3600);
    expect(groups[0].projects.map((slice) => slice.name)).toEqual(["Client"]);
  });

  it("follows a task back to its project for tracked time", () => {
    const work = makeCategory("Work");
    const project = makeProject({ name: "Client", category_id: work.id });
    const task = makeTask({ project_id: project.id });
    const entries = [
      makeEntry("2026-11-11T08:00:00.000Z", "2026-11-11T09:00:00.000Z", { task_id: task.id }),
    ];

    const groups = buildCategoryPlanVsActual([], entries, [task], [project], [work], range);
    expect(groups[0].actualSeconds).toBe(3600);
    expect(groups[0].projects[0].actualSeconds).toBe(3600);
    expect(groups[0].actualSeconds).toBe(groups[0].projects[0].actualSeconds);
  });

  it("clips records to the range and falls back to the entry's own category", () => {
    const work = makeCategory("Work");
    const project = makeProject({ name: "Client", category_id: work.id });
    const schedules = [makeSchedule("2026-11-11T23:00:00.000Z", "2026-11-12T02:00:00.000Z")];
    const entries = [
      makeEntry("2026-11-11T08:00:00.000Z", "2026-11-11T09:00:00.000Z", {
        project_id: project.id,
      }),
      // No project, but the entry carries a category of its own.
      makeEntry("2026-11-11T22:00:00.000Z", "2026-11-11T22:30:00.000Z", { category_id: work.id }),
      // Nothing at all: uncategorized, with no project behind it either.
      makeEntry("2026-11-11T21:00:00.000Z", "2026-11-11T21:10:00.000Z"),
    ];

    const groups = buildCategoryPlanVsActual(schedules, entries, [], [project], [work], range);
    const workGroup = groups.find((group) => group.key === work.id);
    expect(workGroup?.actualSeconds).toBe(5400);
    // The project and the project-less entry are separate sectors.
    expect(workGroup?.projects.map((slice) => slice.name)).toEqual(["Client", "No project"]);

    const uncategorized = groups.find((group) => group.key === "uncategorized");
    // Only the hour that falls inside the day is planned; the rest belongs to
    // the next period.
    expect(uncategorized?.plannedSeconds).toBe(3600);
    expect(uncategorized?.actualSeconds).toBe(600);
    expect(uncategorized?.projects.map((slice) => slice.name)).toEqual(["No project"]);
  });

  it("splits a category into its projects and leaves the idle ones out", () => {
    const work = makeCategory("Work");
    const alpha = makeProject({ name: "Alpha", category_id: work.id });
    const beta = makeProject({ name: "Beta", category_id: work.id });
    const idle = makeProject({ name: "Idle", category_id: work.id });
    const entries = [
      makeEntry("2026-11-11T08:00:00.000Z", "2026-11-11T09:00:00.000Z", { project_id: alpha.id }),
      makeEntry("2026-11-11T10:00:00.000Z", "2026-11-11T10:30:00.000Z", { project_id: beta.id }),
    ];

    const groups = buildCategoryPlanVsActual([], entries, [], [alpha, beta, idle], [work], range);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe("Work");
    expect(groups[0].projects.map((slice) => slice.name)).toEqual(["Alpha", "Beta"]);
  });

  it("orders the categories by tracked time", () => {
    const work = makeCategory("Work");
    const learning = makeCategory("Learning");
    const client = makeProject({ name: "Client", category_id: work.id });
    const course = makeProject({ name: "Course", category_id: learning.id });
    const entries = [
      makeEntry("2026-11-11T08:00:00.000Z", "2026-11-11T09:00:00.000Z", { project_id: course.id }),
      makeEntry("2026-11-11T10:00:00.000Z", "2026-11-11T10:30:00.000Z", { project_id: client.id }),
    ];

    const groups = buildCategoryPlanVsActual(
      [],
      entries,
      [],
      [client, course],
      [work, learning],
      range
    );
    expect(groups.map((group) => group.name)).toEqual(["Learning", "Work"]);
  });
});

describe("estimationRatio", () => {
  it("reports unknown when there is no estimate", () => {
    expect(estimationRatio(null, 3600)).toEqual({ ratio: null, over: 0, status: "unknown" });
    expect(estimationRatio(0, 3600).status).toBe("unknown");
  });

  it("classifies over, on and under runs", () => {
    expect(estimationRatio(3600, 5400)).toMatchObject({ ratio: 1.5, over: 1800, status: "over" });
    expect(estimationRatio(3600, 1800)).toMatchObject({ ratio: 0.5, over: 0, status: "under" });
    expect(estimationRatio(3600, 3600).status).toBe("on");
    // Within the 5% tolerance band.
    expect(estimationRatio(3600, 3700).status).toBe("on");
  });
});

describe("buildTaskCompletionStats", () => {
  it("separates completed, pending and overdue work", () => {
    const tasks = [
      makeTask({ status: "done" }),
      makeTask({ status: "todo", due_date: "2026-11-01T00:00:00.000Z" }),
      makeTask({ status: "in_progress", due_date: "2026-12-01T00:00:00.000Z" }),
      makeTask({ status: "cancelled" }),
      makeTask({ status: "todo", deleted_at: STAMP }),
    ];
    const stats = buildTaskCompletionStats(tasks, new Date("2026-11-11T00:00:00.000Z"));
    expect(stats).toMatchObject({
      total: 4,
      completed: 1,
      pending: 2,
      overdue: 1,
      cancelled: 1,
    });
    // Cancelled work is excluded from the denominator.
    expect(stats.completionRate).toBeCloseTo(33.3, 1);
  });
});

describe("decorateTasksWithStats", () => {
  it("aggregates tracked time and subtask progress", () => {
    const parent = makeTask({ title: "Parent" });
    const childA = makeTask({ title: "Child A", parent_task_id: parent.id, status: "done" });
    const childB = makeTask({ title: "Child B", parent_task_id: parent.id });

    const entries = [
      makeEntry("2026-11-11T09:00:00.000Z", "2026-11-11T10:00:00.000Z", { task_id: parent.id }),
      makeEntry("2026-11-11T10:00:00.000Z", "2026-11-11T10:30:00.000Z", { task_id: parent.id }),
    ];

    const decorated = decorateTasksWithStats([parent, childA, childB], entries);
    const decoratedParent = decorated.find((task) => task.id === parent.id)!;
    expect(decoratedParent.actual_seconds).toBe(5400);
    expect(decoratedParent.entry_count).toBe(2);
    expect(decoratedParent.subtask_count).toBe(2);
    expect(decoratedParent.subtasks_done_count).toBe(1);
  });
});

describe("buildTaskAccuracy", () => {
  it("compares estimates with actual time and skips subtasks", () => {
    const parent = makeTask({ title: "Report", estimated_minutes: 60 });
    const child = makeTask({ title: "Outline", parent_task_id: parent.id, estimated_minutes: 30 });
    const noEstimate = makeTask({ title: "Explore", estimated_minutes: null });

    const entries = [
      makeEntry("2026-11-11T09:00:00.000Z", "2026-11-11T10:30:00.000Z", { task_id: parent.id }),
      makeEntry("2026-11-11T11:00:00.000Z", "2026-11-11T11:20:00.000Z", { task_id: noEstimate.id }),
    ];

    const rows = buildTaskAccuracy([parent, child, noEstimate], entries);
    expect(rows.map((row) => row.title)).toEqual(["Report", "Explore"]);
    expect(rows[0]).toMatchObject({
      estimatedSeconds: 3600,
      actualSeconds: 5400,
      ratio: 1.5,
      status: "over",
    });
    expect(rows[1].ratio).toBeNull();
    expect(rows[1].status).toBe("unknown");
  });
});

describe("buildCategoryAccuracy", () => {
  it("attributes entry time to the task category when the entry has none", () => {
    const work = makeCategory("Work");
    const task = makeTask({ category_id: work.id, estimated_minutes: 120 });
    const entries = [
      makeEntry("2026-11-11T09:00:00.000Z", "2026-11-11T11:00:00.000Z", { task_id: task.id }),
    ];

    const rows = buildCategoryAccuracy([task], entries, [work]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Work",
      estimatedSeconds: 7200,
      actualSeconds: 7200,
      ratio: 1,
    });
  });
});

describe("findOverlappingSchedules", () => {
  const existing = makeSchedule("2026-11-11T09:00:00.000Z", "2026-11-11T10:00:00.000Z", {
    id: "existing",
  });

  it("treats back-to-back blocks as compatible", () => {
    expect(
      findOverlappingSchedules(
        { start_at: "2026-11-11T10:00:00.000Z", end_at: "2026-11-11T11:00:00.000Z" },
        [existing]
      )
    ).toHaveLength(0);
  });

  it("flags a partial and a containing overlap", () => {
    expect(
      findOverlappingSchedules(
        { start_at: "2026-11-11T09:30:00.000Z", end_at: "2026-11-11T10:30:00.000Z" },
        [existing]
      )
    ).toHaveLength(1);
    expect(
      findOverlappingSchedules(
        { start_at: "2026-11-11T08:00:00.000Z", end_at: "2026-11-11T12:00:00.000Z" },
        [existing]
      )
    ).toHaveLength(1);
  });

  it("never reports a schedule as conflicting with itself", () => {
    expect(
      findOverlappingSchedules(
        { id: "existing", start_at: existing.start_at, end_at: existing.end_at },
        [existing]
      )
    ).toHaveLength(0);
  });
});

describe("isTimerBlocking", () => {
  it("only blocks when a different task is already being tracked", () => {
    expect(isTimerBlocking(null, "task-a")).toBe(false);
    expect(
      isTimerBlocking({ status: "running", task_id: "task-a" }, "task-a")
    ).toBe(false);
    expect(
      isTimerBlocking({ status: "running", task_id: "task-a" }, "task-b")
    ).toBe(true);
    expect(
      isTimerBlocking({ status: "paused", task_id: "task-a" }, null)
    ).toBe(true);
    expect(
      isTimerBlocking({ status: "stopped", task_id: "task-a" }, "task-b")
    ).toBe(false);
  });
});

describe("projectQuadrant", () => {
  it("maps the urgency/importance pair onto the Eisenhower matrix", () => {
    expect(projectQuadrant({ is_urgent: true, is_important: true })).toBe("do");
    expect(projectQuadrant({ is_urgent: false, is_important: true })).toBe("plan");
    expect(projectQuadrant({ is_urgent: true, is_important: false })).toBe("delegate");
    expect(projectQuadrant({ is_urgent: false, is_important: false })).toBe("drop");
  });
});

describe("decorateProjectsWithStats", () => {
  it("rolls the live tasks up into their project", () => {
    const project = makeProject({ estimated_hours: 12.5 });
    const other = makeProject({ estimated_hours: 3 });
    const done = makeTask({ project_id: project.id, status: "done", estimated_minutes: 45 });
    const open = makeTask({ project_id: project.id, status: "in_progress", estimated_minutes: 30 });
    const deleted = makeTask({ project_id: project.id, deleted_at: STAMP, estimated_minutes: 10 });
    const cancelled = makeTask({
      project_id: project.id,
      status: "cancelled",
      estimated_minutes: 5,
    });
    const loose = makeTask({ project_id: null });

    const entries = [
      makeEntry("2026-11-11T09:00:00.000Z", "2026-11-11T09:30:00.000Z", { task_id: done.id }),
      makeEntry("2026-11-11T10:00:00.000Z", "2026-11-11T10:10:00.000Z", { task_id: open.id }),
      makeEntry("2026-11-11T10:10:00.000Z", "2026-11-11T10:20:00.000Z", { task_id: loose.id }),
    ];

    const [decorated, untouched] = decorateProjectsWithStats(
      [project, other],
      [done, open, deleted, cancelled, loose],
      entries
    );

    // Deleted and cancelled tasks drop out of every counter.
    expect(decorated.task_count).toBe(2);
    expect(decorated.done_task_count).toBe(1);
    expect(decorated.open_task_count).toBe(1);
    expect(decorated.task_estimated_minutes).toBe(75);
    // Time is attributed through the task, so the loose entry does not count.
    expect(decorated.actual_seconds).toBe(2400);
    // A hand-written estimate (in hours) is kept separate from the task roll-up.
    expect(decorated.estimated_hours).toBe(12.5);

    expect(untouched.task_count).toBe(0);
    expect(untouched.task_estimated_minutes).toBe(0);
    expect(untouched.actual_seconds).toBe(0);
  });

  it("counts entries tracked against the project itself exactly once", () => {
    const project = makeProject();
    const task = makeTask({ project_id: project.id });
    const entries = [
      makeEntry("2026-11-11T09:00:00.000Z", "2026-11-11T10:00:00.000Z", {
        project_id: project.id,
      }),
      makeEntry("2026-11-11T11:00:00.000Z", "2026-11-11T11:30:00.000Z", { task_id: task.id }),
      // Names both: it is attributed to the task side only.
      makeEntry("2026-11-11T12:00:00.000Z", "2026-11-11T13:00:00.000Z", {
        task_id: task.id,
        project_id: project.id,
      }),
    ];

    const [decorated] = decorateProjectsWithStats([project], [task], entries);
    expect(decorated.actual_seconds).toBe(9000);
  });
});

describe("buildProjectEstimateAccuracy", () => {
  const NOW = new Date("2026-11-11T00:00:00.000Z");
  const RUNNING = "2026-11-20T00:00:00.000Z";

  it("weighs the project estimate against everything the project absorbed", () => {
    const project = makeProject({ name: "Launch", estimated_hours: 2, end_date: RUNNING });
    const other = makeProject({ name: "Other", end_date: RUNNING });
    const owned = makeTask({ project_id: project.id });
    const loose = makeTask({ project_id: null });

    const entries = [
      // Booked straight against the project.
      makeEntry("2026-11-11T09:00:00.000Z", "2026-11-11T10:00:00.000Z", {
        project_id: project.id,
      }),
      // Booked against one of its tasks.
      makeEntry("2026-11-11T10:00:00.000Z", "2026-11-11T10:30:00.000Z", { task_id: owned.id }),
      // Belongs to nothing, so it stays out of every project.
      makeEntry("2026-11-11T11:00:00.000Z", "2026-11-11T12:00:00.000Z", { task_id: loose.id }),
    ];

    const rows = buildProjectEstimateAccuracy([project, other], [owned, loose], entries, NOW);
    const [launch] = rows;

    expect(launch.projectId).toBe(project.id);
    expect(launch.estimatedSeconds).toBe(7200);
    expect(launch.actualSeconds).toBe(5400);
    expect(launch.ratio).toBe(0.75);
    expect(launch.status).toBe("under");
    // Neither an estimate nor time: not worth a row.
    expect(rows).toHaveLength(1);
  });

  it("keeps a running project with time but no estimate, and sorts by estimate", () => {
    const big = makeProject({ name: "Big", estimated_hours: 5, end_date: RUNNING });
    const small = makeProject({ name: "Small", estimated_hours: 1, end_date: RUNNING });
    const noEstimate = makeProject({ name: "Ad hoc", end_date: RUNNING });
    const task = makeTask({ project_id: noEstimate.id });

    const entries = [makeEntry("2026-11-11T09:00:00.000Z", "2026-11-11T09:10:00.000Z", {
      task_id: task.id,
    })];

    const rows = buildProjectEstimateAccuracy([noEstimate, small, big], [task], entries, NOW);

    expect(rows.map((row) => row.name)).toEqual(["Big", "Small", "Ad hoc"]);
    expect(rows[2].estimatedSeconds).toBeNull();
    expect(rows[2].ratio).toBeNull();
    expect(rows[2].status).toBe("unknown");
    expect(rows[2].actualSeconds).toBe(600);
  });

  it("lists only the projects that are under way right now", () => {
    const openEnded = makeProject({ name: "Ongoing", estimated_hours: 3 });
    const ended = makeProject({
      name: "Shipped",
      estimated_hours: 4,
      start_date: "2026-10-01T00:00:00.000Z",
      end_date: "2026-11-01T00:00:00.000Z",
    });
    const upcoming = makeProject({
      name: "Later",
      estimated_hours: 4,
      start_date: "2027-01-01T00:00:00.000Z",
      end_date: "2027-02-01T00:00:00.000Z",
    });
    const running = makeProject({
      name: "In flight",
      estimated_hours: 4,
      start_date: "2026-11-01T00:00:00.000Z",
      end_date: RUNNING,
    });

    const rows = buildProjectEstimateAccuracy([openEnded, ended, upcoming, running], [], [], NOW);

    expect(rows.map((row) => row.name)).toEqual(["In flight"]);
  });

  it("treats a project without a start date as already running", () => {
    const noStart = makeProject({ name: "Rolling", estimated_hours: 2, end_date: RUNNING });

    const rows = buildProjectEstimateAccuracy([noStart], [], [], NOW);

    expect(rows.map((row) => row.name)).toEqual(["Rolling"]);
  });
});

describe("projectTimelineRange", () => {
  const now = new Date("2026-11-11T10:00:00.000Z");

  it("falls back to a two-week window around today when nothing is planned", () => {
    const range = projectTimelineRange([], "UTC", now);
    expect(range.start.toISOString()).toBe("2026-11-04T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-11-19T00:00:00.000Z");
  });

  it("pads the span of the planned windows by whole days", () => {
    const range = projectTimelineRange(
      [
        makeProject({
          start_date: "2026-11-10T00:00:00.000Z",
          end_date: "2026-11-12T00:00:00.000Z",
        }),
      ],
      "UTC",
      now
    );
    expect(range.start.toISOString()).toBe("2026-11-07T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-11-16T00:00:00.000Z");
  });
});

describe("buildProjectTimeline", () => {
  const now = new Date("2026-11-11T00:00:00.000Z");
  const range = {
    start: new Date("2026-11-01T00:00:00.000Z"),
    end: new Date("2026-12-01T00:00:00.000Z"),
  };

  function withStats(project: Project): ProjectWithStats {
    return {
      ...project,
      task_count: 0,
      open_task_count: 0,
      done_task_count: 0,
      task_estimated_minutes: 0,
      actual_seconds: 0,
    };
  }

  it("orders bars by start time and derives the quadrant", () => {
    const early = makeProject({
      name: "Early",
      start_date: "2026-11-05T00:00:00.000Z",
      end_date: "2026-11-07T00:00:00.000Z",
      is_important: true,
    });
    const late = makeProject({
      name: "Late",
      start_date: "2026-11-10T00:00:00.000Z",
      end_date: "2026-11-12T00:00:00.000Z",
    });

    const items = buildProjectTimeline([withStats(late), withStats(early)], range, now);
    expect(items.map((item) => item.project.name)).toEqual(["Early", "Late"]);
    expect(items[0].quadrant).toBe("plan");
    expect(items[0].offsetMs).toBe(
      new Date("2026-11-05T00:00:00.000Z").getTime() - range.start.getTime()
    );
  });

  it("pins an undated project to today as a one-day placeholder", () => {
    const [item] = buildProjectTimeline([withStats(makeProject({ name: "Someday" }))], range, now);
    expect(item.isUnscheduled).toBe(true);
    expect(item.startMs).toBe(now.getTime());
    expect(item.durationMs).toBe(24 * 60 * 60 * 1000);
  });

  it("gives overlapping projects separate lanes and shares the lane count", () => {
    const a = makeProject({
      name: "A",
      start_date: "2026-11-05T00:00:00.000Z",
      end_date: "2026-11-09T00:00:00.000Z",
    });
    const b = makeProject({
      name: "B",
      start_date: "2026-11-07T00:00:00.000Z",
      end_date: "2026-11-11T00:00:00.000Z",
    });
    const standalone = makeProject({
      name: "C",
      start_date: "2026-11-20T00:00:00.000Z",
      end_date: "2026-11-22T00:00:00.000Z",
    });

    const items = buildProjectTimeline(
      [withStats(a), withStats(b), withStats(standalone)],
      range,
      now
    );
    const byName = new Map(items.map((item) => [item.project.name, item]));
    expect(byName.get("A")!.lane).toBe(0);
    expect(byName.get("B")!.lane).toBe(1);
    expect(byName.get("A")!.laneCount).toBe(2);
    expect(byName.get("B")!.laneCount).toBe(2);
    // A cluster that overlaps nothing keeps the full width.
    expect(byName.get("C")!.lane).toBe(0);
    expect(byName.get("C")!.laneCount).toBe(1);
  });
});

describe("project priority", () => {
  const now = new Date("2026-11-11T00:00:00.000Z");
  const range = {
    start: new Date("2026-11-01T00:00:00.000Z"),
    end: new Date("2026-12-01T00:00:00.000Z"),
  };

  function withStats(project: Project): ProjectWithStats {
    return {
      ...project,
      task_count: 0,
      open_task_count: 0,
      done_task_count: 0,
      task_estimated_minutes: 0,
      actual_seconds: 0,
    };
  }

  /** Two windows that overlap; the later one holds the better priority. */
  const overlapping = () => [
    withStats(
      makeProject({
        name: "Low",
        start_date: "2026-11-05T00:00:00.000Z",
        end_date: "2026-11-09T00:00:00.000Z",
        sort_order: 5,
      })
    ),
    withStats(
      makeProject({
        name: "High",
        start_date: "2026-11-07T00:00:00.000Z",
        end_date: "2026-11-11T00:00:00.000Z",
        sort_order: 1,
      })
    ),
  ];

  it("gives the left-most lane to the higher priority, not the earlier start", () => {
    const items = buildProjectTimeline(overlapping(), range, now);
    const byName = new Map(items.map((item) => [item.project.name, item]));
    expect(byName.get("High")!.lane).toBe(0);
    expect(byName.get("Low")!.lane).toBe(1);
  });

  it("swaps the priorities of the bars it shares a lane group with", () => {
    const items = buildProjectTimeline(overlapping(), range, now);
    const low = items.find((item) => item.project.name === "Low")!;
    const high = items.find((item) => item.project.name === "High")!;

    expect(planProjectReorder(items, low.project.id, -1)).toEqual([
      { id: low.project.id, sort_order: 1 },
      { id: high.project.id, sort_order: 5 },
    ]);
  });

  it("does nothing for a project that overlaps nobody, or for a zero shift", () => {
    const items = buildProjectTimeline(
      [
        ...overlapping(),
        withStats(
          makeProject({
            name: "Solo",
            start_date: "2026-11-25T00:00:00.000Z",
            end_date: "2026-11-27T00:00:00.000Z",
            sort_order: 9,
          })
        ),
      ],
      range,
      now
    );
    const byName = new Map(items.map((item) => [item.project.name, item]));
    expect(planProjectReorder(items, byName.get("Solo")!.project.id, 1)).toEqual([]);
    expect(planProjectReorder(items, byName.get("Low")!.project.id, 0)).toEqual([]);
  });
});

describe("settings reorder", () => {
  /** Three projects already listed in priority order. */
  const list = () => [
    makeProject({ name: "A", sort_order: 0 }),
    makeProject({ name: "B", sort_order: 1 }),
    makeProject({ name: "C", sort_order: 2 }),
  ];

  it("renumbers the whole list when a row is lifted to the top", () => {
    const projects = list();
    expect(planProjectMove(projects, 2, 0)).toEqual([
      { id: projects[2].id, sort_order: 0 },
      { id: projects[0].id, sort_order: 1 },
      { id: projects[1].id, sort_order: 2 },
    ]);
  });

  it("leaves rows that do not change slot out of the patch set", () => {
    const projects = list();
    expect(planProjectMove(projects, 1, 2)).toEqual([
      { id: projects[2].id, sort_order: 1 },
      { id: projects[1].id, sort_order: 2 },
    ]);
  });

  it("is a no-op when the row is dropped back where it started", () => {
    expect(planProjectMove(list(), 1, 1)).toEqual([]);
  });

  it("replaces gaps and duplicates with a dense sequence", () => {
    const projects = [
      makeProject({ name: "A", sort_order: 4 }),
      makeProject({ name: "B", sort_order: 4 }),
    ];
    expect(planProjectMove(projects, 0, 1)).toEqual([
      { id: projects[1].id, sort_order: 0 },
      { id: projects[0].id, sort_order: 1 },
    ]);
  });
});
