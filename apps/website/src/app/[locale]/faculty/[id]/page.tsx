"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { fetchContent } from "@/lib/content-api";
import type { FacultyDetail } from "@/lib/types";

export default function FacultyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations("faculty");
  const [member, setMember] = useState<FacultyDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setNotFound(false);
    fetchContent<FacultyDetail>(`/faculty/${id}`).then((d) => {
      if (!d) setNotFound(true);
      setMember(d);
    });
  }, [id]);

  if (notFound) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-sm text-gray-500">{t("notFound")}</p>
        <Link href="/faculty" className="mt-4 inline-block text-sm text-[var(--primary)] hover:underline">
          {t("backToFaculty")}
        </Link>
      </main>
    );
  }

  if (!member) {
    return <main className="mx-auto max-w-3xl px-4 py-10 text-sm text-gray-500">{t("loading")}</main>;
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/faculty" className="mb-6 inline-block text-sm text-[var(--primary)] hover:underline">
        ← {t("backToFaculty")}
      </Link>
      <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
        <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-full bg-gray-100">
          {member.photo_url && <Image src={member.photo_url} alt={member.name_en} fill sizes="128px" className="object-cover" />}
        </div>
        <div>
          <h1 className="text-2xl font-semibold">{member.name_en}</h1>
          <p className="mt-1 text-gray-600">{member.designation}</p>
          {member.department && <p className="text-sm text-gray-500">{member.department.name_en}</p>}
        </div>
      </div>

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
