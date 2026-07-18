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
      <div className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-primary to-blue-500 p-8 text-white shadow-xl shadow-indigo-200">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 h-40 w-40 rounded-full bg-white/10 blur-3xl"></div>
        <div className="absolute bottom-0 left-10 -mb-10 h-32 w-32 rounded-full bg-blue-400/20 blur-2xl"></div>
        
        <div className="relative z-10 flex flex-col">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-1 text-indigo-100 font-medium opacity-90">
            {t("subtitle")}
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-100 bg-white p-6 sm:p-8 shadow-sm">
        <div className={`grid grid-cols-1 gap-6 ${isUniversity ? "sm:grid-cols-2 lg:grid-cols-5" : "sm:grid-cols-3"}`}>
          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-500 uppercase">{t("exam")}</Label>
            <select className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/50" value={examId} onChange={(e) => setExamId(e.target.value)}>
              <option value="">{t("select")}</option>
              {exams?.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
            </select>
          </div>
          {isUniversity && (
            <>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase">Department</Label>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  value={departmentId}
                  onChange={(e) => { setDepartmentId(e.target.value); setProgramId(""); setClassId(""); setSectionId(""); }}
                >
                  <option value="">All</option>
                  {departments?.map((d) => <option key={d.id} value={d.id}>{d.name_en}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-500 uppercase">Program</Label>
                <select
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/50"
                  value={programId}
                  onChange={(e) => { setProgramId(e.target.value); setClassId(""); setSectionId(""); }}
                >
                  <option value="">All</option>
                  {programsInDept?.map((p) => <option key={p.id} value={p.id}>{p.name_en}</option>)}
                </select>
              </div>
            </>
          )}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-500 uppercase">{t("class")}</Label>
            <select className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/50" value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(""); }}>
              <option value="">{t("select")}</option>
              {visibleClasses?.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-bold text-slate-500 uppercase">{t("section")}</Label>
            <select className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-50" value={sectionId} onChange={(e) => setSectionId(e.target.value)} disabled={!classId}>
              <option value="">{t("select")}</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
        
        <div className="mt-8 flex justify-end pt-4 border-t border-slate-100">
          <Button
            className="w-full sm:w-auto rounded-xl px-8 py-6 text-base font-bold shadow-md"
            disabled={!examId || !classId || !sectionId}
            onClick={() => router.push(`/marks/${examId}/${classId}/${sectionId}`)}
          >
            {t("openGrid")}
          </Button>
        </div>
      </div>
    </TeacherShell>
  );
}
