"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, Button, LoadingSpinner, EmptyState } from "@education-erp/ui";

interface SlotRow {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  teacher: { name_en: string };
  class?: { name_en: string } | null;
}

function PtmContent() {
  const { activeStudentId } = useAuthStore();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<SlotRow[]>({
    queryKey: ["portal", "ptm-slots"],
    queryFn: async () => (await api.get("/api/portal/ptm-slots")).data.data,
  });

  const bookMutation = useMutation({
    mutationFn: (slotId: string) => api.post(`/api/portal/ptm-slots/${slotId}/book`, { student_id: activeStudentId }),
    onSuccess: () => {
      toast.success("Meeting booked");
      queryClient.invalidateQueries({ queryKey: ["portal", "ptm-slots"] });
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Failed to book — someone may have just taken this slot";
      toast.error(message);
    },
  });

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="space-y-3 p-4">
      <h1 className="text-lg font-semibold">Parent-Teacher Meetings</h1>
      {!data?.length && <EmptyState title="No open slots right now" />}
      {data?.map((s) => (
        <Card key={s.id}>
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <p className="font-medium">{s.teacher.name_en}</p>
              <p className="text-sm text-gray-500">{new Date(s.date).toLocaleDateString()} · {s.start_time}-{s.end_time}{s.class ? ` · ${s.class.name_en}` : ""}</p>
            </div>
            <Button size="sm" onClick={() => bookMutation.mutate(s.id)} disabled={bookMutation.isPending}>Book</Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function PtmPage() {
  return (
    <PortalShell>
      <PtmContent />
    </PortalShell>
  );
}
