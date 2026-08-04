import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

export interface PendingCounts {
  documentRequests: number;
  admissionPayments: number;
  paymentReview: number;
  complaints: number;
  staffLeaveRequests: number;
  studentLeaveRequests: number;
  feeAssurance: number;
}

const EMPTY: PendingCounts = {
  documentRequests: 0,
  admissionPayments: 0,
  paymentReview: 0,
  complaints: 0,
  staffLeaveRequests: 0,
  studentLeaveRequests: 0,
  feeAssurance: 0,
};

// Backs the sidebar's "(N)" badges next to review-queue destinations.
// Polled, not push-based -- unlike the notification bell (which shows
// individual events and benefits from instant Socket.io delivery), a badge
// count being up to a minute stale is a non-issue, and wiring every count-
// changing mutation across 6+ unrelated modules to emit a socket event
// would be a much larger change for the same practical result.
export function usePendingCounts() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const { data } = useQuery<{ data: PendingCounts }>({
    queryKey: ["analytics", "pending-counts"],
    queryFn: async () => (await api.get("/api/analytics/pending-counts")).data,
    enabled: !!accessToken,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
  return data?.data ?? EMPTY;
}
