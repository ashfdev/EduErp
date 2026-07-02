"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageWrapper, PageHeader, Card, CardContent, Button, Input, Tabs, TabsList, TabsTrigger, TabsContent, StatusBadge, EmptyState } from "@education-erp/ui";
import { api } from "@/lib/api";

interface ClassOption {
  id: string;
  name_en: string;
  sections: { id: string; name: string }[];
}

export default function AttendanceReportsPage() {
  const { data: classes } = useQuery<ClassOption[]>({
    queryKey: ["settings", "classes"],
    queryFn: async () => (await api.get("/api/settings/classes")).data.data,
  });

  return (
    <PageWrapper>
      <PageHeader title="Attendance Reports" breadcrumbs={[{ label: "Attendance" }, { label: "Reports" }]} />
      <Tabs defaultValue="register">
        <TabsList>
          <TabsTrigger value="register">Daily Register</TabsTrigger>
          <TabsTrigger value="monthly">Monthly Sheet</TabsTrigger>
          <TabsTrigger value="defaulters">Defaulters</TabsTrigger>
          <TabsTrigger value="export">Bulk Export</TabsTrigger>
        </TabsList>

        <TabsContent value="register"><DailyRegisterTab classes={classes} /></TabsContent>
        <TabsContent value="monthly"><MonthlySheetTab classes={classes} /></TabsContent>
        <TabsContent value="defaulters"><DefaultersTab classes={classes} /></TabsContent>
        <TabsContent value="export"><BulkExportTab classes={classes} /></TabsContent>
      </Tabs>
    </PageWrapper>
  );
}

function DailyRegisterTab({ classes }: { classes?: ClassOption[] }) {
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [enabled, setEnabled] = useState(false);
  const selectedClass = classes?.find((c) => c.id === classId);

  const { data } = useQuery({
    queryKey: ["attendance", "reports", "daily-register", classId, sectionId, date],
    queryFn: async () => (await api.get("/api/attendance/reports/daily-register", { params: { class_id: classId, section_id: sectionId, date } })).data.data,
    enabled,
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
        <select className="rounded-md border px-3 py-2 text-sm" value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(""); }}>
          <option value="">Class...</option>
          {classes?.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
        </select>
        <select className="rounded-md border px-3 py-2 text-sm" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
          <option value="">Section...</option>
          {selectedClass?.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <Button size="sm" disabled={!sectionId} onClick={() => setEnabled(true)}>Generate</Button>
      </div>
      {data && (
        <Card>
          <CardContent className="pt-6">
            <p className="mb-2 text-sm text-muted-foreground">{data.class} · {data.section} · {data.shift ?? "No shift"} · Teacher: {data.teacher ?? "—"}</p>
            <table className="w-full text-sm">
              <tbody>
                {data.rows.map((r: { roll_no: string; name_en: string; status: string }, i: number) => (
                  <tr key={i} className="border-b"><td className="p-1">{r.roll_no}</td><td className="p-1">{r.name_en}</td><td className="p-1"><StatusBadge status={r.status} /></td></tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MonthlySheetTab({ classes }: { classes?: ClassOption[] }) {
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [enabled, setEnabled] = useState(false);
  const selectedClass = classes?.find((c) => c.id === classId);

  const { data } = useQuery({
    queryKey: ["attendance", "reports", "monthly", classId, sectionId, month, year],
    queryFn: async () => (await api.get("/api/attendance/reports/monthly-sheet", { params: { class_id: classId, section_id: sectionId, month, year } })).data.data,
    enabled,
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Input type="number" value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-20" />
        <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24" />
        <select className="rounded-md border px-3 py-2 text-sm" value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(""); }}>
          <option value="">Class...</option>
          {classes?.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
        </select>
        <select className="rounded-md border px-3 py-2 text-sm" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
          <option value="">Section...</option>
          {selectedClass?.sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <Button size="sm" disabled={!sectionId} onClick={() => setEnabled(true)}>Generate</Button>
      </div>
      {data && (
        <Card>
          <CardContent className="overflow-x-auto pt-6">
            <table className="text-xs">
              <thead>
                <tr>
                  <th className="p-1 text-left">Name</th>
                  {Array.from({ length: data.days_in_month }, (_, i) => <th key={i} className="p-1">{i + 1}</th>)}
                </tr>
              </thead>
              <tbody>
                {data.students.map((s: { name_en: string; days: Record<number, string> }, i: number) => (
                  <tr key={i}>
                    <td className="p-1">{s.name_en}</td>
                    {Array.from({ length: data.days_in_month }, (_, d) => (
                      <td key={d} className="p-1 text-center">{s.days[d + 1]?.[0] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DefaultersTab({ classes }: { classes?: ClassOption[] }) {
  const [classId, setClassId] = useState("");
  const [threshold, setThreshold] = useState(75);
  const [enabled, setEnabled] = useState(false);

  const { data } = useQuery({
    queryKey: ["attendance", "defaulters", classId, threshold],
    queryFn: async () => (await api.get("/api/attendance/defaulters", { params: { class_id: classId || undefined, threshold } })).data.data,
    enabled,
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <select className="rounded-md border px-3 py-2 text-sm" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">All Classes</option>
          {classes?.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
        </select>
        <Input type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} className="w-24" />
        <Button size="sm" onClick={() => setEnabled(true)}>Find Defaulters</Button>
      </div>
      {data && !data.length && <EmptyState title="No defaulters found" />}
      {data && data.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <table className="w-full text-sm">
              <tbody>
                {data.map((d: { id: string; student_uid: string; name_en: string; attendance_percentage: number; current_class?: { name_en: string } }) => (
                  <tr key={d.id} className="border-b">
                    <td className="p-1 font-mono text-xs">{d.student_uid}</td>
                    <td className="p-1">{d.name_en}</td>
                    <td className="p-1">{d.current_class?.name_en}</td>
                    <td className="p-1 text-red-600">{d.attendance_percentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function BulkExportTab({ classes }: { classes?: ClassOption[] }) {
  const [classId, setClassId] = useState("");
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const { data: years } = useQuery<{ id: string; label: string; is_active: boolean }[]>({
    queryKey: ["settings", "academic-years"],
    queryFn: async () => (await api.get("/api/settings/academic-years")).data.data,
  });
  const activeYear = years?.find((y) => y.is_active) ?? years?.[0];

  async function download() {
    const res = await api.get("/api/attendance/reports/bulk-export", {
      params: { academic_year_id: activeYear?.id, month, year, class_id: classId || undefined },
      responseType: "blob",
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Attendance_${month}_${year}.xlsx`;
    a.click();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Input type="number" value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-20" />
        <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24" />
        <select className="rounded-md border px-3 py-2 text-sm" value={classId} onChange={(e) => setClassId(e.target.value)}>
          <option value="">All Classes</option>
          {classes?.map((c) => <option key={c.id} value={c.id}>{c.name_en}</option>)}
        </select>
        <Button size="sm" disabled={!activeYear} onClick={download}>Generate Excel</Button>
      </div>
    </div>
  );
}
