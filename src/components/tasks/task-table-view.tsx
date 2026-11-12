"use client";

import { useMemo } from "react";
import { ListTree } from "lucide-react";

import { CategoryDot, TaskPriorityBadge, TaskStatusBadge } from "@/components/tasks/task-meta";
import { TaskRowActions } from "@/components/tasks/task-row-actions";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { estimationRatio } from "@/lib/stats";
import { formatDateLabel, formatDuration, minutesToSeconds } from "@/lib/time";
import type { TaskWithStats } from "@/lib/types";
import { useAppStore } from "@/store/use-app-store";

export function TaskTableView({
  tasks,
  onOpenTask,
}: {
  tasks: TaskWithStats[];
  onOpenTask: (id: string) => void;
}) {
  const timezone = useUserTimezone();
  const projects = useAppStore((state) => state.projects);
  const categories = useAppStore((state) => state.categories);

  const projectName = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects]
  );
  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );

  return (
    <div className="rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-[220px]">Task</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Priority</TableHead>
            <TableHead className="hidden lg:table-cell">Project</TableHead>
            <TableHead className="hidden lg:table-cell">Category</TableHead>
            <TableHead className="hidden sm:table-cell">Due</TableHead>
            <TableHead className="hidden sm:table-cell">Completed</TableHead>
            <TableHead className="hidden xl:table-cell">Estimate</TableHead>
            <TableHead>Tracked</TableHead>
            <TableHead className="hidden xl:table-cell">Progress</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => {
            const category = task.category_id ? categoryById.get(task.category_id) : undefined;
            const estimate = estimationRatio(minutesToSeconds(task.estimated_minutes), task.actual_seconds);
            const percent = estimate.ratio === null ? null : Math.min(100, Math.round(estimate.ratio * 100));
            const overdue =
              task.due_date !== null &&
              task.status !== "done" &&
              task.status !== "cancelled" &&
              new Date(task.due_date).getTime() < Date.now();

            return (
              <TableRow
                key={task.id}
                className="cursor-pointer"
                onClick={() => onOpenTask(task.id)}
              >
                <TableCell className="font-medium">
                  <span className="flex items-center gap-1.5">
                    {task.parent_task_id ? (
                      <span className="text-muted-foreground">↳</span>
                    ) : null}
                    <span className="truncate">{task.title}</span>
                  </span>
                  {task.subtask_count > 0 ? (
                    <span className="mt-0.5 flex items-center gap-1 text-xs font-normal text-muted-foreground">
                      <ListTree className="size-3" />
                      {task.subtasks_done_count}/{task.subtask_count} subtasks
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <TaskStatusBadge status={task.status} />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <TaskPriorityBadge priority={task.priority} />
                </TableCell>
                <TableCell className="hidden lg:table-cell text-muted-foreground">
                  {task.project_id ? projectName.get(task.project_id) ?? "—" : "—"}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  {category ? (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <CategoryDot color={category.color} />
                      {category.name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className={overdue ? "hidden text-destructive sm:table-cell" : "hidden text-muted-foreground sm:table-cell"}>
                  {task.due_date ? formatDateLabel(task.due_date, timezone) : "—"}
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  {task.completed_at ? formatDateLabel(task.completed_at, timezone) : "—"}
                </TableCell>
                <TableCell className="hidden xl:table-cell text-muted-foreground tabular-nums">
                  {task.estimated_minutes ? formatDuration(minutesToSeconds(task.estimated_minutes)) : "—"}
                </TableCell>
                <TableCell className="tabular-nums">
                  {task.actual_seconds > 0 ? formatDuration(task.actual_seconds) : "—"}
                </TableCell>
                <TableCell className="hidden xl:table-cell">
                  {percent === null ? (
                    <span className="text-xs text-muted-foreground">No estimate</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Progress
                        value={percent}
                        className={estimate.status === "over" ? "bg-red-100 [&>div]:bg-red-500" : undefined}
                      />
                      <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                        {percent}%
                      </span>
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <TaskRowActions task={task} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
