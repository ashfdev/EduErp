"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { API_URL } from "@/lib/content-api";
import { useContent } from "@/hooks/use-content";
import type { JobPosting } from "@/lib/types";
import { ErrorState } from "@education-erp/ui";

export default function JobDetailPage() {
  const { job_id } = useParams<{ job_id: string }>();
  const t = useTranslations("careers");
  const tCommon = useTranslations("common");
  const { data: jobs, loading: jobsLoading, error: jobsError, refetch } = useContent<JobPosting[]>("/jobs");
  const job = jobs?.find((j) => j.id === job_id) ?? null;
  const jobsLoaded = !jobsLoading;

  const [applicantName, setApplicantName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [coverNote, setCoverNote] = useState("");
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!cvFile) {
      setError(t("cvRequired"));
      return;
    }

    setUploading(true);
    let blobKey: string;
    try {
      const form = new FormData();
      form.append("file", cvFile);
      const res = await fetch(`${API_URL}/api/hr/jobs/upload-cv`, { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error?.message ?? t("cvUploadFailed"));
        return;
      }
      blobKey = body.data.blob_key;
    } catch {
      setError(t("networkError"));
      return;
    } finally {
      setUploading(false);
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/hr/jobs/${job_id}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicant_name: applicantName,
          phone,
          email: email || undefined,
          cv_blob_key: blobKey,
          cover_note: coverNote || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error?.message ?? t("applicationFailed"));
        return;
      }
      setSubmitted(true);
    } catch {
      setError(t("networkError"));
    } finally {
      setSubmitting(false);
    }
  }

  if (jobsError) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={refetch} />
      </main>
    );
  }

  if (jobsLoaded && !job) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <p className="text-sm text-gray-600">{t("notFound")}</p>
      </main>
    );
  }

  if (submitted) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="mb-2 text-2xl font-semibold">{t("submitted")}</h1>
        <p className="text-sm text-gray-600">{t("thankYou", { jobSuffix: job ? ` for ${job.title}` : "" })}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      {job && (
        <>
          <h1 className="mb-1 text-2xl font-semibold">{job.title}</h1>
          <p className="mb-4 text-sm text-gray-500">
            {job.department ?? t("generalDepartment")}
            {job.deadline && ` · ${t("applyBy", { date: new Date(job.deadline).toLocaleDateString() })}`}
          </p>
          <p className="mb-2 whitespace-pre-line text-sm text-gray-700">{job.description}</p>
          {job.requirements && (
            <>
              <p className="mt-4 mb-1 font-medium">{t("requirements")}</p>
              <p className="whitespace-pre-line text-sm text-gray-700">{job.requirements}</p>
            </>
          )}
        </>
      )}

      <form onSubmit={handleSubmit} className="mt-8 space-y-3 border-t pt-6">
        <h2 className="text-lg font-semibold">{t("applyForPosition")}</h2>
        <input required placeholder={t("fullName")} value={applicantName} onChange={(e) => setApplicantName(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
        <input required placeholder={t("phonePlaceholder")} value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
        <input type="email" placeholder={t("emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} className="w-full rounded-md border px-3 py-2 text-sm" />
        <textarea placeholder={t("coverNotePlaceholder")} value={coverNote} onChange={(e) => setCoverNote(e.target.value)} rows={4} className="w-full rounded-md border px-3 py-2 text-sm" />
        <div className="space-y-1">
          <label className="text-sm text-gray-700">{t("cvLabel")}</label>
          <input required type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setCvFile(e.target.files?.[0] ?? null)} className="block w-full text-sm" />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={uploading || submitting}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 disabled:opacity-50"
        >
          {uploading ? t("uploadingCv") : submitting ? t("submitting") : t("submitApplication")}
        </button>
      </form>
    </main>
  );
}
