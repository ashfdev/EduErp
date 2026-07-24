"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { fetchContent } from "@/lib/content-api";
import type { FacultyProfile, DepartmentOption } from "@/lib/types";
import { ErrorState } from "@education-erp/ui";
import { Search, Users, ChevronRight, Building2 } from "lucide-react";

interface DirectoryListProps {
  category: "FACULTY" | "STAFF";
  title: string;
  subtitle: string;
}

export function DirectoryList({ category, title, subtitle }: DirectoryListProps) {
  const t = useTranslations("faculty");
  const tCommon = useTranslations("common");
  const [people, setPeople] = useState<FacultyProfile[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [search, setSearch] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    fetchContent<DepartmentOption[]>("/department-options").then((d) => setDepartments(d ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    setError(false);
    const timeout = setTimeout(() => {
      fetchContent<FacultyProfile[]>("/faculty", {
        category,
        ...(search && { search }),
        ...(departmentId && { department_id: departmentId }),
      })
        .then((d) => setPeople(d ?? []))
        .catch(() => setError(true));
    }, 250);
    return () => clearTimeout(timeout);
  }, [category, search, departmentId, reloadKey]);

  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-50/50 pb-20">
      {/* Hero Header */}
      <div className="bg-white border-b border-slate-100 px-4 sm:px-6 lg:px-8 pt-10 pb-8">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-green-100 text-green-700">
              <Users className="h-5 w-5" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">{title}</h1>
          </div>
          <p className="text-slate-500 text-sm ml-[52px]">{subtitle}</p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-8">
        {/* Search + Department Filters */}
        <div className="mb-8 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm shadow-sm focus:border-green-600 focus:ring-4 focus:ring-green-600/10 outline-none transition-all"
            />
          </div>

          {departments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setDepartmentId("")}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border ${!departmentId ? "bg-green-700 text-white border-green-700" : "bg-white text-slate-600 border-slate-200 hover:border-green-300 hover:text-green-700"}`}
              >
                {t("allDepartments")}
              </button>
              {departments.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDepartmentId(d.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all border ${departmentId === d.id ? "bg-green-700 text-white border-green-700" : "bg-white text-slate-600 border-slate-200 hover:border-green-300 hover:text-green-700"}`}
                >
                  {d.name_en}
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={() => setReloadKey((k) => k + 1)} />
        )}

        {!error && !people.length && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="h-16 w-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
              <Users className="h-8 w-8 text-slate-400" />
            </div>
            <p className="text-slate-500 font-medium">{t("noResults")}</p>
          </div>
        )}

        {!error && !!people.length && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {people.map((p) => (
              <Link
                key={p.id}
                href={category === "STAFF" ? `/faculty/${p.id}?from=staff` : `/faculty/${p.id}`}
                className="group bg-white rounded-3xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col"
              >
                {/* Avatar Area */}
                <div className="relative h-48 bg-gradient-to-br from-green-50 to-slate-100 flex items-center justify-center overflow-hidden">
                  {p.photo_url ? (
                    <Image src={p.photo_url} alt={p.name_en} fill sizes="300px" className="object-cover" />
                  ) : (
                    <div className="h-24 w-24 rounded-full bg-white/80 backdrop-blur-sm flex items-center justify-center ring-4 ring-white shadow-sm">
                      <span className="text-3xl font-extrabold text-green-700 select-none">
                        {p.name_en.charAt(0)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Info Area */}
                <div className="flex flex-col flex-1 p-5">
                  <h3 className="font-bold text-slate-900 text-base leading-snug mb-1 group-hover:text-green-700 transition-colors">
                    {p.name_en}
                  </h3>
                  <p className="text-sm text-slate-500 mb-3 line-clamp-2">{p.designation}</p>

                  {p.department?.name_en && (
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-auto">
                      <Building2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{p.department.name_en}</span>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="border-t border-slate-100 px-5 py-3 flex items-center justify-between bg-slate-50/50">
                  <span className="text-xs font-bold text-green-700">{t("view")} Profile</span>
                  <ChevronRight className="h-4 w-4 text-green-700 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
