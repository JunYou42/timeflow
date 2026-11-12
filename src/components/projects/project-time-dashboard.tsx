"use client";

import { useMemo, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUserTimezone } from "@/hooks/use-user-timezone";
import { entriesWithinRange, groupSecondsByProject } from "@/lib/stats";
import { formatDateLabel, formatDuration, resolveRange, type RangePreset } from "@/lib/time";
import type { Project, Task, TimeEntry } from "@/lib/types";

interface ProjectTimeDashboardProps {
  projects: Project[];
  tasks: Task[];
  timeEntries: TimeEntry[];
}

/**
 * How much time each project absorbed during the selected period.
 *
 * The period picker lives inside the card rather than on the page header: the
 * rest of the projects page is a plan, and this card is the one place that
 * answers "what did each project actually cost me lately". It shares a row with
 * the estimate gauges beside it, hence the narrow layout.
 *
 * Bars are shares of the period's project time (see `groupSecondsByProject`),
 * so they always add up to 100% and hours booked with no project behind them
 * cannot skew the picture.
 */
export function ProjectTimeDashboard({ projects, tasks, timeEntries }: ProjectTimeDashboardProps) {
  const timezone = useUserTimezone();
  const [preset, setPreset] = useState<RangePreset>("week");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const range = useMemo(() => {
    if (preset === "custom" && customStart && customEnd) {
      return resolveRange("custom", timezone, new Date(), {
        start: `${customStart}T00:00:00`,
        end: `${customEnd}T00:00:00`,
      });
    }
    return resolveRange(preset === "custom" ? "week" : preset, timezone);
  }, [preset, customStart, customEnd, timezone]);

  const rows = useMemo(
    () => groupSecondsByProject(entriesWithinRange(timeEntries, range), tasks, projects),
    [timeEntries, range, tasks, projects]
  );

  const totalSeconds = rows.reduce((sum, row) => sum + row.seconds, 0);

  return (
    <Card>
      <CardHeader className="space-y-2 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <CardTitle className="text-sm">时间都去哪了</CardTitle>
            <CardDescription className="text-xs">
              {formatDateLabel(range.start, timezone)} → {formatDateLabel(range.end, timezone)} ·{" "}
              {formatDuration(totalSeconds)} tracked
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={preset} onValueChange={(value) => setPreset(value as RangePreset)}>
              <SelectTrigger className="h-9 w-auto min-w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="week">This week</SelectItem>
                <SelectItem value="month">This month</SelectItem>
                <SelectItem value="custom">Custom range</SelectItem>
              </SelectContent>
            </Select>
            {preset === "custom" ? (
              <>
                <Input
                  type="date"
                  value={customStart}
                  onChange={(event) => setCustomStart(event.target.value)}
                  className="h-9 w-auto text-xs"
                  aria-label="Start date"
                />
                <Input
                  type="date"
                  value={customEnd}
                  onChange={(event) => setCustomEnd(event.target.value)}
                  className="h-9 w-auto text-xs"
                  aria-label="End date"
                />
              </>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No time booked to a project in this period.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {rows.map((row) => (
              <li key={row.projectId} className="space-y-1.5">
                <div className="flex items-center gap-2 text-xs">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: row.color }}
                  />
                  <span className="truncate font-medium">{row.name}</span>
                  <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                    {formatDuration(row.seconds)}
                    <span className="mx-1">·</span>
                    {row.percentage}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      // A 2% floor keeps a project with a sliver of time visible.
                      width: `${Math.max(2, row.percentage)}%`,
                      backgroundColor: row.color,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
