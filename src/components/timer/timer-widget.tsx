"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Pause, Play, Plus, Square, Timer, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { StartTimerDialog } from "@/components/timer/start-timer-dialog";
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
import { Card, CardContent } from "@/components/ui/card";
import { useElapsedSeconds } from "@/hooks/use-timer-tick";
import { formatDuration, formatStopwatch } from "@/lib/time";
import type { TimerSession } from "@/lib/types";
import { cn } from "@/lib/utils";
import { describeError, useAppStore } from "@/store/use-app-store";

interface TimerWidgetProps {
  className?: string;
  variant?: "card" | "compact";
}

/**
 * Live timer surface.
 *
 * Timers run in parallel: several can be open at once, and each one is derived
 * from its own persisted session on every tick, so closing the tab or the
 * browser never loses recorded time.
 */
export function TimerWidget({ className, variant = "card" }: TimerWidgetProps) {
  const activeTimers = useAppStore((state) => state.activeTimers);
  const [pickerOpen, setPickerOpen] = useState(false);

  /* ---------------------------------------------------------------- */
  /* no session running                                                */
  /* ---------------------------------------------------------------- */

  if (activeTimers.length === 0) {
    if (variant === "compact") {
      return (
        <>
          <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)} className={className}>
            <Timer className="size-4" />
            Start timer
          </Button>
          <StartTimerDialog open={pickerOpen} onOpenChange={setPickerOpen} />
        </>
      );
    }
    return (
      <>
        <Card className={cn("border-dashed", className)}>
          <CardContent className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-muted">
              <Timer className="size-5 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">No timer running</p>
              <p className="text-xs text-muted-foreground">
                Pick a task and start tracking to see real numbers in your analytics.
              </p>
            </div>
            <Button size="sm" onClick={() => setPickerOpen(true)}>
              <Play className="size-4" />
              Start tracking
            </Button>
          </CardContent>
        </Card>
        <StartTimerDialog open={pickerOpen} onOpenChange={setPickerOpen} />
      </>
    );
  }

  /* ---------------------------------------------------------------- */
  /* one or more sessions                                              */
  /* ---------------------------------------------------------------- */

  if (variant === "compact") {
    return (
      <>
        <div className={cn("flex items-center gap-2", className)}>
          {activeTimers.map((session) => (
            <CompactTimerRow key={session.id} session={session} />
          ))}
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="Start another timer"
            title="Start another timer"
            onClick={() => setPickerOpen(true)}
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
        <StartTimerDialog open={pickerOpen} onOpenChange={setPickerOpen} />
      </>
    );
  }

  return (
    <>
      <div className={cn("space-y-3", className)}>
        {activeTimers.map((session) => (
          <CardTimerRow key={session.id} session={session} />
        ))}
        <Button variant="outline" className="w-full" onClick={() => setPickerOpen(true)}>
          <Plus className="size-4" />
          Start another timer
        </Button>
      </div>
      <StartTimerDialog open={pickerOpen} onOpenChange={setPickerOpen} />
    </>
  );
}

/** Resolves the session's task or project into a linkable label. */
function useTrackedTarget(session: TimerSession) {
  const tasks = useAppStore((state) => state.tasks);
  const projects = useAppStore((state) => state.projects);
  const task = session.task_id
    ? tasks.find((item) => item.id === session.task_id) ?? null
    : null;
  // A session can track a project instead of a single task.
  const project = session.project_id
    ? projects.find((item) => item.id === session.project_id) ?? null
    : null;
  return task
    ? { label: task.title, href: `/tasks?task=${task.id}` }
    : project
      ? { label: project.name, href: "/projects" }
      : null;
}

/**
 * One card per session. Each row keeps its own busy flag so pausing one timer
 * never disables the controls of the others.
 */
