import { Badge } from "./badge";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "success" | "warning" | "outline"> = {
  ACTIVE: "success",
  APPROVED: "success",
  PAID: "success",
  COMPLETED: "success",
  PUBLISHED: "success",
  SENT: "success",
  PENDING: "warning",
  DRAFT: "secondary",
  SUBMITTED: "warning",
  PARTIAL: "warning",
  LATE: "warning",
  QUEUED: "warning",
  INACTIVE: "secondary",
  SKIPPED: "secondary",
  OVERDUE: "destructive",
  FAILED: "destructive",
  ABSENT: "destructive",
  EXPELLED: "destructive",
  REJECTED: "destructive",
  TRANSFERRED: "outline",
};

export function StatusBadge({ status }: { status: string }) {
  const variant = STATUS_VARIANT[status] ?? "outline";
  return <Badge variant={variant}>{status.replace(/_/g, " ")}</Badge>;
}
