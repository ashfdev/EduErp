"use client";

import Image from "next/image";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { useContent } from "@/hooks/use-content";
import type { FacultyDetail } from "@/lib/types";
import { ErrorState } from "@education-erp/ui";

export default function FacultyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const fromStaff = searchParams.get("from") === "staff";
  const t = useTranslations("faculty");
  const tCommon = useTranslations("common");
  const { data: member, error, notFound, refetch } = useContent<FacultyDetail>(`/faculty/${id}`);

  const backHref = fromStaff ? "/staff" : "/faculty";
  const backLabel = fromStaff ? t("backToStaff") : t("backToFaculty");

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={refetch} />
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm text-gray-500">{t("notFound")}</p>
        <Link href={backHref} className="mt-4 inline-block text-sm text-[var(--primary)] hover:underline">
          {backLabel}
        </Link>
      </main>
    );
  }

  if (!member) {
    return <main className="mx-auto max-w-3xl px-4 py-10 text-sm text-gray-500">{t("loading")}</main>;
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href={backHref} className="mb-6 inline-block text-sm text-[var(--primary)] hover:underline">
        ← {backLabel}
      </Link>
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
        <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-full bg-gray-100">
          {member.photo_url && <Image src={member.photo_url} alt={member.name_en} fill sizes="128px" className="object-cover" />}
        </div>
        <div>
          <h1 className="text-2xl font-semibold">{member.name_en}</h1>
          <p className="mt-1 text-gray-600">{member.designation}</p>
          {(member.department || member.program) && (
            <p className="text-sm text-gray-500">
              {member.department?.name_en}
              {member.department && member.program && " · "}
              {member.program?.name_en}
            </p>
          )}
          {(member.public_contact_email || member.public_office_location) && (
            <p className="mt-2 text-sm text-gray-600">
              {member.public_contact_email && <span>{member.public_contact_email}</span>}
              {member.public_contact_email && member.public_office_location && " · "}
              {member.public_office_location && <span>{member.public_office_location}</span>}
            </p>
          )}
        </div>
      </div>

      {!!member.subjects_taught?.length && (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-semibold">{t("subjectsTaught")}</h2>
          <ul className="flex flex-wrap gap-2">
            {member.subjects_taught.map((s) => (
              <li key={s} className="rounded-full border px-3 py-1 text-sm text-gray-700">{s}</li>
            ))}
          </ul>
        </section>
      )}

      {member.qualifications && (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-semibold">{t("qualifications")}</h2>
          <p className="whitespace-pre-line text-gray-700">{member.qualifications}</p>
        </section>
      )}

      {member.achievements && (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-semibold">{t("achievements")}</h2>
          <p className="whitespace-pre-line text-gray-700">{member.achievements}</p>
        </section>
      )}

      {!!member.publications?.length && (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-semibold">{t("publications")}</h2>
          <ul className="space-y-2">
            {member.publications.map((p, i) => (
              <li key={i}>
                <a href={p.url} target="_blank" rel="noreferrer" className="text-[var(--primary)] hover:underline">
                  {p.title} ↗
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
