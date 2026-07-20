"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { useContent } from "@/hooks/use-content";
import type { JobPosting } from "@/lib/types";
import { ErrorState } from "@education-erp/ui";

export default function CareersPage() {
  const t = useTranslations("careers");
  const tCommon = useTranslations("common");
  const { data, error, refetch } = useContent<JobPosting[]>("/jobs");
  const jobs = data ?? [];

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={refetch} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 text-sm text-gray-600">{t("subtitle")}</p>

      {!jobs.length && <p className="text-sm text-gray-500">{t("noOpenings")}</p>}

      <div className="space-y-3">
        {jobs.map((job) => (
          <Link key={job.id} href={`/careers/${job.id}`} className="block rounded-lg border p-4 hover:border-gray-400">
            <p className="font-medium">{job.title}</p>
            <p className="text-xs text-gray-500">
              {job.department ?? t("generalDepartment")}
              {job.deadline && ` · ${t("applyBy", { date: new Date(job.deadline).toLocaleDateString() })}`}
            </p>
            <p className="mt-1 line-clamp-2 text-sm text-gray-600">{job.description}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
