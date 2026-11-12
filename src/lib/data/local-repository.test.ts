import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LocalRepository } from "@/lib/data/local-repository";
import { buildDailyTrend, entriesWithinRange, secondsWithinRange } from "@/lib/stats";
import type { TaskInsert } from "@/lib/types";

/**
 * Integration coverage for the acceptance flow on the Local Mode adapter:
 * create a task -> schedule it -> start the timer -> stop it -> the entry is
 * persisted, shows up in the logs and is what the dashboard/analytics read.
 */

const T0 = new Date("2026-11-11T09:00:00.000Z");

function taskInput(overrides: Partial<TaskInsert> = {}): TaskInsert {
  return {
    title: "Write the acceptance test",
    description: null,
    project_id: null,
    category_id: null,
    parent_task_id: null,
    status: "todo",
    priority: "medium",
    due_date: null,
    estimated_minutes: 60,
    ...overrides,
  };
}

function dayRange(day: string) {
  const start = new Date(`${day}T00:00:00.000Z`);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(T0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LocalRepository acceptance flow", () => {
  it("persists a task, its schedule and the tracked time", async () => {
    const repo = new LocalRepository();

    const task = await repo.createTask(taskInput());
    const schedule = await repo.createSchedule({
      title: task.title,
      task_id: task.id,
      schedule_type: "task",
      start_at: "2026-11-11T10:00:00.000Z",
      end_at: "2026-11-11T11:00:00.000Z",
    });
    expect(schedule.task_id).toBe(task.id);

    const session = await repo.startTimer(task.id, null);
    expect(session.status).toBe("running");
    expect(session.task_id).toBe(task.id);

    // 25 minutes pass, then the user stops the timer.
    vi.setSystemTime(new Date(T0.getTime() + 25 * 60 * 1000));
    const { entry } = await repo.stopTimer(session.id);

    expect(entry).not.toBeNull();
    expect(entry?.task_id).toBe(task.id);
    expect(entry?.source).toBe("timer");
    expect(entry?.duration_seconds).toBe(1500);

    // The timer is no longer active and the record survived.
    expect(await repo.listActiveTimers()).toHaveLength(0);

    const stored = await repo.listTimeEntries();
    expect(stored.some((row) => row.id === entry?.id)).toBe(true);
    expect(entriesWithinRange(stored, dayRange("2026-11-11")).some((row) => row.id === entry?.id)).toBe(
      true
    );

    // Analytics compute the duration from the saved record, not a UI estimate.
    expect(secondsWithinRange([entry!], dayRange("2026-11-11"))).toBe(1500);
    expect(buildDailyTrend([entry!], dayRange("2026-11-11"), "UTC")[0].seconds).toBe(1500);

    // A fresh instance reads the same data back out of localStorage.
    const reloaded = new LocalRepository();
    expect((await reloaded.listTimeEntries()).some((row) => row.id === entry?.id)).toBe(true);
    expect((await reloaded.listSchedules()).some((row) => row.id === schedule.id)).toBe(true);
  });

  it("runs several timers in parallel and records each one separately", async () => {
    const repo = new LocalRepository();
    const task = await repo.createTask(taskInput());

    const first = await repo.startTimer(task.id, null);

    vi.setSystemTime(new Date(T0.getTime() + 10 * 60 * 1000));
    const paused = await repo.pauseTimer(first.id);
    expect(paused.status).toBe("paused");
    expect(paused.accumulated_seconds).toBe(600);

    // A second timer can be opened while the first one is paused.
    const second = await repo.startTimer(null, null);
    expect(second.id).not.toBe(first.id);
    expect((await repo.listActiveTimers()).map((row) => row.id).sort()).toEqual(
      [first.id, second.id].sort()
    );

    // Paused time does not accrue, and neither session disturbs the other.
    vi.setSystemTime(new Date(T0.getTime() + 30 * 60 * 1000));
    const resumed = await repo.resumeTimer(first.id);
    expect(resumed.status).toBe("running");
    expect((await repo.listActiveTimers()).some((row) => row.id === first.id)).toBe(true);

    vi.setSystemTime(new Date(T0.getTime() + 35 * 60 * 1000));
    const { entry } = await repo.stopTimer(first.id);
    expect(entry?.duration_seconds).toBe(900);

    // Only the stopped session left the list; the other one is still running.
    expect((await repo.listActiveTimers()).map((row) => row.id)).toEqual([second.id]);

    // Tracking the same thing twice hands back the open session, not a third.
    const again = await repo.startTimer(null, null);
    expect(again.id).toBe(second.id);
    expect(await repo.listActiveTimers()).toHaveLength(1);

    const tracked = (await repo.listTimeEntries()).filter((row) => row.task_id === task.id);
    expect(tracked).toHaveLength(1);
    expect(tracked[0].duration_seconds).toBe(900);
  });

  it("keeps the tracked time when the task is deleted", async () => {
    const repo = new LocalRepository();
    const task = await repo.createTask(taskInput());

    const session = await repo.startTimer(task.id, null);
    vi.setSystemTime(new Date(T0.getTime() + 25 * 60 * 1000));
    const { entry } = await repo.stopTimer(session.id);

    await repo.deleteTask(task.id);

    expect((await repo.listTasks()).some((row) => row.id === task.id)).toBe(false);
    const archived = (await repo.listTasks({ includeDeleted: true })).find((row) => row.id === task.id);
    expect(archived?.deleted_at).toBeTruthy();

    // History is untouched: the entry is still there with its real duration.
    const stored = await repo.listTimeEntries();
    expect(stored.find((row) => row.id === entry?.id)?.duration_seconds).toBe(1500);
  });
});
