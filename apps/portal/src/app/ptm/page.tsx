"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Button, Card, CardContent, EmptyState, ErrorState, LoadingSpinner, extractErrorMessage } from "@education-erp/ui";

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
  const t = useTranslations("ptm");
  const tCommon = useTranslations("common");

  const { data, isLoading, isError, refetch } = useQuery<SlotRow[]>({
    queryKey: ["portal", "ptm-slots"],
    queryFn: async () => (await api.get("/api/portal/ptm-slots")).data.data,
    retry: 1,
  });

  const bookMutation = useMutation({
    mutationFn: (slotId: string) => api.post(`/api/portal/ptm-slots/${slotId}/book`, { student_id: activeStudentId }),
    onSuccess: () => {
      toast.success(t("booked"));
      queryClient.invalidateQueries({ queryKey: ["portal", "ptm-slots"] });
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? t("bookFailed");
      toast.error(message);
    },
  });

  if (isError) {
    return (
      <div className="min-h-[50vh]">
        <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={() => refetch()} />
      </div>
    );
  }

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="space-y-3 p-4">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      {!data?.length && <EmptyState title={t("noSlots")} />}
      {data?.map((s) => (
        <Card key={s.id}>
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <p className="font-medium">{s.teacher.name_en}</p>
              <p className="text-sm text-gray-500">{new Date(s.date).toLocaleDateString()} · {s.start_time}-{s.end_time}{s.class ? ` · ${s.class.name_en}` : ""}</p>
            </div>
            <Button size="sm" onClick={() => bookMutation.mutate(s.id)} disabled={bookMutation.isPending}>{t("book")}</Button>
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
