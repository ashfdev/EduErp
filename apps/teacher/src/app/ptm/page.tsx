"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { TeacherShell } from "@/components/teacher-shell";
import { Badge, Button, Card, CardContent, EmptyState, Input, Label, PageHeader, PageWrapper, extractErrorMessage } from "@education-erp/ui";
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
      const message = extractErrorMessage(err) ?? t("removeFailed");
      toast.error(message);
    },
  });

  return (
    <TeacherShell>
      <PageWrapper className="p-0">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />

        <Card>
          {/* Phone: 2-column grid (date full-width, start/end side by side,
              full-width button) — the single no-wrap row overflowed the
              screen sideways. Same single row as before from sm: up. */}
          <CardContent className="grid grid-cols-2 items-end gap-3 pt-6 sm:flex">
            <div className="col-span-2 space-y-1.5"><Label>{t("date")}</Label><Input type="date" className="h-11 sm:h-9" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="min-w-0 space-y-1.5"><Label>{t("start")}</Label><Input type="time" className="h-11 sm:h-9" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div>
            <div className="min-w-0 space-y-1.5"><Label>{t("end")}</Label><Input type="time" className="h-11 sm:h-9" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></div>
            <Button className="col-span-2 h-11 sm:h-9" onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !date || !startTime || !endTime}>{t("publishSlot")}</Button>
          </CardContent>
        </Card>

        {!slots?.length && <EmptyState title={t("noSlots")} />}
        <div className="space-y-2">
          {slots?.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">{new Date(s.date).toLocaleDateString()} · {s.start_time}-{s.end_time}</p>
                  {s.booking ? (
                    <p className="text-sm text-muted-foreground">{t("bookedBy", { guardian: s.booking.guardian.name_en, phone: s.booking.guardian.phone, student: s.booking.student.name_en })}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t("open")}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
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
