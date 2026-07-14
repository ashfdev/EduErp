"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PortalShell } from "@/components/portal-shell";
import { useAuthStore } from "@/stores/auth-store";
import { api } from "@/lib/api";
import { Card, CardContent, Button, LoadingSpinner } from "@education-erp/ui";

interface HomeworkItem {
  id: string;
  title: string;
  description: string;
  due_date: string;
  attachment_url: string | null;
  subject: { name_en: string };
}

const TAB_KEY: Record<"pending" | "submitted" | "all", "tabPending" | "tabSubmitted" | "tabAll"> = {
  pending: "tabPending",
  submitted: "tabSubmitted",
  all: "tabAll",
};

function HomeworkContent() {
  const { activeStudentId } = useAuthStore();
  const t = useTranslations("homework");
  const [tab, setTab] = useState<"pending" | "submitted" | "all">("pending");
  const [done, setDone] = useState<string[]>([]);

  const { data, isLoading } = useQuery<HomeworkItem[]>({
    queryKey: ["portal", "homework", activeStudentId],
    queryFn: async () => (await api.get(`/api/portal/student/${activeStudentId}/homework`)).data.data,
    enabled: !!activeStudentId,
  });

  if (isLoading) return <div className="flex min-h-[50vh] items-center justify-center"><LoadingSpinner /></div>;

  const now = new Date();
  const filtered = (data ?? []).filter((h) => {
    if (tab === "all") return true;
    const isDone = done.includes(h.id);
    if (tab === "submitted") return isDone;
    return !isDone && new Date(h.due_date) >= now;
  });

  return (
    <div className="space-y-3 p-4">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <div className="flex gap-2 text-sm">
        {(["pending", "submitted", "all"] as const).map((tabKey) => (
          <button key={tabKey} onClick={() => setTab(tabKey)} className={`rounded-full px-3 py-1 capitalize ${tab === tabKey ? "bg-[var(--primary,#1a3c4a)] text-white" : "bg-gray-100"}`}>
            {t(TAB_KEY[tabKey])}
          </button>
        ))}
      </div>

      {!filtered.length && <p className="text-sm text-gray-500">{t("noHomework")}</p>}
      {filtered.map((h) => (
        <Card key={h.id}>
          <CardContent className="space-y-2 pt-6">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span className="rounded-full bg-gray-100 px-2 py-0.5">{h.subject.name_en}</span>
              <span>{t("due", { date: new Date(h.due_date).toLocaleDateString() })}</span>
            </div>
            <p className="font-medium">{h.title}</p>
            <p className="text-sm text-gray-600">{h.description}</p>
            {h.attachment_url && <a href={h.attachment_url} target="_blank" rel="noreferrer" className="text-xs text-[var(--primary,#1a3c4a)]">{t("viewAttachment")}</a>}
            {!done.includes(h.id) && (
              <Button size="sm" variant="outline" onClick={() => setDone((prev) => [...prev, h.id])}>{t("markDone")}</Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export default function HomeworkPage() {
  return (
    <PortalShell>
      <HomeworkContent />
    </PortalShell>
  );
}