function CardTimerRow({ session }: { session: TimerSession }) {
  const pauseTimer = useAppStore((state) => state.pauseTimer);
  const resumeTimer = useAppStore((state) => state.resumeTimer);
  const stopTimer = useAppStore((state) => state.stopTimer);
  const discardTimer = useAppStore((state) => state.discardTimer);

  const [discardOpen, setDiscardOpen] = useState(false);
  const [busy, setBusy] = useState<null | "pause" | "resume" | "stop">(null);

  const elapsed = useElapsedSeconds(session);
  const tracked = useTrackedTarget(session);
  const isRunning = session.status === "running";
  const isPaused = session.status === "paused";

  const run = async (
    kind: "pause" | "resume" | "stop",
    action: () => Promise<unknown>,
    successMessage: string
  ) => {
    setBusy(kind);
    try {
      await action();
      toast.success(successMessage);
    } catch (error) {
      toast.error("Timer action failed", { description: describeError(error) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <span
                  className={cn(
                    "size-2 rounded-full",
                    isRunning ? "animate-pulse bg-emerald-500" : "bg-amber-500"
                  )}
                />
                {isRunning ? "Tracking" : "Paused"}
              </p>
              <p className="mt-1 truncate text-sm font-medium">
                {tracked ? (
                  <Link href={tracked.href} className="hover:underline">
                    {tracked.label}
                  </Link>
                ) : (
                  "Untracked session"
                )}
              </p>
            </div>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Discard session"
              title="Discard without saving"
              onClick={() => setDiscardOpen(true)}
              disabled={busy !== null}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>

          <p className="font-mono text-3xl font-semibold tabular-nums">
            {formatStopwatch(elapsed)}
          </p>
          <p className="text-xs text-muted-foreground">
            {elapsed > 0 ? `${formatDuration(elapsed, { compact: true })} recorded` : "Nothing recorded yet"}
            {isPaused ? " · resumed time will be added on top" : ""}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            {isRunning ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => run("pause", () => pauseTimer(session.id), "Timer paused")}
              >
                {busy === "pause" ? <Loader2 className="size-4 animate-spin" /> : <Pause className="size-4" />}
                Pause
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => run("resume", () => resumeTimer(session.id), "Timer resumed")}
              >
                {busy === "resume" ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                Resume
              </Button>
            )}
            <Button
              size="sm"
              disabled={busy !== null}
              onClick={() => run("stop", () => stopTimer(session.id), "Time entry saved")}
            >
              {busy === "stop" ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-4" />}
              Stop
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard this session?</AlertDialogTitle>
            <AlertDialogDescription>
              The {formatDuration(elapsed)} recorded so far will not be saved as a time entry.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep tracking</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await discardTimer(session.id);
                  toast.success("Session discarded");
                } catch (error) {
                  toast.error("Could not discard", { description: describeError(error) });
                }
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Condensed row used in the app header, one chip per session. */
function CompactTimerRow({ session }: { session: TimerSession }) {
  const pauseTimer = useAppStore((state) => state.pauseTimer);
  const resumeTimer = useAppStore((state) => state.resumeTimer);
  const stopTimer = useAppStore((state) => state.stopTimer);

  const [busy, setBusy] = useState<null | "pause" | "resume" | "stop">(null);

  const elapsed = useElapsedSeconds(session);
  const tracked = useTrackedTarget(session);
  const isRunning = session.status === "running";
  const isPaused = session.status === "paused";

  const run = async (
    kind: "pause" | "resume" | "stop",
    action: () => Promise<unknown>,
    successMessage: string
  ) => {
    setBusy(kind);
    try {
      await action();
      toast.success(successMessage);
    } catch (error) {
      toast.error("Timer action failed", { description: describeError(error) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-md border px-2 py-1">
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          isRunning ? "animate-pulse bg-emerald-500" : "bg-amber-500"
        )}
      />
      <div className="min-w-0 max-w-[8rem] sm:max-w-[10rem]">
        <p className="truncate text-xs font-medium">{tracked?.label ?? "Untracked session"}</p>
        <p className="font-mono text-xs tabular-nums text-muted-foreground">
          {formatStopwatch(elapsed)}
          {isPaused ? " · paused" : ""}
        </p>
      </div>
      <div className="ml-auto flex items-center gap-1">
        {isRunning ? (
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="Pause timer"
            disabled={busy !== null}
            onClick={() => run("pause", () => pauseTimer(session.id), "Timer paused")}
          >
            <Pause className="size-3.5" />
          </Button>
        ) : (
          <Button
            size="icon"
            variant="ghost"
            className="size-7"
            aria-label="Resume timer"
            disabled={busy !== null}
            onClick={() => run("resume", () => resumeTimer(session.id), "Timer resumed")}
          >
            <Play className="size-3.5" />
          </Button>
        )}
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          aria-label="Stop timer"
          disabled={busy !== null}
          onClick={() => run("stop", () => stopTimer(session.id), "Time entry saved")}
        >
          <Square className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
