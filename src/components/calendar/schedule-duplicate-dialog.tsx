"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { findOverlappingSchedules } from "@/lib/stats";
import {
  addDaysInTimezone,
  formatDateTimeLabel,
  parseLocalInputValue,
  toLocalInputValue,
  toZoned,
} from "@/lib/time";
import type { Schedule } from "@/lib/types";
import { describeError, useAppStore } from "@/store/use-app-store";

interface ScheduleDuplicateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The schedule being copied. Its title, links and duration are kept. */
  source: Schedule | null;
}

const QUICK_OFFSETS = [
  { label: "Next day", days: 1 },
  { label: "Next week", days: 7 },
  { label: "In two weeks", days: 14 },
] as const;

/**
 * Copies an existing schedule to a later window.
 *
 * Everything the original carries — its title, its task or project link, its
 * type, its description — is kept; only the time moves. The quick buttons are
 * whole-day shifts so the time of day is preserved, and the fields stay
 * editable for anything the buttons do not cover.
 */
export function ScheduleDuplicateDialog({
  open,
  onOpenChange,
  source,
}: ScheduleDuplicateDialogProps) {
  const timezone = useUserTimezone();
  const schedules = useAppStore((state) => state.schedules);
  const createSchedule = useAppStore((state) => state.createSchedule);

  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open || !source) return;
    setStartAt(toLocalInputValue(source.start_at, timezone));
    setEndAt(toLocalInputValue(source.end_at, timezone));
  }, [open, source, timezone]);

  /** Days until the next Monday–Friday, so "next weekday" steps over the weekend. */
  const weekdayOffset = useMemo(() => {
    if (!source) return 1;
    for (let days = 1; days <= 7; days += 1) {
      const weekday = toZoned(addDaysInTimezone(source.start_at, days, timezone), timezone).getDay();
      if (weekday !== 0 && weekday !== 6) return days;
    }
    return 1;
  }, [source, timezone]);

  const shift = (days: number) => {
    if (!source) return;
    setStartAt(toLocalInputValue(addDaysInTimezone(source.start_at, days, timezone), timezone));
    setEndAt(toLocalInputValue(addDaysInTimezone(source.end_at, days, timezone), timezone));
  };

  const start = useMemo(() => parseLocalInputValue(startAt, timezone), [startAt, timezone]);
  const end = useMemo(() => parseLocalInputValue(endAt, timezone), [endAt, timezone]);
  const durationMinutes =
    start && end && end.getTime() > start.getTime()
      ? Math.round((end.getTime() - start.getTime()) / 60000)
      : null;

  const conflicts = useMemo(() => {
    if (!start || !end || end.getTime() <= start.getTime()) return [];
    return findOverlappingSchedules(
      { start_at: start.toISOString(), end_at: end.toISOString() },
      schedules
    );
  }, [start, end, schedules]);

  const submit = async () => {
    if (!source || !start || !end || end.getTime() <= start.getTime()) return;
    setPending(true);
    try {
      const saved = await createSchedule({
        title: source.title,
        task_id: source.task_id,
        project_id: source.project_id,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        schedule_type: source.schedule_type,
        description: source.description,
      });
      toast.success("Copy created", {
        description: formatDateTimeLabel(saved.start_at, timezone),
      });
      onOpenChange(false);
    } catch (error) {
      toast.error("Could not copy the schedule", { description: describeError(error) });
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Duplicate schedule</DialogTitle>
          <DialogDescription>
            Pick when the copy should land. Its title, duration and link to a task or project are
            kept.
          </DialogDescription>
        </DialogHeader>

        {source ? (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="truncate text-sm font-medium">{source.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatDateTimeLabel(source.start_at, timezone)} →{" "}
                {formatDateTimeLabel(source.end_at, timezone)}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Shift the copy</Label>
              <div className="flex flex-wrap gap-2">
                {QUICK_OFFSETS.map((option) => (
                  <Button
                    key={option.label}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => shift(option.days)}
                  >
                    {option.label}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => shift(weekdayOffset)}
                >
                  Next weekday
                </Button>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="duplicate-start">New start</Label>
                <Input
                  id="duplicate-start"
                  type="datetime-local"
                  value={startAt}
                  onChange={(event) => setStartAt(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="duplicate-end">New end</Label>
                <Input
                  id="duplicate-end"
                  type="datetime-local"
                  value={endAt}
                  onChange={(event) => setEndAt(event.target.value)}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              {durationMinutes && start
                ? `${durationMinutes} minutes · starting ${formatDateTimeLabel(
                    start.toISOString(),
                    timezone
                  )}`
                : "Pick a start and an end that come after it."}
            </p>

            {conflicts.length > 0 ? (
              <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Overlaps {conflicts.length} existing{" "}
                  {conflicts.length === 1 ? "entry" : "entries"} (
                  {conflicts
                    .slice(0, 2)
                    .map((conflict) => conflict.title)
                    .join(", ")}
                  ). You can still create it.
                </span>
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={pending || !durationMinutes}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Copy className="size-4" />}
            Create copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
