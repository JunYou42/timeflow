"use client";

import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { TaskSelect } from "@/components/tasks/task-select";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { parseLocalInputValue, toLocalInputValue } from "@/lib/time";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from "@/lib/types";
import { taskFormSchema, parseOptionalWholeNumber, type TaskFormValues } from "@/lib/validation";
import { describeError, useAppStore } from "@/store/use-app-store";

const NONE = "__none__";

export interface TaskFormDefaults {
  title?: string;
  description?: string;
  project_id?: string | null;
  category_id?: string | null;
  parent_task_id?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string | null;
  estimated_minutes?: number | null;
}

interface TaskFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass a task to edit; omit to create. */
  task?: Task | null;
  defaults?: TaskFormDefaults;
  onCreated?: (task: Task) => void;
}

export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  defaults,
  onCreated,
}: TaskFormDialogProps) {
  const timezone = useUserTimezone();
  const projects = useAppStore((state) => state.projects);
  const categories = useAppStore((state) => state.categories);
  const tasks = useAppStore((state) => state.tasks);
  const createTask = useAppStore((state) => state.createTask);
  const updateTask = useAppStore((state) => state.updateTask);

  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isEditing = Boolean(task);

  const emptyValues = useMemo<TaskFormValues>(
    () => ({
      title: "",
      description: "",
      project_id: undefined,
      category_id: undefined,
      parent_task_id: undefined,
      status: "todo",
      priority: "medium",
      // A task is picked up the day it is written down, so the due date opens on
      // today instead of empty. 9am keeps the field tidy -- the day is the point,
      // and the hour can be nudged when it matters.
      due_date: `${toLocalInputValue(new Date(), timezone).slice(0, 10)}T09:00`,
      completed_at: undefined,
      estimated_minutes: undefined,
    }),
    [timezone]
  );

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    if (task) {
      form.reset({
        title: task.title,
        description: task.description ?? "",
        project_id: task.project_id ?? undefined,
        category_id: task.category_id ?? undefined,
        parent_task_id: task.parent_task_id ?? undefined,
        status: task.status,
        priority: task.priority,
        due_date: task.due_date ? toLocalInputValue(task.due_date, timezone) : undefined,
        completed_at: task.completed_at ? toLocalInputValue(task.completed_at, timezone) : undefined,
        estimated_minutes:
          task.estimated_minutes === null ? undefined : String(task.estimated_minutes),
      });
      return;
    }
    form.reset({
      ...emptyValues,
      ...defaults,
      project_id: defaults?.project_id ?? undefined,
      category_id: defaults?.category_id ?? undefined,
      parent_task_id: defaults?.parent_task_id ?? undefined,
      due_date: defaults?.due_date ?? emptyValues.due_date,
      estimated_minutes:
        defaults?.estimated_minutes === null || defaults?.estimated_minutes === undefined
          ? undefined
          : String(defaults.estimated_minutes),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task, timezone]);

  const parentCandidates = useMemo(
    () => tasks.filter((item) => !item.deleted_at && item.parent_task_id === null),
    [tasks]
  );

  // A task cannot be filed under a project that has already finished -- unless
  // that is where it already lives, so opening an old task keeps its link.
  const selectedProjectId = form.watch("project_id");
  const status = form.watch("status");
  const projectCandidates = useMemo(() => {
    const now = Date.now();
    return projects
      .filter(
        (project) =>
          project.id === selectedProjectId ||
          !project.end_date ||
          new Date(project.end_date).getTime() > now
      )
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }, [projects, selectedProjectId]);

  const onSubmit = form.handleSubmit(async (values) => {
    setPending(true);
    setFormError(null);
    try {
      const dueIso = values.due_date
        ? parseLocalInputValue(String(values.due_date), timezone)?.toISOString() ?? null
        : null;
      // Status is the source of truth: a task that is not done has no completion
      // date, and a done task with the field left blank falls back to the
      // repository's "now" so the date is never a lie.
      const completedIso =
        values.status === "done" && values.completed_at
          ? parseLocalInputValue(String(values.completed_at), timezone)?.toISOString() ?? null
          : null;
      const estimated = parseOptionalWholeNumber(values.estimated_minutes);

      if (task) {
        await updateTask(task.id, {
          title: values.title,
          description: values.description ? String(values.description) : null,
          project_id: values.project_id ?? null,
          category_id: values.category_id ?? null,
          parent_task_id: values.parent_task_id ?? null,
          status: values.status as TaskStatus,
          priority: values.priority as TaskPriority,
          due_date: dueIso,
          completed_at: completedIso,
          estimated_minutes: estimated,
        });
        toast.success("Task updated");
        onOpenChange(false);
        return;
      }

      const created = await createTask({
        title: values.title,
        description: values.description ? String(values.description) : null,
        project_id: values.project_id ?? null,
        category_id: values.category_id ?? null,
        parent_task_id: values.parent_task_id ?? null,
        status: (values.status as TaskStatus) ?? "todo",
        priority: (values.priority as TaskPriority) ?? "medium",
        due_date: dueIso,
        completed_at: completedIso,
        estimated_minutes: estimated,
      });
      toast.success("Task created");
      onOpenChange(false);
      onCreated?.(created);
    } catch (error) {
      const message = describeError(error);
      setFormError(message);
      toast.error(isEditing ? "Could not update task" : "Could not create task", {
        description: message,
      });
    } finally {
      setPending(false);
    }
  });

  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update the details. Tracked time is preserved."
              : "Capture what needs to be done. You can schedule it later."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" id="task-form">
          <div className="space-y-2">
            <Label htmlFor="task-title">Title</Label>
            <Input id="task-title" autoFocus placeholder="What needs to be done?" {...form.register("title")} />
            {errors.title ? <p className="text-xs text-destructive">{errors.title.message}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              rows={3}
              placeholder="Notes, links, acceptance criteria…"
              {...form.register("description")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Project</Label>
              <Select
                value={form.watch("project_id") ?? NONE}
                onValueChange={(value) =>
                  form.setValue("project_id", value === NONE ? undefined : value, {
                    shouldDirty: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="No project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No project</SelectItem>
                  {projectCandidates.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={form.watch("category_id") ?? NONE}
                onValueChange={(value) =>
                  form.setValue("category_id", value === NONE ? undefined : value, {
                    shouldDirty: true,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="No category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No category</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      <span
                        className="mr-2 inline-block size-2 rounded-full align-middle"
                        style={{ backgroundColor: category.color }}
                      />
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(value) =>
                  form.setValue("status", value as TaskStatus, { shouldDirty: true })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {TASK_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select
                value={form.watch("priority")}
                onValueChange={(value) =>
                  form.setValue("priority", value as TaskPriority, { shouldDirty: true })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TASK_PRIORITIES.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {TASK_PRIORITY_LABELS[priority]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="task-due">Due date</Label>
              <Input id="task-due" type="datetime-local" {...form.register("due_date")} />
              {errors.due_date ? (
                <p className="text-xs text-destructive">{errors.due_date.message}</p>
              ) : null}
            </div>

            {status === "done" ? (
              <div className="space-y-2">
                <Label htmlFor="task-completed">Completed at</Label>
                <Input
                  id="task-completed"
                  type="datetime-local"
                  {...form.register("completed_at")}
                />
                {errors.completed_at ? (
                  <p className="text-xs text-destructive">{errors.completed_at.message}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Leave blank to record the moment you save.
                  </p>
                )}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="task-estimate">Estimated minutes</Label>
              <Input
                id="task-estimate"
                type="number"
                min={0}
                step={5}
                placeholder="e.g. 90"
                {...form.register("estimated_minutes")}
              />
              {errors.estimated_minutes ? (
                <p className="text-xs text-destructive">{errors.estimated_minutes.message}</p>
              ) : null}
            </div>
          </div>

          {!isEditing ? (
            <div className="space-y-2">
              <Label>Parent task (optional)</Label>
              <TaskSelect
                value={form.watch("parent_task_id") ?? undefined}
                onChange={(value) =>
                  form.setValue("parent_task_id", value, { shouldDirty: true })
                }
                noneLabel="No parent"
                placeholder="Make this a subtask of…"
                allowNone
                excludeTaskId={task?.id}
              />
              {parentCandidates.length === 0 ? (
                <p className="text-xs text-muted-foreground">No tasks available yet.</p>
              ) : null}
            </div>
          ) : null}

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="task-form" disabled={pending}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {isEditing ? "Save changes" : "Create task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
