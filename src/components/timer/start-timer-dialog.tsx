"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Play } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { useAppStore, describeError } from "@/store/use-app-store";

interface StartTimerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Preselected task (e.g. started from a schedule or a task row). */
  initialTaskId?: string;
  onStarted?: () => void;
}

/**
 * Task or project picker for the timer.
 *
 * Timers run in parallel: starting one never disturbs the others, so the
 * dialog only reports what is already being tracked.
 */
export function StartTimerDialog({
  open,
  onOpenChange,
  initialTaskId,
  onStarted,
}: StartTimerDialogProps) {
  const tasks = useAppStore((state) => state.tasks);
  const projects = useAppStore((state) => state.projects);
  const activeTimers = useAppStore((state) => state.activeTimers);
  const startTimer = useAppStore((state) => state.startTimer);

  // The picker hands back one id; only one of the two links is ever set.
  const [assignment, setAssignment] = useState<string | undefined>(initialTaskId);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAssignment(initialTaskId);
      setError(null);
      setPending(false);
    }
  }, [open, initialTaskId]);

  const assignedProject = assignment
    ? projects.find((project) => project.id === assignment)
    : undefined;
  const taskId = assignedProject ? null : assignment ?? null;
  const projectId = assignedProject?.id ?? null;

  const runningLabels = useMemo(
    () =>
      activeTimers.map((session) => {
        if (session.task_id) {
          return tasks.find((task) => task.id === session.task_id)?.title ?? "Untracked session";
        }
        if (session.project_id) {
          return projects.find((project) => project.id === session.project_id)?.name ?? "Untracked session";
        }
        return "Untracked session";
      }),
    [activeTimers, tasks, projects]
  );

  const handleStart = async () => {
    setPending(true);
    setError(null);
    try {
      await startTimer(taskId, projectId);
      toast.success("Timer started");
      onOpenChange(false);
      onStarted?.();
    } catch (cause) {
      const message = describeError(cause);
      setError(message);
      toast.error("Could not start the timer", { description: message });
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Start tracking time</DialogTitle>
          <DialogDescription>
            Choose what you are working on. Timers run side by side, so anything already
            running keeps going.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Task or project</Label>
            <TaskSelect
              value={assignment}
              onChange={setAssignment}
              includeProjects
              placeholder="Select a task or project"
              noneLabel="No task or project (untracked session)"
            />
          </div>

          {runningLabels.length > 0 ? (
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Already tracking
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {runningLabels.map((label, index) => (
                  <li key={`${label}-${index}`} className="truncate">
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleStart} disabled={pending}>
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Play className="size-4" />
            )}
            Start timer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
