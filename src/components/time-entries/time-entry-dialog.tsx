"use client";

import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Trash2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";

import { TaskSelect } from "@/components/tasks/task-select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { formatDateLabel, formatDuration, parseLocalInputValue, toLocalInputValue } from "@/lib/time";
import type { TimeEntry } from "@/lib/types";
import { timeEntryFormSchema, type TimeEntryFormValues } from "@/lib/validation";
import { describeError, useAppStore } from "@/store/use-app-store";

const NONE = "__none__";

export interface TimeEntryDialogDefaults {
  task_id?: string | null;
  project_id?: string | null;
  category_id?: string | null;
  title?: string | null;
  start_at?: string;
  end_at?: string;
}

interface TimeEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry?: TimeEntry | null;
  defaults?: TimeEntryDialogDefaults;
  onSaved?: (entry: TimeEntry) => void;
}

/**
 * Manual time entry.
 *
 * Time entries are allowed without a task (commuting, breaks, unplanned work),
 * in which case a category is used for the analytics breakdown.
 */
export function TimeEntryDialog({
  open,
  onOpenChange,
  entry,
  defaults,
  onSaved,
}: TimeEntryDialogProps) {
  const timezone = useUserTimezone();
  const categories = useAppStore((state) => state.categories);
  const tasks = useAppStore((state) => state.tasks);
  const projects = useAppStore((state) => state.projects);
  const createTimeEntry = useAppStore((state) => state.createTimeEntry);
  const updateTimeEntry = useAppStore((state) => state.updateTimeEntry);
  const deleteTimeEntry = useAppStore((state) => state.deleteTimeEntry);

  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isEditing = Boolean(entry);

  const form = useForm<TimeEntryFormValues>({
    resolver: zodResolver(timeEntryFormSchema),
    defaultValues: {
      task_id: undefined,
      project_id: undefined,
      category_id: undefined,
      title: "",
      start_at: "",
      end_at: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    setDeleteOpen(false);
    if (entry) {
      form.reset({
        task_id: entry.task_id ?? undefined,
        project_id: entry.project_id ?? undefined,
        category_id: entry.category_id ?? undefined,
        title: entry.title ?? "",
        start_at: toLocalInputValue(entry.start_at, timezone),
        end_at: toLocalInputValue(entry.end_at, timezone),
        notes: entry.notes ?? "",
      });
      return;
    }
    form.reset({
      task_id: defaults?.task_id ?? undefined,
      project_id: defaults?.project_id ?? undefined,
      category_id: defaults?.category_id ?? undefined,
      title: defaults?.title ?? "",
      start_at: defaults?.start_at ?? toLocalInputValue(new Date(), timezone),
      end_at: defaults?.end_at ?? toLocalInputValue(new Date(Date.now() + 30 * 60_000), timezone),
      notes: "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry, timezone]);

  const startAt = form.watch("start_at");
  const endAt = form.watch("end_at");
  // The picker hands back one id; only one of the two links is ever set.
  const assignment = form.watch("task_id") ?? form.watch("project_id");
  const assignedProject = assignment
    ? projects.find((project) => project.id === assignment)
    : undefined;
  const assignedTask =
    assignment && !assignedProject ? tasks.find((task) => task.id === assignment) : undefined;
  // The category is never typed in while something is linked: it comes from
  // the task, or from the project when the record belongs to one.
  const derivedCategoryId = assignedProject?.category_id ?? assignedTask?.category_id ?? null;
  const derivedCategory = derivedCategoryId
    ? categories.find((category) => category.id === derivedCategoryId)
    : undefined;

  const durationSeconds = useMemo(() => {
    if (!startAt || !endAt) return null;
    const start = parseLocalInputValue(startAt, timezone);
    const end = parseLocalInputValue(endAt, timezone);
    if (!start || !end) return null;
    const seconds = Math.round((end.getTime() - start.getTime()) / 1000);
    return seconds > 0 ? seconds : null;
  }, [startAt, endAt, timezone]);

  const spansMidnight = useMemo(() => {
    if (!startAt || !endAt) return false;
    return startAt.slice(0, 10) !== endAt.slice(0, 10);
  }, [startAt, endAt]);

  const onSubmit = form.handleSubmit(async (values) => {
    setPending(true);
    setFormError(null);
    try {
      const start = parseLocalInputValue(values.start_at, timezone);
      const end = parseLocalInputValue(values.end_at, timezone);
      if (!start || !end) throw new Error("Invalid start or end time");

      const task = values.task_id ? tasks.find((item) => item.id === values.task_id) : undefined;
      const project = values.project_id
        ? projects.find((item) => item.id === values.project_id)
        : undefined;
      const payload = {
        task_id: values.task_id ?? null,
        project_id: values.project_id ?? null,
        category_id: task?.category_id ?? project?.category_id ?? values.category_id ?? null,
        title: values.title?.trim() ? values.title.trim() : task?.title ?? project?.name ?? null,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        notes: values.notes ? String(values.notes) : null,
      };

      if (entry) {
        const saved = await updateTimeEntry(entry.id, payload);
        toast.success("Time entry updated");
        onOpenChange(false);
        onSaved?.(saved);
        return;
      }
      const saved = await createTimeEntry({ ...payload, source: "manual" });
      toast.success("Time entry added", { description: formatDuration(saved.duration_seconds) });
      onOpenChange(false);
      onSaved?.(saved);
    } catch (error) {
      const message = describeError(error);
      setFormError(message);
      toast.error("Could not save the time entry", { description: message });
    } finally {
      setPending(false);
    }
  });

  const handleDelete = async () => {
    if (!entry) return;
    setDeleting(true);
    try {
      await deleteTimeEntry(entry.id);
      toast.success("Time entry deleted");
      setDeleteOpen(false);
      onOpenChange(false);
    } catch (error) {
      toast.error("Could not delete the entry", { description: describeError(error) });
    } finally {
      setDeleting(false);
    }
  };

  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit time entry" : "Add time entry"}</DialogTitle>
          <DialogDescription>
            Record time you spent outside the timer — commuting, breaks or unplanned work.
          </DialogDescription>
        </DialogHeader>

        <form id="time-entry-form" onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Task or project</Label>
            <TaskSelect
              value={assignment ?? undefined}
              onChange={(value) => {
                const project = value ? projects.find((item) => item.id === value) : undefined;
                form.setValue("task_id", project ? undefined : value, { shouldDirty: true });
                form.setValue("project_id", project ? value : undefined, { shouldDirty: true });
              }}
              allowNone
              includeProjects
              placeholder="Select a task or project"
              noneLabel="No task or project"
            />
          </div>

          {assignment ? (
            <div className="space-y-2">
              <Label>Category</Label>
              <div className="flex h-9 items-center gap-2 rounded-md border bg-muted/40 px-3 text-sm">
                {derivedCategory ? (
                  <>
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: derivedCategory.color }}
                    />
                    <span className="truncate">{derivedCategory.name}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Uncategorized</span>
                )}
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  from the {assignedProject ? "project" : "task"}
                </span>
              </div>
            </div>
          ) : (
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
                  <SelectValue placeholder="Pick a category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Uncategorized</SelectItem>
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
          )}

          <div className="space-y-2">
            <Label htmlFor="entry-title">Label</Label>
            <Input
              id="entry-title"
              placeholder="e.g. Commute, lunch, inbox triage"
              {...form.register("title")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="entry-start">Start</Label>
              <Input id="entry-start" type="datetime-local" {...form.register("start_at")} />
              {errors.start_at ? (
                <p className="text-xs text-destructive">{errors.start_at.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="entry-end">End</Label>
              <Input id="entry-end" type="datetime-local" {...form.register("end_at")} />
              {errors.end_at ? (
                <p className="text-xs text-destructive">{errors.end_at.message}</p>
              ) : null}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">Duration</span>
            <span className="font-medium">
              {durationSeconds ? formatDuration(durationSeconds) : "—"}
            </span>
          </div>

          {spansMidnight ? (
            <p className="text-xs text-muted-foreground">
              This entry spans midnight. It is stored as a single record and split across days in
              the analytics.
            </p>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="entry-notes">Notes</Label>
            <Textarea id="entry-notes" rows={2} {...form.register("notes")} />
          </div>

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
        </form>

        <DialogFooter className="sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {entry ? (
              <Button
                type="button"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
                disabled={pending || deleting}
              >
                <Trash2 className="size-4" />
                Delete
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form="time-entry-form" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {isEditing ? "Save changes" : "Add entry"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this time entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {entry
                ? `${formatDuration(entry.duration_seconds)} recorded on ${formatDateLabel(
                    entry.start_at,
                    timezone
                  )} will be removed. This cannot be undone.`
                : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="size-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
