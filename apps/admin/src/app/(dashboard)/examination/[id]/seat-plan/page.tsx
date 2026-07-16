"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Checkbox, StatusBadge, Badge, EmptyState } from "@education-erp/ui";
import { api } from "@/lib/api";

interface SeatPlanRow {
  id: string;
  hall_name: string;
  seat_number: string;
  student_id: string;
  exam_office_cleared: boolean;
  outstanding_due: number;
  student: { name_en: string; student_uid: string; current_class: { name_en: string } };
}

export default function SeatPlanPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [halls, setHalls] = useState([{ name: "Hall A", capacity: 50 }]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: plans } = useQuery<SeatPlanRow[]>({
    queryKey: ["exams", id, "seat-plan"],
    queryFn: async () => (await api.get(`/api/exams/${id}/seat-plan`)).data.data,
  });

  const generateMutation = useMutation({
    mutationFn: () => api.post(`/api/exams/${id}/seat-plan/generate`, { halls }),
    onSuccess: (res) => {
      toast.success(`Generated seat plan for ${res.data.data.generated} students`);
      queryClient.invalidateQueries({ queryKey: ["exams", id, "seat-plan"] });
    },
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
      <PageHeader title="Seat Plan" breadcrumbs={[{ label: "Examination", href: "/examination" }, { label: "Seat Plan" }]} />

      <Card>
        <CardContent className="space-y-3 pt-6">
          {halls.map((h, i) => (
            <div key={i} className="flex gap-3">
              <Input placeholder="Hall name" value={h.name} onChange={(e) => setHalls((prev) => prev.map((p, idx) => (idx === i ? { ...p, name: e.target.value } : p)))} />
              <Input type="number" placeholder="Capacity" value={h.capacity} onChange={(e) => setHalls((prev) => prev.map((p, idx) => (idx === i ? { ...p, capacity: Number(e.target.value) } : p)))} className="w-32" />
            </div>
          ))}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setHalls((prev) => [...prev, { name: "", capacity: 50 }])}>+ Add Hall</Button>
            <Button size="sm" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>Auto-Generate</Button>
          </div>
        </CardContent>
      </Card>

      {!plans?.length && <EmptyState title="No seat plan generated yet" />}
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
              <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2" /><th className="p-2">Hall</th><th className="p-2">Seat</th><th className="p-2">Student</th><th className="p-2">Class</th><th className="p-2">Due</th><th className="p-2">Exam Office Approval</th></tr></thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id} className="border-b">
                    <td className="p-2"><Checkbox checked={selected.has(p.student_id)} onCheckedChange={() => toggle(p.student_id)} disabled={p.exam_office_cleared} /></td>
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
    </PageWrapper>
  );
}
