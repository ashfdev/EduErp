"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { fetchContent } from "@/lib/content-api";
import type { FacultyProfile, DepartmentOption } from "@/lib/types";
import { ErrorState } from "@education-erp/ui";

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
    // Secondary (department filter dropdown) — degrades to an empty
    // dropdown rather than blocking the directory itself.
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
    <main className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold">{title}</h1>
      <p className="mb-6 text-sm text-gray-500">{subtitle}</p>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="w-full rounded-md border px-3 py-2 text-sm sm:max-w-sm"
        />
        <select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          className="rounded-md border px-3 py-2 text-sm"
        >
          <option value="">{t("allDepartments")}</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>{d.name_en}</option>
          ))}
        </select>
      </div>

      {error && (
        <ErrorState title={tCommon("loadError")} description={tCommon("loadErrorDetail")} retryLabel={tCommon("retry")} onRetry={() => setReloadKey((k) => k + 1)} />
      )}
      {!error && !people.length && <p className="text-sm text-gray-500">{t("noResults")}</p>}
      {!error && !!people.length && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-gray-500">
                <th className="p-3"></th>
                <th className="p-3">{t("colName")}</th>
                <th className="p-3">{t("colDesignation")}</th>
                <th className="p-3">{t("colDepartment")}</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="p-3">
                    <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-gray-100">
                      {p.photo_url && <Image src={p.photo_url} alt={p.name_en} fill sizes="40px" className="object-cover" />}
                    </div>
                  </td>
                  <td className="p-3 font-medium">{p.name_en}</td>
                  <td className="p-3 text-gray-600">{p.designation}</td>
                  <td className="p-3 text-gray-600">{p.department?.name_en ?? "-"}</td>
                  <td className="p-3 text-right">
                    <Link
                      href={category === "STAFF" ? `/faculty/${p.id}?from=staff` : `/faculty/${p.id}`}
                      className="inline-block rounded-md border px-3 py-1.5 text-sm font-medium text-[var(--primary)] hover:bg-[var(--primary)] hover:text-white transition-colors"
                    >
                      {t("view")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
