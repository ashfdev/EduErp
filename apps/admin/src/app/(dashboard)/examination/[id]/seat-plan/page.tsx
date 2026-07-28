"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, Checkbox, EmptyState, Input, PageHeader, PageWrapper, PdfPreviewModal, StatusBadge, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";
import { usePdfPreview } from "@/hooks/use-pdf-preview";

interface SeatPlanRow {
  id: string;
  hall_name: string;
  seat_number: string;
  row_number: number | null;
  seat_in_row: number | null;
  student_id: string;
  exam_office_cleared: boolean;
  outstanding_due: number;
  session: { id: string; label: string } | null;
  hall: { name: string; room_number: string | null; floor: string | null } | null;
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
  id: string;
  name: string;
  room_number: string | null;
  floor: string | null;
  rows: number;
  seats_per_row: number;
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
          <div className="flex gap-2">
            <Link href="/examination/halls"><Button variant="outline">Manage Halls</Button></Link>
            {!!plans?.length && (
              <>
                <Button variant="outline" onClick={() => pdfPreview.openPreview(`/api/documents/exam/${id}/seat-plan`, "Seat Plan")}>View Seat Plan</Button>
                <Button variant="outline" onClick={() => printSeatPlan(id)}>Print Seat Plan</Button>
              </>
            )}
          </div>
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
            <Table>
              <TableHeader>
                <TableRow><TableHead></TableHead><TableHead>Session</TableHead><TableHead>Hall</TableHead><TableHead>Room</TableHead><TableHead>Floor</TableHead><TableHead>Row</TableHead><TableHead>Seat</TableHead><TableHead>Student</TableHead><TableHead>Class</TableHead><TableHead>Due</TableHead><TableHead>Exam Office Approval</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {plans.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell><Checkbox checked={selected.has(p.student_id)} onCheckedChange={() => toggle(p.student_id)} disabled={p.exam_office_cleared} /></TableCell>
                    <TableCell className="text-muted-foreground">{p.session?.label ?? "—"}</TableCell>
                    <TableCell>{p.hall?.name ?? p.hall_name}</TableCell>
                    <TableCell className="text-muted-foreground">{p.hall?.room_number ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{p.hall?.floor ?? "—"}</TableCell>
                    <TableCell>{p.row_number ?? "—"}</TableCell>
                    <TableCell>{p.seat_in_row ?? p.seat_number}</TableCell>
                    <TableCell>{p.student.name_en} <span className="font-mono text-xs text-muted-foreground">{p.student.student_uid}</span></TableCell>
                    <TableCell>{p.student.current_class.name_en}</TableCell>
                    <TableCell>{p.outstanding_due > 0 ? <Badge variant="destructive">৳{p.outstanding_due} due</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell>{p.exam_office_cleared ? <StatusBadge status="APPROVED" /> : <StatusBadge status="PENDING" />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
      const message = extractErrorMessage(err) ?? "Failed to add session";
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
  // Ordered by selection (Set preserves insertion order) -- halls fill in
  // exactly the order picked, matching the backend's own fill logic.
  const [hallIds, setHallIds] = useState<string[]>([]);
  const { data: halls } = useQuery<Hall[]>({
    queryKey: ["exam-halls"],
    queryFn: async () => (await api.get("/api/exam-halls")).data.data,
  });

  function toggleHall(hallId: string) {
    setHallIds((prev) => (prev.includes(hallId) ? prev.filter((h) => h !== hallId) : [...prev, hallId]));
  }

  const totalCapacity = (halls ?? []).filter((h) => hallIds.includes(h.id)).reduce((sum, h) => sum + h.capacity, 0);

  const generateMutation = useMutation({
    mutationFn: () => api.post(`/api/exams/${examId}/sessions/${session.id}/seat-plan/generate`, { hall_ids: hallIds }),
    onSuccess: (res) => {
      const { generated, unplaced } = res.data.data;
      if (unplaced > 0) {
        toast.warning(`Generated seats for ${generated} student(s) in ${session.label} — ${unplaced} student(s) left unplaced, selected halls don't have enough capacity.`);
      } else {
        toast.success(`Generated seats for ${generated} student(s) in ${session.label}`);
      }
      queryClient.invalidateQueries({ queryKey: ["exams", examId, "seat-plan"] });
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? "Generation failed";
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

        {!halls?.length && (
          <p className="text-xs text-amber-700">
            No halls defined yet — <Link href="/examination/halls" className="underline">add one</Link> before generating seats.
          </p>
        )}
        {!!halls?.length && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Halls to fill, in order (select in the order you want them filled)</p>
            <div className="flex flex-wrap gap-2">
              {halls.map((h) => {
                const order = hallIds.indexOf(h.id);
                return (
                  <label key={h.id} className="flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs">
                    <Checkbox checked={order !== -1} onCheckedChange={() => toggleHall(h.id)} />
                    {order !== -1 && <span className="font-semibold">{order + 1}.</span>}
                    {h.name}
                    <span className="text-muted-foreground">
                      ({[h.room_number && `Room ${h.room_number}`, h.floor].filter(Boolean).join(", ")} · cap. {h.capacity})
                    </span>
                  </label>
                );
              })}
            </div>
            {!!hallIds.length && <p className="text-xs text-muted-foreground">Total capacity selected: {totalCapacity} seats</p>}
          </div>
        )}

        <div className="flex gap-2">
          <Button size="sm" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending || !hallIds.length}>
            {generateMutation.isPending ? "Generating..." : "Generate Seats for This Session"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
