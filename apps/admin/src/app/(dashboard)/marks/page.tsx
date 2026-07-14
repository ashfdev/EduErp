"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PageWrapper, PageHeader, Card, CardContent, Button } from "@education-erp/ui";
import { api } from "@/lib/api";

interface Exam {
  id: string;
  name: string;
  status: string;
}
interface ClassOption {
  id: string;
  name_en: string;
  sections: { id: string; name: string }[];
}

export default function MyMarkEntryPage() {
  const router = useRouter();
  const t = useTranslations("marks");
  const [examId, setExamId] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");

  const { data: exams } = useQuery<Exam[]>({
    queryKey: ["exams", "mark-entry-open"],
    queryFn: async () => (await api.get("/api/exams", { params: { status: "MARK_ENTRY" } })).data.data,
  });
  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });
  const selectedClass = classes?.find((c) => c.id === classId);

  return (
    <PageWrapper>
      <PageHeader title={t("title")} subtitle={t("subtitle")} breadcrumbs={[{ label: "Marks" }]} />
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid grid-cols-3 gap-4">
            <select className="rounded-md border px-3 py-2 text-sm" value={examId} onChange={(e) => setExamId(e.target.value)}>
              <option value="">{t("selectExam")}</option>
              {exams?.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
            <select className="rounded-md border px-3 py-2 text-sm" value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(""); }}>
              <option value="">{t("selectClass")}</option>
              {classes?.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
            </select>
            <select className="rounded-md border px-3 py-2 text-sm" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">{t("selectSection")}</option>
              {selectedClass?.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <Button disabled={!examId || !classId || !sectionId} onClick={() => router.push(`/marks/${examId}/${classId}/${sectionId}`)}>
            {t("openGrid")}
          </Button>
        </CardContent>
      </Card>
      {!exams?.length && <p className="text-sm text-muted-foreground">{t("noExamsOpen")}</p>}
    </PageWrapper>
  );
}
