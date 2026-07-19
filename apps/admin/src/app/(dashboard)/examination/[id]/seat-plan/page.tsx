"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Checkbox, StatusBadge, Badge, EmptyState, PdfPreviewModal } from "@education-erp/ui";
import { api } from "@/lib/api";
import { usePdfPreview } from "@/hooks/use-pdf-preview";

interface SeatPlanRow {
  id: string;
  hall_name: string;
  seat_number: string;
  student_id: string;
  exam_office_cleared: boolean;
  outstanding_due: number;
  session: { id: string; label: string } | null;
  student: { name_en: string; student_uid: string; current_class: { name_en: string } };
}
interface ExamSession {
  id: string;
  label: string;
  date: string;
  start_time: string;
  end_time: string;
  classes: { class: { id: string; name_en: string } }[];
}
interface ClassOption {
  id: string;
  name_en: string;
}
interface Hall {
  name: string;
  capacity: number;
}

async function printSeatPlan(examId: string) {
  const res = await api.get(`/api/documents/exam/${examId}/seat-plan`, { params: { download: "true" }, responseType: "blob" });
  const url = URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Seat_Plan_${examId}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SeatPlanPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const pdfPreview = usePdfPreview();

  const { data: plans } = useQuery<SeatPlanRow[]>({
    queryKey: ["exams", id, "seat-plan"],
    queryFn: async () => (await api.get(`/api/exams/${id}/seat-plan`)).data.data,
  });
  const { data: sessions } = useQuery<ExamSession[]>({
    queryKey: ["exams", id, "sessions"],
    queryFn: async () => (await api.get(`/api/exams/${id}/sessions`)).data.data,
  });
  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });

  const clearMutation = useMutation({
    mutationFn: () => api.post(`/api/exams/${id}/seat-plan/clear`, { student_ids: [...selected] }),
    onSuccess: (res) => {
      toast.success(`Approved ${res.data.data.cleared} student(s) — admit card unlocked`);
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ["exams", id, "seat-plan"] });
    },
  });

  function toggle(studentId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  return (
    <PageWrapper>
      <PageHeader
        title="Seat Plan"
        subtitle="Define each exam session and the classes sitting in it, then generate seats per session"
        breadcrumbs={[{ label: "Examination", href: "/examination" }, { label: "Seat Plan" }]}
        action={
          !!plans?.length && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => pdfPreview.openPreview(`/api/documents/exam/${id}/seat-plan`, "Seat Plan")}>View Seat Plan</Button>
              <Button variant="outline" onClick={() => printSeatPlan(id)}>Print Seat Plan</Button>
            </div>
          )
        }
      />

      <AddSessionForm examId={id} classes={classes} />

      {!sessions?.length && <EmptyState title="No sessions defined yet" description="Add a session above before generating seats — even a single-sitting exam needs one session covering all its classes." />}

      {sessions?.map((session) => (
        <SessionCard key={session.id} examId={id} session={session} />
      ))}

      {!plans?.length && !!sessions?.length && <EmptyState title="No seats generated yet" description="Generate a session above to see its seat plan here." />}
      {plans && plans.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Bulk-select students, then approve them all at once for admit card release.</p>
              <Button size="sm" onClick={() => clearMutation.mutate()} disabled={!selected.size || clearMutation.isPending}>
                Approve Selected ({selected.size})
              </Button>
            </div>
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2" /><th className="p-2">Session</th><th className="p-2">Hall</th><th className="p-2">Seat</th><th className="p-2">Student</th><th className="p-2">Class</th><th className="p-2">Due</th><th className="p-2">Exam Office Approval</th></tr></thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id} className="border-b">
                    <td className="p-2"><Checkbox checked={selected.has(p.student_id)} onCheckedChange={() => toggle(p.student_id)} disabled={p.exam_office_cleared} /></td>
                    <td className="p-2 text-muted-foreground">{p.session?.label ?? "—"}</td>
                    <td className="p-2">{p.hall_name}</td>
                    <td className="p-2">{p.seat_number}</td>
                    <td className="p-2">{p.student.name_en} <span className="font-mono text-xs text-muted-foreground">{p.student.student_uid}</span></td>
                    <td className="p-2">{p.student.current_class.name_en}</td>
                    <td className="p-2">{p.outstanding_due > 0 ? <Badge variant="destructive">৳{p.outstanding_due} due</Badge> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="p-2">{p.exam_office_cleared ? <StatusBadge status="APPROVED" /> : <StatusBadge status="PENDING" />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <PdfPreviewModal
        open={pdfPreview.open}
        onOpenChange={(open) => !open && pdfPreview.closePreview()}
        title={pdfPreview.title}
        pdfUrl={pdfPreview.url}
      />
    </PageWrapper>
  );
}

function AddSessionForm({ examId, classes }: { examId: string; classes?: ClassOption[] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [classIds, setClassIds] = useState<Set<string>>(new Set());

  const createMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/exams/${examId}/sessions`, { label, date, start_time: startTime, end_time: endTime, class_ids: [...classIds] }),
    onSuccess: () => {
      toast.success("Session added");
      queryClient.invalidateQueries({ queryKey: ["exams", examId, "sessions"] });
      setOpen(false);
      setLabel("");
      setDate("");
      setStartTime("");
      setEndTime("");
      setClassIds(new Set());
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Failed to add session";
      toast.error(message);
    },
  });

  function toggleClass(classId: string) {
    setClassIds((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      return next;
    });
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>+ Add Session</Button>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <p className="text-sm font-medium">New Session</p>
        <div className="grid grid-cols-4 gap-3">
          <Input placeholder="Label (e.g. Morning)" value={label} onChange={(e) => setLabel(e.target.value)} />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          <Input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Classes sitting in this session</p>
          <div className="flex flex-wrap gap-2">
            {classes?.map((c) => (
              <label key={c.id} className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
                <Checkbox checked={classIds.has(c.id)} onCheckedChange={() => toggleClass(c.id)} />
                {c.name_en}
              </label>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => createMutation.mutate()} disabled={!label || !date || !startTime || !endTime || !classIds.size || createMutation.isPending}>
            {createMutation.isPending ? "Saving..." : "Save Session"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SessionCard({ examId, session }: { examId: string; session: ExamSession }) {
  const queryClient = useQueryClient();
  const [halls, setHalls] = useState<Hall[]>([{ name: "Hall A", capacity: 50 }]);

  const generateMutation = useMutation({
    mutationFn: () => api.post(`/api/exams/${examId}/sessions/${session.id}/seat-plan/generate`, { halls }),
    onSuccess: (res) => {
      toast.success(`Generated seats for ${res.data.data.generated} student(s) in ${session.label}`);
      queryClient.invalidateQueries({ queryKey: ["exams", examId, "seat-plan"] });
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Generation failed";
      toast.error(message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/exams/${examId}/sessions/${session.id}`),
    onSuccess: () => {
      toast.success("Session removed");
      queryClient.invalidateQueries({ queryKey: ["exams", examId, "sessions"] });
    },
  });

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">{session.label}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(session.date).toLocaleDateString()} · {session.start_time}–{session.end_time} · {session.classes.map((c) => c.class.name_en).join(", ")}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>Remove Session</Button>
        </div>
        {halls.map((h, i) => (
          <div key={i} className="flex gap-3">
            <Input placeholder="Hall name" value={h.name} onChange={(e) => setHalls((prev) => prev.map((p, idx) => (idx === i ? { ...p, name: e.target.value } : p)))} />
            <Input type="number" placeholder="Capacity" value={h.capacity} onChange={(e) => setHalls((prev) => prev.map((p, idx) => (idx === i ? { ...p, capacity: Number(e.target.value) } : p)))} className="w-32" />
          </div>
        ))}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setHalls((prev) => [...prev, { name: "", capacity: 50 }])}>+ Add Hall</Button>
          <Button size="sm" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
            {generateMutation.isPending ? "Generating..." : "Generate Seats for This Session"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
