"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { useInstitution } from "@/hooks/use-institution";
import { api } from "@/lib/api";
import { Card, CardContent, LoadingSpinner, EmptyState } from "@education-erp/ui";

interface SubjectRow {
  subject: { id: string; name_en: string; code: string };
  is_inherited: boolean;
  teacher: { name_en: string; designation: string } | null;
}

function SubjectsContent() {
  const { activeStudentId } = useAuthStore();
  const { terms } = useInstitution();
  const t = useTranslations("subjects");
  const { data, isLoading } = useQuery<SubjectRow[]>({
    queryKey: ["portal", "subjects", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/subjects`)).data.data,
    enabled: !!activeStudentId,
  });

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="space-y-3 p-4">
      <h1 className="text-lg font-semibold">{t("title", { className: terms.term_class })}</h1>
      {!data?.length && <EmptyState title={t("noSubjects")} />}
      {data?.map((row) => (
        <Card key={row.subject.id}>
          <CardContent className="flex items-center justify-between pt-6">
            <div>
              <p className="font-medium">{row.subject.name_en}</p>
              <p className="text-xs text-gray-500">
                {row.subject.code} {row.is_inherited ? t("compulsory") : t("elective")}
              </p>
            </div>
            <div className="text-right text-xs text-gray-500">
              {row.teacher ? (
                <>
                  <p className="font-medium text-gray-700">{row.teacher.name_en}</p>
                  <p>{row.teacher.designation}</p>
                </>
              ) : (
                <p>{t("teacherNotAssigned", { teacherTerm: terms.term_teacher })}</p>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function SubjectsPage() {
  return (
    <PortalShell>
      <SubjectsContent />
    </PortalShell>
  );
}
