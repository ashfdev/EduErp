"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, StatusBadge, EmptyState, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@education-erp/ui";
import { api } from "@/lib/api";
import { useInstitution } from "@/hooks/use-institution";

interface StudentRow {
  id: string;
  student_uid: string;
  name_en: string;
  name_bn?: string | null;
  photo_url?: string | null;
  current_roll_no?: string | null;
  status: string;
  current_class?: { name_en: string } | null;
  current_section?: { name: string } | null;
  group?: { name_en: string } | null;
  guardian?: { phone: string } | null;
}

interface ClassOption {
  id: string;
  name_en: string;
  sections?: { id: string; name: string }[];
  groups?: { id: string; name_en: string }[];
}
interface ProgramOption {
  id: string;
  name_en: string;
}
interface DepartmentOption {
  id: string;
  name_en: string;
}

export default function StudentsPage() {
  const t = useTranslations("students");
  const { type, terms } = useInstitution();
  const isUniversity = type === "UNIVERSITY";

  const [search, setSearch] = useState("");
  const [classId, setClassId] = useState<string>("");
  const [sectionId, setSectionId] = useState<string>("");
  const [groupId, setGroupId] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [gender, setGender] = useState<string>("");
  const [programId, setProgramId] = useState<string>("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [page, setPage] = useState(1);

  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });
  const { data: programs } = useQuery<ProgramOption[]>({
    queryKey: ["settings", "programs"],
    queryFn: async () => (await api.get("/api/settings/programs")).data.data,
    enabled: isUniversity,
  });
  const { data: departments } = useQuery<DepartmentOption[]>({
    queryKey: ["settings", "departments"],
    queryFn: async () => (await api.get("/api/settings/departments")).data.data,
    enabled: isUniversity,
  });

  const selectedClass = classes?.find((c) => c.id === classId);

  const filterParams = {
    search: search || undefined,
    class_id: classId || undefined,
    section_id: sectionId || undefined,
    group_id: groupId || undefined,
    status: status || undefined,
    gender: gender || undefined,
    program_id: isUniversity ? programId || undefined : undefined,
    department_id: isUniversity ? departmentId || undefined : undefined,
  };

  const { data } = useQuery({
    queryKey: ["students", { ...filterParams, page }],
    queryFn: async () => (await api.get("/api/students", { params: { ...filterParams, page, limit: 20 } })).data,
  });

  const students: StudentRow[] = data?.data ?? [];
  const meta = data?.meta;

  async function downloadExcel() {
    const res = await api.get("/api/students/export", { params: filterParams, responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Students.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageWrapper>
      <PageHeader
        title={t("title")}
        subtitle={meta ? t("total", { count: meta.total }) : undefined}
        breadcrumbs={[{ label: t("title") }]}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadExcel}>{t("exportExcel")}</Button>
            <Link href="/students/bulk-import">
              <Button variant="outline">{t("bulkImport")}</Button>
            </Link>
            <Link href="/students/new">
              <Button>{t("addStudent")}</Button>
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap gap-3">
        <Input placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />

        {isUniversity && (
          <>
            <Select value={departmentId || "all"} onValueChange={(v) => setDepartmentId(v === "all" ? "" : v)}>
              <SelectTrigger className="w-48"><SelectValue placeholder={t("allDepartments")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allDepartments")}</SelectItem>
                {departments?.map((d) => <SelectItem key={d.id} value={d.id}>{d.name_en}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={programId || "all"} onValueChange={(v) => setProgramId(v === "all" ? "" : v)}>
              <SelectTrigger className="w-48"><SelectValue placeholder={t("allPrograms")} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allPrograms")}</SelectItem>
                {programs?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name_en}</SelectItem>)}
              </SelectContent>
            </Select>
          </>
        )}

        <Select value={classId || "all"} onValueChange={(v) => { setClassId(v === "all" ? "" : v); setSectionId(""); setGroupId(""); }}>
          <SelectTrigger className="w-48"><SelectValue placeholder={t("allClasses")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allClasses")}</SelectItem>
            {classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={sectionId || "all"} onValueChange={(v) => setSectionId(v === "all" ? "" : v)}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t("allSections")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allSections")}</SelectItem>
            {selectedClass?.sections?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>

        {!!selectedClass?.groups?.length && (
          <Select value={groupId || "all"} onValueChange={(v) => setGroupId(v === "all" ? "" : v)}>
            <SelectTrigger className="w-40"><SelectValue placeholder={t("allGroups")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allGroups")}</SelectItem>
              {selectedClass.groups.map((g) => <SelectItem key={g.id} value={g.id}>{g.name_en}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <Select value={status || "all"} onValueChange={(v) => setStatus(v === "all" ? "" : v)}>
          <SelectTrigger className="w-36"><SelectValue placeholder={t("allStatus")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allStatus")}</SelectItem>
            <SelectItem value="ACTIVE">{t("statusActive")}</SelectItem>
            <SelectItem value="INACTIVE">{t("statusInactive")}</SelectItem>
            <SelectItem value="TRANSFERRED">{t("statusTransferred")}</SelectItem>
            <SelectItem value="GRADUATED">{t("statusGraduated")}</SelectItem>
            <SelectItem value="EXPELLED">{t("statusExpelled")}</SelectItem>
          </SelectContent>
        </Select>

        <Select value={gender || "all"} onValueChange={(v) => setGender(v === "all" ? "" : v)}>
          <SelectTrigger className="w-32"><SelectValue placeholder={t("allGender")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allGender")}</SelectItem>
            <SelectItem value="MALE">{t("genderMale")}</SelectItem>
            <SelectItem value="FEMALE">{t("genderFemale")}</SelectItem>
            <SelectItem value="OTHER">{t("genderOther")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {!students.length && <EmptyState title={t("noStudentsFound")} description={t("noStudentsHint")} />}

      <Card>
        <CardContent className="pt-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="p-2">{t("colUid")}</th>
                <th className="p-2">{t("colName")}</th>
                <th className="p-2">{terms.term_class} / {terms.term_section}</th>
                <th className="p-2">{t("colRoll")}</th>
                <th className="p-2">{t("colGuardianPhone")}</th>
                <th className="p-2">{t("colStatus")}</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => (
                <tr key={s.id} className="border-b hover:bg-accent/40">
                  <td className="p-2 font-mono text-xs">{s.student_uid}</td>
                  <td className="p-2">
                    <div className="font-medium">{s.name_en}</div>
                    {s.name_bn && <div className="text-xs text-muted-foreground">{s.name_bn}</div>}
                  </td>
                  <td className="p-2">{s.current_class?.name_en} {s.current_section && `· ${s.current_section.name}`} {s.group && `· ${s.group.name_en}`}</td>
                  <td className="p-2">{s.current_roll_no ?? "—"}</td>
                  <td className="p-2">{s.guardian?.phone ?? "—"}</td>
                  <td className="p-2"><StatusBadge status={s.status} /></td>
                  <td className="p-2">
                    <Link href={`/students/${s.id}`} className="text-primary hover:underline">
                      {t("view")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {meta && meta.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t("previous")}</Button>
              <span className="text-sm text-muted-foreground">{t("pageOf", { page: meta.page, totalPages: meta.totalPages })}</span>
              <Button size="sm" variant="outline" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>{t("next")}</Button>
            </div>
          )}
        </CardContent>
      </Card>
    </PageWrapper>
  );
}
