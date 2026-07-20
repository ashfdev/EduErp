import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./button";

export interface ErrorStateProps {
  title: string;
  description?: string;
  retryLabel?: string;
  onRetry?: () => void;
}

// The counterpart to EmptyState, but for "the request actually failed" —
// distinct styling (destructive-tinted) so it can never be mistaken for a
// legitimate "nothing here yet" state, plus an optional retry action wired
// to the caller's own refetch().
export function ErrorState({ title, description, retryLabel, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-destructive/30 bg-destructive/5 py-16 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive/70" />
      <p className="text-sm font-medium text-destructive">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          {retryLabel ?? "Retry"}
        </Button>
      )}
    </div>
  );
}
