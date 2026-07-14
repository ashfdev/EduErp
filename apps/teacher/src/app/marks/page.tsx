"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { TeacherShell } from "@/components/teacher-shell";
import { PageWrapper, PageHeader, Card, CardContent, Button, Label } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Option {
  id: string;
  name_en?: string;
  name?: string;
  sections?: { id: string; name: string }[];
}

export default function MarksPickerPage() {
  const router = useRouter();
  const t = useTranslations("marksPicker");
  const [examId, setExamId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");

  const { data: exams } = useQuery<Option[]>({ queryKey: ["exams"], queryFn: async () => (await api.get("/api/exams")).data.data });
  const { data: classes } = useQuery<Option[]>({ queryKey: ["settings", "classes"], queryFn: async () => (await api.get("/api/settings/classes")).data.data });
  const sections = classes?.find((c) => c.id === classId)?.sections ?? [];

  return (
    <TeacherShell>
      <PageWrapper className="p-0">
        <PageHeader title={t("title")} subtitle={t("subtitle")} />
        <Card>
          <CardContent className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{t("exam")}</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={examId} onChange={(e) => setExamId(e.target.value)}>
                <option value="">{t("select")}</option>
                {exams?.map((ex) => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("class")}</Label>
              <select className="w-full rounded-md border px-3 py-2 text-sm" value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(""); }}>
                <option value="">{t("select")}</option>
                {classes?.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
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
