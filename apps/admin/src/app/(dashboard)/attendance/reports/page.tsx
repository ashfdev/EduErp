"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  PageWrapper, PageHeader, Card, CardContent, Button, Input, Badge, StatusBadge, EmptyState, ErrorState, LoadingSpinner, extractErrorMessage,
  Tabs, TabsList, TabsTrigger, TabsContent,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@education-erp/ui";
import { api } from "@/lib/api";
import { ReportDownloadMenu } from "@/components/reports/report-download-menu";

interface ClassOption {
  id: string;
  name_en: string;
  is_active: boolean;
  sections: { id: string; name: string; is_active: boolean }[];
}
interface YearOption {
  id: string;
  label: string;
  is_active: boolean;
}
type Status = "PRESENT" | "ABSENT" | "LATE" | "LEAVE" | "HALF_DAY" | "UNMARKED";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAY = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const CODE: Record<Exclude<Status, "UNMARKED">, string> = { PRESENT: "P", ABSENT: "A", LATE: "L", LEAVE: "LV", HALF_DAY: "H" };
const CELL_STYLE: Record<Exclude<Status, "UNMARKED">, string> = {
  PRESENT: "text-emerald-700",
  ABSENT: "bg-red-100 font-semibold text-red-700",
  LATE: "bg-amber-100 text-amber-700",
  LEAVE: "bg-slate-100 text-slate-500",
  HALF_DAY: "bg-amber-50 text-amber-700",
};
const RULE_NOTE = "Attendance % = Present ÷ days marked (Late, Leave and Half day count as not present — the same rule used for promotion).";

function percent(present: number, marked: number) {
  return marked ? Math.round((present / marked) * 1000) / 10 : null;
}

