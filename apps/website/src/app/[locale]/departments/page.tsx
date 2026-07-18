"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { fetchContent } from "@/lib/content-api";
import type { DepartmentsResponse, ProgramSummary } from "@/lib/types";

const DEGREE_LEVELS = ["UNDERGRADUATE", "GRADUATE", "PHD"] as const;

function groupByDegreeLevel(programs: ProgramSummary[]): Partial<Record<(typeof DEGREE_LEVELS)[number], ProgramSummary[]>> {
  const grouped: Partial<Record<(typeof DEGREE_LEVELS)[number], ProgramSummary[]>> = {};
  for (const p of programs) {
    (grouped[p.degree_level] ??= []).push(p);
  }
  return grouped;
}

function ProgramCard({ program }: { program: ProgramSummary }) {
  const t = useTranslations("departments");
  const [expanded, setExpanded] = useState(false);

  const bySemester = new Map<number, typeof program.courses>();
  for (const c of program.courses) {
    if (!bySemester.has(c.semester_number)) bySemester.set(c.semester_number, []);
    bySemester.get(c.semester_number)!.push(c);
  }
  const semesters = [...bySemester.keys()].sort((a, b) => a - b);

  return (
    <div className="rounded-lg border p-4">
      <p className="font-medium">{program.name_en}</p>
      <p className="mt-1 font-mono text-xs text-gray-400">{program.code}</p>
      <p className="mt-2 text-sm text-gray-600">
        {t("duration", { count: program.duration_semesters })} · {t("creditHours", { count: program.total_credit_hours })}
      </p>
      {!!program.courses.length && (
        <>
          <button
            onClick={() => setExpanded((e) => !e)}
            className="mt-3 text-sm font-medium text-[var(--primary)] hover:underline"
          >
            {expanded ? t("hideCurriculum") : t("viewCurriculum")} {expanded ? "▴" : "▾"}
          </button>
          {expanded && (
            <div className="mt-3 space-y-3 border-t pt-3">
              {semesters.map((sem) => (
                <div key={sem}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                    {t("semester", { number: sem })}
                  </p>
                  <ul className="space-y-1 text-sm text-gray-700">
                    {bySemester.get(sem)!.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-2">
                        <span>
                          <span className="font-mono text-xs text-gray-400">{c.code}</span> {c.name_en}
                        </span>
                        <span className="shrink-0 text-xs text-gray-500">{t("creditHours", { count: c.credit_hours })}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DegreeLevelGroups({ programs }: { programs: ProgramSummary[] }) {
  const t = useTranslations("departments");
  const grouped = groupByDegreeLevel(programs);
  const labels: Record<(typeof DEGREE_LEVELS)[number], string> = {
    UNDERGRADUATE: t("undergraduate"),
    GRADUATE: t("graduate"),
    PHD: t("phd"),
  };

  return (
    <div className="space-y-6">
      {DEGREE_LEVELS.filter((lvl) => grouped[lvl]?.length).map((lvl) => (
        <div key={lvl}>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{labels[lvl]}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {grouped[lvl]!.map((p) => (
              <ProgramCard key={p.id} program={p} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DepartmentsPage() {
  const t = useTranslations("departments");
  const [data, setData] = useState<DepartmentsResponse | null>(null);

  useEffect(() => {
    fetchContent<DepartmentsResponse>("/departments").then(setData);
  }, []);

  const departments = data?.departments ?? [];
  const unassigned = data?.unassigned_programs ?? [];
  const isEmpty = !departments.length && !unassigned.length;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <h1 className="mb-2 text-2xl font-semibold">{t("title")}</h1>
      <p className="mb-6 text-sm text-gray-500">{t("subtitle")}</p>

      {isEmpty && <p className="text-sm text-gray-500">{t("noDepartments")}</p>}

      <div className="space-y-8">
        {departments.map((d) => (
          <section key={d.id}>
            <h2 className="mb-3 text-lg font-semibold" style={{ color: "var(--primary)" }}>{d.name_en}</h2>
            {!d.programs.length && <p className="text-sm text-gray-500">{t("noPrograms")}</p>}
            <DegreeLevelGroups programs={d.programs} />
          </section>
        ))}

        {!!unassigned.length && (
          <section>
            <h2 className="mb-3 text-lg font-semibold" style={{ color: "var(--primary)" }}>{t("otherPrograms")}</h2>
            <DegreeLevelGroups programs={unassigned} />
          </section>
        )}
      </div>
    </main>
  );
}
