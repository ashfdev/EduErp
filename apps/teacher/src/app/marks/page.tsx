"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { TeacherShell } from "@/components/teacher-shell";
import { PageWrapper, PageHeader, Card, CardContent, Button, Label } from "@education-erp/ui";
import { api } from "@/lib/api";
import { useInstitution } from "@/hooks/use-institution";

interface Option {
  id: string;
  name_en?: string;
  name?: string;
  department_id?: string | null;
  program_id?: string | null;
  sections?: { id: string; name: string }[];
}

export default function MarksPickerPage() {
  const router = useRouter();
  const t = useTranslations("marksPicker");
  const { type } = useInstitution();
  const isUniversity = type === "UNIVERSITY";

  const [examId, setExamId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [programId, setProgramId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");

  const { data: exams } = useQuery<Option[]>({ queryKey: ["exams"], queryFn: async () => (await api.get("/api/exams")).data.data });
  const { data: classes } = useQuery<Option[]>({ queryKey: ["settings", "classes"], queryFn: async () => (await api.get("/api/settings/classes")).data.data });
  const { data: departments } = useQuery<Option[]>({
    queryKey: ["settings", "departments"],
    queryFn: async () => (await api.get("/api/settings/departments")).data.data,
    enabled: isUniversity,
  });
  const { data: programs } = useQuery<Option[]>({
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
  const sections = classes?.find((c) => c.id === classId)?.sections ?? [];

  return (
    <TeacherShell>
      <PageWrapper className="p-0">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <Card>
          <CardContent className={`grid grid-cols-1 gap-4 pt-6 ${isUniversity ? "sm:grid-cols-5" : "sm:grid-cols-3"}`}>
            <div className="space-y-1.5">
              <Label>{t("exam")}</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={examId} onChange={(e) => setExamId(e.target.value)}>
                <option value="">{t("select")}</option>
                {exams?.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
              </select>
            </div>
            {isUniversity && (
              <>
                <div className="space-y-1.5">
                  <Label>Department</Label>
                  <select
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    value={departmentId}
                    onChange={(e) => { setDepartmentId(e.target.value); setProgramId(""); setClassId(""); setSectionId(""); }}
                  >
                    <option value="">All</option>
                    {departments?.map((d) => <option key={d.id} value={d.id}>{d.name_en}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Program</Label>
                  <select
                    className="w-full rounded-md border px-3 py-2 text-sm"
                    value={programId}
                    onChange={(e) => { setProgramId(e.target.value); setClassId(""); setSectionId(""); }}
                  >
                    <option value="">All</option>
                    {programsInDept?.map((p) => <option key={p.id} value={p.id}>{p.name_en}</option>)}
                  </select>
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label>{t("class")}</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(""); }}>
                <option value="">{t("select")}</option>
                {visibleClasses?.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("section")}</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!classId}>
                <option value="">{t("select")}</option>
                {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </CardContent>
        </Card>
        <Button
          className="w-fit"
          disabled={!examId || !classId || !sectionId}
          onClick={() => router.push(`/marks/${examId}/${classId}/${sectionId}`)}
        >
          {t("openGrid")}
        </Button>
      </PageWrapper>
    </TeacherShell>
  );
}
