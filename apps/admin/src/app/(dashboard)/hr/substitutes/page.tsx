"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, Badge, EmptyState,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  extractErrorMessage,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface RoutineSlotRow {
  id: string;
  period_no: number;
  start_time: string;
  end_time: string;
  class: { name_en: string };
  section: { name: string } | null;
  subject: { name_en: string } | null;
  teacher: { id: string; name_en: string } | null;
}
interface SubstitutionRow {
  id: string;
  routine_slot_id: string;
  reason: string | null;
  original_teacher: { name_en: string };
  substitute_teacher: { name_en: string };
  routine_slot: { period_no: number };
}
interface TeacherOption {
  id: string;
  name_en: string;
  designation: string;
}

function todayLocalDateString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ProxySubstitutePage() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(todayLocalDateString());
  const [assignTarget, setAssignTarget] = useState<RoutineSlotRow | null>(null);
  const [substituteId, setSubstituteId] = useState("");
  const [reason, setReason] = useState("");

  // Local calendar weekday for the selected date — the same day_of_week
  // convention RoutineSlot already uses (0=Sunday).
  const dayOfWeek = new Date(`${date}T00:00:00`).getDay();

  const { data: slots } = useQuery<RoutineSlotRow[]>({
    queryKey: ["settings", "routine", "day", dayOfWeek],
    queryFn: async () => (await api.get("/api/settings/routine", { params: { day_of_week: dayOfWeek } })).data.data,
  });
  const { data: substitutions } = useQuery<SubstitutionRow[]>({
    queryKey: ["settings", "routine", "substitutions", date],
    queryFn: async () => (await api.get("/api/settings/routine/substitutions", { params: { date } })).data.data,
  });
  const { data: teachers } = useQuery<TeacherOption[]>({
    queryKey: ["staff", "teachers"],
    queryFn: async () => (await api.get("/api/staff/teachers")).data.data,
  });

  const substitutionBySlot = new Map(substitutions?.map((s) => [s.routine_slot_id, s]) ?? []);
  const teachableSlots = slots?.filter((s) => !!s.teacher) ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["settings", "routine", "substitutions", date] });
  };

  const assignMutation = useMutation({
    mutationFn: () =>
      api.post("/api/settings/routine/substitutions", {
        routine_slot_id: assignTarget!.id,
        date,
        substitute_teacher_id: substituteId,
        reason: reason || undefined,
      }),
    onSuccess: () => {
      toast.success("Substitute assigned");
      setAssignTarget(null);
      setSubstituteId("");
      setReason("");
      invalidate();
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to assign substitute"),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/settings/routine/substitutions/${id}`),
    onSuccess: () => {
      toast.success("Substitute assignment revoked");
      invalidate();
    },
    onError: (err: unknown) => toast.error(extractErrorMessage(err) ?? "Failed to revoke"),
  });

  return (
    <PageWrapper>
      <PageHeader
        title="Proxy / Substitute"
        subtitle="Assign a substitute teacher to cover a specific period, for a specific date"
        breadcrumbs={[{ label: "HR", href: "/hr" }, { label: "Proxy / Substitute" }]}
      />

      <div className="flex items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Date</label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
        </div>
      </div>

      {!teachableSlots.length && <EmptyState title="No routine slots on this weekday" description="No classes are scheduled on this weekday, or no routine has been set up yet." />}

      {!!teachableSlots.length && (
        <Card>
          <CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Class</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Regular Teacher</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teachableSlots
                  .sort((a, b) => a.period_no - b.period_no)
                  .map((s) => {
                    const sub = substitutionBySlot.get(s.id);
                    return (
                      <TableRow key={s.id}>
                        <TableCell>{s.period_no} <span className="text-xs text-muted-foreground">({s.start_time}-{s.end_time})</span></TableCell>
                        <TableCell>{s.class.name_en}{s.section ? ` — ${s.section.name}` : ""}</TableCell>
                        <TableCell>{s.subject?.name_en ?? "—"}</TableCell>
                        <TableCell>{s.teacher?.name_en ?? "—"}</TableCell>
                        <TableCell>
                          {sub ? (
                            <Badge variant="warning">Covered by {sub.substitute_teacher.name_en}</Badge>
                          ) : (
                            <Badge variant="outline">Regular</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {sub ? (
                            <Button size="sm" variant="outline" onClick={() => revokeMutation.mutate(sub.id)} disabled={revokeMutation.isPending}>
                              Revoke
                            </Button>
                          ) : (
                            <Button size="sm" onClick={() => { setAssignTarget(s); setSubstituteId(""); setReason(""); }}>
                              Assign Substitute
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!assignTarget} onOpenChange={(o) => !o && setAssignTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Assign Substitute — Period {assignTarget?.period_no}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {assignTarget?.class.name_en}{assignTarget?.section ? ` — ${assignTarget.section.name}` : ""} · {assignTarget?.subject?.name_en} · Regular teacher: {assignTarget?.teacher?.name_en}
            </p>
            <div className="space-y-1.5">
              <Label>Substitute Teacher</Label>
              <Select value={substituteId} onValueChange={setSubstituteId}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  {teachers?.filter((t) => t.id !== assignTarget?.teacher?.id).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name_en} — {t.designation}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Reason (optional)</Label><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Sick leave" /></div>
          </div>
          <DialogFooter>
            <Button disabled={!substituteId || assignMutation.isPending} onClick={() => assignMutation.mutate()}>
              {assignMutation.isPending ? "Assigning..." : "Assign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
