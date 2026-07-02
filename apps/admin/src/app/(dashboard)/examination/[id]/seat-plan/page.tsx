"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, EmptyState } from "@education-erp/ui";
import { api } from "@/lib/api";

interface SeatPlanRow {
  id: string;
  hall_name: string;
  seat_number: string;
  student: { name_en: string; student_uid: string; current_class: { name_en: string } };
}

export default function SeatPlanPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [halls, setHalls] = useState([{ name: "Hall A", capacity: 50 }]);

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
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-muted-foreground"><th className="p-2">Hall</th><th className="p-2">Seat</th><th className="p-2">Student</th><th className="p-2">Class</th></tr></thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id} className="border-b">
                    <td className="p-2">{p.hall_name}</td>
                    <td className="p-2">{p.seat_number}</td>
                    <td className="p-2">{p.student.name_en} <span className="font-mono text-xs text-muted-foreground">{p.student.student_uid}</span></td>
                    <td className="p-2">{p.student.current_class.name_en}</td>
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
