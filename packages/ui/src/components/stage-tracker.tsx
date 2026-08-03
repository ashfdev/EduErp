import { Check } from "lucide-react";
import { cn } from "../lib/utils";

export interface StageTrackerStep {
  key: string;
  label: string;
  status: "complete" | "current" | "upcoming";
}

// A horizontal step tracker for a multi-stage process (e.g. an admission
// application's Apply -> Pay -> Assessment -> Review -> Outcome journey).
// The caller builds the step array dynamically (a process with 4 stages and
// one with 6 both render correctly) -- this component only draws whatever
// list it's given, it has no opinion on how many steps there are or what
// they mean.
export function StageTracker({ steps, className }: { steps: StageTrackerStep[]; className?: string }) {
  return (
    <div className={cn("flex items-start", className)}>
      {steps.map((step, i) => (
        <div key={step.key} className="flex flex-1 items-center last:flex-none">
          <div className="flex flex-col items-center gap-1.5 text-center">
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors",
                step.status === "complete" && "border-primary bg-primary text-primary-foreground",
                step.status === "current" && "border-primary bg-white text-primary",
                step.status === "upcoming" && "border-slate-200 bg-slate-50 text-slate-400",
              )}
            >
              {step.status === "complete" ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span
              className={cn(
                "max-w-[80px] text-[11px] font-semibold leading-tight",
                step.status === "upcoming" ? "text-slate-400" : "text-slate-700",
              )}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div className={cn("mx-1 h-0.5 flex-1 rounded-full self-start mt-4", step.status === "complete" ? "bg-primary" : "bg-slate-200")} />
          )}
        </div>
      ))}
    </div>
  );
}
