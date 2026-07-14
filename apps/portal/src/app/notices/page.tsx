"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, LoadingSpinner } from "@education-erp/ui";

interface Notice {
  id: string;
  title: string;
  is_pinned: boolean;
  attachment_url: string | null;
  created_at: string;
}

function NoticesContent() {
  const { activeStudentId } = useAuthStore();
  const t = useTranslations("notices");
  const { data, isLoading } = useQuery<Notice[]>({
    queryKey: ["portal", "notices", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/notices`)).data.data,
    enabled: !!activeStudentId,
  });

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;

  return (
    <div className="space-y-3 p-4">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      {!data?.length && <p className="text-sm text-gray-500">{t("noNotices")}</p>}
      {data?.map((n) => (
        <Link key={n.id} href={`/notices/${n.id}`}>
          <Card>
            <CardContent className="flex items-center justify-between pt-6 text-sm">
              <span>{n.is_pinned && "📌 "}{n.title}</span>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                {n.attachment_url && <span>📎</span>}
                {new Date(n.created_at).toLocaleDateString()}
              </div>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}

export default function NoticesPage() {
  return (
    <PortalShell>
      <NoticesContent />
    </PortalShell>
  );
}
