"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
      toast.success("Slot published");
      queryClient.invalidateQueries({ queryKey: ["ptm", "slots"] });
      setDate(""); setStartTime(""); setEndTime("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/ptm/slots/${id}`),
    onSuccess: () => {
      toast.success("Slot removed");
      queryClient.invalidateQueries({ queryKey: ["ptm", "slots"] });
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Failed to remove slot";
      toast.error(message);
    },
  });

  return (
    <TeacherShell>
      <PageWrapper className="p-0">
        <PageHeader title="Parent-Teacher Meetings" subtitle="Publish open slots for guardians to book" />

        <Card>
          <CardContent className="flex items-end gap-3 pt-6">
            <div className="space-y-1.5"><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Start</Label><Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>End</Label><Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></div>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !date || !startTime || !endTime}>+ Publish Slot</Button>
          </CardContent>
        </Card>

        {!slots?.length && <EmptyState title="No slots published yet" />}
        <div className="space-y-2">
          {slots?.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex items-center justify-between pt-6">
                <div>
                  <p className="font-medium">{new Date(s.date).toLocaleDateString()} · {s.start_time}-{s.end_time}</p>
                  {s.booking ? (
                    <p className="text-sm text-muted-foreground">Booked by {s.booking.guardian.name_en} ({s.booking.guardian.phone}) for {s.booking.student.name_en}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground">Open</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={s.is_booked ? "default" : "outline"}>{s.is_booked ? "Booked" : "Open"}</Badge>
                  {!s.is_booked && (
                    <Button size="sm" variant="outline" onClick={() => deleteMutation.mutate(s.id)}>Remove</Button>
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
