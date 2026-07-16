"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Checkbox, Badge, SearchInput } from "@education-erp/ui";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

interface MarkComponent {
  key: string;
  label: string;
  max_marks: number;
}
interface Subject {
  id: string;
  name_en: string;
  config?: { full_marks_theory: number; full_marks_practical: number };
  components?: MarkComponent[];
}
interface MarkEntryData {
  entry_deadline_info: { is_open: boolean; closes_at: string | null };
  subjects: Subject[];
  students: {
    id: string;
    name_en: string;
    current_roll_no: string | null;
    marks: Record<string, { marks_theory: number | null; marks_practical: number | null; is_absent: boolean; component_marks?: Record<string, number> | null; status: string } | null>;
  }[];
}
interface ExamInfo {
  id: string;
  name: string;
  status: string;
}
interface ClassOption {
  id: string;
  name_en: string;
  sections: { id: string; name: string }[];
}

export default function MarkEntryGridPage() {
  const { exam_id, class_id, section_id } = useParams<{ exam_id: string; class_id: string; section_id: string }>();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  const readOnly = user?.role === "CLASS_TEACHER";

  const { data } = useQuery<MarkEntryData>({
    queryKey: ["marks", exam_id, class_id, section_id],
    queryFn: async () => (await api.get(`/api/marks/${exam_id}/${class_id}/${section_id}`)).data.data,
  });

  const { data: exam } = useQuery<ExamInfo>({
    queryKey: ["exams", exam_id],
    queryFn: async () => (await api.get(`/api/exams/${exam_id}`)).data.data,
  });
  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });
  const klass = classes?.find((c) => c.id === class_id);
  const section = klass?.sections.find((s) => s.id === section_id);

  const [edits, setEdits] = useState<Record<string, { marks_theory?: number; marks_practical?: number; is_absent?: boolean; component_marks?: Record<string, number> }>>({});
  const [search, setSearch] = useState("");

  const filteredStudents = useMemo(() => {
    if (!data) return [];
    if (!search.trim()) return data.students;
    const q = search.trim().toLowerCase();
    return data.students.filter((st) => st.name_en.toLowerCase().includes(q) || (st.current_roll_no ?? "").toLowerCase().includes(q));
  }, [data, search]);

  function key(studentId: string, subjectId: string) {
    return `${studentId}:${subjectId}`;
  }

  function getValue(studentId: string, subjectId: string) {
    const k = key(studentId, subjectId);
    if (edits[k]) return edits[k];
    const existing = data?.students.find((s) => s.id === studentId)?.marks[subjectId];
    return {
      marks_theory: existing?.marks_theory ?? undefined,
      marks_practical: existing?.marks_practical ?? undefined,
      is_absent: existing?.is_absent ?? false,
      component_marks: existing?.component_marks ?? undefined,
    };
  }

  function entryStatus(studentId: string, subjectId: string): string | undefined {
    return data?.students.find((s) => s.id === studentId)?.marks[subjectId]?.status;
  }

  // An empty box must stay empty, not snap to 0 — Number("") === 0, so it's
  // treated as "not entered yet" (undefined) instead of coercing on every keystroke.
  function parseMarkInput(raw: string): number | undefined {
    if (raw === "") return undefined;
    const n = Number(raw);
    return Number.isNaN(n) ? undefined : n;
  }

  function setComponentValue(studentId: string, subjectId: string, componentKey: string, raw: string) {
    const v = getValue(studentId, subjectId);
    const next = { ...(v.component_marks ?? {}) };
    const parsed = parseMarkInput(raw);
    if (parsed === undefined) delete next[componentKey];
    else next[componentKey] = parsed;
    setEdits((prev) => ({ ...prev, [key(studentId, subjectId)]: { ...v, component_marks: next } }));
  }

  const submitMutation = useMutation({
    mutationFn: () => {
      const entries = Object.entries(edits).map(([k, v]) => {
        const [student_id, subject_id] = k.split(":");
        return { student_id, subject_id, marks_theory: v.marks_theory, marks_practical: v.marks_practical, component_marks: v.component_marks, is_absent: v.is_absent };
      });
      return api.post("/api/marks/submit", { exam_id, entries });
    },
    onSuccess: () => {
      toast.success("Marks submitted for approval");
      setEdits({});
      queryClient.invalidateQueries({ queryKey: ["marks", exam_id, class_id, section_id] });
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? "Failed to submit marks";
      toast.error(message);
    },
  });

  function handleSubmit() {
    const approvedTouched = Object.keys(edits).filter((k) => {
      const [studentId, subjectId] = k.split(":") as [string, string];
      return entryStatus(studentId, subjectId) === "APPROVED";
    }).length;
    if (approvedTouched > 0) {
      const ok = window.confirm(
        `${approvedTouched} of your pending change(s) touch mark(s) that were already approved. Saving will revert ${approvedTouched === 1 ? "it" : "them"} back to Submitted, and ${approvedTouched === 1 ? "it" : "they"} will need to be re-approved before results can be published. Continue?`,
      );
      if (!ok) return;
    }
    submitMutation.mutate();
  }

  if (!data) return <PageWrapper><p className="text-sm text-muted-foreground">Loading...</p></PageWrapper>;

  return (
    <PageWrapper>
      <PageHeader
        title={exam?.name ?? "Mark Entry"}
        subtitle={`${klass?.name_en ?? "…"} · ${section?.name ?? "…"} — ${data.entry_deadline_info.is_open ? "Entry window is open" : "Entry window is closed"}`}
        breadcrumbs={[{ label: "Marks", href: "/marks" }, ...(exam ? [{ label: exam.name }] : []), ...(klass && section ? [{ label: `${klass.name_en} · ${section.name}` }] : [])]}
      />

      {!data.subjects.length && <p className="text-sm text-muted-foreground">No subjects assigned to you for this class/section.</p>}

      {readOnly && data.subjects.length > 0 && (
        <p className="text-sm text-muted-foreground">You can view marks for your class, but only Subject Teachers, Exam Controllers, and Admins can enter or edit them.</p>
      )}

      {data.subjects.length > 0 && (
        <SearchInput placeholder="Search by name or roll..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
      )}

      {data.subjects.length > 0 && (
        <Card>
          <CardContent className="overflow-x-auto pt-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-2">Roll</th>
                  <th className="p-2">Name</th>
                  {data.subjects.map((s) => (
                    <th key={s.id} className="p-2">
                      {s.name_en} <span className="text-xs">/{(s.config?.full_marks_theory ?? 0) + (s.config?.full_marks_practical ?? 0)}</span>
                      {s.components && s.components.length > 0 ? (
                        <div className="flex flex-wrap gap-1 text-[10px] font-normal normal-case text-muted-foreground">
                          {s.components.map((comp) => <span key={comp.key} className="w-14">{comp.label}/{comp.max_marks}</span>)}
                          {!!s.config?.full_marks_practical && <span className="w-16">Practical/{s.config.full_marks_practical}</span>}
                        </div>
                      ) : (
                        !!s.config?.full_marks_practical && (
                          <div className="flex gap-1 text-[10px] font-normal normal-case text-muted-foreground">
                            <span className="w-16">Theory/{s.config.full_marks_theory}</span>
                            <span className="w-16">Practical/{s.config.full_marks_practical}</span>
                          </div>
                        )
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((st) => (
                  <tr key={st.id} className="border-b">
                    <td className="p-2">{st.current_roll_no}</td>
                    <td className="p-2">
                      <Link href={`/students/${st.id}`} className="hover:underline" target="_blank">{st.name_en}</Link>
                    </td>
                    {data.subjects.map((s) => {
                      const v = getValue(st.id, s.id);
                      const status = entryStatus(st.id, s.id);
                      const componentSum = s.components?.length
                        ? Object.values(v.component_marks ?? {}).reduce((sum, n) => sum + (n || 0), 0)
                        : undefined;
                      return (
                        <td key={s.id} className="p-1">
                          <div className="flex items-center gap-1">
                            {status === "APPROVED" && (
                              <Badge variant="success" title="Already approved — editing will require re-approval">✓</Badge>
                            )}
                            {s.components && s.components.length > 0 ? (
                              <>
                                {s.components.map((comp) => (
                                  <Input
                                    key={comp.key}
                                    type="number"
                                    min={0}
                                    max={comp.max_marks}
                                    title={`${comp.label}, out of ${comp.max_marks}`}
                                    placeholder={comp.label}
                                    className="h-8 w-14 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                    disabled={readOnly || v.is_absent}
                                    value={v.component_marks?.[comp.key] ?? ""}
                                    onChange={(e) => setComponentValue(st.id, s.id, comp.key, e.target.value)}
                                  />
                                ))}
                                <span className="text-xs text-muted-foreground">={componentSum}</span>
                              </>
                            ) : (
                              <Input
                                type="number"
                                min={0}
                                max={s.config?.full_marks_theory}
                                title={s.config ? `Theory, out of ${s.config.full_marks_theory}` : "Theory"}
                                className="h-8 w-16 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                disabled={readOnly || v.is_absent}
                                value={v.marks_theory ?? ""}
                                onChange={(e) =>
                                  setEdits((prev) => ({ ...prev, [key(st.id, s.id)]: { ...v, marks_theory: parseMarkInput(e.target.value) } }))
                                }
                              />
                            )}
                            {!!s.config?.full_marks_practical && (
                              <Input
                                type="number"
                                min={0}
                                max={s.config.full_marks_practical}
                                title={`Practical, out of ${s.config.full_marks_practical}`}
                                className="h-8 w-16 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                                disabled={readOnly || v.is_absent}
                                value={v.marks_practical ?? ""}
                                onChange={(e) =>
                                  setEdits((prev) => ({ ...prev, [key(st.id, s.id)]: { ...v, marks_practical: parseMarkInput(e.target.value) } }))
                                }
                              />
                            )}
                            <label className="flex items-center gap-1 text-xs">
                              <Checkbox
                                checked={v.is_absent ?? false}
                                disabled={readOnly}
                                onCheckedChange={(checked) => setEdits((prev) => ({ ...prev, [key(st.id, s.id)]: { ...v, is_absent: checked === true } }))}
                              />
                              Ab
                            </label>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {data.subjects.length > 0 && !readOnly && (
        <div className="flex items-center gap-3">
          <Button onClick={handleSubmit} disabled={submitMutation.isPending || !Object.keys(edits).length}>
            {submitMutation.isPending ? "Submitting..." : "Submit Marks"}
          </Button>
          <Badge variant="outline">{Object.keys(edits).length} pending change(s)</Badge>
        </div>
      )}
    </PageWrapper>
  );
}
