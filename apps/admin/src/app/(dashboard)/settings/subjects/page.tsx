"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PageWrapper,
  PageHeader,
  Card,
  CardContent,
  Button,
  Badge,
  Input,
  Label,
  Switch,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  EmptyState,
} from "@education-erp/ui";
import { api } from "@/lib/api";

interface ClassOption {
  id: string;
  name_en: string;
  academic_year_id: string;
  sections: { id: string; name: string }[];
}

interface Subject {
  id: string;
  name_en: string;
  code: string;
  subject_type: string;
  is_compulsory: boolean;
  is_optional: boolean;
  full_marks: number;
  pass_marks: number;
  display_order: number;
}

interface Assignment {
  id: string;
  section_id: string | null;
  staff: { id: string; name_en: string; designation: string };
}

interface Teacher {
  id: string;
  name_en: string;
  designation: string;
}

export default function SubjectsSettingsPage() {
  const queryClient = useQueryClient();
  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });
  const { data: teachers } = useQuery<Teacher[]>({
    queryKey: ["staff", "teachers"],
    queryFn: async () => (await api.get("/api/staff/teachers")).data.data,
  });

  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const selectedClass = classes?.find((c) => c.id === selectedClassId);

  const { data: subjects } = useQuery<Subject[]>({
    queryKey: ["subjects", selectedClassId],
    queryFn: async () => (await api.get("/api/subjects", { params: { class_id: selectedClassId } })).data.data,
    enabled: !!selectedClassId,
  });

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name_en: "", code: "", subject_type: "THEORY", is_compulsory: true, is_optional: false, full_marks: 100, pass_marks: 33 });

  const createMutation = useMutation({
    mutationFn: () => api.post("/api/subjects", { ...form, class_id: selectedClassId, display_order: (subjects?.length ?? 0) + 1 }),
    onSuccess: () => {
      toast.success("Subject added");
      queryClient.invalidateQueries({ queryKey: ["subjects", selectedClassId] });
      setAddOpen(false);
      setForm({ name_en: "", code: "", subject_type: "THEORY", is_compulsory: true, is_optional: false, full_marks: 100, pass_marks: 33 });
    },
    onError: () => toast.error("Failed to add subject — code may already exist in this class"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/subjects/${id}`),
    onSuccess: () => {
      toast.success("Subject removed");
      queryClient.invalidateQueries({ queryKey: ["subjects", selectedClassId] });
    },
    onError: () => toast.error("This subject has exam records and cannot be deleted"),
  });

  const moveMutation = useMutation({
    mutationFn: (reordered: { id: string; display_order: number }[]) => api.put("/api/subjects/reorder", reordered),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["subjects", selectedClassId] }),
  });

  function move(index: number, direction: -1 | 1) {
    if (!subjects) return;
    const target = index + direction;
    if (target < 0 || target >= subjects.length) return;
    const reordered = [...subjects];
    [reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!];
    moveMutation.mutate(reordered.map((s, i) => ({ id: s.id, display_order: i + 1 })));
  }

  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);
  const { data: assignments } = useQuery<Assignment[]>({
    queryKey: ["subjects", expandedSubject, "assignments"],
    queryFn: async () => (await api.get(`/api/subjects/${expandedSubject}/assignments`)).data.data,
    enabled: !!expandedSubject,
  });

  const [assignSectionId, setAssignSectionId] = useState<string>("");
  const [assignStaffId, setAssignStaffId] = useState<string>("");
  const assignMutation = useMutation({
    mutationFn: () =>
      api.post("/api/subjects/assign", {
        subject_id: expandedSubject,
        staff_id: assignStaffId,
        section_id: assignSectionId || undefined,
        academic_year_id: selectedClass?.academic_year_id,
      }),
    onSuccess: () => {
      toast.success("Teacher assigned");
      queryClient.invalidateQueries({ queryKey: ["subjects", expandedSubject, "assignments"] });
      setAssignStaffId("");
    },
    onError: () => toast.error("Failed to assign — this section may already have a teacher for this subject"),
  });

  const unassignMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/subjects/assign/${id}`),
    onSuccess: () => {
      toast.success("Unassigned");
      queryClient.invalidateQueries({ queryKey: ["subjects", expandedSubject, "assignments"] });
    },
  });

  return (
    <PageWrapper>
      <PageHeader title="Subjects" subtitle="Subjects per class + teacher assignment" breadcrumbs={[{ label: "Settings" }, { label: "Subjects" }]} />

      <div className="grid grid-cols-4 gap-6">
        <div className="col-span-1 space-y-1">
          {classes?.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedClassId(c.id)}
              className={`w-full rounded-md px-3 py-2 text-left text-sm ${selectedClassId === c.id ? "bg-accent font-medium" : "hover:bg-accent/50"}`}
            >
              {c.name_en}
            </button>
          ))}
        </div>

        <div className="col-span-3 space-y-4">
          {!selectedClassId && <EmptyState title="Select a class to manage its subjects" />}

          {selectedClassId && (
            <>
              <div className="flex justify-between">
                <h3 className="font-medium">{selectedClass?.name_en}</h3>
                <Button size="sm" onClick={() => setAddOpen(true)}>+ Add Subject</Button>
              </div>

              {!subjects?.length && <EmptyState title="No subjects yet for this class" />}

              <div className="space-y-2">
                {subjects?.map((s, i) => (
                  <Card key={s.id}>
                    <CardContent className="space-y-3 pt-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="flex flex-col">
                            <button className="text-xs disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)}>▲</button>
                            <button className="text-xs disabled:opacity-30" disabled={i === subjects.length - 1} onClick={() => move(i, 1)}>▼</button>
                          </div>
                          <div>
                            <p className="font-medium">{s.name_en} <span className="font-mono text-xs text-muted-foreground">{s.code}</span></p>
                            <div className="mt-1 flex gap-1">
                              <Badge variant={s.is_compulsory ? "default" : "outline"}>{s.is_compulsory ? "Compulsory" : "Optional"}</Badge>
                              <Badge variant="secondary">{s.subject_type}</Badge>
                              <Badge variant="outline">FM {s.full_marks} / PM {s.pass_marks}</Badge>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => setExpandedSubject(expandedSubject === s.id ? null : s.id)}>
                            {expandedSubject === s.id ? "Hide" : "Teachers"}
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => deleteMutation.mutate(s.id)}>Delete</Button>
                        </div>
                      </div>

                      {expandedSubject === s.id && (
                        <div className="space-y-3 border-t pt-3">
                          <table className="w-full text-sm">
                            <tbody>
                              {assignments?.map((a) => (
                                <tr key={a.id} className="border-b">
                                  <td className="p-1">{selectedClass?.sections.find((sec) => sec.id === a.section_id)?.name ?? "All sections"}</td>
                                  <td className="p-1">{a.staff.name_en}</td>
                                  <td className="p-1"><Button size="sm" variant="ghost" onClick={() => unassignMutation.mutate(a.id)}>Remove</Button></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="flex gap-2">
                            <select className="rounded-md border px-2 py-1 text-sm" value={assignSectionId} onChange={(e) => setAssignSectionId(e.target.value)}>
                              <option value="">All sections</option>
                              {selectedClass?.sections.map((sec) => <option key={sec.id} value={sec.id}>{sec.name}</option>)}
                            </select>
                            <select className="flex-1 rounded-md border px-2 py-1 text-sm" value={assignStaffId} onChange={(e) => setAssignStaffId(e.target.value)}>
                              <option value="">Select teacher...</option>
                              {teachers?.map((t) => <option key={t.id} value={t.id}>{t.name_en} — {t.designation}</option>)}
                            </select>
                            <Button size="sm" disabled={!assignStaffId} onClick={() => assignMutation.mutate()}>Assign</Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Subject</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Name</Label><Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Full Marks</Label><Input type="number" value={form.full_marks} onChange={(e) => setForm({ ...form, full_marks: Number(e.target.value) })} /></div>
              <div className="space-y-1.5"><Label>Pass Marks</Label><Input type="number" value={form.pass_marks} onChange={(e) => setForm({ ...form, pass_marks: Number(e.target.value) })} /></div>
            </div>
            <div className="flex items-center justify-between"><Label>Compulsory</Label><Switch checked={form.is_compulsory} onCheckedChange={(v) => setForm({ ...form, is_compulsory: v, is_optional: v ? false : form.is_optional })} /></div>
            <div className="flex items-center justify-between"><Label>Optional</Label><Switch checked={form.is_optional} onCheckedChange={(v) => setForm({ ...form, is_optional: v, is_compulsory: v ? false : form.is_compulsory })} /></div>
          </div>
          <DialogFooter><Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending || !form.name_en || !form.code}>Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </PageWrapper>
  );
}
