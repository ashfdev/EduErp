import { cn } from "../lib/utils";

interface AdjustmentNoteProps {
  children: React.ReactNode;
  className?: string;
}

// Shared red-asterisk/italic convention (Plan Fourteen, Phase O) for any
// line whose amount was adjusted away from its plain, unmodified value —
// a waiver, an ad-hoc discount, a fine, a payroll deduction. Always paired
// with a specific reason, never shown bare, so the adjustment is legible
// on-screen without needing a tooltip or a second click.
export function AdjustmentNote({ children, className }: AdjustmentNoteProps) {
  return (
    <p className={cn("text-xs italic text-red-600 dark:text-red-400", className)}>
      <span aria-hidden="true">* </span>
      {children}
    </p>
  );
}
