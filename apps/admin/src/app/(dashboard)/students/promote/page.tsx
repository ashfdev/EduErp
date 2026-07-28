"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, Checkbox, EmptyState, PageHeader, PageWrapper, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";

interface ClassOption {
  id: string;
  name_en: string;
  sections: { id: string; name: string }[];
  groups?: { id: string; name_en: string }[];
  academic_year?: { label: string } | null;
}
interface YearOption {
  id: string;
  label: string;
  is_active: boolean;
}
interface RosterStudent {
  id: string;
  name_en: string;
  student_uid: string;
  current_roll_no: string | null;
  current_class: { id: string; name_en: string } | null;
  current_section: { id: string; name: string } | null;
  eligibility: { eligible: boolean; reason?: string };
}
interface SubjectOption {
  id: string;
  name_en: string;
  is_optional: boolean;
}
interface PromoteResult {
  promoted: string[];
  skipped: { id: string; reason: string }[];
}

export default function PromoteStudentsPage() {
  const [sourceClassId, setSourceClassId] = useState("");
  const [sourceSectionId, setSourceSectionId] = useState("");
  const [destClassId, setDestClassId] = useState("");
  const [destSectionId, setDestSectionId] = useState("");
  const [destYearId, setDestYearId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [studentGroupIds, setStudentGroupIds] = useState<Record<string, string>>({});
  const [studentOptionalSubjectIds, setStudentOptionalSubjectIds] = useState<Record<string, string[]>>({});
  const [studentFourthSubjectIds, setStudentFourthSubjectIds] = useState<Record<string, string>>({});
  const [result, setResult] = useState<PromoteResult | null>(null);

  // Intentionally unscoped by year — an admin needs to find a student's
  // CURRENT class regardless of which year that class row was created in.
  // Each option is labeled with its own academic year so a stale-looking
  // row is never ambiguous.
  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes", "all"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });
  const { data: years } = useQuery<YearOption[]>({
    queryKey: ["settings", "academic-years"],
    queryFn: async () => (await api.get("/api/settings/academic-years")).data.data,
  });
  // The DESTINATION class must belong to the destination year — Class rows
  // are recreated every academic year, so this list is scoped, unlike the
  // source list above.
  const { data: destClasses } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes", destYearId],
    queryFn: async () => (await api.get("/api/settings/classes", { params: { academic_year_id: destYearId } })).data.data,
    enabled: !!destYearId,
  });

  const sourceClass = classes?.find((c) => c.id === sourceClassId);
  const destClass = destClasses?.find((c) => c.id === destClassId);
  const destHasGroups = !!destClass?.groups?.length;

  // Every subject in the destination class -- same unfiltered-by-group shape
  // the single-student Add/Edit Student wizard's own Subjects step already
  // uses (inheritSubjectsForClass silently drops a selection that doesn't
  // match the student's own group server-side, so this isn't a correctness
  // gap, just the same established UI pattern carried over here).
  const { data: destSubjects } = useQuery<SubjectOption[]>({
    queryKey: ["subjects", destClassId],
    queryFn: async () => (await api.get("/api/subjects", { params: { class_id: destClassId } })).data.data,
    enabled: !!destClassId,
  });
  const destOptionalSubjects = destSubjects?.filter((s) => s.is_optional) ?? [];

  function toggleOptionalSubject(studentId: string, subjectId: string) {
    setStudentOptionalSubjectIds((prev) => {
      const current = prev[studentId] ?? [];
      const next = current.includes(subjectId) ? current.filter((sid) => sid !== subjectId) : [...current, subjectId];
      return { ...prev, [studentId]: next };
    });
    // Dropping a subject that was the designated 4th subject must also clear
    // that designation -- it can no longer point at a selected subject.
    setStudentFourthSubjectIds((prev) => {
      if (prev[studentId] !== subjectId) return prev;
      const next = { ...prev };
      delete next[studentId];
      return next;
    });
  }

  const { data: roster, isFetching: rosterLoading, refetch } = useQuery<RosterStudent[]>({
    queryKey: ["students", "promotion-roster", sourceClassId, sourceSectionId],
    queryFn: async () =>
      (await api.get("/api/students/promotion-roster", { params: { class_id: sourceClassId, section_id: sourceSectionId || undefined } })).data.data,
    enabled: false,
  });

  function loadRoster() {
    setSelected(new Set());
    setStudentGroupIds({});
    setStudentOptionalSubjectIds({});
    setStudentFourthSubjectIds({});
    setResult(null);
    refetch().then((res) => {
      const eligibleIds = (res.data ?? []).filter((s) => s.eligibility.eligible).map((s) => s.id);
      setSelected(new Set(eligibleIds));
    });
  }

  function toggle(studentId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  const readyToSubmit = useMemo(() => {
    if (!selected.size || !destClassId || !destYearId) return false;
    if (destHasGroups) {
      for (const id of selected) {
        if (!studentGroupIds[id]) return false;
      }
    }
    return true;
  }, [selected, destClassId, destYearId, destHasGroups, studentGroupIds]);

  const promoteMutation = useMutation({
    mutationFn: () =>
      api.post("/api/students/bulk-promote", {
        class_id: sourceClassId,
        section_id: sourceSectionId || undefined,
        new_class_id: destClassId,
        new_section_id: destSectionId || undefined,
        new_academic_year_id: destYearId,
        student_ids: [...selected],
        student_group_ids: destHasGroups ? studentGroupIds : undefined,
        student_optional_subject_ids: destOptionalSubjects.length ? studentOptionalSubjectIds : undefined,
        student_fourth_subject_ids: destOptionalSubjects.length ? studentFourthSubjectIds : undefined,
      }),
    onSuccess: (res) => {
      const data: PromoteResult = res.data.data;
      setResult(data);
      setSelected(new Set());
      setStudentGroupIds({});
      setStudentOptionalSubjectIds({});
      setStudentFourthSubjectIds({});
      toast.success(`Promoted ${data.promoted.length} student(s)${data.skipped.length ? `, ${data.skipped.length} skipped` : ""}`);
      refetch();
    },
    onError: (err: unknown) => {
      const message = extractErrorMessage(err) ?? "Promotion failed";
      toast.error(message);
    },
  });

  return (
    <PageWrapper>
      <PageHeader title="Class-Wide Promotion" subtitle="Promote a whole class/section at once, with automatic eligibility checks" breadcrumbs={[{ label: "Students", href: "/students" }, { label: "Promote" }]} />

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm font-medium">From</p>
            <select className="w-full rounded-md border px-3 py-2 text-sm" value={sourceClassId} onChange={(e) => { setSourceClassId(e.target.value); setSourceSectionId(""); }}>
              <option value="">Select source class...</option>
              {classes?.map((c) => <option key={c.id} value={c.id}>{c.name_en}{c.academic_year ? ` (${c.academic_year.label})` : ""}</option>)}
            </select>
            <select className="w-full rounded-md border px-3 py-2 text-sm" value={sourceSectionId} onChange={(e) => setSourceSectionId(e.target.value)} disabled={!sourceClassId}>
              <option value="">All Sections</option>
              {sourceClass?.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <Button size="sm" onClick={loadRoster} disabled={!sourceClassId || rosterLoading}>
              {rosterLoading ? "Loading..." : "Load Roster"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-3 pt-6">
            <p className="text-sm font-medium">To</p>
            <select
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={destYearId}
              onChange={(e) => { setDestYearId(e.target.value); setDestClassId(""); setDestSectionId(""); setStudentGroupIds({}); }}
            >
              <option value="">Select academic year...</option>
              {years?.map((y) => <option key={y.id} value={y.id}>{y.label}{y.is_active ? " (Active)" : ""}</option>)}
            </select>
            <select
              className="w-full rounded-md border px-3 py-2 text-sm"
              value={destClassId}
              onChange={(e) => { setDestClassId(e.target.value); setDestSectionId(""); setStudentGroupIds({}); setStudentOptionalSubjectIds({}); setStudentFourthSubjectIds({}); }}
              disabled={!destYearId}
            >
              <option value="">{destYearId ? "Select destination class..." : "Select an academic year first"}</option>
              {destClasses?.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
            </select>
            <select className="w-full rounded-md border px-3 py-2 text-sm" value={destSectionId} onChange={(e) => setDestSectionId(e.target.value)} disabled={!destClassId}>
              <option value="">Select destination section...</option>
              {destClass?.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {destHasGroups && <p className="text-xs text-muted-foreground">This class has Groups/Streams — pick each promoted student&apos;s group below.</p>}
            {!!destOptionalSubjects.length && <p className="text-xs text-muted-foreground">This class offers optional subjects — pick each promoted student&apos;s selection below.</p>}
          </CardContent>
        </Card>
      </div>

      {roster && !roster.length && <EmptyState title="No active students in this class/section" />}

      {!!roster?.length && (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {roster.filter((s) => s.eligibility.eligible).length} of {roster.length} eligible · {selected.size} selected
              </p>
              <Button onClick={() => promoteMutation.mutate()} disabled={!readyToSubmit || promoteMutation.isPending}>
                {promoteMutation.isPending ? "Promoting..." : `Promote Selected (${selected.size})`}
              </Button>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="p-2" />
                  <th className="p-2">Roll</th>
                  <th className="p-2">Student</th>
                  <th className="p-2">Status</th>
                  {destHasGroups && <th className="p-2">Group</th>}
                  {!!destOptionalSubjects.length && <th className="p-2">Optional Subjects</th>}
                </tr>
              </thead>
              <tbody>
                {roster.map((s) => (
                  <tr key={s.id} className={`border-b ${!s.eligibility.eligible ? "opacity-50" : ""}`}>
                    <td className="p-2">
                      <Checkbox
                        checked={selected.has(s.id)}
                        disabled={!s.eligibility.eligible}
                        onCheckedChange={() => toggle(s.id)}
                      />
                    </td>
                    <td className="p-2">{s.current_roll_no ?? "—"}</td>
                    <td className="p-2">
                      <p className="font-medium">{s.name_en}</p>
                      <p className="font-mono text-xs text-muted-foreground">{s.student_uid}</p>
                    </td>
                    <td className="p-2">
                      {s.eligibility.eligible ? <Badge variant="success">Eligible</Badge> : <Badge variant="destructive">{s.eligibility.reason}</Badge>}
                    </td>
                    {destHasGroups && (
                      <td className="p-2">
                        {selected.has(s.id) ? (
                          <select
                            className="rounded-md border px-2 py-1 text-xs"
                            value={studentGroupIds[s.id] ?? ""}
                            onChange={(e) => setStudentGroupIds((prev) => ({ ...prev, [s.id]: e.target.value }))}
                          >
                            <option value="">Select group...</option>
                            {destClass?.groups?.map((g) => <option key={g.id} value={g.id}>{g.name_en}</option>)}
                          </select>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    )}
                    {!!destOptionalSubjects.length && (
                      <td className="p-2">
                        {selected.has(s.id) ? (
                          <div className="space-y-1">
                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                              {destOptionalSubjects.map((subj) => (
                                <label key={subj.id} className="flex items-center gap-1 text-xs">
                                  <Checkbox
                                    checked={(studentOptionalSubjectIds[s.id] ?? []).includes(subj.id)}
                                    onCheckedChange={() => toggleOptionalSubject(s.id, subj.id)}
                                  />
                                  {subj.name_en}
                                </label>
                              ))}
                            </div>
                            {!!(studentOptionalSubjectIds[s.id] ?? []).length && (
                              <select
                                className="rounded-md border px-2 py-1 text-xs"
                                value={studentFourthSubjectIds[s.id] ?? ""}
                                onChange={(e) => setStudentFourthSubjectIds((prev) => ({ ...prev, [s.id]: e.target.value }))}
                              >
                                <option value="">No 4th subject</option>
                                {(studentOptionalSubjectIds[s.id] ?? []).map((sid) => {
                                  const subj = destOptionalSubjects.find((o) => o.id === sid);
                                  return subj ? <option key={sid} value={sid}>{subj.name_en} (4th)</option> : null;
                                })}
                              </select>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardContent className="space-y-2 pt-6">
            <p className="text-sm font-medium">Result</p>
            <p className="text-sm text-emerald-600">{result.promoted.length} student(s) promoted successfully.</p>
            {!!result.skipped.length && (
              <div className="text-sm">
                <p className="text-red-600">{result.skipped.length} skipped:</p>
                <ul className="ml-4 list-disc text-muted-foreground">
                  {result.skipped.map((s) => <li key={s.id}>{roster?.find((r) => r.id === s.id)?.name_en ?? s.id}: {s.reason}</li>)}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </PageWrapper>
  );
}
