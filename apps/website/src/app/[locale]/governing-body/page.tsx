"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useContent } from "@/hooks/use-content";
import type { GoverningBodyMember } from "@/lib/types";
import { ErrorState } from "@education-erp/ui";
import { Users } from "lucide-react";



export default function GoverningBodyPage() {
  const t = useTranslations("governingBody");
  const tCommon = useTranslations("common");
  const { data, error, refetch } = useContent<GoverningBodyMember[]>("/governing-body");
  const members = data ?? [];
  const groups = [...new Set(members.map((m) => m.group))];

  if (error) {
    return (
      <div className="min-h-[calc(100vh-80px)] flex items-center justify-center px-4">
        <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-50/50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-4 sm:px-6 lg:px-8 pt-10 pb-8">
        <div className="mx-auto max-w-5xl">
          <div className="flex items-center gap-3 mb-1">
            <div className="h-10 w-10 rounded-2xl bg-green-100 text-green-700 flex items-center justify-center">
              <Users className="h-5 w-5" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">{t("title")}</h1>
          </div>
          <p className="text-slate-500 text-sm ml-[52px]">The elected body responsible for the governance and strategic direction of the institution.</p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pt-10 space-y-12">
        {!members.length && (
          <div className="flex flex-col items-center py-20 text-center">
            <Users className="h-10 w-10 text-slate-300 mb-3" />
            <p className="text-slate-500">{t("noMembers")}</p>
          </div>
        )}

        {groups.map((group) => {
          const groupMembers = members.filter((m) => m.group === group);
          return (
            <section key={group}>
              {/* Group heading */}
              <div className="flex items-center gap-3 mb-6">
                <span className="h-px flex-1 bg-slate-200" />
                <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400 shrink-0">{group}</h2>
                <span className="h-px flex-1 bg-slate-200" />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-5">
                {groupMembers.map((m) => {
                  return (
                    <div
                      key={m.id}
                      className="group flex flex-col items-center text-center bg-white rounded-3xl border border-slate-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 p-5 gap-3"
                    >
                      {/* Avatar */}
                      <div className="relative h-20 w-20 rounded-full overflow-hidden bg-gradient-to-br from-green-100 to-slate-100 ring-2 ring-slate-200 shadow-sm shrink-0">
                        {m.photo_url ? (
                          <Image src={m.photo_url} alt={m.name} fill sizes="80px" className="object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-slate-400">
                            <Users className="h-8 w-8" />
                          </div>
                        )}
                      </div>

                      {/* Name */}
                      <p className="text-sm font-semibold text-slate-800 leading-snug">{m.name}</p>

                      {/* Designation */}
                      <p className="text-xs font-bold text-green-700 uppercase tracking-wide">
                        {m.designation}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
