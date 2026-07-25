import * as React from "react";
import { cn } from "../lib/utils";

export interface RoutineGridCell {
  subject: string;
  teacher: string;
  coveredBy?: string | null;
}

export interface RoutineGridRow {
  period_no: number;
  start_time: string;
  end_time: string;
  // One entry per day column, in the same order as `days`; null = free period.
  cells: (RoutineGridCell | null)[];
}

export interface RoutineGridProps {
  days: string[];
  rows: RoutineGridRow[];
  todayIndex?: number;
  className?: string;
}

// Deliberately neutral/un-opinionated styling (borders + spacing only, no
// bg-primary color choices) since this one component is shared across three
// apps with genuinely different visual languages (apps/admin's dense
// shadcn look, apps/website's soft rounded-card look) — each caller wraps
// it in its own themed container rather than this component imposing one.
export function RoutineGrid({ days, rows, todayIndex, className }: RoutineGridProps) {
  if (!rows.length) {
    return <p className={cn("py-8 text-center text-sm text-muted-foreground", className)}>No routine slots to display.</p>;
  }
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full min-w-[720px] border-collapse text-xs">
        <thead>
          <tr>
            <th className="border px-2 py-2 text-left font-semibold">Period</th>
            {days.map((day, i) => (
              <th
                key={day}
                className={cn("border px-2 py-2 text-left font-semibold", i === todayIndex && "bg-muted")}
              >
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.period_no}>
              <td className="border px-2 py-2 align-top">
                <div className="font-medium">P{row.period_no}</div>
                <div className="text-[10px] text-muted-foreground">{row.start_time}–{row.end_time}</div>
              </td>
              {row.cells.map((cell, i) => (
                <td key={i} className={cn("border px-2 py-2 align-top", i === todayIndex && "bg-muted/40")}>
                  {cell ? (
                    <div>
                      <div className="font-medium">{cell.subject}</div>
                      {!!cell.teacher && <div className="text-[10px] text-muted-foreground">{cell.teacher}</div>}
                      {!!cell.coveredBy && <div className="mt-0.5 text-[10px] font-medium text-amber-700">Covered by {cell.coveredBy}</div>}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
