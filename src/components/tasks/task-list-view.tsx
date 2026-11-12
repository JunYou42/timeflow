"use client";

import { useMemo } from "react";
import { CalendarDays, Timer } from "lucide-react";
import { toast } from "sonner";

import { CategoryDot, TaskPriorityBadge } from "@/components/tasks/task-meta";
import { TaskRowActions } from "@/components/tasks/task-row-actions";
import { Checkbox } from "@/components/ui/checkbox";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { formatDateLabel, formatDuration } from "@/lib/time";
import {
  TASK_STATUS_LABELS,
  type TaskStatus,
  type TaskWithStats,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { describeError, useAppStore } from "@/store/use-app-store";

const STATUS_ORDER: TaskStatus[] = ["in_progress", "todo", "done", "cancelled"];

interface ProjectGroup {
  key: string;
  title: string;
  /** Project colour, or null for the trailing "No project" bucket. */
  color: string | null;
  items: TaskWithStats[];
}

function compareWithinGroup(a: TaskWithStats, b: TaskWithStats): number {
  const byStatus = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
  if (byStatus !== 0) return byStatus;
  const aDue = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
  const bDue = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
  if (aDue !== bDue) return aDue - bDue;
  return a.title.localeCompare(b.title);
}

export function TaskListView({
  tasks,
  onOpenTask,
}: {
  tasks: TaskWithStats[];
  onOpenTask: (id: string) => void;
}) {
  const timezone = useUserTimezone();
  const projects = useAppStore((state) => state.projects);
  const categories = useAppStore((state) => state.categories);
  const updateTask = useAppStore((state) => state.updateTask);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );

  const groups = useMemo<ProjectGroup[]>(() => {
    // Projects come in the order the projects page shows them, and tasks with
    // no project are collected into a trailing bucket: that is the pile worth
    // triaging. Inside a group the status order is kept, so the reading order
    // is still "what is moving first".
    const ordered: ProjectGroup[] = [...projects]
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
      .map((project) => ({
        key: project.id,
        title: project.name,
        color: project.color,
        items: [],
      }));

    const byProjectId = new Map(ordered.map((group) => [group.key, group]));
    const unassigned: ProjectGroup = {
      key: "no-project",
      title: "No project",
      color: null,
      items: [],
    };

    for (const task of tasks) {
      const group = (task.project_id ? byProjectId.get(task.project_id) : undefined) ?? unassigned;
      group.items.push(task);
    }

    return [...ordered, unassigned]
      .filter((group) => group.items.length > 0)
      .map((group) => ({ ...group, items: group.items.sort(compareWithinGroup) }));
  }, [projects, tasks]);

  const toggleDone = async (task: TaskWithStats, checked: boolean) => {
    try {
      await updateTask(task.id, {
        status: checked ? "done" : "todo",
        completed_at: checked ? new Date().toISOString() : null,
      });
    } catch (error) {
      toast.error("Could not update the task", { description: describeError(error) });
    }
  };

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.key} className="space-y-2">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            {group.color ? <CategoryDot color={group.color} /> : null}
            <span className="truncate">{group.title}</span>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {group.items.length}
            </span>
          </h3>
          <ul className="divide-y rounded-lg border bg-background">
            {group.items.map((task) => {
              const category = task.category_id ? categoryById.get(task.category_id) : undefined;
              const overdue =
                task.due_date !== null &&
                task.status !== "done" &&
                task.status !== "cancelled" &&
                new Date(task.due_date).getTime() < Date.now();
              return (
                <li key={task.id} className="flex items-start gap-3 p-3">
                  <Checkbox
                    className="mt-0.5"
                    checked={task.status === "done"}
                    onCheckedChange={(checked) => void toggleDone(task, checked === true)}
                    aria-label={`Mark ${task.title} as done`}
                  />
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => onOpenTask(task.id)}
                  >
                    <p
                      className={cn(
                        "truncate text-sm",
                        task.status === "done" && "text-muted-foreground line-through"
                      )}
                    >
                      {task.parent_task_id ? "↳ " : ""}
                      {task.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {/* The group already says which project this is, so the
                          row carries the status that grouping no longer shows. */}
                      {TASK_STATUS_LABELS[task.status]}
                      {category ? (
                        <span className="flex items-center gap-1">
                          <CategoryDot color={category.color} />
                          {category.name}
                        </span>
                      ) : null}
                      {task.due_date ? (
                        <span className={cn("flex items-center gap-1", overdue && "text-destructive")}>
                          <CalendarDays className="size-3" />
                          {formatDateLabel(task.due_date, timezone)}
                        </span>
                      ) : null}
                      {task.actual_seconds > 0 ? (
                        <span className="flex items-center gap-1">
                          <Timer className="size-3" />
                          {formatDuration(task.actual_seconds)}
                        </span>
                      ) : null}
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <TaskPriorityBadge priority={task.priority} className="hidden sm:inline-flex" />
                    <TaskRowActions task={task} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
