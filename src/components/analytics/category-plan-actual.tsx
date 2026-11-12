"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { CategoryPlanActualRow } from "@/lib/stats";
import { formatDuration } from "@/lib/time";

interface CategoryPlanActualProps {
  rows: CategoryPlanActualRow[];
  /** Human-readable period the numbers describe, e.g. "Nov 10 → Nov 16". */
  rangeLabel: string;
}

/**
 * Planned vs. tracked time per category for whatever period the host page is
 * showing.
 *
 * The bar is `tracked / planned`, so a full bar means the plan was met. It is
 * shared by the calendar and the time logs page, whose periods come from the
 * calendar grid rather than a fixed preset.
 */
export function CategoryPlanActual({ rows, rangeLabel }: CategoryPlanActualProps) {
  const totals = rows.reduce(
    (accumulator, row) => ({
      plannedSeconds: accumulator.plannedSeconds + row.plannedSeconds,
      actualSeconds: accumulator.actualSeconds + row.actualSeconds,
    }),
    { plannedSeconds: 0, actualSeconds: 0 }
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">Plan vs. actual by category</CardTitle>
        <CardDescription className="text-xs">
          {rangeLabel} · {formatDuration(totals.actualSeconds)} tracked of{" "}
          {formatDuration(totals.plannedSeconds)} planned
        </CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nothing planned or tracked in this period yet.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {rows.map((row) => {
              const percent =
                row.plannedSeconds > 0
                  ? Math.min(100, Math.round((row.actualSeconds / row.plannedSeconds) * 100))
                  : row.actualSeconds > 0
                    ? 100
                    : 0;
              return (
                <li key={row.categoryId} className="space-y-1.5">
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: row.color }}
                    />
                    <span className="truncate font-medium">{row.name}</span>
                    <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
                      {formatDuration(row.actualSeconds)}
                      <span className="mx-1">/</span>
                      {row.plannedSeconds > 0 ? formatDuration(row.plannedSeconds) : "—"}
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${percent}%`, backgroundColor: row.color }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
