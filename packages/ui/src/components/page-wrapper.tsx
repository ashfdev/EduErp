import * as React from "react";
import { cn } from "../lib/utils";

export function PageWrapper({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex flex-col gap-6 p-6 flat:p-0", className)} {...props}>
      {children}
    </div>
  );
}
