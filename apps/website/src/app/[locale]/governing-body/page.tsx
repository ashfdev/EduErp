"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useContent } from "@/hooks/use-content";
import type { GoverningBodyMember } from "@/lib/types";
import { ErrorState } from "@education-erp/ui";

export default function GoverningBodyPage() {
  const t = useTranslations("governingBody");
  const tCommon = useTranslations("common");
  const { data, error, refetch } = useContent<GoverningBodyMember[]>("/governing-body");
  const members = data ?? [];

  const groups = [...new Set(members.map((m) => m.group))];

  if (error) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10">
        <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={refetch} />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-4 text-2xl font-semibold">{t("title")}</h1>
      {!members.length && <p className="text-sm text-gray-500">{t("noMembers")}</p>}
      {groups.map((group) => (
        <div key={group} className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">{group}</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {members.filter((m) => m.group === group).map((m) => (
              <div key={m.id} className="rounded-lg border p-4 text-center">
                <div className="relative mx-auto mb-2 h-20 w-20 overflow-hidden rounded-full bg-gray-100">
                  {m.photo_url && <Image src={m.photo_url} alt={m.name} fill sizes="80px" className="object-cover" />}
                </div>
                <p className="text-sm font-medium">{m.name}</p>
                <p className="text-xs text-gray-500">{m.designation}</p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </main>
  );
}
