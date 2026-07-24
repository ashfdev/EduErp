"use client";

import Image from "next/image";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { useContent } from "@/hooks/use-content";
import type { FacultyDetail } from "@/lib/types";
import { ErrorState } from "@education-erp/ui";
import { ArrowLeft, Mail, MapPin, BookOpen, Award, FileText, ExternalLink, GraduationCap } from "lucide-react";

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
      <div className="min-h-[calc(100vh-80px)] flex items-center justify-center">
        <div className="text-center">
          <p className="text-slate-500 mb-4">{t("notFound")}</p>
          <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-bold text-green-700 hover:underline">
            <ArrowLeft className="h-4 w-4" /> {backLabel}
          </Link>
        </div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="min-h-[calc(100vh-80px)] flex items-center justify-center">
        <div className="h-10 w-10 rounded-full border-4 border-green-200 border-t-green-700 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-50/50 pb-20">
      {/* Hero Section */}
      <div className="bg-slate-900 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5">
          <GraduationCap className="absolute -top-10 -right-10 h-80 w-80" />
        </div>
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-8 pb-10 relative z-10">
          {/* Back button */}
          <Link href={backHref} className="inline-flex items-center gap-2 text-slate-400 hover:text-white text-sm font-medium transition-colors mb-8">
            <ArrowLeft className="h-4 w-4" /> {backLabel}
          </Link>

          <div className="flex flex-col sm:flex-row items-center sm:items-end gap-6">
            {/* Avatar */}
            <div className="relative h-32 w-32 sm:h-40 sm:w-40 shrink-0 rounded-3xl overflow-hidden ring-4 ring-white/20 shadow-2xl bg-gradient-to-br from-green-700 to-green-900">
              {member.photo_url ? (
                <Image src={member.photo_url} alt={member.name_en} fill sizes="160px" className="object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center">
                  <span className="text-5xl font-extrabold text-white/80">{member.name_en.charAt(0)}</span>
                </div>
              )}
            </div>

            {/* Name & Title */}
            <div className="text-center sm:text-left pb-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">{member.name_en}</h1>
              <p className="text-green-400 font-semibold text-base mb-2">{member.designation}</p>
              {(member.department || member.program) && (
                <p className="text-slate-400 text-sm">
                  {member.department?.name_en}
                  {member.department && member.program && " · "}
                  {member.program?.name_en}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Contact Bar */}
      {(member.public_contact_email || member.public_office_location) && (
        <div className="bg-white border-b border-slate-100">
          <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-4 flex flex-wrap gap-6">
            {member.public_contact_email && (
              <a href={`mailto:${member.public_contact_email}`} className="flex items-center gap-2 text-sm text-slate-600 hover:text-green-700 transition-colors">
                <Mail className="h-4 w-4 text-green-700" />
                {member.public_contact_email}
              </a>
            )}
            {member.public_office_location && (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <MapPin className="h-4 w-4 text-green-700" />
                {member.public_office_location}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-10 space-y-8">

        {/* Subjects Taught */}
        {!!member.subjects_taught?.length && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center">
                <BookOpen className="h-5 w-5 text-blue-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">{t("subjectsTaught")}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {member.subjects_taught.map((s) => (
                <span key={s} className="px-3.5 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-sm font-semibold text-blue-700">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Qualifications */}
        {member.qualifications && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-9 w-9 rounded-xl bg-green-50 flex items-center justify-center">
                <GraduationCap className="h-5 w-5 text-green-700" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">{t("qualifications")}</h2>
            </div>
            <p className="whitespace-pre-line text-slate-600 leading-relaxed">{member.qualifications}</p>
          </div>
        )}

        {/* Achievements */}
        {member.achievements && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-9 w-9 rounded-xl bg-amber-50 flex items-center justify-center">
                <Award className="h-5 w-5 text-amber-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">{t("achievements")}</h2>
            </div>
            <p className="whitespace-pre-line text-slate-600 leading-relaxed">{member.achievements}</p>
          </div>
        )}

        {/* Publications */}
        {!!member.publications?.length && (
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-9 w-9 rounded-xl bg-purple-50 flex items-center justify-center">
                <FileText className="h-5 w-5 text-purple-600" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">{t("publications")}</h2>
            </div>
            <ul className="space-y-3">
              {member.publications.map((p, i) => (
                <li key={i}>
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-start gap-3 group p-3 rounded-2xl hover:bg-slate-50 transition-colors"
                  >
                    <ExternalLink className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                    <span className="text-sm text-slate-700 group-hover:text-green-700 font-medium transition-colors">{p.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

      </div>
    </div>
  );
}
