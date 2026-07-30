"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PageWrapper, PageHeader, Card, CardContent, Button, ErrorState, LoadingSpinner, extractErrorMessage } from "@education-erp/ui";
import { api } from "@/lib/api";
import { useInstitution } from "@/hooks/use-institution";

interface Exam {
  id: string;
  name: string;
  status: string;
}
interface ClassOption {
  id: string;
  name_en: string;
  department_id: string | null;
  program_id: string | null;
  sections: { id: string; name: string }[];
  groups?: { id: string; name_en: string }[];
}
interface DepartmentOption {
  id: string;
  name_en: string;
}
interface ProgramOption {
  id: string;
  name_en: string;
  department_id: string | null;
}

export default function MyMarkEntryPage() {
  const router = useRouter();
  const t = useTranslations("marks");
  const { type } = useInstitution();
  const isUniversity = type === "UNIVERSITY";

  const [examId, setExamId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [programId, setProgramId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [groupId, setGroupId] = useState("");

  const { data: exams, isLoading: examsLoading, isError: examsError, error: examsErrorObj, refetch: refetchExams } = useQuery<Exam[]>({
    queryKey: ["exams", "mark-entry-open"],
    queryFn: async () => (await api.get("/api/exams", { params: { status: "MARK_ENTRY" } })).data.data,
  });
  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });
  const { data: departments } = useQuery<DepartmentOption[]>({
    queryKey: ["settings", "departments"],
    queryFn: async () => (await api.get("/api/settings/departments")).data.data,
    enabled: isUniversity,
  });
  const { data: programs } = useQuery<ProgramOption[]>({
    queryKey: ["settings", "programs"],
    queryFn: async () => (await api.get("/api/settings/programs")).data.data,
    enabled: isUniversity,
  });

  const programsInDept = programs?.filter((p) => !departmentId || p.department_id === departmentId);
  const visibleClasses = classes?.filter((c) => {
    if (isUniversity && departmentId && c.department_id !== departmentId) return false;
    if (isUniversity && programId && c.program_id !== programId) return false;
    return true;
  });
  const selectedClass = classes?.find((c) => c.id === classId);
  const hasGroups = !!selectedClass?.groups?.length;

  // Reserves a grid column for the Group select whenever it's actually
  // shown, instead of letting a fixed 3/5-column grid wrap it onto its own
  // orphaned row below the other filters — a real, confirmed reason this
  // filter was hard to notice even though it was always functionally there.
  const gridColsClass = isUniversity
    ? hasGroups ? "grid-cols-6" : "grid-cols-5"
    : hasGroups ? "grid-cols-4" : "grid-cols-3";

  return (
    <PageWrapper>
      <PageHeader title={t("title")} subtitle={t("subtitle")} breadcrumbs={[{ label: "Marks" }]} />
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className={`grid gap-4 ${gridColsClass}`}>
            <select className="rounded-md border px-3 py-2 text-sm" value={examId} onChange={(e) => setExamId(e.target.value)}>
              <option value="">{t("selectExam")}</option>
              {exams?.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            {isUniversity && (
              <>
                <select
                  className="rounded-md border px-3 py-2 text-sm"
                  value={departmentId}
                  onChange={(e) => { setDepartmentId(e.target.value); setProgramId(""); setClassId(""); setSectionId(""); setGroupId(""); }}
                >
                  <option value="">All Departments</option>
                  {departments?.map((d) => <option key={d.id} value={d.id}>{d.name_en}</option>)}
                </select>
                <select
                  className="rounded-md border px-3 py-2 text-sm"
                  value={programId}
                  onChange={(e) => { setProgramId(e.target.value); setClassId(""); setSectionId(""); setGroupId(""); }}
                >
                  <option value="">All Programs</option>
                  {programsInDept?.map((p) => <option key={p.id} value={p.id}>{p.name_en}</option>)}
                </select>
              </>
            )}
            <select className="rounded-md border px-3 py-2 text-sm" value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(""); setGroupId(""); }}>
              <option value="">{t("selectClass")}</option>
              {visibleClasses?.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
            </select>
            <select className="rounded-md border px-3 py-2 text-sm" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">{t("selectSection")}</option>
              {selectedClass?.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {hasGroups && (
              <select
                className="rounded-md border-2 border-primary/40 px-3 py-2 text-sm font-medium"
                value={groupId}
                onChange={(e) => setGroupId(e.target.value)}
              >
                <option value="">Group: All Groups</option>
                {selectedClass!.groups!.map((g) => <option key={g.id} value={g.id}>Group: {g.name_en}</option>)}
              </select>
            )}
          </div>
          <Button
            disabled={!examId || !classId || !sectionId}
            onClick={() => router.push(`/marks/${examId}/${classId}/${sectionId}${groupId ? `?group_id=${groupId}` : ""}`)}
          >
            {t("openGrid")}
          </Button>
        </CardContent>
      </Card>
      {examsLoading ? (
        <div className="flex justify-center py-8"><LoadingSpinner /></div>
      ) : examsError ? (
        <ErrorState title="Failed to load exams" description={extractErrorMessage(examsErrorObj)} retryLabel="Retry" onRetry={() => refetchExams()} />
      ) : (
        !exams?.length && <p className="text-sm text-muted-foreground">{t("noExamsOpen")}</p>
      )}
    </PageWrapper>
  );
}
