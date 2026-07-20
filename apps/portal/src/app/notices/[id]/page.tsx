"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, LoadingSpinner, ErrorState } from "@education-erp/ui";

interface Notice {
  id: string;
  title: string;
  body: string;
  attachment_url: string | null;
  publish_at: string | null;
  created_at: string;
}

function NoticeDetailContent() {
  const { id } = useParams<{ id: string }>();
  const { activeStudentId } = useAuthStore();
  const t = useTranslations("notices");
  const tCommon = useTranslations("common");

  const { data, isLoading, isError, refetch } = useQuery<Notice[]>({
    queryKey: ["portal", "notices", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/notices`)).data.data,
    enabled: !!activeStudentId,
    retry: 1,
  });

  const notice = data?.find((n) => n.id === id);

  if (isError) {
    return (
      <div className="min-h-[50vh]">
        <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={() => refetch()} />
      </div>
    );
  }

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;
  if (!notice) return <p className="p-4 text-sm text-gray-500">{tCommon("noticeNotFound")}</p>;

  return (
    <div className="space-y-3 p-4">
      <h1 className="text-lg font-semibold">{notice.title}</h1>
      <p className="text-xs text-gray-400">{new Date(notice.publish_at ?? notice.created_at).toLocaleDateString()}</p>
      <Card>
        <CardContent className="pt-6">
          <div className="prose text-sm" dangerouslySetInnerHTML={{ __html: notice.body }} />
          {notice.attachment_url && (
            <a href={notice.attachment_url} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded-md border px-3 py-1.5 text-sm">
              {t("downloadAttachment")}
            </a>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function NoticeDetailPage() {
  return (
    <PortalShell>
      <NoticeDetailContent />
    </PortalShell>
  );
}
