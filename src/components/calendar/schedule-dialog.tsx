"use client";

import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, Loader2, Trash2 } from "lucide-react";
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
import { parseLocalInputValue, toLocalInputValue } from "@/lib/time";
import type { Schedule, ScheduleType } from "@/lib/types";
import { scheduleFormSchema, type ScheduleFormValues } from "@/lib/validation";
import { describeError, useAppStore } from "@/store/use-app-store";

export interface ScheduleDialogDefaults {
  title?: string;
  task_id?: string | null;
  project_id?: string | null;
  start_at?: string;
  end_at?: string;
  schedule_type?: ScheduleType;
  description?: string | null;
}

interface ScheduleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule?: Schedule | null;
  defaults?: ScheduleDialogDefaults;
  onSaved?: (schedule: Schedule) => void;
  /** When provided, editing offers a "Duplicate" action for the open schedule. */
  onDuplicate?: (schedule: Schedule) => void;
}

/** Create / edit a calendar entry. */
export function ScheduleDialog({
  open,
  onOpenChange,
  schedule,
  defaults,
  onSaved,
  onDuplicate,
}: ScheduleDialogProps) {
  const timezone = useUserTimezone();
  const tasks = useAppStore((state) => state.tasks);
  const projects = useAppStore((state) => state.projects);
  const createSchedule = useAppStore((state) => state.createSchedule);
  const updateSchedule = useAppStore((state) => state.updateSchedule);
  const deleteSchedule = useAppStore((state) => state.deleteSchedule);

  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isEditing = Boolean(schedule);

  const form = useForm<ScheduleFormValues>({
    resolver: zodResolver(scheduleFormSchema),
    defaultValues: {
      title: "",
      task_id: undefined,
      project_id: undefined,
      start_at: "",
      end_at: "",
      schedule_type: "event",
      description: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    setFormError(null);
    setDeleteOpen(false);
    if (schedule) {
      form.reset({
        title: schedule.title,
        task_id: schedule.task_id ?? undefined,
        project_id: schedule.project_id ?? undefined,
        start_at: toLocalInputValue(schedule.start_at, timezone),
        end_at: toLocalInputValue(schedule.end_at, timezone),
        schedule_type: schedule.schedule_type,
        description: schedule.description ?? "",
      });
      return;
    }
    form.reset({
      title: defaults?.title ?? "",
      task_id: defaults?.task_id ?? undefined,
      project_id: defaults?.project_id ?? undefined,
      start_at: defaults?.start_at ?? "",
      end_at: defaults?.end_at ?? "",
      schedule_type:
        defaults?.schedule_type ?? (defaults?.task_id || defaults?.project_id ? "task" : "event"),
      description: defaults?.description ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, schedule, timezone]);

  const startAt = form.watch("start_at");
  const endAt = form.watch("end_at");
  // The picker hands back one id; only one of the two links is ever set.
  const assignment = form.watch("task_id") ?? form.watch("project_id");

  const durationMinutes = useMemo(() => {
    if (!startAt || !endAt) return null;
    const start = parseLocalInputValue(startAt, timezone);
    const end = parseLocalInputValue(endAt, timezone);
    if (!start || !end) return null;
    const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
    return minutes > 0 ? minutes : null;
  }, [startAt, endAt, timezone]);

  const onSubmit = form.handleSubmit(async (values) => {
    setPending(true);
    setFormError(null);
    try {
      const start = parseLocalInputValue(values.start_at, timezone);
      const end = parseLocalInputValue(values.end_at, timezone);
      if (!start || !end) throw new Error("Invalid start or end time");

      const payload = {
        title: values.title,
        task_id: values.task_id ?? null,
        project_id: values.project_id ?? null,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        schedule_type: (values.schedule_type as ScheduleType) ?? "event",
        description: values.description ? String(values.description) : null,
      };

      if (schedule) {
        const saved = await updateSchedule(schedule.id, payload);
        toast.success("Schedule updated");
        onOpenChange(false);
        onSaved?.(saved);
        return;
      }
      const saved = await createSchedule(payload);
      toast.success("Scheduled");
      onOpenChange(false);
      onSaved?.(saved);
    } catch (error) {
      const message = describeError(error);
      setFormError(message);
      toast.error("Could not save the schedule", { description: message });
    } finally {
      setPending(false);
    }
  });

  const handleDelete = async () => {
    if (!schedule) return;
    setDeleting(true);
    try {
      await deleteSchedule(schedule.id);
      toast.success("Schedule deleted");
      setDeleteOpen(false);
      onOpenChange(false);
    } catch (error) {
      toast.error("Could not delete the schedule", { description: describeError(error) });
    } finally {
      setDeleting(false);
    }
  };

  const errors = form.formState.errors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit schedule" : "New schedule"}</DialogTitle>
          <DialogDescription>
            Link it to a task or an ongoing project, or keep it as a standalone event such as a
            meeting or a break.
          </DialogDescription>
        </DialogHeader>

        <form id="schedule-form" onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="schedule-title">Title</Label>
            <Input id="schedule-title" autoFocus placeholder="e.g. Deep work on the report" {...form.register("title")} />
            {errors.title ? <p className="text-xs text-destructive">{errors.title.message}</p> : null}
          </div>

          <div className="space-y-2">
            <Label>Task or project</Label>
            <TaskSelect
              value={assignment ?? undefined}
              onChange={(value) => {
                const project = value
                  ? projects.find((item) => item.id === value)
                  : undefined;
                form.setValue("task_id", project ? undefined : value, { shouldDirty: true });
                form.setValue("project_id", project ? value : undefined, { shouldDirty: true });
                if (value) {
                  form.setValue("schedule_type", "task", { shouldDirty: true });
                  const label =
                    project?.name ?? tasks.find((item) => item.id === value)?.title ?? null;
                  if (label && !form.getValues("title")) {
                    form.setValue("title", label, { shouldDirty: true });
                  }
                } else {
                  form.setValue("schedule_type", "event", { shouldDirty: true });
                }
              }}
              allowNone
              includeProjects
              placeholder="Select a task or project"
              noneLabel="No task or project (standalone event)"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="schedule-start">Start</Label>
              <Input id="schedule-start" type="datetime-local" {...form.register("start_at")} />
              {errors.start_at ? (
                <p className="text-xs text-destructive">{errors.start_at.message}</p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedule-end">End</Label>
              <Input id="schedule-end" type="datetime-local" {...form.register("end_at")} />
              {errors.end_at ? (
                <p className="text-xs text-destructive">{errors.end_at.message}</p>
              ) : null}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={form.watch("schedule_type")}
                onValueChange={(value) =>
                  form.setValue("schedule_type", value as ScheduleType, { shouldDirty: true })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="task">Task schedule</SelectItem>
                  <SelectItem value="event">General event</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Planned duration</Label>
              <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                {durationMinutes ? `${durationMinutes} minutes` : "—"}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="schedule-description">Description</Label>
            <Textarea id="schedule-description" rows={2} {...form.register("description")} />
          </div>

          {formError ? <p className="text-sm text-destructive">{formError}</p> : null}
        </form>

        <DialogFooter className="sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {schedule ? (
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
            {schedule && onDuplicate ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => onDuplicate(schedule)}
                disabled={pending}
              >
                <Copy className="size-4" />
                Duplicate
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form="schedule-form" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              {isEditing ? "Save changes" : "Create schedule"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              {schedule
                ? `"${schedule.title}" and its planned time will be removed. Recorded time entries are not affected. This cannot be undone.`
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
