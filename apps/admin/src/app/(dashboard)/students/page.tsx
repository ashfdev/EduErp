"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, Input, StatusBadge, EmptyState, Badge,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  ErrorState, LoadingSpinner, extractErrorMessage,
} from "@education-erp/ui";
import { MoreHorizontal } from "lucide-react";
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
  _count: { documents: number };
  is_historical?: boolean;
  historical_year_label?: string;
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
interface AcademicYearOption {
  id: string;
  label: string;
}

export default function StudentsPage() {
  const t = useTranslations("students");
  const router = useRouter();
  const { type, terms } = useInstitution();
  const isUniversity = type === "UNIVERSITY";

  const searchParams = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");

  // Re-syncs from the URL on every navigation to this page, not just the
  // initial mount — without this, a second `?search=` navigation while
  // already on /students (e.g. an external link, not just the old header
  // search box) silently left the search box/results stuck on the first
  // term (Plan Fifteen, Phase C).
  useEffect(() => {
    const fromUrl = searchParams.get("search") ?? "";
    setSearch(fromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const [classId, setClassId] = useState<string>("");
  const [sectionId, setSectionId] = useState<string>("");
  const [groupId, setGroupId] = useState<string>("");
  // Default to ACTIVE, not "All Status" — otherwise graduated/transferred/
  // expelled students show up mixed into ordinary class browsing. "All
  // Status" (and each individual status) stays one click away.
  const [status, setStatus] = useState<string>("ACTIVE");
  const [gender, setGender] = useState<string>("");
  const [programId, setProgramId] = useState<string>("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [academicYearId, setAcademicYearId] = useState<string>("");
  const [page, setPage] = useState(1);

  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes", academicYearId],
    // Class rows are recreated every academic year, so an unscoped list
    // would let staff pick a stale prior-year Class row (or, for a
    // historical Session lookup, the wrong year's classes entirely) — scope
    // to the selected Session exactly like examination/new/page.tsx's Clone
    // tab already does, falling back to every class when no Session is
    // picked (unchanged default behavior).
    queryFn: async () => (await api.get("/api/settings/classes", { params: { academic_year_id: academicYearId || undefined } })).data.data,
  });
  const { data: academicYears } = useQuery<AcademicYearOption[]>({
    queryKey: ["settings", "academic-years"],
    queryFn: async () => (await api.get("/api/settings/academic-years")).data.data,
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
    academic_year_id: academicYearId || undefined,
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
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
            <Link href="/students/promote">
              <Button variant="outline">Promote Students</Button>
            </Link>
            <Link href="/students/bulk-login">
              <Button variant="outline">Bulk Create Logins</Button>
            </Link>
            <Link href="/students/new">
              <Button>{t("addStudent")}</Button>
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap gap-3">
        <Input placeholder={t("searchPlaceholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />

        <Select value={academicYearId || "all"} onValueChange={(v) => setAcademicYearId(v === "all" ? "" : v)}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t("allSessions")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("allSessions")}</SelectItem>
            {academicYears?.map((y) => <SelectItem key={y.id} value={y.id}>{y.label}</SelectItem>)}
          </SelectContent>
        </Select>

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

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : isError ? (
        <ErrorState title="Failed to load students" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />
      ) : (
        <>
          {!!students.length && students[0]?.is_historical && (
            <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Showing historical placement for <strong>{students[0].historical_year_label}</strong> — this was each student&apos;s class/section
              in that past session, not necessarily their current one.
            </div>
          )}

          {!students.length && <EmptyState title={t("noStudentsFound")} description={t("noStudentsHint")} />}

          <Card>
            <CardContent className="pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>{t("colUid")}</TableHead>
                    <TableHead>{t("colName")}</TableHead>
                    <TableHead>{terms.term_class} / {terms.term_section}</TableHead>
                    <TableHead>{t("colRoll")}</TableHead>
                    <TableHead>{t("colGuardianPhone")}</TableHead>
                    <TableHead>{t("colStatus")}</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {students.map((s) => (
                    <TableRow key={s.id} className="cursor-pointer" onClick={() => router.push(`/students/${s.id}`)}>
                      <TableCell>
                        {s.photo_url ? (
                          <img src={s.photo_url} alt="" className="h-7 w-7 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
                            {s.name_en.charAt(0)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-[11px]">{s.student_uid}</TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {s.name_en}
                          {s._count.documents === 0 && <Badge variant="warning" className="ml-2">No documents</Badge>}
                        </div>
                        {s.name_bn && <div className="text-[11px] text-muted-foreground">{s.name_bn}</div>}
                      </TableCell>
                      <TableCell>{s.current_class?.name_en} {s.current_section && `· ${s.current_section.name}`} {s.group && `· ${s.group.name_en}`}</TableCell>
                      <TableCell>{s.current_roll_no ?? "—"}</TableCell>
                      <TableCell>{s.guardian?.phone ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={s.status} /></TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link href={`/students/${s.id}`}>{t("view")}</Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/students/${s.id}/edit`}>{t("edit")}</Link>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {meta && meta.totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t("previous")}</Button>
                  <span className="text-sm text-muted-foreground">{t("pageOf", { page: meta.page, totalPages: meta.totalPages })}</span>
                  <Button size="sm" variant="outline" disabled={page >= meta.totalPages} onClick={() => setPage((p) => p + 1)}>{t("next")}</Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </PageWrapper>
  );
}
