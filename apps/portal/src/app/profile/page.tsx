"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { LanguageToggle } from "@/components/language-toggle";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, Button, LoadingSpinner } from "@education-erp/ui";

interface StudentDetail {
  student_uid: string; name_en: string; name_bn: string | null; phone: string | null;
  current_roll_no: string | null; registration_no: string | null;
  current_class: { name_en: string } | null; current_section: { name: string } | null;
  father_name: string | null; father_phone: string | null; mother_name: string | null; mother_phone: string | null;
}

function ProfileContent() {
  const router = useRouter();
  const { activeStudentId, logout } = useAuthStore();
  const t = useTranslations("profile");

  const { data, isLoading } = useQuery<StudentDetail>({
    queryKey: ["portal", "profile", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/profile`)).data.data,
    enabled: !!activeStudentId,
  });

  const logoutMutation = useMutation({
    mutationFn: () => Promise.resolve(),
    onSuccess: () => {
      logout();
      router.replace("/login");
    },
  });

  if (isLoading || !data) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <Card>
        <CardContent className="space-y-2 pt-6 text-sm">
          <p><span className="text-gray-500">{t("nameEn")}</span> {data.name_en}</p>
          <p><span className="text-gray-500">{t("nameBn")}</span> {data.name_bn ?? "—"}</p>
          <p><span className="text-gray-500">{t("studentId")}</span> {data.student_uid}</p>
          <p><span className="text-gray-500">{t("class")}</span> {data.current_class?.name_en} {data.current_section && `· ${data.current_section.name}`}</p>
          <p><span className="text-gray-500">{t("roll")}</span> {data.current_roll_no ?? "—"}</p>
          <p><span className="text-gray-500">{t("registrationNo")}</span> {data.registration_no ?? "—"}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-2 pt-6 text-sm">
          <p className="font-medium">{t("contact")}</p>
          <p><span className="text-gray-500">{t("phone")}</span> {data.phone ?? "—"}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="space-y-2 pt-6 text-sm">
          <p className="font-medium">{t("guardian")}</p>
          <p><span className="text-gray-500">{t("father")}</span> {data.father_name} ({data.father_phone})</p>
          <p><span className="text-gray-500">{t("mother")}</span> {data.mother_name ?? "—"} ({data.mother_phone ?? "—"})</p>
        </CardContent>
      </Card>
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{t("language")}</span>
        <LanguageToggle />
      </div>
      <Button variant="outline" className="w-full" onClick={() => logoutMutation.mutate()}>{t("signOut")}</Button>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <PortalShell>
      <ProfileContent />
    </PortalShell>
  );
}
