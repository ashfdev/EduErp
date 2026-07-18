"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, LoadingSpinner } from "@education-erp/ui";

import { BellRing, Pin, Paperclip, ChevronRight, Inbox } from "lucide-react";

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
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-blue-100 p-2.5 text-blue-600">
          <BellRing className="h-6 w-6" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{t("title")}</h1>
      </div>

      {!data?.length && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="rounded-full bg-slate-100 p-6 text-slate-400 mb-4">
            <Inbox className="h-12 w-12" />
          </div>
          <p className="text-lg font-medium text-slate-600">{t("noNotices")}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {data?.map((n) => (
          <Link key={n.id} href={`/notices/${n.id}`} className="group block h-full">
            <Card className={`h-full transition-all duration-200 hover:shadow-md hover:border-blue-200 ${n.is_pinned ? 'border-amber-200 bg-amber-50/30' : ''}`}>
              <CardContent className="p-5 flex flex-col h-full justify-between gap-4">
                <div className="flex items-start gap-3">
                  {n.is_pinned ? (
                    <div className="shrink-0 rounded-full bg-amber-100 p-2 text-amber-600">
                      <Pin className="h-4 w-4" />
                    </div>
                  ) : (
                    <div className="shrink-0 rounded-full bg-blue-50 p-2 text-blue-500">
                      <BellRing className="h-4 w-4" />
                    </div>
                  )}
                  <p className="font-semibold text-slate-800 leading-snug group-hover:text-blue-600 transition-colors line-clamp-2">
                    {n.title}
                  </p>
                </div>
                
                <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
                    <span>{new Date(n.created_at).toLocaleDateString()}</span>
                    {n.attachment_url && (
                      <span className="flex items-center gap-1 text-slate-400">
                        <Paperclip className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
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