export default function AttendanceReportsPage() {
  const { data: years } = useQuery<YearOption[]>({
    queryKey: ["settings", "academic-years"],
    queryFn: async () => (await api.get("/api/settings/academic-years")).data.data,
  });
  const [selectedYearId, setSelectedYearId] = useState("");
  // Classes are recreated every academic year, so scope every picker to one year (the active one by default).
  const yearId = selectedYearId || years?.find((y) => y.is_active)?.id || years?.[0]?.id || "";
  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes", yearId],
    queryFn: async () => (await api.get("/api/settings/classes", { params: { academic_year_id: yearId } })).data.data,
    enabled: !!yearId,
  });
  const activeClasses = (classes ?? []).filter((c) => c.is_active);

  return (
    <PageWrapper>
      <PageHeader
        title="Attendance Reports"
        subtitle="View on screen, or download any report as Excel or a print-ready PDF"
        breadcrumbs={[{ label: "Attendance", href: "/attendance/mark" }, { label: "Reports" }]}
        action={
          <Select value={yearId} onValueChange={setSelectedYearId}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Academic year" /></SelectTrigger>
            <SelectContent>
              {years?.map((y) => <SelectItem key={y.id} value={y.id}>{y.label}{y.is_active ? " (active)" : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />
      <Tabs defaultValue="register" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="register">Daily Register</TabsTrigger>
          <TabsTrigger value="monthly">Monthly Sheet</TabsTrigger>
          <TabsTrigger value="defaulters">Defaulters</TabsTrigger>
          <TabsTrigger value="summary">Monthly Summary</TabsTrigger>
        </TabsList>
        <TabsContent value="register"><DailyRegisterTab classes={activeClasses} /></TabsContent>
        <TabsContent value="monthly"><MonthlySheetTab classes={activeClasses} /></TabsContent>
        <TabsContent value="defaulters"><DefaultersTab classes={activeClasses} /></TabsContent>
        <TabsContent value="summary"><MonthlySummaryTab classes={activeClasses} yearId={yearId} /></TabsContent>
      </Tabs>
    </PageWrapper>
  );
}

function FilterBar({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-end justify-between gap-3 pt-6">
        <div className="flex flex-wrap items-end gap-3">{children}</div>
        {action}
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted-foreground">
      {label}
      {children}
    </label>
  );
}

function ClassSectionFields({
  classes,
  classId,
  sectionId,
  onChange,
  allowAll,
}: {
  classes: ClassOption[];
  classId: string;
  sectionId: string;
  onChange: (classId: string, sectionId: string) => void;
  allowAll?: boolean;
}) {
  const sections = classes.find((c) => c.id === classId)?.sections.filter((s) => s.is_active) ?? [];
  return (
    <>
      <Field label="Class">
        <Select value={classId || (allowAll ? "all" : undefined)} onValueChange={(v) => onChange(v === "all" ? "" : v, "")}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Select class" /></SelectTrigger>
          <SelectContent>
            {allowAll && <SelectItem value="all">All classes</SelectItem>}
            {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Section">
        <Select value={sectionId || (allowAll ? "all" : undefined)} onValueChange={(v) => onChange(classId, v === "all" ? "" : v)} disabled={!classId}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Select section" /></SelectTrigger>
          <SelectContent>
            {allowAll && <SelectItem value="all">All sections</SelectItem>}
            {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
    </>
  );
}

function MonthYearFields({ month, year, onChange }: { month: number; year: number; onChange: (month: number, year: number) => void }) {
  const thisYear = new Date().getFullYear();
  return (
    <>
      <Field label="Month">
        <Select value={String(month)} onValueChange={(v) => onChange(Number(v), year)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field label="Year">
        <Select value={String(year)} onValueChange={(v) => onChange(month, Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[thisYear - 2, thisYear - 1, thisYear, thisYear + 1].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
    </>
  );
}

function StatChips({ items }: { items: { label: string; value: string | number; tone?: "good" | "bad" | "warn" }[] }) {
  const tone = { good: "text-emerald-700", bad: "text-red-700", warn: "text-amber-700" };
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((s) => (
        <div key={s.label} className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s.label}</p>
          <p className={`mt-1 text-xl font-bold ${s.tone ? tone[s.tone] : ""}`}>{s.value}</p>
        </div>
      ))}
    </div>
  );
}

function Prompt({ text }: { text: string }) {
  return <EmptyState title={text} />;
}

function DailyRegisterTab({ classes }: { classes: ClassOption[] }) {
  const [date, setDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const params = { date, class_id: classId, section_id: sectionId };
  const ready = !!sectionId && !!date;

  const { data, isLoading, isError, error, refetch } = useQuery<{
    class?: string; section?: string; shift?: string; teacher?: string;
    rows: { roll_no: string | null; student_uid: string; name_en: string; status: Status; check_in_at: string | null }[];
  }>({
    queryKey: ["attendance", "reports", "daily-register", params],
    queryFn: async () => (await api.get("/api/attendance/reports/daily-register", { params })).data.data,
    enabled: ready,
  });
  const count = (s: Status) => data?.rows.filter((r) => r.status === s).length ?? 0;
  const marked = (data?.rows.length ?? 0) - count("UNMARKED");

  return (
    <div className="space-y-4">
      <FilterBar action={<ReportDownloadMenu endpoint="/api/attendance/reports/daily-register/export" params={params} fileName="Attendance Register" disabled={!ready} />}>
        <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" /></Field>
        <ClassSectionFields classes={classes} classId={classId} sectionId={sectionId} onChange={(c, s) => { setClassId(c); setSectionId(s); }} />
      </FilterBar>
      {!ready && <Prompt text="Choose a class and section to see the day's register" />}
      {ready && isLoading && <div className="flex justify-center py-8"><LoadingSpinner /></div>}
      {isError && <ErrorState title="Failed to load daily register" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />}
      {ready && data && (
        <>
          <StatChips
            items={[
              { label: "Students", value: data.rows.length },
              { label: "Present", value: count("PRESENT"), tone: "good" },
              { label: "Absent", value: count("ABSENT"), tone: count("ABSENT") ? "bad" : undefined },
              { label: "Late", value: count("LATE"), tone: count("LATE") ? "warn" : undefined },
              { label: "Not marked", value: count("UNMARKED"), tone: count("UNMARKED") ? "warn" : undefined },
              { label: "Attendance", value: percent(count("PRESENT"), marked) === null ? "—" : `${percent(count("PRESENT"), marked)}%` },
            ]}
          />
          <Card>
            <CardContent className="pt-6">
              <p className="mb-3 text-sm text-muted-foreground">
                {data.class} · Section {data.section} · {data.shift ?? "No shift"} · Class teacher: {data.teacher ?? "—"}
              </p>
              {data.rows.length ? (
                <Table>
                  <TableHeader>
                    <TableRow><TableHead className="w-16">Roll</TableHead><TableHead>Name</TableHead><TableHead>Student ID</TableHead><TableHead>Status</TableHead><TableHead>Check-in</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map((r) => (
                      <TableRow key={r.student_uid}>
                        <TableCell>{r.roll_no ?? "—"}</TableCell>
                        <TableCell className="font-medium">{r.name_en}</TableCell>
                        <TableCell className="font-mono text-xs">{r.student_uid}</TableCell>
                        <TableCell>{r.status === "UNMARKED" ? <Badge variant="outline">Not marked</Badge> : <StatusBadge status={r.status} />}</TableCell>
                        <TableCell className="text-muted-foreground">{r.check_in_at ? format(new Date(r.check_in_at), "hh:mm a") : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <EmptyState title="No active students in this section" />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function MonthlySheetTab({ classes }: { classes: ClassOption[] }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const params = { class_id: classId, section_id: sectionId, month, year };
  const ready = !!sectionId;

  const { data, isLoading, isError, error, refetch } = useQuery<{
    threshold: number;
    days_in_month: number;
    days_held: number;
    students: { roll_no: string | null; student_uid: string; name_en: string; days: Record<number, Exclude<Status, "UNMARKED">> }[];
  }>({
    queryKey: ["attendance", "reports", "monthly", params],
    queryFn: async () => (await api.get("/api/attendance/reports/monthly-sheet", { params })).data.data,
    enabled: ready,
  });

  const rows = (data?.students ?? []).map((s) => {
    const statuses = Object.values(s.days);
    const present = statuses.filter((v) => v === "PRESENT").length;
    return { ...s, present, absent: statuses.filter((v) => v === "ABSENT").length, pct: percent(present, statuses.length) };
  });
  const withPct = rows.filter((r) => r.pct !== null);
  const average = withPct.length ? Math.round((withPct.reduce((n, r) => n + (r.pct ?? 0), 0) / withPct.length) * 10) / 10 : null;

  return (
    <div className="space-y-4">
      <FilterBar action={<ReportDownloadMenu endpoint="/api/attendance/reports/monthly-sheet/export" params={params} fileName="Monthly Attendance" disabled={!ready} />}>
        <MonthYearFields month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
        <ClassSectionFields classes={classes} classId={classId} sectionId={sectionId} onChange={(c, s) => { setClassId(c); setSectionId(s); }} />
      </FilterBar>
      {!ready && <Prompt text="Choose a class and section to see the month's attendance grid" />}
      {ready && isLoading && <div className="flex justify-center py-8"><LoadingSpinner /></div>}
      {isError && <ErrorState title="Failed to load monthly sheet" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />}
      {ready && data && (
        <>
          <StatChips
            items={[
              { label: "Students", value: rows.length },
              { label: "Days held", value: data.days_held },
              { label: "Average attendance", value: average === null ? "—" : `${average}%`, tone: average === null ? undefined : average < data.threshold ? "bad" : "good" },
              { label: "Absences", value: rows.reduce((n, r) => n + r.absent, 0), tone: "bad" },
            ]}
          />
          <Card>
            <CardContent className="overflow-x-auto pt-6">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="sticky left-0 z-10 bg-card px-2 py-2 text-left font-semibold">Name</th>
                    {Array.from({ length: data.days_in_month }, (_, i) => (
                      <th key={i} className="min-w-[28px] px-0.5 py-2 text-center font-semibold leading-tight">
                        {i + 1}
                        <br />
                        <span className="font-medium">{WEEKDAY[new Date(year, month - 1, i + 1).getDay()]}</span>
                      </th>
                    ))}
                    <th className="px-2 py-2 text-right font-semibold">P</th>
                    <th className="px-2 py-2 text-right font-semibold">A</th>
                    <th className="px-2 py-2 text-right font-semibold">%</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.student_uid} className="border-t">
                      <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-2 py-1.5 font-medium">
                        <span className="mr-2 text-muted-foreground">{s.roll_no ?? "—"}</span>
                        {s.name_en}
                      </td>
                      {Array.from({ length: data.days_in_month }, (_, d) => {
                        const status = s.days[d + 1];
                        return (
                          <td key={d} className={`px-0.5 py-1.5 text-center ${status ? CELL_STYLE[status] : ""}`}>
                            {status ? CODE[status] : ""}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 text-right">{s.present}</td>
                      <td className="px-2 py-1.5 text-right">{s.absent}</td>
                      <td className={`px-2 py-1.5 text-right font-semibold ${s.pct !== null && s.pct < data.threshold ? "text-red-700" : ""}`}>{s.pct === null ? "—" : `${s.pct}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-muted-foreground">P = Present, A = Absent, L = Late, LV = Leave, H = Half day. {RULE_NOTE}</p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function DefaultersTab({ classes }: { classes: ClassOption[] }) {
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [threshold, setThreshold] = useState("");
  const [submitted, setSubmitted] = useState<Record<string, string | undefined> | null>(null);
  const params = { class_id: classId || undefined, section_id: sectionId || undefined, threshold: threshold || undefined };

  const { data, isLoading, isError, error, refetch } = useQuery<{
    id: string; student_uid: string; name_en: string; attendance_percentage: number; present_days: number; total_days: number;
    current_class?: { name_en: string } | null; current_section?: { name: string } | null; guardian?: { phone: string } | null; father_phone?: string | null;
  }[]>({
    queryKey: ["attendance", "defaulters", submitted],
    queryFn: async () => (await api.get("/api/attendance/defaulters", { params: submitted })).data.data,
    enabled: !!submitted,
  });

  return (
    <div className="space-y-4">
      <FilterBar
        action={
          <div className="flex gap-2">
            <Button onClick={() => setSubmitted(params)}>Find defaulters</Button>
            <ReportDownloadMenu endpoint="/api/attendance/defaulters/export" params={params} fileName="Attendance Defaulters" />
          </div>
        }
      >
        <ClassSectionFields classes={classes} classId={classId} sectionId={sectionId} onChange={(c, s) => { setClassId(c); setSectionId(s); }} allowAll />
        <Field label="Below (%)">
          <Input type="number" min={1} max={100} placeholder="From settings" value={threshold} onChange={(e) => setThreshold(e.target.value)} className="w-32" />
        </Field>
      </FilterBar>
      {!submitted && <Prompt text="Pick a class (or all) and press Find defaulters" />}
      {submitted && isLoading && <div className="flex justify-center py-8"><LoadingSpinner /></div>}
      {isError && <ErrorState title="Failed to load defaulters" description={extractErrorMessage(error)} retryLabel="Retry" onRetry={() => refetch()} />}
      {data && !data.length && <EmptyState title="No students are below the attendance minimum" />}
      {data && data.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Student ID</TableHead><TableHead>Name</TableHead><TableHead>Class</TableHead><TableHead>Guardian phone</TableHead><TableHead className="text-right">Present / held</TableHead><TableHead className="text-right">Attendance</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {data.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-xs">{d.student_uid}</TableCell>
                    <TableCell className="font-medium">{d.name_en}</TableCell>
                    <TableCell>{d.current_class?.name_en}{d.current_section ? ` · ${d.current_section.name}` : ""}</TableCell>
                    <TableCell>{d.guardian?.phone ?? d.father_phone ?? "—"}</TableCell>
                    <TableCell className="text-right">{d.present_days} / {d.total_days}</TableCell>
                    <TableCell className="text-right font-semibold text-red-700">{d.attendance_percentage}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">Based on subject-wise (period) attendance, the same figure shown on marksheets.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MonthlySummaryTab({ classes, yearId }: { classes: ClassOption[]; yearId: string }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [classId, setClassId] = useState("");
  const params = { academic_year_id: yearId, month, year, class_id: classId || undefined };

  return (
    <div className="space-y-4">
      <FilterBar action={<ReportDownloadMenu endpoint="/api/attendance/reports/bulk-export" params={params} fileName="Attendance Summary" disabled={!yearId} />}>
        <MonthYearFields month={month} year={year} onChange={(m, y) => { setMonth(m); setYear(y); }} />
        <Field label="Class">
          <Select value={classId || "all"} onValueChange={(v) => setClassId(v === "all" ? "" : v)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All classes</SelectItem>
              {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name_en}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </FilterBar>
      <Card>
        <CardContent className="space-y-2 pt-6 text-sm text-muted-foreground">
          <p className="font-semibold text-foreground">Monthly summary for every student</p>
          <p>
            One page (or Excel sheet) per class, listing each student&apos;s present, absent, late and leave days for the month, their attendance %
            and the class average. Students below the minimum are highlighted in red.
          </p>
          <p className="text-xs">{RULE_NOTE}</p>
        </CardContent>
      </Card>
    </div>
  );
}
