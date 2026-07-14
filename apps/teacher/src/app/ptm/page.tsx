"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { TeacherShell } from "@/components/teacher-shell";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, Badge, EmptyState } from "@education-erp/ui";
import { api } from "@/lib/api";

interface SlotRow {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  is_booked: boolean;
  class?: { name_en: string } | null;
  booking?: { student: { name_en: string }; guardian: { name_en: string; phone: string }; notes?: string | null } | null;
}

export default function TeacherPtmPage() {
  const queryClient = useQueryClient();
  const t = useTranslations("ptm");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const { data: slots } = useQuery<SlotRow[]>({
    queryKey: ["ptm", "slots"],
    queryFn: async () => (await api.get("/api/ptm/slots")).data.data,
  });

  const createMutation = useMutation({
    mutationFn: () => api.post("/api/ptm/slots", { date, start_time: startTime, end_time: endTime }),
    onSuccess: () => {
      toast.success(t("slotPublished"));
      queryClient.invalidateQueries({ queryKey: ["ptm", "slots"] });
      setDate(""); setStartTime(""); setEndTime("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/ptm/slots/${id}`),
    onSuccess: () => {
      toast.success(t("slotRemoved"));
      queryClient.invalidateQueries({ queryKey: ["ptm", "slots"] });
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? t("removeFailed");
      toast.error(message);
    },
  });

  return (
    <TeacherShell>
      <PageWrapper className="p-0">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />

        <Card>
          <CardContent className="flex items-end gap-3 pt-6">
            <div className="space-y-1.5"><Label>{t("date")}</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{t("start")}</Label><Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>{t("end")}</Label><Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></div>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !date || !startTime || !endTime}>{t("publishSlot")}</Button>
          </CardContent>
        </Card>

        {!slots?.length && <EmptyState title={t("noSlots")} />}
        <div className="space-y-2">
          {slots?.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex items-center justify-between pt-6">
                <div>
                  <p className="font-medium">{new Date(s.date).toLocaleDateString()} · {s.start_time}-{s.end_time}</p>
                  {s.booking ? (
                    <p className="text-sm text-muted-foreground">{t("bookedBy", { guardian: s.booking.guardian.name_en, phone: s.booking.guardian.phone, student: s.booking.student.name_en })}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("open")}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={s.is_booked ? "default" : "outline"}>{s.is_booked ? t("booked") : t("open")}</Badge>
                  {!s.is_booked && (
                    <Button size="sm" variant="outline" onClick={() => deleteMutation.mutate(s.id)}>{t("remove")}</Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </PageWrapper>
    </TeacherShell>
  );
}
