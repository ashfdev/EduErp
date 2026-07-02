"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Label, Checkbox } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Option {
  id: string;
  name?: string;
  label?: string;
  name_en?: string;
}

export default function NewExamPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [examTypeId, setExamTypeId] = useState("");
  const [academicYearId, setAcademicYearId] = useState("");
  const [gradingScaleId, setGradingScaleId] = useState("");
  const [classIds, setClassIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [markOpen, setMarkOpen] = useState("");
  const [markClose, setMarkClose] = useState("");

  const { data: examTypes } = useQuery<Option[]>({ queryKey: ["settings", "exam-types"], queryFn: async () => (await api.get("/api/settings/exam-types")).data.data });
  const { data: years } = useQuery<Option[]>({ queryKey: ["settings", "academic-years"], queryFn: async () => (await api.get("/api/settings/academic-years")).data.data });
  const { data: scales } = useQuery<Option[]>({ queryKey: ["settings", "grading-scales"], queryFn: async () => (await api.get("/api/settings/grading-scales")).data.data });
  const { data: classes } = useQuery<Option[]>({ queryKey: ["settings", "classes"], queryFn: async () => (await api.get("/api/settings/classes")).data.data });

  const createMutation = useMutation({
    mutationFn: () =>
      api.post("/api/exams", {
        name,
        exam_type_config_id: examTypeId,
        academic_year_id: academicYearId,
        grading_scale_id: gradingScaleId || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        mark_entry_opens_at: markOpen || undefined,
        mark_entry_closes_at: markClose || undefined,
        class_ids: classIds,
      }),
    onSuccess: (res) => {
      toast.success("Exam created");
      router.push(`/examination/${res.data.data.id}`);
    },
    onError: () => toast.error("Failed to create exam"),
  });

  return (
    <PageWrapper>
      <PageHeader title="Create Exam" breadcrumbs={[{ label: "Examination", href: "/examination" }, { label: "Create" }]} />
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Half Yearly Examination 2026" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Exam Type</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={examTypeId} onChange={(e) => setExamTypeId(e.target.value)}>
                <option value="">Select...</option>
                {examTypes?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Academic Year</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)}>
                <option value="">Select...</option>
                {years?.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Grading Scale</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={gradingScaleId} onChange={(e) => setGradingScaleId(e.target.value)}>
                <option value="">Default</option>
                {scales?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4">
            <div className="space-y-1.5"><Label>Start Date</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>End Date</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Mark Entry Opens</Label><Input type="datetime-local" value={markOpen} onChange={(e) => setMarkOpen(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Mark Entry Closes</Label><Input type="datetime-local" value={markClose} onChange={(e) => setMarkClose(e.target.value)} /></div>
          </div>
          <div className="space-y-2">
            <Label>Classes & Sections covered</Label>
            <div className="flex flex-wrap gap-3">
              {classes?.map((c) => (
                <label key={c.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                  <Checkbox checked={classIds.includes(c.id)} onCheckedChange={(v) => setClassIds((prev) => (v ? [...prev, c.id] : prev.filter((id) => id !== c.id)))} />
                  {c.name_en}
                </label>
              ))}
            </div>
          </div>
          <Button disabled={createMutation.isPending || !name || !examTypeId || !academicYearId || !classIds.length} onClick={() => createMutation.mutate()}>
            {createMutation.isPending ? "Creating..." : "Create Exam"}
          </Button>
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
