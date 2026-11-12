"use client";

import { useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, GripVertical, ListTree, Timer } from "lucide-react";
import { toast } from "sonner";

import { CategoryDot, TaskPriorityBadge } from "@/components/tasks/task-meta";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { formatDateLabel, formatDuration } from "@/lib/time";
import {
  TASK_STATUS_LABELS,
  type TaskStatus,
  type TaskWithStats,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { describeError, useAppStore } from "@/store/use-app-store";

const COLUMNS: TaskStatus[] = ["todo", "in_progress", "done", "cancelled"];

const COLUMN_ACCENT: Record<TaskStatus, string> = {
  todo: "bg-slate-400",
  in_progress: "bg-blue-500",
  done: "bg-emerald-500",
  cancelled: "bg-slate-300",
};

export function TaskBoardView({
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

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<TaskStatus | null>(null);

  const projectName = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects]
  );
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );

  const columns = useMemo(
    () =>
      COLUMNS.map((status) => ({
        status,
        items: tasks.filter((task) => task.status === status),
      })),
    [tasks]
  );

  const move = async (taskId: string, status: TaskStatus) => {
    const task = tasks.find((item) => item.id === taskId);
    if (!task || task.status === status) return;
    try {
      await updateTask(taskId, {
        status,
        completed_at: status === "done" ? new Date().toISOString() : null,
      });
    } catch (error) {
      toast.error("Could not move the task", { description: describeError(error) });
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {columns.map((column) => (
        <div
          key={column.status}
          onDragOver={(event) => {
            event.preventDefault();
            setDropTarget(column.status);
          }}
          onDragLeave={() => setDropTarget((current) => (current === column.status ? null : current))}
          onDrop={(event) => {
            event.preventDefault();
            setDropTarget(null);
            const taskId = event.dataTransfer.getData("text/plain") || draggingId;
            if (taskId) void move(taskId, column.status);
            setDraggingId(null);
          }}
          className={cn(
            "flex min-h-[180px] flex-col rounded-lg border bg-muted/40 p-3 transition-colors",
            dropTarget === column.status && "border-primary bg-accent/60"
          )}
        >
          <div className="mb-3 flex items-center gap-2">
            <span className={cn("size-2 rounded-full", COLUMN_ACCENT[column.status])} />
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {TASK_STATUS_LABELS[column.status]}
            </h3>
            <span className="ml-auto rounded-full bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {column.items.length}
            </span>
          </div>

          <div className="space-y-2">
            {column.items.map((task) => {
              const category = task.category_id ? categoryById.get(task.category_id) : undefined;
              const overdue =
                task.due_date !== null &&
                task.status !== "done" &&
                task.status !== "cancelled" &&
                new Date(task.due_date).getTime() < Date.now();
              return (
                <article
                  key={task.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/plain", task.id);
                    event.dataTransfer.effectAllowed = "move";
                    setDraggingId(task.id);
                  }}
                  onDragEnd={() => {
                    setDraggingId(null);
                    setDropTarget(null);
                  }}
                  onClick={() => onOpenTask(task.id)}
                  className={cn(
                    "group cursor-pointer rounded-md border bg-background p-3 shadow-sm transition-shadow hover:shadow",
                    draggingId === task.id && "opacity-50"
                  )}
                >
                  <div className="flex items-start gap-1.5">
                    <GripVertical className="mt-0.5 size-3.5 shrink-0 text-muted-foreground/40" />
                    <p className="min-w-0 flex-1 text-sm font-medium leading-snug">{task.title}</p>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <TaskPriorityBadge priority={task.priority} className="text-[10px]" />
                    {category ? (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <CategoryDot color={category.color} />
                        {category.name}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    {task.project_id ? <span>{projectName.get(task.project_id)}</span> : null}
                    {task.due_date ? (
                      <span className={cn("flex items-center gap-1", overdue && "text-destructive")}>
                        <CalendarDays className="size-3" />
                        {formatDateLabel(task.due_date, timezone)}
                      </span>
                    ) : null}
                    {task.completed_at ? (
                      <span className="flex items-center gap-1" title="Completed">
                        <CheckCircle2 className="size-3" />
                        {formatDateLabel(task.completed_at, timezone)}
                      </span>
                    ) : null}
                    {task.actual_seconds > 0 ? (
                      <span className="flex items-center gap-1">
                        <Timer className="size-3" />
                        {formatDuration(task.actual_seconds)}
                      </span>
                    ) : null}
                    {task.subtask_count > 0 ? (
                      <span className="flex items-center gap-1">
                        <ListTree className="size-3" />
                        {task.subtasks_done_count}/{task.subtask_count}
                      </span>
                    ) : null}
                  </div>
                </article>
              );
            })}
            {column.items.length === 0 ? (
              <p className="rounded-md border border-dashed bg-background/60 px-3 py-6 text-center text-xs text-muted-foreground">
                Drop tasks here
              </p>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
